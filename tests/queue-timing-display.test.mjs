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
  const { outputText } = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename });
  module._compile(outputText, filename);
};
const require = createRequire(import.meta.url);
const display = require("../src/lib/queue-timing-display.ts");
const timing = require("../src/lib/queue-timing.ts");

function track(id, overrides = {}) { return { id, status: "queued", lane: "regular", durationIsEstimate: true, estimatedDurationSeconds: 300, ...overrides }; }

test("range formatting keeps rough about labels and widens low confidence", () => {
  assert.equal(display.publicRangeLabel(timing.buildProjectionRangeSeconds(25 * 60, "medium").label), "About 20–30 min");
  const low = timing.buildProjectionRangeSeconds(25 * 60, "low");
  assert.ok(low.min < 20 * 60);
  assert.ok(low.max > 30 * 60);
});

test("sponsor included and completed public notes reflect current projection", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`done-${index}`, { status: "completed" }));
  const queue = Array.from({ length: 20 }, (_, index) => track(`queued-${index}`));
  const withSponsor = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "not_due", broadcastStartedAt: "2026-01-01T00:00:00.000Z" } });
  assert.ok(withSponsor.publicNotes.includes("Wheel spins or the commercial break may add time."));
  const completedSponsor = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "completed", sponsorBreakCompletedAt: "2026-01-01T00:00:00.000Z" } });
  const skippedSponsor = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "skipped", sponsorBreakCompletedAt: "2026-01-01T00:00:00.000Z" } });
  assert.ok(!completedSponsor.publicNotes.includes("Wheel spins or the commercial break may add time."));
  assert.ok(!skippedSponsor.publicNotes.includes("Wheel spins or the commercial break may add time."));
});

test("wheel overhead public note appears when owed spins add time", () => {
  const summary = display.buildQueueTimingDisplay({ queue: [track("a")], wheelSpinsOwed: 2, session: { sponsorBreakStatus: "completed", wheelSpinsOwed: 2 } });
  assert.ok(summary.publicNotes.includes("Wheel spins may add time."));
});

test("priority display appears only when eligible and payment processing stays ineligible", () => {
  const queue = [track("ahead"), track("target")];
  const impact = timing.estimatePriorityImpact({ queue, session: { sponsorBreakStatus: "completed" } }, queue[1]);
  assert.ok(display.priorityDisplayFromImpact(impact));
  const pending = track("pending", { lane: "priority", priorityUpgradeStatus: "checkout_pending" });
  const pendingImpact = timing.estimatePriorityImpact({ queue: [pending] }, pending);
  assert.equal(display.priorityDisplayFromImpact(pendingImpact), null);
});

test("one song away unknown track includes talk buffer in about 5-15 minute range", () => {
  const estimate = timing.estimateExistingTrackTiming({ queue: [track("ahead"), track("target")], session: { sponsorBreakStatus: "completed" } }, "target");
  const shown = display.displayEstimate(estimate);
  assert.equal(estimate.estimatedSecondsUntilPlay, 360);
  assert.match(shown.label, /About 5–15 min/);
});

test("track duration labels distinguish detected and estimated fallback", () => {
  assert.equal(display.publicTrackDurationLabel(track("known", { detectedDurationSeconds: 222, durationIsEstimate: false })), "3:42");
  assert.equal(display.publicTrackDurationLabel(track("fallback", { detectedDurationSeconds: null, estimatedDurationSeconds: 300, durationIsEstimate: true })), "est. 5:00");
});

test("public projected show time is rough and uses About wording without clock or seconds formatting", () => {
  const label = display.publicProjectedShowTimeLabel(3 * 3600 + 45 * 60, "comfortable");
  assert.equal(label, "About 3h 45m");
  assert.equal(display.publicProjectedShowTimeLabel(5 * 3600 + 10, "warning_ceiling"), "About 5h+");
  assert.ok(!label.includes(":"));
  assert.ok(!/\b(am|pm|seconds?|secs?)\b/i.test(label));
});

test("public line fit copy stays decision-focused", () => {
  assert.equal(display.lineFitCopy("comfortable"), "Looks playable tonight.");
  assert.equal(display.lineFitCopy("tight"), "Line is getting tight tonight.");
  assert.equal(display.lineFitCopy("over_target"), "This may run late.");
  assert.equal(display.lineFitCopy("warning_ceiling"), "Some late submissions may not fit tonight.");
});

test("public projected show time hides unknown values without fake updating copy", () => {
  assert.equal(display.publicProjectedShowTimeLabel(null), null);
  assert.equal(display.publicProjectedShowTimeLabel(0), null);
  assert.notEqual(display.publicProjectedShowTimeLabel(3 * 3600), "Updating live");
});

