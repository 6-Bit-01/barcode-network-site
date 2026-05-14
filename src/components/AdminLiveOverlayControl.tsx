/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import type { LiveOverlayAdminSnapshot } from "@/lib/live-overlay";

function sceneLabel(mode?: string): string {
  return mode ? mode.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Syncing";
}

export function AdminLiveOverlayControl() {
  const [snapshot, setSnapshot] = useState<LiveOverlayAdminSnapshot | null>(null);
  const [systemTitle, setSystemTitle] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/overlay/live", { cache: "no-store" });
    if (!res.ok) {
      setStatus("Overlay controls require admin auth.");
      return;
    }
    setSnapshot(await res.json());
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 5_000);
    return () => window.clearInterval(interval);
  }, []);

  async function post(body: Record<string, unknown>, successMessage: string) {
    setStatus("Updating overlay…");
    const res = await fetch("/api/admin/overlay/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setStatus("Overlay update failed.");
      return;
    }
    setSnapshot(await res.json());
    setStatus(successMessage);
  }

  const scene = snapshot?.scene;
  const wheelOwed = scene?.wheelSpinsOwed ?? 0;
  const wheelActive = scene?.wheelOverlayActive === true;
  const systemActive = snapshot?.overlayState.systemMessageActive === true;
  const videoActive = snapshot?.overlayState.videoPlaceholderActive === true;

  return (
    <section className="space-y-4 border border-accent/40 bg-background/50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Live Overlay Receiver</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">Automatic Scene Selection Active</h2>
          <p className="mt-1 text-sm text-muted">The /overlay/live source resolves from show state automatically. Operator controls are limited to wheel launch and temporary overrides.</p>
        </div>
        <a href="/overlay/live" target="_blank" rel="noreferrer" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Overlay</a>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="border border-border bg-surface p-3"><p className="text-xs uppercase tracking-widest text-muted">Status</p><p className="mt-1 font-bold text-accent">{scene?.automatic ? "Automatic" : "Override Active"}</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-xs uppercase tracking-widest text-muted">Current Scene</p><p className="mt-1 font-bold text-foreground">{sceneLabel(scene?.mode)}</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-xs uppercase tracking-widest text-muted">Reason</p><p className="mt-1 text-muted">{scene?.reason ?? "Reading live show state."}</p></div>
      </div>

      <section className={wheelOwed > 0 ? "space-y-3 border border-cyan-300/50 bg-cyan-300/10 p-4" : "space-y-3 border border-border bg-surface p-4"}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Wheel Spin Waiting</p>
            <h3 className="mt-1 text-lg font-bold text-foreground">{wheelOwed} wheel spin{wheelOwed === 1 ? "" : "s"} owed.</h3>
            <p className="mt-1 text-sm text-muted">Launch when you are ready to show the wheel on air. This visual trigger does not choose a winner, consume spins, or change queue state.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => post({ action: "launchWheel" }, "Wheel overlay launched.")} disabled={wheelOwed <= 0 || wheelActive} className="border border-cyan-300 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 hover:bg-cyan-300 hover:text-background disabled:cursor-not-allowed disabled:opacity-40">Launch Wheel Overlay</button>
            {wheelActive && <button type="button" onClick={() => post({ action: "clearWheel" }, "Wheel overlay cleared; returning to auto.")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Clear Wheel Overlay / Return to Auto</button>}
          </div>
        </div>
      </section>

      <section className="space-y-3 border border-[#ffaa00]/40 bg-[#ffaa00]/10 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#ffaa00]">Temporary System Message</p>
          <h3 className="mt-1 text-lg font-bold text-foreground">Override automatic scene temporarily</h3>
          <p className="mt-1 text-sm text-muted">Use for BRB, technical issues, or emergency notes. Clear it to return to automatic scene selection.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(12rem,0.4fr)_minmax(0,1fr)]">
          <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Title</span><input value={systemTitle} onChange={(event) => setSystemTitle(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="BARCODE SYSTEM MESSAGE" /></label>
          <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Message</span><input value={systemMessage} onChange={(event) => setSystemMessage(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Stand by." /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => post({ action: "setSystemMessage", title: systemTitle, message: systemMessage }, "Temporary system message set.")} className="border border-[#ffaa00] px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background">Set Message</button>
          <button type="button" onClick={() => post({ action: "clearSystemMessage" }, "Temporary system message cleared.")} disabled={!systemActive} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40">Clear Message</button>
        </div>
      </section>

      <details className="border border-border bg-background/40 p-4">
        <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-muted">Emergency Manual Override</summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">Advanced exception controls only. Video remains placeholder-only: no uploads, no embeds, no autoplay, and no file playback.</p>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Video placeholder URL</span><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} className="w-full border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" placeholder="Public URL label only; playback disabled" /></label>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => post({ action: "launchVideoPlaceholder", videoUrl }, "Video placeholder launched.")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Launch Placeholder</button><button type="button" onClick={() => post({ action: "clearVideoPlaceholder" }, "Video placeholder cleared.")} disabled={!videoActive} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40">Clear Placeholder</button></div>
          </div>
          <button type="button" onClick={() => post({ action: "clearAllOverrides" }, "All overlay overrides cleared.")} className="border border-danger/60 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Clear All Overrides / Return to Auto</button>
        </div>
      </details>

      {status && <p className="border border-accent/30 bg-accent/10 p-2 text-sm text-accent">{status}</p>}
    </section>
  );
}
