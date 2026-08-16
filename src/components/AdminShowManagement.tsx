/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AdminQueueSessionProvenance } from "@/components/AdminQueueSessionProvenance";
import { formatRuntime } from "@/lib/queue-types";
import { pacificDateString } from "@/lib/pacific-time";
import { captureQueueEndTarget, queueAdminReadViewState, queuePollingResponseMayApply, queueResponseRequiresStateRevalidation, queueStateUsesDegradedCache, type QueueEndTarget } from "@/lib/queue-admin-safety";
import { queuePollingRequestIsCurrent, queuePollingSnapshotMayApply } from "@/lib/queue-polling-safety";
import type { QueueSessionBnlPublicationStatus, QueueSessionPurpose, QueueSessionSummary, QueueState } from "@/lib/queue-types";

const SESSION_DESCRIPTION_OPTIONS = [
  "Three tracks per submitter by default. Capacity is capped for this broadcast queue. At the skip-game breach, Wheel Chosen can fracture the order, while Priority Lane stays reserved for future urgent access.",
  "BARCODE queue rules: three transmissions per submitter, fixed session capacity, wheel logic when the skip-game signal opens, and Priority Lane held for future fast-pass transmissions.",
  "Each submitter may route three tracks into this interdimensional queue. Capacity is finite, Wheel Chosen can breach the line, and Priority Lane remains ready for future priority access.",
];

type SubmitterRow = {
  sessionId: string;
  sessionTitle: string;
  showDate: string;
  submitterArtistName: string;
  submittedArtistName: string;
  submittedSongTitle: string;
  tiktokHandle: string;
  contactEmail: string;
  sourceLink: string;
  sourceType: string;
  submittedAt: string;
  status: string;
  lane: string;
  spotlight: boolean;
};

