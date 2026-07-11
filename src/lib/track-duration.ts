import { INTERNAL_BUFFER_DURATION_SECONDS, parseTikTokVideoUrl } from "./queue-types";

export type TrackDurationProvider = "youtube" | "spotify" | "soundcloud" | "tiktok" | "direct" | "other";

export type TrackDurationSource =
  | "upload_metadata"
  | "youtube_api"
  | "spotify_api"
  | "soundcloud_api"
  | "direct_metadata"
  | "estimated"
  | "unknown";

export interface TrackDurationDetectionResult {
  durationSeconds: number | null;
  durationIsEstimate: boolean;
  durationSource: TrackDurationSource;
  provider?: TrackDurationProvider;
  providerTrackId?: string;
  notes: string[];
}

export interface ParsedTrackProviderUrl {
  provider: TrackDurationProvider;
  providerTrackId?: string;
  normalizedUrl: string;
}

export interface TrackDurationStorageFields {
  detectedDurationSeconds: number | null;
  estimatedDurationSeconds: number;
  durationIsEstimate: boolean;
  durationSource: TrackDurationSource;
}

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{6,}$/;
const SPOTIFY_TRACK_ID_PATTERN = /^[a-zA-Z0-9]{10,}$/;
const FETCH_TIMEOUT_MS = 2500;

function positiveSeconds(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.round(numeric)) : null;
}

function unavailable(provider: TrackDurationProvider | undefined, notes: string[], providerTrackId?: string): TrackDurationDetectionResult {
  return { durationSeconds: null, durationIsEstimate: true, durationSource: "unknown", provider, providerTrackId, notes };
}

export function estimatedTrackDurationResult(notes: string[] = ["No detected duration was available; using the internal fallback estimate."]): TrackDurationDetectionResult {
  return { durationSeconds: INTERNAL_BUFFER_DURATION_SECONDS, durationIsEstimate: true, durationSource: "estimated", provider: "other", notes };
}

export function uploadTrackDurationResult(durationSeconds: unknown): TrackDurationDetectionResult {
  const detected = positiveSeconds(durationSeconds);
  if (!detected) return estimatedTrackDurationResult(["Upload duration metadata was not available from the client."]);
  return { durationSeconds: detected, durationIsEstimate: false, durationSource: "upload_metadata", provider: "direct", notes: ["Upload duration came from client-side audio metadata."] };
}

export function trackDurationStorageFields(result: TrackDurationDetectionResult): TrackDurationStorageFields {
  if (result.durationSeconds && result.durationIsEstimate === false) {
    return {
      detectedDurationSeconds: result.durationSeconds,
      estimatedDurationSeconds: result.durationSeconds,
      durationIsEstimate: false,
      durationSource: result.durationSource,
    };
  }

  return {
    detectedDurationSeconds: null,
    estimatedDurationSeconds: INTERNAL_BUFFER_DURATION_SECONDS,
    durationIsEstimate: true,
    durationSource: "estimated",
  };
}

