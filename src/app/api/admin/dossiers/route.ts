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
  type DossierCandidateStatus,
  type DossierDraft,
  type DossierWorkflowAction,
} from "@/lib/dossier-workflow";
import {
  createManualDossierCandidate,
  getDossierWorkflowState,
  getDossierWorkflowStorageMode,
  updateDossierCandidateStatus,
  type DossierWorkflowState,
} from "@/lib/dossier-workflow-store";

export const dynamic = "force-dynamic";

type DossierWorkflowResponse = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
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
  };
  authoringGuide: {
    version: typeof dossierAuthoringGuide.version;
    fieldCount: number;
    draftingRuleCount: number;
  };
  tagRegistry: {
    totalUniqueTags: number;
    totalTagAssignments: number;
    creationPolicy: ReturnType<typeof buildDossierTagRegistry>["creationPolicy"];
  };
};

const IMPLEMENTED_ACTIONS = new Set<DossierWorkflowAction>([
  "createManualCandidate",
  "denyCandidate",
  "markNeedsMoreEvidence",
]);

async function isAuthenticated(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map((cookie) => {
    const [key, ...value] = cookie.trim().split("=");
    return [key, value.join("=")];
  }));
  const token = cookies[COOKIE_NAME];
  return Boolean(token && (await verifyAdminToken(token)));
}

function validateManualCandidateInput(value: unknown): CreateManualDossierCandidateInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as CreateManualDossierCandidateInput;
  if (typeof input.name !== "string" || !input.name.trim()) return null;
  if (typeof input.reason !== "string" || !input.reason.trim()) return null;
  return input;
}

function candidateIdFromBody(body: Record<string, unknown>): string {
  return typeof body.candidateId === "string" ? body.candidateId.trim() : "";
}

async function workflowPayload(state?: DossierWorkflowState): Promise<DossierWorkflowResponse> {
  const tagRegistry = buildDossierTagRegistry(databasePage.entries);
  const workflowState = state ?? await getDossierWorkflowState();

  return {
    candidates: workflowState.candidates,
    drafts: workflowState.drafts,
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
      ],
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

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body?.action === "string" ? body.action : "";

  if (!DOSSIER_WORKFLOW_ACTIONS.includes(action as DossierWorkflowAction)) {
    return NextResponse.json({ error: "Unknown dossier workflow action" }, { status: 400 });
  }

  if (!IMPLEMENTED_ACTIONS.has(action as DossierWorkflowAction)) {
    return NextResponse.json({
      ok: false,
      code: "not_implemented_yet",
      action,
      message: "Dossier drafting, approval, and publishing mutations remain intentionally disabled in this PR.",
      boundaries: (await workflowPayload()).workflow.boundaries,
    }, { status: 501 });
  }

  if (action === "createManualCandidate") {
    const input = validateManualCandidateInput(body.input ?? body.candidate ?? body);
    if (!input) {
      return NextResponse.json({ error: "Manual candidate name and reason are required" }, { status: 400 });
    }

    const candidate = await createManualDossierCandidate(input);
    const payload = await workflowPayload();
    return NextResponse.json({ ok: true, action, candidate, ...payload });
  }

  const candidateId = candidateIdFromBody(body);
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  const nextStatus: DossierCandidateStatus = action === "denyCandidate" ? "denied" : "needs_more_evidence";
  const candidate = await updateDossierCandidateStatus(candidateId, nextStatus);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const payload = await workflowPayload();
  return NextResponse.json({ ok: true, action, candidate, ...payload });
}
