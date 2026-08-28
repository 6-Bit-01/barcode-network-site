import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;
const originalTypeScriptExtension = Module._extensions[".ts"];

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const resolved = path.join(projectRoot, "src", request.slice(2));
    if (fs.existsSync(resolved)) return resolved;
    if (fs.existsSync(`${resolved}.ts`)) return `${resolved}.ts`;
    if (fs.existsSync(`${resolved}.tsx`)) return `${resolved}.tsx`;
    return resolved;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const selection = require("../src/lib/radio-visuals-selection.ts");
const visuals = require("../src/lib/radio-visuals-resolver.ts");
const engine = require("../src/lib/radio-visuals-engine.ts");
const liveOverlay = require("../src/lib/live-overlay.ts");

test.after(() => {
  Module._resolveFilename = originalResolveFilename;
  Module._extensions[".ts"] = originalTypeScriptExtension;
});

function entry(id, index = 0) {
  return {
    id,
    artist: `Artist ${index}`,
    title: `Track ${index}`,
    submittedArtistName: `Artist ${index}`,
    submittedSongTitle: `Track ${index}`,
    sourceType: "spotify",
    lane: "regular",
    tier: "free",
    status: "playing",
    createdAt: `2026-08-21T18:${String(index).padStart(2, "0")}:00.000Z`,
    playedAt: `2026-08-21T19:${String(index).padStart(2, "0")}:00.000Z`,
  };
}

function queueState(current, completedCount, loadedEvents) {
  return {
    nowPlaying: current,
    loadedTrack: current,
    nextInLine: null,
    queue: [],
    history: [],
    totalPlayed: completedCount,
    streamStatus: "online",
    publicStatus: { isOpen: false, activeCount: 20 - completedCount, acceptedCount: 20, pressure: "medium" },
    session: {
      sessionId: "selection-session",
      title: "BARCODE Radio",
      status: "open",
      showStarted: true,
      broadcastPhase: "broadcast_active",
      queueOpen: false,
      wheelSpinsOwed: 0,
      acceptedCount: 20,
      activeCount: 20 - completedCount,
      completedCount,
    },
    isCurrentSession: true,
    playbackDiagnostics: { events: loadedEvents },
  };
}

function nowPlayingScene(current) {
  return {
    sessionActive: true,
    mode: "now_playing",
    resolvedMode: "now_playing",
    reason: "Current track is loaded.",
    title: "NOW PLAYING",
    track: {
      id: current.id,
      artistName: current.submittedArtistName,
      trackTitle: current.submittedSongTitle,
      sourceType: current.sourceType,
    },
    priority: 50,
    automatic: true,
    overrideActive: false,
    wheelOverlayActive: false,
    wheelSpinsOwed: 0,
    updatedAt: current.playedAt,
  };
}

test("music families are dealt as deterministic twenty-card decks without adjacent repeats", () => {
  const deckSize = selection.RADIO_VISUAL_MUSIC_FAMILY_COUNT;
  assert.equal(deckSize, 20);
  assert.equal(deckSize, engine.RADIO_VISUAL_MUSIC_SCENES.length);
  const sequence = Array.from({ length: deckSize * 3 }, (_, ordinal) =>
    selection.radioVisualMusicFamilyIndexForOccurrence("session-alpha", ordinal));
  assert.deepEqual(
    sequence,
    Array.from({ length: deckSize * 3 }, (_, ordinal) =>
      selection.radioVisualMusicFamilyIndexForOccurrence("session-alpha", ordinal)),
    "the same session and occurrence always select the same family",
  );
  for (let start = 0; start < sequence.length; start += deckSize) {
    assert.equal(new Set(sequence.slice(start, start + deckSize)).size, deckSize, "every family must appear before the deck reuses one");
  }
  for (let index = 1; index < sequence.length; index += 1) {
    assert.notEqual(sequence[index], sequence[index - 1], "adjacent loaded occurrences must not repeat a family");
  }
  const anotherSession = Array.from({ length: deckSize }, (_, ordinal) =>
    selection.radioVisualMusicFamilyIndexForOccurrence("session-beta", ordinal));
  assert.notDeepEqual(sequence.slice(0, deckSize), anotherSession, "sessions receive independently shuffled decks");
});

