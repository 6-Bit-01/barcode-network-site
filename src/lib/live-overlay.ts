import { Redis } from "@upstash/redis";
import { getRadioQueueState } from "./queue";
import { getTrackArtworkUrl, getTrackDurationLabel } from "./queue-types";
import type { QueueEntry, QueueSourceType } from "./queue-types";

export type OverlayMode = "standby" | "now_playing" | "artist_card" | "wheel_ready" | "sponsor" | "video_placeholder" | "system_message";

export interface LiveOverlayState {
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
  updatedAt: string;
}

export interface LiveOverlayPayload {
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
}

const OVERLAY_STATE_KEY = "barcode:live-overlay:state";
const MAX_TEXT_LENGTH = 180;
const MAX_URL_LENGTH = 600;

let memoryOverlayState: LiveOverlayState = defaultLiveOverlayState();

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
    subtitle: "LIVE OVERLAY RECEIVER",
    message: "Stand by for the next transmission.",
    artworkUrl: null,
    sourceUrl: null,
    updatedAt: new Date().toISOString(),
  };
}

function cleanText(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
  return cleaned || fallback;
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_URL_LENGTH);
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const blockedHosts = ["drive.google.com", "dropbox.com", "wetransfer.com", "bit.ly", "tinyurl.com", "t.co", "goo.gl", "private.blob.vercel-storage.com"];
    if (blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function safeArtworkUrl(value: unknown): string | null {
  return safeHttpUrl(value) ?? null;
}

function publicTrackUrl(entry: QueueEntry): string | null {
  if ((entry.sourceType ?? "other") === "upload") return null;
  return safeHttpUrl(entry.link) ?? null;
}

function publicTrackArtwork(entry: QueueEntry): string | null {
  return safeArtworkUrl(getTrackArtworkUrl(entry));
}

function displayArtist(entry: QueueEntry): string {
  return entry.detectedArtistName?.trim() || entry.submittedArtistName?.trim() || entry.artist;
}

function displayTitle(entry: QueueEntry): string {
  return entry.detectedSongTitle?.trim() || entry.submittedSongTitle?.trim() || entry.title;
}

function trackState(entry: QueueEntry): Partial<LiveOverlayState> {
  return {
    trackId: entry.id,
    artistName: displayArtist(entry),
    trackTitle: displayTitle(entry),
    artworkUrl: publicTrackArtwork(entry),
    sourceUrl: publicTrackUrl(entry),
    sourceType: entry.sourceType ?? "unknown",
    durationLabel: getTrackDurationLabel(entry),
  };
}

function normalizeMode(value: unknown): OverlayMode {
  const modes: OverlayMode[] = ["standby", "now_playing", "artist_card", "wheel_ready", "sponsor", "video_placeholder", "system_message"];
  return modes.includes(value as OverlayMode) ? value as OverlayMode : "standby";
}

function normalizeSourceType(value: unknown): LiveOverlayState["sourceType"] {
  const sources: LiveOverlayState["sourceType"][] = ["upload", "link", "youtube", "soundcloud", "spotify", "other", "unknown"];
  return sources.includes(value as LiveOverlayState["sourceType"]) ? value as LiveOverlayState["sourceType"] : "unknown";
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
    sourceUrl: safeHttpUrl(raw.sourceUrl) ?? null,
    sourceType: normalizeSourceType(raw.sourceType),
    durationLabel: cleanText(raw.durationLabel),
    sponsorLabel: cleanText(raw.sponsorLabel),
    videoUrl: safeHttpUrl(raw.videoUrl),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
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

export async function getLiveOverlayState(): Promise<LiveOverlayState> {
  const state = await getStoredLiveOverlayState();
  if (state.mode !== "now_playing") return state;
  const queueState = await getRadioQueueState();
  if (!queueState.nowPlaying) {
    return {
      ...defaultLiveOverlayState(),
      mode: "standby",
      title: "BARCODE RADIO",
      subtitle: "NO TRACK LOADED",
      message: "Stand by for the next transmission.",
      updatedAt: state.updatedAt,
    };
  }
  return {
    ...state,
    title: "NOW PLAYING",
    subtitle: "BARCODE RADIO LIVE",
    message: state.message,
    ...trackState(queueState.nowPlaying),
  };
}

export async function setLiveOverlayState(payload: LiveOverlayPayload): Promise<LiveOverlayState> {
  const mode = normalizeMode(payload.mode);
  const now = new Date().toISOString();
  let next: LiveOverlayState = {
    mode,
    title: cleanText(payload.title),
    subtitle: cleanText(payload.subtitle),
    message: cleanText(payload.message),
    artistName: cleanText(payload.artistName),
    trackTitle: cleanText(payload.trackTitle),
    artworkUrl: safeArtworkUrl(payload.artworkUrl),
    sourceUrl: safeHttpUrl(payload.sourceUrl) ?? null,
    sponsorLabel: cleanText(payload.sponsorLabel),
    videoUrl: safeHttpUrl(payload.videoUrl),
    updatedAt: now,
  };

  if (mode === "standby") {
    next = { ...defaultLiveOverlayState(), updatedAt: now };
  }

  if (mode === "now_playing") {
    const queueState = await getRadioQueueState();
    next = queueState.nowPlaying
      ? { ...next, title: "NOW PLAYING", subtitle: "BARCODE RADIO LIVE", ...trackState(queueState.nowPlaying) }
      : { ...defaultLiveOverlayState(), mode: "standby", subtitle: "NO TRACK LOADED", updatedAt: now };
  }

  if (mode === "wheel_ready") {
    next.title = next.title || "10K TAP WHEEL";
    next.subtitle = next.subtitle || "READY";
    next.message = next.message || "Awaiting host spin.";
  }

  if (mode === "sponsor") {
    next.title = next.title || "SPONSOR BREAK";
    next.message = next.message || "Transmission will resume shortly.";
  }

  if (mode === "system_message") {
    next.title = next.title || "BARCODE SYSTEM MESSAGE";
    next.message = next.message || "Stand by.";
  }

  if (mode === "video_placeholder") {
    next.title = next.title || "VIDEO RECEIVER READY";
    next.message = next.message || "Video link pending. Playback is not enabled in this foundation scene.";
  }

  const normalized = normalizeState(next);
  const redis = getRedis();
  if (redis) await redis.set(OVERLAY_STATE_KEY, JSON.stringify(normalized));
  memoryOverlayState = normalized;
  return normalized;
}
