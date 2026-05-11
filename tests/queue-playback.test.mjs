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
async function freshOpenSession(label, options = {}) {
  await queue.setQueueOpen(false);
  const state = await queue.startNewQueueSession({ title: `${label} ${Date.now()} ${trackSequence}` });
  await queue.setQueueOpen(true);
  if (options.showStarted !== false) await queue.updateRadioTrack("", "startShow");
  return state.session.sessionId;
}

async function addTrack(label, options = {}) {
  trackSequence += 1;
  const artistName = options.artist ?? `${label} Artist`;
  return queue.addToQueue({
    artist: artistName,
    title: `${label} Track`,
    tiktokHandle: `@${artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}${trackSequence}`,
    link: `https://example.com/${label.toLowerCase().replace(/[^a-z0-9]/g, "")}-${trackSequence}`,
    tier: "free",
    lane: "regular",
    amount: 0,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, trackSequence)).toISOString(),
  });
}

async function submitTrack(label, options = {}) {
  trackSequence += 1;
  const artistName = options.artist ?? `${label} Artist`;
  return queue.submitRadioTrack({
    artist: artistName,
    title: `${label} Track`,
    tiktokHandle: `@${artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}${trackSequence}`,
    link: `https://example.com/${label.toLowerCase().replace(/[^a-z0-9]/g, "")}-submit-${trackSequence}`,
    sourceType: "other",
  });
}

async function withFakeNow(fakeNow, callback) {
  const RealDate = global.Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fakeNow] : args));
    }
    static now() { return fakeNow.getTime(); }
  }
  global.Date = FakeDate;
  try {
    return await callback();
  } finally {
    global.Date = RealDate;
  }
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

function completedTrack(state, id) {
  return state.history.find((entry) => entry.id === id) ?? null;
}

function removedTrack(state, id) {
  return state.removed.find((entry) => entry.id === id) ?? null;
}

test("new active session begins in warmup before submissions open", async () => {
  await queue.setQueueOpen(false);
  await queue.startNewQueueSession({ title: `warmup start ${Date.now()} ${trackSequence}` });
  const free = await addTrack("Warmup Free");

  const state = await queue.updateRadioTrack("", "pullNext");

  assert.equal(state.session.broadcastPhase, "warmup");
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.showStarted, false);
  assert.equal(state.session.preShowEndsAt, null);
  assert.equal(state.nextInLine, null);
  assert.equal(queuedTrack(state, free.id)?.id, free.id);
});

test("warmup rejects public submissions while submissions are closed", async () => {
  await queue.setQueueOpen(false);
  await queue.startNewQueueSession({ title: `warmup rejects ${Date.now()} ${trackSequence}` });
  const state = await queue.getRadioQueueState();
  assert.equal(state.session.broadcastPhase, "warmup");
  assert.equal(state.session.queueOpen, false);

  await assert.rejects(() => submitTrack("Warmup Rejected"), /Queue is closed/);
});

test("opening submissions starts the pre-show routing timer without starting routing", async () => {
  await queue.setQueueOpen(false);
  await queue.startNewQueueSession({ title: `timer start ${Date.now()} ${trackSequence}` });
  const beforeOpen = Date.now();

  await queue.setQueueOpen(true);
  let state = await queue.getRadioQueueState();

  assert.equal(state.session.queueOpen, true);
  assert.equal(state.session.showStarted, false);
  assert.equal(state.session.broadcastPhase, "submission_window");
  assert.ok(state.session.preShowEndsAt, "opening submissions should set preShowEndsAt");
  const timerMs = new Date(state.session.preShowEndsAt).getTime() - beforeOpen;
  assert.ok(timerMs > 20 * 60 * 1000, `timer should be more than 20 minutes, got ${timerMs}`);
  assert.ok(timerMs <= (20 * 60 + 16) * 1000, `timer should be about 20:15, got ${timerMs}`);

  const submitted = await submitTrack("Submission Window Free");
  state = await queue.getRadioQueueState();
  assert.ok(state.queue.some((entry) => entry.id === submitted.id), "submissions should be accepted during submission window");
  assert.equal(state.nextInLine, null, "accepted Free tracks should collect without staging before routing starts");
});


