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
  safeClassification: {
    category: DossierDraft["fields"]["category"];
    kind: DossierDraft["fields"]["kind"];
    ecosystemLane: DossierDraft["fields"]["ecosystemLane"];
  };
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
    safeClassification: {
      category: candidate.recommendedCategory ?? blueprint.classification.category,
      kind: candidate.recommendedKind ?? blueprint.classification.kind,
      ecosystemLane:
        candidate.recommendedEcosystemLane ?? blueprint.classification.ecosystemLane,
    },
    stylePacket,
    fieldRequirements: [...DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS],
    forbiddenPublicCopyPatterns: stylePacket.forbiddenPublicCopyPatterns,
    ownerReviewRules: stylePacket.ownerReviewRules,
    sourceBoundaryRules: stylePacket.sourceBoundaryRules,
  };
}

export type BnlDossierDraftValidationContext = {
  packet?: BnlDossierDraftRequestPacket;
  response?: BnlDossierDraftResponse;
};

const QUEUE_MUSIC_EVIDENCE_REGEX =
  /\b(?:artist|music|musician|producer|song|track|album|release|submission|submitted|queue|auxchord|radio|performance|performer|dj)\b/i;

const PAYMENT_PRIORITY_REGEX =
  /\b(?:stripe|payment|paid|checkout|priority\s+signal|priority|tier|invoice|receipt|purchase|customer)\b/i;

const BNL_PUBLIC_SAFE_EVIDENCE_SOURCE_REGEX =
  /\b(?:active public-safe broadcast memory|public-safe broadcast memory summar(?:y|ies)|public-safe structured entity evidence summar(?:y|ies)|public-safe entity intelligence facts?|site public read-model context)\b/i;

const BNL_SUBJECT_MATCHED_PUBLIC_CONTEXT_REGEX =
  /\b(?:official public dossier authority|matching current public dossier context)\b/i;

const UNSAFE_SOURCE_USAGE_REGEX =
  /\b(?:private|source-blind|review-only|internal|admin-only|payment|priority|stripe|checkout|customer)\b/i;

const PUBLIC_NOTES_REVIEW_WARNING_REGEX =
  /\b(?:Owner Review|Admin-only|review-only|must not be copied into public text|not public|source-blind|missing info|needs review before claiming)\b/i;

function normalizeSupportText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function packetAllowsQueueMusicEvidence(
  packet?: BnlDossierDraftRequestPacket,
): boolean {
  if (!packet) return false;
  const safeText = [
    ...packet.publicSafeFacts,
    ...packet.publicSafeNotes.map((note) => note.text),
  ].join("\n");
  if (QUEUE_MUSIC_EVIDENCE_REGEX.test(safeText)) return true;

  if (
    packet.safeClassification.category === "Artist" ||
    packet.safeClassification.kind === "artist" ||
    packet.safeClassification.ecosystemLane === "artist"
  ) {
    return true;
  }

  return packet.sourceUsageSummary.sourceLanes.some((lane) =>
    /^(?:queue_context|music|artist|radio|broadcast_memory)$/i.test(lane),
  );
}

function responseAllowsQueueMusicEvidence(
  response?: BnlDossierDraftResponse,
  packet?: BnlDossierDraftRequestPacket,
): boolean {
  const sourceUsage = response?.sourceUsageSummary?.trim() ?? "";
  if (!sourceUsage || UNSAFE_SOURCE_USAGE_REGEX.test(sourceUsage)) return false;
  if (BNL_PUBLIC_SAFE_EVIDENCE_SOURCE_REGEX.test(sourceUsage)) return true;
  if (!BNL_SUBJECT_MATCHED_PUBLIC_CONTEXT_REGEX.test(sourceUsage)) return false;
  const subject = normalizeSupportText(packet?.candidate.subjectName ?? response?.name ?? "");
  return Boolean(subject && normalizeSupportText(sourceUsage).includes(subject));
}

export function validateBnlDossierDraftResponse(
  response: BnlDossierDraftResponse,
  context: BnlDossierDraftValidationContext = {},
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
  const queueMusicEvidenceAllowed =
    packetAllowsQueueMusicEvidence(context.packet) ||
    responseAllowsQueueMusicEvidence(context.response ?? response, context.packet);
  if (PAYMENT_PRIORITY_REGEX.test(response.sourceUsageSummary)) {
    issues.push("sourceUsageSummary contains payment/Priority/Stripe/checkout/customer language");
  }
  if (/\b(?:private|source-blind|review-only|internal|admin-only)\b/i.test(response.sourceUsageSummary)) {
    warnings.push("sourceUsageSummary references non-public provenance and cannot authorize public queue/music claims.");
  }
  const contract = validateDossierDraftContractOutput(response, {
    queueMusicEvidenceAllowed,
  });
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
    if (field === "notes" && typeof value === "string" && PUBLIC_NOTES_REVIEW_WARNING_REGEX.test(value)) {
      issues.push("notes contains review-only/admin warning text that belongs in metadata");
    }
    if (typeof value === "string" && PAYMENT_PRIORITY_REGEX.test(value)) {
      issues.push(`${field} contains unsupported payment/Priority Signal copy`);
    }
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
      validation: validateBnlDossierDraftResponse(response, { packet: input.packet }),
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
