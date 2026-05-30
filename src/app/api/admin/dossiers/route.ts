import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { databasePage } from "@/content";
import { dossierAuthoringGuide } from "@/lib/dossier-authoring-guide";
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
  type DossierCandidateStatus,
  type DossierDraft,
  type DossierDuplicateGroup,
  type DossierRecommendation,
  type DossierWorkflowAction,
  type MergeDossierCandidatesInput,
} from "@/lib/dossier-workflow";
import {
  addDossierIdentityLink,
  addDossierSourceFileNote,
  attachRecommendationToCandidate,
  createIdentityLinkFromRecommendation,
  confirmDossierIdentityLink,
  buildDossierDuplicateGroups,
  convertRecommendationToCandidate,
  createDossierRecommendation,
  createDraftFromCandidate,
  createManualDossierCandidate,
  dismissDossierRecommendation,
  DossierMergeError,
  DossierWorkflowInputError,
  getDossierWorkflowState,
  getDossierWorkflowStorageMode,
  ignoreDossierRecommendation,
  rejectDossierIdentityLink,
  retireDossierIdentityLink,
  mergeDossierCandidates,
  saveDossierDraft,
  submitDraftForOwnerReview,
  updateDossierCandidateStatus,
  updateDossierIdentityLink,
  validateDossierDraftFieldsForOwnerReview,
  type DossierWorkflowState,
} from "@/lib/dossier-workflow-store";

export const dynamic = "force-dynamic";

type DossierWorkflowResponse = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  recommendations: DossierRecommendation[];
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
};

const IMPLEMENTED_ACTIONS = new Set<DossierWorkflowAction>([
  "createManualCandidate",
  "createDraftFromCandidate",
  "saveDraft",
  "submitDraftForOwnerReview",
  "denyCandidate",
  "markNeedsMoreEvidence",
  "detectDuplicateCandidates",
  "mergeCandidates",
  "addSourceFileNote",
  "addDossierIdentityLink",
  "createIdentityLinkFromRecommendation",
  "updateDossierIdentityLink",
  "confirmDossierIdentityLink",
  "rejectDossierIdentityLink",
  "retireDossierIdentityLink",
  "createDossierRecommendation",
  "attachRecommendationToCandidate",
  "convertRecommendationToCandidate",
  "ignoreDossierRecommendation",
  "dismissDossierRecommendation",
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


function identityLinkIdFromBody(body: Record<string, unknown>): string {
  return typeof body.identityLinkId === "string"
    ? body.identityLinkId.trim()
    : "";
}

function identityLinkInputFromBody(
  body: Record<string, unknown>,
): {
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
    reviewedBy: typeof body.reviewedBy === "string" ? body.reviewedBy : undefined,
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

async function workflowPayload(
  state?: DossierWorkflowState,
): Promise<DossierWorkflowResponse> {
  const tagRegistry = buildDossierTagRegistry(databasePage.entries);
  const workflowState = state ?? (await getDossierWorkflowState());

  const waitingForOwnerReview = workflowState.drafts.filter(
    (draft) => draft.status === "ready_for_owner_review",
  );

  return {
    candidates: workflowState.candidates,
    drafts: workflowState.drafts,
    recommendations: workflowState.recommendations,
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
  };
}

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await workflowPayload());
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
          { error: "Valid candidateId, identityLinkId, and identity link label are required" },
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

    if (action === "createIdentityLinkFromRecommendation") {
      const input = identityLinkInputFromBody(body);
      const recommendationId = recommendationIdFromBody(body);
      if (!input || !recommendationId) {
        return NextResponse.json(
          { error: "recommendationId, candidateId, and identity link label are required" },
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
      action === "ignoreDossierRecommendation" ||
      action === "dismissDossierRecommendation"
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
          : await dismissDossierRecommendation(recommendationId);
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