test("pre-show free tracks do not auto-stage", async () => {
  await freshOpenSession("pre show free blocked", { showStarted: false });
  await addTrack("Pre Free One");
  await addTrack("Pre Free Two");

  const state = await queue.updateRadioTrack("", "pullNext");

  assert.equal(state.session.showStarted, false);
  assert.equal(state.nextInLine, null);
  assert.equal(state.queue.filter((entry) => entry.lane === "regular").length, 2);
});

test("stageFirstFree cannot bypass pre-show gating", async () => {
  await freshOpenSession("stage first free blocked", { showStarted: false });
  await addTrack("Pre Stage Free");

  const state = await queue.updateRadioTrack("", "stageFirstFree");

  assert.equal(state.session.showStarted, false);
  assert.equal(state.nextInLine, null);
  assert.equal(state.queue.filter((entry) => entry.lane === "regular").length, 1);
});

test("pull next after show start stages free through normal routing", async () => {
  await freshOpenSession("pull next live free", { showStarted: false });
  const free = await addTrack("Live Free");
  await queue.updateRadioTrack("", "startShow");
  let state = await queue.updateRadioTrack(free.id, "moveBack");
  assert.equal(state.nextInLine, null);

  state = await queue.updateRadioTrack("", "pullNext");

  assert.equal(state.session.showStarted, true);
  assert.equal(state.nextInLine?.id, free.id);
});

test("pre-show active priority can stage while free waits", async () => {
  await freshOpenSession("pre show priority", { showStarted: false });
  await addTrack("Pre Free");
  const priority = await addTrack("Pre Priority");

  const state = await queue.updateRadioTrack(priority.id, "priority");

  assert.equal(state.session.showStarted, false);
  assert.equal(state.nextInLine?.id, priority.id);
  assert.equal(state.nextInLine?.lane, "priority");
  assert.ok(state.queue.some((entry) => entry.lane === "regular"));
});

test("start show with priority and owed wheel stages priority first", async () => {
  await freshOpenSession("start show priority owed", { showStarted: false });
  await addTrack("Free Waiting");
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  const priority = await addTrack("Opening Priority");
  await queue.updateRadioTrack(priority.id, "priority");

  const state = await queue.updateRadioTrack("", "startShow");

  assert.equal(state.session.showStarted, true);
  assert.equal(state.session.wheelSpinsOwed, 1);
  assert.equal(state.nextInLine?.id, priority.id);
  assert.equal(state.nextInLine?.lane, "priority");
});

test("start show with unresolved owed wheel does not pull free fallback", async () => {
  await freshOpenSession("start show owed wheel", { showStarted: false });
  await addTrack("Free Waiting");
  await queue.updateRadioTrack("", "addWheelSpinOwed");

  const state = await queue.updateRadioTrack("", "startShow");

  assert.equal(state.session.showStarted, true);
  assert.equal(state.session.wheelSpinsOwed, 1);
  assert.equal(state.nextInLine, null);
});

test("start show with no priority and no owed wheel stages top free", async () => {
  await freshOpenSession("start show free", { showStarted: false });
  const free = await addTrack("Opening Free");

  const state = await queue.updateRadioTrack("", "startShow");

  assert.equal(state.session.showStarted, true);
  assert.equal(state.session.wheelSpinsOwed, 0);
  assert.equal(state.nextInLine?.id, free.id);
  assert.equal(state.nextInLine?.stagedAsFallbackForLane, "wheel");
});

test("add owed wheel spin increments without moving tracks or advancing pointer", async () => {
  await freshOpenSession("add owed wheel");
  const free = await addTrack("Loaded Free For Owed Spin");
  let state = await queue.updateRadioTrack("", "pullNext");
  state = await queue.updateRadioTrack(free.id, "load");
  const owedBefore = state.nextNonPriorityLane;
  const loadedBefore = state.nowPlaying?.id;

  state = await queue.updateRadioTrack("", "addWheelSpinOwed");

  assert.equal(state.session.wheelSpinsOwed, 1);
  assert.equal(state.nowPlaying?.id, loadedBefore);
  assert.equal(state.nextNonPriorityLane, owedBefore);
  assert.equal(state.queue.some((entry) => entry.lane === "wheel"), false);
});

