import { Redis } from "@upstash/redis";
import { getRadioQueueState } from "./queue";
import { getTrackArtworkUrl, getTrackDurationLabel } from "./queue-types";
import { resolveLiveOverlayScene, safeLiveOverlayUrl } from "./live-overlay-resolver";
import { parseYouTubeVideoId } from "./track-duration";
import type { QueueEntry, QueueSourceType } from "./queue-types";
import type { LiveOverlayPlaybackState, LiveOverlayStateInput, LiveOverlayYouTubeSync, OverlayMode, ResolvedLiveOverlayScene, WheelOverlayStatus } from "./live-overlay-resolver";

export type { LiveOverlayPlaybackState, LiveOverlayYouTubeSync, OverlayMode, ResolvedLiveOverlayScene, WheelOverlayStatus } from "./live-overlay-resolver";

export interface LiveOverlayState extends LiveOverlayStateInput {
  mode: OverlayMode;
  title?: string;
  subtitle?: string;
  message?: string;
  trackId?: string;
  artistName?: string;
  trackTitle?: string;
  artworkUrl?: string | null;
  sourceUrl?: string | null;
  sourceType?: QueueSourceType | "unknown";
  durationLabel?: string;
  sponsorLabel?: string;
  videoUrl?: string;
  systemMessageActive?: boolean;
  systemMessageTitle?: string;
  systemMessage?: string;
  videoPlaceholderActive?: boolean;
  wheelOverlayActive?: boolean;
  wheelOverlayLaunchedAt?: string;
  wheelOverlayStatus?: WheelOverlayStatus;
  updatedAt: string;
}

export interface LiveOverlayPayload {
  action?: "launchWheel" | "clearWheel" | "setSystemMessage" | "clearSystemMessage" | "launchVideoPlaceholder" | "clearVideoPlaceholder" | "clearAllOverrides" | "updatePlayerSync" | "clearPlayerSync";
  mode?: OverlayMode;
  title?: unknown;
  subtitle?: unknown;
  message?: unknown;
  artistName?: unknown;
  trackTitle?: unknown;
  artworkUrl?: unknown;
  sourceUrl?: unknown;
  sponsorLabel?: unknown;
  videoUrl?: unknown;
  sync?: unknown;
}

export interface LiveOverlayAdminSnapshot {
  overlayState: LiveOverlayState;
  scene: ResolvedLiveOverlayScene;
  playerSync: LiveOverlayYouTubeSync | null;
}

const OVERLAY_STATE_KEY = "barcode:live-overlay:state";
const PLAYER_SYNC_KEY = "barcode:live-overlay:player-sync";
const MAX_TEXT_LENGTH = 180;

let memoryOverlayState: LiveOverlayState = defaultLiveOverlayState();
let memoryPlayerSync: LiveOverlayYouTubeSync | null = null;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function defaultLiveOverlayState(): LiveOverlayState {
  return {
    mode: "standby",
    title: "BARCODE RADIO",
    subtitle: "RECEIVER STANDBY",
    message: "Standing by for the next transmission.",
    artworkUrl: null,
    sourceUrl: null,
    systemMessageActive: false,
    videoPlaceholderActive: false,
    wheelOverlayActive: false,
    wheelOverlayStatus: "ready",
    updatedAt: new Date().toISOString(),
  };
}

function cleanText(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
  return cleaned || fallback;
}

function safeArtworkUrl(value: unknown): string | null {
  return safeLiveOverlayUrl(value) ?? null;
}

function displayArtist(entry: QueueEntry): string {
  return entry.detectedArtistName?.trim() || entry.submittedArtistName?.trim() || entry.artist;
}

function displayTitle(entry: QueueEntry): string {
  return entry.detectedSongTitle?.trim() || entry.submittedSongTitle?.trim() || entry.title;
}

function overlayTrackInput(entry: QueueEntry) {
  return {
    id: entry.id,
    artist: displayArtist(entry),
    title: displayTitle(entry),
    submittedArtistName: entry.submittedArtistName,
    submittedSongTitle: entry.submittedSongTitle,
    detectedArtistName: entry.detectedArtistName,
    detectedSongTitle: entry.detectedSongTitle,
    sourceType: (entry.sourceType ?? "unknown") as QueueSourceType | "unknown",
    sourceArtworkUrl: getTrackArtworkUrl(entry),
    link: entry.link,
    durationLabel: getTrackDurationLabel(entry),
    youtubeVideoId: entry.sourceType === "youtube" ? parseYouTubeVideoId(entry.link) : null,
  };
}

function normalizeMode(value: unknown): OverlayMode {
  const modes: OverlayMode[] = ["standby", "now_playing", "artist_card", "wheel_ready", "sponsor", "video_placeholder", "system_message", "session_active"];
  return modes.includes(value as OverlayMode) ? value as OverlayMode : "standby";
}

