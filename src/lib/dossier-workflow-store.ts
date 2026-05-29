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
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  updatedAt: string;
};

export const DOSSIER_WORKFLOW_STORAGE_KEY = "barcode:dossier-workflow:v1";

let memoryState: DossierWorkflowState = emptyWorkflowState();

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function emptyWorkflowState(): DossierWorkflowState {
  return {
    version: 1,
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

  const currentState = await getDossierWorkflowState();
  await saveDossierWorkflowState({
    ...currentState,
    candidates: [candidate, ...currentState.candidates],
    updatedAt: now,
  });

  return candidate;
}

export async function updateDossierCandidateStatus(candidateId: string, status: DossierCandidateStatus): Promise<DossierCandidate | null> {
  const currentState = await getDossierWorkflowState();
  const now = new Date().toISOString();
  let updatedCandidate: DossierCandidate | null = null;
  const candidates = currentState.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate;
    updatedCandidate = { ...candidate, status, updatedAt: now };
    return updatedCandidate;
  });

  if (!updatedCandidate) return null;

  await saveDossierWorkflowState({
    ...currentState,
    candidates,
    updatedAt: now,
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
