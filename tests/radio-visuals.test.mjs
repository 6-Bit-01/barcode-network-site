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

test("inactive receiver remains animated standby with a public-safe shape", () => {
  const state = queueState({ session: undefined, isCurrentSession: false, publicStatus: { isOpen: false, activeCount: 0, acceptedCount: 0, estimatedRuntimeSeconds: 0, capacity: 44, pressure: "low" } });
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("standby", { sessionActive: false }), now: new Date("2026-08-19T19:00:00.000Z") });
  assert.equal(snapshot.sessionActive, false);
  assert.equal(snapshot.showStage, "standby");
  assert.equal(snapshot.visualMode, "standby");
  assert.deepEqual(snapshot.queue, { acceptedCount: 0, completedCount: 0, activeCount: 0, remainingCount: 0, currentPosition: 0, progress: 0, pressure: "low" });
  assert.equal(snapshot.track, null);
  assert.equal(snapshot.player, null);
  assert.deepEqual(Object.keys(snapshot).sort(), ["player", "queue", "scene", "sessionActive", "showStage", "track", "updatedAt", "visualMode", "visualSeed"]);
});

test("show stage follows queue completion instead of an independent visual state machine", () => {
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

test("current track and fresh player timeline drive the track visual without leaking private fields", () => {
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
  const state = queueState({
    nowPlaying: current,
    loadedTrack: current,
    session: { ...queueState().session, completedCount: 6, activeCount: 14 },
  });
  const currentScene = scene("now_playing", {
    title: "NOW PLAYING",
    track: { id: "track-7", artistName: "Detected Artist", trackTitle: "Detected Track", sourceType: "youtube" },
    youtube,
  });
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: youtube, now: new Date("2026-08-19T19:00:00.000Z") });
  assert.equal(snapshot.visualMode, "track");
  assert.deepEqual(snapshot.track, { artistName: "Detected Artist", trackTitle: "Detected Track", sourceType: "youtube" });
  assert.deepEqual(snapshot.player, { provider: "youtube", playbackState: "playing", currentTimeSeconds: 42, durationSeconds: 180, updatedAt: "2026-08-19T18:59:55.000Z", audioEnergy: null });
  assert.equal(snapshot.queue.currentPosition, 7);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /private@example\.com|pi_private|private-session-id|abcDEF12345/);
});

test("audio uploads use the same fresh timeline seam and reject stale or mismatched sync", () => {
  const current = entry("upload-1", { sourceType: "upload" });
  const state = queueState({ nowPlaying: current, loadedTrack: current });
  const currentScene = scene("now_playing", { track: { id: "upload-1", artistName: "Artist", trackTitle: "Upload", sourceType: "upload" } });
  const fresh = { provider: "audio", trackId: "upload-1", playbackState: "paused", currentTimeSeconds: 21, durationSeconds: 90, updatedAt: "2026-08-19T18:59:55.000Z", muted: false };
  const mismatch = { ...fresh, trackId: "another-track" };
  const stale = { ...fresh, updatedAt: "2026-08-19T18:59:40.000Z" };
  const now = new Date("2026-08-19T19:00:00.000Z");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: fresh, now }).player?.provider, "audio");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: mismatch, now }).player, null);
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: stale, now }).player, null);
});

test("wheel, sponsor, and emergency scenes select distinct visual modes", () => {
  const state = queueState();
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("wheel_spinning") }).visualMode, "wheel");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("sponsor") }).visualMode, "sponsor");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("system_message") }).visualMode, "system");
});

test("permanent receiver keeps low-frequency standby polling and admin exposes the stable link", () => {
  const receiver = fs.readFileSync(path.join(projectRoot, "src/components/RadioVisualsReceiver.tsx"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "src/lib/radio-visuals.ts"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "src/components/AdminLiveOverlayControl.tsx"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "src/app/overlay/radio-visuals/radio-visuals.css"), "utf8");
  assert.match(receiver, /fetch\("\/api\/overlay\/radio-visuals"/);
  assert.match(receiver, /payload\.snapshot\.sessionActive \? RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS : RADIO_VISUALS_STANDBY_POLL_INTERVAL_MS/);
  assert.doesNotMatch(receiver, /startSessionBoundPolling/);
  assert.match(builder, /const queueState = await getRadioQueueState\(\);\s*if \(!hasActiveQueueSession\(queueState\)\)/);
  const idleBranch = builder.slice(builder.indexOf("if (!hasActiveQueueSession(queueState))"), builder.indexOf("const [overlayState, playerSync]"));
  assert.doesNotMatch(idleBranch, /getStoredLiveOverlayState|getLiveOverlayPlayerSync/);
  assert.match(admin, /\/overlay\/radio-visuals/);
  assert.match(css, /animation: radio-visuals-sweep/);
  assert.match(css, /width: 100vw;\s*height: 100vh/);
});
