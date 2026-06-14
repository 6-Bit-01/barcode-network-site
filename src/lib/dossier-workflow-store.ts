import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { databasePage, type DatabaseEntry } from "@/content";
import {
  DOSSIER_PUBLIC_ROLE_PLACEHOLDER,
  DOSSIER_PUBLIC_SUMMARY_PLACEHOLDER,
  isDossierPublicCopyPlaceholder,
  sanitizeDossierPublicCopy,
  validateDossierPublicDraftFields,
} from "@/lib/dossier-public-copy-guard";
import { createDossierDraftBlueprint } from "@/lib/dossier-classification";
import { buildBnlDossierDraftRequestPacket, requestBnlDossierDraft, type BnlDossierDraftGeneratorResult } from "@/lib/bnl-dossier-draft";
import {
  scoreManualDossierCandidate,
  type CreateDossierRecommendationInput,
  type CreateDossierSourceFileArchiveInput,
  type CreateDossierSourceFileNoteInput,
  type UpdateDossierSourceFileSummaryInput,
  type CreateManualDossierCandidateInput,
  type CreateExistingDossierUpdateTargetInput,
  type DossierCandidate,
  type DossierCandidateStatus,
  type DossierIdentityLink,
  type DossierIdentityLinkSource,
  type DossierIdentityLinkStatus,
  type DossierIdentityLinkType,
  type DossierIdentityLinkVisibility,
  type DossierDraft,
  type DossierDuplicateGroup,
  type DossierRecommendation,
  type DossierSourceFileArchiveAttachStatus,
  type DossierSourceFileArchiveMetadata,
  type DossierSourceFileCaseReportV1,
  type DossierSourceFileEnrichmentArchive,
  type DossierRecommendationSourceLane,
  type DossierRecommendationStatus,
  type DossierRecommendationType,
  type DossierSourceFileRefreshDecision,
  type DossierSourceFileRefreshRequest,
  type DossierSourceFileRefreshRequestSource,
  type DossierSourceFileRefreshRequestStatus,
  type DossierSourceFileNote,
  type DossierSourceFileNoteSource,
  type DossierSourceFileNoteType,
  type DossierDuplicateRisk,
  type DossierPopulationRecommendedAction,
  type DossierPopulationRecommendedLane,
  type DossierWorkflowLink,
  createDossierPopulationAudit,
  isActiveSourceFileCandidate,
  isDiagnosticTestArtifactCandidate,
  isDiagnosticTestArtifactRecommendation,
  isSourceFileEnrichmentAttachableCandidate,
  normalizeDossierPossessiveVariantName,
  normalizeDossierSubjectName,
  matchDossierRecommendationSubject,
  type MergeDossierCandidatesInput,
} from "@/lib/dossier-workflow";

export type DossierWorkflowState = {
  version: 1;
  revision: number;
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  recommendations: DossierRecommendation[];
  sourceFileRefreshRequests: DossierSourceFileRefreshRequest[];
  updatedAt: string;
};

export const DOSSIER_WORKFLOW_STORAGE_KEY = "barcode:dossier-workflow:v1";
export const DOSSIER_WORKFLOW_LOCK_KEY = "barcode:dossier-workflow:v1:lock";
export const DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX =
  "barcode:dossier-source-file-archive:v1";

const MAX_UPDATE_ATTEMPTS = 5;
const LOCK_TTL_SECONDS = 5;
const LOCK_RETRY_DELAY_MS = 25;

let memoryState: DossierWorkflowState = emptyWorkflowState();
let memoryArchiveManifestStore = new Map<
  string,
  DossierSourceFileArchiveMetadata
>();
let memoryArchiveChunkStore = new Map<string, string>();
let memoryWriteQueue: Promise<void> = Promise.resolve();

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function emptyWorkflowState(): DossierWorkflowState {
  return {
    version: 1,
    revision: 0,
    candidates: [],
    drafts: [],
    recommendations: [],
    sourceFileRefreshRequests: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeWorkflowLink(
  value: unknown,
): DossierWorkflowLink | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<DossierWorkflowLink>;
  if (typeof input.url !== "string" || !input.url.trim()) return undefined;
  return {
    label:
      typeof input.label === "string" && input.label.trim()
        ? input.label.trim()
        : "Featured link",
    url: input.url.trim(),
    type:
      typeof input.type === "string" && input.type.trim()
        ? input.type.trim()
        : "website",
    selectedBy:
      input.selectedBy === "subject" || input.selectedBy === "legacy"
        ? input.selectedBy
        : "operator",
    publicSafe: input.publicSafe !== false,
  };
}

function normalizeDraftText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const seen = new Set<string>();
  const lines = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return lines.join("\n").trim() || undefined;
}

function normalizeDraftFields(
  fields: DossierDraft["fields"],
): DossierDraft["fields"] {
  const primaryLink = normalizeWorkflowLink(fields.primaryLink);
  return {
    id:
      typeof fields.id === "string" && fields.id.trim()
        ? fields.id.trim()
        : undefined,
    name: typeof fields.name === "string" ? fields.name.trim() : "",
    category: fields.category,
    kind: fields.kind,
    ecosystemLane: fields.ecosystemLane,
    identityAuthority: fields.identityAuthority,
    status: fields.status,
    clearance: fields.clearance,
    role: normalizeDraftText(fields.role),
    origin: fields.origin,
    summary: normalizeDraftText(fields.summary),
    notes: normalizeDraftText(fields.notes),
    tags: normalizeStringArray(fields.tags),
    proposedTags: normalizeStringArray(fields.proposedTags),
    primaryLink,
    links: Array.isArray(fields.links)
      ? fields.links
          .map(normalizeWorkflowLink)
          .filter((link): link is DossierWorkflowLink => Boolean(link))
      : undefined,
    files: [],
  };
}

export function validateDossierDraftFieldsForOwnerReview(
  fields: DossierDraft["fields"],
): string[] {
  const normalized = normalizeDraftFields(fields);
  const missing: string[] = [];
  if (!normalized.name) missing.push("name");
  if (!normalized.category) missing.push("category");
  if (!normalized.kind) missing.push("kind");
  if (!normalized.ecosystemLane) missing.push("ecosystemLane");
  if (!normalized.identityAuthority) missing.push("identityAuthority");
  if (!normalized.status) missing.push("status");
  if (!normalized.clearance) missing.push("clearance");
  if (!normalized.origin) missing.push("origin");
  if (!normalized.role || isDossierPublicCopyPlaceholder(normalized.role)) {
    missing.push("role");
  }
  if (
    !normalized.summary ||
    isDossierPublicCopyPlaceholder(normalized.summary)
  ) {
    missing.push("summary");
  }
  if (!normalized.tags || normalized.tags.length === 0) missing.push("tags");

  const publicCopyWarnings = validateDossierPublicDraftFields(fields);
  for (const warning of publicCopyWarnings) {
    if (!missing.includes(warning.field)) missing.push(warning.field);
  }

  return missing;
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactName(value: string): string {
  return normalizeName(value).replace(/\s+/g, "");
}

function hasNearNameMatch(candidateName: string, entryName: string): boolean {
  const normalizedCandidate = normalizeName(candidateName);
  const normalizedEntry = normalizeName(entryName);
  const compactCandidate = compactName(candidateName);
  const compactEntry = compactName(entryName);

  if (!normalizedCandidate || !normalizedEntry) return false;
  if (
    normalizedCandidate === normalizedEntry ||
    compactCandidate === compactEntry
  )
    return true;
  if (normalizedCandidate.length < 4 || normalizedEntry.length < 4)
    return false;
  return (
    normalizedCandidate.includes(normalizedEntry) ||
    normalizedEntry.includes(normalizedCandidate)
  );
}

function uniqueStrings(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const group of groups) {
    for (const item of group ?? []) {
      const trimmed = item.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      output.push(trimmed);
    }
  }
  return output;
}

function combineTextValues(
  values: Array<string | undefined>,
  limit = 4,
): string {
  return uniqueStrings(
    values.filter((value): value is string => Boolean(value)),
  )
    .slice(0, limit)
    .join("\n\n");
}

function riskRank(risk: DossierDuplicateRisk): number {
  return { none: 0, low: 1, medium: 2, high: 3 }[risk] ?? 0;
}

function confidenceRank(confidence: "low" | "medium" | "high"): number {
  return { low: 1, medium: 2, high: 3 }[confidence];
}

function activeDraftForCandidate(
  drafts: DossierDraft[],
  candidateId: string,
): DossierDraft | undefined {
  return drafts.find(
    (draft) =>
      draft.candidateId === candidateId &&
      draft.status !== "denied" &&
      draft.status !== "published" &&
      draft.status !== "superseded",
  );
}

function preferredValue<T>(...values: Array<T | undefined>): T | undefined {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function findExistingDossierMatch(name: string): {
  risk: DossierDuplicateRisk;
  match: DossierCandidate["existingDossierMatch"];
} {
  const exact = databasePage.entries.find(
    (entry: DatabaseEntry) => normalizeName(entry.name) === normalizeName(name),
  );
  if (exact) {
    return {
      risk: "high",
      match: { id: exact.id, name: exact.name, confidence: "high" },
    };
  }

  const near = databasePage.entries.find((entry: DatabaseEntry) =>
    hasNearNameMatch(name, entry.name),
  );
  if (near) {
    return {
      risk: "medium",
      match: { id: near.id, name: near.name, confidence: "medium" },
    };
  }

  return { risk: "none", match: null };
}

function sanitizeWorkflowState(value: unknown): DossierWorkflowState {
  if (!value || typeof value !== "object") return emptyWorkflowState();
  const candidateState = value as Partial<DossierWorkflowState>;
  return {
    version: 1,
    revision:
      typeof candidateState.revision === "number" &&
      Number.isFinite(candidateState.revision)
        ? Math.max(0, Math.floor(candidateState.revision))
        : 0,
    candidates: Array.isArray(candidateState.candidates)
      ? candidateState.candidates.map((candidate) => ({
          ...candidate,
          sourceFileNotes: Array.isArray(candidate.sourceFileNotes)
            ? candidate.sourceFileNotes
            : [],
          sourceFileSummary:
            candidate.sourceFileSummary &&
            typeof candidate.sourceFileSummary === "object"
              ? candidate.sourceFileSummary
              : undefined,
          identityLinks: Array.isArray(candidate.identityLinks)
            ? candidate.identityLinks
            : [],
          sourceFileArchiveIds: normalizeStringArray(
            candidate.sourceFileArchiveIds,
          ),
          latestSourceFileArchiveId:
            typeof candidate.latestSourceFileArchiveId === "string"
              ? candidate.latestSourceFileArchiveId
              : undefined,
          latestSourceFileArchiveDigest:
            typeof candidate.latestSourceFileArchiveDigest === "string"
              ? candidate.latestSourceFileArchiveDigest
              : undefined,
          latestSourceFileArchiveUpdatedAt:
            typeof candidate.latestSourceFileArchiveUpdatedAt === "string"
              ? candidate.latestSourceFileArchiveUpdatedAt
              : undefined,
          latestSourceFileArchive:
            candidate.latestSourceFileArchive &&
            typeof candidate.latestSourceFileArchive === "object"
              ? candidate.latestSourceFileArchive
              : undefined,
        }))
      : [],
    drafts: Array.isArray(candidateState.drafts) ? candidateState.drafts : [],
    recommendations: Array.isArray(candidateState.recommendations)
      ? candidateState.recommendations
      : [],
    sourceFileRefreshRequests: mergeActiveSourceFileRefreshRequests(
      Array.isArray(candidateState.sourceFileRefreshRequests)
        ? candidateState.sourceFileRefreshRequests
        : [],
    ),
    updatedAt:
      typeof candidateState.updatedAt === "string"
        ? candidateState.updatedAt
        : new Date().toISOString(),
  };
}

function createCandidateId(): string {
  return `dossier_candidate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEvidenceId(): string {
  return `evidence_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createRecommendationId(): string {
  return `dossier_recommendation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSourceFileArchiveId(): string {
  return `source_file_archive_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sourceFileArchiveStorageKey(id: string): string {
  return `${DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX}:${id}`;
}

function sourceFileArchiveDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableFingerprintValue(value)))
    .digest("hex");
}

const SOURCE_FILE_ARCHIVE_CHUNK_SIZE = 90_000;

function serializeSourceFileArchivePackage(value: unknown): string {
  return JSON.stringify(value);
}

function sourceFileArchiveSize(serializedPackage: string): number {
  return Buffer.byteLength(serializedPackage, "utf8");
}

function sourceFileArchiveChunks(serializedPackage: string): string[] {
  const chunks: string[] = [];
  for (
    let index = 0;
    index < serializedPackage.length;
    index += SOURCE_FILE_ARCHIVE_CHUNK_SIZE
  ) {
    chunks.push(
      serializedPackage.slice(index, index + SOURCE_FILE_ARCHIVE_CHUNK_SIZE),
    );
  }
  return chunks.length ? chunks : [""];
}

function compactArchiveText(
  value: unknown,
  maxLength = 1200,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.slice(0, maxLength);
}

function compactArchiveList(
  value: unknown,
  maxItems = 8,
  maxItemLength = 800,
): string[] | undefined {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const clean = compactArchiveText(item, maxItemLength);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= maxItems) break;
  }
  return output.length ? output : undefined;
}


function sourceArchiveObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

type SourceArchivePayloadCandidate = {
  value: Record<string, unknown>;
  path: string;
};

export function sourceArchivePayloadCandidates(input: unknown): SourceArchivePayloadCandidate[] {
  const root = sourceArchiveObject(input);
  if (!root) return [];
  const candidates: SourceArchivePayloadCandidate[] = [];
  const seen = new Set<Record<string, unknown>>();
  const add = (value: unknown, path: string) => {
    const object = sourceArchiveObject(value);
    if (!object || seen.has(object)) return;
    seen.add(object);
    candidates.push({ value: object, path });
  };

  add(root, "input");
  for (const key of ["sourcePackage", "archivePayload", "archive", "payload", "sourceFileArchive"] as const) {
    const wrapped = root[key];
    add(wrapped, `input.${key}`);
    const wrappedObject = sourceArchiveObject(wrapped);
    if (wrappedObject) {
      add(wrappedObject.sourcePackage, `input.${key}.sourcePackage`);
    }
  }
  return candidates;
}

function isSourceFileCaseReportShape(value: unknown) {
  const report = sourceArchiveObject(value);
  if (!report) return false;
  return [
    "subjectIntelligenceBriefV1",
    "caseSummary",
    "dossierUse",
    "publicSafeClaims",
    "evidenceSummary",
    "reviewBlockers",
    "recommendedNextSteps",
    "confidenceNotes",
    "memoryCoverage",
  ].some((key) => report[key] !== undefined);
}

function normalizeSourceArchiveBrief(value: unknown) {
  const brief = sourceArchiveObject(value);
  if (!brief) return undefined;
  return {
    ...brief,
    sourceFileCaseReportV1: isSourceFileCaseReportShape(brief.sourceFileCaseReportV1)
      ? (brief.sourceFileCaseReportV1 as DossierSourceFileCaseReportV1)
      : undefined,
    caseFileReport: isSourceFileCaseReportShape(brief.caseFileReport)
      ? (brief.caseFileReport as DossierSourceFileCaseReportV1)
      : undefined,
  };
}

function findSourceFileCaseReportV1(input: unknown) {
  for (const candidate of sourceArchivePayloadCandidates(input)) {
    const brief = normalizeSourceArchiveBrief(candidate.value.sourceFileBriefV2);
    const checks: Array<{ value: unknown; path: string }> = [
      { value: candidate.value.sourceFileCaseReportV1, path: `${candidate.path}.sourceFileCaseReportV1` },
      { value: brief?.sourceFileCaseReportV1, path: `${candidate.path}.sourceFileBriefV2.sourceFileCaseReportV1` },
      { value: brief?.caseFileReport, path: `${candidate.path}.sourceFileBriefV2.caseFileReport` },
      { value: candidate.value.caseFileReport, path: `${candidate.path}.caseFileReport` },
    ];
    const match = checks.find((check) => isSourceFileCaseReportShape(check.value));
    if (match) {
      return {
        report: match.value as DossierSourceFileCaseReportV1,
        path: match.path,
      };
    }
  }
  return { report: undefined, path: undefined };
}

function extractSourceFileCaseReportV1(input: CreateDossierSourceFileArchiveInput) {
  return findSourceFileCaseReportV1(input).report;
}

function findSourceFileBriefV2(input: unknown) {
  for (const candidate of sourceArchivePayloadCandidates(input)) {
    const brief = normalizeSourceArchiveBrief(candidate.value.sourceFileBriefV2);
    if (brief) return { brief, path: `${candidate.path}.sourceFileBriefV2` };
  }
  return { brief: undefined, path: undefined };
}

function extractSourceFileBriefV2(input: CreateDossierSourceFileArchiveInput) {
  return findSourceFileBriefV2(input).brief;
}

function sourceArchiveHasSubjectMemoryPacket(input: unknown) {
  return sourceArchivePayloadCandidates(input).some(({ value }) =>
    [
      "subjectMemoryPacket",
      "subjectMemoryPacketV1",
      "subjectMemoryPacketV2",
      "sourceMemoryPacket",
      "sourceMemoryPacketV1",
      "sourceMemoryPacketV2",
    ].some((key) => value[key] !== undefined),
  );
}

function normalizeSourceFileArchiveInput(
  input: CreateDossierSourceFileArchiveInput,
):
  | (CreateDossierSourceFileArchiveInput & {
      subjectName: string;
      compactSummary?: string;
      publicSafePossibilities?: string[];
      missingInfo?: string[];
      publicSafetyNotes?: string[];
      doNotSay?: string[];
      evidenceReceiptSummary?: string[];
      sourceFileCaseReportV1?: unknown;
      sourceFileBriefV2?: unknown;
      caseReportPresent: boolean;
      subjectMemoryPacketPresent: boolean;
      caseReportExtractedFrom?: string;
      sourceFileBriefExtractedFrom?: string;
    })
  | null {
  const subjectName = compactArchiveText(input.subjectName, 200);
  if (!subjectName) return null;
  const caseReport = findSourceFileCaseReportV1(input);
  const sourceFileBrief = findSourceFileBriefV2(input);
  return {
    ...input,
    candidateId: compactArchiveText(input.candidateId, 200),
    subjectName,
    subjectKey: compactArchiveText(input.subjectKey, 200),
    ingestKey: compactArchiveText(input.ingestKey, 300),
    ingestSource: input.ingestSource,
    compactSummary: compactArchiveText(input.compactSummary, 1600),
    publicSafePossibilities: compactArchiveList(input.publicSafePossibilities),
    missingInfo: compactArchiveList(input.missingInfo),
    publicSafetyNotes: compactArchiveList(input.publicSafetyNotes),
    doNotSay: compactArchiveList(input.doNotSay),
    evidenceReceiptSummary: compactArchiveList(
      input.evidenceReceiptSummary,
      10,
      1000,
    ),
    sourceFileCaseReportV1: caseReport.report,
    sourceFileBriefV2: sourceFileBrief.brief,
    caseReportPresent: Boolean(caseReport.report),
    subjectMemoryPacketPresent: sourceArchiveHasSubjectMemoryPacket(input),
    caseReportExtractedFrom: caseReport.path,
    sourceFileBriefExtractedFrom: sourceFileBrief.path,
  };
}

function archiveAttachStatusForCandidate(
  candidate: DossierCandidate,
): DossierSourceFileArchiveAttachStatus {
  if (candidate.status === "candidate_intake")
    return "attached_candidate_intake";
  if (candidate.status === "existing_dossier_update") {
    return "attached_existing_dossier_update";
  }
  return "attached_active_source_file";
}

async function saveSourceFileArchiveRecord(input: {
  metadata: DossierSourceFileArchiveMetadata;
  chunks: string[];
}): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await Promise.all([
      redis.set(sourceFileArchiveStorageKey(input.metadata.id), input.metadata),
      ...(input.metadata.chunkKeys ?? []).map((chunkKey, index) =>
        redis.set(chunkKey, input.chunks[index] ?? ""),
      ),
    ]);
    return;
  }
  memoryArchiveManifestStore.set(input.metadata.id, input.metadata);
  for (const [index, chunkKey] of (input.metadata.chunkKeys ?? []).entries()) {
    memoryArchiveChunkStore.set(chunkKey, input.chunks[index] ?? "");
  }
}

async function readSourceFileArchiveManifest(
  archiveId: string,
): Promise<DossierSourceFileArchiveMetadata | null> {
  const redis = getRedis();
  if (redis) {
    const metadata = await redis.get<DossierSourceFileArchiveMetadata>(
      sourceFileArchiveStorageKey(archiveId),
    );
    return metadata ?? null;
  }
  return memoryArchiveManifestStore.get(archiveId) ?? null;
}

async function readSourceFileArchiveChunks(
  metadata: DossierSourceFileArchiveMetadata,
): Promise<string[] | null> {
  const chunkKeys = metadata.chunkKeys ?? [];
  if (!chunkKeys.length || chunkKeys.length !== metadata.chunkCount) {
    return null;
  }
  const redis = getRedis();
  if (redis) {
    const chunks = await Promise.all(
      chunkKeys.map((chunkKey) => redis.get<string>(chunkKey)),
    );
    if (chunks.some((chunk) => typeof chunk !== "string")) return null;
    return chunks as string[];
  }
  const chunks = chunkKeys.map((chunkKey) =>
    memoryArchiveChunkStore.get(chunkKey),
  );
  if (chunks.some((chunk) => typeof chunk !== "string")) return null;
  return chunks as string[];
}

async function readSourceFileArchiveRecord(
  archiveId: string,
): Promise<DossierSourceFileEnrichmentArchive | null> {
  const metadata = await readSourceFileArchiveManifest(archiveId);
  if (!metadata) return null;
  const chunks = await readSourceFileArchiveChunks(metadata);
  if (!chunks) return null;
  try {
    return {
      ...metadata,
      sourcePackage: JSON.parse(chunks.join("")) as unknown,
    };
  } catch {
    return null;
  }
}

