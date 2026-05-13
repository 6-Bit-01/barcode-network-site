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
