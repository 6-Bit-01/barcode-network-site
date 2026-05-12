/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatRuntime, getTrackRuntimeSeconds } from "@/lib/queue-types";
import type { QueueEntry, QueueLane, QueueState } from "@/lib/queue-types";

type Tab = "active" | "completed" | "removed";
type AdminQueueAction = "pullNext" | "startShow" | "addWheelSpinOwed" | "load" | "finish" | "remove" | "priority" | "regular" | "wheel" | "moveBack" | "spotlight" | "removeSpotlight" | "restoreRegular" | "restorePriority" | "pausePriority" | "resumePriority";
type SimulationSpeed = "slow" | "normal" | "fast";
type SimulationAction = "addSimulationFreeTrack" | "addSimulationPaidPriority" | "addSimulationCheckoutPending" | "addSimulationPaymentFailed" | "addSimulationHeldPriority" | "clearSimulationTracks";

const LANE_LABELS: Record<QueueLane, string> = { priority: "Priority Signal", wheel: "Wheel Winner", regular: "Regular Queue" };
const FIXED_PRIORITY_LABEL = "Priority Signal Upgrade";
const FIXED_PRIORITY_INSTRUCTIONS = "Moves this track into the Priority Signal lane after payment confirmation.";
const SIMULATION_SPEEDS: Record<SimulationSpeed, { label: string; minDelayMs: number; maxDelayMs: number; priorityChance: number }> = {
  slow: { label: "Slow", minDelayMs: 40_000, maxDelayMs: 90_000, priorityChance: 0.15 },
  normal: { label: "Normal", minDelayMs: 20_000, maxDelayMs: 60_000, priorityChance: 0.25 },
  fast: { label: "Fast", minDelayMs: 5_000, maxDelayMs: 15_000, priorityChance: 0.4 },
};

