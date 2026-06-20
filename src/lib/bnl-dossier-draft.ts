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
  DossierSourceFileArchiveMetadata,
  DossierSourceFileClassificationV1,
  DossierSourceFilePagePlanV1,
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
  latestSourceFileArchiveId?: string;
  latestSourceFileArchiveDigest?: string;
  latestSourceFileArchiveUpdatedAt?: string;
  sourceFilePagePlanV1?: DossierSourceFilePagePlanV1;
  subjectDossierStateV1?: unknown;
  sourceFileSurfaceV1?: unknown;
  dossierCompletionReadV1?: unknown;
  reviewActionabilityV1?: unknown;
  sourceFileClassificationV1?: DossierSourceFileClassificationV1;
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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function normalizedSubjectName(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function archiveMatchesCandidate(
  candidate: DossierCandidate,
  archive?: DossierSourceFileArchiveMetadata,
): archive is DossierSourceFileArchiveMetadata {
  if (!archive) return false;
  if (archive.candidateId) return archive.candidateId === candidate.id;
  return normalizedSubjectName(archive.subjectName) === normalizedSubjectName(candidate.name);
}

function archivePayloadCandidates(archive?: DossierSourceFileArchiveMetadata): UnknownRecord[] {
  const root = asRecord(archive);
  if (!root) return [];
  const candidates: UnknownRecord[] = [];
  const seen = new Set<UnknownRecord>();
  const add = (value: unknown) => {
    const object = asRecord(value);
    if (!object || seen.has(object)) return;
    seen.add(object);
    candidates.push(object);
  };
  add(root);
  for (const key of ["sourcePackage", "archivePayload", "archive", "payload", "sourceFileArchive"] as const) {
    const wrapped = root[key];
    add(wrapped);
    const wrappedObject = asRecord(wrapped);
    if (wrappedObject) add(wrappedObject.sourcePackage);
  }
  return candidates;
}

function hasAnyKey(value: unknown, keys: string[]): value is UnknownRecord {
  const record = asRecord(value);
  return Boolean(record && keys.some((key) => record[key] !== undefined));
}

function firstShaped<T>(values: unknown[], keys: string[]): T | undefined {
  return values.find((value): value is T => hasAnyKey(value, keys));
}

function buildSafeSourceFileIntelligence(candidate: DossierCandidate): Partial<
  Pick<
    BnlDossierDraftRequestPacket,
    | "latestSourceFileArchiveId"
    | "latestSourceFileArchiveDigest"
    | "latestSourceFileArchiveUpdatedAt"
    | "sourceFilePagePlanV1"
    | "subjectDossierStateV1"
    | "sourceFileSurfaceV1"
    | "dossierCompletionReadV1"
    | "reviewActionabilityV1"
    | "sourceFileClassificationV1"
  >
> {
  const archive = archiveMatchesCandidate(candidate, candidate.latestSourceFileArchive)
    ? candidate.latestSourceFileArchive
    : undefined;
  if (!archive) return {};

  const payloads = archivePayloadCandidates(archive);
  const pagePlanKeys = [
    "header",
    "analystRead",
    "whatBnlNeeds",
    "publicSafeMaterial",
    "bnlReviewGuidance",
    "questionsToAsk",
    "worthDecision",
    "internalOmitHold",
    "draftOrUpdatePlan",
    "diagnosticsSummary",
  ];
  const classificationKeys = [
    "subjectType",
    "publicDossierType",
    "publicSafeTagCandidates",
    "internalTags",
    "needsReviewTagCandidates",
    "rejectedTagCandidates",
    "blockedPublicTags",
    "sourceSafety",
  ];
  const valuesFor = (key: string) =>
    payloads.flatMap((payload) => {
      const brief = asRecord(payload.sourceFileBriefV2);
      const rootAnalyst = asRecord(payload.subjectAnalystReadV1);
      const report = asRecord(payload.sourceFileCaseReportV1);
      const reportAnalyst = asRecord(report?.subjectAnalystReadV1);
      const briefAnalyst = asRecord(brief?.subjectAnalystReadV1);
      const nestedReport = asRecord(brief?.sourceFileCaseReportV1);
      const nestedReportAnalyst = asRecord(nestedReport?.subjectAnalystReadV1);
      return [
        payload[key],
        rootAnalyst?.[key],
        report?.[key],
        reportAnalyst?.[key],
        brief?.[key],
        briefAnalyst?.[key],
        nestedReport?.[key],
        nestedReportAnalyst?.[key],
      ];
    });

  return {
    latestSourceFileArchiveId: candidate.latestSourceFileArchiveId ?? archive.id,
    latestSourceFileArchiveDigest: candidate.latestSourceFileArchiveDigest ?? archive.sourceDigest,
    latestSourceFileArchiveUpdatedAt: candidate.latestSourceFileArchiveUpdatedAt ?? archive.updatedAt,
    ...(firstShaped<DossierSourceFilePagePlanV1>(valuesFor("sourceFilePagePlanV1"), pagePlanKeys)
      ? { sourceFilePagePlanV1: firstShaped<DossierSourceFilePagePlanV1>(valuesFor("sourceFilePagePlanV1"), pagePlanKeys) }
      : {}),
    ...(firstShaped<unknown>(valuesFor("subjectDossierStateV1"), ["state", "summary", "readiness", "dossierState", "candidateState"])
      ? { subjectDossierStateV1: firstShaped<unknown>(valuesFor("subjectDossierStateV1"), ["state", "summary", "readiness", "dossierState", "candidateState"]) }
      : {}),
    ...(firstShaped<unknown>(valuesFor("sourceFileSurfaceV1"), ["summary", "surface", "sections", "cards", "highlights"])
      ? { sourceFileSurfaceV1: firstShaped<unknown>(valuesFor("sourceFileSurfaceV1"), ["summary", "surface", "sections", "cards", "highlights"]) }
      : {}),
    ...(firstShaped<unknown>(valuesFor("dossierCompletionReadV1"), ["bnlAssessment", "readiness", "likelyDossierAngle", "dossierWorthiness", "recommendedNextAction"])
      ? { dossierCompletionReadV1: firstShaped<unknown>(valuesFor("dossierCompletionReadV1"), ["bnlAssessment", "readiness", "likelyDossierAngle", "dossierWorthiness", "recommendedNextAction"]) }
      : {}),
    ...(firstShaped<unknown>(valuesFor("reviewActionabilityV1"), ["actions", "ownerWarnings", "reviewWarnings", "recommendedActions", "blockers"])
      ? { reviewActionabilityV1: firstShaped<unknown>(valuesFor("reviewActionabilityV1"), ["actions", "ownerWarnings", "reviewWarnings", "recommendedActions", "blockers"]) }
      : {}),
    ...(firstShaped<DossierSourceFileClassificationV1>(valuesFor("sourceFileClassificationV1"), classificationKeys)
      ? { sourceFileClassificationV1: firstShaped<DossierSourceFileClassificationV1>(valuesFor("sourceFileClassificationV1"), classificationKeys) }
      : {}),
  };
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
  const safeSourceFileIntelligence = buildSafeSourceFileIntelligence(candidate);

  return {
    version: "1.0",
    requestType: "bnl_proposed_dossier_draft",
    candidate: {
      sourceFileId: candidate.id,
      subjectName: candidate.name,
      sourceCandidateUpdatedAt: candidate.updatedAt,
    },
    sourceFileSummary: candidate.sourceFileSummary ?? null,
    ...safeSourceFileIntelligence,
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


const RESOLVER_PROVENANCE_REGEX =
  /\b(?:BNL subject memory resolver scanned|subject memory resolver|memory needing review|memory without public-safe provenance|public-safe subject memory resolver items|resolver scanned|resolver items)\b/i;

export function extractBnlDraftResolverSummary(response: Partial<BnlDossierDraftResponse>): string[] {
  return cleanList([
    response.sourceUsageSummary,
    ...(response.ownerReviewWarnings ?? []),
    ...(response.unsupportedClaimsRejected ?? []),
    ...(response.publicSafetyWarnings ?? []),
    ...(response.missingInfoQuestions ?? []),
  ]).filter((line) => RESOLVER_PROVENANCE_REGEX.test(line));
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
