import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { VideoStartGate, VideoReceiverStartGate, scheduledVideoStartDelayMs } from "../src/lib/video-start-gate.ts";
import * as resolver from "../src/lib/live-overlay-resolver.ts";

const admin = fs.readFileSync(new URL("../src/components/AdminRadioQueueControl.tsx", import.meta.url), "utf8");
const receiver = fs.readFileSync(new URL("../src/components/LiveOverlayReceiver.tsx", import.meta.url), "utf8");
const ref = (current) => ({ current });
const noop = () => {};
function findNode(source, predicate) {
  const root = typeof source === "string" ? ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) : source;
  let found;
  function visit(node) { if (found) return; if (predicate(node)) found = node; else ts.forEachChild(node, visit); }
  visit(root);
  assert.ok(found, "production callback must exist");
  return found;
}
const component = (source, name) => findNode(source, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
const variable = (root, name) => findNode(root, (n) => ts.isVariableDeclaration(n) && n.name.getText() === name);
function evaluate(text, globals) {
  const js = ts.transpileModule(`(${text})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(js, globals);
}
function timers() {
  let serial = 0;
  const pending = new Map();
  return {
    pending,
    set: (callback, delay) => { const id = ++serial; pending.set(id, { callback, delay }); return id; },
    clear: (id) => pending.delete(id),
    fire: () => { const work = [...pending.values()]; pending.clear(); for (const { callback } of work) callback(); },
  };
}

function windowTimers(context) {
  const clock = timers();
  // Window timer methods reject an arbitrary object as `this`. Node timers and
  // arrow-function fakes do not, so they missed the production gate regression.
  // https://webidl.spec.whatwg.org/#es-operations
  const checkReceiver = (value) => {
    if (value != null && value !== globalThis) throw new TypeError("Illegal invocation");
  };
  context.mock.method(globalThis, "setTimeout", function (...args) {
    checkReceiver(this);
    return clock.set(...args);
  });
  context.mock.method(globalThis, "clearTimeout", function (id) {
    checkReceiver(this);
    clock.clear(id);
  });
  return clock;
}

test("default host and receiver timers support Window receiver checks for start and cancellation", (context) => {
  const clock = windowTimers(context);
  const host = new VideoStartGate();
  const overlay = new VideoReceiverStartGate();
  const played = [];
  const start = (token) => {
    host.arm(host.begin(), 3000, () => played.push("host"));
    overlay.apply(token, 3000, true, noop, () => played.push("overlay"));
  };
  start("cancelled");
  const cancelledCallbacks = [...clock.pending.values()];
  host.cancel();
  overlay.cancel();
  assert.equal(clock.pending.size, 0, "both browser timers were cleared");
  for (const { callback } of cancelledCallbacks) callback();
  assert.deepEqual(played, [], "cancelled starts cannot play");
  start("current");
  assert.deepEqual(played, [], "both players wait for their deadline");
  assert.equal(clock.pending.size, 2);
  clock.fire();
  assert.deepEqual(played, ["host", "overlay"]);
  assert.equal(host.consumeRelease(), true);
  assert.equal(host.holding, false);
  assert.equal(overlay.apply("current", 0, true, noop, noop), false);
});

function hostPublisher(provider, gate) {
  const calls = [];
  const trackSyncInput = { id: "track-1", sourceType: provider, videoId: "abcdefghijk", postId: "6718335390845095173" };
  const ack = {
    sync: { ...trackSyncInput, startToken: "start-one", scheduledStartAt: "2026-09-13T12:00:03Z" },
    serverResponseGeneratedAtMs: Date.parse("2026-09-13T12:00:00Z"), responseReceivedAtPerformanceMs: 0, outboundTransitMs: 0,
  };
  let notice = "Preparing overlay";
  let diagnostics = {};
  const globals = {
    ...resolver, scheduledVideoStartDelayMs, performance: { now: () => 0 },
    startGateRef: ref(gate), videoId: trackSyncInput.videoId, trackId: trackSyncInput.id, trackSyncInput,
    playerRef: ref({ playVideo: () => calls.push("play") }), sendHostCommand: (command) => calls.push(command),
    readyRef: ref(true), hasObservedCurrentTimeRef: ref(true), durationRef: ref(194),
    youtubeGenerationActiveRef: ref(true), tiktokGenerationActiveRef: ref(true),
    outboundTransitEstimateMsRef: ref(null), lastPublishedAtRef: ref(null),
    publishOverlayYouTubeSync: async () => ack, publishOverlayTikTokSync: async () => ack,
    VIDEO_SYNCHRONIZED_START_DELAY_MS: 3000,
    setStartNotice: (value) => { notice = value; }, setOutboundTransitDiagnosticMs: noop,
    setDiagnostics: (value) => { diagnostics = typeof value === "function" ? value(diagnostics) : value; },
  };
  globals.armVideoStartAfterAck = evaluate(component(admin, "armVideoStartAfterAck").getText(), globals);
  const root = component(admin, provider === "youtube" ? "AdminYouTubePlayer" : "AdminTikTokPlayer");
  const publish = evaluate(variable(root, "publishNow").initializer.arguments[0].getText(), globals);
  return {
    calls, get notice() { return notice; }, get diagnostics() { return diagnostics; },
    start: (id) => provider === "youtube" ? publish("playing", 3, "state_change", id) : publish("playing", 3, Date.now(), "state_change", id),
  };
}

for (const provider of ["youtube", "tiktok"]) {
  test(`${provider} host exits preparation after timer registration fails and can retry`, async () => {
    const clock = timers();
    let fail = true;
    const gate = new VideoStartGate((...args) => {
      if (fail) throw new TypeError("Timer registration failed");
      return clock.set(...args);
    }, clock.clear);
    const host = hostPublisher(provider, gate);
    await host.start(gate.begin());
    assert.equal(gate.holding, false, "failed registration must not suppress heartbeats indefinitely");
    assert.match(host.notice, /Could not schedule both players.*retry/);
    assert.equal(host.diagnostics.publishStatus, "failed");
    assert.deepEqual(host.calls, [], "failure leaves playback paused");
    fail = false;
    await host.start(gate.begin());
    clock.fire();
    assert.deepEqual(host.calls, ["play"]);
    assert.equal(host.notice, null);
    assert.equal(gate.consumeRelease(), true);
  });
}

test("both providers receive bounded server deadlines and stored normalization preserves them", () => {
  const at = new Date("2026-09-13T12:00:00.000Z");
  for (const raw of [{ provider: "youtube", videoId: "abcdefghijk" }, { provider: "tiktok", postId: "6718335390845095173" }]) {
    const input = { ...raw, trackId: "track-1", playbackState: "playing", currentTimeSeconds: 17, updatedAt: "2000-01-01T00:00:00.000Z" };
    const sync = resolver.serverStampLiveOverlayPlayerSync(input, at, 3000);
    assert.equal(sync.scheduledStartAt, "2026-09-13T12:00:03.000Z");
    assert.equal(sync.currentTimeSeconds, 17, "preparation does not advance the held host position");
    assert.deepEqual(resolver.serverStampLiveOverlayPlayerSync(sync, at), sync);
    assert.equal(resolver.serverStampLiveOverlayPlayerSync(input, at, 90000).scheduledStartAt, "2026-09-13T12:00:06.000Z");
    assert.equal(resolver.serverStampLiveOverlayPlayerSync(input, at, 1).scheduledStartAt, "2026-09-13T12:00:01.500Z");
    assert.equal(resolver.serverStampLiveOverlayPlayerSync(input, at).startToken, undefined, "legacy heartbeat wire format stays valid");
    assert.equal(resolver.serverStampLiveOverlayPlayerSync({ ...sync, playbackState: "paused" }, at, 3000).startToken, undefined);
    assert.equal(resolver.serverStampLiveOverlayPlayerSync(sync, new Date(at.getTime() + 1)).startToken, undefined, "a later heartbeat cannot renew a stale deadline");
  }
});

test("host gate rejects late acknowledgements and cancellation invalidates even an already queued timer callback", () => {
  const clock = timers();
  const gate = new VideoStartGate(clock.set, clock.clear);
  const played = [];
  const first = gate.begin();
  gate.cancel();
  assert.equal(gate.arm(first, 3000, () => played.push("stale")), false);
  const second = gate.begin();
  assert.equal(gate.arm(second, 2500, () => played.push("cancelled")), true);
  const racingCallback = [...clock.pending.values()][0].callback;
  gate.cancel();
  racingCallback();
  assert.deepEqual(played, []);
  const third = gate.begin();
  gate.arm(third, 0, () => played.push("current"));
  clock.fire();
  assert.deepEqual(played, ["current"]);
  assert.equal(gate.consumeRelease(), true);
  assert.equal(gate.consumeRelease(), false, "provider resume is consumed once");
});

test("repeated receiver polls prepare once, share the deadline, and cannot revive a cancelled start", () => {
  const clock = timers();
  const gate = new VideoReceiverStartGate(clock.set, clock.clear);
  const commands = [];
  const prepare = () => commands.push("prepare");
  const play = () => commands.push("play");
  assert.equal(gate.apply("one", 2500, true, prepare, play), true);
  assert.equal(gate.apply("one", 2000, true, prepare, play), true);
  assert.deepEqual(commands, ["prepare"]);
  const racingCallback = [...clock.pending.values()][0].callback;
  gate.apply(undefined, null, false, prepare, play);
  racingCallback();
  assert.deepEqual(commands, ["prepare"]);
  gate.apply("two", 1000, true, prepare, play);
  clock.fire();
  assert.equal(gate.apply("two", 0, true, prepare, play), false);
  assert.deepEqual(commands, ["prepare", "prepare", "play"]);
  assert.equal(gate.apply("late", 0, true, prepare, play), false, "late receiver uses normal catch-up without a second hold");
});

test("host acknowledgement uses server time plus monotonic transit, and ignores the browser wall clock", () => {
  const clock = timers();
  const gate = new VideoStartGate(clock.set, clock.clear);
  const arm = evaluate(component(admin, "armVideoStartAfterAck").getText(), { performance: { now: () => 500 }, scheduledVideoStartDelayMs });
  const id = gate.begin();
  arm(gate, id, { sync: { startToken: "token", scheduledStartAt: "2026-09-13T12:00:03Z" }, serverResponseGeneratedAtMs: Date.parse("2026-09-13T12:00:00Z"), responseReceivedAtPerformanceMs: 400, outboundTransitMs: 50 }, noop);
  assert.equal([...clock.pending.values()][0].delay, 2850);
});

function youtubeHost() {
  const calls = [];
  const gate = new VideoStartGate();
  const globals = {
    cancelled: false, generation: 1, generationRef: ref(1),
    playbackStateRef: ref("stopped"), bufferingRef: ref(false), startGateRef: ref(gate),
    playerRef: ref({ getCurrentTime: () => 10, pauseVideo: () => calls.push(["host_pause"]) }),
    reportLifecycle: (...args) => calls.push(["lifecycle", ...args]),
    publish: (...args) => calls.push(["publish", ...args]), setStartNotice: noop, setDiagnostics: noop,
  };
  const node = findNode(component(admin, "AdminYouTubePlayer"), (n) => ts.isPropertyAssignment(n) && n.name.getText() === "onStateChange");
  return { globals, calls, gate, event: evaluate(node.initializer.getText(), globals) };
}

test("real YouTube host callback holds initial play and freezes the shared clock while buffering", () => {
  const h = youtubeHost();
  h.event({ data: 3 }); // Initial loading is not a resume from actual playback.
  h.event({ data: 1 });
  assert.equal(h.gate.preparing, true);
  assert.deepEqual(h.calls.filter(([type]) => type === "publish").map((row) => row.slice(1, 4)), [["playing", 10, "state_change"]]);
  h.event({ data: 2 }); // Echo from the internal hold.
  assert.equal(h.gate.preparing, true);
  h.event({ data: 0 });
  assert.equal(h.gate.holding, false, "ending cancels the delayed start");
  h.calls.length = 0;
  h.globals.playbackStateRef.current = "playing";
  h.event({ data: 3 });
  assert.equal(h.globals.playbackStateRef.current, "paused");
  assert.deepEqual(h.calls, [["publish", "paused", 10, "state_change"], ["lifecycle", "stall", 10]]);
  h.event({ data: 1 });
  assert.equal(h.gate.holding, false, "buffer recovery does not trigger another three-second preparation");
  assert.equal(h.globals.playbackStateRef.current, "playing");
  const clock = timers();
  const released = new VideoStartGate(clock.set, clock.clear);
  h.globals.startGateRef.current = released;
  h.globals.playbackStateRef.current = "paused";
  released.arm(released.begin(), 0, noop);
  clock.fire();
  h.calls.length = 0;
  h.event({ data: 3 });
  assert.equal(h.calls[0][1], "paused", "buffering immediately after the scheduled release also freezes the overlay");
  h.event({ data: 1 });
  assert.equal(released.holding, false);
});

test("a new pause supersedes a queued seek and a heartbeat cannot replace that pause", () => {
  const replace = evaluate(component(admin, "shouldReplaceQueuedPublish").getText(), { PUBLISH_PRIORITY: { heartbeat: 1, state_change: 2, seek: 3 } });
  assert.equal(replace({ correctionReason: "seek", playbackState: "playing" }, { correctionReason: "state_change", playbackState: "paused" }), true);
  assert.equal(replace({ correctionReason: "state_change", playbackState: "paused" }, { correctionReason: "heartbeat", playbackState: "playing" }), false);
});

test("real TikTok events wait for observed time, freeze buffering, and anchor resume at the new play event", () => {
  const root = component(admin, "AdminTikTokPlayer");
  const calls = [];
  const playerWindow = {};
  const globals = {
    Date: { now: () => 9000 }, iframeRef: ref({ contentWindow: playerWindow }),
    isPlainTikTokObject: (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value),
    lastStablePlaybackStateRef: ref("stopped"), readyRef: ref(true), hasObservedCurrentTimeRef: ref(false),
    bufferingRef: ref(false), startGateRef: ref(new VideoStartGate()), latestTimeRef: ref(0),
    latestTimeObservedAtRef: ref(null), lastTimeEventAtRef: ref(null), durationRef: ref(undefined),
    pendingPlaybackStateRef: ref(null), pendingCorrectionReasonRef: ref("state_change"),
    publish: (...args) => calls.push(["publish", ...args]), reportLifecycle: (...args) => calls.push(["lifecycle", ...args]),
    sendHostCommand: (type) => calls.push([type]), setStartNotice: noop, detectMaterialPlaybackSeek: resolver.detectMaterialPlaybackSeek,
  };
  globals.publishObservedState = evaluate(variable(root, "publishObservedState").initializer.getText(), globals);
  globals.handlePlaying = evaluate(variable(root, "handlePlaying").initializer.getText(), globals);
  const onMessage = evaluate(findNode(root, (n) => ts.isFunctionDeclaration(n) && n.name?.text === "onMessage").getText(), globals);
  const event = (type, value) => onMessage({ origin: "https://www.tiktok.com", source: playerWindow, data: { type, value, "x-tiktok-player": true } });
  event("onStateChange", 1);
  assert.equal(globals.startGateRef.current.holding, false, "no synthetic zero-position start before a provider time event");
  assert.equal(globals.pendingPlaybackStateRef.current, "playing");
  event("onCurrentTime", { currentTime: 0, duration: 180 });
  assert.equal(globals.startGateRef.current.preparing, true);
  assert.equal(calls.filter(([type]) => type === "publish").length, 1);
  event("onStateChange", 2);
  assert.equal(globals.startGateRef.current.preparing, true, "internal pause echo leaves preparation intact");
  event("onStateChange", 0);
  assert.equal(globals.startGateRef.current.holding, false);
  globals.lastStablePlaybackStateRef.current = "playing";
  globals.latestTimeRef.current = 42;
  event("onStateChange", 3);
  assert.equal(globals.lastStablePlaybackStateRef.current, "paused");
  assert.ok(calls.some((row) => row[0] === "publish" && row[1] === "paused" && row[2] === 42));
  globals.latestTimeObservedAtRef.current = 3000;
  event("onStateChange", 1);
  assert.equal(globals.latestTimeObservedAtRef.current, 9000, "six paused seconds cannot be projected into the media time on resume");
  assert.equal(globals.startGateRef.current.holding, false);
  onMessage({ origin: "https://www.tiktok.com", source: {}, data: { type: "onStateChange", value: 0, "x-tiktok-player": true } });
  assert.equal(globals.lastStablePlaybackStateRef.current, "playing", "another frame cannot issue host state events");
  const clock = timers();
  const released = new VideoStartGate(clock.set, clock.clear);
  globals.startGateRef.current = released;
  globals.lastStablePlaybackStateRef.current = "paused";
  released.arm(released.begin(), 0, noop);
  clock.fire();
  calls.length = 0;
  event("onStateChange", 3);
  assert.equal(calls[0][1], "paused", "a delayed play that is still buffering must not advance the overlay clock");
  event("onStateChange", 1);
  assert.equal(released.holding, false);
});

test("production receiver projections hold until the common start and then follow original media time", () => {
  let elapsed = 500;
  const globals = { serverRelativeSyncAgeSeconds: resolver.serverRelativeSyncAgeSeconds, performance: { now: () => elapsed } };
  globals.serverRelativeAgeFromAnchor = evaluate(component(receiver, "serverRelativeAgeFromAnchor").getText(), globals);
  const anchor = { serverNowMs: Date.parse("2026-09-13T12:00:00Z"), responseTransitEstimateMs: 50, receivedAtPerformanceMs: 0 };
  const sync = { playbackState: "playing", currentTimeSeconds: 10, updatedAt: "2026-09-13T12:00:00Z", scheduledStartAt: "2026-09-13T12:00:03Z" };
  for (const name of ["expectedYouTubeTime", "expectedTikTokTime"]) {
    const expected = evaluate(component(receiver, name).getText(), globals);
    elapsed = 500;
    assert.equal(expected(sync, anchor), 10);
    elapsed = 4000;
    assert.equal(expected(sync, anchor), 11.05);
    assert.equal(expected({ ...sync, playbackState: "paused" }, anchor), 10);
  }
});

function receiverHarness(provider) {
  const clock = timers();
  const calls = [];
  const sync = { provider, videoId: "abcdefghijk", postId: "6718335390845095173", trackId: "track-1", playbackState: "playing", currentTimeSeconds: 10, updatedAt: "2026-09-13T12:00:00Z", correctionReason: "seek" };
  const globals = {
    ...resolver, scheduledVideoStartDelayMs,
    window: { setTimeout: clock.set }, Date: { now: () => 10000 },
    readyRef: ref(true), destroyedRef: ref(false), failedVideoRef: ref(null), failedPostRef: ref(null),
    generationRef: ref(1), latestSyncRef: ref(sync), clockAnchorRef: ref(null),
    bufferingRef: ref(false), lastSeekPacketRef: ref(null),
    startGateRef: ref(new VideoReceiverStartGate(clock.set, clock.clear)),
    loadedVideoRef: ref(sync.videoId), localTimeRef: ref(0),
    lastAppliedPlaybackStateRef: ref("playing"), lastCorrectionAtRef: ref(null),
    correctionCountRef: ref(0), lastCorrectionReasonRef: ref(null),
    playerRef: ref({ getCurrentTime: () => 0, seekTo: (time) => calls.push(["seek", time]), mute: noop, pauseVideo: () => calls.push(["pause"]), playVideo: () => calls.push(["play"]) }),
    sendTikTokVoidCommand: (type) => { if (type !== "mute") calls.push([type]); }, sendTikTokSeekCommand: (time) => calls.push(["seek", time]),
    expectedYouTubeTime: (s) => s.currentTimeSeconds, expectedTikTokTime: (s) => s.currentTimeSeconds,
    serverNowFromAnchor: () => Date.parse("2026-09-13T12:00:00Z"),
    roundedFiniteSeconds: (x) => x ?? undefined, driftDirectionFromRoundedDrift: noop,
    setSyncDiagnostic: noop, updateDiagnostics: noop, markPlayerUnavailable: (message) => { throw new Error(message); },
    PLAYER_CORRECTION_COOLDOWN_MS: 1500, YOUTUBE_BEHIND_THRESHOLD_SECONDS: 0.2, YOUTUBE_AHEAD_THRESHOLD_SECONDS: 0.7,
    YOUTUBE_PAUSED_DRIFT_THRESHOLD_SECONDS: 0.25, YOUTUBE_MAX_CATCH_UP_SECONDS: 0.2,
    TIKTOK_BEHIND_THRESHOLD_SECONDS: 0.3, TIKTOK_AHEAD_THRESHOLD_SECONDS: 0.85,
    TIKTOK_PAUSED_DRIFT_THRESHOLD_SECONDS: 0.35, TIKTOK_MAX_CATCH_UP_SECONDS: 0.3, TIKTOK_DELAYED_PLAY_MS: 250,
  };
  const name = provider === "youtube" ? "YouTube" : "TikTok";
  const node = variable(component(receiver, `${name}OverlayPlayer`), `apply${name}Sync`);
  const apply = evaluate(node.initializer.arguments[0].getText(), globals);
  return { globals, clock, calls, sync, apply };
}

for (const provider of ["youtube", "tiktok"]) {
  test(`${provider} production receiver prepares and starts with Window timer receiver checks`, (context) => {
    const clock = windowTimers(context);
    const h = receiverHarness(provider);
    h.globals.startGateRef.current = new VideoReceiverStartGate();
    const planned = { ...h.sync, scheduledStartAt: "2026-09-13T12:00:03Z", startToken: "start-window-timer" };
    h.globals.latestSyncRef.current = planned;
    h.apply(planned);
    h.apply(planned);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
    assert.equal(h.calls.some(([type]) => type === "play"), false);
    assert.equal(clock.pending.size, 1);
    clock.fire();
    assert.equal(h.calls.filter(([type]) => type === "play").length, 1);
  });

  test(`${provider} production receiver does not repeatedly seek the same packet or a buffering heartbeat`, () => {
    const h = receiverHarness(provider);
    h.apply(h.sync);
    h.globals.localTimeRef.current = 0; // Decoder has not reached the requested position yet.
    h.apply(h.sync);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
    h.globals.bufferingRef.current = true;
    h.globals.Date.now = () => 13000;
    h.apply({ ...h.sync, correctionReason: "heartbeat", updatedAt: "2026-09-13T12:00:03Z" });
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1, "buffering cannot start a seek loop");
  });

  test(`${provider} production receiver prepares once and a pause cancels its delayed play`, () => {
    const h = receiverHarness(provider);
    const planned = { ...h.sync, scheduledStartAt: "2026-09-13T12:00:03Z", startToken: "video-start-one" };
    h.globals.latestSyncRef.current = planned;
    h.apply(planned);
    h.apply(planned);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
    assert.equal(h.calls.some(([type]) => type === "play"), false);
    const paused = { ...planned, playbackState: "paused", startToken: undefined, scheduledStartAt: undefined };
    h.globals.latestSyncRef.current = paused;
    h.apply(paused);
    h.clock.fire();
    assert.equal(h.calls.some(([type]) => type === "play"), false);
  });
}

test("a delayed TikTok correction cannot restart a player after the host pauses", () => {
  const h = receiverHarness("tiktok");
  h.apply(h.sync);
  const paused = { ...h.sync, playbackState: "paused" };
  h.globals.latestSyncRef.current = paused;
  h.apply(paused);
  h.clock.fire();
  assert.equal(h.calls.some(([type]) => type === "play"), false);
});
