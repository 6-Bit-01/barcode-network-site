import type { LiveOverlayPlaybackState, LiveOverlaySyncCorrectionReason, LiveOverlayTikTokSync, LiveOverlayYouTubeSync, OverlayMode, ResolvedLiveOverlayScene, ResolvedLiveOverlayTrack, ResolvedWheelCeremonyScene, ResolvedWheelCeremonyTrack, WheelCeremonyStatus } from "./live-overlay-resolver";
import type { QueueSourceType } from "./queue-types";

export type OverlayReceiveFailure = "network" | "non_2xx" | "timeout" | "malformed_json" | "unexpected_scene" | "aborted";
export type OverlayTransportState = { scene: ResolvedLiveOverlayScene; connected: boolean; held: boolean; failureReason: OverlayReceiveFailure | null; generation: number };

const OVERLAY_MODES = { standby: true, now_playing: true, artist_card: true, wheel_ready: true, wheel_reencrypting: true, wheel_spinning: true, wheel_result: true, wheel_confirmed: true, sponsor: true, video_placeholder: true, system_message: true, session_active: true } satisfies Record<OverlayMode, true>;
const WHEEL_STATUSES = { idle: true, ready: true, reencrypting: true, spinning: true, result_pending: true, confirmed: true, cancelled: true, signal_lost: true } satisfies Record<WheelCeremonyStatus, true>;
const PLAYBACK_STATES = { playing: true, paused: true, stopped: true } satisfies Record<LiveOverlayPlaybackState, true>;
const CORRECTION_REASONS = { state_change: true, heartbeat: true, seek: true } satisfies Record<LiveOverlaySyncCorrectionReason, true>;
const SOURCE_TYPES = { upload: true, link: true, youtube: true, soundcloud: true, spotify: true, tiktok: true, other: true, unknown: true } satisfies Record<QueueSourceType | "unknown", true>;
const PRESENTATIONS = { standard: true, short: true } satisfies Record<"standard" | "short", true>;
const hasOwn = <T extends object>(record: T, key: unknown): key is keyof T => typeof key === "string" && Object.prototype.hasOwnProperty.call(record, key);

