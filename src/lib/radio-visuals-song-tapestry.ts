import {
  clampVisualValue,
  radioVisualPerceptualAudioDrives,
} from "./radio-visuals-engine";
import type {
  RadioVisualAudioDrives,
  RadioVisualMusicScene,
} from "./radio-visuals-engine";

export type RadioVisualFeedbackMode = "zoom" | "orbit" | "drift" | "ripple" | "split" | "echo";
export type RadioVisualSongSection = "silence" | "sparse" | "flow" | "build" | "dense" | "release";

export interface RadioVisualSongFingerprintState {
  available: boolean;
  elapsedMs: number;
  low: number;
  body: number;
  voice: number;
  high: number;
  brightness: number;
  contrast: number;
  transientDensity: number;
  spread: number;
  balance: number;
  waveformRoughness: number;
  fastEnergy: number;
  slowEnergy: number;
  rise: number;
  release: number;
  impactMemory: number;
}

export interface RadioVisualSongTapestryPlan {
  active: boolean;
  mode: RadioVisualFeedbackMode;
  section: RadioVisualSongSection;
  feedbackAlpha: number;
  scale: number;
  rotation: number;
  driftX: number;
  driftY: number;
  ripple: number;
  sliceCount: number;
  echoCount: number;
  mirrorMix: number;
  additiveMix: number;
  tintMix: number;
  tintBias: number;
  visibilityTarget: number;
}

export const RADIO_VISUAL_SONG_FINGERPRINT_INITIAL_STATE: RadioVisualSongFingerprintState = Object.freeze({
  available: false,
  elapsedMs: 0,
  low: 0,
  body: 0,
  voice: 0,
  high: 0,
  brightness: 0,
  contrast: 0,
  transientDensity: 0,
  spread: 0,
  balance: 0,
  waveformRoughness: 0,
  fastEnergy: 0,
  slowEnergy: 0,
  rise: 0,
  release: 0,
  impactMemory: 0,
});

const FEEDBACK_MODES: readonly RadioVisualFeedbackMode[] = [
  "zoom",
  "orbit",
  "drift",
  "ripple",
  "split",
  "echo",
];

function response(current: number, target: number, elapsedMs: number, responseMs: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, elapsedMs) / responseMs));
}

