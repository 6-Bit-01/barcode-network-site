import type { QueueSourceType, SponsorBreakStatus } from "./queue-types";

export type OverlayMode = "standby" | "now_playing" | "artist_card" | "wheel_ready" | "sponsor" | "video_placeholder" | "system_message" | "session_active";
export type WheelOverlayStatus = "ready" | "intro" | "active" | "complete";

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
}

export interface LiveOverlayStateInput {
  mode?: OverlayMode;
  title?: string;
  subtitle?: string;
  message?: string;
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

export interface ResolveLiveOverlaySceneInput {
  overlayState?: LiveOverlayStateInput | null;
  currentSession?: LiveOverlaySessionInput | null;
  nowPlaying?: LiveOverlayTrackInput | null;
  upNext?: LiveOverlayTrackInput | null;
  wheelSpinsOwed?: number;
  sponsorBreakStatus?: SponsorBreakStatus;
  broadcastPhase?: string;
  queueOpen?: boolean;
}

export interface ResolvedLiveOverlayTrack {
  id?: string;
  artistName: string;
  trackTitle: string;
  sourceType: QueueSourceType | "unknown";
  durationLabel?: string;
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
  priority: number;
  automatic: boolean;
  overrideActive: boolean;
  wheelOverlayActive: boolean;
  wheelSpinsOwed: number;
  updatedAt: string;
}

const MAX_URL_LENGTH = 600;
const BLOCKED_HOSTS = ["drive.google.com", "dropbox.com", "wetransfer.com", "bit.ly", "tinyurl.com", "t.co", "goo.gl", "private.blob.vercel-storage.com"];

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

function displayArtist(track: LiveOverlayTrackInput): string {
  return cleanDisplay(track.detectedArtistName) || cleanDisplay(track.submittedArtistName) || cleanDisplay(track.artist) || "Unknown artist";
}

function displayTitle(track: LiveOverlayTrackInput): string {
  return cleanDisplay(track.detectedSongTitle) || cleanDisplay(track.submittedSongTitle) || cleanDisplay(track.title) || "Untitled transmission";
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

function scene(input: Omit<ResolvedLiveOverlayScene, "resolvedMode" | "updatedAt" | "wheelSpinsOwed" | "wheelOverlayActive">, overlayState: LiveOverlayStateInput | null | undefined, wheelSpinsOwed: number): ResolvedLiveOverlayScene {
  return {
    ...input,
    resolvedMode: input.mode,
    updatedAt: overlayState?.updatedAt ?? new Date().toISOString(),
    wheelSpinsOwed,
    wheelOverlayActive: overlayState?.wheelOverlayActive === true,
  };
}

export function resolveLiveOverlayScene(input: ResolveLiveOverlaySceneInput): ResolvedLiveOverlayScene {
  const overlayState = input.overlayState ?? null;
  const currentSession = input.currentSession ?? null;
  const wheelSpinsOwed = Math.max(0, Math.floor(input.wheelSpinsOwed ?? currentSession?.wheelSpinsOwed ?? 0));
  const sponsorBreakStatus = input.sponsorBreakStatus ?? currentSession?.sponsorBreakStatus;
  const queueOpen = input.queueOpen ?? currentSession?.queueOpen ?? false;
  const broadcastPhase = input.broadcastPhase ?? currentSession?.broadcastPhase;

  if (overlayState?.wheelOverlayActive) {
    return scene({
      mode: "wheel_ready",
      reason: "Wheel overlay was launched by the host.",
      title: "10K TAP WHEEL",
      subtitle: "READY",
      message: "Awaiting host spin.",
      priority: 100,
      automatic: false,
      overrideActive: true,
    }, overlayState, wheelSpinsOwed);
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
    }, overlayState, wheelSpinsOwed);
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
    }, overlayState, wheelSpinsOwed);
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
    }, overlayState, wheelSpinsOwed);
  }

  if (input.nowPlaying) {
    const safe = safeTrack(input.nowPlaying);
    return scene({
      mode: "now_playing",
      reason: "Current track is loaded.",
      title: "NOW PLAYING",
      subtitle: "BARCODE RADIO LIVE",
      track: safe.track,
      artworkUrl: safe.artworkUrl,
      sourceUrl: safe.sourceUrl,
      priority: 50,
      automatic: true,
      overrideActive: false,
    }, overlayState, wheelSpinsOwed);
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
    }, overlayState, wheelSpinsOwed);
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
  }, overlayState, wheelSpinsOwed);
}
