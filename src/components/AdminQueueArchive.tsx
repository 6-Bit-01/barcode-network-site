/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatRuntime, queueSessionBnlPublicationAccess } from "@/lib/queue-types";
import type { QueueSessionSummary, QueueState } from "@/lib/queue-types";

function exportHref(sessionId?: string): string { return `/api/admin/queue/export${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`; }
function showLogHref(sessionId: string, format: "csv" | "json"): string { return `/api/admin/queue/show-log?format=${format}&sessionId=${encodeURIComponent(sessionId)}`; }
function bnlAccessLabel(session: QueueSessionSummary): string {
  const level = queueSessionBnlPublicationAccess(session).accessLevel;
  if (level === "private") return "Private BNL access";
  if (level === "public") return "Public BNL access";
  return "No BNL access";
}

export function AdminQueueArchive() {
  const [state, setState] = useState<QueueState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/queue", { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "Admin authentication required. Log in at /admin first." : "Archive unavailable.");
      return;
    }
    setError(null);
    setState(await res.json());
  }

  async function clearArchive() {
    setDeleting(true);
    setMessage(null);
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clearArchive", confirmation }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(typeof payload?.error === "string" ? payload.error : "Archive was not deleted.");
      setDeleting(false);
      return;
    }
    setState(payload);
    setConfirmOpen(false);
    setConfirmation("");
    setDeleting(false);
    setMessage("Queue archive deleted.");
  }

  useEffect(() => { load(); }, []);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;

  const archivedSessions = (state?.sessions ?? []).filter((session) => session.status === "archived");

  return <div className="space-y-6">
    <section className="border border-border bg-surface p-5 space-y-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Queue Archive</p><p className="mt-2 text-sm text-muted">Review archived sessions and export finished queue data.</p></div><a href="/admin/show-management" className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Back to Show Management</a></div>{archivedSessions.length===0 ? <p className="border border-border/60 p-4 text-sm text-muted">No archived sessions saved.</p> : <div className="grid gap-3">{archivedSessions.map((session: QueueSessionSummary) => <article key={session.sessionId} className="border border-border bg-background/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-foreground">{session.title}</p><p className="text-xs text-muted">{session.showDate} · {session.status} · {session.purpose} · {bnlAccessLabel(session)}</p><p className="text-xs text-muted">accepted {session.acceptedCount ?? session.activeCount}/{session.queueCapacity} · active {session.activeCount} · completed {session.completedCount} · removed {session.removedCount}</p><p className="text-xs text-muted">Active runtime {formatRuntime(session.estimatedActiveRuntimeSeconds)} · completed runtime {formatRuntime(session.completedRuntimeSeconds)}</p></div><div className="flex flex-wrap gap-2"><a href={`/admin/show-management/session/${encodeURIComponent(session.sessionId)}`} className="border border-accent/60 px-3 py-1.5 text-xs text-accent">View Finished Session</a><a href={`/admin/queue?sessionId=${encodeURIComponent(session.sessionId)}`} className="border border-border px-3 py-1.5 text-xs text-muted">Review Queue</a><a href={showLogHref(session.sessionId, "csv")} className="border border-accent/60 px-3 py-1.5 text-xs text-accent">Show Log CSV</a><a href={showLogHref(session.sessionId, "json")} className="border border-border px-3 py-1.5 text-xs text-muted">Show Log JSON</a><a href={exportHref(session.sessionId)} className="border border-border px-3 py-1.5 text-xs text-muted">Submitter CSV</a></div></div></article>)}</div>}</section>
    <section className="border border-danger/50 bg-danger/5 p-5 space-y-3"><h2 className="text-lg font-bold text-danger">Delete Queue Archive</h2><p className="text-sm text-muted">This permanently deletes archived sessions and their saved queue data.</p><button type="button" onClick={() => { setMessage(null); setConfirmOpen(true); }} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Delete Archive</button>{message && <p className="text-sm text-muted">{message}</p>}</section>
    {confirmOpen && createPortal(<div className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md border border-danger/50 bg-background p-5"><p className="text-xs uppercase tracking-[0.35em] text-danger">Danger Zone</p><h3 className="mt-2 text-xl font-bold text-foreground">Delete the queue archive?</h3><p className="mt-2 text-sm text-muted">This cannot be undone.</p><p className="mt-2 text-sm text-muted">Type &quot;Delete the archive&quot; to confirm.</p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-3 w-full border border-border bg-background px-3 py-2 text-sm" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setConfirmOpen(false); setConfirmation(""); }} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Cancel</button><button type="button" disabled={confirmation !== "Delete the archive" || deleting} onClick={clearArchive} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background disabled:opacity-40">{deleting ? "Deleting…" : "Delete Archive"}</button></div></div></div>, document.body)}
  </div>;
}
