import type { RadioVisualCue } from "./radio-visuals-cues";
import type { RadioAudioBridgeSignal } from "./radio-audio-bridge";
import { hashRadioVisualToken } from "./radio-visuals-events";
import type { RadioVisualsShowStage, RadioVisualsSnapshot } from "./radio-visuals-resolver";

export const RADIO_VISUALS_CHROMA_KEY = "#ff5a00";
export const RADIO_VISUALS_WHEEL_CENTER_Y_RATIO = 0.375;
export const RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO = 3 / 4;

export interface RadioVisualEffectStageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function radioVisualsEffectStageBounds(sourceWidth: number, sourceHeight: number): RadioVisualEffectStageBounds {
  const safeWidth = Math.max(1, Number.isFinite(sourceWidth) ? sourceWidth : 1);
  const safeHeight = Math.max(1, Number.isFinite(sourceHeight) ? sourceHeight : 1);
  const heightLimitedWidth = safeHeight * RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO;
  const width = Math.min(safeWidth, heightLimitedWidth);
  const height = width / RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO;
  return {
    x: (safeWidth - width) / 2,
    y: (safeHeight - height) / 2,
    width,
    height,
  };
}

export interface RadioVisualsWheelBand {
  innerCenterRatio: number;
  outerCenterRatio: number;
  edgeOnly: boolean;
  maxRings: number;
}

export interface RadioVisualsPortalProfile {
  strength: number;
  turbulence: number;
  wispInnerRatio: number;
  outerRatio: number;
  ribbonCount: number;
  streakCount: number;
  lightningArcCount: number;
}

/**
 * Hard Wheel geometry lives outside the rotating display labels. Small wheels
 * use a thin broken rim because their larger labels leave no reliable full
 * annulus; larger counts keep the dense outer band with no upper cutoff.
 */
export function radioVisualsWheelBand(input: number | null | undefined): RadioVisualsWheelBand {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return { innerCenterRatio: 0.49, outerCenterRatio: 0.493, edgeOnly: true, maxRings: 1 };
  }
  const count = Math.max(0, Math.floor(input));
  if (count === 0) return { innerCenterRatio: 0.43, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 7 };
  if (count <= 8) return { innerCenterRatio: 0.49, outerCenterRatio: 0.493, edgeOnly: true, maxRings: 1 };
  if (count <= 12) return { innerCenterRatio: 0.47, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 2 };
  if (count <= 24) return { innerCenterRatio: 0.456, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 4 };
  return { innerCenterRatio: 0.45, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 7 };
}

/**
 * The Wheel portal is always fully present. Candidate count only increases its
 * density, turbulence, and translucent inward reach: one candidate already
 * gets a strong portal, while fourteen candidates reaches the storm tier and
 * larger Wheels continue into a bounded overdrive tier.
 */
export function radioVisualsPortalProfile(input: number | null | undefined): RadioVisualsPortalProfile {
  const count = typeof input === "number" && Number.isFinite(input)
    ? Math.max(0, Math.floor(input))
    : 0;
  const crowd = clampVisualValue((count - 1) / 13);
  const storm = count >= 14 ? 1 : 0;
  const overdrive = clampVisualValue((count - 14) / 14);
  return {
    strength: 0.68 + crowd * 0.28 + storm * 0.08 + overdrive * 0.16,
    turbulence: 0.44 + crowd * 0.52 + storm * 0.2 + overdrive * 0.28,
    wispInnerRatio: 0.466 - crowd * 0.02 - storm * 0.006 - overdrive * 0.008,
    outerRatio: 0.497,
    ribbonCount: 4 + Math.round(crowd * 4) + storm * 2 + Math.round(overdrive * 2),
    streakCount: 24 + Math.round(crowd * 38) + storm * 16 + Math.round(overdrive * 30),
    lightningArcCount: count >= 14
      ? 5 + Math.round(overdrive * 3)
      : count >= 8
        ? 2
        : 1,
  };
}

export interface RadioVisualMusicSignal {
  source: "analyser" | "timeline" | "windows_loopback";
  bpm: number;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  beat: number;
  accent: number;
  peak: number;
  /** Zero-to-one position through the current track, or a deterministic long-form fallback cycle. */
  progress: number;
  /** Zero-to-one position through the current four-bar phrase. */
  phrase: number;
}

export interface RadioVisualsPalette {
  primary: string;
  secondary: string;
  highlight: string;
  shadow: string;
}