test("admin summary keeps projected time and 4h/5h target copy", () => {
  const queue = Array.from({ length: 45 }, (_, index) => track(`known-${index}`, { detectedDurationSeconds: 180, durationIsEstimate: false }));
  const summary = display.buildQueueTimingDisplay({ queue, session: { sponsorBreakStatus: "completed" } });
  assert.equal(summary.showRuntimeSummary.projectedLabel, "3h projected");
  assert.equal(summary.showRuntimeSummary.publicProjectedLabel, "About 3h");
  assert.equal(summary.showRuntimeSummary.targetLabel, "4h goal · 5h warning ceiling");
  assert.equal(summary.showRuntimeSummary.publicTargetLabel, "4h goal");
});

test("estimated wait remains separate from projected show time", () => {
  const queue = [track("ahead", { detectedDurationSeconds: 180, durationIsEstimate: false }), track("later", { detectedDurationSeconds: 180, durationIsEstimate: false })];
  const summary = display.buildQueueTimingDisplay({ queue, session: { sponsorBreakStatus: "completed" } });
  assert.equal(summary.submitNowFreeEstimate.label, "About 5–15 min");
  assert.equal(summary.showRuntimeSummary.publicProjectedLabel, "About 8m");
});

test("Personal Signal Status does not include global projected show time copy", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueSession.tsx"), "utf8");
  const start = source.indexOf("function PersonalSignalStatusBar");
  const end = source.indexOf("function estimateExistingTrackForDisplay", start);
  const block = source.slice(start, end);
  assert.ok(!block.includes("Projected Show Time"));
});


test("admin sponsor diagnostics explain gate states compactly", () => {
  assert.match(display.sponsorDiagnosticLabel({ sponsorBreakStatus: "not_due", broadcastStartedAt: "2026-01-01T00:00:00.000Z", midpointReached: false, minElapsedGateReached: false, secondsUntilMinElapsedGate: 24 * 60 }), /Not eligible yet/);
  assert.equal(display.sponsorDiagnosticLabel({ sponsorBreakStatus: "not_due", broadcastStartedAt: "2026-01-01T00:00:00.000Z", midpointReached: true, minElapsedGateReached: false }), "Midpoint reached · waiting for 2h mark");
  assert.equal(display.sponsorDiagnosticLabel({ sponsorBreakStatus: "not_due", broadcastStartedAt: "2026-01-01T00:00:00.000Z", midpointReached: false, minElapsedGateReached: true }), "2h mark reached · waiting for midpoint");
  assert.equal(display.sponsorDiagnosticLabel({ sponsorBreakStatus: "due", broadcastStartedAt: "2026-01-01T00:00:00.000Z", midpointReached: true, minElapsedGateReached: true, sponsorBreakIncluded: true }), "Due now");
  assert.equal(display.sponsorDiagnosticLabel({ sponsorBreakStatus: "completed" }), "Completed");
  assert.equal(display.sponsorDiagnosticLabel({ sponsorBreakStatus: "skipped" }), "Skipped");
  assert.equal(display.sponsorDiagnosticLabel({ sponsorBreakStatus: "running", sponsorBreakSecondsRemaining: 8 * 60 + 42 }), "Running · 9m remaining");
});

test("commercial dueNow is separate from included-in-projection and maps compact labels", () => {
  const queue44 = Array.from({ length: 43 }, (_, i) => track(`q-${i}`));
  const justStarted = display.buildQueueTimingDisplay({
    completed: [track("done-0", { status: "played" })],
    queue: queue44,
    session: { sponsorBreakStatus: "not_due", broadcastStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), showStarted: true, broadcastPhase: "broadcast_active" },
  });
  assert.equal(justStarted.sponsorBreakSummary.dueNow, false);
  assert.notEqual(justStarted.sponsorBreakSummary.compactLabel, "Due");

  const waiting2h = display.buildQueueTimingDisplay({
    completed: Array.from({ length: 22 }, (_, i) => track(`m-${i}`, { status: "played" })),
    queue: Array.from({ length: 22 }, (_, i) => track(`m-q-${i}`)),
    session: { sponsorBreakStatus: "not_due", broadcastStartedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), showStarted: true, broadcastPhase: "broadcast_active" },
  });
  assert.equal(waiting2h.sponsorBreakSummary.dueNow, false);
  assert.equal(waiting2h.sponsorBreakSummary.compactLabel, "Waiting 2h");

  const waitingMidpoint = display.buildQueueTimingDisplay({
    completed: Array.from({ length: 10 }, (_, i) => track(`g-${i}`, { status: "played" })),
    queue: Array.from({ length: 34 }, (_, i) => track(`g-q-${i}`)),
    session: { sponsorBreakStatus: "not_due", broadcastStartedAt: new Date(Date.now() - 140 * 60 * 1000).toISOString(), showStarted: true, broadcastPhase: "broadcast_active" },
  });
  assert.equal(waitingMidpoint.sponsorBreakSummary.dueNow, false);
  assert.equal(waitingMidpoint.sponsorBreakSummary.compactLabel, "Waiting midpoint");

  const due = display.buildQueueTimingDisplay({
    completed: Array.from({ length: 22 }, (_, i) => track(`d-${i}`, { status: "played" })),
    queue: Array.from({ length: 22 }, (_, i) => track(`d-q-${i}`)),
    session: { sponsorBreakStatus: "due", broadcastStartedAt: new Date(Date.now() - 140 * 60 * 1000).toISOString(), showStarted: true, broadcastPhase: "broadcast_active" },
  });
  assert.equal(due.sponsorBreakSummary.dueNow, true);
  assert.equal(due.sponsorBreakSummary.compactLabel, "Due");
});

