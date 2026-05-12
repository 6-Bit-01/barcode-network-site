/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useRef, useState } from "react";
import { externalLinks } from "@/content";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicTrack } from "@/lib/queue-types";

type GatewayPhase = "syncing" | "archived" | "closed" | "open" | "liveOpen" | "liveClosed";

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

  const phase = phaseForSnapshot(snapshot);
  const copy = phaseCopy(phase);
  const counts = publicCounts(snapshot);
  const session = snapshot?.session;
  const intakeWindowMs = session?.preShowEndsAt ? new Date(session.preShowEndsAt).getTime() - nowMs : 0;
  const intakeWindow = Number.isFinite(intakeWindowMs) && intakeWindowMs > 0 ? `${Math.floor(intakeWindowMs / 60000)}:${Math.floor((intakeWindowMs % 60000) / 1000).toString().padStart(2, "0")}` : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section data-phase={phase} data-transition={transitionPulse ?? undefined} className={`queue-machine relative overflow-hidden border bg-surface p-5 ${copy.border} ${copy.glow}`}>
        <div className="gateway-scanlines pointer-events-none absolute inset-0" />
        <div className="route-field pointer-events-none absolute inset-0"><span /><span /><span /></div>
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
        {session && session.status !== "archived" && <a href={`/queue/${session.sessionId}`} className={`inline-flex border px-4 py-3 text-xs uppercase tracking-widest transition-all ${snapshot?.status.isOpen ? "border-accent text-accent shadow-[0_0_22px_rgba(255,0,0,0.18)] hover:bg-accent hover:text-background" : "border-border text-muted hover:border-accent hover:text-accent"}`}>{snapshot?.status.isOpen ? "Enter Intake Corridor" : "Enter Session Monitor"}</a>}
        <div className="border border-border bg-background/40 p-4"><p className="text-xs uppercase tracking-[0.25em] text-muted">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for queue updates and BARCODE Radio signal alerts.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-3 inline-flex border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Join Discord</a></div>
      </section>
      <style jsx>{`.queue-machine{transition:border-color .7s ease,box-shadow .7s ease,filter .7s ease}.gateway-scanlines{background:linear-gradient(transparent 50%,rgba(255,255,255,.07) 50%);background-size:100% 7px;animation:gateway-scan 3s linear infinite;opacity:.18}.route-field span{position:absolute;left:12%;right:12%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.55),transparent);animation:route-energy 2.6s ease-in-out infinite}.route-field span:nth-child(1){top:32%}.route-field span:nth-child(2){top:50%;animation-delay:.35s}.route-field span:nth-child(3){top:68%;animation-delay:.7s}.gate-bar{transition:transform .7s ease,opacity .7s ease,background-color .7s ease}.queue-machine[data-phase="archived"]{filter:saturate(.55)}.queue-machine[data-phase="archived"] .gateway-scanlines{opacity:.08;animation-duration:5s}.queue-machine[data-phase="closed"] .gate-bar{background:rgba(103,232,249,.10)}.queue-machine[data-phase="open"] .gate-bar{transform:scaleY(.45);background:rgba(255,0,0,.16)}.queue-machine[data-phase="liveOpen"] .gate-bar,.queue-machine[data-phase="liveClosed"] .gate-bar{background:rgba(255,170,0,.14)}.queue-machine[data-phase="liveClosed"] .gate-bar:nth-child(even){transform:scaleY(.35);opacity:.45}.queue-machine[data-transition]{animation:terminal-mode-swap 1.2s ease-out}.submission-window{animation:window-arrive .9s ease-out}.stat-card{transition:border-color .35s ease,transform .35s ease}.stat-card:hover{transform:translateY(-1px);border-color:rgba(255,0,0,.45)}@keyframes gateway-scan{from{background-position:0 0}to{background-position:0 56px}}@keyframes route-energy{0%,100%{opacity:.08;transform:scaleX(.15)}45%{opacity:.75;transform:scaleX(1)}}@keyframes terminal-mode-swap{0%{clip-path:inset(0 100% 0 0);filter:brightness(1.7)}38%{clip-path:inset(0 0 0 0);filter:brightness(1.25)}100%{filter:brightness(1)}}@keyframes window-arrive{0%{opacity:0;transform:translateY(8px);box-shadow:0 0 0 rgba(255,0,0,0)}100%{opacity:1;transform:translateY(0);box-shadow:0 0 26px rgba(255,0,0,.16)}}@media (prefers-reduced-motion: reduce){.gateway-scanlines,.route-field span,.queue-machine[data-transition],.submission-window{animation:none}.stat-card:hover{transform:none}.gate-bar{transition:none}}`}</style>
    </div>
  );
}

function StatCard({ label, value, helper, accent = "text-foreground" }: { label: string; value: string | number; helper: string; accent?: string }) {
  return <div className="stat-card border border-border bg-background/45 p-3"><p className="text-[10px] uppercase tracking-widest text-muted">{label}</p><p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p><p className="mt-1 text-[11px] leading-snug text-muted">{helper}</p></div>;
}

function BroadcastSlot({ label, track, tone }: { label: string; track: QueuePublicTrack; tone: string }) {
  return <div className="border border-border bg-background/45 p-3 text-sm"><p className={`text-xs uppercase tracking-widest ${tone}`}>{label}</p><p className="mt-1 font-bold text-foreground">{track.submittedArtistName} — {track.submittedSongTitle}</p></div>;
}