test("family-constrained seeds remain unique per track and match the renderer selector", () => {
  const seeds = [];
  for (let ordinal = 0; ordinal < selection.RADIO_VISUAL_MUSIC_FAMILY_COUNT * 2; ordinal += 1) {
    const familyIndex = selection.radioVisualMusicFamilyIndexForOccurrence("seed-session", ordinal);
    const seed = selection.radioVisualSeedForMusicFamily(`track-${ordinal}:occurrence-${ordinal}`, familyIndex);
    seeds.push(seed);
    assert.equal(selection.radioVisualMusicFamilyIndexForSeed(seed), familyIndex);
    assert.equal(
      engine.RADIO_VISUAL_MUSIC_SCENES.indexOf(engine.radioVisualMusicScene(seed)),
      familyIndex,
      "the selection helper and canvas engine must agree on the family bucket",
    );
  }
  assert.equal(new Set(seeds).size, seeds.length, "each track occurrence retains a unique layout seed");
});

test("successive resolved track snapshots consume a full non-repeating family deck", () => {
  const deckSize = selection.RADIO_VISUAL_MUSIC_FAMILY_COUNT;
  const loadedEvents = [];
  const seeds = [];
  const families = [];
  for (let ordinal = 0; ordinal < deckSize * 2; ordinal += 1) {
    const current = entry(`track-${ordinal}`, ordinal);
    loadedEvents.push({
      sequence: ordinal * 3 + 1,
      trackId: current.id,
      provider: "external",
      eventType: "loaded",
      lifecycleState: "loaded",
      observedAt: current.playedAt,
    });
    const snapshot = visuals.resolveRadioVisualsSnapshot({
      queueState: queueState(current, ordinal, [...loadedEvents].reverse()),
      scene: nowPlayingScene(current),
      now: new Date("2026-08-21T20:00:00.000Z"),
    });
    assert.equal(snapshot.visualMode, "track");
    seeds.push(snapshot.visualSeed);
    families.push(engine.RADIO_VISUAL_MUSIC_SCENES.indexOf(engine.radioVisualMusicScene(snapshot.visualSeed)));
  }
  assert.equal(new Set(seeds).size, deckSize * 2);
  assert.equal(new Set(families.slice(0, deckSize)).size, deckSize);
  assert.equal(new Set(families.slice(deckSize, deckSize * 2)).size, deckSize);
  for (let index = 1; index < families.length; index += 1) assert.notEqual(families[index], families[index - 1]);
});

test("legacy loaded entries use playedAt when playback diagnostics are absent", () => {
  const current = entry("legacy-loaded", 4);
  const state = queueState(current, 4, []);
  delete state.playbackDiagnostics;
  assert.deepEqual(selection.radioVisualTrackOccurrence(state), {
    trackId: current.id,
    occurredAt: current.playedAt,
    ordinal: 4,
  });

  const olderWheel = {
    mode: "wheel_ready",
    wheelOverlayActive: true,
    wheelCeremonyStatus: "ready",
    wheelCeremonyStartedAt: "2026-08-21T19:00:00.000Z",
    updatedAt: "2026-08-21T19:08:00.000Z",
  };
  assert.equal(liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: olderWheel,
    queueState: state,
    now: new Date("2026-08-21T19:08:30.000Z"),
  }).mode, "now_playing");
});

test("finished and skipped tracks advance the family occurrence ordinal", () => {
  const finished = { ...entry("finished", 0), status: "played", playbackOutcome: "finished" };
  const skipped = { ...entry("skipped", 1), status: "played", playbackOutcome: "skipped" };
  const states = [
    queueState(entry("first", 0), 0, []),
    { ...queueState(entry("after-finish", 1), 1, []), history: [finished] },
    { ...queueState(entry("after-skip", 2), 2, []), history: [skipped, finished] },
  ];
  const ordinals = states.map((state) => selection.radioVisualTrackOccurrence(state)?.ordinal);
  assert.deepEqual(ordinals, [0, 1, 2]);
  const families = ordinals.map((ordinal) =>
    selection.radioVisualMusicFamilyIndexForOccurrence("selection-session", ordinal));
  assert.equal(new Set(families).size, 3, "finish and skip both move to the next card in the shuffled deck");
});

