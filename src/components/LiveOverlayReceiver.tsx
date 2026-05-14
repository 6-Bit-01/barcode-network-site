/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResolvedLiveOverlayScene } from "@/lib/live-overlay";

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
          setScene(next);
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

  return (
    <div className="live-overlay-shell" aria-label="BARCODE Radio live overlay receiver">
      <section className={`live-overlay-stage ${frameTone(scene.mode)}`}>
        <div className="live-overlay-noise" aria-hidden="true" />
        <div className="live-overlay-corners" aria-hidden="true" />
        <div className="live-overlay-header">
          <span className="live-overlay-kicker">BARCODE RADIO</span>
          <span className={connected ? "live-overlay-signal live-overlay-signal--online" : "live-overlay-signal"}>{connected ? "AUTO SIGNAL" : "SIGNAL HOLD"}</span>
        </div>

        <main className="live-overlay-content">
          {trackVisible && scene.track ? (
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
