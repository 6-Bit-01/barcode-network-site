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
Module._extensions[".tsx"] = Module._extensions[".ts"];

const require = createRequire(import.meta.url);
const queueTypes = require("../src/lib/queue-types.ts");
const queue = require("../src/lib/queue.ts");
const queueRoute = require("../src/app/api/queue/route.ts");

function legalBody(overrides = {}) {
  return {
    artist: "Boundary Artist",
    title: "Boundary Track",
    mode: "link",
    link: "https://example.com/track",
    tiktokHandle: "@boundaryartist",
    acceptedLegal: true,
    termsVersion: queueTypes.PUBLIC_QUEUE_LEGAL_TERMS_VERSION,
    privacyVersion: queueTypes.PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION,
    queueTermsVersion: queueTypes.PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION,
    acceptedCheckboxText: queueTypes.PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT,
    ...overrides,
  };
}

function stateIds(state) {
  return [
    ...state.queue.map((entry) => entry.id),
    ...(state.nextInLine ? [state.nextInLine.id] : []),
    ...(state.nowPlaying ? [state.nowPlaying.id] : []),
    ...state.history.map((entry) => entry.id),
    ...(state.removed ?? []).map((entry) => entry.id),
  ].sort();
}

test("Apple Music intake boundary matches only the real Apple Music host", () => {
  assert.equal(queueTypes.isAppleMusicUrl("https://music.apple.com/us/album/example/123?i=456"), true);
  assert.equal(queueTypes.isAppleMusicUrl("https://music.apple.com./us/album/example/123?i=456"), true);
  assert.equal(queueTypes.isAppleMusicUrl("https://embed.music.apple.com/us/album/example/123?i=456"), true);
  assert.equal(queueTypes.isAppleMusicUrl("https://music.apple.com.evil.example/us/album/example/123?i=456"), false);
  assert.equal(queueTypes.isAppleMusicUrl("https://apple.com/music"), false);
  assert.equal(queueTypes.isAppleMusicUrl("not a url"), false);

  for (const value of [
    "https://www.youtube.com/watch?v=abc123_DEF45",
    "https://music.youtube.com/watch?v=abc123_DEF45",
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    "https://soundcloud.com/artist/track",
    "https://www.tiktok.com/@artist/video/1234567890123456789",
    "https://artist.bandcamp.com/track/example",
    "https://example.com/direct-track",
    "https://store.private.blob.vercel-storage.com/barcode-radio-queue/example.mp3",
  ]) {
    assert.equal(queueTypes.isAppleMusicUrl(value), false, `${value} must remain outside the Apple boundary`);
  }
});

test("server rejects new Apple Music intake without mutating existing queue records", { concurrency: false }, async () => {
  const current = await queue.getRadioQueueState();
  if (current.revision !== 0 && current.session.status !== "archived") {
    await queue.archiveCurrentQueueSession();
  }
  const started = await queue.startNewQueueSession({
    title: `Apple boundary ${Date.now()}`,
    purpose: "live_broadcast",
    submissionCooldownSeconds: 0,
  });
  await queue.setQueueOpen(true);

  const existing = await queue.addToQueue({
    artist: "Existing Apple Artist",
    title: "Existing Apple Track",
    tiktokHandle: "@existingapple",
    link: "https://music.apple.com/us/album/existing/100?i=200",
    sourceType: "other",
    tier: "free",
    lane: "regular",
    amount: 0,
    createdAt: new Date().toISOString(),
  });
  const before = await queue.getRadioQueueState();

  const response = await queueRoute.submitTrackFromBody(legalBody({
    sessionId: started.session.sessionId,
    link: "https://music.apple.com/us/album/rejected/300?i=400",
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "apple_music_unsupported");
  assert.equal(payload.error, queueTypes.APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE);

  const after = await queue.getRadioQueueState();
  assert.deepEqual(stateIds(after), stateIds(before));
  assert.equal(after.revision, before.revision, "Apple rejection must happen before any stateful queue read or write");
  assert.equal(stateIds(after).filter((id) => id === existing.id).length, 1);

  const accepted = await queueRoute.submitTrackFromBody(legalBody({
    sessionId: started.session.sessionId,
    artist: "Generic Artist",
    title: "Generic Track",
    tiktokHandle: "@genericartist",
    link: `https://example.com/track-${Date.now()}`,
  }));
  const acceptedPayload = await accepted.json();
  assert.equal(accepted.status, 201, JSON.stringify(acceptedPayload));
});

test("Apple rejection is ordered before the active queue snapshot read", () => {
  const routeSource = fs.readFileSync(path.join(projectRoot, "src/app/api/queue/route.ts"), "utf8");
  const functionStart = routeSource.indexOf("export async function submitTrackFromBody");
  const functionSource = routeSource.slice(functionStart);
  const appleBoundary = functionSource.indexOf("isAppleMusicUrl(link)");
  const activeSnapshot = functionSource.indexOf("getPublicQueueSnapshot()");
  assert.ok(appleBoundary >= 0, "Apple boundary must remain server-side");
  assert.ok(activeSnapshot >= 0, "queue synchronization snapshot must remain present");
  assert.ok(appleBoundary < activeSnapshot, "unsupported Apple links must be rejected before reading queue state");
});

test("operational Radio copy and client routing no longer advertise or accept Apple Music", () => {
  const routingSource = fs.readFileSync(path.join(projectRoot, "src/lib/radio-submission-routing.ts"), "utf8");
  const formSource = fs.readFileSync(path.join(projectRoot, "src/components/RadioQueueForm.tsx"), "utf8");
  const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");
  const capabilityDoc = fs.readFileSync(path.join(projectRoot, "docs/queue-production-capability.md"), "utf8");

  assert.doesNotMatch(routingSource, /SoundCloud, Spotify, YouTube, TikTok, Apple Music/);
  assert.doesNotMatch(formSource, /<li>Apple Music<\/li>/);
  assert.match(formSource, /isAppleMusicUrl\(link\)/);
  assert.match(formSource, /APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE/);
  assert.match(readme, /Apple Music is not accepted for BARCODE Radio intake/);
  assert.doesNotMatch(readme, /Apple Music is currently accepted through the generic external-open link path/);
  assert.match(capabilityDoc, /New Apple Music queue submissions are rejected/);
  assert.doesNotMatch(capabilityDoc, /Apple Music remains external-open only/);
});
