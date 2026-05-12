/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useRef, useState } from "react";
import { externalLinks } from "@/content";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot } from "@/lib/queue-types";

type GatewayPhase = "archived" | "closed" | "open" | "live";

function phaseForSnapshot(snapshot: QueuePublicSnapshot | null): GatewayPhase {
  if (!snapshot || snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended") return "archived";
  if (snapshot.nowPlaying || snapshot.upNext || snapshot.session.broadcastPhase === "broadcast_active" || snapshot.session.showStarted) return "live";
  return snapshot.status.isOpen ? "open" : "closed";
}

function phaseCopy(phase: GatewayPhase, isOpen: boolean) {
  if (phase === "archived") {
    return {
      eyebrow: "BROADCAST ENDED",
      title: "TRANSMISSION ARCHIVED",
      body: "No active BARCODE Radio session is currently accepting transmissions.",
      tone: "text-danger",
      border: "border-danger/35",
      glow: "shadow-[0_0_44px_rgba(255,0,0,0.12)]",
    };
  }
  if (phase === "closed") {
    return {
      eyebrow: "SESSION ONLINE",
      title: "SUBMISSION GATE CLOSED",
      body: "The broadcast corridor is active, but new transmissions are not currently being accepted. Stand by for intake.",
      tone: "text-muted",
      border: "border-border",
      glow: "shadow-[0_0_36px_rgba(255,255,255,0.05)]",
    };
  }
  if (phase === "live") {
    return {
      eyebrow: "BROADCAST ACTIVE",
      title: "HOST PROTOCOL INITIALIZED",
      body: `Live monitor online. Submissions are ${isOpen ? "open" : "closed"}; the broadcast remains active either way.`,
      tone: "text-[#ffaa00]",
      border: "border-[#ffaa00]/45",
      glow: "shadow-[0_0_52px_rgba(255,170,0,0.16)]",
    };
  }
  return {
    eyebrow: "SIGNAL INTAKE OPEN",
    title: "TRANSMIT YOUR TRACK NOW",
    body: "Free Transmissions are open. Priority Signal unlocks once the line is deep enough and Stripe confirms payment.",
    tone: "text-accent",
    border: "border-accent/45",
    glow: "shadow-[0_0_52px_rgba(255,0,0,0.16)]",
  };
}

export function PublicQueueGateway() {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [portalState, setPortalState] = useState<"sealed" | "opening" | "open">("sealed");
  const wasOpen = useRef(false);
  const [nowMs, setNowMs] = useState(0);

  async function load() {
    const res = await fetch("/api/queue", { cache: "no-store" });
    if (res.ok) {
      const next = await res.json();
      const nextOpen = Boolean(next.status?.isOpen);
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

  const isOpen = snapshot?.status.isOpen ?? false;
  const session = snapshot?.session;
  const queue = snapshot?.queue ?? [];
  const phase = phaseForSnapshot(snapshot);
  const copy = phaseCopy(phase, isOpen);
  const priorityCount = queue.filter((entry) => entry.lane === "priority" && (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "manual")).length;
  const pendingCount = queue.filter((entry) => entry.priorityUpgradeStatus === "checkout_pending").length;
  const wheelCount = queue.filter((entry) => entry.lane === "wheel").length;
  const regularCount = queue.filter((entry) => entry.lane === "regular" || entry.priorityUpgradeStatus === "checkout_pending").length;
  const intakeWindowMs = session?.preShowEndsAt ? new Date(session.preShowEndsAt).getTime() - nowMs : 0;
  const intakeWindow = Number.isFinite(intakeWindowMs) && intakeWindowMs > 0 ? `${Math.floor(intakeWindowMs / 60000)}:${Math.floor((intakeWindowMs % 60000) / 1000).toString().padStart(2, "0")}` : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className={`relative overflow-hidden border bg-surface p-5 ${copy.border} ${copy.glow}`}>
        <div className="gateway-scanlines pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative space-y-4">
          <div>
            <p className={`text-xs uppercase tracking-[0.35em] ${copy.tone}`}>{copy.eyebrow}</p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-muted">Portal state: {portalState} · Submissions: {isOpen ? "open" : "closed"}</p>
            <h2 className={`mt-4 text-2xl font-bold ${copy.tone}`}>{copy.title}</h2>
            <p className="mt-3 text-sm text-muted">{copy.body}</p>
          </div>
          {session && <div className="border border-border bg-background/50 p-4 text-sm"><p className="font-bold text-foreground">{session.title}</p><p className="mt-1 text-xs text-muted">{session.showDate} · {session.status} · {session.broadcastPhase ?? "phase syncing"}</p><p className="mt-2 text-xs text-muted">{session.description}</p>{intakeWindow && isOpen && <p className="mt-3 border border-accent/35 bg-accent/5 p-2 text-xs uppercase tracking-widest text-accent">Intake window display: {intakeWindow}</p>}</div>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="border border-border p-3"><p className="text-xs text-muted">Active transmissions</p><p>{snapshot ? `${snapshot.status.activeCount}/${snapshot.status.capacity}` : "—"}</p></div>
            <div className="border border-border p-3"><p className="text-xs text-muted">Estimated runtime</p><p>{snapshot ? formatRuntime(snapshot.status.estimatedRuntimeSeconds) : "—"}</p></div>
            <div className="border border-border p-3"><p className="text-xs text-muted">Queue pressure</p><p>{snapshot?.status.pressure ?? "syncing"}</p></div>
            <div className="border border-border p-3"><p className="text-xs text-muted">Payment Processing</p><p>{pendingCount}</p></div>
            <div className="border border-border p-3"><p className="text-xs text-muted">Free Transmissions</p><p>{regularCount}</p></div>
            <div className="border border-border p-3"><p className="text-xs text-muted">Priority Confirmed</p><p>{priorityCount}</p></div>
            <div className="border border-border p-3"><p className="text-xs text-muted">Wheel Chosen</p><p>{wheelCount}</p></div>
          </div>
        </div>
      </section>
      <section className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Session Access</p>
        <p className="text-sm text-muted">This gateway shows current queue pressure and lane counts only. Broadcast state, submissions, and payment status are read from the public queue snapshot.</p>
        {snapshot?.nowPlaying && <div className="border border-[#ffaa00]/40 bg-[#ffaa00]/5 p-3 text-sm"><p className="text-xs uppercase tracking-widest text-[#ffaa00]">Now Playing</p><p className="mt-1 font-bold text-foreground">{snapshot.nowPlaying.submittedArtistName} — {snapshot.nowPlaying.submittedSongTitle}</p></div>}
        {snapshot?.upNext && <div className="border border-accent/35 bg-accent/5 p-3 text-sm"><p className="text-xs uppercase tracking-widest text-accent">Next In Line</p><p className="mt-1 font-bold text-foreground">{snapshot.upNext.submittedArtistName} — {snapshot.upNext.submittedSongTitle}</p></div>}
        {snapshot?.status.isFull && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">Queue is full for new transmissions.</p>}
        {session && session.status !== "archived" && <a href={`/queue/${session.sessionId}`} className="inline-flex border border-accent px-4 py-3 text-xs uppercase tracking-widest text-accent transition-all hover:bg-accent hover:text-background">Enter Session Queue</a>}
        <div className="border border-border bg-background/40 p-4"><p className="text-xs uppercase tracking-[0.25em] text-muted">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for queue updates, future reminder experiments, signal alerts, and missed-track prevention later.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-3 inline-flex border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Join Discord</a></div>
      </section>
      <style jsx>{`.gateway-scanlines{background:linear-gradient(transparent 50%,rgba(255,255,255,.07) 50%);background-size:100% 7px;animation:gateway-scan 3s linear infinite}@keyframes gateway-scan{from{background-position:0 0}to{background-position:0 56px}}@media (prefers-reduced-motion: reduce){.gateway-scanlines{animation:none}}`}</style>
    </div>
  );
}