function createSourceFileNoteId(): string {
  return `source_file_note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSourceFileRefreshRequestId(): string {
  return `source_file_refresh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createIdentityLinkId(): string {
  return `identity_link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDraftId(): string {
  return `dossier_draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getDossierWorkflowState(): Promise<DossierWorkflowState> {
  const redis = getRedis();
  if (!redis) return memoryState;

  const state = sanitizeWorkflowState(
    await redis.get<unknown>(DOSSIER_WORKFLOW_STORAGE_KEY),
  );
  memoryState = state;
  return state;
}

export async function saveDossierWorkflowState(
  state: DossierWorkflowState,
): Promise<void> {
  const nextState = sanitizeWorkflowState({
    ...state,
    version: 1,
    updatedAt: state.updatedAt || new Date().toISOString(),
  });
  memoryState = nextState;
  if (
    nextState.candidates.length === 0 &&
    nextState.recommendations.length === 0 &&
    nextState.drafts.length === 0
  ) {
    memoryArchiveManifestStore = new Map<
      string,
      DossierSourceFileArchiveMetadata
    >();
    memoryArchiveChunkStore = new Map<string, string>();
  }

  const redis = getRedis();
  if (redis) {
    await redis.set(DOSSIER_WORKFLOW_STORAGE_KEY, nextState);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createLockToken(): string {
  return `dossier_lock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function acquireRedisLock(redis: Redis): Promise<string> {
  const token = createLockToken();

  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
    const acquired = await redis.set(DOSSIER_WORKFLOW_LOCK_KEY, token, {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });
    if (acquired === "OK") return token;
    await delay(LOCK_RETRY_DELAY_MS * (attempt + 1));
  }

  throw new Error("Unable to acquire dossier workflow write lock");
}

async function releaseRedisLock(redis: Redis, token: string): Promise<void> {
  const currentToken = await redis.get<string>(DOSSIER_WORKFLOW_LOCK_KEY);
  if (currentToken === token) {
    await redis.del(DOSSIER_WORKFLOW_LOCK_KEY);
  }
}

async function withMemoryWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const priorOperation = memoryWriteQueue;
  let releaseLock: () => void = () => undefined;
  memoryWriteQueue = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  await priorOperation;
  try {
    return await operation();
  } finally {
    releaseLock();
  }
}

export async function updateDossierWorkflowState(
  updater: (state: DossierWorkflowState) => DossierWorkflowState,
): Promise<DossierWorkflowState> {
  const redis = getRedis();

  if (!redis) {
    return withMemoryWriteLock(async () => {
      const currentState = sanitizeWorkflowState(memoryState);
      const updaterResult = updater(currentState);
      if (updaterResult === currentState) return currentState;
      const updatedState = sanitizeWorkflowState(updaterResult);
      const nextState = sanitizeWorkflowState({
        ...updatedState,
        version: 1,
        revision: currentState.revision + 1,
        updatedAt: updatedState.updatedAt || new Date().toISOString(),
      });
      memoryState = nextState;
      return nextState;
    });
  }

  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
    const lockToken = await acquireRedisLock(redis);
    try {
      const currentState = sanitizeWorkflowState(
        await redis.get<unknown>(DOSSIER_WORKFLOW_STORAGE_KEY),
      );
      const updaterResult = updater(currentState);
      if (updaterResult === currentState) return currentState;
      const updatedState = sanitizeWorkflowState(updaterResult);
      const latestState = sanitizeWorkflowState(
        await redis.get<unknown>(DOSSIER_WORKFLOW_STORAGE_KEY),
      );

      if (latestState.revision !== currentState.revision) {
        await delay(LOCK_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      const nextState = sanitizeWorkflowState({
        ...updatedState,
        version: 1,
        revision: currentState.revision + 1,
        updatedAt: updatedState.updatedAt || new Date().toISOString(),
      });
      await redis.set(DOSSIER_WORKFLOW_STORAGE_KEY, nextState);
      memoryState = nextState;
      return nextState;
    } finally {
      await releaseRedisLock(redis, lockToken);
    }
  }

  throw new Error(
    "Unable to update dossier workflow state after revision conflicts",
  );
}

const SOURCE_NOTE_TYPES: DossierSourceFileNoteType[] = [
  "fact",
  "correction",
  "missing_info",
  "public_safety",
  "do_not_say",
  "link_note",
  "general_note",
  "owner_note",
];
const SOURCE_NOTE_SOURCES: DossierSourceFileNoteSource[] = [
  "admin_manual",
  "mod_manual",
  "owner_manual",
  "bnl_recommendation",
  "rd_context",
  "broadcast_memory",
  "queue_context",
  "website_context",
  "discord_context",
  "unknown",
];
const RECOMMENDATION_TYPES: DossierRecommendationType[] = [
  "new_subject",
  "modify_existing_dossier",
  "identity_link",
  "possible_connection_review",
  "population_recommendation",
];
const RECOMMENDATION_SOURCE_LANES: DossierRecommendationSourceLane[] = [
  "public_discord",
  "rd_context",
  "broadcast_memory",
  "queue_context",
  "website_dossier",
  "admin_manual",
  "mod_manual",
  "owner_manual",
  "unknown",
];

const IDENTITY_LINK_TYPES: DossierIdentityLinkType[] = [
  "alias",
  "artist_name",
  "discord_handle",
  "operator_name",
  "public_persona",
  "previous_name",
  "alternate_spelling",
  "related_label",
  "unknown",
];
const IDENTITY_LINK_VISIBILITIES: DossierIdentityLinkVisibility[] = [
  "internal_only",
  "public_safe",
];
const IDENTITY_LINK_SOURCES: DossierIdentityLinkSource[] = [
  "owner_confirmed",
  "admin_manual",
  "mod_manual",
  "bnl_recommendation",
  "rd_context",
  "broadcast_memory",
  "website_dossier",
  "unknown",
];
const ACTIVE_IDENTITY_LINK_STATUSES = new Set<DossierIdentityLinkStatus>([
  "proposed",
  "confirmed",
]);

export type CreateDossierIdentityLinkInput = {
  candidateId: string;
  label: string;
  type?: DossierIdentityLinkType;
  visibility?: DossierIdentityLinkVisibility;
  source?: DossierIdentityLinkSource;
  confidence?: "low" | "medium" | "high" | "confirmed";
  useForMatching?: boolean;
  useInPublicDossier?: boolean;
  note?: string;
  createdBy?: string;
  useForMatchingAfterConfirmation?: boolean;
  createdFromRecommendationId?: string;
  createdFromRecommendationSubject?: string;
};

export type CreateIdentityLinkFromRecommendationInput = {
  recommendationId: string;
  candidateId: string;
  label: string;
  type?: DossierIdentityLinkType;
  visibility?: DossierIdentityLinkVisibility;
  source?: DossierIdentityLinkSource;
  note?: string;
  useForMatchingAfterConfirmation?: boolean;
  useInPublicDossier?: boolean;
  createdBy?: string;
};

export type UpdateDossierIdentityLinkInput = Partial<
  Omit<CreateDossierIdentityLinkInput, "candidateId">
> & {
  candidateId: string;
  identityLinkId: string;
};

export type ReviewDossierIdentityLinkInput = {
  candidateId: string;
  identityLinkId: string;
  reviewedBy?: string;
  useForMatching?: boolean;
  useInPublicDossier?: boolean;
};

const TERMINAL_RECOMMENDATION_STATUSES = new Set<DossierRecommendationStatus>([
  "attached_to_source_file",
  "attached_to_candidate_intake",
  "attached_to_existing_dossier_update",
  "converted_to_source_file",
  "identity_link_created",
  "ignored",
  "dismissed",
  "no_new_info",
  "not_population_subject",
  "archived",
]);

function assertRecommendationIsOpen(
  recommendation: DossierRecommendation,
): void {
  if (!TERMINAL_RECOMMENDATION_STATUSES.has(recommendation.status)) return;
  throw new DossierWorkflowInputError(
    "Recommendation is already terminal",
    400,
    "recommendation_already_terminal",
  );
}

function boundedText(value: unknown, maxLength = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeSummaryLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => boundedText(item, 500))
      .filter(Boolean)
      .slice(0, 6);
  }
  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((item) => boundedText(item, 500))
      .filter(Boolean)
      .slice(0, 6);
  }
  return [];
}

function normalizeSourceFileSummaryInput(
  input: UpdateDossierSourceFileSummaryInput,
) {
  const candidateId = boundedText(input.candidateId, 200);
  if (!candidateId) return null;
  return {
    candidateId,
    summaryText: boundedText(input.summaryText, 1200),
    knownContext: normalizeSummaryLines(input.knownContext),
    openQuestions: normalizeSummaryLines(input.openQuestions),
    nextAction: boundedText(input.nextAction, 500),
    updatedBy: boundedText(input.updatedBy, 200) || undefined,
  };
}

function normalizeSourceNoteInput(
  input: CreateDossierSourceFileNoteInput,
): Omit<
  DossierSourceFileNote,
  "id" | "createdAt" | "updatedAt" | "status"
> | null {
  const candidateId = boundedText(input.candidateId, 200);
  const text = boundedText(input.text);
  if (!candidateId || !text) return null;
  const type = SOURCE_NOTE_TYPES.includes(input.type ?? "general_note")
    ? (input.type ?? "general_note")
    : "general_note";
  const source = SOURCE_NOTE_SOURCES.includes(input.source ?? "admin_manual")
    ? (input.source ?? "admin_manual")
    : "admin_manual";
  return {
    candidateId,
    type,
    text,
    source,
    publicSafe: input.publicSafe === true,
    appliesToDraftId: boundedText(input.appliesToDraftId, 200) || undefined,
    createdBy: boundedText(input.createdBy, 200) || undefined,
  };
}

function normalizePacketStringArray(value: unknown): string[] | undefined {
  const items = normalizeStringArray(value).slice(0, 25);
  return items.length ? items : undefined;
}

function normalizeCoverageLabel(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCoverageText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = boundedText(value, maxLength);
  if (!clean) return undefined;
  if (/[{}\[\]<>]/.test(clean) || /[\\/]/.test(clean)) return undefined;
  if (
    /\b(?:candidate|target|dossier|source_file|recommendation|rec|bnl)_[a-z0-9][a-z0-9_-]{8,}\b/i.test(
      clean,
    )
  ) {
    return undefined;
  }
  return clean;
}

function normalizeCoverageNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (Math.abs(value) > 1_000_000_000) return undefined;
  return value;
}

function normalizeSourceCoverageItem(value: unknown): string | undefined {
  const textItem = normalizeCoverageText(value, 1000);
  if (textItem) return textItem;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const item = value as Record<string, unknown>;
  const source = normalizeCoverageText(item.source, 120);
  const status = normalizeCoverageText(item.status, 80);
  const count = normalizeCoverageNumber(item.count);
  const countParts: string[] = [];
  if (
    item.counts &&
    typeof item.counts === "object" &&
    !Array.isArray(item.counts)
  ) {
    for (const [key, rawCount] of Object.entries(item.counts).slice(0, 20)) {
      const cleanKey = normalizeCoverageText(key, 80);
      const cleanCount = normalizeCoverageNumber(rawCount);
      if (cleanKey && cleanCount !== undefined) {
        countParts.push(`${normalizeCoverageLabel(cleanKey)} ${cleanCount}`);
      }
    }
  }
  const label = source ? normalizeCoverageLabel(source) : "Source coverage";
  const pieces = countParts.length
    ? [`${label}: ${countParts.join(", ")}`]
    : count !== undefined
      ? [`${label}: ${count} source row(s)`]
      : [label];
  if (status) pieces.push(normalizeCoverageLabel(status));
  const normalized = pieces.join(" ").trim();
  return normalized && normalized !== "Source coverage"
    ? normalized
    : undefined;
}

function normalizeSourceCoverageInput(value: unknown): string[] | undefined {
  const rawItems = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  const items = rawItems
    .slice(0, 25)
    .map(normalizeSourceCoverageItem)
    .filter((item): item is string => Boolean(item));
  return items.length ? items : undefined;
}

function evidenceLooksLikeClassification(value?: string) {
  return /\b(?:automated topic|topic label|classified|classification|evidence categor(?:y|ies)|topic breakdown|topic detail|source-file|dossier|BNL\/source-file|BNL source-file|BNL\/source file|source file\/dossier)\b/i.test(
    value ?? "",
  );
}

function evidenceClassificationCopy(value?: string) {
  const clean = boundedText(value, 240)
    ?.replace(/\bauthored\b/gi, "")
    .replace(/\bposted\b/gi, "")
    .replace(
      /\bCrow\s+(?:discussed|posted about|talked about|authored)\b/gi,
      "",
    )
    .replace(/\bdiscussed\b/gi, "related to")
    .replace(/\bhandling\b/gi, "context")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-:;,\s]+|[-:;,\s]+$/g, "");
  if (!clean) return undefined;
  if (/\bclassified\b/i.test(clean) || /\bautomated topic/i.test(clean))
    return clean;
  return `Automated topic label: ${clean}. Needs human review before this becomes a subject claim.`;
}

function normalizeEvidenceReadoutItem(value: unknown): string | undefined {
  if (typeof value === "string") return boundedText(value, 1000) || undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const item = value as Record<string, unknown>;
  const allowed = new Set([
    "summary",
    "label",
    "detail",
    "topic",
    "channel",
    "channels",
    "context",
    "status",
    "kind",
    "type",
    "activityType",
    "relationship",
    "visibility",
    "window",
    "recency",
    "frequency",
    "count",
    "counts",
    "postedCount",
    "mentionedCount",
    "publicCount",
    "recentCount",
    "firstSeen",
    "lastSeen",
  ]);
  for (const key of Object.keys(item)) {
    if (!allowed.has(key)) return undefined;
  }
  const summary =
    boundedText(item.summary, 500) ||
    boundedText(item.detail, 500) ||
    boundedText(item.label, 500);
  const topic = boundedText(item.topic, 120);
  const classificationCopy =
    evidenceLooksLikeClassification(topic) ||
    evidenceLooksLikeClassification(summary)
      ? (evidenceClassificationCopy(summary) ??
        evidenceClassificationCopy(topic))
      : undefined;
  const activityType =
    boundedText(item.activityType, 80) ||
    boundedText(item.type, 80) ||
    boundedText(item.kind, 80);
  const textParts = [
    classificationCopy ?? summary,
    classificationCopy
      ? undefined
      : activityType?.replace(/^authored$/i, "posted"),
    topic
      ? classificationCopy
        ? `automated topic label ${normalizeCoverageLabel(topic)}`
        : `about ${normalizeCoverageLabel(topic)}`
      : undefined,
    boundedText(item.channel, 120)
      ? `in ${String(item.channel).startsWith("#") ? String(item.channel) : `#${normalizeCoverageLabel(String(item.channel))}`}`
      : undefined,
    boundedText(item.context, 180)
      ? normalizeCoverageLabel(String(item.context))
      : undefined,
    boundedText(item.frequency, 160) ||
      boundedText(item.recency, 160) ||
      boundedText(item.window, 160),
    boundedText(item.status, 80) || boundedText(item.visibility, 80),
  ];
  const countParts: string[] = [];
  for (const [label, raw] of [
    ["items", item.count],
    ["posted items", item.postedCount],
    ["mentions", item.mentionedCount],
    ["approved public items", item.publicCount],
    ["recent items", item.recentCount],
  ] as const) {
    const count = normalizeCoverageNumber(raw);
    if (count !== undefined) countParts.push(`${count} ${label}`);
  }
  if (
    item.counts &&
    typeof item.counts === "object" &&
    !Array.isArray(item.counts)
  ) {
    for (const [key, rawCount] of Object.entries(item.counts).slice(0, 12)) {
      const count = normalizeCoverageNumber(rawCount);
      const cleanKey = boundedText(key, 80);
      if (cleanKey && count !== undefined)
        countParts.push(`${normalizeCoverageLabel(cleanKey)} ${count}`);
    }
  }
  if (countParts.length) textParts.push(countParts.join(", "));
  return boundedText(textParts.filter(Boolean).join(" — "), 1000) || undefined;
}

function normalizeEvidenceReadoutArray(value: unknown): string[] | undefined {
  const rawItems = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  const items = rawItems
    .slice(0, 25)
    .map(normalizeEvidenceReadoutItem)
    .filter((item): item is string => Boolean(item));
  return items.length ? items : undefined;
}

function cloneJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function firstStructuredRecommendationReason(
  input: CreateDossierRecommendationInput,
): string | undefined {
  return (
    normalizePacketStringArray(input.knownContext)?.[0] ??
    normalizePacketStringArray(input.bestEvidenceToReview)?.[0] ??
    normalizePacketStringArray(input.usefulEvidence)?.[0] ??
    normalizePacketStringArray(input.conversationHighlights)?.[0] ??
    boundedText(input.recommendedAction, 1000) ??
    normalizePacketStringArray(input.publicSafePossibilities)?.[0]
  );
}

function normalizeRecommendationInput(
  input: CreateDossierRecommendationInput,
): Omit<
  DossierRecommendation,
  "id" | "createdAt" | "updatedAt" | "status"
> | null {
  const subjectName = boundedText(input.subjectName, 200);
  const reason =
    boundedText(input.reason) ?? firstStructuredRecommendationReason(input);
  if (!subjectName || !reason) return null;
  const type = RECOMMENDATION_TYPES.includes(input.type)
    ? input.type
    : "new_subject";
  const confidence = ["low", "medium", "high"].includes(input.confidence ?? "")
    ? input.confidence
    : undefined;
  const sourceLanes = (
    Array.isArray(input.sourceLanes) ? input.sourceLanes : []
  ).filter((lane): lane is DossierRecommendationSourceLane =>
    RECOMMENDATION_SOURCE_LANES.includes(lane),
  );
  return {
    type,
    subjectName,
    subjectKey: boundedText(input.subjectKey, 200) || undefined,
    targetDossierId: boundedText(input.targetDossierId, 200) || undefined,
    targetCandidateId: boundedText(input.targetCandidateId, 200) || undefined,
    reason,
    evidenceSummary: boundedText(input.evidenceSummary) || undefined,
    confidence,
    sourceLanes: sourceLanes.length ? sourceLanes : ["admin_manual"],
    sourceTypes: normalizeStringArray(input.sourceTypes).slice(0, 25),
    suggestedAction: boundedText(input.suggestedAction, 500) || undefined,
    knownContext: normalizePacketStringArray(input.knownContext),
    usefulEvidence: normalizePacketStringArray(input.usefulEvidence),
    relationshipSignals: normalizePacketStringArray(input.relationshipSignals),
    publicSafePossibilities: normalizePacketStringArray(
      input.publicSafePossibilities,
    ),
    privateOnlyNotes: normalizePacketStringArray(input.privateOnlyNotes),
    notPublicYet: normalizePacketStringArray(input.notPublicYet),
    observedChannels: normalizePacketStringArray(input.observedChannels),
    conversationHighlights: normalizePacketStringArray(
      input.conversationHighlights,
    ),
    topicBreakdown: normalizePacketStringArray(input.topicBreakdown),
    bestEvidenceToReview: normalizePacketStringArray(
      input.bestEvidenceToReview,
    ),
    bnlInteractionSignals: normalizePacketStringArray(
      input.bnlInteractionSignals,
    ),
    musicSignals: normalizePacketStringArray(input.musicSignals),
    communitySignals: normalizePacketStringArray(input.communitySignals),
    sourceCoverage: normalizeSourceCoverageInput(input.sourceCoverage),
    evidenceDetails: normalizePacketStringArray(input.evidenceDetails),
    representativeEvidence: normalizeEvidenceReadoutArray(
      input.representativeEvidence,
    ),
    activityFrequencySummary: normalizeEvidenceReadoutArray(
      input.activityFrequencySummary,
    ),
    topChannels: normalizeEvidenceReadoutArray(input.topChannels),
    topTopicDetails: normalizeEvidenceReadoutArray(input.topTopicDetails),
    recentActivitySummary: normalizeEvidenceReadoutArray(
      input.recentActivitySummary,
    ),
    authoredVsMentionedSummary: normalizeEvidenceReadoutArray(
      input.authoredVsMentionedSummary,
    ),
    publicUseCandidates: normalizePacketStringArray(input.publicUseCandidates),
    reviewOnlyEvidence: normalizePacketStringArray(input.reviewOnlyEvidence),
    queueSubmissionStatus: input.queueSubmissionStatus,
    queueSubmissionNote:
      boundedText(input.queueSubmissionNote, 1000) || undefined,
    recommendedAction: boundedText(input.recommendedAction, 1000) || undefined,
    sourceAuthority: normalizePacketStringArray(input.sourceAuthority),
    rawProvenance: cloneJsonValue(input.rawProvenance),
    normalizedSourceLaneDetails: normalizeStringArray(input.normalizedSourceLaneDetails),
    missingInfo: normalizeStringArray(input.missingInfo),
    publicSafetyNotes: normalizeStringArray(input.publicSafetyNotes),
    doNotSay: normalizeStringArray(input.doNotSay),
    recommendedTags: normalizeStringArray(input.recommendedTags),
    recommendedCategory: input.recommendedCategory,
    recommendedKind: input.recommendedKind,
    recommendedEcosystemLane: input.recommendedEcosystemLane,
    recommendedIdentityAuthority: input.recommendedIdentityAuthority,
    createdBy: boundedText(input.createdBy, 200) || undefined,
    ingestKey: boundedText(input.ingestKey, 300) || undefined,
    ingestedAt: boundedText(input.ingestedAt, 80) || undefined,
    ingestSource:
      input.ingestSource === "bnl" ||
      input.ingestSource === "bnl_dynamic_candidate_discovery" ||
      input.ingestSource === "bnl_source_knowledge_bridge" ||
      input.ingestSource === "bnl_source_file_enrichment" ||
      input.ingestSource === "bnl_population_recommender" ||
      input.ingestSource === "system" ||
      input.ingestSource === "unknown"
        ? input.ingestSource
        : undefined,
    populationRecommendation:
      input.populationRecommendation === true ||
      input.type === "population_recommendation" ||
      input.createdBy === "bnl_population_recommender" ||
      input.ingestSource === "bnl_population_recommender"
        ? true
        : undefined,
    recommendedLane: input.recommendedLane,
    matchedExistingCandidateId: boundedText(input.matchedExistingCandidateId, 200) || undefined,
    matchedPublicDossierId: boundedText(input.matchedPublicDossierId, 200) || undefined,
    matchedPublicDossierName: boundedText(input.matchedPublicDossierName, 200) || undefined,
    matchedDossierUpdateCandidateId: boundedText(input.matchedDossierUpdateCandidateId, 200) || undefined,
    possibleTargets: Array.isArray(input.possibleTargets)
      ? input.possibleTargets.slice(0, 8).map((target) => ({
          id: boundedText(target?.id, 200),
          name: boundedText(target?.name, 200),
          lane: boundedText(target?.lane, 100),
          confidence: boundedText(target?.confidence, 50),
        })).filter((target) => target.id || target.name)
      : undefined,
    duplicateRisk: input.duplicateRisk,
    identityRisk: input.identityRisk,
    publicSafetyLevel: input.publicSafetyLevel,
    adminSummary: boundedText(input.adminSummary, 1200) || undefined,
    recommendedNextStep: boundedText(input.recommendedNextStep, 1000) || undefined,
    doNotPublishReason: boundedText(input.doNotPublishReason, 1000) || undefined,
    rawEvidenceRefs: normalizeStringArray(input.rawEvidenceRefs).slice(0, 100),
    rawEvidenceRefCount: normalizeStringArray(input.rawEvidenceRefs).length,
    inputHash: boundedText(input.inputHash, 300) || undefined,
    stale: input.stale === true,
    generatedAt: boundedText(input.generatedAt, 80) || undefined,
  };
}

function isAutoConvertibleBnlSourceRecommendation(
  recommendation: Pick<DossierRecommendation, "ingestSource" | "type">,
): boolean {
  return (
    (recommendation.ingestSource === "bnl_dynamic_candidate_discovery" ||
      recommendation.ingestSource === "bnl_source_knowledge_bridge") &&
    recommendation.type === "new_subject"
  );
}

function bnlIngestLabel(
  recommendation: Pick<DossierRecommendation, "ingestSource">,
): string {
  if (recommendation.ingestSource === "bnl_population_recommender") {
    return "BNL Population Scan";
  }
  if (recommendation.ingestSource === "bnl_source_file_enrichment") {
    return "BNL Source File Enrichment";
  }
  if (recommendation.ingestSource === "bnl_source_knowledge_bridge") {
    return "BNL Source Knowledge Bridge";
  }
  if (recommendation.ingestSource === "bnl_dynamic_candidate_discovery") {
    return "BNL dynamic discovery";
  }
  return "BNL recommendation";
}

function bnlIngestCandidateSource(
  recommendation: Pick<DossierRecommendation, "ingestSource">,
): DossierCandidate["source"] {
  if (recommendation.ingestSource === "bnl_source_knowledge_bridge") {
    return "bnl_source_knowledge_bridge";
  }
  if (recommendation.ingestSource === "bnl_source_file_enrichment") {
    return "bnl_source_file_enrichment";
  }
  return "bnl_dynamic_candidate_discovery";
}

function candidateTypeFromRecommendation(
  recommendation: Pick<
    DossierRecommendation,
    "recommendedCategory" | "recommendedKind"
  >,
): DossierCandidate["candidateType"] {
  if (recommendation.recommendedKind === "artist" || recommendation.recommendedCategory === "Artist") return "artist";
  if (recommendation.recommendedKind === "collaborator" || recommendation.recommendedCategory === "Collaborator") return "collaborator";
  if (recommendation.recommendedKind === "moderator") return "personnel";
  if (recommendation.recommendedKind === "community_member" || recommendation.recommendedKind === "radio_regular" || recommendation.recommendedCategory === "Community") {
    return "community_member";
  }
  if (recommendation.recommendedCategory === "Production") return "production";
  if (recommendation.recommendedCategory === "Interface") return "interface";
  if (recommendation.recommendedCategory === "Sponsor") return "sponsor";
  if (recommendation.recommendedCategory === "Entity") return "entity";
  return "unknown";
}

function recommendationCandidateScore(
  recommendation: Pick<DossierRecommendation, "confidence">,
): number {
  return recommendation.confidence === "high"
    ? 70
    : recommendation.confidence === "medium"
      ? 55
      : 40;
}

function bnlAutoCandidateSourceNotes(
  recommendation: Pick<DossierRecommendation, "ingestSource">,
): string[] {
  if (recommendation.ingestSource === "bnl_source_knowledge_bridge") {
    return [
      "Source Knowledge Bridge origin: BNL local knowledge stores.",
      "Public use requires review before any public dossier copy is written.",
      "Internal/private review required for bridge-derived context.",
    ];
  }
  if (recommendation.ingestSource === "bnl_population_recommender") {
    return [
      "BNL Population Scan origin: BNL-generated population routing recommendation.",
      "Review-only internal queue material; not public copy.",
      "Admin action is required before any Source File or Dossier Update workflow change.",
    ];
  }
  if (recommendation.ingestSource === "bnl_source_file_enrichment") {
    return [
      "BNL Source File Enrichment origin: BNL-generated enrichment.",
      "Review-only internal case-file material; not public copy.",
      "Owner/admin review required before any public use.",
    ];
  }
  return [];
}

function bnlAutoCandidateNoteText(
  recommendation: DossierRecommendation,
): string {
  const label = bnlIngestLabel(recommendation);
  return [
    recommendationSourceNoteText(recommendation),
    `${label} origin.`,
    recommendation.ingestSource === "bnl_source_knowledge_bridge" ||
    recommendation.ingestSource === "bnl_source_file_enrichment"
      ? `${label} source lanes/types summary: ${[
          recommendation.sourceLanes.join(", "),
          recommendation.sourceTypes?.length
            ? `source types: ${recommendation.sourceTypes.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" / ")}`
      : `${label} source lanes: ${recommendation.sourceLanes.join(", ")}`,
    recommendation.ingestKey
      ? `${label} ingest key: ${recommendation.ingestKey}`
      : "",
    recommendation.confidence
      ? `${label} confidence: ${recommendation.confidence}`
      : "",
    recommendation.recommendedCategory || recommendation.recommendedKind
      ? `${label} taxonomy metadata: ${[
          recommendation.recommendedCategory,
          recommendation.recommendedKind,
          recommendation.recommendedEcosystemLane,
          recommendation.recommendedIdentityAuthority,
        ]
          .filter(Boolean)
          .join(" / ")}`
      : "",
    ...bnlAutoCandidateSourceNotes(recommendation),
    ...(recommendation.publicSafetyNotes ?? []).map(
      (note) => `Safety note: ${note}`,
    ),
    ...(recommendation.doNotSay ?? []).map((note) => `Do not say: ${note}`),
    ...(recommendation.missingInfo ?? []).map(
      (note) => `Missing info: ${note}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

function buildCandidateFromRecommendation(input: {
  recommendation: DossierRecommendation;
  now: string;
  source: DossierCandidate["source"];
  noteText: string;
}): DossierCandidate {
  const { recommendation, now, source, noteText } = input;
  const duplicate = findExistingDossierMatch(recommendation.subjectName);
  const note: DossierSourceFileNote = {
    id: createSourceFileNoteId(),
    candidateId: "",
    type: "general_note",
    text: noteText,
    source: "bnl_recommendation",
    status: "active",
    publicSafe: false,
    createdAt: now,
    updatedAt: now,
    createdBy: recommendation.createdBy,
    ingestKey: recommendation.ingestKey,
    ingestedAt: recommendation.ingestedAt,
    ingestSource: recommendation.ingestSource,
  };
  const candidate: DossierCandidate = {
    id: createCandidateId(),
    name: recommendation.subjectName,
    candidateType: candidateTypeFromRecommendation(recommendation),
    source,
    tier: "review_candidate",
    score: recommendationCandidateScore(recommendation),
    whyNow:
      recommendation.recommendedAction ??
      recommendation.suggestedAction ??
      (source === "bnl_dynamic_candidate_discovery"
        ? "BNL dynamic candidate discovery."
        : source === "bnl_source_knowledge_bridge"
          ? "BNL Source Knowledge Bridge."
          : "Recommendation inbox conversion."),
    reason: recommendation.reason,
    firstSeenAt: recommendation.ingestedAt ?? now,
    lastSeenAt: now,
    evidenceSummary:
      recommendation.usefulEvidence?.join("\n") ??
      recommendation.evidenceSummary ??
      recommendation.reason,
    evidenceItems:
      (recommendation.usefulEvidence?.length ?? 0) > 0
        ? recommendation.usefulEvidence!.map((summary) => ({
            id: createEvidenceId(),
            type: "operator_note" as const,
            label: "BNL structured useful evidence",
            summary,
            count: 1,
            firstSeenAt: recommendation.ingestedAt ?? now,
            lastSeenAt: now,
            publicSafe: false,
          }))
        : recommendation.evidenceSummary
          ? [
              {
                id: createEvidenceId(),
                type: "operator_note",
                label:
                  source === "bnl_dynamic_candidate_discovery"
                    ? "BNL dynamic discovery evidence"
                    : source === "bnl_source_knowledge_bridge"
                      ? "BNL Source Knowledge Bridge evidence"
                      : "Recommendation inbox evidence",
                summary: recommendation.evidenceSummary,
                count: 1,
                firstSeenAt: recommendation.ingestedAt ?? now,
                lastSeenAt: now,
                publicSafe: false,
              },
            ]
          : [],
    evidenceCount:
      recommendation.usefulEvidence?.length ??
      recommendation.bestEvidenceToReview?.length ??
      (recommendation.evidenceSummary ? 1 : 0),
    knownFacts: recommendation.knownContext ?? [],
    confidence: recommendation.confidence ?? "low",
    duplicateRisk: duplicate.risk,
    existingDossierMatch: duplicate.match,
    recommendedCategory: recommendation.recommendedCategory,
    recommendedKind: recommendation.recommendedKind,
    recommendedEcosystemLane: recommendation.recommendedEcosystemLane,
    recommendedIdentityAuthority: recommendation.recommendedIdentityAuthority,
    recommendedStatus: "PENDING",
    recommendedClearance: "PUBLIC",
    recommendedOrigin: "UNVERIFIED",
    recommendedTags: recommendation.recommendedTags ?? [],
    proposedTags: [],
    missingInfo: recommendation.missingInfo ?? [],
    doNotSay: uniqueStrings(
      recommendation.doNotSay,
      recommendation.notPublicYet,
    ),
    publicSafetyNotes: uniqueStrings(
      recommendation.publicSafetyNotes,
      recommendation.privateOnlyNotes,
      recommendation.relationshipSignals,
      recommendation.notPublicYet,
      bnlAutoCandidateSourceNotes(recommendation),
    ),
    sourceFileNotes: [{ ...note, candidateId: "" }],
    identityLinks: [],
    sourceLanes: recommendation.sourceLanes,
    ingestKey: recommendation.ingestKey,
    ingestSource: recommendation.ingestSource,
    createdFromRecommendationId: recommendation.id,
    status:
      duplicate.match?.confidence === "high"
        ? "existing_dossier_update"
        : "candidate_intake",
    createdAt: now,
    updatedAt: now,
  };
  candidate.sourceFileNotes = [{ ...note, candidateId: candidate.id }];
  return candidate;
}

function isActiveRecommendation(
  recommendation: DossierRecommendation,
): boolean {
  return !TERMINAL_RECOMMENDATION_STATUSES.has(recommendation.status);
}

function recommendationDedupeSubject(value: string): string {
  return normalizeName(value);
}

function recommendationDedupeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function activeNonPopulationRecommendationForSubject(
  recommendations: DossierRecommendation[],
  recommendation: DossierRecommendation,
): DossierRecommendation | undefined {
  const subjectKey = recommendationDedupeSubject(
    recommendation.subjectKey || recommendation.subjectName,
  );
  if (!subjectKey) return undefined;
  return recommendations.find((item) => {
    if (item.populationRecommendation || item.type === "population_recommendation") return false;
    if (!["new", "reviewing"].includes(item.status)) return false;
    const itemSubjectKey = recommendationDedupeSubject(
      item.subjectKey || item.subjectName,
    );
    return itemSubjectKey === subjectKey;
  });
}

function populationRecommendationForSubjectAndAction(
  recommendations: DossierRecommendation[],
  recommendation: DossierRecommendation,
): DossierRecommendation | undefined {
  const subjectKey = recommendationDedupeSubject(
    recommendation.subjectKey || recommendation.subjectName,
  );
  if (!subjectKey) return undefined;
  return recommendations.find((item) => {
    if (!item.populationRecommendation && item.type !== "population_recommendation") {
      return false;
    }
    const itemSubjectKey = recommendationDedupeSubject(
      item.subjectKey || item.subjectName,
    );
    return itemSubjectKey === subjectKey;
  });
}

function candidateDestinationForPopulationSubject(
  candidates: DossierCandidate[],
  recommendation: DossierRecommendation,
): DossierCandidate | undefined {
  const subjectKey = recommendationDedupeSubject(
    recommendation.subjectKey || recommendation.subjectName,
  );
  if (!subjectKey) return undefined;
  return candidates.find((candidate) => {
    if (["archived", "denied", "merged"].includes(candidate.status)) return false;
    const candidateSubjectKey = recommendationDedupeSubject(candidate.name);
    return candidateSubjectKey === subjectKey;
  });
}

function isRecommendationBackedCandidate(candidate: DossierCandidate): boolean {
  return Boolean(
    candidate.createdFromRecommendationId ||
      (candidate.connectedRecommendationIds ?? []).length > 0 ||
      (candidate.sourceRecommendationIds ?? []).length > 0 ||
      candidate.source === "bnl_dynamic_candidate_discovery" ||
      candidate.source === "bnl_source_knowledge_bridge" ||
      candidate.ingestSource === "bnl" ||
      candidate.ingestSource === "bnl_dynamic_candidate_discovery" ||
      candidate.ingestSource === "bnl_source_knowledge_bridge",
  );
}

function fallbackRecommendationDedupeKey(
  recommendation: Pick<
    DossierRecommendation,
    "subjectName" | "type" | "sourceLanes" | "reason"
  >,
): string {
  return [
    recommendationDedupeSubject(recommendation.subjectName),
    recommendation.type,
    [...recommendation.sourceLanes].sort().join("+"),
    recommendationDedupeText(recommendation.reason),
  ].join("|");
}

function stableFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(stableFingerprintValue)
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, stableFingerprintValue(item)] as const)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  return value ?? undefined;
}

export function bnlSourceFileEnrichmentDigest(
  recommendation: Pick<
    DossierRecommendation,
    | "reason"
    | "evidenceSummary"
    | "knownContext"
    | "usefulEvidence"
    | "relationshipSignals"
    | "observedChannels"
    | "conversationHighlights"
    | "representativeEvidence"
    | "activityFrequencySummary"
    | "topChannels"
    | "topTopicDetails"
    | "recentActivitySummary"
    | "authoredVsMentionedSummary"
    | "topicBreakdown"
    | "bestEvidenceToReview"
    | "bnlInteractionSignals"
    | "musicSignals"
    | "communitySignals"
    | "evidenceDetails"
    | "publicUseCandidates"
    | "reviewOnlyEvidence"
    | "queueSubmissionStatus"
    | "queueSubmissionNote"
    | "missingInfo"
    | "recommendedAction"
    | "sourceCoverage"
    | "publicSafePossibilities"
    | "notPublicYet"
    | "doNotSay"
    | "sourceTypes"
    | "sourceLanes"
  >,
): string {
  return JSON.stringify(
    stableFingerprintValue({
      reason: recommendation.reason,
      evidenceSummary: recommendation.evidenceSummary,
      knownContext: recommendation.knownContext,
      usefulEvidence: recommendation.usefulEvidence,
      relationshipSignals: recommendation.relationshipSignals,
      observedChannels: recommendation.observedChannels,
      conversationHighlights: recommendation.conversationHighlights,
      representativeEvidence: recommendation.representativeEvidence,
      activityFrequencySummary: recommendation.activityFrequencySummary,
      topChannels: recommendation.topChannels,
      topTopicDetails: recommendation.topTopicDetails,
      recentActivitySummary: recommendation.recentActivitySummary,
      authoredVsMentionedSummary: recommendation.authoredVsMentionedSummary,
      topicBreakdown: recommendation.topicBreakdown,
      bestEvidenceToReview: recommendation.bestEvidenceToReview,
      bnlInteractionSignals: recommendation.bnlInteractionSignals,
      musicSignals: recommendation.musicSignals,
      communitySignals: recommendation.communitySignals,
      evidenceDetails: recommendation.evidenceDetails,
      publicUseCandidates: recommendation.publicUseCandidates,
      reviewOnlyEvidence: recommendation.reviewOnlyEvidence,
      queueSubmissionStatus: recommendation.queueSubmissionStatus,
      queueSubmissionNote: recommendation.queueSubmissionNote,
      missingInfo: recommendation.missingInfo,
      recommendedAction: recommendation.recommendedAction,
      sourceCoverage: recommendation.sourceCoverage,
      publicSafePossibilities: recommendation.publicSafePossibilities,
      notPublicYet: recommendation.notPublicYet,
      doNotSay: recommendation.doNotSay,
      sourceTypes: recommendation.sourceTypes,
      sourceLanes: recommendation.sourceLanes,
    }),
  );
}

const BNL_SOURCE_FILE_ENRICHMENT_REFRESH_NOTE =
  "BNL Source File Enrichment was refreshed with newer review-only intelligence. No public dossier content was changed.";

function sourceFileEnrichmentAttachmentStatus(
  candidate: DossierCandidate,
): DossierRecommendationStatus {
  if (candidate.status === "candidate_intake")
    return "attached_to_candidate_intake";
  if (candidate.status === "existing_dossier_update") {
    return "attached_to_existing_dossier_update";
  }
  return "attached_to_source_file";
}

function upsertSourceFileEnrichmentNote(input: {
  candidate: DossierCandidate;
  recommendation: DossierRecommendation;
  now: string;
}): DossierCandidate {
  const noteText = bnlAutoCandidateNoteText(input.recommendation);
  const existingNote = (input.candidate.sourceFileNotes ?? []).find(
    (note) =>
      Boolean(input.recommendation.ingestKey) &&
      note.ingestKey === input.recommendation.ingestKey &&
      note.ingestSource === "bnl_source_file_enrichment",
  );
  const refreshedNote: DossierSourceFileNote = {
    id: existingNote?.id ?? createSourceFileNoteId(),
    candidateId: input.candidate.id,
    type: "general_note",
    text: noteText,
    source: "bnl_recommendation",
    status: "active",
    publicSafe: false,
    createdAt: existingNote?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: input.recommendation.createdBy,
    ingestKey: input.recommendation.ingestKey,
    ingestedAt: input.recommendation.ingestedAt,
    ingestSource: input.recommendation.ingestSource,
  };
  const otherNotes = (input.candidate.sourceFileNotes ?? []).filter(
    (note) => note.id !== existingNote?.id,
  );
  return {
    ...input.candidate,
    sourceFileNotes: [refreshedNote, ...otherNotes],
    updatedAt: input.now,
  };
}

function attachmentStatusForCandidate(
  candidate: DossierCandidate,
): DossierRecommendationStatus {
  if (candidate.status === "candidate_intake")
    return "attached_to_candidate_intake";
  if (candidate.status === "existing_dossier_update") {
    return "attached_to_existing_dossier_update";
  }
  return "attached_to_source_file";
}

function routingNote(input: {
  candidateId: string;
  text: string;
  now: string;
  source?: DossierSourceFileNoteSource;
  createdBy?: string;
  ingestKey?: string;
  ingestedAt?: string;
  ingestSource?: DossierRecommendation["ingestSource"];
}): DossierSourceFileNote {
  return {
    id: createSourceFileNoteId(),
    candidateId: input.candidateId,
    type: "general_note",
    text: input.text.slice(0, 4000),
    source: input.source ?? "admin_manual",
    status: "active",
    publicSafe: false,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.createdBy,
    ingestKey: input.ingestKey,
    ingestedAt: input.ingestedAt,
    ingestSource: input.ingestSource,
  };
}

function manualCandidateRoutingNote(input: {
  name: string;
  reason: string;
  whyNow?: string;
  evidenceSummary?: string;
  knownFacts?: string[];
  routingReason: string;
}): string {
  return [
    `Manual signal routed into existing workflow record: ${input.name}.`,
    `Routing reason: ${input.routingReason}`,
    `Reason: ${input.reason}`,
    input.whyNow ? `Why now: ${input.whyNow}` : "",
    input.evidenceSummary ? `Evidence: ${input.evidenceSummary}` : "",
    ...(input.knownFacts ?? []).map((fact) => `Known fact: ${fact}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function mergeCandidateSignal(input: {
  candidate: DossierCandidate;
  now: string;
  note: DossierSourceFileNote;
  evidenceSummary?: string;
  knownFacts?: string[];
  missingInfo?: string[];
  publicSafetyNotes?: string[];
  doNotSay?: string[];
  connectedRecommendationId?: string;
  possibleMatchCandidateIds?: string[];
  routingReason: string;
  identityReviewStatus?: DossierCandidate["identityReviewStatus"];
}): DossierCandidate {
  const evidenceSummary = combineTextValues([
    input.candidate.evidenceSummary,
    input.evidenceSummary,
  ]);
  const connectedRecommendationIds = uniqueStrings(
    input.candidate.connectedRecommendationIds,
    input.connectedRecommendationId ? [input.connectedRecommendationId] : [],
  );
  return {
    ...input.candidate,
    lastSeenAt: input.now,
    evidenceSummary,
    evidenceCount:
      (input.candidate.evidenceCount ??
        input.candidate.evidenceItems?.length ??
        0) + (input.evidenceSummary?.trim() ? 1 : 0),
    knownFacts: uniqueStrings(input.candidate.knownFacts, input.knownFacts),
    missingInfo: uniqueStrings(input.candidate.missingInfo, input.missingInfo),
    publicSafetyNotes: uniqueStrings(
      input.candidate.publicSafetyNotes,
      input.publicSafetyNotes,
    ),
    doNotSay: uniqueStrings(input.candidate.doNotSay, input.doNotSay),
    sourceFileNotes: [input.note, ...(input.candidate.sourceFileNotes ?? [])],
    connectedCandidateId:
      input.candidate.connectedCandidateId ??
      input.possibleMatchCandidateIds?.[0] ??
      undefined,
    connectedSourceFileCandidateId:
      input.candidate.connectedSourceFileCandidateId ??
      input.possibleMatchCandidateIds?.[0] ??
      undefined,
    connectedRecommendationIds: connectedRecommendationIds.length
      ? connectedRecommendationIds
      : input.candidate.connectedRecommendationIds,
    possibleMatchCandidateIds: uniqueStrings(
      input.candidate.possibleMatchCandidateIds,
      input.possibleMatchCandidateIds,
    ),
    identityReviewStatus:
      input.identityReviewStatus ?? input.candidate.identityReviewStatus,
    routingReason: input.routingReason,
    updatedAt: input.now,
  };
}

function samePossibleMatchReview(input: {
  candidate: DossierCandidate;
  subjectName: string;
  possibleCandidateIds: string[];
}): boolean {
  const existingPossible = input.candidate.possibleMatchCandidateIds ?? [];
  if (existingPossible.length === 0) return false;
  const sameSubject =
    normalizeName(input.candidate.name) === normalizeName(input.subjectName);
  const left = [...existingPossible].sort().join("|");
  const right = [...input.possibleCandidateIds].sort().join("|");
  return sameSubject && left === right;
}

function matchingPublicDossierForSubject(subjectName: string) {
  const duplicate = findExistingDossierMatch(subjectName);
  return duplicate.match?.confidence === "high" ? duplicate.match : null;
}

const OPEN_REFRESH_RECENT_COMPLETED_MS = 60 * 60 * 1000;
const DEFAULT_REFRESH_STALE_MS = 24 * 60 * 60 * 1000;
const STALE_OPEN_REFRESH_REQUEST_MS = 5 * 60 * 1000;
const OPEN_REQUEST_STATUSES = new Set<DossierSourceFileRefreshRequestStatus>([
  "pending",
  "claimed",
]);
const COMPLETABLE_REFRESH_STATUSES =
  new Set<DossierSourceFileRefreshRequestStatus>(["pending", "claimed"]);


export function latestArchiveMissingCaseReport(candidate: DossierCandidate): boolean {
  const latestArchive = candidate.latestSourceFileArchive;
  const hasLatestSourceData = Boolean(
    latestArchive ??
      candidate.latestSourceFileArchiveId ??
      candidate.latestSourceFileArchiveDigest ??
      candidate.latestSourceFileArchiveUpdatedAt ??
      (candidate.sourceFileArchiveIds?.length ?? 0) > 0,
  );
  if (!hasLatestSourceData) return false;
  return !findSourceFileCaseReportV1(latestArchive).report;
}

export const candidateMissingCaseReport = latestArchiveMissingCaseReport;

export function sourceFileNeedsCaseReportBackfill(candidate: DossierCandidate): boolean {
  return latestArchiveMissingCaseReport(candidate);
}

function latestBnlSourceFileRecommendation(input: {
  candidate: DossierCandidate;
  recommendations: DossierRecommendation[];
}): DossierRecommendation | undefined {
  return input.recommendations
    .filter(
      (recommendation) =>
        recommendation.targetCandidateId === input.candidate.id &&
        recommendation.ingestSource === "bnl_source_file_enrichment",
    )
    .sort((a, b) =>
      (b.ingestedAt ?? b.updatedAt ?? b.createdAt).localeCompare(
        a.ingestedAt ?? a.updatedAt ?? a.createdAt,
      ),
    )[0];
}

function latestActiveSourceNoteTimestamp(
  candidate: DossierCandidate,
): string | undefined {
  return (candidate.sourceFileNotes ?? [])
    .filter((note) => note.status === "active")
    .map((note) => note.updatedAt ?? note.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function sourceFileRefreshRequestMatchesCandidate(input: {
  request: DossierSourceFileRefreshRequest;
  candidate: DossierCandidate;
}): boolean {
  if (input.request.candidateId) {
    return input.request.candidateId === input.candidate.id;
  }
  return (
    input.request.normalizedSubjectKey === normalizeName(input.candidate.name)
  );
}

function latestOpenRefreshRequest(input: {
  requests: DossierSourceFileRefreshRequest[];
  candidate: DossierCandidate;
}): DossierSourceFileRefreshRequest | undefined {
  return input.requests.find(
    (request) =>
      OPEN_REQUEST_STATUSES.has(request.status) &&
      sourceFileRefreshRequestMatchesCandidate({
        request,
        candidate: input.candidate,
      }),
  );
}

function latestCompletedRefreshRequest(input: {
  requests: DossierSourceFileRefreshRequest[];
  candidate: DossierCandidate;
}): DossierSourceFileRefreshRequest | undefined {
  return input.requests.find(
    (request) =>
      request.status === "completed" &&
      sourceFileRefreshRequestMatchesCandidate({
        request,
        candidate: input.candidate,
      }),
  );
}

function sourceFileRefreshDedupeKey(
  request: Pick<
    DossierSourceFileRefreshRequest,
    "candidateId" | "normalizedSubjectKey" | "subjectName"
  >,
): string {
  const candidateKey = request.candidateId?.trim();
  if (candidateKey) return `candidate:${candidateKey}`;
  const normalizedSubjectKey = request.normalizedSubjectKey?.trim()
    ? request.normalizedSubjectKey.trim()
    : normalizeName(request.subjectName);
  return `subject:${normalizedSubjectKey}`;
}

function mergeActiveSourceFileRefreshRequests(
  requests: DossierSourceFileRefreshRequest[],
): DossierSourceFileRefreshRequest[] {
  const merged = new Map<string, DossierSourceFileRefreshRequest>();
  const output: DossierSourceFileRefreshRequest[] = [];

  for (const request of requests) {
    if (!OPEN_REQUEST_STATUSES.has(request.status)) {
      output.push(request);
      continue;
    }

    const key = sourceFileRefreshDedupeKey(request);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, request);
      output.push(request);
      continue;
    }

    const mergedRequest: DossierSourceFileRefreshRequest = {
      ...existing,
      candidateId: existing.candidateId ?? request.candidateId,
      subjectName: existing.subjectName || request.subjectName,
      normalizedSubjectKey:
        existing.normalizedSubjectKey || request.normalizedSubjectKey,
      reason:
        request.updatedAt >= existing.updatedAt
          ? request.reason
          : existing.reason,
      requestSource:
        request.updatedAt >= existing.updatedAt
          ? request.requestSource
          : existing.requestSource,
      priority: Math.max(existing.priority ?? 0, request.priority ?? 0),
      requestedAt:
        request.requestedAt < existing.requestedAt
          ? request.requestedAt
          : existing.requestedAt,
      requestedBy: request.requestedBy ?? existing.requestedBy,
      updatedAt:
        request.updatedAt > existing.updatedAt
          ? request.updatedAt
          : existing.updatedAt,
      lastAttemptAt:
        request.lastAttemptAt &&
        (!existing.lastAttemptAt ||
          request.lastAttemptAt > existing.lastAttemptAt)
          ? request.lastAttemptAt
          : existing.lastAttemptAt,
      caseReportMissing:
        request.caseReportMissing ?? existing.caseReportMissing,
      requiresCaseReportBackfill:
        request.requiresCaseReportBackfill ??
        existing.requiresCaseReportBackfill,
    };
    merged.set(key, mergedRequest);
    const outputIndex = output.findIndex((item) => item.id === existing.id);
    if (outputIndex >= 0) output[outputIndex] = mergedRequest;
  }

  return output;
}

export function evaluateDossierSourceFileRefresh(input: {
  candidate: DossierCandidate;
  recommendations: DossierRecommendation[];
  refreshRequests?: DossierSourceFileRefreshRequest[];
  now?: string;
  staleAfterMs?: number;
}): DossierSourceFileRefreshDecision {
  const now = input.now ?? new Date().toISOString();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_REFRESH_STALE_MS;
  const latestRecommendation = latestBnlSourceFileRecommendation(input);
  const latestRecommendationTimestamp = latestRecommendation
    ? (latestRecommendation.ingestedAt ??
      latestRecommendation.updatedAt ??
      latestRecommendation.createdAt)
    : undefined;
  const latestSourceNoteTimestamp = latestActiveSourceNoteTimestamp(
    input.candidate,
  );
  const completed = latestCompletedRefreshRequest({
    requests: input.refreshRequests ?? [],
    candidate: input.candidate,
  });
  const completedAt = completed?.completedAt
    ? Date.parse(completed.completedAt)
    : NaN;
  const nowTime = Date.parse(now);

  if (sourceFileNeedsCaseReportBackfill(input.candidate)) {
    return {
      needed: true,
      reason: "case_report_missing",
      requestSource: "case_report_missing",
      priority: input.candidate.status === "existing_dossier_update" ? 85 : 80,
      latestRecommendationTimestamp,
      latestSourceNoteTimestamp,
    };
  }

  if (
    completed &&
    !Number.isNaN(completedAt) &&
    !Number.isNaN(nowTime) &&
    nowTime - completedAt < OPEN_REFRESH_RECENT_COMPLETED_MS
  ) {
    return {
      needed: false,
      reason: "A BNL refresh completed recently.",
      requestSource: "opened_source_file",
      priority: 1,
      latestRecommendationTimestamp,
      latestSourceNoteTimestamp,
    };
  }

  if (!latestRecommendationTimestamp) {
    return {
      needed: true,
      reason: "No BNL Source File enrichment recommendation exists yet.",
      requestSource: "missing_bnl_refresh",
      priority: input.candidate.status === "existing_dossier_update" ? 70 : 60,
      latestRecommendationTimestamp,
      latestSourceNoteTimestamp,
    };
  }

  const recommendationTime = Date.parse(latestRecommendationTimestamp);
  const noteTime = latestSourceNoteTimestamp
    ? Date.parse(latestSourceNoteTimestamp)
    : NaN;
  if (
    !Number.isNaN(noteTime) &&
    !Number.isNaN(recommendationTime) &&
    noteTime > recommendationTime
  ) {
    return {
      needed: true,
      reason: "Source file notes are newer than the latest BNL enrichment.",
      requestSource: "source_notes_newer_than_bnl",
      priority: 80,
      latestRecommendationTimestamp,
      latestSourceNoteTimestamp,
    };
  }

  if (
    !Number.isNaN(recommendationTime) &&
    !Number.isNaN(nowTime) &&
    nowTime - recommendationTime > staleAfterMs
  ) {
    return {
      needed: true,
      reason:
        "Latest BNL Source File enrichment is older than the refresh policy threshold.",
      requestSource:
        input.candidate.status === "existing_dossier_update"
          ? "existing_dossier_update_review"
          : "stale_source_file",
      priority: input.candidate.status === "existing_dossier_update" ? 75 : 50,
      latestRecommendationTimestamp,
      latestSourceNoteTimestamp,
    };
  }

  return {
    needed: false,
    reason:
      "Latest BNL Source File enrichment is fresh for the current source file notes.",
    requestSource: "opened_source_file",
    priority: 1,
    latestRecommendationTimestamp,
    latestSourceNoteTimestamp,
  };
}

function expireStaleOpenRefreshRequests(
  requests: DossierSourceFileRefreshRequest[],
  now: string,
): DossierSourceFileRefreshRequest[] {
  const nowTime = Date.parse(now);
  return requests.map((request) => {
    const updatedAt = Date.parse(request.updatedAt || request.requestedAt);
    if (
      OPEN_REQUEST_STATUSES.has(request.status) &&
      !Number.isNaN(nowTime) &&
      !Number.isNaN(updatedAt) &&
      nowTime - updatedAt > STALE_OPEN_REFRESH_REQUEST_MS
    ) {
      return {
        ...request,
        status: "failed" as const,
        updatedAt: now,
        failureReason:
          request.failureReason ??
          "Refresh request expired before immediate BNL update completed.",
      };
    }
    return request;
  });
}

function upsertSourceFileRefreshRequestInState(input: {
  state: DossierWorkflowState;
  candidate: DossierCandidate;
  reason: string;
  requestSource: DossierSourceFileRefreshRequestSource;
  priority: number;
  requestedBy?: string;
  now: string;
  force?: boolean;
  caseReportMissing?: boolean;
  requiresCaseReportBackfill?: boolean;
}): {
  state: DossierWorkflowState;
  request: DossierSourceFileRefreshRequest;
  created: boolean;
} {
  const state = {
    ...input.state,
    sourceFileRefreshRequests: mergeActiveSourceFileRefreshRequests(
      expireStaleOpenRefreshRequests(
        input.state.sourceFileRefreshRequests,
        input.now,
      ),
    ),
  };
  const normalizedSubjectKey = normalizeName(input.candidate.name);
  const existingIndex = state.sourceFileRefreshRequests.findIndex(
    (request) =>
      OPEN_REQUEST_STATUSES.has(request.status) &&
      sourceFileRefreshRequestMatchesCandidate({
        request,
        candidate: input.candidate,
      }),
  );
  if (existingIndex >= 0) {
    const existing = state.sourceFileRefreshRequests[existingIndex];
    const updated: DossierSourceFileRefreshRequest = {
      ...existing,
      candidateId: existing.candidateId ?? input.candidate.id,
      subjectName: existing.subjectName || input.candidate.name,
      normalizedSubjectKey:
        existing.normalizedSubjectKey || normalizedSubjectKey,
      reason: input.reason || existing.reason,
      requestSource: input.requestSource,
      priority: Math.max(existing.priority ?? 0, input.priority),
      requestedBy: input.requestedBy ?? existing.requestedBy,
      updatedAt: input.now,
      caseReportMissing: input.caseReportMissing ?? existing.caseReportMissing,
      requiresCaseReportBackfill:
        input.requiresCaseReportBackfill ?? existing.requiresCaseReportBackfill,
    };
    const requests = [...state.sourceFileRefreshRequests];
    requests[existingIndex] = updated;
    return {
      state: {
        ...state,
        sourceFileRefreshRequests: requests,
        updatedAt: input.now,
      },
      request: updated,
      created: false,
    };
  }

  if (!input.force) {
    const recentCompleted = latestCompletedRefreshRequest({
      requests: state.sourceFileRefreshRequests,
      candidate: input.candidate,
    });
    const completedAt = recentCompleted?.completedAt
      ? Date.parse(recentCompleted.completedAt)
      : NaN;
    const nowTime = Date.parse(input.now);
    if (
      !Number.isNaN(completedAt) &&
      !Number.isNaN(nowTime) &&
      nowTime - completedAt < OPEN_REFRESH_RECENT_COMPLETED_MS
    ) {
      return { state, request: recentCompleted!, created: false };
    }
  }

  const request: DossierSourceFileRefreshRequest = {
    id: createSourceFileRefreshRequestId(),
    candidateId: input.candidate.id,
    subjectName: input.candidate.name,
    normalizedSubjectKey,
    status: "pending",
    reason: input.reason,
    requestedBy: input.requestedBy,
    requestedAt: input.now,
    updatedAt: input.now,
    requestSource: input.requestSource,
    priority: input.priority,
    caseReportMissing: input.caseReportMissing,
    requiresCaseReportBackfill: input.requiresCaseReportBackfill,
  };
  return {
    state: {
      ...state,
      sourceFileRefreshRequests: [request, ...state.sourceFileRefreshRequests],
      updatedAt: input.now,
    },
    request,
    created: true,
  };
}

export async function getDossierSourceFileArchive(
  archiveId: string,
): Promise<DossierSourceFileEnrichmentArchive | null> {
  if (!archiveId.trim()) return null;
  return readSourceFileArchiveRecord(archiveId.trim());
}

export async function ingestDossierSourceFileArchive(
  input: CreateDossierSourceFileArchiveInput,
): Promise<{
  archive: DossierSourceFileArchiveMetadata;
  duplicate: boolean;
  attachStatus: DossierSourceFileArchiveAttachStatus;
  candidate: DossierCandidate;
}> {
  const normalized = normalizeSourceFileArchiveInput(input);
  if (!normalized) {
    throw new DossierWorkflowInputError(
      "Source File archive ingest requires subjectName and sourcePackage",
      400,
      "archive_subject_required",
    );
  }
  if (
    normalized.sourcePackage === undefined ||
    normalized.sourcePackage === null
  ) {
    throw new DossierWorkflowInputError(
      "Source File archive ingest requires sourcePackage",
      400,
      "archive_package_required",
    );
  }

  const digest = sourceFileArchiveDigest(normalized.sourcePackage);
  const now = new Date().toISOString();
  let savedArchiveMetadata: DossierSourceFileArchiveMetadata | null = null;
  let savedArchiveChunks: string[] | null = null;
  let duplicate = false;
  let attachStatus: DossierSourceFileArchiveAttachStatus | null = null;
  let savedCandidate: DossierCandidate | null = null;
  let savedCandidateLatestArchiveId: string | undefined;
  let savedCandidateLatestArchiveMetadata:
    | DossierSourceFileArchiveMetadata
    | undefined;

  await updateDossierWorkflowState((currentState) => {
    const subjectKey = normalizeName(
      normalized.subjectKey || normalized.subjectName,
    );
    const candidate = normalized.candidateId
      ? currentState.candidates.find(
          (item) => item.id === normalized.candidateId,
        )
      : currentState.candidates.find(
          (item) =>
            normalizeName(item.name) === subjectKey ||
            normalizeName(item.ingestKey ?? "") ===
              normalizeName(normalized.ingestKey ?? ""),
        );
    if (!candidate) {
      throw new DossierWorkflowInputError(
        "Safe exact Source File match is required for archive ingest",
        404,
        "archive_target_not_found",
      );
    }
    if (!isSourceFileEnrichmentAttachableCandidate(candidate)) {
      throw new DossierWorkflowInputError(
        "Target is not open for Source File archive attachment",
        400,
        "archive_target_not_attachable",
      );
    }
    if (
      !normalized.candidateId &&
      normalizeName(candidate.name) !== subjectKey
    ) {
      throw new DossierWorkflowInputError(
        "Archive ingest requires candidateId unless subjectName is an exact safe match",
        400,
        "archive_exact_match_required",
      );
    }

    if (
      candidate.latestSourceFileArchiveDigest === digest &&
      candidate.latestSourceFileArchiveId
    ) {
      duplicate = true;
      attachStatus = "deduped_existing";
      savedCandidate = candidate;
      savedCandidateLatestArchiveId = candidate.latestSourceFileArchiveId;
      savedCandidateLatestArchiveMetadata = candidate.latestSourceFileArchive;
      return currentState;
    }

    const serializedPackage = serializeSourceFileArchivePackage(
      normalized.sourcePackage,
    );
    const archiveSize = sourceFileArchiveSize(serializedPackage);
    const archiveId = createSourceFileArchiveId();
    const archiveKey = sourceFileArchiveStorageKey(archiveId);
    const chunks = sourceFileArchiveChunks(serializedPackage);
    const chunkCount = chunks.length;
    const chunkKeys = chunks.map((_, index) => `${archiveKey}:chunk:${index}`);
    savedArchiveMetadata = {
      id: archiveId,
      candidateId: candidate.id,
      subjectName: normalized.subjectName,
      subjectKey:
        normalized.subjectKey ?? normalizeName(normalized.subjectName),
      ingestKey: normalized.ingestKey,
      ingestSource: normalized.ingestSource ?? "bnl_source_file_enrichment",
      sourceDigest: digest,
      createdAt: now,
      updatedAt: now,
      archiveSize,
      chunkCount,
      compactSummary: normalized.compactSummary,
      publicSafePossibilities: normalized.publicSafePossibilities,
      missingInfo: normalized.missingInfo,
      publicSafetyNotes: normalized.publicSafetyNotes,
      doNotSay: normalized.doNotSay,
      evidenceReceiptSummary: normalized.evidenceReceiptSummary,
      sourceFileCaseReportV1: normalized.sourceFileCaseReportV1,
      sourceFileBriefV2: normalized.sourceFileBriefV2,
      caseReportPresent: normalized.caseReportPresent,
      subjectMemoryPacketPresent: normalized.subjectMemoryPacketPresent,
      caseReportExtractedFrom: normalized.caseReportExtractedFrom,
      sourceFileBriefExtractedFrom: normalized.sourceFileBriefExtractedFrom,
      archiveKey,
      chunkKeys,
      reviewOnly: true,
    };
    savedArchiveChunks = chunks;
    const metadata = savedArchiveMetadata;
    const archiveIds = uniqueStrings(
      [archiveId],
      candidate.sourceFileArchiveIds,
    );
    const nextCandidate: DossierCandidate = {
      ...candidate,
      sourceFileArchiveIds: archiveIds,
      latestSourceFileArchiveId: archiveId,
      latestSourceFileArchiveDigest: digest,
      latestSourceFileArchiveUpdatedAt: now,
      latestSourceFileArchive: metadata,
      updatedAt: now,
    };
    attachStatus = archiveAttachStatusForCandidate(candidate);
    savedCandidate = nextCandidate;
    savedCandidateLatestArchiveId = nextCandidate.latestSourceFileArchiveId;
    savedCandidateLatestArchiveMetadata = nextCandidate.latestSourceFileArchive;
    return {
      ...currentState,
      candidates: currentState.candidates.map((item) =>
        item.id === candidate.id ? nextCandidate : item,
      ),
      updatedAt: now,
    };
  });

  if (savedArchiveMetadata && savedArchiveChunks) {
    await saveSourceFileArchiveRecord({
      metadata: savedArchiveMetadata,
      chunks: savedArchiveChunks,
    });
  }
  if (
    duplicate &&
    savedCandidateLatestArchiveId &&
    !savedCandidateLatestArchiveMetadata
  ) {
    savedCandidateLatestArchiveMetadata =
      (await readSourceFileArchiveManifest(savedCandidateLatestArchiveId)) ??
      undefined;
  }

  const metadata = savedArchiveMetadata ?? savedCandidateLatestArchiveMetadata;
  if (!metadata || !attachStatus || !savedCandidate) {
    throw new DossierWorkflowInputError(
      "Source File archive ingest did not attach",
      400,
      "archive_attach_failed",
    );
  }

  return {
    archive: metadata,
    duplicate,
    attachStatus,
    candidate: savedCandidate,
  };
}

export async function recordDossierSourceFileOpen(input: {
  candidateId: string;
  requestedBy?: string;
}): Promise<{
  request: DossierSourceFileRefreshRequest | null;
  decision: DossierSourceFileRefreshDecision;
  created: boolean;
}> {
  const now = new Date().toISOString();
  let result: {
    request: DossierSourceFileRefreshRequest | null;
    decision: DossierSourceFileRefreshDecision;
    created: boolean;
  } | null = null;
  await updateDossierWorkflowState((currentState) => {
    const candidate = currentState.candidates.find(
      (item) => item.id === input.candidateId,
    );
    if (!candidate || !isSourceFileEnrichmentAttachableCandidate(candidate)) {
      result = {
        request: null,
        decision: {
          needed: false,
          reason: "Source File candidate was not found or is closed.",
          requestSource: "opened_source_file",
          priority: 1,
        },
        created: false,
      };
      return currentState;
    }
    const decision = evaluateDossierSourceFileRefresh({
      candidate,
      recommendations: currentState.recommendations,
      refreshRequests: currentState.sourceFileRefreshRequests,
      now,
    });
    const missingCaseReport = sourceFileNeedsCaseReportBackfill(candidate);
    const upserted = upsertSourceFileRefreshRequestInState({
      state: currentState,
      candidate,
      reason: missingCaseReport
        ? "case_report_missing"
        : decision.needed
        ? decision.reason
        : "Admin opened the Source File and requested an immediate BNL freshness check.",
      requestSource: missingCaseReport
        ? "case_report_missing"
        : decision.requestSource === "opened_source_file"
          ? "opened_source_file"
          : decision.requestSource,
      priority: Math.max(decision.priority, missingCaseReport ? 80 : 60),
      requestedBy: input.requestedBy ?? "admin_open_source_file",
      now,
      force: true,
      caseReportMissing: missingCaseReport || undefined,
      requiresCaseReportBackfill: missingCaseReport || undefined,
    });
    result = { request: upserted.request, decision, created: upserted.created };
    return upserted.state;
  });
  return result!;
}

export async function requestDossierSourceFileRefresh(input: {
  candidateId: string;
  reason?: string;
  requestSource?: DossierSourceFileRefreshRequestSource;
  requestedBy?: string;
  priority?: number;
}): Promise<{ request: DossierSourceFileRefreshRequest; created: boolean }> {
  const now = new Date().toISOString();
  let result: {
    request: DossierSourceFileRefreshRequest;
    created: boolean;
  } | null = null;
  await updateDossierWorkflowState((currentState) => {
    const candidate = currentState.candidates.find(
      (item) => item.id === input.candidateId,
    );
    if (!candidate || !isSourceFileEnrichmentAttachableCandidate(candidate)) {
      throw new DossierWorkflowInputError(
        "Source File candidate was not found or cannot be refreshed",
      );
    }
    const missingCaseReport = sourceFileNeedsCaseReportBackfill(candidate);
    const upserted = upsertSourceFileRefreshRequestInState({
      state: currentState,
      candidate,
      reason: missingCaseReport
        ? "case_report_missing"
        : input.reason?.trim() ||
          "Manual admin requested a BNL Source File refresh.",
      requestSource: missingCaseReport
        ? "case_report_missing"
        : input.requestSource ?? "manual_admin",
      priority: input.priority ?? (missingCaseReport ? 95 : 90),
      requestedBy: input.requestedBy ?? "admin_manual",
      now,
      force: true,
      caseReportMissing: missingCaseReport || undefined,
      requiresCaseReportBackfill: missingCaseReport || undefined,
    });
    result = { request: upserted.request, created: upserted.created };
    return upserted.state;
  });
  return result!;
}

export async function listPendingDossierSourceFileRefreshRequests(
  limit = 25,
): Promise<DossierSourceFileRefreshRequest[]> {
  const state = await getDossierWorkflowState();
  return state.sourceFileRefreshRequests
    .filter((request) => request.status === "pending")
    .sort(
      (a, b) =>
        b.priority - a.priority || a.requestedAt.localeCompare(b.requestedAt),
    )
    .slice(0, Math.max(1, Math.min(100, limit)));
}

export async function updateDossierSourceFileRefreshRequestStatus(input: {
  requestId: string;
  status: DossierSourceFileRefreshRequestStatus;
  completedByRecommendationId?: string;
  failureReason?: string;
}): Promise<DossierSourceFileRefreshRequest | null> {
  const now = new Date().toISOString();
  let updated: DossierSourceFileRefreshRequest | null = null;
  await updateDossierWorkflowState((currentState) => {
    const activeDedupedRequests = mergeActiveSourceFileRefreshRequests(
      currentState.sourceFileRefreshRequests,
    );
    const requests = activeDedupedRequests.map((request) => {
      if (request.id !== input.requestId) return request;
      updated = {
        ...request,
        status: input.status,
        updatedAt: now,
        lastAttemptAt: input.status === "claimed" ? now : request.lastAttemptAt,
        completedAt:
          input.status === "completed" || input.status === "skipped"
            ? now
            : request.completedAt,
        completedByRecommendationId:
          input.completedByRecommendationId ??
          request.completedByRecommendationId,
        failureReason: input.failureReason ?? request.failureReason,
      };
      return updated;
    });
    return updated
      ? { ...currentState, sourceFileRefreshRequests: requests, updatedAt: now }
      : currentState;
  });
  return updated;
}

function completeMatchingRefreshRequestsInState(input: {
  state: DossierWorkflowState;
  recommendation: DossierRecommendation;
  now: string;
}): DossierWorkflowState {
  if (input.recommendation.ingestSource !== "bnl_source_file_enrichment")
    return input.state;
  const normalizedSubjectKey = normalizeName(
    input.recommendation.subjectKey || input.recommendation.subjectName,
  );
  const targetCandidateId = input.recommendation.targetCandidateId;
  let changed = false;
  const activeDedupedRequests = mergeActiveSourceFileRefreshRequests(
    input.state.sourceFileRefreshRequests,
  );
  const requests = activeDedupedRequests.map((request) => {
    const matches =
      COMPLETABLE_REFRESH_STATUSES.has(request.status) &&
      (request.candidateId
        ? Boolean(
            targetCandidateId && request.candidateId === targetCandidateId,
          )
        : request.normalizedSubjectKey === normalizedSubjectKey ||
          normalizeName(request.subjectName) ===
            normalizeName(input.recommendation.subjectName));
    if (!matches) return request;
    changed = true;
    return {
      ...request,
      status: "completed" as const,
      completedAt: input.now,
      completedByRecommendationId: input.recommendation.id,
      updatedAt: input.now,
    };
  });
  return changed
    ? {
        ...input.state,
        sourceFileRefreshRequests: requests,
        updatedAt: input.now,
      }
    : input.state;
}

export async function createDossierRecommendationIdempotent(
  input: CreateDossierRecommendationInput,
): Promise<{
  recommendation: DossierRecommendation;
  duplicate: boolean;
  candidate?: DossierCandidate;
  autoAction?: "created_candidate" | "attached_existing" | "left_for_review";
}> {
  const normalized = normalizeRecommendationInput(input);
  if (!normalized) {
    throw new DossierWorkflowInputError(
      "Recommendation requires subjectName and reason",
    );
  }
  const now = new Date().toISOString();
  const recommendation: DossierRecommendation = {
    id: createRecommendationId(),
    ...normalized,
    status: "new",
    createdAt: now,
    updatedAt: now,
  };
  let savedRecommendation: DossierRecommendation = recommendation;
  let savedCandidate: DossierCandidate | undefined;
  let duplicate = false;
  let autoAction:
    | "created_candidate"
    | "attached_existing"
    | "left_for_review"
    | undefined;
  const isEnrichmentIngest =
    recommendation.ingestSource === "bnl_source_file_enrichment";

  await updateDossierWorkflowState((currentState) => {
    if (recommendation.targetCandidateId) {
      const candidate = currentState.candidates.find(
        (item) => item.id === recommendation.targetCandidateId,
      );
      if (!candidate) {
        throw new DossierWorkflowInputError(
          "Target candidate not found",
          404,
          "target_candidate_not_found",
        );
      }
      if (!isActiveSourceFileCandidate(candidate) && !isEnrichmentIngest) {
        throw new DossierWorkflowInputError(
          "Target candidate is not an active BNL Source File",
          400,
          "target_candidate_not_active",
        );
      }
    }

    const existing =
      (recommendation.ingestKey
        ? currentState.recommendations.find(
            (item) => item.ingestKey === recommendation.ingestKey,
          )
        : undefined) ??
      (recommendation.inputHash
        ? currentState.recommendations.find(
            (item) => item.inputHash === recommendation.inputHash,
          )
        : undefined) ??
      (recommendation.populationRecommendation
        ? populationRecommendationForSubjectAndAction(
            currentState.recommendations,
            recommendation,
          )
        : currentState.recommendations.find(
            (item) =>
              isActiveRecommendation(item) &&
              fallbackRecommendationDedupeKey(item) ===
                fallbackRecommendationDedupeKey(recommendation),
          ));

    if (existing) {
      if (
        isEnrichmentIngest &&
        existing.ingestSource === "bnl_source_file_enrichment"
      ) {
        const existingDigest = bnlSourceFileEnrichmentDigest(existing);
        const nextDigest = bnlSourceFileEnrichmentDigest(recommendation);
        if (existingDigest === nextDigest) {
          savedRecommendation = existing;
          duplicate = true;
          return currentState;
        }

        const targetCandidateId =
          recommendation.targetCandidateId ?? existing.targetCandidateId;
        const targetCandidate = targetCandidateId
          ? currentState.candidates.find(
              (candidate) => candidate.id === targetCandidateId,
            )
          : undefined;
        const refreshedRecommendationBase: DossierRecommendation = {
          ...recommendation,
          id: existing.id,
          status: existing.status,
          targetCandidateId,
          createdAt: existing.createdAt,
          updatedAt: now,
          publicSafetyNotes: uniqueStrings(recommendation.publicSafetyNotes, [
            BNL_SOURCE_FILE_ENRICHMENT_REFRESH_NOTE,
          ]),
        };

        if (targetCandidate) {
          if (!isSourceFileEnrichmentAttachableCandidate(targetCandidate)) {
            savedRecommendation = {
              ...refreshedRecommendationBase,
              publicSafetyNotes: uniqueStrings(
                refreshedRecommendationBase.publicSafetyNotes,
                [
                  "Target exists but is not open for enrichment attachment. No Source File, Proposed Dossier, public page, alias, merge, or owner-review state was changed.",
                ],
              ),
            };
            autoAction = "left_for_review";
            return {
              ...currentState,
              recommendations: currentState.recommendations.map((item) =>
                item.id === existing.id ? savedRecommendation : item,
              ),
              updatedAt: now,
            };
          }

          const updatedRecommendation: DossierRecommendation = {
            ...refreshedRecommendationBase,
            status: sourceFileEnrichmentAttachmentStatus(targetCandidate),
            targetCandidateId: targetCandidate.id,
          };
          savedRecommendation = updatedRecommendation;
          autoAction = "attached_existing";
          return {
            ...currentState,
            recommendations: currentState.recommendations.map((item) =>
              item.id === existing.id ? updatedRecommendation : item,
            ),
            candidates: currentState.candidates.map((candidate) =>
              candidate.id === targetCandidate.id
                ? upsertSourceFileEnrichmentNote({
                    candidate,
                    recommendation: updatedRecommendation,
                    now,
                  })
                : candidate,
            ),
            updatedAt: now,
          };
        }

        savedRecommendation = {
          ...refreshedRecommendationBase,
          publicSafetyNotes: uniqueStrings(
            refreshedRecommendationBase.publicSafetyNotes,
            [
              `${bnlIngestLabel(recommendation)} has no target; refreshed in Recommendation Inbox for owner/admin review. No Candidate Intake, Source File, Proposed Dossier, alias, merge, or public content was created.`,
            ],
          ),
        };
        autoAction = "left_for_review";
        return {
          ...currentState,
          recommendations: currentState.recommendations.map((item) =>
            item.id === existing.id ? savedRecommendation : item,
          ),
          updatedAt: now,
        };
      }

      if (recommendation.populationRecommendation && existing.populationRecommendation) {
        savedRecommendation = {
          ...existing,
          ...recommendation,
          id: existing.id,
          status: existing.status,
          createdAt: existing.createdAt,
          firstSeenAt: existing.firstSeenAt ?? existing.createdAt,
          lastSeenAt: now,
          seenCount: (existing.seenCount ?? 1) + 1,
          rawEvidenceRefs: uniqueStrings(existing.rawEvidenceRefs, recommendation.rawEvidenceRefs),
          rawEvidenceRefCount: uniqueStrings(existing.rawEvidenceRefs, recommendation.rawEvidenceRefs).length,
          populationReviewActions: existing.populationReviewActions,
          updatedAt: now,
        };
        duplicate = true;
        return {
          ...currentState,
          recommendations: currentState.recommendations.map((item) =>
            item.id === existing.id ? savedRecommendation : item,
          ),
          updatedAt: now,
        };
      }
      savedRecommendation = existing;
      duplicate = true;
      return currentState;
    }

    const matchingCandidateDestination = recommendation.populationRecommendation
      ? candidateDestinationForPopulationSubject(currentState.candidates, recommendation)
      : undefined;
    if (matchingCandidateDestination) {
      const recommendationBacked = isRecommendationBackedCandidate(
        matchingCandidateDestination,
      );
      const updatedLane: DossierPopulationRecommendedLane =
        matchingCandidateDestination.status === "active_source_file"
          ? "active_source_file"
          : matchingCandidateDestination.status === "existing_dossier_update"
            ? "existing_dossier_update"
            : recommendationBacked
              ? "already_represented"
              : "candidate_intake";
      const updatedAction: DossierPopulationRecommendedAction =
        matchingCandidateDestination.status === "active_source_file"
          ? "attach_to_existing_source_file"
          : matchingCandidateDestination.status === "existing_dossier_update"
            ? "attach_to_existing_dossier_update"
            : recommendationBacked
              ? "mark_duplicate_no_new_info"
              : "create_source_file_candidate";
      savedRecommendation = {
        ...recommendation,
        recommendedLane: updatedLane,
        recommendedAction: updatedAction,
        matchedExistingCandidateId:
          matchingCandidateDestination.status === "active_source_file"
            ? matchingCandidateDestination.id
            : recommendation.matchedExistingCandidateId,
        matchedDossierUpdateCandidateId:
          matchingCandidateDestination.status === "existing_dossier_update"
            ? matchingCandidateDestination.id
            : recommendation.matchedDossierUpdateCandidateId,
        targetCandidateId: matchingCandidateDestination.id,
        connectedCandidateId: matchingCandidateDestination.id,
        connectedRecommendationIds: uniqueStrings(
          recommendation.connectedRecommendationIds,
          matchingCandidateDestination.createdFromRecommendationId
            ? [matchingCandidateDestination.createdFromRecommendationId]
            : matchingCandidateDestination.connectedRecommendationIds,
        ),
        sourceRecommendationIds: uniqueStrings(
          recommendation.sourceRecommendationIds,
          matchingCandidateDestination.sourceRecommendationIds,
        ),
        duplicateRisk: recommendationBacked ? "high" : recommendation.duplicateRisk,
        routingReason:
          matchingCandidateDestination.status === "active_source_file"
            ? `Already represented by active Source File ${matchingCandidateDestination.id}; route to Source File instead of creating an Admin Review Required card.`
            : matchingCandidateDestination.status === "existing_dossier_update"
              ? `Already represented by Dossier Update workspace ${matchingCandidateDestination.id}; route to the workspace instead of creating an Admin Review Required card.`
              : recommendationBacked
                ? `Already waiting in Recommendation Intake as ${matchingCandidateDestination.id}; preserved population evidence refs internally without creating another Admin Review Required card.`
                : `Already represented by Candidate Intake ${matchingCandidateDestination.id}; route there instead of creating another Admin Review Required card.`,
        publicSafetyNotes: uniqueStrings(recommendation.publicSafetyNotes, [
          "Population recommendation matched an existing private workflow destination. Raw/private evidence refs remain internal and no public content was changed.",
        ]),
        rawEvidenceRefCount: recommendation.rawEvidenceRefs?.length ?? 0,
        updatedAt: now,
      };
      duplicate = recommendationBacked;
      return {
        ...currentState,
        recommendations: [savedRecommendation, ...currentState.recommendations],
        updatedAt: now,
      };
    }

    const matchingActiveRecommendation = recommendation.populationRecommendation
      ? activeNonPopulationRecommendationForSubject(currentState.recommendations, recommendation)
      : undefined;
    if (matchingActiveRecommendation) {
      savedRecommendation = {
        ...recommendation,
        status: "new",
        recommendedLane: "already_represented",
        recommendedAction: "mark_duplicate_no_new_info",
        duplicateRisk: "high",
        connectedRecommendationIds: uniqueStrings(recommendation.connectedRecommendationIds, [matchingActiveRecommendation.id]),
        sourceRecommendationIds: uniqueStrings(recommendation.sourceRecommendationIds, [matchingActiveRecommendation.id]),
        routingReason: `Already represented by active recommendation ${matchingActiveRecommendation.id}. Preserved population evidence refs internally; no extra Admin Review Required card is needed.`,
        publicSafetyNotes: uniqueStrings(recommendation.publicSafetyNotes, [
          "Population recommendation matched an unresolved recommendation-backed candidate/intake subject. Raw/private evidence refs remain internal and no public content was changed.",
        ]),
        rawEvidenceRefCount: recommendation.rawEvidenceRefs?.length ?? 0,
        updatedAt: now,
      };
      duplicate = true;
      return {
        ...currentState,
        recommendations: [savedRecommendation, ...currentState.recommendations],
        updatedAt: now,
      };
    }

    if (isEnrichmentIngest) {
      if (recommendation.targetCandidateId) {
        const targetCandidate = currentState.candidates.find(
          (candidate) => candidate.id === recommendation.targetCandidateId,
        );
        if (!targetCandidate) {
          throw new DossierWorkflowInputError(
            "Target candidate not found",
            404,
            "target_candidate_not_found",
          );
        }
        if (!isSourceFileEnrichmentAttachableCandidate(targetCandidate)) {
          savedRecommendation = {
            ...recommendation,
            publicSafetyNotes: [
              ...(recommendation.publicSafetyNotes ?? []),
              "Target exists but is not open for enrichment attachment. No Source File, Proposed Dossier, public page, alias, merge, or owner-review state was changed.",
            ],
            updatedAt: now,
          };
          autoAction = "left_for_review";
          return {
            ...currentState,
            recommendations: [
              savedRecommendation,
              ...currentState.recommendations,
            ],
            updatedAt: now,
          };
        }
        const targetStatusNote =
          targetCandidate.status === "candidate_intake"
            ? "attached as review-only BNL Source File Enrichment to Candidate Intake; no public dossier content was changed; owner/admin review is still required."
            : targetCandidate.status === "existing_dossier_update"
              ? "attached as review-only BNL Source File Enrichment to Existing Dossier Update; no public dossier content was changed; owner/admin review is still required."
              : targetCandidate.status === "active_source_file"
                ? "attached as review-only BNL Source File Enrichment to an Active BNL Source File; no public dossier content was changed; owner/admin review is still required."
                : "attached as review-only BNL Source File Enrichment to an open Source File review lane; no public dossier content was changed; owner/admin review is still required.";
        const updatedStatus: DossierRecommendationStatus =
          targetCandidate.status === "candidate_intake"
            ? "attached_to_candidate_intake"
            : targetCandidate.status === "existing_dossier_update"
              ? "attached_to_existing_dossier_update"
              : "attached_to_source_file";
        const updatedRecommendation: DossierRecommendation = {
          ...recommendation,
          status: updatedStatus,
          targetCandidateId: targetCandidate.id,
          publicSafetyNotes: [
            ...(recommendation.publicSafetyNotes ?? []),
            `${bnlIngestLabel(recommendation)} ${targetStatusNote}`,
          ],
          updatedAt: now,
        };
        savedRecommendation = updatedRecommendation;
        autoAction = "attached_existing";
        return {
          ...currentState,
          recommendations: [
            updatedRecommendation,
            ...currentState.recommendations,
          ],
          candidates: currentState.candidates.map((candidate) =>
            candidate.id === targetCandidate.id
              ? upsertSourceFileEnrichmentNote({
                  candidate,
                  recommendation: updatedRecommendation,
                  now,
                })
              : candidate,
          ),
          updatedAt: now,
        };
      }

      savedRecommendation = {
        ...recommendation,
        publicSafetyNotes: [
          ...(recommendation.publicSafetyNotes ?? []),
          `${bnlIngestLabel(recommendation)} has no target; left in Recommendation Inbox for owner/admin review. No Candidate Intake, Source File, Proposed Dossier, alias, merge, or public content was created.`,
        ],
      };
      autoAction = "left_for_review";
      return {
        ...currentState,
        recommendations: [savedRecommendation, ...currentState.recommendations],
        updatedAt: now,
      };
    }

    if (isAutoConvertibleBnlSourceRecommendation(recommendation)) {
      const ingestKeyCandidate = recommendation.ingestKey
        ? currentState.candidates.find(
            (candidate) =>
              candidate.ingestKey === recommendation.ingestKey &&
              isActiveSourceFileCandidate(candidate),
          )
        : undefined;
      if (ingestKeyCandidate) {
        const note: DossierSourceFileNote = {
          id: createSourceFileNoteId(),
          candidateId: ingestKeyCandidate.id,
          type: "general_note",
          text: bnlAutoCandidateNoteText(recommendation),
          source: "bnl_recommendation",
          status: "active",
          publicSafe: false,
          createdAt: now,
          updatedAt: now,
          createdBy: recommendation.createdBy,
          ingestKey: recommendation.ingestKey,
          ingestedAt: recommendation.ingestedAt,
          ingestSource: recommendation.ingestSource,
        };
        const updatedRecommendation: DossierRecommendation = {
          ...recommendation,
          status: attachmentStatusForCandidate(ingestKeyCandidate),
          targetCandidateId: ingestKeyCandidate.id,
          publicSafetyNotes: [
            ...(recommendation.publicSafetyNotes ?? []),
            `${bnlIngestLabel(recommendation)} ingest key already exists on a source file; linked without creating a duplicate candidate.`,
          ],
          updatedAt: now,
        };
        savedRecommendation = updatedRecommendation;
        autoAction = "attached_existing";
        return {
          ...currentState,
          recommendations: [
            updatedRecommendation,
            ...currentState.recommendations,
          ],
          candidates: currentState.candidates.map((candidate) =>
            candidate.id === ingestKeyCandidate.id
              ? {
                  ...candidate,
                  sourceFileNotes: [note, ...(candidate.sourceFileNotes ?? [])],
                  updatedAt: now,
                }
              : candidate,
          ),
          updatedAt: now,
        };
      }

      const match = matchDossierRecommendationSubject({
        recommendation,
        candidates: currentState.candidates,
      });

      if (match.exactCandidateId) {
        const note: DossierSourceFileNote = {
          id: createSourceFileNoteId(),
          candidateId: match.exactCandidateId,
          type: "general_note",
          text: bnlAutoCandidateNoteText(recommendation),
          source: "bnl_recommendation",
          status: "active",
          publicSafe: false,
          createdAt: now,
          updatedAt: now,
          createdBy: recommendation.createdBy,
          ingestKey: recommendation.ingestKey,
          ingestedAt: recommendation.ingestedAt,
          ingestSource: recommendation.ingestSource,
        };
        const updatedRecommendation: DossierRecommendation = {
          ...recommendation,
          status: attachmentStatusForCandidate(
            currentState.candidates.find(
              (candidate) => candidate.id === match.exactCandidateId,
            )!,
          ),
          targetCandidateId: match.exactCandidateId,
          publicSafetyNotes: [
            ...(recommendation.publicSafetyNotes ?? []),
            `${bnlIngestLabel(recommendation)} matched an existing exact same-subject workflow record and was attached without creating a duplicate candidate.`,
          ],
          updatedAt: now,
        };
        savedRecommendation = updatedRecommendation;
        autoAction = "attached_existing";
        return {
          ...currentState,
          recommendations: [
            updatedRecommendation,
            ...currentState.recommendations,
          ],
          candidates: currentState.candidates.map((candidate) =>
            candidate.id === match.exactCandidateId
              ? {
                  ...candidate,
                  sourceFileNotes: [note, ...(candidate.sourceFileNotes ?? [])],
                  updatedAt: now,
                }
              : candidate,
          ),
          updatedAt: now,
        };
      }

      if (match.possibleCandidateIds.length === 0) {
        const candidate = buildCandidateFromRecommendation({
          recommendation,
          now,
          source: bnlIngestCandidateSource(recommendation),
          noteText: bnlAutoCandidateNoteText(recommendation),
        });
        const updatedRecommendation: DossierRecommendation = {
          ...recommendation,
          status: "converted_to_source_file",
          targetCandidateId: candidate.id,
          publicSafetyNotes: [
            ...(recommendation.publicSafetyNotes ?? []),
            candidate.status === "existing_dossier_update"
              ? `${bnlIngestLabel(recommendation)} matched an existing public dossier and was staged as an Existing Dossier Update; no public dossier was edited.`
              : `${bnlIngestLabel(recommendation)} was staged as Candidate Intake; admin promotion is required before it becomes an active Source File.`,
          ],
          updatedAt: now,
        };
        savedRecommendation = updatedRecommendation;
        savedCandidate = candidate;
        autoAction =
          candidate.status === "existing_dossier_update"
            ? "left_for_review"
            : "created_candidate";
        return {
          ...currentState,
          candidates: [candidate, ...currentState.candidates],
          recommendations: [
            updatedRecommendation,
            ...currentState.recommendations,
          ],
          updatedAt: now,
        };
      }

      const possibleMatchRecommendation = currentState.recommendations.find(
        (item) =>
          isActiveRecommendation(item) &&
          item.identityReviewStatus === "needs_confirmation" &&
          normalizeName(item.subjectName) ===
            normalizeName(recommendation.subjectName) &&
          [...(item.possibleMatchCandidateIds ?? [])].sort().join("|") ===
            [...match.possibleCandidateIds].sort().join("|"),
      );
      const possibleSafetyNote = `${bnlIngestLabel(recommendation)} found possible existing source files; left in Recommendation Inbox for owner/lead duplicate or identity review.`;
      if (possibleMatchRecommendation) {
        savedRecommendation = {
          ...possibleMatchRecommendation,
          reason: recommendation.reason || possibleMatchRecommendation.reason,
          evidenceSummary:
            recommendation.evidenceSummary ??
            possibleMatchRecommendation.evidenceSummary,
          publicSafetyNotes: uniqueStrings(
            possibleMatchRecommendation.publicSafetyNotes,
            recommendation.publicSafetyNotes,
            [possibleSafetyNote],
          ),
          connectedRecommendationIds: uniqueStrings(
            possibleMatchRecommendation.connectedRecommendationIds,
            [recommendation.id],
          ),
          sourceRecommendationIds: uniqueStrings(
            possibleMatchRecommendation.sourceRecommendationIds,
            [recommendation.id],
          ),
          routingReason: match.reason,
          updatedAt: now,
        };
        duplicate = true;
        autoAction = "left_for_review";
        return {
          ...currentState,
          recommendations: currentState.recommendations.map((item) =>
            item.id === possibleMatchRecommendation.id
              ? savedRecommendation
              : item,
          ),
          updatedAt: now,
        };
      }

      savedRecommendation = {
        ...recommendation,
        type: "possible_connection_review",
        publicSafetyNotes: uniqueStrings(recommendation.publicSafetyNotes, [
          possibleSafetyNote,
        ]),
        possibleMatchCandidateIds: match.possibleCandidateIds,
        connectedCandidateId: match.possibleCandidateIds[0],
        connectedSourceFileCandidateId: match.possibleCandidateIds[0],
        identityReviewStatus: "needs_confirmation",
        routingReason: match.reason,
      };
      autoAction = "left_for_review";
      return {
        ...currentState,
        recommendations: [savedRecommendation, ...currentState.recommendations],
        updatedAt: now,
      };
    }

    savedRecommendation = recommendation;
    return {
      ...currentState,
      recommendations: [recommendation, ...currentState.recommendations],
      updatedAt: now,
    };
  });

  if (savedRecommendation.ingestSource === "bnl_source_file_enrichment") {
    await updateDossierWorkflowState((currentState) =>
      completeMatchingRefreshRequestsInState({
        state: currentState,
        recommendation: savedRecommendation,
        now,
      }),
    );
  }

  return {
    recommendation: savedRecommendation,
    duplicate,
    candidate: savedCandidate,
    autoAction,
  };
}

function packetLines(label: string, items?: string[]): string[] {
  return (items ?? []).map((item) => `${label}: ${item}`);
}

function recommendationSourceNoteText(
  recommendation: DossierRecommendation,
): string {
  const queueStatus = recommendation.queueSubmissionStatus
    ? `Queue/submission status: ${
        recommendation.queueSubmissionStatus === "not_connected"
          ? "Queue/submission history is not connected yet. This evidence does not confirm submitted song counts, play history, source type, or Priority/payment history."
          : recommendation.queueSubmissionStatus
      }`
    : "";
  const actionableSummary = [
    "Actionable Summary:",
    ...packetLines(
      "Recurring named topic",
      [
        (recommendation.usefulEvidence ?? []).find((item) =>
          /recurring named topic/i.test(item),
        ),
        (recommendation.topTopicDetails ?? []).find((item) =>
          /recurring named topic/i.test(item),
        ),
      ].filter(Boolean) as string[],
    ),
    ...packetLines(
      "Tool/platform mention",
      [
        (recommendation.musicSignals ?? []).find((item) =>
          /tool|platform|suno|udio|ableton|bandcamp|soundcloud/i.test(item),
        ),
      ].filter(Boolean) as string[],
    ),
    ...packetLines(
      "BNL interaction pattern",
      recommendation.bnlInteractionSignals,
    ),
    queueStatus,
    recommendation.recommendedAction
      ? `Recommended next action: ${recommendation.recommendedAction}`
      : "",
    "",
    "Detailed Evidence Log:",
  ];
  return [
    ...actionableSummary,
    `Recommendation reason: ${recommendation.reason}`,
    ...packetLines("Known context", recommendation.knownContext),
    ...packetLines("Useful evidence", recommendation.usefulEvidence),
    ...packetLines(
      "Relationship signal — private review",
      recommendation.relationshipSignals,
    ),
    ...packetLines(
      "Public-safe possibility pending owner review",
      recommendation.publicSafePossibilities,
    ),
    ...packetLines("Private/internal note", recommendation.privateOnlyNotes),
    ...packetLines("Not public yet", recommendation.notPublicYet),
    ...packetLines(
      "Best evidence to review",
      recommendation.bestEvidenceToReview,
    ),
    ...packetLines(
      "Observed channel/activity",
      recommendation.observedChannels,
    ),
    ...packetLines(
      "Conversation highlight",
      recommendation.conversationHighlights,
    ),
    ...packetLines(
      "BNL interaction signal",
      recommendation.bnlInteractionSignals,
    ),
    ...packetLines("Music/show signal", recommendation.musicSignals),
    ...packetLines("Community signal", recommendation.communitySignals),
    ...packetLines(
      "Activity frequency",
      recommendation.activityFrequencySummary,
    ),
    ...packetLines("Top channel", recommendation.topChannels),
    ...packetLines("Recent activity", recommendation.recentActivitySummary),
    ...packetLines(
      "Posted/mentioned balance",
      recommendation.authoredVsMentionedSummary,
    ),
    ...packetLines(
      "Public-use candidate pending owner review",
      recommendation.publicUseCandidates,
    ),
    ...packetLines("Review-only evidence", recommendation.reviewOnlyEvidence),
    queueStatus,
    recommendation.queueSubmissionNote
      ? `Queue/submission note: ${recommendation.queueSubmissionNote}`
      : "",
    recommendation.recommendedAction
      ? `Recommended next action: ${recommendation.recommendedAction}`
      : "",
    ...packetLines("Supporting classification", recommendation.topicBreakdown),
    ...packetLines("Supporting classification", recommendation.topTopicDetails),
    ...packetLines("Source coverage", recommendation.sourceCoverage),
    ...packetLines("Evidence detail", recommendation.evidenceDetails),
    ...packetLines(
      "Representative evidence",
      recommendation.representativeEvidence,
    ),
    ...(recommendation.sourceAuthority ?? []).map(
      (item) => `Source authority / confidence boundary: ${item}`,
    ),
    recommendation.evidenceSummary
      ? `Evidence summary: ${recommendation.evidenceSummary}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);
}

export class DossierWorkflowInputError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    code = "invalid_input",
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DossierWorkflowInputError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeIdentityLinkInput(
  input: CreateDossierIdentityLinkInput,
): Omit<
  DossierIdentityLink,
  "id" | "normalizedLabel" | "status" | "createdAt" | "updatedAt"
> | null {
  const candidateId = boundedText(input.candidateId, 200);
  const label = boundedText(input.label, 120);
  if (!candidateId || !label) return null;
  const type = IDENTITY_LINK_TYPES.includes(input.type ?? "alias")
    ? (input.type ?? "alias")
    : "alias";
  const visibility = IDENTITY_LINK_VISIBILITIES.includes(
    input.visibility ?? "internal_only",
  )
    ? (input.visibility ?? "internal_only")
    : "internal_only";
  const source = IDENTITY_LINK_SOURCES.includes(input.source ?? "admin_manual")
    ? (input.source ?? "admin_manual")
    : "admin_manual";
  const confidence = ["low", "medium", "high", "confirmed"].includes(
    input.confidence ?? "",
  )
    ? input.confidence
    : undefined;
  return {
    candidateId,
    label,
    type,
    visibility,
    source,
    confidence,
    useForMatching: input.useForMatching === true,
    useInPublicDossier: input.useInPublicDossier === true,
    note: boundedText(input.note, 1000) || undefined,
    createdBy: boundedText(input.createdBy, 200) || undefined,
    useForMatchingAfterConfirmation:
      input.useForMatchingAfterConfirmation === true ||
      input.useForMatching === true,
    createdFromRecommendationId:
      boundedText(input.createdFromRecommendationId, 200) || undefined,
    createdFromRecommendationSubject:
      boundedText(input.createdFromRecommendationSubject, 200) || undefined,
  };
}

function assertNoDuplicateActiveIdentityLink(input: {
  candidate: DossierCandidate;
  normalizedLabel: string;
  exceptIdentityLinkId?: string;
}) {
  const duplicate = (input.candidate.identityLinks ?? []).find(
    (identityLink) =>
      identityLink.id !== input.exceptIdentityLinkId &&
      ACTIVE_IDENTITY_LINK_STATUSES.has(identityLink.status) &&
      identityLink.normalizedLabel === input.normalizedLabel,
  );
  if (!duplicate) return;
  throw new DossierWorkflowInputError(
    "An active identity link with this label already exists on this BNL Source File",
    400,
    "duplicate_identity_link",
    { identityLinkId: duplicate.id },
  );
}

export async function addDossierIdentityLink(
  input: CreateDossierIdentityLinkInput,
): Promise<DossierIdentityLink> {
  const normalized = normalizeIdentityLinkInput(input);
  if (!normalized) {
    throw new DossierWorkflowInputError(
      "Identity link requires candidateId and a non-empty label",
      400,
      "invalid_identity_link",
    );
  }

  const now = new Date().toISOString();
  const identityLink: DossierIdentityLink = {
    id: createIdentityLinkId(),
    ...normalized,
    normalizedLabel: normalizeName(normalized.label),
    status: "proposed",
    useForMatching: false,
    useInPublicDossier: false,
    createdAt: now,
    updatedAt: now,
  };
  let saved: DossierIdentityLink | null = null;

  await updateDossierWorkflowState((currentState) => {
    let found = false;
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== identityLink.candidateId) return candidate;
      found = true;
      assertNoDuplicateActiveIdentityLink({
        candidate,
        normalizedLabel: identityLink.normalizedLabel,
      });
      saved = identityLink;
      return {
        ...candidate,
        identityLinks: [identityLink, ...(candidate.identityLinks ?? [])],
        updatedAt: now,
      };
    });
    if (!found) {
      throw new DossierWorkflowInputError(
        "Candidate not found",
        404,
        "candidate_not_found",
      );
    }
    return { ...currentState, candidates, updatedAt: now };
  });

  return saved ?? identityLink;
}

export async function createIdentityLinkFromRecommendation(
  input: CreateIdentityLinkFromRecommendationInput,
): Promise<{
  recommendation: DossierRecommendation;
  identityLink: DossierIdentityLink;
}> {
  const recommendationId = boundedText(input.recommendationId, 200);
  const candidateId = boundedText(input.candidateId, 200);
  const label = boundedText(input.label, 120);
  if (!recommendationId || !candidateId || !label) {
    throw new DossierWorkflowInputError(
      "recommendationId, candidateId, and label are required",
      400,
      "invalid_identity_link_recommendation",
    );
  }

  const now = new Date().toISOString();
  let result: {
    recommendation: DossierRecommendation;
    identityLink: DossierIdentityLink;
  } | null = null;

  await updateDossierWorkflowState((currentState) => {
    const recommendation = currentState.recommendations.find(
      (item) => item.id === recommendationId,
    );
    if (!recommendation) {
      throw new DossierWorkflowInputError(
        "Recommendation not found",
        404,
        "recommendation_not_found",
      );
    }
    assertRecommendationIsOpen(recommendation);

    const candidate = currentState.candidates.find(
      (item) => item.id === candidateId,
    );
    if (!candidate) {
      throw new DossierWorkflowInputError(
        "Candidate not found",
        404,
        "candidate_not_found",
      );
    }
    if (!isActiveSourceFileCandidate(candidate)) {
      throw new DossierWorkflowInputError(
        "Candidate is not an active BNL Source File",
        400,
        "candidate_not_attachable",
      );
    }
    if (
      recommendation.targetCandidateId &&
      recommendation.targetCandidateId !== candidate.id
    ) {
      throw new DossierWorkflowInputError(
        "Recommendation is pre-targeted to a different BNL Source File",
        400,
        "recommendation_target_mismatch",
        { targetCandidateId: recommendation.targetCandidateId },
      );
    }

    const normalized = normalizeIdentityLinkInput({
      candidateId,
      label,
      type: input.type ?? "alias",
      visibility: input.visibility ?? "internal_only",
      source: input.source ?? "bnl_recommendation",
      note: input.note,
      useForMatchingAfterConfirmation:
        input.useForMatchingAfterConfirmation !== false,
      useInPublicDossier: input.useInPublicDossier === true,
      createdBy: input.createdBy,
      createdFromRecommendationId: recommendation.id,
      createdFromRecommendationSubject: recommendation.subjectName,
    });
    if (!normalized) {
      throw new DossierWorkflowInputError(
        "Identity link requires candidateId and a non-empty label",
        400,
        "invalid_identity_link",
      );
    }

    const identityLink: DossierIdentityLink = {
      id: createIdentityLinkId(),
      ...normalized,
      normalizedLabel: normalizeName(normalized.label),
      status: "proposed",
      useForMatching: false,
      useInPublicDossier: false,
      createdAt: now,
      updatedAt: now,
    };

    assertNoDuplicateActiveIdentityLink({
      candidate,
      normalizedLabel: identityLink.normalizedLabel,
    });

    const updatedRecommendation: DossierRecommendation = {
      ...recommendation,
      status: "identity_link_created",
      targetCandidateId: candidate.id,
      updatedAt: now,
    };
    result = { recommendation: updatedRecommendation, identityLink };

    return {
      ...currentState,
      recommendations: currentState.recommendations.map((item) =>
        item.id === recommendation.id ? updatedRecommendation : item,
      ),
      candidates: currentState.candidates.map((item) =>
        item.id === candidate.id
          ? {
              ...item,
              identityLinks: [identityLink, ...(item.identityLinks ?? [])],
              updatedAt: now,
            }
          : item,
      ),
      updatedAt: now,
    };
  });

  if (!result) {
    throw new DossierWorkflowInputError(
      "Recommendation not found",
      404,
      "recommendation_not_found",
    );
  }
  return result;
}

export async function updateDossierIdentityLink(
  input: UpdateDossierIdentityLinkInput,
): Promise<DossierIdentityLink> {
  const now = new Date().toISOString();
  const candidateId = boundedText(input.candidateId, 200);
  const identityLinkId = boundedText(input.identityLinkId, 200);
  if (!candidateId || !identityLinkId) {
    throw new DossierWorkflowInputError(
      "Identity link update requires candidateId and identityLinkId",
      400,
      "invalid_identity_link",
    );
  }
  let updatedLink: DossierIdentityLink | null = null;

  await updateDossierWorkflowState((currentState) => {
    let foundCandidate = false;
    let foundLink = false;
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== candidateId) return candidate;
      foundCandidate = true;
      const currentLinks = candidate.identityLinks ?? [];
      const identityLinks = currentLinks.map((identityLink) => {
        if (identityLink.id !== identityLinkId) return identityLink;
        foundLink = true;
        const label =
          typeof input.label === "string"
            ? boundedText(input.label, 120)
            : identityLink.label;
        if (!label) {
          throw new DossierWorkflowInputError(
            "Identity link label cannot be empty",
            400,
            "invalid_identity_link",
          );
        }
        const normalizedLabel = normalizeName(label);
        assertNoDuplicateActiveIdentityLink({
          candidate,
          normalizedLabel,
          exceptIdentityLinkId: identityLink.id,
        });
        updatedLink = {
          ...identityLink,
          label,
          normalizedLabel,
          type:
            input.type && IDENTITY_LINK_TYPES.includes(input.type)
              ? input.type
              : identityLink.type,
          visibility:
            input.visibility &&
            IDENTITY_LINK_VISIBILITIES.includes(input.visibility)
              ? input.visibility
              : identityLink.visibility,
          source:
            input.source && IDENTITY_LINK_SOURCES.includes(input.source)
              ? input.source
              : identityLink.source,
          confidence: ["low", "medium", "high", "confirmed"].includes(
            input.confidence ?? "",
          )
            ? input.confidence
            : identityLink.confidence,
          useForMatching:
            identityLink.status === "confirmed"
              ? input.useForMatching === true
              : false,
          useInPublicDossier:
            identityLink.status === "confirmed" &&
            input.useInPublicDossier === true,
          useForMatchingAfterConfirmation:
            input.useForMatching === true ||
            identityLink.useForMatchingAfterConfirmation,
          note:
            typeof input.note === "string"
              ? boundedText(input.note, 1000) || undefined
              : identityLink.note,
          updatedAt: now,
        };
        return updatedLink;
      });
      return {
        ...candidate,
        identityLinks,
        updatedAt: foundLink ? now : candidate.updatedAt,
      };
    });
    if (!foundCandidate) {
      throw new DossierWorkflowInputError(
        "Candidate not found",
        404,
        "candidate_not_found",
      );
    }
    if (!foundLink) {
      throw new DossierWorkflowInputError(
        "Identity link not found",
        404,
        "identity_link_not_found",
      );
    }
    return { ...currentState, candidates, updatedAt: now };
  });

  return updatedLink!;
}

async function setDossierIdentityLinkStatus(
  input: ReviewDossierIdentityLinkInput,
  status: Exclude<DossierIdentityLinkStatus, "proposed">,
): Promise<DossierIdentityLink> {
  const now = new Date().toISOString();
  const candidateId = boundedText(input.candidateId, 200);
  const identityLinkId = boundedText(input.identityLinkId, 200);
  let updatedLink: DossierIdentityLink | null = null;

  await updateDossierWorkflowState((currentState) => {
    let foundCandidate = false;
    let foundLink = false;
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== candidateId) return candidate;
      foundCandidate = true;
      const identityLinks = (candidate.identityLinks ?? []).map(
        (identityLink) => {
          if (identityLink.id !== identityLinkId) return identityLink;
          foundLink = true;
          updatedLink = {
            ...identityLink,
            status,
            confidence:
              status === "confirmed" ? "confirmed" : identityLink.confidence,
            useForMatching:
              status === "confirmed" &&
              (input.useForMatching ??
                identityLink.useForMatchingAfterConfirmation) === true,
            useInPublicDossier:
              status === "confirmed" && input.useInPublicDossier === true,
            confirmedBy:
              status === "confirmed"
                ? boundedText(input.reviewedBy, 200) || identityLink.confirmedBy
                : identityLink.confirmedBy,
            confirmedAt:
              status === "confirmed" ? now : identityLink.confirmedAt,
            updatedAt: now,
          };
          if (status !== "confirmed") {
            updatedLink.useForMatching = false;
            updatedLink.useInPublicDossier = false;
          }
          return updatedLink;
        },
      );
      return {
        ...candidate,
        identityLinks,
        updatedAt: foundLink ? now : candidate.updatedAt,
      };
    });
    if (!foundCandidate) {
      throw new DossierWorkflowInputError(
        "Candidate not found",
        404,
        "candidate_not_found",
      );
    }
    if (!foundLink) {
      throw new DossierWorkflowInputError(
        "Identity link not found",
        404,
        "identity_link_not_found",
      );
    }
    return { ...currentState, candidates, updatedAt: now };
  });

  return updatedLink!;
}

export function confirmDossierIdentityLink(
  input: ReviewDossierIdentityLinkInput,
): Promise<DossierIdentityLink> {
  return setDossierIdentityLinkStatus(input, "confirmed");
}

export function rejectDossierIdentityLink(
  input: ReviewDossierIdentityLinkInput,
): Promise<DossierIdentityLink> {
  return setDossierIdentityLinkStatus(input, "rejected");
}

export function retireDossierIdentityLink(
  input: ReviewDossierIdentityLinkInput,
): Promise<DossierIdentityLink> {
  return setDossierIdentityLinkStatus(input, "retired");
}

export async function updateDossierSourceFileSummary(
  input: UpdateDossierSourceFileSummaryInput,
): Promise<DossierCandidate | null> {
  const normalized = normalizeSourceFileSummaryInput(input);
  if (!normalized) {
    throw new DossierWorkflowInputError(
      "Source file summary requires a candidateId",
      400,
      "candidate_id_required",
    );
  }

  const now = new Date().toISOString();
  let updatedCandidate: DossierCandidate | null = null;

  await updateDossierWorkflowState((currentState) => {
    let found = false;
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== normalized.candidateId) return candidate;
      found = true;
      const hasSummary = Boolean(
        normalized.summaryText ||
        normalized.knownContext.length ||
        normalized.openQuestions.length ||
        normalized.nextAction,
      );
      updatedCandidate = {
        ...candidate,
        sourceFileSummary: hasSummary
          ? {
              summaryText: normalized.summaryText,
              knownContext: normalized.knownContext,
              openQuestions: normalized.openQuestions,
              nextAction: normalized.nextAction,
              updatedAt: now,
              updatedBy: normalized.updatedBy,
            }
          : undefined,
        updatedAt: now,
      };
      return updatedCandidate;
    });
    if (!found) {
      throw new DossierWorkflowInputError(
        "Candidate not found",
        404,
        "candidate_not_found",
      );
    }
    return { ...currentState, candidates, updatedAt: now };
  });

  return updatedCandidate;
}

export async function addDossierSourceFileNote(
  input: CreateDossierSourceFileNoteInput,
): Promise<DossierSourceFileNote> {
  const normalized = normalizeSourceNoteInput(input);
  if (!normalized) {
    throw new DossierWorkflowInputError(
      "Source file note requires candidateId and non-empty text",
    );
  }

  const now = new Date().toISOString();
  const note: DossierSourceFileNote = {
    id: createSourceFileNoteId(),
    ...normalized,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  let saved: DossierSourceFileNote | null = null;

  await updateDossierWorkflowState((currentState) => {
    let found = false;
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== note.candidateId) return candidate;
      found = true;
      saved = note;
      return {
        ...candidate,
        sourceFileNotes: [note, ...(candidate.sourceFileNotes ?? [])],
        updatedAt: now,
      };
    });
    if (!found) {
      throw new DossierWorkflowInputError(
        "Candidate not found",
        404,
        "candidate_not_found",
      );
    }
    return { ...currentState, candidates, updatedAt: now };
  });

  return saved ?? note;
}

export async function createDossierRecommendation(
  input: CreateDossierRecommendationInput,
): Promise<DossierRecommendation> {
  const normalized = normalizeRecommendationInput(input);
  if (!normalized) {
    throw new DossierWorkflowInputError(
      "Recommendation requires subjectName and reason",
    );
  }
  const now = new Date().toISOString();
  const recommendation: DossierRecommendation = {
    id: createRecommendationId(),
    ...normalized,
    status: "new",
    createdAt: now,
    updatedAt: now,
  };

  await updateDossierWorkflowState((currentState) => ({
    ...currentState,
    recommendations: [recommendation, ...currentState.recommendations],
    updatedAt: now,
  }));

  return recommendation;
}

export async function attachRecommendationToCandidate(input: {
  recommendationId: string;
  candidateId: string;
  createSourceNote?: boolean;
}): Promise<{
  recommendation: DossierRecommendation;
  note?: DossierSourceFileNote;
}> {
  const now = new Date().toISOString();
  let updatedRecommendation: DossierRecommendation | null = null;
  let note: DossierSourceFileNote | undefined;

  await updateDossierWorkflowState((currentState) => {
    const recommendation = currentState.recommendations.find(
      (item) => item.id === input.recommendationId,
    );
    if (!recommendation) {
      throw new DossierWorkflowInputError(
        "Recommendation not found",
        404,
        "recommendation_not_found",
      );
    }
    assertRecommendationIsOpen(recommendation);
    const candidate = currentState.candidates.find(
      (item) => item.id === input.candidateId,
    );
    if (!candidate) {
      throw new DossierWorkflowInputError(
        "Candidate not found",
        404,
        "candidate_not_found",
      );
    }
    if (!isActiveSourceFileCandidate(candidate)) {
      throw new DossierWorkflowInputError(
        "Candidate is not an active BNL Source File",
        400,
        "candidate_not_attachable",
      );
    }
    const match = matchDossierRecommendationSubject({
      recommendation,
      candidates: currentState.candidates,
    });
    const preTargetedCandidateMatch =
      recommendation.targetCandidateId === candidate.id;
    if (match.exactCandidateId !== candidate.id && !preTargetedCandidateMatch) {
      throw new DossierWorkflowInputError(
        "Recommendation subject does not match the selected BNL Source File",
        400,
        "recommendation_subject_mismatch",
        {
          exactCandidateId: match.exactCandidateId,
          exactMatchKind: match.exactMatchKind,
          possibleCandidateIds: match.possibleCandidateIds,
          reason: match.reason,
        },
      );
    }

    if (input.createSourceNote) {
      note = {
        id: createSourceFileNoteId(),
        candidateId: candidate.id,
        type: "general_note",
        text: recommendation.ingestSource?.startsWith("bnl")
          ? bnlAutoCandidateNoteText(recommendation)
          : recommendationSourceNoteText(recommendation),
        source: "bnl_recommendation",
        status: "active",
        publicSafe: false,
        createdAt: now,
        updatedAt: now,
        createdBy: recommendation.createdBy,
        ingestKey: recommendation.ingestKey,
        ingestedAt: recommendation.ingestedAt,
        ingestSource: recommendation.ingestSource,
      };
    }

    updatedRecommendation = {
      ...recommendation,
      status: "attached_to_source_file",
      targetCandidateId: candidate.id,
      updatedAt: now,
    };

    return {
      ...currentState,
      recommendations: currentState.recommendations.map((item) =>
        item.id === recommendation.id ? updatedRecommendation! : item,
      ),
      candidates: currentState.candidates.map((item) =>
        item.id === candidate.id
          ? {
              ...item,
              sourceFileNotes: note
                ? [note, ...(item.sourceFileNotes ?? [])]
                : (item.sourceFileNotes ?? []),
              updatedAt: note ? now : item.updatedAt,
            }
          : item,
      ),
      updatedAt: now,
    };
  });

  if (!updatedRecommendation) {
    throw new DossierWorkflowInputError(
      "Recommendation not found",
      404,
      "recommendation_not_found",
    );
  }
  return { recommendation: updatedRecommendation, note };
}

export async function convertRecommendationToCandidate(
  recommendationId: string,
): Promise<{
  recommendation: DossierRecommendation;
  candidate: DossierCandidate;
}> {
  const now = new Date().toISOString();
  let result: {
    recommendation: DossierRecommendation;
    candidate: DossierCandidate;
  } | null = null;

  await updateDossierWorkflowState((currentState) => {
    const recommendation = currentState.recommendations.find(
      (item) => item.id === recommendationId,
    );
    if (!recommendation) {
      throw new DossierWorkflowInputError(
        "Recommendation not found",
        404,
        "recommendation_not_found",
      );
    }
    assertRecommendationIsOpen(recommendation);
    if (recommendation.ingestSource === "bnl_source_file_enrichment") {
      throw new DossierWorkflowInputError(
        "BNL Source File Enrichment cannot create a new candidate automatically",
        400,
        "enrichment_cannot_create_candidate",
      );
    }
    const match = matchDossierRecommendationSubject({
      recommendation,
      candidates: currentState.candidates,
    });
    if (match.exactCandidateId) {
      const existingCandidate = currentState.candidates.find(
        (item) => item.id === match.exactCandidateId,
      );
      if (existingCandidate) {
        const updatedRecommendation: DossierRecommendation = {
          ...recommendation,
          status: attachmentStatusForCandidate(existingCandidate),
          targetCandidateId: existingCandidate.id,
          connectedCandidateId: existingCandidate.id,
          connectedSourceFileCandidateId: existingCandidate.id,
          identityReviewStatus: "not_required",
          routingReason: match.reason,
          updatedAt: now,
        };
        const note = routingNote({
          candidateId: existingCandidate.id,
          now,
          text: recommendation.ingestSource?.startsWith("bnl")
            ? bnlAutoCandidateNoteText(updatedRecommendation)
            : recommendationSourceNoteText(updatedRecommendation),
          source: "bnl_recommendation",
          createdBy: recommendation.createdBy,
          ingestKey: recommendation.ingestKey,
          ingestedAt: recommendation.ingestedAt,
          ingestSource: recommendation.ingestSource,
        });
        const updatedCandidate = mergeCandidateSignal({
          candidate: existingCandidate,
          now,
          note,
          evidenceSummary: recommendation.evidenceSummary,
          connectedRecommendationId: recommendation.id,
          routingReason: match.reason,
          identityReviewStatus: "not_required",
        });
        result = {
          recommendation: updatedRecommendation,
          candidate: updatedCandidate,
        };
        return {
          ...currentState,
          recommendations: currentState.recommendations.map((item) =>
            item.id === recommendation.id ? updatedRecommendation : item,
          ),
          candidates: currentState.candidates.map((item) =>
            item.id === existingCandidate.id ? updatedCandidate : item,
          ),
          updatedAt: now,
        };
      }
    }
    const candidate = buildCandidateFromRecommendation({
      recommendation,
      now,
      source:
        recommendation.ingestSource === "bnl_dynamic_candidate_discovery" ||
        recommendation.ingestSource === "bnl_source_knowledge_bridge"
          ? bnlIngestCandidateSource(recommendation)
          : "manual",
      noteText:
        recommendation.ingestSource === "bnl_dynamic_candidate_discovery" ||
        recommendation.ingestSource === "bnl_source_knowledge_bridge"
          ? bnlAutoCandidateNoteText(recommendation)
          : recommendationSourceNoteText(recommendation),
    });
    const promotedCandidate = {
      ...candidate,
      status: "active_source_file" as const,
    };
    const updatedRecommendation: DossierRecommendation = {
      ...recommendation,
      status: "converted_to_source_file",
      targetCandidateId: candidate.id,
      updatedAt: now,
    };
    result = {
      recommendation: updatedRecommendation,
      candidate: promotedCandidate,
    };

    return {
      ...currentState,
      candidates: [promotedCandidate, ...currentState.candidates],
      recommendations: currentState.recommendations.map((item) =>
        item.id === recommendation.id ? updatedRecommendation : item,
      ),
      updatedAt: now,
    };
  });

  if (!result) {
    throw new DossierWorkflowInputError(
      "Recommendation not found",
      404,
      "recommendation_not_found",
    );
  }
  return result;
}

async function setRecommendationStatus(
  recommendationId: string,
  status: "ignored" | "dismissed" | "archived",
): Promise<DossierRecommendation> {
  const now = new Date().toISOString();
  let updatedRecommendation: DossierRecommendation | null = null;
  await updateDossierWorkflowState((currentState) => {
    const recommendations = currentState.recommendations.map(
      (recommendation) => {
        if (recommendation.id !== recommendationId) return recommendation;
        assertRecommendationIsOpen(recommendation);
        updatedRecommendation = { ...recommendation, status, updatedAt: now };
        return updatedRecommendation;
      },
    );
    if (!updatedRecommendation) {
      throw new DossierWorkflowInputError(
        "Recommendation not found",
        404,
        "recommendation_not_found",
      );
    }
    return { ...currentState, recommendations, updatedAt: now };
  });
  return updatedRecommendation!;
}

export type PopulationSignalDestinationKind =
  | "public_dossier"
  | "dossier_draft"
  | "dossier_update_workspace"
  | "active_source_file"
  | "candidate_intake"
  | "recommendation_backed_intake"
  | "existing_population_recommendation"
  | "resolved_or_archived_record"
  | "non_dossier_signal"
  | "no_destination"
  | "ambiguous";

export type PopulationSignalDestination = {
  destinationKind: PopulationSignalDestinationKind;
  destinationId?: string;
  destinationName?: string;
  destinationHref?: string;
  recommendedInternalAction:
    | DossierPopulationRecommendedAction
    | "attach_to_draft_context"
    | "mark_already_represented"
    | "merge_population_duplicate";
  shouldAutoResolve: boolean;
  shouldShowToAdmin: boolean;
  reason: string;
};

export type PopulationReconcileSummary = {
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

type PopulationSignalResolverInput = {
  recommendation: DossierRecommendation;
  candidates: DossierCandidate[];
  recommendations: DossierRecommendation[];
  drafts: DossierDraft[];
  publicDossiers?: Array<{ id: string; name: string }>;
};

function isPopulationSignal(recommendation: DossierRecommendation): boolean {
  return (
    recommendation.type === "population_recommendation" ||
    recommendation.populationRecommendation === true ||
    recommendation.ingestSource === "bnl_population_recommender" ||
    recommendation.createdBy === "bnl_population_recommender"
  );
}

function populationSignalSubjectKey(recommendation: DossierRecommendation): string {
  return recommendationDedupeSubject(
    recommendation.subjectKey || recommendation.subjectName,
  );
}

function populationSignalSubjectKeys(recommendation: DossierRecommendation): string[] {
  return uniqueStrings([
    populationSignalSubjectKey(recommendation),
    recommendationDedupeSubject(
      (recommendation.subjectKey || recommendation.subjectName).replace(/\[[^\]]+\]/g, " "),
    ),
  ]);
}

function candidateHref(candidateId: string): string {
  return `/admin/dossiers/candidates/${encodeURIComponent(candidateId)}`;
}

function recommendationHref(recommendationId: string): string {
  return `/admin/dossiers/recommendations/${encodeURIComponent(recommendationId)}`;
}

function publicDossierHref(name: string): string {
  return `/database/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function candidateMatchesSubject(candidate: DossierCandidate, subjectKey: string): boolean {
  if (!subjectKey) return false;
  if (recommendationDedupeSubject(candidate.name) === subjectKey) return true;
  return (candidate.identityLinks ?? []).some(
    (link) =>
      link.useForMatching &&
      recommendationDedupeSubject(link.label || link.normalizedLabel) === subjectKey,
  );
}

function publicDossierForPopulationSubject(
  recommendation: DossierRecommendation,
  publicDossiers: Array<{ id: string; name: string }>,
) {
  const subjectKeys = populationSignalSubjectKeys(recommendation);
  return publicDossiers.find(
    (entry) =>
      entry.id === recommendation.matchedPublicDossierId ||
      entry.id === recommendation.targetDossierId ||
      subjectKeys.includes(recommendationDedupeSubject(entry.name)),
  );
}

function isDraftActiveForPopulation(draft: DossierDraft): boolean {
  return !["denied", "superseded", "published"].includes(draft.status);
}

function draftDestinationForPopulationSubject(
  drafts: DossierDraft[],
  candidates: DossierCandidate[],
  recommendation: DossierRecommendation,
): { draft: DossierDraft; candidate?: DossierCandidate } | undefined {
  const subjectKey = populationSignalSubjectKey(recommendation);
  return drafts
    .filter(isDraftActiveForPopulation)
    .map((draft) => ({
      draft,
      candidate: candidates.find((candidate) => candidate.id === draft.candidateId),
    }))
    .find(({ draft, candidate }) => {
      const draftName = draft.fields?.name ?? candidate?.name ?? "";
      return (
        recommendationDedupeSubject(draftName) === subjectKey ||
        Boolean(candidate && candidateMatchesSubject(candidate, subjectKey))
      );
    });
}

function resolvedRecordForPopulationSubject(
  candidates: DossierCandidate[],
  recommendations: DossierRecommendation[],
  recommendation: DossierRecommendation,
): DossierCandidate | DossierRecommendation | undefined {
  const subjectKey = populationSignalSubjectKey(recommendation);
  return (
    candidates.find(
      (candidate) =>
        ["archived", "denied", "merged"].includes(candidate.status) &&
        candidateMatchesSubject(candidate, subjectKey),
    ) ??
    recommendations.find(
      (item) =>
        item.id !== recommendation.id &&
        isPopulationSignal(item) &&
        ["dismissed", "no_new_info", "not_population_subject", "archived"].includes(item.status) &&
        populationSignalSubjectKey(item) === subjectKey,
    )
  );
}

function nonDossierPopulationSignal(recommendation: DossierRecommendation): boolean {
  return ["show_state_note", "broadcast_memory_note", "not_population_subject"].includes(
    recommendation.recommendedAction ?? recommendation.recommendedLane ?? "",
  );
}

export function resolvePopulationSignalDestination({
  recommendation,
  candidates,
  recommendations,
  drafts,
  publicDossiers = databasePage.entries.map((entry) => ({ id: entry.id, name: entry.name })),
}: PopulationSignalResolverInput): PopulationSignalDestination {
  const publicDossier = publicDossierForPopulationSubject(recommendation, publicDossiers);
  if (publicDossier) {
    const updateWorkspace = candidates.find(
      (candidate) =>
        candidate.status === "existing_dossier_update" &&
        candidate.existingDossierMatch?.id === publicDossier.id,
    );
    if (updateWorkspace) {
      return {
        destinationKind: "dossier_update_workspace",
        destinationId: updateWorkspace.id,
        destinationName: updateWorkspace.name,
        destinationHref: candidateHref(updateWorkspace.id),
        recommendedInternalAction: "attach_to_existing_dossier_update",
        shouldAutoResolve: true,
        shouldShowToAdmin: false,
        reason: "Existing public dossier also has an internal Dossier Update workspace.",
      };
    }
    return {
      destinationKind: "public_dossier",
      destinationId: publicDossier.id,
      destinationName: publicDossier.name,
      destinationHref: publicDossierHref(publicDossier.name),
      recommendedInternalAction: "mark_no_new_info",
      shouldAutoResolve: true,
      shouldShowToAdmin: false,
      reason: "Subject already has a public dossier; no Source File Candidate should be created by default.",
    };
  }

  const draftDestination = draftDestinationForPopulationSubject(drafts, candidates, recommendation);
  if (draftDestination) {
    const id = draftDestination.candidate?.id ?? draftDestination.draft.candidateId;
    return {
      destinationKind: "dossier_draft",
      destinationId: draftDestination.draft.id,
      destinationName: draftDestination.draft.fields?.name ?? draftDestination.candidate?.name,
      destinationHref: id ? candidateHref(id) : undefined,
      recommendedInternalAction: "attach_to_draft_context",
      shouldAutoResolve: true,
      shouldShowToAdmin: false,
      reason: "Subject already has an internal dossier draft; do not create a second candidate.",
    };
  }

  const subjectKey = populationSignalSubjectKey(recommendation);
  const candidateDestination = candidates.find(
    (candidate) =>
      !["archived", "denied", "merged"].includes(candidate.status) &&
      candidateMatchesSubject(candidate, subjectKey),
  );
  if (candidateDestination) {
    const recommendationBacked = isRecommendationBackedCandidate(candidateDestination);
    if (candidateDestination.status === "existing_dossier_update") {
      return {
        destinationKind: "dossier_update_workspace",
        destinationId: candidateDestination.id,
        destinationName: candidateDestination.name,
        destinationHref: candidateHref(candidateDestination.id),
        recommendedInternalAction: "attach_to_existing_dossier_update",
        shouldAutoResolve: true,
        shouldShowToAdmin: false,
        reason: "Subject already has a Dossier Update workspace.",
      };
    }
    if (isActiveSourceFileCandidate(candidateDestination)) {
      return {
        destinationKind: "active_source_file",
        destinationId: candidateDestination.id,
        destinationName: candidateDestination.name,
        destinationHref: candidateHref(candidateDestination.id),
        recommendedInternalAction: "attach_to_existing_source_file",
        shouldAutoResolve: true,
        shouldShowToAdmin: false,
        reason: "Subject already has an active Source File.",
      };
    }
    return {
      destinationKind: recommendationBacked ? "recommendation_backed_intake" : "candidate_intake",
      destinationId: candidateDestination.id,
      destinationName: candidateDestination.name,
      destinationHref: candidateHref(candidateDestination.id),
      recommendedInternalAction: recommendationBacked ? "mark_duplicate_no_new_info" : "create_source_file_candidate",
      shouldAutoResolve: true,
      shouldShowToAdmin: false,
      reason: recommendationBacked
        ? "Subject is already represented by recommendation-backed intake."
        : "Subject already has a Candidate Intake record.",
    };
  }

  const activeNonPopulation = activeNonPopulationRecommendationForSubject(recommendations, recommendation);
  if (activeNonPopulation) {
    return {
      destinationKind: "recommendation_backed_intake",
      destinationId: activeNonPopulation.id,
      destinationName: activeNonPopulation.subjectName,
      destinationHref: recommendationHref(activeNonPopulation.id),
      recommendedInternalAction: "mark_duplicate_no_new_info",
      shouldAutoResolve: true,
      shouldShowToAdmin: false,
      reason: "Subject is already represented by an active non-population recommendation.",
    };
  }

  const activePopulation = recommendations.find(
    (item) =>
      item.id !== recommendation.id &&
      isPopulationSignal(item) &&
      isActiveRecommendation(item) &&
      populationSignalSubjectKey(item) === subjectKey,
  );
  if (activePopulation) {
    return {
      destinationKind: "existing_population_recommendation",
      destinationId: activePopulation.id,
      destinationName: activePopulation.subjectName,
      destinationHref: recommendationHref(activePopulation.id),
      recommendedInternalAction: "merge_population_duplicate",
      shouldAutoResolve: true,
      shouldShowToAdmin: false,
      reason: "An active population recommendation for this subject already exists.",
    };
  }

  const resolvedRecord = resolvedRecordForPopulationSubject(candidates, recommendations, recommendation);
  if (resolvedRecord) {
    return {
      destinationKind: "resolved_or_archived_record",
      destinationId: resolvedRecord.id,
      destinationName: "name" in resolvedRecord ? resolvedRecord.name : resolvedRecord.subjectName,
      destinationHref: "subjectName" in resolvedRecord ? recommendationHref(resolvedRecord.id) : candidateHref(resolvedRecord.id),
      recommendedInternalAction: "mark_no_new_info",
      shouldAutoResolve: true,
      shouldShowToAdmin: false,
      reason: "Subject matches a resolved, archived, merged, or no-new-info workflow record.",
    };
  }

  if (nonDossierPopulationSignal(recommendation)) {
    return {
      destinationKind: "non_dossier_signal",
      recommendedInternalAction: "mark_not_population_subject",
      shouldAutoResolve: true,
      shouldShowToAdmin: false,
      reason: "Signal is a show-state or broadcast note, not a dossier subject.",
    };
  }

  const ambiguous = (recommendation.possibleTargets ?? []).length > 1;
  if (!ambiguous) {
    return {
      destinationKind: "candidate_intake",
      destinationHref: recommendationHref(recommendation.id),
      recommendedInternalAction: "create_source_file_candidate",
      shouldAutoResolve: true,
      shouldShowToAdmin: false,
      reason: "No existing internal destination was found; BNL Signal Filing created Candidate Intake for this new subject.",
    };
  }
  return {
    destinationKind: "ambiguous",
    destinationHref: recommendationHref(recommendation.id),
    recommendedInternalAction: "admin_review_required",
    shouldAutoResolve: false,
    shouldShowToAdmin: true,
    reason: "Multiple plausible destinations remain; admin review is required.",
  };
}

function initialPopulationReconcileSummary(): PopulationReconcileSummary {
  return {
    signalsReviewed: 0,
    attachedToSourceFiles: 0,
    attachedToDossierUpdates: 0,
    attachedToCandidateIntake: 0,
    attachedToExistingRecommendations: 0,
    markedAlreadyRepresented: 0,
    markedNoNewInfo: 0,
    createdDossierUpdateWorkspaces: 0,
    createdSourceFileCandidates: 0,
    unresolvedNeedsReview: 0,
    duplicatesCollapsed: 0,
    evidenceRefsMerged: 0,
    publicPagesPublished: 0,
    publicDossierTextChanged: 0,
    internalAliasesExposed: 0,
  };
}

function populationDuplicateIdentity(
  recommendation: DossierRecommendation,
  destination: PopulationSignalDestination,
): string {
  return [
    populationSignalSubjectKey(recommendation),
    destination.destinationKind,
    destination.recommendedInternalAction,
    destination.destinationId ?? "",
  ].join("|");
}

function mergePopulationRecommendationEvidence(
  target: DossierRecommendation,
  duplicate: DossierRecommendation,
  now: string,
): DossierRecommendation {
  const refs = uniqueStrings(target.rawEvidenceRefs, duplicate.rawEvidenceRefs);
  return {
    ...target,
    rawEvidenceRefs: refs,
    rawEvidenceRefCount: refs.length,
    seenCount: (target.seenCount ?? 1) + (duplicate.seenCount ?? 1),
    firstSeenAt: target.firstSeenAt ?? target.createdAt,
    lastSeenAt: now,
    updatedAt: now,
  };
}

function populationAttachedNoteText(recommendation: DossierRecommendation, destination: PopulationSignalDestination): string {
  return [
    `BNL Signal Filing filed this population signal into ${destination.destinationKind}.`,
    recommendation.adminSummary ? `Admin summary: ${recommendation.adminSummary}` : undefined,
    recommendation.evidenceSummary ? `Evidence summary: ${recommendation.evidenceSummary}` : undefined,
    `Internal evidence refs preserved: ${recommendation.rawEvidenceRefCount ?? recommendation.rawEvidenceRefs?.length ?? 0}.`,
    "No public dossier text was changed and no public page was published by this filing action.",
  ].filter(Boolean).join("\n\n").slice(0, 4000);
}

export async function reconcilePopulationSignals(input: { actionBy?: string } = {}): Promise<PopulationReconcileSummary> {
  const summary = initialPopulationReconcileSummary();
  const now = new Date().toISOString();

  await updateDossierWorkflowState((currentState) => {
    let candidates = currentState.candidates;
    let recommendations = currentState.recommendations;
    let stateChanged = false;
    const visibleByIdentity = new Map<string, DossierRecommendation>();

    for (const recommendation of currentState.recommendations) {
      if (!isPopulationSignal(recommendation)) continue;
      summary.signalsReviewed += 1;
      if (!isActiveRecommendation(recommendation)) continue;

      const destination = resolvePopulationSignalDestination({
        recommendation,
        candidates,
        recommendations,
        drafts: currentState.drafts,
      });
      const duplicateKey = populationDuplicateIdentity(recommendation, destination);
      const visibleExisting = visibleByIdentity.get(duplicateKey);
      if (visibleExisting) {
        const merged = mergePopulationRecommendationEvidence(visibleExisting, recommendation, now);
        stateChanged = true;
        recommendations = recommendations.map((item) => {
          if (item.id === visibleExisting.id) return merged;
          if (item.id === recommendation.id) {
            return {
              ...item,
              status: "no_new_info",
              recommendedLane: "already_represented",
              recommendedAction: "mark_no_new_info",
              routingReason: `Duplicate collapsed into population signal ${visibleExisting.id}.`,
              updatedAt: now,
            };
          }
          return item;
        });
        visibleByIdentity.set(duplicateKey, merged);
        summary.duplicatesCollapsed += 1;
        summary.evidenceRefsMerged += 1;
        continue;
      }
      visibleByIdentity.set(duplicateKey, recommendation);

      let targetCandidate = destination.destinationId
        ? candidates.find((candidate) => candidate.id === destination.destinationId)
        : undefined;
      let nextRecommendation: DossierRecommendation = recommendation;
      let nextStatus: DossierRecommendationStatus | undefined;
      let nextLane: DossierPopulationRecommendedLane | undefined;
      let nextAction: DossierPopulationRecommendedAction | undefined;

      if (destination.destinationKind === "candidate_intake" && !targetCandidate) {
        targetCandidate = buildCandidateFromRecommendation({
          recommendation,
          now,
          source: recommendation.ingestSource === "bnl_population_recommender" ? "bnl_dynamic_candidate_discovery" : bnlIngestCandidateSource(recommendation),
          noteText: populationAttachedNoteText(recommendation, destination),
        });
        targetCandidate = { ...targetCandidate, status: "candidate_intake" };
        candidates = [targetCandidate, ...candidates];
        stateChanged = true;
        summary.createdSourceFileCandidates += 1;
      }

      if (!destination.shouldAutoResolve) {
        nextLane = "needs_population_review";
        nextAction = "admin_review_required";
        summary.unresolvedNeedsReview += 1;
      } else if (destination.destinationKind === "active_source_file" && targetCandidate) {
        nextStatus = "attached_to_source_file";
        nextLane = "active_source_file";
        nextAction = "attach_to_existing_source_file";
        summary.attachedToSourceFiles += 1;
      } else if (destination.destinationKind === "dossier_update_workspace" && targetCandidate) {
        nextStatus = "attached_to_existing_dossier_update";
        nextLane = "existing_dossier_update";
        nextAction = "attach_to_existing_dossier_update";
        summary.attachedToDossierUpdates += 1;
      } else if (destination.destinationKind === "candidate_intake" && targetCandidate) {
        nextStatus = "attached_to_candidate_intake";
        nextLane = "candidate_intake";
        nextAction = "create_source_file_candidate";
        summary.attachedToCandidateIntake += 1;
      } else if (destination.destinationKind === "dossier_draft") {
        nextStatus = "attached_to_candidate_intake";
        nextLane = "candidate_intake";
        nextAction = "mark_no_new_info";
        summary.attachedToCandidateIntake += 1;
        if (!targetCandidate && recommendation.targetCandidateId) {
          targetCandidate = candidates.find((candidate) => candidate.id === recommendation.targetCandidateId);
        }
      } else if (destination.destinationKind === "recommendation_backed_intake") {
        nextStatus = "no_new_info";
        nextLane = "already_represented";
        nextAction = "mark_duplicate_no_new_info";
        summary.attachedToExistingRecommendations += 1;
        summary.markedAlreadyRepresented += 1;
      } else if (destination.destinationKind === "existing_population_recommendation" && destination.destinationId) {
        const target = recommendations.find((item) => item.id === destination.destinationId);
        if (target) {
          const merged = mergePopulationRecommendationEvidence(target, recommendation, now);
          recommendations = recommendations.map((item) => item.id === target.id ? merged : item);
          summary.evidenceRefsMerged += 1;
        }
        nextStatus = "no_new_info";
        nextLane = "already_represented";
        nextAction = "mark_no_new_info";
        summary.attachedToExistingRecommendations += 1;
        summary.duplicatesCollapsed += 1;
      } else if (destination.destinationKind === "public_dossier" || destination.destinationKind === "resolved_or_archived_record") {
        nextStatus = "no_new_info";
        nextLane = "already_represented";
        nextAction = "mark_no_new_info";
        summary.markedAlreadyRepresented += 1;
        summary.markedNoNewInfo += 1;
      } else if (destination.destinationKind === "non_dossier_signal") {
        nextStatus = "not_population_subject";
        nextLane = "not_population_subject";
        nextAction = "mark_not_population_subject";
      }

      if (
        !destination.shouldAutoResolve &&
        recommendation.recommendedLane === "needs_population_review" &&
        recommendation.recommendedAction === "admin_review_required" &&
        recommendation.routingReason === destination.reason
      ) {
        continue;
      }

      nextRecommendation = {
        ...recommendation,
        status: nextStatus ?? recommendation.status,
        recommendedLane: nextLane ?? recommendation.recommendedLane,
        recommendedAction: nextAction ?? recommendation.recommendedAction,
        targetCandidateId: targetCandidate?.id ?? recommendation.targetCandidateId,
        connectedCandidateId: targetCandidate?.id ?? recommendation.connectedCandidateId,
        connectedSourceFileCandidateId: targetCandidate?.id ?? recommendation.connectedSourceFileCandidateId,
        targetDossierId: destination.destinationKind === "public_dossier" ? destination.destinationId : recommendation.targetDossierId,
        matchedPublicDossierId: destination.destinationKind === "public_dossier" ? destination.destinationId : recommendation.matchedPublicDossierId,
        matchedPublicDossierName: destination.destinationKind === "public_dossier" ? destination.destinationName : recommendation.matchedPublicDossierName,
        matchedExistingCandidateId: destination.destinationKind === "active_source_file" ? destination.destinationId : recommendation.matchedExistingCandidateId,
        matchedDossierUpdateCandidateId: destination.destinationKind === "dossier_update_workspace" ? destination.destinationId : recommendation.matchedDossierUpdateCandidateId,
        routingReason: destination.reason,
        populationReviewActions: destination.shouldAutoResolve
          ? [
              ...(recommendation.populationReviewActions ?? []),
              {
                action: nextAction ?? "mark_no_new_info",
                actionAt: now,
                actionBy: input.actionBy,
                actionReason: `BNL Signal Filing: ${destination.reason}`,
                targetCandidateId: targetCandidate?.id,
                targetDossierId: destination.destinationKind === "public_dossier" ? destination.destinationId : recommendation.targetDossierId,
              },
            ]
          : recommendation.populationReviewActions,
        lastSeenAt: now,
        seenCount: recommendation.seenCount ?? 1,
        rawEvidenceRefCount: recommendation.rawEvidenceRefCount ?? recommendation.rawEvidenceRefs?.length ?? 0,
        updatedAt: now,
      };

      recommendations = recommendations.map((item) => item.id === recommendation.id ? nextRecommendation : item);
      stateChanged = true;

      if (targetCandidate && ["active_source_file", "dossier_update_workspace", "candidate_intake", "dossier_draft"].includes(destination.destinationKind)) {
        const note = routingNote({
          candidateId: targetCandidate.id,
          now,
          text: populationAttachedNoteText(recommendation, destination),
          source: "bnl_recommendation",
          createdBy: recommendation.createdBy,
          ingestKey: recommendation.ingestKey,
          ingestedAt: recommendation.ingestedAt,
          ingestSource: recommendation.ingestSource,
        });
        stateChanged = true;
        candidates = candidates.map((candidate) => candidate.id === targetCandidate!.id ? {
          ...candidate,
          sourceFileNotes: [note, ...(candidate.sourceFileNotes ?? [])],
          connectedRecommendationIds: uniqueStrings(candidate.connectedRecommendationIds, [recommendation.id]),
          sourceRecommendationIds: uniqueStrings(candidate.sourceRecommendationIds, [recommendation.id]),
          updatedAt: now,
        } : candidate);
      }
    }

    recommendations = recommendations.map((item) => {
      if (
        isPopulationSignal(item) &&
        ["new", "reviewing"].includes(item.status) &&
        item.recommendedAction === "admin_review_required" &&
        publicDossierForPopulationSubject(item, databasePage.entries.map((entry) => ({ id: entry.id, name: entry.name })))
      ) {
        stateChanged = true;
        return {
          ...item,
          status: "no_new_info",
          recommendedLane: "already_represented",
          recommendedAction: "mark_no_new_info",
          routingReason: "BNL Signal Filing found an existing public dossier during final duplicate cleanup.",
          updatedAt: now,
        };
      }
      return item;
    });

    if (!stateChanged) return currentState;

    return {
      ...currentState,
      candidates,
      recommendations,
      updatedAt: now,
    };
  });

  return summary;
}


export type PopulationReviewRecommendationActionInput = {
  recommendationId: string;
  action: DossierPopulationRecommendedAction | "mark_needs_more_info";
  candidateId?: string;
  dossierId?: string;
  actionBy?: string;
  actionReason?: string;
};

function populationActionStatus(
  action: PopulationReviewRecommendationActionInput["action"],
  candidate?: DossierCandidate,
): DossierRecommendationStatus {
  if (action === "dismiss_population_recommendation") return "dismissed";
  if (action === "mark_no_new_info") return "no_new_info";
  if (action === "mark_not_population_subject") return "not_population_subject";
  if (action === "mark_needs_more_info") return "needs_more_info";
  if (action === "attach_to_existing_dossier_update") return "attached_to_existing_dossier_update";
  if (action === "attach_to_existing_source_file") return "attached_to_source_file";
  if (action === "create_dossier_update_workspace") return "attached_to_existing_dossier_update";
  if (action === "create_source_file_candidate") return "attached_to_candidate_intake";
  return candidate ? attachmentStatusForCandidate(candidate) : "reviewing";
}

function populationActionNoteText(recommendation: DossierRecommendation, action: string): string {
  return [
    `BNL Signal Filing action: ${action}.`,
    recommendation.adminSummary ? `Admin summary: ${recommendation.adminSummary}` : undefined,
    recommendation.evidenceSummary ? `Evidence summary: ${recommendation.evidenceSummary}` : undefined,
    recommendation.recommendedNextStep ? `Recommended next step: ${recommendation.recommendedNextStep}` : undefined,
    recommendation.rawEvidenceRefCount || recommendation.rawEvidenceRefs?.length
      ? `Internal evidence refs preserved: ${recommendation.rawEvidenceRefCount ?? recommendation.rawEvidenceRefs?.length ?? 0}.`
      : undefined,
    "No public dossier text was changed and no public page was published by this action.",
  ].filter(Boolean).join("\n\n").slice(0, 4000);
}

export async function applyPopulationReviewRecommendationAction(
  input: PopulationReviewRecommendationActionInput,
): Promise<{ recommendation: DossierRecommendation; candidate?: DossierCandidate }> {
  if (input.action === "reopen_population_recommendation") {
    const now = new Date().toISOString();
    let updated: DossierRecommendation | null = null;
    await updateDossierWorkflowState((currentState) => ({
      ...currentState,
      recommendations: currentState.recommendations.map((recommendation) => {
        if (recommendation.id !== input.recommendationId) return recommendation;
        updated = {
          ...recommendation,
          status: "reviewing",
          routingReason: input.actionReason || "Reopened from BNL Signal Filing.",
          populationReviewActions: [
            ...(recommendation.populationReviewActions ?? []),
            { action: input.action, actionAt: now, actionBy: input.actionBy, actionReason: input.actionReason },
          ],
          updatedAt: now,
        };
        return updated;
      }),
      updatedAt: now,
    }));
    if (!updated) throw new DossierWorkflowInputError("Recommendation not found", 404, "recommendation_not_found");
    return { recommendation: updated };
  }

  const now = new Date().toISOString();
  let result: { recommendation: DossierRecommendation; candidate?: DossierCandidate } | null = null;

  await updateDossierWorkflowState((currentState) => {
    const recommendation = currentState.recommendations.find((item) => item.id === input.recommendationId);
    if (!recommendation) throw new DossierWorkflowInputError("Recommendation not found", 404, "recommendation_not_found");
    assertRecommendationIsOpen(recommendation);

    let candidates = currentState.candidates;
    let targetCandidate = input.candidateId
      ? candidates.find((candidate) => candidate.id === input.candidateId)
      : undefined;
    if (!targetCandidate && recommendation.matchedExistingCandidateId) {
      targetCandidate = candidates.find((candidate) => candidate.id === recommendation.matchedExistingCandidateId);
    }
    if (!targetCandidate && recommendation.matchedDossierUpdateCandidateId) {
      targetCandidate = candidates.find((candidate) => candidate.id === recommendation.matchedDossierUpdateCandidateId);
    }
    if (!targetCandidate && recommendation.targetCandidateId) {
      targetCandidate = candidates.find((candidate) => candidate.id === recommendation.targetCandidateId);
    }

    if (input.action === "create_source_file_candidate") {
      const existingMatch = matchDossierRecommendationSubject({ recommendation, candidates });
      targetCandidate = existingMatch.exactCandidateId
        ? candidates.find((candidate) => candidate.id === existingMatch.exactCandidateId)
        : undefined;
      if (!targetCandidate) {
        targetCandidate = buildCandidateFromRecommendation({
          recommendation,
          now,
          source: recommendation.ingestSource === "bnl_population_recommender" ? "bnl_dynamic_candidate_discovery" : bnlIngestCandidateSource(recommendation),
          noteText: populationActionNoteText(recommendation, input.action),
        });
        targetCandidate = { ...targetCandidate, status: "candidate_intake" };
        candidates = [targetCandidate, ...candidates];
      }
    }

    if (input.action === "create_dossier_update_workspace") {
      const dossierId = input.dossierId || recommendation.matchedPublicDossierId || recommendation.targetDossierId;
      const entry = databasePage.entries.find((item) => item.id === dossierId);
      if (!entry) throw new DossierWorkflowInputError("dossierId is required", 400, "dossier_id_required");
      targetCandidate = candidates.find((candidate) => candidate.status === "existing_dossier_update" && candidate.existingDossierMatch?.id === entry.id);
      if (!targetCandidate) {
        targetCandidate = buildCandidateFromRecommendation({
          recommendation: { ...recommendation, subjectName: entry.name, targetDossierId: entry.id },
          now,
          source: "website_read_model",
          noteText: populationActionNoteText(recommendation, input.action),
        });
        targetCandidate = {
          ...targetCandidate,
          name: entry.name,
          status: "existing_dossier_update",
          existingDossierMatch: { id: entry.id, name: entry.name, confidence: "high" as const },
        };
        candidates = [targetCandidate, ...candidates];
      }
    }

    if ((input.action === "attach_to_existing_source_file" || input.action === "attach_to_existing_dossier_update") && !targetCandidate) {
      throw new DossierWorkflowInputError("Target workflow record not found", 404, "target_candidate_not_found");
    }

    const nextStatus = populationActionStatus(input.action, targetCandidate);
    const updatedRecommendation: DossierRecommendation = {
      ...recommendation,
      status: nextStatus,
      targetCandidateId: targetCandidate?.id ?? recommendation.targetCandidateId,
      targetDossierId: input.dossierId ?? recommendation.matchedPublicDossierId ?? recommendation.targetDossierId,
      connectedCandidateId: targetCandidate?.id ?? recommendation.connectedCandidateId,
      connectedSourceFileCandidateId: targetCandidate?.id ?? recommendation.connectedSourceFileCandidateId,
      routingReason: input.actionReason || `BNL Signal Filing action: ${input.action}`,
      populationReviewActions: [
        ...(recommendation.populationReviewActions ?? []),
        {
          action: input.action,
          actionAt: now,
          actionBy: input.actionBy,
          actionReason: input.actionReason,
          targetCandidateId: targetCandidate?.id,
          targetDossierId: input.dossierId ?? recommendation.matchedPublicDossierId ?? recommendation.targetDossierId,
        },
      ],
      updatedAt: now,
    };

    if (targetCandidate && ["attach_to_existing_source_file", "attach_to_existing_dossier_update", "create_dossier_update_workspace", "create_source_file_candidate"].includes(input.action)) {
      const note = routingNote({
        candidateId: targetCandidate.id,
        now,
        text: populationActionNoteText(recommendation, input.action),
        source: "bnl_recommendation",
        createdBy: recommendation.createdBy,
        ingestKey: recommendation.ingestKey,
        ingestedAt: recommendation.ingestedAt,
        ingestSource: recommendation.ingestSource,
      });
      candidates = candidates.map((candidate) => candidate.id === targetCandidate!.id ? {
        ...candidate,
        sourceFileNotes: [note, ...(candidate.sourceFileNotes ?? [])],
        connectedRecommendationIds: uniqueStrings(candidate.connectedRecommendationIds, [recommendation.id]),
        sourceRecommendationIds: uniqueStrings(candidate.sourceRecommendationIds, [recommendation.id]),
        updatedAt: now,
      } : candidate);
      targetCandidate = candidates.find((candidate) => candidate.id === targetCandidate!.id) ?? targetCandidate;
    }

    result = { recommendation: updatedRecommendation, candidate: targetCandidate };
    return {
      ...currentState,
      recommendations: currentState.recommendations.map((item) => item.id === recommendation.id ? updatedRecommendation : item),
      candidates,
      updatedAt: now,
    };
  });

  if (!result) throw new DossierWorkflowInputError("Recommendation not found", 404, "recommendation_not_found");
  return result;
}


export function ignoreDossierRecommendation(
  recommendationId: string,
): Promise<DossierRecommendation> {
  return setRecommendationStatus(recommendationId, "ignored");
}

export function dismissDossierRecommendation(
  recommendationId: string,
): Promise<DossierRecommendation> {
  return setRecommendationStatus(recommendationId, "dismissed");
}

export function archiveDossierRecommendation(
  recommendationId: string,
): Promise<DossierRecommendation> {
  return setRecommendationStatus(recommendationId, "archived");
}

function candidateTypeFromPublicDossierEntry(
  entry: DatabaseEntry,
): DossierCandidate["candidateType"] {
  if (entry.kind === "artist" || entry.category === "Artist") return "artist";
  if (entry.kind === "collaborator" || entry.category === "Collaborator") return "collaborator";
  if (entry.kind === "moderator" || entry.category === "Personnel") return "personnel";
  if (entry.kind === "community_member" || entry.kind === "radio_regular" || entry.category === "Community") {
    return "community_member";
  }
  if (entry.category === "Production") return "production";
  if (entry.category === "Interface") return "interface";
  if (entry.category === "Sponsor") return "sponsor";
  if (entry.category === "Entity") return "entity";
  return "unknown";
}

export async function createExistingDossierUpdateTarget(
  input: CreateExistingDossierUpdateTargetInput,
): Promise<DossierCandidate> {
  const now = new Date().toISOString();
  const entry = databasePage.entries.find(
    (item) => item.id === input.dossierId,
  );
  if (!entry) {
    throw new DossierWorkflowInputError(
      "Existing public dossier target was not found",
      400,
      "existing_dossier_not_found",
    );
  }

  const existingDossierMatch = {
    id: entry.id,
    name: entry.name,
    confidence: "high" as const,
  };
  const requestedSubject = input.requestedSubject?.trim();
  const requestedSubjectNote =
    requestedSubject && requestedSubject !== entry.name
      ? ` Requested lookup subject: ${requestedSubject}.`
      : "";

  const candidate: DossierCandidate = {
    id: createCandidateId(),
    name: entry.name,
    candidateType: candidateTypeFromPublicDossierEntry(entry),
    source: "website_read_model",
    tier: "review_candidate",
    score: 58,
    whyNow:
      "BNL/operator requested source enrichment for an existing public dossier subject.",
    reason:
      "Existing public dossier found; internal update lane created for review-only enrichment.",
    firstSeenAt: now,
    lastSeenAt: now,
    evidenceSummary: `Existing public dossier ${entry.id} / ${entry.name} matched protected source-file lookup.${requestedSubjectNote}`,
    evidenceItems: [
      {
        id: createEvidenceId(),
        type: "website_context",
        label: "Existing public dossier match",
        summary: `Existing public dossier ${entry.id} / ${entry.name} is the review-only update target.`,
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        publicSafe: true,
      },
    ],
    evidenceCount: 1,
    knownFacts: [
      `Existing public dossier target: ${entry.id} / ${entry.name}.`,
    ],
    confidence: "medium",
    duplicateRisk: "high",
    existingDossierMatch,
    recommendedCategory: entry.category,
    recommendedKind: entry.kind,
    recommendedEcosystemLane: entry.ecosystemLane,
    recommendedIdentityAuthority: entry.identityAuthority,
    recommendedStatus: entry.status,
    recommendedClearance: entry.clearance,
    recommendedOrigin: entry.origin,
    recommendedTags: entry.tags,
    proposedTags: [],
    missingInfo: [
      "Review enrichment notes before applying anything to a proposed dossier or public content.",
    ],
    doNotSay: ["Do not treat update notes as owner-approved public copy."],
    publicSafetyNotes: [
      "Review-only update material; do not publish automatically.",
      "This internal update lane does not approve public copy, aliases, identity merges, or publication.",
    ],
    sourceFileNotes: [],
    identityLinks: [],
    sourceLanes: ["website_dossier"],
    status: "existing_dossier_update",
    createdAt: now,
    updatedAt: now,
  };

  let createdOrExistingCandidate = candidate;

  await updateDossierWorkflowState((currentState) => {
    const existing = currentState.candidates.find(
      (item) =>
        item.status === "existing_dossier_update" &&
        item.existingDossierMatch?.id === entry.id,
    );
    if (existing) {
      createdOrExistingCandidate = existing;
      return currentState;
    }

    return {
      ...currentState,
      candidates: [candidate, ...currentState.candidates],
      updatedAt: now,
    };
  });

  return createdOrExistingCandidate;
}

export async function createManualDossierCandidate(
  input: CreateManualDossierCandidateInput,
): Promise<DossierCandidate> {
  const now = new Date().toISOString();
  const name = input.name.trim();
  const reason = input.reason.trim();
  const knownFacts = normalizeStringArray(input.knownFacts);
  const missingInfoInput = normalizeStringArray(input.missingInfo);
  const doNotSay = normalizeStringArray(input.doNotSay);
  const publicSafetyNotesInput = normalizeStringArray(input.publicSafetyNotes);
  const recommendedTags = normalizeStringArray(input.recommendedTags);
  const proposedTags = normalizeStringArray(input.proposedTags);
  const scored = scoreManualDossierCandidate({
    ...input,
    name,
    reason,
    knownFacts,
    missingInfo: missingInfoInput,
    doNotSay,
    publicSafetyNotes: publicSafetyNotesInput,
    recommendedTags,
    proposedTags,
  });
  const duplicate = findExistingDossierMatch(name);
  const missingInfo = [...scored.missingInfo];
  const publicSafetyNotes = [...scored.publicSafetyNotes];

  if (duplicate.match) {
    const duplicateMessage = `Duplicate review required before drafting: possible match ${duplicate.match.id} / ${duplicate.match.name}.`;
    missingInfo.push(duplicateMessage);
    publicSafetyNotes.push(duplicateMessage);
  }

  const candidate: DossierCandidate = {
    id: createCandidateId(),
    name,
    candidateType: input.candidateType ?? "unknown",
    source: "manual",
    tier:
      duplicate.risk === "high" && scored.tier === "draft_ready"
        ? "review_candidate"
        : scored.tier,
    score: scored.score,
    whyNow: input.whyNow?.trim() ?? "",
    reason,
    firstSeenAt: now,
    lastSeenAt: now,
    evidenceSummary: input.evidenceSummary?.trim() ?? "",
    evidenceItems: input.evidenceSummary?.trim()
      ? [
          {
            id: createEvidenceId(),
            type: "manual_nomination",
            label: "Manual operator intake",
            summary: input.evidenceSummary.trim(),
            count: 1,
            firstSeenAt: now,
            lastSeenAt: now,
            publicSafe: input.primaryLink?.publicSafe !== false,
          },
        ]
      : [],
    evidenceCount: input.evidenceSummary?.trim() ? 1 : 0,
    knownFacts,
    confidence: scored.confidence,
    duplicateRisk: duplicate.risk,
    existingDossierMatch: duplicate.match,
    recommendedCategory: input.recommendedCategory,
    recommendedKind: input.recommendedKind,
    recommendedEcosystemLane: input.recommendedEcosystemLane,
    recommendedIdentityAuthority: input.recommendedIdentityAuthority,
    recommendedStatus: input.recommendedStatus,
    recommendedClearance: input.recommendedClearance,
    recommendedOrigin: input.recommendedOrigin,
    recommendedTags,
    proposedTags,
    primaryLink: input.primaryLink?.url ? input.primaryLink : undefined,
    missingInfo,
    doNotSay,
    publicSafetyNotes,
    sourceFileNotes: [],
    status: scored.tier === "weak_candidate" ? "suggested" : "needs_review",
    createdAt: now,
    updatedAt: now,
  };

  let savedCandidate: DossierCandidate = candidate;

  await updateDossierWorkflowState((currentState) => {
    const subjectMatch = matchDossierRecommendationSubject({
      recommendation: {
        subjectName: name,
        subjectKey: undefined,
        targetCandidateId: undefined,
      },
      candidates: currentState.candidates,
    });

    if (subjectMatch.exactCandidateId) {
      const routingReason = `Manual signal reused existing record: ${subjectMatch.reason}`;
      const note = routingNote({
        candidateId: subjectMatch.exactCandidateId,
        now,
        text: manualCandidateRoutingNote({
          name,
          reason,
          whyNow: input.whyNow,
          evidenceSummary: input.evidenceSummary,
          knownFacts,
          routingReason,
        }),
        source: "admin_manual",
      });
      return {
        ...currentState,
        candidates: currentState.candidates.map((item) => {
          if (item.id !== subjectMatch.exactCandidateId) return item;
          savedCandidate = mergeCandidateSignal({
            candidate: item,
            now,
            note,
            evidenceSummary: input.evidenceSummary?.trim(),
            knownFacts,
            missingInfo: missingInfoInput,
            publicSafetyNotes: publicSafetyNotesInput,
            doNotSay,
            routingReason,
            identityReviewStatus:
              item.identityReviewStatus === "needs_confirmation"
                ? "needs_confirmation"
                : "not_required",
          });
          return savedCandidate;
        }),
        updatedAt: now,
      };
    }

    const publicDossierMatch = matchingPublicDossierForSubject(name);
    if (publicDossierMatch) {
      const existingUpdate = currentState.candidates.find(
        (item) =>
          item.status === "existing_dossier_update" &&
          item.existingDossierMatch?.id === publicDossierMatch.id,
      );
      const routingReason = `Manual signal matched existing public dossier ${publicDossierMatch.id} / ${publicDossierMatch.name}; routed to Dossier Updates.`;
      if (existingUpdate) {
        const note = routingNote({
          candidateId: existingUpdate.id,
          now,
          text: manualCandidateRoutingNote({
            name,
            reason,
            whyNow: input.whyNow,
            evidenceSummary: input.evidenceSummary,
            knownFacts,
            routingReason,
          }),
          source: "admin_manual",
        });
        return {
          ...currentState,
          candidates: currentState.candidates.map((item) => {
            if (item.id !== existingUpdate.id) return item;
            savedCandidate = mergeCandidateSignal({
              candidate: item,
              now,
              note,
              evidenceSummary: input.evidenceSummary?.trim(),
              knownFacts,
              missingInfo: missingInfoInput,
              publicSafetyNotes: publicSafetyNotesInput,
              doNotSay,
              routingReason,
              identityReviewStatus: "not_required",
            });
            return savedCandidate;
          }),
          updatedAt: now,
        };
      }
      savedCandidate = {
        ...candidate,
        name: publicDossierMatch.name,
        status: "existing_dossier_update",
        existingDossierMatch: publicDossierMatch,
        duplicateRisk: "high",
        routingReason,
        identityReviewStatus: "not_required",
      };
      return {
        ...currentState,
        candidates: [savedCandidate, ...currentState.candidates],
        updatedAt: now,
      };
    }

    if (subjectMatch.possibleCandidateIds.length > 0) {
      const routingReason = subjectMatch.reason;
      const existingReview = currentState.candidates.find((item) =>
        samePossibleMatchReview({
          candidate: item,
          subjectName: name,
          possibleCandidateIds: subjectMatch.possibleCandidateIds,
        }),
      );
      if (existingReview) {
        const note = routingNote({
          candidateId: existingReview.id,
          now,
          text: manualCandidateRoutingNote({
            name,
            reason,
            whyNow: input.whyNow,
            evidenceSummary: input.evidenceSummary,
            knownFacts,
            routingReason,
          }),
          source: "admin_manual",
        });
        return {
          ...currentState,
          candidates: currentState.candidates.map((item) => {
            if (item.id !== existingReview.id) return item;
            savedCandidate = mergeCandidateSignal({
              candidate: item,
              now,
              note,
              evidenceSummary: input.evidenceSummary?.trim(),
              knownFacts,
              missingInfo: missingInfoInput,
              publicSafetyNotes: publicSafetyNotesInput,
              doNotSay,
              possibleMatchCandidateIds: subjectMatch.possibleCandidateIds,
              routingReason,
              identityReviewStatus: "needs_confirmation",
            });
            return savedCandidate;
          }),
          updatedAt: now,
        };
      }
      savedCandidate = {
        ...candidate,
        duplicateRisk:
          riskRank(candidate.duplicateRisk ?? "none") >= riskRank("medium")
            ? candidate.duplicateRisk
            : "medium",
        possibleMatchCandidateIds: subjectMatch.possibleCandidateIds,
        connectedCandidateId: subjectMatch.possibleCandidateIds[0],
        connectedSourceFileCandidateId: subjectMatch.possibleCandidateIds[0],
        identityReviewStatus: "needs_confirmation",
        routingReason,
        missingInfo: uniqueStrings(candidate.missingInfo, [
          `Possible match to existing subject ${subjectMatch.possibleCandidateIds.join(", ")}. Identity needs confirmation before merge or attach.`,
        ]),
      };
      return {
        ...currentState,
        candidates: [savedCandidate, ...currentState.candidates],
        updatedAt: now,
      };
    }

    savedCandidate = candidate;
    return {
      ...currentState,
      candidates: [candidate, ...currentState.candidates],
      updatedAt: now,
    };
  });

  return savedCandidate;
}

export async function promoteCandidateToSourceFile(
  candidateId: string,
): Promise<DossierCandidate | null> {
  const now = new Date().toISOString();
  let updatedCandidate: DossierCandidate | null = null;

  await updateDossierWorkflowState((currentState) => {
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== candidateId) return candidate;
      if (candidate.status === "denied" || candidate.status === "merged") {
        throw new DossierWorkflowInputError(
          "Closed candidates cannot be promoted to active BNL Source Files",
          400,
          "candidate_closed",
        );
      }
      updatedCandidate = {
        ...candidate,
        status: "active_source_file",
        updatedAt: now,
      };
      return updatedCandidate;
    });

    if (!updatedCandidate) return currentState;
    return { ...currentState, candidates, updatedAt: now };
  });

  return updatedCandidate;
}

function publicDossierMatchForId(
  dossierId: string,
  confidence: NonNullable<
    DossierCandidate["existingDossierMatch"]
  >["confidence"] = "high",
): NonNullable<DossierCandidate["existingDossierMatch"]> {
  const entry = databasePage.entries.find((item) => item.id === dossierId);
  if (!entry) {
    throw new DossierWorkflowInputError(
      "Existing public dossier target was not found",
      400,
      "existing_dossier_not_found",
    );
  }
  return { id: entry.id, name: entry.name, confidence };
}

export async function attachCandidateToExistingDossier(input: {
  candidateId: string;
  dossierId: string;
  confidence?: NonNullable<
    DossierCandidate["existingDossierMatch"]
  >["confidence"];
}): Promise<DossierCandidate | null> {
  const now = new Date().toISOString();
  const existingDossierMatch = publicDossierMatchForId(
    input.dossierId,
    input.confidence ?? "high",
  );
  let updatedCandidate: DossierCandidate | null = null;

  await updateDossierWorkflowState((currentState) => {
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== input.candidateId) return candidate;
      if (candidate.status === "denied" || candidate.status === "merged") {
        throw new DossierWorkflowInputError(
          "Closed candidates cannot be attached to an existing public dossier",
          400,
          "candidate_closed",
        );
      }
      updatedCandidate = {
        ...candidate,
        existingDossierMatch,
        duplicateRisk: candidate.duplicateRisk === "high" ? "high" : "medium",
        updatedAt: now,
      };
      return updatedCandidate;
    });

    if (!updatedCandidate) return currentState;
    return { ...currentState, candidates, updatedAt: now };
  });

  return updatedCandidate;
}

export async function markCandidateAsExistingDossierUpdate(input: {
  candidateId: string;
  dossierId?: string;
  confidence?: NonNullable<
    DossierCandidate["existingDossierMatch"]
  >["confidence"];
}): Promise<DossierCandidate | null> {
  const now = new Date().toISOString();
  let updatedCandidate: DossierCandidate | null = null;

  await updateDossierWorkflowState((currentState) => {
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== input.candidateId) return candidate;
      if (candidate.status === "denied" || candidate.status === "merged") {
        throw new DossierWorkflowInputError(
          "Closed candidates cannot be reclassified as existing dossier updates",
          400,
          "candidate_closed",
        );
      }
      const existingDossierMatch = input.dossierId
        ? publicDossierMatchForId(input.dossierId, input.confidence ?? "high")
        : candidate.existingDossierMatch;
      if (!existingDossierMatch) {
        throw new DossierWorkflowInputError(
          "Attach an existing public dossier target before moving this source file to Existing Dossier Updates",
          400,
          "existing_dossier_match_required",
        );
      }
      updatedCandidate = {
        ...candidate,
        existingDossierMatch,
        duplicateRisk: candidate.duplicateRisk === "high" ? "high" : "medium",
        status: "existing_dossier_update",
        updatedAt: now,
      };
      return updatedCandidate;
    });

    if (!updatedCandidate) return currentState;
    return { ...currentState, candidates, updatedAt: now };
  });

  return updatedCandidate;
}

export async function archiveDossierCandidate(
  candidateId: string,
): Promise<DossierCandidate | null> {
  return updateDossierCandidateStatus(candidateId, "archived");
}

export async function restoreDossierCandidate(
  candidateId: string,
): Promise<DossierCandidate | null> {
  return updateDossierCandidateStatus(candidateId, "candidate_intake");
}

export async function permanentlyDeleteDossierCandidate(input: {
  candidateId: string;
  confirmation: string;
}): Promise<{ candidateId: string; deleted: boolean }> {
  if (input.confirmation !== "DELETE SOURCE FILE") {
    throw new DossierWorkflowInputError(
      'Permanent delete requires confirmation text "DELETE SOURCE FILE"',
      400,
      "delete_confirmation_required",
    );
  }
  let deleted = false;
  const now = new Date().toISOString();
  await updateDossierWorkflowState((currentState) => {
    const candidate = currentState.candidates.find(
      (item) => item.id === input.candidateId,
    );
    if (!candidate) return currentState;
    const linkedPublicDraft = currentState.drafts.find(
      (draft) =>
        draft.candidateId === input.candidateId &&
        (draft.status === "published" || draft.status === "owner_approved"),
    );
    if (linkedPublicDraft) {
      throw new DossierWorkflowInputError(
        "Candidates with approved or published drafts cannot be permanently deleted",
        400,
        "candidate_delete_protected",
      );
    }
    deleted = true;
    return {
      ...currentState,
      candidates: currentState.candidates.filter(
        (item) => item.id !== input.candidateId,
      ),
      drafts: currentState.drafts.filter(
        (draft) => draft.candidateId !== input.candidateId,
      ),
      recommendations: currentState.recommendations.map((recommendation) =>
        recommendation.targetCandidateId === input.candidateId
          ? { ...recommendation, targetCandidateId: undefined, updatedAt: now }
          : recommendation,
      ),
      updatedAt: now,
    };
  });
  return { candidateId: input.candidateId, deleted };
}

export async function updateDossierCandidateStatus(
  candidateId: string,
  status: DossierCandidateStatus,
): Promise<DossierCandidate | null> {
  const now = new Date().toISOString();
  let updatedCandidate: DossierCandidate | null = null;

  await updateDossierWorkflowState((currentState) => {
    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id !== candidateId) return candidate;
      updatedCandidate = { ...candidate, status, updatedAt: now };
      return updatedCandidate;
    });

    if (!updatedCandidate) return currentState;

    return {
      ...currentState,
      candidates,
      updatedAt: now,
    };
  });

  return updatedCandidate;
}