function str(value: unknown, required = true): value is string { return typeof value === "string" && (!required || value.trim().length > 0); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function nonNegativeInt(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function iso(value: unknown): value is string { if (!str(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value; }
function isoOpt(value: unknown): boolean { return value == null || iso(value); }
function strOpt(value: unknown): boolean { return value == null || typeof value === "string"; }
function stringArrayOpt(value: unknown): boolean { return value == null || (Array.isArray(value) && value.every((entry) => str(entry))); }
function safeRenderedUrl(value: unknown): boolean { if (value == null) return true; if (typeof value !== "string") return false; try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }

function trackOk(track: unknown): track is ResolvedLiveOverlayTrack {
  const t = track as Partial<ResolvedLiveOverlayTrack> | null;
  return Boolean(t && typeof t === "object" && strOpt(t.id) && str(t.artistName) && str(t.trackTitle) && hasOwn(SOURCE_TYPES, t.sourceType) && strOpt(t.durationLabel) && (t.youtubePresentation == null || hasOwn(PRESENTATIONS, t.youtubePresentation)));
}

function syncOk(sync: unknown, provider: "youtube"): sync is LiveOverlayYouTubeSync;
function syncOk(sync: unknown, provider: "tiktok"): sync is LiveOverlayTikTokSync;
function syncOk(sync: unknown, provider: "youtube" | "tiktok"): boolean {
  const s = sync as Record<string, unknown> | null;
  if (!s || typeof s !== "object" || s.provider !== provider) return false;
  const identity = provider === "youtube" ? (str(s.videoId) && /^[a-zA-Z0-9_-]{6,}$/.test(String(s.videoId))) : str(s.postId) && /^\d{8,32}$/.test(String(s.postId));
  return Boolean(identity && strOpt(s.trackId) && hasOwn(PLAYBACK_STATES, s.playbackState) && finite(s.currentTimeSeconds) && s.currentTimeSeconds >= 0 && iso(s.updatedAt) && (provider === "tiktok" ? s.muted === true : typeof s.muted === "boolean") && isoOpt(s.clientUpdatedAt) && (s.correctionReason == null || hasOwn(CORRECTION_REASONS, s.correctionReason)) && (provider !== "tiktok" || s.durationSeconds == null || (finite(s.durationSeconds) && s.durationSeconds >= 0)));
}

function candidateOk(candidate: unknown): candidate is ResolvedWheelCeremonyTrack {
  const c = candidate as Partial<ResolvedWheelCeremonyTrack> | null;
  return Boolean(c && typeof c === "object" && str(c.id) && str(c.artistName) && str(c.trackTitle) && stringArrayOpt(c.trackIds) && (c.trackCount == null || nonNegativeInt(c.trackCount)) && (c.weight == null || (finite(c.weight) && c.weight > 0)) && (c.tracks == null || (Array.isArray(c.tracks) && c.tracks.every(candidateOk))));
}

function wheelOk(wheel: unknown): wheel is ResolvedWheelCeremonyScene | undefined {
  if (wheel == null) return true;
  const w = wheel as Record<string, unknown> | null;
  if (!w || typeof w !== "object") return false;
  if (!hasOwn(WHEEL_STATUSES, w.status) || !hasOwn(WHEEL_STATUSES, w.storedStatus)) return false;
  if (!nonNegativeInt(w.candidateCount) || !nonNegativeInt(w.hiddenCandidateCount) || !Number.isSafeInteger(w.spinDurationMs) || Number(w.spinDurationMs) < 16000 || Number(w.spinDurationMs) > 32000) return false;
  if (!Array.isArray(w.displayCandidates) || !w.displayCandidates.every(candidateOk)) return false;
  if (w.resultTrack != null && !candidateOk(w.resultTrack)) return false;
  if (!strOpt(w.resultTrackId) || !strOpt(w.chosenTrackId) || !strOpt(w.seed) || !strOpt(w.previousSeed) || !strOpt(w.reencryptNonce) || !strOpt(w.reencryptCycleId) || !strOpt(w.winningSegmentId) || !strOpt(w.jingleKey) || !strOpt(w.audioPath)) return false;
  if (!isoOpt(w.startedAt) || !isoOpt(w.spinStartedAt) || !isoOpt(w.resultSelectedAt)) return false;
  if (!stringArrayOpt(w.candidateOrder) || !stringArrayOpt(w.previousCandidateOrder)) return false;
  for (const key of ["finalRotationDeg", "landingAngleDeg"] as const) if (w[key] != null && !finite(w[key])) return false;
  if (w.winningSegmentIndex != null && (!nonNegativeInt(w.winningSegmentIndex) || Number(w.winningSegmentIndex) >= Number(w.candidateCount))) return false;
  return true;
}

export function isResolvedLiveOverlayScene(value: unknown): value is ResolvedLiveOverlayScene {
  const s = value as Partial<ResolvedLiveOverlayScene> | null;
  if (!s || typeof s !== "object") return false;
  if (!hasOwn(OVERLAY_MODES, s.mode) || !hasOwn(OVERLAY_MODES, s.resolvedMode) || s.mode !== s.resolvedMode || !str(s.reason) || !str(s.title) || typeof s.automatic !== "boolean" || typeof s.overrideActive !== "boolean" || typeof s.wheelOverlayActive !== "boolean" || !finite(s.priority) || !nonNegativeInt(s.wheelSpinsOwed) || !iso(s.updatedAt)) return false;
  if (!strOpt(s.subtitle) || !strOpt(s.message) || !safeRenderedUrl(s.artworkUrl) || !safeRenderedUrl(s.sourceUrl) || !safeRenderedUrl(s.videoUrl)) return false;
  if ((s.mode === "now_playing" || s.mode === "artist_card") && !trackOk(s.track)) return false;
  if (s.track != null && !trackOk(s.track)) return false;
  if (s.youtube != null && !syncOk(s.youtube, "youtube")) return false;
  if (s.tiktok != null && !syncOk(s.tiktok, "tiktok")) return false;
  if (s.youtube != null && s.tiktok != null) return false;
  if (s.youtube != null && (s.mode !== "now_playing" || s.track?.sourceType !== "youtube")) return false;
  if (s.tiktok != null && (s.mode !== "now_playing" || s.track?.sourceType !== "tiktok")) return false;
  if (s.youtube != null && typeof s.youtube.trackId === "string" && s.track?.id && s.youtube.trackId !== s.track.id) return false;
  if (s.tiktok != null && typeof s.tiktok.trackId === "string" && s.track?.id && s.tiktok.trackId !== s.track.id) return false;
  const wheelMode = s.mode === "wheel_ready" || s.mode === "wheel_reencrypting" || s.mode === "wheel_spinning" || s.mode === "wheel_result" || s.mode === "wheel_confirmed";
  if (wheelMode && !s.wheelCeremony) return false;
  if (!wheelMode && s.wheelCeremony) return false;
  if (s.wheelOverlayActive !== wheelMode) return false;
  if (!wheelOk(s.wheelCeremony)) return false;
  if (s.wheelCeremony) {
    const status = s.wheelCeremony.status;
    const compatible = s.mode === "wheel_ready" ? status === "ready" : s.mode === "wheel_reencrypting" ? status === "reencrypting" : s.mode === "wheel_spinning" ? status === "spinning" : s.mode === "wheel_result" ? status === "result_pending" : s.mode === "wheel_confirmed" ? status === "confirmed" : true;
    if (!compatible) return false;
  }
  return true;
}

export function extractOverlayScene(payload: unknown): ResolvedLiveOverlayScene { const scene = (payload as { scene?: unknown } | null)?.scene ?? payload; if (!isResolvedLiveOverlayScene(scene)) throw new Error("unexpected_scene"); return scene; }
export function reduceOverlaySuccess(previous: OverlayTransportState, scene: ResolvedLiveOverlayScene, generation: number): OverlayTransportState { return generation < previous.generation ? previous : { scene, connected: true, held: false, failureReason: null, generation }; }
export function reduceOverlayFailure(previous: OverlayTransportState, reason: OverlayReceiveFailure, generation: number): OverlayTransportState { return generation < previous.generation ? previous : { ...previous, connected: false, held: true, failureReason: reason, generation }; }

export type WheelAudioAttemptResult = { notice: string | null; attempts: string[]; played: boolean; blocked: boolean };
export async function playWheelSpinWithFallback(paths: string[], play: (path: string, generation: number) => Promise<void>, generation: number, isCurrent: (generation: number) => boolean): Promise<WheelAudioAttemptResult> { const attempts = paths.slice(0, 2); for (const path of attempts) { if (!isCurrent(generation)) return { notice: null, attempts, played: false, blocked: false }; try { await play(path, generation); if (!isCurrent(generation)) return { notice: null, attempts, played: false, blocked: false }; return { notice: null, attempts, played: true, blocked: false }; } catch (error) { const blocked = error instanceof DOMException && error.name === "NotAllowedError"; if (blocked) return { notice: "WHEEL AUDIO BLOCKED — CLICK ENABLE AUDIO", attempts: [path], played: false, blocked: true }; } } return { notice: "WHEEL SPIN AUDIO UNAVAILABLE — CEREMONY CONTINUES SILENTLY", attempts, played: false, blocked: false }; }

export type WheelAudioLike = { src: string; loop: boolean; volume: number; currentTime: number; pause: () => void; play: () => Promise<void> };
export function terminateWheelSpinAudio(audio: WheelAudioLike | null, options: { volume: number; clearSource?: boolean } = { volume: 1 }): void { if (!audio) return; audio.pause(); audio.currentTime = 0; audio.volume = options.volume; audio.loop = false; if (options.clearSource) audio.src = ""; }
