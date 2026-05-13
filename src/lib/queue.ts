// ============================================================
// BARCODE RADIO QUEUE OPERATIONS — session-based Redis + memory
// ============================================================

import { Redis } from "@upstash/redis";
import { detectTrackDurationFromLink, parseIso8601DurationToSeconds, parseSpotifyTrackId, parseYouTubeVideoId as parseTrackDurationYouTubeVideoId } from "./track-duration";
import {
  INTERNAL_BUFFER_DURATION_SECONDS,
  detectQueueSourceType,
  formatRuntime,
  generateQueueId,
  getTrackRuntimeSeconds,
  getTrackArtworkUrl,
  normalizeTier,
} from "./queue-types";
import type {
  QueueDurationSource,
  QueueEntry,
  QueueLane,
  QueueNonPriorityLane,
  QueuePublicSnapshot,
  QueuePublicStatus,
  QueuePublicTrack,
  QueueSession,
  QueueSessionStatus,
  QueueSessionSummary,
  QueueSourceType,
  QueueWheelArtistOption,
  QueueState,
  QueueTier,
} from "./queue-types";

const STATE_KEY = "radioQueue:v2:sessions";
const LEGACY_STATE_KEY = "radioQueue:v1:state";
const DEFAULT_QUEUE_CAPACITY = 50;
const DEFAULT_SUBMISSION_COOLDOWN_SECONDS = 5 * 60;
const MAX_SUBMISSION_COOLDOWN_SECONDS = 60 * 60;
const DEFAULT_PRIORITY_UPGRADE_LABEL = "Priority Signal Upgrade";
const DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS = "Priority Signal Upgrade is being prepared. No payment has been processed.";
const DEFAULT_PRIORITY_UPGRADE_PRICE_CENTS = 1000;
const DEFAULT_PRIORITY_UPGRADE_CURRENCY = "usd";
const PRE_SHOW_ROUTING_DELAY_MS = (20 * 60 + 15) * 1000;

type QueueAdminAction = "pullNext" | "pullWheelChosen" | "pullFreeTransmission" | "startShow" | "addWheelSpinOwed" | "load" | "finish" | "remove" | "priority" | "regular" | "wheel" | "moveBack" | "spotlight" | "removeSpotlight" | "restoreRegular" | "restorePriority" | "markPriorityManual" | "markPriorityRequested" | "markPriorityCheckoutPending" | "pausePriority" | "resumePriority" | "addSimulationFreeTrack" | "addSimulationPaidPriority" | "addSimulationCheckoutPending" | "addSimulationPaymentFailed" | "addSimulationHeldPriority" | "clearSimulationTracks";

export interface PriorityUpgradeSettingsInput {
  enabled?: boolean;
  label?: string;
  instructions?: string;
  priceCents?: number;
  currency?: string;
  paymentsEnabled?: boolean;
}

interface QueueStore {
  activeSessionId: string;
  sessions: QueueSession[];
}

