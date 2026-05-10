import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Keep queue tests isolated to the in-memory store instead of any configured Redis.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

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
const queue = require("../src/lib/queue.ts");

let trackSequence = 0;
async function addTrack(label) {
  trackSequence += 1;
  return queue.addToQueue({
    artist: `${label} Artist`,
    title: `${label} Track`,
    tiktokHandle: `@${label.toLowerCase()}${trackSequence}`,
    link: `https://example.com/${label.toLowerCase()}-${trackSequence}`,
    tier: "free",
    lane: "regular",
    amount: 0,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, trackSequence)).toISOString(),
  });
}

test("loading priority before playback preserves opening state and keeps wheel owed after priority finishes", async () => {
  await queue.startNewQueueSession({ title: `Playback pointer test ${Date.now()}` });

  const free = await addTrack("Free");
  const wheel = await addTrack("Wheel");
  let state = await queue.updateRadioTrack(wheel.id, "wheel");
  assert.equal(state.nextInLine?.id, wheel.id, "wheel track should be staged for the opening state before priority arrives");
  assert.equal(state.nextNonPriorityLane, "wheel");
  assert.equal(state.session.playbackStarted, false);

  const priority = await addTrack("Priority");
  state = await queue.updateRadioTrack(priority.id, "priority");
  assert.equal(state.nextInLine?.id, priority.id, "active priority should displace the staged wheel track");

  state = await queue.updateRadioTrack(priority.id, "load");
  assert.equal(state.nowPlaying?.id, priority.id, "loading should cue the priority track");
  assert.equal(state.session.playbackStarted, false, "loading/cueing must not start playback");
  assert.equal(state.nextNonPriorityLane, "wheel", "loading priority must not consume the wheel obligation");

  state = await queue.updateRadioTrack("", "startPlayback");
  assert.equal(state.session.playbackStarted, true, "explicit playback start should mark playback as started");

  state = await queue.updateRadioTrack(priority.id, "finish");
  assert.equal(state.nextNonPriorityLane, "wheel", "finishing priority must not advance the non-priority pointer");
  assert.equal(state.nextInLine?.id, wheel.id, "wheel should remain owed immediately after the priority track finishes");
  assert.notEqual(state.nextInLine?.id, free.id, "free should not be staged before the owed wheel track");
});
