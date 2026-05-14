import type { QueueSourceType, SponsorBreakStatus } from "./queue-types";

export type OverlayMode = "standby" | "now_playing" | "artist_card" | "wheel_ready" | "wheel_reencrypting" | "wheel_spinning" | "wheel_result" | "wheel_confirmed" | "sponsor" | "video_placeholder" | "system_message" | "session_active";
export type WheelOverlayStatus = "ready" | "intro" | "active" | "complete";
export type WheelCeremonyStatus = "idle" | "ready" | "reencrypting" | "spinning" | "result_pending" | "confirmed" | "cancelled";

export interface LiveOverlayTrackInput {
  id?: string;
  artist?: string;
  title?: string;
  submittedArtistName?: string;
  submittedSongTitle?: string;
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
  sourceType?: QueueSourceType | "unknown";
  sourceArtworkUrl?: string | null;
  link?: string | null;
  durationLabel?: string;
  youtubeVideoId?: string | null;
}

export interface LiveOverlayWheelCandidateInput {
  id?: string;
  artistName?: string;
  trackTitle?: string;
  artist?: string;
  title?: string;
  submittedArtistName?: string;
  submittedSongTitle?: string;
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
}

export interface LiveOverlayStateInput {
  mode?: OverlayMode;
  title?: string;
  subtitle?: string;
  message?: string;
  artistName?: string;
  trackTitle?: string;
  artworkUrl?: string | null;
  sourceUrl?: string | null;
  sponsorLabel?: string;
  videoUrl?: string;
  systemMessageActive?: boolean;
  systemMessageTitle?: string;
  systemMessage?: string;
  videoPlaceholderActive?: boolean;
  wheelOverlayActive?: boolean;
  wheelOverlayLaunchedAt?: string;
  wheelOverlayStatus?: WheelOverlayStatus;
  wheelCeremonyStatus?: WheelCeremonyStatus;
  wheelCeremonyStartedAt?: string;
  wheelCeremonySpinStartedAt?: string;
  wheelCeremonyResultTrackId?: string;
  wheelCeremonyResultSelectedAt?: string;
  wheelCeremonySeed?: string;
  wheelCeremonyJingleKey?: string;
  wheelCeremonySpinDurationMs?: number;
  updatedAt?: string;
}

export interface LiveOverlaySessionInput {
  sessionId?: string;
  title?: string;
  status?: string;
  queueOpen?: boolean;
  broadcastPhase?: string;
  wheelSpinsOwed?: number;
  sponsorBreakStatus?: SponsorBreakStatus;
}

export type LiveOverlayPlaybackState = "playing" | "paused" | "stopped";

export interface LiveOverlayYouTubeSync {
  provider: "youtube";
  videoId: string;
  trackId?: string;
  playbackState: LiveOverlayPlaybackState;
  currentTimeSeconds: number;
  updatedAt: string;
  muted: boolean;
}

export interface ResolveLiveOverlaySceneInput {
  overlayState?: LiveOverlayStateInput | null;
  currentSession?: LiveOverlaySessionInput | null;
  nowPlaying?: LiveOverlayTrackInput | null;
  upNext?: LiveOverlayTrackInput | null;
  playerSync?: LiveOverlayYouTubeSync | null;
  wheelCandidates?: LiveOverlayWheelCandidateInput[];
  wheelSpinsOwed?: number;
  sponsorBreakStatus?: SponsorBreakStatus;
  broadcastPhase?: string;
  queueOpen?: boolean;
  now?: Date;
}

export interface ResolvedLiveOverlayTrack {
  id?: string;
  artistName: string;
  trackTitle: string;
  sourceType: QueueSourceType | "unknown";
  durationLabel?: string;
}

export interface ResolvedWheelCeremonyTrack {
  id: string;
  artistName: string;
  trackTitle: string;
}

export interface ResolvedWheelCeremonyScene {
  status: WheelCeremonyStatus;
  storedStatus: WheelCeremonyStatus;
  candidateCount: number;
  displayCandidates: ResolvedWheelCeremonyTrack[];
  hiddenCandidateCount: number;
  resultTrack?: ResolvedWheelCeremonyTrack | null;
  resultTrackId?: string;
  startedAt?: string;
  spinStartedAt?: string;
  resultSelectedAt?: string;
  seed?: string;
  jingleKey?: string;
  spinDurationMs: number;
}

