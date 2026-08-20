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
  assert.deepEqual(snapshot.signals, { intakeOpen: false, wheelSpinsOwed: 0, sponsorStatus: null, broadcastPhase: null });
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

test("wheel, sponsor, and emergency scenes select distinct automatic visual modes", () => {
  const state = queueState();
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("wheel_spinning") }).visualMode, "wheel");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("sponsor") }).visualMode, "sponsor");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene("system_message") }).visualMode, "system");
});

test("procedural scene library spans six genuinely different visual families", () => {
  assert.deepEqual(engine.RADIO_VISUAL_COMPOSITION_TYPES, [
    "liquid_dream",
    "kaleidoscope",
    "spectral_loom",
    "feedback_architecture",
    "cosmic_signal",
    "chromatic_smear",
  ]);
  const seen = new Set(Array.from({ length: 256 }, (_, index) => engine.radioVisualComposition(index + 1)));
  assert.equal(seen.size, engine.RADIO_VISUAL_COMPOSITION_TYPES.length);
  for (const composition of engine.RADIO_VISUAL_COMPOSITION_TYPES) assert.ok(seen.has(composition));
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
});

test("wheel vortex phases have distinct spin, fracture, and release profiles", () => {
  const ready = engine.radioVisualWheelVortexProfile("wheel_ready");
  const spinning = engine.radioVisualWheelVortexProfile("wheel_spinning");
  const reencrypting = engine.radioVisualWheelVortexProfile("wheel_reencrypting");
  const result = engine.radioVisualWheelVortexProfile("wheel_result");
  assert.equal(spinning.spin, 1);
  assert.equal(spinning.tunnel, 1);
  assert.equal(reencrypting.turbulence, 1);
  assert.equal(result.release, 1);
  assert.ok(ready.spin < spinning.spin);
  assert.ok(ready.turbulence < reencrypting.turbulence);
});