const BRAND_PALETTES: RadioVisualsPalette[] = [
  { primary: "#00ff88", secondary: "#7c3aed", highlight: "#e0e0e0", shadow: "#050505" },
  { primary: "#7c3aed", secondary: "#00ff88", highlight: "#ffffff", shadow: "#050505" },
  { primary: "#00ff88", secondary: "#22d3ee", highlight: "#a78bfa", shadow: "#030303" },
  { primary: "#a78bfa", secondary: "#00ff88", highlight: "#e0e0e0", shadow: "#050505" },
  { primary: "#7c3aed", secondary: "#00ff88", highlight: "#a78bfa", shadow: "#020202" },
];

const STAGE_INTENSITY: Record<RadioVisualsShowStage, number> = {
  standby: 0.06,
  intake: 0.18,
  early: 0.24,
  middle: 0.32,
  late: 0.4,
  final: 0.48,
  complete: 0.13,
};

export const RADIO_VISUAL_MUSIC_SCENES = [
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
] as const;

export type RadioVisualMusicScene = (typeof RADIO_VISUAL_MUSIC_SCENES)[number];

export interface RadioVisualAudioDrives {
  presence: number;
  /** Broadband mass keeps a loud track visible without pretending every band is loud. */
  body: number;
  bass: number;
  mid: number;
  treble: number;
  /** Sustained, thresholded geometry owned by each frequency band. */
  bassLayer: number;
  midLayer: number;
  trebleLayer: number;
  /** Extra composition revealed only when all three bands are genuinely present. */
  tapestry: number;
  impact: number;
  bassPulse: number;
  midPulse: number;
  treblePulse: number;
  tapestryPulse: number;
  build: number;
  progress: number;
  phrase: number;
}

/**
 * Bounded audio-only density budgets consumed by one music-scene renderer.
 * A renderer may apply one budget across a coupled group of shapes; baseline
 * identity geometry is excluded so settled quiet and isolated bands remain
 * independently testable.
 */
export interface RadioVisualMusicSceneLayerPlan {
  bass: number;
  mid: number;
  treble: number;
  tapestry: number;
}

interface RadioVisualMusicSceneLayerLimit {
  sustained: number;
  pulse: number;
}

export interface RadioVisualMusicSceneLayerLimits {
  bass: RadioVisualMusicSceneLayerLimit;
  mid: RadioVisualMusicSceneLayerLimit;
  treble: RadioVisualMusicSceneLayerLimit;
  tapestry: RadioVisualMusicSceneLayerLimit;
}

/** Hard ceilings for the four dedicated density-budget inputs in every family. */
export const RADIO_VISUAL_MUSIC_SCENE_LAYER_LIMITS: Record<RadioVisualMusicScene, RadioVisualMusicSceneLayerLimits> = {
  edge_spectrum: {
    bass: { sustained: 4, pulse: 3 },
    mid: { sustained: 4, pulse: 3 },
    treble: { sustained: 3, pulse: 4 },
    tapestry: { sustained: 2, pulse: 0 },
  },
  oscilloscope_ribbons: {
    bass: { sustained: 4, pulse: 5 },
    mid: { sustained: 4, pulse: 2 },
    treble: { sustained: 4, pulse: 5 },
    tapestry: { sustained: 5, pulse: 4 },
  },
  tape_feedback: {
    bass: { sustained: 8, pulse: 6 },
    mid: { sustained: 7, pulse: 3 },
    treble: { sustained: 5, pulse: 6 },
    tapestry: { sustained: 4, pulse: 0 },
  },
  matrix_rain: {
    bass: { sustained: 4, pulse: 2 },
    mid: { sustained: 3, pulse: 5 },
    treble: { sustained: 4, pulse: 4 },
    tapestry: { sustained: 1, pulse: 0 },
  },
  ascii_terminal: {
    bass: { sustained: 4, pulse: 3 },
    mid: { sustained: 4, pulse: 2 },
    treble: { sustained: 7, pulse: 5 },
    tapestry: { sustained: 1, pulse: 0 },
  },
  pixel_sort_storm: {
    bass: { sustained: 8, pulse: 6 },
    mid: { sustained: 6, pulse: 5 },
    treble: { sustained: 24, pulse: 12 },
    tapestry: { sustained: 1, pulse: 0 },
  },
  lightning_switchyard: {
    bass: { sustained: 3, pulse: 2 },
    mid: { sustained: 5, pulse: 2 },
    treble: { sustained: 1, pulse: 0 },
    tapestry: { sustained: 1, pulse: 0 },
  },
  laser_lattice: {
    bass: { sustained: 4, pulse: 2 },
    mid: { sustained: 8, pulse: 4 },
    treble: { sustained: 1, pulse: 0 },
    tapestry: { sustained: 1, pulse: 0 },
  },
  particle_pressure: {
    bass: { sustained: 5, pulse: 3 },
    mid: { sustained: 18, pulse: 0 },
    treble: { sustained: 24, pulse: 0 },
    tapestry: { sustained: 1, pulse: 0 },
  },
  signal_constellation: {
    bass: { sustained: 3, pulse: 2 },
    mid: { sustained: 8, pulse: 0 },
    treble: { sustained: 7, pulse: 5 },
    tapestry: { sustained: 3, pulse: 0 },
  },
};

