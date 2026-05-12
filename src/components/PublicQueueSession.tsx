/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react/jsx-no-comment-textnodes, @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { RadioQueueForm } from "@/components/RadioQueueForm";
import { externalLinks } from "@/content";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicTrack } from "@/lib/queue-types";

type QueueView = "active" | "recent";
type ActivityTone = "red" | "amber" | "gold" | "cyan" | "archive" | "danger";
type QueueActivity = { id: string; text: string; detail: string; tone: ActivityTone; createdAt: number };
type ResidueMap = Record<string, { tone: ActivityTone; nonce: number }>;

const PRIORITY_SIGNAL_LABEL = "Priority Signal Upgrade";
const PRIORITY_SIGNAL_EXPLANATION = "Moves this track into the Priority Signal lane after payment confirmation.";
const MIN_PRIORITY_ACTIVE_DEPTH = 2;

function stableHash(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash;
}

function stableVariant<T>(seed: string, variants: T[]): T {
  return variants[stableHash(seed) % variants.length] ?? variants[0];
}

function pressureLevel(snapshot: QueuePublicSnapshot | null): "low" | "medium" | "high" {
  if (!snapshot) return "low";
  if (snapshot.status.pressure === "high" || snapshot.status.pressure === "max") return "high";
  if (snapshot.status.pressure === "medium") return "medium";
  const ratio = snapshot.status.capacity > 0 ? snapshot.status.activeCount / snapshot.status.capacity : 0;
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

type PublicActionVariant = { label: string; detail: string; mode: string; kind: "intake" | "payment" };

function actionVariant(seed: string, kind: "intake" | "upgrade" | "resume"): PublicActionVariant {
  const variants: Record<"intake" | "upgrade" | "resume", PublicActionVariant[]> = {
    intake: [
      { label: "ENTERING INTAKE CORRIDOR", detail: "SESSION HANDOFF IN PROGRESS", mode: "CORRIDOR UNLOCK", kind: "intake" },
      { label: "ENTERING INTAKE CORRIDOR", detail: "PACKET GATE OPENING", mode: "PACKET GATE", kind: "intake" },
      { label: "ENTERING INTAKE CORRIDOR", detail: "SIGNAL TUNNEL ALIGNING", mode: "SIGNAL TUNNEL", kind: "intake" },
    ],
    upgrade: [
      { label: "PRIORITY RELAY REQUESTED", detail: "OPENING SECURE CHECKOUT", mode: "PAYMENT CONFIRMATION REQUIRED", kind: "payment" },
      { label: "PRIORITY RELAY REQUESTED", detail: "SECURE STRIPE HANDSHAKE", mode: "PAYMENT CONFIRMATION REQUIRED", kind: "payment" },
    ],
    resume: [
      { label: "RESUMING SECURE CHECKOUT", detail: "PRIORITY RELAY STILL PENDING", mode: "PAYMENT CONFIRMATION REQUIRED", kind: "payment" },
      { label: "RESUMING SECURE CHECKOUT", detail: "PENDING RELAY HANDSHAKE", mode: "PAYMENT CONFIRMATION REQUIRED", kind: "payment" },
    ],
  };
  return stableVariant(`${seed}:${kind}`, variants[kind]);
}
function formatPrice(cents: number, currency = "usd"): string { return `${new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(Math.max(0, cents) / 100)} ${currency.toUpperCase()}`; }
function sourceTypeLabel(track: QueuePublicTrack): string {
  if (track.sourceType === "upload") return "Uploaded audio packet";
  if (track.sourceType === "spotify") return "Spotify";
  if (track.sourceType === "soundcloud") return "SoundCloud";
  if (track.sourceType === "youtube") return "YouTube";
  return track.sourceType ? track.sourceType.toUpperCase() : "Track link";
}

export function PublicQueueSession({ sessionId }: { sessionId: string }) {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [intakeScrollLocked, setIntakeScrollLocked] = useState(false);
  const [lastSubmittedTrackId, setLastSubmittedTrackId] = useState<string | null>(null);
  const [submitterToken, setSubmitterToken] = useState("");
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [view, setView] = useState<QueueView>("active");
  const [mounted, setMounted] = useState(false);
  const [priorityModalTrack, setPriorityModalTrack] = useState<QueuePublicTrack | null>(null);
  const [priorityRequestPending, setPriorityRequestPending] = useState(false);
  const [priorityRequestMessage, setPriorityRequestMessage] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [actionTransition, setActionTransition] = useState<PublicActionVariant | null>(null);
  const [activity, setActivity] = useState<QueueActivity[]>([]);
  const [activityToast, setActivityToast] = useState<QueueActivity | null>(null);
  const [residueMap, setResidueMap] = useState<ResidueMap>({});
  const previousSnapshotRef = useRef<QueuePublicSnapshot | null>(null);

  function triggerResidue(trackId: string | null | undefined, tone: ActivityTone) {
    if (!trackId) return;
    const nonce = Date.now();
    setResidueMap((current) => ({ ...current, [trackId]: { tone, nonce } }));
    window.setTimeout(() => {
      setResidueMap((current) => current[trackId]?.nonce === nonce ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== trackId)) as ResidueMap : current);
    }, 1050);
  }

  function pushActivities(items: Omit<QueueActivity, "id" | "createdAt">[]) {
    if (items.length === 0) return;
    const createdAt = Date.now();
    const nextItems = items.map((item, index) => ({ ...item, id: `${createdAt}:${index}:${item.text}`, createdAt }));
    setActivity((current) => [...nextItems, ...current].slice(0, 6));
    setActivityToast(nextItems[0] ?? null);
    window.setTimeout(() => setActivityToast((current) => current?.id === nextItems[0]?.id ? null : current), 3200);
  }

  function processSnapshotChanges(previous: QueuePublicSnapshot | null, next: QueuePublicSnapshot) {
    if (!previous) return;
    const changes: Omit<QueueActivity, "id" | "createdAt">[] = [];
    const previousTracks = publicTrackStateMap(previous);
    if (previous.status.isOpen !== next.status.isOpen) {
      changes.push(next.status.isOpen ? { text: "Submissions opened", detail: "Intake corridor unlocked.", tone: "red" } : { text: "Submissions closed", detail: "Intake gate sealed.", tone: "danger" });
    }
    if (previous.nowPlaying?.id !== next.nowPlaying?.id && next.nowPlaying) {
      changes.push({ text: "Now Playing updated", detail: "Host loaded a transmission.", tone: trackTone(next.nowPlaying) });
      triggerResidue(next.nowPlaying.id, trackTone(next.nowPlaying));
    }
    if (previous.upNext?.id !== next.upNext?.id && next.upNext) {
      changes.push({ text: "Next In Line updated", detail: "Resolver selected the next transmission.", tone: trackTone(next.upNext) });
      triggerResidue(next.upNext.id, trackTone(next.upNext));
    }
    for (const track of next.queue) {
      const before = previousTracks.get(track.id);
      if (!before) {
        changes.push({ text: "Transmission Accepted", detail: "Free Transmission packet routed into the intake corridor.", tone: "red" });
        triggerResidue(track.id, "red");
        continue;
      }
      if (before.lane !== track.lane && track.lane === "wheel") {
        changes.push({ text: "Wheel Chosen", detail: "Alternate cyan route selected.", tone: "cyan" });
        triggerResidue(track.id, "cyan");
      }
      if (before.priorityUpgradeStatus !== track.priorityUpgradeStatus) {
        if (track.priorityUpgradeStatus === "checkout_pending") {
          changes.push({ text: "Payment Processing", detail: "Authorization handshake unresolved; transmission is still Free.", tone: "amber" });
          triggerResidue(track.id, "amber");
        }
        if (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual") {
          changes.push({ text: "Priority Signal confirmed", detail: "Transmission promoted by verified payment.", tone: "gold" });
          triggerResidue(track.id, "gold");
        }
        if (track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded") {
          changes.push({ text: "Priority Signal not completed", detail: "Payment was not confirmed.", tone: "danger" });
          triggerResidue(track.id, "danger");
        }
      }
    }
    const previousCompleted = new Set(previous.completed.map((track) => track.id));
    for (const track of next.completed) {
      if (!previousCompleted.has(track.id)) {
        changes.push({ text: "Played Tonight", detail: "Transmission archived after playback.", tone: "archive" });
        triggerResidue(track.id, "archive");
      }
    }
    const previousActive = new Set([previous.nowPlaying?.id, previous.upNext?.id, ...previous.queue.map((track) => track.id)].filter(Boolean));
    const nextKnown = new Set([next.nowPlaying?.id, next.upNext?.id, ...next.queue.map((track) => track.id), ...next.completed.map((track) => track.id)].filter(Boolean));
    const removedCountIncreased = (next.session.removedCount ?? 0) > (previous.session.removedCount ?? 0);
    if (removedCountIncreased && [...previousActive].some((id) => !nextKnown.has(id))) {
      changes.push({ text: "Removed from active queue", detail: "Transmission no longer active.", tone: "danger" });
    }
    pushActivities(dedupeActivities(changes).slice(0, 4));
  }

  async function load() {
    const params = new URLSearchParams({ sessionId });
    if (submitterToken) params.set("submitterToken", submitterToken);
    const res = await fetch(`/api/queue?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const next = await res.json() as QueuePublicSnapshot;
      processSnapshotChanges(previousSnapshotRef.current, next);
      previousSnapshotRef.current = next;
      setSnapshot(next);
      setCooldownRemaining(next.submitterStatus?.cooldownRemainingSeconds ?? 0);
    }
  }

  useEffect(() => {
    setMounted(true);
    setSubmitterToken(window.localStorage.getItem("barcode-radio-submitter-token") ?? "");
    const priorityResult = new URLSearchParams(window.location.search).get("priority");
    if (priorityResult === "cancelled") setCheckoutNotice("Payment was not completed. Your track remains in Free Transmissions.");
    if (priorityResult === "processing") setCheckoutNotice("Payment confirmation may take a moment. Priority Signal placement activates after payment confirmation.");
  }, []);
  useEffect(() => { load(); const interval = setInterval(load, 5_000); return () => clearInterval(interval); }, [sessionId, submitterToken]);
  useEffect(() => { if (cooldownRemaining <= 0) return; const timer = window.setInterval(() => setCooldownRemaining((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [cooldownRemaining]);
  useEffect(() => {
    if (!submitOpen || !intakeScrollLocked) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [submitOpen, intakeScrollLocked]);

  const lanes = useMemo(() => {
    const hidden = new Set([snapshot?.nowPlaying?.id, snapshot?.upNext?.id].filter(Boolean));
    const queue = (snapshot?.queue ?? []).filter((track) => !hidden.has(track.id));
    const paidPriority = (track: typeof queue[number]) => track.lane === "priority" && (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual");
    return {
      priority: queue.filter(paidPriority),
      wheel: queue.filter((track) => track.lane === "wheel"),
      regular: queue.filter((track) => track.lane === "regular" || (track.lane === "priority" && !paidPriority(track))),
    };
  }, [snapshot]);

  const isOpen = snapshot?.status.isOpen ?? false;
  const isEnded = snapshot?.session.status === "archived" || snapshot?.session.broadcastPhase === "ended";
  const isBroadcastActive = Boolean(snapshot?.nowPlaying || snapshot?.session.broadcastPhase === "broadcast_active" || snapshot?.session.showStarted);
  const isFull = Boolean(snapshot?.status.isFull || (snapshot && snapshot.status.activeCount >= snapshot.status.capacity));
  const canSubmit = !isEnded && isOpen && !isFull;
  const completedRuntime = snapshot?.session.completedRuntimeSeconds ?? 0;
  const priorityUpgradeEnabled = snapshot?.session.priorityUpgradesEnabled === true;
  const priorityPaymentsEnabled = snapshot?.session.priorityUpgradePaymentsEnabled === true && (snapshot?.session.priorityUpgradePriceCents ?? 0) > 0;
  const priorityPaymentsAvailable = priorityUpgradeEnabled && priorityPaymentsEnabled;
  const priorityUpgradeAvailable = priorityPaymentsAvailable && (snapshot?.status.activeCount ?? 0) >= MIN_PRIORITY_ACTIVE_DEPTH;
  const priorityPriceCents = snapshot?.session.priorityUpgradePriceCents ?? 0;
  const priorityCurrency = snapshot?.session.priorityUpgradeCurrency ?? "usd";

  const frontEdgeFreeTrackId = lanes.priority.length === 0 && lanes.wheel.length === 0 ? lanes.regular[0]?.id ?? null : null;

  function canShowPriorityUpgrade(track: QueuePublicTrack): boolean {
    if (!priorityUpgradeAvailable || isEnded || snapshot?.session.status !== "open") return false;
    if (track.lane !== "regular") return false;
    if (track.id === snapshot?.nowPlaying?.id || track.id === snapshot?.upNext?.id) return false;
    if (track.id === frontEdgeFreeTrackId) return false;
    return track.priorityUpgradeStatus === undefined || track.priorityUpgradeStatus === "none" || track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded";
  }

  function canResumePriorityPayment(track: QueuePublicTrack): boolean {
    if (!priorityPaymentsAvailable || isEnded || snapshot?.session.status !== "open") return false;
    return track.priorityUpgradeStatus === "checkout_pending";
  }

  function runPublicActionTransition(transition: PublicActionVariant, action: () => void, delay = 620) {
    setActionTransition(transition);
    window.setTimeout(() => {
      setActionTransition(null);
      action();
    }, delay);
  }

  function openIntakeCorridor() {
    runPublicActionTransition(actionVariant(sessionId, "intake"), () => { setIntakeScrollLocked(true); setSubmitOpen(true); });
  }

  function requestPriorityUpgrade(track: QueuePublicTrack) {
    runPublicActionTransition(actionVariant(`${sessionId}:${track.id}`, "upgrade"), () => {
      setPriorityModalTrack(track);
      setPriorityRequestMessage(null);
      if (!priorityUpgradeAvailable) setPriorityRequestMessage("Priority Signal upgrades unavailable.");
    });
  }

  async function beginPriorityCheckout(track: QueuePublicTrack) {
    if (track.priorityUpgradeStatus !== "checkout_pending" && !priorityUpgradeAvailable) {
      setPriorityRequestMessage("Priority Signal upgrades unavailable.");
      return;
    }
    if (track.priorityUpgradeStatus === "checkout_pending" && !priorityPaymentsAvailable) {
      setPriorityRequestMessage("Priority Signal upgrades unavailable.");
      return;
    }
    setPriorityRequestPending(true);
    const res = await fetch("/api/queue/priority-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id, sessionId }) });
    const payload = await res.json().catch(() => ({}));
    setPriorityRequestPending(false);
    if (res.ok && typeof payload.url === "string") {
      setPriorityRequestMessage(payload.message ?? "Payment confirmation may take a moment.");
      window.location.href = payload.url;
      return;
    }
    setPriorityRequestMessage(payload.error ?? "Priority Signal checkout is not available right now.");
    await load();
  }

  async function resumePriorityPayment(track: QueuePublicTrack) {
    setPriorityModalTrack(null);
    setPriorityRequestMessage(null);
    setActionTransition(actionVariant(`${sessionId}:${track.id}`, "resume"));
    window.setTimeout(() => setActionTransition(null), 650);
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    await beginPriorityCheckout(track);
  }

  if (isEnded) {
    return <div className="space-y-8"><section className="border border-border bg-surface p-6 space-y-4"><p className="text-xs uppercase tracking-[0.35em] text-danger">SESSION ENDED</p><h2 className="text-3xl font-bold text-foreground">{snapshot?.session.title ?? "BARCODE Radio"}</h2><p className="text-sm text-muted">This transmission window has collapsed. Temporal alignment for this broadcast has expired. Review the completed signal log below.</p><div className="grid gap-3 sm:grid-cols-3 text-sm"><div className="border border-border p-3"><p className="text-xs text-muted">Show date</p><p>{snapshot?.session.showDate ?? "—"}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed tracks</p><p>{snapshot?.session.completedCount ?? snapshot?.completed.length ?? 0}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{snapshot ? formatRuntime(completedRuntime) : "—"}</p></div></div></section><PublicLane title="Completed Signal Log" tracks={snapshot?.completed ?? []} lastSubmittedTrackId={null} canPriorityUpgrade={() => false} canResumePriorityPayment={() => false} priorityPriceCents={0} priorityCurrency="usd" onPriorityUpgrade={() => {}} onPriorityPayment={() => {}} /></div>;
  }

  return (
    <div className="space-y-6">
      {checkoutNotice && <div className="border border-[#ffaa00]/40 bg-[#ffaa00]/5 p-3 text-sm text-[#ffaa00]">{checkoutNotice}</div>}

      <SessionPhasePanel snapshot={snapshot} canSubmit={canSubmit} isBroadcastActive={isBroadcastActive} />

      <TransmissionActivity items={activity} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div id="broadcast-queue-top"><NowPlaying title="Now Playing" track={snapshot?.nowPlaying ?? null} domId="now-playing-slot" lastSubmittedTrackId={lastSubmittedTrackId} residue={snapshot?.nowPlaying?.id ? residueMap[snapshot.nowPlaying.id] : undefined} /></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <NowPlaying title="Up Next" track={snapshot?.upNext ?? null} compact domId="up-next-slot" lastSubmittedTrackId={lastSubmittedTrackId} residue={snapshot?.upNext?.id ? residueMap[snapshot.upNext.id] : undefined} />
          <QueueStatusPanel snapshot={snapshot} canSubmit={canSubmit} isFull={isFull} onSubmit={openIntakeCorridor} />
        </div>
      </section>

      {isFull && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">This broadcast queue is full for new transmissions.</p>}

      <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <SubmitterStatusPanel status={snapshot?.submitterStatus ?? null} cooldownRemaining={cooldownRemaining} />
        <QueueMechanicsInfo />
      </div>

      <div className="flex gap-2 border-b border-border">
        <button type="button" onClick={() => setView("active")} className={`px-4 py-3 text-xs uppercase tracking-widest ${view === "active" ? "border-b border-accent text-accent" : "text-muted"}`}>Active Queue</button>
        <button type="button" onClick={() => setView("recent")} className={`px-4 py-3 text-xs uppercase tracking-widest ${view === "recent" ? "border-b border-accent text-accent" : "text-muted"}`}>Recently Played</button>
      </div>

      {view === "active" ? <div id="active-queue-panel" className="space-y-3"><PublicLane title="Priority Signal" tracks={lanes.priority} lastSubmittedTrackId={lastSubmittedTrackId} collapsible domId="priority-lane" canPriorityUpgrade={() => false} canResumePriorityPayment={canResumePriorityPayment} priorityPriceCents={priorityPriceCents} priorityCurrency={priorityCurrency} onPriorityUpgrade={requestPriorityUpgrade} onPriorityPayment={resumePriorityPayment} residueMap={residueMap} /><PublicLane title="Wheel Chosen" subtitle="Tracks selected by the 10K tap wheel." tracks={lanes.wheel} lastSubmittedTrackId={lastSubmittedTrackId} collapsible domId="wheel-lane" canPriorityUpgrade={() => false} canResumePriorityPayment={canResumePriorityPayment} priorityPriceCents={priorityPriceCents} priorityCurrency={priorityCurrency} onPriorityUpgrade={requestPriorityUpgrade} onPriorityPayment={resumePriorityPayment} residueMap={residueMap} /><PublicLane title="Free Transmissions" tracks={lanes.regular} lastSubmittedTrackId={lastSubmittedTrackId} domId="free-transmissions-lane" canPriorityUpgrade={canShowPriorityUpgrade} canResumePriorityPayment={canResumePriorityPayment} priorityPriceCents={priorityPriceCents} priorityCurrency={priorityCurrency} onPriorityUpgrade={requestPriorityUpgrade} onPriorityPayment={resumePriorityPayment} residueMap={residueMap} /></div> : <PublicLane title="Recently Played" tracks={snapshot?.completed ?? []} lastSubmittedTrackId={null} canPriorityUpgrade={() => false} canResumePriorityPayment={() => false} priorityPriceCents={priorityPriceCents} priorityCurrency={priorityCurrency} onPriorityUpgrade={requestPriorityUpgrade} onPriorityPayment={resumePriorityPayment} residueMap={residueMap} />}

      <DiscordQueueCTA />

      {mounted && activityToast && createPortal(<QueueUpdateToast item={activityToast} />, document.body)}

      {mounted && actionTransition && createPortal(<NavigationTransition {...actionTransition} />, document.body)}

      {mounted && priorityModalTrack && createPortal(<PriorityUpgradeModal track={priorityModalTrack} price={formatPrice(priorityPriceCents, priorityCurrency)} pending={priorityRequestPending} message={priorityRequestMessage} onConfirm={() => beginPriorityCheckout(priorityModalTrack)} onClose={() => setPriorityModalTrack(null)} />, document.body)}

      {mounted && submitOpen && createPortal(<div className="fixed inset-0 z-[10000] grid place-items-center overscroll-contain bg-black/75 p-2 backdrop-blur-md"><div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[920px] flex-col overflow-hidden border border-accent/50 bg-background/95 p-3 shadow-[0_0_70px_rgba(255,0,0,0.22)]"><div className="mb-2 flex shrink-0 items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.35em] text-accent">Transmission Intake</p><p className="mt-0.5 text-[11px] text-muted">Queue remains locked behind this terminal while you route your signal.</p></div><button type="button" onClick={() => { setSubmitOpen(false); setIntakeScrollLocked(false); }} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted">Collapse Intake</button></div><div className="overflow-y-auto pr-1"><RadioQueueForm sessionId={sessionId} onCancel={() => { setSubmitOpen(false); setIntakeScrollLocked(false); }} onSubmitted={(trackId, phase, targetId) => { setLastSubmittedTrackId(trackId ?? null); setSubmitterToken(window.localStorage.getItem("barcode-radio-submitter-token") ?? ""); setView("active"); if (phase === "resolved") { setIntakeScrollLocked(false); load(); window.setTimeout(() => document.getElementById(targetId ?? "active-queue-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 250); } if (phase === "complete") { setSubmitOpen(false); setIntakeScrollLocked(false); load(); } }} /></div></div></div>, document.body)}
    </div>
  );
}

function NavigationTransition({ label, detail, mode, kind }: PublicActionVariant) {
  return <div data-kind={kind} className="nav-action-overlay fixed inset-0 z-[120000] grid place-items-center bg-black/86 p-4 text-center backdrop-blur-sm" role="status" aria-live="polite"><div className="nav-action-lines pointer-events-none absolute inset-0" aria-hidden="true">{Array.from({ length: 10 }).map((_, index) => <span key={index} />)}</div><div className="nav-action-panel relative w-full max-w-xl overflow-hidden border border-accent/50 bg-background/92 p-6 shadow-[0_0_90px_rgba(255,0,0,0.24)]"><div className="nav-action-aperture mx-auto mb-5" aria-hidden="true"><span /><span /><span /></div><p className="text-xs uppercase tracking-[0.4em] text-accent">{label}</p><h2 className="mt-3 text-2xl font-bold text-foreground">{detail}</h2><p className="mt-2 text-xs uppercase tracking-[0.25em] text-muted">{mode} · {kind === "payment" ? "SECURE RELAY APERTURE" : "SESSION PORTAL HANDOFF"}</p>{kind === "payment" && <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[#ffaa00]">Payment confirmation required before Priority is confirmed.</p>}<div className="mt-5 grid grid-cols-8 gap-1" aria-hidden="true">{Array.from({ length: 16 }).map((_, index) => <span key={index} className="nav-action-bit h-8 border border-accent/30 bg-accent/10" />)}</div></div><style jsx>{`.nav-action-overlay{animation:nav-action-fade .18s ease-out}.nav-action-lines span{position:absolute;left:50%;top:50%;width:58vw;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.45),transparent);transform-origin:left center;animation:nav-line-converge .72s ease-in forwards}.nav-action-lines span:nth-child(1){transform:rotate(0deg)}.nav-action-lines span:nth-child(2){transform:rotate(18deg)}.nav-action-lines span:nth-child(3){transform:rotate(36deg)}.nav-action-lines span:nth-child(4){transform:rotate(54deg)}.nav-action-lines span:nth-child(5){transform:rotate(72deg)}.nav-action-lines span:nth-child(6){transform:rotate(90deg)}.nav-action-lines span:nth-child(7){transform:rotate(108deg)}.nav-action-lines span:nth-child(8){transform:rotate(126deg)}.nav-action-lines span:nth-child(9){transform:rotate(144deg)}.nav-action-lines span:nth-child(10){transform:rotate(162deg)}.nav-action-panel{animation:nav-action-enter .72s ease-out}.nav-action-aperture{position:relative;width:9rem;height:5rem;border:1px solid rgba(255,0,0,.45);box-shadow:0 0 42px rgba(255,0,0,.22),inset 0 0 24px rgba(255,255,255,.06);animation:nav-aperture-open .72s ease-out}.nav-action-aperture span{position:absolute;inset:18%;border:1px solid rgba(255,255,255,.20);animation:nav-aperture-ring 1.1s ease-in-out infinite}.nav-action-overlay[data-kind="payment"] .nav-action-lines span{background:linear-gradient(90deg,transparent,rgba(255,170,0,.52),transparent)}.nav-action-overlay[data-kind="payment"] .nav-action-aperture{border-color:rgba(255,170,0,.55);box-shadow:0 0 46px rgba(255,170,0,.26),inset 0 0 24px rgba(255,255,255,.06)}.nav-action-bit{animation:nav-action-bit .62s ease-in-out forwards}.nav-action-bit:nth-child(even){animation-delay:.04s}@keyframes nav-action-fade{from{opacity:0}to{opacity:1}}@keyframes nav-action-enter{0%{transform:scale(.98);filter:brightness(1.7)}100%{transform:scale(1);filter:brightness(1)}}@keyframes nav-line-converge{0%{opacity:0;transform:scaleX(1.2)}60%{opacity:.9}100%{opacity:0;transform:scaleX(.06)}}@keyframes nav-aperture-open{0%{transform:scale(.55);filter:brightness(1.8)}100%{transform:scale(1);filter:brightness(1)}}@keyframes nav-aperture-ring{0%,100%{transform:scale(.9);opacity:.35}50%{transform:scale(1.08);opacity:.95}}@keyframes nav-action-bit{0%{transform:scaleY(.25);opacity:.35}55%{transform:scaleY(1);opacity:1}100%{transform:scaleY(.45);opacity:.72}}@media (prefers-reduced-motion: reduce){.nav-action-overlay,.nav-action-lines span,.nav-action-panel,.nav-action-aperture,.nav-action-aperture span,.nav-action-bit{animation:none}}`}</style></div>;
}

function SourceArt({ track, className = "h-full w-full" }: { track: QueuePublicTrack | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const artworkUrl = track?.sourceArtworkUrl ?? null;
  if (artworkUrl && !failed) return <img src={artworkUrl} alt="" className={`${className} object-cover`} onError={() => setFailed(true)} />;
  return <div className={`${className} flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,0,0,0.25),transparent_60%)] text-4xl text-accent`}>▦</div>;
}

function tiktokHref(handle?: string | null): string | null { const cleaned = (handle ?? "").trim().replace(/^@+/, "").split(/[/?#]/)[0]?.replace(/[^a-zA-Z0-9._-]/g, ""); return cleaned ? `https://www.tiktok.com/@${cleaned}` : null; }
function TikTokLink({ handle }: { handle?: string | null }) { const href = tiktokHref(handle); if (!href || !handle) return null; return <a href={href} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">{handle.startsWith("@") ? handle : `@${handle}`}</a>; }
function usefulDetected(track: QueuePublicTrack): string | null { const artist = track.detectedArtistName?.trim(); const title = track.detectedSongTitle?.trim() || track.providerTitle?.trim(); if (!artist && !title) return null; const submitted = `${track.submittedArtistName} ${track.submittedSongTitle}`.toLowerCase(); const detected = `${artist ?? ""} ${title ?? ""}`.trim(); return detected && !submitted.includes(detected.toLowerCase()) ? detected : null; }

function publicTrackStateMap(snapshot: QueuePublicSnapshot): Map<string, Pick<QueuePublicTrack, "lane" | "priorityUpgradeStatus">> {
  const map = new Map<string, Pick<QueuePublicTrack, "lane" | "priorityUpgradeStatus">>();
  for (const track of [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue, ...snapshot.completed]) {
    if (track) map.set(track.id, { lane: track.lane, priorityUpgradeStatus: track.priorityUpgradeStatus });
  }
  return map;
}

function trackTone(track: QueuePublicTrack): ActivityTone {
  if (track.priorityUpgradeStatus === "checkout_pending") return "amber";
  if (track.lane === "priority" || track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual") return "gold";
  if (track.lane === "wheel") return "cyan";
  if (track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded") return "danger";
  return "red";
}

function dedupeActivities(items: Omit<QueueActivity, "id" | "createdAt">[]): Omit<QueueActivity, "id" | "createdAt">[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.text}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function toneClass(tone: ActivityTone): string {
  if (tone === "gold") return "border-[#ffaa00]/45 text-[#ffaa00]";
  if (tone === "cyan") return "border-cyan-200/40 text-cyan-200";
  if (tone === "amber") return "border-[#ffaa00]/35 text-[#ffaa00]";
  if (tone === "archive") return "border-border text-muted";
  if (tone === "danger") return "border-danger/40 text-danger";
  return "border-accent/30 text-accent";
}

function QueueUpdateToast({ item }: { item: QueueActivity }) {
  return <div className={`queue-toast fixed right-4 top-20 z-[120100] w-[min(24rem,calc(100vw-2rem))] border bg-background/95 p-3 shadow-[0_0_42px_rgba(255,0,0,0.22)] ${toneClass(item.tone)}`} role="status" aria-live="polite"><p className="text-[10px] uppercase tracking-[0.3em]">Queue Updated</p><p className="mt-1 text-sm font-bold text-foreground">{item.text}</p><p className="mt-1 text-xs text-muted">{item.detail}</p><style jsx>{`.queue-toast{animation:queue-toast-in .28s ease-out}@keyframes queue-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion: reduce){.queue-toast{animation:none}}`}</style></div>;
}

function TransmissionActivity({ items }: { items: QueueActivity[] }) {
  return <section className="activity-console relative overflow-hidden border border-border bg-surface p-4"><div className="activity-bus pointer-events-none absolute inset-x-0 top-10 h-px bg-accent/25" aria-hidden="true" /><div className="flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-[0.3em] text-muted">Transmission Activity</p><span className="text-[10px] uppercase tracking-widest text-muted">Portal event log · Public snapshot</span></div>{items.length === 0 ? <p className="mt-3 text-xs text-muted">Queue changes detected during this visit will appear here as packet route events.</p> : <div className="mt-3 grid gap-2">{items.map((item) => <article key={item.id} className={`activity-item relative overflow-hidden border bg-background/45 p-3 ${toneClass(item.tone)}`}><span className="activity-node" aria-hidden="true" /><p className="text-sm font-bold text-foreground">{item.text}</p><p className="mt-1 text-xs text-muted">{item.detail}</p></article>)}</div>}<style jsx>{`.activity-console::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,0,0,.06),transparent);pointer-events:none}.activity-bus{box-shadow:0 0 16px rgba(255,0,0,.22)}.activity-item{animation:activity-land .55s ease-out}.activity-node{position:absolute;left:.7rem;top:50%;width:.4rem;height:.4rem;border:1px solid currentColor;background:currentColor;box-shadow:0 0 14px currentColor;transform:translateY(-50%)}.activity-item p{padding-left:1rem}@keyframes activity-land{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}@media (prefers-reduced-motion: reduce){.activity-item{animation:none}}`}</style></section>;
}

function SignalResidue({ tone, seed }: { tone: ActivityTone; seed: string }) {
  const color = tone === "gold" ? "#ffaa00" : tone === "cyan" ? "#67e8f9" : tone === "amber" ? "#ffaa00" : tone === "archive" ? "#b7b7b7" : tone === "danger" ? "#ff3b3b" : "#ff2a2a";
  return <div className="signal-residue pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><div className="residue-aperture" style={{ color }} />{Array.from({ length: 14 }).map((_, index) => { const hash = stableHash(`${seed}:${index}:${tone}`); const dx = ((hash % 90) - 45); const dy = (((hash >> 5) % 70) - 35); return <span key={index} style={{ left: "50%", top: "50%", color, animationDelay: `${index * 34}ms`, "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties} />; })}<style jsx>{`.residue-aperture{position:absolute;left:50%;top:50%;width:3.5rem;height:2rem;border:1px solid currentColor;box-shadow:0 0 22px currentColor,inset 0 0 18px currentColor;transform:translate(-50%,-50%);animation:residue-aperture .72s ease-out forwards}.signal-residue span{position:absolute;width:3px;height:3px;background:currentColor;box-shadow:0 0 10px currentColor;animation:signal-residue-route .9s ease-out forwards}.signal-residue span:nth-child(3n){width:1px;height:10px}.signal-residue span:nth-child(4n){width:8px;height:1px}.signal-residue span:nth-child(5n){width:2px;height:2px;border:1px solid currentColor;background:transparent}@keyframes residue-aperture{0%{opacity:0;transform:translate(-50%,-50%) scale(.35)}35%{opacity:.9}100%{opacity:0;transform:translate(-50%,-50%) scale(1.35)}}@keyframes signal-residue-route{0%{opacity:0;transform:translate3d(0,0,0) scale(.5)}25%{opacity:.95}100%{opacity:0;transform:translate3d(var(--dx),var(--dy),0) scale(1)}}@media (prefers-reduced-motion: reduce){.residue-aperture,.signal-residue span{animation:none;opacity:.42}}`}</style></div>;
}