test("track loads and wheel activations vary by occurrence while remaining stable during one occurrence", () => {
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

  const wheelFirst = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: scene("wheel_spinning", { updatedAt: "2026-08-19T19:00:00.000Z" }) });
  const wheelRepeated = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: scene("wheel_spinning", { updatedAt: "2026-08-19T19:00:00.000Z" }) });
  const wheelAgain = visuals.resolveRadioVisualsSnapshot({ queueState: queueState(), scene: scene("wheel_spinning", { updatedAt: "2026-08-19T19:05:00.000Z" }) });
  assert.equal(wheelFirst.visualSeed, wheelRepeated.visualSeed);
  assert.notEqual(wheelFirst.visualSeed, wheelAgain.visualSeed);
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
  const snapshot = visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: scene(), now: new Date("2026-08-19T19:00:00.000Z") });
  assert.deepEqual(snapshot.signals, { intakeOpen: true, wheelSpinsOwed: 2, sponsorStatus: "not_due", broadcastPhase: "broadcast_active" });
  assert.ok(snapshot.events.some((event) => event.type === "priority_sent"));
  assert.ok(snapshot.events.some((event) => event.type === "priority_confirmed"));
  assert.ok(snapshot.events.some((event) => event.type === "track_started"));
  assert.ok(snapshot.events.some((event) => event.type === "track_skipped"));
  for (const event of snapshot.events) assert.deepEqual(Object.keys(event).sort(), ["expiresAt", "occurredAt", "seed", "type"]);
  assert.doesNotMatch(JSON.stringify(snapshot.events), /private-priority-id|private-track-id|private@example\.com|pi_private|stripe|checkout/);
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
  assert.ok(engine.RADIO_VISUAL_AMBIENT_MOMENT_TYPES.length >= 11);
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
  for (const channel of [first.energy, first.bass, first.mid, first.treble, first.beat, first.accent, first.peak]) assert.ok(channel >= 0 && channel <= 1);

  const upload = entry("upload-music", { sourceType: "upload" });
  const uploadState = queueState({ nowPlaying: upload, loadedTrack: upload });
  const uploadScene = scene("now_playing", { track: { id: upload.id, artistName: "Artist", trackTitle: "Upload", sourceType: "upload" } });
  const audioSync = { provider: "audio", trackId: upload.id, playbackState: "playing", currentTimeSeconds: 12, durationSeconds: 120, updatedAt: "2026-08-19T18:59:55.000Z", muted: false, audioAnalysis: { energy: 0.88, bass: 0.94, mid: 0.7, treble: 0.42, peak: 0.97 } };
  const analysedSnapshot = visuals.resolveRadioVisualsSnapshot({ queueState: uploadState, scene: uploadScene, playerSync: audioSync, now: new Date("2026-08-19T19:00:00.000Z") });
  const analysed = engine.radioVisualsMusicSignal(analysedSnapshot, 12, 100);
  assert.equal(analysed.source, "analyser");
  assert.ok(analysed.energy > 0.65);
  assert.ok(analysed.bass > analysed.treble);

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
  const capture = fs.readFileSync(path.join(helperRoot, "LoopbackCaptureController.cs"), "utf8");
  const server = fs.readFileSync(path.join(helperRoot, "LocalSignalServer.cs"), "utf8");
  const readme = fs.readFileSync(path.join(helperRoot, "README.md"), "utf8");
  const workflow = fs.readFileSync(path.join(projectRoot, ".github/workflows/ci.yml"), "utf8");
  const productionContract = fs.readFileSync(path.join(projectRoot, "docs/queue-production-capability.md"), "utf8");

  assert.match(project, /<TargetFramework>net8\.0-windows<\/TargetFramework>/);
  assert.match(project, /<SelfContained>true<\/SelfContained>/);
  assert.match(project, /<PublishSingleFile>true<\/PublishSingleFile>/);
  assert.match(project, /PackageReference Include="NAudio" Version="2\.3\.0"/);
  assert.match(capture, /new WasapiLoopbackCapture\(\)/, "capture must use the default Windows Speakers render endpoint");
  assert.doesNotMatch(capture, /new (?:WaveIn|WasapiCapture)\(/, "the helper must not open a microphone capture endpoint");
  assert.match(capture, /TouchClient\(\)[\s\S]*EnsureStarted\(\)/, "visual-source requests must wake capture automatically");
  assert.match(capture, /ClientIdleCaptureStopMilliseconds/, "capture must stop after the visual source becomes idle");
  assert.match(server, /new TcpListener\(IPAddress\.Loopback, BridgeConstants\.Port\)/, "the signal endpoint must never bind to the LAN");
  assert.match(server, /Access-Control-Allow-Private-Network: true/);
  assert.match(server, /www\.barcode-network\.com|barcode-network\.com/);
  assert.match(installer, /Registry\.CurrentUser[\s\S]*CurrentVersion\\Run/, "autostart must be scoped to the current Windows user");
  assert.match(program, /BridgeInstaller\.InstallAndLaunch\(\)/);
  assert.doesNotMatch(program, /capture button|Select.*device/i);
  assert.match(readme, /There is no capture button/);
  assert.match(readme, /No audio samples leave the computer/);
  assert.match(workflow, /windows-audio-bridge:[\s\S]*dotnet publish[\s\S]*BARCODE\.AudioBridge\.exe/);
  assert.match(productionContract, /BARCODE Audio Bridge[\s\S]*WASAPI loopback[\s\S]*creates no Redis or Vercel traffic/);
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
  assert.match([palette.primary, palette.secondary].join(" "), /#00ff88|#7c3aed|#a78bfa|#22d3ee/);
  assert.match(palette.highlight, /#e0e0e0|#ffffff|#a78bfa/);
  assert.match(palette.shadow, /#0[235]0[235]0[235]/);
  assert.doesNotMatch(JSON.stringify(palette), /#ff5a00/);
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
  assert.match(receiver, /drawAmbientLighting|drawGoboShadows|drawCaustics|drawWavefronts|drawParticleField|drawTrackBloom|drawPartyCue|drawShadowCue|drawSignalBreachCue|drawBlackoutCue|drawLightningCue/);
  assert.match(receiver, /drawQueueLanes|drawTrackSignature|drawIntakeAperture|drawSponsorCurtain|drawFinalConvergence|drawCompletionAfterimage|drawPressureEdges/);
  assert.match(receiver, /drawLightRibbons|drawPrismaticShards|drawSignalConstellation|drawMusicHalo|drawSeedComposition/);
  assert.match(receiver, /drawLiquidDream|drawKaleidoscopeBloom|drawSpectralLoom|drawFeedbackArchitecture|drawChromaticSmears|radioVisualComposition/);
  assert.match(receiver, /drawAmbientMoment|radioVisualAmbientMoment|observeSnapshotEvents|drawAutomaticEvent/);
  assert.match(receiver, /wheel_gained|priority_sent|priority_confirmed|track_skipped|sponsor_started|stage_shift/);
  assert.match(receiver, /hashRadioVisualToken\(`\$\{snapshot\.cue\.type\}:\$\{snapshot\.cue\.nonce\}/, "manual cue nonce must vary every repeated effect");
  assert.match(receiver, /lightningMainPath|lightningBranches|drawLightningTree/);
  assert.doesNotMatch(receiver, /function drawBolt\(/, "lightning must use a branching procedural composition rather than generic twin bolts");
  assert.match(receiver, /PALETTE_TRANSITION_MS = 2_400|PARTICLE_TRANSITION_MS = 2_000|radioVisualCueEnvelope/);
  assert.match(receiver, /smoothMusicSignal|radioVisualsMusicSignal/);
  assert.match(receiver, /RADIO_AUDIO_BRIDGE_URL|targetAddressSpace: "loopback"|data-audio-bridge/);
  assert.match(receiver, /if \(!snapshot\.sessionActive\)[\s\S]*setAudioBridgeConnection\("idle"\)/);
  assert.match(engineSource, /source: "analyser" \| "timeline" \| "windows_loopback"/);
  assert.match(engineSource, /RADIO_VISUALS_WHEEL_CENTER_Y_RATIO = 0\.375/);
  const wheelScene = receiver.slice(receiver.indexOf("function drawWheelScene"), receiver.indexOf("function drawPartyCue"));
  assert.match(wheelScene, /height \* RADIO_VISUALS_WHEEL_CENTER_Y_RATIO/);
  assert.doesNotMatch(wheelScene, /height \* 0\.5/);
  assert.match(wheelScene, /gravity lens|RGB channels|burstCount|radioVisualWheelVortexProfile/);
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
  assert.match(receiver, /data-source-aspect="1:1"/);
  assert.match(receiver, /data-source-resolution="1080x1080"/);
  assert.match(receiver, /data-effect-stage-resolution="810x1080"/);
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
