/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject } from "react";
import { buildWheelSegments, estimateOneWayNetworkTransitMs, playbackCorrectionTarget, roundPlaybackDriftSeconds, serverRelativeSyncAgeSeconds, shouldCorrectPlaybackDrift, updateTransitEstimateMs, wheelFinalRotationForSegment, wheelUprightLabelRotationDegrees } from "@/lib/live-overlay-resolver";
import type { LiveOverlayPlaybackState, LiveOverlayTikTokSync, LiveOverlayYouTubeSync, ResolvedLiveOverlayScene } from "@/lib/live-overlay";
import { LIVE_OVERLAY_POLL_INTERVAL_MS, WHEEL_OVERLAY_ACTIVE_POLL_INTERVAL_MS, WHEEL_OVERLAY_SHOW_IDLE_POLL_INTERVAL_MS, WHEEL_OVERLAY_STANDBY_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { hasActiveQueueSession, startSessionBoundPolling } from "@/lib/session-bound-polling";
import type { WheelOverlaySnapshot } from "@/lib/wheel-overlay";

type YTPlayer = {
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  mute: () => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    YT?: { Player: new (elementId: string | HTMLElement, options: Record<string, unknown>) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function fallbackScene(): ResolvedLiveOverlayScene {
  return {
    mode: "standby",
    resolvedMode: "standby",
    reason: "Waiting for overlay state.",
    title: "BARCODE RADIO",
    subtitle: "RECEIVER STANDBY",
    message: "Standing by for the next transmission.",
    priority: 0,
    automatic: true,
    overrideActive: false,
    wheelOverlayActive: false,
    wheelSpinsOwed: 0,
    updatedAt: new Date().toISOString(),
  };
}

function modeLabel(mode: ResolvedLiveOverlayScene["mode"]): string {
  if (mode === "now_playing") return "NOW PLAYING";
  if (mode === "artist_card") return "ARTIST CARD";
  if (mode === "wheel_ready") return "WHEEL READY";
  if (mode === "wheel_reencrypting") return "RE-ENCRYPTING";
  if (mode === "wheel_spinning") return "WHEEL SPINNING";
  if (mode === "wheel_result") return "WHEEL RESULT";
  if (mode === "wheel_confirmed") return "WHEEL CHOSEN";
  if (mode === "video_placeholder") return "VIDEO LINK";
  if (mode === "system_message") return "SYSTEM";
  if (mode === "session_active") return "LIVE INTAKE";
  if (mode === "sponsor") return "SPONSOR";
  return "STANDBY";
}

function frameTone(mode: ResolvedLiveOverlayScene["mode"]): string {
  if (mode === "wheel_ready" || mode === "wheel_reencrypting" || mode === "wheel_spinning" || mode === "wheel_result" || mode === "wheel_confirmed") return "live-overlay-stage--wheel";
  if (mode === "sponsor" || mode === "system_message") return "live-overlay-stage--message";
  if (mode === "video_placeholder") return "live-overlay-stage--video";
  return "";
}

function showTrack(scene: ResolvedLiveOverlayScene): boolean {
  return Boolean((scene.mode === "now_playing" || scene.mode === "artist_card") && scene.track);
}

function isPlainTikTokMessage(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tiktokOverlayErrorLabel(code?: number | null): string {
  if (code === 1001) return "INVALID VIDEO SIGNAL";
  if (code === 2001) return "TIKTOK SERVER ERROR";
  if (code === 3001) return "VIDEO PLAYBACK ERROR";
  if (code === 3002) return "TIKTOK PLAYER ERROR";
  return "TIKTOK PLAYER ERROR";
}

function youtubeErrorLabel(code?: number | null): string {
  if (code === 2) return "INVALID VIDEO SIGNAL";
  if (code === 5) return "HTML5 PLAYBACK UNAVAILABLE";
  if (code === 100) return "VIDEO UNAVAILABLE";
  if (code === 101 || code === 150) return "EMBED PLAYBACK DISABLED";
  return code ? "YOUTUBE PLAYBACK ERROR" : "YOUTUBE PLAYER UNAVAILABLE";
}

const OVERLAY_POLL_DELAY_MS = LIVE_OVERLAY_POLL_INTERVAL_MS;
const YOUTUBE_OVERLAY_READY_TIMEOUT_MS = 9_000;
const TIKTOK_IFRAME_LOAD_TIMEOUT_MS = 20_000;
const TIKTOK_PLAYER_EVENT_TIMEOUT_MS = 12_000;
const TIKTOK_DELAYED_PLAY_MS = 100;
const TIKTOK_ORIGIN = "https://www.tiktok.com";
const YOUTUBE_BEHIND_THRESHOLD_SECONDS = 0.20;
const YOUTUBE_AHEAD_THRESHOLD_SECONDS = 0.70;
const YOUTUBE_PAUSED_DRIFT_THRESHOLD_SECONDS = 0.25;
const YOUTUBE_MAX_CATCH_UP_SECONDS = 0.20;
const TIKTOK_BEHIND_THRESHOLD_SECONDS = 0.30;
const TIKTOK_AHEAD_THRESHOLD_SECONDS = 0.85;
const TIKTOK_PAUSED_DRIFT_THRESHOLD_SECONDS = 0.35;
const TIKTOK_MAX_CATCH_UP_SECONDS = 0.30;
const PLAYER_CORRECTION_COOLDOWN_MS = 1_500;

type OverlaySyncDiagnostic = { driftSeconds?: number; driftDirection?: "ahead" | "behind" | "aligned"; correctionTargetSeconds?: number; correctionCount: number; correctionReason?: string };
type OverlayServerClockAnchor = { serverNowMs: number; receivedAtPerformanceMs: number; responseTransitEstimateMs: number };
type OverlayServerClockAnchorRef = MutableRefObject<OverlayServerClockAnchor | null>;
const WHEEL_SPIN_START_DELAY_MS = 850;
const WHEEL_AUDIO_FADE_OUT_MS = 10_000;
const WHEEL_WINNER_CHEER_AUDIO_PATH = "/audio/wheel/WheelCheer.mp3";
const WHEEL_REENCRYPT_AUDIO_PATH = "/audio/wheel/WheelEncrypt.mp3";
const WHEEL_RESULT_REVEAL_DELAY_MS = 700;
const WHEEL_SPIN_VOLUME = 0.82;
const WHEEL_CHEER_VOLUME = 0.665;
const WHEEL_ENCRYPT_VOLUME = 0.9;
const WHEEL_SELECTOR_LABEL_SCREEN_UPRIGHT_OFFSET_DEG = 0;
const WHEEL_SELECTOR_ZONE_MIN_ANGLE_DEG = 210;
const WHEEL_SELECTOR_ZONE_MAX_ANGLE_DEG = 330;

const FALLBACK_WHEEL_AUDIO_FILES = [
  "/audio/wheel/142.mp3",
  "/audio/wheel/77.mp3",
  "/audio/wheel/150.mp3",
  "/audio/wheel/49.mp3",
  "/audio/wheel/103.mp3",
  "/audio/wheel/56.mp3",
  "/audio/wheel/58.mp3",
  "/audio/wheel/84.mp3",
  "/audio/wheel/147.mp3",
  "/audio/wheel/102.mp3",
  "/audio/wheel/92.mp3",
  "/audio/wheel/76.mp3",
  "/audio/wheel/111.mp3",
  "/audio/wheel/74.mp3",
  "/audio/wheel/139.mp3",
  "/audio/wheel/110.mp3",
  "/audio/wheel/148.mp3",
  "/audio/wheel/162.mp3",
  "/audio/wheel/104.mp3",
  "/audio/wheel/32%20(1).mp3",
  "/audio/wheel/140.mp3",
  "/audio/wheel/81.mp3",
  "/audio/wheel/75.mp3",
  "/audio/wheel/78.mp3",
  "/audio/wheel/36.mp3",
  "/audio/wheel/154.mp3",
  "/audio/wheel/24.mp3",
  "/audio/wheel/41.mp3",
  "/audio/wheel/130.mp3",
  "/audio/wheel/70.mp3",
  "/audio/wheel/93.mp3",
  "/audio/wheel/10.mp3",
  "/audio/wheel/8.mp3",
  "/audio/wheel/33.mp3",
  "/audio/wheel/15.mp3",
  "/audio/wheel/138.mp3",
  "/audio/wheel/1.mp3",
  "/audio/wheel/123.mp3",
  "/audio/wheel/105.mp3",
  "/audio/wheel/73.mp3",
  "/audio/wheel/54.mp3",
  "/audio/wheel/127.mp3",
  "/audio/wheel/21.mp3",
  "/audio/wheel/46.mp3",
  "/audio/wheel/72.mp3",
  "/audio/wheel/43.mp3",
  "/audio/wheel/82.mp3",
  "/audio/wheel/3.mp3",
  "/audio/wheel/99.mp3",
  "/audio/wheel/wheel-spin-01-creepy-circus-astronautflute.mp3",
  "/audio/wheel/wheel-spin-02-dark-circus-top-sue.mp3",
  "/audio/wheel/wheel-spin-03-comedy-circus-top-sue.mp3",
  "/audio/wheel/wheel-spin-04-circus-fast-andorios.mp3",
  "/audio/wheel/wheel-spin-05-carousel-circus-chakong.mp3",
  "/audio/wheel/wheel-spin-06-circus-bear-studiokolomna.mp3",
  "/audio/wheel/wheel-spin-07-upbeat-corporate-kornevmusic.mp3",
  "/audio/wheel/wheel-spin-08-corporate-music-absolutesound.mp3",
  "/audio/wheel/wheel-spin-09-corporate-music-2-absolutesound.mp3",
  "/audio/wheel/wheel-spin-10-this-heavy-metal-mrclaps.mp3",
  "/audio/wheel/wheel-spin-11-metal-dark-matter-alexgrohl.mp3",
  "/audio/wheel/wheel-spin-12-burn-it-down-alexgrohl.mp3",
  "/audio/wheel/wheel-spin-13-8bit-retro-the-mountain.mp3",
  "/audio/wheel/wheel-spin-14-retro-swing-the-mountain.mp3",
  "/audio/wheel/wheel-spin-15-retro-arcade-mondamusic.mp3",
  "/audio/wheel/wheel-spin-16-synthwave-retro-80s-monume.mp3",
  "/audio/wheel/wheel-spin-17-retro-game-arcade-moodmode.mp3",
  "/audio/wheel/wheel-spin-18-retro-surf-rock-tunetank.mp3",
];

const BINARY_CONFETTI = Array.from({ length: 44 }, (_, index) => ({
  bit: index % 3 === 0 ? "0" : "1",
  left: `${(index * 19) % 100}%`,
  delay: `${(index % 11) * 0.17}s`,
  drift: `${((index % 9) - 4) * 1.25}vmin`,
  duration: `${2.4 + (index % 7) * 0.18}s`,
}));

function safeWheelAudioPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s/g, "%20");
  if (!/^[a-zA-Z0-9._~!$&'()*+,;=:@/%-]+\.mp3(?:\?.*)?$/i.test(cleaned)) return null;
  if (/^https?:\/\//i.test(cleaned) || cleaned.includes("..")) return null;
  if (cleaned.startsWith("/") && !cleaned.startsWith("/audio/wheel/")) return null;
  return cleaned.startsWith("/") ? cleaned : `/audio/wheel/${cleaned.replace(/^audio\/wheel\//, "")}`;
}

function normalizeWheelAudioManifest(input: unknown): string[] {
  const rawFiles = Array.isArray(input) ? input : Array.isArray((input as { files?: unknown } | null)?.files) ? (input as { files: unknown[] }).files : [];
  return Array.from(new Set(rawFiles.map(safeWheelAudioPath).filter((file): file is string => Boolean(file))));
}

async function loadWheelAudioFiles(): Promise<string[]> {
  try {
    const response = await fetch("/audio/wheel/manifest.json", { cache: "no-store" });
    if (!response.ok) return FALLBACK_WHEEL_AUDIO_FILES;
    const files = normalizeWheelAudioManifest(await response.json());
    return files.length > 0 ? files : FALLBACK_WHEEL_AUDIO_FILES;
  } catch {
    return FALLBACK_WHEEL_AUDIO_FILES;
  }
}

function shuffledAudioPaths(paths: string[]): string[] {
  const shuffled = [...paths];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function audioPlayWasBlocked(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

function stopWheelAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

async function decodeAudioBuffer(context: AudioContext, path: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return await context.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  }
}


function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wheelLabelMetrics(count: number) {
  if (count <= 4) return { width: 35, radius: 26.4, size: 8.2, tracking: "0.001em", lines: 3 };
  if (count <= 6) return { width: 31, radius: 27.8, size: 6.9, tracking: "0.001em", lines: 3 };
  if (count <= 8) return { width: 27, radius: 29.5, size: 5.6, tracking: "0.002em", lines: 3 };
  if (count <= 12) return { width: 22, radius: 31.5, size: 4.1, tracking: "0.002em", lines: 3 };
  if (count <= 16) return { width: 18.4, radius: 33.2, size: 3.1, tracking: "0.001em", lines: 2 };
  if (count <= 24) return { width: 15.2, radius: 35.1, size: 2.3, tracking: "0", lines: 2 };
  return { width: 12.4, radius: 36.7, size: 1.76, tracking: "0", lines: 2 };
}

function wheelLabelFit(value: string, count: number, segmentAngle: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const length = cleaned.length;
  const words = cleaned.split(" ").filter(Boolean).length;
  const sliceDegrees = Math.max(1, segmentAngle);
  const base = wheelLabelMetrics(count);
  const shortNameBoost = length <= 7 ? 1.32 : length <= 14 ? 1.18 : length <= 24 ? 1.06 : 1;
  const lines = length <= 12 && words <= 2 ? 1 : length > 34 || words > 3 ? 3 : 2;
  const radius = clampNumber(base.radius + (length > 34 ? 1.2 : length <= 10 ? -0.7 : 0), 24.8, 38.2);
  const tangentWidth = 2 * radius * Math.sin((sliceDegrees * Math.PI) / 360);
  const minWidth = count <= 8 ? 17 : count <= 16 ? 11 : count <= 24 ? 8 : 6.2;
  const width = clampNumber(Math.min(base.width * shortNameBoost, tangentWidth * 0.98), minWidth, base.width * 1.22);
  const maxLineLength = Math.max(4, Math.ceil(length / lines));
  const fitSize = (width * (lines === 1 ? 1.72 : 1.58)) / Math.max(5, maxLineLength);
  const size = clampNumber(Math.min(base.size * shortNameBoost, fitSize), count <= 16 ? 1.55 : 1.2, base.size * 1.42);
  return {
    width: `${width.toFixed(2)}vmin`,
    radius,
    size: `${size.toFixed(2)}vmin`,
    lines,
    tracking: length <= 12 ? "0.002em" : base.tracking,
    lineHeight: lines === 1 ? "0.92" : lines === 2 ? "0.86" : "0.8",
  };
}

function normalizeAngleDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function wheelLabelPosition(angle: number, radius: number, wheelRotationDeg: number) {
  const radians = (angle * Math.PI) / 180;
  const x = Math.sin(radians) * radius;
  const y = Math.cos(radians) * -radius;
  const finalVisualPositionAngle = normalizeAngleDegrees(angle + wheelRotationDeg);
  const inRightSelectorZone = finalVisualPositionAngle >= WHEEL_SELECTOR_ZONE_MIN_ANGLE_DEG && finalVisualPositionAngle <= WHEEL_SELECTOR_ZONE_MAX_ANGLE_DEG;
  const baseLabelRotation = wheelUprightLabelRotationDegrees(angle);
  const finalScreenRotation = normalizeAngleDegrees(wheelRotationDeg + baseLabelRotation);
  const wouldRenderUpsideDown = finalScreenRotation > 90 && finalScreenRotation < 270;
  const readableNonSelectorRotation = wouldRenderUpsideDown ? baseLabelRotation + 180 : baseLabelRotation;
  const rotation = inRightSelectorZone
    ? (-wheelRotationDeg) + WHEEL_SELECTOR_LABEL_SCREEN_UPRIGHT_OFFSET_DEG
    : readableNonSelectorRotation;
  return { x: `${x.toFixed(3)}vmin`, y: `${y.toFixed(3)}vmin`, rotation: `${rotation.toFixed(3)}deg` };
}

function WheelCeremonyOverlay({ scene, audioArmed, audioNotice, audioJustArmed, playSpinMusic, fadeSpinMusic, playCheerSfx, playEncryptSfx }: { scene: ResolvedLiveOverlayScene; audioArmed: boolean; audioNotice: string | null; audioJustArmed: boolean; playSpinMusic: (path?: string) => Promise<void>; fadeSpinMusic: () => void; playCheerSfx: () => void; playEncryptSfx: () => void }) {
  const ceremony = scene.wheelCeremony;
  const candidates = ceremony?.displayCandidates ?? [];
  const result = ceremony?.resultTrack;
  const reencryptNonce = ceremony?.reencryptNonce ?? ceremony?.reencryptCycleId;
  const [visibleReencryptNonce, setVisibleReencryptNonce] = useState<string | null>(null);
  const lastSeenReencryptNonceRef = useRef<string | undefined>(undefined);
  const reencryptVisualActive = ceremony?.status === "reencrypting" || Boolean(reencryptNonce && visibleReencryptNonce === reencryptNonce);
  const spinning = ceremony?.status === "spinning";
  const lastCheerKeyRef = useRef<string | null>(null);
  const lastReencryptKeyRef = useRef<string | null>(null);
  const resultRevealTimeoutRef = useRef<number | null>(null);
  const [resultRevealReadyKey, setResultRevealReadyKey] = useState<string | null>(null);
  const [wheelRotationDeg, setWheelRotationDeg] = useState(0);
  const [wheelFrozen, setWheelFrozen] = useState(false);
  const spinRafRef = useRef<number | null>(null);
  const candidateCount = Math.max(1, candidates.length);
  const wheelSegments = buildWheelSegments(candidates.map((candidate) => ({ id: candidate.id, label: candidate.artistName, weight: candidate.weight })));
  const resultSegment = wheelSegments.find((segment) => segment.candidateId === result?.id) ?? wheelSegments[0];
  const sliceColors = ["#67e8f9", "#0ea5e9", "#2563eb", "#7c3aed", "#c026d3", "#ff2b6d", "#ef4444", "#f97316", "#facc15", "#22c55e", "#e5e7eb", "#071426"];
  const sliceBackground = candidates.length > 0 ? `conic-gradient(from 0deg, ${wheelSegments.map((segment, index) => `${sliceColors[index % sliceColors.length]} ${segment.startAngle}deg ${segment.endAngle}deg`).join(", ")})` : "radial-gradient(circle, #67e8f9, #0284c7)";
  const labelMetrics = wheelLabelMetrics(candidates.length);
  const animationKey = reencryptVisualActive ? reencryptNonce ?? ceremony?.seed ?? "reencrypting" : ceremony?.seed ?? ceremony?.status ?? "wheel";
  const finalRotationDeg = typeof ceremony?.finalRotationDeg === "number" ? ceremony.finalRotationDeg : wheelFinalRotationForSegment(resultSegment);
  const wheelStyle = {
    "--wheel-final-rotation": `${finalRotationDeg}deg`,
    "--wheel-spin-duration": `${Math.max(16, (ceremony?.spinDurationMs ?? 24000) / 1000)}s`,
    "--wheel-spin-delay": `${WHEEL_SPIN_START_DELAY_MS / 1000}s`,
    "--wheel-slice-count": candidateCount,
    "--wheel-slice-background": sliceBackground,
    "--wheel-name-size": `${labelMetrics.size}vmin`,
    "--wheel-label-width": `${labelMetrics.width}vmin`,
    "--wheel-label-radius": `${labelMetrics.radius}vmin`,
    "--wheel-letter-spacing": labelMetrics.tracking,
    "--wheel-label-lines": labelMetrics.lines,
    "--wheel-winning-start": `${resultSegment.startAngle}deg`,
    "--wheel-winning-end": `${resultSegment.endAngle}deg`,
  } as CSSProperties;
  const spinDurationMs = Math.max(16_000, ceremony?.spinDurationMs ?? 24_000);
  const spinStartedAtMs = ceremony?.spinStartedAt ? new Date(ceremony.spinStartedAt).getTime() : null;
  const spinEndsAtMs = spinStartedAtMs ? spinStartedAtMs + WHEEL_SPIN_START_DELAY_MS + spinDurationMs : null;
  const revealKey = `${ceremony?.resultTrackId ?? "none"}:${ceremony?.status ?? "none"}`;
  const showResultPending = ceremony?.status === "result_pending" && resultRevealReadyKey === revealKey;
  const spinShouldStillAnimate = ceremony?.status === "spinning" && !wheelFrozen;
  const displayRotationDeg = wheelRotationDeg;

  useEffect(() => {
    if (!reencryptNonce || lastSeenReencryptNonceRef.current === reencryptNonce) return undefined;
    lastSeenReencryptNonceRef.current = reencryptNonce;
    setVisibleReencryptNonce(reencryptNonce);
    const timeout = window.setTimeout(() => {
      setVisibleReencryptNonce((current) => current === reencryptNonce ? null : current);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [reencryptNonce]);

  useEffect(() => {
    if (!audioArmed) return;
    if (!spinning) {
      return undefined;
    }
    void playSpinMusic(ceremony?.audioPath);
    return undefined;
  }, [audioArmed, spinning, ceremony?.audioPath, ceremony?.spinStartedAt, ceremony?.resultTrackId]);

  useEffect(() => {
    if (!showResultPending || spinShouldStillAnimate) return;
    fadeSpinMusic();
    return;
  }, [showResultPending, spinShouldStillAnimate]);

  useEffect(() => {
    if (!showResultPending || spinShouldStillAnimate) return undefined;
    const cheerKey = `${ceremony?.resultTrackId ?? "none"}:${ceremony?.status ?? "none"}`;
    if (lastCheerKeyRef.current === cheerKey) return undefined;
    lastCheerKeyRef.current = cheerKey;
    playCheerSfx();
    return undefined;
  }, [showResultPending, spinShouldStillAnimate, ceremony?.status, ceremony?.resultTrackId]);

  useEffect(() => {
    const nonce = ceremony?.reencryptNonce ?? ceremony?.reencryptCycleId;
    if (ceremony?.status !== "reencrypting" || !nonce) return;
    if (lastReencryptKeyRef.current === nonce) return;
    lastReencryptKeyRef.current = nonce;
    playEncryptSfx();
  }, [ceremony?.status, ceremony?.reencryptNonce, ceremony?.reencryptCycleId]);

  useEffect(() => {
    if (spinRafRef.current !== null) {
      window.cancelAnimationFrame(spinRafRef.current);
      spinRafRef.current = null;
    }
    if (ceremony?.status !== "spinning") return;
    const unfreezeTimer = window.setTimeout(() => setWheelFrozen(false), 0);
    const startRotation = wheelRotationDeg;
    const targetRotation = finalRotationDeg;
    const duration = Math.max(16_000, ceremony?.spinDurationMs ?? 24_000);
    const startAt = performance.now() + WHEEL_SPIN_START_DELAY_MS;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      if (now < startAt) {
        spinRafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const t = Math.max(0, Math.min(1, (now - startAt) / duration));
      const eased = easeOut(t);
      setWheelRotationDeg(startRotation + (targetRotation - startRotation) * eased);
      if (t >= 1) {
        setWheelRotationDeg(targetRotation);
        setWheelFrozen(true);
        spinRafRef.current = null;
        return;
      }
      spinRafRef.current = window.requestAnimationFrame(tick);
    };
    spinRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(unfreezeTimer);
      if (spinRafRef.current !== null) window.cancelAnimationFrame(spinRafRef.current);
      spinRafRef.current = null;
    };
  }, [ceremony?.status, ceremony?.spinStartedAt, ceremony?.spinDurationMs, finalRotationDeg]);

  useEffect(() => {
    if (resultRevealTimeoutRef.current !== null) {
      window.clearTimeout(resultRevealTimeoutRef.current);
      resultRevealTimeoutRef.current = null;
    }
    if (ceremony?.status !== "result_pending") return;
    const waitMs = WHEEL_RESULT_REVEAL_DELAY_MS;
    resultRevealTimeoutRef.current = window.setTimeout(() => {
      setResultRevealReadyKey(revealKey);
      resultRevealTimeoutRef.current = null;
    }, waitMs);
  }, [ceremony?.status, spinEndsAtMs, ceremony?.resultTrackId, revealKey]);

  return (
    <div className={`live-overlay-wheel-scene live-overlay-wheel-scene--${ceremony?.status ?? "idle"} ${reencryptVisualActive ? "live-overlay-wheel-scene--reencrypting" : ""} ${spinShouldStillAnimate ? "live-overlay-wheel-scene--spinning live-overlay-wheel-scene--spin-armed" : "live-overlay-wheel-scene--frozen"}`} data-wheel-seed={ceremony?.seed} data-wheel-animation-key={animationKey}>
      {audioJustArmed ? <div className="live-overlay-wheel-audio-armed" role="status">AUDIO ARMED</div> : null}
      {audioNotice && <div className="live-overlay-wheel-audio-notice" role="status">{audioNotice}</div>}
      {reencryptVisualActive && <div key={`glitch-${animationKey}`} className="live-overlay-wheel-glitch-stack" aria-hidden="true"><div className="live-overlay-wheel-static" /><div className="live-overlay-wheel-glitch">RE-ENCRYPTING SIGNAL</div><div className="live-overlay-wheel-corrupt-labels">010010 // SIGNAL MUTATING // 101101</div></div>}
      <div className="live-overlay-wheel-heading" aria-live="polite">
        <p className="live-overlay-mode">{modeLabel(scene.mode)}</p>
        <h1>{scene.subtitle || scene.title}</h1>
      </div>

      <div className="live-overlay-wheel-wrap">
        <div className="live-overlay-wheel-pointer" aria-hidden="true" />
        <div className="live-overlay-wheel" style={{ ...wheelStyle, transform: `rotate(${displayRotationDeg}deg)` }}>
          <div className="live-overlay-wheel-slices" aria-hidden="true" />
          {result && (ceremony?.status === "result_pending" || ceremony?.status === "confirmed") && <div className="live-overlay-wheel-winning-segment" aria-hidden="true" />}
          {candidates.length === 0 ? <span className="live-overlay-wheel-empty">NO CANDIDATES</span> : candidates.map((candidate, index) => {
            const segment = wheelSegments[index] ?? resultSegment;
            const angle = segment.centerAngle;
            const label = candidate.artistName.replace(/\s+/g, " ").trim();
            const labelFit = wheelLabelFit(label, candidateCount, segment.angleSize);
            const position = wheelLabelPosition(angle, labelFit.radius, displayRotationDeg);
            // Wheel labels are visual only. Winner selection is based on slice geometry and the right-side pointer.
            const labelStyle = {
              "--wheel-label-x": position.x,
              "--wheel-label-y": position.y,
              "--wheel-label-rotation": position.rotation,
              "--wheel-label-width": labelFit.width,
              "--wheel-name-size": labelFit.size,
              "--wheel-letter-spacing": labelFit.tracking,
              "--wheel-label-lines": labelFit.lines,
              "--wheel-label-line-height": labelFit.lineHeight,
            } as CSSProperties;
            return (
              <span key={candidate.id} className="live-overlay-wheel-slice-label" style={labelStyle} title={`${candidate.artistName} — ${candidate.trackTitle}`}>
                <span>{label}</span>
              </span>
            );
          })}
          <div className="live-overlay-wheel-core"><span>10K</span><small>TAP WHEEL</small></div>
        </div>
      </div>

      {result && showResultPending && <div className="live-overlay-wheel-result-reveal" aria-live="assertive">
        <div className="live-overlay-binary-confetti" aria-hidden="true">{BINARY_CONFETTI.map((bit, index) => <span key={`${bit.bit}-${index}`} style={{ "--bit-left": bit.left, "--bit-delay": bit.delay, "--bit-drift": bit.drift, "--bit-duration": bit.duration } as CSSProperties}>{bit.bit}</span>)}</div>
        <div className="live-overlay-wheel-result-card"><span>WHEEL WINNER</span><strong>{result.artistName}</strong><em>{result.trackTitle}</em><p>20 SECONDS TO CLAIM YOUR WINNINGS</p></div>
      </div>}

      {(scene.message || result) && <div className="live-overlay-wheel-status">
        {result && (ceremony?.status === "result_pending" || ceremony?.status === "confirmed") ? <><span>{ceremony.status === "confirmed" ? "SIGNAL LOCKED" : "RESULT PENDING"}</span><strong>{result.artistName}</strong><em>{result.trackTitle}</em></> : <><span>{scene.title}</span>{scene.message && <strong>{scene.message}</strong>}</>}
      </div>}
    </div>
  );
}

function serverRelativeAgeFromAnchor(updatedAt: string, clockAnchor: OverlayServerClockAnchor | null): number | null {
  if (!clockAnchor) return null;
  return serverRelativeSyncAgeSeconds(updatedAt, clockAnchor.serverNowMs + clockAnchor.responseTransitEstimateMs, performance.now() - clockAnchor.receivedAtPerformanceMs);
}

function driftDirectionFromRoundedDrift(driftSeconds: number | undefined): "ahead" | "behind" | "aligned" | undefined {
  if (driftSeconds === undefined || !Number.isFinite(driftSeconds)) return undefined;
  if (Math.abs(driftSeconds) < 0.05) return "aligned";
  return driftSeconds > 0 ? "ahead" : "behind";
}

function roundedFiniteSeconds(value: number | null): number | undefined {
  return value === null ? undefined : roundPlaybackDriftSeconds(value) ?? undefined;
}

function expectedYouTubeTime(sync: LiveOverlayYouTubeSync, clockAnchor: OverlayServerClockAnchor | null): number {
  if (sync.playbackState !== "playing") return sync.currentTimeSeconds;
  const ageSeconds = serverRelativeAgeFromAnchor(sync.updatedAt, clockAnchor);
  return ageSeconds === null ? sync.currentTimeSeconds : sync.currentTimeSeconds + ageSeconds;
}

function ensureYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
}

function YouTubeOverlayPlayer({ sync, clockAnchorRef, clockAnchored, responseTransitMs }: { sync: LiveOverlayYouTubeSync; clockAnchorRef: OverlayServerClockAnchorRef; clockAnchored: boolean; responseTransitMs: number | null }) {
  const playerRef = useRef<YTPlayer | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const destroyedRef = useRef(false);
  const loadedVideoRef = useRef<string | null>(null);
  const latestSyncRef = useRef(sync);
  const generationRef = useRef(0);
  const readyTimerRef = useRef<number | null>(null);
  const failedVideoRef = useRef<string | null>(null);
  const lastAppliedPlaybackStateRef = useRef<LiveOverlayPlaybackState | null>(null);
  const lastCorrectionAtRef = useRef<number | null>(null);
  const correctionCountRef = useRef(0);
  const lastCorrectionReasonRef = useRef<string | null>(null);
  const [playerError, setPlayerError] = useState<{ code?: number; message: string } | null>(null);
  const [syncDiagnostic, setSyncDiagnostic] = useState<OverlaySyncDiagnostic>({ correctionCount: 0 });
  const containerId = "live-overlay-youtube-player";

  const clearImperativeHost = useCallback(() => {
    if (playerHostRef.current) playerHostRef.current.replaceChildren();
  }, []);

  const clearReadyTimer = useCallback(() => {
    if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    readyTimerRef.current = null;
  }, []);

  const markPlayerUnavailable = useCallback((message: string, code?: number) => {
    clearReadyTimer();
    readyRef.current = false;
    failedVideoRef.current = latestSyncRef.current.videoId;
    setPlayerError({ code, message });
    try {
      playerRef.current?.destroy?.();
    } catch {
      // Third-party iframe cleanup is best-effort.
    }
    playerRef.current = null;
    clearImperativeHost();
  }, [clearImperativeHost, clearReadyTimer]);

  const applyYouTubeSync = useCallback((nextSync: LiveOverlayYouTubeSync) => {
    const player = playerRef.current;
    if (!player || !readyRef.current || destroyedRef.current || failedVideoRef.current === nextSync.videoId) return;
    try {
      const expected = expectedYouTubeTime(nextSync, clockAnchorRef.current);
      const isNewVideo = loadedVideoRef.current !== nextSync.videoId;
      const previousState = lastAppliedPlaybackStateRef.current;
      const reason = nextSync.correctionReason ?? "heartbeat";
      const nowMs = Date.now();
      let corrected = false;
      let drift: number | null = null;
      let correctionTarget: number | null = null;
      if (isNewVideo) {
        if (nextSync.playbackState === "playing") player.loadVideoById({ videoId: nextSync.videoId, startSeconds: expected });
        else player.cueVideoById({ videoId: nextSync.videoId, startSeconds: nextSync.currentTimeSeconds });
        loadedVideoRef.current = nextSync.videoId;
        corrected = true;
      } else {
        const current = player.getCurrentTime();
        drift = Number.isFinite(current) ? current - expected : null;
        const bypassCooldown = reason === "seek" || nextSync.playbackState !== "playing" || lastCorrectionAtRef.current === null || nowMs - lastCorrectionAtRef.current >= PLAYER_CORRECTION_COOLDOWN_MS;
        const shouldCorrect = drift !== null && shouldCorrectPlaybackDrift({ playbackState: nextSync.playbackState, driftSeconds: drift, behindThresholdSeconds: YOUTUBE_BEHIND_THRESHOLD_SECONDS, aheadThresholdSeconds: YOUTUBE_AHEAD_THRESHOLD_SECONDS, pausedThresholdSeconds: YOUTUBE_PAUSED_DRIFT_THRESHOLD_SECONDS });
        if (shouldCorrect && bypassCooldown) {
          const target = nextSync.playbackState === "playing" ? playbackCorrectionTarget({ expectedTimeSeconds: expected, driftSeconds: drift ?? 0, playbackState: nextSync.playbackState, maximumCatchUpSeconds: YOUTUBE_MAX_CATCH_UP_SECONDS }) ?? expected : nextSync.currentTimeSeconds;
          player.seekTo(target, true);
          correctionTarget = target;
          corrected = true;
        }
      }
      player.mute();
      const stateChanged = previousState !== nextSync.playbackState;
      if (nextSync.playbackState === "playing") {
        if (stateChanged || isNewVideo || corrected) player.playVideo();
      } else if (stateChanged || corrected) {
        player.pauseVideo();
      }
      if (corrected) {
        correctionCountRef.current += 1;
        lastCorrectionAtRef.current = nowMs;
        lastCorrectionReasonRef.current = reason;
      }
      lastAppliedPlaybackStateRef.current = nextSync.playbackState;
      const roundedDrift = roundedFiniteSeconds(drift);
      setSyncDiagnostic({ driftSeconds: roundedDrift, driftDirection: driftDirectionFromRoundedDrift(roundedDrift), correctionTargetSeconds: roundedFiniteSeconds(correctionTarget), correctionCount: correctionCountRef.current, correctionReason: lastCorrectionReasonRef.current ?? undefined });
    } catch {
      markPlayerUnavailable("VIDEO PLAYBACK UNAVAILABLE — HOST USING EXTERNAL SOURCE");
    }
  }, [clockAnchorRef, markPlayerUnavailable]);

  useEffect(() => {
    if (failedVideoRef.current !== sync.videoId) setPlayerError(null);
    latestSyncRef.current = sync;
    window.setTimeout(() => applyYouTubeSync(sync), 0);
  }, [applyYouTubeSync, sync]);

  // Provider lifecycle is keyed only by media identity.
  // Clock and heartbeat updates are read through stable refs.
  useEffect(() => {
    let cancelled = false;
    destroyedRef.current = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    failedVideoRef.current = failedVideoRef.current === latestSyncRef.current.videoId ? failedVideoRef.current : null;
    setPlayerError((current) => failedVideoRef.current === latestSyncRef.current.videoId ? current : null);
    clearImperativeHost();
    const mount = document.createElement("div");
    mount.id = `${containerId}-yt-${generation}`;
    playerHostRef.current?.appendChild(mount);
    readyTimerRef.current = window.setTimeout(() => {
      if (!cancelled && generationRef.current === generation) markPlayerUnavailable("VIDEO PLAYBACK UNAVAILABLE — HOST USING EXTERNAL SOURCE");
    }, YOUTUBE_OVERLAY_READY_TIMEOUT_MS);
    ensureYouTubeApi().then(() => {
      if (cancelled || generationRef.current !== generation || playerRef.current || !window.YT?.Player || failedVideoRef.current === latestSyncRef.current.videoId || !mount.isConnected) return;
      try {
        playerRef.current = new window.YT.Player(mount, {
          videoId: latestSyncRef.current.videoId,
          playerVars: { autoplay: 0, controls: 0, modestbranding: 1, playsinline: 1, rel: 0, mute: 1 },
          events: {
            onReady: () => {
              if (cancelled || generationRef.current !== generation) return;
              readyRef.current = true;
              clearReadyTimer();
              try {
                playerRef.current?.mute();
              } catch {
                markPlayerUnavailable("VIDEO PLAYBACK UNAVAILABLE — HOST USING EXTERNAL SOURCE");
                return;
              }
              applyYouTubeSync(latestSyncRef.current);
            },
            onError: (event: { data: number }) => {
              if (cancelled || generationRef.current !== generation) return;
              markPlayerUnavailable("VIDEO PLAYBACK UNAVAILABLE — HOST USING EXTERNAL SOURCE", event.data);
            },
          },
        });
      } catch {
        markPlayerUnavailable("VIDEO PLAYBACK UNAVAILABLE — HOST USING EXTERNAL SOURCE");
      }
    }).catch(() => {
      if (!cancelled && generationRef.current === generation) markPlayerUnavailable("VIDEO PLAYBACK UNAVAILABLE — HOST USING EXTERNAL SOURCE");
    });
    return () => {
      cancelled = true;
      generationRef.current += 1;
      destroyedRef.current = true;
      clearReadyTimer();
      readyRef.current = false;
      loadedVideoRef.current = null;
      lastAppliedPlaybackStateRef.current = null;
      lastCorrectionAtRef.current = null;
      correctionCountRef.current = 0;
      lastCorrectionReasonRef.current = null;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // Third-party iframe cleanup is best-effort.
      }
      playerRef.current = null;
      clearImperativeHost();
    };
  }, [applyYouTubeSync, clearImperativeHost, clearReadyTimer, containerId, markPlayerUnavailable, sync.trackId, sync.videoId]);

  return <div className="live-overlay-youtube-player" data-youtube-wrapper={containerId} aria-label="Muted YouTube overlay player" data-youtube-drift-seconds={syncDiagnostic.driftSeconds} data-youtube-drift-direction={syncDiagnostic.driftDirection} data-youtube-correction-target={syncDiagnostic.correctionTargetSeconds} data-youtube-correction-count={syncDiagnostic.correctionCount} data-youtube-correction-reason={syncDiagnostic.correctionReason} data-overlay-server-clock={clockAnchored ? "anchored" : "missing"} data-overlay-response-transit-ms={responseTransitMs ?? undefined}><div ref={playerHostRef} className={playerError ? "live-overlay-youtube-host live-overlay-youtube-host--hidden" : "live-overlay-youtube-host"} />{playerError && <div className="live-overlay-youtube-fallback" role="status"><p>{playerError.message}</p><span>{playerError.code ? youtubeErrorLabel(playerError.code) : youtubeErrorLabel()}</span></div>}</div>;
}

function expectedTikTokTime(sync: LiveOverlayTikTokSync, clockAnchor: OverlayServerClockAnchor | null): number {
  const ageSeconds = sync.playbackState === "playing" ? serverRelativeAgeFromAnchor(sync.updatedAt, clockAnchor) : 0;
  const expected = sync.currentTimeSeconds + (ageSeconds ?? 0);
  return typeof sync.durationSeconds === "number" && Number.isFinite(sync.durationSeconds) && sync.durationSeconds > 0 ? Math.min(expected, sync.durationSeconds) : expected;
}

type TikTokTrustedEventType = "onPlayerReady" | "onStateChange" | "onCurrentTime" | "onMute" | "onVolumeChange" | "onPlayerError";
type TikTokFailureReason = "iframe_load_timeout" | "player_event_timeout" | "autoplay_blocked" | "player_error" | null;

type TikTokDiagnosticState = {
  iframeLoaded: boolean;
  trustedEventSeen: boolean;
  firstTrustedEventType?: TikTokTrustedEventType;
  lastTrustedEventType?: TikTokTrustedEventType;
  postId: string;
  trackId?: string;
  playbackState: LiveOverlayTikTokSync["playbackState"];
  expectedTime?: number;
  localObservedTime?: number;
  lastCommand?: "mute" | "play" | "pause" | "seekTo";
  bootstrapAttempt: number;
  errorCode?: number;
  errorType?: string;
  driftSeconds?: number;
  driftDirection?: "ahead" | "behind" | "aligned";
  correctionTargetSeconds?: number;
  lastCorrectionAt?: number;
  correctionCount: number;
  correctionReason?: string;
  failureReason: TikTokFailureReason;
  status: "bootstrapping" | "iframe_loaded" | "trusted_event" | "playing" | "paused" | "stopped" | "failed";
};

function TikTokOverlayPlayer({ sync, artistName, trackTitle, clockAnchorRef, clockAnchored, responseTransitMs }: { sync: LiveOverlayTikTokSync; artistName: string; trackTitle: string; clockAnchorRef: OverlayServerClockAnchorRef; clockAnchored: boolean; responseTransitMs: number | null }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeLoadedRef = useRef(false);
  const trustedEventSeenRef = useRef(false);
  const firstTrustedEventTypeRef = useRef<TikTokTrustedEventType | undefined>(undefined);
  const lastTrustedEventTypeRef = useRef<TikTokTrustedEventType | undefined>(undefined);
  const readyRef = useRef(false);
  const latestSyncRef = useRef(sync);
  const localTimeRef = useRef<number>(Number.NaN);
  const destroyedRef = useRef(false);
  const generationRef = useRef(0);
  const bootstrapAttemptRef = useRef(0);
  const lastAppliedPlaybackStateRef = useRef<LiveOverlayPlaybackState | null>(null);
  const lastCorrectionAtRef = useRef<number | null>(null);
  const correctionCountRef = useRef(0);
  const lastCorrectionReasonRef = useRef<string | null>(null);
  const iframeLoadTimerRef = useRef<number | null>(null);
  const playerEventTimerRef = useRef<number | null>(null);
  const failedPostRef = useRef<string | null>(null);
  const [initialAutoplay] = useState(() => sync.playbackState === "playing");
  const [playerError, setPlayerError] = useState<{ code?: number; message: string; reason: Exclude<TikTokFailureReason, null>; errorType?: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<TikTokDiagnosticState>({ iframeLoaded: false, trustedEventSeen: false, postId: sync.postId, trackId: sync.trackId, playbackState: sync.playbackState, bootstrapAttempt: 0, correctionCount: 0, failureReason: null, status: "bootstrapping" });
  const src = useMemo(() => {
    const params = new URLSearchParams({ controls: "0", progress_bar: "0", play_button: "0", volume_control: "0", fullscreen_button: "0", timestamp: "0", autoplay: initialAutoplay ? "1" : "0", music_info: "0", description: "0", rel: "0", native_context_menu: "0", closed_caption: "0", muted: "1" });
    return `${TIKTOK_ORIGIN}/player/v1/${sync.postId}?${params.toString()}`;
  }, [initialAutoplay, sync.postId]);

  const updateDiagnostics = useCallback((patch: Partial<TikTokDiagnosticState>) => {
    setDiagnostics((current) => ({ ...current, ...patch, postId: latestSyncRef.current.postId, trackId: latestSyncRef.current.trackId, playbackState: latestSyncRef.current.playbackState }));
  }, []);

  const clearIframeLoadTimer = useCallback(() => {
    if (iframeLoadTimerRef.current) window.clearTimeout(iframeLoadTimerRef.current);
    iframeLoadTimerRef.current = null;
  }, []);

  const clearPlayerEventTimer = useCallback(() => {
    if (playerEventTimerRef.current) window.clearTimeout(playerEventTimerRef.current);
    playerEventTimerRef.current = null;
  }, []);

  const markPlayerUnavailable = useCallback((message: string, reason: Exclude<TikTokFailureReason, null>, code?: number, errorType?: string) => {
    clearIframeLoadTimer();
    clearPlayerEventTimer();
    readyRef.current = false;
    failedPostRef.current = latestSyncRef.current.postId;
    setPlayerError({ code, message, reason, errorType });
    updateDiagnostics({ status: "failed", failureReason: reason, errorCode: code, errorType });
  }, [clearIframeLoadTimer, clearPlayerEventTimer, updateDiagnostics]);

  const sendTikTokVoidCommand = useCallback((type: "mute" | "play" | "pause") => {
    iframeRef.current?.contentWindow?.postMessage({ type, "x-tiktok-player": true }, TIKTOK_ORIGIN);
    updateDiagnostics({ lastCommand: type });
  }, [updateDiagnostics]);

  const sendTikTokSeekCommand = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "seekTo", value: seconds, "x-tiktok-player": true }, TIKTOK_ORIGIN);
    updateDiagnostics({ lastCommand: "seekTo", expectedTime: seconds });
  }, [updateDiagnostics]);

  const applyTikTokSync = useCallback((nextSync: LiveOverlayTikTokSync) => {
    const generation = generationRef.current;
    if (!readyRef.current || destroyedRef.current || failedPostRef.current === nextSync.postId) return;
    const expected = expectedTikTokTime(nextSync, clockAnchorRef.current);
    const previousState = lastAppliedPlaybackStateRef.current;
    const reason = nextSync.correctionReason ?? "heartbeat";
    const nowMs = Date.now();
    const drift = Number.isFinite(localTimeRef.current) ? localTimeRef.current - expected : null;
    const bypassCooldown = !Number.isFinite(localTimeRef.current) || reason === "seek" || nextSync.playbackState !== "playing" || lastCorrectionAtRef.current === null || nowMs - lastCorrectionAtRef.current >= PLAYER_CORRECTION_COOLDOWN_MS;
    const shouldCorrect = drift !== null && shouldCorrectPlaybackDrift({ playbackState: nextSync.playbackState, driftSeconds: drift, behindThresholdSeconds: TIKTOK_BEHIND_THRESHOLD_SECONDS, aheadThresholdSeconds: TIKTOK_AHEAD_THRESHOLD_SECONDS, pausedThresholdSeconds: TIKTOK_PAUSED_DRIFT_THRESHOLD_SECONDS });
    const correctionTarget = drift !== null && nextSync.playbackState === "playing" ? playbackCorrectionTarget({ expectedTimeSeconds: expected, driftSeconds: drift, playbackState: nextSync.playbackState, maximumCatchUpSeconds: TIKTOK_MAX_CATCH_UP_SECONDS, durationSeconds: nextSync.durationSeconds }) : null;
    const seekTarget = nextSync.playbackState === "playing" ? correctionTarget ?? expected : nextSync.currentTimeSeconds;
    const mustSeek = !Number.isFinite(localTimeRef.current) || nextSync.playbackState === "stopped" || (shouldCorrect && bypassCooldown);
    sendTikTokVoidCommand("mute");
    if (mustSeek) {
      sendTikTokSeekCommand(seekTarget);
      localTimeRef.current = seekTarget;
      correctionCountRef.current += 1;
      lastCorrectionAtRef.current = nowMs;
      lastCorrectionReasonRef.current = reason;
    }
    const roundedDrift = roundedFiniteSeconds(drift);
    updateDiagnostics({ expectedTime: expected, localObservedTime: Number.isFinite(localTimeRef.current) ? localTimeRef.current : undefined, driftSeconds: roundedDrift, driftDirection: driftDirectionFromRoundedDrift(roundedDrift), correctionTargetSeconds: roundedFiniteSeconds(mustSeek ? seekTarget : null), correctionCount: correctionCountRef.current, lastCorrectionAt: lastCorrectionAtRef.current ?? undefined, correctionReason: lastCorrectionReasonRef.current ?? undefined, status: nextSync.playbackState });
    const stateChanged = previousState !== nextSync.playbackState;
    if (nextSync.playbackState === "playing") {
      const play = () => {
        if (destroyedRef.current || generationRef.current !== generation || failedPostRef.current === nextSync.postId || latestSyncRef.current.postId !== nextSync.postId || latestSyncRef.current.trackId !== nextSync.trackId) return;
        sendTikTokVoidCommand("play");
      };
      if (stateChanged || mustSeek) {
        if (mustSeek) window.setTimeout(play, TIKTOK_DELAYED_PLAY_MS);
        else play();
      }
    } else if (stateChanged || mustSeek) {
      sendTikTokVoidCommand("pause");
    }
    lastAppliedPlaybackStateRef.current = nextSync.playbackState;
  }, [clockAnchorRef, sendTikTokSeekCommand, sendTikTokVoidCommand, updateDiagnostics]);

  const markTrustedPlayerEvent = useCallback((type: TikTokTrustedEventType) => {
    if (!firstTrustedEventTypeRef.current) firstTrustedEventTypeRef.current = type;
    lastTrustedEventTypeRef.current = type;
    trustedEventSeenRef.current = true;
    readyRef.current = true;
    clearPlayerEventTimer();
    updateDiagnostics({ trustedEventSeen: true, firstTrustedEventType: firstTrustedEventTypeRef.current, lastTrustedEventType: type, status: "trusted_event" });
  }, [clearPlayerEventTimer, updateDiagnostics]);

  const startPlayerEventTimer = useCallback((generation: number) => {
    clearPlayerEventTimer();
    playerEventTimerRef.current = window.setTimeout(() => {
      if (generationRef.current === generation && !trustedEventSeenRef.current) markPlayerUnavailable("TIKTOK PLAYER DID NOT SIGNAL READY", "player_event_timeout");
    }, TIKTOK_PLAYER_EVENT_TIMEOUT_MS);
  }, [clearPlayerEventTimer, markPlayerUnavailable]);

  const handleIframeLoad = useCallback(() => {
    iframeLoadedRef.current = true;
    clearIframeLoadTimer();
    updateDiagnostics({ iframeLoaded: true, status: "iframe_loaded" });
    startPlayerEventTimer(generationRef.current);
  }, [clearIframeLoadTimer, startPlayerEventTimer, updateDiagnostics]);

  useEffect(() => {
    latestSyncRef.current = sync;
    window.setTimeout(() => applyTikTokSync(sync), 0);
  }, [applyTikTokSync, sync]);

  // Provider lifecycle is keyed only by media identity.
  // Clock and heartbeat updates are read through stable refs.
  useEffect(() => {
    destroyedRef.current = false;
    iframeLoadedRef.current = false;
    trustedEventSeenRef.current = false;
    firstTrustedEventTypeRef.current = undefined;
    lastTrustedEventTypeRef.current = undefined;
    readyRef.current = false;
    localTimeRef.current = Number.NaN;
    failedPostRef.current = null;
    bootstrapAttemptRef.current = 0;
    lastAppliedPlaybackStateRef.current = null;
    lastCorrectionAtRef.current = null;
    correctionCountRef.current = 0;
    lastCorrectionReasonRef.current = null;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    clearIframeLoadTimer();
    clearPlayerEventTimer();
    iframeLoadTimerRef.current = window.setTimeout(() => {
      if (generationRef.current === generation && !iframeLoadedRef.current) markPlayerUnavailable("TIKTOK IFRAME FAILED TO LOAD", "iframe_load_timeout");
    }, TIKTOK_IFRAME_LOAD_TIMEOUT_MS);

    function onMessage(event: MessageEvent) {
      if (event.origin !== TIKTOK_ORIGIN) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!isPlainTikTokMessage(payload)) return;
      if (payload["x-tiktok-player"] !== true) return;
      const type = payload.type;
      if (type !== "onPlayerReady" && type !== "onStateChange" && type !== "onCurrentTime" && type !== "onMute" && type !== "onVolumeChange" && type !== "onPlayerError") return;
      markTrustedPlayerEvent(type);
      if (type === "onPlayerReady") {
        sendTikTokVoidCommand("mute");
        applyTikTokSync(latestSyncRef.current);
        return;
      }
      if (type === "onCurrentTime") {
        const value = payload.value;
        if (!isPlainTikTokMessage(value)) return;
        const currentTime = typeof value.currentTime === "number" ? value.currentTime : Number(value.currentTime);
        if (Number.isFinite(currentTime) && currentTime >= 0) {
          localTimeRef.current = currentTime;
          updateDiagnostics({ localObservedTime: currentTime });
        }
        applyTikTokSync(latestSyncRef.current);
        return;
      }
      if (type === "onStateChange" || type === "onMute" || type === "onVolumeChange") {
        applyTikTokSync(latestSyncRef.current);
        return;
      }
      if (type === "onPlayerError") {
        const value = payload.value;
        if (!isPlainTikTokMessage(value)) return;
        const code = typeof value.errorCode === "number" ? value.errorCode : Number(value.errorCode);
        const errorType = typeof value.errorType === "string" ? value.errorType : undefined;
        const safeCode = Number.isFinite(code) ? code : undefined;
        if (safeCode === 3002 || errorType === "AUTOPLAY_ERROR") {
          bootstrapAttemptRef.current += 1;
          updateDiagnostics({ bootstrapAttempt: bootstrapAttemptRef.current, errorCode: 3002, errorType: "AUTOPLAY_ERROR" });
          if (bootstrapAttemptRef.current === 1 && latestSyncRef.current.playbackState === "playing") {
            sendTikTokVoidCommand("mute");
            window.setTimeout(() => {
              if (destroyedRef.current || generationRef.current !== generation || failedPostRef.current === latestSyncRef.current.postId) return;
              sendTikTokSeekCommand(expectedTikTokTime(latestSyncRef.current, clockAnchorRef.current));
              sendTikTokVoidCommand("play");
            }, TIKTOK_DELAYED_PLAY_MS);
            return;
          }
          markPlayerUnavailable("AUTOPLAY BLOCKED BY BROWSER", "autoplay_blocked", 3002, "AUTOPLAY_ERROR");
          return;
        }
        markPlayerUnavailable(tiktokOverlayErrorLabel(safeCode), "player_error", safeCode, errorType);
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      destroyedRef.current = true;
      generationRef.current += 1;
      readyRef.current = false;
      clearIframeLoadTimer();
      clearPlayerEventTimer();
      window.removeEventListener("message", onMessage);
    };
  }, [applyTikTokSync, clearIframeLoadTimer, clearPlayerEventTimer, clockAnchorRef, markPlayerUnavailable, markTrustedPlayerEvent, sendTikTokSeekCommand, sendTikTokVoidCommand, sync.postId, sync.trackId, updateDiagnostics]);

  const safeStatus = playerError ? "failed" : diagnostics.status;
  return <div className="live-overlay-tiktok-player" aria-label="Muted TikTok overlay player" data-tiktok-status={safeStatus} data-tiktok-failure-reason={playerError?.reason ?? diagnostics.failureReason ?? undefined} data-tiktok-error-code={playerError?.code ?? diagnostics.errorCode ?? undefined} data-tiktok-first-event={diagnostics.firstTrustedEventType} data-tiktok-last-event={diagnostics.lastTrustedEventType} data-tiktok-drift-seconds={diagnostics.driftSeconds} data-tiktok-drift-direction={diagnostics.driftDirection} data-tiktok-correction-target={diagnostics.correctionTargetSeconds} data-tiktok-correction-count={diagnostics.correctionCount} data-tiktok-correction-reason={diagnostics.correctionReason} data-overlay-server-clock={clockAnchored ? "anchored" : "missing"} data-overlay-response-transit-ms={responseTransitMs ?? undefined}><iframe ref={iframeRef} onLoad={handleIframeLoad} title={`TikTok overlay for ${artistName} — ${trackTitle}`} src={src} className={playerError ? "live-overlay-tiktok-iframe live-overlay-tiktok-iframe--hidden" : "live-overlay-tiktok-iframe"} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />{playerError && <div className="live-overlay-tiktok-fallback" role="status" data-tiktok-status="failed" data-tiktok-failure-reason={playerError.reason} data-tiktok-error-code={playerError.code} data-tiktok-first-event={diagnostics.firstTrustedEventType} data-tiktok-last-event={diagnostics.lastTrustedEventType} data-tiktok-drift-seconds={diagnostics.driftSeconds} data-tiktok-drift-direction={diagnostics.driftDirection} data-tiktok-correction-target={diagnostics.correctionTargetSeconds} data-tiktok-correction-count={diagnostics.correctionCount} data-tiktok-correction-reason={diagnostics.correctionReason} data-overlay-server-clock={clockAnchored ? "anchored" : "missing"} data-overlay-response-transit-ms={responseTransitMs ?? undefined}><p>{artistName}</p><strong>{trackTitle}</strong><span>{playerError.message}</span></div>}</div>;
}

export function LiveOverlayReceiver({ wheelOnly = false }: { wheelOnly?: boolean }) {
  const [scene, setScene] = useState<ResolvedLiveOverlayScene>(fallbackScene());
  const [connected, setConnected] = useState(false);
  const [audioArmed, setAudioArmed] = useState(wheelOnly);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [audioJustArmed, setAudioJustArmed] = useState(false);
  const [serverClockAnchored, setServerClockAnchored] = useState(false);
  const [responseTransitDiagnosticMs, setResponseTransitDiagnosticMs] = useState<number | null>(null);
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);
  const sfxContextRef = useRef<AudioContext | null>(null);
  const cheerBufferRef = useRef<AudioBuffer | null>(null);
  const encryptBufferRef = useRef<AudioBuffer | null>(null);
  const spinFadeFrameRef = useRef<number | null>(null);
  const serverClockAnchorRef = useRef<OverlayServerClockAnchor | null>(null);
  const responseTransitEstimateMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!wheelOnly) return undefined;
    let cancelled = false;
    const spin = new Audio("/audio/wheel/142.mp3");
    spin.preload = "auto";
    spinAudioRef.current = spin;
    const context = new AudioContext();
    sfxContextRef.current = context;
    void Promise.all([
      decodeAudioBuffer(context, WHEEL_WINNER_CHEER_AUDIO_PATH),
      decodeAudioBuffer(context, WHEEL_REENCRYPT_AUDIO_PATH),
    ]).then(([cheerBuffer, encryptBuffer]) => {
      if (cancelled) return;
      cheerBufferRef.current = cheerBuffer;
      encryptBufferRef.current = encryptBuffer;
    });
    return () => {
      cancelled = true;
      stopWheelAudio(spin);
      spinAudioRef.current = null;
      cheerBufferRef.current = null;
      encryptBufferRef.current = null;
      sfxContextRef.current = null;
      void context.close().catch(() => undefined);
    };
  }, [wheelOnly]);

  useEffect(() => {
    let cancelled = false;
    let requestSeq = 0;
    let latestAppliedSeq = 0;
    let activeController: AbortController | null = null;
    let permanentTimeoutId: number | null = null;
    let permanentInFlight = false;
    let permanentWakeRequested = false;
    let wheelSessionActive = false;
    let wheelCeremonyActive = false;

    async function poll(): Promise<boolean | null> {
      if (cancelled) return null;
      const seq = requestSeq + 1;
      requestSeq = seq;
      activeController = new AbortController();
      try {
        const requestStartedAtPerformanceMs = performance.now();
        const res = await fetch(wheelOnly ? "/api/overlay/wheel" : "/api/overlay/live", { cache: "no-store", signal: activeController.signal });
        if (!res.ok) throw new Error("Overlay state unavailable");
        const next = await res.json() as { snapshot?: WheelOverlaySnapshot; scene?: ResolvedLiveOverlayScene; serverRequestReceivedAt?: string; serverNow?: string };
        const responseReceivedAtPerformanceMs = performance.now();
        const serverRequestReceivedAtMs = typeof next?.serverRequestReceivedAt === "string" ? new Date(next.serverRequestReceivedAt).getTime() : Number.NaN;
        const serverNowMs = typeof next?.serverNow === "string" ? new Date(next.serverNow).getTime() : Number.NaN;
        const serverProcessingMs = serverNowMs - serverRequestReceivedAtMs;
        const responseTransitMs = estimateOneWayNetworkTransitMs(responseReceivedAtPerformanceMs - requestStartedAtPerformanceMs, serverProcessingMs);
        responseTransitEstimateMsRef.current = updateTransitEstimateMs(responseTransitEstimateMsRef.current, responseTransitMs);
        const wheelSnapshot = wheelOnly ? next.snapshot : undefined;
        const nextScene = wheelOnly ? wheelSnapshot?.scene ?? fallbackScene() : next.scene ?? fallbackScene();
        const nextSessionActive = wheelOnly ? wheelSnapshot?.sessionActive === true : hasActiveQueueSession(nextScene);
        wheelSessionActive = nextSessionActive;
        wheelCeremonyActive = wheelOnly ? wheelSnapshot?.wheelActive === true : Boolean(nextScene.wheelCeremony);
        if (!cancelled && seq > latestAppliedSeq) {
          latestAppliedSeq = seq;
          const clockAnchor = Number.isFinite(serverNowMs) && Number.isFinite(serverRequestReceivedAtMs) ? { serverNowMs, receivedAtPerformanceMs: responseReceivedAtPerformanceMs, responseTransitEstimateMs: responseTransitEstimateMsRef.current ?? 0 } : null;
          serverClockAnchorRef.current = clockAnchor;
          const nextAnchored = clockAnchor !== null;
          setServerClockAnchored((current) => current === nextAnchored ? current : nextAnchored);
          const nextTransitDiagnosticMs = clockAnchor ? Math.round(clockAnchor.responseTransitEstimateMs) : null;
          setResponseTransitDiagnosticMs((current) => current === nextTransitDiagnosticMs ? current : nextTransitDiagnosticMs);
          setScene(nextScene);
          setConnected(true);
        }
        return nextSessionActive;
      } catch {
        if (!cancelled) setConnected(false);
        return null;
      } finally {
        activeController = null;
      }
    }

    if (!wheelOnly) {
      const stopPolling = startSessionBoundPolling({ intervalMs: OVERLAY_POLL_DELAY_MS, poll });
      return () => {
        cancelled = true;
        stopPolling();
        activeController?.abort();
      };
    }

    const clearPermanentSchedule = () => {
      if (permanentTimeoutId !== null) window.clearTimeout(permanentTimeoutId);
      permanentTimeoutId = null;
    };
    const schedulePermanentPoll = () => {
      clearPermanentSchedule();
      if (cancelled) return;
      const delayMs = wheelCeremonyActive
        ? WHEEL_OVERLAY_ACTIVE_POLL_INTERVAL_MS
        : wheelSessionActive
          ? WHEEL_OVERLAY_SHOW_IDLE_POLL_INTERVAL_MS
          : WHEEL_OVERLAY_STANDBY_POLL_INTERVAL_MS;
      permanentTimeoutId = window.setTimeout(() => { void runPermanentPoll(); }, delayMs);
    };
    async function runPermanentPoll() {
      if (cancelled) return;
      if (permanentInFlight) {
        permanentWakeRequested = true;
        return;
      }
      clearPermanentSchedule();
      permanentInFlight = true;
      await poll();
      permanentInFlight = false;
      if (cancelled) return;
      if (permanentWakeRequested) {
        permanentWakeRequested = false;
        void runPermanentPoll();
        return;
      }
      schedulePermanentPoll();
    }
    const wakePermanentPoll = () => { void runPermanentPoll(); };
    window.addEventListener("focus", wakePermanentPoll);
    window.addEventListener("pageshow", wakePermanentPoll);
    window.addEventListener("online", wakePermanentPoll);
    void runPermanentPoll();

    return () => {
      cancelled = true;
      clearPermanentSchedule();
      activeController?.abort();
      window.removeEventListener("focus", wakePermanentPoll);
      window.removeEventListener("pageshow", wakePermanentPoll);
      window.removeEventListener("online", wakePermanentPoll);
    };
  }, [wheelOnly]);

  const label = useMemo(() => modeLabel(scene.mode), [scene.mode]);
  const trackVisible = showTrack(scene);
  const youtubeVisible = scene.mode === "now_playing" && scene.automatic && scene.youtube && scene.track;
  const tiktokVisible = scene.mode === "now_playing" && scene.automatic && scene.tiktok && scene.track;
  const wheelVisible = Boolean(scene.wheelCeremony);
  const shortYouTube = scene.track?.youtubePresentation === "short";
  const youtubeSceneClass = shortYouTube ? "live-overlay-youtube-scene live-overlay-youtube-scene--short" : "live-overlay-youtube-scene";

  async function enableOverlayAudio() {
    const spin = new Audio("/audio/wheel/142.mp3");
    spinAudioRef.current = spin;
    spin.preload = "auto";
    const testPlay = async (a: HTMLAudioElement) => {
      try {
        a.volume = 0.08;
        await a.play();
        await new Promise((r) => window.setTimeout(r, 160));
        a.pause();
        a.currentTime = 0;
        return true;
      } catch {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          // ignore
        }
        return false;
      }
    };

    const spinOk = await testPlay(spin);

    if (spinOk) {
      if (!sfxContextRef.current) sfxContextRef.current = new AudioContext();
      try {
        await sfxContextRef.current.resume();
      } catch {
        // non-blocking
      }
      const [cheerBuffer, encryptBuffer] = await Promise.all([
        decodeAudioBuffer(sfxContextRef.current, WHEEL_WINNER_CHEER_AUDIO_PATH),
        decodeAudioBuffer(sfxContextRef.current, WHEEL_REENCRYPT_AUDIO_PATH),
      ]);
      cheerBufferRef.current = cheerBuffer;
      encryptBufferRef.current = encryptBuffer;
      setAudioArmed(true);
      setAudioJustArmed(true);
      window.setTimeout(() => setAudioJustArmed(false), 2200);
      setAudioNotice(!cheerBuffer || !encryptBuffer ? "WHEEL SFX UNAVAILABLE" : null);
      return;
    }

    setAudioArmed(false);
    setAudioNotice("AUDIO COULD NOT BE ENABLED — CLICK AGAIN");
  }

  async function playSpinMusic(path?: string) { const a = spinAudioRef.current; if (!a || !audioArmed) return; a.loop = true; a.volume = WHEEL_SPIN_VOLUME; const p = safeWheelAudioPath(path) ?? a.src ?? "/audio/wheel/142.mp3"; if (!a.src || !a.src.endsWith(p)) a.src = p; try { await a.play(); } catch {} }
  function fadeSpinMusic() { const a = spinAudioRef.current; if (!a) return; const sv = a.volume || WHEEL_SPIN_VOLUME; const st = performance.now(); const tick = (n: number) => { const pr = Math.max(0, Math.min(1, (n - st) / WHEEL_AUDIO_FADE_OUT_MS)); a.volume = sv * (1 - pr); if (pr >= 1) { stopWheelAudio(a); a.volume = sv; spinFadeFrameRef.current = null; return; } spinFadeFrameRef.current = window.requestAnimationFrame(tick); }; if (spinFadeFrameRef.current) window.cancelAnimationFrame(spinFadeFrameRef.current); spinFadeFrameRef.current = window.requestAnimationFrame(tick); }
  function playSfxBuffer(bufferRef: React.MutableRefObject<AudioBuffer | null>, volume: number) {
    const context = sfxContextRef.current;
    const buffer = bufferRef.current;
    if (!context || !buffer || !audioArmed) {
      setAudioNotice("WHEEL SFX UNAVAILABLE");
      return;
    }
    const run = () => {
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(0);
    };
    if (context.state === "suspended") {
      void context.resume().then(run).catch(() => setAudioNotice("WHEEL SFX UNAVAILABLE"));
      return;
    }
    try {
      run();
    } catch {
      setAudioNotice("WHEEL SFX UNAVAILABLE");
    }
  }

  if (wheelOnly) {
    return (
      <div
        className="wheel-overlay-shell"
        data-audio-armed={audioArmed ? "true" : "false"}
        data-connection={connected ? "connected" : "reconnecting"}
        data-wheel-active={wheelVisible ? "true" : "false"}
        aria-label="BARCODE Radio permanent wheel browser source"
      >
        {wheelVisible ? (
          <section className="wheel-overlay-stage live-overlay-stage live-overlay-stage--wheel live-overlay-stage--wheel-ceremony">
            <div className="live-overlay-noise" aria-hidden="true" />
            <div className="live-overlay-corners" aria-hidden="true" />
            <div className="live-overlay-content">
              <WheelCeremonyOverlay scene={scene} audioArmed={audioArmed} audioNotice={null} audioJustArmed={false} playSpinMusic={playSpinMusic} fadeSpinMusic={fadeSpinMusic} playCheerSfx={() => playSfxBuffer(cheerBufferRef, WHEEL_CHEER_VOLUME)} playEncryptSfx={() => playSfxBuffer(encryptBufferRef, WHEEL_ENCRYPT_VOLUME)} />
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="live-overlay-shell" aria-label="BARCODE Radio live overlay receiver">
      <section className={`live-overlay-stage ${frameTone(scene.mode)} ${youtubeVisible ? "live-overlay-stage--youtube" : ""} ${tiktokVisible ? "live-overlay-stage--tiktok" : ""} ${wheelVisible ? "live-overlay-stage--wheel-ceremony" : ""}`}>
        <div className="live-overlay-noise" aria-hidden="true" />
        <div className="live-overlay-corners" aria-hidden="true" />
        <div className="live-overlay-header">
          <span className="live-overlay-kicker">BARCODE RADIO</span>
          <span className={connected ? "live-overlay-signal live-overlay-signal--online" : "live-overlay-signal"}>{connected ? "AUTO SIGNAL" : "SIGNAL HOLD"}</span>
        </div>

        <main className="live-overlay-content">
          {wheelVisible ? (
            <WheelCeremonyOverlay scene={scene} audioArmed={audioArmed} audioNotice={audioNotice} audioJustArmed={audioJustArmed} playSpinMusic={playSpinMusic} fadeSpinMusic={fadeSpinMusic} playCheerSfx={() => playSfxBuffer(cheerBufferRef, WHEEL_CHEER_VOLUME)} playEncryptSfx={() => playSfxBuffer(encryptBufferRef, WHEEL_ENCRYPT_VOLUME)} />
          ) : youtubeVisible && scene.youtube && scene.track ? (
            <div className={youtubeSceneClass}>
              <div className="live-overlay-youtube-viewport">
                <YouTubeOverlayPlayer sync={scene.youtube} clockAnchorRef={serverClockAnchorRef} clockAnchored={serverClockAnchored} responseTransitMs={responseTransitDiagnosticMs} />
              </div>
              <div className="live-overlay-youtube-lower">
                <p className="live-overlay-mode">{label}</p>
                <h1>{scene.track.artistName}</h1>
                <h2>{scene.track.trackTitle}</h2>
              </div>
            </div>
          ) : tiktokVisible && scene.tiktok && scene.track ? (
            <div className="live-overlay-tiktok-scene live-overlay-vertical-video-scene">
              <div className="live-overlay-tiktok-viewport">
                <TikTokOverlayPlayer key={`${scene.tiktok.trackId ?? "trackless"}:${scene.tiktok.postId}`} sync={scene.tiktok} artistName={scene.track.artistName} trackTitle={scene.track.trackTitle} clockAnchorRef={serverClockAnchorRef} clockAnchored={serverClockAnchored} responseTransitMs={responseTransitDiagnosticMs} />
              </div>
              <div className="live-overlay-tiktok-rail">
                <p className="live-overlay-mode">{label}</p>
                <h1>{scene.track.artistName}</h1>
                <h2>{scene.track.trackTitle}</h2>
              </div>
            </div>
          ) : trackVisible && scene.track ? (
            <div className="live-overlay-track-grid">
              <div className="live-overlay-art-frame">
                {scene.artworkUrl ? <img src={scene.artworkUrl} alt="Current track artwork" className="live-overlay-art" /> : <div className="live-overlay-art-fallback"><span>BN</span></div>}
              </div>
              <div className="live-overlay-track-copy">
                <p className="live-overlay-mode">{label}</p>
                <h1>{scene.track.artistName}</h1>
                <h2>{scene.track.trackTitle}</h2>
                {scene.message && <p className="live-overlay-message">{scene.message}</p>}
                <div className="live-overlay-meta">
                  {scene.track.sourceType && <span>{String(scene.track.sourceType).toUpperCase()}</span>}
                  {scene.track.durationLabel && <span>{scene.track.durationLabel}</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="live-overlay-center-card">
              <p className="live-overlay-mode">{label}</p>
              <h1>{scene.title || "BARCODE RADIO"}</h1>
              {scene.subtitle && <h2>{scene.subtitle}</h2>}
              {scene.message && <p className="live-overlay-message">{scene.message}</p>}
              {scene.mode === "video_placeholder" && scene.videoUrl && <p className="live-overlay-url">Link staged · playback disabled</p>}
            </div>
          )}
        </main>

        {!wheelVisible && <div className="live-overlay-footer">
          <span>{scene.automatic ? "AUTO LIVE SOURCE" : "OVERRIDE LIVE SOURCE"} / 1:1</span>
          <span>{new Date(scene.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>}
        {!audioArmed && <div className="live-overlay-wheel-audio-modal" role="dialog" aria-modal="true" aria-label="Enable live overlay audio"><div className="live-overlay-wheel-audio-modal-card"><p>ENABLE LIVE OVERLAY AUDIO</p><span>Required for wheel music, winner sounds, and broadcast effects.</span><span>Click once before the show.</span><button type="button" className="live-overlay-wheel-audio-arm" onClick={() => { void enableOverlayAudio(); }}>ENABLE AUDIO</button>{audioNotice && <em>{audioNotice}</em>}</div></div>}
      </section>
    </div>
  );
}