interface ProviderMetadata {
  detectedArtistName: string | null;
  detectedSongTitle: string | null;
  providerTitle: string | null;
  detectedDurationSeconds: number | null;
  durationSource: QueueDurationSource;
  artworkUrl?: string | null;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const SESSION_DESCRIPTIONS = [
  "Three transmissions per artist. At 10k taps, the skip game opens a fracture in the line. Priority access remains reserved for urgent signals unwilling to wait.",
  "Limit three tracks per signal source. The 10k tap event may pull a winner through the queue. Standard transmissions continue in order unless priority access intervenes.",
  "Each artist may load three tracks into the system. At 10k taps, the wheel selects a breach point. The Priority Lane remains separate from the standard crawl.",
  "Three tracks per artist maximum. When taps reach 10k, the skip game can reroute one signal. Priority access is reserved for future urgent transmissions.",
  "Queue discipline: three tracks per artist, regular crawl by order received, 10k taps triggers the skip game, and Priority Lane access stays separate.",
  "Every artist gets three standard transmissions. At 10k taps, the wheel may fracture the order. Priority access is the future route for signals that cannot wait.",
  "Load up to three tracks per artist. The queue crawls in order until the 10k tap event opens the wheel. Priority access remains a separate lane.",
  "Three submissions per artist source. 10k taps unlock the skip game. Standard tracks hold formation unless future priority access cuts through.",
  "The system accepts three tracks per artist. At 10k taps, the wheel chooses a breach point. Priority Lane remains reserved outside the regular line.",
  "Artist cap: three tracks. Queue movement stays standard until the 10k tap event. Future priority access exists for signals unwilling to wait for turn or wheel.",
];

function sessionDescriptionFor(date: string): string {
  const index = Math.abs([...date].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % SESSION_DESCRIPTIONS.length;
  return SESSION_DESCRIPTIONS[index];
}

function normalizeCurrency(value?: string | null): string {
  const cleaned = (value ?? DEFAULT_PRIORITY_UPGRADE_CURRENCY).trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
  return cleaned.length === 3 ? cleaned : DEFAULT_PRIORITY_UPGRADE_CURRENCY;
}

function normalizePriceCents(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : DEFAULT_PRIORITY_UPGRADE_PRICE_CENTS;
}

function normalizeSubmissionCooldownSeconds(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SUBMISSION_COOLDOWN_SECONDS;
  return Math.min(MAX_SUBMISSION_COOLDOWN_SECONDS, Math.max(0, Math.round(numeric)));
}

function normalizePaidPriorityEnabled(input: { priorityUpgradesEnabled?: boolean | null; priorityUpgradePaymentsEnabled?: boolean | null; priorityUpgradePriceCents?: unknown }): boolean {
  return (input.priorityUpgradesEnabled === true || input.priorityUpgradePaymentsEnabled === true) && normalizePriceCents(input.priorityUpgradePriceCents) > 0;
}

function defaultSession(options: { title?: string; showDate?: string; description?: string; trackLimitPerArtist?: number; queueCapacity?: number; skipGameTapTarget?: number; submissionCooldownSeconds?: number; priorityUpgradesEnabled?: boolean; priorityUpgradeLabel?: string; priorityUpgradeInstructions?: string; priorityUpgradePriceCents?: number; priorityUpgradeCurrency?: string; priorityUpgradePaymentsEnabled?: boolean } = {}): QueueSession {
  const date = options.showDate ?? todayDate();
  const now = new Date().toISOString();
  return normalizeSession({
    sessionId: makeSessionId(),
    title: options.title?.trim() || `BARCODE Radio — ${date}`,
    status: "prepared",
    showDate: date,
    createdAt: now,
    updatedAt: now,
    queueOpen: false,
    description: options.description?.trim() || sessionDescriptionFor(date),
    trackLimitPerArtist: options.trackLimitPerArtist ?? 3,
    queueCapacity: options.queueCapacity ?? DEFAULT_QUEUE_CAPACITY,
    skipGameTapTarget: options.skipGameTapTarget ?? 10000,
    submissionCooldownSeconds: normalizeSubmissionCooldownSeconds(options.submissionCooldownSeconds),
    activeCount: 0,
    completedCount: 0,
    removedCount: 0,
    spotlightCount: 0,
    estimatedActiveRuntimeSeconds: 0,
    completedRuntimeSeconds: 0,
    queue: [],
    spotlight: [],
    completed: [],
    removed: [],
    publicStatus: { isOpen: false, activeCount: 0, estimatedRuntimeSeconds: 0, capacity: options.queueCapacity ?? DEFAULT_QUEUE_CAPACITY, pressure: "low" },
    nextNonPriorityLane: "wheel",
    showStarted: false,
    preShowEndsAt: null,
    wheelSpinsOwed: 0,
    nextInLineTrack: null,
    nextInLineTrackId: null,
    loadedTrack: null,
    loadedTrackId: null,
    nextInLineHoldTrackId: null,
    currentTrackPreviousLane: null,
    currentTrackPreviousIndex: null,
    loadedTrackPreviousLane: null,
    loadedTrackPreviousIndex: null,
    loadedTrackWasNextInLine: false,
    loadedTrackFallbackForLane: null,
    autoRoutingPaused: false,
    priorityUpgradesEnabled: normalizePaidPriorityEnabled(options),
    priorityUpgradeLabel: options.priorityUpgradeLabel?.trim() || DEFAULT_PRIORITY_UPGRADE_LABEL,
    priorityUpgradeInstructions: options.priorityUpgradeInstructions?.trim() || DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS,
    priorityUpgradePriceCents: Number.isFinite(options.priorityUpgradePriceCents) ? Math.max(0, Math.round(options.priorityUpgradePriceCents ?? 0)) : DEFAULT_PRIORITY_UPGRADE_PRICE_CENTS,
    priorityUpgradeCurrency: normalizeCurrency(options.priorityUpgradeCurrency),
    priorityUpgradePaymentsEnabled: normalizePaidPriorityEnabled(options),
  });
}

const mem: QueueStore = (() => {
  const session = defaultSession();
  return { activeSessionId: session.sessionId, sessions: [session] };
})();

function laneRank(lane: QueueLane | undefined): number {
  if (lane === "priority") return 0;
  if (lane === "wheel") return 1;
  return 2;
}

function isPausedPriorityTrack(entry: QueueEntry | null | undefined): boolean {
  return Boolean(entry?.priorityPausedAt);
}

function isActivePriorityTrack(entry: QueueEntry | null | undefined): boolean {
  if (!entry || (entry.lane ?? "regular") !== "priority") return false;
  if (entry.status !== "queued" && entry.status !== "next") return false;
  if (isPausedPriorityTrack(entry)) return false;
  return entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual";
}

function isWheelEligibleTrack(entry: QueueEntry | null | undefined): boolean {
  if (!entry) return false;
  return (!entry.lane || entry.lane === "regular") && entry.status === "queued" && (entry.priorityUpgradeStatus ?? "none") === "none" && !entry.priorityPausedAt;
}

function getPriorityOrderTime(entry: QueueEntry): number {
  return new Date(entry.priorityQueueOrderAt ?? entry.priorityUpgradePaidAt ?? entry.priorityUpgradeAt ?? entry.createdAt).getTime();
}

function queueRank(entry: QueueEntry): number {
  if (isActivePriorityTrack(entry)) return 0;
  if (entry.displacedFromNextInLineAt) return 1;
  if ((entry.lane ?? "regular") === "priority") return 4;
  return laneRank(entry.lane) + 1;
}

function queueOrderTime(entry: QueueEntry): number {
  if (isActivePriorityTrack(entry)) return getPriorityOrderTime(entry);
  if ((entry.lane ?? "regular") === "priority") return new Date(entry.priorityPausedAt ?? entry.priorityQueueOrderAt ?? entry.priorityUpgradePaidAt ?? entry.createdAt).getTime();
  return new Date(entry.displacedFromNextInLineAt ?? entry.createdAt).getTime();
}

function sortActive(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => queueRank(a) - queueRank(b) || queueOrderTime(a) - queueOrderTime(b));
}

function laneTop(session: Pick<QueueSession, "queue">, lane: QueueLane, excludeId?: string): QueueEntry | null {
  return sortActive(session.queue).find((entry) => entry.id !== excludeId && entry.status === "queued" && (entry.lane ?? "regular") === lane && (lane !== "priority" || isActivePriorityTrack(entry))) ?? null;
}


function getDisplacedNonPriorityNext(session: Pick<QueueSession, "queue">, blockedId?: string): QueueEntry | null {
  return sortActive(session.queue).find((entry) => entry.id !== blockedId && entry.status === "queued" && (entry.lane ?? "regular") !== "priority" && Boolean(entry.displacedFromNextInLineAt)) ?? null;
}

function chooseNextWaitingCandidate(session: QueueSession, excludeId?: string): { entry: QueueEntry; fallbackForLane: QueueNonPriorityLane | null } | null {
  const blockedId = excludeId ?? session.nextInLineHoldTrackId ?? session.loadedTrackId ?? undefined;
  const priority = laneTop(session, "priority", blockedId);
  if (priority) return { entry: priority, fallbackForLane: null };

  if (session.showStarted !== true) {
    const wheel = laneTop(session, "wheel", blockedId);
    return wheel ? { entry: wheel, fallbackForLane: null } : null;
  }

  const displacedNonPriorityNext = getDisplacedNonPriorityNext(session, blockedId);
  if (displacedNonPriorityNext) return { entry: displacedNonPriorityNext, fallbackForLane: displacedNonPriorityNext.stagedAsFallbackForLane ?? null };

  const preferredLane: QueueNonPriorityLane = session.nextNonPriorityLane === "regular" ? "regular" : "wheel";
  const preferred = laneTop(session, preferredLane, blockedId);
  if (preferred) return { entry: preferred, fallbackForLane: null };

  if (preferredLane === "wheel" && normalizeWheelSpinsOwed(session.wheelSpinsOwed) > 0) return null;

  const fallbackLane: QueueNonPriorityLane = preferredLane === "wheel" ? "regular" : "wheel";
  const fallback = laneTop(session, fallbackLane, blockedId);
  return fallback ? { entry: fallback, fallbackForLane: preferredLane } : null;
}

function getNextInLine(session: Pick<QueueSession, "nextInLineTrack">): QueueEntry | null {
  return session.nextInLineTrack ?? null;
}

function getLoadedTrack(session: Pick<QueueSession, "loadedTrack">): QueueEntry | null {
  return session.loadedTrack ?? null;
}

function stageNextInLineTrack(session: QueueSession, next: QueueEntry, fallbackForLane: QueueNonPriorityLane | null = null): void {
  const sorted = sortActive(session.queue);
  const previousIndex = sorted.findIndex((entry) => entry.id === next.id);
  session.queue = sorted.filter((entry) => entry.id !== next.id);
  session.nextInLineTrack = normalizeEntry({ ...next, status: "next", displacedFromNextInLineAt: null, stagedAsFallbackForLane: fallbackForLane });
  session.nextInLineTrackId = next.id;
  session.nextInLineHoldTrackId = null;
  session.currentTrackPreviousLane = next.lane ?? "regular";
  session.currentTrackPreviousIndex = previousIndex >= 0 ? previousIndex : null;
  session.autoRoutingPaused = false;
}

function preserveDisplacedNonPriorityNext(session: QueueSession, entry: QueueEntry): void {
  if ((entry.lane ?? "regular") === "priority") return;
  const lane = entry.lane === "wheel" ? "wheel" : "regular";
  const restored = normalizeEntry({
    ...entry,
    lane,
    tier: lane === "wheel" ? "frontrow" : "free",
    status: "queued",
    playedAt: null,
    displacedFromNextInLineAt: new Date().toISOString(),
  });
  const priorityQueue = sortActive(session.queue.filter((track) => track.id !== restored.id && (track.lane ?? "regular") === "priority"));
  const baseQueue = sortActive(session.queue.filter((track) => track.id !== restored.id && (track.lane ?? "regular") !== "priority"));
  session.queue = [...priorityQueue, restored, ...baseQueue];
}

function resolveNextInLine(session: QueueSession, excludeId?: string, force = false): void {
  let current = session.nextInLineTrack ?? null;
  if (session.autoRoutingPaused && !force) {
    if (current) return;
    const priority = laneTop(session, "priority", excludeId ?? session.nextInLineHoldTrackId ?? session.loadedTrackId ?? undefined);
    if (!priority) return;
    stageNextInLineTrack(session, priority);
    return;
  }

  if (isActivePriorityTrack(current)) return;
  if (current && (current.lane ?? "regular") === "priority") {
    if (!session.queue.some((entry) => entry.id === current?.id)) session.queue.push(normalizeEntry({ ...current, status: "queued" }));
    clearNextInLine(session);
    current = null;
  }

  const priority = laneTop(session, "priority", excludeId ?? session.nextInLineHoldTrackId ?? session.loadedTrackId ?? undefined);
  if (priority) {
    if (current) {
      preserveDisplacedNonPriorityNext(session, current);
      clearNextInLine(session);
    }
    stageNextInLineTrack(session, priority);
    return;
  }

  if (current) return;
  const next = chooseNextWaitingCandidate(session, excludeId);
  if (!next) return;
  stageNextInLineTrack(session, next.entry, next.fallbackForLane);
}

function pullNextInLine(session: QueueSession, excludeId?: string, force = false): void {
  resolveNextInLine(session, excludeId, force);
}


function requestedLaneTop(session: QueueSession, lane: QueueNonPriorityLane, excludeId?: string): QueueEntry | null {
  return sortActive(session.queue).find((entry) => {
    if (entry.id === excludeId || entry.status !== "queued") return false;
    const entryLane = entry.lane ?? "regular";
    if (lane === "wheel") return entryLane === "wheel";
    return entryLane === "regular";
  }) ?? null;
}

function pullNextInLineFromLane(session: QueueSession, lane: QueueNonPriorityLane): boolean {
  const current = session.nextInLineTrack ?? null;
  if (session.loadedTrack && session.nextInLineTrack?.id === session.loadedTrack.id) return false;
  if (isActivePriorityTrack(current)) return false;
  if (laneTop(session, "priority", session.loadedTrackId ?? undefined)) return false;

  const currentLane = current?.lane ?? "regular";
  if (current && currentLane === lane) return false;

  const candidate = requestedLaneTop(session, lane, session.loadedTrackId ?? undefined);
  if (!candidate) return false;

  if (current) moveNextInLineBackToQueue(session);
  const next = session.queue.find((entry) => entry.id === candidate.id);
  if (!next) return false;
  stageNextInLineTrack(session, next);
  return true;
}

function clearNextInLine(session: QueueSession): QueueEntry | null {
  const current = session.nextInLineTrack ?? null;
  session.nextInLineTrack = null;
  session.nextInLineTrackId = null;
  session.currentTrackPreviousLane = null;
  session.currentTrackPreviousIndex = null;
  return current;
}

function clearLoadedTrack(session: QueueSession): QueueEntry | null {
  const current = session.loadedTrack ?? null;
  session.loadedTrack = null;
  session.loadedTrackId = null;
  session.loadedTrackPreviousLane = null;
  session.loadedTrackPreviousIndex = null;
  session.loadedTrackWasNextInLine = false;
  session.loadedTrackFallbackForLane = null;
  return current;
}

function setLoadedTrack(session: QueueSession, entry: QueueEntry, previousLane?: QueueLane | null, previousIndex?: number | null, wasNextInLine = false): QueueEntry {
  const loaded = normalizeEntry({ ...entry, status: "playing", playedAt: entry.playedAt ?? new Date().toISOString() });
  session.loadedTrack = loaded;
  session.loadedTrackId = loaded.id;
  session.loadedTrackPreviousLane = previousLane ?? entry.lane ?? "regular";
  session.loadedTrackPreviousIndex = typeof previousIndex === "number" ? previousIndex : null;
  session.loadedTrackWasNextInLine = wasNextInLine;
  session.loadedTrackFallbackForLane = entry.stagedAsFallbackForLane ?? null;
  if (session.showStarted !== true) session.showStarted = true;
  session.queue = session.queue.filter((track) => track.id !== loaded.id);
  if (session.nextInLineTrack?.id === loaded.id) clearNextInLine(session);
  return loaded;
}

function moveNextInLineBackToQueue(session: QueueSession): QueueEntry | null {
  const current = session.nextInLineTrack ?? null;
  if (!current) return null;
  const lane = session.currentTrackPreviousLane ?? current.lane ?? "regular";
  const restored = normalizeEntry({ ...current, lane, tier: lane === "priority" ? "fastlane" : lane === "wheel" ? "frontrow" : "free", status: "queued", displacedFromNextInLineAt: lane === "priority" ? null : current.displacedFromNextInLineAt ?? null });
  const index = typeof session.currentTrackPreviousIndex === "number" ? Math.max(0, session.currentTrackPreviousIndex) : 0;
  const queue = sortActive(session.queue);
  queue.splice(Math.min(index, queue.length), 0, restored);
  session.queue = queue;
  clearNextInLine(session);
  return restored;
}

function insertRestoredTrack(session: QueueSession, entry: QueueEntry, lane: QueueLane, index: number | null, fallbackForLane: QueueNonPriorityLane | null = null): QueueEntry {
  const restored = normalizeEntry({ ...entry, lane, tier: lane === "priority" ? "fastlane" : lane === "wheel" ? "frontrow" : "free", status: "queued", playedAt: null, displacedFromNextInLineAt: null, stagedAsFallbackForLane: fallbackForLane });
  const queue = sortActive(session.queue.filter((track) => track.id !== restored.id));
  const safeIndex = typeof index === "number" ? Math.max(0, Math.min(index, queue.length)) : queue.length;
  queue.splice(safeIndex, 0, restored);
  session.queue = queue;
  return restored;
}

function moveLoadedTrackBackToQueue(session: QueueSession): QueueEntry | null {
  const current = session.loadedTrack ?? null;
  if (!current) return null;
  const lane = session.loadedTrackPreviousLane ?? current.lane ?? "regular";
  const index = typeof session.loadedTrackPreviousIndex === "number" ? session.loadedTrackPreviousIndex : null;
  const restored = insertRestoredTrack(session, current, lane, index, session.loadedTrackFallbackForLane ?? current.stagedAsFallbackForLane ?? null);
  clearLoadedTrack(session);
  return restored;
}

function restoreTrackToNextInLine(session: QueueSession, entry: QueueEntry, lane: QueueLane, previousIndex: number | null, fallbackForLane: QueueNonPriorityLane | null): QueueEntry {
  const restored = normalizeEntry({
    ...entry,
    lane,
    tier: lane === "priority" ? "fastlane" : lane === "wheel" ? "frontrow" : "free",
    status: "next",
    playedAt: null,
    displacedFromNextInLineAt: null,
    stagedAsFallbackForLane: fallbackForLane,
  });
  session.nextInLineTrack = restored;
  session.nextInLineTrackId = restored.id;
  session.nextInLineHoldTrackId = null;
  session.currentTrackPreviousLane = lane;
  session.currentTrackPreviousIndex = previousIndex;
  session.autoRoutingPaused = false;
  return restored;
}

function queuedLaneExists(session: QueueSession, lane: QueueLane, excludeId?: string): boolean {
  return Boolean(laneTop(session, lane, excludeId));
}

function clearFallbackMarkersForLane(session: QueueSession, lane: QueueNonPriorityLane): void {
  session.queue = session.queue.map((entry) => {
    if ((entry.lane ?? "regular") === "priority" || entry.stagedAsFallbackForLane !== lane) return entry;
    const restoredLane = entry.lane === "wheel" ? "wheel" : "regular";
    return normalizeEntry({
      ...entry,
      lane: restoredLane,
      tier: restoredLane === "wheel" ? "frontrow" : "free",
      status: "queued",
      displacedFromNextInLineAt: null,
      stagedAsFallbackForLane: null,
    });
  });
}

function releaseFallbackNextForLane(session: QueueSession, lane: QueueNonPriorityLane): void {
  const current = session.nextInLineTrack;
  if (current && (current.lane ?? "regular") !== "priority" && current.stagedAsFallbackForLane === lane) {
    const restoredLane = session.currentTrackPreviousLane ?? current.lane ?? "regular";
    const restoredIndex = typeof session.currentTrackPreviousIndex === "number" ? session.currentTrackPreviousIndex : null;
    clearNextInLine(session);
    insertRestoredTrack(session, current, restoredLane, restoredIndex, null);
  }
  clearFallbackMarkersForLane(session, lane);
}

function handleWheelWinnerSelected(session: QueueSession): void {
  if (session.nextNonPriorityLane !== "wheel" || !queuedLaneExists(session, "wheel", session.loadedTrackId ?? undefined)) return;
  releaseFallbackNextForLane(session, "wheel");
  resolveNextInLine(session, undefined, true);
}

function undoLoadedTrack(session: QueueSession): QueueEntry | null {
  const current = session.loadedTrack ?? null;
  if (!current) return null;
  const lane = session.loadedTrackPreviousLane ?? current.lane ?? "regular";
  const previousIndex = typeof session.loadedTrackPreviousIndex === "number" ? session.loadedTrackPreviousIndex : null;
  const wasNextInLine = session.loadedTrackWasNextInLine === true;
  const fallbackForLane = session.loadedTrackFallbackForLane ?? current.stagedAsFallbackForLane ?? null;

  if (!wasNextInLine) return moveLoadedTrackBackToQueue(session);

  if (session.nextInLineTrack) moveNextInLineBackToQueue(session);
  clearLoadedTrack(session);

  if (fallbackForLane && session.nextNonPriorityLane === fallbackForLane && queuedLaneExists(session, fallbackForLane)) {
    const restored = insertRestoredTrack(session, current, lane, previousIndex, null);
    resolveNextInLine(session, undefined, true);
    return restored;
  }

  return restoreTrackToNextInLine(session, current, lane, previousIndex, fallbackForLane);
}

function nextLaneAfterFinish(lane: QueueLane | undefined): QueueNonPriorityLane {
  if (lane === "wheel") return "regular";
  return "wheel";
}

function advanceNonPriorityLaneAfter(session: QueueSession, lane: QueueLane | undefined): void {
  if (lane === "priority") return;
  session.nextNonPriorityLane = nextLaneAfterFinish(lane);
}

function publicStatusForSession(session: Pick<QueueSession, "queue" | "queueOpen" | "nextInLineTrack" | "loadedTrack" | "queueCapacity">): QueuePublicStatus {
  const active = session.queue.filter((entry) => entry.status === "queued" || entry.status === "playing");
  const next = session.nextInLineTrack ? [session.nextInLineTrack] : [];
  const loaded = session.loadedTrack ? [session.loadedTrack] : [];
  const estimatedRuntimeSeconds = [...loaded, ...next, ...active].reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0);
  const capacity = session.queueCapacity ?? DEFAULT_QUEUE_CAPACITY;
  const load = (active.length + next.length + loaded.length) / capacity;
  return {
    isOpen: session.queueOpen,
    activeCount: active.length + next.length + loaded.length,
    estimatedRuntimeSeconds,
    capacity,
    pressure: load >= 1 ? "max" : load >= 0.75 ? "high" : load >= 0.4 ? "medium" : "low",
    isFull: active.length + next.length + loaded.length >= capacity,
  };
}

function summarizeSession(session: QueueSession): QueueSessionSummary {
  const publicStatus = publicStatusForSession(session);
  return {
    sessionId: session.sessionId,
    title: session.title,
    status: session.status,
    showDate: session.showDate,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    queueOpen: session.queueOpen,
    description: session.description ?? sessionDescriptionFor(session.showDate),
    trackLimitPerArtist: session.trackLimitPerArtist ?? 3,
    queueCapacity: session.queueCapacity ?? DEFAULT_QUEUE_CAPACITY,
    skipGameTapTarget: session.skipGameTapTarget ?? 10000,
    submissionCooldownSeconds: normalizeSubmissionCooldownSeconds(session.submissionCooldownSeconds),
    activeCount: publicStatus.activeCount,
    nextInLineTrackId: session.nextInLineTrackId ?? session.nextInLineTrack?.id ?? null,
    nextInLineHoldTrackId: session.nextInLineHoldTrackId ?? null,
    loadedTrackId: session.loadedTrackId ?? session.loadedTrack?.id ?? null,
    completedCount: session.completed.length,
    removedCount: session.removed.length,
    spotlightCount: session.spotlight.length,
    estimatedActiveRuntimeSeconds: publicStatus.estimatedRuntimeSeconds,
    completedRuntimeSeconds: session.completed.reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0),
    nextNonPriorityLane: session.nextNonPriorityLane ?? "wheel",
    showStarted: session.showStarted === true,
    preShowEndsAt: session.preShowEndsAt ?? null,
    wheelSpinsOwed: normalizeWheelSpinsOwed(session.wheelSpinsOwed),
    broadcastPhase: broadcastPhaseForSession(session),
    priorityUpgradesEnabled: normalizePaidPriorityEnabled(session),
    priorityUpgradeLabel: session.priorityUpgradeLabel?.trim() || DEFAULT_PRIORITY_UPGRADE_LABEL,
    priorityUpgradeInstructions: session.priorityUpgradeInstructions?.trim() || DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS,
    priorityUpgradePriceCents: normalizePriceCents(session.priorityUpgradePriceCents),
    priorityUpgradeCurrency: normalizeCurrency(session.priorityUpgradeCurrency),
    priorityUpgradePaymentsEnabled: normalizePaidPriorityEnabled(session),
  };
}