test("a loaded song owns visuals regardless of Wheel timestamps or queue alias", () => {
  const current = entry("loaded-song-wins", 3);
  const state = queueState(current, 3, [{
    sequence: 10,
    trackId: current.id,
    provider: "external",
    eventType: "loaded",
    lifecycleState: "loaded",
    observedAt: "2026-08-21T19:03:00.000Z",
  }]);
  const activeWheel = {
    mode: "wheel_ready",
    wheelOverlayActive: true,
    wheelCeremonyStatus: "ready",
    wheelCeremonySeed: "wheel-seed",
    wheelCeremonyStartedAt: "2026-08-21T19:10:00.000Z",
    updatedAt: "2026-08-21T19:10:00.000Z",
  };

  for (const wheelCeremonyStatus of ["ready", "spinning", "result_pending"]) {
    const overlayState = {
      ...activeWheel,
      wheelCeremonyStatus,
      wheelCeremonySpinStartedAt: "2026-08-21T19:10:00.000Z",
    };
    const resolved = liveOverlay.resolveLiveOverlaySceneFromQueueState({
      overlayState,
      queueState: state,
      now: new Date("2026-08-21T19:10:30.000Z"),
    });
    assert.equal(resolved.mode, "now_playing", `${wheelCeremonyStatus} must yield while a song is loaded`);
    assert.equal(resolved.track?.id, current.id);
  }

  const loadedTrackOnly = { ...state, nowPlaying: null, loadedTrack: current };
  assert.equal(liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: activeWheel,
    queueState: loadedTrackOnly,
    now: new Date("2026-08-21T19:10:30.000Z"),
  }).mode, "now_playing", "loadedTrack must remain a complete current-song alias");
});

test("the Show Visuals scene completely ignores sponsor-break state", () => {
  const current = entry("sponsor-independent-song", 5);
  const state = queueState(current, 5, []);
  state.session.sponsorBreakStatus = "running";
  const overlayState = {};

  assert.equal(liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState,
    queueState: state,
    now: new Date("2026-08-21T19:10:30.000Z"),
  }).mode, "sponsor", "the commercial/live-overlay source retains sponsor behavior");

  const visualScene = liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState,
    queueState: state,
    now: new Date("2026-08-21T19:10:30.000Z"),
    ignoreSponsorBreak: true,
  });
  assert.equal(visualScene.mode, "now_playing", "Show Visuals must keep following the loaded song");
  assert.equal(visuals.resolveRadioVisualsSnapshot({ queueState: state, scene: visualScene }).visualMode, "track");

  const betweenSongs = queueState(null, 6, []);
  betweenSongs.session.sponsorBreakStatus = "running";
  assert.equal(liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState,
    queueState: betweenSongs,
    ignoreSponsorBreak: true,
  }).mode, "session_active", "sponsor state must not even replace the visual idle scene");
});

test("the Wheel exists only when explicitly active between songs", () => {
  const betweenSongs = queueState(null, 4, []);
  const launchedWheel = {
    mode: "wheel_ready",
    wheelOverlayActive: true,
    wheelCeremonyStatus: "ready",
    wheelCeremonySeed: "between-song-wheel",
    updatedAt: "2026-08-21T19:12:00.000Z",
  };
  assert.equal(liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: launchedWheel,
    queueState: betweenSongs,
    now: new Date("2026-08-21T19:12:30.000Z"),
  }).mode, "wheel_ready");

  const down = liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: { ...launchedWheel, wheelOverlayActive: false },
    queueState: betweenSongs,
    now: new Date("2026-08-21T19:12:30.000Z"),
  });
  assert.equal(down.mode.startsWith("wheel_"), false, "a down Wheel overlay cannot leave its mechanism running");
});

test("stored Wheel normalization preserves an explicit down flag", () => {
  const down = liveOverlay.normalizeLiveOverlayState({
    mode: "wheel_spinning",
    wheelOverlayActive: false,
    wheelCeremonyStatus: "spinning",
  });
  assert.equal(down.wheelOverlayActive, false, "a stale Wheel mode cannot relaunch an explicitly cleared overlay");
  assert.equal(down.wheelCeremonyStatus, "idle", "clearing the overlay ends the normalized Wheel mechanism");

  const legacy = liveOverlay.normalizeLiveOverlayState({
    mode: "wheel_spinning",
    wheelCeremonyStatus: "spinning",
  });
  assert.equal(legacy.wheelOverlayActive, true, "legacy records without an active flag retain their Wheel mode fallback");
  assert.equal(legacy.wheelCeremonyStatus, "spinning");
});

test("music transition state ignores every between-song seed", () => {
  const first = engine.advanceRadioVisualMusicTransition({
    currentSeed: 10,
    previousSeed: 10,
    startedAtMs: 0,
  }, "track", 101, 1_000);
  assert.deepEqual(first, { currentSeed: 101, previousSeed: 10, startedAtMs: 1_000 });

  const queueGap = engine.advanceRadioVisualMusicTransition(first, "queue", 202, 2_000);
  const wheelGap = engine.advanceRadioVisualMusicTransition(queueGap, "wheel", 303, 3_000);
  assert.equal(queueGap, first);
  assert.equal(wheelGap, first);

  const second = engine.advanceRadioVisualMusicTransition(wheelGap, "track", 404, 4_000);
  assert.deepEqual(second, { currentSeed: 404, previousSeed: 101, startedAtMs: 4_000 });
});
