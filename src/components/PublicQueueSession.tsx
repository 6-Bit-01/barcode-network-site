/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useMemo, useState } from "react";
import { RadioQueueForm } from "@/components/RadioQueueForm";
import { externalLinks } from "@/content";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicTrack } from "@/lib/queue-types";

export function PublicQueueSession({ sessionId }: { sessionId: string }) {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

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
  const isFull = Boolean(snapshot?.status.isFull || (snapshot && snapshot.status.activeCount >= snapshot.status.capacity));
  const canSubmit = isOpen && !isFull;

  return (
    <div className="space-y-8">
      <section className="border border-accent/50 bg-surface p-5 space-y-5">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">// Public Broadcast Queue</p>
        <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <NowPlaying track={snapshot?.nowPlaying ?? null} />
          <div className="space-y-4">
            <div>
              <h2 className="text-3xl font-bold text-foreground">{snapshot?.session.title ?? "BARCODE Radio"}</h2>
              <p className="text-sm text-muted">{snapshot?.session.showDate ?? "show date syncing"} · {snapshot?.session.status ?? "syncing"}</p>
            </div>
            {snapshot?.session.description && <p className="border border-border bg-background/40 p-4 text-sm text-muted">{snapshot.session.description}</p>}
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="border border-border p-3"><p className="text-xs text-muted">Submissions</p><p className={canSubmit ? "text-accent" : "text-danger"}>{canSubmit ? "Open" : isFull ? "Full" : "Closed"}</p></div>
              <div className="border border-border p-3"><p className="text-xs text-muted">Active / Capacity</p><p>{snapshot ? `${snapshot.status.activeCount}/${snapshot.status.capacity}` : "—"}</p></div>
              <div className="border border-border p-3"><p className="text-xs text-muted">Runtime</p><p>{snapshot ? formatRuntime(snapshot.status.estimatedRuntimeSeconds) : "—"}</p></div>
              <div className="border border-border p-3"><p className="text-xs text-muted">Pressure</p><p>{snapshot?.status.pressure ?? "syncing"}</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">// Submit Signal</p>
            <p className="text-sm text-muted mt-1">Open the submission panel when you are ready to route a track.</p>
          </div>
          <button type="button" disabled={!canSubmit} onClick={() => setSubmitOpen((value) => !value)} className="border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:border-danger/50 disabled:text-danger disabled:hover:bg-transparent">{canSubmit ? submitOpen ? "Close Submission Panel" : "Submit a Track" : isFull ? "Queue Full" : "Submissions Closed"}</button>
        </div>
        {!canSubmit && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{isFull ? "This broadcast queue is full for new transmissions." : "This broadcast queue is closed for new transmissions."}</p>}
        {submitOpen && canSubmit && <RadioQueueForm sessionId={sessionId} />}
      </section>

      <DiscordQueueCTA />

      <div className="grid gap-5 xl:grid-cols-3">
        <PublicLane title="Priority Signal" tracks={lanes.priority} />
        <PublicLane title="Wheel Breach Winners" tracks={lanes.wheel} />
        <PublicLane title="Incoming Transmissions" tracks={lanes.regular} />
      </div>

      <PublicLane title="Recently Played" tracks={snapshot?.completed ?? []} />
    </div>
  );
}

function NowPlaying({ track }: { track: QueuePublicTrack | null }) {
  return <div className="border border-accent/40 bg-background/50 p-5"><p className="text-xs uppercase tracking-[0.35em] text-accent">Now Playing</p>{track ? <div className="mt-4 grid gap-4 sm:grid-cols-[8rem_1fr]"><div className="flex aspect-square items-center justify-center border border-accent/40 bg-[radial-gradient(circle_at_center,rgba(255,0,0,0.25),transparent_60%)] text-4xl text-accent">▦</div><div><h3 className="text-2xl font-bold text-foreground">{track.submittedArtistName}</h3><p className="text-xl text-foreground/90">{track.submittedSongTitle}</p><div className="mt-4 grid gap-2 text-xs text-muted"><p>Platform / source: {track.sourceType.toUpperCase()}</p>{!track.durationIsEstimate && <p>Duration: {track.durationLabel}</p>}</div></div></div> : <div className="mt-4 border border-border bg-background/40 p-6"><div className="mb-4 flex h-28 items-center justify-center border border-accent/30 text-4xl text-accent">▦</div><p className="text-sm text-muted">No transmission is in the Now Playing slot yet.</p></div>}</div>;
}

function DiscordQueueCTA() {
  return <section className="border border-border bg-surface p-5"><p className="text-xs uppercase tracking-[0.35em] text-muted">// Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for queue updates, future reminder experiments, signal alerts, and missed-track prevention later. No OAuth or check-in flow is active here.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-4 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Join Discord</a></section>;
}

function PublicLane({ title, tracks }: { title: string; tracks: QueuePublicTrack[] }) {
  return <section className="border border-border bg-surface p-4"><div className="flex items-center justify-between mb-4"><h3 className="text-sm uppercase tracking-[0.25em] text-foreground">{title}</h3><span className="text-xs text-muted">{tracks.length}</span></div><div className="space-y-2">{tracks.length === 0 ? <p className="text-sm text-muted border border-border/60 p-3">No public tracks visible.</p> : tracks.map((track, index) => <div key={track.id} className="border border-border bg-background/30 p-3"><p className="text-xs text-muted">#{index + 1} · {track.sourceType.toUpperCase()}</p><p className="font-bold text-sm">{track.submittedArtistName} — {track.submittedSongTitle}</p><p className="text-[11px] text-muted mt-1">{track.durationIsEstimate ? "Duration estimated / pending" : track.durationLabel}</p></div>)}</div></section>;
}