test("public sponsor note appears only when the gated break is included", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`public-done-${index}`, { status: "completed" }));
  const queue = [track("public-queued-target", { detectedDurationSeconds: 60 })];
  const early = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "not_due", broadcastStartedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() } });
  const included = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "not_due", broadcastStartedAt: "2026-01-01T00:00:00.000Z" } });
  assert.ok(!early.publicNotes.includes("Wheel spins or the commercial break may add time."));
  assert.ok(included.publicNotes.includes("Wheel spins or the commercial break may add time."));
});

test("pressure summary rises from comfortable to critical based on projected runtime", () => {
  const low = display.buildQueueTimingDisplay({ queue: Array.from({ length: 14 }, (_, index) => track(`short-${index}`, { detectedDurationSeconds: 120, durationIsEstimate: false })), session: { sponsorBreakStatus: "completed" } });
  const high = display.buildQueueTimingDisplay({ queue: Array.from({ length: 44 }, (_, index) => track(`long-${index}`, { detectedDurationSeconds: 300, durationIsEstimate: false })), session: { sponsorBreakStatus: "not_due", broadcastStartedAt: "2026-01-01T00:00:00.000Z" } });
  const critical = display.buildQueueTimingDisplay({ queue: Array.from({ length: 60 }, (_, index) => track(`xlong-${index}`, { detectedDurationSeconds: 360, durationIsEstimate: false })), session: { sponsorBreakStatus: "not_due", broadcastStartedAt: "2026-01-01T00:00:00.000Z" } });
  assert.ok(["low", "medium"].includes(low.pressureSummary.level));
  assert.ok(["high", "critical"].includes(high.pressureSummary.level));
  assert.equal(critical.pressureSummary.level, "critical");
});

