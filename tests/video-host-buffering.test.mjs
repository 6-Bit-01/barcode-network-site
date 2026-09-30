import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { detectMaterialPlaybackSeek } from "../src/lib/live-overlay-resolver.ts";

const source = fs.readFileSync(new URL("../src/components/AdminRadioQueueControl.tsx", import.meta.url), "utf8");
const ref = (current) => ({ current });
const noop = () => {};
function find(root, predicate) {
  let result;
  function visit(node) { if (result) return; if (predicate(node)) result = node; else ts.forEachChild(node, visit); }
  visit(root);
  assert.ok(result, "production callback exists");
  return result;
}
const root = ts.createSourceFile("host.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = (name) => find(root, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
function evaluate(node, globals) {
  return vm.runInNewContext(ts.transpileModule(`(${node.getText()})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, globals);
}
function youtube() {
  let now = 1000, position = 12;
  const calls = [];
  class Clock extends Date { static now() { return now; } }
  const globals = {
    Date: Clock, Number, cancelled: false, generation: 1, generationRef: ref(1),
    playerRef: ref({ getCurrentTime: () => position, mute: () => calls.push(["mute"]), pauseVideo: () => calls.push(["pause"]), seekTo: (seconds) => calls.push(["command_seek", seconds]) }),
    playbackStateRef: ref("playing"), bufferingRef: ref(false), bufferedTimeRef: ref(0), heldSeekTargetRef: ref(null),
    previousObservedTimeRef: ref(null), previousObservedAtRef: ref(null), queuedPublishRef: ref(null),
    coordinatedStartRef: ref({ phase: "playing", blocksPublish: false, onPlaying: () => false, onPaused: () => false, cancel: noop }),
    detectMaterialPlaybackSeek, publish: (...args) => calls.push(["publish", ...args]),
    reportLifecycle: (...args) => calls.push(["lifecycle", ...args]), setDiagnostics: noop,
    setDiagnosticsNow: noop, setBufferNotice: noop, YOUTUBE_SYNC_STALE_AFTER_MS: 10000,
  };
  const player = component("AdminYouTubePlayer");
  const state = evaluate(find(player, (n) => ts.isPropertyAssignment(n) && n.name.getText() === "onStateChange").initializer, globals);
  const heartbeat = evaluate(find(player, (n) => ts.isCallExpression(n) && n.expression.getText() === "window.setInterval").arguments[0], globals);
  const hold = evaluate(find(player, (n) => ts.isPropertyAssignment(n) && n.name.getText() === "hold").initializer, globals);
  return { globals, calls, state: (value) => state({ data: value }), beat: () => { now += 1000; heartbeat(); }, position: (value) => { position = value; }, hold };
}

test("YouTube buffering freezes the shared clock without false seeks or host commands", () => {
  const h = youtube();
  h.beat(); h.calls.length = 0;
  h.state(3); h.state(3);
  for (let i = 0; i < 6; i++) h.beat();
  const packets = h.calls.filter(([type]) => type === "publish");
  assert.ok(packets.length > 0);
  assert.ok(packets.every(([, state, seconds, reason]) => state === "paused" && seconds === 12 && reason !== "seek"));
  assert.equal(h.calls.filter(([type, event]) => type === "lifecycle" && event === "stall").length, 1);
  assert.equal(h.calls.some(([type, event]) => type === "lifecycle" && event === "seek"), false);
  assert.equal(h.calls.some(([type]) => type === "pause" || type === "command_seek"), false);
});

test("YouTube provider recovery resumes actual time without a new preparation or false seek", () => {
  const h = youtube();
  h.beat(); h.state(3);
  for (let i = 0; i < 5; i++) h.beat();
  h.calls.length = 0;
  h.position(12.1); h.state(1); h.position(13.1); h.beat();
  assert.ok(h.calls.some(([type, state, seconds]) => type === "publish" && state === "playing" && seconds === 12.1));
  assert.equal(h.calls.filter(([type, event]) => type === "lifecycle" && event === "resume").length, 1);
  assert.equal(h.calls.some(([type, event]) => type === "lifecycle" && event === "seek"), false);
  assert.equal(h.globals.coordinatedStartRef.current.phase, "playing");
});

test("YouTube initial provider loading is not an in-play stall", () => {
  const h = youtube();
  h.globals.playbackStateRef.current = "stopped";
  h.globals.coordinatedStartRef.current.phase = "idle";
  h.state(3); h.beat();
  assert.equal(h.calls.some(([type, event]) => type === "lifecycle" && event === "stall"), false);
  assert.equal(h.calls.some(([type, state]) => type === "publish" && state === "playing"), false);
});

test("host preparation pauses repeated playback without re-seeking an unchanged target", () => {
  const h = youtube();
  h.hold(12); h.hold(12);
  assert.equal(h.calls.filter(([type]) => type === "pause").length, 2);
  assert.equal(h.calls.filter(([type]) => type === "command_seek").length, 0);
  h.position(12.8); h.hold(12); h.hold(12);
  assert.equal(h.calls.filter(([type]) => type === "command_seek").length, 1);
});

function tiktok() {
  let now = 1000;
  const calls = [], frame = {};
  class Clock extends Date { static now() { return now; } }
  const globals = {
    Date: Clock, Number, iframeRef: ref({ contentWindow: frame }), command: (...args) => calls.push(["command", ...args]),
    isPlainTikTokObject: (value) => !!value && typeof value === "object", clearReadyTimer: noop,
    latestTimeRef: ref(12), latestTimeObservedAtRef: ref(now), durationRef: ref(120), lastTimeEventAtRef: ref(now),
    hasObservedCurrentTimeRef: ref(true), pendingPlaybackStateRef: ref(null), pendingCorrectionReasonRef: ref("state_change"),
    lastStablePlaybackStateRef: ref("playing"), bufferingRef: ref(false), bufferedTimeRef: ref(0),
    awaitingBufferRecoveryRef: ref(false), heldSeekTargetRef: ref(null), queuedPublishRef: ref(null), readyRef: ref(true),
    statusRef: ref("ready"), lastPublishedAtRef: ref(null), parsedPostId: "fixture", entry: { id: "fixture" },
    publishTaskRef: ref(Promise.resolve()), generationRef: ref(1), generation: 1, tiktokGenerationActiveRef: ref(true),
    setDiagnostics: noop, tiktokErrorLabel: () => "Playback error", clearOverlayPlayerSync: () => { calls.push(["clear"]); return Promise.resolve(); },
    coordinatedStartRef: ref({ phase: "playing", blocksPublish: false, onPlaying: () => false, onPaused: () => false, cancel: noop }),
    publish: (...args) => calls.push(["publish", ...args]), reportLifecycle: (...args) => calls.push(["lifecycle", ...args]),
    publishObservedState: (state, reason) => { globals.lastStablePlaybackStateRef.current = state; globals.publish(state, globals.latestTimeRef.current, reason); },
    detectMaterialPlaybackSeek, setBufferNotice: noop, setStatus: noop, setNotice: noop, setErrorLabel: noop,
  };
  const player = component("AdminTikTokPlayer");
  const event = evaluate(find(player, (n) => ts.isFunctionDeclaration(n) && n.name?.text === "onMessage"), globals);
  const heartbeat = evaluate(find(player, (n) => ts.isCallExpression(n) && n.expression.getText() === "window.setInterval").arguments[0], globals);
  const hold = evaluate(find(player, (n) => ts.isPropertyAssignment(n) && n.name.getText() === "hold").initializer, globals);
  return { globals, calls, event: (type, value) => event({ origin: "https://www.tiktok.com", source: frame, data: { "x-tiktok-player": true, type, value } }), beat: () => { now += 1000; heartbeat(); }, hold };
}

test("TikTok buffering holds observed time until recovery has a fresh provider time", () => {
  const h = tiktok();
  h.event("onStateChange", 3); h.event("onStateChange", 3);
  for (let i = 0; i < 5; i++) h.beat();
  h.event("onStateChange", 1); h.beat();
  assert.ok(h.calls.filter(([type]) => type === "publish").every(([, state, seconds]) => state === "paused" && seconds === 12));
  assert.equal(h.calls.filter(([type, event]) => type === "lifecycle" && event === "stall").length, 1);
  h.calls.length = 0;
  h.event("onCurrentTime", { currentTime: 12.1, duration: 120 });
  assert.ok(h.calls.some(([type, state, seconds]) => type === "publish" && state === "playing" && seconds === 12.1));
  assert.equal(h.calls.filter(([type, event]) => type === "lifecycle" && event === "resume").length, 1);
  assert.equal(h.calls.some(([type, event]) => type === "lifecycle" && event === "seek"), false);
  assert.equal(h.globals.lastStablePlaybackStateRef.current, "playing");
});

test("TikTok preparation does not repeat the same seek even before time is known", () => {
  const h = tiktok();
  h.globals.hasObservedCurrentTimeRef.current = false;
  h.hold(12); h.hold(12); h.hold(12);
  assert.equal(h.calls.filter(([type, command]) => type === "command" && command === "pause").length, 3);
  assert.equal(h.calls.filter(([type, command]) => type === "command" && command === "seekTo").length, 1);
});

test("TikTok reset during recovery stays stopped when delayed time arrives", () => {
  const h = tiktok();
  h.event("onStateChange", 3); h.event("onStateChange", 1);
  h.event("onStateChange", -1); h.calls.length = 0;
  h.event("onCurrentTime", { currentTime: 0, duration: 120 }); h.beat();
  assert.equal(h.calls.some(([type]) => type === "publish"), false);
  assert.equal(h.globals.lastStablePlaybackStateRef.current, "stopped");
  assert.equal(h.globals.awaitingBufferRecoveryRef.current, false);
  assert.equal(h.globals.bufferingRef.current, false);
});

test("TikTok fatal error clears sync after pending writes and rejects delayed provider events", async () => {
  const h = tiktok();
  let finishWrite;
  h.globals.publishTaskRef.current = new Promise((resolve) => { finishWrite = resolve; });
  h.event("onStateChange", 3); h.event("onStateChange", 1);
  h.event("onPlayerError", { errorCode: 3001, errorType: "PLAYBACK_ERROR" });
  assert.equal(h.calls.some(([type]) => type === "clear"), false, "clear waits for the already running write");
  h.calls.length = 0;
  h.event("onCurrentTime", { currentTime: 12.1, duration: 120 });
  h.event("onStateChange", 1); h.beat();
  assert.equal(h.calls.some(([type]) => type === "publish"), false);
  assert.equal(h.globals.readyRef.current, false);
  finishWrite();
  await h.globals.publishTaskRef.current;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.filter(([type]) => type === "clear").length, 1);
});

test("an unmounted TikTok error cannot clear its successor after an old write resolves", async () => {
  const h = tiktok();
  let finishWrite;
  h.globals.publishTaskRef.current = new Promise((resolve) => { finishWrite = resolve; });
  h.event("onPlayerError", { errorCode: 3001, errorType: "PLAYBACK_ERROR" });
  h.globals.tiktokGenerationActiveRef.current = false;
  finishWrite();
  await h.globals.publishTaskRef.current;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.some(([type]) => type === "clear"), false);
});