function preShowEndsAtFrom(date = new Date()): string {
  return new Date(date.getTime() + PRE_SHOW_ROUTING_DELAY_MS).toISOString();
}

function broadcastPhaseForSession(session: Pick<QueueSession, "status" | "queueOpen" | "showStarted">): "warmup" | "submission_window" | "broadcast_active" | "ended" {
  if (session.status === "archived") return "ended";
  if (session.showStarted === true) return "broadcast_active";
  return session.queueOpen ? "submission_window" : "warmup";
}

function applyPreShowTimer(session: QueueSession, now = new Date()): boolean {
  if (session.status === "archived" || session.showStarted === true || session.queueOpen !== true || !session.preShowEndsAt) return false;
  const endsAt = new Date(session.preShowEndsAt).getTime();
  if (!Number.isFinite(endsAt) || endsAt > now.getTime()) return false;
  return false;
}

function normalizeWheelSpinsOwed(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function normalizePriorityUpgradeStatus(status: unknown): QueueEntry["priorityUpgradeStatus"] {
  if (status === "paid_placeholder") return "checkout_pending";
  if (status === "requested" || status === "manual" || status === "checkout_pending" || status === "paid" || status === "paid_needs_attention" || status === "failed" || status === "refunded") return status;
  return "none";
}

function normalizePriorityUpgradeSource(source: unknown): QueueEntry["priorityUpgradeSource"] {
  if (source === "admin" || source === "public_placeholder" || source === "future_payment" || source === "stripe") return source;
  return null;
}

function normalizeEntry(entry: QueueEntry): QueueEntry {
  const { priorityOverlayDisplacedAt: legacyDisplacedFromNextInLineAt, ...entryWithoutLegacyMarker } = entry as QueueEntry & { priorityOverlayDisplacedAt?: string | null };
  const submittedArtistName = entry.submittedArtistName ?? entry.artist;
  const submittedSongTitle = entry.submittedSongTitle ?? entry.title;
  const detectedDurationSeconds = entry.detectedDurationSeconds ?? null;
  const sourceType = entry.sourceType ?? detectQueueSourceType(entry.link);
  const durationSource = normalizeDurationSource(entry.durationSource, detectedDurationSeconds, sourceType);
  const priorityUpgradeStatus = normalizePriorityUpgradeStatus(entry.priorityUpgradeStatus);
  const paidPriorityStatus = priorityUpgradeStatus === "paid" || priorityUpgradeStatus === "manual";
  const lane = entry.lane === "priority" && !paidPriorityStatus ? "regular" : entry.lane;
  return {
    ...entryWithoutLegacyMarker,
    lane,
    tier: lane === "regular" && entry.lane === "priority" && !paidPriorityStatus ? "free" : entry.tier,
    artist: entry.artist ?? submittedArtistName,
    title: entry.title ?? submittedSongTitle,
    submittedArtistName,
    submittedSongTitle,
    detectedArtistName: entry.detectedArtistName ?? null,
    detectedSongTitle: entry.detectedSongTitle ?? null,
    providerTitle: entry.providerTitle ?? null,
    sourceType,
    estimatedDurationSeconds: entry.estimatedDurationSeconds ?? detectedDurationSeconds ?? INTERNAL_BUFFER_DURATION_SECONDS,
    detectedDurationSeconds,
    durationIsEstimate: detectedDurationSeconds === null,
    durationSource,
    note: entry.note ?? null,
    priorityUpgradeRequested: entry.priorityUpgradeRequested === true,
    priorityUpgradeStatus,
    priorityUpgradeSource: normalizePriorityUpgradeSource(entry.priorityUpgradeSource),
    priorityUpgradeAt: entry.priorityUpgradeAt ?? entry.priorityUpgradeRequestedAt ?? entry.priorityUpgradePaidAt ?? null,
    priorityUpgradeRequestedAt: entry.priorityUpgradeRequestedAt ?? entry.priorityUpgradeAt ?? null,
    priorityUpgradePaidAt: entry.priorityUpgradePaidAt ?? null,
    priorityUpgradePaymentProvider: entry.priorityUpgradePaymentProvider ?? null,
    priorityUpgradePaymentId: entry.priorityUpgradePaymentId ?? null,
    priorityUpgradeCheckoutProvider: entry.priorityUpgradeCheckoutProvider ?? null,
    priorityUpgradeCheckoutSessionId: entry.priorityUpgradeCheckoutSessionId ?? null,
    priorityUpgradeCheckoutUrl: entry.priorityUpgradeCheckoutUrl ?? null,
    priorityUpgradeCheckoutCreatedAt: entry.priorityUpgradeCheckoutCreatedAt ?? null,
    priorityUpgradeCheckoutExpiresAt: entry.priorityUpgradeCheckoutExpiresAt ?? null,
    priorityUpgradeAmountCents: typeof entry.priorityUpgradeAmountCents === "number" ? Math.max(0, Math.round(entry.priorityUpgradeAmountCents)) : null,
    priorityUpgradeCurrency: entry.priorityUpgradeCurrency ? normalizeCurrency(entry.priorityUpgradeCurrency) : null,
    displacedFromNextInLineAt: entry.displacedFromNextInLineAt ?? legacyDisplacedFromNextInLineAt ?? null,
    stagedAsFallbackForLane: entry.stagedAsFallbackForLane === "regular" || entry.stagedAsFallbackForLane === "wheel" ? entry.stagedAsFallbackForLane : null,
    priorityPausedAt: entry.priorityPausedAt ?? null,
    priorityResumedAt: entry.priorityResumedAt ?? null,
    priorityQueueOrderAt: entry.priorityQueueOrderAt ?? entry.priorityUpgradePaidAt ?? null,
    isTestTrack: entry.isTestTrack === true,
  };
}

function normalizeDurationSource(source: QueueDurationSource | string | undefined, detected: number | null, sourceType: QueueSourceType): QueueDurationSource {
  if (source === "browser-audio-metadata" || source === "upload_metadata") return "upload_metadata";
  if (source === "file-metadata" || source === "file_metadata") return "file_metadata";
  if (source === "provider-metadata" || source === "provider_metadata") return sourceType === "youtube" || sourceType === "soundcloud" || sourceType === "spotify" ? sourceType : "provider_metadata";
  if (source === "internal-estimate" || source === "internal_estimate" || source === "estimated") return source === "estimated" ? "estimated" : "internal_estimate";
  if (source === "youtube_api" || source === "spotify_api" || source === "soundcloud_api" || source === "direct_metadata") return source;
  if (source === "youtube" || source === "soundcloud" || source === "spotify" || source === "unknown") return source;
  if (detected && sourceType === "upload") return "upload_metadata";
  if (detected && sourceType === "youtube") return "youtube_api";
  if (detected && sourceType === "spotify") return "spotify_api";
  if (detected && sourceType === "soundcloud") return "soundcloud_api";
  return detected ? "provider_metadata" : "internal_estimate";
}

function normalizeSessionStatus(status: unknown, queueOpen: boolean): QueueSessionStatus {
  if (status === "open" || status === "prepared" || status === "closed" || status === "archived") return status;
  if (status === "active") return queueOpen ? "open" : "closed";
  return queueOpen ? "open" : "prepared";
}

function normalizeSession(raw: Partial<QueueSession> & { sessionId: string; title: string; status: QueueSessionStatus; showDate: string; createdAt: string; updatedAt: string; queueOpen: boolean }): QueueSession {
  const queueOpen = raw.status === "open" ? true : raw.queueOpen === true;
  const status = normalizeSessionStatus(raw.status, queueOpen);
  const session = {
    ...raw,
    status,
    description: raw.description ?? sessionDescriptionFor(raw.showDate),
    trackLimitPerArtist: raw.trackLimitPerArtist ?? 3,
    queueCapacity: raw.queueCapacity ?? raw.publicStatus?.capacity ?? DEFAULT_QUEUE_CAPACITY,
    skipGameTapTarget: raw.skipGameTapTarget ?? 10000,
    submissionCooldownSeconds: normalizeSubmissionCooldownSeconds(raw.submissionCooldownSeconds),
    queueOpen: status === "open" ? true : false,
    nextNonPriorityLane: raw.nextNonPriorityLane === "regular" ? "regular" : "wheel",
    showStarted: raw.showStarted === true,
    preShowEndsAt: typeof raw.preShowEndsAt === "string" && raw.preShowEndsAt ? raw.preShowEndsAt : null,
    wheelSpinsOwed: normalizeWheelSpinsOwed(raw.wheelSpinsOwed),
    nextInLineTrack: raw.nextInLineTrack ? normalizeEntry(raw.nextInLineTrack) : null,
    nextInLineTrackId: raw.nextInLineTrack?.id ?? raw.nextInLineTrackId ?? null,
    loadedTrack: raw.loadedTrack ? normalizeEntry(raw.loadedTrack) : null,
    loadedTrackId: raw.loadedTrack?.id ?? raw.loadedTrackId ?? null,
    nextInLineHoldTrackId: raw.nextInLineHoldTrackId ?? null,
    loadedTrackPreviousLane: raw.loadedTrackPreviousLane ?? raw.loadedTrack?.lane ?? null,
    loadedTrackPreviousIndex: typeof raw.loadedTrackPreviousIndex === "number" ? raw.loadedTrackPreviousIndex : null,
    loadedTrackWasNextInLine: raw.loadedTrackWasNextInLine === true,
    loadedTrackFallbackForLane: raw.loadedTrackFallbackForLane === "regular" || raw.loadedTrackFallbackForLane === "wheel" ? raw.loadedTrackFallbackForLane : null,
    autoRoutingPaused: raw.autoRoutingPaused === true,
    priorityUpgradesEnabled: normalizePaidPriorityEnabled(raw),
    priorityUpgradeLabel: raw.priorityUpgradeLabel?.trim() || DEFAULT_PRIORITY_UPGRADE_LABEL,
    priorityUpgradeInstructions: raw.priorityUpgradeInstructions?.trim() || DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS,
    priorityUpgradePriceCents: normalizePriceCents(raw.priorityUpgradePriceCents),
    priorityUpgradeCurrency: normalizeCurrency(raw.priorityUpgradeCurrency),
    priorityUpgradePaymentsEnabled: normalizePaidPriorityEnabled(raw),
    currentTrackPreviousLane: raw.currentTrackPreviousLane ?? raw.nextInLineTrack?.lane ?? null,
    currentTrackPreviousIndex: typeof raw.currentTrackPreviousIndex === "number" ? raw.currentTrackPreviousIndex : null,
    queue: sortActive((raw.queue ?? []).map(normalizeEntry).filter((entry) => entry.id !== raw.nextInLineTrack?.id && entry.id !== raw.nextInLineTrackId && entry.id !== raw.loadedTrack?.id && entry.id !== raw.loadedTrackId)),
    completed: (raw.completed ?? []).map(normalizeEntry),
    removed: (raw.removed ?? []).map(normalizeEntry),
    spotlight: (raw.spotlight ?? []).map(normalizeEntry),
  } as QueueSession;
  const summary = summarizeSession(session);
  return { ...session, ...summary, publicStatus: publicStatusForSession(session) };
}

function normalizeStore(input: unknown): QueueStore {
  const maybe = input as Partial<QueueStore> | null;
  if (maybe && Array.isArray(maybe.sessions)) {
    const sessions = maybe.sessions.map((session) => normalizeSession(session));
    const activeSessionId = maybe.activeSessionId && sessions.some((session) => session.sessionId === maybe.activeSessionId)
      ? maybe.activeSessionId
      : sessions.find((session) => session.status !== "archived")?.sessionId ?? sessions[0]?.sessionId;
    if (activeSessionId) return { activeSessionId, sessions };
  }
  const legacy = input as { queue?: QueueEntry[]; completed?: QueueEntry[]; removed?: QueueEntry[]; spotlight?: QueueEntry[]; isOpen?: boolean } | null;
  if (legacy && (Array.isArray(legacy.queue) || Array.isArray(legacy.completed))) {
    const session = normalizeSession({
      ...defaultSession(),
      queue: legacy.queue ?? [],
      completed: legacy.completed ?? [],
      removed: legacy.removed ?? [],
      spotlight: legacy.spotlight ?? [],
      status: legacy.isOpen === false ? "closed" : "open",
      queueOpen: legacy.isOpen !== false,
      updatedAt: new Date().toISOString(),
    });
    return { activeSessionId: session.sessionId, sessions: [session] };
  }
  const session = defaultSession();
  return { activeSessionId: session.sessionId, sessions: [session] };
}

async function readStore(): Promise<QueueStore> {
  const redis = getRedis();
  if (!redis) return normalizeStore(mem);
  const raw = await redis.get<QueueStore | string>(STATE_KEY);
  if (raw) return normalizeStore(typeof raw === "string" ? JSON.parse(raw) : raw);
  const legacy = await redis.get<unknown>(LEGACY_STATE_KEY);
  return normalizeStore(typeof legacy === "string" ? JSON.parse(legacy) : legacy);
}

async function writeStore(store: QueueStore): Promise<void> {
  const normalized = normalizeStore(store);
  const redis = getRedis();
  if (!redis) {
    mem.activeSessionId = normalized.activeSessionId;
    mem.sessions = normalized.sessions;
    return;
  }
  await redis.set(STATE_KEY, JSON.stringify(normalized));
}

function getSession(store: QueueStore, sessionId?: string): QueueSession {
  const targetId = sessionId ?? store.activeSessionId;
  return store.sessions.find((session) => session.sessionId === targetId) ?? store.sessions.find((session) => session.sessionId === store.activeSessionId) ?? store.sessions[0];
}

function replaceSession(store: QueueStore, session: QueueSession): QueueStore {
  return { ...store, sessions: store.sessions.map((item) => item.sessionId === session.sessionId ? normalizeSession({ ...session, updatedAt: new Date().toISOString() }) : item) };
}

function parseFilenameMetadata(fileName?: string | null): { artist: string | null; title: string | null; providerTitle: string | null } {
  if (!fileName) return { artist: null, title: null, providerTitle: null };
  const base = fileName.replace(/\.(mp3|wav)$/i, "").replace(/[_]+/g, " ").trim();
  const parts = base.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(" - "), providerTitle: base || null };
  return { artist: null, title: null, providerTitle: base || null };
}

