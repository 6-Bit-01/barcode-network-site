/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueueSessionSummary, QueueState } from "@/lib/queue-types";

const SESSION_DESCRIPTION_OPTIONS = [
  "Three transmissions per artist. At 10k taps, the skip game opens a fracture in the line. Priority access remains reserved for urgent signals unwilling to wait.",
  "Limit three tracks per signal source. The 10k tap event may pull a winner through the queue. Standard transmissions continue in order unless priority access intervenes.",
  "Each artist may load three tracks into the system. At 10k taps, the wheel selects a breach point. The Priority Lane remains separate from the standard crawl.",
  "Three tracks per artist maximum. When taps reach 10k, the skip game can reroute one signal. Priority access is reserved for future urgent transmissions.",
  "Queue discipline: three tracks per artist, regular crawl by order received, 10k taps triggers the skip game, and Priority Lane access stays separate.",
  "Every artist gets three standard transmissions. At 10k taps, the wheel may fracture the order. Priority access is the future route for signals that cannot wait.",
  "Load up to three tracks per artist. The queue crawls in order until the 10k tap event opens the wheel. Priority access remains a separate lane.",
  "Three submissions per artist source. 10k taps unlock the skip game. Standard tracks hold formation unless future priority access cuts through.",
  "The system accepts three tracks per artist. At 10k taps, the wheel chooses a breach point. Priority Lane remains reserved outside the regular line.",
  "Artist cap: three tracks. Queue movement stays standard until the 10k tap event. Future priority access exists for signals unwilling to wait for turn or wheel.",
];

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDescription(date: string): string {
  const index = [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % SESSION_DESCRIPTION_OPTIONS.length;
  return SESSION_DESCRIPTION_OPTIONS[index];
}

export function AdminShowManagement() {
  const [state, setState] = useState<QueueState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDate, setShowDate] = useState(todayDate());
  const [title, setTitle] = useState(`BARCODE Radio — ${todayDate()}`);
  const [description, setDescription] = useState(defaultDescription(todayDate()));
  const [trackLimitPerArtist, setTrackLimitPerArtist] = useState(3);
  const [skipGameTapTarget, setSkipGameTapTarget] = useState(10000);

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
    await post({ action: "startSession", title, showDate, description, trackLimitPerArtist, skipGameTapTarget });
  }

  function updateShowDate(next: string) {
    setShowDate(next);
    setTitle(`BARCODE Radio — ${next}`);
    setDescription(defaultDescription(next));
  }

  useEffect(() => { load(); }, []);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;

  const session = state?.session;
  const hasCurrent = Boolean(session && session.status !== "archived" && !state?.readOnly);
  const pastSessions = (state?.sessions ?? []).filter((item) => item.sessionId !== session?.sessionId);

  return (
    <div className="space-y-6">
      <section className="border border-accent/40 bg-surface p-6 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-accent">Start New BARCODE Radio Session</p>
          <p className="text-sm text-muted mt-2">Create a clean, isolated show queue. Submissions start closed until the operator opens the gate.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Session title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label>
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Show date</span><input type="date" value={showDate} onChange={(event) => updateShowDate(event.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label>
          <label className="space-y-2 lg:col-span-2"><span className="text-xs uppercase tracking-widest text-muted">Session description / rule blurb</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label>
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Track limit per artist</span><input type="number" min={1} value={trackLimitPerArtist} onChange={(event) => setTrackLimitPerArtist(Number(event.target.value))} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label>
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Skip game tap target</span><input type="number" min={1} value={skipGameTapTarget} onChange={(event) => setSkipGameTapTarget(Number(event.target.value))} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="border border-border bg-background/40 p-3"><p className="text-xs text-muted uppercase tracking-widest">Submissions start closed</p><p className="text-accent mt-1">True — operator must click Open Submissions.</p></div>
          <div className="border border-border bg-background/40 p-3"><p className="text-xs text-muted uppercase tracking-widest">Priority Lane</p><p className="text-muted mt-1">Placeholder ready. Stripe/payment is not active in this pass.</p></div>
        </div>
        {/* TODO: Later map this session lifecycle to website show state: prepared, submissionsOpen, live, submissionsClosed, archived. */}
        <button onClick={startSession} className="border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Start New Session</button>
      </section>

      <CurrentSession session={hasCurrent ? session : null} onPost={post} />
      <ArchivedShows sessions={pastSessions} currentSessionId={session?.sessionId} onView={(id) => load(id)} onReactivate={(id) => post({ action: "activateSession", sessionId: id })} />
    </div>
  );
}

function CurrentSession({ session, onPost }: { session: QueueSessionSummary | null | undefined; onPost: (body: Record<string, unknown>) => void }) {
  if (!session) {
    return <section className="border border-border bg-surface p-6"><h2 className="text-2xl font-bold text-foreground">No active broadcast session prepared.</h2><p className="text-sm text-muted mt-2">Use the Start New BARCODE Radio Session panel above to create a clean session.</p></section>;
  }

  return <section className="border border-border bg-surface p-6 space-y-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Current Session</p><h2 className="text-2xl font-bold text-foreground mt-2">{session.title}</h2><p className="text-sm text-muted mt-1">{session.showDate} · {session.status}</p><p className="text-sm text-muted mt-3 max-w-3xl">{session.description}</p></div><a href="/admin/queue" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Queue Control</a></div><div className="grid gap-3 sm:grid-cols-4 text-sm"><div className="border border-border p-3"><p className="text-xs text-muted">Active</p><p>{session.activeCount}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed</p><p>{session.completedCount}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Removed</p><p>{session.removedCount}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Spotlight</p><p>{session.spotlightCount}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Active runtime</p><p>{formatRuntime(session.estimatedActiveRuntimeSeconds)}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{formatRuntime(session.completedRuntimeSeconds)}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Track limit</p><p>{session.trackLimitPerArtist}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Skip taps</p><p>{session.skipGameTapTarget}</p></div></div><div className="flex flex-wrap gap-3"><button onClick={() => onPost({ action: "setOpen", isOpen: true })} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Submissions</button><button onClick={() => onPost({ action: "setOpen", isOpen: false })} className="border border-danger/50 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Close Submissions</button><button onClick={() => onPost({ action: "archiveSession" })} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-danger hover:text-danger">Archive Session</button></div></section>;
}

function ArchivedShows({ sessions, currentSessionId, onView, onReactivate }: { sessions: QueueSessionSummary[]; currentSessionId?: string; onView: (id: string) => void; onReactivate: (id: string) => void }) {
  return <section className="border border-border bg-surface p-5 space-y-4"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Archived Shows</p><p className="text-sm text-muted mt-2">Past sessions stay saved for review and future curation.</p></div><div className="grid gap-3">{sessions.length === 0 ? <p className="border border-border/60 p-4 text-sm text-muted">No archived or past shows saved yet.</p> : sessions.map((session) => <article key={session.sessionId} className="border border-border bg-background/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-foreground">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status} · active {session.activeCount} · completed {session.completedCount} · removed {session.removedCount} · spotlight {session.spotlightCount}</p><p className="text-xs text-muted">Active runtime {formatRuntime(session.estimatedActiveRuntimeSeconds)} · completed runtime {formatRuntime(session.completedRuntimeSeconds)}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => onView(session.sessionId)} className="border border-accent/60 px-3 py-1.5 text-xs text-accent">View Session</button><a href="/admin/queue" className="border border-border px-3 py-1.5 text-xs text-muted">Review Archive</a>{session.sessionId !== currentSessionId && <button onClick={() => onReactivate(session.sessionId)} className="border border-border px-3 py-1.5 text-xs text-muted">Reactivate Prepared</button>}</div></div></article>)}</div></section>;
}
