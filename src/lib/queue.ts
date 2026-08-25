// ============================================================
// BARCODE RADIO QUEUE OPERATIONS — session-based Redis + memory
// ============================================================

import { Redis } from "@upstash/redis";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { normalizeBroadcastArchiveProjectKey } from "./broadcast-archive";
import { createProviderFetchBudget, fetchProviderJson } from "./provider-fetch";
import { pacificDateString } from "./pacific-time";
import {
  captureQueueDurableSnapshotIfNeeded,
  isQueueDurableSnapshotConfigured,
  persistQueueDurableSnapshot,
  readQueueDurableSnapshot,
} from "./queue-durable-snapshot";
import {
  appendQueuePlaybackEvent,
  emptyQueuePlaybackDiagnostics,
  normalizeQueuePlaybackDiagnostics,
  queuePlaybackHasBegun,
  queuePlaybackOutcomeFields,
  queuePlaybackProviderForSourceType,
  type QueuePlaybackEndpointSnapshot,
} from "./queue-playback-lifecycle";
import {
  appendQueueShowLogEvents,
  normalizeQueueShowLog,
  QUEUE_SHOW_LOG_SCHEMA_VERSION,
} from "./queue-show-log";
import type { QueueShowLogEventInput } from "./queue-show-log";
import { buildQueueShowReport } from "./queue-show-report";
import type { QueueShowReport } from "./queue-show-report";
import { parseIso8601DurationToSeconds, parseSpotifyTrackId, parseYouTubeVideoId as parseTrackDurationYouTubeVideoId } from "./track-duration";
import {
  INTERNAL_BUFFER_DURATION_SECONDS,
  PRIORITY_DISCLOSURE_TEXT,
  PRIORITY_GIFT_ANONYMOUS_NAME,
  PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT,
  PRIORITY_GIFT_ATTRIBUTION_VERSION,
  PRIORITY_TERMS_VERSION,
  SIGNAL_HOLD_DISCLOSURE_TEXT,
  SIGNAL_HOLD_NEXT_TWO_UNAVAILABLE_MESSAGE,
  SIGNAL_HOLD_TERMS_VERSION,
  detectQueueSourceType,
  generateQueueId,
  getTrackRuntimeSeconds,
  getTrackDurationLabel,
  getTrackArtworkUrl,
  isSignalHoldCheckoutNearFront,
  normalizeQueueSessionBnlPublicationStatus,
  normalizeQueueSessionPurpose,
  normalizePriorityGiftDisplayName,
  normalizeTier,
  parseTikTokVideoUrl,
} from "./queue-types";
import type {
  QueueDurationSource,
  QueueEntry,
  QueueHistoricalRecoveryProvenance,
  QueueLegalAcceptance,
  QueueLane,
  QueueNonPriorityLane,
  QueuePlaybackLifecycleEventInput,
  QueuePublicHandleHistory,
  QueuePublicHistoryEvent,
  QueuePublicHistoryEventType,
  QueuePublicHistoryOutcome,
  QueuePublicHistoryTrack,
  QueuePublicProjectHistory,
  QueuePublicSnapshot,
  QueuePublicStats,
  QueuePublicStatsCounts,
  QueuePublicShowStats,
  QueuePublicStatus,
  QueuePublicTrack,
  PriorityGiftAttribution,
  PriorityGiftAttributionInput,
  PriorityLegalAcceptanceInput,
  SignalHoldLegalAcceptanceInput,
  QueueSession,
  QueueSessionBnlPublicationStatus,
  QueueSessionPurpose,
  QueueSessionStatus,
  QueueSessionSummary,
  QueueShowLogEvent,
  QueueShowLogEventDetails,
  QueueShowLogEventType,
  QueueShowLogTrack,
  QueueSubmissionClosureReason,
  QueueSourceType,
  QueueWheelArtistOption,
  QueueState,
  QueueTier,
} from "./queue-types";
import { estimateSponsorBreakPlacement } from "./queue-timing";

const STATE_KEY = "radioQueue:v2:sessions";
const LIVE_STATE_KEY = "radioQueue:v2:live-session";
const LEGACY_STATE_KEY = "radioQueue:v1:state";
const MUTATION_LOCK_KEY = "radioQueue:v2:sessions:mutation-lock";
const MUTATION_REVISION_KEY = "radioQueue:v2:sessions:mutation-revision";
const MUTATION_LOCK_TTL_MS = 15_000;
const MUTATION_LOCK_WAIT_MS = 5_000;
const DEFAULT_QUEUE_CAPACITY = 44;
export const MAX_TRACKS_PER_SUBMITTER = 3;
const DEFAULT_SUBMISSION_COOLDOWN_SECONDS = 5 * 60;
const MAX_SUBMISSION_COOLDOWN_SECONDS = 60 * 60;
const SPONSOR_BREAK_SECONDS = 10 * 60 + 30;
const DEFAULT_PRIORITY_UPGRADE_LABEL = "Priority Signal Upgrade";
const DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS = "Priority Signal Upgrade is being prepared. No payment has been processed.";
const DEFAULT_PRIORITY_UPGRADE_PRICE_CENTS = 1000;
const DEFAULT_PRIORITY_UPGRADE_CURRENCY = "usd";
const DEFAULT_SIGNAL_HOLD_LABEL = "Signal Hold";
const DEFAULT_SIGNAL_HOLD_INSTRUCTIONS = "If we call you and you are not here, Signal Hold moves your track to the bottom instead of removing it. It lasts only for this show. It does not hold your place or guarantee play.";
const DEFAULT_SIGNAL_HOLD_PRICE_CENTS = 0;
const DEFAULT_SIGNAL_HOLD_CURRENCY = "usd";
const PRE_SHOW_ROUTING_DELAY_MS = (20 * 60 + 15) * 1000;
// Uploaded audio is part of the queue record, not disposable request scratch.
// Keep it through the live session and for a recovery window after archival.
const UPLOADED_FILE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const BARCODE_QUEUE_UPLOAD_HOST_SUFFIX = ".private.blob.vercel-storage.com";
const BARCODE_QUEUE_UPLOAD_PATH_PREFIX = "/barcode-radio-queue/";

type QueueAdminAction = "pullNext" | "pullWheelChosen" | "pullFreeTransmission" | "startShow" | "addWheelSpinOwed" | "load" | "finish" | "remove" | "priority" | "regular" | "wheel" | "moveBack" | "spotlight" | "removeSpotlight" | "restoreRegular" | "restorePriority" | "markPriorityManual" | "markPriorityRequested" | "markPriorityCheckoutPending" | "resolvePaidPriority" | "pausePriority" | "resumePriority" | "useSignalHold" | "addSimulationFreeTrack" | "addSimulationPaidPriority" | "addSimulationCheckoutPending" | "addSimulationPaymentFailed" | "addSimulationHeldPriority" | "clearSimulationTracks";

export interface PriorityUpgradeSettingsInput {
  enabled?: boolean;
  label?: string;
  instructions?: string;
  priceCents?: number;
  currency?: string;
  paymentsEnabled?: boolean;
}

export interface SignalHoldSettingsInput {
  enabled?: boolean;
  priceCents?: number;
  currency?: string;
  paymentsEnabled?: boolean;
}

export interface QueueSessionOptions {
  title?: string;
  showDate?: string;
  description?: string;
  purpose?: QueueSessionPurpose;
  bnlPublicationStatus?: QueueSessionBnlPublicationStatus;
  trackLimitPerArtist?: number;
  queueCapacity?: number;
  skipGameTapTarget?: number;
  submissionCooldownSeconds?: number;
  priorityUpgradesEnabled?: boolean;
  priorityUpgradeLabel?: string;
  priorityUpgradeInstructions?: string;
  priorityUpgradePriceCents?: number;
  priorityUpgradeCurrency?: string;
  priorityUpgradePaymentsEnabled?: boolean;
  signalHoldEnabled?: boolean;
  signalHoldPriceCents?: number;
  signalHoldCurrency?: string;
  signalHoldPaymentsEnabled?: boolean;
}

export interface QueueSessionProvenanceInput {
  sessionId?: string;
  purpose: QueueSessionPurpose;
  bnlPublicationStatus: QueueSessionBnlPublicationStatus;
}

interface QueueStore {
  revision: number;
  activeSessionId: string | null;
  sessions: QueueSession[];
}

interface QueueLiveStoreProjection {
  schemaVersion: "queue_live_store_v1";
  revision: number;
  activeSessionId: string | null;
  session: QueueSession | null;
}

interface QueueMutationLease {
  redis: Redis | null;
  token: string | null;
  revision: number;
  store: QueueStore;
}

interface ProviderMetadata {
  detectedArtistName: string | null;
  detectedSongTitle: string | null;
  providerTitle: string | null;
  detectedDurationSeconds: number | null;
  durationSource: QueueDurationSource;
  artworkUrl?: string | null;
}

function getQueueRedisConfig(): { url: string; token: string; dedicated: boolean } | null {
  const dedicatedUrl = process.env.QUEUE_REDIS_REST_URL?.trim();
  const dedicatedToken = process.env.QUEUE_REDIS_REST_TOKEN?.trim();
  if (dedicatedUrl || dedicatedToken) {
    if (!dedicatedUrl || !dedicatedToken) {
      throw new Error("QUEUE_REDIS_REST_URL and QUEUE_REDIS_REST_TOKEN must be configured together.");
    }
    if (process.env.VERCEL_ENV === "production") {
      const queueHostname = normalizedRedisEndpointHostname(dedicatedUrl, "QUEUE_REDIS_REST_URL");
      const sharedUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
      if (sharedUrl && queueHostname === normalizedRedisEndpointHostname(sharedUrl, "UPSTASH_REDIS_REST_URL")) {
        throw new Error("QUEUE_REDIS_REST_URL must use a different Redis endpoint from UPSTASH_REDIS_REST_URL. Queue Redis is not isolated.");
      }
    }
    return { url: dedicatedUrl, token: dedicatedToken, dedicated: true };
  }
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Dedicated QUEUE_REDIS_REST_URL and QUEUE_REDIS_REST_TOKEN are required in Vercel Production.");
  }
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token, dedicated: false };
}

function normalizedRedisEndpointHostname(value: string, label: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.port
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash) throw new Error("unsafe endpoint");
    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, "");
    if (!hostname.endsWith(".upstash.io")) throw new Error("invalid Upstash hostname");
    return hostname;
  } catch {
    throw new Error(`${label} is not a valid HTTPS Redis endpoint.`);
  }
}

function getDedicatedQueueRecoveryRedisConfig(): { url: string; token: string; dedicated: true } {
  const config = getQueueRedisConfig();
  if (!config?.dedicated) {
    throw new Error("Dedicated QUEUE_REDIS_REST_URL and QUEUE_REDIS_REST_TOKEN are not configured. Queue recovery refused.");
  }
  const queueHostname = normalizedRedisEndpointHostname(config.url, "QUEUE_REDIS_REST_URL");
  const sharedUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const sharedToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (Boolean(sharedUrl) !== Boolean(sharedToken)) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together for queue recovery isolation checks.");
  }
  if (sharedUrl && sharedToken) {
    const sharedHostname = normalizedRedisEndpointHostname(sharedUrl, "UPSTASH_REDIS_REST_URL");
    if (queueHostname === sharedHostname) {
      throw new Error("QUEUE_REDIS_REST_URL must use a different Redis endpoint from UPSTASH_REDIS_REST_URL. Queue recovery refused.");
    }
  }
  return { ...config, dedicated: true };
}

function dedicatedQueueRecoveryIsolationStatus(): boolean | null {
  try {
    const config = getQueueRedisConfig();
    if (!config?.dedicated) return null;
    const queueHostname = normalizedRedisEndpointHostname(config.url, "QUEUE_REDIS_REST_URL");
    const sharedUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const sharedToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (Boolean(sharedUrl) !== Boolean(sharedToken)) return null;
    if (!sharedUrl || !sharedToken) return true;
    return queueHostname !== normalizedRedisEndpointHostname(sharedUrl, "UPSTASH_REDIS_REST_URL");
  } catch {
    return null;
  }
}

function getQueueRedisEndpoint(): string | null {
  return getQueueRedisConfig()?.url ?? null;
}

function getRedis(): Redis | null {
  const config = getQueueRedisConfig();
  return config ? new Redis({ url: config.url, token: config.token }) : null;
}