function cleanDraftSeedText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = sanitizeDossierPublicCopy(value);
  return clean || undefined;
}

function cleanDraftSeedTags(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => sanitizeDossierPublicCopy(value))
    .filter(Boolean);
}

function cleanDraftSeedPrimaryLink(
  link: DossierWorkflowLink | undefined,
): DossierWorkflowLink | undefined {
  if (!link?.url || link.publicSafe === false) return undefined;
  const label = sanitizeDossierPublicCopy(link.label);
  return {
    ...link,
    label: label || "Featured link",
    publicSafe: true,
  };
}

function uniqueDraftSeedLines(values: Array<string | undefined>, limit = 6): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const value of values) {
    const clean = cleanDraftSeedText(value);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(clean);
    if (lines.length >= limit) break;
  }
  return lines;
}

function assemblePublicSafeDraftFromSourceFile(input: {
  candidate: DossierCandidate;
  recommendations: DossierRecommendation[];
  now: string;
}): Pick<DossierDraft, "fields" | "sourceFileDraftMetadata"> {
  const { candidate, recommendations, now } = input;
  const blueprint = createDossierDraftBlueprint({ candidate, recommendations });
  const publicSafeNotes = (candidate.sourceFileNotes ?? []).filter(
    (note) => note.status === "active" && note.publicSafe === true,
  );
  const publicSafeFacts = uniqueDraftSeedLines([
    ...blueprint.publicSafeFacts.confirmedPublicFacts,
    ...blueprint.publicSafeFacts.publicRoleHints,
  ], 5);
  const readinessNote = `Dossier Blueprint readiness: ${blueprint.readiness.label}. ${blueprint.readiness.recommendedNextAction}`;
  const boundaryLines = uniqueDraftSeedLines([
    readinessNote,
    blueprint.evidenceCounts.reviewOnlyItems > 0
      ? "Admin-only evidence exists and must not be copied into public text."
      : undefined,
    ...blueprint.missingInfoQuestions
      .filter((item) => !/owner-approved public copy|public-safe wording/i.test(item))
      .map((item) => `Needs review before claiming: ${item}`),
  ], 8);
  const dossierIntelligence = uniqueDraftSeedLines([
    candidate.sourceFileSummary?.summaryText,
    candidate.evidenceSummary,
  ], 2).filter((item) => !/starter note|starter evidence/i.test(item));
  const connection = uniqueDraftSeedLines([candidate.reason, candidate.whyNow], 2);
  const publicFactSection = uniqueDraftSeedLines(publicSafeFacts, 5);
  const ownerReviewLines = uniqueDraftSeedLines([
    "Owner Review must approve this Proposed Dossier before any public use.",
    ...blueprint.ownerReviewWarnings.map((item) => item.replace(/Review-only evidence/gi, "Admin-only evidence")),
  ], 8);
  const ownerReviewNotes = [
    dossierIntelligence.length ? `BNL Dossier Intelligence:\n${dossierIntelligence.map((item) => `- ${item}`).join("\n")}` : undefined,
    publicFactSection.length ? `Public-safe facts:\n${publicFactSection.map((item) => `- ${item}`).join("\n")}` : undefined,
    connection.length ? `Connection to BARCODE Network:\n${connection.map((item) => `- ${item}`).join("\n")}` : undefined,
    boundaryLines.length ? `Boundaries / what not to claim:\n${boundaryLines.map((item) => `- ${item}`).join("\n")}` : undefined,
    ownerReviewLines.length ? `Owner-review notes:\n${ownerReviewLines.map((item) => `- ${item}`).join("\n")}` : undefined,
  ].filter(Boolean).join("\n\n");
  const proposedTags = uniqueDraftSeedLines([
    ...blueprint.suggestedTags.proposedTags.map((tag) => tag.tag),
    ...(candidate.proposedTags ?? []),
  ], 12);

  return {
    fields: normalizeDraftFields({
      name: cleanDraftSeedText(candidate.name) ?? candidate.name,
      category: candidate.recommendedCategory ?? blueprint.classification.category,
      kind: candidate.recommendedKind ?? blueprint.classification.kind,
      ecosystemLane: candidate.recommendedEcosystemLane ?? blueprint.classification.ecosystemLane,
      identityAuthority: candidate.recommendedIdentityAuthority ?? blueprint.classification.identityAuthority,
      status: candidate.recommendedStatus ?? "PENDING",
      clearance: candidate.recommendedClearance ?? "PUBLIC",
      origin: candidate.recommendedOrigin ?? "UNVERIFIED",
      role: DOSSIER_PUBLIC_ROLE_PLACEHOLDER,
      summary: dossierIntelligence[0] ?? DOSSIER_PUBLIC_SUMMARY_PLACEHOLDER,
      notes: ownerReviewNotes,
      tags: cleanDraftSeedTags(blueprint.suggestedTags.tags.map((tag) => tag.tag)),
      proposedTags: cleanDraftSeedTags(proposedTags),
      primaryLink: cleanDraftSeedPrimaryLink(candidate.primaryLink),
      files: [],
    }),
    sourceFileDraftMetadata: {
      sourceCandidateId: candidate.id,
      sourceCandidateUpdatedAt: candidate.updatedAt,
      sourceFileNoteIds: publicSafeNotes.map((note) => note.id),
      recommendationIds: recommendations.map((recommendation) => recommendation.id),
      assembledAt: now,
      generatedBy: "manual_placeholder",
      generatedAt: now,
      validationIssues: [],
      validationWarnings: ["Manual placeholder scaffold; BNL did not author this draft."],
      publicSafeDraft: true,
      reviewOnlyEvidence: true,
      autoConfirmedIdentityLinks: false,
      publicPagesMutated: false,
    },
  };
}

