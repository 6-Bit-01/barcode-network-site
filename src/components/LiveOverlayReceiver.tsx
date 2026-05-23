/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { buildWheelSegments, wheelFinalRotationForSegment, wheelUprightLabelRotationDegrees } from "@/lib/live-overlay-resolver";
import type { LiveOverlayYouTubeSync, ResolvedLiveOverlayScene } from "@/lib/live-overlay";

type YTPlayer = {
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  mute: () => void;
};

declare global {
  interface Window {
    YT?: { Player: new (elementId: string, options: Record<string, unknown>) => YTPlayer };
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

const WHEEL_SPIN_START_DELAY_MS = 850;
const WHEEL_AUDIO_FADE_OUT_MS = 10_000;
const WHEEL_WINNER_CHEER_AUDIO_PATH = "/audio/wheel/WheelCheer.mp3";
const WHEEL_REENCRYPT_AUDIO_PATH = "/audio/wheel/WheelEncrypt.mp3";
const WHEEL_RESULT_REVEAL_DELAY_MS = 700;

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
  "/audio/wheel/126.mp3",
  "/audio/wheel/148.mp3",
  "/audio/wheel/162.mp3",
  "/audio/wheel/104.mp3",
  "/audio/wheel/32%20(1).mp3",
  "/audio/wheel/140.mp3",
  "/audio/wheel/81.mp3",
  "/audio/wheel/75.mp3",
  "/audio/wheel/129.mp3",
  "/audio/wheel/78.mp3",
  "/audio/wheel/36.mp3",
  "/audio/wheel/154.mp3",
  "/audio/wheel/24.mp3",
  "/audio/wheel/41.mp3",
  "/audio/wheel/130.mp3",
  "/audio/wheel/70.mp3",
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
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return await context.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  }
}

