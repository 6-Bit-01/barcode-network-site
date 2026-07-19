/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Config = {
  journalAutoPublishEnabled: boolean;
  journalDailyEnabled: boolean;
  journalWeeklyEnabled: boolean;
};
type RunRequest = {
  requestId: string;
  cadence: "daily" | "weekly";
  status: "queued" | "running";
  requestedAt: string;
  claimedAt?: string;
};
type RunRecord = {
  runId: string;
  cadence: "daily" | "weekly";
  state: string;
  occurredAt: string;
  entryId?: string;
  sourceCount?: number;
  detail?: string;
};
type Telemetry = {
  observedAt: string;
  automationStatus: "online" | "paused" | "degraded";
  nextDailyAt?: string;
  nextWeeklyAt?: string;
  detail?: string;
  lastRun?: RunRecord;
};
type EntryControl = {
  entryId: string;
  publicVisible: boolean;
  memoryEligible: boolean;
  updatedAt: string;
  updatedBy: "website-admin";
};
type JournalEntry = {
  entryId: string;
  revision: number;
  entryKind?: "daily" | "weekly";
  title: string;
  excerpt: string;
  sections: { heading: string; body: string }[];
  publishedAt: string;
  control: EntryControl;
};
type EntryControlAudit = EntryControl & {
  changeId: string;
  previousPublicVisible: boolean;
  previousMemoryEligible: boolean;
};
type State = {
  config: Config;
  entryControls: EntryControl[];
  entries: JournalEntry[];
  entryControlAudit: EntryControlAudit[];
  runRequests: RunRequest[];
  telemetry: Telemetry | null;
  recentRuns: RunRecord[];
  persisted: true;
};

const DEFAULT_CONFIG: Config = {
  journalAutoPublishEnabled: true,
  journalDailyEnabled: true,
  journalWeeklyEnabled: true,
};

function localTime(value?: string) {
  if (!value) return "not reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "not reported"
    : parsed.toLocaleString();
}

