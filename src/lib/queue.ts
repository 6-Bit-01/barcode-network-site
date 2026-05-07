// ============================================================
// BARCODE RADIO QUEUE OPERATIONS — Upstash Redis + memory fallback
// ============================================================

import { Redis } from "@upstash/redis";
import {
  INTERNAL_BUFFER_DURATION_SECONDS,
  RADIO_QUEUE_CAPACITY,
  detectQueueSourceType,
  generateQueueId,
  getTrackRuntimeSeconds,
  normalizeTier,
} from "./queue-types";
import type { QueueEntry, QueueLane, QueuePublicStatus, QueueSourceType, QueueState, QueueTier } from "./queue-types";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const STATE_KEY = "radioQueue:v1:state";

interface StoredQueueState {
  queue: QueueEntry[];
  completed: QueueEntry[];
  removed: QueueEntry[];
  spotlight: QueueEntry[];
  isOpen: boolean;
}

const mem: StoredQueueState = {
  queue: [],
  completed: [],
  removed: [],
  spotlight: [],
  isOpen: true,
};

function laneRank(lane: QueueLane | undefined): number {
  if (lane === "priority") return 0;
  if (lane === "wheel") return 1;
  return 2;
}

function sortActive(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => laneRank(a.lane) - laneRank(b.lane) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function publicStatus(state: StoredQueueState): QueuePublicStatus {
  const active = state.queue.filter((entry) => entry.status === "queued" || entry.status === "playing");
  const estimatedRuntimeSeconds = active.reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0);
  const load = active.length / RADIO_QUEUE_CAPACITY;
  const pressure: QueuePublicStatus["pressure"] = load >= 1 ? "max" : load >= 0.75 ? "high" : load >= 0.4 ? "medium" : "low";
  return {
    isOpen: state.isOpen,
    activeCount: active.length,
    estimatedRuntimeSeconds,
    capacity: RADIO_QUEUE_CAPACITY,
    pressure,
  };
}

async function readStoredState(): Promise<StoredQueueState> {
  const redis = getRedis();
  if (!redis) return mem;
  const raw = await redis.get<StoredQueueState | string>(STATE_KEY);
  if (!raw) return { queue: [], completed: [], removed: [], spotlight: [], isOpen: true };
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return {
    queue: Array.isArray(parsed.queue) ? parsed.queue : [],
    completed: Array.isArray(parsed.completed) ? parsed.completed : [],
    removed: Array.isArray(parsed.removed) ? parsed.removed : [],
    spotlight: Array.isArray(parsed.spotlight) ? parsed.spotlight : [],
    isOpen: parsed.isOpen !== false,
  };
}

async function writeStoredState(state: StoredQueueState): Promise<void> {
  const normalized = { ...state, queue: sortActive(state.queue) };
  const redis = getRedis();
  if (!redis) {
    mem.queue = normalized.queue;
    mem.completed = normalized.completed;
    mem.removed = normalized.removed;
    mem.spotlight = normalized.spotlight;
    mem.isOpen = normalized.isOpen;
    return;
  }
  await redis.set(STATE_KEY, JSON.stringify(normalized));
}

export function createQueueTrack(input: {
  artist: string;
  title: string;
  link?: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  sourceType?: QueueSourceType;
  detectedDurationSeconds?: number | null;
}): QueueEntry {
  const sourceType = input.sourceType ?? (input.fileUrl ? "upload" : detectQueueSourceType(input.link ?? ""));
  const detected = typeof input.detectedDurationSeconds === "number" && Number.isFinite(input.detectedDurationSeconds)
    ? Math.max(1, Math.round(input.detectedDurationSeconds))
    : null;

  return {
    id: generateQueueId(),
    artist: input.artist,
    title: input.title,
    link: input.fileUrl || input.link || "",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    status: "queued",
    createdAt: new Date().toISOString(),
    playedAt: null,
    completedAt: null,
    removedAt: null,
    spotlightedAt: null,
    fileUrl: input.fileUrl ?? null,
    fileName: input.fileName ?? null,
    fileSize: input.fileSize ?? null,
    mimeType: input.mimeType ?? null,
    sourceType,
    detectedDurationSeconds: detected,
    estimatedDurationSeconds: detected ?? INTERNAL_BUFFER_DURATION_SECONDS,
    durationIsEstimate: detected === null,
  };
}

export async function submitRadioTrack(input: Parameters<typeof createQueueTrack>[0]): Promise<QueueEntry> {
  const state = await readStoredState();
  if (!state.isOpen) throw new Error("Queue is closed");
  const track = createQueueTrack(input);
  state.queue.push(track);
  await writeStoredState(state);
  return track;
}

