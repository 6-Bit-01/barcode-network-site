"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BroadcastActivityLog } from "@/components/BroadcastActivityLog";
import { broadcastArchiveArtistHref, normalizeBroadcastArchiveProjectKey } from "@/lib/broadcast-archive";
import { deckExternalTrackHref } from "@/lib/broadcast-deck";
import { buildQueueTimingDisplay, queueTimingInputFromPublicSnapshot } from "@/lib/queue-timing-display";
import { formatRuntime, type QueuePublicSnapshot, type QueuePublicStats, type QueuePublicTrack } from "@/lib/queue-types";
import { PUBLIC_QUEUE_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { hasActiveQueueSession, startSessionBoundPolling } from "@/lib/session-bound-polling";

type DeckView = "feed" | "line" | "mine";
const ORIENTATION_STORAGE_KEY = "barcode-broadcast-deck-oriented-v1";

function displayTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(parsed);
}

function broadcastPhaseLabel(snapshot: QueuePublicSnapshot | null): string {
  if (!snapshot?.session) return "No live show";
  if (snapshot.session.broadcastPhase === "ended" || snapshot.session.status === "archived") return "Show ended";
  if (snapshot.session.broadcastPhase === "broadcast_active" || snapshot.session.showStarted) return "Broadcast live";
  if (snapshot.status.isOpen) return "Submissions open";
  return "Show standby";
}

function uniqueLiveTracks(snapshot: QueuePublicSnapshot | null): QueuePublicTrack[] {
  if (!snapshot?.session) return [];
  const ids = new Set<string>();
  return [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue].filter((track): track is QueuePublicTrack => {
    if (!track || ids.has(track.id)) return false;
    ids.add(track.id);
    return true;
  });
}

