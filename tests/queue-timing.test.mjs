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
const timing = require("../src/lib/queue-timing.ts");

const NOW = new Date("2026-01-01T02:20:00.000Z");
const START_2H20_AGO = "2026-01-01T00:00:00.000Z";
const START_1H30_AGO = "2026-01-01T00:50:00.000Z";
const START_1H45_AGO = "2026-01-01T00:35:00.000Z";

function track(id, overrides = {}) {
  return { id, status: "queued", ...overrides };
}

test("unknown track uses five-minute fallback plus one-minute target talk buffer", () => {
  assert.equal(timing.getEstimatedTrackRuntimeSeconds(track("unknown")), 300);
  assert.equal(timing.getEstimatedTrackSlotSeconds(track("unknown")), 360);
});

test("known three-minute track uses known runtime plus host buffer", () => {
  const known = track("known", { detectedDurationSeconds: 180, durationIsEstimate: false });
  assert.equal(timing.getEstimatedTrackRuntimeSeconds(known), 180);
  assert.equal(timing.getEstimatedTrackSlotSeconds(known), 240);
});

test("host talk buffer can be explicitly set to zero", () => {
  const known = track("zero-buffer", { detectedDurationSeconds: 180, durationIsEstimate: false });
  assert.equal(timing.getEstimatedTrackSlotSeconds(known, { hostTalkBufferSeconds: 0 }), 180);
});

test("runtime estimates respect an explicit zero host talk buffer", () => {
  const tracks = [track("zero-buffer-one", { detectedDurationSeconds: 180 }), track("zero-buffer-two", { detectedDurationSeconds: 180 })];
  const estimate = timing.estimateRuntimeForTracks(tracks, { hostTalkBufferSeconds: 0 });
  assert.equal(estimate.trackSeconds, 360);
  assert.equal(estimate.slotSeconds, 360);
  assert.equal(estimate.hostBufferSeconds, 0);
});

test("observed average track runtime is not inflated by host buffer", () => {
  const completed = [
    track("played-one", { status: "played", completedAt: "2026-01-01T00:00:00.000Z", detectedDurationSeconds: 180 }),
    track("played-two", { status: "played", completedAt: "2026-01-01T00:03:00.000Z", detectedDurationSeconds: 240 }),
  ];
  const snapshot = timing.buildQueueTimingSnapshot({ completed }, { sponsorBreakAlreadyRun: true });
  assert.equal(snapshot.observedAverageTrackRuntimeSeconds, 210);
});

test("sponsor break is due after half of forty non-removed submissions have completed", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`played-${index}`, { status: "played", completedAt: "2026-01-01T00:00:00.000Z" }));
  const queue = Array.from({ length: 20 }, (_, index) => track(`queued-${index}`));
  const estimate = timing.estimateSponsorBreakPlacement({ completed, queue, session: { broadcastStartedAt: START_2H20_AGO } }, { sponsorBreakAlreadyRun: false, now: NOW });
  assert.equal(estimate.totalNonRemovedSubmissions, 40);
  assert.equal(estimate.completedPlayableCount, 20);
  assert.equal(estimate.sponsorBreakThreshold, 20);
  assert.equal(estimate.sponsorBreakIncluded, true);
  assert.equal(estimate.sponsorBreakStatus, "due");
});

test("removed songs do not count toward sponsor midpoint", () => {
  const completed = Array.from({ length: 21 }, (_, index) => track(`played-${index}`, { status: "played", completedAt: "2026-01-01T00:00:00.000Z" }));
  const queue = Array.from({ length: 21 }, (_, index) => track(`queued-${index}`));
  const removed = Array.from({ length: 8 }, (_, index) => track(`removed-${index}`, { status: "removed", removedAt: "2026-01-01T00:00:00.000Z" }));
  const estimate = timing.estimateSponsorBreakPlacement({ completed, queue, removed }, { sponsorBreakAlreadyRun: false });
  assert.equal(estimate.totalNonRemovedSubmissions, 42);
  assert.equal(estimate.sponsorBreakThreshold, 21);
});

test("three owed wheel spins add at least six minutes ceremony overhead", () => {
  const estimate = timing.estimateWheelCeremonySeconds(3);
  assert.equal(estimate.wheelSpinsOwedIncluded, 3);
  assert.equal(estimate.wheelCeremonySeconds, 360);
  assert.ok(estimate.wheelUncertaintyNotes.length > 0);
});

