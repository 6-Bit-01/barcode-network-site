"use client";

import { useEffect, useRef, useState } from "react";
import type { RadioVisualEvent, RadioVisualEventType, RadioVisualsPlayerSignal, RadioVisualsShowStage, RadioVisualsSnapshot } from "@/lib/radio-visuals";
import {
  clampVisualValue,
  RADIO_VISUALS_CHROMA_KEY,
  RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO,
  RADIO_VISUALS_WHEEL_CENTER_Y_RATIO,
  radioVisualAudioDrives,
  radioVisualAmbientMoment,
  radioVisualCueEnvelope,
  radioVisualCueProgress,
  radioVisualMusicScene,
  radioVisualsIntensity,
  radioVisualsEffectStageBounds,
  radioVisualsMusicSignal,
  radioVisualsMotionRate,
  radioVisualsPalette,
} from "@/lib/radio-visuals-engine";
import type { RadioVisualAudioDrives, RadioVisualMusicSignal } from "@/lib/radio-visuals-engine";
import { activeRadioVisualEvent, hashRadioVisualToken, radioVisualEventEnvelope, radioVisualEventProgress } from "@/lib/radio-visuals-events";
import { RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS, RADIO_VISUALS_STANDBY_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { studioOverlayRequestHeaders } from "@/lib/studio-overlay-client";
import {
  freshRadioAudioBridgeSignal,
  normalizeRadioAudioBridgeSignal,
  RADIO_AUDIO_BRIDGE_POLL_INTERVAL_MS,
  RADIO_AUDIO_BRIDGE_RETRY_INTERVAL_MS,
  RADIO_AUDIO_BRIDGE_URL,
} from "@/lib/radio-audio-bridge";
import type { RadioAudioBridgeSignal } from "@/lib/radio-audio-bridge";

type ServerClockAnchor = { serverNowMs: number; receivedAtPerformanceMs: number };
type ConnectionState = "connected" | "reconnecting" | "standby";
type AudioBridgeConnectionState = "idle" | "connecting" | "connected" | "unavailable";
type Rgb = [number, number, number];

interface VisualSignalMemory {
  sessionActive: boolean;
  showStage: RadioVisualsShowStage;
  visualMode: RadioVisualsSnapshot["visualMode"];
  sceneMode: RadioVisualsSnapshot["sceneMode"];
  visualSeed: number;
  intakeOpen: boolean;
  wheelSpinsOwed: number;
  sponsorStatus: RadioVisualsSnapshot["signals"]["sponsorStatus"];
}

interface VisualRuntime {
  lastFrameMs: number;
  wheelPhase: number;
  wheelVelocity: number;
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
  queueMix: number;
  trackMix: number;
  sponsorMix: number;
  intakeMix: number;
  finalMix: number;
  completeMix: number;
  pressureMix: number;
  music: RadioVisualMusicSignal;
  observedSnapshotKey: string;
  observedSignals: VisualSignalMemory | null;
  syntheticEvents: RadioVisualEvent[];
  effectCanvas: HTMLCanvasElement | null;
  effectContext: CanvasRenderingContext2D | null;
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
    signals: {
      intakeOpen: false,
      wheelSpinsOwed: 0,
      sponsorStatus: null,
      broadcastPhase: null,
    },
    player: null,
    cue: null,
    events: [],
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

function smoothMusicSignal(current: RadioVisualMusicSignal, target: RadioVisualMusicSignal, elapsedMs: number): RadioVisualMusicSignal {
  const channel = (value: number, next: number, attackMs = 110, releaseMs = 440) => {
    const responseMs = next > value ? attackMs : releaseMs;
    return value + (next - value) * (1 - Math.exp(-elapsedMs / responseMs));
  };
  return {
    source: target.source,
    bpm: channel(current.bpm, target.bpm, 420, 720),
    energy: channel(current.energy, target.energy, 130, 520),
    bass: channel(current.bass, target.bass, 95, 420),
    mid: channel(current.mid, target.mid, 120, 460),
    treble: channel(current.treble, target.treble, 85, 360),
    beat: channel(current.beat, target.beat, 65, 170),
    accent: channel(current.accent, target.accent, 55, 185),
    peak: channel(current.peak, target.peak, 45, 220),
  };
}

function randomUnit(seed: number, index: number): number {
  const value = Math.sin((seed + index * 1_919) * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}

function prepareEffectLayer(
  runtime: VisualRuntime,
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
  const canvas = runtime.effectCanvas ?? document.createElement("canvas");
  const context = runtime.effectContext ?? canvas.getContext("2d");
  if (!context) return null;
  runtime.effectCanvas = canvas;
  runtime.effectContext = context;
  const pixelWidth = Math.max(1, Math.round(width));
  const pixelHeight = Math.max(1, Math.round(height));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  return { canvas, context };
}

function applyPerformerSafeField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerRetention = 0.08,
): void {
  const unit = Math.min(width, height);
  const maskColor: Rgb = [255, 255, 255];
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.translate(width * 0.5, height * 0.44);
  context.scale(1, 1.32);
  const gradient = context.createRadialGradient(0, 0, unit * 0.045, 0, 0, unit * 0.55);
  gradient.addColorStop(0, rgba(maskColor, centerRetention));
  gradient.addColorStop(0.22, rgba(maskColor, centerRetention + 0.02));
  gradient.addColorStop(0.48, rgba(maskColor, 0.24));
  gradient.addColorStop(0.72, rgba(maskColor, 0.68));
  gradient.addColorStop(1, rgba(maskColor, 1));
  context.fillStyle = gradient;
  context.fillRect(-width, -height, width * 2, height * 2);
  context.restore();
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
  const layout = Math.floor(randomUnit(seed, 91_003) * 5);
  context.save();
  for (let index = 0; index < count; index += 1) {
    const offset = index * 7;
    const speed = 0.014 + randomUnit(seed, offset + 2) * 0.055;
    const phase = (randomUnit(seed, offset + 3) + time * speed) % 1;
    const startX = randomUnit(seed, offset + 1);
    const startY = randomUnit(seed, offset + 4);
    let x = startX * width;
    let y = phase * height;
    let rotation = 0;
    if (layout === 0) {
      const right = randomUnit(seed, offset) > 0.5;
      const edge = randomUnit(seed, offset + 1) * width * 0.24;
      x = right ? width - edge : edge;
      y = phase * height;
      rotation = right ? -0.16 : 0.16;
    } else if (layout === 1) {
      x = (startX + Math.sin(time * 0.17 + index) * 0.045) * width;
      y = height * (1.06 - phase * 1.12);
      rotation = -0.08 + randomUnit(seed, offset + 5) * 0.16;
    } else if (layout === 2) {
      x = ((startX + phase * (0.34 + randomUnit(seed, offset + 5) * 0.42)) % 1.08 - 0.04) * width;
      y = ((startY + phase) % 1.08 - 0.04) * height;
      rotation = -0.48;
    } else if (layout === 3) {
      const angle = randomUnit(seed, offset + 5) * Math.PI * 2 + time * (0.08 + speed * 1.4);
      const radiusX = width * (0.16 + randomUnit(seed, offset + 6) * 0.39);
      const radiusY = height * (0.12 + randomUnit(seed, offset + 1) * 0.34);
      x = width * 0.5 + Math.cos(angle) * radiusX;
      y = height * 0.5 + Math.sin(angle) * radiusY;
      rotation = angle + Math.PI / 2;
    } else {
      x = ((startX + phase) % 1.08 - 0.04) * width;
      y = startY * height;
      rotation = Math.PI / 2;
    }
    const size = Math.max(0.8, Math.min(width, height) * (0.0014 + randomUnit(seed, offset + 6) * 0.004));
    const colorChoice = index % 7 === 0 ? highlight : index % 2 === 0 ? primary : secondary;
    const shimmer = 0.35 + 0.65 * Math.abs(Math.sin(time * (0.55 + speed * 8) + index));
    context.fillStyle = rgba(colorChoice, intensity * (0.32 + shimmer * 0.58));
    context.shadowColor = rgba(colorChoice, intensity * 0.8);
    context.shadowBlur = size * 4;
    if (index % 5 === 0) {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.fillRect(-size * 0.25, -size * (1.25 + shimmer * 2), size * 0.5, size * (2.5 + shimmer * 4));
      context.restore();
    }
    else {
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function drawLightRibbons(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  music: RadioVisualMusicSignal,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const vertical = randomUnit(seed, 24_001) > 0.58;
  const count = 3 + Math.floor(randomUnit(seed, 24_002) * 4);
  context.save();
  context.lineCap = "round";
  for (let ribbon = 0; ribbon < count; ribbon += 1) {
    const color = ribbon % 4 === 0 ? highlight : ribbon % 2 ? secondary : primary;
    const phase = time * (0.12 + randomUnit(seed, 24_100 + ribbon) * 0.2) + randomUnit(seed, 24_200 + ribbon) * Math.PI * 2;
    const drift = Math.sin(phase) * (vertical ? width : height) * (0.035 + randomUnit(seed, 24_300 + ribbon) * 0.065);
    const base = 0.12 + randomUnit(seed, 24_400 + ribbon) * 0.76;
    const widthScale = Math.min(width, height) * (0.004 + randomUnit(seed, 24_500 + ribbon) * 0.012 + music.bass * 0.004);
    const alpha = mix * (0.055 + music.mid * 0.11 + music.accent * 0.045) * (0.62 + randomUnit(seed, 24_600 + ribbon) * 0.38);
    const gradient = vertical
      ? context.createLinearGradient(0, -height * 0.1, 0, height * 1.1)
      : context.createLinearGradient(-width * 0.1, 0, width * 1.1, 0);
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(0.24, rgba(color, alpha * 0.72));
    gradient.addColorStop(0.6, rgba(color, alpha));
    gradient.addColorStop(1, rgba(color, 0));
    context.strokeStyle = gradient;
    context.lineWidth = widthScale;
    context.shadowColor = rgba(color, alpha * 1.6);
    context.shadowBlur = Math.min(width, height) * (0.012 + music.peak * 0.02);
    context.beginPath();
    if (vertical) {
      const x = width * base + drift;
      context.moveTo(x, -height * 0.08);
      context.bezierCurveTo(
        x + Math.sin(phase * 0.73) * width * 0.24,
        height * 0.28,
        x + Math.cos(phase * 0.81) * width * 0.26,
        height * 0.72,
        x + Math.sin(phase * 0.53) * width * 0.12,
        height * 1.08,
      );
    } else {
      const y = height * base + drift;
      context.moveTo(-width * 0.08, y);
      context.bezierCurveTo(
        width * 0.28,
        y + Math.sin(phase * 0.71) * height * 0.16,
        width * 0.72,
        y + Math.cos(phase * 0.83) * height * 0.18,
        width * 1.08,
        y + Math.sin(phase * 0.49) * height * 0.09,
      );
    }
    context.stroke();
  }
  context.restore();
}

function drawPrismaticShards(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  music: RadioVisualMusicSignal,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const count = 7 + Math.floor(randomUnit(seed, 25_001) * 9);
  context.save();
  for (let shard = 0; shard < count; shard += 1) {
    const side = Math.floor(randomUnit(seed, 25_100 + shard) * 4);
    const edge = randomUnit(seed, 25_200 + shard);
    const inset = Math.min(width, height) * (0.02 + randomUnit(seed, 25_300 + shard) * 0.16);
    const x = side === 0 ? inset : side === 1 ? width - inset : edge * width;
    const y = side === 2 ? inset : side === 3 ? height - inset : edge * height;
    const drift = Math.sin(time * (0.16 + randomUnit(seed, 25_400 + shard) * 0.26) + shard) * Math.min(width, height) * 0.035;
    const size = Math.min(width, height) * (0.018 + randomUnit(seed, 25_500 + shard) * 0.068);
    const color = shard % 5 === 0 ? highlight : shard % 2 ? primary : secondary;
    const shimmer = 0.42 + 0.58 * Math.abs(Math.sin(time * (0.38 + randomUnit(seed, 25_600 + shard) * 0.42) + shard));
    context.save();
    context.translate(x + (side < 2 ? 0 : drift), y + (side < 2 ? drift : 0));
    context.rotate(time * (0.025 + randomUnit(seed, 25_700 + shard) * 0.055) * (shard % 2 ? -1 : 1) + randomUnit(seed, 25_800 + shard) * Math.PI * 2);
    context.fillStyle = rgba(color, mix * (0.025 + music.treble * 0.075) * shimmer);
    context.strokeStyle = rgba(color, mix * (0.08 + music.accent * 0.12) * shimmer);
    context.lineWidth = Math.max(1, Math.min(width, height) * 0.0015);
    context.beginPath();
    context.moveTo(-size * 0.72, size * 0.54);
    context.lineTo(size * (0.08 + randomUnit(seed, 25_900 + shard) * 0.44), -size);
    context.lineTo(size * 0.76, size * (0.24 + randomUnit(seed, 26_000 + shard) * 0.58));
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }
  context.restore();
}

function drawSignalConstellation(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  music: RadioVisualMusicSignal,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const count = 8 + Math.floor(randomUnit(seed, 26_101) * 9);
  const points = Array.from({ length: count }, (_, index) => ({
    x: width * (0.08 + randomUnit(seed, 26_200 + index) * 0.84) + Math.sin(time * 0.11 + index) * width * 0.012,
    y: height * (0.1 + randomUnit(seed, 26_300 + index) * 0.8) + Math.cos(time * 0.09 + index * 0.74) * height * 0.01,
  }));
  context.save();
  context.lineWidth = Math.max(0.7, Math.min(width, height) * 0.0012);
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    if (distance > Math.max(width, height) * 0.48) continue;
    const color = index % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, mix * (0.035 + music.mid * 0.075));
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  points.forEach((point, index) => {
    const color = index % 6 === 0 ? highlight : index % 2 ? secondary : primary;
    const radius = Math.max(1, Math.min(width, height) * (0.0018 + randomUnit(seed, 26_400 + index) * 0.0038) * (0.86 + music.peak * 0.5));
    context.fillStyle = rgba(color, mix * (0.2 + music.treble * 0.38));
    context.shadowColor = rgba(color, mix * 0.72);
    context.shadowBlur = radius * (2.5 + music.peak * 5);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function chromaCoreAlpha(mix: number, drive = 0): number {
  return clampVisualValue(mix * (0.46 + drive * 0.24), 0, 0.72);
}

function drawIdleTransmission(
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
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix);
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let bar = 0; bar < 12; bar += 1) {
    const barWidth = Math.max(3, unit * (0.003 + randomUnit(seed, 32_100 + bar) * 0.009));
    const edgeInset = unit * (0.018 + randomUnit(seed, 32_200 + bar) * 0.09);
    const x = bar % 2 === 0 ? edgeInset : width - edgeInset - barWidth;
    const y = height * ((randomUnit(seed, 32_300 + bar) + time * (0.006 + bar * 0.0004)) % 1);
    const barHeight = height * (0.025 + randomUnit(seed, 32_400 + bar) * 0.11);
    context.fillStyle = rgba(bar % 3 === 0 ? secondary : primary, coreAlpha * (0.76 + (bar % 2) * 0.14));
    context.fillRect(x, y, barWidth, barHeight);
  }

  const trackingY = height * ((time * 0.027 + randomUnit(seed, 32_501)) % 1);
  context.fillStyle = rgba(highlight, coreAlpha * 0.86);
  context.fillRect(width * 0.035, trackingY, width * 0.93, Math.max(3, unit * 0.004));
  context.fillStyle = rgba(secondary, coreAlpha * 0.72);
  context.fillRect(width * 0.12, trackingY + unit * 0.011, width * (0.26 + randomUnit(seed, 32_502) * 0.34), Math.max(4, unit * 0.006));

  const rollY = height * ((time * 0.012 + randomUnit(seed, 32_503)) % 1.18 - 0.09);
  const roll = context.createLinearGradient(0, rollY - unit * 0.08, 0, rollY + unit * 0.08);
  roll.addColorStop(0, rgba(primary, 0));
  roll.addColorStop(0.48, rgba(primary, mix * 0.18));
  roll.addColorStop(0.52, rgba(secondary, mix * 0.14));
  roll.addColorStop(1, rgba(secondary, 0));
  context.fillStyle = roll;
  context.fillRect(0, rollY - unit * 0.08, width, unit * 0.16);

  context.strokeStyle = rgba(highlight, coreAlpha * 0.84);
  context.lineWidth = Math.max(3, unit * 0.004);
  const corner = unit * 0.045;
  const inset = unit * 0.028;
  const corners = [
    { x: inset, y: inset, sx: 1, sy: 1 },
    { x: width - inset, y: inset, sx: -1, sy: 1 },
    { x: inset, y: height - inset, sx: 1, sy: -1 },
    { x: width - inset, y: height - inset, sx: -1, sy: -1 },
  ];
  for (const cornerMark of corners) {
    context.beginPath();
    context.moveTo(cornerMark.x + cornerMark.sx * corner, cornerMark.y);
    context.lineTo(cornerMark.x, cornerMark.y);
    context.lineTo(cornerMark.x, cornerMark.y + cornerMark.sy * corner);
    context.stroke();
  }

  for (let fleck = 0; fleck < 14; fleck += 1) {
    const x = width * randomUnit(seed, 32_600 + fleck);
    const y = height * ((randomUnit(seed, 32_700 + fleck) + time * (0.009 + fleck * 0.0003)) % 1);
    const fleckWidth = Math.max(3, unit * (0.003 + randomUnit(seed, 32_800 + fleck) * 0.018));
    const fleckHeight = Math.max(3, unit * (0.003 + randomUnit(seed, 32_900 + fleck) * 0.006));
    const color = fleck % 5 === 0 ? highlight : fleck % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.68 + randomUnit(seed, 33_000 + fleck) * 0.24));
    context.fillRect(x, y, fleckWidth, fleckHeight);
  }
  context.restore();
}

function drawEdgeSpectrum(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let bar = 0; bar < 26; bar += 1) {
    const progress = (bar + 0.5) / 26;
    const bandDrive = bar < 8 ? drives.bass : bar < 18 ? drives.mid : drives.treble;
    const pulse = 0.34 + 0.66 * Math.abs(Math.sin(time * (1.2 + bandDrive * 2.8) + bar * 0.71 + randomUnit(seed, 33_100 + bar) * 3));
    const reach = width * (0.018 + bandDrive * 0.13 * pulse + drives.impact * 0.035);
    const barHeight = Math.max(3, height / 26 * 0.52);
    const y = progress * height - barHeight * 0.5;
    const color = bar % 7 === 0 ? highlight : bar % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.46 + pulse * 0.42));
    context.shadowColor = rgba(color, coreAlpha * (0.42 + drives.impact * 0.32));
    context.shadowBlur = unit * (0.003 + drives.impact * 0.008);
    context.fillRect(0, y, reach, barHeight);
    context.fillRect(width - reach, y, reach, barHeight);
  }
  const scanY = height * ((time * (0.14 + drives.treble * 0.2) + randomUnit(seed, 33_900)) % 1);
  context.fillStyle = rgba(highlight, coreAlpha * (0.32 + drives.impact * 0.34));
  context.fillRect(0, scanY, width * (0.08 + drives.mid * 0.08), Math.max(2, unit * 0.003));
  context.fillRect(width * (0.92 - drives.mid * 0.08), scanY, width * (0.08 + drives.mid * 0.08), Math.max(2, unit * 0.003));
  context.restore();
}

