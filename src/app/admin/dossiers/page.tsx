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
    if (group.category === "signal_already_attached") return true;
    if (group.category === "existing_public_dossier_overlap") return true;
    if (group.category === "dossier_seed_likely_duplicate_of_case_file") return true;
    if (group.category === "dossier_seed_can_be_promoted") return true;
    if (group.category === "low_value_junk_test_extraction_candidate") return true;
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
  const duplicateAnalysisSummary = {
    total: activeDuplicateGroups.length,
    highConfidence: activeDuplicateGroups.filter((group) => group.risk === "high").length,
    identitySensitive: activeDuplicateGroups.filter(
      (group) => group.actionSafety === "identity_sensitive_recommendation",
    ).length,
    archiveCandidates: activeDuplicateGroups.filter(
      (group) =>
        group.actionSafety === "safe_cleanup_recommendation" ||
        (group.archiveCandidateIds?.length ?? 0) > 0 ||
        (group.archiveRecommendationIds?.length ?? 0) > 0,
    ).length,
  };
  const recordCompactorHref = activeDuplicateGroups[0]
    ? `/admin/dossiers/duplicates/${activeDuplicateGroups[0].id}`
    : "";
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
  const candidateDecisionItems = candidates.filter((candidate) =>
    ["suggested", "needs_review"].includes(candidate.status),
  );
  const candidateUpdateRows = [
    ...activeRecommendations.map((recommendation) => {
      const matchState = recommendationMatchState(recommendation);
      return {
        id: `recommendation-${recommendation.id}`,
        subject: recommendation.subjectName,
        type: "BNL Signal",
        why: recommendation.evidenceSummary || recommendation.reason,
        strength: recommendation.confidence ?? "Needs review",
        nextStep: matchState.nextAction,
        href: `/admin/dossiers/recommendations/${recommendation.id}`,
      };
    }),
    ...candidateIntakeItems.map((candidate) => ({
      id: `candidate-intake-${candidate.id}`,
      subject: candidate.name,
      type: "Dossier Seed",
      why: candidate.evidenceSummary || candidate.reason || candidate.whyNow,
      strength: `${candidate.tier} / ${candidate.score}`,
      nextStep: "Decide whether this deserves a Source File.",
      href: `/admin/dossiers/candidates/${candidate.id}`,
    })),
    ...candidateDecisionItems.map((candidate) => ({
      id: `candidate-decision-${candidate.id}`,
      subject: candidate.name,
      type: "Candidate Record",
      why: candidate.evidenceSummary || candidate.reason || candidate.whyNow,
      strength: `${candidate.tier} / ${candidate.score}`,
      nextStep: "Review identity, evidence, and source-file fit.",
      href: `/admin/dossiers/candidates/${candidate.id}`,
    })),
    ...existingDossierUpdates.map((candidate) => ({
      id: `dossier-update-${candidate.id}`,
      subject: candidate.existingDossierMatch?.name ?? candidate.name,
      type: "Dossier Update",
      why: candidate.evidenceSummary || candidate.reason || "New information may belong on an existing public dossier.",
      strength: candidate.existingDossierMatch?.confidence ?? candidate.confidence ?? "Needs review",
      nextStep: "Review update material before any public edit.",
      href: `/admin/dossiers/candidates/${candidate.id}`,
    })),
    ...activeDuplicateGroups
      .filter((group) => group.category === "identity_link_review_needed")
      .map((group) => ({
        id: `identity-link-${group.id}`,
        subject: group.names.join(" / "),
        type: "Identity Link",
        why: group.reason,
        strength: group.risk,
        nextStep: "Decide whether the identity relationship is real.",
        href: `/admin/dossiers/duplicates/${group.id}`,
      })),
  ];
  const sourceFileCandidates = candidates.filter((candidate) =>
    [
      "active_source_file",
      "selected",
      "draft_requested",
      "draft_ready",
      "needs_revision",
      "needs_more_evidence",
      "approved",
    ].includes(candidate.status),
  );

  function dossierStatusForSourceFile(candidate: DossierCandidate) {
    const candidateDrafts = drafts.filter((draft) => draft.candidateId === candidate.id);
    const draft = candidateDrafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const metrics = sourceFileMetrics.get(candidate.id);
    if (!draft) return "No Proposed Dossier";
    if (draft.status === "ready_for_owner_review") return "Ready for Owner Review";
    if (draft.status === "owner_changes_requested") return "Owner changes requested";
    if (draft.status === "owner_approved") return "Approved / publish later";
    if ((metrics?.unappliedSourceNotesCount ?? 0) > 0) {
      return "Needs update from Source File";
    }
    return "Draft started";
  }

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
            Use this page to sort subjects, decide what deserves a Source File, work active Source Files, and move important community subjects toward proposed dossiers. Candidates / Updates and Source Files are the central work areas.
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted">
          {[
            ["Candidates / Updates", candidateUpdateRows.length],
            ["Source Files", sourceFileCandidates.length],
          ].map(([label, value]) => (
            <div key={label} className="border border-border bg-surface p-4">
              <p className="uppercase tracking-[0.35em] text-accent mb-2">
                {label}
              </p>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <DashboardCard
          eyebrow="Main work area"
          title="Candidates / Updates"
          aside={<StatusPill>{candidateUpdateRows.length} items</StatusPill>}
        >
          <p className="text-sm text-muted">
            Sort BNL Signals, Dossier Seeds, Dossier Updates, Identity Link questions, and incomplete candidate records into the right next step.
          </p>
          {candidateUpdateRows.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No candidate or update decisions are waiting.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground">
                  <tr>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Why BNL thinks this matters</th>
                    <th className="py-2 pr-3">Strength / confidence</th>
                    <th className="py-2 pr-3">Suggested next step</th>
                    <th className="py-2 pr-3">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateUpdateRows.slice(0, 30).map((item) => (
                    <tr key={item.id} className="border-t border-border/70 align-top">
                      <td className="py-3 pr-3 font-semibold text-foreground">
                        {item.subject}
                      </td>
                      <td className="py-3 pr-3">{item.type}</td>
                      <td className="py-3 pr-3">{item.why || "—"}</td>
                      <td className="py-3 pr-3">{item.strength}</td>
                      <td className="py-3 pr-3">{item.nextStep}</td>
                      <td className="py-3 pr-3">
                        <Link
                          href={item.href}
                          className="inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details className="border border-border/70 bg-background/20 p-4">
            <summary className="cursor-pointer text-sm font-bold text-foreground">
              Manual Signal
            </summary>
            <p className="mt-3 text-sm text-muted">
              Use this only when BNL has not suggested something yet. This creates a BNL Signal, not a direct Source File.
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
        </DashboardCard>

        <DashboardCard
          eyebrow="Main work area"
          title="Source Files"
          aside={<StatusPill>{sourceFileCandidates.length} source files</StatusPill>}
        >
          <p className="text-sm text-muted">
            Work active Case Files / BNL Source Files, apply new BNL updates, fill missing information, and move important subjects toward proposed dossiers.
          </p>
          {sourceFileCandidates.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No Source Files are active yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground">
                  <tr>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Why they matter / engagement summary</th>
                    <th className="py-2 pr-3">Source strength</th>
                    <th className="py-2 pr-3">Missing info</th>
                    <th className="py-2 pr-3">Dossier status</th>
                    <th className="py-2 pr-3">Last updated</th>
                    <th className="py-2 pr-3">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceFileCandidates.map((candidate) => {
                    const metrics = sourceFileMetrics.get(candidate.id);
                    const dossierStatus = dossierStatusForSourceFile(candidate);
                    const missingInfoCount = (candidate.missingInfo ?? []).length;
                    return (
                      <tr key={candidate.id} className="border-t border-border/70 align-top">
                        <td className="py-3 pr-3 font-semibold text-foreground">
                          {candidate.name}
                        </td>
                        <td className="py-3 pr-3">
                          {candidate.sourceFileSummary?.summaryText || candidate.evidenceSummary || candidate.reason || "—"}
                        </td>
                        <td className="py-3 pr-3">
                          {metrics?.sourceDepth ?? "Low"}
                        </td>
                        <td className="py-3 pr-3">
                          {missingInfoCount > 0 ? `${missingInfoCount} open item(s)` : "None listed"}
                        </td>
                        <td className="py-3 pr-3">{dossierStatus}</td>
                        <td className="py-3 pr-3">{formatDate(candidate.updatedAt)}</td>
                        <td className="py-3 pr-3">
                          <Link
                            href={`/admin/dossiers/candidates/${candidate.id}`}
                            className="inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                          >
                            Open
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

        <footer className="border border-border bg-surface p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-xs uppercase tracking-widest">
            <Link
              href="/admin/dossiers/owner-review"
              className="inline-flex justify-center border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background"
            >
              Owner Review · {ownerReviewDrafts.length} waiting
            </Link>
            {recordCompactorHref ? (
              <Link
                href={recordCompactorHref}
                className="inline-flex justify-center border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
              >
                Cleanup / Maintenance: {duplicateAnalysisSummary.total} possible overlaps · {duplicateAnalysisSummary.identitySensitive} identity-sensitive
              </Link>
            ) : (
              <span className="inline-flex justify-center border border-border px-4 py-2 text-muted opacity-70">
                Cleanup / Maintenance: 0 possible overlaps · 0 identity-sensitive
              </span>
            )}
            <details className="border border-border px-4 py-2 text-muted">
              <summary className="cursor-pointer list-none">
                Archive / History · {closedHistoryCount}
              </summary>
              <div className="mt-3 normal-case tracking-normal text-sm text-muted space-y-1">
                <p>{archivedCandidates.length} archived internal records.</p>
                <p>{closedCandidates.length} closed Source File records.</p>
                <p>{closedDrafts.length} closed proposed dossier records.</p>
                <p>{terminalRecommendations.length} closed BNL Signals.</p>
              </div>
            </details>
          </div>
        </footer>
      </section>
    </main>
  );
}
