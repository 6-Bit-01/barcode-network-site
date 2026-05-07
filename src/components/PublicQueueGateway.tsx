/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot } from "@/lib/queue-types";

export function PublicQueueGateway() {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);

  async function load() {
    const res = await fetch("/api/queue", { cache: "no-store" });
    if (res.ok) setSnapshot(await res.json());
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
        <h2 className="text-2xl font-bold text-foreground">{isOpen ? "Broadcast queue open" : "Broadcast queue sealed"}</h2>
        <p className="text-sm text-muted">{isOpen ? "The current BARCODE Radio session is accepting transmissions." : "The next broadcast queue is sealed until admin opens submissions."}</p>
        {session && <div className="border border-border bg-background/40 p-4 text-sm"><p className="font-bold">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status}</p><p className="text-xs text-muted mt-2">{session.description}</p></div>}
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
        {session && <a href={`/queue/${session.sessionId}`} className="inline-flex border border-accent px-4 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">{isOpen ? "Enter Active Session" : "View Session"}</a>}
        {!isOpen && <p className="text-xs text-muted">Submission access appears only when admin opens the broadcast queue.</p>}
      </section>
    </div>
  );
}
