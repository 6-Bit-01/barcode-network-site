/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveOverlayState } from "@/lib/live-overlay";

function fallbackState(): LiveOverlayState {
  return {
    mode: "standby",
    title: "BARCODE RADIO",
    subtitle: "LIVE OVERLAY RECEIVER",
    message: "Stand by for the next transmission.",
    artworkUrl: null,
    sourceUrl: null,
    updatedAt: new Date().toISOString(),
  };
}

function modeLabel(mode: LiveOverlayState["mode"]): string {
  if (mode === "now_playing") return "NOW PLAYING";
  if (mode === "artist_card") return "ARTIST CARD";
  if (mode === "wheel_ready") return "WHEEL SIGNAL";
  if (mode === "video_placeholder") return "VIDEO LINK";
  if (mode === "system_message") return "SYSTEM";
  if (mode === "sponsor") return "SPONSOR";
  return "STANDBY";
}

function frameTone(mode: LiveOverlayState["mode"]): string {
  if (mode === "wheel_ready") return "live-overlay-stage--wheel";
  if (mode === "sponsor" || mode === "system_message") return "live-overlay-stage--message";
  if (mode === "video_placeholder") return "live-overlay-stage--video";
  return "";
}

function showTrack(state: LiveOverlayState): boolean {
  return Boolean((state.mode === "now_playing" || state.mode === "artist_card") && (state.artistName || state.trackTitle));
}

export function LiveOverlayReceiver() {
  const [state, setState] = useState<LiveOverlayState>(fallbackState());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/overlay/live", { cache: "no-store" });
        if (!res.ok) throw new Error("Overlay state unavailable");
        const next = await res.json();
        if (!cancelled) {
          setState(next);
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

  const label = useMemo(() => modeLabel(state.mode), [state.mode]);
  const trackVisible = showTrack(state);

  return (
    <div className="live-overlay-shell" aria-label="BARCODE Radio live overlay receiver">
      <section className={`live-overlay-stage ${frameTone(state.mode)}`}>
        <div className="live-overlay-noise" aria-hidden="true" />
        <div className="live-overlay-corners" aria-hidden="true" />
        <div className="live-overlay-header">
          <span className="live-overlay-kicker">BARCODE RADIO</span>
          <span className={connected ? "live-overlay-signal live-overlay-signal--online" : "live-overlay-signal"}>{connected ? "SIGNAL LOCK" : "SIGNAL HOLD"}</span>
        </div>

        <main className="live-overlay-content">
          {trackVisible ? (
            <div className="live-overlay-track-grid">
              <div className="live-overlay-art-frame">
                {state.artworkUrl ? <img src={state.artworkUrl} alt="Current track artwork" className="live-overlay-art" /> : <div className="live-overlay-art-fallback"><span>BN</span></div>}
              </div>
              <div className="live-overlay-track-copy">
                <p className="live-overlay-mode">{label}</p>
                <h1>{state.artistName || "Unknown artist"}</h1>
                <h2>{state.trackTitle || "Untitled transmission"}</h2>
                {state.message && <p className="live-overlay-message">{state.message}</p>}
                <div className="live-overlay-meta">
                  {state.sourceType && <span>{String(state.sourceType).toUpperCase()}</span>}
                  {state.durationLabel && <span>{state.durationLabel}</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="live-overlay-center-card">
              <p className="live-overlay-mode">{label}</p>
              <h1>{state.title || "BARCODE RADIO"}</h1>
              {state.subtitle && <h2>{state.subtitle}</h2>}
              {state.message && <p className="live-overlay-message">{state.message}</p>}
              {state.mode === "video_placeholder" && state.videoUrl && <p className="live-overlay-url">Link staged · playback disabled</p>}
            </div>
          )}
        </main>

        <div className="live-overlay-footer">
          <span>LIVE SOURCE / 1:1</span>
          <span>{new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </section>
    </div>
  );
}
