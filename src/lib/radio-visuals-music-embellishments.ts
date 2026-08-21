import { clampVisualValue } from "./radio-visuals-engine";
import type { RadioVisualAudioDrives, RadioVisualMusicScene } from "./radio-visuals-engine";

/**
 * Additive music embellishments are deliberately isolated from the accepted
 * renderer. Turning this off leaves the checkpoint family, visibility floor,
 * gain, ownership, and crossfade path completely unchanged.
 */
export const RADIO_VISUAL_MUSIC_EMBELLISHMENTS_ENABLED = true;

export const RADIO_VISUAL_MUSIC_LIFECYCLE_VARIANTS = {
  edge_spectrum: "bars_to_teeth",
  oscilloscope_ribbons: "ribbons_to_braids",
  tape_feedback: "frames_to_splice",
  matrix_rain: "rain_to_crossfeed",
  ascii_terminal: "terminal_to_breach",
  pixel_sort_storm: "slices_to_scramble",
  lightning_switchyard: "rails_to_discharge",
  laser_lattice: "grid_to_prism",
  particle_pressure: "drift_to_vortex",
  signal_constellation: "stars_to_network",
} as const satisfies Record<RadioVisualMusicScene, string>;

export type RadioVisualMusicLifecycleVariant =
  (typeof RADIO_VISUAL_MUSIC_LIFECYCLE_VARIANTS)[RadioVisualMusicScene];
export type RadioVisualMusicLifecycleAct = "origin" | "mutation" | "finale";
export type RadioVisualMusicGesture = "vocal_pattern" | "melodic_lift" | "instrumental_break";

interface RadioVisualMusicEmbellishmentProfile {
  breathBeats: number;
  breathDepth: number;
  morphBias: number;
  glowBias: number;
  movementBias: number;
  deformationBias: number;
  edgeBudget: number;
}

const EMBELLISHMENT_PROFILES: Record<RadioVisualMusicScene, RadioVisualMusicEmbellishmentProfile> = {
  edge_spectrum: { breathBeats: 2, breathDepth: 0.72, morphBias: 0.82, glowBias: 0.58, movementBias: 0.36, deformationBias: 0.68, edgeBudget: 12 },
  oscilloscope_ribbons: { breathBeats: 4, breathDepth: 0.92, morphBias: 0.94, glowBias: 0.76, movementBias: 0.46, deformationBias: 0.92, edgeBudget: 7 },
  tape_feedback: { breathBeats: 8, breathDepth: 0.62, morphBias: 0.84, glowBias: 0.54, movementBias: 0.32, deformationBias: 0.8, edgeBudget: 7 },
  matrix_rain: { breathBeats: 2, breathDepth: 0.44, morphBias: 0.72, glowBias: 0.9, movementBias: 0.64, deformationBias: 0.7, edgeBudget: 11 },
  ascii_terminal: { breathBeats: 4, breathDepth: 0.48, morphBias: 0.8, glowBias: 0.6, movementBias: 0.52, deformationBias: 0.84, edgeBudget: 9 },
  pixel_sort_storm: { breathBeats: 1, breathDepth: 0.76, morphBias: 0.96, glowBias: 0.72, movementBias: 0.78, deformationBias: 0.96, edgeBudget: 12 },
  lightning_switchyard: { breathBeats: 2, breathDepth: 0.52, morphBias: 0.9, glowBias: 0.96, movementBias: 0.74, deformationBias: 0.9, edgeBudget: 9 },
  laser_lattice: { breathBeats: 4, breathDepth: 0.86, morphBias: 0.92, glowBias: 0.92, movementBias: 0.42, deformationBias: 0.88, edgeBudget: 8 },
  particle_pressure: { breathBeats: 4, breathDepth: 0.98, morphBias: 0.98, glowBias: 0.68, movementBias: 0.58, deformationBias: 0.96, edgeBudget: 12 },
  signal_constellation: { breathBeats: 8, breathDepth: 0.72, morphBias: 0.86, glowBias: 0.88, movementBias: 0.38, deformationBias: 0.74, edgeBudget: 10 },
};

export interface RadioVisualMusicEmbellishmentPlan {
  enabled: boolean;
  active: boolean;
  scene: RadioVisualMusicScene;
  variant: RadioVisualMusicLifecycleVariant;
  lifecycleAct: RadioVisualMusicLifecycleAct;
  lifecycleProgress: number;
  actProgress: number;
  morphology: number;
  finale: number;
  structureLevel: number;
  bassImpact: number;
  midImpact: number;
  trebleImpact: number;
  tapestryImpact: number;
  snareFlash: number;
  breath: number;
  pulse: number;
  glow: number;
  lineWeight: number;
  reach: number;
  deformation: number;
  movement: number;
  hueShift: number;
  tempoRate: number;
  gesture: RadioVisualMusicGesture;
  gestureStrength: number;
  gestureProgress: number | null;
  edgePrimitiveBudget: number;
  centerPrimitiveBudget: number;
  centerActive: boolean;
}

