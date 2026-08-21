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
const visualEvents = require("../src/lib/radio-visuals-events.ts");
const audioVisuals = require("../src/lib/radio-visuals-audio.ts");
const audioBridge = require("../src/lib/radio-audio-bridge.ts");
const liveOverlay = require("../src/lib/live-overlay-resolver.ts");

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
  assert.deepEqual(snapshot.signals, { intakeOpen: false, wheelSpinsOwed: 0, wheelCandidateCount: 0, broadcastPhase: null });
  assert.equal(snapshot.player, null);
  assert.equal(snapshot.cue, null);
  assert.deepEqual(snapshot.events, []);
  assert.deepEqual(Object.keys(snapshot).sort(), ["cue", "events", "player", "queue", "sceneMode", "sessionActive", "showStage", "signals", "updatedAt", "visualMode", "visualSeed"]);
  assert.ok(engine.radioVisualsIntensity(snapshot) < 0.08, "standby remains a ghost layer");
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
  assert.deepEqual(snapshot.player, { provider: "youtube", playbackState: "playing", currentTimeSeconds: 42, durationSeconds: 180, updatedAt: "2026-08-19T18:59:55.000Z", audioEnergy: null, audioBands: null, audioPeak: null });
  assert.notEqual(snapshot.visualSeed, anotherTrack.visualSeed, "track identity selects a repeatable visual character");
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /Detected Artist|Detected Track|private@example\.com|pi_private|private-session-id|abcDEF12345|track-7/);
});

test("audio uploads use the same fresh timeline seam and reject stale or mismatched sync", () => {
  const current = entry("upload-1", { sourceType: "upload" });
  const state = queueState({ nowPlaying: current, loadedTrack: current });
  const currentScene = scene("now_playing", { track: { id: "upload-1", artistName: "Artist", trackTitle: "Upload", sourceType: "upload" } });
  const fresh = { provider: "audio", trackId: "upload-1", playbackState: "paused", currentTimeSeconds: 21, durationSeconds: 90, updatedAt: "2026-08-19T18:59:55.000Z", muted: false, audioAnalysis: { energy: 0.72, bass: 0.81, mid: 0.58, treble: 0.34, peak: 0.9 } };
  const now = new Date("2026-08-19T19:00:00.000Z");
  const projected = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: fresh, now }).player;
  assert.equal(projected?.provider, "audio");
  assert.equal(projected?.audioEnergy, 0.72);
  assert.deepEqual(projected?.audioBands, { bass: 0.81, mid: 0.58, treble: 0.34 });
  assert.equal(projected?.audioPeak, 0.9);
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: { ...fresh, trackId: "another-track" }, now }).player, null);
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene, playerSync: { ...fresh, updatedAt: "2026-08-19T18:59:40.000Z" }, now }).player, null);
});

test("Wheel and emergency scenes remain distinct while sponsor scenes have no dedicated FX mode", () => {
  const state = queueState();
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("wheel_spinning") }).visualMode, "wheel");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("sponsor") }).visualMode, "queue");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("system_message") }).visualMode, "system");
  assert.doesNotMatch(visualEvents.RADIO_VISUAL_EVENT_TYPES.join(" "), /sponsor/);
});

test("uncaptured songs automatically rotate through six synthetic rhythm personalities", () => {
  assert.deepEqual(engine.RADIO_VISUAL_FALLBACK_RHYTHMS, [
    "sub_bloom",
    "neon_breaks",
    "ghost_dub",
    "fever_drive",
    "glass_rain",
    "machine_funk",
  ]);
  const seen = new Set(Array.from({ length: 256 }, (_, index) => engine.radioVisualFallbackRhythm(index + 1)));
  assert.equal(seen.size, engine.RADIO_VISUAL_FALLBACK_RHYTHMS.length);
  const current = entry("external-rhythm", { sourceType: "spotify" });
  const state = queueState({ nowPlaying: current, loadedTrack: current });
  const currentScene = scene("now_playing", { track: { id: current.id, artistName: "Artist", trackTitle: "External Track", sourceType: "spotify" } });
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: currentScene });
  const signal = engine.radioVisualsMusicSignal(snapshot, 0, 42);
  assert.equal(snapshot.player, null);
  assert.equal(signal.source, "timeline");
  assert.ok(signal.energy > 0.12, "an uncaptured loaded track still receives active automatic music motion");
  const trackStart = engine.radioVisualsMusicSignal(snapshot, 0, 900, null, 0);
  const trackBuild = engine.radioVisualsMusicSignal(snapshot, 0, 1_020, null, 120);
  const nextOccurrenceStart = engine.radioVisualsMusicSignal(snapshot, 0, 1_020, null, 0);
  assert.equal(trackStart.progress, 0, "an unknown-duration track starts its own long-form build at zero");
  assert.ok(trackBuild.progress > trackStart.progress, "unknown-duration progress builds from the track occurrence rather than the document clock");
  assert.equal(nextOccurrenceStart.progress, 0, "a new occurrence cannot inherit the previous track's topology stage");
});

test("track loads and Wheel ceremonies vary by occurrence while remaining stable through every ceremony state", () => {
  const current = entry("repeat-track", { sourceType: "spotify" });
  const currentScene = scene("now_playing", { track: { id: current.id, artistName: "Artist", trackTitle: "Repeat", sourceType: "spotify" } });
  const stateForLoad = (observedAt) => queueState({
    nowPlaying: current,
    loadedTrack: current,
    playbackDiagnostics: { events: [{ trackId: current.id, eventType: "loaded", observedAt }] },
  });
  const first = visuals.resolveRadioVisualsSnapshot({ queueState: stateForLoad("2026-08-19T19:00:00.000Z"), scene: currentScene });
  const repeated = visuals.resolveRadioVisualsSnapshot({ queueState: stateForLoad("2026-08-19T19:00:00.000Z"), scene: currentScene });
  const replayed = visuals.resolveRadioVisualsSnapshot({ queueState: stateForLoad("2026-08-19T20:00:00.000Z"), scene: currentScene });
  assert.equal(first.visualSeed, repeated.visualSeed);
  assert.notEqual(first.visualSeed, replayed.visualSeed);

  const wheelScene = (mode, startedAt, updatedAt) => scene(mode, {
    updatedAt,
    wheelCeremony: {
      status: mode === "wheel_spinning" ? "spinning" : mode === "wheel_result" ? "result_pending" : "ready",
      storedStatus: mode === "wheel_spinning" || mode === "wheel_result" ? "spinning" : "ready",
      candidateCount: 14,
      displayCandidates: [],
      hiddenCandidateCount: 0,
      startedAt,
      spinDurationMs: 24_000,
    },
  });
  const wheelQueueState = (completedCount, acceptedCount = 14) => queueState({
    totalPlayed: completedCount,
    publicStatus: {
      ...queueState().publicStatus,
      activeCount: acceptedCount - completedCount,
      acceptedCount,
    },
    session: {
      ...queueState().session,
      activeCount: acceptedCount - completedCount,
      acceptedCount,
      completedCount,
    },
  });
  const wheelReady = visuals.resolveRadioVisualsSnapshot({ queueState: wheelQueueState(0), scene: wheelScene("wheel_ready", "2026-08-19T19:00:00.000Z", "2026-08-19T19:00:00.000Z") });
  const wheelSpinning = visuals.resolveRadioVisualsSnapshot({ queueState: wheelQueueState(7), scene: wheelScene("wheel_spinning", "2026-08-19T19:00:00.000Z", "2026-08-19T19:00:08.000Z") });
  const wheelResult = visuals.resolveRadioVisualsSnapshot({ queueState: wheelQueueState(13), scene: wheelScene("wheel_result", "2026-08-19T19:00:00.000Z", "2026-08-19T19:00:32.000Z") });
  const laterLaunch = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: wheelScene("wheel_ready", "2026-08-19T19:05:00.000Z", "2026-08-19T19:05:00.000Z") });
  assert.notEqual(wheelReady.showStage, wheelSpinning.showStage, "the continuity test must cross a queue-stage boundary");
  assert.notEqual(wheelSpinning.showStage, wheelResult.showStage, "the continuity test must cover another queue-stage boundary");
  assert.equal(wheelReady.visualSeed, wheelSpinning.visualSeed, "ready and spinning retain one portal personality across queue-count and stage changes");
  assert.equal(wheelReady.visualSeed, wheelResult.visualSeed, "result retains the ceremony portal personality across queue-count and stage changes");
  assert.notEqual(wheelReady.visualSeed, laterLaunch.visualSeed, "a later Wheel launch receives a new portal personality");
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

test("display-safe show events project Priority, playback, and Wheel state without private payloads", () => {
  const paid = entry("private-priority-id", {
    priorityUpgradeStatus: "paid",
    priorityUpgradeCheckoutCreatedAt: "2026-08-19T18:59:57.000Z",
    priorityUpgradePaidAt: "2026-08-19T18:59:59.000Z",
  });
  const state = queueState({
    queue: [paid],
    playbackDiagnostics: {
      schemaVersion: "queue_playback_lifecycle_v1",
      currentTrackId: "private-track-id",
      lifecycleState: "playing",
      lastEventAt: "2026-08-19T18:59:59.000Z",
      lastErrorCode: null,
      nextSequence: 3,
      events: [
        { sequence: 1, trackId: "private-track-id", provider: "audio", eventType: "play", lifecycleState: "playing", observedAt: "2026-08-19T18:59:58.000Z" },
        { sequence: 2, trackId: "private-track-id", provider: "audio", eventType: "skip", lifecycleState: "cleared", observedAt: "2026-08-19T18:59:59.000Z" },
      ],
    },
    session: { ...queueState().session, wheelSpinsOwed: 2 },
  });
  const snapshot = visuals.resolveRadioVisualsSnapshot({
    queueState: state,
    scene: scene("session_active", {
      wheelCeremony: {
        displayCandidates: Array.from({ length: 17 }, (_, index) => ({ id: `wheel-private-${index}`, artistName: `Private ${index}` })),
      },
    }),
    now: new Date("2026-08-19T19:00:00.000Z"),
  });
  assert.deepEqual(snapshot.signals, { intakeOpen: true, wheelSpinsOwed: 2, wheelCandidateCount: 17, broadcastPhase: "broadcast_active" });
  assert.ok(snapshot.events.some((event) => event.type === "priority_sent"));
  assert.ok(snapshot.events.some((event) => event.type === "priority_confirmed"));
  assert.ok(snapshot.events.some((event) => event.type === "track_started"));
  assert.ok(snapshot.events.some((event) => event.type === "track_skipped"));
  for (const event of snapshot.events) assert.deepEqual(Object.keys(event).sort(), ["expiresAt", "occurredAt", "seed", "type"]);
  assert.doesNotMatch(JSON.stringify(snapshot.events), /private-priority-id|private-track-id|private@example\.com|pi_private|stripe|checkout/);
  assert.doesNotMatch(JSON.stringify(snapshot), /wheel-private|Private \d+/, "only the display-safe candidate count may reach the visual source");
});

test("each event occurrence gets a stable but different visual composition and a smooth envelope", () => {
  const now = new Date("2026-08-19T19:00:02.000Z");
  const first = visualEvents.activeRadioVisualEvent({ type: "wheel_gained", occurredAt: "2026-08-19T19:00:00.000Z", nonce: "wheel-1" }, now);
  const repeated = visualEvents.activeRadioVisualEvent({ type: "wheel_gained", occurredAt: "2026-08-19T19:00:00.000Z", nonce: "wheel-1" }, now);
  const second = visualEvents.activeRadioVisualEvent({ type: "wheel_gained", occurredAt: "2026-08-19T19:00:01.000Z", nonce: "wheel-2" }, now);
  assert.ok(first && repeated && second);
  assert.deepEqual(first, repeated);
  assert.notEqual(first.seed, second.seed, "the same event type changes layout on each occurrence");
  const start = Date.parse(first.occurredAt);
  const rising = visualEvents.radioVisualEventEnvelope(first, start + 120);
  const held = visualEvents.radioVisualEventEnvelope(first, start + 2_000);
  const releasing = visualEvents.radioVisualEventEnvelope(first, Date.parse(first.expiresAt) - 180);
  assert.ok(rising > 0 && rising < held);
  assert.equal(held, 1);
  assert.ok(releasing > 0 && releasing < held);
});

test("broadcast start is inferred from the authoritative phase or intake-to-live edge, not queue activation", () => {
  const signal = (overrides = {}) => ({
    sessionActive: true,
    showStage: "intake",
    visualMode: "queue",
    sceneMode: "session_active",
    visualSeed: 17,
    intakeOpen: true,
    broadcastPhase: "submission_window",
    wheelSpinsOwed: 0,
    ...overrides,
  });
  assert.equal(visualEvents.radioVisualBroadcastStartedTransition(
    signal(),
    signal({ showStage: "early", broadcastPhase: "broadcast_active" }),
  ), true);
  assert.equal(visualEvents.radioVisualBroadcastStartedTransition(
    signal({ broadcastPhase: null }),
    signal({ showStage: "early", broadcastPhase: null }),
  ), true, "legacy snapshots still recover the intake-to-live edge");
  assert.equal(visualEvents.radioVisualBroadcastStartedTransition(
    signal(),
    signal({ showStage: "early" }),
  ), false, "an explicit non-active phase cannot masquerade as Start Broadcast");
  assert.equal(visualEvents.radioVisualBroadcastStartedTransition(
    signal({ sessionActive: false, intakeOpen: false }),
    signal({ sessionActive: true, intakeOpen: true }),
  ), false, "opening submissions is not Start Broadcast");
  assert.equal(visualEvents.radioVisualBroadcastStartedTransition(
    signal({ showStage: "early", broadcastPhase: "broadcast_active" }),
    signal({ showStage: "middle", broadcastPhase: "broadcast_active" }),
  ), false);
});

test("idle ambient moments are deterministic within a cycle and change composition across cycles", () => {
  const findMoment = (cycleStart, sessionActive) => {
    for (let offset = 0; offset < 25_000; offset += 100) {
      const moment = engine.radioVisualAmbientMoment(1_337, cycleStart + offset, sessionActive);
      if (moment) return moment;
    }
    return null;
  };
  const first = findMoment(0, false);
  const repeated = findMoment(0, false);
  const second = findMoment(25_000, false);
  assert.ok(first && repeated && second);
  assert.deepEqual(first, repeated);
  assert.notEqual(first.seed, second.seed);
  assert.ok(first.envelope > 0 && first.intensity > 0);
  assert.deepEqual(engine.RADIO_VISUAL_AMBIENT_MOMENT_TYPES, [
    "violet_bloom",
    "signal_ripple",
    "shadow_pass",
    "particle_lift",
    "barcode_shimmer",
    "prism_drift",
    "ribbon_sweep",
  ]);
});