function normalizeSourceType(value: unknown): LiveOverlayState["sourceType"] {
  const sources: LiveOverlayState["sourceType"][] = ["upload", "link", "youtube", "soundcloud", "spotify", "other", "unknown"];
  return sources.includes(value as LiveOverlayState["sourceType"]) ? value as LiveOverlayState["sourceType"] : "unknown";
}

function normalizeWheelStatus(value: unknown): WheelOverlayStatus {
  return value === "intro" || value === "active" || value === "complete" || value === "ready" ? value : "ready";
}


function normalizePlaybackState(value: unknown): LiveOverlayPlaybackState {
  return value === "paused" || value === "stopped" || value === "playing" ? value : "stopped";
}

function normalizePlayerSync(input: unknown): LiveOverlayYouTubeSync | null {
  const raw = input as Partial<LiveOverlayYouTubeSync> | null;
  if (!raw || typeof raw !== "object" || raw.provider !== "youtube") return null;
  const videoId = typeof raw.videoId === "string" && parseYouTubeVideoId(`https://www.youtube.com/watch?v=${raw.videoId}`) ? raw.videoId : null;
  if (!videoId) return null;
  const currentTimeSeconds = typeof raw.currentTimeSeconds === "number" && Number.isFinite(raw.currentTimeSeconds) ? Math.max(0, raw.currentTimeSeconds) : 0;
  return {
    provider: "youtube",
    videoId,
    trackId: cleanText(raw.trackId),
    playbackState: normalizePlaybackState(raw.playbackState),
    currentTimeSeconds,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    muted: true,
  };
}

export function youtubeSyncFromTrack(entry: QueueEntry, playbackState: LiveOverlayPlaybackState = "playing", currentTimeSeconds = 0): LiveOverlayYouTubeSync | null {
  if (entry.sourceType !== "youtube") return null;
  const safeLink = safeLiveOverlayUrl(entry.link);
  const videoId = safeLink ? parseYouTubeVideoId(safeLink) : null;
  if (!videoId) return null;
  return { provider: "youtube", videoId, trackId: entry.id, playbackState, currentTimeSeconds: Math.max(0, currentTimeSeconds), updatedAt: new Date().toISOString(), muted: true };
}

