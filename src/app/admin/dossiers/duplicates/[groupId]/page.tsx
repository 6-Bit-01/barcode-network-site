"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DossierCandidate,
  DossierDraft,
  DossierDuplicateGroup,
} from "@/lib/dossier-workflow";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  duplicateGroups: DossierDuplicateGroup[];
  workflow: { status: string };
};

type MergeMode = "candidates_only" | "with_master_draft" | "";

function routeParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? decodeURIComponent(raw) : "";
}

function MinimalState({ title, message }: { title: string; message: string }) {
  return (
    <main className="pt-14 min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-md border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-[0.5em] text-muted mb-5">
          ADMIN ACCESS CHECK
        </p>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted mt-3">{message}</p>
        <Link
          href="/admin/dossiers"
          className="mt-6 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all"
        >
          Back to Dossier Control Center
        </Link>
      </section>
    </main>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border bg-background/40 px-2 py-1 text-[0.65rem] uppercase tracking-widest text-muted">
      {children}
    </span>
  );
}

function list(items: string[] | undefined) {
  return items?.length ? (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="text-muted">—</p>
  );
}

function isCandidateActive(candidate: DossierCandidate) {
  return candidate.status !== "denied" && candidate.status !== "merged";
}

function PhaseRail() {
  return (
    <section
      className="border border-border bg-background/30 p-3 text-xs uppercase tracking-widest text-muted"
      aria-label="Dossier phase indicator"
    >
      <div className="flex flex-wrap gap-2">
        <span className="border border-accent bg-accent/10 px-3 py-2 text-accent">
          Phase 1 — Case File / BNL Source File
        </span>
        <span className="border border-border px-3 py-2">
          Phase 2 — Proposed Dossier + BNL Edit Chat
        </span>
        <span className="border border-border px-3 py-2">
          Phase 3 — Final Admin Draft
        </span>
        <span className="border border-border px-3 py-2">
          Phase 4 — Owner Review
        </span>
        <span className="border border-border px-3 py-2 opacity-60">
          Phase 5 — Approved / Publish Later
        </span>
      </div>
    </section>
  );
}

