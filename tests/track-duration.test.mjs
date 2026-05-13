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

test("parses YouTube watch, short, and shorts URLs", () => {
  assert.equal(duration.parseYouTubeVideoId("https://www.youtube.com/watch?v=abc123_DEF45"), "abc123_DEF45");
  assert.equal(duration.parseYouTubeVideoId("https://youtu.be/abc123_DEF45?si=test"), "abc123_DEF45");
  assert.equal(duration.parseYouTubeVideoId("https://www.youtube.com/shorts/abc123_DEF45"), "abc123_DEF45");
});

test("parses Spotify track URLs", () => {
  assert.equal(duration.parseSpotifyTrackId("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=test"), "4uLU6hMCjMI75M1A2tKUQC");
  assert.equal(duration.parseSpotifyTrackId("spotify:track:4uLU6hMCjMI75M1A2tKUQC"), "4uLU6hMCjMI75M1A2tKUQC");
});

test("parses ISO 8601 provider durations", () => {
  assert.equal(duration.parseIso8601DurationToSeconds("PT3M20S"), 200);
  assert.equal(duration.parseIso8601DurationToSeconds("PT1H2M3S"), 3723);
});

test("unknown providers return unavailable detection", async () => {
  const result = await duration.detectTrackDurationFromLink("https://example.com/song.mp3");
  assert.equal(result.durationSeconds, null);
  assert.equal(result.durationIsEstimate, true);
  assert.equal(result.durationSource, "unknown");
});

test("missing detected duration can be represented as an estimate", () => {
  const result = duration.uploadTrackDurationResult(null);
  assert.equal(result.durationSeconds, 300);
  assert.equal(result.durationIsEstimate, true);
  assert.equal(result.durationSource, "estimated");
});

test("unsupported file hosts are not safe duration sources", () => {
  assert.equal(duration.parseSafeTrackProviderUrl("https://drive.google.com/file/d/abc/view"), null);
  assert.equal(duration.parseSafeTrackProviderUrl("https://www.dropbox.com/s/abc/song.wav"), null);
  assert.equal(duration.parseSafeTrackProviderUrl("https://random.example/audio/song.mp3"), null);
});
