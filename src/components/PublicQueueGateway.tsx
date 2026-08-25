/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { externalLinks } from "@/content";
import { buildQueueTimingDisplay, queueTimingInputFromPublicSnapshot, type QueueTimingDisplaySummary } from "@/lib/queue-timing-display";
import { confirmedPriorityPurchaseDisplay, formatRuntime, type QueuePublicSnapshot, type QueuePublicTrack } from "@/lib/queue-types";
import { PUBLIC_QUEUE_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { hasActiveQueueSession, startSessionBoundPolling } from "@/lib/session-bound-polling";

type GatewayPhase = "syncing" | "empty" | "archived" | "closed" | "open" | "liveOpen" | "liveClosed";

function stableHash(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash;
}

function stableVariant<T>(seed: string, variants: T[]): T {
  return variants[stableHash(seed) % variants.length] ?? variants[0];
}

function pressureLevel(summary: QueueTimingDisplaySummary | null): "low" | "medium" | "high" {
  if (!summary || !summary.pressureSummary.isLive) return "low";
  if (summary.pressureSummary.level === "critical" || summary.pressureSummary.level === "high") return "high";
  if (summary.pressureSummary.level === "medium") return "medium";
  return "low";
}

function terminalReadouts(snapshot: QueuePublicSnapshot | null, counts: ReturnType<typeof publicCounts>, pressure: ReturnType<typeof pressureLevel>): string[] {
  const lines = [
    counts.active > 0 ? `${counts.active} songs still waiting or coming up.` : "No songs still waiting or coming up.",
    counts.waiting > 0 ? `${counts.waiting} waiting below Now Playing and Next In Line.` : "Waiting queue clear.",
  ];
  if (counts.pending > 0) lines.push(`${counts.pending} Payment Processing: checkout started. Skip is not active yet.`);
  if (counts.priority > 0) lines.push("Priority Signal active.");
  if (counts.wheel > 0) lines.push("Wheel Chosen: picked from the 10K tap wheel.");
  if (counts.completed > 0) lines.push(`${counts.completed} songs already played.`);
  if (pressure === "high") lines.push("Archive pressure rising.");
  const flavorSeed = `${snapshot?.session?.sessionId ?? "sync"}:${counts.total}:${pressure}`;
  const flavor = ["BNL-01 receiver trace stabilized.", "Host band interference cleared.", "Corridor alignment corrected.", "Signal anomaly contained."];
  if (stableHash(flavorSeed) % 13 === 0) lines.push(stableVariant(flavorSeed, flavor));
  return lines.slice(0, 5);
}

type NavigationVariant = { label: string; detail: string; mode: string; kind: "monitor" };
const ENTRY_STORAGE_PREFIX = "barcode-queue-entered:";

function navigationVariant(snapshot: QueuePublicSnapshot | null, fallbackSeed: string): NavigationVariant {
  void fallbackSeed;
  const broadcastActive = isBroadcastActive(snapshot);
  const submissionsOpen = snapshot?.status.isOpen === true;
  const detail = broadcastActive && !submissionsOpen ? "BROADCAST LIVE / INTAKE SEALED" : broadcastActive ? "HOST BAND LIVE" : submissionsOpen ? "INTAKE CORRIDOR ACTIVE" : "RECEIVER STANDBY ONLINE";
  return { label: "WELCOME TO BARCODE RADIO", detail, mode: "SESSION MONITOR LOCKED", kind: "monitor" };
}

function isBroadcastActive(snapshot: QueuePublicSnapshot | null): boolean {
  if (!snapshot?.session) return false;
  return Boolean(snapshot.nowPlaying || snapshot.session.broadcastPhase === "broadcast_active" || snapshot.session.showStarted);
}

function phaseForSnapshot(snapshot: QueuePublicSnapshot | null): GatewayPhase {
  if (!snapshot) return "syncing";
  if (!snapshot.session) return "empty";
  if (snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended") return "archived";
  if (isBroadcastActive(snapshot)) return snapshot.status.isOpen ? "liveOpen" : "liveClosed";
  return snapshot.status.isOpen ? "open" : "closed";
}

function phaseCopy(phase: GatewayPhase) {
  if (phase === "syncing") return { eyebrow: "SYNCING PUBLIC SIGNAL", title: "QUEUE TERMINAL HANDSHAKE", body: "Reading the current BARCODE Radio queue before opening the monitor.", tone: "text-muted", border: "border-border", glow: "shadow-[0_0_36px_rgba(255,255,255,0.06)]", gate: "SIGNAL SEARCH" };
  if (phase === "empty") return { eyebrow: "NO ACTIVE QUEUE", title: "RECEIVER STANDBY", body: "The queue service is online, but no BARCODE Radio session currently exists.", tone: "text-muted", border: "border-border", glow: "shadow-[0_0_36px_rgba(255,255,255,0.06)]", gate: "NO SESSION" };
  if (phase === "archived") return { eyebrow: "BROADCAST ENDED", title: "SESSION ARCHIVED", body: "SUBMISSIONS CLOSED. No active BARCODE Radio session is currently accepting songs.", tone: "text-danger", border: "border-danger/35", glow: "shadow-[0_0_44px_rgba(255,0,0,0.12)]", gate: "ARCHIVE SEAL" };
  if (phase === "closed") return { eyebrow: "BARCODE RECEIVER ONLINE", title: "SUBMISSION GATE CLOSED", body: "The underground receiver is powered and standing by. Stand by for intake access.", tone: "text-cyan-200", border: "border-cyan-200/30", glow: "shadow-[0_0_46px_rgba(103,232,249,0.10)]", gate: "GATE SEALED" };
  if (phase === "open") return { eyebrow: "INTAKE CORRIDOR OPEN", title: "BARCODE NETWORK ACCEPTING SONGS", body: "Free queue submissions are open. Priority Signal is a paid skip after payment clears.", tone: "text-accent", border: "border-accent/50", glow: "shadow-[0_0_64px_rgba(255,0,0,0.20)]", gate: "INTAKE UNLOCKED" };
  if (phase === "liveClosed") return { eyebrow: "BROADCAST ACTIVE", title: "HOST PROTOCOL INITIALIZED", body: "Broadcast playback is live. The intake gate is resealed, but the queue remains active until tracks are finished or removed.", tone: "text-[#ffaa00]", border: "border-[#ffaa00]/50", glow: "shadow-[0_0_70px_rgba(255,170,0,0.18)]", gate: "LIVE / INTAKE CLOSED" };
  return { eyebrow: "BROADCAST ACTIVE", title: "HOST PROTOCOL INITIALIZED", body: "Live monitor locked. Submissions remain open while the show is running.", tone: "text-[#ffaa00]", border: "border-[#ffaa00]/50", glow: "shadow-[0_0_70px_rgba(255,170,0,0.20)]", gate: "LIVE / INTAKE OPEN" };
}

function uniqueActiveTracks(snapshot: QueuePublicSnapshot | null): QueuePublicTrack[] {
  if (!snapshot?.session || snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended") return [];
  const seen = new Set<string>();
  return [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue].filter((track): track is QueuePublicTrack => {
    if (!track || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function publicCounts(snapshot: QueuePublicSnapshot | null) {
  const activeTracks = uniqueActiveTracks(snapshot);
  const completed = snapshot?.session?.completedCount ?? snapshot?.completed.length ?? 0;
  const removed = snapshot?.session?.removedCount ?? 0;
  return {
    active: activeTracks.length,
    remaining: activeTracks.length,
    waiting: snapshot?.queue.length ?? 0,
    completed,
    total: activeTracks.length + completed + removed,
    pending: activeTracks.filter((track) => track.priorityUpgradeStatus === "checkout_pending").length,
    priority: activeTracks.filter((track) => track.lane === "priority" && (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual")).length,
    wheel: activeTracks.filter((track) => track.lane === "wheel").length,
  };
}

export function PublicQueueGateway() {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [portalState, setPortalState] = useState<"sealed" | "opening" | "open">("sealed");
  const [transitionPulse, setTransitionPulse] = useState<GatewayPhase | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<(NavigationVariant & { href: string }) | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [mounted, setMounted] = useState(false);
  const phaseRef = useRef<GatewayPhase>("syncing");
  const wasOpen = useRef(false);

  async function load() {
    const res = await fetch("/api/queue", { cache: "no-store" });
    if (res.ok) {
      const next = await res.json() as QueuePublicSnapshot;
      const nextOpen = Boolean(next.status?.isOpen);
      const nextPhase = phaseForSnapshot(next);
      if (phaseRef.current !== nextPhase) {
        phaseRef.current = nextPhase;
        setTransitionPulse(nextPhase);
        window.setTimeout(() => setTransitionPulse(null), 1400);
      }
      if (!wasOpen.current && nextOpen) {
        setPortalState("opening");
        window.setTimeout(() => setPortalState("open"), 900);
      } else if (!nextOpen) {
        setPortalState("sealed");
      }
      wasOpen.current = nextOpen;
      setSnapshot(next);
      return hasActiveQueueSession(next);
    }
    return null;
  }

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    return startSessionBoundPolling({
      intervalMs: PUBLIC_QUEUE_POLL_INTERVAL_MS,
      poll: async () => {
        setNowMs(Date.now());
        return load();
      },
    });
  }, []);

  function beginNavigation(event: React.MouseEvent<HTMLAnchorElement>, href: string, activeSessionId: string) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const storageKey = `${ENTRY_STORAGE_PREFIX}${activeSessionId}`;
    try {
      if (window.localStorage.getItem(storageKey)) {
        window.location.assign(href);
        return;
      }
      window.localStorage.setItem(storageKey, "1");
    } catch {
      window.location.assign(href);
      return;
    }
    setPendingNavigation({ href, ...navigationVariant(snapshot, session?.sessionId ?? href) });
    window.setTimeout(() => { window.location.assign(href); }, 6000);
  }

  const phase = phaseForSnapshot(snapshot);
  const copy = phaseCopy(phase);
  const counts = publicCounts(snapshot);
  const session = snapshot?.session;
  const timingSummary = snapshot ? buildQueueTimingDisplay(queueTimingInputFromPublicSnapshot(snapshot), nowMs > 0 ? { now: new Date(nowMs) } : {}) : null;
  const pressure = pressureLevel(timingSummary);
  const readouts = terminalReadouts(snapshot, counts, pressure);
  const routePulses = pressure === "high" ? 5 : pressure === "medium" ? 4 : 3;
  const intakeWindowMs = session?.preShowEndsAt ? new Date(session.preShowEndsAt).getTime() - nowMs : 0;
  const intakeWindow = Number.isFinite(intakeWindowMs) && intakeWindowMs > 0 ? `${Math.floor(intakeWindowMs / 60000)}:${Math.floor((intakeWindowMs % 60000) / 1000).toString().padStart(2, "0")}` : null;

  const hasActiveSession = Boolean(session && session.status !== "archived");
  const activeSessionId = hasActiveSession ? session?.sessionId ?? null : null;
  const queueHref = activeSessionId ? `/queue/${activeSessionId}` : null;

  return (
    <div className={`space-y-6 ${hasActiveSession ? "pb-24" : ""}`}>
      {hasActiveSession ? <section className="border border-accent/60 bg-accent/10 p-5 shadow-[0_0_34px_rgba(255,0,0,0.12)]">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">BARCODE Radio Queue</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Current queue is online</h1>
        <p className="mt-2 text-sm text-muted">{snapshot?.status.isOpen ? "Submissions are open. Open the queue to submit your track." : "Submissions are closed, but you can still view the queue."}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
          <span className={`${snapshot?.status.isOpen ? "border-accent/60 text-accent" : "border-border text-muted"} border px-2 py-1`}>Submissions: {snapshot?.status.isOpen ? "Open" : "Closed"}</span>
          <span className={`${isBroadcastActive(snapshot) ? "border-[#ffaa00]/55 text-[#ffaa00]" : "border-border text-muted"} border px-2 py-1`}>Broadcast: {isBroadcastActive(snapshot) ? "Active" : "Standby"}</span>
        </div>
        <a href={queueHref ?? "#"} onClick={(event) => queueHref && activeSessionId && beginNavigation(event, queueHref, activeSessionId)} aria-busy={Boolean(pendingNavigation)} className="nav-corridor-link mt-4 inline-flex w-full cursor-pointer items-center justify-center border border-accent bg-accent px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-red-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">OPEN CURRENT QUEUE</a>
      </section> : <section className="border border-border bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">Queue Status</p>
        <p className="mt-2 text-xs uppercase tracking-[0.35em] text-muted">BARCODE Radio Queue</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Current queue is offline</h1>
        <p className="mt-3 text-sm text-muted">No active BARCODE Radio queue is available right now.</p>
      </section>}
      <section aria-label="BARCODE Radio companion destinations">
        <a href="/radio/archive" className="group border border-cyan-200/40 bg-cyan-200/5 p-5 transition hover:border-cyan-200 hover:bg-cyan-200/10"><p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200">Post-show database</p><h2 className="mt-2 text-xl font-black text-foreground group-hover:text-cyan-200">The Broadcast Archive</h2><p className="mt-2 text-sm leading-relaxed text-muted">Search completed shows and artist histories, including submitting TikTok handles, tracks, links, outcomes, and Wheel selections.</p><span className="mt-4 inline-flex text-xs font-bold uppercase tracking-widest text-cyan-200">Browse Archive →</span></a>
      </section>
      <section className="border border-border bg-surface p-5 space-y-5">
      <section>
        <p className="text-xs uppercase tracking-[0.35em] text-muted">Broadcast State</p>
      <section data-phase={phase} data-pressure={pressure} data-transition={transitionPulse ?? undefined} className={`queue-machine mt-3 relative overflow-hidden border bg-surface p-5 ${copy.border} ${copy.glow}`}>
        <div className="gateway-scanlines pointer-events-none absolute inset-0" />
        <div className="route-field pointer-events-none absolute inset-0">{Array.from({ length: routePulses }).map((_, index) => <span key={index} style={{ top: `${28 + index * (44 / Math.max(1, routePulses - 1))}%`, animationDelay: `${index * 140}ms` }} />)}</div>
        <div className="relative space-y-5">
          <div>
            <p className={`text-xs uppercase tracking-[0.35em] ${copy.tone}`}>{copy.eyebrow}</p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-muted">Portal state: {portalState} · Broadcast: {isBroadcastActive(snapshot) ? "active" : "standby"} · Submissions: {snapshot?.status.isOpen ? "open" : "closed"}</p>
            <h2 className={`mt-4 text-2xl font-bold ${copy.tone}`}>{copy.title}</h2>
            <p className="mt-3 text-sm text-muted">{copy.body}</p>
          </div>
          <div className="gate-graphic border border-border/70 bg-background/50 p-4">
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.25em]"><span className={copy.tone}>{copy.gate}</span><span className="text-muted">BARCODE RADIO</span></div>
            <GatewayPortalAperture phase={phase} counts={counts} intakeWindow={intakeWindow} />
          </div>
          <div className="terminal-readouts grid gap-2 border border-border/70 bg-background/45 p-3 text-xs text-muted">{readouts.map((line) => <p key={line} className="font-mono uppercase tracking-[0.16em]">{line}</p>)}</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <StatCard label="Remaining" value={counts.remaining} helper="Songs still waiting or coming up." />
            <StatCard label="Waiting Below" value={counts.waiting} helper="Songs below Now Playing and Next In Line." />
            <StatCard label="Total Received" value={counts.total} helper="Songs submitted this session." />
            <StatCard label="Played Tonight" value={counts.completed} helper="Songs already played." />
            {counts.pending > 0 && <StatCard label="Payment Processing" value={counts.pending} helper="Checkout started. Skip is not active yet." accent="text-[#ffaa00]" />}
            <StatCard label="Priority Confirmed" value={counts.priority} helper="Payment cleared. Priority Signal active." accent="text-[#ffaa00]" />
            <StatCard label="Wheel Chosen" value={counts.wheel} helper="Picked from the 10K tap wheel." />
            <StatCard label="Runtime" value={timingSummary ? formatRuntime(timingSummary.timeBankSummary.remainingProjectionSeconds) : "—"} helper="Estimated time for songs still waiting." />
          </div>
        </div>
      </section>
      </section>
      <section className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">Session Access</p>
        <p className="text-sm text-muted">Public counts help you see what is playing, coming up, and still waiting.</p>
        {snapshot?.nowPlaying && <BroadcastSlot label="Now Playing" track={snapshot.nowPlaying} tone="text-[#ffaa00]" />}
        {snapshot?.upNext && <BroadcastSlot label="Next In Line" track={snapshot.upNext} tone="text-accent" />}
        {snapshot?.status.isFull && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">Queue is full for new songs.</p>}
        <p className="text-xs text-muted">Use the OPEN CURRENT QUEUE button above to access the active session monitor and submission flow.</p>
        <div className="border border-border bg-background/40 p-4"><p className="text-xs uppercase tracking-[0.25em] text-muted">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for queue updates and BARCODE Radio signal alerts.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-3 inline-flex border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Join Discord</a></div>
      </section>
      </section>
      {hasActiveSession && queueHref && activeSessionId && <section className="fixed inset-x-0 bottom-0 z-40 border-t border-accent/40 bg-background/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] uppercase tracking-[0.2em] text-accent">BARCODE Radio Queue</p>
            <p className="text-[11px] text-muted">Submissions: {snapshot?.status.isOpen ? "Open" : "Closed"}</p>
          </div>
          <a href={queueHref} onClick={(event) => beginNavigation(event, queueHref, activeSessionId)} aria-busy={Boolean(pendingNavigation)} className="nav-corridor-link inline-flex shrink-0 cursor-pointer items-center justify-center border border-accent bg-accent px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">OPEN CURRENT QUEUE</a>
        </div>
      </section>}
      {mounted && pendingNavigation && createPortal(<AsciiSessionPortalIntro label={pendingNavigation.label} detail={pendingNavigation.detail} mode={pendingNavigation.mode} seed={pendingNavigation.href} href={pendingNavigation.href} onSkip={() => { window.location.assign(pendingNavigation.href); }} />, document.body)}
      <style jsx>{`.queue-machine{transition:border-color .7s ease,box-shadow .7s ease,filter .7s ease}.gateway-scanlines{background:linear-gradient(transparent 50%,rgba(255,255,255,.07) 50%);background-size:100% 7px;animation:gateway-scan 3s linear infinite;opacity:.18}.route-field span{position:absolute;left:12%;right:12%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.55),transparent);animation:route-energy 2.6s ease-in-out infinite}.queue-machine[data-pressure="low"] .gateway-scanlines{animation-duration:4.8s;opacity:.11}.queue-machine[data-pressure="low"] .route-field span{animation-duration:3.8s;opacity:.45}.queue-machine[data-pressure="medium"] .gateway-scanlines{animation-duration:3s;opacity:.18}.queue-machine[data-pressure="high"] .gateway-scanlines{animation-duration:1.8s;opacity:.26}.queue-machine[data-pressure="high"] .route-field span{animation-duration:1.55s;box-shadow:0 0 14px rgba(255,170,0,.28)}.route-field span:nth-child(1){top:32%}.route-field span:nth-child(2){top:50%;animation-delay:.35s}.route-field span:nth-child(3){top:68%;animation-delay:.7s}.gate-bar{transition:transform .7s ease,opacity .7s ease,background-color .7s ease}.queue-machine[data-phase="archived"]{filter:saturate(.55)}.queue-machine[data-phase="archived"] .gateway-scanlines{opacity:.08;animation-duration:5s}.queue-machine[data-phase="closed"] .gate-bar{background:rgba(103,232,249,.10)}.queue-machine[data-phase="open"] .gate-bar{transform:scaleY(.45);background:rgba(255,0,0,.16)}.queue-machine[data-phase="liveOpen"] .gate-bar,.queue-machine[data-phase="liveClosed"] .gate-bar{background:rgba(255,170,0,.14)}.queue-machine[data-phase="liveClosed"] .gate-bar:nth-child(even){transform:scaleY(.35);opacity:.45}.queue-machine[data-transition]{animation:terminal-mode-swap 1.2s ease-out}.submission-window{animation:window-arrive .9s ease-out}.nav-corridor-link{position:relative;overflow:hidden}.nav-corridor-link::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,0,0,.24),transparent);transform:translateX(-110%);transition:transform .55s ease}.nav-corridor-link[aria-busy="true"]::after{transform:translateX(110%)}.nav-corridor-overlay{animation:nav-corridor-fade .18s ease-out}.nav-corridor-panel{animation:nav-corridor-enter .72s ease-out}.nav-corridor-bit{animation:nav-bit-converge .72s ease-in-out forwards}.nav-corridor-bit:nth-child(even){animation-delay:.04s}.stat-card{transition:border-color .35s ease,transform .35s ease}.stat-card:hover{transform:translateY(-1px);border-color:rgba(255,0,0,.45)}.portal-frame{perspective:900px;box-shadow:inset 0 0 34px rgba(255,255,255,.05)}.portal-tunnel{background:radial-gradient(ellipse at center,rgba(255,255,255,.08),transparent 18%,rgba(255,0,0,.12) 28%,transparent 52%),repeating-linear-gradient(90deg,transparent 0 7%,rgba(255,255,255,.06) 7% calc(7% + 1px),transparent calc(7% + 1px) 14%);transform:scale(.96);animation:portal-breathe 3.2s ease-in-out infinite}.portal-grid{background:linear-gradient(115deg,transparent 46%,rgba(255,0,0,.20) 50%,transparent 54%),linear-gradient(65deg,transparent 46%,rgba(255,255,255,.12) 50%,transparent 54%);clip-path:polygon(12% 0,88% 0,58% 100%,42% 100%);opacity:.6;animation:portal-grid-drift 2.8s linear infinite}.portal-rings span{position:absolute;inset:18%;border:1px solid rgba(255,255,255,.16);box-shadow:0 0 28px rgba(255,0,0,.16);animation:portal-ring 2.6s ease-in-out infinite}.portal-rings span:nth-child(2){inset:27%;border-color:rgba(255,0,0,.42);animation-delay:.22s}.portal-rings span:nth-child(3){inset:38%;border-color:rgba(255,255,255,.28);animation-delay:.44s}.portal-wave{display:flex;align-items:center;justify-content:center;gap:4px}.portal-wave span{width:3px;height:18%;background:rgba(255,170,0,.75);box-shadow:0 0 14px rgba(255,170,0,.35);animation:portal-wave 900ms ease-in-out infinite}.portal-packets span{position:absolute;left:8%;top:50%;width:22%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.85),#fff);transform-origin:right center;animation:portal-packet 1.6s ease-in-out infinite}.portal-packets span:nth-child(even){left:auto;right:8%;background:linear-gradient(270deg,transparent,rgba(255,0,0,.85),#fff);transform-origin:left center}.portal-shutters span{position:absolute;left:8%;right:8%;height:44%;border:1px solid rgba(255,255,255,.12);background:linear-gradient(rgba(0,0,0,.72),rgba(255,255,255,.04));transition:transform .7s ease,opacity .7s ease}.portal-shutters span:first-child{top:0}.portal-shutters span:last-child{bottom:0}.portal-aperture[data-phase="open"] .portal-shutters span,.portal-aperture[data-phase="liveOpen"] .portal-shutters span{transform:translateY(-76%);opacity:.38}.portal-aperture[data-phase="open"] .portal-shutters span:last-child,.portal-aperture[data-phase="liveOpen"] .portal-shutters span:last-child{transform:translateY(76%)}.portal-aperture[data-phase="liveClosed"] .portal-shutters span:first-child{transform:translateY(-55%);opacity:.42}.portal-aperture[data-phase="liveClosed"] .portal-shutters span:last-child{transform:translateY(55%);opacity:.42}.portal-aperture[data-phase="closed"] .portal-rings span{border-color:rgba(103,232,249,.22);box-shadow:0 0 24px rgba(103,232,249,.12)}.portal-aperture[data-phase="syncing"] .portal-frame{animation:receiver-tune .9s steps(2,end) infinite}.portal-aperture[data-phase="syncing"] .portal-shutters span{opacity:.65}.portal-aperture[data-phase="archived"] .portal-tunnel,.portal-aperture[data-phase="archived"] .portal-grid,.portal-aperture[data-phase="archived"] .portal-packets{opacity:.12;animation-duration:6s}.archive-seal span{border:1px solid rgba(255,0,0,.45);background:rgba(0,0,0,.72);padding:.75rem 1rem;color:#ff3b3b;font-size:.7rem;letter-spacing:.32em;transform:rotate(-8deg);box-shadow:0 0 34px rgba(255,0,0,.14)}.portal-handshake{animation:portal-handshake 1s steps(2,end) infinite}.portal-relay-line{box-shadow:0 0 18px rgba(255,170,0,.55)}.portal-wheel-line{box-shadow:0 0 18px rgba(103,232,249,.55)}.nav-route-lines span{position:absolute;left:50%;top:50%;width:58vw;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.45),transparent);transform-origin:left center;animation:nav-route-converge .72s ease-in forwards}.nav-route-lines span:nth-child(odd){background:linear-gradient(90deg,transparent,rgba(255,255,255,.32),transparent)}.nav-route-lines span:nth-child(1){transform:rotate(0deg)}.nav-route-lines span:nth-child(2){transform:rotate(18deg)}.nav-route-lines span:nth-child(3){transform:rotate(36deg)}.nav-route-lines span:nth-child(4){transform:rotate(54deg)}.nav-route-lines span:nth-child(5){transform:rotate(72deg)}.nav-route-lines span:nth-child(6){transform:rotate(90deg)}.nav-route-lines span:nth-child(7){transform:rotate(108deg)}.nav-route-lines span:nth-child(8){transform:rotate(126deg)}.nav-route-lines span:nth-child(9){transform:rotate(144deg)}.nav-route-lines span:nth-child(10){transform:rotate(162deg)}.nav-aperture{position:relative;width:9rem;height:5rem;border:1px solid rgba(255,0,0,.42);box-shadow:0 0 42px rgba(255,0,0,.22),inset 0 0 24px rgba(255,255,255,.06);animation:nav-aperture-open .72s ease-out}.nav-aperture span{position:absolute;inset:18%;border:1px solid rgba(255,255,255,.20);animation:portal-ring 1.1s ease-in-out infinite}.nav-corridor-overlay[data-kind="monitor"] .nav-route-lines span{background:linear-gradient(90deg,transparent,rgba(103,232,249,.32),transparent);animation-name:receiver-scan-lock}.nav-corridor-overlay[data-kind="monitor"] .nav-aperture{border-color:rgba(103,232,249,.45);box-shadow:0 0 42px rgba(103,232,249,.16),inset 0 0 24px rgba(255,255,255,.06)}@keyframes gateway-scan{from{background-position:0 0}to{background-position:0 56px}}@keyframes route-energy{0%,100%{opacity:.08;transform:scaleX(.15)}45%{opacity:.75;transform:scaleX(1)}}@keyframes terminal-mode-swap{0%{clip-path:inset(0 100% 0 0);filter:brightness(1.7)}38%{clip-path:inset(0 0 0 0);filter:brightness(1.25)}100%{filter:brightness(1)}}@keyframes window-arrive{0%{opacity:0;transform:translateY(8px);box-shadow:0 0 0 rgba(255,0,0,0)}100%{opacity:1;transform:translateY(0);box-shadow:0 0 26px rgba(255,0,0,.16)}}@keyframes nav-corridor-fade{from{opacity:0}to{opacity:1}}@keyframes nav-corridor-enter{0%{transform:scale(.98);filter:brightness(1.8)}100%{transform:scale(1);filter:brightness(1)}}@keyframes nav-bit-converge{0%{transform:scaleY(.25);opacity:.35}55%{transform:scaleY(1);opacity:1}100%{transform:scaleY(.45);opacity:.72}}@keyframes portal-breathe{0%,100%{transform:scale(.94);opacity:.68}50%{transform:scale(1.02);opacity:1}}@keyframes portal-grid-drift{from{background-position:0 0}to{background-position:42px 0}}@keyframes portal-ring{0%,100%{transform:scale(.92);opacity:.38}50%{transform:scale(1.06);opacity:.95}}@keyframes portal-wave{0%,100%{height:16%;opacity:.45}50%{height:86%;opacity:1}}@keyframes portal-packet{0%{opacity:0;transform:translateX(-30%) scaleX(.18)}45%{opacity:1}100%{opacity:0;transform:translateX(155%) scaleX(.04)}}@keyframes receiver-tune{0%,100%{filter:brightness(1) contrast(1)}50%{filter:brightness(1.8) contrast(1.35)}}@keyframes portal-handshake{0%,100%{opacity:.55}50%{opacity:1}}@keyframes nav-route-converge{0%{opacity:0;transform:scaleX(1.2)}60%{opacity:.9}100%{opacity:0;transform:scaleX(.06)}}@keyframes receiver-scan-lock{0%{opacity:0;transform:scaleX(.1)}55%{opacity:.8;transform:scaleX(1)}100%{opacity:0;transform:scaleX(.4)}}@keyframes nav-aperture-open{0%{transform:scale(.55);filter:brightness(1.8)}100%{transform:scale(1);filter:brightness(1)}}@media (prefers-reduced-motion: reduce){.gateway-scanlines,.route-field span,.queue-machine[data-transition],.submission-window,.nav-corridor-overlay,.nav-corridor-panel,.nav-corridor-bit,.portal-tunnel,.portal-grid,.portal-rings span,.portal-wave span,.portal-packets span,.portal-handshake,.nav-route-lines span,.nav-aperture,.nav-aperture span{animation:none}.nav-corridor-link::after{display:none}.stat-card:hover{transform:none}.gate-bar{transition:none}}`}</style>
    </div>
  );
}

function AsciiSessionPortalIntro({ label, detail, mode, seed, href, onSkip }: { label: string; detail: string; mode: string; seed: string; href: string; onSkip: () => void }) {
  const glyphs = ["#", "/", "\\", "|", "-", "_", "+", "=", "*", ".", ":", ";", "<", ">", "[", "]", "{", "}", "0", "1", "█", "▓", "▒", "░"];
  const ringText = "# / \\ | - _ + = * . : ; < > [ ] { } 0 1 █ ▓ ▒ ░";
  const tunnelRows = ["/////=====#####_____000111", "[[]]{}{}::::;;;;++++****", "▓▒░█░▒▓__--||\\\\//<<>>"];
  const noise = Array.from({ length: 72 }).map((_, index) => glyphs[stableHash(`${seed}:noise:${index}`) % glyphs.length]);
  const streams = Array.from({ length: 14 }).map((_, index) => tunnelRows[stableHash(`${seed}:stream:${index}`) % tunnelRows.length]);
  const phaseTimings = [0, 1, 2.2, 3.5, 4.7, 5.42];
  const phases = [
    { label: "BARCODE SIGNAL DETECTED", chatter: "SIGNAL LEAK CONFIRMED" },
    { label: "CORRUPTED RECEIVER CALIBRATING", chatter: "NETWORK STATIC COMPENSATED" },
    { label: "BARCODE NETWORK HANDSHAKE", chatter: "UNAUTHORIZED SIGNAL PATH STABLE" },
    { label: "HOST BAND ALIGNING", chatter: "MONITOR PATH STABLE" },
    { label: mode, chatter: "BARCODE RECEIVER ONLINE" },
    { label, chatter: detail },
  ];
  return (
    <div className="ascii-session-overlay fixed inset-0 z-[9900] overflow-hidden bg-black p-4 text-center font-mono text-emerald-200" role="status" aria-live="polite">
      <div className="ascii-blackout pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="ascii-crt pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="ascii-vignette pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="ascii-noise pointer-events-none absolute inset-0" aria-hidden="true">{noise.map((char, index) => <span key={index} style={{ left: `${(stableHash(`${seed}:x:${index}`) % 96) + 2}%`, top: `${(stableHash(`${seed}:y:${index}`) % 92) + 4}%`, animationDelay: `${index * 37}ms` }}>{char}</span>)}</div>
      <div className="ascii-streams pointer-events-none absolute inset-0" aria-hidden="true">{streams.map((stream, index) => <span key={`${stream}-${index}`} style={{ top: `${12 + index * 5.6}%`, animationDelay: `${index * 95}ms` }}>{stream}</span>)}</div>
      <div className="ascii-calibration pointer-events-none absolute inset-0" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="ascii-portal absolute left-1/2 top-[44%] h-[min(68vw,64vh)] w-[min(68vw,64vh)] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <div className="ascii-tunnel-row row-a">{ringText}</div>
        <div className="ascii-tunnel-row row-b">{ringText}</div>
        <div className="ascii-tunnel-row row-c">{ringText}</div>
        <div className="ascii-ring ascii-ring-outer">{ringText}</div>
        <div className="ascii-ring ascii-ring-middle">{ringText}</div>
        <div className="ascii-ring ascii-ring-inner">{ringText}</div>
        <div className="ascii-core">[BARCODE]</div>
        <div className="ascii-barcode-band">B A R C O D E</div>
      </div>
      <button type="button" onClick={onSkip} className="absolute right-4 top-4 z-30 border border-emerald-300/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-200 hover:bg-emerald-200 hover:text-black">Enter Now</button>
      <a href={href} className="sr-only">Enter current queue now</a>
      <div className="ascii-phase-stack absolute inset-x-3 bottom-[clamp(1.5rem,8vh,5rem)] z-20 mx-auto grid min-h-[8.25rem] max-w-4xl place-items-center sm:inset-x-6">
        {phases.map((phase, index) => <div key={`${phase.label}:${index}`} className={`ascii-phase ${index === phases.length - 1 ? "ascii-phase-final" : ""}`} style={{ animationDelay: `${phaseTimings[index]}s` }}><p className="ascii-phase-label uppercase tracking-[0.34em]">{phase.label}</p><p className="ascii-phase-detail mt-2 uppercase tracking-[0.28em] text-emerald-200/75">{phase.chatter}</p></div>)}
      </div>
      <div className="ascii-final-hit pointer-events-none absolute inset-0 z-10" aria-hidden="true" />
      <style jsx>{`.ascii-session-overlay{isolation:isolate;background:#000;animation:ascii-overlay-exit 6s linear forwards}.ascii-blackout{z-index:0;background:#000}.ascii-crt{z-index:1;background:linear-gradient(transparent 50%,rgba(255,255,255,.05) 50%),radial-gradient(circle at center,rgba(16,185,129,.16),transparent 48%);background-size:100% 6px,100% 100%;animation:ascii-crt-sweep 950ms linear infinite}.ascii-vignette{z-index:2;background:radial-gradient(circle at center,transparent 0 34%,rgba(0,0,0,.72) 66%,#000 100%)}.ascii-noise,.ascii-streams,.ascii-calibration,.ascii-portal{z-index:3}.ascii-noise span{position:absolute;opacity:0;color:rgba(110,231,183,.62);text-shadow:0 0 10px rgba(110,231,183,.42);animation:ascii-noise 1.05s steps(2,end) infinite}.ascii-streams span{position:absolute;left:-22%;right:-22%;display:block;white-space:nowrap;color:rgba(110,231,183,.18);letter-spacing:.42em;text-shadow:0 0 12px rgba(110,231,183,.22);animation:ascii-stream-pull 6s cubic-bezier(.18,.82,.22,1) forwards}.ascii-streams span:nth-child(3n){color:rgba(255,170,0,.22);animation-duration:5.6s}.ascii-streams span:nth-child(even){animation-direction:reverse}.ascii-calibration span{position:absolute;background:rgba(110,231,183,.22);box-shadow:0 0 18px rgba(110,231,183,.22);animation:ascii-calibrate 6s ease-in-out forwards}.ascii-calibration span:nth-child(1),.ascii-calibration span:nth-child(2){left:50%;top:8%;bottom:8%;width:1px}.ascii-calibration span:nth-child(2){transform:translateX(-50%) rotate(90deg)}.ascii-calibration span:nth-child(3){left:12%;right:12%;top:50%;height:1px}.ascii-calibration span:nth-child(4){top:12%;bottom:12%;left:50%;width:1px}.ascii-portal{perspective:1000px;filter:drop-shadow(0 0 42px rgba(16,185,129,.38))}.ascii-tunnel-row{position:absolute;left:50%;top:50%;width:105%;color:rgba(110,231,183,.32);letter-spacing:.28em;white-space:nowrap;text-shadow:0 0 14px rgba(110,231,183,.34);transform-origin:center;animation:ascii-tunnel-row 6s cubic-bezier(.16,.8,.22,1) forwards}.ascii-tunnel-row.row-b{color:rgba(255,170,0,.26);animation-delay:.12s;animation-direction:reverse}.ascii-tunnel-row.row-c{color:rgba(255,255,255,.22);animation-delay:.24s}.ascii-ring{position:absolute;inset:0;display:grid;place-items:center;border:1px solid rgba(110,231,183,.28);border-radius:999px;white-space:pre-wrap;line-height:1.8;color:rgba(110,231,183,.82);text-shadow:0 0 12px rgba(110,231,183,.46);animation:ascii-ring-spin 6s cubic-bezier(.16,.8,.22,1) forwards}.ascii-ring-middle{inset:18%;animation-name:ascii-ring-spin-reverse;border-color:rgba(255,170,0,.32)}.ascii-ring-inner{inset:32%;animation-duration:5.2s}.ascii-core{position:absolute;inset:42%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.82);color:#fff;font-size:.65rem;letter-spacing:.3em;animation:ascii-core-open 6s ease-in-out forwards}.ascii-barcode-band{position:absolute;left:50%;top:50%;width:min(26rem,72vw);translate:-50% -50%;border:1px solid rgba(110,231,183,.35);background:rgba(0,0,0,.9);padding:.45rem .75rem;color:#fff;letter-spacing:.45em;opacity:0;box-shadow:0 0 42px rgba(110,231,183,.28);animation:ascii-barcode-band 6s ease-out forwards}.ascii-phase{position:absolute;inset:0;display:grid;place-items:center;align-content:center;border:1px solid rgba(110,231,183,.28);background:linear-gradient(180deg,rgba(0,0,0,.92),rgba(0,0,0,.84));box-shadow:0 0 56px rgba(0,0,0,.92),inset 0 0 34px rgba(110,231,183,.06);opacity:0;padding:1rem clamp(.9rem,3vw,1.5rem);animation:ascii-phase .66s ease-out forwards}.ascii-phase-final{border-color:rgba(255,170,0,.42);box-shadow:0 0 70px rgba(255,170,0,.16),0 0 70px rgba(0,0,0,.96),inset 0 0 34px rgba(255,170,0,.07);animation-name:ascii-phase-final}.ascii-phase-label{font-size:clamp(1rem,4vw,2.35rem);font-weight:900;line-height:1.08;color:#f8fff9;text-shadow:0 0 24px rgba(110,231,183,.38)}.ascii-phase-detail{font-size:clamp(.68rem,1.8vw,.95rem);line-height:1.45}.ascii-final-hit{opacity:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),rgba(255,170,0,.28),transparent);animation:ascii-final-hit 6s ease-out forwards}@keyframes ascii-overlay-exit{0%,94%{opacity:1}100%{opacity:0}}@keyframes ascii-crt-sweep{from{background-position:0 0,0 0}to{background-position:0 48px,0 0}}@keyframes ascii-noise{0%,100%{opacity:.05;transform:scale(.8)}50%{opacity:.48;transform:scale(1.12)}}@keyframes ascii-stream-pull{0%{opacity:.08;transform:translateX(-10%) scaleX(1.18)}36%{opacity:.34}78%{opacity:.48;transform:translateX(18%) scaleX(.52)}100%{opacity:0;transform:translateX(42%) scaleX(.08)}}@keyframes ascii-calibrate{0%{opacity:0;transform:scale(.7)}25%{opacity:.75;transform:scale(1)}78%{opacity:.35}100%{opacity:.08;transform:scale(1.08)}}@keyframes ascii-tunnel-row{0%{opacity:0;transform:translate(-50%,-50%) rotate(0deg) scale(.42)}20%{opacity:.36}58%{transform:translate(-50%,-50%) rotate(240deg) scale(1.05)}82%{opacity:.62;transform:translate(-50%,-50%) rotate(460deg) scale(1.34)}100%{opacity:0;transform:translate(-50%,-50%) rotate(620deg) scale(.16)}}@keyframes ascii-ring-spin{0%{transform:rotate(0deg) scale(.42);opacity:.18;filter:blur(2px)}18%{opacity:.72}58%{transform:rotate(380deg) scale(1.1);filter:blur(0)}82%{transform:rotate(620deg) scale(1.28);opacity:.82}100%{transform:rotate(720deg) scale(1.45);opacity:.12}}@keyframes ascii-ring-spin-reverse{0%{transform:rotate(0deg) scale(.32);opacity:.16}58%{transform:rotate(-420deg) scale(1.04);opacity:.82}100%{transform:rotate(-760deg) scale(1.34);opacity:.1}}@keyframes ascii-core-open{0%,55%{transform:scale(.2);opacity:.12}78%{transform:scale(1.35);opacity:1;box-shadow:0 0 60px rgba(110,231,183,.45)}100%{transform:scale(2.1);opacity:.1}}@keyframes ascii-barcode-band{0%,82%{opacity:0;transform:scale(.96)}86%,94%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(.92)}}@keyframes ascii-phase{0%{opacity:0;transform:translateY(8px);filter:blur(3px)}16%,68%{opacity:1;transform:translateY(0);filter:blur(0)}100%{opacity:0;transform:translateY(-8px);filter:blur(2px)}}@keyframes ascii-phase-final{0%{opacity:0;transform:scale(.96);filter:blur(3px)}16%,82%{opacity:1;transform:scale(1);filter:blur(0)}100%{opacity:0;transform:scale(1.02);filter:blur(2px)}}@keyframes ascii-final-hit{0%,86%{opacity:0;transform:translateX(-120%)}88%{opacity:.85}94%,100%{opacity:0;transform:translateX(120%)}}@media (max-width: 640px){.ascii-portal{top:39%;height:min(82vw,52vh);width:min(82vw,52vh)}.ascii-phase-stack{bottom:clamp(1rem,5vh,2.5rem);min-height:9.5rem}.ascii-phase-label{letter-spacing:.18em}.ascii-phase-detail{letter-spacing:.18em}.ascii-barcode-band{letter-spacing:.28em}}@media (prefers-reduced-motion: reduce){.ascii-session-overlay{animation:ascii-overlay-exit 2s linear forwards}.ascii-crt,.ascii-noise span,.ascii-streams span,.ascii-calibration span,.ascii-tunnel-row,.ascii-ring,.ascii-core,.ascii-barcode-band,.ascii-phase,.ascii-final-hit{animation:none}.ascii-phase{display:none}.ascii-phase-final{display:grid;opacity:1}}`}</style>
    </div>
  );
}

function GatewayPortalAperture({ phase, counts, intakeWindow }: { phase: GatewayPhase; counts: ReturnType<typeof publicCounts>; intakeWindow: string | null }) {
  const isLive = phase === "liveOpen" || phase === "liveClosed";
  const isOpen = phase === "open" || phase === "liveOpen";
  return (
    <div className="portal-aperture mt-4 overflow-hidden border border-border/70 bg-black/35 p-3" data-phase={phase} aria-label={`Portal aperture ${phase}`}>
      <div className="portal-frame relative mx-auto aspect-[16/9] min-h-56 overflow-hidden border border-border/70 bg-background/70">
        <div className="portal-tunnel absolute inset-0" aria-hidden="true" />
        <div className="portal-grid absolute inset-0" aria-hidden="true" />
        <div className="portal-rings absolute inset-0" aria-hidden="true"><span /><span /><span /></div>
        <div className="portal-wave absolute inset-x-8 top-1/2 h-16 -translate-y-1/2" aria-hidden="true">{Array.from({ length: 22 }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 45}ms` }} />)}</div>
        <div className="portal-packets absolute inset-0" aria-hidden="true">{Array.from({ length: Math.min(6, Math.max(2, counts.active + counts.pending + counts.wheel)) }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 180}ms` }} />)}</div>
        <div className="scene-core absolute inset-0" aria-hidden="true"><span /><span /></div>
        <div className="archive-vault absolute inset-0" aria-hidden="true"><span className="vault-shell" /><span className="vault-spool left" /><span className="vault-spool right" /></div>
        <div className="gate-latches absolute inset-0" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="intake-fragments absolute inset-0" aria-hidden="true">{Array.from({ length: 12 }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 95}ms` }} />)}</div>
        <div className="monitor-reticle absolute inset-0" aria-hidden="true"><span /><span /><span /></div>
        <div className="live-bars absolute bottom-12 left-1/2 flex h-16 -translate-x-1/2 items-end gap-1" aria-hidden="true">{Array.from({ length: 18 }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 35}ms` }} />)}</div>
        {counts.pending > 0 && <div className="portal-handshake absolute right-4 top-4 border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">{counts.pending} auth handshake</div>}
        {counts.priority > 0 && <div className="portal-relay-line absolute left-0 right-0 top-6 h-px bg-[#ffaa00]/55" aria-hidden="true" />}
        {counts.wheel > 0 && <div className="portal-wheel-line absolute bottom-8 left-6 right-6 h-px bg-cyan-200/55" aria-hidden="true" />}
        <div className="portal-shutters absolute inset-0" aria-hidden="true"><span /><span /></div>
        {phase === "archived" && <div className="archive-seal absolute inset-0 grid place-items-center"><span>ARCHIVE SEAL</span></div>}
        <div className="portal-label absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 text-[10px] uppercase tracking-[0.25em]">
          <span className={isLive ? "text-[#ffaa00]" : isOpen ? "text-accent" : "text-muted"}>{isLive ? "Broadcast monitor lock" : isOpen ? "Intake corridor open" : phase === "syncing" ? "Receiver tuning" : "Submission gate closed"}</span>
          {intakeWindow && isOpen && <span className="submission-window border border-accent/40 bg-accent/10 px-2 py-1 text-accent">{intakeWindow} window</span>}
        </div>
      </div>
      <style jsx>{`.archive-vault,.gate-latches,.intake-fragments,.monitor-reticle,.live-bars{opacity:0;transition:opacity .45s ease}.scene-core span{position:absolute;left:50%;top:50%;border:1px solid rgba(255,255,255,.18);transform:translate(-50%,-50%);box-shadow:0 0 28px rgba(255,255,255,.08)}.scene-core span:first-child{width:34%;height:28%;animation:scene-core-pulse 2.8s ease-in-out infinite}.scene-core span:last-child{width:16%;height:12%;animation:scene-core-pulse 2.8s ease-in-out infinite reverse}.archive-vault{background:radial-gradient(circle at center,rgba(255,0,0,.08),transparent 32%),repeating-linear-gradient(0deg,transparent 0 9px,rgba(255,255,255,.025) 9px 10px)}.portal-aperture[data-phase="archived"] .archive-vault{opacity:1}.portal-aperture[data-phase="archived"] .scene-core span{width:10%;height:7%;border-color:rgba(255,0,0,.38);animation:archive-core 4.8s ease-in-out infinite}.vault-shell{position:absolute;left:22%;right:22%;top:24%;bottom:24%;border:1px solid rgba(183,183,183,.18);background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,0,0,.045),rgba(255,255,255,.02));box-shadow:inset 0 0 28px rgba(255,0,0,.06)}.vault-spool{position:absolute;top:42%;width:3rem;height:3rem;border:1px solid rgba(183,183,183,.22);border-radius:999px;box-shadow:0 0 18px rgba(255,255,255,.06);animation:vault-spool 7s linear infinite}.vault-spool.left{left:28%}.vault-spool.right{right:28%;animation-direction:reverse}.portal-aperture[data-phase="closed"] .gate-latches,.portal-aperture[data-phase="liveClosed"] .gate-latches{opacity:1}.gate-latches span{position:absolute;left:14%;right:14%;height:2px;background:linear-gradient(90deg,transparent,rgba(103,232,249,.56),transparent);box-shadow:0 0 16px rgba(103,232,249,.18);animation:gate-lock-sweep 1.9s ease-in-out infinite}.gate-latches span:nth-child(1){top:28%}.gate-latches span:nth-child(2){top:42%;animation-delay:.2s}.gate-latches span:nth-child(3){top:58%;animation-delay:.4s}.gate-latches span:nth-child(4){top:72%;animation-delay:.6s}.portal-aperture[data-phase="open"] .intake-fragments,.portal-aperture[data-phase="liveOpen"] .intake-fragments{opacity:1}.intake-fragments span{position:absolute;left:10%;top:50%;width:8px;height:2px;background:#fff;box-shadow:0 0 12px rgba(255,0,0,.75);animation:intake-fragment 1.25s ease-in-out infinite}.intake-fragments span:nth-child(3n){background:#ff2a2a}.intake-fragments span:nth-child(even){left:auto;right:10%;animation-name:intake-fragment-reverse}.portal-aperture[data-phase="liveOpen"] .monitor-reticle,.portal-aperture[data-phase="liveClosed"] .monitor-reticle,.portal-aperture[data-phase="liveOpen"] .live-bars,.portal-aperture[data-phase="liveClosed"] .live-bars{opacity:1}.monitor-reticle span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:1px solid rgba(255,170,0,.42);box-shadow:0 0 30px rgba(255,170,0,.18);animation:monitor-lock 1.8s ease-in-out infinite}.monitor-reticle span:nth-child(1){width:52%;height:58%}.monitor-reticle span:nth-child(2){width:32%;height:34%;animation-delay:.2s}.monitor-reticle span:nth-child(3){width:68%;height:2px;border-left:0;border-right:0}.live-bars span{width:4px;background:rgba(255,170,0,.82);box-shadow:0 0 14px rgba(255,170,0,.32);animation:live-bar 760ms ease-in-out infinite}.portal-aperture[data-phase="liveClosed"] .intake-fragments{opacity:.16}.portal-aperture[data-phase="liveClosed"] .portal-packets{opacity:.18}@keyframes scene-core-pulse{0%,100%{opacity:.36;transform:translate(-50%,-50%) scale(.92)}50%{opacity:.86;transform:translate(-50%,-50%) scale(1.08)}}@keyframes archive-core{0%,100%{opacity:.25;filter:brightness(.8)}50%{opacity:.55;filter:brightness(1.2)}}@keyframes vault-spool{to{transform:rotate(360deg)}}@keyframes gate-lock-sweep{0%,100%{opacity:.18;transform:scaleX(.25)}45%{opacity:.85;transform:scaleX(1)}}@keyframes intake-fragment{0%{opacity:0;transform:translateX(-10vw) translateY(-20px) scaleX(.4)}40%{opacity:1}100%{opacity:0;transform:translateX(34vw) translateY(0) scaleX(.05)}}@keyframes intake-fragment-reverse{0%{opacity:0;transform:translateX(10vw) translateY(20px) scaleX(.4)}40%{opacity:1}100%{opacity:0;transform:translateX(-34vw) translateY(0) scaleX(.05)}}@keyframes monitor-lock{0%,100%{opacity:.45;transform:translate(-50%,-50%) scale(.96)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.02)}}@keyframes live-bar{0%,100%{height:18%;opacity:.45}50%{height:100%;opacity:1}}@media (prefers-reduced-motion: reduce){.scene-core span,.vault-spool,.gate-latches span,.intake-fragments span,.monitor-reticle span,.live-bars span{animation:none}}`}</style>
    </div>
  );
}

function StatCard({ label, value, helper, accent = "text-foreground" }: { label: string; value: string | number; helper: string; accent?: string }) {
  return <div className="stat-card border border-border bg-background/45 p-3"><p className="text-[10px] uppercase tracking-widest text-muted">{label}</p><p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p><p className="mt-1 text-[11px] leading-snug text-muted">{helper}</p></div>;
}

function BroadcastSlot({ label, track, tone }: { label: string; track: QueuePublicTrack; tone: string }) {
  const purchase = confirmedPriorityPurchaseDisplay(track);
  return <div className="border border-border bg-background/45 p-3 text-sm"><p className={`text-xs uppercase tracking-widest ${tone}`}>{label}</p>{purchase && <p className="mt-2 inline-flex border border-[#ffaa00]/70 bg-[#ffaa00]/15 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#ffaa00]">{purchase.text}</p>}<p className="mt-1 font-bold text-foreground">{track.submittedArtistName} — {track.submittedSongTitle}</p>{track.collaboratorNames?.trim() && <p className="mt-1 font-bold text-accent"><span className="uppercase tracking-widest">Featuring:</span> {track.collaboratorNames.trim()}</p>}</div>;
}
