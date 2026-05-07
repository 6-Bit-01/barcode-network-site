/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react/jsx-no-comment-textnodes, @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { RadioQueueForm } from "@/components/RadioQueueForm";
import { externalLinks } from "@/content";
import { formatRuntime, getTrackArtworkUrl } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicTrack } from "@/lib/queue-types";

export function PublicQueueSession({ sessionId }: { sessionId: string }) {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [lastSubmittedTrackId, setLastSubmittedTrackId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/queue?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (res.ok) setSnapshot(await res.json());
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5_000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const lanes = useMemo(() => {
    const hidden = new Set([snapshot?.nowPlaying?.id, snapshot?.upNext?.id].filter(Boolean));
    const queue = (snapshot?.queue ?? []).filter((track) => !hidden.has(track.id));
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
      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <NowPlaying title="Now Playing" track={snapshot?.nowPlaying ?? null} />
        <div className="space-y-5">
          <NowPlaying title="Up Next" track={snapshot?.upNext ?? null} compact />
          <div className="border border-border bg-surface p-5 space-y-4">
            <p className="text-xs uppercase tracking-[0.35em] text-muted">// Queue stats / session status</p>
            <div><h2 className="text-2xl font-bold text-foreground">{snapshot?.session.title ?? "BARCODE Radio"}</h2><p className="text-sm text-muted">{snapshot?.session.showDate ?? "show date syncing"} · {snapshot?.session.status ?? "syncing"}</p></div>
            {snapshot?.session.description && <p className="border border-border bg-background/40 p-3 text-sm text-muted">{snapshot.session.description}</p>}
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="border border-border p-3"><p className="text-xs text-muted">Submissions</p><p className={canSubmit ? "text-accent" : "text-danger"}>{canSubmit ? "Open" : isFull ? "Full" : "Closed"}</p></div>
              <div className="border border-border p-3"><p className="text-xs text-muted">Active / Capacity</p><p>{snapshot ? `${snapshot.status.activeCount}/${snapshot.status.capacity}` : "—"}</p></div>
              <div className="border border-border p-3"><p className="text-xs text-muted">Runtime</p><p>{snapshot ? formatRuntime(snapshot.status.estimatedRuntimeSeconds) : "—"}</p></div>
              <div className="border border-border p-3"><p className="text-xs text-muted">Pressure</p><p>{snapshot?.status.pressure ?? "syncing"}</p></div>
            </div>
            <button type="button" disabled={!canSubmit} onClick={() => setSubmitOpen(true)} className="w-full border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:border-danger/50 disabled:text-danger disabled:hover:bg-transparent">{canSubmit ? "Submit a Track" : isFull ? "Queue Full" : "Submissions Closed"}</button>
          </div>
        </div>
      </section>

      {!canSubmit && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{isFull ? "This broadcast queue is full for new transmissions." : "This broadcast queue is closed for new transmissions."}</p>}

      <div className="grid gap-5 xl:grid-cols-3">
        <PublicLane title="Priority Signal" tracks={lanes.priority} lastSubmittedTrackId={lastSubmittedTrackId} />
        <PublicLane title="Wheel Chosen" subtitle="Tracks selected by the 10K tap wheel." tracks={lanes.wheel} lastSubmittedTrackId={lastSubmittedTrackId} />
        <PublicLane title="Incoming Transmissions" tracks={lanes.regular} lastSubmittedTrackId={lastSubmittedTrackId} />
      </div>

      <PublicLane title="Recently Played" tracks={snapshot?.completed ?? []} lastSubmittedTrackId={null} />
      <DiscordQueueCTA />

      {submitOpen && <div className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm"><div className="my-4 max-h-[88vh] w-full max-w-[920px] overflow-y-auto border border-accent/50 bg-background/95 p-4 shadow-[0_0_60px_rgba(255,0,0,0.18)]"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.35em] text-accent">Transmission Intake</p><p className="text-sm text-muted mt-1">Queue remains live behind this terminal while you route your signal.</p></div><button type="button" onClick={() => setSubmitOpen(false)} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted">Collapse Intake</button></div><RadioQueueForm sessionId={sessionId} onSubmitted={(trackId) => { setLastSubmittedTrackId(trackId ?? null); window.setTimeout(() => setSubmitOpen(false), 450); load(); }} /></div></div>}
    </div>
  );
}

function SourceArt({ track }: { track: QueuePublicTrack | null }) {
  const [failed, setFailed] = useState(false);
  const artworkUrl = track ? getTrackArtworkUrl(track) : null;
  if (artworkUrl && !failed) return <img src={artworkUrl} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />;
  return <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,0,0,0.25),transparent_60%)] text-4xl text-accent">▦</div>;
}

function NowPlaying({ title, track, compact = false }: { title: string; track: QueuePublicTrack | null; compact?: boolean }) {
  return <div className="border border-accent/40 bg-surface p-5"><p className="text-xs uppercase tracking-[0.35em] text-accent">{title}</p>{track ? <div className={`mt-4 grid gap-4 ${compact ? "grid-cols-[5rem_1fr]" : "sm:grid-cols-[9rem_1fr]"}`}><div className={`${compact ? "h-20" : "aspect-square"} overflow-hidden border border-accent/40`}><SourceArt track={track} /></div><div><h3 className={`${compact ? "text-lg" : "text-2xl"} font-bold text-foreground`}>{track.submittedArtistName}</h3><p className="text-foreground/90">{track.submittedSongTitle}</p><div className="mt-3 grid gap-1 text-xs text-muted"><p>Platform / source: {track.sourceType.toUpperCase()}</p>{track.tiktokHandle && <p>TikTok: {track.tiktokHandle}</p>}{!track.durationIsEstimate && <p>Duration: {track.durationLabel}</p>}</div></div></div> : <div className="mt-4 border border-border bg-background/40 p-6"><div className="mb-4 flex h-24 items-center justify-center border border-accent/30 text-4xl text-accent">▦</div><p className="text-sm text-muted">No transmission is in this slot yet.</p></div>}</div>;
}

function PublicLane({ title, tracks, subtitle, lastSubmittedTrackId }: { title: string; tracks: QueuePublicTrack[]; subtitle?: string; lastSubmittedTrackId: string | null }) {
  return <section className="border border-border bg-surface p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm uppercase tracking-[0.25em] text-foreground">{title}</h2>{subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}</div><span className="text-xs text-muted">{tracks.length}</span></div><div className="space-y-3">{tracks.length === 0 ? <p className="border border-border/60 p-4 text-sm text-muted">No visible transmissions.</p> : tracks.map((track, index) => <article key={track.id} className={`grid gap-3 border bg-background/40 p-3 sm:grid-cols-[4.5rem_1fr] ${track.id === lastSubmittedTrackId ? "border-accent animate-pulse" : "border-border"}`}><div className="h-20 overflow-hidden border border-border/70"><SourceArt track={track} /></div><div><p className="text-xs text-muted">#{index + 1} · {track.sourceType.toUpperCase()} · {track.durationLabel}</p><p className="font-bold text-foreground">{track.submittedArtistName}</p><p className="text-sm text-foreground/85">{track.submittedSongTitle}</p>{track.id === lastSubmittedTrackId && <p className="mt-2 text-[11px] uppercase tracking-widest text-accent">Transmission received</p>}</div></article>)}</div></section>;
}

function DiscordQueueCTA() {
  return <section className="border border-accent/40 bg-accent/5 p-5"><p className="text-xs uppercase tracking-[0.3em] text-accent">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for BARCODE Radio queue updates and future signal alerts.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-4 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Join Discord</a></section>;
}
