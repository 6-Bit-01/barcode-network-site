import { Redis } from "@upstash/redis";
import {
  DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX,
  DOSSIER_WORKFLOW_STORAGE_KEY,
  getDossierWorkflowState,
  saveDossierWorkflowState,
  type DossierWorkflowState,
} from "@/lib/dossier-workflow-store";

const RETAIN_LATEST_ARCHIVES_PER_CANDIDATE = 3;
const DELETE_BATCH_SIZE = 25;
const ARCHIVE_PREFIX = `${DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX}:`;
const CHUNK_MARKER = ":chunk:";

type RedisLike = {
  scan?: (cursor: number | string, options?: { match?: string; count?: number }) => Promise<[number | string, string[]]>;
  dbsize?: () => Promise<number>;
  get?: <T = unknown>(key: string) => Promise<T | null>;
  del?: (...keys: string[]) => Promise<number>;
  strlen?: (key: string) => Promise<number>;
  type?: (key: string) => Promise<string>;
  command?: <T = unknown>(args: unknown[]) => Promise<T>;
};

export type RedisCapacityAuditCandidate = {
  candidateId: string;
  candidateName: string;
  retainedArchiveIds: string[];
  latestSourceFileArchiveId: string | null;
};

export type RedisCapacityAuditReport = {
  ok: true;
  generatedAt: string;
  totalKeyCount: number;
  keysByPrefix: Record<string, number>;
  estimatedBytesByPrefix: Record<string, number>;
  workflowStateSizeBytes: number;
  dossierSourceFileArchiveManifestCount: number;
  dossierSourceFileArchiveChunkCount: number;
  archiveIdsByCandidate: RedisCapacityAuditCandidate[];
  latestArchiveIdByCandidate: Record<string, string>;
  protectedArchiveIds: string[];
  supersededArchiveIdsEligibleForCleanup: string[];
  orphanedArchiveManifestIds: string[];
  orphanedArchiveChunkKeys: string[];
  estimatedReclaimableBytes: number;
};

export type RedisArchiveCleanupReport = {
  ok: boolean;
  status: "completed" | "partial_recovery" | "storage_capacity_exceeded";
  generatedAt: string;
  dryRun: false;
  deletedManifestIds: string[];
  deletedChunkKeys: string[];
  retainedArchiveIds: string[];
  failedKeys: { key: string; reason: string }[];
  reclaimedEstimatedBytes: number;
  workflowStatePersisted: boolean;
  analysis: RedisCapacityAuditReport;
};

function getRedis(): RedisLike | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token }) as unknown as RedisLike;
}

export function isStorageCapacityExceededError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /ERR\s+DB\s+capacity\s+quota\s+exceeded|capacity quota exceeded/i.test(message);
}

function safePrefix(key: string): string {
  if (key.startsWith(ARCHIVE_PREFIX)) return DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX;
  const [a, b] = key.split(":");
  return b ? `${a}:${b}` : a || "unknown";
}

function isArchiveChunkKey(key: string): boolean {
  return key.startsWith(ARCHIVE_PREFIX) && key.includes(CHUNK_MARKER);
}

function archiveIdFromKey(key: string): string | null {
  if (!key.startsWith(ARCHIVE_PREFIX) || isArchiveChunkKey(key)) return null;
  return key.slice(ARCHIVE_PREFIX.length) || null;
}

function archiveIdFromChunkKey(key: string): string | null {
  if (!isArchiveChunkKey(key)) return null;
  return key.slice(ARCHIVE_PREFIX.length).split(CHUNK_MARKER)[0] || null;
}

async function scanKeys(redis: RedisLike): Promise<string[]> {
  const keys: string[] = [];
  let cursor: number | string = 0;
  do {
    if (!redis.scan) break;
    const result = await redis.scan(cursor, { count: 500 });
    cursor = result[0];
    keys.push(...result[1]);
  } while (String(cursor) !== "0");
  return keys;
}

async function estimateKeyBytes(redis: RedisLike, key: string): Promise<number> {
  try {
    const memory = await redis.command?.<number>(["MEMORY", "USAGE", key]);
    if (typeof memory === "number" && Number.isFinite(memory)) return memory;
  } catch {}
  try {
    const type = (await redis.type?.(key)) ?? "";
    if (type === "string") return (await redis.strlen?.(key)) ?? 0;
  } catch {}
  return 0;
}

