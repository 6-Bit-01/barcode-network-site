import { Redis } from "@upstash/redis";
import { databasePage, type DatabaseEntry } from "@/content";
import {
  scoreManualDossierCandidate,
  type CreateManualDossierCandidateInput,
  type DossierCandidate,
  type DossierCandidateStatus,
  type DossierDraft,
  type DossierDuplicateRisk,
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
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
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
  if (normalizedCandidate === normalizedEntry || compactCandidate === compactEntry) return true;
  if (normalizedCandidate.length < 4 || normalizedEntry.length < 4) return false;
  return normalizedCandidate.includes(normalizedEntry) || normalizedEntry.includes(normalizedCandidate);
}

function findExistingDossierMatch(name: string): {
  risk: DossierDuplicateRisk;
  match: DossierCandidate["existingDossierMatch"];
} {
  const exact = databasePage.entries.find((entry: DatabaseEntry) => normalizeName(entry.name) === normalizeName(name));
  if (exact) {
    return {
      risk: "high",
      match: { id: exact.id, name: exact.name, confidence: "high" },
    };
  }

  const near = databasePage.entries.find((entry: DatabaseEntry) => hasNearNameMatch(name, entry.name));
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
    revision: typeof candidateState.revision === "number" && Number.isFinite(candidateState.revision) ? Math.max(0, Math.floor(candidateState.revision)) : 0,
    candidates: Array.isArray(candidateState.candidates) ? candidateState.candidates : [],
    drafts: Array.isArray(candidateState.drafts) ? candidateState.drafts : [],
    updatedAt: typeof candidateState.updatedAt === "string" ? candidateState.updatedAt : new Date().toISOString(),
  };
}

function createCandidateId(): string {
  return `dossier_candidate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEvidenceId(): string {
  return `evidence_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getDossierWorkflowState(): Promise<DossierWorkflowState> {
  const redis = getRedis();
  if (!redis) return memoryState;

  const state = sanitizeWorkflowState(await redis.get<unknown>(DOSSIER_WORKFLOW_STORAGE_KEY));
  memoryState = state;
  return state;
}

export async function saveDossierWorkflowState(state: DossierWorkflowState): Promise<void> {
  const nextState = sanitizeWorkflowState({ ...state, version: 1, updatedAt: state.updatedAt || new Date().toISOString() });
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
    const acquired = await redis.set(DOSSIER_WORKFLOW_LOCK_KEY, token, { nx: true, ex: LOCK_TTL_SECONDS });
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
      const currentState = sanitizeWorkflowState(await redis.get<unknown>(DOSSIER_WORKFLOW_STORAGE_KEY));
      const updaterResult = updater(currentState);
      if (updaterResult === currentState) return currentState;
      const updatedState = sanitizeWorkflowState(updaterResult);
      const latestState = sanitizeWorkflowState(await redis.get<unknown>(DOSSIER_WORKFLOW_STORAGE_KEY));

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

  throw new Error("Unable to update dossier workflow state after revision conflicts");
}

export async function createManualDossierCandidate(input: CreateManualDossierCandidateInput): Promise<DossierCandidate> {
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
    tier: duplicate.risk === "high" && scored.tier === "draft_ready" ? "review_candidate" : scored.tier,
    score: scored.score,
    whyNow: input.whyNow?.trim() ?? "",
    reason,
    firstSeenAt: now,
    lastSeenAt: now,
    evidenceSummary: input.evidenceSummary?.trim() ?? "",
    evidenceItems: input.evidenceSummary?.trim() ? [{
      id: createEvidenceId(),
      type: "manual_nomination",
      label: "Manual operator intake",
      summary: input.evidenceSummary.trim(),
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      publicSafe: input.primaryLink?.publicSafe !== false,
    }] : [],
    evidenceCount: input.evidenceSummary?.trim() ? 1 : 0,
    knownFacts,
    confidence: scored.confidence,
    duplicateRisk: duplicate.risk,
    existingDossierMatch: duplicate.match,
    recommendedCategory: input.recommendedCategory,
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

export async function updateDossierCandidateStatus(candidateId: string, status: DossierCandidateStatus): Promise<DossierCandidate | null> {
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

export async function getDossierCandidate(candidateId: string): Promise<DossierCandidate | null> {
  const currentState = await getDossierWorkflowState();
  return currentState.candidates.find((candidate) => candidate.id === candidateId) ?? null;
}

export function getDossierWorkflowStorageMode(): "redis" | "memory_fallback" {
  return getRedis() ? "redis" : "memory_fallback";
}
