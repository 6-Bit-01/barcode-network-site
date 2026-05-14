/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import type { LiveOverlayState, OverlayMode } from "@/lib/live-overlay";

const QUICK_MODES: { mode: OverlayMode; label: string }[] = [
  { mode: "standby", label: "Set Standby" },
  { mode: "now_playing", label: "Show Now Playing" },
  { mode: "artist_card", label: "Show Artist Card" },
  { mode: "wheel_ready", label: "Show Wheel Ready" },
  { mode: "sponsor", label: "Show Sponsor" },
  { mode: "system_message", label: "Show System" },
  { mode: "video_placeholder", label: "Video Placeholder" },
];

export function AdminLiveOverlayControl() {
  const [state, setState] = useState<LiveOverlayState | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [message, setMessage] = useState("");
  const [artistName, setArtistName] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [artworkUrl, setArtworkUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/overlay/live", { cache: "no-store" });
    if (!res.ok) {
      setStatus("Overlay controls require admin auth.");
      return;
    }
    setState(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function setMode(mode: OverlayMode) {
    setStatus("Updating overlay…");
    const res = await fetch("/api/admin/overlay/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, title, subtitle, message, artistName, trackTitle, artworkUrl, videoUrl }),
    });
    if (!res.ok) {
      setStatus("Overlay update failed.");
      return;
    }
    setState(await res.json());
    setStatus("Overlay updated.");
  }

  return (
    <section className="space-y-4 border border-accent/40 bg-background/50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Live Overlay Receiver</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">Square Broadcast Overlay</h2>
          <p className="mt-1 text-sm text-muted">Controls /overlay/live only. These controls do not move queue tracks, select wheel winners, or play video files.</p>
        </div>
        <a href="/overlay/live" target="_blank" rel="noreferrer" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Overlay</a>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Optional scene title" /></label>
        <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Subtitle</span><input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Optional subtitle" /></label>
        <label className="space-y-1 text-xs uppercase tracking-widest text-muted md:col-span-2"><span>Message</span><input value={message} onChange={(event) => setMessage(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Optional public message" /></label>
        <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Artist</span><input value={artistName} onChange={(event) => setArtistName(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Artist card only" /></label>
        <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Track</span><input value={trackTitle} onChange={(event) => setTrackTitle(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Artist card only" /></label>
        <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Artwork URL</span><input value={artworkUrl} onChange={(event) => setArtworkUrl(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Public http(s) image" /></label>
        <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Video URL</span><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Placeholder only" /></label>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_MODES.map((item) => <button key={item.mode} type="button" onClick={() => setMode(item.mode)} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">{item.label}</button>)}
        <button type="button" onClick={() => setMode("standby")} className="border border-danger/50 px-3 py-2 text-xs uppercase tracking-widest text-danger">Clear Overlay</button>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="border border-border bg-surface p-3"><p className="text-xs uppercase tracking-widest text-muted">Current Mode</p><p className="mt-1 font-bold text-foreground">{state?.mode?.replace(/_/g, " ") ?? "syncing"}</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-xs uppercase tracking-widest text-muted">Current Title</p><p className="mt-1 font-bold text-foreground">{state?.title ?? state?.artistName ?? "—"}</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-xs uppercase tracking-widest text-muted">Status</p><p className="mt-1 text-muted">{status ?? "Ready"}</p></div>
      </div>
    </section>
  );
}
