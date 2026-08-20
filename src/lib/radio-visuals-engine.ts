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
  { primary: "#22d3ee", secondary: "#7c3aed", highlight: "#ffffff", shadow: "#020202" },
];

const STAGE_INTENSITY: Record<RadioVisualsShowStage, number> = {
  standby: 0.06,
  intake: 0.12,
  early: 0.18,
  middle: 0.26,
  late: 0.34,
  final: 0.42,
  complete: 0.13,
};

export const RADIO_VISUAL_COMPOSITION_TYPES = [
  "liquid_dream",
  "kaleidoscope",
  "spectral_loom",
  "feedback_architecture",
  "cosmic_signal",
  "chromatic_smear",
] as const;

export type RadioVisualCompositionType = (typeof RADIO_VISUAL_COMPOSITION_TYPES)[number];

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

export interface RadioVisualWheelVortexProfile {
  tunnel: number;
  spin: number;
  turbulence: number;
  release: number;
}

export const RADIO_VISUAL_AMBIENT_MOMENT_TYPES = [
  "violet_bloom",
  "signal_ripple",
  "shadow_pass",
  "particle_lift",
  "barcode_shimmer",
  "prism_drift",
  "ribbon_sweep",
  "liquid_cell",
  "kaleido_blink",
  "ghost_frame",
  "spectral_veil",
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

export function radioVisualsPalette(snapshot: RadioVisualsSnapshot): RadioVisualsPalette {
  if (snapshot.visualMode === "wheel") return { primary: "#00ff88", secondary: "#e0e0e0", highlight: "#a78bfa", shadow: "#030303" };
  if (snapshot.visualMode === "system") return { primary: "#ff3333", secondary: "#00ff88", highlight: "#ffffff", shadow: "#020202" };
  if (snapshot.visualMode === "sponsor") return { primary: "#7c3aed", secondary: "#00ff88", highlight: "#ffffff", shadow: "#050505" };
  return BRAND_PALETTES[Math.abs(snapshot.visualSeed) % BRAND_PALETTES.length];
}

export function radioVisualsIntensity(snapshot: RadioVisualsSnapshot): number {
  let intensity = STAGE_INTENSITY[snapshot.showStage];
  if (snapshot.visualMode === "wheel") intensity = 0.56;
  if (snapshot.visualMode === "system") intensity = 0.42;
  if (snapshot.visualMode === "sponsor") intensity = 0.28;
  if (snapshot.player?.playbackState === "playing") intensity += 0.07;
  if (snapshot.player?.playbackState === "paused") intensity -= 0.045;
  if (snapshot.queue.pressure === "medium") intensity += 0.018;
  if (snapshot.queue.pressure === "high") intensity += 0.05;
  if (snapshot.queue.pressure === "max") intensity += 0.085;
  if (snapshot.cue?.type === "party") intensity = Math.max(intensity, 0.55);
  if (snapshot.cue?.type === "shadow") intensity = Math.max(intensity, 0.5);
  if (snapshot.cue?.type === "signal_breach") intensity = Math.max(intensity, 0.68);
  if (snapshot.cue?.type === "blackout") intensity = Math.max(intensity, 0.82);
  if (snapshot.cue?.type === "lightning") intensity = Math.max(intensity, 0.75);
  return clampVisualValue(intensity, 0.025, 0.9);
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

export function radioVisualComposition(seed: number): RadioVisualCompositionType {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return RADIO_VISUAL_COMPOSITION_TYPES[hashRadioVisualToken(`composition:${safeSeed}`) % RADIO_VISUAL_COMPOSITION_TYPES.length];
}

export function radioVisualFallbackRhythm(seed: number): RadioVisualFallbackRhythm {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return RADIO_VISUAL_FALLBACK_RHYTHMS[hashRadioVisualToken(`rhythm:${safeSeed}`) % RADIO_VISUAL_FALLBACK_RHYTHMS.length];
}

export function radioVisualWheelVortexProfile(sceneMode: RadioVisualsSnapshot["sceneMode"]): RadioVisualWheelVortexProfile {
  if (sceneMode === "wheel_reencrypting") return { tunnel: 0.9, spin: 0.72, turbulence: 1, release: 0 };
  if (sceneMode === "wheel_spinning") return { tunnel: 1, spin: 1, turbulence: 0.86, release: 0 };
  if (sceneMode === "wheel_result") return { tunnel: 0.86, spin: 0.34, turbulence: 0.42, release: 1 };
  if (sceneMode === "wheel_confirmed") return { tunnel: 0.52, spin: 0.18, turbulence: 0.18, release: 0.66 };
  if (sceneMode === "wheel_ready") return { tunnel: 0.56, spin: 0.28, turbulence: 0.22, release: 0 };
  return { tunnel: 0.46, spin: 0.24, turbulence: 0.2, release: 0 };
}

function rhythmPulse(phase: number, power: number): number {
  const cycle = ((phase % 1) + 1) % 1;
  return Math.pow((Math.cos(cycle * Math.PI * 2) + 1) / 2, power);
}

export function radioVisualsMusicSignal(
  snapshot: RadioVisualsSnapshot,
  playbackSeconds: number,
  transportSeconds: number,
  bridgeSignal: RadioAudioBridgeSignal | null = null,
): RadioVisualMusicSignal {
  const seed = snapshot.visualSeed;
  const fallbackRhythm = radioVisualFallbackRhythm(seed);
  const rhythmProfile = FALLBACK_RHYTHM_PROFILES[fallbackRhythm];
  const bpm = rhythmProfile.bpmMin + Math.round(seededUnit(seed, 30_001) * rhythmProfile.bpmSpan);
  const playing = snapshot.player?.playbackState === "playing";
  const paused = snapshot.player?.playbackState === "paused";
  const automaticTrack = snapshot.visualMode === "track" && !snapshot.player;
  const clockSeconds = playing && Number.isFinite(playbackSeconds)
    ? Math.max(0, playbackSeconds)
    : Math.max(0, transportSeconds) * (paused ? 0.12 : automaticTrack ? 0.9 + rhythmProfile.swing * 0.22 : snapshot.sessionActive ? 0.46 : 0.18);
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
    && bridgeSignal.warmedUp
    && !bridgeSignal.silence,
  );
  if (hasLoopback && bridgeSignal) {
    const confidence = clampVisualValue(bridgeSignal.tempoConfidence);
    const liveWeight = 0.9;
    const liveBeat = clampVisualValue(bridgeSignal.beat);
    return {
      source: "windows_loopback",
      bpm: confidence >= 0.28 ? bridgeSignal.bpm : bpm,
      energy: clampVisualValue(bridgeSignal.energy * liveWeight + timelineEnergy * (1 - liveWeight), 0.025, 0.98),
      bass: clampVisualValue(bridgeSignal.bass * liveWeight + timelineBass * (1 - liveWeight)),
      mid: clampVisualValue(bridgeSignal.mid * liveWeight + timelineMid * (1 - liveWeight)),
      treble: clampVisualValue(bridgeSignal.treble * liveWeight + timelineTreble * (1 - liveWeight)),
      beat: clampVisualValue(Math.max(liveBeat, beat * 0.1) * (0.72 + bridgeSignal.bass * 0.28)),
      accent: clampVisualValue(Math.max(liveBeat * 0.78, bridgeSignal.peak * 0.62, bridgeSignal.treble * 0.24)),
      peak: clampVisualValue(bridgeSignal.peak),
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