function normalizeState(input: unknown): LiveOverlayState {
  const raw = input as Partial<LiveOverlayState> | null;
  if (!raw || typeof raw !== "object") return defaultLiveOverlayState();
  return {
    mode: normalizeMode(raw.mode),
    title: cleanText(raw.title),
    subtitle: cleanText(raw.subtitle),
    message: cleanText(raw.message),
    trackId: cleanText(raw.trackId),
    artistName: cleanText(raw.artistName),
    trackTitle: cleanText(raw.trackTitle),
    artworkUrl: safeArtworkUrl(raw.artworkUrl),
    sourceUrl: safeLiveOverlayUrl(raw.sourceUrl) ?? null,
    sourceType: normalizeSourceType(raw.sourceType),
    durationLabel: cleanText(raw.durationLabel),
    sponsorLabel: cleanText(raw.sponsorLabel),
    videoUrl: safeLiveOverlayUrl(raw.videoUrl),
    systemMessageActive: raw.systemMessageActive === true,
    systemMessageTitle: cleanText(raw.systemMessageTitle),
    systemMessage: cleanText(raw.systemMessage),
    videoPlaceholderActive: raw.videoPlaceholderActive === true,
    wheelOverlayActive: raw.wheelOverlayActive === true || raw.mode === "wheel_ready",
    wheelOverlayLaunchedAt: typeof raw.wheelOverlayLaunchedAt === "string" ? raw.wheelOverlayLaunchedAt : undefined,
    wheelOverlayStatus: normalizeWheelStatus(raw.wheelOverlayStatus),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

async function writeLiveOverlayState(state: LiveOverlayState): Promise<LiveOverlayState> {
  const normalized = normalizeState(state);
  const redis = getRedis();
  if (redis) await redis.set(OVERLAY_STATE_KEY, JSON.stringify(normalized));
  memoryOverlayState = normalized;
  return normalized;
}

export async function getLiveOverlayPlayerSync(): Promise<LiveOverlayYouTubeSync | null> {
  const redis = getRedis();
  if (!redis) return normalizePlayerSync(memoryPlayerSync);
  const raw = await redis.get<LiveOverlayYouTubeSync | string>(PLAYER_SYNC_KEY);
  if (!raw) return null;
  try {
    return normalizePlayerSync(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

export async function setLiveOverlayPlayerSync(sync: LiveOverlayYouTubeSync | null): Promise<LiveOverlayYouTubeSync | null> {
  const normalized = normalizePlayerSync(sync);
  const redis = getRedis();
  if (redis) {
    if (normalized) await redis.set(PLAYER_SYNC_KEY, JSON.stringify(normalized));
    else await redis.del(PLAYER_SYNC_KEY);
  }
  memoryPlayerSync = normalized;
  return normalized;
}

export async function getStoredLiveOverlayState(): Promise<LiveOverlayState> {
  const redis = getRedis();
  if (!redis) return normalizeState(memoryOverlayState);
  const raw = await redis.get<LiveOverlayState | string>(OVERLAY_STATE_KEY);
  if (!raw) return defaultLiveOverlayState();
  try {
    return normalizeState(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return defaultLiveOverlayState();
  }
}

export async function getResolvedLiveOverlayScene(): Promise<ResolvedLiveOverlayScene> {
  const [overlayState, queueState, playerSync] = await Promise.all([getStoredLiveOverlayState(), getRadioQueueState(), getLiveOverlayPlayerSync()]);
  const session = queueState.session ?? null;
  return resolveLiveOverlayScene({
    overlayState,
    currentSession: session ? {
      sessionId: session.sessionId,
      title: session.title,
      status: session.status,
      queueOpen: session.queueOpen,
      broadcastPhase: session.broadcastPhase,
      wheelSpinsOwed: session.wheelSpinsOwed ?? 0,
      sponsorBreakStatus: session.sponsorBreakStatus,
    } : null,
    nowPlaying: queueState.nowPlaying ? overlayTrackInput(queueState.nowPlaying) : null,
    upNext: queueState.nextInLine ? overlayTrackInput(queueState.nextInLine) : null,
    playerSync,
    wheelSpinsOwed: session?.wheelSpinsOwed ?? 0,
    sponsorBreakStatus: session?.sponsorBreakStatus,
    broadcastPhase: session?.broadcastPhase,
    queueOpen: session?.queueOpen,
  });
}

export async function getLiveOverlayAdminSnapshot(): Promise<LiveOverlayAdminSnapshot> {
  const [overlayState, scene, playerSync] = await Promise.all([getStoredLiveOverlayState(), getResolvedLiveOverlayScene(), getLiveOverlayPlayerSync()]);
  return { overlayState, scene, playerSync };
}

export async function setLiveOverlayState(payload: LiveOverlayPayload): Promise<LiveOverlayAdminSnapshot> {
  const current = await getStoredLiveOverlayState();
  const now = new Date().toISOString();
  let next: LiveOverlayState = { ...current, updatedAt: now };

  if (payload.action === "launchWheel") {
    const queueState = await getRadioQueueState();
    const wheelSpinsOwed = queueState.session?.wheelSpinsOwed ?? 0;
    if (wheelSpinsOwed <= 0) return getLiveOverlayAdminSnapshot();
    next = { ...current, mode: "wheel_ready", wheelOverlayActive: true, wheelOverlayLaunchedAt: now, wheelOverlayStatus: "ready", updatedAt: now };
  } else if (payload.action === "clearWheel") {
    next = { ...current, mode: "standby", wheelOverlayActive: false, wheelOverlayLaunchedAt: undefined, wheelOverlayStatus: "ready", updatedAt: now };
  } else if (payload.action === "setSystemMessage") {
    next = { ...current, mode: "system_message", systemMessageActive: true, systemMessageTitle: cleanText(payload.title, "BARCODE SYSTEM MESSAGE"), systemMessage: cleanText(payload.message, "Stand by."), updatedAt: now };
  } else if (payload.action === "clearSystemMessage") {
    next = { ...current, mode: "standby", systemMessageActive: false, systemMessageTitle: undefined, systemMessage: undefined, updatedAt: now };
  } else if (payload.action === "launchVideoPlaceholder") {
    next = { ...current, mode: "video_placeholder", videoPlaceholderActive: true, title: cleanText(payload.title, "VIDEO RECEIVER READY"), message: cleanText(payload.message, "Video link pending. Playback is not enabled in this foundation scene."), videoUrl: safeLiveOverlayUrl(payload.videoUrl), updatedAt: now };
  } else if (payload.action === "clearVideoPlaceholder") {
    next = { ...current, mode: "standby", videoPlaceholderActive: false, videoUrl: undefined, updatedAt: now };
  } else if (payload.action === "clearAllOverrides") {
    next = { ...defaultLiveOverlayState(), updatedAt: now };
  } else if (payload.action === "updatePlayerSync") {
    await setLiveOverlayPlayerSync(normalizePlayerSync(payload.sync));
    return getLiveOverlayAdminSnapshot();
  } else if (payload.action === "clearPlayerSync") {
    await setLiveOverlayPlayerSync(null);
    return getLiveOverlayAdminSnapshot();
  }

  await writeLiveOverlayState(next);
  return getLiveOverlayAdminSnapshot();
}
