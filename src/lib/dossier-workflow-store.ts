import { Redis } from "@upstash/redis";
import { databasePage, type DatabaseEntry } from "@/content";
import {
  scoreManualDossierCandidate,
  type CreateManualDossierCandidateInput,
  type DossierCandidate,
  type DossierCandidateStatus,
  type DossierDraft,
  type DossierDuplicateGroup,
  type DossierDuplicateRisk,
  type DossierWorkflowLink,
  type MergeDossierCandidatesInput,
} from "@/lib/dossier-workflow";

export type DossierWorkflowState = {
  version: 1;
  revision: number;
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
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
    role: typeof fields.role === "string" ? fields.role.trim() : undefined,
    origin: fields.origin,
    summary:
      typeof fields.summary === "string" ? fields.summary.trim() : undefined,
    notes: typeof fields.notes === "string" ? fields.notes.trim() : undefined,
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

function combineTextValues(values: Array<string | undefined>, limit = 4): string {
  return uniqueStrings(values.filter((value): value is string => Boolean(value))).slice(0, limit).join("\n\n");
}

function riskRank(risk: DossierDuplicateRisk): number {
  return { none: 0, low: 1, medium: 2, high: 3 }[risk] ?? 0;
}

function confidenceRank(confidence: "low" | "medium" | "high"): number {
  return { low: 1, medium: 2, high: 3 }[confidence];
}

function activeDraftForCandidate(drafts: DossierDraft[], candidateId: string): DossierDraft | undefined {
  return drafts.find(
    (draft) =>
      draft.candidateId === candidateId &&
      draft.status !== "denied" &&
      draft.status !== "published" &&
      draft.status !== "superseded",
  );
}

function preferredValue<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined && value !== null && value !== "");
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
      ? candidateState.candidates
      : [],
    drafts: Array.isArray(candidateState.drafts) ? candidateState.drafts : [],
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
    groupRiskByKey.set(key, riskRank(risk) > riskRank(currentRisk) ? risk : currentRisk);
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
        addPair(normalizedA, a, b, "high", "Exact normalized candidate name match inside workflow store.");
        continue;
      }
      if (compactA && compactA === compactB) {
        addPair(compactA, a, b, "high", "Compact candidate names match after removing punctuation and spaces.");
        continue;
      }
      if (
        normalizedA.length >= 4 &&
        normalizedB.length >= 4 &&
        (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA))
      ) {
        const key = compactA.length <= compactB.length ? compactA : compactB;
        addPair(key, a, b, "medium", "Candidate names appear to contain or closely overlap each other.");
      }
    }
  }

  return [...candidateIdsByGroupKey.entries()]
    .map(([key, ids]) => {
      const groupCandidates = [...ids]
        .map((id) => eligible.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is DossierCandidate => Boolean(candidate))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      const draftIds = groupCandidates
        .flatMap((candidate) => draftsByCandidate.get(candidate.id) ?? [])
        .map((draft) => draft.id)
        .sort();
      const existingPublishedDossierMatch = groupCandidates
        .map((candidate) => candidate.existingDossierMatch)
        .filter((match): match is NonNullable<DossierCandidate["existingDossierMatch"]> => Boolean(match))
        .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence) || a.id.localeCompare(b.id))[0] ?? null;
      return {
        id: `workflow-duplicate-${key}`,
        normalizedName: key,
        candidateIds: groupCandidates.map((candidate) => candidate.id),
        draftIds,
        names: uniqueStrings(groupCandidates.map((candidate) => candidate.name)).sort((a, b) => a.localeCompare(b)),
        risk: groupRiskByKey.get(key) ?? "low",
        reason: groupReasonByKey.get(key) ?? "Possible workflow duplicate candidate names.",
        suggestedMasterCandidateId: groupCandidates[0]?.id,
        existingPublishedDossierMatch,
      } satisfies DossierDuplicateGroup;
    })
    .filter((group) => group.candidateIds.length > 1)
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || a.normalizedName.localeCompare(b.normalizedName))
    .slice(0, 25);
}