export interface ResolvedLiveOverlayScene {
  mode: OverlayMode;
  resolvedMode: OverlayMode;
  reason: string;
  title: string;
  subtitle?: string;
  message?: string;
  track?: ResolvedLiveOverlayTrack | null;
  artworkUrl?: string | null;
  sourceUrl?: string | null;
  videoUrl?: string;
  youtube?: LiveOverlayYouTubeSync;
  wheelCeremony?: ResolvedWheelCeremonyScene;
  priority: number;
  automatic: boolean;
  overrideActive: boolean;
  wheelOverlayActive: boolean;
  wheelSpinsOwed: number;
  updatedAt: string;
}

const MAX_URL_LENGTH = 600;
const BLOCKED_HOSTS = ["drive.google.com", "dropbox.com", "wetransfer.com", "bit.ly", "tinyurl.com", "t.co", "goo.gl", "private.blob.vercel-storage.com"];
const DEFAULT_WHEEL_SPIN_DURATION_MS = 24000;
const MIN_WHEEL_SPIN_DURATION_MS = 16000;
const MAX_WHEEL_SPIN_DURATION_MS = 32000;
const WHEEL_REENCRYPTING_MS = 2500;
const WHEEL_CONFIRMED_RETURN_MS = 2200;
const MAX_WHEEL_DISPLAY_CANDIDATES = 32;

