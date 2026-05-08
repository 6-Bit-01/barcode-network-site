"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueueState } from "@/lib/queue-types";

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

function exportHref(sessionId: string): string { return `/api/admin/queue/export?sessionId=${encodeURIComponent(sessionId)}`; }

export function AdminFinishedSessionReview({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<QueueState | null>(null);
  const [rows, setRows] = useState<SubmitterRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [queueRes, exportRes] = await Promise.all([
        fetch(`/api/admin/queue?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" }),
        fetch(`/api/admin/queue/export?sessionId=${encodeURIComponent(sessionId)}&format=json`, { cache: "no-store" }),
      ]);
      if (!queueRes.ok || !exportRes.ok) {
        setError(queueRes.status === 401 || exportRes.status === 401 ? "Admin authentication required." : "Finished session report unavailable.");
        return;
      }
      setState(await queueRes.json());
      const payload = await exportRes.json();
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
    }
    load();
  }, [sessionId]);

  const summary = useMemo(() => {
    const priorityCount = rows.filter((row) => row.lane === "priority").length;
    const wheelCount = rows.filter((row) => row.lane === "wheel").length;
    const completedCount = rows.filter((row) => row.status === "played" || row.status === "completed").length;
    const removedCount = rows.filter((row) => row.status === "removed").length;
    const spotlightCount = rows.filter((row) => row.spotlight).length;
    return { priorityCount, wheelCount, completedCount, removedCount, spotlightCount, total: rows.length };
  }, [rows]);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;
  if (!state?.session) return <div className="border border-border bg-surface p-6 text-muted">Loading finished session report…</div>;
  const session = state.session;

  return (
    <div className="space-y-6">
      <section className="border border-accent/40 bg-surface p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-accent">Finished Session Review</p>
            <h2 className="mt-2 text-3xl font-bold text-foreground">{session.title}</h2>
            <p className="mt-1 text-sm text-muted">{session.showDate} · {session.status === "archived" ? "finished / archived" : session.status} · read-only archive record</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={exportHref(session.sessionId)} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Download CSV</a>
            <a href={`/admin/queue?sessionId=${encodeURIComponent(session.sessionId)}`} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Review Queue</a>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4 text-sm">
          <div className="border border-border p-3"><p className="text-xs text-muted">Total submitted</p><p>{summary.total}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Completed</p><p>{summary.completedCount || session.completedCount}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Removed</p><p>{summary.removedCount || session.removedCount}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Spotlight</p><p>{summary.spotlightCount || session.spotlightCount}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Priority Lane</p><p>{summary.priorityCount}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Wheel Chosen</p><p>{summary.wheelCount}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Total show/runtime</p><p>{formatRuntime(session.estimatedActiveRuntimeSeconds + session.completedRuntimeSeconds)}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{formatRuntime(session.completedRuntimeSeconds)}</p></div>
        </div>
      </section>

      <section className="border border-border bg-surface p-5 space-y-4">
        <div><p className="text-xs uppercase tracking-[0.35em] text-muted">Tracks / submitter records</p><p className="mt-2 text-sm text-muted">Admin-only report with contact details and source links for session review.</p></div>
        <div className="overflow-x-auto border border-border bg-background/40">
          <table className="min-w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="p-2">Artist</th><th className="p-2">Song</th><th className="p-2">Submitter</th><th className="p-2">TikTok</th><th className="p-2">Contact</th><th className="p-2">Source</th><th className="p-2">Status</th><th className="p-2">Lane</th></tr></thead>
            <tbody>{rows.length === 0 ? <tr><td colSpan={8} className="p-3 text-muted">No submissions found.</td></tr> : rows.map((row, index) => <tr key={`${row.sourceLink}-${index}`} className="border-t border-border/60"><td className="p-2">{row.submittedArtistName}</td><td className="p-2">{row.submittedSongTitle}</td><td className="p-2">{row.submitterArtistName}</td><td className="p-2">{row.tiktokHandle || "—"}</td><td className="p-2">{row.contactEmail || "—"}</td><td className="p-2"><a href={row.sourceLink} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">{row.sourceType}</a></td><td className="p-2">{row.status}</td><td className="p-2">{row.lane}{row.spotlight ? " · spotlight" : ""}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
