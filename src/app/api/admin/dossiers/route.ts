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
  type DossierCandidate,
  type DossierDraft,
  type DossierWorkflowAction,
} from "@/lib/dossier-workflow";

export const dynamic = "force-dynamic";

type DossierWorkflowResponse = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  workflow: {
    version: 1;
    storage: "not_configured_foundation_only";
    status: "foundation_only";
    allowedActions: DossierWorkflowAction[];
    rules: typeof DOSSIER_WORKFLOW_RULES;
    scoringPolicy: typeof DOSSIER_CANDIDATE_SCORING_POLICY;
    candidateSourceBoundaries: typeof DOSSIER_SOURCE_BOUNDARIES;
    boundaries: string[];
  };
  authoringGuide: {
    version: typeof dossierAuthoringGuide.version;
  };
  tagRegistry: {
    totalUniqueTags: number;
    totalTagAssignments: number;
    creationPolicy: ReturnType<typeof buildDossierTagRegistry>["creationPolicy"];
  };
};

async function isAuthenticated(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map((cookie) => {
    const [key, ...value] = cookie.trim().split("=");
    return [key, value.join("=")];
  }));
  const token = cookies[COOKIE_NAME];
  return Boolean(token && (await verifyAdminToken(token)));
}

function workflowPayload(): DossierWorkflowResponse {
  const tagRegistry = buildDossierTagRegistry(databasePage.entries);

  return {
    candidates: [],
    drafts: [],
    workflow: {
      version: 1,
      storage: "not_configured_foundation_only",
      status: "foundation_only",
      allowedActions: DOSSIER_WORKFLOW_ACTIONS,
      rules: DOSSIER_WORKFLOW_RULES,
      scoringPolicy: DOSSIER_CANDIDATE_SCORING_POLICY,
      candidateSourceBoundaries: DOSSIER_SOURCE_BOUNDARIES,
      boundaries: [
        "BNL may recommend and draft only after operator selection.",
        "Admin operators approve and prepare website dossier entries.",
        "This endpoint does not publish, create public records, or mutate src/content.ts.",
        "This endpoint does not invoke BNL, write memory, merge Discord identity, or use payment/customer identity.",
        "Queue frequency is evidence only, not identity.",
      ],
    },
    authoringGuide: {
      version: dossierAuthoringGuide.version,
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

  return NextResponse.json(workflowPayload());
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";

  if (!DOSSIER_WORKFLOW_ACTIONS.includes(action as DossierWorkflowAction)) {
    return NextResponse.json({ error: "Unknown dossier workflow action" }, { status: 400 });
  }

  return NextResponse.json({
    ok: false,
    code: "not_implemented_yet",
    action,
    message: "Dossier workflow mutations are intentionally disabled in this foundation PR.",
    boundaries: workflowPayload().workflow.boundaries,
  }, { status: 501 });
}
