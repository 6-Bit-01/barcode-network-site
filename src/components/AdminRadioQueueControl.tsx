/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatRuntime, getTrackRuntimeSeconds } from "@/lib/queue-types";
import type { QueueEntry, QueueLane, QueueSessionSummary, QueueState } from "@/lib/queue-types";

type Tab = "active" | "completed" | "removed";
type AdminQueueAction = "finish" | "remove" | "priority" | "wheel" | "spotlight" | "removeSpotlight" | "restoreRegular" | "restorePriority";

const LANE_LABELS: Record<QueueLane, string> = { priority: "Priority Lane", wheel: "Wheel Winner", regular: "Regular Queue" };

function sourceLabel(entry: QueueEntry): string { return (entry.sourceType ?? "other").toUpperCase(); }
function openUrl(entry: QueueEntry): string { return entry.fileUrl || entry.link; }
function submittedArtist(entry: QueueEntry): string { return entry.submittedArtistName ?? entry.artist; }
function submittedTitle(entry: QueueEntry): string { return entry.submittedSongTitle ?? entry.title; }
function entryLane(entry: QueueEntry): QueueLane { return entry.lane ?? "regular"; }
function durationSourceLabel(entry: QueueEntry): string { return (entry.durationSource ?? "internal_estimate").replace(/_/g, " "); }
function durationLabel(entry: QueueEntry): string {
  const duration = formatRuntime(getTrackRuntimeSeconds(entry));
  return entry.durationIsEstimate ? `${duration} estimated / pending · ${durationSourceLabel(entry)}` : `${duration} detected · ${durationSourceLabel(entry)}`;
}
function detectedLabel(entry: QueueEntry): string | null {
  if (!entry.detectedArtistName && !entry.detectedSongTitle && !entry.providerTitle) return null;
  return `${entry.detectedArtistName || "Unknown artist"} — ${entry.detectedSongTitle || entry.providerTitle || "Unknown title"}`;
}
function embedUrl(entry: QueueEntry): string | null {
  const url = openUrl(entry);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (entry.sourceType === "youtube") {
      const id = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (entry.sourceType === "spotify") return `https://open.spotify.com/embed${parsed.pathname}`;
    if (entry.sourceType === "soundcloud") return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`;
  } catch { return null; }
  return null;
}
function initialSessionIdFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("sessionId") ?? undefined;
}

export function AdminRadioQueueControl() {
  const [state, setState] = useState<QueueState | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [player, setPlayer] = useState<QueueEntry | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [wheelSearch, setWheelSearch] = useState("");
  const [wheelSelection, setWheelSelection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  async function load(sessionId?: string) {
    const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const res = await fetch(`/api/admin/queue${suffix}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "Admin authentication required. Log in at /admin first." : "Queue control unavailable.");
      return;
    }
    setError(null);
    setState(await res.json());
  }

  useEffect(() => {
    setMounted(true);
    const sessionId = initialSessionIdFromUrl();
    load(sessionId);
    const interval = setInterval(() => load(initialSessionIdFromUrl()), 10_000);
    return () => clearInterval(interval);
  }, []);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) setState(await res.json());
  }
  async function action(id: string, next: AdminQueueAction) { await post({ id, action: next }); }
  async function toggleOpen(isOpen: boolean) { await post({ action: "setOpen", isOpen }); }
  async function copy(entry: QueueEntry) { await navigator.clipboard.writeText(openUrl(entry)); }
  function loadPlayer(entry: QueueEntry) {
    setPlayer(entry);
    setMinimized(false);
  }
  async function markWheelWinner() {
    if (!wheelSelection) return;
    await action(wheelSelection, "wheel");
    setWheelSelection("");
    setWheelSearch("");
  }

  const lanes = useMemo(() => {
    const active = state?.queue ?? [];
    return {
      priority: active.filter((entry) => entry.lane === "priority"),
      wheel: active.filter((entry) => entry.lane === "wheel"),
      regular: active.filter((entry) => !entry.lane || entry.lane === "regular"),
      spotlight: state?.spotlight ?? [],
    };
  }, [state]);

  const wheelMatches = useMemo(() => {
    const query = wheelSearch.trim().toLowerCase();
    const regular = lanes.regular.filter((entry) => entry.status === "queued");
    if (!query) return regular.slice(0, 8);
    return regular.filter((entry) => `${submittedArtist(entry)} ${submittedTitle(entry)} ${entry.link} ${entry.fileName ?? ""}`.toLowerCase().includes(query)).slice(0, 8);
  }, [lanes.regular, wheelSearch]);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;
  const runtime = state?.publicStatus?.estimatedRuntimeSeconds ?? 0;
  const readOnly = state?.readOnly ?? false;
  const hasSession = Boolean(state?.session);
  const canControlSession = Boolean(state?.session && state.session.status !== "archived" && !readOnly);
  const isArchivedReview = Boolean(state?.session?.status === "archived" || readOnly);
  const nextInLine = state?.nextInLine ?? null;
  const playerPadding = player ? (minimized ? "pb-32" : "pb-[28rem]") : "pb-16";

  return (
    <div className={`${playerPadding} space-y-6`}>
      <section className="border border-accent/40 bg-surface p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-accent">Current Broadcast Session</p>
            <h2 className="text-2xl font-bold text-foreground mt-2">{hasSession ? state?.session?.title : "No active broadcast session prepared."}</h2>
            <p className="text-xs text-muted">{hasSession ? `${state?.session?.showDate} · ${state?.session?.status}` : "Prepare a new session in Show Management before opening submissions."} {isArchivedReview ? "· ARCHIVED / READ ONLY" : ""}</p>
            {hasSession && state?.session?.description && <p className="text-xs text-muted mt-2 max-w-2xl">{state.session.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => load()} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted">View Current Session</button>
            <a href="/admin/show-management" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Show Management</a>
            <button onClick={() => setShowSessions((value) => !value)} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted">View Saved Sessions</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="border border-border bg-background/40 p-4"><p className="text-xs text-muted">Queue</p><p className={state?.publicStatus?.isOpen ? "text-accent" : "text-danger"}>{state?.publicStatus?.isOpen ? "Open" : "Closed"}</p></div>
          <div className="border border-border bg-background/40 p-4"><p className="text-xs text-muted">Active count</p><p>{state?.publicStatus?.activeCount ?? "—"}</p></div>
          <div className="border border-border bg-background/40 p-4"><p className="text-xs text-muted">Runtime</p><p>{formatRuntime(runtime)}</p></div>
          <div className="border border-border bg-background/40 p-4"><p className="text-xs text-muted">Pressure</p><p>{state?.publicStatus?.pressure ?? "syncing"}</p></div>
        </div>
        {isArchivedReview && <div className="border border-danger/40 bg-danger/10 p-3 text-xs uppercase tracking-widest text-danger">ARCHIVED / READ ONLY — queue review actions are locked until this session is reactivated.</div>}
        {canControlSession && <div className="flex flex-wrap gap-3"><button onClick={() => toggleOpen(true)} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Queue</button><button onClick={() => toggleOpen(false)} className="border border-danger/50 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Close Queue</button></div>}
      </section>

      {showSessions && <SessionArchive sessions={state?.sessions ?? []} activeSessionId={state?.session?.sessionId} onView={(id) => load(id)} onActivate={(id) => post({ action: "activateSession", sessionId: id })} />}

      {!hasSession ? (
        <section className="border border-border bg-surface p-6">
          <h2 className="text-2xl font-bold text-foreground">No active BARCODE Radio session is prepared.</h2>
          <p className="text-sm text-muted mt-2">Create or reactivate a session before using the live queue control room.</p>
          <a href="/admin/show-management" className="inline-flex mt-4 border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Go to Show Management</a>
        </section>
      ) : <>
        <div className="flex gap-2 border-b border-border">
          {(["active", "completed", "removed"] as Tab[]).map((key) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-xs uppercase tracking-widest ${tab === key ? "text-accent border-b border-accent" : "text-muted"}`}>{key === "active" ? "Active Queue" : key === "completed" ? "Completed Tracks" : "Removed"}</button>)}
        </div>

        {tab === "active" && <>
          <NextInLineBox entry={nextInLine} readOnly={readOnly} onAction={action} onPlayer={loadPlayer} onCopy={copy} />
          <WheelWinnerSelector tracks={wheelMatches} search={wheelSearch} selection={wheelSelection} readOnly={readOnly} onSearch={setWheelSearch} onSelection={setWheelSelection} onMark={markWheelWinner} />
          <div className="grid gap-5 xl:grid-cols-2"><Lane title="Priority Lane" tracks={lanes.priority} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /><Lane title="Wheel Winners" tracks={lanes.wheel} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /><Lane title="Regular Queue" tracks={lanes.regular} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="active" readOnly={readOnly} /><Lane title="Spotlight List" tracks={lanes.spotlight} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="spotlight" readOnly={readOnly} /></div>
        </>}
        {tab === "completed" && <Lane title="Completed Tracks" tracks={state?.history ?? []} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="completed" readOnly={readOnly} />}
        {tab === "removed" && <Lane title="Removed" tracks={state?.removed ?? []} onAction={action} onPlayer={loadPlayer} onCopy={copy} mode="removed" readOnly={readOnly} />}
      </>}

      {mounted && player && createPortal(<PlayerDock player={player} minimized={minimized} setMinimized={setMinimized} onClose={() => setPlayer(null)} onCopy={() => copy(player)} />, document.body)}
    </div>
  );
}

function SessionArchive({ sessions, activeSessionId, onView, onActivate }: { sessions: QueueSessionSummary[]; activeSessionId?: string; onView: (id: string) => void; onActivate: (id: string) => void }) {
  return <section className="border border-border bg-surface p-4 space-y-3"><h2 className="text-sm uppercase tracking-[0.25em] text-foreground">Saved Sessions</h2><div className="grid gap-3">{sessions.map((session) => <div key={session.sessionId} className="border border-border bg-background/40 p-3"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-bold">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status} · active {session.activeCount} · completed {session.completedCount}</p></div><div className="flex gap-2"><button onClick={() => onView(session.sessionId)} className="border border-accent/60 px-3 py-1.5 text-xs text-accent">View</button>{session.sessionId !== activeSessionId && <button onClick={() => onActivate(session.sessionId)} className="border border-border px-3 py-1.5 text-xs text-muted">Reactivate</button>}</div></div></div>)}</div></section>;
}

function NextInLineBox({ entry, readOnly, onAction, onPlayer, onCopy }: { entry: QueueEntry | null; readOnly: boolean; onAction: (id: string, action: AdminQueueAction) => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void }) {
  return <section className="border border-accent/60 bg-accent/5 p-5 space-y-4"><div><p className="text-xs uppercase tracking-[0.4em] text-accent">Next in Line</p>{!entry ? <p className="mt-3 text-lg text-muted">No active transmissions waiting.</p> : <><h2 className="mt-3 text-2xl font-bold text-foreground">{submittedArtist(entry)} — {submittedTitle(entry)}</h2><p className="text-sm text-muted mt-1">Lane: {LANE_LABELS[entryLane(entry)]} · Source: {sourceLabel(entry)} · Duration: {durationLabel(entry)}</p>{detectedLabel(entry) && <p className="text-xs text-muted mt-1">Detected / Provider: {detectedLabel(entry)}</p>}</>}</div>{entry && <TrackActions entry={entry} mode="active" readOnly={readOnly} onAction={onAction} onPlayer={onPlayer} onCopy={onCopy} emphasizeFinish />}</section>;
}

function WheelWinnerSelector({ tracks, search, selection, readOnly, onSearch, onSelection, onMark }: { tracks: QueueEntry[]; search: string; selection: string; readOnly: boolean; onSearch: (value: string) => void; onSelection: (value: string) => void; onMark: () => void }) {
  return <section className="border border-border bg-surface p-4 space-y-3"><div><p className="text-xs uppercase tracking-[0.3em] text-muted">Wheel Spin Winner Selector</p><p className="text-sm text-muted mt-2">Search active Regular Queue tracks only. Marking a winner moves the selected track into Wheel Winners without duplicating it.</p></div><div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]"><input value={search} onChange={(event) => onSearch(event.target.value)} disabled={readOnly} placeholder="Search artist, title, or link" className="w-full border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" /><select value={selection} onChange={(event) => onSelection(event.target.value)} disabled={readOnly || tracks.length === 0} className="w-full border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"><option value="">{tracks.length === 0 ? "No active regular tracks found" : "Select a Regular Queue track"}</option>{tracks.map((entry) => <option key={entry.id} value={entry.id}>{submittedArtist(entry)} — {submittedTitle(entry)}</option>)}</select><button onClick={onMark} disabled={readOnly || !selection} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent disabled:cursor-not-allowed disabled:opacity-40">Mark Wheel Winner</button></div></section>;
}

function PlayerDock({ player, minimized, setMinimized, onClose, onCopy }: { player: QueueEntry; minimized: boolean; setMinimized: (value: boolean) => void; onClose: () => void; onCopy: () => void }) {
  const embedded = embedUrl(player);
  return <div className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-accent/40 bg-background/95 p-3 shadow-[0_-20px_60px_rgba(0,0,0,0.45)] backdrop-blur"><div className="mx-auto max-w-7xl">{minimized ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs uppercase tracking-[0.25em] text-accent">Queue Player Dock</p><p className="text-sm font-bold">{submittedArtist(player)} — {submittedTitle(player)} <span className="text-muted">· {sourceLabel(player)}</span></p>{detectedLabel(player) && <p className="text-xs text-muted">Detected / Provider: {detectedLabel(player)}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={() => setMinimized(false)} className="border border-accent px-3 py-2 text-xs text-accent">Expand</button><a href={openUrl(player)} target="_blank" rel="noreferrer" className="border border-border px-3 py-2 text-xs text-muted">Open Link</a><button onClick={onCopy} className="border border-border px-3 py-2 text-xs text-muted">Copy Link</button><button onClick={onClose} className="border border-danger/40 px-3 py-2 text-xs text-danger">Close</button></div></div> : <><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.35em] text-accent">Command Deck Player</p><h3 className="text-lg font-bold">{submittedArtist(player)} — {submittedTitle(player)}</h3>{detectedLabel(player) && <p className="text-xs text-muted mt-1">Detected / Provider: {detectedLabel(player)}</p>}<p className="text-xs text-muted mt-1">{sourceLabel(player)} · {durationLabel(player)}</p></div><div className="flex gap-2"><button onClick={() => setMinimized(true)} className="border border-border px-3 py-2 text-xs text-muted">Minimize</button><button onClick={onClose} className="border border-danger/40 px-3 py-2 text-xs text-danger">Close</button></div></div><div className="mt-4 grid items-end gap-4 lg:grid-cols-[1fr_auto]"><div className="min-h-20">{player.sourceType === "upload" && player.fileUrl && <audio src={player.fileUrl} controls className="w-full" />}{player.sourceType !== "upload" && embedded && <iframe title="Queue preview" src={embedded} className="h-48 w-full border border-border" allow="clipboard-write; encrypted-media; picture-in-picture" />}{player.sourceType !== "upload" && !embedded && <div className="border border-border p-6 text-sm text-muted">No embeddable preview available for this source. Use Open Link or Copy Link.</div>}</div><div className="flex flex-wrap gap-2"><a href={openUrl(player)} target="_blank" rel="noreferrer" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent">Open Link</a><button onClick={onCopy} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Copy Link</button></div></div></>}</div></div>;
}

function TrackActions({ entry, onAction, onPlayer, onCopy, mode, readOnly, emphasizeFinish = false }: { entry: QueueEntry; onAction: (id: string, action: AdminQueueAction) => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void; mode: "active" | "spotlight" | "completed" | "removed"; readOnly: boolean; emphasizeFinish?: boolean }) {
  const lane = entryLane(entry);
  return <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onPlayer(entry)} className="border border-accent px-3 py-1.5 text-xs text-accent">Load in Player</button><a href={openUrl(entry)} target="_blank" rel="noreferrer" className="border border-border px-3 py-1.5 text-xs text-muted">Open Link</a><button type="button" onClick={() => onCopy(entry)} className="border border-border px-3 py-1.5 text-xs text-muted">Copy Link</button>{!readOnly && mode === "active" && <><button type="button" onClick={() => onAction(entry.id, "finish")} className={`${emphasizeFinish ? "border-accent bg-accent text-background" : "border-accent/50 text-accent"} border px-3 py-1.5 text-xs`}>Finish</button><button type="button" onClick={() => onAction(entry.id, "remove")} className="border border-danger/40 px-3 py-1.5 text-xs text-danger">Remove</button>{lane !== "priority" && <button type="button" onClick={() => onAction(entry.id, "priority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move to Priority Lane</button>}<button type="button" onClick={() => onAction(entry.id, "spotlight")} className="border border-foreground/40 px-3 py-1.5 text-xs text-foreground">Spotlight</button></>}{!readOnly && mode === "spotlight" && <button type="button" onClick={() => onAction(entry.id, "removeSpotlight")} className="border border-danger/40 px-3 py-1.5 text-xs text-danger">Remove from Spotlight</button>}{!readOnly && mode === "completed" && <><button type="button" onClick={() => onAction(entry.id, "restoreRegular")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Move back to Regular Queue</button><button type="button" onClick={() => onAction(entry.id, "restorePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move back to Priority Lane</button></>}{!readOnly && mode === "removed" && <><button type="button" onClick={() => onAction(entry.id, "restoreRegular")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Restore to Regular Queue</button><button type="button" onClick={() => onAction(entry.id, "restorePriority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Restore to Priority Lane</button></>}</div>;
}

function Lane({ title, tracks, onAction, onPlayer, onCopy, mode, readOnly }: { title: string; tracks: QueueEntry[]; onAction: (id: string, action: AdminQueueAction) => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void; mode: "active" | "spotlight" | "completed" | "removed"; readOnly: boolean }) {
  return <section className="border border-border bg-surface p-4"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm uppercase tracking-[0.25em] text-foreground">{title}</h2><span className="text-xs text-muted">{tracks.length}</span></div><div className="space-y-3">{tracks.length === 0 ? <p className="border border-border/60 p-4 text-sm text-muted">No tracks in this lane.</p> : tracks.map((entry) => <article key={`${title}-${entry.id}`} className="space-y-3 border border-border bg-background/40 p-4"><div className="space-y-2"><div><p className="font-bold">{submittedArtist(entry)} — {submittedTitle(entry)}</p><p className="text-xs text-muted">{sourceLabel(entry)} · {durationLabel(entry)} · {entry.fileName || entry.link}</p></div><div className="grid gap-2 text-xs sm:grid-cols-2"><div className="border border-border/60 p-2"><span className="block text-muted uppercase tracking-widest">Submitted</span>{submittedArtist(entry)} — {submittedTitle(entry)}</div><div className="border border-border/60 p-2"><span className="block text-muted uppercase tracking-widest">Detected / Provider</span>{detectedLabel(entry) ?? "Pending provider metadata"}</div></div>{entry.note && <details className="border border-accent/30 bg-accent/5 p-2 text-xs"><summary className="cursor-pointer text-accent uppercase tracking-widest">Submission note</summary><p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-foreground">{entry.note}</p></details>}</div><TrackActions entry={entry} onAction={onAction} onPlayer={onPlayer} onCopy={onCopy} mode={mode} readOnly={readOnly} /></article>)}</div></section>;
}