test("resolving owed wheel by selected track decrements owed and keeps artist siblings", async () => {
  await freshOpenSession("resolve owed wheel");
  const selected = await addTrack("Same Artist Selected", { artist: "Same Artist" });
  const sibling = await addTrack("Same Artist Sibling", { artist: "Same Artist" });
  await queue.updateRadioTrack("", "addWheelSpinOwed");

  const state = await queue.updateRadioTrack(selected.id, "wheel");

  assert.equal(state.session.wheelSpinsOwed, 0);
  assert.ok(state.wheelEligibleArtists?.some((artist) => artist.normalizedArtist === "same artist" && artist.trackIds.includes(sibling.id)), "remaining sibling keeps artist eligible for future spins");
  assert.equal(state.nextInLine?.id, selected.id);
  assert.equal(state.nextInLine?.lane, "wheel");
  assert.equal(queuedTrack(state, sibling.id)?.lane, "regular");
});

test("stacked owed wheel spins decrement one at a time", async () => {
  await freshOpenSession("stacked owed wheel");
  const selected = await addTrack("Stacked Wheel Winner");
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  await queue.updateRadioTrack("", "addWheelSpinOwed");

  const state = await queue.updateRadioTrack(selected.id, "wheel");

  assert.equal(state.session.wheelSpinsOwed, 1);
  assert.equal(state.nextInLine?.id, selected.id);
  assert.equal(state.nextInLine?.lane, "wheel");
});

test("adding owed wheel spin releases existing fallback free", async () => {
  await freshOpenSession("owed releases fallback");
  const fallbackFree = await addTrack("Fallback Before Owed");
  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, fallbackFree.id);
  assert.equal(state.nextInLine?.stagedAsFallbackForLane, "wheel");

  state = await queue.updateRadioTrack("", "addWheelSpinOwed");

  assert.equal(state.session.wheelSpinsOwed, 1);
  assert.equal(state.nextInLine, null);
  assert.equal(queuedTrack(state, fallbackFree.id)?.lane, "regular");
  assert.equal(queuedTrack(state, fallbackFree.id)?.stagedAsFallbackForLane ?? null, null);
  assert.equal(state.nextNonPriorityLane, "wheel");
});

test("live wheel owed blocks free fallback", async () => {
  await freshOpenSession("owed blocks fallback");
  await addTrack("Blocked Free");
  await queue.updateRadioTrack("", "addWheelSpinOwed");

  const state = await queue.updateRadioTrack("", "pullNext");

  assert.equal(state.session.showStarted, true);
  assert.equal(state.session.wheelSpinsOwed, 1);
  assert.equal(state.nextInLine, null);
});

test("after show start pull next falls back to the first free track when no wheel exists", async () => {
  await freshOpenSession("pull next free fallback");
  const free = await addTrack("Free");

  const state = await queue.updateRadioTrack("", "pullNext");

  assert.equal(state.nextInLine?.id, free.id, "Pull Next should stage a free track after show start without Stage First Free");
  assert.equal(state.nextInLine?.lane, "regular");
  assert.equal(state.nowPlaying, null);
});

test("first wheel winner replaces a fallback free while wheel remains owed", async () => {
  await freshOpenSession("first wheel replaces fallback");
  const fallbackFree = await addTrack("Fallback Free");
  const wheelWinner = await addTrack("First Wheel Winner");

  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextNonPriorityLane, "wheel");
  assert.equal(state.nextInLine?.id, fallbackFree.id);
  assert.equal(state.nextInLine?.stagedAsFallbackForLane, "wheel");

  state = await queue.updateRadioTrack(wheelWinner.id, "wheel");
  assert.equal(state.nextInLine?.id, wheelWinner.id, "first real Wheel winner should replace fallback Free");
  assert.equal(state.nextInLine?.lane, "wheel");
  assert.equal(queuedTrack(state, fallbackFree.id)?.lane, "regular", "fallback Free returns to regular queue");
  assert.equal(queuedTrack(state, fallbackFree.id)?.stagedAsFallbackForLane ?? null, null);
  assert.equal(state.nextNonPriorityLane, "wheel");
});

test("wheel winner does not replace a truly owed free turn", async () => {
  await freshOpenSession("wheel waits behind true free");
  const wheel = await addTrack("Opening Wheel");
  const free = await addTrack("True Free");
  const laterWheel = await addTrack("Later Wheel");

  let state = await queue.updateRadioTrack(wheel.id, "wheel");
  state = await queue.updateRadioTrack(wheel.id, "finish");
  assert.equal(state.nextNonPriorityLane, "regular");

  state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, free.id);
  assert.equal(state.nextInLine?.stagedAsFallbackForLane ?? null, null);

  state = await queue.updateRadioTrack(laterWheel.id, "wheel");
  assert.equal(state.nextInLine?.id, free.id, "true Free turn should remain staged");
  assert.equal(queuedTrack(state, laterWheel.id)?.lane, "wheel", "new Wheel winner waits in Wheel lane");
  assert.equal(state.nextNonPriorityLane, "regular");
});