function TrackTitleLink({ track }: { track: QueuePublicTrack }) {
  if (!track.publicSourceUrl) return <p className="mt-1 text-lg text-foreground/90">{track.submittedSongTitle}</p>;
  return <a href={track.publicSourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-lg text-foreground/90 underline-offset-2 hover:text-accent hover:underline">{track.submittedSongTitle}</a>;
}



type PublicSessionPhase = "syncing" | "archived" | "closed" | "open" | "liveOpen" | "liveClosed";

function publicSessionPhase(snapshot: QueuePublicSnapshot | null, canSubmit: boolean, isBroadcastActive: boolean): PublicSessionPhase {
  if (!snapshot) return "syncing";
  if (snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended") return "archived";
  if (isBroadcastActive) return canSubmit ? "liveOpen" : "liveClosed";
  return canSubmit ? "open" : "closed";
}

function uniqueActiveTracks(snapshot: QueuePublicSnapshot | null): QueuePublicTrack[] {
  if (!snapshot || snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended") return [];
  const seen = new Set<string>();
  return [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue].filter((track): track is QueuePublicTrack => {
    if (!track || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function publicQueueCounts(snapshot: QueuePublicSnapshot | null) {
  const activeTracks = uniqueActiveTracks(snapshot);
  const completed = snapshot?.session.completedCount ?? snapshot?.completed.length ?? 0;
  const removed = snapshot?.session.removedCount ?? 0;
  return {
    active: activeTracks.length,
    waiting: snapshot?.queue.length ?? 0,
    completed,
    total: activeTracks.length + completed + removed,
    pending: activeTracks.filter((track) => track.priorityUpgradeStatus === "checkout_pending").length,
    priority: activeTracks.filter((track) => track.lane === "priority" && (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual")).length,
    wheel: activeTracks.filter((track) => track.lane === "wheel").length,
  };
}

function sessionReadouts(snapshot: QueuePublicSnapshot | null, counts: ReturnType<typeof publicQueueCounts>): string[] {
  const lines = [
    counts.active > 0 ? `${counts.active} active transmissions detected.` : "No active transmissions detected.",
    counts.waiting > 0 ? `${counts.waiting} waiting below the broadcast slots.` : "Waiting queue clear.",
  ];
  if (counts.pending > 0) lines.push(`${counts.pending} payment handshakes pending.`);
  if ((snapshot?.queue ?? []).some((track) => track.lane === "wheel")) lines.push("Wheel signal detected.");
  if ((snapshot?.queue ?? []).some((track) => track.lane === "priority" && (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual"))) lines.push("Priority relay active.");
  if (counts.completed > 0) lines.push(`${counts.completed} transmissions archived tonight.`);
  const seed = `${snapshot?.session.sessionId ?? "sync"}:${counts.total}:${snapshot?.status.pressure ?? "low"}`;
  const flavor = ["BNL-01 receiver trace stabilized.", "Host band interference cleared.", "Corridor alignment corrected.", "Signal anomaly contained."];
  if (stableHash(seed) % 13 === 0) lines.push(stableVariant(seed, flavor));
  return lines.slice(0, 5);
}

function phaseVisual(phase: PublicSessionPhase) {
  if (phase === "syncing") return { eyebrow: "SYNCING PUBLIC SIGNAL", title: "QUEUE TERMINAL HANDSHAKE", body: "Reading the public BARCODE Radio snapshot before opening the monitor.", tone: "text-muted", border: "border-border", meter: "bg-muted/60", gate: "SIGNAL SEARCH" };
  if (phase === "archived") return { eyebrow: "BROADCAST ENDED", title: "TRANSMISSION ARCHIVED", body: "SUBMISSIONS CLOSED. No active BARCODE Radio session is currently accepting transmissions.", tone: "text-danger", border: "border-danger/35", meter: "bg-danger/60", gate: "ARCHIVE SEAL" };
  if (phase === "closed") return { eyebrow: "SESSION ONLINE", title: "SUBMISSION GATE CLOSED", body: "The broadcast corridor is powered on, but new transmissions are not currently being accepted. Stand by for intake.", tone: "text-cyan-200", border: "border-cyan-200/30", meter: "bg-cyan-200/60", gate: "INTAKE BARRIER SEALED" };
  if (phase === "open") return { eyebrow: "SIGNAL INTAKE OPEN", title: "TRANSMIT YOUR TRACK NOW", body: "Free Transmissions are open. Priority Signal unlocks once the line is deep enough and activates only after Stripe confirms payment.", tone: "text-accent", border: "border-accent/50", meter: "bg-accent/70", gate: "ROUTING CHANNEL OPEN" };
  if (phase === "liveClosed") return { eyebrow: "BROADCAST ACTIVE", title: "HOST PROTOCOL INITIALIZED", body: "The live monitor remains locked while the intake gate is resealed. Submissions are closed; the broadcast is not ended.", tone: "text-[#ffaa00]", border: "border-[#ffaa00]/50", meter: "bg-[#ffaa00]/70", gate: "LIVE SIGNAL / INTAKE CLOSED" };
  return { eyebrow: "BROADCAST ACTIVE", title: "HOST PROTOCOL INITIALIZED", body: "Now Playing is live and the host protocol is engaged. Submissions remain open while the broadcast machine is running.", tone: "text-[#ffaa00]", border: "border-[#ffaa00]/50", meter: "bg-[#ffaa00]/70", gate: "LIVE SIGNAL / INTAKE OPEN" };
}

function SessionPortalAperture({ phase, counts, intakeWindow, isBroadcastActive, canSubmit }: { phase: PublicSessionPhase; counts: ReturnType<typeof publicQueueCounts>; intakeWindow: string | null; isBroadcastActive: boolean; canSubmit: boolean }) {
  const isOpen = phase === "open" || phase === "liveOpen";
  return (
    <div className="session-portal mt-4 overflow-hidden border border-border bg-background/50 p-3" data-phase={phase}>
      <div className="session-aperture relative aspect-[16/10] min-h-56 overflow-hidden border border-border/70 bg-black/35">
        <div className="session-tunnel absolute inset-0" aria-hidden="true" />
        <div className="session-grid absolute inset-0" aria-hidden="true" />
        <div className="session-rings absolute inset-0" aria-hidden="true"><span /><span /><span /></div>
        <div className="session-wave absolute inset-x-8 top-1/2 h-20 -translate-y-1/2" aria-hidden="true">{Array.from({ length: 24 }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 42}ms` }} />)}</div>
        <div className="session-packets absolute inset-0" aria-hidden="true">{Array.from({ length: Math.min(8, Math.max(2, counts.active + counts.pending + counts.wheel)) }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 150}ms` }} />)}</div>
        {counts.pending > 0 && <div className="session-handshake absolute right-3 top-3 border border-[#ffaa00]/45 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">{counts.pending} payment processing</div>}
        {counts.priority > 0 && <div className="session-relay absolute left-0 right-0 top-7 h-px bg-[#ffaa00]/60" aria-hidden="true" />}
        {counts.wheel > 0 && <div className="session-wheel absolute bottom-9 left-6 right-6 h-px bg-cyan-200/60" aria-hidden="true" />}
        <div className="session-shutters absolute inset-0" aria-hidden="true"><span /><span /></div>
        {phase === "archived" && <div className="session-archive-seal absolute inset-0 grid place-items-center"><span>ARCHIVE SEAL</span></div>}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 text-[10px] uppercase tracking-[0.22em]">
          <span className={isBroadcastActive ? "text-[#ffaa00]" : isOpen ? "text-accent" : "text-muted"}>{isBroadcastActive ? "Broadcast monitor lock" : isOpen ? "Intake corridor open" : phase === "syncing" ? "Receiver tuning" : "Transmission gate sealed"}</span>
          {intakeWindow && canSubmit && <span className="submission-window border border-accent/40 bg-accent/10 px-2 py-1 text-accent">{intakeWindow} window</span>}
        </div>
      </div>
    </div>
  );
}

function SessionPhasePanel({ snapshot, canSubmit, isBroadcastActive }: { snapshot: QueuePublicSnapshot | null; canSubmit: boolean; isBroadcastActive: boolean }) {
  const [nowMs, setNowMs] = useState(0);
  const [transitionPhase, setTransitionPhase] = useState<PublicSessionPhase | null>(null);
  const phaseRef = useRef<PublicSessionPhase>("syncing");
  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const phase = publicSessionPhase(snapshot, canSubmit, isBroadcastActive);
  useEffect(() => {
    if (phaseRef.current === phase) return;
    phaseRef.current = phase;
    setTransitionPhase(phase);
    const timer = window.setTimeout(() => setTransitionPhase(null), 1400);
    return () => window.clearTimeout(timer);
  }, [phase]);
  const session = snapshot?.session;
  const intakeClock = session?.preShowEndsAt ? new Date(session.preShowEndsAt).getTime() - nowMs : 0;
  const intakeWindow = Number.isFinite(intakeClock) && intakeClock > 0 ? `${Math.floor(intakeClock / 60000)}:${Math.floor((intakeClock % 60000) / 1000).toString().padStart(2, "0")}` : null;
  const copy = phaseVisual(phase);
  const counts = publicQueueCounts(snapshot);
  const pressure = pressureLevel(snapshot);
  const readouts = sessionReadouts(snapshot, counts);
  const routePulses = pressure === "high" ? 5 : pressure === "medium" ? 4 : 3;

  return <section data-phase={phase} data-pressure={pressure} data-transition={transitionPhase ?? undefined} className={`session-machine relative overflow-hidden border bg-surface p-5 ${copy.border}`}><div className="phase-scan pointer-events-none absolute inset-0" /><div className="phase-routes pointer-events-none absolute inset-0">{Array.from({ length: routePulses }).map((_, index) => <span key={index} style={{ top: `${26 + index * (48 / Math.max(1, routePulses - 1))}%`, animationDelay: `${index * 130}ms` }} />)}</div><div className="relative grid gap-5 lg:grid-cols-[1fr_1fr]"><div><p className={`text-xs uppercase tracking-[0.35em] ${copy.tone}`}>{copy.eyebrow}</p><h2 className={`mt-2 text-2xl font-bold ${copy.tone}`}>{copy.title}</h2><p className="mt-3 max-w-3xl text-sm text-muted">{copy.body}</p><div className="mt-4 grid gap-2 border border-border/60 bg-background/40 p-3 text-xs text-muted">{readouts.map((line) => <p key={line} className="font-mono uppercase tracking-[0.16em]">{line}</p>)}</div><div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><PhaseChip label="Broadcast" value={isBroadcastActive ? "Active" : "Standby"} active={isBroadcastActive} /><PhaseChip label="Submissions" value={canSubmit ? "Open" : "Closed"} active={canSubmit} /><PhaseChip label="Session" value={snapshot ? session?.status ?? "Syncing" : "Syncing"} active={Boolean(snapshot && session?.status !== "archived")} /><PhaseChip label="Gate" value={copy.gate} active={phase === "open" || phase === "liveOpen"} /></div></div><SessionPortalAperture phase={phase} counts={counts} intakeWindow={intakeWindow} isBroadcastActive={isBroadcastActive} canSubmit={canSubmit} /></div><style jsx>{`.session-machine{transition:border-color .7s ease,box-shadow .7s ease,filter .7s ease}.phase-scan{background:linear-gradient(transparent 50%,rgba(255,255,255,.075) 50%);background-size:100% 6px;animation:phase-scan 3s linear infinite;opacity:.16}.phase-routes span{position:absolute;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.48),transparent);animation:phase-route 2.4s ease-in-out infinite}.session-machine[data-pressure="low"] .phase-scan{animation-duration:4.6s;opacity:.09}.session-machine[data-pressure="low"] .phase-routes span{animation-duration:3.8s;opacity:.42}.session-machine[data-pressure="medium"] .phase-scan{animation-duration:3s;opacity:.16}.session-machine[data-pressure="high"] .phase-scan{animation-duration:1.75s;opacity:.26}.session-machine[data-pressure="high"] .phase-routes span{animation-duration:1.5s;box-shadow:0 0 14px rgba(255,170,0,.25)}.session-machine[data-phase="archived"]{filter:saturate(.55)}.session-machine[data-phase="archived"] .phase-scan{opacity:.07;animation-duration:5s}.session-machine[data-transition]{animation:session-mode-swap 1.15s ease-out}.submission-window{animation:submission-window-in .85s ease-out}.session-aperture{box-shadow:inset 0 0 34px rgba(255,255,255,.05)}.session-tunnel{background:radial-gradient(ellipse at center,rgba(255,255,255,.08),transparent 18%,rgba(255,0,0,.13) 30%,transparent 54%),repeating-linear-gradient(90deg,transparent 0 7%,rgba(255,255,255,.055) 7% calc(7% + 1px),transparent calc(7% + 1px) 14%);animation:session-breathe 3s ease-in-out infinite}.session-grid{background:linear-gradient(115deg,transparent 46%,rgba(255,0,0,.20) 50%,transparent 54%),linear-gradient(65deg,transparent 46%,rgba(255,255,255,.12) 50%,transparent 54%);clip-path:polygon(10% 0,90% 0,58% 100%,42% 100%);opacity:.62;animation:session-grid 2.6s linear infinite}.session-rings span{position:absolute;inset:17%;border:1px solid rgba(255,255,255,.16);box-shadow:0 0 28px rgba(255,0,0,.18);animation:session-ring 2.5s ease-in-out infinite}.session-rings span:nth-child(2){inset:27%;border-color:rgba(255,0,0,.42);animation-delay:.22s}.session-rings span:nth-child(3){inset:39%;border-color:rgba(255,255,255,.28);animation-delay:.44s}.session-wave{display:flex;align-items:center;justify-content:center;gap:4px}.session-wave span{width:3px;height:18%;background:rgba(255,170,0,.78);box-shadow:0 0 14px rgba(255,170,0,.35);animation:session-wave 900ms ease-in-out infinite}.session-packets span{position:absolute;left:8%;top:50%;width:22%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.85),#fff);transform-origin:right center;animation:session-packet 1.55s ease-in-out infinite}.session-packets span:nth-child(even){left:auto;right:8%;background:linear-gradient(270deg,transparent,rgba(255,0,0,.85),#fff);transform-origin:left center}.session-shutters span{position:absolute;left:8%;right:8%;height:44%;border:1px solid rgba(255,255,255,.12);background:linear-gradient(rgba(0,0,0,.72),rgba(255,255,255,.04));transition:transform .7s ease,opacity .7s ease}.session-shutters span:first-child{top:0}.session-shutters span:last-child{bottom:0}.session-portal[data-phase="open"] .session-shutters span,.session-portal[data-phase="liveOpen"] .session-shutters span{transform:translateY(-76%);opacity:.36}.session-portal[data-phase="open"] .session-shutters span:last-child,.session-portal[data-phase="liveOpen"] .session-shutters span:last-child{transform:translateY(76%)}.session-portal[data-phase="liveClosed"] .session-shutters span:first-child{transform:translateY(-54%);opacity:.44}.session-portal[data-phase="liveClosed"] .session-shutters span:last-child{transform:translateY(54%);opacity:.44}.session-portal[data-phase="closed"] .session-rings span{border-color:rgba(103,232,249,.22);box-shadow:0 0 24px rgba(103,232,249,.12)}.session-portal[data-phase="syncing"] .session-aperture{animation:receiver-tune .9s steps(2,end) infinite}.session-portal[data-phase="archived"] .session-tunnel,.session-portal[data-phase="archived"] .session-grid,.session-portal[data-phase="archived"] .session-packets{opacity:.12;animation-duration:6s}.session-archive-seal span{border:1px solid rgba(255,0,0,.45);background:rgba(0,0,0,.72);padding:.75rem 1rem;color:#ff3b3b;font-size:.7rem;letter-spacing:.32em;transform:rotate(-8deg);box-shadow:0 0 34px rgba(255,0,0,.14)}.session-handshake{animation:session-handshake 1s steps(2,end) infinite}.session-relay{box-shadow:0 0 18px rgba(255,170,0,.55)}.session-wheel{box-shadow:0 0 18px rgba(103,232,249,.55)}@keyframes phase-scan{from{background-position:0 0}to{background-position:0 48px}}@keyframes phase-route{0%,100%{opacity:.08;transform:scaleX(.15)}45%{opacity:.75;transform:scaleX(1)}}@keyframes session-mode-swap{0%{clip-path:inset(0 100% 0 0);filter:brightness(1.7)}38%{clip-path:inset(0 0 0 0);filter:brightness(1.25)}100%{filter:brightness(1)}}@keyframes submission-window-in{0%{opacity:0;transform:translateY(8px);box-shadow:0 0 0 rgba(255,0,0,0)}100%{opacity:1;transform:translateY(0);box-shadow:0 0 26px rgba(255,0,0,.16)}}@keyframes session-breathe{0%,100%{transform:scale(.94);opacity:.68}50%{transform:scale(1.02);opacity:1}}@keyframes session-grid{from{background-position:0 0}to{background-position:42px 0}}@keyframes session-ring{0%,100%{transform:scale(.92);opacity:.38}50%{transform:scale(1.06);opacity:.95}}@keyframes session-wave{0%,100%{height:16%;opacity:.45}50%{height:86%;opacity:1}}@keyframes session-packet{0%{opacity:0;transform:translateX(-30%) scaleX(.18)}45%{opacity:1}100%{opacity:0;transform:translateX(155%) scaleX(.04)}}@keyframes receiver-tune{0%,100%{filter:brightness(1) contrast(1)}50%{filter:brightness(1.8) contrast(1.35)}}@keyframes session-handshake{0%,100%{opacity:.55}50%{opacity:1}}@media (prefers-reduced-motion: reduce){.phase-scan,.phase-routes span,.session-machine[data-transition],.submission-window,.session-tunnel,.session-grid,.session-rings span,.session-wave span,.session-packets span,.session-handshake,.session-portal[data-phase="syncing"] .session-aperture{animation:none}.session-shutters span{transition:none}}`}</style></section>;
}

function PhaseChip({ label, value, active }: { label: string; value: string; active: boolean }) {
  return <div className={`border p-2 ${active ? "border-accent/40 bg-accent/5" : "border-border bg-background/45"}`}><p className="uppercase tracking-widest text-muted">{label}</p><p className={active ? "mt-1 text-accent" : "mt-1 text-muted"}>{value}</p></div>;
}

function NowPlaying({ title, track, compact = false, domId, lastSubmittedTrackId, residue }: { title: string; track: QueuePublicTrack | null; compact?: boolean; domId?: string; lastSubmittedTrackId?: string | null; residue?: { tone: ActivityTone; nonce: number } }) {
  const detected = track ? usefulDetected(track) : null;
  const isLanding = Boolean(track?.id && track.id === lastSubmittedTrackId);
  const isNowPlaying = title === "Now Playing";
  const tone = isNowPlaying ? "text-[#ffaa00]" : "text-accent";
  return <div id={domId} data-track-id={track?.id} className={`broadcast-slot relative overflow-hidden border bg-surface p-4 transition-all ${isNowPlaying ? "broadcast-now border-[#ffaa00]/50 shadow-[0_0_34px_rgba(255,170,0,0.14)]" : "broadcast-next border-accent/40"} ${isLanding ? "packet-lock border-accent shadow-[0_0_44px_rgba(255,0,0,0.34)]" : ""} ${compact ? "" : "min-h-[15rem]"}`}><div className="slot-scan pointer-events-none absolute inset-0" />{track && residue && <SignalResidue tone={residue.tone} seed={`${track.id}:${residue.nonce}`} />}<p className={`relative text-xs uppercase tracking-[0.35em] ${tone}`}>{title}</p>{track ? <div className={`relative mt-3 grid gap-4 ${compact ? "grid-cols-[5.5rem_1fr]" : "sm:grid-cols-[12rem_1fr]"}`}><div className={`${compact ? "h-24" : "aspect-square max-h-56"} overflow-hidden border ${isNowPlaying ? "border-[#ffaa00]/45" : "border-accent/40"}`}><SourceArt track={track} /></div><div className="self-center"><h3 className={`${compact ? "text-xl" : "text-3xl"} font-bold text-foreground`}>{track.submittedArtistName}</h3><TrackTitleLink track={track} /><div className="mt-3 grid gap-1 text-xs text-muted"><TikTokLink handle={track.tiktokHandle} />{detected && <p>Detected signal: {detected}</p>}{!track.durationIsEstimate && <p>Runtime locked: {track.durationLabel}</p>}</div>{isNowPlaying && <div className="live-meter mt-4 grid grid-cols-12 items-end gap-1" aria-hidden="true">{[20, 46, 32, 70, 38, 82, 28, 56, 44, 76, 34, 62].map((height, index) => <span key={index} className="bg-[#ffaa00]/70" style={{ height: `${height / 3}px`, animationDelay: `${index * 55}ms` }} />)}</div>}</div></div> : <div className="relative mt-3 grid gap-4 sm:grid-cols-[8rem_1fr]"><div className="h-32 overflow-hidden border border-accent/30"><SourceArt track={null} /></div><p className="self-center text-sm text-muted">No transmission is in this slot yet.</p></div>}<style jsx>{`.slot-scan{background:linear-gradient(transparent 50%,rgba(255,255,255,.06) 50%);background-size:100% 6px;opacity:.12}.broadcast-now .slot-scan{animation:slot-scan 2.2s linear infinite}.broadcast-next{animation:next-slot-pulse 2.8s ease-in-out infinite}.packet-lock{animation:packet-card-lock 900ms ease-out}.live-meter span{animation:live-meter 900ms ease-in-out infinite}@keyframes slot-scan{from{background-position:0 0}to{background-position:0 42px}}@keyframes next-slot-pulse{0%,100%{box-shadow:0 0 0 rgba(255,0,0,0)}50%{box-shadow:0 0 22px rgba(255,0,0,.12)}}@keyframes packet-card-lock{0%{transform:translateY(4px);filter:brightness(1.5)}100%{transform:translateY(0);filter:brightness(1)}}@keyframes live-meter{0%,100%{transform:scaleY(.45);opacity:.45}50%{transform:scaleY(1);opacity:1}}@media (prefers-reduced-motion: reduce){.broadcast-now .slot-scan,.broadcast-next,.packet-lock,.live-meter span{animation:none}}`}</style></div>;
}

function QueueStatusPanel({ snapshot, canSubmit, isFull, onSubmit }: { snapshot: QueuePublicSnapshot | null; canSubmit: boolean; isFull: boolean; onSubmit: () => void }) {
  const counts = publicQueueCounts(snapshot);
  return <div className={`border bg-surface p-4 space-y-3 ${canSubmit ? "border-accent/45 shadow-[0_0_28px_rgba(255,0,0,0.14)]" : "border-border"}`}><div><p className="text-xs uppercase tracking-[0.3em] text-muted">// Queue Status</p><h2 className="mt-1 text-xl font-bold text-foreground">{snapshot?.session.title ?? "BARCODE Radio"}</h2><p className="text-xs text-muted">{snapshot?.session.showDate ?? "show date syncing"} · {snapshot?.session.status ?? "syncing"}</p></div><div className="grid grid-cols-2 gap-2 text-sm"><QueueStat label="Active Transmissions" value={counts.active} helper="Now Playing, Next In Line, and waiting tracks." /><QueueStat label="Waiting in Queue" value={counts.waiting} helper="Below current broadcast slots." /><QueueStat label="Played Tonight" value={counts.completed} helper="Finished tracks only." /><QueueStat label="Total Received" value={counts.total} helper="Accepted active, played, and removed signals." />{counts.pending > 0 && <QueueStat label="Payment Processing" value={counts.pending} helper="Still Free until confirmed." accent="text-[#ffaa00]" />}</div>{canSubmit ? <button type="button" onClick={onSubmit} className="intake-cta w-full border border-accent px-4 py-2.5 text-xs uppercase tracking-widest text-accent shadow-[0_0_24px_rgba(255,0,0,0.16)] hover:bg-accent hover:text-background">Submit a Track</button> : <div className="border border-danger/40 bg-danger/5 p-3"><p className="text-xs uppercase tracking-[0.25em] text-danger">{isFull ? "QUEUE FULL" : "SUBMISSIONS CLOSED"}</p><p className="mt-1 text-xs text-muted">{isFull ? "This broadcast queue is full for new transmissions." : "Visible queue. No new tracks accepted right now."}</p></div>}<p className="text-[11px] leading-relaxed text-muted">Active transmissions remain in play until finished or removed. Payment Processing tracks remain in Free Transmissions until confirmed.</p><style jsx>{`.intake-cta{animation:intake-cta-pulse 2.1s ease-in-out infinite}@keyframes intake-cta-pulse{0%,100%{box-shadow:0 0 16px rgba(255,0,0,.12)}50%{box-shadow:0 0 34px rgba(255,0,0,.30)}}@media (prefers-reduced-motion: reduce){.intake-cta{animation:none}}`}</style></div>;
}

function QueueStat({ label, value, helper, accent = "text-foreground" }: { label: string; value: number | string; helper: string; accent?: string }) {
  return <div className="border border-border bg-background/45 p-2"><p className="text-[10px] uppercase tracking-widest text-muted">{label}</p><p className={`mt-1 text-lg font-bold ${accent}`}>{value}</p><p className="mt-1 text-[10px] leading-snug text-muted">{helper}</p></div>;
}

function SubmitterStatusPanel({ status, cooldownRemaining }: { status: QueuePublicSnapshot["submitterStatus"] | null; cooldownRemaining: number }) { if (!status) return <section className="border border-border bg-surface p-4 text-xs text-muted">Your transmission counter appears here after your first signal.</section>; return <section className="border border-accent/40 bg-accent/5 p-4 text-sm text-muted"><p className="font-bold text-accent">Your transmissions: {status.used} / {status.limit}</p><p className="mt-1">Remaining: {status.remaining}</p>{cooldownRemaining > 0 && <p className="mt-1 text-accent">Next transmission in {formatCooldown(cooldownRemaining)}</p>}</section>; }
function QueueMechanicsInfo() { return <section className="border border-accent/30 bg-accent/5 p-4"><p className="text-xs uppercase tracking-[0.3em] text-accent">Queue Mechanics</p><p className="mt-1 text-xs leading-relaxed text-muted">Priority Signals clear before Wheel Chosen and Free Transmissions. Tap energy during the show can destabilize the broadcast relay and move a Free Transmission forward.</p></section>; }

function trackStatusStyle(track: QueuePublicTrack, isLanding: boolean, isCompleted: boolean): { card: string; stamp: string | null } {
  if (isCompleted) return { card: "completed-stamp border-border opacity-85", stamp: "PLAYED / ARCHIVED" };
  if (track.priorityUpgradeStatus === "checkout_pending") return { card: "payment-pending border-[#ffaa00]/45", stamp: "PAYMENT PROCESSING — STILL FREE" };
  if (track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded") return { card: "removed-stamp border-danger/45", stamp: "PRIORITY NOT COMPLETED" };
  if (track.lane === "priority" || track.priorityUpgradeStatus === "manual" || track.priorityUpgradeStatus === "paid") return { card: "priority-lock border-[#ffaa00]/55", stamp: "PRIORITY SIGNAL CONFIRMED" };
  if (track.lane === "wheel") return { card: "wheel-pulse border-cyan-200/45", stamp: "WHEEL CHOSEN" };
  if (isLanding) return { card: "packet-lock border-accent", stamp: "TRANSMISSION ACCEPTED" };
  return { card: "border-border", stamp: null };
}

function PublicLane({ title, tracks, subtitle, lastSubmittedTrackId, collapsible = false, domId, canPriorityUpgrade, canResumePriorityPayment, priorityPriceCents, priorityCurrency, onPriorityUpgrade, onPriorityPayment, residueMap = {} }: { title: string; tracks: QueuePublicTrack[]; subtitle?: string; lastSubmittedTrackId: string | null; collapsible?: boolean; domId?: string; canPriorityUpgrade: (track: QueuePublicTrack) => boolean; canResumePriorityPayment: (track: QueuePublicTrack) => boolean; priorityPriceCents: number; priorityCurrency: string; onPriorityUpgrade: (track: QueuePublicTrack) => void; onPriorityPayment: (track: QueuePublicTrack) => void; residueMap?: ResidueMap }) {
  const collapsed = collapsible && tracks.length === 0;
  const id = domId ?? (title === "Free Transmissions" ? "free-transmissions-lane" : undefined);
  const isCompletedLane = title === "Recently Played" || title === "Completed Signal Log";
  return <section id={id} className={`w-full border bg-surface transition-all ${lastSubmittedTrackId && tracks.some((track) => track.id === lastSubmittedTrackId) ? "border-accent shadow-[0_0_34px_rgba(255,0,0,0.22)]" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm uppercase tracking-[0.25em] text-foreground">{title}</h2>{subtitle && !collapsed && <p className="mt-1 text-xs text-muted">{subtitle}</p>}</div><span className="text-xs text-muted">{tracks.length}</span></div>{collapsed ? <p className="mt-1 text-xs text-muted">No active signals in this lane.</p> : <div className="mt-4 space-y-3">{tracks.length === 0 ? <p className="border border-border/60 p-4 text-sm text-muted">No visible transmissions.</p> : tracks.map((track, index) => { const isLanding = track.id === lastSubmittedTrackId; const style = trackStatusStyle(track, isLanding, isCompletedLane); const sourceClass = track.sourceType === "upload" ? "source-upload" : track.sourceType === "other" ? "source-other" : "source-link"; const residue = residueMap[track.id]; return <article key={track.id} data-track-id={track.id} id={`track-card-${track.id}`} className={`queue-track-card grid gap-3 border bg-background/40 p-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center ${style.card} ${sourceClass}`}>{residue && <SignalResidue tone={residue.tone} seed={`${track.id}:${residue.nonce}`} />}<div className="mini-aperture" aria-hidden="true"><span /><span /></div><div className="packet-trail" aria-hidden="true" /><div className="h-20 overflow-hidden border border-border/70"><SourceArt track={track} /></div><div><p className="text-xs text-muted">#{index + 1} · {track.sourceType.toUpperCase()}</p><p className="font-bold text-foreground">{track.submittedArtistName}</p>{track.publicSourceUrl ? <a href={track.publicSourceUrl} target="_blank" rel="noreferrer" className="text-sm text-foreground/85 underline-offset-2 hover:text-accent hover:underline">{track.submittedSongTitle}</a> : <p className="text-sm text-foreground/85">{track.submittedSongTitle}</p>}<div className="mt-2 text-xs text-muted"><TikTokLink handle={track.tiktokHandle} /></div>{style.stamp && <p className={`status-stamp mt-2 inline-flex border px-2 py-1 text-[10px] uppercase tracking-widest ${track.priorityUpgradeStatus === "checkout_pending" ? "border-[#ffaa00]/45 text-[#ffaa00]" : track.lane === "priority" || track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual" ? "border-[#ffaa00]/50 text-[#ffaa00]" : track.lane === "wheel" ? "border-cyan-200/45 text-cyan-200" : isCompletedLane ? "border-border text-muted" : "border-accent/35 text-accent"}`}>{style.stamp}</p>}{track.priorityUpgradeStatus === "requested" && <p className="mt-2 inline-flex border border-accent/30 px-2 py-1 text-[10px] uppercase tracking-widest text-accent">Priority checkout requested</p>}{(track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded") && <p className="mt-2 inline-flex border border-danger/40 px-2 py-1 text-[10px] uppercase tracking-widest text-danger">Track remains Free if still active</p>}</div><div className="space-y-2 sm:text-right"><p className="text-xs text-muted">{track.durationLabel}</p>{canResumePriorityPayment(track) && <button type="button" onClick={() => onPriorityPayment(track)} className="border border-[#ffaa00]/50 px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background">Resume Priority Payment</button>}{canPriorityUpgrade(track) && <button type="button" onClick={() => onPriorityUpgrade(track)} className="border border-[#ffaa00]/50 px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background">Upgrade to Priority Signal · {formatPrice(priorityPriceCents, priorityCurrency)}</button>}</div></article>; })}</div>}<style jsx>{`.queue-track-card{position:relative;overflow:hidden;transition:border-color .35s ease,box-shadow .35s ease,filter .35s ease}.queue-track-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;opacity:.75}.source-upload::before{background:linear-gradient(#fff,rgba(255,255,255,.2))}.source-link::before{background:linear-gradient(rgba(255,0,0,.8),rgba(255,0,0,.12))}.source-other::before{background:linear-gradient(rgba(255,255,255,.35),transparent)}.packet-lock{animation:packet-lock-in .95s ease-out;box-shadow:0 0 26px rgba(255,0,0,.20)}.payment-pending{animation:payment-pending-flicker 1.4s steps(2,end) infinite;box-shadow:0 0 20px rgba(255,170,0,.10)}.priority-lock{animation:priority-relay-lock 1.2s ease-out;box-shadow:0 0 24px rgba(255,170,0,.18)}.wheel-pulse{animation:wheel-signal-pulse 2.2s ease-in-out infinite;box-shadow:0 0 20px rgba(103,232,249,.12)}.completed-stamp{filter:saturate(.72)}.removed-stamp{filter:saturate(.65);box-shadow:0 0 18px rgba(255,0,0,.10)}.status-stamp{animation:status-stamp-in .42s ease-out}.mini-aperture{position:absolute;right:.75rem;top:.75rem;width:2.6rem;height:1.5rem;border:1px solid rgba(255,0,0,.32);box-shadow:0 0 18px rgba(255,0,0,.14),inset 0 0 12px rgba(255,255,255,.04);opacity:.72}.mini-aperture span{position:absolute;inset:24%;border:1px solid currentColor;color:rgba(255,0,0,.65);animation:mini-aperture-ring 1.4s ease-in-out infinite}.mini-aperture span:nth-child(2){inset:38%;animation-delay:.18s}.packet-trail{position:absolute;left:0;right:0;top:50%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.55),transparent);opacity:.45;animation:packet-trail-route 1.8s ease-in-out infinite}.payment-pending .mini-aperture{border-color:rgba(255,170,0,.48);box-shadow:0 0 20px rgba(255,170,0,.16)}.payment-pending .mini-aperture span,.payment-pending .packet-trail{color:rgba(255,170,0,.75);background:linear-gradient(90deg,transparent,rgba(255,170,0,.55),transparent)}.priority-lock .mini-aperture{border-color:rgba(255,170,0,.6);box-shadow:0 0 28px rgba(255,170,0,.24)}.priority-lock .mini-aperture span,.priority-lock .packet-trail{color:rgba(255,170,0,.85);background:linear-gradient(90deg,transparent,rgba(255,170,0,.68),transparent)}.wheel-pulse .mini-aperture{border-color:rgba(103,232,249,.6);box-shadow:0 0 24px rgba(103,232,249,.18)}.wheel-pulse .mini-aperture span,.wheel-pulse .packet-trail{color:rgba(103,232,249,.85);background:linear-gradient(90deg,transparent,rgba(103,232,249,.62),transparent)}.completed-stamp .mini-aperture{border-color:rgba(183,183,183,.35);box-shadow:0 0 18px rgba(183,183,183,.10)}.removed-stamp .mini-aperture{border-color:rgba(255,0,0,.55);transform:scaleX(.7);opacity:.45}@keyframes packet-lock-in{0%{transform:translateY(5px);filter:brightness(1.5)}100%{transform:translateY(0);filter:brightness(1)}}@keyframes payment-pending-flicker{0%,100%{border-color:rgba(255,170,0,.28)}50%{border-color:rgba(255,170,0,.65)}}@keyframes priority-relay-lock{0%{box-shadow:0 0 0 rgba(255,170,0,0);filter:brightness(1.6)}100%{box-shadow:0 0 24px rgba(255,170,0,.18);filter:brightness(1)}}@keyframes wheel-signal-pulse{0%,100%{border-color:rgba(103,232,249,.28)}50%{border-color:rgba(103,232,249,.72)}}@keyframes status-stamp-in{0%{transform:scale(.96);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes mini-aperture-ring{0%,100%{transform:scale(.9);opacity:.35}50%{transform:scale(1.12);opacity:.9}}@keyframes packet-trail-route{0%,100%{transform:scaleX(.08);opacity:.12}50%{transform:scaleX(1);opacity:.62}}@media (prefers-reduced-motion: reduce){.packet-lock,.payment-pending,.priority-lock,.wheel-pulse,.status-stamp,.mini-aperture span,.packet-trail{animation:none}}`}</style></section>;
}

function PriorityUpgradeModal({ track, price, pending, message, onConfirm, onClose }: { track: QueuePublicTrack; price: string; pending: boolean; message: string | null; onConfirm: () => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-[10050] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="w-full max-w-md border border-[#ffaa00]/50 bg-background p-5 shadow-[0_0_70px_rgba(255,170,0,0.22)]"><p className="text-xs uppercase tracking-[0.35em] text-[#ffaa00]">{PRIORITY_SIGNAL_LABEL}</p><h2 className="mt-3 text-2xl font-bold text-foreground">Upgrade this track</h2><div className="mt-4 border border-border bg-surface p-3 text-sm"><p className="font-bold text-foreground">{track.submittedArtistName} — {track.submittedSongTitle}</p>{track.tiktokHandle && <p className="mt-1 text-xs text-muted">TikTok/social: {track.tiktokHandle}</p>}<p className="mt-1 text-xs text-muted">Source: {sourceTypeLabel(track)}</p><p className="mt-3 text-lg font-bold text-[#ffaa00]">{price}</p></div><div className="mt-4 border border-border bg-surface p-3 text-xs text-muted"><p>{PRIORITY_SIGNAL_EXPLANATION}</p><p>Priority Signals clear before Wheel Chosen and Free Transmissions.</p><p>Funds BARCODE Network broadcast systems.</p><p className="mt-2">Payment confirmation may take a moment. Queue position may shift during checkout.</p></div>{message && <p className="mt-3 border border-accent/30 bg-accent/5 p-2 text-xs text-accent">{message}</p>}<div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">Cancel</button><button type="button" onClick={onConfirm} disabled={pending} className="border border-[#ffaa00]/60 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background disabled:opacity-50">{pending ? "Opening checkout…" : "Continue to Payment"}</button></div></div></div>;
}

function formatCooldown(seconds: number): string { const minutes = Math.floor(seconds / 60).toString().padStart(2, "0"); const rest = Math.max(0, seconds % 60).toString().padStart(2, "0"); return `${minutes}:${rest}`; }
function DiscordQueueCTA() { return <section className="border border-accent/40 bg-accent/5 p-5"><p className="text-xs uppercase tracking-[0.3em] text-accent">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for BARCODE Radio queue updates and future signal alerts.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-4 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Join Discord</a></section>; }
