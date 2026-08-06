from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing expected text for {label}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"expected one replacement for {label}, got {count}")
    return updated


track_path = ROOT / "src/lib/track-duration.ts"
track = track_path.read_text()
track = replace_once(
    track,
    'import { INTERNAL_BUFFER_DURATION_SECONDS, parseTikTokVideoUrl } from "./queue-types";\n',
    'import { createProviderFetchBudget, fetchProviderJson } from "./provider-fetch";\n'
    'import { INTERNAL_BUFFER_DURATION_SECONDS, parseTikTokVideoUrl } from "./queue-types";\n',
    "track-duration provider fetch import",
)
track = replace_once(track, "const FETCH_TIMEOUT_MS = 2500;\n", "", "retired local timeout constant")
track = regex_once(
    track,
    r'\nasync function fetchJsonWithTimeout\(url: string, init: RequestInit = \{\}\): Promise<unknown> \{.*?\n\}\n',
    "\n",
    "retired local provider fetch helper",
)
track = track.replace("fetchJsonWithTimeout(", "fetchProviderJson(")
track = replace_once(
    track,
    'async function detectSpotifyDuration(trackId: string): Promise<TrackDurationDetectionResult> {\n',
    'async function detectSpotifyDuration(trackId: string): Promise<TrackDurationDetectionResult> {\n'
    '  const budget = createProviderFetchBudget();\n',
    "Spotify shared provider budget",
)
track = replace_once(
    track,
    '    body: "grant_type=client_credentials",\n  });\n  const token =',
    '    body: "grant_type=client_credentials",\n  }, budget);\n  const token =',
    "Spotify token shared budget",
)
track = replace_once(
    track,
    '  const track = await fetchProviderJson(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${token}` } });\n',
    '  const track = await fetchProviderJson(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${token}` } }, budget);\n',
    "Spotify track shared budget",
)
track_path.write_text(track)

queue_path = ROOT / "src/lib/queue.ts"
queue = queue_path.read_text()
queue = replace_once(
    queue,
    'import { detectTrackDurationFromLink, parseIso8601DurationToSeconds, parseSpotifyTrackId, parseYouTubeVideoId as parseTrackDurationYouTubeVideoId } from "./track-duration";\n',
    'import { createProviderFetchBudget, fetchProviderJson } from "./provider-fetch";\n'
    'import { parseIso8601DurationToSeconds, parseSpotifyTrackId, parseYouTubeVideoId as parseTrackDurationYouTubeVideoId } from "./track-duration";\n',
    "queue provider fetch import",
)
queue = replace_once(queue, "const TIKTOK_OEMBED_TIMEOUT_MS = 2500;\n", "", "retired TikTok timeout constant")
queue = replace_once(queue, "const TIKTOK_OEMBED_MAX_BYTES = 256 * 1024;\n", "", "retired TikTok body cap constant")

