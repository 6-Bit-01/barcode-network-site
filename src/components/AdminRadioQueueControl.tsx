/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AdminLiveOverlayControl } from "@/components/AdminLiveOverlayControl";
import { buildQueueTimingDisplay, formatHoursMinutes, queueTimingInputFromAdminState } from "@/lib/queue-timing-display";
import { parseYouTubeVideoId } from "@/lib/track-duration";
import { formatRuntime, getTrackRuntimeSeconds, parseTikTokVideoUrl } from "@/lib/queue-types";
import { YOUTUBE_SYNC_STALE_AFTER_MS } from "@/lib/live-overlay-resolver";
import type { QueueEntry, QueueLane, QueueState } from "@/lib/queue-types";

type Tab = "active" | "completed" | "removed" | "spotlight";
type AdminQueueAction = "pullNext" | "pullWheelChosen" | "pullFreeTransmission" | "startShow" | "addWheelSpinOwed" | "load" | "finish" | "remove" | "priority" | "regular" | "wheel" | "moveBack" | "spotlight" | "removeSpotlight" | "restoreRegular" | "restorePriority" | "resolvePaidPriority" | "pausePriority" | "resumePriority";
type SimulationSpeed = "slow" | "normal" | "fast";
type SimulationAction = "addSimulationFreeTrack" | "addSimulationPaidPriority" | "addSimulationCheckoutPending" | "addSimulationPaymentFailed" | "addSimulationHeldPriority" | "clearSimulationTracks";

const LANE_LABELS: Record<QueueLane, string> = { priority: "Priority Signal", wheel: "Wheel Winner", regular: "Regular Queue" };
const FIXED_PRIORITY_LABEL = "Priority Signal Upgrade";
const FIXED_PRIORITY_INSTRUCTIONS = "Moves this track into the Priority Signal lane after payment confirmation.";
const YOUTUBE_PLAYER_READY_TIMEOUT_MS = 9_000;
const TIKTOK_PLAYER_READY_TIMEOUT_MS = 10_000;

function youtubeErrorLabel(code?: number | null): string {
  if (code === 2) return "Invalid video ID";
  if (code === 5) return "HTML5 playback unavailable";
  if (code === 100) return "Video not found/private";
  if (code === 101 || code === 150) return "Embedding disabled by owner";
  return code ? `YouTube error ${code}` : "YouTube unavailable";
}

const SIMULATION_SPEEDS: Record<SimulationSpeed, { label: string; minDelayMs: number; maxDelayMs: number; priorityChance: number }> = {
  slow: { label: "Slow", minDelayMs: 40_000, maxDelayMs: 90_000, priorityChance: 0.15 },
  normal: { label: "Normal", minDelayMs: 20_000, maxDelayMs: 60_000, priorityChance: 0.25 },
  fast: { label: "Fast", minDelayMs: 5_000, maxDelayMs: 15_000, priorityChance: 0.4 },
};

function sourceLabel(entry: QueueEntry): string {
  if (entry.sourceType === "tiktok") return "TikTok";
  return (entry.sourceType ?? "other").toUpperCase();
}
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
function wasPrioritySignal(entry: QueueEntry): boolean { return entry.lane === "priority" || entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual"; }
function isWheelEligibleTrack(entry: QueueEntry): boolean { return (!entry.lane || entry.lane === "regular") && entry.status === "queued" && (entry.priorityUpgradeStatus ?? "none") === "none" && !entry.priorityPausedAt; }
function queueTrackVisual(entry: QueueEntry): { label: string; badgeClass: string; cardClass: string; sectionClass: string } {
  const status = entry.priorityUpgradeStatus ?? "none";
  if (status === "failed" || status === "refunded") return { label: "Payment Failed", badgeClass: "border-danger bg-danger text-background", cardClass: "border-danger/60 bg-danger/10 shadow-[inset_4px_0_0_rgba(255,0,0,0.8)]", sectionClass: "border-danger/50 bg-danger/5" };
  if (status === "paid_needs_attention") return { label: "Paid Needs Attention", badgeClass: "border-danger bg-danger text-background", cardClass: "border-danger/60 bg-danger/10 shadow-[inset_4px_0_0_rgba(255,0,0,0.8)]", sectionClass: "border-danger/50 bg-danger/5" };
  if (status === "checkout_pending") return { label: "Checkout Pending", badgeClass: "border-[#ff8a00] bg-[#ff8a00]/90 text-background", cardClass: "border-[#ff8a00]/60 bg-[#ff8a00]/10 shadow-[inset_4px_0_0_rgba(255,138,0,0.8)]", sectionClass: "border-[#ff8a00]/50 bg-[#ff8a00]/5" };
  if (status === "requested") return { label: "Payment Requested", badgeClass: "border-[#c27803] bg-[#c27803]/85 text-background", cardClass: "border-[#c27803]/60 bg-[#c27803]/10 shadow-[inset_4px_0_0_rgba(194,120,3,0.8)]", sectionClass: "border-[#c27803]/50 bg-[#c27803]/5" };
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
type OverlayYouTubeTrackInput = { id: string; link: string; sourceType: QueueEntry["sourceType"]; videoId: string | null };
function buildOverlayYouTubeSync(track: OverlayYouTubeTrackInput, playbackState: "playing" | "paused" | "stopped", currentTimeSeconds = 0) {
  if (track.sourceType !== "youtube" || !track.videoId) return null;
  return { provider: "youtube" as const, videoId: track.videoId, trackId: track.id, playbackState, currentTimeSeconds: Math.max(0, currentTimeSeconds), updatedAt: new Date().toISOString(), muted: true };
}
async function publishOverlayYouTubeSync(track: OverlayYouTubeTrackInput, playbackState: "playing" | "paused" | "stopped", currentTimeSeconds = 0) {
  const sync = buildOverlayYouTubeSync(track, playbackState, currentTimeSeconds);
  if (!sync) return null;
  await fetch("/api/admin/overlay/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updatePlayerSync", sync }) });
  return sync;
}
async function clearOverlayPlayerSync() {
  await fetch("/api/admin/overlay/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clearPlayerSync" }) });
}

