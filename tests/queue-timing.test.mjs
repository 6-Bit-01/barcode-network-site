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

function track(id, overrides = {}) {
  return { id, status: "queued", ...overrides };
}

test("unknown track uses five-minute fallback plus two-minute host buffer", () => {
  assert.equal(timing.getEstimatedTrackRuntimeSeconds(track("unknown")), 300);
  assert.equal(timing.getEstimatedTrackSlotSeconds(track("unknown")), 420);
});

test("known three-minute track uses known runtime plus host buffer", () => {
  const known = track("known", { detectedDurationSeconds: 180, durationIsEstimate: false });
  assert.equal(timing.getEstimatedTrackRuntimeSeconds(known), 180);
  assert.equal(timing.getEstimatedTrackSlotSeconds(known), 300);
});

test("sponsor break is due after half of forty non-removed submissions have completed", () => {
  const completed = Array.from({ length: 20 }, (_, index) => track(`played-${index}`, { status: "played", completedAt: "2026-01-01T00:00:00.000Z" }));
  const queue = Array.from({ length: 20 }, (_, index) => track(`queued-${index}`));
  const estimate = timing.estimateSponsorBreakPlacement({ completed, queue }, { sponsorBreakAlreadyRun: false });
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

test("four-hour target reports pressure and five hours is only the warning ceiling", () => {
  const tightTracks = Array.from({ length: 46 }, (_, index) => track(`tight-${index}`, { detectedDurationSeconds: 200 }));
  const tightSnapshot = timing.buildQueueTimingSnapshot({ queue: tightTracks }, { sponsorBreakAlreadyRun: true });
  assert.equal(tightSnapshot.targetStatus, "over_target");
  assert.equal(tightSnapshot.warningStatus, "below_warning_ceiling");

  const warningTracks = Array.from({ length: 52 }, (_, index) => track(`warning-${index}`, { detectedDurationSeconds: 240 }));
  const warningSnapshot = timing.buildQueueTimingSnapshot({ queue: warningTracks }, { sponsorBreakAlreadyRun: true });
  assert.equal(warningSnapshot.targetStatus, "warning_ceiling");
  assert.equal(warningSnapshot.warningStatus, "warning_ceiling");
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
