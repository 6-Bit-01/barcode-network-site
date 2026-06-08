"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getDossierSourceFileMetrics,
  matchDossierRecommendationSubject,
  type DossierCandidate,
  type DossierDraft,
  type DossierDuplicateGroup,
  type DossierRecommendation,
} from "@/lib/dossier-workflow";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  duplicateGroups: DossierDuplicateGroup[];
  recommendations: DossierRecommendation[];
  workflow: {
    status: string;
    storage: string;
    updatedAt?: string;
    boundaries: string[];
  };
  ownerReviewQueue?: {
    waitingCount: number;
    draftCount: number;
    candidateCount: number;
  };
  authoringGuide?: { version: string };
  tagRegistry?: { totalUniqueTags: number; totalTagAssignments: number };
  publicDossiers?: Array<{ id: string; name: string }>;
};

type ManualRecommendationForm = {
  subjectName: string;
  type: DossierRecommendation["type"];
  reason: string;
  confidence: "" | "low" | "medium" | "high";
};

const emptyRecommendationForm: ManualRecommendationForm = {
  subjectName: "",
  type: "new_subject",
  reason: "",
  confidence: "medium",
};

const activeCandidateStatuses = new Set<DossierCandidate["status"]>([
  "active_source_file",
  "suggested",
  "needs_review",
  "selected",
  "draft_requested",
  "draft_ready",
  "needs_revision",
  "needs_more_evidence",
  "approved",
]);
const activeDraftStatuses = new Set<DossierDraft["status"]>([
  "draft",
  "owner_changes_requested",
]);
const closedDraftStatuses = new Set<DossierDraft["status"]>([
  "denied",
  "superseded",
  "owner_approved",
  "published",
]);

function MinimalDossierAdminState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="pt-14 min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-md border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-[0.5em] text-muted mb-5">
          ADMIN ACCESS CHECK
        </p>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted mt-3">{message}</p>
        <Link
          href="/admin"
          className="mt-6 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all"
        >
          Back to Admin
        </Link>
      </section>
    </main>
  );
}

function textInputClass() {
  return "w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground";
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function isCandidateClosed(candidate: DossierCandidate) {
  return candidate.status === "denied" || candidate.status === "merged";
}

function isDraftActive(draft: DossierDraft) {
  return activeDraftStatuses.has(draft.status);
}

function linkedActiveDraftFor(
  candidate: DossierCandidate,
  drafts: DossierDraft[],
) {
  return drafts.find(
    (draft) => draft.candidateId === candidate.id && isDraftActive(draft),
  );
}

function recommendationProvenance(recommendation: DossierRecommendation) {
  if (recommendation.ingestSource === "bnl_source_file_enrichment") {
    return "BNL review addendum";
  }
  if (recommendation.ingestSource === "bnl_dynamic_candidate_discovery") {
    return "BNL records";
  }
  if (recommendation.ingestSource === "bnl_source_knowledge_bridge") {
    return "Older BNL review note";
  }
  if (recommendation.ingestSource === "bnl" || recommendation.createdBy === "bnl") {
    return "Known from BNL records";
  }
  return recommendation.createdBy
    ? `Seeded by ${recommendation.createdBy}`
    : "Manually seeded";
}

function candidateProvenance(candidate: DossierCandidate) {
  if (candidate.source === "bnl_source_file_enrichment") {
    return "Known from BNL records / review addendum";
  }
  if (candidate.source === "bnl_dynamic_candidate_discovery") {
    return "Known from BNL records";
  }
  if (candidate.source === "bnl_source_knowledge_bridge") {
    return "Known from older BNL review notes";
  }
  if (candidate.source === "manual") return "Added by an operator";
  return "Internal note";
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border bg-background/40 px-2 py-1 text-[0.65rem] uppercase tracking-widest text-muted">
      {children}
    </span>
  );
}

const dossierPhases = [
  "Phase 1 — Case File / BNL Source File",
  "Phase 2 — Proposed Dossier + BNL Edit Chat",
  "Phase 3 — Final Admin Draft",
  "Phase 4 — Owner Review",
  "Phase 5 — Approved / Publish Later",
];