test("sponsor break and wheel ceremony seconds can be explicitly set to zero", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`played-zero-${index}`, { status: "played", completedAt: "2026-01-01T00:00:00.000Z" }));
  const queue = Array.from({ length: 20 }, (_, index) => track(`queued-zero-${index}`));
  const sponsor = timing.estimateSponsorBreakPlacement({ completed, queue, session: { broadcastStartedAt: START_2H20_AGO } }, { sponsorBreakAlreadyRun: false, sponsorBreakSeconds: 0, now: NOW });
  const wheel = timing.estimateWheelCeremonySeconds(3, { wheelCeremonySeconds: 0 });
  assert.equal(sponsor.sponsorBreakIncluded, true);
  assert.equal(sponsor.sponsorBreakSeconds, 0);
  assert.equal(wheel.wheelSpinsOwedIncluded, 3);
  assert.equal(wheel.wheelCeremonySeconds, 0);
});

test("five-hour target and six-hour redline remain advisory timing boundaries", () => {
  const fiveMinuteFullQueue = Array.from({ length: 44 }, (_, index) => track(`five-${index}`, { detectedDurationSeconds: 300, durationIsEstimate: false }));
  const snapshot = timing.buildQueueTimingSnapshot({ queue: fiveMinuteFullQueue, session: { sponsorBreakStatus: "not_due" } });
  assert.equal(snapshot.targetPaceProjectedTotalShowSeconds, 306 * 60);
  assert.equal(snapshot.maximumTalkProjectedTotalShowSeconds, 350 * 60);
  assert.equal(snapshot.targetStatus, "over_target");
  assert.equal(snapshot.warningStatus, "below_warning_ceiling");
  assert.equal(snapshot.targetShowSeconds, 5 * 60 * 60);
  assert.equal(snapshot.warningShowSeconds, 6 * 60 * 60);
});

test("existing track timing classifies now playing, up next, queued, played, removed, and missing", () => {
  const input = {
    nowPlaying: track("now", { status: "playing" }),
    upNext: track("next", { status: "next" }),
    queue: [track("queued")],
    completed: [track("played", { status: "played", completedAt: "2026-01-01T00:00:00.000Z" })],
    removed: [track("removed", { status: "removed", removedAt: "2026-01-01T00:00:00.000Z" })],
  };

  assert.equal(timing.estimateExistingTrackTiming(input, "now").state, "now_playing");
  assert.equal(timing.estimateExistingTrackTiming(input, "next").state, "up_next");
  assert.equal(timing.estimateExistingTrackTiming(input, "queued").state, "queued");
  assert.equal(timing.estimateExistingTrackTiming(input, "played").state, "played");
  assert.equal(timing.estimateExistingTrackTiming(input, "removed").state, "removed");
  assert.equal(timing.estimateExistingTrackTiming(input, "missing").state, "missing");
});

test("known 3:20 track slot is :30 pre plus runtime plus :30 post", () => {
  const known = track("known-320", { detectedDurationSeconds: 200, durationIsEstimate: false });
  const estimate = timing.estimateRuntimeForTracks([known]);
  assert.equal(timing.DEFAULT_PRE_TRACK_TALK_SECONDS, 30);
  assert.equal(timing.DEFAULT_POST_TRACK_TALK_SECONDS, 30);
  assert.equal(timing.DEFAULT_HOST_TALK_BUFFER_SECONDS, 60);
  assert.equal(timing.getEstimatedTrackSlotSeconds(known), 260);
  assert.equal(estimate.preTrackTalkSeconds, 30);
  assert.equal(estimate.postTrackTalkSeconds, 30);
});

test("unknown track slot is :30 pre plus 5:00 fallback plus :30 post", () => {
  const estimate = timing.estimateRuntimeForTracks([track("unknown-700")]);
  assert.equal(timing.getEstimatedTrackSlotSeconds(track("unknown-700")), 360);
  assert.equal(estimate.preTrackTalkSeconds, 30);
  assert.equal(estimate.postTrackTalkSeconds, 30);
  assert.equal(estimate.slotSeconds, 360);
});

test("multiple tracks include pre and post talk for each track", () => {
  const estimate = timing.estimateRuntimeForTracks([
    track("multi-one", { detectedDurationSeconds: 200 }),
    track("multi-two", { detectedDurationSeconds: 180 }),
    track("multi-three", { detectedDurationSeconds: 120 }),
  ]);
  assert.equal(estimate.trackSeconds, 500);
  assert.equal(estimate.preTrackTalkSeconds, 90);
  assert.equal(estimate.postTrackTalkSeconds, 90);
  assert.equal(estimate.slotSeconds, 680);
});