function todayDate(): string { return pacificDateString(); }
function defaultDescription(date: string): string { return SESSION_DESCRIPTION_OPTIONS[[...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % SESSION_DESCRIPTION_OPTIONS.length]; }
function exportHref(sessionId?: string): string { return `/api/admin/queue/export${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`; }
function formatPrice(cents: number, currency = "usd"): string { return `${new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(Math.max(0, cents) / 100)} ${currency.toUpperCase()}`; }
function responseErrorMessage(payload: unknown, fallback: string): string {
  return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : fallback;
}
const FIXED_PRIORITY_LABEL = "Priority Signal Upgrade";
const FIXED_PRIORITY_INSTRUCTIONS = "Moves this track into the Priority Signal lane after payment confirmation.";
const DEGRADED_QUEUE_READ_MESSAGE = "Queue storage is temporarily unavailable. Showing a verified cached snapshot; refresh before making ordinary changes.";

export function AdminShowManagement() {
  const [state, setState] = useState<QueueState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDate] = useState(todayDate());
  const [title, setTitle] = useState(`BARCODE Radio — ${todayDate()}`);
  const [description, setDescription] = useState(defaultDescription(todayDate()));
  const [trackLimitPerArtist, setTrackLimitPerArtist] = useState(3);
  const [queueCapacity, setQueueCapacity] = useState(44);
  const [purpose, setPurpose] = useState<QueueSessionPurpose>("rehearsal");
  const [bnlPublicationStatus, setBnlPublicationStatus] = useState<QueueSessionBnlPublicationStatus>("private");
  const [submissionCooldownSeconds, setSubmissionCooldownSeconds] = useState(300);
  const [priorityUpgradesEnabled, setPriorityUpgradesEnabled] = useState(true);
  const [priorityUpgradePriceCents, setPriorityUpgradePriceCents] = useState(1000);
  const [priorityStartError, setPriorityStartError] = useState<string | null>(null);
  const [priorityUpgradeCurrency] = useState("usd");
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endTarget, setEndTarget] = useState<QueueEndTarget | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<string | null>(null);
  const startRequestIdRef = useRef<string | null>(null);
  const mutationEpochRef = useRef(0);
  const mutationInFlightRef = useRef(0);
  const latestAppliedMutationEpochRef = useRef(0);
  const pollRequestSequenceRef = useRef(0);
  const latestAppliedRevisionRef = useRef(-1);
  const router = useRouter();

  function applyMutationState(next: QueueState, epoch: number): void {
    if (epoch < latestAppliedMutationEpochRef.current) return;
    latestAppliedMutationEpochRef.current = epoch;
    if (typeof next.revision === "number" && Number.isFinite(next.revision)) {
      latestAppliedRevisionRef.current = Math.max(latestAppliedRevisionRef.current, next.revision);
    }
    setState(next);
  }

  function applyPollingStateIfFresh(next: QueueState, requestEpoch: number, requestSequence: number): boolean {
    if (typeof next.revision !== "number" || !Number.isFinite(next.revision)) return false;
    if (!queuePollingResponseMayApply({
      requestEpoch,
      currentMutationEpoch: mutationEpochRef.current,
      mutationsInFlight: mutationInFlightRef.current,
      latestAppliedMutationEpoch: latestAppliedMutationEpochRef.current,
    })) return false;
    if (!queuePollingSnapshotMayApply({
      requestSequence,
      latestRequestSequence: pollRequestSequenceRef.current,
      responseRevision: next.revision,
      latestAppliedRevision: latestAppliedRevisionRef.current,
    })) return false;
    latestAppliedRevisionRef.current = next.revision;
    setState(next);
    return true;
  }

  function pollingRequestStillCurrent(requestEpoch: number, requestSequence: number): boolean {
    return queuePollingRequestIsCurrent({
      requestSequence,
      latestRequestSequence: pollRequestSequenceRef.current,
    }) && queuePollingResponseMayApply({
      requestEpoch,
      currentMutationEpoch: mutationEpochRef.current,
      mutationsInFlight: mutationInFlightRef.current,
      latestAppliedMutationEpoch: latestAppliedMutationEpochRef.current,
    });
  }

  async function load(sessionId?: string) {
    const requestEpoch = mutationEpochRef.current;
    const requestSequence = ++pollRequestSequenceRef.current;
    try {
      const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
      const res = await fetch(`/api/admin/queue${suffix}`, { cache: "no-store" });
      if (!res.ok) {
        if (!pollingRequestStillCurrent(requestEpoch, requestSequence)) return;
        setError(res.status === 401 ? "Admin authentication required. Log in at /admin first." : "Show management unavailable.");
        return;
      }
      const next = await res.json() as QueueState;
      if (!applyPollingStateIfFresh(next, requestEpoch, requestSequence)) {
        const nextRevision = typeof next.revision === "number" && Number.isFinite(next.revision) ? next.revision : null;
        if (pollingRequestStillCurrent(requestEpoch, requestSequence)
          && (nextRevision === null || nextRevision < latestAppliedRevisionRef.current)) {
          setError(nextRevision === null
            ? "Show management received a queue snapshot without a valid revision. The last confirmed state is preserved while live state is rechecked."
            : "Show management received an older queue snapshot. The last confirmed state is preserved while live state is rechecked.");
        }
        return;
      }
      if (queueStateUsesDegradedCache(next)) {
        setError(DEGRADED_QUEUE_READ_MESSAGE);
        return;
      }
      setError(null);
      setLastConfirmedAt(new Date().toISOString());
    } catch {
      if (!pollingRequestStillCurrent(requestEpoch, requestSequence)) return;
      setError("Show management could not reach the queue service.");
    }
  }

  async function post(body: Record<string, unknown>, options: { allowWhileStale?: boolean } = {}): Promise<QueueState | null> {
    if (error && !options.allowWhileStale) {
      setOperationError("Live queue state is stale. Refresh successfully before changing show settings.");
      return null;
    }
    mutationEpochRef.current += 1;
    const epoch = mutationEpochRef.current;
    mutationInFlightRef.current += 1;
    try {
      const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setOperationError(responseErrorMessage(payload, "Queue operation failed."));
        if (queueResponseRequiresStateRevalidation(payload)) setError("Show state is unconfirmed after the failed operation. Refresh before making another ordinary change.");
        return null;
      }
      const next = payload as QueueState;
      setOperationError(null);
      applyMutationState(next, epoch);
      if (queueStateUsesDegradedCache(next)) {
        setError(DEGRADED_QUEUE_READ_MESSAGE);
        return next;
      }
      setError(null);
      setLastConfirmedAt(new Date().toISOString());
      return next;
    } catch {
      setOperationError("The queue request could not reach the server. The operation outcome is unknown; check diagnostics before retrying.");
      setError("Show state is unconfirmed because the operation response could not be reached. Refresh before making another ordinary change.");
      return null;
    } finally {
      mutationInFlightRef.current = Math.max(0, mutationInFlightRef.current - 1);
    }
  }

  async function startSession() {
    if (startLocked) return;
    if (priorityUpgradesEnabled && priorityUpgradePriceCents <= 0) {
      setPriorityStartError("Checkout requires a price above 0.");
      return;
    }
    setPriorityStartError(null);
    const paidUpgradesEnabled = priorityUpgradesEnabled && priorityUpgradePriceCents > 0;
    startRequestIdRef.current ??= typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `start-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = await post({ action: "startSession", requestId: startRequestIdRef.current, title, showDate, description, purpose, bnlPublicationStatus, trackLimitPerArtist, queueCapacity, submissionCooldownSeconds, priorityUpgradesEnabled: paidUpgradesEnabled, priorityUpgradeLabel: FIXED_PRIORITY_LABEL, priorityUpgradeInstructions: FIXED_PRIORITY_INSTRUCTIONS, priorityUpgradePriceCents, priorityUpgradeCurrency, priorityUpgradePaymentsEnabled: paidUpgradesEnabled });
    if (next?.session?.sessionId) {
      startRequestIdRef.current = null;
      if (next.warnings?.length) {
        setOperationNotice(`Session started. ${next.warnings.map((warning) => warning.message).join(" ")}`);
        return;
      }
      setOperationNotice(null);
      router.push(`/admin/queue?sessionId=${encodeURIComponent(next.session.sessionId)}`);
    }
  }

  async function endSession() {
    const sessionId = endTarget?.sessionId;
    if (!sessionId) {
      setOperationError("No broadcast was captured for this confirmation. Cancel and choose End Broadcast again.");
      return;
    }
    setEndingSession(true);
    try {
      const next = await post({ action: "archiveSession", sessionId }, { allowWhileStale: true });
      if (!next) return;
      setEndConfirmOpen(false);
      setEndTarget(null);
      await load();
    } finally {
      setEndingSession(false);
    }
  }

  function openEndConfirmation() {
    const target = captureQueueEndTarget(state?.session);
    if (!target) {
      setOperationError("The displayed queue session is no longer available. Refresh before ending the broadcast.");
      return;
    }
    setOperationError(null);
    setEndTarget(target);
    setEndConfirmOpen(true);
  }

  function cancelEndConfirmation() {
    setEndConfirmOpen(false);
    setEndTarget(null);
  }

  useEffect(() => { load(); }, []);

  const readViewState = queueAdminReadViewState(state, error);
  if (readViewState === "unavailable") {
      return <section role="alert" className="space-y-4 border border-danger/50 bg-danger/10 p-6"><p className="text-xs font-bold uppercase tracking-[0.3em] text-danger">SHOW STATE UNAVAILABLE</p><h2 className="text-2xl font-bold text-foreground">No confirmed show snapshot is available</h2><p className="text-sm text-muted">{error} This does not mean the session ended. Retry the read or open recovery diagnostics.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => load()} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent">Retry Show State</button><a href="/api/admin/queue/recovery" target="_blank" rel="noreferrer" className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Recovery Diagnostics</a></div></section>;
  }
  if (readViewState === "loading") {
    return <section role="status" aria-live="polite" className="border border-border bg-surface p-6"><p className="text-xs uppercase tracking-[0.35em] text-muted">SYNCING SHOW STATE</p><h2 className="mt-3 text-2xl font-bold text-foreground">Loading the first confirmed snapshot</h2></section>;
  }
  if (!state) return null;

  const session = state?.session;
  const readOnly = Boolean(state?.readOnly || session?.status === "archived");
  const currentSession = session && state?.isCurrentSession && !readOnly ? session : null;
  const archiveCount = (state?.sessions ?? []).filter((item) => item.status === "archived").length;
  const stale = readViewState === "stale";
  const startLocked = Boolean(currentSession) || stale;
  const queueIsOpen = Boolean(currentSession?.queueOpen);

  return (
    <div className="space-y-6">
      {error && <section role="alert" className="border border-[#ffaa00]/55 bg-[#ffaa00]/10 p-4 text-sm text-[#ffaa00]"><p className="font-bold uppercase tracking-widest">SHOW STATE STALE — LAST CONFIRMED SNAPSHOT PRESERVED</p><p className="mt-1 text-muted">{error} Ordinary mutations are paused until a fresh read succeeds. End Broadcast remains available for session {state.session?.sessionId ?? "unknown"} and will be revalidated by the server.</p>{lastConfirmedAt && <p className="mt-1 text-xs text-muted">Last confirmed: {new Date(lastConfirmedAt).toLocaleTimeString()}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => load()} className="border border-[#ffaa00]/70 px-3 py-2 text-xs uppercase tracking-widest text-[#ffaa00]">Retry Show State</button><a href="/api/admin/queue/recovery" target="_blank" rel="noreferrer" className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted">Recovery Diagnostics</a></div></section>}
      {operationError && <div role="alert" className="border border-danger/50 bg-danger/10 p-4 text-sm text-danger">{operationError}</div>}
      {operationNotice && <div role="status" className="border border-[#ffaa00]/50 bg-[#ffaa00]/10 p-4 text-sm text-[#ffaa00]">{operationNotice}</div>}
      <StartNewSession locked={startLocked} queueIsOpen={queueIsOpen} onCloseSubmissions={() => post({ action: "setOpen", isOpen: false })} onEnd={openEndConfirmation} title={title} description={description} purpose={purpose} bnlPublicationStatus={bnlPublicationStatus} trackLimitPerArtist={trackLimitPerArtist} queueCapacity={queueCapacity} onTitle={setTitle} onDescription={setDescription} onPurpose={(value) => { setPurpose(value); if (value !== "live_broadcast") setBnlPublicationStatus("private"); }} onBnlPublicationStatus={setBnlPublicationStatus} onTrackLimit={setTrackLimitPerArtist} onCapacity={setQueueCapacity} submissionCooldownSeconds={submissionCooldownSeconds} onSubmissionCooldown={setSubmissionCooldownSeconds} priorityUpgradesEnabled={priorityUpgradesEnabled} priorityUpgradePriceCents={priorityUpgradePriceCents} priorityUpgradeCurrency={priorityUpgradeCurrency} priorityStartError={priorityStartError} onPriorityEnabled={setPriorityUpgradesEnabled} onPriorityPrice={(value) => { setPriorityUpgradePriceCents(value); if (value > 0) setPriorityStartError(null); }} onStart={startSession} sessionId={currentSession?.sessionId} />
      <CurrentSession session={currentSession} controlsDisabled={stale} onPost={post} onEnd={openEndConfirmation} />
      <SessionData session={currentSession} />
      {endConfirmOpen && endTarget && createPortal(<EndSessionConfirm target={endTarget} ending={endingSession} error={operationError} onCancel={cancelEndConfirmation} onConfirm={endSession} />, document.body)}
      <ArchivePanel archiveCount={archiveCount} />
    </div>
  );
}

type StartNewSessionProps = {
  locked: boolean;
  queueIsOpen: boolean;
  onCloseSubmissions: () => void;
  onEnd: () => void;
  title: string;
  description: string;
  purpose: QueueSessionPurpose;
  bnlPublicationStatus: QueueSessionBnlPublicationStatus;
  trackLimitPerArtist: number;
  queueCapacity: number;
  submissionCooldownSeconds: number;
  priorityUpgradesEnabled: boolean;
  priorityUpgradePriceCents: number;
  priorityUpgradeCurrency: string;
  priorityStartError: string | null;
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
  onPurpose: (value: QueueSessionPurpose) => void;
  onBnlPublicationStatus: (value: QueueSessionBnlPublicationStatus) => void;
  onTrackLimit: (value: number) => void;
  onCapacity: (value: number) => void;
  onSubmissionCooldown: (value: number) => void;
  onPriorityEnabled: (value: boolean) => void;
  onPriorityPrice: (value: number) => void;
  onStart: () => void;
  sessionId?: string;
};

function StartNewSession({ locked, queueIsOpen, onCloseSubmissions, onEnd, title, description, purpose, bnlPublicationStatus, trackLimitPerArtist, queueCapacity, submissionCooldownSeconds, priorityUpgradesEnabled, priorityUpgradePriceCents, priorityUpgradeCurrency, priorityStartError, onTitle, onDescription, onPurpose, onBnlPublicationStatus, onTrackLimit, onCapacity, onSubmissionCooldown, onPriorityEnabled, onPriorityPrice, onStart, sessionId }: StartNewSessionProps) {
  const priceWarning = priorityUpgradesEnabled && priorityUpgradePriceCents <= 0 ? "Checkout requires a price above 0." : null;
  return (
    <section className={`space-y-5 border p-6 ${locked ? "border-danger/60 bg-danger/10" : "border-accent/40 bg-surface"}`}>
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-accent">Start New Session</p>
        <p className="text-sm text-muted mt-2">Create a clean BARCODE Radio session. Submissions start closed; open them from Current Session when ready.</p>
      </div>
      {locked && <div className="border border-danger/50 bg-danger/10 p-4"><p className="text-sm font-bold uppercase tracking-[0.25em] text-danger">CURRENT SESSION EXISTS</p><p className="mt-2 text-sm text-muted">Start New Session is locked while a current non-archived session exists. End/archive the current session before starting another.</p><div className="mt-3 flex flex-wrap gap-2 sm:items-center"><a href="/admin/queue" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Open Queue Control</a>{queueIsOpen && <button type="button" onClick={onCloseSubmissions} className="border border-danger/60 px-3 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Close Submissions</button>}{sessionId && <a href={`/queue/${sessionId}`} className="border border-danger/50 px-3 py-2 text-xs uppercase tracking-widest text-danger">View Public Session</a>}<button type="button" onClick={onEnd} className="border border-danger px-3 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background sm:ml-auto">End Broadcast</button></div></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Session title</span><input disabled={locked} value={title} onChange={(event) => onTitle(event.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /></label>
        <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Track limit</span><input disabled={locked} type="number" min={1} value={trackLimitPerArtist} onChange={(event) => onTrackLimit(Number(event.target.value))} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /></label>
        <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Queue capacity</span><input disabled={locked} type="number" min={1} value={queueCapacity} onChange={(event) => onCapacity(Number(event.target.value))} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /></label>
        <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Submission Delay</span><input disabled={locked} type="number" min={0} max={3600} value={submissionCooldownSeconds} onChange={(event) => onSubmissionCooldown(Math.max(0, Math.min(3600, Number(event.target.value))))} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /><span className="block text-xs text-muted">Delay between accepted submissions from the same source. Set to 0 to disable during testing.</span></label>
        <label className="space-y-2 lg:col-span-2"><span className="text-xs uppercase tracking-widest text-muted">Description / rule blurb</span><textarea disabled={locked} value={description} onChange={(event) => onDescription(event.target.value)} rows={4} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /></label>
        <section className="space-y-4 border border-cyan-300/35 bg-cyan-300/5 p-4 lg:col-span-2">
          <div><p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Session provenance / BNL boundary</p><p className="mt-1 text-sm text-muted">Native queue use never authorizes BNL context by itself. New sessions default to a quarantined rehearsal.</p></div>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Session purpose</span><select disabled={locked} value={purpose} onChange={(event) => onPurpose(event.target.value as QueueSessionPurpose)} className="w-full border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-50"><option value="rehearsal">Rehearsal</option><option value="live_broadcast">Live broadcast</option><option value="simulation">Simulation</option><option value="internal_test">Internal test</option></select></label>
            <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">BNL publication</span><select disabled={locked || purpose !== "live_broadcast"} value={bnlPublicationStatus} onChange={(event) => onBnlPublicationStatus(event.target.value as QueueSessionBnlPublicationStatus)} className="w-full border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-50"><option value="private">Private / quarantined</option><option value="runtime_only">Runtime context only</option><option value="recap_approved">Recap candidates approved</option><option value="public_copy_approved">Public copy approved</option></select></label>
          </div>
          <p className="text-xs text-muted">Rehearsal, simulation, internal-test, legacy, and unknown sessions stay private regardless of queue visibility. Publication never enables bot memory, Broadcast Memory, dossiers, or queue mutation.</p>
        </section>
        <section className="space-y-4 border border-[#ffaa00]/40 bg-[#ffaa00]/10 p-4 lg:col-span-2"><div><p className="text-xs uppercase tracking-[0.3em] text-[#ffaa00]">Priority Signal Paid Upgrades</p><p className="mt-1 text-sm text-muted">Default: ON at 1000 cents ($10.00 USD). Admin can disable paid upgrades for this session.</p></div><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)] md:items-center"><label className="flex items-center justify-between gap-3 border border-border bg-background/60 p-4 text-sm"><span><span className="block text-lg font-bold text-foreground">{priorityUpgradesEnabled ? "ON" : "OFF"}</span><span className="text-xs text-muted">Priority Signal paid upgrades</span></span><input disabled={locked} type="checkbox" checked={priorityUpgradesEnabled} onChange={(event) => onPriorityEnabled(event.target.checked)} /></label><div className="border border-border bg-background/50 p-4"><p className="text-xs uppercase tracking-widest text-muted">Display price</p><p className="mt-1 text-xl font-bold text-foreground">{formatPrice(priorityUpgradePriceCents, priorityUpgradeCurrency)}</p></div></div><label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Price</span><input disabled={locked} type="number" min={0} value={priorityUpgradePriceCents} onChange={(event) => onPriorityPrice(Math.max(0, Number(event.target.value)))} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /><span className="block text-xs text-muted">Enter cents. Example: 1000 = $10.00.</span></label>{(priceWarning || priorityStartError) && <p className="border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{priorityStartError ?? priceWarning}</p>}</section>
      </div>
      <button onClick={onStart} disabled={locked} className="border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:opacity-40">Start New Session</button>
    </section>
  );
}

function CurrentSession({ session, controlsDisabled, onPost, onEnd }: { session: QueueSessionSummary | null | undefined; controlsDisabled: boolean; onPost: (body: Record<string, unknown>) => Promise<QueueState | null>; onEnd: () => void }) {
  const [priorityEnabled, setPriorityEnabled] = useState(false);
  const [priorityPriceCents, setPriorityPriceCents] = useState(0);
  const [priorityCurrency, setPriorityCurrency] = useState("usd");
  const [sessionCooldownSeconds, setSessionCooldownSeconds] = useState(300);
  const [priorityEditing, setPriorityEditing] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [prioritySaveError, setPrioritySaveError] = useState<string | null>(null);
  const [priorityJustSaved, setPriorityJustSaved] = useState(false);

  useEffect(() => {
    if (!session) return;
    setPriorityEnabled(session.priorityUpgradePaymentsEnabled === true);
    setPriorityPriceCents(session.priorityUpgradePriceCents ?? 0);
    setPriorityCurrency(session.priorityUpgradeCurrency ?? "usd");
    setSessionCooldownSeconds(session.submissionCooldownSeconds ?? 300);
    setPrioritySaveError(null);
  }, [session]);

  async function savePrioritySettings() {
    if (controlsDisabled) return;
    const gatedPaymentsEnabled = priorityEnabled && priorityPriceCents > 0;
    setPrioritySaving(true);
    setPrioritySaveError(null);
    const cooldownNext = await onPost({ action: "updateSubmissionCooldownSettings", submissionCooldownSeconds: sessionCooldownSeconds });
    const next = cooldownNext ? await onPost({ action: "updatePriorityUpgradeSettings", enabled: gatedPaymentsEnabled, label: FIXED_PRIORITY_LABEL, instructions: FIXED_PRIORITY_INSTRUCTIONS, priceCents: priorityPriceCents, currency: priorityCurrency, paymentsEnabled: gatedPaymentsEnabled }) : null;
    setPrioritySaving(false);
    if (!next) {
      setPrioritySaveError("Session options could not be saved.");
      setPriorityEditing(true);
      return;
    }
    setPriorityJustSaved(true);
    setPriorityEditing(false);
    window.setTimeout(() => setPriorityJustSaved(false), 3500);
  }

  if (!session) {
    return (
      <section className="border border-border bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Current Session</p>
        <h2 className="mt-2 text-xl font-bold text-foreground">No session in progress.</h2>
        <p className="mt-1 text-sm text-muted">Start a new session or select an archived session below.</p>
        <a href="/admin/show-management/archive" className="mt-4 inline-flex border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Open Queue Archive</a>
      </section>
    );
  }

  return (
    <section className="border border-border bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted">// Current Broadcast Session</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">{session.title}</h2>
          <p className="mt-1 text-sm text-muted">{session.showDate} · {session.status}</p>
          <p className="mt-2 max-w-3xl text-sm text-muted">{session.description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
          <a href={`/admin/queue?sessionId=${encodeURIComponent(session.sessionId)}`} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Queue Control</a>
          <button disabled={controlsDisabled} onClick={() => onPost({ action: "setOpen", isOpen: !session.queueOpen })} className={`${session.queueOpen ? "border-danger text-danger hover:bg-danger" : "border-accent text-accent hover:bg-accent"} border px-4 py-2 text-xs uppercase tracking-widest hover:text-background disabled:cursor-not-allowed disabled:opacity-40`}>{session.queueOpen ? "Close Submissions" : "Open Submissions"}</button>
          <button onClick={onEnd} className="border border-danger/60 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">End Broadcast</button>
        </div>
      </div>

      <fieldset disabled={controlsDisabled} className="contents"><AdminQueueSessionProvenance session={session} onSave={onPost} /></fieldset>

      {priorityEditing ? (
        <section className={`space-y-5 border bg-accent/5 p-5 transition-all duration-300 ${priorityJustSaved ? "border-accent shadow-[0_0_28px_rgba(255,0,0,0.28)]" : "border-accent/40"}`}>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">Session Options</p>
            <h3 className="mt-2 text-xl font-bold text-foreground">Edit Session Options</h3>
            <p className="mt-1 text-sm text-muted">Configure session-level submission behavior and paid Priority Signal upgrades.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 block lg:col-span-2"><span className="text-xs uppercase tracking-widest text-muted">Submission Delay</span><input disabled={controlsDisabled} type="number" min={0} max={3600} value={sessionCooldownSeconds} onChange={(event) => setSessionCooldownSeconds(Math.max(0, Math.min(3600, Number(event.target.value))))} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /><span className="block text-xs text-muted">Delay between accepted submissions from the same source. Set to 0 to disable during testing.</span></label>
            <label className="flex items-center justify-between gap-3 border border-border bg-background/50 p-4 text-sm lg:col-span-2"><span><span className="block font-bold text-foreground">Priority Signal paid upgrades</span><span className="text-xs text-muted">Enables automated Stripe checkout when the price is greater than 0.</span></span><input disabled={controlsDisabled} type="checkbox" checked={priorityEnabled} onChange={(event) => setPriorityEnabled(event.target.checked)} /></label>
            <label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Priority Signal price</span><input type="number" min={0} value={priorityPriceCents} onChange={(event) => setPriorityPriceCents(Math.max(0, Number(event.target.value)))} disabled={controlsDisabled || !priorityEnabled} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /><span className="block text-xs text-muted">Enter cents. Example: 1000 = $10.00.</span></label>
            <div className="border border-border bg-background/50 p-4"><p className="text-xs uppercase tracking-widest text-muted">Current display price</p><p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(priorityPriceCents, priorityCurrency)}</p></div>
          </div>
          <p className="border border-border bg-background/50 p-3 text-sm text-muted">Saving paid upgrades with a zero price keeps checkout disabled. Only the verified Stripe webhook marks a track paid or moves it into Priority Signal.</p>
          {prioritySaveError && <p className="border border-danger/40 bg-danger/5 p-2 text-xs text-danger">{prioritySaveError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={savePrioritySettings} disabled={prioritySaving || controlsDisabled} className="border border-accent bg-accent/10 px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{prioritySaving ? "Saving…" : "Save Session Options"}</button>
            <button type="button" onClick={() => { setPrioritySaveError(null); setPriorityEditing(false); }} disabled={prioritySaving} className="border border-border px-5 py-3 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50">Cancel</button>
          </div>
        </section>
      ) : (
        <section className={`space-y-4 border bg-background/40 p-5 transition-all duration-300 ${priorityJustSaved ? "border-accent shadow-[0_0_28px_rgba(255,0,0,0.24)]" : "border-accent/40"}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent">Session Options</p>
              <h3 className="mt-2 text-xl font-bold text-foreground">Session Options</h3>
              {priorityJustSaved && <p className="mt-2 border border-accent/50 bg-accent/10 p-2 text-sm font-bold text-accent">Session options saved.</p>}
            </div>
            <button type="button" disabled={controlsDisabled} onClick={() => { setPrioritySaveError(null); setPriorityEditing(true); }} className="border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:opacity-40">Edit Session Options</button>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="border border-border bg-surface p-4"><p className="text-xs uppercase tracking-widest text-muted">Submission Delay</p><p className="mt-2 text-lg font-bold text-foreground">{session.submissionCooldownSeconds === 0 ? "Disabled" : `${session.submissionCooldownSeconds}s`}</p></div>
            <div className="border border-border bg-surface p-4"><p className="text-xs uppercase tracking-widest text-muted">Priority Signal Paid Upgrades</p><p className={session.priorityUpgradePaymentsEnabled ? "mt-2 text-lg font-bold text-accent" : "mt-2 text-lg font-bold text-muted"}>{session.priorityUpgradePaymentsEnabled ? "Enabled" : "Disabled"}</p></div>
            <div className="border border-border bg-surface p-4"><p className="text-xs uppercase tracking-widest text-muted">Price</p><p className="mt-2 text-lg font-bold text-foreground">{formatPrice(session.priorityUpgradePriceCents, session.priorityUpgradeCurrency)}</p></div>
          </div>
          <p className="border border-border bg-surface p-3 text-sm text-muted">Only the verified Stripe webhook marks a track paid or moves it into Priority Signal.</p>
        </section>
      )}

      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="border border-border p-3"><p className="text-xs text-muted">Submissions</p><p className={session.queueOpen ? "text-accent" : "text-danger"}>{session.queueOpen ? "Open" : "Closed"}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Accepted / Capacity</p><p>{session.acceptedCount ?? session.activeCount}/{session.queueCapacity}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Completed</p><p>{session.completedCount}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Removed</p><p>{session.removedCount}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Spotlight</p><p>{session.spotlightCount}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Track limit</p><p>{session.trackLimitPerArtist}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Submission Delay</p><p>{session.submissionCooldownSeconds === 0 ? "Disabled" : `${session.submissionCooldownSeconds}s`}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Active runtime</p><p>{formatRuntime(session.estimatedActiveRuntimeSeconds)}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{formatRuntime(session.completedRuntimeSeconds)}</p></div>
      </div>
    </section>
  );
}

