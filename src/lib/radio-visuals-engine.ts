import type { RadioVisualCue } from "./radio-visuals-cues";
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
  standby: 0.035,
  intake: 0.07,
  early: 0.12,
  middle: 0.17,
  late: 0.23,
  final: 0.29,
  complete: 0.08,
};

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
  if (snapshot.visualMode === "wheel") intensity = 0.42;
  if (snapshot.visualMode === "system") intensity = 0.3;
  if (snapshot.visualMode === "sponsor") intensity = 0.18;
  if (snapshot.player?.playbackState === "playing") intensity += 0.055;
  if (snapshot.player?.playbackState === "paused") intensity -= 0.045;
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
  if (snapshot.showStage === "standby" || snapshot.showStage === "complete") return 0.12;
  return 0.34;
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