function collectActiveArchiveReferences(state: DossierWorkflowState): Set<string> {
  const protectedIds = new Set<string>();
  for (const candidate of state.candidates) {
    if (candidate.latestSourceFileArchiveId) protectedIds.add(candidate.latestSourceFileArchiveId);
    for (const review of candidate.sourceFileClaimReviews ?? []) {
      if (review.sourceArchiveId && review.decision !== "rejected") protectedIds.add(review.sourceArchiveId);
    }
    // Drafts/notes currently reference source notes, not archives; keep this hook intentionally narrow and payload-free.
  }
  return protectedIds;
}

function latestRetainedIds(ids: string[], latestId?: string): string[] {
  const retained = new Set<string>();
  for (const id of ids.slice(0, RETAIN_LATEST_ARCHIVES_PER_CANDIDATE)) retained.add(id);
  if (latestId) retained.add(latestId);
  return [...retained];
}

export async function auditRedisCapacity(input: { redis?: RedisLike | null } = {}): Promise<RedisCapacityAuditReport> {
  const redis = input.redis ?? getRedis();
  const state = await getDossierWorkflowState();
  const keys = redis ? await scanKeys(redis) : [];
  const totalKeyCount = redis?.dbsize ? await redis.dbsize().catch(() => keys.length) : keys.length;
  const keysByPrefix: Record<string, number> = {};
  const estimatedBytesByPrefix: Record<string, number> = {};
  const manifestIds = new Set<string>();
  const chunkKeysByArchive = new Map<string, string[]>();

  for (const key of keys) {
    const prefix = safePrefix(key);
    keysByPrefix[prefix] = (keysByPrefix[prefix] ?? 0) + 1;
    if (redis) estimatedBytesByPrefix[prefix] = (estimatedBytesByPrefix[prefix] ?? 0) + await estimateKeyBytes(redis, key);
    const manifestId = archiveIdFromKey(key);
    if (manifestId) manifestIds.add(manifestId);
    const chunkArchiveId = archiveIdFromChunkKey(key);
    if (chunkArchiveId) chunkKeysByArchive.set(chunkArchiveId, [...(chunkKeysByArchive.get(chunkArchiveId) ?? []), key]);
  }

  const archiveIdsByCandidate = state.candidates.map((candidate) => ({
    candidateId: candidate.id,
    candidateName: candidate.name,
    retainedArchiveIds: candidate.sourceFileArchiveIds ?? [],
    latestSourceFileArchiveId: candidate.latestSourceFileArchiveId ?? null,
  }));
  const latestArchiveIdByCandidate = Object.fromEntries(state.candidates.flatMap((c) => c.latestSourceFileArchiveId ? [[c.id, c.latestSourceFileArchiveId]] : []));
  const protectedArchiveIds = collectActiveArchiveReferences(state);
  for (const candidate of state.candidates) for (const id of latestRetainedIds(candidate.sourceFileArchiveIds ?? [], candidate.latestSourceFileArchiveId)) protectedArchiveIds.add(id);
  const referencedArchiveIds = new Set(state.candidates.flatMap((candidate) => candidate.sourceFileArchiveIds ?? []));
  for (const id of Object.values(latestArchiveIdByCandidate)) referencedArchiveIds.add(id);

  const superseded = new Set<string>();
  for (const candidate of state.candidates) for (const id of candidate.sourceFileArchiveIds ?? []) if (!protectedArchiveIds.has(id)) superseded.add(id);
  const orphanedArchiveManifestIds = [...manifestIds].filter((id) => !referencedArchiveIds.has(id));
  const orphanedArchiveChunkKeys = [...chunkKeysByArchive.entries()].filter(([id]) => !manifestIds.has(id) || !referencedArchiveIds.has(id)).flatMap(([, chunks]) => chunks);
  const deletableIds = new Set([...superseded, ...orphanedArchiveManifestIds]);
  let estimatedReclaimableBytes = 0;
  if (redis) for (const key of keys) {
    const id = archiveIdFromKey(key) ?? archiveIdFromChunkKey(key);
    if (id && (deletableIds.has(id) || orphanedArchiveChunkKeys.includes(key))) estimatedReclaimableBytes += await estimateKeyBytes(redis, key);
  }

  return { ok: true, generatedAt: new Date().toISOString(), totalKeyCount, keysByPrefix, estimatedBytesByPrefix, workflowStateSizeBytes: Buffer.byteLength(JSON.stringify(state), "utf8"), dossierSourceFileArchiveManifestCount: manifestIds.size, dossierSourceFileArchiveChunkCount: [...chunkKeysByArchive.values()].reduce((n, items) => n + items.length, 0), archiveIdsByCandidate, latestArchiveIdByCandidate, protectedArchiveIds: [...protectedArchiveIds].sort(), supersededArchiveIdsEligibleForCleanup: [...superseded].sort(), orphanedArchiveManifestIds: orphanedArchiveManifestIds.sort(), orphanedArchiveChunkKeys: orphanedArchiveChunkKeys.sort(), estimatedReclaimableBytes };
}

