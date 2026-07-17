import { Redis } from "@upstash/redis";
import {
  DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX,
  DOSSIER_WORKFLOW_STORAGE_KEY,
  getDossierWorkflowState,
  updateDossierWorkflowState,
  type DossierWorkflowState,
} from "@/lib/dossier-workflow-store";

export const RETAIN_LATEST_ARCHIVES_PER_CANDIDATE = 3;
const DELETE_BATCH_SIZE = 25;
const ARCHIVE_PREFIX = `${DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX}:`;
const CHUNK_MARKER = ":chunk:";

type RedisLike = {
  scan?: (cursor: number | string, options?: { match?: string; count?: number }) => Promise<[number | string, string[]]>;
  dbsize?: () => Promise<number>;
  get?: <T = unknown>(key: string) => Promise<T | null>;
  del?: (...keys: string[]) => Promise<number>;
  set?: (key: string, value: unknown) => Promise<unknown>;
  strlen?: (key: string) => Promise<number>;
  type?: (key: string) => Promise<string>;
  command?: <T = unknown>(args: unknown[]) => Promise<T>;
};

type WorkflowDeps = {
  getState?: () => Promise<DossierWorkflowState>;
  updateState?: (updater: (state: DossierWorkflowState) => DossierWorkflowState) => Promise<DossierWorkflowState>;
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
  estimatedBytesByKey: Record<string, number>;
};

export type CleanupStatus = "completed" | "completed_with_already_absent_keys" | "partial_recovery" | "storage_capacity_exceeded" | "cleanup_failed" | "unavailable";