export default function DuplicateMergeReviewPage() {
  const params = useParams();
  const groupId = routeParam(params?.groupId);
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [primaryCandidateId, setPrimaryCandidateId] = useState("");
  const [includedCandidateIds, setIncludedCandidateIds] = useState<string[]>([]);
  const [mergeNote, setMergeNote] = useState("");
  const [mergeMode, setMergeMode] = useState<MergeMode>("");
  const [mergeResult, setMergeResult] = useState<{
    candidate?: DossierCandidate;
    draft?: DossierDraft;
    mergedSourceCandidates: DossierCandidate[];
    supersededSourceDrafts: DossierDraft[];
  } | null>(null);

  const loadWorkflow = useCallback(
    async function loadWorkflow() {
      const response = await fetch("/api/admin/dossiers", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Admin authentication required"
            : `Workflow API returned ${response.status}.`,
        );
      }
      const data = (await response.json()) as WorkflowPayload;
      setPayload(data);
      const group = data.duplicateGroups.find((item) => item.id === groupId);
      if (group) {
        const activeIds = group.candidateIds.filter((id) => {
          const candidate = data.candidates.find((item) => item.id === id);
          return candidate ? isCandidateActive(candidate) : false;
        });
        setPrimaryCandidateId(
          (current) =>
            current ||
            group.suggestedMasterCandidateId ||
            activeIds[0] ||
            group.candidateIds[0] ||
            "",
        );
        setIncludedCandidateIds((current) =>
          current.length ? current : activeIds,
        );
      }
    },
    [groupId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflow()
        .catch((err) =>
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load duplicate group.",
          ),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkflow]);

  const group = useMemo(
    () => payload?.duplicateGroups.find((item) => item.id === groupId) ?? null,
    [payload?.duplicateGroups, groupId],
  );
  const groupCandidates = useMemo(
    () =>
      group
        ? group.candidateIds
            .map((id) =>
              payload?.candidates.find((candidate) => candidate.id === id),
            )
            .filter((candidate): candidate is DossierCandidate =>
              Boolean(candidate),
            )
        : [],
    [group, payload?.candidates],
  );
  const activeGroupCandidates = groupCandidates.filter(isCandidateActive);
  const groupDrafts = useMemo(
    () =>
      group
        ? group.draftIds
            .map((id) => payload?.drafts.find((draft) => draft.id === id))
            .filter((draft): draft is DossierDraft => Boolean(draft))
        : [],
    [group, payload?.drafts],
  );
  const primaryCandidate =
    groupCandidates.find((candidate) => candidate.id === primaryCandidateId) ??
    null;
  const includedCandidates = groupCandidates.filter((candidate) =>
    includedCandidateIds.includes(candidate.id),
  );
  const createMasterDraft = mergeMode === "with_master_draft";
  const resolved = activeGroupCandidates.length < 2;
  const canMerge = Boolean(
    primaryCandidate &&
      includedCandidateIds.length >= 2 &&
      includedCandidateIds.includes(primaryCandidate.id) &&
      isCandidateActive(primaryCandidate) &&
      mergeMode,
  );

  function toggleCandidate(candidateId: string) {
    setIncludedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    );
  }

  async function mergeCandidates() {
    if (!canMerge || !primaryCandidate) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/dossiers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "mergeCandidates",
          input: {
            primaryCandidateId: primaryCandidate.id,
            sourceCandidateIds: includedCandidateIds,
            mergeNote,
            createMasterDraft,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? `Workflow API returned ${response.status}.`);
      }
      setPayload(data as WorkflowPayload);
      setMergeResult({
        candidate: data.candidate,
        draft: data.draft,
        mergedSourceCandidates: includedCandidates.filter(
          (candidate) => candidate.id !== primaryCandidate.id,
        ),
        supersededSourceDrafts: createMasterDraft
          ? groupDrafts.filter((draft) => draft.candidateId !== primaryCandidate.id)
          : [],
      });
      setNotice("Explicit merge review completed. No public dossier was published.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <MinimalState title="Loading duplicate analysis" message="Checking dossier workflow state…" />;
  }
  if (error) return <MinimalState title="Unable to load" message={error} />;
  if (!group) {
    return (
      <MinimalState
        title="Duplicate group not found"
        message="This Record Compactor group may have been resolved or rebuilt."
      />
    );
  }

  return (
    <main className="pt-14 min-h-screen bg-background">
      <section className="border-b border-border bg-surface/80 px-4 sm:px-6 py-10">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs uppercase tracking-[0.5em] text-accent mb-4">
            Duplicate Analysis
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground">
            Record Compactor Merge Review
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-muted">
            Review why these workflow records were grouped and decide what, if
            anything, should be archived, linked, promoted, merged through the
            explicit high-risk flow, or kept separate. Merge is owner/lead cleanup. This combines BNL Source Files only when explicitly confirmed. Nothing auto-merges. Source candidates are preserved and Source drafts are preserved for audit. BNL merge writing comes later. This page does not
            publish, auto-merge, auto-delete, auto-draft, auto-tag, or
            auto-confirm aliases.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link
              href="/admin/dossiers"
              className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background"
            >
              Back to Dossier Control Center
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        {notice && (
          <div className="border border-accent/60 bg-accent/10 p-4 text-sm text-accent">
            {notice}
          </div>
        )}
        <PhaseRail />

        <section className="border border-border bg-surface p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-muted mb-2">
                Group summary
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                {group.names.join(" / ")}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill>{group.category.replace(/_/g, " ")}</StatusPill>
              <StatusPill>Risk: {group.risk}</StatusPill>
              <StatusPill>{group.actionSafety.replace(/_/g, " ")}</StatusPill>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted">
            <p className="border border-border/70 bg-background/20 p-3">
              Recommended action: {group.recommendedAction}
            </p>
            <p className="border border-border/70 bg-background/20 p-3">
              Admin must decide: {group.adminDecision}
            </p>
            <p className="border border-border/70 bg-background/20 p-3">
              Safety: safe cleanup means explicit archive/review only;
              identity-sensitive records require admin review; destructive
              actions require the existing confirmation/merge flow.
            </p>
          </div>
          <div className="text-sm text-muted">
            <p className="font-bold text-foreground">Why grouped</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {(group.reasons?.length ? group.reasons : [group.reason]).map(
                (reason) => (
                  <li key={reason}>{reason}</li>
                ),
              )}
            </ul>
          </div>
          {group.existingPublishedDossierMatch && (
            <p className="border border-accent/50 bg-accent/10 p-3 text-sm text-accent">
              Existing public dossier overlap: {group.existingPublishedDossierMatch.name} ({group.existingPublishedDossierMatch.confidence}). No public database publishing or edits happen in this review.
            </p>
          )}
        </section>

        <section className="border border-border bg-surface p-5 space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Records involved</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {group.records.map((record) => (
              <article
                key={`${record.kind}-${record.id}`}
                className="border border-border/70 bg-background/20 p-4 text-sm text-muted"
              >
                <div className="flex flex-wrap gap-2 mb-3">
                  <StatusPill>{record.workspaceType}</StatusPill>
                  <StatusPill>{record.status ?? record.kind}</StatusPill>
                </div>
                <h3 className="text-xl font-bold text-foreground">{record.label}</h3>
                <p>ID: {record.id}</p>
                {record.candidateId && (
                  <Link
                    href={`/admin/dossiers/candidates/${record.candidateId}`}
                    className="mt-3 inline-flex border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                  >
                    Open related workspace
                  </Link>
                )}
                {record.recommendationId && (
                  <Link
                    href={`/admin/dossiers/recommendations/${record.recommendationId}`}
                    className="mt-3 inline-flex border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                  >
                    Open BNL Signal
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="border border-border bg-surface p-5 space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Candidate details</h2>
          {groupCandidates.length === 0 ? (
            <p className="text-sm text-muted">
              This group is signal/update analysis only and has no candidate merge controls.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {groupCandidates.map((candidate) => {
                const active = isCandidateActive(candidate);
                const linkedDraft = groupDrafts.find(
                  (draft) => draft.candidateId === candidate.id,
                );
                return (
                  <article
                    key={candidate.id}
                    className="border border-border/70 bg-background/20 p-4 text-sm text-muted space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-widest">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!active || resolved}
                          checked={includedCandidateIds.includes(candidate.id)}
                          onChange={() => toggleCandidate(candidate.id)}
                        />
                        Choose included candidates
                      </label>
                      {!active && <span className="text-accent">Closed: {candidate.status}</span>}
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{candidate.name}</h3>
                    <p>Status/source: {candidate.status} / {candidate.source}</p>
                    <p>Tier/score: {candidate.tier} / {candidate.score}</p>
                    <p>Reason: {candidate.reason || "—"}</p>
                    <p>Why now: {candidate.whyNow || "—"}</p>
                    <p>Evidence summary: {candidate.evidenceSummary || "—"}</p>
                    <div><span className="text-foreground">Known facts:</span> {list(candidate.knownFacts)}</div>
                    <div><span className="text-foreground">Missing info:</span> {list(candidate.missingInfo)}</div>
                    <div><span className="text-foreground">Do-not-say:</span> {list(candidate.doNotSay)}</div>
                    <div><span className="text-foreground">Public safety notes:</span> {list(candidate.publicSafetyNotes)}</div>
                    <p>Linked draft status: {linkedDraft?.status ?? "No linked draft"}</p>
                    <p>Merge history: {candidate.mergeSourceCandidateIds?.join(", ") || candidate.mergedIntoCandidateId || "—"}</p>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {!resolved && (
          <section className="border border-border bg-surface p-5 space-y-4">
            <h2 className="text-2xl font-bold text-foreground">
              Owner/Lead Merge Controls — high-risk admin preview
            </h2>
            <div className="border border-accent/50 bg-accent/10 p-4 text-sm text-accent space-y-1">
              <p>Pre-merge summary</p>
              <p>Master candidate: {primaryCandidate?.name ?? "—"}</p>
              <p>Included candidates: {includedCandidates.length} / {includedCandidates.map((candidate) => candidate.name).join(", ") || "—"}</p>
              <p>Candidates that will be marked merged: {includedCandidates.filter((candidate) => candidate.id !== primaryCandidate?.id).map((candidate) => candidate.name).join(", ") || "—"}</p>
              <p>Drafts that will be preserved: {groupDrafts.map((draft) => draft.fields.name).join(", ") || "—"}</p>
              <p>Drafts that will be marked superseded if master draft option is enabled: {createMasterDraft ? groupDrafts.filter((draft) => draft.candidateId !== primaryCandidate?.id).map((draft) => draft.fields.name).join(", ") || "—" : "Master draft merge not selected"}</p>
              <p>{createMasterDraft ? "Master draft will be created or updated." : "No master draft will be created or updated."}</p>
              <p>No public database record will be created.</p>
              <p>No tags will be created.</p>
              <p>BNL will not be invoked.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs uppercase tracking-widest text-muted">
              <label className="flex items-center gap-2 border border-border bg-background/20 p-3">
                <input
                  type="radio"
                  checked={mergeMode === "candidates_only"}
                  onChange={() => setMergeMode("candidates_only")}
                />
                Merge candidates only
              </label>
              <label className="flex items-center gap-2 border border-border bg-background/20 p-3">
                <input
                  type="radio"
                  checked={mergeMode === "with_master_draft"}
                  onChange={() => setMergeMode("with_master_draft")}
                />
                Merge candidates and create/update master draft
              </label>
              <label className="md:col-span-2 space-y-2">
                <span>Merge note</span>
                <textarea
                  value={mergeNote}
                  onChange={(event) => setMergeNote(event.target.value)}
                  className="w-full min-h-24 bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={saving || !canMerge}
              onClick={() => void mergeCandidates()}
              className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
            >
              Merge button
            </button>
            <p className="text-xs text-muted">
              The merge button requires a selected active master, at least two
              included candidates, the master included in the selection, and a
              merge mode. No publishing happens. No BNL invocation, publishing,
              automatic tag creation, automatic alias confirmation, or reset/rebuild
              happens in this merge review.
            </p>
          </section>
        )}

        {mergeResult && (
          <section className="border border-accent/60 bg-accent/10 p-5 text-sm text-accent space-y-3">
            <h2 className="text-xl font-bold">Merge result</h2>
            {mergeResult.candidate && (
              <p>
                Master candidate: <Link className="underline" href={`/admin/dossiers/candidates/${mergeResult.candidate.id}`}>{mergeResult.candidate.name}</Link>
              </p>
            )}
            {mergeResult.draft && (
              <p>
                Master draft: <Link className="underline" href={`/admin/dossiers/drafts/${mergeResult.draft.id}`} target="_blank" rel="noopener noreferrer">{mergeResult.draft.fields.name}</Link>
              </p>
            )}
            <div>
              <p className="font-bold">Merged source candidates:</p>
              {mergeResult.mergedSourceCandidates.length ? (
                <ul className="list-disc pl-5">
                  {mergeResult.mergedSourceCandidates.map((candidate) => (
                    <li key={candidate.id}>{candidate.name}</li>
                  ))}
                </ul>
              ) : (
                <p>—</p>
              )}
            </div>
            <div>
              <p className="font-bold">Superseded source drafts:</p>
              {mergeResult.supersededSourceDrafts.length ? (
                <ul className="list-disc pl-5">
                  {mergeResult.supersededSourceDrafts.map((draft) => (
                    <li key={draft.id}>{draft.fields.name}</li>
                  ))}
                </ul>
              ) : (
                <p>—</p>
              )}
            </div>
            {mergeResult.draft && (
              <Link
                href={`/admin/dossiers/drafts/${mergeResult.draft.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
              >
                Open master draft
              </Link>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
