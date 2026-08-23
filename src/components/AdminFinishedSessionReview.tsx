"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminQueueSessionProvenance } from "@/components/AdminQueueSessionProvenance";
import type { QueueShowReport } from "@/lib/queue-show-report";
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

type ShowLogPayload = { report?: QueueShowReport };

function exportHref(sessionId: string): string { return `/api/admin/queue/export?sessionId=${encodeURIComponent(sessionId)}`; }
function showLogHref(sessionId: string, format: "csv" | "json"): string { return `/api/admin/queue/show-log?format=${format}&sessionId=${encodeURIComponent(sessionId)}`; }
function duration(value: number | null | undefined): string { return typeof value === "number" ? formatRuntime(value) : "—"; }
function timestamp(value: string | null | undefined): string { return value ? new Date(value).toLocaleString() : "—"; }

function Metric({ label, value, note, accent = false }: { label: string; value: string | number; note?: string; accent?: boolean }) {
  return <div className={`border p-3 ${accent ? "border-accent/60 bg-accent/5" : "border-border"}`}><p className="text-xs text-muted">{label}</p><p className={accent ? "mt-1 text-lg font-bold text-accent" : "mt-1 text-lg font-bold text-foreground"}>{value}</p>{note && <p className="mt-1 text-[11px] text-muted">{note}</p>}</div>;
}