export async function createDraftFromCandidate(
  candidateId: string,
): Promise<DossierDraft | null> {
  const now = new Date().toISOString();
  let draft: DossierDraft | null = null;

  await updateDossierWorkflowState((currentState) => {
    const candidate = currentState.candidates.find(
      (item) => item.id === candidateId,
    );
    if (!candidate) return currentState;

    const existingDraft = currentState.drafts.find(
      (item) =>
        item.candidateId === candidateId &&
        item.status !== "denied" &&
        item.status !== "published",
    );
    if (existingDraft) {
      draft = existingDraft;
      return currentState;
    }

    const assembledDraft = assemblePublicSafeDraftFromSourceFile({
      candidate,
      recommendations: currentState.recommendations.filter(
        (recommendation) => recommendation.targetCandidateId === candidate.id,
      ),
      now,
    });

    draft = {
      id: createDraftId(),
      candidateId: candidate.id,
      status: "draft",
      ...assembledDraft,
      createdAt: now,
      updatedAt: now,
    };

    return {
      ...currentState,
      drafts: [draft, ...currentState.drafts],
      updatedAt: now,
    };
  });

  return draft;
}

export async function updateDraftFromSourceFile(
  draftId: string,
): Promise<DossierDraft | null> {
  const now = new Date().toISOString();
  let updatedDraft: DossierDraft | null = null;

  await updateDossierWorkflowState((currentState) => {
    const draft = currentState.drafts.find((item) => item.id === draftId);
    if (!draft || draft.status === "published" || draft.status === "owner_approved") {
      return currentState;
    }
    const candidate = currentState.candidates.find(
      (item) => item.id === draft.candidateId,
    );
    if (!candidate) return currentState;

    const assembledDraft = assemblePublicSafeDraftFromSourceFile({
      candidate,
      recommendations: currentState.recommendations.filter(
        (recommendation) => recommendation.targetCandidateId === candidate.id,
      ),
      now,
    });

    const drafts = currentState.drafts.map((item) => {
      if (item.id !== draftId) return item;
      updatedDraft = {
        ...item,
        ...assembledDraft,
        updatedAt: now,
      };
      return updatedDraft;
    });

    return {
      ...currentState,
      drafts,
      updatedAt: now,
    };
  });

  return updatedDraft;
}

