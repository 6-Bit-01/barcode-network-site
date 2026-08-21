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
  outerTendrilCount: number;
}

/** Exact radial distance from a portal center to the clipped stage boundary. */
export function radioVisualsPortalStageEdgeRadius(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  angle: number,
  padding = 0,
): number {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const safeCenterX = clampVisualValue(centerX, 0, safeWidth);
  const safeCenterY = clampVisualValue(centerY, 0, safeHeight);
  const safePadding = clampVisualValue(padding, 0, Math.min(safeWidth, safeHeight) / 2);
  const cosine = Math.cos(Number.isFinite(angle) ? angle : 0);
  const sine = Math.sin(Number.isFinite(angle) ? angle : 0);
  const xDistance = Math.abs(cosine) < 0.0001
    ? Number.POSITIVE_INFINITY
    : (cosine > 0
      ? safeWidth - safeCenterX - safePadding
      : safeCenterX - safePadding) / Math.abs(cosine);
  const yDistance = Math.abs(sine) < 0.0001
    ? Number.POSITIVE_INFINITY
    : (sine > 0
      ? safeHeight - safeCenterY - safePadding
      : safeCenterY - safePadding) / Math.abs(sine);
  return Math.max(0, Math.min(xDistance, yDistance));
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
  const edgeRush = clampVisualValue((count - 14) / 6);
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
    outerTendrilCount: 10 + Math.round(crowd * 8) + storm * 6 + Math.round(edgeRush * 8),
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

/** Music-only gain applied after track ownership and scene crossfade. */
export const RADIO_VISUAL_MUSIC_OUTPUT_GAIN = 1.35;

export interface RadioVisualMusicTransitionState {
  currentSeed: number;
  previousSeed: number;
  startedAtMs: number;
}

/**
 * Music scenes only advance on a loaded track. Queue/Wheel snapshots may
 * change the global visual seed, but they must never consume the next music
 * crossfade or replace the last track family between songs.
 */
export function advanceRadioVisualMusicTransition(
  state: RadioVisualMusicTransitionState,
  visualMode: RadioVisualsSnapshot["visualMode"],
  visualSeed: number,
  nowMs: number,
): RadioVisualMusicTransitionState {
  if (visualMode !== "track" || state.currentSeed === visualSeed) return state;
  return {
    previousSeed: state.currentSeed,
    currentSeed: visualSeed,
    startedAtMs: nowMs,
  };
}

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

export type RadioVisualMusicGesture = "vocal_pattern" | "melodic_lift" | "instrumental_break";

export type RadioVisualMusicLifecycleAct = "origin" | "mutation" | "finale";

export type RadioVisualMusicLifecycleVariant =
  | "bars_to_teeth"
  | "ribbons_to_braids"
  | "frames_to_splice"
  | "rain_to_crossfeed"
  | "terminal_to_breach"
  | "slices_to_scramble"
  | "rails_to_discharge"
  | "grid_to_prism"
  | "drift_to_vortex"
  | "stars_to_network";

export interface RadioVisualMusicGesturePlan {
  gesture: RadioVisualMusicGesture;
  vocalPattern: number;
  melodicLift: number;
  instrumentalBreak: number;
  strength: number;
}

export interface RadioVisualMusicEvolutionPlan {
  sectionIndex: number;
  sectionBlend: number;
  lifecycleAct: RadioVisualMusicLifecycleAct;
  lifecycleProgress: number;
  actProgress: number;
  metamorphosis: number;
  finale: number;
  shapeMorph: number;
  variant: RadioVisualMusicLifecycleVariant;
  pulse: number;
  scaleX: number;
  scaleY: number;
  translateXRatio: number;
  translateYRatio: number;
  rotation: number;
  shearX: number;
  shearY: number;
  jitter: number;
  hueBlend: number;
  motionRate: number;
  tempoPulse: number;
  gesture: RadioVisualMusicGesturePlan;
}

export const RADIO_VISUAL_BROADCAST_FX_TYPES = [
  "crt_roll",
  "scanline_stack",
  "signal_tear",
  "frame_stutter",
  "chromatic_desync",
  "barcode_sweep",
  "code_breach",
  "terminal_packet",
  "bit_noise",
  "sync_dropout",
  "packet_trace",
  "compression_blocks",
] as const;

export type RadioVisualBroadcastFxType = (typeof RADIO_VISUAL_BROADCAST_FX_TYPES)[number];

export interface RadioVisualBroadcastFxPlan {
  active: boolean;
  type: RadioVisualBroadcastFxType;
  occurrenceIndex: number;
  occurrenceSeed: number;
  progress: number;
  envelope: number;
  strength: number;
  detail: number;
  centerAllowed: boolean;
  centerStrength: number;
  centerPrimitiveBudget: number;
  crtStrength: number;
}

export interface RadioVisualBroadcastFxInput {
  time: number;
  seed: number;
  sessionActive: boolean;
  showStage: RadioVisualsShowStage;
  sceneMix: number;
  drives: RadioVisualAudioDrives;
  cueType: RadioVisualCue["type"] | null;
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

export const RADIO_VISUAL_MUSIC_PERIMETER_MOTIFS = {
  edge_spectrum: "edge_bars",
  oscilloscope_ribbons: "ribbon_rails",
  tape_feedback: "feedback_corners",
  matrix_rain: "matrix_columns",
  ascii_terminal: "terminal_brackets",
  pixel_sort_storm: "pixel_fragments",
  lightning_switchyard: "switchyard_arcs",
  laser_lattice: "laser_chevrons",
  particle_pressure: "pressure_streaks",
  signal_constellation: "constellation_chain",
} as const satisfies Record<RadioVisualMusicScene, string>;

export type RadioVisualMusicPerimeterMotif = (typeof RADIO_VISUAL_MUSIC_PERIMETER_MOTIFS)[RadioVisualMusicScene];

/**
 * Bounded edge-only identity shared by none of the ten family renderers.
 * Values are normalized so the Canvas implementation can remain entirely in
 * the performer-safe perimeter while bass, mids, treble, and the all-band
 * tapestry still own visibly different parts of that family signature.
 */
export interface RadioVisualMusicPerimeterPlan {
  motif: RadioVisualMusicPerimeterMotif;
  strength: number;
  reach: number;
  thickness: number;
  bassDrive: number;
  midDrive: number;
  trebleDrive: number;
  tapestryDrive: number;
  bassElements: number;
  midElements: number;
  trebleElements: number;
  tapestryElements: number;
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

interface RadioVisualMusicEvolutionProfile {
  variant: RadioVisualMusicLifecycleVariant;
  bassScale: number;
  midDrift: number;
  trebleHue: number;
  startMotion: number;
  endMotion: number;
  startJitter: number;
  endJitter: number;
  tilt: number;
  endRotation: number;
  endShearX: number;
  endShearY: number;
}

const MUSIC_EVOLUTION_PROFILES: Record<RadioVisualMusicScene, RadioVisualMusicEvolutionProfile> = {
  edge_spectrum: { variant: "bars_to_teeth", bassScale: 0.72, midDrift: 0.42, trebleHue: 0.56, startMotion: 0.7, endMotion: 1.34, startJitter: 0.04, endJitter: 0.62, tilt: 0.2, endRotation: 0.006, endShearX: 0.035, endShearY: 0 },
  oscilloscope_ribbons: { variant: "ribbons_to_braids", bassScale: 0.34, midDrift: 0.92, trebleHue: 0.7, startMotion: 0.82, endMotion: 1.62, startJitter: 0.02, endJitter: 0.18, tilt: 0.44, endRotation: -0.014, endShearX: 0, endShearY: 0.026 },
  tape_feedback: { variant: "frames_to_splice", bassScale: 0.56, midDrift: 0.7, trebleHue: 0.5, startMotion: 1.18, endMotion: 0.72, startJitter: 0.58, endJitter: 0.08, tilt: 0.86, endRotation: 0.03, endShearX: -0.028, endShearY: 0.018 },
  matrix_rain: { variant: "rain_to_crossfeed", bassScale: 0.26, midDrift: 0.48, trebleHue: 0.96, startMotion: 0.68, endMotion: 1.7, startJitter: 0.02, endJitter: 0.54, tilt: 0.18, endRotation: -0.008, endShearX: -0.045, endShearY: 0 },
  ascii_terminal: { variant: "terminal_to_breach", bassScale: 0.22, midDrift: 0.64, trebleHue: 0.82, startMotion: 0.58, endMotion: 1.32, startJitter: 0.02, endJitter: 0.72, tilt: 0.12, endRotation: 0, endShearX: 0.05, endShearY: -0.018 },
  pixel_sort_storm: { variant: "slices_to_scramble", bassScale: 0.64, midDrift: 0.84, trebleHue: 1, startMotion: 0.76, endMotion: 1.84, startJitter: 0.16, endJitter: 1, tilt: 0.54, endRotation: 0.02, endShearX: -0.055, endShearY: 0.032 },
  lightning_switchyard: { variant: "rails_to_discharge", bassScale: 0.48, midDrift: 0.38, trebleHue: 0.88, startMotion: 0.62, endMotion: 1.76, startJitter: 0.04, endJitter: 0.84, tilt: 0.34, endRotation: -0.018, endShearX: 0.028, endShearY: 0.02 },
  laser_lattice: { variant: "grid_to_prism", bassScale: 0.4, midDrift: 0.58, trebleHue: 0.98, startMotion: 0.72, endMotion: 1.52, startJitter: 0.03, endJitter: 0.12, tilt: 0.72, endRotation: 0.042, endShearX: 0.018, endShearY: -0.018 },
  particle_pressure: { variant: "drift_to_vortex", bassScale: 0.9, midDrift: 0.76, trebleHue: 0.62, startMotion: 0.56, endMotion: 1.58, startJitter: 0.06, endJitter: 0.34, tilt: 0.26, endRotation: 0.026, endShearX: 0, endShearY: 0.028 },
  signal_constellation: { variant: "stars_to_network", bassScale: 0.3, midDrift: 0.88, trebleHue: 0.86, startMotion: 0.48, endMotion: 1.18, startJitter: 0.26, endJitter: 0.02, tilt: 0.62, endRotation: -0.034, endShearX: -0.02, endShearY: -0.012 },
};

/**
 * Infer musical gestures from the frequency and transient envelopes already
 * available to the receiver. These are intentionally signal-derived hints,
 * not semantic stem or lyric detection.
 */
export function radioVisualMusicGesturePlan(drives: RadioVisualAudioDrives): RadioVisualMusicGesturePlan {
  const vocalPattern = clampVisualValue(
    drives.midLayer * 0.62
      + drives.midPulse * 0.3
      + drives.trebleLayer * 0.14
      - drives.bassPulse * 0.22,
  );
  const melodicLift = clampVisualValue(
    drives.midPulse * 0.34
      + drives.treblePulse * 0.4
      + drives.midLayer * drives.trebleLayer * 0.36,
  );
  const instrumentalBreak = clampVisualValue(
    drives.tapestry * 0.38
      + drives.bassPulse * 0.24
      + drives.treblePulse * 0.2
      + drives.build * 0.24
      - vocalPattern * 0.14,
  );
  const ranked: Array<[RadioVisualMusicGesture, number]> = [
    ["vocal_pattern", vocalPattern],
    ["melodic_lift", melodicLift],
    ["instrumental_break", instrumentalBreak],
  ];
  ranked.sort((left, right) => right[1] - left[1]);
  return {
    gesture: ranked[0][0],
    vocalPattern,
    melodicLift,
    instrumentalBreak,
    strength: ranked[0][1],
  };
}

/** Smooth, bounded evolution inside one family; it never changes scene ownership. */
export function radioVisualMusicEvolutionPlan(
  scene: RadioVisualMusicScene,
  seed: number,
  time: number,
  drives: RadioVisualAudioDrives,
  bpm = 120,
): RadioVisualMusicEvolutionPlan {
  const profile = MUSIC_EVOLUTION_PROFILES[scene];
  const safeTime = Number.isFinite(time) ? time : 0;
  const lifecycleProgress = clampVisualValue(drives.progress);
  const sectionPosition = lifecycleProgress * 4;
  const sectionIndex = Math.min(3, Math.floor(sectionPosition));
  const sectionBlend = smoothstep(sectionPosition - sectionIndex);
  const smoothSection = sectionIndex + sectionBlend;
  const lifecycleAct: RadioVisualMusicLifecycleAct = lifecycleProgress < 0.22
    ? "origin"
    : lifecycleProgress < 0.74
      ? "mutation"
      : "finale";
  const actProgress = lifecycleAct === "origin"
    ? clampVisualValue(lifecycleProgress / 0.22)
    : lifecycleAct === "mutation"
      ? clampVisualValue((lifecycleProgress - 0.22) / 0.52)
      : clampVisualValue((lifecycleProgress - 0.74) / 0.26);
  // Hold a readable origin long enough to establish the family, then make the
  // end unmistakably different without a hard scene swap.
  const metamorphosis = smoothstep((lifecycleProgress - 0.08) / 0.84);
  const finale = smoothstep((lifecycleProgress - 0.7) / 0.3);
  const seedPhase = deterministicVisualUnit(seed, 26_001) * Math.PI * 2;
  const phraseWave = 0.5 + 0.5 * Math.sin(clampVisualValue(drives.phrase) * Math.PI * 2 + seedPhase);
  const safeBpm = clampVisualValue(bpm, 55, 200);
  const tempoPosition = safeTime * safeBpm / 60;
  const tempoWave = Math.pow(0.5 + 0.5 * Math.cos(tempoPosition * Math.PI * 2), 3.2);
  const detectedHit = Math.max(drives.bassPulse, drives.midPulse, drives.treblePulse, drives.tapestryPulse, drives.impact);
  const tempoPulse = clampVisualValue(Math.max(detectedHit, tempoWave * (0.12 + detectedHit * 0.88)));
  const lifecycleMotion = profile.startMotion + (profile.endMotion - profile.startMotion) * metamorphosis;
  const slowWave = Math.sin(safeTime * (0.12 + lifecycleMotion * 0.055) + seedPhase + smoothSection * 0.74);
  const crossWave = Math.cos(safeTime * (0.09 + profile.midDrift * 0.06) + seedPhase * 0.73 + smoothSection * 0.41);
  const bassMotion = clampVisualValue(drives.bassLayer * 0.46 + drives.bassPulse * 0.54);
  const midMotion = clampVisualValue(drives.midLayer * 0.56 + drives.midPulse * 0.44);
  const trebleMotion = clampVisualValue(drives.trebleLayer * 0.5 + drives.treblePulse * 0.5);
  const pulse = clampVisualValue(0.12 + bassMotion * (0.3 + phraseWave * 0.38) + tempoPulse * 0.18 + drives.tapestryPulse * 0.16);
  const scaleAmount = profile.bassScale * bassMotion * (0.004 + phraseWave * 0.017 + tempoPulse * 0.006);
  const drift = profile.midDrift * midMotion;
  const shapeMorph = clampVisualValue(metamorphosis * (0.4 + drives.body * 0.24 + midMotion * 0.2 + drives.tapestry * 0.16));
  const jitterProfile = profile.startJitter + (profile.endJitter - profile.startJitter) * metamorphosis;
  const jitter = clampVisualValue(jitterProfile * (0.18 + trebleMotion * 0.5 + tempoPulse * 0.32));
  return {
    sectionIndex,
    sectionBlend,
    lifecycleAct,
    lifecycleProgress,
    actProgress,
    metamorphosis,
    finale,
    shapeMorph,
    variant: profile.variant,
    pulse,
    scaleX: clampVisualValue(1 + scaleAmount + drives.tapestry * 0.003 + profile.endShearY * shapeMorph * 0.12, 0.975, 1.055),
    scaleY: clampVisualValue(1 + scaleAmount * (0.54 + profile.midDrift * 0.34) - profile.endShearX * shapeMorph * 0.1, 0.975, 1.055),
    translateXRatio: clampVisualValue(slowWave * drift * (0.006 + metamorphosis * 0.006), -0.014, 0.014),
    translateYRatio: clampVisualValue(crossWave * drift * (0.004 + metamorphosis * 0.005), -0.014, 0.014),
    rotation: clampVisualValue(
      slowWave * profile.tilt * midMotion * 0.012 + profile.endRotation * shapeMorph,
      -0.05,
      0.05,
    ),
    shearX: clampVisualValue(profile.endShearX * shapeMorph, -0.06, 0.06),
    shearY: clampVisualValue(profile.endShearY * shapeMorph, -0.06, 0.06),
    jitter,
    hueBlend: clampVisualValue(
      profile.trebleHue
        * metamorphosis
        * (0.2 + trebleMotion * 0.8)
        * (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(safeTime * 0.22 + seedPhase))),
      0,
      0.62,
    ),
    motionRate: clampVisualValue(
      lifecycleMotion * (0.86 + clampVisualValue((safeBpm - 70) / 100) * 0.2) + trebleMotion * 0.16 + tempoPulse * 0.12,
      0.48,
      1.95,
    ),
    tempoPulse,
    gesture: radioVisualMusicGesturePlan(drives),
  };
}

function bandLayerActivation(value: number, threshold: number, ceiling: number): number {
  const normalized = clampVisualValue(
    (clampVisualValue(value) - threshold) / Math.max(0.001, ceiling - threshold),
  );
  // Preserve headroom through ordinary passages: low readings move gently,
  // while genuinely high band energy can still reach the full layer budget.
  return clampVisualValue(Math.pow(normalized, 1.42));
}

function tapestryActivation(bass: number, mid: number, treble: number): number {
  const sharedFloor = Math.min(bass, mid, treble);
  const shared = bandLayerActivation(sharedFloor, 0.03, 0.9);
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
  // The loopback bridge already provides shaped transient envelopes. Consume
  // each envelope once and multiply it by its owned band once; repeated powers
  // previously reduced ordinary bass and mid hits to almost nothing.
  const beatDrive = clampVisualValue(signal.beat);
  const accentDrive = clampVisualValue(signal.accent);
  const peakDrive = clampVisualValue(signal.peak);
  const impact = clampVisualValue(Math.max(peakDrive, beatDrive * 0.86, accentDrive * 0.72));
  const presence = clampVisualValue(body * 0.68 + Math.max(bass, mid, treble) * 0.22 + impact * 0.1);
  const bassPulse = clampVisualValue(Math.max(bass * 0.08, beatDrive * bass));
  const midPulse = clampVisualValue(Math.max(mid * 0.08, accentDrive * mid));
  const treblePulse = clampVisualValue(Math.max(treble * 0.08, peakDrive * treble));
  const bassLayer = bandLayerActivation(bass, 0.032, 0.92);
  const midLayer = bandLayerActivation(mid, 0.028, 0.9);
  const trebleLayer = bandLayerActivation(treble, 0.022, 0.88);
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
  threshold = 0.01,
): number {
  const maximum = limit.sustained + limit.pulse;
  if (maximum <= 0) return 0;
  const boundedLayer = clampVisualValue(layer);
  const sustainedProgress = Math.pow(
    clampVisualValue((boundedLayer - threshold) / Math.max(0.001, 1 - threshold)),
    0.62,
  );
  const sustained = boundedLayer > threshold && limit.sustained > 0
    ? 1 + Math.round(sustainedProgress * Math.max(0, limit.sustained - 1))
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
    tapestry: dedicatedAudioLayerCount(drives.tapestry, drives.tapestryPulse, limits.tapestry),
  };
}

/**
 * Keep every selected family readable through the Studio key while allowing
 * real audio—not track progress—to expand its opacity and occupied area.
 */
export function radioVisualMusicSceneVisibility(drives: RadioVisualAudioDrives): number {
  const bandFullness = (drives.bassLayer + drives.midLayer + drives.trebleLayer) / 3;
  const loudestLayer = Math.max(drives.bassLayer, drives.midLayer, drives.trebleLayer);
  return clampVisualValue(
    0.3
      + drives.body * 0.24
      + drives.presence * 0.16
      + bandFullness * 0.18
      + loudestLayer * 0.06
      + drives.tapestry * 0.12,
    0.3,
    1,
  );
}

/**
 * Guarantee a chroma-safe family signature around the outside of the stage.
 * The quiet floor is deliberately structural rather than dense: real audio
 * expands its reach, weight, count, and brightness, while the central
 * performer window remains owned by the existing mask and intrusion plan.
 */
export function radioVisualMusicPerimeterPlan(
  scene: RadioVisualMusicScene,
  drives: RadioVisualAudioDrives,
): RadioVisualMusicPerimeterPlan {
  const bassDrive = clampVisualValue(
    0.07 + drives.bassLayer * 0.58 + drives.bassPulse * 0.28,
  );
  const midDrive = clampVisualValue(
    0.055 + drives.midLayer * 0.59 + drives.midPulse * 0.3,
  );
  const trebleDrive = clampVisualValue(
    0.055 + drives.trebleLayer * 0.56 + drives.treblePulse * 0.33,
  );
  const tapestryDrive = clampVisualValue(
    drives.tapestry * 0.7 + drives.tapestryPulse * 0.3,
  );
  const sharedBandDrive = (bassDrive + midDrive + trebleDrive) / 3;
  const strength = clampVisualValue(
    0.52
      + drives.body * 0.12
      + drives.presence * 0.1
      + sharedBandDrive * 0.1
      + drives.impact * 0.06
      + tapestryDrive * 0.1,
    0.52,
    1,
  );
  const reach = clampVisualValue(
    0.032
      + midDrive * 0.046
      + trebleDrive * 0.032
      + tapestryDrive * 0.032
      + drives.impact * 0.009,
    0.032,
    0.155,
  );
  const thickness = clampVisualValue(
    0.0025 + bassDrive * 0.0078 + drives.bassPulse * 0.0037,
    0.0025,
    0.014,
  );
  return {
    motif: RADIO_VISUAL_MUSIC_PERIMETER_MOTIFS[scene],
    strength,
    reach,
    thickness,
    bassDrive,
    midDrive,
    trebleDrive,
    tapestryDrive,
    bassElements: Math.min(10, 1 + Math.round(drives.bassLayer * 6 + drives.bassPulse * 3)),
    midElements: Math.min(14, 2 + Math.round(drives.midLayer * 8 + drives.midPulse * 4)),
    trebleElements: Math.min(18, 2 + Math.round(drives.trebleLayer * 10 + drives.treblePulse * 6)),
    tapestryElements: tapestryDrive > 0.025
      ? Math.min(6, 1 + Math.round(drives.tapestry * 3 + drives.tapestryPulse * 2))
      : 0,
  };
}

export interface RadioVisualWindowIntrusionPlan {
  active: boolean;
  scanProgress: number | null;
  scanStrength: number;
  stutterProgress: number | null;
  stutterStrength: number;
  stutterStripCount: number;
  stutterSeed: number;
  lightningFamilyStrength: number;
  lightningCueStrength: number;
  signalBreachProgress: number | null;
  signalBreachStrength: number;
  musicSweepProgress: number | null;
  musicSweepStrength: number;
  musicSweepSeed: number;
  musicGesture: RadioVisualMusicGesture;
}

export interface RadioVisualWindowIntrusionInput {
  time: number;
  sceneMix: number;
  trackMix: number;
  drives: RadioVisualAudioDrives;
  musicScene: RadioVisualMusicScene;
  seed: number;
  cueType: RadioVisualCue["type"] | null;
  cueProgress: number | null;
  cueEnvelope: number;
}

function deterministicVisualUnit(seed: number, salt: number): number {
  return (hashRadioVisualToken(`${Math.trunc(seed)}:${salt}`) % 1_000_000) / 1_000_000;
}

function rawBroadcastFxBag(seed: number, bagIndex: number): RadioVisualBroadcastFxType[] {
  const bag = [...RADIO_VISUAL_BROADCAST_FX_TYPES];
  const bagSeed = hashRadioVisualToken(`${Math.trunc(seed)}:broadcast-fx-bag:${Math.trunc(bagIndex)}`);
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(deterministicVisualUnit(bagSeed, 27_000 + index) * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }
  return bag;
}

/** Deterministic shuffle-bag lookup with a hard no-repeat bag boundary. */
export function radioVisualBroadcastFxTypeForOccurrence(
  seed: number,
  occurrenceIndex: number,
): RadioVisualBroadcastFxType {
  const safeOccurrence = Math.max(0, Math.floor(Number.isFinite(occurrenceIndex) ? occurrenceIndex : 0));
  const bagSize = RADIO_VISUAL_BROADCAST_FX_TYPES.length;
  const bagIndex = Math.floor(safeOccurrence / bagSize);
  const position = safeOccurrence % bagSize;
  const bag = rawBroadcastFxBag(seed, bagIndex);
  if (bagIndex > 0) {
    const previousBag = rawBroadcastFxBag(seed, bagIndex - 1);
    const previousType = previousBag[previousBag.length - 1];
    if (bag[0] === previousType) {
      const swapIndex = bag.findIndex((type, index) => index > 0 && type !== previousType);
      [bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]];
    }
  }
  return bag[position];
}

