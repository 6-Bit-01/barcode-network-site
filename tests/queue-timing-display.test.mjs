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
  const withSponsor = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "not_due" } });
  assert.ok(withSponsor.publicNotes.includes("Estimate includes the mid-show sponsor break."));
  const completedSponsor = display.buildQueueTimingDisplay({ completed, queue, session: { sponsorBreakStatus: "completed", sponsorBreakCompletedAt: "2026-01-01T00:00:00.000Z" } });
  assert.ok(!completedSponsor.publicNotes.includes("Estimate includes the mid-show sponsor break."));
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
