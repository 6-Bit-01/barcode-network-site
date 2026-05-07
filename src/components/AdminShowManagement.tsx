/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueueSessionSummary, QueueState } from "@/lib/queue-types";

const SESSION_DESCRIPTION_OPTIONS = [
  "Three tracks per submitter by default. Capacity is capped for this broadcast queue. At the skip-game breach, Wheel Chosen can fracture the order, while Priority Lane stays reserved for future urgent access.",
  "BARCODE queue rules: three transmissions per submitter, fixed session capacity, wheel logic when the skip-game signal opens, and Priority Lane held for future fast-pass transmissions.",
  "Each submitter may route three tracks into this interdimensional queue. Capacity is finite, Wheel Chosen can breach the line, and Priority Lane remains ready for future priority access.",
];

type SubmitterRow = {
  sessionId: string;
  sessionTitle: string;
  showDate: string;
  submitterArtistName: string;
  submittedArtistName: string;
  submittedSongTitle: string;
  tiktokHandle: string;
  contactEmail: string;
  sourceLink: string;
  sourceType: string;
  submittedAt: string;
  status: string;
  lane: string;
  spotlight: boolean;
};

function todayDate(): string { return new Date().toISOString().slice(0, 10); }
function defaultDescription(date: string): string { return SESSION_DESCRIPTION_OPTIONS[[...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % SESSION_DESCRIPTION_OPTIONS.length]; }
function exportHref(sessionId?: string): string { return `/api/admin/queue/export${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`; }

export function AdminShowManagement() {
  const [state, setState] = useState<QueueState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDate] = useState(todayDate());
  const [title, setTitle] = useState(`BARCODE Radio — ${todayDate()}`);
  const [description, setDescription] = useState(defaultDescription(todayDate()));
  const [trackLimitPerArtist, setTrackLimitPerArtist] = useState(3);
  const [queueCapacity, setQueueCapacity] = useState(50);

  async function load(sessionId?: string) {
    const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const res = await fetch(`/api/admin/queue${suffix}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "Admin authentication required. Log in at /admin first." : "Show management unavailable.");
      return;
    }
    setError(null);
    setState(await res.json());
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) setState(await res.json());
  }

  async function startSession() {
    if (queueIsOpen) return;
    await post({ action: "startSession", title, showDate, description, trackLimitPerArtist, queueCapacity });
  }

  useEffect(() => { load(); }, []);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;

  const session = state?.session;
  const readOnly = Boolean(state?.readOnly || session?.status === "archived");
  const pastSessions = (state?.sessions ?? []).filter((item) => item.sessionId !== session?.sessionId);
  const queueIsOpen = Boolean(session && !readOnly && session.queueOpen);

  return (
    <div className="space-y-6">
      <StartNewSession queueIsOpen={queueIsOpen} title={title} description={description} trackLimitPerArtist={trackLimitPerArtist} queueCapacity={queueCapacity} onTitle={setTitle} onDescription={setDescription} onTrackLimit={setTrackLimitPerArtist} onCapacity={setQueueCapacity} onStart={startSession} sessionId={session?.sessionId} />
      <CurrentSession session={session ?? null} readOnly={readOnly} onPost={post} />
      <SessionData session={session ?? null} />
      <ArchivedShows sessions={pastSessions} />
    </div>
  );
}

function StartNewSession({ queueIsOpen, title, description, trackLimitPerArtist, queueCapacity, onTitle, onDescription, onTrackLimit, onCapacity, onStart, sessionId }: { queueIsOpen: boolean; title: string; description: string; trackLimitPerArtist: number; queueCapacity: number; onTitle: (value: string) => void; onDescription: (value: string) => void; onTrackLimit: (value: number) => void; onCapacity: (value: number) => void; onStart: () => void; sessionId?: string }) {
  return <section className={`space-y-5 border p-6 ${queueIsOpen ? "border-danger/60 bg-danger/10" : "border-accent/40 bg-surface"}`}><div><p className="text-xs uppercase tracking-[0.4em] text-accent">Start New Session</p><p className="text-sm text-muted mt-2">Create a clean BARCODE Radio session. Submissions start closed; open them from Current Session when ready.</p></div>{queueIsOpen && <div className="border border-danger/50 bg-danger/10 p-4"><p className="text-sm font-bold uppercase tracking-[0.25em] text-danger">QUEUE OPEN</p><p className="mt-2 text-sm text-muted">Start New Session is locked while submissions are open for the current broadcast.</p><div className="mt-3 flex flex-wrap gap-2">{sessionId && <a href={`/queue/${sessionId}`} className="border border-danger/50 px-3 py-2 text-xs uppercase tracking-widest text-danger">Go to Current Session</a>}<a href="/admin/queue" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Open Queue Control</a></div></div>}<div className="grid gap-4 lg:grid-cols-2"><label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Session title</span><input disabled={queueIsOpen} value={title} onChange={(event) => onTitle(event.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label><label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Track limit</span><input disabled={queueIsOpen} type="number" min={1} value={trackLimitPerArtist} onChange={(event) => onTrackLimit(Number(event.target.value))} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label><label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Queue capacity</span><input disabled={queueIsOpen} type="number" min={1} value={queueCapacity} onChange={(event) => onCapacity(Number(event.target.value))} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label><label className="space-y-2 lg:col-span-2"><span className="text-xs uppercase tracking-widest text-muted">Description / rule blurb</span><textarea disabled={queueIsOpen} value={description} onChange={(event) => onDescription(event.target.value)} rows={4} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label></div><button onClick={onStart} disabled={queueIsOpen} className="border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:opacity-40">Start New Session</button></section>;
}

function CurrentSession({ session, readOnly, onPost }: { session: QueueSessionSummary | null | undefined; readOnly: boolean; onPost: (body: Record<string, unknown>) => void }) {
  if (!session) return <section className="border border-border bg-surface p-6"><h2 className="text-2xl font-bold text-foreground">No active broadcast session prepared.</h2><p className="text-sm text-muted mt-2">Use Start New Session to create a clean session.</p></section>;
  return <section className="border border-border bg-surface p-6 space-y-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Current Session</p><h2 className="text-2xl font-bold text-foreground mt-2">{session.title}</h2><p className="text-sm text-muted mt-1">{session.showDate} · {session.status}{readOnly ? " · read-only" : ""}</p><p className="text-sm text-muted mt-3 max-w-3xl">{session.description}</p></div><div className="flex flex-wrap gap-2"><a href={`/admin/queue?sessionId=${encodeURIComponent(session.sessionId)}`} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">{readOnly ? "Review Queue" : "Open Queue Control"}</a>{!readOnly && <button onClick={() => onPost({ action: "setOpen", isOpen: !session.queueOpen })} className={`${session.queueOpen ? "border-danger text-danger hover:bg-danger" : "border-accent text-accent hover:bg-accent"} border px-4 py-2 text-xs uppercase tracking-widest hover:text-background`}>{session.queueOpen ? "Close Submissions" : "Open Submissions"}</button>}</div></div><div className="grid gap-3 sm:grid-cols-4 text-sm"><div className="border border-border p-3"><p className="text-xs text-muted">Submissions</p><p className={session.queueOpen ? "text-accent" : "text-danger"}>{session.queueOpen ? "Open" : "Closed"}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Active / Capacity</p><p>{session.activeCount}/{session.queueCapacity}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed</p><p>{session.completedCount}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Removed</p><p>{session.removedCount}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Spotlight</p><p>{session.spotlightCount}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Track limit</p><p>{session.trackLimitPerArtist}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Active runtime</p><p>{formatRuntime(session.estimatedActiveRuntimeSeconds)}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{formatRuntime(session.completedRuntimeSeconds)}</p></div></div>{!readOnly && <button onClick={() => onPost({ action: "archiveSession" })} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-danger hover:text-danger">Archive Session</button>}</section>;
}

function SessionData({ session }: { session: QueueSessionSummary | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SubmitterRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function viewList() {
    if (!session) return;
    setOpen(true);
    setLoading(true);
    const res = await fetch(`/api/admin/queue/export?sessionId=${encodeURIComponent(session.sessionId)}&format=json`, { cache: "no-store" });
    if (res.ok) {
      const payload = await res.json();
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
    }
    setLoading(false);
  }

  if (!session) return null;
  return <section className="border border-border bg-surface p-6 space-y-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Session Data / Submission Export</p><p className="text-sm text-muted mt-2">Admin-only submitter/contact data for this session. Private contact fields are not exposed publicly.</p></div><div className="flex flex-wrap gap-2"><button onClick={viewList} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">View Submitter List</button><a href={exportHref(session.sessionId)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Download CSV</a></div></div>{open && <div className="overflow-x-auto border border-border bg-background/40"><table className="min-w-full text-left text-xs"><thead className="text-muted"><tr><th className="p-2">Submitter</th><th className="p-2">Display Artist</th><th className="p-2">Song</th><th className="p-2">TikTok</th><th className="p-2">Email/contact</th><th className="p-2">Status</th><th className="p-2">Lane</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="p-3 text-muted">Loading submitter list…</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="p-3 text-muted">No submissions found for this session.</td></tr> : rows.map((row, index) => <tr key={`${row.sessionId}-${row.sourceLink}-${index}`} className="border-t border-border/60"><td className="p-2">{row.submitterArtistName}</td><td className="p-2">{row.submittedArtistName}</td><td className="p-2">{row.submittedSongTitle}</td><td className="p-2">{row.tiktokHandle || "—"}</td><td className="p-2">{row.contactEmail || "—"}</td><td className="p-2">{row.status}</td><td className="p-2">{row.lane}{row.spotlight ? " · spotlight" : ""}</td></tr>)}</tbody></table></div>}</section>;
}

function ArchivedShows({ sessions }: { sessions: QueueSessionSummary[] }) {
  return <section className="border border-border bg-surface p-5 space-y-4"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Archived Shows</p><p className="text-sm text-muted mt-2">Past sessions stay closed. Review finished-session reports and export session-scoped data here.</p></div><div className="grid gap-3">{sessions.length === 0 ? <p className="border border-border/60 p-4 text-sm text-muted">No archived or past shows saved yet.</p> : sessions.map((session) => <article key={session.sessionId} className="border border-border bg-background/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-foreground">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status} · active {session.activeCount}/{session.queueCapacity} · completed {session.completedCount} · removed {session.removedCount}</p><p className="text-xs text-muted">Active runtime {formatRuntime(session.estimatedActiveRuntimeSeconds)} · completed runtime {formatRuntime(session.completedRuntimeSeconds)}</p></div><div className="flex flex-wrap gap-2"><a href={`/admin/show-management/session/${encodeURIComponent(session.sessionId)}`} className="border border-accent/60 px-3 py-1.5 text-xs text-accent">View Finished Session</a><a href={`/admin/queue?sessionId=${encodeURIComponent(session.sessionId)}`} className="border border-border px-3 py-1.5 text-xs text-muted">Review Queue</a><a href={exportHref(session.sessionId)} className="border border-border px-3 py-1.5 text-xs text-muted">Download CSV</a></div></div></article>)}</div></section>;
}