function mergeEvidenceItems(
  candidates: DossierCandidate[],
): NonNullable<DossierCandidate["evidenceItems"]> {
  const seen = new Set<string>();
  const output: NonNullable<DossierCandidate["evidenceItems"]> = [];
  for (const item of candidates.flatMap((candidate) => candidate.evidenceItems ?? [])) {
    const key = `${item.id || ""}|${item.summary.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output.slice(0, 20);
}

function strongestTier(candidates: DossierCandidate[]): DossierCandidate["tier"] {
  const order: DossierCandidate["tier"][] = ["draft_ready", "review_candidate", "weak_candidate"];
  return order.find((tier) => candidates.some((candidate) => candidate.tier === tier)) ?? "review_candidate";
}

function buildMasterDraftFields(
  masterCandidate: DossierCandidate,
  primaryDraft: DossierDraft | undefined,
  sourceDrafts: DossierDraft[],
): DossierDraft["fields"] {
  const otherDraftFields = sourceDrafts.map((draft) => draft.fields);
  return normalizeDraftFields({
    name: preferredValue(primaryDraft?.fields.name, masterCandidate.name, ...otherDraftFields.map((fields) => fields.name)) ?? masterCandidate.name,
    category: preferredValue(primaryDraft?.fields.category, masterCandidate.recommendedCategory, ...otherDraftFields.map((fields) => fields.category)),
    kind: preferredValue(primaryDraft?.fields.kind, masterCandidate.recommendedKind, ...otherDraftFields.map((fields) => fields.kind)),
    ecosystemLane: preferredValue(primaryDraft?.fields.ecosystemLane, masterCandidate.recommendedEcosystemLane, ...otherDraftFields.map((fields) => fields.ecosystemLane)),
    identityAuthority: preferredValue(primaryDraft?.fields.identityAuthority, masterCandidate.recommendedIdentityAuthority, ...otherDraftFields.map((fields) => fields.identityAuthority)),
    status: preferredValue(primaryDraft?.fields.status, masterCandidate.recommendedStatus, ...otherDraftFields.map((fields) => fields.status), "PENDING"),
    clearance: preferredValue(primaryDraft?.fields.clearance, masterCandidate.recommendedClearance, ...otherDraftFields.map((fields) => fields.clearance), "PUBLIC"),
    role: preferredValue(primaryDraft?.fields.role, ...otherDraftFields.map((fields) => fields.role)),
    origin: preferredValue(primaryDraft?.fields.origin, masterCandidate.recommendedOrigin, ...otherDraftFields.map((fields) => fields.origin), "UNVERIFIED"),
    summary: preferredValue(primaryDraft?.fields.summary, masterCandidate.evidenceSummary, ...otherDraftFields.map((fields) => fields.summary)),
    notes: combineTextValues([
      primaryDraft?.fields.notes,
      masterCandidate.reason,
      masterCandidate.whyNow,
      ...otherDraftFields.map((fields) => fields.notes),
    ], 8),
    tags: uniqueStrings(primaryDraft?.fields.tags, masterCandidate.recommendedTags, ...otherDraftFields.map((fields) => fields.tags)),
    proposedTags: uniqueStrings(primaryDraft?.fields.proposedTags, masterCandidate.proposedTags, ...otherDraftFields.map((fields) => fields.proposedTags)),
    primaryLink: preferredValue(primaryDraft?.fields.primaryLink, masterCandidate.primaryLink, ...otherDraftFields.map((fields) => fields.primaryLink)),
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

export async function mergeDossierCandidates(input: MergeDossierCandidatesInput): Promise<{
  masterCandidate: DossierCandidate;
  masterDraft?: DossierDraft;
  mergedCandidateIds: string[];
  supersededDraftIds: string[];
} | null> {
  const now = new Date().toISOString();
  const primaryCandidateId = input.primaryCandidateId?.trim();
  const requestedSourceIds = uniqueStrings(input.sourceCandidateIds, [primaryCandidateId]);
  const requestedDraftIds = new Set(uniqueStrings(input.sourceDraftIds));

  if (!primaryCandidateId) {
    throw new DossierMergeError("primaryCandidateId is required", 400, "missing_primary_candidate");
  }
  if (requestedSourceIds.length < 2) {
    throw new DossierMergeError("At least two source candidates are required for merge", 400, "too_few_source_candidates");
  }

  let result: {
    masterCandidate: DossierCandidate;
    masterDraft?: DossierDraft;
    mergedCandidateIds: string[];
    supersededDraftIds: string[];
  } | null = null;

  await updateDossierWorkflowState((currentState) => {
    const candidatesById = new Map(currentState.candidates.map((candidate) => [candidate.id, candidate]));
    const primary = candidatesById.get(primaryCandidateId);
    if (!primary) throw new DossierMergeError("Primary candidate not found", 404, "primary_candidate_not_found");
    if (primary.status === "denied") {
      throw new DossierMergeError("Cannot merge into a denied primary candidate", 400, "primary_candidate_denied");
    }
    const missingSourceId = requestedSourceIds.find((id) => !candidatesById.has(id));
    if (missingSourceId) {
      throw new DossierMergeError(`Source candidate not found: ${missingSourceId}`, 404, "source_candidate_not_found");
    }

    const sources = requestedSourceIds.map((id) => candidatesById.get(id)).filter((candidate): candidate is DossierCandidate => Boolean(candidate));
    const primaryFirstSources = [primary, ...sources.filter((candidate) => candidate.id !== primary.id)];
    const nonPrimaryIds = primaryFirstSources.filter((candidate) => candidate.id !== primary.id).map((candidate) => candidate.id);
    const evidenceItems = mergeEvidenceItems(primaryFirstSources);
    const highestDuplicateRisk = primaryFirstSources.map((candidate) => candidate.duplicateRisk ?? "none").sort((a, b) => riskRank(b) - riskRank(a))[0] ?? "none";
    const existingDossierMatch = primaryFirstSources
      .map((candidate) => candidate.existingDossierMatch)
      .filter((match): match is NonNullable<DossierCandidate["existingDossierMatch"]> => Boolean(match))
      .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence) || a.id.localeCompare(b.id))[0] ?? null;
    const score = Math.min(100, Math.max(...primaryFirstSources.map((candidate) => candidate.score ?? 0)));
    const masterCandidate: DossierCandidate = {
      ...primary,
      candidateType: primary.candidateType !== "unknown" ? primary.candidateType : (primaryFirstSources.find((candidate) => candidate.candidateType !== "unknown")?.candidateType ?? primary.candidateType),
      source: primary.source ?? "combined",
      tier: strongestTier(primaryFirstSources),
      score,
      reason: combineTextValues(primaryFirstSources.map((candidate) => candidate.reason), 6),
      whyNow: combineTextValues(primaryFirstSources.map((candidate) => candidate.whyNow), 6),
      evidenceSummary: combineTextValues(primaryFirstSources.map((candidate) => candidate.evidenceSummary), 6),
      evidenceItems,
      evidenceCount: evidenceItems.length,
      knownFacts: uniqueStrings(...primaryFirstSources.map((candidate) => candidate.knownFacts)),
      duplicateRisk: highestDuplicateRisk,
      existingDossierMatch,
      recommendedCategory: preferredValue(primary.recommendedCategory, ...primaryFirstSources.slice(1).map((candidate) => candidate.recommendedCategory)),
      recommendedKind: preferredValue(primary.recommendedKind, ...primaryFirstSources.slice(1).map((candidate) => candidate.recommendedKind)),
      recommendedEcosystemLane: preferredValue(primary.recommendedEcosystemLane, ...primaryFirstSources.slice(1).map((candidate) => candidate.recommendedEcosystemLane)),
      recommendedIdentityAuthority: preferredValue(primary.recommendedIdentityAuthority, ...primaryFirstSources.slice(1).map((candidate) => candidate.recommendedIdentityAuthority)),
      recommendedStatus: preferredValue(primary.recommendedStatus, ...primaryFirstSources.slice(1).map((candidate) => candidate.recommendedStatus)),
      recommendedClearance: preferredValue(primary.recommendedClearance, ...primaryFirstSources.slice(1).map((candidate) => candidate.recommendedClearance)),
      recommendedOrigin: preferredValue(primary.recommendedOrigin, ...primaryFirstSources.slice(1).map((candidate) => candidate.recommendedOrigin)),
      recommendedTags: uniqueStrings(...primaryFirstSources.map((candidate) => candidate.recommendedTags)),
      proposedTags: uniqueStrings(...primaryFirstSources.map((candidate) => candidate.proposedTags)),
      primaryLink: primary.primaryLink ?? primaryFirstSources.find((candidate) => candidate.primaryLink?.publicSafe !== false)?.primaryLink,
      missingInfo: uniqueStrings(...primaryFirstSources.map((candidate) => candidate.missingInfo)),
      doNotSay: uniqueStrings(...primaryFirstSources.map((candidate) => candidate.doNotSay)),
      publicSafetyNotes: uniqueStrings(...primaryFirstSources.map((candidate) => candidate.publicSafetyNotes)),
      status: primary.status === "draft_ready" || primary.status === "draft_requested" ? "draft_ready" : "needs_review",
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
          requestedSourceIds.includes(draft.candidateId) || requestedDraftIds.has(draft.id),
      );
      const primaryDraft = activeDraftForCandidate(currentState.drafts, primary.id);
      const nonPrimaryDrafts = sourceDrafts.filter(
        (draft) => draft.id !== primaryDraft?.id && draft.candidateId !== primary.id && draft.status !== "published",
      );
      const sourceDraftIds = uniqueStrings(sourceDrafts.map((draft) => draft.id));

      if (primaryDraft) {
        masterDraft = {
          ...primaryDraft,
          status: primaryDraft.status === "published" ? "draft" : primaryDraft.status,
          fields: buildMasterDraftFields(masterCandidate, primaryDraft, sourceDrafts.filter((draft) => draft.id !== primaryDraft.id)),
          mergeNote: input.mergeNote?.trim() || undefined,
          mergeSourceDraftIds: sourceDraftIds,
          updatedAt: now,
        };
        drafts = currentState.drafts.map((draft) => {
          if (draft.id === primaryDraft.id) return masterDraft as DossierDraft;
          if (nonPrimaryDrafts.some((sourceDraft) => sourceDraft.id === draft.id)) {
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
          fields: buildMasterDraftFields(masterCandidate, undefined, sourceDrafts),
          mergeNote: input.mergeNote?.trim() || undefined,
          mergeSourceDraftIds: sourceDraftIds,
          createdAt: now,
          updatedAt: now,
        };
        drafts = [masterDraft, ...currentState.drafts.map((draft) => {
          if (nonPrimaryDrafts.some((sourceDraft) => sourceDraft.id === draft.id)) {
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
        })];
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
