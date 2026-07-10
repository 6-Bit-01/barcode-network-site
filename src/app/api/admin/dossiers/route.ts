import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { databasePage } from "@/content";
import { dossierAuthoringGuide } from "@/lib/dossier-authoring-guide";
import { refreshBnlSourceFileNow } from "@/lib/bnl-source-file-refresh-now";
import { trustedRequestingSiteOrigin } from "@/lib/trusted-requesting-site-origin";
import { buildDossierTagRegistry } from "@/lib/dossier-tags";
import {
  DOSSIER_CANDIDATE_SCORING_POLICY,
  DOSSIER_SOURCE_BOUNDARIES,
  DOSSIER_WORKFLOW_ACTIONS,
  DOSSIER_WORKFLOW_RULES,
  type CreateManualDossierCandidateInput,
  type DossierCandidate,
  type DossierIdentityLink,
  type DossierIdentityLinkSource,
  type DossierIdentityLinkType,
  type DossierIdentityLinkVisibility,
  type CreateDossierRecommendationInput,
  type CreateDossierSourceFileNoteInput,
  type ReviewDossierSourceFileClaimInput,
  type UpdateDossierSourceFileSummaryInput,
  type DossierCandidateStatus,
  type DossierDraft,
  type DossierDuplicateGroup,
  type DossierRecommendation,
  type DossierSourceFileRefreshRequest,
  type DossierWorkflowAction,
  type MergeDossierCandidatesInput,
} from "@/lib/dossier-workflow";
import {
  addDossierIdentityLink,
  applyPopulationReviewRecommendationAction,
  buildDossierSourceFileWorkflowContext,
  reconcilePopulationSignals,
  addDossierSourceFileNote,
  reviewDossierSourceFileClaim,
  updateDossierSourceFileSummary,
  archiveDossierCandidate,
  archiveDossierRecommendation,
  attachCandidateToExistingDossier,
  attachRecommendationToCandidate,
  createIdentityLinkFromRecommendation,
  confirmDossierIdentityLink,
  buildDossierDuplicateGroups,
  convertRecommendationToCandidate,
  createDossierRecommendation,
  createDraftFromCandidate,
  requestBnlDraftFromCandidate,
  updateDraftFromSourceFile,
  createManualDossierCandidate,
  dismissDossierRecommendation,
  DossierMergeError,
  DossierWorkflowInputError,
  getDossierWorkflowState,
  getDossierWorkflowStorageMode,
  ignoreDossierRecommendation,
  recordDossierSourceFileOpen,
  sourceFileNeedsCaseReportBackfill,
  rejectDossierIdentityLink,
  requestDossierSourceFileRefresh,
  retireDossierIdentityLink,
  runSubjectConsolidation,
  mergeDossierCandidates,
  markCandidateAsExistingDossierUpdate,
  permanentlyDeleteDossierCandidate,
  promoteCandidateToSourceFile,
  restoreDossierCandidate,
  saveDossierDraft,
  submitDraftForOwnerReview,
  updateDossierCandidateStatus,
  updateDossierIdentityLink,
  updateDossierSourceFileRefreshRequestStatus,
  validateDossierDraftFieldsForOwnerReview,
  type DossierWorkflowState,
  type PopulationReconcileSummary,
} from "@/lib/dossier-workflow-store";

export const dynamic = "force-dynamic";

type DossierWorkflowResponse = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  recommendations: DossierRecommendation[];
  sourceFileRefreshRequests: DossierSourceFileRefreshRequest[];
  duplicateGroups: DossierDuplicateGroup[];
  workflow: {
    version: 1;
    storage: "redis" | "memory_fallback";
    storageKey: "barcode:dossier-workflow:v1";
    status: "candidate_store_enabled";
    updatedAt: string;
    revision: number;
    candidateCount: number;
    draftCount: number;
    allowedActions: DossierWorkflowAction[];
    rules: typeof DOSSIER_WORKFLOW_RULES;
    scoringPolicy: typeof DOSSIER_CANDIDATE_SCORING_POLICY;
    candidateSourceBoundaries: typeof DOSSIER_SOURCE_BOUNDARIES;
    boundaries: string[];
    ownerGate: {
      status: "placeholder_only";
      requiresOwnerSecretFuture: true;
      approvalPublishes: false;
      message: string;
    };
  };
  ownerReviewQueue: {
    waitingCount: number;
    draftCount: number;
    candidateCount: number;
  };
  authoringGuide: {
    version: typeof dossierAuthoringGuide.version;
    fieldCount: number;
    draftingRuleCount: number;
  };
  tagRegistry: {
    totalUniqueTags: number;
    totalTagAssignments: number;
    creationPolicy: ReturnType<
      typeof buildDossierTagRegistry
    >["creationPolicy"];
  };
  publicDossiers: Array<{ id: string; name: string }>;
  populationReconcile?: PopulationReconcileSummary;
};

