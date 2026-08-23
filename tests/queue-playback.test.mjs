import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Keep queue tests isolated to the in-memory store instead of any configured Redis.
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
const queue = require("../src/lib/queue.ts");
const {
  PRIORITY_DISCLOSURE_TEXT,
  PRIORITY_GIFT_ANONYMOUS_NAME,
  PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT,
  PRIORITY_GIFT_ATTRIBUTION_VERSION,
  PRIORITY_GIFT_NAME_MAX_LENGTH,
  PRIORITY_TERMS_VERSION,
  confirmedPriorityPurchaseDisplay,
  normalizePriorityGiftDisplayName,
} = require("../src/lib/queue-types.ts");
const priorityAcceptance = { acceptedPriorityTerms: true, priorityTermsVersion: PRIORITY_TERMS_VERSION, priorityDisclosureText: PRIORITY_DISCLOSURE_TEXT };
const overlay = require("../src/lib/live-overlay.ts");
const publicOverlayRoute = require("../src/app/api/overlay/live/route.ts");

let trackSequence = 0;

async function startFreshQueueSession(options) {
  const current = await queue.getRadioQueueState();
  if (current.revision !== 0 && current.session.status !== "archived") {
    await queue.archiveCurrentQueueSession();
  }
  return queue.startNewQueueSession(options);
}

