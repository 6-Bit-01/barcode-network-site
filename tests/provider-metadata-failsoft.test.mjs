import assert from "node:assert/strict";
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
