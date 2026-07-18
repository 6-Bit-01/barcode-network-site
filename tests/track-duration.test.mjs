import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) return path.join(projectRoot, "src", request.slice(2));
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
const duration = require("../src/lib/track-duration.ts");

function withoutProviderEnv(callback) {
  const original = {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    YOUTUBE_DATA_API_KEY: process.env.YOUTUBE_DATA_API_KEY,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    SOUNDCLOUD_CLIENT_ID: process.env.SOUNDCLOUD_CLIENT_ID,
  };
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_DATA_API_KEY;
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_CLIENT_SECRET;
  delete process.env.SOUNDCLOUD_CLIENT_ID;
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function mockFetch(json) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => json });
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("parses YouTube watch, short, and shorts URLs", () => {
  assert.equal(duration.parseYouTubeVideoId("https://www.youtube.com/watch?v=abc123_DEF45"), "abc123_DEF45");
  assert.equal(duration.parseYouTubeVideoId("https://youtu.be/abc123_DEF45?si=test"), "abc123_DEF45");
  assert.equal(duration.parseYouTubeVideoId("https://www.youtube.com/shorts/abc123_DEF45"), "abc123_DEF45");
  assert.equal(duration.parseYouTubeVideoId("https://music.youtube.com/watch?v=abc123_DEF45&list=test"), "abc123_DEF45");
});

test("parses Spotify track URLs", () => {
  assert.equal(duration.parseSpotifyTrackId("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=test"), "4uLU6hMCjMI75M1A2tKUQC");
  assert.equal(duration.parseSpotifyTrackId("spotify:track:4uLU6hMCjMI75M1A2tKUQC"), "4uLU6hMCjMI75M1A2tKUQC");
});

test("parses SoundCloud public URLs", () => {
  assert.equal(duration.parseSafeTrackProviderUrl("https://soundcloud.com/artist-name/track-name")?.provider, "soundcloud");
});

test("parses ISO 8601 provider durations", () => {
  assert.equal(duration.parseIso8601DurationToSeconds("PT3M20S"), 200);
  assert.equal(duration.parseIso8601DurationToSeconds("PT1H2M3S"), 3723);
});

test("missing YouTube API key returns unavailable without crashing", async () => withoutProviderEnv(async () => {
  const result = await duration.detectTrackDurationFromLink("https://www.youtube.com/watch?v=abc123_DEF45");
  assert.equal(result.durationSeconds, null);
  assert.equal(result.durationIsEstimate, true);
  assert.equal(result.durationSource, "unknown");
  assert.match(result.notes.join(" "), /YouTube Data API key is not configured/);
}));