const IMPLEMENTED_ACTIONS = new Set<DossierWorkflowAction>([
  "createManualCandidate",
  "createDraftFromCandidate",
  "updateDraftFromSourceFile",
  "requestBnlDraftFromCandidate",
  "saveDraft",
  "submitDraftForOwnerReview",
  "denyCandidate",
  "markNeedsMoreEvidence",
  "detectDuplicateCandidates",
  "mergeCandidates",
  "updateSourceFileSummary",
  "addSourceFileNote",
  "reviewSourceFileClaim",
  "editSourceFileClaim",
  "resetSourceFileClaimReview",
  "requestSourceFileRefresh",
  "recordSourceFileOpen",
  "addDossierIdentityLink",
  "createIdentityLinkFromRecommendation",
  "updateDossierIdentityLink",
  "confirmDossierIdentityLink",
  "rejectDossierIdentityLink",
  "retireDossierIdentityLink",
  "createDossierRecommendation",
  "attachRecommendationToCandidate",
  "convertRecommendationToCandidate",
  "promoteCandidateToSourceFile",
  "archiveCandidate",
  "restoreCandidate",
  "permanentlyDeleteCandidate",
  "ignoreDossierRecommendation",
  "dismissDossierRecommendation",
  "archiveDossierRecommendation",
  "attachCandidateToExistingDossier",
  "markCandidateAsExistingDossierUpdate",
  "runSubjectConsolidation",
  "reconcile_population_signals",
  "consolidateSubjectGroup",
  "attach_to_existing_source_file",
  "attach_to_existing_dossier_update",
  "create_dossier_update_workspace",
  "create_source_file_candidate",
  "mark_no_new_info",
  "mark_not_population_subject",
  "dismiss_population_recommendation",
  "reopen_population_recommendation",
  "mark_needs_more_info",
]);

async function isAuthenticated(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((cookie) => {
      const [key, ...value] = cookie.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  const token = cookies[COOKIE_NAME];
  return Boolean(token && (await verifyAdminToken(token)));
}

function validateManualCandidateInput(
  value: unknown,
): CreateManualDossierCandidateInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as CreateManualDossierCandidateInput;
  if (typeof input.name !== "string" || !input.name.trim()) return null;
  if (typeof input.reason !== "string" || !input.reason.trim()) return null;
  return input;
}

function candidateIdFromBody(body: Record<string, unknown>): string {
  return typeof body.candidateId === "string" ? body.candidateId.trim() : "";
}

function draftIdFromBody(body: Record<string, unknown>): string {
  return typeof body.draftId === "string" ? body.draftId.trim() : "";
}

function recommendationIdFromBody(body: Record<string, unknown>): string {
  return typeof body.recommendationId === "string"
    ? body.recommendationId.trim()
    : "";
}

function stringArrayFromBodyValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") return value.split(/\n+/);
  return [];
}

function sourceFileSummaryInputFromBody(
  body: Record<string, unknown>,
): UpdateDossierSourceFileSummaryInput | null {
  const candidateId = candidateIdFromBody(body);
  const value = body.input;
  if (!candidateId || !value || typeof value !== "object") return null;
  const input = value as Partial<UpdateDossierSourceFileSummaryInput>;
  return {
    candidateId,
    summaryText:
      typeof input.summaryText === "string" ? input.summaryText : undefined,
    knownContext: stringArrayFromBodyValue(input.knownContext),
    openQuestions: stringArrayFromBodyValue(input.openQuestions),
    nextAction:
      typeof input.nextAction === "string" ? input.nextAction : undefined,
    updatedBy:
      typeof input.updatedBy === "string" ? input.updatedBy : undefined,
  };
}

function sourceFileNoteInputFromBody(
  body: Record<string, unknown>,
): CreateDossierSourceFileNoteInput | null {
  const candidateId = candidateIdFromBody(body);
  const value = body.input;
  if (!candidateId || !value || typeof value !== "object") return null;
  const input = value as Partial<CreateDossierSourceFileNoteInput>;
  if (typeof input.text !== "string" || !input.text.trim()) return null;
  return {
    candidateId,
    type: input.type,
    text: input.text,
    source: input.source ?? "admin_manual",
    publicSafe: input.publicSafe === true,
    appliesToDraftId: input.appliesToDraftId,
    createdBy: input.createdBy,
  };
}