test("first wheel winner during priority becomes the next non-priority after priority", async () => {
  const sessionId = await freshOpenSession("wheel during priority");
  const fallbackFree = await addTrack("Fallback Free");
  const priority = await addTrack("Priority");
  const wheelWinner = await addTrack("Wheel During Priority");

  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, fallbackFree.id);
  assert.equal(state.nextInLine?.stagedAsFallbackForLane, "wheel");

  state = await payPriority(priority, sessionId);
  assert.equal(state.nextInLine?.id, priority.id);

  state = await queue.updateRadioTrack(wheelWinner.id, "wheel");
  assert.equal(state.nextInLine?.id, priority.id, "Priority remains first");
  assert.equal(queuedTrack(state, wheelWinner.id)?.lane, "wheel", "Wheel winner waits as next non-priority");
  assert.equal(queuedTrack(state, fallbackFree.id)?.lane, "regular", "fallback Free returns to regular queue");
  assert.equal(queuedTrack(state, fallbackFree.id)?.stagedAsFallbackForLane ?? null, null);
  assert.equal(state.nextNonPriorityLane, "wheel");
});

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
  assert.equal(state.nowPlaying?.id, priority.id, "loading/cueing should put priority in the player without changing pointer state");

  state = await queue.updateRadioTrack(priority.id, "finish");
  assert.equal(state.nextNonPriorityLane, "wheel", "finishing priority must not advance the non-priority pointer");
  assert.equal(state.nextInLine?.id, wheel.id, "the same interrupted wheel track should return as Next In Line");
  assert.notEqual(state.nextInLine?.id, free.id, "free should not be staged before the interrupted wheel returns");
});

test("paid priority interrupts free already in Next In Line and restores that free after priority finishes", async () => {
  const sessionId = await freshOpenSession("priority interrupts free");
  const free = await addTrack("Free");
  let state = await queue.updateRadioTrack("", "pullNext");
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
  const openingWheel = await addTrack("Opening Wheel");
  const stagedFree = await addTrack("Staged Free");
  const randomWheel = await addTrack("Random Wheel");

  let state = await queue.updateRadioTrack(openingWheel.id, "wheel");
  state = await queue.updateRadioTrack(openingWheel.id, "finish");
  assert.equal(state.nextNonPriorityLane, "regular");

  state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, stagedFree.id);
  assert.equal(state.nextInLine?.stagedAsFallbackForLane ?? null, null);

  state = await queue.updateRadioTrack(randomWheel.id, "wheel");
  const wheelEntry = queuedTrack(state, randomWheel.id);
  assert.equal(wheelEntry?.lane, "wheel");
  assert.equal(wheelEntry?.displacedFromNextInLineAt ?? null, null, "wheel lane assignment alone must not mark the track as interrupted");
  assert.equal(state.nextInLine?.id, stagedFree.id, "wheel assignment should not override a true regular Next In Line");
});

test("finish, remove, and load actions preserve or advance the non-priority pointer correctly without Start Playback", async () => {
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

  await freshOpenSession("finish direct without start playback");
  const free = await addTrack("Free");
  state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, free.id);
  state = await queue.updateRadioTrack(free.id, "load");
  assert.equal(state.nowPlaying?.id, free.id);
  state = await queue.updateRadioTrack(free.id, "finish");
  assert.ok(completedTrack(state, free.id), "finishing directly after load should complete the track");
  assert.equal(state.nextNonPriorityLane, "wheel", "finishing free advances nextNonPriorityLane to wheel");

  await freshOpenSession("remove does not advance");
  const removeTrack = await addTrack("Remove");
  state = await queue.updateRadioTrack("", "pullNext");
  const owedBeforeRemove = state.nextNonPriorityLane;
  state = await queue.updateRadioTrack(removeTrack.id, "remove");
  assert.equal(state.nextNonPriorityLane, owedBeforeRemove, "removing a track does not advance nextNonPriorityLane");

  await freshOpenSession("load does not advance");
  const loadTrack = await addTrack("Load");
  state = await queue.updateRadioTrack("", "pullNext");
  const owedBeforeLoad = state.nextNonPriorityLane;
  state = await queue.updateRadioTrack(loadTrack.id, "load");
  assert.equal(state.nextNonPriorityLane, owedBeforeLoad, "loading a track does not advance nextNonPriorityLane");
});