function StatusPill({ value }: { value: string }) {
  const active = ["online", "published", "complete", "running"].includes(
    value,
  );
  return (
    <span
      className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
        active
          ? "border-accent/50 text-accent"
          : "border-border text-foreground/60"
      }`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

export default function AdminJournalPage() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [entryFilter, setEntryFilter] = useState<"all" | "daily" | "weekly">(
    "all",
  );

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading("load");
    try {
      const response = await fetch("/api/admin/journal", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : `Request failed (${response.status})`,
        );
      setState(payload as State);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Journal controls failed to load.");
    } finally {
      if (!quiet) setLoading(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function updateConfig(next: Config) {
    if (loading || !state) return;
    const previous = state.config;
    setState({ ...state, config: next });
    setLoading("config");
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/admin/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateConfig", config: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true)
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : `Request failed (${response.status})`,
        );
      setNote("Automation controls saved to Redis.");
      await load(true);
    } catch (caught) {
      setState((current) =>
        current ? { ...current, config: previous } : current,
      );
      setError(caught instanceof Error ? caught.message : "Control update failed.");
    } finally {
      setLoading(null);
    }
  }

  async function requestRun(cadence: "daily" | "weekly") {
    if (loading) return;
    setLoading(cadence);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/admin/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "requestRun", cadence }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true)
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : `Request failed (${response.status})`,
        );
      setNote(
        payload.idempotent
          ? `A ${cadence} run is already queued or running.`
          : `${cadence[0].toUpperCase()}${cadence.slice(1)} run queued for BNL.`,
      );
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Run request failed.");
    } finally {
      setLoading(null);
    }
  }

  async function updateEntryControl(
    entry: JournalEntry,
    publicVisible: boolean,
    memoryEligible: boolean,
  ) {
    if (loading || !state) return;
    const previous = state;
    const optimisticControl = {
      ...entry.control,
      publicVisible,
      memoryEligible,
      updatedAt: new Date().toISOString(),
    };
    setState({
      ...state,
      entries: state.entries.map((candidate) =>
        candidate.entryId === entry.entryId
          ? { ...candidate, control: optimisticControl }
          : candidate,
      ),
    });
    setLoading(`entry:${entry.entryId}`);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/admin/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateEntryControl",
          entryId: entry.entryId,
          publicVisible,
          memoryEligible,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true)
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : `Request failed (${response.status})`,
        );
      setNote(
        !publicVisible
          ? "Entry hidden. BNL memory access is off unless you deliberately re-enable it."
          : "Entry controls saved.",
      );
      await load(true);
    } catch (caught) {
      setState(previous);
      setError(
        caught instanceof Error
          ? caught.message
          : "Entry control update failed.",
      );
    } finally {
      setLoading(null);
    }
  }

  const config = state?.config ?? DEFAULT_CONFIG;
  const filteredEntries = (state?.entries ?? []).filter(
    (entry) => entryFilter === "all" || entry.entryKind === entryFilter,
  );
  return (
    <main className="min-h-screen pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-xs uppercase tracking-[0.45em] text-accent">
            {"// BNL OBSERVATION CENTER"}
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black text-foreground sm:text-5xl">
                Journal automation
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                Control BNL&apos;s daily observations and weekly continuity reports,
                queue a run, and inspect what the automation last reported.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/admin"
                className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted"
              >
                Admin
              </Link>
              <Link
                href="/journal"
                className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent"
              >
                Public Journal
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {error && (
          <p className="border border-danger/50 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {note && (
          <p className="border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
            {note}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4 border border-border bg-surface p-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-muted">
                Automation controls
              </p>
              <p className="mt-2 text-sm text-foreground/70">
                Changes are persistent. Turning off the master switch pauses both
                cadences without deleting entries, observations, or run history.
              </p>
            </div>
            {[
              [
                "journalAutoPublishEnabled",
                "Automatic publishing",
                "Master switch for scheduled Journal publishing.",
              ],
              [
                "journalDailyEnabled",
                "Daily observations",
                "One complete previous-day observation window.",
              ],
              [
                "journalWeeklyEnabled",
                "Weekly continuity",
                "One synthesis built from durable daily observations.",
              ],
            ].map(([key, label, description]) => {
              const configKey = key as keyof Config;
              return (
                <label
                  key={key}
                  className="flex items-center justify-between gap-4 border border-border p-4"
                >
                  <span>
                    <strong className="block text-sm text-foreground">{label}</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      {description}
                    </span>
                  </span>
                  <input
                    aria-label={label}
                    type="checkbox"
                    disabled={!state || Boolean(loading)}
                    checked={config[configKey]}
                    onChange={(event) =>
                      void updateConfig({
                        ...config,
                        [configKey]: event.target.checked,
                      })
                    }
                  />
                </label>
              );
            })}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                disabled={!state || Boolean(loading)}
                onClick={() => void requestRun("daily")}
                className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent disabled:opacity-50"
              >
                {loading === "daily" ? "Queuing…" : "Run Daily Now"}
              </button>
              <button
                disabled={!state || Boolean(loading)}
                onClick={() => void requestRun("weekly")}
                className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent disabled:opacity-50"
              >
                {loading === "weekly" ? "Queuing…" : "Run Weekly Now"}
              </button>
              <button
                disabled={Boolean(loading)}
                onClick={() => void load()}
                className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </section>

          <aside className="space-y-4 border border-border bg-surface p-5">
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-muted">
              Bot telemetry
            </p>
            {state?.telemetry ? (
              <div className="space-y-3 text-sm">
                <StatusPill value={state.telemetry.automationStatus} />
                <p className="text-muted">
                  Last contact: {localTime(state.telemetry.observedAt)}
                </p>
                <p className="text-muted">
                  Next daily: {localTime(state.telemetry.nextDailyAt)}
                </p>
                <p className="text-muted">
                  Next weekly: {localTime(state.telemetry.nextWeeklyAt)}
                </p>
                {state.telemetry.detail && (
                  <p className="break-words text-foreground/70">
                    {state.telemetry.detail}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted">
                No bot telemetry has arrived yet. Controls can be saved now; this
                panel will populate after BNL polls the control endpoint.
              </p>
            )}
          </aside>
        </div>

        <section className="border border-border bg-surface p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-muted">
                Published entry controls
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/70">
                Hiding an entry removes it from the public archive immediately and
                turns off future Journal-memory use by default. The two controls
                remain separate so a hidden entry can be deliberately retained as
                private continuity.
              </p>
            </div>
            <div className="flex gap-2" aria-label="Filter Journal entries">
              {(["all", "daily", "weekly"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setEntryFilter(filter)}
                  className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-widest ${
                    entryFilter === filter
                      ? "border-accent text-accent"
                      : "border-border text-muted"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {filteredEntries.length ? (
              filteredEntries.map((entry) => {
                const busy = loading === `entry:${entry.entryId}`;
                return (
                  <article key={entry.entryId} className="border border-border p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill value={entry.entryKind ?? "manual"} />
                          <StatusPill
                            value={entry.control.publicVisible ? "public" : "hidden"}
                          />
                          <StatusPill
                            value={
                              entry.control.memoryEligible
                                ? "memory eligible"
                                : "memory excluded"
                            }
                          />
                        </div>
                        <h2 className="mt-3 text-lg font-bold text-foreground">
                          {entry.title}
                        </h2>
                        <p className="mt-1 font-mono text-[10px] text-muted">
                          {entry.entryId} · revision {entry.revision} · {localTime(entry.publishedAt)}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-foreground/70">
                          {entry.excerpt}
                        </p>
                      </div>
                      <div className="w-full space-y-3 lg:w-72">
                        <label className="flex items-center justify-between gap-4 border border-border px-3 py-2 text-sm">
                          <span>Visible to public</span>
                          <input
                            aria-label={`Visible to public: ${entry.title}`}
                            type="checkbox"
                            disabled={Boolean(loading)}
                            checked={entry.control.publicVisible}
                            onChange={(event) =>
                              void updateEntryControl(
                                entry,
                                event.target.checked,
                                event.target.checked
                                  ? entry.control.memoryEligible
                                  : false,
                              )
                            }
                          />
                        </label>
                        <label className="flex items-center justify-between gap-4 border border-border px-3 py-2 text-sm">
                          <span>Available to BNL memory</span>
                          <input
                            aria-label={`Available to BNL memory: ${entry.title}`}
                            type="checkbox"
                            disabled={Boolean(loading)}
                            checked={entry.control.memoryEligible}
                            onChange={(event) =>
                              void updateEntryControl(
                                entry,
                                entry.control.publicVisible,
                                event.target.checked,
                              )
                            }
                          />
                        </label>
                        {entry.control.publicVisible && (
                          <Link
                            href={`/journal/${encodeURIComponent(entry.entryId)}`}
                            className="inline-block text-xs uppercase tracking-widest text-accent"
                          >
                            Open public entry →
                          </Link>
                        )}
                        {busy && <p className="text-xs text-muted">Saving…</p>}
                      </div>
                    </div>
                    <details className="mt-4 border-t border-border pt-4">
                      <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-accent">
                        Preview full entry
                      </summary>
                      <div className="mt-4 space-y-5">
                        {entry.sections.map((section, index) => (
                          <section key={`${entry.entryId}-${index}`}>
                            <h3 className="font-bold text-foreground">
                              {section.heading}
                            </h3>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground/75">
                              {section.body}
                            </p>
                          </section>
                        ))}
                      </div>
                    </details>
                  </article>
                );
              })
            ) : (
              <p className="text-sm text-muted">
                No published Journal entries match this filter.
              </p>
            )}
          </div>

          {state?.entryControlAudit.length ? (
            <details className="mt-6 border-t border-border pt-4">
              <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-muted">
                Recent entry-control audit
              </summary>
              <div className="mt-3 space-y-2">
                {state.entryControlAudit.slice(0, 10).map((record) => (
                  <p key={record.changeId} className="text-xs leading-5 text-muted">
                    {localTime(record.updatedAt)} · {record.entryId} · public {String(record.previousPublicVisible)} → {String(record.publicVisible)} · memory {String(record.previousMemoryEligible)} → {String(record.memoryEligible)}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section className="border border-border bg-surface p-5">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-muted">
            Queued requests
          </p>
          <div className="mt-4 space-y-3">
            {state?.runRequests.length ? (
              state.runRequests.map((request) => (
                <div
                  key={request.requestId}
                  className="flex flex-col gap-2 border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-mono text-xs text-foreground">
                      {request.requestId}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {request.cadence} · requested {localTime(request.requestedAt)}
                    </p>
                  </div>
                  <StatusPill value={request.status} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No queued manual runs.</p>
            )}
          </div>
        </section>

        <section className="border border-border bg-surface p-5">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-muted">
            Recent automation runs
          </p>
          <div className="mt-4 space-y-3">
            {state?.recentRuns.length ? (
              state.recentRuns.map((run) => (
                <div key={run.runId} className="border border-border p-3 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-xs text-foreground">{run.runId}</p>
                      <p className="mt-1 text-xs text-muted">
                        {run.cadence} · {localTime(run.occurredAt)}
                        {run.sourceCount !== undefined
                          ? ` · ${run.sourceCount} sources`
                          : ""}
                      </p>
                    </div>
                    <StatusPill value={run.state} />
                  </div>
                  {run.entryId && (
                    <Link
                      className="mt-2 inline-block text-xs text-accent"
                      href={`/journal/${encodeURIComponent(run.entryId)}`}
                    >
                      Open published entry →
                    </Link>
                  )}
                  {run.detail && (
                    <p className="mt-2 break-words text-xs leading-5 text-muted">
                      {run.detail}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No automation runs reported yet.</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
