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
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const timing = require("../src/lib/queue-timing.ts");
const display = require("../src/lib/queue-timing-display.ts");

const HALF_SHOW_NOW = new Date("2026-08-09T05:30:00.000Z");
const HALF_SHOW_STARTED = "2026-08-09T03:00:00.000Z";

function track(id, overrides = {}) {
  return { id, status: "queued", lane: "regular", detectedDurationSeconds: 300, estimatedDurationSeconds: 300, durationIsEstimate: false, ...overrides };
}

function halfwayInput(completedCount) {
  const remainingCount = 44 - completedCount;
  return {
    completed: Array.from({ length: completedCount }, (_, index) => track(`done-${completedCount}-${index}`, { status: "played", playedAt: HALF_SHOW_STARTED, completedAt: HALF_SHOW_STARTED })),
    queue: Array.from({ length: remainingCount }, (_, index) => track(`queued-${completedCount}-${index}`)),
    session: {
      completedCount,
      activeCount: remainingCount,
      showStarted: true,
      broadcastPhase: "broadcast_active",
      broadcastStartedAt: HALF_SHOW_STARTED,
      sponsorBreakStatus: completedCount >= 28 ? "completed" : completedCount >= 22 ? "due" : "not_due",
      sponsorBreakCompletedAt: completedCount >= 28 ? HALF_SHOW_NOW.toISOString() : null,
    },
  };
}

test("pressure follows committed minutes instead of track count", () => {
  const liveSummary = (count, durationSeconds) => display.buildQueueTimingDisplay({
    queue: Array.from({ length: count }, (_, index) => track(`live-${count}-${durationSeconds}-${index}`, { detectedDurationSeconds: durationSeconds, estimatedDurationSeconds: durationSeconds })),
    session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: HALF_SHOW_STARTED, sponsorBreakStatus: "not_due" },
  }, { now: new Date(HALF_SHOW_STARTED) });

  const threeTracks = liveSummary(3, 300);
  const halfQueue = liveSummary(22, 300);
  const shortFullQueue = liveSummary(44, 180);
  const fiveMinuteFullQueue = liveSummary(44, 300);

  assert.equal(threeTracks.pressureSummary.level, "low");
  assert.equal(halfQueue.pressureSummary.level, "low");
  assert.equal(shortFullQueue.pressureSummary.level, "low");
  assert.equal(shortFullQueue.timeBankSummary.targetProjectionSeconds, 218 * 60);
  assert.equal(shortFullQueue.timeBankSummary.maximumTalkProjectionSeconds, 262 * 60);
  assert.equal(shortFullQueue.timeBankSummary.bankSeconds, 82 * 60);
  assert.equal(fiveMinuteFullQueue.showRuntimeSummary.projectedLabel, "5h 6m projected");
  assert.equal(fiveMinuteFullQueue.timeBankSummary.maximumTalkProjectionSeconds, 350 * 60);
  assert.equal(fiveMinuteFullQueue.timeBankSummary.bankSeconds, -6 * 60);
  assert.ok(fiveMinuteFullQueue.timeBankSummary.recommendedPaceSecondsPerTrack > 50 && fiveMinuteFullQueue.timeBankSummary.recommendedPaceSecondsPerTrack < 53);
  assert.ok(["high", "critical"].includes(fiveMinuteFullQueue.pressureSummary.level));
  assert.ok(fiveMinuteFullQueue.pressureSummary.score > shortFullQueue.pressureSummary.score);
});

test("actual transition pace and later submissions raise or lower the same projection", () => {
  const completed = Array.from({ length: 5 }, (_, index) => track(`pace-done-${index}`, { status: "played", playedAt: HALF_SHOW_STARTED, completedAt: HALF_SHOW_STARTED }));
  const firstHalf = Array.from({ length: 17 }, (_, index) => track(`pace-first-${index}`));
  const base = {
    completed,
    queue: firstHalf,
    session: { completedCount: 5, activeCount: 17, showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: HALF_SHOW_STARTED, sponsorBreakStatus: "not_due" },
  };
  const onPace = display.buildQueueTimingDisplay(base, { now: new Date(Date.parse(HALF_SHOW_STARTED) + 30 * 60_000) });
  const overTalking = display.buildQueueTimingDisplay(base, { now: new Date(Date.parse(HALF_SHOW_STARTED) + 60 * 60_000) });
  const filled = display.buildQueueTimingDisplay({ ...base, queue: [...firstHalf, ...Array.from({ length: 22 }, (_, index) => track(`pace-late-${index}`))], session: { ...base.session, activeCount: 39 } }, { now: new Date(Date.parse(HALF_SHOW_STARTED) + 60 * 60_000) });

  assert.equal(onPace.timeBankSummary.currentPaceSecondsPerTrack, 60);
  assert.ok(overTalking.timeBankSummary.currentPaceSecondsPerTrack > onPace.timeBankSummary.currentPaceSecondsPerTrack);
  assert.ok(overTalking.pressureSummary.score > onPace.pressureSummary.score);
  assert.ok(filled.pressureSummary.score > overTalking.pressureSummary.score);
  assert.ok(filled.timeBankSummary.currentProjectionSeconds > overTalking.timeBankSummary.currentProjectionSeconds);
});

