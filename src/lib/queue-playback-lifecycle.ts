import type {
  QueueEntry,
  QueuePlaybackDiagnostics,
  QueuePlaybackErrorCode,
  QueuePlaybackLifecycleEvent,
  QueuePlaybackLifecycleEventInput,
  QueuePlaybackLifecycleEventType,
  QueuePlaybackLifecycleState,
  QueuePlaybackOutcome,
  QueuePlaybackProvider,
  QueueSourceType,
} from "./queue-types";

export const MAX_QUEUE_PLAYBACK_EVENTS = 80;
export const QUEUE_PLAYBACK_ENDPOINT_FRESHNESS_MS = 12_000;
const MAX_PLAYBACK_SECONDS = 24 * 60 * 60;

const PROVIDERS = new Set<QueuePlaybackProvider>(["audio", "youtube", "tiktok", "external"]);
const EVENT_TYPES = new Set<QueuePlaybackLifecycleEventType>(["loaded", "ready", "play", "pause", "stall", "resume", "seek", "ended", "error", "finish", "skip", "remove", "return"]);
const ERROR_CODES = new Set<QueuePlaybackErrorCode>(["media_aborted", "network_error", "decode_error", "source_unsupported", "provider_error", "ready_timeout", "sync_error", "unknown"]);
const STATES = new Set<QueuePlaybackLifecycleState>(["idle", "loaded", "ready", "playing", "paused", "stalled", "ended", "error", "cleared"]);

export type QueuePlaybackEventReceipt = {
  accepted: boolean;
  reason: "accepted" | "track_not_loaded" | "invalid_event";
  diagnostics: QueuePlaybackDiagnostics;
  event: QueuePlaybackLifecycleEvent | null;
};

export interface QueuePlaybackEndpointSnapshot {
  trackId: string;
  playbackState: "playing" | "paused" | "stopped";
  currentTimeSeconds: number;
  durationSeconds?: number | null;
  observedAt: string;
}

interface QueuePlaybackOutcomeOptions {
  snapshot?: QueuePlaybackEndpointSnapshot | null;
  now?: Date;
}

export function emptyQueuePlaybackDiagnostics(): QueuePlaybackDiagnostics {
  return {
    schemaVersion: "queue_playback_lifecycle_v1",
    currentTrackId: null,
    lifecycleState: "idle",
    lastEventAt: null,
    lastErrorCode: null,
    nextSequence: 1,
    events: [],
  };
}

function boundedSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.min(MAX_PLAYBACK_SECONDS, Math.round(numeric * 1000) / 1000);
}

function boundedState(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.floor(numeric);
  return rounded >= 0 && rounded <= max ? rounded : null;
}

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function validTrackId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 160 ? trimmed : null;
}

function normalizeStoredEvent(value: unknown): QueuePlaybackLifecycleEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<QueuePlaybackLifecycleEvent>;
  const trackId = validTrackId(raw.trackId);
  const observedAt = validIso(raw.observedAt);
  if (!trackId || !observedAt || !PROVIDERS.has(raw.provider as QueuePlaybackProvider) || !EVENT_TYPES.has(raw.eventType as QueuePlaybackLifecycleEventType) || !STATES.has(raw.lifecycleState as QueuePlaybackLifecycleState)) return null;
  const sequence = typeof raw.sequence === "number" && Number.isFinite(raw.sequence) ? Math.max(1, Math.floor(raw.sequence)) : null;
  if (!sequence) return null;
  return {
    sequence,
    trackId,
    provider: raw.provider as QueuePlaybackProvider,
    eventType: raw.eventType as QueuePlaybackLifecycleEventType,
    lifecycleState: raw.lifecycleState as QueuePlaybackLifecycleState,
    observedAt,
    currentTimeSeconds: boundedSeconds(raw.currentTimeSeconds),
    durationSeconds: boundedSeconds(raw.durationSeconds),
    readyState: boundedState(raw.readyState, 4),
    networkState: boundedState(raw.networkState, 3),
    errorCode: ERROR_CODES.has(raw.errorCode as QueuePlaybackErrorCode) ? raw.errorCode as QueuePlaybackErrorCode : null,
  };
}