export async function cleanupSupersededSourceFileArchives(input: { redis?: RedisLike | null } = {}): Promise<RedisArchiveCleanupReport> {
  const redis = input.redis ?? getRedis();
  const analysis = await auditRedisCapacity({ redis });
  const deletedManifestIds: string[] = [];
  const deletedChunkKeys: string[] = [];
  const failedKeys: { key: string; reason: string }[] = [];
  const deletableIds = new Set([...analysis.supersededArchiveIdsEligibleForCleanup, ...analysis.orphanedArchiveManifestIds]);
  if (redis?.del) {
    const manifestKeys = [...deletableIds].map((id) => `${ARCHIVE_PREFIX}${id}`);
    const chunkKeys = analysis.orphanedArchiveChunkKeys.filter((key) => key.startsWith(ARCHIVE_PREFIX));
    for (const id of deletableIds) {
      const manifest = await redis.get?.<unknown>(`${ARCHIVE_PREFIX}${id}`).catch(() => null);
      const manifestRecord = manifest && typeof manifest === "object" ? manifest as { chunkKeys?: unknown } : null;
      for (const key of Array.isArray(manifestRecord?.chunkKeys) ? manifestRecord.chunkKeys : []) if (typeof key === "string" && key.startsWith(ARCHIVE_PREFIX)) chunkKeys.push(key);
    }
    const keys = [...new Set([...manifestKeys, ...chunkKeys])];
    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
      try { await redis.del(...batch); } catch (error) { for (const key of batch) failedKeys.push({ key, reason: isStorageCapacityExceededError(error) ? "storage_capacity_exceeded" : "delete_failed" }); }
    }
    deletedManifestIds.push(...manifestKeys.map((key) => key.slice(ARCHIVE_PREFIX.length)));
    deletedChunkKeys.push(...chunkKeys);
  }

  let workflowStatePersisted = false;
  try {
    const state = await getDossierWorkflowState();
    const retained = new Set(analysis.protectedArchiveIds);
    const nextState = { ...state, candidates: state.candidates.map((candidate) => ({ ...candidate, sourceFileArchiveIds: (candidate.sourceFileArchiveIds ?? []).filter((id) => retained.has(id) || id === candidate.latestSourceFileArchiveId) })) };
    await saveDossierWorkflowState(nextState);
    workflowStatePersisted = true;
  } catch (error) {
    failedKeys.push({ key: DOSSIER_WORKFLOW_STORAGE_KEY, reason: isStorageCapacityExceededError(error) ? "storage_capacity_exceeded" : "workflow_state_persist_failed" });
  }
  return { ok: failedKeys.length === 0, status: workflowStatePersisted ? "completed" : "partial_recovery", generatedAt: new Date().toISOString(), dryRun: false, deletedManifestIds, deletedChunkKeys, retainedArchiveIds: analysis.protectedArchiveIds, failedKeys, reclaimedEstimatedBytes: analysis.estimatedReclaimableBytes, workflowStatePersisted, analysis };
}

export { RETAIN_LATEST_ARCHIVES_PER_CANDIDATE };
