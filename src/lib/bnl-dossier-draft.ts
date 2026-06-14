import {
  buildDossierStylePacket,
  DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS,
  validateDossierDraftContractOutput,
  type DossierDraftContractOutput,
} from "@/lib/dossier-style-packet";
import {
  containsDossierPublicCopyJunk,
  validateDossierPublicDraftFields,
} from "@/lib/dossier-public-copy-guard";
import { createDossierDraftBlueprint } from "@/lib/dossier-classification";
import type {
  DossierCandidate,
  DossierDraft,
  DossierRecommendation,
  DossierSourceFileNote,
} from "@/lib/dossier-workflow";

export type BnlDossierDraftRequestPacket = {
  version: "1.0";
  requestType: "bnl_proposed_dossier_draft";
  candidate: {
    sourceFileId: string;
    subjectName: string;
    sourceCandidateUpdatedAt?: string;
  };
  sourceFileSummary: DossierCandidate["sourceFileSummary"] | null;
  publicSafeFacts: string[];
  publicSafeNotes: Array<
    Pick<DossierSourceFileNote, "id" | "type" | "text" | "source" | "updatedAt">
  >;
  reviewOnlyWarnings: string[];
  doNotSayNotes: string[];
  missingInfo: string[];
  identityAliasStatus: {
    publicSafeIdentityLabels: string[];
    internalAliasCount: number;
    needsConfirmation: boolean;
    status: DossierCandidate["identityReviewStatus"];
  };
  sourceUsageSummary: {
    sourceFileNoteIds: string[];
    recommendationIds: string[];
    sourceLanes: string[];
  };
  currentDraft?: DossierDraft["fields"];
  stylePacket: ReturnType<typeof buildDossierStylePacket>;
  fieldRequirements: string[];
  forbiddenPublicCopyPatterns: readonly string[];
  ownerReviewRules: string[];
  sourceBoundaryRules: string[];
};

export type BnlDossierDraftResponse = DossierDraftContractOutput;

export type BnlDossierDraftValidationResult = {
  valid: boolean;
  issues: string[];
  warnings: string[];
};

export type BnlDossierDraftGeneratorResult =
  | { status: "not_connected"; message: string; packet: BnlDossierDraftRequestPacket }
  | { status: "failed"; message: string; packet: BnlDossierDraftRequestPacket }
  | {
      status: "received";
      packet: BnlDossierDraftRequestPacket;
      response: BnlDossierDraftResponse;
      validation: BnlDossierDraftValidationResult;
    };