test("known and estimated duration counts remain distinct even when fallback seconds are stored", () => {
  const estimate = timing.estimateRuntimeForTracks([
    track("detected", { detectedDurationSeconds: 180, estimatedDurationSeconds: 180, durationIsEstimate: false }),
    track("fallback", { estimatedDurationSeconds: 300, detectedDurationSeconds: null, durationIsEstimate: true, durationSource: "internal_estimate" }),
  ]);
  assert.equal(estimate.knownDurationCount, 1);
  assert.equal(estimate.unknownDurationCount, 1);
  assert.equal(estimate.trackSeconds, 480);
});

test("completed sponsor break is not included again", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`played-completed-sponsor-${index}`, { status: "played", completedAt: "2026-01-01T00:00:00.000Z" }));
  const queue = Array.from({ length: 20 }, (_, index) => track(`queued-completed-sponsor-${index}`));
  const estimate = timing.estimateSponsorBreakPlacement({ completed, queue, session: { sponsorBreakStatus: "completed", sponsorBreakCompletedAt: "2026-01-01T02:00:00.000Z" } });
  assert.equal(estimate.sponsorBreakStatus, "completed");
  assert.equal(estimate.sponsorBreakIncluded, false);
  assert.equal(estimate.sponsorBreakSecondsIncluded, 0);
});

test("running commercial includes remaining time, not full duration", () => {
  const now = new Date("2026-01-01T03:00:00.000Z");
  const startedAt = new Date(now.getTime() - 4 * 60 * 1000).toISOString();
  const estimate = timing.estimateSponsorBreakPlacement({ session: { sponsorBreakStatus: "running", sponsorBreakStartedAt: startedAt, sponsorBreakSeconds: 630 } }, { now });
  assert.equal(estimate.sponsorBreakStatus, "running");
  assert.ok(estimate.sponsorBreakSecondsIncluded <= 390 && estimate.sponsorBreakSecondsIncluded >= 389);
});

test("wheel overhead does not add extra song durations", () => {
  const queue = [track("wheel-runtime", { detectedDurationSeconds: 180 })];
  const snapshot = timing.buildQueueTimingSnapshot({ queue, wheelSpinsOwed: 3 }, { sponsorBreakAlreadyRun: true });
  assert.equal(snapshot.wheelCeremonySecondsIncluded, 600);
  assert.equal(snapshot.projectedRemainingShowSeconds, 20 * 60 + 180 + 60 + 600);
});

test("owed Wheel spins reconcile against the five-spin reserve before adding extra time", () => {
  const queue = [track("wheel-track", { lane: "wheel", detectedDurationSeconds: 180 })];
  const resolved = timing.buildQueueTimingSnapshot({ queue, wheelSpinsOwed: 0, session: { wheelSpinsOwed: 0, sponsorBreakStatus: "completed" } });
  const covered = timing.buildQueueTimingSnapshot({ queue, wheelSpinsOwed: 1, session: { wheelSpinsOwed: 1, sponsorBreakStatus: "completed" } });
  const aboveReserve = timing.buildQueueTimingSnapshot({ queue, wheelSpinsOwed: 5, session: { wheelSpinsOwed: 5, sponsorBreakStatus: "completed" } });
  assert.equal(resolved.wheelCeremonySecondsIncluded, 4 * timing.DEFAULT_WHEEL_CEREMONY_SECONDS);
  assert.equal(covered.wheelCeremonySecondsIncluded, resolved.wheelCeremonySecondsIncluded);
  assert.equal(aboveReserve.projectedRemainingShowSeconds - resolved.projectedRemainingShowSeconds, timing.DEFAULT_WHEEL_CEREMONY_SECONDS);
});

test("existing queued track receives songsAhead and timing from prior timeline segments", () => {
  const estimate = timing.estimateExistingTrackTiming({ queue: [track("ahead", { detectedDurationSeconds: 200 }), track("target", { detectedDurationSeconds: 180 })], session: { sponsorBreakStatus: "completed" } }, "target", { submissionWindowSeconds: 0, expectedWheelSpins: 0 });
  assert.equal(estimate.state, "queued");
  assert.equal(estimate.songsAhead, 1);
  assert.equal(estimate.estimatedSecondsUntilPlay, 260);
  assert.ok(estimate.timelineSegmentsIncluded.some((segment) => segment.trackId === "ahead"));
});