test("player progress reduces remaining work while preserving the projected end", () => {
  const observedAt = "2026-08-09T03:10:00.000Z";
  const base = {
    nowPlaying: track("live", { status: "playing", playedAt: observedAt }),
    queue: [track("later")],
    session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-08-09T03:00:00.000Z", sponsorBreakStatus: "completed" },
    playbackTiming: { trackId: "live", playbackState: "playing", currentTimeSeconds: 120, durationSeconds: 300, observedAt, source: "player_sync" },
  };
  const firstNow = new Date(observedAt);
  const secondNow = new Date(firstNow.getTime() + 60_000);
  const first = timing.buildQueueTimingSnapshot(base, { now: firstNow });
  const second = timing.buildQueueTimingSnapshot(base, { now: secondNow });
  assert.equal(first.projectedRemainingShowSeconds - second.projectedRemainingShowSeconds, 60);
  assert.equal(first.projectedTotalShowSeconds, second.projectedTotalShowSeconds);
  assert.equal(first.projectedEndAt, second.projectedEndAt);
});

test("paused playback holds remaining work while elapsed time raises the projection", () => {
  const observedAt = "2026-08-09T03:10:00.000Z";
  const base = {
    nowPlaying: track("paused", { status: "playing", playedAt: observedAt }),
    queue: [track("later")],
    session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-08-09T03:00:00.000Z", sponsorBreakStatus: "completed" },
    playbackTiming: { trackId: "paused", playbackState: "paused", currentTimeSeconds: 120, durationSeconds: 300, observedAt, source: "player_sync" },
  };
  const first = timing.buildQueueTimingSnapshot(base, { now: new Date(observedAt) });
  const second = timing.buildQueueTimingSnapshot(base, { now: new Date(Date.parse(observedAt) + 60_000) });
  assert.equal(first.projectedRemainingShowSeconds, second.projectedRemainingShowSeconds);
  assert.equal(second.projectedTotalShowSeconds - first.projectedTotalShowSeconds, 60);
});

test("a 12-minute planning reserve becomes the actual 10:30 commercial countdown at runtime", () => {
  const preShow = timing.buildQueueTimingSnapshot({ queue: Array.from({ length: 44 }, (_, index) => track(`pre-${index}`)), session: { sponsorBreakStatus: "not_due" } });
  assert.equal(preShow.sponsorBreakSecondsIncluded, 720);

  const midpoint = timing.estimateSponsorBreakPlacement(halfwayInput(22), { now: HALF_SHOW_NOW, targetSongsAhead: 0 });
  assert.equal(midpoint.sponsorBreakThreshold, 22);
  assert.equal(midpoint.sponsorBreakStatus, "due");
  assert.equal(midpoint.sponsorBreakIncluded, true);
  assert.ok(midpoint.sponsorBreakNotes.every((note) => !note.includes("2-hour") && !note.includes("2h")));
});

test("a running wheel ceremony burns down one reservation and cancelled ceremony restores it", () => {
  const input = {
    queue: [track("wheel-later")],
    wheelSpinsOwed: 2,
    session: { wheelSpinsOwed: 2, sponsorBreakStatus: "completed" },
    wheelTiming: { status: "spinning", startedAt: "2026-08-09T03:00:00.000Z", observedAt: "2026-08-09T03:01:00.000Z", remainingSeconds: 180, spinsOwed: 2 },
  };
  const active = timing.buildQueueTimingSnapshot(input, { now: new Date("2026-08-09T03:01:30.000Z") });
  const cancelled = timing.buildQueueTimingSnapshot({ ...input, wheelTiming: { ...input.wheelTiming, status: "cancelled" } }, { now: new Date("2026-08-09T03:01:30.000Z") });
  assert.equal(active.wheelCeremonySecondsIncluded, 510);
  assert.equal(cancelled.wheelCeremonySecondsIncluded, 600);
});

test("unknown duration affects confidence but does not add a separate pressure penalty", () => {
  const known = halfwayInput(28);
  const unknown = {
    ...known,
    queue: known.queue.map((entry) => ({ ...entry, detectedDurationSeconds: null, estimatedDurationSeconds: 300, durationIsEstimate: true, durationSource: "internal_estimate" })),
  };
  const knownSummary = display.buildQueueTimingDisplay(known, { now: HALF_SHOW_NOW });
  const unknownSummary = display.buildQueueTimingDisplay(unknown, { now: HALF_SHOW_NOW });
  assert.equal(knownSummary.pressureSummary.score, unknownSummary.pressureSummary.score);
  assert.notEqual(knownSummary.showRuntimeSummary.confidenceLabel, unknownSummary.showRuntimeSummary.confidenceLabel);
});

test("admin and public surfaces do not duplicate current-song remaining time", () => {
  const admin = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");
  const publicQueue = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueSession.tsx"), "utf8");
  for (const source of [admin, publicQueue]) {
    assert.doesNotMatch(source, /current song remaining|now playing remaining|current track remaining/i);
  }
});