function cleanList(values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

export function buildBnlDossierDraftRequestPacket(input: {
  candidate: DossierCandidate;
  recommendations: DossierRecommendation[];
  currentDraft?: DossierDraft | null;
}): BnlDossierDraftRequestPacket {
  const { candidate, recommendations, currentDraft } = input;
  const blueprint = createDossierDraftBlueprint({ candidate, recommendations });
  const stylePacket = buildDossierStylePacket();
  const publicSafeNotes = (candidate.sourceFileNotes ?? []).filter(
    (note) => note.status === "active" && note.publicSafe === true,
  );
  const publicSafeIdentityLabels = (candidate.identityLinks ?? [])
    .filter(
      (link) =>
        link.status === "confirmed" &&
        link.visibility === "public_safe" &&
        link.useInPublicDossier,
    )
    .map((link) => link.label);
  const internalAliasCount = (candidate.identityLinks ?? []).filter(
    (link) => link.visibility === "internal_only" || !link.useInPublicDossier,
  ).length;

  return {
    version: "1.0",
    requestType: "bnl_proposed_dossier_draft",
    candidate: {
      sourceFileId: candidate.id,
      subjectName: candidate.name,
      sourceCandidateUpdatedAt: candidate.updatedAt,
    },
    sourceFileSummary: candidate.sourceFileSummary ?? null,
    publicSafeFacts: cleanList([
      ...(candidate.knownFacts ?? []),
      ...blueprint.publicSafeFacts.confirmedPublicFacts,
      ...blueprint.publicSafeFacts.publicRoleHints,
    ]),
    publicSafeNotes: publicSafeNotes.map(({ id, type, text, source, updatedAt }) => ({
      id,
      type,
      text,
      source,
      updatedAt,
    })),
    reviewOnlyWarnings: cleanList([
      ...blueprint.ownerReviewWarnings,
      ...(candidate.publicSafetyNotes ?? []),
    ]),
    doNotSayNotes: cleanList([
      ...(candidate.doNotSay ?? []),
      ...blueprint.adminOnlyProvenance.reviewOnlyEvidence.internalNotes,
    ]),
    missingInfo: cleanList([...(candidate.missingInfo ?? []), ...blueprint.missingInfoQuestions]),
    identityAliasStatus: {
      publicSafeIdentityLabels,
      internalAliasCount,
      needsConfirmation: candidate.identityReviewStatus === "needs_confirmation",
      status: candidate.identityReviewStatus,
    },
    sourceUsageSummary: {
      sourceFileNoteIds: publicSafeNotes.map((note) => note.id),
      recommendationIds: recommendations.map((recommendation) => recommendation.id),
      sourceLanes: cleanList(
        recommendations.flatMap((recommendation) => recommendation.sourceLanes),
      ),
    },
    ...(currentDraft ? { currentDraft: currentDraft.fields } : {}),
    stylePacket,
    fieldRequirements: [...DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS],
    forbiddenPublicCopyPatterns: stylePacket.forbiddenPublicCopyPatterns,
    ownerReviewRules: stylePacket.ownerReviewRules,
    sourceBoundaryRules: stylePacket.sourceBoundaryRules,
  };
}

export function validateBnlDossierDraftResponse(
  response: BnlDossierDraftResponse,
): BnlDossierDraftValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  for (const field of [
    "name",
    "category",
    "kind",
    "ecosystemLane",
    "identityAuthority",
    "status",
    "clearance",
    "origin",
    "role",
    "summary",
    "notes",
    "sourceUsageSummary",
  ] as const) {
    if (typeof response[field] !== "string" || !response[field].trim()) issues.push(`${field} is required`);
  }
  for (const field of [
    "tags",
    "proposedTags",
    "links",
    "files",
    "missingInfoQuestions",
    "ownerReviewWarnings",
    "publicSafetyWarnings",
    "unsupportedClaimsRejected",
  ] as const) {
    if (!Array.isArray(response[field])) issues.push(`${field} must be an array`);
  }
  if (Array.isArray(response.files) && response.files.length > 0) issues.push("files must be empty unless safely supported");
  const contract = validateDossierDraftContractOutput(response);
  for (const issue of contract.issues) issues.push(`${issue.field}: ${issue.message}`);
  for (const warning of validateDossierPublicDraftFields({
    ...response,
    primaryLink: response.primaryLink ?? undefined,
  })) {
    warnings.push(warning.message);
  }
  for (const [field, value] of Object.entries({
    role: response.role,
    summary: response.summary,
    notes: response.notes,
  })) {
    if (typeof value === "string" && containsDossierPublicCopyJunk(value)) issues.push(`${field} contains forbidden internal/source copy`);
  }
  return { valid: issues.length === 0, issues, warnings };
}

export async function requestBnlDossierDraft(input: {
  packet: BnlDossierDraftRequestPacket;
  timeoutMs?: number;
}): Promise<BnlDossierDraftGeneratorResult> {
  const url = process.env.BNL_DOSSIER_DRAFT_GENERATOR_URL?.trim();
  const token = process.env.BNL_DOSSIER_DRAFT_GENERATOR_TOKEN?.trim();
  if (!url || !token) {
    return {
      status: "not_connected",
      message: "BNL draft generator not connected yet.",
      packet: input.packet,
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-BNL-DOSSIER-DRAFT-TOKEN": token,
      },
      body: JSON.stringify(input.packet),
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return {
        status: "failed",
        message: `BNL draft generator returned HTTP ${res.status}.`,
        packet: input.packet,
      };
    }
    const response = (body.draft ?? body) as BnlDossierDraftResponse;
    return {
      status: "received",
      packet: input.packet,
      response,
      validation: validateBnlDossierDraftResponse(response),
    };
  } catch (error) {
    return {
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "BNL draft generator request failed.",
      packet: input.packet,
    };
  } finally {
    clearTimeout(timeout);
  }
}
