import { MAX_QUEUE_PLAYBACK_EVENTS, normalizeQueuePlaybackDiagnostics } from "./queue-playback-lifecycle";
import type { QueueEntry, QueuePlaybackErrorCode, QueuePlaybackOutcome, QueueSourceType, QueueState } from "./queue-types";

export const MAX_DIAGNOSTIC_TRACKS = 64;

type DiagnosticTrack = {
  trackId: string;
  artist: string;
  title: string;
  sourceType: QueueSourceType;
  lane: string;
  status: string;
  mediaType: "mp3" | "wav" | "provider" | "external" | "unknown";
  fileSizeBytes: number | null;
  detectedDurationSeconds: number | null;
  estimatedDurationSeconds: number | null;
  durationIsEstimate: boolean;
  playbackOutcome: QueuePlaybackOutcome | null;
  playbackEndedNaturally: boolean | null;
  playbackEarlyCutoff: boolean | null;
  playbackEndPositionSeconds: number | null;
  playbackObservedDurationSeconds: number | null;
  playbackIssueCode: QueuePlaybackErrorCode | null;
};

function safeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "Unknown";
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[redacted-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:cs|pi|pm|ch|in|sub)_[A-Za-z0-9_=-]{6,}\b/gi, "[redacted-payment-id]")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Unknown").slice(0, maxLength);
}

function mediaType(entry: QueueEntry): DiagnosticTrack["mediaType"] {
  const mime = entry.mimeType?.toLowerCase() ?? "";
  if (mime === "audio/mpeg" || mime === "audio/mp3") return "mp3";
  if (mime === "audio/wav" || mime === "audio/wave" || mime === "audio/x-wav") return "wav";
  if (entry.sourceType === "youtube" || entry.sourceType === "tiktok" || entry.sourceType === "spotify" || entry.sourceType === "soundcloud") return "provider";
  if (entry.sourceType === "link" || entry.sourceType === "other") return "external";
  return "unknown";
}

function diagnosticTrack(entry: QueueEntry): DiagnosticTrack {
  return {
    trackId: entry.id,
    artist: safeText(entry.submittedArtistName ?? entry.artist, 160),
    title: safeText(entry.submittedSongTitle ?? entry.title, 240),
    sourceType: entry.sourceType ?? "other",
    lane: entry.lane ?? "regular",
    status: entry.status,
    mediaType: mediaType(entry),
    fileSizeBytes: typeof entry.fileSize === "number" && Number.isFinite(entry.fileSize) ? Math.max(0, Math.round(entry.fileSize)) : null,
    detectedDurationSeconds: typeof entry.detectedDurationSeconds === "number" && Number.isFinite(entry.detectedDurationSeconds) ? entry.detectedDurationSeconds : null,
    estimatedDurationSeconds: typeof entry.estimatedDurationSeconds === "number" && Number.isFinite(entry.estimatedDurationSeconds) ? entry.estimatedDurationSeconds : null,
    durationIsEstimate: entry.durationIsEstimate !== false,
    playbackOutcome: entry.playbackOutcome ?? null,
    playbackEndedNaturally: typeof entry.playbackEndedNaturally === "boolean" ? entry.playbackEndedNaturally : null,
    playbackEarlyCutoff: typeof entry.playbackEarlyCutoff === "boolean" ? entry.playbackEarlyCutoff : null,
    playbackEndPositionSeconds: typeof entry.playbackEndPositionSeconds === "number" && Number.isFinite(entry.playbackEndPositionSeconds) ? entry.playbackEndPositionSeconds : null,
    playbackObservedDurationSeconds: typeof entry.playbackObservedDurationSeconds === "number" && Number.isFinite(entry.playbackObservedDurationSeconds) ? entry.playbackObservedDurationSeconds : null,
    playbackIssueCode: entry.playbackIssueCode ?? null,
  };
}

function uniqueDiagnosticTracks(state: QueueState): DiagnosticTrack[] {
  const entries = [
    ...(state.nowPlaying ? [state.nowPlaying] : []),
    ...(state.nextInLine ? [state.nextInLine] : []),
    ...state.queue,
    ...state.history,
    ...(state.removed ?? []),
  ];
  const seen = new Set<string>();
  const tracks: DiagnosticTrack[] = [];
  for (const entry of entries) {
    if (!entry?.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    tracks.push(diagnosticTrack(entry));
    if (tracks.length >= MAX_DIAGNOSTIC_TRACKS) break;
  }
  return tracks;
}

export function buildQueuePlaybackDiagnosticExport(state: QueueState, generatedAt = new Date()) {
  const lifecycle = normalizeQueuePlaybackDiagnostics(state.playbackDiagnostics);
  return {
    schemaVersion: "barcode_queue_playback_diagnostics_v1" as const,
    generatedAt: generatedAt.toISOString(),
    bounds: {
      lifecycleEventLimit: MAX_QUEUE_PLAYBACK_EVENTS,
      trackLimit: MAX_DIAGNOSTIC_TRACKS,
    },
    session: state.session ? {
      sessionId: state.session.sessionId,
      title: safeText(state.session.title, 240),
      showDate: state.session.showDate,
      status: state.session.status,
      broadcastPhase: state.session.broadcastPhase ?? null,
      revision: state.revision ?? null,
    } : null,
    counts: {
      accepted: state.session?.acceptedCount ?? null,
      active: state.session?.activeCount ?? null,
      completed: state.session?.completedCount ?? state.totalPlayed,
      removed: state.session?.removedCount ?? state.removed?.length ?? 0,
    },
    liveTiming: state.playbackTiming ? {
      trackId: state.playbackTiming.trackId,
      playbackState: state.playbackTiming.playbackState,
      currentTimeSeconds: state.playbackTiming.currentTimeSeconds,
      durationSeconds: state.playbackTiming.durationSeconds,
      observedAt: state.playbackTiming.observedAt,
      source: state.playbackTiming.source,
    } : null,
    lifecycle,
    tracks: uniqueDiagnosticTracks(state),
    privacy: {
      rawUrlsIncluded: false,
      contactFieldsIncluded: false,
      paymentFieldsIncluded: false,
      privateUploadLocationsIncluded: false,
    },
  };
}
