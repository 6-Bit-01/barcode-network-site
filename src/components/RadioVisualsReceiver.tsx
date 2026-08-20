"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { RadioVisualsPlayerSignal, RadioVisualsShowStage, RadioVisualsSnapshot } from "@/lib/radio-visuals";
import { RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS, RADIO_VISUALS_STANDBY_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";

type ServerClockAnchor = { serverNowMs: number; receivedAtPerformanceMs: number };
type ConnectionState = "connected" | "reconnecting" | "standby";

const RETRY_POLL_INTERVAL_MS = 5_000;

function fallbackSnapshot(): RadioVisualsSnapshot {
  return {
    sessionActive: false,
    showStage: "standby",
    visualMode: "standby",
    scene: {
      mode: "standby",
      title: "BARCODE RADIO",
      subtitle: "RECEIVER STANDBY",
      message: "Standing by for the next transmission.",
    },
    queue: {
      acceptedCount: 0,
      completedCount: 0,
      activeCount: 0,
      remainingCount: 0,
      currentPosition: 0,
      progress: 0,
      pressure: "low",
    },
    track: null,
    player: null,
    visualSeed: 2166136261,
    updatedAt: new Date().toISOString(),
  };
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function projectedPlaybackSeconds(player: RadioVisualsPlayerSignal | null, anchor: ServerClockAnchor | null, nowPerformanceMs: number): number {
  if (!player) return 0;
  const updatedAtMs = new Date(player.updatedAt).getTime();
  const serverNowMs = anchor
    ? anchor.serverNowMs + Math.max(0, nowPerformanceMs - anchor.receivedAtPerformanceMs)
    : Date.now();
  const elapsedSeconds = player.playbackState === "playing" && Number.isFinite(updatedAtMs)
    ? Math.max(0, serverNowMs - updatedAtMs) / 1000
    : 0;
  const projected = Math.max(0, player.currentTimeSeconds + elapsedSeconds);
  return player.durationSeconds ? Math.min(player.durationSeconds, projected) : projected;
}

function stageLabel(stage: RadioVisualsShowStage): string {
  if (stage === "intake") return "INTAKE";
  if (stage === "early") return "OPENING RUN";
  if (stage === "middle") return "MID SHOW";
  if (stage === "late") return "LATE SHOW";
  if (stage === "final") return "FINAL STRETCH";
  if (stage === "complete") return "TRANSMISSION COMPLETE";
  return "RECEIVER STANDBY";
}

function paletteFor(snapshot: RadioVisualsSnapshot): { primary: string; secondary: string; wash: string } {
  if (snapshot.visualMode === "wheel") return { primary: "#67e8f9", secondary: "#c4b5fd", wash: "rgba(34,211,238,0.22)" };
  if (snapshot.visualMode === "sponsor") return { primary: "#fbbf24", secondary: "#fb7185", wash: "rgba(251,191,36,0.20)" };
  if (snapshot.visualMode === "system") return { primary: "#fb923c", secondary: "#ef4444", wash: "rgba(251,146,60,0.22)" };
  if (snapshot.showStage === "late" || snapshot.showStage === "final") return { primary: "#ff4040", secondary: "#f472b6", wash: "rgba(255,0,0,0.22)" };
  if (snapshot.showStage === "middle") return { primary: "#ff2b2b", secondary: "#a78bfa", wash: "rgba(167,139,250,0.18)" };
  if (snapshot.showStage === "complete") return { primary: "#a7f3d0", secondary: "#67e8f9", wash: "rgba(167,243,208,0.18)" };
  return { primary: "#ff2b2b", secondary: "#f8fafc", wash: "rgba(255,0,0,0.16)" };
}

function showIntensity(snapshot: RadioVisualsSnapshot): number {
  const byStage: Record<RadioVisualsShowStage, number> = {
    standby: 0.18,
    intake: 0.32,
    early: 0.48,
    middle: 0.62,
    late: 0.78,
    final: 0.92,
    complete: 0.38,
  };
  let intensity = byStage[snapshot.showStage];
  if (snapshot.visualMode === "wheel") intensity = 1;
  if (snapshot.visualMode === "sponsor") intensity = 0.58;
  if (snapshot.visualMode === "system") intensity = 0.72;
  if (snapshot.player?.playbackState === "playing") intensity += 0.12;
  if (snapshot.player?.playbackState === "paused") intensity -= 0.12;
  return clamp(intensity, 0.12, 1);
}

function drawVisualFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestampMs: number,
  snapshot: RadioVisualsSnapshot,
  anchor: ServerClockAnchor | null,
  reducedMotion: boolean,
): void {
  const palette = paletteFor(snapshot);
  const intensity = showIntensity(snapshot);
  const playbackSeconds = projectedPlaybackSeconds(snapshot.player, anchor, timestampMs);
  const playbackProgress = snapshot.player?.durationSeconds
    ? clamp(playbackSeconds / snapshot.player.durationSeconds)
    : 0;
  const seed = snapshot.visualSeed || 1;
  const seedPhase = (seed % 997) / 997 * Math.PI * 2;
  const baseSpeed = snapshot.player?.playbackState === "playing" ? 1 : snapshot.player?.playbackState === "paused" ? 0.22 : 0.42;
  const motionScale = reducedMotion ? 0.16 : 1;
  const time = timestampMs / 1000 * baseSpeed * motionScale + playbackSeconds * 0.035;
  const actualEnergy = typeof snapshot.player?.audioEnergy === "number" ? clamp(snapshot.player.audioEnergy) : null;
  const proceduralEnergy = 0.44 + 0.25 * Math.sin(time * 2.3 + seedPhase) + 0.16 * Math.sin(time * 5.1 + seedPhase * 0.4);
  const energy = clamp(actualEnergy ?? proceduralEnergy, 0.08, 1);

  context.clearRect(0, 0, width, height);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "rgba(2,2,5,0.98)");
  background.addColorStop(0.48, "rgba(9,5,14,0.96)");
  background.addColorStop(1, "rgba(2,2,4,0.98)");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * (0.22 + playbackProgress * 0.56), height * 0.48, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.62);
  glow.addColorStop(0, palette.wash);
  glow.addColorStop(0.48, "rgba(40,12,38,0.08)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.12 + intensity * 0.08;
  context.strokeStyle = palette.secondary;
  context.lineWidth = Math.max(0.5, height * 0.002);
  const gridGap = Math.max(24, Math.min(width, height) * 0.15);
  const drift = (time * gridGap * 0.2) % gridGap;
  for (let x = -height + drift; x < width + height; x += gridGap) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + height * 0.48, height);
    context.stroke();
  }
  context.restore();

  const barCount = Math.max(28, Math.min(96, Math.floor(width / Math.max(8, height * 0.052))));
  const barGap = width / barCount;
  const baseLine = height * 0.67;
  for (let index = 0; index < barCount; index += 1) {
    const normalized = index / Math.max(1, barCount - 1);
    const seeded = Math.sin(index * 1.73 + seedPhase) * 0.5 + 0.5;
    const pulse = Math.abs(Math.sin(time * (2.2 + seeded * 1.8) + index * 0.47 + seedPhase));
    const envelope = 0.3 + 0.7 * Math.sin(normalized * Math.PI);
    const barHeight = height * (0.035 + (0.11 + intensity * 0.21) * pulse * envelope * energy);
    context.globalAlpha = 0.18 + pulse * 0.48;
    context.fillStyle = index / barCount < Math.max(snapshot.queue.progress, playbackProgress * 0.18) ? palette.primary : palette.secondary;
    context.fillRect(index * barGap, baseLine - barHeight / 2, Math.max(1, barGap * 0.38), barHeight);
  }
  context.globalAlpha = 1;

  for (let rail = 0; rail < 3; rail += 1) {
    context.beginPath();
    const railY = height * (0.32 + rail * 0.115);
    for (let x = 0; x <= width; x += Math.max(3, width / 220)) {
      const normalized = x / Math.max(1, width);
      const wave = Math.sin(normalized * Math.PI * (4 + rail * 2) + time * (1.4 + rail * 0.35) + seedPhase)
        + Math.sin(normalized * Math.PI * 13 - time * 0.8 + rail) * 0.38;
      const y = railY + wave * height * (0.012 + intensity * 0.026) * energy;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.globalAlpha = 0.22 + rail * 0.12;
    context.strokeStyle = rail === 1 ? palette.primary : palette.secondary;
    context.lineWidth = Math.max(1, height * (rail === 1 ? 0.006 : 0.003));
    context.stroke();
  }
  context.globalAlpha = 1;

  if (snapshot.visualMode === "wheel") {
    const radius = Math.min(width, height) * 0.31;
    context.save();
    context.translate(width * 0.5, height * 0.5);
    context.rotate(time * 0.9);
    context.setLineDash([radius * 0.22, radius * 0.08]);
    context.strokeStyle = palette.primary;
    context.globalAlpha = 0.65;
    context.lineWidth = Math.max(2, height * 0.018);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  context.fillStyle = palette.primary;
  context.globalAlpha = 0.88;
  context.fillRect(0, height - Math.max(2, height * 0.018), width * clamp(snapshot.queue.progress), Math.max(2, height * 0.018));
  if (snapshot.player?.durationSeconds) {
    context.fillStyle = palette.secondary;
    context.fillRect(0, 0, width * playbackProgress, Math.max(1, height * 0.009));
  }
  context.globalAlpha = 1;
}

export function RadioVisualsReceiver() {
  const [snapshot, setSnapshot] = useState<RadioVisualsSnapshot>(() => fallbackSnapshot());
  const [connection, setConnection] = useState<ConnectionState>("standby");
  const [clockAnchor, setClockAnchor] = useState<ServerClockAnchor | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
        const serverNowMs = typeof payload.serverNow === "string" ? new Date(payload.serverNow).getTime() : Number.NaN;
        if (Number.isFinite(serverNowMs)) {
          setClockAnchor({ serverNowMs, receivedAtPerformanceMs });
          setClockTick(receivedAtPerformanceMs);
        }
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
    if (snapshot.player?.playbackState !== "playing") return;
    const intervalId = window.setInterval(() => setClockTick(performance.now()), 500);
    return () => window.clearInterval(intervalId);
  }, [snapshot.player?.playbackState]);

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
      drawVisualFrame(context, bounds.width, bounds.height, timestampMs, snapshot, clockAnchor, reducedMotion);
    };
    frameId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frameId);
  }, [snapshot, clockAnchor]);

  const playbackSeconds = useMemo(
    () => projectedPlaybackSeconds(snapshot.player, clockAnchor, clockTick),
    [snapshot.player, clockAnchor, clockTick],
  );
  const playbackProgress = snapshot.player?.durationSeconds ? clamp(playbackSeconds / snapshot.player.durationSeconds) : 0;
  const currentCounter = snapshot.queue.acceptedCount > 0
    ? `${String(snapshot.queue.currentPosition).padStart(2, "0")} / ${String(snapshot.queue.acceptedCount).padStart(2, "0")}`
    : "-- / --";
  const headline = snapshot.track?.artistName ?? snapshot.scene.title;
  const subhead = snapshot.track?.trackTitle ?? snapshot.scene.subtitle ?? snapshot.scene.message ?? stageLabel(snapshot.showStage);
  const playerLabel = snapshot.player
    ? `${snapshot.player.provider.toUpperCase()} · ${snapshot.player.playbackState.toUpperCase()}`
    : snapshot.track ? "PLAYER LINK WAITING" : stageLabel(snapshot.showStage);
  const connectionLabel = connection === "connected" ? "LIVE SIGNAL" : connection === "reconnecting" ? "RECONNECTING" : "AUTO STANDBY";
  const style = {
    "--radio-show-progress": `${snapshot.queue.progress * 100}%`,
    "--radio-track-progress": `${playbackProgress * 100}%`,
  } as CSSProperties;

  return (
    <section
      className={`radio-visuals-shell radio-visuals-shell--${snapshot.visualMode} radio-visuals-shell--${snapshot.showStage}`}
      data-player-state={snapshot.player?.playbackState ?? "waiting"}
      style={style}
    >
      <canvas ref={canvasRef} className="radio-visuals-canvas" aria-hidden="true" />
      <div className="radio-visuals-scan" aria-hidden="true" />
      <div className="radio-visuals-frame" aria-hidden="true" />

      <div className="radio-visuals-content" aria-live="polite">
        <header className="radio-visuals-header">
          <span className="radio-visuals-brand"><b>B</b> BARCODE RADIO</span>
          <span className={`radio-visuals-connection radio-visuals-connection--${connection}`}><i />{connectionLabel}</span>
        </header>

        <div className="radio-visuals-readout">
          <div className="radio-visuals-position">
            <span>{snapshot.track ? "TRACK" : "QUEUE"}</span>
            <strong>{currentCounter}</strong>
            <em>{stageLabel(snapshot.showStage)}</em>
          </div>

          <div className="radio-visuals-identity">
            <span>{snapshot.visualMode === "track" ? "NOW TRANSMITTING" : snapshot.scene.title}</span>
            <h1>{headline}</h1>
            <p>{subhead}</p>
          </div>

          <div className="radio-visuals-player">
            <span>{playerLabel}</span>
            <strong>{snapshot.player ? formatClock(playbackSeconds) : String(snapshot.queue.remainingCount).padStart(2, "0")}</strong>
            <em>{snapshot.player?.durationSeconds ? `/ ${formatClock(snapshot.player.durationSeconds)}` : snapshot.sessionActive ? "TRACKS REMAIN" : "NEXT SHOW"}</em>
          </div>
        </div>

        <footer className="radio-visuals-footer">
          <span>SHOW {Math.round(snapshot.queue.progress * 100)}%</span>
          <div className="radio-visuals-progress"><i /><b /></div>
          <span>{snapshot.queue.pressure.toUpperCase()} PRESSURE</span>
        </footer>
      </div>
    </section>
  );
}