function todayDate(): string {
  return pacificDateString();
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

function normalizeSignalHoldPriceCents(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : DEFAULT_SIGNAL_HOLD_PRICE_CENTS;
}

function normalizeSubmissionCooldownSeconds(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SUBMISSION_COOLDOWN_SECONDS;
  return Math.min(MAX_SUBMISSION_COOLDOWN_SECONDS, Math.max(0, Math.round(numeric)));
}

export function normalizeTrackLimitPerArtist(value: unknown): number {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return MAX_TRACKS_PER_SUBMITTER;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return MAX_TRACKS_PER_SUBMITTER;
  return Math.min(MAX_TRACKS_PER_SUBMITTER, Math.max(1, Math.floor(numeric)));
}

function normalizePaidPriorityEnabled(input: { priorityUpgradesEnabled?: boolean | null; priorityUpgradePaymentsEnabled?: boolean | null; priorityUpgradePriceCents?: unknown }): boolean {
  return (input.priorityUpgradesEnabled === true || input.priorityUpgradePaymentsEnabled === true) && normalizePriceCents(input.priorityUpgradePriceCents) > 0;
}

function normalizePaidSignalHoldEnabled(input: { signalHoldEnabled?: boolean | null; signalHoldPaymentsEnabled?: boolean | null; signalHoldPriceCents?: unknown }): boolean {
  return (input.signalHoldEnabled === true || input.signalHoldPaymentsEnabled === true) && normalizeSignalHoldPriceCents(input.signalHoldPriceCents) > 0;
}

function defaultSession(options: QueueSessionOptions = {}): QueueSession {
  const date = options.showDate ?? todayDate();
  const now = new Date().toISOString();
  const purpose = options.purpose ?? "rehearsal";
  return normalizeSession({
    sessionId: makeSessionId(),
    title: options.title?.trim() || `BARCODE Radio — ${date}`,
    status: "prepared",
    purpose,
    bnlPublicationStatus: normalizeQueueSessionBnlPublicationStatus(
      options.bnlPublicationStatus,
      purpose,
    ),
    provenanceRevision: 1,
    provenanceUpdatedAt: now,
    showDate: date,
    createdAt: now,
    updatedAt: now,
    queueOpen: false,
    description: options.description?.trim() || sessionDescriptionFor(date),
    trackLimitPerArtist: normalizeTrackLimitPerArtist(options.trackLimitPerArtist),
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
    broadcastStartedAt: null,
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
    playbackDiagnostics: emptyQueuePlaybackDiagnostics(),
    showLog: [],
    priorityUpgradesEnabled: normalizePaidPriorityEnabled(options),
    priorityUpgradeLabel: options.priorityUpgradeLabel?.trim() || DEFAULT_PRIORITY_UPGRADE_LABEL,
    priorityUpgradeInstructions: options.priorityUpgradeInstructions?.trim() || DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS,
    priorityUpgradePriceCents: Number.isFinite(options.priorityUpgradePriceCents) ? Math.max(0, Math.round(options.priorityUpgradePriceCents ?? 0)) : DEFAULT_PRIORITY_UPGRADE_PRICE_CENTS,
    priorityUpgradeCurrency: normalizeCurrency(options.priorityUpgradeCurrency),
    priorityUpgradePaymentsEnabled: normalizePaidPriorityEnabled(options),
    signalHoldEnabled: normalizePaidSignalHoldEnabled(options),
    signalHoldLabel: DEFAULT_SIGNAL_HOLD_LABEL,
    signalHoldInstructions: DEFAULT_SIGNAL_HOLD_INSTRUCTIONS,
    signalHoldPriceCents: Number.isFinite(options.signalHoldPriceCents) ? Math.max(0, Math.round(options.signalHoldPriceCents ?? 0)) : DEFAULT_SIGNAL_HOLD_PRICE_CENTS,
    signalHoldCurrency: normalizeCurrency(options.signalHoldCurrency ?? DEFAULT_SIGNAL_HOLD_CURRENCY),
    signalHoldPaymentsEnabled: normalizePaidSignalHoldEnabled(options),
  });
}

const mem: QueueStore = (() => {
  const session = defaultSession();
  return { revision: 0, activeSessionId: session.sessionId, sessions: [session] };
})();

let lastKnownGoodRedisStore: QueueStore | null = null;
let lastKnownGoodRedisEndpoint: string | null = null;
let durableSnapshotInFlightRevision = -1;
let durableSnapshotConfirmedRevision = -1;
let durableSnapshotPending: QueueStore | null = null;

let mutationTail: Promise<void> = Promise.resolve();
const mutationLeaseStorage = new AsyncLocalStorage<QueueMutationLease>();

const COMMIT_MUTATION_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
local current_revision = redis.call("GET", KEYS[3])
if current_revision and tonumber(current_revision) ~= tonumber(ARGV[2]) then
  return -2
end
redis.call("SET", KEYS[2], ARGV[3])
redis.call("SET", KEYS[3], ARGV[4])
redis.call("SET", KEYS[4], ARGV[5])
return tonumber(ARGV[4])
`;

const RELEASE_MUTATION_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const ROLLBACK_MUTATION_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
local current_revision = redis.call("GET", KEYS[3])
if not current_revision or tonumber(current_revision) ~= tonumber(ARGV[2]) then
  return -2
end
redis.call("SET", KEYS[2], ARGV[3])
redis.call("SET", KEYS[3], ARGV[4])
redis.call("SET", KEYS[4], ARGV[5])
return tonumber(ARGV[4])
`;

const RESTORE_DURABLE_SNAPSHOT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
local current_revision = redis.call("GET", KEYS[3])
local normalized_revision = current_revision and tonumber(current_revision) or 0
if normalized_revision ~= tonumber(ARGV[2]) then
  return -2
end
redis.call("SET", KEYS[2], ARGV[3])
redis.call("SET", KEYS[3], ARGV[4])
redis.call("SET", KEYS[4], ARGV[5])
return tonumber(ARGV[4])
`;

function scheduleQueueDurableSnapshot(store: QueueStore): void {
  const snapshot = normalizeStore(store);
  if (snapshot.revision <= durableSnapshotConfirmedRevision) return;
  if (durableSnapshotInFlightRevision >= 0) {
    const pendingRevision = durableSnapshotPending?.revision ?? -1;
    if (snapshot.revision > durableSnapshotInFlightRevision && snapshot.revision > pendingRevision) {
      durableSnapshotPending = snapshot;
    }
    return;
  }

  durableSnapshotInFlightRevision = snapshot.revision;
  void (async () => {
    let current: QueueStore | null = snapshot;
    while (current) {
      try {
        await captureQueueDurableSnapshotIfNeeded(current);
        durableSnapshotConfirmedRevision = Math.max(durableSnapshotConfirmedRevision, current.revision);
      } catch {
        // A later read or mutation retries this revision after the worker exits.
      }
      const pending = durableSnapshotPending;
      durableSnapshotPending = null;
      current = pending && pending.revision > durableSnapshotConfirmedRevision ? pending : null;
      durableSnapshotInFlightRevision = current?.revision ?? -1;
    }
  })();
}

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

export function isWheelEligibleTrack(entry: QueueEntry | null | undefined): boolean {
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
  return new Date(entry.displacedFromNextInLineAt ?? entry.signalHoldQueueOrderAt ?? entry.createdAt).getTime();
}

function sortActive(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => queueRank(a) - queueRank(b) || queueOrderTime(a) - queueOrderTime(b));
}

function laneTop(session: Pick<QueueSession, "queue">, lane: QueueLane, excludeId?: string): QueueEntry | null {
  return sortActive(session.queue).find((entry) => entry.id !== excludeId && entry.status === "queued" && (entry.lane ?? "regular") === lane && (lane !== "priority" || isActivePriorityTrack(entry))) ?? null;
}
function wasPrioritySignal(entry: QueueEntry): boolean {
  return (entry.lane ?? "regular") === "priority" || entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual";
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

  const loadedNonPriorityLane = session.loadedTrack && (session.loadedTrack.lane ?? "regular") !== "priority"
    ? (session.loadedTrack.lane === "wheel" ? "wheel" : "regular")
    : null;
  const preferredLane: QueueNonPriorityLane = loadedNonPriorityLane ? nextLaneAfterFinish(loadedNonPriorityLane) : (session.nextNonPriorityLane === "regular" ? "regular" : "wheel");
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
  normalizeTrackUniqueness(session);
  const blockedIds = new Set([
    ...session.completed.map((entry) => entry.id),
    ...session.removed.map((entry) => entry.id),
  ]);
  let current = session.nextInLineTrack ?? null;
  if (current && blockedIds.has(current.id)) {
    clearNextInLine(session);
    current = null;
  }
  if (session.autoRoutingPaused && !force) {
    if (current) return;
    const priority = laneTop(session, "priority", excludeId ?? session.nextInLineHoldTrackId ?? session.loadedTrackId ?? undefined);
    if (!priority) return;
    if (blockedIds.has(priority.id) || session.loadedTrack?.id === priority.id) return;
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
    if (blockedIds.has(priority.id) || session.loadedTrack?.id === priority.id) return;
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
  if (blockedIds.has(next.entry.id) || session.loadedTrack?.id === next.entry.id) {
    session.queue = session.queue.filter((entry) => entry.id !== next.entry.id);
    return;
  }
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

function appendSessionPlaybackEvent(session: QueueSession, input: QueuePlaybackLifecycleEventInput, now = new Date()) {
  const receipt = appendQueuePlaybackEvent(session.playbackDiagnostics, input, session.loadedTrack?.id ?? null, now);
  if (!receipt.accepted) return receipt;
  session.playbackDiagnostics = receipt.diagnostics;
  const observedDuration = receipt.event?.durationSeconds ?? null;
  if (session.loadedTrack?.id === input.trackId && observedDuration !== null && observedDuration > 0) {
    session.loadedTrack = normalizeEntry({
      ...session.loadedTrack,
      detectedDurationSeconds: Math.max(1, Math.round(observedDuration)),
      estimatedDurationSeconds: Math.max(1, Math.round(observedDuration)),
      durationIsEstimate: false,
      durationSource: "direct_metadata",
    });
    session.loadedTrackId = session.loadedTrack.id;
  }
  return receipt;
}

function entryWithPlaybackOutcome(
  session: QueueSession,
  entry: QueueEntry,
  outcome: "finished" | "skipped" | "removed",
  options: { now?: Date; snapshot?: QueuePlaybackEndpointSnapshot | null } = {},
): QueueEntry {
  const now = options.now ?? new Date();
  const fields = queuePlaybackOutcomeFields(session.playbackDiagnostics, entry.id, outcome, { now, snapshot: options.snapshot });
  if (session.loadedTrack?.id === entry.id) {
    appendSessionPlaybackEvent(session, {
      trackId: entry.id,
      provider: queuePlaybackProviderForSourceType(entry.sourceType),
      eventType: outcome === "finished" ? "finish" : outcome === "skipped" ? "skip" : "remove",
      currentTimeSeconds: fields.playbackEndPositionSeconds,
      durationSeconds: fields.playbackObservedDurationSeconds,
      errorCode: fields.playbackIssueCode,
    }, now);
  }
  const signalHoldFulfilledAt = outcome !== "removed" && normalizeSignalHoldStatus(entry.signalHoldStatus) === "active"
    ? now.toISOString()
    : entry.signalHoldFulfilledAt ?? null;
  return normalizeEntry({
    ...entry,
    ...fields,
    signalHoldStatus: signalHoldFulfilledAt ? "fulfilled" : entry.signalHoldStatus,
    signalHoldFulfilledAt,
  });
}

function recordLoadedTrackReturned(session: QueueSession, entry: QueueEntry, now = new Date()): void {
  if (session.loadedTrack?.id !== entry.id) return;
  const fields = queuePlaybackOutcomeFields(session.playbackDiagnostics, entry.id, "removed");
  appendSessionPlaybackEvent(session, {
    trackId: entry.id,
    provider: queuePlaybackProviderForSourceType(entry.sourceType),
    eventType: "return",
    currentTimeSeconds: fields.playbackEndPositionSeconds,
    durationSeconds: fields.playbackObservedDurationSeconds,
    errorCode: fields.playbackIssueCode,
  }, now);
}

function removeTrackFromActiveLocations(session: QueueSession, trackId: string): void {
  session.queue = session.queue.filter((entry) => entry.id !== trackId);
  if (session.nextInLineTrack?.id === trackId) clearNextInLine(session);
  if (session.loadedTrack?.id === trackId) clearLoadedTrack(session);
}

function normalizeTrackUniqueness(session: QueueSession): void {
  const blockedIds = new Set([
    ...session.completed.map((entry) => entry.id),
    ...session.removed.map((entry) => entry.id),
  ]);
  if (blockedIds.size === 0) return;
  session.queue = session.queue.filter((entry) => !blockedIds.has(entry.id));
  if (session.nextInLineTrack && blockedIds.has(session.nextInLineTrack.id)) clearNextInLine(session);
  if (session.loadedTrack && blockedIds.has(session.loadedTrack.id)) clearLoadedTrack(session);
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
  if (!session.broadcastStartedAt) session.broadcastStartedAt = loaded.playedAt ?? new Date().toISOString();
  session.queue = session.queue.filter((track) => track.id !== loaded.id);
  if (session.nextInLineTrack?.id === loaded.id) clearNextInLine(session);
  appendSessionPlaybackEvent(session, {
    trackId: loaded.id,
    provider: queuePlaybackProviderForSourceType(loaded.sourceType),
    eventType: "loaded",
    currentTimeSeconds: 0,
    durationSeconds: loaded.detectedDurationSeconds ?? null,
  });
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

function acceptedTrackCountForSession(
  session: Pick<QueueSession, "queue" | "nextInLineTrack" | "loadedTrack" | "completed" | "removed">,
): number {
  const ids = new Set<string>();
  const removedIds = new Set(session.removed.map((entry) => entry.id));
  const count = (entry: QueueEntry | null | undefined, allowedStatuses: QueueEntry["status"][]) => {
    if (!entry || removedIds.has(entry.id) || isSimulationTrack(entry) || !allowedStatuses.includes(entry.status)) return;
    ids.add(entry.id);
  };
  for (const entry of session.queue) count(entry, ["queued", "playing"]);
  count(session.nextInLineTrack, ["queued", "next", "playing"]);
  count(session.loadedTrack, ["queued", "next", "playing"]);
  for (const entry of session.completed) count(entry, ["completed", "played"]);
  return ids.size;
}

function completedCountedTrackCountForSession(session: Pick<QueueSession, "completed" | "removed">): number {
  const removedIds = new Set(session.removed.map((entry) => entry.id));
  return new Set(session.completed.filter((entry) => !removedIds.has(entry.id) && !isSimulationTrack(entry) && (entry.status === "completed" || entry.status === "played")).map((entry) => entry.id)).size;
}

function applySponsorBreakDueState(session: QueueSession, now = new Date()): void {
  if (session.sponsorBreakStatus === "running" || session.sponsorBreakStatus === "completed" || session.sponsorBreakStatus === "skipped") return;
  const placement = estimateSponsorBreakPlacement({
    nowPlaying: session.loadedTrack ?? null,
    upNext: session.nextInLineTrack ?? null,
    queue: session.queue,
    completed: session.completed,
    removed: session.removed,
    session: {
      completedCount: completedCountedTrackCountForSession(session),
      acceptedCount: acceptedTrackCountForSession(session),
      sponsorBreakSeconds: session.sponsorBreakSeconds,
      sponsorBreakMode: session.sponsorBreakMode,
      sponsorBreakStatus: session.sponsorBreakStatus,
      broadcastStartedAt: session.broadcastStartedAt,
      sponsorBreakStartedAt: session.sponsorBreakStartedAt,
      sponsorBreakCompletedAt: session.sponsorBreakCompletedAt,
      sponsorBreakCompletedAfterPlayableCount: session.sponsorBreakCompletedAfterPlayableCount,
      sponsorBreakDueAfterPlayableCount: session.sponsorBreakDueAfterPlayableCount,
      sponsorBreakManualNote: session.sponsorBreakManualNote,
      showStarted: session.showStarted,
      broadcastPhase: broadcastPhaseForSession(session),
    },
  }, { now });
  if (!placement.commercialBreakEligible || placement.sponsorBreakThreshold === null) {
    session.sponsorBreakStatus = "not_due";
    session.sponsorBreakDueAfterPlayableCount = null;
    return;
  }
  session.sponsorBreakStatus = "due";
  session.sponsorBreakDueAfterPlayableCount = placement.sponsorBreakThreshold;
}

function normalizeSubmissionClosureReason(value: unknown): QueueSubmissionClosureReason {
  if (value === "manual" || value === "capacity" || value === "ended" || value === "archived") return value;
  return null;
}

function applySubmissionAcceptanceState(session: QueueSession, rawReason: unknown): void {
  const capacity = session.queueCapacity ?? DEFAULT_QUEUE_CAPACITY;
  const acceptedCount = acceptedTrackCountForSession(session);
  const full = acceptedCount >= capacity;
  const reason = normalizeSubmissionClosureReason(rawReason);

  if (session.status === "archived") {
    session.queueOpen = false;
    session.submissionClosureReason = "archived";
    return;
  }
  if (reason === "ended") {
    session.queueOpen = false;
    session.status = "closed";
    session.submissionClosureReason = "ended";
    return;
  }
  if (reason === "manual") {
    session.queueOpen = false;
    session.status = session.status === "prepared" ? "prepared" : "closed";
    session.submissionClosureReason = "manual";
    return;
  }
  if (reason === "capacity") {
    if (full) {
      session.queueOpen = false;
      session.status = "open";
      session.submissionClosureReason = "capacity";
    } else {
      session.queueOpen = true;
      session.status = "open";
      session.submissionClosureReason = null;
    }
    return;
  }
  if (session.queueOpen && full) {
    session.queueOpen = false;
    session.status = "open";
    session.submissionClosureReason = "capacity";
    return;
  }
  session.submissionClosureReason = session.queueOpen ? null : "manual";
}

function publicStatusForSession(session: Pick<QueueSession, "queue" | "queueOpen" | "nextInLineTrack" | "loadedTrack" | "completed" | "removed" | "queueCapacity" | "submissionClosureReason">): QueuePublicStatus {
  const active = session.queue.filter((entry) => entry.status === "queued" || entry.status === "playing");
  const next = session.nextInLineTrack ? [session.nextInLineTrack] : [];
  const loaded = session.loadedTrack ? [session.loadedTrack] : [];
  const estimatedRuntimeSeconds = [...loaded, ...next, ...active].reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0);
  const capacity = session.queueCapacity ?? DEFAULT_QUEUE_CAPACITY;
  const acceptedCount = acceptedTrackCountForSession(session);
  const isFull = acceptedCount >= capacity;
  const load = (active.length + next.length + loaded.length) / capacity;
  return {
    isOpen: session.queueOpen && !isFull,
    activeCount: active.length + next.length + loaded.length,
    acceptedCount,
    estimatedRuntimeSeconds,
    capacity,
    pressure: load >= 1 ? "max" : load >= 0.75 ? "high" : load >= 0.4 ? "medium" : "low",
    isFull,
    closureReason: session.submissionClosureReason ?? null,
  };
}

function summarizeSession(session: QueueSession): QueueSessionSummary {
  const publicStatus = publicStatusForSession(session);
  const purpose = normalizeQueueSessionPurpose(session.purpose);
  return {
    sessionId: session.sessionId,
    title: session.title,
    status: session.status,
    purpose,
    bnlPublicationStatus: normalizeQueueSessionBnlPublicationStatus(session.bnlPublicationStatus, purpose),
    provenanceRevision: session.provenanceRevision ?? 0,
    provenanceUpdatedAt: session.provenanceUpdatedAt ?? null,
    showDate: session.showDate,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    queueOpen: session.queueOpen,
    description: session.description ?? sessionDescriptionFor(session.showDate),
    trackLimitPerArtist: normalizeTrackLimitPerArtist(session.trackLimitPerArtist),
    queueCapacity: session.queueCapacity ?? DEFAULT_QUEUE_CAPACITY,
    skipGameTapTarget: session.skipGameTapTarget ?? 10000,
    submissionCooldownSeconds: normalizeSubmissionCooldownSeconds(session.submissionCooldownSeconds),
    activeCount: publicStatus.activeCount,
    acceptedCount: publicStatus.acceptedCount ?? 0,
    submissionClosureReason: session.submissionClosureReason ?? null,
    nextInLineTrackId: session.nextInLineTrackId ?? session.nextInLineTrack?.id ?? null,
    nextInLineHoldTrackId: session.nextInLineHoldTrackId ?? null,
    loadedTrackId: session.loadedTrackId ?? session.loadedTrack?.id ?? null,
    completedCount: completedCountedTrackCountForSession(session),
    removedCount: session.removed.length,
    spotlightCount: session.spotlight.length,
    estimatedActiveRuntimeSeconds: publicStatus.estimatedRuntimeSeconds,
    completedRuntimeSeconds: session.completed.filter((entry) => !isSimulationTrack(entry)).reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0),
    nextNonPriorityLane: session.nextNonPriorityLane ?? "wheel",
    showStarted: session.showStarted === true,
    preShowEndsAt: session.preShowEndsAt ?? null,
    broadcastStartedAt: session.broadcastStartedAt ?? null,
    wheelSpinsOwed: normalizeWheelSpinsOwed(session.wheelSpinsOwed),
    broadcastPhase: broadcastPhaseForSession(session),
    priorityUpgradesEnabled: normalizePaidPriorityEnabled(session),
    priorityUpgradeLabel: session.priorityUpgradeLabel?.trim() || DEFAULT_PRIORITY_UPGRADE_LABEL,
    priorityUpgradeInstructions: session.priorityUpgradeInstructions?.trim() || DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS,
    priorityUpgradePriceCents: normalizePriceCents(session.priorityUpgradePriceCents),
    priorityUpgradeCurrency: normalizeCurrency(session.priorityUpgradeCurrency),
    priorityUpgradePaymentsEnabled: normalizePaidPriorityEnabled(session),
    signalHoldEnabled: normalizePaidSignalHoldEnabled(session),
    signalHoldLabel: session.signalHoldLabel?.trim() || DEFAULT_SIGNAL_HOLD_LABEL,
    signalHoldInstructions: session.signalHoldInstructions?.trim() || DEFAULT_SIGNAL_HOLD_INSTRUCTIONS,
    signalHoldPriceCents: normalizeSignalHoldPriceCents(session.signalHoldPriceCents),
    signalHoldCurrency: normalizeCurrency(session.signalHoldCurrency ?? DEFAULT_SIGNAL_HOLD_CURRENCY),
    signalHoldPaymentsEnabled: normalizePaidSignalHoldEnabled(session),
    sponsorBreakSeconds: SPONSOR_BREAK_SECONDS,
    sponsorBreakMode: session.sponsorBreakMode ?? "mid_show",
    sponsorBreakStatus: session.sponsorBreakStatus ?? "not_due",
    sponsorBreakStartedAt: session.sponsorBreakStartedAt ?? null,
    sponsorBreakCompletedAt: session.sponsorBreakCompletedAt ?? null,
    sponsorBreakCompletedAfterPlayableCount: session.sponsorBreakCompletedAfterPlayableCount ?? null,
    sponsorBreakDueAfterPlayableCount: session.sponsorBreakDueAfterPlayableCount ?? null,
    sponsorBreakManualNote: session.sponsorBreakManualNote ?? null,
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

function applyCommercialBreakTimer(session: QueueSession, now = new Date()): boolean {
  if (session.status === "archived") return false;
  if (session.sponsorBreakStatus !== "running") return false;
  if (!session.sponsorBreakStartedAt) return false;
  const startedAt = Date.parse(session.sponsorBreakStartedAt);
  if (!Number.isFinite(startedAt)) return false;
  const breakSeconds = SPONSOR_BREAK_SECONDS;
  const completedAtMs = startedAt + breakSeconds * 1000;
  if (now.getTime() < completedAtMs) return false;
  const completedAtIso = new Date(completedAtMs).toISOString();
  session.sponsorBreakStatus = "completed";
  session.sponsorBreakCompletedAt = session.sponsorBreakCompletedAt ?? completedAtIso;
  session.sponsorBreakCompletedAfterPlayableCount = session.sponsorBreakCompletedAfterPlayableCount ?? completedCountedTrackCountForSession(session);
  session.sponsorBreakManualNote = "Commercial break auto-completed after 10m 30s.";
  session.updatedAt = now.toISOString();
  return true;
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

function normalizeSignalHoldStatus(status: unknown): QueueEntry["signalHoldStatus"] {
  if (status === "checkout_pending" || status === "active" || status === "paid_needs_attention" || status === "failed" || status === "refunded" || status === "fulfilled" || status === "expired") return status;
  return "none";
}

function normalizePriorityGiftAttribution(value: unknown, fallbackCapturedAt: string): PriorityGiftAttribution | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PriorityGiftAttribution>;
  if (candidate.version !== PRIORITY_GIFT_ATTRIBUTION_VERSION) return null;
  const recipientName = normalizePriorityGiftDisplayName(candidate.recipientName, "");
  if (!recipientName) return null;
  const parsedCapturedAt = typeof candidate.capturedAt === "string" ? Date.parse(candidate.capturedAt) : Number.NaN;
  return {
    version: PRIORITY_GIFT_ATTRIBUTION_VERSION,
    supporterName: normalizePriorityGiftDisplayName(candidate.supporterName, PRIORITY_GIFT_ANONYMOUS_NAME),
    recipientName,
    capturedAt: Number.isFinite(parsedCapturedAt) ? candidate.capturedAt! : fallbackCapturedAt,
  };
}

function isBarcodeQueueUploadUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(BARCODE_QUEUE_UPLOAD_HOST_SUFFIX) && parsed.pathname.startsWith(BARCODE_QUEUE_UPLOAD_PATH_PREFIX);
  } catch {
    return false;
  }
}

function isUploadedAudioEntry(entry: Pick<QueueEntry, "sourceType" | "fileUrl" | "mimeType">): boolean {
  const mime = entry.mimeType?.toLowerCase() ?? "";
  return entry.sourceType === "upload" && isBarcodeQueueUploadUrl(entry.fileUrl) && ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"].includes(mime);
}

function uploadedFileDeleteAfterFor(entry: QueueEntry, sourceType: QueueSourceType): string | null {
  if (!isUploadedAudioEntry({ ...entry, sourceType })) return null;
  if (typeof entry.uploadedFileDeleteAfter === "string" && entry.uploadedFileDeleteAfter) return entry.uploadedFileDeleteAfter;
  const created = new Date(entry.createdAt).getTime();
  const base = Number.isFinite(created) ? created : Date.now();
  return new Date(base + UPLOADED_FILE_RETENTION_MS).toISOString();
}

function normalizeEntry(entry: QueueEntry): QueueEntry {
  const { priorityOverlayDisplacedAt: legacyDisplacedFromNextInLineAt, ...entryWithoutLegacyMarker } = entry as QueueEntry & { priorityOverlayDisplacedAt?: string | null };
  const submittedArtistName = entry.submittedArtistName ?? entry.artist;
  const submittedSongTitle = entry.submittedSongTitle ?? entry.title;
  const detectedDurationSeconds = entry.detectedDurationSeconds ?? null;
  const storedSourceType = (entry as QueueEntry & { sourceType?: QueueSourceType | null }).sourceType ?? undefined;
  const parsedTikTok = parseTikTokVideoUrl(entry.link);
  const shouldMigrateTikTokIdentity = Boolean(parsedTikTok && (!storedSourceType || storedSourceType === "link" || storedSourceType === "other" || storedSourceType === "tiktok"));
  const canonicalTikTokKey = parsedTikTok ? `tiktok:video:${parsedTikTok.postId}` : null;
  const sourceType = shouldMigrateTikTokIdentity ? "tiktok" : storedSourceType ?? detectQueueSourceType(entry.link);
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
    collaboratorNames: entry.collaboratorNames?.trim() || null,
    detectedArtistName: entry.detectedArtistName ?? null,
    detectedSongTitle: entry.detectedSongTitle ?? null,
    providerTitle: entry.providerTitle ?? null,
    sourceType,
    normalizedTikTokHandle: normalizeTikTokHandle(entry.normalizedTikTokHandle ?? entry.tiktokHandle ?? ""),
    normalizedSourceKey: shouldMigrateTikTokIdentity && canonicalTikTokKey ? canonicalTikTokKey : entry.normalizedSourceKey ?? null,
    providerId: shouldMigrateTikTokIdentity && canonicalTikTokKey ? canonicalTikTokKey : entry.providerId ?? null,
    estimatedDurationSeconds: entry.estimatedDurationSeconds ?? detectedDurationSeconds ?? INTERNAL_BUFFER_DURATION_SECONDS,
    detectedDurationSeconds,
    durationIsEstimate: detectedDurationSeconds === null,
    durationSource,
    uploadedFileDeleteAfter: uploadedFileDeleteAfterFor(entry, sourceType),
    uploadedFileDeletedAt: entry.uploadedFileDeletedAt ?? null,
    uploadedFileDeletionStatus: entry.uploadedFileDeletionStatus === "deleted" || entry.uploadedFileDeletionStatus === "error" || entry.uploadedFileDeletionStatus === "pending" ? entry.uploadedFileDeletionStatus : (uploadedFileDeleteAfterFor(entry, sourceType) ? "pending" : null),
    uploadedFileDeletionError: entry.uploadedFileDeletionError ?? null,
    playbackOutcome: entry.playbackOutcome === "finished" || entry.playbackOutcome === "skipped" || entry.playbackOutcome === "removed" ? entry.playbackOutcome : null,
    playbackEndedNaturally: typeof entry.playbackEndedNaturally === "boolean" ? entry.playbackEndedNaturally : null,
    playbackEarlyCutoff: typeof entry.playbackEarlyCutoff === "boolean" ? entry.playbackEarlyCutoff : null,
    playbackEndPositionSeconds: typeof entry.playbackEndPositionSeconds === "number" && Number.isFinite(entry.playbackEndPositionSeconds) ? Math.max(0, entry.playbackEndPositionSeconds) : null,
    playbackEndPositionObservedAt: typeof entry.playbackEndPositionObservedAt === "string" && Number.isFinite(Date.parse(entry.playbackEndPositionObservedAt)) ? new Date(entry.playbackEndPositionObservedAt).toISOString() : null,
    playbackObservedDurationSeconds: typeof entry.playbackObservedDurationSeconds === "number" && Number.isFinite(entry.playbackObservedDurationSeconds) ? Math.max(0, entry.playbackObservedDurationSeconds) : null,
    playbackIssueCode: entry.playbackIssueCode === "media_aborted" || entry.playbackIssueCode === "network_error" || entry.playbackIssueCode === "decode_error" || entry.playbackIssueCode === "source_unsupported" || entry.playbackIssueCode === "provider_error" || entry.playbackIssueCode === "ready_timeout" || entry.playbackIssueCode === "sync_error" || entry.playbackIssueCode === "unknown" ? entry.playbackIssueCode : null,
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
    priorityUpgradeCheckoutOwnerTokenHash: entry.priorityUpgradeCheckoutOwnerTokenHash ?? null,
    priorityUpgradeAmountCents: typeof entry.priorityUpgradeAmountCents === "number" ? Math.max(0, Math.round(entry.priorityUpgradeAmountCents)) : null,
    priorityUpgradeCurrency: entry.priorityUpgradeCurrency ? normalizeCurrency(entry.priorityUpgradeCurrency) : null,
    priorityGiftAttribution: normalizePriorityGiftAttribution(entry.priorityGiftAttribution, entry.priorityUpgradeCheckoutCreatedAt ?? entry.priorityUpgradePaidAt ?? entry.createdAt),
    displacedFromNextInLineAt: entry.displacedFromNextInLineAt ?? legacyDisplacedFromNextInLineAt ?? null,
    stagedAsFallbackForLane: entry.stagedAsFallbackForLane === "regular" || entry.stagedAsFallbackForLane === "wheel" ? entry.stagedAsFallbackForLane : null,
    priorityPausedAt: entry.priorityPausedAt ?? null,
    priorityResumedAt: entry.priorityResumedAt ?? null,
    priorityQueueOrderAt: entry.priorityQueueOrderAt ?? entry.priorityUpgradePaidAt ?? null,
    priorityLegalAcceptance: entry.priorityLegalAcceptance ?? null,
    signalHoldStatus: normalizeSignalHoldStatus(entry.signalHoldStatus),
    signalHoldRequestedAt: entry.signalHoldRequestedAt ?? null,
    signalHoldPaidAt: entry.signalHoldPaidAt ?? null,
    signalHoldPaymentProvider: entry.signalHoldPaymentProvider ?? null,
    signalHoldPaymentId: entry.signalHoldPaymentId ?? null,
    signalHoldCheckoutProvider: entry.signalHoldCheckoutProvider ?? null,
    signalHoldCheckoutSessionId: entry.signalHoldCheckoutSessionId ?? null,
    signalHoldCheckoutUrl: entry.signalHoldCheckoutUrl ?? null,
    signalHoldCheckoutCreatedAt: entry.signalHoldCheckoutCreatedAt ?? null,
    signalHoldCheckoutExpiresAt: entry.signalHoldCheckoutExpiresAt ?? null,
    signalHoldCheckoutOwnerTokenHash: entry.signalHoldCheckoutOwnerTokenHash ?? null,
    signalHoldAmountCents: typeof entry.signalHoldAmountCents === "number" ? Math.max(0, Math.round(entry.signalHoldAmountCents)) : null,
    signalHoldCurrency: entry.signalHoldCurrency ? normalizeCurrency(entry.signalHoldCurrency) : null,
    signalHoldLegalAcceptance: entry.signalHoldLegalAcceptance ?? null,
    signalHoldAppliedAt: entry.signalHoldAppliedAt ?? null,
    signalHoldApplicationCount: typeof entry.signalHoldApplicationCount === "number" && Number.isFinite(entry.signalHoldApplicationCount) ? Math.max(0, Math.floor(entry.signalHoldApplicationCount)) : 0,
    signalHoldQueueOrderAt: entry.signalHoldQueueOrderAt ?? null,
    signalHoldPriorityRelinquishedAt: entry.signalHoldPriorityRelinquishedAt ?? null,
    signalHoldFulfilledAt: entry.signalHoldFulfilledAt ?? null,
    signalHoldExpiredAt: entry.signalHoldExpiredAt ?? null,
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

function normalizeHistoricalRecoveryProvenance(value: unknown): QueueHistoricalRecoveryProvenance | null {
  if (!isRecord(value)
    || value.schema !== "barcode_queue_historical_recovery_provenance_v1"
    || typeof value.sourceUrl !== "string"
    || typeof value.sourceCommit !== "string"
    || typeof value.sourceRevision !== "number"
    || !Number.isInteger(value.sourceRevision)
    || value.sourceRevision < 0
    || typeof value.sourceDigest !== "string"
    || !/^[a-f0-9]{64}$/.test(value.sourceDigest)
    || typeof value.sourceResponseSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(value.sourceResponseSha256)
    || typeof value.sourceSessionId !== "string"
    || typeof value.sourceStoredShowDate !== "string"
    || typeof value.canonicalShowDate !== "string"
    || value.timeZone !== "America/Los_Angeles"
    || !["prepared", "open", "closed", "archived"].includes(String(value.sourceStatus))
    || !Array.isArray(value.appliedNormalizations)
    || value.appliedNormalizations.some((item) => typeof item !== "string" || !item)) {
    return null;
  }
  return {
    schema: "barcode_queue_historical_recovery_provenance_v1",
    sourceUrl: value.sourceUrl,
    sourceCommit: value.sourceCommit,
    sourceRevision: value.sourceRevision,
    sourceDigest: value.sourceDigest,
    sourceResponseSha256: value.sourceResponseSha256,
    sourceSessionId: value.sourceSessionId,
    sourceStoredShowDate: value.sourceStoredShowDate,
    canonicalShowDate: value.canonicalShowDate,
    timeZone: "America/Los_Angeles",
    sourceStatus: value.sourceStatus as QueueSessionStatus,
    appliedNormalizations: [...value.appliedNormalizations],
  };
}

function normalizeSession(raw: Partial<QueueSession> & { sessionId: string; title: string; status: QueueSessionStatus; showDate: string; createdAt: string; updatedAt: string; queueOpen: boolean }): QueueSession {
  const queueOpen = raw.queueOpen === true;
  const status = normalizeSessionStatus(raw.status, queueOpen);
  const purpose = normalizeQueueSessionPurpose(raw.purpose);
  const session = {
    ...raw,
    status,
    purpose,
    bnlPublicationStatus: normalizeQueueSessionBnlPublicationStatus(raw.bnlPublicationStatus, purpose),
    provenanceRevision: typeof raw.provenanceRevision === "number" && Number.isFinite(raw.provenanceRevision) ? Math.max(0, Math.floor(raw.provenanceRevision)) : 0,
    provenanceUpdatedAt: typeof raw.provenanceUpdatedAt === "string" && raw.provenanceUpdatedAt ? raw.provenanceUpdatedAt : null,
    description: raw.description ?? sessionDescriptionFor(raw.showDate),
    trackLimitPerArtist: normalizeTrackLimitPerArtist(raw.trackLimitPerArtist),
    queueCapacity: raw.queueCapacity ?? raw.publicStatus?.capacity ?? DEFAULT_QUEUE_CAPACITY,
    skipGameTapTarget: raw.skipGameTapTarget ?? 10000,
    submissionCooldownSeconds: normalizeSubmissionCooldownSeconds(raw.submissionCooldownSeconds),
    queueOpen,
    submissionClosureReason: normalizeSubmissionClosureReason(raw.submissionClosureReason),
    nextNonPriorityLane: raw.nextNonPriorityLane === "regular" ? "regular" : "wheel",
    showStarted: raw.showStarted === true,
    preShowEndsAt: typeof raw.preShowEndsAt === "string" && raw.preShowEndsAt ? raw.preShowEndsAt : null,
    broadcastStartedAt: typeof raw.broadcastStartedAt === "string" && raw.broadcastStartedAt ? raw.broadcastStartedAt : null,
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
    playbackDiagnostics: normalizeQueuePlaybackDiagnostics(raw.playbackDiagnostics),
    showLog: normalizeQueueShowLog(raw.showLog),
    historicalRecoveryProvenance: normalizeHistoricalRecoveryProvenance(raw.historicalRecoveryProvenance),
    priorityUpgradesEnabled: normalizePaidPriorityEnabled(raw),
    priorityUpgradeLabel: raw.priorityUpgradeLabel?.trim() || DEFAULT_PRIORITY_UPGRADE_LABEL,
    priorityUpgradeInstructions: raw.priorityUpgradeInstructions?.trim() || DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS,
    priorityUpgradePriceCents: normalizePriceCents(raw.priorityUpgradePriceCents),
    priorityUpgradeCurrency: normalizeCurrency(raw.priorityUpgradeCurrency),
    priorityUpgradePaymentsEnabled: normalizePaidPriorityEnabled(raw),
    signalHoldEnabled: normalizePaidSignalHoldEnabled(raw),
    signalHoldLabel: raw.signalHoldLabel?.trim() || DEFAULT_SIGNAL_HOLD_LABEL,
    signalHoldInstructions: raw.signalHoldInstructions?.trim() || DEFAULT_SIGNAL_HOLD_INSTRUCTIONS,
    signalHoldPriceCents: normalizeSignalHoldPriceCents(raw.signalHoldPriceCents),
    signalHoldCurrency: normalizeCurrency(raw.signalHoldCurrency ?? DEFAULT_SIGNAL_HOLD_CURRENCY),
    signalHoldPaymentsEnabled: normalizePaidSignalHoldEnabled(raw),
    sponsorBreakSeconds: SPONSOR_BREAK_SECONDS,
    sponsorBreakMode: raw.sponsorBreakMode === "mid_show" ? raw.sponsorBreakMode : "mid_show",
    sponsorBreakStatus: raw.sponsorBreakStatus === "due" || raw.sponsorBreakStatus === "running" || raw.sponsorBreakStatus === "completed" || raw.sponsorBreakStatus === "skipped" || raw.sponsorBreakStatus === "not_due" ? raw.sponsorBreakStatus : undefined,
    sponsorBreakStartedAt: typeof raw.sponsorBreakStartedAt === "string" && raw.sponsorBreakStartedAt ? raw.sponsorBreakStartedAt : null,
    sponsorBreakCompletedAt: typeof raw.sponsorBreakCompletedAt === "string" && raw.sponsorBreakCompletedAt ? raw.sponsorBreakCompletedAt : null,
    sponsorBreakCompletedAfterPlayableCount: typeof raw.sponsorBreakCompletedAfterPlayableCount === "number" && Number.isFinite(raw.sponsorBreakCompletedAfterPlayableCount) ? Math.max(0, Math.floor(raw.sponsorBreakCompletedAfterPlayableCount)) : null,
    sponsorBreakDueAfterPlayableCount: typeof raw.sponsorBreakDueAfterPlayableCount === "number" && Number.isFinite(raw.sponsorBreakDueAfterPlayableCount) ? Math.max(1, Math.floor(raw.sponsorBreakDueAfterPlayableCount)) : null,
    sponsorBreakManualNote: typeof raw.sponsorBreakManualNote === "string" && raw.sponsorBreakManualNote.trim() ? raw.sponsorBreakManualNote.trim() : null,
    currentTrackPreviousLane: raw.currentTrackPreviousLane ?? raw.nextInLineTrack?.lane ?? null,
    currentTrackPreviousIndex: typeof raw.currentTrackPreviousIndex === "number" ? raw.currentTrackPreviousIndex : null,
    queue: sortActive((raw.queue ?? []).map(normalizeEntry).filter((entry) => entry.id !== raw.nextInLineTrack?.id && entry.id !== raw.nextInLineTrackId && entry.id !== raw.loadedTrack?.id && entry.id !== raw.loadedTrackId)),
    completed: (raw.completed ?? []).map(normalizeEntry),
    removed: (raw.removed ?? []).map(normalizeEntry),
    spotlight: (raw.spotlight ?? []).map(normalizeEntry),
  } as QueueSession;
  applySubmissionAcceptanceState(session, raw.submissionClosureReason);
  applySponsorBreakDueState(session);
  const summary = summarizeSession(session);
  return { ...session, ...summary, publicStatus: publicStatusForSession(session) };
}

function normalizeStore(input: unknown): QueueStore {
  const maybe = input as Partial<QueueStore> | null;
  if (maybe && Array.isArray(maybe.sessions)) {
    const sessions = maybe.sessions.map((session) => normalizeSession(session));
    const revision = typeof maybe.revision === "number" && Number.isFinite(maybe.revision)
      ? Math.max(0, Math.floor(maybe.revision))
      : 0;
    const hasExplicitActiveSessionId = Object.prototype.hasOwnProperty.call(maybe, "activeSessionId");
    const explicitActiveSession = typeof maybe.activeSessionId === "string"
      ? sessions.find((session) => session.sessionId === maybe.activeSessionId)
      : null;
    const activeSessionId = hasExplicitActiveSessionId
      ? explicitActiveSession?.sessionId ?? null
      : sessions.find((session) => session.status !== "archived")?.sessionId ?? sessions[0]?.sessionId ?? null;
    return { revision, activeSessionId, sessions };
  }
  const legacy = input as { queue?: QueueEntry[]; completed?: QueueEntry[]; removed?: QueueEntry[]; spotlight?: QueueEntry[]; isOpen?: boolean } | null;
  if (legacy && (Array.isArray(legacy.queue) || Array.isArray(legacy.completed))) {
    const session = normalizeSession({
      ...defaultSession(),
      purpose: "unknown",
      bnlPublicationStatus: "private",
      provenanceRevision: 0,
      provenanceUpdatedAt: null,
      queue: legacy.queue ?? [],
      completed: legacy.completed ?? [],
      removed: legacy.removed ?? [],
      spotlight: legacy.spotlight ?? [],
      status: legacy.isOpen === false ? "closed" : "open",
      queueOpen: legacy.isOpen !== false,
      updatedAt: new Date().toISOString(),
    });
    return { revision: 0, activeSessionId: session.sessionId, sessions: [session] };
  }
  const session = defaultSession();
  return { revision: 0, activeSessionId: session.sessionId, sessions: [session] };
}

function liveStoreProjection(store: QueueStore): QueueLiveStoreProjection {
  const normalized = normalizeStore(store);
  const active = normalized.activeSessionId
    ? normalized.sessions.find((session) => session.sessionId === normalized.activeSessionId) ?? null
    : null;
  const session = active && active.status !== "archived" ? normalizeSession(active) : null;
  return {
    schemaVersion: "queue_live_store_v1",
    revision: normalized.revision,
    activeSessionId: session?.sessionId ?? null,
    session,
  };
}

function normalizeLiveStoreProjection(input: unknown): QueueLiveStoreProjection | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<QueueLiveStoreProjection>;
  if (candidate.schemaVersion !== "queue_live_store_v1"
    || typeof candidate.revision !== "number"
    || !Number.isFinite(candidate.revision)
    || candidate.revision < 0) return null;
  const activeSessionId = typeof candidate.activeSessionId === "string" && candidate.activeSessionId
    ? candidate.activeSessionId
    : null;
  if (!activeSessionId) {
    if (candidate.session !== null) return null;
    return {
      schemaVersion: "queue_live_store_v1",
      revision: Math.floor(candidate.revision),
      activeSessionId: null,
      session: null,
    };
  }
  if (!candidate.session || candidate.session.sessionId !== activeSessionId) return null;
  const session = normalizeSession(candidate.session);
  if (session.status === "archived") return null;
  return {
    schemaVersion: "queue_live_store_v1",
    revision: Math.floor(candidate.revision),
    activeSessionId,
    session,
  };
}

async function readStoreFromRedis(redis: Redis): Promise<QueueStore> {
  const raw = await redis.get<QueueStore | string>(STATE_KEY);
  let store: QueueStore;
  if (raw) {
    store = normalizeStore(typeof raw === "string" ? JSON.parse(raw) : raw);
  } else {
    const legacy = await redis.get<unknown>(LEGACY_STATE_KEY);
    store = normalizeStore(typeof legacy === "string" ? JSON.parse(legacy) : legacy);
  }
  lastKnownGoodRedisStore = store;
  lastKnownGoodRedisEndpoint = getQueueRedisEndpoint();
  // Seed or refresh the optional recovery copy without holding a queue read or
  // mutation lock on Blob latency. Redis remains the live queue authority.
  scheduleQueueDurableSnapshot(store);
  return store;
}

async function readStore(): Promise<QueueStore> {
  const lease = mutationLeaseStorage.getStore();
  if (lease) return normalizeStore(lease.store);
  let redis: Redis | null;
  try {
    redis = getRedis();
  } catch (error) {
    return readStoreRecoveryFallback(error);
  }
  if (!redis) return normalizeStore(mem);
  try {
    return await readStoreFromRedis(redis);
  } catch (error) {
    return readStoreRecoveryFallback(error);
  }
}

async function readStoreRecoveryFallback(redisError: unknown): Promise<QueueStore> {
  let fallback: QueueStore | null = null;
  try {
    const endpoint = getQueueRedisEndpoint();
    if (lastKnownGoodRedisStore && endpoint && endpoint === lastKnownGoodRedisEndpoint) {
      fallback = normalizeStore(lastKnownGoodRedisStore);
    }
  } catch {
    // A malformed Redis configuration can still use the independent snapshot.
  }
  try {
    const durable = await readQueueDurableSnapshot<QueueStore>();
    if (durable) {
      const normalized = normalizeStore(durable);
      if (!fallback || normalized.revision > fallback.revision) fallback = normalized;
    }
  } catch {
    // Preserve the original Redis failure when no confirmed fallback exists.
  }
  if (fallback) return fallback;
  throw redisError;
}

function mutationRevision(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

async function waitForLocalMutationTurn<T>(operation: () => Promise<T>): Promise<T> {
  const previous = mutationTail;
  let release: () => void = () => {};
  mutationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function acquireRedisMutationLock(redis: Redis): Promise<string> {
  const token = `mutation_${generateQueueId()}`;
  const deadline = Date.now() + MUTATION_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const acquired = await redis.set(MUTATION_LOCK_KEY, token, {
      nx: true,
      px: MUTATION_LOCK_TTL_MS,
    });
    if (acquired === "OK") return token;
    await new Promise<void>((resolve) => setTimeout(resolve, 25 + Math.floor(Math.random() * 25)));
  }
  throw new Error("Queue state is busy. Please retry this action.");
}

async function releaseRedisMutationLock(redis: Redis, token: string): Promise<void> {
  await redis.eval(RELEASE_MUTATION_LOCK_SCRIPT, [MUTATION_LOCK_KEY], [token]);
}

async function withQueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  return waitForLocalMutationTurn(async () => {
    const redis = getRedis();
    if (!redis && process.env.NODE_ENV === "production") {
      throw new Error("Queue Redis is not configured. Mutation refused.");
    }
    const token = redis ? await acquireRedisMutationLock(redis) : null;
    try {
      const [stored, revisionValue] = redis
        ? await Promise.all([
          readStoreFromRedis(redis),
          redis.get<number | string>(MUTATION_REVISION_KEY),
        ])
        : [normalizeStore(mem), mem.revision] as const;
      const persistedRevision = mutationRevision(revisionValue);
      if (redis && revisionValue !== null && revisionValue !== undefined && stored.revision !== persistedRevision) {
        throw new Error("Queue state revision is inconsistent. Mutation refused.");
      }
      const revision = Math.max(stored.revision, persistedRevision);
      const lease: QueueMutationLease = {
        redis,
        token,
        revision,
        store: { ...stored, revision },
      };
      return await mutationLeaseStorage.run(lease, operation);
    } finally {
      if (redis && token) {
        try {
          await releaseRedisMutationLock(redis, token);
        } catch {
          // The lease TTL and fenced commit protect later writers if release fails.
        }
      }
    }
  });
}

async function writeStore(
  store: QueueStore,
  options: { requireDurableSnapshot?: boolean } = {},
): Promise<void> {
  const lease = mutationLeaseStorage.getStore();
  if (!lease) throw new Error("Queue state writes require the serialized mutation boundary.");
  const nextRevision = lease.revision + 1;
  const previous = { ...normalizeStore(lease.store), revision: lease.revision };
  const normalized = queueStoreWithShowLog(previous, {
    ...normalizeStore(store),
    revision: nextRevision,
  });
  if (!lease.redis) {
    mem.revision = nextRevision;
    mem.activeSessionId = normalized.activeSessionId;
    mem.sessions = normalized.sessions;
    lease.revision = nextRevision;
    lease.store = normalized;
    store.revision = nextRevision;
    if (options.requireDurableSnapshot) {
      const persisted = await persistQueueDurableSnapshot(normalized);
      if (!persisted) throw new Error("Durable queue snapshots are not configured.");
    } else {
      scheduleQueueDurableSnapshot(normalized);
    }
    return;
  }
  if (!lease.token) throw new Error("Queue mutation lease is missing its fencing token.");
  const committed = await lease.redis.eval<unknown[], number>(
    COMMIT_MUTATION_SCRIPT,
    [MUTATION_LOCK_KEY, STATE_KEY, MUTATION_REVISION_KEY, LIVE_STATE_KEY],
    [lease.token, String(lease.revision), JSON.stringify(normalized), String(nextRevision), JSON.stringify(liveStoreProjection(normalized))],
  );
  if (committed !== nextRevision) {
    throw new Error("Queue state changed before this mutation could commit. Please retry.");
  }
  if (options.requireDurableSnapshot) {
    try {
      const persisted = await persistQueueDurableSnapshot(normalized);
      if (!persisted) throw new Error("Durable queue snapshots are not configured.");
    } catch (snapshotError) {
      const rolledBack = await lease.redis.eval<unknown[], number>(
        ROLLBACK_MUTATION_SCRIPT,
        [MUTATION_LOCK_KEY, STATE_KEY, MUTATION_REVISION_KEY, LIVE_STATE_KEY],
        [lease.token, String(nextRevision), JSON.stringify(previous), String(lease.revision), JSON.stringify(liveStoreProjection(previous))],
      );
      if (rolledBack !== lease.revision) {
        throw new Error("Queue recovery snapshot failed and the Redis mutation could not be rolled back safely.", { cause: snapshotError });
      }
      lastKnownGoodRedisStore = previous;
      lastKnownGoodRedisEndpoint = getQueueRedisEndpoint();
      throw snapshotError;
    }
  } else {
    scheduleQueueDurableSnapshot(normalized);
  }
  lease.revision = nextRevision;
  lease.store = normalized;
  store.revision = nextRevision;
  lastKnownGoodRedisStore = normalized;
  lastKnownGoodRedisEndpoint = getQueueRedisEndpoint();
}

export interface QueueRecoveryStatus {
  durable: {
    configured: boolean;
    available: boolean;
    failureReason: "not_configured" | "snapshot_not_found" | "unavailable" | null;
    revision: number | null;
    activeSessionId: string | null;
    sessionCount: number;
    trackRecordCount: number;
  };
  redis: {
    configured: boolean;
    configurationStatus: "dedicated" | "shared_fallback" | "partial_dedicated" | "partial_shared" | "missing";
    dedicated: boolean;
    isolatedFromShared: boolean | null;
    available: boolean;
    revision: number | null;
    activeSessionId: string | null;
    sessionCount: number;
    trackRecordCount: number;
    failureReason: "configuration_error" | "request_quota_exceeded" | "authentication_failed" | "network_unavailable" | "provider_error" | "unavailable" | null;
    failureStage: "configuration" | "client_initialization" | "state_read" | "state_validation" | null;
    failureDetail: string | null;
  };
  alignment: "aligned" | "durable_ahead" | "redis_ahead" | "different_at_same_revision" | "durable_only" | "redis_only" | "unavailable";
  requiredConfirmation: string | null;
}

export interface QueueRecoveryResult {
  dryRun: boolean;
  restored: boolean;
  revision: number;
  activeSessionId: string | null;
  sessionCount: number;
  trackRecordCount: number;
  previousRedisRevision: number;
}

const HISTORICAL_QUEUE_IMPORT_SCHEMA_VERSION = "barcode_queue_two_session_source_capture_v2";
const HISTORICAL_QUEUE_IMPORT_SOURCE_URL = "https://barcode-network-site-cpps-fg7a9jcmf-6-bits-projects.vercel.app";
const HISTORICAL_QUEUE_IMPORT_SOURCE_COMMIT = "a1537f611db69e5a1c3d74ebb941d06d68ad49ff";
const HISTORICAL_QUEUE_IMPORT_DATES = ["2026-08-07", "2026-08-14"] as const;
const HISTORICAL_QUEUE_AUGUST_7_SOURCE_DATE = "2026-08-08";
const HISTORICAL_QUEUE_AUGUST_7_SESSION_ID = "session_msjmzqjk_w1rkj";
const HISTORICAL_QUEUE_AUGUST_7_EXPORT_SHA256 = "49c950556a9662f98fa402beb84a7e579120afff8da9cc5c70077f4b46cd6c2e";
const HISTORICAL_QUEUE_AUGUST_7_DATE_RULE = "legacy_utc_rollover_to_pacific_broadcast_date";
const HISTORICAL_QUEUE_EXACT_DATE_RULE = "exact_source_show_date";
const HISTORICAL_QUEUE_IMPORT_MAX_BYTES = 3_500_000;
const HISTORICAL_QUEUE_IMPORT_MAX_SOURCE_RESPONSE_BYTES = 1_200_000;
const HISTORICAL_QUEUE_IMPORT_MAX_RECORDS_PER_SESSION = 500;
const HISTORICAL_QUEUE_IMPORT_ACCEPTED_LOSSES = [
  "source_active_session_id_when_no_captured_session_is_current",
  "current_track_previous_lane_and_index",
  "loaded_track_previous_lane_and_index",
  "loaded_track_was_next_in_line",
  "loaded_track_fallback_lane_when_not_present_on_the_loaded_track",
] as const;

export interface QueueHistoricalImportSessionSummary {
  sessionId: string;
  showDate: string;
  sourceShowDate: string;
  sourceStatus: QueueSessionStatus;
  appliedNormalizations: string[];
  title: string;
  status: QueueSessionStatus;
  queueCount: number;
  completedCount: number;
  removedCount: number;
  spotlightCount: number;
  hasNextInLine: boolean;
  hasLoadedTrack: boolean;
}

export interface QueueHistoricalImportResult {
  dryRun: boolean;
  imported: boolean;
  alreadyPresent: boolean;
  sourceRevision: number;
  sourceDigest: string;
  requiredConfirmation: string;
  currentRevision: number;
  targetRevision: number;
  sourceActiveSessionId: string;
  activeSessionId: string;
  activeSessionSelection: "source_active_session" | "newest_imported_archived_session";
  sessions: QueueHistoricalImportSessionSummary[];
  acceptedLosses: readonly string[];
}

interface HistoricalQueueImportPlan {
  sourceRevision: number;
  sourceDigest: string;
  requiredConfirmation: string;
  sourceActiveSessionId: string;
  activeSessionId: string;
  activeSessionSelection: QueueHistoricalImportResult["activeSessionSelection"];
  sessions: QueueSession[];
  summaries: QueueHistoricalImportSessionSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value;
}

function requiredNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requireIsoTimestamp(value: unknown, label: string): string {
  const timestamp = requiredNonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be an ISO timestamp.`);
  return timestamp;
}

