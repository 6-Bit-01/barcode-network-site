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
  assert.ok(withSponsor.publicNotes.includes("Estimate includes the mid-show sponsor break."));
  const completedSponsor = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "completed", sponsorBreakCompletedAt: "2026-01-01T00:00:00.000Z" } });
  const skippedSponsor = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "skipped", sponsorBreakCompletedAt: "2026-01-01T00:00:00.000Z" } });
  assert.ok(!completedSponsor.publicNotes.includes("Estimate includes the mid-show sponsor break."));
  assert.ok(!skippedSponsor.publicNotes.includes("Estimate includes the mid-show sponsor break."));
});

test("wheel overhead public note appears when owed spins add time", () => {
  const summary = display.buildQueueTimingDisplay({ queue: [track("a")], wheelSpinsOwed: 2, session: { sponsorBreakStatus: "completed", wheelSpinsOwed: 2 } });
  assert.ok(summary.publicNotes.includes("Wheel spins waiting may add time."));
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
  assert.equal(estimate.estimatedSecondsUntilPlay, 420);
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
  assert.equal(summary.showRuntimeSummary.projectedLabel, "3h 45m projected");
  assert.equal(summary.showRuntimeSummary.publicProjectedLabel, "About 3h 45m");
  assert.equal(summary.showRuntimeSummary.targetLabel, "4h goal · 5h warning ceiling");
  assert.equal(summary.showRuntimeSummary.publicTargetLabel, "4h goal");
});

test("estimated wait remains separate from projected show time", () => {
  const queue = [track("ahead", { detectedDurationSeconds: 180, durationIsEstimate: false }), track("later", { detectedDurationSeconds: 180, durationIsEstimate: false })];
  const summary = display.buildQueueTimingDisplay({ queue, session: { sponsorBreakStatus: "completed" } });
  assert.equal(summary.submitNowFreeEstimate.label, "About 5–15 min");
  assert.equal(summary.showRuntimeSummary.publicProjectedLabel, "About 10m");
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
});

test("public sponsor note appears only when the gated break is included", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`public-done-${index}`, { status: "completed" }));
  const queue = [track("public-queued-target", { detectedDurationSeconds: 60 })];
  const early = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "not_due", broadcastStartedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() } });
  const included = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "not_due", broadcastStartedAt: "2026-01-01T00:00:00.000Z" } });
  assert.ok(!early.publicNotes.includes("Estimate includes the mid-show sponsor break."));
  assert.ok(included.publicNotes.includes("Estimate includes the mid-show sponsor break."));
});
