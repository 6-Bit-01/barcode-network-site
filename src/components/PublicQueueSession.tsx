/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useMemo, useState } from "react";
import { RadioQueueForm } from "@/components/RadioQueueForm";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicTrack } from "@/lib/queue-types";

export function PublicQueueSession({ sessionId }: { sessionId: string }) {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);

  async function load() {
    const res = await fetch(`/api/queue?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (res.ok) setSnapshot(await res.json());
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const lanes = useMemo(() => {
    const queue = snapshot?.queue ?? [];
    return {
      priority: queue.filter((track) => track.lane === "priority"),
      wheel: queue.filter((track) => track.lane === "wheel"),
      regular: queue.filter((track) => track.lane === "regular"),
    };
  }, [snapshot]);

  const isOpen = snapshot?.status.isOpen ?? false;

  return (
    <div className="space-y-8">
      <section className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Public Broadcast Session</p>
        <h2 className="text-3xl font-bold text-foreground">{snapshot?.session.title ?? "BARCODE Radio"}</h2>
        <p className="text-sm text-muted">{snapshot?.session.showDate ?? "show date syncing"} · {snapshot?.session.status ?? "syncing"}</p>
        {snapshot?.session.description && <p className="border border-border bg-background/40 p-4 text-sm text-muted">{snapshot.session.description}</p>}
        <div className="grid gap-3 sm:grid-cols-4 text-sm">
          <div className="border border-border p-3"><p className="text-xs text-muted">Queue</p><p className={isOpen ? "text-accent" : "text-danger"}>{isOpen ? "Open" : "Closed"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Active</p><p>{snapshot?.status.activeCount ?? "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Runtime</p><p>{snapshot ? formatRuntime(snapshot.status.estimatedRuntimeSeconds) : "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Pressure</p><p>{snapshot?.status.pressure ?? "syncing"}</p></div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <PublicLane title="Priority Lane" tracks={lanes.priority} />
        <PublicLane title="Wheel Winners" tracks={lanes.wheel} />
        <PublicLane title="Regular Queue" tracks={lanes.regular} />
      </div>

      <PublicLane title="Recently Completed" tracks={snapshot?.completed ?? []} />

      {isOpen ? <RadioQueueForm sessionId={sessionId} /> : <section className="border border-border bg-surface p-6"><h3 className="text-xl font-bold text-foreground">Session is read-only</h3><p className="text-sm text-muted mt-2">Submissions are closed for this broadcast session. You can still review the public queue state above.</p></section>}
    </div>
  );
}

function PublicLane({ title, tracks }: { title: string; tracks: QueuePublicTrack[] }) {
  return <section className="border border-border bg-surface p-4"><div className="flex items-center justify-between mb-4"><h3 className="text-sm uppercase tracking-[0.25em] text-foreground">{title}</h3><span className="text-xs text-muted">{tracks.length}</span></div><div className="space-y-2">{tracks.length === 0 ? <p className="text-sm text-muted border border-border/60 p-3">No public tracks visible.</p> : tracks.map((track, index) => <div key={track.id} className="border border-border bg-background/30 p-3"><p className="text-xs text-muted">#{index + 1} · {track.sourceType.toUpperCase()}</p><p className="font-bold text-sm">{track.submittedArtistName} — {track.submittedSongTitle}</p>{(track.detectedArtistName || track.detectedSongTitle || track.providerTitle) && <p className="text-[11px] text-muted">Detected: {track.detectedArtistName || "Unknown artist"} — {track.detectedSongTitle || track.providerTitle || "Unknown title"}</p>}<p className="text-[11px] text-muted mt-1">{track.durationLabel}</p></div>)}</div></section>;
}
