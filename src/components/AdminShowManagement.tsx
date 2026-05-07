/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueueSessionSummary, QueueState } from "@/lib/queue-types";

export function AdminShowManagement() {
  const [state, setState] = useState<QueueState | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { load(); }, []);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;

  const session = state?.session;
  const hasCurrent = Boolean(session && session.status !== "archived" && !state?.readOnly);

  return (
    <div className="space-y-6">
      <section className="border border-accent/40 bg-surface p-6 space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-accent">Show Management</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">{hasCurrent ? session?.title : "No active broadcast session prepared."}</h2>
            <p className="text-sm text-muted mt-2">{hasCurrent ? `${session?.showDate} · ${session?.status}` : "Prepare a session, then open submissions when the signal gate is ready."}</p>
            {hasCurrent && session?.description && <p className="text-sm text-muted mt-4 max-w-3xl border border-border bg-background/40 p-4">{session.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => post({ action: "startSession" })} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Prepare New Session</button>
            {hasCurrent && <a href="/admin/queue" className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Open Queue Control</a>}
          </div>
        </div>
        {hasCurrent && <div className="grid gap-3 sm:grid-cols-4 text-sm">
          <div className="border border-border p-3"><p className="text-xs text-muted">Submissions</p><p className={session?.status === "open" ? "text-accent" : "text-danger"}>{session?.status === "open" ? "Open" : "Closed"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Active</p><p>{session?.activeCount ?? 0}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Active runtime</p><p>{formatRuntime(session?.estimatedActiveRuntimeSeconds ?? 0)}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{formatRuntime(session?.completedRuntimeSeconds ?? 0)}</p></div>
        </div>}
        {hasCurrent && <div className="flex flex-wrap gap-3">
          <button onClick={() => post({ action: "setOpen", isOpen: true })} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Submissions</button>
          <button onClick={() => post({ action: "setOpen", isOpen: false })} className="border border-danger/50 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Close Submissions</button>
          <button onClick={() => post({ action: "archiveSession" })} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-danger hover:text-danger">Archive Session</button>
        </div>}
      </section>

      <SessionList sessions={state?.sessions ?? []} currentSessionId={session?.sessionId} onView={(id) => load(id)} onReactivate={(id) => post({ action: "activateSession", sessionId: id })} />
    </div>
  );
}

function SessionList({ sessions, currentSessionId, onView, onReactivate }: { sessions: QueueSessionSummary[]; currentSessionId?: string; onView: (id: string) => void; onReactivate: (id: string) => void }) {
  return <section className="border border-border bg-surface p-5 space-y-4"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Saved Sessions / Archived Sessions</p><p className="text-sm text-muted mt-2">Saved sessions remain available for later review and curation.</p></div><div className="grid gap-3">{sessions.map((session) => <article key={session.sessionId} className="border border-border bg-background/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-foreground">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status} · active {session.activeCount} · completed {session.completedCount} · removed {session.removedCount} · spotlight {session.spotlightCount}</p><p className="text-xs text-muted">Active runtime {formatRuntime(session.estimatedActiveRuntimeSeconds)} · completed runtime {formatRuntime(session.completedRuntimeSeconds)}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => onView(session.sessionId)} className="border border-accent/60 px-3 py-1.5 text-xs text-accent">Open Review</button>{session.sessionId !== currentSessionId && <button onClick={() => onReactivate(session.sessionId)} className="border border-border px-3 py-1.5 text-xs text-muted">Reactivate Prepared</button>}<a href="/admin/queue" className="border border-border px-3 py-1.5 text-xs text-muted">Open Queue Control</a></div></div></article>)}</div></section>;
}
