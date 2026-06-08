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
  if (
    recommendation.ingestSource === "bnl" ||
    recommendation.createdBy === "bnl"
  ) {
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

function identityBadgeForCandidate(candidate: DossierCandidate) {
  const identityLinks = candidate.identityLinks ?? [];
  const confirmed = identityLinks.filter(
    (link) => link.status === "confirmed",
  ).length;
  const pending = identityLinks.filter(
    (link) => link.status === "proposed",
  ).length;

  if (pending > 0) {
    return "Identity: Needs Confirmation";
  }
  if (confirmed > 0) {
    return "Identity: Connected to Existing Subject";
  }
  if (candidate.existingDossierMatch) {
    return "Existing Dossier Match";
  }
  if (
    candidate.duplicateRisk === "medium" ||
    candidate.duplicateRisk === "high"
  ) {
    return "Possible Duplicate";
  }
  if (candidate.duplicateRisk === "low") {
    return "Identity: Possible Match";
  }
  return "Identity: Clear";
}

function identityBadgeForRecommendation(
  recommendation: DossierRecommendation,
  matchState: { state: string; nextAction: string },
) {
  if (recommendation.type === "identity_link") {
    return "Identity: Needs Confirmation";
  }
  if (matchState.state === "possible_identity_link") {
    return "Identity: Possible Match";
  }
  if (matchState.state === "existing_candidate") {
    return "Identity: Connected to Existing Subject";
  }
  return "Identity: Clear";
}

function dossierStatusForCandidate(
  candidate: DossierCandidate,
  draft?: DossierDraft,
) {
  if (draft?.status === "ready_for_owner_review")
    return "Ready for Owner Review";
  if (draft?.status === "owner_changes_requested")
    return "Owner changes requested";
  if (draft?.status === "owner_approved") return "Approved / publish later";
  if (draft) return "Draft started";
  if (
    (candidate.sourceFileNotes ?? []).some((note) => note.status === "active")
  ) {
    return "Needs update from Source File";
  }
  return "No Proposed Dossier";
}

function firstListValue(values?: string[]) {
  return values?.find((value) => value.trim()) ?? "—";
}

function candidateActionLabel() {
  return "Review Candidate";
}

function recommendationActionLabel() {
  return "Review Candidate";
}

function dossierUpdateActionLabel() {
  return "Review Update";
}

function sourceFileActionLabel() {
  return "Open Source File";
}

function archiveActionLabel() {
  return "Review Record";
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
  const activeDossierUpdateRecommendations = activeRecommendations.filter(
    (recommendation) =>
      recommendation.type === "modify_existing_dossier" ||
      Boolean(recommendation.targetDossierId) ||
      Boolean(recommendation.targetCandidateId),
  );
  const activeCandidateRecommendations = activeRecommendations.filter(
    (recommendation) =>
      !activeDossierUpdateRecommendations.includes(recommendation),
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
    closedCandidates.length +
    closedDrafts.length +
    terminalRecommendations.length;

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
    const match = matchDossierRecommendationSubject({
      recommendation,
      candidates,
    });
    if (recommendation.ingestSource === "bnl_source_file_enrichment") {
      const target = recommendation.targetCandidateId
        ? candidates.find(
            (candidate) => candidate.id === recommendation.targetCandidateId,
          )
        : null;
      return {
        match,
        state:
          target?.status === "active_source_file"
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
    if (
      recommendation.targetDossierId ||
      recommendation.type === "modify_existing_dossier"
    ) {
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
        err instanceof Error
          ? err.message
          : "Failed to update internal record.",
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
      setNotice(err instanceof Error ? err.message : "Signal action failed.");
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
          selectedDossierByCandidate[candidateId] ||
          candidate.existingDossierMatch?.id ||
          "";
        if (selectedDossierId) {
          body.dossierId = selectedDossierId;
          body.confidence = selectedDossierByCandidate[candidateId]
            ? "high"
            : candidate.existingDossierMatch?.confidence;
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
      setNotice(
        err instanceof Error ? err.message : "Candidate action failed.",
      );
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
            ADMIN DOSSIER DASHBOARD
          </p>
          <h1
            aria-label="Dossier Control Center"
            className="text-4xl font-bold tracking-tight text-foreground"
          >
            <span className="text-accent text-glow">Dossier</span> Control
            Center
          </h1>
          <p className="text-sm text-muted mt-3 max-w-2xl">
            Sort noticed subjects, review updates, and open Source Files.
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
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        {notice && (
          <div className="border border-accent/60 bg-accent/10 p-4 text-sm text-accent">
            {notice}
          </div>
        )}

        <DashboardCard eyebrow="Summary" title="Summary">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 text-xs text-muted">
            {[
              [
                "Candidates",
                candidateIntakeItems.length +
                  activeCandidateRecommendations.length,
              ],
              [
                "Dossier Updates",
                existingDossierUpdates.length +
                  activeDossierUpdateRecommendations.length,
              ],
              ["Source Files", activeCandidates.length],
              ["Needs Info", sourceFilesNeedingInfo.length],
              [
                "Ready for Dossier",
                activeCandidates.filter(
                  (candidate) =>
                    !linkedActiveDraftFor(candidate, drafts) &&
                    candidate.status !== "needs_more_evidence",
                ).length,
              ],
              ["Owner Review waiting", ownerReviewDrafts.length],
              [
                "Archive / Dismissed / Trash",
                closedHistoryCount + archivedCandidates.length,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border border-border/70 bg-background/30 p-3"
              >
                <p className="uppercase tracking-[0.3em] text-accent mb-2">
                  {label}
                </p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          eyebrow="Candidates"
          title="Candidates"
          aside={
            <StatusPill>
              {candidateIntakeItems.length +
                activeCandidateRecommendations.length}{" "}
              waiting
            </StatusPill>
          }
        >
          <div className="mb-4">
            <details className="border border-border/70 bg-background/20 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Manual Signal
              </summary>
              <p className="mt-3 text-sm text-muted">
                Use this only when BNL has not suggested something yet. This
                creates a BNL Signal, not a direct source file.
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
                        type: event.target
                          .value as DossierRecommendation["type"],
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
          </div>

          {candidateIntakeItems.length +
            activeCandidateRecommendations.length ===
          0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No candidates are waiting.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground">
                  <tr>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Why BNL noticed</th>
                    <th className="py-2 pr-3">Strength / confidence</th>
                    <th className="py-2 pr-3">Identity status</th>
                    <th className="py-2 pr-3">Suggested next step</th>
                    <th className="py-2 pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCandidateRecommendations.map((recommendation) => {
                    const matchState = recommendationMatchState(recommendation);
                    return (
                      <tr
                        key={recommendation.id}
                        className="border-t border-border/70 align-top"
                      >
                        <td className="py-3 pr-3 font-semibold text-foreground">
                          {recommendation.subjectName}
                        </td>
                        <td className="py-3 pr-3">
                          {recommendation.reason ||
                            recommendation.evidenceSummary ||
                            recommendationProvenance(recommendation)}
                        </td>
                        <td className="py-3 pr-3">
                          {recommendation.confidence ?? "unset"}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusPill>
                            {identityBadgeForRecommendation(
                              recommendation,
                              matchState,
                            )}
                          </StatusPill>
                        </td>
                        <td className="py-3 pr-3">
                          {recommendation.suggestedAction ||
                            matchState.nextAction}
                        </td>
                        <td className="py-3 pr-3">
                          <Link
                            href={`/admin/dossiers/recommendations/${recommendation.id}`}
                            className="inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                          >
                            {recommendationActionLabel()}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {candidateIntakeItems.map((candidate) => (
                    <tr
                      key={candidate.id}
                      className="border-t border-border/70 align-top"
                    >
                      <td className="py-3 pr-3 font-semibold text-foreground">
                        {candidate.name}
                      </td>
                      <td className="py-3 pr-3">
                        {candidate.whyNow ||
                          candidate.reason ||
                          candidateProvenance(candidate)}
                      </td>
                      <td className="py-3 pr-3">
                        {candidate.confidence ?? candidate.tier} / score{" "}
                        {candidate.score}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusPill>
                          {identityBadgeForCandidate(candidate)}
                        </StatusPill>
                      </td>
                      <td className="py-3 pr-3">
                        Promote to Source File or archive from the detail page.
                      </td>
                      <td className="py-3 pr-3">
                        <Link
                          href={`/admin/dossiers/candidates/${candidate.id}`}
                          className="inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                        >
                          {candidateActionLabel()}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          eyebrow="Dossier Updates"
          title="Dossier Updates"
          aside={
            <StatusPill>
              {existingDossierUpdates.length +
                activeDossierUpdateRecommendations.length}{" "}
              updates
            </StatusPill>
          }
        >
          {existingDossierUpdates.length +
            activeDossierUpdateRecommendations.length ===
          0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No existing dossier updates are waiting.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground">
                  <tr>
                    <th className="py-2 pr-3">
                      Subject / public dossier target
                    </th>
                    <th className="py-2 pr-3">Update subject</th>
                    <th className="py-2 pr-3">Why this update matters</th>
                    <th className="py-2 pr-3">Match confidence</th>
                    <th className="py-2 pr-3">Identity status</th>
                    <th className="py-2 pr-3">Suggested next step</th>
                    <th className="py-2 pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDossierUpdateRecommendations.map((recommendation) => {
                    const matchState = recommendationMatchState(recommendation);
                    const targetCandidate = recommendation.targetCandidateId
                      ? candidates.find(
                          (candidate) =>
                            candidate.id === recommendation.targetCandidateId,
                        )
                      : null;
                    return (
                      <tr
                        key={recommendation.id}
                        className="border-t border-border/70 align-top"
                      >
                        <td className="py-3 pr-3 font-semibold text-foreground">
                          {targetCandidate?.name ??
                            recommendation.targetDossierId ??
                            recommendation.subjectName}
                        </td>
                        <td className="py-3 pr-3">
                          {recommendation.subjectName}
                        </td>
                        <td className="py-3 pr-3">
                          {recommendation.reason ||
                            recommendation.evidenceSummary ||
                            recommendationProvenance(recommendation)}
                        </td>
                        <td className="py-3 pr-3">
                          {recommendation.confidence ?? "needs review"}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusPill>
                            {identityBadgeForRecommendation(
                              recommendation,
                              matchState,
                            )}
                          </StatusPill>
                        </td>
                        <td className="py-3 pr-3">
                          {recommendation.suggestedAction ||
                            "Review update details before attaching anywhere public."}
                        </td>
                        <td className="py-3 pr-3">
                          <Link
                            href={`/admin/dossiers/recommendations/${recommendation.id}`}
                            className="inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                          >
                            {dossierUpdateActionLabel()}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {existingDossierUpdates.map((candidate) => (
                    <tr
                      key={candidate.id}
                      className="border-t border-border/70 align-top"
                    >
                      <td className="py-3 pr-3 font-semibold text-foreground">
                        {candidate.existingDossierMatch?.name ?? candidate.name}
                      </td>
                      <td className="py-3 pr-3">{candidate.name}</td>
                      <td className="py-3 pr-3">
                        {candidate.whyNow ||
                          candidate.reason ||
                          firstListValue(candidate.knownFacts)}
                      </td>
                      <td className="py-3 pr-3">
                        {candidate.existingDossierMatch?.confidence ??
                          candidate.confidence ??
                          "needs review"}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusPill>
                          {candidate.existingDossierMatch
                            ? identityBadgeForCandidate(candidate)
                            : "Identity: Needs Confirmation"}
                        </StatusPill>
                      </td>
                      <td className="py-3 pr-3">
                        Review update details before attaching anywhere public.
                      </td>
                      <td className="py-3 pr-3">
                        <Link
                          href={`/admin/dossiers/candidates/${candidate.id}`}
                          className="inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                        >
                          {dossierUpdateActionLabel()}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          eyebrow="Source Files"
          title="Source Files"
          aside={<StatusPill>{activeCandidates.length} active</StatusPill>}
        >
          {activeCandidates.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No active Source Files need review.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground">
                  <tr>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">
                      Why they matter / engagement summary
                    </th>
                    <th className="py-2 pr-3">Source strength</th>
                    <th className="py-2 pr-3">Missing info</th>
                    <th className="py-2 pr-3">Dossier status</th>
                    <th className="py-2 pr-3">Identity status</th>
                    <th className="py-2 pr-3">Last updated</th>
                    <th className="py-2 pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCandidates.map((candidate) => {
                    const draft = linkedActiveDraftFor(candidate, drafts);
                    const createdDraftId =
                      createdDraftIdByCandidate[candidate.id];
                    const openDraftId = draft?.id ?? createdDraftId;
                    const metrics = sourceFileMetrics.get(candidate.id);
                    const dossierStatus = dossierStatusForCandidate(
                      candidate,
                      draft,
                    );
                    const actionLabel = sourceFileActionLabel();
                    const actionHref = `/admin/dossiers/candidates/${candidate.id}`;
                    return (
                      <tr
                        key={candidate.id}
                        className="border-t border-border/70 align-top"
                      >
                        <td className="py-3 pr-3 font-semibold text-foreground">
                          {candidate.name}
                        </td>
                        <td className="py-3 pr-3">
                          {candidate.sourceFileSummary?.summaryText ||
                            candidate.evidenceSummary ||
                            candidate.reason ||
                            "—"}
                        </td>
                        <td className="py-3 pr-3">
                          {metrics?.sourceDepth ??
                            candidate.confidence ??
                            "Low"}
                        </td>
                        <td className="py-3 pr-3">
                          {(candidate.missingInfo ?? []).length > 0
                            ? candidate.missingInfo?.join("; ")
                            : "—"}
                        </td>
                        <td className="py-3 pr-3">{dossierStatus}</td>
                        <td className="py-3 pr-3">
                          <StatusPill>
                            {identityBadgeForCandidate(candidate)}
                          </StatusPill>
                        </td>
                        <td className="py-3 pr-3">
                          {formatDate(candidate.updatedAt)}
                        </td>
                        <td className="py-3 pr-3">
                          <Link
                            href={actionHref}
                            className="inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                          >
                            {actionLabel}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <details className="border border-border bg-surface/70 p-5">
          <summary className="cursor-pointer text-xl font-bold text-foreground">
            Archive / Dismissed / Trash
          </summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted">
            <p className="border border-border/70 bg-background/20 p-4">
              {archivedCandidates.length} archived Source File records.
            </p>
            <p className="border border-border/70 bg-background/20 p-4">
              {terminalRecommendations.length} dismissed or archived signals.
            </p>
            <p className="border border-border/70 bg-background/20 p-4">
              {closedCandidates.length + closedDrafts.length} closed or merged
              records.
            </p>
          </div>
          {archivedCandidates.length > 0 && (
            <div className="mt-4 space-y-2 text-sm text-muted">
              {archivedCandidates.slice(0, 8).map((candidate) => (
                <article
                  key={candidate.id}
                  className="border border-border/70 bg-background/20 p-3"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">
                        {candidate.name}
                      </p>
                      <p>Status: {candidate.status}</p>
                    </div>
                    <Link
                      href={`/admin/dossiers/candidates/${candidate.id}`}
                      className="inline-flex border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent"
                    >
                      {archiveActionLabel()}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          {terminalRecommendations.length > 0 && (
            <div className="mt-4 space-y-2 text-sm text-muted">
              {terminalRecommendations.slice(0, 8).map((recommendation) => (
                <article
                  key={recommendation.id}
                  className="border border-border/70 bg-background/20 p-3"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">
                        {recommendation.subjectName}
                      </p>
                      <p>Status: {recommendation.status}</p>
                    </div>
                    <Link
                      href={`/admin/dossiers/recommendations/${recommendation.id}`}
                      className="inline-flex border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent"
                    >
                      {archiveActionLabel()}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </details>

        <div className="flex justify-center pt-4">
          <Link
            href="/admin/dossiers/owner-review"
            className="border border-accent px-6 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all"
          >
            Owner Review
          </Link>
        </div>
      </section>
    </main>
  );
}
