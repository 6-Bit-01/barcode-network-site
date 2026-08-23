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
  crt_signal_breach: "sync_to_breach",
  voxel_megacity: "blocks_to_city",
  liquid_chrome: "membranes_to_refraction",
  cellular_takeover: "cells_to_network",
  shattered_broadcast: "shards_to_reassembly",
  barcode_foundry: "bars_to_foundry",
  recursive_portal: "frames_to_tunnel",
  holographic_terrain: "ridges_to_horizon",
  kinetic_glyph_engine: "glyphs_to_machine",
  mechanical_iris: "blades_to_reactor",
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
  glareBias: number;
  movementBias: number;
  deformationBias: number;
  bassScale: number;
  trebleHue: number;
  startMotion: number;
  endMotion: number;
  startJitter: number;
  endJitter: number;
  beatReach: number;
  beatWeight: number;
  impactMotion: number;
  edgeBudget: number;
}

const EMBELLISHMENT_PROFILES: Record<RadioVisualMusicScene, RadioVisualMusicEmbellishmentProfile> = {
  edge_spectrum: { breathBeats: 2, breathDepth: 0.72, morphBias: 0.82, glowBias: 0.58, glareBias: 0.54, movementBias: 0.36, deformationBias: 0.68, bassScale: 0.72, trebleHue: 0.56, startMotion: 0.7, endMotion: 1.34, startJitter: 0.04, endJitter: 0.62, beatReach: 0.94, beatWeight: 1, impactMotion: 0.72, edgeBudget: 12 },
  oscilloscope_ribbons: { breathBeats: 4, breathDepth: 0.92, morphBias: 0.94, glowBias: 0.76, glareBias: 0.68, movementBias: 0.46, deformationBias: 0.92, bassScale: 0.34, trebleHue: 0.7, startMotion: 0.82, endMotion: 1.62, startJitter: 0.02, endJitter: 0.18, beatReach: 0.66, beatWeight: 0.56, impactMotion: 0.54, edgeBudget: 7 },
  tape_feedback: { breathBeats: 8, breathDepth: 0.62, morphBias: 0.84, glowBias: 0.54, glareBias: 0.52, movementBias: 0.32, deformationBias: 0.8, bassScale: 0.56, trebleHue: 0.5, startMotion: 1.18, endMotion: 0.72, startJitter: 0.58, endJitter: 0.08, beatReach: 0.74, beatWeight: 0.88, impactMotion: 0.44, edgeBudget: 7 },
  matrix_rain: { breathBeats: 2, breathDepth: 0.44, morphBias: 0.72, glowBias: 0.9, glareBias: 0.92, movementBias: 0.64, deformationBias: 0.7, bassScale: 0.26, trebleHue: 0.96, startMotion: 0.68, endMotion: 1.7, startJitter: 0.02, endJitter: 0.54, beatReach: 0.7, beatWeight: 0.48, impactMotion: 0.86, edgeBudget: 11 },
  ascii_terminal: { breathBeats: 4, breathDepth: 0.48, morphBias: 0.8, glowBias: 0.6, glareBias: 0.72, movementBias: 0.52, deformationBias: 0.84, bassScale: 0.22, trebleHue: 0.82, startMotion: 0.58, endMotion: 1.32, startJitter: 0.02, endJitter: 0.72, beatReach: 0.62, beatWeight: 0.7, impactMotion: 0.9, edgeBudget: 9 },
  pixel_sort_storm: { breathBeats: 1, breathDepth: 0.76, morphBias: 0.96, glowBias: 0.72, glareBias: 0.84, movementBias: 0.78, deformationBias: 0.96, bassScale: 0.64, trebleHue: 1, startMotion: 0.76, endMotion: 1.84, startJitter: 0.16, endJitter: 1, beatReach: 1, beatWeight: 0.9, impactMotion: 1, edgeBudget: 12 },
  lightning_switchyard: { breathBeats: 2, breathDepth: 0.52, morphBias: 0.9, glowBias: 0.96, glareBias: 1, movementBias: 0.74, deformationBias: 0.9, bassScale: 0.48, trebleHue: 0.88, startMotion: 0.62, endMotion: 1.76, startJitter: 0.04, endJitter: 0.84, beatReach: 1, beatWeight: 1, impactMotion: 1, edgeBudget: 9 },
  laser_lattice: { breathBeats: 4, breathDepth: 0.86, morphBias: 0.92, glowBias: 0.92, glareBias: 0.94, movementBias: 0.42, deformationBias: 0.88, bassScale: 0.4, trebleHue: 0.98, startMotion: 0.72, endMotion: 1.52, startJitter: 0.03, endJitter: 0.12, beatReach: 0.76, beatWeight: 0.72, impactMotion: 0.7, edgeBudget: 8 },
  particle_pressure: { breathBeats: 4, breathDepth: 0.98, morphBias: 0.98, glowBias: 0.68, glareBias: 0.62, movementBias: 0.58, deformationBias: 0.96, bassScale: 0.9, trebleHue: 0.62, startMotion: 0.56, endMotion: 1.58, startJitter: 0.06, endJitter: 0.34, beatReach: 1, beatWeight: 0.86, impactMotion: 0.86, edgeBudget: 12 },
  signal_constellation: { breathBeats: 8, breathDepth: 0.72, morphBias: 0.86, glowBias: 0.88, glareBias: 0.82, movementBias: 0.38, deformationBias: 0.74, bassScale: 0.3, trebleHue: 0.86, startMotion: 0.48, endMotion: 1.18, startJitter: 0.26, endJitter: 0.02, beatReach: 0.64, beatWeight: 0.68, impactMotion: 0.5, edgeBudget: 10 },
  crt_signal_breach: { breathBeats: 2, breathDepth: 0.54, morphBias: 0.92, glowBias: 0.84, glareBias: 0.94, movementBias: 0.72, deformationBias: 0.98, bassScale: 0.52, trebleHue: 0.92, startMotion: 0.68, endMotion: 1.82, startJitter: 0.08, endJitter: 0.9, beatReach: 0.92, beatWeight: 0.82, impactMotion: 0.96, edgeBudget: 11 },
  voxel_megacity: { breathBeats: 8, breathDepth: 0.48, morphBias: 0.9, glowBias: 0.72, glareBias: 0.64, movementBias: 0.38, deformationBias: 0.74, bassScale: 0.86, trebleHue: 0.7, startMotion: 0.54, endMotion: 1.16, startJitter: 0.02, endJitter: 0.12, beatReach: 0.78, beatWeight: 0.94, impactMotion: 0.52, edgeBudget: 12 },
  liquid_chrome: { breathBeats: 4, breathDepth: 0.96, morphBias: 0.98, glowBias: 0.92, glareBias: 0.98, movementBias: 0.5, deformationBias: 1, bassScale: 0.68, trebleHue: 1, startMotion: 0.62, endMotion: 1.38, startJitter: 0.02, endJitter: 0.2, beatReach: 0.7, beatWeight: 0.62, impactMotion: 0.7, edgeBudget: 9 },
  cellular_takeover: { breathBeats: 2, breathDepth: 0.42, morphBias: 0.94, glowBias: 0.66, glareBias: 0.7, movementBias: 0.44, deformationBias: 0.88, bassScale: 0.72, trebleHue: 0.74, startMotion: 0.46, endMotion: 1.42, startJitter: 0.02, endJitter: 0.34, beatReach: 0.84, beatWeight: 0.9, impactMotion: 0.82, edgeBudget: 13 },
  shattered_broadcast: { breathBeats: 2, breathDepth: 0.58, morphBias: 1, glowBias: 0.78, glareBias: 0.94, movementBias: 0.8, deformationBias: 1, bassScale: 0.62, trebleHue: 0.96, startMotion: 0.76, endMotion: 1.92, startJitter: 0.14, endJitter: 1, beatReach: 1, beatWeight: 0.82, impactMotion: 1, edgeBudget: 12 },
  barcode_foundry: { breathBeats: 4, breathDepth: 0.5, morphBias: 0.86, glowBias: 0.7, glareBias: 0.74, movementBias: 0.48, deformationBias: 0.72, bassScale: 0.94, trebleHue: 0.68, startMotion: 0.58, endMotion: 1.28, startJitter: 0.01, endJitter: 0.18, beatReach: 0.96, beatWeight: 1, impactMotion: 0.76, edgeBudget: 14 },
  recursive_portal: { breathBeats: 8, breathDepth: 0.9, morphBias: 0.96, glowBias: 0.88, glareBias: 0.76, movementBias: 0.36, deformationBias: 0.82, bassScale: 0.78, trebleHue: 0.84, startMotion: 0.48, endMotion: 1.34, startJitter: 0.02, endJitter: 0.1, beatReach: 0.7, beatWeight: 0.78, impactMotion: 0.58, edgeBudget: 9 },
  holographic_terrain: { breathBeats: 4, breathDepth: 0.7, morphBias: 0.92, glowBias: 0.9, glareBias: 0.82, movementBias: 0.42, deformationBias: 0.88, bassScale: 0.76, trebleHue: 0.9, startMotion: 0.52, endMotion: 1.44, startJitter: 0.04, endJitter: 0.24, beatReach: 0.82, beatWeight: 0.74, impactMotion: 0.66, edgeBudget: 11 },
  kinetic_glyph_engine: { breathBeats: 2, breathDepth: 0.62, morphBias: 0.94, glowBias: 0.78, glareBias: 0.88, movementBias: 0.66, deformationBias: 0.9, bassScale: 0.58, trebleHue: 0.94, startMotion: 0.64, endMotion: 1.72, startJitter: 0.04, endJitter: 0.68, beatReach: 0.88, beatWeight: 0.88, impactMotion: 0.94, edgeBudget: 10 },
  mechanical_iris: { breathBeats: 4, breathDepth: 0.84, morphBias: 0.98, glowBias: 0.86, glareBias: 0.82, movementBias: 0.4, deformationBias: 0.78, bassScale: 1, trebleHue: 0.78, startMotion: 0.44, endMotion: 1.26, startJitter: 0.01, endJitter: 0.1, beatReach: 0.76, beatWeight: 1, impactMotion: 0.68, edgeBudget: 12 },
};