test("missing Spotify credentials return unavailable without crashing", async () => withoutProviderEnv(async () => {
  const result = await duration.detectTrackDurationFromLink("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
  assert.equal(result.durationSeconds, null);
  assert.equal(result.durationIsEstimate, true);
  assert.equal(result.durationSource, "unknown");
  assert.match(result.notes.join(" "), /Spotify client credentials are not configured/);
}));

test("missing SoundCloud client id returns unavailable without crashing", async () => withoutProviderEnv(async () => {
  const result = await duration.detectTrackDurationFromLink("https://soundcloud.com/artist-name/track-name");
  assert.equal(result.durationSeconds, null);
  assert.equal(result.durationIsEstimate, true);
  assert.equal(result.durationSource, "unknown");
  assert.match(result.notes.join(" "), /SoundCloud client id is not configured/);
}));

test("unknown providers return unavailable detection", async () => {
  const result = await duration.detectTrackDurationFromLink("https://example.com/song.mp3");
  assert.equal(result.durationSeconds, null);
  assert.equal(result.durationIsEstimate, true);
  assert.equal(result.durationSource, "unknown");
});

test("upload duration result stores detected upload duration", () => {
  const result = duration.uploadTrackDurationResult(187.4);
  assert.equal(result.durationSeconds, 187);
  assert.equal(result.durationIsEstimate, false);
  assert.equal(result.durationSource, "upload_metadata");
});

test("upload missing duration falls back to 300 estimated seconds", () => {
  const result = duration.uploadTrackDurationResult(null);
  assert.equal(result.durationSeconds, 300);
  assert.equal(result.durationIsEstimate, true);
  assert.equal(result.durationSource, "estimated");
});

test("link unavailable result can be converted to stored 300 second estimate", async () => {
  const result = await duration.detectTrackDurationFromLink("https://example.com/song.mp3");
  assert.deepEqual(duration.trackDurationStorageFields(result), {
    detectedDurationSeconds: null,
    estimatedDurationSeconds: 300,
    durationIsEstimate: true,
    durationSource: "estimated",
  });
});

test("successful YouTube lookup stores detected duration source", async () => {
  const originalKey = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = "test-key";
  const restoreFetch = mockFetch({ items: [{ contentDetails: { duration: "PT3M20S" } }] });
  try {
    const result = await duration.detectTrackDurationFromLink("https://www.youtube.com/watch?v=abc123_DEF45");
    assert.deepEqual(duration.trackDurationStorageFields(result), {
      detectedDurationSeconds: 200,
      estimatedDurationSeconds: 200,
      durationIsEstimate: false,
      durationSource: "youtube_api",
    });
  } finally {
    restoreFetch();
    if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalKey;
  }
});

test("successful Spotify lookup stores detected duration source", async () => {
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  process.env.SPOTIFY_CLIENT_ID = "test-client";
  process.env.SPOTIFY_CLIENT_SECRET = "test-secret";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("accounts.spotify.com")) return { ok: true, json: async () => ({ access_token: "token" }) };
    return { ok: true, json: async () => ({ duration_ms: 201500 }) };
  };
  try {
    const result = await duration.detectTrackDurationFromLink("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
    assert.deepEqual(duration.trackDurationStorageFields(result), {
      detectedDurationSeconds: 202,
      estimatedDurationSeconds: 202,
      durationIsEstimate: false,
      durationSource: "spotify_api",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.SPOTIFY_CLIENT_ID;
    else process.env.SPOTIFY_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.SPOTIFY_CLIENT_SECRET;
    else process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;
  }
});

test("successful SoundCloud lookup stores detected duration source", async () => {
  const originalClientId = process.env.SOUNDCLOUD_CLIENT_ID;
  process.env.SOUNDCLOUD_CLIENT_ID = "test-client";
  const restoreFetch = mockFetch({ duration: 199900 });
  try {
    const result = await duration.detectTrackDurationFromLink("https://soundcloud.com/artist-name/track-name");
    assert.deepEqual(duration.trackDurationStorageFields(result), {
      detectedDurationSeconds: 200,
      estimatedDurationSeconds: 200,
      durationIsEstimate: false,
      durationSource: "soundcloud_api",
    });
  } finally {
    restoreFetch();
    if (originalClientId === undefined) delete process.env.SOUNDCLOUD_CLIENT_ID;
    else process.env.SOUNDCLOUD_CLIENT_ID = originalClientId;
  }
});

test("unsupported file hosts are not safe duration sources", () => {
  assert.equal(duration.parseSafeTrackProviderUrl("https://drive.google.com/file/d/abc/view"), null);
  assert.equal(duration.parseSafeTrackProviderUrl("https://www.dropbox.com/s/abc/song.wav"), null);
  assert.equal(duration.parseSafeTrackProviderUrl("https://random.example/audio/song.mp3"), null);
});

const queueTypes = require("../src/lib/queue-types.ts");
const tiktokPost = "https://www.tiktok.com/@scout2015/video/6718335390845095173";
const tiktokPlayer = "https://www.tiktok.com/player/v1/6718335390845095173";

test("parses canonical TikTok post and player URLs strictly", () => {
  assert.equal(queueTypes.parseTikTokVideoUrl(tiktokPost)?.postId, "6718335390845095173");
  assert.equal(queueTypes.parseTikTokVideoUrl("https://www.tiktok.com/@Scout2015/video/6718335390845095173")?.canonicalSourceUrl, tiktokPost);
  assert.equal(queueTypes.parseTikTokVideoUrl(`${tiktokPost}?utm_source=test`)?.canonicalSourceUrl, tiktokPost);
  assert.equal(queueTypes.parseTikTokVideoUrl(`${tiktokPost}#frag`)?.canonicalSourceUrl, tiktokPost);
  assert.equal(queueTypes.parseTikTokVideoUrl(tiktokPlayer)?.sourceForm, "player");
  assert.equal(queueTypes.parseTikTokVideoUrl(tiktokPost)?.postId, queueTypes.parseTikTokVideoUrl(tiktokPlayer)?.postId);
});

test("rejects non-canonical TikTok and lookalike URLs", () => {
  for (const value of [
    "https://www.tiktok.com/@scout2015",
    "https://www.tiktok.com/tag/music",
    "https://www.tiktok.com/music/song-123",
    "https://www.tiktok.com/@scout2015/live",
    "https://www.tiktok.com/@scout2015/collection/name-123",
    "https://www.tiktok.com/@scout2015/video/",
    "https://www.tiktok.com/@scout2015/video/notnumeric",
    "https://www.tiktok.com/@scout2015/video/1234567",
    "http://www.tiktok.com/@scout2015/video/6718335390845095173",
    "https://evil-tiktok.com/@scout2015/video/6718335390845095173",
    "https://tiktok.com.evil.example/@scout2015/video/6718335390845095173",
    "https://user@www.tiktok.com/@scout2015/video/6718335390845095173",
    "https://www.tiktok.com:444/@scout2015/video/6718335390845095173",
  ]) assert.equal(queueTypes.parseTikTokVideoUrl(value), null, value);
});

test("permits only safe HTTPS TikTok artwork passthrough", () => {
  assert.equal(queueTypes.getTrackArtworkUrl({ sourceType: "tiktok", sourceArtworkUrl: "https://example.com/art.jpg" }), "https://example.com/art.jpg");
  assert.equal(queueTypes.getTrackArtworkUrl({ sourceType: "tiktok", sourceArtworkUrl: "http://example.com/art.jpg" }), null);
  assert.equal(queueTypes.getTrackArtworkUrl({ sourceType: "tiktok", sourceArtworkUrl: "https://user@example.com/art.jpg" }), null);
});

test("classifies only canonical TikTok forms as first-class TikTok", () => {
  assert.equal(queueTypes.detectQueueSourceType(tiktokPost), "tiktok");
  assert.equal(queueTypes.detectQueueSourceType(tiktokPlayer), "tiktok");
  assert.equal(queueTypes.detectQueueSourceType("https://vm.tiktok.com/ZMabc/"), "other");
  assert.equal(queueTypes.detectQueueSourceType("https://vt.tiktok.com/ZMabc/"), "other");
  assert.equal(queueTypes.detectQueueSourceType("https://m.tiktok.com/v/6718335390845095173"), "other");
});

test("TikTok duration parsing returns unavailable and stores 300 second estimate", async () => {
  const parsed = duration.parseSafeTrackProviderUrl(tiktokPost);
  assert.equal(parsed.provider, "tiktok");
  assert.equal(parsed.providerTrackId, "6718335390845095173");
  assert.equal(parsed.normalizedUrl, tiktokPost);
  const result = await duration.detectTrackDurationFromLink(tiktokPost);
  assert.equal(result.durationSeconds, null);
  assert.equal(result.durationIsEstimate, true);
  assert.equal(result.durationSource, "unknown");
  assert.match(result.notes.join(" "), /does not document exact duration/);
  assert.deepEqual(duration.trackDurationStorageFields(result), { detectedDurationSeconds: null, estimatedDurationSeconds: 300, durationIsEstimate: true, durationSource: "estimated" });
});

const appleUrl = "https://music.apple.com/us/album/example-album/123456789?i=987654321&utm_source=x#frag";

test("parses Apple Music direct song URLs and canonicalizes identity", () => {
  const parsed = queueTypes.parseAppleMusicSongUrl(appleUrl);
  assert.ok(parsed);
  assert.equal(parsed.storefront, "us");
  assert.equal(parsed.albumId, "123456789");
  assert.equal(parsed.songId, "987654321");
  assert.equal(parsed.providerId, "apple_music:song:987654321");
  assert.equal(parsed.canonicalSourceUrl, "https://music.apple.com/us/album/example-album/123456789?i=987654321");
  assert.equal(queueTypes.detectQueueSourceType(appleUrl), "apple_music");
  const durationParsed = duration.parseSafeTrackProviderUrl(appleUrl);
  assert.deepEqual(durationParsed, { provider: "apple_music", providerTrackId: "987654321", normalizedUrl: "https://music.apple.com/us/album/example-album/123456789?i=987654321" });
});

test("rejects unsupported Apple Music URL forms", () => {
  for (const value of [
    "https://music.apple.com/us/album/example-album/123456789",
    "https://music.apple.com/us/artist/example/123456789",
    "https://music.apple.com/us/playlist/example/pl.123",
    "https://music.apple.com/us/station/example/ra.123",
    "https://music.apple.com/us/radio",
    "https://music.apple.com/",
    "http://music.apple.com/us/album/example-album/123456789?i=987654321",
    "https://music.apple.com.evil.test/us/album/example-album/123456789?i=987654321",
    "https://user:pass@music.apple.com/us/album/example-album/123456789?i=987654321",
    "https://music.apple.com:444/us/album/example-album/123456789?i=987654321",
    "https://music.apple.com/us/album/example-album/notnumeric?i=987654321",
    "https://music.apple.com/us/album/example-album/123456789?i=notnumeric",
    "https://music.apple.com/us/album//123456789?i=987654321",
  ]) {
    assert.equal(queueTypes.parseAppleMusicSongUrl(value), null, value);
    assert.notEqual(queueTypes.detectQueueSourceType(value), "apple_music", value);
    assert.equal(duration.parseSafeTrackProviderUrl(value)?.provider === "apple_music", false, value);
  }
});


test("accepts safe international Apple Music album slug segments", () => {
  const cases = [
    ["example-album", "us"],
    ["caf%C3%A9-del-mar", "us"],
    ["%E6%9D%B1%E4%BA%AC", "jp"],
    ["rock-%26-roll", "us"],
    ["album_name", "us"],
  ];
  for (const [slug, storefront] of cases) {
    const parsed = queueTypes.parseAppleMusicSongUrl(`https://music.apple.com/${storefront}/album/${slug}/123456789?i=987654321&utm_source=x#frag`);
    assert.ok(parsed, slug);
    assert.equal(parsed.albumSlug, slug);
    assert.equal(parsed.canonicalSourceUrl, `https://music.apple.com/${storefront}/album/${slug}/123456789?i=987654321`);
    assert.equal(parsed.providerId, "apple_music:song:987654321");
  }
});

test("normalizes Apple Music storefront casing and preserves encoded slug", () => {
  const parsed = queueTypes.parseAppleMusicSongUrl("https://music.apple.com/US/album/caf%C3%A9-del-mar/123456789?i=987654321");
  assert.ok(parsed);
  assert.equal(parsed.storefront, "us");
  assert.equal(parsed.albumSlug, "caf%C3%A9-del-mar");
  assert.equal(parsed.canonicalSourceUrl, "https://music.apple.com/us/album/caf%C3%A9-del-mar/123456789?i=987654321");
});

test("rejects unsafe Apple Music encoded slug and ambiguous song parameter variants", () => {
  const overlong = "a".repeat(301);
  for (const value of [
    "https://music.apple.com/us/album/bad%ZZslug/123456789?i=987654321",
    "https://music.apple.com/us/album/%2F/123456789?i=987654321",
    "https://music.apple.com/us/album/%5C/123456789?i=987654321",
    "https://music.apple.com/us/album/bad%00slug/123456789?i=987654321",
    "https://music.apple.com/us/album/bad%1Fslug/123456789?i=987654321",
    "https://music.apple.com/us/album/./123456789?i=987654321",
    "https://music.apple.com/us/album/../123456789?i=987654321",
    `https://music.apple.com/us/album/${overlong}/123456789?i=987654321`,
    "https://music.apple.com/us/album/example-album/123456789?i=987654321&i=123456789",
  ]) {
    assert.equal(queueTypes.parseAppleMusicSongUrl(value), null, value);
  }
});

test("permits only safe HTTPS Apple Music artwork passthrough", () => {
  assert.equal(queueTypes.getTrackArtworkUrl({ sourceType: "apple_music", sourceArtworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music/art.jpg" }), "https://is1-ssl.mzstatic.com/image/thumb/Music/art.jpg");
  assert.equal(queueTypes.getTrackArtworkUrl({ sourceType: "apple_music", sourceArtworkUrl: "http://is1-ssl.mzstatic.com/art.jpg" }), null);
  assert.equal(queueTypes.getTrackArtworkUrl({ sourceType: "apple_music", sourceArtworkUrl: "https://user@is1-ssl.mzstatic.com/art.jpg" }), null);
});