function blankProvider(source: QueueDurationSource = "internal_estimate"): ProviderMetadata {
  return { detectedArtistName: null, detectedSongTitle: null, providerTitle: null, detectedDurationSeconds: null, durationSource: source, artworkUrl: null };
}

export function parseYouTubeVideoId(link: string): string | null {
  return parseTrackDurationYouTubeVideoId(link);
}

export function parseYouTubeDuration(duration: string): number | null {
  return parseIso8601DurationToSeconds(duration);
}

async function lookupYouTubeMetadata(link: string): Promise<ProviderMetadata> {
  const key = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY;
  const id = parseYouTubeVideoId(link);
  if (!key || !id) return blankProvider("internal_estimate");
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return blankProvider("internal_estimate");
  const payload = await res.json();
  const item = Array.isArray(payload.items) ? payload.items[0] : null;
  const duration = item?.contentDetails?.duration ? parseYouTubeDuration(item.contentDetails.duration) : null;
  const providerTitle = typeof item?.snippet?.title === "string" ? item.snippet.title : null;
  const channelTitle = typeof item?.snippet?.channelTitle === "string" ? item.snippet.channelTitle : null;
  return { detectedArtistName: channelTitle, detectedSongTitle: providerTitle, providerTitle, detectedDurationSeconds: duration, durationSource: duration ? "youtube_api" : "internal_estimate", artworkUrl: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null };
}

function spotifyOEmbedUrl(link: string): string {
  const trackId = link.match(/spotify:track:([a-zA-Z0-9]+)/)?.[1];
  return trackId ? `https://open.spotify.com/track/${trackId}` : link;
}

async function lookupSpotifyOEmbed(link: string, base: ProviderMetadata = blankProvider("internal_estimate")): Promise<ProviderMetadata> {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyOEmbedUrl(link))}`, { cache: "no-store" });
  if (!res.ok) return base;
  const payload = await res.json();
  const artworkUrl = typeof payload.thumbnail_url === "string" ? payload.thumbnail_url : base.artworkUrl ?? null;
  const providerTitle = base.providerTitle ?? (typeof payload.title === "string" ? payload.title : null);
  return { ...base, providerTitle, artworkUrl };
}

async function lookupSpotifyMetadata(link: string): Promise<ProviderMetadata> {
  const fallback = () => lookupSpotifyOEmbed(link).catch(() => blankProvider("internal_estimate"));
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const trackId = parseSpotifyTrackId(link);
  if (!trackId || !clientId || !clientSecret) return fallback();
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!tokenRes.ok) return fallback();
  const token = await tokenRes.json();
  if (!token.access_token) return fallback();
  const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
  if (!trackRes.ok) return fallback();
  const track = await trackRes.json();
  const seconds = typeof track.duration_ms === "number" ? Math.round(track.duration_ms / 1000) : null;
  const artist = Array.isArray(track.artists) ? track.artists.map((item: { name?: string }) => item.name).filter(Boolean).join(", ") : null;
  const title = typeof track.name === "string" ? track.name : null;
  const artworkUrl = Array.isArray(track.album?.images) ? track.album.images.find((image: { url?: string }) => typeof image.url === "string")?.url ?? null : null;
  const metadata = { detectedArtistName: artist || null, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "spotify_api" as const : "internal_estimate" as const, artworkUrl };
  return artworkUrl ? metadata : lookupSpotifyOEmbed(link, metadata).catch(() => metadata);
}

async function lookupSoundCloudOEmbed(link: string, base: ProviderMetadata = blankProvider("internal_estimate")): Promise<ProviderMetadata> {
  const res = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link)}`, { cache: "no-store" });
  if (!res.ok) return base;
  const payload = await res.json();
  const artworkUrl = typeof payload.thumbnail_url === "string" ? payload.thumbnail_url : base.artworkUrl ?? null;
  const providerTitle = base.providerTitle ?? (typeof payload.title === "string" ? payload.title : null);
  return { ...base, providerTitle, artworkUrl };
}

async function lookupSoundCloudMetadata(link: string): Promise<ProviderMetadata> {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  if (!clientId) return lookupSoundCloudOEmbed(link).catch(() => blankProvider("internal_estimate"));
  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(link)}&client_id=${encodeURIComponent(clientId)}`;
  const res = await fetch(resolveUrl, { cache: "no-store" });
  if (!res.ok) return lookupSoundCloudOEmbed(link).catch(() => blankProvider("internal_estimate"));
  const track = await res.json();
  const seconds = typeof track.duration === "number" ? Math.round(track.duration / 1000) : null;
  const title = typeof track.title === "string" ? track.title : null;
  const artist = typeof track.user?.username === "string" ? track.user.username : null;
  const artworkUrl = typeof track.artwork_url === "string" ? track.artwork_url.replace("-large.", "-t500x500.") : null;
  const metadata = { detectedArtistName: artist, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "soundcloud_api" as const : "internal_estimate" as const, artworkUrl };
  return artworkUrl ? metadata : lookupSoundCloudOEmbed(link, metadata).catch(() => metadata);
}

export async function detectProviderMetadata(sourceType: QueueSourceType, link: string): Promise<ProviderMetadata> {
  try {
    let metadata = blankProvider("internal_estimate");
    if (sourceType === "youtube") metadata = await lookupYouTubeMetadata(link);
    else if (sourceType === "spotify") metadata = await lookupSpotifyMetadata(link);
    else if (sourceType === "soundcloud") metadata = await lookupSoundCloudMetadata(link);
    else return metadata;

    if (metadata.detectedDurationSeconds) return metadata;

    const duration = await detectTrackDurationFromLink(link);
    if (duration.durationSeconds && duration.durationIsEstimate === false) {
      return { ...metadata, detectedDurationSeconds: duration.durationSeconds, durationSource: duration.durationSource };
    }

    return metadata;
  } catch (error) {
    console.warn("[queue] provider metadata lookup failed", error);
    return blankProvider("internal_estimate");
  }
}

function normalizeIdentity(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@._-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTikTokHandle(value: string): string {
  let cleaned = value.trim().toLowerCase();
  try {
    const parsed = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
    if (parsed.hostname.includes("tiktok.com")) cleaned = parsed.pathname.split("/").find((part) => part.startsWith("@")) ?? cleaned;
  } catch {}
  cleaned = cleaned.replace(/^@+/, "").split(/[/?#]/)[0] ?? cleaned;
  cleaned = cleaned.replace(/[^a-z0-9._-]/g, "");
  return cleaned ? `@${cleaned}` : "";
}

function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeQueueSourceKey(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    url.hash = "";
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "si"];
    trackingParams.forEach((key) => url.searchParams.delete(key));
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase() || null;
  }
}

function parseProviderId(sourceType: QueueSourceType, link: string): string | null {
  if (sourceType === "youtube") {
    const id = parseYouTubeVideoId(link);
    return id ? `youtube:${id}` : null;
  }
  if (sourceType === "spotify") {
    const id = parseSpotifyTrackId(link);
    return id ? `spotify:${id}` : null;
  }
  if (sourceType === "soundcloud") {
    const key = normalizeQueueSourceKey(link);
    return key ? `soundcloud:${key}` : null;
  }
  return null;
}

function countMatches(entries: QueueEntry[], predicate: (entry: QueueEntry) => boolean): number {
  return entries.filter(predicate).length;
}

function submissionCheckEntries(session: QueueSession): QueueEntry[] {
  return [...session.queue, ...(session.nextInLineTrack ? [session.nextInLineTrack] : []), ...(session.loadedTrack ? [session.loadedTrack] : []), ...session.completed, ...session.removed];
}

function entrySourceKey(entry: QueueEntry): string | null {
  return entry.normalizedSourceKey ?? normalizeQueueSourceKey(entry.fileUrl || entry.link || "");
}

function findDuplicateSubmissionReasons(session: QueueSession, track: QueueEntry): string[] {
  const entries = submissionCheckEntries(session);
  const reasons: string[] = [];
  if (track.normalizedSourceKey && entries.some((entry) => entrySourceKey(entry) === track.normalizedSourceKey)) reasons.push("Duplicate source");
  if (track.providerId && entries.some((entry) => entry.providerId === track.providerId)) reasons.push("Duplicate provider source");
  if (track.sourceType === "upload" && track.fileName && track.fileSize && entries.some((entry) => entry.sourceType === "upload" && entry.fileName?.toLowerCase() === (track.fileName ?? "").toLowerCase() && entry.fileSize === track.fileSize && (!track.detectedDurationSeconds || !entry.detectedDurationSeconds || entry.detectedDurationSeconds === track.detectedDurationSeconds))) reasons.push("Duplicate upload metadata");
  return reasons;
}

function findSubmissionLimitBlocks(session: QueueSession, track: QueueEntry): string[] {
  const entries = submissionCheckEntries(session);
  const reasons: string[] = [];
  const tikTok = track.normalizedTikTokHandle;
  const submitter = normalizeIdentity(track.submitterArtistName ?? track.submittedArtistName);
  const email = normalizeEmail(track.contactEmail);
  const token = track.submitterToken ?? "";
  if (tikTok && countMatches(entries, (entry) => entry.normalizedTikTokHandle === tikTok) >= session.trackLimitPerArtist) reasons.push("Limit matched by TikTok handle");
  if (submitter && countMatches(entries, (entry) => normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) === submitter) >= session.trackLimitPerArtist) reasons.push("Limit matched by submitter artist name");
  if (email && countMatches(entries, (entry) => normalizeEmail(entry.contactEmail) === email) >= session.trackLimitPerArtist) reasons.push("Limit matched by contact/email");
  if (token && countMatches(entries, (entry) => entry.submitterToken === token) >= session.trackLimitPerArtist) reasons.push("Limit matched by browser token");
  return reasons;
}

function suspiciousFlagsFor(session: QueueSession, track: QueueEntry): string[] {
  const entries = [...session.queue, ...(session.nextInLineTrack ? [session.nextInLineTrack] : []), ...(session.loadedTrack ? [session.loadedTrack] : []), ...session.completed, ...session.removed];
  const flags = new Set<string>();
  const submitter = normalizeIdentity(track.submitterArtistName ?? track.submittedArtistName);
  if (track.submitterToken && entries.some((entry) => entry.submitterToken === track.submitterToken && normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) !== submitter)) flags.add("Same browser token using different artist names");
  if (track.fileName && track.fileSize && entries.some((entry) => entry.fileName?.toLowerCase() === (track.fileName ?? "").toLowerCase() && entry.fileSize === track.fileSize && (!track.detectedDurationSeconds || !entry.detectedDurationSeconds || entry.detectedDurationSeconds === track.detectedDurationSeconds))) flags.add("Same file name, size, and duration");
  if (track.submittedSongTitle && entries.some((entry) => normalizeIdentity(entry.submittedSongTitle) === normalizeIdentity(track.submittedSongTitle) && normalizeIdentity(entry.submittedArtistName) !== normalizeIdentity(track.submittedArtistName))) flags.add("Same source/title with changed artist name");
  const recent = entries.filter((entry) => Date.now() - new Date(entry.createdAt).getTime() < 10 * 60 * 1000).length;
  if (recent >= 5) flags.add("Many attempts in a short time");
  return [...flags];
}

function findSubmissionCooldown(session: QueueSession, track: QueueEntry): number {
  const cooldownSeconds = normalizeSubmissionCooldownSeconds(session.submissionCooldownSeconds);
  if (cooldownSeconds <= 0) return 0;
  const entries = [...session.queue, ...(session.nextInLineTrack ? [session.nextInLineTrack] : []), ...(session.loadedTrack ? [session.loadedTrack] : []), ...session.completed, ...session.removed];
  const submitter = normalizeIdentity(track.submitterArtistName ?? track.submittedArtistName);
  const email = normalizeEmail(track.contactEmail);
  const matching = entries.filter((entry) => {
    if (track.submitterToken && entry.submitterToken === track.submitterToken) return true;
    if (track.normalizedTikTokHandle && entry.normalizedTikTokHandle === track.normalizedTikTokHandle) return true;
    if (submitter && normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) === submitter) return true;
    if (email && normalizeEmail(entry.contactEmail) === email) return true;
    return false;
  });
  const lastSubmittedAt = matching.reduce((latest, entry) => Math.max(latest, new Date(entry.createdAt).getTime()), 0);
  if (!lastSubmittedAt) return 0;
  const elapsedSeconds = Math.floor((Date.now() - lastSubmittedAt) / 1000);
  return Math.max(0, cooldownSeconds - elapsedSeconds);
}

class QueueSubmissionCooldownError extends Error {
  remainingSeconds: number;
  constructor(remainingSeconds: number) {
    super("Submission cooldown active.");
    this.remainingSeconds = remainingSeconds;
  }
}

class QueueSubmissionBlockedError extends Error {
  code: "duplicate_transmission" | "submission_limit";
  reasons: string[];
  constructor(code: "duplicate_transmission" | "submission_limit", reasons: string[]) {
    super(code === "duplicate_transmission" ? "Duplicate transmission detected." : "Submission limit reached for this session.");
    this.code = code;
    this.reasons = reasons;
  }
}

export async function createQueueTrack(input: {
  artist: string;
  title: string;
  submitterArtistName?: string;
  tiktokHandle: string;
  collaboratorNames?: string | null;
  contactEmail?: string | null;
  submitterToken?: string | null;
  link?: string;
  note?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  sourceType?: QueueSourceType;
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
  providerTitle?: string | null;
  detectedDurationSeconds?: number | null;
  durationSource?: QueueDurationSource;
}): Promise<QueueEntry> {
  const sourceType = input.sourceType ?? (input.fileUrl ? "upload" : detectQueueSourceType(input.link ?? ""));
  const submittedArtistName = input.artist.trim();
  const submittedSongTitle = input.title.trim();
  const submitterArtistName = (input.submitterArtistName?.trim() || submittedArtistName).trim();
  const normalizedTikTokHandle = normalizeTikTokHandle(input.tiktokHandle);
  if (!normalizedTikTokHandle) throw new Error("TikTok handle is required.");
  const providerMetadata = sourceType === "upload" ? blankProvider() : await detectProviderMetadata(sourceType, input.link ?? "");
  const providerId = parseProviderId(sourceType, input.link ?? input.fileUrl ?? "");
  const normalizedSourceKey = normalizeQueueSourceKey(input.fileUrl || input.link || "");
  const fileMetadata = sourceType === "upload" ? parseFilenameMetadata(input.fileName) : { artist: null, title: null, providerTitle: null };
  const detectedDurationSeconds = typeof input.detectedDurationSeconds === "number" && Number.isFinite(input.detectedDurationSeconds)
    ? Math.max(1, Math.round(input.detectedDurationSeconds))
    : providerMetadata.detectedDurationSeconds;
  const durationSource = detectedDurationSeconds
    ? input.durationSource ?? providerMetadata.durationSource ?? (sourceType === "upload" ? "upload_metadata" : "provider_metadata")
    : "estimated";

  return normalizeEntry({
    id: generateQueueId(),
    artist: submittedArtistName,
    title: submittedSongTitle,
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
    restoredAt: null,
    spotlightedAt: null,
    note: input.note?.trim() || null,
    submitterArtistName,
    submittedArtistName,
    submittedSongTitle,
    collaboratorNames: input.collaboratorNames?.trim() || null,
    tiktokHandle: normalizedTikTokHandle,
    normalizedTikTokHandle,
    contactEmail: input.contactEmail?.trim() || null,
    submitterToken: input.submitterToken?.trim() || null,
    normalizedSourceKey,
    providerId,
    sourceArtworkUrl: sourceType === "youtube" && providerId?.startsWith("youtube:") ? `https://img.youtube.com/vi/${providerId.slice("youtube:".length)}/hqdefault.jpg` : providerMetadata.artworkUrl ?? null,
    detectedArtistName: input.detectedArtistName ?? providerMetadata.detectedArtistName ?? fileMetadata.artist,
    detectedSongTitle: input.detectedSongTitle ?? providerMetadata.detectedSongTitle ?? fileMetadata.title,
    providerTitle: input.providerTitle ?? providerMetadata.providerTitle ?? fileMetadata.providerTitle,
    fileUrl: input.fileUrl ?? null,
    fileName: input.fileName ?? null,
    fileSize: input.fileSize ?? null,
    mimeType: input.mimeType ?? null,
    sourceType,
    detectedDurationSeconds,
    estimatedDurationSeconds: detectedDurationSeconds ?? INTERNAL_BUFFER_DURATION_SECONDS,
    durationIsEstimate: detectedDurationSeconds === null,
    durationSource,
    priorityUpgradeRequested: false,
    priorityUpgradeStatus: "none",
    priorityUpgradeSource: null,
    priorityUpgradeAt: null,
    priorityUpgradeRequestedAt: null,
    priorityUpgradePaidAt: null,
    priorityUpgradePaymentProvider: null,
    priorityUpgradePaymentId: null,
    priorityUpgradeCheckoutProvider: null,
    priorityUpgradeCheckoutSessionId: null,
    priorityUpgradeCheckoutUrl: null,
    priorityUpgradeCheckoutCreatedAt: null,
    priorityUpgradeCheckoutExpiresAt: null,
    priorityUpgradeAmountCents: null,
    priorityUpgradeCurrency: null,
    displacedFromNextInLineAt: null,
    priorityPausedAt: null,
    priorityResumedAt: null,
    priorityQueueOrderAt: null,
    stagedAsFallbackForLane: null,
    isTestTrack: false,
  });
}

