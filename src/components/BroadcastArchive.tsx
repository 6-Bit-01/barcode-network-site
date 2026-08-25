"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  broadcastArchiveArtistHref,
  broadcastArchiveShowHref,
  type BroadcastArchiveView,
} from "@/lib/broadcast-archive";
import type {
  QueuePublicHistoryOutcome,
  QueuePublicHistoryTrack,
  QueuePublicProjectHistory,
  QueuePublicShowStats,
  QueuePublicStats,
} from "@/lib/queue-types";

type ShowSort = "newest" | "tracks" | "played";
type ArtistSort = "alphabetical" | "tracks" | "played" | "recent";

function displayDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function sourceLabel(sourceType: QueuePublicHistoryTrack["sourceType"]): string {
  if (sourceType === "youtube") return "YouTube";
  if (sourceType === "soundcloud") return "SoundCloud";
  if (sourceType === "spotify") return "Spotify";
  if (sourceType === "tiktok") return "TikTok";
  if (sourceType === "upload") return "Artist upload";
  if (sourceType === "link") return "Music link";
  return "Submitted source";
}

function outcomeLabel(outcome: QueuePublicHistoryOutcome): string {
  if (outcome === "finished") return "Played";
  if (outcome === "skipped") return "Ended without completion";
  if (outcome === "removed") return "Removed";
  if (outcome === "unknown") return "Outcome not recorded";
  return "Active in show";
}

function outcomeTone(outcome: QueuePublicHistoryOutcome): string {
  if (outcome === "finished") return "border-emerald-300/45 text-emerald-200";
  if (outcome === "active") return "border-[#ffaa00]/45 text-[#ffaa00]";
  if (outcome === "removed") return "border-danger/45 text-danger";
  return "border-border text-muted";
}

function searchableTrack(track: QueuePublicHistoryTrack): string {
  return [track.projectLabel, track.title, track.submittedByTikTokHandle, track.collaboratorNames, track.sessionTitle, track.showDate, track.sourceType].filter(Boolean).join(" ").toLocaleLowerCase("en-US");
}

function showSearchText(show: QueuePublicShowStats): string {
  return [show.title, show.showDate, ...show.trackRoster.map(searchableTrack)].join(" ").toLocaleLowerCase("en-US");
}

function artistSearchText(artist: QueuePublicProjectHistory): string {
  return [artist.projectLabel, ...artist.tracks.map(searchableTrack)].join(" ").toLocaleLowerCase("en-US");
}

function archiveSelectionHref(baseHref: string, view: BroadcastArchiveView, value: string): string {
  if (baseHref === "/radio/archive") {
    return view === "shows" ? broadcastArchiveShowHref(value) : broadcastArchiveArtistHref(value);
  }
  const url = new URL(baseHref, "https://barcode.test");
  url.searchParams.set("view", view);
  if (view === "shows") {
    url.searchParams.set("show", value);
    url.searchParams.delete("artist");
  } else {
    url.searchParams.set("artist", value);
    url.searchParams.delete("show");
  }
  return `${url.pathname}${url.search}`;
}

function setArchiveUrl(href: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", href);
}

