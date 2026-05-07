/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useRef, useState } from "react";
import { externalLinks } from "@/content";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot } from "@/lib/queue-types";

export function PublicQueueGateway() {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [portalState, setPortalState] = useState<"sealed" | "opening" | "open">("sealed");
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
    const interval = setInterval(load, 5_000);
    return () => clearInterval(interval);
  }, []);

  const isOpen = snapshot?.status.isOpen ?? false;
  const session = snapshot?.session;
  const queue = snapshot?.queue ?? [];
  const priorityCount = queue.filter((entry) => entry.lane === "priority").length;
  const wheelCount = queue.filter((entry) => entry.lane === "wheel").length;
  const regularCount = queue.filter((entry) => entry.lane === "regular").length;

  if (!isOpen) {
    return (
      <section className="border border-border bg-surface p-6 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted">// Queue Gateway</p>
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted mt-2">Portal state: {portalState}</p>
          <h2 className="text-3xl font-bold text-danger mt-4">QUEUE CLOSED</h2>
          <p className="text-sm text-muted mt-3">No broadcast queue is currently accepting transmissions.</p>
        </div>
        <div className="border border-border bg-background/40 p-4">
          <p className="text-sm font-bold text-foreground">Follow 6 Bit for signal alerts:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={externalLinks.tiktok} target="_blank" rel="noreferrer" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">TikTok</a>
            <a href={externalLinks.instagram} target="_blank" rel="noreferrer" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Instagram</a>
            <a href={externalLinks.facebook} target="_blank" rel="noreferrer" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Facebook</a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Queue Gateway</p>
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Portal state: {portalState}</p>
        <h2 className="text-2xl font-bold text-accent">QUEUE OPEN</h2>
        {session && <div className="border border-border bg-background/40 p-4 text-sm"><p className="font-bold">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status}</p><p className="text-xs text-muted mt-2">{session.description}</p></div>}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="border border-border p-3"><p className="text-xs text-muted">Active transmissions</p><p>{snapshot ? `${snapshot.status.activeCount}/${snapshot.status.capacity}` : "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Estimated runtime</p><p>{snapshot ? formatRuntime(snapshot.status.estimatedRuntimeSeconds) : "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Queue pressure</p><p>{snapshot?.status.pressure ?? "syncing"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Regular Queue</p><p>{regularCount}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Priority Lane</p><p>{priorityCount}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Wheel Chosen</p><p>{wheelCount}</p></div>
        </div>
      </section>
      <section className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Session Access</p>
        <p className="text-sm text-muted">This gateway shows current queue pressure and lane counts only. The full public queue remains inside the session page.</p>
        {snapshot?.status.isFull && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">Queue is full for new transmissions.</p>}
        {session && <a href={`/queue/${session.sessionId}`} className="inline-flex border border-accent px-4 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">Enter Session Queue</a>}
        <div className="border border-border bg-background/40 p-4"><p className="text-xs uppercase tracking-[0.25em] text-muted">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for queue updates, future reminder experiments, signal alerts, and missed-track prevention later.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-3 inline-flex border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Join Discord</a></div>
      </section>
    </div>
  );
}
