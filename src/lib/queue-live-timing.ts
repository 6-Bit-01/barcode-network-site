import { getTrackRuntimeSeconds } from "./queue-types";
import type { LiveOverlayPlayerSync, LiveOverlayState } from "./live-overlay";
import type { QueueEntry, QueuePlaybackTiming, QueueWheelTiming } from "./queue-types";

const WHEEL_CEREMONY_SECONDS = 120;
const ACTIVE_WHEEL_STATUSES = new Set(["ready", "reencrypting", "spinning", "result_pending"]);
type QueuePlaybackTrack = Pick<QueueEntry, "id" | "detectedDurationSeconds" | "estimatedDurationSeconds"> & Partial<Pick<QueueEntry, "playedAt">>;

function validSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function buildQueuePlaybackTiming(
  nowPlaying: QueuePlaybackTrack | null | undefined,
  playerSync: LiveOverlayPlayerSync | null | undefined,
  now = new Date(),
): QueuePlaybackTiming | null {
  if (!nowPlaying) return null;
  const storedDuration = getTrackRuntimeSeconds(nowPlaying);
  const syncMatches = Boolean(playerSync?.trackId && playerSync.trackId === nowPlaying.id);
  if (playerSync && syncMatches) {
    const durationSeconds = validSeconds(playerSync.durationSeconds) || storedDuration || null;
    return {
      trackId: nowPlaying.id,
      playbackState: playerSync.playbackState,
      currentTimeSeconds: validSeconds(playerSync.currentTimeSeconds) ?? 0,
      durationSeconds,
      observedAt: validDate(playerSync.updatedAt) ?? now.toISOString(),
      source: "player_sync",
    };
  }
  return {
    trackId: nowPlaying.id,
    playbackState: "stopped",
    currentTimeSeconds: 0,
    durationSeconds: storedDuration || null,
    observedAt: validDate(nowPlaying.playedAt) ?? now.toISOString(),
    source: "loaded_clock",
  };
}

export function buildQueueWheelTiming(
  spinsOwedInput: number | null | undefined,
  overlayState: LiveOverlayState | null | undefined,
  now = new Date(),
): QueueWheelTiming {
  const spinsOwed = Number.isFinite(spinsOwedInput) ? Math.max(0, Math.floor(spinsOwedInput ?? 0)) : 0;
  const status = overlayState?.wheelCeremonyStatus ?? "idle";
  const startedAt = validDate(overlayState?.wheelCeremonyStartedAt ?? overlayState?.wheelOverlayLaunchedAt);
  const active = spinsOwed > 0 && ACTIVE_WHEEL_STATUSES.has(status) && startedAt !== null;
  const elapsedSeconds = active ? Math.max(0, Math.floor((now.getTime() - Date.parse(startedAt)) / 1000)) : 0;
  const remainingSeconds = active
    ? Math.max(0, WHEEL_CEREMONY_SECONDS - elapsedSeconds) + Math.max(0, spinsOwed - 1) * WHEEL_CEREMONY_SECONDS
    : spinsOwed * WHEEL_CEREMONY_SECONDS;
  return { status, startedAt, observedAt: now.toISOString(), remainingSeconds, spinsOwed };
}

export function attachQueueLiveTiming<T extends { nowPlaying?: QueuePlaybackTrack | null; session?: { wheelSpinsOwed?: number | null } | null }>(
  value: T,
  playerSync: LiveOverlayPlayerSync | null | undefined,
  overlayState: LiveOverlayState | null | undefined,
  now = new Date(),
): T & { playbackTiming: QueuePlaybackTiming | null; wheelTiming: QueueWheelTiming } {
  return {
    ...value,
    playbackTiming: buildQueuePlaybackTiming(value.nowPlaying, playerSync, now),
    wheelTiming: buildQueueWheelTiming(value.session?.wheelSpinsOwed, overlayState, now),
  };
}