function PhaseRail({ currentPhase }: { currentPhase?: number }) {
  return (
    <section
      className="border border-border bg-surface p-4"
      aria-label="Dossier phase overview"
    >
      <p className="text-xs uppercase tracking-[0.45em] text-muted mb-3">
        Numbered dossier phases
      </p>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs uppercase tracking-widest">
        {dossierPhases.map((phase, index) => (
          <span
            key={phase}
            className={`border px-3 py-2 ${currentPhase === index + 1 ? "border-accent text-accent bg-accent/10" : "border-border text-muted bg-background/30"}`}
          >
            {phase}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Phase 1 is the internal working case file / evidence folder; it is not
        public copy. Phase 2 is the curated public-facing draft written from
        reviewed Case File material. Phase 3 is final admin draft
        confirmation. Phase 4 is the owner final approval gate before anything
        becomes publishable/public. Phase 5 is approved / publish later and is
        not active yet.
      </p>
    </section>
  );
}

function DashboardCard({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.45em] text-muted mb-2">
            {eyebrow}
          </p>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function DossierControlCenterPage() {
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recommendationForm, setRecommendationForm] =
    useState<ManualRecommendationForm>(emptyRecommendationForm);
  const [createdDraftIdByCandidate, setCreatedDraftIdByCandidate] = useState<
    Record<string, string>
  >({});
  const [selectedDossierByCandidate, setSelectedDossierByCandidate] = useState<
    Record<string, string>
  >({});

  async function loadWorkflow() {
    setError(null);
    const response = await fetch("/api/admin/dossiers", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "Admin authentication required"
          : `Workflow API returned ${response.status}.`,
      );
    }
    setPayload((await response.json()) as WorkflowPayload);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadWorkflow()
        .catch((err) =>
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load dossier workflow.",
          ),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const candidates = useMemo(
    () => payload?.candidates ?? [],
    [payload?.candidates],
  );
  const drafts = useMemo(() => payload?.drafts ?? [], [payload?.drafts]);
  const duplicateGroups = useMemo(
    () => payload?.duplicateGroups ?? [],
    [payload?.duplicateGroups],
  );
  const recommendations = useMemo(
    () => payload?.recommendations ?? [],
    [payload?.recommendations],
  );
  const publicDossiers = useMemo(
    () => payload?.publicDossiers ?? [],
    [payload?.publicDossiers],
  );
  const activeRecommendations = recommendations.filter((recommendation) =>
    ["new", "reviewing"].includes(recommendation.status),
  );
  const terminalRecommendations = recommendations.filter((recommendation) =>
    [
      "attached_to_source_file",
      "converted_to_source_file",
      "identity_link_created",
      "ignored",
      "dismissed",
      "archived",
    ].includes(recommendation.status),
  );
  const candidateIntakeItems = candidates.filter(
    (candidate) => candidate.status === "candidate_intake",
  );
  const activeCandidates = candidates.filter((candidate) =>
    activeCandidateStatuses.has(candidate.status),
  );
  const existingDossierUpdates = candidates.filter(
    (candidate) => candidate.status === "existing_dossier_update",
  );
  const archivedCandidates = candidates.filter(
    (candidate) => candidate.status === "archived",
  );
  const closedCandidates = candidates.filter(
    (candidate) =>
      candidate.status === "denied" || candidate.status === "merged",
  );
  const ownerReviewDrafts = drafts.filter(
    (draft) => draft.status === "ready_for_owner_review",
  );
  const closedDrafts = drafts.filter((draft) =>
    closedDraftStatuses.has(draft.status),
  );
  const activeDuplicateGroups = duplicateGroups.filter((group) => {
    const activeGroupCandidates = group.candidateIds
      .map((candidateId) =>
        candidates.find((candidate) => candidate.id === candidateId),
      )
      .filter(
        (candidate): candidate is DossierCandidate =>
          candidate !== undefined && !isCandidateClosed(candidate),
      );
    return activeGroupCandidates.length >= 2;
  });
  const resolvedDuplicateGroups = duplicateGroups.filter(
    (group) =>
      !activeDuplicateGroups.some((activeGroup) => activeGroup.id === group.id),
  );
  const sourceFileMetrics = new Map(
    candidates.map((candidate) => [
      candidate.id,
      getDossierSourceFileMetrics({ candidate, drafts, recommendations }),
    ]),
  );
  const sourceFilesNeedingInfo = activeCandidates.filter(
    (candidate) =>
      candidate.status === "needs_more_evidence" ||
      (candidate.missingInfo ?? []).length > 0,
  );
  const sourceFilesWithDrafts = activeCandidates.filter((candidate) =>
    drafts.some((draft) => draft.candidateId === candidate.id),
  );
  const sourceFilesWithUnappliedNotes = activeCandidates.filter(
    (candidate) =>
      (sourceFileMetrics.get(candidate.id)?.unappliedSourceNotesCount ?? 0) > 0,
  );
  const proposedDossiers = drafts.filter((draft) =>
    ["draft", "owner_changes_requested", "ready_for_owner_review"].includes(
      draft.status,
    ),
  );
  const closedHistoryCount =
    closedCandidates.length + closedDrafts.length + terminalRecommendations.length;

  async function postWorkflow(body: Record<string, unknown>) {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/dossiers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response
        .json()
        .catch(() => ({}))) as Partial<WorkflowPayload> & {
        candidate?: DossierCandidate;
        draft?: DossierDraft;
        recommendation?: DossierRecommendation;
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          data.error ??
            data.message ??
            `Workflow API returned ${response.status}.`,
        );
      if (data.candidates && data.drafts && data.workflow)
        setPayload(data as WorkflowPayload);
      return data;
    } finally {
      setSaving(false);
    }
  }

  async function submitManualRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = await postWorkflow({
        action: "createDossierRecommendation",
        input: {
          type: recommendationForm.type,
          subjectName: recommendationForm.subjectName,
          reason: recommendationForm.reason,
          confidence: recommendationForm.confidence || undefined,
          sourceLanes: ["admin_manual"],
        },
      });
      setRecommendationForm(emptyRecommendationForm);
      setNotice(
        `BNL Signal created: ${data.recommendation?.subjectName ?? "signal"}. BNL Signals do not publish anything.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to create BNL Signal.",
      );
    }
  }

  function recommendationMatchState(recommendation: DossierRecommendation) {
    const match = matchDossierRecommendationSubject({ recommendation, candidates });
    if (recommendation.ingestSource === "bnl_source_file_enrichment") {
      const target = recommendation.targetCandidateId
        ? candidates.find((candidate) => candidate.id === recommendation.targetCandidateId)
        : null;
      return {
        match,
        state: target?.status === "active_source_file"
          ? "BNL review addendum / Case File"
          : target?.status === "candidate_intake"
            ? "BNL review addendum / Dossier Seed"
            : target?.status === "existing_dossier_update"
              ? "BNL review addendum / Dossier Update"
              : "BNL Signal / Needs Admin Decision",
        nextAction: "Review-only internal case-file material; not public copy",
      };
    }
    if (match.exactMatchKind === "pre_targeted") {
      return {
        match,
        state: "Matches Case File",
        nextAction: "Attach to Matched Case File",
      };
    }
    if (match.exactCandidateId) {
      return {
        match,
        state: "Matches Case File",
        nextAction: "Attach to Matched Case File",
      };
    }
    if (match.possibleCandidateIds.length > 0) {
      return {
        match,
        state: "Suggests Identity Link",
        nextAction: "Needs Admin Decision",
      };
    }
    if (recommendation.targetDossierId || recommendation.type === "modify_existing_dossier") {
      return {
        match,
        state: "Dossier Update",
        nextAction: "Suggests Dossier Update",
      };
    }
    return {
      match,
      state: "Could Become Dossier Seed",
      nextAction: "Could Become Dossier Seed",
    };
  }

  async function createDraft(candidateId: string) {
    const candidate = candidates.find((item) => item.id === candidateId);
    if (
      !candidate ||
      isCandidateClosed(candidate) ||
      linkedActiveDraftFor(candidate, drafts)
    )
      return;

    try {
      const data = await postWorkflow({
        action: "createDraftFromCandidate",
        candidateId,
      });
      if (data.draft) {
        setCreatedDraftIdByCandidate((current) => ({
          ...current,
          [candidateId]: data.draft?.id ?? "",
        }));
        setNotice(
          `Draft created: ${data.draft.fields.name}. Open the dedicated draft editor to continue. Saving does not publish.`,
        );
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to create draft.");
    }
  }

  async function updateCandidate(
    candidateId: string,
    action: "markNeedsMoreEvidence",
  ) {
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate || isCandidateClosed(candidate)) return;

    try {
      const data = await postWorkflow({ action, candidateId });
      setNotice(
        `${data.candidate?.name ?? "Workflow record"} updated. Workflow records remain internal only.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to update internal record.",
      );
    }
  }


  async function recommendationAction(
    recommendationId: string,
    action: "dismissDossierRecommendation" | "archiveDossierRecommendation",
  ) {
    try {
      await postWorkflow({ action, recommendationId });
      setNotice(
        action === "archiveDossierRecommendation"
          ? "Signal archived. It is removed from active workflow lanes without deleting public dossiers."
          : "Signal dismissed. Public dossiers were not changed.",
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Signal action failed.",
      );
    }
  }

  async function candidateAction(
    candidateId: string,
    action:
      | "promoteCandidateToSourceFile"
      | "archiveCandidate"
      | "restoreCandidate"
      | "permanentlyDeleteCandidate"
      | "attachCandidateToExistingDossier"
      | "markCandidateAsExistingDossierUpdate",
  ) {
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate) return;

    try {
      const body: Record<string, unknown> = { action, candidateId };
      if (
        action === "attachCandidateToExistingDossier" ||
        action === "markCandidateAsExistingDossierUpdate"
      ) {
        const selectedDossierId =
          selectedDossierByCandidate[candidateId] || candidate.existingDossierMatch?.id || "";
        if (selectedDossierId) {
          body.dossierId = selectedDossierId;
          body.confidence = selectedDossierByCandidate[candidateId] ? "high" : candidate.existingDossierMatch?.confidence;
        }
      }
      if (action === "permanentlyDeleteCandidate") {
        const linkedDrafts = drafts.filter(
          (draft) => draft.candidateId === candidateId,
        );
        const confirmation = window.prompt(
          `Permanent delete removes the unpublished workflow item${
            linkedDrafts.length > 0
              ? ` and ${linkedDrafts.length} linked unpublished proposed dossier draft${linkedDrafts.length === 1 ? "" : "s"}`
              : ""
          }. Public dossiers and published data are not deleted. Type "DELETE SOURCE FILE" to confirm.`,
        );
        if (confirmation !== "DELETE SOURCE FILE") return;
        body.confirmation = confirmation;
      }
      const data = await postWorkflow(body);
      const actionNotice =
        action === "archiveCandidate"
          ? `${candidate.name} archived. It moved out of active dashboard lanes and public dossiers were not changed.`
          : action === "restoreCandidate"
            ? `${candidate.name} restored to intake review. Public dossiers were not changed.`
            : action === "permanentlyDeleteCandidate"
              ? `${candidate.name} permanently deleted from unpublished internal records. Public dossiers were not changed.`
              : action === "attachCandidateToExistingDossier"
                ? `${candidate.name} attached to an existing public dossier target. Public dossier content was not changed.`
                : action === "markCandidateAsExistingDossierUpdate"
                  ? `${candidate.name} moved to Dossier Updates / Enrichment. Public dossier content was not changed.`
                  : `${candidate.name} promoted to a Case File / BNL Source File. Public dossiers were not changed.`;
      setNotice(actionNotice);
      if (data.candidates && data.drafts && data.workflow) {
        setPayload(data as WorkflowPayload);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Candidate action failed.");
    }
  }

  if (loading) {
    return (
      <MinimalDossierAdminState
        title="Checking admin access..."
        message="Loading the dossier workflow dashboard."
      />
    );
  }

  if (error || !payload) {
    return (
      <MinimalDossierAdminState
        title="Admin authentication required"
        message={
          error ?? "Sign in through /admin before opening the dossier workflow."
        }
      />
    );
  }

  return (
    <main className="pt-14 min-h-screen bg-background">
      <section className="border-b border-border bg-surface/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">
            ADMIN DOSSIER WORKFLOW
          </p>
          <h1
            aria-label="Dossier Control Center"
            className="text-4xl font-bold tracking-tight text-foreground"
          >
            <span className="text-accent text-glow">Dossier</span> Control
            Center
          </h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            Overview of Signal Review inputs, Dossier Seeds, Case Files / BNL Source Files, Proposed Dossiers, and Owner Review status. Open a workspace to continue the pipeline: Signal Review → Dossier Seeds → Case Files → Proposed Dossiers → Owner Review.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link
              href="/admin"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all"
            >
              Back to Admin
            </Link>
            <Link
              href="/database"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all"
            >
              Public Database
            </Link>
            <Link
              href="/admin/dossiers/owner-review"
              className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background transition-all"
            >
              Owner Review
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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-xs text-muted">
          {[
            ["Workflow Records", candidates.length],
            ["Dossier Seeds", candidateIntakeItems.length],
            ["Case Files", activeCandidates.length],
            ["Dossier Updates", existingDossierUpdates.length],
            ["Proposed Dossiers", proposedDossiers.length],
            ["Owner Review waiting", ownerReviewDrafts.length],
            ["Archived / Trash", archivedCandidates.length],
            ["Case Files Needing Info", sourceFilesNeedingInfo.length],
            ["Case Files With Proposed Dossiers", sourceFilesWithDrafts.length],
            [
              "Case Files With Source Notes",
              sourceFilesWithUnappliedNotes.length,
            ],
            ["Signals Waiting", activeRecommendations.length],
            ["Identity Links", activeDuplicateGroups.length],
            ["Archive / History", closedHistoryCount],
          ].map(([label, value]) => (
            <div key={label} className="border border-border bg-surface p-4">
              <p className="uppercase tracking-[0.35em] text-accent mb-2">
                {label}
              </p>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <PhaseRail />

        <DashboardCard
          eyebrow="Workflow map"
          title="Signal Review → Dossier Seeds → Case Files → Proposed Dossiers → Owner Review"
          aside={<StatusPill>overview only</StatusPill>}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted">
            <p className="border border-border/70 bg-background/20 p-3">
              Case Files / BNL Source Files are internal subject workspaces.
            </p>
            <p className="border border-border/70 bg-background/20 p-3">
              Proposed Dossiers are curated public-facing drafts written only from reviewed Case File material.
            </p>
            <p className="border border-border/70 bg-background/20 p-3">
              Owner Review is the final approval/editing lane before publishable state.
            </p>
          </div>
        </DashboardCard>

        <DashboardCard
          eyebrow="Signal Review"
          title="Signal Review"
          aside={
            <StatusPill>{activeRecommendations.length} signals waiting</StatusPill>
          }
        >
          <p className="text-sm text-muted">
            BNL Signals are incoming source/recommendation inputs. Signals can become Dossier Seeds, attach to Case Files, create Dossier Updates, or suggest Identity Links. Signals are not public copy and do not publish anything.
          </p>
          {activeRecommendations.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No signals waiting. Ignored, dismissed, converted, and attached records remain preserved in history.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground">
                  <tr>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Match state</th>
                    <th className="py-2 pr-3">Ingest</th>
                    <th className="py-2 pr-3">Source lanes</th>
                    <th className="py-2 pr-3">Next action</th>
                    <th className="py-2 pr-3">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRecommendations.map((recommendation) => {
                    const matchState = recommendationMatchState(recommendation);
                    return (
                      <tr
                        key={recommendation.id}
                        className="border-t border-border/70 align-top"
                      >
                        <td className="py-3 pr-3 text-foreground font-semibold">
                          {recommendation.subjectName}
                        </td>
                        <td className="py-3 pr-3">{matchState.state}</td>
                        <td className="py-3 pr-3">
                          <p>{recommendationProvenance(recommendation)}</p>
                          {recommendation.ingestedAt && (
                            <p className="text-xs">{formatDate(recommendation.ingestedAt)}</p>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {recommendation.sourceLanes.join(", ")}
                        </td>
                        <td className="py-3 pr-3">{matchState.nextAction}</td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/admin/dossiers/recommendations/${recommendation.id}`}
                              className="inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                            >
                              Review Signal
                            </Link>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void recommendationAction(
                                  recommendation.id,
                                  "archiveDossierRecommendation",
                                )
                              }
                              className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                            >
                              Archive
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void recommendationAction(
                                  recommendation.id,
                                  "dismissDossierRecommendation",
                                )
                              }
                              className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <details className="border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-bold text-foreground">
            Manual Signal
          </summary>
          <p className="mt-3 text-sm text-muted">
            Use this only when BNL has not suggested something yet. This creates a BNL Signal, not a direct source file.
          </p>
          <form
            onSubmit={submitManualRecommendation}
            className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 text-xs uppercase tracking-widest text-muted"
          >
            <label className="space-y-2 md:col-span-1">
              <span>Subject name</span>
              <input
                required
                value={recommendationForm.subjectName}
                onChange={(event) =>
                  setRecommendationForm({
                    ...recommendationForm,
                    subjectName: event.target.value,
                  })
                }
                className={textInputClass()}
              />
            </label>
            <label className="space-y-2">
              <span>Type</span>
              <select
                value={recommendationForm.type}
                onChange={(event) =>
                  setRecommendationForm({
                    ...recommendationForm,
                    type: event.target.value as DossierRecommendation["type"],
                  })
                }
                className={textInputClass()}
              >
                <option value="new_subject">New Subject</option>
                <option value="modify_existing_dossier">
                  Modify Existing Dossier
                </option>
              </select>
            </label>
            <label className="space-y-2">
              <span>Confidence</span>
              <select
                value={recommendationForm.confidence}
                onChange={(event) =>
                  setRecommendationForm({
                    ...recommendationForm,
                    confidence: event.target
                      .value as ManualRecommendationForm["confidence"],
                  })
                }
                className={textInputClass()}
              >
                <option value="medium">medium</option>
                <option value="low">low</option>
                <option value="high">high</option>
                <option value="">unset</option>
              </select>
            </label>
            <label className="space-y-2 md:col-span-2">
              <span>Reason</span>
              <input
                required
                value={recommendationForm.reason}
                onChange={(event) =>
                  setRecommendationForm({
                    ...recommendationForm,
                    reason: event.target.value,
                  })
                }
                className={textInputClass()}
              />
            </label>
            <div className="md:col-span-5">
              <button
                type="submit"
                disabled={saving}
                className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
              >
                Create Manual Signal
              </button>
            </div>
          </form>
        </details>


        <DashboardCard
          eyebrow="Dossier Seeds"
          title="Dossier Seeds"
          aside={<StatusPill>{candidateIntakeItems.length} seeds</StatusPill>}
        >
          <p className="text-sm text-muted mb-4">
            Dossier Seeds are lightweight internal records. Admins decide when a Dossier Seed becomes a Case File / BNL Source File; evidence, review warnings, safety notes, do-not-say notes, and open questions are preserved during promotion.
          </p>
          {candidateIntakeItems.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No Dossier Seeds are waiting.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {candidateIntakeItems.map((candidate) => (
                <article key={candidate.id} className="border border-border/70 bg-background/20 p-4 text-sm text-muted">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-bold text-foreground">{candidate.name}</p>
                      <p>Source: {candidateProvenance(candidate)}</p>
                      <p>Status/stage: Dossier Seed / {candidate.status}</p>
                      {(candidate.publicSafetyNotes ?? []).length > 0 && (
                        <p className="text-accent">Warning badges: source warnings present</p>
                      )}
                      {candidate.existingDossierMatch && (
                        <p>Possible public dossier match: {candidate.existingDossierMatch.name}</p>
                      )}
                      <p>Next action: Promote to Case File / BNL Source File or archive junk/test extraction.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/dossiers/candidates/${candidate.id}`} className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">
                        Review Dossier Seed
                      </Link>
                      <button type="button" disabled={saving} onClick={() => void candidateAction(candidate.id, "promoteCandidateToSourceFile")} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50">
                        Promote to Case File
                      </button>
                      <button type="button" disabled={saving} onClick={() => void candidateAction(candidate.id, "archiveCandidate")} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50">
                        Archive
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          eyebrow="Dossier Updates"
          title="Dossier Updates"
          aside={<StatusPill>{existingDossierUpdates.length} dossier updates</StatusPill>}
        >
          <p className="text-sm text-muted mb-4">
            Exact public dossier matches are staged as Dossier Updates, not as brand-new public dossiers. Owner approval is required before public changes.
          </p>
          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted">
            <p className="border border-border/70 bg-background/20 p-3">
              Dossier Update target found: protected source lookup can now
              recognize a published dossier target even when no internal update
              file exists yet.
            </p>
            <p className="border border-border/70 bg-background/20 p-3">
              No internal update file exists yet: use the protected Create
              Dossier Update action before enrichment attaches notes.
            </p>
            <p className="border border-border/70 bg-background/20 p-3">
              Review-only; no public changes. The update lane does not approve
              public copy, aliases, identity merges, or publication.
            </p>
          </div>
          {existingDossierUpdates.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No existing public dossier update records are waiting.
            </p>
          ) : (
            <div className="space-y-3">
              {existingDossierUpdates.map((candidate) => (
                <article key={candidate.id} className="border border-border/70 bg-background/20 p-4 text-sm text-muted">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-bold text-foreground">Dossier Update: {candidate.existingDossierMatch?.name ?? candidate.name}</p>
                      <p>BNL Signal subject: {candidate.name}</p>
                      <p>Matched public dossier: {candidate.existingDossierMatch?.name ?? "—"}</p>
                      <p>Public dossier target id: {candidate.existingDossierMatch?.id ?? "—"}</p>
                      <p>Match confidence: {candidate.existingDossierMatch?.confidence ?? "—"}</p>
                      <p>Evidence and notes: {(candidate.sourceFileNotes ?? []).length} notes preserved</p>
                      <p>Review warnings: {(candidate.publicSafetyNotes ?? []).length} public-safety notes / {(candidate.doNotSay ?? []).length} do-not-say notes / {(candidate.missingInfo ?? []).length} open questions</p>
                      <p>Proposed action: review update/enrichment; owner approval required before public changes.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/dossiers/candidates/${candidate.id}`} className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">
                        Review Update
                      </Link>
                      <button type="button" disabled={saving} onClick={() => void candidateAction(candidate.id, "promoteCandidateToSourceFile")} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50">
                        Convert to Case File
                      </button>
                      <button type="button" disabled={saving} onClick={() => void candidateAction(candidate.id, "archiveCandidate")} className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50">
                        Archive / wrong match
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          eyebrow="Primary operations"
          title="Active Case Files / BNL Source Files / Working Case Files"
          aside={<StatusPill>{activeCandidates.length} active working case files</StatusPill>}
        >
          <p className="text-sm text-muted">
            Open a BNL Source File working case file to review evidence. Proposed
            Dossiers, final admin confirmation, and owner review are shown here
            as concise status indicators only instead of full dashboard
            workboard lanes.
          </p>
          {activeCandidates.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No active Case Files / BNL Source Files need review.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground">
                  <tr>
                    <th className="py-2 pr-3">BNL Source File</th>
                    <th className="py-2 pr-3">Provenance</th>
                    <th className="py-2 pr-3">Current phase</th>
                    <th className="py-2 pr-3">Source depth / info strength</th>
                    <th className="py-2 pr-3">Source notes count</th>
                    <th className="py-2 pr-3">Signal/evidence count</th>
                    <th className="py-2 pr-3">Proposed dossier status</th>
                    <th className="py-2 pr-3">Unapplied source notes count</th>
                    <th className="py-2 pr-3">Identity links</th>
                    <th className="py-2 pr-3">Case file indicators</th>
                    <th className="py-2 pr-3">Last updated</th>
                    <th className="py-2 pr-3">Next recommended action</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCandidates.map((candidate) => {
                    const draft = linkedActiveDraftFor(candidate, drafts);
                    const createdDraftId =
                      createdDraftIdByCandidate[candidate.id];
                    const openDraftId = draft?.id ?? createdDraftId;
                    const canCreateDraft =
                      !isCandidateClosed(candidate) && !openDraftId;
                    const canUpdateCandidate = !isCandidateClosed(candidate);
                    const metrics = sourceFileMetrics.get(candidate.id);
                    const currentPhase = openDraftId
                      ? "Phase 2 — Proposed Dossier + BNL Edit Chat"
                      : "Phase 1 — Case File / BNL Source File";
                    const proposedStatus = draft
                      ? `${draft.status} / ${formatDate(draft.updatedAt)}`
                      : openDraftId
                        ? "draft just created"
                        : "No proposed dossier";
                    const identityLinks = candidate.identityLinks ?? [];
                    const confirmedIdentityLinks = identityLinks.filter(
                      (identityLink) => identityLink.status === "confirmed",
                    );
                    const proposedIdentityLinks = identityLinks.filter(
                      (identityLink) => identityLink.status === "proposed",
                    );
                    const nextAction =
                      (metrics?.unappliedSourceNotesCount ?? 0) > 0
                        ? "Review source updates in proposed dossier"
                        : openDraftId
                          ? "Open proposed dossier"
                          : candidate.status === "needs_more_evidence"
                            ? "Add missing info to Case File"
                            : "Add info or create proposed dossier";
                    return (
                      <tr
                        key={candidate.id}
                        className="border-t border-border/70 align-top"
                      >
                        <td className="py-3 pr-3 text-foreground font-semibold">
                          {candidate.name}
                        </td>
                        <td className="py-3 pr-3">
                          <p>{candidateProvenance(candidate)}</p>
                          {candidate.ingestKey && (
                            <p className="text-xs">Ingest key: {candidate.ingestKey}</p>
                          )}
                          {candidate.createdFromRecommendationId && (
                            <p className="text-xs">From BNL Signal: {candidate.createdFromRecommendationId}</p>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusPill>{currentPhase}</StatusPill>
                        </td>
                        <td className="py-3 pr-3">
                          Source strength: {metrics?.sourceDepth ?? "Low"}
                        </td>
                        <td className="py-3 pr-3">
                          Source notes: {metrics?.sourceNotesCount ?? 0}
                        </td>
                        <td className="py-3 pr-3">
                          Signals: {metrics?.attachedRecommendationCount ?? 0}
                          <br />
                          Evidence: {metrics?.evidenceItemCount ?? 0}
                        </td>
                        <td className="py-3 pr-3">{proposedStatus}</td>
                        <td className="py-3 pr-3">
                          Unapplied notes: {metrics?.unappliedSourceNotesCount ?? 0}
                        </td>
                        <td className="py-3 pr-3">
                          Aliases: {confirmedIdentityLinks.length} confirmed
                          {proposedIdentityLinks.length > 0 && (
                            <p className="text-xs text-accent">
                              Pending aliases: {proposedIdentityLinks.length} —
                              Identity Links
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-3 space-y-1">
                          {(candidate.publicSafetyNotes ?? []).length > 0 && (
                            <p>case file has warnings</p>
                          )}
                          {(candidate.sourceLanes ?? []).includes("broadcast_memory") && (
                            <p>case file has source-blind material</p>
                          )}
                          {(candidate.knownFacts ?? []).length > 0 && (
                            <p>case file has public-safe facts</p>
                          )}
                          {proposedIdentityLinks.length > 0 && (
                            <p>identity review pending</p>
                          )}
                          {openDraftId && <p>proposed dossier exists</p>}
                          {draft?.status === "ready_for_owner_review" && (
                            <p>owner review pending</p>
                          )}
                          {!openDraftId && candidate.status !== "needs_more_evidence" && (
                            <p>ready for draft/review</p>
                          )}
                          <p>Identity link risk: {candidate.duplicateRisk ?? "none"}</p>
                          {candidate.existingDossierMatch && (
                            <p className="text-accent">
                              Existing public dossier match: {candidate.existingDossierMatch.name} ({candidate.existingDossierMatch.confidence})
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {formatDate(candidate.updatedAt)}
                        </td>
                        <td className="py-3 pr-3">
                          {nextAction}
                          {isCandidateClosed(candidate) && (
                            <p className="text-xs text-accent">
                              Source file was merged or closed.
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/admin/dossiers/candidates/${candidate.id}`}
                              className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                            >
                              Open Case File
                            </Link>
                            {candidate.existingDossierMatch && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  void candidateAction(
                                    candidate.id,
                                    "markCandidateAsExistingDossierUpdate",
                                  )
                                }
                                className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                                title="Reclassify this active Case File as update/enrichment material for the matched public dossier. Does not publish or edit public content."
                              >
                                Move to Dossier Update
                              </button>
                            )}
                            <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-widest text-muted">
                              Attach to Existing Public Dossier
                              <select
                                value={
                                  selectedDossierByCandidate[candidate.id] ??
                                  candidate.existingDossierMatch?.id ??
                                  ""
                                }
                                onChange={(event) =>
                                  setSelectedDossierByCandidate((current) => ({
                                    ...current,
                                    [candidate.id]: event.target.value,
                                  }))
                                }
                                className="max-w-[14rem] bg-background border border-border px-2 py-1.5 text-xs normal-case tracking-normal text-foreground"
                              >
                                <option value="">Choose public dossier…</option>
                                {publicDossiers.map((dossier) => (
                                  <option key={dossier.id} value={dossier.id}>
                                    {dossier.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={
                                saving ||
                                !(
                                  selectedDossierByCandidate[candidate.id] ||
                                  candidate.existingDossierMatch?.id
                                )
                              }
                              onClick={() =>
                                void candidateAction(
                                  candidate.id,
                                  "attachCandidateToExistingDossier",
                                )
                              }
                              className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                              title="Store the confirmed existing public dossier target without publishing or changing public dossier content."
                            >
                              Attach
                            </button>
                            {openDraftId && (
                              <Link
                                href={`/admin/dossiers/drafts/${openDraftId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent"
                              >
                                Open Proposed Dossier
                              </Link>
                            )}
                            {!openDraftId && (
                              <button
                                type="button"
                                disabled={saving || !canCreateDraft}
                                onClick={() => void createDraft(candidate.id)}
                                className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                                title={
                                  canCreateDraft
                                    ? "Create proposed dossier from this BNL Source File."
                                    : "Active Proposed Dossier already exists or Case File was merged/denied."
                                }
                              >
                                Create Proposed Dossier
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={
                                saving ||
                                !canUpdateCandidate ||
                                candidate.status === "needs_more_evidence"
                              }
                              onClick={() =>
                                void updateCandidate(
                                  candidate.id,
                                  "markNeedsMoreEvidence",
                                )
                              }
                              className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50"
                            >
                              Mark Needs Info
                            </button>
                            <button
                              type="button"
                              disabled={saving || !canUpdateCandidate}
                              onClick={() =>
                                void candidateAction(candidate.id, "archiveCandidate")
                              }
                              className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                              title="Safe cleanup: move this Case File out of active dashboard lanes without deleting public dossiers or published data."
                            >
                              Archive
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void candidateAction(
                                  candidate.id,
                                  "permanentlyDeleteCandidate",
                                )
                              }
                              className="border border-red-500/70 px-3 py-1.5 text-xs uppercase tracking-widest text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                              title='Requires typing "DELETE SOURCE FILE". Does not delete public dossiers or published data.'
                            >
                              Delete Permanently
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          eyebrow="Identity safety"
          title="Identity Links"
          aside={
            <StatusPill>
              {activeDuplicateGroups.length} active warnings
            </StatusPill>
          }
        >
          {activeDuplicateGroups.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No duplicate or identity warnings need owner/lead review.
            </p>
          ) : (
            <div className="space-y-3">
              {activeDuplicateGroups.map((group) => (
                <article
                  key={group.id}
                  className="border border-border/70 bg-background/20 p-4 text-sm text-muted"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-bold text-foreground">
                        {group.names.join(" / ")}
                      </p>
                      <p>Risk: {group.risk}</p>
                      <p>Reason: {group.reason}</p>
                    </div>
                    <Link
                      href={`/admin/dossiers/duplicates/${group.id}`}
                      className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                    >
                      View Warning / Open Merge Review
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </DashboardCard>


        <DashboardCard
          eyebrow="Archive / Trash"
          title="Archived / Dismissed / Trash"
          aside={<StatusPill>{archivedCandidates.length} archived items</StatusPill>}
        >
          <p className="text-sm text-muted mb-4">
            Archive is the safe default for junk, test, error, low-confidence, or
            source-blind extractions. Permanent delete is protected by explicit
            confirmation text and never deletes public dossiers.
          </p>
          {archivedCandidates.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No archived internal records.
            </p>
          ) : (
            <div className="space-y-2 text-sm text-muted">
              {archivedCandidates.slice(0, 10).map((candidate) => (
                <article key={candidate.id} className="border border-border/70 bg-background/20 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{candidate.name}</p>
                      <p>Source: {candidateProvenance(candidate)} / status: {candidate.status}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={saving} onClick={() => void candidateAction(candidate.id, "restoreCandidate")} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50">
                        Restore to Intake
                      </button>
                      <button type="button" disabled={saving} onClick={() => void candidateAction(candidate.id, "permanentlyDeleteCandidate")} className="border border-red-500/70 px-3 py-1.5 text-xs uppercase tracking-widest text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                        Delete permanently
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </DashboardCard>

        <details className="border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-bold text-foreground">
            Archive / History
          </summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted">
            <p className="border border-border/70 bg-background/20 p-4">
              {closedCandidates.length} closed BNL Source File records.
            </p>
            <p className="border border-border/70 bg-background/20 p-4">
              {closedDrafts.length} closed proposed dossier records.
            </p>
            <p className="border border-border/70 bg-background/20 p-4">
              {terminalRecommendations.length} closed signal records;
              {" "}{resolvedDuplicateGroups.length} resolved duplicate groups.
            </p>
          </div>
          {terminalRecommendations.length > 0 && (
            <div className="mt-4 space-y-2 text-sm text-muted">
              {terminalRecommendations.slice(0, 5).map((recommendation) => (
                <article
                  key={recommendation.id}
                  className="border border-border/70 bg-background/20 p-3"
                >
                  <p className="font-semibold text-foreground">
                    {recommendation.subjectName}
                  </p>
                  <p>
                    Status: {recommendation.status === "identity_link_created"
                      ? "Identity link created — proposed, not confirmed"
                      : recommendation.status}
                  </p>
                  {recommendation.targetCandidateId && (
                    <Link
                      href={`/admin/dossiers/candidates/${recommendation.targetCandidateId}`}
                      className="text-accent hover:underline"
                    >
                      Open related BNL Source File
                    </Link>
                  )}
                </article>
              ))}
            </div>
          )}
        </details>

        <DashboardCard eyebrow="Boundaries" title="System Boundaries">
          <ul className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-muted">
            <li className="border border-border/70 bg-background/20 p-3">
              No BNL invocation.
            </li>
            <li className="border border-border/70 bg-background/20 p-3">
              No publishing.
            </li>
            <li className="border border-border/70 bg-background/20 p-3">
              No automatic tag creation.
            </li>
            <li className="border border-border/70 bg-background/20 p-3">
              No public database mutation.
            </li>
          </ul>
          <p className="text-xs text-muted">
            Dedicated pages keep operators in one lane: internal record review,
            focused draft editor, owner review, or merge review. Dashboard
            buttons navigate; there is no hidden editor below unrelated sections
            and no dashboard auto-scroll workflow.
          </p>
        </DashboardCard>
      </section>
    </main>
  );
}