export function normalizeQueuePlaybackDiagnostics(value: unknown): QueuePlaybackDiagnostics {
  if (!value || typeof value !== "object") return emptyQueuePlaybackDiagnostics();
  const raw = value as Partial<QueuePlaybackDiagnostics>;
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .map(normalizeStoredEvent)
    .filter((event): event is QueuePlaybackLifecycleEvent => Boolean(event))
    .sort((a, b) => a.sequence - b.sequence)
    .slice(-MAX_QUEUE_PLAYBACK_EVENTS);
  const maxSequence = events.reduce((max, event) => Math.max(max, event.sequence), 0);
  const currentTrackId = validTrackId(raw.currentTrackId);
  return {
    schemaVersion: "queue_playback_lifecycle_v1",
    currentTrackId,
    lifecycleState: STATES.has(raw.lifecycleState as QueuePlaybackLifecycleState) ? raw.lifecycleState as QueuePlaybackLifecycleState : currentTrackId ? "loaded" : "idle",
    lastEventAt: validIso(raw.lastEventAt) ?? events.at(-1)?.observedAt ?? null,
    lastErrorCode: ERROR_CODES.has(raw.lastErrorCode as QueuePlaybackErrorCode) ? raw.lastErrorCode as QueuePlaybackErrorCode : null,
    nextSequence: Math.max(maxSequence + 1, typeof raw.nextSequence === "number" && Number.isFinite(raw.nextSequence) ? Math.floor(raw.nextSequence) : 1),
    events,
  };
}

function nextLifecycleState(current: QueuePlaybackLifecycleState, eventType: QueuePlaybackLifecycleEventType): QueuePlaybackLifecycleState {
  if (eventType === "loaded") return "loaded";
  if (eventType === "ready") return "ready";
  if (eventType === "play" || eventType === "resume") return "playing";
  if (eventType === "pause") return "paused";
  if (eventType === "stall") return "stalled";
  if (eventType === "ended") return "ended";
  if (eventType === "error") return "error";
  if (eventType === "finish" || eventType === "skip" || eventType === "remove" || eventType === "return") return "cleared";
  return current === "idle" || current === "cleared" ? "loaded" : current;
}

export function appendQueuePlaybackEvent(
  existing: QueuePlaybackDiagnostics | null | undefined,
  input: QueuePlaybackLifecycleEventInput,
  expectedTrackId: string | null | undefined,
  now = new Date(),
): QueuePlaybackEventReceipt {
  const diagnostics = normalizeQueuePlaybackDiagnostics(existing);
  const trackId = validTrackId(input.trackId);
  if (!trackId || !PROVIDERS.has(input.provider) || !EVENT_TYPES.has(input.eventType)) {
    return { accepted: false, reason: "invalid_event", diagnostics, event: null };
  }
  if (!expectedTrackId || trackId !== expectedTrackId) {
    return { accepted: false, reason: "track_not_loaded", diagnostics, event: null };
  }
  const lifecycleState = nextLifecycleState(diagnostics.currentTrackId === trackId ? diagnostics.lifecycleState : "idle", input.eventType);
  const observedAt = now.toISOString();
  const event: QueuePlaybackLifecycleEvent = {
    sequence: diagnostics.nextSequence,
    trackId,
    provider: input.provider,
    eventType: input.eventType,
    lifecycleState,
    observedAt,
    currentTimeSeconds: boundedSeconds(input.currentTimeSeconds),
    durationSeconds: boundedSeconds(input.durationSeconds),
    readyState: boundedState(input.readyState, 4),
    networkState: boundedState(input.networkState, 3),
    errorCode: ERROR_CODES.has(input.errorCode as QueuePlaybackErrorCode) ? input.errorCode as QueuePlaybackErrorCode : null,
  };
  const clearing = lifecycleState === "cleared";
  const events = [...diagnostics.events, event].slice(-MAX_QUEUE_PLAYBACK_EVENTS);
  return {
    accepted: true,
    reason: "accepted",
    event,
    diagnostics: {
      schemaVersion: "queue_playback_lifecycle_v1",
      currentTrackId: clearing ? null : trackId,
      lifecycleState,
      lastEventAt: observedAt,
      lastErrorCode: event.eventType === "error" ? event.errorCode ?? "unknown" : input.eventType === "loaded" ? null : diagnostics.lastErrorCode,
      nextSequence: event.sequence + 1,
      events,
    },
  };
}

export function queuePlaybackProviderForSourceType(sourceType?: QueueSourceType | null): QueuePlaybackProvider {
  if (sourceType === "upload") return "audio";
  if (sourceType === "youtube") return "youtube";
  if (sourceType === "tiktok") return "tiktok";
  return "external";
}

export function queuePlaybackHasBegun(
  diagnostics: QueuePlaybackDiagnostics | null | undefined,
  trackId: string,
): boolean {
  return normalizeQueuePlaybackDiagnostics(diagnostics).events.some((event) => (
    event.trackId === trackId && (event.eventType === "play" || event.eventType === "resume")
  ));
}