function sceneUnit(scene: RadioVisualMusicScene, salt: number): number {
  let hash = 2_166_136_261 ^ salt;
  for (let index = 0; index < scene.length; index += 1) {
    hash ^= scene.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function waveformRoughness(waveform: readonly number[]): number {
  if (waveform.length < 2) return 0;
  let difference = 0;
  for (let index = 1; index < waveform.length; index += 1) {
    difference += Math.abs(waveform[index] - waveform[index - 1]);
  }
  return clampVisualValue(difference / Math.max(1, waveform.length - 1));
}

/**
 * Learn one slow, bounded identity for the current song while retaining fast
 * evidence for builds and releases. This is visual memory only: it is reset
 * when the loaded-track seed changes and is never stored or transmitted.
 */
export function advanceRadioVisualSongFingerprint(
  state: RadioVisualSongFingerprintState,
  drives: RadioVisualAudioDrives,
  elapsedMs: number,
): RadioVisualSongFingerprintState {
  const features = drives.perceptual;
  if (!features) return RADIO_VISUAL_SONG_FINGERPRINT_INITIAL_STATE;

  const levels = features.levels;
  const rawLow = clampVisualValue(levels.subBass * 0.58 + levels.bass * 0.42);
  const rawBody = clampVisualValue(levels.lowMid * 0.52 + levels.mid * 0.48);
  const rawVoice = clampVisualValue(levels.highMid * 0.48 + levels.presence * 0.52);
  const rawHigh = clampVisualValue(levels.brilliance * 0.62 + levels.air * 0.38);
  const rawEnergy = clampVisualValue((rawLow + rawBody + rawVoice + rawHigh) / 4);
  const strongestOnset = Math.max(...Object.values(features.onsets));
  const firstFrame = !state.available;
  const fingerprintResponseMs = 7_500;
  const learned = (current: number, target: number) => firstFrame
    ? target
    : response(current, target, elapsedMs, fingerprintResponseMs);
  const fastEnergy = firstFrame ? rawEnergy : response(state.fastEnergy, rawEnergy, elapsedMs, 220);
  const slowEnergy = firstFrame ? rawEnergy : response(state.slowEnergy, rawEnergy, elapsedMs, 3_600);
  const rise = clampVisualValue((fastEnergy - slowEnergy) * 4.8);
  const release = clampVisualValue((slowEnergy - fastEnergy) * 4.2);
  const impactMemory = Math.max(
    strongestOnset,
    state.impactMemory * Math.exp(-Math.max(0, elapsedMs) / 620),
  );

  return {
    available: true,
    elapsedMs: state.elapsedMs + Math.max(0, elapsedMs),
    low: learned(state.low, rawLow),
    body: learned(state.body, rawBody),
    voice: learned(state.voice, rawVoice),
    high: learned(state.high, rawHigh),
    brightness: learned(state.brightness, features.brightness),
    contrast: learned(state.contrast, features.dynamicRange),
    transientDensity: learned(state.transientDensity, features.transientDensity),
    spread: learned(state.spread, features.stereoWidth),
    balance: learned(state.balance, features.stereoBalance),
    waveformRoughness: learned(state.waveformRoughness, waveformRoughness(features.waveform)),
    fastEnergy,
    slowEnergy,
    rise,
    release,
    impactMemory: clampVisualValue(impactMemory),
  };
}

export function radioVisualSongSection(state: RadioVisualSongFingerprintState): RadioVisualSongSection {
  if (!state.available || Math.max(state.fastEnergy, state.slowEnergy, state.impactMemory) < 0.018) return "silence";
  if (state.rise > 0.14) return "build";
  if (state.release > 0.13) return "release";
  if (state.fastEnergy > 0.46 || state.impactMemory > 0.58) return "dense";
  if (state.fastEnergy < 0.17) return "sparse";
  return "flow";
}

/**
 * Apply slow song identity and current section motion to the existing authored
 * hooks. Pulses remain untouched; the fingerprint can steer morphology and
 * visibility but cannot invent a kick, snare, or high-frequency arrival.
 */
export function radioVisualSongShapedDrives(
  scene: RadioVisualMusicScene,
  drives: RadioVisualAudioDrives,
  fingerprint: RadioVisualSongFingerprintState,
): RadioVisualAudioDrives {
  const sceneDrives = radioVisualPerceptualAudioDrives(scene, drives);
  if (!fingerprint.available || !sceneDrives.perceptual) return sceneDrives;
  const lowBias = sceneUnit(scene, 101) * 0.18 - 0.09;
  const voiceBias = sceneUnit(scene, 211) * 0.18 - 0.09;
  const highBias = sceneUnit(scene, 307) * 0.18 - 0.09;
  const fingerprintEnergy = (fingerprint.low + fingerprint.body + fingerprint.voice + fingerprint.high) / 4;
  const sonicMorph = clampVisualValue(
    fingerprint.low * (0.24 + lowBias)
      + fingerprint.body * 0.24
      + fingerprint.voice * (0.24 + voiceBias)
      + fingerprint.high * (0.18 + highBias)
      + fingerprint.spread * 0.05
      + fingerprint.waveformRoughness * 0.05,
  );
  const sectionMorph = clampVisualValue(
    sonicMorph * 0.64
      + fingerprint.rise * 0.2
      + fingerprint.release * 0.08
      + fingerprint.impactMemory * 0.08,
  );
  const phraseOffset = (
    fingerprint.brightness * (0.06 + sceneUnit(scene, 401) * 0.09)
      + fingerprint.spread * (0.03 + sceneUnit(scene, 503) * 0.07)
      + (fingerprint.balance + 1) * 0.025
  ) % 1;
  return {
    ...sceneDrives,
    presence: clampVisualValue(Math.max(
      sceneDrives.presence,
      fingerprintEnergy * (0.9 + sceneUnit(scene, 601) * 0.18),
    )),
    build: clampVisualValue(sceneDrives.build * 0.58 + sectionMorph * 0.42),
    phrase: (sceneDrives.phrase + phraseOffset) % 1,
  };
}

/**
 * A MilkDrop/AVS-style bounded feedback plan. Each family owns a stable module
 * grammar while the song fingerprint controls its persistence, direction,
 * color bias, echo depth, and section behavior.
 */
export function radioVisualSongTapestryPlan(
  scene: RadioVisualMusicScene,
  fingerprint: RadioVisualSongFingerprintState,
): RadioVisualSongTapestryPlan {
  const section = radioVisualSongSection(fingerprint);
  const activeEnergy = Math.max(fingerprint.fastEnergy, fingerprint.slowEnergy, fingerprint.impactMemory * 0.72);
  const active = fingerprint.available && activeEnergy > 0.012;
  const mode = FEEDBACK_MODES[Math.min(
    FEEDBACK_MODES.length - 1,
    Math.floor(sceneUnit(scene, 701) * FEEDBACK_MODES.length),
  )];
  const direction = sceneUnit(scene, 809) > 0.5 ? 1 : -1;
  const spectralTilt = clampVisualValue((fingerprint.high + fingerprint.voice - fingerprint.low - fingerprint.body + 2) / 4) * 2 - 1;
  const motionCharacter = clampVisualValue(
    fingerprint.transientDensity * 0.14
      + fingerprint.waveformRoughness * 0.28
      + fingerprint.spread * 0.2
      + fingerprint.contrast * 0.18
      + fingerprint.impactMemory * 0.2,
  );
  const memoryGate = clampVisualValue(activeEnergy * 3.2);
  const sectionPersistence = section === "sparse" ? -0.035
    : section === "dense" ? 0.045
      : section === "release" ? 0.075
        : section === "build" ? 0.025
          : 0;
  const feedbackAlpha = active ? clampVisualValue(
    0.62
      + fingerprint.spread * 0.08
      + fingerprint.contrast * 0.05
      + (1 - fingerprint.transientDensity) * 0.04
      + sectionPersistence
      + memoryGate * 0.08,
    0.58,
    0.9,
  ) : 0;
  const scaleDirection = sceneUnit(scene, 907) > 0.5 ? 1 : -1;
  const scale = clampVisualValue(
    1
      + scaleDirection * (fingerprint.low - fingerprint.high) * 0.006
      + fingerprint.rise * 0.005
      - fingerprint.release * 0.003,
    0.989,
    1.013,
  );
  const rotation = direction * (
    0.0008
      + fingerprint.spread * 0.0026
      + Math.abs(fingerprint.balance) * 0.0022
      + motionCharacter * 0.0015
  );
  const driftScale = 0.0008 + fingerprint.spread * 0.0035 + fingerprint.balance * direction * 0.0015;

  return {
    active,
    mode,
    section,
    feedbackAlpha,
    scale,
    rotation,
    driftX: direction * driftScale,
    driftY: (sceneUnit(scene, 1_009) - 0.5) * (0.0012 + motionCharacter * 0.004),
    ripple: (0.0015 + motionCharacter * 0.011) * direction,
    sliceCount: 6 + Math.round(
      fingerprint.transientDensity * 2
        + fingerprint.high * 3
        + fingerprint.waveformRoughness * 3,
    ),
    echoCount: 1 + Math.round(fingerprint.spread * 1.4 + fingerprint.contrast * 0.8),
    mirrorMix: clampVisualValue(fingerprint.spread * 0.58 + fingerprint.balance * direction * 0.2 + sceneUnit(scene, 1_103) * 0.22),
    additiveMix: clampVisualValue(fingerprint.brightness * 0.46 + fingerprint.high * 0.28 + fingerprint.impactMemory * 0.16),
    tintMix: clampVisualValue(0.035 + fingerprint.brightness * 0.08 + Math.abs(spectralTilt) * 0.045),
    tintBias: spectralTilt,
    visibilityTarget: 0.072 + sceneUnit(scene, 1_207) * 0.016,
  };
}

export function advanceRadioVisualVisibilityBoost(
  current: number,
  measuredVisibility: number,
  targetVisibility: number,
  elapsedMs: number,
): number {
  const safeTarget = Math.max(0.001, targetVisibility);
  const targetBoost = clampVisualValue((safeTarget - measuredVisibility) / safeTarget);
  const responseMs = targetBoost > current ? 620 : 2_200;
  return clampVisualValue(response(current, targetBoost, elapsedMs, responseMs));
}