export async function getRadioQueueState(): Promise<QueueState> {
  const state = await readStoredState();
  const queue = sortActive(state.queue);
  return {
    nowPlaying: queue.find((entry) => entry.status === "playing") ?? null,
    queue,
    history: state.completed,
    totalPlayed: state.completed.length,
    streamStatus: state.isOpen ? "online" : "offline",
    removed: state.removed,
    spotlight: state.spotlight,
    publicStatus: publicStatus({ ...state, queue }),
  };
}

export async function setQueueOpen(isOpen: boolean): Promise<QueuePublicStatus> {
  const state = await readStoredState();
  state.isOpen = isOpen;
  await writeStoredState(state);
  return publicStatus(state);
}

export async function updateRadioTrack(id: string, action: "finish" | "remove" | "priority" | "spotlight"): Promise<QueueState> {
  const state = await readStoredState();
  const index = state.queue.findIndex((entry) => entry.id === id);
  const active = index >= 0 ? state.queue[index] : null;

  if (action === "spotlight") {
    const source = active ?? state.completed.find((entry) => entry.id === id) ?? state.removed.find((entry) => entry.id === id);
    if (source && !state.spotlight.some((entry) => entry.id === source.id)) {
      state.spotlight.push({ ...source, spotlightedAt: new Date().toISOString() });
    }
    await writeStoredState(state);
    return getRadioQueueState();
  }

  if (!active) return getRadioQueueState();

  if (action === "priority") {
    state.queue.splice(index, 1);
    state.queue.push({ ...active, lane: "priority", tier: "fastlane", status: "queued" });
  }

  if (action === "finish") {
    state.queue.splice(index, 1);
    state.completed.unshift({ ...active, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  }

  if (action === "remove") {
    state.queue.splice(index, 1);
    state.removed.unshift({ ...active, status: "removed", removedAt: new Date().toISOString() });
  }

  await writeStoredState(state);
  return getRadioQueueState();
}

// Legacy-compatible helpers used by archived/OBS components.
export async function addToQueue(entry: Omit<QueueEntry, "id" | "status" | "playedAt">): Promise<QueueEntry> {
  const track: QueueEntry = {
    ...entry,
    id: generateQueueId(),
    status: "queued",
    playedAt: null,
    lane: entry.lane ?? (normalizeTier(entry.tier) === "fastlane" ? "priority" : "regular"),
    sourceType: entry.sourceType ?? detectQueueSourceType(entry.link),
    estimatedDurationSeconds: entry.estimatedDurationSeconds ?? entry.detectedDurationSeconds ?? INTERNAL_BUFFER_DURATION_SECONDS,
    durationIsEstimate: entry.detectedDurationSeconds == null,
  };
  const state = await readStoredState();
  state.queue.push(track);
  await writeStoredState(state);
  return track;
}

export async function getQueueState(): Promise<QueueState> {
  return getRadioQueueState();
}

export async function advanceQueue(): Promise<QueueEntry | null> {
  const state = await readStoredState();
  const queue = sortActive(state.queue);
  const next = queue[0] ?? null;
  if (!next) return null;
  state.queue = queue.slice(1);
  state.completed.unshift({ ...next, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  await writeStoredState(state);
  return queue[1] ?? null;
}

export async function resetQueue(): Promise<{ cleared: number; preserved: number }> {
  const state = await readStoredState();
  const cleared = state.queue.length;
  state.queue = [];
  await writeStoredState(state);
  return { cleared, preserved: 0 };
}

export async function getEntry(id: string): Promise<QueueEntry | null> {
  const state = await getRadioQueueState();
  return [...state.queue, ...state.history, ...(state.removed ?? [])].find((entry) => entry.id === id) ?? null;
}

export async function upgradeEntryTier(id: string, newTier: QueueTier, additionalAmount: number): Promise<QueueEntry | null> {
  const state = await readStoredState();
  const index = state.queue.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const updated = { ...state.queue[index], tier: newTier, amount: state.queue[index].amount + additionalAmount, lane: newTier === "fastlane" ? "priority" as QueueLane : state.queue[index].lane };
  state.queue[index] = updated;
  await writeStoredState(state);
  return updated;
}

const stripeSessions = new Map<string, string>();
export async function storeStripeSession(sessionId: string, entryId: string): Promise<void> {
  stripeSessions.set(sessionId, entryId);
}
export async function getStripeSessionEntry(sessionId: string): Promise<string | null> {
  return stripeSessions.get(sessionId) ?? null;
}
