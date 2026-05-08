/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const router = useRouter();

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

  async function post(body: Record<string, unknown>): Promise<QueueState | null> {
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const next = await res.json();
    setState(next);
    return next;
  }

  async function startSession() {
    if (queueIsOpen) return;
    const next = await post({ action: "startSession", title, showDate, description, trackLimitPerArtist, queueCapacity });
    if (next?.session?.sessionId) router.push(`/admin/queue?sessionId=${encodeURIComponent(next.session.sessionId)}`);
  }

  async function endSession() {
    setEndingSession(true);
    await post({ action: "archiveSession" });
    setEndConfirmOpen(false);
    setEndingSession(false);
    await load();
  }

  useEffect(() => { load(); }, []);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;

  const session = state?.session;
  const readOnly = Boolean(state?.readOnly || session?.status === "archived");
  const currentSession = session && state?.isCurrentSession && !readOnly ? session : null;
  const pastSessions = (state?.sessions ?? []).filter((item) => item.sessionId !== currentSession?.sessionId);
  const queueIsOpen = Boolean(currentSession?.queueOpen);

  return (
    <div className="space-y-6">
      <StartNewSession queueIsOpen={queueIsOpen} onCloseSubmissions={() => post({ action: "setOpen", isOpen: false })} title={title} description={description} trackLimitPerArtist={trackLimitPerArtist} queueCapacity={queueCapacity} onTitle={setTitle} onDescription={setDescription} onTrackLimit={setTrackLimitPerArtist} onCapacity={setQueueCapacity} onStart={startSession} sessionId={currentSession?.sessionId} />
      <CurrentSession session={currentSession} onPost={post} onEnd={() => setEndConfirmOpen(true)} />
      <SessionData session={currentSession} />
      {endConfirmOpen && <EndSessionConfirm ending={endingSession} onCancel={() => setEndConfirmOpen(false)} onConfirm={endSession} />}
      <ArchivedShows sessions={pastSessions} />
    </div>
  );
}

