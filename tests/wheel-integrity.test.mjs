import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// These behavioral fixtures never use a live queue, provider, or upload store.
for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "QUEUE_REDIS_REST_URL", "QUEUE_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN", "VERCEL"]) delete process.env[name];
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
const root = path.resolve(import.meta.dirname, "..");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, parent, ...args);
};
Module._extensions[".ts"] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
};
const require = createRequire(import.meta.url);
const queue = require("../src/lib/queue.ts");
const overlay = require("../src/lib/live-overlay.ts");
const geometry = require("../src/lib/live-overlay-resolver.ts");
let sequence = 0;

function entry(id, extra = {}) {
  return { id, artist: `Artist ${id}`, title: `Song ${id}`, tiktokHandle: `@${id}`, link: `https://example.test/${id}`, sourceType: "other", lane: "regular", tier: "free", amount: 0, status: "queued", createdAt: "2026-09-11T20:00:00.000Z", ...extra };
}
async function fresh() {
  const state = await queue.getRadioQueueState();
  if (state.session.status !== "archived") await queue.archiveCurrentQueueSession();
  await queue.startNewQueueSession({ purpose: "rehearsal", submissionCooldownSeconds: 0 });
  await queue.setQueueOpen(true);
  return queue.getRadioQueueState();
}
async function add(extra = {}) {
  sequence += 1;
  return queue.addToQueue(entry(`fixture${sequence}`, { createdAt: new Date(Date.UTC(2026, 8, 11, 20, 0, sequence)).toISOString(), ...extra }));
}
async function at(now, run) {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new RealDate(now).getTime(); }
  };
  try { return await run(); } finally { global.Date = RealDate; }
}
async function pendingSpin() {
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  await overlay.setLiveOverlayState({ action: "launchWheel" });
  const { overlayState: spin } = await overlay.setLiveOverlayState({ action: "spinWheel" });
  return new Date(Date.parse(spin.wheelCeremonySpinStartedAt) + spin.wheelCeremonySpinDurationMs + 50);
}

test("a later identity bridge merges both earlier entrants and retains queue order without exposing identity keys", () => {
  const tracks = [
    entry("a", { contactEmail: "a@example.test", submitterToken: "private-a" }),
    entry("b", { contactEmail: "b@example.test" }),
    entry("c", { tiktokHandle: "@a", contactEmail: "b@example.test" }),
    entry("d", { submitterToken: "private-a" }),
  ];
  const groups = overlay.getWheelCandidatesFromQueue(tracks);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].trackIds, ["a", "b", "c", "d"]);
  assert.deepEqual(groups[0].tracks.map((track) => track.id), ["a", "b", "c", "d"]);
  assert.equal(groups[0].trackCount, 4);
  assert.doesNotMatch(JSON.stringify(groups), /private-a|contactEmail|submitterToken|example.test/);
});

test("ineligible entries cannot bridge independent eligible entrants", () => {
  const groups = overlay.getWheelCandidatesFromQueue([
    entry("a", { contactEmail: "a@example.test" }),
    entry("b", { contactEmail: "b@example.test" }),
    entry("bridge", { tiktokHandle: "@a", contactEmail: "b@example.test", lane: "priority", priorityUpgradeStatus: "paid" }),
  ]);
  assert.deepEqual(groups.map((group) => group.trackIds), [["a"], ["b"]]);
});

test("Winner Not Here removes only the soonest eligible track, respecting a track moved back by Signal Hold", async () => {
  await fresh();
  const held = await add({ artist: "Absent Artist", signalHoldQueueOrderAt: "2026-09-12T00:00:00.000Z" });
  const soonest = await add({ artist: "Absent Artist" });
  const later = await add({ artist: "Absent Artist" });
  const readyAt = await pendingSpin();
  await at(readyAt, () => overlay.setLiveOverlayState({ action: "wheelWinnerNotHere", selectedTrackId: held.id }));
  const state = await queue.getRadioQueueState();
  assert.deepEqual(state.removed.map((track) => track.id), [soonest.id]);
  assert.deepEqual(state.queue.map((track) => track.id), [later.id, held.id]);
  assert.equal(state.session.wheelSpinsOwed, 1);
  const snapshot = await overlay.getLiveOverlayAdminSnapshot();
  assert.equal(snapshot.overlayState.wheelCeremonyStatus, "ready");
  assert.equal(snapshot.wheelCandidates[0].trackCount, 2);
});