provider_region = r'''async function lookupYouTubeMetadata\(link: string\): Promise<ProviderMetadata> \{.*?\n\}\n\nfunction normalizeIdentity'''
new_provider_region = r'''async function lookupYouTubeMetadata(link: string, budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const key = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY;
  const id = parseYouTubeVideoId(link);
  if (!key || !id) return blankProvider("internal_estimate");
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
  const payload = await fetchProviderJson(url, {}, budget) as {
    items?: Array<{
      contentDetails?: { duration?: unknown };
      snippet?: { title?: unknown; channelTitle?: unknown };
    }>;
  } | null;
  const item = Array.isArray(payload?.items) ? payload.items[0] : null;
  const duration = typeof item?.contentDetails?.duration === "string" ? parseYouTubeDuration(item.contentDetails.duration) : null;
  const providerTitle = sanitizeProviderText(item?.snippet?.title, 240);
  const channelTitle = sanitizeProviderText(item?.snippet?.channelTitle, 160);
  return { detectedArtistName: channelTitle, detectedSongTitle: providerTitle, providerTitle, detectedDurationSeconds: duration, durationSource: duration ? "youtube_api" : "internal_estimate", artworkUrl: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null };
}

function spotifyOEmbedUrl(link: string): string {
  const trackId = link.match(/spotify:track:([a-zA-Z0-9]+)/)?.[1];
  return trackId ? `https://open.spotify.com/track/${trackId}` : link;
}

async function lookupSpotifyOEmbed(link: string, base: ProviderMetadata = blankProvider("internal_estimate"), budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const payload = await fetchProviderJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyOEmbedUrl(link))}`, {}, budget) as { thumbnail_url?: unknown; title?: unknown } | null;
  if (!payload) return base;
  const artworkUrl = safeHttpsPublicUrl(payload.thumbnail_url) ?? base.artworkUrl ?? null;
  const providerTitle = base.providerTitle ?? sanitizeProviderText(payload.title, 240);
  return { ...base, providerTitle, artworkUrl };
}

async function lookupSpotifyMetadata(link: string, budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const fallback = (base: ProviderMetadata = blankProvider("internal_estimate")) => lookupSpotifyOEmbed(link, base, budget);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const trackId = parseSpotifyTrackId(link);
  if (!trackId || !clientId || !clientSecret) return fallback();
  const tokenPayload = await fetchProviderJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }, budget) as { access_token?: unknown } | null;
  const token = sanitizeProviderText(tokenPayload?.access_token, 4096);
  if (!token) return fallback();
  const track = await fetchProviderJson(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${token}` } }, budget) as {
    duration_ms?: unknown;
    artists?: Array<{ name?: unknown }>;
    name?: unknown;
    album?: { images?: Array<{ url?: unknown }> };
  } | null;
  if (!track) return fallback();
  const seconds = typeof track.duration_ms === "number" ? Math.round(track.duration_ms / 1000) : null;
  const artist = Array.isArray(track.artists) ? track.artists.map((item) => sanitizeProviderText(item.name, 120)).filter((value): value is string => Boolean(value)).join(", ") : null;
  const title = sanitizeProviderText(track.name, 240);
  const artworkUrl = Array.isArray(track.album?.images) ? track.album.images.map((image) => safeHttpsPublicUrl(image.url)).find((value): value is string => Boolean(value)) ?? null : null;
  const metadata = { detectedArtistName: artist || null, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "spotify_api" as const : "internal_estimate" as const, artworkUrl };
  return artworkUrl ? metadata : fallback(metadata);
}

async function lookupSoundCloudOEmbed(link: string, base: ProviderMetadata = blankProvider("internal_estimate"), budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const payload = await fetchProviderJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link)}`, {}, budget) as { thumbnail_url?: unknown; title?: unknown } | null;
  if (!payload) return base;
  const artworkUrl = safeHttpsPublicUrl(payload.thumbnail_url) ?? base.artworkUrl ?? null;
  const providerTitle = base.providerTitle ?? sanitizeProviderText(payload.title, 240);
  return { ...base, providerTitle, artworkUrl };
}

function sanitizeProviderText(value: unknown, maxLength = 180): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function safeHttpsPublicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

async function lookupTikTokMetadata(link: string, budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const parsed = parseTikTokVideoUrl(link);
  if (!parsed?.oEmbedSourceUrl) return blankProvider("internal_estimate");
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.oEmbedSourceUrl)}`;
  const payload = await fetchProviderJson(endpoint, {}, budget) as { author_name?: unknown; title?: unknown; thumbnail_url?: unknown } | null;
  if (!payload) return blankProvider("internal_estimate");
  return {
    detectedArtistName: sanitizeProviderText(payload.author_name, 120),
    detectedSongTitle: null,
    providerTitle: sanitizeProviderText(payload.title, 240),
    detectedDurationSeconds: null,
    durationSource: "internal_estimate",
    artworkUrl: safeHttpsPublicUrl(payload.thumbnail_url),
  };
}

async function lookupSoundCloudMetadata(link: string, budget = createProviderFetchBudget()): Promise<ProviderMetadata> {
  const fallback = (base: ProviderMetadata = blankProvider("internal_estimate")) => lookupSoundCloudOEmbed(link, base, budget);
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  if (!clientId) return fallback();
  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(link)}&client_id=${encodeURIComponent(clientId)}`;
  const track = await fetchProviderJson(resolveUrl, {}, budget) as {
    duration?: unknown;
    title?: unknown;
    user?: { username?: unknown };
    artwork_url?: unknown;
  } | null;
  if (!track) return fallback();
  const seconds = typeof track.duration === "number" ? Math.round(track.duration / 1000) : null;
  const title = sanitizeProviderText(track.title, 240);
  const artist = sanitizeProviderText(track.user?.username, 160);
  const rawArtwork = safeHttpsPublicUrl(track.artwork_url);
  const artworkUrl = rawArtwork ? rawArtwork.replace("-large.", "-t500x500.") : null;
  const metadata = { detectedArtistName: artist, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "soundcloud_api" as const : "internal_estimate" as const, artworkUrl };
  return artworkUrl ? metadata : fallback(metadata);
}

export async function detectProviderMetadata(sourceType: QueueSourceType, link: string): Promise<ProviderMetadata> {
  const budget = createProviderFetchBudget();
  try {
    if (sourceType === "youtube") return await lookupYouTubeMetadata(link, budget);
    if (sourceType === "spotify") return await lookupSpotifyMetadata(link, budget);
    if (sourceType === "soundcloud") return await lookupSoundCloudMetadata(link, budget);
    if (sourceType === "tiktok") return await lookupTikTokMetadata(link, budget);
    return blankProvider("internal_estimate");
  } catch (error) {
    console.warn("[queue] provider metadata lookup failed", error);
    return blankProvider("internal_estimate");
  }
}

function normalizeIdentity'''
queue = regex_once(queue, provider_region, new_provider_region, "queue provider metadata region")
queue_path.write_text(queue)

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text())
queue_tests = package["scripts"]["test:queue"].split()
command = package["scripts"]["test:queue"]
for test_file in ("tests/track-duration.test.mjs", "tests/provider-metadata-failsoft.test.mjs"):
    if test_file not in command:
        command += f" {test_file}"