function requireSha256(value: unknown, label: string): string {
  const digest = requiredNonEmptyString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`);
  return digest;
}

function sourceProjectionFromRawCapture(value: Record<string, unknown>, index: number): Record<string, unknown> {
  const label = `capture.sessions[${index}]`;
  const encoded = requiredNonEmptyString(value.sourceResponseBase64, `${label}.sourceResponseBase64`);
  if (encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error(`${label}.sourceResponseBase64 must be canonical base64.`);
  }
  const raw = Buffer.from(encoded, "base64");
  if (raw.toString("base64") !== encoded) throw new Error(`${label}.sourceResponseBase64 must be canonical base64.`);
  const expectedBytes = requiredNonNegativeInteger(value.sourceResponseBytes, `${label}.sourceResponseBytes`);
  if (expectedBytes > HISTORICAL_QUEUE_IMPORT_MAX_SOURCE_RESPONSE_BYTES) {
    throw new Error(`${label}.sourceResponseBytes exceeds the import limit.`);
  }
  if (raw.byteLength !== expectedBytes) throw new Error(`${label}.sourceResponseBytes does not match the embedded response.`);
  const expectedDigest = requireSha256(value.sourceResponseSha256, `${label}.sourceResponseSha256`);
  const actualDigest = createHash("sha256").update(raw).digest("hex");
  if (actualDigest !== expectedDigest) throw new Error(`${label}.sourceResponseSha256 does not match the embedded response.`);

  let rawState: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    rawState = JSON.parse(text);
  } catch {
    throw new Error(`${label}.sourceResponseBase64 must decode to a UTF-8 JSON response.`);
  }
  if (!isRecord(rawState)) throw new Error(`${label}.sourceResponseBase64 must contain an admin queue state.`);
  const projected = { ...rawState };
  // Keep the complete source roster long enough to recompute and verify the
  // start/end roster digest. queueSessionFromProjection ignores it when it
  // reconstructs the destination session, so it is not persisted twice.
  delete projected.playbackTiming;
  delete projected.wheelTiming;
  return projected;
}

function projectionEntry(value: unknown, label: string): QueueEntry {
  if (!isRecord(value)) throw new Error(`${label} must be a queue record.`);
  requiredNonEmptyString(value.id, `${label}.id`);
  requiredNonEmptyString(value.artist, `${label}.artist`);
  requiredNonEmptyString(value.title, `${label}.title`);
  if (typeof value.link !== "string") throw new Error(`${label}.link must be a string.`);
  requireIsoTimestamp(value.createdAt, `${label}.createdAt`);
  return value as unknown as QueueEntry;
}

function projectionEntries(value: unknown, label: string): QueueEntry[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > HISTORICAL_QUEUE_IMPORT_MAX_RECORDS_PER_SESSION) {
    throw new Error(`${label} contains too many queue records.`);
  }
  return value.map((entry, index) => projectionEntry(entry, `${label}[${index}]`));
}

function optionalProjectionEntries(value: unknown, label: string): QueueEntry[] {
  return value === undefined ? [] : projectionEntries(value, label);
}

function optionalProjectionEntry(value: unknown, label: string): QueueEntry | null {
  if (value === undefined || value === null) return null;
  return projectionEntry(value, label);
}

function assertPrimaryTrackIdsAreUnique(
  sessionId: string,
  containers: Array<{ label: string; entries: Array<QueueEntry | null> }>,
): void {
  const locations = new Map<string, string>();
  for (const container of containers) {
    for (const entry of container.entries) {
      if (!entry) continue;
      const previous = locations.get(entry.id);
      if (previous) {
        throw new Error(`Historical session ${sessionId} repeats track ${entry.id} in ${previous} and ${container.label}.`);
      }
      locations.set(entry.id, container.label);
    }
  }
}

function exactSummaryTrackId(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredNonEmptyString(value, label);
}

function queueSessionFromProjection(
  value: unknown,
  index: number,
  canonicalShowDate: string,
  sourceShowDate: string,
  sourceResponseSha256: string,
  capturedTrackCounts: unknown,
): QueueSession {
  const label = `capture.sessions[${index}].projectedState`;
  if (!isRecord(value)) throw new Error(`${label} must be an admin queue state.`);
  if (!isRecord(value.session)) throw new Error(`${label}.session is required.`);
  const summary = value.session;
  const sessionId = requiredNonEmptyString(summary.sessionId, `${label}.session.sessionId`);
  const showDate = requiredNonEmptyString(summary.showDate, `${label}.session.showDate`);
  if (showDate !== sourceShowDate) {
    throw new Error(`${label}.session.showDate does not match the declared source show date.`);
  }
  if (!(HISTORICAL_QUEUE_IMPORT_DATES as readonly string[]).includes(canonicalShowDate)) {
    throw new Error(`Historical queue import only accepts show dates ${HISTORICAL_QUEUE_IMPORT_DATES.join(" and ")}.`);
  }
  requiredNonEmptyString(summary.title, `${label}.session.title`);
  const sourceStatus = summary.status;
  if (sourceStatus !== "open" && sourceStatus !== "closed" && sourceStatus !== "archived") {
    throw new Error(`${label}.session.status must be open, closed, or archived.`);
  }
  if (canonicalShowDate === "2026-08-07" && sourceStatus !== "closed" && sourceStatus !== "archived") {
    throw new Error("The August 7 historical session must be closed or archived at the source.");
  }
  const purpose = requiredNonEmptyString(summary.purpose, `${label}.session.purpose`);
  if (canonicalShowDate === "2026-08-07" && purpose !== "unknown" && purpose !== "live_broadcast") {
    throw new Error("The 2026-08-07 historical session purpose must be unknown or live_broadcast.");
  }
  if (canonicalShowDate === "2026-08-14" && purpose !== "live_broadcast") {
    throw new Error("The 2026-08-14 historical session purpose must be live_broadcast.");
  }
  requireIsoTimestamp(summary.createdAt, `${label}.session.createdAt`);
  requireIsoTimestamp(summary.updatedAt, `${label}.session.updatedAt`);

  const queue = projectionEntries(value.queue, `${label}.queue`);
  const completed = projectionEntries(value.history, `${label}.history`);
  const removed = projectionEntries(value.removed, `${label}.removed`);
  const spotlight = projectionEntries(value.spotlight, `${label}.spotlight`);
  const nextInLineTrack = optionalProjectionEntry(value.nextInLine, `${label}.nextInLine`);
  if (!("loadedTrack" in value) || !("nowPlaying" in value)
    || canonicalJson(value.loadedTrack) !== canonicalJson(value.nowPlaying)) {
    throw new Error(`${label} has conflicting loadedTrack and nowPlaying records.`);
  }
  const loadedTrack = optionalProjectionEntry(value.loadedTrack, `${label}.loadedTrack`);
  const summaryNextInLineTrackId = exactSummaryTrackId(summary.nextInLineTrackId, `${label}.session.nextInLineTrackId`);
  const summaryLoadedTrackId = exactSummaryTrackId(summary.loadedTrackId, `${label}.session.loadedTrackId`);
  if (summaryNextInLineTrackId !== (nextInLineTrack?.id ?? null)) {
    throw new Error(`${label}.session.nextInLineTrackId does not match nextInLine.`);
  }
  if (summaryLoadedTrackId !== (loadedTrack?.id ?? null)) {
    throw new Error(`${label}.session.loadedTrackId does not match loadedTrack.`);
  }
  assertPrimaryTrackIdsAreUnique(sessionId, [
    { label: "queue", entries: queue },
    { label: "history", entries: completed },
    { label: "removed", entries: removed },
    { label: "nextInLine", entries: [nextInLineTrack] },
    { label: "loadedTrack", entries: [loadedTrack] },
  ]);

  const primaryRecords = [
    ...queue,
    ...completed,
    ...removed,
    ...(nextInLineTrack ? [nextInLineTrack] : []),
    ...(loadedTrack ? [loadedTrack] : []),
  ];
  const removedIds = new Set(removed.map((entry) => entry.id));
  const acceptedIds = new Set<string>();
  const countAccepted = (entry: QueueEntry | null, allowedStatuses: readonly string[]): void => {
    if (!entry || removedIds.has(entry.id) || isSimulationTrack(entry)) return;
    if (allowedStatuses.includes(entry.status)) acceptedIds.add(entry.id);
  };
  queue.forEach((entry) => countAccepted(entry, ["queued", "playing"]));
  countAccepted(nextInLineTrack, ["queued", "next", "playing"]);
  countAccepted(loadedTrack, ["queued", "next", "playing"]);
  completed.forEach((entry) => countAccepted(entry, ["completed", "played"]));
  const completedIds = new Set(completed
    .filter((entry) => !removedIds.has(entry.id)
      && !isSimulationTrack(entry)
      && (entry.status === "completed" || entry.status === "played"))
    .map((entry) => entry.id));
  const counts: Record<string, number> = {
    queue: queue.length,
    history: completed.length,
    removed: removed.length,
    spotlight: spotlight.length,
    nextInLine: nextInLineTrack ? 1 : 0,
    loadedTrack: loadedTrack ? 1 : 0,
    primaryUnique: primaryRecords.length,
    nonSimulationPrimary: primaryRecords.filter((entry) => !isSimulationTrack(entry)).length,
    activeCount: queue.filter((entry) => entry.status === "queued" || entry.status === "playing").length
      + (nextInLineTrack ? 1 : 0)
      + (loadedTrack ? 1 : 0),
    acceptedCount: acceptedIds.size,
    completedCount: completedIds.size,
    removedCount: removed.length,
    spotlightCount: spotlight.length,
  };
  if (!isRecord(capturedTrackCounts)) throw new Error(`${label} capture trackCounts are required.`);
  for (const [field, actual] of Object.entries(counts)) {
    if (requiredNonNegativeInteger(capturedTrackCounts[field], `${label}.capture.trackCounts.${field}`) !== actual) {
      throw new Error(`${label} capture trackCounts.${field} does not match the raw response.`);
    }
  }
  for (const field of ["activeCount", "acceptedCount", "completedCount", "removedCount", "spotlightCount"] as const) {
    if (requiredNonNegativeInteger(summary[field], `${label}.session.${field}`) !== counts[field]) {
      throw new Error(`${label}.session.${field} does not match the raw lifecycle records.`);
    }
  }
  if (requiredNonNegativeInteger(value.totalPlayed, `${label}.totalPlayed`) !== counts.completedCount) {
    throw new Error(`${label}.totalPlayed does not match the raw completed lifecycle records.`);
  }

  if (canonicalShowDate === "2026-08-14") {
    if (pacificDateString(new Date(String(summary.createdAt))) !== "2026-08-14") {
      throw new Error("The August 14 historical session was not created on August 14 Pacific time.");
    }
    if (!primaryRecords.some((entry) => !isSimulationTrack(entry))) {
      throw new Error("The August 14 historical session contains no real queue records.");
    }
  }

  const loadedFallbackLane = loadedTrack?.stagedAsFallbackForLane === "regular" || loadedTrack?.stagedAsFallbackForLane === "wheel"
    ? loadedTrack.stagedAsFallbackForLane
    : null;
  const sourceDescription = typeof summary.description === "string" ? summary.description : undefined;
  const normalizedDescription = canonicalShowDate !== sourceShowDate
    && (!sourceDescription || sourceDescription === sessionDescriptionFor(sourceShowDate))
    ? sessionDescriptionFor(canonicalShowDate)
    : sourceDescription;
  return normalizeSession({
    ...(summary as unknown as QueueSessionSummary),
    showDate: canonicalShowDate,
    description: normalizedDescription,
    status: "archived",
    queueOpen: false,
    submissionClosureReason: "archived",
    showStarted: false,
    broadcastPhase: "ended",
    queue,
    completed,
    removed,
    spotlight,
    nextInLineTrack,
    nextInLineTrackId: summaryNextInLineTrackId,
    loadedTrack,
    loadedTrackId: summaryLoadedTrackId,
    currentTrackPreviousLane: nextInLineTrack?.lane ?? null,
    currentTrackPreviousIndex: null,
    loadedTrackPreviousLane: loadedTrack?.lane ?? null,
    loadedTrackPreviousIndex: null,
    loadedTrackWasNextInLine: false,
    loadedTrackFallbackForLane: loadedFallbackLane,
    autoRoutingPaused: value.autoRoutingPaused === true,
    nextNonPriorityLane: value.nextNonPriorityLane === "regular" ? "regular" : "wheel",
    playbackDiagnostics: normalizeQueuePlaybackDiagnostics(value.playbackDiagnostics),
    historicalRecoveryProvenance: {
      schema: "barcode_queue_historical_recovery_provenance_v1",
      sourceUrl: HISTORICAL_QUEUE_IMPORT_SOURCE_URL,
      sourceCommit: HISTORICAL_QUEUE_IMPORT_SOURCE_COMMIT,
      sourceRevision: requiredNonNegativeInteger(value.revision, `${label}.revision`),
      sourceDigest: "0".repeat(64),
      sourceResponseSha256,
      sourceSessionId: sessionId,
      sourceStoredShowDate: sourceShowDate,
      canonicalShowDate,
      timeZone: "America/Los_Angeles",
      sourceStatus,
      appliedNormalizations: [
        ...(canonicalShowDate === sourceShowDate ? [] : ["source_show_date_to_canonical_pacific_show_date"]),
        ...(sourceStatus === "archived" ? [] : ["source_status_to_archived"]),
        ...(summary.queueOpen === false ? [] : ["queue_closed_for_historical_archive"]),
        ...(summary.showStarted === true ? ["show_stopped_for_historical_archive"] : []),
        ...(summary.broadcastPhase === "ended" ? [] : ["broadcast_phase_ended_for_historical_archive"]),
      ],
    },
  } as QueueSession);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sourceRosterIdentity(value: unknown, label: string): Record<string, string> {
  if (!isRecord(value)) throw new Error(`${label} must be a source session summary.`);
  return Object.fromEntries([
    "sessionId",
    "title",
    "status",
    "purpose",
    "bnlPublicationStatus",
    "showDate",
    "createdAt",
    "updatedAt",
  ].map((field) => [field, requiredNonEmptyString(value[field], `${label}.${field}`)]));
}

function validateSourceRoster(
  state: Record<string, unknown>,
  index: number,
  expectedCount: number,
  expectedSha256: string,
  sourceActiveSessionId: string,
): void {
  const label = `capture.sessions[${index}].projectedState`;
  if (!Array.isArray(state.sessions) || state.sessions.length !== expectedCount) {
    throw new Error(`${label}.sessions does not match the captured roster count.`);
  }
  const identities = state.sessions.map((summary, rosterIndex) => sourceRosterIdentity(
    summary,
    `${label}.sessions[${rosterIndex}]`,
  ));
  const byId = new Map<string, Record<string, string>>();
  for (const identity of identities) {
    if (byId.has(identity.sessionId)) throw new Error(`${label}.sessions repeats a session ID.`);
    byId.set(identity.sessionId, identity);
  }
  const rosterSha256 = createHash("sha256")
    .update(canonicalJson([...identities].sort((left, right) => left.sessionId.localeCompare(right.sessionId))))
    .digest("hex");
  if (rosterSha256 !== expectedSha256) {
    throw new Error(`${label}.sessions does not match the captured roster SHA-256.`);
  }
  if (!byId.has(sourceActiveSessionId)) {
    throw new Error(`${label}.sessions does not contain the source active session.`);
  }
  const selectedIdentity = sourceRosterIdentity(state.session, `${label}.session`);
  if (canonicalJson(byId.get(selectedIdentity.sessionId)) !== canonicalJson(selectedIdentity)) {
    throw new Error(`${label}.session identity does not match its roster summary.`);
  }
}

interface HistoricalQueueDateNormalization {
  canonicalShowDate: string;
  sourceShowDate: string;
  sessionId: string;
  rule: string;
}

function historicalQueueDateNormalizations(scope: Record<string, unknown>): Map<string, HistoricalQueueDateNormalization> {
  if (!Array.isArray(scope.canonicalShowDates)
    || canonicalJson([...scope.canonicalShowDates].sort()) !== canonicalJson([...HISTORICAL_QUEUE_IMPORT_DATES].sort())) {
    throw new Error(`Historical queue capture scope must contain canonical show dates ${HISTORICAL_QUEUE_IMPORT_DATES.join(" and ")}.`);
  }
  if (!Array.isArray(scope.sourceDateNormalization) || scope.sourceDateNormalization.length !== HISTORICAL_QUEUE_IMPORT_DATES.length) {
    throw new Error("Historical queue capture must declare exactly two source-date normalization records.");
  }

  const byCanonicalDate = new Map<string, HistoricalQueueDateNormalization>();
  for (const [index, raw] of scope.sourceDateNormalization.entries()) {
    const label = `capture.scope.sourceDateNormalization[${index}]`;
    if (!isRecord(raw)) throw new Error(`${label} must be an object.`);
    const canonicalShowDate = requiredNonEmptyString(raw.canonicalShowDate, `${label}.canonicalShowDate`);
    const sourceShowDate = requiredNonEmptyString(raw.sourceShowDate, `${label}.sourceShowDate`);
    const sessionId = requiredNonEmptyString(raw.sessionId, `${label}.sessionId`);
    const rule = requiredNonEmptyString(raw.rule, `${label}.rule`);
    if (byCanonicalDate.has(canonicalShowDate)) throw new Error("Historical queue capture repeats a canonical show date.");
    if (!isRecord(raw.provenance)) throw new Error(`${label}.provenance must be an object.`);
    requiredNonEmptyString(raw.provenance.detail, `${label}.provenance.detail`);

    if (canonicalShowDate === "2026-08-07") {
      if (sourceShowDate !== HISTORICAL_QUEUE_AUGUST_7_SOURCE_DATE
        || sessionId !== HISTORICAL_QUEUE_AUGUST_7_SESSION_ID
        || rule !== HISTORICAL_QUEUE_AUGUST_7_DATE_RULE
        || raw.provenance.kind !== "owner_supplied_export"
        || requireSha256(raw.provenance.sourceSha256, `${label}.provenance.sourceSha256`) !== HISTORICAL_QUEUE_AUGUST_7_EXPORT_SHA256) {
        throw new Error("The August 7 historical queue date-normalization provenance is invalid.");
      }
    } else if (canonicalShowDate === "2026-08-14") {
      if (sourceShowDate !== "2026-08-14"
        || rule !== HISTORICAL_QUEUE_EXACT_DATE_RULE
        || raw.provenance.kind !== "authenticated_source_queue_state") {
        throw new Error("The August 14 historical queue date provenance is invalid.");
      }
    } else {
      throw new Error(`Historical queue import only accepts show dates ${HISTORICAL_QUEUE_IMPORT_DATES.join(" and ")}.`);
    }
    byCanonicalDate.set(canonicalShowDate, { canonicalShowDate, sourceShowDate, sessionId, rule });
  }
  if (byCanonicalDate.size !== HISTORICAL_QUEUE_IMPORT_DATES.length
    || HISTORICAL_QUEUE_IMPORT_DATES.some((date) => !byCanonicalDate.has(date))) {
    throw new Error("Historical queue capture date-normalization scope is incomplete.");
  }
  if (new Set([...byCanonicalDate.values()].map((item) => item.sessionId)).size !== HISTORICAL_QUEUE_IMPORT_DATES.length) {
    throw new Error("Historical queue capture date normalization repeats a session ID.");
  }
  return byCanonicalDate;
}

function historicalQueueImportPlan(capture: unknown): HistoricalQueueImportPlan {
  let serialized: string;
  try {
    const candidate = JSON.stringify(capture);
    if (candidate === undefined) throw new Error("not JSON");
    serialized = candidate;
  } catch {
    throw new Error("Historical queue capture must be valid JSON.");
  }
  if (Buffer.byteLength(serialized, "utf8") > HISTORICAL_QUEUE_IMPORT_MAX_BYTES) {
    throw new Error("Historical queue capture is too large.");
  }
  if (!isRecord(capture) || capture.schema !== HISTORICAL_QUEUE_IMPORT_SCHEMA_VERSION) {
    throw new Error(`Historical queue capture schema must be ${HISTORICAL_QUEUE_IMPORT_SCHEMA_VERSION}.`);
  }
  const capturedAt = requireIsoTimestamp(capture.capturedAt, "capture.capturedAt");
  if (!isRecord(capture.source)
    || capture.source.baseUrl !== HISTORICAL_QUEUE_IMPORT_SOURCE_URL
    || capture.source.expectedGitCommit !== HISTORICAL_QUEUE_IMPORT_SOURCE_COMMIT
    || capture.source.route !== "/api/admin/queue"
    || capture.source.captureKind !== "authenticated_admin_logical_session_state"
    || capture.source.canonicalRawRedis !== false
    || capture.source.remoteMutationRequests !== 0
    || capture.source.automaticRetries !== 0
    || capture.source.redirectsFollowed !== 0) {
    throw new Error("Historical queue capture source provenance is invalid.");
  }
  if (!isRecord(capture.scope) || capture.scope.sessionCount !== HISTORICAL_QUEUE_IMPORT_DATES.length) {
    throw new Error(`Historical queue capture scope must be exactly ${HISTORICAL_QUEUE_IMPORT_DATES.join(" and ")}.`);
  }
  const dateNormalizations = historicalQueueDateNormalizations(capture.scope);
  if (!isRecord(capture.consistency) || capture.consistency.startEndMatch !== true) {
    throw new Error("Historical queue capture does not prove a stable start/end state.");
  }
  requireIsoTimestamp(capture.consistency.captureStartedAt, "capture.consistency.captureStartedAt");
  requireIsoTimestamp(capture.consistency.captureFinishedAt, "capture.consistency.captureFinishedAt");
  const sourceRevision = requiredNonNegativeInteger(capture.consistency.revision, "capture.consistency.revision");
  const sourceActiveSessionId = requiredNonEmptyString(capture.consistency.activeSessionId, "capture.consistency.activeSessionId");
  const sourceRosterSha256 = requireSha256(capture.consistency.rosterSha256, "capture.consistency.rosterSha256");
  const sourceRosterCount = requiredNonNegativeInteger(capture.consistency.rosterCount, "capture.consistency.rosterCount");
  if (sourceRosterCount < 2) {
    throw new Error("Historical queue capture roster must contain both target sessions.");
  }
  requireSha256(capture.consistency.startSentinelResponseSha256, "capture.consistency.startSentinelResponseSha256");
  requireSha256(capture.consistency.endSentinelResponseSha256, "capture.consistency.endSentinelResponseSha256");
  requiredNonNegativeInteger(capture.consistency.startSentinelResponseBytes, "capture.consistency.startSentinelResponseBytes");
  requiredNonNegativeInteger(capture.consistency.endSentinelResponseBytes, "capture.consistency.endSentinelResponseBytes");
  if (!Array.isArray(capture.sessions) || capture.sessions.length !== HISTORICAL_QUEUE_IMPORT_DATES.length) {
    throw new Error("Historical queue capture must contain exactly two source session projections.");
  }

  const responseEvidence: Array<{ canonicalShowDate: string; sourceShowDate: string; sessionId: string; responseSha256: string }> = [];
  const sessions = capture.sessions.map((capturedSession, index) => {
    const label = `capture.sessions[${index}]`;
    if (!isRecord(capturedSession)) throw new Error(`${label} must be a captured source session.`);
    const canonicalShowDate = requiredNonEmptyString(capturedSession.canonicalShowDate, `${label}.canonicalShowDate`);
    const sourceShowDate = requiredNonEmptyString(capturedSession.sourceShowDate, `${label}.sourceShowDate`);
    const sessionId = requiredNonEmptyString(capturedSession.sessionId, `${label}.sessionId`);
    const dateNormalization = dateNormalizations.get(canonicalShowDate);
    if (!dateNormalization
      || dateNormalization.sourceShowDate !== sourceShowDate
      || dateNormalization.sessionId !== sessionId) {
      throw new Error(`${label} does not match its declared source-date normalization.`);
    }
    const revision = requiredNonNegativeInteger(capturedSession.revision, `${label}.revision`);
    if (revision !== sourceRevision) throw new Error("Historical queue capture contains states from different queue revisions.");
    const state = sourceProjectionFromRawCapture(capturedSession, index);
    validateSourceRoster(state, index, sourceRosterCount, sourceRosterSha256, sourceActiveSessionId);
    const stateRevision = requiredNonNegativeInteger(state.revision, `${label}.projectedState.revision`);
    if (stateRevision !== sourceRevision) throw new Error("Historical queue capture contains states from different queue revisions.");
    if (!isRecord(state.session)
      || state.session.sessionId !== sessionId
      || state.session.showDate !== sourceShowDate
      || state.viewedSessionId !== sessionId) {
      throw new Error(`${label} identity does not match its projected admin queue state.`);
    }
    if (!isRecord(capturedSession.summaryAtStart)) throw new Error(`${label}.summaryAtStart is required.`);
    for (const field of [
      "sessionId",
      "showDate",
      "status",
      "purpose",
      "bnlPublicationStatus",
      "createdAt",
      "updatedAt",
      "queueOpen",
      "showStarted",
      "broadcastStartedAt",
    ] as const) {
      if (capturedSession.summaryAtStart[field] !== state.session[field]) {
        throw new Error(`${label}.summaryAtStart.${field} does not match the projected session.`);
      }
    }
    const sourceResponseSha256 = requireSha256(capturedSession.sourceResponseSha256, `${label}.sourceResponseSha256`);
    const session = queueSessionFromProjection(
      state,
      index,
      canonicalShowDate,
      sourceShowDate,
      sourceResponseSha256,
      capturedSession.trackCounts,
    );
    if (session.sessionId !== sessionId || session.showDate !== canonicalShowDate) {
      throw new Error(`${label} reconstructed the wrong historical session.`);
    }
    if (canonicalShowDate === "2026-08-07"
      && (session.queue.length !== 0
        || session.completed.length !== 40
        || session.removed.length !== 1
        || session.spotlight.length !== 0
        || session.nextInLineTrack !== null
        || session.loadedTrack !== null
        || [...session.completed, ...session.removed].some(isSimulationTrack)
        || session.removed[0]?.artist !== "MagicSZN"
        || session.removed[0]?.title !== "HighFive")) {
      throw new Error("The known August 7 live session does not match its 40 played / 1 removed owner export.");
    }
    responseEvidence.push({
      canonicalShowDate,
      sourceShowDate,
      sessionId,
      responseSha256: sourceResponseSha256,
    });
    return session;
  }).sort((left, right) => right.showDate.localeCompare(left.showDate) || right.createdAt.localeCompare(left.createdAt));

  const dates = sessions.map((session) => session.showDate).sort();
  if (dates.join("|") !== [...HISTORICAL_QUEUE_IMPORT_DATES].sort().join("|")) {
    throw new Error(`Historical queue capture must contain one session for each of ${HISTORICAL_QUEUE_IMPORT_DATES.join(" and ")}.`);
  }
  if (new Set(sessions.map((session) => session.sessionId)).size !== sessions.length) {
    throw new Error("Historical queue capture repeats a session ID.");
  }
  const activeSessionId = sessions.find((session) => session.showDate === "2026-08-14")!.sessionId;
  const activeSessionSelection: QueueHistoricalImportResult["activeSessionSelection"] = "newest_imported_archived_session";
  const digestInput = {
    schema: HISTORICAL_QUEUE_IMPORT_SCHEMA_VERSION,
    capturedAt,
    sourceUrl: HISTORICAL_QUEUE_IMPORT_SOURCE_URL,
    sourceCommit: HISTORICAL_QUEUE_IMPORT_SOURCE_COMMIT,
    sourceRevision,
    sourceActiveSessionId,
    sourceRosterSha256,
    august7OwnerExportSha256: HISTORICAL_QUEUE_AUGUST_7_EXPORT_SHA256,
    dateNormalizations: [...dateNormalizations.values()].sort((left, right) => left.canonicalShowDate.localeCompare(right.canonicalShowDate)),
    responseEvidence: responseEvidence.sort((left, right) => left.canonicalShowDate.localeCompare(right.canonicalShowDate)),
    activeSessionId,
    activeSessionSelection,
    sessions,
  };
  const sourceDigest = createHash("sha256").update(canonicalJson(digestInput)).digest("hex");
  const finalizedSessions = sessions.map((session) => normalizeSession({
    ...session,
    historicalRecoveryProvenance: session.historicalRecoveryProvenance
      ? { ...session.historicalRecoveryProvenance, sourceDigest }
      : null,
  }));
  const requiredConfirmation = `IMPORT 2 HISTORICAL QUEUE SESSIONS ${sourceDigest} INTO REVISION 0`;
  const summaries = finalizedSessions.map((session) => ({
    sessionId: session.sessionId,
    showDate: session.showDate,
    sourceShowDate: session.historicalRecoveryProvenance!.sourceStoredShowDate,
    sourceStatus: session.historicalRecoveryProvenance!.sourceStatus,
    appliedNormalizations: [...session.historicalRecoveryProvenance!.appliedNormalizations],
    title: session.title,
    status: session.status,
    queueCount: session.queue.length,
    completedCount: session.completed.length,
    removedCount: session.removed.length,
    spotlightCount: session.spotlight.length,
    hasNextInLine: Boolean(session.nextInLineTrack),
    hasLoadedTrack: Boolean(session.loadedTrack),
  }));
  return {
    sourceRevision,
    sourceDigest,
    requiredConfirmation,
    sourceActiveSessionId,
    activeSessionId,
    activeSessionSelection,
    sessions: finalizedSessions,
    summaries,
  };
}

function isEmptyRevisionZeroPlaceholder(store: QueueStore): boolean {
  if (store.revision !== 0 || store.sessions.length !== 1 || queueStoreTrackRecordCount(store) !== 0) return false;
  const session = store.sessions[0];
  return store.activeSessionId === session.sessionId
    && session.title === `BARCODE Radio — ${session.showDate}`
    && session.description === sessionDescriptionFor(session.showDate)
    && session.createdAt === session.updatedAt
    && session.status === "prepared"
    && session.purpose === "rehearsal"
    && session.bnlPublicationStatus === "private"
    && session.provenanceRevision === 1
    && session.provenanceUpdatedAt === session.createdAt
    && session.queueOpen === false
    && session.submissionClosureReason === "manual"
    && session.trackLimitPerArtist === 3
    && session.queueCapacity === DEFAULT_QUEUE_CAPACITY
    && session.skipGameTapTarget === 10000
    && session.submissionCooldownSeconds === DEFAULT_SUBMISSION_COOLDOWN_SECONDS
    && session.showStarted !== true
    && !session.preShowEndsAt
    && !session.broadcastStartedAt
    && !session.nextInLineTrackId
    && !session.loadedTrackId
    && !session.nextInLineHoldTrackId
    && !session.currentTrackPreviousLane
    && session.currentTrackPreviousIndex === null
    && !session.loadedTrackPreviousLane
    && session.loadedTrackPreviousIndex === null
    && session.loadedTrackWasNextInLine !== true
    && !session.loadedTrackFallbackForLane
    && session.autoRoutingPaused !== true
    && session.nextNonPriorityLane === "wheel"
    && (session.wheelSpinsOwed ?? 0) === 0
    && session.priorityUpgradesEnabled === false
    && session.priorityUpgradePaymentsEnabled === false
    && session.priorityUpgradeLabel === DEFAULT_PRIORITY_UPGRADE_LABEL
    && session.priorityUpgradeInstructions === DEFAULT_PRIORITY_UPGRADE_INSTRUCTIONS
    && session.priorityUpgradePriceCents === DEFAULT_PRIORITY_UPGRADE_PRICE_CENTS
    && session.priorityUpgradeCurrency === DEFAULT_PRIORITY_UPGRADE_CURRENCY
    && session.sponsorBreakSeconds === SPONSOR_BREAK_SECONDS
    && session.sponsorBreakMode === "mid_show"
    && session.sponsorBreakStatus === "not_due"
    && !session.sponsorBreakStartedAt
    && !session.sponsorBreakCompletedAt
    && !session.sponsorBreakCompletedAfterPlayableCount
    && !session.sponsorBreakDueAfterPlayableCount
    && !session.sponsorBreakManualNote
    && canonicalJson(normalizeQueuePlaybackDiagnostics(session.playbackDiagnostics)) === canonicalJson(emptyQueuePlaybackDiagnostics());
}

function historicalQueueImportResult(
  plan: HistoricalQueueImportPlan,
  input: { dryRun: boolean; imported: boolean; alreadyPresent: boolean; currentRevision: number; targetRevision: number },
): QueueHistoricalImportResult {
  return {
    ...input,
    sourceRevision: plan.sourceRevision,
    sourceDigest: plan.sourceDigest,
    requiredConfirmation: plan.requiredConfirmation,
    sourceActiveSessionId: plan.sourceActiveSessionId,
    activeSessionId: plan.activeSessionId,
    activeSessionSelection: plan.activeSessionSelection,
    sessions: plan.summaries,
    acceptedLosses: HISTORICAL_QUEUE_IMPORT_ACCEPTED_LOSSES,
  };
}

export async function importHistoricalQueueSessions(input: {
  capture: unknown;
  dryRun?: boolean;
  confirmation?: string;
}): Promise<QueueHistoricalImportResult> {
  const plan = historicalQueueImportPlan(input.capture);
  getDedicatedQueueRecoveryRedisConfig();
  if (!isQueueDurableSnapshotConfigured()) {
    throw new Error("Durable queue snapshots are not configured. Historical import refused.");
  }

  return withQueueMutation(async () => {
    const current = await readStore();
    const rawDurable = await readQueueDurableSnapshot<QueueStore>();
    if (!rawDurable) throw new Error("No verified durable queue snapshot is available. Historical import refused.");
    const durable = normalizeStore(rawDurable);
    if (durable.revision !== current.revision || !storesMatch(durable, current)) {
      throw new Error("Queue Redis and the durable snapshot must be aligned before historical import.");
    }

    const intendedAtCurrentRevision = queueStoreWithShowLog(
      { revision: current.revision, activeSessionId: null, sessions: [] },
      {
        revision: current.revision,
        activeSessionId: plan.activeSessionId,
        sessions: plan.sessions,
      },
    );
    if (current.revision === 1 && storesMatch(current, intendedAtCurrentRevision)) {
      return historicalQueueImportResult(plan, {
        dryRun: input.dryRun !== false,
        imported: false,
        alreadyPresent: true,
        currentRevision: current.revision,
        targetRevision: current.revision,
      });
    }
    if (!isEmptyRevisionZeroPlaceholder(current)) {
      throw new Error("Historical queue import requires one empty placeholder at aligned revision 0. Existing queue data was not changed.");
    }

    if (input.dryRun !== false) {
      return historicalQueueImportResult(plan, {
        dryRun: true,
        imported: false,
        alreadyPresent: false,
        currentRevision: current.revision,
        targetRevision: 1,
      });
    }
    if (input.confirmation !== plan.requiredConfirmation) {
      throw new Error(`Historical import confirmation must exactly match: ${plan.requiredConfirmation}`);
    }

    const nextStore: QueueStore = {
      revision: current.revision,
      activeSessionId: plan.activeSessionId,
      sessions: plan.sessions,
    };
    await writeStore(nextStore, { requireDurableSnapshot: true });
    return historicalQueueImportResult(plan, {
      dryRun: false,
      imported: true,
      alreadyPresent: false,
      currentRevision: current.revision,
      targetRevision: nextStore.revision,
    });
  });
}

function queueStoreTrackRecordCount(store: QueueStore): number {
  return store.sessions.reduce((total, session) => total
    + session.queue.length
    + session.completed.length
    + session.removed.length
    + session.spotlight.length
    + (session.nextInLineTrack ? 1 : 0)
    + (session.loadedTrack ? 1 : 0), 0);
}

function redisRecoveryErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== undefined && current !== null && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current === "string") {
      messages.push(current);
      break;
    }
    if (typeof current !== "object") {
      messages.push(String(current));
      break;
    }
    const record = current as { message?: unknown; cause?: unknown };
    if (typeof record.message === "string" && record.message.trim()) messages.push(record.message.trim());
    current = record.cause;
  }
  return messages.length > 0 ? messages : ["Unknown Redis error"];
}

function sanitizeRedisRecoveryFailureDetail(messages: string[]): string {
  return messages.join(": ")
    .replace(/(?:https?|redis):\/\/[^\s,)'"\\]+/gi, "[redacted-endpoint]")
    .replace(/\b(?:[a-z0-9-]+\.)+(?:app|cloud|com|dev|io|net|org)\b/gi, "[redacted-host]")
    .replace(/\b(?:bearer\s+)?[a-z0-9_-]{32,}\b/gi, "[redacted-value]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function redisRecoveryFailure(error: unknown): {
  reason: Exclude<QueueRecoveryStatus["redis"]["failureReason"], null>;
  detail: string;
} {
  const messages = redisRecoveryErrorMessages(error);
  const combined = messages.join(" ");
  let reason: Exclude<QueueRecoveryStatus["redis"]["failureReason"], null> = "unavailable";
  if (/max requests limit exceeded|(?:request|command) quota.*(?:exceeded|limit)|monthly request limit/i.test(combined)) {
    reason = "request_quota_exceeded";
  } else if (/wrongpass|unauthori[sz]ed|forbidden|authentication|invalid (?:auth|token|credential)|expired token|\b(?:401|403)\b/i.test(combined)) {
    reason = "authentication_failed";
  } else if (/invalid url|url.*(?:invalid|missing)|unsupported protocol|absolute url|initialized without (?:a )?url|client url|malformed/i.test(combined)) {
    reason = "configuration_error";
  } else if (/fetch failed|network|econn(?:refused|reset|aborted)|enotfound|eai_again|dns|socket|timed? ?out|timeout|tls|certificate/i.test(combined)) {
    reason = "network_unavailable";
  } else if (/upstash|redis|command failed|command was|http(?: status)?\s*\d{3}/i.test(combined)) {
    reason = "provider_error";
  }
  return { reason, detail: sanitizeRedisRecoveryFailureDetail(messages) };
}

function storesMatch(left: QueueStore, right: QueueStore): boolean {
  return JSON.stringify(normalizeStore(left)) === JSON.stringify(normalizeStore(right));
}

export async function getQueueRecoveryStatus(): Promise<QueueRecoveryStatus> {
  let durable: QueueStore | null = null;
  let durableFailureReason: QueueRecoveryStatus["durable"]["failureReason"] = null;
  const durableConfigured = isQueueDurableSnapshotConfigured();
  try {
    const raw = await readQueueDurableSnapshot<QueueStore>();
    if (raw) durable = normalizeStore(raw);
    else durableFailureReason = durableConfigured ? "snapshot_not_found" : "not_configured";
  } catch {
    durable = null;
    durableFailureReason = "unavailable";
  }

  const dedicatedUrlPresent = Boolean(process.env.QUEUE_REDIS_REST_URL?.trim());
  const dedicatedTokenPresent = Boolean(process.env.QUEUE_REDIS_REST_TOKEN?.trim());
  const sharedUrlPresent = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim());
  const sharedTokenPresent = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const redisConfigurationStatus: QueueRecoveryStatus["redis"]["configurationStatus"] = dedicatedUrlPresent || dedicatedTokenPresent
    ? dedicatedUrlPresent && dedicatedTokenPresent ? "dedicated" : "partial_dedicated"
    : sharedUrlPresent || sharedTokenPresent
      ? sharedUrlPresent && sharedTokenPresent ? "shared_fallback" : "partial_shared"
      : "missing";
  const redisIsolatedFromShared = redisConfigurationStatus === "dedicated"
    ? dedicatedQueueRecoveryIsolationStatus()
    : null;
  let redisConfig: ReturnType<typeof getQueueRedisConfig> = null;
  let redisStore: QueueStore | null = null;
  let redisRevision: number | null = null;
  let redisFailureReason: QueueRecoveryStatus["redis"]["failureReason"] = null;
  let redisFailureStage: QueueRecoveryStatus["redis"]["failureStage"] = null;
  let redisFailureDetail: string | null = null;
  try {
    redisConfig = getQueueRedisConfig();
    if (redisConfigurationStatus === "partial_shared") {
      redisFailureReason = "configuration_error";
      redisFailureStage = "configuration";
      redisFailureDetail = "Shared Redis fallback URL and token must both be configured.";
    }
  } catch (error) {
    // Recovery diagnostics must remain readable when an environment-variable
    // rollout is incomplete. Mutations still fail closed in getQueueRedisConfig.
    redisFailureReason = "configuration_error";
    redisFailureStage = "configuration";
    redisFailureDetail = sanitizeRedisRecoveryFailureDetail(redisRecoveryErrorMessages(error));
  }
  if (redisConfig) {
    let currentStage: NonNullable<QueueRecoveryStatus["redis"]["failureStage"]> = "client_initialization";
    try {
      // Client construction validates provider configuration and can throw
      // before the first request. Keep it inside the diagnostic boundary.
      const redis = new Redis({ url: redisConfig.url, token: redisConfig.token });
      currentStage = "state_read";
      const [raw, revisionValue] = await Promise.all([
        redis.get<QueueStore | string>(STATE_KEY),
        redis.get<number | string>(MUTATION_REVISION_KEY),
      ]);
      if (raw) redisStore = normalizeStore(typeof raw === "string" ? JSON.parse(raw) : raw);
      redisRevision = mutationRevision(revisionValue ?? redisStore?.revision ?? 0);
      if (redisStore && redisStore.revision !== redisRevision) {
        redisFailureReason = "provider_error";
        redisFailureStage = "state_validation";
        redisFailureDetail = "Redis queue state and mutation revision are inconsistent.";
      }
    } catch (error) {
      const failure = redisRecoveryFailure(error);
      redisFailureReason = failure.reason;
      redisFailureStage = currentStage;
      redisFailureDetail = failure.detail;
    }
  }

  let alignment: QueueRecoveryStatus["alignment"] = "unavailable";
  if (durable && redisStore) {
    if (durable.revision > (redisRevision ?? redisStore.revision)) alignment = "durable_ahead";
    else if (durable.revision < (redisRevision ?? redisStore.revision)) alignment = "redis_ahead";
    else alignment = storesMatch(durable, redisStore) ? "aligned" : "different_at_same_revision";
  } else if (durable) alignment = "durable_only";
  else if (redisStore) alignment = "redis_only";

  return {
    durable: {
      configured: durableConfigured,
      available: Boolean(durable),
      failureReason: durable ? null : durableFailureReason,
      revision: durable?.revision ?? null,
      activeSessionId: durable?.activeSessionId ?? null,
      sessionCount: durable?.sessions.length ?? 0,
      trackRecordCount: durable ? queueStoreTrackRecordCount(durable) : 0,
    },
    redis: {
      configured: Boolean(redisConfig) || redisConfigurationStatus === "partial_dedicated" || redisConfigurationStatus === "partial_shared",
      configurationStatus: redisConfigurationStatus,
      dedicated: redisConfig?.dedicated ?? false,
      isolatedFromShared: redisIsolatedFromShared,
      available: Boolean(redisStore) && !redisFailureReason,
      revision: redisRevision,
      activeSessionId: redisStore?.activeSessionId ?? null,
      sessionCount: redisStore?.sessions.length ?? 0,
      trackRecordCount: redisStore ? queueStoreTrackRecordCount(redisStore) : 0,
      failureReason: redisFailureReason,
      failureStage: redisFailureStage,
      failureDetail: redisFailureDetail,
    },
    alignment,
    requiredConfirmation: durable ? `RESTORE DURABLE QUEUE REVISION ${durable.revision}` : null,
  };
}

export async function restoreQueueFromDurableSnapshot(input: { dryRun?: boolean; confirmation?: string } = {}): Promise<QueueRecoveryResult> {
  const rawDurable = await readQueueDurableSnapshot<QueueStore>();
  if (!rawDurable) throw new Error("No verified durable queue snapshot is available.");
  const durable = normalizeStore(rawDurable);
  const config = getDedicatedQueueRecoveryRedisConfig();
  const redis = new Redis({ url: config.url, token: config.token });

  return waitForLocalMutationTurn(async () => {
    const token = await acquireRedisMutationLock(redis);
    try {
      const [rawCurrent, revisionValue] = await Promise.all([
        redis.get<QueueStore | string>(STATE_KEY),
        redis.get<number | string>(MUTATION_REVISION_KEY),
      ]);
      const current = rawCurrent ? normalizeStore(typeof rawCurrent === "string" ? JSON.parse(rawCurrent) : rawCurrent) : null;
      const currentRevision = mutationRevision(revisionValue ?? current?.revision ?? 0);
      if (current && current.revision !== currentRevision) {
        throw new Error("Queue Redis revision is inconsistent. Restore refused.");
      }
      if (currentRevision > durable.revision) {
        throw new Error("Queue Redis contains a newer revision than the durable snapshot. Restore refused.");
      }

      const result: QueueRecoveryResult = {
        dryRun: input.dryRun !== false,
        restored: false,
        revision: durable.revision,
        activeSessionId: durable.activeSessionId,
        sessionCount: durable.sessions.length,
        trackRecordCount: queueStoreTrackRecordCount(durable),
        previousRedisRevision: currentRevision,
      };
      if (input.dryRun !== false || (current && currentRevision === durable.revision && storesMatch(current, durable))) return result;

      const expectedConfirmation = `RESTORE DURABLE QUEUE REVISION ${durable.revision}`;
      if (input.confirmation !== expectedConfirmation) {
        throw new Error(`Restore confirmation must exactly match: ${expectedConfirmation}`);
      }
      const restoredRevision = await redis.eval<unknown[], number>(
        RESTORE_DURABLE_SNAPSHOT_SCRIPT,
        [MUTATION_LOCK_KEY, STATE_KEY, MUTATION_REVISION_KEY, LIVE_STATE_KEY],
        [token, String(currentRevision), JSON.stringify(durable), String(durable.revision), JSON.stringify(liveStoreProjection(durable))],
      );
      if (restoredRevision !== durable.revision) throw new Error("Queue Redis changed before restore could commit. Restore refused.");
      lastKnownGoodRedisStore = durable;
      lastKnownGoodRedisEndpoint = getQueueRedisEndpoint();
      return { ...result, dryRun: false, restored: true };
    } finally {
      try { await releaseRedisMutationLock(redis, token); } catch { /* fenced restore is already complete */ }
    }
  });
}

function findSession(store: QueueStore, sessionId?: string): QueueSession | null {
  const targetId = sessionId ?? store.activeSessionId;
  if (!targetId) return null;
  return store.sessions.find((session) => session.sessionId === targetId) ?? null;
}

function getSession(store: QueueStore, sessionId?: string): QueueSession {
  const session = findSession(store, sessionId) ?? (sessionId ? findSession(store) : null);
  if (!session) throw new Error("Queue session not found.");
  return session;
}

function replaceSession(store: QueueStore, session: QueueSession): QueueStore {
  const nextSession = { ...session };
  applyCommercialBreakTimer(nextSession);
  return { ...store, sessions: store.sessions.map((item) => item.sessionId === nextSession.sessionId ? normalizeSession({ ...nextSession, updatedAt: new Date().toISOString() }) : item) };
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

async function lookupYouTubeMetadata(link: string, budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const key = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY;
  const id = parseYouTubeVideoId(link);
  if (!key || !id) return blankProvider("internal_estimate");
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
  const payload = await fetchProviderJson(url, {}, budget) as {
    items?: Array<{
      contentDetails?: { duration?: unknown };
      snippet?: { title?: unknown; channelTitle?: unknown };
    }>;
  } | null;
  const item = Array.isArray(payload?.items) ? payload.items[0] : null;
  const duration = typeof item?.contentDetails?.duration === "string" ? parseYouTubeDuration(item.contentDetails.duration) : null;
  const providerTitle = sanitizeProviderText(item?.snippet?.title, 240);
  const channelTitle = sanitizeProviderText(item?.snippet?.channelTitle, 160);
  return { detectedArtistName: channelTitle, detectedSongTitle: providerTitle, providerTitle, detectedDurationSeconds: duration, durationSource: duration ? "youtube_api" : "internal_estimate", artworkUrl: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null };
}

function spotifyOEmbedUrl(link: string): string {
  const trackId = link.match(/spotify:track:([a-zA-Z0-9]+)/)?.[1];
  return trackId ? `https://open.spotify.com/track/${trackId}` : link;
}