function EndSessionConfirm({ target, ending, error, onCancel, onConfirm }: { target: { sessionId: string; title: string; showDate: string }; ending: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="show-end-session-confirm-title" className="w-full max-w-md border border-danger/50 bg-background p-5 shadow-[0_0_70px_rgba(255,0,0,0.24)]"><p className="text-xs uppercase tracking-[0.35em] text-danger">End Broadcast</p><h2 id="show-end-session-confirm-title" className="mt-3 text-2xl font-bold text-foreground">End this broadcast?</h2><p className="mt-2 text-sm text-muted">This stops routing, closes submissions, and moves the captured broadcast session to the archive.</p><p className="mt-3 border border-border bg-surface p-3 text-sm text-foreground"><span className="block font-bold">{target.title}</span><span className="block text-xs text-muted">{target.showDate} · {target.sessionId}</span></p>{error && <p role="alert" className="mt-4 border border-danger/50 bg-danger/10 p-3 text-sm text-danger">{error}</p>}<div className="mt-5 flex flex-wrap justify-end gap-2"><a href="/admin/queue" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Return to Queue Dashboard</a><button type="button" onClick={onCancel} disabled={ending} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">No, Cancel</button><button type="button" onClick={onConfirm} disabled={ending} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background disabled:opacity-50">{ending ? "Ending…" : "Yes, End Broadcast"}</button></div></div></div>;
}


function SessionData({ session }: { session: QueueSessionSummary | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SubmitterRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function viewList() {
    if (!session) return;
    setOpen(true);
    setLoading(true);
    const res = await fetch(`/api/admin/queue/export?sessionId=${encodeURIComponent(session.sessionId)}&format=json`, { cache: "no-store" });
    if (res.ok) {
      const payload = await res.json();
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
    }
    setLoading(false);
  }

  if (!session) return null;
  return <section className="border border-border bg-surface p-6 space-y-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Session Data / Submission Export</p><p className="text-sm text-muted mt-2">Admin-only submitter/contact data for this session. Private contact fields are not exposed publicly.</p></div><div className="flex flex-wrap gap-2"><button onClick={viewList} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">View Submitter List</button><a href={exportHref(session.sessionId)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Download CSV</a></div></div>{open && <div className="overflow-x-auto border border-border bg-background/40"><table className="min-w-full text-left text-xs"><thead className="text-muted"><tr><th className="p-2">Submitter</th><th className="p-2">Display Artist</th><th className="p-2">Song</th><th className="p-2">TikTok</th><th className="p-2">Email/contact</th><th className="p-2">Status</th><th className="p-2">Lane</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="p-3 text-muted">Loading submitter list…</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="p-3 text-muted">No submissions found for this session.</td></tr> : rows.map((row, index) => <tr key={`${row.sessionId}-${row.sourceLink}-${index}`} className="border-t border-border/60"><td className="p-2">{row.submitterArtistName}</td><td className="p-2">{row.submittedArtistName}</td><td className="p-2">{row.submittedSongTitle}</td><td className="p-2">{row.tiktokHandle || "—"}</td><td className="p-2">{row.contactEmail || "—"}</td><td className="p-2">{row.status}</td><td className="p-2">{row.lane}{row.spotlight ? " · spotlight" : ""}</td></tr>)}</tbody></table></div>}</section>;
}


function ArchivePanel({ archiveCount }: { archiveCount: number }) {
  return <section className="border border-border bg-surface p-5 space-y-3"><p className="text-xs uppercase tracking-[0.35em] text-muted">// Queue Archive</p><p className="text-sm text-muted">Archived sessions are managed from a dedicated page to keep Show Management focused on live operations.</p><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-foreground">Archived sessions: <span className="font-bold">{archiveCount}</span></p><a href="/admin/show-management/archive" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Queue Archive</a></div></section>;
}