test("undo load for regular clears the player and returns the track without counting it", async () => {
  await freshOpenSession("undo regular");
  const regular = await addTrack("Regular Undo");
  const other = await addTrack("Other Regular");
  let state = await queue.updateRadioTrack("", "pullNext");
  const owedBeforeUndo = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(regular.id, "load");
  assert.equal(state.nowPlaying?.id, regular.id);
  assert.equal(state.nextInLine?.id, other.id);

  state = await queue.updateRadioTrack(regular.id, "moveBack");
  assert.equal(state.nowPlaying, null, "Undo Load clears the player");
  assert.equal(state.nextInLine?.id, regular.id, "regular track returns to its previous Next In Line slot");
  assert.equal(state.nextInLine?.lane, "regular");
  assert.equal(completedTrack(state, regular.id), null);
  assert.equal(removedTrack(state, regular.id), null);
  assert.equal(state.nextNonPriorityLane, owedBeforeUndo);
});

test("undo load for wheel clears the player and returns the track without counting it", async () => {
  await freshOpenSession("undo wheel");
  const wheel = await addTrack("Wheel Undo");
  const regular = await addTrack("Regular After Wheel");
  let state = await queue.updateRadioTrack(wheel.id, "wheel");
  const owedBeforeUndo = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(wheel.id, "load");
  assert.equal(state.nowPlaying?.id, wheel.id);
  assert.equal(state.nextInLine?.id, regular.id);

  state = await queue.updateRadioTrack(wheel.id, "moveBack");
  assert.equal(state.nowPlaying, null, "Undo Load clears the player");
  assert.equal(state.nextInLine?.id, wheel.id, "wheel track returns to its previous Next In Line slot");
  assert.equal(state.nextInLine?.lane, "wheel");
  assert.equal(completedTrack(state, wheel.id), null);
  assert.equal(removedTrack(state, wheel.id), null);
  assert.equal(state.nextNonPriorityLane, owedBeforeUndo);
});

test("undo load for active priority returns it as active priority, not paused", async () => {
  await freshOpenSession("undo priority");
  const priority = await addTrack("Priority Undo");
  const regular = await addTrack("Regular Behind Priority");
  let state = await queue.updateRadioTrack(priority.id, "priority");
  const owedBeforeUndo = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(priority.id, "load");
  assert.equal(state.nowPlaying?.id, priority.id);
  assert.equal(state.nextInLine?.id, regular.id);

  state = await queue.updateRadioTrack(priority.id, "moveBack");
  assert.equal(state.nowPlaying, null, "Undo Load clears the player");
  assert.equal(state.nextInLine?.id, priority.id, "active priority can route normally after Undo Load");
  assert.equal(state.nextInLine?.lane, "priority");
  assert.equal(state.nextInLine?.priorityPausedAt ?? null, null);
  assert.equal(completedTrack(state, priority.id), null);
  assert.equal(removedTrack(state, priority.id), null);
  assert.equal(state.nextNonPriorityLane, owedBeforeUndo);
});

test("pause loaded priority clears the player and returns it as held without rerouting it", async () => {
  await freshOpenSession("pause loaded priority");
  const priority = await addTrack("Priority Pause");
  const regular = await addTrack("Regular Behind Pause");
  let state = await queue.updateRadioTrack(priority.id, "priority");
  const owedBeforePause = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(priority.id, "load");
  assert.equal(state.nowPlaying?.id, priority.id);
  assert.equal(state.nextInLine?.id, regular.id);

  state = await queue.updateRadioTrack(priority.id, "pausePriority");
  assert.equal(state.nowPlaying, null, "Pause Priority clears the player");
  const paused = queuedTrack(state, priority.id);
  assert.equal(paused?.lane, "priority");
  assert.ok(paused?.priorityPausedAt, "loaded priority should return as held/paused");
  assert.equal(completedTrack(state, priority.id), null);
  assert.equal(removedTrack(state, priority.id), null);
  assert.equal(state.nextNonPriorityLane, owedBeforePause);
  assert.notEqual(state.nextInLine?.id, priority.id, "paused priority must not route as active priority");
  assert.equal(state.nowPlaying, null, "no track is automatically loaded after pausing priority");
});

