import type { RadioVisualCue } from "./radio-visuals-cues";
import { hashRadioVisualToken } from "./radio-visuals-events";
import type { RadioVisualsShowStage, RadioVisualsSnapshot } from "./radio-visuals-resolver";

export const RADIO_VISUALS_CHROMA_KEY = "#ff5a00";

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
  intake: 0.09,
  early: 0.14,
  middle: 0.2,
  late: 0.27,
  final: 0.34,
  complete: 0.11,
};

export const RADIO_VISUAL_AMBIENT_MOMENT_TYPES = [
  "violet_bloom",
  "signal_ripple",
  "shadow_pass",
  "particle_lift",
  "barcode_shimmer",
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
  if (snapshot.visualMode === "wheel") intensity = 0.48;
  if (snapshot.visualMode === "system") intensity = 0.34;
  if (snapshot.visualMode === "sponsor") intensity = 0.22;
  if (snapshot.player?.playbackState === "playing") intensity += 0.055;
  if (snapshot.player?.playbackState === "paused") intensity -= 0.045;
  if (snapshot.queue.pressure === "medium") intensity += 0.018;
  if (snapshot.queue.pressure === "high") intensity += 0.05;
  if (snapshot.queue.pressure === "max") intensity += 0.085;
  if (snapshot.cue?.type === "party") intensity = Math.max(intensity, 0.55);
  if (snapshot.cue?.type === "shadow") intensity = Math.max(intensity, 0.5);
  if (snapshot.cue?.type === "signal_breach") intensity = Math.max(intensity, 0.68);
  if (snapshot.cue?.type === "blackout") intensity = Math.max(intensity, 0.82);
  if (snapshot.cue?.type === "lightning") intensity = Math.max(intensity, 0.75);
  return clampVisualValue(intensity, 0.025, 0.85);
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

export function radioVisualAmbientMoment(seed: number, nowMs: number, sessionActive: boolean): RadioVisualAmbientMoment | null {
  if (!Number.isFinite(nowMs)) return null;
  const cycleMs = sessionActive ? 20_000 : 27_000;
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
    intensity: (sessionActive ? 0.13 : 0.075) + seededUnit(momentSeed, 3) * (sessionActive ? 0.12 : 0.065),
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