export async function submitRadioTrack(input: Parameters<typeof createQueueTrack>[0]): Promise<QueueEntry> {
  const store = await readStore();
  const session = getSession(store);
  applyPreShowTimer(session);
  if (session.status !== "open" || !session.queueOpen) throw new Error("Queue is closed");
  if (publicStatusForSession(session).isFull) throw new Error("Queue is full for new transmissions.");
  const track = await createQueueTrack(input);
  const duplicateReasons = findDuplicateSubmissionReasons(session, track);
  if (duplicateReasons.length > 0) throw new QueueSubmissionBlockedError("duplicate_transmission", duplicateReasons);
  const blockReasons = findSubmissionLimitBlocks(session, track);
  if (blockReasons.length > 0) throw new QueueSubmissionBlockedError("submission_limit", blockReasons);
  const cooldownRemainingSeconds = findSubmissionCooldown(session, track);
  if (cooldownRemainingSeconds > 0) throw new QueueSubmissionCooldownError(cooldownRemainingSeconds);
  track.suspiciousFlags = suspiciousFlagsFor(session, track);
  session.queue.push(track);
  pullNextInLine(session);
  await writeStore(replaceSession(store, session));
  return track;
}


function wheelEligibleArtistsForSession(session: QueueSession): QueueWheelArtistOption[] {
  const byArtist = new Map<string, QueueWheelArtistOption>();
  for (const entry of sortActive(session.queue)) {
    if (!isWheelEligibleTrack(entry)) continue;
    const artist = submittedArtistForEntry(entry);
    const normalizedArtist = artist.trim().toLowerCase();
    if (!normalizedArtist) continue;
    const existing = byArtist.get(normalizedArtist) ?? { artist, normalizedArtist, trackIds: [], trackCount: 0 };
    existing.trackIds.push(entry.id);
    existing.trackCount = existing.trackIds.length;
    byArtist.set(normalizedArtist, existing);
  }
  return [...byArtist.values()];
}

function submittedArtistForEntry(entry: QueueEntry): string {
  return entry.submitterArtistName ?? entry.submittedArtistName ?? entry.artist;
}

function queueStateFromSession(session: QueueSession, store: QueueStore, viewedSessionId = session.sessionId): QueueState {
  const normalized = normalizeSession(session);
  const isCurrentSession = normalized.sessionId === store.activeSessionId && normalized.status !== "archived";
  return {
    nowPlaying: getLoadedTrack(normalized),
    queue: normalized.queue,
    history: normalized.completed,
    totalPlayed: normalized.completed.length,
    streamStatus: normalized.status !== "archived" && (normalized.queueOpen || normalized.showStarted) ? "online" : "offline",
    removed: normalized.removed,
    spotlight: normalized.spotlight,
    publicStatus: normalized.publicStatus,
    session: summarizeSession(normalized),
    nextInLine: getNextInLine(normalized),
    loadedTrack: getLoadedTrack(normalized),
    autoRoutingPaused: normalized.autoRoutingPaused === true,
    nextNonPriorityLane: normalized.nextNonPriorityLane,
    wheelEligibleArtists: wheelEligibleArtistsForSession(normalized),
    sessions: store.sessions.map(summarizeSession).sort((a, b) => b.showDate.localeCompare(a.showDate) || b.createdAt.localeCompare(a.createdAt)),
    viewedSessionId,
    readOnly: !isCurrentSession,
    isCurrentSession,
  };
}

export async function getRadioQueueState(sessionId?: string): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store, sessionId);
  if (session.status !== "archived") {
    applyPreShowTimer(session);
    pullNextInLine(session);
    await writeStore(replaceSession(store, session));
    return queueStateFromSession(session, replaceSession(store, session), sessionId ?? store.activeSessionId);
  }
  return queueStateFromSession(session, store, sessionId ?? store.activeSessionId);
}

async function resolvePublicArtworkForSession(session: QueueSession): Promise<boolean> {
  let changed = false;
  const entries = [
    ...session.queue,
    ...(session.nextInLineTrack ? [session.nextInLineTrack] : []),
    ...(session.loadedTrack ? [session.loadedTrack] : []),
    ...session.completed,
  ];
  for (const entry of entries) {
    const normalized = normalizeEntry(entry);
    if (!entry.providerId) {
      const providerId = parseProviderId(normalized.sourceType ?? "other", entry.link || entry.fileUrl || "");
      if (providerId) {
        entry.providerId = providerId;
        changed = true;
      }
    }
    if (entry.sourceArtworkUrl) continue;
    if (normalized.sourceType === "youtube") {
      const videoId = parseYouTubeVideoId(entry.link);
      if (videoId) {
        entry.sourceArtworkUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        changed = true;
      }
      continue;
    }
    if (normalized.sourceType === "spotify" || normalized.sourceType === "soundcloud") {
      const metadata = await detectProviderMetadata(normalized.sourceType, entry.link);
      if (metadata.artworkUrl) {
        entry.sourceArtworkUrl = metadata.artworkUrl;
        changed = true;
      }
      if (!entry.providerTitle && metadata.providerTitle) {
        entry.providerTitle = metadata.providerTitle;
        changed = true;
      }
    }
  }
  return changed;
}