test("undo loaded wheel after priority arrives restores wheel to Next In Line", async () => {
  const sessionId = await freshOpenSession("undo wheel after priority");
  const wheel = await addTrack("Loaded Wheel");
  let state = await queue.updateRadioTrack(wheel.id, "wheel");
  const owedBeforeUndo = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(wheel.id, "load");
  assert.equal(state.nowPlaying?.id, wheel.id);

  const priority = await addTrack("Arriving Priority");
  state = await payPriority(priority, sessionId);
  assert.equal(state.nextInLine?.id, priority.id);

  state = await queue.updateRadioTrack(wheel.id, "moveBack");
  assert.equal(state.nowPlaying, null);
  assert.equal(state.nextInLine?.id, wheel.id, "Undo Load restores loaded Wheel to Next In Line");
  assert.equal(state.nextInLine?.lane, "wheel");
  assert.equal(queuedTrack(state, priority.id)?.lane, "priority", "Priority returns to Priority lane");
  assert.equal(queuedTrack(state, priority.id)?.priorityPausedAt ?? null, null);
  assert.equal(completedTrack(state, wheel.id), null);
  assert.equal(removedTrack(state, wheel.id), null);
  assert.equal(completedTrack(state, priority.id), null);
  assert.equal(removedTrack(state, priority.id), null);
  assert.equal(state.nextNonPriorityLane, owedBeforeUndo);
});

test("undo loaded free after priority arrives restores free to Next In Line", async () => {
  const sessionId = await freshOpenSession("undo free after priority");
  const free = await addTrack("Loaded Free");
  let state = await queue.updateRadioTrack("", "pullNext");
  const owedBeforeUndo = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(free.id, "load");
  assert.equal(state.nowPlaying?.id, free.id);

  const priority = await addTrack("Arriving Priority");
  state = await payPriority(priority, sessionId);
  assert.equal(state.nextInLine?.id, priority.id);

  state = await queue.updateRadioTrack(free.id, "moveBack");
  assert.equal(state.nowPlaying, null);
  assert.equal(state.nextInLine?.id, free.id, "Undo Load restores loaded Free to Next In Line");
  assert.equal(state.nextInLine?.lane, "regular");
  assert.equal(queuedTrack(state, priority.id)?.lane, "priority", "Priority returns to Priority lane");
  assert.equal(queuedTrack(state, priority.id)?.priorityPausedAt ?? null, null);
  assert.equal(completedTrack(state, free.id), null);
  assert.equal(removedTrack(state, free.id), null);
  assert.equal(completedTrack(state, priority.id), null);
  assert.equal(removedTrack(state, priority.id), null);
  assert.equal(state.nextNonPriorityLane, owedBeforeUndo);
});

test("undo loaded fallback free after wheel winner is chosen restores real wheel next", async () => {
  await freshOpenSession("undo fallback after wheel");
  const fallbackFree = await addTrack("Loaded Fallback Free");
  const secondFallback = await addTrack("Second Fallback Free");
  const wheelWinner = await addTrack("Chosen Wheel While Loaded");
  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, fallbackFree.id);
  assert.equal(state.nextInLine?.stagedAsFallbackForLane, "wheel");
  const owedBeforeUndo = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(fallbackFree.id, "load");
  assert.equal(state.nowPlaying?.id, fallbackFree.id);
  assert.equal(state.nextInLine?.id, secondFallback.id);

  state = await queue.updateRadioTrack(wheelWinner.id, "wheel");
  assert.equal(state.nowPlaying?.id, fallbackFree.id, "selecting Wheel must not disturb loaded track");

  state = await queue.updateRadioTrack(fallbackFree.id, "moveBack");
  assert.equal(state.nowPlaying, null);
  assert.equal(state.nextInLine?.id, wheelWinner.id, "real Wheel winner becomes Next In Line");
  assert.equal(queuedTrack(state, fallbackFree.id)?.lane, "regular", "fallback Free returns to regular queue");
  assert.equal(queuedTrack(state, fallbackFree.id)?.stagedAsFallbackForLane ?? null, null);
  assert.equal(completedTrack(state, fallbackFree.id), null);
  assert.equal(removedTrack(state, fallbackFree.id), null);
  assert.equal(state.nextNonPriorityLane, owedBeforeUndo);
});

