/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useRef, useState } from "react";
import { externalLinks } from "@/content";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicTrack } from "@/lib/queue-types";

type GatewayPhase = "syncing" | "archived" | "closed" | "open" | "liveOpen" | "liveClosed";

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

function terminalReadouts(snapshot: QueuePublicSnapshot | null, counts: ReturnType<typeof publicCounts>): string[] {
  const lines = [
    counts.active > 0 ? `${counts.active} active transmissions detected.` : "No active transmissions detected.",
    counts.waiting > 0 ? `${counts.waiting} waiting below the broadcast slots.` : "Waiting queue clear.",
  ];
  if (counts.pending > 0) lines.push(`${counts.pending} payment handshakes pending.`);
  if (counts.priority > 0) lines.push("Priority relay active.");
  if (counts.wheel > 0) lines.push("Wheel signal detected.");
  if (counts.completed > 0) lines.push(`${counts.completed} transmissions archived tonight.`);
  if (snapshot?.status.pressure === "high" || snapshot?.status.pressure === "max") lines.push("Archive pressure rising.");
  const flavorSeed = `${snapshot?.session.sessionId ?? "sync"}:${counts.total}:${snapshot?.status.pressure ?? "low"}`;
  const flavor = ["BNL-01 receiver trace stabilized.", "Host band interference cleared.", "Corridor alignment corrected.", "Signal anomaly contained."];
  if (stableHash(flavorSeed) % 13 === 0) lines.push(stableVariant(flavorSeed, flavor));
  return lines.slice(0, 5);
}

type NavigationVariant = { label: string; detail: string; mode: string };

function navigationVariant(sessionId: string, isIntake: boolean): NavigationVariant {
  const intake = [
    { label: "ENTERING INTAKE CORRIDOR", detail: "SESSION HANDOFF IN PROGRESS", mode: "CORRIDOR UNLOCK" },
    { label: "ENTERING INTAKE CORRIDOR", detail: "SIGNAL TUNNEL ALIGNING", mode: "SIGNAL TUNNEL" },
    { label: "ENTERING INTAKE CORRIDOR", detail: "PACKET GATE OPENING", mode: "PACKET GATE" },
  ];
  const monitor = [
    { label: "ENTERING SESSION MONITOR", detail: "RECEIVER HANDOFF IN PROGRESS", mode: "MONITOR CALIBRATION" },
    { label: "ENTERING SESSION MONITOR", detail: "PUBLIC RECEIVER SYNCING", mode: "RECEIVER SYNC" },
    { label: "ENTERING SESSION MONITOR", detail: "CONTROL-ROOM HANDOFF", mode: "CONTROL ROOM" },
  ];
  return stableVariant(`${sessionId}:${isIntake ? "intake" : "monitor"}`, isIntake ? intake : monitor);
}

function isBroadcastActive(snapshot: QueuePublicSnapshot | null): boolean {
  if (!snapshot) return false;
  return Boolean(snapshot.nowPlaying || snapshot.session.broadcastPhase === "broadcast_active" || snapshot.session.showStarted);
}