function publicSourceUrlForTrack(entry: QueueEntry): string | null {
  if ((entry.sourceType ?? "other") === "upload") return null;
  const raw = entry.link?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function publicArtworkUrlForTrack(entry: QueueEntry): string | null {
  const artworkUrl = getTrackArtworkUrl(entry) ?? ((entry.sourceType ?? "other") === "upload" ? entry.sourceArtworkUrl ?? null : null);
  if (!artworkUrl) return null;
  try {
    const parsed = new URL(artworkUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.hostname.endsWith(".private.blob.vercel-storage.com") && parsed.pathname.startsWith("/barcode-radio-queue/")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function toPublicQueueTrack(entry: QueueEntry): QueuePublicTrack {
  const normalized = normalizeEntry(entry);
  const isUpload = (normalized.sourceType ?? "other") === "upload";
  return {
    id: normalized.id,
    submittedArtistName: normalized.submittedArtistName ?? normalized.artist,
    submittedSongTitle: normalized.submittedSongTitle ?? normalized.title,
    detectedArtistName: isUpload ? null : normalized.detectedArtistName ?? null,
    detectedSongTitle: isUpload ? null : normalized.detectedSongTitle ?? null,
    providerTitle: isUpload ? null : normalized.providerTitle ?? null,
    sourceType: normalized.sourceType ?? "other",
    lane: normalized.lane ?? "regular",
    durationLabel: normalized.durationIsEstimate ? "estimated/pending" : formatRuntime(getTrackRuntimeSeconds(normalized)),
    durationIsEstimate: normalized.durationIsEstimate ?? true,
    sourceArtworkUrl: publicArtworkUrlForTrack(normalized),
    publicSourceUrl: publicSourceUrlForTrack(normalized),
    tiktokHandle: normalized.tiktokHandle ?? null,
    priorityUpgradeRequested: normalized.priorityUpgradeRequested === true,
    priorityUpgradeStatus: normalized.priorityUpgradeStatus ?? "none",
  };
}

function publicSubmitterStatus(session: QueueSession, identity?: { submitterToken?: string | null; tiktokHandle?: string | null; contactEmail?: string | null; artist?: string | null }): QueuePublicSnapshot["submitterStatus"] {
  const token = identity?.submitterToken?.trim();
  const tikTok = identity?.tiktokHandle ? normalizeTikTokHandle(identity.tiktokHandle) : "";
  const email = normalizeEmail(identity?.contactEmail);
  const artist = normalizeIdentity(identity?.artist);
  if (!token && !tikTok && !email && !artist) return null;

  const entries = [...session.queue, ...(session.nextInLineTrack ? [session.nextInLineTrack] : []), ...(session.loadedTrack ? [session.loadedTrack] : []), ...session.completed, ...session.removed];
  const matching = entries.filter((entry) => {
    if (token && entry.submitterToken === token) return true;
    if (tikTok && entry.normalizedTikTokHandle === tikTok) return true;
    if (email && normalizeEmail(entry.contactEmail) === email) return true;
    if (artist && normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) === artist) return true;
    return false;
  });
  const latest = matching.reduce((time, entry) => Math.max(time, new Date(entry.createdAt).getTime()), 0);
  const cooldownSeconds = normalizeSubmissionCooldownSeconds(session.submissionCooldownSeconds);
  const cooldownRemainingSeconds = latest && cooldownSeconds > 0 ? Math.max(0, cooldownSeconds - Math.floor((Date.now() - latest) / 1000)) : 0;
  const limit = session.trackLimitPerArtist ?? 3;
  return {
    used: matching.length,
    limit,
    remaining: Math.max(0, limit - matching.length),
    cooldownRemainingSeconds,
    submitted: matching.slice(0, limit).map(toPublicQueueTrack).map(({ id, submittedArtistName, submittedSongTitle, sourceType, lane, durationLabel }) => ({ id, submittedArtistName, submittedSongTitle, sourceType, lane, durationLabel })),
  };
}

export async function getPublicQueueSnapshot(sessionId?: string, identity?: { submitterToken?: string | null; tiktokHandle?: string | null; contactEmail?: string | null; artist?: string | null }): Promise<QueuePublicSnapshot> {
  const store = await readStore();
  const session = getSession(store, sessionId);
  let changed = false;
  if (session.status !== "archived") {
    changed = applyPreShowTimer(session) || changed;
    pullNextInLine(session);
    changed = true;
  }
  changed = (await resolvePublicArtworkForSession(session)) || changed;
  if (changed) await writeStore(replaceSession(store, session));
  const normalized = normalizeSession(session);
  return { session: summarizeSession(normalized), status: normalized.publicStatus, queue: normalized.queue.map(toPublicQueueTrack), completed: normalized.completed.slice(0, 10).map(toPublicQueueTrack), nowPlaying: normalized.loadedTrack ? toPublicQueueTrack(normalized.loadedTrack) : null, upNext: normalized.nextInLineTrack ? toPublicQueueTrack(normalized.nextInLineTrack) : null, submitterStatus: publicSubmitterStatus(normalized, identity) };
}

export async function requestPriorityUpgradePlaceholder(id: string): Promise<QueuePublicTrack | null> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived" || !session.priorityUpgradesEnabled) return null;
  const now = new Date().toISOString();
  let updated: QueueEntry | null = null;
  const update = (entry: QueueEntry): QueueEntry => normalizeEntry({
    ...entry,
    priorityUpgradeRequested: true,
    priorityUpgradeStatus: entry.priorityUpgradeStatus === "manual" || entry.priorityUpgradeStatus === "paid" ? entry.priorityUpgradeStatus : "requested",
    priorityUpgradeSource: entry.priorityUpgradeSource ?? "public_placeholder",
    priorityUpgradeAt: entry.priorityUpgradeAt ?? now,
    priorityUpgradeRequestedAt: entry.priorityUpgradeRequestedAt ?? now,
  });
  session.queue = session.queue.map((entry) => {
    if (entry.id !== id) return entry;
    updated = update(entry);
    return updated;
  });
  if (!updated && session.nextInLineTrack?.id === id) {
    session.nextInLineTrack = update(session.nextInLineTrack);
    updated = session.nextInLineTrack;
  }
  if (!updated && session.loadedTrack?.id === id) {
    session.loadedTrack = update(session.loadedTrack);
    updated = session.loadedTrack;
  }
  if (!updated) return null;
  await writeStore(replaceSession(store, session));
  return toPublicQueueTrack(updated);
}


export interface PriorityCheckoutRequestResult {
  session: QueueSessionSummary;
  track: QueueEntry;
  amountCents: number;
  currency: string;
  label: string;
}

export interface StripePriorityPaymentMetadata {
  paymentId: string;
  amountCents: number;
  currency: string;
  paidAt?: string;
}

export async function requestPriorityCheckout(trackId: string, queueSessionId: string): Promise<PriorityCheckoutRequestResult> {
  const store = await readStore();
  const session = getSession(store, queueSessionId);
  if (session.sessionId !== store.activeSessionId || session.status !== "open" || !session.queueOpen) throw new Error("Priority Signal upgrades are available only while this broadcast queue is open.");
  if (!session.priorityUpgradesEnabled || !session.priorityUpgradePaymentsEnabled) throw new Error("Priority Signal upgrades are unavailable for this broadcast.");
  const amountCents = normalizePriceCents(session.priorityUpgradePriceCents);
  if (amountCents <= 0) throw new Error("Priority Signal upgrade price is not configured yet.");
  const index = session.queue.findIndex((entry) => entry.id === trackId);
  if (index < 0) throw new Error("Priority Signal Upgrade is not available for this track.");
  const track = normalizeEntry(session.queue[index]);
  if (track.status !== "queued" || (track.lane !== "regular" && track.lane !== "wheel") || track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "paid_needs_attention") throw new Error("Priority Signal Upgrade is not available for this track.");
  return { session: summarizeSession(session), track, amountCents, currency: normalizeCurrency(session.priorityUpgradeCurrency), label: session.priorityUpgradeLabel || DEFAULT_PRIORITY_UPGRADE_LABEL };
}

export async function markPriorityUpgradeCheckoutPending(trackId: string, queueSessionId: string, metadata: { provider?: string; checkoutSessionId?: string; checkoutUrl?: string; checkoutCreatedAt?: string | null; checkoutExpiresAt?: string | null } = {}): Promise<QueuePublicTrack | null> {
  const store = await readStore();
  const session = getSession(store, queueSessionId);
  if (session.sessionId !== store.activeSessionId || session.status === "archived") return null;
  const now = new Date().toISOString();
  const update = (entry: QueueEntry): QueueEntry => normalizeEntry({
    ...entry,
    priorityUpgradeRequested: true,
    priorityUpgradeStatus: entry.priorityUpgradeStatus === "paid" ? "paid" : "checkout_pending",
    priorityUpgradeSource: metadata.provider === "stripe" ? "stripe" : "future_payment",
    priorityUpgradeAt: entry.priorityUpgradeAt ?? now,
    priorityUpgradeRequestedAt: entry.priorityUpgradeRequestedAt ?? now,
    priorityUpgradePaymentProvider: entry.priorityUpgradePaymentProvider ?? metadata.provider ?? null,
    priorityUpgradePaymentId: entry.priorityUpgradePaymentId ?? null,
    priorityUpgradeCheckoutProvider: metadata.provider ?? entry.priorityUpgradeCheckoutProvider ?? null,
    priorityUpgradeCheckoutSessionId: metadata.checkoutSessionId ?? entry.priorityUpgradeCheckoutSessionId ?? null,
    priorityUpgradeCheckoutUrl: metadata.checkoutUrl ?? entry.priorityUpgradeCheckoutUrl ?? null,
    priorityUpgradeCheckoutCreatedAt: metadata.checkoutCreatedAt ?? entry.priorityUpgradeCheckoutCreatedAt ?? now,
    priorityUpgradeCheckoutExpiresAt: metadata.checkoutExpiresAt ?? entry.priorityUpgradeCheckoutExpiresAt ?? null,
  });
  const index = session.queue.findIndex((entry) => entry.id === trackId);
  if (index < 0) return null;
  session.queue[index] = update(session.queue[index]);
  await writeStore(replaceSession(store, session));
  return toPublicQueueTrack(session.queue[index]);
}

export async function markPriorityUpgradePaidFromStripe(trackId: string, queueSessionId: string, payment: StripePriorityPaymentMetadata): Promise<{ updated: boolean; reason?: string; track?: QueueEntry }> {
  const store = await readStore();
  const session = store.sessions.find((item) => item.sessionId === queueSessionId);
  if (!session) return { updated: false, reason: "missing_session" };
  const normalized = normalizeSession(session);
  if (normalized.status === "archived") return { updated: false, reason: "archived_session" };
  const canMoveIntoPriority = normalized.sessionId === store.activeSessionId && normalized.status === "open";
  const now = payment.paidAt ?? new Date().toISOString();
  const paidFields = (status: QueueEntry["priorityUpgradeStatus"]): Partial<QueueEntry> => ({
    priorityUpgradeRequested: true,
    priorityUpgradeStatus: status,
    priorityUpgradeSource: "stripe",
    priorityUpgradeAt: now,
    priorityUpgradeRequestedAt: now,
    priorityUpgradePaidAt: now,
    priorityUpgradePaymentProvider: "stripe",
    priorityUpgradePaymentId: payment.paymentId,
    priorityPausedAt: null,
    priorityResumedAt: null,
    priorityQueueOrderAt: now,
    priorityUpgradeCheckoutProvider: null,
    priorityUpgradeCheckoutSessionId: null,
    priorityUpgradeCheckoutUrl: null,
    priorityUpgradeCheckoutCreatedAt: null,
    priorityUpgradeCheckoutExpiresAt: null,
    priorityUpgradeAmountCents: normalizePriceCents(payment.amountCents),
    priorityUpgradeCurrency: normalizeCurrency(payment.currency),
    ...(status === "paid" ? { displacedFromNextInLineAt: null } : {}),
  });
  const markPaid = (entry: QueueEntry, moveToPriority: boolean): QueueEntry => normalizeEntry({
    ...entry,
    ...paidFields(moveToPriority ? "paid" : "paid_needs_attention"),
    ...(moveToPriority ? { lane: "priority" as QueueLane, tier: "fastlane" as QueueTier, status: "queued" as const } : {}),
  });

  const queueIndex = normalized.queue.findIndex((entry) => entry.id === trackId);
  if (queueIndex >= 0) {
    const existing = normalized.queue[queueIndex];
    if (existing.priorityUpgradeStatus === "paid" || existing.priorityUpgradeStatus === "paid_needs_attention") return { updated: false, reason: "already_paid", track: existing };
    normalized.queue.splice(queueIndex, 1);
    const alreadyQueued = normalized.queue.some((entry) => entry.id === trackId);
    const updated = markPaid(existing, canMoveIntoPriority);
    if (!alreadyQueued) normalized.queue.push(updated);
    normalized.queue = sortActive(normalized.queue);
    resolveNextInLine(normalized);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, track: updated };
  }

  if (normalized.nextInLineTrack?.id === trackId) {
    normalized.nextInLineTrack = markPaid(normalized.nextInLineTrack, false);
    resolveNextInLine(normalized);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, track: normalized.nextInLineTrack };
  }

  if (normalized.loadedTrack?.id === trackId) {
    normalized.loadedTrack = markPaid(normalized.loadedTrack, false);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, track: normalized.loadedTrack };
  }

  const completedIndex = normalized.completed.findIndex((entry) => entry.id === trackId);
  if (completedIndex >= 0) {
    normalized.completed[completedIndex] = markPaid(normalized.completed[completedIndex], false);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, reason: "completed_track_recorded", track: normalized.completed[completedIndex] };
  }

  const removedIndex = normalized.removed.findIndex((entry) => entry.id === trackId);
  if (removedIndex >= 0) {
    normalized.removed[removedIndex] = markPaid(normalized.removed[removedIndex], false);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, reason: "removed_track_recorded", track: normalized.removed[removedIndex] };
  }

  return { updated: false, reason: "missing_track" };
}

export interface QueueSessionSubmitterRow {
  sessionId: string;
  sessionTitle: string;
  showDate: string;
  submitterArtistName: string;
  submittedArtistName: string;
  submittedSongTitle: string;
  tiktokHandle: string;
  contactEmail: string;
  sourceLink: string;
  sourceType: string;
  submittedAt: string;
  status: string;
  lane: string;
  spotlight: boolean;
}

function sessionEntriesForExport(session: QueueSession): QueueEntry[] {
  return [
    ...(session.loadedTrack ? [session.loadedTrack] : []),
    ...(session.nextInLineTrack ? [session.nextInLineTrack] : []),
    ...session.queue,
    ...session.completed,
    ...session.removed,
  ];
}

function exportRowsForSession(session: QueueSession): QueueSessionSubmitterRow[] {
  const spotlightIds = new Set(session.spotlight.map((entry) => entry.id));
  return sessionEntriesForExport(session).map((entry) => ({
    sessionId: session.sessionId,
    sessionTitle: session.title,
    showDate: session.showDate,
    submitterArtistName: entry.submitterArtistName ?? entry.submittedArtistName ?? entry.artist,
    submittedArtistName: entry.submittedArtistName ?? entry.artist,
    submittedSongTitle: entry.submittedSongTitle ?? entry.title,
    tiktokHandle: entry.tiktokHandle ?? entry.normalizedTikTokHandle ?? "",
    contactEmail: entry.contactEmail ?? "",
    sourceLink: entry.link,
    sourceType: entry.sourceType ?? "other",
    submittedAt: entry.createdAt,
    status: entry.status,
    lane: entry.lane ?? "regular",
    spotlight: spotlightIds.has(entry.id),
  }));
}

function csvEscape(value: string | number | boolean): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function getQueueSessionSubmitterList(sessionId?: string): Promise<{ session: QueueSessionSummary; rows: QueueSessionSubmitterRow[] }> {
  const store = await readStore();
  const session = normalizeSession(getSession(store, sessionId));
  return { session: summarizeSession(session), rows: exportRowsForSession(session) };
}

export async function getQueueSessionSubmissionsCsv(sessionId?: string): Promise<{ filename: string; csv: string }> {
  const { session, rows } = await getQueueSessionSubmitterList(sessionId);
  const headers = ["sessionId", "session title", "show date", "submitted artist / submitter artist", "public/display artist credit", "song title", "TikTok handle", "email/contact", "source link", "source type", "submitted timestamp", "current status", "current lane", "spotlight"];
  const body = rows.map((row) => [row.sessionId, row.sessionTitle, row.showDate, row.submitterArtistName, row.submittedArtistName, row.submittedSongTitle, row.tiktokHandle, row.contactEmail, row.sourceLink, row.sourceType, row.submittedAt, row.status, row.lane, row.spotlight].map(csvEscape).join(","));
  const safeDate = session.showDate || new Date().toISOString().slice(0, 10);
  return { filename: `barcode-radio-session-${safeDate}-submissions.csv`, csv: [headers.map(csvEscape).join(","), ...body].join("\n") };
}

export async function updatePriorityUpgradeSettings(input: PriorityUpgradeSettingsInput): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return queueStateFromSession(session, store);
  const priorityUpgradePriceCents = normalizePriceCents(input.priceCents ?? session.priorityUpgradePriceCents);
  const priorityPaidEnabled = normalizePaidPriorityEnabled({ priorityUpgradesEnabled: input.enabled, priorityUpgradePaymentsEnabled: input.paymentsEnabled, priorityUpgradePriceCents });
  const next = normalizeSession({
    ...session,
    priorityUpgradesEnabled: priorityPaidEnabled,
    priorityUpgradeLabel: input.label?.trim() || DEFAULT_PRIORITY_UPGRADE_LABEL,
    priorityUpgradeInstructions: input.instructions?.trim() || DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS,
    priorityUpgradePriceCents,
    priorityUpgradeCurrency: normalizeCurrency(input.currency ?? session.priorityUpgradeCurrency),
    priorityUpgradePaymentsEnabled: priorityPaidEnabled,
    updatedAt: new Date().toISOString(),
  });
  const nextStore = replaceSession(store, next);
  await writeStore(nextStore);
  return queueStateFromSession(next, nextStore);
}

export async function updateSubmissionCooldownSettings(input: { submissionCooldownSeconds?: number }): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return queueStateFromSession(session, store);
  const next = normalizeSession({
    ...session,
    submissionCooldownSeconds: normalizeSubmissionCooldownSeconds(input.submissionCooldownSeconds),
    updatedAt: new Date().toISOString(),
  });
  const nextStore = replaceSession(store, next);
  await writeStore(nextStore);
  return queueStateFromSession(next, nextStore);
}

