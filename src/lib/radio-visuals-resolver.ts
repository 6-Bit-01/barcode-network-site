import type { LiveOverlayPlayerSync, LiveOverlayPlaybackState, ResolvedLiveOverlayScene } from "./live-overlay-resolver";
import { YOUTUBE_SYNC_STALE_AFTER_MS } from "./live-overlay-resolver";
import type { QueueSourceType, QueueState } from "./queue-types";
import { hasActiveQueueSession } from "./session-bound-polling";

export type RadioVisualsShowStage = "standby" | "intake" | "early" | "middle" | "late" | "final" | "complete";
export type RadioVisualsMode = "standby" | "queue" | "track" | "wheel" | "sponsor" | "system";

export interface RadioVisualsTrack {
  artistName: string;
  trackTitle: string;
  sourceType: QueueSourceType | "unknown";
}

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
  currentPosition: number;
  progress: number;
  pressure: "low" | "medium" | "high" | "max";
}

export interface RadioVisualsSnapshot {
  sessionActive: boolean;
  showStage: RadioVisualsShowStage;
  visualMode: RadioVisualsMode;
  scene: {
    mode: ResolvedLiveOverlayScene["mode"];
    title: string;
    subtitle?: string;
    message?: string;
  };
  queue: RadioVisualsQueueSignal;
  track: RadioVisualsTrack | null;
  player: RadioVisualsPlayerSignal | null;
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
  playerSync?: LiveOverlayPlayerSync | null;
  now?: Date;
}): RadioVisualsSnapshot {
  const { queueState, scene, playerSync = null, now = new Date() } = input;
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
  const currentPosition = acceptedCount > 0
    ? Math.min(acceptedCount, completedCount + (currentTrackId ? 1 : 0))
    : 0;
  const showStage = showStageForState(queueState, sessionActive, progress);
  const visualMode = visualModeForScene(scene, sessionActive);
  const track = scene.track ? {
    artistName: scene.track.artistName,
    trackTitle: scene.track.trackTitle,
    sourceType: scene.track.sourceType,
  } : null;
  const player = visualMode === "track"
    ? playerSignalForScene({ scene, playerSync, currentTrackId, now })
    : null;
  const seedIdentity = track
    ? `${track.artistName}:${track.trackTitle}:${track.sourceType}`
    : `${visualMode}:${showStage}:${acceptedCount}:${completedCount}`;

  return {
    sessionActive,
    showStage,
    visualMode,
    scene: {
      mode: scene.mode,
      title: scene.title,
      subtitle: scene.subtitle,
      message: scene.message,
    },
    queue: {
      acceptedCount,
      completedCount,
      activeCount,
      remainingCount,
      currentPosition,
      progress,
      pressure: queueState.publicStatus?.pressure ?? "low",
    },
    track,
    player,
    visualSeed: hashVisualSeed(seedIdentity),
    updatedAt: scene.updatedAt || now.toISOString(),
  };
}