export function parseYouTubeVideoId(link?: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? null;
      return id && YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const id = url.searchParams.get("v") || url.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] || url.pathname.match(/\/embed\/([^/?#]+)/)?.[1] || null;
      return id && YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseSpotifyTrackId(link?: string | null): string | null {
  if (!link) return null;
  const uriMatch = link.match(/^spotify:track:([a-zA-Z0-9]+)$/);
  if (uriMatch?.[1] && SPOTIFY_TRACK_ID_PATTERN.test(uriMatch[1])) return uriMatch[1];
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "open.spotify.com") return null;
    const [kind, id] = url.pathname.split("/").filter(Boolean);
    return kind === "track" && id && SPOTIFY_TRACK_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function parseSoundCloudPublicUrl(link?: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "soundcloud.com" || url.pathname.split("/").filter(Boolean).length < 2) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function parseSafeTrackProviderUrl(link?: string | null): ParsedTrackProviderUrl | null {
  const youtubeId = parseYouTubeVideoId(link);
  if (youtubeId) return { provider: "youtube", providerTrackId: youtubeId, normalizedUrl: `https://www.youtube.com/watch?v=${youtubeId}` };
  const spotifyId = parseSpotifyTrackId(link);
  if (spotifyId) return { provider: "spotify", providerTrackId: spotifyId, normalizedUrl: `https://open.spotify.com/track/${spotifyId}` };
  const tiktok = parseTikTokVideoUrl(link);
  if (tiktok) return { provider: "tiktok", providerTrackId: tiktok.postId, normalizedUrl: tiktok.canonicalSourceUrl };
  const soundcloudUrl = parseSoundCloudPublicUrl(link);
  if (soundcloudUrl) return { provider: "soundcloud", normalizedUrl: soundcloudUrl };
  return null;
}

export function parseIso8601DurationToSeconds(duration: string): number | null {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const seconds = (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
  return seconds > 0 ? seconds : null;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function detectYouTubeDuration(videoId: string): Promise<TrackDurationDetectionResult> {
  const key = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY;
  if (!key) return unavailable("youtube", ["YouTube Data API key is not configured; duration unavailable."], videoId);
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`;
  const payload = await fetchJsonWithTimeout(url);
  const item = Array.isArray((payload as { items?: unknown[] } | null)?.items) ? (payload as { items: Array<{ contentDetails?: { duration?: string } }> }).items[0] : null;
  const duration = typeof item?.contentDetails?.duration === "string" ? parseIso8601DurationToSeconds(item.contentDetails.duration) : null;
  if (!duration) return unavailable("youtube", ["YouTube API did not return a usable duration."], videoId);
  return { durationSeconds: duration, durationIsEstimate: false, durationSource: "youtube_api", provider: "youtube", providerTrackId: videoId, notes: ["Duration came from YouTube Data API contentDetails."] };
}

async function detectSpotifyDuration(trackId: string): Promise<TrackDurationDetectionResult> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return unavailable("spotify", ["Spotify client credentials are not configured; duration unavailable."], trackId);
  const tokenPayload = await fetchJsonWithTimeout("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const token = typeof (tokenPayload as { access_token?: unknown } | null)?.access_token === "string" ? (tokenPayload as { access_token: string }).access_token : null;
  if (!token) return unavailable("spotify", ["Spotify token request did not return an access token."], trackId);
  const track = await fetchJsonWithTimeout(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const duration = positiveSeconds(typeof (track as { duration_ms?: unknown } | null)?.duration_ms === "number" ? (track as { duration_ms: number }).duration_ms / 1000 : null);
  if (!duration) return unavailable("spotify", ["Spotify API did not return a usable duration."], trackId);
  return { durationSeconds: duration, durationIsEstimate: false, durationSource: "spotify_api", provider: "spotify", providerTrackId: trackId, notes: ["Duration came from Spotify Web API duration_ms."] };
}

async function detectSoundCloudDuration(normalizedUrl: string): Promise<TrackDurationDetectionResult> {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  if (!clientId) return unavailable("soundcloud", ["SoundCloud client id is not configured; duration unavailable."]);
  const payload = await fetchJsonWithTimeout(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(normalizedUrl)}&client_id=${encodeURIComponent(clientId)}`);
  const duration = positiveSeconds(typeof (payload as { duration?: unknown } | null)?.duration === "number" ? (payload as { duration: number }).duration / 1000 : null);
  if (!duration) return unavailable("soundcloud", ["SoundCloud API did not return a usable duration."]);
  return { durationSeconds: duration, durationIsEstimate: false, durationSource: "soundcloud_api", provider: "soundcloud", notes: ["Duration came from existing SoundCloud API resolve access."] };
}

export async function detectTrackDurationFromLink(link?: string | null): Promise<TrackDurationDetectionResult> {
  const parsed = parseSafeTrackProviderUrl(link);
  if (!parsed) return unavailable(undefined, ["Link host is not a supported duration provider."]);
  try {
    if (parsed.provider === "youtube" && parsed.providerTrackId) return detectYouTubeDuration(parsed.providerTrackId);
    if (parsed.provider === "spotify" && parsed.providerTrackId) return detectSpotifyDuration(parsed.providerTrackId);
    if (parsed.provider === "soundcloud") return detectSoundCloudDuration(parsed.normalizedUrl);
    if (parsed.provider === "tiktok") return unavailable("tiktok", ["Official TikTok oEmbed does not document exact duration metadata; using the internal estimate."], parsed.providerTrackId);
    return unavailable(parsed.provider, ["Provider is parsed but duration fetching is not enabled."], parsed.providerTrackId);
  } catch (error) {
    return unavailable(parsed.provider, [error instanceof Error ? `Duration lookup failed: ${error.message}` : "Duration lookup failed."], parsed.providerTrackId);
  }
}
