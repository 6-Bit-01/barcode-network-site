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
async function freshOpenSession(label) {
  await queue.setQueueOpen(false);
  const state = await queue.startNewQueueSession({ title: `${label} ${Date.now()} ${trackSequence}` });
  await queue.setQueueOpen(true);
  return state.session.sessionId;
}

async function addTrack(label) {
  trackSequence += 1;
  return queue.addToQueue({
    artist: `${label} Artist`,
    title: `${label} Track`,
    tiktokHandle: `@${label.toLowerCase().replace(/[^a-z0-9]/g, "")}${trackSequence}`,
    link: `https://example.com/${label.toLowerCase().replace(/[^a-z0-9]/g, "")}-${trackSequence}`,
    tier: "free",
    lane: "regular",
    amount: 0,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, trackSequence)).toISOString(),
  });
}

async function payPriority(track, sessionId) {
  const result = await queue.markPriorityUpgradePaidFromStripe(track.id, sessionId, {
    paymentId: `pi_test_${trackSequence}_${track.id}`,
    amountCents: 1000,
    currency: "usd",
    paidAt: new Date(Date.UTC(2026, 0, 2, 0, 0, trackSequence)).toISOString(),
  });
  assert.equal(result.updated, true, result.reason ?? "priority payment should update the track");
  return queue.getRadioQueueState();
}

function queuedTrack(state, id) {
  return state.queue.find((entry) => entry.id === id) ?? null;
}

test("paid priority interrupts wheel already in Next In Line and restores that wheel after priority finishes", async () => {
  const sessionId = await freshOpenSession("priority interrupts wheel");
  const free = await addTrack("Free");
  const wheel = await addTrack("Wheel");
  let state = await queue.updateRadioTrack(wheel.id, "wheel");
  assert.equal(state.nextInLine?.id, wheel.id, "wheel track should be staged as Next In Line");
  assert.equal(state.nextNonPriorityLane, "wheel");

  const priority = await addTrack("Priority");
  state = await payPriority(priority, sessionId);
  assert.equal(state.nextInLine?.id, priority.id, "paid priority should replace the staged wheel");
  assert.ok(queuedTrack(state, wheel.id)?.displacedFromNextInLineAt, "interrupted wheel should carry the displaced-from-next marker");

  state = await queue.updateRadioTrack(priority.id, "load");
  assert.equal(state.session.playbackStarted, false, "loading/cueing must not start playback");
  state = await queue.updateRadioTrack("", "startPlayback");
  assert.equal(state.session.playbackStarted, true, "explicit playback start should mark playback as started");

  state = await queue.updateRadioTrack(priority.id, "finish");
  assert.equal(state.nextNonPriorityLane, "wheel", "finishing priority must not advance the non-priority pointer");
  assert.equal(state.nextInLine?.id, wheel.id, "the same interrupted wheel track should return as Next In Line");
  assert.notEqual(state.nextInLine?.id, free.id, "free should not be staged before the interrupted wheel returns");
});

test("paid priority interrupts free already in Next In Line and restores that free after priority finishes", async () => {
  const sessionId = await freshOpenSession("priority interrupts free");
  const free = await addTrack("Free");
  let state = await queue.updateRadioTrack("", "stageFirstFree");
  assert.equal(state.nextInLine?.id, free.id, "free track should be staged as Next In Line");
  const owedBeforePriority = state.nextNonPriorityLane;

  const priority = await addTrack("Priority");
  state = await payPriority(priority, sessionId);
  assert.equal(state.nextInLine?.id, priority.id, "paid priority should replace the staged free track");
  assert.ok(queuedTrack(state, free.id)?.displacedFromNextInLineAt, "interrupted free should carry the displaced-from-next marker");

  state = await queue.updateRadioTrack(priority.id, "finish");
  assert.equal(state.nextNonPriorityLane, owedBeforePriority, "finishing priority must not advance the non-priority pointer");
  assert.equal(state.nextInLine?.id, free.id, "the same interrupted free track should return as Next In Line");
});