function smoothstep(value: number): number {
  const bounded = clampVisualValue(value);
  return bounded * bounded * (3 - 2 * bounded);
}

function deterministicUnit(seed: number, index: number): number {
  const value = Math.sin((seed + index * 1_919) * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}

function lifecycleAct(progress: number): RadioVisualMusicLifecycleAct {
  if (progress < 0.22) return "origin";
  if (progress < 0.74) return "mutation";
  return "finale";
}

function lifecycleActProgress(progress: number, act: RadioVisualMusicLifecycleAct): number {
  if (act === "origin") return clampVisualValue(progress / 0.22);
  if (act === "mutation") return clampVisualValue((progress - 0.22) / 0.52);
  return clampVisualValue((progress - 0.74) / 0.26);
}

function impactChannel(pulse: number, sustainedFloor: number, knee: number, span: number): number {
  const transient = Math.max(0, clampVisualValue(pulse) - clampVisualValue(sustainedFloor) * 0.08);
  return smoothstep((transient - knee) / span);
}

function musicGesture(drives: RadioVisualAudioDrives): { gesture: RadioVisualMusicGesture; strength: number } {
  const vocalPattern = clampVisualValue(
    drives.midLayer * 0.58
      + drives.midPulse * 0.28
      + drives.trebleLayer * 0.12
      - drives.bassPulse * 0.2,
  );
  const melodicLift = clampVisualValue(
    drives.midPulse * 0.3
      + drives.treblePulse * 0.38
      + drives.midLayer * drives.trebleLayer * 0.34,
  );
  const instrumentalBreak = clampVisualValue(
    drives.tapestry * 0.36
      + drives.bassPulse * 0.2
      + drives.treblePulse * 0.16
      + drives.build * 0.2
      - vocalPattern * 0.12,
  );
  const ranked: Array<[RadioVisualMusicGesture, number]> = [
    ["vocal_pattern", vocalPattern],
    ["melodic_lift", melodicLift],
    ["instrumental_break", instrumentalBreak],
  ];
  ranked.sort((left, right) => right[1] - left[1]);
  return { gesture: ranked[0][0], strength: ranked[0][1] };
}

/**
 * Pure, bounded planning only. It never chooses a scene, changes a seed,
 * controls visibility, or alters transition ownership.
 */
export function radioVisualMusicEmbellishmentPlan(
  scene: RadioVisualMusicScene,
  seed: number,
  time: number,
  drives: RadioVisualAudioDrives,
  bpm = 120,
  enabled = RADIO_VISUAL_MUSIC_EMBELLISHMENTS_ENABLED,
): RadioVisualMusicEmbellishmentPlan {
  const profile = EMBELLISHMENT_PROFILES[scene];
  const progress = clampVisualValue(drives.progress);
  const act = lifecycleAct(progress);
  const actProgress = lifecycleActProgress(progress, act);
  const metamorphosis = smoothstep((progress - 0.08) / 0.84);
  const finale = smoothstep((progress - 0.7) / 0.3);
  const sustainedMass = clampVisualValue(
    drives.body * 0.34
      + drives.presence * 0.14
      + drives.bassLayer * 0.2
      + drives.midLayer * 0.2
      + drives.trebleLayer * 0.08
      + drives.tapestry * 0.04,
  );
  // A real knee keeps quiet passages restrained. Progress can change the form,
  // but it can never manufacture loudness or density by itself.
  const structureLevel = smoothstep((sustainedMass - 0.06) / 0.82);
  const bassImpact = impactChannel(drives.bassPulse, drives.bass, 0.09, 0.66);
  const midImpact = impactChannel(drives.midPulse, drives.mid, 0.075, 0.62);
  const trebleImpact = impactChannel(drives.treblePulse, drives.treble, 0.055, 0.58);
  const sharedImpact = Math.min(bassImpact, midImpact, trebleImpact);
  const tapestryImpact = smoothstep(
    (Math.max(drives.tapestryPulse, sharedImpact * 0.9) - 0.04) / 0.68,
  );
  const snareFlash = clampVisualValue(midImpact * (0.76 + trebleImpact * 0.24) + tapestryImpact * 0.08);
  const safeTime = Number.isFinite(time) ? time : 0;
  const safeBpm = clampVisualValue(bpm, 55, 200);
  const tempoPosition = safeTime * safeBpm / 60;
  const seedPhase = deterministicUnit(seed, 91_001) * Math.PI * 2;
  const breathWave = Math.sin(
    tempoPosition / profile.breathBeats * Math.PI * 2
      + seedPhase
      + progress * Math.PI * 0.5,
  );
  const breath = clampVisualValue(0.5 + breathWave * 0.5);
  const strongestImpact = Math.max(bassImpact, midImpact, trebleImpact, tapestryImpact);
  const morphology = clampVisualValue(
    metamorphosis
      * profile.morphBias
      * (0.16 + structureLevel * 0.56 + drives.tapestry * 0.12 + strongestImpact * 0.16),
  );
  const pulse = clampVisualValue(
    structureLevel * (0.035 + breath * profile.breathDepth * 0.14)
      + bassImpact * 0.48
      + midImpact * 0.2
      + trebleImpact * 0.1
      + tapestryImpact * 0.3,
  );
  const glow = clampVisualValue(
    profile.glowBias
      * (structureLevel * 0.08 + trebleImpact * 0.58 + snareFlash * 0.24 + tapestryImpact * 0.22),
  );
  const lineWeight = clampVisualValue(
    0.72 + structureLevel * 0.38 + bassImpact * 0.9 + tapestryImpact * 0.38,
    0.72,
    2.38,
  );
  const reach = clampVisualValue(
    0.72
      + structureLevel * 0.24
      + breath * structureLevel * profile.breathDepth * 0.06
      + bassImpact * 0.26
      + midImpact * 0.08
      + tapestryImpact * 0.16,
    0.72,
    1.42,
  );
  const deformation = clampVisualValue(
    profile.deformationBias
      * (morphology * structureLevel * 0.42 + midImpact * 0.42 + tapestryImpact * 0.22 + trebleImpact * 0.08),
  );
  const movement = clampVisualValue(
    profile.movementBias
      * (morphology * structureLevel * 0.12 + bassImpact * 0.2 + midImpact * 0.38 + trebleImpact * 0.24 + tapestryImpact * 0.28),
  );
  const hueShift = clampVisualValue(
    metamorphosis
      * (0.12 + drives.trebleLayer * 0.38 + trebleImpact * 0.34 + drives.tapestry * 0.16),
    0,
    0.68,
  );
  const gesture = musicGesture(drives);
  const gestureCycle = ((safeTime * (0.055 + gesture.strength * 0.035)
    + deterministicUnit(seed, 91_201)) % 1 + 1) % 1;
  const gestureProgress = gesture.strength >= 0.38 && gestureCycle < 0.14
    ? gestureCycle / 0.14
    : null;
  const centerActive = strongestImpact >= 0.025
    || tapestryImpact >= 0.025
    || gestureProgress !== null;

  if (!enabled) {
    return {
      enabled: false,
      active: false,
      scene,
      variant: RADIO_VISUAL_MUSIC_LIFECYCLE_VARIANTS[scene],
      lifecycleAct: act,
      lifecycleProgress: progress,
      actProgress,
      morphology: 0,
      finale: 0,
      structureLevel: 0,
      bassImpact: 0,
      midImpact: 0,
      trebleImpact: 0,
      tapestryImpact: 0,
      snareFlash: 0,
      breath: 0.5,
      pulse: 0,
      glow: 0,
      lineWeight: 1,
      reach: 1,
      deformation: 0,
      movement: 0,
      hueShift: 0,
      tempoRate: 1,
      gesture: gesture.gesture,
      gestureStrength: 0,
      gestureProgress: null,
      edgePrimitiveBudget: 0,
      centerPrimitiveBudget: 0,
      centerActive: false,
    };
  }

  return {
    enabled: true,
    active: structureLevel >= 0.012 || morphology >= 0.012 || strongestImpact >= 0.012,
    scene,
    variant: RADIO_VISUAL_MUSIC_LIFECYCLE_VARIANTS[scene],
    lifecycleAct: act,
    lifecycleProgress: progress,
    actProgress,
    morphology,
    finale,
    structureLevel,
    bassImpact,
    midImpact,
    trebleImpact,
    tapestryImpact,
    snareFlash,
    breath,
    pulse,
    glow,
    lineWeight,
    reach,
    deformation,
    movement,
    hueShift,
    tempoRate: clampVisualValue(0.62 + safeBpm / 180 + structureLevel * 0.18 + movement * 0.2, 0.72, 1.82),
    gesture: gesture.gesture,
    gestureStrength: gesture.strength,
    gestureProgress,
    edgePrimitiveBudget: Math.max(2, Math.round(profile.edgeBudget * (0.28 + structureLevel * 0.52 + morphology * 0.2))),
    centerPrimitiveBudget: 9,
    centerActive,
  };
}