export type RequestBnlDraftFromCandidateResult = {
  result: BnlDossierDraftGeneratorResult;
  draftStored: boolean;
  storedDraft?: DossierDraft;
  existingDraft?: DossierDraft;
};

export async function requestBnlDraftFromCandidate(
  candidateId: string,
  draftId?: string,
): Promise<RequestBnlDraftFromCandidateResult> {
  const now = new Date().toISOString();
  const state = await getDossierWorkflowState();
  const candidate = state.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error("Candidate not found");
  const currentDraft = draftId
    ? state.drafts.find((draft) => draft.id === draftId) ?? null
    : state.drafts.find((draft) => draft.candidateId === candidateId && draft.status !== "published" && draft.status !== "denied") ?? null;
  const recommendations = state.recommendations.filter(
    (recommendation) => recommendation.targetCandidateId === candidate.id,
  );
  const packet = buildBnlDossierDraftRequestPacket({ candidate, recommendations, currentDraft });
  const result = await requestBnlDossierDraft({ packet });
  if (result.status !== "received" || !result.validation.valid) {
    return {
      result,
      draftStored: false,
      ...(currentDraft ? { existingDraft: currentDraft } : {}),
    };
  }

  let savedDraft: DossierDraft | null = null;
  await updateDossierWorkflowState((currentState) => {
    const latestCandidate = currentState.candidates.find((item) => item.id === candidateId) ?? candidate;
    const metadata: DossierDraft["sourceFileDraftMetadata"] = {
      sourceCandidateId: candidate.id,
      sourceCandidateUpdatedAt: latestCandidate.updatedAt,
      sourceFileNoteIds: packet.sourceUsageSummary.sourceFileNoteIds,
      recommendationIds: packet.sourceUsageSummary.recommendationIds,
      assembledAt: now,
      generatedBy: "BNL",
      generatedAt: now,
      publicSafeDraft: true,
      reviewOnlyEvidence: true,
      autoConfirmedIdentityLinks: false,
      publicPagesMutated: false,
      validationIssues: result.validation.issues,
      validationWarnings: result.validation.warnings,
    };
    const fields = normalizeDraftFields({ ...result.response, primaryLink: result.response.primaryLink ?? undefined, files: [] });
    if (currentDraft) {
      const drafts = currentState.drafts.map((draft) => {
        if (draft.id !== currentDraft.id) return draft;
        savedDraft = { ...draft, fields, sourceFileDraftMetadata: metadata, updatedAt: now };
        return savedDraft;
      });
      return { ...currentState, drafts, updatedAt: now };
    }
    savedDraft = { id: createDraftId(), candidateId: candidate.id, status: "draft", fields, sourceFileDraftMetadata: metadata, createdAt: now, updatedAt: now };
    return { ...currentState, drafts: [savedDraft, ...currentState.drafts], updatedAt: now };
  });
  return {
    result,
    draftStored: Boolean(savedDraft),
    ...(savedDraft ? { storedDraft: savedDraft } : {}),
    ...(currentDraft ? { existingDraft: currentDraft } : {}),
  };
}