async function unlockAudioElement(audio: HTMLAudioElement): Promise<boolean> {
  try {
    const originalVolume = audio.volume;
    const originalMuted = audio.muted;
    audio.muted = true;
    audio.volume = 0.0001;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.muted = originalMuted;
    audio.volume = originalVolume;
    return true;
  } catch {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
    return false;
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wheelLabelMetrics(count: number) {
  if (count <= 4) return { width: 35, radius: 26.4, size: 4.65, tracking: "0.001em", lines: 3 };
  if (count <= 6) return { width: 31, radius: 27.8, size: 3.88, tracking: "0.001em", lines: 3 };
  if (count <= 8) return { width: 27, radius: 29.5, size: 3.12, tracking: "0.002em", lines: 3 };
  if (count <= 12) return { width: 22, radius: 31.5, size: 2.28, tracking: "0.002em", lines: 3 };
  if (count <= 16) return { width: 18.4, radius: 33.2, size: 1.72, tracking: "0.001em", lines: 2 };
  if (count <= 24) return { width: 15.2, radius: 35.1, size: 1.28, tracking: "0", lines: 2 };
  return { width: 12.4, radius: 36.7, size: 0.98, tracking: "0", lines: 2 };
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
  const size = clampNumber(Math.min(base.size * shortNameBoost, fitSize), count <= 16 ? 0.92 : 0.72, base.size * 1.28);
  return {
    width: `${width.toFixed(2)}vmin`,
    radius,
    size: `${size.toFixed(2)}vmin`,
    lines,
    tracking: length <= 12 ? "0.002em" : base.tracking,
    lineHeight: lines === 1 ? "0.92" : lines === 2 ? "0.86" : "0.8",
  };
}

function wheelLabelPosition(angle: number, radius: number, wheelRotationDeg: number) {
  const radians = (angle * Math.PI) / 180;
  const x = Math.sin(radians) * radius;
  const y = Math.cos(radians) * -radius;
  const finalVisualAngle = (((angle + wheelRotationDeg) % 360) + 360) % 360;
  const inRightSelectorZone = finalVisualAngle >= 60 && finalVisualAngle <= 120;
  const rotation = inRightSelectorZone ? 0 : wheelUprightLabelRotationDegrees(angle);
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
  const [frozenRotationDeg, setFrozenRotationDeg] = useState<number | null>(null);
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
  const status = ceremony?.status ?? "idle";
  const spinDurationMs = Math.max(16_000, ceremony?.spinDurationMs ?? 24_000);
  const spinStartedAtMs = ceremony?.spinStartedAt ? new Date(ceremony.spinStartedAt).getTime() : null;
  const spinEndsAtMs = spinStartedAtMs ? spinStartedAtMs + WHEEL_SPIN_START_DELAY_MS + spinDurationMs : null;
  const revealKey = `${ceremony?.resultTrackId ?? "none"}:${ceremony?.status ?? "none"}`;
  const showResultPending = ceremony?.status === "result_pending" && resultRevealReadyKey === revealKey;
  const spinShouldStillAnimate = ceremony?.status === "spinning" && frozenRotationDeg === null;
  const displayRotationDeg = frozenRotationDeg ?? finalRotationDeg;
  const visualWheelRotationDeg = status === "result_pending" || status === "confirmed" || status === "spinning" ? displayRotationDeg : 0;

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
    if (ceremony?.status !== "spinning") { window.setTimeout(() => setFrozenRotationDeg(null), 0); return; }
    const freezeTimer = window.setTimeout(() => {
      setFrozenRotationDeg(finalRotationDeg);
    }, Math.max(0, (spinEndsAtMs ?? Date.now()) - Date.now()));
    return () => window.clearTimeout(freezeTimer);
  }, [ceremony?.status, spinEndsAtMs, finalRotationDeg]);

  useEffect(() => {
    if (resultRevealTimeoutRef.current !== null) {
      window.clearTimeout(resultRevealTimeoutRef.current);
      resultRevealTimeoutRef.current = null;
    }
    if (ceremony?.status !== "result_pending") return;
    const waitMs = Math.max(0, (spinEndsAtMs ?? Date.now()) - Date.now()) + WHEEL_RESULT_REVEAL_DELAY_MS;
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
        <div className="live-overlay-wheel" style={{ ...wheelStyle, ...(frozenRotationDeg !== null ? { transform: `rotate(${displayRotationDeg}deg)` } : {}) }}>
          <div className="live-overlay-wheel-slices" aria-hidden="true" />
          {result && (ceremony?.status === "result_pending" || ceremony?.status === "confirmed") && <div className="live-overlay-wheel-winning-segment" aria-hidden="true" />}
          {candidates.length === 0 ? <span className="live-overlay-wheel-empty">NO CANDIDATES</span> : candidates.map((candidate, index) => {
            const segment = wheelSegments[index] ?? resultSegment;
            const angle = segment.centerAngle;
            const label = candidate.artistName.replace(/\s+/g, " ").trim();
            const labelFit = wheelLabelFit(label, candidateCount, segment.angleSize);
            const position = wheelLabelPosition(angle, labelFit.radius, visualWheelRotationDeg);
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

function expectedYouTubeTime(sync: LiveOverlayYouTubeSync): number {
  if (sync.playbackState !== "playing") return sync.currentTimeSeconds;
  const elapsed = Math.max(0, (Date.now() - new Date(sync.updatedAt).getTime()) / 1000);
  return sync.currentTimeSeconds + elapsed;
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

function YouTubeOverlayPlayer({ sync }: { sync: LiveOverlayYouTubeSync }) {
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const loadedVideoRef = useRef<string | null>(null);
  const containerId = "live-overlay-youtube-player";

  useEffect(() => {
    let cancelled = false;
    ensureYouTubeApi().then(() => {
      if (cancelled || playerRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(containerId, {
        videoId: sync.videoId,
        playerVars: { autoplay: 1, controls: 0, modestbranding: 1, playsinline: 1, rel: 0, mute: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            playerRef.current?.mute();
            playerRef.current?.loadVideoById({ videoId: sync.videoId, startSeconds: expectedYouTubeTime(sync) });
            loadedVideoRef.current = sync.videoId;
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sync]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    const expected = expectedYouTubeTime(sync);
    if (loadedVideoRef.current !== sync.videoId) {
      player.loadVideoById({ videoId: sync.videoId, startSeconds: expected });
      loadedVideoRef.current = sync.videoId;
    } else {
      const current = player.getCurrentTime();
      if (Number.isFinite(current) && Math.abs(current - expected) > 1.75) player.seekTo(expected, true);
    }
    player.mute();
    if (sync.playbackState === "playing") player.playVideo();
    else if (sync.playbackState === "paused") player.pauseVideo();
    else {
      player.pauseVideo();
      player.seekTo(sync.currentTimeSeconds, true);
    }
  }, [sync]);

  return <div className="live-overlay-youtube-player" id={containerId} aria-label="Muted YouTube overlay player" />;
}

export function LiveOverlayReceiver() {
  const [scene, setScene] = useState<ResolvedLiveOverlayScene>(fallbackScene());
  const [connected, setConnected] = useState(false);
  const [audioArmed, setAudioArmed] = useState(false);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [audioJustArmed, setAudioJustArmed] = useState(false);
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const cheerBufferRef = useRef<AudioBuffer | null>(null);
  const encryptBufferRef = useRef<AudioBuffer | null>(null);
  const spinFadeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/overlay/live", { cache: "no-store" });
        if (!res.ok) throw new Error("Overlay state unavailable");
        const next = await res.json();
        if (!cancelled) {
          setScene(next.scene ?? next);
          setConnected(true);
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    }
    load();
    const interval = window.setInterval(load, 650);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const label = useMemo(() => modeLabel(scene.mode), [scene.mode]);
  const trackVisible = showTrack(scene);
  const youtubeVisible = scene.mode === "now_playing" && scene.automatic && scene.youtube && scene.track;
  const wheelVisible = Boolean(scene.wheelCeremony);

  async function enableOverlayAudio() {
    const spin = new Audio("/audio/wheel/142.mp3");
    spinAudioRef.current = spin;
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
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      try { await audioContextRef.current.resume(); } catch { /* ignore */ }
      const [cheerBuffer, encryptBuffer] = await Promise.all([
        decodeAudioBuffer(audioContextRef.current, WHEEL_WINNER_CHEER_AUDIO_PATH),
        decodeAudioBuffer(audioContextRef.current, WHEEL_REENCRYPT_AUDIO_PATH),
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

  async function playSpinMusic(path?: string) { const a = spinAudioRef.current; if (!a || !audioArmed) return; a.loop = true; a.volume = 0.82; const p = safeWheelAudioPath(path) ?? a.src ?? "/audio/wheel/142.mp3"; if (!a.src || !a.src.endsWith(p)) a.src = p; try { await a.play(); } catch {} }
  function fadeSpinMusic() { const a = spinAudioRef.current; if (!a) return; const sv = a.volume || 0.82; const st = performance.now(); const tick = (n: number) => { const pr = Math.max(0, Math.min(1, (n - st) / WHEEL_AUDIO_FADE_OUT_MS)); a.volume = sv * (1 - pr); if (pr >= 1) { stopWheelAudio(a); a.volume = sv; spinFadeFrameRef.current = null; return; } spinFadeFrameRef.current = window.requestAnimationFrame(tick); }; if (spinFadeFrameRef.current) window.cancelAnimationFrame(spinFadeFrameRef.current); spinFadeFrameRef.current = window.requestAnimationFrame(tick); }
  function playOneShotBuffer(buffer: AudioBuffer | null, volume: number) {
    const ctx = audioContextRef.current;
    if (!ctx || !buffer || !audioArmed) return;
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    } catch {
      setAudioNotice("WHEEL SFX PLAYBACK LOCKED");
    }
  }

  return (
    <div className="live-overlay-shell" aria-label="BARCODE Radio live overlay receiver">
      <section className={`live-overlay-stage ${frameTone(scene.mode)} ${youtubeVisible ? "live-overlay-stage--youtube" : ""} ${wheelVisible ? "live-overlay-stage--wheel-ceremony" : ""}`}>
        <div className="live-overlay-noise" aria-hidden="true" />
        <div className="live-overlay-corners" aria-hidden="true" />
        <div className="live-overlay-header">
          <span className="live-overlay-kicker">BARCODE RADIO</span>
          <span className={connected ? "live-overlay-signal live-overlay-signal--online" : "live-overlay-signal"}>{connected ? "AUTO SIGNAL" : "SIGNAL HOLD"}</span>
        </div>

        <main className="live-overlay-content">
          {wheelVisible ? (
            <WheelCeremonyOverlay scene={scene} audioArmed={audioArmed} audioNotice={audioNotice} audioJustArmed={audioJustArmed} playSpinMusic={playSpinMusic} fadeSpinMusic={fadeSpinMusic} playCheerSfx={() => playOneShotBuffer(cheerBufferRef.current, 0.95)} playEncryptSfx={() => playOneShotBuffer(encryptBufferRef.current, 0.92)} />
          ) : youtubeVisible && scene.youtube && scene.track ? (
            <div className="live-overlay-youtube-scene">
              <YouTubeOverlayPlayer sync={scene.youtube} />
              <div className="live-overlay-youtube-lower">
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
