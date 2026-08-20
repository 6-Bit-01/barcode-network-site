"use client";

import { useEffect, useRef, useState } from "react";
import type { RadioVisualEvent, RadioVisualEventType, RadioVisualsPlayerSignal, RadioVisualsShowStage, RadioVisualsSnapshot } from "@/lib/radio-visuals";
import {
  clampVisualValue,
  RADIO_VISUALS_CHROMA_KEY,
  RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO,
  RADIO_VISUALS_WHEEL_CENTER_Y_RATIO,
  radioVisualAmbientMoment,
  radioVisualCueEnvelope,
  radioVisualCueProgress,
  radioVisualsIntensity,
  radioVisualsEffectStageBounds,
  radioVisualsMusicSignal,
  radioVisualsMotionRate,
  radioVisualsPalette,
} from "@/lib/radio-visuals-engine";
import type { RadioVisualMusicSignal } from "@/lib/radio-visuals-engine";
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
    beat: channel(current.beat, target.beat, 65, 280),
    accent: channel(current.accent, target.accent, 55, 320),
    peak: channel(current.peak, target.peak, 45, 380),
  };
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

function drawWavefronts(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  music: RadioVisualMusicSignal,
  primary: Rgb,
  secondary: Rgb,
  seed: number,
): void {
  context.save();
  const centerX = width * (0.34 + randomUnit(seed, 6_901) * 0.32);
  const centerY = height * (0.28 + randomUnit(seed, 6_902) * 0.44);
  const tilt = (randomUnit(seed, 6_903) - 0.5) * 0.72;
  for (let wave = 0; wave < 2; wave += 1) {
    const cycle = (time * (0.14 + wave * 0.035) + wave * 0.46 + randomUnit(seed, 6_910 + wave)) % 1;
    const radius = Math.min(width, height) * (0.08 + cycle * (0.42 + randomUnit(seed, 6_920 + wave) * 0.18));
    const alpha = intensity * (0.32 + music.energy * 0.28 + music.beat * 0.18) * (1 - cycle);
    const strokeColor = rgba(wave ? secondary : primary, alpha);
    context.lineWidth = Math.max(1, Math.min(width, height) * (0.002 + music.bass * 0.0025));
    context.strokeStyle = strokeColor;
    context.shadowColor = strokeColor;
    context.shadowBlur = Math.min(width, height) * (0.012 + music.peak * 0.018);
    context.setLineDash(wave ? [radius * 0.11, radius * 0.055] : []);
    context.lineDashOffset = time * (wave ? -12 : 8);
    context.beginPath();
    context.ellipse(centerX, centerY, radius * (0.58 + randomUnit(seed, 6_930 + wave) * 0.28), radius, tilt, 0, Math.PI * 2);
    context.stroke();
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

function drawMusicHalo(
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
  const centerX = width * (0.28 + randomUnit(seed, 27_001) * 0.44);
  const centerY = height * (0.2 + randomUnit(seed, 27_002) * 0.56);
  const unit = Math.min(width, height);
  const base = unit * (0.1 + randomUnit(seed, 27_003) * 0.16);
  context.save();
  context.translate(centerX, centerY);
  context.rotate((randomUnit(seed, 27_004) - 0.5) * 0.8);
  context.lineCap = "round";
  for (let ring = 0; ring < 4; ring += 1) {
    const radius = base * (0.72 + ring * 0.36) * (1 + music.bass * 0.055 + music.beat * 0.045);
    const color = ring === 3 ? highlight : ring % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, mix * (0.045 + music.energy * 0.095 + music.accent * 0.07) / (1 + ring * 0.15));
    context.lineWidth = Math.max(1, unit * (0.0016 + music.bass * 0.0018));
    context.setLineDash([radius * (0.13 + ring * 0.025), radius * (0.07 + ring * 0.016)]);
    context.lineDashOffset = time * (ring % 2 ? -10 - music.treble * 9 : 7 + music.mid * 8);
    context.beginPath();
    context.ellipse(0, 0, radius, radius * (0.58 + randomUnit(seed, 27_100 + ring) * 0.3), 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawLiveMusicResponse(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  music: RadioVisualMusicSignal,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (music.source !== "windows_loopback") return;
  const presence = clampVisualValue(Math.max(music.energy, music.bass, music.mid, music.treble, music.peak));
  if (presence < 0.006) return;

  const unit = Math.min(width, height);
  const centerX = width * 0.5;
  const centerY = height * (0.51 + Math.sin(time * 0.08) * 0.015);
  const bassDrive = clampVisualValue(music.bass * 0.88 + music.beat * 0.48);
  const midDrive = clampVisualValue(music.mid * 0.9 + music.energy * 0.36);
  const trebleDrive = clampVisualValue(music.treble * 0.9 + music.peak * 0.38);

  context.save();
  context.globalCompositeOperation = "screen";
  context.lineCap = "round";
  radialLight(
    context,
    width,
    height,
    centerX,
    centerY,
    unit * (0.28 + bassDrive * 0.28),
    secondary,
    0.035 + presence * 0.13 + music.beat * 0.08,
  );

  context.save();
  context.translate(centerX, centerY);
  context.rotate(time * (0.035 + music.energy * 0.055));
  for (let ring = 0; ring < 3; ring += 1) {
    const radius = unit * (0.16 + ring * 0.105 + bassDrive * (0.018 + ring * 0.009));
    const color = ring === 0 ? primary : ring === 1 ? secondary : highlight;
    context.setLineDash([radius * (0.12 + ring * 0.025), radius * (0.05 + ring * 0.018)]);
    context.lineDashOffset = time * (ring % 2 ? -20 : 15) * (0.55 + trebleDrive);
    context.lineWidth = Math.max(1.2, unit * (0.0022 + bassDrive * 0.003 + music.beat * 0.002));
    context.strokeStyle = rgba(color, 0.1 + presence * 0.22 + music.beat * 0.18 - ring * 0.012);
    context.shadowColor = rgba(color, 0.16 + music.peak * 0.36);
    context.shadowBlur = unit * (0.006 + music.peak * 0.016);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();

  context.setLineDash([]);
  for (let lane = 0; lane < 3; lane += 1) {
    const baseY = height * (0.29 + lane * 0.23);
    const amplitude = height * (0.009 + midDrive * 0.025 + (lane === 1 ? music.bass * 0.012 : music.treble * 0.008));
    const color = lane === 0 ? secondary : lane === 1 ? primary : highlight;
    context.strokeStyle = rgba(color, 0.07 + midDrive * 0.22 + music.accent * 0.08);
    context.lineWidth = Math.max(1, unit * (0.0014 + music.energy * 0.0022));
    context.beginPath();
    for (let step = 0; step <= 56; step += 1) {
      const progress = step / 56;
      const x = width * (0.04 + progress * 0.92);
      const carrier = Math.sin(progress * Math.PI * (5 + lane * 2) + time * (1.2 + lane * 0.24));
      const modulation = Math.sin(progress * Math.PI * 17 - time * (0.62 + lane * 0.11));
      const y = baseY + (carrier * 0.72 + modulation * 0.28) * amplitude;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  const sparkleCount = 18 + Math.floor(trebleDrive * 22);
  for (let sparkle = 0; sparkle < sparkleCount; sparkle += 1) {
    const angle = randomUnit(seed, 31_100 + sparkle) * Math.PI * 2 + time * (0.08 + trebleDrive * 0.18) * (sparkle % 2 ? -1 : 1);
    const orbit = unit * (0.18 + randomUnit(seed, 31_200 + sparkle) * 0.29 + music.beat * 0.018);
    const x = centerX + Math.cos(angle) * orbit;
    const y = centerY + Math.sin(angle) * orbit * 1.18;
    const radius = Math.max(0.8, unit * (0.0012 + randomUnit(seed, 31_300 + sparkle) * 0.0028 + trebleDrive * 0.0018));
    const color = sparkle % 7 === 0 ? highlight : sparkle % 2 ? secondary : primary;
    context.fillStyle = rgba(color, 0.08 + trebleDrive * 0.34 + music.peak * 0.18);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
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
  const horizonY = height * (0.38 + randomUnit(seed, 7_101) * 0.22);
  const horizonX = width * (0.38 + randomUnit(seed, 7_102) * 0.24);
  context.save();
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.002);
  for (let lane = 0; lane < 7; lane += 1) {
    const startX = width * (-0.18 + lane * 0.225);
    const drift = Math.sin(time * 0.18 + lane * 0.91) * width * 0.014;
    context.strokeStyle = rgba(lane % 2 ? secondary : primary, mix * (0.08 + (lane % 3) * 0.026));
    context.beginPath();
    context.moveTo(startX + drift, height * 1.04);
    context.quadraticCurveTo(width * (0.5 + (lane - 3) * 0.018), height * 0.72, horizonX, horizonY);
    context.stroke();
  }
  const scan = ((time * 0.055 + randomUnit(seed, 7_103)) % 1) * 0.64 + 0.31;
  context.strokeStyle = rgba(primary, mix * 0.16 * Math.sin(scan * Math.PI));
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.0035);
  context.beginPath();
  context.moveTo(width * 0.05, height * scan);
  context.lineTo(width * 0.95, height * scan);
  context.stroke();
  context.restore();
}

function drawTrackSignature(
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
  const centerX = width * (0.42 + randomUnit(seed, 8_101) * 0.16);
  const centerY = height * (0.42 + randomUnit(seed, 8_102) * 0.2);
  const base = Math.min(width, height) * (0.15 + music.energy * 0.08 + music.bass * 0.025);
  context.save();
  context.translate(centerX, centerY);
  context.rotate((randomUnit(seed, 8_103) - 0.5) * 0.38);
  for (let ring = 0; ring < 4; ring += 1) {
    const wobble = 1 + Math.sin(time * (0.42 + ring * 0.08) + ring * 1.2) * (0.025 + music.mid * 0.055) + music.beat * 0.035;
    const radius = base * (0.75 + ring * 0.42) * wobble;
    context.strokeStyle = rgba(ring === 3 ? highlight : ring % 2 ? secondary : primary, mix * (0.075 + music.energy * 0.13 + music.accent * 0.045) / (1 + ring * 0.18));
    context.lineWidth = Math.max(1, Math.min(width, height) * (0.0018 + (3 - ring) * 0.0006 + music.bass * 0.0008));
    context.setLineDash(ring % 2 ? [radius * 0.16, radius * 0.08] : []);
    context.lineDashOffset = time * (ring % 2 ? -9 - music.treble * 7 : 7 + music.mid * 5);
    context.beginPath();
    context.ellipse(0, 0, radius, radius * (0.62 + ring * 0.04), 0, 0, Math.PI * 2);
    context.stroke();
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
  const centerX = width * (0.46 + randomUnit(seed, 9_101) * 0.08);
  const centerY = height * (0.46 + randomUnit(seed, 9_102) * 0.08);
  const radius = Math.min(width, height) * (0.25 + Math.sin(time * 0.28) * 0.018);
  context.save();
  context.translate(centerX, centerY);
  context.rotate(time * 0.035);
  context.lineCap = "round";
  for (let arc = 0; arc < 8; arc += 1) {
    const angle = arc / 8 * Math.PI * 2 + randomUnit(seed, 9_200 + arc) * 0.16;
    context.strokeStyle = rgba(arc % 2 ? secondary : primary, mix * (0.075 + (arc % 3) * 0.018));
    context.lineWidth = Math.max(1, Math.min(width, height) * 0.0028);
    context.beginPath();
    context.arc(0, 0, radius * (0.88 + (arc % 3) * 0.1), angle, angle + 0.5 + randomUnit(seed, 9_300 + arc) * 0.34);
    context.stroke();
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
  context.save();
  for (let band = 0; band < 7; band += 1) {
    const center = width * (band + 0.5) / 7 + Math.sin(time * 0.14 + band + seed * 0.0001) * width * 0.016;
    const bandWidth = width * (0.07 + randomUnit(seed, 10_100 + band) * 0.08);
    const gradient = context.createLinearGradient(center - bandWidth, 0, center + bandWidth, 0);
    gradient.addColorStop(0, rgba(secondary, 0));
    gradient.addColorStop(0.5, rgba(band % 3 === 0 ? primary : secondary, mix * (0.04 + (band % 2) * 0.025)));
    gradient.addColorStop(1, rgba(secondary, 0));
    context.fillStyle = gradient;
    context.fillRect(center - bandWidth, 0, bandWidth * 2, height);
  }
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
  const targetX = width * (0.43 + randomUnit(seed, 11_101) * 0.14);
  const targetY = height * (0.42 + randomUnit(seed, 11_102) * 0.16);
  context.save();
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.0024);
  for (let ray = 0; ray < 12; ray += 1) {
    const side = ray % 4;
    const position = randomUnit(seed, 11_200 + ray);
    const startX = side === 0 ? 0 : side === 1 ? width : position * width;
    const startY = side === 2 ? 0 : side === 3 ? height : position * height;
    const pulse = 0.5 + 0.5 * Math.sin(time * (0.22 + ray * 0.006) + ray);
    context.strokeStyle = rgba(ray % 2 ? secondary : primary, mix * (0.035 + pulse * 0.08));
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(targetX, targetY);
    context.stroke();
  }
  context.restore();
  radialLight(context, width, height, targetX, targetY, Math.min(width, height) * 0.32, secondary, mix * 0.08);
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

function drawPulseRings(
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
  const centerX = width * (0.27 + randomUnit(seed, 14_101) * 0.46);
  const centerY = height * (0.25 + randomUnit(seed, 14_102) * 0.5);
  const angle = (randomUnit(seed, 14_103) - 0.5) * 0.9;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(angle);
  for (let ring = 0; ring < count; ring += 1) {
    const ringProgress = clampVisualValue((progress - ring * 0.07) / Math.max(0.01, 1 - ring * 0.07));
    const radius = Math.min(width, height) * (0.04 + ringProgress * (0.32 + randomUnit(seed, 14_200 + ring) * 0.22));
    const alpha = envelope * (1 - ringProgress) * (0.34 + randomUnit(seed, 14_300 + ring) * 0.44);
    context.strokeStyle = rgba(ring % 3 === 0 ? highlight : ring % 2 ? secondary : primary, alpha);
    context.lineWidth = Math.max(1, Math.min(width, height) * (0.002 + (count - ring) * 0.0012));
    context.beginPath();
    context.ellipse(0, 0, radius, radius * (0.58 + randomUnit(seed, 14_400 + ring) * 0.35), 0, 0, Math.PI * 2);
    context.stroke();
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
  const originX = width * (0.2 + randomUnit(seed, 15_101) * 0.6);
  const originY = height * (0.22 + randomUnit(seed, 15_102) * 0.56);
  context.save();
  for (let fragment = 0; fragment < count; fragment += 1) {
    const angle = randomUnit(seed, 15_200 + fragment) * Math.PI * 2;
    const distance = Math.min(width, height) * progress * (0.08 + randomUnit(seed, 15_300 + fragment) * 0.48);
    const curl = Math.sin(time * 0.9 + fragment) * distance * 0.08;
    const x = originX + Math.cos(angle) * distance + Math.sin(angle) * curl;
    const y = originY + Math.sin(angle) * distance - Math.cos(angle) * curl;
    const size = Math.max(1, Math.min(width, height) * (0.0015 + randomUnit(seed, 15_400 + fragment) * 0.006));
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
    const ignition = ease(progress);
    radialLight(context, width, height, width * (0.38 + randomUnit(seed, 16_101) * 0.24), height * (0.38 + randomUnit(seed, 16_102) * 0.24), Math.max(width, height) * (0.15 + ignition * 0.68), secondary, envelope * 0.28);
    drawPulseRings(context, width, height, progress, envelope, seed, primary, secondary, highlight, 6);
    drawEventFragments(context, width, height, time, progress, envelope, seed + 11, primary, secondary, highlight, 28);
    return;
  }
  if (event.type === "show_complete") {
    context.fillStyle = rgba(shadow, envelope * 0.22);
    context.fillRect(0, 0, width, height);
    drawPulseRings(context, width, height, 1 - progress, envelope * 0.7, seed, secondary, primary, highlight, 5);
    return;
  }
  if (event.type === "track_started" || event.type === "stage_shift") {
    drawPulseRings(context, width, height, progress, envelope * (event.type === "track_started" ? 0.72 : 0.46), seed, primary, secondary, highlight, event.type === "track_started" ? 4 : 3);
    radialLight(context, width, height, width * (0.3 + randomUnit(seed, 16_201) * 0.4), height * (0.3 + randomUnit(seed, 16_202) * 0.4), Math.max(width, height) * (0.16 + progress * 0.42), event.type === "track_started" ? primary : secondary, envelope * 0.16);
    return;
  }
  if (event.type === "track_skipped") {
    const direction = randomUnit(seed, 16_301) > 0.5 ? 1 : -1;
    const x = width * (direction > 0 ? progress : 1 - progress);
    context.save();
    context.strokeStyle = rgba(highlight, envelope * 0.74);
    context.shadowColor = rgba(secondary, envelope * 0.82);
    context.shadowBlur = Math.min(width, height) * 0.025;
    context.lineWidth = Math.max(2, Math.min(width, height) * 0.006);
    context.beginPath();
    for (let step = 0; step <= 18; step += 1) {
      const y = height * step / 18;
      const tearX = x + (randomUnit(seed, 16_400 + step) - 0.5) * width * 0.11;
      if (step === 0) context.moveTo(tearX, y);
      else context.lineTo(tearX, y);
    }
    context.stroke();
    context.restore();
    drawEventFragments(context, width, height, time * 1.4, progress, envelope, seed, primary, secondary, highlight, 34);
    return;
  }
  if (event.type === "priority_sent") {
    const direction = randomUnit(seed, 16_501) > 0.5 ? 1 : -1;
    const startX = direction > 0 ? -width * 0.08 : width * 1.08;
    const endX = direction > 0 ? width * 1.08 : -width * 0.08;
    context.save();
    context.strokeStyle = rgba(secondary, envelope * 0.58);
    context.lineWidth = Math.max(2, Math.min(width, height) * 0.004);
    for (let lane = 0; lane < 4; lane += 1) {
      const y = height * (0.22 + randomUnit(seed, 16_600 + lane) * 0.56);
      context.beginPath();
      context.moveTo(startX, y + lane * height * 0.012);
      context.quadraticCurveTo(width * 0.5, y - height * (0.12 + lane * 0.025), startX + (endX - startX) * ease(progress), y);
      context.stroke();
    }
    context.restore();
    return;
  }
  if (event.type === "priority_confirmed") {
    drawPulseRings(context, width, height, progress, envelope, seed, primary, secondary, highlight, 7);
    drawEventFragments(context, width, height, time * 1.5, progress, envelope, seed, primary, secondary, highlight, 46);
    return;
  }
  if (event.type === "wheel_gained" || event.type === "wheel_launched" || event.type === "wheel_spinning") {
    const strength = event.type === "wheel_gained" ? 0.82 : event.type === "wheel_spinning" ? 0.68 : 0.58;
    drawPulseRings(context, width, height, progress, envelope * strength, seed, primary, secondary, highlight, event.type === "wheel_gained" ? 7 : 5);
    drawWheelScene(context, width, height, time * (event.type === "wheel_spinning" ? 2.2 : 1.3), envelope * strength, primary, secondary, highlight, seed);
    if (event.type === "wheel_gained") drawEventFragments(context, width, height, time, progress, envelope, seed, primary, secondary, highlight, 38);
    return;
  }
  if (event.type === "intake_opened" || event.type === "intake_closed") {
    const apertureProgress = event.type === "intake_opened" ? progress : 1 - progress;
    drawIntakeAperture(context, width, height, time * 1.8, envelope * (0.5 + apertureProgress * 0.5), primary, secondary, seed);
    drawPulseRings(context, width, height, apertureProgress, envelope * 0.42, seed, primary, secondary, highlight, 3);
    return;
  }
  if (event.type === "sponsor_due" || event.type === "sponsor_started" || event.type === "sponsor_completed") {
    drawSponsorCurtain(context, width, height, time * 1.5, envelope * (event.type === "sponsor_started" ? 1 : 0.62), secondary, primary, seed);
    if (event.type === "sponsor_completed") drawPulseRings(context, width, height, progress, envelope * 0.46, seed, secondary, primary, highlight, 4);
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
  music?: RadioVisualMusicSignal,
): void {
  if (mix < 0.002) return;
  const beat = music?.beat ?? 0;
  const bass = music?.bass ?? 0;
  const radius = Math.min(width, height) * (0.35 + beat * 0.012);
  context.save();
  context.translate(width * 0.5, height * RADIO_VISUALS_WHEEL_CENTER_Y_RATIO);
  context.rotate(time * 0.28);
  for (let ring = 0; ring < 3; ring += 1) {
    const dashVariation = 0.82 + randomUnit(seed, 28_100 + ring) * 0.42;
    context.setLineDash([radius * (0.11 + ring * 0.035) * dashVariation, radius * (0.052 + ring * 0.018)]);
    context.lineDashOffset = time * (18 + ring * 9 + (music?.treble ?? 0) * 10) * (ring % 2 ? -1 : 1);
    context.lineWidth = Math.max(1.5, Math.min(width, height) * (0.0038 + ring * 0.0018 + bass * 0.0012));
    context.strokeStyle = rgba(ring === 0 ? primary : ring === 1 ? secondary : highlight, mix * (0.28 + ring * 0.12 + beat * 0.12));
    context.beginPath();
    context.arc(0, 0, radius * (0.72 + ring * 0.18), 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();

  drawParticleField(context, width, height, time * (1.5 + (music?.mid ?? 0) * 0.35), mix * (0.72 + (music?.energy ?? 0) * 0.2), seed + 8_801, primary, secondary, highlight, 1.3 + (music?.treble ?? 0) * 0.28);
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
  strokeLightningPath(context, path, highlight, strength, Math.max(1, unit * 0.0027), unit * 0.008);
  for (let branch = 0; branch < branches.length; branch += 1) {
    const branchStrength = strength * (0.34 + randomUnit(seed, 22_500 + branch) * 0.44);
    strokeLightningPath(context, branches[branch], channel, branchStrength * 0.64, Math.max(1, unit * 0.0045), unit * 0.018);
    strokeLightningPath(context, branches[branch], highlight, branchStrength, Math.max(0.7, unit * 0.0018), unit * 0.006);
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
  const shadow = hexToRgb(palette.shadow);
  const serverNowMs = estimatedServerNowMs(anchor, timestampMs);
  observeSnapshotEvents(snapshot, runtime, serverNowMs);
  const cueProgress = radioVisualCueProgress(snapshot.cue, serverNowMs);
  const cueEnvelope = radioVisualCueEnvelope(snapshot.cue, serverNowMs);
  const cueSeed = snapshot.cue
    ? hashRadioVisualToken(`${snapshot.cue.type}:${snapshot.cue.nonce}:${snapshot.cue.startedAt}`)
    : runtime.currentSeed;

  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.filter = "none";
  context.fillStyle = previewMode ? "#080b0a" : RADIO_VISUALS_CHROMA_KEY;
  context.fillRect(0, 0, sourceWidth, sourceHeight);

  // TikTok Studio reliably restores the saved Link as a square source. Keep that
  // source contract, but compose every effect inside the portrait stage that
  // matches the actual upper-show placement. The keyed side gutters disappear,
  // while particles, flashes, and the wheel vortex remain inside the visible area.
  const stage = radioVisualsEffectStageBounds(sourceWidth, sourceHeight);
  const width = stage.width;
  const height = stage.height;
  context.save();
  context.translate(stage.x, stage.y);
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();

  drawAmbientLighting(context, width, height, time, runtime.intensity, runtime.primary, runtime.secondary, runtime.highlight, music.energy);
  drawGoboShadows(context, width, height, time, runtime.intensity, shadow);
  const drawSeedComposition = (seed: number, compositionMix: number) => {
    if (compositionMix < 0.002) return;
    const composition = Math.floor(randomUnit(seed, 29_001) * 4);
    drawLightRibbons(context, width, height, time, runtime.intensity * compositionMix * (composition === 0 ? 1.12 : 0.72), music, runtime.primary, runtime.secondary, runtime.highlight, seed);
    if (composition !== 2) drawPrismaticShards(context, width, height, time, runtime.intensity * compositionMix * (composition === 1 ? 1.18 : 0.68), music, runtime.primary, runtime.secondary, runtime.highlight, seed);
    if (composition !== 1) drawSignalConstellation(context, width, height, time, runtime.intensity * compositionMix * (composition === 3 ? 1.15 : 0.7), music, runtime.primary, runtime.secondary, runtime.highlight, seed);
    drawMusicHalo(context, width, height, time, Math.max(runtime.trackMix * 0.92, runtime.intensity * 0.46) * compositionMix, music, runtime.primary, runtime.secondary, runtime.highlight, seed);
    drawQueueLanes(context, width, height, time, runtime.queueMix * compositionMix, runtime.primary, runtime.secondary, seed);
    drawTrackSignature(context, width, height, time, runtime.trackMix * compositionMix, music, runtime.primary, runtime.secondary, runtime.highlight, seed);
    drawIntakeAperture(context, width, height, time, runtime.intakeMix * compositionMix, runtime.primary, runtime.secondary, seed);
    drawSponsorCurtain(context, width, height, time, runtime.sponsorMix * compositionMix, runtime.secondary, runtime.primary, seed);
    drawFinalConvergence(context, width, height, time, runtime.finalMix * compositionMix, runtime.primary, runtime.secondary, seed);
    drawCaustics(context, width, height, time, runtime.intensity * compositionMix, runtime.secondary, seed);
    drawWavefronts(context, width, height, time, runtime.intensity * compositionMix, music, runtime.primary, runtime.secondary, seed);
    drawParticleField(
      context,
      width,
      height,
      time * (1 + music.treble * 0.12),
      runtime.intensity * compositionMix * (0.84 + music.energy * 0.24),
      seed,
      runtime.primary,
      runtime.secondary,
      runtime.highlight,
      0.88 + music.treble * 0.48 + music.accent * 0.18,
    );
  };
  if (seedBlend < 1) drawSeedComposition(runtime.previousSeed, 1 - seedBlend);
  drawSeedComposition(runtime.currentSeed, seedBlend);
  drawLiveMusicResponse(context, width, height, time, music, runtime.primary, runtime.secondary, runtime.highlight, runtime.currentSeed);
  drawCompletionAfterimage(context, width, height, time, runtime.completeMix, runtime.primary, runtime.secondary);
  drawPressureEdges(context, width, height, time, runtime.pressureMix, runtime.primary, runtime.secondary);

  if (runtime.systemMix > 0.002) {
    drawSignalBreachCue(context, width, height, time * 0.46, (Math.sin(time * 0.08) + 1) / 2, runtime.systemMix * 0.22, runtime.primary, runtime.secondary, runtime.highlight, runtime.currentSeed + 91);
  }
  drawWheelScene(context, width, height, time, runtime.wheelMix, runtime.primary, runtime.secondary, runtime.highlight, runtime.currentSeed, music);
  drawTrackBloom(context, width, height, timestampMs - runtime.bloomStartedAtMs, runtime.primary, runtime.secondary, runtime.highlight);
  drawAmbientMoment(context, width, height, time, snapshot, runtime.primary, runtime.secondary, runtime.highlight, shadow, serverNowMs, music);

  for (const event of activeVisualEvents(snapshot, runtime, serverNowMs)) {
    drawAutomaticEvent(context, width, height, time, event, serverNowMs, runtime.primary, runtime.secondary, runtime.highlight, shadow, motionScale);
  }

  if (snapshot.cue && cueProgress !== null && cueEnvelope > 0.001) {
    if (snapshot.cue.type === "party") drawPartyCue(context, width, height, time, cueProgress, cueEnvelope, runtime.primary, runtime.secondary, runtime.highlight, cueSeed);
    if (snapshot.cue.type === "shadow") drawShadowCue(context, width, height, cueProgress, cueEnvelope, shadow, cueSeed);
    if (snapshot.cue.type === "signal_breach") drawSignalBreachCue(context, width, height, time, cueProgress, cueEnvelope, runtime.primary, runtime.secondary, runtime.highlight, cueSeed);
    if (snapshot.cue.type === "blackout") drawBlackoutCue(context, width, height, cueProgress, cueEnvelope, runtime.primary, shadow, cueSeed);
    if (snapshot.cue.type === "lightning") drawLightningCue(context, width, height, cueProgress, cueEnvelope, runtime.primary, runtime.highlight, cueSeed);
  }
  context.restore();
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
      const density = Math.min(1.5, window.devicePixelRatio || 1);
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