export interface RadioVisualAudioReactionState {
  bassSlow: number;
  midSlow: number;
  trebleSlow: number;
  bassOnset: number;
  midOnset: number;
  trebleOnset: number;
  buildMemory: number;
}

export interface RadioVisualAudioReactionFrame {
  state: RadioVisualAudioReactionState;
  drives: RadioVisualAudioDrives;
}

export const RADIO_VISUAL_FALLBACK_RHYTHMS = [
  "sub_bloom",
  "neon_breaks",
  "ghost_dub",
  "fever_drive",
  "glass_rain",
  "machine_funk",
] as const;

export type RadioVisualFallbackRhythm = (typeof RADIO_VISUAL_FALLBACK_RHYTHMS)[number];

interface RadioVisualFallbackRhythmProfile {
  bpmMin: number;
  bpmSpan: number;
  bassBias: number;
  midBias: number;
  trebleBias: number;
  kick: number;
  snare: number;
  hats: number;
  density: number;
  swing: number;
}

const FALLBACK_RHYTHM_PROFILES: Record<RadioVisualFallbackRhythm, RadioVisualFallbackRhythmProfile> = {
  sub_bloom: { bpmMin: 84, bpmSpan: 14, bassBias: 0.18, midBias: -0.04, trebleBias: -0.08, kick: 0.72, snare: 0.14, hats: 0.08, density: 0.24, swing: 0.08 },
  neon_breaks: { bpmMin: 118, bpmSpan: 20, bassBias: 0.04, midBias: 0.1, trebleBias: 0.16, kick: 0.46, snare: 0.48, hats: 0.66, density: 0.68, swing: 0.2 },
  ghost_dub: { bpmMin: 86, bpmSpan: 18, bassBias: 0.22, midBias: -0.01, trebleBias: -0.12, kick: 0.64, snare: 0.18, hats: 0.1, density: 0.2, swing: 0.14 },
  fever_drive: { bpmMin: 132, bpmSpan: 16, bassBias: 0.1, midBias: 0.14, trebleBias: 0.16, kick: 0.62, snare: 0.44, hats: 0.72, density: 0.8, swing: 0.06 },
  glass_rain: { bpmMin: 104, bpmSpan: 20, bassBias: -0.05, midBias: 0.1, trebleBias: 0.24, kick: 0.28, snare: 0.38, hats: 0.82, density: 0.74, swing: 0.12 },
  machine_funk: { bpmMin: 96, bpmSpan: 22, bassBias: 0.12, midBias: 0.2, trebleBias: 0.05, kick: 0.5, snare: 0.6, hats: 0.4, density: 0.54, swing: 0.32 },
};

export const RADIO_VISUAL_AMBIENT_MOMENT_TYPES = [
  "violet_bloom",
  "signal_ripple",
  "shadow_pass",
  "particle_lift",
  "barcode_shimmer",
  "prism_drift",
  "ribbon_sweep",
] as const;

export type RadioVisualAmbientMomentType = (typeof RADIO_VISUAL_AMBIENT_MOMENT_TYPES)[number];

export interface RadioVisualAmbientMoment {
  type: RadioVisualAmbientMomentType;
  progress: number;
  envelope: number;
  intensity: number;
  seed: number;
}