function sourceFileClaimReviewInputFromBody(
  body: Record<string, unknown>,
): ReviewDossierSourceFileClaimInput | null {
  const candidateId = candidateIdFromBody(body);
  const input = body.input;
  if (!candidateId || !input || typeof input !== "object") return null;
  const value = input as Partial<ReviewDossierSourceFileClaimInput>;
  if (typeof value.claimText !== "string" || !value.claimText.trim()) return null;
  if (typeof value.claimType !== "string" || typeof value.sourceSection !== "string") return null;
  return {
    candidateId,
    claimId: value.claimId,
    claimText: value.claimText,
    claimType: value.claimType as ReviewDossierSourceFileClaimInput["claimType"],
    sourceSection: value.sourceSection,
    decision: value.decision ?? "pending",
    editedText: value.editedText,
    decisionNote: value.decisionNote,
    publicSafe: value.publicSafe === true,
    sourceArchiveId: value.sourceArchiveId,
    sourceRefreshId: value.sourceRefreshId,
    sourceProvenance: value.sourceProvenance,
    decidedBy: value.decidedBy ?? "admin",
  };
}

function identityLinkIdFromBody(body: Record<string, unknown>): string {
  return typeof body.identityLinkId === "string"
    ? body.identityLinkId.trim()
    : "";
}

function identityLinkInputFromBody(body: Record<string, unknown>): {
  candidateId: string;
  label: string;
  type?: DossierIdentityLinkType;
  visibility?: DossierIdentityLinkVisibility;
  source?: DossierIdentityLinkSource;
  confidence?: DossierIdentityLink["confidence"];
  useForMatching?: boolean;
  useInPublicDossier?: boolean;
  note?: string;
  createdBy?: string;
} | null {
  const candidateId = candidateIdFromBody(body);
  const value = body.input;
  if (!candidateId || !value || typeof value !== "object") return null;
  const input = value as Partial<DossierIdentityLink>;
  if (typeof input.label !== "string" || !input.label.trim()) return null;
  return {
    candidateId,
    label: input.label,
    type: input.type,
    visibility: input.visibility,
    source: input.source,
    confidence: input.confidence,
    useForMatching: input.useForMatching === true,
    useInPublicDossier: input.useInPublicDossier === true,
    note: input.note,
    createdBy: input.createdBy,
  };
}

function identityLinkReviewInputFromBody(body: Record<string, unknown>) {
  const candidateId = candidateIdFromBody(body);
  const identityLinkId = identityLinkIdFromBody(body);
  if (!candidateId || !identityLinkId) return null;
  return {
    candidateId,
    identityLinkId,
    reviewedBy:
      typeof body.reviewedBy === "string" ? body.reviewedBy : undefined,
    useForMatching: body.useForMatching === true,
    useInPublicDossier: body.useInPublicDossier === true,
  };
}

function recommendationInputFromBody(
  body: Record<string, unknown>,
): CreateDossierRecommendationInput | null {
  const value = body.input;
  if (!value || typeof value !== "object") return null;
  const input = value as CreateDossierRecommendationInput;
  if (typeof input.subjectName !== "string" || !input.subjectName.trim())
    return null;
  if (typeof input.reason !== "string" || !input.reason.trim()) return null;
  return input;
}

function mergeInputFromBody(
  body: Record<string, unknown>,
): MergeDossierCandidatesInput | null {
  const value = body.input ?? body;
  if (!value || typeof value !== "object") return null;
  const input = value as MergeDossierCandidatesInput;
  if (typeof input.primaryCandidateId !== "string") return null;
  if (!Array.isArray(input.sourceCandidateIds)) return null;
  return input;
}

function draftFieldsFromBody(
  body: Record<string, unknown>,
): DossierDraft["fields"] | null {
  const fields = body.fields ?? body.draftFields;
  if (!fields || typeof fields !== "object") return null;
  const draftFields = fields as DossierDraft["fields"];
  if (typeof draftFields.name !== "string") return null;
  return draftFields;
}


async function verifySourceFileCaseReportAfterImmediateRefresh(input: {
  request: DossierSourceFileRefreshRequest;
  immediateRefresh: Awaited<ReturnType<typeof refreshBnlSourceFileNow>>;
}): Promise<Awaited<ReturnType<typeof refreshBnlSourceFileNow>>> {
  if (!input.immediateRefresh.ok || !input.request.candidateId) {
    return input.immediateRefresh;
  }
  const state = await getDossierWorkflowState();
  const candidate = state.candidates.find(
    (item) => item.id === input.request.candidateId,
  );
  if (!candidate || !sourceFileNeedsCaseReportBackfill(candidate)) {
    return input.immediateRefresh;
  }
  return {
    ...input.immediateRefresh,
    ok: false,
    status: "failed",
    failureReason: "case_report_missing_after_refresh",
  };
}

async function sourceFileWorkflowContextForRefresh(candidateId?: string) {
  if (!candidateId) return undefined;
  try {
    const state = await getDossierWorkflowState();
    const candidate = state.candidates.find((item) => item.id === candidateId);
    return buildDossierSourceFileWorkflowContext({ candidate });
  } catch {
    return undefined;
  }
}

