/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AdminQueueSessionProvenance } from "@/components/AdminQueueSessionProvenance";
import { formatRuntime } from "@/lib/queue-types";
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

function todayDate(): string { return new Date().toISOString().slice(0, 10); }
function defaultDescription(date: string): string { return SESSION_DESCRIPTION_OPTIONS[[...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % SESSION_DESCRIPTION_OPTIONS.length]; }
function exportHref(sessionId?: string): string { return `/api/admin/queue/export${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`; }
function formatPrice(cents: number, currency = "usd"): string { return `${new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(Math.max(0, cents) / 100)} ${currency.toUpperCase()}`; }
const FIXED_PRIORITY_LABEL = "Priority Signal Upgrade";
const FIXED_PRIORITY_INSTRUCTIONS = "Moves this track into the Priority Signal lane after payment confirmation.";

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
  const [endingSession, setEndingSession] = useState(false);
  const router = useRouter();

  async function load(sessionId?: string) {
    const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const res = await fetch(`/api/admin/queue${suffix}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "Admin authentication required. Log in at /admin first." : "Show management unavailable.");
      return;
    }
    setError(null);
    setState(await res.json());
  }

  async function post(body: Record<string, unknown>): Promise<QueueState | null> {
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const next = await res.json();
    setState(next);
    return next;
  }

  async function startSession() {
    if (startLocked) return;
    if (priorityUpgradesEnabled && priorityUpgradePriceCents <= 0) {
      setPriorityStartError("Checkout requires a price above 0.");
      return;
    }
    setPriorityStartError(null);
    const paidUpgradesEnabled = priorityUpgradesEnabled && priorityUpgradePriceCents > 0;
    const next = await post({ action: "startSession", title, showDate, description, purpose, bnlPublicationStatus, trackLimitPerArtist, queueCapacity, submissionCooldownSeconds, priorityUpgradesEnabled: paidUpgradesEnabled, priorityUpgradeLabel: FIXED_PRIORITY_LABEL, priorityUpgradeInstructions: FIXED_PRIORITY_INSTRUCTIONS, priorityUpgradePriceCents, priorityUpgradeCurrency, priorityUpgradePaymentsEnabled: paidUpgradesEnabled });
    if (next?.session?.sessionId) router.push(`/admin/queue?sessionId=${encodeURIComponent(next.session.sessionId)}`);
  }

  async function endSession() {
    setEndingSession(true);
    await post({ action: "archiveSession" });
    setEndConfirmOpen(false);
    setEndingSession(false);
    await load();
  }

  useEffect(() => { load(); }, []);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;

  const session = state?.session;
  const readOnly = Boolean(state?.readOnly || session?.status === "archived");
  const currentSession = session && state?.isCurrentSession && !readOnly ? session : null;
  const archiveCount = (state?.sessions ?? []).filter((item) => item.status === "archived").length;
  const startLocked = Boolean(currentSession);
  const queueIsOpen = Boolean(currentSession?.queueOpen);

  return (
    <div className="space-y-6">
      <StartNewSession locked={startLocked} queueIsOpen={queueIsOpen} onCloseSubmissions={() => post({ action: "setOpen", isOpen: false })} onEnd={() => setEndConfirmOpen(true)} title={title} description={description} purpose={purpose} bnlPublicationStatus={bnlPublicationStatus} trackLimitPerArtist={trackLimitPerArtist} queueCapacity={queueCapacity} onTitle={setTitle} onDescription={setDescription} onPurpose={(value) => { setPurpose(value); if (value !== "live_broadcast") setBnlPublicationStatus("private"); }} onBnlPublicationStatus={setBnlPublicationStatus} onTrackLimit={setTrackLimitPerArtist} onCapacity={setQueueCapacity} submissionCooldownSeconds={submissionCooldownSeconds} onSubmissionCooldown={setSubmissionCooldownSeconds} priorityUpgradesEnabled={priorityUpgradesEnabled} priorityUpgradePriceCents={priorityUpgradePriceCents} priorityUpgradeCurrency={priorityUpgradeCurrency} priorityStartError={priorityStartError} onPriorityEnabled={setPriorityUpgradesEnabled} onPriorityPrice={(value) => { setPriorityUpgradePriceCents(value); if (value > 0) setPriorityStartError(null); }} onStart={startSession} sessionId={currentSession?.sessionId} />
      <CurrentSession session={currentSession} onPost={post} onEnd={() => setEndConfirmOpen(true)} />
      <SessionData session={currentSession} />
      {endConfirmOpen && createPortal(<EndSessionConfirm ending={endingSession} onCancel={() => setEndConfirmOpen(false)} onConfirm={endSession} />, document.body)}
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

function CurrentSession({ session, onPost, onEnd }: { session: QueueSessionSummary | null | undefined; onPost: (body: Record<string, unknown>) => Promise<QueueState | null>; onEnd: () => void }) {
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
          <button onClick={() => onPost({ action: "setOpen", isOpen: !session.queueOpen })} className={`${session.queueOpen ? "border-danger text-danger hover:bg-danger" : "border-accent text-accent hover:bg-accent"} border px-4 py-2 text-xs uppercase tracking-widest hover:text-background`}>{session.queueOpen ? "Close Submissions" : "Open Submissions"}</button>
          <button onClick={onEnd} className="border border-danger/60 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">End Broadcast</button>
        </div>
      </div>

      <AdminQueueSessionProvenance session={session} onSave={onPost} />

      {priorityEditing ? (
        <section className={`space-y-5 border bg-accent/5 p-5 transition-all duration-300 ${priorityJustSaved ? "border-accent shadow-[0_0_28px_rgba(255,0,0,0.28)]" : "border-accent/40"}`}>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">Session Options</p>
            <h3 className="mt-2 text-xl font-bold text-foreground">Edit Session Options</h3>
            <p className="mt-1 text-sm text-muted">Configure session-level submission behavior and paid Priority Signal upgrades.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 block lg:col-span-2"><span className="text-xs uppercase tracking-widest text-muted">Submission Delay</span><input type="number" min={0} max={3600} value={sessionCooldownSeconds} onChange={(event) => setSessionCooldownSeconds(Math.max(0, Math.min(3600, Number(event.target.value))))} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /><span className="block text-xs text-muted">Delay between accepted submissions from the same source. Set to 0 to disable during testing.</span></label>
            <label className="flex items-center justify-between gap-3 border border-border bg-background/50 p-4 text-sm lg:col-span-2"><span><span className="block font-bold text-foreground">Priority Signal paid upgrades</span><span className="text-xs text-muted">Enables automated Stripe checkout when the price is greater than 0.</span></span><input type="checkbox" checked={priorityEnabled} onChange={(event) => setPriorityEnabled(event.target.checked)} /></label>
            <label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Priority Signal price</span><input type="number" min={0} value={priorityPriceCents} onChange={(event) => setPriorityPriceCents(Math.max(0, Number(event.target.value)))} disabled={!priorityEnabled} className="w-full bg-background border border-border px-3 py-2.5 text-sm disabled:opacity-50" /><span className="block text-xs text-muted">Enter cents. Example: 1000 = $10.00.</span></label>
            <div className="border border-border bg-background/50 p-4"><p className="text-xs uppercase tracking-widest text-muted">Current display price</p><p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(priorityPriceCents, priorityCurrency)}</p></div>
          </div>
          <p className="border border-border bg-background/50 p-3 text-sm text-muted">Saving paid upgrades with a zero price keeps checkout disabled. Only the verified Stripe webhook marks a track paid or moves it into Priority Signal.</p>
          {prioritySaveError && <p className="border border-danger/40 bg-danger/5 p-2 text-xs text-danger">{prioritySaveError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={savePrioritySettings} disabled={prioritySaving} className="border border-accent bg-accent/10 px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{prioritySaving ? "Saving…" : "Save Session Options"}</button>
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
            <button type="button" onClick={() => { setPrioritySaveError(null); setPriorityEditing(true); }} className="border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Edit Session Options</button>
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
        <div className="border border-border p-3"><p className="text-xs text-muted">Active / Capacity</p><p>{session.activeCount}/{session.queueCapacity}</p></div>
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

function EndSessionConfirm({ ending, onCancel, onConfirm }: { ending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md border border-danger/50 bg-background p-5 shadow-[0_0_70px_rgba(255,0,0,0.24)]"><p className="text-xs uppercase tracking-[0.35em] text-danger">End Broadcast</p><h2 className="mt-3 text-2xl font-bold text-foreground">End this broadcast?</h2><p className="mt-2 text-sm text-muted">This stops routing, closes submissions, and moves the broadcast session to the archive.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><a href="/admin/queue" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Return to Queue Dashboard</a><button type="button" onClick={onCancel} disabled={ending} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">No, Cancel</button><button type="button" onClick={onConfirm} disabled={ending} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background disabled:opacity-50">{ending ? "Ending…" : "Yes, End Broadcast"}</button></div></div></div>;
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
