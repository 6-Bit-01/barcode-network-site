/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react/jsx-no-comment-textnodes, @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { RadioQueueForm } from "@/components/RadioQueueForm";
import { externalLinks } from "@/content";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicTrack } from "@/lib/queue-types";

type QueueView = "active" | "recent";

export function PublicQueueSession({ sessionId }: { sessionId: string }) {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [lastSubmittedTrackId, setLastSubmittedTrackId] = useState<string | null>(null);
  const [submitterToken, setSubmitterToken] = useState("");
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [view, setView] = useState<QueueView>("active");

  async function load() {
    const params = new URLSearchParams({ sessionId });
    if (submitterToken) params.set("submitterToken", submitterToken);
    const res = await fetch(`/api/queue?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const next = await res.json();
      setSnapshot(next);
      setCooldownRemaining(next.submitterStatus?.cooldownRemainingSeconds ?? 0);
    }
  }

  useEffect(() => { setSubmitterToken(window.localStorage.getItem("barcode-radio-submitter-token") ?? ""); }, []);
  useEffect(() => { load(); const interval = setInterval(load, 5_000); return () => clearInterval(interval); }, [sessionId, submitterToken]);
  useEffect(() => { if (cooldownRemaining <= 0) return; const timer = window.setInterval(() => setCooldownRemaining((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [cooldownRemaining]);

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
  const isEnded = snapshot?.session.status === "archived";
  const isFull = Boolean(snapshot?.status.isFull || (snapshot && snapshot.status.activeCount >= snapshot.status.capacity));
  const canSubmit = !isEnded && isOpen && !isFull;
  const completedRuntime = snapshot?.session.completedRuntimeSeconds ?? 0;

  if (isEnded) {
    return <div className="space-y-8"><section className="border border-border bg-surface p-6 space-y-4"><p className="text-xs uppercase tracking-[0.35em] text-danger">SESSION ENDED</p><h2 className="text-3xl font-bold text-foreground">{snapshot?.session.title ?? "BARCODE Radio"}</h2><p className="text-sm text-muted">This transmission window has collapsed. Temporal alignment for this broadcast has expired. Review the completed signal log below.</p><div className="grid gap-3 sm:grid-cols-3 text-sm"><div className="border border-border p-3"><p className="text-xs text-muted">Show date</p><p>{snapshot?.session.showDate ?? "—"}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed tracks</p><p>{snapshot?.session.completedCount ?? snapshot?.completed.length ?? 0}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{snapshot ? formatRuntime(completedRuntime) : "—"}</p></div></div></section><PublicLane title="Completed Signal Log" tracks={snapshot?.completed ?? []} lastSubmittedTrackId={null} /></div>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <NowPlaying title="Now Playing" track={snapshot?.nowPlaying ?? null} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <NowPlaying title="Up Next" track={snapshot?.upNext ?? null} compact />
          <QueueStatusPanel snapshot={snapshot} canSubmit={canSubmit} isFull={isFull} onSubmit={() => setSubmitOpen(true)} />
        </div>
      </section>

      {isFull && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">This broadcast queue is full for new transmissions.</p>}

      <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <SubmitterStatusPanel status={snapshot?.submitterStatus ?? null} cooldownRemaining={cooldownRemaining} />
        <QueueMechanicsInfo />
      </div>

      <div className="flex gap-2 border-b border-border">
        <button type="button" onClick={() => setView("active")} className={`px-4 py-3 text-xs uppercase tracking-widest ${view === "active" ? "border-b border-accent text-accent" : "text-muted"}`}>Active Queue</button>
        <button type="button" onClick={() => setView("recent")} className={`px-4 py-3 text-xs uppercase tracking-widest ${view === "recent" ? "border-b border-accent text-accent" : "text-muted"}`}>Recently Played</button>
      </div>

      {view === "active" ? <div className="space-y-3"><PublicLane title="Priority Signal" tracks={lanes.priority} lastSubmittedTrackId={lastSubmittedTrackId} collapsible /><PublicLane title="Wheel Chosen" subtitle="Tracks selected by the 10K tap wheel." tracks={lanes.wheel} lastSubmittedTrackId={lastSubmittedTrackId} collapsible /><PublicLane title="Free Transmissions" tracks={lanes.regular} lastSubmittedTrackId={lastSubmittedTrackId} /></div> : <PublicLane title="Recently Played" tracks={snapshot?.completed ?? []} lastSubmittedTrackId={null} />}

      <DiscordQueueCTA />

      {submitOpen && <div className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto bg-black/75 p-3 backdrop-blur-md md:overflow-hidden"><div className="w-full max-w-[1280px] border border-accent/50 bg-background/95 p-4 shadow-[0_0_70px_rgba(255,0,0,0.22)] md:max-h-[calc(100vh-2rem)]"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.35em] text-accent">Transmission Intake</p><p className="mt-1 text-xs text-muted">Queue remains live behind this terminal while you route your signal.</p></div><button type="button" onClick={() => setSubmitOpen(false)} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted">Collapse Intake</button></div><RadioQueueForm sessionId={sessionId} onSubmitted={(trackId) => { setLastSubmittedTrackId(trackId ?? null); setSubmitterToken(window.localStorage.getItem("barcode-radio-submitter-token") ?? ""); setView("active"); document.getElementById("free-transmissions-lane")?.scrollIntoView({ behavior: "smooth", block: "center" }); window.setTimeout(() => setSubmitOpen(false), 650); load(); }} /></div></div>}
    </div>
  );
}

function SourceArt({ track, className = "h-full w-full" }: { track: QueuePublicTrack | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const artworkUrl = track?.sourceArtworkUrl ?? null;
  if (artworkUrl && !failed) return <img src={artworkUrl} alt="" className={`${className} object-cover`} onError={() => setFailed(true)} />;
  return <div className={`${className} flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,0,0,0.25),transparent_60%)] text-4xl text-accent`}>▦</div>;
}

function tiktokHref(handle?: string | null): string | null { const cleaned = (handle ?? "").trim().replace(/^@+/, "").split(/[/?#]/)[0]?.replace(/[^a-zA-Z0-9._-]/g, ""); return cleaned ? `https://www.tiktok.com/@${cleaned}` : null; }
function TikTokLink({ handle }: { handle?: string | null }) { const href = tiktokHref(handle); if (!href || !handle) return null; return <a href={href} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">{handle.startsWith("@") ? handle : `@${handle}`}</a>; }
function usefulDetected(track: QueuePublicTrack): string | null { const artist = track.detectedArtistName?.trim(); const title = track.detectedSongTitle?.trim() || track.providerTitle?.trim(); if (!artist && !title) return null; const submitted = `${track.submittedArtistName} ${track.submittedSongTitle}`.toLowerCase(); const detected = `${artist ?? ""} ${title ?? ""}`.trim(); return detected && !submitted.includes(detected.toLowerCase()) ? detected : null; }

function NowPlaying({ title, track, compact = false }: { title: string; track: QueuePublicTrack | null; compact?: boolean }) {
  const detected = track ? usefulDetected(track) : null;
  return <div className={`border border-accent/40 bg-surface p-4 ${compact ? "" : "min-h-[15rem]"}`}><p className="text-xs uppercase tracking-[0.35em] text-accent">{title}</p>{track ? <div className={`mt-3 grid gap-4 ${compact ? "grid-cols-[5.5rem_1fr]" : "sm:grid-cols-[12rem_1fr]"}`}><div className={`${compact ? "h-24" : "aspect-square max-h-56"} overflow-hidden border border-accent/40`}><SourceArt track={track} /></div><div className="self-center"><h3 className={`${compact ? "text-xl" : "text-3xl"} font-bold text-foreground`}>{track.submittedArtistName}</h3><p className="mt-1 text-lg text-foreground/90">{track.submittedSongTitle}</p><div className="mt-3 grid gap-1 text-xs text-muted"><TikTokLink handle={track.tiktokHandle} />{detected && <p>Detected signal: {detected}</p>}{!track.durationIsEstimate && <p>Runtime locked: {track.durationLabel}</p>}</div></div></div> : <div className="mt-3 grid gap-4 sm:grid-cols-[8rem_1fr]"><div className="h-32 overflow-hidden border border-accent/30"><SourceArt track={null} /></div><p className="self-center text-sm text-muted">No transmission is in this slot yet.</p></div>}</div>;
}

function QueueStatusPanel({ snapshot, canSubmit, isFull, onSubmit }: { snapshot: QueuePublicSnapshot | null; canSubmit: boolean; isFull: boolean; onSubmit: () => void }) {
  return <div className="border border-border bg-surface p-4 space-y-3"><div><p className="text-xs uppercase tracking-[0.3em] text-muted">// Queue Status</p><h2 className="mt-1 text-xl font-bold text-foreground">{snapshot?.session.title ?? "BARCODE Radio"}</h2><p className="text-xs text-muted">{snapshot?.session.showDate ?? "show date syncing"} · {snapshot?.session.status ?? "syncing"}</p></div><div className="grid grid-cols-2 gap-2 text-sm"><div className="border border-border p-2"><p className="text-xs text-muted">Submissions</p><p className={canSubmit ? "text-accent" : "text-danger"}>{canSubmit ? "Open" : isFull ? "Full" : "Closed"}</p></div><div className="border border-border p-2"><p className="text-xs text-muted">Active</p><p>{snapshot ? `${snapshot.status.activeCount}/${snapshot.status.capacity}` : "—"}</p></div><div className="border border-border p-2"><p className="text-xs text-muted">Runtime</p><p>{snapshot ? formatRuntime(snapshot.status.estimatedRuntimeSeconds) : "—"}</p></div><div className="border border-border p-2"><p className="text-xs text-muted">Pressure</p><p>{snapshot?.status.pressure ?? "syncing"}</p></div></div>{canSubmit ? <button type="button" onClick={onSubmit} className="w-full border border-accent px-4 py-2.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Submit a Track</button> : <div className="border border-danger/40 bg-danger/5 p-3"><p className="text-xs uppercase tracking-[0.25em] text-danger">SUBMISSIONS CLOSED</p><p className="mt-1 text-xs text-muted">Visible queue. No new tracks accepted right now.</p></div>}</div>;
}

function SubmitterStatusPanel({ status, cooldownRemaining }: { status: QueuePublicSnapshot["submitterStatus"] | null; cooldownRemaining: number }) { if (!status) return <section className="border border-border bg-surface p-4 text-xs text-muted">Your transmission counter appears here after your first signal.</section>; return <section className="border border-accent/40 bg-accent/5 p-4 text-sm text-muted"><p className="font-bold text-accent">Your transmissions: {status.used} / {status.limit}</p><p className="mt-1">Remaining: {status.remaining}</p>{cooldownRemaining > 0 && <p className="mt-1 text-accent">Next transmission in {formatCooldown(cooldownRemaining)}</p>}</section>; }
function QueueMechanicsInfo() { return <section className="border border-accent/30 bg-accent/5 p-4"><p className="text-xs uppercase tracking-[0.3em] text-accent">Queue Mechanics</p><p className="mt-1 text-xs leading-relaxed text-muted">Priority Signals jump to the top. When priority is clear, the system alternates between Wheel Chosen and Free Transmissions. Tap energy during the show can destabilize the broadcast relay and move a Free Transmission forward. New submissions enter Free Transmissions unless a future Priority Signal Upgrade or wheel selection moves them.</p></section>; }

function PublicLane({ title, tracks, subtitle, lastSubmittedTrackId, collapsible = false }: { title: string; tracks: QueuePublicTrack[]; subtitle?: string; lastSubmittedTrackId: string | null; collapsible?: boolean }) {
  const collapsed = collapsible && tracks.length === 0;
  const id = title === "Free Transmissions" ? "free-transmissions-lane" : undefined;
  return <section id={id} className={`w-full border bg-surface transition-all ${lastSubmittedTrackId && tracks.some((track) => track.id === lastSubmittedTrackId) ? "border-accent shadow-[0_0_34px_rgba(255,0,0,0.22)]" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm uppercase tracking-[0.25em] text-foreground">{title}</h2>{subtitle && !collapsed && <p className="mt-1 text-xs text-muted">{subtitle}</p>}</div><span className="text-xs text-muted">{tracks.length}</span></div>{collapsed ? <p className="mt-1 text-xs text-muted">No active signals in this lane.</p> : <div className="mt-4 space-y-3">{tracks.length === 0 ? <p className="border border-border/60 p-4 text-sm text-muted">No visible transmissions.</p> : tracks.map((track, index) => <article key={track.id} className={`grid gap-3 border bg-background/40 p-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center ${track.id === lastSubmittedTrackId ? "border-accent animate-pulse" : "border-border"}`}><div className="h-20 overflow-hidden border border-border/70"><SourceArt track={track} /></div><div><p className="text-xs text-muted">#{index + 1} · {track.sourceType.toUpperCase()}</p><p className="font-bold text-foreground">{track.submittedArtistName}</p><p className="text-sm text-foreground/85">{track.submittedSongTitle}</p><div className="mt-2 text-xs text-muted"><TikTokLink handle={track.tiktokHandle} /></div>{track.id === lastSubmittedTrackId && <p className="mt-2 text-[11px] uppercase tracking-widest text-accent">QUEUE INSERTION CONFIRMED</p>}</div><p className="text-xs text-muted sm:text-right">{track.durationLabel}</p></article>)}</div>}</section>;
}

function formatCooldown(seconds: number): string { const minutes = Math.floor(seconds / 60).toString().padStart(2, "0"); const rest = Math.max(0, seconds % 60).toString().padStart(2, "0"); return `${minutes}:${rest}`; }
function DiscordQueueCTA() { return <section className="border border-accent/40 bg-accent/5 p-5"><p className="text-xs uppercase tracking-[0.3em] text-accent">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for BARCODE Radio queue updates and future signal alerts.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-4 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Join Discord</a></section>; }