const SIGNAL_GLYPHS = "01アイウエオカキクケコサシスセソZXCVBNM{}[]<>#%";

function drawMatrixRain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const fontSize = Math.max(10, unit * (0.014 + drives.bass * 0.008));
  const columns = Math.max(12, Math.floor(width / (fontSize * 1.35)));
  context.save();
  context.globalCompositeOperation = "source-over";
  context.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let column = 0; column < columns; column += 1) {
    const speed = 0.08 + randomUnit(seed, 34_100 + column) * 0.12 + drives.treble * 0.18;
    const head = ((randomUnit(seed, 34_300 + column) + time * speed) % 1.28) * height - height * 0.14;
    const trail = 4 + Math.floor(randomUnit(seed, 34_500 + column) * 7 + drives.mid * 5);
    const x = (column + 0.5) / columns * width + Math.sin(time * 0.32 + column) * drives.mid * unit * 0.006;
    for (let glyph = 0; glyph < trail; glyph += 1) {
      const glyphIndex = Math.floor(randomUnit(seed + Math.floor(time * 4), column * 37 + glyph) * SIGNAL_GLYPHS.length);
      const y = head - glyph * fontSize * 1.25;
      if (y < -fontSize || y > height + fontSize) continue;
      const fade = 1 - glyph / trail;
      const color = glyph === 0 ? highlight : column % 4 === 0 ? secondary : primary;
      context.fillStyle = rgba(color, coreAlpha * fade * (0.32 + drives.presence * 0.48));
      context.shadowColor = rgba(color, glyph === 0 ? coreAlpha * drives.impact : 0);
      context.shadowBlur = glyph === 0 ? unit * 0.01 : 0;
      context.fillText(SIGNAL_GLYPHS[glyphIndex], x, y);
    }
  }
  context.restore();
}

function drawTapeFeedback(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const centerX = width * (0.48 + Math.sin(time * 0.13) * drives.mid * 0.04);
  const centerY = height * (0.5 + Math.cos(time * 0.11) * drives.mid * 0.025);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let frame = 0; frame < 9; frame += 1) {
    const depth = (frame / 9 + time * (0.055 + drives.bass * 0.05) + drives.impact * 0.06) % 1;
    const frameWidth = width * (0.12 + depth * 0.9);
    const frameHeight = height * (0.1 + depth * 0.82);
    const skew = Math.sin(time * 0.21 + frame * 0.81) * drives.mid * unit * 0.045;
    const color = frame % 4 === 0 ? highlight : frame % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.72 + depth * 0.24));
    context.lineWidth = Math.max(4, unit * (0.005 + depth * 0.012 + drives.bass * 0.004));
    context.beginPath();
    context.moveTo(centerX - frameWidth * 0.5 + skew, centerY - frameHeight * 0.5);
    context.lineTo(centerX + frameWidth * 0.5 + skew * 0.32, centerY - frameHeight * 0.5);
    context.lineTo(centerX + frameWidth * 0.5 - skew, centerY + frameHeight * 0.5);
    context.lineTo(centerX - frameWidth * 0.5 - skew * 0.32, centerY + frameHeight * 0.5);
    context.closePath();
    context.stroke();
  }

  const tearCount = 2 + Math.floor(drives.treble * 4);
  for (let tear = 0; tear < tearCount; tear += 1) {
    const y = height * ((randomUnit(seed, 35_100 + tear) + time * (0.035 + tear * 0.006)) % 1);
    const displacement = width * drives.treble * (0.03 + randomUnit(seed, 35_200 + tear) * 0.11);
    const color = tear % 3 === 0 ? highlight : tear % 2 ? primary : secondary;
    context.fillStyle = rgba(color, coreAlpha * (0.74 + drives.impact * 0.18));
    context.fillRect(width * 0.03 + displacement, y, width * (0.46 + randomUnit(seed, 35_300 + tear) * 0.48) - displacement, Math.max(4, unit * (0.005 + drives.treble * 0.012)));
  }

  for (let block = 0; block < 12; block += 1) {
    const blockWidth = width / 12 * (0.42 + randomUnit(seed, 35_500 + block) * 0.52);
    const blockHeight = unit * (0.008 + randomUnit(seed, 35_600 + block) * 0.025 + drives.bass * 0.018);
    context.fillStyle = rgba(block % 4 === 0 ? highlight : block % 2 ? secondary : primary, coreAlpha * 0.76);
    context.fillRect(block / 12 * width, height - blockHeight, blockWidth, blockHeight);
  }
  context.restore();
}