export async function saveDossierDraft(
  draftId: string,
  fields: DossierDraft["fields"],
): Promise<DossierDraft | null> {
  const now = new Date().toISOString();
  let updatedDraft: DossierDraft | null = null;

  await updateDossierWorkflowState((currentState) => {
    const drafts = currentState.drafts.map((draft) => {
      if (draft.id !== draftId) return draft;
      if (draft.status === "published") {
        updatedDraft = null;
        return draft;
      }
      updatedDraft = {
        ...draft,
        fields: normalizeDraftFields(fields),
        updatedAt: now,
      };
      return updatedDraft;
    });

    if (!updatedDraft) return currentState;

    return {
      ...currentState,
      drafts,
      updatedAt: now,
    };
  });

  return updatedDraft;
}

export async function submitDraftForOwnerReview(
  draftId: string,
): Promise<DossierDraft | null> {
  const now = new Date().toISOString();
  let updatedDraft: DossierDraft | null = null;

  await updateDossierWorkflowState((currentState) => {
    const drafts = currentState.drafts.map((draft) => {
      if (draft.id !== draftId) return draft;
      if (validateDossierDraftFieldsForOwnerReview(draft.fields).length > 0)
        return draft;
      updatedDraft = {
        ...draft,
        status: "ready_for_owner_review",
        updatedAt: now,
      };
      return updatedDraft;
    });

    if (!updatedDraft) return currentState;

    return {
      ...currentState,
      drafts,
      updatedAt: now,
    };
  });

  return updatedDraft;
}

