import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalExtension = Module._extensions[".ts"];
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const visuals = require("../src/lib/radio-visuals-resolver.ts");
const engine = require("../src/lib/radio-visuals-engine.ts");
const cues = require("../src/lib/radio-visuals-cues.ts");

test.after(() => {
  Module._extensions[".ts"] = originalExtension;
});

function entry(id, overrides = {}) {
  return {
    id,
    artist: "Private legacy artist",
    title: "Private legacy title",
    submittedArtistName: "Submitted Artist",
    submittedSongTitle: "Submitted Track",
    detectedArtistName: "Detected Artist",
    detectedSongTitle: "Detected Track",
    link: "https://example.com/track",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    status: "queued",
    createdAt: "2026-08-19T18:00:00.000Z",
    playedAt: null,
    contactEmail: "private@example.com",
    priorityUpgradePaymentId: "pi_private",
    ...overrides,
  };
}

function queueState(overrides = {}) {
  return {
    revision: 14,
    nowPlaying: null,
    loadedTrack: null,
    nextInLine: null,
    queue: [],
    history: [],
    totalPlayed: 0,
    streamStatus: "online",
    publicStatus: { isOpen: true, activeCount: 20, acceptedCount: 20, estimatedRuntimeSeconds: 3600, capacity: 44, pressure: "medium" },
    session: {
      sessionId: "private-session-id",
      title: "BARCODE Radio",
      status: "open",
      purpose: "production",
      bnlPublicationStatus: "public",
      provenanceRevision: 1,
      showDate: "2026-08-19",
      createdAt: "2026-08-19T18:00:00.000Z",
      updatedAt: "2026-08-19T19:00:00.000Z",
      queueOpen: true,
      description: "",
      trackLimitPerArtist: 3,
      queueCapacity: 44,
      skipGameTapTarget: 10_000,
      submissionCooldownSeconds: 0,
      activeCount: 20,
      acceptedCount: 20,
      completedCount: 0,
      removedCount: 0,
      spotlightCount: 0,
      estimatedActiveRuntimeSeconds: 3600,
      completedRuntimeSeconds: 0,
      nextNonPriorityLane: "regular",
      showStarted: true,
      broadcastPhase: "broadcast_active",
      wheelSpinsOwed: 0,
      priorityUpgradesEnabled: true,
      priorityUpgradeLabel: "Priority Signal",
      priorityUpgradeInstructions: "",
      priorityUpgradePriceCents: 1000,
      priorityUpgradeCurrency: "usd",
      priorityUpgradePaymentsEnabled: true,
      sponsorBreakSeconds: 630,
      sponsorBreakStatus: "not_due",
    },
    isCurrentSession: true,
    ...overrides,
  };
}

function scene(mode = "session_active", overrides = {}) {
  return {
    sessionActive: true,
    mode,
    resolvedMode: mode,
    reason: "test",
    title: "BARCODE RADIO",
    subtitle: "LIVE",
    message: "Transmission active.",
    priority: 20,
    automatic: true,
    overrideActive: false,
    wheelOverlayActive: false,
    wheelSpinsOwed: 0,
    updatedAt: "2026-08-19T19:00:00.000Z",
    ...overrides,
  };
}

test("inactive receiver stays nearly invisible and exposes only the visual projection", () => {
  const state = queueState({ session: undefined, isCurrentSession: false, publicStatus: { isOpen: false, activeCount: 0, acceptedCount: 0, estimatedRuntimeSeconds: 0, capacity: 44, pressure: "low" } });
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("standby", { sessionActive: false }), now: new Date("2026-08-19T19:00:00.000Z") });
  assert.equal(snapshot.sessionActive, false);
  assert.equal(snapshot.showStage, "standby");
  assert.equal(snapshot.visualMode, "standby");
  assert.deepEqual(snapshot.queue, { acceptedCount: 0, completedCount: 0, activeCount: 0, remainingCount: 0, progress: 0, pressure: "low" });
  assert.equal(snapshot.player, null);
  assert.equal(snapshot.cue, null);
  assert.deepEqual(Object.keys(snapshot).sort(), ["cue", "player", "queue", "sceneMode", "sessionActive", "showStage", "updatedAt", "visualMode", "visualSeed"]);
  assert.ok(engine.radioVisualsIntensity(snapshot) < 0.05, "standby remains a ghost layer");
});

