"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
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

type ManualCandidateForm = {
  name: string;
  candidateType: DossierCandidate["candidateType"];
  reason: string;
  whyNow: string;
  evidenceSummary: string;
  recommendedCategory: string;
};

const emptyForm: ManualCandidateForm = {
  name: "",
  candidateType: "unknown",
  reason: "",
  whyNow: "",
  evidenceSummary: "",
  recommendedCategory: "",
};

const candidateTypes: DossierCandidate["candidateType"][] = [
  "artist",
  "community_member",
  "entity",
  "production",
  "interface",
  "sponsor",
  "story_arc",
  "unknown",
];
const categoryOptions = [
  "",
  "Entity",
  "Personnel",
  "Sponsor",
  "Interface",
  "Production",
];
const activeCandidateStatuses = new Set<DossierCandidate["status"]>([
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

function candidateName(
  candidateId: string | undefined,
  candidates: DossierCandidate[],
) {
  if (!candidateId) return "master retained";
  return (
    candidates.find((candidate) => candidate.id === candidateId)?.name ??
    candidateId
  );
}

function draftName(draftId: string | undefined, drafts: DossierDraft[]) {
  if (!draftId) return "master retained";
  return drafts.find((draft) => draft.id === draftId)?.fields.name ?? draftId;
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border bg-background/40 px-2 py-1 text-[0.65rem] uppercase tracking-widest text-muted">
      {children}
    </span>
  );
}

const dossierPhases = [
  "Phase 1 — BNL Source File",
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
        Phase 1 collects what BNL knows and what admins add. Phase 2 builds or
        revises the proposed dossier with future BNL edit chat. Phase 3 is the
        final admin draft confirmation. Phase 4 is owner final pass. Phase 5 is
        approved / publish later and is not active yet.
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
  const [form, setForm] = useState<ManualCandidateForm>(emptyForm);
  const [recommendationForm, setRecommendationForm] =
    useState<ManualRecommendationForm>(emptyRecommendationForm);
  const [createdDraftIdByCandidate, setCreatedDraftIdByCandidate] = useState<
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
  const activeRecommendations = recommendations.filter((recommendation) =>
    ["new", "reviewing"].includes(recommendation.status),
  );
  const terminalRecommendations = recommendations.filter((recommendation) =>
    [
      "attached_to_source_file",
      "converted_to_source_file",
      "ignored",
      "dismissed",
    ].includes(recommendation.status),
  );
  const activeCandidates = candidates.filter((candidate) =>
    activeCandidateStatuses.has(candidate.status),
  );
  const closedCandidates = candidates.filter(
    (candidate) =>
      candidate.status === "denied" || candidate.status === "merged",
  );
  const draftsInProgress = drafts.filter((draft) => isDraftActive(draft));
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

  async function submitManualCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = await postWorkflow({
        action: "createManualCandidate",
        input: {
          name: form.name,
          candidateType: form.candidateType,
          reason: form.reason,
          whyNow: form.whyNow,
          evidenceSummary: form.evidenceSummary,
          recommendedCategory: form.recommendedCategory || undefined,
        },
      });
      setForm(emptyForm);
      setNotice(
        `Manual candidate created: ${data.candidate?.name ?? "candidate"}. No BNL invocation, publishing, tag creation, or public database mutation occurred.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to create manual candidate.",
      );
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
        `Recommendation created: ${data.recommendation?.subjectName ?? "recommendation"}. Recommendations do not publish anything.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to create recommendation.",
      );
    }
  }

  async function updateRecommendation(
    recommendationId: string,
    action:
      | "convertRecommendationToCandidate"
      | "ignoreDossierRecommendation"
      | "dismissDossierRecommendation",
  ) {
    try {
      const data = await postWorkflow({ action, recommendationId });
      const label = data.recommendation?.subjectName ?? "Recommendation";
      setNotice(
        `${label} updated. No draft, publishing, tag creation, or public content write occurred.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to update recommendation.",
      );
    }
  }

  async function attachRecommendationToMatchedSourceFile(
    recommendation: DossierRecommendation,
  ) {
    const match = matchDossierRecommendationSubject({ recommendation, candidates });
    if (!match.exactCandidateId) {
      setNotice(
        "Attach is only available after a same-subject BNL Source File match is confirmed.",
      );
      return;
    }
    try {
      const data = await postWorkflow({
        action: "attachRecommendationToCandidate",
        recommendationId: recommendation.id,
        candidateId: match.exactCandidateId,
        createSourceNote: true,
      });
      setNotice(
        `${data.recommendation?.subjectName ?? "Recommendation"} attached to the matched same-subject BNL Source File. No draft was created.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to attach recommendation.",
      );
    }
  }

  function recommendationMatchState(recommendation: DossierRecommendation) {
    const match = matchDossierRecommendationSubject({ recommendation, candidates });
    if (match.exactMatchKind === "pre_targeted") {
      return {
        match,
        state: "Pre-targeted BNL Source File",
        nextAction: "Attach to Matched Source File",
      };
    }
    if (match.exactCandidateId) {
      return {
        match,
        state: "Matched existing BNL Source File",
        nextAction: "Attach to Matched Source File",
      };
    }
    if (match.possibleCandidateIds.length > 0) {
      return {
        match,
        state: "Possible duplicate / identity warning",
        nextAction: "Needs owner identity review",
      };
    }
    return {
      match,
      state: "No BNL Source File match",
      nextAction: "Convert to New BNL Source File",
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
        `${data.candidate?.name ?? "Candidate"} updated. Workflow records remain internal only.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to update candidate.",
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
            Dashboard traffic control for the question: What needs attention
            next? Candidate review, draft editing, owner review, and merge
            comparison now live in dedicated workflow lanes.
          </p>
          <p className="text-sm text-muted mt-2 max-w-3xl">
            BNL generation comes later. Future BNL full-dossier drafting should
            land in the dedicated draft editor with complete fields, approved
            source packets, duplicate/merge history, style guidance, and strict
            no-invention rules.
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-muted">
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">
              Active BNL Source Files
            </p>
            <p>
              {activeCandidates.length} active / {closedCandidates.length}{" "}
              closed
            </p>
          </div>
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">
              Proposed Dossiers
            </p>
            <p>
              {draftsInProgress.length} active / {closedDrafts.length} closed
            </p>
          </div>
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">
              Owner Review
            </p>
            <p>{ownerReviewDrafts.length} waiting</p>
          </div>
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">
              Workflow API
            </p>
            <p>
              {payload.workflow.status} / {payload.workflow.storage}
            </p>
          </div>
        </div>

        <PhaseRail />

        <DashboardCard
          eyebrow="Recommendation Inbox"
          title="Dossier Recommendation Inbox"
          aside={
            <StatusPill>{activeRecommendations.length} new / active</StatusPill>
          }
        >
          <p className="text-sm text-muted">
            BNL Recommendation / Evidence Cluster records preserve BNL/manual
            clues. A BNL Source File is one subject/entity source packet.
            Admins can convert unmatched recommendations into new source files
            or attach only when the system confirms a same-subject match.
            Recommendations do not publish anything.
          </p>
          <form
            onSubmit={submitManualRecommendation}
            className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs uppercase tracking-widest text-muted"
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
                Create Manual Recommendation
              </button>
            </div>
          </form>
          {activeRecommendations.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No active recommendations. Ignored and dismissed records remain
              preserved in history.
            </p>
          ) : (
            <div className="space-y-3">
              {activeRecommendations.map((recommendation) => {
                const matchState = recommendationMatchState(recommendation);
                const exactCandidate = matchState.match.exactCandidateId
                  ? candidates.find(
                      (candidate) => candidate.id === matchState.match.exactCandidateId,
                    )
                  : null;
                const possibleCandidates = matchState.match.possibleCandidateIds
                  .map((candidateId) =>
                    candidates.find((candidate) => candidate.id === candidateId),
                  )
                  .filter((candidate): candidate is DossierCandidate => Boolean(candidate));
                return (
                <article
                  key={recommendation.id}
                  className="border border-border/70 bg-background/20 p-4 text-sm text-muted"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <p className="font-bold text-foreground">
                        {recommendation.subjectName}
                      </p>
                      <p>
                        Type:{" "}
                        {recommendation.type === "new_subject"
                          ? "New Subject"
                          : "Modify Existing Dossier"}
                      </p>
                      <p>Confidence: {recommendation.confidence ?? "—"}</p>
                      <p>
                        Source lanes: {recommendation.sourceLanes.join(", ")}
                      </p>
                      <p>Status: {recommendation.status}</p>
                      <p>Match state: {matchState.state}</p>
                      <p>Recommended next action: {matchState.nextAction}</p>
                      {exactCandidate && (
                        <>
                          <p>Matched subject packet: {exactCandidate.name}</p>
                          {matchState.match.exactMatchKind ===
                            "pre_targeted" && (
                            <p>
                              This recommendation already points to an existing
                              source file.
                            </p>
                          )}
                        </>
                      )}
                      {possibleCandidates.length > 0 && (
                        <p>
                          Possible matches need owner identity review: {" "}
                          {possibleCandidates.map((candidate) => candidate.name).join(", ")}
                        </p>
                      )}
                      <p>Reason: {recommendation.reason}</p>
                    </div>
                    <div className="flex max-w-sm flex-col gap-2">
                      <Link
                        href={`/admin/dossiers/recommendations/${recommendation.id}`}
                        className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                      >
                        Review Recommendation
                      </Link>
                      {matchState.match.exactCandidateId ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void attachRecommendationToMatchedSourceFile(
                              recommendation,
                            )
                          }
                          className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Attach to Matched Source File
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void updateRecommendation(
                              recommendation.id,
                              "convertRecommendationToCandidate",
                            )
                          }
                          className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Convert to New BNL Source File
                        </button>
                      )}
                      {matchState.match.possibleCandidateIds.length > 0 && (
                        <p className="border border-accent/60 bg-accent/10 p-2 text-xs text-accent">
                          Needs owner identity review before any merge or attach.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void updateRecommendation(
                              recommendation.id,
                              "ignoreDossierRecommendation",
                            )
                          }
                          className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Ignore
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void updateRecommendation(
                              recommendation.id,
                              "dismissDossierRecommendation",
                            )
                          }
                          className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          )}

          {terminalRecommendations.length > 0 && (
            <details className="border border-border/70 bg-background/20 p-4 text-sm text-muted">
              <summary className="cursor-pointer font-bold text-foreground">
                Recommendation History — converted / attached / ignored /
                dismissed
              </summary>
              <div className="mt-3 space-y-2">
                {terminalRecommendations.slice(0, 12).map((recommendation) => (
                  <article
                    key={recommendation.id}
                    className="border border-border/70 bg-background/30 p-3"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {recommendation.subjectName}
                        </p>
                        <p>Status: {recommendation.status}</p>
                        <p>Reason: {recommendation.reason}</p>
                        <p className="text-xs uppercase tracking-widest text-muted">
                          Closed recommendation; no active action buttons.
                        </p>
                      </div>
                      <Link
                        href={`/admin/dossiers/recommendations/${recommendation.id}`}
                        className="border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent"
                      >
                        Review Closed Recommendation
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}
        </DashboardCard>

        <DashboardCard
          eyebrow="Manual fallback"
          title="Quick Candidate Intake"
          aside={<StatusPill>Manual fallback / quick seed</StatusPill>}
        >
          <p className="text-sm text-muted">
            Manual fallback / quick seed. Use this when BNL has not suggested a
            candidate yet or when an operator needs to seed one directly. Main
            BNL-led workbench comes later. This does not publish, invoke BNL,
            create tags, or mutate the public database.
          </p>
          <form
            onSubmit={submitManualCandidate}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 text-xs uppercase tracking-widest text-muted"
          >
            <label className="space-y-2 xl:col-span-2">
              <span>Name</span>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                className={textInputClass()}
              />
            </label>
            <label className="space-y-2">
              <span>Type</span>
              <select
                value={form.candidateType}
                onChange={(event) =>
                  setForm({
                    ...form,
                    candidateType: event.target
                      .value as DossierCandidate["candidateType"],
                  })
                }
                className={textInputClass()}
              >
                {candidateTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span>Recommended category</span>
              <select
                value={form.recommendedCategory}
                onChange={(event) =>
                  setForm({ ...form, recommendedCategory: event.target.value })
                }
                className={textInputClass()}
              >
                {categoryOptions.map((value) => (
                  <option key={value} value={value}>
                    {value || "No recommendation"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 xl:col-span-2">
              <span>Reason</span>
              <input
                required
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
                }
                className={textInputClass()}
              />
            </label>
            <label className="space-y-2 xl:col-span-3">
              <span>Why now</span>
              <textarea
                value={form.whyNow}
                onChange={(event) =>
                  setForm({ ...form, whyNow: event.target.value })
                }
                className={`${textInputClass()} min-h-20`}
              />
            </label>
            <label className="space-y-2 xl:col-span-3">
              <span>Evidence summary</span>
              <textarea
                value={form.evidenceSummary}
                onChange={(event) =>
                  setForm({ ...form, evidenceSummary: event.target.value })
                }
                className={`${textInputClass()} min-h-20`}
              />
            </label>
            <div className="xl:col-span-6">
              <button
                type="submit"
                disabled={saving}
                className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
              >
                Create Manual Candidate
              </button>
            </div>
          </form>
        </DashboardCard>

        <DashboardCard
          eyebrow="Coming next"
          title="BNL Dossier Workbench — Coming Next"
          aside={<StatusPill>future BNL-led flow</StatusPill>}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-muted">
            <div className="border border-border/70 bg-background/20 p-4 space-y-2">
              <p className="font-bold text-foreground">
                Prompt-based dossier drafting comes next.
              </p>
              <p>Mods/admins will guide BNL in plain language.</p>
              <p>
                BNL will use the source file and approved sources to build a
                complete dossier draft. BNL will generate complete dossier
                drafts from source files, not starter notes.
              </p>
              <p>BNL will ask only for missing decisions.</p>
              <p>
                Manual editing remains available. Manual fields are
                fallback/advanced. Manual fields are fallback only.
              </p>
            </div>
            <div className="border border-border/70 bg-background/20 p-4 space-y-2">
              <p className="font-bold text-foreground">
                Intended future BNL-led workflow
              </p>
              <p>
                Admin selects or creates a candidate, gives BNL a loose
                instruction, BNL gathers the approved source packet, drafts
                complete dossier fields, admin asks for revisions or edits
                manually, then submits to Owner Review.
              </p>
              <p>
                Owner opens the submitted draft, can prompt BNL for final
                changes, edit manually, approve, send back, deny, or request
                more info. Approval still does not publish until publishing
                workflow exists.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted">
            Future source packet: website read model, dossier taxonomy guide,
            authoring guide, tag registry, selected candidate facts,
            queue/public show context, R&amp;D/operator-approved notes,
            Discord-safe/mod-approved context, duplicate/merge history, and
            existing dossier style profile. Future output includes a complete
            proposed dossier, tags, taxonomy, warnings, missing info questions,
            and public-safety caveats. BNL must not invent facts, must preserve
            tone/style, must keep community-owned identities separate from
            BARCODE-controlled characters, and must treat AI/human/unknown as
            tags/traits.
          </p>
        </DashboardCard>

        <DashboardCard
          eyebrow="Lane 1"
          title="Active BNL Source Files"
          aside={
            <StatusPill>{activeCandidates.length} active records</StatusPill>
          }
        >
          {activeCandidates.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No active candidate records need review.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground">
                  <tr>
                    <th className="py-2 pr-3">BNL Source File</th>
                    <th className="py-2 pr-3">Current phase</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Next recommended action</th>
                    <th className="py-2 pr-3">Duplicate Risk</th>
                    <th className="py-2 pr-3">Updated</th>
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
                    const currentPhase = openDraftId
                      ? "Phase 2 — Proposed Dossier + BNL Edit Chat"
                      : "Phase 1 — BNL Source File";
                    const nextAction = openDraftId
                      ? "Open proposed dossier"
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
                          <StatusPill>{currentPhase}</StatusPill>
                        </td>
                        <td className="py-3 pr-3">
                          <StatusPill>{candidate.status}</StatusPill>
                        </td>
                        <td className="py-3 pr-3">
                          {nextAction}
                          {openDraftId && (
                            <p className="text-xs text-muted">
                              Active draft already exists.
                            </p>
                          )}
                          {isCandidateClosed(candidate) && (
                            <p className="text-xs text-accent">
                              Source file was merged or closed.
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {candidate.duplicateRisk ?? "none"}
                        </td>
                        <td className="py-3 pr-3">
                          {formatDate(candidate.updatedAt)}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-2">
                            {openDraftId ? (
                              <Link
                                href={`/admin/dossiers/drafts/${openDraftId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                              >
                                Open Proposed Dossier
                              </Link>
                            ) : (
                              <Link
                                href={`/admin/dossiers/candidates/${candidate.id}`}
                                className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                              >
                                Open Source File
                              </Link>
                            )}
                            <Link
                              href={`/admin/dossiers/candidates/${candidate.id}#add-info`}
                              className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent"
                            >
                              Add to Source File
                            </Link>
                            {!openDraftId && (
                              <button
                                type="button"
                                disabled={saving || !canCreateDraft}
                                onClick={() => void createDraft(candidate.id)}
                                className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                                title={
                                  canCreateDraft
                                    ? "Create proposed dossier from this BNL Source File."
                                    : "Active draft already exists or source file was merged/denied."
                                }
                              >
                                Create Proposed Dossier
                              </button>
                            )}
                            <button
                              type="button"
                              disabled
                              className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest opacity-50"
                              title="Owner action required for final dismissal; admins can add dismissal context from the BNL Source File."
                            >
                              Recommend Dismissal (owner later)
                            </button>
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
                              title={
                                candidate.status === "needs_more_evidence"
                                  ? "Already marked needs more info."
                                  : "Mark source file as needs more info."
                              }
                            >
                              Mark Needs Info
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DashboardCard
            eyebrow="Lane 2"
            title="Proposed Dossiers"
            aside={<StatusPill>{draftsInProgress.length} open</StatusPill>}
          >
            {draftsInProgress.length === 0 ? (
              <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
                No active proposed dossiers. Ready-for-owner-review drafts
                appear in Owner Review, not Proposed Dossiers.
              </p>
            ) : (
              <div className="space-y-3">
                {draftsInProgress.map((draft) => {
                  const candidate = candidates.find(
                    (item) => item.id === draft.candidateId,
                  );
                  return (
                    <article
                      key={draft.id}
                      className="border border-border/70 bg-background/20 p-4 text-sm text-muted"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-bold text-foreground">
                            {draft.fields.name}
                          </p>
                          <p>
                            Linked candidate:{" "}
                            {candidate?.name ?? draft.candidateId}
                          </p>
                          <p>Status: {draft.status}</p>
                          <p>Updated: {formatDate(draft.updatedAt)}</p>
                        </div>
                        <Link
                          href={`/admin/dossiers/drafts/${draft.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                        >
                          Open Proposed Dossier
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            eyebrow="Lane 3"
            title="Final Admin Drafts"
            aside={<StatusPill>confirm before owner</StatusPill>}
          >
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              Final Admin Draft is the confirmation step after Phase 2. Review
              Final Draft appears inside the Proposed Dossier page before Send
              to Owner Review; no separate stored status exists yet.
            </p>
          </DashboardCard>

          <DashboardCard
            eyebrow="Lane 4"
            title="Owner Review"
            aside={<StatusPill>{ownerReviewDrafts.length} waiting</StatusPill>}
          >
            <p className="text-sm text-muted">
              Admin/editor submits a workflow draft here for owner focus. Owner
              gate/secret comes later and owner approval still will not publish
              until publishing exists.
            </p>
            {ownerReviewDrafts.length === 0 ? (
              <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
                No drafts waiting for owner review.
              </p>
            ) : (
              <div className="space-y-3">
                {ownerReviewDrafts.map((draft) => {
                  const candidate = candidates.find(
                    (item) => item.id === draft.candidateId,
                  );
                  return (
                    <article
                      key={draft.id}
                      className="border border-border/70 bg-background/20 p-4 text-sm text-muted"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-bold text-foreground">
                            {draft.fields.name}
                          </p>
                          <p>
                            Linked candidate:{" "}
                            {candidate?.name ?? draft.candidateId}
                          </p>
                          <p>
                            Status: <StatusPill>Submitted</StatusPill>
                          </p>
                          <p>Phase: Phase 4 — Owner Review</p>
                          <p>Next: Waiting for owner</p>
                          <p>Updated: {formatDate(draft.updatedAt)}</p>
                        </div>
                        <Link
                          href={`/admin/dossiers/drafts/${draft.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                        >
                          View Submitted Draft
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <Link
              href="/admin/dossiers/owner-review"
              className="inline-flex border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent"
            >
              Open Owner Review
            </Link>
          </DashboardCard>
        </div>

        <DashboardCard
          eyebrow="Lane 5"
          title="Duplicate Warnings"
          aside={
            <StatusPill>
              {activeDuplicateGroups.length} active groups
            </StatusPill>
          }
        >
          <p className="text-sm text-muted">
            Possible duplicate source files detected. Duplicate warnings help
            prevent multiple source files for the same subject. Owner/lead merge
            review required. Regular admins can view the warning, add a note
            later, and open BNL Source Files; final merge is owner/lead cleanup,
            not normal mod work.
          </p>
          {activeDuplicateGroups.length === 0 ? (
            <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">
              No duplicate warnings need owner/lead review.
            </p>
          ) : (
            <div className="space-y-3">
              {activeDuplicateGroups.map((group) => (
                <article
                  key={group.id}
                  className="border border-border/70 bg-background/20 p-4 text-sm text-muted"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-bold text-foreground">
                        {group.names.join(" / ")}
                      </p>
                      <p>Risk: {group.risk}</p>
                      <p>
                        {group.candidateIds.length} candidates /{" "}
                        {group.draftIds.length} drafts
                      </p>
                      <p>Reason: {group.reason}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/dossiers/duplicates/${group.id}`}
                        className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                      >
                        View Warning / Open Merge Review
                      </Link>
                      <button
                        type="button"
                        disabled
                        className="border border-border px-3 py-2 text-xs uppercase tracking-widest opacity-50"
                      >
                        Add Note coming later
                      </button>
                      <span className="text-xs uppercase tracking-widest text-muted">
                        Open Source Files from warning page
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {resolvedDuplicateGroups.length > 0 && (
            <p className="text-xs text-muted">
              {resolvedDuplicateGroups.length} duplicate group(s) are already
              resolved or no longer have enough active candidates; see History
              below.
            </p>
          )}
        </DashboardCard>

        <details className="border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-bold text-foreground">
            Closed / History — Merged Candidates and Superseded Drafts
          </summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted">
            <div className="border border-border/70 bg-background/20 p-4">
              <p className="text-xs uppercase tracking-widest text-accent mb-2">
                Closed / History — Merged Candidates
              </p>
              <p>{closedCandidates.length} closed BNL Source File records.</p>
              {closedCandidates.slice(0, 8).map((candidate) => (
                <article
                  key={candidate.id}
                  className="mt-3 border-t border-border/60 pt-3"
                >
                  <p className="text-foreground font-semibold">
                    {candidate.name}
                  </p>
                  <p>Status: {candidate.status}</p>
                  {candidate.status === "merged" && (
                    <p>
                      mergedIntoCandidateId:{" "}
                      {candidate.mergedIntoCandidateId ?? "—"}
                    </p>
                  )}
                  {candidate.status === "merged" && (
                    <p>
                      Master candidate:{" "}
                      {candidate.mergedIntoCandidateId ? (
                        <Link
                          className="text-accent hover:underline"
                          href={`/admin/dossiers/candidates/${candidate.mergedIntoCandidateId}`}
                        >
                          {candidateName(
                            candidate.mergedIntoCandidateId,
                            candidates,
                          )}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </p>
                  )}
                  {candidate.status === "merged" && (
                    <p>mergedAt: {formatDate(candidate.mergedAt)}</p>
                  )}
                  <p className="text-xs uppercase tracking-widest text-muted">
                    No normal active action buttons
                  </p>
                </article>
              ))}
            </div>
            <div className="border border-border/70 bg-background/20 p-4">
              <p className="text-xs uppercase tracking-widest text-accent mb-2">
                Closed / History — Superseded Drafts
              </p>
              <p>{closedDrafts.length} closed proposed dossier records.</p>
              {closedDrafts.slice(0, 8).map((draft) => (
                <article
                  key={draft.id}
                  className="mt-3 border-t border-border/60 pt-3"
                >
                  <p className="text-foreground font-semibold">
                    {draft.fields.name}
                  </p>
                  <p>Status: {draft.status}</p>
                  {draft.status === "superseded" && (
                    <p>mergedIntoDraftId: {draft.mergedIntoDraftId ?? "—"}</p>
                  )}
                  {draft.status === "superseded" && (
                    <p>
                      Superseded by master draft:{" "}
                      {draft.mergedIntoDraftId ? (
                        <Link
                          className="text-accent hover:underline"
                          href={`/admin/dossiers/drafts/${draft.mergedIntoDraftId}`}
                        >
                          {draftName(draft.mergedIntoDraftId, drafts)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </p>
                  )}
                  <p className="text-xs uppercase tracking-widest text-muted">
                    Reference-only; no normal active edit button
                  </p>
                </article>
              ))}
            </div>
            <div className="border border-border/70 bg-background/20 p-4">
              <p className="text-xs uppercase tracking-widest text-accent mb-2">
                Resolved duplicate groups
              </p>
              <p>
                {resolvedDuplicateGroups.length} group(s) no longer have at
                least two active, non-merged candidates.
              </p>
            </div>
          </div>
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
            Dedicated pages keep operators in one lane: candidate review,
            focused draft editor, owner review, or merge review. Dashboard
            buttons navigate; there is no hidden editor below unrelated sections
            and no dashboard auto-scroll workflow.
          </p>
        </DashboardCard>
      </section>
    </main>
  );
}