test("existing-track waits distribute the five-spin reserve by position instead of charging every spin up front", () => {
  const queue = Array.from({ length: 44 }, (_, index) => track(`position-${index}`));
  const input = { queue, session: { activeCount: 44, sponsorBreakStatus: "completed" } };
  const first = timing.estimateExistingTrackTiming(input, queue[0].id);
  const midpoint = timing.estimateExistingTrackTiming(input, queue[22].id);
  const last = timing.estimateExistingTrackTiming(input, queue[43].id);

  assert.equal(first.wheelCeremonySecondsIncluded, 0);
  assert.equal(midpoint.wheelCeremonySecondsIncluded, 3 * timing.DEFAULT_WHEEL_CEREMONY_SECONDS);
  assert.equal(last.wheelCeremonySecondsIncluded, 5 * timing.DEFAULT_WHEEL_CEREMONY_SECONDS);
});

test("now playing estimate is zero and playing now", () => {
  const estimate = timing.estimateExistingTrackTiming({ nowPlaying: track("live", { status: "playing" }) }, "live");
  assert.equal(estimate.state, "now_playing");
  assert.equal(estimate.estimatedSecondsUntilPlay, 0);
  assert.equal(estimate.estimatedRangeSeconds.label, "Now");
});

test("completed track estimate returns played state", () => {
  const estimate = timing.estimateExistingTrackTiming({ completed: [track("done", { status: "played", completedAt: "2026-01-01T00:00:00.000Z" })] }, "done");
  assert.equal(estimate.found, true);
  assert.equal(estimate.state, "played");
});

test("priority comparison is closer than free when eligible", () => {
  const input = { nowPlaying: track("live", { status: "playing", detectedDurationSeconds: 180 }), queue: [track("ahead-one", { detectedDurationSeconds: 300 }), track("target", { detectedDurationSeconds: 180 })], session: { sponsorBreakStatus: "completed" } };
  const estimate = timing.estimatePriorityImpact(input, input.queue[1]);
  assert.equal(estimate.priorityEligible, true);
  assert.ok(estimate.priorityEstimate.estimatedSecondsUntilPlay < estimate.freeEstimate.estimatedSecondsUntilPlay);
  assert.ok(estimate.estimatedSecondsSaved > 0);
});

test("checkout pending Payment Processing is not treated as active Priority", () => {
  const pending = track("pending", { lane: "priority", priorityUpgradeStatus: "checkout_pending", detectedDurationSeconds: 180 });
  const estimate = timing.estimatePriorityImpact({ queue: [pending] }, pending);
  assert.equal(estimate.priorityEligible, false);
  assert.equal(estimate.ineligibleReason, "payment_processing_not_priority");
});

test("active Priority ahead is not skipped by new Priority simulation", () => {
  const activePriority = track("paid-ahead", { lane: "priority", priorityUpgradeStatus: "paid", detectedDurationSeconds: 240 });
  const estimate = timing.estimatePriorityImpact({ nextInLine: activePriority, queue: [track("regular-ahead", { detectedDurationSeconds: 300 })], session: { sponsorBreakStatus: "completed" } }, undefined, { submissionWindowSeconds: 0, expectedWheelSpins: 0 });
  assert.equal(estimate.priorityEligible, true);
  assert.equal(estimate.priorityEstimate.songsAhead, 1);
  assert.equal(estimate.priorityEstimate.estimatedSecondsUntilPlay, 300);
});

test("target status becomes tight in the final half hour before the five-hour target", () => {
  const tracks = Array.from({ length: 40 }, (_, index) => track(`tight-window-${index}`, { detectedDurationSeconds: 300, durationIsEstimate: false }));
  const snapshot = timing.buildQueueTimingSnapshot({ queue: tracks, session: { sponsorBreakStatus: "not_due" } });
  assert.equal(snapshot.projectedTotalShowSeconds, 282 * 60);
  assert.equal(snapshot.targetStatus, "tight");
});

test("range formatting widens low-confidence ranges", () => {
  const medium = timing.buildProjectionRangeSeconds(20 * 60, "medium");
  const low = timing.buildProjectionRangeSeconds(20 * 60, "low");
  assert.ok(low.min < medium.min);
  assert.ok(low.max > medium.max);
});


test("sponsor break becomes due at midpoint regardless of elapsed broadcast time", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`pre2h-done-${index}`, { status: "played", completedAt: START_1H30_AGO }));
  const queue = Array.from({ length: 20 }, (_, index) => track(`pre2h-queued-${index}`, { detectedDurationSeconds: 60 }));
  const estimate = timing.estimateSponsorBreakPlacement({ completed, queue, session: { broadcastStartedAt: START_1H30_AGO } }, { targetSongsAhead: 1, targetProjectedSecondsAhead: 20 * 60, now: NOW });
  assert.equal(estimate.midpointReached, true);
  assert.equal(estimate.sponsorBreakIncluded, true);
  assert.equal(estimate.sponsorBreakStatus, "due");
});

