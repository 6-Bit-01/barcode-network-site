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
  let now = 1_000_000, position = 20, timerId = 0, diagnostics = {};
  const calls = [], timers = new Map(), frame = {}, hooks = {};
  const sync = { provider, videoId: "cA-Zu3O08cQ", postId: "6718335390845095173", trackId: "video-1", playbackState: "playing", currentTimeSeconds: 20, updatedAt: new Date(now).toISOString(), muted: true };
  class Clock extends Date { static now() { return now; } }
  const globals = {
    ...resolver, Date: Clock, Number, VideoReceiverPreparation, VideoStartDeadline, sync,
    performance: { now: () => now },
    window: { setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id), removeEventListener: noop },
    clockAnchorRef: ref(null), cancelled: false, generation: 1,
    acknowledgePreparedVideo: async (token) => { calls.push(["ack", token]); return true; },
    updateDiagnostics: (patch) => { diagnostics = { ...diagnostics, ...patch }; }, setSyncDiagnostic: (next) => { diagnostics = next; }, markTrustedPlayerEvent: noop,
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
  for (const name of ["overlayServerNow", "serverRelativeAgeFromAnchor", "expectedYouTubeTime", "expectedTikTokTime", "roundedFiniteSeconds", "driftDirectionFromRoundedDrift", "observeReceiverSeekSettlement"])
    globals[name] = evaluate(namedFunction(ast, name), globals);
  const applyName = provider === "youtube" ? "applyYouTubeSync" : "applyTikTokSync";
  const apply = globals[applyName] = evaluate(variable(root, applyName).initializer.arguments[0], globals);
  globals.applySyncRef.current = apply;
  const event = provider === "youtube"
    ? evaluate(find(root, (n) => ts.isPropertyAssignment(n) && n.name.getText() === "onStateChange").initializer, globals)
    : evaluate(namedFunction(root, "onMessage"), globals);
  globals.preparation = globals.preparationRef.current;
  globals.startDeadline = globals.startDeadlineRef.current;
  globals.clearReadyTimer = noop;
  globals.clearImperativeHost = noop;
  globals.onMessage = event;
  const cleanup = evaluate(find(root, (n) => ts.isReturnStatement(n) && n.expression && ts.isArrowFunction(n.expression) && n.expression.getText().includes("destroyedRef.current = true")).expression, globals);
  const flushTimers = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return {
    calls, globals, sync, flushTimers, hooks, dispose: cleanup, get diagnostics() { return diagnostics; },
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

// Model the provider's observed playback, including time actually spent frozen
// after each seek. Commands do not instantly update its real media position.
function simulateSeekSettlement(provider, settleTimesMs, { networkStallAtMs = null, networkStallMs = 0, durationMs = 15_000, correctionReason = "heartbeat", pauseBeforeBuffer = false } = {}) {
  const h = harness(provider);
  h.globals.clockAnchorRef.current = { serverNowMs: 1_000_000, receivedAtPerformanceMs: 1_000_000, responseTransitEstimateMs: 0 };
  let elapsed = 0, position = 19.5, pending = null, scanned = 0, seekIndex = 0;
  const seeks = [];
  function consumeCommands() {
    let newSeek = false;
    h.flushTimers();
    for (const [type, target] of h.calls.slice(scanned)) {
      if (type !== "seek") continue;
      newSeek = true;
      const settleMs = settleTimesMs[Math.min(seekIndex++, settleTimesMs.length - 1)];
      pending = { target, resumeAt: elapsed + settleMs };
      seeks.push({ atMs: elapsed, target, lead: target - (20 + elapsed / 1000) });
    }
    scanned = h.calls.length;
    if (newSeek && pauseBeforeBuffer) h.state(2);
    if (pending) h.state(3);
  }
  h.observe(position);
  h.apply({ correctionReason });
  consumeCommands();
  for (elapsed = 50; elapsed <= durationMs; elapsed += 50) {
    h.tick(50);
    if (elapsed === networkStallAtMs) { pending = { target: position, resumeAt: elapsed + networkStallMs }; h.state(3); }
    if (pending) {
      if (elapsed >= pending.resumeAt) {
        position = pending.target;
        pending = null;
        if (provider === "youtube") h.observe(position);
        h.state(1);
        if (provider === "tiktok") h.currentTime(position);
        consumeCommands();
      }
    } else position += .05;
    if (provider === "youtube") h.observe(position);
    else if (!pending && elapsed % 250 === 0) { h.currentTime(position); consumeCommands(); }
    if (elapsed % 650 === 0) {
      h.apply({ currentTimeSeconds: 20 + elapsed / 1000, updatedAt: new Date(1_000_000 + elapsed).toISOString() });
      consumeCommands();
    }
  }
  return { h, seeks, finalDrift: position - (20 + durationMs / 1000) };
}

for (const provider of ["youtube", "tiktok"]) {
  test(`${provider}: ordinary 600ms seek settlement converges instead of repeatedly buffering`, () => {
    const result = simulateSeekSettlement(provider, [600]);
    assert.equal(result.seeks.length, 2, "one measurement and one compensated correction suffice");
    assert.ok(Math.abs(result.finalDrift) < .05);
  });

  test(`${provider}: fast settlement retains the existing correction behavior`, () => {
    const result = simulateSeekSettlement(provider, [100]);
    assert.equal(result.seeks.length, 1);
    assert.ok(result.finalDrift >= -.2 && result.finalDrift <= .7);
  });

  test(`${provider}: changing settlement latency stays inside the existing drift window without a seek loop`, () => {
    const slower = simulateSeekSettlement(provider, [100, 600], { networkStallAtMs: 5000, networkStallMs: 1000 });
    assert.equal(slower.seeks.length, 3, "newly slower seeks may need one new measurement");
    assert.ok(Math.abs(slower.finalDrift) < .05);
    const faster = simulateSeekSettlement(provider, [600, 100]);
    assert.equal(faster.seeks.length, 2);
    assert.ok(faster.finalDrift >= -.2 && faster.finalDrift <= .7, "a faster decoder remains within the accepted ahead tolerance");
  });

  test(`${provider}: an unrelated long network buffer is not learned as seek latency`, () => {
    const result = simulateSeekSettlement(provider, [600], { networkStallAtMs: 5000, networkStallMs: 5000, durationMs: 20_000 });
    assert.equal(result.seeks.some(({ atMs }) => atMs > 5000 && atMs < 10000), false);
    const firstRecoverySeek = result.seeks.find(({ atMs }) => atMs >= 10000);
    const defaultLead = provider === "youtube" ? .2 : .3;
    assert.ok(firstRecoverySeek.lead <= defaultLead + .001, "network waiting cannot become a large catch-up jump");
    assert.equal(result.seeks.length, 4);
    assert.ok(Math.abs(result.finalDrift) < .05);
  });

  test(`${provider}: manual seek cancels an outstanding correction measurement`, () => {
    const h = harness(provider);
    h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
    h.state(3);
    h.tick(100);
    h.apply({ currentTimeSeconds: 60, correctionReason: "seek", updatedAt: new Date(1_000_100).toISOString() });
    h.flushTimers();
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 2, "manual intent remains immediate");
    h.tick(500);
    h.observe(60.3);
    h.state(1);
    if (provider === "tiktok") h.currentTime(60.3);
    assert.equal(h.globals.seekSettlementRef.current.pending, null);
    assert.equal(h.globals.seekSettlementRef.current.leadSeconds, 0, "manual seek completion cannot train a routine correction");
  });

  test(`${provider}: pause, stop, preparation, reset, and replacement clear correction measurements`, () => {
    for (const action of ["paused", "stopped", "prepare", "scheduled", "reset", "replace"]) {
      const h = harness(provider);
      h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
      h.state(3);
      // Exercise cancellation with both a prior estimate and a pending seek.
      h.globals.seekSettlementRef.current.leadSeconds = .6;
      h.globals.seekSettlementRef.current.misses = 2;
      h.globals.seekSettlementRef.current.limited = true;
      if (action === "replace") h.dispose();
      else if (action === "reset") h.state(-1);
      else if (action === "scheduled") {
        h.globals.startDeadlineRef.current = new VideoStartDeadline({ schedule: h.globals.window.setTimeout, clear: h.globals.window.clearTimeout });
        h.apply({ playbackState: "playing", startToken: "video-start-settlement-test", scheduledStartAt: new Date(1_003_000).toISOString() });
      }
      else h.apply({ playbackState: action === "stopped" ? "stopped" : "paused", ...(action === "prepare" ? { prepareToken: "prepare-12345678-1234-1234-1234-123456789012" } : {}) });
      assert.equal(h.globals.seekSettlementRef.current.pending, null, action);
      assert.equal(h.globals.seekSettlementRef.current.leadSeconds, 0, action);
      assert.equal(h.globals.seekSettlementRef.current.limited, false, action);
      h.tick(600);
      h.observe(40.3);
      if (provider === "tiktok") h.currentTime(40.3);
      else if (action !== "replace") h.apply();
      assert.equal(h.globals.seekSettlementRef.current.leadSeconds, 0, "late old samples cannot revive an invalidated estimate");
    }
  });

  test(`${provider}: a correction sample arriving after 1500ms cannot teach a large lead`, () => {
    const h = harness(provider);
    h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
    h.state(3);
    h.tick(5000);
    h.observe(40.3);
    h.state(1);
    if (provider === "tiktok") h.currentTime(40.3);
    assert.equal(h.globals.seekSettlementRef.current.pending, null);
    assert.equal(h.globals.seekSettlementRef.current.leadSeconds, 0);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
  });

  test(`${provider}: repeated slow seek landings stop forward command churn without stopping the picture`, () => {
    for (const [settleMs, expectedSeeks] of [[1300, 3], [2000, 2]]) {
      const result = simulateSeekSettlement(provider, [settleMs], { pauseBeforeBuffer: true });
      assert.equal(result.seeks.length, expectedSeeks);
      assert.equal(result.h.globals.seekSettlementRef.current.limited, true);
      assert.equal(result.h.diagnostics.correctionReason, "settlement_limit");
      assert.ok(result.h.diagnostics.driftSeconds < -.3, "diagnostics retain the actual lag");
      assert.equal(result.h.globals.readyRef.current, true);
      assert.equal(result.h.calls.some(([type]) => type === "pause" || type === "error"), false);
    }
  });

  test(`${provider}: one long app seek followed by a newly measured faster seek still gets to converge`, () => {
    const result = simulateSeekSettlement(provider, [2000, 600]);
    assert.equal(result.seeks.length, 3);
    assert.equal(result.h.globals.seekSettlementRef.current.limited, false);
    assert.ok(Math.abs(result.finalDrift) < .05);
  });

  test(`${provider}: correction suppression releases on true alignment or explicit intent and preserves ahead correction`, () => {
    for (const action of ["alignment", "manual", "ahead", "external_buffer"]) {
      const { h } = simulateSeekSettlement(provider, [2000], { durationMs: 6000 });
      assert.equal(h.globals.seekSettlementRef.current.limited, true);
      const seekCount = h.calls.filter(([type]) => type === "seek").length;
      if (action === "manual") h.apply({ currentTimeSeconds: 45, correctionReason: "seek", updatedAt: new Date(1_006_000).toISOString() });
      else if (action === "external_buffer") h.state(3);
      else {
        h.observe(action === "ahead" ? 30 : 26);
        if (provider === "tiktok") h.currentTime(action === "ahead" ? 30 : 26);
        else h.apply();
      }
      h.flushTimers();
      if (action === "ahead") {
        assert.equal(h.calls.filter(([type]) => type === "seek").length, seekCount + 1, "forward suppression must not block a backwards correction");
        assert.equal(h.globals.seekSettlementRef.current.limited, true, "a command alone cannot claim actual alignment");
        h.observe(26);
        if (provider === "tiktok") h.currentTime(26);
        else h.apply();
      }
      assert.equal(h.globals.seekSettlementRef.current.limited, false, action);
      if (action === "manual") assert.equal(h.calls.filter(([type]) => type === "seek").length, seekCount + 1);
    }
  });

  test(`${provider}: elapsed time and a stale resumed sample cannot count as failed seek landings`, () => {
    const h = harness(provider);
    h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
    h.state(3);
    h.tick(5000);
    h.apply({ currentTimeSeconds: 45, updatedAt: new Date(1_005_000).toISOString() });
    assert.equal(h.globals.seekSettlementRef.current.misses, 0);
    assert.notEqual(h.globals.seekSettlementRef.current.pending, null);
    h.state(1);
    if (provider === "tiktok") h.currentTime(20);
    assert.equal(h.globals.seekSettlementRef.current.misses, 0);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
  });

  test(`${provider}: native pause cannot be mistaken for a resumed seek landing`, () => {
    const h = harness(provider);
    h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
    h.state(3);
    h.tick(600);
    h.observe(20.1);
    h.state(2);
    if (provider === "tiktok") h.currentTime(20.1);
    else h.apply();
    assert.equal(h.globals.seekSettlementRef.current.misses, 0);
    assert.notEqual(h.globals.seekSettlementRef.current.pending, null);
    h.state(1);
    if (provider === "tiktok") h.currentTime(20.2);
    else h.apply();
    assert.equal(h.globals.seekSettlementRef.current.misses, 0, "resumed playback may still be approaching the requested target");
    h.tick(1000);
    h.observe(20.3);
    if (provider === "tiktok") h.currentTime(20.3);
    else h.apply();
    assert.equal(h.globals.seekSettlementRef.current.misses, 1, "an expired seek with actual resumed progress can establish a miss");
  });

  test(`${provider}: resumed old-clock progress waits for the actual seek landing within the settlement window`, () => {
    const h = harness(provider);
    h.globals.clockAnchorRef.current = { serverNowMs: 1_000_000, receivedAtPerformanceMs: 1_000_000, responseTransitEstimateMs: 0 };
    h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
    const target = h.calls.find(([type]) => type === "seek")[1];
    h.state(3);
    h.tick(100);
    h.observe(20.1);
    h.state(1);
    if (provider === "tiktok") h.currentTime(20.1);
    assert.equal(h.globals.seekSettlementRef.current.misses, 0);
    assert.notEqual(h.globals.seekSettlementRef.current.pending, null);
    h.tick(500);
    h.observe(target);
    if (provider === "tiktok") h.currentTime(target);
    else h.apply();
    assert.equal(h.globals.seekSettlementRef.current.leadSeconds, .6);
    assert.equal(h.globals.seekSettlementRef.current.pending, null);
    assert.equal(h.calls.filter(([type]) => type === "seek").length, 1);
  });

  test(`${provider}: a repeated state-change packet still receives ordinary settlement correction`, () => {
    const result = simulateSeekSettlement(provider, [600], { correctionReason: "state_change" });
    assert.equal(result.seeks.length, 2);
    assert.ok(Math.abs(result.finalDrift) < .05);
  });

  test(`${provider}: compensated correction respects duration and an ended player clears its guard`, () => {
    const h = harness(provider);
    h.globals.seekSettlementRef.current.leadSeconds = .6;
    h.observe(99);
    h.apply({ currentTimeSeconds: 99.5, durationSeconds: 100, correctionReason: "heartbeat" });
    assert.equal(h.calls.find(([type]) => type === "seek")[1], 100);
    h.globals.seekSettlementRef.current.limited = true;
    h.state(0);
    assert.equal(h.globals.seekSettlementRef.current.limited, false);
    assert.equal(h.globals.seekSettlementRef.current.pending, null);
  });

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
    assert.equal(h.calls.some(([type]) => type === "seek" || type === "play"), false, "old pre-seek time cannot establish recovery");
    h.observe(20.1);
    if (provider === "tiktok") h.currentTime(20.1);
    else h.apply();
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

test("TikTok correction measurement uses fresh provider time, never its optimistic seek target", () => {
  const h = harness("tiktok");
  h.apply({ currentTimeSeconds: 40, correctionReason: "heartbeat" });
  const target = h.calls.find(([type]) => type === "seek")[1];
  h.state(3);
  h.tick(600);
  h.state(1);
  h.apply();
  assert.equal(h.globals.seekSettlementRef.current.leadSeconds, 0);
  assert.notEqual(h.globals.seekSettlementRef.current.pending, null);
  h.currentTime(target);
  assert.equal(h.globals.seekSettlementRef.current.leadSeconds, .6);
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