async function lookupSpotifyOEmbed(link: string, base: ProviderMetadata = blankProvider("internal_estimate"), budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const payload = await fetchProviderJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyOEmbedUrl(link))}`, {}, budget) as { thumbnail_url?: unknown; title?: unknown } | null;
  if (!payload) return base;
  const artworkUrl = safeHttpsPublicUrl(payload.thumbnail_url) ?? base.artworkUrl ?? null;
  const providerTitle = base.providerTitle ?? sanitizeProviderText(payload.title, 240);
  return { ...base, providerTitle, artworkUrl };
}

async function lookupSpotifyMetadata(link: string, budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const fallback = (base: ProviderMetadata = blankProvider("internal_estimate")) => lookupSpotifyOEmbed(link, base, budget);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const trackId = parseSpotifyTrackId(link);
  if (!trackId || !clientId || !clientSecret) return fallback();
  const tokenPayload = await fetchProviderJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }, budget) as { access_token?: unknown } | null;
  const token = sanitizeProviderText(tokenPayload?.access_token, 4096);
  if (!token) return fallback();
  const track = await fetchProviderJson(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${token}` } }, budget) as {
    duration_ms?: unknown;
    artists?: Array<{ name?: unknown }>;
    name?: unknown;
    album?: { images?: Array<{ url?: unknown }> };
  } | null;
  if (!track) return fallback();
  const seconds = typeof track.duration_ms === "number" ? Math.round(track.duration_ms / 1000) : null;
  const artist = Array.isArray(track.artists) ? track.artists.map((item) => sanitizeProviderText(item.name, 120)).filter((value): value is string => Boolean(value)).join(", ") : null;
  const title = sanitizeProviderText(track.name, 240);
  const artworkUrl = Array.isArray(track.album?.images) ? track.album.images.map((image) => safeHttpsPublicUrl(image.url)).find((value): value is string => Boolean(value)) ?? null : null;
  const metadata = { detectedArtistName: artist || null, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "spotify_api" as const : "internal_estimate" as const, artworkUrl };
  return artworkUrl ? metadata : fallback(metadata);
}