export function safeLiveOverlayUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_URL_LENGTH);
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function cleanDisplay(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function displayArtist(track: LiveOverlayTrackInput | LiveOverlayWheelCandidateInput): string {
  return cleanDisplay(track.detectedArtistName) || cleanDisplay(track.submittedArtistName) || cleanDisplay("artistName" in track ? track.artistName : undefined) || cleanDisplay(track.artist) || "Unknown artist";
}

function displayTitle(track: LiveOverlayTrackInput | LiveOverlayWheelCandidateInput): string {
  return cleanDisplay(track.detectedSongTitle) || cleanDisplay(track.submittedSongTitle) || cleanDisplay("trackTitle" in track ? track.trackTitle : undefined) || cleanDisplay(track.title) || "Untitled transmission";
}

function youtubeSyncForTrack(track: LiveOverlayTrackInput, playerSync?: LiveOverlayYouTubeSync | null): LiveOverlayYouTubeSync | undefined {
  if (track.sourceType !== "youtube") return undefined;
  const safeLink = safeLiveOverlayUrl(track.link);
  if (!safeLink || !track.youtubeVideoId) return undefined;
  const videoId = track.youtubeVideoId;
  const syncMatchesTrack = playerSync?.provider === "youtube" && playerSync.videoId === videoId && (!playerSync.trackId || !track.id || playerSync.trackId === track.id);
  return syncMatchesTrack ? { ...playerSync, muted: true } : { provider: "youtube", videoId, trackId: track.id, playbackState: "playing", currentTimeSeconds: 0, updatedAt: new Date().toISOString(), muted: true };
}

function safeTrack(track: LiveOverlayTrackInput): { track: ResolvedLiveOverlayTrack; artworkUrl: string | null; sourceUrl: string | null } {
  const sourceType = track.sourceType ?? "unknown";
  const isUpload = sourceType === "upload";
  return {
    track: {
      id: track.id,
      artistName: displayArtist(track),
      trackTitle: displayTitle(track),
      sourceType,
      durationLabel: cleanDisplay(track.durationLabel),
    },
    artworkUrl: safeLiveOverlayUrl(track.sourceArtworkUrl) ?? null,
    sourceUrl: isUpload ? null : safeLiveOverlayUrl(track.link) ?? null,
  };
}

function safeWheelCandidate(candidate: LiveOverlayWheelCandidateInput): ResolvedWheelCeremonyTrack | null {
  const id = cleanDisplay(candidate.id);
  if (!id) return null;
  return { id, artistName: displayArtist(candidate), trackTitle: displayTitle(candidate) };
}

function normalizeWheelCeremonyStatus(value: unknown): WheelCeremonyStatus {
  return value === "ready" || value === "reencrypting" || value === "spinning" || value === "result_pending" || value === "confirmed" || value === "cancelled" || value === "idle" ? value : "idle";
}

function timeMs(value?: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWheelSpinDurationMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_WHEEL_SPIN_DURATION_MS;
  return Math.max(MIN_WHEEL_SPIN_DURATION_MS, Math.min(MAX_WHEEL_SPIN_DURATION_MS, Math.round(value)));
}

function seededHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffledWheelCandidates(candidates: ResolvedWheelCeremonyTrack[], seed?: string): ResolvedWheelCeremonyTrack[] {
  const shuffled = [...candidates];
  let state = seededHash(seed || "barcode-wheel");
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function resolveWheelCeremony(input: ResolveLiveOverlaySceneInput, now: Date): ResolvedWheelCeremonyScene | null {
  const overlayState = input.overlayState ?? null;
  const storedStatus = normalizeWheelCeremonyStatus(overlayState?.wheelCeremonyStatus ?? (overlayState?.wheelOverlayActive ? "ready" : "idle"));
  if (storedStatus === "idle" || storedStatus === "cancelled") return null;
  const candidates = (input.wheelCandidates ?? []).map(safeWheelCandidate).filter((candidate): candidate is ResolvedWheelCeremonyTrack => Boolean(candidate));
  const resultTrackId = cleanDisplay(overlayState?.wheelCeremonyResultTrackId);
  const resultTrack = candidates.find((candidate) => candidate.id === resultTrackId) ?? (resultTrackId ? { id: resultTrackId, artistName: cleanDisplay(overlayState?.artistName) || "Selected artist", trackTitle: cleanDisplay(overlayState?.trackTitle) || "Selected transmission" } : null);
  let status = storedStatus;
  const spinDurationMs = normalizeWheelSpinDurationMs(overlayState?.wheelCeremonySpinDurationMs);
  if (storedStatus === "reencrypting" || storedStatus === "spinning") {
    const spinStartedMs = timeMs(overlayState?.wheelCeremonySpinStartedAt) ?? now.getTime();
    const elapsedMs = now.getTime() - spinStartedMs;
    if (storedStatus === "reencrypting") status = elapsedMs < WHEEL_REENCRYPTING_MS ? "reencrypting" : "result_pending";
    else status = elapsedMs < spinDurationMs ? "spinning" : "result_pending";
  }
  if (storedStatus === "confirmed") {
    const confirmedAtMs = timeMs(overlayState?.wheelCeremonyResultSelectedAt) ?? timeMs(overlayState?.updatedAt) ?? now.getTime();
    if (now.getTime() - confirmedAtMs > WHEEL_CONFIRMED_RETURN_MS) return null;
  }
  return {
    status,
    storedStatus,
    candidateCount: candidates.length,
    displayCandidates: (storedStatus === "reencrypting" ? shuffledWheelCandidates(candidates, cleanDisplay(overlayState?.wheelCeremonySeed)) : candidates).slice(0, MAX_WHEEL_DISPLAY_CANDIDATES),
    hiddenCandidateCount: Math.max(0, candidates.length - MAX_WHEEL_DISPLAY_CANDIDATES),
    resultTrack,
    resultTrackId,
    startedAt: overlayState?.wheelCeremonyStartedAt ?? overlayState?.wheelOverlayLaunchedAt,
    spinStartedAt: overlayState?.wheelCeremonySpinStartedAt,
    resultSelectedAt: overlayState?.wheelCeremonyResultSelectedAt,
    seed: cleanDisplay(overlayState?.wheelCeremonySeed),
    jingleKey: cleanDisplay(overlayState?.wheelCeremonyJingleKey) || "silent",
    spinDurationMs,
  };
}

function scene(input: Omit<ResolvedLiveOverlayScene, "resolvedMode" | "updatedAt" | "wheelSpinsOwed" | "wheelOverlayActive">, overlayState: LiveOverlayStateInput | null | undefined, wheelSpinsOwed: number, wheelOverlayActive?: boolean): ResolvedLiveOverlayScene {
  return {
    ...input,
    resolvedMode: input.mode,
    updatedAt: overlayState?.updatedAt ?? new Date().toISOString(),
    wheelSpinsOwed,
    wheelOverlayActive: wheelOverlayActive ?? overlayState?.wheelOverlayActive === true,
  };
}

export function resolveLiveOverlayScene(input: ResolveLiveOverlaySceneInput): ResolvedLiveOverlayScene {
  const overlayState = input.overlayState ?? null;
  const currentSession = input.currentSession ?? null;
  const now = input.now ?? new Date();
  const wheelSpinsOwed = Math.max(0, Math.floor(input.wheelSpinsOwed ?? currentSession?.wheelSpinsOwed ?? 0));
  const sponsorBreakStatus = input.sponsorBreakStatus ?? currentSession?.sponsorBreakStatus;
  const queueOpen = input.queueOpen ?? currentSession?.queueOpen ?? false;
  const broadcastPhase = input.broadcastPhase ?? currentSession?.broadcastPhase;
  const wheelCeremony = resolveWheelCeremony(input, now);

  if (wheelCeremony) {
    const result = wheelCeremony.resultTrack;
    const mode: OverlayMode = wheelCeremony.status === "reencrypting" ? "wheel_reencrypting" : wheelCeremony.status === "spinning" ? "wheel_spinning" : wheelCeremony.status === "result_pending" ? "wheel_result" : wheelCeremony.status === "confirmed" ? "wheel_confirmed" : "wheel_ready";
    return scene({
      mode,
      reason: wheelCeremony.status === "ready" ? "Wheel ceremony was launched by the host." : wheelCeremony.status === "reencrypting" ? "Wheel result is being re-encrypted before host confirmation." : wheelCeremony.status === "spinning" ? "Wheel spin is running under host control." : wheelCeremony.status === "confirmed" ? "Wheel result was confirmed through the queue admin path." : "Wheel result is waiting for host confirmation.",
      title: wheelCeremony.status === "confirmed" ? "WHEEL CHOSEN" : "10K TAP WHEEL",
      subtitle: wheelCeremony.status === "ready" ? "READY" : wheelCeremony.status === "reencrypting" ? "RE-ENCRYPTING SIGNAL" : wheelCeremony.status === "spinning" ? "SPINNING" : wheelCeremony.status === "confirmed" ? "LOCKED IN" : "RESULT PENDING",
      message: wheelCeremony.status === "ready" ? `Candidates: ${wheelCeremony.candidateCount}. Awaiting host spin.` : wheelCeremony.status === "reencrypting" ? "Signal scramble in progress." : wheelCeremony.status === "spinning" ? "Result incoming." : result ? `${result.artistName} — ${result.trackTitle}` : "Awaiting host confirmation.",
      wheelCeremony,
      priority: 100,
      automatic: false,
      overrideActive: true,
    }, overlayState, wheelSpinsOwed, true);
  }

  if (sponsorBreakStatus === "running") {
    return scene({
      mode: "sponsor",
      reason: "Sponsor break is currently running.",
      title: overlayState?.sponsorLabel || "SPONSOR BREAK",
      subtitle: "BARCODE RADIO",
      message: overlayState?.message || "Transmission will resume shortly.",
      priority: 90,
      automatic: true,
      overrideActive: false,
    }, overlayState, wheelSpinsOwed, false);
  }

  if (overlayState?.systemMessageActive) {
    return scene({
      mode: "system_message",
      reason: "Temporary system message is active.",
      title: overlayState.systemMessageTitle || overlayState.title || "BARCODE SYSTEM MESSAGE",
      subtitle: "TEMPORARY OVERRIDE",
      message: overlayState.systemMessage || overlayState.message || "Stand by.",
      priority: 80,
      automatic: false,
      overrideActive: true,
    }, overlayState, wheelSpinsOwed, false);
  }

  if (overlayState?.videoPlaceholderActive) {
    return scene({
      mode: "video_placeholder",
      reason: "Video placeholder was explicitly launched; playback is disabled.",
      title: overlayState.title || "VIDEO RECEIVER READY",
      subtitle: "PLACEHOLDER ONLY",
      message: overlayState.message || "Video link pending. Playback is not enabled in this foundation scene.",
      videoUrl: safeLiveOverlayUrl(overlayState.videoUrl),
      priority: 70,
      automatic: false,
      overrideActive: true,
    }, overlayState, wheelSpinsOwed, false);
  }

  if (input.nowPlaying) {
    const safe = safeTrack(input.nowPlaying);
    const youtube = youtubeSyncForTrack(input.nowPlaying, input.playerSync);
    return scene({
      mode: "now_playing",
      reason: youtube ? "Current YouTube track is loaded." : "Current track is loaded.",
      title: "NOW PLAYING",
      subtitle: youtube ? "YOUTUBE SIGNAL" : "BARCODE RADIO LIVE",
      track: safe.track,
      artworkUrl: safe.artworkUrl,
      sourceUrl: safe.sourceUrl,
      youtube,
      priority: youtube ? 60 : 50,
      automatic: true,
      overrideActive: false,
    }, overlayState, wheelSpinsOwed, false);
  }

  if (currentSession && currentSession.status !== "archived") {
    return scene({
      mode: "session_active",
      reason: queueOpen ? "Broadcast session is active and submissions are open." : "Broadcast session is active with no track loaded.",
      title: "BARCODE RADIO",
      subtitle: queueOpen ? "SUBMISSIONS OPEN" : "SESSION STANDBY",
      message: queueOpen ? "Intake corridor active." : broadcastPhase === "ended" ? "Transmission is ending." : "Awaiting the next transmission.",
      priority: 20,
      automatic: true,
      overrideActive: false,
    }, overlayState, wheelSpinsOwed, false);
  }

  return scene({
    mode: "standby",
    reason: "No active broadcast session is available.",
    title: "BARCODE RADIO",
    subtitle: "RECEIVER STANDBY",
    message: "Standing by for the next transmission.",
    priority: 0,
    automatic: true,
    overrideActive: false,
  }, overlayState, wheelSpinsOwed, false);
}