function drawAsciiTerminal(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const rows = 18;
  const columns = 30;
  const fontSize = Math.max(9, unit * 0.015);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let row = 0; row < rows; row += 1) {
    const direction = row % 2 === 0 ? 1 : -1;
    const activity = 0.22 + drives.mid * 0.48 + drives.impact * 0.2;
    const cursor = Math.floor(((time * (3.2 + drives.treble * 8) * direction + row * 1.7) % columns + columns) % columns);
    const span = 4 + Math.floor(activity * 14 + randomUnit(seed, 36_100 + row) * 5);
    const y = height * (row + 0.5) / rows;
    for (let step = 0; step < span; step += 1) {
      const column = (cursor - direction * step + columns) % columns;
      const x = width * (column + 0.5) / columns;
      const glyphIndex = Math.floor(randomUnit(seed + Math.floor(time * 6), row * 101 + column) * SIGNAL_GLYPHS.length);
      const fade = 1 - step / Math.max(1, span);
      const color = step === 0 ? highlight : row % 3 === 0 ? secondary : primary;
      context.fillStyle = rgba(color, coreAlpha * (0.18 + fade * 0.58));
      context.fillText(SIGNAL_GLYPHS[glyphIndex], x, y);
    }
  }
  for (let tear = 0; tear < 4 + Math.floor(drives.treble * 6); tear += 1) {
    const y = height * ((randomUnit(seed, 37_300 + tear) + time * (0.025 + tear * 0.004)) % 1);
    const fromRight = tear % 2 === 1;
    const reach = width * (0.08 + randomUnit(seed, 37_400 + tear) * 0.24 + drives.impact * 0.12);
    const color = tear % 3 === 0 ? highlight : tear % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.28 + drives.impact * 0.42));
    context.fillRect(fromRight ? width - reach : 0, y, reach, Math.max(2, unit * (0.002 + drives.treble * 0.004)));
  }
  context.restore();
}

function drawOscilloscopeRibbons(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let ribbon = 0; ribbon < 4; ribbon += 1) {
    const baseY = height * (0.18 + ribbon * 0.21);
    const amplitude = height * (0.018 + drives.mid * 0.075 + ribbon * 0.004);
    const thickness = unit * (0.009 + drives.bass * 0.021 + ribbon * 0.002);
    const cycles = 4 + ribbon * 2 + drives.treble * 8;
    const phase = time * (0.95 + ribbon * 0.18) * (ribbon % 2 ? -1 : 1) + randomUnit(seed, 38_100 + ribbon) * Math.PI * 2;
    const color = ribbon === 3 ? highlight : ribbon === 1 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (ribbon === 3 ? 0.82 : 0.94));
    context.beginPath();
    for (let step = 0; step <= 40; step += 1) {
      const progress = step / 40;
      const x = width * (-0.03 + progress * 1.06);
      const wave = Math.sin(progress * Math.PI * cycles + phase) * 0.72
        + Math.sin(progress * Math.PI * (cycles * 2.7) - phase * 0.63) * 0.28;
      const y = baseY + wave * amplitude - thickness * 0.5;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    for (let step = 40; step >= 0; step -= 1) {
      const progress = step / 40;
      const x = width * (-0.03 + progress * 1.06);
      const wave = Math.sin(progress * Math.PI * cycles + phase) * 0.72
        + Math.sin(progress * Math.PI * (cycles * 2.7) - phase * 0.63) * 0.28;
      context.lineTo(x, baseY + wave * amplitude + thickness * 0.5);
    }
    context.closePath();
    context.fill();
  }

  for (let gate = 0; gate < 7; gate += 1) {
    const x = width * (0.08 + gate / 7 * 0.84);
    const gateHeight = height * (0.08 + randomUnit(seed, 38_400 + gate) * 0.26 + drives.mid * 0.08);
    const color = drives.impact > 0.62 && gate % 2 === 0 ? highlight : gate % 3 === 0 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.7 + drives.impact * 0.22));
    context.fillRect(x, height * 0.5 - gateHeight * 0.5, Math.max(4, unit * (0.006 + drives.bass * 0.008)), gateHeight);
  }
  context.restore();
}

function drawLightningSwitchyard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let rail = 0; rail < 3; rail += 1) {
    const y = height * (0.2 + rail * 0.3 + Math.sin(time * 0.12 + rail) * drives.mid * 0.025);
    const color = rail === 1 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * 0.9);
    context.lineWidth = Math.max(7, unit * (0.01 + drives.bass * 0.012));
    context.beginPath();
    context.moveTo(width * 0.04, y);
    context.lineTo(width * (0.26 + rail * 0.06), y);
    context.lineTo(width * (0.34 + rail * 0.08), y + (rail - 1) * unit * 0.09);
    context.lineTo(width * 0.96, y + (rail - 1) * unit * 0.09);
    context.stroke();
  }
  context.restore();

  const current = 0.2 + drives.treble * 0.48 + drives.impact * 0.58;
  drawLightningTree(context, width, height, seed + Math.floor(time * 2.4) * 131, mix * current, primary, secondary, highlight);
  if (drives.impact > 0.58) {
    drawLightningTree(context, width, height, seed + 71_901 + Math.floor(time * 3.2) * 191, mix * drives.impact * 0.72, secondary, primary, highlight);
  }
}

function drawPixelSortStorm(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const tick = Math.floor(time * (5 + drives.treble * 11));
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let slice = 0; slice < 34; slice += 1) {
    const localSeed = seed + tick * 97 + slice * 13;
    const y = height * randomUnit(localSeed, 39_100 + slice);
    const sliceHeight = Math.max(2, unit * (0.002 + randomUnit(localSeed, 39_200 + slice) * 0.014));
    const fromRight = randomUnit(localSeed, 39_300 + slice) > 0.5;
    const pulse = 0.32 + drives.treble * 0.34 + drives.impact * 0.34;
    const length = width * (0.035 + randomUnit(localSeed, 39_400 + slice) * (0.24 + pulse * 0.36));
    const inset = width * randomUnit(localSeed, 39_500 + slice) * (0.12 + drives.mid * 0.14);
    const color = slice % 9 === 0 ? highlight : slice % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.26 + randomUnit(localSeed, 39_600 + slice) * 0.5));
    context.fillRect(fromRight ? width - inset - length : inset, y, length, sliceHeight);
  }
  for (let column = 0; column < 8; column += 1) {
    const x = width * randomUnit(seed, 39_800 + column);
    const speed = 0.04 + randomUnit(seed, 39_900 + column) * 0.09 + drives.bass * 0.08;
    const y = height * ((randomUnit(seed, 40_000 + column) + time * speed) % 1);
    const color = column % 3 === 0 ? highlight : column % 2 ? primary : secondary;
    context.fillStyle = rgba(color, coreAlpha * (0.2 + drives.bass * 0.46));
    context.fillRect(x, y, Math.max(2, unit * 0.004), unit * (0.035 + drives.bass * 0.1));
  }
  context.restore();
}

function drawLaserLattice(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "square";
  for (let beam = 0; beam < 9; beam += 1) {
    const direction = beam % 2 === 0 ? 1 : -1;
    const travel = ((time * (0.045 + drives.treble * 0.11) * direction + randomUnit(seed, 41_100 + beam)) % 1.4 + 1.4) % 1.4;
    const startY = height * (travel - 0.2);
    const slope = height * (0.22 + randomUnit(seed, 41_200 + beam) * 0.42) * direction;
    const color = beam % 5 === 0 ? highlight : beam % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.24 + drives.mid * 0.42 + drives.impact * 0.18));
    context.shadowColor = rgba(color, coreAlpha * (0.34 + drives.impact * 0.42));
    context.shadowBlur = unit * (0.004 + drives.impact * 0.01);
    context.lineWidth = Math.max(1.5, unit * (0.002 + drives.bass * 0.0035));
    context.beginPath();
    context.moveTo(-width * 0.08, startY - slope * 0.5);
    context.lineTo(width * 1.08, startY + slope * 0.5);
    context.stroke();
  }
  for (let pulse = 0; pulse < 6; pulse += 1) {
    const x = width * ((time * (0.08 + drives.mid * 0.1) + randomUnit(seed, 41_500 + pulse)) % 1);
    const y = height * randomUnit(seed, 41_600 + pulse);
    const color = pulse % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.22 + drives.impact * 0.5));
    context.fillRect(x, y, unit * (0.018 + drives.bass * 0.035), Math.max(2, unit * 0.003));
  }
  context.restore();
}

function drawParticlePressure(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  drawParticleField(
    context,
    width,
    height,
    time * (1.1 + drives.treble * 1.8),
    mix * (0.34 + drives.presence * 0.7),
    seed + Math.floor(time * (0.8 + drives.impact * 2.4)) * 17,
    primary,
    secondary,
    highlight,
    1.25 + drives.mid * 1.35,
  );
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const squeeze = width * (0.025 + drives.bass * 0.13 + drives.impact * 0.04);
  context.save();
  for (let rail = 0; rail < 7; rail += 1) {
    const y = height * (rail + 0.5) / 7 + Math.sin(time * 0.8 + rail) * unit * drives.mid * 0.012;
    const color = rail % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.2 + drives.impact * 0.34));
    context.fillRect(0, y, squeeze, Math.max(2, unit * 0.003));
    context.fillRect(width - squeeze, y, squeeze, Math.max(2, unit * 0.003));
  }
  context.restore();
}

function drawSeededMusicScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  music: RadioVisualMusicSignal,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const drives = radioVisualAudioDrives(music);
  const scene = radioVisualMusicScene(seed);
  if (scene === "edge_spectrum") drawEdgeSpectrum(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "oscilloscope_ribbons") drawOscilloscopeRibbons(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "tape_feedback") drawTapeFeedback(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "matrix_rain") drawMatrixRain(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "ascii_terminal") drawAsciiTerminal(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "pixel_sort_storm") drawPixelSortStorm(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "lightning_switchyard") drawLightningSwitchyard(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "laser_lattice") drawLaserLattice(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "particle_pressure") drawParticlePressure(context, width, height, time, mix, drives, primary, secondary, highlight, seed);
  if (scene === "signal_constellation") drawSignalConstellation(context, width, height, time, mix, music, primary, secondary, highlight, seed);
}

function drawQueueLanes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  primary: Rgb,
  secondary: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix);
  context.save();
  context.lineCap = "square";
  for (let lane = 0; lane < 6; lane += 1) {
    const inset = unit * (0.018 + lane * 0.016);
    const color = lane % 2 ? secondary : primary;
    const dash = unit * (0.018 + randomUnit(seed, 7_100 + lane) * 0.03);
    context.strokeStyle = rgba(color, coreAlpha * (0.28 + (lane % 3) * 0.1));
    context.lineWidth = Math.max(2, unit * (0.0025 + lane * 0.0007));
    context.setLineDash([dash, dash * 0.72]);
    context.lineDashOffset = time * (lane % 2 ? -8 - lane : 7 + lane);
    context.beginPath();
    context.moveTo(inset, 0);
    context.lineTo(inset, height);
    context.moveTo(width - inset, 0);
    context.lineTo(width - inset, height);
    context.stroke();
  }
  context.setLineDash([]);
  for (let packet = 0; packet < 12; packet += 1) {
    const progress = (randomUnit(seed, 7_500 + packet) + time * (0.032 + packet * 0.0011)) % 1;
    const fromRight = packet % 2 === 1;
    const edgeX = unit * (0.025 + (packet % 5) * 0.014);
    const x = fromRight ? width - edgeX : edgeX;
    const y = height * progress;
    const packetWidth = unit * (0.015 + randomUnit(seed, 7_700 + packet) * 0.035);
    const packetHeight = Math.max(3, unit * (0.004 + randomUnit(seed, 7_900 + packet) * 0.006));
    const color = packet % 4 === 0 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.38 + randomUnit(seed, 8_100 + packet) * 0.36));
    context.fillRect(fromRight ? x - packetWidth : x, y, packetWidth, packetHeight);
  }
  context.restore();
}