async function lookupSoundCloudOEmbed(link: string, base: ProviderMetadata = blankProvider("internal_estimate"), budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const payload = await fetchProviderJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link)}`, {}, budget) as { thumbnail_url?: unknown; title?: unknown } | null;
  if (!payload) return base;
  const artworkUrl = safeHttpsPublicUrl(payload.thumbnail_url) ?? base.artworkUrl ?? null;
  const providerTitle = base.providerTitle ?? sanitizeProviderText(payload.title, 240);
  return { ...base, providerTitle, artworkUrl };
}

function sanitizeProviderText(value: unknown, maxLength = 180): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function safeHttpsPublicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

async function lookupTikTokMetadata(link: string, budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const parsed = parseTikTokVideoUrl(link);
  if (!parsed?.oEmbedSourceUrl) return blankProvider("internal_estimate");
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.oEmbedSourceUrl)}`;
  const payload = await fetchProviderJson(endpoint, {}, budget) as { author_name?: unknown; title?: unknown; thumbnail_url?: unknown } | null;
  if (!payload) return blankProvider("internal_estimate");
  return {
    detectedArtistName: sanitizeProviderText(payload.author_name, 120),
    detectedSongTitle: null,
    providerTitle: sanitizeProviderText(payload.title, 240),
    detectedDurationSeconds: null,
    durationSource: "internal_estimate",
    artworkUrl: safeHttpsPublicUrl(payload.thumbnail_url),
  };
}