test("sponsor break waits for the counted midpoint", () => {
  const completed = Array.from({ length: 10 }, (_, index) => track(`wait-mid-done-${index}`, { status: "played", completedAt: START_2H20_AGO }));
  const queue = Array.from({ length: 30 }, (_, index) => track(`wait-mid-queued-${index}`, { detectedDurationSeconds: 60 }));
  const beforeMidpoint = timing.estimateSponsorBreakPlacement({ completed, queue, session: { broadcastStartedAt: START_2H20_AGO } }, { targetSongsAhead: 9, targetProjectedSecondsAhead: 10 * 60, now: NOW });
  const atMidpoint = timing.estimateSponsorBreakPlacement({ completed, queue, session: { broadcastStartedAt: START_2H20_AGO } }, { targetSongsAhead: 10, targetProjectedSecondsAhead: 12 * 60, now: NOW });
  assert.equal(beforeMidpoint.midpointReached, false);
  assert.equal(beforeMidpoint.sponsorBreakIncluded, false);
  assert.equal(atMidpoint.sponsorBreakIncluded, true);
});

test("projected targets reserve the sponsor break only when they cross midpoint", () => {
  const completed = Array.from({ length: 10 }, (_, index) => track(`target-done-${index}`, { status: "played" }));
  const queue = Array.from({ length: 30 }, (_, index) => track(`target-queued-${index}`, { detectedDurationSeconds: 60 }));
  const before = timing.estimateSponsorBreakPlacement({ completed, queue }, { targetSongsAhead: 9, targetProjectedSecondsAhead: 10 * 60, now: NOW });
  const crossing = timing.estimateSponsorBreakPlacement({ completed, queue }, { targetSongsAhead: 10, targetProjectedSecondsAhead: 12 * 60, now: NOW });
  assert.equal(before.sponsorBreakIncluded, false);
  assert.equal(crossing.sponsorBreakIncluded, true);
  assert.equal(crossing.sponsorBreakStatus, "not_due");
});

test("skipped sponsor break is not included", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`played-skipped-sponsor-${index}`, { status: "played", completedAt: START_2H20_AGO }));
  const queue = Array.from({ length: 20 }, (_, index) => track(`queued-skipped-sponsor-${index}`));
  const estimate = timing.estimateSponsorBreakPlacement({ completed, queue, session: { sponsorBreakStatus: "skipped", sponsorBreakCompletedAt: NOW.toISOString(), broadcastStartedAt: START_2H20_AGO } }, { now: NOW });
  assert.equal(estimate.sponsorBreakStatus, "skipped");
  assert.equal(estimate.sponsorBreakIncluded, false);
});

test("unknown broadcast start does not block midpoint sponsor placement", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`unknown-start-done-${index}`, { status: "played" }));
  const queue = Array.from({ length: 20 }, (_, index) => track(`unknown-start-queued-${index}`));
  const estimate = timing.estimateSponsorBreakPlacement({ completed, queue }, { targetSongsAhead: 20, targetProjectedSecondsAhead: 3 * 3600, now: NOW });
  assert.equal(estimate.broadcastStartedAt, null);
  assert.equal(estimate.sponsorBreakIncluded, true);
  assert.equal(estimate.sponsorBreakStatus, "due");
});

test("projected show runtime reserves sponsor break for the counted show midpoint", () => {
  const shortQueue = Array.from({ length: 5 }, (_, index) => track(`short-${index}`, { detectedDurationSeconds: 60 }));
  const longCompleted = Array.from({ length: 20 }, (_, index) => track(`long-done-${index}`, { status: "played", completedAt: START_1H45_AGO }));
  const longQueue = Array.from({ length: 20 }, (_, index) => track(`long-${index}`, { detectedDurationSeconds: 60 }));
  const shortSnapshot = timing.buildQueueTimingSnapshot({ queue: shortQueue, session: { broadcastStartedAt: START_1H30_AGO } }, { now: NOW });
  const longSnapshot = timing.buildQueueTimingSnapshot({ completed: longCompleted, queue: longQueue, session: { broadcastStartedAt: START_1H45_AGO } }, { now: NOW });
  assert.equal(shortSnapshot.sponsorBreakSecondsIncluded, timing.DEFAULT_SPONSOR_BREAK_SECONDS);
  assert.equal(longSnapshot.sponsorBreakSecondsIncluded, timing.DEFAULT_SPONSOR_BREAK_SECONDS);
});