function drawIntakeAperture(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  primary: Rgb,
  secondary: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix);
  const pulse = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.72));
  const drives: RadioVisualAudioDrives = {
    presence: 0.34 + pulse * 0.22,
    bass: 0.2 + pulse * 0.16,
    mid: 0.3 + pulse * 0.2,
    treble: 0.38 + pulse * 0.24,
    impact: pulse * 0.34,
  };
  drawMatrixRain(context, width, height, time * 1.45, mix * 0.72, drives, primary, secondary, secondary, seed + 9_901);
  context.save();
  const sweepY = height * ((time * 0.12 + randomUnit(seed, 9_102)) % 1);
  const sweep = context.createLinearGradient(0, sweepY - unit * 0.08, 0, sweepY + unit * 0.08);
  sweep.addColorStop(0, rgba(primary, 0));
  sweep.addColorStop(0.48, rgba(primary, coreAlpha * 0.24));
  sweep.addColorStop(0.52, rgba(secondary, coreAlpha * 0.3));
  sweep.addColorStop(1, rgba(secondary, 0));
  context.fillStyle = sweep;
  context.fillRect(0, sweepY - unit * 0.08, width, unit * 0.16);
  for (let gate = 0; gate < 9; gate += 1) {
    const y = height * (gate + 0.5) / 9;
    const reach = width * (0.06 + pulse * 0.08 + randomUnit(seed, 9_300 + gate) * 0.1);
    const color = gate % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.32 + pulse * 0.28));
    context.fillRect(0, y, reach, Math.max(3, unit * 0.004));
    context.fillRect(width - reach, y, reach, Math.max(3, unit * 0.004));
  }
  context.restore();
}

function drawSponsorCurtain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  primary: Rgb,
  secondary: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix);
  context.save();
  const stripHeight = height * (0.055 + mix * 0.045);
  const offset = (time * (12 + mix * 18) + randomUnit(seed, 10_101) * unit) % (unit * 0.1);
  context.fillStyle = rgba(primary, coreAlpha * 0.2);
  context.fillRect(0, 0, width, stripHeight);
  context.fillRect(0, height - stripHeight, width, stripHeight);
  for (let sprocket = -1; sprocket < 14; sprocket += 1) {
    const x = sprocket * unit * 0.1 + offset;
    const holeWidth = unit * 0.038;
    const holeHeight = stripHeight * 0.38;
    const color = sprocket % 3 === 0 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.42 + (sprocket % 2) * 0.16));
    context.fillRect(x, stripHeight * 0.25, holeWidth, holeHeight);
    context.fillRect(x, height - stripHeight * 0.63, holeWidth, holeHeight);
  }
  const leaderY = height * ((time * 0.028 + randomUnit(seed, 10_501)) % 1);
  context.fillStyle = rgba(secondary, coreAlpha * 0.34);
  context.fillRect(0, leaderY, width * 0.18, Math.max(3, unit * 0.005));
  context.fillRect(width * 0.82, leaderY, width * 0.18, Math.max(3, unit * 0.005));
  context.restore();
}

function drawFinalConvergence(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  primary: Rgb,
  secondary: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix);
  context.save();
  for (let bracket = 0; bracket < 10; bracket += 1) {
    const y = height * (bracket + 0.5) / 10;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(time * (0.38 + bracket * 0.012) + bracket + randomUnit(seed, 11_200 + bracket)));
    const reach = width * (0.045 + mix * 0.06 + pulse * 0.035);
    const thickness = Math.max(3, unit * (0.003 + pulse * 0.004));
    const color = bracket % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.24 + pulse * 0.34));
    context.fillRect(0, y, reach, thickness);
    context.fillRect(width - reach, y, reach, thickness);
  }
  for (let marker = 0; marker < 4; marker += 1) {
    const x = width * (marker % 2 ? 0.91 : 0.09);
    const y = height * (marker < 2 ? 0.12 : 0.88);
    context.strokeStyle = rgba(marker % 2 ? secondary : primary, coreAlpha * 0.5);
    context.lineWidth = Math.max(2, unit * 0.004);
    context.strokeRect(x - unit * 0.02, y - unit * 0.02, unit * 0.04, unit * 0.04);
  }
  context.restore();
}

function drawCompletionAfterimage(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  primary: Rgb,
  secondary: Rgb,
): void {
  if (mix < 0.002) return;
  const horizon = height * (0.46 + Math.sin(time * 0.07) * 0.025);
  const gradient = context.createLinearGradient(0, horizon - height * 0.22, 0, horizon + height * 0.22);
  gradient.addColorStop(0, rgba(secondary, 0));
  gradient.addColorStop(0.5, rgba(primary, mix * 0.075));
  gradient.addColorStop(1, rgba(secondary, 0));
  context.fillStyle = gradient;
  context.fillRect(0, horizon - height * 0.22, width, height * 0.44);
}

function drawPressureEdges(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  primary: Rgb,
  secondary: Rgb,
): void {
  if (mix < 0.002) return;
  const pulse = 0.55 + Math.sin(time * (0.62 + mix * 0.3)) * 0.18;
  const edgeWidth = width * (0.12 + mix * 0.08);
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix);
  const left = context.createLinearGradient(0, 0, edgeWidth, 0);
  left.addColorStop(0, rgba(secondary, mix * pulse * 0.16));
  left.addColorStop(1, rgba(primary, 0));
  context.fillStyle = left;
  context.fillRect(0, 0, edgeWidth, height);
  const right = context.createLinearGradient(width, 0, width - edgeWidth, 0);
  right.addColorStop(0, rgba(primary, mix * pulse * 0.14));
  right.addColorStop(1, rgba(secondary, 0));
  context.fillStyle = right;
  context.fillRect(width - edgeWidth, 0, edgeWidth, height);
  for (let bracket = 0; bracket < 7; bracket += 1) {
    const y = height * (bracket + 0.5) / 7 + Math.sin(time * 0.3 + bracket) * unit * 0.008;
    const bracketWidth = unit * (0.018 + mix * 0.026);
    const bracketHeight = Math.max(5, unit * (0.006 + pulse * 0.004));
    context.fillStyle = rgba(bracket % 2 ? secondary : primary, coreAlpha * (0.7 + pulse * 0.2));
    context.fillRect(0, y, bracketWidth, bracketHeight);
    context.fillRect(width - bracketWidth, y, bracketWidth, bracketHeight);
  }
}

function drawAmbientMoment(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  snapshot: RadioVisualsSnapshot,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  shadow: Rgb,
  nowMs: number,
  music: RadioVisualMusicSignal,
): void {
  const moment = radioVisualAmbientMoment(snapshot.visualSeed, nowMs, snapshot.sessionActive);
  if (!moment || moment.envelope < 0.002) return;
  const alpha = moment.envelope * moment.intensity;
  const x = width * (0.16 + randomUnit(moment.seed, 13_101) * 0.68);
  const y = height * (0.18 + randomUnit(moment.seed, 13_102) * 0.64);
  if (moment.type === "violet_bloom") {
    radialLight(context, width, height, x, y, Math.max(width, height) * (0.24 + moment.progress * 0.28), secondary, alpha);
    return;
  }
  if (moment.type === "particle_lift") {
    drawParticleField(context, width, height, time * 1.35, alpha * 1.45, moment.seed, secondary, primary, highlight, 1.55);
    return;
  }
  if (moment.type === "shadow_pass") {
    const travel = ease(moment.progress);
    context.save();
    context.translate(width * (-0.3 + travel * 1.6), height * 0.5);
    context.rotate((randomUnit(moment.seed, 13_103) - 0.5) * 0.7);
    context.filter = `blur(${Math.max(10, Math.min(width, height) * 0.035)}px)`;
    const gradient = context.createLinearGradient(-width * 0.3, 0, width * 0.3, 0);
    gradient.addColorStop(0, rgba(shadow, 0));
    gradient.addColorStop(0.5, rgba(shadow, alpha * 2.2));
    gradient.addColorStop(1, rgba(shadow, 0));
    context.fillStyle = gradient;
    context.fillRect(-width * 0.34, -height, width * 0.68, height * 2);
    context.restore();
    return;
  }
  if (moment.type === "barcode_shimmer") {
    context.save();
    for (let bar = 0; bar < 22; bar += 1) {
      const side = randomUnit(moment.seed, 13_200 + bar) > 0.5;
      const offset = randomUnit(moment.seed, 13_300 + bar) * width * 0.22;
      const barWidth = Math.max(1, width * (0.001 + randomUnit(moment.seed, 13_400 + bar) * 0.006));
      const barHeight = height * (0.06 + randomUnit(moment.seed, 13_500 + bar) * 0.35);
      const top = height * randomUnit(moment.seed, 13_600 + bar);
      context.fillStyle = rgba(bar % 5 === 0 ? highlight : bar % 2 ? primary : secondary, alpha * (0.3 + randomUnit(moment.seed, 13_700 + bar) * 0.7));
      context.fillRect(side ? width - offset : offset, top, barWidth, barHeight);
    }
    context.restore();
    return;
  }
  if (moment.type === "prism_drift") {
    drawPrismaticShards(context, width, height, time * 0.72, alpha * 1.5, music, secondary, primary, highlight, moment.seed);
    return;
  }
  if (moment.type === "ribbon_sweep") {
    drawLightRibbons(context, width, height, time * 0.68, alpha * 1.25, music, primary, secondary, highlight, moment.seed);
    return;
  }
  context.save();
  context.strokeStyle = rgba(randomUnit(moment.seed, 13_104) > 0.5 ? secondary : primary, alpha * 1.35);
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.003);
  for (let ring = 0; ring < 3; ring += 1) {
    const progress = (moment.progress + ring * 0.19) % 1;
    context.globalAlpha = 1 - progress;
    context.beginPath();
    context.ellipse(x, y, width * (0.04 + progress * 0.34), height * (0.03 + progress * 0.23), (randomUnit(moment.seed, 13_105) - 0.5) * 0.6, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawBorderPulse(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  seed: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  count = 4,
): void {
  const unit = Math.min(width, height);
  context.save();
  for (let pulse = 0; pulse < count; pulse += 1) {
    const pulseProgress = clampVisualValue((progress - pulse * 0.07) / Math.max(0.01, 1 - pulse * 0.07));
    const alpha = envelope * (1 - pulseProgress) * (0.24 + randomUnit(seed, 14_300 + pulse) * 0.34);
    const reachX = width * (0.035 + pulseProgress * (0.08 + randomUnit(seed, 14_200 + pulse) * 0.05));
    const reachY = height * (0.025 + pulseProgress * 0.055);
    const color = pulse % 3 === 0 ? highlight : pulse % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha);
    context.lineWidth = Math.max(2, unit * (0.0025 + (count - pulse) * 0.0008));
    context.strokeRect(reachX * 0.28, reachY * 0.28, width - reachX * 0.56, height - reachY * 0.56);
  }
  context.restore();
}

function drawEventFragments(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  progress: number,
  envelope: number,
  seed: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  count: number,
): void {
  const unit = Math.min(width, height);
  context.save();
  for (let fragment = 0; fragment < count; fragment += 1) {
    const side = Math.floor(randomUnit(seed, 15_100 + fragment) * 4);
    const edgePosition = randomUnit(seed, 15_200 + fragment);
    const distance = unit * progress * (0.025 + randomUnit(seed, 15_300 + fragment) * 0.17);
    const curl = Math.sin(time * 0.9 + fragment) * distance * 0.08;
    const originX = side === 0 ? 0 : side === 1 ? width : edgePosition * width;
    const originY = side === 2 ? 0 : side === 3 ? height : edgePosition * height;
    const directionX = side === 0 ? 1 : side === 1 ? -1 : 0;
    const directionY = side === 2 ? 1 : side === 3 ? -1 : 0;
    const x = originX + directionX * distance + directionY * curl;
    const y = originY + directionY * distance - directionX * curl;
    const angle = Math.atan2(directionY, directionX) + progress * (fragment % 2 ? 0.8 : -0.8);
    const size = Math.max(1, unit * (0.0015 + randomUnit(seed, 15_400 + fragment) * 0.005));
    const color = fragment % 7 === 0 ? highlight : fragment % 2 ? primary : secondary;
    context.fillStyle = rgba(color, envelope * (0.24 + randomUnit(seed, 15_500 + fragment) * 0.62));
    context.save();
    context.translate(x, y);
    context.rotate(angle + progress * (fragment % 2 ? 2.5 : -2.5));
    if (fragment % 3 === 0) context.fillRect(-size * 0.25, -size * 2.5, size * 0.5, size * 5);
    else context.fillRect(-size, -size, size * 2, size * 2);
    context.restore();
  }
  context.restore();
}

function drawCrtIgnition(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const unit = Math.min(width, height);
  const opening = ease(clampVisualValue(progress * 1.35));
  const coreAlpha = chromaCoreAlpha(envelope);
  context.save();
  context.globalCompositeOperation = "source-over";
  const railReach = width * opening * 0.2;
  const railHeight = Math.max(4, unit * (0.005 + (1 - opening) * 0.006));
  for (let rail = 0; rail < 7; rail += 1) {
    const y = height * (rail + 0.5) / 7;
    const jitter = width * randomUnit(seed, 40_200 + rail) * 0.025;
    const color = rail === 3 ? highlight : rail % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.3 + (rail % 3) * 0.1));
    context.fillRect(0, y, railReach + jitter, railHeight);
    context.fillRect(width - railReach - jitter, y, railReach + jitter, railHeight);
  }
  context.strokeStyle = rgba(highlight, coreAlpha * 0.5);
  context.lineWidth = Math.max(3, unit * 0.004);
  context.strokeRect(unit * 0.025, unit * 0.025, width - unit * 0.05, height - unit * 0.05);
  context.restore();
}

