"use client";

import { useEffect, useRef, useState } from "react";
import type { RadioVisualEvent, RadioVisualEventType, RadioVisualsPlayerSignal, RadioVisualsShowStage, RadioVisualsSnapshot } from "@/lib/radio-visuals";
import {
  advanceRadioVisualMusicTransition,
  advanceRadioVisualAudioReaction,
  clampVisualValue,
  RADIO_VISUAL_MUSIC_OUTPUT_GAIN,
  RADIO_VISUALS_CHROMA_KEY,
  RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO,
  RADIO_VISUALS_WHEEL_CENTER_Y_RATIO,
  radioVisualAudioDrives,
  radioVisualAudioReactionInitialState,
  radioVisualAmbientMoment,
  radioVisualBroadcastFxPlan,
  radioVisualCueEnvelope,
  radioVisualCueProgress,
  radioVisualMusicEvolutionPlan,
  radioVisualMusicIntensityPlan,
  radioVisualMusicScene,
  radioVisualMusicSceneLayerPlan,
  radioVisualMusicPerimeterPlan,
  radioVisualMusicSceneVisibility,
  radioVisualWindowIntrusionPlan,
  radioVisualsIntensity,
  radioVisualsEffectStageBounds,
  radioVisualsMusicSignal,
  radioVisualsMotionRate,
  radioVisualsPalette,
  radioVisualsPortalProfile,
  radioVisualsPortalStageEdgeRadius,
  radioVisualsWheelBand,
} from "@/lib/radio-visuals-engine";
import type { RadioVisualAudioDrives, RadioVisualBroadcastFxPlan, RadioVisualMusicEvolutionPlan, RadioVisualMusicPerimeterPlan, RadioVisualMusicScene, RadioVisualMusicSceneLayerPlan, RadioVisualMusicSignal, RadioVisualWindowIntrusionPlan } from "@/lib/radio-visuals-engine";
import { activeRadioVisualEvent, hashRadioVisualToken, radioVisualBroadcastStartedTransition, radioVisualEventEnvelope, radioVisualEventProgress } from "@/lib/radio-visuals-events";
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
  broadcastPhase: RadioVisualsSnapshot["signals"]["broadcastPhase"];
  wheelSpinsOwed: number;
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
  currentMusicSeed: number;
  previousMusicSeed: number;
  musicTransitionStartedAtMs: number;
  trackProgressSeed: number | null;
  trackProgressStartedAtMs: number;
  bloomStartedAtMs: number;
  wheelMix: number;
  systemMix: number;
  queueMix: number;
  trackMix: number;
  intakeMix: number;
  finalMix: number;
  completeMix: number;
  pressureMix: number;
  music: RadioVisualMusicSignal;
  bassSlow: number;
  midSlow: number;
  trebleSlow: number;
  bassOnset: number;
  midOnset: number;
  trebleOnset: number;
  buildMemory: number;
  observedSnapshotKey: string;
  observedSignals: VisualSignalMemory | null;
  syntheticEvents: RadioVisualEvent[];
  effectCanvas: HTMLCanvasElement | null;
  effectContext: CanvasRenderingContext2D | null;
  crtCanvas: HTMLCanvasElement | null;
  crtContext: CanvasRenderingContext2D | null;
}

const RETRY_POLL_INTERVAL_MS = 5_000;
const PALETTE_TRANSITION_MS = 2_400;
const PARTICLE_TRANSITION_MS = 2_000;
const TRACK_BLOOM_MS = 1_700;
const INITIAL_AUDIO_REACTION = radioVisualAudioReactionInitialState();

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
      wheelCandidateCount: 0,
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
    // The native helper already smooths its analyser values. This shorter
    // browser follower preserves impact while still easing releases between
    // the helper's 100 ms updates.
    energy: channel(current.energy, target.energy, 55, 260),
    bass: channel(current.bass, target.bass, 45, 240),
    mid: channel(current.mid, target.mid, 38, 180),
    treble: channel(current.treble, target.treble, 25, 110),
    beat: channel(current.beat, target.beat, 10, 70),
    accent: channel(current.accent, target.accent, 12, 85),
    peak: channel(current.peak, target.peak, 10, 100),
    progress: target.progress,
    phrase: target.phrase,
  };
}

function reactiveAudioDrives(
  runtime: VisualRuntime,
  music: RadioVisualMusicSignal,
  elapsedMs: number,
): RadioVisualAudioDrives {
  const reaction = advanceRadioVisualAudioReaction({
    bassSlow: runtime.bassSlow,
    midSlow: runtime.midSlow,
    trebleSlow: runtime.trebleSlow,
    bassOnset: runtime.bassOnset,
    midOnset: runtime.midOnset,
    trebleOnset: runtime.trebleOnset,
    buildMemory: runtime.buildMemory,
  }, music, elapsedMs);
  runtime.bassSlow = reaction.state.bassSlow;
  runtime.midSlow = reaction.state.midSlow;
  runtime.trebleSlow = reaction.state.trebleSlow;
  runtime.bassOnset = reaction.state.bassOnset;
  runtime.midOnset = reaction.state.midOnset;
  runtime.trebleOnset = reaction.state.trebleOnset;
  runtime.buildMemory = reaction.state.buildMemory;
  return reaction.drives;
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

function prepareCrtTexture(
  runtime: VisualRuntime,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const needsInitialPaint = runtime.crtCanvas === null;
  const canvas = runtime.crtCanvas ?? document.createElement("canvas");
  const context = runtime.crtContext ?? canvas.getContext("2d");
  if (!context) return null;
  runtime.crtCanvas = canvas;
  runtime.crtContext = context;
  const pixelWidth = Math.max(1, Math.round(width));
  const pixelHeight = Math.max(1, Math.round(height));
  if (!needsInitialPaint && canvas.width === pixelWidth && canvas.height === pixelHeight) return canvas;
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  for (let y = 0; y < pixelHeight; y += 4) {
    context.fillStyle = y % 8 === 0 ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.2)";
    context.fillRect(0, y, pixelWidth, 1);
  }
  return canvas;
}

function drawPersistentBroadcastTexture(
  context: CanvasRenderingContext2D,
  runtime: VisualRuntime,
  width: number,
  height: number,
  time: number,
  strength: number,
  primary: Rgb,
  highlight: Rgb,
): void {
  if (strength < 0.002) return;
  const texture = prepareCrtTexture(runtime, width, height);
  const unit = Math.min(width, height);
  context.save();
  if (texture) {
    context.globalAlpha = clampVisualValue(strength, 0, 0.055);
    context.drawImage(texture, 0, 0, width, height);
  }
  const rollY = height * ((time * 0.027) % 1);
  const roll = context.createLinearGradient(0, rollY - unit * 0.045, 0, rollY + unit * 0.045);
  roll.addColorStop(0, rgba(primary, 0));
  roll.addColorStop(0.5, rgba(highlight, clampVisualValue(strength * 0.72, 0, 0.04)));
  roll.addColorStop(1, rgba(primary, 0));
  context.fillStyle = roll;
  context.fillRect(0, rollY - unit * 0.045, width, unit * 0.09);
  context.restore();
}

function applyPerformerSafeField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerRetention = 0.2,
): void {
  const unit = Math.min(width, height);
  const maskColor: Rgb = [255, 255, 255];
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.translate(width * 0.5, height * 0.44);
  context.scale(1, 1.28);
  const gradient = context.createRadialGradient(0, 0, unit * 0.045, 0, 0, unit * 0.55);
  gradient.addColorStop(0, rgba(maskColor, centerRetention));
  gradient.addColorStop(0.2, rgba(maskColor, centerRetention + 0.04));
  gradient.addColorStop(0.44, rgba(maskColor, 0.38));
  gradient.addColorStop(0.68, rgba(maskColor, 0.82));
  gradient.addColorStop(1, rgba(maskColor, 1));
  context.fillStyle = gradient;
  context.fillRect(-width, -height, width * 2, height * 2);
  context.restore();
}

function applyPerformerIntrusionField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const unit = Math.min(width, height);
  const maskColor: Rgb = [255, 255, 255];
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.translate(width * 0.5, height * 0.44);
  context.scale(1, 1.24);
  const gradient = context.createRadialGradient(0, 0, unit * 0.03, 0, 0, unit * 0.48);
  gradient.addColorStop(0, rgba(maskColor, 0.92));
  gradient.addColorStop(0.3, rgba(maskColor, 0.8));
  gradient.addColorStop(0.58, rgba(maskColor, 0.34));
  gradient.addColorStop(0.82, rgba(maskColor, 0.08));
  gradient.addColorStop(1, rgba(maskColor, 0));
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
  context.save();
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.38, rgba(color, alpha * 0.48));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  const left = Math.max(0, x - radius);
  const top = Math.max(0, y - radius);
  const right = Math.min(width, x + radius);
  const bottom = Math.min(height, y + radius);
  context.fillRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
  context.restore();
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
  drives: RadioVisualAudioDrives,
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const topology = Math.min(3, Math.floor(drives.progress * 4));
  const identityDensity = radioVisualMusicIntensityPlan(drives).identityDensity;
  const count = 2
    + Math.round(identityDensity * 4)
    + Math.max(layerPlan.mid, Math.floor(drives.midLayer * 8))
    + Math.floor(drives.trebleLayer * 5)
    + Math.max(layerPlan.tapestry, Math.floor(drives.tapestry * 8))
    + Math.floor(drives.build * 3);
  const gravity = 1 - drives.bassLayer * 0.2 - drives.bassPulse * 0.09;
  const points = Array.from({ length: count }, (_, index) => ({
    x: width * 0.5 + (width * (0.08 + randomUnit(seed, 26_200 + index) * 0.84) - width * 0.5) * gravity
      + Math.sin(time * (0.08 + drives.mid * 0.08) + index) * width * (0.003 + drives.midLayer * 0.018),
    y: height * 0.5 + (height * (0.08 + randomUnit(seed, 26_300 + index) * 0.84) - height * 0.5) * gravity
      + Math.cos(time * (0.07 + drives.mid * 0.07) + index * 0.74) * height * (0.003 + drives.midLayer * 0.015),
  }));
  context.save();
  context.lineWidth = Math.max(1, unit * (0.001 + drives.midLayer * 0.0022));
  const linkReach = Math.max(width, height) * (0.12 + drives.midLayer * (0.3 + topology * 0.012) + drives.tapestry * 0.12);
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const topologyOffset = 1 + topology;
    const randomOffset = Math.floor(randomUnit(seed, 26_500 + index) * Math.max(1, points.length - topologyOffset - 1));
    const to = points[(index + topologyOffset + randomOffset) % points.length];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    if (distance > linkReach) continue;
    const color = index % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.08 + drives.midLayer * 0.5 + drives.tapestry * 0.16));
    context.beginPath();
    context.moveTo(from.x, from.y);
    const bend = Math.sin(time * 0.13 + index) * unit * drives.midLayer * 0.034;
    context.quadraticCurveTo((from.x + to.x) * 0.5 + bend, (from.y + to.y) * 0.5 - bend, to.x, to.y);
    context.stroke();
    if (drives.midPulse > 0.32 || drives.tapestryPulse > 0.38) {
      const travel = (time * (0.18 + drives.midPulse * 0.42) + randomUnit(seed, 26_700 + index)) % 1;
      const packetX = from.x + (to.x - from.x) * travel;
      const packetY = from.y + (to.y - from.y) * travel;
      context.fillStyle = rgba(index % 2 ? primary : secondary, coreAlpha * (0.38 + drives.midPulse * 0.5));
      context.fillRect(packetX - unit * 0.004, packetY - unit * 0.0015, unit * 0.008, unit * 0.003);
    }
  }
  points.forEach((point, index) => {
    const transientCore = drives.treblePulse > 0.72 && index % 7 === 0;
    const color = transientCore ? highlight : index % 2 ? secondary : primary;
    const radius = Math.max(1, unit * (0.0014 + randomUnit(seed, 26_400 + index) * 0.0032) * (0.76 + drives.bass * 0.42));
    const twinkle = 0.34 + 0.66 * Math.abs(Math.sin(time * (0.45 + drives.treble * 3.2) + index));
    context.fillStyle = rgba(color, coreAlpha * (0.16 + drives.trebleLayer * 0.66) * twinkle);
    context.shadowColor = rgba(color, coreAlpha * 0.72);
    context.shadowBlur = radius * (2.5 + drives.treblePulse * 6);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  });
  context.shadowBlur = 0;
  context.shadowColor = rgba(primary, 0);

  // Bass reveals massive gravity wells instead of merely making every tiny
  // star a little thicker.
  const anchorCount = layerPlan.bass;
  for (let anchor = 0; anchor < anchorCount; anchor += 1) {
    const angle = time * (0.035 + anchor * 0.009) + randomUnit(seed, 26_850 + anchor) * Math.PI * 2;
    const orbit = unit * (0.12 + randomUnit(seed, 26_880 + anchor) * 0.22);
    const x = width * 0.5 + Math.cos(angle) * orbit;
    const y = height * 0.5 + Math.sin(angle) * orbit;
    const radius = unit * (0.012 + drives.bassLayer * 0.02 + drives.bassPulse * 0.012);
    radialLight(context, width, height, x, y, radius * 4.5, anchor % 2 ? secondary : primary, coreAlpha * drives.bassLayer * 0.34);
    context.fillStyle = rgba(anchor % 2 ? secondary : primary, coreAlpha * (0.28 + drives.bassPulse * 0.54));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  // Treble owns short comets; the all-band tapestry locks them onto the mesh.
  const cometCount = layerPlan.treble + Math.floor(drives.tapestry * 3);
  for (let comet = 0; comet < cometCount; comet += 1) {
    const point = points[comet % points.length];
    const angle = randomUnit(seed, 26_920 + comet) * Math.PI * 2 + time * 0.08;
    const length = unit * (0.012 + drives.trebleLayer * 0.035 + drives.tapestry * 0.018);
    context.strokeStyle = rgba(comet % 3 ? primary : highlight, coreAlpha * (0.16 + drives.treblePulse * 0.64));
    context.lineWidth = Math.max(1, unit * 0.0014);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x - Math.cos(angle) * length, point.y - Math.sin(angle) * length);
    context.stroke();
  }
  context.restore();
}

function chromaCoreAlpha(mix: number, drive = 0): number {
  // Keep state fades mathematically clean while producing colors opaque enough
  // to survive the #ff5a00 Studio key instead of blending back toward orange.
  return clampVisualValue(mix * (0.82 + drive * 0.16), 0, 0.98);
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
  context.fillStyle = rgba(secondary, coreAlpha * 0.86);
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

  context.strokeStyle = rgba(primary, coreAlpha * 0.84);
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
    const color = fleck % 11 === 0 ? highlight : fleck % 2 ? secondary : primary;
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
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const songSection = Math.min(3, Math.floor(drives.progress * 4));
  const identityDensity = radioVisualMusicIntensityPlan(drives).identityDensity;
  const bassThreshold = 0.7 - songSection * 0.012;
  const trebleThreshold = 0.26 + songSection * 0.012;
  const barCount = 2
    + Math.round(identityDensity * 7)
    + Math.floor(
      drives.bassLayer * 6
      + drives.midLayer * 8
      + drives.trebleLayer * 7
      + drives.tapestry * 7
      + drives.build * 3,
    )
    + Math.floor(
      songSection * Math.max(drives.bassLayer, drives.midLayer, drives.trebleLayer, drives.tapestry),
    );
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let bar = 0; bar < barCount; bar += 1) {
    const progress = (bar + 0.5) / barCount;
    const bassBand = progress > bassThreshold;
    const midBand = progress >= trebleThreshold && progress <= bassThreshold;
    const bandDrive = bassBand ? drives.bass : midBand ? drives.mid : drives.treble;
    const bandLayer = bassBand ? drives.bassLayer : midBand ? drives.midLayer : drives.trebleLayer;
    const bandPulse = bassBand ? drives.bassPulse : midBand ? drives.midPulse : drives.treblePulse;
    const pulse = 0.12 + 0.88 * Math.abs(Math.sin(time * (0.55 + bandDrive * 4.1) + bar * 0.71 + randomUnit(seed, 33_100 + bar) * 3));
    const reach = width * (0.008 + bandLayer * 0.145 * pulse + bandPulse * 0.085 + drives.tapestry * 0.028 + drives.tapestryPulse * 0.012);
    const barHeight = Math.max(2, height / barCount * (0.34 + bandLayer * 0.42 + drives.build * 0.08));
    const y = progress * height - barHeight * 0.5;
    const color = drives.treblePulse > 0.78 && bar % 11 === 0 ? highlight : bassBand ? primary : midBand ? secondary : bar % 2 ? primary : secondary;
    context.fillStyle = rgba(color, coreAlpha * (0.12 + bandLayer * 0.54 + pulse * bandLayer * 0.28));
    context.shadowColor = rgba(color, coreAlpha * (0.38 + bandPulse * 0.42));
    context.shadowBlur = unit * (0.003 + bandPulse * 0.011);
    context.fillRect(0, y, reach, barHeight);
    context.fillRect(width - reach, y, reach, barHeight);
    const holdReach = Math.min(width * 0.46, reach + width * (0.004 + bandPulse * 0.045));
    context.fillStyle = rgba(bassBand ? secondary : primary, coreAlpha * (0.08 + bandLayer * 0.2 + bandPulse * 0.48));
    context.fillRect(holdReach, y, Math.max(2, unit * 0.003), barHeight);
    context.fillRect(width - holdReach - Math.max(2, unit * 0.003), y, Math.max(2, unit * 0.003), barHeight);
  }
  context.shadowBlur = 0;
  context.shadowColor = "transparent";

  const bassPlateCount = layerPlan.bass;
  for (let plate = 0; plate < bassPlateCount; plate += 1) {
    const plateY = height * (0.72 + plate / Math.max(1, bassPlateCount) * 0.25);
    const plateReach = width * (0.035 + drives.bassLayer * 0.13 + drives.bassPulse * 0.08) * (1 - plate * 0.08);
    context.fillStyle = rgba(plate % 2 ? secondary : primary, coreAlpha * (0.2 + drives.bassLayer * 0.44));
    context.fillRect(0, plateY, plateReach, Math.max(4, unit * (0.006 + drives.bassPulse * 0.008)));
    context.fillRect(width - plateReach, plateY, plateReach, Math.max(4, unit * (0.006 + drives.bassPulse * 0.008)));
  }

  const midBridgeCount = layerPlan.mid + layerPlan.tapestry;
  for (let bridge = 0; bridge < midBridgeCount; bridge += 1) {
    const bridgeY = height * (0.31 + bridge / Math.max(1, midBridgeCount) * 0.38);
    const bridgeReach = width * (0.05 + drives.midLayer * 0.16 + drives.tapestry * 0.08);
    context.strokeStyle = rgba(bridge % 2 ? primary : secondary, coreAlpha * (0.14 + drives.midPulse * 0.48));
    context.lineWidth = Math.max(2, unit * 0.0025);
    context.beginPath();
    context.moveTo(0, bridgeY);
    context.lineTo(bridgeReach, bridgeY + Math.sin(time + bridge) * unit * drives.midPulse * 0.018);
    context.moveTo(width, bridgeY);
    context.lineTo(width - bridgeReach, bridgeY - Math.sin(time + bridge) * unit * drives.midPulse * 0.018);
    context.stroke();
  }

  const scanCount = layerPlan.treble + Math.floor(drives.tapestry * 2);
  for (let scan = 0; scan < scanCount; scan += 1) {
    const scanY = height * ((time * (0.14 + drives.treble * 0.2) + randomUnit(seed, 33_900 + scan)) % 1);
    const scanColor = drives.treblePulse > 0.8 && scan === 0 ? highlight : scan % 2 ? secondary : primary;
    context.fillStyle = rgba(scanColor, coreAlpha * (0.12 + drives.trebleLayer * 0.34 + drives.treblePulse * 0.48));
    context.fillRect(0, scanY, width * (0.1 + drives.midPulse * 0.14), Math.max(2, unit * 0.003));
    context.fillRect(width * (0.9 - drives.midPulse * 0.14), scanY, width * (0.1 + drives.midPulse * 0.14), Math.max(2, unit * 0.003));
  }
  context.restore();
}

const SIGNAL_GLYPHS = "01アイウエオカキクケコサシスセソZXCVBNM{}[]<>#%";
const TERMINAL_GLYPHS = "01ABCDEF:/\\|_-=+*#%{}[]<>$";