export interface RadioVisualMusicEmbellishmentPlan {
  enabled: boolean;
  active: boolean;
  scene: RadioVisualMusicScene;
  variant: RadioVisualMusicLifecycleVariant;
  lifecycleAct: RadioVisualMusicLifecycleAct;
  lifecycleProgress: number;
  actProgress: number;
  sectionIndex: number;
  sectionBlend: number;
  sectionSurge: number;
  morphology: number;
  finale: number;
  structureLevel: number;
  bassImpact: number;
  midImpact: number;
  trebleImpact: number;
  tapestryImpact: number;
  snareFlash: number;
  beatPunch: number;
  hardBeat: number;
  breath: number;
  pulse: number;
  glow: number;
  bloom: number;
  glare: number;
  chromaFringe: number;
  lineWeight: number;
  reach: number;
  deformation: number;
  movement: number;
  movementBurst: number;
  jitter: number;
  shapeScaleX: number;
  shapeScaleY: number;
  hueShift: number;
  tempoRate: number;
  gesture: RadioVisualMusicGesture;
  gestureStrength: number;
  gestureProgress: number | null;
  edgePrimitiveBudget: number;
  opticalPrimitiveBudget: number;
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
  const sectionPosition = Math.min(progress * 4, 3.999_999);
  const sectionIndex = Math.floor(sectionPosition);
  const sectionBlend = smoothstep(sectionPosition - sectionIndex);
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
  const tempoWave = Math.pow(0.5 + 0.5 * Math.cos(tempoPosition * Math.PI * 2), 3.2);
  const breathWave = Math.sin(
    tempoPosition / profile.breathBeats * Math.PI * 2
      + seedPhase
      + sectionPosition * 0.21,
  );
  const breath = clampVisualValue(0.5 + breathWave * 0.5);
  const strongestImpact = Math.max(bassImpact, midImpact, trebleImpact, tapestryImpact);
  const hardBeat = smoothstep((strongestImpact - 0.38) / 0.56);
  const beatPunch = clampVisualValue(
    bassImpact * 0.5
      + midImpact * 0.12
      + tapestryImpact * 0.18
      + hardBeat * 0.2
      + tempoWave * structureLevel * (0.018 + strongestImpact * 0.052),
  );
  const sectionSurge = clampVisualValue(
    Math.pow(Math.sin(sectionBlend * Math.PI), 2)
      * (0.16 + metamorphosis * 0.84)
      * structureLevel,
  );
  const morphology = clampVisualValue(
    metamorphosis
      * profile.morphBias
      * (0.16 + structureLevel * 0.56 + drives.tapestry * 0.12 + strongestImpact * 0.16),
  );
  const pulse = clampVisualValue(
    structureLevel * (0.035 + breath * profile.breathDepth * 0.14)
      + beatPunch * 0.32
      + hardBeat * 0.18
      + sectionSurge * 0.12
      + bassImpact * 0.32
      + midImpact * 0.2
      + trebleImpact * 0.1
      + tapestryImpact * 0.3,
  );
  const glow = clampVisualValue(
    profile.glowBias
      * (structureLevel * 0.08 + trebleImpact * 0.58 + snareFlash * 0.24 + tapestryImpact * 0.22),
  );
  const bloom = clampVisualValue(
    profile.glowBias
      * (structureLevel * 0.035
        + trebleImpact * 0.4
        + snareFlash * 0.2
        + hardBeat * 0.22
        + tapestryImpact * 0.18
        + sectionSurge * 0.1),
  );
  const glare = clampVisualValue(
    profile.glareBias
      * (trebleImpact * 0.38
        + snareFlash * 0.38
        + tapestryImpact * 0.18
        + hardBeat * 0.16
        + sectionSurge * 0.08),
  );
  const chromaFringe = clampVisualValue(
    profile.trebleHue * (trebleImpact * 0.56 + tapestryImpact * 0.24 + snareFlash * 0.12),
  );
  const lineWeight = clampVisualValue(
    0.72
      + structureLevel * 0.38
      + profile.beatWeight * (bassImpact * 0.7 + hardBeat * 0.34 + sectionSurge * 0.12)
      + tapestryImpact * 0.28,
    0.72,
    2.38,
  );
  const reach = clampVisualValue(
    0.72
      + structureLevel * 0.24
      + breath * structureLevel * profile.breathDepth * 0.06
      + profile.beatReach * (beatPunch * 0.22 + hardBeat * 0.12)
      + bassImpact * 0.12
      + midImpact * 0.08
      + tapestryImpact * 0.12
      + sectionSurge * 0.07,
    0.72,
    1.42,
  );
  const deformation = clampVisualValue(
    profile.deformationBias
      * (morphology * structureLevel * 0.34
        + midImpact * 0.36
        + tapestryImpact * 0.18
        + trebleImpact * 0.08
        + hardBeat * 0.18
        + sectionSurge * 0.14),
  );
  const movementBurst = clampVisualValue(
    sectionSurge * 0.34
      + hardBeat * profile.impactMotion * 0.48
      + midImpact * 0.2
      + trebleImpact * 0.14
      + tapestryImpact * 0.2,
  );
  const movement = clampVisualValue(
    profile.movementBias
      * (morphology * structureLevel * 0.08
        + bassImpact * 0.12
        + midImpact * 0.28
        + trebleImpact * 0.18
        + tapestryImpact * 0.22
        + movementBurst * 0.34),
  );
  const jitterProfile = profile.startJitter
    + (profile.endJitter - profile.startJitter) * metamorphosis;
  const jitter = clampVisualValue(
    jitterProfile
      * (structureLevel * 0.05
        + trebleImpact * 0.38
        + midImpact * 0.14
        + hardBeat * 0.3
        + sectionSurge * 0.12),
  );
  const breathOffset = (breath - 0.5)
    * 2
    * structureLevel
    * profile.breathDepth
    * (0.012 + metamorphosis * 0.008);
  const bassExpansion = profile.bassScale
    * (drives.bassLayer * structureLevel * 0.012 + beatPunch * 0.032 + hardBeat * 0.01);
  const shapeScaleX = clampVisualValue(
    1 + breathOffset + bassExpansion + sectionSurge * 0.01,
    0.955,
    1.075,
  );
  const shapeScaleY = clampVisualValue(
    1
      + breathOffset * (0.58 + profile.deformationBias * 0.24)
      + bassExpansion * (0.48 + profile.beatWeight * 0.2)
      - hardBeat * profile.beatReach * 0.006
      + sectionSurge * 0.008,
    0.955,
    1.075,
  );
  const hueShift = clampVisualValue(
    profile.trebleHue
      * metamorphosis
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
      sectionIndex,
      sectionBlend,
      sectionSurge: 0,
      morphology: 0,
      finale: 0,
      structureLevel: 0,
      bassImpact: 0,
      midImpact: 0,
      trebleImpact: 0,
      tapestryImpact: 0,
      snareFlash: 0,
      beatPunch: 0,
      hardBeat: 0,
      breath: 0.5,
      pulse: 0,
      glow: 0,
      bloom: 0,
      glare: 0,
      chromaFringe: 0,
      lineWeight: 1,
      reach: 1,
      deformation: 0,
      movement: 0,
      movementBurst: 0,
      jitter: 0,
      shapeScaleX: 1,
      shapeScaleY: 1,
      hueShift: 0,
      tempoRate: 1,
      gesture: gesture.gesture,
      gestureStrength: 0,
      gestureProgress: null,
      edgePrimitiveBudget: 0,
      opticalPrimitiveBudget: 0,
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
    sectionIndex,
    sectionBlend,
    sectionSurge,
    morphology,
    finale,
    structureLevel,
    bassImpact,
    midImpact,
    trebleImpact,
    tapestryImpact,
    snareFlash,
    beatPunch,
    hardBeat,
    breath,
    pulse,
    glow,
    bloom,
    glare,
    chromaFringe,
    lineWeight,
    reach,
    deformation,
    movement,
    movementBurst,
    jitter,
    shapeScaleX,
    shapeScaleY,
    hueShift,
    tempoRate: clampVisualValue(
      (profile.startMotion + (profile.endMotion - profile.startMotion) * metamorphosis)
        * (0.86 + (safeBpm - 55) / 725)
        + movementBurst * 0.18,
      0.48,
      1.95,
    ),
    gesture: gesture.gesture,
    gestureStrength: gesture.strength,
    gestureProgress,
    edgePrimitiveBudget: Math.max(2, Math.round(profile.edgeBudget * (0.28 + structureLevel * 0.52 + morphology * 0.2))),
    opticalPrimitiveBudget: structureLevel < 0.012 && strongestImpact < 0.012
      ? 0
      : Math.min(16, Math.max(2, Math.round(
        profile.edgeBudget * (0.18 + structureLevel * 0.34 + strongestImpact * 0.34 + sectionSurge * 0.14),
      ))),
    centerPrimitiveBudget: 9,
    centerActive,
  };
}