test("undo loaded priority after another priority arrives keeps both active priorities ordered", async () => {
  const sessionId = await freshOpenSession("undo priority after priority");
  const priorityA = await addTrack("Priority A");
  let state = await queue.updateRadioTrack(priorityA.id, "priority");
  const owedBeforeUndo = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(priorityA.id, "load");
  assert.equal(state.nowPlaying?.id, priorityA.id);

  const priorityB = await addTrack("Priority B");
  state = await payPriority(priorityB, sessionId);
  assert.equal(state.nextInLine?.id, priorityB.id);

  state = await queue.updateRadioTrack(priorityA.id, "moveBack");
  assert.equal(state.nowPlaying, null);
  assert.equal(state.nextInLine?.id, priorityA.id, "original loaded Priority restores to its Next In Line slot");
  assert.equal(state.nextInLine?.priorityPausedAt ?? null, null);
  assert.equal(queuedTrack(state, priorityB.id)?.lane, "priority");
  assert.equal(queuedTrack(state, priorityB.id)?.priorityPausedAt ?? null, null);
  assert.equal(completedTrack(state, priorityA.id), null);
  assert.equal(removedTrack(state, priorityA.id), null);
  assert.equal(completedTrack(state, priorityB.id), null);
  assert.equal(removedTrack(state, priorityB.id), null);
  assert.equal(state.nextNonPriorityLane, owedBeforeUndo);
});

test("wheel live event moves a specific track to Wheel without overriding a true staged regular Next In Line", async () => {
  await freshOpenSession("wheel live event with staged next");
  const openingWheel = await addTrack("Opening Wheel");
  const stagedFree = await addTrack("Staged Free");
  const wheelWinner = await addTrack("Wheel Winner");
  let state = await queue.updateRadioTrack(openingWheel.id, "wheel");
  state = await queue.updateRadioTrack(openingWheel.id, "finish");
  assert.equal(state.nextNonPriorityLane, "regular");
  state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, stagedFree.id);

  state = await queue.updateRadioTrack(wheelWinner.id, "wheel");
  assert.equal(queuedTrack(state, wheelWinner.id)?.lane, "wheel", "wheel action should move the selected track to Wheel lane");
  assert.equal(state.nextInLine?.id, stagedFree.id, "wheel winner should not override a true staged regular track");

  await freshOpenSession("wheel live event with empty next");
  const openWinner = await addTrack("Open Winner");
  state = await queue.updateRadioTrack(openWinner.id, "wheel");
  assert.equal(state.nextInLine?.id, openWinner.id, "normal resolver may stage a Wheel track when Next In Line is empty and no Priority is active");
});


test("timer expiration starts routing but keeps submissions open", async () => {
  await freshOpenSession("timer expiry", { showStarted: false });
  const free = await addTrack("Timer Free");
  let state = await queue.getRadioQueueState();
  assert.equal(state.session.queueOpen, true);
  assert.equal(state.session.showStarted, false);
  assert.equal(state.nextInLine, null);

  const afterTimer = new Date(new Date(state.session.preShowEndsAt).getTime() + 1000);
  state = await withFakeNow(afterTimer, () => queue.getRadioQueueState());

  assert.equal(state.session.queueOpen, true, "timer expiration must not close submissions");
  assert.equal(state.session.showStarted, true);
  assert.equal(state.session.broadcastPhase, "broadcast_active");
  assert.equal(state.nextInLine?.id, free.id, "normal resolver may route after timer starts broadcast routing");
});

test("broadcast active still accepts submissions while submissions are open", async () => {
  await freshOpenSession("broadcast accepts submissions");

  const submitted = await submitTrack("Live Submission");
  const state = await queue.getRadioQueueState();

  assert.equal(state.session.showStarted, true);
  assert.equal(state.session.queueOpen, true);
  assert.ok(state.queue.some((entry) => entry.id === submitted.id) || state.nextInLine?.id === submitted.id);
});

test("closing submissions during submission window returns to warmup without routing", async () => {
  await freshOpenSession("close submissions warmup", { showStarted: false });
  const free = await addTrack("Close Window Free");
  let state = await queue.getRadioQueueState();
  assert.equal(state.session.broadcastPhase, "submission_window");
  assert.equal(state.nextInLine, null);

  await queue.setQueueOpen(false);
  state = await queue.updateRadioTrack("", "pullNext");

  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.showStarted, false);
  assert.equal(state.session.broadcastPhase, "warmup");
  assert.equal(state.nextInLine, null);
  assert.equal(queuedTrack(state, free.id)?.id, free.id);
});

