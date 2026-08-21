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

test("music families are dealt as deterministic ten-card decks without adjacent repeats", () => {
  const sequence = Array.from({ length: 30 }, (_, ordinal) =>
    selection.radioVisualMusicFamilyIndexForOccurrence("session-alpha", ordinal));
  assert.deepEqual(
    sequence,
    Array.from({ length: 30 }, (_, ordinal) =>
      selection.radioVisualMusicFamilyIndexForOccurrence("session-alpha", ordinal)),
    "the same session and occurrence always select the same family",
  );
  for (let start = 0; start < sequence.length; start += selection.RADIO_VISUAL_MUSIC_FAMILY_COUNT) {
    assert.equal(new Set(sequence.slice(start, start + 10)).size, 10, "every family must appear before the deck reuses one");
  }
  for (let index = 1; index < sequence.length; index += 1) {
    assert.notEqual(sequence[index], sequence[index - 1], "adjacent loaded occurrences must not repeat a family");
  }
  const anotherSession = Array.from({ length: 10 }, (_, ordinal) =>
    selection.radioVisualMusicFamilyIndexForOccurrence("session-beta", ordinal));
  assert.notDeepEqual(sequence.slice(0, 10), anotherSession, "sessions receive independently shuffled decks");
});

test("family-constrained seeds remain unique per track and match the renderer selector", () => {
  const seeds = [];
  for (let ordinal = 0; ordinal < 20; ordinal += 1) {
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
  const loadedEvents = [];
  const seeds = [];
  const families = [];
  for (let ordinal = 0; ordinal < 20; ordinal += 1) {
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
  assert.equal(new Set(seeds).size, 20);
  assert.equal(new Set(families.slice(0, 10)).size, 10);
  assert.equal(new Set(families.slice(10, 20)).size, 10);
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

  assert.equal(liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: { ...olderWheel, wheelCeremonyStartedAt: "2026-08-21T19:05:00.000Z" },
    queueState: state,
    now: new Date("2026-08-21T19:08:30.000Z"),
  }).mode, "wheel_ready", "a Wheel explicitly launched after the legacy load still wins");
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

test("a later loaded track supersedes an older Wheel ceremony, while a newly launched Wheel still wins", () => {
  const current = entry("later-track", 3);
  const state = queueState(current, 3, [{
    sequence: 10,
    trackId: current.id,
    provider: "external",
    eventType: "loaded",
    lifecycleState: "loaded",
    observedAt: "2026-08-21T19:03:00.000Z",
  }]);
  const baseOverlayState = {
    mode: "wheel_ready",
    wheelOverlayActive: true,
    wheelCeremonyStatus: "ready",
    wheelCeremonySeed: "wheel-seed",
    updatedAt: "2026-08-21T19:00:00.000Z",
  };

  for (const wheelCeremonyStatus of ["ready", "spinning", "result_pending"]) {
    const olderWheel = {
      ...baseOverlayState,
      wheelCeremonyStatus,
      wheelCeremonyStartedAt: "2026-08-21T19:00:00.000Z",
      wheelCeremonySpinStartedAt: "2026-08-21T19:01:00.000Z",
    };
    const resolved = liveOverlay.resolveLiveOverlaySceneFromQueueState({
      overlayState: olderWheel,
      queueState: state,
      now: new Date("2026-08-21T19:04:00.000Z"),
    });
    assert.equal(resolved.mode, "now_playing", `${wheelCeremonyStatus} must yield to the later loaded occurrence`);
    assert.equal(resolved.track?.id, current.id);
    assert.equal(olderWheel.wheelCeremonyStatus, wheelCeremonyStatus, "projection must not mutate the stored Wheel state");
  }

  const newerWheel = {
    ...baseOverlayState,
    wheelCeremonyStartedAt: "2026-08-21T19:05:00.000Z",
    updatedAt: "2026-08-21T19:05:00.000Z",
  };
  const resolved = liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: newerWheel,
    queueState: state,
    now: new Date("2026-08-21T19:05:30.000Z"),
  });
  assert.equal(resolved.mode, "wheel_ready", "a Wheel launched after the track load must retain priority");
});

test("cue updates cannot revive an undated Wheel over a known loaded occurrence", () => {
  const current = entry("cue-safe-track", 5);
  const state = queueState(current, 5, [{
    sequence: 16,
    trackId: current.id,
    provider: "external",
    eventType: "loaded",
    lifecycleState: "loaded",
    observedAt: current.playedAt,
  }]);
  const resolved = liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: {
      mode: "wheel_ready",
      wheelOverlayActive: true,
      wheelCeremonyStatus: "ready",
      visualCueType: "lightning",
      visualCueStartedAt: "2026-08-21T19:09:00.000Z",
      updatedAt: "2026-08-21T19:09:00.000Z",
    },
    queueState: state,
    now: new Date("2026-08-21T19:09:30.000Z"),
  });
  assert.equal(resolved.mode, "now_playing", "only a Wheel-specific launch timestamp can establish newer priority");
});

test("a superseded Wheel stays hidden after unload until a later Wheel launch", () => {
  const completed = { ...entry("completed-track", 6), status: "played", completedAt: "2026-08-21T19:07:00.000Z" };
  const state = {
    ...queueState(null, 7, [{
      sequence: 19,
      trackId: completed.id,
      provider: "external",
      eventType: "loaded",
      lifecycleState: "loaded",
      observedAt: completed.playedAt,
    }]),
    history: [completed],
  };
  const olderWheel = {
    mode: "wheel_result_pending",
    wheelOverlayActive: true,
    wheelCeremonyStatus: "result_pending",
    wheelCeremonyStartedAt: "2026-08-21T19:00:00.000Z",
    updatedAt: "2026-08-21T19:07:30.000Z",
  };
  const betweenTracks = liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: olderWheel,
    queueState: state,
    now: new Date("2026-08-21T19:08:00.000Z"),
  });
  assert.equal(betweenTracks.mode.startsWith("wheel_"), false, "the older Wheel must not reappear when the loaded track clears");

  const relaunched = liveOverlay.resolveLiveOverlaySceneFromQueueState({
    overlayState: { ...olderWheel, mode: "wheel_ready", wheelCeremonyStatus: "ready", wheelCeremonyStartedAt: "2026-08-21T19:08:30.000Z" },
    queueState: state,
    now: new Date("2026-08-21T19:09:00.000Z"),
  });
  assert.equal(relaunched.mode, "wheel_ready", "a fresh Wheel launch after unload reclaims priority");
});
