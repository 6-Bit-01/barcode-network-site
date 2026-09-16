import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as resolver from "../src/lib/live-overlay-resolver.ts";

// Exercise production callbacks with in-memory provider events. No network,
// queue store or credentials are used by this recovery comparison.
const admin = fs.readFileSync(new URL("../src/components/AdminRadioQueueControl.tsx", import.meta.url), "utf8");
const receiver = fs.readFileSync(new URL("../src/components/LiveOverlayReceiver.tsx", import.meta.url), "utf8");
const ref = (current) => ({ current });
const noop = () => {};
function find(source, predicate) {
  const root = typeof source === "string" ? ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) : source;
  let found;
  function visit(node) { if (found) return; if (predicate(node)) found = node; else ts.forEachChild(node, visit); }
  visit(root);
  assert.ok(found, "production callback exists");
  return found;
}
const component = (source, name) => find(source, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
const variable = (root, name) => find(root, (n) => ts.isVariableDeclaration(n) && n.name.getText() === name);
function evaluate(node, globals) {
  const js = ts.transpileModule(`(${node.getText()})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(js, globals);
}

test("YouTube host publishes the observed playing position immediately without pausing for an acknowledgement", () => {
  const calls = [];
  const globals = {
    generationRef: ref(1), generation: 1, cancelled: false, playbackStateRef: ref("stopped"), bufferingRef: ref(false),
    playerRef: ref({ getCurrentTime: () => 28, pauseVideo: () => calls.push(["pause"]) }),
    publish: (...args) => calls.push(["publish", ...args]), reportLifecycle: (...args) => calls.push(["lifecycle", ...args]),
    setDiagnostics: noop,
  };
  const node = find(component(admin, "AdminYouTubePlayer"), (n) => ts.isPropertyAssignment(n) && n.name.getText() === "onStateChange");
  const event = evaluate(node.initializer, globals);
  event({ data: 1 });
  assert.deepEqual(calls.find(([type]) => type === "publish"), ["publish", "playing", 28, "state_change"]);
  assert.equal(calls.some(([type]) => type === "pause"), false);
  event({ data: 2 });
  assert.equal(globals.playbackStateRef.current, "paused");
  assert.deepEqual(calls.at(-1), ["publish", "paused", 28, "state_change"]);
});

function youtubeHarness() {
  const calls = [];
  const sync = { provider: "youtube", videoId: "PWYFa2OCWj0", trackId: "C1", playbackState: "playing", currentTimeSeconds: 28, updatedAt: "2026-09-16T07:17:00Z", correctionReason: "state_change" };
  const timers = new Map();
  let timerId = 0;
  let error = null;
  const player = {
    loadVideoById: (options) => calls.push(["load", options.videoId, options.startSeconds]),
    cueVideoById: (options) => calls.push(["cue", options.videoId, options.startSeconds]),
    seekTo: (seconds) => calls.push(["seek", seconds]),
    mute: () => calls.push(["mute"]), playVideo: () => calls.push(["play"]), pauseVideo: () => calls.push(["pause"]),
    getCurrentTime: () => 28, destroy: () => calls.push(["destroy"]),
  };
  const globals = {
    ...resolver, Date, performance: { now: () => 0 },
    window: { setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id) },
    readyRef: ref(false), destroyedRef: ref(false), failedVideoRef: ref(null),
    generationRef: ref(0), latestSyncRef: ref(sync), clockAnchorRef: ref(null),
    loadedVideoRef: ref(null), lastAppliedPlaybackStateRef: ref(null), lastCorrectionAtRef: ref(null),
    correctionCountRef: ref(0), lastCorrectionReasonRef: ref(null), playerRef: ref(null), readyTimerRef: ref(null),
    setSyncDiagnostic: noop, setPlayerError: (next) => { error = typeof next === "function" ? next(error) : next; },
    clearImperativeHost: () => calls.push(["clear"]),
    document: { createElement: () => ({ isConnected: true }) },
    playerHostRef: ref({ appendChild: () => calls.push(["mount"]) }), containerId: "test-player", YOUTUBE_OVERLAY_READY_TIMEOUT_MS: 9000,
    PLAYER_CORRECTION_COOLDOWN_MS: 1500, YOUTUBE_BEHIND_THRESHOLD_SECONDS: 0.2, YOUTUBE_AHEAD_THRESHOLD_SECONDS: 0.7,
    YOUTUBE_PAUSED_DRIFT_THRESHOLD_SECONDS: 0.25, YOUTUBE_MAX_CATCH_UP_SECONDS: 0.2,
  };
  for (const name of ["serverRelativeAgeFromAnchor", "expectedYouTubeTime", "roundedFiniteSeconds", "driftDirectionFromRoundedDrift"])
    globals[name] = evaluate(component(receiver, name), globals);
  const root = component(receiver, "YouTubeOverlayPlayer");
  for (const name of ["clearReadyTimer", "markPlayerUnavailable", "applyYouTubeSync"])
    globals[name] = evaluate(variable(root, name).initializer.arguments[0], globals);
  let resolveApi;
  globals.ensureYouTubeApi = () => new Promise((resolve) => { resolveApi = resolve; });
  let options;
  globals.window.YT = { Player: function (mount, next) { options = next; calls.push(["construct"]); return player; } };
  const lifecycle = find(root, (n) => ts.isCallExpression(n) && n.expression.getText() === "useEffect" && n.arguments[0].getText().includes("new window.YT.Player"));
  const mount = evaluate(lifecycle.arguments[0], globals);
  return { globals, calls, sync, player, timers, mount, apiReady: () => resolveApi(), get options() { return options; }, get error() { return error; } };
}

test("cold YouTube overlay waits for API and provider readiness, then loads the current C1 position", async () => {
  const h = youtubeHarness();
  const cleanup = h.mount();
  assert.equal(h.calls.some(([type]) => type === "construct"), false);
  h.apiReady();
  await Promise.resolve();
  assert.equal(h.options.videoId, "PWYFa2OCWj0");
  assert.equal(h.calls.some(([type]) => type === "play"), false);
  h.options.events.onReady();
  assert.equal(h.error, null);
  assert.equal(h.timers.size, 0, "ready cancels the startup watchdog");
  assert.deepEqual(h.calls.find(([type]) => type === "load"), ["load", "PWYFa2OCWj0", 28]);
  assert.equal(h.calls.some(([type]) => type === "play"), true);
  h.globals.applyYouTubeSync({ ...h.sync, correctionReason: "heartbeat" });
  assert.equal(h.calls.filter(([type]) => type === "load").length, 1, "heartbeat does not reload the video");
  h.globals.applyYouTubeSync({ ...h.sync, playbackState: "paused" });
  assert.equal(h.calls.at(-1)[0], "pause");
  cleanup();
  assert.equal(h.calls.at(-2)[0], "destroy");
});

test("an overlay closed before the API loads cannot construct a late player", async () => {
  const h = youtubeHarness();
  const cleanup = h.mount();
  cleanup();
  h.apiReady();
  await Promise.resolve();
  assert.equal(h.calls.some(([type]) => type === "construct"), false);
  assert.equal(h.timers.size, 0);
});

test("readiness timeout, construction exception, sync exception and provider rejection remain distinguishable", async () => {
  const timed = youtubeHarness();
  timed.mount();
  [...timed.timers.values()][0]();
  assert.equal(timed.error.phase, "ready_timeout");
  const creation = youtubeHarness();
  creation.globals.window.YT.Player = function () { throw new TypeError("bad mount"); };
  creation.mount(); creation.apiReady(); await Promise.resolve();
  assert.equal(creation.error.phase, "player_create");
  const sync = youtubeHarness();
  sync.player.loadVideoById = () => { throw new TypeError("command failed"); };
  sync.mount(); sync.apiReady(); await Promise.resolve(); sync.options.events.onReady();
  assert.equal(sync.error.phase, "sync_command");
  const provider = youtubeHarness();
  provider.mount(); provider.apiReady(); await Promise.resolve(); provider.options.events.onError({ data: 150 });
  assert.equal(provider.error.phase, "provider_error");
  assert.equal(provider.error.code, 150);
});

test("overlay wall clock ticks without scene updates or network requests and clears its timer", () => {
  let tick;
  let displayed = null;
  let cleared = null;
  const globals = { window: { setInterval: (fn, delay) => { tick = fn; assert.equal(delay, 1000); return 7; }, clearInterval: (id) => { cleared = id; } }, setNow: (next) => { displayed = next; }, Date };
  const effect = find(component(receiver, "OverlayClock"), (n) => ts.isCallExpression(n) && n.expression.getText() === "useEffect");
  const cleanup = evaluate(effect.arguments[0], globals)();
  tick();
  assert.ok(Math.abs(displayed.getTime() - Date.now()) < 1000);
  cleanup();
  assert.equal(cleared, 7);
});