function sourceLabel(entry: QueueEntry): string { return (entry.sourceType ?? "other").toUpperCase(); }
function formatPrice(cents = 0, currency = "usd"): string { return `${new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(Math.max(0, cents) / 100)} ${currency.toUpperCase()}`; }
function adminAudioUrl(entry: QueueEntry): string {
  const params = new URLSearchParams({ id: entry.id });
  const sessionId = initialSessionIdFromUrl();
  if (sessionId) params.set("sessionId", sessionId);
  return `/api/admin/queue/file?${params.toString()}`;
}
function openUrl(entry: QueueEntry): string { return entry.sourceType === "upload" ? adminAudioUrl(entry) : entry.link; }
function submittedArtist(entry: QueueEntry): string { return entry.submittedArtistName ?? entry.artist; }
function submittedTitle(entry: QueueEntry): string { return entry.submittedSongTitle ?? entry.title; }
function entryLane(entry: QueueEntry): QueueLane { return entry.lane ?? "regular"; }
function durationSourceLabel(entry: QueueEntry): string { return (entry.durationSource ?? "internal_estimate").replace(/_/g, " "); }
function canPausePriority(entry: QueueEntry): boolean { return entry.lane === "priority" && !entry.priorityPausedAt && (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual"); }
function canResumePriority(entry: QueueEntry): boolean { return entry.lane === "priority" && Boolean(entry.priorityPausedAt) && (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual"); }
function isPaidPriorityTrack(entry: QueueEntry): boolean { return entry.lane === "priority" && (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual"); }
function isWheelEligibleTrack(entry: QueueEntry): boolean { return (!entry.lane || entry.lane === "regular") && entry.status === "queued" && (entry.priorityUpgradeStatus ?? "none") === "none" && !entry.priorityPausedAt; }
function queueTrackVisual(entry: QueueEntry): { label: string; badgeClass: string; cardClass: string; sectionClass: string } {
  const status = entry.priorityUpgradeStatus ?? "none";
  if (status === "failed" || status === "refunded") return { label: "Payment Failed", badgeClass: "border-danger bg-danger text-background", cardClass: "border-danger/60 bg-danger/10 shadow-[inset_4px_0_0_rgba(255,0,0,0.8)]", sectionClass: "border-danger/50 bg-danger/5" };
  if (status === "checkout_pending" || status === "requested" || status === "paid_needs_attention") return { label: "Payment Processing", badgeClass: "border-[#ff8a00] bg-[#ff8a00]/90 text-background", cardClass: "border-[#ff8a00]/60 bg-[#ff8a00]/10 shadow-[inset_4px_0_0_rgba(255,138,0,0.8)]", sectionClass: "border-[#ff8a00]/50 bg-[#ff8a00]/5" };
  if (entry.priorityPausedAt) return { label: "Held Priority", badgeClass: "border-[#8a5a00] bg-[#ffaa00] text-background", cardClass: "border-[#ffaa00]/80 bg-[#ffaa00]/15 shadow-[inset_4px_0_0_rgba(255,170,0,1)]", sectionClass: "border-[#ffaa00]/70 bg-[#ffaa00]/10" };
  if (status === "paid") return { label: "Paid Priority", badgeClass: "border-[#ffaa00] bg-[#ffaa00]/20 text-[#ffaa00]", cardClass: "border-[#ffaa00]/70 bg-[#ffaa00]/10 shadow-[inset_4px_0_0_rgba(255,170,0,0.85)]", sectionClass: "border-[#ffaa00]/60 bg-[#ffaa00]/5" };
  if (status === "manual" || entry.lane === "priority") return { label: "Manual Priority", badgeClass: "border-[#ffaa00] bg-[#ffaa00]/15 text-[#ffaa00]", cardClass: "border-[#ffaa00]/60 bg-[#ffaa00]/10 shadow-[inset_4px_0_0_rgba(255,170,0,0.7)]", sectionClass: "border-[#ffaa00]/60 bg-[#ffaa00]/5" };
  if (entry.lane === "wheel") return { label: "Wheel Chosen", badgeClass: "border-cyan-300 bg-cyan-300/15 text-cyan-200", cardClass: "border-cyan-300/60 bg-cyan-300/10 shadow-[inset_4px_0_0_rgba(103,232,249,0.8)]", sectionClass: "border-cyan-300/50 bg-cyan-300/5" };
  return { label: "Free Submission", badgeClass: "border-foreground/40 bg-foreground/10 text-foreground", cardClass: "border-border bg-background/40 shadow-[inset_4px_0_0_rgba(255,255,255,0.25)]", sectionClass: "border-border bg-surface" };
}
function LaneStatusBadge({ entry }: { entry: QueueEntry }) {
  const visual = queueTrackVisual(entry);
  return <p className={`mt-2 inline-flex px-2 py-1 text-[10px] uppercase tracking-widest ${visual.badgeClass}`}>{visual.label}</p>;
}
function durationLabel(entry: QueueEntry): string {
  const duration = formatRuntime(getTrackRuntimeSeconds(entry));
  return entry.durationIsEstimate ? `${duration} estimated / pending · ${durationSourceLabel(entry)}` : `${duration} detected · ${durationSourceLabel(entry)}`;
}
function detectedLabel(entry: QueueEntry): string | null {
  if (!entry.detectedArtistName && !entry.detectedSongTitle && !entry.providerTitle) return null;
  return `${entry.detectedArtistName || "Unknown artist"} — ${entry.detectedSongTitle || entry.providerTitle || "Unknown title"}`;
}
function embedUrl(entry: QueueEntry): string | null {
  const url = openUrl(entry);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (entry.sourceType === "youtube") {
      const id = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (entry.sourceType === "spotify") return `https://open.spotify.com/embed${parsed.pathname}`;
    if (entry.sourceType === "soundcloud") return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`;
  } catch { return null; }
  return null;
}
function initialSessionIdFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("sessionId") ?? undefined;
}

export function AdminRadioQueueControl() {
  const [state, setState] = useState<QueueState | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [player, setPlayer] = useState<QueueEntry | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [wheelSearch, setWheelSearch] = useState("");
  const [wheelSelection, setWheelSelection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [sessionOptionsOpen, setSessionOptionsOpen] = useState(false);
  const [priorityEnabled, setPriorityEnabled] = useState(false);
  const [priorityPriceCents, setPriorityPriceCents] = useState(0);
  const [priorityCurrency, setPriorityCurrency] = useState("usd");
  const [sessionCooldownSeconds, setSessionCooldownSeconds] = useState(300);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [priorityMessage, setPriorityMessage] = useState<string | null>(null);
  const [prioritySaveError, setPrioritySaveError] = useState<string | null>(null);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState<SimulationSpeed>("normal");
  const [simulationMessage, setSimulationMessage] = useState<string | null>(null);
  const simulationTimerRef = useRef<number | null>(null);
  const simulationRunningRef = useRef(false);
  const simulationSpeedRef = useRef<SimulationSpeed>("normal");

  async function load(sessionId?: string) {
    const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const res = await fetch(`/api/admin/queue${suffix}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "Admin authentication required. Log in at /admin first." : "Queue control unavailable.");
      return;
    }
    setError(null);
    setState(await res.json());
  }

  useEffect(() => {
    setMounted(true);
    const sessionId = initialSessionIdFromUrl();
    load(sessionId);
    const interval = setInterval(() => load(initialSessionIdFromUrl()), 5_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!state?.session || sessionOptionsOpen) return;
    setPriorityEnabled(state.session.priorityUpgradePaymentsEnabled === true);
    setPriorityPriceCents(state.session.priorityUpgradePriceCents ?? 0);
    setPriorityCurrency(state.session.priorityUpgradeCurrency ?? "usd");
    setSessionCooldownSeconds(state.session.submissionCooldownSeconds ?? 300);
  }, [sessionOptionsOpen, state?.session]);

  useEffect(() => () => {
    simulationRunningRef.current = false;
    if (simulationTimerRef.current) window.clearTimeout(simulationTimerRef.current);
  }, []);

  async function post(body: Record<string, unknown>): Promise<QueueState | null> {
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const next = await res.json();
    setState(next);
    return next;
  }
  async function action(id: string, next: AdminQueueAction) { await post(next === "pullNext" || next === "startShow" || next === "addWheelSpinOwed" ? { action: next } : { id, action: next }); }
  async function simulationAction(next: SimulationAction, label: string) {
    const updated = await post({ action: next });
    setSimulationMessage(updated ? label : "Simulation action failed. Confirm admin auth and active session.");
    return updated;
  }
  function simulationDelay(speed: SimulationSpeed): number {
    const config = SIMULATION_SPEEDS[speed];
    return config.minDelayMs + Math.floor(Math.random() * (config.maxDelayMs - config.minDelayMs));
  }
  function queueSimulationTick() {
    if (!simulationRunningRef.current) return;
    const speed = simulationSpeedRef.current;
    simulationTimerRef.current = window.setTimeout(async () => {
      if (!simulationRunningRef.current) return;
      await simulationAction("addSimulationFreeTrack", "Simulation added a Free SIM track.");
      if (Math.random() < SIMULATION_SPEEDS[speed].priorityChance) await simulationAction("addSimulationPaidPriority", "Simulation added a paid Priority SIM track.");
      queueSimulationTick();
    }, simulationDelay(speed));
  }
  function startSimulation() {
    if (simulationRunningRef.current) return;
    simulationRunningRef.current = true;
    setSimulationRunning(true);
    setSimulationMessage("Simulation running. Free SIM tracks will arrive over time; Wheel winners remain manual.");
    queueSimulationTick();
  }
  function stopSimulation() {
    simulationRunningRef.current = false;
    setSimulationRunning(false);
    if (simulationTimerRef.current) window.clearTimeout(simulationTimerRef.current);
    simulationTimerRef.current = null;
    setSimulationMessage("Simulation stopped.");
  }
  function updateSimulationSpeed(next: SimulationSpeed) {
    simulationSpeedRef.current = next;
    setSimulationSpeed(next);
  }
  async function playerAction(id: string, next: AdminQueueAction) {
    await action(id, next);
    if (next === "finish" || next === "remove" || next === "moveBack" || next === "pausePriority") setPlayer(null);
  }

  async function endCurrentSession() {
    setEndingSession(true);
    await post({ action: "archiveSession" });
    setEndConfirmOpen(false);
    setEndingSession(false);
    await load();
  }
  async function toggleOpen(isOpen: boolean) { await post({ action: "setOpen", isOpen }); }
  async function copy(entry: QueueEntry) { await navigator.clipboard.writeText(openUrl(entry)); }
  async function loadPlayer(entry: QueueEntry) {
    if (state?.nowPlaying && state.nowPlaying.id !== entry.id) return;
    setPlayer(entry);
    setMinimized(false);
    await action(entry.id, "load");
  }
  async function markWheelWinner() {
    if (!wheelSelection) return;
    await action(wheelSelection, "wheel");
    setWheelSelection("");
    setWheelSearch("");
  }
  function openSessionOptions() {
    if (state?.session) {
      setPriorityEnabled(state.session.priorityUpgradePaymentsEnabled === true);
      setPriorityPriceCents(state.session.priorityUpgradePriceCents ?? 0);
      setPriorityCurrency(state.session.priorityUpgradeCurrency ?? "usd");
      setSessionCooldownSeconds(state.session.submissionCooldownSeconds ?? 300);
    }
    setPriorityMessage(null);
    setPrioritySaveError(null);
    setSessionOptionsOpen((value) => !value);
  }
  async function savePrioritySettings() {
    if (priorityEnabled && priorityPriceCents <= 0) {
      setPrioritySaveError("Checkout requires a price above 0.");
      setPriorityMessage(null);
      return;
    }
    const paidUpgradesEnabled = priorityEnabled && priorityPriceCents > 0;
    setPrioritySaving(true);
    setPrioritySaveError(null);
    setPriorityMessage(null);
    const cooldownNext = await post({ action: "updateSubmissionCooldownSettings", submissionCooldownSeconds: sessionCooldownSeconds });
    const next = cooldownNext ? await post({ action: "updatePriorityUpgradeSettings", enabled: paidUpgradesEnabled, label: FIXED_PRIORITY_LABEL, instructions: FIXED_PRIORITY_INSTRUCTIONS, priceCents: priorityPriceCents, currency: priorityCurrency, paymentsEnabled: paidUpgradesEnabled }) : null;
    setPrioritySaving(false);
    if (!next) {
      setPrioritySaveError("Session options could not be saved.");
      return;
    }
    setPriorityMessage("Session options saved.");
    window.setTimeout(() => setPriorityMessage(null), 3500);
  }

  const lanes = useMemo(() => {
    const active = state?.queue ?? [];
    return {
      priority: active.filter(isPaidPriorityTrack),
      wheel: active.filter((entry) => entry.lane === "wheel"),
      regular: active.filter((entry) => !entry.lane || entry.lane === "regular" || (entry.lane === "priority" && !isPaidPriorityTrack(entry))),
      spotlight: state?.spotlight ?? [],
    };
  }, [state]);

  const wheelMatches = useMemo(() => {
    const query = wheelSearch.trim().toLowerCase();
    const regular = lanes.regular.filter(isWheelEligibleTrack);
    if (!query) return regular.slice(0, 8);
    return regular.filter((entry) => `${submittedArtist(entry)} ${submittedTitle(entry)} ${entry.link} ${entry.fileName ?? ""}`.toLowerCase().includes(query)).slice(0, 8);
  }, [lanes.regular, wheelSearch]);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;
  const runtime = state?.publicStatus?.estimatedRuntimeSeconds ?? 0;
  const readOnly = state?.readOnly ?? false;
  const hasSession = Boolean(state?.session);
  const hasCurrentSession = Boolean(state?.session && state.isCurrentSession && state.session.status !== "archived" && !readOnly);
  const canControlSession = hasCurrentSession;
  const isArchivedReview = Boolean(state?.session?.status === "archived" || readOnly);
  const nextInLine = state?.nextInLine ?? null;
  const loadedPlayer = state?.nowPlaying ?? player;
  const playerPadding = loadedPlayer ? (minimized ? "pb-32" : "pb-[28rem]") : "pb-16";
  const isExplicitReview = Boolean(initialSessionIdFromUrl());
  const showQueueReview = hasCurrentSession || isExplicitReview;
  const phaseLabel = state?.session?.broadcastPhase === "ended" ? "Ended / Disconnecting" : state?.session?.broadcastPhase === "broadcast_active" ? "Broadcast Active" : state?.session?.broadcastPhase === "submission_window" ? "Submission Window" : "Warmup";
  const displacedNonPriorityNext = (state?.queue ?? []).find((entry) => entry.displacedFromNextInLineAt && entry.lane !== "priority") ?? null;
  const activePriorityCount = [state?.nextInLine, ...(state?.queue ?? [])].filter((entry): entry is QueueEntry => {
    if (!entry) return false;
    return entry.lane === "priority" && !entry.priorityPausedAt && (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual") && (entry.status === "queued" || entry.status === "next");
  }).length;
  const heldPriorityCount = (state?.queue ?? []).filter((entry) => isPaidPriorityTrack(entry) && Boolean(entry.priorityPausedAt)).length;

  return (
    <div className={`${playerPadding} space-y-6`}>
      <section className="border border-accent/40 bg-surface p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-accent">Current Broadcast Session</p>
            {hasCurrentSession ? (
              <>
                <h2 className="text-2xl font-bold text-foreground mt-2">{state?.session?.title}</h2>
                <p className="text-xs text-muted">{state?.session?.showDate} · {state?.session?.status}</p>
                {state?.session?.description && <p className="text-xs text-muted mt-2 max-w-2xl">{state.session.description}</p>}
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-foreground mt-2">No session in progress.</h2>
                <p className="text-sm text-muted mt-1">Start or select a session from Show Management.</p>
              </>
            )}
          </div>
        </div>
        {hasCurrentSession ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <a href="/admin/show-management" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Show Management</a>
                {canControlSession && <button type="button" onClick={openSessionOptions} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">{sessionOptionsOpen ? "Hide Session Options" : "Edit Session Options"}</button>}
              </div>
              {canControlSession && <button onClick={() => setEndConfirmOpen(true)} className="border border-danger/60 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">End Broadcast</button>}
            </div>
            {canControlSession && sessionOptionsOpen && <section className="space-y-3 border border-border bg-background/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs uppercase tracking-[0.3em] text-accent">Session Options</p><h3 className="mt-1 text-lg font-bold text-foreground">Session Options</h3><p className="mt-1 text-xs text-muted">Only the verified Stripe webhook marks a track paid or moves it into Priority Signal.</p></div><div className="border border-border bg-surface p-3 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Submission Delay</p><p className="mt-1 font-bold text-foreground">{sessionCooldownSeconds === 0 ? "Disabled" : `${sessionCooldownSeconds}s`}</p></div><div className="border border-border bg-surface p-3 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Display price</p><p className="mt-1 font-bold text-foreground">{formatPrice(priorityPriceCents, priorityCurrency)}</p></div></div><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.35fr)]"><label className="space-y-2 block md:col-span-2"><span className="text-xs uppercase tracking-widest text-muted">Submission Delay</span><input type="number" min={0} max={3600} value={sessionCooldownSeconds} onChange={(event) => setSessionCooldownSeconds(Math.max(0, Math.min(3600, Number(event.target.value))))} className="w-full bg-background border border-border px-3 py-2 text-sm" /><span className="block text-xs text-muted">Delay between accepted submissions from the same source. Set to 0 to disable during testing.</span></label><label className="flex items-center justify-between gap-3 border border-border bg-surface p-3 text-sm"><span><span className="block font-bold text-foreground">Paid upgrades {priorityEnabled ? "enabled" : "disabled"}</span><span className="text-xs text-muted">Controls Stripe checkout availability for this session.</span></span><input type="checkbox" checked={priorityEnabled} onChange={(event) => setPriorityEnabled(event.target.checked)} /></label><label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Price</span><input type="number" min={0} value={priorityPriceCents} onChange={(event) => setPriorityPriceCents(Math.max(0, Number(event.target.value)))} className="w-full bg-background border border-border px-3 py-2 text-sm" /><span className="block text-xs text-muted">Enter cents. Example: 1000 = $10.00.</span></label></div>{prioritySaveError && <p className="border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{prioritySaveError}</p>}{priorityMessage && <p className="border border-accent/50 bg-accent/10 p-2 text-sm font-bold text-accent">{priorityMessage}</p>}<div className="flex flex-wrap gap-2"><button type="button" onClick={savePrioritySettings} disabled={prioritySaving} className="border border-accent bg-accent/10 px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{prioritySaving ? "Saving…" : "Save Settings"}</button><button type="button" onClick={() => setSessionOptionsOpen(false)} disabled={prioritySaving} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50">Close</button></div></section>}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="border border-border bg-background/40 p-4"><p className="text-xs text-muted">Queue</p><p className={state?.publicStatus?.isOpen ? "text-accent" : "text-danger"}>{state?.publicStatus?.isOpen ? "Open" : "Closed"}</p></div>
              <div className="border border-border bg-background/40 p-4"><p className="text-xs text-muted">Active count</p><p>{state?.publicStatus?.activeCount ?? "—"}</p></div>
              <div className="border border-border bg-background/40 p-4"><p className="text-xs text-muted">Runtime</p><p>{formatRuntime(runtime)}</p></div>
              <div className="border border-border bg-background/40 p-4"><p className="text-xs text-muted">Pressure</p><p>{state?.publicStatus?.pressure ?? "syncing"}</p></div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {canControlSession && <button onClick={() => action("", "pullNext")} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Pull Next Track</button>}{canControlSession && state?.session?.showStarted !== true && <button onClick={() => action("", "startShow")} className="border border-foreground/50 px-4 py-2 text-xs uppercase tracking-widest text-foreground hover:bg-foreground hover:text-background">Start Broadcast</button>}{canControlSession && <button onClick={() => action("", "addWheelSpinOwed")} className="border border-cyan-300/60 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 hover:bg-cyan-300 hover:text-background">Add Owed Wheel Spin</button>}
              {canControlSession && <button onClick={() => toggleOpen(!state?.publicStatus?.isOpen)} className={`${state?.publicStatus?.isOpen ? "border-danger/50 text-danger hover:bg-danger" : "border-accent text-accent hover:bg-accent"} border px-4 py-2 text-xs uppercase tracking-widest hover:text-background`}>{state?.publicStatus?.isOpen ? "Close Submissions" : "Open Submissions"}</button>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href="/admin/show-management" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Show Management</a>
          </div>
        )}
        {isArchivedReview && hasSession && <div className="border border-danger/40 bg-danger/10 p-3 text-xs uppercase tracking-widest text-danger">ARCHIVED / READ ONLY — viewing {state?.session?.title ?? "finished session"}. Queue review actions are locked for this finished session.</div>}
      </section>

      {canControlSession && <section className="grid gap-3 border border-border bg-surface p-4 text-xs md:grid-cols-6"><div><p className="uppercase tracking-widest text-muted">Show Phase</p><p className="mt-1 font-bold text-foreground">{phaseLabel}</p></div><div><p className="uppercase tracking-widest text-muted">Next owed</p><p className="mt-1 font-bold text-foreground">{state?.nextNonPriorityLane === "regular" ? "Free" : "Wheel"}</p></div><div><p className="uppercase tracking-widest text-muted">Interrupted Next</p><p className="mt-1 font-bold text-foreground">{displacedNonPriorityNext ? submittedTitle(displacedNonPriorityNext) : "None"}</p></div><div><p className="uppercase tracking-widest text-muted">Wheel Owed</p><p className="mt-1 font-bold text-cyan-200">{state?.session?.wheelSpinsOwed ?? 0}</p></div><div><p className="uppercase tracking-widest text-muted">Active Priority</p><p className="mt-1 font-bold text-[#ffaa00]">{activePriorityCount}</p></div><div><p className="uppercase tracking-widest text-muted">Held Priority</p><p className="mt-1 font-bold text-[#ffaa00]">{heldPriorityCount}</p></div></section>}

      {canControlSession && <section className="space-y-4 border border-[#ffaa00]/50 bg-[#ffaa00]/10 p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs uppercase tracking-[0.35em] text-[#ffaa00]">Admin Queue Simulation — Test Only</p><h2 className="mt-2 text-xl font-bold text-foreground">Queue Simulation Mode</h2><p className="mt-1 text-sm text-muted">Creates fake SIM tracks. Use Clear Simulation Tracks before going live. Wheel winners are never automated; select them manually.</p></div><div className="border border-[#ffaa00]/40 bg-background/60 p-3 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Status</p><p className={simulationRunning ? "font-bold text-[#ffaa00]" : "font-bold text-muted"}>{simulationRunning ? "Running" : "Stopped"}</p></div></div><div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Simulation speed</span><select value={simulationSpeed} onChange={(event) => updateSimulationSpeed(event.target.value as SimulationSpeed)} className="block border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground">{(Object.keys(SIMULATION_SPEEDS) as SimulationSpeed[]).map((speed) => <option key={speed} value={speed}>{SIMULATION_SPEEDS[speed].label}</option>)}</select></label><button type="button" onClick={startSimulation} disabled={simulationRunning} className="border border-[#ffaa00] px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] disabled:cursor-not-allowed disabled:opacity-40">Start Simulation</button><button type="button" onClick={stopSimulation} disabled={!simulationRunning} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:cursor-not-allowed disabled:opacity-40">Stop Simulation</button><button type="button" onClick={() => simulationAction("addSimulationFreeTrack", "Added one Free SIM submission.")} className="border border-accent/50 px-4 py-2 text-xs uppercase tracking-widest text-accent">Add Free Test Submission Now</button><button type="button" onClick={() => simulationAction("addSimulationPaidPriority", "Sent one paid Priority SIM skip.")} className="border border-[#ffaa00]/60 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00]">Send Paid Priority Skip Now</button><button type="button" onClick={() => simulationAction("addSimulationCheckoutPending", "Sent one checkout-pending SIM track.")} className="border border-[#ffaa00]/40 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00]">Send Checkout Pending Test Now</button><button type="button" onClick={() => simulationAction("addSimulationPaymentFailed", "Sent one failed-payment SIM track.")} className="border border-danger/50 px-4 py-2 text-xs uppercase tracking-widest text-danger">Send Failed Payment Test Now</button><button type="button" onClick={() => simulationAction("addSimulationHeldPriority", "Sent one held paid Priority SIM track.")} className="border border-[#ffaa00]/60 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00]">Send Held Priority Test Now</button><button type="button" onClick={() => simulationAction("clearSimulationTracks", "Cleared SIM/test tracks only.")} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger">Clear Simulation Tracks</button></div>{simulationMessage && <p className="border border-[#ffaa00]/30 bg-background/40 p-2 text-sm text-[#ffaa00]">{simulationMessage}</p>}</section>}


      {mounted && endConfirmOpen && createPortal(<div className="fixed inset-0 z-[100000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="end-session-confirm-title" className="w-full max-w-md border border-danger/50 bg-background p-5 shadow-[0_0_70px_rgba(255,0,0,0.24)]"><p className="text-xs uppercase tracking-[0.35em] text-danger">End Broadcast</p><h2 id="end-session-confirm-title" className="mt-3 text-2xl font-bold text-foreground">End this broadcast?</h2><p className="mt-2 text-sm text-muted">This will stop routing, close submissions, and move the broadcast session to the archive.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><a href="/admin/queue" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Return to Queue Dashboard</a><button type="button" onClick={() => setEndConfirmOpen(false)} disabled={endingSession} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">No, Cancel</button><button type="button" onClick={endCurrentSession} disabled={endingSession} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background disabled:opacity-50">{endingSession ? "Ending…" : "Yes, End Broadcast"}</button></div></div></div>, document.body)}


      {!showQueueReview ? (
        <section className="border border-border bg-surface p-6">
          <h2 className="text-2xl font-bold text-foreground">No active session.</h2>
          <p className="text-sm text-muted mt-2">Start a new session from Show Management.</p>
          <a href="/admin/show-management" className="inline-flex mt-4 border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Go to Show Management</a>
        </section>
      ) : <>
        <div className="flex gap-2 border-b border-border">
          {(["active", "completed", "removed"] as Tab[]).map((key) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-xs uppercase tracking-widest ${tab === key ? "text-accent border-b border-accent" : "text-muted"}`}>{key === "active" ? "Active Queue" : key === "completed" ? "Completed Tracks" : "Removed"}</button>)}
        </div>

        {tab === "active" && <>
          <NextInLineBox entry={nextInLine} playerOccupied={Boolean(loadedPlayer)} readOnly={readOnly} onAction={action} onPlayer={loadPlayer} onCopy={copy} />
          <WheelWinnerSelector tracks={wheelMatches} search={wheelSearch} selection={wheelSelection} readOnly={readOnly} onSearch={setWheelSearch} onSelection={setWheelSelection} onMark={markWheelWinner} />
          <div className="grid gap-5 xl:grid-cols-2"><Lane title="Priority Signal" tracks={lanes.priority} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /><Lane title="Wheel Winners" tracks={lanes.wheel} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /><Lane title="Regular Queue" tracks={lanes.regular} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /><Lane title="Spotlight List" tracks={lanes.spotlight} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="spotlight" readOnly={readOnly} /></div>
        </>}
        {tab === "completed" && <Lane title="Completed Tracks" tracks={state?.history ?? []} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="completed" readOnly={readOnly} />}
        {tab === "removed" && <Lane title="Removed" tracks={state?.removed ?? []} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="removed" readOnly={readOnly} />}
      </>}

      {mounted && loadedPlayer && createPortal(<PlayerDock player={loadedPlayer} minimized={minimized} setMinimized={setMinimized} readOnly={readOnly} onAction={playerAction} onCopy={() => copy(loadedPlayer)} />, document.body)}
    </div>
  );
}


function NextInLineBox({ entry, playerOccupied, readOnly, onAction, onPlayer, onCopy }: { entry: QueueEntry | null; playerOccupied: boolean; readOnly: boolean; onAction: (id: string, action: AdminQueueAction) => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void }) {
  const visual = entry ? queueTrackVisual(entry) : null;
  return <section className={`p-5 space-y-4 ${visual?.sectionClass ?? "border border-accent/60 bg-accent/5"}`}><div><p className="text-xs uppercase tracking-[0.4em] text-accent">Next in Line</p>{!entry ? <p className="mt-3 text-lg text-muted">No active transmissions waiting.</p> : <><div className="mt-3"><LaneStatusBadge entry={entry} /></div><h2 className="mt-3 text-2xl font-bold text-foreground">{submittedArtist(entry)} — {submittedTitle(entry)}</h2><p className="text-sm text-muted mt-1">Lane: {LANE_LABELS[entryLane(entry)]} · Source: {sourceLabel(entry)} · Duration: {durationLabel(entry)}</p>{detectedLabel(entry) && <p className="text-xs text-muted mt-1">Detected / Provider: {detectedLabel(entry)}</p>}</>}</div>{entry && <TrackActions entry={entry} mode="next" playerOccupied={playerOccupied} readOnly={readOnly} onAction={onAction} onPlayer={onPlayer} onCopy={onCopy} />}</section>;
}

function WheelWinnerSelector({ tracks, search, selection, readOnly, onSearch, onSelection, onMark }: { tracks: QueueEntry[]; search: string; selection: string; readOnly: boolean; onSearch: (value: string) => void; onSelection: (value: string) => void; onMark: () => void }) {
  return <section className="border border-border bg-surface p-4 space-y-3"><div><p className="text-xs uppercase tracking-[0.3em] text-muted">Wheel Spin Winner Selector</p><p className="text-sm text-muted mt-2">Search active Regular Queue tracks only. Marking a winner moves the selected track into Wheel Winners without duplicating it.</p></div><div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]"><input value={search} onChange={(event) => onSearch(event.target.value)} disabled={readOnly} placeholder="Search artist, title, or link" className="w-full border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" /><select value={selection} onChange={(event) => onSelection(event.target.value)} disabled={readOnly || tracks.length === 0} className="w-full border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"><option value="">{tracks.length === 0 ? "No active regular tracks found" : "Select a Regular Queue track"}</option>{tracks.map((entry) => <option key={entry.id} value={entry.id}>{submittedArtist(entry)} — {submittedTitle(entry)}</option>)}</select><button onClick={onMark} disabled={readOnly || !selection} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent disabled:cursor-not-allowed disabled:opacity-40">Mark Wheel Winner</button></div></section>;
}

function PlayerDock({ player, minimized, setMinimized, readOnly, onAction, onCopy }: { player: QueueEntry; minimized: boolean; setMinimized: (value: boolean) => void; readOnly: boolean; onAction: (id: string, action: AdminQueueAction) => void; onCopy: () => void }) {
  const embedded = embedUrl(player);
  return (
    <div className={`fixed inset-x-0 bottom-0 z-[9999] w-screen border-t bg-background/95 p-3 shadow-[0_-20px_60px_rgba(0,0,0,0.45)] backdrop-blur ${queueTrackVisual(player).sectionClass}`}>
      <div className="w-full px-2 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-accent">{minimized ? "Queue Player Dock" : "Command Deck Player"}</p>
            <h3 className="text-lg font-bold">{submittedArtist(player)} — {submittedTitle(player)}</h3><LaneStatusBadge entry={player} />
            {detectedLabel(player) && <p className="text-xs text-muted mt-1">Detected / Provider: {detectedLabel(player)}</p>}
            <p className="text-xs text-muted mt-1">{sourceLabel(player)} · {durationLabel(player)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMinimized(!minimized)} className="border border-border px-3 py-2 text-xs text-muted">{minimized ? "Expand Player" : "Minimize Player"}</button>
            <a href={openUrl(player)} target="_blank" rel="noreferrer" className="border border-accent px-3 py-2 text-xs text-accent">Open Link</a>
            <button type="button" onClick={onCopy} className="border border-border px-3 py-2 text-xs text-muted">Copy Link</button>
          </div>
        </div>
        <div className={`${minimized ? "h-0 overflow-hidden opacity-0" : "mt-4 opacity-100"} grid w-full items-end gap-4 xl:grid-cols-[minmax(0,1fr)_auto]`} aria-hidden={minimized}>
          <div className="min-h-20 w-full min-w-0">
            {player.sourceType === "upload" && player.fileUrl && <audio src={adminAudioUrl(player)} controls className="w-full" />}
            {player.sourceType !== "upload" && embedded && <iframe title="Queue preview" src={embedded} className="h-56 w-full border border-border" allow="clipboard-write; encrypted-media; picture-in-picture" />}
            {player.sourceType !== "upload" && !embedded && <div className="border border-border p-6 text-sm text-muted">No embeddable preview available for this source. Use Open Link or Copy Link.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={openUrl(player)} target="_blank" rel="noreferrer" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent">Open Link</a>
            <button type="button" onClick={onCopy} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Copy Link</button>
            {!readOnly && <><button type="button" onClick={() => onAction(player.id, "finish")} className="border border-accent bg-accent px-4 py-2 text-xs uppercase tracking-widest text-background">Finish Track</button><button type="button" onClick={() => onAction(player.id, "remove")} className="border border-danger/40 px-4 py-2 text-xs uppercase tracking-widest text-danger">Remove Track</button><button type="button" onClick={() => onAction(player.id, "moveBack")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Undo Load</button>{canPausePriority(player) && <button type="button" onClick={() => onAction(player.id, "pausePriority")} className="border border-[#ffaa00]/50 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00]">Pause Priority</button>}<button type="button" onClick={() => onAction(player.id, "spotlight")} className="border border-foreground/40 px-4 py-2 text-xs uppercase tracking-widest text-foreground">Spotlight</button></>}
          </div>
        </div>
      </div>
    </div>
  );
}


function AdminTrackMetadata({ entry }: { entry: QueueEntry }) {
  const detected = detectedLabel(entry);
  return (
    <div className="grid gap-3 text-xs md:grid-cols-[1.2fr_1fr]">
      <div className="border border-border/60 p-3">
        <span className="block text-muted uppercase tracking-widest">Submitted</span>
        <p className="mt-1 font-bold text-foreground">{submittedArtist(entry)} — {submittedTitle(entry)}</p>
        {entry.tiktokHandle && <p className="mt-1 text-muted">TikTok: {entry.tiktokHandle.startsWith("@") ? entry.tiktokHandle : `@${entry.tiktokHandle}`}</p>}
        {entry.contactEmail && <p className="mt-1 text-muted">Contact: {entry.contactEmail}</p>}
        {entry.submitterArtistName && <p className="mt-1 text-muted">Submitted by: {entry.submitterArtistName}</p>}
        <LaneStatusBadge entry={entry} />
      </div>
      <div className="border border-border/60 p-3">
        <span className="block text-muted uppercase tracking-widest">Detected source</span>
        <p className="mt-1 text-foreground">{detected ?? "Pending provider metadata"}</p>
        <p className="mt-1 text-muted">{sourceLabel(entry)} · {durationLabel(entry)}</p>
        {entry.fileName && <p className="mt-1 text-muted">File: {entry.fileName}</p>}
      </div>
    </div>
  );
}

function Lane({ title, tracks, onAction, onPlayer, onCopy, mode, readOnly }: { title: string; tracks: QueueEntry[]; onAction: (id: string, action: AdminQueueAction) => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void; mode: "next" | "active" | "spotlight" | "completed" | "removed"; readOnly: boolean }) {
  const sectionClass = title.includes("Priority") ? "border-[#ffaa00]/50 bg-[#ffaa00]/5" : title.includes("Wheel") ? "border-cyan-300/50 bg-cyan-300/5" : title.includes("Regular") ? "border-border bg-surface" : "border-border bg-surface";
  const titleClass = title.includes("Priority") ? "text-[#ffaa00]" : title.includes("Wheel") ? "text-cyan-200" : "text-foreground";
  return (
    <section className={`border p-4 ${sectionClass}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className={`text-sm uppercase tracking-[0.25em] ${titleClass}`}>{title}</h2>
        <span className="text-xs text-muted">{tracks.length}</span>
      </div>
      <div className="space-y-3">
        {tracks.length === 0 ? (
          <p className="border border-border/60 p-4 text-sm text-muted">No tracks in this lane.</p>
        ) : (
          tracks.map((entry) => (
            <article key={`${title}-${entry.id}`} className={`space-y-3 p-4 ${queueTrackVisual(entry).cardClass}`}>
              <div className="space-y-3">
                <div>
                  <p className="font-bold">{submittedArtist(entry)} — {submittedTitle(entry)}</p>
                  <p className="text-xs text-muted">{sourceLabel(entry)} · {durationLabel(entry)}</p>
                </div>
                <AdminTrackMetadata entry={entry} />
                {entry.suspiciousFlags && entry.suspiciousFlags.length > 0 && <div className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 p-2 text-xs text-[#ffaa00]">Admin flags: {entry.suspiciousFlags.join(" / ")}</div>}
                {entry.note && <details className="border border-accent/30 bg-accent/5 p-2 text-xs"><summary className="cursor-pointer text-accent uppercase tracking-widest">Submission note</summary><p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-foreground">{entry.note}</p></details>}
              </div>
              <TrackActions entry={entry} onAction={onAction} onPlayer={onPlayer} onCopy={onCopy} mode={mode} readOnly={readOnly} />
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function TrackActions({ entry, onAction, onPlayer, onCopy, mode, readOnly, playerOccupied = false }: { entry: QueueEntry; onAction: (id: string, action: AdminQueueAction) => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void; mode: "next" | "active" | "spotlight" | "completed" | "removed"; readOnly: boolean; playerOccupied?: boolean }) {
  const lane = entryLane(entry);
  return (
    <div className="flex flex-wrap gap-2">
      {mode === "next" && <button type="button" onClick={() => onPlayer(entry)} disabled={playerOccupied} className="border border-accent px-3 py-1.5 text-xs text-accent disabled:cursor-not-allowed disabled:border-border disabled:text-muted">{playerOccupied ? "Player Occupied" : "Load in Player"}</button>}
      <a href={openUrl(entry)} target="_blank" rel="noreferrer" className="border border-border px-3 py-1.5 text-xs text-muted">{entry.sourceType === "upload" ? "Open Admin Audio" : "Open Link"}</a>
      <button type="button" onClick={() => onCopy(entry)} className="border border-border px-3 py-1.5 text-xs text-muted">Copy {entry.sourceType === "upload" ? "Admin Audio Link" : "Link"}</button>
      {!readOnly && mode === "next" && <>{lane !== "priority" && <button type="button" onClick={() => onAction(entry.id, "moveBack")} className="border border-border px-3 py-1.5 text-xs text-muted">Return to Queue</button>}{canPausePriority(entry) && <button type="button" onClick={() => onAction(entry.id, "pausePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Pause Priority</button>}{canResumePriority(entry) && <button type="button" onClick={() => onAction(entry.id, "resumePriority")} className="border border-[#ffaa00] bg-[#ffaa00] px-3 py-1.5 text-xs text-background">Unpause Priority</button>}<button type="button" onClick={() => onAction(entry.id, "remove")} className="border border-danger/40 px-3 py-1.5 text-xs text-danger">Remove</button><button type="button" onClick={() => onAction(entry.id, "spotlight")} className="border border-foreground/40 px-3 py-1.5 text-xs text-foreground">Spotlight</button></>}
      {!readOnly && mode === "active" && <><button type="button" onClick={() => onAction(entry.id, "remove")} className="border border-danger/40 px-3 py-1.5 text-xs text-danger">Remove</button>{lane === "regular" ? <><button type="button" onClick={() => onAction(entry.id, "priority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move to Priority Signal</button>{isWheelEligibleTrack(entry) && <button type="button" onClick={() => onAction(entry.id, "wheel")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Mark Wheel Chosen</button>}</> : <><button type="button" onClick={() => onAction(entry.id, "regular")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Move to Regular Queue</button>{lane === "wheel" && <button type="button" onClick={() => onAction(entry.id, "priority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move to Priority Signal</button>}{canPausePriority(entry) && <button type="button" onClick={() => onAction(entry.id, "pausePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Pause Priority</button>}{canResumePriority(entry) && <button type="button" onClick={() => onAction(entry.id, "resumePriority")} className="border border-[#ffaa00] bg-[#ffaa00] px-3 py-1.5 text-xs text-background">Unpause Priority</button>}</>}<button type="button" onClick={() => onAction(entry.id, "spotlight")} className="border border-foreground/40 px-3 py-1.5 text-xs text-foreground">Spotlight</button></>}
      {!readOnly && mode === "spotlight" && <button type="button" onClick={() => onAction(entry.id, "removeSpotlight")} className="border border-danger/40 px-3 py-1.5 text-xs text-danger">Remove from Spotlight</button>}
      {!readOnly && mode === "completed" && <><button type="button" onClick={() => onAction(entry.id, "restoreRegular")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Move back to Regular Queue</button><button type="button" onClick={() => onAction(entry.id, "restorePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move back to Priority Signal</button></>}
      {!readOnly && mode === "removed" && <><button type="button" onClick={() => onAction(entry.id, "restoreRegular")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Restore to Regular Queue</button><button type="button" onClick={() => onAction(entry.id, "restorePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Restore to Priority Signal</button></>}
    </div>
  );
}