function phaseForSnapshot(snapshot: QueuePublicSnapshot | null): GatewayPhase {
  if (!snapshot) return "syncing";
  if (snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended") return "archived";
  if (isBroadcastActive(snapshot)) return snapshot.status.isOpen ? "liveOpen" : "liveClosed";
  return snapshot.status.isOpen ? "open" : "closed";
}

function phaseCopy(phase: GatewayPhase) {
  if (phase === "syncing") return { eyebrow: "SYNCING PUBLIC SIGNAL", title: "QUEUE TERMINAL HANDSHAKE", body: "Reading the current BARCODE Radio public snapshot before opening the monitor.", tone: "text-muted", border: "border-border", glow: "shadow-[0_0_36px_rgba(255,255,255,0.06)]", gate: "SIGNAL SEARCH" };
  if (phase === "archived") return { eyebrow: "BROADCAST ENDED", title: "TRANSMISSION ARCHIVED", body: "SUBMISSIONS CLOSED. No active BARCODE Radio session is currently accepting transmissions.", tone: "text-danger", border: "border-danger/35", glow: "shadow-[0_0_44px_rgba(255,0,0,0.12)]", gate: "ARCHIVE SEAL" };
  if (phase === "closed") return { eyebrow: "SESSION ONLINE", title: "SUBMISSION GATE CLOSED", body: "The station is awake and standing by. The intake barrier is sealed until transmissions open.", tone: "text-cyan-200", border: "border-cyan-200/30", glow: "shadow-[0_0_46px_rgba(103,232,249,0.10)]", gate: "GATE SEALED" };
  if (phase === "open") return { eyebrow: "SIGNAL INTAKE OPEN", title: "TRANSMIT YOUR TRACK NOW", body: "Free Transmissions are open. Priority Signal unlocks once the line is deep enough and activates only after Stripe confirms payment.", tone: "text-accent", border: "border-accent/50", glow: "shadow-[0_0_64px_rgba(255,0,0,0.20)]", gate: "INTAKE UNLOCKED" };
  if (phase === "liveClosed") return { eyebrow: "BROADCAST ACTIVE", title: "HOST PROTOCOL INITIALIZED", body: "Broadcast playback is live. The intake gate is resealed, but the queue remains active until tracks are finished or removed.", tone: "text-[#ffaa00]", border: "border-[#ffaa00]/50", glow: "shadow-[0_0_70px_rgba(255,170,0,0.18)]", gate: "LIVE / INTAKE CLOSED" };
  return { eyebrow: "BROADCAST ACTIVE", title: "HOST PROTOCOL INITIALIZED", body: "Live monitor locked. Submissions remain open while the host protocol is running.", tone: "text-[#ffaa00]", border: "border-[#ffaa00]/50", glow: "shadow-[0_0_70px_rgba(255,170,0,0.20)]", gate: "LIVE / INTAKE OPEN" };
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

function publicCounts(snapshot: QueuePublicSnapshot | null) {
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

export function PublicQueueGateway() {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [portalState, setPortalState] = useState<"sealed" | "opening" | "open">("sealed");
  const [transitionPulse, setTransitionPulse] = useState<GatewayPhase | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{ href: string; label: string; detail: string; mode: string } | null>(null);
  const [nowMs, setNowMs] = useState(0);
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
    }
  }

  useEffect(() => {
    setNowMs(Date.now());
    load();
    const interval = setInterval(() => { setNowMs(Date.now()); load(); }, 5_000);
    return () => clearInterval(interval);
  }, []);

  function beginNavigation(event: React.MouseEvent<HTMLAnchorElement>, href: string, isIntake: boolean) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setPendingNavigation({ href, ...navigationVariant(session?.sessionId ?? href, isIntake) });
    window.setTimeout(() => { window.location.href = href; }, 720);
  }

  const phase = phaseForSnapshot(snapshot);
  const copy = phaseCopy(phase);
  const counts = publicCounts(snapshot);
  const session = snapshot?.session;
  const pressure = pressureLevel(snapshot);
  const readouts = terminalReadouts(snapshot, counts);
  const routePulses = pressure === "high" ? 5 : pressure === "medium" ? 4 : 3;
  const intakeWindowMs = session?.preShowEndsAt ? new Date(session.preShowEndsAt).getTime() - nowMs : 0;
  const intakeWindow = Number.isFinite(intakeWindowMs) && intakeWindowMs > 0 ? `${Math.floor(intakeWindowMs / 60000)}:${Math.floor((intakeWindowMs % 60000) / 1000).toString().padStart(2, "0")}` : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section data-phase={phase} data-pressure={pressure} data-transition={transitionPulse ?? undefined} className={`queue-machine relative overflow-hidden border bg-surface p-5 ${copy.border} ${copy.glow}`}>
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
            <div className="mt-4 grid grid-cols-8 gap-1" aria-hidden="true">{Array.from({ length: 16 }).map((_, index) => <span key={index} className="gate-bar h-8 border border-border/60 bg-background/60" />)}</div>
            {intakeWindow && snapshot?.status.isOpen && <div className="submission-window mt-4 border border-accent/35 bg-accent/5 p-3"><p className="text-[10px] uppercase tracking-[0.3em] text-accent">Submission Window</p><p className="mt-1 text-xl font-bold text-foreground">{intakeWindow} remaining</p></div>}
          </div>
          <div className="terminal-readouts grid gap-2 border border-border/70 bg-background/45 p-3 text-xs text-muted">{readouts.map((line) => <p key={line} className="font-mono uppercase tracking-[0.16em]">{line}</p>)}</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <StatCard label="Active Transmissions" value={counts.active} helper="Now Playing, Next In Line, and waiting tracks." />
            <StatCard label="Waiting in Queue" value={counts.waiting} helper="Queued below the broadcast slots." />
            <StatCard label="Played Tonight" value={counts.completed} helper="Finished tracks only." />
            <StatCard label="Total Received" value={counts.total} helper="Accepted active, played, and removed signals." />
            <StatCard label="Payment Processing" value={counts.pending} helper="Still Free until confirmed." accent="text-[#ffaa00]" />
            <StatCard label="Priority Confirmed" value={counts.priority} helper="Paid/manual Priority only." accent="text-[#ffaa00]" />
            <StatCard label="Wheel Chosen" value={counts.wheel} helper="Current Wheel lane items." />
            <StatCard label="Runtime" value={snapshot ? formatRuntime(snapshot.status.estimatedRuntimeSeconds) : "—"} helper="Estimated active runtime." />
          </div>
        </div>
      </section>
      <section className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Session Access</p>
        <p className="text-sm text-muted">Public counts are display-only. Active transmissions remain in play until finished or removed.</p>
        {snapshot?.nowPlaying && <BroadcastSlot label="Now Playing" track={snapshot.nowPlaying} tone="text-[#ffaa00]" />}
        {snapshot?.upNext && <BroadcastSlot label="Next In Line" track={snapshot.upNext} tone="text-accent" />}
        {snapshot?.status.isFull && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">Queue is full for new transmissions.</p>}
        {session && session.status !== "archived" && <a href={`/queue/${session.sessionId}`} onClick={(event) => beginNavigation(event, `/queue/${session.sessionId}`, Boolean(snapshot?.status.isOpen))} aria-busy={Boolean(pendingNavigation)} className={`nav-corridor-link inline-flex border px-4 py-3 text-xs uppercase tracking-widest transition-all ${pendingNavigation ? "border-accent bg-accent/10 text-accent" : snapshot?.status.isOpen ? "border-accent text-accent shadow-[0_0_22px_rgba(255,0,0,0.18)] hover:bg-accent hover:text-background" : "border-border text-muted hover:border-accent hover:text-accent"}`}>{pendingNavigation ? pendingNavigation.label : snapshot?.status.isOpen ? "Enter Intake Corridor" : "Enter Session Monitor"}</a>}
        <div className="border border-border bg-background/40 p-4"><p className="text-xs uppercase tracking-[0.25em] text-muted">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for queue updates and BARCODE Radio signal alerts.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-3 inline-flex border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Join Discord</a></div>
      </section>
      {pendingNavigation && <div className="nav-corridor-overlay fixed inset-0 z-[120000] grid place-items-center bg-black/82 p-4 text-center backdrop-blur-sm" role="status" aria-live="polite"><div className="nav-corridor-panel w-full max-w-lg border border-accent/50 bg-background/92 p-6 shadow-[0_0_90px_rgba(255,0,0,0.24)]"><p className="text-xs uppercase tracking-[0.4em] text-accent">{pendingNavigation.label}</p><h2 className="mt-3 text-2xl font-bold text-foreground">{pendingNavigation.detail}</h2><p className="mt-2 text-xs uppercase tracking-[0.25em] text-muted">{pendingNavigation.mode} · PUBLIC RECEIVER LOCKED</p><div className="mt-5 grid grid-cols-8 gap-1" aria-hidden="true">{Array.from({ length: 16 }).map((_, index) => <span key={index} className="nav-corridor-bit h-8 border border-accent/30 bg-accent/10" />)}</div></div></div>}
      <style jsx>{`.queue-machine{transition:border-color .7s ease,box-shadow .7s ease,filter .7s ease}.gateway-scanlines{background:linear-gradient(transparent 50%,rgba(255,255,255,.07) 50%);background-size:100% 7px;animation:gateway-scan 3s linear infinite;opacity:.18}.route-field span{position:absolute;left:12%;right:12%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.55),transparent);animation:route-energy 2.6s ease-in-out infinite}.queue-machine[data-pressure="low"] .gateway-scanlines{animation-duration:4.8s;opacity:.11}.queue-machine[data-pressure="low"] .route-field span{animation-duration:3.8s;opacity:.45}.queue-machine[data-pressure="medium"] .gateway-scanlines{animation-duration:3s;opacity:.18}.queue-machine[data-pressure="high"] .gateway-scanlines{animation-duration:1.8s;opacity:.26}.queue-machine[data-pressure="high"] .route-field span{animation-duration:1.55s;box-shadow:0 0 14px rgba(255,170,0,.28)}.route-field span:nth-child(1){top:32%}.route-field span:nth-child(2){top:50%;animation-delay:.35s}.route-field span:nth-child(3){top:68%;animation-delay:.7s}.gate-bar{transition:transform .7s ease,opacity .7s ease,background-color .7s ease}.queue-machine[data-phase="archived"]{filter:saturate(.55)}.queue-machine[data-phase="archived"] .gateway-scanlines{opacity:.08;animation-duration:5s}.queue-machine[data-phase="closed"] .gate-bar{background:rgba(103,232,249,.10)}.queue-machine[data-phase="open"] .gate-bar{transform:scaleY(.45);background:rgba(255,0,0,.16)}.queue-machine[data-phase="liveOpen"] .gate-bar,.queue-machine[data-phase="liveClosed"] .gate-bar{background:rgba(255,170,0,.14)}.queue-machine[data-phase="liveClosed"] .gate-bar:nth-child(even){transform:scaleY(.35);opacity:.45}.queue-machine[data-transition]{animation:terminal-mode-swap 1.2s ease-out}.submission-window{animation:window-arrive .9s ease-out}.nav-corridor-link{position:relative;overflow:hidden}.nav-corridor-link::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,0,0,.24),transparent);transform:translateX(-110%);transition:transform .55s ease}.nav-corridor-link[aria-busy="true"]::after{transform:translateX(110%)}.nav-corridor-overlay{animation:nav-corridor-fade .18s ease-out}.nav-corridor-panel{animation:nav-corridor-enter .72s ease-out}.nav-corridor-bit{animation:nav-bit-converge .72s ease-in-out forwards}.nav-corridor-bit:nth-child(even){animation-delay:.04s}.stat-card{transition:border-color .35s ease,transform .35s ease}.stat-card:hover{transform:translateY(-1px);border-color:rgba(255,0,0,.45)}@keyframes gateway-scan{from{background-position:0 0}to{background-position:0 56px}}@keyframes route-energy{0%,100%{opacity:.08;transform:scaleX(.15)}45%{opacity:.75;transform:scaleX(1)}}@keyframes terminal-mode-swap{0%{clip-path:inset(0 100% 0 0);filter:brightness(1.7)}38%{clip-path:inset(0 0 0 0);filter:brightness(1.25)}100%{filter:brightness(1)}}@keyframes window-arrive{0%{opacity:0;transform:translateY(8px);box-shadow:0 0 0 rgba(255,0,0,0)}100%{opacity:1;transform:translateY(0);box-shadow:0 0 26px rgba(255,0,0,.16)}}@keyframes nav-corridor-fade{from{opacity:0}to{opacity:1}}@keyframes nav-corridor-enter{0%{transform:scale(.98);filter:brightness(1.8)}100%{transform:scale(1);filter:brightness(1)}}@keyframes nav-bit-converge{0%{transform:scaleY(.25);opacity:.35}55%{transform:scaleY(1);opacity:1}100%{transform:scaleY(.45);opacity:.72}}@media (prefers-reduced-motion: reduce){.gateway-scanlines,.route-field span,.queue-machine[data-transition],.submission-window,.nav-corridor-overlay,.nav-corridor-panel,.nav-corridor-bit{animation:none}.nav-corridor-link::after{display:none}.stat-card:hover{transform:none}.gate-bar{transition:none}}`}</style>
    </div>
  );
}

function StatCard({ label, value, helper, accent = "text-foreground" }: { label: string; value: string | number; helper: string; accent?: string }) {
  return <div className="stat-card border border-border bg-background/45 p-3"><p className="text-[10px] uppercase tracking-widest text-muted">{label}</p><p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p><p className="mt-1 text-[11px] leading-snug text-muted">{helper}</p></div>;
}

function BroadcastSlot({ label, track, tone }: { label: string; track: QueuePublicTrack; tone: string }) {
  return <div className="border border-border bg-background/45 p-3 text-sm"><p className={`text-xs uppercase tracking-widest ${tone}`}>{label}</p><p className="mt-1 font-bold text-foreground">{track.submittedArtistName} — {track.submittedSongTitle}</p></div>;
}