test("absent-winner removal rechecks current eligibility under the queue mutation lock", async () => {
  const initial = await fresh();
  const first = await add({ artist: "Changing Artist" });
  const second = await add({ artist: "Changing Artist" });
  await queue.updateRadioTrack(first.id, "priority");
  await assert.rejects(() => queue.removeEarliestWheelCandidateTrack([first.id, second.id], initial.session.sessionId, "changing-spin"), /no longer removable/);
  assert.equal((await queue.getRadioQueueState()).removed.length, 0, "stale eligibility requires a refreshed result");
  const state = await queue.removeEarliestWheelCandidateTrack([second.id], initial.session.sessionId, "refreshed-spin");
  assert.equal(state.nextInLine.id, first.id, "new Priority is not removed by an old wheel snapshot");
  assert.deepEqual(state.removed.map((track) => track.id), [second.id]);
  await assert.rejects(() => queue.removeEarliestWheelCandidateTrack([first.id], initial.session.sessionId, "changing-spin"), /no longer removable/);
  await assert.rejects(() => queue.removeEarliestWheelCandidateTrack([first.id], "stale-session", "changing-spin"), /no longer removable/);
});

test("concurrent absent-winner clicks remove only one track from the same result", async () => {
  const initial = await fresh();
  const first = await add({ artist: "Absent Artist" });
  const second = await add({ artist: "Absent Artist" });
  const requests = await Promise.allSettled([
    queue.removeEarliestWheelCandidateTrack([first.id, second.id], initial.session.sessionId, "same-spin"),
    queue.removeEarliestWheelCandidateTrack([first.id, second.id], initial.session.sessionId, "same-spin"),
  ]);
  assert.equal(requests.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(requests.filter((result) => result.status === "rejected").length, 1);
  const state = await queue.getRadioQueueState();
  assert.deepEqual(state.removed.map((track) => track.id), [first.id]);
  assert.deepEqual(state.queue.map((track) => track.id), [second.id]);
  await assert.rejects(() => queue.removeEarliestWheelCandidateTrack([second.id], initial.session.sessionId, "same-spin"), /already handled/, "a delayed duplicate with a fresh candidate list cannot remove a sibling");
  assert.doesNotMatch(JSON.stringify(queue.toPublicQueueTrack(state.removed[0])), /wheelRejectedSpinKey|same-spin|wheelQueueOrderAt/);
});

test("an entirely stale wheel result removes no other entrant", async () => {
  await fresh();
  const old = await add();
  const readyAt = await pendingSpin();
  await queue.updateRadioTrack(old.id, "remove");
  const other = await add();
  await at(readyAt, () => assert.rejects(() => overlay.setLiveOverlayState({ action: "wheelWinnerNotHere" }), /no longer removable/));
  const state = await queue.getRadioQueueState();
  assert.deepEqual(state.queue.map((track) => track.id), [other.id]);
  assert.equal(state.session.wheelSpinsOwed, 1);
});

test("waiting Wheel winners retain selection order with equal or backwards wall clocks and older submissions", async () => {
  await fresh();
  const oldest = await add();
  const older = await add();
  const newest = await add();
  const priority = await add();
  await queue.updateRadioTrack(priority.id, "priority");
  await at("2026-09-12T01:00:00.000Z", async () => {
    await queue.updateRadioTrack(newest.id, "wheel");
    await queue.updateRadioTrack(older.id, "wheel");
  });
  await at("2026-09-12T00:59:59.000Z", () => queue.updateRadioTrack(oldest.id, "wheel"));
  const state = await queue.getRadioQueueState();
  assert.deepEqual(state.queue.map((track) => track.id), [newest.id, older.id, oldest.id]);
  assert.ok(state.queue.every((track) => Number.isFinite(Date.parse(track.wheelQueueOrderAt))), "win order survives store normalization");
  assert.equal(new Set(state.queue.map((track) => track.wheelQueueOrderAt)).size, 3);
  const resolved = await queue.updateRadioTrack(priority.id, "finish");
  assert.equal(resolved.nextInLine.id, newest.id);
});

test("legacy waiting Wheel entries keep their relative order ahead of new winners", async () => {
  await fresh();
  const priority = await add();
  await queue.updateRadioTrack(priority.id, "priority");
  const legacyFirst = await add({ lane: "wheel", tier: "frontrow", createdAt: "2026-10-01T00:00:00.000Z" });
  const legacySecond = await add({ lane: "wheel", tier: "frontrow", createdAt: "2026-10-02T00:00:00.000Z", wheelQueueOrderAt: "invalid" });
  const selected = await add();
  await at("2026-09-12T01:00:00.000Z", () => queue.updateRadioTrack(selected.id, "wheel"));
  const state = await queue.getRadioQueueState();
  assert.deepEqual(state.queue.map((track) => track.id), [legacyFirst.id, legacySecond.id, selected.id]);
});

test("Priority restores a displaced Wheel winner before a later winner and preserves the Free turn", async () => {
  await fresh();
  const laterWinner = await add();
  const free = await add();
  const firstWinner = await add();
  await queue.updateRadioTrack(firstWinner.id, "wheel");
  await queue.updateRadioTrack("", "startShow");
  const priority = await add();
  await queue.updateRadioTrack(priority.id, "priority");
  await queue.updateRadioTrack(laterWinner.id, "wheel");
  const observed = [];
  for (let i = 0; i < 4; i += 1) {
    const { nextInLine } = await queue.getRadioQueueState();
    observed.push(nextInLine?.id);
    await queue.updateRadioTrack(nextInLine.id, "load");
    await queue.updateRadioTrack(nextInLine.id, "finish");
  }
  assert.deepEqual(observed, [priority.id, firstWinner.id, free.id, laterWinner.id]);
});

test("every landing advances at least one clockwise revolution from the current rotation", () => {
  let current = 0;
  for (const count of [1, 2, 10, 32, 44]) {
    const segments = geometry.buildWheelSegments(Array.from({ length: count }, (_, i) => ({ id: String(i), label: String(i) })));
    for (const segment of [...segments, segments[0], segments[0]]) {
      const target = geometry.wheelClockwiseTargetRotation(current, geometry.wheelFinalRotationForSegment(segment), 1);
      assert.ok(target - current >= 360 - 1e-9);
      assert.equal(geometry.wheelSegmentAtPointer(segments, target).id, segment.id);
      current = target;
    }
  }
  assert.ok(geometry.wheelClockwiseTargetRotation(-500, 30, 0) >= -140, "a caller cannot disable the minimum turn");
});

// Run the receiver's actual animation effect with controlled RAF/clock/ref state.
// This catches using an absolute landing directly, restarting a spin on a poll,
// and rendering a pending result at zero after the receiver remounts.
function receiverEffectHarness() {
  const file = path.join(root, "src/components/LiveOverlayReceiver.tsx");
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("const startRotation =") && node.arguments[0]?.getText(source).includes("spinRafRef.current")) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  // The implementation may destructure its stored plan instead.
  if (!callback) {
    function findPlan(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("const { startRotation, targetRotation }") && node.arguments[0]?.getText(source).includes("spinRafRef.current")) callback = node.arguments[0];
      ts.forEachChild(node, findPlan);
    }
    findPlan(source);
  }
  assert.ok(callback, "receiver animation effect exists");
  const code = ts.transpileModule(`(${callback.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let frame;
  const rotations = [];
  const scope = {
    ceremony: null, finalRotationDeg: 0, spinStartedAtMs: 0,
    spinRafRef: { current: null }, wheelRotationValueRef: { current: 0 }, wheelSpinPlanRef: { current: null },
    clockAnchorRef: { current: null }, performance: { now: () => 0 }, WHEEL_SPIN_START_DELAY_MS: 1100,
    window: { requestAnimationFrame: (fn) => { frame = fn; return 1; }, cancelAnimationFrame: () => { frame = null; }, setTimeout: () => 2, clearTimeout: () => {} },
    setWheelFrozen: () => {},
    applyWheelRotation: (value) => { scope.wheelRotationValueRef.current = value; rotations.push(value); },
    wheelClockwiseTargetRotation: geometry.wheelClockwiseTargetRotation,
  };
  return {
    scope, rotations,
    run(status, seed, target, elapsed = 0) {
      scope.ceremony = { status, seed, spinStartedAt: "2026-09-12T01:00:00.000Z", spinDurationMs: 16000 };
      scope.finalRotationDeg = target;
      scope.spinStartedAtMs = Date.parse(scope.ceremony.spinStartedAt);
      scope.clockAnchorRef.current = { serverNowMs: scope.spinStartedAtMs + elapsed, responseTransitEstimateMs: 0, receivedAtPerformanceMs: 0 };
      return vm.runInNewContext(code, scope)();
    },
    tick(now) { assert.ok(frame); const tick = frame; frame = null; tick(now); },
  };
}

test("receiver animates consecutive and repeated winners clockwise without resetting the same spin on a poll", () => {
  const harness = receiverEffectHarness();
  const segments = geometry.buildWheelSegments(Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: String(i) })));
  let previous = 0;
  for (const [index, segment] of [segments[0], segments[1], segments[1]].entries()) {
    const landing = geometry.wheelFinalRotationForSegment(segment);
    harness.run("spinning", `spin-${index}`, landing);
    harness.tick(9100);
    const middle = harness.scope.wheelRotationValueRef.current;
    harness.run("spinning", `spin-${index}`, landing, 9100);
    assert.ok(Math.abs(harness.scope.wheelRotationValueRef.current - middle) < 1e-8, "poll/effect restart resumes the same trajectory");
    harness.tick(17100);
    const end = harness.scope.wheelRotationValueRef.current;
    assert.ok(end - previous >= 360);
    assert.equal(geometry.wheelSegmentAtPointer(segments, end).id, segment.id);
    harness.run("result_pending", `spin-${index}`, landing);
    assert.equal(harness.scope.wheelRotationValueRef.current, end);
    harness.run("ready", `spin-${index}`, landing);
    previous = end;
  }
  assert.ok(harness.rotations.every((value, index, values) => index === 0 || value >= values[index - 1] - 1e-8));
});

test("a receiver mounting after a spin displays the selected landing immediately", () => {
  const harness = receiverEffectHarness();
  harness.run("result_pending", "completed-spin", 1476);
  assert.equal(harness.scope.wheelRotationValueRef.current, 1476);
});