export async function setQueueOpen(isOpen: boolean): Promise<QueuePublicStatus> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return session.publicStatus;

  const now = new Date();
  const sessions = store.sessions.map((item) => {
    if (item.sessionId === session.sessionId) {
      const openingPreShow = isOpen && item.showStarted !== true;
      return normalizeSession({ ...item, queueOpen: isOpen, status: isOpen ? "open" : "closed", preShowEndsAt: openingPreShow ? (item.queueOpen && item.preShowEndsAt ? item.preShowEndsAt : preShowEndsAtFrom(now)) : item.preShowEndsAt ?? null, updatedAt: now.toISOString() });
    }
    if (isOpen && item.status === "open") {
      return normalizeSession({ ...item, queueOpen: false, status: "closed", updatedAt: now.toISOString() });
    }
    return item;
  });
  const nextStore = { ...store, sessions };
  await writeStore(nextStore);
  return publicStatusForSession(getSession(nextStore));
}

export async function startNewQueueSession(options: { title?: string; showDate?: string; description?: string; trackLimitPerArtist?: number; queueCapacity?: number; skipGameTapTarget?: number; submissionCooldownSeconds?: number; priorityUpgradesEnabled?: boolean; priorityUpgradeLabel?: string; priorityUpgradeInstructions?: string; priorityUpgradePriceCents?: number; priorityUpgradeCurrency?: string; priorityUpgradePaymentsEnabled?: boolean } = {}): Promise<QueueState> {
  const store = await readStore();
  const current = getSession(store);
  if (current.status === "open" || current.queueOpen) return queueStateFromSession(current, store);
  const preserved = store.sessions.map((session) => session.sessionId === store.activeSessionId && session.status !== "archived" ? normalizeSession({ ...session, status: "closed", queueOpen: false, updatedAt: new Date().toISOString() }) : session);
  const next = defaultSession(options);
  const nextStore = { activeSessionId: next.sessionId, sessions: [next, ...preserved] };
  await writeStore(nextStore);
  return queueStateFromSession(next, nextStore);
}

export async function archiveCurrentQueueSession(): Promise<QueueState> {
  const store = await readStore();
  const session = normalizeSession({ ...getSession(store), status: "archived", queueOpen: false, showStarted: false, updatedAt: new Date().toISOString() });
  const archivedStore = replaceSession(store, session);
  const active = archivedStore.sessions.find((item) => item.status === "open" || item.status === "prepared") ?? session;
  archivedStore.activeSessionId = active.sessionId;
  await writeStore(archivedStore);
  return queueStateFromSession(session, archivedStore, session.sessionId);
}

export async function activateQueueSession(sessionId: string): Promise<QueueState> {
  const store = await readStore();
  const target = store.sessions.find((session) => session.sessionId === sessionId);
  if (!target || target.status === "archived") return queueStateFromSession(target ?? getSession(store), store, sessionId);
  const sessions = store.sessions.map((session) => normalizeSession({ ...session, status: session.sessionId === sessionId ? "prepared" : session.status === "archived" ? "archived" : "closed", queueOpen: false, updatedAt: new Date().toISOString() }));
  const active = sessions.find((session) => session.sessionId === sessionId) ?? sessions[0];
  const nextStore = { activeSessionId: active.sessionId, sessions };
  await writeStore(nextStore);
  return queueStateFromSession(active, nextStore);
}

function priorityUpgradeMetadata(entry: QueueEntry, lane: QueueLane): Partial<QueueEntry> {
  if (lane !== "priority") return { displacedFromNextInLineAt: null, priorityPausedAt: null, priorityResumedAt: null, priorityQueueOrderAt: null, stagedAsFallbackForLane: null, ...(entry.priorityUpgradeStatus === "manual" ? { priorityUpgradeRequested: false, priorityUpgradeStatus: "none" as const, priorityUpgradeSource: null, priorityUpgradeAt: null, priorityUpgradeRequestedAt: null } : {}) };
  const now = new Date().toISOString();
  return { priorityUpgradeRequested: true, priorityUpgradeStatus: "manual", priorityUpgradeSource: "admin", priorityUpgradeAt: now, priorityUpgradeRequestedAt: entry.priorityUpgradeRequestedAt ?? now, priorityPausedAt: null, priorityResumedAt: null, priorityQueueOrderAt: now, stagedAsFallbackForLane: null, displacedFromNextInLineAt: null };
}


function priorityUpgradeAdminCorrection(entry: QueueEntry, action: QueueAdminAction): QueueEntry {
  const now = new Date().toISOString();
  if (action === "markPriorityRequested") {
    return normalizeEntry({ ...entry, priorityUpgradeRequested: true, priorityUpgradeStatus: "requested", priorityUpgradeSource: entry.priorityUpgradeSource ?? "public_placeholder", priorityUpgradeAt: entry.priorityUpgradeAt ?? now, priorityUpgradeRequestedAt: entry.priorityUpgradeRequestedAt ?? now });
  }
  if (action === "markPriorityCheckoutPending") {
    const lane = (entry.lane ?? "regular") === "priority" ? "regular" : entry.lane ?? "regular";
    return normalizeEntry({ ...entry, lane, tier: lane === "wheel" ? "frontrow" : "free", priorityUpgradeRequested: true, priorityUpgradeStatus: "checkout_pending", priorityUpgradeSource: "future_payment", priorityUpgradeAt: entry.priorityUpgradeAt ?? now, priorityUpgradeRequestedAt: entry.priorityUpgradeRequestedAt ?? now, priorityPausedAt: null, priorityResumedAt: null, priorityQueueOrderAt: null, displacedFromNextInLineAt: null });
  }
  return normalizeEntry({ ...entry, lane: "priority", tier: "fastlane", priorityUpgradeRequested: true, priorityUpgradeStatus: "manual", priorityUpgradeSource: "admin", priorityUpgradeAt: entry.priorityUpgradeAt ?? now, priorityUpgradeRequestedAt: entry.priorityUpgradeRequestedAt ?? now, priorityPausedAt: null, priorityResumedAt: null, priorityQueueOrderAt: entry.priorityQueueOrderAt ?? now, stagedAsFallbackForLane: null, displacedFromNextInLineAt: null });
}

function pausePriorityTrack(session: QueueSession, id: string): boolean {
  const now = new Date().toISOString();
  const pause = (entry: QueueEntry): QueueEntry | null => {
    if ((entry.lane ?? "regular") !== "priority" || (entry.priorityUpgradeStatus !== "paid" && entry.priorityUpgradeStatus !== "manual")) return null;
    return normalizeEntry({ ...entry, status: "queued", priorityPausedAt: entry.priorityPausedAt ?? now, priorityResumedAt: null, priorityQueueOrderAt: now });
  };
  const queueIndex = session.queue.findIndex((entry) => entry.id === id);
  if (queueIndex >= 0) {
    const paused = pause(session.queue[queueIndex]);
    if (!paused) return false;
    session.queue[queueIndex] = paused;
    resolveNextInLine(session, undefined, true);
    return true;
  }
  if (session.nextInLineTrack?.id === id) {
    const paused = pause(session.nextInLineTrack);
    if (!paused) return false;
    clearNextInLine(session);
    session.queue.push(paused);
    session.queue = sortActive(session.queue);
    resolveNextInLine(session, undefined, true);
    return true;
  }
  if (session.loadedTrack?.id === id) {
    const paused = pause(session.loadedTrack);
    if (!paused) return false;
    clearLoadedTrack(session);
    session.queue.push(paused);
    session.queue = sortActive(session.queue);
    resolveNextInLine(session, undefined, true);
    return true;
  }
  return false;
}

function resumePriorityTrack(session: QueueSession, id: string): boolean {
  const now = new Date().toISOString();
  const resume = (entry: QueueEntry): QueueEntry | null => {
    if ((entry.lane ?? "regular") !== "priority" || (entry.priorityUpgradeStatus !== "paid" && entry.priorityUpgradeStatus !== "manual") || !isPausedPriorityTrack(entry)) return null;
    return normalizeEntry({ ...entry, status: "queued", priorityPausedAt: null, priorityResumedAt: now, priorityQueueOrderAt: now });
  };
  const queueIndex = session.queue.findIndex((entry) => entry.id === id);
  if (queueIndex < 0) return false;
  const resumed = resume(session.queue[queueIndex]);
  if (!resumed) return false;
  session.queue[queueIndex] = resumed;
  session.queue = sortActive(session.queue);
  resolveNextInLine(session, undefined, true);
  return true;
}

function applyPriorityUpgradeAdminCorrection(session: QueueSession, id: string, action: QueueAdminAction): boolean {
  if (action !== "markPriorityManual" && action !== "markPriorityRequested" && action !== "markPriorityCheckoutPending") return false;
  const queueIndex = session.queue.findIndex((entry) => entry.id === id);
  if (queueIndex >= 0) {
    session.queue[queueIndex] = priorityUpgradeAdminCorrection(session.queue[queueIndex], action);
    return true;
  }
  if (session.nextInLineTrack?.id === id) {
    session.nextInLineTrack = priorityUpgradeAdminCorrection(session.nextInLineTrack, action);
    return true;
  }
  if (session.loadedTrack?.id === id) {
    session.loadedTrack = priorityUpgradeAdminCorrection(session.loadedTrack, action);
    return true;
  }
  return false;
}

function restoreEntry(entry: QueueEntry, lane: QueueLane): QueueEntry {
  return normalizeEntry({ ...entry, lane, tier: lane === "priority" ? "fastlane" : "free", status: "queued", createdAt: new Date().toISOString(), playedAt: null, completedAt: null, removedAt: null, restoredAt: new Date().toISOString(), displacedFromNextInLineAt: null, ...priorityUpgradeMetadata(entry, lane) });
}

const SIMULATION_TRACK_NOTE = "[QUEUE SIMULATION TRACK]";
const SIMULATION_ARTISTS = ["Glass Circuit", "Motel Satellite", "Neon Janitor", "Cold Pager", "Velvet Firewall", "Ghost Copier", "Cassette Animal", "Blue Exit", "Static Orchard", "Paper Terminal", "Night Receipt", "Dust Channel", "Soft Reboot", "Broken Antenna", "Chrome Basement", "Signal Dog"];
const SIMULATION_TITLES = ["Static Bloom", "Afterimage", "Dust Channel", "Midnight Receipt", "Soft Reboot", "Paper Teeth", "Room Tone", "No Signal Home", "Borrowed Thunder", "Plastic Moon", "Dead Mall Weather", "Return Path", "Window Error", "Ghost Light", "Low Battery Saint", "Frequency Teeth"];

function isSimulationTrack(entry: QueueEntry | null | undefined): boolean {
  if (!entry) return false;
  return entry.isTestTrack === true || entry.note?.includes(SIMULATION_TRACK_NOTE) === true || entry.artist.startsWith("SIM ") || entry.title.startsWith("SIM ");
}

function simulationSequence(session: QueueSession): number {
  const entries = [
    ...session.queue,
    ...(session.nextInLineTrack ? [session.nextInLineTrack] : []),
    ...(session.loadedTrack ? [session.loadedTrack] : []),
    ...session.completed,
    ...session.removed,
    ...session.spotlight,
  ];
  return entries.filter(isSimulationTrack).length + 1;
}

function simulationTrackBase(session: QueueSession): QueueEntry {
  const sequence = simulationSequence(session);
  const number = String(sequence).padStart(3, "0");
  const baseArtist = SIMULATION_ARTISTS[(sequence - 1) % SIMULATION_ARTISTS.length];
  const artist = `${baseArtist} ${number}`;
  const title = SIMULATION_TITLES[(sequence - 1) % SIMULATION_TITLES.length];
  const now = new Date().toISOString();
  return normalizeEntry({
    id: generateQueueId(),
    artist,
    title,
    link: `https://example.com/sim-track-${number}`,
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    status: "queued",
    createdAt: now,
    playedAt: null,
    completedAt: null,
    removedAt: null,
    restoredAt: null,
    spotlightedAt: null,
    note: `${SIMULATION_TRACK_NOTE} SIM ${number}. Admin-only queue engine simulation data.`,
    submitterArtistName: artist,
    submittedArtistName: artist,
    submittedSongTitle: title,
    collaboratorNames: null,
    tiktokHandle: `@sim_track_${number}`,
    normalizedTikTokHandle: `sim_track_${number}`,
    contactEmail: `sim-track-${number}@example.com`,
    submitterToken: `sim-track-${number}`,
    normalizedSourceKey: `https://example.com/sim-track-${number}`,
    providerId: null,
    sourceArtworkUrl: null,
    suspiciousFlags: [],
    limitMatchReasons: [],
    detectedArtistName: null,
    detectedSongTitle: null,
    providerTitle: null,
    fileUrl: null,
    fileName: null,
    fileSize: null,
    mimeType: null,
    sourceType: "other",
    detectedDurationSeconds: null,
    estimatedDurationSeconds: INTERNAL_BUFFER_DURATION_SECONDS,
    durationIsEstimate: true,
    durationSource: "internal_estimate",
    priorityUpgradeRequested: false,
    priorityUpgradeStatus: "none",
    priorityUpgradeSource: null,
    priorityUpgradeAt: null,
    priorityUpgradeRequestedAt: null,
    priorityUpgradePaidAt: null,
    priorityUpgradePaymentProvider: null,
    priorityUpgradePaymentId: null,
    priorityUpgradeCheckoutProvider: null,
    priorityUpgradeCheckoutSessionId: null,
    priorityUpgradeCheckoutUrl: null,
    priorityUpgradeCheckoutCreatedAt: null,
    priorityUpgradeCheckoutExpiresAt: null,
    priorityUpgradeAmountCents: null,
    priorityUpgradeCurrency: null,
    displacedFromNextInLineAt: null,
    priorityPausedAt: null,
    priorityResumedAt: null,
    priorityQueueOrderAt: null,
    stagedAsFallbackForLane: null,
    isTestTrack: true,
  });
}