export type RedisArchiveCleanupReport = {
  ok: boolean;
  status: CleanupStatus;
  generatedAt: string;
  dryRun: false;
  plannedManifestIds: string[];
  plannedChunkKeys: string[];
  attemptedManifestIds: string[];
  attemptedChunkKeys: string[];
  deletedManifestIds: string[];
  deletedChunkKeys: string[];
  alreadyAbsentManifestIds: string[];
  alreadyAbsentChunkKeys: string[];
  retainedArchiveIds: string[];
  failedKeys: { key: string; reason: string }[];
  remainingArchiveIds: string[];
  remainingChunkKeys: string[];
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

function archiveManifestKey(id: string): string {
  return `${ARCHIVE_PREFIX}${id}`;
}

function archiveChunkPrefix(id: string): string {
  return `${ARCHIVE_PREFIX}${id}${CHUNK_MARKER}`;
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

function isExactArchiveChunkKey(archiveId: string, key: string): boolean {
  return key.startsWith(archiveChunkPrefix(archiveId));
}

function manifestChunkKeysForArchive(archiveId: string, manifest: unknown): string[] {
  const record = manifest && typeof manifest === "object" ? manifest as { chunkKeys?: unknown } : null;
  if (!Array.isArray(record?.chunkKeys)) return [];
  return record.chunkKeys.filter((key): key is string => typeof key === "string" && isExactArchiveChunkKey(archiveId, key));
}

async function scanKeys(redis: RedisLike, match?: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: number | string = 0;
  do {
    if (!redis.scan) break;
    const result = await redis.scan(cursor, { count: 500, ...(match ? { match } : {}) });
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

function collectProtectedArchiveIds(state: DossierWorkflowState): Set<string> {
  const protectedIds = new Set<string>();
  for (const candidate of state.candidates) {
    if (candidate.latestSourceFileArchiveId) protectedIds.add(candidate.latestSourceFileArchiveId);
    for (const id of latestRetainedIds(candidate.sourceFileArchiveIds ?? [], candidate.latestSourceFileArchiveId)) protectedIds.add(id);
    for (const review of candidate.sourceFileClaimReviews ?? []) {
      if (review.sourceArchiveId && review.decision !== "rejected") protectedIds.add(review.sourceArchiveId);
    }
  }
  return protectedIds;
}

function latestRetainedIds(ids: string[], latestId?: string): string[] {
  const retained = new Set<string>();
  for (const id of ids.slice(0, RETAIN_LATEST_ARCHIVES_PER_CANDIDATE)) retained.add(id);
  if (latestId) retained.add(latestId);
  return [...retained];
}

async function stateFromDeps(deps?: WorkflowDeps): Promise<DossierWorkflowState> {
  return deps?.getState ? deps.getState() : getDossierWorkflowState();
}

export async function auditRedisCapacity(input: { redis?: RedisLike | null } & WorkflowDeps = {}): Promise<RedisCapacityAuditReport> {
  const redis = "redis" in input ? input.redis : getRedis();
  const state = await stateFromDeps(input);
  const keys = redis ? await scanKeys(redis) : [];
  const totalKeyCount = redis?.dbsize ? await redis.dbsize().catch(() => keys.length) : keys.length;
  const keysByPrefix: Record<string, number> = {};
  const estimatedBytesByPrefix: Record<string, number> = {};
  const estimatedBytesByKey: Record<string, number> = {};
  const manifestIds = new Set<string>();
  const chunkKeysByArchive = new Map<string, string[]>();

  for (const key of keys) {
    const prefix = safePrefix(key);
    keysByPrefix[prefix] = (keysByPrefix[prefix] ?? 0) + 1;
    if (redis) {
      const bytes = await estimateKeyBytes(redis, key);
      estimatedBytesByKey[key] = bytes;
      estimatedBytesByPrefix[prefix] = (estimatedBytesByPrefix[prefix] ?? 0) + bytes;
    }
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
  const latestArchiveIdByCandidate = Object.fromEntries(state.candidates.flatMap((candidate) => candidate.latestSourceFileArchiveId ? [[candidate.id, candidate.latestSourceFileArchiveId]] : []));
  const protectedArchiveIds = collectProtectedArchiveIds(state);
  const referencedArchiveIds = new Set(state.candidates.flatMap((candidate) => candidate.sourceFileArchiveIds ?? []));
  for (const id of Object.values(latestArchiveIdByCandidate)) referencedArchiveIds.add(id);
  for (const id of protectedArchiveIds) referencedArchiveIds.add(id);

  const superseded = new Set<string>();
  for (const candidate of state.candidates) {
    for (const id of candidate.sourceFileArchiveIds ?? []) if (!protectedArchiveIds.has(id)) superseded.add(id);
  }
  const orphanedArchiveManifestIds = [...manifestIds].filter((id) => !protectedArchiveIds.has(id) && !referencedArchiveIds.has(id));
  const orphanedArchiveChunkKeys = [...chunkKeysByArchive.entries()]
    .filter(([id]) => !protectedArchiveIds.has(id) && (!manifestIds.has(id) || !referencedArchiveIds.has(id)))
    .flatMap(([, chunks]) => chunks.filter((key) => !protectedArchiveIds.has(archiveIdFromChunkKey(key) ?? "")));
  const deletableIds = new Set([...superseded, ...orphanedArchiveManifestIds].filter((id) => !protectedArchiveIds.has(id)));
  const orphanedChunkSet = new Set(orphanedArchiveChunkKeys);
  let estimatedReclaimableBytes = 0;
  for (const key of keys) {
    const id = archiveIdFromKey(key) ?? archiveIdFromChunkKey(key);
    if (id && !protectedArchiveIds.has(id) && (deletableIds.has(id) || orphanedChunkSet.has(key))) estimatedReclaimableBytes += estimatedBytesByKey[key] ?? 0;
  }

  return { ok: true, generatedAt: new Date().toISOString(), totalKeyCount, keysByPrefix, estimatedBytesByPrefix, workflowStateSizeBytes: Buffer.byteLength(JSON.stringify(state), "utf8"), dossierSourceFileArchiveManifestCount: manifestIds.size, dossierSourceFileArchiveChunkCount: [...chunkKeysByArchive.values()].reduce((n, items) => n + items.length, 0), archiveIdsByCandidate, latestArchiveIdByCandidate, protectedArchiveIds: [...protectedArchiveIds].sort(), supersededArchiveIdsEligibleForCleanup: [...superseded].sort(), orphanedArchiveManifestIds: orphanedArchiveManifestIds.sort(), orphanedArchiveChunkKeys: orphanedArchiveChunkKeys.sort(), estimatedReclaimableBytes, estimatedBytesByKey };
}

async function existingKey(redis: RedisLike, key: string): Promise<boolean> {
  return (await redis.get?.<unknown>(key).catch(() => null)) !== null;
}

async function namespaceState(redis: RedisLike): Promise<{ manifestIds: Set<string>; chunkKeys: Set<string> }> {
  const keys = await scanKeys(redis, `${ARCHIVE_PREFIX}*`);
  return { manifestIds: new Set(keys.map(archiveIdFromKey).filter((id): id is string => Boolean(id))), chunkKeys: new Set(keys.filter(isArchiveChunkKey)) };
}

function statusFor(input: { redisMissing: boolean; capacityFailure: boolean; failedCount: number; workflowPersisted: boolean; alreadyAbsentCount: number }): CleanupStatus {
  if (input.redisMissing) return "unavailable";
  if (input.capacityFailure) return "storage_capacity_exceeded";
  if (input.failedCount > 0 || !input.workflowPersisted) return input.workflowPersisted ? "cleanup_failed" : "partial_recovery";
  if (input.alreadyAbsentCount > 0) return "completed_with_already_absent_keys";
  return "completed";
}

export async function cleanupSupersededSourceFileArchives(input: { redis?: RedisLike | null } & WorkflowDeps = {}): Promise<RedisArchiveCleanupReport> {
  const redis = "redis" in input ? input.redis : getRedis();
  const analysis = await auditRedisCapacity(input);
  if (!redis?.del) {
    return { ok: false, status: "unavailable", generatedAt: new Date().toISOString(), dryRun: false, plannedManifestIds: [], plannedChunkKeys: [], attemptedManifestIds: [], attemptedChunkKeys: [], deletedManifestIds: [], deletedChunkKeys: [], alreadyAbsentManifestIds: [], alreadyAbsentChunkKeys: [], retainedArchiveIds: analysis.protectedArchiveIds, failedKeys: [{ key: DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX, reason: "redis_unavailable" }], remainingArchiveIds: [], remainingChunkKeys: [], reclaimedEstimatedBytes: 0, workflowStatePersisted: false, analysis };
  }

  const initialProtected = new Set(analysis.protectedArchiveIds);
  const plannedManifestIds = [...new Set([...analysis.supersededArchiveIdsEligibleForCleanup, ...analysis.orphanedArchiveManifestIds].filter((id) => !initialProtected.has(id)))];
  const plannedChunkKeys = new Set(analysis.orphanedArchiveChunkKeys.filter((key) => {
    const id = archiveIdFromChunkKey(key);
    return id && !initialProtected.has(id);
  }));

  for (const id of plannedManifestIds) {
    const manifest = await redis.get?.<unknown>(archiveManifestKey(id)).catch(() => null);
    for (const key of manifestChunkKeysForArchive(id, manifest)) plannedChunkKeys.add(key);
  }

  const attemptedManifestIds: string[] = [];
  const attemptedChunkKeys: string[] = [];
  const deletedManifestIds: string[] = [];
  const deletedChunkKeys: string[] = [];
  const alreadyAbsentManifestIds: string[] = [];
  const alreadyAbsentChunkKeys: string[] = [];
  const failedKeys: { key: string; reason: string }[] = [];

  const plannedKeys = [
    ...plannedManifestIds.map(archiveManifestKey),
    ...[...plannedChunkKeys],
  ];

  for (let i = 0; i < plannedKeys.length; i += DELETE_BATCH_SIZE) {
    const currentState = await stateFromDeps(input);
    const protectedNow = collectProtectedArchiveIds(currentState);
    const batch = plannedKeys.slice(i, i + DELETE_BATCH_SIZE).filter((key) => {
      const id = archiveIdFromKey(key) ?? archiveIdFromChunkKey(key);
      return id && !protectedNow.has(id) && (archiveIdFromKey(key) ? key === archiveManifestKey(id) : isExactArchiveChunkKey(id, key));
    });
    for (const key of batch) {
      const id = archiveIdFromKey(key);
      if (id) attemptedManifestIds.push(id); else attemptedChunkKeys.push(key);
    }
    if (!batch.length) continue;
    const existingBefore = new Set<string>();
    for (const key of batch) {
      if (await existingKey(redis, key)) existingBefore.add(key);
      else if (archiveIdFromKey(key)) alreadyAbsentManifestIds.push(archiveIdFromKey(key)!);
      else alreadyAbsentChunkKeys.push(key);
    }
    const deleteTargets = batch.filter((key) => existingBefore.has(key));
    for (const key of deleteTargets) {
      try {
        await redis.del(key);
      } catch (error) {
        failedKeys.push({ key, reason: isStorageCapacityExceededError(error) ? "storage_capacity_exceeded" : "delete_failed" });
        continue;
      }
      if (await existingKey(redis, key)) failedKeys.push({ key, reason: "delete_not_confirmed" });
      else if (archiveIdFromKey(key)) deletedManifestIds.push(archiveIdFromKey(key)!);
      else deletedChunkKeys.push(key);
    }
  }

  const confirmedAbsentArchiveIds = new Set([...deletedManifestIds, ...alreadyAbsentManifestIds]);
  let workflowStatePersisted = false;
  try {
    const mutate = input.updateState ?? updateDossierWorkflowState;
    await mutate((state) => ({
      ...state,
      candidates: state.candidates.map((candidate) => ({
        ...candidate,
        sourceFileArchiveIds: (candidate.sourceFileArchiveIds ?? []).filter((id) => !confirmedAbsentArchiveIds.has(id)),
      })),
    }));
    workflowStatePersisted = true;
  } catch (error) {
    failedKeys.push({ key: DOSSIER_WORKFLOW_STORAGE_KEY, reason: isStorageCapacityExceededError(error) ? "storage_capacity_exceeded" : "workflow_state_persist_failed" });
  }

  const after = await namespaceState(redis);
  const reclaimedEstimatedBytes = [...deletedManifestIds.map(archiveManifestKey), ...deletedChunkKeys].reduce((total, key) => total + (analysis.estimatedBytesByKey[key] ?? 0), 0);
  const capacityFailure = failedKeys.some((item) => item.reason === "storage_capacity_exceeded");
  const status = statusFor({ redisMissing: false, capacityFailure, failedCount: failedKeys.length, workflowPersisted: workflowStatePersisted, alreadyAbsentCount: alreadyAbsentManifestIds.length + alreadyAbsentChunkKeys.length });

  return { ok: failedKeys.length === 0 && workflowStatePersisted, status, generatedAt: new Date().toISOString(), dryRun: false, plannedManifestIds, plannedChunkKeys: [...plannedChunkKeys].sort(), attemptedManifestIds: [...new Set(attemptedManifestIds)].sort(), attemptedChunkKeys: [...new Set(attemptedChunkKeys)].sort(), deletedManifestIds: [...new Set(deletedManifestIds)].sort(), deletedChunkKeys: [...new Set(deletedChunkKeys)].sort(), alreadyAbsentManifestIds: [...new Set(alreadyAbsentManifestIds)].sort(), alreadyAbsentChunkKeys: [...new Set(alreadyAbsentChunkKeys)].sort(), retainedArchiveIds: [...collectProtectedArchiveIds(await stateFromDeps(input))].sort(), failedKeys, remainingArchiveIds: [...after.manifestIds].sort(), remainingChunkKeys: [...after.chunkKeys].sort(), reclaimedEstimatedBytes, workflowStatePersisted, analysis };
}

export async function cleanupCandidateSourceFileArchiveRetention(input: { redis?: RedisLike | null; candidateId: string } & WorkflowDeps): Promise<RedisArchiveCleanupReport> {
  const redis = "redis" in input ? input.redis : getRedis();
  const state = await stateFromDeps(input);
  const candidate = state.candidates.find((item) => item.id === input.candidateId);
  const protectedIds = collectProtectedArchiveIds(state);
  const evicted = (candidate?.sourceFileArchiveIds ?? []).filter((id) => !protectedIds.has(id));
  const analysis: RedisCapacityAuditReport = { ok: true, generatedAt: new Date().toISOString(), totalKeyCount: 0, keysByPrefix: {}, estimatedBytesByPrefix: {}, workflowStateSizeBytes: Buffer.byteLength(JSON.stringify(state), "utf8"), dossierSourceFileArchiveManifestCount: 0, dossierSourceFileArchiveChunkCount: 0, archiveIdsByCandidate: candidate ? [{ candidateId: candidate.id, candidateName: candidate.name, retainedArchiveIds: candidate.sourceFileArchiveIds ?? [], latestSourceFileArchiveId: candidate.latestSourceFileArchiveId ?? null }] : [], latestArchiveIdByCandidate: candidate?.latestSourceFileArchiveId ? { [candidate.id]: candidate.latestSourceFileArchiveId } : {}, protectedArchiveIds: [...protectedIds].sort(), supersededArchiveIdsEligibleForCleanup: evicted, orphanedArchiveManifestIds: [], orphanedArchiveChunkKeys: [], estimatedReclaimableBytes: 0, estimatedBytesByKey: {} };
  if (!redis?.del) return { ok: false, status: "unavailable", generatedAt: new Date().toISOString(), dryRun: false, plannedManifestIds: [], plannedChunkKeys: [], attemptedManifestIds: [], attemptedChunkKeys: [], deletedManifestIds: [], deletedChunkKeys: [], alreadyAbsentManifestIds: [], alreadyAbsentChunkKeys: [], retainedArchiveIds: analysis.protectedArchiveIds, failedKeys: [{ key: DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX, reason: "redis_unavailable" }], remainingArchiveIds: [], remainingChunkKeys: [], reclaimedEstimatedBytes: 0, workflowStatePersisted: false, analysis };

  const plannedManifestIds = evicted;
  const plannedChunkKeys = new Set<string>();
  for (const id of plannedManifestIds) {
    const manifest = await redis.get?.<unknown>(archiveManifestKey(id)).catch(() => null);
    for (const key of manifestChunkKeysForArchive(id, manifest)) plannedChunkKeys.add(key);
  }

  const attemptedManifestIds: string[] = [];
  const attemptedChunkKeys: string[] = [];
  const deletedManifestIds: string[] = [];
  const deletedChunkKeys: string[] = [];
  const alreadyAbsentManifestIds: string[] = [];
  const alreadyAbsentChunkKeys: string[] = [];
  const failedKeys: { key: string; reason: string }[] = [];
  const plannedKeys = [...plannedManifestIds.map(archiveManifestKey), ...plannedChunkKeys];

  for (let i = 0; i < plannedKeys.length; i += DELETE_BATCH_SIZE) {
    const currentState = await stateFromDeps(input);
    const protectedNow = collectProtectedArchiveIds(currentState);
    const batch = plannedKeys.slice(i, i + DELETE_BATCH_SIZE).filter((key) => {
      const id = archiveIdFromKey(key) ?? archiveIdFromChunkKey(key);
      return id && !protectedNow.has(id) && (archiveIdFromKey(key) ? key === archiveManifestKey(id) : isExactArchiveChunkKey(id, key));
    });
    for (const key of batch) {
      const id = archiveIdFromKey(key);
      if (id) attemptedManifestIds.push(id); else attemptedChunkKeys.push(key);
    }
    const deleteTargets: string[] = [];
    for (const key of batch) {
      if (await existingKey(redis, key)) deleteTargets.push(key);
      else if (archiveIdFromKey(key)) alreadyAbsentManifestIds.push(archiveIdFromKey(key)!);
      else alreadyAbsentChunkKeys.push(key);
    }
    for (const key of deleteTargets) {
      try { await redis.del(key); } catch (error) {
        failedKeys.push({ key, reason: isStorageCapacityExceededError(error) ? "storage_capacity_exceeded" : "delete_failed" });
        continue;
      }
      if (await existingKey(redis, key)) failedKeys.push({ key, reason: "delete_not_confirmed" });
      else if (archiveIdFromKey(key)) deletedManifestIds.push(archiveIdFromKey(key)!);
      else deletedChunkKeys.push(key);
    }
  }

  const confirmedAbsentArchiveIds = new Set([...deletedManifestIds, ...alreadyAbsentManifestIds]);
  let workflowStatePersisted = false;
  try {
    const mutate = input.updateState ?? updateDossierWorkflowState;
    await mutate((currentState) => ({ ...currentState, candidates: currentState.candidates.map((item) => item.id === input.candidateId ? { ...item, sourceFileArchiveIds: (item.sourceFileArchiveIds ?? []).filter((id) => !confirmedAbsentArchiveIds.has(id)) } : item) }));
    workflowStatePersisted = true;
  } catch (error) {
    failedKeys.push({ key: DOSSIER_WORKFLOW_STORAGE_KEY, reason: isStorageCapacityExceededError(error) ? "storage_capacity_exceeded" : "workflow_state_persist_failed" });
  }

  const capacityFailure = failedKeys.some((item) => item.reason === "storage_capacity_exceeded");
  const status = statusFor({ redisMissing: false, capacityFailure, failedCount: failedKeys.length, workflowPersisted: workflowStatePersisted, alreadyAbsentCount: alreadyAbsentManifestIds.length + alreadyAbsentChunkKeys.length });
  return { ok: failedKeys.length === 0 && workflowStatePersisted, status, generatedAt: new Date().toISOString(), dryRun: false, plannedManifestIds, plannedChunkKeys: [...plannedChunkKeys].sort(), attemptedManifestIds: [...new Set(attemptedManifestIds)].sort(), attemptedChunkKeys: [...new Set(attemptedChunkKeys)].sort(), deletedManifestIds: [...new Set(deletedManifestIds)].sort(), deletedChunkKeys: [...new Set(deletedChunkKeys)].sort(), alreadyAbsentManifestIds: [...new Set(alreadyAbsentManifestIds)].sort(), alreadyAbsentChunkKeys: [...new Set(alreadyAbsentChunkKeys)].sort(), retainedArchiveIds: [...collectProtectedArchiveIds(await stateFromDeps(input))].sort(), failedKeys, remainingArchiveIds: [], remainingChunkKeys: [], reclaimedEstimatedBytes: 0, workflowStatePersisted, analysis };
}