test("music response follows the authoritative playback clock and uses direct analysis when available", () => {
  const current = entry("track-music", { sourceType: "youtube" });
  const youtube = { provider: "youtube", videoId: "abcDEF12345", trackId: current.id, playbackState: "playing", currentTimeSeconds: 24, durationSeconds: 180, updatedAt: "2026-08-19T18:59:55.000Z", muted: true };
  const state = queueState({ nowPlaying: current, loadedTrack: current });
  const timelineSnapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("now_playing", { track: { id: current.id, artistName: "Artist", trackTitle: "Track", sourceType: "youtube" }, youtube }), playerSync: youtube, now: new Date("2026-08-19T19:00:00.000Z") });
  const first = engine.radioVisualsMusicSignal(timelineSnapshot, 24, 100);
  const repeated = engine.radioVisualsMusicSignal(timelineSnapshot, 24, 100);
  const later = engine.radioVisualsMusicSignal(timelineSnapshot, 24.23, 100.23);
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, later);
  assert.equal(first.source, "timeline");
  assert.ok(first.bpm >= 84 && first.bpm <= 148);
  for (const channel of [first.energy, first.bass, first.mid, first.treble, first.beat, first.accent, first.peak, first.progress, first.phrase]) assert.ok(channel >= 0 && channel <= 1);
  assert.equal(first.progress, 24 / 180);
  assert.ok(later.progress > first.progress);
  assert.notEqual(later.phrase, first.phrase);

  const upload = entry("upload-music", { sourceType: "upload" });
  const uploadState = queueState({ nowPlaying: upload, loadedTrack: upload });
  const uploadScene = scene("now_playing", { track: { id: upload.id, artistName: "Artist", trackTitle: "Upload", sourceType: "upload" } });
  const audioSync = { provider: "audio", trackId: upload.id, playbackState: "playing", currentTimeSeconds: 12, durationSeconds: 120, updatedAt: "2026-08-19T18:59:55.000Z", muted: false, audioAnalysis: { energy: 0.88, bass: 0.94, mid: 0.7, treble: 0.42, peak: 0.97 } };
  const analysedSnapshot = visuals.resolveRadioVisualsSnapshot({ queueState: uploadState, scene: uploadScene, playerSync: audioSync, now: new Date("2026-08-19T19:00:00.000Z") });
  const analysed = engine.radioVisualsMusicSignal(analysedSnapshot, 12, 100);
  assert.equal(analysed.source, "analyser");
  assert.ok(analysed.energy > 0.65);
  assert.ok(analysed.bass > analysed.treble);
  assert.equal(analysed.progress, 0.1);

  const loopback = engine.radioVisualsMusicSignal(timelineSnapshot, 24, 100, {
    schemaVersion: "barcode_audio_signal_v1",
    source: "windows_loopback",
    capturedAtUnixMs: Date.now(),
    sequence: 19,
    captureActive: true,
    warmedUp: true,
    silence: false,
    energy: 0.82,
    bass: 0.91,
    mid: 0.63,
    treble: 0.37,
    peak: 0.94,
    beat: 0.88,
    bpm: 128,
    tempoConfidence: 0.72,
  });
  assert.equal(loopback.source, "windows_loopback");
  assert.equal(loopback.bpm, 128);
  assert.ok(loopback.bass > loopback.treble);
  assert.ok(loopback.beat > 0.7);
  assert.equal(loopback.progress, first.progress);
  assert.equal(loopback.phrase, first.phrase);

  const quietLoopback = engine.radioVisualsMusicSignal(timelineSnapshot, 24, 100, {
    schemaVersion: "barcode_audio_signal_v1",
    source: "windows_loopback",
    capturedAtUnixMs: Date.now(),
    sequence: 20,
    captureActive: true,
    warmedUp: true,
    silence: true,
    energy: 0.007,
    bass: 0.009,
    mid: 0.006,
    treble: 0.004,
    peak: 0.008,
    beat: 0,
    bpm: 112,
    tempoConfidence: 0,
  });
  assert.equal(quietLoopback.source, "windows_loopback", "low but real loopback levels must not be discarded as silence");
  assert.ok(quietLoopback.energy <= 0.005, "quiet speaker output must remain below the visual noise knee");
  assert.ok(Math.max(quietLoopback.bass, quietLoopback.mid, quietLoopback.treble, quietLoopback.beat, quietLoopback.accent) <= 0.005);
});

test("an active warmed Windows bridge owns silence continuously instead of snapping to synthetic music", () => {
  const current = entry("track-loopback-silence", { sourceType: "youtube" });
  const youtube = { provider: "youtube", videoId: "abcDEF12345", trackId: current.id, playbackState: "playing", currentTimeSeconds: 24, durationSeconds: 180, updatedAt: "2026-08-19T18:59:55.000Z", muted: true };
  const state = queueState({ nowPlaying: current, loadedTrack: current });
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("now_playing", { track: { id: current.id, artistName: "Artist", trackTitle: "Track", sourceType: "youtube" }, youtube }), playerSync: youtube, now: new Date("2026-08-19T19:00:00.000Z") });
  const atLevel = (level, sequence) => engine.radioVisualsMusicSignal(snapshot, 24, 100, {
    schemaVersion: "barcode_audio_signal_v1",
    source: "windows_loopback",
    capturedAtUnixMs: Date.now(),
    sequence,
    captureActive: true,
    warmedUp: true,
    silence: level < 0.008,
    energy: level,
    bass: level,
    mid: level,
    treble: level,
    peak: level,
    beat: 0,
    bpm: 112,
    tempoConfidence: 0,
  });
  const levels = [0, 0.004, 0.007, 0.02].map(atLevel);
  for (const signal of levels) {
    assert.equal(signal.source, "windows_loopback");
    assert.ok(Math.max(signal.energy, signal.bass, signal.mid, signal.treble, signal.beat, signal.accent, signal.peak) <= 0.03);
  }
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index].energy >= levels[index - 1].energy);
    assert.ok(levels[index].energy - levels[index - 1].energy <= 0.04);
  }
  const unavailableSignal = {
    schemaVersion: "barcode_audio_signal_v1",
    source: "windows_loopback",
    capturedAtUnixMs: Date.now(),
    sequence: 100,
    captureActive: false,
    warmedUp: false,
    silence: true,
    energy: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    peak: 0,
    beat: 0,
    bpm: 112,
    tempoConfidence: 0,
  };
  const inactiveFallback = engine.radioVisualsMusicSignal(snapshot, 24, 100, { ...unavailableSignal, warmedUp: true });
  const warmingFallback = engine.radioVisualsMusicSignal(snapshot, 24, 100, { ...unavailableSignal, captureActive: true });
  assert.equal(inactiveFallback.source, "timeline", "an inactive bridge must return control to synthetic audio");
  assert.equal(warmingFallback.source, "timeline", "a not-yet-warmed bridge must return control to synthetic audio");
});