async function workflowPayload(
  state?: DossierWorkflowState,
  populationReconcile?: PopulationReconcileSummary,
  timing?: {
    getDossierWorkflowStateMs?: number;
    workflowPayloadMs?: number;
    refreshNowMs?: number;
  },
): Promise<DossierWorkflowResponse> {
  const payloadStartedAt = Date.now();
  const tagRegistry = buildDossierTagRegistry(databasePage.entries);
  let workflowState = state;
  if (!workflowState) {
    const stateStartedAt = Date.now();
    workflowState = await getDossierWorkflowState();
    if (timing) timing.getDossierWorkflowStateMs = Date.now() - stateStartedAt;
  } else if (timing) {
    timing.getDossierWorkflowStateMs = 0;
  }

  const waitingForOwnerReview = workflowState.drafts.filter(
    (draft) => draft.status === "ready_for_owner_review",
  );

  if (timing) timing.workflowPayloadMs = Date.now() - payloadStartedAt;
  return {
    candidates: workflowState.candidates,
    drafts: workflowState.drafts,
    recommendations: workflowState.recommendations,
    sourceFileRefreshRequests: workflowState.sourceFileRefreshRequests,
    duplicateGroups: buildDossierDuplicateGroups(workflowState),
    ownerReviewQueue: {
      waitingCount: waitingForOwnerReview.length,
      draftCount: workflowState.drafts.length,
      candidateCount: workflowState.candidates.length,
    },
    workflow: {
      version: 1,
      storage: getDossierWorkflowStorageMode(),
      storageKey: "barcode:dossier-workflow:v1",
      status: "candidate_store_enabled",
      updatedAt: workflowState.updatedAt,
      revision: workflowState.revision,
      candidateCount: workflowState.candidates.length,
      draftCount: workflowState.drafts.length,
      allowedActions: DOSSIER_WORKFLOW_ACTIONS,
      rules: DOSSIER_WORKFLOW_RULES,
      scoringPolicy: DOSSIER_CANDIDATE_SCORING_POLICY,
      candidateSourceBoundaries: DOSSIER_SOURCE_BOUNDARIES,
      boundaries: [
        "Manual candidates are admin/operator workflow records only, not published dossiers.",
        "BNL may recommend and draft only after operator selection in a future PR.",
        "Admin operators approve and prepare website dossier entries through future controlled site updates.",
        "This endpoint does not publish, create public records, or mutate src/content.ts.",
        "This endpoint does not invoke BNL, write memory, merge Discord identity, or use payment/customer identity.",
        "Queue frequency is evidence only, not identity.",
        "Owner approval will require an owner secret in a future PR and still will not publish until a publishing workflow exists.",
        "Workflow duplicate detection compares candidate records to each other; published database duplicate detection remains separate.",
        "BNL may later attach evidence to existing candidates or recommend merges from R&D, Discord-safe context, queue recurrence, and the website read model, but this endpoint does not invoke BNL.",
        "Merge actions are manual only: source candidates and drafts are preserved as merged/superseded audit records and master drafts remain unpublished drafts.",
      ],
      ownerGate: {
        status: "placeholder_only",
        requiresOwnerSecretFuture: true,
        approvalPublishes: false,
        message:
          "Owner approval is separate from editor save/submit and remains disabled until a future owner-secret gate PR.",
      },
    },
    authoringGuide: {
      version: dossierAuthoringGuide.version,
      fieldCount: Object.keys(dossierAuthoringGuide.fieldGuide).length,
      draftingRuleCount: dossierAuthoringGuide.draftingRules.length,
    },
    tagRegistry: {
      totalUniqueTags: tagRegistry.totalUniqueTags,
      totalTagAssignments: tagRegistry.totalTagAssignments,
      creationPolicy: tagRegistry.creationPolicy,
    },
    publicDossiers: databasePage.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
    })),
    populationReconcile,
  };
}

