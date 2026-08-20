import type { LiveOverlayPlayerSync, LiveOverlayPlaybackState, ResolvedLiveOverlayScene } from "./live-overlay-resolver";
import { normalizeRadioVisualAudioAnalysis, YOUTUBE_SYNC_STALE_AFTER_MS } from "./live-overlay-resolver";
import type { LiveOverlayState } from "./live-overlay";
import type { RadioVisualCue } from "./radio-visuals-cues";
import { activeRadioVisualCue } from "./radio-visuals-cues";
import { activeRadioVisualEvent, hashRadioVisualToken } from "./radio-visuals-events";
import type { RadioVisualEvent, RadioVisualEventType } from "./radio-visuals-events";
import type { QueueBroadcastPhase, QueueEntry, QueueState, SponsorBreakStatus } from "./queue-types";
import { hasActiveQueueSession } from "./session-bound-polling";

export type RadioVisualsShowStage = "standby" | "intake" | "early" | "middle" | "late" | "final" | "complete";
export type RadioVisualsMode = "standby" | "queue" | "track" | "wheel" | "sponsor" | "system";

export interface RadioVisualsPlayerSignal {
  provider: LiveOverlayPlayerSync["provider"];
  playbackState: LiveOverlayPlaybackState;
  currentTimeSeconds: number;
  durationSeconds?: number;
  updatedAt: string;
  /** Direct first-party player analysis when available. Null means timeline-reactive only. */
  audioEnergy: number | null;
  audioBands: { bass: number; mid: number; treble: number } | null;
  audioPeak: number | null;
}

export interface RadioVisualsQueueSignal {
  acceptedCount: number;
  completedCount: number;
  activeCount: number;
  remainingCount: number;
  progress: number;
  pressure: "low" | "medium" | "high" | "max";
}

export interface RadioVisualsShowSignals {
  intakeOpen: boolean;
  wheelSpinsOwed: number;
  sponsorStatus: SponsorBreakStatus | null;
  broadcastPhase: QueueBroadcastPhase | null;
}