function Stat({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="border border-border bg-background/55 p-4">
      <p className="text-[10px] uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

function TrackRow({ track, showLink = true, archiveBaseHref }: { track: QueuePublicHistoryTrack; showLink?: boolean; archiveBaseHref: string }) {
  const handle = track.submittedByTikTokHandle || "Handle not supplied";
  return (
    <article className="border-t-2 border-border/80 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={archiveSelectionHref(archiveBaseHref, "artists", track.projectKey)} className="font-bold text-foreground underline decoration-accent/50 underline-offset-4 hover:text-accent">
            {track.projectLabel}
          </Link>
          <p className="mt-1 text-sm text-foreground/85">{track.title}</p>
          {track.collaboratorNames && <p className="mt-1 text-xs text-muted"><span className="uppercase tracking-widest text-accent/80">Featuring</span> {track.collaboratorNames}</p>}
          <p className="mt-2 text-xs text-muted">Submitted by <span className="font-mono text-cyan-200">{handle}</span></p>
          {showLink && <Link href={archiveSelectionHref(archiveBaseHref, "shows", track.sessionId)} className="mt-1 inline-flex text-xs text-muted underline decoration-border underline-offset-4 hover:text-accent">{displayDate(track.showDate)} · {track.sessionTitle}</Link>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[17rem] sm:justify-end">
          {track.wheelChosen && <span className="border border-cyan-200/45 bg-cyan-200/5 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-200">Wheel Chosen</span>}
          {track.isSimulation && <span className="border border-violet-300/45 bg-violet-300/5 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-violet-200">Simulation</span>}
          <span className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${outcomeTone(track.outcome)}`}>{outcomeLabel(track.outcome)}</span>
          {track.publicSourceUrl ? (
            <a href={track.publicSourceUrl} target="_blank" rel="noopener noreferrer" className="border border-accent/45 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-accent hover:bg-accent hover:text-background">
              Open {sourceLabel(track.sourceType)} ↗
            </a>
          ) : (
            <span className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted">{sourceLabel(track.sourceType)} · no public link</span>
          )}
        </div>
      </div>
    </article>
  );
}

function ShowDetail({ show, archiveBaseHref }: { show: QueuePublicShowStats; archiveBaseHref: string }) {
  const didNotPlay = show.skippedTrackCount + show.removedTrackCount + show.unknownOutcomeTrackCount;
  return (
    <section aria-labelledby="selected-show-heading" className="border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Show Record</p>
          <h2 id="selected-show-heading" className="mt-2 text-2xl font-black text-foreground">{show.title}</h2>
          <p className="mt-1 text-sm text-muted">{displayDate(show.showDate)} · {show.status === "archived" ? "After-show record" : "Show in progress"}</p>
        </div>
        <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)} className="border border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Copy show link</button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Submitted" value={show.submittedTrackCount} detail="Tracks retained in this show record." />
        <Stat label="Played" value={show.finishedTrackCount} detail="Tracks with a completed-play outcome." />
        <Stat label="Did not play" value={didNotPlay} detail="Ended, removed, or unresolved—not counted as played." />
        <Stat label="Wheel Chosen" value={show.wheelChosenTrackCount} detail="Tracks selected through the Wheel." />
      </div>
      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-accent/45 pb-3">
          <div><p className="text-xs uppercase tracking-[0.3em] text-muted">Ordered show roster</p><p className="mt-1 text-xs text-muted">Artists link directly to their Archive sections.</p></div>
          <span className="font-mono text-xs text-muted">{show.trackRoster.length} records</span>
        </div>
        <div className="pt-4">
          {show.trackRoster.length > 0 ? show.trackRoster.map((track) => <TrackRow key={`${track.sessionId}:${track.trackId}`} track={track} showLink={false} archiveBaseHref={archiveBaseHref} />) : <p className="text-sm text-muted">No track records were retained for this show.</p>}
        </div>
      </div>
      {show.milestones.length > 0 && <details className="mt-6 border border-border bg-background/45 p-4"><summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.24em] text-muted">Show milestones ({show.milestones.length})</summary><ol className="mt-4 space-y-3">{show.milestones.map((event) => <li key={event.eventId} className="border-l-2 border-accent/40 pl-3 text-sm"><p className="font-bold text-foreground">{event.headline}</p><p className="mt-1 text-xs text-muted">{event.detail}</p></li>)}</ol></details>}
    </section>
  );
}

function ArtistDetail({ artist, archiveBaseHref }: { artist: QueuePublicProjectHistory; archiveBaseHref: string }) {
  const handles = [...new Set(artist.tracks.map((track) => track.submittedByTikTokHandle).filter(Boolean))].sort();
  const didNotPlay = artist.skippedTrackCount + artist.removedTrackCount + artist.unknownOutcomeTrackCount;
  return (
    <section aria-labelledby="selected-artist-heading" className="border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">Artist / Project Record</p>
          <h2 id="selected-artist-heading" className="mt-2 text-2xl font-black text-foreground">{artist.projectLabel}</h2>
          <p className="mt-1 text-sm text-muted">Submitted artist label · not a verified artist account</p>
        </div>
        <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)} className="border border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted hover:border-cyan-200 hover:text-cyan-200">Copy artist link</button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Shows" value={artist.showCount} detail={`${displayDate(artist.firstShowDate)} through ${displayDate(artist.latestShowDate)}.`} />
        <Stat label="Tracks" value={artist.submittedTrackCount} detail="All retained submissions under this project label." />
        <Stat label="Played" value={artist.finishedTrackCount} detail="Tracks with a completed-play outcome." />
        <Stat label="Did not play" value={didNotPlay} detail="Ended, removed, or unresolved—not counted as played." />
      </div>
      <div className="mt-5 border border-border bg-background/45 p-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted">Submitting TikTok handles</p>
        <div className="mt-3 flex flex-wrap gap-2">{handles.length > 0 ? handles.map((handle) => <span key={handle} className="border border-cyan-200/35 px-2 py-1 font-mono text-xs text-cyan-200">{handle}</span>) : <span className="text-sm text-muted">No TikTok handle was supplied.</span>}</div>
        <p className="mt-3 text-xs leading-relaxed text-muted">Handles identify who submitted each track. They do not establish ownership of this project or verify an account.</p>
      </div>
      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-cyan-200/40 pb-3"><div><p className="text-xs uppercase tracking-[0.3em] text-muted">Appearance history</p><p className="mt-1 text-xs text-muted">Every retained show appearance and track.</p></div><span className="font-mono text-xs text-muted">{artist.tracks.length} records</span></div>
        <div className="pt-4">{artist.tracks.map((track) => <TrackRow key={`${track.sessionId}:${track.trackId}`} track={track} archiveBaseHref={archiveBaseHref} />)}</div>
      </div>
    </section>
  );
}

export function BroadcastArchive({
  initialStats,
  initialView = "shows",
  initialShowId = "",
  initialArtistKey = "",
  refreshEndpoint = "/api/queue/stats",
  archiveBaseHref = "/radio/archive",
  deckHref = "/radio/deck",
  queueHref = "/queue",
  previewMode = false,
}: {
  initialStats: QueuePublicStats;
  initialView?: BroadcastArchiveView;
  initialShowId?: string;
  initialArtistKey?: string;
  refreshEndpoint?: string;
  archiveBaseHref?: string;
  deckHref?: string;
  queueHref?: string;
  previewMode?: boolean;
}) {
  const [stats, setStats] = useState(initialStats);
  const [view, setView] = useState<BroadcastArchiveView>(initialView);
  const [search, setSearch] = useState("");
  const [showSort, setShowSort] = useState<ShowSort>("newest");
  const [artistSort, setArtistSort] = useState<ArtistSort>("alphabetical");
  const [selectedShowId, setSelectedShowId] = useState(initialShowId || initialStats.shows[0]?.sessionId || "");
  const [selectedArtistKey, setSelectedArtistKey] = useState(initialArtistKey || initialStats.artists[0]?.projectKey || "");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  const query = search.trim().toLocaleLowerCase("en-US");
  const shows = useMemo(() => {
    const matching = stats.shows.filter((show) => !query || showSearchText(show).includes(query));
    return [...matching].sort((left, right) => {
      if (showSort === "tracks") return right.submittedTrackCount - left.submittedTrackCount || right.showDate.localeCompare(left.showDate);
      if (showSort === "played") return right.finishedTrackCount - left.finishedTrackCount || right.showDate.localeCompare(left.showDate);
      return right.showDate.localeCompare(left.showDate) || right.sourceUpdatedAt.localeCompare(left.sourceUpdatedAt);
    });
  }, [query, showSort, stats.shows]);
  const artists = useMemo(() => {
    const matching = stats.artists.filter((artist) => !query || artistSearchText(artist).includes(query));
    return [...matching].sort((left, right) => {
      if (artistSort === "tracks") return right.submittedTrackCount - left.submittedTrackCount || left.projectLabel.localeCompare(right.projectLabel);
      if (artistSort === "played") return right.finishedTrackCount - left.finishedTrackCount || left.projectLabel.localeCompare(right.projectLabel);
      if (artistSort === "recent") return right.latestShowDate.localeCompare(left.latestShowDate) || left.projectLabel.localeCompare(right.projectLabel);
      return left.projectLabel.localeCompare(right.projectLabel);
    });
  }, [artistSort, query, stats.artists]);

  const selectedShow = shows.find((show) => show.sessionId === selectedShowId) ?? shows[0] ?? null;
  const selectedArtist = artists.find((artist) => artist.projectKey === selectedArtistKey) ?? artists[0] ?? null;

  function chooseView(next: BroadcastArchiveView) {
    setView(next);
    setArchiveUrl(archiveSelectionHref(archiveBaseHref, next, next === "shows" ? selectedShow?.sessionId ?? "" : selectedArtist?.projectKey ?? ""));
  }

  function chooseShow(sessionId: string) {
    setSelectedShowId(sessionId);
    setArchiveUrl(archiveSelectionHref(archiveBaseHref, "shows", sessionId));
  }

  function chooseArtist(projectKey: string) {
    setSelectedArtistKey(projectKey);
    setArchiveUrl(archiveSelectionHref(archiveBaseHref, "artists", projectKey));
  }

  async function refresh() {
    setRefreshing(true);
    setRefreshError(false);
    try {
      const response = await fetch(refreshEndpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("Archive refresh failed");
      setStats(await response.json() as QueuePublicStats);
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      {previewMode && <section className="border-2 border-violet-300 bg-violet-300/10 p-4 text-center"><p className="text-xs font-black uppercase tracking-[0.32em] text-violet-200">Private Archive Preview · Admin Only</p><p className="mt-2 text-xs text-muted">This reads the selected persisted test session, including simulation records. It does not add the session to the public Broadcast Archive.</p></section>}
      <section className="overflow-hidden border border-accent/45 bg-surface">
        <div className="border-b border-accent/25 bg-[linear-gradient(110deg,rgba(255,0,0,0.12),transparent_55%)] p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.38em] text-accent">{previewMode ? "Private post-show readback" : "Post-show database"}</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-5xl">{previewMode ? "Broadcast Archive Preview" : "The Broadcast Archive"}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">Search {previewMode ? "this test session" : "BARCODE Radio"} by individual show or by artist/project. Follow who submitted each track, public music links, collaborators, exact outcomes, Wheel selections, and repeat appearances.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={deckHref} className="border border-[#ffaa00]/55 px-4 py-3 text-xs font-bold uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background">{previewMode ? "Open Deck Preview" : "Open Broadcast Deck"}</Link>
              <Link href={queueHref} className="border border-border px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Open Queue</Link>
            </div>
          </div>
          <p className="mt-5 border-l-2 border-cyan-200/45 pl-3 text-xs leading-relaxed text-muted">{previewMode ? "Private verification includes simulation records but still uses the public-safe projection: no private contact details, payment secrets, moderation notes, or private upload URLs are exposed here." : `Public history begins ${displayDate(stats.historyCoverageStartedAt)}. Older shows are not automatically imported. Rehearsals, simulations, private uploads, payments, moderation data, and private contact details are excluded.`}</p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <Stat label="Shows" value={stats.overview.showCount} detail={previewMode ? "Selected persisted test record." : "Retained live broadcasts."} />
          <Stat label="Artists" value={stats.overview.artistCount} detail="Distinct submitted project labels." />
          <Stat label="Tracks" value={stats.overview.submittedTrackCount} detail="Public-safe show records." />
          <Stat label="Played" value={stats.overview.finishedTrackCount} detail="Completed-play outcomes only." />
        </div>
      </section>

      <section className="border border-border bg-surface p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block"><span className="sr-only">Search the Broadcast Archive</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search shows, artists, songs, TikTok handles, collaborators…" className="w-full border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/65 focus:border-accent" /></label>
          <button type="button" onClick={refresh} disabled={refreshing} className="border border-border px-4 py-3 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh archive"}</button>
        </div>
        {refreshError && <p role="alert" className="mt-3 text-xs text-danger">The refresh did not complete. The last loaded Archive remains on screen.</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={view === "shows"} onClick={() => chooseView("shows")} className={`${view === "shows" ? "border-accent bg-accent text-background" : "border-border text-muted hover:border-accent hover:text-accent"} border px-4 py-3 text-xs font-black uppercase tracking-[0.24em]`}>Shows · {stats.overview.showCount}</button>
          <button type="button" aria-pressed={view === "artists"} onClick={() => chooseView("artists")} className={`${view === "artists" ? "border-cyan-200 bg-cyan-200 text-background" : "border-border text-muted hover:border-cyan-200 hover:text-cyan-200"} border px-4 py-3 text-xs font-black uppercase tracking-[0.24em]`}>Artists · {stats.overview.artistCount}</button>
        </div>
      </section>

      {view === "shows" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.34fr)_minmax(0,1fr)]">
          <aside className="border border-border bg-surface p-4 lg:sticky lg:top-20 lg:self-start">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">Shows</p><p className="mt-1 text-[11px] text-muted">{shows.length} matching records</p></div><label><span className="sr-only">Sort shows</span><select value={showSort} onChange={(event) => setShowSort(event.target.value as ShowSort)} className="border border-border bg-background px-2 py-2 text-xs text-muted"><option value="newest">Newest</option><option value="tracks">Most tracks</option><option value="played">Most played</option></select></label></div>
            <div className="mt-3 max-h-[62vh] space-y-2 overflow-y-auto pr-1">{shows.map((show) => <button key={show.sessionId} type="button" onClick={() => chooseShow(show.sessionId)} className={`${selectedShow?.sessionId === show.sessionId ? "border-accent bg-accent/10" : "border-border hover:border-accent/55"} w-full border p-3 text-left`}><p className="font-bold text-foreground">{show.title}</p><p className="mt-1 text-xs text-muted">{displayDate(show.showDate)}</p><p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted">{show.submittedTrackCount} tracks · {show.finishedTrackCount} played</p></button>)}{shows.length === 0 && <p className="p-3 text-sm text-muted">No shows match this search.</p>}</div>
          </aside>
          {selectedShow ? <ShowDetail show={selectedShow} archiveBaseHref={archiveBaseHref} /> : <EmptyArchive kind="show" previewMode={previewMode} />}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.34fr)_minmax(0,1fr)]">
          <aside className="border border-border bg-surface p-4 lg:sticky lg:top-20 lg:self-start">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-200">Artists</p><p className="mt-1 text-[11px] text-muted">{artists.length} matching records</p></div><label><span className="sr-only">Sort artists</span><select value={artistSort} onChange={(event) => setArtistSort(event.target.value as ArtistSort)} className="border border-border bg-background px-2 py-2 text-xs text-muted"><option value="alphabetical">A–Z</option><option value="tracks">Most tracks</option><option value="played">Most played</option><option value="recent">Most recent</option></select></label></div>
            <div className="mt-3 max-h-[62vh] space-y-2 overflow-y-auto pr-1">{artists.map((artist) => <button key={artist.projectKey} type="button" onClick={() => chooseArtist(artist.projectKey)} className={`${selectedArtist?.projectKey === artist.projectKey ? "border-cyan-200 bg-cyan-200/5" : "border-border hover:border-cyan-200/55"} w-full border p-3 text-left`}><p className="font-bold text-foreground">{artist.projectLabel}</p><p className="mt-1 text-xs text-muted">{artist.showCount} {artist.showCount === 1 ? "show" : "shows"}</p><p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted">{artist.submittedTrackCount} tracks · {artist.finishedTrackCount} played</p></button>)}{artists.length === 0 && <p className="p-3 text-sm text-muted">No artists match this search.</p>}</div>
          </aside>
          {selectedArtist ? <ArtistDetail artist={selectedArtist} archiveBaseHref={archiveBaseHref} /> : <EmptyArchive kind="artist" previewMode={previewMode} />}
        </div>
      )}
    </div>
  );
}

function EmptyArchive({ kind, previewMode }: { kind: "show" | "artist"; previewMode: boolean }) {
  return <section className="border border-border bg-surface p-8 text-center"><p className="text-sm text-muted">No retained {kind} records are available yet. {previewMode ? "Run the selected private queue and refresh this preview." : "The next explicitly marked live broadcast will begin this Archive."}</p></section>;
}