export async function getDossierCandidate(
  candidateId: string,
): Promise<DossierCandidate | null> {
  const currentState = await getDossierWorkflowState();
  return (
    currentState.candidates.find((candidate) => candidate.id === candidateId) ??
    null
  );
}

export function buildDossierDuplicateGroups(
  state: DossierWorkflowState,
): DossierDuplicateGroup[] {
  const draftsByCandidate = new Map<string, DossierDraft[]>();
  for (const draft of state.drafts) {
    const list = draftsByCandidate.get(draft.candidateId) ?? [];
    list.push(draft);
    draftsByCandidate.set(draft.candidateId, list);
  }

  const eligible = state.candidates.filter((candidate) => {
    if (!candidate.name?.trim()) return false;
    if (candidate.status === "merged") return false;
    if (candidate.status === "denied") {
      return (draftsByCandidate.get(candidate.id) ?? []).some(
        (draft) => draft.status !== "denied" && draft.status !== "published",
      );
    }
    return true;
  });

  const candidateIdsByGroupKey = new Map<string, Set<string>>();
  const groupRiskByKey = new Map<string, DossierDuplicateGroup["risk"]>();
  const groupReasonByKey = new Map<string, string>();

  function addPair(
    key: string,
    a: DossierCandidate,
    b: DossierCandidate,
    risk: DossierDuplicateGroup["risk"],
    reason: string,
  ) {
    const ids = candidateIdsByGroupKey.get(key) ?? new Set<string>();
    ids.add(a.id);
    ids.add(b.id);
    candidateIdsByGroupKey.set(key, ids);
    const currentRisk = groupRiskByKey.get(key) ?? "low";
    groupRiskByKey.set(
      key,
      riskRank(risk) > riskRank(currentRisk) ? risk : currentRisk,
    );
    if (!groupReasonByKey.has(key)) groupReasonByKey.set(key, reason);
  }

  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const a = eligible[i];
      const b = eligible[j];
      const normalizedA = normalizeName(a.name);
      const normalizedB = normalizeName(b.name);
      const compactA = compactName(a.name);
      const compactB = compactName(b.name);
      if (!normalizedA || !normalizedB) continue;
      if (normalizedA === normalizedB) {
        addPair(
          normalizedA,
          a,
          b,
          "high",
          "Exact normalized candidate name match inside workflow store.",
        );
        continue;
      }
      if (compactA && compactA === compactB) {
        addPair(
          compactA,
          a,
          b,
          "high",
          "Compact candidate names match after removing punctuation and spaces.",
        );
        continue;
      }
      if (
        normalizedA.length >= 4 &&
        normalizedB.length >= 4 &&
        (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA))
      ) {
        const key = compactA.length <= compactB.length ? compactA : compactB;
        addPair(
          key,
          a,
          b,
          "medium",
          "Candidate names appear to contain or closely overlap each other.",
        );
      }
    }
  }

  return [...candidateIdsByGroupKey.entries()]
    .map(([key, ids]) => {
      const groupCandidates = [...ids]
        .map((id) => eligible.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is DossierCandidate =>
          Boolean(candidate),
        )
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
      const draftIds = groupCandidates
        .flatMap((candidate) => draftsByCandidate.get(candidate.id) ?? [])
        .map((draft) => draft.id)
        .sort();
      const existingPublishedDossierMatch =
        groupCandidates
          .map((candidate) => candidate.existingDossierMatch)
          .filter(
            (
              match,
            ): match is NonNullable<DossierCandidate["existingDossierMatch"]> =>
              Boolean(match),
          )
          .sort(
            (a, b) =>
              confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
              a.id.localeCompare(b.id),
          )[0] ?? null;
      return {
        id: `workflow-duplicate-${key}`,
        normalizedName: key,
        candidateIds: groupCandidates.map((candidate) => candidate.id),
        draftIds,
        names: uniqueStrings(
          groupCandidates.map((candidate) => candidate.name),
        ).sort((a, b) => a.localeCompare(b)),
        risk: groupRiskByKey.get(key) ?? "low",
        reason:
          groupReasonByKey.get(key) ??
          "Possible workflow duplicate candidate names.",
        suggestedMasterCandidateId: groupCandidates[0]?.id,
        existingPublishedDossierMatch,
      } satisfies DossierDuplicateGroup;
    })
    .filter((group) => group.candidateIds.length > 1)
    .sort(
      (a, b) =>
        riskRank(b.risk) - riskRank(a.risk) ||
        a.normalizedName.localeCompare(b.normalizedName),
    )
    .slice(0, 25);
}

