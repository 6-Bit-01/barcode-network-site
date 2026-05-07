// ============================================================
// BARCODE RADIO QUEUE v1 — Redis-backed storage helpers
// ============================================================
// Stores the v1 skeleton as one JSON document in Upstash Redis.
// Falls back to module memory for local development when Redis is absent.
// ============================================================

import { Redis } from "@upstash/redis";
import {
  DEFAULT_FALLBACK_DURATION_SECONDS,
  generateQueueId,
  type QueueAdminAction,
  type QueueRuntimeSummary,
  type QueueState,
  type QueueSubmissionInput,
  type QueueTrack,
  type RadioQueueLane,
} from "./queue-types";

const STATE_KEY = "radio-queue:v1:state";

interface StoredQueueState {
  queueOpen: boolean;
  active: Record<RadioQueueLane, QueueTrack[]>;
  completed: QueueTrack[];
  removed: QueueTrack[];
  spotlight: QueueTrack[];
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function emptyStoredState(): StoredQueueState {
  return {
    queueOpen: true,
    active: { priority: [], wheel: [], regular: [] },
    completed: [],
    removed: [],
    spotlight: [],
  };
}

let mem = emptyStoredState();

function cloneState(state: StoredQueueState): StoredQueueState {
  return JSON.parse(JSON.stringify(state)) as StoredQueueState;
}

function normalizeSeconds(value: unknown, fallback = DEFAULT_FALLBACK_DURATION_SECONDS): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function durationFor(track: QueueTrack): number {
  if (typeof track.detectedDurationSeconds === "number" && track.detectedDurationSeconds > 0) {
    return track.detectedDurationSeconds;
  }
  return normalizeSeconds(track.fallbackDurationSeconds);
}

function summarize(state: StoredQueueState): QueueRuntimeSummary {
  const activeTracks = [
    ...state.active.priority,
    ...state.active.wheel,
    ...state.active.regular,
  ];
  const activeRuntimeSeconds = activeTracks.reduce((total, track) => total + durationFor(track), 0);
  const completedRuntimeSeconds = state.completed.reduce((total, track) => total + durationFor(track), 0);

  return {
    activeTrackCount: activeTracks.length,
    activeRuntimeSeconds,
    completedCount: state.completed.length,
    completedRuntimeSeconds,
    projectedTotalSessionSeconds: activeRuntimeSeconds + completedRuntimeSeconds,
    queueOpen: state.queueOpen,
  };
}

function toPublicState(state: StoredQueueState): QueueState {
  const summary = summarize(state);
  const queue = [...state.active.priority, ...state.active.wheel, ...state.active.regular];
  return {
    active: {
      priority: [...state.active.priority],
      wheel: [...state.active.wheel],
      regular: [...state.active.regular],
    },
    completed: [...state.completed],
    removed: [...state.removed],
    spotlight: [...state.spotlight],
    summary,

    nowPlaying: null,
    queue,
    history: [...state.completed],
    totalPlayed: state.completed.length,
    streamStatus: state.queueOpen ? "online" : "offline",
  };
}

async function readStoredState(): Promise<StoredQueueState> {
  const redis = getRedis();
  if (!redis) return cloneState(mem);

  const raw = await redis.get<StoredQueueState | string>(STATE_KEY);
  if (!raw) return emptyStoredState();
  if (typeof raw === "string") return JSON.parse(raw) as StoredQueueState;
  return raw;
}

async function writeStoredState(state: StoredQueueState): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(STATE_KEY, JSON.stringify(state));
    return;
  }
  mem = cloneState(state);
}

function makeTrack(input: QueueSubmissionInput): QueueTrack {
  const now = new Date().toISOString();
  const fallbackDurationSeconds = normalizeSeconds(input.fallbackDurationSeconds);
  const artistName = input.artistName.trim();
  const songTitle = input.songTitle.trim();
  const songUrl = input.songUrl.trim();

  return {
    id: generateQueueId(),
    artistName,
    songTitle,
    songUrl,
    submitterContact: input.submitterContact?.trim() || undefined,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    lane: "regular",
    status: "active",
    detectedDurationSeconds: null,
    durationSource: "unknown",
    fallbackDurationSeconds,
    artist: artistName,
    title: songTitle,
    link: songUrl,
    tier: "free",
    playedAt: null,
  };
}

