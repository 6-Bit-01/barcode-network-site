import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const tracePaths = process.argv.slice(2);
if (tracePaths.length === 0) {
  process.stderr.write("Usage: node scripts/replay-radio-audio-trace.mjs <trace.ndjson> [more traces...]\n");
  process.exitCode = 1;
} else {
  const originalExtension = Module._extensions[".ts"];
  Module._extensions[".ts"] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };

  try {
    const require = createRequire(import.meta.url);
    const audioBridge = require("../src/lib/radio-audio-bridge.ts");
    const engine = require("../src/lib/radio-visuals-engine.ts");
    const liveDynamics = require("../src/lib/radio-visuals-live-dynamics.ts");
    const summaries = tracePaths.map((tracePath) => replayTrace(
      path.resolve(tracePath),
      audioBridge,
      engine,
      liveDynamics,
    ));
    process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);
  } finally {
    Module._extensions[".ts"] = originalExtension;
  }
}

function replayTrace(tracePath, audioBridge, engine, liveDynamics) {
  const lines = fs.readFileSync(tracePath, "utf8").split(/\r?\n/).filter(Boolean);
  const signals = [];
  let rejectedLines = 0;
  let duplicateFrames = 0;
  let previousSequence = -1;
  for (const line of lines) {
    try {
      const signal = audioBridge.normalizeRadioAudioBridgeSignal(JSON.parse(line));
      if (!signal) {
        rejectedLines += 1;
      } else if (signal.sequence === previousSequence) {
        duplicateFrames += 1;
      } else {
        signals.push(signal);
        previousSequence = signal.sequence;
      }
    } catch {
      rejectedLines += 1;
    }
  }
  if (signals.length === 0) throw new Error(`No valid audio signal frames in ${tracePath}`);

  let reactionState = engine.radioVisualAudioReactionInitialState();
  let dynamicsState = liveDynamics.radioVisualLiveDynamicsInitialState();
  const drives = [];
  for (let index = 0; index < signals.length; index += 1) {
    const signal = signals[index];
    const prior = index > 0 ? signals[index - 1] : null;
    const elapsedMs = prior
      ? Math.min(1_000, Math.max(1, signal.capturedAtUnixMs - prior.capturedAtUnixMs))
      : 25;
    const playbackSeconds = Math.max(0, (signal.capturedAtUnixMs - signals[0].capturedAtUnixMs) / 1_000);
    const music = engine.radioVisualsMusicSignal(traceSnapshot(playbackSeconds), playbackSeconds, playbackSeconds, signal, playbackSeconds);
    const reaction = engine.advanceRadioVisualAudioReaction(reactionState, music, elapsedMs);
    const dynamics = liveDynamics.advanceRadioVisualLiveDynamics(
      dynamicsState,
      music,
      reaction.drives,
      reaction.state,
      elapsedMs,
    );
    reactionState = reaction.state;
    dynamicsState = dynamics.state;
    drives.push(dynamics.drives);
  }

  const features = signals.filter((signal) => signal.features).map((signal) => signal.features);
  const durationMilliseconds = Math.max(
    0,
    signals.at(-1).capturedAtUnixMs - signals[0].capturedAtUnixMs,
  );
  const legacyChannels = ["energy", "bass", "mid", "treble", "peak", "beat"];
  const driveChannels = [
    "body",
    "bass",
    "mid",
    "treble",
    "bassPulse",
    "midPulse",
    "treblePulse",
    "tapestryPulse",
    "build",
  ];
  return {
    trace: tracePath,
    validFrames: signals.length,
    rejectedLines,
    duplicateFrames,
    durationSeconds: round(durationMilliseconds / 1_000),
    signal: Object.fromEntries(legacyChannels.map((channel) => [
      channel,
      statistics(signals.map((signal) => signal[channel])),
    ])),
    legacyBandCorrelation: {
      bassMid: round(correlation(signals.map((signal) => signal.bass), signals.map((signal) => signal.mid))),
      bassTreble: round(correlation(signals.map((signal) => signal.bass), signals.map((signal) => signal.treble))),
      midTreble: round(correlation(signals.map((signal) => signal.mid), signals.map((signal) => signal.treble))),
    },
    perceptualFeatures: features.length > 0 ? {
      frames: features.length,
      levels: Object.fromEntries(audioBridge.RADIO_AUDIO_BRIDGE_PERCEPTUAL_BAND_NAMES.map((band) => [
        band,
        statistics(features.map((feature) => feature.levels[band])),
      ])),
      onsets: Object.fromEntries(audioBridge.RADIO_AUDIO_BRIDGE_PERCEPTUAL_BAND_NAMES.map((band) => [
        band,
        statistics(features.map((feature) => feature.onsets[band])),
      ])),
      spectralCentroid: statistics(features.map((feature) => feature.spectralCentroid)),
      brightness: statistics(features.map((feature) => feature.brightness)),
      dynamicRange: statistics(features.map((feature) => feature.dynamicRange)),
      transientDensity: statistics(features.map((feature) => feature.transientDensity)),
      stereoWidth: statistics(features.map((feature) => feature.stereoWidth)),
      stereoBalance: statistics(features.map((feature) => feature.stereoBalance)),
    } : null,
    productionReactionReplay: Object.fromEntries(driveChannels.map((channel) => [
      channel,
      statistics(drives.map((drive) => drive[channel])),
    ])),
  };
}

function traceSnapshot(playbackSeconds) {
  return {
    sessionActive: true,
    showStage: "middle",
    visualMode: "track",
    visualSeed: 2_166_136_261,
    player: {
      playbackState: "playing",
      currentTimeSeconds: playbackSeconds,
      durationSeconds: 240,
      audioEnergy: null,
      audioBands: null,
      audioPeak: null,
    },
    timeline: null,
  };
}

function statistics(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  return {
    min: round(finite[0]),
    p10: round(percentile(finite, 0.1)),
    median: round(percentile(finite, 0.5)),
    p90: round(percentile(finite, 0.9)),
    max: round(finite.at(-1)),
    mean: round(mean),
    standardDeviation: round(Math.sqrt(variance)),
  };
}

function percentile(sorted, position) {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function correlation(left, right) {
  const count = Math.min(left.length, right.length);
  if (count === 0) return 0;
  const leftMean = left.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
  const rightMean = right.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < count; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 1e-12 ? covariance / denominator : 0;
}

function round(value) {
  return Number(Number(value).toFixed(5));
}