function drawMatrixRain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const matrixTopology = Math.min(3, Math.floor(drives.progress * 4));
  const identityDensity = radioVisualMusicIntensityPlan(drives).identityDensity;
  const fontSize = Math.max(10, unit * (0.011 + drives.bass * 0.004 + drives.bassPulse * 0.005));
  const columns = Math.max(10, Math.floor(width / (fontSize * (1.85 - drives.midLayer * 0.55))));
  const activeColumns = Math.min(
    columns,
    1
      + Math.round(identityDensity * 2)
      + Math.floor((columns - 3) * (drives.midLayer * 0.52 + drives.trebleLayer * 0.12 + drives.tapestry * 0.28 + drives.build * 0.08)),
  );
  context.save();
  context.globalCompositeOperation = "source-over";
  context.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let column = 0; column < activeColumns; column += 1) {
    const bassCascade = (drives.bassLayer * 0.45 + drives.bassPulse * 0.55) * Math.max(0, 1 - Math.abs(column / Math.max(1, activeColumns - 1) - drives.phrase) * 3.4);
    const speed = 0.018 + randomUnit(seed, 34_100 + column) * 0.045 + drives.treble * 0.18 + drives.treblePulse * 0.12;
    const head = ((randomUnit(seed, 34_300 + column) + time * speed + bassCascade * 0.18) % 1.28) * height - height * 0.14;
    const trail = 2 + Math.floor(randomUnit(seed, 34_500 + column) * 3 + drives.midLayer * 11 + drives.build * 2);
    const x = (column + 0.5) / activeColumns * width + Math.sin(time * 0.32 + column) * drives.mid * unit * (0.002 + drives.midLayer * 0.007);
    for (let glyph = 0; glyph < trail; glyph += 1) {
      const glyphIndex = Math.floor(randomUnit(seed + Math.floor(time * 4), column * 37 + glyph) * SIGNAL_GLYPHS.length);
      const y = head - glyph * fontSize * 1.25;
      if (y < -fontSize || y > height + fontSize) continue;
      const fade = 1 - glyph / trail;
      const color = glyph === 0 && drives.treblePulse > 0.66 ? highlight : column % 3 === 0 ? secondary : primary;
      context.fillStyle = rgba(color, coreAlpha * fade * (0.14 + drives.midLayer * 0.42 + drives.trebleLayer * 0.22));
      context.shadowColor = rgba(color, glyph === 0 ? coreAlpha * drives.treblePulse : 0);
      context.shadowBlur = glyph === 0 ? unit * (0.004 + drives.treblePulse * 0.01) : 0;
      context.fillText(SIGNAL_GLYPHS[glyphIndex], x, y);
    }
  }
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  const trebleHeadCount = layerPlan.treble;
  for (let spark = 0; spark < trebleHeadCount; spark += 1) {
    const x = width * (spark + 0.5) / Math.max(1, trebleHeadCount);
    const y = height * ((randomUnit(seed, 34_820 + spark) + time * (0.16 + drives.treblePulse * 0.38)) % 1);
    const glyphIndex = (spark * 11 + matrixTopology) % SIGNAL_GLYPHS.length;
    context.fillStyle = rgba(spark % 3 ? secondary : highlight, coreAlpha * (0.16 + drives.trebleLayer * 0.42 + drives.treblePulse * 0.38));
    context.fillText(SIGNAL_GLYPHS[glyphIndex], x, y);
  }
  const bridgeCount = layerPlan.mid + Math.floor(drives.tapestry * 3);
  for (let bridge = 0; bridge < bridgeCount; bridge += 1) {
    const y = height * ((randomUnit(seed, 34_900 + bridge) + time * 0.025) % 1);
    const reach = width * (0.18 + drives.mid * 0.46);
    const fromRight = bridge % 2 === 1;
    context.fillStyle = rgba(bridge % 2 ? primary : secondary, coreAlpha * (0.18 + drives.midPulse * 0.42));
    context.fillRect(fromRight ? width - reach : 0, y, reach, Math.max(2, unit * 0.003));
  }

  // Bass owns a small number of massive anchor glyphs and a base impact shelf.
  const anchorCount = layerPlan.bass;
  context.font = `900 ${fontSize * (1.35 + drives.bassLayer * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  for (let anchor = 0; anchor < anchorCount; anchor += 1) {
    const x = width * (anchor + 0.5) / Math.max(1, anchorCount);
    const drop = height * ((randomUnit(seed, 35_010 + anchor) + time * (0.02 + drives.bassPulse * 0.05)) % 0.32);
    const y = height * 0.68 + drop;
    context.fillStyle = rgba(anchor % 2 ? secondary : primary, coreAlpha * (0.22 + drives.bassLayer * 0.5));
    context.fillText(SIGNAL_GLYPHS[(anchor * 7 + matrixTopology) % SIGNAL_GLYPHS.length], x, y);
  }
  if (anchorCount > 0) {
    context.fillStyle = rgba(primary, coreAlpha * (0.12 + drives.bassPulse * 0.42));
    context.fillRect(0, height - unit * (0.005 + drives.bassLayer * 0.018), width, unit * (0.005 + drives.bassLayer * 0.018));
  }

  // When all bands arrive, one decrypt front synchronizes the otherwise
  // independent bass, mid, and treble systems.
  if (layerPlan.tapestry > 0) {
    const decryptY = height * ((time * (0.08 + drives.tapestryPulse * 0.18) + drives.phrase) % 1);
    context.fillStyle = rgba(highlight, coreAlpha * (0.08 + drives.tapestry * 0.38 + drives.tapestryPulse * 0.34));
    context.fillRect(0, decryptY, width, Math.max(2, unit * (0.002 + drives.tapestry * 0.006)));
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
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const feedbackTopology = Math.min(3, Math.floor(drives.progress * 4));
  const identityDensity = radioVisualMusicIntensityPlan(drives).identityDensity;
  const centerX = width * (0.48 + feedbackTopology * 0.009 + Math.sin(time * 0.13) * (drives.mid * 0.006 + drives.midLayer * 0.049));
  const centerY = height * (0.49 + (feedbackTopology % 2) * 0.02 + Math.cos(time * 0.11) * drives.midLayer * 0.032);
  const frameCount = 1
    + Math.round(identityDensity)
    + layerPlan.mid
    + layerPlan.tapestry
    + Math.floor(drives.build * 2);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let frame = 0; frame < frameCount; frame += 1) {
    const depth = (frame / frameCount + time * (0.018 + drives.bass * 0.08) + drives.bassPulse * 0.14) % 1;
    const bassExpansion = 0.74 + drives.bassLayer * 0.3 + drives.bassPulse * 0.16;
    const frameWidth = width * (0.08 + depth * 0.82) * bassExpansion;
    const frameHeight = height * (0.07 + depth * 0.75) * bassExpansion;
    const skew = Math.sin(time * 0.21 + frame * 0.81) * drives.midLayer * unit * 0.065;
    const color = drives.treblePulse > 0.76 && frame % 5 === 0 ? highlight : frame % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.16 + drives.midLayer * 0.38 + depth * 0.22 + drives.tapestry * 0.16));
    context.lineWidth = Math.max(2, unit * (0.002 + depth * 0.007 + drives.bassLayer * 0.008 + drives.bassPulse * 0.008));
    context.beginPath();
    context.moveTo(centerX - frameWidth * 0.5 + skew, centerY - frameHeight * 0.5);
    context.lineTo(centerX + frameWidth * 0.5 + skew * 0.32, centerY - frameHeight * 0.5);
    context.lineTo(centerX + frameWidth * 0.5 - skew, centerY + frameHeight * 0.5);
    context.lineTo(centerX - frameWidth * 0.5 - skew * 0.32, centerY + frameHeight * 0.5);
    context.closePath();
    context.stroke();
    if (drives.bassLayer > 0.08 && frame % 2 === 0) {
      context.strokeStyle = rgba(secondary, coreAlpha * drives.bassLayer * 0.12);
      context.lineWidth += unit * drives.bassLayer * 0.012;
      context.stroke();
    }
  }

  const tearCount = layerPlan.treble + Math.floor(drives.tapestry * 2);
  for (let tear = 0; tear < tearCount; tear += 1) {
    const y = height * ((randomUnit(seed, 35_100 + tear) + time * (0.035 + tear * 0.006)) % 1);
    const displacement = width * (drives.treble * 0.7 + drives.treblePulse * 0.5) * (0.03 + randomUnit(seed, 35_200 + tear) * 0.11);
    const color = drives.treblePulse > 0.8 && tear === 0 ? highlight : tear % 2 ? primary : secondary;
    context.fillStyle = rgba(color, coreAlpha * (0.58 + drives.treblePulse * 0.34));
    context.fillRect(width * 0.03 + displacement, y, width * (0.46 + randomUnit(seed, 35_300 + tear) * 0.48) - displacement, Math.max(4, unit * (0.005 + drives.treble * 0.012)));
  }

  const blockCount = layerPlan.bass + Math.floor(drives.tapestry * 4);
  for (let block = 0; block < blockCount; block += 1) {
    const blockWidth = width / blockCount * (0.42 + randomUnit(seed, 35_500 + block) * 0.52);
    const blockHeight = unit * (0.006 + randomUnit(seed, 35_600 + block) * 0.018 + drives.bassLayer * 0.036 + drives.bassPulse * 0.032);
    context.fillStyle = rgba(drives.treblePulse > 0.82 && block % 7 === 0 ? highlight : block % 2 ? secondary : primary, coreAlpha * 0.76);
    context.fillRect(block / blockCount * width, height - blockHeight, blockWidth, blockHeight);
  }
  if (drives.midPulse > 0.58) {
    const spliceY = height * (0.16 + randomUnit(seed + Math.floor(time * 2), 35_901) * 0.68);
    const split = width * (0.08 + drives.midPulse * 0.14);
    context.fillStyle = rgba(secondary, coreAlpha * drives.midPulse * 0.68);
    context.fillRect(0, spliceY, width * 0.5 - split, Math.max(3, unit * 0.006));
    context.fillStyle = rgba(primary, coreAlpha * drives.midPulse * 0.68);
    context.fillRect(width * 0.5 + split, spliceY, width * 0.5 - split, Math.max(3, unit * 0.006));
  }
  if (layerPlan.tapestry > 0) {
    const afterimageCount = layerPlan.tapestry;
    for (let echo = 0; echo < afterimageCount; echo += 1) {
      const inset = unit * (0.025 + echo * 0.028 + drives.tapestryPulse * 0.018);
      context.strokeStyle = rgba(echo % 2 ? primary : secondary, coreAlpha * drives.tapestry * (0.18 - echo * 0.025));
      context.lineWidth = Math.max(2, unit * 0.0025);
      context.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    }
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
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const terminalLayout = Math.min(3, Math.floor(drives.progress * 4));
  const identityDensity = radioVisualMusicIntensityPlan(drives).identityDensity;
  const columns = 30;
  const activeRows = 1
    + Math.round(identityDensity * 2)
    + Math.floor(drives.midLayer * 8 + drives.tapestry * 5 + drives.build * 2);
  const fontSize = Math.max(9, unit * (0.011 + drives.bass * 0.004 + drives.bassLayer * 0.004 + drives.bassPulse * 0.003));
  context.save();
  context.globalCompositeOperation = "source-over";
  context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let row = 0; row < activeRows; row += 1) {
    const direction = (row + terminalLayout) % 2 === 0 ? 1 : -1;
    const activity = drives.midLayer * 0.58 + drives.midPulse * 0.24 + drives.tapestry * 0.18;
    const cursor = Math.floor(((time * (0.7 + drives.treble * 7 + drives.treblePulse * 6) * direction + row * 1.7) % columns + columns) % columns);
    const span = 2 + Math.floor(activity * 18 + randomUnit(seed, 36_100 + row) * (1 + drives.trebleLayer * 4));
    const y = height * (row + 0.5) / activeRows;
    const bassIndent = Math.floor(drives.bassPulse * 5) * (row % 3 === 0 ? 1 : 0);
    for (let step = 0; step < span; step += 1) {
      const column = (cursor - direction * step + bassIndent + columns) % columns;
      const x = width * (column + 0.5) / columns;
      const glyphIndex = Math.floor(randomUnit(seed + Math.floor(time * (3 + drives.treblePulse * 8)), row * 101 + column) * TERMINAL_GLYPHS.length);
      const fade = 1 - step / Math.max(1, span);
      const color = step === 0 && drives.treblePulse > 0.72 ? highlight : row % 3 === 0 ? secondary : primary;
      context.fillStyle = rgba(color, coreAlpha * (0.1 + fade * (0.24 + drives.midLayer * 0.38 + drives.trebleLayer * 0.2)));
      context.fillText(TERMINAL_GLYPHS[glyphIndex], x, y);
    }
  }
  const paneCount = layerPlan.mid + Math.floor(drives.tapestry * 2);
  for (let pane = 0; pane < paneCount; pane += 1) {
    const inset = unit * (0.025 + pane * 0.028);
    const paneWidth = width * (0.08 + drives.mid * 0.1 + drives.midLayer * 0.12);
    const y = height * (0.12 + pane / Math.max(1, paneCount - 1) * 0.76);
    const color = pane % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.12 + drives.midLayer * 0.32 + drives.midPulse * 0.4));
    context.lineWidth = Math.max(2, unit * (0.0015 + drives.bassLayer * 0.004));
    context.strokeRect(pane % 2 ? width - inset - paneWidth : inset, y - unit * 0.02, paneWidth, unit * (0.025 + drives.bass * 0.03 + drives.bassLayer * 0.055 + drives.bassPulse * 0.02));
  }

  // Bass stamps heavyweight prompt/header blocks into the terminal rather
  // than only nudging text columns.
  const promptCount = layerPlan.bass;
  for (let prompt = 0; prompt < promptCount; prompt += 1) {
    const y = prompt % 2 === 0
      ? unit * (0.025 + prompt * 0.018)
      : height - unit * (0.04 + prompt * 0.018);
    const reach = width * (0.12 + drives.bassLayer * 0.24 + drives.bassPulse * 0.12);
    const color = prompt % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.18 + drives.bassLayer * 0.44));
    context.fillRect(prompt % 2 ? width - reach : 0, y, reach, Math.max(4, unit * (0.006 + drives.bassPulse * 0.012)));
  }

  const cursorSparkCount = layerPlan.treble;
  for (let spark = 0; spark < cursorSparkCount; spark += 1) {
    const x = width * ((randomUnit(seed, 37_020 + spark) + time * (0.12 + drives.treble * 0.38)) % 1);
    const y = height * randomUnit(seed, 37_090 + spark);
    context.fillStyle = rgba(spark % 4 ? primary : highlight, coreAlpha * (0.14 + drives.treblePulse * 0.58));
    context.fillText(TERMINAL_GLYPHS[(spark * 5 + terminalLayout) % TERMINAL_GLYPHS.length], x, y);
  }
  if (drives.midPulse > 0.56) {
    const commitY = height * ((randomUnit(seed, 37_300) + time * 0.04) % 1);
    const reach = width * (0.18 + drives.midPulse * 0.34);
    context.fillStyle = rgba(secondary, coreAlpha * (0.34 + drives.midPulse * 0.38));
    context.fillRect(0, commitY, reach, Math.max(3, unit * 0.005));
    context.fillStyle = rgba(primary, coreAlpha * (0.34 + drives.midPulse * 0.38));
    context.fillRect(width - reach, commitY, reach, Math.max(3, unit * 0.005));
  }
  if (layerPlan.tapestry > 0) {
    const executeY = height * ((time * (0.045 + drives.tapestryPulse * 0.12) + drives.progress) % 1);
    context.fillStyle = rgba(highlight, coreAlpha * (0.08 + drives.tapestry * 0.34 + drives.tapestryPulse * 0.28));
    context.fillRect(0, executeY, width, Math.max(2, unit * (0.002 + drives.tapestry * 0.005)));
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
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const waveformTopology = Math.min(3, Math.floor(drives.progress * 4));
  const ribbonCount = 1 + layerPlan.mid + Math.min(3, layerPlan.tapestry) + Math.floor(drives.build);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let ribbon = 0; ribbon < ribbonCount; ribbon += 1) {
    const baseY = height * (ribbon + 1) / (ribbonCount + 1);
    const amplitude = height * (0.006 + drives.mid * 0.01 + drives.midLayer * 0.075 + drives.midPulse * 0.055 + ribbon * 0.002);
    const thickness = unit * (0.0025 + drives.bass * 0.003 + drives.bassLayer * 0.023 + drives.bassPulse * 0.018 + ribbon * 0.001);
    const cycles = 2 + waveformTopology + ribbon * 1.6 + drives.trebleLayer * 9 + drives.treblePulse * 7;
    const phase = time * (0.95 + ribbon * 0.18) * (ribbon % 2 ? -1 : 1) + randomUnit(seed, 38_100 + ribbon) * Math.PI * 2;
    const color = drives.treblePulse > 0.8 && ribbon === ribbonCount - 1 ? highlight : ribbon % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.18 + drives.midLayer * 0.48 + drives.bassLayer * 0.22 + drives.tapestry * 0.16));
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

  // A slow, wide bass carrier arrives as its own tube beneath the faster
  // mid-owned ribbons.
  if (layerPlan.bass > 0) {
    const carrierY = height * (0.5 + Math.sin(time * 0.17) * drives.bassPulse * 0.06);
    const carrierAmplitude = height * (0.008 + drives.bass * 0.008 + drives.bassLayer * 0.027);
    context.strokeStyle = rgba(primary, coreAlpha * (0.1 + drives.bassLayer * 0.34 + drives.bassPulse * 0.28));
    context.shadowColor = rgba(primary, coreAlpha * drives.bassLayer * 0.42);
    context.shadowBlur = unit * (0.004 + drives.bassLayer * 0.018);
    context.lineWidth = Math.max(4, unit * (0.006 + drives.bassLayer * 0.028));
    context.beginPath();
    for (let step = 0; step <= 40; step += 1) {
      const progress = step / 40;
      const y = carrierY + Math.sin(progress * Math.PI * (2 + waveformTopology) + time * 0.42) * carrierAmplitude;
      if (step === 0) context.moveTo(0, y);
      else context.lineTo(width * progress, y);
    }
    context.stroke();
  }
  context.shadowBlur = 0;
  context.shadowColor = "transparent";

  const gateCount = layerPlan.bass
    + Math.min(3, layerPlan.mid)
    + Math.min(3, layerPlan.tapestry);
  for (let gate = 0; gate < gateCount; gate += 1) {
    const x = width * (0.08 + gate / Math.max(1, gateCount - 1) * 0.84);
    const gateHeight = height * (0.06 + randomUnit(seed, 38_400 + gate) * 0.2 + drives.midPulse * 0.16);
    const color = drives.treblePulse > 0.76 && gate % 4 === 0 ? highlight : gate % 3 === 0 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.56 + drives.midPulse * 0.32));
    context.fillRect(x, height * 0.5 - gateHeight * 0.5, Math.max(4, unit * (0.004 + drives.bassPulse * 0.012)), gateHeight);
  }

  const harmonicCount = layerPlan.treble;
  context.shadowBlur = 0;
  for (let harmonic = 0; harmonic < harmonicCount; harmonic += 1) {
    const baseY = height * (harmonic + 1) / (harmonicCount + 1);
    const cycles = 8 + harmonic * 2 + drives.treble * 10;
    context.strokeStyle = rgba(harmonic % 3 ? secondary : highlight, coreAlpha * (0.1 + drives.trebleLayer * 0.34 + drives.treblePulse * 0.3));
    context.lineWidth = Math.max(1, unit * 0.0013);
    context.beginPath();
    for (let step = 0; step <= 32; step += 1) {
      const progress = step / 32;
      const y = baseY + Math.sin(progress * Math.PI * cycles + time * 1.8) * unit * (0.003 + drives.treblePulse * 0.009);
      if (step === 0) context.moveTo(0, y);
      else context.lineTo(width * progress, y);
    }
    context.stroke();
  }

  const knotCount = layerPlan.tapestry;
  for (let knot = 0; knot < knotCount; knot += 1) {
    const x = width * (knot + 1) / (knotCount + 1);
    const y = height * (0.5 + Math.sin(time * 0.38 + knot) * 0.16);
    const radius = unit * (0.006 + drives.tapestry * 0.014 + drives.tapestryPulse * 0.01);
    context.fillStyle = rgba(knot % 2 ? secondary : primary, coreAlpha * (0.18 + drives.tapestry * 0.48));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
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
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const routingMode = Math.min(3, Math.floor(drives.progress * 4));
  const railCount = 1
    + layerPlan.mid
    + layerPlan.tapestry
    + Math.floor(drives.tapestry * 3 + drives.build);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let rail = 0; rail < railCount; rail += 1) {
    const railProgress = rail / Math.max(1, railCount - 1);
    const y = height * (0.15 + railProgress * 0.7 + Math.sin(time * 0.12 + rail) * drives.mid * (0.008 + drives.midLayer * 0.026));
    const color = rail === 1 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.16 + drives.midLayer * 0.42 + drives.tapestry * 0.18));
    context.shadowColor = rgba(color, coreAlpha * drives.bassLayer * 0.52);
    context.shadowBlur = unit * (0.002 + drives.bassLayer * 0.024);
    context.lineWidth = Math.max(3, unit * (0.003 + drives.bass * 0.004 + drives.bassLayer * 0.012 + drives.bassPulse * 0.01));
    context.beginPath();
    context.moveTo(width * 0.04, y);
    context.lineTo(width * (0.22 + railProgress * 0.14), y);
    const routeDirection = routingMode % 2 === 0 ? 1 : -1;
    const routeOffset = (railProgress - 0.5) * routeDirection * unit * (0.035 + routingMode * 0.014 + drives.midLayer * 0.08 + drives.midPulse * 0.14);
    context.lineTo(width * (0.36 + railProgress * 0.16), y + routeOffset);
    context.lineTo(width * 0.96, y + routeOffset);
    context.stroke();
    const nodeX = width * (0.28 + railProgress * 0.22);
    const nodeSize = unit * (0.008 + drives.midLayer * 0.008 + drives.bassLayer * 0.025 + drives.bassPulse * 0.016);
    context.fillStyle = rgba(rail % 2 ? primary : secondary, coreAlpha * (0.18 + drives.midLayer * 0.3 + drives.midPulse * 0.44 + drives.bassLayer * 0.18));
    context.fillRect(nodeX - nodeSize * 0.5, y - nodeSize * 0.5, nodeSize, nodeSize);
    if (layerPlan.bass > 0) {
      radialLight(context, width, height, nodeX, y, nodeSize * (3 + drives.bassPulse * 2), rail % 2 ? primary : secondary, coreAlpha * drives.bassLayer * 0.3);
    }
  }
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  const reservoirCount = layerPlan.bass;
  for (let reservoir = 0; reservoir < reservoirCount; reservoir += 1) {
    const x = width * (reservoir + 1) / (reservoirCount + 1);
    const y = height * (reservoir % 2 === 0 ? 0.82 : 0.18);
    const radius = unit * (0.009 + drives.bassLayer * 0.016 + drives.bassPulse * 0.012);
    const color = reservoir % 2 ? secondary : primary;
    radialLight(context, width, height, x, y, radius * 4.2, color, coreAlpha * drives.bassLayer * 0.28);
    context.fillStyle = rgba(color, coreAlpha * (0.18 + drives.bassLayer * 0.34 + drives.bassPulse * 0.38));
    context.fillRect(x - radius, y - radius * 0.45, radius * 2, radius * 0.9);
  }
  if (layerPlan.tapestry > 0) {
    const networkCouplingX = width * (0.5 + Math.sin(time * 0.18) * drives.tapestry * 0.035);
    context.shadowBlur = 0;
    context.shadowColor = "transparent";
    context.strokeStyle = rgba(highlight, coreAlpha * (0.08 + drives.tapestry * 0.32));
    context.lineWidth = Math.max(2, unit * (0.002 + drives.tapestry * 0.004));
    context.beginPath();
    for (let node = 0; node < railCount; node += 1) {
      const y = height * (0.15 + node / Math.max(1, railCount - 1) * 0.7);
      const x = networkCouplingX + Math.sin(time * 0.31 + node * 1.7) * unit * drives.tapestry * 0.025;
      if (node === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.restore();

  // Treble owns the sharp discharge; bass visibly charges conduits and
  // reservoirs first without masquerading as a high-frequency bolt.
  const current = drives.treble * 0.06 + drives.trebleLayer * 0.3 + drives.treblePulse * 0.76;
  if (layerPlan.treble > 0 && current > 0.08) {
    drawLightningTree(context, width, height, seed + Math.floor(time * (0.8 + drives.treblePulse * 4.2)) * 131, mix * current, primary, secondary, highlight);
  }
  if (layerPlan.tapestry > 0 && drives.tapestryPulse > 0.22) {
    const networkDischarge = clampVisualValue(drives.tapestry * 0.2 + drives.tapestryPulse * 0.78 + drives.impact * 0.08);
    drawLightningTree(context, width, height, seed + 71_901 + Math.floor(time * (2.2 + networkDischarge * 3.1)) * 191, mix * networkDischarge, secondary, primary, highlight);
  }
}

function drawPixelSortStorm(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const sortPass = Math.min(3, Math.floor(drives.progress * 4));
  const identityDensity = radioVisualMusicIntensityPlan(drives).identityDensity;
  const tick = Math.floor(time * (0.8 + drives.treble * 9 + drives.treblePulse * 15));
  const sliceCount = 1
    + Math.round(identityDensity * 2)
    + layerPlan.treble
    + Math.floor(drives.tapestry * 10 + drives.build * 2);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (let slice = 0; slice < sliceCount; slice += 1) {
    const localSeed = seed + tick * 97 + slice * 13;
    const y = height * randomUnit(localSeed, 39_100 + slice);
    const sliceHeight = Math.max(2, unit * (0.002 + randomUnit(localSeed, 39_200 + slice) * 0.014));
    const fromRight = (randomUnit(localSeed, 39_300 + slice) > 0.5) !== (sortPass % 2 === 1);
    const pulse = drives.trebleLayer * 0.42 + drives.treblePulse * 0.58;
    const length = width * (0.012 + randomUnit(localSeed, 39_400 + slice) * (0.05 + pulse * 0.5 + drives.midPulse * 0.16));
    const inset = width * randomUnit(localSeed, 39_500 + slice) * (0.03 + drives.mid * 0.08 + drives.midLayer * 0.18);
    const color = drives.treblePulse > 0.82 && slice % 13 === 0 ? highlight : slice % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.1 + drives.trebleLayer * 0.38 + drives.treblePulse * 0.26 + randomUnit(localSeed, 39_600 + slice) * 0.18));
    context.fillRect(fromRight ? width - inset - length : inset, y, length, sliceHeight);
  }
  const smearCount = layerPlan.bass + Math.floor(drives.tapestry * 3);
  for (let column = 0; column < smearCount; column += 1) {
    const x = width * randomUnit(seed, 39_800 + column);
    const speed = 0.04 + randomUnit(seed, 39_900 + column) * 0.09 + drives.bass * 0.08;
    const y = height * ((randomUnit(seed, 40_000 + column) + time * speed) % 1);
    const color = drives.treblePulse > 0.78 && column % 5 === 0 ? highlight : column % 2 ? primary : secondary;
    context.fillStyle = rgba(color, coreAlpha * (0.12 + drives.bassLayer * 0.52 + drives.bassPulse * 0.24));
    context.fillRect(x, y, Math.max(3, unit * (0.004 + drives.bassLayer * 0.024 + drives.bassPulse * 0.012)), unit * (0.018 + drives.bass * 0.04 + drives.bassLayer * 0.18 + drives.bassPulse * 0.12));
  }
  const bandCount = layerPlan.mid + Math.floor(drives.tapestry * 3);
  for (let band = 0; band < bandCount; band += 1) {
    const y = height * randomUnit(seed, 40_300 + band);
    const bandHeight = unit * (0.006 + drives.mid * 0.012 + drives.midLayer * 0.042);
    const offset = width * Math.sin(time * 0.42 + band) * (drives.midLayer * 0.08 + drives.midPulse * 0.18);
    const color = band % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.2 + drives.midPulse * 0.42));
    context.fillRect(offset - width * 0.08, y, width * 1.16, bandHeight);
  }
  if (layerPlan.tapestry > 0) {
    const surge = ((time * (0.06 + drives.tapestryPulse * 0.14) + sortPass * 0.17) % 1.3) - 0.15;
    const surgeY = height * surge;
    const surgeHeight = unit * (0.018 + drives.tapestry * 0.07);
    context.fillStyle = rgba(highlight, coreAlpha * (0.06 + drives.tapestry * 0.24 + drives.tapestryPulse * 0.28));
    context.fillRect(0, surgeY, width, surgeHeight);
    context.fillStyle = rgba(primary, coreAlpha * drives.tapestry * 0.18);
    context.fillRect(width * 0.08, surgeY + surgeHeight, width * 0.84, Math.max(2, unit * 0.004));
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
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const identityDensity = radioVisualMusicIntensityPlan(drives).identityDensity;
  const beamCount = 1
    + Math.round(identityDensity)
    + layerPlan.mid
    + Math.floor(drives.tapestry * 5)
    + Math.floor(drives.build * 2);
  const topology = Math.floor(drives.progress * 4) % 3;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "square";
  for (let beam = 0; beam < beamCount; beam += 1) {
    const direction = beam % 2 === 0 ? 1 : -1;
    const travel = ((time * (0.012 + drives.treble * 0.1 + drives.treblePulse * 0.1) * direction + randomUnit(seed, 41_100 + beam)) % 1.4 + 1.4) % 1.4;
    const startY = height * (travel - 0.2);
    const baseSlope = topology === 0 ? 0.18 : topology === 1 ? 0.42 : 0.7;
    const slope = height * (baseSlope + randomUnit(seed, 41_200 + beam) * 0.18) * direction;
    const color = drives.treblePulse > 0.8 && beam % 9 === 0 ? highlight : beam % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.1 + drives.midLayer * 0.5 + drives.midPulse * 0.16 + drives.impact * 0.08));
    context.shadowColor = rgba(color, coreAlpha * (0.28 + drives.treblePulse * 0.48));
    context.shadowBlur = unit * (0.003 + drives.treblePulse * 0.012);
    context.lineWidth = Math.max(1.5, unit * (0.0015 + drives.bass * 0.0015 + drives.bassLayer * 0.004 + drives.bassPulse * 0.003));
    context.beginPath();
    context.moveTo(-width * 0.08, startY - slope * 0.5);
    context.lineTo(width * 1.08, startY + slope * 0.5);
    context.stroke();
  }
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  const nodeCount = layerPlan.mid + Math.floor(drives.tapestry * 4);
  for (let pulse = 0; pulse < nodeCount; pulse += 1) {
    const x = width * ((time * (0.04 + drives.mid * 0.08) + randomUnit(seed, 41_500 + pulse)) % 1);
    const y = height * randomUnit(seed, 41_600 + pulse);
    const color = pulse % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.22 + drives.midPulse * 0.5));
    const nodeSize = unit * (0.006 + drives.bassLayer * 0.026 + drives.bassPulse * 0.024);
    context.fillRect(x - nodeSize * 0.5, y - Math.max(2, unit * 0.002), nodeSize, Math.max(3, unit * 0.004));
  }

  // Bass reveals dim structural depth planes behind the mid-frequency
  // lattice; they pulse in width but do not become razor scanner rays.
  const depthPlaneCount = layerPlan.bass;
  for (let plane = 0; plane < depthPlaneCount; plane += 1) {
    const y = height * (plane + 1) / (depthPlaneCount + 1);
    const tilt = unit * (0.05 + plane * 0.018) * (topology === 1 ? -1 : 1);
    const color = plane % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.08 + drives.bassLayer * 0.24 + drives.bassPulse * 0.18));
    context.shadowColor = rgba(color, coreAlpha * drives.bassLayer * 0.32);
    context.shadowBlur = unit * (0.012 + drives.bassLayer * 0.025);
    context.lineWidth = Math.max(5, unit * (0.008 + drives.bassLayer * 0.025));
    context.beginPath();
    context.moveTo(0, y - tilt);
    context.lineTo(width, y + tilt);
    context.stroke();
  }
  context.shadowBlur = 0;
  context.shadowColor = "transparent";

  if (layerPlan.treble > 0) {
    const shutterX = width * ((time * (0.24 + drives.treblePulse * 0.42)) % 1);
    context.fillStyle = rgba(secondary, coreAlpha * (drives.trebleLayer * 0.24 + drives.treblePulse * 0.52));
    context.fillRect(shutterX, 0, Math.max(2, unit * 0.003), height);
  }

  if (layerPlan.tapestry > 0) {
    const cageRadius = unit * (0.12 + drives.tapestry * 0.24 + drives.tapestryPulse * 0.05);
    const sides = 4 + topology + Math.floor(drives.tapestry * 3);
    context.strokeStyle = rgba(highlight, coreAlpha * (0.08 + drives.tapestry * 0.34 + drives.tapestryPulse * 0.3));
    context.shadowColor = rgba(highlight, coreAlpha * (0.14 + drives.tapestry * 0.28));
    context.lineWidth = Math.max(2, unit * 0.0025);
    context.shadowBlur = unit * (0.004 + drives.tapestryPulse * 0.012);
    context.beginPath();
    for (let side = 0; side <= sides; side += 1) {
      const angle = time * 0.055 + side / sides * Math.PI * 2;
      const x = width * 0.5 + Math.cos(angle) * cageRadius;
      const y = height * 0.5 + Math.sin(angle) * cageRadius * 0.72;
      if (side === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
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
  layerPlan: RadioVisualMusicSceneLayerPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const pressureMode = Math.min(3, Math.floor(drives.progress * 4));
  const identityDensity = radioVisualMusicIntensityPlan(drives).identityDensity;
  const pressure = clampVisualValue(drives.bass * 0.18 + drives.bassLayer * 0.58 + drives.bassPulse * 0.34 + drives.build * 0.08);
  const count = 2
    + Math.round(identityDensity * 4)
    + Math.floor(drives.body * 10 + drives.tapestry * 23 + drives.build * 6)
    + Math.max(layerPlan.mid, Math.floor(drives.midLayer * 18))
    + Math.max(layerPlan.treble, Math.floor(drives.trebleLayer * 24))
    + layerPlan.tapestry;
  context.save();
  for (let particle = 0; particle < count; particle += 1) {
    const fromRight = (randomUnit(seed, 42_100 + particle) > 0.5) !== (pressureMode === 1 || (pressureMode === 3 && particle % 3 === 0));
    const lane = randomUnit(seed, 42_200 + particle);
    const speed = 0.012 + randomUnit(seed, 42_300 + particle) * 0.035 + drives.treble * 0.08 + drives.trebleLayer * 0.09;
    const travel = (randomUnit(seed, 42_400 + particle) + time * speed + drives.bassPulse * 0.08) % 1;
    const reach = width * (0.025 + pressure * 0.42);
    const x = fromRight ? width - travel * reach : travel * reach;
    const curl = Math.sin(time * (0.22 + drives.mid * 0.9) + particle) * unit * (drives.midLayer * 0.035 + drives.midPulse * 0.055);
    const y = lane * height + curl;
    const length = unit * (0.003 + randomUnit(seed, 42_500 + particle) * (0.008 + drives.trebleLayer * 0.018) + drives.treblePulse * 0.026);
    const color = drives.treblePulse > 0.82 && particle % 17 === 0 ? highlight : particle % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.1 + drives.body * 0.16 + drives.trebleLayer * 0.28 + (1 - travel) * drives.bassPulse * 0.28));
    context.fillRect(fromRight ? x - length : x, y, length, Math.max(2, unit * 0.0025));
  }
  const frontCount = layerPlan.bass + Math.floor(drives.tapestry * 2);
  for (let front = 0; front < frontCount; front += 1) {
    const frontProgress = (front + 1) / (frontCount + 1);
    const x = width * (0.025 + pressure * 0.3 * frontProgress);
    const color = front % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.1 + drives.bassLayer * 0.34 + drives.bassPulse * 0.46));
    context.lineWidth = Math.max(2, unit * (0.002 + drives.bassLayer * 0.009 + drives.bassPulse * 0.007));
    context.beginPath();
    context.moveTo(x, 0);
    context.bezierCurveTo(x + drives.midPulse * unit * 0.04, height * 0.32, x - drives.midPulse * unit * 0.04, height * 0.68, x, height);
    context.stroke();
    context.beginPath();
    context.moveTo(width - x, 0);
    context.bezierCurveTo(width - x - drives.midPulse * unit * 0.04, height * 0.32, width - x + drives.midPulse * unit * 0.04, height * 0.68, width - x, height);
    context.stroke();
  }
  if (layerPlan.tapestry > 0) {
    const breath = 0.5 + 0.5 * Math.sin(time * (0.22 + drives.tapestryPulse * 0.34));
    const radiusX = width * (0.1 + drives.tapestry * 0.28 + breath * 0.04);
    const radiusY = height * (0.08 + drives.tapestry * 0.22 + breath * 0.035);
    context.strokeStyle = rgba(highlight, coreAlpha * (0.06 + drives.tapestry * 0.26 + drives.tapestryPulse * 0.3));
    context.lineWidth = Math.max(2, unit * (0.002 + drives.tapestry * 0.005));
    context.beginPath();
    context.ellipse(width * 0.5, height * 0.5, radiusX, radiusY, time * 0.035, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function perimeterRectanglePoint(
  progress: number,
  width: number,
  height: number,
  inset: number,
): { x: number; y: number } {
  const safeWidth = Math.max(1, width - inset * 2);
  const safeHeight = Math.max(1, height - inset * 2);
  const perimeter = (safeWidth + safeHeight) * 2;
  let distance = (((progress % 1) + 1) % 1) * perimeter;
  if (distance <= safeWidth) return { x: inset + distance, y: inset };
  distance -= safeWidth;
  if (distance <= safeHeight) return { x: width - inset, y: inset + distance };
  distance -= safeHeight;
  if (distance <= safeWidth) return { x: width - inset - distance, y: height - inset };
  distance -= safeWidth;
  return { x: inset, y: height - inset - distance };
}

function drawMusicPerimeterIdentity(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  plan: RadioVisualMusicPerimeterPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const edgeX = width * plan.reach;
  const edgeY = unit * plan.reach;
  const lineWidth = Math.max(2.5, unit * plan.thickness);
  const coreAlpha = clampVisualValue(chromaCoreAlpha(mix, drives.presence) * plan.strength * 1.24, 0, 0.96);
  const colors: Rgb[] = [primary, secondary, highlight];
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "square";
  context.lineJoin = "miter";

  if (plan.motif === "edge_bars") {
    const barCount = plan.bassElements + plan.midElements + plan.trebleElements;
    for (let bar = 0; bar < barCount; bar += 1) {
      const progress = (bar + 0.5) / barCount;
      const bassBand = progress > 0.68;
      const trebleBand = progress < 0.3;
      const drive = bassBand ? plan.bassDrive : trebleBand ? plan.trebleDrive : plan.midDrive;
      const color = bassBand ? primary : trebleBand ? highlight : secondary;
      const pulse = 0.54 + 0.46 * Math.abs(Math.sin(time * (0.72 + drive * 2.8) + bar * 0.91));
      const reach = edgeX * (0.38 + drive * 0.62) * pulse;
      const barHeight = Math.max(3, height / barCount * (0.3 + drive * 0.28));
      const y = progress * height - barHeight * 0.5;
      context.fillStyle = rgba(color, coreAlpha * (0.62 + drive * 0.28));
      context.fillRect(0, y, reach, barHeight);
      context.fillRect(width - reach, y, reach, barHeight);
    }
    for (let lock = 0; lock < plan.tapestryElements; lock += 1) {
      const x = width * (lock + 1) / (plan.tapestryElements + 1);
      context.fillStyle = rgba(highlight, coreAlpha * (0.34 + plan.tapestryDrive * 0.42));
      context.fillRect(x, 0, Math.max(2, lineWidth * 0.45), edgeY * (0.35 + plan.tapestryDrive * 0.45));
      context.fillRect(x, height - edgeY * (0.35 + plan.tapestryDrive * 0.45), Math.max(2, lineWidth * 0.45), edgeY * (0.35 + plan.tapestryDrive * 0.45));
    }
  } else if (plan.motif === "ribbon_rails") {
    const railCount = plan.midElements;
    for (let rail = 0; rail < railCount; rail += 1) {
      const top = rail % 2 === 0;
      const lane = Math.floor(rail / 2) + 1;
      const baseY = top ? edgeY * lane / (Math.ceil(railCount / 2) + 1) : height - edgeY * lane / (Math.floor(railCount / 2) + 1);
      const amplitude = edgeY * (0.06 + plan.midDrive * 0.18);
      const cycles = 3 + rail + plan.trebleDrive * 8;
      context.strokeStyle = rgba(rail % 3 === 0 ? highlight : rail % 2 ? secondary : primary, coreAlpha * (0.48 + plan.midDrive * 0.38));
      context.lineWidth = lineWidth * (0.52 + plan.bassDrive * 0.72);
      context.beginPath();
      for (let step = 0; step <= 48; step += 1) {
        const progress = step / 48;
        const y = baseY + Math.sin(progress * Math.PI * cycles + time * (0.9 + plan.trebleDrive * 1.6) + rail) * amplitude;
        if (step === 0) context.moveTo(0, y);
        else context.lineTo(width * progress, y);
      }
      context.stroke();
      const beadX = width * ((time * (0.045 + plan.trebleDrive * 0.16) + rail / railCount) % 1);
      context.fillStyle = rgba(highlight, coreAlpha * (0.52 + plan.trebleDrive * 0.42));
      context.fillRect(beadX - lineWidth, baseY - lineWidth * 0.4, lineWidth * 2, lineWidth * 0.8);
    }
  } else if (plan.motif === "feedback_corners") {
    const frameCount = Math.min(7, 2 + plan.midElements + plan.tapestryElements);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const depth = (frame + 1) / (frameCount + 1);
      const insetX = edgeX * depth;
      const insetY = edgeY * depth;
      const color = colors[frame % colors.length];
      const jitter = Math.sin(time * (0.34 + plan.trebleDrive * 0.42) + frame * 1.7) * unit * plan.midDrive * 0.008;
      context.strokeStyle = rgba(color, coreAlpha * (0.48 + plan.midDrive * 0.3));
      context.lineWidth = lineWidth * (0.48 + plan.bassDrive * 0.76) * (1 - depth * 0.28);
      const cornerWidth = Math.max(unit * 0.035, edgeX * (0.46 - depth * 0.12));
      const cornerHeight = Math.max(unit * 0.035, edgeY * (0.55 - depth * 0.12));
      context.beginPath();
      context.moveTo(insetX + cornerWidth + jitter, insetY);
      context.lineTo(insetX + jitter, insetY);
      context.lineTo(insetX - jitter, insetY + cornerHeight);
      context.moveTo(width - insetX - cornerWidth + jitter, insetY);
      context.lineTo(width - insetX - jitter, insetY);
      context.lineTo(width - insetX + jitter, insetY + cornerHeight);
      context.moveTo(insetX - jitter, height - insetY - cornerHeight);
      context.lineTo(insetX + jitter, height - insetY);
      context.lineTo(insetX + cornerWidth - jitter, height - insetY);
      context.moveTo(width - insetX + jitter, height - insetY - cornerHeight);
      context.lineTo(width - insetX - jitter, height - insetY);
      context.lineTo(width - insetX - cornerWidth + jitter, height - insetY);
      context.stroke();
    }
  } else if (plan.motif === "matrix_columns") {
    const columnCount = plan.midElements;
    const fontSize = Math.max(11, unit * (0.012 + plan.bassDrive * 0.008));
    context.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let column = 0; column < columnCount; column += 1) {
      const fromRight = column % 2 === 1;
      const lane = Math.floor(column / 2) + 1;
      const x = fromRight
        ? width - edgeX * lane / (Math.ceil(columnCount / 2) + 1)
        : edgeX * lane / (Math.ceil(columnCount / 2) + 1);
      const trail = 3 + Math.round(plan.trebleDrive * 5);
      const head = height * ((randomUnit(seed, 52_100 + column) + time * (0.045 + plan.trebleDrive * 0.13)) % 1.16 - 0.08);
      for (let glyph = 0; glyph < trail; glyph += 1) {
        const y = head - glyph * fontSize * 1.2;
        const character = SIGNAL_GLYPHS[Math.floor(randomUnit(seed + Math.floor(time * 4), 52_300 + column * 19 + glyph) * SIGNAL_GLYPHS.length)];
        const fade = 1 - glyph / trail;
        context.fillStyle = rgba(glyph === 0 ? highlight : column % 3 ? primary : secondary, coreAlpha * fade * (0.52 + plan.trebleDrive * 0.38));
        context.fillText(character, x, y);
      }
    }
    context.fillStyle = rgba(primary, coreAlpha * (0.42 + plan.bassDrive * 0.45));
    const shelfHeight = lineWidth * (0.7 + plan.bassDrive);
    context.fillRect(0, height - shelfHeight, edgeX, shelfHeight);
    context.fillRect(width - edgeX, height - shelfHeight, edgeX, shelfHeight);
  } else if (plan.motif === "terminal_brackets") {
    const promptCount = plan.midElements;
    context.font = `800 ${Math.max(10, unit * (0.011 + plan.bassDrive * 0.005))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.textBaseline = "middle";
    for (let prompt = 0; prompt < promptCount; prompt += 1) {
      const top = prompt % 2 === 0;
      const progress = (Math.floor(prompt / 2) + 0.5) / Math.ceil(promptCount / 2);
      const x = width * (0.06 + progress * 0.88);
      const y = top ? edgeY * 0.48 : height - edgeY * 0.48;
      const promptWidth = unit * (0.028 + plan.midDrive * 0.05);
      const promptHeight = lineWidth * (0.8 + plan.bassDrive * 0.75);
      const color = prompt % 3 === 0 ? highlight : prompt % 2 ? secondary : primary;
      context.fillStyle = rgba(color, coreAlpha * (0.56 + plan.midDrive * 0.34));
      context.fillRect(x - promptWidth * 0.5, y - promptHeight * 0.5, promptWidth, promptHeight);
      const glyph = TERMINAL_GLYPHS[(prompt * 7 + Math.floor(time * (2 + plan.trebleDrive * 5))) % TERMINAL_GLYPHS.length];
      context.fillStyle = rgba(highlight, coreAlpha * (0.56 + plan.trebleDrive * 0.4));
      context.fillText(glyph, x + promptWidth * 0.7, y);
    }
    context.strokeStyle = rgba(secondary, coreAlpha * (0.42 + plan.midDrive * 0.36));
    context.lineWidth = lineWidth;
    context.strokeRect(lineWidth, lineWidth, width - lineWidth * 2, height - lineWidth * 2);
  } else if (plan.motif === "pixel_fragments") {
    const fragmentCount = plan.bassElements + plan.midElements + plan.trebleElements;
    const tick = Math.floor(time * (1.2 + plan.trebleDrive * 8));
    for (let fragment = 0; fragment < fragmentCount; fragment += 1) {
      const localSeed = seed + tick * 101 + fragment * 17;
      const side = fragment % 4;
      const bandDrive = side < 2 ? plan.midDrive : fragment % 3 === 0 ? plan.bassDrive : plan.trebleDrive;
      const along = randomUnit(localSeed, 53_100 + fragment);
      const depth = randomUnit(localSeed, 53_200 + fragment);
      const length = unit * (0.012 + bandDrive * 0.075 + randomUnit(localSeed, 53_300 + fragment) * 0.04);
      const thickness = Math.max(3, lineWidth * (0.45 + randomUnit(localSeed, 53_400 + fragment) * 0.85));
      const color = colors[fragment % colors.length];
      context.fillStyle = rgba(color, coreAlpha * (0.5 + bandDrive * 0.38));
      if (side === 0 || side === 1) {
        const x = side === 0 ? depth * edgeX : width - depth * edgeX - thickness;
        context.fillRect(x, along * height, thickness, length);
      } else {
        const y = side === 2 ? depth * edgeY : height - depth * edgeY - thickness;
        context.fillRect(along * width, y, length, thickness);
      }
    }
  } else if (plan.motif === "switchyard_arcs") {
    const railCount = plan.midElements;
    for (let rail = 0; rail < railCount; rail += 1) {
      const fromRight = rail % 2 === 1;
      const y = height * (rail + 1) / (railCount + 1);
      const edge = fromRight ? width : 0;
      const direction = fromRight ? -1 : 1;
      const reach = edgeX * (0.52 + plan.midDrive * 0.48);
      const step = unit * (0.018 + plan.trebleDrive * 0.025);
      const color = rail % 3 === 0 ? highlight : rail % 2 ? secondary : primary;
      context.strokeStyle = rgba(color, coreAlpha * (0.5 + plan.midDrive * 0.34));
      context.lineWidth = lineWidth * (0.55 + plan.bassDrive * 0.85);
      context.beginPath();
      context.moveTo(edge, y);
      context.lineTo(edge + direction * reach * 0.32, y);
      context.lineTo(edge + direction * reach * 0.5, y + (rail % 2 ? -step : step));
      context.lineTo(edge + direction * reach, y + (rail % 2 ? -step : step));
      context.stroke();
      const nodeX = edge + direction * reach * 0.5;
      context.fillStyle = rgba(highlight, coreAlpha * (0.54 + plan.trebleDrive * 0.4));
      context.fillRect(nodeX - lineWidth * 0.55, y + (rail % 2 ? -step : step) - lineWidth * 0.55, lineWidth * 1.1, lineWidth * 1.1);
    }
  } else if (plan.motif === "laser_chevrons") {
    const chevronCount = plan.trebleElements;
    context.globalCompositeOperation = "lighter";
    for (let chevron = 0; chevron < chevronCount; chevron += 1) {
      const corner = chevron % 4;
      const lane = Math.floor(chevron / 4) + 1;
      const inset = unit * lane * 0.018;
      const horizontal = edgeX * (0.5 + plan.midDrive * 0.5);
      const vertical = edgeY * (0.5 + plan.trebleDrive * 0.5);
      const left = corner === 0 || corner === 2;
      const top = corner < 2;
      const x = left ? inset : width - inset;
      const y = top ? inset : height - inset;
      const color = colors[chevron % colors.length];
      context.strokeStyle = rgba(color, coreAlpha * (0.46 + plan.trebleDrive * 0.44));
      context.shadowColor = rgba(color, coreAlpha * 0.38);
      context.shadowBlur = unit * (0.003 + plan.trebleDrive * 0.006);
      context.lineWidth = lineWidth * (0.42 + plan.bassDrive * 0.52);
      context.beginPath();
      context.moveTo(x + (left ? horizontal : -horizontal), y);
      context.lineTo(x, y);
      context.lineTo(x, y + (top ? vertical : -vertical));
      context.stroke();
    }
    context.shadowBlur = 0;
    context.shadowColor = "transparent";
  } else if (plan.motif === "pressure_streaks") {
    const streakCount = plan.bassElements + plan.midElements + plan.trebleElements;
    for (let streak = 0; streak < streakCount; streak += 1) {
      const fromRight = streak % 2 === 1;
      const y = height * randomUnit(seed, 54_100 + streak);
      const travel = (randomUnit(seed, 54_200 + streak) + time * (0.035 + plan.trebleDrive * 0.09)) % 1;
      const reach = edgeX * (0.34 + plan.bassDrive * 0.66);
      const length = Math.min(
        reach * 0.32,
        unit * (0.008 + plan.trebleDrive * 0.05 + randomUnit(seed, 54_300 + streak) * 0.025),
      );
      const travelDistance = Math.max(0, reach - length);
      const x = fromRight ? width - travel * travelDistance : travel * travelDistance;
      const color = colors[streak % colors.length];
      context.fillStyle = rgba(color, coreAlpha * (0.45 + (1 - travel) * plan.bassDrive * 0.42));
      context.fillRect(fromRight ? x - length : x, y, length, Math.max(2.5, lineWidth * 0.45));
    }
    for (let front = 0; front < plan.bassElements; front += 1) {
      const x = edgeX * (front + 1) / (plan.bassElements + 1);
      context.strokeStyle = rgba(front % 2 ? secondary : primary, coreAlpha * (0.38 + plan.bassDrive * 0.46));
      context.lineWidth = lineWidth * (0.54 + plan.bassDrive * 0.68);
      context.beginPath();
      context.moveTo(x, 0);
      context.bezierCurveTo(x + unit * plan.midDrive * 0.025, height * 0.3, x - unit * plan.midDrive * 0.025, height * 0.7, x, height);
      context.stroke();
      context.beginPath();
      context.moveTo(width - x, 0);
      context.bezierCurveTo(width - x - unit * plan.midDrive * 0.025, height * 0.3, width - x + unit * plan.midDrive * 0.025, height * 0.7, width - x, height);
      context.stroke();
    }
  } else if (plan.motif === "constellation_chain") {
    const pointCount = plan.midElements + plan.trebleElements + plan.tapestryElements;
    const inset = unit * (0.018 + plan.bassDrive * 0.008);
    const points = Array.from({ length: pointCount }, (_, point) => {
      const progress = point / pointCount + time * (0.002 + plan.midDrive * 0.004);
      const base = perimeterRectanglePoint(progress, width, height, inset);
      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const inward = edgeX * randomUnit(seed, 55_100 + point) * (0.08 + plan.midDrive * 0.22);
      const distance = Math.max(1, Math.hypot(centerX - base.x, centerY - base.y));
      return {
        x: base.x + (centerX - base.x) / distance * inward,
        y: base.y + (centerY - base.y) / distance * inward,
      };
    });
    context.lineWidth = Math.max(1.5, lineWidth * 0.42);
    for (let point = 0; point < points.length; point += 1) {
      const from = points[point];
      const to = points[(point + 1) % points.length];
      const color = colors[point % colors.length];
      context.strokeStyle = rgba(color, coreAlpha * (0.38 + plan.midDrive * 0.38));
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      const radius = lineWidth * (0.55 + plan.bassDrive * 0.85) * (point % 4 === 0 ? 1.35 : 0.72);
      context.fillStyle = rgba(point % 5 === 0 ? highlight : color, coreAlpha * (0.56 + plan.trebleDrive * 0.38));
      context.beginPath();
      context.arc(from.x, from.y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

/**
 * The base renderer establishes a family's identity. This late-arriving layer
 * authors an unmistakable second form for that same family, with geometry
 * still earned from its owned audio bands and cadence paced by detected tempo.
 */
function drawMusicLifecycleVariant(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  evolution: RadioVisualMusicEvolutionPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002 || evolution.shapeMorph < 0.025) return;
  const unit = Math.min(width, height);
  const morph = evolution.shapeMorph;
  const finale = evolution.finale;
  const beatLift = 0.74 + evolution.tempoPulse * 0.26;
  const transientShape = Math.max(
    evolution.bassImpact,
    evolution.midImpact,
    evolution.trebleImpact,
    evolution.tapestryImpact,
  );
  const morphVisibility = 0.045 + evolution.structureLevel * 0.72 + transientShape * 0.235;
  const coreAlpha = clampVisualValue(
    chromaCoreAlpha(mix, drives.presence)
      * morph
      * morphVisibility
      * (
        0.1
          + evolution.structureLevel * 0.5
          + evolution.snareFlash * 0.16
          + evolution.trebleImpact * 0.1
          + evolution.tapestryImpact * 0.14
      )
      * beatLift,
    0,
    0.72,
  );
  const edgeReach = width
    * (0.035 + drives.body * 0.035 + drives.midLayer * 0.075 + finale * 0.035)
    * evolution.reach
    * (0.52 + evolution.structureLevel * 0.38 + transientShape * 0.1);
  const tick = Math.floor(time * (2 + evolution.motionRate * 4 + evolution.tempoPulse * 5));
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "square";
  context.lineJoin = "miter";
  context.shadowColor = rgba(highlight, coreAlpha * (0.12 + evolution.glowBloom * 0.42));
  context.shadowBlur = unit * (0.001 + evolution.glowBloom * 0.008);

  if (evolution.variant === "bars_to_teeth") {
    const toothCount = 6 + Math.floor(drives.midLayer * 7 + drives.trebleLayer * 7 + finale * 4);
    for (let tooth = 0; tooth < toothCount; tooth += 1) {
      const y = height * (tooth + 0.5) / toothCount;
      const depth = edgeReach * (0.34 + randomUnit(seed, 61_100 + tooth) * 0.66) * (0.72 + drives.treblePulse * 0.28);
      const toothHeight = Math.max(3, height / toothCount * (0.24 + drives.bassLayer * 0.34));
      const offset = Math.sin(time * (0.45 + evolution.motionRate * 0.3) + tooth * 1.7) * unit * evolution.jitter * 0.006;
      const color = tooth % 3 === 0 ? highlight : tooth % 2 ? secondary : primary;
      context.fillStyle = rgba(color, coreAlpha * (0.58 + drives.treblePulse * 0.3));
      context.beginPath();
      context.moveTo(0, y - toothHeight);
      context.lineTo(depth + offset, y);
      context.lineTo(0, y + toothHeight);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(width, y - toothHeight);
      context.lineTo(width - depth - offset, y);
      context.lineTo(width, y + toothHeight);
      context.closePath();
      context.fill();
    }
  } else if (evolution.variant === "ribbons_to_braids") {
    const braidCount = 2 + Math.floor(drives.midLayer * 4 + drives.tapestry * 3);
    for (let braid = 0; braid < braidCount; braid += 1) {
      const phase = time * (0.55 + evolution.motionRate * 0.34) + braid * Math.PI * 0.72;
      const color = braid % 3 === 0 ? highlight : braid % 2 ? secondary : primary;
      context.strokeStyle = rgba(color, coreAlpha * (0.5 + drives.midPulse * 0.34));
      context.lineWidth = Math.max(2, unit * (0.0018 + drives.bassLayer * 0.008) * evolution.lineWeight);
      for (const side of [-1, 1]) {
        context.beginPath();
        for (let step = 0; step <= 36; step += 1) {
          const progress = step / 36;
          const baseX = side < 0 ? edgeReach * 0.38 : width - edgeReach * 0.38;
          const wave = Math.sin(progress * Math.PI * (4 + finale * 4) + phase) * edgeReach * (0.16 + drives.midLayer * 0.34);
          const x = baseX + side * wave;
          const y = height * progress;
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    }
  } else if (evolution.variant === "frames_to_splice") {
    const frameCount = 2 + Math.floor(drives.midLayer * 4 + drives.tapestry * 3 + finale * 2);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const depth = (frame + 1) / (frameCount + 1);
      const insetX = edgeReach * depth;
      const insetY = unit * (0.018 + depth * 0.055);
      const splice = Math.sin(time * (0.18 + evolution.motionRate * 0.12) + frame * 1.3) * unit * morph * 0.045;
      context.strokeStyle = rgba(frame % 2 ? secondary : primary, coreAlpha * (0.42 + drives.midLayer * 0.34));
      context.lineWidth = Math.max(2, unit * (0.002 + drives.bassLayer * 0.007) * (1 - depth * 0.28) * evolution.lineWeight);
      context.beginPath();
      context.moveTo(insetX, insetY + height * 0.18);
      context.lineTo(insetX + splice, insetY);
      context.lineTo(width - insetX + splice * 0.24, insetY);
      context.lineTo(width - insetX, height - insetY - height * 0.18);
      context.moveTo(width - insetX, height - insetY - height * 0.18);
      context.lineTo(width - insetX - splice, height - insetY);
      context.lineTo(insetX - splice * 0.24, height - insetY);
      context.lineTo(insetX, insetY + height * 0.18);
      context.stroke();
    }
  } else if (evolution.variant === "rain_to_crossfeed") {
    const rowCount = 3 + Math.floor(drives.midLayer * 6 + drives.trebleLayer * 5 + finale * 3);
    context.font = `800 ${Math.max(10, unit * (0.012 + drives.bassLayer * 0.006))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.textBaseline = "middle";
    for (let row = 0; row < rowCount; row += 1) {
      const fromRight = row % 2 === 1;
      const travel = ((time * (0.04 + drives.trebleLayer * 0.18 + evolution.motionRate * 0.04) + randomUnit(seed, 61_600 + row)) % 1.3) - 0.15;
      const x = fromRight ? width * (1 - travel) : width * travel;
      const y = height * (row + 0.5) / rowCount;
      const glyphCount = 2 + Math.floor(drives.midLayer * 5 + finale * 3);
      for (let glyph = 0; glyph < glyphCount; glyph += 1) {
        const character = SIGNAL_GLYPHS[(tick + row * 11 + glyph * 7) % SIGNAL_GLYPHS.length];
        const offset = glyph * unit * 0.018 * (fromRight ? 1 : -1);
        context.fillStyle = rgba(glyph === 0 ? highlight : row % 2 ? secondary : primary, coreAlpha * (0.42 + (1 - glyph / glyphCount) * 0.38));
        context.fillText(character, x + offset, y);
      }
    }
  } else if (evolution.variant === "terminal_to_breach") {
    const packetCount = 3 + Math.floor(drives.midLayer * 5 + drives.trebleLayer * 4 + finale * 4);
    context.font = `800 ${Math.max(9, unit * 0.011)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.textBaseline = "middle";
    for (let packet = 0; packet < packetCount; packet += 1) {
      const side = packet % 2;
      const y = height * randomUnit(seed, 62_100 + packet);
      const pulseOffset = Math.sin(time * evolution.motionRate + packet) * unit * evolution.jitter * 0.018;
      const reach = edgeReach * (0.42 + randomUnit(seed, 62_200 + packet) * 0.58);
      const x = side ? width - reach - pulseOffset : reach + pulseOffset;
      const label = `0x${((seed + packet * 97 + tick) >>> 0).toString(16).slice(-4).toUpperCase()}`;
      context.fillStyle = rgba(packet % 3 === 0 ? highlight : packet % 2 ? secondary : primary, coreAlpha * (0.48 + drives.treblePulse * 0.38));
      context.textAlign = side ? "right" : "left";
      context.fillText(label, x, y);
      context.fillRect(side ? x : 0, y + unit * 0.008, side ? width - x : x, Math.max(2, unit * 0.0025));
    }
  } else if (evolution.variant === "slices_to_scramble") {
    const shardCount = 5 + Math.floor(drives.midLayer * 6 + drives.trebleLayer * 8 + finale * 5);
    for (let shard = 0; shard < shardCount; shard += 1) {
      const localSeed = seed + tick * 131 + shard * 17;
      const fromRight = shard % 2 === 1;
      const y = height * randomUnit(localSeed, 62_600 + shard);
      const shardWidth = edgeReach * (0.24 + randomUnit(localSeed, 62_700 + shard) * 0.76);
      const shardHeight = Math.max(3, unit * (0.003 + randomUnit(localSeed, 62_800 + shard) * (0.008 + drives.bassLayer * 0.018)));
      const skew = unit * (0.01 + evolution.jitter * 0.03) * (shard % 3 - 1);
      context.fillStyle = rgba(shard % 4 === 0 ? highlight : shard % 2 ? secondary : primary, coreAlpha * (0.44 + drives.treblePulse * 0.4));
      context.beginPath();
      context.moveTo(fromRight ? width : 0, y);
      context.lineTo(fromRight ? width - shardWidth : shardWidth, y + skew);
      context.lineTo(fromRight ? width - shardWidth : shardWidth, y + shardHeight + skew);
      context.lineTo(fromRight ? width : 0, y + shardHeight);
      context.closePath();
      context.fill();
    }
  } else if (evolution.variant === "rails_to_discharge") {
    const dischargeCount = 2 + Math.floor(drives.midLayer * 4 + drives.trebleLayer * 5 + finale * 3);
    for (let discharge = 0; discharge < dischargeCount; discharge += 1) {
      const fromRight = discharge % 2 === 1;
      const direction = fromRight ? -1 : 1;
      const originX = fromRight ? width : 0;
      const y = height * (discharge + 1) / (dischargeCount + 1);
      const reach = edgeReach * (0.5 + drives.treblePulse * 0.5);
      const color = discharge % 3 === 0 ? highlight : discharge % 2 ? secondary : primary;
      context.strokeStyle = rgba(color, coreAlpha * (0.52 + drives.treblePulse * 0.4));
      context.shadowColor = rgba(color, coreAlpha * 0.42);
      context.shadowBlur = unit * (0.003 + drives.treblePulse * 0.01);
      context.lineWidth = Math.max(1.5, unit * (0.0015 + drives.bassLayer * 0.006) * evolution.lineWeight);
      context.beginPath();
      context.moveTo(originX, y);
      for (let step = 1; step <= 6; step += 1) {
        const x = originX + direction * reach * step / 6;
        const jag = (randomUnit(seed + tick, 63_100 + discharge * 11 + step) - 0.5) * unit * (0.01 + evolution.jitter * 0.028);
        context.lineTo(x, y + jag);
      }
      context.stroke();
    }
  } else if (evolution.variant === "grid_to_prism") {
    const prismCount = 2 + Math.floor(drives.midLayer * 3 + drives.tapestry * 3 + finale * 2);
    context.translate(width * 0.5, height * 0.5);
    context.rotate(time * (0.025 + evolution.motionRate * 0.018));
    for (let prism = 0; prism < prismCount; prism += 1) {
      const depth = (prism + 1) / (prismCount + 1);
      const radiusX = width * (0.12 + depth * (0.34 + drives.midLayer * 0.08));
      const radiusY = height * (0.08 + depth * (0.28 + drives.trebleLayer * 0.06));
      context.strokeStyle = rgba(prism % 3 === 0 ? highlight : prism % 2 ? secondary : primary, coreAlpha * (0.38 + drives.trebleLayer * 0.38));
      context.lineWidth = Math.max(1.5, unit * (0.0015 + drives.bassLayer * 0.005) * evolution.lineWeight);
      context.beginPath();
      context.moveTo(0, -radiusY);
      context.lineTo(radiusX, 0);
      context.lineTo(0, radiusY);
      context.lineTo(-radiusX, 0);
      context.closePath();
      context.stroke();
    }
  } else if (evolution.variant === "drift_to_vortex") {
    const particleCount = 8 + Math.floor(drives.body * 10 + drives.trebleLayer * 8 + finale * 6);
    for (let particle = 0; particle < particleCount; particle += 1) {
      const base = randomUnit(seed, 63_600 + particle);
      const radius = unit * (0.08 + base * (0.34 + drives.bassLayer * 0.08));
      const angle = randomUnit(seed, 63_700 + particle) * Math.PI * 2 + time * (0.12 + evolution.motionRate * 0.1) * (particle % 2 ? -1 : 1);
      const x = width * 0.5 + Math.cos(angle) * radius;
      const y = height * 0.5 + Math.sin(angle) * radius * 1.24;
      const size = Math.max(2, unit * (0.002 + drives.bassLayer * 0.007 + evolution.tempoPulse * 0.002));
      const color = particle % 5 === 0 ? highlight : particle % 2 ? secondary : primary;
      context.fillStyle = rgba(color, coreAlpha * (0.42 + drives.trebleLayer * 0.36));
      context.fillRect(x - size * 0.5, y - size * 0.5, size, size);
    }
  } else if (evolution.variant === "stars_to_network") {
    const nodeCount = 6 + Math.floor(drives.midLayer * 6 + drives.trebleLayer * 5 + drives.tapestry * 5 + finale * 3);
    const nodes = Array.from({ length: nodeCount }, (_, node) => {
      const angle = node / nodeCount * Math.PI * 2 + time * (0.025 + evolution.motionRate * 0.018);
      const radius = unit * (0.11 + node / nodeCount * (0.3 + drives.midLayer * 0.05));
      return { x: width * 0.5 + Math.cos(angle) * radius, y: height * 0.5 + Math.sin(angle) * radius * 1.18 };
    });
    context.lineWidth = Math.max(1, unit * (0.001 + drives.midLayer * 0.002) * evolution.lineWeight);
    for (let node = 0; node < nodes.length; node += 1) {
      const from = nodes[node];
      const to = nodes[(node + 2 + Math.floor(finale * 2)) % nodes.length];
      const color = node % 3 === 0 ? highlight : node % 2 ? secondary : primary;
      context.strokeStyle = rgba(color, coreAlpha * (0.32 + drives.midLayer * 0.42));
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.quadraticCurveTo(width * 0.5, height * 0.5, to.x, to.y);
      context.stroke();
      context.fillStyle = rgba(color, coreAlpha * (0.48 + drives.treblePulse * 0.38));
      context.beginPath();
      context.arc(from.x, from.y, Math.max(1.5, unit * (0.002 + drives.bassLayer * 0.005)), 0, Math.PI * 2);
      context.fill();
    }
  }
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  context.restore();
}

/**
 * Short, analyser-earned accents layered over the retained family geometry.
 * Bass changes pressure/weight, a mid-led transient lights a different family
 * feature, and treble emits only a few glints. None of these are a continuous
 * substitute for the underlying scene.
 */
function drawMusicBandEventAccents(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  evolution: RadioVisualMusicEvolutionPlan,
  scene: RadioVisualMusicScene,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const eventEnergy = Math.max(
    evolution.bassImpact,
    evolution.snareFlash,
    evolution.trebleImpact,
    evolution.tapestryImpact,
  );
  if (mix < 0.002 || eventEnergy < 0.018) return;
  const unit = Math.min(width, height);
  const centerX = width * 0.5;
  const centerY = height * 0.44;
  const eventSeed = seed + Math.floor(time * 4) * 65_537;
  const alpha = clampVisualValue(chromaCoreAlpha(mix) * (0.22 + eventEnergy * 0.62), 0, 0.82);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  if (evolution.bassImpact >= 0.025) {
    const pressure = evolution.bassImpact;
    const inset = unit * (0.02 + (1 - pressure) * 0.025);
    context.strokeStyle = rgba(primary, alpha * (0.42 + pressure * 0.44));
    context.lineWidth = Math.max(1.5, unit * (0.002 + pressure * 0.012));
    context.shadowColor = rgba(primary, alpha * 0.54);
    context.shadowBlur = unit * (0.004 + pressure * 0.018);
    context.beginPath();
    if (scene === "particle_pressure" || scene === "signal_constellation" || scene === "laser_lattice") {
      context.ellipse(
        centerX,
        centerY,
        width * (0.2 + pressure * 0.2),
        height * (0.14 + pressure * 0.15),
        evolution.rotation,
        0,
        Math.PI * 2,
      );
    } else {
      context.rect(inset, inset, width - inset * 2, height - inset * 2);
    }
    context.stroke();
  }

  if (evolution.snareFlash >= 0.025) {
    const flash = evolution.snareFlash;
    const y = height * (0.18 + randomUnit(eventSeed, 67_001) * 0.56);
    const reach = width * (0.08 + flash * 0.24);
    context.shadowColor = rgba(highlight, alpha * 0.84);
    context.shadowBlur = unit * (0.006 + flash * 0.026);
    context.strokeStyle = rgba(highlight, alpha * (0.48 + flash * 0.5));
    context.fillStyle = rgba(highlight, alpha * (0.4 + flash * 0.5));
    context.lineWidth = Math.max(1.5, unit * (0.0018 + flash * 0.01));

    if (scene === "edge_spectrum") {
      const flashHeight = Math.max(2, unit * (0.002 + flash * 0.014));
      context.fillRect(0, y, reach, flashHeight);
      context.fillRect(width - reach, y, reach, flashHeight);
    } else if (scene === "oscilloscope_ribbons") {
      context.beginPath();
      context.arc(width * 0.08, y, unit * (0.018 + flash * 0.045), -Math.PI * 0.5, Math.PI * 0.5);
      context.arc(width * 0.92, y, unit * (0.018 + flash * 0.045), Math.PI * 0.5, Math.PI * 1.5);
      context.stroke();
    } else if (scene === "tape_feedback") {
      const splice = unit * (0.03 + flash * 0.08);
      context.beginPath();
      context.moveTo(0, y - splice);
      context.lineTo(reach * 0.55, y);
      context.lineTo(0, y + splice);
      context.moveTo(width, y - splice);
      context.lineTo(width - reach * 0.55, y);
      context.lineTo(width, y + splice);
      context.stroke();
    } else if (scene === "matrix_rain") {
      const glyphCount = 4 + Math.floor(flash * 5);
      context.font = `900 ${Math.max(10, unit * (0.011 + flash * 0.006))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      for (let glyph = 0; glyph < glyphCount; glyph += 1) {
        const x = width * (glyph + 0.5) / glyphCount;
        context.fillText(SIGNAL_GLYPHS[Math.abs(glyph * 7 + eventSeed) % SIGNAL_GLYPHS.length], x, y);
      }
    } else if (scene === "ascii_terminal") {
      context.font = `900 ${Math.max(10, unit * (0.01 + flash * 0.006))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      context.textBaseline = "middle";
      context.textAlign = "left";
      context.fillText("[MID::SYNC]", unit * 0.02, y);
      context.textAlign = "right";
      context.fillText("[HIT::ACK]", width - unit * 0.02, y);
    } else if (scene === "pixel_sort_storm") {
      for (let shard = 0; shard < 3; shard += 1) {
        const offset = (shard - 1) * unit * 0.014;
        const shardReach = reach * (0.45 + shard * 0.2);
        context.fillRect(0, y + offset, shardReach, Math.max(2, unit * (0.002 + flash * 0.007)));
        context.fillRect(width - shardReach, y - offset, shardReach, Math.max(2, unit * (0.002 + flash * 0.007)));
      }
    } else if (scene === "lightning_switchyard") {
      context.beginPath();
      context.moveTo(0, y);
      for (let step = 1; step <= 6; step += 1) {
        context.lineTo(
          reach * step / 6,
          y + (randomUnit(eventSeed, 67_100 + step) - 0.5) * unit * (0.025 + flash * 0.06),
        );
      }
      context.moveTo(width, y);
      for (let step = 1; step <= 6; step += 1) {
        context.lineTo(
          width - reach * step / 6,
          y + (randomUnit(eventSeed, 67_200 + step) - 0.5) * unit * (0.025 + flash * 0.06),
        );
      }
      context.stroke();
    } else if (scene === "laser_lattice") {
      const radiusX = width * (0.08 + flash * 0.18);
      const radiusY = height * (0.05 + flash * 0.13);
      context.beginPath();
      context.moveTo(centerX, centerY - radiusY);
      context.lineTo(centerX + radiusX, centerY);
      context.lineTo(centerX, centerY + radiusY);
      context.lineTo(centerX - radiusX, centerY);
      context.closePath();
      context.stroke();
    } else if (scene === "particle_pressure") {
      context.beginPath();
      context.ellipse(centerX, centerY, width * (0.12 + flash * 0.21), height * (0.08 + flash * 0.15), 0, 0, Math.PI * 2);
      context.stroke();
    } else {
      const spokeCount = 5 + Math.floor(flash * 5);
      for (let spoke = 0; spoke < spokeCount; spoke += 1) {
        const angle = spoke / spokeCount * Math.PI * 2;
        const inner = unit * 0.08;
        const outer = unit * (0.13 + flash * 0.17);
        context.beginPath();
        context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
        context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
        context.stroke();
      }
    }
  }

  if (evolution.trebleImpact >= 0.025) {
    const sparkleCount = 1 + Math.floor(evolution.trebleImpact * 5);
    context.shadowColor = rgba(highlight, alpha * 0.86);
    context.shadowBlur = unit * (0.008 + evolution.trebleImpact * 0.022);
    context.lineWidth = Math.max(1, unit * (0.0012 + evolution.trebleImpact * 0.003));
    for (let sparkle = 0; sparkle < sparkleCount; sparkle += 1) {
      const fromRight = sparkle % 2 === 1;
      const x = width * (fromRight ? 0.83 : 0.17) + (randomUnit(eventSeed, 67_400 + sparkle) - 0.5) * width * 0.16;
      const y = height * (0.12 + randomUnit(eventSeed, 67_500 + sparkle) * 0.68);
      const length = unit * (0.012 + evolution.trebleImpact * 0.045);
      const angle = randomUnit(eventSeed, 67_600 + sparkle) * Math.PI * 2;
      context.strokeStyle = rgba(sparkle % 2 ? secondary : highlight, alpha * (0.5 + evolution.trebleImpact * 0.42));
      context.beginPath();
      context.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
  }

  if (evolution.tapestryImpact >= 0.04) {
    const burst = evolution.tapestryImpact;
    const angle = randomUnit(eventSeed, 67_900) * Math.PI - Math.PI * 0.5;
    const length = Math.hypot(width, height) * 0.58;
    context.strokeStyle = rgba(secondary, alpha * (0.34 + burst * 0.52));
    context.lineWidth = Math.max(1.5, unit * (0.0018 + burst * 0.007));
    context.beginPath();
    context.moveTo(centerX - Math.cos(angle) * length, centerY - Math.sin(angle) * length);
    context.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
    context.stroke();
  }
  context.restore();
}

/**
 * Additive performance pass for the ten authored music families. The original
 * renderer and its lifecycle form stay intact; this layer turns the shared
 * audio envelope into family-specific breathing, impact, weight, reach, glow,
 * and deformation so movement is not the only visible response.
 */
function drawMusicDynamicModulation(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  evolution: RadioVisualMusicEvolutionPlan,
  scene: RadioVisualMusicScene,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const unit = Math.min(width, height);
  const colors = [primary, secondary, highlight] as const;
  const eventEnergy = Math.max(
    evolution.bassImpact,
    evolution.midImpact,
    evolution.trebleImpact,
    evolution.tapestryImpact,
  );
  const breathScale = 0.94
    + (evolution.breath - 0.5) * evolution.structureLevel * 0.18;
  const impactScale = 1
    + evolution.bassImpact * 0.16
    + evolution.tapestryImpact * 0.12;
  const reachScale = (0.68 + evolution.structureLevel * 0.32)
    * evolution.reach
    * breathScale
    * impactScale;
  const deformation = evolution.deformation;
  const coreAlpha = clampVisualValue(
    chromaCoreAlpha(mix, drives.presence)
      * (
        0.025
          + evolution.structureLevel * 0.23
          + evolution.bassImpact * 0.12
          + evolution.snareFlash * 0.2
          + evolution.trebleImpact * 0.14
          + evolution.tapestryImpact * 0.18
          + evolution.sectionSurge * 0.08
      ),
    0,
    0.82,
  );
  const lineWidth = Math.max(0.8, unit * 0.00155 * evolution.lineWeight);
  const glowRadius = unit * (0.0008 + evolution.glowBloom * 0.016 + evolution.trebleImpact * 0.008);
  const movementGate = 0.06 + evolution.structureLevel * 0.12 + evolution.movementBurst * 0.82;
  const tick = Math.floor(time * (0.9 + evolution.motionRate * 1.7 + eventEnergy * 8));
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = rgba(highlight, coreAlpha * (0.18 + evolution.glowBloom * 0.64 + evolution.snareFlash * 0.22));
  context.shadowBlur = glowRadius + unit * evolution.sectionSurge * 0.004;

  if (scene === "edge_spectrum") {
    const barCount = 3 + Math.floor(
      evolution.structureLevel * 7
        + drives.midLayer * 3
        + drives.trebleLayer * 2
        + evolution.snareFlash * 3,
    );
    for (let bar = 0; bar < barCount; bar += 1) {
      const position = (bar + 0.5) / barCount;
      const localWave = 0.72 + 0.28 * Math.sin(time * (0.7 + movementGate * 0.45) + bar * 1.43);
      const bandDrive = bar % 3 === 0 ? drives.bassLayer : bar % 3 === 1 ? drives.midLayer : drives.trebleLayer;
      const depth = width * (0.026 + bandDrive * 0.085 + evolution.pulse * 0.05)
        * reachScale
        * localWave;
      const thickness = lineWidth * (
        0.82
          + bandDrive * 1.55
          + evolution.bassImpact * (bar % 4 === 0 ? 2.8 : 0.8)
      );
      const y = height * position;
      const color = colors[bar % colors.length];
      context.strokeStyle = rgba(color, coreAlpha * (0.56 + bandDrive * 0.34));
      context.lineWidth = thickness;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(depth, y + Math.sin(bar + time * movementGate) * unit * deformation * 0.008);
      context.moveTo(width, y);
      context.lineTo(width - depth, y - Math.sin(bar + time * movementGate) * unit * deformation * 0.008);
      context.stroke();
    }
    if (evolution.snareFlash > 0.025 || evolution.hardBeat > 0.05) {
      const biteStrength = Math.max(evolution.snareFlash, evolution.hardBeat);
      const bite = width * (0.055 + biteStrength * 0.12) * evolution.reach;
      context.strokeStyle = rgba(highlight, coreAlpha * (0.34 + biteStrength * 0.66));
      context.lineWidth = lineWidth * (1.1 + evolution.snareFlash * 4 + evolution.hardBeat * 1.4);
      for (const y of [height * 0.22, height * 0.5, height * 0.78]) {
        context.beginPath();
        context.moveTo(0, y - unit * 0.018);
        context.lineTo(bite, y);
        context.lineTo(0, y + unit * 0.018);
        context.moveTo(width, y - unit * 0.018);
        context.lineTo(width - bite, y);
        context.lineTo(width, y + unit * 0.018);
        context.stroke();
      }
    }
  } else if (scene === "oscilloscope_ribbons") {
    const braidCount = 1 + Math.floor(
      evolution.structureLevel * 2
        + drives.tapestry * 2
        + evolution.midImpact * 2,
    );
    for (let braid = 0; braid < braidCount; braid += 1) {
      const color = colors[braid % colors.length];
      const phase = time * (0.38 + movementGate * 0.5) + braid * 1.67;
      const amplitude = width * (0.025 + drives.midLayer * 0.055 + deformation * 0.045)
        * breathScale
        * (1 + evolution.beatPunch * 0.24);
      context.strokeStyle = rgba(color, coreAlpha * (0.42 + evolution.snareFlash * 0.5));
      context.lineWidth = lineWidth * (0.9 + drives.bassLayer * 1.35 + evolution.bassImpact * 2.4);
      for (const side of [-1, 1]) {
        context.beginPath();
        for (let step = 0; step <= 32; step += 1) {
          const progress = step / 32;
          const envelope = Math.sin(progress * Math.PI);
          const wave = Math.sin(progress * Math.PI * (3 + evolution.finale * 3) + phase)
            * amplitude
            * (0.45 + envelope * 0.55);
          const beatPinch = Math.sin(progress * Math.PI * 2) * unit * evolution.hardBeat * 0.018;
          const baseX = side < 0 ? width * 0.055 : width * 0.945;
          const x = baseX + side * (wave + beatPinch);
          const y = height * progress;
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    }
  } else if (scene === "tape_feedback") {
    const frameCount = 1 + Math.floor(
      evolution.structureLevel * 3
        + drives.midLayer * 2
        + drives.tapestry * 2
        + evolution.snareFlash * 2,
    );
    for (let frame = 0; frame < frameCount; frame += 1) {
      const depth = (frame + 1) / (frameCount + 1);
      const pulseOffset = unit * (evolution.breath - 0.5) * (0.014 + depth * 0.018)
        + unit * evolution.beatPunch * depth * 0.01;
      const insetX = unit * (0.018 + depth * 0.045) - pulseOffset;
      const insetY = unit * (0.014 + depth * 0.032) - pulseOffset * 0.62;
      const splice = unit * deformation * 0.026 * Math.sin(time * (0.2 + movementGate * 0.18) + frame * 1.4);
      context.strokeStyle = rgba(colors[frame % colors.length], coreAlpha * (0.4 + depth * 0.28));
      context.lineWidth = lineWidth * (0.82 + drives.bassLayer * 1.3 + evolution.bassImpact * (2.2 - depth));
      context.beginPath();
      context.moveTo(insetX + splice, insetY);
      context.lineTo(width - insetX, insetY + splice * 0.24);
      context.lineTo(width - insetX - splice, height - insetY);
      context.lineTo(insetX, height - insetY - splice * 0.24);
      context.closePath();
      context.stroke();
    }
  } else if (scene === "matrix_rain") {
    const columnCount = 2 + Math.floor(
      evolution.structureLevel * 5
        + drives.midLayer * 2
        + drives.trebleLayer * 2
        + evolution.trebleImpact * 3,
    );
    const headHeight = unit * (0.012 + drives.bassLayer * 0.035 + evolution.pulse * 0.03) * reachScale;
    for (let column = 0; column < columnCount; column += 1) {
      const side = column % 2;
      const lane = Math.floor(column / 2) + 1;
      const x = side ? width - unit * (0.018 + lane * 0.016) : unit * (0.018 + lane * 0.016);
      const travel = (randomUnit(seed, 65_100 + column) + time * (0.035 + movementGate * 0.075)) % 1.16;
      const y = height * (travel - 0.08);
      const color = colors[column % colors.length];
      context.fillStyle = rgba(color, coreAlpha * (0.42 + drives.trebleLayer * 0.4));
      context.fillRect(x - lineWidth, y - headHeight, lineWidth * (1.2 + evolution.lineWeight), headHeight);
    }
    const scanY = height * ((time * (0.025 + movementGate * 0.055) + randomUnit(seed, 65_300)) % 1);
    context.fillStyle = rgba(highlight, coreAlpha * (0.08 + evolution.snareFlash * 0.78 + evolution.trebleImpact * 0.2));
    context.fillRect(0, scanY, width, lineWidth * (0.55 + evolution.snareFlash * 5.2));
  } else if (scene === "ascii_terminal") {
    const packetCount = 2 + Math.floor(
      evolution.structureLevel * 4
        + drives.midLayer * 2
        + drives.trebleLayer
        + evolution.snareFlash * 2,
    );
    const fontSize = Math.max(9, unit * (0.009 + drives.bassLayer * 0.006 + evolution.beatPunch * 0.004));
    context.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.textBaseline = "middle";
    for (let packet = 0; packet < packetCount; packet += 1) {
      const side = packet % 2;
      const y = height * (packet + 0.7) / (packetCount + 0.4);
      const gate = width * (0.035 + drives.midLayer * 0.07 + evolution.pulse * 0.04) * reachScale;
      const jitter = (randomUnit(seed + tick, 65_700 + packet) - 0.5) * unit * deformation * 0.03 * movementGate;
      const x = side ? width - gate - jitter : gate + jitter;
      const color = colors[packet % colors.length];
      context.fillStyle = rgba(color, coreAlpha * (0.4 + evolution.trebleImpact * 0.48 + evolution.snareFlash * 0.2));
      context.textAlign = side ? "right" : "left";
      context.fillText(`${side ? ">" : "<"}${((seed + packet * 211 + tick) >>> 0).toString(16).slice(-4).toUpperCase()}`, x, y);
      context.fillRect(side ? x : 0, y + fontSize * 0.62, side ? width - x : x, lineWidth * (0.7 + evolution.beatPunch * 1.8));
    }
  } else if (scene === "pixel_sort_storm") {
    const shardCount = 3 + Math.floor(
      evolution.structureLevel * 6
        + drives.midLayer * 2
        + drives.trebleLayer * 3
        + evolution.snareFlash * 3
        + evolution.trebleImpact * 3,
    );
    for (let shard = 0; shard < shardCount; shard += 1) {
      const localSeed = seed + tick * 193 + shard * 29;
      const fromRight = shard % 2 === 1;
      const y = height * randomUnit(localSeed, 66_100 + shard);
      const length = width * (0.015 + drives.midLayer * 0.06 + evolution.snareFlash * 0.06 + evolution.trebleImpact * 0.04)
        * reachScale
        * (0.7 + randomUnit(seed, 66_200 + shard) * 0.6);
      const shardHeight = lineWidth * (0.8 + drives.bassLayer * 1.8 + evolution.bassImpact * (shard % 3 === 0 ? 5.4 : 1.4));
      const skew = unit * deformation * 0.022 * (randomUnit(localSeed, 66_300 + shard) - 0.5);
      context.fillStyle = rgba(colors[shard % colors.length], coreAlpha * (0.46 + drives.trebleLayer * 0.36));
      context.beginPath();
      context.moveTo(fromRight ? width : 0, y);
      context.lineTo(fromRight ? width - length : length, y + skew);
      context.lineTo(fromRight ? width - length : length, y + shardHeight + skew);
      context.lineTo(fromRight ? width : 0, y + shardHeight);
      context.closePath();
      context.fill();
    }
  } else if (scene === "lightning_switchyard") {
    const railCount = 2 + Math.floor(
      evolution.structureLevel * 3
        + drives.midLayer * 2
        + evolution.snareFlash * 2
        + evolution.trebleImpact * 3,
    );
    for (let rail = 0; rail < railCount; rail += 1) {
      const fromRight = rail % 2 === 1;
      const direction = fromRight ? -1 : 1;
      const originX = fromRight ? width : 0;
      const y = height * (rail + 1) / (railCount + 1);
      const length = width * (0.045 + drives.midLayer * 0.08 + evolution.pulse * 0.055) * reachScale;
      const color = colors[rail % colors.length];
      context.strokeStyle = rgba(color, coreAlpha * (0.4 + evolution.trebleImpact * 0.5 + evolution.snareFlash * 0.22));
      context.lineWidth = lineWidth * (0.9 + drives.bassLayer * 1.25 + evolution.bassImpact * 2.8);
      context.beginPath();
      context.moveTo(originX, y);
      for (let step = 1; step <= 7; step += 1) {
        const x = originX + direction * length * step / 7;
        const jag = (randomUnit(seed + tick, 66_700 + rail * 11 + step) - 0.5)
          * unit
          * (0.008 + deformation * 0.03);
        context.lineTo(x, y + jag);
      }
      context.stroke();
      const nodeX = originX + direction * length;
      const nodeRadius = lineWidth * (1.8 + drives.bassLayer * 3 + evolution.beatPunch * 3.4);
      context.fillStyle = rgba(color, coreAlpha * (0.58 + evolution.glowBloom * 0.32));
      context.beginPath();
      context.arc(nodeX, y, nodeRadius, 0, Math.PI * 2);
      context.fill();
    }
  } else if (scene === "laser_lattice") {
    const prismCount = 1 + Math.floor(
      evolution.structureLevel * 3
        + drives.tapestry * 2
        + evolution.midImpact * 2,
    );
    context.save();
    context.translate(width * 0.5, height * 0.5);
    context.rotate(Math.sin(time * 0.12) * deformation * 0.08 + evolution.hardBeat * 0.025);
    for (let prism = 0; prism < prismCount; prism += 1) {
      const depth = (prism + 1) / (prismCount + 1);
      const radiusX = width * (0.08 + depth * 0.35) * breathScale * (1 + evolution.beatPunch * 0.08);
      const radiusY = height * (0.055 + depth * 0.31) * (0.82 + evolution.breath * 0.18 + deformation * depth * 0.08);
      context.strokeStyle = rgba(colors[prism % colors.length], coreAlpha * (0.38 + depth * 0.3));
      context.lineWidth = lineWidth * (0.78 + drives.bassLayer * 1.05 + evolution.bassImpact * (1 - depth) * 2.8);
      context.beginPath();
      context.moveTo(0, -radiusY);
      context.lineTo(radiusX, 0);
      context.lineTo(0, radiusY);
      context.lineTo(-radiusX, 0);
      context.closePath();
      context.stroke();
    }
    context.restore();
  } else if (scene === "particle_pressure") {
    const ringCount = 2 + Math.floor(
      evolution.structureLevel * 3
        + drives.midLayer
        + drives.tapestry * 2
        + evolution.bassImpact * 2,
    );
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    for (let ring = 0; ring < ringCount; ring += 1) {
      const depth = (ring + 1) / (ringCount + 1);
      const radius = unit * (0.075 + depth * 0.38)
        * breathScale
        * (1 + evolution.beatPunch * (0.05 + depth * 0.08));
      context.strokeStyle = rgba(colors[ring % colors.length], coreAlpha * (0.34 + (1 - depth) * 0.34));
      context.lineWidth = lineWidth * (0.82 + drives.bassLayer * 1.35 + evolution.bassImpact * (2.8 - depth));
      context.beginPath();
      context.ellipse(
        centerX,
        centerY,
        radius * (1 + deformation * 0.1 * Math.sin(time * 0.2 + ring)),
        radius * (0.9 + deformation * 0.14 * Math.cos(time * 0.17 + ring)),
        evolution.rotation * 2,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
    if (evolution.hardBeat > 0.04) {
      const rayCount = 8 + Math.floor(drives.trebleLayer * 8);
      context.strokeStyle = rgba(highlight, coreAlpha * evolution.hardBeat * 0.86);
      context.lineWidth = lineWidth * (0.8 + evolution.hardBeat * 1.4);
      for (let ray = 0; ray < rayCount; ray += 1) {
        const angle = ray / rayCount * Math.PI * 2;
        const inner = unit * (0.12 + evolution.hardBeat * 0.04);
        const outer = unit * (0.2 + evolution.hardBeat * 0.26) * evolution.reach;
        context.beginPath();
        context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
        context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
        context.stroke();
      }
    }
  } else if (scene === "signal_constellation") {
    const nodeCount = 3 + Math.floor(
      evolution.structureLevel * 5
        + drives.midLayer * 2
        + drives.trebleLayer * 2
        + drives.tapestry * 3
        + evolution.trebleImpact * 2,
    );
    const nodes = Array.from({ length: nodeCount }, (_, node) => {
      const angle = node / nodeCount * Math.PI * 2 + time * 0.018 * movementGate;
      const radius = unit * (0.1 + node / nodeCount * 0.35)
        * breathScale
        * (1 + evolution.beatPunch * 0.1);
      return {
        x: width * 0.5 + Math.cos(angle) * radius,
        y: height * 0.5 + Math.sin(angle) * radius * (1.05 + deformation * 0.14),
      };
    });
    for (let node = 0; node < nodes.length; node += 1) {
      const from = nodes[node];
      const to = nodes[(node + 2 + Math.floor(evolution.finale * 2)) % nodes.length];
      const color = colors[node % colors.length];
      context.strokeStyle = rgba(color, coreAlpha * (0.3 + drives.midLayer * 0.38));
      context.lineWidth = lineWidth * (0.6 + drives.bassLayer * 0.9 + evolution.bassImpact * 2.2);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.quadraticCurveTo(width * 0.5, height * 0.5, to.x, to.y);
      context.stroke();
      const radius = lineWidth * (1.1 + drives.bassLayer * 1.6 + evolution.bassImpact * (node % 3 === 0 ? 4.4 : 1.4));
      context.fillStyle = rgba(color, coreAlpha * (0.52 + evolution.glowBloom * 0.34));
      context.beginPath();
      context.arc(from.x, from.y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  drawMusicBandEventAccents(
    context,
    width,
    height,
    time,
    mix,
    evolution,
    scene,
    primary,
    secondary,
    highlight,
    seed,
  );
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  context.restore();
}

function drawSeededMusicScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  bpm: number,
  mix: number,
  drives: RadioVisualAudioDrives,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (mix < 0.002) return;
  const scene = radioVisualMusicScene(seed);
  const layerPlan = radioVisualMusicSceneLayerPlan(scene, drives);
  const intensity = radioVisualMusicIntensityPlan(drives);
  const evolution = radioVisualMusicEvolutionPlan(scene, seed, time, drives, bpm);
  const evolvedTime = time * evolution.motionRate;
  const evolvedPrimary = mixRgb(primary, highlight, evolution.hueBlend);
  const evolvedSecondary = mixRgb(secondary, primary, evolution.hueBlend * 0.82);
  const evolvedHighlight = mixRgb(highlight, secondary, evolution.hueBlend * 0.56);
  const jitterTick = Math.floor(time * clampVisualValue(bpm, 55, 200) / 15);
  const jitterX = (randomUnit(seed + jitterTick, 64_100) - 0.5) * width * evolution.jitter * 0.009;
  const jitterY = (randomUnit(seed + jitterTick, 64_101) - 0.5) * height * evolution.jitter * 0.006;
  context.save();
  context.translate(
    width * (0.5 + evolution.translateXRatio) + jitterX,
    height * (0.5 + evolution.translateYRatio) + jitterY,
  );
  context.rotate(evolution.rotation);
  context.transform(1, evolution.shearY, evolution.shearX, 1, 0, 0);
  context.scale(evolution.scaleX, evolution.scaleY);
  context.translate(-width * 0.5, -height * 0.5);
  context.save();
  context.shadowColor = rgba(evolvedHighlight, chromaCoreAlpha(mix, drives.presence) * (0.08 + evolution.glowBloom * 0.28));
  context.shadowBlur = Math.min(width, height) * (0.001 + evolution.glowBloom * 0.007);
  const baseMix = mix * intensity.baseGain;
  if (scene === "edge_spectrum") drawEdgeSpectrum(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "oscilloscope_ribbons") drawOscilloscopeRibbons(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "tape_feedback") drawTapeFeedback(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "matrix_rain") drawMatrixRain(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "ascii_terminal") drawAsciiTerminal(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "pixel_sort_storm") drawPixelSortStorm(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "lightning_switchyard") drawLightningSwitchyard(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "laser_lattice") drawLaserLattice(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "particle_pressure") drawParticlePressure(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  if (scene === "signal_constellation") drawSignalConstellation(context, width, height, evolvedTime, baseMix, drives, layerPlan, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  context.restore();
  drawMusicLifecycleVariant(context, width, height, evolvedTime, mix * intensity.lifecycleGain, drives, evolution, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  drawMusicDynamicModulation(context, width, height, evolvedTime, mix * intensity.modulationGain, drives, evolution, scene, evolvedPrimary, evolvedSecondary, evolvedHighlight, seed);
  context.restore();
  drawMusicPerimeterIdentity(
    context,
    width,
    height,
    evolvedTime,
    mix * intensity.perimeterGain,
    drives,
    radioVisualMusicPerimeterPlan(scene, drives),
    mixRgb(primary, secondary, evolution.hueBlend * 0.42),
    mixRgb(secondary, highlight, evolution.hueBlend * 0.3),
    highlight,
    seed,
  );
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
    body: 0.34 + pulse * 0.18,
    bass: 0.2 + pulse * 0.16,
    mid: 0.3 + pulse * 0.2,
    treble: 0.38 + pulse * 0.24,
    bassLayer: 0.18 + pulse * 0.2,
    midLayer: 0.26 + pulse * 0.28,
    trebleLayer: 0.34 + pulse * 0.34,
    tapestry: 0.18 + pulse * 0.22,
    impact: pulse * 0.34,
    bassPulse: 0.18 + pulse * 0.16,
    midPulse: 0.26 + pulse * 0.2,
    treblePulse: 0.3 + pulse * 0.24,
    tapestryPulse: 0.16 + pulse * 0.24,
    build: 0.52 + pulse * 0.28,
    progress: (time * 0.018) % 1,
    phrase: (time * 0.08) % 1,
  };
  drawMatrixRain(
    context,
    width,
    height,
    time * 1.45,
    mix * 0.72,
    drives,
    radioVisualMusicSceneLayerPlan("matrix_rain", drives),
    primary,
    secondary,
    secondary,
    seed + 9_901,
  );
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

const BROADCAST_CODE_LINES = [
  "BOOT_SEQUENCE.INIT",
  "HANDSHAKE.EXE",
  "LINKED.PROCESS",
  "SYNC.PATCH",
  "SESSION_END.LOG",
  "PACKET_TRACE.OK",
  "BARCODE://LIVE",
  "SIGNAL_ROUTE_06",
];

function drawBroadcastFx(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  plan: RadioVisualBroadcastFxPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  centerPass = false,
): void {
  const strength = centerPass ? plan.centerStrength : plan.strength;
  if (!plan.active || strength < 0.002 || (centerPass && !plan.centerAllowed)) return;
  const unit = Math.min(width, height);
  const seed = plan.occurrenceSeed;
  const budget = centerPass ? plan.centerPrimitiveBudget : 10 + Math.floor(plan.detail * 14);
  const colors: Rgb[] = [primary, secondary, highlight];
  const travel = ease(plan.progress);
  context.save();
  context.globalCompositeOperation = plan.type === "chromatic_desync" || plan.type === "packet_trace"
    ? "lighter"
    : "source-over";

  if (plan.type === "crt_roll") {
    const y = height * travel;
    const gradient = context.createLinearGradient(0, y - unit * 0.08, 0, y + unit * 0.08);
    gradient.addColorStop(0, rgba(primary, 0));
    gradient.addColorStop(0.46, rgba(primary, strength * 0.12));
    gradient.addColorStop(0.5, rgba(highlight, strength * 0.42));
    gradient.addColorStop(0.54, rgba(secondary, strength * 0.1));
    gradient.addColorStop(1, rgba(secondary, 0));
    context.fillStyle = gradient;
    context.fillRect(0, y - unit * 0.08, width, unit * 0.16);
  } else if (plan.type === "scanline_stack") {
    const count = Math.max(2, Math.min(budget, 3 + Math.floor(plan.detail * 6)));
    for (let line = 0; line < count; line += 1) {
      const y = height * ((travel + line / count * 0.34 + randomUnit(seed, 61_000 + line) * 0.12) % 1);
      const lineHeight = Math.max(1, unit * (0.0012 + randomUnit(seed, 61_100 + line) * 0.003));
      context.fillStyle = rgba(colors[line % colors.length], strength * (0.28 + randomUnit(seed, 61_200 + line) * 0.48));
      context.fillRect(0, y, width, lineHeight);
    }
  } else if (plan.type === "signal_tear") {
    const count = Math.max(2, Math.min(budget, 2 + Math.floor(plan.detail * 5)));
    for (let tear = 0; tear < count; tear += 1) {
      const y = height * (0.12 + randomUnit(seed, 61_300 + tear) * 0.76);
      const amplitude = unit * (0.004 + plan.detail * 0.018);
      context.strokeStyle = rgba(colors[tear % colors.length], strength * (0.42 + plan.detail * 0.36));
      context.lineWidth = Math.max(1.5, unit * (0.0014 + randomUnit(seed, 61_400 + tear) * 0.002));
      context.beginPath();
      for (let step = 0; step <= 12; step += 1) {
        const x = width * step / 12;
        const offset = (randomUnit(seed + Math.floor(time * 5), 61_500 + tear * 17 + step) - 0.5) * amplitude;
        if (step === 0) context.moveTo(x, y + offset);
        else context.lineTo(x, y + offset);
      }
      context.stroke();
    }
  } else if (plan.type === "frame_stutter") {
    const count = Math.max(2, Math.min(budget, 2 + Math.floor(plan.detail * 4)));
    for (let frame = 0; frame < count; frame += 1) {
      const insetX = width * (0.025 + frame * 0.018);
      const insetY = height * (0.03 + frame * 0.014);
      const offset = (frame % 2 ? -1 : 1) * unit * strength * (0.012 + frame * 0.004);
      context.strokeStyle = rgba(colors[frame % colors.length], strength * (0.32 + frame * 0.06));
      context.lineWidth = Math.max(1.5, unit * 0.0018);
      context.strokeRect(insetX + offset, insetY, width - insetX * 2, height - insetY * 2);
    }
  } else if (plan.type === "chromatic_desync") {
    const offsets: Array<[Rgb, number]> = [[primary, -1], [highlight, 0], [secondary, 1]];
    for (let channel = 0; channel < offsets.length; channel += 1) {
      const [color, direction] = offsets[channel];
      const offset = direction * unit * (0.003 + strength * 0.022);
      context.strokeStyle = rgba(color, strength * (channel === 1 ? 0.34 : 0.5));
      context.lineWidth = Math.max(1.5, unit * 0.002);
      context.strokeRect(unit * 0.018 + offset, unit * 0.018, width - unit * 0.036, height - unit * 0.036);
    }
  } else if (plan.type === "barcode_sweep") {
    const count = Math.max(3, Math.min(budget, 5 + Math.floor(plan.detail * 8)));
    const centerX = width * (-0.08 + travel * 1.16);
    for (let bar = 0; bar < count; bar += 1) {
      const barWidth = Math.max(1, unit * (0.0015 + randomUnit(seed, 61_600 + bar) * 0.006));
      const x = centerX + (bar - count * 0.5) * unit * 0.012;
      const barHeight = height * (0.18 + randomUnit(seed, 61_700 + bar) * 0.62);
      const y = (height - barHeight) * randomUnit(seed, 61_800 + bar);
      context.fillStyle = rgba(colors[bar % colors.length], strength * (0.32 + randomUnit(seed, 61_900 + bar) * 0.5));
      context.fillRect(x, y, barWidth, barHeight);
    }
  } else if (plan.type === "code_breach" || plan.type === "terminal_packet") {
    const count = Math.max(2, Math.min(budget, 2 + Math.floor(plan.detail * 5)));
    const fontSize = Math.max(9, unit * (centerPass ? 0.011 : 0.014));
    context.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.textBaseline = "middle";
    for (let row = 0; row < count; row += 1) {
      const text = BROADCAST_CODE_LINES[(Math.floor(randomUnit(seed, 62_000 + row) * BROADCAST_CODE_LINES.length) + row) % BROADCAST_CODE_LINES.length];
      const fromRight = row % 2 === 1;
      const x = width * (fromRight ? 0.98 - travel * 0.34 : 0.02 + travel * 0.34);
      const y = height * (0.14 + randomUnit(seed, 62_100 + row) * 0.72);
      context.textAlign = fromRight ? "right" : "left";
      context.fillStyle = rgba(colors[row % colors.length], strength * (0.38 + randomUnit(seed, 62_200 + row) * 0.42));
      context.fillText(text, x, y, width * 0.48);
      if (plan.type === "terminal_packet" && row < Math.ceil(count / 2)) {
        const boxWidth = Math.min(width * 0.34, context.measureText(text).width + unit * 0.025);
        context.strokeStyle = rgba(colors[(row + 1) % colors.length], strength * 0.28);
        context.lineWidth = Math.max(1, unit * 0.0012);
        context.strokeRect(fromRight ? x - boxWidth : x, y - fontSize, boxWidth, fontSize * 2);
      }
    }
  } else if (plan.type === "bit_noise") {
    const count = 8 + Math.floor(plan.detail * 18);
    for (let bit = 0; bit < count; bit += 1) {
      const x = width * randomUnit(seed + Math.floor(time * 4), 62_300 + bit);
      const y = height * randomUnit(seed + Math.floor(time * 4), 62_400 + bit);
      const size = Math.max(1, unit * (0.001 + randomUnit(seed, 62_500 + bit) * 0.004));
      context.fillStyle = rgba(colors[bit % colors.length], strength * (0.2 + randomUnit(seed, 62_600 + bit) * 0.5));
      context.fillRect(x, y, size * (bit % 3 === 0 ? 4 : 1), size);
    }
  } else if (plan.type === "sync_dropout") {
    const count = Math.max(2, Math.min(budget, 2 + Math.floor(plan.detail * 4)));
    for (let strip = 0; strip < count; strip += 1) {
      const y = height * (0.16 + randomUnit(seed, 62_700 + strip) * 0.68);
      const stripHeight = Math.max(2, unit * (0.002 + randomUnit(seed, 62_800 + strip) * 0.006));
      const start = width * randomUnit(seed, 62_900 + strip) * 0.42;
      const stripWidth = width * (0.22 + randomUnit(seed, 63_000 + strip) * 0.5);
      context.fillStyle = rgba([2, 2, 6], strength * 0.52);
      context.fillRect(start, y, stripWidth, stripHeight);
      context.fillStyle = rgba(colors[strip % colors.length], strength * 0.46);
      context.fillRect(start + unit * 0.008, y, stripWidth * 0.46, Math.max(1, stripHeight * 0.22));
    }
  } else if (plan.type === "packet_trace") {
    const count = Math.max(2, Math.min(budget, 2 + Math.floor(plan.detail * 5)));
    for (let trace = 0; trace < count; trace += 1) {
      const direction = trace % 2 ? -1 : 1;
      const x = direction > 0 ? width * (-0.12 + travel * 1.24) : width * (1.12 - travel * 1.24);
      const y = height * (0.12 + randomUnit(seed, 63_100 + trace) * 0.76);
      const length = unit * (0.035 + randomUnit(seed, 63_200 + trace) * 0.09);
      context.strokeStyle = rgba(colors[trace % colors.length], strength * (0.46 + plan.detail * 0.32));
      context.lineWidth = Math.max(1.5, unit * (0.0015 + randomUnit(seed, 63_300 + trace) * 0.002));
      context.beginPath();
      context.moveTo(x - direction * length, y);
      context.lineTo(x, y);
      context.lineTo(x - direction * unit * 0.012, y - unit * 0.008);
      context.moveTo(x, y);
      context.lineTo(x - direction * unit * 0.012, y + unit * 0.008);
      context.stroke();
    }
  } else if (plan.type === "compression_blocks") {
    const count = Math.max(3, Math.min(budget, 4 + Math.floor(plan.detail * 6)));
    for (let block = 0; block < count; block += 1) {
      const blockWidth = width * (0.025 + randomUnit(seed, 63_400 + block) * 0.11);
      const blockHeight = height * (0.012 + randomUnit(seed, 63_500 + block) * 0.055);
      const x = width * randomUnit(seed, 63_600 + block);
      const y = height * randomUnit(seed, 63_700 + block);
      context.fillStyle = rgba(colors[block % colors.length], strength * (0.18 + randomUnit(seed, 63_800 + block) * 0.42));
      context.fillRect(x, y, blockWidth, blockHeight);
    }
  }
  context.restore();
}

function drawMusicGestureSweep(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: RadioVisualWindowIntrusionPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
): void {
  if (plan.musicSweepProgress === null || plan.musicSweepStrength < 0.002) return;
  const unit = Math.min(width, height);
  const progress = ease(plan.musicSweepProgress);
  const direction = randomUnit(plan.musicSweepSeed, 64_001) > 0.5 ? 1 : -1;
  const x = direction > 0 ? width * (-0.12 + progress * 1.24) : width * (1.12 - progress * 1.24);
  const yBase = height * (0.2 + randomUnit(plan.musicSweepSeed, 64_002) * 0.58);
  const curve = Math.sin(progress * Math.PI) * unit * (plan.musicGesture === "melodic_lift" ? 0.1 : 0.035);
  const y = yBase - curve;
  const trailCount = plan.musicGesture === "instrumental_break" ? 5 : plan.musicGesture === "melodic_lift" ? 4 : 3;
  const colors: Rgb[] = plan.musicGesture === "vocal_pattern"
    ? [secondary, highlight, secondary]
    : [primary, secondary, highlight];
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let trail = 0; trail < trailCount; trail += 1) {
    const trailX = x - direction * trail * unit * 0.035;
    const length = unit * (0.018 + (trailCount - trail) * 0.009);
    context.fillStyle = rgba(colors[trail % colors.length], plan.musicSweepStrength * (0.34 + (trailCount - trail) * 0.11));
    context.fillRect(direction > 0 ? trailX - length : trailX, y + (trail % 2 ? unit * 0.006 : 0), length, Math.max(1.5, unit * 0.003));
  }
  context.restore();
}

/**
 * A tiny event-only allow-list that softens the performer-window cutout.
 * It never replays a dense family renderer: at most two bass contours, two
 * mid flashes, four treble sparks, and one all-band sweep can cross the field.
 */
function drawMusicTransientIntrusions(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: RadioVisualWindowIntrusionPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
): void {
  const strongest = Math.max(
    plan.bassBreachStrength,
    plan.midFlashStrength,
    plan.trebleSparkStrength,
    plan.tapestryBurstStrength,
  );
  if (strongest < 0.002) return;
  const unit = Math.min(width, height);
  const centerX = width * 0.5;
  const centerY = height * 0.44;
  const bass = clampVisualValue(plan.bassBreachStrength / 0.28);
  const mids = clampVisualValue(plan.midFlashStrength / 0.34);
  const treble = clampVisualValue(plan.trebleSparkStrength / 0.3);
  const tapestry = clampVisualValue(plan.tapestryBurstStrength / 0.38);
  const codeFamily = plan.musicScene === "matrix_rain" || plan.musicScene === "ascii_terminal";
  const angularFamily = plan.musicScene === "tape_feedback"
    || plan.musicScene === "pixel_sort_storm"
    || plan.musicScene === "lightning_switchyard";
  const orbitalFamily = plan.musicScene === "laser_lattice"
    || plan.musicScene === "particle_pressure"
    || plan.musicScene === "signal_constellation";
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  if (bass >= 0.02) {
    context.strokeStyle = rgba(primary, plan.bassBreachStrength * (0.58 + bass * 0.38));
    context.lineWidth = Math.max(1.5, unit * (0.002 + bass * 0.009));
    context.shadowColor = rgba(primary, plan.bassBreachStrength * 0.82);
    context.shadowBlur = unit * (0.008 + bass * 0.022);
    for (let contour = 0; contour < 2; contour += 1) {
      const contourDepth = contour * unit * (0.018 + bass * 0.012);
      context.beginPath();
      if (orbitalFamily) {
        context.ellipse(
          centerX,
          centerY,
          width * (0.14 + bass * 0.12) + contourDepth,
          height * (0.1 + bass * 0.09) + contourDepth,
          contour ? -0.08 : 0.08,
          0,
          Math.PI * 2,
        );
      } else {
        const halfWidth = width * (0.12 + bass * 0.13) + contourDepth;
        const halfHeight = height * (0.085 + bass * 0.08) + contourDepth;
        context.rect(
          centerX - halfWidth,
          centerY - halfHeight,
          halfWidth * 2,
          halfHeight * 2,
        );
      }
      context.stroke();
    }
  }

  if (mids >= 0.02) {
    const y = centerY + (randomUnit(plan.transientSeed, 68_101) - 0.5) * height * 0.24;
    context.shadowColor = rgba(highlight, plan.midFlashStrength);
    context.shadowBlur = unit * (0.01 + mids * 0.03);
    context.strokeStyle = rgba(highlight, plan.midFlashStrength * (0.62 + mids * 0.34));
    context.fillStyle = rgba(highlight, plan.midFlashStrength * (0.48 + mids * 0.42));
    context.lineWidth = Math.max(1.5, unit * (0.0018 + mids * 0.008));
    if (codeFamily) {
      context.font = `900 ${Math.max(10, unit * (0.011 + mids * 0.006))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const text = plan.musicScene === "matrix_rain" ? "// MID HIT //" : "[SYNC::ACK]";
      context.fillText(text, centerX, y);
      context.fillRect(centerX - width * (0.08 + mids * 0.12), y + unit * 0.018, width * (0.16 + mids * 0.24), Math.max(1.5, unit * 0.002));
    } else if (angularFamily) {
      const reach = width * (0.1 + mids * 0.18);
      context.beginPath();
      context.moveTo(centerX - reach, y - unit * (0.018 + mids * 0.025));
      context.lineTo(centerX - reach * 0.22, y);
      context.lineTo(centerX + reach * 0.16, y - unit * mids * 0.012);
      context.lineTo(centerX + reach, y + unit * (0.018 + mids * 0.025));
      context.stroke();
    } else if (orbitalFamily) {
      context.beginPath();
      context.arc(centerX, centerY, unit * (0.06 + mids * 0.11), -Math.PI * 0.2, Math.PI * 1.15);
      context.stroke();
    } else {
      const reach = width * (0.09 + mids * 0.17);
      context.beginPath();
      context.moveTo(centerX - reach, y);
      context.lineTo(centerX + reach, y);
      context.moveTo(centerX - reach * 0.68, y + unit * 0.014);
      context.lineTo(centerX + reach * 0.42, y + unit * 0.014);
      context.stroke();
    }
  }

  if (treble >= 0.02) {
    const sparkCount = Math.min(4, 1 + Math.floor(treble * 4));
    context.shadowColor = rgba(highlight, plan.trebleSparkStrength);
    context.shadowBlur = unit * (0.008 + treble * 0.02);
    context.lineWidth = Math.max(1, unit * (0.0012 + treble * 0.0025));
    for (let spark = 0; spark < sparkCount; spark += 1) {
      const angle = randomUnit(plan.transientSeed, 68_300 + spark) * Math.PI * 2;
      const orbit = unit * (0.055 + randomUnit(plan.transientSeed, 68_400 + spark) * 0.13);
      const x = centerX + Math.cos(angle) * orbit;
      const y = centerY + Math.sin(angle) * orbit * 1.18;
      const length = unit * (0.014 + treble * 0.035);
      context.strokeStyle = rgba(spark % 2 ? secondary : highlight, plan.trebleSparkStrength * (0.6 + treble * 0.34));
      context.beginPath();
      context.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
  }

  if (tapestry >= 0.02) {
    const angle = randomUnit(plan.transientSeed, 68_701) * Math.PI - Math.PI * 0.5;
    const length = unit * (0.18 + tapestry * 0.22);
    context.strokeStyle = rgba(secondary, plan.tapestryBurstStrength * (0.62 + tapestry * 0.34));
    context.lineWidth = Math.max(1.5, unit * (0.002 + tapestry * 0.006));
    context.shadowColor = rgba(secondary, plan.tapestryBurstStrength);
    context.shadowBlur = unit * (0.012 + tapestry * 0.028);
    context.beginPath();
    context.moveTo(centerX - Math.cos(angle) * length, centerY - Math.sin(angle) * length);
    context.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
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
  const railReach = width * (0.08 + opening * 0.24);
  const performerGapLeft = width * 0.34;
  const performerGapRight = width * 0.66;
  const railHeight = Math.max(5, unit * (0.006 + (1 - opening) * 0.008));
  for (let rail = 0; rail < 10; rail += 1) {
    const y = height * (rail + 0.5) / 10;
    const jitter = width * randomUnit(seed, 40_200 + rail) * 0.04;
    const color = rail % 2 ? secondary : primary;
    context.fillStyle = rgba(color, coreAlpha * (0.54 + (rail % 3) * 0.12));
    const railWidth = Math.min(railReach + jitter, performerGapLeft);
    context.fillRect(0, y, railWidth, railHeight);
    context.fillRect(width - railWidth, y, railWidth, railHeight);
  }
  const shutterHeight = height * (0.018 + opening * 0.065);
  const topGradient = context.createLinearGradient(0, 0, 0, shutterHeight);
  topGradient.addColorStop(0, rgba(primary, coreAlpha * 0.72));
  topGradient.addColorStop(1, rgba(primary, 0));
  context.fillStyle = topGradient;
  context.fillRect(0, 0, width, shutterHeight);
  const bottomGradient = context.createLinearGradient(0, height - shutterHeight, 0, height);
  bottomGradient.addColorStop(0, rgba(secondary, 0));
  bottomGradient.addColorStop(1, rgba(secondary, coreAlpha * 0.72));
  context.fillStyle = bottomGradient;
  context.fillRect(0, height - shutterHeight, width, shutterHeight);

  const scanY = height * ease(progress);
  context.fillStyle = rgba(highlight, coreAlpha * (0.48 + envelope * 0.32));
  context.fillRect(0, scanY, performerGapLeft, Math.max(3, unit * 0.004));
  context.fillRect(performerGapRight, scanY, width - performerGapRight, Math.max(3, unit * 0.004));
  context.fillStyle = rgba(progress < 0.5 ? primary : secondary, coreAlpha * 0.36);
  const echoY = Math.min(height - unit * 0.012, scanY + unit * 0.012);
  context.fillRect(0, echoY, performerGapLeft, Math.max(2, unit * 0.0025));
  context.fillRect(performerGapRight, echoY, width - performerGapRight, Math.max(2, unit * 0.0025));

  context.strokeStyle = rgba(opening < 0.55 ? primary : secondary, coreAlpha * 0.86);
  context.lineWidth = Math.max(5, unit * (0.006 + (1 - opening) * 0.005));
  context.strokeRect(unit * 0.018, unit * 0.018, width - unit * 0.036, height - unit * 0.036);
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

function drawWheelEventAccent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  rotationPhase: number,
  progress: number,
  envelope: number,
  eventType: RadioVisualEventType,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  const unit = Math.min(width, height);
  const strength = eventType === "wheel_gained" ? 0.76 : eventType === "wheel_spinning" ? 0.62 : 0.54;
  const coreAlpha = chromaCoreAlpha(envelope * strength) * (0.72 + Math.sin(progress * Math.PI) * 0.28);
  const accentCount = eventType === "wheel_spinning" ? 4 : eventType === "wheel_gained" ? 3 : 2;
  context.save();
  context.translate(width * 0.5, height * RADIO_VISUALS_WHEEL_CENTER_Y_RATIO);
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  for (let accent = 0; accent < accentCount; accent += 1) {
    const radius = unit * (0.478 + accent * 0.0045);
    const angle = rotationPhase + randomUnit(seed, 42_100 + accent) * Math.PI * 2;
    const span = 0.16 + randomUnit(seed, 42_200 + accent) * 0.24;
    const color = accent === 0 ? highlight : accent % 2 ? secondary : primary;
    context.shadowColor = rgba(color, coreAlpha * 0.46);
    context.shadowBlur = unit * 0.009;
    context.strokeStyle = rgba(color, coreAlpha * 0.42);
    context.lineWidth = Math.max(3, unit * (0.004 + accent * 0.0007));
    context.beginPath();
    context.arc(0, 0, radius, angle - span, angle + span);
    context.stroke();
    context.shadowBlur = 0;
    context.strokeStyle = rgba(highlight, coreAlpha * 0.74);
    context.lineWidth = Math.max(1.2, unit * 0.0014);
    context.stroke();
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
  wheelPhase = 0,
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
    drawWheelEventAccent(context, width, height, wheelPhase, progress, envelope, event.type, primary, secondary, highlight, seed);
    return;
  }
  if (event.type === "intake_opened" || event.type === "intake_closed") {
    const apertureProgress = event.type === "intake_opened" ? progress : 1 - progress;
    drawIntakeAperture(context, width, height, time * 1.8, envelope * (0.5 + apertureProgress * 0.5), primary, secondary, seed);
    drawBorderPulse(context, width, height, apertureProgress, envelope * 0.42, seed, primary, secondary, highlight, 3);
    return;
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

function tracePortalSpiral(
  context: CanvasRenderingContext2D,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  turns: number,
  direction: number,
  turbulence: number,
  rotationPhase: number,
  seed: number,
): void {
  const steps = 52;
  const rippleCount = 3 + Math.floor(randomUnit(seed, 27_101) * 4);
  const ripplePhase = randomUnit(seed, 27_102) * Math.PI * 2;
  context.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const angle = startAngle
      + direction * progress * Math.PI * 2 * turns
      + direction * rotationPhase * (0.12 + randomUnit(seed, 27_103) * 0.18);
    const ripple = Math.sin(progress * Math.PI * rippleCount + ripplePhase + rotationPhase * direction * 0.7)
      * (outerRadius - innerRadius) * (0.025 + turbulence * 0.028);
    const radius = innerRadius + (outerRadius - innerRadius) * ease(progress) + ripple;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
}

function tracePortalCaustic(
  context: CanvasRenderingContext2D,
  radius: number,
  amplitude: number,
  harmonics: number,
  phase: number,
): void {
  const steps = 72;
  context.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const angle = step / steps * Math.PI * 2;
    const warp = Math.sin(angle * harmonics + phase) * amplitude
      + Math.sin(angle * (harmonics + 2.7) - phase * 0.61) * amplitude * 0.36;
    const localRadius = radius + warp;
    const x = Math.cos(angle) * localRadius;
    const y = Math.sin(angle) * localRadius;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function drawPortalRimLightning(
  context: CanvasRenderingContext2D,
  unit: number,
  innerRadius: number,
  outerRadius: number,
  rotationPhase: number,
  strength: number,
  turbulence: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
  count: number,
): void {
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "miter";
  for (let strike = 0; strike < count; strike += 1) {
    const direction = randomUnit(seed, 30_101 + strike) > 0.46 ? 1 : -1;
    const startAngle = randomUnit(seed, 30_201 + strike) * Math.PI * 2
      + rotationPhase * direction * (0.34 + randomUnit(seed, 30_301 + strike) * 0.44);
    const span = direction * (0.19 + randomUnit(seed, 30_401 + strike) * (0.22 + turbulence * 0.09));
    const steps = 10 + Math.floor(randomUnit(seed, 30_501 + strike) * 7);
    const channel = strike % 3 === 0 ? highlight : strike % 2 ? secondary : primary;
    context.beginPath();
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      const angle = startAngle + span * progress;
      const orbit = innerRadius
        + (outerRadius - innerRadius) * (0.25 + randomUnit(seed, 30_700 + strike * 31 + step) * 0.7)
        + Math.sin(progress * Math.PI * (3 + strike % 3)) * unit * 0.0035 * turbulence;
      const x = Math.cos(angle) * orbit;
      const y = Math.sin(angle) * orbit;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.shadowColor = rgba(channel, 0.48 * strength);
    context.shadowBlur = unit * (0.007 + turbulence * 0.006);
    context.strokeStyle = rgba(channel, 0.2 * strength);
    context.lineWidth = Math.max(3, unit * (0.006 + turbulence * 0.002));
    context.stroke();
    context.shadowBlur = unit * 0.003;
    context.strokeStyle = rgba(highlight, 0.72 * strength);
    context.lineWidth = Math.max(1.5, unit * 0.0018);
    context.stroke();
  }
  context.restore();
}

function drawPortalOuterTendrils(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  outerRadius: number,
  rotationPhase: number,
  strength: number,
  turbulence: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
  count: number,
): void {
  const unit = Math.min(width, height);
  const rootRadius = outerRadius - unit * 0.002;
  const edgePadding = Math.max(1.5, unit * 0.002);
  const colors: Rgb[] = [primary, secondary, highlight];
  context.save();
  context.translate(centerX, centerY);
  context.beginPath();
  context.rect(-centerX, -centerY, width, height);
  context.arc(0, 0, rootRadius, 0, Math.PI * 2, true);
  context.clip("evenodd");
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "miter";
  for (let channelIndex = 0; channelIndex < colors.length; channelIndex += 1) {
    const color = colors[channelIndex];
    context.beginPath();
    for (let tendril = channelIndex; tendril < count; tendril += colors.length) {
      const direction = randomUnit(seed, 31_100 + tendril) > 0.46 ? 1 : -1;
      const angle = tendril / count * Math.PI * 2
        + randomUnit(seed, 31_200 + tendril) * 0.32
        + rotationPhase * direction * (0.24 + randomUnit(seed, 31_300 + tendril) * 0.26);
      const edgeRadius = radioVisualsPortalStageEdgeRadius(
        width,
        height,
        centerX,
        centerY,
        angle,
        edgePadding,
      );
      if (!Number.isFinite(edgeRadius) || edgeRadius <= rootRadius) continue;
      const steps = 6 + Math.floor(randomUnit(seed, 31_400 + tendril) * 4);
      const angularSweep = direction * (0.018 + turbulence * 0.019 + randomUnit(seed, 31_500 + tendril) * 0.02);
      for (let step = 0; step <= steps; step += 1) {
        const progress = step / steps;
        const radialProgress = Math.pow(progress, 0.84);
        const radius = rootRadius + (edgeRadius - rootRadius) * radialProgress;
        const edgeEnvelope = Math.sin(progress * Math.PI);
        const stepJitter = (randomUnit(seed, 31_600 + tendril * 17 + step) - 0.5)
          * unit
          * (0.006 + turbulence * 0.008)
          * edgeEnvelope;
        const localAngle = angle + angularSweep * Math.sin(progress * Math.PI);
        const x = Math.cos(localAngle) * radius - Math.sin(localAngle) * stepJitter;
        const y = Math.sin(localAngle) * radius + Math.cos(localAngle) * stepJitter;
        if (step === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
    }
    context.shadowColor = rgba(color, strength * 0.42);
    context.shadowBlur = unit * (0.006 + turbulence * 0.004);
    context.strokeStyle = rgba(color, strength * 0.14);
    context.lineWidth = Math.max(3, unit * (0.004 + turbulence * 0.0018));
    context.stroke();
    context.shadowBlur = unit * 0.002;
    context.strokeStyle = rgba(color, strength * 0.52);
    context.lineWidth = Math.max(1.2, unit * (0.0015 + turbulence * 0.0007));
    context.stroke();
  }
  context.restore();
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
  candidateCount?: number,
): void {
  if (mix < 0.002) return;
  const drives = music ? radioVisualAudioDrives(music) : {
    presence: 0.2,
    body: 0.2,
    bass: 0.2,
    mid: 0.2,
    treble: 0.2,
    bassLayer: 0.12,
    midLayer: 0.12,
    trebleLayer: 0.12,
    tapestry: 0.08,
    impact: 0.1,
    bassPulse: 0.14,
    midPulse: 0.14,
    treblePulse: 0.14,
    tapestryPulse: 0.08,
    build: 0.28,
    progress: 0,
    phrase: 0,
  };
  const readyMode = sceneMode === "wheel_ready";
  const reencryptingMode = sceneMode === "wheel_reencrypting";
  const resultMode = sceneMode === "wheel_result";
  const confirmedMode = sceneMode === "wheel_confirmed";
  const releaseMode = resultMode || confirmedMode;
  const visualImpact = Math.max(drives.impact, confirmedMode ? 0.84 : resultMode ? 0.7 : 0);
  const unit = Math.min(width, height);
  const band = radioVisualsWheelBand(candidateCount);
  const portal = radioVisualsPortalProfile(candidateCount);
  const stateEnergy = readyMode ? 0.88 : reencryptingMode ? 1.1 : releaseMode ? 0.82 : 1;
  const portalStrength = portal.strength * stateEnergy;
  const turbulence = portal.turbulence * (0.86 + visualImpact * 0.22);
  const outerRadius = unit * portal.outerRatio;
  const wispyInnerRadius = unit * portal.wispInnerRatio;
  const hardInnerRadius = Math.min(unit * band.innerCenterRatio, outerRadius - unit * 0.007);
  const hardGeometryOuterRadius = Math.max(
    hardInnerRadius,
    Math.min(outerRadius - unit * 0.003, unit * (band.outerCenterRatio + 0.015)),
  );
  const coreAlpha = chromaCoreAlpha(mix, drives.presence);
  const centerX = width * 0.5;
  const centerY = height * RADIO_VISUALS_WHEEL_CENTER_Y_RATIO;
  const portalVoid: Rgb = [2, 2, 6];

  // A faint lens reaches the labels, but all opaque depth and high-energy
  // geometry remains in the count-calibrated outer zone.
  radialLight(
    context,
    width,
    height,
    centerX,
    centerY,
    wispyInnerRadius * 1.02,
    confirmedMode ? highlight : secondary,
    mix * (0.018 + portalStrength * 0.022 + (releaseMode ? 0.01 : 0)),
  );

  // Jagged exterior material carries the vortex beyond the circular rim to
  // the clipped portrait-stage edges. It begins outside every name and never
  // enters the hollow candidate field.
  drawPortalOuterTendrils(
    context,
    width,
    height,
    centerX,
    centerY,
    outerRadius,
    rotationPhase,
    coreAlpha * Math.min(1.12, 0.66 + portalStrength * 0.3),
    turbulence,
    primary,
    secondary,
    highlight,
    seed,
    portal.outerTendrilCount,
  );

  context.save();
  context.translate(centerX, centerY);
  const throat = context.createRadialGradient(0, 0, hardInnerRadius, 0, 0, outerRadius);
  throat.addColorStop(0, rgba(highlight, coreAlpha * 0.018));
  throat.addColorStop(0.24, rgba(portalVoid, coreAlpha * (0.11 + turbulence * 0.035)));
  throat.addColorStop(0.66, rgba(portalVoid, coreAlpha * (0.34 + portalStrength * 0.13)));
  throat.addColorStop(0.86, rgba(highlight, coreAlpha * (0.18 + turbulence * 0.08)));
  throat.addColorStop(1, rgba(primary, coreAlpha * (0.42 + portalStrength * 0.14)));
  context.fillStyle = throat;
  context.beginPath();
  context.arc(0, 0, outerRadius, 0, Math.PI * 2);
  context.arc(0, 0, hardInnerRadius, 0, Math.PI * 2, true);
  context.fill("evenodd");

  // The outer halo provides scale and depth without throwing blur across the
  // candidate field. The rotating material below carries the actual motion.
  context.shadowColor = rgba(primary, coreAlpha * 0.48);
  context.shadowBlur = unit * (0.012 + turbulence * 0.008);
  context.strokeStyle = rgba(primary, coreAlpha * (0.22 + portalStrength * 0.16));
  context.lineWidth = unit * (0.008 + turbulence * 0.003);
  context.beginPath();
  context.arc(0, 0, outerRadius - unit * 0.0035, 0, Math.PI * 2);
  context.stroke();
  context.shadowBlur = 0;
  context.shadowColor = "transparent";

  context.rotate(rotationPhase);
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  // Broad translucent spiral sheets make the rim read as a dimensional
  // tunnel even with one candidate. Their inward reach grows only as labels
  // get denser and smaller.
  for (let ribbon = 0; ribbon < portal.ribbonCount; ribbon += 1) {
    const direction = (ribbon + (seed & 1)) % 4 === 0 ? -1 : 1;
    const startAngle = ribbon / portal.ribbonCount * Math.PI * 2
      + randomUnit(seed, 27_500 + ribbon) * 0.48;
    const ribbonOuterRadius = outerRadius - unit * (0.006 + randomUnit(seed, 27_600 + ribbon) * 0.012);
    const ribbonInnerRadius = wispyInnerRadius
      + (hardInnerRadius - wispyInnerRadius) * randomUnit(seed, 27_700 + ribbon) * 0.62;
    tracePortalSpiral(
      context,
      ribbonInnerRadius,
      ribbonOuterRadius,
      startAngle,
      0.56 + randomUnit(seed, 27_800 + ribbon) * (0.34 + turbulence * 0.12),
      direction,
      turbulence,
      rotationPhase,
      seed + ribbon * 977,
    );
    const color = ribbon % 4 === 0 ? highlight : ribbon % 3 === 0 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.07 + portalStrength * 0.055));
    context.lineWidth = unit * (0.012 + randomUnit(seed, 27_900 + ribbon) * 0.012 + turbulence * 0.004);
    context.stroke();
    context.strokeStyle = rgba(color, coreAlpha * (0.28 + portalStrength * 0.1));
    context.lineWidth = Math.max(1.8, unit * (0.0022 + randomUnit(seed, 28_000 + ribbon) * 0.003));
    context.stroke();
  }

  // Continuous warped caustics replace the old stack of dashed circles. Hard
  // caustics honor the label-safe band; small Wheels still retain the full
  // translucent tunnel above.
  const causticCount = band.edgeOnly
    ? Math.min(4, portal.ribbonCount)
    : Math.min(portal.ribbonCount, band.maxRings + 3);
  for (let ribbon = 0; ribbon < causticCount; ribbon += 1) {
    const lane = (ribbon + 0.5) / causticCount;
    const radius = hardInnerRadius + (hardGeometryOuterRadius - hardInnerRadius) * lane;
    const availableWidth = Math.max(unit * 0.003, hardGeometryOuterRadius - hardInnerRadius);
    const amplitude = Math.min(
      availableWidth * 0.28,
      unit * (0.003 + turbulence * 0.0035 + randomUnit(seed, 28_100 + ribbon) * 0.003),
    );
    const phase = randomUnit(seed, 28_200 + ribbon) * Math.PI * 2
      + rotationPhase * (ribbon % 2 ? -0.46 : 0.62);
    tracePortalCaustic(context, radius, amplitude, 2 + (ribbon % 5), phase);
    const color = ribbon % 5 === 0 ? highlight : ribbon % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.36 + portalStrength * 0.16));
    context.lineWidth = Math.max(2.2, unit * (0.003 + drives.bass * 0.002 + portalStrength * 0.0012));
    context.stroke();
    if (ribbon % 3 === 0) {
      context.strokeStyle = rgba(highlight, coreAlpha * (0.3 + drives.treblePulse * 0.24));
      context.lineWidth = Math.max(1.2, unit * 0.0014);
      context.stroke();
    }
  }

  // Curved suction streaks flow through the tunnel instead of sitting on the
  // circumference as rectangular dots.
  for (let streak = 0; streak < portal.streakCount; streak += 1) {
    const direction = streak % 5 === 0 ? -1 : 1;
    const phase = randomUnit(seed, 28_700 + streak);
    const angle = randomUnit(seed, 28_800 + streak) * Math.PI * 2
      + rotationPhase * direction * (0.32 + randomUnit(seed, 28_900 + streak) * 1.24);
    const orbit = wispyInnerRadius
      + (hardGeometryOuterRadius - wispyInnerRadius) * Math.pow(phase, 0.72);
    const span = direction * (0.025 + randomUnit(seed, 29_000 + streak) * (0.065 + turbulence * 0.025));
    const color = streak % 11 === 0 ? highlight : streak % 3 === 0 ? secondary : primary;
    context.strokeStyle = rgba(color, coreAlpha * (0.16 + (1 - phase) * 0.2 + portalStrength * 0.08));
    context.lineWidth = Math.max(1.2, unit * (0.0014 + randomUnit(seed, 29_100 + streak) * 0.0024));
    context.beginPath();
    context.arc(0, 0, orbit, angle - span, angle);
    context.stroke();
  }

  drawPortalRimLightning(
    context,
    unit,
    hardInnerRadius,
    outerRadius - unit * 0.004,
    rotationPhase,
    coreAlpha * Math.min(1.12, 0.68 + portalStrength * 0.32),
    turbulence,
    primary,
    secondary,
    highlight,
    seed,
    portal.lightningArcCount,
  );
  context.restore();

  if (visualImpact > 0.34 || releaseMode) {
    context.save();
    const lockRadius = outerRadius - unit * 0.008;
    context.strokeStyle = rgba(confirmedMode ? highlight : resultMode ? secondary : primary, coreAlpha * Math.max(visualImpact, 0.52) * 0.92);
    context.lineWidth = Math.min(unit * 0.006, Math.max(3, unit * (0.0038 + visualImpact * 0.0022)));
    if (confirmedMode) {
      const sealCount = 8;
      for (let seal = 0; seal < sealCount; seal += 1) {
        const angle = seal / sealCount * Math.PI * 2;
        const span = 0.065;
        context.beginPath();
        context.arc(width * 0.5, height * RADIO_VISUALS_WHEEL_CENTER_Y_RATIO, lockRadius, angle - span, angle + span);
        context.stroke();
      }
    } else {
      context.beginPath();
      context.ellipse(width * 0.5, height * RADIO_VISUALS_WHEEL_CENTER_Y_RATIO, lockRadius, lockRadius, 0, 0, Math.PI * 2);
      context.stroke();
    }
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

function drawWindowScanline(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  strength: number,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
): void {
  if (strength < 0.002) return;
  const boundedProgress = clampVisualValue(progress);
  const envelope = Math.sin(boundedProgress * Math.PI) * clampVisualValue(strength);
  const unit = Math.min(width, height);
  const y = height * (0.1 + ease(boundedProgress) * 0.8);
  const color = randomUnit(seed, 23_102) > 0.54 ? secondary : primary;
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, rgba(color, 0));
  gradient.addColorStop(0.22, rgba(color, envelope * 0.36));
  gradient.addColorStop(0.5, rgba(highlight, envelope * 0.64));
  gradient.addColorStop(0.78, rgba(color, envelope * 0.36));
  gradient.addColorStop(1, rgba(color, 0));
  context.save();
  context.fillStyle = gradient;
  context.fillRect(0, y, width, Math.max(1.5, unit * 0.0022));
  context.globalAlpha = 0.42;
  context.fillRect(0, y + unit * 0.009, width, Math.max(1, unit * 0.0012));
  context.restore();
}

function drawWindowSignalStutter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: RadioVisualWindowIntrusionPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
): void {
  if (plan.stutterProgress === null || plan.stutterStrength < 0.002) return;
  const envelope = Math.sin(plan.stutterProgress * Math.PI) * clampVisualValue(plan.stutterStrength);
  const unit = Math.min(width, height);
  const localSeed = plan.stutterSeed;
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let fragment = 0; fragment < plan.stutterStripCount; fragment += 1) {
    const y = height * (0.17 + randomUnit(localSeed, 23_300 + fragment) * 0.58);
    const stripHeight = Math.max(1.5, unit * (0.0014 + randomUnit(localSeed, 23_400 + fragment) * 0.0026));
    const stripWidth = width * (0.12 + randomUnit(localSeed, 23_500 + fragment) * 0.16);
    const baseX = width * (0.16 + randomUnit(localSeed, 23_600 + fragment) * 0.5);
    const jitter = unit
      * (0.004 + randomUnit(localSeed, 23_700 + fragment) * 0.014)
      * (fragment % 2 ? 1 : -1);
    const gradient = context.createLinearGradient(baseX + jitter, 0, baseX + jitter + stripWidth, 0);
    gradient.addColorStop(0, rgba(fragment % 2 ? secondary : primary, 0));
    gradient.addColorStop(0.18, rgba(fragment % 2 ? secondary : primary, envelope * 0.18));
    gradient.addColorStop(0.52, rgba(highlight, envelope * 0.3));
    gradient.addColorStop(0.84, rgba(fragment % 2 ? primary : secondary, envelope * 0.16));
    gradient.addColorStop(1, rgba(fragment % 2 ? primary : secondary, 0));
    context.fillStyle = gradient;
    context.fillRect(baseX + jitter, y, stripWidth, stripHeight);
  }
  context.restore();
}

function drawPerformerWindowIntrusions(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  plan: RadioVisualWindowIntrusionPlan,
  broadcastFxPlan: RadioVisualBroadcastFxPlan,
  primary: Rgb,
  secondary: Rgb,
  highlight: Rgb,
  seed: number,
  cue: RadioVisualsSnapshot["cue"],
  cueProgress: number | null,
  cueSeed: number,
): void {
  if (!plan.active && !broadcastFxPlan.centerAllowed) return;

  drawBroadcastFx(
    context,
    width,
    height,
    time,
    broadcastFxPlan,
    primary,
    secondary,
    highlight,
    true,
  );
  drawMusicGestureSweep(context, width, height, plan, primary, secondary, highlight);
  drawMusicTransientIntrusions(context, width, height, plan, primary, secondary, highlight);

  // A sparse scan may cross the performer field, but dense scene geometry is
  // never replayed here. This is an explicit allow-list, not a weaker global
  // mask.
  if (plan.scanProgress !== null) {
    drawWindowScanline(
      context,
      width,
      height,
      plan.scanProgress,
      plan.scanStrength,
      primary,
      secondary,
      highlight,
      seed,
    );
  }
  drawWindowSignalStutter(
    context,
    width,
    height,
    plan,
    primary,
    secondary,
    highlight,
  );

  if (plan.lightningFamilyStrength >= 0.002) {
    drawLightningTree(
      context,
      width,
      height,
      seed + Math.floor(time * 0.9) * 131,
      plan.lightningFamilyStrength,
      primary,
      secondary,
      highlight,
    );
  }

  if (cue?.type === "lightning" && cueProgress !== null && plan.lightningCueStrength >= 0.002) {
    context.save();
    context.globalAlpha = 0.32;
    drawLightningCue(context, width, height, cueProgress, plan.lightningCueStrength, primary, highlight, cueSeed);
    context.restore();
  }
  if (cue?.type === "signal_breach" && plan.signalBreachProgress !== null) {
    drawWindowScanline(
      context,
      width,
      height,
      plan.signalBreachProgress,
      plan.signalBreachStrength,
      secondary,
      primary,
      highlight,
      cueSeed,
    );
  }
}

function visualSignalMemory(snapshot: RadioVisualsSnapshot): VisualSignalMemory {
  return {
    sessionActive: snapshot.sessionActive,
    showStage: snapshot.showStage,
    visualMode: snapshot.visualMode,
    sceneMode: snapshot.sceneMode,
    visualSeed: snapshot.visualSeed,
    intakeOpen: snapshot.signals.intakeOpen,
    broadcastPhase: snapshot.signals.broadcastPhase,
    wheelSpinsOwed: snapshot.signals.wheelSpinsOwed,
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
    snapshot.signals.broadcastPhase ?? "none",
    snapshot.signals.wheelSpinsOwed,
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

  if (radioVisualBroadcastStartedTransition(previous, current)) {
    emit("show_started", `broadcast:${previous.broadcastPhase ?? "none"}:${current.showStage}`);
  }
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
  authoritativeSnapshot: boolean,
): void {
  const elapsedMs = runtime.lastFrameMs > 0 ? Math.min(100, timestampMs - runtime.lastFrameMs) : 16;
  runtime.lastFrameMs = timestampMs;
  const palette = radioVisualsPalette(snapshot);
  const paletteLerp = 1 - Math.exp(-elapsedMs / PALETTE_TRANSITION_MS);
  runtime.primary = mixRgb(runtime.primary, hexToRgb(palette.primary), paletteLerp);
  runtime.secondary = mixRgb(runtime.secondary, hexToRgb(palette.secondary), paletteLerp);
  runtime.highlight = mixRgb(runtime.highlight, hexToRgb(palette.highlight), paletteLerp);
  runtime.intensity += (radioVisualsIntensity(snapshot) - runtime.intensity) * (1 - Math.exp(-elapsedMs / 1_800));
  const wheelTargetMix = snapshot.visualMode === "wheel" ? 1 : 0;
  const wheelMixResponseMs = wheelTargetMix > runtime.wheelMix ? 520 : 950;
  runtime.wheelMix += (wheelTargetMix - runtime.wheelMix) * (1 - Math.exp(-elapsedMs / wheelMixResponseMs));
  runtime.systemMix += ((snapshot.visualMode === "system" ? 1 : 0) - runtime.systemMix) * (1 - Math.exp(-elapsedMs / 1_100));
  runtime.queueMix += ((snapshot.visualMode === "queue" ? 1 : 0) - runtime.queueMix) * (1 - Math.exp(-elapsedMs / 1_700));
  runtime.trackMix += ((snapshot.visualMode === "track" ? 1 : 0) - runtime.trackMix) * (1 - Math.exp(-elapsedMs / 1_500));
  runtime.intakeMix += ((snapshot.showStage === "intake" ? 1 : 0) - runtime.intakeMix) * (1 - Math.exp(-elapsedMs / 2_000));
  runtime.finalMix += ((snapshot.showStage === "final" ? 1 : 0) - runtime.finalMix) * (1 - Math.exp(-elapsedMs / 2_300));
  runtime.completeMix += ((snapshot.showStage === "complete" ? 1 : 0) - runtime.completeMix) * (1 - Math.exp(-elapsedMs / 2_600));
  runtime.pressureMix += (pressureTarget(snapshot) - runtime.pressureMix) * (1 - Math.exp(-elapsedMs / 2_400));

  if (runtime.currentSeed !== snapshot.visualSeed) runtime.currentSeed = snapshot.visualSeed;
  const musicTransition = advanceRadioVisualMusicTransition({
    currentSeed: runtime.currentMusicSeed,
    previousSeed: runtime.previousMusicSeed,
    startedAtMs: runtime.musicTransitionStartedAtMs,
  }, snapshot.visualMode, snapshot.visualSeed, timestampMs);
  if (musicTransition.currentSeed !== runtime.currentMusicSeed) {
    runtime.currentMusicSeed = musicTransition.currentSeed;
    runtime.previousMusicSeed = musicTransition.previousSeed;
    runtime.musicTransitionStartedAtMs = musicTransition.startedAtMs;
    // A new song must not inherit the previous song's loud chorus as its
    // opening state. The actual incoming audio attacks immediately below,
    // while all structural and transient followers begin from a clean floor.
    runtime.music = {
      ...runtime.music,
      energy: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      beat: 0,
      accent: 0,
      peak: 0,
    };
    runtime.bassSlow = 0;
    runtime.midSlow = 0;
    runtime.trebleSlow = 0;
    runtime.buildMemory = 0;
    runtime.bassOnset = 0;
    runtime.midOnset = 0;
    runtime.trebleOnset = 0;
    if (snapshot.visualMode === "track") runtime.bloomStartedAtMs = timestampMs;
  }
  if (snapshot.visualMode === "track" && runtime.trackProgressSeed !== snapshot.visualSeed) {
    runtime.trackProgressSeed = snapshot.visualSeed;
    runtime.trackProgressStartedAtMs = timestampMs;
  } else if (snapshot.visualMode !== "track") {
    runtime.trackProgressSeed = null;
    runtime.trackProgressStartedAtMs = timestampMs;
  }

  const musicSeedBlend = ease((timestampMs - runtime.musicTransitionStartedAtMs) / PARTICLE_TRANSITION_MS);
  const playbackSeconds = projectedPlaybackSeconds(snapshot.player, anchor, timestampMs);
  const transportSeconds = timestampMs / 1_000;
  const trackElapsedSeconds = runtime.trackProgressSeed === snapshot.visualSeed
    ? Math.max(0, timestampMs - runtime.trackProgressStartedAtMs) / 1_000
    : 0;
  runtime.music = smoothMusicSignal(
    runtime.music,
    radioVisualsMusicSignal(snapshot, playbackSeconds, transportSeconds, freshRadioAudioBridgeSignal(bridgeSignal), trackElapsedSeconds),
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
    if (authoritativeSnapshot) observeSnapshotEvents(snapshot, runtime, serverNowMs);
  } else {
    runtime.wheelMix = 0;
    runtime.systemMix = 0;
    runtime.queueMix = 0;
    runtime.trackMix = 0;
    runtime.intakeMix = 0;
    runtime.finalMix = 0;
    runtime.completeMix = 0;
    runtime.pressureMix = 0;
    runtime.syntheticEvents = [];
    if (authoritativeSnapshot && activeSurfaceMix === 0) {
      // Retain the last real inactive observation so a placed source can infer
      // broadcast start after the short authoritative event window. Never use
      // the fabricated client fallback as evidence of a transition.
      runtime.observedSignals = visualSignalMemory(snapshot);
      runtime.observedSnapshotKey = snapshotObservationKey(snapshot);
    }
  }
  const musicDrives = reactiveAudioDrives(runtime, music, elapsedMs);
  const musicScene = radioVisualMusicScene(runtime.currentMusicSeed);
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
  const visualEvents = activeSurfaceMix > 0 ? activeVisualEvents(snapshot, runtime, serverNowMs) : [];
  const sceneStateMix = clampVisualValue(1 - Math.max(runtime.wheelMix, runtime.systemMix), 0, 1);
  const broadcastFxPlan = radioVisualBroadcastFxPlan({
    time: serverNowMs / 1_000,
    seed: runtime.currentSeed,
    sessionActive: snapshot.sessionActive || previewMode,
    showStage: snapshot.showStage,
    sceneMix: activeSurfaceMix * sceneStateMix,
    drives: musicDrives,
    cueType: snapshot.cue?.type ?? null,
  });
  const intrusionPlan = radioVisualWindowIntrusionPlan({
    time: audioTime,
    sceneMix: activeSurfaceMix * sceneStateMix,
    trackMix: runtime.trackMix,
    drives: musicDrives,
    musicScene,
    seed: runtime.currentSeed,
    cueType: snapshot.cue?.type ?? null,
    cueProgress,
    cueEnvelope,
  });

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
  const musicSceneActivity = music.source === "windows_loopback" || runtime.trackMix > 0.08
    ? radioVisualMusicSceneVisibility(musicDrives)
    : 0;
  // Keep the strong BARCODE transmission bed between songs, but let each
  // track's own scene language take over instead of flattening all ten into
  // the same bars, tracking lines, corners, and flecks.
  const sharedTransmissionRetention = clampVisualValue(1 - runtime.trackMix * 0.78, 0.22, 1);
  drawIdleTransmission(
    context,
    width,
    height,
    time,
    activeSurfaceMix * sharedTransmissionRetention * clampVisualValue(0.62 + runtime.intensity * 0.24, 0.62, 0.9),
    runtime.primary,
    runtime.secondary,
    runtime.highlight,
    runtime.currentSeed,
  );
  const activeMusicMix = runtime.trackMix * sceneStateMix;
  const drawSeedComposition = (seed: number, compositionMix: number) => {
    if (compositionMix < 0.002) return;
    const musicMix = clampVisualValue(
      activeSurfaceMix
        * activeMusicMix
        * compositionMix
        * musicSceneActivity
        * RADIO_VISUAL_MUSIC_OUTPUT_GAIN,
    );
    if (musicMix < 0.06) return;
    drawSeededMusicScene(context, width, height, audioTime, music.bpm, musicMix, musicDrives, runtime.primary, runtime.secondary, runtime.highlight, seed);
  };
  drawSeedComposition(runtime.previousMusicSeed, 1 - musicSeedBlend);
  drawSeedComposition(runtime.currentMusicSeed, musicSeedBlend);
  drawQueueLanes(context, width, height, time, runtime.queueMix * activeSurfaceMix, runtime.primary, runtime.secondary, runtime.currentSeed);
  drawIntakeAperture(context, width, height, time, runtime.intakeMix * activeSurfaceMix, runtime.primary, runtime.secondary, runtime.currentSeed);
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
    drawBroadcastFx(context, width, height, audioTime, broadcastFxPlan, runtime.primary, runtime.secondary, runtime.highlight);
    drawMusicGestureSweep(context, width, height, intrusionPlan, runtime.primary, runtime.secondary, runtime.highlight);
  }

  if (activeSurfaceMix > 0) {
    for (const event of visualEvents) {
      if (event.type === "show_started") continue;
      drawAutomaticEvent(context, width, height, time, event, serverNowMs, runtime.primary, runtime.secondary, runtime.highlight, shadow, motionScale, runtime.wheelPhase);
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
    if (snapshot.showStage !== "intake") applyPerformerSafeField(context, width, height, 0.2);
    outputContext.drawImage(effectLayer.canvas, 0, 0, width, height);
    drawPersistentBroadcastTexture(
      outputContext,
      runtime,
      width,
      height,
      audioTime,
      broadcastFxPlan.crtStrength,
      runtime.primary,
      runtime.highlight,
    );
    if (
      snapshot.showStage !== "intake"
      && activeSurfaceMix > 0
      && (intrusionPlan.active || broadcastFxPlan.centerStrength >= 0.002)
    ) {
      const intrusionLayer = prepareEffectLayer(runtime, width, height);
      if (intrusionLayer) {
        drawPerformerWindowIntrusions(
          intrusionLayer.context,
          width,
          height,
          audioTime,
          intrusionPlan,
          broadcastFxPlan,
          runtime.primary,
          runtime.secondary,
          runtime.highlight,
          runtime.currentSeed,
          snapshot.cue,
          cueProgress,
          cueSeed,
        );
        applyPerformerIntrusionField(intrusionLayer.context, width, height);
        outputContext.drawImage(intrusionLayer.canvas, 0, 0, width, height);
      }
    }
  }
  // The broadcast ignition is already an edge/top/bottom composition. Render
  // it after the ordinary performer mask so Start Broadcast cannot key away.
  for (const event of visualEvents) {
    if (event.type === "show_started") {
      drawAutomaticEvent(outputContext, width, height, time, event, serverNowMs, runtime.primary, runtime.secondary, runtime.highlight, shadow, motionScale, runtime.wheelPhase);
    }
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
    snapshot.signals.wheelCandidateCount,
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
  const serverSnapshotRef = useRef<RadioVisualsSnapshot | null>(null);
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
    currentMusicSeed: 2166136261,
    previousMusicSeed: 2166136261,
    musicTransitionStartedAtMs: 0,
    trackProgressSeed: null,
    trackProgressStartedAtMs: 0,
    bloomStartedAtMs: Number.NEGATIVE_INFINITY,
    wheelMix: 0,
    systemMix: 0,
    queueMix: 0,
    trackMix: 0,
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
      progress: 0,
      phrase: 0,
    },
    ...INITIAL_AUDIO_REACTION,
    observedSnapshotKey: "",
    observedSignals: null,
    syntheticEvents: [],
    effectCanvas: null,
    effectContext: null,
    crtCanvas: null,
    crtContext: null,
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
        serverSnapshotRef.current = payload.snapshot;
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
        serverSnapshotRef.current === snapshot,
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