package["scripts"]["test:queue"] = command
package_path.write_text(json.dumps(package, indent=2) + "\n")

readme_path = ROOT / "README.md"
readme = readme_path.read_text()
readme = replace_once(
    readme,
    '| Provider metadata | `YOUTUBE_DATA_API_KEY` or `YOUTUBE_API_KEY`, Spotify credentials, `SOUNDCLOUD_CLIENT_ID`, `APPLE_MUSIC_DEVELOPER_TOKEN` |',
    '| Provider metadata | `YOUTUBE_DATA_API_KEY` or `YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, optional `SOUNDCLOUD_CLIENT_ID` |',
    "README provider environment row",
)
readme = replace_once(
    readme,
    "The queue production capability is fail-closed.",
    "YouTube Music watch links use the same YouTube video-ID and Data API path as ordinary YouTube links. Provider metadata is optional and fail-soft: unavailable, slow, malformed, or oversized responses fall back to submitted track details and the queue's internal duration estimate instead of blocking intake. Apple Music is currently accepted through the generic external-open link path; no active `APPLE_MUSIC_DEVELOPER_TOKEN` integration exists on the trusted queue baseline.\n\nThe queue production capability is fail-closed.",
    "README provider behavior note",
)
readme_path.write_text(readme)

test_path = ROOT / "tests/provider-metadata-failsoft.test.mjs"
test_path.write_text(r'''import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const resolved = path.join(projectRoot, "src", request.slice(2));
    if (fs.existsSync(resolved)) return resolved;
    if (fs.existsSync(`${resolved}.ts`)) return `${resolved}.ts`;
    if (fs.existsSync(`${resolved}.tsx`)) return `${resolved}.tsx`;
    return resolved;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const providerFetch = require("../src/lib/provider-fetch.ts");
const queue = require("../src/lib/queue.ts");

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

async function withFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withProviderEnv(values, callback) {
  const keys = ["YOUTUBE_API_KEY", "YOUTUBE_DATA_API_KEY", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SOUNDCLOUD_CLIENT_ID"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function trackInput(label, link, sourceType) {
  return {
    artist: `${label} Submitted Artist`,
    title: `${label} Submitted Title`,
    tiktokHandle: `@${label.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    link,
    sourceType,
  };
}

test("bounded provider JSON fetch aborts stalled requests", { concurrency: false }, async () => {
  let signal;
  const result = await withFetch((_url, init = {}) => new Promise((_resolve, reject) => {
    signal = init.signal;
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }), () => providerFetch.fetchProviderJson("https://provider.example/stall", {}, providerFetch.createProviderFetchBudget(20)));
  assert.equal(result, null);
  assert.equal(signal?.aborted, true);
});

test("bounded provider JSON fetch rejects oversized and malformed bodies", { concurrency: false }, async () => {
  const declared = await withFetch(async () => jsonResponse({ ok: true }, { headers: { "content-length": "4096" } }), () => providerFetch.fetchProviderJson("https://provider.example/declared", {}, providerFetch.createProviderFetchBudget(250), { maxBytes: 32 }));
  assert.equal(declared, null);

  const streamed = await withFetch(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ value: "x".repeat(128) }))); controller.close(); } }), { headers: { "content-type": "application/json" } }), () => providerFetch.fetchProviderJson("https://provider.example/streamed", {}, providerFetch.createProviderFetchBudget(250), { maxBytes: 32 }));
  assert.equal(streamed, null);

  const malformed = await withFetch(async () => new Response("{bad", { headers: { "content-type": "application/json" } }), () => providerFetch.fetchProviderJson("https://provider.example/malformed", {}, providerFetch.createProviderFetchBudget(250)));
  assert.equal(malformed, null);
});

test("bounded provider JSON fetch returns valid JSON", { concurrency: false }, async () => {
  const result = await withFetch(async () => jsonResponse({ ok: true }), () => providerFetch.fetchProviderJson("https://provider.example/ok", {}, providerFetch.createProviderFetchBudget(250)));
  assert.deepEqual(result, { ok: true });
});

test("YouTube Music uses the normal YouTube API metadata path", { concurrency: false }, async () => withProviderEnv({ YOUTUBE_DATA_API_KEY: "youtube-test" }, async () => {
  const calls = [];
  const track = await withFetch(async (url) => {
    calls.push(String(url));
    return jsonResponse({ items: [{ snippet: { title: "YT Music Title", channelTitle: "YT Music Artist" }, contentDetails: { duration: "PT3M21S" } }] });
  }, () => queue.createQueueTrack(trackInput("YTMusic", "https://music.youtube.com/watch?v=abc123_DEF45&list=test", "youtube")));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /youtube\/v3\/videos/);
  assert.equal(track.detectedArtistName, "YT Music Artist");
  assert.equal(track.detectedSongTitle, "YT Music Title");
  assert.equal(track.detectedDurationSeconds, 201);
  assert.equal(track.durationSource, "youtube_api");
  assert.equal(track.durationIsEstimate, false);
  assert.equal(track.sourceArtworkUrl, "https://img.youtube.com/vi/abc123_DEF45/hqdefault.jpg");
}));

test("YouTube failure preserves submitted fields and one estimated queue entry", { concurrency: false }, async () => withProviderEnv({ YOUTUBE_API_KEY: "youtube-test" }, async () => {
  await queue.setQueueOpen(false);
  await queue.startNewQueueSession({ title: `Provider failure ${Date.now()}` });
  await queue.setQueueOpen(true);
  const track = await withFetch(async () => new Response("unavailable", { status: 503 }), () => queue.submitRadioTrack(trackInput("YTFail", "https://www.youtube.com/watch?v=failed_DEF45", "youtube")));
  const state = await queue.getRadioQueueState();
  const matches = [state.nowPlaying, state.nextInLine, ...state.queue].filter((entry) => entry?.id === track.id);
  assert.equal(matches.length, 1);
  assert.equal(track.artist, "YTFail Submitted Artist");
  assert.equal(track.title, "YTFail Submitted Title");
  assert.equal(track.detectedArtistName, null);
  assert.equal(track.detectedSongTitle, null);
  assert.equal(track.detectedDurationSeconds, null);
  assert.equal(track.estimatedDurationSeconds, 300);
  assert.equal(track.durationIsEstimate, true);
  assert.equal(track.durationSource, "internal_estimate");
}));

test("Spotify token failure falls back safely to public oEmbed", { concurrency: false }, async () => withProviderEnv({ SPOTIFY_CLIENT_ID: "client", SPOTIFY_CLIENT_SECRET: "secret" }, async () => {
  const calls = [];
  const track = await withFetch(async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("accounts.spotify.com")) return new Response("no token", { status: 401 });
    if (value.includes("open.spotify.com/oembed")) return jsonResponse({ title: "Spotify oEmbed Title", thumbnail_url: "https://i.scdn.co/image/test" });
    throw new Error(`unexpected fetch ${value}`);
  }, () => queue.createQueueTrack(trackInput("SpotifyFallback", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=test", "spotify")));
  assert.equal(calls.filter((value) => value.includes("accounts.spotify.com")).length, 1);
  assert.equal(calls.filter((value) => value.includes("open.spotify.com/oembed")).length, 1);
  assert.equal(calls.some((value) => value.includes("api.spotify.com/v1/tracks")), false);
  assert.equal(track.providerTitle, "Spotify oEmbed Title");
  assert.equal(track.sourceArtworkUrl, "https://i.scdn.co/image/test");
  assert.equal(track.detectedDurationSeconds, null);
  assert.equal(track.durationIsEstimate, true);
}));

test("Spotify success uses one token and one track request without duplicate duration lookup", { concurrency: false }, async () => withProviderEnv({ SPOTIFY_CLIENT_ID: "client", SPOTIFY_CLIENT_SECRET: "secret" }, async () => {
  const calls = [];
  const track = await withFetch(async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("accounts.spotify.com")) return jsonResponse({ access_token: "spotify-token" });
    if (value.includes("api.spotify.com/v1/tracks")) return jsonResponse({ duration_ms: 202400, name: "Spotify API Title", artists: [{ name: "Spotify API Artist" }], album: { images: [{ url: "https://i.scdn.co/image/api" }] } });
    throw new Error(`unexpected fetch ${value}`);
  }, () => queue.createQueueTrack(trackInput("SpotifySuccess", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "spotify")));
  assert.equal(calls.length, 2);
  assert.equal(calls.filter((value) => value.includes("accounts.spotify.com")).length, 1);
  assert.equal(calls.filter((value) => value.includes("api.spotify.com/v1/tracks")).length, 1);
  assert.equal(track.detectedArtistName, "Spotify API Artist");
  assert.equal(track.detectedSongTitle, "Spotify API Title");
  assert.equal(track.detectedDurationSeconds, 202);
  assert.equal(track.durationSource, "spotify_api");
  assert.equal(track.durationIsEstimate, false);
}));

test("SoundCloud resolve failure falls back safely to public oEmbed", { concurrency: false }, async () => withProviderEnv({ SOUNDCLOUD_CLIENT_ID: "soundcloud-client" }, async () => {
  const calls = [];
  const track = await withFetch(async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("api-v2.soundcloud.com/resolve")) return new Response("unavailable", { status: 503 });
    if (value.includes("soundcloud.com/oembed")) return jsonResponse({ title: "SoundCloud oEmbed Title", thumbnail_url: "https://i1.sndcdn.com/artworks-test-large.jpg" });
    throw new Error(`unexpected fetch ${value}`);
  }, () => queue.createQueueTrack(trackInput("SoundCloudFallback", "https://soundcloud.com/artist-name/track-name", "soundcloud")));
  assert.equal(calls.filter((value) => value.includes("api-v2.soundcloud.com/resolve")).length, 1);
  assert.equal(calls.filter((value) => value.includes("soundcloud.com/oembed")).length, 1);
  assert.equal(track.providerTitle, "SoundCloud oEmbed Title");
  assert.equal(track.sourceArtworkUrl, "https://i1.sndcdn.com/artworks-test-large.jpg");
  assert.equal(track.detectedDurationSeconds, null);
  assert.equal(track.durationIsEstimate, true);
}));
''')

print("provider API fail-soft patch applied")