function addSimulationTrack(session: QueueSession, action: QueueAdminAction): boolean {
  if (action === "clearSimulationTracks") {
    session.queue = session.queue.filter((entry) => !isSimulationTrack(entry));
    session.completed = session.completed.filter((entry) => !isSimulationTrack(entry));
    session.removed = session.removed.filter((entry) => !isSimulationTrack(entry));
    session.spotlight = session.spotlight.filter((entry) => !isSimulationTrack(entry));
    if (isSimulationTrack(session.nextInLineTrack)) clearNextInLine(session);
    if (isSimulationTrack(session.loadedTrack)) clearLoadedTrack(session);
    pullNextInLine(session, undefined, true);
    return true;
  }

  const now = new Date().toISOString();
  if (action === "addSimulationFreeTrack") {
    session.queue.push(simulationTrackBase(session));
    pullNextInLine(session);
    return true;
  }
  if (action === "addSimulationPaidPriority") {
    session.queue.push(normalizeEntry({
      ...simulationTrackBase(session),
      tier: "fastlane",
      lane: "priority",
      priorityUpgradeRequested: true,
      priorityUpgradeStatus: "paid",
      priorityUpgradeSource: "stripe",
      priorityUpgradeAt: now,
      priorityUpgradeRequestedAt: now,
      priorityUpgradePaidAt: now,
      priorityUpgradePaymentProvider: "stripe",
      priorityUpgradePaymentId: `sim_pi_${Date.now().toString(36)}`,
      priorityUpgradeAmountCents: normalizePriceCents(session.priorityUpgradePriceCents),
      priorityUpgradeCurrency: normalizeCurrency(session.priorityUpgradeCurrency),
      priorityQueueOrderAt: now,
      priorityPausedAt: null,
      priorityResumedAt: null,
      displacedFromNextInLineAt: null,
    }));
    resolveNextInLine(session);
    return true;
  }
  if (action === "addSimulationCheckoutPending") {
    session.queue.push(normalizeEntry({
      ...simulationTrackBase(session),
      tier: "free",
      lane: "regular",
      priorityUpgradeRequested: true,
      priorityUpgradeStatus: "checkout_pending",
      priorityUpgradeSource: "future_payment",
      priorityUpgradeAt: now,
      priorityUpgradeRequestedAt: now,
      priorityUpgradeCheckoutProvider: "stripe",
      priorityUpgradeCheckoutSessionId: `sim_cs_${Date.now().toString(36)}`,
      priorityUpgradeCheckoutUrl: "https://example.com/sim-checkout-pending",
      priorityUpgradeCheckoutCreatedAt: now,
      priorityUpgradeCheckoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }));
    return true;
  }
  if (action === "addSimulationPaymentFailed") {
    session.queue.push(normalizeEntry({
      ...simulationTrackBase(session),
      tier: "free",
      lane: "regular",
      priorityUpgradeRequested: true,
      priorityUpgradeStatus: "failed",
      priorityUpgradeSource: "stripe",
      priorityUpgradeAt: now,
      priorityUpgradeRequestedAt: now,
      priorityUpgradePaymentProvider: "stripe",
      priorityUpgradePaymentId: `sim_failed_${Date.now().toString(36)}`,
    }));
    return true;
  }
  if (action === "addSimulationHeldPriority") {
    session.queue.push(normalizeEntry({
      ...simulationTrackBase(session),
      tier: "fastlane",
      lane: "priority",
      priorityUpgradeRequested: true,
      priorityUpgradeStatus: "paid",
      priorityUpgradeSource: "stripe",
      priorityUpgradeAt: now,
      priorityUpgradeRequestedAt: now,
      priorityUpgradePaidAt: now,
      priorityUpgradePaymentProvider: "stripe",
      priorityUpgradePaymentId: `sim_hold_${Date.now().toString(36)}`,
      priorityUpgradeAmountCents: normalizePriceCents(session.priorityUpgradePriceCents),
      priorityUpgradeCurrency: normalizeCurrency(session.priorityUpgradeCurrency),
      priorityQueueOrderAt: now,
      priorityPausedAt: now,
      priorityResumedAt: null,
      displacedFromNextInLineAt: null,
    }));
    resolveNextInLine(session);
    return true;
  }
  return false;
}

export async function updateRadioTrack(id: string, action: QueueAdminAction): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return queueStateFromSession(session, store);
  applyPreShowTimer(session);

  if (action === "startShow") {
    session.showStarted = true;
    pullNextInLine(session, undefined, true);
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (action === "addWheelSpinOwed") {
    session.wheelSpinsOwed = normalizeWheelSpinsOwed(session.wheelSpinsOwed) + 1;
    if (session.nextNonPriorityLane === "wheel") {
      releaseFallbackNextForLane(session, "wheel");
      resolveNextInLine(session, undefined, true);
    }
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }


  if (addSimulationTrack(session, action)) {
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (applyPriorityUpgradeAdminCorrection(session, id, action)) {
    resolveNextInLine(session, undefined, true);
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (action === "pausePriority" || action === "resumePriority") {
    const changed = action === "pausePriority" ? pausePriorityTrack(session, id) : resumePriorityTrack(session, id);
    if (changed) {
      const nextStore = replaceSession(store, session);
      await writeStore(nextStore);
      return queueStateFromSession(session, nextStore);
    }
  }

  if (action === "pullNext") {
    session.autoRoutingPaused = false;
    session.nextInLineHoldTrackId = null;
    pullNextInLine(session, undefined, true);
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (action === "pullWheelChosen" || action === "pullFreeTransmission") {
    const lane: QueueNonPriorityLane = action === "pullWheelChosen" ? "wheel" : "regular";
    pullNextInLineFromLane(session, lane);
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (action === "removeSpotlight") {
    session.spotlight = session.spotlight.filter((entry) => entry.id !== id);
    await writeStore(replaceSession(store, session));
    return getRadioQueueState();
  }

  if (action === "restoreRegular" || action === "restorePriority") {
    const lane: QueueLane = action === "restorePriority" ? "priority" : "regular";
    const completedIndex = session.completed.findIndex((entry) => entry.id === id);
    const removedIndex = session.removed.findIndex((entry) => entry.id === id);
    const source = completedIndex >= 0 ? session.completed.splice(completedIndex, 1)[0] : removedIndex >= 0 ? session.removed.splice(removedIndex, 1)[0] : null;
    if (source) session.queue.push(restoreEntry(source, lane));
    await writeStore(replaceSession(store, session));
    return getRadioQueueState();
  }

  const index = session.queue.findIndex((entry) => entry.id === id);
  const active = index >= 0 ? session.queue[index] : null;
  const nextInLine = session.nextInLineTrack?.id === id ? session.nextInLineTrack : null;
  const loaded = session.loadedTrack?.id === id ? session.loadedTrack : null;

  if (action === "spotlight") {
    const source = loaded ?? nextInLine ?? active ?? session.completed.find((entry) => entry.id === id) ?? session.removed.find((entry) => entry.id === id);
    if (source && !session.spotlight.some((entry) => entry.id === source.id)) session.spotlight.push({ ...source, spotlightedAt: new Date().toISOString() });
    await writeStore(replaceSession(store, session));
    return getRadioQueueState();
  }

  if (action === "load" && session.loadedTrack && session.loadedTrack.id !== id) {
    return queueStateFromSession(session, store);
  }

  if (loaded) {
    if (action === "moveBack") {
      undoLoadedTrack(session);
    }
    if (action === "finish") {
      session.nextInLineHoldTrackId = null;
      const current = clearLoadedTrack(session);
      if (current) {
        session.completed.unshift({ ...current, status: "played", playedAt: current.playedAt ?? new Date().toISOString(), completedAt: new Date().toISOString() });
        advanceNonPriorityLaneAfter(session, current.lane);
      }
    }
    if (action === "remove") {
      session.nextInLineHoldTrackId = null;
      const current = clearLoadedTrack(session);
      if (current) {
        session.removed.unshift({ ...current, status: "removed", removedAt: new Date().toISOString() });
      }
    }
    if (action !== "moveBack") pullNextInLine(session, session.nextInLineHoldTrackId ?? undefined, true);
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (nextInLine) {
    if (action === "load") {
      if (session.loadedTrack && session.loadedTrack.id !== nextInLine.id) return queueStateFromSession(session, store);
      const previousLane = session.currentTrackPreviousLane;
      const previousIndex = session.currentTrackPreviousIndex;
      const current = clearNextInLine(session);
      if (current) setLoadedTrack(session, current, previousLane, previousIndex, true);
      pullNextInLine(session);
    }
    if (action === "moveBack") {
      const restored = moveNextInLineBackToQueue(session);
      session.nextInLineHoldTrackId = restored?.id ?? null;
      session.autoRoutingPaused = true;
    }
    if (action === "finish") {
      const current = clearNextInLine(session);
      if (current) {
        session.completed.unshift({ ...current, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
        advanceNonPriorityLaneAfter(session, current.lane);
      }
      pullNextInLine(session);
    }
    if (action === "remove") {
      const current = clearNextInLine(session);
      if (current) {
        session.removed.unshift({ ...current, status: "removed", removedAt: new Date().toISOString() });
        if ((current.lane ?? "regular") === "wheel") {
          session.wheelSpinsOwed = normalizeWheelSpinsOwed(session.wheelSpinsOwed) + 1;
          session.autoRoutingPaused = true;
          session.nextInLineHoldTrackId = current.id;
        }
      }
      if ((current?.lane ?? "regular") !== "wheel") pullNextInLine(session);
    }
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (!active) return getRadioQueueState();
  if (action === "load") {
    if (session.loadedTrack && session.loadedTrack.id !== active.id) return queueStateFromSession(session, store);
    setLoadedTrack(session, active, active.lane ?? "regular", index);
  }
  if (action === "priority") {
    session.queue.splice(index, 1);
    session.queue.push(normalizeEntry({ ...active, lane: "priority", tier: "fastlane", status: "queued", ...priorityUpgradeMetadata(active, "priority") }));
  }
  if (action === "regular") {
    session.queue.splice(index, 1);
    session.queue.push(normalizeEntry({ ...active, lane: "regular", tier: "free", status: "queued", ...priorityUpgradeMetadata(active, "regular") }));
  }
  if (action === "wheel" && isWheelEligibleTrack(active)) {
    session.queue.splice(index, 1);
    session.queue.push(normalizeEntry({ ...active, lane: "wheel", tier: "frontrow", status: "queued", displacedFromNextInLineAt: null, stagedAsFallbackForLane: null, priorityPausedAt: null, priorityResumedAt: null, priorityQueueOrderAt: null }));
    session.wheelSpinsOwed = Math.max(0, normalizeWheelSpinsOwed(session.wheelSpinsOwed) - 1);
    handleWheelWinnerSelected(session);
  }
  if (action === "finish") {
    session.queue.splice(index, 1);
    session.completed.unshift({ ...active, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    advanceNonPriorityLaneAfter(session, active.lane);
  }
  if (action === "remove") {
    session.queue.splice(index, 1);
    session.removed.unshift({ ...active, status: "removed", removedAt: new Date().toISOString() });
  }
  pullNextInLine(session);
  await writeStore(replaceSession(store, session));
  return getRadioQueueState();
}

// Legacy-compatible helpers used by archived/OBS components.
export async function addToQueue(entry: Omit<QueueEntry, "id" | "status" | "playedAt">): Promise<QueueEntry> {
  const track = normalizeEntry({ ...entry, id: generateQueueId(), status: "queued", playedAt: null, lane: entry.lane ?? (normalizeTier(entry.tier) === "fastlane" ? "priority" : "regular"), sourceType: entry.sourceType ?? detectQueueSourceType(entry.link) });
  const store = await readStore();
  const session = getSession(store);
  applyPreShowTimer(session);
  session.queue.push(track);
  await writeStore(replaceSession(store, session));
  return track;
}

export async function getQueueState(): Promise<QueueState> { return getRadioQueueState(); }

export async function advanceQueue(): Promise<QueueEntry | null> {
  const store = await readStore();
  const session = getSession(store);
  pullNextInLine(session);
  const next = clearNextInLine(session);
  if (!next) return null;
  session.completed.unshift({ ...next, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  advanceNonPriorityLaneAfter(session, next.lane);
  pullNextInLine(session);
  await writeStore(replaceSession(store, session));
  return getNextInLine(session);
}

export async function resetQueue(): Promise<{ cleared: number; preserved: number }> {
  const store = await readStore();
  const session = getSession(store);
  const cleared = session.queue.length;
  session.queue = [];
  await writeStore(replaceSession(store, session));
  return { cleared, preserved: 0 };
}

export async function getEntry(id: string): Promise<QueueEntry | null> {
  const state = await getRadioQueueState();
  return [...state.queue, ...state.history, ...(state.removed ?? [])].find((entry) => entry.id === id) ?? null;
}

export async function upgradeEntryTier(id: string, newTier: QueueTier, additionalAmount: number): Promise<QueueEntry | null> {
  const store = await readStore();
  const session = getSession(store);
  const index = session.queue.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const updated = normalizeEntry({ ...session.queue[index], tier: newTier === "fastlane" ? session.queue[index].tier : newTier, amount: session.queue[index].amount + additionalAmount, lane: session.queue[index].lane, ...(newTier === "fastlane" ? { priorityUpgradeRequested: true, priorityUpgradeStatus: "checkout_pending" as const, priorityUpgradeSource: "future_payment" as const, priorityUpgradeAt: new Date().toISOString(), priorityUpgradeRequestedAt: new Date().toISOString() } : {}) });
  session.queue[index] = updated;
  await writeStore(replaceSession(store, session));
  return updated;
}

const stripeSessions = new Map<string, string>();
export async function storeStripeSession(sessionId: string, entryId: string): Promise<void> { stripeSessions.set(sessionId, entryId); }
export async function getStripeSessionEntry(sessionId: string): Promise<string | null> { return stripeSessions.get(sessionId) ?? null; }