function latestTrackEvent(diagnostics: QueuePlaybackDiagnostics | null | undefined, trackId: string): QueuePlaybackLifecycleEvent | null {
  const events = normalizeQueuePlaybackDiagnostics(diagnostics).events;
  return [...events].reverse().find((event) => event.trackId === trackId) ?? null;
}

function observedEndpoint(input: {
  trackId: string;
  expectedTrackId: string;
  playbackState: "playing" | "paused" | "stopped";
  currentTimeSeconds: number | null | undefined;
  durationSeconds: number | null | undefined;
  observedAt: string | null | undefined;
  now: Date;
  allowStale?: boolean;
}): { position: number; duration: number | null; observedAt: string } | null {
  if (input.trackId !== input.expectedTrackId) return null;
  const observedAt = validIso(input.observedAt);
  const position = boundedSeconds(input.currentTimeSeconds);
  const duration = boundedSeconds(input.durationSeconds);
  const nowMs = input.now.getTime();
  const observedAtMs = observedAt ? Date.parse(observedAt) : Number.NaN;
  if (!observedAt || position === null || !Number.isFinite(nowMs) || !Number.isFinite(observedAtMs)) return null;
  const ageMs = nowMs - observedAtMs;
  if (ageMs < -1_000 || (!input.allowStale && ageMs > QUEUE_PLAYBACK_ENDPOINT_FRESHNESS_MS)) return null;
  const projected = input.playbackState === "playing"
    ? position + Math.max(0, ageMs) / 1_000
    : position;
  const boundedPosition = Math.max(0, duration !== null && duration > 0 ? Math.min(projected, duration) : projected);
  return { position: Math.floor(boundedPosition), duration, observedAt };
}

function earlyCutoff(position: number | null, duration: number | null, endedNaturally: boolean, outcome: QueuePlaybackOutcome): boolean | null {
  if (outcome === "skipped") return true;
  if (outcome === "removed") return null;
  if (endedNaturally) return false;
  if (position === null || duration === null || duration <= 0) return null;
  const nearEndAllowance = Math.max(5, Math.min(15, duration * 0.02));
  return position < Math.max(0, duration - nearEndAllowance);
}

export function queuePlaybackOutcomeFields(
  diagnostics: QueuePlaybackDiagnostics | null | undefined,
  trackId: string,
  outcome: QueuePlaybackOutcome,
  options: QueuePlaybackOutcomeOptions = {},
): Pick<QueueEntry, "playbackOutcome" | "playbackEndedNaturally" | "playbackEarlyCutoff" | "playbackEndPositionSeconds" | "playbackEndPositionObservedAt" | "playbackObservedDurationSeconds" | "playbackIssueCode"> {
  const normalized = normalizeQueuePlaybackDiagnostics(diagnostics);
  const latest = latestTrackEvent(normalized, trackId);
  const endedNaturally = outcome === "finished" && latest?.eventType === "ended";
  const now = options.now ?? new Date();
  const snapshotEndpoint = options.snapshot
    ? observedEndpoint({
      trackId: options.snapshot.trackId,
      expectedTrackId: trackId,
      playbackState: options.snapshot.playbackState,
      currentTimeSeconds: options.snapshot.currentTimeSeconds,
      durationSeconds: options.snapshot.durationSeconds,
      observedAt: options.snapshot.observedAt,
      now,
    })
    : null;
  const lifecycleEndpoint = latest
    ? observedEndpoint({
      trackId: latest.trackId,
      expectedTrackId: trackId,
      playbackState: latest.lifecycleState === "playing" ? "playing" : latest.lifecycleState === "paused" ? "paused" : "stopped",
      currentTimeSeconds: latest.currentTimeSeconds,
      durationSeconds: latest.durationSeconds,
      observedAt: latest.observedAt,
      now,
      allowStale: latest.eventType === "ended",
    })
    : null;
  const endpoint = snapshotEndpoint ?? lifecycleEndpoint;
  const position = endpoint?.position ?? null;
  const duration = endpoint?.duration ?? (typeof latest?.durationSeconds === "number" ? latest.durationSeconds : null);
  const lastError = [...normalized.events].reverse().find((event) => event.trackId === trackId && event.eventType === "error")?.errorCode ?? null;
  return {
    playbackOutcome: outcome,
    playbackEndedNaturally: outcome === "removed" ? false : endedNaturally,
    playbackEarlyCutoff: earlyCutoff(position, duration, endedNaturally, outcome),
    playbackEndPositionSeconds: position,
    playbackEndPositionObservedAt: endpoint?.observedAt ?? null,
    playbackObservedDurationSeconds: duration,
    playbackIssueCode: lastError,
  };
}
