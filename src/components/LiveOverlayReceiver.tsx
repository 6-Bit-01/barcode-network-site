/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  if (mode === "wheel_ready") return "WHEEL SIGNAL";
  if (mode === "video_placeholder") return "VIDEO LINK";
  if (mode === "system_message") return "SYSTEM";
  if (mode === "session_active") return "LIVE INTAKE";
  if (mode === "sponsor") return "SPONSOR";
  return "STANDBY";
}

function frameTone(mode: ResolvedLiveOverlayScene["mode"]): string {
  if (mode === "wheel_ready") return "live-overlay-stage--wheel";
  if (mode === "sponsor" || mode === "system_message") return "live-overlay-stage--message";
  if (mode === "video_placeholder") return "live-overlay-stage--video";
  return "";
}

function showTrack(scene: ResolvedLiveOverlayScene): boolean {
  return Boolean((scene.mode === "now_playing" || scene.mode === "artist_card") && scene.track);
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

  return (
    <div className="live-overlay-shell" aria-label="BARCODE Radio live overlay receiver">
      <section className={`live-overlay-stage ${frameTone(scene.mode)} ${youtubeVisible ? "live-overlay-stage--youtube" : ""}`}>
        <div className="live-overlay-noise" aria-hidden="true" />
        <div className="live-overlay-corners" aria-hidden="true" />
        <div className="live-overlay-header">
          <span className="live-overlay-kicker">BARCODE RADIO</span>
          <span className={connected ? "live-overlay-signal live-overlay-signal--online" : "live-overlay-signal"}>{connected ? "AUTO SIGNAL" : "SIGNAL HOLD"}</span>
        </div>

        <main className="live-overlay-content">
          {youtubeVisible && scene.youtube && scene.track ? (
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

        <div className="live-overlay-footer">
          <span>{scene.automatic ? "AUTO LIVE SOURCE" : "OVERRIDE LIVE SOURCE"} / 1:1</span>
          <span>{new Date(scene.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </section>
    </div>
  );
}