test("show stage follows queue completion without creating another queue state machine", () => {
  const bands = [
    { completedCount: 0, expected: "early" },
    { completedCount: 5, expected: "middle" },
    { completedCount: 12, expected: "late" },
    { completedCount: 17, expected: "final" },
  ];
  for (const band of bands) {
    const state = queueState({ session: { ...queueState().session, completedCount: band.completedCount, activeCount: 20 - band.completedCount } });
    const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene(), now: new Date("2026-08-19T19:00:00.000Z") });
    assert.equal(snapshot.showStage, band.expected);
    assert.equal(snapshot.queue.progress, band.completedCount / 20);
    assert.equal(snapshot.queue.remainingCount, 20 - band.completedCount);
  }
});

test("pre-show and ended broadcast phases resolve to intake and complete", () => {
  const intakeState = queueState({ session: { ...queueState().session, showStarted: false, broadcastPhase: "submission_window" } });
  const endedState = queueState({ session: { ...queueState().session, broadcastPhase: "ended", completedCount: 20, activeCount: 0 } });
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: intakeState, scene: scene() }).showStage, "intake");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: endedState, scene: scene() }).showStage, "complete");
});

test("track identity seeds visuals and fresh timeline drives motion without exposing track copy or private fields", () => {
  const current = entry("track-7", { sourceType: "youtube" });
  const youtube = {
    provider: "youtube",
    videoId: "abcDEF12345",
    trackId: "track-7",
    playbackState: "playing",
    currentTimeSeconds: 42,
    durationSeconds: 180,
    updatedAt: "2026-08-19T18:59:55.000Z",
    muted: true,
  };
  const state = queueState({ nowPlaying: current, loadedTrack: current, session: { ...queueState().session, completedCount: 6, activeCount: 14 } });
  const currentScene = scene("now_playing", {
    title: "NOW PLAYING",
    track: { id: "track-7", artistName: "Detected Artist", trackTitle: "Detected Track", sourceType: "youtube" },
    youtube,
  });
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: youtube, now: new Date("2026-08-19T19:00:00.000Z") });
  const anotherTrack = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: { ...currentScene, track: { ...currentScene.track, trackTitle: "Another Track" } }, playerSync: youtube, now: new Date("2026-08-19T19:00:00.000Z") });
  assert.equal(snapshot.visualMode, "track");
  assert.deepEqual(snapshot.player, { provider: "youtube", playbackState: "playing", currentTimeSeconds: 42, durationSeconds: 180, updatedAt: "2026-08-19T18:59:55.000Z", audioEnergy: null });
  assert.notEqual(snapshot.visualSeed, anotherTrack.visualSeed, "track identity selects a repeatable visual character");
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /Detected Artist|Detected Track|private@example\.com|pi_private|private-session-id|abcDEF12345|track-7/);
});

test("audio uploads use the same fresh timeline seam and reject stale or mismatched sync", () => {
  const current = entry("upload-1", { sourceType: "upload" });
  const state = queueState({ nowPlaying: current, loadedTrack: current });
  const currentScene = scene("now_playing", { track: { id: "upload-1", artistName: "Artist", trackTitle: "Upload", sourceType: "upload" } });
  const fresh = { provider: "audio", trackId: "upload-1", playbackState: "paused", currentTimeSeconds: 21, durationSeconds: 90, updatedAt: "2026-08-19T18:59:55.000Z", muted: false };
  const now = new Date("2026-08-19T19:00:00.000Z");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: fresh, now }).player?.provider, "audio");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: { ...fresh, trackId: "another-track" }, now }).player, null);
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: { ...fresh, updatedAt: "2026-08-19T18:59:40.000Z" }, now }).player, null);
});

test("wheel, sponsor, and emergency scenes select distinct automatic visual modes", () => {
  const state = queueState();
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("wheel_spinning") }).visualMode, "wheel");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("sponsor") }).visualMode, "sponsor");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("system_message") }).visualMode, "system");
});

