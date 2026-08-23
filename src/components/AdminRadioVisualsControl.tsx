"use client";

import { useEffect, useState } from "react";
import type { LiveOverlayAdminSnapshot } from "@/lib/live-overlay";
import { RADIO_VISUAL_CUE_DURATION_MS } from "@/lib/radio-visuals-cues";
import type { RadioVisualCueType } from "@/lib/radio-visuals-cues";
import { RADIO_VISUAL_PREVIEW_CONTROLS, RADIO_VISUAL_PREVIEW_DURATION_MS } from "@/lib/radio-visuals-preview";
import type { RadioVisualMusicScene } from "@/lib/radio-visuals-engine";
import { ADMIN_QUEUE_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { hasActiveQueueSession, startSessionBoundPolling } from "@/lib/session-bound-polling";

function sceneLabel(mode?: string): string {
  return mode ? mode.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Syncing";
}

function responseClockMs(response: Response, snapshot: LiveOverlayAdminSnapshot): number {
  for (const value of [response.headers.get("Date"), snapshot.overlayState.visualCueStartedAt, snapshot.overlayState.visualPreviewRequestedAt, snapshot.scene.updatedAt]) {
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

export function AdminRadioVisualsControl() {
  const [snapshot, setSnapshot] = useState<LiveOverlayAdminSnapshot | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [visualClockMs, setVisualClockMs] = useState(0);
  const [pendingFamily, setPendingFamily] = useState<RadioVisualMusicScene | null>(null);

  async function load() {
    const response = await fetch("/api/admin/overlay/live", { cache: "no-store" });
    if (!response.ok) {
      setStatus("Visual overlay controls require admin auth.");
      return null;
    }
    const next = await response.json() as LiveOverlayAdminSnapshot;
    setSnapshot(next);
    setVisualClockMs(responseClockMs(response, next));
    return hasActiveQueueSession(next.scene);
  }

  useEffect(() => {
    return startSessionBoundPolling({ intervalMs: ADMIN_QUEUE_POLL_INTERVAL_MS, poll: load });
  }, []);

  async function post(body: Record<string, unknown>, successMessage: string) {
    setStatus("Updating visual overlays…");
    let response: Response;
    try {
      response = await fetch("/api/admin/overlay/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setStatus("Visual overlay update failed.");
      return false;
    }
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      setStatus(typeof errorBody.error === "string" ? errorBody.error : "Visual overlay update failed.");
      return false;
    }
    const next = await response.json() as LiveOverlayAdminSnapshot;
    setSnapshot(next);
    setVisualClockMs(responseClockMs(response, next));
    setStatus(successMessage);
    return true;
  }

  async function triggerVisualCue(type: RadioVisualCueType) {
    const seconds = Math.round(RADIO_VISUAL_CUE_DURATION_MS[type] / 1_000);
    await post({ action: "triggerVisualCue", visualCue: type }, `${sceneLabel(type)} started for ${seconds} seconds.`);
  }

  async function previewRadioVisual(scene: RadioVisualMusicScene, label: string) {
    setPendingFamily(scene);
    try {
      await post(
        { action: "previewRadioVisual", visualFamily: scene },
        `${label} test queued: ${RADIO_VISUAL_PREVIEW_DURATION_MS / 1_000} seconds, silent fake-song signal.`,
      );
    } finally {
      setPendingFamily(null);
    }
  }

  const cueExpiresAtMs = snapshot?.overlayState.visualCueExpiresAt ? Date.parse(snapshot.overlayState.visualCueExpiresAt) : Number.NaN;
  const activeVisualCue = Number.isFinite(cueExpiresAtMs) && cueExpiresAtMs > visualClockMs
    ? snapshot?.overlayState.visualCueType
    : undefined;
  const previewDeliveryExpiresAtMs = snapshot?.overlayState.visualPreviewDeliveryExpiresAt
    ? Date.parse(snapshot.overlayState.visualPreviewDeliveryExpiresAt)
    : Number.NaN;
  const queuedPreviewFamily = Number.isFinite(previewDeliveryExpiresAtMs) && previewDeliveryExpiresAtMs > visualClockMs
    ? snapshot?.overlayState.visualPreviewFamily
    : undefined;

  return (
    <section className="space-y-4 border border-violet-400/40 bg-background/50 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-violet-300">Visual Overlays</p>
        <h2 className="mt-2 text-xl font-bold text-foreground">Tests + Manual Moments</h2>
        <p className="mt-1 text-sm text-muted">Test any production song visual in the Show Visuals source. Tests synthesize a fake timeline locally for exactly two seconds and never play, load, pause, or alter audio.</p>
      </div>

      <section className="space-y-3 border border-accent/35 bg-surface p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">20 Silent Song Tests</p>
            <p className="mt-1 text-sm text-muted">Each button temporarily runs that exact production family with a synthetic fake-song rhythm. A newer test replaces an older test; queue, player, Wheel, and live audio state are untouched.</p>
          </div>
          <p className="text-xs uppercase tracking-widest text-accent">{queuedPreviewFamily ? `Queued: ${sceneLabel(queuedPreviewFamily)}` : "Ready"}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {RADIO_VISUAL_PREVIEW_CONTROLS.map((control, index) => (
            <button
              key={control.scene}
              type="button"
              onClick={() => { void previewRadioVisual(control.scene, control.label); }}
              disabled={pendingFamily !== null}
              className="border border-accent/45 bg-background/40 p-3 text-left transition hover:border-accent hover:bg-accent/10 disabled:cursor-wait disabled:opacity-50"
              aria-label={`Test ${control.label} for two silent seconds`}
            >
              <span className="block text-[10px] uppercase tracking-widest text-accent">Test {String(index + 1).padStart(2, "0")} · 2 sec · silent</span>
              <span className="mt-1 block text-xs font-bold uppercase tracking-widest text-foreground">{control.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{control.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 border border-violet-400/35 bg-surface p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300">Manual Visual Moments</p>
            <p className="mt-1 text-sm text-muted">Automatic lighting stays restrained. These five eased cues remain available for intentional big moments.</p>
          </div>
          <p className="text-xs uppercase tracking-widest text-violet-200">{activeVisualCue ? `Active: ${sceneLabel(activeVisualCue)}` : "Automatic Baseline"}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {VISUAL_CUE_CONTROLS.map((cue) => (
            <button key={cue.type} type="button" onClick={() => { void triggerVisualCue(cue.type); }} className="border border-violet-400/45 bg-background/40 p-3 text-left transition hover:border-accent hover:bg-accent/10">
              <span className="block text-xs font-bold uppercase tracking-widest text-foreground">{cue.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{cue.description}</span>
              <span className="mt-2 block text-[10px] uppercase tracking-widest text-violet-300">{Math.round(RADIO_VISUAL_CUE_DURATION_MS[cue.type] / 1_000)} sec</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { void post({ action: "clearVisualCue" }, "Manual visual cue cleared; automatic lighting resumed."); }} disabled={!activeVisualCue} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40">Stop Cue / Return to Auto</button>
      </section>

      {status && <p className="border border-accent/30 bg-accent/10 p-2 text-sm text-accent">{status}</p>}
    </section>
  );
}