function endpointWithParam(endpoint: string, key: string, value: string): string {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function projectLink(artistName: string, archiveHref: string): string {
  if (archiveHref === "/radio/archive") return broadcastArchiveArtistHref(artistName);
  const url = new URL(archiveHref, "https://barcode.test");
  url.searchParams.set("view", "artists");
  url.searchParams.set("artist", normalizeBroadcastArchiveProjectKey(artistName));
  return `${url.pathname}${url.search}`;
}

function LiveTrackCard({ label, track, tone, archiveHref }: { label: string; track: QueuePublicTrack | null | undefined; tone: "amber" | "red" | "cyan"; archiveHref: string }) {
  const toneClass = tone === "amber" ? "border-[#ffaa00]/55 text-[#ffaa00]" : tone === "cyan" ? "border-cyan-200/45 text-cyan-200" : "border-accent/55 text-accent";
  const externalHref = deckExternalTrackHref(track);
  return (
    <article className={`border bg-background/60 p-5 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.3em]">{label}</p>
      {track ? <>
        <Link href={projectLink(track.submittedArtistName, archiveHref)} className="mt-4 block text-xl font-black text-foreground hover:text-accent">{track.submittedArtistName}</Link>
        <p className="mt-1 text-sm text-foreground/80">{track.submittedSongTitle}</p>
        {track.collaboratorNames && <p className="mt-2 text-xs text-muted"><span className="uppercase tracking-widest">Featuring</span> {track.collaboratorNames}</p>}
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
          <span className="border border-border px-2 py-1 text-muted">{track.durationLabel}</span>
          {track.lane === "wheel" && <span className="border border-cyan-200/45 px-2 py-1 text-cyan-200">Wheel Chosen</span>}
          {track.lane === "priority" && <span className="border border-[#ffaa00]/45 px-2 py-1 text-[#ffaa00]">Priority Signal</span>}
          {externalHref && <a href={externalHref} target="_blank" rel="noopener noreferrer" className="border border-border px-2 py-1 text-muted hover:border-accent hover:text-accent">Open music ↗</a>}
        </div>
      </> : <p className="mt-4 text-sm text-muted">Waiting for the host to route a track.</p>}
    </article>
  );
}

function DeckMetric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="border border-border bg-background/55 p-4"><p className="text-[10px] uppercase tracking-[0.24em] text-muted">{label}</p><p className="mt-2 text-2xl font-black text-foreground">{value}</p><p className="mt-1 text-[11px] leading-relaxed text-muted">{note}</p></div>;
}

export function BroadcastDeck({
  queueEndpoint = "/api/queue",
  statsEndpoint = "/api/queue/stats",
  archiveHref = "/radio/archive",
  queueHrefOverride,
  previewMode = false,
}: {
  queueEndpoint?: string;
  statsEndpoint?: string;
  archiveHref?: string;
  queueHrefOverride?: string;
  previewMode?: boolean;
} = {}) {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const [stats, setStats] = useState<QueuePublicStats | null>(null);
  const [view, setView] = useState<DeckView>("feed");
  const [orientationOpen, setOrientationOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [clockNow, setClockNow] = useState(0);

  const load = useCallback(async () => {
    const submitterToken = window.localStorage.getItem("barcode-radio-submitter-token")?.trim() ?? "";
    const queueUrl = submitterToken ? endpointWithParam(queueEndpoint, "submitterToken", submitterToken) : queueEndpoint;
    try {
      const [queueResponse, statsResponse] = await Promise.all([
        fetch(queueUrl, { cache: "no-store" }),
        fetch(statsEndpoint, {
          cache: "no-store",
          headers: submitterToken ? { "x-barcode-submitter-token": submitterToken } : undefined,
        }),
      ]);
      if (!queueResponse.ok) throw new Error("Queue unavailable");
      const nextSnapshot = await queueResponse.json() as QueuePublicSnapshot;
      setSnapshot(nextSnapshot);
      if (statsResponse.ok) setStats(await statsResponse.json() as QueuePublicStats);
      setLoadError(false);
      setLoaded(true);
      setClockNow(Date.now());
      return hasActiveQueueSession(nextSnapshot);
    } catch {
      setLoadError(true);
      setLoaded(true);
      return null;
    }
  }, [queueEndpoint, statsEndpoint]);

  useEffect(() => {
    setOrientationOpen(!previewMode && window.localStorage.getItem(ORIENTATION_STORAGE_KEY) !== "1");
    return startSessionBoundPolling({ intervalMs: PUBLIC_QUEUE_POLL_INTERVAL_MS, poll: load });
  }, [load, previewMode]);

  const liveTracks = uniqueLiveTracks(snapshot);
  const currentShow = stats?.currentShow && stats.currentShow.sessionId === snapshot?.session?.sessionId ? stats.currentShow : null;
  const timing = useMemo(() => snapshot ? buildQueueTimingDisplay(queueTimingInputFromPublicSnapshot(snapshot), clockNow ? { now: new Date(clockNow) } : {}) : null, [clockNow, snapshot]);
  const queueHref = queueHrefOverride ?? (snapshot?.session && snapshot.session.status !== "archived" ? `/queue/${encodeURIComponent(snapshot.session.sessionId)}` : "/queue");
  const isLive = Boolean(snapshot?.session && snapshot.session.status !== "archived" && snapshot.session.broadcastPhase !== "ended");
  const finishedCount = currentShow?.finishedTrackCount ?? snapshot?.session?.completedCount ?? 0;
  const submittedCount = currentShow?.submittedTrackCount ?? ((snapshot?.session?.acceptedCount ?? 0) || liveTracks.length + finishedCount);
  const progress = submittedCount > 0 ? Math.min(100, Math.round((finishedCount / submittedCount) * 100)) : 0;
  const personalHandles = stats?.personalHistory?.handles ?? [];

  function dismissOrientation() {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, "1");
    setOrientationOpen(false);
  }

  return (
    <div className="space-y-6">
      {previewMode && <section className="border-2 border-cyan-200 bg-cyan-200/10 p-4 text-center"><p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-200">Private Broadcast Test · Admin Only</p><p className="mt-2 text-xs text-muted">Fresh queue-store preview. This surface is not the public Deck and does not publish this session to the public Archive.</p></section>}
      <section className="overflow-hidden border border-[#ffaa00]/45 bg-surface">
        <div className="relative border-b border-[#ffaa00]/20 bg-[linear-gradient(110deg,rgba(255,170,0,0.12),transparent_52%)] p-5 sm:p-7">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(transparent_50%,rgba(255,255,255,0.08)_50%)] [background-size:100%_6px]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2"><span className={`${isLive ? "border-[#ffaa00]/60 bg-[#ffaa00]/10 text-[#ffaa00]" : "border-border text-muted"} border px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em]`}>{broadcastPhaseLabel(snapshot)}</span>{snapshot?.status.isOpen && <span className="border border-accent/55 bg-accent/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-accent">Submissions open</span>}</div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.38em] text-[#ffaa00]">{previewMode ? "Private test show companion" : "Live show companion"}</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-6xl">The Broadcast Deck</h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">Song submissions stay in the queue. Once you are done submitting—or if you are just watching—keep the Deck open to follow Now Playing, what is coming up, Wheel movement, show progress, and your submissions from this browser.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:w-[22rem] lg:grid-cols-1">
              <Link href={queueHref} className="border border-accent bg-accent px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-white hover:bg-red-700">Open current queue</Link>
              <Link href={archiveHref} className="border border-cyan-200/55 px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-cyan-200 hover:bg-cyan-200 hover:text-background">{previewMode ? "Preview Archive" : "Broadcast Archive"}</Link>
              <button type="button" onClick={() => setOrientationOpen(true)} className="border border-border px-4 py-3 text-xs font-black uppercase tracking-widest text-muted hover:border-[#ffaa00] hover:text-[#ffaa00]">How to use the Deck</button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          <DeckMetric label="Received" value={submittedCount} note="Tracks in the current retained show record." />
          <DeckMetric label="Played" value={finishedCount} note="Completed-play outcomes only." />
          <DeckMetric label="Still active" value={liveTracks.length} note="Now Playing, Next In Line, and waiting." />
          <DeckMetric label="Projected runtime" value={timing ? formatRuntime(timing.timeBankSummary.remainingProjectionSeconds) : "—"} note="Estimate for the active line." />
        </div>
      </section>

      {loadError && <section role="alert" className="border border-danger/45 bg-danger/5 p-4 text-sm text-danger">The live signal did not refresh. The last confirmed Deck state remains visible. <button type="button" onClick={() => void load()} className="ml-2 underline underline-offset-4">Try again</button></section>}
      {!loaded && <section className="border border-border bg-surface p-8 text-center text-sm uppercase tracking-widest text-muted">Locking onto the BARCODE Radio signal…</section>}

      {loaded && !isLive ? (
        <section className="border border-border bg-surface p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-muted">Deck standby</p>
          <h2 className="mt-3 text-2xl font-black text-foreground">No live broadcast is active.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">The Deck wakes with the current show. Until then, explore completed shows and artist histories in the separate Broadcast Archive.</p>
          <div className="mt-5 flex flex-wrap gap-2"><Link href={archiveHref} className="border border-cyan-200 bg-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-background">{previewMode ? "Open Archive Preview" : "Open Broadcast Archive"}</Link><Link href={queueHref} className="border border-border px-4 py-3 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Check queue</Link></div>
        </section>
      ) : null}

      {isLive && <>
        <section className="grid gap-4 lg:grid-cols-2">
          <LiveTrackCard label="Now Playing" track={snapshot?.nowPlaying} tone="amber" archiveHref={archiveHref} />
          <LiveTrackCard label="Next In Line" track={snapshot?.upNext} tone="red" archiveHref={archiveHref} />
        </section>

        <section className="border border-border bg-surface p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs uppercase tracking-[0.3em] text-muted">Show progress</p><p className="mt-2 text-sm text-muted">{finishedCount} of {submittedCount || "—"} retained tracks have a completed-play outcome.</p></div><span className="font-mono text-xl font-black text-[#ffaa00]">{progress}%</span></div>
          <div className="mt-4 h-2 overflow-hidden border border-border bg-background"><div className="h-full bg-[linear-gradient(90deg,#ff2a2a,#ffaa00)] transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3"><div className="border border-border bg-background/55 p-3"><p className="uppercase tracking-widest text-muted">Wheel</p><p className="mt-2 font-bold text-foreground">{snapshot?.wheelTiming?.status ?? "idle"} · {snapshot?.session?.wheelSpinsOwed ?? 0} owed</p></div><div className="border border-border bg-background/55 p-3"><p className="uppercase tracking-widest text-muted">Sponsor break</p><p className="mt-2 font-bold text-foreground">{snapshot?.session?.sponsorBreakStatus?.replaceAll("_", " ") ?? "not due"}</p></div><div className="border border-border bg-background/55 p-3"><p className="uppercase tracking-widest text-muted">Last refresh</p><p className="mt-2 font-bold text-foreground">{clockNow ? displayTime(new Date(clockNow).toISOString()) : "—"}</p></div></div>
        </section>

        <section className="border border-border bg-surface">
          <div className="grid grid-cols-3 gap-px border-b border-border bg-border">
            <DeckTab active={view === "feed"} onClick={() => setView("feed")} label="Show feed" />
            <DeckTab active={view === "line"} onClick={() => setView("line")} label="Queue map" />
            <DeckTab active={view === "mine"} onClick={() => setView("mine")} label="This browser" />
          </div>
          <div className="p-5 sm:p-6">
            {view === "feed" && <BroadcastActivityLog events={currentShow?.milestones ?? []} archiveHref={archiveHref} live={isLive} />}
            {view === "line" && <div><div className="border-b-2 border-accent/45 pb-3"><p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">Queue map</p><p className="mt-1 text-xs text-muted">{previewMode ? "Private test order from the selected persisted session." : "Public order only. Priority and Wheel positions can change as the host routes the show."}</p></div><div className="mt-4 space-y-2">{liveTracks.map((track, index) => <div key={track.id} className="grid gap-2 border border-border bg-background/55 p-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center"><span className="font-mono text-xs text-muted">{track.id === snapshot?.nowPlaying?.id ? "LIVE" : track.id === snapshot?.upNext?.id ? "NEXT" : `#${Math.max(1, index - 1)}`}</span><div><Link href={projectLink(track.submittedArtistName, archiveHref)} className="font-bold text-foreground hover:text-accent">{track.submittedArtistName}</Link><p className="text-xs text-muted">{track.submittedSongTitle}</p></div><span className="text-[10px] uppercase tracking-widest text-muted">{track.lane}</span></div>)}</div></div>}
            {view === "mine" && <div><div className="border-b-2 border-cyan-200/40 pb-3"><p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200">From this browser</p><p className="mt-1 text-xs text-muted">Useful when one device submits for multiple artists. This confirms a browser submission, not identity or account ownership.</p></div><div className="mt-4 space-y-3">{personalHandles.length > 0 ? personalHandles.map((handle) => <section key={handle.tiktokHandle} className="border border-border bg-background/55 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-sm font-bold text-cyan-200">{handle.tiktokHandle}</p><span className="text-[10px] uppercase tracking-widest text-muted">{handle.submittedTrackCount} tracks · {handle.projectCount} projects</span></div><div className="mt-3 flex flex-wrap gap-2">{handle.projects.map((project) => <Link key={project.projectKey} href={previewMode ? projectLink(project.projectKey, archiveHref) : broadcastArchiveArtistHref(project.projectKey)} className="border border-cyan-200/30 px-2 py-1 text-xs text-foreground hover:border-cyan-200 hover:text-cyan-200">{project.projectLabel} · {project.submittedTrackCount}</Link>)}</div></section>) : <p className="text-sm text-muted">Submit from this browser to see its {previewMode ? "test" : "public"} handles and project records grouped here.</p>}</div></div>}
          </div>
        </section>
      </>}

      {orientationOpen && <section className="fixed inset-0 z-[10000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="deck-orientation-title"><div className="w-full max-w-xl border border-[#ffaa00]/55 bg-background p-6 shadow-[0_0_70px_rgba(255,170,0,0.18)]"><p className="text-xs uppercase tracking-[0.35em] text-[#ffaa00]">Deck orientation</p><h2 id="deck-orientation-title" className="mt-3 text-2xl font-black text-foreground">Your companion during the show</h2><ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted"><li className="border-l-2 border-[#ffaa00]/45 pl-3"><strong className="text-foreground">Follow live movement.</strong> Now Playing, Next In Line, the public queue map, Wheel state, and show progress update here.</li><li className="border-l-2 border-accent/45 pl-3"><strong className="text-foreground">Submissions happen in the queue.</strong> The Deck is a read-only watch-along; jump back to the queue if you still need to submit or inspect a track.</li><li className="border-l-2 border-cyan-200/45 pl-3"><strong className="text-foreground">Open the separate Archive.</strong> Search completed shows and artist histories during or after the broadcast.</li><li className="border-l-2 border-border pl-3"><strong className="text-foreground">This browser groups its submissions.</strong> It does not verify a TikTok account or artist identity.</li></ul><button type="button" onClick={dismissOrientation} className="mt-6 w-full border border-[#ffaa00] bg-[#ffaa00] px-4 py-3 text-xs font-black uppercase tracking-widest text-background">Enter the Broadcast Deck</button></div></section>}
    </div>
  );
}

function DeckTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`${active ? "bg-foreground text-background" : "bg-surface text-muted hover:text-foreground"} px-2 py-3 text-[10px] font-black uppercase tracking-[0.16em] sm:text-xs sm:tracking-[0.24em]`}>{label}</button>;
}
