import { Redis } from "@upstash/redis";
import { databasePage, type DatabaseEntry } from "@/content";
import { validateDossierPublicDraftFields } from "@/lib/dossier-public-copy-guard";
import {
  scoreManualDossierCandidate,
  type CreateDossierRecommendationInput,
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
  type DossierRecommendationSourceLane,
  type DossierRecommendationStatus,
  type DossierRecommendationType,
  type DossierSourceFileNote,
  type DossierSourceFileNoteSource,
  type DossierSourceFileNoteType,
  type DossierDuplicateRisk,
  type DossierWorkflowLink,
  isActiveSourceFileCandidate,
  matchDossierRecommendationSubject,
  type MergeDossierCandidatesInput,
} from "@/lib/dossier-workflow";

export type DossierWorkflowState = {
  version: 1;
  revision: number;
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  recommendations: DossierRecommendation[];
  updatedAt: string;
};

export const DOSSIER_WORKFLOW_STORAGE_KEY = "barcode:dossier-workflow:v1";
export const DOSSIER_WORKFLOW_LOCK_KEY = "barcode:dossier-workflow:v1:lock";

const MAX_UPDATE_ATTEMPTS = 5;
const LOCK_TTL_SECONDS = 5;
const LOCK_RETRY_DELAY_MS = 25;

let memoryState: DossierWorkflowState = emptyWorkflowState();
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
  if (!normalized.role) missing.push("role");
  if (!normalized.summary) missing.push("summary");
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
        }))
      : [],
    drafts: Array.isArray(candidateState.drafts) ? candidateState.drafts : [],
    recommendations: Array.isArray(candidateState.recommendations)
      ? candidateState.recommendations
      : [],
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