async function freshOpenSession(label, options = {}) {
  const state = await startFreshQueueSession({
    title: `${label} ${Date.now()} ${trackSequence}`,
    purpose: options.purpose,
    bnlPublicationStatus: options.bnlPublicationStatus,
    queueCapacity: options.queueCapacity,
    trackLimitPerArtist: options.trackLimitPerArtist,
    submissionCooldownSeconds: options.submissionCooldownSeconds,
  });
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

async function reachSponsorMidpoint(label) {
  const track = await addTrack(label);
  await queue.updateRadioTrack(track.id, "load");
  const state = await queue.updateRadioTrack(track.id, "finish");
  assert.equal(state.session.sponsorBreakStatus, "due");
  return state;
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

function activeTrack(state, id) {
  return [state.nowPlaying, state.loadedTrack, state.nextInLine, ...state.queue].find((entry) => entry?.id === id) ?? null;
}

function publicTrack(snapshot, id) {
  return [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue, ...snapshot.completed].find((entry) => entry?.id === id) ?? null;
}

function completedTrack(state, id) {
  return state.history.find((entry) => entry.id === id) ?? null;
}

function removedTrack(state, id) {
  return state.removed.find((entry) => entry.id === id) ?? null;
}

function countTrackOccurrences(state, id) {
  const queueCount = state.queue.filter((entry) => entry.id === id).length;
  const nextCount = state.nextInLine?.id === id ? 1 : 0;
  const nowPlayingCount = state.nowPlaying?.id === id ? 1 : 0;
  const historyCount = state.history.filter((entry) => entry.id === id).length;
  const removedCount = state.removed.filter((entry) => entry.id === id).length;
  return { queueCount, nextCount, nowPlayingCount, historyCount, removedCount, total: queueCount + nextCount + nowPlayingCount + historyCount + removedCount };
}

test("new active session begins in warmup before submissions open", async () => {
  await startFreshQueueSession({ title: `warmup start ${Date.now()} ${trackSequence}` });
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
  await startFreshQueueSession({ title: `warmup rejects ${Date.now()} ${trackSequence}` });
  const state = await queue.getRadioQueueState();
  assert.equal(state.session.broadcastPhase, "warmup");
  assert.equal(state.session.queueOpen, false);

  await assert.rejects(() => submitTrack("Warmup Rejected"), /Queue is closed/);
});

test("opening submissions starts the pre-show routing timer without starting routing", async () => {
  await startFreshQueueSession({ title: `timer start ${Date.now()} ${trackSequence}` });
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

test("pre-show manual wheel can stage while free waits", async () => {
  await freshOpenSession("pre show wheel", { showStarted: false });
  await addTrack("Pre Wheel Free One");
  const wheel = await addTrack("Pre Wheel Winner");

  const state = await queue.updateRadioTrack(wheel.id, "wheel");

  assert.equal(state.session.showStarted, false);
  assert.equal(state.nextInLine?.id, wheel.id);
  assert.equal(state.nextInLine?.lane, "wheel");
  assert.ok(state.queue.some((entry) => entry.lane === "regular"), "Free submissions should wait in regular lane before broadcast running");
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

test("finished loaded priority cannot reappear in active slots", async () => {
  const sessionId = await freshOpenSession("finished priority uniqueness");
  const free = await addTrack("Priority Uniqueness Free");
  const priority = await addTrack("Priority Uniqueness Priority");
  let state = await payPriority(priority, sessionId);
  const owedBeforeFinish = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(priority.id, "load");
  assert.equal(state.nowPlaying?.id, priority.id);
  assert.equal(countTrackOccurrences(state, priority.id).total, 1, "loaded priority should exist once");

  state = await queue.updateRadioTrack(priority.id, "finish");
  const finished = countTrackOccurrences(state, priority.id);
  assert.equal(finished.historyCount, 1, "finished priority should appear once in history");
  assert.equal(finished.queueCount, 0);
  assert.equal(finished.nextCount, 0);
  assert.equal(finished.nowPlayingCount, 0);
  assert.equal(finished.removedCount, 0);
  assert.equal(state.nextInLine?.id, free.id, "next legal track should stage after priority finish");
  assert.equal(state.nextNonPriorityLane, owedBeforeFinish, "finishing priority must not change non-priority pointer");
});

test("finishing two priorities cannot duplicate either track", async () => {
  const sessionId = await freshOpenSession("double priority uniqueness");
  const free = await addTrack("Double Priority Free");
  const p1 = await addTrack("Double Priority One");
  const p2 = await addTrack("Double Priority Two");
  let state = await payPriority(p1, sessionId);
  state = await payPriority(p2, sessionId);

  state = await queue.updateRadioTrack(state.nextInLine.id, "load");
  state = await queue.updateRadioTrack(state.nowPlaying.id, "finish");
  state = await queue.updateRadioTrack(state.nextInLine.id, "load");
  state = await queue.updateRadioTrack(state.nowPlaying.id, "finish");

  const p1Counts = countTrackOccurrences(state, p1.id);
  const p2Counts = countTrackOccurrences(state, p2.id);
  assert.equal(p1Counts.historyCount, 1);
  assert.equal(p2Counts.historyCount, 1);
  assert.equal(p1Counts.total, 1, "priority one should exist only as completed");
  assert.equal(p2Counts.total, 1, "priority two should exist only as completed");
  assert.equal(state.nextInLine?.id, free.id, "non-priority track should be next after priority stack finishes");
});

test("pause and resume priority does not duplicate track across active slots", async () => {
  const sessionId = await freshOpenSession("pause resume uniqueness");
  await addTrack("Pause Resume Free");
  const priority = await addTrack("Pause Resume Priority");
  let state = await payPriority(priority, sessionId);
  assert.equal(state.nextInLine?.id, priority.id);

  state = await queue.updateRadioTrack(priority.id, "pausePriority");
  let counts = countTrackOccurrences(state, priority.id);
  assert.equal(counts.total, 1, "paused priority should exist once");
  assert.equal(counts.queueCount, 1, "paused priority should return to queue");
  assert.equal(counts.nextCount, 0);
  assert.equal(counts.nowPlayingCount, 0);

  state = await queue.updateRadioTrack(priority.id, "resumePriority");
  counts = countTrackOccurrences(state, priority.id);
  assert.equal(counts.total, 1, "resumed priority should exist once");
  assert.equal(counts.nowPlayingCount, 0);
  assert.equal(counts.historyCount, 0);
  assert.equal(counts.removedCount, 0);
  if (state.nextInLine?.id === priority.id) {
    assert.equal(counts.nextCount, 1);
    assert.equal(counts.queueCount, 0, "priority in Next In Line must not also remain queued");
  } else {
    assert.equal(counts.queueCount, 1, "if not staged yet, resumed priority should remain queued once");
  }
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

test("loaded finish clears nowPlaying and does not resurrect finished track", async () => {
  await freshOpenSession("loaded finish clears now playing");
  const first = await addTrack("Loaded Finish First");
  const second = await addTrack("Loaded Finish Second");

  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, first.id);
  state = await queue.updateRadioTrack(first.id, "load");
  assert.equal(state.nowPlaying?.id, first.id);
  state = await queue.updateRadioTrack(first.id, "finish");

  const counts = countTrackOccurrences(state, first.id);
  assert.equal(state.nowPlaying, null, "finish should clear nowPlaying");
  assert.equal(counts.historyCount, 1, "finished track should appear once in history");
  assert.equal(counts.queueCount, 0);
  assert.equal(counts.nextCount, 0);
  assert.equal(state.nextInLine?.id, second.id, "next legal track should stage");
});

test("undo load then reload then finish completes without resurrection", async () => {
  await freshOpenSession("undo reload finish");
  const first = await addTrack("Undo Reload First");
  await addTrack("Undo Reload Second");
  let state = await queue.updateRadioTrack("", "pullNext");
  state = await queue.updateRadioTrack(first.id, "load");
  state = await queue.updateRadioTrack(first.id, "moveBack");
  assert.equal(state.nowPlaying, null);
  assert.equal(state.nextInLine?.id, first.id, "undo load should restore first as next");

  state = await queue.updateRadioTrack(first.id, "load");
  state = await queue.updateRadioTrack(first.id, "finish");
  const counts = countTrackOccurrences(state, first.id);
  assert.equal(state.nowPlaying, null);
  assert.equal(counts.historyCount, 1);
  assert.equal(counts.total, 1, "track should exist only once after finish");
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


test("timer expiration keeps submissions open without starting routing", async () => {
  await freshOpenSession("timer expiry", { showStarted: false });
  const free = await addTrack("Timer Free");
  let state = await queue.getRadioQueueState();
  assert.equal(state.session.queueOpen, true);
  assert.equal(state.session.showStarted, false);
  assert.equal(state.nextInLine, null);

  const afterTimer = new Date(new Date(state.session.preShowEndsAt).getTime() + 1000);
  state = await withFakeNow(afterTimer, () => queue.getRadioQueueState());

  assert.equal(state.session.queueOpen, true, "timer expiration must not close submissions");
  assert.equal(state.session.showStarted, false, "timer expiration alone must not start broadcast routing");
  assert.equal(state.session.broadcastPhase, "submission_window");
  assert.equal(state.nextInLine, null, "timer expiration alone must not route Free into Next In Line");
  assert.ok(queuedTrack(state, free.id));
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

test("host cannot start the sponsor break before the counted midpoint", async () => {
  await freshOpenSession("commercial blocked before midpoint");
  const state = await queue.updateSponsorBreakState("start");
  assert.equal(state.session.sponsorBreakStatus, "not_due");
  assert.equal(state.session.sponsorBreakStartedAt, null);
});

test("host cannot start the sponsor break at midpoint before two broadcast hours", async () => {
  await freshOpenSession("commercial blocked before two hours");
  const track = await addTrack("commercial early midpoint");
  await queue.updateRadioTrack(track.id, "load");
  let state = await queue.updateRadioTrack(track.id, "finish");
  assert.equal(state.session.sponsorBreakStatus, "not_due");
  state = await queue.updateSponsorBreakState("start");
  assert.equal(state.session.sponsorBreakStatus, "not_due");
  assert.equal(state.session.sponsorBreakStartedAt, null);
});

test("running commercial break auto-completes after 10m30s", async () => {
  await freshOpenSession("commercial timer auto-complete");
  const initial = await queue.getRadioQueueState();
  const eligibleNow = new Date(Date.parse(initial.session.broadcastStartedAt) + 2 * 60 * 60 * 1000 + 1000);
  const state = await withFakeNow(eligibleNow, async () => {
    await reachSponsorMidpoint("commercial timer midpoint");
    return queue.updateSponsorBreakState("start");
  });
  assert.equal(state.session.sponsorBreakStatus, "running");
  assert.equal(state.session.sponsorBreakDueAfterPlayableCount, 1);
  assert.ok(state.session.sponsorBreakStartedAt);
  const beforeDone = await withFakeNow(new Date(new Date(state.session.sponsorBreakStartedAt).getTime() + 10 * 60 * 1000), () => queue.getRadioQueueState());
  assert.equal(beforeDone.session.sponsorBreakStatus, "running");
  const afterDone = await withFakeNow(new Date(new Date(state.session.sponsorBreakStartedAt).getTime() + 10 * 60 * 1000 + 31 * 1000), () => queue.getRadioQueueState());
  assert.equal(afterDone.session.sponsorBreakStatus, "completed");
  assert.ok(afterDone.session.sponsorBreakCompletedAt);
});

test("commercial start is idempotent when already running/completed/skipped", async () => {
  await freshOpenSession("commercial idempotent start");
  const initial = await queue.getRadioQueueState();
  const eligibleNow = new Date(Date.parse(initial.session.broadcastStartedAt) + 2 * 60 * 60 * 1000 + 1000);
  await withFakeNow(eligibleNow, async () => {
    await reachSponsorMidpoint("commercial idempotent midpoint");
    let state = await queue.updateSponsorBreakState("start");
    const firstStartedAt = state.session.sponsorBreakStartedAt;
    state = await queue.updateSponsorBreakState("start");
    assert.equal(state.session.sponsorBreakStatus, "running");
    assert.equal(state.session.sponsorBreakStartedAt, firstStartedAt);
    state = await queue.updateSponsorBreakState("complete");
    const completedAt = state.session.sponsorBreakCompletedAt;
    state = await queue.updateSponsorBreakState("start");
    assert.equal(state.session.sponsorBreakStatus, "completed");
    assert.equal(state.session.sponsorBreakCompletedAt, completedAt);
    await queue.updateSponsorBreakState("reset");
    await queue.updateSponsorBreakState("skip");
    state = await queue.updateSponsorBreakState("start");
    assert.equal(state.session.sponsorBreakStatus, "skipped");
  });
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

test("archived public snapshots neutralize active lanes while preserving the real completed log", async () => {
  const sessionId = await freshOpenSession("archived public projection", {
    purpose: "live_broadcast",
    bnlPublicationStatus: "recap_approved",
  });
  const completedRealTrack = await addTrack("Archived Completed Real");

  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, completedRealTrack.id);
  state = await queue.updateRadioTrack(completedRealTrack.id, "load");
  state = await queue.updateRadioTrack(completedRealTrack.id, "finish");
  assert.ok(completedTrack(state, completedRealTrack.id));

  state = await queue.updateRadioTrack("", "addSimulationPaidPriority");
  state = await queue.updateRadioTrack("", "addSimulationFreeTrack");
  const archivedSimulationIds = [
    state.nextInLine,
    ...state.queue,
  ].filter((entry) => entry?.isTestTrack).map((entry) => entry.id);
  assert.equal(archivedSimulationIds.length, 2, "archive should retain both simulation tracks internally");

  await queue.archiveCurrentQueueSession();

  for (const publicSnapshot of [
    await queue.getPublicQueueSnapshot(),
    await queue.getPublicQueueSnapshot(sessionId),
  ]) {
    assert.equal(publicSnapshot.session.status, "archived");
    assert.equal(publicSnapshot.session.broadcastPhase, "ended");
    assert.equal(publicSnapshot.session.queueOpen, false);
    assert.equal(publicSnapshot.session.showStarted, false);
    assert.equal(publicSnapshot.session.activeCount, 0);
    assert.equal(publicSnapshot.session.nextInLineTrackId, null);
    assert.equal(publicSnapshot.session.loadedTrackId, null);
    assert.equal(publicSnapshot.session.priorityUpgradesEnabled, false);
    assert.equal(publicSnapshot.session.priorityUpgradePaymentsEnabled, false);
    assert.equal(publicSnapshot.status.isOpen, false);
    assert.equal(publicSnapshot.status.activeCount, 0);
    assert.equal(publicSnapshot.status.estimatedRuntimeSeconds, 0);
    assert.equal(publicSnapshot.status.pressure, "low");
    assert.equal(publicSnapshot.status.isFull, false);
    assert.deepEqual(publicSnapshot.queue, []);
    assert.equal(publicSnapshot.nowPlaying, null);
    assert.equal(publicSnapshot.upNext, null);
    assert.equal(publicSnapshot.submitterStatus, null);
    assert.ok(publicSnapshot.completed.some((track) => track.id === completedRealTrack.id));
    assert.equal(archivedSimulationIds.some((id) => JSON.stringify(publicSnapshot).includes(id)), false);
  }

  const archivedAdminState = await queue.getRadioQueueState(sessionId);
  const retainedSimulationIds = [
    archivedAdminState.nextInLine,
    ...archivedAdminState.queue,
  ].filter((entry) => entry?.isTestTrack).map((entry) => entry.id);
  assert.deepEqual(new Set(retainedSimulationIds), new Set(archivedSimulationIds), "admin archive retains its original simulation records");

  const readModelRoute = require("../src/app/api/bnl/read-model/route.ts");
  const readModel = await (await readModelRoute.GET()).json();
  assert.equal(readModel.sections.queue.session.status, "archived");
  assert.equal(readModel.sections.queue.session.queueOpen, false);
  assert.equal(readModel.sections.queue.session.activeCount, 0);
  assert.equal(readModel.sections.queue.session.priorityUpgradesEnabled, false);
  assert.equal(readModel.sections.queue.status.isOpen, false);
  assert.equal(readModel.sections.queue.status.activeCount, 0);
  assert.deepEqual(readModel.sections.queue.queue, []);
  assert.equal(readModel.sections.queue.nowPlaying, null);
  assert.equal(readModel.sections.queue.upNext, null);
  assert.ok(readModel.sections.queue.completed.some((track) => track.id === completedRealTrack.id));
  assert.equal(archivedSimulationIds.some((id) => JSON.stringify(readModel.sections).includes(id)), false);
});



test("new sessions default queue capacity to 44", async () => {
  const state = await startFreshQueueSession({ title: `default capacity ${Date.now()} ${trackSequence}` });
  assert.equal(state.session.queueCapacity, 44);
  assert.equal(state.session.acceptedCount, 0);
  assert.equal(state.session.submissionClosureReason, "manual");
  assert.equal(state.session.purpose, "rehearsal");
  assert.equal(state.session.bnlPublicationStatus, "private");
  assert.equal(state.session.provenanceRevision, 1);
  assert.ok(state.session.provenanceUpdatedAt);
  assert.doesNotMatch(
    fs.readFileSync(path.join(projectRoot, "src/lib/queue-types.ts"), "utf8"),
    /RADIO_QUEUE_CAPACITY/,
    "the stale 40-track vocabulary must not survive beside the canonical 44-track default",
  );
});

test("rapid submissions from distinct artists do not create a repeated-attempt admin flag", async () => {
  await freshOpenSession("distinct artist intake", {
    showStarted: false,
    submissionCooldownSeconds: 0,
  });

  const tracks = [];
  for (let index = 1; index <= 6; index += 1) {
    tracks.push(await submitTrack(`Distinct Intake ${index}`, { artist: `Distinct Artist ${index}` }));
  }

  assert.equal(
    tracks.some((track) => track.suspiciousFlags?.includes("Many attempts in a short time")),
    false,
    "normal queue traffic from unrelated artists must not be attached to an individual submission",
  );
});

test("admin queue suppresses only the obsolete global-traffic warning", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");

  assert.match(source, /const LEGACY_GLOBAL_SUBMISSION_FLAG = "Many attempts in a short time"/);
  assert.match(source, /filter\(\(flag\) => flag !== LEGACY_GLOBAL_SUBMISSION_FLAG\)/);
  assert.match(source, /<AdminSuspiciousFlags entry=\{entry\} \/>/);
  assert.match(source, /Admin flags: \{flags\.join\(" \/ "\)\}/);
});

test("concurrent slots 43 through 45 accept exactly two tracks without losing either write", async () => {
  await freshOpenSession("atomic default capacity", {
    showStarted: false,
    submissionCooldownSeconds: 0,
  });
  for (let index = 1; index <= 42; index += 1) {
    await submitTrack(`Atomic Prefill ${index}`, { artist: `Atomic Artist ${index}` });
  }

  const attempts = await Promise.allSettled([
    submitTrack("Atomic Slot 43", { artist: "Atomic Artist 43" }),
    submitTrack("Atomic Slot 44", { artist: "Atomic Artist 44" }),
    submitTrack("Atomic Slot 45", { artist: "Atomic Artist 45" }),
  ]);
  const accepted = attempts.filter((result) => result.status === "fulfilled");
  const rejected = attempts.filter((result) => result.status === "rejected");
  assert.equal(accepted.length, 2);
  assert.equal(rejected.length, 1);
  assert.match(String(rejected[0].reason), /full/i);

  const state = await queue.getRadioQueueState();
  const ids = [
    ...state.queue.map((entry) => entry.id),
    ...(state.nextInLine ? [state.nextInLine.id] : []),
    ...(state.loadedTrack ? [state.loadedTrack.id] : []),
    ...state.history.map((entry) => entry.id),
  ];
  assert.equal(new Set(ids).size, 44);
  assert.equal(state.session.acceptedCount, 44);
  assert.equal(state.publicStatus.acceptedCount, 44);
  assert.equal(state.publicStatus.activeCount, 44);
  assert.equal(state.publicStatus.isFull, true);
  assert.equal(state.publicStatus.isOpen, false);
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.status, "open", "capacity closes intake without ending the active session");
  assert.equal(state.session.submissionClosureReason, "capacity");
  assert.equal(state.publicStatus.closureReason, "capacity");
});

test("concurrent duplicate and per-artist collisions are revalidated inside the atomic mutation", async () => {
  await freshOpenSession("atomic duplicate collision", {
    showStarted: false,
    submissionCooldownSeconds: 0,
  });
  const duplicateInput = {
    artist: "Collision Artist",
    title: "Collision Track",
    tiktokHandle: "@collisionartist",
    link: "https://example.com/atomic-duplicate",
    sourceType: "other",
  };
  let attempts = await Promise.allSettled([
    queue.submitRadioTrack(duplicateInput),
    queue.submitRadioTrack(duplicateInput),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  assert.match(String(attempts.find((result) => result.status === "rejected").reason), /duplicate/i);
  let state = await queue.getRadioQueueState();
  assert.equal(state.session.acceptedCount, 1);

  await startFreshQueueSession({
    title: `atomic artist collision ${Date.now()} ${trackSequence}`,
    queueCapacity: 44,
    trackLimitPerArtist: 1,
    submissionCooldownSeconds: 0,
  });
  await queue.setQueueOpen(true);
  attempts = await Promise.allSettled([
    queue.submitRadioTrack({ ...duplicateInput, title: "Artist Limit One", link: "https://example.com/artist-limit-one" }),
    queue.submitRadioTrack({ ...duplicateInput, title: "Artist Limit Two", link: "https://example.com/artist-limit-two" }),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  assert.match(String(attempts.find((result) => result.status === "rejected").reason), /limit/i);
  state = await queue.getRadioQueueState();
  assert.equal(state.session.acceptedCount, 1);
});

test("completed tracks keep their show slot while removal reopens only capacity-closed intake", async () => {
  await freshOpenSession("truthful capacity lifecycle", {
    showStarted: false,
    queueCapacity: 3,
    submissionCooldownSeconds: 0,
  });
  const first = await submitTrack("Capacity Lifecycle One");
  const second = await submitTrack("Capacity Lifecycle Two");
  const third = await submitTrack("Capacity Lifecycle Three");
  let state = await queue.getRadioQueueState();
  assert.equal(state.session.acceptedCount, 3);
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.submissionClosureReason, "capacity");

  state = await queue.updateRadioTrack(third.id, "remove");
  assert.equal(state.session.acceptedCount, 2);
  assert.equal(state.session.queueOpen, true);
  assert.equal(state.session.submissionClosureReason, null);

  const replacement = await submitTrack("Capacity Lifecycle Replacement");
  state = await queue.getRadioQueueState();
  assert.equal(state.session.acceptedCount, 3);
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.submissionClosureReason, "capacity");

  await queue.updateRadioTrack("", "startShow");
  state = await queue.updateRadioTrack(first.id, "finish");
  assert.ok(completedTrack(state, first.id));
  assert.equal(state.session.completedCount, 1);
  assert.equal(state.session.acceptedCount, 3, "completed/played tracks still consume their accepted show slot");
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.submissionClosureReason, "capacity");
  assert.ok([second.id, replacement.id].some((id) => state.queue.some((entry) => entry.id === id) || state.nextInLine?.id === id));
});

test("manual close survives removal while capacity removal and restoration reopen then reclose", async () => {
  await freshOpenSession("manual versus capacity close", {
    showStarted: false,
    queueCapacity: 2,
    submissionCooldownSeconds: 0,
  });
  const first = await submitTrack("Close Reason One");
  const second = await submitTrack("Close Reason Two");
  let state = await queue.updateRadioTrack(second.id, "remove");
  assert.equal(state.session.queueOpen, true);
  assert.equal(state.session.submissionClosureReason, null);

  state = await queue.updateRadioTrack(second.id, "restoreRegular");
  assert.equal(state.session.acceptedCount, 2);
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.submissionClosureReason, "capacity");

  state = await queue.updateRadioTrack(second.id, "remove");
  await queue.setQueueOpen(false);
  state = await queue.updateRadioTrack(first.id, "remove");
  assert.equal(state.session.acceptedCount, 0);
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.submissionClosureReason, "manual");
});

test("simulation tracks never consume one of the 44 accepted show slots", async () => {
  await freshOpenSession("simulation capacity exclusion", {
    showStarted: false,
    queueCapacity: 1,
    submissionCooldownSeconds: 0,
  });
  let state = await queue.updateRadioTrack("", "addSimulationFreeTrack");
  assert.equal(state.session.acceptedCount, 0);
  assert.equal(state.session.queueOpen, true);
  await submitTrack("Real Capacity Track");
  state = await queue.getRadioQueueState();
  assert.equal(state.session.acceptedCount, 1);
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.submissionClosureReason, "capacity");
});

test("public and admin snapshot reads never advance the queue mutation revision", async () => {
  await freshOpenSession("read only snapshot revision", {
    showStarted: false,
    submissionCooldownSeconds: 0,
  });
  await submitTrack("Read Only Revision Track");
  const before = await queue.getRadioQueueState();
  const firstPublic = await queue.getPublicQueueSnapshot();
  const secondPublic = await queue.getPublicQueueSnapshot();
  const after = await queue.getRadioQueueState();
  assert.ok(Number.isInteger(before.revision));
  assert.equal(firstPublic.revision, before.revision);
  assert.equal(secondPublic.revision, before.revision);
  assert.equal(after.revision, before.revision);
});

test("submission capacity surfaces use accepted show slots while timing keeps active depth", () => {
  const publicSessionSource = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueSession.tsx"), "utf8");
  const formSource = fs.readFileSync(path.join(projectRoot, "src/components/RadioQueueForm.tsx"), "utf8");
  const adminQueueSource = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");
  const showManagementSource = fs.readFileSync(path.join(projectRoot, "src/components/AdminShowManagement.tsx"), "utf8");
  const uploadRouteSource = fs.readFileSync(path.join(projectRoot, "src/app/api/queue/upload/route.ts"), "utf8");

  assert.match(publicSessionSource, /status\.acceptedCount \?\? snapshot\.status\.activeCount/);
  assert.match(publicSessionSource, /capacity - acceptedCount/);
  assert.match(formSource, /Accepted \/ Capacity/);
  assert.match(formSource, /status\.acceptedCount \?\? status\.activeCount/);
  assert.match(adminQueueSource, /Accepted \/ Capacity/);
  assert.match(showManagementSource, /session\.acceptedCount \?\? session\.activeCount/);
  assert.match(uploadRouteSource, /snapshot\.status\.acceptedCount \?\? snapshot\.status\.activeCount/);
  assert.match(formSource, /priorityDepthAvailable = \(status\?\.activeCount \?\? 0\)/, "Priority depth remains a currently-active queue metric");
});

test("clear archive removes archived sessions and preserves active session", async () => {
  const activeSessionId = await freshOpenSession("clear archive preserve active");
  await queue.archiveCurrentQueueSession();
  await startFreshQueueSession({ title: `active after archive ${Date.now()} ${trackSequence}` });

  const before = await queue.getRadioQueueState();
  assert.ok(before.sessions.some((session) => session.status === "archived"));

  const after = await queue.clearArchivedQueueSessions();
  assert.equal(after.session.sessionId !== activeSessionId, true);
  assert.equal(after.sessions.some((session) => session.status === "archived"), false);
  assert.ok(after.sessions.some((session) => session.sessionId === after.session.sessionId));
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

test("simulation tracks include visible sequence numbers without lane status titles", async () => {
  await freshOpenSession("simulation names", { showStarted: false });

  const state = await queue.updateRadioTrack("", "addSimulationFreeTrack");
  const sim = state.queue.find((entry) => entry.isTestTrack);

  assert.ok(sim, "simulation track should be queued as a test track");
  assert.match(sim.submittedArtistName ?? sim.artist, /\d{3}$/);
  assert.doesNotMatch(sim.submittedSongTitle ?? sim.title, /Free|Wheel|Priority|Checkout Pending|Failed Payment/i);
  assert.match(sim.note ?? "", /\[QUEUE SIMULATION TRACK\]/);
});

test("completed truth excludes finished simulation tracks", async () => {
  await freshOpenSession("simulation completed truth", { showStarted: false });

  let state = await queue.updateRadioTrack("", "addSimulationPaidPriority");
  const sim = state.nextInLine;
  assert.ok(sim?.isTestTrack, "simulation priority track should stage for the rehearsal");

  state = await queue.updateRadioTrack(sim.id, "load");
  state = await queue.updateRadioTrack(sim.id, "finish");

  assert.ok(state.history.some((entry) => entry.id === sim.id && entry.isTestTrack), "admin rehearsal history should retain the simulation record");
  assert.equal(state.totalPlayed, 0, "public played truth must exclude simulation records");
  assert.equal(state.session.completedCount, 0, "session completed truth must exclude simulation records");
});

test("BNL read model excludes simulation tracks from queue and artists", async () => {
  await freshOpenSession("bnl read model sim exclusion", {
    showStarted: false,
    purpose: "live_broadcast",
    bnlPublicationStatus: "runtime_only",
  });
  const real = await submitTrack("BNL Real", { artist: "BNL Real Artist" });
  const nonLatin = await submitTrack("BNL Non Latin", { artist: "東京ビート" });
  let simState = await queue.updateRadioTrack("", "addSimulationPaidPriority");
  const simUpNext = simState.nextInLine;
  assert.ok(simUpNext?.isTestTrack, "simulation priority track should exist in underlying up-next state");
  simState = await queue.updateRadioTrack("", "addSimulationFreeTrack");
  const simQueued = simState.queue.find((entry) => entry.isTestTrack);
  assert.ok(simQueued, "simulation free track should exist in underlying queue state");

  const publicSnapshot = await queue.getPublicQueueSnapshot();
  assert.ok(publicSnapshot.upNext?.id === simUpNext.id || publicSnapshot.queue.some((track) => track.id === simQueued.id), "existing public queue snapshot behavior is preserved for simulation tracks");

  const readModelRoute = require("../src/app/api/bnl/read-model/route.ts");
  const response = await readModelRoute.GET();
  const data = await response.json();

  assert.equal(data.ok, true);
  const queueTrackIds = data.sections.queue.queue.map((track) => track.id);
  assert.ok(queueTrackIds.includes(real.id), "real queue track should remain in the BNL read model");
  assert.ok(queueTrackIds.includes(nonLatin.id), "non-Latin artist track should remain in the BNL read model queue");
  assert.equal(queueTrackIds.includes(simQueued.id), false, "simulation queue track must not enter the BNL read model");
  assert.notEqual(data.sections.queue.upNext?.id ?? null, simUpNext.id, "simulation track must not be exposed as up next");
  assert.notEqual(data.sections.queue.nowPlaying?.id ?? null, simUpNext.id, "simulation track must not be exposed as now playing");
  assert.equal(data.sections.queue.completed.some((track) => track.id === simQueued.id || track.id === simUpNext.id), false, "simulation track must not enter completed history");

  const artistNames = data.sections.artists.map((artist) => artist.name);
  assert.ok(artistNames.includes("BNL Real Artist"), "real artist should remain in derived artist surface");
  const nonLatinArtist = data.sections.artists.find((artist) => artist.name === "東京ビート");
  assert.ok(nonLatinArtist, "non-Latin artist display name should remain in derived artist surface");
  assert.equal(typeof nonLatinArtist.normalizedName, "string");
  assert.notEqual(nonLatinArtist.normalizedName, "", "non-Latin artist normalizedName should not be empty");
  assert.equal(artistNames.some((name) => /^SIM /i.test(name)), false, "simulation artist must not enter derived artist surface");
  assert.ok(data.sections.rules.allowedUse.includes("simulation/test tracks are excluded from this read model"));
  assert.equal(data.sections.rules.sourceAuthority.simulationData, "BNL must treat this read model as live/public context only, not admin simulation data");
});

test("simulation free is blocked while submissions are closed", async () => {
  await startFreshQueueSession({ title: `sim free blocked ${Date.now()} ${trackSequence}` });
  const before = await queue.getRadioQueueState();

  const state = await queue.updateRadioTrack("", "addSimulationFreeTrack");

  assert.equal(state.queue.some((entry) => entry.isTestTrack), false, "closed submissions must block simulation free creation");
  assert.equal(state.nextInLine?.id ?? null, before.nextInLine?.id ?? null, "Next In Line must remain unchanged");
});

test("simulation paid priority is blocked while submissions are closed", async () => {
  await startFreshQueueSession({ title: `sim paid blocked ${Date.now()} ${trackSequence}` });
  const before = await queue.getRadioQueueState();

  const state = await queue.updateRadioTrack("", "addSimulationPaidPriority");

  assert.equal(state.queue.some((entry) => entry.isTestTrack), false, "closed submissions must block simulation paid priority creation");
  assert.equal(state.nextInLine?.id ?? null, before.nextInLine?.id ?? null, "Next In Line must remain unchanged");
});

test("simulation checkout/failed/held creation actions are blocked while submissions are closed", async () => {
  await startFreshQueueSession({ title: `sim variants blocked ${Date.now()} ${trackSequence}` });
  const before = await queue.getRadioQueueState();
  let state = await queue.updateRadioTrack("", "addSimulationCheckoutPending");
  state = await queue.updateRadioTrack("", "addSimulationPaymentFailed");
  state = await queue.updateRadioTrack("", "addSimulationHeldPriority");

  assert.equal(state.queue.some((entry) => entry.isTestTrack), false, "closed submissions must block all simulation creation variants");
  assert.equal(state.nextInLine?.id ?? null, before.nextInLine?.id ?? null, "Next In Line must remain unchanged");
  assert.equal(state.nextNonPriorityLane, before.nextNonPriorityLane, "resolver pointer must remain unchanged");
});

test("clear simulation tracks still works while submissions are closed", async () => {
  await freshOpenSession("sim clear while closed");
  let state = await queue.updateRadioTrack("", "addSimulationFreeTrack");
  assert.ok(state.queue.some((entry) => entry.isTestTrack) || state.nextInLine?.isTestTrack, "open submissions should allow simulation creation");
  await queue.setQueueOpen(false);

  state = await queue.updateRadioTrack("", "clearSimulationTracks");

  assert.equal(state.session.queueOpen, false);
  assert.equal(state.queue.some((entry) => entry.isTestTrack), false, "clear should remove simulated queue entries while closed");
  assert.equal(state.history.some((entry) => entry.isTestTrack), false, "clear should remove simulated history entries while closed");
  assert.equal(state.removed.some((entry) => entry.isTestTrack), false, "clear should remove simulated removed entries while closed");
});

test("simulation creation works when submissions are open", async () => {
  await freshOpenSession("sim creation open", { showStarted: false });

  const state = await queue.updateRadioTrack("", "addSimulationFreeTrack");

  assert.equal(state.session.queueOpen, true);
  assert.ok(state.queue.some((entry) => entry.isTestTrack), "open submissions should allow simulation creation");
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

test("checkout pending and failed payment simulations stay regular until paid", async () => {
  const sessionId = await freshOpenSession("payment processing regular", { showStarted: false });

  let state = await queue.updateRadioTrack("", "addSimulationCheckoutPending");
  const pending = state.queue.find((entry) => entry.isTestTrack && entry.priorityUpgradeStatus === "checkout_pending");
  assert.ok(pending, "checkout-pending simulation should exist");
  assert.equal(pending.lane, "regular", "checkout pending must not move into Priority lane");
  assert.equal(state.nextInLine, null, "checkout pending must not affect Next In Line");

  state = await queue.updateRadioTrack("", "addSimulationPaymentFailed");
  const failed = state.queue.find((entry) => entry.isTestTrack && entry.priorityUpgradeStatus === "failed");
  assert.ok(failed, "failed-payment simulation should exist");
  assert.equal(failed.lane, "regular", "failed payment must not sit in Priority lane");

  state = await payPriority(pending, sessionId);
  assert.equal(state.nextInLine?.id, pending.id, "paid webhook should move the pending track into active Priority");
  assert.equal(state.nextInLine?.lane, "priority");
  assert.equal(state.nextInLine?.priorityUpgradeStatus, "paid");
});


test("legacy unpaid priority-lane records normalize back to regular", async () => {
  await freshOpenSession("legacy pending priority lane", { showStarted: false });

  const pending = await queue.addToQueue({
    artist: "Legacy Pending Artist",
    title: "Legacy Pending Track",
    tiktokHandle: "@legacypending",
    link: "https://example.com/legacy-pending",
    tier: "fastlane",
    lane: "priority",
    amount: 0,
    createdAt: new Date(Date.UTC(2026, 0, 3, 0, 0, trackSequence++)).toISOString(),
    priorityUpgradeRequested: true,
    priorityUpgradeStatus: "checkout_pending",
    priorityUpgradeSource: "stripe",
  });
  const failed = await queue.addToQueue({
    artist: "Legacy Failed Artist",
    title: "Legacy Failed Track",
    tiktokHandle: "@legacyfailed",
    link: "https://example.com/legacy-failed",
    tier: "fastlane",
    lane: "priority",
    amount: 0,
    createdAt: new Date(Date.UTC(2026, 0, 3, 0, 0, trackSequence++)).toISOString(),
    priorityUpgradeRequested: true,
    priorityUpgradeStatus: "failed",
    priorityUpgradeSource: "stripe",
  });

  const state = await queue.getRadioQueueState();
  assert.equal(queuedTrack(state, pending.id)?.lane, "regular", "checkout pending legacy records must not remain Priority");
  assert.equal(queuedTrack(state, pending.id)?.tier, "free", "checkout pending legacy records should render as Free/Regular until paid");
  assert.equal(queuedTrack(state, failed.id)?.lane, "regular", "failed payment legacy records must not remain Priority");
  assert.equal(state.nextInLine, null, "unpaid legacy records must not claim Next In Line as Priority");
});

test("removing wheel from Next In Line restores owed wheel and leaves Next In Line blank", async () => {
  await freshOpenSession("remove next wheel");
  const wheel = await addTrack("Unavailable Wheel");
  const free = await addTrack("Waiting Free");
  const replacement = await addTrack("Replacement Wheel");

  let state = await queue.updateRadioTrack(wheel.id, "wheel");
  assert.equal(state.nextInLine?.id, wheel.id);
  const owedBeforeRemove = state.nextNonPriorityLane;
  const owedSpinsBeforeRemove = state.session.wheelSpinsOwed ?? 0;

  state = await queue.updateRadioTrack(wheel.id, "remove");

  assert.ok(removedTrack(state, wheel.id), "removed wheel should move to removed history");
  assert.equal(state.nextInLine, null, "failed Wheel result should leave Next In Line blank");
  assert.equal(state.nextNonPriorityLane, owedBeforeRemove, "removing failed Wheel should not consume the owed lane");
  assert.equal(state.session.wheelSpinsOwed, owedSpinsBeforeRemove + 1, "failed Wheel result should restore one owed wheel spin");
  assert.ok(queuedTrack(state, free.id), "Free should not be auto-filled after failed Wheel removal");

  state = await queue.getRadioQueueState();
  assert.equal(state.nextInLine, null, "state refresh should not auto-fill while replacement Wheel is pending manual choice");

  state = await queue.updateRadioTrack(replacement.id, "wheel");
  assert.equal(state.nextInLine?.id, replacement.id, "manual replacement Wheel winner should stage normally");
  assert.equal(state.session.wheelSpinsOwed, owedSpinsBeforeRemove, "replacement Wheel should consume the restored owed spin");
});

test("priority can claim Next In Line after failed wheel removal hold", async () => {
  const sessionId = await freshOpenSession("priority after failed wheel");
  const wheel = await addTrack("Failed Wheel Before Priority");
  let state = await queue.updateRadioTrack(wheel.id, "wheel");
  state = await queue.updateRadioTrack(wheel.id, "remove");
  assert.equal(state.nextInLine, null);

  const priority = await addTrack("Priority After Hold");
  state = await payPriority(priority, sessionId);

  assert.equal(state.nextInLine?.id, priority.id, "active Priority should still claim Next In Line during failed-wheel hold");
  assert.equal(state.nextInLine?.lane, "priority");
  assert.equal(state.session.wheelSpinsOwed, 1, "owed Wheel remains underneath Priority");
});

test("finish loaded track cannot reappear in Next In Line after refresh", async () => {
  await freshOpenSession("finish loaded no resurrect");
  const first = await addTrack("Finish Loaded First");
  await addTrack("Finish Loaded Second");
  let state = await queue.updateRadioTrack("", "pullNext");
  state = await queue.updateRadioTrack(state.nextInLine.id, "load");
  state = await queue.updateRadioTrack(first.id, "finish");
  const counts = countTrackOccurrences(state, first.id);
  assert.equal(counts.total, 1);
  assert.equal(counts.historyCount, 1);
  assert.notEqual(state.nextInLine?.id, first.id);
  state = await queue.getRadioQueueState();
  assert.notEqual(state.nextInLine?.id, first.id);
});

test("finish next in line directly cannot resurrect", async () => {
  await freshOpenSession("finish next no resurrect");
  const track = await addTrack("Finish Next Track");
  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, track.id);
  state = await queue.updateRadioTrack(track.id, "finish");
  const counts = countTrackOccurrences(state, track.id);
  assert.equal(counts.historyCount, 1);
  assert.equal(counts.queueCount, 0);
  assert.equal(counts.nextCount, 0);
  assert.equal(counts.nowPlayingCount, 0);
  state = await queue.getRadioQueueState();
  assert.equal(countTrackOccurrences(state, track.id).total, 1);
});

test("remove loaded and next track cannot resurrect", async () => {
  await freshOpenSession("remove no resurrect");
  const loadedTrack = await addTrack("Remove Loaded");
  const nextTrack = await addTrack("Remove Next");
  let state = await queue.updateRadioTrack("", "pullNext");
  state = await queue.updateRadioTrack(state.nextInLine.id, "load");
  state = await queue.updateRadioTrack(loadedTrack.id, "remove");
  assert.equal(countTrackOccurrences(state, loadedTrack.id).removedCount, 1);
  state = await queue.updateRadioTrack(nextTrack.id, "remove");
  assert.equal(countTrackOccurrences(state, nextTrack.id).removedCount, 1);
  state = await queue.getRadioQueueState();
  assert.equal(countTrackOccurrences(state, loadedTrack.id).total, 1);
  assert.equal(countTrackOccurrences(state, nextTrack.id).total, 1);
});

test("track uniqueness invariant holds across load finish remove and moveBack", async () => {
  await freshOpenSession("uniqueness invariant");
  const free = await addTrack("Unique Free");
  const wheel = await addTrack("Unique Wheel");
  let state = await queue.updateRadioTrack(wheel.id, "wheel");
  state = await queue.updateRadioTrack("", "pullNext");
  state = await queue.updateRadioTrack(state.nextInLine.id, "load");
  state = await queue.updateRadioTrack(free.id, "moveBack");
  assert.equal(countTrackOccurrences(state, free.id).total, 1);
  state = await queue.updateRadioTrack(wheel.id, "load");
  state = await queue.updateRadioTrack(wheel.id, "finish");
  assert.equal(countTrackOccurrences(state, wheel.id).total, 1);
  assert.equal(countTrackOccurrences(state, wheel.id).historyCount, 1);
});

test("removed regular track cannot be restored to priority", async () => {
  await freshOpenSession("restore priority guard removed regular");
  const regular = await addTrack("Removed Regular");
  let state = await queue.updateRadioTrack("", "pullNext");
  state = await queue.updateRadioTrack(regular.id, "remove");
  assert.ok(removedTrack(state, regular.id));

  state = await queue.updateRadioTrack(regular.id, "restorePriority");
  assert.ok(removedTrack(state, regular.id), "invalid restorePriority should no-op and keep removed entry");
  assert.equal(queuedTrack(state, regular.id), null);
});

test("removed paid priority track can be restored to priority", async () => {
  const sessionId = await freshOpenSession("restore priority removed paid");
  const priority = await addTrack("Removed Paid Priority");
  let state = await payPriority(priority, sessionId);
  state = await queue.updateRadioTrack(priority.id, "remove");
  assert.ok(removedTrack(state, priority.id));

  state = await queue.updateRadioTrack(priority.id, "restorePriority");
  const restored = queuedTrack(state, priority.id) ?? state.nextInLine;
  assert.equal(restored?.id, priority.id);
  assert.equal(restored?.lane, "priority");
});

test("completed regular track cannot be restored to priority", async () => {
  await freshOpenSession("restore priority guard completed regular");
  const regular = await addTrack("Completed Regular");
  let state = await queue.updateRadioTrack("", "pullNext");
  state = await queue.updateRadioTrack(regular.id, "finish");
  assert.ok(completedTrack(state, regular.id));

  state = await queue.updateRadioTrack(regular.id, "restorePriority");
  assert.ok(completedTrack(state, regular.id), "invalid restorePriority should no-op and keep completed entry");
  assert.equal(queuedTrack(state, regular.id), null);
});

test("completed manual priority track can be restored to priority", async () => {
  await freshOpenSession("restore priority completed manual");
  const priority = await addTrack("Completed Manual Priority");
  let state = await queue.updateRadioTrack(priority.id, "priority");
  state = await queue.updateRadioTrack(priority.id, "finish");
  assert.ok(completedTrack(state, priority.id));

  state = await queue.updateRadioTrack(priority.id, "restorePriority");
  const restored = queuedTrack(state, priority.id) ?? state.nextInLine;
  assert.equal(restored?.id, priority.id);
  assert.equal(restored?.lane, "priority");
});

test("loaded wheel does not stage a second wheel ahead of free and load/remove/undo do not consume wheel turn", async () => {
  await freshOpenSession("loaded wheel/free alternation");
  const wheelOne = await addTrack("Alternation Wheel One");
  const wheelTwo = await addTrack("Alternation Wheel Two");
  const freeOne = await addTrack("Alternation Free One");
  await addTrack("Alternation Free Two");

  let state = await queue.updateRadioTrack(wheelOne.id, "wheel");
  state = await queue.updateRadioTrack(wheelTwo.id, "wheel");
  assert.equal(state.nextInLine?.id, wheelOne.id, "first wheel should stage first");
  const owedBeforeLoad = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(wheelOne.id, "load");
  assert.equal(state.nowPlaying?.id, wheelOne.id, "wheel one should load into PlayerDock");
  assert.equal(state.nextNonPriorityLane, owedBeforeLoad, "loading must not consume lane pointer");
  assert.equal(state.nextInLine?.lane, "regular", "after loading wheel one, next should avoid wheel-wheel stacking when free exists");
  assert.equal(state.nextInLine?.id, freeOne.id, "free should stage ahead of second wheel");

  const owedBeforeRemove = state.nextNonPriorityLane;
  state = await queue.updateRadioTrack(freeOne.id, "remove");
  assert.equal(state.nextNonPriorityLane, owedBeforeRemove, "remove must not consume the owed lane");
  state = await queue.updateRadioTrack(freeOne.id, "restoreRegular");
  assert.equal(state.nextNonPriorityLane, owedBeforeRemove, "undo restore must not consume the owed lane");
});

test("wheel ceremony eligibility helper excludes unsafe queue states", () => {
  const base = { id: "base", artist: "Artist", title: "Track", link: "https://example.com/base", tier: "free", lane: "regular", amount: 0, stripeSessionId: null, status: "queued", createdAt: new Date().toISOString(), playedAt: null, priorityUpgradeStatus: "none" };
  assert.equal(queue.isWheelEligibleTrack(base), true, "regular queued track with no priority upgrade is eligible");
  assert.equal(queue.isWheelEligibleTrack({ ...base, id: "priority", lane: "priority", priorityUpgradeStatus: "paid" }), false, "paid priority is excluded");
  assert.equal(queue.isWheelEligibleTrack({ ...base, id: "checkout", priorityUpgradeStatus: "checkout_pending" }), false, "checkout pending/payment processing is excluded");
  assert.equal(queue.isWheelEligibleTrack({ ...base, id: "wheel", lane: "wheel" }), false, "already Wheel Chosen is excluded");
  assert.equal(queue.isWheelEligibleTrack({ ...base, id: "playing", status: "playing" }), false, "playing/Now Playing is excluded");
  assert.equal(queue.isWheelEligibleTrack({ ...base, id: "next", status: "next" }), false, "Next In Line is excluded");
  assert.equal(queue.isWheelEligibleTrack({ ...base, id: "completed", status: "completed" }), false, "completed is excluded");
  assert.equal(queue.isWheelEligibleTrack({ ...base, id: "removed", status: "removed" }), false, "removed is excluded");
});

test("requestPriorityCheckout rejects missing Priority Signal acknowledgement", async () => {
  const sessionId = await freshOpenSession("priority checkout missing acknowledgement", { showStarted: false });
  await queue.updatePriorityUpgradeSettings({ enabled: true, paymentsEnabled: true, priceCents: 1000, currency: "usd" });
  const track = await addTrack("Checkout Missing Acknowledgement");
  await assert.rejects(() => queue.requestPriorityCheckout(track.id, sessionId), /requires acknowledgement/);
});

test("requestPriorityCheckout accepts eligible regular and wheel tracks and rejects paid or paid-needs-attention", async () => {
  const sessionId = await freshOpenSession("priority checkout eligibility", { showStarted: false });
  await queue.updatePriorityUpgradeSettings({ enabled: true, paymentsEnabled: true, priceCents: 1000, currency: "usd" });
  const regular = await addTrack("Checkout Eligible Regular");
  const wheel = await addTrack("Checkout Eligible Wheel");
  await queue.updateRadioTrack(wheel.id, "wheel");
  await queue.updateRadioTrack(wheel.id, "moveBack");

  const regularRequest = await queue.requestPriorityCheckout(regular.id, sessionId, priorityAcceptance);
  const wheelRequest = await queue.requestPriorityCheckout(wheel.id, sessionId, priorityAcceptance);
  assert.equal(regularRequest.track.id, regular.id);
  assert.equal(wheelRequest.track.id, wheel.id);

  await payPriority(regular, sessionId);
  await assert.rejects(() => queue.requestPriorityCheckout(regular.id, sessionId, priorityAcceptance), /not available/);

  await queue.markPriorityUpgradePaidFromStripe(wheel.id, sessionId, {
    paymentId: `pi_attention_${Date.now()}`,
    amountCents: 1000,
    currency: "usd",
    paidAt: new Date().toISOString(),
  });
  await assert.rejects(() => queue.requestPriorityCheckout(wheel.id, sessionId, priorityAcceptance), /not available/);
});

test("capacity closure blocks new songs but keeps Priority checkout available for an accepted track", async () => {
  const sessionId = await freshOpenSession("priority checkout at capacity", { showStarted: false, queueCapacity: 2 });
  await queue.updatePriorityUpgradeSettings({ enabled: true, paymentsEnabled: true, priceCents: 1000, currency: "usd" });
  const first = await addTrack("Capacity Priority One");
  await addTrack("Capacity Priority Two");

  let state = await queue.getRadioQueueState();
  assert.equal(state.session.acceptedCount, 2);
  assert.equal(state.session.queueOpen, false);
  assert.equal(state.session.submissionClosureReason, "capacity");
  await assert.rejects(() => addTrack("Capacity Rejected Third"), /closed|full/i);

  const checkout = await queue.requestPriorityCheckout(first.id, sessionId, priorityAcceptance);
  assert.equal(checkout.track.id, first.id, "capacity closure must not block upgrading an accepted track");

  await queue.setQueueOpen(false);
  state = await queue.getRadioQueueState();
  assert.equal(state.session.submissionClosureReason, "manual");
  await assert.rejects(() => queue.requestPriorityCheckout(first.id, sessionId, priorityAcceptance), /broadcast session is active/);
});

test("markPriorityUpgradeCheckoutPending preserves existing track data", async () => {
  const sessionId = await freshOpenSession("priority checkout pending metadata", { showStarted: false });
  const track = await addTrack("Checkout Pending Metadata");
  const before = await queue.getRadioQueueState();
  const existing = queuedTrack(before, track.id);
  await queue.markPriorityUpgradeCheckoutPending(track.id, sessionId, {
    provider: "stripe",
    checkoutSessionId: "cs_test_123",
    checkoutUrl: "https://example.com/checkout",
    checkoutCreatedAt: new Date().toISOString(),
    checkoutExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    checkoutOwnerTokenHash: "a".repeat(64),
    priorityAcceptance,
  });
  const after = await queue.getRadioQueueState();
  const updated = queuedTrack(after, track.id);
  assert.equal(updated?.artist, existing?.artist);
  assert.equal(updated?.title, existing?.title);
  assert.equal(updated?.priorityUpgradeStatus, "checkout_pending");
  assert.equal(updated?.priorityUpgradeCheckoutSessionId, "cs_test_123");
  assert.equal(updated?.priorityUpgradeCheckoutOwnerTokenHash, "a".repeat(64));
  assert.equal(updated?.priorityLegalAcceptance?.priorityTermsVersion, PRIORITY_TERMS_VERSION);
  assert.equal(updated?.priorityLegalAcceptance?.priorityDisclosureText, PRIORITY_DISCLOSURE_TEXT);
  assert.equal(updated?.priorityLegalAcceptance?.source, "priority_checkout");
  assert.ok(updated?.priorityLegalAcceptance?.acceptedAt);
  const snapshot = await queue.getPublicQueueSnapshot(sessionId);
  const publicPending = snapshot.queue.find((entry) => entry.id === track.id);
  assert.equal("priorityLegalAcceptance" in publicPending, false);
  assert.equal("priorityUpgradeCheckoutOwnerTokenHash" in publicPending, false);
});

test("gifted Priority attribution is sanitized, payment-bound, public only after confirmation, and immutable on retries", async () => {
  const sessionId = await freshOpenSession("gifted priority attribution", { showStarted: false });
  const track = await addTrack("Gift Recipient", { artist: "Recipient Artist" });
  const capturedAt = "2026-08-09T03:00:00.000Z";
  const gift = queue.createPriorityGiftAttribution({
    attributionVersion: PRIORITY_GIFT_ATTRIBUTION_VERSION,
    attributionDisclosureText: PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT,
    supporterName: "  Signal\u0000   Friend\u202e  ",
  }, track.submittedArtistName ?? track.artist, capturedAt);

  assert.deepEqual(gift, {
    version: PRIORITY_GIFT_ATTRIBUTION_VERSION,
    supporterName: "Signal Friend",
    recipientName: "Recipient Artist",
    capturedAt,
  });
  assert.equal(queue.createPriorityGiftAttribution({
    attributionVersion: PRIORITY_GIFT_ATTRIBUTION_VERSION,
    attributionDisclosureText: PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT,
    supporterName: "   ",
  }, "Recipient Artist", capturedAt).supporterName, PRIORITY_GIFT_ANONYMOUS_NAME);
  assert.equal(Array.from(normalizePriorityGiftDisplayName("🎁".repeat(PRIORITY_GIFT_NAME_MAX_LENGTH + 5), "")).length, PRIORITY_GIFT_NAME_MAX_LENGTH, "emoji truncation must not split surrogate pairs");
  assert.throws(() => queue.createPriorityGiftAttribution({
    attributionVersion: PRIORITY_GIFT_ATTRIBUTION_VERSION,
    attributionDisclosureText: "stale disclosure",
    supporterName: "Signal Friend",
  }, "Recipient Artist", capturedAt), /disclosure mismatch/);

  await queue.markPriorityUpgradeCheckoutPending(track.id, sessionId, {
    provider: "stripe",
    checkoutSessionId: "cs_gift_first",
    checkoutUrl: "https://example.com/gift-checkout",
    checkoutCreatedAt: capturedAt,
    checkoutExpiresAt: "2026-08-09T03:30:00.000Z",
    priorityAcceptance,
    priorityGiftAttribution: gift,
  });
  let state = await queue.getRadioQueueState();
  assert.deepEqual(queuedTrack(state, track.id)?.priorityGiftAttribution, gift, "admin state keeps checkout-bound attribution");
  let publicSnapshot = await queue.getPublicQueueSnapshot(sessionId);
  const publicPending = publicSnapshot.queue.find((entry) => entry.id === track.id);
  assert.equal(publicPending?.priorityGiftAttribution, null);
  assert.doesNotMatch(JSON.stringify(publicPending), /Signal Friend/);

  const paid = await queue.markPriorityUpgradePaidFromStripe(track.id, sessionId, {
    paymentId: "pi_gift_first",
    checkoutSessionId: "cs_gift_first",
    amountCents: 1000,
    currency: "usd",
    paidAt: "2026-08-09T03:01:00.000Z",
    giftAttribution: gift,
  });
  assert.equal(paid.updated, true);
  publicSnapshot = await queue.getPublicQueueSnapshot(sessionId);
  const confirmedGift = publicTrack(publicSnapshot, track.id);
  assert.deepEqual(confirmedGift?.priorityGiftAttribution, {
    version: PRIORITY_GIFT_ATTRIBUTION_VERSION,
    supporterName: "Signal Friend",
    recipientName: "Recipient Artist",
  });
  assert.deepEqual(confirmedPriorityPurchaseDisplay(confirmedGift), {
    kind: "gift",
    supporterName: "Signal Friend",
    recipientName: "Recipient Artist",
    text: "Signal Friend BOUGHT A SKIP FOR Recipient Artist",
  });

  const replacementGift = queue.createPriorityGiftAttribution({
    attributionVersion: PRIORITY_GIFT_ATTRIBUTION_VERSION,
    attributionDisclosureText: PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT,
    supporterName: "Webhook Retry Replacement",
  }, "Different Recipient", "2026-08-09T03:02:00.000Z");
  const retry = await queue.markPriorityUpgradePaidFromStripe(track.id, sessionId, {
    paymentId: "pi_gift_retry",
    checkoutSessionId: "cs_gift_retry",
    amountCents: 1000,
    currency: "usd",
    paidAt: "2026-08-09T03:02:00.000Z",
    giftAttribution: replacementGift,
  });
  assert.equal(retry.updated, false);
  assert.equal(retry.reason, "already_paid");
  state = await queue.getRadioQueueState();
  assert.equal(activeTrack(state, track.id)?.priorityUpgradePaymentId, "pi_gift_first");
  assert.deepEqual(activeTrack(state, track.id)?.priorityGiftAttribution, gift);
});

test("self and manual Priority paths do not invent gifted attribution", async () => {
  const sessionId = await freshOpenSession("non gifted priority", { showStarted: false });
  const selfUpgrade = await addTrack("Self Priority");
  await queue.markPriorityUpgradeCheckoutPending(selfUpgrade.id, sessionId, {
    provider: "stripe",
    checkoutSessionId: "cs_self",
    checkoutUrl: "https://example.com/self-checkout",
    checkoutCreatedAt: "2026-08-09T04:00:00.000Z",
    checkoutExpiresAt: "2026-08-09T04:30:00.000Z",
    checkoutOwnerTokenHash: "b".repeat(64),
    priorityAcceptance,
    priorityGiftAttribution: null,
  });
  await queue.markPriorityUpgradePaidFromStripe(selfUpgrade.id, sessionId, {
    paymentId: "pi_self",
    checkoutSessionId: "cs_self",
    amountCents: 1000,
    currency: "usd",
    paidAt: "2026-08-09T04:01:00.000Z",
    giftAttribution: null,
  });
  const manual = await addTrack("Manual Priority");
  const state = await queue.updateRadioTrack(manual.id, "priority");
  assert.equal(activeTrack(state, selfUpgrade.id)?.priorityUpgradeCheckoutOwnerTokenHash, null);
  assert.equal(activeTrack(state, selfUpgrade.id)?.priorityGiftAttribution, null);
  assert.equal(activeTrack(state, manual.id)?.priorityUpgradeStatus, "manual");
  assert.equal(activeTrack(state, manual.id)?.priorityGiftAttribution, null);
  const publicSnapshot = await queue.getPublicQueueSnapshot(sessionId);
  const publicSelfUpgrade = publicTrack(publicSnapshot, selfUpgrade.id);
  const publicManual = publicTrack(publicSnapshot, manual.id);
  assert.equal(publicSelfUpgrade?.priorityGiftAttribution, null);
  assert.equal(publicManual?.priorityGiftAttribution, null);
  assert.deepEqual(confirmedPriorityPurchaseDisplay(publicSelfUpgrade), {
    kind: "own",
    supporterName: null,
    recipientName: selfUpgrade.submittedArtistName,
    text: `${selfUpgrade.submittedArtistName} BOUGHT A SKIP`,
  });
  assert.equal(confirmedPriorityPurchaseDisplay(publicManual), null, "manual Priority must never be presented as a purchased skip");
});

test("resolvePaidPriority promotes safe queued paid_needs_attention without duplicating or clearing payment metadata", async () => {
  const sessionId = await freshOpenSession("resolve paid priority");
  const track = await addTrack("Resolve Paid Needs Attention");
  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, track.id);
  await queue.markPriorityUpgradePaidFromStripe(track.id, sessionId, {
    paymentId: "pi_resolve_paid_attention",
    amountCents: 1500,
    currency: "usd",
    paidAt: new Date().toISOString(),
  });
  state = await queue.getRadioQueueState();
  const beforeResolve = state.nextInLine?.id === track.id ? state.nextInLine : queuedTrack(state, track.id);
  assert.equal(beforeResolve?.priorityUpgradeStatus, "paid_needs_attention");
  state = await queue.updateRadioTrack(track.id, "moveBack");
  state = await queue.updateRadioTrack(track.id, "resolvePaidPriority");
  const resolved = queuedTrack(state, track.id) ?? state.nextInLine;
  assert.equal(resolved?.priorityUpgradeStatus, "paid");
  assert.equal(resolved?.lane, "priority");
  assert.equal(resolved?.priorityUpgradePaymentId, "pi_resolve_paid_attention");
  assert.equal(countTrackOccurrences(state, track.id).total, 1);
});

test("full default-capacity candidate population reaches the public overlay and keeps the owed spin pending", async () => {
  await freshOpenSession("full capacity overlay", { showStarted: true });
  for (let index = 1; index <= 44; index += 1) {
    await addTrack(`Capacity Candidate ${index}`, { artist: `Distinct Artist ${index}` });
  }
  await queue.updateRadioTrack("", "addWheelSpinOwed");

  const queueState = await queue.getRadioQueueState();
  assert.equal(queueState.session.wheelSpinsOwed, 1, "owed wheel state is available to the admin control");

  await overlay.setLiveOverlayState({ action: "launchWheel" });
  const response = await publicOverlayRoute.GET();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.scene.mode, "wheel_ready");
  assert.equal(payload.scene.wheelCeremony.candidateCount, 44);
  assert.equal(payload.scene.wheelCeremony.displayCandidates.length, 32);
  assert.equal(payload.scene.wheelCeremony.hiddenCandidateCount, 12);
  assert.equal(new Set(payload.scene.wheelCeremony.displayCandidates.map((candidate) => candidate.id)).size, 32);

  const afterLaunch = await queue.getRadioQueueState();
  assert.equal(afterLaunch.session.wheelSpinsOwed, 1, "launching the visual wheel does not consume the owed spin");
  assert.equal(afterLaunch.queue.some((entry) => entry.lane === "wheel"), false, "launching the wheel does not mark a winner");
});


test("wheel re-encrypt rerolls visually without consuming owed spin or marking Wheel Chosen", async () => {
  await freshOpenSession("wheel reencrypt", { showStarted: true });
  await addTrack("Reencrypt One");
  await addTrack("Reencrypt Two");
  await queue.updateRadioTrack("", "addWheelSpinOwed");

  await overlay.setLiveOverlayState({ action: "launchWheel" });
  const launched = await overlay.getLiveOverlayAdminSnapshot();
  const launchOrder = launched.overlayState.wheelCeremonyCandidateOrder ?? [];
  assert.ok(launchOrder.length > 0, "launch stores a candidate order before spin");

  await overlay.setLiveOverlayState({ action: "reencryptWheel" });
  const reencrypted = await overlay.getLiveOverlayAdminSnapshot();
  assert.equal(reencrypted.overlayState.wheelCeremonyStatus, "reencrypting", "re-encrypt enters ceremony effect state");
  assert.equal(reencrypted.overlayState.wheelCeremonyResultTrackId, undefined, "re-encrypt remains visual-only and does not preselect a result");
  const candidateOrder = reencrypted.overlayState.wheelCeremonyCandidateOrder ?? [];
  assert.equal(candidateOrder.length, (reencrypted.wheelCandidates ?? []).length, "re-encrypt keeps candidate ordering aligned with active candidates");
  assert.equal(new Set(candidateOrder).size, candidateOrder.length, "re-encrypt candidate order contains unique candidate ids");
  assert.ok(candidateOrder.every((candidateId) => (reencrypted.wheelCandidates ?? []).some((candidate) => candidate.id === candidateId)), "re-encrypt order only references eligible wheel candidates");
  assert.notDeepEqual(candidateOrder, launchOrder, "re-encrypt rerolls candidate order while keeping eligible candidates");

  const afterReencrypt = await queue.getRadioQueueState();
  assert.equal(afterReencrypt.session.wheelSpinsOwed, 1, "re-encrypt does not consume the owed wheel");
  assert.equal(afterReencrypt.queue.some((entry) => entry.lane === "wheel"), false, "re-encrypt does not mark Wheel Chosen");

  const reencryptReadyAt = new Date(new Date(reencrypted.overlayState.wheelCeremonySpinStartedAt).getTime() + 2300);
  await withFakeNow(reencryptReadyAt, async () => {
    await overlay.setLiveOverlayState({ action: "spinWheel" });
  });
  const pending = await overlay.getLiveOverlayAdminSnapshot();
  const pendingCandidateIds = (pending.wheelCandidates ?? []).map((candidate) => candidate.id);
  assert.ok(pendingCandidateIds.includes(pending.overlayState.wheelCeremonyResultTrackId), "spin after re-encrypt stores a pending eligible wheel candidate result");

  const afterSpin = await queue.getRadioQueueState();
  assert.equal(afterSpin.session.wheelSpinsOwed, 1, "visual spin does not consume the owed wheel");
  assert.equal(afterSpin.queue.some((entry) => entry.lane === "wheel"), false, "visual spin does not mark Wheel Chosen");
});

test("wheel ceremony spin and stale confirm errors do not mutate queue", async () => {
  await freshOpenSession("wheel ceremony errors", { showStarted: true });
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  await overlay.setLiveOverlayState({ action: "launchWheel" });
  await assert.rejects(() => overlay.setLiveOverlayState({ action: "spinWheel" }), /No eligible Wheel Chosen candidates/);
  let state = await queue.getRadioQueueState();
  assert.equal(state.session.wheelSpinsOwed, 1, "failed spin keeps owed wheel");
  assert.equal(state.queue.some((entry) => entry.lane === "wheel"), false, "failed spin does not mark Wheel Chosen");

  await addTrack("Stale Ceremony Result A", { artist: "Stale Artist" });
  await addTrack("Stale Ceremony Result B", { artist: "Stale Artist" });
  await overlay.setLiveOverlayState({ action: "spinWheel" });
  const pendingSnapshot = await overlay.getLiveOverlayAdminSnapshot();
  const winnerCandidate = (pendingSnapshot.wheelCandidates ?? []).find((candidate) => candidate.id === pendingSnapshot.overlayState.wheelCeremonyResultTrackId);
  assert.ok(winnerCandidate, "spin stores a result candidate that exists in active wheel candidates");
  const winnerTrackIds = winnerCandidate?.trackIds?.length ? winnerCandidate.trackIds : (winnerCandidate?.tracks ?? []).map((track) => track.id);
  assert.ok(winnerTrackIds?.length, "winning candidate exposes at least one represented queued track");
  for (const trackId of winnerTrackIds) await queue.updateRadioTrack(trackId, "remove");
  const spinStartedAt = pendingSnapshot.overlayState.wheelCeremonySpinStartedAt;
  const spinDurationMs = pendingSnapshot.overlayState.wheelCeremonySpinDurationMs ?? 24_000;
  const confirmNow = new Date(new Date(spinStartedAt).getTime() + spinDurationMs + 50);
  await withFakeNow(confirmNow, async () => {
    await assert.rejects(() => overlay.setLiveOverlayState({ action: "confirmWheel", selectedTrackId: winnerTrackIds[0] }), /no longer eligible/);
  });
  state = await queue.getRadioQueueState();
  assert.equal(state.session.wheelSpinsOwed, 1, "stale confirm keeps owed wheel");
  assert.equal(state.queue.some((entry) => entry.lane === "wheel"), false, "stale confirm does not mark Wheel Chosen");
});

const queueApi = require("../src/app/api/queue/route.ts");
const uploadApi = require("../src/app/api/queue/upload/route.ts");
const queueTypes = require("../src/lib/queue-types.ts");

function legalAcceptanceBody() {
  return {
    acceptedLegal: true,
    termsVersion: queueTypes.PUBLIC_QUEUE_LEGAL_TERMS_VERSION,
    privacyVersion: queueTypes.PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION,
    queueTermsVersion: queueTypes.PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION,
    acceptedCheckboxText: queueTypes.PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT,
  };
}

function jsonOf(response) {
  return response.json();
}

test("public POST rejects missing sessionId", async () => {
  const sessionId = await freshOpenSession("session required");
  const response = await queueApi.submitTrackFromBody({
    mode: "link",
    artist: "Session Artist",
    title: "Session Track",
    tiktokHandle: "@sessionartist",
    link: "https://example.com/session-required",
    ...legalAcceptanceBody(),
  });
  const payload = await jsonOf(response);
  assert.equal(response.status, 409);
  assert.equal(payload.code, "session_sync_required");
  assert.equal(payload.error, "Session sync required. Refresh the queue and try again.");
  assert.ok(sessionId);
});

test("public POST rejects stale sessionId", async () => {
  const sessionId = await freshOpenSession("stale session");
  await freshOpenSession("new active session");
  const response = await queueApi.submitTrackFromBody({
    sessionId,
    mode: "link",
    artist: "Stale Artist",
    title: "Stale Track",
    tiktokHandle: "@staleartist",
    link: "https://example.com/stale-track",
    ...legalAcceptanceBody(),
  });
  const payload = await jsonOf(response);
  assert.equal(response.status, 409);
  assert.equal(payload.code, "stale_session");
});


test("public POST rejects missing legal acceptance", async () => {
  const sessionId = await freshOpenSession("legal required");
  const response = await queueApi.submitTrackFromBody({
    sessionId,
    mode: "link",
    artist: "Legal Artist",
    title: "Legal Track",
    tiktokHandle: "@legalartist",
    link: "https://example.com/legal-track",
  });
  const payload = await jsonOf(response);
  assert.equal(response.status, 400);
  assert.equal(payload.error, "Legal acceptance is required before submitting to the queue.");
});

test("public POST accepts current active sessionId", async () => {
  const sessionId = await freshOpenSession("current session");
  const response = await queueApi.submitTrackFromBody({
    sessionId,
    mode: "link",
    artist: "Current Artist",
    title: "Current Track",
    tiktokHandle: "@currentartist",
    link: "https://example.com/current-track",
    ...legalAcceptanceBody(),
  });
  const payload = await jsonOf(response);
  assert.equal(response.status, 201);
  assert.ok(payload.track?.id);
});

test("concurrent public POSTs return one accepted response and one truthful full response for the final slot", async () => {
  const sessionId = await freshOpenSession("public final slot", {
    queueCapacity: 1,
    submissionCooldownSeconds: 0,
  });
  const requestFor = (index) => new Request("https://example.test/api/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      mode: "link",
      artist: `Public Race Artist ${index}`,
      title: `Public Race Track ${index}`,
      tiktokHandle: `@publicrace${index}`,
      link: `https://example.com/public-race-${index}`,
      ...legalAcceptanceBody(),
    }),
  });

  const responses = await Promise.all([queueApi.POST(requestFor(1)), queueApi.POST(requestFor(2))]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const rejected = responses.find((response) => response.status === 409);
  assert.equal((await rejected.json()).error, "This broadcast queue is full for new transmissions.");
  const state = await queue.getRadioQueueState();
  assert.equal(state.session.acceptedCount, 1);
});

test("public POST remains rejected while submissions are closed", async () => {
  const sessionId = await freshOpenSession("closed submit");
  await queue.setQueueOpen(false);
  const response = await queueApi.submitTrackFromBody({
    sessionId,
    mode: "link",
    artist: "Closed Artist",
    title: "Closed Track",
    tiktokHandle: "@closedartist",
    link: "https://example.com/closed-track",
    ...legalAcceptanceBody(),
  });
  const payload = await jsonOf(response);
  assert.equal(response.status, 409);
  assert.equal(payload.error, "This broadcast queue is closed.");
});

test("upload session guard rejects missing sessionId", async () => {
  assert.throws(() => uploadApi.assertCurrentUploadSession(undefined, "active_session"), /This session has changed/);
});

test("upload session guard rejects stale sessionId", async () => {
  assert.throws(() => uploadApi.assertCurrentUploadSession("old_session", "active_session"), /This session has changed/);
});

test("upload token guard remains rejected while submissions are closed", async () => {
  assert.throws(() => uploadApi.assertUploadSessionOpen(false, false, 0, 50), /This broadcast queue is closed/);
});

test("upload submission with valid detected duration stores known runtime metadata", async () => {
  const track = await queue.createQueueTrack({
    artist: "Upload Artist",
    title: "Upload Known",
    tiktokHandle: "@uploadknown",
    sourceType: "upload",
    fileUrl: "https://files.example.com/upload-known.mp3",
    fileName: "Upload Artist - Upload Known.mp3",
    fileSize: 12345,
    mimeType: "audio/mpeg",
    detectedDurationSeconds: 222.4,
    durationSource: "upload_metadata",
  });

  assert.equal(track.detectedDurationSeconds, 222);
  assert.equal(track.estimatedDurationSeconds, 222);
  assert.equal(track.durationIsEstimate, false);
  assert.equal(track.durationSource, "upload_metadata");
});

test("upload submission without detected duration stays internal estimate and not detected", async () => {
  const track = await queue.createQueueTrack({
    artist: "Upload Artist",
    title: "Upload Unknown",
    tiktokHandle: "@uploadunknown",
    sourceType: "upload",
    fileUrl: "https://files.example.com/upload-unknown.mp3",
    fileName: "Upload Artist - Upload Unknown.mp3",
    fileSize: 99999,
    mimeType: "audio/mpeg",
  });

  assert.equal(track.detectedDurationSeconds, null);
  assert.equal(track.estimatedDurationSeconds, 300);
  assert.equal(track.durationIsEstimate, true);
  assert.equal(track.durationSource, "internal_estimate");
});

test("uploaded MP3/WAV queue entries retain private audio for at least 30 days", async () => {
  const created = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
  await freshOpenSession("upload deletion metadata", { showStarted: false });

  const track = await withFakeNow(created, () => queue.submitRadioTrack({
    artist: "Upload Artist",
    title: "Upload Track",
    tiktokHandle: "@uploadartistmetadata",
    link: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/upload-track.mp3",
    fileUrl: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/upload-track.mp3",
    fileName: "upload-track.mp3",
    fileSize: 1234,
    mimeType: "audio/mpeg",
    sourceType: "upload",
  }));

  assert.equal(track.uploadedFileDeletionStatus, "pending");
  assert.equal(track.uploadedFileDeletedAt, null);
  assert.equal(new Date(track.uploadedFileDeleteAfter).getTime(), created.getTime() + 30 * 24 * 60 * 60 * 1000);
});

test("link-only submissions do not get raw upload deletion metadata", async () => {
  await freshOpenSession("link deletion metadata", { showStarted: false });
  const track = await submitTrack("Link Only Metadata");

  assert.equal(track.uploadedFileDeleteAfter, null);
  assert.equal(track.uploadedFileDeletedAt, null);
  assert.equal(track.uploadedFileDeletionStatus, null);
});

test("public queue snapshots omit raw upload URLs and deletion metadata", async () => {
  await freshOpenSession("public upload privacy", { showStarted: false });
  await queue.addToQueue({
    artist: "Public Upload Artist",
    title: "Public Upload Track",
    tiktokHandle: "@publicuploadprivacy",
    link: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/public-upload.wav",
    fileUrl: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/public-upload.wav",
    fileName: "public-upload.wav",
    fileSize: 4567,
    mimeType: "audio/wav",
    sourceType: "upload",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    createdAt: new Date(Date.UTC(2026, 0, 10)).toISOString(),
  });

  const json = JSON.stringify(await queue.getPublicQueueSnapshot());
  assert.equal(json.includes("private.blob.vercel-storage.com"), false);
  assert.equal(json.includes("uploadedFileDeleteAfter"), false);
  assert.equal(json.includes("uploadedFileDeletedAt"), false);
  assert.equal(json.includes("uploadedFileDeletionStatus"), false);
});

test("collaborator names survive intake and public projection without exposing private submission details", async () => {
  await freshOpenSession("public collaborator visibility", {
    showStarted: false,
    submissionCooldownSeconds: 0,
  });
  const tiktokHandle = `@collaboratorvisibility${++trackSequence}`;
  const track = await queue.submitRadioTrack({
    artist: "Primary Artist",
    title: "Collaborator Track",
    tiktokHandle,
    link: `https://example.com/collaborator-visibility-${trackSequence}`,
    sourceType: "other",
    collaboratorNames: "  Featured Artist A + Featured Artist B  ",
    note: "private collaborator submission note",
    contactEmail: "private-collaborator@example.com",
  });

  assert.equal(track.collaboratorNames, "Featured Artist A + Featured Artist B");
  const snapshot = await queue.getPublicQueueSnapshot(undefined, { tiktokHandle });
  assert.equal(publicTrack(snapshot, track.id)?.collaboratorNames, "Featured Artist A + Featured Artist B");
  assert.equal(snapshot.submitterStatus?.submitted.find((entry) => entry.id === track.id)?.collaboratorNames, "Featured Artist A + Featured Artist B");

  const json = JSON.stringify(snapshot);
  assert.equal(json.includes("private collaborator submission note"), false);
  assert.equal(json.includes("private-collaborator@example.com"), false);
});

test("collaborators have an explicit Featuring line on active public and operator track surfaces", () => {
  const publicSource = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueSession.tsx"), "utf8");
  const gatewaySource = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueGateway.tsx"), "utf8");
  const adminSource = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");

  assert.match(publicSource, /function CollaboratorLine/);
  assert.match(publicSource, /Featuring:<\/span> \{value\}/);
  assert.ok((publicSource.match(/<CollaboratorLine names=\{track\.collaboratorNames\}/g) ?? []).length >= 2, "public Now Playing/Next In Line and queue lanes should render collaborators");
  assert.match(gatewaySource, /track\.collaboratorNames\?\.trim\(\)/);
  assert.match(gatewaySource, /Featuring:<\/span> \{track\.collaboratorNames\.trim\(\)\}/);
  assert.match(adminSource, /function AdminCollaboratorLine/);
  assert.match(adminSource, /Featuring:<\/span> \{names\}/);
  assert.ok((adminSource.match(/<AdminCollaboratorLine entry=\{/g) ?? []).length >= 3, "operator Next In Line, Player Dock, and lanes should render collaborators");
});

test("cleanup deletes expired BARCODE upload files idempotently without removing records or metadata", async () => {
  await freshOpenSession("upload cleanup", { showStarted: false });
  const oldCreatedAt = new Date(Date.UTC(2026, 0, 1)).toISOString();
  const uploadUrl = "https://store.private.blob.vercel-storage.com/barcode-radio-queue/expired-upload.mp3";
  const externalUrl = "https://example.com/external.mp3";
  const legalAcceptance = {
    acceptedAt: oldCreatedAt,
    termsVersion: "1.0",
    privacyVersion: "1.0",
    queueTermsVersion: "1.0",
    acceptedCheckboxText: "test acceptance text",
    source: "public_queue_form",
  };
  const upload = await queue.addToQueue({
    artist: "Cleanup Upload Artist",
    title: "Cleanup Upload Track",
    tiktokHandle: "@cleanupuploadartist",
    link: uploadUrl,
    fileUrl: uploadUrl,
    fileName: "expired-upload.mp3",
    fileSize: 999,
    mimeType: "audio/mpeg",
    sourceType: "upload",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: "cs_preserved",
    priorityUpgradePaymentId: "pi_preserved",
    createdAt: oldCreatedAt,
    legalAcceptance,
  });
  const linkOnly = await queue.addToQueue({
    artist: "Cleanup Link Artist",
    title: "Cleanup Link Track",
    tiktokHandle: "@cleanuplinkartist",
    link: externalUrl,
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    sourceType: "link",
    createdAt: oldCreatedAt,
  });
  const deleted = [];

  await withFakeNow(new Date(Date.UTC(2026, 0, 3)), () => queue.archiveCurrentQueueSession());

  const first = await queue.cleanupExpiredQueueUploads({ now: new Date(Date.UTC(2026, 1, 3)), deleteBlob: async (url) => { deleted.push(url); } });
  const second = await queue.cleanupExpiredQueueUploads({ now: new Date(Date.UTC(2026, 1, 3, 1)), deleteBlob: async (url) => { deleted.push(url); } });
  const state = await queue.getRadioQueueState((await queue.getRadioQueueState()).sessions.find((session) => session.status === "archived").sessionId);
  const cleaned = state.queue.find((entry) => entry.id === upload.id);
  const link = state.queue.find((entry) => entry.id === linkOnly.id);

  assert.deepEqual(first, { scanned: 1, deleted: 1, skippedActive: 0, failed: 0 });
  assert.deepEqual(second, { scanned: 0, deleted: 0, skippedActive: 0, failed: 0 });
  assert.deepEqual(deleted, [uploadUrl]);
  assert.ok(cleaned, "upload queue record should remain");
  assert.equal(cleaned.uploadedFileDeletionStatus, "deleted");
  assert.equal(cleaned.uploadedFileDeletedAt, new Date(Date.UTC(2026, 1, 3)).toISOString());
  assert.equal(cleaned.legalAcceptance.acceptedAt, legalAcceptance.acceptedAt);
  assert.equal(cleaned.priorityUpgradePaymentId, "pi_preserved");
  assert.equal(cleaned.stripeSessionId, "cs_preserved");
  assert.equal(cleaned.createdAt, oldCreatedAt);
  assert.ok(link, "link-only queue record should remain");
  assert.equal(link.uploadedFileDeletionStatus, null);
});

test("cleanup processes duplicate uploaded track appearances only once per run", async () => {
  await freshOpenSession("duplicate upload cleanup", { showStarted: false });
  const oldCreatedAt = new Date(Date.UTC(2026, 0, 1)).toISOString();
  const uploadUrl = "https://store.private.blob.vercel-storage.com/barcode-radio-queue/duplicate-upload.mp3";
  const upload = await queue.addToQueue({
    artist: "Duplicate Upload Artist",
    title: "Duplicate Upload Track",
    tiktokHandle: "@duplicateuploadartist",
    link: uploadUrl,
    fileUrl: uploadUrl,
    fileName: "duplicate-upload.mp3",
    fileSize: 777,
    mimeType: "audio/mpeg",
    sourceType: "upload",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    createdAt: oldCreatedAt,
  });
  await queue.updateRadioTrack(upload.id, "spotlight");
  await withFakeNow(new Date(Date.UTC(2026, 0, 3)), () => queue.archiveCurrentQueueSession());

  const deleted = [];
  const result = await queue.cleanupExpiredQueueUploads({
    now: new Date(Date.UTC(2026, 1, 3)),
    deleteBlob: async (url) => {
      deleted.push(url);
      if (deleted.length > 1) throw new Error("duplicate delete should not run");
    },
  });
  const sessions = (await queue.getRadioQueueState()).sessions;
  const state = await queue.getRadioQueueState(sessions.find((session) => session.status === "archived").sessionId);
  const queued = state.queue.find((entry) => entry.id === upload.id);
  const spotlight = state.spotlight.find((entry) => entry.id === upload.id);

  assert.deepEqual(result, { scanned: 1, deleted: 1, skippedActive: 0, failed: 0 });
  assert.deepEqual(deleted, [uploadUrl]);
  assert.equal(queued.uploadedFileDeletionStatus, "deleted");
  assert.equal(spotlight.uploadedFileDeletionStatus, "deleted");
  assert.equal(queued.uploadedFileDeletionError, null);
  assert.equal(spotlight.uploadedFileDeletionError, null);
});

const tiktokPostUrl = "https://www.tiktok.com/@scout2015/video/6718335390845095173";
const tiktokPlayerUrl = "https://www.tiktok.com/player/v1/6718335390845095173";

function mockTikTokOEmbed(body, init = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (init.throwAbort) throw new DOMException("aborted", "AbortError");
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": init.contentType ?? "application/json", ...(init.contentLength ? { "content-length": init.contentLength } : {}) },
    });
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test("TikTok metadata maps official oEmbed fields without replacing submitted song title or storing HTML", async () => {
  const mock = mockTikTokOEmbed({ author_name: " Scout Creator ", title: " Caption with   whitespace ", thumbnail_url: "https://p16-sign.tiktokcdn-us.com/image.jpeg", html: "<script>alert(1)</script>" });
  try {
    const track = await queue.createQueueTrack({ artist: "Submitted Artist", title: "Submitted Song", tiktokHandle: "@submitted", link: tiktokPostUrl });
    assert.equal(track.sourceType, "tiktok");
    assert.equal(track.providerId, "tiktok:video:6718335390845095173");
    assert.equal(track.normalizedSourceKey, "tiktok:video:6718335390845095173");
    assert.equal(track.detectedArtistName, "Scout Creator");
    assert.equal(track.providerTitle, "Caption with whitespace");
    assert.equal(track.detectedSongTitle, null);
    assert.equal(track.submittedSongTitle, "Submitted Song");
    assert.equal(track.title, "Submitted Song");
    assert.equal(track.sourceArtworkUrl, "https://p16-sign.tiktokcdn-us.com/image.jpeg");
    assert.equal(track.detectedDurationSeconds, null);
    assert.equal(track.durationIsEstimate, true);
    assert.equal(track.estimatedDurationSeconds, 300);
    assert.equal(JSON.stringify(track).includes("<script>"), false);
    assert.match(mock.calls[0], /^https:\/\/www\.tiktok\.com\/oembed\?url=/);
  } finally { mock.restore(); }
});

test("TikTok metadata failures and player-form URLs fall back safely", async () => {
  for (const body of ["{bad json", { error: "private" }]) {
    const mock = mockTikTokOEmbed(body, { status: body.error ? 404 : 200 });
    try {
      const track = await queue.createQueueTrack({ artist: "Fallback Artist", title: "Fallback Song", tiktokHandle: "@fallback", link: tiktokPostUrl });
      assert.equal(track.detectedArtistName, null);
      assert.equal(track.providerTitle, null);
      assert.equal(track.title, "Fallback Song");
    } finally { mock.restore(); }
  }
  const oversized = mockTikTokOEmbed({ title: "too big" }, { contentLength: String(300 * 1024) });
  try {
    const track = await queue.createQueueTrack({ artist: "Oversize Artist", title: "Oversize Song", tiktokHandle: "@oversize", link: tiktokPostUrl });
    assert.equal(track.providerTitle, null);
  } finally { oversized.restore(); }
  const aborted = mockTikTokOEmbed({}, { throwAbort: true });
  try {
    const track = await queue.createQueueTrack({ artist: "Abort Artist", title: "Abort Song", tiktokHandle: "@abort", link: tiktokPostUrl });
    assert.equal(track.providerTitle, null);
  } finally { aborted.restore(); }
  const player = mockTikTokOEmbed({ title: "should not fetch" });
  try {
    const track = await queue.createQueueTrack({ artist: "Player Artist", title: "Player Song", tiktokHandle: "@player", link: tiktokPlayerUrl });
    assert.equal(track.sourceType, "tiktok");
    assert.equal(track.providerId, "tiktok:video:6718335390845095173");
    assert.equal(track.providerTitle, null);
    assert.deepEqual(player.calls, []);
  } finally { player.restore(); }
});

test("TikTok canonical duplicate identity blocks equivalent forms while preserving distinct posts", async () => {
  await freshOpenSession("tiktok duplicate", { showStarted: false });
  const mock = mockTikTokOEmbed({});
  try {
    const first = await queue.submitRadioTrack({ artist: "TikTok Artist", title: "First", tiktokHandle: "@ttdup1", link: tiktokPostUrl });
    assert.equal(first.normalizedSourceKey, "tiktok:video:6718335390845095173");
    await withFakeNow(new Date(Date.now() + 301_000), async () => {
      await assert.rejects(() => queue.submitRadioTrack({ artist: "TikTok Artist", title: "Same", tiktokHandle: "@ttdup2", link: tiktokPostUrl }), /Duplicate transmission/);
      await assert.rejects(() => queue.submitRadioTrack({ artist: "TikTok Artist", title: "Query", tiktokHandle: "@ttdup3", link: `${tiktokPostUrl}?utm_source=x` }), /Duplicate transmission/);
      await assert.rejects(() => queue.submitRadioTrack({ artist: "TikTok Artist", title: "Fragment", tiktokHandle: "@ttdup4", link: `${tiktokPostUrl}#frag` }), /Duplicate transmission/);
      await assert.rejects(() => queue.submitRadioTrack({ artist: "TikTok Artist", title: "Player", tiktokHandle: "@ttdup5", link: tiktokPlayerUrl }), /Duplicate transmission/);
    });
    const distinct = await withFakeNow(new Date(Date.now() + 602_000), () => queue.submitRadioTrack({ artist: "TikTok Artist", title: "Distinct", tiktokHandle: "@ttdup6", link: "https://www.tiktok.com/@scout2015/video/6718335390845095174" }));
    assert.equal(distinct.providerId, "tiktok:video:6718335390845095174");
    assert.equal(queue.normalizeQueueSourceKey("https://www.youtube.com/watch?v=abc123_def45&utm_source=x"), "youtube.com/watch?v=abc123_def45");
  } finally { mock.restore(); }
});


async function addLegacyIdentityTrack(label, overrides = {}) {
  trackSequence += 1;
  return queue.addToQueue({
    artist: `${label} Artist`,
    title: `${label} Track`,
    tiktokHandle: `@legacy${trackSequence}`,
    link: tiktokPostUrl,
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    createdAt: new Date(Date.UTC(2026, 1, 1, 0, 0, trackSequence)).toISOString(),
    sourceType: "other",
    normalizedSourceKey: "tiktok.com/@scout2015/video/6718335390845095173",
    providerId: null,
    ...overrides,
  });
}

test("legacy TikTok persisted identities are repaired during queue normalization", async () => {
  await freshOpenSession("legacy tiktok identity repair", { showStarted: false });
  const legacyOther = await addLegacyIdentityTrack("Legacy Other");
  const legacyLink = await addLegacyIdentityTrack("Legacy Link", { link: `${tiktokPostUrl}?utm_source=test`, sourceType: "link", normalizedSourceKey: "tiktok.com/@scout2015/video/6718335390845095173?utm_source=test" });
  const missingProvider = await addLegacyIdentityTrack("Legacy Missing Provider", { sourceType: "tiktok", normalizedSourceKey: "tiktok.com/@scout2015/video/6718335390845095173", providerId: null });
  const oldKey = await addLegacyIdentityTrack("Legacy Old Key", { sourceType: "tiktok", normalizedSourceKey: "tiktok.com/@scout2015/video/6718335390845095173#fragment", providerId: "tiktok:tiktok.com/@scout2015/video/6718335390845095173" });
  const player = await addLegacyIdentityTrack("Legacy Player", { link: tiktokPlayerUrl, sourceType: "other", normalizedSourceKey: "tiktok.com/player/v1/6718335390845095173" });

  const state = await queue.getRadioQueueState();
  for (const id of [legacyOther.id, legacyLink.id, missingProvider.id, oldKey.id, player.id]) {
    const entry = state.queue.find((item) => item.id === id);
    assert.ok(entry, `expected migrated entry ${id}`);
    assert.equal(entry.sourceType, "tiktok");
    assert.equal(entry.normalizedSourceKey, "tiktok:video:6718335390845095173");
    assert.equal(entry.providerId, "tiktok:video:6718335390845095173");
  }
});

test("migrated legacy TikTok entries block new equivalent submissions", async () => {
  await freshOpenSession("legacy tiktok duplicate repair", { showStarted: false });
  await addLegacyIdentityTrack("Legacy Duplicate Anchor");
  const mock = mockTikTokOEmbed({});
  try {
    await assert.rejects(() => queue.submitRadioTrack({ artist: "Legacy New", title: "Canonical", tiktokHandle: "@legacynew1", link: tiktokPostUrl }), /Duplicate transmission/);
    await assert.rejects(() => queue.submitRadioTrack({ artist: "Legacy New", title: "Player", tiktokHandle: "@legacynew2", link: tiktokPlayerUrl }), /Duplicate transmission/);
    await assert.rejects(() => queue.submitRadioTrack({ artist: "Legacy New", title: "Query", tiktokHandle: "@legacynew3", link: `${tiktokPostUrl}?utm_source=test` }), /Duplicate transmission/);
    await assert.rejects(() => queue.submitRadioTrack({ artist: "Legacy New", title: "Fragment", tiktokHandle: "@legacynew4", link: `${tiktokPostUrl}#fragment` }), /Duplicate transmission/);
    const distinct = await queue.submitRadioTrack({ artist: "Legacy New", title: "Distinct", tiktokHandle: "@legacynew5", link: "https://www.tiktok.com/@scout2015/video/6718335390845095174" });
    assert.equal(distinct.providerId, "tiktok:video:6718335390845095174");
  } finally { mock.restore(); }
});

test("unsupported TikTok-style and non-TikTok legacy entries are not migrated", async () => {
  await freshOpenSession("legacy tiktok non migration", { showStarted: false });
  const cases = [
    await addLegacyIdentityTrack("Legacy VM", { link: "https://vm.tiktok.com/ZMabc/", sourceType: "other", normalizedSourceKey: "vm.tiktok.com/ZMabc" }),
    await addLegacyIdentityTrack("Legacy VT", { link: "https://vt.tiktok.com/ZMabc/", sourceType: "other", normalizedSourceKey: "vt.tiktok.com/ZMabc" }),
    await addLegacyIdentityTrack("Legacy M", { link: "https://m.tiktok.com/v/6718335390845095173", sourceType: "other", normalizedSourceKey: "m.tiktok.com/v/6718335390845095173" }),
    await addLegacyIdentityTrack("Legacy Invalid", { link: "https://www.tiktok.com/@scout2015", sourceType: "other", normalizedSourceKey: "tiktok.com/@scout2015" }),
    await addLegacyIdentityTrack("Legacy Generic", { link: "https://example.com/song", sourceType: "other", normalizedSourceKey: "example.com/song" }),
    await addLegacyIdentityTrack("Legacy YouTube", { link: "https://www.youtube.com/watch?v=abc123_DEF45", sourceType: "youtube", normalizedSourceKey: "youtube.com/watch?v=abc123_def45", providerId: "youtube:abc123_DEF45" }),
    await addLegacyIdentityTrack("Legacy Spotify", { link: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", sourceType: "spotify", normalizedSourceKey: "open.spotify.com/track/4ulu6hmcjmi75m1a2tkuqc", providerId: "spotify:4uLU6hMCjMI75M1A2tKUQC" }),
    await addLegacyIdentityTrack("Legacy SoundCloud", { link: "https://soundcloud.com/artist-name/track-name", sourceType: "soundcloud", normalizedSourceKey: "soundcloud.com/artist-name/track-name", providerId: "soundcloud:soundcloud.com/artist-name/track-name" }),
    await addLegacyIdentityTrack("Legacy Upload", { link: tiktokPostUrl, fileUrl: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/legacy-upload.mp3", fileName: "legacy-upload.mp3", fileSize: 1234, mimeType: "audio/mpeg", sourceType: "upload", normalizedSourceKey: "upload:legacy", providerId: "upload:legacy" }),
  ];
  const state = await queue.getRadioQueueState();
  for (const original of cases) {
    const entry = state.queue.find((item) => item.id === original.id);
    assert.ok(entry, `expected non-migrated entry ${original.id}`);
    assert.equal(entry.sourceType, original.sourceType);
    assert.equal(entry.normalizedSourceKey, original.normalizedSourceKey);
    assert.equal(entry.providerId, original.providerId ?? null);
  }
});

test("admin and public TikTok component source assertions remain scoped", () => {
  const adminSource = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");
  const publicSource = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueSession.tsx"), "utf8");
  const overlaySource = fs.readFileSync(path.join(projectRoot, "src/lib/live-overlay.ts"), "utf8");
  const formSource = fs.readFileSync(path.join(projectRoot, "src/components/RadioQueueForm.tsx"), "utf8");
  assert.match(adminSource, /entry\.sourceType === "tiktok"\) return "TikTok"/);
  assert.match(publicSource, /track\.sourceType === "tiktok"\) return "TikTok"/);
  assert.match(adminSource, /function AdminTikTokPlayer/);
  const tiktokSource = adminSource.slice(adminSource.indexOf("function AdminTikTokPlayer"), adminSource.indexOf("function PlayerDock"));
  assert.match(tiktokSource, /const parsed = useMemo\(\(\) => parseTikTokVideoUrl\(entry\.link\), \[entry\.link\]\)/);
  assert.match(tiktokSource, /`\$\{parsedPlayerUrl\}\?\$\{params\.toString\(\)\}`/);
  assert.doesNotMatch(tiktokSource, /dangerouslySetInnerHTML/);
  assert.match(tiktokSource, /useEffect\(\(\) => \{/);
  assert.match(tiktokSource, /\}, \[parsedPostId, parsedPlayerUrl, hasParsedTikTokUrl, entry\.link\]\)/);
  assert.doesNotMatch(tiktokSource.match(/\}, \[[^\]]+\]\)/)?.[0] ?? "", /status|notice|errorLabel/);
  assert.match(tiktokSource, /let readyTimer: number \| null = window\.setTimeout/);
  assert.match(tiktokSource, /const clearReadyTimer = \(\) => \{/);
  assert.match(tiktokSource, /type === "onPlayerReady"[\s\S]*clearReadyTimer\(\)/);
  assert.match(tiktokSource, /type === "onPlayerError"[\s\S]*clearReadyTimer\(\)/);
  assert.match(tiktokSource, /return \(\) => \{ clearReadyTimer\(\); window\.removeEventListener/);
  assert.match(tiktokSource, /const value = payload\.value/);
  assert.match(tiktokSource, /value\.errorCode/);
  assert.match(tiktokSource, /value\.errorType/);
  assert.doesNotMatch(tiktokSource, /payload\.errorCode|payload\.code|payload\.errorType|payload\.error/);
  assert.match(tiktokSource, /if \(!isPlainTikTokObject\(value\)\) return/);
  assert.match(adminSource, /code === 1001 \|\| name === "INVALID_VIDEO"\) return "Invalid or unavailable video"/);
  assert.match(adminSource, /code === 2001 \|\| name === "SERVER_ERROR"\) return "TikTok server error"/);
  assert.match(adminSource, /code === 3001 \|\| name === "PLAYBACK_ERROR"\) return "Playback error"/);
  assert.match(tiktokSource, /safeCode === 3002 \|\| errorType === "AUTOPLAY_ERROR"/);
  assert.match(tiktokSource, /Automatic playback was blocked\. Use the player’s Play control\./);
  assert.doesNotMatch(tiktokSource, /3002[\s\S]{0,160}setStatus\("error"\)/);
  assert.doesNotMatch(tiktokSource, /3002[\s\S]{0,180}setErrorLabel\(tiktokErrorLabel/);
  assert.match(tiktokSource, /<iframe ref=\{iframeRef\}/);
  assert.match(tiktokSource, /event\.origin !== "https:\/\/www\.tiktok\.com"/);
  assert.match(tiktokSource, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(tiktokSource, /payload\["x-tiktok-player"\] !== true/);
  assert.match(tiktokSource, /onPlayerReady/);
  assert.match(tiktokSource, /onPlayerError/);
  assert.match(adminSource, /TIKTOK_PLAYER_READY_TIMEOUT_MS = 10_000/);
  assert.match(tiktokSource, /Open Link or Copy Link/);
  assert.doesNotMatch(overlaySource, /provider: "tiktok"|tiktokVideoId|TikTok player/i);
  assert.match(adminSource, /function AdminYouTubePlayer/);
  assert.match(formSource, /TikTok video or Short/);
  assert.match(publicSource, /WATCH ON TIKTOK/);
});
