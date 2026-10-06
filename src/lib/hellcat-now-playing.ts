// Public radio metadata only. The bearer credential and receive clock stay server-side.
export const HELLCAT_RADIO_STALE_MS = 90_000;
export const HELLCAT_RADIO_POLL_MS = 10_000;

export type HellcatNowPlaying = {
  live: boolean;
  track_id: string | null;
  title: string | null;
  artist: string | null;
  started_at: string | null;
  stream_url: string | null;
};
export type HellcatRadioResult = { live: false } | (HellcatNowPlaying & { live: true; ageMs: number });
export type HellcatRadioSnapshot = { state: HellcatNowPlaying; receivedAt: number };
export type HellcatPlayback = "paused" | "connecting" | "playing" | "blocked" | "error";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const label = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 1000) return undefined;
  return value.trim() || null;
};

export function hellcatStreamUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    // A public, password-free HTTPS stream; never load credentials from a URL.
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || !host.includes(".") || host.includes(":") || /^\d+(?:\.\d+){3}$/.test(host)
      || /\.(?:localhost|local|internal)$/.test(host)) return null;
    return url.toString();
  } catch { return null; }
}

export function parseHellcatNowPlaying(value: unknown): HellcatNowPlaying | null {
  if (!record(value) || typeof value.live !== "boolean") return null;
  // Manual requests, startup and shutdown must not reveal their track metadata.
  if (!value.live) return { live: false, track_id: null, title: null, artist: null, started_at: null, stream_url: null };
  const title = label(value.title), artist = label(value.artist);
  const stream_url = hellcatStreamUrl(value.stream_url);
  if (title === undefined || artist === undefined || !stream_url
    || typeof value.track_id !== "string" || !value.track_id.trim() || value.track_id.length > 100
    || typeof value.started_at !== "string" || value.started_at.length > 64
    || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value.started_at)
    || !Number.isFinite(Date.parse(value.started_at))) return null;
  return { live: true, track_id: value.track_id.trim(), title, artist,
    started_at: new Date(value.started_at).toISOString(), stream_url };
}

export function hellcatRadioResult(value: unknown, now = Date.now()): HellcatRadioResult {
  if (!record(value) || typeof value.receivedAt !== "number") return { live: false };
  const ageMs = now - value.receivedAt;
  const state = parseHellcatNowPlaying(value.state);
  if (!state?.live || !Number.isFinite(ageMs) || ageMs < 0 || ageMs >= HELLCAT_RADIO_STALE_MS) return { live: false };
  return { ...state, live: true, ageMs };
}

export function parseHellcatRadioResult(value: unknown): HellcatRadioResult {
  if (!record(value) || !value.live) return { live: false };
  const state = parseHellcatNowPlaying(value);
  if (!state?.live || typeof value.ageMs !== "number" || !Number.isFinite(value.ageMs)
    || value.ageMs < 0 || value.ageMs >= HELLCAT_RADIO_STALE_MS) return { live: false };
  return { ...state, live: true, ageMs: value.ageMs };
}

export function hellcatTrackIsLive(
  track: { title: string | null; artist: string | null; track_id?: string | null },
  radio: HellcatRadioResult | null,
): boolean {
  if (!radio?.live) return false;
  if (track.track_id && radio.track_id) return track.track_id === radio.track_id;
  const normalize = (text: string | null) => text?.trim().toLowerCase() || "";
  const title = normalize(track.title), artist = normalize(track.artist);
  return Boolean(title && artist && title === normalize(radio.title) && artist === normalize(radio.artist));
}