async function lookupSoundCloudMetadata(link: string, budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const fallback = (base: ProviderMetadata = blankProvider("internal_estimate")) => lookupSoundCloudOEmbed(link, base, budget);
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  if (!clientId) return fallback();
  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(link)}&client_id=${encodeURIComponent(clientId)}`;
  const track = await fetchProviderJson(resolveUrl, {}, budget) as {
    duration?: unknown;
    title?: unknown;
    user?: { username?: unknown };
    artwork_url?: unknown;
  } | null;
  if (!track) return fallback();
  const seconds = typeof track.duration === "number" ? Math.round(track.duration / 1000) : null;
  const title = sanitizeProviderText(track.title, 240);
  const artist = sanitizeProviderText(track.user?.username, 160);
  const rawArtwork = safeHttpsPublicUrl(track.artwork_url);
  const artworkUrl = rawArtwork ? rawArtwork.replace("-large.", "-t500x500.") : null;
  const metadata = { detectedArtistName: artist, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "soundcloud_api" as const : "internal_estimate" as const, artworkUrl };
  return artworkUrl ? metadata : fallback(metadata);
}

export async function detectProviderMetadata(sourceType: QueueSourceType, link: string): Promise<ProviderMetadata> {
  const budget = createProviderFetchBudget();
  try {
    if (sourceType === "youtube") return await lookupYouTubeMetadata(link, budget);
    if (sourceType === "spotify") return await lookupSpotifyMetadata(link, budget);
    if (sourceType === "soundcloud") return await lookupSoundCloudMetadata(link, budget);
    if (sourceType === "tiktok") return await lookupTikTokMetadata(link, budget);
    return blankProvider("internal_estimate");
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

type SubmissionIdentityInput = {
  submitterToken?: string | null;
  normalizedTikTokHandle?: string | null;
  tiktokHandle?: string | null;
  contactEmail?: string | null;
  submitterArtistName?: string | null;
  submittedArtistName?: string | null;
  artist?: string | null;
};

function submissionIdentityKeys(identity: SubmissionIdentityInput): string[] {
  const token = identity.submitterToken?.trim() ?? "";
  const tikTok = normalizeTikTokHandle(identity.normalizedTikTokHandle ?? identity.tiktokHandle ?? "");
  const email = normalizeEmail(identity.contactEmail);
  const artist = normalizeIdentity(identity.submitterArtistName ?? identity.submittedArtistName ?? identity.artist);
  return [
    token ? `token:${token}` : "",
    tikTok ? `tiktok:${tikTok}` : "",
    email ? `email:${email}` : "",
    artist ? `artist:${artist}` : "",
  ].filter(Boolean);
}

function connectedSubmissionEntries(entries: QueueEntry[], identity: SubmissionIdentityInput): QueueEntry[] {
  const connectedKeys = new Set(submissionIdentityKeys(identity));
  if (connectedKeys.size === 0) return [];

  const connectedIndexes = new Set<number>();
  let expanded = true;
  while (expanded) {
    expanded = false;
    entries.forEach((entry, index) => {
      if (connectedIndexes.has(index)) return;
      const keys = submissionIdentityKeys(entry);
      if (!keys.some((key) => connectedKeys.has(key))) return;
      connectedIndexes.add(index);
      keys.forEach((key) => connectedKeys.add(key));
      expanded = true;
    });
  }
  return entries.filter((_, index) => connectedIndexes.has(index));
}

export function normalizeQueueSourceKey(value?: string | null): string | null {
  if (!value) return null;
  const tiktok = parseTikTokVideoUrl(value);
  if (tiktok) return `tiktok:video:${tiktok.postId}`;
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
  if (sourceType === "tiktok") {
    const parsed = parseTikTokVideoUrl(link);
    return parsed ? `tiktok:video:${parsed.postId}` : null;
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
  const limit = normalizeTrackLimitPerArtist(session.trackLimitPerArtist);
  const tikTok = track.normalizedTikTokHandle;
  const submitter = normalizeIdentity(track.submitterArtistName ?? track.submittedArtistName);
  const email = normalizeEmail(track.contactEmail);
  const token = track.submitterToken ?? "";
  if (tikTok && countMatches(entries, (entry) => entry.normalizedTikTokHandle === tikTok) >= limit) reasons.push("Limit matched by TikTok handle");
  if (submitter && countMatches(entries, (entry) => normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) === submitter) >= limit) reasons.push("Limit matched by submitter artist name");
  if (email && countMatches(entries, (entry) => normalizeEmail(entry.contactEmail) === email) >= limit) reasons.push("Limit matched by contact/email");
  if (token && countMatches(entries, (entry) => entry.submitterToken === token) >= limit) reasons.push("Limit matched by browser token");
  if (connectedSubmissionEntries(entries, track).length >= limit) reasons.push("Limit matched across known submitter identities");
  return reasons;
}

function suspiciousFlagsFor(session: QueueSession, track: QueueEntry): string[] {
  const entries = [...session.queue, ...(session.nextInLineTrack ? [session.nextInLineTrack] : []), ...(session.loadedTrack ? [session.loadedTrack] : []), ...session.completed, ...session.removed];
  const flags = new Set<string>();
  const submitter = normalizeIdentity(track.submitterArtistName ?? track.submittedArtistName);
  if (track.submitterToken && entries.some((entry) => entry.submitterToken === track.submitterToken && normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) !== submitter)) flags.add("Same browser token using different artist names");
  if (track.fileName && track.fileSize && entries.some((entry) => entry.fileName?.toLowerCase() === (track.fileName ?? "").toLowerCase() && entry.fileSize === track.fileSize && (!track.detectedDurationSeconds || !entry.detectedDurationSeconds || entry.detectedDurationSeconds === track.detectedDurationSeconds))) flags.add("Same file name, size, and duration");
  if (track.submittedSongTitle && entries.some((entry) => normalizeIdentity(entry.submittedSongTitle) === normalizeIdentity(track.submittedSongTitle) && normalizeIdentity(entry.submittedArtistName) !== normalizeIdentity(track.submittedArtistName))) flags.add("Same source/title with changed artist name");
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
  legalAcceptance?: QueueLegalAcceptance;
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
    : "internal_estimate";

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
    uploadedFileDeleteAfter: sourceType === "upload" && isUploadedAudioEntry({ sourceType, fileUrl: input.fileUrl ?? null, mimeType: input.mimeType ?? null }) ? new Date(Date.now() + UPLOADED_FILE_RETENTION_MS).toISOString() : null,
    uploadedFileDeletedAt: null,
    uploadedFileDeletionStatus: null,
    uploadedFileDeletionError: null,
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
    priorityUpgradeCheckoutOwnerTokenHash: null,
    priorityUpgradeAmountCents: null,
    priorityUpgradeCurrency: null,
    priorityGiftAttribution: null,
    displacedFromNextInLineAt: null,
    priorityPausedAt: null,
    priorityResumedAt: null,
    priorityQueueOrderAt: null,
    stagedAsFallbackForLane: null,
    legalAcceptance: input.legalAcceptance ?? null,
    isTestTrack: false,
  });
}

export async function submitRadioTrack(
  input: Parameters<typeof createQueueTrack>[0] & { sessionId?: string },
): Promise<QueueEntry> {
  // Provider resolution can be slow and must never hold the queue mutation lock.
  const track = await createQueueTrack(input);
  return withQueueMutation(async () => {
    const store = await readStore();
    if (input.sessionId && store.activeSessionId !== input.sessionId) {
      const error = new Error("This session has changed. Refresh the queue and try again.") as Error & { code?: string };
      error.code = "stale_session";
      throw error;
    }
    const session = getSession(store);
    applyPreShowTimer(session);
    const status = publicStatusForSession(session);
    if (status.isFull) throw new Error("Queue is full for new transmissions.");
    if (session.status !== "open" || !session.queueOpen) throw new Error("Queue is closed");
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
  });
}


export interface QueueUploadCleanupResult {
  scanned: number;
  deleted: number;
  skippedActive: number;
  failed: number;
}

function isTrackActiveForPlayback(session: QueueSession, id: string): boolean {
  return session.loadedTrackId === id || session.loadedTrack?.id === id || session.nextInLineTrackId === id || session.nextInLineTrack?.id === id;
}

function updateEntriesInSession(session: QueueSession, shouldUpdate: (entry: QueueEntry) => boolean, update: (entry: QueueEntry) => QueueEntry): void {
  session.queue = session.queue.map((entry) => shouldUpdate(entry) ? update(entry) : entry);
  session.completed = session.completed.map((entry) => shouldUpdate(entry) ? update(entry) : entry);
  session.removed = session.removed.map((entry) => shouldUpdate(entry) ? update(entry) : entry);
  session.spotlight = session.spotlight.map((entry) => shouldUpdate(entry) ? update(entry) : entry);
  if (session.nextInLineTrack && shouldUpdate(session.nextInLineTrack)) session.nextInLineTrack = update(session.nextInLineTrack);
  if (session.loadedTrack && shouldUpdate(session.loadedTrack)) session.loadedTrack = update(session.loadedTrack);
}

function updateMatchingEntriesInStore(store: QueueStore, candidate: { id: string; fileUrl: string }, update: (entry: QueueEntry) => QueueEntry): void {
  for (const session of store.sessions) {
    updateEntriesInSession(session, (entry) => entry.id === candidate.id || entry.fileUrl === candidate.fileUrl, update);
  }
}

export async function cleanupExpiredQueueUploads(options: { now?: Date; deleteBlob?: (url: string) => Promise<void> } = {}): Promise<QueueUploadCleanupResult> {
  const now = options.now ?? new Date();
  const deleteBlob = options.deleteBlob ?? (async (url: string) => {
    const { del } = await import("@vercel/blob");
    await del(url);
  });
  const store = await readStore();
  // Never delete a queue upload unless the full queue record has first been
  // captured independently of Redis. With no Blob token this is a no-op for
  // local/test environments; production has the same private store as uploads.
  const persistedSnapshot = await persistQueueDurableSnapshot(store);
  if (process.env.NODE_ENV === "production" && (!isQueueDurableSnapshotConfigured() || !persistedSnapshot)) {
    throw new Error("Queue upload cleanup refused: durable queue snapshots are not configured.");
  }
  const result: QueueUploadCleanupResult = { scanned: 0, deleted: 0, skippedActive: 0, failed: 0 };
  const updates: Array<{
    candidate: { id: string; fileUrl: string };
    status: "deleted" | "error";
    deletedAt?: string;
    error?: string;
  }> = [];

  const candidates = new Map<string, { id: string; fileUrl: string; active: boolean }>();
  const candidatesByTrackId = new Map<string, { id: string; fileUrl: string; active: boolean }>();

  for (const session of store.sessions) {
    const entries = [session.loadedTrack, session.nextInLineTrack, ...session.queue, ...session.completed, ...session.removed, ...session.spotlight].filter((entry): entry is QueueEntry => Boolean(entry));
    for (const entry of entries) {
      const normalized = normalizeEntry(entry);
      if (!isUploadedAudioEntry(normalized) || normalized.uploadedFileDeletionStatus === "deleted" || !normalized.uploadedFileDeleteAfter || !normalized.fileUrl) continue;
      // Never delete audio from a current/prepared/closed live session. For an
      // archived session, retain it for at least the full recovery window after
      // archival even when older records carry the legacy 24-hour deadline.
      if (session.status !== "archived") continue;
      const archiveRecoveryDue = new Date(session.updatedAt).getTime() + UPLOADED_FILE_RETENTION_MS;
      const due = Math.max(new Date(normalized.uploadedFileDeleteAfter).getTime(), archiveRecoveryDue);
      if (!Number.isFinite(due) || due > now.getTime()) continue;
      const key = normalized.fileUrl;
      const existing = candidates.get(key) ?? candidatesByTrackId.get(normalized.id);
      const active = isTrackActiveForPlayback(session, normalized.id);
      if (existing) {
        existing.active = existing.active || active;
        candidatesByTrackId.set(normalized.id, existing);
        continue;
      }
      const candidate = { id: normalized.id, fileUrl: normalized.fileUrl, active };
      candidates.set(key, candidate);
      candidatesByTrackId.set(normalized.id, candidate);
    }
  }

  for (const candidate of candidates.values()) {
    result.scanned += 1;
    if (candidate.active) {
      result.skippedActive += 1;
      continue;
    }
    try {
      await deleteBlob(candidate.fileUrl);
      const deletedAt = now.toISOString();
      updates.push({ candidate, status: "deleted", deletedAt });
      result.deleted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload deletion failed.";
      updates.push({ candidate, status: "error", error: message.slice(0, 500) });
      result.failed += 1;
    }
  }

  if (updates.length > 0) {
    await withQueueMutation(async () => {
      const latest = await readStore();
      for (const update of updates) {
        updateMatchingEntriesInStore(latest, update.candidate, (item) => {
          const current = normalizeEntry(item);
          if (current.uploadedFileDeletionStatus === "deleted") return current;
          if (update.status === "deleted") {
            return normalizeEntry({
              ...current,
              uploadedFileDeletedAt: update.deletedAt ?? now.toISOString(),
              uploadedFileDeletionStatus: "deleted",
              uploadedFileDeletionError: null,
            });
          }
          return normalizeEntry({
            ...current,
            uploadedFileDeletionStatus: "error",
            uploadedFileDeletionError: update.error ?? "Upload deletion failed.",
          });
        });
      }
      await writeStore(latest);
    });
  }
  return result;
}

export async function isTrackPersistedInSessionQueue(trackId: string, sessionId?: string): Promise<boolean> {
  const state = await getRadioQueueState(sessionId);
  if (state.queue.some((entry) => entry.id === trackId)) return true;
  if (state.nextInLine?.id === trackId) return true;
  if (state.loadedTrack?.id === trackId) return true;
  if (state.nowPlaying?.id === trackId) return true;
  return false;
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
    revision: store.revision,
    nowPlaying: getLoadedTrack(normalized),
    queue: normalized.queue,
    history: normalized.completed,
    totalPlayed: completedCountedTrackCountForSession(normalized),
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
    playbackDiagnostics: normalizeQueuePlaybackDiagnostics(normalized.playbackDiagnostics),
    sessions: store.sessions.map(summarizeSession).sort((a, b) => b.showDate.localeCompare(a.showDate) || b.createdAt.localeCompare(a.createdAt)),
    viewedSessionId,
    readOnly: !isCurrentSession,
    isCurrentSession,
  };
}

function emptyQueuePublicStatus(): QueuePublicStatus {
  return {
    isOpen: false,
    activeCount: 0,
    acceptedCount: 0,
    estimatedRuntimeSeconds: 0,
    capacity: DEFAULT_QUEUE_CAPACITY,
    isFull: false,
    pressure: "low",
  };
}

function queueStateWithoutSession(store: QueueStore): QueueState {
  return {
    revision: store.revision,
    nowPlaying: null,
    queue: [],
    history: [],
    totalPlayed: 0,
    streamStatus: "offline",
    removed: [],
    spotlight: [],
    publicStatus: emptyQueuePublicStatus(),
    sessions: store.sessions.map(summarizeSession).sort((a, b) => b.showDate.localeCompare(a.showDate) || b.createdAt.localeCompare(a.createdAt)),
    readOnly: false,
    isCurrentSession: false,
    nextInLine: null,
    loadedTrack: null,
    autoRoutingPaused: false,
    nextNonPriorityLane: "wheel",
    wheelEligibleArtists: [],
    playbackDiagnostics: emptyQueuePlaybackDiagnostics(),
  };
}

export async function getRadioQueueState(sessionId?: string): Promise<QueueState> {
  const store = await readStore();
  const found = findSession(store, sessionId) ?? (sessionId ? findSession(store) : null);
  if (!found) return queueStateWithoutSession(store);
  const session = normalizeSession(found);
  if (session.status !== "archived") {
    applyPreShowTimer(session);
    applyCommercialBreakTimer(session);
    pullNextInLine(session);
  }
  return queueStateFromSession(session, store, sessionId ?? store.activeSessionId ?? session.sessionId);
}

/**
 * Read the current live session without reparsing every archived show. The
 * compact projection is committed atomically with the durable full store; a
 * missing pre-migration projection falls back to the established authority.
 */
export async function getRadioLiveQueueState(): Promise<QueueState> {
  let redis: Redis | null;
  try {
    redis = getRedis();
  } catch {
    return getRadioQueueState();
  }
  if (!redis) return getRadioQueueState();
  let projection: QueueLiveStoreProjection | null;
  try {
    const [rawProjection, rawRevision] = await redis.mget<[
      QueueLiveStoreProjection | string | null,
      number | string | null,
    ]>(LIVE_STATE_KEY, MUTATION_REVISION_KEY);
    projection = normalizeLiveStoreProjection(
      typeof rawProjection === "string" ? JSON.parse(rawProjection) : rawProjection,
    );
    if (!projection || projection.revision !== mutationRevision(rawRevision)) {
      return getRadioQueueState();
    }
  } catch {
    return getRadioQueueState();
  }
  if (!projection.session || !projection.activeSessionId) {
    return queueStateWithoutSession({ revision: projection.revision, activeSessionId: null, sessions: [] });
  }
  const session = normalizeSession(projection.session);
  applyPreShowTimer(session);
  applyCommercialBreakTimer(session);
  pullNextInLine(session);
  const store: QueueStore = {
    revision: projection.revision,
    activeSessionId: projection.activeSessionId,
    sessions: [session],
  };
  return queueStateFromSession(session, store, projection.activeSessionId);
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

type QueueShowLogTrackLocation = "queued" | "next" | "loaded" | "completed" | "removed";
type LocatedQueueShowLogTrack = { entry: QueueEntry; location: QueueShowLogTrackLocation };

function queueShowLogTracks(session: QueueSession): Map<string, LocatedQueueShowLogTrack> {
  const tracks = new Map<string, LocatedQueueShowLogTrack>();
  const add = (entry: QueueEntry | null | undefined, location: QueueShowLogTrackLocation): void => {
    if (!entry || isSimulationTrack(entry) || tracks.has(entry.id)) return;
    tracks.set(entry.id, { entry, location });
  };
  add(session.loadedTrack, "loaded");
  add(session.nextInLineTrack, "next");
  session.queue.forEach((entry) => add(entry, "queued"));
  session.completed.forEach((entry) => add(entry, "completed"));
  session.removed.forEach((entry) => add(entry, "removed"));
  return tracks;
}

function queueShowLogTrackOrder(
  events: QueueShowLogEvent[],
  trackId: string,
  field: "submissionOrder" | "playedOrder",
): number | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const track = events[index]?.track;
    if (track?.trackId === trackId && track[field]) return track[field];
  }
  return null;
}

function nextQueueShowLogOrder(events: QueueShowLogEvent[], field: "submissionOrder" | "playedOrder"): number {
  return events.reduce((highest, event) => Math.max(highest, event.track?.[field] ?? 0), 0) + 1;
}

function queueShowLogTrack(
  entry: QueueEntry,
  events: QueueShowLogEvent[],
  options: { submissionOrder?: number | null; playedOrder?: number | null } = {},
): QueueShowLogTrack {
  const publicTrack = toPublicQueueTrack(entry);
  return {
    trackId: publicTrack.id,
    artist: publicTrack.submittedArtistName,
    title: publicTrack.submittedSongTitle,
    tiktokHandle: normalizeTikTokHandle(publicTrack.tiktokHandle ?? entry.normalizedTikTokHandle ?? ""),
    sourceType: publicTrack.sourceType,
    publicSourceUrl: publicTrack.publicSourceUrl ?? null,
    submissionOrder: options.submissionOrder
      ?? queueShowLogTrackOrder(events, entry.id, "submissionOrder"),
    playedOrder: options.playedOrder
      ?? queueShowLogTrackOrder(events, entry.id, "playedOrder"),
  };
}

function appendQueueShowLogEvent(
  events: QueueShowLogEvent[],
  input: Omit<QueueShowLogEventInput, "track"> & {
    trackEntry?: QueueEntry | null;
    submissionOrder?: number | null;
    playedOrder?: number | null;
  },
): QueueShowLogEvent[] {
  const track = input.trackEntry
    ? queueShowLogTrack(input.trackEntry, events, {
      submissionOrder: input.submissionOrder,
      playedOrder: input.playedOrder,
    })
    : null;
  return appendQueueShowLogEvents(events, [{
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    track,
    details: input.details ?? null,
  }]);
}

function initialQueueShowLog(session: QueueSession): QueueShowLogEvent[] {
  const tracks = queueShowLogTracks(session);
  const timeline: Array<{
    eventType: QueueShowLogEventInput["eventType"];
    occurredAt: string;
    trackEntry?: QueueEntry;
    details?: QueueShowLogEventDetails | null;
  }> = [{ eventType: "session_created", occurredAt: session.createdAt }];

  for (const { entry } of tracks.values()) {
    timeline.push({ eventType: "track_submitted", occurredAt: entry.createdAt, trackEntry: entry });
    if (entry.restoredAt) {
      timeline.push({ eventType: "track_restored", occurredAt: entry.restoredAt, trackEntry: entry });
    }
    if (entry.signalHoldPaidAt && entry.signalHoldStatus === "paid_needs_attention") {
      timeline.push({ eventType: "track_signal_hold_needs_attention", occurredAt: entry.signalHoldPaidAt, trackEntry: entry });
    } else if (entry.signalHoldPaidAt && entry.signalHoldStatus !== "none" && entry.signalHoldStatus !== "checkout_pending" && entry.signalHoldStatus !== "failed" && entry.signalHoldStatus !== "refunded") {
      timeline.push({ eventType: "track_signal_hold_activated", occurredAt: entry.signalHoldPaidAt, trackEntry: entry });
    }
    if (entry.signalHoldAppliedAt && (entry.signalHoldApplicationCount ?? 0) > 0) {
      timeline.push({ eventType: "track_signal_hold_applied", occurredAt: entry.signalHoldAppliedAt, trackEntry: entry, details: { signalHoldApplicationCount: entry.signalHoldApplicationCount ?? 1 } });
    }
    if (entry.signalHoldFulfilledAt && entry.signalHoldStatus === "fulfilled") {
      timeline.push({ eventType: "track_signal_hold_fulfilled", occurredAt: entry.signalHoldFulfilledAt, trackEntry: entry });
    }
    if (entry.signalHoldExpiredAt && entry.signalHoldStatus === "expired") {
      timeline.push({ eventType: "track_signal_hold_expired", occurredAt: entry.signalHoldExpiredAt, trackEntry: entry });
    }
    if (entry.completedAt) {
      timeline.push({
        eventType: entry.playbackOutcome === "skipped" ? "track_skipped" : "track_finished",
        occurredAt: entry.completedAt,
        trackEntry: entry,
      });
    }
    if (entry.removedAt) {
      timeline.push({ eventType: "track_removed", occurredAt: entry.removedAt, trackEntry: entry });
    }
  }

  for (const event of normalizeQueuePlaybackDiagnostics(session.playbackDiagnostics).events) {
    const located = tracks.get(event.trackId);
    if (!located) continue;
    if (event.eventType === "loaded") {
      timeline.push({ eventType: "track_loaded", occurredAt: event.observedAt, trackEntry: located.entry });
    } else if (event.eventType === "play") {
      timeline.push({ eventType: "track_play_started", occurredAt: event.observedAt, trackEntry: located.entry, details: { playbackProvider: event.provider, playbackPositionSeconds: event.currentTimeSeconds, playbackDurationSeconds: event.durationSeconds, playbackErrorCode: event.errorCode } });
    } else if (event.eventType === "pause") {
      timeline.push({ eventType: "track_paused", occurredAt: event.observedAt, trackEntry: located.entry, details: { playbackProvider: event.provider, playbackPositionSeconds: event.currentTimeSeconds, playbackDurationSeconds: event.durationSeconds, playbackErrorCode: event.errorCode } });
    } else if (event.eventType === "stall") {
      timeline.push({ eventType: "track_stalled", occurredAt: event.observedAt, trackEntry: located.entry, details: { playbackProvider: event.provider, playbackPositionSeconds: event.currentTimeSeconds, playbackDurationSeconds: event.durationSeconds, playbackErrorCode: event.errorCode } });
    } else if (event.eventType === "resume") {
      timeline.push({ eventType: "track_resumed", occurredAt: event.observedAt, trackEntry: located.entry, details: { playbackProvider: event.provider, playbackPositionSeconds: event.currentTimeSeconds, playbackDurationSeconds: event.durationSeconds, playbackErrorCode: event.errorCode } });
    } else if (event.eventType === "error") {
      timeline.push({ eventType: "track_playback_error", occurredAt: event.observedAt, trackEntry: located.entry, details: { playbackProvider: event.provider, playbackPositionSeconds: event.currentTimeSeconds, playbackDurationSeconds: event.durationSeconds, playbackErrorCode: event.errorCode } });
    } else if (event.eventType === "return") {
      timeline.push({ eventType: "track_returned", occurredAt: event.observedAt, trackEntry: located.entry });
    }
  }

  if (session.broadcastStartedAt) {
    timeline.push({ eventType: "broadcast_started", occurredAt: session.broadcastStartedAt });
  }
  if (session.sponsorBreakStartedAt) {
    timeline.push({ eventType: "sponsor_break_started", occurredAt: session.sponsorBreakStartedAt });
  }
  if (session.sponsorBreakCompletedAt && (session.sponsorBreakStatus === "completed" || session.sponsorBreakStatus === "skipped")) {
    timeline.push({
      eventType: session.sponsorBreakStatus === "skipped" ? "sponsor_break_skipped" : "sponsor_break_completed",
      occurredAt: session.sponsorBreakCompletedAt,
    });
  }
  if (session.status === "archived") {
    timeline.push({ eventType: "session_archived", occurredAt: session.updatedAt });
  }

  timeline.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)
    || left.eventType.localeCompare(right.eventType)
    || (left.trackEntry?.id ?? "").localeCompare(right.trackEntry?.id ?? ""));

  let events: QueueShowLogEvent[] = [];
  for (const item of timeline) {
    const submissionOrder = item.eventType === "track_submitted"
      ? nextQueueShowLogOrder(events, "submissionOrder")
      : undefined;
    const existingPlayedOrder = item.trackEntry
      ? queueShowLogTrackOrder(events, item.trackEntry.id, "playedOrder")
      : null;
    const playedOrder = item.trackEntry
      && (item.eventType === "track_play_started" || item.eventType === "track_finished" || item.eventType === "track_skipped")
      && !existingPlayedOrder
      ? nextQueueShowLogOrder(events, "playedOrder")
      : undefined;
    events = appendQueueShowLogEvent(events, { ...item, submissionOrder, playedOrder });
  }
  return events;
}

function queueShowLogMutationEvents(
  previous: QueueSession,
  next: QueueSession,
  existing: QueueShowLogEvent[],
): QueueShowLogEvent[] {
  const previousTracks = queueShowLogTracks(previous);
  const nextTracks = queueShowLogTracks(next);
  let events = normalizeQueueShowLog(existing);
  const occurredAt = next.updatedAt || new Date().toISOString();

  if (previous.queueOpen !== next.queueOpen) {
    events = appendQueueShowLogEvent(events, {
      eventType: next.queueOpen ? "submissions_opened" : "submissions_closed",
      occurredAt,
    });
  }
  if (!previous.broadcastStartedAt && next.broadcastStartedAt) {
    events = appendQueueShowLogEvent(events, {
      eventType: "broadcast_started",
      occurredAt: next.broadcastStartedAt,
    });
  }
  if (previous.sponsorBreakStatus !== next.sponsorBreakStatus) {
    const sponsorEventType = next.sponsorBreakStatus === "running"
      ? "sponsor_break_started"
      : next.sponsorBreakStatus === "completed"
        ? "sponsor_break_completed"
        : next.sponsorBreakStatus === "skipped"
          ? "sponsor_break_skipped"
          : previous.sponsorBreakStatus === "running" || previous.sponsorBreakStatus === "completed" || previous.sponsorBreakStatus === "skipped"
            ? "sponsor_break_reset"
            : null;
    if (sponsorEventType) {
      events = appendQueueShowLogEvent(events, {
        eventType: sponsorEventType,
        occurredAt: next.sponsorBreakStatus === "running"
          ? next.sponsorBreakStartedAt ?? occurredAt
          : next.sponsorBreakCompletedAt ?? occurredAt,
      });
    }
  }

  for (const [trackId, located] of nextTracks) {
    const before = previousTracks.get(trackId);
    if (!before) {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_submitted",
        occurredAt: located.entry.createdAt,
        trackEntry: located.entry,
        submissionOrder: nextQueueShowLogOrder(events, "submissionOrder"),
      });
    }
    if (before?.location !== "loaded" && located.location === "loaded") {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_loaded",
        occurredAt: located.entry.playedAt ?? occurredAt,
        trackEntry: located.entry,
      });
    }
    if ((before?.location === "loaded" || before?.location === "next") && located.location === "queued") {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_returned",
        occurredAt,
        trackEntry: located.entry,
      });
    }
    if ((before?.location === "completed" || before?.location === "removed")
      && located.location !== "completed" && located.location !== "removed") {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_restored",
        occurredAt: located.entry.restoredAt ?? occurredAt,
        trackEntry: located.entry,
      });
    }
    if (before?.location !== "completed" && located.location === "completed") {
      const existingPlayedOrder = queueShowLogTrackOrder(events, trackId, "playedOrder");
      events = appendQueueShowLogEvent(events, {
        eventType: located.entry.playbackOutcome === "skipped" ? "track_skipped" : "track_finished",
        occurredAt: located.entry.completedAt ?? occurredAt,
        trackEntry: located.entry,
        playedOrder: existingPlayedOrder ?? nextQueueShowLogOrder(events, "playedOrder"),
      });
    }
    if (before?.location !== "removed" && located.location === "removed") {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_removed",
        occurredAt: located.entry.removedAt ?? occurredAt,
        trackEntry: located.entry,
      });
    }
    const previousSignalHoldStatus = normalizeSignalHoldStatus(before?.entry.signalHoldStatus);
    const nextSignalHoldStatus = normalizeSignalHoldStatus(located.entry.signalHoldStatus);
    if (previousSignalHoldStatus !== "active" && nextSignalHoldStatus === "active") {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_signal_hold_activated",
        occurredAt: located.entry.signalHoldPaidAt ?? occurredAt,
        trackEntry: located.entry,
      });
    }
    if (previousSignalHoldStatus !== "paid_needs_attention" && nextSignalHoldStatus === "paid_needs_attention") {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_signal_hold_needs_attention",
        occurredAt: located.entry.signalHoldPaidAt ?? occurredAt,
        trackEntry: located.entry,
      });
    }
    const previousApplicationCount = Math.max(0, Math.floor(before?.entry.signalHoldApplicationCount ?? 0));
    const nextApplicationCount = Math.max(0, Math.floor(located.entry.signalHoldApplicationCount ?? 0));
    if (nextApplicationCount > previousApplicationCount) {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_signal_hold_applied",
        occurredAt: located.entry.signalHoldAppliedAt ?? occurredAt,
        trackEntry: located.entry,
        details: {
          signalHoldPreviousLane: before?.entry.lane ?? "regular",
          signalHoldApplicationCount: nextApplicationCount,
        },
      });
    }
    if (previousSignalHoldStatus !== "fulfilled" && nextSignalHoldStatus === "fulfilled") {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_signal_hold_fulfilled",
        occurredAt: located.entry.signalHoldFulfilledAt ?? occurredAt,
        trackEntry: located.entry,
      });
    }
    if (previousSignalHoldStatus !== "expired" && nextSignalHoldStatus === "expired") {
      events = appendQueueShowLogEvent(events, {
        eventType: "track_signal_hold_expired",
        occurredAt: located.entry.signalHoldExpiredAt ?? occurredAt,
        trackEntry: located.entry,
      });
    }
  }

  const previousPlaybackSequence = normalizeQueuePlaybackDiagnostics(previous.playbackDiagnostics)
    .events.reduce((highest, event) => Math.max(highest, event.sequence), 0);
  for (const event of normalizeQueuePlaybackDiagnostics(next.playbackDiagnostics).events) {
    if (event.sequence <= previousPlaybackSequence) continue;
    const showLogEventType = event.eventType === "play"
      ? "track_play_started"
      : event.eventType === "pause"
        ? "track_paused"
        : event.eventType === "stall"
          ? "track_stalled"
          : event.eventType === "resume"
            ? "track_resumed"
            : event.eventType === "error"
              ? "track_playback_error"
              : null;
    if (!showLogEventType) continue;
    const located = nextTracks.get(event.trackId) ?? previousTracks.get(event.trackId);
    if (!located) continue;
    const existingPlayedOrder = queueShowLogTrackOrder(events, event.trackId, "playedOrder");
    events = appendQueueShowLogEvent(events, {
      eventType: showLogEventType,
      occurredAt: event.observedAt,
      trackEntry: located.entry,
      playedOrder: event.eventType === "play"
        ? existingPlayedOrder ?? nextQueueShowLogOrder(events, "playedOrder")
        : existingPlayedOrder,
      details: {
        playbackProvider: event.provider,
        playbackPositionSeconds: event.currentTimeSeconds,
        playbackDurationSeconds: event.durationSeconds,
        playbackErrorCode: event.errorCode,
      },
    });
  }

  if (previous.status !== "archived" && next.status === "archived") {
    events = appendQueueShowLogEvent(events, { eventType: "session_archived", occurredAt });
  }
  return events;
}

function queueStoreWithShowLog(previous: QueueStore, next: QueueStore): QueueStore {
  const previousSessions = new Map(previous.sessions.map((session) => [session.sessionId, session]));
  return {
    ...next,
    sessions: next.sessions.map((session) => {
      const before = previousSessions.get(session.sessionId);
      if (!before) return { ...session, showLog: initialQueueShowLog(session) };
      const existing = normalizeQueueShowLog(before.showLog);
      const requested = normalizeQueueShowLog(session.showLog);
      const requestedHasNewEvents = (requested.at(-1)?.sequence ?? 0) > (existing.at(-1)?.sequence ?? 0);
      const requestedBySequence = new Map(requested.map((event) => [event.sequence, JSON.stringify(event)]));
      const firstRequestedSequence = requested.at(0)?.sequence ?? Number.MAX_SAFE_INTEGER;
      const overlappingExisting = existing.filter((event) => event.sequence >= firstRequestedSequence);
      const requestedPreservesExisting = existing.length === 0 || (overlappingExisting.length > 0 && overlappingExisting.every((event) => {
        if (event.sequence < firstRequestedSequence) return true;
        return requestedBySequence.get(event.sequence) === JSON.stringify(event);
      }));
      const seeded = requestedHasNewEvents && requestedPreservesExisting
        ? requested
        : existing.length > 0
          ? existing
          : initialQueueShowLog(before);
      return {
        ...session,
        showLog: queueShowLogMutationEvents(before, session, seeded),
      };
    }),
  };
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
  const publicGiftAttribution = normalized.priorityGiftAttribution
    && (normalized.priorityUpgradeStatus === "paid" || normalized.priorityUpgradeStatus === "paid_needs_attention")
    ? {
      version: normalized.priorityGiftAttribution.version,
      supporterName: normalized.priorityGiftAttribution.supporterName,
      recipientName: normalized.priorityGiftAttribution.recipientName,
    }
    : null;
  return {
    id: normalized.id,
    submittedArtistName: normalized.submittedArtistName ?? normalized.artist,
    submittedSongTitle: normalized.submittedSongTitle ?? normalized.title,
    collaboratorNames: normalized.collaboratorNames ?? null,
    detectedArtistName: isUpload ? null : normalized.detectedArtistName ?? null,
    detectedSongTitle: isUpload ? null : normalized.detectedSongTitle ?? null,
    providerTitle: isUpload ? null : normalized.providerTitle ?? null,
    sourceType: normalized.sourceType ?? "other",
    lane: normalized.lane ?? "regular",
    durationLabel: getTrackDurationLabel(normalized),
    detectedDurationSeconds: normalized.detectedDurationSeconds ?? null,
    estimatedDurationSeconds: normalized.estimatedDurationSeconds,
    durationIsEstimate: normalized.durationIsEstimate ?? true,
    durationSource: normalized.durationSource,
    sourceArtworkUrl: publicArtworkUrlForTrack(normalized),
    publicSourceUrl: publicSourceUrlForTrack(normalized),
    tiktokHandle: normalized.tiktokHandle ?? null,
    priorityUpgradeRequested: normalized.priorityUpgradeRequested === true,
    priorityUpgradeStatus: normalized.priorityUpgradeStatus ?? "none",
    priorityGiftAttribution: publicGiftAttribution,
    isSimulation: isSimulationTrack(normalized),
  };
}

function publicSubmitterStatus(session: QueueSession, identity?: { submitterToken?: string | null; tiktokHandle?: string | null; contactEmail?: string | null; artist?: string | null }): QueuePublicSnapshot["submitterStatus"] {
  const token = identity?.submitterToken?.trim();
  const tikTok = identity?.tiktokHandle ? normalizeTikTokHandle(identity.tiktokHandle) : "";
  const email = normalizeEmail(identity?.contactEmail);
  const artist = normalizeIdentity(identity?.artist);
  if (!token && !tikTok && !email && !artist) return null;

  const entries = submissionCheckEntries(session);
  const identityKeys = new Set(submissionIdentityKeys({ submitterToken: token, normalizedTikTokHandle: tikTok, contactEmail: email, artist }));
  const directMatching = entries.filter((entry) => submissionIdentityKeys(entry).some((key) => identityKeys.has(key)));
  const connectedMatching = connectedSubmissionEntries(entries, { submitterToken: token, normalizedTikTokHandle: tikTok, contactEmail: email, artist });
  // The cap follows all linked identities, while the public track list and
  // cooldown expose only direct matches so linked track details are not
  // disclosed through the public snapshot.
  const latest = directMatching.reduce((time, entry) => Math.max(time, new Date(entry.createdAt).getTime()), 0);
  const cooldownSeconds = normalizeSubmissionCooldownSeconds(session.submissionCooldownSeconds);
  const cooldownRemainingSeconds = latest && cooldownSeconds > 0 ? Math.max(0, cooldownSeconds - Math.floor((Date.now() - latest) / 1000)) : 0;
  const limit = normalizeTrackLimitPerArtist(session.trackLimitPerArtist);
  return {
    used: connectedMatching.length,
    limit,
    remaining: Math.max(0, limit - connectedMatching.length),
    cooldownRemainingSeconds,
    submitted: directMatching.slice(0, limit).map((entry) => {
      const { id, submittedArtistName, submittedSongTitle, collaboratorNames, sourceType, lane, durationLabel, detectedDurationSeconds, estimatedDurationSeconds, durationIsEstimate, durationSource, priorityUpgradeStatus } = toPublicQueueTrack(entry);
      const ownsSignalHoldDetails = Boolean(token && entry.submitterToken?.trim() && token === entry.submitterToken.trim());
      return {
        id,
        submittedArtistName,
        submittedSongTitle,
        collaboratorNames,
        sourceType,
        lane,
        durationLabel,
        detectedDurationSeconds,
        estimatedDurationSeconds,
        durationIsEstimate,
        durationSource,
        priorityUpgradeStatus,
        ...(ownsSignalHoldDetails ? {
          signalHoldStatus: normalizeSignalHoldStatus(entry.signalHoldStatus) ?? "none",
          signalHoldApplicationCount: Math.max(0, Math.floor(entry.signalHoldApplicationCount ?? 0)),
        } : {}),
      };
    }),
  };
}

export const QUEUE_PUBLIC_HISTORY_COVERAGE_STARTED_AT = "2026-08-24" as const;

type QueuePublicStatsStage = "waiting" | "up_next" | "now_playing" | "terminal";

interface QueuePublicStatsRecord {
  entry: QueueEntry;
  outcome: QueuePublicHistoryOutcome;
  stage: QueuePublicStatsStage;
  wheelChosen: boolean;
}

interface QueuePublicStatsSession {
  session: QueueSession;
  records: QueuePublicStatsRecord[];
  events: QueuePublicHistoryEvent[];
}

const PUBLIC_HISTORY_EVENT_TYPES = new Set<QueuePublicHistoryEventType>([
  "submissions_opened",
  "submissions_closed",
  "broadcast_started",
  "track_submitted",
  "track_loaded",
  "track_play_started",
  "track_finished",
  "track_removed",
  "track_returned",
  "track_restored",
  "wheel_launched",
  "wheel_spun",
  "wheel_confirmed",
  "sponsor_break_started",
  "sponsor_break_completed",
  "session_archived",
]);

function publicStatsOutcomeForEntry(entry: QueueEntry, location: "active" | "completed" | "removed"): QueuePublicHistoryOutcome {
  if (location === "removed" || entry.status === "removed" || entry.playbackOutcome === "removed") return "removed";
  if (entry.playbackOutcome === "skipped") return "skipped";
  if (entry.playbackOutcome === "finished") return "finished";
  if (location === "completed" || entry.status === "completed" || entry.status === "played") return "unknown";
  return "active";
}

function publicStatsRecordsForSession(session: QueueSession, includeSimulationTracks = false): QueuePublicStatsRecord[] {
  const wheelChosenIds = new Set(
    normalizeQueueShowLog(session.showLog)
      .filter((event) => event.eventType === "track_signal_hold_applied" && event.details?.signalHoldPreviousLane === "wheel" && event.track?.trackId)
      .map((event) => event.track!.trackId),
  );
  const locations: Array<{
    entry: QueueEntry;
    location: "active" | "completed" | "removed";
    stage: QueuePublicStatsStage;
    precedence: number;
  }> = [
    ...(session.queue ?? []).map((entry) => ({ entry, location: "active" as const, stage: "waiting" as const, precedence: 1 })),
    ...(session.nextInLineTrack ? [{ entry: session.nextInLineTrack, location: "active" as const, stage: "up_next" as const, precedence: 2 }] : []),
    ...(session.loadedTrack ? [{ entry: session.loadedTrack, location: "active" as const, stage: "now_playing" as const, precedence: 3 }] : []),
    ...(session.completed ?? []).map((entry) => ({ entry, location: "completed" as const, stage: "terminal" as const, precedence: 4 })),
    ...(session.removed ?? []).map((entry) => ({ entry, location: "removed" as const, stage: "terminal" as const, precedence: 5 })),
  ];
  const simulationIds = includeSimulationTracks
    ? new Set<string>()
    : new Set(locations.filter(({ entry }) => isSimulationTrack(entry)).map(({ entry }) => entry.id));
  const unique = new Map<string, QueuePublicStatsRecord & { precedence: number }>();
  for (const { entry, location, stage, precedence } of locations) {
    if (!entry?.id || simulationIds.has(entry.id)) continue;
    const existing = unique.get(entry.id);
    if (existing && existing.precedence > precedence) continue;
    unique.set(entry.id, {
      entry,
      outcome: publicStatsOutcomeForEntry(entry, location),
      stage,
      wheelChosen: wheelChosenIds.has(entry.id) || entry.lane === "wheel",
      precedence,
    });
  }
  return [...unique.values()].map(({ entry, outcome, stage, wheelChosen }) => ({ entry, outcome, stage, wheelChosen }));
}

function publicStatsCounts(records: QueuePublicStatsRecord[]): QueuePublicStatsCounts {
  const countOutcome = (outcome: QueuePublicHistoryOutcome) => records.filter((record) => record.outcome === outcome).length;
  const countStage = (stage: QueuePublicStatsStage) => records.filter((record) => record.outcome === "active" && record.stage === stage).length;
  return {
    submittedTrackCount: records.length,
    finishedTrackCount: countOutcome("finished"),
    skippedTrackCount: countOutcome("skipped"),
    removedTrackCount: countOutcome("removed"),
    activeTrackCount: countOutcome("active"),
    waitingTrackCount: countStage("waiting"),
    nowPlayingTrackCount: countStage("now_playing"),
    upNextTrackCount: countStage("up_next"),
    unknownOutcomeTrackCount: countOutcome("unknown"),
    wheelChosenTrackCount: records.filter((record) => record.wheelChosen).length,
  };
}

function publicShowStats(
  session: QueueSession,
  records: QueuePublicStatsRecord[],
  milestones: QueuePublicHistoryEvent[] = [],
): QueuePublicShowStats {
  return {
    sessionId: session.sessionId,
    title: session.title,
    showDate: session.showDate,
    status: session.status,
    broadcastPhase: session.broadcastPhase ?? broadcastPhaseForSession(session),
    submissionsOpen: session.queueOpen === true && session.status !== "archived",
    sourceRevision: Math.max(0, Math.floor(session.provenanceRevision ?? 0)),
    sourceUpdatedAt: session.updatedAt,
    trackRoster: [...records]
      .sort((left, right) => Date.parse(left.entry.createdAt) - Date.parse(right.entry.createdAt))
      .map((record) => publicHistoryTrackForRecord(session, record)),
    milestones,
    ...publicStatsCounts(records),
  };
}

function publicStatsSessionTime(session: QueueSession): number {
  const showDate = Date.parse(`${session.showDate}T00:00:00.000Z`);
  if (Number.isFinite(showDate)) return showDate;
  const createdAt = Date.parse(session.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function publicStatsHandleForEntry(entry: QueueEntry): string {
  return normalizeTikTokHandle(entry.normalizedTikTokHandle ?? entry.tiktokHandle ?? "");
}

function publicHistoryProjectLabel(entry: QueueEntry): string {
  return (entry.submittedArtistName ?? entry.artist).normalize("NFKC").replace(/\s+/g, " ").trim() || "Unknown project";
}

export const normalizeQueueProjectKey = normalizeBroadcastArchiveProjectKey;

function historyEventSequence(session: QueueSession, trackId: string, eventTypes: QueueShowLogEventType[]): number | null {
  const event = normalizeQueueShowLog(session.showLog)
    .filter((item) => item.track?.trackId === trackId && eventTypes.includes(item.eventType))
    .sort((left, right) => right.sequence - left.sequence)[0];
  return event?.sequence ?? null;
}

function publicHistoryTrackForRecord(session: QueueSession, record: QueuePublicStatsRecord): QueuePublicHistoryTrack {
  const outcomeEvents: Partial<Record<QueuePublicHistoryOutcome, QueueShowLogEventType[]>> = {
    finished: ["track_finished"],
    skipped: ["track_skipped"],
    removed: ["track_removed"],
  };
  const resolvedAt = record.outcome === "removed"
    ? record.entry.removedAt ?? null
    : record.outcome === "finished" || record.outcome === "skipped" || record.outcome === "unknown"
      ? record.entry.completedAt ?? record.entry.playedAt ?? null
      : null;
  return {
    sessionId: session.sessionId,
    sessionTitle: session.title,
    showDate: session.showDate,
    trackId: record.entry.id,
    projectLabel: publicHistoryProjectLabel(record.entry),
    projectKey: normalizeQueueProjectKey(publicHistoryProjectLabel(record.entry)),
    title: (record.entry.submittedSongTitle ?? record.entry.title).normalize("NFKC").replace(/\s+/g, " ").trim() || "Untitled track",
    submittedByTikTokHandle: publicStatsHandleForEntry(record.entry),
    collaboratorNames: record.entry.collaboratorNames?.normalize("NFKC").replace(/\s+/g, " ").trim() || null,
    sourceType: record.entry.sourceType ?? "other",
    publicSourceUrl: publicSourceUrlForTrack(record.entry),
    submittedAt: record.entry.createdAt,
    resolvedAt,
    outcome: record.outcome,
    lane: record.entry.lane ?? "regular",
    wheelChosen: record.wheelChosen,
    ...(isSimulationTrack(record.entry) ? { isSimulation: true } : {}),
    submissionEventSequence: historyEventSequence(session, record.entry.id, ["track_submitted"]),
    outcomeEventSequence: outcomeEvents[record.outcome]
      ? historyEventSequence(session, record.entry.id, outcomeEvents[record.outcome]!)
      : null,
  };
}

function publicHistoryEventCopy(eventType: QueuePublicHistoryEventType, track: QueuePublicHistoryEvent["track"]): { headline: string; detail: string } {
  const trackText = track ? `${track.projectLabel} — ${track.title}` : "BARCODE Radio";
  if (eventType === "submissions_opened") return { headline: "Submissions opened", detail: "The intake window is accepting tracks." };
  if (eventType === "submissions_closed") return { headline: "Submissions closed", detail: "The intake window is closed." };
  if (eventType === "broadcast_started") return { headline: "Broadcast started", detail: "The live BARCODE Radio show is underway." };
  if (eventType === "track_submitted") return { headline: "Submission received", detail: trackText };
  if (eventType === "track_loaded") return { headline: "Track loaded", detail: trackText };
  if (eventType === "track_play_started") return { headline: "Now playing", detail: trackText };
  if (eventType === "track_finished") return { headline: "Track finished", detail: trackText };
  if (eventType === "track_removed") return { headline: "Track left the active queue", detail: trackText };
  if (eventType === "track_returned" || eventType === "track_restored") return { headline: "Track returned to the queue", detail: trackText };
  if (eventType === "wheel_launched") return { headline: "Wheel launched", detail: "A 10K Tap Wheel selection is underway." };
  if (eventType === "wheel_spun") return { headline: "Wheel spun", detail: "The Wheel result is being resolved." };
  if (eventType === "wheel_confirmed") return { headline: "Wheel Chosen", detail: track ? trackText : "A Wheel result was confirmed." };
  if (eventType === "sponsor_break_started") return { headline: "Sponsor break started", detail: "The show remains live during the break." };
  if (eventType === "sponsor_break_completed") return { headline: "Sponsor break completed", detail: "The broadcast returned to the queue." };
  return { headline: "Broadcast archived", detail: "The show moved into retained after-show history." };
}

function publicHistoryEventsForSession(session: QueueSession, records: QueuePublicStatsRecord[]): QueuePublicHistoryEvent[] {
  const recordsById = new Map(records.map((record) => [record.entry.id, record]));
  return normalizeQueueShowLog(session.showLog).flatMap((event) => {
    if (!PUBLIC_HISTORY_EVENT_TYPES.has(event.eventType as QueuePublicHistoryEventType)) return [];
    const eventType = event.eventType as QueuePublicHistoryEventType;
    const record = event.track?.trackId ? recordsById.get(event.track.trackId) : null;
    if (event.track?.trackId && !record) return [];
    const track = record ? { projectLabel: publicHistoryProjectLabel(record.entry), title: record.entry.submittedSongTitle ?? record.entry.title } : null;
    const copy = publicHistoryEventCopy(eventType, track);
    return [{
      eventId: `${session.sessionId}:${event.sequence}`,
      sessionId: session.sessionId,
      showDate: session.showDate,
      sequence: event.sequence,
      eventType,
      occurredAt: event.occurredAt,
      headline: copy.headline,
      detail: copy.detail,
      track,
    }];
  });
}

function buildPublicArtistCatalog(sessions: QueuePublicStatsSession[]): QueuePublicProjectHistory[] {
  const groups = new Map<string, Array<{ session: QueueSession; record: QueuePublicStatsRecord }>>();
  for (const { session, records } of sessions) {
    for (const record of records) {
      const projectKey = normalizeQueueProjectKey(publicHistoryProjectLabel(record.entry));
      if (!projectKey) continue;
      groups.set(projectKey, [...(groups.get(projectKey) ?? []), { session, record }]);
    }
  }
  return [...groups.entries()].map(([projectKey, items]) => {
    const sortedItems = [...items].sort((left, right) => Date.parse(right.record.entry.createdAt) - Date.parse(left.record.entry.createdAt));
    const dates = [...new Set(items.map(({ session }) => session.showDate))].sort();
    return {
      projectKey,
      projectLabel: publicHistoryProjectLabel(sortedItems[0].record.entry),
      showCount: dates.length,
      firstShowDate: dates[0],
      latestShowDate: dates.at(-1)!,
      ...publicStatsCounts(items.map(({ record }) => record)),
      tracks: sortedItems.map(({ session, record }) => publicHistoryTrackForRecord(session, record)),
    };
  }).sort((left, right) => left.projectLabel.localeCompare(right.projectLabel));
}

function buildPublicPersonalHistory(
  sessions: QueuePublicStatsSession[],
  current: QueuePublicStatsSession | null,
  submitterToken?: string | null,
): QueuePublicStats["personalHistory"] {
  const token = submitterToken?.trim();
  if (!token) return null;
  const ownedHandles = new Set(
    sessions.flatMap(({ records }) => records)
      .filter(({ entry }) => entry.submitterToken?.trim() === token)
      .map(({ entry }) => publicStatsHandleForEntry(entry))
      .filter(Boolean),
  );
  if (ownedHandles.size === 0) return null;

  const handles: QueuePublicHandleHistory[] = [...ownedHandles].map((tiktokHandle) => {
    const matching = sessions.flatMap(({ session, records }) => records
      .filter(({ entry }) => publicStatsHandleForEntry(entry) === tiktokHandle)
      .map((record) => ({ session, record })));
    const dates = [...new Set(matching.map(({ session }) => session.showDate))].sort();
    const projectGroups = new Map<string, Array<{ session: QueueSession; record: QueuePublicStatsRecord }>>();
    for (const item of matching) {
      const key = normalizeQueueProjectKey(publicHistoryProjectLabel(item.record.entry));
      if (!key) continue;
      projectGroups.set(key, [...(projectGroups.get(key) ?? []), item]);
    }
    const projects: QueuePublicProjectHistory[] = [...projectGroups.entries()].map(([projectKey, items]) => {
      const sortedItems = [...items].sort((left, right) => Date.parse(right.record.entry.createdAt) - Date.parse(left.record.entry.createdAt));
      const projectDates = [...new Set(items.map(({ session }) => session.showDate))].sort();
      return {
        projectKey,
        projectLabel: publicHistoryProjectLabel(sortedItems[0].record.entry),
        showCount: projectDates.length,
        firstShowDate: projectDates[0],
        latestShowDate: projectDates.at(-1)!,
        ...publicStatsCounts(items.map(({ record }) => record)),
        tracks: sortedItems.map(({ session, record }) => publicHistoryTrackForRecord(session, record)),
      };
    }).sort((left, right) => right.latestShowDate.localeCompare(left.latestShowDate) || left.projectLabel.localeCompare(right.projectLabel));
    const currentRecords = current?.records.filter(({ entry }) => publicStatsHandleForEntry(entry) === tiktokHandle) ?? [];
    return {
      tiktokHandle,
      identityStatus: "submitted_handle_not_verified_account" as const,
      profileStatus: "not_verified_profile" as const,
      showCount: dates.length,
      projectCount: projects.length,
      firstShowDate: dates[0],
      latestShowDate: dates.at(-1)!,
      ...publicStatsCounts(matching.map(({ record }) => record)),
      currentShow: currentRecords.length > 0 ? publicStatsCounts(currentRecords) : null,
      projects,
    };
  }).sort((left, right) => right.latestShowDate.localeCompare(left.latestShowDate) || left.tiktokHandle.localeCompare(right.tiktokHandle));

  return {
    access: "confirmed_same_browser_submission",
    identityStatus: "submitted_handle_not_verified_account",
    profileStatus: "not_verified_profile",
    handles,
  };
}

function buildQueueStatsProjection(input: {
  revision: number;
  activeSessionId?: string | null;
  submitterToken?: string | null;
}, selectedSessions: QueueSession[], includeSimulationTracks: boolean): QueuePublicStats {
  const eligibleSessions: QueuePublicStatsSession[] = selectedSessions
    .map((session) => {
      const records = publicStatsRecordsForSession(session, includeSimulationTracks);
      return { session, records, events: publicHistoryEventsForSession(session, records) };
    })
    .sort((left, right) => publicStatsSessionTime(right.session) - publicStatsSessionTime(left.session));
  const archiveSessions = eligibleSessions.filter(({ session }) => session.status === "archived");
  const archivedRecords = archiveSessions.flatMap(({ records }) => records);
  const current = eligibleSessions.find(({ session }) => session.sessionId === input.activeSessionId && session.status !== "archived") ?? null;
  const shows = archiveSessions.map(({ session, records, events }) => publicShowStats(session, records, events));
  const artists = buildPublicArtistCatalog(archiveSessions);
  const sourceRevision = Math.max(0, Math.floor(input.revision));
  const builtAt = eligibleSessions.map(({ session }) => session.updatedAt).filter(Boolean).sort().at(-1) ?? null;
  const digestInput = {
    schemaVersion: "queue_public_history_projection_v1",
    historyCoverageStartedAt: QUEUE_PUBLIC_HISTORY_COVERAGE_STARTED_AT,
    sourceRevision,
    sessions: eligibleSessions.map(({ session, records, events }) => ({
      session: publicShowStats(session, records, events),
      records: records.map((record) => ({
        ...publicHistoryTrackForRecord(session, record),
        tiktokHandle: publicStatsHandleForEntry(record.entry),
        stage: record.stage,
        wheelChosen: record.wheelChosen,
      })),
      events,
    })),
  };
  const sourceDigest = createHash("sha256").update(canonicalJson(digestInput)).digest("hex");
  const recentEvents = archiveSessions.flatMap(({ events }) => events)
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.sequence - left.sequence)
    .slice(0, 16);

  return {
    schemaVersion: "queue_public_history_projection_v1",
    source: "queue_public_history_projection",
    visibility: "public_safe",
    historyCoverageStartedAt: QUEUE_PUBLIC_HISTORY_COVERAGE_STARTED_AT,
    builtAt,
    sourceRevision,
    sourceDigest,
    memoryDefault: "do_not_store",
    sourceFileDefault: "review_evidence_only",
    publicDossierDefault: "not_automatic",
    overview: {
      showCount: archiveSessions.length,
      artistCount: artists.length,
      submitterHandleCount: new Set(archivedRecords.map(({ entry }) => publicStatsHandleForEntry(entry)).filter(Boolean)).size,
      publicTrackLinkCount: archivedRecords.filter(({ entry }) => Boolean(publicSourceUrlForTrack(entry))).length,
      ...publicStatsCounts(archivedRecords),
    },
    currentShow: current ? publicShowStats(current.session, current.records, current.events) : null,
    latestShow: shows[0] ?? null,
    shows,
    artists,
    recentEvents,
    personalHistory: buildPublicPersonalHistory(eligibleSessions, current, input.submitterToken),
  };
}

export function buildQueuePublicStats(input: {
  revision: number;
  activeSessionId?: string | null;
  sessions: QueueSession[];
  submitterToken?: string | null;
}): QueuePublicStats {
  const sessions = input.sessions
    .map((session) => normalizeSession(session))
    .filter((session) => session.purpose === "live_broadcast" && session.showDate >= QUEUE_PUBLIC_HISTORY_COVERAGE_STARTED_AT);
  return buildQueueStatsProjection(input, sessions, false);
}

export function buildQueueAdminPreviewStats(input: {
  revision: number;
  selectedSession: QueueSession;
  submitterToken?: string | null;
}): QueuePublicStats {
  const selectedSession = normalizeSession(input.selectedSession);
  return buildQueueStatsProjection({
    revision: input.revision,
    activeSessionId: selectedSession.status === "archived" ? null : selectedSession.sessionId,
    submitterToken: input.submitterToken,
  }, [selectedSession], true);
}

export async function getPublicQueueStats(submitterToken?: string | null): Promise<QueuePublicStats> {
  const store = await readStore();
  return buildQueuePublicStats({
    revision: store.revision,
    activeSessionId: store.activeSessionId,
    sessions: store.sessions.map((session) => normalizeSession(session)),
    submitterToken,
  });
}

export interface QueueAdminPreviewReadback {
  schemaVersion: "queue_admin_broadcast_preview_readback_v1";
  readAuthority: "queue_store_fresh_read";
  visibility: "admin_private_preview";
  readAt: string;
  storeRevision: number;
  sessionId: string;
  sessionPurpose: QueueSessionPurpose;
  sessionStatus: QueueSessionStatus;
  sessionProvenanceRevision: number;
  sourceUpdatedAt: string;
  sourceDigest: string;
  savedTrackCount: number;
  activeTrackCount: number;
  completedTrackCount: number;
  removedTrackCount: number;
  simulationTrackCount: number;
  showLogEventCount: number;
}

function queueSessionEntries(session: QueueSession): QueueEntry[] {
  const unique = new Map<string, QueueEntry>();
  for (const entry of [
    ...session.queue,
    ...(session.nextInLineTrack ? [session.nextInLineTrack] : []),
    ...(session.loadedTrack ? [session.loadedTrack] : []),
    ...session.completed,
    ...session.removed,
    ...session.spotlight,
  ]) {
    if (entry?.id) unique.set(entry.id, entry);
  }
  return [...unique.values()];
}

function activeQueueSessionEntries(session: QueueSession): QueueEntry[] {
  const unique = new Map<string, QueueEntry>();
  for (const entry of [
    ...session.queue,
    ...(session.nextInLineTrack ? [session.nextInLineTrack] : []),
    ...(session.loadedTrack ? [session.loadedTrack] : []),
  ]) {
    if (entry?.id) unique.set(entry.id, entry);
  }
  return [...unique.values()];
}

export async function getQueueAdminPreviewStats(sessionId?: string | null, submitterToken?: string | null): Promise<QueuePublicStats> {
  const store = await readStore();
  const selected = findSession(store, sessionId?.trim() || undefined);
  if (!selected) throw new Error("Queue session not found.");
  return buildQueueAdminPreviewStats({ revision: store.revision, selectedSession: normalizeSession(selected), submitterToken });
}

export async function getQueueAdminPreviewReadback(sessionId?: string | null): Promise<QueueAdminPreviewReadback> {
  const store = await readStore();
  const selected = findSession(store, sessionId?.trim() || undefined);
  if (!selected) throw new Error("Queue session not found.");
  const session = normalizeSession(selected);
  const entries = queueSessionEntries(session);
  const stats = buildQueueAdminPreviewStats({ revision: store.revision, selectedSession: session });
  return {
    schemaVersion: "queue_admin_broadcast_preview_readback_v1",
    readAuthority: "queue_store_fresh_read",
    visibility: "admin_private_preview",
    readAt: new Date().toISOString(),
    storeRevision: store.revision,
    sessionId: session.sessionId,
    sessionPurpose: session.purpose,
    sessionStatus: session.status,
    sessionProvenanceRevision: session.provenanceRevision,
    sourceUpdatedAt: session.updatedAt,
    sourceDigest: stats.sourceDigest,
    savedTrackCount: entries.length,
    activeTrackCount: activeQueueSessionEntries(session).length,
    completedTrackCount: session.completed.filter((entry) => !session.removed.some((removed) => removed.id === entry.id)).length,
    removedTrackCount: session.removed.length,
    simulationTrackCount: entries.filter((entry) => isSimulationTrack(entry)).length,
    showLogEventCount: normalizeQueueShowLog(session.showLog).length,
  };
}

export async function getPublicQueueSnapshot(sessionId?: string, identity?: { submitterToken?: string | null; tiktokHandle?: string | null; contactEmail?: string | null; artist?: string | null }): Promise<QueuePublicSnapshot> {
  const store = await readStore();
  const found = findSession(store, sessionId) ?? (sessionId ? findSession(store) : null);
  if (!found) {
    return {
      revision: store.revision,
      sessionActive: false,
      session: null,
      status: emptyQueuePublicStatus(),
      queue: [],
      completed: [],
      nowPlaying: null,
      upNext: null,
      submitterStatus: null,
    };
  }
  const session = normalizeSession(found);
  if (session.status !== "archived") {
    applyPreShowTimer(session);
    applyCommercialBreakTimer(session);
    pullNextInLine(session);
  }
  const normalized = normalizeSession(session);
  if (normalized.status === "archived") {
    const publicCompletedEntries = normalized.completed.filter((entry) => !isSimulationTrack(entry));
    const publicRemovedEntries = normalized.removed.filter((entry) => !isSimulationTrack(entry));
    const publicSpotlightEntries = normalized.spotlight.filter((entry) => !isSimulationTrack(entry));
    const publicSession = summarizeSession(normalized);
    const archivedPublicSession: QueueSessionSummary = {
      ...publicSession,
      queueOpen: false,
      showStarted: false,
      preShowEndsAt: null,
      activeCount: 0,
      nextInLineTrackId: null,
      nextInLineHoldTrackId: null,
      loadedTrackId: null,
      completedCount: publicCompletedEntries.length,
      removedCount: publicRemovedEntries.length,
      spotlightCount: publicSpotlightEntries.length,
      estimatedActiveRuntimeSeconds: 0,
      completedRuntimeSeconds: publicCompletedEntries.reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0),
      wheelSpinsOwed: 0,
      priorityUpgradesEnabled: false,
      priorityUpgradePaymentsEnabled: false,
      signalHoldEnabled: false,
      signalHoldPaymentsEnabled: false,
    };

    return {
      revision: store.revision,
      sessionActive: false,
      session: archivedPublicSession,
      status: {
        isOpen: false,
        activeCount: 0,
        acceptedCount: archivedPublicSession.acceptedCount ?? 0,
        estimatedRuntimeSeconds: 0,
        capacity: normalized.publicStatus.capacity,
        isFull: false,
        pressure: "low",
        closureReason: "archived",
      },
      queue: [],
      completed: publicCompletedEntries.slice(0, 10).map(toPublicQueueTrack),
      nowPlaying: null,
      upNext: null,
      submitterStatus: null,
    };
  }
  return { revision: store.revision, sessionActive: normalized.sessionId === store.activeSessionId, session: summarizeSession(normalized), status: normalized.publicStatus, queue: normalized.queue.map(toPublicQueueTrack), completed: normalized.completed.slice(0, 10).map(toPublicQueueTrack), nowPlaying: normalized.loadedTrack ? toPublicQueueTrack(normalized.loadedTrack) : null, upNext: normalized.nextInLineTrack ? toPublicQueueTrack(normalized.nextInLineTrack) : null, submitterStatus: publicSubmitterStatus(normalized, identity) };
}

function isPublicSimulationTrack(track: QueuePublicTrack | null | undefined): boolean {
  return track?.isSimulation === true;
}

export function sanitizeQueueSnapshotForPublic(snapshot: QueuePublicSnapshot): QueuePublicSnapshot {
  const session = snapshot.session;
  if (!session) return { ...snapshot, suppressPublicLiveStatus: false };
  const active = session.status !== "archived" && session.broadcastPhase !== "ended";
  if (session.purpose !== "live_broadcast") {
    return {
      revision: snapshot.revision,
      sessionActive: false,
      suppressPublicLiveStatus: active,
      session: null,
      status: {
        isOpen: false,
        activeCount: 0,
        acceptedCount: 0,
        estimatedRuntimeSeconds: 0,
        capacity: snapshot.status.capacity,
        isFull: false,
        pressure: "low",
      },
      queue: [],
      completed: [],
      nowPlaying: null,
      upNext: null,
      submitterStatus: null,
      playbackTiming: null,
      wheelTiming: null,
    };
  }

  const queue = snapshot.queue.filter((track) => !isPublicSimulationTrack(track));
  const completed = snapshot.completed.filter((track) => !isPublicSimulationTrack(track));
  const nowPlaying = isPublicSimulationTrack(snapshot.nowPlaying) ? null : snapshot.nowPlaying ?? null;
  const upNext = isPublicSimulationTrack(snapshot.upNext) ? null : snapshot.upNext ?? null;
  const submitterStatus = snapshot.submitterStatus
    ? { ...snapshot.submitterStatus, submitted: snapshot.submitterStatus.submitted.filter((track) => !isPublicSimulationTrack(track)) }
    : snapshot.submitterStatus ?? null;
  return {
    ...snapshot,
    suppressPublicLiveStatus: false,
    session: {
      ...session,
      nextInLineTrackId: upNext?.id ?? null,
      loadedTrackId: nowPlaying?.id ?? null,
    },
    queue,
    completed,
    nowPlaying,
    upNext,
    submitterStatus,
    playbackTiming: nowPlaying ? snapshot.playbackTiming ?? null : null,
  };
}

async function requestPriorityUpgradePlaceholderMutation(id: string): Promise<QueuePublicTrack | null> {
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

export async function requestPriorityUpgradePlaceholder(id: string): Promise<QueuePublicTrack | null> {
  return withQueueMutation(() => requestPriorityUpgradePlaceholderMutation(id));
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
  checkoutSessionId?: string;
  giftAttribution?: PriorityGiftAttribution | null;
}

function normalizePriorityLegalAcceptance(input?: PriorityLegalAcceptanceInput): QueueEntry["priorityLegalAcceptance"] {
  if (!input || input.acceptedPriorityTerms !== true || input.priorityTermsVersion !== PRIORITY_TERMS_VERSION || input.priorityDisclosureText !== PRIORITY_DISCLOSURE_TEXT) {
    throw new Error("Priority Signal checkout requires acknowledgement of the Priority Signal disclosure.");
  }
  return { acceptedAt: new Date().toISOString(), priorityTermsVersion: PRIORITY_TERMS_VERSION, priorityDisclosureText: PRIORITY_DISCLOSURE_TEXT, source: "priority_checkout" };
}

export function createPriorityGiftAttribution(
  input: PriorityGiftAttributionInput,
  recipientName: string,
  capturedAt = new Date().toISOString(),
): PriorityGiftAttribution {
  if (input.attributionVersion !== PRIORITY_GIFT_ATTRIBUTION_VERSION || input.attributionDisclosureText !== PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT) {
    throw new Error("Gifted Priority attribution disclosure mismatch. Refresh the queue and try again.");
  }
  return {
    version: PRIORITY_GIFT_ATTRIBUTION_VERSION,
    supporterName: normalizePriorityGiftDisplayName(input.supporterName, PRIORITY_GIFT_ANONYMOUS_NAME),
    recipientName: normalizePriorityGiftDisplayName(recipientName, "Unknown artist"),
    capturedAt,
  };
}

export async function requestPriorityCheckout(trackId: string, queueSessionId: string, priorityAcceptance?: PriorityLegalAcceptanceInput): Promise<PriorityCheckoutRequestResult> {
  normalizePriorityLegalAcceptance(priorityAcceptance);
  const store = await readStore();
  const session = getSession(store, queueSessionId);
  const priorityWindowOpen = session.queueOpen || session.submissionClosureReason === "capacity";
  if (session.sessionId !== store.activeSessionId || session.status !== "open" || !priorityWindowOpen) throw new Error("Priority Signal upgrades are available only while this broadcast session is active.");
  if (!session.priorityUpgradesEnabled || !session.priorityUpgradePaymentsEnabled) throw new Error("Priority Signal upgrades are unavailable for this broadcast.");
  const amountCents = normalizePriceCents(session.priorityUpgradePriceCents);
  if (amountCents <= 0) throw new Error("Priority Signal upgrade price is not configured yet.");
  const index = session.queue.findIndex((entry) => entry.id === trackId);
  if (index < 0) throw new Error("Priority Signal Upgrade is not available for this track.");
  const track = normalizeEntry(session.queue[index]);
  if (track.status !== "queued" || (track.lane !== "regular" && track.lane !== "wheel") || track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "paid_needs_attention") throw new Error("Priority Signal Upgrade is not available for this track.");
  return { session: summarizeSession(session), track, amountCents, currency: normalizeCurrency(session.priorityUpgradeCurrency), label: session.priorityUpgradeLabel || DEFAULT_PRIORITY_UPGRADE_LABEL };
}

type PriorityCheckoutPendingMetadata = { provider?: string; checkoutSessionId?: string; checkoutUrl?: string; checkoutCreatedAt?: string | null; checkoutExpiresAt?: string | null; checkoutOwnerTokenHash?: string | null; priorityAcceptance?: PriorityLegalAcceptanceInput; priorityGiftAttribution?: PriorityGiftAttribution | null };

async function markPriorityUpgradeCheckoutPendingMutation(trackId: string, queueSessionId: string, metadata: PriorityCheckoutPendingMetadata = {}): Promise<QueuePublicTrack | null> {
  const store = await readStore();
  const session = getSession(store, queueSessionId);
  if (session.sessionId !== store.activeSessionId || session.status === "archived") return null;
  const now = new Date().toISOString();
  const priorityLegalAcceptance = metadata.priorityAcceptance ? normalizePriorityLegalAcceptance(metadata.priorityAcceptance) : null;
  const priorityGiftAttribution = metadata.priorityGiftAttribution === undefined
    ? undefined
    : normalizePriorityGiftAttribution(metadata.priorityGiftAttribution, metadata.checkoutCreatedAt ?? now);
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
    priorityUpgradeCheckoutOwnerTokenHash: metadata.checkoutOwnerTokenHash ?? entry.priorityUpgradeCheckoutOwnerTokenHash ?? null,
    priorityLegalAcceptance: priorityLegalAcceptance ?? entry.priorityLegalAcceptance ?? null,
    priorityGiftAttribution: priorityGiftAttribution === undefined ? entry.priorityGiftAttribution ?? null : priorityGiftAttribution,
  });
  const index = session.queue.findIndex((entry) => entry.id === trackId);
  if (index < 0) return null;
  session.queue[index] = update(session.queue[index]);
  await writeStore(replaceSession(store, session));
  return toPublicQueueTrack(session.queue[index]);
}

export async function markPriorityUpgradeCheckoutPending(trackId: string, queueSessionId: string, metadata: PriorityCheckoutPendingMetadata = {}): Promise<QueuePublicTrack | null> {
  return withQueueMutation(() => markPriorityUpgradeCheckoutPendingMutation(trackId, queueSessionId, metadata));
}

async function markPriorityUpgradePaidFromStripeMutation(trackId: string, queueSessionId: string, payment: StripePriorityPaymentMetadata): Promise<{ updated: boolean; reason?: string; track?: QueueEntry }> {
  const store = await readStore();
  const session = store.sessions.find((item) => item.sessionId === queueSessionId);
  if (!session) return { updated: false, reason: "missing_session" };
  const normalized = normalizeSession(session);
  if (normalized.status === "archived") return { updated: false, reason: "archived_session" };
  const canMoveIntoPriority = normalized.sessionId === store.activeSessionId && normalized.status === "open";
  const now = payment.paidAt ?? new Date().toISOString();
  const paidFields = (entry: QueueEntry, status: QueueEntry["priorityUpgradeStatus"]): Partial<QueueEntry> => ({
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
    priorityUpgradeCheckoutOwnerTokenHash: null,
    priorityUpgradeAmountCents: normalizePriceCents(payment.amountCents),
    priorityUpgradeCurrency: normalizeCurrency(payment.currency),
    priorityGiftAttribution: payment.giftAttribution
      ? normalizePriorityGiftAttribution(payment.giftAttribution, now)
      : entry.priorityGiftAttribution ?? null,
    ...(status === "paid" ? { displacedFromNextInLineAt: null } : {}),
  });
  const markPaid = (entry: QueueEntry, moveToPriority: boolean): QueueEntry => normalizeEntry({
    ...entry,
    ...paidFields(entry, moveToPriority ? "paid" : "paid_needs_attention"),
    ...(moveToPriority ? { lane: "priority" as QueueLane, tier: "fastlane" as QueueTier, status: "queued" as const } : {}),
  });
  const alreadyPaid = (entry: QueueEntry): boolean => entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "paid_needs_attention";

  const queueIndex = normalized.queue.findIndex((entry) => entry.id === trackId);
  if (queueIndex >= 0) {
    const existing = normalized.queue[queueIndex];
    if (alreadyPaid(existing)) return { updated: false, reason: "already_paid", track: existing };
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
    if (alreadyPaid(normalized.nextInLineTrack)) return { updated: false, reason: "already_paid", track: normalized.nextInLineTrack };
    normalized.nextInLineTrack = markPaid(normalized.nextInLineTrack, false);
    resolveNextInLine(normalized);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, track: normalized.nextInLineTrack };
  }

  if (normalized.loadedTrack?.id === trackId) {
    if (alreadyPaid(normalized.loadedTrack)) return { updated: false, reason: "already_paid", track: normalized.loadedTrack };
    normalized.loadedTrack = markPaid(normalized.loadedTrack, false);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, track: normalized.loadedTrack };
  }

  const completedIndex = normalized.completed.findIndex((entry) => entry.id === trackId);
  if (completedIndex >= 0) {
    if (alreadyPaid(normalized.completed[completedIndex])) return { updated: false, reason: "already_paid", track: normalized.completed[completedIndex] };
    normalized.completed[completedIndex] = markPaid(normalized.completed[completedIndex], false);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, reason: "completed_track_recorded", track: normalized.completed[completedIndex] };
  }

  const removedIndex = normalized.removed.findIndex((entry) => entry.id === trackId);
  if (removedIndex >= 0) {
    if (alreadyPaid(normalized.removed[removedIndex])) return { updated: false, reason: "already_paid", track: normalized.removed[removedIndex] };
    normalized.removed[removedIndex] = markPaid(normalized.removed[removedIndex], false);
    await writeStore(replaceSession(store, normalized));
    return { updated: true, reason: "removed_track_recorded", track: normalized.removed[removedIndex] };
  }

  return { updated: false, reason: "missing_track" };
}

export async function markPriorityUpgradePaidFromStripe(trackId: string, queueSessionId: string, payment: StripePriorityPaymentMetadata): Promise<{ updated: boolean; reason?: string; track?: QueueEntry }> {
  return withQueueMutation(() => markPriorityUpgradePaidFromStripeMutation(trackId, queueSessionId, payment));
}

export interface SignalHoldCheckoutRequestResult {
  session: QueueSessionSummary;
  track: QueueEntry;
  amountCents: number;
  currency: string;
  label: string;
}

export interface StripeSignalHoldPaymentMetadata {
  paymentId: string;
  amountCents: number;
  currency: string;
  paidAt?: string;
  checkoutSessionId?: string;
}

function normalizeSignalHoldLegalAcceptance(input?: SignalHoldLegalAcceptanceInput): QueueEntry["signalHoldLegalAcceptance"] {
  if (!input || input.acceptedSignalHoldTerms !== true || input.signalHoldTermsVersion !== SIGNAL_HOLD_TERMS_VERSION || input.signalHoldDisclosureText !== SIGNAL_HOLD_DISCLOSURE_TEXT) {
    throw new Error("Signal Hold checkout requires acknowledgement of the Signal Hold disclosure.");
  }
  return {
    acceptedAt: new Date().toISOString(),
    signalHoldTermsVersion: SIGNAL_HOLD_TERMS_VERSION,
    signalHoldDisclosureText: SIGNAL_HOLD_DISCLOSURE_TEXT,
    source: "signal_hold_checkout",
  };
}

function activeSignalHoldCheckoutTrack(session: QueueSession, trackId: string): QueueEntry | null {
  return session.queue.find((entry) => entry.id === trackId)
    ?? (session.nextInLineTrack?.id === trackId ? session.nextInLineTrack : null);
}

export async function requestSignalHoldCheckout(trackId: string, queueSessionId: string, signalHoldAcceptance?: SignalHoldLegalAcceptanceInput): Promise<SignalHoldCheckoutRequestResult> {
  normalizeSignalHoldLegalAcceptance(signalHoldAcceptance);
  const store = await readStore();
  const found = store.sessions.find((item) => item.sessionId === queueSessionId);
  if (!found || found.sessionId !== store.activeSessionId || found.status === "archived") {
    throw new Error("Signal Hold is available only for an active broadcast session.");
  }
  const session = normalizeSession(found);
  if (!session.signalHoldEnabled || !session.signalHoldPaymentsEnabled) {
    throw new Error("Signal Hold is unavailable for this broadcast.");
  }
  const amountCents = normalizeSignalHoldPriceCents(session.signalHoldPriceCents);
  if (amountCents <= 0) throw new Error("Signal Hold price is not configured yet.");
  const track = activeSignalHoldCheckoutTrack(session, trackId);
  const status = normalizeSignalHoldStatus(track?.signalHoldStatus);
  if (!track || (track.status !== "queued" && track.status !== "next") || (status !== "none" && status !== "checkout_pending" && status !== "failed" && status !== "refunded")) {
    throw new Error("Signal Hold is not available for this track.");
  }
  if (isSignalHoldCheckoutNearFront(trackId, { upNext: session.nextInLineTrack, queue: session.queue })) {
    throw new Error(SIGNAL_HOLD_NEXT_TWO_UNAVAILABLE_MESSAGE);
  }
  return {
    session: summarizeSession(session),
    track,
    amountCents,
    currency: normalizeCurrency(session.signalHoldCurrency),
    label: session.signalHoldLabel || DEFAULT_SIGNAL_HOLD_LABEL,
  };
}

type SignalHoldCheckoutPendingMetadata = {
  provider?: string;
  checkoutSessionId?: string;
  checkoutUrl?: string;
  checkoutCreatedAt?: string | null;
  checkoutExpiresAt?: string | null;
  checkoutOwnerTokenHash?: string | null;
  signalHoldAcceptance?: SignalHoldLegalAcceptanceInput;
};

async function markSignalHoldCheckoutPendingMutation(trackId: string, queueSessionId: string, metadata: SignalHoldCheckoutPendingMetadata = {}): Promise<QueuePublicTrack | null> {
  const store = await readStore();
  const found = store.sessions.find((item) => item.sessionId === queueSessionId);
  if (!found || found.sessionId !== store.activeSessionId || found.status === "archived") return null;
  const session = normalizeSession(found);
  if (isSignalHoldCheckoutNearFront(trackId, { upNext: session.nextInLineTrack, queue: session.queue })) {
    throw new Error(SIGNAL_HOLD_NEXT_TWO_UNAVAILABLE_MESSAGE);
  }
  const now = new Date().toISOString();
  const legalAcceptance = metadata.signalHoldAcceptance
    ? normalizeSignalHoldLegalAcceptance(metadata.signalHoldAcceptance)
    : null;
  const update = (entry: QueueEntry): QueueEntry => {
    const status = normalizeSignalHoldStatus(entry.signalHoldStatus);
    if (status === "active" || status === "paid_needs_attention" || status === "fulfilled" || status === "expired") return entry;
    return normalizeEntry({
      ...entry,
      signalHoldStatus: "checkout_pending",
      signalHoldRequestedAt: entry.signalHoldRequestedAt ?? now,
      signalHoldCheckoutProvider: metadata.provider ?? entry.signalHoldCheckoutProvider ?? null,
      signalHoldCheckoutSessionId: metadata.checkoutSessionId ?? entry.signalHoldCheckoutSessionId ?? null,
      signalHoldCheckoutUrl: metadata.checkoutUrl ?? entry.signalHoldCheckoutUrl ?? null,
      signalHoldCheckoutCreatedAt: metadata.checkoutCreatedAt ?? entry.signalHoldCheckoutCreatedAt ?? now,
      signalHoldCheckoutExpiresAt: metadata.checkoutExpiresAt ?? entry.signalHoldCheckoutExpiresAt ?? null,
      signalHoldCheckoutOwnerTokenHash: metadata.checkoutOwnerTokenHash ?? entry.signalHoldCheckoutOwnerTokenHash ?? null,
      signalHoldLegalAcceptance: legalAcceptance ?? entry.signalHoldLegalAcceptance ?? null,
      signalHoldExpiredAt: null,
    });
  };
  const queueIndex = session.queue.findIndex((entry) => entry.id === trackId);
  if (queueIndex >= 0) {
    session.queue[queueIndex] = update(session.queue[queueIndex]);
    await writeStore(replaceSession(store, session));
    return toPublicQueueTrack(session.queue[queueIndex]);
  }
  if (session.nextInLineTrack?.id === trackId) {
    session.nextInLineTrack = update(session.nextInLineTrack);
    session.nextInLineTrackId = session.nextInLineTrack.id;
    await writeStore(replaceSession(store, session));
    return toPublicQueueTrack(session.nextInLineTrack);
  }
  return null;
}

export async function markSignalHoldCheckoutPending(trackId: string, queueSessionId: string, metadata: SignalHoldCheckoutPendingMetadata = {}): Promise<QueuePublicTrack | null> {
  return withQueueMutation(() => markSignalHoldCheckoutPendingMutation(trackId, queueSessionId, metadata));
}

async function markSignalHoldPaidFromStripeMutation(trackId: string, queueSessionId: string, payment: StripeSignalHoldPaymentMetadata): Promise<{ updated: boolean; reason?: string; track?: QueueEntry }> {
  const store = await readStore();
  const found = store.sessions.find((item) => item.sessionId === queueSessionId);
  if (!found) return { updated: false, reason: "missing_session" };
  const session = normalizeSession(found);
  const located = session.queue.find((entry) => entry.id === trackId)
    ? { location: "queue" as const, index: session.queue.findIndex((entry) => entry.id === trackId), entry: session.queue.find((entry) => entry.id === trackId)! }
    : session.nextInLineTrack?.id === trackId
      ? { location: "next" as const, index: -1, entry: session.nextInLineTrack }
      : session.loadedTrack?.id === trackId
        ? { location: "loaded" as const, index: -1, entry: session.loadedTrack }
        : session.completed.find((entry) => entry.id === trackId)
          ? { location: "completed" as const, index: session.completed.findIndex((entry) => entry.id === trackId), entry: session.completed.find((entry) => entry.id === trackId)! }
          : session.removed.find((entry) => entry.id === trackId)
            ? { location: "removed" as const, index: session.removed.findIndex((entry) => entry.id === trackId), entry: session.removed.find((entry) => entry.id === trackId)! }
            : null;
  if (!located) return { updated: false, reason: "missing_track" };

  const existingStatus = normalizeSignalHoldStatus(located.entry.signalHoldStatus);
  if (existingStatus === "active" || existingStatus === "paid_needs_attention" || existingStatus === "fulfilled" || existingStatus === "expired" || existingStatus === "refunded") {
    return { updated: false, reason: "already_paid", track: located.entry };
  }
  const now = payment.paidAt ?? new Date().toISOString();
  const checkoutMismatch = Boolean(
    payment.checkoutSessionId
    && located.entry.signalHoldCheckoutSessionId
    && payment.checkoutSessionId !== located.entry.signalHoldCheckoutSessionId,
  );
  const eligibleLocation = located.location === "queue" || located.location === "next";
  const eligible = session.sessionId === store.activeSessionId
    && session.status !== "archived"
    && normalizePaidSignalHoldEnabled(session)
    && eligibleLocation
    && (located.entry.status === "queued" || located.entry.status === "next")
    && !checkoutMismatch;
  const updated = normalizeEntry({
    ...located.entry,
    signalHoldStatus: eligible ? "active" : "paid_needs_attention",
    signalHoldRequestedAt: located.entry.signalHoldRequestedAt ?? now,
    signalHoldPaidAt: now,
    signalHoldPaymentProvider: "stripe",
    signalHoldPaymentId: payment.paymentId,
    signalHoldCheckoutProvider: null,
    signalHoldCheckoutSessionId: null,
    signalHoldCheckoutUrl: null,
    signalHoldCheckoutCreatedAt: null,
    signalHoldCheckoutExpiresAt: null,
    signalHoldCheckoutOwnerTokenHash: null,
    signalHoldAmountCents: normalizeSignalHoldPriceCents(payment.amountCents),
    signalHoldCurrency: normalizeCurrency(payment.currency),
    signalHoldFulfilledAt: null,
    signalHoldExpiredAt: null,
  });

  if (located.location === "queue") session.queue[located.index] = updated;
  else if (located.location === "next") {
    session.nextInLineTrack = updated;
    session.nextInLineTrackId = updated.id;
  } else if (located.location === "loaded") {
    session.loadedTrack = updated;
    session.loadedTrackId = updated.id;
  } else if (located.location === "completed") session.completed[located.index] = updated;
  else session.removed[located.index] = updated;

  await writeStore(replaceSession(store, session));
  return {
    updated: true,
    reason: eligible ? undefined : "paid_needs_attention",
    track: updated,
  };
}

export async function markSignalHoldPaidFromStripe(trackId: string, queueSessionId: string, payment: StripeSignalHoldPaymentMetadata): Promise<{ updated: boolean; reason?: string; track?: QueueEntry }> {
  return withQueueMutation(() => markSignalHoldPaidFromStripeMutation(trackId, queueSessionId, payment));
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
  const safeDate = session.showDate || pacificDateString();
  return { filename: `barcode-radio-session-${safeDate}-submissions.csv`, csv: [headers.map(csvEscape).join(","), ...body].join("\n") };
}

export interface QueueSessionShowLogExport {
  schemaVersion: typeof QUEUE_SHOW_LOG_SCHEMA_VERSION;
  generatedAt: string;
  revision: number;
  session: Pick<QueueSessionSummary, "sessionId" | "title" | "showDate" | "status">;
  report: QueueShowReport;
  events: QueueShowLogEvent[];
}

export async function getQueueSessionShowLog(sessionId?: string): Promise<QueueSessionShowLogExport> {
  const store = await readStore();
  const session = normalizeSession(getSession(store, sessionId));
  const events = normalizeQueueShowLog(session.showLog);
  const exportedEvents = events.length > 0 ? events : initialQueueShowLog(session);
  return {
    schemaVersion: QUEUE_SHOW_LOG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    revision: store.revision,
    session: {
      sessionId: session.sessionId,
      title: session.title,
      showDate: session.showDate,
      status: session.status,
    },
    report: buildQueueShowReport(session, exportedEvents),
    events: exportedEvents,
  };
}

export async function getQueueSessionShowLogCsv(sessionId?: string): Promise<{ filename: string; csv: string }> {
  const log = await getQueueSessionShowLog(sessionId);
  const headers = [
    "sequence",
    "timestamp",
    "event",
    "track id",
    "TikTok handle",
    "artist",
    "song title",
    "source type",
    "public source link",
    "submission order",
    "played order",
    "playback provider",
    "playback position seconds",
    "playback duration seconds",
    "playback error",
    "wheel candidate count",
    "wheel spin duration ms",
    "Signal Hold previous lane",
    "Signal Hold application count",
  ];
  const body = log.events.map((event) => [
    event.sequence,
    event.occurredAt,
    event.eventType,
    event.track?.trackId ?? "",
    event.track?.tiktokHandle ?? "",
    event.track?.artist ?? "",
    event.track?.title ?? "",
    event.track?.sourceType ?? "",
    event.track?.publicSourceUrl ?? "",
    event.track?.submissionOrder ?? "",
    event.track?.playedOrder ?? "",
    event.details?.playbackProvider ?? "",
    event.details?.playbackPositionSeconds ?? "",
    event.details?.playbackDurationSeconds ?? "",
    event.details?.playbackErrorCode ?? "",
    event.details?.wheelCandidateCount ?? "",
    event.details?.wheelSpinDurationMs ?? "",
    event.details?.signalHoldPreviousLane ?? "",
    event.details?.signalHoldApplicationCount ?? "",
  ].map(csvEscape).join(","));
  const safeDate = log.session.showDate || pacificDateString();
  return {
    filename: `barcode-radio-show-log-${safeDate}.csv`,
    csv: [headers.map(csvEscape).join(","), ...body].join("\n"),
  };
}

const OPERATIONAL_SHOW_LOG_EVENT_TYPES = new Set<QueueShowLogEventType>([
  "wheel_launched",
  "wheel_reencrypted",
  "wheel_spun",
  "wheel_result_rejected",
  "wheel_confirmed",
  "wheel_cancelled",
]);

export interface QueueOperationalShowLogEventInput {
  eventType: QueueShowLogEventType;
  occurredAt: string;
  details?: QueueShowLogEventDetails | null;
}

export async function recordQueueOperationalShowEvent(input: QueueOperationalShowLogEventInput): Promise<boolean> {
  if (!OPERATIONAL_SHOW_LOG_EVENT_TYPES.has(input.eventType) || !Number.isFinite(Date.parse(input.occurredAt))) return false;
  return withQueueMutation(async () => {
    const store = await readStore();
    const found = findSession(store);
    if (!found || found.status === "archived") return false;
    const session = normalizeSession(found);
    const showLog = appendQueueShowLogEvents(session.showLog, [{
      eventType: input.eventType,
      occurredAt: new Date(input.occurredAt).toISOString(),
      track: null,
      details: input.details ?? null,
    }]);
    if ((showLog.at(-1)?.sequence ?? 0) <= (session.showLog.at(-1)?.sequence ?? 0)) return false;
    const updated = normalizeSession({ ...session, showLog });
    const nextStore = replaceSession(store, updated);
    await writeStore(nextStore);
    return true;
  });
}

async function updatePriorityUpgradeSettingsMutation(input: PriorityUpgradeSettingsInput): Promise<QueueState> {
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

export async function updatePriorityUpgradeSettings(input: PriorityUpgradeSettingsInput): Promise<QueueState> {
  return withQueueMutation(() => updatePriorityUpgradeSettingsMutation(input));
}

async function updateSignalHoldSettingsMutation(input: SignalHoldSettingsInput): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return queueStateFromSession(session, store);
  const signalHoldPriceCents = normalizeSignalHoldPriceCents(input.priceCents ?? session.signalHoldPriceCents);
  const signalHoldPaidEnabled = normalizePaidSignalHoldEnabled({
    signalHoldEnabled: input.enabled,
    signalHoldPaymentsEnabled: input.paymentsEnabled,
    signalHoldPriceCents,
  });
  const next = normalizeSession({
    ...session,
    signalHoldEnabled: signalHoldPaidEnabled,
    signalHoldLabel: DEFAULT_SIGNAL_HOLD_LABEL,
    signalHoldInstructions: DEFAULT_SIGNAL_HOLD_INSTRUCTIONS,
    signalHoldPriceCents,
    signalHoldCurrency: normalizeCurrency(input.currency ?? session.signalHoldCurrency),
    signalHoldPaymentsEnabled: signalHoldPaidEnabled,
    updatedAt: new Date().toISOString(),
  });
  const nextStore = replaceSession(store, next);
  await writeStore(nextStore);
  return queueStateFromSession(next, nextStore);
}

export async function updateSignalHoldSettings(input: SignalHoldSettingsInput): Promise<QueueState> {
  return withQueueMutation(() => updateSignalHoldSettingsMutation(input));
}


async function updateSponsorBreakStateMutation(action: "start" | "complete" | "skip" | "reset"): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return queueStateFromSession(session, store);
  applySponsorBreakDueState(session);
  const now = new Date().toISOString();
  const completedPlayable = completedCountedTrackCountForSession(session);
  if (action === "start" && session.sponsorBreakStatus !== "due") return queueStateFromSession(session, store);
  if (action === "start" && (session.sponsorBreakStatus === "running" || session.sponsorBreakStatus === "completed" || session.sponsorBreakStatus === "skipped")) {
    return queueStateFromSession(session, store);
  }
  const next = normalizeSession({
    ...session,
    sponsorBreakStatus: action === "start" ? "running" : action === "complete" ? "completed" : action === "skip" ? "skipped" : "not_due",
    sponsorBreakStartedAt: action === "start" ? now : action === "reset" ? null : session.sponsorBreakStartedAt ?? null,
    sponsorBreakCompletedAt: action === "complete" || action === "skip" ? now : action === "reset" ? null : session.sponsorBreakCompletedAt ?? null,
    sponsorBreakCompletedAfterPlayableCount: action === "complete" || action === "skip" ? completedPlayable : action === "reset" ? null : session.sponsorBreakCompletedAfterPlayableCount ?? null,
    sponsorBreakDueAfterPlayableCount: action === "reset" ? null : session.sponsorBreakDueAfterPlayableCount ?? null,
    sponsorBreakManualNote: action === "start" ? "Commercial break started by admin." : action === "complete" ? "Commercial break completed by admin." : action === "skip" ? "Commercial break skipped by admin." : null,
    updatedAt: now,
  });
  const nextStore = replaceSession(store, next);
  await writeStore(nextStore);
  return queueStateFromSession(next, nextStore);
}

export async function updateSponsorBreakState(action: "start" | "complete" | "skip" | "reset"): Promise<QueueState> {
  return withQueueMutation(() => updateSponsorBreakStateMutation(action));
}

async function updateSubmissionCooldownSettingsMutation(input: { submissionCooldownSeconds?: number }): Promise<QueueState> {
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

export async function updateSubmissionCooldownSettings(input: { submissionCooldownSeconds?: number }): Promise<QueueState> {
  return withQueueMutation(() => updateSubmissionCooldownSettingsMutation(input));
}

async function setQueueOpenMutation(isOpen: boolean): Promise<QueuePublicStatus> {
  const store = await readStore();
  const session = findSession(store);
  if (!session) {
    if (!isOpen) return emptyQueuePublicStatus();
    throw new Error("Queue session not found.");
  }
  if (session.status === "archived") return session.publicStatus;

  const now = new Date();
  const sessions = store.sessions.map((item) => {
    if (item.sessionId === session.sessionId) {
      const openingPreShow = isOpen && item.showStarted !== true;
      return normalizeSession({ ...item, queueOpen: isOpen, status: isOpen ? "open" : "closed", submissionClosureReason: isOpen ? null : "manual", preShowEndsAt: openingPreShow ? (item.queueOpen && item.preShowEndsAt ? item.preShowEndsAt : preShowEndsAtFrom(now)) : item.preShowEndsAt ?? null, updatedAt: now.toISOString() });
    }
    if (isOpen && item.status === "open") {
      return normalizeSession({ ...item, queueOpen: false, status: "closed", submissionClosureReason: "manual", updatedAt: now.toISOString() });
    }
    return item;
  });
  const nextStore = { ...store, sessions };
  await writeStore(nextStore);
  return publicStatusForSession(getSession(nextStore));
}

export async function setQueueOpen(isOpen: boolean): Promise<QueuePublicStatus> {
  return withQueueMutation(() => setQueueOpenMutation(isOpen));
}

async function startNewQueueSessionMutation(options: QueueSessionOptions = {}): Promise<QueueState> {
  const store = await readStore();
  const current = findSession(store);
  const replacingPlaceholder = isEmptyRevisionZeroPlaceholder(store);
  if (current && current.status !== "archived" && !replacingPlaceholder) {
    return queueStateFromSession(current, store, current.sessionId);
  }
  const preserved = replacingPlaceholder
    ? []
    : store.sessions;
  const next = defaultSession(options);
  const nextStore = { revision: store.revision, activeSessionId: next.sessionId, sessions: [next, ...preserved] };
  await writeStore(nextStore);
  return queueStateFromSession(next, nextStore);
}

export async function startNewQueueSession(options: QueueSessionOptions = {}): Promise<QueueState> {
  return withQueueMutation(() => startNewQueueSessionMutation(options));
}

async function updateQueueSessionProvenanceMutation(
  input: QueueSessionProvenanceInput,
): Promise<QueueState> {
  const store = await readStore();
  const session = input.sessionId
    ? store.sessions.find((item) => item.sessionId === input.sessionId)
    : getSession(store);
  if (!session) throw new Error("Queue session not found.");
  const purpose = normalizeQueueSessionPurpose(input.purpose);
  const now = new Date().toISOString();
  const updated = normalizeSession({
    ...session,
    purpose,
    bnlPublicationStatus: normalizeQueueSessionBnlPublicationStatus(
      input.bnlPublicationStatus,
      purpose,
    ),
    provenanceRevision: (session.provenanceRevision ?? 0) + 1,
    provenanceUpdatedAt: now,
    updatedAt: now,
  });
  const nextStore = replaceSession(store, updated);
  await writeStore(nextStore);
  return queueStateFromSession(updated, nextStore, updated.sessionId);
}

export async function updateQueueSessionProvenance(
  input: QueueSessionProvenanceInput,
): Promise<QueueState> {
  return withQueueMutation(() => updateQueueSessionProvenanceMutation(input));
}

async function archiveCurrentQueueSessionMutation(): Promise<QueueState> {
  const store = await readStore();
  const current = findSession(store);
  if (!current) return queueStateWithoutSession(store);
  const expiredAt = new Date().toISOString();
  const expireSignalHold = (entry: QueueEntry): QueueEntry => normalizeSignalHoldStatus(entry.signalHoldStatus) === "active"
    ? normalizeEntry({ ...entry, signalHoldStatus: "expired", signalHoldExpiredAt: expiredAt })
    : entry;
  const session = normalizeSession({
    ...current,
    status: "archived",
    queueOpen: false,
    submissionClosureReason: "archived",
    showStarted: false,
    queue: current.queue.map(expireSignalHold),
    nextInLineTrack: current.nextInLineTrack ? expireSignalHold(current.nextInLineTrack) : null,
    loadedTrack: current.loadedTrack ? expireSignalHold(current.loadedTrack) : null,
    completed: current.completed.map(expireSignalHold),
    removed: current.removed.map(expireSignalHold),
    updatedAt: expiredAt,
  });
  const archivedStore = replaceSession(store, session);
  const active = archivedStore.sessions.find((item) => item.status === "open" || item.status === "prepared") ?? session;
  archivedStore.activeSessionId = active.sessionId;
  await writeStore(archivedStore);
  return queueStateFromSession(session, archivedStore, session.sessionId);
}

export async function archiveCurrentQueueSession(): Promise<QueueState> {
  return withQueueMutation(() => archiveCurrentQueueSessionMutation());
}


async function clearArchivedQueueSessionsMutation(): Promise<QueueState> {
  const store = await readStore();
  const sessions = store.sessions.filter((session) => session.status !== "archived");
  if (sessions.length === store.sessions.length) {
    const current = findSession(store);
    return current ? queueStateFromSession(current, store) : queueStateWithoutSession(store);
  }
  const activeExists = sessions.some((session) => session.sessionId === store.activeSessionId);
  const nextStore: QueueStore = {
    revision: store.revision,
    activeSessionId: activeExists ? store.activeSessionId : null,
    sessions,
  };
  await writeStore(nextStore);
  const current = findSession(nextStore);
  return current ? queueStateFromSession(current, nextStore) : queueStateWithoutSession(nextStore);
}

export async function clearArchivedQueueSessions(): Promise<QueueState> {
  return withQueueMutation(() => clearArchivedQueueSessionsMutation());
}

async function activateQueueSessionMutation(sessionId: string): Promise<QueueState> {
  const store = await readStore();
  const target = store.sessions.find((session) => session.sessionId === sessionId);
  if (!target || target.status === "archived") return queueStateFromSession(target ?? getSession(store), store, sessionId);
  const sessions = store.sessions.map((session) => normalizeSession({ ...session, status: session.sessionId === sessionId ? "prepared" : session.status === "archived" ? "archived" : "closed", queueOpen: false, submissionClosureReason: session.status === "archived" ? "archived" : "manual", updatedAt: new Date().toISOString() }));
  const active = sessions.find((session) => session.sessionId === sessionId) ?? sessions[0];
  const nextStore = { revision: store.revision, activeSessionId: active.sessionId, sessions };
  await writeStore(nextStore);
  return queueStateFromSession(active, nextStore);
}

export async function activateQueueSession(sessionId: string): Promise<QueueState> {
  return withQueueMutation(() => activateQueueSessionMutation(sessionId));
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
    recordLoadedTrackReturned(session, session.loadedTrack);
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

function resolvePaidPriorityTrack(session: QueueSession, id: string): boolean {
  const queueIndex = session.queue.findIndex((entry) => entry.id === id);
  if (queueIndex < 0) return false;
  const track = session.queue[queueIndex];
  if (track.priorityUpgradeStatus !== "paid_needs_attention" || track.status !== "queued") return false;
  if ((track.lane ?? "regular") !== "regular" && (track.lane ?? "regular") !== "wheel") return false;
  const now = new Date().toISOString();
  session.queue[queueIndex] = normalizeEntry({
    ...track,
    lane: "priority",
    tier: "fastlane",
    priorityUpgradeRequested: true,
    priorityUpgradeStatus: "paid",
    priorityUpgradeSource: track.priorityUpgradeSource ?? "stripe",
    priorityUpgradeAt: track.priorityUpgradeAt ?? now,
    priorityUpgradeRequestedAt: track.priorityUpgradeRequestedAt ?? now,
    priorityUpgradePaidAt: track.priorityUpgradePaidAt ?? now,
    priorityPausedAt: null,
    priorityResumedAt: null,
    priorityQueueOrderAt: track.priorityQueueOrderAt ?? track.priorityUpgradePaidAt ?? now,
    displacedFromNextInLineAt: null,
    stagedAsFallbackForLane: null,
  });
  session.queue = sortActive(session.queue);
  resolveNextInLine(session, undefined, true);
  return true;
}

function restoreEntry(entry: QueueEntry, lane: QueueLane): QueueEntry {
  return normalizeEntry({ ...entry, lane, tier: lane === "priority" ? "fastlane" : "free", status: "queued", createdAt: new Date().toISOString(), playedAt: null, completedAt: null, removedAt: null, restoredAt: new Date().toISOString(), playbackOutcome: null, playbackEndedNaturally: null, playbackEarlyCutoff: null, playbackEndPositionSeconds: null, playbackEndPositionObservedAt: null, playbackObservedDurationSeconds: null, playbackIssueCode: null, displacedFromNextInLineAt: null, ...priorityUpgradeMetadata(entry, lane) });
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
    priorityUpgradeCheckoutOwnerTokenHash: null,
    priorityUpgradeAmountCents: null,
    priorityUpgradeCurrency: null,
    priorityGiftAttribution: null,
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
    if (isSimulationTrack(session.loadedTrack)) {
      recordLoadedTrackReturned(session, session.loadedTrack!);
      clearLoadedTrack(session);
    }
    pullNextInLine(session, undefined, true);
    return true;
  }

  const simulationCreationAllowed = session.status === "open" && session.queueOpen;
  if (!simulationCreationAllowed) return false;

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
      priorityUpgradeCheckoutOwnerTokenHash: null,
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

function applySignalHoldToMoveTrackToBottom(session: QueueSession, trackId: string): boolean {
  const loaded = session.loadedTrack?.id === trackId ? session.loadedTrack : null;
  if (loaded) {
    if (normalizeSignalHoldStatus(loaded.signalHoldStatus) !== "active") {
      throw new Error("Signal Hold payment is not active for this track.");
    }
    if (queuePlaybackHasBegun(session.playbackDiagnostics, trackId)) {
      throw new Error("Signal Hold cannot be used after playback has begun.");
    }
    recordLoadedTrackReturned(session, loaded);
    undoLoadedTrack(session);
  }
  const queueIndex = session.queue.findIndex((entry) => entry.id === trackId);
  const source = queueIndex >= 0
    ? session.queue[queueIndex]
    : session.nextInLineTrack?.id === trackId
      ? session.nextInLineTrack
      : null;
  if (!source || (source.status !== "queued" && source.status !== "next")) {
    throw new Error("Signal Hold is available only for a queued or Next In Line track.");
  }
  if (normalizeSignalHoldStatus(source.signalHoldStatus) !== "active") {
    throw new Error("Signal Hold payment is not active for this track.");
  }

  const previousLane = source.lane ?? "regular";
  const now = new Date().toISOString();
  if (queueIndex >= 0) session.queue.splice(queueIndex, 1);
  else clearNextInLine(session);
  const moved = normalizeEntry({
    ...source,
    lane: "regular",
    tier: "free",
    status: "queued",
    displacedFromNextInLineAt: null,
    stagedAsFallbackForLane: null,
    priorityPausedAt: null,
    priorityResumedAt: null,
    signalHoldAppliedAt: now,
    signalHoldApplicationCount: Math.max(0, Math.floor(source.signalHoldApplicationCount ?? 0)) + 1,
    signalHoldQueueOrderAt: now,
    signalHoldPriorityRelinquishedAt: previousLane === "priority"
      ? now
      : source.signalHoldPriorityRelinquishedAt ?? null,
  });
  session.queue = sortActive([...session.queue.filter((entry) => entry.id !== trackId), moved]);
  session.nextInLineHoldTrackId = trackId;

  if (previousLane === "wheel") {
    session.wheelSpinsOwed = normalizeWheelSpinsOwed(session.wheelSpinsOwed) + 1;
    session.autoRoutingPaused = true;
    return true;
  }

  resolveNextInLine(session, trackId, true);
  return true;
}

async function updateRadioTrackMutation(id: string, action: QueueAdminAction, playbackSnapshot: QueuePlaybackEndpointSnapshot | null = null): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return queueStateFromSession(session, store);
  applyPreShowTimer(session);

  if (action === "startShow") {
    const now = new Date().toISOString();
    session.showStarted = true;
    if (!session.broadcastStartedAt) session.broadcastStartedAt = now;
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

  if (action === "useSignalHold") {
    applySignalHoldToMoveTrackToBottom(session, id);
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

  if (action === "resolvePaidPriority") {
    if (resolvePaidPriorityTrack(session, id)) {
      const nextStore = replaceSession(store, session);
      await writeStore(nextStore);
      return queueStateFromSession(session, nextStore);
    }
    return queueStateFromSession(session, store);
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
    const source = completedIndex >= 0 ? session.completed[completedIndex] : removedIndex >= 0 ? session.removed[removedIndex] : null;
    if (source) {
      if (removedIndex >= 0 && !isSimulationTrack(source) && publicStatusForSession(session).isFull) {
        throw new Error("Queue is full for restored transmissions.");
      }
      if (action === "restorePriority" && !wasPrioritySignal(source)) {
        await writeStore(replaceSession(store, session));
        return getRadioQueueState();
      }
      if (completedIndex >= 0) session.completed.splice(completedIndex, 1);
      else if (removedIndex >= 0) session.removed.splice(removedIndex, 1);
      session.queue.push(restoreEntry(source, lane));
    }
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
      recordLoadedTrackReturned(session, loaded);
      undoLoadedTrack(session);
    }
    if (action === "finish") {
      session.nextInLineHoldTrackId = null;
      const current = session.loadedTrack;
      if (current) {
        const completedAt = new Date();
        const completed = entryWithPlaybackOutcome(session, current, "finished", { now: completedAt, snapshot: playbackSnapshot });
        clearLoadedTrack(session);
        removeTrackFromActiveLocations(session, current.id);
        const now = completedAt.toISOString();
        if (!session.broadcastStartedAt) session.broadcastStartedAt = current.playedAt ?? now;
        session.completed.unshift({ ...completed, status: "played", playedAt: completed.playedAt ?? now, completedAt: now });
        advanceNonPriorityLaneAfter(session, current.lane);
      }
    }
    if (action === "remove") {
      session.nextInLineHoldTrackId = null;
      const current = session.loadedTrack;
      if (current) {
        const removed = entryWithPlaybackOutcome(session, current, "removed");
        clearLoadedTrack(session);
        removeTrackFromActiveLocations(session, current.id);
        session.removed.unshift({ ...removed, status: "removed", removedAt: new Date().toISOString() });
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
        removeTrackFromActiveLocations(session, current.id);
        const now = new Date().toISOString();
        if (!session.broadcastStartedAt) session.broadcastStartedAt = current.playedAt ?? now;
        const completed = entryWithPlaybackOutcome(session, current, "finished");
        session.completed.unshift({ ...completed, status: "played", playedAt: completed.playedAt ?? now, completedAt: now });
        advanceNonPriorityLaneAfter(session, current.lane);
      }
      pullNextInLine(session);
    }
    if (action === "remove") {
      const current = clearNextInLine(session);
      if (current) {
        removeTrackFromActiveLocations(session, current.id);
        const removed = entryWithPlaybackOutcome(session, current, "removed");
        session.removed.unshift({ ...removed, status: "removed", removedAt: new Date().toISOString() });
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
    removeTrackFromActiveLocations(session, active.id);
    const completed = entryWithPlaybackOutcome(session, active, "finished");
    session.completed.unshift({ ...completed, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    advanceNonPriorityLaneAfter(session, active.lane);
  }
  if (action === "remove") {
    session.queue.splice(index, 1);
    removeTrackFromActiveLocations(session, active.id);
    const removed = entryWithPlaybackOutcome(session, active, "removed");
    session.removed.unshift({ ...removed, status: "removed", removedAt: new Date().toISOString() });
  }
  pullNextInLine(session);
  await writeStore(replaceSession(store, session));
  return getRadioQueueState();
}

const CLIENT_PLAYBACK_EVENT_TYPES = new Set<QueuePlaybackLifecycleEventInput["eventType"]>(["ready", "play", "pause", "stall", "resume", "seek", "ended", "error"]);

export async function recordQueuePlaybackEvent(input: QueuePlaybackLifecycleEventInput): Promise<{
  accepted: boolean;
  reason: "accepted" | "track_not_loaded" | "invalid_event";
  playbackDiagnostics: ReturnType<typeof normalizeQueuePlaybackDiagnostics>;
}> {
  return withQueueMutation(async () => {
    const store = await readStore();
    const session = getSession(store);
    const diagnostics = normalizeQueuePlaybackDiagnostics(session.playbackDiagnostics);
    const loaded = session.loadedTrack;
    if (session.status === "archived" || (input.sessionId && input.sessionId !== session.sessionId) || !loaded || loaded.id !== input.trackId) {
      return { accepted: false, reason: "track_not_loaded", playbackDiagnostics: diagnostics };
    }
    if (!CLIENT_PLAYBACK_EVENT_TYPES.has(input.eventType) || input.provider !== queuePlaybackProviderForSourceType(loaded.sourceType)) {
      return { accepted: false, reason: "invalid_event", playbackDiagnostics: diagnostics };
    }
    const receipt = appendSessionPlaybackEvent(session, input);
    if (!receipt.accepted) return { accepted: false, reason: receipt.reason, playbackDiagnostics: receipt.diagnostics };
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    const nextSession = getSession(nextStore, session.sessionId);
    return {
      accepted: true,
      reason: "accepted",
      playbackDiagnostics: normalizeQueuePlaybackDiagnostics(nextSession.playbackDiagnostics),
    };
  });
}

export async function updateRadioTrack(id: string, action: QueueAdminAction, playbackSnapshot: QueuePlaybackEndpointSnapshot | null = null): Promise<QueueState> {
  return withQueueMutation(() => updateRadioTrackMutation(id, action, playbackSnapshot));
}

// Legacy-compatible helpers used by archived/OBS components.
export async function addToQueue(entry: Omit<QueueEntry, "id" | "status" | "playedAt">): Promise<QueueEntry> {
  const track = normalizeEntry({ ...entry, id: generateQueueId(), status: "queued", playedAt: null, lane: entry.lane ?? (normalizeTier(entry.tier) === "fastlane" ? "priority" : "regular"), sourceType: entry.sourceType ?? detectQueueSourceType(entry.link) });
  return withQueueMutation(async () => {
    const store = await readStore();
    const session = getSession(store);
    applyPreShowTimer(session);
    if (!isSimulationTrack(track) && publicStatusForSession(session).isFull) {
      throw new Error("Queue is full for new transmissions.");
    }
    session.queue.push(track);
    await writeStore(replaceSession(store, session));
    return track;
  });
}

export async function getQueueState(): Promise<QueueState> { return getRadioQueueState(); }

export async function advanceQueue(): Promise<QueueEntry | null> {
  return withQueueMutation(async () => {
    const store = await readStore();
    const session = getSession(store);
    pullNextInLine(session);
    const next = clearNextInLine(session);
    if (!next) return null;
    const completed = entryWithPlaybackOutcome(session, next, "finished");
    session.completed.unshift({ ...completed, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    advanceNonPriorityLaneAfter(session, next.lane);
    pullNextInLine(session);
    await writeStore(replaceSession(store, session));
    return getNextInLine(session);
  });
}

export async function resetQueue(): Promise<{ cleared: number; preserved: number }> {
  return withQueueMutation(async () => {
    const store = await readStore();
    const session = getSession(store);
    const cleared = session.queue.length;
    session.queue = [];
    await writeStore(replaceSession(store, session));
    return { cleared, preserved: 0 };
  });
}

export async function getEntry(id: string): Promise<QueueEntry | null> {
  const state = await getRadioQueueState();
  return [...state.queue, ...state.history, ...(state.removed ?? [])].find((entry) => entry.id === id) ?? null;
}

export async function upgradeEntryTier(id: string, newTier: QueueTier, additionalAmount: number): Promise<QueueEntry | null> {
  return withQueueMutation(async () => {
    const store = await readStore();
    const session = getSession(store);
    const index = session.queue.findIndex((entry) => entry.id === id);
    if (index === -1) return null;
    const updated = normalizeEntry({ ...session.queue[index], tier: newTier === "fastlane" ? session.queue[index].tier : newTier, amount: session.queue[index].amount + additionalAmount, lane: session.queue[index].lane, ...(newTier === "fastlane" ? { priorityUpgradeRequested: true, priorityUpgradeStatus: "checkout_pending" as const, priorityUpgradeSource: "future_payment" as const, priorityUpgradeAt: new Date().toISOString(), priorityUpgradeRequestedAt: new Date().toISOString() } : {}) });
    session.queue[index] = updated;
    await writeStore(replaceSession(store, session));
    return updated;
  });
}

const stripeSessions = new Map<string, string>();
export async function storeStripeSession(sessionId: string, entryId: string): Promise<void> { stripeSessions.set(sessionId, entryId); }
export async function getStripeSessionEntry(sessionId: string): Promise<string | null> { return stripeSessions.get(sessionId) ?? null; }
