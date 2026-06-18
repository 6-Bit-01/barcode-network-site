"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createDossierSourceFileDraftReadinessReadModel,
  createDossierPopulationAudit,
  createDossierPopulationMethodAudit,
  getDossierSourceFileMetrics,
  isConsolidationResolvedCandidate,
  isDiagnosticTestArtifactCandidate,
  isDiagnosticTestArtifactRecommendation,
  isResolvedDossierRecommendation,
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
  consolidation?: SubjectConsolidationResult;
  populationReconcile?: PopulationReconcileSummary;
};

type SubjectConsolidationIssue = { groupId?: string; subject: string; reason: string };

type SubjectConsolidationResult = {
  statusLabel: "Subject Consolidation Complete";
  attachedRecommendations: number;
  emptyDuplicatesCleaned: number;
  duplicateRecommendationsCleaned: number;
  dossierUpdateWorkspacesCreated: number;
  bundledPublicDossierUpdateSignals: number;
  diagnosticArtifactsArchived: number;
  sourceFilesCreated: number;
  sourceFileDuplicatesMerged: number;
  bnlRefreshes: Array<{ candidateId: string; subjectName: string; status: string; requestId?: string; reason?: string }>;
  needsReview: number;
  blocked: number;
  skippedItems: SubjectConsolidationIssue[];
  blockedItems: SubjectConsolidationIssue[];
  affectedTargets: Array<{ candidateId: string; name: string; href: string }>;
  publicPagesPublished: 0;
  publicDossierTextChanged: 0;
  internalAliasesExposed: 0;
};