function createSourceFileNoteId(): string {
  return `source_file_note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function normalizeRecommendationInput(
  input: CreateDossierRecommendationInput,
): Omit<
  DossierRecommendation,
  "id" | "createdAt" | "updatedAt" | "status"
> | null {
  const subjectName = boundedText(input.subjectName, 200);
  const reason = boundedText(input.reason);
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
      input.ingestSource === "system" ||
      input.ingestSource === "unknown"
        ? input.ingestSource
        : undefined,
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
  if (recommendation.recommendedKind === "artist") return "artist";
  if (recommendation.recommendedKind === "community_member") {
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
    .slice(0, 2000);
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
      recommendation.suggestedAction ??
      (source === "bnl_dynamic_candidate_discovery"
        ? "BNL dynamic candidate discovery."
        : source === "bnl_source_knowledge_bridge"
          ? "BNL Source Knowledge Bridge."
          : "Recommendation inbox conversion."),
    reason: recommendation.reason,
    firstSeenAt: recommendation.ingestedAt ?? now,
    lastSeenAt: now,
    evidenceSummary: recommendation.evidenceSummary ?? recommendation.reason,
    evidenceItems: recommendation.evidenceSummary
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
    evidenceCount: recommendation.evidenceSummary ? 1 : 0,
    knownFacts: [],
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
    doNotSay: recommendation.doNotSay ?? [],
    publicSafetyNotes: uniqueStrings(
      recommendation.publicSafetyNotes,
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

    const existing = recommendation.ingestKey
      ? currentState.recommendations.find(
          (item) => item.ingestKey === recommendation.ingestKey,
        )
      : currentState.recommendations.find(
          (item) =>
            isActiveRecommendation(item) &&
            fallbackRecommendationDedupeKey(item) ===
              fallbackRecommendationDedupeKey(recommendation),
        );

    if (existing) {
      savedRecommendation = existing;
      duplicate = true;
      return currentState;
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
        if (
          targetCandidate.status !== "active_source_file" &&
          targetCandidate.status !== "candidate_intake" &&
          targetCandidate.status !== "existing_dossier_update"
        ) {
          throw new DossierWorkflowInputError(
            "BNL Source File Enrichment target is not an attachable workflow lane",
            400,
            "enrichment_target_not_attachable",
          );
        }
        const targetStatusNote =
          targetCandidate.status === "active_source_file"
            ? "attached to an Active BNL Source File for review only; no public dossier was changed."
            : targetCandidate.status === "candidate_intake"
              ? "attached to Candidate Intake as enrichment, not active case-file fact; no promotion occurred."
              : targetCandidate.status === "existing_dossier_update"
                ? "attached as Existing Dossier Update enrichment; public dossier content was not edited."
                : "attached to the targeted workflow record for review only; no public content changed.";
        const updatedStatus: DossierRecommendationStatus =
          targetCandidate.status === "candidate_intake"
            ? "attached_to_candidate_intake"
            : targetCandidate.status === "existing_dossier_update"
              ? "attached_to_existing_dossier_update"
              : "attached_to_source_file";
        const note: DossierSourceFileNote = {
          id: createSourceFileNoteId(),
          candidateId: targetCandidate.id,
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
          status: "attached_to_source_file",
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
          status: "attached_to_source_file",
          targetCandidateId: match.exactCandidateId,
          publicSafetyNotes: [
            ...(recommendation.publicSafetyNotes ?? []),
            `${bnlIngestLabel(recommendation)} matched an existing exact same-subject source file and was attached without creating a duplicate candidate.`,
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

      savedRecommendation = {
        ...recommendation,
        publicSafetyNotes: [
          ...(recommendation.publicSafetyNotes ?? []),
          `${bnlIngestLabel(recommendation)} found possible existing source files; left in Recommendation Inbox for owner/lead duplicate or identity review.`,
        ],
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

  return {
    recommendation: savedRecommendation,
    duplicate,
    candidate: savedCandidate,
    autoAction,
  };
}

function recommendationSourceNoteText(
  recommendation: DossierRecommendation,
): string {
  return [
    `Recommendation reason: ${recommendation.reason}`,
    recommendation.evidenceSummary
      ? `Evidence summary: ${recommendation.evidenceSummary}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);
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
      throw new DossierWorkflowInputError(
        "An exact same-subject BNL Source File already exists for this recommendation",
        400,
        "recommendation_existing_source_file_match",
        {
          exactCandidateId: match.exactCandidateId,
          exactMatchKind: match.exactMatchKind,
          possibleCandidateIds: match.possibleCandidateIds,
          reason: match.reason,
        },
      );
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
  if (entry.kind === "artist") return "artist";
  if (entry.kind === "community_member" || entry.category === "Personnel") {
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
  const entry = databasePage.entries.find((item) => item.id === input.dossierId);
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
    knownFacts: [`Existing public dossier target: ${entry.id} / ${entry.name}.`],
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
    doNotSay: [
      "Do not treat update notes as owner-approved public copy.",
    ],
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

  await updateDossierWorkflowState((currentState) => ({
    ...currentState,
    candidates: [candidate, ...currentState.candidates],
    updatedAt: now,
  }));

  return candidate;
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

    const starterNotes = [
      candidate.evidenceSummary
        ? `Starter evidence note: ${candidate.evidenceSummary}`
        : "",
      ...(candidate.publicSafetyNotes ?? []).map(
        (note) => `Public safety: ${note}`,
      ),
      ...(candidate.missingInfo ?? []).map((note) => `Missing info: ${note}`),
    ]
      .filter(Boolean)
      .join("\n");

    draft = {
      id: createDraftId(),
      candidateId: candidate.id,
      status: "draft",
      fields: normalizeDraftFields({
        name: candidate.name,
        category: candidate.recommendedCategory,
        kind: candidate.recommendedKind,
        ecosystemLane: candidate.recommendedEcosystemLane,
        identityAuthority: candidate.recommendedIdentityAuthority,
        status: candidate.recommendedStatus ?? "PENDING",
        clearance: candidate.recommendedClearance ?? "PUBLIC",
        origin: candidate.recommendedOrigin ?? "UNVERIFIED",
        summary: candidate.evidenceSummary
          ? `Starter note only: ${candidate.evidenceSummary}`
          : "",
        notes: starterNotes,
        tags: candidate.recommendedTags ?? [],
        proposedTags: candidate.proposedTags ?? [],
        primaryLink: candidate.primaryLink,
        files: [],
      }),
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

export function getDossierWorkflowStorageMode(): "redis" | "memory_fallback" {
  return getRedis() ? "redis" : "memory_fallback";
}
