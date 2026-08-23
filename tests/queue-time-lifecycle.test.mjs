import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename });
  module._compile(outputText, filename);
};
const require = createRequire(import.meta.url);
const pacific = require("../src/lib/pacific-time.ts");
const cooldown = require("../src/lib/queue-cooldown.ts");
const liveTiming = require("../src/lib/queue-live-timing.ts");

test("session dates stay on the Pacific calendar across UTC rollover", () => {
  assert.equal(pacific.pacificDateString(new Date("2026-08-09T06:59:59.000Z")), "2026-08-08");
  assert.equal(pacific.pacificDateString(new Date("2026-08-09T07:00:00.000Z")), "2026-08-09");
  assert.equal(pacific.pacificDateString(new Date("2026-01-09T07:59:59.000Z")), "2026-01-08");
  assert.equal(pacific.pacificDateString(new Date("2026-01-09T08:00:00.000Z")), "2026-01-09");
});

test("cooldown recovery is derived from an absolute deadline after background time", () => {
  const deadline = cooldown.cooldownDeadlineFromRemaining(300, 1_000_000);
  assert.equal(cooldown.cooldownRemainingFromDeadline(deadline, 1_000_000), 300);
  assert.equal(cooldown.cooldownRemainingFromDeadline(deadline, 1_180_001), 120);
  assert.equal(cooldown.cooldownRemainingFromDeadline(deadline, 1_400_000), 0);
});

test("queue form refreshes absolute cooldown truth on browser resume and reconnect", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/RadioQueueForm.tsx"), "utf8");
  for (const eventName of ["visibilitychange", "focus", "pageshow", "online"]) assert.ok(source.includes(eventName));
  assert.ok(source.includes("cooldownRemainingFromDeadline"));
  assert.ok(!source.includes("setCooldownRemaining((value) => Math.max(0, value - 1))"));
});

test("session creation, show management, and export fallback share Pacific date ownership", () => {
  const queue = fs.readFileSync(path.join(projectRoot, "src/lib/queue.ts"), "utf8");
  const management = fs.readFileSync(path.join(projectRoot, "src/components/AdminShowManagement.tsx"), "utf8");
  assert.ok(queue.includes("return pacificDateString()"));
  assert.ok(queue.includes("session.showDate || pacificDateString()"));
  assert.ok(management.includes("return pacificDateString()"));
});

test("public sponsor mode remains non-blocking and promotes the TikTok live action", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueSession.tsx"), "utf8");
  assert.ok(source.includes("A WORD FROM OUR SPONSOR"));
  assert.ok(source.includes("sponsor-live-cta"));
  assert.ok(source.includes("queue, submissions, status, and navigation stay live"));
  const banner = source.slice(source.indexOf("A WORD FROM OUR SPONSOR") - 300, source.indexOf("A WORD FROM OUR SPONSOR") + 500);
  assert.ok(banner.includes("<section") && !banner.includes("fixed inset"));
});

test("queue GET routes attach sanitized player and wheel clocks", () => {
  const publicRoute = fs.readFileSync(path.join(projectRoot, "src/app/api/queue/route.ts"), "utf8");
  const adminRoute = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/queue/route.ts"), "utf8");
  assert.ok(publicRoute.includes("attachQueueLiveTiming"));
  assert.ok(adminRoute.includes("attachQueueLiveTiming"));
});

test("live timing accepts only the matching player track and sanitizes wheel state", () => {
  const track = { id: "playing-track", detectedDurationSeconds: 240, estimatedDurationSeconds: 240 };
  const observedAt = "2026-08-09T03:00:00.000Z";
  const matching = liveTiming.buildQueuePlaybackTiming(track, { provider: "audio", trackId: track.id, playbackState: "playing", currentTimeSeconds: 90, durationSeconds: 240, updatedAt: observedAt, muted: false });
  const mismatch = liveTiming.buildQueuePlaybackTiming(track, { provider: "audio", trackId: "different-track", playbackState: "playing", currentTimeSeconds: 90, durationSeconds: 240, updatedAt: observedAt, muted: false });
  assert.equal(matching.source, "player_sync");
  assert.equal(matching.currentTimeSeconds, 90);
  assert.equal(mismatch.source, "loaded_clock");
  assert.equal(mismatch.playbackState, "stopped");

  const wheel = liveTiming.buildQueueWheelTiming(2, { wheelCeremonyStatus: "spinning", wheelCeremonyStartedAt: observedAt }, new Date("2026-08-09T03:00:30.000Z"));
  assert.deepEqual(Object.keys(wheel).sort(), ["observedAt", "remainingSeconds", "spinsOwed", "startedAt", "status"]);
  assert.equal(wheel.remainingSeconds, 210);
});
