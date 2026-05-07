/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useRef, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot } from "@/lib/queue-types";

export function PublicQueueGateway() {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [portalState, setPortalState] = useState<"sealed" | "opening" | "open" | "routing" | "confirmed">("sealed");
  const wasOpen = useRef(false);

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
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  const isOpen = snapshot?.status.isOpen ?? false;
  const session = snapshot?.session;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Queue Gateway</p>
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Portal state: {portalState}</p>
        <h2 className="text-2xl font-bold text-foreground">{isOpen ? "QUEUE OPEN" : "QUEUE CLOSED"}</h2>
        <p className="text-sm text-muted">{isOpen ? "Signal aperture open. The BARCODE Network is routing transmissions into this broadcast session." : "The next broadcast queue is sealed until admin opens submissions."}</p>
        {!isOpen && <p className="border border-border bg-background/40 p-4 text-sm text-accent">Follow 6 Bit on TikTok, Instagram, and Facebook for signal alerts.</p>}
        {isOpen && session && <div className="border border-border bg-background/40 p-4 text-sm"><p className="font-bold">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status}</p><p className="text-xs text-muted mt-2">{session.description}</p></div>}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="border border-border p-3"><p className="text-xs text-muted">Queue</p><p className={isOpen ? "text-accent" : "text-danger"}>{isOpen ? "Open" : "Closed"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Active</p><p>{snapshot?.status.activeCount ?? "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Runtime</p><p>{snapshot ? formatRuntime(snapshot.status.estimatedRuntimeSeconds) : "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Pressure</p><p>{snapshot?.status.pressure ?? "syncing"}</p></div>
        </div>
      </section>
      <section className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Rules</p>
        <ul className="space-y-2 text-sm text-muted list-disc pl-5">
          <li>3 tracks max per artist.</li>
          <li>The skip game opens at 10k taps.</li>
          <li>Priority access is reserved for a later flow; no payment system is active here yet.</li>
        </ul>
        {isOpen && session && <a href={`/queue/${session.sessionId}`} className="inline-flex border border-accent px-4 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">Enter Session Queue</a>}
        {!isOpen && <p className="text-xs text-muted">Submission access appears only when admin opens the broadcast queue.</p>}
      </section>
    </div>
  );
}