test("random wheel lane track is not marked as interrupted unless priority displaced it from Next In Line", async () => {
  await freshOpenSession("random wheel is not interrupted");
  const stagedFree = await addTrack("Staged Free");
  let state = await queue.updateRadioTrack("", "stageFirstFree");
  assert.equal(state.nextInLine?.id, stagedFree.id);

  const randomWheel = await addTrack("Random Wheel");
  state = await queue.updateRadioTrack(randomWheel.id, "wheel");
  const wheelEntry = queuedTrack(state, randomWheel.id);
  assert.equal(wheelEntry?.lane, "wheel");
  assert.equal(wheelEntry?.displacedFromNextInLineAt ?? null, null, "wheel lane assignment alone must not mark the track as interrupted");
  assert.equal(state.nextInLine?.id, stagedFree.id, "wheel assignment should not override existing non-priority Next In Line");
});

test("finish, remove, load, and start-playback actions preserve or advance the non-priority pointer correctly", async () => {
  await freshOpenSession("finishing rules priority");
  const priority = await addTrack("Priority");
  let state = await queue.updateRadioTrack(priority.id, "priority");
  assert.equal(state.nextNonPriorityLane, "wheel");
  state = await queue.updateRadioTrack(priority.id, "finish");
  assert.equal(state.nextNonPriorityLane, "wheel", "finishing priority does not advance nextNonPriorityLane");

  await freshOpenSession("finishing rules wheel");
  const wheel = await addTrack("Wheel");
  state = await queue.updateRadioTrack(wheel.id, "wheel");
  assert.equal(state.nextNonPriorityLane, "wheel");
  state = await queue.updateRadioTrack(wheel.id, "finish");
  assert.equal(state.nextNonPriorityLane, "regular", "finishing wheel advances nextNonPriorityLane to regular");

  await freshOpenSession("finishing rules free");
  const free = await addTrack("Free");
  state = await queue.updateRadioTrack("", "stageFirstFree");
  assert.equal(state.nextNonPriorityLane, "wheel");
  state = await queue.updateRadioTrack(free.id, "finish");
  assert.equal(state.nextNonPriorityLane, "wheel", "finishing free advances nextNonPriorityLane to wheel");

  await freshOpenSession("remove does not advance");
  const removeTrack = await addTrack("Remove");
  state = await queue.updateRadioTrack("", "stageFirstFree");
  const owedBeforeRemove = state.nextNonPriorityLane;
  state = await queue.updateRadioTrack(removeTrack.id, "remove");
  assert.equal(state.nextNonPriorityLane, owedBeforeRemove, "removing a track does not advance nextNonPriorityLane");

  await freshOpenSession("load does not advance");
  const loadTrack = await addTrack("Load");
  state = await queue.updateRadioTrack("", "stageFirstFree");
  const owedBeforeLoad = state.nextNonPriorityLane;
  state = await queue.updateRadioTrack(loadTrack.id, "load");
  assert.equal(state.nextNonPriorityLane, owedBeforeLoad, "loading a track does not advance nextNonPriorityLane");

  const orderBeforeStart = {
    queue: state.queue.map((entry) => entry.id),
    next: state.nextInLine?.id ?? null,
    loaded: state.nowPlaying?.id ?? null,
  };
  state = await queue.updateRadioTrack("", "startPlayback");
  assert.equal(state.session.playbackStarted, true, "startPlayback flips playbackStarted");
  assert.deepEqual({
    queue: state.queue.map((entry) => entry.id),
    next: state.nextInLine?.id ?? null,
    loaded: state.nowPlaying?.id ?? null,
  }, orderBeforeStart, "startPlayback must not alter queue order or staged/loaded tracks");
  assert.equal(state.nextNonPriorityLane, owedBeforeLoad, "startPlayback does not advance nextNonPriorityLane");
});

test("wheel live event moves a specific track to Wheel without overriding a staged non-priority Next In Line", async () => {
  await freshOpenSession("wheel live event with staged next");
  const stagedFree = await addTrack("Staged Free");
  let state = await queue.updateRadioTrack("", "stageFirstFree");
  assert.equal(state.nextInLine?.id, stagedFree.id);

  const wheelWinner = await addTrack("Wheel Winner");
  state = await queue.updateRadioTrack(wheelWinner.id, "wheel");
  assert.equal(queuedTrack(state, wheelWinner.id)?.lane, "wheel", "wheel action should move the selected track to Wheel lane");
  assert.equal(state.nextInLine?.id, stagedFree.id, "wheel winner should not override an already staged non-priority track");

  await freshOpenSession("wheel live event with empty next");
  const openWinner = await addTrack("Open Winner");
  state = await queue.updateRadioTrack(openWinner.id, "wheel");
  assert.equal(state.nextInLine?.id, openWinner.id, "normal resolver may stage a Wheel track when Next In Line is empty and no Priority is active");
});