function drawTapeSplice(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const unit = Math.min(width, height);
  const displacement = Math.sin(progress * Math.PI) * width * 0.18;
  const coreAlpha = chromaCoreAlpha(envelope);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let frame = 0; frame < 5; frame += 1) {
    const insetX = width * (0.04 + frame * 0.055);
    const insetY = height * (0.05 + frame * 0.045);
    const offset = (frame % 2 ? -1 : 1) * displacement * (0.35 + frame * 0.12);
    const color = frame === 0 ? highlight : frame % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.72 + frame * 0.05));
    context.lineWidth = Math.max(4, unit * (0.005 + (5 - frame) * 0.0015));
    context.strokeRect(insetX + offset, insetY, width - insetX * 2, height - insetY * 2);
  }
  const spliceY = height * (0.2 + randomUnit(seed, 40_601) * 0.6);
  context.fillStyle = rgba(highlight, coreAlpha * 0.92);
  context.fillRect(displacement - width * 0.1, spliceY, width * 1.2, Math.max(6, unit * 0.012));
  context.fillStyle = rgba(secondary, coreAlpha * 0.8);
  context.fillRect(-displacement - width * 0.1, spliceY + unit * 0.025, width * 1.2, Math.max(4, unit * 0.007));
  context.restore();
}

function drawPrioritySignalPacket(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const unit = Math.min(width, height);
  const direction = randomUnit(seed, 40_701) > 0.5 ? 1 : -1;
  const travel = ease(progress);
  const x = direction > 0 ? width * (-0.12 + travel * 1.24) : width * (1.12 - travel * 1.24);
  const upperRail = randomUnit(seed, 40_702) > 0.5;
  const y = height * (upperRail ? 0.08 + randomUnit(seed, 40_703) * 0.09 : 0.83 + randomUnit(seed, 40_703) * 0.09);
  const coreAlpha = chromaCoreAlpha(envelope);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let trail = 0; trail < 7; trail += 1) {
    const trailX = x - direction * trail * unit * 0.035;
    const packetWidth = unit * (0.026 + (7 - trail) * 0.006);
    const packetHeight = unit * (0.009 + (7 - trail) * 0.002);
    context.fillStyle = rgba(trail === 0 ? highlight : secondary, coreAlpha * (0.64 + (7 - trail) * 0.045));
    context.fillRect(trailX - packetWidth * 0.5, y - packetHeight * 0.5, packetWidth, packetHeight);
  }
  const gateX = direction > 0 ? width * 0.82 : width * 0.18;
  context.strokeStyle = rgba(secondary, coreAlpha * 0.94);
  context.lineWidth = Math.max(5, unit * 0.008);
  context.beginPath();
  context.moveTo(gateX - direction * unit * 0.06, y - unit * 0.12);
  context.lineTo(gateX, y - unit * 0.12);
  context.lineTo(gateX, y + unit * 0.12);
  context.lineTo(gateX - direction * unit * 0.06, y + unit * 0.12);
  context.stroke();
  context.restore();
}

function drawIndustrialOverride(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(envelope);
  const emergency: Rgb = [255, 0, 170];
  const shutter = Math.sin(progress * Math.PI);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let panel = 0; panel < 8; panel += 1) {
    const panelWidth = width / 8;
    const panelHeight = height * shutter * (0.08 + (panel % 3) * 0.035);
    const color = panel % 4 === 0 ? highlight : panel % 2 ? emergency : secondary;
    context.fillStyle = rgba(color, coreAlpha * (0.76 + (panel % 3) * 0.08));
    context.fillRect(panel * panelWidth, 0, panelWidth * (0.58 + randomUnit(seed, 40_900 + panel) * 0.34), panelHeight);
    context.fillRect(panel * panelWidth + panelWidth * 0.18, height - panelHeight, panelWidth * (0.48 + randomUnit(seed, 41_000 + panel) * 0.38), panelHeight);
  }
  const scanY = height * ease(progress);
  context.fillStyle = rgba(highlight, coreAlpha);
  context.fillRect(0, scanY, width, Math.max(7, unit * 0.014));
  for (let bar = 0; bar < 18; bar += 1) {
    const barWidth = unit * (0.004 + randomUnit(seed, 41_200 + bar) * 0.018);
    const right = bar % 2 === 1;
    const x = right
      ? width * (0.86 + randomUnit(seed, 41_300 + bar) * 0.13)
      : width * randomUnit(seed, 41_300 + bar) * 0.14;
    context.fillStyle = rgba(bar % 5 === 0 ? highlight : bar % 2 ? emergency : secondary, coreAlpha * 0.86);
    context.fillRect(x, height * 0.12, barWidth, height * 0.76);
  }
  context.restore();
}

function drawAutomaticEvent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  event: RadioVisualEvent,
  nowMs: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  shadow: Rgb,
  motionScale: number,
): void {
  const progress = radioVisualEventProgress(event, nowMs);
  if (progress === null) return;
  const envelope = radioVisualEventEnvelope(event, nowMs) * (motionScale < 0.5 ? 0.42 : 1);
  if (envelope < 0.002) return;
  const seed = event.seed;

  if (event.type === "show_started") {
    drawCrtIgnition(context, width, height, progress, envelope, primary, secondary, highlight, seed);
    return;
  }
  if (event.type === "show_complete") {
    context.fillStyle = rgba(shadow, envelope * 0.22);
    context.fillRect(0, 0, width, height);
    drawCrtIgnition(context, width, height, 1 - progress, envelope * 0.7, secondary, primary, highlight, seed);
    return;
  }
  if (event.type === "track_started") {
    drawTapeSplice(context, width, height, progress, envelope, primary, secondary, highlight, seed);
    return;
  }
  if (event.type === "stage_shift") {
    drawIndustrialOverride(context, width, height, progress, envelope * 0.72, secondary, highlight, seed);
    return;
  }
  if (event.type === "track_skipped") {
    const direction = randomUnit(seed, 16_301) > 0.5 ? 1 : -1;
    const edgeTravel = progress * width * 0.16;
    const x = direction > 0 ? edgeTravel : width - edgeTravel;
    context.save();
    for (let tear = 0; tear < 9; tear += 1) {
      const y = height * randomUnit(seed, 16_400 + tear);
      const reach = width * (0.025 + randomUnit(seed, 16_500 + tear) * 0.1);
      const color = tear % 3 === 0 ? highlight : tear % 2 ? secondary : primary;
      context.fillStyle = rgba(color, envelope * (0.22 + randomUnit(seed, 16_600 + tear) * 0.42));
      context.fillRect(direction > 0 ? x : x - reach, y, reach, Math.max(2, Math.min(width, height) * (0.002 + randomUnit(seed, 16_700 + tear) * 0.006)));
    }
    context.restore();
    drawEventFragments(context, width, height, time * 1.4, progress, envelope * 0.72, seed, primary, secondary, highlight, 24);
    return;
  }
  if (event.type === "priority_sent") {
    drawPrioritySignalPacket(context, width, height, progress, envelope, secondary, highlight, seed);
    return;
  }
  if (event.type === "priority_confirmed") {
    drawIndustrialOverride(context, width, height, progress, envelope, secondary, highlight, seed);
    return;
  }
  if (event.type === "wheel_gained" || event.type === "wheel_launched" || event.type === "wheel_spinning") {
    const strength = event.type === "wheel_gained" ? 0.82 : event.type === "wheel_spinning" ? 0.68 : 0.58;
    drawWheelScene(
      context,
      width,
      height,
      time * (event.type === "wheel_spinning" ? 2.2 : 1.3),
      envelope * strength,
      primary,
      secondary,
      highlight,
      seed,
      undefined,
      event.type === "wheel_spinning" ? "wheel_spinning" : "wheel_ready",
    );
    if (event.type === "wheel_gained") drawEventFragments(context, width, height, time, progress, envelope, seed, primary, secondary, highlight, 38);
    return;
  }
  if (event.type === "intake_opened" || event.type === "intake_closed") {
    const apertureProgress = event.type === "intake_opened" ? progress : 1 - progress;
    drawIntakeAperture(context, width, height, time * 1.8, envelope * (0.5 + apertureProgress * 0.5), primary, secondary, seed);
    drawBorderPulse(context, width, height, apertureProgress, envelope * 0.42, seed, primary, secondary, highlight, 3);
    return;
  }
  if (event.type === "sponsor_due" || event.type === "sponsor_started" || event.type === "sponsor_completed") {
    drawSponsorCurtain(context, width, height, time * 1.5, envelope * (event.type === "sponsor_started" ? 1 : 0.62), secondary, primary, seed);
    if (event.type === "sponsor_completed") drawTapeSplice(context, width, height, progress, envelope * 0.58, secondary, primary, highlight, seed);
  }
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
  const unit = Math.min(width, height);
  const reach = width * (0.03 + progress * 0.14);
  context.save();
  for (let rail = 0; rail < 8; rail += 1) {
    const y = height * (rail + 0.5) / 8;
    const color = rail % 4 === 0 ? highlight : rail % 2 ? secondary : primary;
    context.fillStyle = rgba(color, envelope * (0.18 + (rail % 3) * 0.08));
    context.fillRect(0, y, reach, Math.max(2, unit * (0.003 + envelope * 0.003)));
    context.fillRect(width - reach, y, reach, Math.max(2, unit * (0.003 + envelope * 0.003)));
  }
  context.restore();
}

function wheelAngularVelocityTarget(
  sceneMode: RadioVisualsSnapshot["sceneMode"],
  drives: RadioVisualAudioDrives,
): number {
  if (sceneMode === "wheel_ready") return 0.28 + drives.treble * 0.16;
  if (sceneMode === "wheel_reencrypting") return -(1.7 + drives.treble * 1.1 + drives.impact * 0.35);
  if (sceneMode === "wheel_result" || sceneMode === "wheel_confirmed") return 0.08;
  return 0.95 + drives.treble * 1.8 + drives.impact * 0.5;
}

function drawWheelScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  rotationPhase: number,
  mix: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
  music?: RadioVisualMusicSignal,
  sceneMode: RadioVisualsSnapshot["sceneMode"] = "wheel_spinning",
): void {
  if (mix < 0.002) return;
  const drives = music ? radioVisualAudioDrives(music) : { presence: 0.2, bass: 0.2, mid: 0.2, treble: 0.2, impact: 0.1 };
  const releaseMode = sceneMode === "wheel_result" || sceneMode === "wheel_confirmed";
  const visualImpact = Math.max(drives.impact, releaseMode ? 0.68 : 0);
  const unit = Math.min(width, height);
  const radius = unit * (0.355 + visualImpact * 0.01);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  radialLight(
    context,
    width,
    height,
    width * 0.5,
    height * RADIO_VISUALS_WHEEL_CENTER_Y_RATIO,
    radius * 0.92,
    secondary,
    mix * (0.018 + drives.presence * 0.028 + visualImpact * 0.018),
  );
  context.save();
  context.translate(width * 0.5, height * RADIO_VISUALS_WHEEL_CENTER_Y_RATIO);
  context.rotate(rotationPhase);
  context.globalCompositeOperation = "source-over";
  for (let ring = 0; ring < 4; ring += 1) {
    const dashVariation = 0.82 + randomUnit(seed, 28_100 + ring) * 0.42;
    context.setLineDash([radius * (0.08 + ring * 0.022) * dashVariation, radius * (0.045 + ring * 0.014)]);
    context.lineDashOffset = rotationPhase * (18 + ring * 11 + drives.treble * 14) * (ring % 2 ? -1 : 1);
    context.lineWidth = Math.max(3, unit * (0.0038 + ring * 0.0012 + drives.bass * 0.0025));
    context.strokeStyle = rgba(ring === 0 ? primary : ring === 1 ? secondary : ring === 2 ? highlight : primary, coreAlpha * (0.48 + ring * 0.08));
    context.shadowColor = rgba(ring === 1 ? secondary : primary, coreAlpha * (0.22 + visualImpact * 0.32));
    context.shadowBlur = unit * (0.004 + visualImpact * 0.01);
    context.beginPath();
    context.arc(0, 0, radius * (0.96 + ring * 0.055), 0, Math.PI * 2);
    context.stroke();
  }

  context.setLineDash([]);
  for (let arc = 0; arc < 18; arc += 1) {
    const angle = arc / 18 * Math.PI * 2 - rotationPhase * (arc % 2 ? 0.12 : -0.08);
    const orbit = radius * (1.01 + randomUnit(seed, 28_300 + arc) * 0.18);
    const span = 0.035 + drives.treble * 0.045 + randomUnit(seed, 28_500 + arc) * 0.08;
    const color = arc % 6 === 0 ? highlight : arc % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.3 + drives.impact * 0.26));
    context.lineWidth = Math.max(2, unit * (0.0025 + drives.mid * 0.003));
    context.beginPath();
    context.arc(0, 0, orbit, angle - span, angle + span);
    context.stroke();
  }

  for (let fragment = 0; fragment < 28; fragment += 1) {
    const phase = (randomUnit(seed, 28_800 + fragment) + Math.abs(rotationPhase) * (0.018 + drives.treble * 0.036 + fragment * 0.0004)) % 1;
    const angle = randomUnit(seed, 28_900 + fragment) * Math.PI * 2 - rotationPhase * (fragment % 2 ? 0.18 : -0.12);
    const orbit = radius * (1.01 + phase * 0.3);
    const fragmentWidth = unit * (0.004 + randomUnit(seed, 29_000 + fragment) * 0.014 + drives.bass * 0.005);
    const fragmentHeight = Math.max(2, unit * (0.0025 + drives.treble * 0.0035));
    const color = fragment % 7 === 0 ? highlight : fragment % 2 ? secondary : primary;
    context.save();
    context.translate(Math.cos(angle) * orbit, Math.sin(angle) * orbit);
    context.rotate(angle + Math.PI / 2);
    context.fillStyle = rgba(color, coreAlpha * (0.28 + (1 - phase) * 0.34));
    context.fillRect(-fragmentWidth * 0.5, -fragmentHeight * 0.5, fragmentWidth, fragmentHeight);
    context.restore();
  }
  context.restore();

  if (visualImpact > 0.34) {
    context.save();
    context.strokeStyle = rgba(highlight, coreAlpha * visualImpact * 0.68);
    context.lineWidth = Math.max(3, unit * (0.004 + visualImpact * 0.006));
    context.beginPath();
    context.ellipse(width * 0.5, height * RADIO_VISUALS_WHEEL_CENTER_Y_RATIO, radius * (1.16 + visualImpact * 0.08), radius * (1.16 + visualImpact * 0.08), 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
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
  const pulse = 0.62 + Math.sin(time * (1.9 + randomUnit(seed, 18_001) * 1.25)) * 0.2 + Math.sin(time * 1.1) * 0.1;
  const beamCount = 4 + Math.floor(randomUnit(seed, 18_002) * 6);
  for (let beam = 0; beam < beamCount; beam += 1) {
    const color = beam % 3 === 0 ? highlight : beam % 2 === 0 ? primary : secondary;
    const rate = 0.28 + randomUnit(seed, 18_100 + beam) * 0.48;
    const phase = randomUnit(seed, 18_200 + beam) * Math.PI * 2;
    const sweep = Math.sin(time * rate + phase);
    const origin = width * (0.04 + randomUnit(seed, 18_300 + beam) * 0.92);
    const beamWidth = width * (0.08 + randomUnit(seed, 18_400 + beam) * 0.12);
    drawBeam(context, width, height, origin, sweep * (0.28 + randomUnit(seed, 18_500 + beam) * 0.36), beamWidth, color, envelope * pulse * (0.2 + randomUnit(seed, 18_600 + beam) * 0.17));
  }
  const orbitX = 0.22 + randomUnit(seed, 18_003) * 0.28;
  const orbitY = 0.14 + randomUnit(seed, 18_004) * 0.2;
  radialLight(context, width, height, width * (0.5 + Math.sin(time * 0.55 + seed) * orbitX), height * (0.45 + Math.cos(time * 0.43 + seed * 0.001) * orbitY), Math.max(width, height) * (0.38 + randomUnit(seed, 18_005) * 0.2), progress < 0.5 ? secondary : primary, envelope * pulse * 0.34);
  drawParticleField(context, width, height, time * 2.2, envelope * 0.92, seed + 22_019, primary, secondary, highlight, 2.3);
}

function drawShadowCue(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  envelope: number,
  shadow: Rgb,
  seed: number,
): void {
  const direction = randomUnit(seed, 19_001) > 0.5 ? 1 : -1;
  const travel = direction > 0 ? ease(progress) : 1 - ease(progress);
  const bandCount = 1 + Math.floor(randomUnit(seed, 19_002) * 3);
  for (let band = 0; band < bandCount; band += 1) {
    const widthScale = 0.46 + randomUnit(seed, 19_100 + band) * 0.42;
    const yOffset = (randomUnit(seed, 19_200 + band) - 0.5) * height * 0.42;
    context.save();
    context.translate(width * (-0.42 + travel * 1.84), height * 0.5 + yOffset);
    context.rotate((randomUnit(seed, 19_300 + band) - 0.5) * 0.88);
    context.filter = `blur(${Math.max(8, Math.min(width, height) * (0.018 + randomUnit(seed, 19_400 + band) * 0.025))}px)`;
    const gradient = context.createLinearGradient(-width * widthScale / 2, 0, width * widthScale / 2, 0);
    gradient.addColorStop(0, rgba(shadow, 0));
    gradient.addColorStop(0.38, rgba(shadow, envelope * (0.34 + randomUnit(seed, 19_500 + band) * 0.38)));
    gradient.addColorStop(0.62, rgba(shadow, envelope * (0.34 + randomUnit(seed, 19_500 + band) * 0.38)));
    gradient.addColorStop(1, rgba(shadow, 0));
    context.fillStyle = gradient;
    context.fillRect(-width * widthScale / 2, -height, width * widthScale, height * 2);
    context.restore();
  }
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
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(envelope);
  context.save();
  for (let index = 0; index < 34; index += 1) {
    const fromRight = randomUnit(frameSeed, index * 4) > 0.5;
    const x = fromRight ? width * (0.68 + randomUnit(frameSeed, index * 4 + 1) * 0.34) : width * randomUnit(frameSeed, index * 4 + 1) * 0.32;
    const y = height * randomUnit(frameSeed, index * 4 + 2);
    const fragmentWidth = width * (0.01 + randomUnit(frameSeed, index * 4 + 3) * 0.1);
    const color = index % 9 === 0 ? [255, 0, 170] as Rgb : index % 3 === 0 ? highlight : index % 2 === 0 ? primary : secondary;
    context.fillStyle = rgba(color, coreAlpha * (0.72 + randomUnit(frameSeed, index + 900) * 0.24));
    context.fillRect(x, y, fragmentWidth, Math.max(3, height * (0.001 + randomUnit(frameSeed, index + 1_200) * 0.006)));
  }
  context.strokeStyle = rgba(progress < 0.5 ? highlight : primary, coreAlpha * 0.88);
  context.lineWidth = Math.max(3, unit * 0.003);
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
  seed: number,
): void {
  context.fillStyle = rgba(shadow, envelope * 0.82);
  context.fillRect(0, 0, width, height);
  const reopening = clampVisualValue((progress - 0.62) / 0.38);
  if (reopening > 0) {
    const reopenX = width * (0.35 + randomUnit(seed, 20_001) * 0.3);
    const reopenY = height * (0.32 + randomUnit(seed, 20_002) * 0.36);
    radialLight(context, width, height, reopenX, reopenY, Math.max(width, height) * reopening, primary, reopening * 0.24);
  }
}

interface LightningPoint {
  x: number;
  y: number;
}

function lightningEndpoints(width: number, height: number, seed: number): [LightningPoint, LightningPoint] {
  const topology = Math.floor(randomUnit(seed, 21_001) * 5);
  if (topology === 0) return [
    { x: width * (0.16 + randomUnit(seed, 21_002) * 0.68), y: -height * 0.04 },
    { x: width * (0.08 + randomUnit(seed, 21_003) * 0.84), y: height * 1.04 },
  ];
  if (topology === 1) return [
    { x: -width * 0.04, y: height * (0.1 + randomUnit(seed, 21_004) * 0.8) },
    { x: width * 1.04, y: height * (0.1 + randomUnit(seed, 21_005) * 0.8) },
  ];
  if (topology === 2) return [
    { x: width * (0.08 + randomUnit(seed, 21_006) * 0.45), y: -height * 0.04 },
    { x: width * 1.04, y: height * (0.48 + randomUnit(seed, 21_007) * 0.46) },
  ];
  if (topology === 3) return [
    { x: -width * 0.04, y: height * (0.08 + randomUnit(seed, 21_008) * 0.44) },
    { x: width * (0.48 + randomUnit(seed, 21_009) * 0.46), y: height * 1.04 },
  ];
  const reverse = randomUnit(seed, 21_010) > 0.5;
  return reverse
    ? [{ x: width * 1.04, y: -height * 0.04 }, { x: -width * 0.04, y: height * 1.04 }]
    : [{ x: -width * 0.04, y: -height * 0.04 }, { x: width * 1.04, y: height * 1.04 }];
}

function lightningMainPath(width: number, height: number, seed: number): LightningPoint[] {
  const [start, end] = lightningEndpoints(width, height, seed);
  const segments = 15 + Math.floor(randomUnit(seed, 21_101) * 8);
  const directionX = end.x - start.x;
  const directionY = end.y - start.y;
  const distance = Math.hypot(directionX, directionY) || 1;
  const perpendicularX = -directionY / distance;
  const perpendicularY = directionX / distance;
  const path: LightningPoint[] = [];
  for (let step = 0; step <= segments; step += 1) {
    const progress = step / segments;
    const body = Math.sin(progress * Math.PI);
    const jag = (randomUnit(seed, 21_200 + step) - 0.5) * Math.min(width, height) * (0.11 + randomUnit(seed, 21_102) * 0.1) * body;
    const bow = Math.sin(progress * Math.PI * (1 + Math.floor(randomUnit(seed, 21_103) * 3))) * Math.min(width, height) * (randomUnit(seed, 21_104) - 0.5) * 0.08;
    path.push({
      x: start.x + directionX * progress + perpendicularX * (jag + bow),
      y: start.y + directionY * progress + perpendicularY * (jag + bow),
    });
  }
  return path;
}

function lightningBranches(path: LightningPoint[], width: number, height: number, seed: number): LightningPoint[][] {
  const count = 3 + Math.floor(randomUnit(seed, 21_301) * 6);
  const branches: LightningPoint[][] = [];
  for (let branch = 0; branch < count; branch += 1) {
    const startIndex = 2 + Math.floor(randomUnit(seed, 21_400 + branch) * Math.max(1, path.length - 5));
    const start = path[startIndex];
    const previous = path[Math.max(0, startIndex - 1)];
    const baseAngle = Math.atan2(start.y - previous.y, start.x - previous.x);
    const side = randomUnit(seed, 21_500 + branch) > 0.5 ? 1 : -1;
    const branchAngle = baseAngle + side * (0.46 + randomUnit(seed, 21_600 + branch) * 0.88);
    const branchLength = Math.min(width, height) * (0.1 + randomUnit(seed, 21_700 + branch) * 0.28);
    const segments = 4 + Math.floor(randomUnit(seed, 21_800 + branch) * 5);
    const points: LightningPoint[] = [start];
    for (let step = 1; step <= segments; step += 1) {
      const progress = step / segments;
      const jitter = (randomUnit(seed, 22_000 + branch * 20 + step) - 0.5) * branchLength * 0.22 * Math.sin(progress * Math.PI);
      points.push({
        x: start.x + Math.cos(branchAngle) * branchLength * progress + Math.cos(branchAngle + Math.PI / 2) * jitter,
        y: start.y + Math.sin(branchAngle) * branchLength * progress + Math.sin(branchAngle + Math.PI / 2) * jitter,
      });
    }
    branches.push(points);
  }
  return branches;
}

function strokeLightningPath(
  context: CanvasRenderingContext2D,
  points: LightningPoint[],
  color: Rgb,
  alpha: number,
  lineWidth: number,
  blur: number,
): void {
  context.save();
  context.strokeStyle = rgba(color, alpha);
  context.shadowColor = rgba(color, alpha);
  context.shadowBlur = blur;
  context.lineWidth = lineWidth;
  context.lineJoin = "miter";
  context.lineCap = "round";
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
  context.restore();
}

function drawLightningTree(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  strength: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
): void {
  if (strength < 0.002) return;
  const path = lightningMainPath(width, height, seed);
  const branches = lightningBranches(path, width, height, seed);
  const unit = Math.min(width, height);
  const channel = randomUnit(seed, 22_401) > 0.5 ? primary : secondary;
  strokeLightningPath(context, path, channel, strength * 0.24, Math.max(4, unit * 0.021), unit * 0.055);
  strokeLightningPath(context, path, channel, strength * 0.74, Math.max(2, unit * 0.008), unit * 0.026);
  strokeLightningPath(context, path, highlight, strength, Math.max(3, unit * 0.0027), unit * 0.008);
  for (let branch = 0; branch < branches.length; branch += 1) {
    const branchStrength = strength * (0.34 + randomUnit(seed, 22_500 + branch) * 0.44);
    strokeLightningPath(context, branches[branch], channel, branchStrength * 0.64, Math.max(1, unit * 0.0045), unit * 0.018);
    strokeLightningPath(context, branches[branch], highlight, branchStrength, Math.max(2.5, unit * 0.0018), unit * 0.006);
  }
  const endpoint = path[path.length - 1];
  radialLight(context, width, height, endpoint.x, endpoint.y, unit * (0.1 + randomUnit(seed, 22_402) * 0.18), channel, strength * 0.54);
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
  const strikeCount = 2 + Math.floor(randomUnit(seed, 22_601) * 4);
  let strike = 0;
  let strongestStrike = 0;
  for (let index = 0; index < strikeCount; index += 1) {
    const center = 0.16 + index / Math.max(1, strikeCount - 1) * 0.62 + (randomUnit(seed, 22_700 + index) - 0.5) * 0.075;
    const widthScale = 0.018 + randomUnit(seed, 22_800 + index) * 0.032;
    const candidate = Math.exp(-Math.pow((progress - center) / widthScale, 2)) * (0.58 + randomUnit(seed, 22_900 + index) * 0.42);
    if (candidate > strike) strongestStrike = index;
    strike = Math.max(strike, candidate);
  }
  const afterglow = envelope * Math.max(0, 1 - progress) * (0.11 + randomUnit(seed, 22_602) * 0.15);
  context.fillStyle = rgba(highlight, strike * 0.16 + afterglow * 0.05);
  context.fillRect(0, 0, width, height);
  drawLightningTree(context, width, height, seed + strongestStrike * 8_191, Math.max(strike, afterglow * 0.42), primary, [124, 58, 237], highlight);
  if (randomUnit(seed, 22_603) > 0.42 && strike > 0.08) {
    drawLightningTree(context, width, height, seed + 61_003 + strongestStrike * 3_571, strike * (0.24 + randomUnit(seed, 22_604) * 0.38), primary, [124, 58, 237], highlight);
  }
  radialLight(context, width, height, width * (0.18 + randomUnit(seed, 22_605) * 0.64), height * randomUnit(seed, 22_606) * 0.22, Math.max(width, height) * 0.72, highlight, afterglow);
}

function visualSignalMemory(snapshot: RadioVisualsSnapshot): VisualSignalMemory {
  return {
    sessionActive: snapshot.sessionActive,
    showStage: snapshot.showStage,
    visualMode: snapshot.visualMode,
    sceneMode: snapshot.sceneMode,
    visualSeed: snapshot.visualSeed,
    intakeOpen: snapshot.signals.intakeOpen,
    wheelSpinsOwed: snapshot.signals.wheelSpinsOwed,
    sponsorStatus: snapshot.signals.sponsorStatus,
  };
}

function snapshotObservationKey(snapshot: RadioVisualsSnapshot): string {
  return [
    snapshot.updatedAt,
    snapshot.sessionActive ? 1 : 0,
    snapshot.showStage,
    snapshot.visualMode,
    snapshot.sceneMode,
    snapshot.visualSeed,
    snapshot.signals.intakeOpen ? 1 : 0,
    snapshot.signals.wheelSpinsOwed,
    snapshot.signals.sponsorStatus ?? "none",
    snapshot.events.map((event) => `${event.type}:${event.seed}`).join(","),
  ].join("|");
}

function observeSnapshotEvents(snapshot: RadioVisualsSnapshot, runtime: VisualRuntime, serverNowMs: number): void {
  const observationKey = snapshotObservationKey(snapshot);
  if (runtime.observedSnapshotKey === observationKey) return;
  runtime.observedSnapshotKey = observationKey;
  const current = visualSignalMemory(snapshot);
  const previous = runtime.observedSignals;
  runtime.observedSignals = current;
  runtime.syntheticEvents = runtime.syntheticEvents.filter((event) => Date.parse(event.expiresAt) > serverNowMs);
  if (!previous) return;

  const emitted = new Set<RadioVisualEventType>();
  const emit = (type: RadioVisualEventType, salt: string) => {
    if (emitted.has(type) || snapshot.events.some((event) => event.type === type)) return;
    const occurredAt = new Date(serverNowMs).toISOString();
    const event = activeRadioVisualEvent({
      type,
      occurredAt,
      nonce: `${salt}:${snapshot.updatedAt}:${snapshot.visualSeed}:${occurredAt}`,
    }, new Date(serverNowMs));
    if (!event) return;
    emitted.add(type);
    runtime.syntheticEvents.push(event);
  };

  if (!previous.sessionActive && current.sessionActive) emit("show_started", "session-on");
  if (previous.sessionActive && !current.sessionActive) emit("show_complete", "session-off");
  if (current.wheelSpinsOwed > previous.wheelSpinsOwed) emit("wheel_gained", `wheel:${previous.wheelSpinsOwed}:${current.wheelSpinsOwed}`);
  if (current.intakeOpen !== previous.intakeOpen) emit(current.intakeOpen ? "intake_opened" : "intake_closed", `intake:${current.intakeOpen}`);
  if (current.showStage !== previous.showStage) {
    emit(current.showStage === "complete" ? "show_complete" : "stage_shift", `stage:${previous.showStage}:${current.showStage}`);
  }
  if (current.visualMode === "track" && (previous.visualMode !== "track" || current.visualSeed !== previous.visualSeed)) {
    emit("track_started", `track:${previous.visualSeed}:${current.visualSeed}`);
  }
  if (current.sceneMode !== previous.sceneMode && current.sceneMode === "wheel_ready") emit("wheel_launched", "wheel-ready");
  if (current.sceneMode !== previous.sceneMode && (current.sceneMode === "wheel_spinning" || current.sceneMode === "wheel_reencrypting")) emit("wheel_spinning", `wheel:${current.sceneMode}`);
  if (current.sponsorStatus !== previous.sponsorStatus) {
    if (current.sponsorStatus === "due") emit("sponsor_due", "sponsor-due");
    if (current.sponsorStatus === "running") emit("sponsor_started", "sponsor-running");
    if (current.sponsorStatus === "completed" || current.sponsorStatus === "skipped") emit("sponsor_completed", `sponsor:${current.sponsorStatus}`);
  }
  runtime.syntheticEvents = runtime.syntheticEvents.slice(-8);
}

function activeVisualEvents(snapshot: RadioVisualsSnapshot, runtime: VisualRuntime, nowMs: number): RadioVisualEvent[] {
  const active = [...snapshot.events, ...runtime.syntheticEvents]
    .filter((event) => radioVisualEventProgress(event, nowMs) !== null)
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  const deduplicated = new Map<string, RadioVisualEvent>();
  for (const event of active) deduplicated.set(`${event.type}:${event.occurredAt}:${event.seed}`, event);
  return [...deduplicated.values()].slice(-8);
}

function pressureTarget(snapshot: RadioVisualsSnapshot): number {
  if (snapshot.queue.pressure === "max") return 1;
  if (snapshot.queue.pressure === "high") return 0.7;
  if (snapshot.queue.pressure === "medium") return 0.34;
  return 0;
}

function drawVisualFrame(
  context: CanvasRenderingContext2D,
  sourceWidth: number,
  sourceHeight: number,
  timestampMs: number,
  snapshot: RadioVisualsSnapshot,
  anchor: ServerClockAnchor | null,
  runtime: VisualRuntime,
  reducedMotion: boolean,
  previewMode: boolean,
  bridgeSignal: RadioAudioBridgeSignal | null,
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
  runtime.queueMix += ((snapshot.visualMode === "queue" ? 1 : 0) - runtime.queueMix) * (1 - Math.exp(-elapsedMs / 1_700));
  runtime.trackMix += ((snapshot.visualMode === "track" ? 1 : 0) - runtime.trackMix) * (1 - Math.exp(-elapsedMs / 1_500));
  runtime.sponsorMix += ((snapshot.visualMode === "sponsor" ? 1 : 0) - runtime.sponsorMix) * (1 - Math.exp(-elapsedMs / 1_800));
  runtime.intakeMix += ((snapshot.showStage === "intake" ? 1 : 0) - runtime.intakeMix) * (1 - Math.exp(-elapsedMs / 2_000));
  runtime.finalMix += ((snapshot.showStage === "final" ? 1 : 0) - runtime.finalMix) * (1 - Math.exp(-elapsedMs / 2_300));
  runtime.completeMix += ((snapshot.showStage === "complete" ? 1 : 0) - runtime.completeMix) * (1 - Math.exp(-elapsedMs / 2_600));
  runtime.pressureMix += (pressureTarget(snapshot) - runtime.pressureMix) * (1 - Math.exp(-elapsedMs / 2_400));

  if (runtime.currentSeed !== snapshot.visualSeed) {
    runtime.previousSeed = runtime.currentSeed;
    runtime.currentSeed = snapshot.visualSeed;
    runtime.seedTransitionStartedAtMs = timestampMs;
    if (snapshot.visualMode === "track") runtime.bloomStartedAtMs = timestampMs;
  }

  const seedBlend = ease((timestampMs - runtime.seedTransitionStartedAtMs) / PARTICLE_TRANSITION_MS);
  const playbackSeconds = projectedPlaybackSeconds(snapshot.player, anchor, timestampMs);
  const transportSeconds = timestampMs / 1_000;
  runtime.music = smoothMusicSignal(
    runtime.music,
    radioVisualsMusicSignal(snapshot, playbackSeconds, transportSeconds, freshRadioAudioBridgeSignal(bridgeSignal)),
    elapsedMs,
  );
  const music = runtime.music;
  const motionScale = reducedMotion ? 0.18 : 1;
  const time = (transportSeconds * radioVisualsMotionRate(snapshot) + playbackSeconds * 0.035) * motionScale;
  const audioMotionScale = reducedMotion ? 0.45 : 1;
  const audioTime = (transportSeconds * (music.source === "windows_loopback" ? 1 : 0.72) + playbackSeconds * 0.08) * audioMotionScale;
  const shadow = hexToRgb(palette.shadow);
  const serverNowMs = estimatedServerNowMs(anchor, timestampMs);
  const activeSurfaceMix = snapshot.sessionActive || previewMode ? 1 : 0;
  if (activeSurfaceMix > 0) {
    observeSnapshotEvents(snapshot, runtime, serverNowMs);
  } else {
    runtime.wheelMix = 0;
    runtime.systemMix = 0;
    runtime.queueMix = 0;
    runtime.trackMix = 0;
    runtime.sponsorMix = 0;
    runtime.intakeMix = 0;
    runtime.finalMix = 0;
    runtime.completeMix = 0;
    runtime.pressureMix = 0;
    runtime.syntheticEvents = [];
    runtime.observedSignals = null;
  }
  const musicDrives = radioVisualAudioDrives(music);
  const targetWheelVelocity = snapshot.visualMode === "wheel" || runtime.wheelMix > 0.002
    ? wheelAngularVelocityTarget(snapshot.sceneMode, musicDrives) * motionScale
    : 0;
  runtime.wheelVelocity += (targetWheelVelocity - runtime.wheelVelocity) * (1 - Math.exp(-elapsedMs / 650));
  runtime.wheelPhase += runtime.wheelVelocity * elapsedMs / 1_000;
  const cueProgress = radioVisualCueProgress(snapshot.cue, serverNowMs);
  const cueEnvelope = radioVisualCueEnvelope(snapshot.cue, serverNowMs);
  const cueSeed = snapshot.cue
    ? hashRadioVisualToken(`${snapshot.cue.type}:${snapshot.cue.nonce}:${snapshot.cue.startedAt}`)
    : runtime.currentSeed;

  const outputContext = context;
  outputContext.globalCompositeOperation = "source-over";
  outputContext.globalAlpha = 1;
  outputContext.filter = "none";
  outputContext.fillStyle = previewMode ? "#080b0a" : RADIO_VISUALS_CHROMA_KEY;
  outputContext.fillRect(0, 0, sourceWidth, sourceHeight);

  // TikTok Studio reliably restores the saved Link as a square source. Keep that
  // source contract, but compose every effect inside the portrait stage that
  // matches the actual upper-show placement. The keyed side gutters disappear,
  // while particles, flashes, and the wheel vortex remain inside the visible area.
  const stage = radioVisualsEffectStageBounds(sourceWidth, sourceHeight);
  const width = stage.width;
  const height = stage.height;
  outputContext.save();
  outputContext.translate(stage.x, stage.y);
  outputContext.beginPath();
  outputContext.rect(0, 0, width, height);
  outputContext.clip();
  const effectLayer = prepareEffectLayer(runtime, width, height);
  if (effectLayer) context = effectLayer.context;

  drawAmbientLighting(context, width, height, time, runtime.intensity * activeSurfaceMix, runtime.primary, runtime.secondary, runtime.highlight, music.energy);
  drawGoboShadows(context, width, height, time, runtime.intensity * activeSurfaceMix, shadow);
  drawIdleTransmission(
    context,
    width,
    height,
    time,
    activeSurfaceMix * clampVisualValue(0.075 + runtime.intensity * 0.18, 0.075, 0.22),
    runtime.primary,
    runtime.secondary,
    runtime.highlight,
    runtime.currentSeed,
  );
  const musicSceneActivity = music.source === "windows_loopback"
    ? musicDrives.presence >= 0.045
      ? clampVisualValue((musicDrives.presence - 0.03) * 1.22, 0, 1)
      : 0
    : runtime.trackMix > 0.08
      ? clampVisualValue(0.24 + musicDrives.presence * 0.72, 0.24, 1)
      : 0;
  const sceneStateMix = clampVisualValue(1 - Math.max(runtime.wheelMix, runtime.sponsorMix, runtime.systemMix), 0, 1);
  const drawSeedComposition = (seed: number, compositionMix: number) => {
    if (compositionMix < 0.002) return;
    const musicMix = activeSurfaceMix * sceneStateMix * compositionMix * musicSceneActivity;
    if (musicMix < 0.06) return;
    drawSeededMusicScene(context, width, height, audioTime, musicMix, music, runtime.primary, runtime.secondary, runtime.highlight, seed);
  };
  drawSeedComposition(runtime.previousSeed, 1 - seedBlend);
  drawSeedComposition(runtime.currentSeed, seedBlend);
  drawQueueLanes(context, width, height, time, runtime.queueMix * activeSurfaceMix, runtime.primary, runtime.secondary, runtime.currentSeed);
  drawIntakeAperture(context, width, height, time, runtime.intakeMix * activeSurfaceMix, runtime.primary, runtime.secondary, runtime.currentSeed);
  drawSponsorCurtain(context, width, height, time, runtime.sponsorMix * activeSurfaceMix, runtime.secondary, runtime.primary, runtime.currentSeed);
  drawFinalConvergence(context, width, height, time, runtime.finalMix * activeSurfaceMix, runtime.primary, runtime.secondary, runtime.currentSeed);
  drawCompletionAfterimage(context, width, height, time, runtime.completeMix * activeSurfaceMix, runtime.primary, runtime.secondary);
  drawPressureEdges(context, width, height, time, runtime.pressureMix * activeSurfaceMix, runtime.primary, runtime.secondary);

  if (runtime.systemMix * activeSurfaceMix > 0.002) {
    drawIndustrialOverride(
      context,
      width,
      height,
      (audioTime * 0.16) % 1,
      runtime.systemMix * activeSurfaceMix,
      runtime.secondary,
      runtime.highlight,
      runtime.currentSeed + 91,
    );
  }
  if (activeSurfaceMix > 0) {
    drawTrackBloom(context, width, height, timestampMs - runtime.bloomStartedAtMs, runtime.primary, runtime.secondary, runtime.highlight);
    drawAmbientMoment(context, width, height, time, snapshot, runtime.primary, runtime.secondary, runtime.highlight, shadow, serverNowMs, music);
  }

  if (activeSurfaceMix > 0) {
    for (const event of activeVisualEvents(snapshot, runtime, serverNowMs)) {
      drawAutomaticEvent(context, width, height, time, event, serverNowMs, runtime.primary, runtime.secondary, runtime.highlight, shadow, motionScale);
    }
  }

  if (activeSurfaceMix > 0 && snapshot.cue && cueProgress !== null && cueEnvelope > 0.001) {
    if (snapshot.cue.type === "party") drawPartyCue(context, width, height, time, cueProgress, cueEnvelope, runtime.primary, runtime.secondary, runtime.highlight, cueSeed);
    if (snapshot.cue.type === "shadow") drawShadowCue(context, width, height, cueProgress, cueEnvelope, shadow, cueSeed);
    if (snapshot.cue.type === "signal_breach") drawSignalBreachCue(context, width, height, time, cueProgress, cueEnvelope, runtime.primary, runtime.secondary, runtime.highlight, cueSeed);
    if (snapshot.cue.type === "blackout") drawBlackoutCue(context, width, height, cueProgress, cueEnvelope, runtime.primary, shadow, cueSeed);
    if (snapshot.cue.type === "lightning") drawLightningCue(context, width, height, cueProgress, cueEnvelope, runtime.primary, runtime.highlight, cueSeed);
  }
  if (effectLayer) {
    if (snapshot.showStage !== "intake") applyPerformerSafeField(context, width, height, 0.08);
    outputContext.drawImage(effectLayer.canvas, 0, 0, width, height);
  }
  drawWheelScene(
    outputContext,
    width,
    height,
    runtime.wheelPhase,
    runtime.wheelMix * activeSurfaceMix,
    runtime.primary,
    runtime.secondary,
    runtime.highlight,
    runtime.currentSeed,
    music,
    snapshot.sceneMode,
  );
  outputContext.restore();
}

export function RadioVisualsReceiver() {
  const [snapshot, setSnapshot] = useState<RadioVisualsSnapshot>(() => fallbackSnapshot());
  const [connection, setConnection] = useState<ConnectionState>("standby");
  const [audioBridgeConnection, setAudioBridgeConnection] = useState<AudioBridgeConnectionState>("idle");
  const [clockAnchor, setClockAnchor] = useState<ServerClockAnchor | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioBridgeSignalRef = useRef<RadioAudioBridgeSignal | null>(null);
  const previewModeRef = useRef(false);
  const runtimeRef = useRef<VisualRuntime>({
    lastFrameMs: 0,
    wheelPhase: 0,
    wheelVelocity: 0,
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
    queueMix: 0,
    trackMix: 0,
    sponsorMix: 0,
    intakeMix: 0,
    finalMix: 0,
    completeMix: 0,
    pressureMix: 0,
    music: {
      source: "timeline",
      bpm: 112,
      energy: 0.12,
      bass: 0.1,
      mid: 0.1,
      treble: 0.08,
      beat: 0,
      accent: 0,
      peak: 0,
    },
    observedSnapshotKey: "",
    observedSignals: null,
    syntheticEvents: [],
    effectCanvas: null,
    effectContext: null,
  });

  useEffect(() => {
    previewModeRef.current = new URLSearchParams(window.location.search).get("preview") === "1";
  }, []);

  useEffect(() => {
    if (!snapshot.sessionActive) {
      audioBridgeSignalRef.current = null;
      setAudioBridgeConnection("idle");
      return;
    }

    let stopped = false;
    let timeoutId: number | null = null;
    let controller: AbortController | null = null;
    setAudioBridgeConnection("connecting");

    const schedule = (delayMs: number) => {
      if (stopped) return;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => { void poll(); }, delayMs);
    };

    const poll = async () => {
      controller = new AbortController();
      // The first Studio request can include Chromium's local-network
      // permission/preflight work. Give that handshake time to finish; steady
      // 10 Hz polling is still scheduled only after a valid signal arrives.
      const abortId = window.setTimeout(() => controller?.abort(), 4_000);
      try {
        // 127.0.0.1 is an explicit loopback address, so Chromium already knows
        // its target address space. Avoid an experimental RequestInit enum here:
        // TikTok Studio ships its own embedded Chromium version and older builds
        // can reject newer enum spellings before sending any network request.
        const request = new Request(RADIO_AUDIO_BRIDGE_URL, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        });
        const response = await fetch(request);
        if (!response.ok) throw new Error(`Audio bridge returned ${response.status}.`);
        const next = freshRadioAudioBridgeSignal(normalizeRadioAudioBridgeSignal(await response.json()));
        if (!next) throw new Error("Audio bridge returned an invalid or stale signal.");
        audioBridgeSignalRef.current = next;
        setAudioBridgeConnection((current) => current === "connected" ? current : "connected");
        schedule(RADIO_AUDIO_BRIDGE_POLL_INTERVAL_MS);
      } catch {
        if (!stopped) {
          if (!freshRadioAudioBridgeSignal(audioBridgeSignalRef.current)) audioBridgeSignalRef.current = null;
          setAudioBridgeConnection((current) => current === "unavailable" ? current : "unavailable");
          schedule(RADIO_AUDIO_BRIDGE_RETRY_INTERVAL_MS);
        }
      } finally {
        window.clearTimeout(abortId);
        controller = null;
      }
    };

    void poll();
    return () => {
      stopped = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      controller?.abort();
      audioBridgeSignalRef.current = null;
    };
  }, [snapshot.sessionActive]);

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
        const response = await fetch("/api/overlay/radio-visuals", { cache: "no-store", signal: controller.signal, headers: studioOverlayRequestHeaders() });
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
      const density = 1;
      const pixelWidth = Math.max(1, Math.round(bounds.width * density));
      const pixelHeight = Math.max(1, Math.round(bounds.height * density));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(density, 0, 0, density, 0, 0);
      drawVisualFrame(
        context,
        bounds.width,
        bounds.height,
        timestampMs,
        snapshot,
        clockAnchor,
        runtimeRef.current,
        reducedMotion,
        previewModeRef.current,
        audioBridgeSignalRef.current,
      );
    };
    frameId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frameId);
  }, [snapshot, clockAnchor]);

  return (
    <section
      className="radio-visuals-shell"
      data-source-aspect="1:1"
      data-source-resolution="1080x1080"
      data-effect-stage-aspect={`${RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO * 4}:4`}
      data-effect-stage-resolution="810x1080"
      data-connection={connection}
      data-audio-bridge={audioBridgeConnection}
      data-player-state={snapshot.player?.playbackState ?? "waiting"}
      data-show-stage={snapshot.showStage}
      data-visual-mode={snapshot.visualMode}
      data-music-scene={radioVisualMusicScene(snapshot.visualSeed)}
      data-music-source={audioBridgeConnection === "connected"
        ? "windows-loopback"
        : snapshot.player?.audioEnergy === null || snapshot.player?.audioEnergy === undefined ? "timeline" : "analyser"}
      data-visual-cue={snapshot.cue?.type ?? "none"}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="radio-visuals-canvas" />
    </section>
  );
}