function removeFromActive(state: StoredQueueState, id: string): QueueTrack | null {
  for (const lane of ["priority", "wheel", "regular"] as RadioQueueLane[]) {
    const index = state.active[lane].findIndex((track) => track.id === id);
    if (index !== -1) {
      const [track] = state.active[lane].splice(index, 1);
      return track;
    }
  }
  return null;
}

export async function getQueueState(): Promise<QueueState> {
  return toPublicState(await readStoredState());
}

export async function submitQueueTrack(input: QueueSubmissionInput): Promise<QueueTrack> {
  const state = await readStoredState();
  if (!state.queueOpen) throw new Error("QUEUE_CLOSED");
  const track = makeTrack(input);
  state.active.regular.push(track);
  await writeStoredState(state);
  return track;
}

export async function setQueueOpen(queueOpen: boolean): Promise<QueueState> {
  const state = await readStoredState();
  state.queueOpen = queueOpen;
  await writeStoredState(state);
  return toPublicState(state);
}

export async function updateQueueTrack(id: string, action: QueueAdminAction, queueOpen?: boolean): Promise<QueueState> {
  if (action === "setOpen") return setQueueOpen(Boolean(queueOpen));

  const state = await readStoredState();
  const now = new Date().toISOString();

  if (action === "spotlight") {
    const existing = [...state.active.priority, ...state.active.wheel, ...state.active.regular, ...state.completed]
      .find((track) => track.id === id);
    if (!existing) throw new Error("TRACK_NOT_FOUND");
    if (!state.spotlight.some((track) => track.id === id)) {
      state.spotlight.push({ ...existing, spotlightedAt: now, updatedAt: now });
    }
    await writeStoredState(state);
    return toPublicState(state);
  }

  const track = removeFromActive(state, id);
  if (!track) throw new Error("TRACK_NOT_FOUND");

  const updated: QueueTrack = { ...track, updatedAt: now };

  if (action === "finish") {
    updated.status = "completed";
    updated.completedAt = now;
    updated.playedAt = now;
    state.completed.unshift(updated);
  } else if (action === "remove") {
    updated.status = "removed";
    updated.removedAt = now;
    state.removed.unshift(updated);
  } else if (action === "moveToPriority") {
    updated.status = "active";
    updated.lane = "priority";
    state.active.priority.push(updated);
  } else {
    throw new Error("UNSUPPORTED_ACTION");
  }

  await writeStoredState(state);
  return toPublicState(state);
}

// Legacy wrappers kept for retired stream-engine clients. They now operate on
// the BARCODE Radio Queue v1 skeleton and do not trigger payments or playback.
export async function addToQueue(entry: { artist?: string; title?: string; link?: string; artistName?: string; songTitle?: string; songUrl?: string; createdAt?: string; fallbackDurationSeconds?: number }): Promise<QueueTrack> {
  return submitQueueTrack({
    artistName: entry.artistName ?? entry.artist ?? "Unknown Artist",
    songTitle: entry.songTitle ?? entry.title ?? "Untitled Track",
    songUrl: entry.songUrl ?? entry.link ?? "",
    fallbackDurationSeconds: entry.fallbackDurationSeconds,
  });
}

export async function advanceQueue(): Promise<QueueTrack | null> {
  const state = await readStoredState();
  const next = state.active.priority[0] ?? state.active.wheel[0] ?? state.active.regular[0] ?? null;
  if (!next) return null;
  await updateQueueTrack(next.id, "finish");
  return { ...next, status: "completed", playedAt: new Date().toISOString() };
}

export async function resetQueue(): Promise<{ cleared: number; preserved: number }> {
  const state = await readStoredState();
  const cleared = state.active.regular.length + state.active.wheel.length + state.active.priority.length;
  state.active = { priority: [], wheel: [], regular: [] };
  await writeStoredState(state);
  return { cleared, preserved: 0 };
}

export async function setStreamStatus(status: "online" | "offline"): Promise<void> {
  await setQueueOpen(status === "online");
}

export async function getEntry(id: string): Promise<QueueTrack | null> {
  const state = await readStoredState();
  return [...state.active.priority, ...state.active.wheel, ...state.active.regular, ...state.completed, ...state.removed]
    .find((track) => track.id === id) ?? null;
}

export async function upgradeEntryTier(id: string): Promise<QueueTrack | null> {
  const before = await getEntry(id);
  if (!before || before.status !== "active") return null;
  await updateQueueTrack(id, "moveToPriority");
  return getEntry(id);
}
