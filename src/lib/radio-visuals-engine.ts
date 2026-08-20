import type { RadioVisualCue } from "./radio-visuals-cues";
import { hashRadioVisualToken } from "./radio-visuals-events";
import type { RadioVisualsShowStage, RadioVisualsSnapshot } from "./radio-visuals-resolver";

export const RADIO_VISUALS_CHROMA_KEY = "#ff5a00";
export const RADIO_VISUALS_WHEEL_CENTER_Y_RATIO = 0.375;

export interface RadioVisualMusicSignal {
  source: "analyser" | "timeline";
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
  standby: 0.045,
  intake: 0.12,
  early: 0.18,
  middle: 0.26,
  late: 0.34,
  final: 0.42,
  complete: 0.13,
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

function rhythmPulse(phase: number, power: number): number {
  const cycle = ((phase % 1) + 1) % 1;
  return Math.pow((Math.cos(cycle * Math.PI * 2) + 1) / 2, power);
}

export function radioVisualsMusicSignal(
  snapshot: RadioVisualsSnapshot,
  playbackSeconds: number,
  transportSeconds: number,
): RadioVisualMusicSignal {
  const seed = snapshot.visualSeed;
  const bpm = 84 + Math.round(seededUnit(seed, 30_001) * 64);
  const playing = snapshot.player?.playbackState === "playing";
  const paused = snapshot.player?.playbackState === "paused";
  const clockSeconds = playing && Number.isFinite(playbackSeconds)
    ? Math.max(0, playbackSeconds)
    : Math.max(0, transportSeconds) * (paused ? 0.12 : snapshot.sessionActive ? 0.46 : 0.18);
  const beatPosition = clockSeconds * bpm / 60;
  const beat = rhythmPulse(beatPosition, 4.8);
  const eighth = rhythmPulse(beatPosition * 2 + seededUnit(seed, 30_002) * 0.16, 7.2);
  const sixteenthPosition = beatPosition * 4;
  const sixteenthStep = Math.floor(sixteenthPosition) % 16;
  const bar = Math.floor(beatPosition / 4);
  const patternHit = seededUnit(seed + bar, 30_100 + sixteenthStep) > (sixteenthStep % 4 === 0 ? 0.26 : 0.62);
  const sixteenth = patternHit ? rhythmPulse(sixteenthPosition, 8.5) : 0;
  const barBreath = 0.5 + 0.5 * Math.sin(beatPosition / 4 * Math.PI * 2 + seededUnit(seed, 30_003) * Math.PI * 2);
  const activity = playing ? 1 : snapshot.sessionActive ? 0.46 : 0.2;
  const timelineBass = clampVisualValue((0.28 + beat * 0.54 + barBreath * 0.12) * activity, 0.04, 0.94);
  const timelineMid = clampVisualValue((0.3 + beat * 0.18 + eighth * 0.3 + barBreath * 0.15) * activity, 0.04, 0.9);
  const timelineTreble = clampVisualValue((0.24 + eighth * 0.26 + sixteenth * 0.42) * activity, 0.03, 0.92);
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
  const peak = hasAnalyser ? clampVisualValue(snapshot.player?.audioPeak ?? 0) : Math.max(beat * 0.72, sixteenth * 0.4) * activity;
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