function logAdminDossierRouteTiming(input: {
  action: string;
  startedAt: number;
  timing: {
    getDossierWorkflowStateMs?: number;
    workflowPayloadMs?: number;
    refreshNowMs?: number;
  };
  payload: Pick<
    DossierWorkflowResponse,
    "candidates" | "drafts" | "recommendations" | "sourceFileRefreshRequests"
  >;
}) {
  console.info("admin_dossiers_route_timing", {
    action: input.action,
    totalMs: Date.now() - input.startedAt,
    getDossierWorkflowStateMs: input.timing.getDossierWorkflowStateMs ?? 0,
    workflowPayloadMs: input.timing.workflowPayloadMs ?? 0,
    refreshNowMs: input.timing.refreshNowMs ?? 0,
    candidateCount: input.payload.candidates.length,
    draftCount: input.payload.drafts.length,
    recommendationCount: input.payload.recommendations.length,
    sourceFileRefreshRequestCount: input.payload.sourceFileRefreshRequests.length,
  });
}

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const timing = {};
  const payload = await workflowPayload(undefined, undefined, timing);
  logAdminDossierRouteTiming({
    action: "GET",
    startedAt,
    timing,
    payload,
  });
  return NextResponse.json(payload);
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body?.action === "string" ? body.action : "";

  if (!DOSSIER_WORKFLOW_ACTIONS.includes(action as DossierWorkflowAction)) {
    return NextResponse.json(
      { error: "Unknown dossier workflow action" },
      { status: 400 },
    );
  }

  if (!IMPLEMENTED_ACTIONS.has(action as DossierWorkflowAction)) {
    return NextResponse.json(
      {
        ok: false,
        code: "not_implemented_yet",
        action,
        message:
          "Dossier drafting, approval, and publishing mutations remain intentionally disabled in this PR.",
        boundaries: (await workflowPayload()).workflow.boundaries,
      },
      { status: 501 },
    );
  }

  if (action === "detectDuplicateCandidates") {
    const payload = await workflowPayload();
    return NextResponse.json({ ok: true, action, ...payload });
  }

  try {
    if (action === "updateSourceFileSummary") {
      const input = sourceFileSummaryInputFromBody(body);
      if (!input) {
        return NextResponse.json(
          {
            error:
              "Valid candidateId and source file summary input are required",
          },
          { status: 400 },
        );
      }
      const candidate = await updateDossierSourceFileSummary(input);
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, candidate, ...payload });
    }

    if (action === "addSourceFileNote") {
      const input = sourceFileNoteInputFromBody(body);
      if (!input) {
        return NextResponse.json(
          { error: "Valid candidateId and source note text are required" },
          { status: 400 },
        );
      }
      const note = await addDossierSourceFileNote(input);
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, note, ...payload });
    }

    if (action === "reviewSourceFileClaim" || action === "editSourceFileClaim" || action === "resetSourceFileClaimReview") {
      const input = sourceFileClaimReviewInputFromBody(body);
      if (!input) {
        return NextResponse.json(
          { error: "Valid candidateId and Source File claim review input are required" },
          { status: 400 },
        );
      }
      const review = await reviewDossierSourceFileClaim({
        ...input,
        decision: action === "resetSourceFileClaimReview" ? "pending" : input.decision,
        decisionNote: action === "resetSourceFileClaimReview" ? undefined : input.decisionNote,
      });
      const payload = await workflowPayload();
      return NextResponse.json({
        ok: true,
        action,
        review,
        message: "Claim decision saved. Refresh BNL Source File to let BNL update the analyst read.",
        ...payload,
      });
    }

    if (action === "recordSourceFileOpen") {
      const startedAt = Date.now();
      const timing = { refreshNowMs: 0 };
      const candidateId = candidateIdFromBody(body);
      if (!candidateId) {
        return NextResponse.json(
          { error: "Source File open tracking requires candidateId" },
          { status: 400 },
        );
      }
      const openedAt = new Date().toISOString();
      const requestingSiteOrigin = trustedRequestingSiteOrigin(req);
      const refresh = await recordDossierSourceFileOpen({
        candidateId,
        requestedBy: "admin_open_source_file",
      });
      const immediateRefresh = refresh.request
        ? {
            ok: false,
            status: "pending" as const,
            failureReason:
              "BNL refresh requested; latest-known Source File data is shown while refresh completes in the background.",
            callbackBaseSent: false,
            callbackBaseHost: requestingSiteOrigin
              ? new URL(requestingSiteOrigin).host
              : undefined,
          }
        : {
            ok: false,
            status: "skipped" as const,
            failureReason: refresh.decision.reason,
            callbackBaseSent: false,
          };
      const payload = await workflowPayload(undefined, undefined, timing);
      logAdminDossierRouteTiming({
        action,
        startedAt,
        timing,
        payload,
      });
      return NextResponse.json({
        ok: true,
        action,
        openedAt,
        refresh,
        immediateRefresh,
        ...payload,
      });
    }

    if (action === "requestSourceFileRefresh") {
      const candidateId = candidateIdFromBody(body);
      if (!candidateId) {
        return NextResponse.json(
          { error: "BNL refresh request requires candidateId" },
          { status: 400 },
        );
      }
      const requestingSiteOrigin = trustedRequestingSiteOrigin(req);
      const refresh = await requestDossierSourceFileRefresh({
        candidateId,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        requestSource: "manual_admin",
        requestedBy: "admin_manual",
      });
      const immediateRefreshRaw = await refreshBnlSourceFileNow({
        request: refresh.request,
        source: "admin_manual",
        requestingSiteOrigin,
        sourceFileWorkflowContext: await sourceFileWorkflowContextForRefresh(refresh.request.candidateId),
      });
      const immediateRefresh = await verifySourceFileCaseReportAfterImmediateRefresh({
        request: refresh.request,
        immediateRefresh: immediateRefreshRaw,
      });
      if (immediateRefresh.ok) {
        await updateDossierSourceFileRefreshRequestStatus({
          requestId: refresh.request.id,
          status: "completed",
          completedByRecommendationId: immediateRefresh.recommendationId,
        });
      } else if (immediateRefresh.status !== "unavailable") {
        await updateDossierSourceFileRefreshRequestStatus({
          requestId: refresh.request.id,
          status:
            immediateRefresh.status === "skipped" ? "skipped" : "failed",
          failureReason: immediateRefresh.failureReason,
        });
      }
      const payload = await workflowPayload();
      return NextResponse.json({
        ok: true,
        action,
        refresh,
        immediateRefresh,
        message: immediateRefresh.ok
          ? "BNL Source File updated immediately."
          : "BNL Source File immediate update did not complete. Retry from the status button.",
        ...payload,
      });
    }

    if (action === "addDossierIdentityLink") {
      const input = identityLinkInputFromBody(body);
      if (!input) {
        return NextResponse.json(
          { error: "Valid candidateId and identity link label are required" },
          { status: 400 },
        );
      }
      const identityLink = await addDossierIdentityLink(input);
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, identityLink, ...payload });
    }

    if (action === "updateDossierIdentityLink") {
      const input = identityLinkInputFromBody(body);
      const identityLinkId = identityLinkIdFromBody(body);
      if (!input || !identityLinkId) {
        return NextResponse.json(
          {
            error:
              "Valid candidateId, identityLinkId, and identity link label are required",
          },
          { status: 400 },
        );
      }
      const identityLink = await updateDossierIdentityLink({
        ...input,
        identityLinkId,
      });
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, identityLink, ...payload });
    }

    if (
      action === "confirmDossierIdentityLink" ||
      action === "rejectDossierIdentityLink" ||
      action === "retireDossierIdentityLink"
    ) {
      const input = identityLinkReviewInputFromBody(body);
      if (!input) {
        return NextResponse.json(
          { error: "candidateId and identityLinkId are required" },
          { status: 400 },
        );
      }
      const identityLink =
        action === "confirmDossierIdentityLink"
          ? await confirmDossierIdentityLink(input)
          : action === "rejectDossierIdentityLink"
            ? await rejectDossierIdentityLink(input)
            : await retireDossierIdentityLink(input);
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, identityLink, ...payload });
    }

    if (action === "runSubjectConsolidation" || action === "consolidateSubjectGroup") {
      const groupId = typeof body.groupId === "string" ? body.groupId.trim() : undefined;
      if (action === "consolidateSubjectGroup" && !groupId) {
        return NextResponse.json(
          { error: "groupId is required" },
          { status: 400 },
        );
      }
      const consolidation = await runSubjectConsolidation(
        action === "consolidateSubjectGroup" ? { groupId } : {},
      );
      const payload = await workflowPayload();
      return NextResponse.json({
        ok: true,
        action,
        consolidation,
        ...payload,
      });
    }

    if (action === "reconcile_population_signals") {
      const populationReconcile = await reconcilePopulationSignals({ actionBy: typeof body.actionBy === "string" ? body.actionBy : "admin" });
      const payload = await workflowPayload(undefined, populationReconcile);
      return NextResponse.json({
        ok: true,
        action,
        ...payload,
      });
    }

    if (action === "createDossierRecommendation") {
      const input = recommendationInputFromBody(body);
      if (!input) {
        return NextResponse.json(
          { error: "Recommendation subjectName and reason are required" },
          { status: 400 },
        );
      }
      const recommendation = await createDossierRecommendation(input);
      const payload = await workflowPayload();
      return NextResponse.json({
        ok: true,
        action,
        recommendation,
        ...payload,
      });
    }


    if (
      action === "attach_to_existing_source_file" ||
      action === "attach_to_existing_dossier_update" ||
      action === "create_dossier_update_workspace" ||
      action === "create_source_file_candidate" ||
      action === "mark_no_new_info" ||
      action === "mark_not_population_subject" ||
      action === "dismiss_population_recommendation" ||
      action === "reopen_population_recommendation" ||
      action === "mark_needs_more_info"
    ) {
      const recommendationId = recommendationIdFromBody(body);
      if (!recommendationId) {
        return NextResponse.json(
          { error: "recommendationId is required" },
          { status: 400 },
        );
      }
      const result = await applyPopulationReviewRecommendationAction({
        recommendationId,
        action,
        candidateId: candidateIdFromBody(body) || undefined,
        dossierId: typeof body.dossierId === "string" ? body.dossierId : undefined,
        actionBy: typeof body.actionBy === "string" ? body.actionBy : "admin",
        actionReason: typeof body.actionReason === "string" ? body.actionReason : undefined,
      });
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, ...result, ...payload });
    }

    if (action === "createIdentityLinkFromRecommendation") {
      const input = identityLinkInputFromBody(body);
      const recommendationId = recommendationIdFromBody(body);
      if (!input || !recommendationId) {
        return NextResponse.json(
          {
            error:
              "recommendationId, candidateId, and identity link label are required",
          },
          { status: 400 },
        );
      }
      const result = await createIdentityLinkFromRecommendation({
        recommendationId,
        candidateId: input.candidateId,
        label: input.label,
        type: input.type,
        visibility: input.visibility,
        source: input.source,
        note: input.note,
        useForMatchingAfterConfirmation:
          body.useForMatchingAfterConfirmation === false ||
          (body.input as Record<string, unknown> | undefined)
            ?.useForMatchingAfterConfirmation === false
            ? false
            : true,
        useInPublicDossier: input.useInPublicDossier,
        createdBy: input.createdBy,
      });
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, ...result, ...payload });
    }

    if (action === "attachRecommendationToCandidate") {
      const recommendationId = recommendationIdFromBody(body);
      const candidateId = candidateIdFromBody(body);
      if (!recommendationId || !candidateId) {
        return NextResponse.json(
          { error: "recommendationId and candidateId are required" },
          { status: 400 },
        );
      }
      const attachment = await attachRecommendationToCandidate({
        recommendationId,
        candidateId,
        createSourceNote: body.createSourceNote === true,
      });
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, ...attachment, ...payload });
    }

    if (action === "convertRecommendationToCandidate") {
      const recommendationId = recommendationIdFromBody(body);
      if (!recommendationId) {
        return NextResponse.json(
          { error: "recommendationId is required" },
          { status: 400 },
        );
      }
      const conversion =
        await convertRecommendationToCandidate(recommendationId);
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, ...conversion, ...payload });
    }

    if (
      action === "attachCandidateToExistingDossier" ||
      action === "markCandidateAsExistingDossierUpdate"
    ) {
      const candidateId = candidateIdFromBody(body);
      const dossierId =
        typeof body.dossierId === "string"
          ? body.dossierId.trim()
          : typeof (body.input as Record<string, unknown> | undefined)
                ?.dossierId === "string"
            ? String((body.input as Record<string, unknown>).dossierId).trim()
            : "";
      const confidenceValue =
        typeof body.confidence === "string"
          ? body.confidence
          : (body.input as Record<string, unknown> | undefined)?.confidence;
      const confidence =
        confidenceValue === "low" ||
        confidenceValue === "medium" ||
        confidenceValue === "high"
          ? confidenceValue
          : undefined;
      if (!candidateId) {
        return NextResponse.json(
          { error: "candidateId is required" },
          { status: 400 },
        );
      }
      const candidate =
        action === "attachCandidateToExistingDossier"
          ? dossierId
            ? await attachCandidateToExistingDossier({
                candidateId,
                dossierId,
                confidence,
              })
            : null
          : await markCandidateAsExistingDossierUpdate({
              candidateId,
              dossierId: dossierId || undefined,
              confidence,
            });
      if (!candidate) {
        return NextResponse.json(
          {
            error: dossierId ? "Candidate not found" : "dossierId is required",
          },
          { status: dossierId ? 404 : 400 },
        );
      }
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, candidate, ...payload });
    }

    if (
      action === "promoteCandidateToSourceFile" ||
      action === "archiveCandidate" ||
      action === "restoreCandidate"
    ) {
      const candidateId = candidateIdFromBody(body);
      if (!candidateId) {
        return NextResponse.json(
          { error: "candidateId is required" },
          { status: 400 },
        );
      }
      const candidate =
        action === "promoteCandidateToSourceFile"
          ? await promoteCandidateToSourceFile(candidateId)
          : action === "archiveCandidate"
            ? await archiveDossierCandidate(candidateId)
            : await restoreDossierCandidate(candidateId);
      if (!candidate) {
        return NextResponse.json(
          { error: "Candidate not found" },
          { status: 404 },
        );
      }
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, candidate, ...payload });
    }

    if (action === "permanentlyDeleteCandidate") {
      const candidateId = candidateIdFromBody(body);
      const confirmation =
        typeof body.confirmation === "string" ? body.confirmation : "";
      if (!candidateId) {
        return NextResponse.json(
          { error: "candidateId is required" },
          { status: 400 },
        );
      }
      const deletion = await permanentlyDeleteDossierCandidate({
        candidateId,
        confirmation,
      });
      const payload = await workflowPayload();
      return NextResponse.json({ ok: true, action, deletion, ...payload });
    }

    if (
      action === "ignoreDossierRecommendation" ||
      action === "dismissDossierRecommendation" ||
      action === "archiveDossierRecommendation"
    ) {
      const recommendationId = recommendationIdFromBody(body);
      if (!recommendationId) {
        return NextResponse.json(
          { error: "recommendationId is required" },
          { status: 400 },
        );
      }
      const recommendation =
        action === "ignoreDossierRecommendation"
          ? await ignoreDossierRecommendation(recommendationId)
          : action === "dismissDossierRecommendation"
            ? await dismissDossierRecommendation(recommendationId)
            : await archiveDossierRecommendation(recommendationId);
      const payload = await workflowPayload();
      return NextResponse.json({
        ok: true,
        action,
        recommendation,
        ...payload,
      });
    }
  } catch (error) {
    if (error instanceof DossierWorkflowInputError) {
      return NextResponse.json(
        { error: error.message, code: error.code, ...error.details },
        { status: error.status },
      );
    }
    throw error;
  }

  if (action === "mergeCandidates") {
    const input = mergeInputFromBody(body);
    if (!input) {
      return NextResponse.json(
        { error: "Valid merge input is required" },
        { status: 400 },
      );
    }

    try {
      const merge = await mergeDossierCandidates(input);
      if (!merge) {
        return NextResponse.json(
          { error: "Merge did not update workflow state" },
          { status: 400 },
        );
      }
      const payload = await workflowPayload();
      return NextResponse.json({
        ok: true,
        action,
        merge,
        candidate: merge.masterCandidate,
        draft: merge.masterDraft,
        ...payload,
      });
    } catch (error) {
      if (error instanceof DossierMergeError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      throw error;
    }
  }

  if (action === "createManualCandidate") {
    const input = validateManualCandidateInput(
      body.input ?? body.candidate ?? body,
    );
    if (!input) {
      return NextResponse.json(
        { error: "Manual candidate name and reason are required" },
        { status: 400 },
      );
    }

    const candidate = await createManualDossierCandidate(input);
    const payload = await workflowPayload();
    return NextResponse.json({ ok: true, action, candidate, ...payload });
  }

  if (action === "createDraftFromCandidate") {
    const candidateId = candidateIdFromBody(body);
    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId is required" },
        { status: 400 },
      );
    }

    const draft = await createDraftFromCandidate(candidateId);
    if (!draft) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    }

    const payload = await workflowPayload();
    return NextResponse.json({ ok: true, action, draft, ...payload });
  }

  if (action === "requestBnlDraftFromCandidate") {
    const candidateId = candidateIdFromBody(body);
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
    }
    const draftId = draftIdFromBody(body) || undefined;
    const bnlDraftRequest = await requestBnlDraftFromCandidate(candidateId, draftId);
    const payload = await workflowPayload();
    return NextResponse.json({
      ok: bnlDraftRequest.result.status !== "failed",
      action,
      bnlDraft: bnlDraftRequest.result,
      draftStored: bnlDraftRequest.draftStored,
      storedDraft: bnlDraftRequest.storedDraft,
      existingDraft: bnlDraftRequest.existingDraft,
      ...payload,
    });
  }

  if (action === "updateDraftFromSourceFile") {
    const draftId = draftIdFromBody(body);
    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required" },
        { status: 400 },
      );
    }

    const draft = await updateDraftFromSourceFile(draftId);
    if (!draft) {
      return NextResponse.json(
        { error: "Draft not found or cannot be updated from Source File" },
        { status: 404 },
      );
    }

    const payload = await workflowPayload();
    return NextResponse.json({ ok: true, action, draft, ...payload });
  }

  if (action === "saveDraft") {
    const draftId = draftIdFromBody(body);
    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required" },
        { status: 400 },
      );
    }

    const fields = draftFieldsFromBody(body);
    if (!fields) {
      return NextResponse.json(
        { error: "Valid draft fields are required" },
        { status: 400 },
      );
    }

    const draft = await saveDossierDraft(draftId, fields);
    if (!draft) {
      return NextResponse.json(
        { error: "Draft not found or not editable" },
        { status: 404 },
      );
    }

    const payload = await workflowPayload();
    return NextResponse.json({ ok: true, action, draft, ...payload });
  }

  if (action === "submitDraftForOwnerReview") {
    const draftId = draftIdFromBody(body);
    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required" },
        { status: 400 },
      );
    }

    const currentState = await getDossierWorkflowState();
    const currentDraft = currentState.drafts.find(
      (draft) => draft.id === draftId,
    );
    if (!currentDraft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const missingFields = validateDossierDraftFieldsForOwnerReview(
      currentDraft.fields,
    );
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "Draft is missing required fields for owner review",
          code: "invalid_draft_fields",
          missingFields,
        },
        { status: 400 },
      );
    }

    const draft = await submitDraftForOwnerReview(draftId);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const payload = await workflowPayload();
    return NextResponse.json({ ok: true, action, draft, ...payload });
  }

  const candidateId = candidateIdFromBody(body);
  if (!candidateId) {
    return NextResponse.json(
      { error: "candidateId is required" },
      { status: 400 },
    );
  }

  const nextStatus: DossierCandidateStatus =
    action === "denyCandidate" ? "denied" : "needs_more_evidence";
  const candidate = await updateDossierCandidateStatus(candidateId, nextStatus);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const payload = await workflowPayload();
  return NextResponse.json({ ok: true, action, candidate, ...payload });
}