const CENTER_SAFE_BROADCAST_FX = new Set<RadioVisualBroadcastFxType>([
  "scanline_stack",
  "signal_tear",
  "frame_stutter",
  "chromatic_desync",
  "barcode_sweep",
  "code_breach",
  "terminal_packet",
  "sync_dropout",
  "packet_trace",
  "compression_blocks",
]);

/**
 * Schedule one bounded BARCODE transmission artifact at a time. Selection and
 * cadence are seed-stable; audio only changes the earned strength and detail.
 */
export function radioVisualBroadcastFxPlan(input: RadioVisualBroadcastFxInput): RadioVisualBroadcastFxPlan {
  const safeTime = Math.max(0, Number.isFinite(input.time) ? input.time : 0);
  const slotSeconds = 5.4;
  const occurrenceIndex = Math.floor(safeTime / slotSeconds);
  const occurrenceSeed = hashRadioVisualToken(`${Math.trunc(input.seed)}:broadcast-fx:${occurrenceIndex}`);
  const type = radioVisualBroadcastFxTypeForOccurrence(input.seed, occurrenceIndex);
  const slotTime = safeTime - occurrenceIndex * slotSeconds;
  const delay = 0.2 + deterministicVisualUnit(occurrenceSeed, 27_101) * 0.65;
  const duration = 0.72 + deterministicVisualUnit(occurrenceSeed, 27_102) * 0.94;
  const progress = clampVisualValue((slotTime - delay) / duration);
  const showEligible = input.sessionActive && input.showStage !== "intake";
  const withinWindow = slotTime >= delay && slotTime < delay + duration;
  const envelope = showEligible && withinWindow
    ? Math.pow(Math.sin(progress * Math.PI), 1.12)
    : 0;
  const sceneMix = clampVisualValue(input.sceneMix);
  const audioMass = clampVisualValue(
    input.drives.body * 0.26
      + input.drives.build * 0.22
      + Math.max(input.drives.bassLayer, input.drives.midLayer, input.drives.trebleLayer) * 0.22
      + input.drives.impact * 0.3,
  );
  const cuePriority = input.cueType === null ? 1 : 0.42;
  const strength = clampVisualValue(envelope * sceneMix * (0.18 + audioMass * 0.5) * cuePriority, 0, 0.68);
  const detail = clampVisualValue(
    0.22
      + input.drives.midLayer * 0.2
      + input.drives.trebleLayer * 0.25
      + input.drives.tapestry * 0.2
      + input.drives.impact * 0.13,
  );
  const centerAllowed = input.cueType === null && CENTER_SAFE_BROADCAST_FX.has(type);
  const centerStrength = centerAllowed
    ? clampVisualValue(strength * (0.22 + detail * 0.25), 0, 0.26)
    : 0;
  return {
    active: strength >= 0.002,
    type,
    occurrenceIndex,
    occurrenceSeed,
    progress,
    envelope,
    strength,
    detail,
    centerAllowed,
    centerStrength,
    centerPrimitiveBudget: centerAllowed ? Math.min(8, 2 + Math.floor(detail * 6)) : 0,
    crtStrength: showEligible ? clampVisualValue(sceneMix * (0.026 + input.drives.body * 0.018), 0, 0.055) : 0,
  };
}