test("manual visual cues are bounded, server-timed, and expire without touching queue state", () => {
  const overlayState = {
    visualCueType: "party",
    visualCueStartedAt: "2026-08-19T18:59:58.000Z",
    visualCueExpiresAt: "2026-08-19T19:00:13.000Z",
    visualCueNonce: "cue-1",
  };
  const active = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: scene(), overlayState, now: new Date("2026-08-19T19:00:00.000Z") });
  const expired = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: scene(), overlayState, now: new Date("2026-08-19T19:00:14.000Z") });
  assert.deepEqual(active.cue, { type: "party", startedAt: "2026-08-19T18:59:58.000Z", expiresAt: "2026-08-19T19:00:13.000Z", nonce: "cue-1" });
  assert.equal(expired.cue, null);
  assert.equal(cues.RADIO_VISUAL_CUE_DURATION_MS.party, 15_000);
  assert.equal(cues.RADIO_VISUAL_CUE_DURATION_MS.shadow, 9_000);
  assert.equal(cues.normalizeRadioVisualCueType("not-a-cue"), null);
});

test("manual cue envelopes ease in and out instead of snapping", () => {
  const cue = { type: "party", startedAt: "2026-08-19T19:00:00.000Z", expiresAt: "2026-08-19T19:00:15.000Z", nonce: "party" };
  const start = Date.parse(cue.startedAt);
  const early = engine.radioVisualCueEnvelope(cue, start + 300);
  const sustained = engine.radioVisualCueEnvelope(cue, start + 5_000);
  const releasing = engine.radioVisualCueEnvelope(cue, start + 14_600);
  assert.ok(early > 0 && early < sustained);
  assert.equal(sustained, 1);
  assert.ok(releasing > 0 && releasing < sustained);
  assert.equal(engine.radioVisualCueEnvelope(cue, Date.parse(cue.expiresAt)), 0);
});

test("the effect palette preserves BARCODE green, violet, black, and white while excluding the orange key", () => {
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: scene() });
  const palette = engine.radioVisualsPalette(snapshot);
  assert.equal(engine.RADIO_VISUALS_CHROMA_KEY, "#ff5a00");
  assert.match([palette.primary, palette.secondary].join(" "), /#00ff88|#7c3aed|#a78bfa|#22d3ee/);
  assert.match(palette.highlight, /#e0e0e0|#ffffff|#a78bfa/);
  assert.match(palette.shadow, /#0[235]0[235]0[235]/);
  assert.doesNotMatch(JSON.stringify(palette), /#ff5a00/);
});

test("permanent receiver is a pure full-frame effects surface with a stable link and bounded standby polling", () => {
  const receiver = fs.readFileSync(path.join(projectRoot, "src/components/RadioVisualsReceiver.tsx"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "src/lib/radio-visuals.ts"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "src/components/AdminLiveOverlayControl.tsx"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "src/app/overlay/radio-visuals/radio-visuals.css"), "utf8");
  const render = receiver.slice(receiver.lastIndexOf("return ("));
  assert.match(receiver, /fetch\("\/api\/overlay\/radio-visuals"/);
  assert.match(receiver, /payload\.snapshot\.sessionActive \? RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS : RADIO_VISUALS_STANDBY_POLL_INTERVAL_MS/);
  assert.doesNotMatch(receiver, /startSessionBoundPolling/);
  assert.doesNotMatch(render, /<(?:header|footer|h[1-6]|p|span|strong|em)\b|aria-live/);
  assert.match(render, /<canvas ref=\{canvasRef\}/);
  assert.match(receiver, /drawAmbientLighting|drawGoboShadows|drawCaustics|drawWavefronts|drawParticleField|drawTrackBloom|drawPartyCue|drawShadowCue|drawSignalBreachCue|drawBlackoutCue|drawLightningCue/);
  assert.match(receiver, /PALETTE_TRANSITION_MS = 2_400|PARTICLE_TRANSITION_MS = 2_000|radioVisualCueEnvelope/);
  assert.match(builder, /const queueState = await getRadioQueueState\(\);\s*if \(!hasActiveQueueSession\(queueState\)\)/);
  const idleBranch = builder.slice(builder.indexOf("if (!hasActiveQueueSession(queueState))"), builder.indexOf("const [overlayState, playerSync]"));
  assert.doesNotMatch(idleBranch, /getStoredLiveOverlayState|getLiveOverlayPlayerSync/);
  assert.match(admin, /\/overlay\/radio-visuals/);
  assert.match(admin, /triggerVisualCue|Party Burst|Shadow Sweep|Signal Breach|Blackout \/ Return|Lightning Hit/);
  assert.match(css, /--radio-visuals-key: #ff5a00/);
  assert.match(css, /width: 100vw;\s*height: 100vh/);
});
