import {
  clampVisualValue,
  type RadioVisualAudioDrives,
  type RadioVisualAudioReactionState,
  type RadioVisualMusicSignal,
} from "./radio-visuals-engine";

/**
 * Fast, browser-local articulation layered over the accepted thirty-family
 * reaction engine. The native bridge owns analysis; this seam only preserves
 * short band changes that would otherwise disappear inside sustained level.
 */
export interface RadioVisualLiveDynamicsState {
  bassFast: number;
  midFast: number;
  trebleFast: number;
  bassFlux: number;
  midFlux: number;
  trebleFlux: number;
}

export interface RadioVisualLiveDynamicsFrame {
  state: RadioVisualLiveDynamicsState;
  drives: RadioVisualAudioDrives;
}

export function radioVisualLiveDynamicsInitialState(): RadioVisualLiveDynamicsState {
  return {
    bassFast: 0,
    midFast: 0,
    trebleFast: 0,
    bassFlux: 0,
    midFlux: 0,
    trebleFlux: 0,
  };
}

function follower(current: number, target: number, elapsedMs: number, attackMs: number, releaseMs: number): number {
  const responseMs = target > current ? attackMs : releaseMs;
  return current + (target - current) * (1 - Math.exp(-elapsedMs / responseMs));
}

function flux(
  previousFlux: number,
  level: number,
  previousFast: number,
  slowReference: number,
  elapsedMs: number,
  gate: number,
  contrastGain: number,
  riseGain: number,
  releaseMs: number,
): number {
  const directRise = Math.max(0, level - previousFast - gate * 0.45) * riseGain;
  // A changing passage may stay above its slow reference for several frames.
  // Keep that musical contour visible without turning it into another full-hit
  // clock; only a genuinely sharp arrival may reach the hard-pulse ceiling.
  const relativeRise = Math.min(0.46, Math.max(0, level - slowReference - gate) * contrastGain);
  return clampVisualValue(Math.max(
    previousFlux * Math.exp(-elapsedMs / releaseMs),
    directRise,
    relativeRise,
  ));
}

function smoothstep(value: number): number {
  const bounded = clampVisualValue(value);
  return bounded * bounded * (3 - 2 * bounded);
}

function spectralCharacter(level: number, otherA: number, otherB: number): number {
  const otherMean = (otherA + otherB) * 0.5;
  const ownership = smoothstep(0.5 + (level - otherMean) * 1.9);
  return clampVisualValue(level * (0.3 + ownership * 0.9));
}

function layerActivation(level: number, threshold: number, ceiling: number): number {
  return clampVisualValue(Math.pow(
    clampVisualValue((level - threshold) / Math.max(0.001, ceiling - threshold)),
    1.04,
  ));
}

export function advanceRadioVisualLiveDynamics(
  state: RadioVisualLiveDynamicsState,
  signal: RadioVisualMusicSignal,
  drives: RadioVisualAudioDrives,
  references: Pick<RadioVisualAudioReactionState, "bassSlow" | "midSlow" | "trebleSlow">,
  elapsedMs: number,
): RadioVisualLiveDynamicsFrame {
  const safeElapsedMs = clampVisualValue(elapsedMs, 0, 1_000);
  const bassFast = follower(state.bassFast, signal.bass, safeElapsedMs, 34, 58);
  const midFast = follower(state.midFast, signal.mid, safeElapsedMs, 26, 44);
  const trebleFast = follower(state.trebleFast, signal.treble, safeElapsedMs, 18, 32);
  const bassFlux = flux(state.bassFlux, signal.bass, state.bassFast, references.bassSlow, safeElapsedMs, 0.012, 1.55, 8.2, 112);
  const midFlux = flux(state.midFlux, signal.mid, state.midFast, references.midSlow, safeElapsedMs, 0.009, 1.8, 9, 86);
  const trebleFlux = flux(state.trebleFlux, signal.treble, state.trebleFast, references.trebleSlow, safeElapsedMs, 0.007, 2.05, 9.8, 64);

  const bassCharacter = spectralCharacter(drives.bass, drives.mid, drives.treble);
  const midCharacter = spectralCharacter(drives.mid, drives.bass, drives.treble);
  const trebleCharacter = spectralCharacter(drives.treble, drives.bass, drives.mid);
  const bass = clampVisualValue(drives.bass * 0.22 + bassCharacter * 0.94);
  const mid = clampVisualValue(drives.mid * 0.22 + midCharacter * 0.94);
  const treble = clampVisualValue(drives.treble * 0.22 + trebleCharacter * 0.94);
  const bassPulse = Math.max(drives.bassPulse, bassFlux);
  const midPulse = Math.max(drives.midPulse, midFlux);
  const treblePulse = Math.max(drives.treblePulse, trebleFlux);
  const strongestFlux = Math.max(bassFlux, midFlux, trebleFlux);
  const instantStructure = clampVisualValue(
    drives.body * 0.3
      + bassCharacter * 0.2
      + midCharacter * 0.24
      + trebleCharacter * 0.14
      + drives.tapestry * 0.12,
  );

  return {
    state: { bassFast, midFast, trebleFast, bassFlux, midFlux, trebleFlux },
    drives: {
      ...drives,
      bass,
      mid,
      treble,
      bassLayer: layerActivation(bassCharacter, 0.014, 0.76),
      midLayer: layerActivation(midCharacter, 0.012, 0.74),
      trebleLayer: layerActivation(trebleCharacter, 0.01, 0.7),
      impact: clampVisualValue(Math.max(drives.impact, strongestFlux * 0.92)),
      bassPulse,
      midPulse,
      treblePulse,
      tapestryPulse: clampVisualValue(Math.min(bassPulse, midPulse, treblePulse) * 1.08),
      build: clampVisualValue(Math.max(drives.build * 0.62, instantStructure * 0.82 + strongestFlux * 0.12)),
    },
  };
}