function embedUrl(entry: QueueEntry): string | null {
  const url = openUrl(entry);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (entry.sourceType === "youtube") {
      const id = parseYouTubeVideoId(url);
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
  const [loadingPlayerId, setLoadingPlayerId] = useState<string | null>(null);
  const [clearingPlayerId, setClearingPlayerId] = useState<string | null>(null);
  const [playerActionPending, setPlayerActionPending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [topBarMinimized, setTopBarMinimized] = useState(false);
  const [railMinimized, setRailMinimized] = useState(false);
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
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<"session" | "visuals" | "overlay" | null>(null);
  const [overlayWheelFocusTick, setOverlayWheelFocusTick] = useState(0);
  const simulationTimerRef = useRef<number | null>(null);
  const simulationRunningRef = useRef(false);
  const simulationSpeedRef = useRef<SimulationSpeed>("normal");
  const mutationEpochRef = useRef(0);
  const mutationInFlightRef = useRef(0);
  const latestAppliedMutationEpochRef = useRef(0);

  function applyMutationState(next: QueueState, epoch: number): void {
    if (epoch < latestAppliedMutationEpochRef.current) return;
    latestAppliedMutationEpochRef.current = epoch;
    setState(next);
  }

  function applyPollingStateIfFresh(next: QueueState, requestEpoch: number): void {
    if (mutationInFlightRef.current > 0) return;
    if (requestEpoch !== mutationEpochRef.current) return;
    if (requestEpoch < latestAppliedMutationEpochRef.current) return;
    setState(next);
  }

  async function load(sessionId?: string) {
    const requestEpoch = mutationEpochRef.current;
    const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const res = await fetch(`/api/admin/queue${suffix}`, { cache: "no-store" });
    if (!res.ok) {
      if (mutationInFlightRef.current > 0) return;
      if (requestEpoch !== mutationEpochRef.current) return;
      setError(res.status === 401 ? "Admin authentication required. Log in at /admin first." : "Queue control unavailable.");
      return;
    }
    setError(null);
    applyPollingStateIfFresh(await res.json(), requestEpoch);
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
    mutationEpochRef.current += 1;
    const epoch = mutationEpochRef.current;
    mutationInFlightRef.current += 1;
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    try {
      if (!res.ok) return null;
      const next = await res.json();
      applyMutationState(next, epoch);
      return next;
    } finally {
      mutationInFlightRef.current = Math.max(0, mutationInFlightRef.current - 1);
    }
  }
  async function action(id: string, next: AdminQueueAction): Promise<QueueState | null> { return post(next === "pullNext" || next === "pullWheelChosen" || next === "pullFreeTransmission" || next === "startShow" || next === "addWheelSpinOwed" ? { action: next } : { id, action: next }); }
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
    setSimulationMessage("Simulation running. Free SIM tracks will arrive over time.");
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
    if (playerActionPending) return;
    const isClearingAction = next === "finish" || next === "remove" || next === "moveBack" || next === "pausePriority";
    if (isClearingAction) {
      setLoadingPlayerId(null);
      setClearingPlayerId(id);
    }
    setPlayerActionPending(true);
    const updated = await action(id, next);
    if (isClearingAction) {
      const clearingTarget = state?.nowPlaying?.id === id ? state.nowPlaying : null;
      if (clearingTarget?.sourceType === "youtube") await clearOverlayPlayerSync();
      if (!updated) setLoadingPlayerId(null);
    }
    setPlayerActionPending(false);
  }
  useEffect(() => {
    if (!loadingPlayerId) return;
    if (state?.nowPlaying?.id === loadingPlayerId) setLoadingPlayerId(null);
    if (!state?.nowPlaying && loadingPlayerId) setLoadingPlayerId(null);
  }, [loadingPlayerId, state?.nowPlaying]);
  useEffect(() => {
    if (!clearingPlayerId) return;
    if (!state?.nowPlaying || state.nowPlaying.id !== clearingPlayerId) setClearingPlayerId(null);
  }, [clearingPlayerId, state?.nowPlaying]);

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
    if (playerActionPending) return;
    setPlayerActionPending(true);
    setLoadingPlayerId(entry.id);
    setClearingPlayerId(null);
    setMinimized(false);
    const updated = await action(entry.id, "load");
    if (updated?.nowPlaying?.id === entry.id) {
      if (entry.sourceType !== "youtube") await clearOverlayPlayerSync();
      setPlayerActionPending(false);
      return;
    }
    if (!updated) setLoadingPlayerId(null);
    setPlayerActionPending(false);
  }
  async function updateSponsorBreakState(sponsorAction: "start" | "complete" | "skip" | "reset") {
    await post({ action: "updateSponsorBreakState", sponsorAction });
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

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;
  const readOnly = state?.readOnly ?? false;
  const hasSession = Boolean(state?.session);
  const hasCurrentSession = Boolean(state?.session && state.isCurrentSession && state.session.status !== "archived" && !readOnly);
  const simulationCreationAllowed = Boolean(hasCurrentSession && state?.session?.status === "open" && state?.session?.queueOpen);
  const canControlSession = hasCurrentSession;
  const isArchivedReview = Boolean(state?.session?.status === "archived" || readOnly);
  const nextInLine = state?.nextInLine ?? null;
  const confirmedPlayer = state?.nowPlaying ?? null;
  const hasClearingTransition = Boolean(clearingPlayerId);
  const pendingPlayerLoad = Boolean(loadingPlayerId && (!confirmedPlayer || confirmedPlayer.id !== loadingPlayerId));
  const loadedPlayer = hasClearingTransition ? null : pendingPlayerLoad ? (confirmedPlayer?.id === loadingPlayerId ? confirmedPlayer : null) : confirmedPlayer;
  const playerPadding = loadedPlayer ? (minimized ? "pb-32" : "pb-[20rem]") : "pb-16";
  const isExplicitReview = Boolean(initialSessionIdFromUrl());
  const showQueueReview = hasCurrentSession || isExplicitReview;
  const phaseLabel = state?.session?.broadcastPhase === "ended" ? "Ended / Disconnecting" : state?.session?.broadcastPhase === "broadcast_active" ? "Broadcast Active" : state?.session?.broadcastPhase === "submission_window" ? "Submission Window" : "Warmup";
  const heldPriorityCount = (state?.queue ?? []).filter((entry) => isPaidPriorityTrack(entry) && Boolean(entry.priorityPausedAt)).length;
  const nextInLineHasActivePriority = Boolean(nextInLine && nextInLine.lane === "priority" && !nextInLine.priorityPausedAt && (nextInLine.priorityUpgradeStatus === "paid" || nextInLine.priorityUpgradeStatus === "manual"));
  const queuedActivePriorityExists = (state?.queue ?? []).some((entry) => entry.lane === "priority" && !entry.priorityPausedAt && (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual") && entry.status === "queued");
  const resolverOverrideBlocked = nextInLineHasActivePriority || queuedActivePriorityExists;
  const canPullWheelChosen = !resolverOverrideBlocked && (state?.queue ?? []).some((entry) => entry.lane === "wheel" && entry.status === "queued");
  const canPullFreeTransmission = !resolverOverrideBlocked && (state?.queue ?? []).some((entry) => (!entry.lane || entry.lane === "regular") && entry.status === "queued");
  const timingSummary = buildQueueTimingDisplay(queueTimingInputFromAdminState(state));
  const topPressure = timingSummary.pressureSummary;
  const requestedCount = (state?.queue ?? []).filter((entry) => (entry.priorityUpgradeStatus ?? "none") === "requested").length;
  const checkoutPendingCount = (state?.queue ?? []).filter((entry) => (entry.priorityUpgradeStatus ?? "none") === "checkout_pending").length;
  const paidNeedsAttentionCount = (state?.queue ?? []).filter((entry) => (entry.priorityUpgradeStatus ?? "none") === "paid_needs_attention").length;
  const wheelSpinsUnlocked = state?.session?.wheelSpinsOwed ?? 0;
  const wheelOverlayReady = wheelSpinsUnlocked > 0;
  const wheelOverlayStatusLabel = "Wheel spin ready";
  const activeTrackIds = new Set<string>();
  if (state?.nowPlaying?.id) activeTrackIds.add(state.nowPlaying.id);
  if (nextInLine?.id) activeTrackIds.add(nextInLine.id);
  for (const entry of state?.queue ?? []) {
    if (entry.status === "queued") activeTrackIds.add(entry.id);
  }
  const activeTrackCount = activeTrackIds.size;
  const projectedRuntimeLabel = timingSummary.showRuntimeSummary.publicProjectedLabel ?? timingSummary.showRuntimeSummary.projectedLabel ?? "—";
  const capacityCount = state?.publicStatus?.capacity ?? state?.session?.queueCapacity ?? null;
  const activeCapacityLabel = capacityCount ? `${activeTrackCount} / ${capacityCount}` : `${activeTrackCount}`;
  const openWheelPanel = () => {
    setActiveUtilityPanel("overlay");
    setOverlayWheelFocusTick((value) => value + 1);
  };

  const railBottomOffsetClass = loadedPlayer ? (minimized ? "bottom-24" : "bottom-[12.5rem]") : "bottom-5";
  const topOverlayPaddingClass = topBarMinimized ? "pt-[4.5rem] md:pt-[4.75rem]" : "pt-[7.25rem] md:pt-[7.5rem]";

  return (
    <div className={`${playerPadding} ${topOverlayPaddingClass} space-y-2 xl:pr-[26rem]`}>
      <section className="border border-border bg-surface p-1.5">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveUtilityPanel((value) => value === "session" ? null : "session")} className="min-h-9 border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted">{activeUtilityPanel === "session" ? "Hide Session Setup" : "Session Setup"}</button>
          <button type="button" onClick={() => setActiveUtilityPanel((value) => value === "visuals" ? null : "visuals")} className="min-h-9 border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted">{activeUtilityPanel === "visuals" ? "Hide Diagnostics" : "Diagnostics"}</button>
          <button
            type="button"
            onClick={() => setActiveUtilityPanel((value) => value === "overlay" ? null : "overlay")}
            className={`min-h-9 border px-3 py-1.5 text-xs uppercase tracking-widest ${wheelOverlayReady ? "border-cyan-300 bg-cyan-300/25 text-cyan-100 shadow-[0_0_20px_rgba(103,232,249,0.22)]" : "border-border text-muted"}`}
          >
            {activeUtilityPanel === "overlay" ? "Hide Live Overlay" : wheelOverlayReady ? "Live Overlay — Wheel Owed" : "Live Overlay"}
          </button>
        </div>
      </section>

      {activeUtilityPanel === "session" && hasCurrentSession && <section className="border border-accent/40 bg-surface p-3 space-y-3"><div><p className="text-xs uppercase tracking-[0.4em] text-accent">Session Setup</p><h2 className="text-lg font-bold text-foreground mt-1">{state?.session?.title}</h2><p className="text-xs text-muted">{state?.session?.showDate} · {state?.session?.status}</p>{state?.session?.description && <p className="text-xs text-muted mt-2 max-w-2xl">{state.session.description}</p>}</div><div className="flex flex-wrap gap-2"><a href="/admin/show-management" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Show Management</a><button type="button" onClick={openSessionOptions} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">{sessionOptionsOpen ? "Hide Session Options" : "Edit Session Options"}</button></div>{canControlSession && sessionOptionsOpen && <section className="space-y-3 border border-border bg-background/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs uppercase tracking-[0.3em] text-accent">Session Options</p><h3 className="mt-1 text-lg font-bold text-foreground">Session Options</h3><p className="mt-1 text-xs text-muted">Only the verified Stripe webhook marks a track paid or moves it into Priority Signal.</p></div><div className="border border-border bg-surface p-3 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Submission Delay</p><p className="mt-1 font-bold text-foreground">{sessionCooldownSeconds === 0 ? "Disabled" : `${sessionCooldownSeconds}s`}</p></div><div className="border border-border bg-surface p-3 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Display price</p><p className="mt-1 font-bold text-foreground">{formatPrice(priorityPriceCents, priorityCurrency)}</p></div></div><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.35fr)]"><label className="space-y-2 block md:col-span-2"><span className="text-xs uppercase tracking-widest text-muted">Submission Delay</span><input type="number" min={0} max={3600} value={sessionCooldownSeconds} onChange={(event) => setSessionCooldownSeconds(Math.max(0, Math.min(3600, Number(event.target.value))))} className="w-full bg-background border border-border px-3 py-2 text-sm" /><span className="block text-xs text-muted">Delay between accepted submissions from the same source. Set to 0 to disable during testing.</span></label><label className="flex items-center justify-between gap-3 border border-border bg-surface p-3 text-sm"><span><span className="block font-bold text-foreground">Paid upgrades {priorityEnabled ? "enabled" : "disabled"}</span><span className="text-xs text-muted">Controls Stripe checkout availability for this session.</span></span><input type="checkbox" checked={priorityEnabled} onChange={(event) => setPriorityEnabled(event.target.checked)} /></label><label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Price</span><input type="number" min={0} value={priorityPriceCents} onChange={(event) => setPriorityPriceCents(Math.max(0, Number(event.target.value)))} className="w-full bg-background border border-border px-3 py-2 text-sm" /><span className="block text-xs text-muted">Enter cents. Example: 1000 = $10.00.</span></label></div>{prioritySaveError && <p className="border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{prioritySaveError}</p>}{priorityMessage && <p className="border border-accent/50 bg-accent/10 p-2 text-sm font-bold text-accent">{priorityMessage}</p>}<div className="flex flex-wrap gap-2"><button type="button" onClick={savePrioritySettings} disabled={prioritySaving} className="border border-accent bg-accent/10 px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{prioritySaving ? "Saving…" : "Save Settings"}</button><button type="button" onClick={() => setSessionOptionsOpen(false)} disabled={prioritySaving} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50">Close</button></div></section>}</section>}

      {activeUtilityPanel === "visuals" && canControlSession && <section className="border border-border/80 bg-surface/70 p-3"><AdminRuntimeDiagnostics timingSummary={timingSummary} canControl={canControlSession} onSponsorAction={updateSponsorBreakState} /></section>}

      {activeUtilityPanel === "overlay" && canControlSession && <section className="border border-border/80 bg-surface/70 p-3"><AdminLiveOverlayControl focusWheelTick={overlayWheelFocusTick} /></section>}

      {isArchivedReview && hasSession && <div className="border border-danger/40 bg-danger/10 p-3 text-xs uppercase tracking-widest text-danger">ARCHIVED / READ ONLY — viewing {state?.session?.title ?? "finished session"}. Queue review actions are locked for this finished session.</div>}

      {mounted && canControlSession && createPortal(<section className="fixed left-4 right-4 top-[calc(3.5rem+env(safe-area-inset-top))] z-[8500] space-y-1.5 border border-border bg-background/95 p-2.5 text-sm shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-[0.2em] text-muted">{state?.session?.title} · {state?.session?.showDate}</p>
          </div>
          <button type="button" onClick={() => setTopBarMinimized((value) => !value)} className="min-h-10 border border-border px-3 py-2 uppercase tracking-widest text-muted">{topBarMinimized ? "Expand" : "Minimize"}</button>
        </div>
        {topBarMinimized ? <div className="flex flex-wrap items-center gap-2">
          <span className="border border-border px-2 py-1 uppercase tracking-widest text-muted">Phase: {phaseLabel}</span>
          <span className={`border px-2 py-1 uppercase tracking-widest ${state?.publicStatus?.isOpen ? "border-accent/50 text-accent" : "border-danger/50 text-danger"}`}>Submissions: {state?.publicStatus?.isOpen ? "Open" : "Closed"}</span>
          <span className="border border-border px-2 py-1 uppercase tracking-widest text-muted">Active / Capacity: {activeCapacityLabel}</span>
          <span className="border border-border px-2 py-1 uppercase tracking-widest text-muted">Projected: {projectedRuntimeLabel}</span>
          <TopBarCommercialChip summary={timingSummary.sponsorBreakSummary} />
          <TopBarPressureChip pressure={topPressure} minimized />
          {wheelSpinsUnlocked > 0 && <>
            <span className="border border-cyan-300/50 bg-cyan-300/10 px-2 py-1 uppercase tracking-widest text-cyan-200">Wheel: {wheelSpinsUnlocked} owed</span>
            <button type="button" onClick={openWheelPanel} className="min-h-9 border border-cyan-300/70 bg-cyan-300/15 px-2.5 py-1 uppercase tracking-widest text-cyan-100 hover:bg-cyan-300 hover:text-background">Open Wheel</button>
          </>}
          {nextInLine && <span className="border border-border px-2 py-1 uppercase tracking-widest text-muted">Next: {submittedArtist(nextInLine)} — {submittedTitle(nextInLine)}</span>}
        </div> : <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div><p className="text-[10px] uppercase tracking-widest text-muted">Show Phase</p><p className="mt-1 font-bold text-foreground">{phaseLabel}</p></div>
          <div><p className="text-[10px] uppercase tracking-widest text-muted">Submissions</p><p className={`mt-1 font-bold ${state?.publicStatus?.isOpen ? "text-accent" : "text-danger"}`}>{state?.publicStatus?.isOpen ? "Open" : "Closed"}</p></div>
          <div><p className="text-[10px] uppercase tracking-widest text-muted">Active / Capacity</p><p className="mt-1 font-bold text-foreground">{activeCapacityLabel}</p></div>
          <div><p className="text-[10px] uppercase tracking-widest text-muted">Projected Runtime</p><p className="mt-1 font-bold text-foreground">{projectedRuntimeLabel}</p></div>
          <TopBarCommercialChip summary={timingSummary.sponsorBreakSummary} />
          <TopBarPressureChip pressure={topPressure} />
          {wheelSpinsUnlocked > 0 && <div className="space-y-1"><p className="text-[10px] uppercase tracking-widest text-muted">Wheel</p><p className="font-bold text-cyan-200">{wheelSpinsUnlocked} owed</p><button type="button" onClick={openWheelPanel} className="min-h-9 border border-cyan-300/70 bg-cyan-300/15 px-3 py-1 text-[10px] uppercase tracking-widest text-cyan-100 hover:bg-cyan-300 hover:text-background">Open Wheel Panel</button></div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => toggleOpen(!state?.publicStatus?.isOpen)} className={`${state?.publicStatus?.isOpen ? "border-danger/50 text-danger hover:bg-danger" : "border-accent text-accent hover:bg-accent"} min-h-10 border px-3 py-2 uppercase tracking-widest hover:text-background`}>{state?.publicStatus?.isOpen ? "Close Submissions" : "Open Submissions"}</button>
          {state?.session?.showStarted !== true && <button onClick={() => action("", "startShow")} className="min-h-10 border border-foreground/50 px-3 py-2 uppercase tracking-widest text-foreground hover:bg-foreground hover:text-background">Start Broadcast</button>}
          <button onClick={() => action("", "addWheelSpinOwed")} className="min-h-10 border border-cyan-300/60 px-3 py-2 uppercase tracking-widest text-cyan-200 hover:bg-cyan-300 hover:text-background">Add Wheel Spin</button>
          <details className="group relative"><summary className="list-none cursor-pointer min-h-10 border border-border/80 px-3 py-2 uppercase tracking-widest text-muted hover:border-foreground/60 hover:text-foreground">Resolver Override ▾</summary><div className="absolute left-0 z-30 mt-2 w-64 space-y-2 border border-border bg-background p-3 shadow-xl"><p className="text-[10px] uppercase tracking-[0.2em] text-muted">Use for live manual correction. This does not count the current slot as played.</p><button type="button" onClick={() => action("", "pullWheelChosen")} disabled={!canPullWheelChosen} className="block w-full min-h-10 border border-cyan-300/60 px-3 py-2 text-left uppercase tracking-widest text-cyan-200 hover:bg-cyan-300 hover:text-background disabled:cursor-not-allowed disabled:opacity-40">Pull Wheel Chosen</button><button type="button" onClick={() => action("", "pullFreeTransmission")} disabled={!canPullFreeTransmission} className="block w-full min-h-10 border border-foreground/40 px-3 py-2 text-left uppercase tracking-widest text-foreground hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-40">Pull Free Transmission</button>{resolverOverrideBlocked && <p className="text-[10px] uppercase tracking-[0.16em] text-[#ffaa00]">Blocked while active Priority owns the resolver.</p>}</div></details>
          <button onClick={() => setEndConfirmOpen(true)} className="ml-auto min-h-10 border border-danger/60 px-3 py-2 text-sm uppercase tracking-widest text-danger hover:bg-danger hover:text-background">End Broadcast</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="border border-border px-2 py-1 uppercase tracking-widest text-muted">Phase: {phaseLabel}</span>
          {requestedCount > 0 && <span className="border border-[#c27803]/40 bg-[#c27803]/10 px-2 py-1 uppercase tracking-widest text-[#c27803]">Payment Requested: {requestedCount}</span>}
          {checkoutPendingCount > 0 && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 uppercase tracking-widest text-[#ffaa00]">Checkout Pending: {checkoutPendingCount}</span>}
          {paidNeedsAttentionCount > 0 && <span className="border border-danger/60 bg-danger/15 px-2 py-1 uppercase tracking-widest text-danger">Paid Needs Attention: {paidNeedsAttentionCount}</span>}
          {heldPriorityCount > 0 && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 uppercase tracking-widest text-[#ffaa00]">Held Priority: {heldPriorityCount}</span>}
          {!nextInLine && <span className="border border-border bg-surface px-2 py-1 uppercase tracking-widest text-muted">No Next In Line</span>}
          {resolverOverrideBlocked && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 uppercase tracking-widest text-[#ffaa00]">Resolver Override Blocked</span>}
        </div>
        </>}
      </section>, document.body)}

      {mounted && endConfirmOpen && createPortal(<div className="fixed inset-0 z-[100000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="end-session-confirm-title" className="w-full max-w-md border border-danger/50 bg-background p-5 shadow-[0_0_70px_rgba(255,0,0,0.24)]"><p className="text-xs uppercase tracking-[0.35em] text-danger">End Broadcast</p><h2 id="end-session-confirm-title" className="mt-3 text-2xl font-bold text-foreground">End this broadcast?</h2><p className="mt-2 text-sm text-muted">This will stop routing, close submissions, and move the broadcast session to the archive.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><a href="/admin/queue" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Return to Queue Dashboard</a><button type="button" onClick={() => setEndConfirmOpen(false)} disabled={endingSession} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">No, Cancel</button><button type="button" onClick={endCurrentSession} disabled={endingSession} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background disabled:opacity-50">{endingSession ? "Ending…" : "Yes, End Broadcast"}</button></div></div></div>, document.body)}



      {canControlSession && <details className="border border-[#ffaa00]/40 bg-[#ffaa00]/5 p-3">
        <summary className="cursor-pointer text-xs uppercase tracking-[0.32em] text-[#ffaa00]">Testing / Simulation Mode</summary>
        <div className="mt-4 space-y-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><p className="text-sm text-muted">Creates fake SIM tracks for testing. Keep disabled during live broadcasts.</p><div className="border border-[#ffaa00]/40 bg-background/60 p-3 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Status</p><p className={simulationRunning ? "font-bold text-[#ffaa00]" : "font-bold text-muted"}>{simulationRunning ? "Running" : "Stopped"}</p></div></div>{!simulationCreationAllowed && <p className="text-xs uppercase tracking-[0.16em] text-[#ffaa00]">Open submissions before running simulation tracks.</p>}<div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-xs uppercase tracking-widest text-muted"><span>Simulation speed</span><select value={simulationSpeed} onChange={(event) => updateSimulationSpeed(event.target.value as SimulationSpeed)} className="block border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground">{(Object.keys(SIMULATION_SPEEDS) as SimulationSpeed[]).map((speed) => <option key={speed} value={speed}>{SIMULATION_SPEEDS[speed].label}</option>)}</select></label><button type="button" onClick={startSimulation} disabled={simulationRunning || !simulationCreationAllowed} className="border border-[#ffaa00] px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] disabled:cursor-not-allowed disabled:opacity-40">Start Simulation</button><button type="button" onClick={stopSimulation} disabled={!simulationRunning} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:cursor-not-allowed disabled:opacity-40">Stop Simulation</button><button type="button" onClick={() => simulationAction("addSimulationFreeTrack", "Added one Free SIM submission.")} disabled={!simulationCreationAllowed} className="border border-accent/50 px-4 py-2 text-xs uppercase tracking-widest text-accent disabled:cursor-not-allowed disabled:opacity-40">Add Free Test Submission Now</button><button type="button" onClick={() => simulationAction("addSimulationPaidPriority", "Sent one paid Priority SIM skip.")} disabled={!simulationCreationAllowed} className="border border-[#ffaa00]/60 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] disabled:cursor-not-allowed disabled:opacity-40">Send Paid Priority Skip Now</button><button type="button" onClick={() => simulationAction("addSimulationCheckoutPending", "Sent one checkout-pending SIM track.")} disabled={!simulationCreationAllowed} className="border border-[#ffaa00]/40 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] disabled:cursor-not-allowed disabled:opacity-40">Send Checkout Pending Test Now</button><button type="button" onClick={() => simulationAction("addSimulationPaymentFailed", "Sent one failed-payment SIM track.")} disabled={!simulationCreationAllowed} className="border border-danger/50 px-4 py-2 text-xs uppercase tracking-widest text-danger disabled:cursor-not-allowed disabled:opacity-40">Send Failed Payment Test Now</button><button type="button" onClick={() => simulationAction("addSimulationHeldPriority", "Sent one held paid Priority SIM track.")} disabled={!simulationCreationAllowed} className="border border-[#ffaa00]/60 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] disabled:cursor-not-allowed disabled:opacity-40">Send Held Priority Test Now</button><button type="button" onClick={() => simulationAction("clearSimulationTracks", "Cleared SIM/test tracks only.")} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger">Clear Simulation Tracks</button></div>{simulationMessage && <p className="border border-[#ffaa00]/30 bg-background/40 p-2 text-sm text-[#ffaa00]">{simulationMessage}</p>}</div>
      </details>}

      {!showQueueReview ? (
        <section className="border border-border bg-surface p-6">
          <h2 className="text-2xl font-bold text-foreground">No active session.</h2>
          <p className="text-sm text-muted mt-2">Start a new session from Show Management.</p>
          <a href="/admin/show-management" className="inline-flex mt-4 border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Go to Show Management</a>
        </section>
      ) : <>
        <div className="flex gap-2 border-b border-border">
          {(["active", "completed", "removed", "spotlight"] as Tab[]).map((key) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-xs uppercase tracking-widest ${tab === key ? "text-accent border-b border-accent" : "text-muted"}`}>{key === "active" ? "Active Queue" : key === "completed" ? "Completed Tracks" : key === "removed" ? "Removed" : "Spotlight"}</button>)}
        </div>

        {tab === "active" && <div className="grid gap-5">
          <div className="space-y-5"><Lane title="Priority Signal" tracks={lanes.priority} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /><Lane title="Wheel Winners" tracks={lanes.wheel} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /><Lane title="Regular Queue" tracks={lanes.regular} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /></div>
          <aside className="xl:hidden space-y-3">
            <section className="border border-border bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm uppercase tracking-[0.24em] text-muted">Next In Line Rail</p>
                <button type="button" onClick={() => setRailMinimized((value) => !value)} className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted">{railMinimized ? "Expand" : "Minimize"}</button>
              </div>
              {railMinimized ? <div className="space-y-2">
                <p className="text-xs text-muted">{nextInLine ? `${submittedArtist(nextInLine)} — ${submittedTitle(nextInLine)}` : "No Next In Line"}</p>
                <span className="inline-flex border border-cyan-300/30 bg-cyan-300/5 px-2 py-1 text-[10px] uppercase tracking-widest text-cyan-200">Wheel Spins: {state?.session?.wheelSpinsOwed ?? 0}</span>
              </div> : <>
            <NextInLineBox entry={nextInLine} playerOccupied={Boolean(loadedPlayer)} readOnly={readOnly} onAction={action} onPlayer={loadPlayer} onCopy={copy} />
            <section className="border border-border bg-surface p-3 space-y-2">
              <p className="text-sm uppercase tracking-[0.24em] text-muted">Next In Line Actions</p>
              {!nextInLine && <><p className="text-sm text-muted">No Next In Line — Pull Next Track when ready.</p><button onClick={() => action("", "pullNext")} className="min-h-10 border border-accent px-3 py-2 text-sm uppercase tracking-widest text-accent">Pull Next Track</button></>}
              <div className="flex flex-wrap gap-2"><span className="border border-cyan-300/30 bg-cyan-300/5 px-2 py-1 text-[10px] uppercase tracking-widest text-cyan-200">Wheel Spins Unlocked: {state?.session?.wheelSpinsOwed ?? 0}</span><span className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted">Next Owed: {state?.nextNonPriorityLane === "regular" ? "Free" : "Wheel"}</span></div>
              {wheelOverlayReady && <div className="space-y-2 border border-cyan-300/50 bg-cyan-300/10 p-2.5 animate-pulse">
                <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100">{wheelOverlayStatusLabel}</p>
                <button type="button" onClick={openWheelPanel} className="min-h-10 w-full border border-cyan-300/70 bg-cyan-300/10 px-3 py-2 text-xs uppercase tracking-widest text-cyan-100 hover:bg-cyan-300 hover:text-background">Open Wheel Panel</button>
              </div>}
              <div className="flex flex-wrap gap-2">{requestedCount > 0 && <span className="border border-[#c27803]/40 bg-[#c27803]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#c27803]">Payment Requested: {requestedCount}</span>}{checkoutPendingCount > 0 && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">Checkout Pending: {checkoutPendingCount}</span>}{paidNeedsAttentionCount > 0 && <span className="border border-danger/60 bg-danger/15 px-2 py-1 text-[10px] uppercase tracking-widest text-danger">Paid Needs Attention: {paidNeedsAttentionCount}</span>}{heldPriorityCount > 0 && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">Held Priority: {heldPriorityCount}</span>}{resolverOverrideBlocked && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">Resolver Override Blocked</span>}{!nextInLine && <span className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted">No Next In Line</span>}</div>
            </section>
              </>}
            </section>
          </aside>
        </div>}
        {tab === "completed" && <Lane title="Completed Tracks" tracks={state?.history ?? []} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="completed" readOnly={readOnly} />}
        {tab === "removed" && <Lane title="Removed Tracks" tracks={state?.removed ?? []} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="removed" readOnly={readOnly} />}
        {tab === "spotlight" && <Lane title="Spotlight List" tracks={lanes.spotlight} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="spotlight" readOnly={readOnly} />}
      </>}

      {mounted && loadedPlayer && createPortal(<PlayerDock key={loadedPlayer.id} player={loadedPlayer} minimized={minimized} setMinimized={setMinimized} readOnly={readOnly} actionPending={playerActionPending} onAction={playerAction} onCopy={() => copy(loadedPlayer)} />, document.body)}
      {mounted && !loadedPlayer && pendingPlayerLoad && createPortal(<section className="fixed bottom-5 left-4 right-4 z-[8600] border border-border bg-background/95 px-4 py-3 text-xs uppercase tracking-widest text-muted shadow-2xl backdrop-blur md:left-8 md:right-8 lg:left-auto lg:right-6 lg:w-[24rem]">Loading Player…</section>, document.body)}
      {mounted && !loadedPlayer && hasClearingTransition && !pendingPlayerLoad && createPortal(<section className="fixed bottom-5 left-4 right-4 z-[8600] border border-border bg-background/95 px-4 py-3 text-xs uppercase tracking-widest text-muted shadow-2xl backdrop-blur md:left-8 md:right-8 lg:left-auto lg:right-6 lg:w-[24rem]">Updating Player…</section>, document.body)}

      {mounted && canControlSession && createPortal(<aside className={`hidden xl:block fixed right-4 top-[calc(10.25rem+env(safe-area-inset-top))] ${railBottomOffsetClass} max-h-[calc(100dvh-11rem)] w-[24rem] z-[8400] border border-border bg-background/95 shadow-2xl backdrop-blur overflow-y-auto p-3 space-y-3`}>
        <section className="border border-border bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-[0.24em] text-muted">Next In Line Rail</p>
            <button type="button" onClick={() => setRailMinimized((value) => !value)} className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted">{railMinimized ? "Expand" : "Minimize"}</button>
          </div>
          {railMinimized ? <div className="space-y-2">
            <p className="text-xs text-muted">{nextInLine ? `${submittedArtist(nextInLine)} — ${submittedTitle(nextInLine)}` : "No Next In Line"}</p>
            <span className="inline-flex border border-cyan-300/30 bg-cyan-300/5 px-2 py-1 text-[10px] uppercase tracking-widest text-cyan-200">Wheel Spins: {state?.session?.wheelSpinsOwed ?? 0}</span>
          </div> : <>
            <NextInLineBox entry={nextInLine} playerOccupied={Boolean(loadedPlayer)} readOnly={readOnly} onAction={action} onPlayer={loadPlayer} onCopy={copy} />
            <section className="border border-border bg-surface p-3 space-y-2">
              <p className="text-sm uppercase tracking-[0.24em] text-muted">Next In Line Actions</p>
              {!nextInLine && <><p className="text-sm text-muted">No Next In Line — Pull Next Track when ready.</p><button onClick={() => action("", "pullNext")} className="min-h-10 border border-accent px-3 py-2 text-sm uppercase tracking-widest text-accent">Pull Next Track</button></>}
              <div className="flex flex-wrap gap-2"><span className="border border-cyan-300/30 bg-cyan-300/5 px-2 py-1 text-[10px] uppercase tracking-widest text-cyan-200">Wheel Spins Unlocked: {state?.session?.wheelSpinsOwed ?? 0}</span><span className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted">Next Owed: {state?.nextNonPriorityLane === "regular" ? "Free" : "Wheel"}</span></div>
              {wheelOverlayReady && <div className="space-y-2 border border-cyan-300/50 bg-cyan-300/10 p-2.5 animate-pulse">
                <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100">{wheelOverlayStatusLabel}</p>
                <button type="button" onClick={openWheelPanel} className="min-h-10 w-full border border-cyan-300/70 bg-cyan-300/10 px-3 py-2 text-xs uppercase tracking-widest text-cyan-100 hover:bg-cyan-300 hover:text-background">Open Wheel Panel</button>
              </div>}
              <div className="flex flex-wrap gap-2">{requestedCount > 0 && <span className="border border-[#c27803]/40 bg-[#c27803]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#c27803]">Payment Requested: {requestedCount}</span>}{checkoutPendingCount > 0 && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">Checkout Pending: {checkoutPendingCount}</span>}{paidNeedsAttentionCount > 0 && <span className="border border-danger/60 bg-danger/15 px-2 py-1 text-[10px] uppercase tracking-widest text-danger">Paid Needs Attention: {paidNeedsAttentionCount}</span>}{heldPriorityCount > 0 && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">Held Priority: {heldPriorityCount}</span>}{resolverOverrideBlocked && <span className="border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">Resolver Override Blocked</span>}{!nextInLine && <span className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted">No Next In Line</span>}</div>
            </section>
          </>}
        </section>
      </aside>, document.body)}
    </div>
  );
}

function TopBarPressureChip({ pressure, minimized = false }: { pressure: ReturnType<typeof buildQueueTimingDisplay>["pressureSummary"]; minimized?: boolean }) {
  const label = pressure.mode === "pre_show" ? "PRE-SHOW" : pressure.mode === "ended" ? "ENDED" : pressure.label;
  const tone = pressure.mode === "ended" || pressure.mode === "pre_show"
    ? "border-border text-muted"
    : pressure.level === "critical"
      ? "border-danger/60 text-danger"
      : pressure.level === "high"
        ? "border-[#ff9f43]/70 text-[#ff9f43]"
        : pressure.level === "medium"
          ? "border-[#f6c744]/60 text-[#f6c744]"
          : "border-[#3ddc97]/60 text-[#3ddc97]";
  if (minimized) return <span className={`border px-2 py-1 uppercase tracking-widest ${tone}`}>Pressure: {label}{pressure.mode === "live" ? ` ${pressure.score}/100` : ""}</span>;
  return <div><p className="text-[10px] uppercase tracking-widest text-muted">Pressure</p><p className={`mt-1 inline-flex border px-2 py-1 font-bold uppercase tracking-widest ${tone}`}>{label}{pressure.mode === "live" ? ` ${pressure.score}/100` : ""}</p></div>;
}

function TopBarCommercialChip({ summary, minimized = false }: { summary: ReturnType<typeof buildQueueTimingDisplay>["sponsorBreakSummary"]; minimized?: boolean }) {
  const compact = summary.compactLabel;
  const tone = compact === "Due" || compact.startsWith("Running")
    ? "border-[#ffaa00]/60 text-[#ffaa00]"
    : compact === "Done"
      ? "border-[#3ddc97]/60 text-[#3ddc97]"
      : compact === "Skipped"
        ? "border-danger/50 text-danger"
        : "border-border text-muted";
  if (minimized) return <span className={`border px-2 py-1 uppercase tracking-widest ${tone}`}>Commercial: {compact}</span>;
  return <div><p className="text-[10px] uppercase tracking-widest text-muted">Commercial</p><p className={`mt-1 inline-flex border px-2 py-1 font-bold uppercase tracking-widest ${tone}`}>{compact}</p></div>;
}


function NextInLineBox({ entry, playerOccupied, readOnly, onAction, onPlayer, onCopy }: { entry: QueueEntry | null; playerOccupied: boolean; readOnly: boolean; onAction: (id: string, action: AdminQueueAction) => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void }) {
  const visual = entry ? queueTrackVisual(entry) : null;
  return <section className={`p-5 space-y-4 ${visual?.sectionClass ?? "border border-accent/60 bg-accent/5"}`}><div><p className="text-xs uppercase tracking-[0.4em] text-accent">Next in Line</p>{!entry ? <p className="mt-3 text-lg text-muted">No Next In Line — Pull Next Track when ready.</p> : <><div className="mt-3"><LaneStatusBadge entry={entry} /></div><h2 className="mt-3 text-2xl font-bold text-foreground">{submittedArtist(entry)} — {submittedTitle(entry)}</h2><p className="text-sm text-muted mt-1">Lane: {LANE_LABELS[entryLane(entry)]} · Source: {sourceLabel(entry)} · Duration: {durationLabel(entry)}</p>{detectedLabel(entry) && <p className="text-xs text-muted mt-1">Detected / Provider: {detectedLabel(entry)}</p>}</>}</div>{entry && <TrackActions entry={entry} mode="next" playerOccupied={playerOccupied} readOnly={readOnly} onAction={onAction} onPlayer={onPlayer} onCopy={onCopy} />}</section>;
}

type AdminYTPlayer = {
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getVideoData?: () => { video_id?: string };
  mute: () => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

function ensureAdminYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as Window & { YT?: { Player: new (elementId: string | HTMLElement, options: Record<string, unknown>) => AdminYTPlayer } }).YT?.Player) return Promise.resolve();
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

function AdminYouTubePlayer({ entry }: { entry: QueueEntry }) {
  const playerRef = useRef<AdminYTPlayer | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const generationRef = useRef(0);
  const playbackStateRef = useRef<"playing" | "paused" | "stopped">("stopped");
  const [diagnostics, setDiagnostics] = useState<{ provider: string; videoId: string; trackId: string; playbackState: "playing" | "paused" | "stopped"; currentTimeSeconds: number; updatedAt: string; status: "Fresh" | "Stale" | "Missing" | "Mismatch" | "Error"; ready: boolean; errorCode?: number; publishStatus?: "success" | "failed" } | null>(null);
  const [diagnosticsNow, setDiagnosticsNow] = useState(() => Date.now());
  const trackId = entry.id;
  const trackLink = entry.link;
  const sourceType = entry.sourceType;
  const videoId = parseYouTubeVideoId(trackLink);
  const trackSyncInput = useMemo<OverlayYouTubeTrackInput>(() => ({ id: trackId, link: trackLink, sourceType, videoId }), [trackId, trackLink, sourceType, videoId]);
  const containerId = `admin-youtube-player-${trackId}-${videoId ?? "unknown"}`;
  const clearImperativeHost = useCallback(() => {
    if (playerHostRef.current) playerHostRef.current.replaceChildren();
  }, []);
  const publish = useCallback(async (playbackState: "playing" | "paused" | "stopped", currentTimeSeconds = 0) => {
    let actualVideoId = videoId;
    try {
      actualVideoId = playerRef.current?.getVideoData?.().video_id || videoId;
    } catch {
      setDiagnostics((current) => current ? { ...current, status: "Error", publishStatus: "failed" } : null);
      return;
    }
    if (!actualVideoId || actualVideoId !== videoId) {
      setDiagnostics(actualVideoId ? { provider: "youtube", videoId: actualVideoId, trackId, playbackState, currentTimeSeconds, updatedAt: new Date().toISOString(), status: "Mismatch", ready: Boolean(playerRef.current), publishStatus: "failed" } : null);
      return;
    }
    try {
      const sync = await publishOverlayYouTubeSync(trackSyncInput, playbackState, currentTimeSeconds);
      if (sync) setDiagnostics({ ...sync, status: "Fresh", ready: Boolean(playerRef.current), publishStatus: "success" });
    } catch {
      setDiagnostics((current) => current ? { ...current, status: "Error", publishStatus: "failed" } : null);
    }
  }, [trackId, trackSyncInput, videoId]);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    clearImperativeHost();
    const mount = document.createElement("div");
    mount.id = `${containerId}-yt-${generation}`;
    playerHostRef.current?.appendChild(mount);
    let readyTimer: number | null = window.setTimeout(() => {
      if (cancelled || generationRef.current !== generation) return;
      playbackStateRef.current = "stopped";
      setDiagnostics({ provider: "youtube", videoId, trackId, playbackState: "stopped", currentTimeSeconds: 0, updatedAt: new Date().toISOString(), status: "Error", ready: false, publishStatus: "failed" });
      publish("stopped", 0);
    }, YOUTUBE_PLAYER_READY_TIMEOUT_MS);
    ensureAdminYouTubeApi().then(() => {
      const yt = (window as Window & { YT?: { Player: new (elementId: string | HTMLElement, options: Record<string, unknown>) => AdminYTPlayer } }).YT;
      if (cancelled || generationRef.current !== generation || playerRef.current || !yt?.Player || !mount.isConnected) return;
      playerRef.current = new yt.Player(mount, {
        videoId,
        playerVars: { autoplay: 0, controls: 1, modestbranding: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            if (cancelled || generationRef.current !== generation) return;
            if (readyTimer) window.clearTimeout(readyTimer);
            readyTimer = null;
            setDiagnostics((current) => current ? { ...current, ready: true } : { provider: "youtube", videoId, trackId, playbackState: "stopped", currentTimeSeconds: 0, updatedAt: new Date().toISOString(), status: "Missing", ready: true });
          },
          onError: (event: { data: number }) => {
            if (cancelled || generationRef.current !== generation) return;
            if (readyTimer) window.clearTimeout(readyTimer);
            readyTimer = null;
            playbackStateRef.current = "stopped";
            setDiagnostics({ provider: "youtube", videoId, trackId, playbackState: "stopped", currentTimeSeconds: 0, updatedAt: new Date().toISOString(), status: "Error", ready: false, errorCode: event.data, publishStatus: "failed" });
            publish("stopped", 0);
          },
          onStateChange: (event: { data: number }) => {
            if (cancelled || generationRef.current !== generation) return;
            const next = event.data === 1 ? "playing" : event.data === 2 ? "paused" : event.data === 0 ? "stopped" : null;
            if (!next) return;
            playbackStateRef.current = next;
            let eventTime = 0;
            try {
              eventTime = playerRef.current?.getCurrentTime() ?? 0;
            } catch {
              playbackStateRef.current = "stopped";
              setDiagnostics((current) => current ? { ...current, status: "Error", publishStatus: "failed" } : null);
              return;
            }
            publish(next, eventTime);
          },
        },
      });
    });
    const interval = window.setInterval(() => {
      let currentTime = 0;
      try {
        currentTime = playerRef.current?.getCurrentTime() ?? 0;
      } catch {
        playbackStateRef.current = "stopped";
        setDiagnostics((current) => current ? { ...current, status: "Error", publishStatus: "failed" } : null);
      }
      if (playbackStateRef.current === "playing" || playbackStateRef.current === "paused") publish(playbackStateRef.current, currentTime);
      const observedAt = Date.now();
      setDiagnosticsNow(observedAt);
      setDiagnostics((current) => current ? { ...current, status: current.status === "Error" || current.status === "Mismatch" ? current.status : observedAt - new Date(current.updatedAt).getTime() > YOUTUBE_SYNC_STALE_AFTER_MS ? "Stale" : "Fresh" } : null);
      // Stopped/ended publishes immediately from onStateChange, then intentionally falls back after staleness.
      // Playing and paused continue heartbeating while the authoritative host player remains mounted.
    }, 2_500);
    return () => {
      cancelled = true;
      generationRef.current += 1;
      window.clearInterval(interval);
      if (readyTimer) window.clearTimeout(readyTimer);
      try {
        if (playerRef.current?.destroy) playerRef.current.destroy();
      } catch {
        // YouTube iframe cleanup is best-effort.
      }
      playerRef.current = null;
      clearImperativeHost();
    };
  }, [clearImperativeHost, containerId, publish, trackId, videoId]);

  if (!videoId) return <div className="border border-border p-3 text-sm text-muted">No playable YouTube video ID found. Use Open Link.</div>;
  const syncAge = diagnostics ? Math.max(0, Math.round((diagnosticsNow - new Date(diagnostics.updatedAt).getTime()) / 1000)) : null;
  return <div className="space-y-2"><div className="relative h-56 w-full border border-border"><div ref={playerHostRef} className="h-full w-full" data-youtube-host={containerId} /></div><div className="grid gap-1 border border-border/60 bg-surface/80 p-2 text-[10px] uppercase tracking-widest text-muted sm:grid-cols-3"><span>Provider: {diagnostics?.provider ?? "youtube"}</span><span>Video ID: {diagnostics?.videoId ?? videoId}</span><span>Track ID: {diagnostics?.trackId ?? trackId}</span><span>State: {diagnostics?.playbackState ?? "Missing"}</span><span>Host time: {Math.round(diagnostics?.currentTimeSeconds ?? 0)}s</span><span>Sync: {diagnostics?.status ?? "Missing"}{syncAge !== null ? ` · ${syncAge}s` : ""}</span><span>Ready: {diagnostics?.ready ? "yes" : "no"}</span><span>Error: {diagnostics?.errorCode ? `${diagnostics.errorCode} · ${youtubeErrorLabel(diagnostics.errorCode)}` : "—"}</span><span>Publish: {diagnostics?.publishStatus ?? "—"}</span></div></div>;
}


function tiktokErrorLabel(code?: number | null, name?: string | null): string {
  if (code === 1001 || name === "INVALID_VIDEO") return "Invalid or unavailable video";
  if (code === 2001 || name === "SERVER_ERROR") return "TikTok server error";
  if (code === 3001 || name === "PLAYBACK_ERROR") return "Playback error";
  if (code === 3002 || name === "AUTOPLAY_ERROR") return "Autoplay blocked";
  return "TikTok player unavailable";
}

function AdminTikTokPlayer({ entry }: { entry: QueueEntry }) {
  const parsed = useMemo(() => parseTikTokVideoUrl(entry.link), [entry.link]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(parsed ? "loading" : "error");
  const [errorLabel, setErrorLabel] = useState<string | null>(parsed ? null : "No valid TikTok video ID found. Use Open Link.");
  const src = useMemo(() => {
    if (!parsed) return null;
    const params = new URLSearchParams({ controls: "1", progress_bar: "1", play_button: "1", volume_control: "1", fullscreen_button: "1", timestamp: "1", autoplay: "0", music_info: "1", description: "1", rel: "0", native_context_menu: "1", closed_caption: "1", muted: "0" });
    return `${parsed.playerUrl}?${params.toString()}`;
  }, [parsed]);

  useEffect(() => {
    if (!parsed) return;
    setStatus("loading");
    setErrorLabel(null);
    const timer = window.setTimeout(() => {
      setStatus((current) => current === "ready" ? current : "error");
      setErrorLabel((current) => current ?? "TikTok player did not become ready. Open Link remains available.");
    }, TIKTOK_PLAYER_READY_TIMEOUT_MS);
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://www.tiktok.com") return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
      if ((payload as Record<string, unknown>)["x-tiktok-player"] !== true) return;
      const type = (payload as { type?: unknown }).type;
      if (type !== "onPlayerReady" && type !== "onStateChange" && type !== "onPlayerError") return;
      if (type === "onPlayerReady") { setStatus("ready"); setErrorLabel(null); }
      if (type === "onPlayerError") {
        const codeValue = (payload as { errorCode?: unknown; code?: unknown }).errorCode ?? (payload as { code?: unknown }).code;
        const code = Number(codeValue);
        const error = typeof (payload as { errorType?: unknown; error?: unknown }).errorType === "string" ? (payload as { errorType: string }).errorType : typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : null;
        setStatus("error");
        setErrorLabel(tiktokErrorLabel(Number.isFinite(code) ? code : null, error));
      }
    }
    window.addEventListener("message", onMessage);
    return () => { window.clearTimeout(timer); window.removeEventListener("message", onMessage); };
  }, [parsed]);

  if (!src) return <div className="border border-border p-3 text-sm text-muted">No valid TikTok video ID found. Use Open Link.</div>;
  return <div className="space-y-2"><div className="mx-auto max-h-[62vh] min-h-[360px] w-full max-w-[420px] overflow-hidden border border-border bg-black"><iframe ref={iframeRef} title={`TikTok player for ${submittedArtist(entry)} — ${submittedTitle(entry)}`} src={src} className="h-[62vh] min-h-[360px] max-h-[620px] w-full" allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>{status === "loading" && <p className="text-xs text-muted">Loading TikTok player… Open Link and Copy Link remain available.</p>}{status === "ready" && <p className="text-xs text-muted">TikTok player ready. Use the native controls.</p>}{status === "error" && <p className="border border-danger/40 bg-danger/10 p-2 text-xs text-danger">{errorLabel ?? "TikTok player unavailable."} Use Open Link or Copy Link.</p>}</div>;
}

function PlayerDock({ player, minimized, setMinimized, readOnly, actionPending, onAction, onCopy }: { player: QueueEntry; minimized: boolean; setMinimized: (value: boolean) => void; readOnly: boolean; actionPending: boolean; onAction: (id: string, action: AdminQueueAction) => void; onCopy: () => void }) {
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
        <div className={`${minimized ? "h-0 overflow-hidden opacity-0" : "mt-3 opacity-100"} grid w-full items-end gap-3 xl:grid-cols-[minmax(0,1fr)_auto]`} aria-hidden={minimized}>
          <div className="w-full min-w-0">
            {player.sourceType === "upload" && player.fileUrl && <audio key={`${player.id}-${adminAudioUrl(player)}`} src={adminAudioUrl(player)} controls className="w-full" />}
            {player.sourceType === "youtube" && <AdminYouTubePlayer key={player.id} entry={player} />}
            {player.sourceType === "tiktok" && <AdminTikTokPlayer key={player.id} entry={player} />}
            {player.sourceType !== "upload" && player.sourceType !== "youtube" && player.sourceType !== "tiktok" && embedded && <iframe key={`${player.id}-${embedded}`} title="Queue preview" src={embedded} className="h-56 w-full border border-border" allow="clipboard-write; encrypted-media; picture-in-picture" />}
            {player.sourceType !== "upload" && player.sourceType !== "youtube" && player.sourceType !== "tiktok" && !embedded && <div className="border border-border p-2 text-sm text-muted">No embeddable preview for this source. Use Open Link or Copy Link.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={openUrl(player)} target="_blank" rel="noreferrer" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent">Open Link</a>
            <button type="button" onClick={onCopy} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Copy Link</button>
            {!readOnly && <><button type="button" disabled={actionPending} onClick={() => onAction(player.id, "finish")} className="border border-accent bg-accent px-4 py-2 text-xs uppercase tracking-widest text-background disabled:opacity-50">Finish Track</button><button type="button" disabled={actionPending} onClick={() => onAction(player.id, "remove")} className="border border-danger/40 px-4 py-2 text-xs uppercase tracking-widest text-danger disabled:opacity-50">Remove Track</button><button type="button" disabled={actionPending} onClick={() => onAction(player.id, "moveBack")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">Undo Load</button>{canPausePriority(player) && <button type="button" disabled={actionPending} onClick={() => onAction(player.id, "pausePriority")} className="border border-[#ffaa00]/50 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] disabled:opacity-50">Pause Priority</button>}<button type="button" disabled={actionPending} onClick={() => onAction(player.id, "spotlight")} className="border border-foreground/40 px-4 py-2 text-xs uppercase tracking-widest text-foreground disabled:opacity-50">Spotlight</button></>}
          </div>
        </div>
      </div>
    </div>
  );
}


function AdminTrackMetadata({ entry }: { entry: QueueEntry }) {
  const detected = detectedLabel(entry);
  const paidAtLabel = entry.priorityUpgradePaidAt ? new Date(entry.priorityUpgradePaidAt).toLocaleString() : "—";
  const amountLabel = typeof entry.priorityUpgradeAmountCents === "number" ? formatPrice(entry.priorityUpgradeAmountCents, entry.priorityUpgradeCurrency ?? "usd") : "—";
  const needsAttentionReason = entry.priorityUpgradeStatus === "paid_needs_attention" ? "Payment confirmed after track left safe queued lanes. Manual review required." : null;
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
        {(entry.priorityUpgradeStatus === "paid_needs_attention" || entry.priorityUpgradeStatus === "checkout_pending" || entry.priorityUpgradeStatus === "requested" || entry.priorityUpgradeStatus === "paid") && (
          <div className={`mt-2 space-y-1 border p-2 ${entry.priorityUpgradeStatus === "paid_needs_attention" ? "border-danger/60 bg-danger/10 text-danger" : "border-[#ffaa00]/40 bg-[#ffaa00]/10 text-[#ffaa00]"}`}>
            <p>Priority Payment Status: {entry.priorityUpgradeStatus}</p>
            <p>Lane/Track status: {entryLane(entry)} / {entry.status}</p>
            <p>Paid Amount: {amountLabel}</p>
            <p>Paid At: {paidAtLabel}</p>
            {needsAttentionReason && <p>Reason: {needsAttentionReason}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminRuntimeDiagnostics({ timingSummary, canControl, onSponsorAction }: { timingSummary: ReturnType<typeof buildQueueTimingDisplay>; canControl: boolean; onSponsorAction: (action: "start" | "complete" | "skip" | "reset") => void }) {
  const sponsor = timingSummary.sponsorBreakSummary;
  const wheel = timingSummary.wheelTimingSummary;
  const pressure = timingSummary.pressureSummary;
  const needleDeg = -90 + (pressure.score / 100) * 180;
  const pressureHeading = pressure.mode === "live" ? "Live Pressure" : pressure.mode === "ended" ? "Ended" : "Pre-show Projection";
  const sponsorStartDisabled = sponsor.status === "running" || sponsor.status === "completed" || sponsor.status === "skipped";
  const sponsorStartLabel = sponsor.status === "running"
    ? `Commercial Break Running${sponsor.diagnosticLabel.includes("remaining") ? ` · ${sponsor.diagnosticLabel.split("·")[1]?.trim().replace("remaining", "").trim()}` : ""}`
    : sponsor.status === "completed"
      ? "Commercial Break Done"
      : sponsor.status === "skipped"
        ? "Commercial Break Skipped"
        : "Mark Commercial Break Started";
  return (
    <section className="space-y-3 border border-accent/30 bg-background/40 p-4 text-xs">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="uppercase tracking-[0.28em] text-accent">Runtime Diagnostics</p>
          <p className="mt-1 text-sm text-muted">{pressure.mode === "live" ? "Live pressure from broadcast timing + queue state." : pressure.mode === "ended" ? "Broadcast has ended." : "Pre-show projection from queue state. Pressure activates when broadcast starts."}</p>
        </div>
        {canControl && <div className="flex flex-wrap gap-2"><button type="button" disabled={sponsorStartDisabled} onClick={() => !sponsorStartDisabled && onSponsorAction("start")} className={`px-3 py-1.5 uppercase tracking-widest ${sponsorStartDisabled ? "cursor-not-allowed border border-border text-muted opacity-70" : "border border-[#ffaa00]/50 text-[#ffaa00]"}`}>{sponsorStartLabel}</button><button type="button" onClick={() => onSponsorAction("reset")} className="border border-border px-3 py-1.5 uppercase tracking-widest text-muted">Reset Commercial Break State</button></div>}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Projected Show Time</p><p className="mt-1 text-lg font-bold text-foreground">{timingSummary.showRuntimeSummary.projectedLabel}</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Target</p><p className="mt-1 font-bold text-foreground">{timingSummary.showRuntimeSummary.targetLabel}</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Target Status</p><p className="mt-1 font-bold text-accent">{timingSummary.showRuntimeSummary.targetStatusLabel}</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Line Fit</p><p className="mt-1 font-bold text-foreground">{timingSummary.lineFitCopy}</p></div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1.1fr_2fr]">
        <div className="border border-border bg-surface p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted">{pressureHeading}</p>
          <div className="mt-2">
            <svg viewBox="0 0 220 140" className="w-full max-w-[14rem]" role="img" aria-label={`Runtime pressure ${pressure.label} ${pressure.score} out of 100`}>
              <path d="M20 120 A90 90 0 0 1 200 120" fill="none" stroke="#2e2e2e" strokeWidth="14" />
              <path d="M20 120 A90 90 0 0 1 74 42" fill="none" stroke="#3ddc97" strokeWidth="14" />
              <path d="M74 42 A90 90 0 0 1 126 33" fill="none" stroke="#f6c744" strokeWidth="14" />
              <path d="M126 33 A90 90 0 0 1 168 53" fill="none" stroke="#ff9f43" strokeWidth="14" />
              <path d="M168 53 A90 90 0 0 1 200 120" fill="none" stroke="#ff4d4f" strokeWidth="14" />
              <line x1="110" y1="120" x2="110" y2="44" stroke="#fafafa" strokeWidth="3" transform={`rotate(${needleDeg} 110 120)`} />
              <circle cx="110" cy="120" r="6" fill="#fafafa" />
              <text x="20" y="136" fill="#9ca3af" fontSize="10">LOW</text><text x="74" y="20" fill="#9ca3af" fontSize="10">MED</text><text x="132" y="20" fill="#9ca3af" fontSize="10">HIGH</text><text x="182" y="136" fill="#9ca3af" fontSize="10">CRIT</text>
            </svg>
          </div>
          <p className="mt-1 font-bold text-foreground">{pressure.label} · {pressure.score}/100</p>
          <p className="mt-1 text-muted">{pressure.recommendation}</p>
        </div>
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Pressure Factors</p><p className="mt-1 font-bold text-foreground">{pressure.description}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{pressure.factors.map((factor) => <li key={factor}>{factor}</li>)}</ul></div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Commercial Break</p><p className="mt-1 font-bold text-foreground">{sponsor.diagnosticLabel}</p><p className="mt-1 text-muted">{sponsor.durationLabel} duration · {sponsor.minElapsedLabel} minimum · midpoint {sponsor.completedPlayableCount}/{sponsor.totalPlayableNonRemovedCount ?? "—"} playable</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Wheel Timing</p><p className="mt-1 font-bold text-foreground">{wheel.owed} wheel spins owed</p><p className="mt-1 text-muted">{wheel.overheadLabel} ceremony overhead included</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Unknown Durations</p><p className="mt-1 font-bold text-foreground">{timingSummary.showRuntimeSummary.unknownDurationCount}</p><p className="mt-1 text-muted">Tracks using est. 5:00</p></div>
        <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Known Durations</p><p className="mt-1 font-bold text-foreground">{timingSummary.showRuntimeSummary.knownDurationCount}</p><p className="mt-1 text-muted">Detected/provider/upload durations</p></div>
      </div>
      <div className="border border-border bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted">Current Runtime Notes</p><p className="mt-1 text-muted">Commercial: {sponsor.diagnosticLabel} · Wheel overhead: {formatHoursMinutes(wheel.overheadSeconds)} · {timingSummary.showRuntimeSummary.notes[0] ?? "No projection warnings."}</p></div>
    </section>
  );
}

function Lane({ title, tracks, onAction, onPlayer, onCopy, mode, readOnly }: { title: string; tracks: QueueEntry[]; onAction: (id: string, action: AdminQueueAction) => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void; mode: "next" | "active" | "spotlight" | "completed" | "removed"; readOnly: boolean }) {
  const sectionClass = title.includes("Priority") ? "border-[#ffaa00]/50 bg-[#ffaa00]/5" : title.includes("Wheel") ? "border-cyan-300/50 bg-cyan-300/5" : title.includes("Regular") ? "border-border bg-surface" : "border-border bg-surface";
  const titleClass = title.includes("Priority") ? "text-[#ffaa00]" : title.includes("Wheel") ? "text-cyan-200" : "text-foreground";
  return (
    <section className={`border p-3 ${sectionClass}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className={`text-sm uppercase tracking-[0.25em] ${titleClass}`}>{title}</h2>
        <span className="text-xs text-muted">{tracks.length}</span>
      </div>
      <div className="space-y-2">
        {tracks.length === 0 ? (
          <p className="border border-border/60 p-3 text-sm text-muted">No tracks in this lane.</p>
        ) : (
          tracks.map((entry) => (
            <article key={`${title}-${entry.id}`} className={`space-y-2 p-3 ${queueTrackVisual(entry).cardClass}`}>
              <div className="space-y-2">
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
      {!readOnly && mode === "active" && <><button type="button" onClick={() => onAction(entry.id, "remove")} className="border border-danger/40 px-3 py-1.5 text-xs text-danger">Remove</button>{entry.priorityUpgradeStatus === "paid_needs_attention" && <button type="button" onClick={() => onAction(entry.id, "resolvePaidPriority")} className="border border-danger bg-danger px-3 py-1.5 text-xs text-background">Move Paid Track to Priority</button>}{lane === "regular" ? <><button type="button" onClick={() => onAction(entry.id, "priority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move to Priority Signal</button>{isWheelEligibleTrack(entry) && <button type="button" onClick={() => onAction(entry.id, "wheel")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Mark Wheel Chosen</button>}</> : <><button type="button" onClick={() => onAction(entry.id, "regular")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Move to Regular Queue</button>{lane === "wheel" && <button type="button" onClick={() => onAction(entry.id, "priority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move to Priority Signal</button>}{canPausePriority(entry) && <button type="button" onClick={() => onAction(entry.id, "pausePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Pause Priority</button>}{canResumePriority(entry) && <button type="button" onClick={() => onAction(entry.id, "resumePriority")} className="border border-[#ffaa00] bg-[#ffaa00] px-3 py-1.5 text-xs text-background">Unpause Priority</button>}</>}<button type="button" onClick={() => onAction(entry.id, "spotlight")} className="border border-foreground/40 px-3 py-1.5 text-xs text-foreground">Spotlight</button></>}
      {!readOnly && mode === "spotlight" && <button type="button" onClick={() => onAction(entry.id, "removeSpotlight")} className="border border-danger/40 px-3 py-1.5 text-xs text-danger">Remove from Spotlight</button>}
      {!readOnly && mode === "completed" && <><button type="button" onClick={() => onAction(entry.id, "restoreRegular")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Move back to Regular Queue</button>{wasPrioritySignal(entry) && <button type="button" onClick={() => onAction(entry.id, "restorePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move back to Priority Signal</button>}</>}
      {!readOnly && mode === "removed" && <><button type="button" onClick={() => onAction(entry.id, "restoreRegular")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Restore to Regular Queue</button>{wasPrioritySignal(entry) && <button type="button" onClick={() => onAction(entry.id, "restorePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Restore to Priority Signal</button>}</>}
    </div>
  );
}
