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

test("pressure follows committed remaining work instead of the late clock alone", () => {
  const pressure = (completedCount) => display.buildQueueTimingDisplay(halfwayInput(completedCount), { now: HALF_SHOW_NOW }).pressureSummary;
  assert.equal(pressure(15).level, "critical");
  assert.equal(pressure(20).level, "high");
  assert.equal(pressure(28).level, "low");
  assert.equal(pressure(30).level, "low");
  assert.ok(pressure(15).score > pressure(20).score);
  assert.ok(pressure(20).score > pressure(28).score);
  assert.ok(pressure(28).score >= pressure(30).score);
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

test("paused playback turns the live pause into observed transition pace", () => {
  const observedAt = "2026-08-09T03:10:00.000Z";
  const base = {
    nowPlaying: track("paused", { status: "playing", playedAt: observedAt }),
    queue: [track("later")],
    session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-08-09T03:00:00.000Z", sponsorBreakStatus: "completed" },
    playbackTiming: { trackId: "paused", playbackState: "paused", currentTimeSeconds: 120, durationSeconds: 300, observedAt, source: "player_sync" },
  };
  const first = timing.buildQueueTimingSnapshot(base, { now: new Date(observedAt) });
  const second = timing.buildQueueTimingSnapshot(base, { now: new Date(Date.parse(observedAt) + 60_000) });
  assert.ok(second.currentPaceTalkSecondsPerTrack > first.currentPaceTalkSecondsPerTrack);
  assert.ok(second.projectedRemainingShowSeconds > first.projectedRemainingShowSeconds);
  assert.ok(second.projectedTotalShowSeconds > first.projectedTotalShowSeconds + 60);
});

test("the 12-minute commercial reserve stays planned around the existing 10:30 break", () => {
  const preShow = timing.buildQueueTimingSnapshot({ queue: Array.from({ length: 44 }, (_, index) => track(`pre-${index}`)), session: { sponsorBreakStatus: "not_due", sponsorBreakSeconds: 630 } });
  assert.equal(preShow.sponsorBreakSecondsIncluded, 720);
  assert.equal(preShow.sponsorBreak.sponsorBreakSeconds, 630);

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
  assert.equal(active.wheelCeremonySecondsIncluded, 150);
  assert.equal(cancelled.wheelCeremonySecondsIncluded, 240);
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

test("submission intake time stays outside the five-hour show clock", () => {
  const queue = Array.from({ length: 44 }, (_, index) => track(`intake-${index}`, { detectedDurationSeconds: null, estimatedDurationSeconds: 300, durationIsEstimate: true }));
  const beforeStart = timing.buildQueueTimingSnapshot({
    queue,
    session: { showStarted: false, broadcastPhase: "submission_window", sponsorBreakStatus: "not_due", sponsorBreakSeconds: 630 },
  }, { now: HALF_SHOW_NOW });
  const atStart = timing.buildQueueTimingSnapshot({
    queue,
    session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: HALF_SHOW_NOW.toISOString(), sponsorBreakStatus: "not_due", sponsorBreakSeconds: 630 },
  }, { now: HALF_SHOW_NOW });

  assert.equal(beforeStart.broadcastElapsedSeconds, null);
  assert.equal(atStart.broadcastElapsedSeconds, 0);
  assert.equal(beforeStart.targetPaceProjectedTotalShowSeconds, 276 * 60);
  assert.equal(atStart.targetPaceProjectedTotalShowSeconds, beforeStart.targetPaceProjectedTotalShowSeconds);
});

test("track lengths drive pressure without baking illustrative track counts into the model", () => {
  const liveSession = { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: HALF_SHOW_NOW.toISOString(), sponsorBreakStatus: "not_due", sponsorBreakSeconds: 630 };
  const threeMinute = display.buildQueueTimingDisplay({ queue: Array.from({ length: 44 }, (_, index) => track(`three-${index}`, { detectedDurationSeconds: 180 })), session: liveSession }, { now: HALF_SHOW_NOW });
  const fiveMinute = display.buildQueueTimingDisplay({ queue: Array.from({ length: 44 }, (_, index) => track(`five-${index}`)), session: liveSession }, { now: HALF_SHOW_NOW });

  assert.equal(threeMinute.timeBankSummary.targetProjectionSeconds, 188 * 60);
  assert.equal(threeMinute.timeBankSummary.maximumTalkProjectionSeconds, 232 * 60);
  assert.equal(threeMinute.pressureSummary.level, "low");
  assert.equal(fiveMinute.timeBankSummary.targetProjectionSeconds, 276 * 60);
  assert.equal(fiveMinute.timeBankSummary.maximumTalkProjectionSeconds, 320 * 60);
  assert.equal(fiveMinute.pressureSummary.level, "high");
});

test("only actual owed wheel spins reserve ceremony time", () => {
  const queue = [track("wheel-contract")];
  const none = timing.buildQueueTimingSnapshot({ queue, wheelSpinsOwed: 0, session: { wheelSpinsOwed: 0, sponsorBreakStatus: "completed" } });
  const one = timing.buildQueueTimingSnapshot({ queue, wheelSpinsOwed: 1, session: { wheelSpinsOwed: 1, sponsorBreakStatus: "completed" } });
  assert.equal(none.wheelCeremonySecondsIncluded, 0);
  assert.equal(one.wheelCeremonySecondsIncluded, 120);
  assert.equal(one.projectedTotalShowSeconds - none.projectedTotalShowSeconds, 120);
});

test("a late show clock remains low when little committed work remains", () => {
  const startedAt = "2026-08-09T03:00:00.000Z";
  const now = new Date("2026-08-09T07:00:00.000Z");
  const sponsorStartedAt = "2026-08-09T05:00:00.000Z";
  const sponsorCompletedAt = "2026-08-09T05:10:30.000Z";
  const summary = display.buildQueueTimingDisplay({
    completed: Array.from({ length: 41 }, (_, index) => track(`late-done-${index}`, { status: "played", playedAt: startedAt, completedAt: startedAt })),
    queue: Array.from({ length: 3 }, (_, index) => track(`late-rem-${index}`)),
    session: { completedCount: 41, showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: startedAt, sponsorBreakStatus: "completed", sponsorBreakStartedAt: sponsorStartedAt, sponsorBreakCompletedAt: sponsorCompletedAt },
  }, { now });
  assert.equal(summary.pressureSummary.level, "low");
});

test("finishing the 10:30 commercial releases the unused 1:30 reserve", () => {
  const now = new Date("2026-08-09T05:30:00.000Z");
  const startedAt = new Date(now.getTime() - 630 * 1000).toISOString();
  const base = { queue: [track("after-commercial")], session: { sponsorBreakSeconds: 630, sponsorBreakStartedAt: startedAt } };
  const running = timing.buildQueueTimingSnapshot({ ...base, session: { ...base.session, sponsorBreakStatus: "running" } }, { now });
  const completed = timing.buildQueueTimingSnapshot({ ...base, session: { ...base.session, sponsorBreakStatus: "completed", sponsorBreakCompletedAt: now.toISOString() } }, { now });
  assert.equal(running.sponsorBreakSecondsIncluded, 90);
  assert.equal(running.projectedTotalShowSeconds - completed.projectedTotalShowSeconds, 90);
});