export function clampVisualValue(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function radioVisualMusicScene(seed: number): RadioVisualMusicScene {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return RADIO_VISUAL_MUSIC_SCENES[hashRadioVisualToken(`music-scene:${safeSeed}`) % RADIO_VISUAL_MUSIC_SCENES.length];
}

function bandLayerActivation(value: number, threshold: number, ceiling: number): number {
  const normalized = clampVisualValue(
    (clampVisualValue(value) - threshold) / Math.max(0.001, ceiling - threshold),
  );
  return clampVisualValue(Math.pow(normalized, 1.12));
}

function tapestryActivation(bass: number, mid: number, treble: number): number {
  const sharedFloor = Math.min(bass, mid, treble);
  const shared = bandLayerActivation(sharedFloor, 0.08, 0.76);
  const mean = (bass + mid + treble) / 3;
  return clampVisualValue(shared * (0.72 + mean * 0.28));
}

function tapestryPulseActivation(
  bassPulse: number,
  midPulse: number,
  treblePulse: number,
  bass: number,
  mid: number,
  treble: number,
): number {
  const bassTransient = Math.max(0, bassPulse - bass * 0.08);
  const midTransient = Math.max(0, midPulse - mid * 0.08);
  const trebleTransient = Math.max(0, treblePulse - treble * 0.08);
  return clampVisualValue(Math.min(bassTransient, midTransient, trebleTransient) * 1.08);
}

export function radioVisualAudioDrives(signal: RadioVisualMusicSignal): RadioVisualAudioDrives {
  // The Windows helper already applies its own FFT calibration. Keep this
  // stage linear so quiet audio is not lifted a second time and each band can
  // own a genuinely independent visual layer.
  const body = clampVisualValue(signal.energy);
  const bass = clampVisualValue(signal.bass);
  const mid = clampVisualValue(signal.mid);
  const treble = clampVisualValue(signal.treble);
  const beatDrive = Math.pow(clampVisualValue(signal.beat), 1.8);
  const accentDrive = Math.pow(clampVisualValue(signal.accent), 1.55);
  const peakDrive = Math.pow(clampVisualValue(signal.peak), 1.35);
  const impact = clampVisualValue(Math.max(peakDrive, beatDrive * 0.86, accentDrive * 0.72));
  const presence = clampVisualValue(body * 0.68 + Math.max(bass, mid, treble) * 0.22 + impact * 0.1);
  const bassPulse = clampVisualValue(Math.max(bass * 0.08, beatDrive * bass * bass));
  const midPulse = clampVisualValue(Math.max(mid * 0.08, accentDrive * mid * mid));
  const treblePulse = clampVisualValue(Math.max(treble * 0.08, peakDrive * treble * treble));
  const bassLayer = bandLayerActivation(bass, 0.055, 0.95);
  const midLayer = bandLayerActivation(mid, 0.05, 0.95);
  const trebleLayer = bandLayerActivation(treble, 0.04, 0.95);
  const tapestry = tapestryActivation(bass, mid, treble);
  const progress = clampVisualValue(signal.progress);
  const phrase = clampVisualValue(signal.phrase);
  const audioStructure = body * 0.34 + bass * 0.24 + mid * 0.25 + treble * 0.17;
  return {
    presence,
    body,
    bass,
    mid,
    treble,
    bassLayer,
    midLayer,
    trebleLayer,
    tapestry,
    impact,
    bassPulse,
    midPulse,
    treblePulse,
    tapestryPulse: tapestryPulseActivation(bassPulse, midPulse, treblePulse, bass, mid, treble),
    // Progress and phrase still select deterministic layout evolution below,
    // but silence can no longer manufacture visual density late in a track.
    build: clampVisualValue(audioStructure * 0.82 + tapestry * 0.18),
    progress,
    phrase,
  };
}

function dedicatedAudioLayerCount(
  layer: number,
  pulse: number,
  limit: RadioVisualMusicSceneLayerLimit,
  threshold = 0.025,
): number {
  const maximum = limit.sustained + limit.pulse;
  if (maximum <= 0) return 0;
  const boundedLayer = clampVisualValue(layer);
  const sustainedProgress = clampVisualValue((boundedLayer - threshold) / Math.max(0.001, 1 - threshold));
  const sustained = boundedLayer > threshold && limit.sustained > 0
    ? 1 + Math.floor(sustainedProgress * Math.max(0, limit.sustained - 1))
    : 0;
  const transient = Math.floor(clampVisualValue(pulse) * limit.pulse);
  return Math.min(maximum, sustained + transient);
}

/**
 * Resolve the bounded, audio-only density budget that the selected renderer
 * must consume. Quiet, single-band, and full-spectrum behavior can therefore
 * be verified without duplicating Canvas implementation details in tests.
 */
export function radioVisualMusicSceneLayerPlan(
  scene: RadioVisualMusicScene,
  drives: RadioVisualAudioDrives,
): RadioVisualMusicSceneLayerPlan {
  const limits = RADIO_VISUAL_MUSIC_SCENE_LAYER_LIMITS[scene];
  return {
    bass: dedicatedAudioLayerCount(drives.bassLayer, drives.bassPulse, limits.bass),
    mid: dedicatedAudioLayerCount(drives.midLayer, drives.midPulse, limits.mid),
    treble: dedicatedAudioLayerCount(drives.trebleLayer, drives.treblePulse, limits.treble),
    tapestry: dedicatedAudioLayerCount(drives.tapestry, drives.tapestryPulse, limits.tapestry, 0.05),
  };
}

export function radioVisualAudioReactionInitialState(): RadioVisualAudioReactionState {
  return {
    bassSlow: 0,
    midSlow: 0,
    trebleSlow: 0,
    bassOnset: 0,
    midOnset: 0,
    trebleOnset: 0,
    buildMemory: 0,
  };
}

/** Advance the fast band-onset and slow structural-build envelopes by one frame. */
export function advanceRadioVisualAudioReaction(
  state: RadioVisualAudioReactionState,
  signal: RadioVisualMusicSignal,
  elapsedMs: number,
): RadioVisualAudioReactionFrame {
  const base = radioVisualAudioDrives(signal);
  const safeElapsedMs = clampVisualValue(elapsedMs, 0, 1_000);
  const bassSlow = state.bassSlow + (base.bass - state.bassSlow) * (1 - Math.exp(-safeElapsedMs / 420));
  const midSlow = state.midSlow + (base.mid - state.midSlow) * (1 - Math.exp(-safeElapsedMs / 340));
  const trebleSlow = state.trebleSlow + (base.treble - state.trebleSlow) * (1 - Math.exp(-safeElapsedMs / 260));
  const onset = (level: number, slow: number, gate: number, multiplier: number) => (
    clampVisualValue(Math.max(0, level - slow - gate) * multiplier)
  );
  const bassOnset = Math.max(
    state.bassOnset * Math.exp(-safeElapsedMs / 180),
    onset(base.bass, state.bassSlow, 0.035, 3.2),
  );
  const midOnset = Math.max(
    state.midOnset * Math.exp(-safeElapsedMs / 140),
    onset(base.mid, state.midSlow, 0.03, 3.1),
  );
  const trebleOnset = Math.max(
    state.trebleOnset * Math.exp(-safeElapsedMs / 95),
    onset(base.treble, state.trebleSlow, 0.025, 3),
  );
  const slowTapestry = tapestryActivation(bassSlow, midSlow, trebleSlow);
  const audioStructure = base.body * 0.34 + bassSlow * 0.24 + midSlow * 0.25 + trebleSlow * 0.17;
  const buildTarget = clampVisualValue(
    audioStructure * 0.82
    + slowTapestry * 0.18
    + Math.max(bassOnset, midOnset, trebleOnset) * 0.08,
  );
  const buildResponseMs = buildTarget > state.buildMemory ? 220 : 900;
  const buildMemory = state.buildMemory
    + (buildTarget - state.buildMemory) * (1 - Math.exp(-safeElapsedMs / buildResponseMs));
  const bassPulse = Math.max(base.bassPulse, bassOnset);
  const midPulse = Math.max(base.midPulse, midOnset);
  const treblePulse = Math.max(base.treblePulse, trebleOnset);
  return {
    state: { bassSlow, midSlow, trebleSlow, bassOnset, midOnset, trebleOnset, buildMemory },
    drives: {
      ...base,
      bassPulse,
      midPulse,
      treblePulse,
      tapestryPulse: tapestryPulseActivation(bassPulse, midPulse, treblePulse, base.bass, base.mid, base.treble),
      build: clampVisualValue(Math.max(base.build * 0.3, buildMemory)),
    },
  };
}

export function radioVisualsPalette(snapshot: RadioVisualsSnapshot): RadioVisualsPalette {
  if (snapshot.visualMode === "wheel") return { primary: "#00ff88", secondary: "#e0e0e0", highlight: "#a78bfa", shadow: "#030303" };
  if (snapshot.visualMode === "system") return { primary: "#ff00aa", secondary: "#00ff88", highlight: "#ffffff", shadow: "#020202" };
  return BRAND_PALETTES[Math.abs(snapshot.visualSeed) % BRAND_PALETTES.length];
}

export function radioVisualsIntensity(snapshot: RadioVisualsSnapshot): number {
  let intensity = STAGE_INTENSITY[snapshot.showStage];
  if (snapshot.visualMode === "wheel") intensity = 0.58;
  if (snapshot.visualMode === "system") intensity = 0.44;
  if (snapshot.player?.playbackState === "playing") intensity += 0.075;
  if (snapshot.player?.playbackState === "paused") intensity -= 0.045;
  if (snapshot.queue.pressure === "medium") intensity += 0.018;
  if (snapshot.queue.pressure === "high") intensity += 0.05;
  if (snapshot.queue.pressure === "max") intensity += 0.085;
  if (snapshot.cue?.type === "party") intensity = Math.max(intensity, 0.58);
  if (snapshot.cue?.type === "shadow") intensity = Math.max(intensity, 0.52);
  if (snapshot.cue?.type === "signal_breach") intensity = Math.max(intensity, 0.7);
  if (snapshot.cue?.type === "blackout") intensity = Math.max(intensity, 0.84);
  if (snapshot.cue?.type === "lightning") intensity = Math.max(intensity, 0.78);
  return clampVisualValue(intensity, 0.025, 0.92);
}

export function radioVisualsMotionRate(snapshot: RadioVisualsSnapshot): number {
  if (snapshot.player?.playbackState === "playing") return 1;
  if (snapshot.player?.playbackState === "paused") return 0.14;
  if (snapshot.showStage === "standby" || snapshot.showStage === "complete") return 0.16;
  if (snapshot.showStage === "final") return 0.48;
  return 0.38;
}

function seededUnit(seed: number, salt: number): number {
  return (hashRadioVisualToken(`${seed}:${salt}`) % 10_000) / 10_000;
}

export function radioVisualFallbackRhythm(seed: number): RadioVisualFallbackRhythm {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return RADIO_VISUAL_FALLBACK_RHYTHMS[hashRadioVisualToken(`rhythm:${safeSeed}`) % RADIO_VISUAL_FALLBACK_RHYTHMS.length];
}

function rhythmPulse(phase: number, power: number): number {
  const cycle = ((phase % 1) + 1) % 1;
  return Math.pow((Math.cos(cycle * Math.PI * 2) + 1) / 2, power);
}

export type RadioVisualLoopbackChannel = "energy" | "bass" | "mid" | "treble";

const LOOPBACK_LEVEL_CALIBRATION: Record<RadioVisualLoopbackChannel, { floor: number; ceiling: number; gamma: number }> = {
  energy: { floor: 0.025, ceiling: 1, gamma: 1.25 },
  bass: { floor: 0.03, ceiling: 1, gamma: 1.3 },
  mid: { floor: 0.025, ceiling: 1, gamma: 1.25 },
  treble: { floor: 0.018, ceiling: 1, gamma: 1.15 },
};

/** Map the installed bridge's already-compressed bands through one quiet-knee curve. */
export function radioVisualLoopbackLevel(value: number, channel: RadioVisualLoopbackChannel = "energy"): number {
  const calibration = LOOPBACK_LEVEL_CALIBRATION[channel];
  const normalized = clampVisualValue(
    (clampVisualValue(value) - calibration.floor) / (calibration.ceiling - calibration.floor),
  );
  return clampVisualValue(Math.pow(smoothstep(normalized), calibration.gamma));
}

function radioVisualLoopbackPeak(value: number): number {
  const normalized = clampVisualValue((clampVisualValue(value) - 0.02) / 0.94);
  return clampVisualValue(Math.pow(smoothstep(normalized), 1.15));
}

export function radioVisualsMusicSignal(
  snapshot: RadioVisualsSnapshot,
  playbackSeconds: number,
  transportSeconds: number,
  bridgeSignal: RadioAudioBridgeSignal | null = null,
  trackElapsedSeconds?: number,
): RadioVisualMusicSignal {
  const seed = snapshot.visualSeed;
  const fallbackRhythm = radioVisualFallbackRhythm(seed);
  const rhythmProfile = FALLBACK_RHYTHM_PROFILES[fallbackRhythm];
  const bpm = rhythmProfile.bpmMin + Math.round(seededUnit(seed, 30_001) * rhythmProfile.bpmSpan);
  const playing = snapshot.player?.playbackState === "playing";
  const paused = snapshot.player?.playbackState === "paused";
  const automaticTrack = snapshot.visualMode === "track" && !snapshot.player;
  const anchoredTrackSeconds = typeof trackElapsedSeconds === "number" && Number.isFinite(trackElapsedSeconds)
    ? Math.max(0, trackElapsedSeconds)
    : Math.max(0, transportSeconds);
  const clockSeconds = playing && Number.isFinite(playbackSeconds)
    ? Math.max(0, playbackSeconds)
    : automaticTrack
      ? anchoredTrackSeconds * (0.9 + rhythmProfile.swing * 0.22)
      : Math.max(0, transportSeconds) * (paused ? 0.12 : snapshot.sessionActive ? 0.46 : 0.18);
  const beatPosition = clockSeconds * bpm / 60;
  const beat = rhythmPulse(beatPosition, 4.1 + rhythmProfile.kick * 2.2);
  const eighth = rhythmPulse(beatPosition * 2 + seededUnit(seed, 30_002) * 0.16 + rhythmProfile.swing * 0.18, 6.2 + rhythmProfile.snare * 2.4);
  const sixteenthPosition = beatPosition * 4;
  const sixteenthStep = Math.floor(sixteenthPosition) % 16;
  const bar = Math.floor(beatPosition / 4);
  const strongStep = sixteenthStep % 4 === 0;
  const patternThreshold = strongStep ? 0.22 : 0.92 - rhythmProfile.density * 0.55;
  const patternHit = seededUnit(seed + bar, 30_100 + sixteenthStep) > patternThreshold;
  const sixteenth = patternHit ? rhythmPulse(sixteenthPosition + rhythmProfile.swing * (sixteenthStep % 2 ? 0.2 : 0), 7.4 + rhythmProfile.hats * 2.2) : 0;
  const barBreath = 0.5 + 0.5 * Math.sin(beatPosition / 4 * Math.PI * 2 + seededUnit(seed, 30_003) * Math.PI * 2);
  const knownDuration = snapshot.player?.durationSeconds;
  const fallbackProgressBeats = 384 + Math.floor(seededUnit(seed, 30_004) * 256);
  const fallbackProgressSeconds = snapshot.player && Number.isFinite(playbackSeconds)
    ? Math.max(0, playbackSeconds)
    : automaticTrack ? anchoredTrackSeconds : clockSeconds;
  const fallbackProgressPosition = fallbackProgressSeconds * bpm / 60;
  const progress = typeof knownDuration === "number" && Number.isFinite(knownDuration) && knownDuration > 0
    ? clampVisualValue(playbackSeconds / knownDuration)
    : clampVisualValue(fallbackProgressPosition / fallbackProgressBeats);
  const phrase = ((beatPosition % 16) + 16) % 16 / 16;
  const activity = playing ? 1 : paused ? 0.3 : automaticTrack ? 0.84 : snapshot.sessionActive ? 0.46 : 0.2;
  const timelineBass = clampVisualValue((0.22 + rhythmProfile.bassBias + beat * (0.32 + rhythmProfile.kick * 0.38) + barBreath * 0.12) * activity, 0.04, 0.96);
  const timelineMid = clampVisualValue((0.24 + rhythmProfile.midBias + beat * 0.12 + eighth * (0.14 + rhythmProfile.snare * 0.34) + barBreath * 0.13) * activity, 0.04, 0.94);
  const timelineTreble = clampVisualValue((0.18 + rhythmProfile.trebleBias + eighth * 0.12 + sixteenth * (0.14 + rhythmProfile.hats * 0.42)) * activity, 0.03, 0.96);
  const timelineEnergy = clampVisualValue(timelineBass * 0.44 + timelineMid * 0.34 + timelineTreble * 0.22, 0.05, 0.88);
  const hasAnalyser = typeof snapshot.player?.audioEnergy === "number"
    && typeof snapshot.player.audioBands?.bass === "number"
    && typeof snapshot.player.audioBands.mid === "number"
    && typeof snapshot.player.audioBands.treble === "number";
  const analyserWeight = hasAnalyser && playing ? 0.78 : 0;
  const bass = hasAnalyser
    ? clampVisualValue(timelineBass * (1 - analyserWeight) + snapshot.player!.audioBands!.bass * analyserWeight)
    : timelineBass;
  const mid = hasAnalyser
    ? clampVisualValue(timelineMid * (1 - analyserWeight) + snapshot.player!.audioBands!.mid * analyserWeight)
    : timelineMid;
  const treble = hasAnalyser
    ? clampVisualValue(timelineTreble * (1 - analyserWeight) + snapshot.player!.audioBands!.treble * analyserWeight)
    : timelineTreble;
  const energy = hasAnalyser
    ? clampVisualValue(timelineEnergy * (1 - analyserWeight) + snapshot.player!.audioEnergy! * analyserWeight, 0.04, 0.96)
    : timelineEnergy;
  const peak = hasAnalyser
    ? clampVisualValue(snapshot.player?.audioPeak ?? 0)
    : Math.max(beat * (0.42 + rhythmProfile.kick * 0.4), eighth * rhythmProfile.snare * 0.52, sixteenth * rhythmProfile.hats * 0.58) * activity;
  const hasLoopback = Boolean(
    bridgeSignal?.captureActive
    && bridgeSignal.warmedUp,
  );
  if (hasLoopback && bridgeSignal) {
    const confidence = clampVisualValue(bridgeSignal.tempoConfidence);
    const liveEnergy = radioVisualLoopbackLevel(bridgeSignal.energy, "energy");
    const liveBass = radioVisualLoopbackLevel(bridgeSignal.bass, "bass");
    const liveMid = radioVisualLoopbackLevel(bridgeSignal.mid, "mid");
    const liveTreble = radioVisualLoopbackLevel(bridgeSignal.treble, "treble");
    const livePeak = radioVisualLoopbackPeak(bridgeSignal.peak);
    const liveBeat = Math.pow(clampVisualValue(bridgeSignal.beat), 1.8);
    return {
      source: "windows_loopback",
      bpm: confidence >= 0.28 ? bridgeSignal.bpm : bpm,
      energy: liveEnergy,
      bass: liveBass,
      mid: liveMid,
      treble: liveTreble,
      beat: clampVisualValue(liveBeat * liveBass),
      accent: clampVisualValue(liveBeat * liveMid),
      peak: livePeak,
      progress,
      phrase,
    };
  }
  return {
    source: hasAnalyser ? "analyser" : "timeline",
    bpm,
    energy,
    bass,
    mid,
    treble,
    beat: clampVisualValue(beat * (0.58 + bass * 0.42) * activity),
    accent: clampVisualValue(Math.max(beat * 0.68, eighth * 0.32, sixteenth * 0.46, peak * 0.42) * activity),
    peak,
    progress,
    phrase,
  };
}

export function radioVisualAmbientMoment(seed: number, nowMs: number, sessionActive: boolean): RadioVisualAmbientMoment | null {
  if (!Number.isFinite(nowMs)) return null;
  const cycleMs = sessionActive ? 17_000 : 25_000;
  const cycle = Math.floor(nowMs / cycleMs);
  const momentSeed = hashRadioVisualToken(`${seed}:ambient:${cycle}`);
  const delayMs = (sessionActive ? 1_000 : 2_500) + seededUnit(momentSeed, 1) * (sessionActive ? 4_500 : 7_500);
  const durationMs = (sessionActive ? 5_500 : 4_200) + seededUnit(momentSeed, 2) * (sessionActive ? 5_000 : 4_800);
  const elapsedMs = nowMs - cycle * cycleMs - delayMs;
  if (elapsedMs < 0 || elapsedMs >= durationMs) return null;
  const progress = clampVisualValue(elapsedMs / durationMs);
  const envelope = Math.pow(Math.sin(progress * Math.PI), 1.35);
  const type = RADIO_VISUAL_AMBIENT_MOMENT_TYPES[momentSeed % RADIO_VISUAL_AMBIENT_MOMENT_TYPES.length];
  return {
    type,
    progress,
    envelope,
    intensity: (sessionActive ? 0.16 : 0.075) + seededUnit(momentSeed, 3) * (sessionActive ? 0.15 : 0.065),
    seed: momentSeed,
  };
}

export function radioVisualCueProgress(cue: RadioVisualCue | null, nowMs: number): number | null {
  if (!cue) return null;
  const startedAtMs = Date.parse(cue.startedAt);
  const expiresAtMs = Date.parse(cue.expiresAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= startedAtMs || nowMs >= expiresAtMs) return null;
  return clampVisualValue((nowMs - startedAtMs) / (expiresAtMs - startedAtMs));
}

function smoothstep(value: number): number {
  const bounded = clampVisualValue(value);
  return bounded * bounded * (3 - 2 * bounded);
}

export function radioVisualCueEnvelope(cue: RadioVisualCue | null, nowMs: number): number {
  const progress = radioVisualCueProgress(cue, nowMs);
  if (progress === null) return 0;
  const attackEnd = cue?.type === "lightning" ? 0.08 : cue?.type === "blackout" ? 0.2 : 0.14;
  const releaseStart = cue?.type === "lightning" ? 0.72 : cue?.type === "blackout" ? 0.68 : 0.78;
  if (progress < attackEnd) return smoothstep(progress / attackEnd);
  if (progress > releaseStart) return smoothstep((1 - progress) / (1 - releaseStart));
  return 1;
}
