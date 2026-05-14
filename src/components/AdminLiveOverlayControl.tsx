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
      const errorBody = await res.json().catch(() => ({}));
      setStatus(typeof errorBody.error === "string" ? errorBody.error : "Overlay update failed.");
      return;
    }
    setSnapshot(await res.json());
    setStatus(successMessage);
  }

  const scene = snapshot?.scene;
  const wheelOwed = scene?.wheelSpinsOwed ?? 0;
  const wheelActive = scene?.wheelOverlayActive === true;
  const ceremony = scene?.wheelCeremony;
  const candidates = snapshot?.wheelCandidates ?? [];
  const result = ceremony?.resultTrack;
  const canLaunch = wheelOwed > 0 && !wheelActive;
  const canSpin = wheelOwed > 0 && ceremony?.status === "ready" && candidates.length > 0;
  const systemActive = snapshot?.overlayState.systemMessageActive === true;
  const wheelAttention = wheelOwed > 0 || wheelActive;

  return (
    <section className="space-y-4 border border-accent/40 bg-background/50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Live Overlay Receiver</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">Automatic</h2>
          <p className="mt-1 text-sm text-muted">Automatic scene selection is active. Normal show flow does not require manual overlay scene selection.</p>
        </div>
        <a href="/overlay/live" target="_blank" rel="noreferrer" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Overlay</a>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="border border-border bg-surface p-3"><p className="text-xs uppercase tracking-widest text-muted">Current Scene</p><p className="mt-1 font-bold text-foreground">{sceneLabel(scene?.mode)}</p></div>
        <div className="border border-border bg-surface p-3 md:col-span-2"><p className="text-xs uppercase tracking-widest text-muted">Reason</p><p className="mt-1 text-muted">{scene?.reason ?? "Reading live show state."}</p></div>
      </div>

      <section className={wheelAttention ? "space-y-3 border border-cyan-300/50 bg-cyan-300/10 p-4" : "space-y-3 border border-border bg-surface p-4 opacity-80"}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Wheel</p>
            <h3 className="mt-1 text-lg font-bold text-foreground">{wheelActive ? sceneLabel(ceremony?.status) : wheelOwed > 0 ? "Wheel Spin Waiting" : "No Wheel Spin Waiting"}</h3>
            <p className="mt-1 text-sm text-muted">{wheelOwed} wheel spin{wheelOwed === 1 ? "" : "s"} owed.</p>
            {!wheelActive && wheelOwed > 0 && <p className="mt-1 text-sm text-muted">Launch when you are ready to show the wheel on air. Launch does not choose a winner, consume spins, or change queue state.</p>}
            {ceremony?.status === "ready" && <p className="mt-1 text-sm text-muted">Candidates: {ceremony.candidateCount}. Awaiting host spin.</p>}
            {ceremony?.status === "reencrypting" && <p className="mt-1 text-sm text-cyan-100">Re-encrypting signal before the next reveal…</p>}
            {ceremony?.status === "spinning" && <p className="mt-1 text-sm text-cyan-100">Result incoming…</p>}
            {ceremony?.status === "result_pending" && result && <p className="mt-1 text-sm text-cyan-100">Winner: <span className="font-bold text-foreground">{result.artistName} — {result.trackTitle}</span></p>}
            {ceremony?.status === "confirmed" && result && <p className="mt-1 text-sm text-cyan-100">Confirmed: {result.artistName} — {result.trackTitle}. Overlay will return to automatic mode.</p>}
            {wheelActive && candidates.length === 0 && <p className="mt-2 border border-danger/40 bg-danger/10 p-2 text-sm text-danger">No eligible Free/Regular queued tracks are available for Wheel Chosen.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canLaunch && <button type="button" onClick={() => post({ action: "launchWheel" }, "Wheel ceremony launched.")} className="border border-cyan-300 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 hover:bg-cyan-300 hover:text-background">Launch Wheel</button>}
            {ceremony?.status === "ready" && <button type="button" onClick={() => post({ action: "spinWheel" }, "Wheel spin started.")} disabled={!canSpin} className="border border-cyan-300 bg-cyan-300 px-4 py-2 text-xs uppercase tracking-widest text-background disabled:cursor-not-allowed disabled:opacity-40">Spin Wheel</button>}
            {ceremony?.status === "result_pending" && <button type="button" onClick={() => post({ action: "confirmWheel" }, "Wheel Chosen confirmed through queue admin.")} className="border border-cyan-300 bg-cyan-300 px-4 py-2 text-xs uppercase tracking-widest text-background">Confirm Wheel Chosen</button>}
            {ceremony?.status === "result_pending" && <button type="button" onClick={() => post({ action: "reencryptWheel" }, "Signal re-encryption started.")} disabled={candidates.length === 0} className="border border-cyan-300/70 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">Re-encrypt Signal</button>}
            {wheelActive && <button type="button" onClick={() => post({ action: "cancelWheel" }, "Wheel ceremony cancelled; returning to auto.")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Cancel / Return to Auto</button>}
          </div>
        </div>
        {ceremony?.status === "result_pending" && <p className="text-xs uppercase tracking-widest text-muted">Scramble and spin again before confirmation.</p>}
        {wheelActive && candidates.length > 0 && <div className="grid gap-2 text-xs text-muted md:grid-cols-2 lg:grid-cols-3">{candidates.slice(0, 6).map((candidate) => <p key={candidate.id} className="border border-cyan-300/20 bg-background/40 p-2"><span className="text-cyan-100">{candidate.artistName}</span> — {candidate.trackTitle}</p>)}{candidates.length > 6 && <p className="border border-cyan-300/20 bg-background/40 p-2 text-cyan-100">+ {candidates.length - 6} more eligible signals</p>}</div>}
      </section>

      <details className="border border-border bg-background/40 p-4">
        <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-muted">Emergency Override</summary>
        <div className="mt-4 space-y-4">
          <section className="space-y-3 border border-[#ffaa00]/40 bg-[#ffaa00]/10 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#ffaa00]">Temporary System Message</p>
              <p className="mt-1 text-sm text-muted">Use only for BRB, technical issues, or emergency notes. Clear it to return to automatic scenes.</p>
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
          {scene?.youtube && <div className="border border-border bg-surface p-3 text-xs text-muted"><p className="uppercase tracking-widest">YouTube Sync</p><p className="mt-1">{scene.youtube.videoId} · {scene.youtube.playbackState} · {Math.round(scene.youtube.currentTimeSeconds)}s · muted visual overlay</p></div>}
          <button type="button" onClick={() => post({ action: "clearAllOverrides" }, "All overlay overrides cleared.")} className="border border-danger/60 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Clear All Overrides / Return to Auto</button>
        </div>
      </details>

      {status && <p className="border border-accent/30 bg-accent/10 p-2 text-sm text-accent">{status}</p>}
    </section>
  );
}
