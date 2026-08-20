"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveOverlayAdminSnapshot } from "@/lib/live-overlay";
import { RADIO_VISUAL_CUE_DURATION_MS } from "@/lib/radio-visuals-cues";
import type { RadioVisualCueType } from "@/lib/radio-visuals-cues";
import { ADMIN_QUEUE_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { hasActiveQueueSession, startSessionBoundPolling } from "@/lib/session-bound-polling";

function sceneLabel(mode?: string): string {
  return mode ? mode.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Syncing";
}

function responseClockMs(response: Response, snapshot: LiveOverlayAdminSnapshot): number {
  for (const value of [response.headers.get("Date"), snapshot.overlayState.visualCueStartedAt, snapshot.scene.updatedAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

const VISUAL_CUE_CONTROLS: Array<{ type: RadioVisualCueType; label: string; description: string }> = [
  { type: "party", label: "Party Burst", description: "Green/violet club beams, pulses and a dense particle lift." },
  { type: "shadow", label: "Shadow Sweep", description: "A broad moving gobo shadow crosses the room and performer." },
  { type: "signal_breach", label: "Signal Breach", description: "Data fractures, scan interference and electrical signal damage." },
  { type: "blackout", label: "Blackout / Return", description: "The room closes down, holds briefly, then relights from center." },
  { type: "lightning", label: "Lightning Hit", description: "Two controlled electrical strikes with a fading room afterglow." },
];

type StudioOverlayLinks = {
  foreground: string;
  radioVisuals: string;
  wheel: string;
};

export function AdminLiveOverlayControl({ focusWheelTick = 0 }: { focusWheelTick?: number }) {
  const [snapshot, setSnapshot] = useState<LiveOverlayAdminSnapshot | null>(null);
  const [systemTitle, setSystemTitle] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [selectedWheelTrackId, setSelectedWheelTrackId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sourceLinks, setSourceLinks] = useState<StudioOverlayLinks | null>(null);
  const [visualClockMs, setVisualClockMs] = useState(0);
  const wheelSectionRef = useRef<HTMLElement | null>(null);

  async function load() {
    const res = await fetch("/api/admin/overlay/live", { cache: "no-store" });
    if (!res.ok) {
      setStatus("Overlay controls require admin auth.");
      return null;
    }
    const next = await res.json() as LiveOverlayAdminSnapshot;
    setSnapshot(next);
    setVisualClockMs(responseClockMs(res, next));
    return hasActiveQueueSession(next.scene);
  }

  useEffect(() => {
    return startSessionBoundPolling({ intervalMs: ADMIN_QUEUE_POLL_INTERVAL_MS, poll: load });
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
    const next = await res.json() as LiveOverlayAdminSnapshot;
    setSnapshot(next);
    setVisualClockMs(responseClockMs(res, next));
    setStatus(successMessage);
  }

  async function triggerVisualCue(type: RadioVisualCueType) {
    const seconds = Math.round(RADIO_VISUAL_CUE_DURATION_MS[type] / 1_000);
    await post({ action: "triggerVisualCue", visualCue: type }, `${sceneLabel(type)} started for ${seconds} seconds.`);
  }

  async function loadPermanentSourceLinks() {
    setStatus("Loading permanent private source links…");
    const response = await fetch("/api/admin/overlay/source-access", { method: "POST", cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    const links = payload?.links as Partial<StudioOverlayLinks> | undefined;
    if (!response.ok || !links || typeof links.foreground !== "string" || typeof links.radioVisuals !== "string" || typeof links.wheel !== "string") {
      setStatus(response.status === 401 ? "Overlay controls require admin auth." : "Permanent source links could not be loaded.");
      return;
    }
    setSourceLinks({ foreground: links.foreground, radioVisuals: links.radioVisuals, wheel: links.wheel });
    setStatus("Permanent private source links loaded. They remain the same between shows.");
  }

  const scene = snapshot?.scene;
  const wheelOwed = scene?.wheelSpinsOwed ?? 0;
  const wheelActive = scene?.wheelOverlayActive === true;
  const ceremony = scene?.wheelCeremony;
  const candidates = snapshot?.wheelCandidates ?? [];
  const result = ceremony?.resultTrack;
  const resultTracks = result?.tracks ?? [];
  const resultNeedsTrackChoice = ceremony?.status === "result_pending" && resultTracks.length > 1;
  const canConfirmWheel = ceremony?.status === "result_pending" && (!resultNeedsTrackChoice || Boolean(selectedWheelTrackId));
  const canLaunch = wheelOwed > 0 && !wheelActive;
  const wheelReadyForAction = ceremony?.status === "ready";
  const canSpin = wheelOwed > 0 && wheelReadyForAction && candidates.length > 0;
  const canReencrypt = wheelOwed > 0 && wheelReadyForAction && candidates.length > 0 && !ceremony?.resultTrackId;
  const systemActive = snapshot?.overlayState.systemMessageActive === true;
  const visualCueExpiresAtMs = snapshot?.overlayState.visualCueExpiresAt ? Date.parse(snapshot.overlayState.visualCueExpiresAt) : Number.NaN;
  const activeVisualCue = Number.isFinite(visualCueExpiresAtMs) && visualCueExpiresAtMs > visualClockMs
    ? snapshot?.overlayState.visualCueType
    : undefined;
  const wheelAttention = wheelOwed > 0 || wheelActive;
  const wheelNextAction = ceremony?.status === "reencrypting"
    ? "Re-encrypting candidates…"
    : ceremony?.status === "spinning"
      ? "Spinning: result incoming."
      : ceremony?.status === "result_pending" && resultNeedsTrackChoice
        ? "Multiple tracks found: choose winning track, then confirm."
        : ceremony?.status === "result_pending"
          ? "Result pending: confirm winner or mark winner not here."
          : ceremony?.status === "confirmed"
            ? "Confirmed: Wheel Chosen is set."
            : ceremony?.status === "signal_lost"
              ? "Signal lost: winner not present; spin still owed."
              : wheelReadyForAction
                ? "Wheel launched: spin when ready."
                : canLaunch
                  ? "Wheel spin owed: launch the wheel when ready."
                  : "No wheel spin owed.";

  useEffect(() => {
    if (ceremony?.status !== "result_pending" || !result) {
      setSelectedWheelTrackId("");
      return;
    }
    if ((result.tracks?.length ?? 0) === 1) {
      setSelectedWheelTrackId(result.tracks?.[0]?.id ?? "");
      return;
    }
    setSelectedWheelTrackId((current) => result.tracks?.some((track) => track.id === current) ? current : "");
  }, [ceremony?.status, result]);
  useEffect(() => {
    if (!focusWheelTick || !wheelSectionRef.current) return;
    wheelSectionRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusWheelTick]);

  return (
    <section className="space-y-4 border border-accent/40 bg-background/50 p-5">
      <div>
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Live Overlay Receiver</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">Automatic</h2>
          <p className="mt-1 text-sm text-muted">Automatic scene selection is active. Normal show flow does not require manual overlay scene selection.</p>
        </div>
      </div>

      <details className="border border-border bg-background/40 p-4">
        <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-muted">One-Time TikTok Studio Source Setup</summary>
        {!sourceLinks ? <button type="button" onClick={() => { void loadPermanentSourceLinks(); }} className="mt-4 border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Load Permanent Private Links</button> : null}
        <div className="mt-4 grid gap-3 text-sm text-muted lg:grid-cols-3">
          <div className="border border-cyan-300/25 bg-surface p-3">
            <p className="font-bold text-cyan-100">Foreground Strip</p>
            <code className="mt-2 block break-all text-xs text-foreground">{sourceLinks?.foreground ?? "Load the permanent private links once."}</code>
            <p className="mt-2">1080 × 1920 · key #0000FF</p>
          </div>
          <div className="border border-violet-400/25 bg-surface p-3">
            <p className="font-bold text-violet-100">Show Visuals</p>
            <code className="mt-2 block break-all text-xs text-foreground">{sourceLinks?.radioVisuals ?? "Load the permanent private links once."}</code>
            <p className="mt-2">1080 × 1440 · key #FF5A00</p>
          </div>
          <div className="border border-cyan-300/25 bg-surface p-3">
            <p className="font-bold text-cyan-100">Live Overlay + Wheel + Audio</p>
            <code className="mt-2 block break-all text-xs text-foreground">{sourceLinks?.wheel ?? "Load the permanent private links once."}</code>
            <p className="mt-2">1080 × 1080 · key #FF5A00 · sound on</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">These production capability links stay the same and grant overlay display only—not admin access. Leave them saved in Studio: Foreground and Show Visuals follow the current session; the square Live Overlay + Wheel source appears when Start Broadcast is pressed; all three clear after End Broadcast.</p>
      </details>

      <section className="space-y-3 border border-violet-400/35 bg-surface p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300">Manual Visual Moments</p>
            <p className="mt-1 text-sm text-muted">Automatic lighting stays restrained. These short cues use eased entrances and exits for intentional big moments.</p>
          </div>
          <p className="text-xs uppercase tracking-widest text-violet-200">{activeVisualCue ? `Active: ${sceneLabel(activeVisualCue)}` : "Automatic Baseline"}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {VISUAL_CUE_CONTROLS.map((cue) => (
            <button key={cue.type} type="button" onClick={() => triggerVisualCue(cue.type)} className="border border-violet-400/45 bg-background/40 p-3 text-left transition hover:border-accent hover:bg-accent/10">
              <span className="block text-xs font-bold uppercase tracking-widest text-foreground">{cue.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{cue.description}</span>
              <span className="mt-2 block text-[10px] uppercase tracking-widest text-violet-300">{Math.round(RADIO_VISUAL_CUE_DURATION_MS[cue.type] / 1_000)} sec</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => post({ action: "clearVisualCue" }, "Manual visual cue cleared; automatic lighting resumed.")} disabled={!activeVisualCue} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40">Stop Cue / Return to Auto</button>
      </section>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="border border-border bg-surface p-3"><p className="text-xs uppercase tracking-widest text-muted">Current Scene</p><p className="mt-1 font-bold text-foreground">{sceneLabel(scene?.mode)}</p></div>
        <div className="border border-border bg-surface p-3 md:col-span-2"><p className="text-xs uppercase tracking-widest text-muted">Reason</p><p className="mt-1 text-muted">{scene?.reason ?? "Reading live show state."}</p></div>
      </div>

      <section ref={wheelSectionRef} className={wheelAttention ? "scroll-mt-32 space-y-3 border-2 border-cyan-300/70 bg-cyan-300/15 p-4 shadow-[0_0_30px_rgba(103,232,249,0.2)]" : "scroll-mt-32 space-y-3 border border-border bg-surface p-4 opacity-80"}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Wheel</p>
            <h3 className="mt-1 text-lg font-bold text-foreground">{wheelActive ? sceneLabel(ceremony?.status) : wheelOwed > 0 ? "Wheel Spin Waiting" : "No Wheel Spin Waiting"}</h3>
            <p className="mt-1 text-sm text-muted">{wheelOwed} wheel spin{wheelOwed === 1 ? "" : "s"} owed.</p>
            <p className="mt-2 border border-cyan-300/40 bg-background/40 p-2 text-sm text-cyan-100"><span className="font-bold uppercase tracking-widest">Next Action:</span> {wheelNextAction}</p>
            {!wheelActive && wheelOwed > 0 && <p className="mt-1 text-sm text-muted">Launch when you are ready to show the wheel on air. Launch does not choose a winner, consume spins, or change queue state.</p>}
            {wheelReadyForAction && <p className="mt-1 text-sm text-muted">Candidates: {ceremony?.candidateCount ?? 0}. Spin Wheel chooses the winner. Re-encrypt Signal reshuffles/remaps the wheel before the spin without touching the queue.</p>}
            {ceremony?.status === "reencrypting" && <p className="mt-1 text-sm text-cyan-100">Re-encrypting candidates before the spin…</p>}
            {ceremony?.status === "spinning" && <p className="mt-1 text-sm text-cyan-100">Result incoming…</p>}
            {ceremony?.status === "signal_lost" && <p className="mt-1 text-sm text-cyan-100">SIGNAL LOST — winner not present. Wheel still owed; spin again when ready.</p>}
            {ceremony?.status === "result_pending" && result && <p className="mt-1 text-sm text-cyan-100">Winner: <span className="font-bold text-foreground">{result.artistName}</span>{resultTracks.length > 1 ? <span> — choose 1 of {resultTracks.length} tracks below</span> : <span> — {result.trackTitle}</span>}</p>}
            {ceremony?.status === "confirmed" && result && <p className="mt-1 text-sm text-cyan-100">Confirmed: {result.artistName} — {result.trackTitle}. Overlay will return to automatic mode.</p>}
            {wheelActive && candidates.length === 0 && <p className="mt-2 border border-danger/40 bg-danger/10 p-2 text-sm text-danger">No eligible Free/Regular queued tracks are available for Wheel Chosen.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canLaunch && <button type="button" onClick={() => post({ action: "launchWheel" }, "Wheel ceremony launched.")} className="border border-cyan-300 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 hover:bg-cyan-300 hover:text-background">Launch Wheel</button>}
            {wheelReadyForAction && <button type="button" onClick={() => post({ action: "spinWheel" }, "Wheel spin started.")} disabled={!canSpin} className="border border-cyan-300 bg-cyan-300 px-4 py-2 text-xs uppercase tracking-widest text-background disabled:cursor-not-allowed disabled:opacity-40">Spin Wheel</button>}
            {wheelReadyForAction && <button type="button" onClick={() => post({ action: "reencryptWheel" }, "Signal re-encryption started.")} disabled={!canReencrypt} className="border border-cyan-300/70 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">Re-encrypt Signal</button>}
            {ceremony?.status === "result_pending" && <button type="button" onClick={() => post({ action: "confirmWheel", selectedTrackId: selectedWheelTrackId }, "Wheel Chosen confirmed through queue admin.")} disabled={!canConfirmWheel} className="border border-cyan-300 bg-cyan-300 px-4 py-2 text-xs uppercase tracking-widest text-background disabled:cursor-not-allowed disabled:opacity-40">Confirm Wheel Chosen</button>}
            {ceremony?.status === "result_pending" && <button type="button" onClick={() => post({ action: "wheelWinnerNotHere" }, "Winner removed; wheel still owed. Spin again.")} className="border border-danger/70 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Winner Not Here</button>}
            {wheelActive && ceremony?.status !== "spinning" && ceremony?.status !== "reencrypting" && <button type="button" onClick={() => post({ action: "cancelWheel" }, "Wheel ceremony cancelled; returning to auto.")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Cancel / Return to Auto</button>}
          </div>
        </div>
        {wheelReadyForAction && <p className="text-xs uppercase tracking-widest text-muted">Cancel / Return to Auto closes wheel mode without choosing a winner, fulfilling the owed wheel, or changing queue order.</p>}
        {ceremony?.status === "result_pending" && resultNeedsTrackChoice && <label className="block max-w-xl space-y-1 text-xs uppercase tracking-widest text-cyan-100"><span>Choose winning track for {result?.artistName}</span><select value={selectedWheelTrackId} onChange={(event) => setSelectedWheelTrackId(event.target.value)} className="w-full border border-cyan-300/40 bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"><option value="">Select the Wheel Chosen track…</option>{resultTracks.map((track) => <option key={track.id} value={track.id}>{track.trackTitle}</option>)}</select></label>}
        {ceremony?.status === "result_pending" && <p className="text-xs uppercase tracking-widest text-muted">Confirm marks the selected song from the winning person as Wheel Chosen. Winner Not Here removes that winning person from the active wheel pool and keeps the wheel owed. Cancel exits wheel mode without choosing a winner.</p>}
        {wheelActive && candidates.length > 0 && <div className="grid gap-2 text-xs text-muted md:grid-cols-2 lg:grid-cols-3">{candidates.slice(0, 6).map((candidate) => <p key={candidate.id} className="border border-cyan-300/20 bg-background/40 p-2"><span className="text-cyan-100">{candidate.artistName}</span> — {(candidate.trackCount ?? 1) > 1 ? `${candidate.trackCount} tracks` : candidate.trackTitle}</p>)}{candidates.length > 6 && <p className="border border-cyan-300/20 bg-background/40 p-2 text-cyan-100">+ {candidates.length - 6} more grouped signals</p>}</div>}
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