function boundedCycleProgress(cycle: number, activeWindow: number): number | null {
  const wrapped = ((cycle % 1) + 1) % 1;
  if (wrapped > activeWindow) return null;
  return clampVisualValue(wrapped / activeWindow);
}

/**
 * Resolve the complete performer-window allow-list before allocating its
 * second Canvas pass. Cadence is seed-stable; audio changes only intensity
 * and the bounded two-to-three-strip density, so a transient cannot reopen a
 * burst midway through its cycle.
 */
export function radioVisualWindowIntrusionPlan(
  input: RadioVisualWindowIntrusionInput,
): RadioVisualWindowIntrusionPlan {
  const sceneMix = clampVisualValue(input.sceneMix);
  const trackMix = clampVisualValue(input.trackMix);
  const cueEnvelope = clampVisualValue(input.cueEnvelope);
  const scanStrength = sceneMix * (
    0.16
      + trackMix * (
        0.18
          + input.drives.midLayer * 0.08
          + input.drives.midPulse * 0.12
          + input.drives.tapestry * 0.08
      )
  );
  const scanProgress = scanStrength >= 0.002
    ? boundedCycleProgress(input.time * 0.085 + deterministicVisualUnit(input.seed, 23_101), 0.13)
    : null;

  const glitchFamilyBoost = input.musicScene === "pixel_sort_storm"
    || input.musicScene === "tape_feedback"
    || input.musicScene === "ascii_terminal"
    || input.musicScene === "matrix_rain"
    ? 0.14
    : 0.05;
  const stutterStrength = sceneMix * (
    0.1
      + glitchFamilyBoost
      + trackMix * (
        0.12
          + input.drives.midLayer * 0.08
          + input.drives.trebleLayer * 0.1
          + input.drives.tapestry * 0.1
          + input.drives.impact * 0.08
      )
  );
  const cycleSeconds = 5.2 + deterministicVisualUnit(input.seed, 23_201) * 2.6;
  const shiftedTime = input.time + deterministicVisualUnit(input.seed, 23_202) * cycleSeconds;
  const stutterCycleIndex = Math.floor(shiftedTime / cycleSeconds);
  const stutterProgress = stutterStrength >= 0.002
    ? boundedCycleProgress(shiftedTime / cycleSeconds, 0.075)
    : null;
  const fragmentDrive = clampVisualValue(
    stutterStrength * 0.52
      + input.drives.midLayer * 0.12
      + input.drives.trebleLayer * 0.14
      + input.drives.midPulse * 0.18
      + input.drives.treblePulse * 0.22
      + input.drives.tapestryPulse * 0.2,
  );
  const stutterStripCount = stutterProgress === null ? 0 : 2 + Math.round(fragmentDrive);

  const lightningFamilyStrength = trackMix > 0.08 && input.musicScene === "lightning_switchyard"
    ? sceneMix * trackMix * clampVisualValue(
      0.06 + input.drives.treble * 0.1 + input.drives.treblePulse * 0.28 + input.drives.impact * 0.12,
    ) * 0.42
    : 0;
  const lightningCueStrength = input.cueType === "lightning" && input.cueProgress !== null && cueEnvelope > 0.002
    ? cueEnvelope
    : 0;
  const signalBreachProgress = input.cueType === "signal_breach" && input.cueProgress !== null && cueEnvelope > 0.002
    ? (clampVisualValue(input.cueProgress) * 2) % 1
    : null;
  const signalBreachStrength = signalBreachProgress === null ? 0 : cueEnvelope * 0.52;
  const gesturePlan = radioVisualMusicGesturePlan(input.drives);
  const musicSweepCycleSeconds = 4.6 + deterministicVisualUnit(input.seed, 23_801) * 2.2;
  const musicSweepShiftedTime = input.time + deterministicVisualUnit(input.seed, 23_802) * musicSweepCycleSeconds;
  const musicSweepCycleIndex = Math.floor(musicSweepShiftedTime / musicSweepCycleSeconds);
  const musicSweepGate = input.cueType === null && trackMix > 0.08 && gesturePlan.strength > 0.24
    ? boundedCycleProgress(musicSweepShiftedTime / musicSweepCycleSeconds, 0.11)
    : null;
  const musicSweepStrength = musicSweepGate === null
    ? 0
    : clampVisualValue(
      sceneMix
        * trackMix
        * Math.sin(musicSweepGate * Math.PI)
        * (gesturePlan.strength - 0.18)
        * 0.44,
      0,
      0.26,
    );
  const active = (scanProgress !== null && scanStrength >= 0.002)
    || (stutterProgress !== null && stutterStrength >= 0.002)
    || lightningFamilyStrength >= 0.002
    || lightningCueStrength > 0.002
    || signalBreachStrength >= 0.002
    || musicSweepStrength >= 0.002;

  return {
    active,
    scanProgress,
    scanStrength,
    stutterProgress,
    stutterStrength,
    stutterStripCount,
    stutterSeed: input.seed + stutterCycleIndex * 7_919,
    lightningFamilyStrength,
    lightningCueStrength,
    signalBreachProgress,
    signalBreachStrength,
    musicSweepProgress: musicSweepStrength >= 0.002 ? musicSweepGate : null,
    musicSweepStrength,
    musicSweepSeed: input.seed + musicSweepCycleIndex * 11_173,
    musicGesture: gesturePlan.gesture,
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
  // The helper already compresses FFT/RMS values. A second smoothstep made
  // ordinary 20-50% live readings visually tiny; a power knee still rejects
  // the noise floor while preserving useful motion across that real range.
  return clampVisualValue(Math.pow(normalized, calibration.gamma));
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
    const liveBeat = Math.pow(clampVisualValue(bridgeSignal.beat), 1.15);
    const liveTransient = Math.max(liveBeat, livePeak);
    return {
      source: "windows_loopback",
      bpm: confidence >= 0.28 ? bridgeSignal.bpm : bpm,
      energy: liveEnergy,
      bass: liveBass,
      mid: liveMid,
      treble: liveTreble,
      beat: liveBeat,
      accent: liveTransient,
      peak: liveTransient,
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
