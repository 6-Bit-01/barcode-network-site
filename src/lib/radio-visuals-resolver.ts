import type { LiveOverlayPlayerSync, LiveOverlayPlaybackState, ResolvedLiveOverlayScene } from "./live-overlay-resolver";
import { YOUTUBE_SYNC_STALE_AFTER_MS } from "./live-overlay-resolver";
import type { LiveOverlayState } from "./live-overlay";
import type { RadioVisualCue } from "./radio-visuals-cues";
import { activeRadioVisualCue } from "./radio-visuals-cues";
import type { QueueState } from "./queue-types";
import { hasActiveQueueSession } from "./session-bound-polling";

export type RadioVisualsShowStage = "standby" | "intake" | "early" | "middle" | "late" | "final" | "complete";
export type RadioVisualsMode = "standby" | "queue" | "track" | "wheel" | "sponsor" | "system";

export interface RadioVisualsPlayerSignal {
  provider: LiveOverlayPlayerSync["provider"];
  playbackState: LiveOverlayPlaybackState;
  currentTimeSeconds: number;
  durationSeconds?: number;
  updatedAt: string;
  /** Reserved for a future first-party audio-analysis bridge. Null means timeline-reactive only. */
  audioEnergy: number | null;
}

export interface RadioVisualsQueueSignal {
  acceptedCount: number;
  completedCount: number;
  activeCount: number;
  remainingCount: number;
  progress: number;
  pressure: "low" | "medium" | "high" | "max";
}

export interface RadioVisualsSnapshot {
  sessionActive: boolean;
  showStage: RadioVisualsShowStage;
  visualMode: RadioVisualsMode;
  sceneMode: ResolvedLiveOverlayScene["mode"];
  queue: RadioVisualsQueueSignal;
  player: RadioVisualsPlayerSignal | null;
  cue: RadioVisualCue | null;
  visualSeed: number;
  updatedAt: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function hashVisualSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function visualModeForScene(scene: ResolvedLiveOverlayScene, sessionActive: boolean): RadioVisualsMode {
  if (!sessionActive || scene.mode === "standby") return "standby";
  if (scene.mode.startsWith("wheel_")) return "wheel";
  if (scene.mode === "sponsor") return "sponsor";
  if (scene.mode === "system_message" || scene.mode === "video_placeholder") return "system";
  if (scene.mode === "now_playing" || scene.mode === "artist_card") return "track";
  return "queue";
}

function showStageForState(queueState: QueueState, sessionActive: boolean, progress: number): RadioVisualsShowStage {
  if (!sessionActive) return "standby";
  const session = queueState.session;
  if (session?.broadcastPhase === "ended") return "complete";
  if (session?.showStarted !== true && session?.broadcastPhase !== "broadcast_active") return "intake";
  if (progress < 0.25) return "early";
  if (progress < 0.6) return "middle";
  if (progress < 0.85) return "late";
  return "final";
}

function playerSignalForScene(input: {
  scene: ResolvedLiveOverlayScene;
  playerSync?: LiveOverlayPlayerSync | null;
  currentTrackId?: string | null;
  now: Date;
}): RadioVisualsPlayerSignal | null {
  const { scene, playerSync, currentTrackId, now } = input;
  const candidate: LiveOverlayPlayerSync | null = scene.youtube ?? scene.tiktok
    ?? (playerSync?.provider === "audio" ? playerSync : null);
  if (!candidate || !currentTrackId) return null;
  if (candidate.trackId && candidate.trackId !== currentTrackId) return null;
  const updatedAtMs = new Date(candidate.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs) || now.getTime() - updatedAtMs > YOUTUBE_SYNC_STALE_AFTER_MS) return null;
  return {
    provider: candidate.provider,
    playbackState: candidate.playbackState,
    currentTimeSeconds: Math.max(0, candidate.currentTimeSeconds),
    durationSeconds: candidate.durationSeconds,
    updatedAt: candidate.updatedAt,
    audioEnergy: null,
  };
}

export function resolveRadioVisualsSnapshot(input: {
  queueState: QueueState;
  scene: ResolvedLiveOverlayScene;
  overlayState?: LiveOverlayState | null;
  playerSync?: LiveOverlayPlayerSync | null;
  now?: Date;
}): RadioVisualsSnapshot {
  const { queueState, scene, overlayState = null, playerSync = null, now = new Date() } = input;
  const sessionActive = hasActiveQueueSession(queueState);
  const completedCount = nonNegativeInteger(queueState.session?.completedCount ?? queueState.totalPlayed);
  const activeCount = nonNegativeInteger(queueState.session?.activeCount ?? queueState.publicStatus?.activeCount);
  const acceptedCount = Math.max(
    completedCount + activeCount,
    nonNegativeInteger(queueState.session?.acceptedCount ?? queueState.publicStatus?.acceptedCount),
  );
  const remainingCount = Math.max(0, acceptedCount - completedCount);
  const progress = acceptedCount > 0 ? clamp(completedCount / acceptedCount, 0, 1) : 0;
  const currentTrackId = queueState.nowPlaying?.id ?? queueState.loadedTrack?.id ?? null;
  const showStage = showStageForState(queueState, sessionActive, progress);
  const visualMode = visualModeForScene(scene, sessionActive);
  const player = visualMode === "track"
    ? playerSignalForScene({ scene, playerSync, currentTrackId, now })
    : null;
  const trackIdentity = scene.track
    ? `${scene.track.artistName}:${scene.track.trackTitle}:${scene.track.sourceType}`
    : `${visualMode}:${showStage}:${acceptedCount}:${completedCount}`;
  const cue = sessionActive && overlayState ? activeRadioVisualCue({
    type: overlayState.visualCueType,
    startedAt: overlayState.visualCueStartedAt,
    expiresAt: overlayState.visualCueExpiresAt,
    nonce: overlayState.visualCueNonce,
  }, now) : null;

  return {
    sessionActive,
    showStage,
    visualMode,
    sceneMode: scene.mode,
    queue: {
      acceptedCount,
      completedCount,
      activeCount,
      remainingCount,
      progress,
      pressure: queueState.publicStatus?.pressure ?? "low",
    },
    player,
    cue,
    visualSeed: hashVisualSeed(trackIdentity),
    updatedAt: scene.updatedAt || now.toISOString(),
  };
}