function StartNewSession({ queueIsOpen, onCloseSubmissions, title, description, trackLimitPerArtist, queueCapacity, onTitle, onDescription, onTrackLimit, onCapacity, onStart, sessionId }: { queueIsOpen: boolean; onCloseSubmissions: () => void; title: string; description: string; trackLimitPerArtist: number; queueCapacity: number; onTitle: (value: string) => void; onDescription: (value: string) => void; onTrackLimit: (value: number) => void; onCapacity: (value: number) => void; onStart: () => void; sessionId?: string }) {
  return <section className={`space-y-5 border p-6 ${queueIsOpen ? "border-danger/60 bg-danger/10" : "border-accent/40 bg-surface"}`}><div><p className="text-xs uppercase tracking-[0.4em] text-accent">Start New Session</p><p className="text-sm text-muted mt-2">Create a clean BARCODE Radio session. Submissions start closed; open them from Current Session when ready.</p></div>{queueIsOpen && <div className="border border-danger/50 bg-danger/10 p-4"><p className="text-sm font-bold uppercase tracking-[0.25em] text-danger">QUEUE OPEN</p><p className="mt-2 text-sm text-muted">Start New Session is locked while submissions are open for the current broadcast.</p><div className="mt-3 flex flex-wrap gap-2"><a href="/admin/queue" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent">Open Queue Control</a><button type="button" onClick={onCloseSubmissions} className="border border-danger/60 px-3 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Close Submissions</button>{sessionId && <a href={`/queue/${sessionId}`} className="border border-danger/50 px-3 py-2 text-xs uppercase tracking-widest text-danger">View Public Session</a>}</div></div>}<div className="grid gap-4 lg:grid-cols-2"><label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Session title</span><input disabled={queueIsOpen} value={title} onChange={(event) => onTitle(event.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label><label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Track limit</span><input disabled={queueIsOpen} type="number" min={1} value={trackLimitPerArtist} onChange={(event) => onTrackLimit(Number(event.target.value))} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label><label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Queue capacity</span><input disabled={queueIsOpen} type="number" min={1} value={queueCapacity} onChange={(event) => onCapacity(Number(event.target.value))} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label><label className="space-y-2 lg:col-span-2"><span className="text-xs uppercase tracking-widest text-muted">Description / rule blurb</span><textarea disabled={queueIsOpen} value={description} onChange={(event) => onDescription(event.target.value)} rows={4} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label></div><button onClick={onStart} disabled={queueIsOpen} className="border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:opacity-40">Start New Session</button></section>;
}

function CurrentSession({ session, onPost, onEnd }: { session: QueueSessionSummary | null | undefined; onPost: (body: Record<string, unknown>) => void; onEnd: () => void }) {
  if (!session) {
    return (
      <section className="border border-border bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Current Session</p>
        <h2 className="mt-2 text-xl font-bold text-foreground">No session in progress.</h2>
        <p className="mt-1 text-sm text-muted">Start a new session or select an archived session below.</p>
        <a href="#archived-shows" className="mt-4 inline-flex border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Archived Shows</a>
      </section>
    );
  }
  return (
    <section className="border border-border bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted">// Current Session</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">{session.title}</h2>
          <p className="mt-1 text-sm text-muted">{session.showDate} · {session.status}</p>
          <p className="mt-2 max-w-3xl text-sm text-muted">{session.description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
          <a href={`/admin/queue?sessionId=${encodeURIComponent(session.sessionId)}`} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Queue Control</a>
          <button onClick={() => onPost({ action: "setOpen", isOpen: !session.queueOpen })} className={`${session.queueOpen ? "border-danger text-danger hover:bg-danger" : "border-accent text-accent hover:bg-accent"} border px-4 py-2 text-xs uppercase tracking-widest hover:text-background`}>{session.queueOpen ? "Close Submissions" : "Open Submissions"}</button>
          <button onClick={onEnd} className="border border-danger/60 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">End Session</button>
        </div>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="border border-border p-3"><p className="text-xs text-muted">Submissions</p><p className={session.queueOpen ? "text-accent" : "text-danger"}>{session.queueOpen ? "Open" : "Closed"}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Active / Capacity</p><p>{session.activeCount}/{session.queueCapacity}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Completed</p><p>{session.completedCount}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Removed</p><p>{session.removedCount}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Spotlight</p><p>{session.spotlightCount}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Track limit</p><p>{session.trackLimitPerArtist}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Active runtime</p><p>{formatRuntime(session.estimatedActiveRuntimeSeconds)}</p></div>
        <div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{formatRuntime(session.completedRuntimeSeconds)}</p></div>
      </div>
    </section>
  );
}

function EndSessionConfirm({ ending, onCancel, onConfirm }: { ending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md border border-danger/50 bg-background p-5 shadow-[0_0_70px_rgba(255,0,0,0.24)]"><p className="text-xs uppercase tracking-[0.35em] text-danger">End Session</p><h2 className="mt-3 text-2xl font-bold text-foreground">End this session?</h2><p className="mt-2 text-sm text-muted">This will close submissions, finish the broadcast session, and move it to the archive.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} disabled={ending} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">No, Cancel</button><button type="button" onClick={onConfirm} disabled={ending} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background disabled:opacity-50">{ending ? "Ending…" : "Yes, End Session"}</button></div></div></div>;
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
  return <section id="archived-shows" className="border border-border bg-surface p-5 space-y-4"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Archived Shows</p><p className="text-sm text-muted mt-2">Past sessions stay closed. Review finished-session reports and export session-scoped data here.</p></div><div className="grid gap-3">{sessions.length === 0 ? <p className="border border-border/60 p-4 text-sm text-muted">No archived or past shows saved yet.</p> : sessions.map((session) => <article key={session.sessionId} className="border border-border bg-background/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-foreground">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status} · active {session.activeCount}/{session.queueCapacity} · completed {session.completedCount} · removed {session.removedCount}</p><p className="text-xs text-muted">Active runtime {formatRuntime(session.estimatedActiveRuntimeSeconds)} · completed runtime {formatRuntime(session.completedRuntimeSeconds)}</p></div><div className="flex flex-wrap gap-2"><a href={`/admin/show-management/session/${encodeURIComponent(session.sessionId)}`} className="border border-accent/60 px-3 py-1.5 text-xs text-accent">View Finished Session</a><a href={`/admin/queue?sessionId=${encodeURIComponent(session.sessionId)}`} className="border border-border px-3 py-1.5 text-xs text-muted">Review Queue</a><a href={exportHref(session.sessionId)} className="border border-border px-3 py-1.5 text-xs text-muted">Download CSV</a></div></div></article>)}</div></section>;
}