export interface RadioVisualsSnapshot {
  sessionActive: boolean;
  showStage: RadioVisualsShowStage;
  visualMode: RadioVisualsMode;
  sceneMode: ResolvedLiveOverlayScene["mode"];
  queue: RadioVisualsQueueSignal;
  signals: RadioVisualsShowSignals;
  player: RadioVisualsPlayerSignal | null;
  cue: RadioVisualCue | null;
  events: RadioVisualEvent[];
  visualSeed: number;
  updatedAt: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function uniqueEntries(entries: Array<QueueEntry | null | undefined>): QueueEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry): entry is QueueEntry => {
    if (!entry || entry.isTestTrack || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function allQueueEntries(state: QueueState): QueueEntry[] {
  return uniqueEntries([
    state.nowPlaying,
    state.loadedTrack,
    state.nextInLine,
    ...state.queue,
    ...state.history,
    ...(state.removed ?? []),
  ]);
}

function eventCandidate(type: RadioVisualEventType, occurredAt: string | null | undefined, nonce: string, now: Date): RadioVisualEvent | null {
  return activeRadioVisualEvent({ type, occurredAt, nonce }, now);
}

function priorityEvents(state: QueueState, now: Date): RadioVisualEvent[] {
  return allQueueEntries(state).flatMap((entry) => {
    const events: RadioVisualEvent[] = [];
    const sentAt = entry.priorityUpgradeCheckoutCreatedAt ?? entry.priorityUpgradeRequestedAt ?? null;
    const sent = eventCandidate("priority_sent", sentAt, `${entry.id}:sent`, now);
    if (sent) events.push(sent);
    if (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "paid_needs_attention" || entry.priorityUpgradeStatus === "manual") {
      const confirmedAt = entry.priorityUpgradePaidAt ?? entry.priorityUpgradeAt ?? entry.priorityUpgradeRequestedAt ?? null;
      const confirmed = eventCandidate("priority_confirmed", confirmedAt, `${entry.id}:confirmed`, now);
      if (confirmed) events.push(confirmed);
    }
    return events;
  });
}

function playbackEvents(state: QueueState, now: Date): RadioVisualEvent[] {
  return (state.playbackDiagnostics?.events ?? []).slice(-8).flatMap((event) => {
    const type = event.eventType === "play" || event.eventType === "resume"
      ? "track_started"
      : event.eventType === "skip"
        ? "track_skipped"
        : null;
    if (!type) return [];
    const projected = eventCandidate(type, event.observedAt, `${event.trackId}:${event.sequence}`, now);
    return projected ? [projected] : [];
  });
}

function stateEvents(state: QueueState, scene: ResolvedLiveOverlayScene, now: Date): RadioVisualEvent[] {
  const session = state.session;
  const events: Array<RadioVisualEvent | null> = [
    eventCandidate("show_started", session?.broadcastStartedAt, `show:${session?.broadcastStartedAt ?? ""}`, now),
  ];
  if (session?.sponsorBreakStatus === "due") events.push(eventCandidate("sponsor_due", session.updatedAt, `sponsor:due:${session.updatedAt}`, now));
  if (session?.sponsorBreakStatus === "running") events.push(eventCandidate("sponsor_started", session.sponsorBreakStartedAt, `sponsor:start:${session.sponsorBreakStartedAt ?? ""}`, now));
  if (session?.sponsorBreakStatus === "completed") events.push(eventCandidate("sponsor_completed", session.sponsorBreakCompletedAt, `sponsor:end:${session.sponsorBreakCompletedAt ?? ""}`, now));
  if (scene.mode === "wheel_ready") events.push(eventCandidate("wheel_launched", scene.updatedAt, `wheel:launch:${scene.updatedAt}`, now));
  if (scene.mode === "wheel_spinning" || scene.mode === "wheel_reencrypting") events.push(eventCandidate("wheel_spinning", scene.updatedAt, `wheel:spin:${scene.updatedAt}`, now));
  return events.filter((event): event is RadioVisualEvent => Boolean(event));
}

function recentVisualEvents(state: QueueState, scene: ResolvedLiveOverlayScene, now: Date): RadioVisualEvent[] {
  const deduplicated = new Map<string, RadioVisualEvent>();
  for (const event of [...priorityEvents(state, now), ...playbackEvents(state, now), ...stateEvents(state, scene, now)]) {
    deduplicated.set(`${event.type}:${event.occurredAt}:${event.seed}`, event);
  }
  return [...deduplicated.values()]
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    .slice(-6);
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
  const audioAnalysis = candidate.provider === "audio" ? normalizeRadioVisualAudioAnalysis(candidate.audioAnalysis) : null;
  return {
    provider: candidate.provider,
    playbackState: candidate.playbackState,
    currentTimeSeconds: Math.max(0, candidate.currentTimeSeconds),
    durationSeconds: candidate.durationSeconds,
    updatedAt: candidate.updatedAt,
    audioEnergy: audioAnalysis?.energy ?? null,
    audioBands: audioAnalysis ? { bass: audioAnalysis.bass, mid: audioAnalysis.mid, treble: audioAnalysis.treble } : null,
    audioPeak: audioAnalysis?.peak ?? null,
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
    signals: {
      intakeOpen: queueState.publicStatus?.isOpen ?? queueState.session?.queueOpen ?? false,
      wheelSpinsOwed: nonNegativeInteger(queueState.session?.wheelSpinsOwed ?? scene.wheelSpinsOwed),
      sponsorStatus: queueState.session?.sponsorBreakStatus ?? null,
      broadcastPhase: queueState.session?.broadcastPhase ?? null,
    },
    player,
    cue,
    events: sessionActive ? recentVisualEvents(queueState, scene, now) : [],
    visualSeed: hashRadioVisualToken(trackIdentity),
    updatedAt: scene.updatedAt || now.toISOString(),
  };
}