function mergeEvidenceItems(
  candidates: DossierCandidate[],
): NonNullable<DossierCandidate["evidenceItems"]> {
  const seen = new Set<string>();
  const output: NonNullable<DossierCandidate["evidenceItems"]> = [];
  for (const item of candidates.flatMap(
    (candidate) => candidate.evidenceItems ?? [],
  )) {
    const key = `${item.id || ""}|${item.summary.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output.slice(0, 20);
}

function strongestTier(
  candidates: DossierCandidate[],
): DossierCandidate["tier"] {
  const order: DossierCandidate["tier"][] = [
    "draft_ready",
    "review_candidate",
    "weak_candidate",
  ];
  return (
    order.find((tier) =>
      candidates.some((candidate) => candidate.tier === tier),
    ) ?? "review_candidate"
  );
}

function buildMasterDraftFields(
  masterCandidate: DossierCandidate,
  primaryDraft: DossierDraft | undefined,
  sourceDrafts: DossierDraft[],
): DossierDraft["fields"] {
  const otherDraftFields = sourceDrafts.map((draft) => draft.fields);
  return normalizeDraftFields({
    name:
      preferredValue(
        primaryDraft?.fields.name,
        masterCandidate.name,
        ...otherDraftFields.map((fields) => fields.name),
      ) ?? masterCandidate.name,
    category: preferredValue(
      primaryDraft?.fields.category,
      masterCandidate.recommendedCategory,
      ...otherDraftFields.map((fields) => fields.category),
    ),
    kind: preferredValue(
      primaryDraft?.fields.kind,
      masterCandidate.recommendedKind,
      ...otherDraftFields.map((fields) => fields.kind),
    ),
    ecosystemLane: preferredValue(
      primaryDraft?.fields.ecosystemLane,
      masterCandidate.recommendedEcosystemLane,
      ...otherDraftFields.map((fields) => fields.ecosystemLane),
    ),
    identityAuthority: preferredValue(
      primaryDraft?.fields.identityAuthority,
      masterCandidate.recommendedIdentityAuthority,
      ...otherDraftFields.map((fields) => fields.identityAuthority),
    ),
    status: preferredValue(
      primaryDraft?.fields.status,
      masterCandidate.recommendedStatus,
      ...otherDraftFields.map((fields) => fields.status),
      "PENDING",
    ),
    clearance: preferredValue(
      primaryDraft?.fields.clearance,
      masterCandidate.recommendedClearance,
      ...otherDraftFields.map((fields) => fields.clearance),
      "PUBLIC",
    ),
    role: preferredValue(
      primaryDraft?.fields.role,
      ...otherDraftFields.map((fields) => fields.role),
    ),
    origin: preferredValue(
      primaryDraft?.fields.origin,
      masterCandidate.recommendedOrigin,
      ...otherDraftFields.map((fields) => fields.origin),
      "UNVERIFIED",
    ),
    summary: preferredValue(
      primaryDraft?.fields.summary,
      masterCandidate.evidenceSummary,
      ...otherDraftFields.map((fields) => fields.summary),
    ),
    notes: combineTextValues(
      [
        primaryDraft?.fields.notes,
        masterCandidate.reason,
        masterCandidate.whyNow,
        ...otherDraftFields.map((fields) => fields.notes),
      ],
      8,
    ),
    tags: uniqueStrings(
      primaryDraft?.fields.tags,
      masterCandidate.recommendedTags,
      ...otherDraftFields.map((fields) => fields.tags),
    ),
    proposedTags: uniqueStrings(
      primaryDraft?.fields.proposedTags,
      masterCandidate.proposedTags,
      ...otherDraftFields.map((fields) => fields.proposedTags),
    ),
    primaryLink: preferredValue(
      primaryDraft?.fields.primaryLink,
      masterCandidate.primaryLink,
      ...otherDraftFields.map((fields) => fields.primaryLink),
    ),
    links: [
      ...(primaryDraft?.fields.links ?? []),
      ...otherDraftFields.flatMap((fields) => fields.links ?? []),
    ],
    files: [],
  });
}

export class DossierMergeError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "DossierMergeError";
    this.status = status;
    this.code = code;
  }
}

export async function mergeDossierCandidates(
  input: MergeDossierCandidatesInput,
): Promise<{
  masterCandidate: DossierCandidate;
  masterDraft?: DossierDraft;
  mergedCandidateIds: string[];
  supersededDraftIds: string[];
} | null> {
  const now = new Date().toISOString();
  const primaryCandidateId = input.primaryCandidateId?.trim();
  const requestedSourceIds = uniqueStrings(input.sourceCandidateIds, [
    primaryCandidateId,
  ]);
  const requestedDraftIds = new Set(uniqueStrings(input.sourceDraftIds));

  if (!primaryCandidateId) {
    throw new DossierMergeError(
      "primaryCandidateId is required",
      400,
      "missing_primary_candidate",
    );
  }
  if (requestedSourceIds.length < 2) {
    throw new DossierMergeError(
      "At least two source candidates are required for merge",
      400,
      "too_few_source_candidates",
    );
  }

  let result: {
    masterCandidate: DossierCandidate;
    masterDraft?: DossierDraft;
    mergedCandidateIds: string[];
    supersededDraftIds: string[];
  } | null = null;

  await updateDossierWorkflowState((currentState) => {
    const candidatesById = new Map(
      currentState.candidates.map((candidate) => [candidate.id, candidate]),
    );
    const primary = candidatesById.get(primaryCandidateId);
    if (!primary)
      throw new DossierMergeError(
        "Primary candidate not found",
        404,
        "primary_candidate_not_found",
      );
    if (primary.status === "denied") {
      throw new DossierMergeError(
        "Cannot merge into a denied primary candidate",
        400,
        "primary_candidate_denied",
      );
    }
    const missingSourceId = requestedSourceIds.find(
      (id) => !candidatesById.has(id),
    );
    if (missingSourceId) {
      throw new DossierMergeError(
        `Source candidate not found: ${missingSourceId}`,
        404,
        "source_candidate_not_found",
      );
    }

    const sources = requestedSourceIds
      .map((id) => candidatesById.get(id))
      .filter((candidate): candidate is DossierCandidate => Boolean(candidate));
    const primaryFirstSources = [
      primary,
      ...sources.filter((candidate) => candidate.id !== primary.id),
    ];
    const nonPrimaryIds = primaryFirstSources
      .filter((candidate) => candidate.id !== primary.id)
      .map((candidate) => candidate.id);
    const evidenceItems = mergeEvidenceItems(primaryFirstSources);
    const highestDuplicateRisk =
      primaryFirstSources
        .map((candidate) => candidate.duplicateRisk ?? "none")
        .sort((a, b) => riskRank(b) - riskRank(a))[0] ?? "none";
    const existingDossierMatch =
      primaryFirstSources
        .map((candidate) => candidate.existingDossierMatch)
        .filter(
          (
            match,
          ): match is NonNullable<DossierCandidate["existingDossierMatch"]> =>
            Boolean(match),
        )
        .sort(
          (a, b) =>
            confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
            a.id.localeCompare(b.id),
        )[0] ?? null;
    const score = Math.min(
      100,
      Math.max(...primaryFirstSources.map((candidate) => candidate.score ?? 0)),
    );
    const masterCandidate: DossierCandidate = {
      ...primary,
      candidateType:
        primary.candidateType !== "unknown"
          ? primary.candidateType
          : (primaryFirstSources.find(
              (candidate) => candidate.candidateType !== "unknown",
            )?.candidateType ?? primary.candidateType),
      source: primary.source ?? "combined",
      tier: strongestTier(primaryFirstSources),
      score,
      reason: combineTextValues(
        primaryFirstSources.map((candidate) => candidate.reason),
        6,
      ),
      whyNow: combineTextValues(
        primaryFirstSources.map((candidate) => candidate.whyNow),
        6,
      ),
      evidenceSummary: combineTextValues(
        primaryFirstSources.map((candidate) => candidate.evidenceSummary),
        6,
      ),
      evidenceItems,
      evidenceCount: evidenceItems.length,
      knownFacts: uniqueStrings(
        ...primaryFirstSources.map((candidate) => candidate.knownFacts),
      ),
      duplicateRisk: highestDuplicateRisk,
      existingDossierMatch,
      recommendedCategory: preferredValue(
        primary.recommendedCategory,
        ...primaryFirstSources
          .slice(1)
          .map((candidate) => candidate.recommendedCategory),
      ),
      recommendedKind: preferredValue(
        primary.recommendedKind,
        ...primaryFirstSources
          .slice(1)
          .map((candidate) => candidate.recommendedKind),
      ),
      recommendedEcosystemLane: preferredValue(
        primary.recommendedEcosystemLane,
        ...primaryFirstSources
          .slice(1)
          .map((candidate) => candidate.recommendedEcosystemLane),
      ),
      recommendedIdentityAuthority: preferredValue(
        primary.recommendedIdentityAuthority,
        ...primaryFirstSources
          .slice(1)
          .map((candidate) => candidate.recommendedIdentityAuthority),
      ),
      recommendedStatus: preferredValue(
        primary.recommendedStatus,
        ...primaryFirstSources
          .slice(1)
          .map((candidate) => candidate.recommendedStatus),
      ),
      recommendedClearance: preferredValue(
        primary.recommendedClearance,
        ...primaryFirstSources
          .slice(1)
          .map((candidate) => candidate.recommendedClearance),
      ),
      recommendedOrigin: preferredValue(
        primary.recommendedOrigin,
        ...primaryFirstSources
          .slice(1)
          .map((candidate) => candidate.recommendedOrigin),
      ),
      recommendedTags: uniqueStrings(
        ...primaryFirstSources.map((candidate) => candidate.recommendedTags),
      ),
      proposedTags: uniqueStrings(
        ...primaryFirstSources.map((candidate) => candidate.proposedTags),
      ),
      primaryLink:
        primary.primaryLink ??
        primaryFirstSources.find(
          (candidate) => candidate.primaryLink?.publicSafe !== false,
        )?.primaryLink,
      missingInfo: uniqueStrings(
        ...primaryFirstSources.map((candidate) => candidate.missingInfo),
      ),
      doNotSay: uniqueStrings(
        ...primaryFirstSources.map((candidate) => candidate.doNotSay),
      ),
      publicSafetyNotes: uniqueStrings(
        ...primaryFirstSources.map((candidate) => candidate.publicSafetyNotes),
      ),
      status:
        primary.status === "draft_ready" || primary.status === "draft_requested"
          ? "draft_ready"
          : "needs_review",
      mergeNote: input.mergeNote?.trim() || undefined,
      mergeSourceCandidateIds: requestedSourceIds,
      updatedAt: now,
    };

    let masterDraft: DossierDraft | undefined;
    const supersededDraftIds: string[] = [];
    let drafts = currentState.drafts;

    if (input.createMasterDraft) {
      const sourceDrafts = currentState.drafts.filter(
        (draft) =>
          requestedSourceIds.includes(draft.candidateId) ||
          requestedDraftIds.has(draft.id),
      );
      const primaryDraft = activeDraftForCandidate(
        currentState.drafts,
        primary.id,
      );
      const nonPrimaryDrafts = sourceDrafts.filter(
        (draft) =>
          draft.id !== primaryDraft?.id &&
          draft.candidateId !== primary.id &&
          draft.status !== "published",
      );
      const sourceDraftIds = uniqueStrings(
        sourceDrafts.map((draft) => draft.id),
      );

      if (primaryDraft) {
        masterDraft = {
          ...primaryDraft,
          status:
            primaryDraft.status === "published" ? "draft" : primaryDraft.status,
          fields: buildMasterDraftFields(
            masterCandidate,
            primaryDraft,
            sourceDrafts.filter((draft) => draft.id !== primaryDraft.id),
          ),
          mergeNote: input.mergeNote?.trim() || undefined,
          mergeSourceDraftIds: sourceDraftIds,
          updatedAt: now,
        };
        drafts = currentState.drafts.map((draft) => {
          if (draft.id === primaryDraft.id) return masterDraft as DossierDraft;
          if (
            nonPrimaryDrafts.some((sourceDraft) => sourceDraft.id === draft.id)
          ) {
            supersededDraftIds.push(draft.id);
            return {
              ...draft,
              status: "superseded" as const,
              mergedIntoDraftId: primaryDraft.id,
              mergedAt: now,
              mergeNote: input.mergeNote?.trim() || undefined,
              mergeSourceDraftIds: sourceDraftIds,
              updatedAt: now,
            };
          }
          return draft;
        });
      } else {
        masterDraft = {
          id: createDraftId(),
          candidateId: primary.id,
          status: "draft",
          fields: buildMasterDraftFields(
            masterCandidate,
            undefined,
            sourceDrafts,
          ),
          mergeNote: input.mergeNote?.trim() || undefined,
          mergeSourceDraftIds: sourceDraftIds,
          createdAt: now,
          updatedAt: now,
        };
        drafts = [
          masterDraft,
          ...currentState.drafts.map((draft) => {
            if (
              nonPrimaryDrafts.some(
                (sourceDraft) => sourceDraft.id === draft.id,
              )
            ) {
              supersededDraftIds.push(draft.id);
              return {
                ...draft,
                status: "superseded" as const,
                mergedIntoDraftId: masterDraft?.id,
                mergedAt: now,
                mergeNote: input.mergeNote?.trim() || undefined,
                mergeSourceDraftIds: sourceDraftIds,
                updatedAt: now,
              };
            }
            return draft;
          }),
        ];
      }
    }

    const candidates = currentState.candidates.map((candidate) => {
      if (candidate.id === primary.id) return masterCandidate;
      if (nonPrimaryIds.includes(candidate.id)) {
        return {
          ...candidate,
          status: "merged" as const,
          mergedIntoCandidateId: primary.id,
          mergedAt: now,
          mergeNote: input.mergeNote?.trim() || undefined,
          mergeSourceCandidateIds: requestedSourceIds,
          updatedAt: now,
        };
      }
      return candidate;
    });

    result = {
      masterCandidate,
      masterDraft,
      mergedCandidateIds: nonPrimaryIds,
      supersededDraftIds,
    };

    return {
      ...currentState,
      candidates,
      drafts,
      updatedAt: now,
    };
  });

  return result;
}


export type SubjectConsolidationRefreshOutcome = {
  candidateId: string;
  subjectName: string;
  status:
    | "BNL refresh queued"
    | "BNL refresh needed"
    | "BNL refresh unavailable";
  requestId?: string;
  reason?: string;
};

export type SubjectConsolidationIssue = {
  groupId?: string;
  subject: string;
  reason: string;
};

export type SubjectConsolidationResult = {
  statusLabel: "Subject Consolidation Complete";
  attachedRecommendations: number;
  emptyDuplicatesCleaned: number;
  duplicateRecommendationsCleaned: number;
  dossierUpdateWorkspacesCreated: number;
  bundledPublicDossierUpdateSignals: number;
  diagnosticArtifactsArchived: number;
  sourceFilesCreated: number;
  sourceFileDuplicatesMerged: number;
  bnlRefreshes: SubjectConsolidationRefreshOutcome[];
  needsReview: number;
  blocked: number;
  skippedItems: SubjectConsolidationIssue[];
  blockedItems: SubjectConsolidationIssue[];
  affectedTargets: Array<{ candidateId: string; name: string; href: string }>;
  publicPagesPublished: 0;
  publicDossierTextChanged: 0;
  internalAliasesExposed: 0;
};

function recommendationHasMeaningfulInfo(
  recommendation: DossierRecommendation,
): boolean {
  return Boolean(
    recommendation.reason?.trim() ||
      recommendation.evidenceSummary?.trim() ||
      (recommendation.knownContext ?? []).length ||
      (recommendation.usefulEvidence ?? []).length ||
      (recommendation.sourceTypes ?? []).length,
  );
}

function candidateHasMeaningfulConsolidationInfo(
  candidate: DossierCandidate,
): boolean {
  return Boolean(
    candidate.reason?.trim() ||
      candidate.whyNow?.trim() ||
      candidate.evidenceSummary?.trim() ||
      (candidate.sourceFileNotes ?? []).some((note) => note.status === "active") ||
      (candidate.identityLinks ?? []).length ||
      (candidate.sourceFileArchiveIds ?? []).length ||
      candidate.latestSourceFileArchiveId ||
      candidate.latestSourceFileArchiveUpdatedAt ||
      candidate.latestSourceFileArchive ||
      candidate.existingDossierMatch,
  );
}

function refreshOutcomeForState(input: {
  state: DossierWorkflowState;
  candidate: DossierCandidate;
  now: string;
  reason: string;
}): { state: DossierWorkflowState; outcome: SubjectConsolidationRefreshOutcome } {
  if (!isSourceFileEnrichmentAttachableCandidate(input.candidate)) {
    return {
      state: input.state,
      outcome: {
        candidateId: input.candidate.id,
        subjectName: input.candidate.name,
        status: "BNL refresh unavailable",
        reason: "Target is not a refreshable Source File lane.",
      },
    };
  }
  const upserted = upsertSourceFileRefreshRequestInState({
    state: input.state,
    candidate: input.candidate,
    reason: input.reason,
    requestSource: "source_notes_newer_than_bnl",
    priority: 92,
    requestedBy: "subject_consolidation",
    now: input.now,
    force: true,
  });
  return {
    state: upserted.state,
    outcome: {
      candidateId: input.candidate.id,
      subjectName: input.candidate.name,
      status: upserted.created ? "BNL refresh queued" : "BNL refresh needed",
      requestId: upserted.request.id,
      reason: input.reason,
    },
  };
}

export async function runSubjectConsolidation(input: { groupId?: string } = {}): Promise<SubjectConsolidationResult> {
  const now = new Date().toISOString();
  const result: SubjectConsolidationResult = {
    statusLabel: "Subject Consolidation Complete",
    attachedRecommendations: 0,
    emptyDuplicatesCleaned: 0,
    duplicateRecommendationsCleaned: 0,
    dossierUpdateWorkspacesCreated: 0,
    bundledPublicDossierUpdateSignals: 0,
    diagnosticArtifactsArchived: 0,
    sourceFilesCreated: 0,
    sourceFileDuplicatesMerged: 0,
    bnlRefreshes: [],
    needsReview: 0,
    blocked: 0,
    skippedItems: [],
    blockedItems: [],
    affectedTargets: [],
    publicPagesPublished: 0,
    publicDossierTextChanged: 0,
    internalAliasesExposed: 0,
  };
  const affectedTargetIds = new Set<string>();

  await updateDossierWorkflowState((currentState) => {
    const audit = createDossierPopulationAudit({
      candidates: currentState.candidates,
      recommendations: currentState.recommendations,
      publicDossiers: databasePage.entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
      })),
      drafts: currentState.drafts,
    });
    let state: DossierWorkflowState = currentState;
    const consumedRecommendations = new Set<string>();
    const consumedCandidates = new Set<string>();

    function rememberTarget(candidate: DossierCandidate) {
      affectedTargetIds.add(candidate.id);
    }

    function bundleExactPublicDossierUpdateSignals() {
      const byPublicDossier = new Map<string, DossierRecommendation[]>();
      for (const recommendation of state.recommendations) {
        if (recommendation.status !== "new" && recommendation.status !== "reviewing") continue;
        if (isDiagnosticTestArtifactRecommendation(recommendation)) continue;
        if (!recommendation.targetDossierId) continue;
        if (recommendation.type !== "modify_existing_dossier") continue;
        const entry = databasePage.entries.find((item) => item.id === recommendation.targetDossierId);
        if (!entry) continue;
        const current = byPublicDossier.get(entry.id) ?? [];
        current.push(recommendation);
        byPublicDossier.set(entry.id, current);
      }

      for (const [publicDossierId, recommendations] of byPublicDossier) {
        if (recommendations.length === 0) continue;
        const entry = databasePage.entries.find((item) => item.id === publicDossierId);
        if (!entry) continue;
        let workspace = state.candidates.find(
          (candidate) =>
            candidate.status === "existing_dossier_update" &&
            candidate.existingDossierMatch?.id === entry.id &&
            !isDiagnosticTestArtifactCandidate(candidate),
        );
        if (!workspace) {
          const candidateId = createCandidateId();
          workspace = {
            id: candidateId,
            name: entry.name,
            candidateType: candidateTypeFromPublicDossierEntry(entry),
            source: "website_read_model",
            tier: "review_candidate",
            score: 58,
            whyNow: `Bundled ${recommendations.length} ${entry.name} update signals into ${entry.name} Dossier Update workspace.`,
            reason: "Internal Dossier Update workspace created for review-only consolidation.",
            firstSeenAt: now,
            lastSeenAt: now,
            evidenceSummary: `Existing public dossier ${entry.id} / ${entry.name} matched exact public dossier update signals.`,
            evidenceItems: [],
            evidenceCount: 0,
            knownFacts: [`Existing public dossier target: ${entry.id} / ${entry.name}.`],
            confidence: "high",
            duplicateRisk: "high",
            existingDossierMatch: { id: entry.id, name: entry.name, confidence: "high" },
            recommendedCategory: entry.category,
            recommendedKind: entry.kind,
            recommendedEcosystemLane: entry.ecosystemLane,
            recommendedIdentityAuthority: entry.identityAuthority,
            recommendedStatus: entry.status,
            recommendedClearance: entry.clearance,
            recommendedOrigin: entry.origin,
            recommendedTags: entry.tags,
            proposedTags: [],
            missingInfo: ["Review update notes before applying anything to public content."],
            doNotSay: ["Do not publish update material automatically."],
            publicSafetyNotes: ["Internal update lane only; no public dossier text changed."],
            sourceFileNotes: [],
            identityLinks: [],
            sourceLanes: [],
            status: "existing_dossier_update",
            sourceRecommendationIds: [],
            connectedRecommendationIds: [],
            mergeNote: "bundled_into_dossier_update",
            createdAt: now,
            updatedAt: now,
          };
          state = { ...state, candidates: [workspace, ...state.candidates], updatedAt: now };
          result.dossierUpdateWorkspacesCreated += 1;
        }

        const variantCandidates = state.candidates.filter((candidate) => {
          if (candidate.id === workspace.id) return false;
          if (candidate.status === "archived" || candidate.status === "denied" || candidate.status === "merged") return false;
          if (isDiagnosticTestArtifactCandidate(candidate)) return false;
          const sharesPublicDossier = candidate.existingDossierMatch?.id === entry.id;
          const normalizedName = normalizeDossierSubjectName(candidate.name);
          const possessiveName = normalizeDossierPossessiveVariantName(candidate.name);
          const canonicalName = normalizeDossierPossessiveVariantName(entry.name);
          const isPossessiveVariant = Boolean(
            normalizedName &&
              possessiveName &&
              normalizedName !== possessiveName &&
              possessiveName === canonicalName,
          );
          return sharesPublicDossier || isPossessiveVariant;
        });
        const variantNotes = variantCandidates.flatMap((candidate) =>
          (candidate.sourceFileNotes ?? []).map((note) => ({
            ...note,
            candidateId: workspace.id,
            updatedAt: now,
          })),
        );
        const variantRecommendationIds = variantCandidates.flatMap((candidate) => [
          ...(candidate.sourceRecommendationIds ?? []),
          ...(candidate.connectedRecommendationIds ?? []),
        ]);

        const notes = recommendations.map((recommendation) =>
          routingNote({
            candidateId: workspace.id,
            now,
            text: recommendation.ingestSource?.startsWith("bnl")
              ? bnlAutoCandidateNoteText(recommendation)
              : recommendationSourceNoteText(recommendation),
            source: "bnl_recommendation",
            createdBy: recommendation.createdBy,
            ingestKey: recommendation.ingestKey,
            ingestedAt: recommendation.ingestedAt,
            ingestSource: recommendation.ingestSource,
          }),
        );
        const updatedWorkspace: DossierCandidate = {
          ...workspace,
          whyNow: `Bundled ${recommendations.length} ${entry.name} update signals into ${entry.name} Dossier Update workspace.`,
          sourceFileNotes: [...(workspace.sourceFileNotes ?? []), ...variantNotes, ...notes],
          sourceRecommendationIds: uniqueStrings(workspace.sourceRecommendationIds, variantRecommendationIds, recommendations.map((item) => item.id)),
          connectedRecommendationIds: uniqueStrings(workspace.connectedRecommendationIds, variantRecommendationIds, recommendations.map((item) => item.id)),
          sourceLanes: uniqueStrings(workspace.sourceLanes, ...recommendations.map((item) => item.sourceLanes)) as DossierRecommendationSourceLane[],
          routingReason: `Bundled ${recommendations.length} exact public dossier update signal${recommendations.length === 1 ? "" : "s"}.`,
          mergeNote: "bundled_into_dossier_update",
          updatedAt: now,
        };
        state = {
          ...state,
          candidates: state.candidates.map((candidate) => {
            if (candidate.id === updatedWorkspace.id) return updatedWorkspace;
            const variant = variantCandidates.find((item) => item.id === candidate.id);
            if (variant) {
              return {
                ...candidate,
                status: "merged",
                mergedIntoCandidateId: updatedWorkspace.id,
                mergedAt: now,
                mergeNote: `variant_of_canonical:${entry.id}`,
                routingReason: `Resolved variant '${candidate.name}' into canonical subject '${entry.name}'.`,
                updatedAt: now,
              };
            }
            return candidate;
          }),
          recommendations: state.recommendations.map((item) =>
            recommendations.some((recommendation) => recommendation.id === item.id)
              ? { ...item, status: "attached_to_existing_dossier_update", targetCandidateId: updatedWorkspace.id, connectedCandidateId: updatedWorkspace.id, connectedSourceFileCandidateId: updatedWorkspace.id, routingReason: `Bundled into ${entry.name} Dossier Update workspace by Subject Consolidation.`, updatedAt: now }
              : item,
          ),
          updatedAt: now,
        };
        recommendations.forEach((item) => consumedRecommendations.add(item.id));
        result.bundledPublicDossierUpdateSignals += recommendations.length;
        result.sourceFileDuplicatesMerged += variantCandidates.length;
        result.skippedItems.push({ subject: entry.name, reason: `Bundled ${recommendations.length} ${entry.name} update signals into ${entry.name} Dossier Update workspace.` });
        for (const variant of variantCandidates) {
          result.skippedItems.push({ subject: variant.name, reason: `Resolved variant '${variant.name}' into canonical subject '${entry.name}'.` });
        }
        const refresh = refreshOutcomeForState({ state, candidate: updatedWorkspace, now, reason: "Subject Consolidation bundled exact public dossier update signals." });
        state = refresh.state;
        result.bnlRefreshes.push(refresh.outcome);
        rememberTarget(updatedWorkspace);
      }
    }

    function archiveDiagnosticArtifacts() {
      const diagnosticCandidateIds = new Set(
        state.candidates
          .filter((candidate) => candidate.status !== "archived" && candidate.status !== "denied" && candidate.status !== "merged" && isDiagnosticTestArtifactCandidate(candidate))
          .map((candidate) => candidate.id),
      );
      const diagnosticRecommendationIds = new Set(
        state.recommendations
          .filter((recommendation) =>
            (recommendation.status === "new" || recommendation.status === "reviewing") &&
            isDiagnosticTestArtifactRecommendation(recommendation),
          )
          .map((recommendation) => recommendation.id),
      );
      if (diagnosticCandidateIds.size === 0 && diagnosticRecommendationIds.size === 0) return;
      state = {
        ...state,
        candidates: state.candidates.map((candidate) =>
          diagnosticCandidateIds.has(candidate.id)
            ? { ...candidate, status: "archived", routingReason: "Subject Consolidation archived diagnostic_test_artifact smoke-test record.", mergeNote: "diagnostic_test_artifact", updatedAt: now }
            : candidate,
        ),
        recommendations: state.recommendations.map((recommendation) =>
          diagnosticRecommendationIds.has(recommendation.id)
            ? { ...recommendation, status: "archived", routingReason: "Subject Consolidation archived diagnostic_test_artifact smoke-test signal.", updatedAt: now }
            : recommendation,
        ),
        updatedAt: now,
      };
      result.diagnosticArtifactsArchived += diagnosticCandidateIds.size + diagnosticRecommendationIds.size;
    }

    if (!input.groupId) {
      bundleExactPublicDossierUpdateSignals();
      archiveDiagnosticArtifacts();
    }

    function attachRecommendationRecord(
      recommendation: DossierRecommendation,
      target: DossierCandidate,
      status: DossierRecommendationStatus = attachmentStatusForCandidate(target),
    ) {
      if (consumedRecommendations.has(recommendation.id)) return;
      if (recommendation.status !== "new" && recommendation.status !== "reviewing") return;
      const note = routingNote({
        candidateId: target.id,
        now,
        text: recommendation.ingestSource?.startsWith("bnl")
          ? bnlAutoCandidateNoteText(recommendation)
          : recommendationSourceNoteText(recommendation),
        source: "bnl_recommendation",
        createdBy: recommendation.createdBy,
        ingestKey: recommendation.ingestKey,
        ingestedAt: recommendation.ingestedAt,
        ingestSource: recommendation.ingestSource,
      });
      const routingReason = "Subject Consolidation attached safe exact same-subject information.";
      const updatedRecommendation: DossierRecommendation = {
        ...recommendation,
        status,
        targetCandidateId: target.id,
        connectedCandidateId: target.id,
        connectedSourceFileCandidateId: target.id,
        identityReviewStatus: "not_required",
        routingReason,
        updatedAt: now,
      };
      const updatedCandidate = mergeCandidateSignal({
        candidate: target,
        now,
        note,
        evidenceSummary: recommendation.evidenceSummary,
        connectedRecommendationId: recommendation.id,
        routingReason,
        identityReviewStatus: "not_required",
      });
      state = {
        ...state,
        recommendations: state.recommendations.map((item) =>
          item.id === recommendation.id ? updatedRecommendation : item,
        ),
        candidates: state.candidates.map((item) =>
          item.id === target.id ? updatedCandidate : item,
        ),
        updatedAt: now,
      };
      const refresh = refreshOutcomeForState({
        state,
        candidate: updatedCandidate,
        now,
        reason: "Subject Consolidation added source information.",
      });
      state = refresh.state;
      result.bnlRefreshes.push(refresh.outcome);
      result.attachedRecommendations += 1;
      consumedRecommendations.add(recommendation.id);
      rememberTarget(updatedCandidate);
    }

    for (const group of audit.possibleDuplicateGroups) {
      if (input.groupId && group.id !== input.groupId) continue;
      const plan = group.consolidationPlan;
      if (plan.automationTier === "Blocked") {
        result.blocked += 1;
        result.blockedItems.push({
          groupId: group.id,
          subject: plan.targetDisplayName ?? group.records.map((record) => record.displayName ?? record.name).join(" / "),
          reason: plan.blockedReasons.join(" ") || group.reason,
        });
        continue;
      }
      if (plan.requiresReview || plan.automationTier === "Select Target Manually") {
        if (input.groupId) {
          result.blocked += 1;
          result.blockedItems.push({
            groupId: group.id,
            subject: plan.targetDisplayName ?? group.records.map((record) => record.displayName ?? record.name).join(" / "),
            reason: plan.recommendedNextStep || plan.reason,
          });
        } else {
          result.needsReview += 1;
          result.skippedItems.push({
            groupId: group.id,
            subject: plan.targetDisplayName ?? group.records.map((record) => record.displayName ?? record.name).join(" / "),
            reason: plan.recommendedNextStep || plan.reason,
          });
        }
        continue;
      }
      const target = plan.targetRecord?.candidateId
        ? state.candidates.find((candidate) => candidate.id === plan.targetRecord?.candidateId)
        : undefined;
      const sourceRecommendations = plan.sourceRecords
        .filter((record) => record.type === "recommendation" && record.recommendationId)
        .map((record) => state.recommendations.find((item) => item.id === record.recommendationId))
        .filter((item): item is DossierRecommendation => Boolean(item))
        .filter((item) =>
          (item.status === "new" || item.status === "reviewing") &&
          !consumedRecommendations.has(item.id),
        );

      if (plan.automationTier === "Attach to Existing Source File candidate" && target) {
        for (const recommendation of sourceRecommendations) {
          if (recommendationHasMeaningfulInfo(recommendation)) {
            attachRecommendationRecord(recommendation, target);
          } else if (!consumedRecommendations.has(recommendation.id)) {
            state = {
              ...state,
              recommendations: state.recommendations.map((item) =>
                item.id === recommendation.id ? { ...item, status: "archived", routingReason: "Subject Consolidation cleaned exact duplicate with no new information.", updatedAt: now } : item,
              ),
              updatedAt: now,
            };
            consumedRecommendations.add(recommendation.id);
            result.duplicateRecommendationsCleaned += 1;
          }
        }
        continue;
      }

      if (plan.automationTier === "Empty duplicate cleanup candidate") {
        for (const record of plan.sourceRecords.filter((item) => item.candidateId)) {
          const candidate = state.candidates.find((item) => item.id === record.candidateId);
          if (!candidate || consumedCandidates.has(candidate.id)) continue;
          if (candidateHasMeaningfulConsolidationInfo(candidate)) {
            result.needsReview += 1;
            result.skippedItems.push({
              groupId: group.id,
              subject: candidate.name,
              reason: "Candidate has meaningful information and cannot be cleaned automatically.",
            });
            continue;
          }
          state = {
            ...state,
            candidates: state.candidates.map((item) =>
              item.id === candidate.id
                ? { ...item, status: "archived", mergeNote: "Subject Consolidation retired an empty duplicate record.", updatedAt: now }
                : item,
            ),
            updatedAt: now,
          };
          consumedCandidates.add(candidate.id);
          result.emptyDuplicatesCleaned += 1;
        }
        continue;
      }

      if (plan.automationTier === "Source File merge candidate" && target) {
        const sources = plan.sourceRecords
          .filter((record) => record.candidateId)
          .map((record) => state.candidates.find((candidate) => candidate.id === record.candidateId))
          .filter((candidate): candidate is DossierCandidate => Boolean(candidate));
        if (sources.some((source) => source.existingDossierMatch?.id && target.existingDossierMatch?.id && source.existingDossierMatch.id !== target.existingDossierMatch.id)) {
          result.blocked += 1;
          result.blockedItems.push({
            groupId: group.id,
            subject: target.name,
            reason: "Different public dossier matches are present.",
          });
          continue;
        }
        const sourceNotes = sources.flatMap((source) => source.sourceFileNotes ?? []);
        const aliases = sources.flatMap((source) => source.identityLinks ?? []);
        const recommendationIds = sources.flatMap((source) => source.connectedRecommendationIds ?? []);
        const updatedTarget: DossierCandidate = {
          ...target,
          sourceFileNotes: [...(target.sourceFileNotes ?? []), ...sourceNotes.map((note) => ({ ...note, candidateId: target.id, updatedAt: now }))],
          identityLinks: [...(target.identityLinks ?? []), ...aliases.map((link) => ({ ...link, candidateId: target.id, visibility: "internal_only" as const, useInPublicDossier: false, updatedAt: now }))],
          connectedRecommendationIds: uniqueStrings(target.connectedRecommendationIds, recommendationIds),
          mergeSourceCandidateIds: uniqueStrings(target.mergeSourceCandidateIds, sources.map((source) => source.id)),
          mergeNote: "Subject Consolidation merged a safe exact duplicate into this kept Source File.",
          updatedAt: now,
        };
        state = {
          ...state,
          candidates: state.candidates.map((candidate) => {
            if (candidate.id === target.id) return updatedTarget;
            if (sources.some((source) => source.id === candidate.id)) {
              return { ...candidate, status: "merged", mergedIntoCandidateId: target.id, mergedAt: now, mergeNote: "Subject Consolidation merged into kept Source File.", updatedAt: now };
            }
            return candidate;
          }),
          updatedAt: now,
        };
        const refresh = refreshOutcomeForState({ state, candidate: updatedTarget, now, reason: "Subject Consolidation merged duplicate Source File information." });
        state = refresh.state;
        result.bnlRefreshes.push(refresh.outcome);
        result.sourceFileDuplicatesMerged += sources.length;
        rememberTarget(updatedTarget);
        continue;
      }

      if (plan.automationTier === "Create Source File candidate" && sourceRecommendations.length > 0) {
        const first = sourceRecommendations[0];
        const candidate = buildCandidateFromRecommendation({
          recommendation: first,
          now,
          source: first.ingestSource === "bnl_dynamic_candidate_discovery" || first.ingestSource === "bnl_source_knowledge_bridge" ? bnlIngestCandidateSource(first) : "manual",
          noteText: first.ingestSource?.startsWith("bnl") ? bnlAutoCandidateNoteText(first) : recommendationSourceNoteText(first),
        });
        const sourceFile: DossierCandidate = { ...candidate, status: "active_source_file", connectedRecommendationIds: sourceRecommendations.map((item) => item.id), sourceRecommendationIds: sourceRecommendations.map((item) => item.id) };
        state = {
          ...state,
          candidates: [sourceFile, ...state.candidates],
          recommendations: state.recommendations.map((item) =>
            sourceRecommendations.some((recommendation) => recommendation.id === item.id)
              ? { ...item, status: "converted_to_source_file", targetCandidateId: sourceFile.id, connectedCandidateId: sourceFile.id, connectedSourceFileCandidateId: sourceFile.id, routingReason: "Subject Consolidation created a Source File from coherent same-subject signals.", updatedAt: now }
              : item,
          ),
          updatedAt: now,
        };
        sourceRecommendations.forEach((item) => consumedRecommendations.add(item.id));
        const refresh = refreshOutcomeForState({ state, candidate: sourceFile, now, reason: "Subject Consolidation created this Source File from matched signals." });
        state = refresh.state;
        result.bnlRefreshes.push(refresh.outcome);
        result.sourceFilesCreated += 1;
        rememberTarget(sourceFile);
        continue;
      }

      if (plan.automationTier === "Create Dossier Update workspace candidate" && plan.existingPublicDossier && sourceRecommendations.length > 0) {
        const entry = databasePage.entries.find((item) => item.id === plan.existingPublicDossier?.id);
        if (!entry) {
          result.blocked += 1;
          result.blockedItems.push({
            groupId: group.id,
            subject: plan.existingPublicDossier.id,
            reason: "Existing public dossier target was not found.",
          });
          continue;
        }
        const candidateId = createCandidateId();
        const candidate: DossierCandidate = {
          id: candidateId,
          name: entry.name,
          candidateType: candidateTypeFromPublicDossierEntry(entry),
          source: "website_read_model",
          tier: "review_candidate",
          score: 58,
          whyNow: "Subject Consolidation found exact public dossier update signals.",
          reason: "Internal Dossier Update workspace created for review-only consolidation.",
          firstSeenAt: now,
          lastSeenAt: now,
          evidenceSummary: `Existing public dossier ${entry.id} / ${entry.name} matched consolidated source signals.`,
          evidenceItems: [],
          evidenceCount: 0,
          knownFacts: [`Existing public dossier target: ${entry.id} / ${entry.name}.`],
          confidence: "medium",
          duplicateRisk: "high",
          existingDossierMatch: { id: entry.id, name: entry.name, confidence: "high" },
          recommendedCategory: entry.category,
          recommendedKind: entry.kind,
          recommendedEcosystemLane: entry.ecosystemLane,
          recommendedIdentityAuthority: entry.identityAuthority,
          recommendedStatus: entry.status,
          recommendedClearance: entry.clearance,
          recommendedOrigin: entry.origin,
          recommendedTags: entry.tags,
          proposedTags: [],
          missingInfo: ["Review update notes before applying anything to public content."],
          doNotSay: ["Do not publish update material automatically."],
          publicSafetyNotes: ["Internal update lane only; no public dossier text changed."],
          sourceFileNotes: sourceRecommendations.map((recommendation) => routingNote({ candidateId: "", now, text: recommendation.ingestSource?.startsWith("bnl") ? bnlAutoCandidateNoteText(recommendation) : recommendationSourceNoteText(recommendation), source: "bnl_recommendation", createdBy: recommendation.createdBy, ingestKey: recommendation.ingestKey, ingestedAt: recommendation.ingestedAt, ingestSource: recommendation.ingestSource })).map((note) => ({ ...note, candidateId })),
          identityLinks: [],
          sourceLanes: uniqueStrings(...sourceRecommendations.map((recommendation) => recommendation.sourceLanes)) as DossierRecommendationSourceLane[],
          status: "existing_dossier_update",
          sourceRecommendationIds: sourceRecommendations.map((item) => item.id),
          connectedRecommendationIds: sourceRecommendations.map((item) => item.id),
          createdAt: now,
          updatedAt: now,
        };
        state = {
          ...state,
          candidates: [candidate, ...state.candidates],
          recommendations: state.recommendations.map((item) =>
            sourceRecommendations.some((recommendation) => recommendation.id === item.id)
              ? { ...item, status: "attached_to_existing_dossier_update", targetCandidateId: candidate.id, connectedCandidateId: candidate.id, connectedSourceFileCandidateId: candidate.id, routingReason: "Subject Consolidation created a Dossier Update workspace for exact public dossier signals.", updatedAt: now }
              : item,
          ),
          updatedAt: now,
        };
        sourceRecommendations.forEach((item) => consumedRecommendations.add(item.id));
        const refresh = refreshOutcomeForState({ state, candidate, now, reason: "Subject Consolidation created this Dossier Update workspace." });
        state = refresh.state;
        result.bnlRefreshes.push(refresh.outcome);
        result.dossierUpdateWorkspacesCreated += 1;
        rememberTarget(candidate);
      }
    }

    result.affectedTargets = state.candidates
      .filter((candidate) => affectedTargetIds.has(candidate.id))
      .map((candidate) => ({
        candidateId: candidate.id,
        name: candidate.existingDossierMatch?.name ?? candidate.name,
        href: `/admin/dossiers/candidates/${candidate.id}`,
      }));
    return state;
  });

  return result;
}

export function getDossierWorkflowStorageMode(): "redis" | "memory_fallback" {
  return getRedis() ? "redis" : "memory_fallback";
}
