"use client";

import { useEffect, useRef, useState } from "react";
import type { RadioVisualsPlayerSignal, RadioVisualsSnapshot } from "@/lib/radio-visuals";
import {
  clampVisualValue,
  RADIO_VISUALS_CHROMA_KEY,
  radioVisualCueEnvelope,
  radioVisualCueProgress,
  radioVisualsIntensity,
  radioVisualsMotionRate,
  radioVisualsPalette,
} from "@/lib/radio-visuals-engine";
import { RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS, RADIO_VISUALS_STANDBY_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";

type ServerClockAnchor = { serverNowMs: number; receivedAtPerformanceMs: number };
type ConnectionState = "connected" | "reconnecting" | "standby";
type Rgb = [number, number, number];

interface VisualRuntime {
  lastFrameMs: number;
  intensity: number;
  primary: Rgb;
  secondary: Rgb;
  highlight: Rgb;
  currentSeed: number;
  previousSeed: number;
  seedTransitionStartedAtMs: number;
  bloomStartedAtMs: number;
  wheelMix: number;
  systemMix: number;
}

const RETRY_POLL_INTERVAL_MS = 5_000;
const PALETTE_TRANSITION_MS = 2_400;
const PARTICLE_TRANSITION_MS = 2_000;
const TRACK_BLOOM_MS = 1_700;

function fallbackSnapshot(): RadioVisualsSnapshot {
  return {
    sessionActive: false,
    showStage: "standby",
    visualMode: "standby",
    sceneMode: "standby",
    queue: {
      acceptedCount: 0,
      completedCount: 0,
      activeCount: 0,
      remainingCount: 0,
      progress: 0,
      pressure: "low",
    },
    player: null,
    cue: null,
    visualSeed: 2166136261,
    updatedAt: new Date().toISOString(),
  };
}

function hexToRgb(value: string): Rgb {
  const hex = value.replace(/^#/, "");
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${clampVisualValue(alpha)})`;
}

function mixRgb(current: Rgb, target: Rgb, amount: number): Rgb {
  return [
    current[0] + (target[0] - current[0]) * amount,
    current[1] + (target[1] - current[1]) * amount,
    current[2] + (target[2] - current[2]) * amount,
  ];
}

function ease(value: number): number {
  const bounded = clampVisualValue(value);
  return bounded * bounded * (3 - 2 * bounded);
}

function randomUnit(seed: number, index: number): number {
  const value = Math.sin((seed + index * 1_919) * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}

function estimatedServerNowMs(anchor: ServerClockAnchor | null, nowPerformanceMs: number): number {
  return anchor
    ? anchor.serverNowMs + Math.max(0, nowPerformanceMs - anchor.receivedAtPerformanceMs)
    : Date.now();
}

function projectedPlaybackSeconds(player: RadioVisualsPlayerSignal | null, anchor: ServerClockAnchor | null, nowPerformanceMs: number): number {
  if (!player) return 0;
  const updatedAtMs = Date.parse(player.updatedAt);
  const elapsedSeconds = player.playbackState === "playing" && Number.isFinite(updatedAtMs)
    ? Math.max(0, estimatedServerNowMs(anchor, nowPerformanceMs) - updatedAtMs) / 1_000
    : 0;
  const projected = Math.max(0, player.currentTimeSeconds + elapsedSeconds);
  return player.durationSeconds ? Math.min(player.durationSeconds, projected) : projected;
}

function radialLight(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  color: Rgb,
  alpha: number,
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.38, rgba(color, alpha * 0.48));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawBeam(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  angle: number,
  beamWidth: number,
  color: Rgb,
  alpha: number,
): void {
  context.save();
  context.translate(originX, -height * 0.08);
  context.rotate(angle);
  const gradient = context.createLinearGradient(-beamWidth / 2, 0, beamWidth / 2, 0);
  gradient.addColorStop(0, rgba(color, 0));
  gradient.addColorStop(0.5, rgba(color, alpha));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(-beamWidth * 0.15, 0);
  context.lineTo(beamWidth * 0.15, 0);
  context.lineTo(beamWidth * 0.82, height * 1.7);
  context.lineTo(-beamWidth * 0.82, height * 1.7);
  context.closePath();
  context.fill();
  context.restore();
}

function drawAmbientLighting(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  energy: number,
): void {
  const radius = Math.max(width, height) * 0.72;
  const breath = 0.72 + energy * 0.28;
  radialLight(context, width, height, width * (-0.04 + Math.sin(time * 0.19) * 0.04), height * (0.32 + Math.sin(time * 0.13) * 0.08), radius, primary, intensity * 0.72 * breath);
  radialLight(context, width, height, width * (1.04 + Math.cos(time * 0.17) * 0.04), height * (0.62 + Math.cos(time * 0.11) * 0.1), radius, secondary, intensity * 0.58 * breath);
  radialLight(context, width, height, width * 0.5, height * 1.06, radius * 0.72, highlight, intensity * 0.12 * energy);

  const sweep = (Math.sin(time * 0.22) + 1) * 0.5;
  drawBeam(context, width, height, width * (0.12 + sweep * 0.76), -0.36 + sweep * 0.28, width * 0.18, secondary, intensity * 0.12);
}

function drawGoboShadows(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  shadow: Rgb,
): void {
  context.save();
  context.translate(width * 0.5, height * 0.5);
  context.rotate(-0.22 + Math.sin(time * 0.09) * 0.08);
  context.filter = `blur(${Math.max(3, Math.min(width, height) * 0.008)}px)`;
  context.fillStyle = rgba(shadow, intensity * 0.34);
  const gap = Math.max(54, Math.min(width, height) * 0.11);
  const drift = (time * gap * 0.06) % (gap * 2);
  for (let x = -width - height + drift; x < width + height; x += gap * 2) {
    context.fillRect(x, -height, gap * 0.66, height * 2);
  }
  context.filter = "none";
  context.restore();
}

function drawCaustics(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  color: Rgb,
  seed: number,
): void {
  context.save();
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.0024);
  context.strokeStyle = rgba(color, intensity * 0.24);
  context.shadowColor = rgba(color, intensity * 0.5);
  context.shadowBlur = Math.min(width, height) * 0.018;
  for (let line = 0; line < 7; line += 1) {
    const side = line % 2 === 0 ? 0 : width;
    const reach = width * (0.16 + randomUnit(seed, line) * 0.13);
    context.beginPath();
    for (let step = 0; step <= 24; step += 1) {
      const y = height * (step / 24);
      const wave = Math.sin(step * 0.72 + time * (0.35 + line * 0.025) + line) * reach * 0.16;
      const x = side === 0 ? wave + reach * 0.42 : width - wave - reach * 0.42;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.restore();
}

function drawParticleField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  seed: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  densityMultiplier = 1,
): void {
  const count = Math.max(8, Math.floor((18 + intensity * 72) * densityMultiplier));
  context.save();
  for (let index = 0; index < count; index += 1) {
    const side = randomUnit(seed, index * 5) > 0.5;
    const outerX = randomUnit(seed, index * 5 + 1) * width * 0.24;
    const x = side ? width - outerX : outerX;
    const speed = 0.016 + randomUnit(seed, index * 5 + 2) * 0.05;
    const y = ((randomUnit(seed, index * 5 + 3) + time * speed) % 1.12 - 0.06) * height;
    const size = Math.max(0.8, Math.min(width, height) * (0.0014 + randomUnit(seed, index * 5 + 4) * 0.004));
    const colorChoice = index % 7 === 0 ? highlight : index % 2 === 0 ? primary : secondary;
    const shimmer = 0.35 + 0.65 * Math.abs(Math.sin(time * (0.55 + speed * 8) + index));
    context.fillStyle = rgba(colorChoice, intensity * (0.32 + shimmer * 0.58));
    context.shadowColor = rgba(colorChoice, intensity * 0.8);
    context.shadowBlur = size * 4;
    if (index % 5 === 0) context.fillRect(x, y, size * 0.5, size * (2.5 + shimmer * 4));
    else {
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function drawWavefronts(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  energy: number,
  primary: Rgb,
  secondary: Rgb,
): void {
  const cycle = (time * 0.18) % 1;
  const radius = Math.min(width, height) * (0.12 + cycle * 0.48);
  const strokeColor = rgba(cycle > 0.55 ? secondary : primary, intensity * energy * (1 - cycle) * 0.48);
  context.save();
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.0035);
  context.strokeStyle = strokeColor;
  context.shadowColor = strokeColor;
  context.shadowBlur = Math.min(width, height) * 0.018;
  context.beginPath();
  context.ellipse(width * 0.5, height * 0.5, radius * 0.72, radius, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawTrackBloom(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
): void {
  if (elapsedMs < 0 || elapsedMs >= TRACK_BLOOM_MS) return;
  const progress = elapsedMs / TRACK_BLOOM_MS;
  const envelope = Math.sin(progress * Math.PI);
  radialLight(context, width, height, width * 0.5, height * 0.5, Math.max(width, height) * (0.22 + progress * 0.62), progress < 0.45 ? highlight : secondary, envelope * 0.22);
  context.save();
  context.strokeStyle = rgba(progress < 0.5 ? highlight : primary, envelope * 0.7);
  context.lineWidth = Math.max(2, Math.min(width, height) * (0.012 - progress * 0.008));
  context.beginPath();
  context.ellipse(width * 0.5, height * 0.5, width * (0.08 + progress * 0.5), height * (0.05 + progress * 0.36), 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawWheelScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const radius = Math.min(width, height) * 0.35;
  context.save();
  context.translate(width * 0.5, height * 0.5);
  context.rotate(time * 0.28);
  for (let ring = 0; ring < 3; ring += 1) {
    context.setLineDash([radius * (0.12 + ring * 0.04), radius * (0.06 + ring * 0.02)]);
    context.lineDashOffset = time * (18 + ring * 9) * (ring % 2 ? -1 : 1);
    context.lineWidth = Math.max(1.5, Math.min(width, height) * (0.004 + ring * 0.002));
    context.strokeStyle = rgba(ring === 0 ? primary : ring === 1 ? secondary : highlight, mix * (0.3 + ring * 0.13));
    context.beginPath();
    context.arc(0, 0, radius * (0.72 + ring * 0.18), 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();

  drawParticleField(context, width, height, time * 1.5, mix * 0.75, seed + 8_801, primary, secondary, highlight, 1.35);
}

function drawPartyCue(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  progress: number,
  envelope: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const pulse = 0.65 + Math.sin(time * 2.4) * 0.2 + Math.sin(time * 1.1) * 0.1;
  for (let beam = 0; beam < 6; beam += 1) {
    const color = beam % 3 === 0 ? highlight : beam % 2 === 0 ? primary : secondary;
    const sweep = Math.sin(time * (0.42 + beam * 0.035) + beam * 1.37);
    drawBeam(context, width, height, width * (0.08 + beam * 0.17), sweep * 0.48, width * 0.13, color, envelope * pulse * 0.3);
  }
  radialLight(context, width, height, width * (0.5 + Math.sin(time * 0.55) * 0.36), height * (0.38 + Math.cos(time * 0.43) * 0.22), Math.max(width, height) * 0.48, progress < 0.5 ? secondary : primary, envelope * pulse * 0.34);
  drawParticleField(context, width, height, time * 2.2, envelope * 0.92, seed + 22_019, primary, secondary, highlight, 2.3);
}

function drawShadowCue(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  shadow: Rgb,
): void {
  const travel = ease(progress);
  context.save();
  context.translate(width * (-0.42 + travel * 1.84), height * 0.5);
  context.rotate(-0.28);
  context.filter = `blur(${Math.max(8, Math.min(width, height) * 0.024)}px)`;
  const gradient = context.createLinearGradient(-width * 0.38, 0, width * 0.38, 0);
  gradient.addColorStop(0, rgba(shadow, 0));
  gradient.addColorStop(0.38, rgba(shadow, envelope * 0.64));
  gradient.addColorStop(0.62, rgba(shadow, envelope * 0.64));
  gradient.addColorStop(1, rgba(shadow, 0));
  context.fillStyle = gradient;
  context.fillRect(-width * 0.45, -height, width * 0.9, height * 2);
  context.filter = "none";
  context.restore();
}

function drawSignalBreachCue(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  progress: number,
  envelope: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const frameSeed = seed + Math.floor(time * 7) * 97;
  context.save();
  for (let index = 0; index < 34; index += 1) {
    const fromRight = randomUnit(frameSeed, index * 4) > 0.5;
    const x = fromRight ? width * (0.68 + randomUnit(frameSeed, index * 4 + 1) * 0.34) : width * randomUnit(frameSeed, index * 4 + 1) * 0.32;
    const y = height * randomUnit(frameSeed, index * 4 + 2);
    const fragmentWidth = width * (0.01 + randomUnit(frameSeed, index * 4 + 3) * 0.1);
    const color = index % 9 === 0 ? [255, 51, 51] as Rgb : index % 3 === 0 ? highlight : index % 2 === 0 ? primary : secondary;
    context.fillStyle = rgba(color, envelope * (0.18 + randomUnit(frameSeed, index + 900) * 0.52));
    context.fillRect(x, y, fragmentWidth, Math.max(1, height * (0.001 + randomUnit(frameSeed, index + 1_200) * 0.006)));
  }
  context.strokeStyle = rgba(progress < 0.5 ? highlight : primary, envelope * 0.55);
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.003);
  context.beginPath();
  for (let step = 0; step <= 18; step += 1) {
    const y = height * (step / 18);
    const x = width * (0.1 + progress * 0.8) + (randomUnit(frameSeed, step + 3_000) - 0.5) * width * 0.08;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function drawBlackoutCue(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  primary: Rgb,
  shadow: Rgb,
): void {
  context.fillStyle = rgba(shadow, envelope * 0.82);
  context.fillRect(0, 0, width, height);
  const reopening = clampVisualValue((progress - 0.62) / 0.38);
  if (reopening > 0) {
    radialLight(context, width, height, width * 0.5, height * 0.5, Math.max(width, height) * reopening, primary, reopening * 0.24);
  }
}

function drawBolt(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  xOffset: number,
  color: Rgb,
  alpha: number,
): void {
  context.save();
  context.strokeStyle = rgba(color, alpha);
  context.shadowColor = rgba(color, alpha);
  context.shadowBlur = Math.min(width, height) * 0.03;
  context.lineWidth = Math.max(1.5, Math.min(width, height) * 0.006);
  context.beginPath();
  for (let step = 0; step <= 13; step += 1) {
    const y = height * (step / 13);
    const x = width * xOffset + (randomUnit(seed, step) - 0.5) * width * 0.15;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function drawLightningCue(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  primary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const strikeA = Math.exp(-Math.pow((progress - 0.38) / 0.035, 2));
  const strikeB = Math.exp(-Math.pow((progress - 0.62) / 0.045, 2)) * 0.68;
  const afterglow = envelope * Math.max(0, 1 - progress) * 0.24;
  const strike = clampVisualValue(strikeA + strikeB);
  context.fillStyle = rgba(highlight, strike * 0.2 + afterglow * 0.08);
  context.fillRect(0, 0, width, height);
  if (strike > 0.04) {
    drawBolt(context, width, height, seed, 0.27, highlight, strike);
    drawBolt(context, width, height, seed + 721, 0.72, primary, strike * 0.72);
  }
  radialLight(context, width, height, width * 0.5, 0, Math.max(width, height) * 0.72, highlight, afterglow);
}

function proceduralEnergy(snapshot: RadioVisualsSnapshot, time: number, seedPhase: number): number {
  const actualEnergy = typeof snapshot.player?.audioEnergy === "number" ? clampVisualValue(snapshot.player.audioEnergy) : null;
  const generated = 0.46 + Math.sin(time * 1.9 + seedPhase) * 0.18 + Math.sin(time * 4.1 + seedPhase * 0.6) * 0.1;
  return clampVisualValue(actualEnergy ?? generated, 0.12, 0.82);
}

function drawVisualFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestampMs: number,
  snapshot: RadioVisualsSnapshot,
  anchor: ServerClockAnchor | null,
  runtime: VisualRuntime,
  reducedMotion: boolean,
  previewMode: boolean,
): void {
  const elapsedMs = runtime.lastFrameMs > 0 ? Math.min(100, timestampMs - runtime.lastFrameMs) : 16;
  runtime.lastFrameMs = timestampMs;
  const palette = radioVisualsPalette(snapshot);
  const paletteLerp = 1 - Math.exp(-elapsedMs / PALETTE_TRANSITION_MS);
  runtime.primary = mixRgb(runtime.primary, hexToRgb(palette.primary), paletteLerp);
  runtime.secondary = mixRgb(runtime.secondary, hexToRgb(palette.secondary), paletteLerp);
  runtime.highlight = mixRgb(runtime.highlight, hexToRgb(palette.highlight), paletteLerp);
  runtime.intensity += (radioVisualsIntensity(snapshot) - runtime.intensity) * (1 - Math.exp(-elapsedMs / 1_800));
  runtime.wheelMix += ((snapshot.visualMode === "wheel" ? 1 : 0) - runtime.wheelMix) * (1 - Math.exp(-elapsedMs / 1_300));
  runtime.systemMix += ((snapshot.visualMode === "system" ? 1 : 0) - runtime.systemMix) * (1 - Math.exp(-elapsedMs / 1_100));

  if (runtime.currentSeed !== snapshot.visualSeed) {
    runtime.previousSeed = runtime.currentSeed;
    runtime.currentSeed = snapshot.visualSeed;
    runtime.seedTransitionStartedAtMs = timestampMs;
    if (snapshot.visualMode === "track") runtime.bloomStartedAtMs = timestampMs;
  }

  const seedBlend = ease((timestampMs - runtime.seedTransitionStartedAtMs) / PARTICLE_TRANSITION_MS);
  const playbackSeconds = projectedPlaybackSeconds(snapshot.player, anchor, timestampMs);
  const motionScale = reducedMotion ? 0.18 : 1;
  const time = (timestampMs / 1_000 * radioVisualsMotionRate(snapshot) + playbackSeconds * 0.035) * motionScale;
  const seedPhase = (runtime.currentSeed % 997) / 997 * Math.PI * 2;
  const energy = proceduralEnergy(snapshot, time, seedPhase);
  const shadow = hexToRgb(palette.shadow);
  const serverNowMs = estimatedServerNowMs(anchor, timestampMs);
  const cueProgress = radioVisualCueProgress(snapshot.cue, serverNowMs);
  const cueEnvelope = radioVisualCueEnvelope(snapshot.cue, serverNowMs);

  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.filter = "none";
  context.fillStyle = previewMode ? "#080b0a" : RADIO_VISUALS_CHROMA_KEY;
  context.fillRect(0, 0, width, height);

  drawAmbientLighting(context, width, height, time, runtime.intensity, runtime.primary, runtime.secondary, runtime.highlight, energy);
  drawGoboShadows(context, width, height, time, runtime.intensity, shadow);
  drawCaustics(context, width, height, time, runtime.intensity, runtime.secondary, runtime.currentSeed);
  drawWavefronts(context, width, height, time, runtime.intensity, energy, runtime.primary, runtime.secondary);
  if (seedBlend < 1) drawParticleField(context, width, height, time, runtime.intensity * (1 - seedBlend), runtime.previousSeed, runtime.secondary, runtime.primary, runtime.highlight);
  drawParticleField(context, width, height, time, runtime.intensity * seedBlend, runtime.currentSeed, runtime.primary, runtime.secondary, runtime.highlight);

  if (runtime.systemMix > 0.002) {
    drawSignalBreachCue(context, width, height, time * 0.46, (Math.sin(time * 0.08) + 1) / 2, runtime.systemMix * 0.22, runtime.primary, runtime.secondary, runtime.highlight, runtime.currentSeed + 91);
  }
  drawWheelScene(context, width, height, time, runtime.wheelMix, runtime.primary, runtime.secondary, runtime.highlight, runtime.currentSeed);
  drawTrackBloom(context, width, height, timestampMs - runtime.bloomStartedAtMs, runtime.primary, runtime.secondary, runtime.highlight);

  if (snapshot.cue && cueProgress !== null && cueEnvelope > 0.001) {
    if (snapshot.cue.type === "party") drawPartyCue(context, width, height, time, cueProgress, cueEnvelope, runtime.primary, runtime.secondary, runtime.highlight, runtime.currentSeed);
    if (snapshot.cue.type === "shadow") drawShadowCue(context, width, height, cueProgress, cueEnvelope, shadow);
    if (snapshot.cue.type === "signal_breach") drawSignalBreachCue(context, width, height, time, cueProgress, cueEnvelope, runtime.primary, runtime.secondary, runtime.highlight, runtime.currentSeed);
    if (snapshot.cue.type === "blackout") drawBlackoutCue(context, width, height, cueProgress, cueEnvelope, runtime.primary, shadow);
    if (snapshot.cue.type === "lightning") drawLightningCue(context, width, height, cueProgress, cueEnvelope, runtime.primary, runtime.highlight, runtime.currentSeed);
  }
}

export function RadioVisualsReceiver() {
  const [snapshot, setSnapshot] = useState<RadioVisualsSnapshot>(() => fallbackSnapshot());
  const [connection, setConnection] = useState<ConnectionState>("standby");
  const [clockAnchor, setClockAnchor] = useState<ServerClockAnchor | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewModeRef = useRef(false);
  const runtimeRef = useRef<VisualRuntime>({
    lastFrameMs: 0,
    intensity: 0.035,
    primary: hexToRgb("#00ff88"),
    secondary: hexToRgb("#7c3aed"),
    highlight: hexToRgb("#e0e0e0"),
    currentSeed: 2166136261,
    previousSeed: 2166136261,
    seedTransitionStartedAtMs: 0,
    bloomStartedAtMs: Number.NEGATIVE_INFINITY,
    wheelMix: 0,
    systemMix: 0,
  });

  useEffect(() => {
    previewModeRef.current = new URLSearchParams(window.location.search).get("preview") === "1";
  }, []);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let wakeRequested = false;
    let timeoutId: number | null = null;
    let controller: AbortController | null = null;

    const clearScheduled = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const schedule = (delayMs: number) => {
      clearScheduled();
      if (stopped) return;
      timeoutId = window.setTimeout(() => { void run(); }, delayMs);
    };

    const run = async () => {
      if (stopped) return;
      if (inFlight) {
        wakeRequested = true;
        return;
      }
      clearScheduled();
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/overlay/radio-visuals", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Visuals receiver returned ${response.status}.`);
        const receivedAtPerformanceMs = performance.now();
        const payload = await response.json() as { snapshot?: RadioVisualsSnapshot; serverNow?: string };
        if (!payload.snapshot) throw new Error("Visuals receiver returned no snapshot.");
        setSnapshot(payload.snapshot);
        const serverNowMs = typeof payload.serverNow === "string" ? Date.parse(payload.serverNow) : Number.NaN;
        if (Number.isFinite(serverNowMs)) setClockAnchor({ serverNowMs, receivedAtPerformanceMs });
        setConnection(payload.snapshot.sessionActive ? "connected" : "standby");
        schedule(payload.snapshot.sessionActive ? RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS : RADIO_VISUALS_STANDBY_POLL_INTERVAL_MS);
      } catch (error) {
        if (!stopped && !(error instanceof DOMException && error.name === "AbortError")) {
          setConnection("reconnecting");
          schedule(RETRY_POLL_INTERVAL_MS);
        }
      } finally {
        inFlight = false;
        controller = null;
        if (!stopped && wakeRequested) {
          wakeRequested = false;
          void run();
        }
      }
    };

    const wake = () => { void run(); };
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    void run();

    return () => {
      stopped = true;
      clearScheduled();
      controller?.abort();
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frameId = 0;
    let lastDrawAt = 0;

    const draw = (timestampMs: number) => {
      frameId = window.requestAnimationFrame(draw);
      if (timestampMs - lastDrawAt < 32) return;
      lastDrawAt = timestampMs;
      const bounds = canvas.getBoundingClientRect();
      const density = Math.min(1.5, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(bounds.width * density));
      const pixelHeight = Math.max(1, Math.round(bounds.height * density));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(density, 0, 0, density, 0, 0);
      drawVisualFrame(context, bounds.width, bounds.height, timestampMs, snapshot, clockAnchor, runtimeRef.current, reducedMotion, previewModeRef.current);
    };
    frameId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frameId);
  }, [snapshot, clockAnchor]);

  return (
    <section
      className="radio-visuals-shell"
      data-connection={connection}
      data-player-state={snapshot.player?.playbackState ?? "waiting"}
      data-show-stage={snapshot.showStage}
      data-visual-mode={snapshot.visualMode}
      data-visual-cue={snapshot.cue?.type ?? "none"}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="radio-visuals-canvas" />
    </section>
  );
}