test("Windows audio transfer suppresses quiet noise and expands loud passages", () => {
  const inputs = [0, 0.02, 0.05, 0.1, 0.2, 0.25, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
  for (const channel of ["energy", "bass", "mid", "treble"]) {
    const outputs = inputs.map((input) => engine.radioVisualLoopbackLevel(input, channel));
    assert.equal(outputs[0], 0);
    outputs.forEach((output) => assert.ok(Number.isFinite(output) && output >= 0 && output <= 1));
    for (let index = 1; index < outputs.length; index += 1) assert.ok(outputs[index] >= outputs[index - 1]);
    assert.ok(outputs[2] <= 0.035, `${channel} must not exaggerate 5% input`);
    assert.ok(outputs[3] <= 0.08, `${channel} must keep 10% input restrained`);
    assert.ok(outputs[4] >= 0.1, `${channel} must begin producing useful motion at a real 20% bridge reading`);
    assert.ok(outputs[5] >= 0.13, `${channel} must make an ordinary 25% bridge reading clearly usable`);
    assert.ok(outputs[7] >= 0.3, `${channel} must make a 45% bridge reading visibly strong`);
    assert.ok(outputs[8] >= 0.48, `${channel} must make a 60% bridge reading near-hot`);
    assert.ok(outputs[7] - outputs[5] > outputs[5] - outputs[2], `${channel} must expand higher readings more than quiet readings`);
    assert.ok(outputs[10] >= 0.86 && outputs[10] < 0.95, `${channel} must retain headroom at a 90% reading`);
    assert.equal(outputs[11], 1, `${channel} may reach full drive only at full input`);
  }
  const midpoint = engine.radioVisualLoopbackLevel(0.5, "energy");
  assert.ok(midpoint >= 0.35 && midpoint <= 0.6);
});

test("Windows levels become quiet, isolated band layers and a full-spectrum tapestry end to end", () => {
  const current = entry("track-loopback-tapestry", { sourceType: "youtube" });
  const youtube = {
    provider: "youtube",
    videoId: "abcDEF12345",
    trackId: current.id,
    playbackState: "playing",
    currentTimeSeconds: 24,
    durationSeconds: 180,
    updatedAt: "2026-08-19T18:59:55.000Z",
    muted: true,
  };
  const state = queueState({ nowPlaying: current, loadedTrack: current });
  const snapshot = visuals.resolveRadioVisualsSnapshot({
    queueState: state,
    scene: scene("now_playing", {
      track: { id: current.id, artistName: "Artist", trackTitle: "Track", sourceType: "youtube" },
      youtube,
    }),
    playerSync: youtube,
    now: new Date("2026-08-19T19:00:00.000Z"),
  });
  const bridge = {
    schemaVersion: "barcode_audio_signal_v1",
    source: "windows_loopback",
    capturedAtUnixMs: Date.now(),
    sequence: 1,
    captureActive: true,
    warmedUp: true,
    silence: false,
    energy: 0.45,
    bass: 0.05,
    mid: 0.05,
    treble: 0.05,
    peak: 0.05,
    beat: 0,
    bpm: 120,
    tempoConfidence: 0.6,
  };
  const drivesAt = (overrides) => engine.radioVisualAudioDrives(
    engine.radioVisualsMusicSignal(snapshot, 24, 100, { ...bridge, ...overrides }),
  );

  const quiet = drivesAt({ energy: 0.05 });
  assert.ok(Math.max(quiet.bassLayer, quiet.midLayer, quiet.trebleLayer, quiet.tapestry) < 0.01, "quiet bridge noise must not manufacture decorative layers");

  const bass = drivesAt({ bass: 0.25 });
  const mids = drivesAt({ mid: 0.25 });
  const treble = drivesAt({ treble: 0.25 });
  assert.ok(bass.bassLayer > 0.04 && bass.midLayer < 0.01 && bass.trebleLayer < 0.01, "ordinary bass must enter only the bass-owned layer without jumping near maximum");
  assert.ok(mids.midLayer > 0.05 && mids.bassLayer < 0.01 && mids.trebleLayer < 0.01, "ordinary mids must enter only the mid-owned layer without jumping near maximum");
  assert.ok(treble.trebleLayer > 0.08 && treble.bassLayer < 0.01 && treble.midLayer < 0.01, "ordinary treble must enter only the treble-owned layer without jumping near maximum");

  const moderate = drivesAt({ energy: 0.22, bass: 0.22, mid: 0.22, treble: 0.22, peak: 0.22 });
  const firstFullTapestry = drivesAt({ energy: 0.18, bass: 0.18, mid: 0.18, treble: 0.18, peak: 0.18 });
  const strong = drivesAt({ energy: 0.45, bass: 0.45, mid: 0.45, treble: 0.45, peak: 0.45 });
  const hot = drivesAt({ energy: 0.75, bass: 0.75, mid: 0.75, treble: 0.75, peak: 0.75 });
  const ordinaryFullHit = drivesAt({ energy: 0.45, bass: 0.45, mid: 0.45, treble: 0.45, peak: 0.45, beat: 1 });
  assert.ok(hot.bassLayer > 0.6 && hot.midLayer > 0.65 && hot.trebleLayer > 0.7);
  assert.ok(hot.tapestry > 0.58 && hot.build > 0.65, "strong full-spectrum Windows audio must assemble the combined composition with remaining headroom");
  assert.ok(ordinaryFullHit.bassPulse > 0.25, "an ordinary live bass hit must survive the complete bridge-to-renderer path");
  assert.ok(ordinaryFullHit.midPulse > 0.25, "an ordinary live mid hit must survive the complete bridge-to-renderer path");
  assert.ok(ordinaryFullHit.treblePulse > 0.25, "an ordinary live treble hit must survive the complete bridge-to-renderer path");
  assert.ok(ordinaryFullHit.tapestryPulse > 0.2, "a simultaneous live hit must build the coupled tapestry instead of leaving one band visible");
  assert.ok(
    engine.radioVisualMusicSceneVisibility(quiet) >= 0.3
      && engine.radioVisualMusicSceneVisibility(quiet) <= 0.31,
    "quiet audio keeps a visible but restrained family identity",
  );
  assert.ok(engine.radioVisualMusicSceneVisibility(moderate) > 0.36, "ordinary full-spectrum audio must survive the Studio key");
  assert.ok(engine.radioVisualMusicSceneVisibility(strong) > 0.52);
  assert.ok(engine.radioVisualMusicSceneVisibility(hot) > 0.78);
  const fullRest = drivesAt({ energy: 1, bass: 1, mid: 1, treble: 1, peak: 0, beat: 0 });
  const overload = drivesAt({ energy: 1, bass: 1, mid: 1, treble: 1, peak: 1, beat: 1 });

  const expectedIsolation = {
    bass: { bass: true, mid: false, treble: false, tapestry: false },
    mids: { bass: false, mid: true, treble: false, tapestry: false },
    treble: { bass: false, mid: false, treble: true, tapestry: false },
  };
  const profileDrives = { quiet, bass, mids, treble, firstFullTapestry, moderate, strong, hot, fullRest, overload };
  for (const musicScene of engine.RADIO_VISUAL_MUSIC_SCENES) {
    const plans = Object.fromEntries(
      Object.entries(profileDrives).map(([profile, profileDrive]) => [
        profile,
        engine.radioVisualMusicSceneLayerPlan(musicScene, profileDrive),
      ]),
    );
    assert.deepEqual(plans.quiet, { bass: 0, mid: 0, treble: 0, tapestry: 0 }, `${musicScene} must not invent audio density during silence`);
    for (const [profile, expected] of Object.entries(expectedIsolation)) {
      for (const layer of ["bass", "mid", "treble", "tapestry"]) {
        assert.equal(plans[profile][layer] > 0, expected[layer], `${musicScene} ${profile} must ${expected[layer] ? "reveal" : "withhold"} its ${layer} density budget`);
      }
    }
    assert.ok(Object.values(plans.firstFullTapestry).every((count) => count > 0), `${musicScene} must reveal bass, mids, treble, and tapestry by a restrained 18% all-band bridge reading`);
    assert.ok(Object.values(plans.moderate).every((count) => count > 0), `${musicScene} must reveal all four systems at a realistic 22% all-band bridge reading`);
    assert.ok(
      Object.values(plans.strong).reduce((sum, count) => sum + count, 0)
        > Object.values(plans.moderate).reduce((sum, count) => sum + count, 0),
      `${musicScene} must add density between ordinary and strong full-spectrum audio`,
    );
    assert.ok(Object.values(plans.hot).every((count) => count > 0), `${musicScene} must reveal all four layer systems on full-spectrum audio`);

    const limits = engine.RADIO_VISUAL_MUSIC_SCENE_LAYER_LIMITS[musicScene];
    for (const plan of Object.values(plans)) {
      for (const layer of ["bass", "mid", "treble", "tapestry"]) {
        assert.ok(plan[layer] <= limits[layer].sustained + limits[layer].pulse, `${musicScene} ${layer} must remain inside its hard density-budget ceiling`);
      }
    }
    for (const layer of ["bass", "mid", "treble", "tapestry"]) {
      if (limits[layer].pulse > 0) {
        assert.ok(plans.overload[layer] > plans.fullRest[layer], `${musicScene} ${layer} hits must add transient density above the sustained maximum`);
      }
    }
  }
});

test("Windows loopback signal contract rejects malformed and stale local data", () => {
  const now = 1_782_000_000_000;
  const valid = {
    schemaVersion: "barcode_audio_signal_v1",
    source: "windows_loopback",
    capturedAtUnixMs: now - 150,
    sequence: 42,
    captureActive: true,
    warmedUp: true,
    silence: false,
    energy: 0.72,
    bass: 0.84,
    mid: 0.55,
    treble: 0.31,
    peak: 0.9,
    beat: 1,
    bpm: 96,
    tempoConfidence: 0.64,
  };
  assert.deepEqual(audioBridge.normalizeRadioAudioBridgeSignal(valid), valid);
  assert.deepEqual(audioBridge.freshRadioAudioBridgeSignal(valid, now), valid);
  assert.equal(audioBridge.freshRadioAudioBridgeSignal({ ...valid, capturedAtUnixMs: now - 1_201 }, now), null);
  assert.equal(audioBridge.normalizeRadioAudioBridgeSignal({ ...valid, energy: 4 }), null);
  assert.equal(audioBridge.normalizeRadioAudioBridgeSignal({ ...valid, bpm: 900 }), null);
  assert.equal(audioBridge.normalizeRadioAudioBridgeSignal({ ...valid, schemaVersion: "wrong" }), null);
});

test("Windows helper is automatic, Speakers-only, loopback-bound, and built as a one-click artifact", () => {
  const helperRoot = path.join(projectRoot, "tools/barcode-audio-bridge");
  const project = fs.readFileSync(path.join(helperRoot, "Barcode.AudioBridge.csproj"), "utf8");
  const program = fs.readFileSync(path.join(helperRoot, "Program.cs"), "utf8");
  const installer = fs.readFileSync(path.join(helperRoot, "BridgeInstaller.cs"), "utf8");
  const application = fs.readFileSync(path.join(helperRoot, "BridgeApplicationContext.cs"), "utf8");
  const capture = fs.readFileSync(path.join(helperRoot, "LoopbackCaptureController.cs"), "utf8");
  const analyzer = fs.readFileSync(path.join(helperRoot, "AudioAnalyzer.cs"), "utf8");
  const server = fs.readFileSync(path.join(helperRoot, "LocalSignalServer.cs"), "utf8");
  const readme = fs.readFileSync(path.join(helperRoot, "README.md"), "utf8");
  const workflow = fs.readFileSync(path.join(projectRoot, ".github/workflows/ci.yml"), "utf8");
  const productionContract = fs.readFileSync(path.join(projectRoot, "docs/queue-production-capability.md"), "utf8");

  assert.match(project, /<TargetFramework>net8\.0-windows<\/TargetFramework>/);
  assert.match(project, /<SelfContained>true<\/SelfContained>/);
  assert.match(project, /<PublishSingleFile>true<\/PublishSingleFile>/);
  assert.match(project, /<Version>1\.0\.3<\/Version>/);
  assert.match(project, /PackageReference Include="NAudio" Version="2\.3\.0"/);
  assert.match(capture, /GetDefaultAudioEndpoint\(DataFlow\.Render, Role\.Multimedia\)/, "capture must resolve the default Windows Speakers render endpoint");
  assert.match(capture, /new WasapiLoopbackCapture\(renderDevice\)/, "capture and endpoint-volume compensation must use the same Speakers endpoint");
  assert.doesNotMatch(capture, /new (?:WaveIn|WasapiCapture)\(/, "the helper must not open a microphone capture endpoint");
  assert.match(capture, /AudioEndpointVolume\.MasterVolumeLevel/, "the helper must read the endpoint's decibel level, not the tapered scalar");
  assert.doesNotMatch(capture, /MasterVolumeLevelScalar/, "audio-tapered scalar volume must not be treated as a linear sample gain");
  assert.match(capture, /SampleGainFromEndpointDecibels[\s\S]*_analyzer\.AddSamples/, "endpoint attenuation must be removed before analysis");
  assert.match(analyzer, /Math\.Pow\(10, decibels \/ 20d\)[\s\S]*1 \/ endpointAmplitude/, "endpoint decibels must be converted to inverse linear sample gain");
  assert.match(analyzer, /EndpointVolumeCompensation\.Apply[\s\S]*AnalyzeWindow/, "normalization must happen before RMS, FFT, peak, flux, and beat analysis");
  assert.match(capture, /TouchClient\(\)[\s\S]*EnsureStarted\(\)/, "visual-source requests must wake capture automatically");
  assert.match(capture, /ClientIdleCaptureStopMilliseconds/, "capture must stop after the visual source becomes idle");
  assert.match(capture, /no Speakers audio detected[\s\S]*Speakers audio detected/, "helper status must report actual audio detection instead of capture startup");
  assert.doesNotMatch(capture, /Live — Speakers loopback is driving the visuals/, "opening WASAPI alone must not claim that music is driving visuals");
  assert.match(capture, /TrayTooltip[\s\S]*WarmedUp[\s\S]*Silence[\s\S]*LIVE audio/, "tray tooltip must reflect actual analyzed speaker audio");
  assert.match(application, /_notifyIcon\.Text = _capture\.TrayTooltip/);
  assert.doesNotMatch(application, /CaptureActive \? "BARCODE Audio Bridge — LIVE"/, "active capture without audible samples must not show a false LIVE tray tooltip");
  assert.match(analyzer, /WaveFormatExtensible[\s\S]*ToStandardWaveFormat\(\)/, "32-bit extensible PCM must not be decoded as IEEE float");
  assert.doesNotMatch(analyzer, /WaveFormatEncoding\.Extensible && format\.BitsPerSample == 32/);
  assert.match(analyzer, /_energy < 0\.008/, "quiet but audible speaker output must remain available to the visuals");
  assert.match(server, /new TcpListener\(IPAddress\.Loopback, BridgeConstants\.Port\)/, "the signal endpoint must never bind to the LAN");
  assert.match(server, /Access-Control-Allow-Private-Network: true/);
  assert.match(server, /www\.barcode-network\.com|barcode-network\.com/);
  assert.match(server, /barcode-network-site-cpps\.vercel\.app|-6-bits-projects\.vercel\.app/);
  assert.match(server, /ReportBrowserHandshake/, "the tray status must distinguish browser handshake failures from silence");
  assert.match(installer, /Registry\.CurrentUser[\s\S]*CurrentVersion\\Run/, "autostart must be scoped to the current Windows user");
  assert.match(installer, /StopInstalledInstance\(\)[\s\S]*process\.Kill\(entireProcessTree: true\)/, "running v1 installs must be replaced immediately by the one-click update");
  assert.match(program, /BridgeInstaller\.InstallAndLaunch\(\)/);
  assert.doesNotMatch(program, /capture button|Select.*device/i);
  assert.match(readme, /There is no capture button/);
  assert.match(readme, /No audio samples leave the computer/);
  assert.match(readme, /program signal rather than the operator's Windows listening level/);
  assert.match(workflow, /windows-audio-bridge:[\s\S]*dotnet test tools\/barcode-audio-bridge\.Tests[\s\S]*dotnet publish[\s\S]*BARCODE\.AudioBridge\.exe/);
  assert.match(productionContract, /BARCODE Audio Bridge[\s\S]*WASAPI loopback[\s\S]*volume-neutral program signal[\s\S]*creates no Redis or Vercel traffic/);
});

test("direct audio analysis separates frequency bands and safely bounds untrusted samples", () => {
  const bins = new Uint8Array(512);
  bins.fill(220, 1, 6);
  bins.fill(130, 6, 52);
  bins.fill(65, 52, 300);
  const analysis = audioVisuals.analyzeRadioVisualFrequencyData(bins, 48_000, 1_024);
  assert.ok(analysis);
  assert.ok(analysis.bass > analysis.mid && analysis.mid > analysis.treble);
  assert.ok(analysis.peak > analysis.energy);
  assert.deepEqual(liveOverlay.normalizeRadioVisualAudioAnalysis({ energy: 3, bass: -1, mid: 0.5, treble: 0.25, peak: 2 }), { energy: 1, bass: 0, mid: 0.5, treble: 0.25, peak: 1 });
  assert.equal(liveOverlay.normalizeRadioVisualAudioAnalysis({ energy: "loud" }), null);
});

test("the effect palette preserves BARCODE green, violet, black, and white while excluding the orange key", () => {
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: scene() });
  const palette = engine.radioVisualsPalette(snapshot);
  assert.equal(engine.RADIO_VISUALS_CHROMA_KEY, "#ff5a00");
  assert.match([palette.primary, palette.secondary].join(" "), /#00ff88/);
  assert.match([palette.primary, palette.secondary, palette.highlight].join(" "), /#7c3aed|#a78bfa/);
  assert.match(palette.highlight, /#e0e0e0|#ffffff|#a78bfa/);
  assert.match(palette.shadow, /#0[235]0[235]0[235]/);
  assert.doesNotMatch(JSON.stringify(palette), /#ff5a00/);
});

test("every scene palette survives the Studio orange key with restrained green and violet accents", () => {
  const base = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: scene() });
  const key = [255, 90, 0];
  const parseHex = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const keyDistanceAfterBlend = (hex, alpha = 0.4) => {
    const color = parseHex(hex);
    const composited = color.map((channel, index) => channel * alpha + key[index] * (1 - alpha));
    return Math.hypot(...composited.map((channel, index) => channel - key[index]));
  };
  const modes = ["queue", "track", "wheel", "system"];
  for (const visualMode of modes) {
    for (let visualSeed = 0; visualSeed < 32; visualSeed += 1) {
      const palette = engine.radioVisualsPalette({ ...base, visualMode, visualSeed });
      const serialized = JSON.stringify(palette).toLowerCase();
      assert.doesNotMatch(serialized, /#ff5a00|#00e5ff|#00ffff/);
      for (const color of Object.values(palette)) {
        assert.ok(keyDistanceAfterBlend(color) >= 72, `${visualMode} ${color} must remain distinct from the orange key`);
      }
    }
  }
});

test("music scene selection is deterministic and spans ten genuinely different families", () => {
  assert.deepEqual(engine.RADIO_VISUAL_MUSIC_SCENES, [
    "edge_spectrum",
    "oscilloscope_ribbons",
    "tape_feedback",
    "matrix_rain",
    "ascii_terminal",
    "pixel_sort_storm",
    "lightning_switchyard",
    "laser_lattice",
    "particle_pressure",
    "signal_constellation",
  ]);
  for (let seed = 0; seed < 32; seed += 1) {
    assert.equal(engine.radioVisualMusicScene(seed), engine.radioVisualMusicScene(seed));
  }
  const selected = new Set(Array.from({ length: 512 }, (_, seed) => engine.radioVisualMusicScene(seed)));
  assert.deepEqual([...selected].sort(), [...engine.RADIO_VISUAL_MUSIC_SCENES].sort());
});

test("broadcast FX exhaust a twelve-effect shuffle bag before repeating", () => {
  assert.equal(engine.RADIO_VISUAL_BROADCAST_FX_TYPES.length, 12);
  for (const seed of [17, 43120, 2166136261]) {
    for (let bag = 0; bag < 5; bag += 1) {
      const types = Array.from({ length: 12 }, (_, offset) => (
        engine.radioVisualBroadcastFxTypeForOccurrence(seed, bag * 12 + offset)
      ));
      assert.deepEqual([...new Set(types)].sort(), [...engine.RADIO_VISUAL_BROADCAST_FX_TYPES].sort());
    }
    const sequence = Array.from({ length: 72 }, (_, occurrence) => (
      engine.radioVisualBroadcastFxTypeForOccurrence(seed, occurrence)
    ));
    for (let occurrence = 1; occurrence < sequence.length; occurrence += 1) {
      assert.notEqual(sequence[occurrence], sequence[occurrence - 1], `seed ${seed} occurrence ${occurrence} cannot repeat its neighbor`);
    }
  }
});

test("broadcast FX cadence is deterministic, audio-earned, center-bounded, and intake-safe", () => {
  const signal = (level) => engine.radioVisualAudioDrives({
    source: "windows_loopback",
    bpm: 120,
    energy: level,
    bass: level,
    mid: level,
    treble: level,
    beat: level,
    accent: level,
    peak: level,
    progress: 0.4,
    phrase: 0.25,
  });
  const quiet = signal(0.04);
  const hot = signal(0.9);
  const planAt = (time, drives = quiet, overrides = {}) => engine.radioVisualBroadcastFxPlan({
    time,
    seed: 43120,
    sessionActive: true,
    showStage: "middle",
    sceneMix: 1,
    drives,
    cueType: null,
    ...overrides,
  });
  let activeTime = null;
  let inactiveTime = null;
  for (let tick = 0; tick < 2_000; tick += 1) {
    const time = tick / 100;
    const plan = planAt(time);
    if (plan.active && activeTime === null) activeTime = time;
    if (!plan.active && inactiveTime === null) inactiveTime = time;
    if (activeTime !== null && inactiveTime !== null) break;
  }
  assert.notEqual(activeTime, null);
  assert.notEqual(inactiveTime, null);
  const quietActive = planAt(activeTime, quiet);
  const hotActive = planAt(activeTime, hot);
  assert.equal(hotActive.type, quietActive.type, "audio cannot change the scheduled effect identity");
  assert.equal(hotActive.occurrenceIndex, quietActive.occurrenceIndex, "audio cannot change effect cadence");
  assert.equal(hotActive.progress, quietActive.progress, "audio cannot reopen a fixed effect window");
  assert.ok(hotActive.strength > quietActive.strength, "real audio must strengthen the scheduled artifact");
  assert.ok(hotActive.centerStrength <= 0.26 && hotActive.centerPrimitiveBudget <= 8);
  assert.ok(planAt(inactiveTime).crtStrength > 0, "a subtle cached CRT bed remains alive between featured artifacts");
  const intake = planAt(activeTime, hot, { showStage: "intake" });
  assert.equal(intake.active, false);
  assert.equal(intake.crtStrength, 0);
  const cue = planAt(activeTime, hot, { cueType: "lightning" });
  assert.equal(cue.centerAllowed, false, "manual cues retain performer-window priority");
  assert.equal(cue.centerStrength, 0);
});

test("music evolution stays bounded while bass, mids, treble, phrase, and song arc own different motion", () => {
  const baseSignal = {
    source: "windows_loopback",
    bpm: 120,
    energy: 0.45,
    bass: 0.05,
    mid: 0.05,
    treble: 0.05,
    beat: 0,
    accent: 0,
    peak: 0,
    progress: 0.32,
    phrase: 0.2,
  };
  const quiet = engine.radioVisualAudioDrives(baseSignal);
  const bass = engine.radioVisualAudioDrives({ ...baseSignal, bass: 0.9, beat: 1 });
  const mids = engine.radioVisualAudioDrives({ ...baseSignal, mid: 0.9, accent: 1 });
  const treble = engine.radioVisualAudioDrives({ ...baseSignal, treble: 0.9, peak: 1 });
  const signatures = new Set();
  for (const musicScene of engine.RADIO_VISUAL_MUSIC_SCENES) {
    const still = engine.radioVisualMusicEvolutionPlan(musicScene, 8317, 11.3, quiet);
    const bassPlan = engine.radioVisualMusicEvolutionPlan(musicScene, 8317, 11.3, bass);
    const midPlan = engine.radioVisualMusicEvolutionPlan(musicScene, 8317, 11.3, mids);
    const treblePlan = engine.radioVisualMusicEvolutionPlan(musicScene, 8317, 11.3, treble);
    assert.ok(still.scaleX >= 0.955 && still.scaleX <= 1.075);
    assert.ok(bassPlan.scaleY >= 0.955 && bassPlan.scaleY <= 1.075);
    assert.ok(bassPlan.pulse > still.pulse + 0.3, `${musicScene} bass impact must own a material pulse`);
    assert.ok(bassPlan.lineWeight > still.lineWeight && bassPlan.reach > still.reach, `${musicScene} bass must thicken and extend its geometry`);
    assert.ok(Math.abs(midPlan.translateXRatio) + Math.abs(midPlan.translateYRatio) >= Math.abs(still.translateXRatio) + Math.abs(still.translateYRatio), `${musicScene} mids must own drift`);
    assert.ok(Math.abs(midPlan.rotation - still.rotation) > 0.00001, `${musicScene} mids must own bounded tilt within the progress-driven lifecycle pose`);
    assert.ok(treblePlan.hueBlend > still.hueBlend && treblePlan.motionRate > still.motionRate, `${musicScene} treble must own hue and phase speed`);
    assert.ok(Math.abs(midPlan.translateXRatio) <= 0.014 && Math.abs(midPlan.translateYRatio) <= 0.014);
    assert.ok(Math.abs(midPlan.rotation) <= 0.05 && treblePlan.hueBlend <= 0.62 && treblePlan.motionRate <= 1.95);
    assert.ok(Math.abs(midPlan.shearX) <= 0.06 && Math.abs(midPlan.shearY) <= 0.06 && treblePlan.jitter <= 1);
    signatures.add(`${bassPlan.variant}:${[
      bassPlan.scaleX,
      midPlan.translateXRatio,
      midPlan.rotation,
      treblePlan.hueBlend,
      treblePlan.motionRate,
    ].map((value) => value.toFixed(5)).join(":")}`);
  }
  assert.equal(signatures.size, engine.RADIO_VISUAL_MUSIC_SCENES.length, "all ten families must evolve with different motion profiles");

  const start = engine.radioVisualMusicEvolutionPlan("signal_constellation", 8317, 3, { ...quiet, progress: 0.05, phrase: 0.1 });
  const later = engine.radioVisualMusicEvolutionPlan("signal_constellation", 8317, 31, { ...quiet, progress: 0.72, phrase: 0.8 });
  assert.notEqual(start.sectionIndex, later.sectionIndex, "the long song arc must advance without changing family identity");
  assert.notEqual(start.translateXRatio, later.translateXRatio, "phrase and elapsed motion must keep the selected family alive");
});

test("music evolution converts real hits and section energy into bounded pulse, glow, weight, reach, and deformation", () => {
  const steady = {
    presence: 0.62,
    body: 0.58,
    bass: 0.54,
    mid: 0.6,
    treble: 0.56,
    bassLayer: 0.48,
    midLayer: 0.52,
    trebleLayer: 0.46,
    tapestry: 0.4,
    impact: 0,
    bassPulse: 0,
    midPulse: 0,
    treblePulse: 0,
    tapestryPulse: 0,
    build: 0.42,
    progress: 0.5,
    phrase: 0.35,
  };
  const hardHit = {
    ...steady,
    impact: 1,
    bassPulse: 1,
    midPulse: 0.88,
    treblePulse: 0.92,
    tapestryPulse: 0.84,
  };
  const signatures = new Set();
  for (const musicScene of engine.RADIO_VISUAL_MUSIC_SCENES) {
    const calm = engine.radioVisualMusicEvolutionPlan(musicScene, 7_731, 12.25, steady, 120);
    const hit = engine.radioVisualMusicEvolutionPlan(musicScene, 7_731, 12.25, hardHit, 120);
    assert.ok(hit.hardBeat > 0.98, `${musicScene} must recognize an analyser-earned hard beat`);
    assert.ok(hit.beatPunch > calm.beatPunch + 0.7, `${musicScene} must punch harder on the detected hit`);
    assert.ok(hit.pulse > calm.pulse + 0.45, `${musicScene} must visibly pulse rather than only translate`);
    assert.ok(hit.lineWeight > calm.lineWeight + 0.3, `${musicScene} must thicken on impact`);
    assert.ok(hit.reach > calm.reach + 0.12, `${musicScene} must extend on impact`);
    assert.ok(hit.glowBloom > calm.glowBloom + 0.12, `${musicScene} must bloom on impact`);
    assert.ok(hit.deformation > calm.deformation, `${musicScene} must change shape on impact`);
    assert.ok(hit.movementBurst > calm.movementBurst, `${musicScene} may earn additional movement on impact`);
    assert.ok(hit.lineWeight >= 0.68 && hit.lineWeight <= 2.25);
    assert.ok(hit.reach >= 0.7 && hit.reach <= 1.5);
    assert.ok(hit.scaleX >= 0.955 && hit.scaleX <= 1.075);
    assert.ok(hit.scaleY >= 0.955 && hit.scaleY <= 1.075);
    assert.ok(calm.movementBurst >= 0.04, `${musicScene} must retain subtle baseline motion without imitating a hit`);
    signatures.add([
      hit.variant,
      hit.breath.toFixed(3),
      hit.lineWeight.toFixed(3),
      hit.reach.toFixed(3),
      hit.glowBloom.toFixed(3),
      hit.deformation.toFixed(3),
      hit.movementBurst.toFixed(3),
    ].join(":"));
  }
  assert.equal(signatures.size, 10, "all ten families must keep distinct modulation signatures");

  const tempoOnly = engine.radioVisualMusicEvolutionPlan("edge_spectrum", 7_731, 12, steady, 120);
  assert.equal(tempoOnly.hardBeat, 0, "the mathematical tempo clock cannot fabricate a hard analyser beat");
  assert.ok(tempoOnly.beatPunch > 0, "tempo may still provide a subtle breathing cadence");

  const silent = Object.fromEntries(Object.keys(steady).map((key) => [key, 0]));
  silent.progress = 0.125;
  const silentSection = engine.radioVisualMusicEvolutionPlan("laser_lattice", 7_731, 12.25, silent, 120);
  const liveSection = engine.radioVisualMusicEvolutionPlan("laser_lattice", 7_731, 12.25, { ...steady, progress: 0.125 }, 120);
  assert.equal(silentSection.sectionSurge, 0, "silence cannot manufacture a section surge");
  assert.ok(liveSection.sectionSurge > 0.05, "audible section energy must create a lifecycle swell");
});

test("quiet structure stays restrained while bass, snare-like mids, treble, and full-band hits own separate events", () => {
  const signal = (overrides = {}) => ({
    source: "windows_loopback",
    bpm: 122,
    energy: 0.12,
    bass: 0.1,
    mid: 0.11,
    treble: 0.09,
    beat: 0,
    accent: 0,
    peak: 0,
    progress: 0.42,
    phrase: 0.3,
    ...overrides,
  });
  const plan = (overrides = {}) => engine.radioVisualMusicEvolutionPlan(
    "tape_feedback",
    9_911,
    17.25,
    engine.radioVisualAudioDrives(signal(overrides)),
    122,
  );
  const quiet = plan();
  const sustained = plan({ energy: 0.86, bass: 0.82, mid: 0.86, treble: 0.8 });
  const bass = plan({ energy: 0.64, bass: 0.92, beat: 1 });
  const mids = plan({ energy: 0.64, mid: 0.92, accent: 1 });
  const treble = plan({ energy: 0.64, treble: 0.92, peak: 1 });
  const tapestry = plan({ energy: 0.92, bass: 0.92, mid: 0.92, treble: 0.92, beat: 1, accent: 1, peak: 1 });

  assert.ok(quiet.structureLevel < 0.03 && quiet.pulse < 0.02, "a quiet opening cannot start near the maximum additive state");
  assert.ok(sustained.structureLevel > 0.9 && sustained.reach > quiet.reach + 0.18, "sustained loudness must grow the structure without fabricating a hit");
  assert.equal(sustained.bassImpact, 0);
  assert.equal(sustained.midImpact, 0);
  assert.equal(sustained.trebleImpact, 0);
  assert.ok(bass.bassImpact > 0.98 && bass.midImpact === 0 && bass.trebleImpact === 0, "a bass onset must only fire pressure");
  assert.ok(bass.lineWeight > quiet.lineWeight + 0.55 && bass.reach > quiet.reach + 0.25, "bass pressure must thicken and extend geometry");
  assert.ok(mids.midImpact > 0.98 && mids.snareFlash > 0.7 && mids.bassImpact === 0 && mids.trebleImpact === 0, "a mid onset must own the snare-like flash");
  assert.ok(mids.deformation > quiet.deformation + 0.25, "the mid event must illuminate and reshape rather than only translate");
  assert.ok(treble.trebleImpact > 0.98 && treble.bassImpact === 0 && treble.midImpact === 0, "a high onset must only fire sparkle/glow");
  assert.ok(treble.glowBloom > quiet.glowBloom + 0.3, "treble must materially bloom the glow system");
  assert.ok(tapestry.tapestryImpact > 0.98 && tapestry.pulse > 0.9, "a simultaneous three-band onset must fire the coordinated tapestry burst");
});

test("all ten music families have authored origin, mutation, and finale forms paced by tempo", () => {
  const signal = {
    source: "windows_loopback",
    bpm: 120,
    energy: 0.72,
    bass: 0.68,
    mid: 0.74,
    treble: 0.7,
    beat: 0,
    accent: 0,
    peak: 0,
    progress: 0,
    phrase: 0.25,
  };
  const steady = {
    ...engine.radioVisualAudioDrives(signal),
    bassPulse: 0,
    midPulse: 0,
    treblePulse: 0,
    tapestryPulse: 0,
    impact: 0,
  };
  const variants = new Set();
  const endSignatures = new Set();
  for (const musicScene of engine.RADIO_VISUAL_MUSIC_SCENES) {
    const origin = engine.radioVisualMusicEvolutionPlan(musicScene, 2_611, 12, { ...steady, progress: 0.01 }, 120);
    const mutation = engine.radioVisualMusicEvolutionPlan(musicScene, 2_611, 12, { ...steady, progress: 0.5 }, 120);
    const finale = engine.radioVisualMusicEvolutionPlan(musicScene, 2_611, 12, { ...steady, progress: 0.98 }, 120);
    assert.equal(origin.lifecycleAct, "origin");
    assert.equal(mutation.lifecycleAct, "mutation");
    assert.equal(finale.lifecycleAct, "finale");
    assert.ok(origin.metamorphosis < 0.01, `${musicScene} must establish a readable original form`);
    assert.ok(mutation.metamorphosis > 0.3 && mutation.metamorphosis < 0.7, `${musicScene} must visibly transform through the middle`);
    assert.ok(finale.metamorphosis > 0.98 && finale.finale > 0.98, `${musicScene} must arrive at its authored final form`);
    assert.ok(finale.shapeMorph > origin.shapeMorph + 0.45, `${musicScene} finale must change geometry, not only drift the original`);
    assert.ok(finale.hueBlend > origin.hueBlend + 0.08, `${musicScene} finale must earn a changed palette`);
    assert.ok(Math.abs(finale.motionRate - origin.motionRate) > 0.2, `${musicScene} lifecycle must materially change its motion character`);
    variants.add(finale.variant);
    endSignatures.add([
      finale.variant,
      finale.motionRate.toFixed(3),
      finale.jitter.toFixed(3),
      finale.rotation.toFixed(3),
      finale.shearX.toFixed(3),
      finale.shearY.toFixed(3),
    ].join(":"));
  }
  assert.equal(variants.size, 10, "every music family must own a different final-form geometry");
  assert.equal(endSignatures.size, 10, "every music family must finish with a distinct motion language");

  const onBeat = engine.radioVisualMusicEvolutionPlan("edge_spectrum", 2_611, 12, { ...steady, progress: 0.8 }, 120);
  const offBeat = engine.radioVisualMusicEvolutionPlan("edge_spectrum", 2_611, 12.25, { ...steady, progress: 0.8 }, 120);
  assert.ok(onBeat.tempoPulse > offBeat.tempoPulse + 0.04, "detected BPM may pace subtle lifecycle breathing without imitating a real transient");
});

test("signal-derived musical gesture hints distinguish vocal, melodic, and instrumental patterns", () => {
  const base = engine.radioVisualAudioDrives({
    source: "windows_loopback",
    bpm: 120,
    energy: 0.7,
    bass: 0.2,
    mid: 0.7,
    treble: 0.35,
    beat: 0,
    accent: 0.2,
    peak: 0.1,
    progress: 0.4,
    phrase: 0.3,
  });
  assert.equal(engine.radioVisualMusicGesturePlan({ ...base, midLayer: 0.9, midPulse: 0.35, trebleLayer: 0.2, treblePulse: 0.05, bassPulse: 0 }).gesture, "vocal_pattern");
  assert.equal(engine.radioVisualMusicGesturePlan({ ...base, midLayer: 0.25, trebleLayer: 0.7, midPulse: 0.85, treblePulse: 1, bassPulse: 0 }).gesture, "melodic_lift");
  assert.equal(engine.radioVisualMusicGesturePlan({ ...base, midLayer: 0.08, midPulse: 0.05, trebleLayer: 0.65, treblePulse: 0.7, bassPulse: 1, tapestry: 1, build: 1 }).gesture, "instrumental_break");
});

test("all ten music families retain a distinct bounded perimeter identity from quiet through full audio", () => {
  const signal = (level, overrides = {}) => ({
    source: "windows_loopback",
    bpm: 120,
    energy: level,
    bass: level,
    mid: level,
    treble: level,
    beat: level,
    accent: level,
    peak: level,
    progress: 0.35,
    phrase: 0.4,
    ...overrides,
  });
  const quiet = engine.radioVisualAudioDrives(signal(0));
  const hot = engine.radioVisualAudioDrives(signal(0.9));
  const motifs = new Set();

  for (const musicScene of engine.RADIO_VISUAL_MUSIC_SCENES) {
    const quietPlan = engine.radioVisualMusicPerimeterPlan(musicScene, quiet);
    const hotPlan = engine.radioVisualMusicPerimeterPlan(musicScene, hot);
    motifs.add(quietPlan.motif);

    assert.equal(quietPlan.motif, engine.RADIO_VISUAL_MUSIC_PERIMETER_MOTIFS[musicScene]);
    assert.equal(hotPlan.motif, quietPlan.motif, `${musicScene} cannot change perimeter language with volume`);
    assert.ok(quietPlan.strength >= 0.52 && quietPlan.strength <= 0.56, `${musicScene} must retain a restrained edge identity at silence`);
    assert.ok(hotPlan.strength > quietPlan.strength && hotPlan.strength <= 1, `${musicScene} must brighten with real audio`);
    assert.ok(quietPlan.reach >= 0.032 && hotPlan.reach <= 0.155 && hotPlan.reach > quietPlan.reach * 2, `${musicScene} must earn inward expansion while remaining inside its bounded perimeter band`);
    assert.ok(quietPlan.thickness >= 0.0025 && hotPlan.thickness <= 0.014 && hotPlan.thickness > quietPlan.thickness * 2, `${musicScene} must gain bass-owned weight without flooding the stage`);
    assert.ok(quietPlan.bassElements >= 1 && hotPlan.bassElements <= 10 && hotPlan.bassElements >= quietPlan.bassElements * 4);
    assert.ok(quietPlan.midElements >= 2 && hotPlan.midElements <= 14 && hotPlan.midElements >= quietPlan.midElements * 3);
    assert.ok(quietPlan.trebleElements >= 2 && hotPlan.trebleElements <= 18 && hotPlan.trebleElements >= quietPlan.trebleElements * 4);
    assert.equal(quietPlan.tapestryElements, 0, `${musicScene} cannot fabricate an all-band perimeter layer at silence`);
    assert.ok(hotPlan.tapestryElements >= 1 && hotPlan.tapestryElements <= 6, `${musicScene} must add a bounded all-band lock when the full song arrives`);
  }

  assert.equal(motifs.size, engine.RADIO_VISUAL_MUSIC_SCENES.length, "every music family must own a different perimeter silhouette");
});

test("perimeter plans preserve independent bass, mid, and treble ownership", () => {
  const drives = (overrides = {}) => engine.radioVisualAudioDrives({
    source: "windows_loopback",
    bpm: 120,
    energy: 0.45,
    bass: 0,
    mid: 0,
    treble: 0,
    beat: 0,
    accent: 0,
    peak: 0,
    progress: 0.4,
    phrase: 0.3,
    ...overrides,
  });
  const base = engine.radioVisualMusicPerimeterPlan("signal_constellation", drives());
  const bass = engine.radioVisualMusicPerimeterPlan("signal_constellation", drives({ bass: 0.8, beat: 0.8 }));
  const mids = engine.radioVisualMusicPerimeterPlan("signal_constellation", drives({ mid: 0.8, accent: 0.8 }));
  const treble = engine.radioVisualMusicPerimeterPlan("signal_constellation", drives({ treble: 0.8, peak: 0.8 }));

  assert.ok(bass.bassDrive > base.bassDrive && bass.thickness > base.thickness && bass.bassElements > base.bassElements);
  assert.ok(mids.midDrive > base.midDrive && mids.reach > base.reach && mids.midElements > base.midElements);
  assert.ok(treble.trebleDrive > base.trebleDrive && treble.reach > base.reach && treble.trebleElements > base.trebleElements);
  assert.equal(bass.tapestryElements, 0);
  assert.equal(mids.tapestryElements, 0);
  assert.equal(treble.tapestryElements, 0);
});

test("the receiver renders every planned identity outside the unchanged performer window", () => {
  const receiver = fs.readFileSync(path.join(projectRoot, "src/components/RadioVisualsReceiver.tsx"), "utf8");
  const perimeterRenderer = receiver.slice(
    receiver.indexOf("function perimeterRectanglePoint"),
    receiver.indexOf("function drawSeededMusicScene"),
  );
  for (const motif of Object.values(engine.RADIO_VISUAL_MUSIC_PERIMETER_MOTIFS)) {
    assert.match(perimeterRenderer, new RegExp(`plan\\.motif === ["']${motif}["']`), `${motif} must own an explicit Canvas branch`);
  }
  assert.match(receiver, /drawSeededMusicScene[\s\S]*drawMusicPerimeterIdentity\([\s\S]*radioVisualMusicPerimeterPlan\(scene, drives\)/, "every selected family must render its tested perimeter plan");
  assert.match(receiver, /if \(snapshot\.showStage !== "intake"\) applyPerformerSafeField\(context, width, height, 0\.2\)/, "the center retention must remain at the approved twenty percent");
  assert.doesNotMatch(perimeterRenderer, /applyPerformerSafeField|applyPerformerIntrusionField|destination-in/, "perimeter identity cannot weaken or bypass the center mask");
});

test("live audio drives preserve broadband mass, independent band layers, transients, and an all-band tapestry", () => {
  const base = {
    source: "windows_loopback",
    bpm: 120,
    energy: 0.6,
    bass: 0.05,
    mid: 0.05,
    treble: 0.05,
    beat: 0,
    accent: 0,
    peak: 0.1,
    progress: 0.2,
    phrase: 0.25,
  };
  const bodyOnly = engine.radioVisualAudioDrives({ ...base, energy: 0.9 });
  assert.equal(bodyOnly.body, 0.9, "broadband energy must retain visible composition mass without another compressor");
  assert.ok(Math.max(bodyOnly.bass, bodyOnly.mid, bodyOnly.treble) <= 0.05, "energy must not pretend every frequency band is loud");

  const bass = engine.radioVisualAudioDrives({ ...base, bass: 0.95, mid: 0, treble: 0 });
  const mids = engine.radioVisualAudioDrives({ ...base, bass: 0, mid: 0.95, treble: 0 });
  const treble = engine.radioVisualAudioDrives({ ...base, bass: 0, mid: 0, treble: 0.95 });
  assert.ok(bass.bass > bass.mid + 0.6 && bass.bass > bass.treble + 0.6);
  assert.ok(mids.mid > mids.bass + 0.6 && mids.mid > mids.treble + 0.6);
  assert.ok(treble.treble > treble.bass + 0.6 && treble.treble > treble.mid + 0.6);
  assert.ok(bass.bassLayer > 0.9 && bass.midLayer < 0.08 && bass.trebleLayer < 0.08);
  assert.ok(mids.midLayer > 0.9 && mids.bassLayer < 0.08 && mids.trebleLayer < 0.08);
  assert.ok(treble.trebleLayer > 0.9 && treble.bassLayer < 0.08 && treble.midLayer < 0.08);
  assert.ok(Math.max(bass.tapestry, mids.tapestry, treble.tapestry) < 0.02, "one loud band must not counterfeit the combined layer");

  const bassHit = engine.radioVisualAudioDrives({ ...base, bass: 0.95, beat: 1 });
  const midHit = engine.radioVisualAudioDrives({ ...base, mid: 0.95, accent: 1 });
  const trebleHit = engine.radioVisualAudioDrives({ ...base, treble: 0.95, peak: 1 });
  assert.ok(bassHit.bassPulse > 0.9 && bassHit.midPulse < 0.1 && bassHit.treblePulse < 0.1);
  assert.ok(midHit.midPulse > 0.9 && midHit.bassPulse < 0.1 && midHit.treblePulse < 0.1);
  assert.ok(trebleHit.treblePulse > 0.9 && trebleHit.bassPulse < 0.1 && trebleHit.midPulse < 0.1);

  const mixedBed = { ...base, energy: 0.6, bass: 0.6, mid: 0.6, treble: 0.6, peak: 0 };
  const mixedRest = engine.radioVisualAudioDrives(mixedBed);
  const mixedBassHit = engine.radioVisualAudioDrives({ ...mixedBed, beat: 1 });
  const mixedMidHit = engine.radioVisualAudioDrives({ ...mixedBed, accent: 1 });
  const mixedTrebleHit = engine.radioVisualAudioDrives({ ...mixedBed, peak: 1 });
  assert.ok(mixedBassHit.bassPulse > mixedBassHit.midPulse + 0.3 && mixedBassHit.bassPulse > mixedBassHit.treblePulse + 0.3, "a bass hit must not fire the mid or treble transient layer");
  assert.ok(mixedMidHit.midPulse > mixedMidHit.bassPulse + 0.3 && mixedMidHit.midPulse > mixedMidHit.treblePulse + 0.3, "a mid hit must not fire the bass or treble transient layer");
  assert.ok(mixedTrebleHit.treblePulse > mixedTrebleHit.bassPulse + 0.3 && mixedTrebleHit.treblePulse > mixedTrebleHit.midPulse + 0.3, "a treble hit must not fire the bass or mid transient layer");
  assert.ok(mixedRest.tapestry > 0.45 && mixedRest.tapestryPulse < 0.01, "steady full-spectrum audio is a sustained tapestry with headroom, not a permanent transient flash");
  const coupledHit = engine.radioVisualAudioDrives({ ...mixedBed, beat: 1, accent: 1, peak: 1 });
  assert.ok(coupledHit.tapestryPulse > 0.3, "a simultaneous three-band hit must fire the coupled transient layer");

  const quietEarly = engine.radioVisualAudioDrives({ ...base, energy: 0, bass: 0, mid: 0, treble: 0, peak: 0, progress: 0, phrase: 0 });
  const quietLate = engine.radioVisualAudioDrives({ ...base, energy: 0, bass: 0, mid: 0, treble: 0, peak: 0, progress: 1, phrase: 1 });
  assert.equal(quietEarly.build, 0);
  assert.equal(quietLate.build, 0, "timeline chronology must never manufacture density during silence");

  const allHigh = engine.radioVisualAudioDrives({ ...base, energy: 0.9, bass: 0.9, mid: 0.9, treble: 0.9 });
  assert.ok(allHigh.bassLayer > 0.9 && allHigh.midLayer > 0.9 && allHigh.trebleLayer > 0.9);
  assert.ok(allHigh.tapestry > 0.85 && allHigh.build > 0.8, "all three bands together must reveal the combined tapestry layer");
  assert.ok(allHigh.tapestryPulse < 0.01, "sustained all-band energy must not masquerade as a transient overload");
  assert.ok(allHigh.tapestry > Math.max(bass.tapestry, mids.tapestry, treble.tapestry) + 0.8);
});

test("band onsets hit independently and structural build releases gradually", () => {
  const base = {
    source: "windows_loopback",
    bpm: 120,
    energy: 0.5,
    bass: 0.05,
    mid: 0.05,
    treble: 0.05,
    beat: 0,
    accent: 0,
    peak: 0.05,
    progress: 0.2,
    phrase: 0.25,
  };
  const initial = engine.radioVisualAudioReactionInitialState();
  const bassHit = engine.advanceRadioVisualAudioReaction(initial, { ...base, bass: 0.9 }, 16);
  const midHit = engine.advanceRadioVisualAudioReaction(initial, { ...base, mid: 0.9 }, 16);
  const trebleHit = engine.advanceRadioVisualAudioReaction(initial, { ...base, treble: 0.9 }, 16);
  assert.ok(bassHit.drives.bassPulse > bassHit.drives.midPulse + 0.6 && bassHit.drives.bassPulse > bassHit.drives.treblePulse + 0.6);
  assert.ok(midHit.drives.midPulse > midHit.drives.bassPulse + 0.6 && midHit.drives.midPulse > midHit.drives.treblePulse + 0.6);
  assert.ok(trebleHit.drives.treblePulse > trebleHit.drives.bassPulse + 0.6 && trebleHit.drives.treblePulse > trebleHit.drives.midPulse + 0.6);

  let settledBass = bassHit;
  for (let step = 0; step < 240; step += 1) {
    settledBass = engine.advanceRadioVisualAudioReaction(settledBass.state, { ...base, bass: 0.9 }, 1_000 / 60);
  }
  const sustainedBass = engine.radioVisualAudioDrives({ ...base, bass: 0.9 });
  assert.ok(settledBass.state.bassOnset < bassHit.state.bassOnset * 0.05, "a sustained bass bed must stop looking like a new hit");
  assert.ok(Math.abs(settledBass.drives.bassPulse - sustainedBass.bassPulse) < 0.02, "rendered bass pulse must settle to the sustained-band response");

  const highBuildSignal = { ...base, energy: 0.9, bass: 0.8, mid: 0.8, treble: 0.8, progress: 0.5, phrase: 0.5 };
  const lowBuildSignal = { ...base, energy: 0.1, bass: 0.05, mid: 0.05, treble: 0.05, progress: 0.5, phrase: 0.5 };
  let attacked = { state: initial, drives: engine.radioVisualAudioDrives(highBuildSignal) };
  let released = attacked;
  let coldLow = { state: initial, drives: engine.radioVisualAudioDrives(lowBuildSignal) };
  for (let frame = 0; frame < 30; frame += 1) attacked = engine.advanceRadioVisualAudioReaction(attacked.state, highBuildSignal, 1_000 / 60);
  released = attacked;
  for (let frame = 0; frame < 30; frame += 1) {
    released = engine.advanceRadioVisualAudioReaction(released.state, lowBuildSignal, 1_000 / 60);
    coldLow = engine.advanceRadioVisualAudioReaction(coldLow.state, lowBuildSignal, 1_000 / 60);
  }
  assert.ok(attacked.state.buildMemory > 0.4, "build must attack quickly enough to add visible layers during a rise");
  assert.ok(released.state.buildMemory < attacked.state.buildMemory);
  assert.ok(released.state.buildMemory > coldLow.state.buildMemory + 0.18, "build must release gradually instead of collapsing between hits");

  let sustainedBuild = { state: initial, drives: engine.radioVisualAudioDrives(highBuildSignal) };
  for (let frame = 0; frame < 60; frame += 1) sustainedBuild = engine.advanceRadioVisualAudioReaction(sustainedBuild.state, highBuildSignal, 1_000 / 60);
  assert.ok(sustainedBuild.state.buildMemory >= 0.65, "one second of full-spectrum audio must assemble the layered composition");
  assert.ok(sustainedBuild.drives.tapestry > 0.75 && sustainedBuild.drives.tapestryPulse < 0.05, "a settled full-spectrum passage must retain the composition without repeating its arrival flash");
  const silenceBuildSignal = { ...lowBuildSignal, energy: 0, bass: 0, mid: 0, treble: 0, peak: 0 };
  let quarterSecondRelease = sustainedBuild;
  for (let frame = 0; frame < 15; frame += 1) quarterSecondRelease = engine.advanceRadioVisualAudioReaction(quarterSecondRelease.state, silenceBuildSignal, 1_000 / 60);
  assert.ok(quarterSecondRelease.state.buildMemory >= 0.3, "the composition must retain a short musical afterimage");
  let fullRelease = quarterSecondRelease;
  for (let frame = 15; frame < 120; frame += 1) fullRelease = engine.advanceRadioVisualAudioReaction(fullRelease.state, silenceBuildSignal, 1_000 / 60);
  assert.ok(fullRelease.state.buildMemory <= 0.15, "the build must clear instead of leaving a permanently dense quiet scene");
});

test("Wheel geometry uses a candidate-count-calibrated outer band", () => {
  assert.deepEqual(engine.radioVisualsWheelBand(Number.NaN), { innerCenterRatio: 0.49, outerCenterRatio: 0.493, edgeOnly: true, maxRings: 1 });
  assert.deepEqual(engine.radioVisualsWheelBand(undefined), { innerCenterRatio: 0.49, outerCenterRatio: 0.493, edgeOnly: true, maxRings: 1 });
  assert.deepEqual(engine.radioVisualsWheelBand(0), { innerCenterRatio: 0.43, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 7 });
  for (const count of [1, 8]) {
    assert.deepEqual(engine.radioVisualsWheelBand(count), { innerCenterRatio: 0.49, outerCenterRatio: 0.493, edgeOnly: true, maxRings: 1 });
  }
  for (const count of [9, 12]) {
    assert.deepEqual(engine.radioVisualsWheelBand(count), { innerCenterRatio: 0.47, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 2 });
  }
  for (const count of [13, 24]) {
    assert.deepEqual(engine.radioVisualsWheelBand(count), { innerCenterRatio: 0.456, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 4 });
  }
  for (const count of [25, 32, 44, 64, 99, 128]) {
    assert.deepEqual(engine.radioVisualsWheelBand(count), { innerCenterRatio: 0.45, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 7 });
  }
  for (let count = 1; count <= 128; count += 1) {
    const band = engine.radioVisualsWheelBand(count);
    assert.ok(band.outerCenterRatio > band.innerCenterRatio, `${count} candidates must retain visible spinning geometry`);
    assert.ok(band.maxRings >= 1, `${count} candidates cannot disable the Wheel visual`);
  }
});

test("Wheel portal starts strong and becomes a bounded storm at fourteen candidates", () => {
  const empty = engine.radioVisualsPortalProfile(0);
  const one = engine.radioVisualsPortalProfile(1);
  const thirteen = engine.radioVisualsPortalProfile(13);
  const fourteen = engine.radioVisualsPortalProfile(14);
  const twenty = engine.radioVisualsPortalProfile(20);
  const twentyEight = engine.radioVisualsPortalProfile(28);
  const oneHundredTwentyEight = engine.radioVisualsPortalProfile(128);

  assert.equal(empty.strength, one.strength, "an empty or one-name Wheel still receives the full starting portal");
  assert.ok(one.strength >= 0.68);
  assert.ok(one.ribbonCount >= 4);
  assert.ok(one.streakCount >= 24);
  assert.ok(one.lightningArcCount >= 1);
  assert.ok(one.outerTendrilCount >= 10, "the portal must reach outward even with one candidate");
  assert.ok(fourteen.strength > thirteen.strength);
  assert.ok(fourteen.turbulence > thirteen.turbulence);
  assert.ok(fourteen.streakCount > thirteen.streakCount);
  assert.ok(fourteen.strength - thirteen.strength >= 0.09, "fourteen candidates must receive an unmistakable strength jump");
  assert.ok(fourteen.turbulence - thirteen.turbulence >= 0.2, "fourteen candidates must receive an unmistakable turbulence jump");
  assert.ok(fourteen.ribbonCount - thirteen.ribbonCount >= 2, "fourteen candidates must gain structural spiral sheets");
  assert.ok(fourteen.streakCount - thirteen.streakCount >= 16, "fourteen candidates must gain a structural suction-streak storm");
  assert.ok(fourteen.lightningArcCount >= 5 && fourteen.lightningArcCount > thirteen.lightningArcCount, "fourteen candidates must enter the storm tier");
  assert.ok(fourteen.outerTendrilCount - thirteen.outerTendrilCount >= 6, "fourteen candidates must receive an obvious exterior-tendril storm");
  assert.equal(twenty.outerTendrilCount, 32, "twenty candidates must reach the bounded exterior overdrive tier");
  assert.equal(oneHundredTwentyEight.outerTendrilCount, twenty.outerTendrilCount, "candidate counts above the real Wheel range cannot add unbounded exterior work");
  assert.ok(twentyEight.strength > fourteen.strength);
  assert.ok(twentyEight.ribbonCount > fourteen.ribbonCount);
  assert.ok(twentyEight.streakCount > fourteen.streakCount);
  assert.ok(twentyEight.wispInnerRatio < fourteen.wispInnerRatio, "only translucent material may reach farther inward as the labels get denser");
  assert.deepEqual(oneHundredTwentyEight, twentyEight, "very large Wheels stay at the bounded overdrive profile instead of disabling the portal");

  let previous = engine.radioVisualsPortalProfile(0);
  for (let count = 1; count <= 128; count += 1) {
    const profile = engine.radioVisualsPortalProfile(count);
    assert.ok(profile.strength >= previous.strength, `${count} candidates cannot weaken the portal`);
    assert.ok(profile.turbulence >= previous.turbulence, `${count} candidates cannot reduce turbulence`);
    assert.ok(profile.ribbonCount >= 4 && profile.streakCount >= 24 && profile.lightningArcCount >= 1, `${count} candidates cannot disable a portal layer`);
    assert.ok(profile.outerTendrilCount >= previous.outerTendrilCount && profile.outerTendrilCount <= 32, `${count} candidates must retain bounded monotonic edge-reaching tendrils`);
    assert.equal(profile.outerRatio, 0.497, `${count} candidates must retain the edge-to-edge portal scale`);
    previous = profile;
  }
});

test("Wheel portal tendrils contact the clipped stage edge without crossing the name-safe root", () => {
  const width = 810;
  const height = 1080;
  const centerX = width * 0.5;
  const centerY = height * engine.RADIO_VISUALS_WHEEL_CENTER_Y_RATIO;
  const padding = width * 0.002;
  const rootRadius = width * (0.497 - 0.002);

  for (let sample = 0; sample < 720; sample += 1) {
    const angle = sample / 720 * Math.PI * 2;
    const radius = engine.radioVisualsPortalStageEdgeRadius(width, height, centerX, centerY, angle, padding);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    assert.ok(radius > rootRadius, `sample ${sample} must retain even its shortest cardinal edge contact`);
    assert.ok(x >= padding - 1e-7 && x <= width - padding + 1e-7);
    assert.ok(y >= padding - 1e-7 && y <= height - padding + 1e-7);
    const boundaryError = Math.min(
      Math.abs(x - padding),
      Math.abs(x - (width - padding)),
      Math.abs(y - padding),
      Math.abs(y - (height - padding)),
    );
    assert.ok(boundaryError < 1e-6, `sample ${sample} must terminate on a stage boundary`);
  }
});

test("performer-window intrusions have fixed cadence, bounded strips, cue bypass, and an idle fast path", () => {
  const drives = (overrides = {}) => engine.radioVisualAudioDrives({
    source: "windows_loopback",
    bpm: 118,
    energy: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    beat: 0,
    accent: 0,
    peak: 0,
    progress: 0.4,
    phrase: 0.25,
    ...overrides,
  });
  const quiet = drives();
  const mids = drives({ energy: 0.45, mid: 0.45, accent: 0.5 });
  const treble = drives({ energy: 0.45, treble: 0.45, peak: 0.5 });
  const hot = drives({ energy: 0.75, bass: 0.75, mid: 0.75, treble: 0.75, beat: 0.7, accent: 0.7, peak: 0.8 });
  const planAt = (time, audioDrives = quiet, overrides = {}) => engine.radioVisualWindowIntrusionPlan({
    time,
    sceneMix: 1,
    trackMix: 1,
    drives: audioDrives,
    musicScene: "matrix_rain",
    seed: 43120,
    cueType: null,
    cueProgress: null,
    cueEnvelope: 0,
    ...overrides,
  });

  let activeTime = null;
  let inactiveTime = null;
  for (let tick = 0; tick <= 2_000; tick += 1) {
    const time = tick / 100;
    const plan = planAt(time);
    if (plan.stutterProgress !== null && activeTime === null) activeTime = time;
    if (!plan.active && inactiveTime === null) inactiveTime = time;
    if (activeTime !== null && inactiveTime !== null) break;
  }
  assert.notEqual(activeTime, null, "the deterministic cadence must contain an occasional stutter window");
  assert.notEqual(inactiveTime, null, "the deterministic cadence must leave most frames on the idle fast path");

  for (let tick = 0; tick <= 2_000; tick += 1) {
    const time = tick / 100;
    const quietPlan = planAt(time, quiet);
    const hotPlan = planAt(time, hot);
    assert.equal(hotPlan.stutterProgress, quietPlan.stutterProgress, "audio cannot reopen or close the fixed stutter gate");
    assert.ok(hotPlan.stutterStripCount >= 0 && hotPlan.stutterStripCount <= 3, "stutter work must stay within three actual strips");
  }

  const quietBurst = planAt(activeTime, quiet);
  const midBurst = planAt(activeTime, mids);
  const trebleBurst = planAt(activeTime, treble);
  const hotBurst = planAt(activeTime, hot);
  assert.ok(quietBurst.stutterStripCount >= 2 && quietBurst.stutterStripCount <= 3);
  assert.ok(midBurst.stutterStrength > quietBurst.stutterStrength, "mids must strengthen their center glitch layer");
  assert.ok(trebleBurst.stutterStrength > quietBurst.stutterStrength, "treble must strengthen its center glitch layer");
  assert.ok(hotBurst.stutterStripCount >= quietBurst.stutterStripCount && hotBurst.stutterStripCount <= 3);
  assert.equal(planAt(inactiveTime).active, false, "an empty allow-list must skip the second Canvas pass");

  const bassHit = drives({ energy: 0.64, bass: 0.92, beat: 1 });
  const midHit = drives({ energy: 0.64, mid: 0.92, accent: 1 });
  const trebleHit = drives({ energy: 0.64, treble: 0.92, peak: 1 });
  const tapestryHit = drives({ energy: 0.92, bass: 0.92, mid: 0.92, treble: 0.92, beat: 1, accent: 1, peak: 1 });
  const bassIntrusion = planAt(inactiveTime, bassHit, { musicScene: "particle_pressure" });
  const midIntrusion = planAt(inactiveTime, midHit, { musicScene: "ascii_terminal" });
  const trebleIntrusion = planAt(inactiveTime, trebleHit, { musicScene: "signal_constellation" });
  const tapestryIntrusion = planAt(inactiveTime, tapestryHit, { musicScene: "laser_lattice" });
  assert.ok(bassIntrusion.bassBreachStrength > 0.25 && bassIntrusion.midFlashStrength === 0 && bassIntrusion.trebleSparkStrength === 0);
  assert.ok(midIntrusion.midFlashStrength > 0.24 && midIntrusion.bassBreachStrength === 0 && midIntrusion.trebleSparkStrength === 0);
  assert.ok(trebleIntrusion.trebleSparkStrength > 0.27 && trebleIntrusion.bassBreachStrength === 0 && trebleIntrusion.midFlashStrength === 0);
  assert.ok(tapestryIntrusion.tapestryBurstStrength > 0.35, "a real full-band hit must briefly breach the performer field");
  assert.equal(midIntrusion.musicScene, "ascii_terminal", "the bounded breach must retain the active family's visual language");
  for (const plan of [bassIntrusion, midIntrusion, trebleIntrusion, tapestryIntrusion]) {
    assert.equal(plan.active, true, "a real transient must activate the otherwise idle second Canvas pass");
  }

  const lightning = planAt(inactiveTime, quiet, {
    sceneMix: 0,
    trackMix: 0,
    musicScene: "edge_spectrum",
    cueType: "lightning",
    cueProgress: 0.5,
    cueEnvelope: 0.8,
  });
  assert.equal(lightning.active, true, "an explicit Lightning cue must bypass sceneMix=0");
  assert.ok(lightning.lightningCueStrength > 0);

  for (const cueProgress of [0.25, 0.75]) {
    const breach = planAt(inactiveTime, quiet, {
      sceneMix: 0,
      trackMix: 0,
      musicScene: "edge_spectrum",
      cueType: "signal_breach",
      cueProgress,
      cueEnvelope: 0.8,
    });
    assert.equal(breach.active, true, "Signal Breach must bypass sceneMix=0");
    assert.ok(breach.signalBreachProgress !== null && breach.signalBreachStrength > 0);
  }
});

test("the square Studio source contains a centered 3:4 portrait-safe visual stage", () => {
  assert.equal(engine.RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO, 3 / 4);
  assert.deepEqual(engine.radioVisualsEffectStageBounds(1080, 1080), {
    x: 135,
    y: 0,
    width: 810,
    height: 1080,
  });
  assert.deepEqual(engine.radioVisualsEffectStageBounds(810, 1080), {
    x: 0,
    y: 0,
    width: 810,
    height: 1080,
  });
  assert.deepEqual(engine.radioVisualsEffectStageBounds(1920, 1080), {
    x: 555,
    y: 0,
    width: 810,
    height: 1080,
  });
  assert.deepEqual(engine.radioVisualsEffectStageBounds(1080, 1920), {
    x: 0,
    y: 240,
    width: 1080,
    height: 1440,
  });
});

test("permanent receiver is a pure portrait-safe effects surface with a stable link and bounded standby polling", () => {
  const receiver = fs.readFileSync(path.join(projectRoot, "src/components/RadioVisualsReceiver.tsx"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "src/lib/radio-visuals.ts"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "src/components/AdminLiveOverlayControl.tsx"), "utf8");
  const sourceAccess = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/overlay/source-access/route.ts"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "src/app/overlay/radio-visuals/radio-visuals.css"), "utf8");
  const page = fs.readFileSync(path.join(projectRoot, "src/app/overlay/radio-visuals/page.tsx"), "utf8");
  const chrome = fs.readFileSync(path.join(projectRoot, "src/components/SiteChrome.tsx"), "utf8");
  const liveProvider = fs.readFileSync(path.join(projectRoot, "src/components/LiveStatusProvider.tsx"), "utf8");
  const bnlProvider = fs.readFileSync(path.join(projectRoot, "src/components/BNLStatusProvider.tsx"), "utf8");
  const liveCss = fs.readFileSync(path.join(projectRoot, "src/app/overlay/live/overlay-live.css"), "utf8");
  const foregroundCss = fs.readFileSync(path.join(projectRoot, "src/app/overlay/foreground/calibration/foreground-calibration.css"), "utf8");
  const engineSource = fs.readFileSync(path.join(projectRoot, "src/lib/radio-visuals-engine.ts"), "utf8");
  const queueControl = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");
  const productionContract = fs.readFileSync(path.join(projectRoot, "docs/queue-production-capability.md"), "utf8");
  const render = receiver.slice(receiver.lastIndexOf("return ("));
  assert.match(receiver, /fetch\("\/api\/overlay\/radio-visuals"/);
  assert.match(receiver, /payload\.snapshot\.sessionActive \? RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS : RADIO_VISUALS_STANDBY_POLL_INTERVAL_MS/);
  assert.doesNotMatch(receiver, /startSessionBoundPolling/);
  assert.doesNotMatch(render, /<(?:header|footer|h[1-6]|p|span|strong|em)\b|aria-live/);
  assert.match(render, /<canvas ref=\{canvasRef\}/);
  assert.match(receiver, /drawAmbientLighting|drawGoboShadows|drawParticleField|drawTrackBloom|drawPartyCue|drawShadowCue|drawSignalBreachCue|drawBlackoutCue|drawLightningCue/);
  assert.match(receiver, /drawQueueLanes|drawIntakeAperture|drawFinalConvergence|drawCompletionAfterimage|drawPressureEdges/);
  assert.match(receiver, /drawIdleTransmission|drawLightRibbons|drawPrismaticShards|drawSignalConstellation|drawSeedComposition/);
  assert.match(receiver, /drawEdgeSpectrum|drawOscilloscopeRibbons|drawTapeFeedback|drawMatrixRain|drawAsciiTerminal|drawPixelSortStorm|drawLightningSwitchyard|drawLaserLattice|drawParticlePressure|drawSignalConstellation|drawSeededMusicScene/);
  assert.match(receiver, /drawMusicLifecycleVariant[\s\S]*bars_to_teeth[\s\S]*ribbons_to_braids[\s\S]*frames_to_splice[\s\S]*rain_to_crossfeed[\s\S]*terminal_to_breach[\s\S]*slices_to_scramble[\s\S]*rails_to_discharge[\s\S]*grid_to_prism[\s\S]*drift_to_vortex[\s\S]*stars_to_network/, "all ten families must own a different late-song form");
  assert.match(receiver, /drawMusicDynamicModulation[\s\S]*edge_spectrum[\s\S]*oscilloscope_ribbons[\s\S]*tape_feedback[\s\S]*matrix_rain[\s\S]*ascii_terminal[\s\S]*pixel_sort_storm[\s\S]*lightning_switchyard[\s\S]*laser_lattice[\s\S]*particle_pressure[\s\S]*signal_constellation/, "all ten existing families must receive a distinct additive performance layer");
  const dynamicModulation = receiver.slice(receiver.indexOf("function drawMusicDynamicModulation"), receiver.indexOf("function drawSeededMusicScene"));
  for (const modulation of ["structureLevel", "bassImpact", "midImpact", "trebleImpact", "tapestryImpact", "snareFlash", "pulse", "breath", "beatPunch", "hardBeat", "sectionSurge", "glowBloom", "lineWeight", "reach", "deformation", "movementBurst"]) {
    assert.match(dynamicModulation, new RegExp(`evolution\\.${modulation}\\b`), `the additive layer must visibly consume ${modulation}`);
  }
  assert.match(receiver, /drawMusicBandEventAccents[\s\S]*MID::SYNC[\s\S]*HIT::ACK/, "snare-like mid events must light an authored family feature instead of becoming more static lines");
  assert.match(receiver, /drawMusicLifecycleVariant\([^;]+;\s*drawMusicDynamicModulation\(/s, "dynamic modulation must layer after the retained lifecycle geometry");
  assert.match(receiver, /drawSeededMusicScene\(context, width, height, audioTime, music\.bpm,/, "the selected family lifecycle must receive the detected tempo");
  assert.match(receiver, /return clampVisualValue\(mix \* \(0\.82 \+ drive \* 0\.16\), 0, 0\.98\)/, "chroma-safe cores must multiply by state fades while surviving the orange key");
  assert.doesNotMatch(receiver, /drawVortexRelay|drawBarcodeCathedral|drawHalftoneOrganism|drawMusicHalo|drawPulseRings/);
  assert.doesNotMatch(receiver, /drawLiquidDream|drawKaleidoscopeBloom|drawSpectralLoom|drawFeedbackArchitecture|drawChromaticSmears|radioVisualComposition/);
  assert.match(receiver, /drawAmbientMoment|radioVisualAmbientMoment|observeSnapshotEvents|drawAutomaticEvent/);
  assert.match(receiver, /wheel_gained|priority_sent|priority_confirmed|track_skipped|stage_shift/);
  assert.doesNotMatch(receiver, /drawSponsorCurtain|sponsorMix|sponsor_due|sponsor_started|sponsor_completed/, "invisible sponsor-only FX must not remain in the Show Visuals renderer");
  assert.match(receiver, /hashRadioVisualToken\(`\$\{snapshot\.cue\.type\}:\$\{snapshot\.cue\.nonce\}/, "manual cue nonce must vary every repeated effect");
  assert.match(receiver, /lightningMainPath|lightningBranches|drawLightningTree/);
  assert.doesNotMatch(receiver, /function drawBolt\(/, "lightning must use a branching procedural composition rather than generic twin bolts");
  assert.match(receiver, /PALETTE_TRANSITION_MS = 2_400|PARTICLE_TRANSITION_MS = 2_000|radioVisualCueEnvelope/);
  assert.match(receiver, /smoothMusicSignal|radioVisualsMusicSignal/);
  assert.match(receiver, /RADIO_AUDIO_BRIDGE_URL|4_000|data-audio-bridge/);
  assert.doesNotMatch(receiver, /targetAddressSpace/, "literal 127.0.0.1 must remain compatible with TikTok Studio's embedded Chromium version");
  assert.match(receiver, /if \(!snapshot\.sessionActive\)[\s\S]*setAudioBridgeConnection\("idle"\)/);
  assert.match(engineSource, /source: "analyser" \| "timeline" \| "windows_loopback"/);
  assert.match(engineSource, /fallbackProgressBeats = 384 \+ Math\.floor\(seededUnit\(seed, 30_004\) \* 256\)/, "durationless tracks must use a multi-minute deterministic arc");
  assert.doesNotMatch(engineSource, /beatPosition % 64/, "durationless progress must not restart every 64 beats");
  assert.doesNotMatch(engineSource, /fallbackProgressPosition % fallbackProgressBeats/, "durationless progress must not wrap abruptly at the end of its build arc");
  assert.match(engineSource, /RADIO_VISUALS_WHEEL_CENTER_Y_RATIO = 0\.375/);
  assert.match(receiver, /prepareEffectLayer|applyPerformerSafeField|applyPerformerIntrusionField|destination-in/);
  assert.match(receiver, /if \(snapshot\.showStage !== "intake"\) applyPerformerSafeField\(context, width, height, 0\.2\)/);
  assert.match(receiver, /drawPerformerWindowIntrusions[\s\S]*?drawBroadcastFx[\s\S]*?drawMusicGestureSweep[\s\S]*?plan\.lightningFamilyStrength[\s\S]*?cue\?\.type === "lightning"[\s\S]*?cue\?\.type === "signal_breach"/, "only the bounded artifact, music-sweep, lightning, and scan-line allow-list may regain controlled center presence");
  const windowIntrusions = receiver.slice(receiver.indexOf("function drawWindowScanline"), receiver.indexOf("function visualSignalMemory"));
  assert.match(windowIntrusions, /drawWindowSignalStutter[\s\S]*plan\.stutterStripCount/, "center slippage must consume the tested two-to-three-strip plan");
  assert.match(receiver, /drawMusicTransientIntrusions[\s\S]*bassBreachStrength[\s\S]*midFlashStrength[\s\S]*trebleSparkStrength[\s\S]*tapestryBurstStrength/, "independent transient systems may briefly breach the performer field within a fixed primitive budget");
  assert.match(windowIntrusions, /drawMusicTransientIntrusions\(context, width, height, plan, primary, secondary, highlight\)/, "the performer allow-list must render the bounded transient breach layer");
  assert.doesNotMatch(windowIntrusions, /drawEdgeSpectrum|drawOscilloscopeRibbons|drawMatrixRain|drawAsciiTerminal|drawPixelSortStorm|drawParticlePressure|drawIndustrialOverride/, "dense family renderers must never be replayed across the performer window");
  assert.match(receiver, /applyPerformerIntrusionField\(intrusionLayer\.context, width, height\)/, "window intrusions must receive their own feathered center mask");
  assert.match(receiver, /\(intrusionPlan\.active \|\| broadcastFxPlan\.centerStrength >= 0\.002\)/, "inactive center effects must skip the second full-stage Canvas pass");
  assert.match(receiver, /prepareCrtTexture[\s\S]*drawPersistentBroadcastTexture/, "the always-alive CRT bed must reuse a cached texture");
  assert.match(receiver, /radioVisualBroadcastFxPlan\([\s\S]*time: serverNowMs \/ 1_000/, "featured artifact cadence must survive a receiver refresh");
  assert.match(receiver, /radioVisualBroadcastStartedTransition\(previous, current\)/);
  assert.match(receiver, /serverSnapshotRef\.current === snapshot/, "the fabricated fallback snapshot must never become broadcast-transition evidence");
  assert.match(receiver, /if \(activeSurfaceMix > 0\) \{\s*if \(authoritativeSnapshot\) observeSnapshotEvents/, "only a server snapshot may drive inferred show events");
  assert.match(receiver, /if \(event\.type === "show_started"\) continue;[\s\S]*applyPerformerSafeField[\s\S]*if \(event\.type === "show_started"\)[\s\S]*drawAutomaticEvent\(outputContext/, "broadcast ignition must render after the ordinary performer attenuation");
  const wheelScene = receiver.slice(receiver.indexOf("function wheelAngularVelocityTarget"), receiver.indexOf("function drawPartyCue"));
  const automaticEvent = receiver.slice(receiver.indexOf("function drawAutomaticEvent"), receiver.indexOf("function drawTrackBloom"));
  assert.match(automaticEvent, /drawWheelEventAccent/, "Wheel events retain a lightweight accent on the integrated portal phase");
  assert.doesNotMatch(automaticEvent, /drawWheelScene/, "automatic Wheel events must not render a second independently phased portal");
  assert.match(wheelScene, /height \* RADIO_VISUALS_WHEEL_CENTER_Y_RATIO/);
  assert.doesNotMatch(wheelScene, /height \* 0\.5/);
  assert.match(wheelScene, /candidateCount\?: number/);
  assert.match(wheelScene, /radioVisualsWheelBand\(candidateCount\)/);
  assert.match(wheelScene, /radioVisualsPortalProfile\(candidateCount\)/);
  assert.match(wheelScene, /band\.innerCenterRatio/);
  assert.match(wheelScene, /band\.outerCenterRatio/);
  assert.match(wheelScene, /band\.edgeOnly/);
  assert.match(wheelScene, /shadowBlur = 0/);
  assert.match(wheelScene, /context\.fill\("evenodd"\)/, "the portal must have a hollow depth throat instead of a central opaque disk");
  assert.match(wheelScene, /createRadialGradient\(0, 0, hardInnerRadius, 0, 0, outerRadius\)/, "dark portal depth must begin at the hard name-safe radius");
  assert.match(wheelScene, /context\.arc\(0, 0, hardInnerRadius, 0, Math\.PI \* 2, true\)/, "the dark throat cutout must preserve the hard name-safe interior");
  assert.match(wheelScene, /tracePortalSpiral/);
  assert.match(wheelScene, /tracePortalCaustic/);
  assert.match(wheelScene, /drawPortalRimLightning/);
  assert.match(wheelScene, /drawPortalOuterTendrils/);
  assert.match(wheelScene, /radioVisualsPortalStageEdgeRadius[\s\S]*Math\.sin\(progress \* Math\.PI\)/, "tendril angular sweep must return to the exact boundary ray at both endpoints");
  assert.match(wheelScene, /context\.clip\("evenodd"\)/, "exterior tendril glow must be clipped outside the name-safe root");
  assert.match(wheelScene, /portal\.outerTendrilCount/, "candidate count must scale the edge-reaching jagged portal material");
  assert.match(wheelScene, /portal\.ribbonCount[\s\S]*portal\.streakCount[\s\S]*portal\.lightningArcCount/, "candidate count must build continuous portal layers");
  assert.match(wheelScene, /const causticCount = band\.edgeOnly[\s\S]*band\.maxRings \+ 3/, "hard caustics must remain label-safe while translucent portal material stays present");
  assert.match(wheelScene, /hardGeometryOuterRadius/);
  assert.doesNotMatch(wheelScene, /setLineDash|lineDashOffset|fillRect|spoke|wedge/, "the Wheel must no longer be dominated by dashed rings or rectangular ticks");
  for (const wheelMode of ["wheel_ready", "wheel_spinning", "wheel_reencrypting", "wheel_result", "wheel_confirmed"]) {
    assert.match(wheelScene, new RegExp(wheelMode));
  }
  assert.match(receiver, /runtime\.wheelPhase \+= runtime\.wheelVelocity \* elapsedMs \/ 1_000/);
  assert.match(receiver, /drawWheelScene\([\s\S]*?runtime\.wheelPhase[\s\S]*?runtime\.wheelMix \* activeSurfaceMix/);
  assert.match(receiver, /snapshot\.signals\.wheelCandidateCount/);
  assert.doesNotMatch(receiver, /drawTrackSignature|drawLiveMusicResponse/, "one shared layer must not flatten the ten scene silhouettes");
  assert.doesNotMatch(receiver, /globalCompositeOperation = "screen"/);
  assert.match(receiver, /radioVisualMusicScene\(seed\)/);
  assert.match(receiver, /trackProgressSeed !== snapshot\.visualSeed[\s\S]*?trackProgressStartedAtMs = timestampMs/, "unknown-duration builds must reset on each track occurrence");
  assert.match(receiver, /audioTime = \(transportSeconds/);
  assert.match(receiver, /sharedTransmissionRetention = clampVisualValue\(1 - runtime\.trackMix \* 0\.78, 0\.22, 1\)/, "the shared transmission language must recede during track-specific scenes");
  assert.match(receiver, /activeSurfaceMix \* sharedTransmissionRetention \* clampVisualValue\(0\.62 \+ runtime\.intensity \* 0\.24, 0\.62, 0\.9\)/, "the restored transmission floor must remain strong outside track scenes");
  assert.match(receiver, /radioVisualMusicSceneVisibility\(musicDrives\)/, "track scenes must retain a tested visible identity floor while expanding with all three audio bands");
  assert.equal((receiver.match(/drawEdgeSpectrum\(/g) ?? []).length, 2, "spectrum meters must only be defined and invoked by the music dispatcher");
  assert.equal((receiver.match(/drawOscilloscopeRibbons\(/g) ?? []).length, 2, "waveform ribbons must only be defined and invoked by the music dispatcher");
  for (const rendererName of [
    "drawEdgeSpectrum",
    "drawOscilloscopeRibbons",
    "drawTapeFeedback",
    "drawMatrixRain",
    "drawAsciiTerminal",
    "drawPixelSortStorm",
    "drawLightningSwitchyard",
    "drawLaserLattice",
    "drawParticlePressure",
    "drawSignalConstellation",
  ]) {
    const start = receiver.indexOf(`function ${rendererName}`);
    const end = receiver.indexOf("\nfunction ", start + 10);
    const renderer = receiver.slice(start, end);
    assert.ok(start >= 0 && end > start, `${rendererName} must be independently implemented`);
    for (const structuralDrive of ["bass", "mid", "treble", "bassPulse", "midPulse", "treblePulse", "tapestry", "tapestryPulse", "build", "progress"]) {
      assert.match(renderer, new RegExp(`drives\\.${structuralDrive}\\b`), `${rendererName} must structurally respond to ${structuralDrive}`);
    }
    for (const audioLayer of ["bass", "mid", "treble", "tapestry"]) {
      assert.match(renderer, new RegExp(`layerPlan\\.${audioLayer}\\b`), `${rendererName} must consume its tested ${audioLayer} density budget`);
    }
  }
  const sceneIdentityTokens = {
    drawEdgeSpectrum: ["barCount", "bassPlateCount", "midBridgeCount", "scanCount", "holdReach"],
    drawOscilloscopeRibbons: ["ribbonCount", "carrierY", "harmonicCount", "knotCount", "cycles"],
    drawTapeFeedback: ["frameCount", "tearCount", "blockCount", "afterimageCount"],
    drawMatrixRain: ["SIGNAL_GLYPHS", "bassCascade", "trebleHeadCount", "anchorCount", "bridgeCount", "decryptY"],
    drawAsciiTerminal: ["TERMINAL_GLYPHS", "promptCount", "paneCount", "cursorSparkCount", "executeY"],
    drawPixelSortStorm: ["sliceCount", "smearCount", "bandCount", "surgeY"],
    drawLightningSwitchyard: ["railCount", "nodeSize", "reservoirCount", "current", "networkCouplingX", "networkDischarge", "drawLightningTree"],
    drawLaserLattice: ["topology", "beamCount", "depthPlaneCount", "shutterX", "cageRadius"],
    drawParticlePressure: ["pressure", "frontCount", "breath"],
    drawSignalConstellation: ["linkReach", "anchorCount", "cometCount", "quadraticCurveTo", "packetX"],
  };
  for (const [rendererName, identityTokens] of Object.entries(sceneIdentityTokens)) {
    const start = receiver.indexOf(`function ${rendererName}`);
    const end = receiver.indexOf("\nfunction ", start + 10);
    const renderer = receiver.slice(start, end);
    for (const identityToken of identityTokens) {
      assert.match(renderer, new RegExp(`\\b${identityToken}\\b`), `${rendererName} must retain its ${identityToken} visual language`);
    }
  }
  assert.match(receiver.slice(receiver.indexOf("function drawMatrixRain"), receiver.indexOf("function drawTapeFeedback")), /drives\.phrase/);
  assert.match(receiver.slice(receiver.indexOf("function drawLaserLattice"), receiver.indexOf("function drawParticlePressure")), /drives\.progress/);
  assert.match(receiver, /sceneStateMix = clampVisualValue\(1 - Math\.max\(runtime\.wheelMix, runtime\.systemMix\), 0, 1\)/);
  assert.match(receiver, /activeMusicMix = runtime\.trackMix \* sceneStateMix/, "music output must fade with track ownership");
  assert.match(receiver, /RADIO_VISUAL_MUSIC_OUTPUT_GAIN/, "the ten music families must share one explicit bounded output gain");
  assert.equal(engine.RADIO_VISUAL_MUSIC_OUTPUT_GAIN, 1.35);
  assert.match(receiver, /drawSeedComposition\(runtime\.previousMusicSeed, 1 - musicSeedBlend\)/);
  assert.match(receiver, /drawSeedComposition\(runtime\.currentMusicSeed, musicSeedBlend\)/);
  assert.match(receiver, /runtime\.syntheticEvents = \[\]/, "inactive sessions must clear residual automatic events immediately");
  assert.match(receiver, /drawWheelScene\([^;]+runtime\.wheelPhase[^;]+runtime\.wheelMix \* activeSurfaceMix[^;]+snapshot\.sceneMode/s);
  assert.match(receiver, /const density = 1/);
  assert.match(queueControl, /createMediaElementSource|createAnalyser|audioAnalysis|analyzeRadioVisualFrequencyData/);
  assert.doesNotMatch(queueControl, /getDisplayMedia|createMediaStreamSource|Capture show audio|Share audio/);
  assert.match(queueControl, /YOUTUBE_SYNC_HEARTBEAT_MS = 1_000/);
  assert.match(productionContract, /same-origin MP3\/WAV player[\s\S]*existing 1 Hz player-sync heartbeat/);
  assert.match(productionContract, /External players with no usable playback or audio signal automatically receive[\s\S]*no host prompt or control/);
  assert.match(builder, /const queueState = await getRadioQueueState\(\);\s*if \(!hasActiveQueueSession\(queueState\)\)/);
  const idleBranch = builder.slice(builder.indexOf("if (!hasActiveQueueSession(queueState))"), builder.indexOf("const [overlayState, playerSync]"));
  assert.doesNotMatch(idleBranch, /getStoredLiveOverlayState|getLiveOverlayPlayerSync/);
  assert.match(admin, /sourceLinks\?\.radioVisuals/);
  assert.match(sourceAccess, /\/overlay\/radio-visuals\$\{STUDIO_SOURCE_QUERY\}\$\{fragment\}/);
  assert.match(receiver, /studioOverlayRequestHeaders/);
  assert.match(admin, /triggerVisualCue|Party Burst|Shadow Sweep|Signal Breach|Blackout \/ Return|Lightning Hit/);
  assert.match(css, /--radio-visuals-key: #ff5a00/);
  assert.doesNotMatch(css, /radio-visuals-canvas[\s\S]*opacity:\s*0\.72/);
  assert.match(receiver, /data-source-aspect="1:1"/);
  assert.match(receiver, /data-source-resolution="1080x1080"/);
  assert.match(receiver, /data-effect-stage-resolution="810x1080"/);
  assert.match(receiver, /data-music-scene=\{radioVisualMusicScene\(snapshot\.visualSeed\)\}/);
  assert.match(receiver, /radioVisualsEffectStageBounds\(sourceWidth, sourceHeight\)/);
  assert.match(receiver, /data-music-source=/);
  assert.match(receiver, /"windows-loopback"/);
  assert.match(receiver, /"timeline"/);
  assert.match(receiver, /"analyser"/);
  assert.match(css, /width: min\(100vw, 100vh\);\s*height: min\(100vw, 100vh\)/);
  assert.match(css, /aspect-ratio: 1 \/ 1/);
  assert.match(css, /nextjs-portal|vercel-live-feedback|data-vercel-toolbar/);
  assert.match(page, /width: 1080/);
  assert.match(chrome, /pathname\.startsWith\("\/overlay\/"\)/, "overlay sources must bypass the animated site shell");
  assert.match(liveProvider, /pathname\.startsWith\("\/overlay\/"\)/, "overlay sources must not run the global live-status poller");
  assert.match(bnlProvider, /pathname\.startsWith\("\/overlay\/"\)/, "overlay sources must not run the BNL status poller");
  assert.doesNotMatch(liveCss, /body > div:last-of-type/, "isolated live sources must never hide their own root element");
  assert.doesNotMatch(foregroundCss, /body > :not\(main\)/, "isolated foreground sources must never hide their own root element");
  assert.match(admin, /Show Visuals[\s\S]*1080 × 1080 source · 810 × 1080 visual stage/);
  assert.match(productionContract, /centered `810×1080` \(3:4\) portrait-safe stage/);
});

test("show-long live and Wheel source wakes with the session and clears when it ends without changing wheel mechanics", () => {
  const receiver = fs.readFileSync(path.join(projectRoot, "src/components/LiveOverlayReceiver.tsx"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "src/lib/wheel-overlay.ts"), "utf8");
  const route = fs.readFileSync(path.join(projectRoot, "src/app/api/overlay/wheel/route.ts"), "utf8");
  const page = fs.readFileSync(path.join(projectRoot, "src/app/overlay/wheel/page.tsx"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "src/app/overlay/wheel/wheel-overlay.css"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "src/components/AdminLiveOverlayControl.tsx"), "utf8");
  const sourceAccess = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/overlay/source-access/route.ts"), "utf8");
  assert.match(receiver, /wheelOnly \? "\/api\/overlay\/wheel" : "\/api\/overlay\/live"/);
  assert.match(receiver, /WHEEL_OVERLAY_ACTIVE_POLL_INTERVAL_MS|WHEEL_OVERLAY_SHOW_IDLE_POLL_INTERVAL_MS|WHEEL_OVERLAY_STANDBY_POLL_INTERVAL_MS/);
  assert.match(receiver, /data-wheel-active=\{wheelVisible \? "true" : "false"\}/);
  assert.match(receiver, /const \[audioArmed, setAudioArmed\] = useState\(wheelOnly\)/);
  assert.match(receiver, /if \(!wheelOnly\) return undefined;\s*const spin = new Audio/);
  assert.match(receiver, /const cheer = new Audio\(WHEEL_WINNER_CHEER_AUDIO_PATH\)/);
  assert.match(receiver, /const encrypt = new Audio\(WHEEL_REENCRYPT_AUDIO_PATH\)/);
  assert.match(builder, /const queueState = await getRadioQueueState\(\);\s*if \(!hasActiveQueueSession\(queueState\)\)/);
  assert.match(builder, /const broadcastActive = queueState\.session\?\.showStarted === true/);
  assert.match(builder, /Promise\.all\(\[getStoredLiveOverlayState\(\), getLiveOverlayPlayerSync\(\)\]\)/);
  assert.match(builder, /broadcastActive,[\s\S]*?scene,/);
  assert.doesNotMatch(builder, /if \(!broadcastActive\)/);
  assert.doesNotMatch(builder, /scene: wheelActive \? scene : null/);
  assert.match(receiver, /const broadcastVisible = hasActiveQueueSession\(scene\)/);
  assert.doesNotMatch(receiver, /wheelSnapshot\?\.broadcastActive === true/);
  assert.match(receiver, /wheelSnapshot\?\.scene \?\? fallbackScene\(\)/);
  assert.match(receiver, /wheelOnly \? "wheel-overlay-stage " : ""/);
  assert.match(receiver, /playCheerSfx=\{wheelOnly \? \(\) => playWheelOnlySfx/);
  assert.doesNotMatch(builder, /setLiveOverlayState|updateRadioTrack|redis\.set/);
  assert.match(route, /getWheelOverlaySnapshot/);
  assert.match(route, /verifyStudioOverlayToken/);
  assert.match(page, /<LiveOverlayReceiver wheelOnly \/>/);
  assert.match(page, /width: 1080/);
  assert.match(css, /--wheel-overlay-key: #ff5a00/);
  assert.match(css, /width: min\(100vw, 100vh\);\s*height: min\(100vw, 100vh\)/);
  assert.match(admin, /sourceLinks\?\.wheel/);
  assert.match(sourceAccess, /\/overlay\/wheel\$\{STUDIO_SOURCE_QUERY\}\$\{fragment\}/);
  assert.match(admin, /1080 × 1080 · key #FF5A00 · sound on/);
  assert.match(admin, /Live Overlay \+ Wheel \+ Audio/);
  assert.match(admin, /wake when the session opens/);
  assert.doesNotMatch(admin, /Copy Wheel Link|Preview Wheel Source/);
  assert.match(builder, /const wheelActive = Boolean\(scene\.wheelCeremony\)/);
  assert.match(receiver, /estimatedServerNowMs/);
  assert.match(receiver, /initialProgress/);
});