test("closing submissions does not end active broadcast routing", async () => {
  await freshOpenSession("close submissions live");
  const free = await addTrack("Close Live Free");
  let state = await queue.updateRadioTrack("", "pullNext");
  const owedBeforeClose = state.nextNonPriorityLane;
  assert.equal(state.nextInLine?.id, free.id);

  await queue.setQueueOpen(false);
  state = await queue.getRadioQueueState();

  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.showStarted, true);
  assert.equal(state.session.broadcastPhase, "broadcast_active");
  assert.equal(state.nextNonPriorityLane, owedBeforeClose);
  assert.equal(state.nextInLine?.id, free.id);
});

test("start broadcast manually overrides a future pre-show timer", async () => {
  await freshOpenSession("manual start broadcast", { showStarted: false });
  const free = await addTrack("Manual Start Free");
  let state = await queue.getRadioQueueState();
  assert.equal(state.session.showStarted, false);
  assert.ok(new Date(state.session.preShowEndsAt).getTime() > Date.now());

  state = await queue.updateRadioTrack("", "startShow");

  assert.equal(state.session.queueOpen, true);
  assert.equal(state.session.showStarted, true);
  assert.equal(state.session.broadcastPhase, "broadcast_active");
  assert.equal(state.nextInLine?.id, free.id);
});

test("ending broadcast is separate from closing submissions", async () => {
  await freshOpenSession("end broadcast separate");
  let state = await queue.getRadioQueueState();
  assert.equal(state.session.showStarted, true);

  state = await queue.archiveCurrentQueueSession();

  assert.equal(state.session.status, "archived");
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.showStarted, false);
  assert.equal(state.session.broadcastPhase, "ended");
  assert.equal(state.streamStatus, "offline");
});

test("admin phase display uses showStarted language instead of opening state", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");

  assert.match(source, /Warmup/);
  assert.match(source, /Submission Window/);
  assert.match(source, /Broadcast Active/);
  assert.match(source, /Ended \/ Disconnecting/);
  assert.doesNotMatch(source, /Opening state/);
  assert.doesNotMatch(source, /playbackStarted/);
});

test("removing lower queued free and wheel tracks does not advance or rebuild hidden alternation", async () => {
  await freshOpenSession("low queued removal");
  const firstWheel = await addTrack("Low Removal First Wheel");
  const lowWheel = await addTrack("Low Removal Low Wheel");
  const firstFree = await addTrack("Low Removal First Free");
  const lowFree = await addTrack("Low Removal Low Free");

  let state = await queue.updateRadioTrack(firstWheel.id, "wheel");
  state = await queue.updateRadioTrack(lowWheel.id, "wheel");
  assert.equal(state.nextNonPriorityLane, "wheel");
  assert.equal(state.nextInLine?.id, firstWheel.id);

  state = await queue.updateRadioTrack(lowFree.id, "remove");
  assert.equal(state.nextNonPriorityLane, "wheel", "removing a lower queued Free track must not advance the owed lane");
  assert.equal(state.nextInLine?.id, firstWheel.id, "removing a lower queued Free track must not disturb staged Wheel");
  assert.ok(removedTrack(state, lowFree.id));
  assert.ok(queuedTrack(state, firstFree.id), "the top Free bucket entry remains queued for when Free is owed");

  state = await queue.updateRadioTrack(lowWheel.id, "remove");
  assert.equal(state.nextNonPriorityLane, "wheel", "removing a lower queued Wheel track must not advance the owed lane");
  assert.equal(state.nextInLine?.id, firstWheel.id, "removing a lower queued Wheel track must not disturb staged Wheel");
  assert.ok(removedTrack(state, lowWheel.id));
});

test("loaded player boundary prevents replacing now playing with another load action", async () => {
  await freshOpenSession("loaded boundary");
  const first = await addTrack("Loaded Boundary First");
  const second = await addTrack("Loaded Boundary Second");

  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, first.id);
  state = await queue.updateRadioTrack(first.id, "load");
  assert.equal(state.nowPlaying?.id, first.id);

  state = await queue.updateRadioTrack(second.id, "load");

  assert.equal(state.nowPlaying?.id, first.id, "loading a second track must not replace an occupied player");
  assert.equal(completedTrack(state, first.id), null);
  assert.equal(removedTrack(state, first.id), null);
});
