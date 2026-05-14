/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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

const FALLBACK_WHEEL_AUDIO_FILES = [
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

function safeWheelAudioPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
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

function stopWheelAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}


function wheelLabelMetrics(count: number) {
  if (count <= 4) return { maxLength: 64, width: "38vmin", distance: "2.2vmin", size: "4.8vmin", tracking: "0.025em", rail: "34vmin" };
  if (count <= 6) return { maxLength: 56, width: "34vmin", distance: "3.8vmin", size: "3.95vmin", tracking: "0.03em", rail: "31vmin" };
  if (count <= 8) return { maxLength: 48, width: "30vmin", distance: "5.5vmin", size: "3.15vmin", tracking: "0.035em", rail: "28vmin" };
  if (count <= 12) return { maxLength: 40, width: "26vmin", distance: "7.4vmin", size: "2.35vmin", tracking: "0.04em", rail: "24vmin" };
  if (count <= 16) return { maxLength: 34, width: "22vmin", distance: "9.6vmin", size: "1.8vmin", tracking: "0.045em", rail: "21vmin" };
  if (count <= 24) return { maxLength: 28, width: "18vmin", distance: "11.4vmin", size: "1.3vmin", tracking: "0.05em", rail: "18vmin" };
  return { maxLength: 22, width: "15vmin", distance: "13vmin", size: "1vmin", tracking: "0.045em", rail: "14vmin" };
}

function shortWheelLabel(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function WheelCeremonyOverlay({ scene }: { scene: ResolvedLiveOverlayScene }) {
  const ceremony = scene.wheelCeremony;
  const candidates = ceremony?.displayCandidates ?? [];
  const result = ceremony?.resultTrack;
  const spinning = ceremony?.status === "spinning";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const candidateCount = Math.max(1, candidates.length);
  const resultIndex = Math.max(0, candidates.findIndex((candidate) => candidate.id === result?.id));
  const sliceDegrees = 360 / candidateCount;
  const resultCenterAngle = resultIndex * sliceDegrees + sliceDegrees / 2;
  const sliceColors = ["#67e8f9", "#0ea5e9", "#2563eb", "#7c3aed", "#c026d3", "#ff2b6d", "#ef4444", "#f97316", "#facc15", "#22c55e", "#e5e7eb", "#071426"];
  const sliceBackground = candidates.length > 0 ? `conic-gradient(from -90deg, ${candidates.map((_, index) => `${sliceColors[index % sliceColors.length]} ${index * sliceDegrees}deg ${(index + 1) * sliceDegrees}deg`).join(", ")})` : "radial-gradient(circle, #67e8f9, #0284c7)";
  const labelMetrics = wheelLabelMetrics(candidates.length);
  const wheelStyle = {
    "--wheel-final-rotation": `${1440 - resultCenterAngle}deg`,
    "--wheel-spin-duration": `${Math.max(16, (ceremony?.spinDurationMs ?? 24000) / 1000)}s`,
    "--wheel-slice-count": candidateCount,
    "--wheel-slice-background": sliceBackground,
    "--wheel-name-size": labelMetrics.size,
    "--wheel-label-width": labelMetrics.width,
    "--wheel-label-distance": labelMetrics.distance,
    "--wheel-letter-spacing": labelMetrics.tracking,
    "--wheel-rail-length": labelMetrics.rail,
  } as CSSProperties;
  const labelMaxLength = labelMetrics.maxLength;

  useEffect(() => {
    const existingAudio = audioRef.current;
    if (!spinning) {
      stopWheelAudio(existingAudio);
      audioRef.current = null;
      return undefined;
    }

    let cancelled = false;
    loadWheelAudioFiles().then((files) => {
      if (cancelled || files.length === 0) return;
      const audioPath = files[Math.floor(Math.random() * files.length)] ?? files[0];
      if (!audioPath) return;
      const audio = new Audio(audioPath);
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.72;
      audioRef.current = audio;
      audio.play().catch(() => {
        stopWheelAudio(audio);
        if (audioRef.current === audio) audioRef.current = null;
      });
    });

    return () => {
      cancelled = true;
      stopWheelAudio(audioRef.current);
      audioRef.current = null;
    };
  }, [spinning, ceremony?.spinStartedAt, ceremony?.resultTrackId]);

  return (
    <div className={`live-overlay-wheel-scene live-overlay-wheel-scene--${ceremony?.status ?? "idle"} ${spinning ? "live-overlay-wheel-scene--spinning" : ""}`} data-wheel-seed={ceremony?.seed}>
      {ceremony?.status === "reencrypting" && <div className="live-overlay-wheel-glitch" aria-hidden="true">RE-ENCRYPTING SIGNAL</div>}
      <div className="live-overlay-wheel-heading" aria-live="polite">
        <p className="live-overlay-mode">{modeLabel(scene.mode)}</p>
        <h1>{scene.subtitle || scene.title}</h1>
      </div>

      <div className="live-overlay-wheel-wrap">
        <div className="live-overlay-wheel-pointer" aria-hidden="true" />
        <div className="live-overlay-wheel" style={wheelStyle}>
          <div className="live-overlay-wheel-slices" aria-hidden="true" />
          {candidates.length === 0 ? <span className="live-overlay-wheel-empty">NO CANDIDATES</span> : candidates.map((candidate, index) => {
            const angle = index * sliceDegrees + sliceDegrees / 2;
            const label = shortWheelLabel(candidate.artistName, labelMaxLength);
            const labelStyle = { "--wheel-label-angle": `${angle}deg` } as CSSProperties;
            return (
              <span key={candidate.id} className="live-overlay-wheel-slice-label" style={labelStyle} title={`${candidate.artistName} — ${candidate.trackTitle}`}>
                <span>{label}</span>
              </span>
            );
          })}
          <div className="live-overlay-wheel-core"><span>10K</span><small>TAP WHEEL</small></div>
        </div>
      </div>

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
    const interval = window.setInterval(load, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const label = useMemo(() => modeLabel(scene.mode), [scene.mode]);
  const trackVisible = showTrack(scene);
  const youtubeVisible = scene.mode === "now_playing" && scene.automatic && scene.youtube && scene.track;
  const wheelVisible = Boolean(scene.wheelCeremony);

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
            <WheelCeremonyOverlay scene={scene} />
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
      </section>
    </div>
  );
}
