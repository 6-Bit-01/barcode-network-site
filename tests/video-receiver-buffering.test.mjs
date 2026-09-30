import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { VideoReceiverPreparation, VideoStartDeadline } from "../src/lib/coordinated-video-start.ts";
import * as resolver from "../src/lib/live-overlay-resolver.ts";

// Run the real receiver callbacks. Provider time deliberately does not jump when
// a seek is commanded: a stalled decoder may continue reporting its old position.
const source = fs.readFileSync(new URL("../src/components/LiveOverlayReceiver.tsx", import.meta.url), "utf8");
const ref = (current) => ({ current });
const noop = () => {};
function find(root, predicate) {
  let result;
  function visit(node) {
    if (result) return;
    if (predicate(node)) result = node;
    else ts.forEachChild(node, visit);
  }
  visit(root);
  assert.ok(result, "production callback exists");
  return result;
}
const ast = ts.createSourceFile("receiver.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const namedFunction = (root, name) => find(root, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
const variable = (root, name) => find(root, (n) => ts.isVariableDeclaration(n) && n.name.getText() === name);
function evaluate(node, globals) {
  const js = ts.transpileModule(`(${node.getText()})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(js, globals);
}

function harness(provider) {
  const root = namedFunction(ast, provider === "youtube" ? "YouTubeOverlayPlayer" : "TikTokOverlayPlayer");
  let now = 1_000_000, position = 20, timerId = 0;
  const calls = [], timers = new Map(), frame = {}, hooks = {};
  const sync = { provider, videoId: "cA-Zu3O08cQ", postId: "6718335390845095173", trackId: "video-1", playbackState: "playing", currentTimeSeconds: 20, updatedAt: new Date(now).toISOString(), muted: true };
  class Clock extends Date { static now() { return now; } }
  const globals = {
    ...resolver, Date: Clock, Number, VideoReceiverPreparation, VideoStartDeadline, sync,
    performance: { now: () => now },
    window: { setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id) },
    clockAnchorRef: ref(null), cancelled: false, generation: 1,
    acknowledgePreparedVideo: async (token) => { calls.push(["ack", token]); return true; },
    updateDiagnostics: noop, setSyncDiagnostic: noop, markTrustedPlayerEvent: noop,
    markPlayerUnavailable: (...args) => assert.fail(`unexpected player failure: ${args.join(" ")}`),
    isPlainTikTokMessage: (value) => !!value && typeof value === "object",
    TIKTOK_ORIGIN: "https://www.tiktok.com", PLAYER_CORRECTION_COOLDOWN_MS: 1500,
    YOUTUBE_BEHIND_THRESHOLD_SECONDS: .2, YOUTUBE_AHEAD_THRESHOLD_SECONDS: .7,
    YOUTUBE_PAUSED_DRIFT_THRESHOLD_SECONDS: .25, YOUTUBE_MAX_CATCH_UP_SECONDS: .2,
    TIKTOK_BEHIND_THRESHOLD_SECONDS: .3, TIKTOK_AHEAD_THRESHOLD_SECONDS: .85,
    TIKTOK_PAUSED_DRIFT_THRESHOLD_SECONDS: .35, TIKTOK_MAX_CATCH_UP_SECONDS: .3, TIKTOK_DELAYED_PLAY_MS: 100,
  };
  for (const statement of root.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const node of statement.declarationList.declarations) {
      if (ts.isIdentifier(node.name) && ts.isCallExpression(node.initializer) && node.initializer.expression.getText() === "useRef")
        globals[node.name.text] = ref(evaluate(node.initializer.arguments[0], globals));
    }
  }
  globals.generationRef.current = 1;
  globals.readyRef.current = true;
  globals.lastAppliedPlaybackStateRef.current = "playing";
  const player = {
    getCurrentTime: () => position,
    seekTo: (seconds) => { calls.push(["seek", seconds]); hooks.seek?.(); },
    loadVideoById: ({ startSeconds }) => calls.push(["load", startSeconds]),
    cueVideoById: ({ startSeconds }) => calls.push(["cue", startSeconds]),
    pauseVideo: () => { calls.push(["pause"]); hooks.pause?.(); }, playVideo: () => calls.push(["play"]), mute: () => calls.push(["mute"]),
  };
  if (provider === "youtube") {
    globals.playerRef.current = player;
    globals.loadedVideoRef.current = sync.videoId;
  } else {
    globals.iframeRef.current = { contentWindow: frame };
    globals.localTimeRef.current = position;
    globals.sendTikTokVoidCommand = (type) => { calls.push([type]); if (type === "pause") hooks.pause?.(); };
    globals.sendTikTokSeekCommand = (seconds) => { calls.push(["seek", seconds]); hooks.seek?.(); };
    globals.clearIframeLoadTimer = noop;
    globals.clearPlayerEventTimer = noop;
    globals.setPlayerError = (error) => calls.push(["error", error.reason]);
    globals.markPlayerUnavailable = evaluate(variable(root, "markPlayerUnavailable").initializer.arguments[0], globals);
    globals.markTrustedPlayerEvent = evaluate(variable(root, "markTrustedPlayerEvent").initializer.arguments[0], globals);
  }
  for (const name of ["overlayServerNow", "serverRelativeAgeFromAnchor", "expectedYouTubeTime", "expectedTikTokTime", "roundedFiniteSeconds", "driftDirectionFromRoundedDrift"])
    globals[name] = evaluate(namedFunction(ast, name), globals);
  const applyName = provider === "youtube" ? "applyYouTubeSync" : "applyTikTokSync";
  const apply = globals[applyName] = evaluate(variable(root, applyName).initializer.arguments[0], globals);
  globals.applySyncRef.current = apply;
  const event = provider === "youtube"
    ? evaluate(find(root, (n) => ts.isPropertyAssignment(n) && n.name.getText() === "onStateChange").initializer, globals)
    : evaluate(namedFunction(root, "onMessage"), globals);
  const flushTimers = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return {
    calls, globals, sync, flushTimers, hooks,
    tick(ms) { now += ms; },
    observe(seconds) { position = seconds; if (provider === "tiktok") globals.localTimeRef.current = seconds; },
    state(value) {
      if (provider === "youtube") event({ data: value });
      else event({ origin: "https://www.tiktok.com", source: frame, data: { "x-tiktok-player": true, type: "onStateChange", value } });
    },
    currentTime(seconds) {
      assert.equal(provider, "tiktok");
      event({ origin: "https://www.tiktok.com", source: frame, data: { "x-tiktok-player": true, type: "onCurrentTime", value: { currentTime: seconds } } });
    },
    apply(patch = {}) { globals.latestSyncRef.current = { ...globals.latestSyncRef.current, ...patch }; apply(globals.latestSyncRef.current); },
  };
}

for (const provider of ["youtube", "tiktok"]) {
  test(`${provider}: receiver buffering suppresses repeated drift correction and recovers against newest host time`, () => {
    const h = harness(provider);
    h.state(3);
    h.calls.length = 0;
    for (let i = 0; i < 4; i++) {
      h.tick(2000);
      h.observe(20);
      h.apply({ currentTimeSeconds: 30 + i, updatedAt: new Date(1_002_000 + i * 2000).toISOString(), correctionReason: "heartbeat" });
      h.flushTimers();
    }
    assert.equal(h.calls.filter(([type]) => type === "seek" || type === "play").length, 0);
    h.state(1);
    if (provider === "tiktok") h.currentTime(20);
    h.flushTimers();
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
    assert.ok(h.calls.find(([type]) => type === "seek")[1] >= 33, "recover to latest packet, not first stalled packet");
  });

  test(`${provider}: rapid buffer recoveries cannot amplify one correction into a seek/play burst`, () => {
    const h = harness(provider);
    h.globals.clockAnchorRef.current = { serverNowMs: 1_000_000, receivedAtPerformanceMs: 1_000_000, responseTransitEstimateMs: 0 };
    h.state(3);
    h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
    h.calls.length = 0;
    // A seek may briefly buffer, then report playing before its position settles.
    // Repeated recovery events must not erase the command's existing cooldown.
    for (let i = 0; i < 5; i++) {
      h.tick(100);
      h.observe(39.4 + i * .1);
      h.state(1);
      if (provider === "tiktok") h.currentTime(39.4 + i * .1);
      h.flushTimers();
      h.state(3);
    }
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
    assert.equal(h.calls.filter(([type]) => type === "play").length, 1);
    assert.equal(h.globals.lastCorrectionAtRef.current, 1_000_100);
  });

  test(`${provider}: recovery after the correction cooldown still seeks to the newest host position`, () => {
    const h = harness(provider);
    h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
    h.flushTimers();
    h.state(3);
    h.calls.length = 0;
    h.tick(2000);
    h.apply({ currentTimeSeconds: 55, updatedAt: new Date(1_002_000).toISOString() });
    assert.equal(h.calls.some(([type]) => type === "seek" || type === "play"), false, "buffered heartbeat cannot issue a correction");
    h.state(1);
    if (provider === "tiktok") h.currentTime(20);
    h.flushTimers();
    const seeks = h.calls.filter(([type]) => type === "seek");
    assert.equal(seeks.length, 1);
    assert.ok(seeks[0][1] >= 55);
    assert.equal(h.calls.filter(([type]) => type === "play").length, 1);
  });

  test(`${provider}: fresh manual seeks bypass recovery cooldown once per intent`, () => {
    const h = harness(provider);
    h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
    h.flushTimers();
    h.state(3);
    h.calls.length = 0;
    h.tick(100);
    h.apply({ currentTimeSeconds: 60, correctionReason: "seek", updatedAt: new Date(1_000_100).toISOString() });
    h.flushTimers();
    h.state(1);
    if (provider === "tiktok") h.currentTime(20);
    h.apply();
    h.flushTimers();
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1, "recovery cannot replay an already consumed manual seek");
    h.state(3);
    h.tick(100);
    h.apply({ currentTimeSeconds: 70, updatedAt: new Date(1_000_200).toISOString() });
    h.flushTimers();
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 2, "a new manual seek stays immediate during buffering");
  });

  test(`${provider}: one fresh manual seek bypasses cooldown but repeated copies do not`, () => {
    const h = harness(provider);
    h.apply({ currentTimeSeconds: 40, correctionReason: "seek" });
    h.flushTimers();
    for (let i = 0; i < 4; i++) { h.observe(20); h.apply(); h.flushTimers(); }
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
    h.observe(20);
    h.apply({ currentTimeSeconds: 50, updatedAt: new Date(1_000_100).toISOString() });
    h.flushTimers();
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 2, "a genuinely new manual seek remains immediate");
  });

  test(`${provider}: unchanged paused or stopped target is not repeatedly sought while provider reports old time`, () => {
    for (const playbackState of ["paused", "stopped"]) {
      const h = harness(provider);
      h.apply({ playbackState, currentTimeSeconds: 35, correctionReason: "state_change" });
      for (let i = 0; i < 4; i++) {
        h.tick(2000); h.observe(20);
        h.apply({ updatedAt: new Date(1_002_000 + i * 2000).toISOString(), correctionReason: "heartbeat" });
      }
      assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
      h.apply({ currentTimeSeconds: 45 });
      assert.equal(h.calls.filter(([type]) => type === "seek").length, 2, "a changed held target remains actionable");
    }
  });

  test(`${provider}: buffer hold still accepts a new pause, stop, and manual seek`, () => {
    const h = harness(provider);
    h.state(3);
    h.calls.length = 0;
    h.apply({ playbackState: "paused", currentTimeSeconds: 20 });
    assert.equal(h.calls.filter(([type]) => type === "pause").length, 1);
    h.apply({ playbackState: "stopped", currentTimeSeconds: 0 });
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
    h.apply({ playbackState: "playing", currentTimeSeconds: 60, correctionReason: "seek" });
    h.flushTimers();
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 2);
    assert.ok(h.calls.some(([type]) => type === "play"));
  });

  test(`${provider}: repeated preparation playback is always paused without seeking the same held position repeatedly`, async () => {
    const h = harness(provider);
    h.apply({ playbackState: "paused", currentTimeSeconds: 20, prepareToken: "prepare-12345678-1234-1234-1234-123456789012" });
    h.calls.length = 0;
    h.observe(20.05);
    h.state(1); h.state(2);
    await Promise.resolve();
    h.state(1); h.state(2);
    assert.equal(h.calls.filter(([type]) => type === "pause").length, 2);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 0, "already held media needs no seek");
    h.observe(22);
    h.state(1); h.state(2); h.state(1); h.state(2);
    assert.equal(h.calls.filter(([type]) => type === "pause").length, 4);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1, "coalesce correction until this preparation ends");
  });

  test(`${provider}: preparation seek that triggers buffering and playback cannot create a pause-seek loop`, () => {
    const h = harness(provider);
    h.apply({ playbackState: "paused", currentTimeSeconds: 20, prepareToken: "prepare-12345678-1234-1234-1234-123456789012" });
    h.calls.length = 0;
    h.observe(22);
    h.hooks.pause = () => h.state(2);
    h.hooks.seek = () => { h.state(3); h.state(1); };
    h.state(1);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
    assert.equal(h.calls.filter(([type]) => type === "pause").length, 2, "both original and seek-triggered playback stay held");
    assert.equal(h.calls.some(([type]) => type === "play"), false);
  });
}

test("TikTok recovery waits for a fresh media time before deciding to seek", () => {
  const h = harness("tiktok");
  h.state(3);
  h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
  h.calls.length = 0;
  h.state(1);
  assert.equal(h.calls.filter(([type]) => type === "seek").length, 0, "old pre-buffer time cannot justify another seek");
  h.currentTime(40);
  assert.equal(h.calls.filter(([type]) => type === "seek").length, 0, "recovered decoder is already aligned");
});

test("TikTok reset invalidates pending recovery until a new playing event and fresh position", () => {
  const h = harness("tiktok");
  h.state(3); h.state(1); h.state(-1);
  h.calls.length = 0;
  h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
  h.currentTime(20); h.flushTimers();
  h.tick(2000); h.apply(); h.flushTimers();
  assert.equal(h.calls.some(([type]) => type === "seek" || type === "play"), false, "late pre-reset position cannot release the receiver");
  h.state(1);
  assert.equal(h.calls.some(([type]) => type === "seek" || type === "play"), false, "fresh playing still awaits fresh time");
  h.currentTime(20); h.flushTimers();
  assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
  assert.ok(h.calls.some(([type]) => type === "play"));
});

test("TikTok terminal failure ignores late time and state events without reviving readiness", () => {
  const h = harness("tiktok");
  h.state(3); h.state(1);
  h.globals.markPlayerUnavailable("Unavailable", "player_error", 3001);
  h.calls.length = 0;
  h.currentTime(20); h.state(1);
  h.apply({ currentTimeSeconds: 50, correctionReason: "seek" });
  h.flushTimers();
  assert.equal(h.globals.readyRef.current, false);
  assert.equal(h.globals.awaitingRecoveryTimeRef.current, false);
  assert.equal(h.calls.length, 0);
});

test("TikTok initial unstarted event preserves cold preparation and its playing/pause acknowledgement", async () => {
  const h = harness("tiktok");
  h.globals.latestSyncRef.current = { ...h.sync, playbackState: "paused", prepareToken: "prepare-12345678-1234-1234-1234-123456789012" };
  h.state(-1);
  assert.equal(h.calls.filter(([type]) => type === "play").length, 1, "cold preparation still warms the lazy provider");
  h.state(1); h.state(2);
  await Promise.resolve();
  assert.equal(h.calls.filter(([type]) => type === "ack").length, 1);
  assert.ok(h.calls.some(([type]) => type === "pause"));
});