type PopulationReconcileSummary = {
  signalsReviewed: number;
  attachedToSourceFiles: number;
  attachedToDossierUpdates: number;
  attachedToCandidateIntake: number;
  attachedToExistingRecommendations: number;
  markedAlreadyRepresented: number;
  markedNoNewInfo: number;
  createdDossierUpdateWorkspaces: number;
  createdSourceFileCandidates: number;
  unresolvedNeedsReview: number;
  duplicatesCollapsed: number;
  evidenceRefsMerged: number;
  publicPagesPublished: 0;
  publicDossierTextChanged: 0;
  internalAliasesExposed: 0;
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

  if (candidate.identityReviewStatus === "needs_confirmation") {
    return candidate.possibleMatchCandidateIds?.length
      ? `Possible match to ${candidate.possibleMatchCandidateIds.length} subject${
          candidate.possibleMatchCandidateIds.length === 1 ? "" : "s"
        }`
      : "Identity: Needs Confirmation";
  }
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
  if (recommendation.identityReviewStatus === "needs_confirmation") {
    return recommendation.possibleMatchCandidateIds?.length
      ? `Possible match to ${recommendation.possibleMatchCandidateIds.length} subject${
          recommendation.possibleMatchCandidateIds.length === 1 ? "" : "s"
        }`
      : "Identity: Needs Confirmation";
  }
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

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const genericWhyItMattersPatterns = [
  /review source context and decide whether to attach or convert into a bnl source file/i,
  /review update details before attaching anywhere public/i,
  /review(?: the)? (?:candidate|record|signal|source file|details|context)\b/i,
  /needs one admin decision because no deterministic destination was found/i,
  /no action needed|filed automatically|already represented/i,
  /admin(?:-| )only|diagnostic|debug|maintenance|workflow state|intake map/i,
  /publishes? 0 public pages|changes? 0 public dossier text|exposes? 0 internal aliases|raw\/private evidence/i,
  /private evidence refs?|raw evidence refs?|evidence refs? preserved internally/i,
  /source of recommendation|last updated|generatedat|copy record ids/i,
  /candidate intake|needs population review|dossier update workspace|source file refresh|archive diagnostic artifact/i,
  /missing info|confidence unset|status:|destination:/i,
];

function looksLikeRawStructuredText(value: string) {
  const trimmed = value.trim();
  if (/^[\[{]/.test(trimmed) || /[}\]]$/.test(trimmed)) return true;
  if (/^\{?[\"']?[\w-]+[\"']?\s*[:=]/.test(trimmed)) return true;
  if (/\b(rawEvidenceRefs?|evidenceRefs?|sourcePackage|relationship[_-]journal|private_admin|internal_controlled)\b/i.test(trimmed)) return true;
  if (/^(ref|evidence|raw)[:#_-]/i.test(trimmed)) return true;
  return false;
}

function isPlainUsefulSummary(value: string) {
  if (!value) return false;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 12) return false;
  if (looksLikeRawStructuredText(normalized)) return false;
  if (genericWhyItMattersPatterns.some((pattern) => pattern.test(normalized))) return false;
  if (/^(needs (review|more info|more evidence)|admin review|required|unknown|n\/a|none|—)$/i.test(normalized)) return false;
  const words = normalized.toLowerCase().split(/\W+/).filter(Boolean);
  if (words.length >= 6 && new Set(words).size <= Math.ceil(words.length / 3)) return false;
  return true;
}

function compactUsefulSummary(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) return normalized;
  return `${normalized.slice(0, 217).trim()}…`;
}

function whyItMattersCopy(record: DossierCandidate | DossierRecommendation) {
  const dynamicRecord = record as Record<string, unknown>;
  const sourceFileSummary = dynamicRecord.sourceFileSummary as
    | { summaryText?: unknown }
    | undefined;
  const candidates = [
    optionalText(sourceFileSummary?.summaryText),
    optionalText(dynamicRecord.adminSummary),
    optionalText(dynamicRecord.whyNow),
    optionalText(dynamicRecord.reason),
    optionalText(dynamicRecord.evidenceSummary),
    optionalText(dynamicRecord.recommendedNextStep),
  ];
  const selected = candidates.find(isPlainUsefulSummary);
  return selected ? compactUsefulSummary(selected) : "Needs more evidence";
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
  return "Review Source File";
}

function archiveActionLabel() {
  return "Review Record";
}

function isPopulationRecommendation(recommendation: DossierRecommendation) {
  return (
    recommendation.type === "population_recommendation" ||
    recommendation.populationRecommendation === true ||
    recommendation.createdBy === "bnl_population_recommender" ||
    recommendation.ingestSource === "bnl_population_recommender"
  );
}

function isPopulationOpen(recommendation: DossierRecommendation) {
  return ["new", "reviewing"].includes(recommendation.status);
}

function isNonDossierPopulationSignal(recommendation: DossierRecommendation) {
  return ["show_state_note", "broadcast_memory_note", "not_population_subject"].includes(
    recommendation.recommendedAction ?? recommendation.recommendedLane ?? "",
  );
}

function isAlreadyRepresentedPopulationSignal(recommendation: DossierRecommendation) {
  return (
    recommendation.recommendedAction === "mark_duplicate_no_new_info" ||
    recommendation.recommendedAction === "mark_no_new_info" ||
    recommendation.recommendedLane === "already_represented" ||
    recommendation.duplicateRisk === "high"
  );
}

function populationRecommendationSearchText(
  recommendation: DossierRecommendation,
  candidates: DossierCandidate[],
) {
  const candidateIds = [
    recommendation.matchedExistingCandidateId,
    recommendation.matchedDossierUpdateCandidateId,
    recommendation.targetCandidateId,
  ].filter(Boolean);
  const matchedCandidateNames = candidateIds.flatMap((candidateId) =>
    candidates
      .filter((candidate) => candidate.id === candidateId)
      .map((candidate) => candidate.name),
  );
  return [
    recommendation.subjectName,
    recommendation.subjectKey,
    recommendation.matchedPublicDossierName,
    recommendation.matchedPublicDossierId,
    ...matchedCandidateNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizedPopulationSubjectKey(recommendation: DossierRecommendation) {
  return (recommendation.subjectKey || recommendation.subjectName)
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function populationDestinationLabel(recommendation: DossierRecommendation, candidates: DossierCandidate[]) {
  const candidateId = recommendation.matchedExistingCandidateId ?? recommendation.matchedDossierUpdateCandidateId ?? recommendation.targetCandidateId ?? recommendation.connectedCandidateId;
  const candidate = candidateId ? candidates.find((item) => item.id === candidateId) : undefined;
  if (candidate?.status === "candidate_intake") return `Already waiting in Recommendation Intake: ${candidate.name}`;
  if (candidate?.status === "existing_dossier_update") return `Existing Dossier Update workspace: ${candidate.name}`;
  if (candidate?.status === "active_source_file") return `Matched active Source File: ${candidate.name}`;
  if (candidate) return `Existing internal record: ${candidate.name}`;
  if (recommendation.connectedRecommendationIds?.length) return "Already waiting in Recommendation Intake";
  if (recommendation.matchedPublicDossierName) return `Public dossier match: ${recommendation.matchedPublicDossierName}`;
  if (recommendation.targetDossierId) return `Public dossier target: ${recommendation.targetDossierId}`;
  return "No existing destination found";
}

function populationPublicDossierHref(recommendation: DossierRecommendation, publicDossiers: Array<{ id: string; name: string }>) {
  const dossier = publicDossiers.find((item) => item.id === (recommendation.matchedPublicDossierId ?? recommendation.targetDossierId));
  if (!dossier) return undefined;
  return `/database/${dossier.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function populationReviewHref(recommendation: DossierRecommendation) {
  if (recommendation.targetCandidateId) return `/admin/dossiers/candidates/${recommendation.targetCandidateId}`;
  if (recommendation.matchedExistingCandidateId) return `/admin/dossiers/candidates/${recommendation.matchedExistingCandidateId}`;
  if (recommendation.matchedDossierUpdateCandidateId) return `/admin/dossiers/candidates/${recommendation.matchedDossierUpdateCandidateId}`;
  if (recommendation.connectedRecommendationIds?.length) return `/admin/dossiers/recommendations/${recommendation.connectedRecommendationIds[0]}`;
  return `/admin/dossiers/recommendations/${recommendation.id}`;
}

type PopulationReviewQueueAction =
  | "attach_to_existing_source_file"
  | "attach_to_existing_dossier_update"
  | "create_dossier_update_workspace"
  | "create_source_file_candidate"
  | "mark_no_new_info"
  | "mark_not_population_subject"
  | "dismiss_population_recommendation"
  | "reopen_population_recommendation"
  | "mark_needs_more_info";

type PopulationPrimaryAction =
  | { kind: "action"; key: PopulationReviewQueueAction; label: string }
  | { kind: "link"; href: string; label: string };

function populationPrimaryActions(input: {
  groupId: string;
  recommendation: DossierRecommendation;
  targetHref?: string;
  publicHref?: string;
}): PopulationPrimaryAction[] {
  const { groupId, recommendation, targetHref, publicHref } = input;
  const reviewHref = targetHref ?? populationReviewHref(recommendation);
  if (groupId === "admin-review") {
    return [
      { kind: "link", href: reviewHref, label: "Review" },
      { kind: "action", key: "dismiss_population_recommendation", label: "Dismiss" },
    ];
  }
  if (groupId === "existing-source-file") {
    return [
      targetHref ? { kind: "link" as const, href: targetHref, label: "Open Source File" } : { kind: "link" as const, href: reviewHref, label: "Review" },
      { kind: "action" as const, key: "attach_to_existing_source_file" as const, label: "Attach evidence" },
    ].slice(0, 2);
  }
  if (groupId === "candidate-intake") {
    return [
      targetHref ? { kind: "link" as const, href: targetHref, label: "Open Candidate" } : { kind: "link" as const, href: reviewHref, label: "Review" },
      { kind: "action" as const, key: "mark_no_new_info" as const, label: "Mark no-new-info" },
    ];
  }
  if (groupId === "non-dossier") {
    return [
      { kind: "action", key: "mark_not_population_subject", label: "Mark not dossier subject" },
      { kind: "action", key: "dismiss_population_recommendation", label: "Dismiss" },
    ];
  }
  if (targetHref || publicHref) {
    return [{ kind: "link", href: targetHref ?? publicHref!, label: "Open existing record" }];
  }
  return [{ kind: "link", href: reviewHref, label: "Review" }];
}

function PopulationActionButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">
      {children}
    </button>
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
  const [consolidationResult, setConsolidationResult] = useState<SubjectConsolidationResult | null>(null);
  const [consolidatingGroupId, setConsolidatingGroupId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ groupId: string; kind: "consolidate" | "source_file" | "dossier_update" | "keep_separate"; subject: string; targetName: string; incomingCount: number; targetHref?: string } | null>(null);
  const [resolvedJustNow, setResolvedJustNow] = useState<{ groupId: string; subject: string; message: string; kind: "consolidate" | "source_file" | "dossier_update" | "keep_separate"; href?: string; absorbedCount: number; notesMoved: number; archivedCount: number; refreshStatus: string } | null>(null);
  const [recommendationForm, setRecommendationForm] =
    useState<ManualRecommendationForm>(emptyRecommendationForm);
  const [populationSearch, setPopulationSearch] = useState("");
  const [populationReconcileResult, setPopulationReconcileResult] = useState<PopulationReconcileSummary | null>(null);
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
    const next = (await response.json()) as WorkflowPayload;
    setPayload(next);
    setPopulationReconcileResult(next.populationReconcile ?? null);
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
  const populationRecommendations = recommendations.filter(isPopulationRecommendation);
  const visiblePopulationRecommendations = Array.from(
    populationRecommendations
      .reduce((deduped, recommendation) => {
        const key = [
          normalizedPopulationSubjectKey(recommendation),
          recommendation.recommendedLane ?? "",
          recommendation.recommendedAction ?? "",
          recommendation.status,
        ].join("|");
        const existing = deduped.get(key);
        if (!existing) {
          deduped.set(key, recommendation);
          return deduped;
        }
        const existingSeen = existing.seenCount ?? 1;
        const recommendationSeen = recommendation.seenCount ?? 1;
        deduped.set(
          key,
          recommendationSeen > existingSeen ||
            (recommendation.lastSeenAt ?? recommendation.updatedAt).localeCompare(
              existing.lastSeenAt ?? existing.updatedAt,
            ) > 0
            ? recommendation
            : existing,
        );
        return deduped;
      }, new Map<string, DossierRecommendation>())
      .values(),
  );
  const populationLastUpdated = populationRecommendations
    .map((recommendation) => recommendation.generatedAt ?? recommendation.lastSeenAt ?? recommendation.updatedAt)
    .sort()
    .at(-1);
  const filteredPopulationRecommendations = visiblePopulationRecommendations.filter((recommendation) => {
    const query = populationSearch.trim().toLowerCase();
    return !query || populationRecommendationSearchText(recommendation, candidates).includes(query);
  });
  const unresolvedPopulationSignals = filteredPopulationRecommendations.filter(
    (recommendation) =>
      isPopulationOpen(recommendation) &&
      !isAlreadyRepresentedPopulationSignal(recommendation) &&
      !isNonDossierPopulationSignal(recommendation) &&
      (recommendation.recommendedLane === "needs_population_review" ||
        recommendation.recommendedAction === "admin_review_required" ||
        !recommendation.targetCandidateId &&
          !recommendation.matchedExistingCandidateId &&
          !recommendation.matchedDossierUpdateCandidateId &&
          !recommendation.connectedRecommendationIds?.length &&
          !recommendation.matchedPublicDossierId &&
          !recommendation.targetDossierId),
  );
  const filedPopulationSignals = filteredPopulationRecommendations.filter(
    (recommendation) =>
      !unresolvedPopulationSignals.some((item) => item.id === recommendation.id) &&
      !isNonDossierPopulationSignal(recommendation),
  );
  const nonDossierPopulationSignals = filteredPopulationRecommendations.filter(isNonDossierPopulationSignal);
  const filedAutomaticallyCount = filedPopulationSignals.length + nonDossierPopulationSignals.length;
  const populationQueueGroups = [
    {
      id: "admin-review",
      title: "Needs Review",
      description: "Only ambiguous or unresolved BNL signals stay visible here.",
      items: unresolvedPopulationSignals,
    },
  ];

  const diagnosticRecommendations = recommendations.filter(isDiagnosticTestArtifactRecommendation);
  const resolvedCandidateIds = new Set(
    candidates.filter(isConsolidationResolvedCandidate).map((candidate) => candidate.id),
  );
  const activeRecommendations = recommendations.filter((recommendation) =>
    ["new", "reviewing"].includes(recommendation.status) &&
    !isResolvedDossierRecommendation(recommendation) &&
    !isDiagnosticTestArtifactRecommendation(recommendation) &&
    ![recommendation.targetCandidateId, recommendation.connectedCandidateId, recommendation.connectedSourceFileCandidateId].some((candidateId) => candidateId && resolvedCandidateIds.has(candidateId)),
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
      "attached_to_existing_dossier_update",
      "converted_to_source_file",
      "identity_link_created",
      "ignored",
      "dismissed",
      "no_new_info",
      "not_population_subject",
      "needs_more_info",
      "archived",
    ].includes(recommendation.status),
  );
  const diagnosticCandidates = candidates.filter(isDiagnosticTestArtifactCandidate);
  const normalCandidates = candidates.filter(
    (candidate) => !isDiagnosticTestArtifactCandidate(candidate),
  );
  const candidateIntakeItems = normalCandidates.filter(
    (candidate) => candidate.status === "candidate_intake",
  );
  const activeCandidates = candidates.filter((candidate) =>
    activeCandidateStatuses.has(candidate.status) &&
    !isDiagnosticTestArtifactCandidate(candidate) &&
    !isConsolidationResolvedCandidate(candidate),
  );
  const existingDossierUpdates = normalCandidates.filter(
    (candidate) =>
      candidate.status === "existing_dossier_update" &&
      !isConsolidationResolvedCandidate(candidate),
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
  const populationAudit = useMemo(
    () =>
      createDossierPopulationAudit({
        candidates,
        recommendations,
        publicDossiers,
        drafts,
      }),
    [candidates, recommendations, publicDossiers, drafts],
  );
  const populationMethodAudit = useMemo(
    () =>
      createDossierPopulationMethodAudit({
        candidates,
        recommendations,
        publicDossiers,
        drafts,
      }),
    [candidates, recommendations, publicDossiers, drafts],
  );
  const populationMethodNeedsReviewCount =
    populationMethodAudit.countsByLane["Needs Population Review"] +
    populationMethodAudit.hiddenWithoutDestination.length;
  const populationMethodHealthy =
    populationMethodAudit.warnings.length === 0 &&
    populationMethodNeedsReviewCount === 0;
  const showIncomingBnlSignals = unresolvedPopulationSignals.length > 0;
  const showBnlSignalStatus =
    populationRecommendations.length > 0 || Boolean(populationReconcileResult);
  const bnlSignalStatusText = unresolvedPopulationSignals.length > 0
    ? `BNL Signals: ${unresolvedPopulationSignals.length} unresolved`
    : filedAutomaticallyCount > 0
      ? `BNL Signals: ${filedAutomaticallyCount} filed automatically, 0 need review`
      : "BNL Signals: clear";
  const populationMethodStatusText = populationMethodHealthy
    ? "Population Method Audit: clear"
    : populationMethodAudit.warnings.length > 0
      ? `Population Method Audit: ${populationMethodAudit.warnings.length} warning${populationMethodAudit.warnings.length === 1 ? "" : "s"}`
      : `Population Method Audit: ${populationMethodNeedsReviewCount} record${populationMethodNeedsReviewCount === 1 ? "" : "s"} need review`;
  const consolidationAttachGroups = populationAudit.possibleDuplicateGroups.filter((group) => group.consolidationPlan.automationTier === "Attach to Existing Source File candidate");
  const consolidationCleanGroups = populationAudit.possibleDuplicateGroups.filter((group) => group.consolidationPlan.automationTier === "Empty duplicate cleanup candidate");
  const consolidationDossierUpdateGroups = populationAudit.possibleDuplicateGroups.filter((group) => group.consolidationPlan.automationTier === "Create Dossier Update workspace candidate");
  const consolidationSourceFileGroups = populationAudit.possibleDuplicateGroups.filter((group) => group.consolidationPlan.automationTier === "Create Source File candidate");
  const consolidationReviewGroups = populationAudit.possibleDuplicateGroups.filter((group) => group.consolidationPlan.requiresReview && group.consolidationPlan.automationTier !== "Blocked");
  const consolidationBlockedGroups = populationAudit.possibleDuplicateGroups.filter((group) => group.consolidationPlan.automationTier === "Blocked");
  const isSubjectConsolidationClear =
    consolidationAttachGroups.length === 0 &&
    consolidationCleanGroups.length === 0 &&
    consolidationDossierUpdateGroups.length === 0 &&
    consolidationSourceFileGroups.length === 0 &&
    consolidationReviewGroups.length === 0 &&
    consolidationBlockedGroups.length === 0;

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
      if (data.consolidation) setConsolidationResult(data.consolidation);
      if (data.candidates && data.drafts && data.workflow)
        setPayload(data as WorkflowPayload);
      return data;
    } finally {
      setSaving(false);
    }
  }

  async function consolidateSubjectGroup() {
    if (!confirmation) return;
    const pending = confirmation;
    if (pending.kind === "keep_separate") {
      setResolvedJustNow({
        groupId: pending.groupId,
        subject: pending.subject,
        message: "Marked separate.",
        kind: "keep_separate",
        absorbedCount: 0,
        notesMoved: 0,
        archivedCount: 0,
        refreshStatus: "not needed",
      });
      setConfirmation(null);
      return;
    }
    setConsolidatingGroupId(pending.groupId);
    setResolvedJustNow(null);
    try {
      const data = await postWorkflow({ action: "consolidateSubjectGroup", groupId: pending.groupId });
      const consolidation = data.consolidation;
      const target = consolidation?.affectedTargets?.[0];
      const refreshStatus = consolidation?.bnlRefreshes?.[0]?.status ?? "marked needed";
      setResolvedJustNow({
        groupId: pending.groupId,
        subject: pending.subject,
        message: pending.kind === "source_file"
          ? "Source File Created"
          : pending.kind === "dossier_update"
            ? "Dossier Update Workspace Created"
            : "Consolidated into kept Source File.",
        kind: pending.kind,
        href: target?.href ?? pending.targetHref,
        absorbedCount: consolidation?.attachedRecommendations ?? pending.incomingCount,
        notesMoved: consolidation?.attachedRecommendations ?? 0,
        archivedCount: consolidation?.sourceFileDuplicatesMerged ?? 0,
        refreshStatus,
      });
      setConfirmation(null);
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to consolidate subject group.",
      );
    } finally {
      setConsolidatingGroupId(null);
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

  async function populationRecommendationAction(
    recommendation: DossierRecommendation,
    action:
      | "attach_to_existing_source_file"
      | "attach_to_existing_dossier_update"
      | "create_dossier_update_workspace"
      | "create_source_file_candidate"
      | "mark_no_new_info"
      | "mark_not_population_subject"
      | "dismiss_population_recommendation"
      | "reopen_population_recommendation"
      | "mark_needs_more_info",
  ) {
    try {
      await postWorkflow({
        action,
        recommendationId: recommendation.id,
        candidateId:
          recommendation.matchedExistingCandidateId ??
          recommendation.matchedDossierUpdateCandidateId ??
          recommendation.targetCandidateId,
        dossierId: recommendation.matchedPublicDossierId ?? recommendation.targetDossierId,
        actionBy: "admin",
        actionReason: `BNL Signal Filing: ${action}`,
      });
      setNotice("Population recommendation updated internally. No public dossier text changed and no public page was published.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Population recommendation action failed.");
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
          <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted" data-compact-diagnostic-status>
            {showBnlSignalStatus ? (
              <span className="border border-border/70 bg-background/30 px-3 py-1.5">
                {bnlSignalStatusText}
              </span>
            ) : null}
            <span className="border border-border/70 bg-background/30 px-3 py-1.5">
              {populationMethodStatusText}
            </span>
          </div>
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
              ["Proposed Dossiers", proposedDossiers.length],
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

        {isSubjectConsolidationClear && !consolidationResult ? (
          <details className="border border-accent/40 bg-surface/70 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Subject Consolidation: clear</summary>
            <p className="mt-2 text-sm text-muted">No pending exact matches, possible matches, or blocked subject clusters are waiting. Show consolidation details if you need to inspect the empty queue.</p>
            <button type="button" disabled={saving} onClick={() => postWorkflow({ action: "runSubjectConsolidation" })} className="mt-3 inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">Run Subject Consolidation</button>
          </details>
        ) : (
        <section className="border border-accent/40 bg-surface/70 p-5 space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-muted mb-2">SUBJECT CONSOLIDATION</p>
              <h2 className="text-xl font-bold text-foreground">Subject Consolidation Queue</h2>
              <p className="mt-2 text-sm text-muted">Safe exact matches are handled by an admin-triggered server pass. Similar, ambiguous, or conflicted subjects stay here for review.</p>
            </div>
            <button type="button" disabled={saving} onClick={() => postWorkflow({ action: "runSubjectConsolidation" })} className="inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">
              Run Subject Consolidation
            </button>
          </div>

          <section className="border border-border/70 bg-background/30 p-4 text-sm text-muted">
            <h3 className="font-semibold text-foreground">Auto-consolidation summary</h3>
            <p className="mt-2">Run Subject Consolidation will:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>attach {consolidationAttachGroups.length} recommendations to existing Source Files</li>
              <li>clean {consolidationCleanGroups.length} empty duplicates</li>
              <li>create {consolidationDossierUpdateGroups.length} Dossier Update workspace</li>
              <li>create {consolidationSourceFileGroups.length} new Source File from matched signals</li>
              <li>leave {consolidationReviewGroups.length} possible matches for review</li>
              <li>block {consolidationBlockedGroups.length} conflicted items</li>
              <li>publish 0 public pages</li>
              <li>change 0 public dossier text</li>
              <li>keep internal aliases internal</li>
            </ul>
            {consolidationResult && (
              <div className="mt-4 border border-accent/40 bg-accent/5 p-3">
                <p className="font-semibold text-foreground">Subject Consolidation Complete</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Consolidated {consolidationResult.attachedRecommendations + consolidationResult.sourceFileDuplicatesMerged} incoming items into kept Source Files.</li>
                  <li>Created {consolidationResult.sourceFilesCreated} Source Files.</li>
                  <li>Created {consolidationResult.dossierUpdateWorkspacesCreated} Dossier Update workspaces.</li>
                  <li>Bundled {consolidationResult.bundledPublicDossierUpdateSignals} public dossier update signals.</li>
                  <li>Cleaned {consolidationResult.emptyDuplicatesCleaned + consolidationResult.duplicateRecommendationsCleaned} empty duplicates.</li>
                  <li>{consolidationResult.diagnosticArtifactsArchived} diagnostic artifacts archived/hidden</li>
                  <li>{consolidationResult.sourceFileDuplicatesMerged} records merged</li>
                  <li>{consolidationResult.bnlRefreshes.length} BNL refresh triggered / queued / needed</li>
                  <li>{consolidationResult.skippedItems.length} skipped items with reasons</li>
                  <li>{consolidationResult.blocked} blocked items with reasons</li>
                  <li>{consolidationResult.needsReview} remaining review-needed count</li>
                  <li>{consolidationResult.publicPagesPublished} public pages published</li>
                  <li>{consolidationResult.publicDossierTextChanged} public dossier text changed</li>
                  <li>{consolidationResult.internalAliasesExposed} internal aliases exposed</li>
                </ul>
                {consolidationResult.skippedItems.length > 0 && (
                  <div className="mt-3 text-xs">
                    <p className="uppercase tracking-[0.3em] text-accent">Skipped items with reasons</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {consolidationResult.skippedItems.map((item) => (
                        <li key={`${item.groupId ?? item.subject}-skipped`}>{item.subject}: {item.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {consolidationResult.blockedItems.length > 0 && (
                  <div className="mt-3 text-xs">
                    <p className="uppercase tracking-[0.3em] text-accent">Blocked items with reasons</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {consolidationResult.blockedItems.map((item) => (
                        <li key={`${item.groupId ?? item.subject}-blocked`}>{item.subject}: {item.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {consolidationResult.affectedTargets.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-accent">Affected kept Source Files / workspaces</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {consolidationResult.affectedTargets.map((target) => (
                        <Link key={target.candidateId} href={target.href} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">View {target.name} Dossier Update Workspace</Link>
                      ))}
                    </div>
                  </div>
                )}
                {consolidationResult.bnlRefreshes.length > 0 && (
                  <div className="mt-3 text-xs">
                    <p className="uppercase tracking-[0.3em] text-accent">BNL refresh status</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {consolidationResult.bnlRefreshes.map((refresh) => (
                        <li key={`${refresh.candidateId}-${refresh.requestId ?? refresh.status}`}>{refresh.subjectName}: {refresh.status}{refresh.reason ? ` — ${refresh.reason}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {resolvedJustNow && (
                  <div className="mt-3 border border-accent/50 bg-background/40 p-3 text-xs">
                    <p className="uppercase tracking-[0.3em] text-accent">Resolved just now</p>
                    <p className="mt-2 text-foreground">{resolvedJustNow.subject}: {resolvedJustNow.message}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted">Needs Review</p>
              <h3 className="text-lg font-bold text-foreground">Similar or ambiguous subjects requiring admin judgment</h3>
            </div>
            {consolidationReviewGroups.length === 0 ? (
              <p className="border border-border/70 bg-background/30 p-4 text-sm text-muted">No similar or ambiguous same-subject items currently need admin review.</p>
            ) : (
              <div className="space-y-3">
                {consolidationReviewGroups.slice(0, 10).map((group) => {
                  const plan = group.consolidationPlan;
                  const keptName = plan.targetDisplayName ?? plan.targetRecord?.displayName ?? plan.targetRecord?.name ?? "Select Different Target";
                  const incomingCount = plan.sourceRecords.length;
                  const incomingTypes = Array.from(new Set(plan.sourceRecords.map((record) => record.type))).join(", ") || "—";
                  const possibleTargets = plan.possibleTargetRecords.slice(0, 6);
                  const brief = plan.bnlBrief;
                  const isConsolidating = consolidatingGroupId === group.id;
                  const pendingConfirmation = confirmation?.groupId === group.id ? confirmation : null;
                  const completed = resolvedJustNow?.groupId === group.id ? resolvedJustNow : null;
                  const actionKind = plan.targetRecord ? "consolidate" : plan.suggestedWorkspace === "Dossier Update" ? "dossier_update" : "source_file";
                  const publicDossierName = plan.existingPublicDossier?.name ?? plan.targetRecord?.publicDossierName ?? keptName;
                  const subjectIsReadable = Boolean(keptName && keptName !== "Select Different Target" && keptName !== "—");
                  const defaultConsolidateActionLabel = "Consolidate Into Kept Source File";
                  const consolidateActionLabel = group.reason.startsWith("Variant needs review:")
                    ? `Consolidate Into ${keptName}`
                    : defaultConsolidateActionLabel;
                  const sourceFileActionAllowed = actionKind !== "source_file" || (subjectIsReadable && incomingCount > 0);
                  const targetHref = plan.targetRecord?.href;
                  if (completed) {
                    const viewLabel = completed.kind === "source_file"
                      ? "View New Source File"
                      : completed.kind === "dossier_update"
                        ? "View Dossier Update Workspace"
                        : "View Kept Source File";
                    return (
                      <article key={group.id} className="border border-accent/70 bg-accent/10 p-4 text-sm text-muted">
                        <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
                          <div className="border border-border/60 bg-background/30 p-3 opacity-60">
                            <p className="text-xs uppercase tracking-[0.3em] text-accent">Incoming Cluster</p>
                            <p className="mt-2 font-semibold text-foreground">Incoming cluster collapsed after completion.</p>
                            <p>{completed.absorbedCount} recommendations absorbed</p>
                            <p>{completed.notesMoved} notes moved</p>
                            <p>{completed.archivedCount} duplicate records archived/resolved</p>
                          </div>
                          <div className="border border-accent bg-background/40 p-3 shadow-lg">
                            <p className="text-xs uppercase tracking-[0.3em] text-accent">Resolved just now</p>
                            <h4 className="mt-2 text-lg font-bold text-foreground">{completed.message}</h4>
                            <p>{completed.subject}</p>
                            <p>BNL refresh triggered / queued / needed: {completed.refreshStatus}</p>
                            {completed.kind === "keep_separate" && <p>This pair/group will be suppressed from future same-subject suggestions.</p>}
                            {completed.href ? (
                              <Link href={completed.href} className="mt-3 inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">{viewLabel}</Link>
                            ) : (
                              <button type="button" disabled className="mt-3 border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted opacity-60">{viewLabel}</button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  }
                  return (
                    <article key={group.id} className={`border border-border/70 bg-background/20 p-4 text-sm text-muted transition-all duration-300 ${isConsolidating ? "translate-x-2 border-accent bg-accent/10 motion-safe:animate-pulse" : ""}`}>
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-accent">Subject</p>
                          <h4 className="text-lg font-bold text-foreground">{keptName}</h4>
                          <p>Why this needs review: {plan.reason}</p>
                          <p>Recommended action: {plan.recommendedNextStep}</p>
                          <p className="mt-2 font-semibold text-foreground">Why this target is being kept:</p>
                          <p>{plan.targetSelectionReason}</p>
                          <p>Internal operation: {plan.automationTier === "Attach to Existing Source File candidate" ? "attach recommendations" : plan.automationTier === "Source File merge candidate" ? "merge duplicate Source File" : plan.automationTier === "Empty duplicate cleanup candidate" ? "clean empty duplicate" : "blocked pending review"}</p>
                        </div>
                        <StatusPill>{plan.confidence} confidence</StatusPill>
                      </div>
                      {brief ? (
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div className={`border border-border/60 bg-background/30 p-3 transition-all duration-300 ${isConsolidating ? "opacity-50 scale-95" : ""}`}>
                            <p className="text-xs uppercase tracking-[0.3em] text-accent">Incoming Cluster</p>
                            <p className="mt-2 font-semibold text-foreground">BNL operator summary</p>
                            <p>{brief.operatorSummary}</p>
                            <p className="mt-2 font-semibold text-foreground">Incoming summary bullets</p>
                            <ul className="list-disc pl-5">
                              {brief.incomingSummaryBullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                            </ul>
                            <p className="mt-2 font-semibold text-foreground">What will be absorbed</p>
                            <ul className="list-disc pl-5">
                              {brief.whatWillBeAbsorbed.map((bullet) => <li key={bullet}>{bullet}</li>)}
                            </ul>
                            <p className="mt-2 font-semibold text-foreground">Already represented</p>
                            <ul className="list-disc pl-5">
                              {brief.alreadyRepresented.map((bullet) => <li key={bullet}>{bullet}</li>)}
                            </ul>
                            {isConsolidating && <p className="text-accent">Consolidating… incoming cluster is moving into the kept Source File.</p>}
                          </div>
                          <div className={`border border-accent/50 bg-accent/5 p-3 transition-all duration-300 ${isConsolidating ? "ring-2 ring-accent shadow-lg" : ""}`}>
                            <p className="text-xs uppercase tracking-[0.3em] text-accent">Kept Source File</p>
                            <p className="mt-2 font-semibold text-foreground">{brief.subjectDisplayName}</p>
                            <p>Recommended action: {brief.recommendedAction}</p>
                            <p>Relationship verdict: {brief.relationshipVerdict}</p>
                            <p className="mt-2 font-semibold text-foreground">Kept target summary bullets</p>
                            <ul className="list-disc pl-5">
                              {brief.keptTargetSummaryBullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                            </ul>
                            <p className="mt-2 font-semibold text-foreground">What will not change</p>
                            <ul className="list-disc pl-5">
                              {brief.whatWillNotChange.map((bullet) => <li key={bullet}>{bullet}</li>)}
                            </ul>
                            <p className="mt-2 font-semibold text-foreground">Why review is needed</p>
                            <ul className="list-disc pl-5">
                              {brief.whyReviewIsNeeded.map((bullet) => <li key={bullet}>{bullet}</li>)}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 border border-border/60 bg-background/30 p-3">
                          <p className="text-xs uppercase tracking-[0.3em] text-accent">BNL consolidation brief needed</p>
                          <p className="mt-2 font-semibold text-foreground">BNL consolidation brief needed before review.</p>
                          <p>Subject cluster detected: {keptName}</p>
                          <p>Incoming item count: {incomingCount}</p>
                          <p>Item types summarized: {incomingTypes}</p>
                          <p>Possible kept targets: {possibleTargets.length}</p>
                          {possibleTargets.length >= 2 ? (
                            <div className="mt-2">
                              <p className="font-semibold text-foreground">Target options</p>
                              <ul className="list-disc pl-5">
                                {possibleTargets.map((target) => (
                                  <li key={target.id}>
                                    {target.displayName ?? target.name} — Source File ID: {target.candidateId ?? target.id}; status: {target.status}; public dossier match: {target.publicDossierName ?? "none"}; draft status: {target.activeDraftStatus ?? "none"}; source notes: {target.sourceNotesCount}; recommendations: {target.attachedRecommendationCount}; reason it might be kept: {target.uniqueInfo.join(", ") || "named possible target"}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="mt-2">
                              <p className="font-semibold text-foreground">Blocked / Needs Info</p>
                              <p>Target selection unavailable: at least two named target options are required.</p>
                            </div>
                          )}
                          {actionKind === "source_file" && sourceFileActionAllowed && (
                            <p>This will create a new internal Source File for “{keptName}” from {incomingCount} matched {incomingTypes} signals. No public page will be published.</p>
                          )}
                          {actionKind === "source_file" && incomingCount === 0 && <p>No usable signal cluster found.</p>}
                          {actionKind === "dossier_update" && (
                            <p>This will create an internal update workspace for the existing {publicDossierName} public dossier. It will not edit the public dossier text or publish anything.</p>
                          )}
                          <p>Action: Generate BNL Consolidation Brief</p>
                          <button type="button" disabled className="mt-3 border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted opacity-60">Generate BNL Consolidation Brief</button>
                          <p className="mt-2 text-xs text-muted">Requires companion BNL summary PR; raw evidence is not shown as a substitute.</p>
                          {isConsolidating && <p className="text-accent">Consolidating… incoming cluster is moving into the kept Source File.</p>}
                        </div>
                      )}
                      {pendingConfirmation ? (
                        <div className="mt-4 border border-accent/60 bg-accent/10 p-3">
                          <p className="font-semibold text-foreground">Confirm subject consolidation</p>
                          {pendingConfirmation.kind === "consolidate" && (
                            <p>You are about to consolidate {pendingConfirmation.subject} into {pendingConfirmation.targetName}.</p>
                          )}
                          {pendingConfirmation.kind === "source_file" && (
                            <p>You are about to create internal Source File “{pendingConfirmation.subject}” from {pendingConfirmation.incomingCount} signals. This will not publish a public page.</p>
                          )}
                          {pendingConfirmation.kind === "dossier_update" && (
                            <p>You are about to create an internal dossier update workspace for “{pendingConfirmation.subject}.” This will not edit public dossier text.</p>
                          )}
                          {pendingConfirmation.kind === "keep_separate" && (
                            <p>You are about to mark {pendingConfirmation.subject} separate. This pair/group will be suppressed from future same-subject suggestions.</p>
                          )}
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <div>
                              <p className="font-semibold text-foreground">This will:</p>
                              <ul className="list-disc pl-5">
                                <li>absorb {incomingCount} recommendations / notes / source records</li>
                                <li>keep {pendingConfirmation.targetName} active when a kept file exists</li>
                                <li>archive or resolve the incoming cluster when safe</li>
                                <li>trigger or mark BNL refresh</li>
                              </ul>
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">This will not:</p>
                              <ul className="list-disc pl-5">
                                <li>publish a public page</li>
                                <li>edit public dossier text</li>
                                <li>expose internal aliases</li>
                              </ul>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" disabled={saving} onClick={() => consolidateSubjectGroup()} className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">Confirm Consolidation</button>
                            <button type="button" disabled={saving} onClick={() => setConfirmation(null)} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {plan.targetRecord ? (
                            <button type="button" disabled={saving} onClick={() => setConfirmation({ groupId: group.id, kind: "consolidate", subject: keptName, targetName: keptName, incomingCount, targetHref })} className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{isConsolidating ? "Consolidating…" : consolidateActionLabel}</button>
                          ) : actionKind === "dossier_update" ? (
                            <button type="button" disabled={saving} onClick={() => setConfirmation({ groupId: group.id, kind: "dossier_update", subject: publicDossierName, targetName: publicDossierName, incomingCount })} className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">Create Dossier Update: {publicDossierName}</button>
                          ) : sourceFileActionAllowed ? (
                            <button type="button" disabled={saving} onClick={() => setConfirmation({ groupId: group.id, kind: "source_file", subject: keptName, targetName: keptName, incomingCount })} className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">Create Source File: {keptName}</button>
                          ) : null}
                          <button type="button" disabled={saving} onClick={() => setConfirmation({ groupId: group.id, kind: "keep_separate", subject: keptName, targetName: keptName, incomingCount })} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50">Keep Separate / Not Same Subject</button>
                          {possibleTargets.length >= 2 && (
                            <button type="button" className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">Select Different Target</button>
                          )}
                        </div>
                      )}
                      <details className="mt-4 border border-border/60 bg-background/30 p-3">
                        <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-muted">Raw / Source Details</summary>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {plan.sourceRecords.map((record) => record.href ? (
                            <Link key={`${group.id}-raw-${record.type}-${record.id}`} href={record.href} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">Source link: {record.displayName ?? record.name}</Link>
                          ) : null)}
                          {plan.targetRecord?.href && (
                            <Link href={plan.targetRecord.href} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">Target link: {keptName}</Link>
                          )}
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted">Blocked</p>
              <h3 className="text-lg font-bold text-foreground">Conflicts that require a data fix before mutation</h3>
            </div>
            {consolidationBlockedGroups.length === 0 ? (
              <p className="border border-border/70 bg-background/30 p-4 text-sm text-muted">No blocked conflicts were detected.</p>
            ) : (
              <div className="space-y-3">
                {consolidationBlockedGroups.map((group) => (
                  <article key={`blocked-${group.id}`} className="border border-red-500/40 bg-background/20 p-4 text-sm text-muted">
                    <p className="font-semibold text-foreground">{group.reason}</p>
                    <p>Blocked reason: {group.consolidationPlan.blockedReasons.join(" ")}</p>
                    <p>What must be fixed first: resolve conflicting public dossier matches, active drafts, unsupported data shapes, or identity risk before running consolidation.</p>
                    <details className="mt-4 border border-border/60 bg-background/30 p-3">
                      <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-muted">Raw / Source Details</summary>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {group.records.map((record) => record.href ? (
                          <Link key={`blocked-raw-${record.type}-${record.id}`} href={record.href} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">Source link: {record.displayName ?? record.name}</Link>
                        ) : null)}
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
        )}



        {showIncomingBnlSignals ? (
        <DashboardCard
          eyebrow="Incoming BNL Signals"
          title="Incoming BNL Signals"
          aside={<StatusPill>{unresolvedPopulationSignals.length} unresolved</StatusPill>}
        >
          <p className="text-sm text-muted">
            BNL files new subject signals into existing candidates, Source Files, dossier drafts, and update workspaces. Only unresolved signals appear here.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 text-xs text-muted">
            {[
              ["Signals reviewed", populationReconcileResult?.signalsReviewed ?? populationRecommendations.length],
              ["Filed automatically", filedAutomaticallyCount],
              ["New candidates created", populationReconcileResult?.createdSourceFileCandidates ?? candidates.filter((item) => item.source === "bnl_dynamic_candidate_discovery" && item.status === "candidate_intake").length],
              ["Attached to existing records", (populationReconcileResult?.attachedToSourceFiles ?? populationRecommendations.filter((item) => item.status === "attached_to_source_file").length) + (populationReconcileResult?.attachedToDossierUpdates ?? populationRecommendations.filter((item) => item.status === "attached_to_existing_dossier_update").length) + (populationReconcileResult?.attachedToCandidateIntake ?? populationRecommendations.filter((item) => item.status === "attached_to_candidate_intake").length) + (populationReconcileResult?.attachedToExistingRecommendations ?? 0)],
              ["Already represented", populationReconcileResult?.markedAlreadyRepresented ?? populationRecommendations.filter(isAlreadyRepresentedPopulationSignal).length],
              ["Unresolved", populationReconcileResult?.unresolvedNeedsReview ?? unresolvedPopulationSignals.length],
              ["Public pages published", populationReconcileResult?.publicPagesPublished ?? 0],
              ["Public dossier text changed", populationReconcileResult?.publicDossierTextChanged ?? 0],
              ["Internal aliases exposed", populationReconcileResult?.internalAliasesExposed ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="border border-border/70 bg-background/30 p-3">
                <p className="uppercase tracking-[0.25em] text-accent mb-2">{label}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between text-xs uppercase tracking-widest text-muted">
            <p>Source of recommendation: Incoming BNL Signals · Last updated / generatedAt: {formatDate(populationLastUpdated)}</p>
            {unresolvedPopulationSignals.length > 0 ? (
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <label className="space-y-2 md:min-w-72">
                  <span>Search unresolved signal, dossier, candidate, or Source File</span>
                  <input value={populationSearch} onChange={(event) => setPopulationSearch(event.target.value)} className={textInputClass()} />
                </label>
              </div>
            ) : null}
          </div>
          <p className="text-sm text-muted">BNL Signal Filing only changes private workflow state. It publishes 0 public pages, changes 0 public dossier text, exposes 0 internal aliases, and preserves raw evidence references internally without displaying private evidence.</p>

          <div className="space-y-5">
            {unresolvedPopulationSignals.length > 0 ? (
              <section className="border border-border/70 bg-background/20 p-4 space-y-3">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Unresolved BNL Signals</h3>
                    <p className="text-sm text-muted">Only ambiguous or unresolved BNL signals stay visible here.</p>
                  </div>
                  <StatusPill>{unresolvedPopulationSignals.length} signal{unresolvedPopulationSignals.length === 1 ? "" : "s"}</StatusPill>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {unresolvedPopulationSignals.map((recommendation) => {
                    const targetHref = recommendation.targetCandidateId || recommendation.matchedExistingCandidateId || recommendation.matchedDossierUpdateCandidateId ? `/admin/dossiers/candidates/${recommendation.targetCandidateId ?? recommendation.matchedExistingCandidateId ?? recommendation.matchedDossierUpdateCandidateId}` : undefined;
                    const publicHref = populationPublicDossierHref(recommendation, publicDossiers);
                    const primaryActions = populationPrimaryActions({ groupId: "admin-review", recommendation, targetHref, publicHref });
                    return (
                      <article key={recommendation.id} className="border border-border bg-surface p-4 text-sm text-muted space-y-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h4 className="text-xl font-bold text-foreground">{recommendation.subjectName}</h4>
                            <p>{recommendation.recommendedNextStep ?? recommendation.routingReason ?? "Needs one admin decision because no deterministic destination was found."}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusPill>{recommendation.confidence ?? "confidence unset"}</StatusPill>
                            <StatusPill>{recommendation.status}</StatusPill>
                          </div>
                        </div>
                        <p><span className="text-foreground">Destination:</span> {populationDestinationLabel(recommendation, candidates)}</p>
                        <p><span className="text-foreground">Why:</span> {whyItMattersCopy(recommendation)}</p>
                        {recommendation.missingInfo?.length ? <p><span className="text-foreground">Missing info:</span> {recommendation.missingInfo.join("; ")}</p> : null}
                        <p><span className="text-foreground">Evidence refs:</span> {recommendation.rawEvidenceRefCount ?? recommendation.rawEvidenceRefs?.length ?? 0} private refs preserved internally; raw/private evidence is not shown.</p>
                        <p><span className="text-foreground">What to click next:</span> {primaryActions.map((action) => action.label).join(" or ")}</p>
                        <div className="flex flex-wrap gap-2" data-primary-population-actions={primaryActions.length}>
                          {primaryActions.slice(0, 2).map((action) => action.kind === "link" ? (
                            <Link key={`${recommendation.id}-${action.label}`} href={action.href} className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">{action.label}</Link>
                          ) : (
                            <PopulationActionButton key={`${recommendation.id}-${action.key}`} disabled={saving} onClick={() => populationRecommendationAction(recommendation, action.key)}>{action.label}</PopulationActionButton>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </DashboardCard>
        ) : null}




        <DashboardCard
          eyebrow="Candidates & Recommendation Intake"
          title="Candidates & Recommendation Intake"
          aside={
            <StatusPill>
              {candidateIntakeItems.length +
                activeCandidateRecommendations.length}{" "}
              waiting
            </StatusPill>
          }
        >
          <p className="mb-4 text-sm text-muted">
            This section includes real Candidate Intake records and recommendation-backed subjects that still need review.
          </p>
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
                    <th className="py-2 pr-3">Review lane</th>
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
                        <td className="py-3 pr-3">
                          <StatusPill>Recommendation</StatusPill>
                        </td>
                        <td className="py-3 pr-3 font-semibold text-foreground">
                          {recommendation.subjectName}
                        </td>
                        <td className="py-3 pr-3">
                          {whyItMattersCopy(recommendation)}
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
                          {recommendation.routingReason ||
                            recommendation.suggestedAction ||
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
                      <td className="py-3 pr-3">
                        <StatusPill>Candidate Intake</StatusPill>
                      </td>
                      <td className="py-3 pr-3 font-semibold text-foreground">
                        {candidate.name}
                      </td>
                      <td className="py-3 pr-3">
                        {whyItMattersCopy(candidate)}
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
                        {candidate.routingReason ||
                          "Promote to Source File or archive from the detail page."}
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
                          {whyItMattersCopy(recommendation)}
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
                        {whyItMattersCopy(candidate)}
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
                    const readiness = createDossierSourceFileDraftReadinessReadModel({
                      candidate,
                      sourceFileExists: true,
                      analystRead: candidate.latestSourceFileArchive?.subjectAnalystReadV1,
                      fallback: {
                        readyForDraft: false,
                        primaryReason: "BNL readiness is not available yet; using the conservative site fallback heuristic.",
                        blockers: candidate.missingInfo ?? [],
                        recommendedNextAction: "Refresh the Source File so BNL can provide draft readiness.",
                      },
                    });
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
                          {whyItMattersCopy(candidate)}
                        </td>
                        <td className="py-3 pr-3">
                          {metrics?.sourceDepth ??
                            candidate.confidence ??
                            "Low"}
                        </td>
                        <td className="py-3 pr-3">
                          {readiness.blockers.length > 0
                            ? readiness.blockers.slice(0, 2).join("; ")
                            : readiness.primaryReason}
                          <p className="mt-1 text-xs text-muted">{readiness.recommendedNextAction}</p>
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

        <details className="border border-border bg-surface/70 p-5">
          <summary className="cursor-pointer text-xl font-bold text-foreground">
            Diagnostics & Maintenance
          </summary>
          <div className="mt-4 space-y-5">
            <p className="text-sm text-muted">
              Diagnostic readouts, filed BNL signal details, population-method mapping,
              and maintenance-only artifacts live here so the normal dashboard starts
              with actionable work. This drawer is admin-only and collapsed by default.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-muted" data-compact-diagnostic-status>
              {showBnlSignalStatus ? (
                <span className="border border-border/70 bg-background/30 px-3 py-1.5">
                  {bnlSignalStatusText}
                </span>
              ) : null}
              <span className="border border-border/70 bg-background/30 px-3 py-1.5">
                {populationMethodStatusText}
              </span>
            </div>
          <details className="border border-border/70 bg-background/30 p-4" open={!populationMethodHealthy}>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              {populationMethodHealthy ? "Population Method Audit: clear" : "Population Method Audit: needs review"}
              {!populationMethodHealthy ? ` — ${populationMethodAudit.warnings.length} warnings, ${populationMethodNeedsReviewCount} records need attention.` : ""}
            </summary>
            <div className="mt-4 space-y-5">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted">Population Method Audit</p>
                <h2 className="text-xl font-bold text-foreground">Population Method Audit / Intake Map</h2>
                <p className="mt-2 text-sm text-muted">Admin-only read-only diagnostic map for how Source Files, Dossier Updates, recommendations, diagnostics, and public dossier update signals entered the system, which lane they belong in, and whether hidden records have destinations.</p>
                {populationMethodHealthy && (
                  <p className="mt-3 border border-accent/40 bg-accent/10 p-3 text-sm text-accent">Population Method Audit: clear. All resolved records have visible destinations or valid archive/diagnostic status. No orphaned intake records detected.</p>
                )}
              </div>

              <section className="grid gap-3 md:grid-cols-2">
                <div className="border border-border/70 bg-surface/60 p-4">
                  <h3 className="font-semibold text-foreground">Intake Summary</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                    <dt>BNL recommendations</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByOrigin["BNL recommendation"] + populationMethodAudit.countsByOrigin["BNL source knowledge bridge"] + populationMethodAudit.countsByOrigin["BNL dynamic candidate discovery"]}</dd>
                    <dt>manual admin records</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByOrigin["manual admin creation"]}</dd>
                    <dt>public dossier update signals</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByOrigin["public dossier update signal"]}</dd>
                    <dt>source file refresh/archive records</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByOrigin["source file refresh"] + populationMethodAudit.countsByOrigin["source file archive"]}</dd>
                    <dt>diagnostic/test artifacts</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByOrigin["diagnostic/test artifact"]}</dd>
                    <dt>unknown origin records</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByOrigin["unknown / insufficient metadata"]}</dd>
                  </dl>
                </div>
                <div className="border border-border/70 bg-surface/60 p-4">
                  <h3 className="font-semibold text-foreground">Lane Map</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                    <dt>Active Source Files</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByLane["Active Source File"]}</dd>
                    <dt>Candidate Intake</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByLane["Candidate Intake"]}</dd>
                    <dt>Dossier Update Workspaces</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByLane["Dossier Update Workspace"]}</dd>
                    <dt>Public Dossier Update Signals</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByLane["Public Dossier Update Signal"]}</dd>
                    <dt>Resolved Incoming Records</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByLane["Resolved Incoming Record"] + populationMethodAudit.countsByLane["Merged Source Record"]}</dd>
                    <dt>Diagnostics</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByLane["Diagnostic/Test Artifact"]}</dd>
                    <dt>Archived/Closed</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByLane["Archived / Closed"]}</dd>
                    <dt>Needs Population Review</dt><dd className="text-right text-foreground">{populationMethodAudit.countsByLane["Needs Population Review"]}</dd>
                  </dl>
                </div>
              </section>

              {populationMethodAudit.warnings.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-semibold text-foreground">Warnings / Problems</h3>
                  {populationMethodAudit.warnings.slice(0, 8).map((warning) => (
                    <article key={warning.id} className="border border-accent/50 bg-accent/10 p-4 text-sm">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-semibold text-accent">{warning.issueTitle}</p>
                          <p className="mt-1 text-foreground">Affected subject: {warning.affectedSubject}</p>
                        </div>
                        <button type="button" onClick={() => navigator.clipboard?.writeText(warning.affectedIds.join(", "))} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Copy Record IDs</button>
                      </div>
                      <dl className="mt-3 grid gap-2 text-xs text-muted md:grid-cols-2">
                        <div><dt>Affected IDs</dt><dd className="text-foreground">{warning.affectedIds.join(", ") || "—"}</dd></div>
                        <div><dt>Source type</dt><dd className="text-foreground">{warning.sourceType}</dd></div>
                        <div><dt>Current status</dt><dd className="text-foreground">{warning.currentStatus}</dd></div>
                        <div><dt>Expected lane</dt><dd className="text-foreground">{warning.expectedLane}</dd></div>
                        <div><dt>Detected destination</dt><dd className="text-foreground">{warning.detectedDestination ?? "—"}</dd></div>
                        <div><dt>Recommended admin next step</dt><dd className="text-foreground">{warning.recommendedAdminNextStep}</dd></div>
                      </dl>
                    </article>
                  ))}
                </section>
              )}

              <details className="border border-border/70 bg-surface/40 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">Hidden Records With Destinations ({populationMethodAudit.hiddenWithDestinations.length})</summary>
                <div className="mt-3 space-y-2 text-sm">
                  {populationMethodAudit.hiddenWithDestinations.slice(0, 8).map((record) => (
                    <div key={`hidden-destination-${record.id}`} className="border border-border/60 p-3">
                      <p className="font-semibold text-foreground">{record.subject}</p>
                      <p className="text-xs text-muted">{record.origin} → {record.destinationSubject ?? "destination"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {record.href && <Link href={record.href} className="border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">View Source Record</Link>}
                        {record.destinationHref && <Link href={record.destinationHref} className="border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">View Destination Workspace</Link>}
                        {record.publicDossierId && <Link href={`/database/${record.publicDossierId}`} className="border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">View Public Dossier Match</Link>}
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              {populationMethodAudit.hiddenWithoutDestination.length > 0 && (
                <section className="border border-accent/50 bg-accent/10 p-4">
                  <h3 className="font-semibold text-accent">Hidden Records Without Destinations</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    {populationMethodAudit.hiddenWithoutDestination.slice(0, 8).map((record) => (
                      <div key={`hidden-orphan-${record.id}`} className="border border-border/60 bg-background/30 p-3">
                        <p className="font-semibold text-foreground">{record.subject}</p>
                        <p className="text-xs text-muted">{record.origin} · {record.currentStatus} · expected lane: {record.intendedLane}</p>
                        {record.href && <Link href={record.href} className="mt-2 inline-flex border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">View Source Record</Link>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <details className="border border-border/70 bg-surface/40 p-3" open={!populationMethodHealthy}>
                <summary className="cursor-pointer text-sm font-semibold text-foreground">Destination Workspaces ({populationMethodAudit.visibleDestinationWorkspaces.length})</summary>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {populationMethodAudit.visibleDestinationWorkspaces.slice(0, 10).map((record) => (
                    <div key={`destination-${record.id}`} className="border border-border/60 p-3 text-sm">
                      <p className="font-semibold text-foreground">{record.subject}</p>
                      <p className="text-xs text-muted">{record.intendedLane} · received records: {populationMethodAudit.intakeFlows.filter((flow) => flow.destinationId === record.id).length}</p>
                      {record.href && <Link href={record.href} className="mt-2 inline-flex border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">View Destination Workspace</Link>}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </details>

        {(filedPopulationSignals.length > 0 || nonDossierPopulationSignals.length > 0) ? (
          <details className="border border-border/70 bg-background/20 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">BNL Signal Diagnostics — filed/non-dossier details collapsed ({filedPopulationSignals.length + nonDossierPopulationSignals.length})</summary>
            <p className="mt-2 text-sm text-muted">Filed, already-represented, and non-dossier signal details remain available for debugging without crowding the working dashboard.</p>
            <div className="mt-4 space-y-4">
            <details className="border border-border/70 bg-background/20 p-4">
              <summary className="cursor-pointer text-lg font-bold text-foreground">Filed / Already Represented ({filedPopulationSignals.length})</summary>
              <p className="mt-2 text-sm text-muted">Audit view for signals already attached, merged, marked no-new-info, or represented elsewhere. These do not clutter the default work queue.</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {filedPopulationSignals.map((recommendation) => (
                  <article key={recommendation.id} className="border border-border bg-surface p-4 text-sm text-muted space-y-2">
                    <h4 className="text-lg font-bold text-foreground">{recommendation.subjectName}</h4>
                    <p>{populationDestinationLabel(recommendation, candidates)}</p>
                    <p>No action needed. Filed automatically.</p>
                  </article>
                ))}
              </div>
            </details>
            {nonDossierPopulationSignals.length > 0 ? (
              <details className="border border-border/70 bg-background/20 p-4">
                <summary className="cursor-pointer text-lg font-bold text-foreground">Non-dossier Signals ({nonDossierPopulationSignals.length})</summary>
                <p className="mt-2 text-sm text-muted">Show-state notes, broadcast memory notes, and not-population-subject items stay out of the main dossier work queue.</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {nonDossierPopulationSignals.map((recommendation) => (
                    <article key={recommendation.id} className="border border-border bg-surface p-4 text-sm text-muted space-y-3">
                      <h4 className="text-lg font-bold text-foreground">{recommendation.subjectName}</h4>
                      <p>{whyItMattersCopy(recommendation)}</p>
                      <p>Private evidence refs preserved internally; raw/private content hidden.</p>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
            </div>
          </details>
        ) : null}

        {(diagnosticCandidates.length > 0 || diagnosticRecommendations.length > 0) ? (
          <section className="border border-border/70 bg-background/20 p-4">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted">Diagnostics/Test Artifacts</p>
                <h3 className="text-lg font-bold text-foreground">Diagnostics/Test Artifacts</h3>
              </div>
              <StatusPill>{diagnosticCandidates.length + diagnosticRecommendations.length} hidden</StatusPill>
            </div>
            <details className="border border-border/70 bg-background/30 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">Diagnostics/Test Artifacts — collapsed by default</summary>
              <p className="mt-3 text-sm text-muted">These diagnostic_test_artifact records are hidden from normal Source File and Subject Consolidation workflows. They can be archived safely from their detail pages when needed.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {diagnosticCandidates.map((candidate) => (
                  <Link key={`diagnostic-candidate-${candidate.id}`} href={`/admin/dossiers/candidates/${candidate.id}`} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">Archive Diagnostic Artifact: {candidate.name}</Link>
                ))}
                {diagnosticRecommendations.map((recommendation) => (
                  <Link key={`diagnostic-recommendation-${recommendation.id}`} href={`/admin/dossiers/recommendations/${recommendation.id}`} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">Archive Diagnostic Artifact: {recommendation.subjectName}</Link>
                ))}
              </div>
            </details>
          </section>
        ) : null}
          </div>
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