test("30 unknown tracks stay pre-show until broadcast starts", () => {
  const queue = Array.from({ length: 30 }, (_, index) => track(`u30-${index}`));
  const pre = display.buildQueueTimingDisplay({ queue, session: { showStarted: false, broadcastPhase: "submission_window", sponsorBreakStatus: "not_due" } });
  assert.equal(pre.pressureSummary.mode, "pre_show");
  assert.equal(pre.pressureSummary.isLive, false);
  assert.equal(pre.pressureSummary.recommendation, "Pressure activates when broadcast starts.");
  assert.notEqual(pre.pressureSummary.label, "HIGH");
  const live = display.buildQueueTimingDisplay({ queue, session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-01-01T00:00:00.000Z", sponsorBreakStatus: "not_due" } });
  assert.equal(live.pressureSummary.mode, "live");
  assert.equal(live.pressureSummary.isLive, true);
  assert.ok(["low", "medium", "high", "critical"].includes(live.pressureSummary.level));
});

test("44 unknown tracks can warn live but remain pre-show before broadcast", () => {
  const queue = Array.from({ length: 44 }, (_, index) => track(`u44-${index}`));
  const pre = display.buildQueueTimingDisplay({ queue, session: { showStarted: false, broadcastPhase: "submission_window", sponsorBreakStatus: "not_due" } });
  assert.equal(pre.pressureSummary.mode, "pre_show");
  const live = display.buildQueueTimingDisplay({ queue, session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-01-01T00:00:00.000Z", sponsorBreakStatus: "not_due" } });
  assert.equal(live.pressureSummary.mode, "live");
  assert.ok(["high", "critical"].includes(live.pressureSummary.level));
  assert.ok(live.pressureSummary.factors.some((factor) => factor.toLowerCase().includes("projected runtime")));
});

test("44 unknown pre-show projection is calibrated near 4h30-4h45 range", () => {
  const queue = Array.from({ length: 44 }, (_, index) => track(`cal-${index}`));
  const summary = display.buildQueueTimingDisplay({ queue, session: { sponsorBreakStatus: "not_due", showStarted: false, broadcastPhase: "submission_window" } });
  assert.match(summary.showRuntimeSummary.publicProjectedLabel ?? "", /^About 4h (2[0-9]|3[0-9]|4[0-5])m$/);
});

test("live projection reacts to elapsed time and fast progress", () => {
  const initial = display.buildQueueTimingDisplay({
    queue: Array.from({ length: 44 }, (_, index) => track(`live-initial-${index}`)),
    session: { sponsorBreakStatus: "not_due", showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
  });
  const fastProgress = display.buildQueueTimingDisplay({
    completed: Array.from({ length: 23 }, (_, index) => track(`fast-done-${index}`, { status: "played" })),
    queue: Array.from({ length: 21 }, (_, index) => track(`fast-rem-${index}`)),
    session: { sponsorBreakStatus: "not_due", showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  });
  const slowProgress = display.buildQueueTimingDisplay({
    completed: Array.from({ length: 10 }, (_, index) => track(`slow-done-${index}`, { status: "played" })),
    queue: Array.from({ length: 34 }, (_, index) => track(`slow-rem-${index}`)),
    session: { sponsorBreakStatus: "not_due", showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
  });
  assert.ok(fastProgress.pressureSummary.score < initial.pressureSummary.score);
  assert.ok(slowProgress.pressureSummary.score > fastProgress.pressureSummary.score);
});

test("live pressure eases when tracks are removed and rises with slow pace", () => {
  const queue44 = Array.from({ length: 44 }, (_, index) => track(`base-${index}`));
  const liveBase = display.buildQueueTimingDisplay({ queue: queue44, session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-01-01T00:00:00.000Z", sponsorBreakStatus: "not_due" } });
  const liveReduced = display.buildQueueTimingDisplay({ queue: queue44.slice(0, 32), removed: queue44.slice(32).map((t) => ({ ...t, status: "removed" })), session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-01-01T00:00:00.000Z", sponsorBreakStatus: "not_due", removedCount: 12 } });
  assert.ok(liveReduced.pressureSummary.score <= liveBase.pressureSummary.score);
  const completed = Array.from({ length: 8 }, (_, index) => track(`done-${index}`, { status: "completed", detectedDurationSeconds: 180, durationIsEstimate: false }));
  const slow = display.buildQueueTimingDisplay({ completed, queue: Array.from({ length: 20 }, (_, index) => track(`slow-${index}`)), session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-01-01T00:00:00.000Z", completedRuntimeSeconds: 8 * 180, sponsorBreakStatus: "not_due" } });
  assert.ok(slow.pressureSummary.factors.some((factor) => factor.toLowerCase().includes("slower")));
});

test("wheel owed overhead raises pressure and clearing owed overhead lowers it", () => {
  const queue = Array.from({ length: 20 }, (_, index) => track(`wheel-${index}`));
  const withOwed = display.buildQueueTimingDisplay({ queue, wheelSpinsOwed: 2, session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-01-01T00:00:00.000Z", sponsorBreakStatus: "not_due", wheelSpinsOwed: 2 } });
  const cleared = display.buildQueueTimingDisplay({ queue, wheelSpinsOwed: 0, session: { showStarted: true, broadcastPhase: "broadcast_active", broadcastStartedAt: "2026-01-01T00:00:00.000Z", sponsorBreakStatus: "not_due", wheelSpinsOwed: 0 } });
  assert.ok(withOwed.wheelTimingSummary.overheadSeconds > 0);
  assert.equal(cleared.wheelTimingSummary.overheadSeconds, 0);
  assert.ok(withOwed.pressureSummary.score >= cleared.pressureSummary.score);
});

test("admin top bar renders pressure chip from timingSummary", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");
  assert.ok(source.includes("TopBarPressureChip pressure={topPressure} minimized"));
  assert.ok(source.includes("TopBarPressureChip pressure={topPressure}"));
  assert.ok(source.includes("Projected Runtime"));
  assert.ok(source.includes("Projected: {projectedRuntimeLabel}"));
  assert.ok(source.includes("TopBarCommercialChip summary={timingSummary.sponsorBreakSummary}"));
  assert.ok(source.includes("Accepted / Capacity"));
  assert.ok(source.includes("state?.publicStatus?.acceptedCount"));
  assert.ok(!source.includes("Active / Total"));
  assert.ok(!source.includes(">Runtime<"));
  assert.ok(source.includes("Hide Diagnostics"));
  assert.ok(source.includes("\"Diagnostics\""));
  assert.ok(!source.includes("Show Visuals"));
  assert.ok(!source.includes("Mark Commercial Break Complete"));
  assert.ok(source.includes("Commercial Break Running"));
  assert.ok(source.includes("Commercial Break Done"));
  assert.ok(source.includes("disabled={sponsorStartDisabled}"));
});