export function AdminFinishedSessionReview({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<QueueState | null>(null);
  const [rows, setRows] = useState<SubmitterRow[]>([]);
  const [report, setReport] = useState<QueueShowReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [queueRes, exportRes, showLogRes] = await Promise.all([
        fetch(`/api/admin/queue?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" }),
        fetch(`/api/admin/queue/export?sessionId=${encodeURIComponent(sessionId)}&format=json`, { cache: "no-store" }),
        fetch(showLogHref(sessionId, "json"), { cache: "no-store" }),
      ]);
      if (!queueRes.ok || !exportRes.ok || !showLogRes.ok) {
        setError(queueRes.status === 401 || exportRes.status === 401 || showLogRes.status === 401 ? "Admin authentication required." : "Finished session report unavailable.");
        return;
      }
      setState(await queueRes.json());
      const payload = await exportRes.json();
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      const showLog = await showLogRes.json() as ShowLogPayload;
      setReport(showLog.report ?? null);
    }
    load();
  }, [sessionId]);

  async function post(body: Record<string, unknown>): Promise<QueueState | null> {
    const response = await fetch("/api/admin/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const next = await response.json();
    setState(next);
    return next;
  }

  const fallbackSummary = useMemo(() => ({
    spotlightCount: rows.filter((row) => row.spotlight).length,
    total: rows.length,
  }), [rows]);

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;
  if (!state?.session || !report) return <div className="border border-border bg-surface p-6 text-muted">Loading finished session report…</div>;
  const session = state.session;
  const sourceMix = Object.entries(report.mix.sources).filter(([, count]) => count > 0);
  const calibrationReady = report.calibration.status === "eligible";

  return (
    <div className="space-y-6">
      <section className="border border-accent/40 bg-surface p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-accent">Finished Session Report</p>
            <h2 className="mt-2 text-3xl font-bold text-foreground">{session.title}</h2>
            <p className="mt-1 text-sm text-muted">{session.showDate} · {session.status === "archived" ? "finished / archived" : session.status} · automatic show telemetry</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/admin/queue" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Return to Queue Dashboard</a>
            <a href={showLogHref(session.sessionId, "json")} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Report + Log JSON</a>
            <a href={showLogHref(session.sessionId, "csv")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Event Log CSV</a>
            <a href={exportHref(session.sessionId)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Submitter CSV</a>
          </div>
        </div>
        <AdminQueueSessionProvenance session={session} onSave={post} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Broadcast duration" value={duration(report.timeline.broadcastDurationSeconds)} accent />
          <Metric label="Played tracks" value={report.outcomes.played} note={`${report.outcomes.finished} finished · ${report.outcomes.skipped} skipped`} />
          <Metric label="Unplayed at close" value={report.outcomes.unplayed} />
          <Metric label="Late additions" value={report.outcomes.lateSubmissions} note="Submitted after broadcast start" />
          <Metric label="Music airtime" value={duration(report.pacing.modeledMusicAirtimeSeconds)} note="Observed where available; duration fallback otherwise" />
          <Metric label="Host / transitions / operations" value={duration(report.pacing.unattributedBroadcastSeconds)} note="Broadcast minus music, sponsor, and captured Wheel time" />
          <Metric label="Direct playback coverage" value={`${report.pacing.observedTrackCoveragePercent}%`} note={`${report.pacing.directlyObservedTrackCount} observed · ${report.pacing.fallbackTrackCount} fallback`} />
          <Metric label="Tracks per broadcast hour" value={report.pacing.tracksPerBroadcastHour ?? "—"} />
        </div>
      </section>

      <section className={`border p-5 space-y-4 ${calibrationReady ? "border-[#3ddc97]/50 bg-[#3ddc97]/5" : "border-[#ffaa00]/50 bg-[#ffaa00]/5"}`}>
        <div>
          <p className={`text-xs uppercase tracking-[0.35em] ${calibrationReady ? "text-[#3ddc97]" : "text-[#ffaa00]"}`}>Timing calibration data</p>
          <h3 className="mt-2 text-xl font-bold text-foreground">{calibrationReady ? "Ready for timing review" : "Review data quality first"}</h3>
          <p className="mt-1 text-sm text-muted">This report records what happened. It does not automatically change the live timing formula.</p>
        </div>
        {report.calibration.reasons.length > 0 && <ul className="space-y-1 text-sm text-[#ffaa00]">{report.calibration.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Average track slot" value={duration(report.pacing.averageTrackSlotSeconds)} />
          <Metric label="Median track slot" value={duration(report.pacing.medianTrackSlotSeconds)} />
          <Metric label="Average ordinary transition" value={duration(report.pacing.averageTransitionSeconds)} />
          <Metric label="Median ordinary transition" value={duration(report.pacing.medianTransitionSeconds)} />
          <Metric label="90th percentile transition" value={duration(report.pacing.p90TransitionSeconds)} />
          <Metric label="Unattributed time per track" value={duration(report.pacing.averageUnattributedSecondsPerPlayedTrack)} />
        </div>
        {report.pacing.thirds.length > 0 && <div className="grid gap-3 sm:grid-cols-3">{report.pacing.thirds.map((phase) => <Metric key={phase.phase} label={`${phase.phase} pace`} value={`${duration(phase.averageSecondsPerTrack)} / track`} note={`${phase.trackCount} tracks · ${duration(phase.elapsedSeconds)}`} />)}</div>}
      </section>

      <section className="border border-border bg-surface p-5 space-y-4">
        <div><p className="text-xs uppercase tracking-[0.35em] text-muted">Show happenings</p><p className="mt-2 text-sm text-muted">Automatic operational totals from queue, playback, sponsor, and Wheel events.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Total submitted" value={report.outcomes.totalSubmitted || fallbackSummary.total} />
          <Metric label="Removed" value={report.outcomes.removed} />
          <Metric label="Returned / restored" value={`${report.outcomes.returnedToQueue} / ${report.outcomes.restored}`} />
          <Metric label="Early cutoffs" value={report.operations.earlyCutoffs} />
          <Metric label="Playback issues" value={report.operations.issueTracks} />
          <Metric label="Pauses" value={report.operations.pauses} />
          <Metric label="Stalls" value={report.operations.stalls} />
          <Metric label="Resumes" value={report.operations.resumes} />
          <Metric label="Playback errors" value={report.operations.playbackErrors} />
          <Metric label="Spotlight" value={report.outcomes.spotlight || fallbackSummary.spotlightCount} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="border border-border bg-background/40 p-4 space-y-2 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Lane mix</p><p>Regular: <strong>{report.mix.lanes.regular}</strong></p><p>Priority: <strong>{report.mix.lanes.priority}</strong></p><p>Wheel chosen: <strong>{report.mix.lanes.wheel}</strong></p><p>Paid Priority: <strong>{report.mix.purchasedPriorityTracks}</strong> · manual: <strong>{report.mix.manualPriorityTracks}</strong></p></div>
          <div className="border border-border bg-background/40 p-4 space-y-2 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Source / duration quality</p><p>{sourceMix.map(([source, count]) => `${source}: ${count}`).join(" · ") || "No tracks"}</p><p>Exact durations: <strong>{report.mix.exactDurationTracks}</strong></p><p>Estimated durations: <strong>{report.mix.estimatedDurationTracks}</strong></p></div>
          <div className="border border-border bg-background/40 p-4 space-y-2 text-sm"><p className="text-xs uppercase tracking-widest text-muted">Sponsor break</p><p>Status: <strong>{report.operations.sponsor.status.replace(/_/g, " ")}</strong></p><p>Duration: <strong>{duration(report.operations.sponsor.durationSeconds)}</strong></p><p>Started: {timestamp(report.operations.sponsor.startedAt)}</p><p>Completed: {timestamp(report.operations.sponsor.completedAt)}</p></div>
          <div className="border border-border bg-background/40 p-4 space-y-2 text-sm lg:col-span-3"><p className="text-xs uppercase tracking-widest text-muted">Wheel</p><div className="flex flex-wrap gap-x-6 gap-y-2"><span>Launches: <strong>{report.operations.wheel.launches}</strong></span><span>Spins: <strong>{report.operations.wheel.spins}</strong></span><span>Re-encryptions: <strong>{report.operations.wheel.reencryptions}</strong></span><span>Rejected results: <strong>{report.operations.wheel.rejectedResults}</strong></span><span>Confirmed: <strong>{report.operations.wheel.confirmations}</strong></span><span>Cancelled: <strong>{report.operations.wheel.cancellations}</strong></span><span>Ceremony time: <strong>{duration(report.operations.wheel.ceremonySeconds)}</strong></span><span>Average ceremony: <strong>{duration(report.operations.wheel.averageCeremonySeconds)}</strong></span></div></div>
        </div>
      </section>

      <section className="border border-border bg-surface p-5 space-y-4">
        <div><p className="text-xs uppercase tracking-[0.35em] text-muted">Per-track timing</p><p className="mt-2 text-sm text-muted">Played-track outcomes used to understand playback coverage, slot length, transitions, and technical issues.</p></div>
        <div className="overflow-x-auto border border-border bg-background/40">
          <table className="min-w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="p-2">Artist / track</th><th className="p-2">Outcome</th><th className="p-2">Lane / source</th><th className="p-2">Music time</th><th className="p-2">Wall slot</th><th className="p-2">Next ordinary transition</th><th className="p-2">Issue</th></tr></thead>
            <tbody>{report.trackOutcomes.length === 0 ? <tr><td colSpan={7} className="p-3 text-muted">No played-track timing records found.</td></tr> : report.trackOutcomes.map((track) => <tr key={track.trackId} className="border-t border-border/60"><td className="p-2"><span className="font-bold text-foreground">{track.artist}</span><br /><span className="text-muted">{track.title}</span></td><td className="p-2">{track.outcome}{track.earlyCutoff ? " · early cutoff" : ""}</td><td className="p-2">{track.lane} · {track.sourceType}</td><td className="p-2">{duration(track.modeledMusicSeconds)}<br /><span className="text-muted">{track.directlyObserved ? "observed" : track.durationIsEstimate ? "estimated fallback" : "duration fallback"}</span></td><td className="p-2">{duration(track.wallClockSlotSeconds)}</td><td className="p-2">{duration(track.transitionAfterSeconds)}</td><td className="p-2">{track.playbackIssueCode?.replace(/_/g, " ") ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="border border-border bg-surface p-5 space-y-4">
        <div><p className="text-xs uppercase tracking-[0.35em] text-muted">Tracks / submitter records</p><p className="mt-2 text-sm text-muted">Admin-only contact details and source links remain separate from the timing summary.</p></div>
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
