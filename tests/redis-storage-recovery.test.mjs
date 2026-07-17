import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auditSource = readFileSync("src/lib/redis-capacity-audit.ts", "utf8");
const routeSource = readFileSync("src/app/api/admin/storage-recovery/route.ts", "utf8");
const uiSource = readFileSync("src/app/admin/storage-recovery/page.tsx", "utf8");
const storeSource = readFileSync("src/lib/dossier-workflow-store.ts", "utf8");

test("dry-run uses cursor SCAN, reports without Redis mutation, and avoids secret/archive payload returns", () => {
  assert.match(auditSource, /scan\(cursor/);
  const auditFn = auditSource.slice(auditSource.indexOf("export async function auditRedisCapacity"), auditSource.indexOf("export async function cleanupSupersededSourceFileArchives"));
  assert.doesNotMatch(auditFn, /redis\.del\(|redis\.set\(/);
  assert.match(auditFn, /totalKeyCount/);
  assert.match(auditFn, /keysByPrefix/);
  assert.match(auditFn, /estimatedBytesByPrefix/);
  assert.match(auditFn, /workflowStateSizeBytes/);
  assert.match(auditFn, /archiveIdsByCandidate/);
  assert.match(auditFn, /latestArchiveIdByCandidate/);
  assert.match(auditFn, /orphanedArchiveManifestIds/);
  assert.match(auditFn, /orphanedArchiveChunkKeys/);
  assert.doesNotMatch(auditFn, /sourcePackage|UPSTASH_REDIS_REST_TOKEN|UPSTASH_REDIS_REST_URL|process\.env/);
});

test("cleanup is narrowly restricted to the dossier source-file archive prefix and preserves protected keys", () => {
  assert.match(auditSource, /DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX/);
  assert.match(auditSource, /key\.startsWith\(ARCHIVE_PREFIX\)/);
  assert.doesNotMatch(auditSource, /queue:state.*del|bnl:presence.*del|bnl:relay.*del|live:overlay.*del|stripe.*del/s);
  assert.match(auditSource, /DELETE_BATCH_SIZE = 25/);
  assert.match(auditSource, /workflowStatePersisted/);
  assert.match(auditSource, /partial_recovery/);
});

test("retention protects latest three, latest pointer, and active claim-review archive references", () => {
  assert.match(auditSource, /RETAIN_LATEST_ARCHIVES_PER_CANDIDATE = 3/);
  assert.match(auditSource, /latestRetainedIds/);
  assert.match(auditSource, /candidate\.latestSourceFileArchiveId/);
  assert.match(auditSource, /sourceFileClaimReviews/);
  assert.match(auditSource, /review\.sourceArchiveId/);
  assert.match(auditSource, /supersededArchiveIdsEligibleForCleanup/);
});

test("cleanup deletes superseded manifests with chunks, detects orphan chunks, and is idempotent", () => {
  assert.match(auditSource, /orphanedArchiveChunkKeys/);
  assert.match(auditSource, /manifestRecord\?\.chunkKeys/);
  assert.match(auditSource, /new Set\(\[\.\.\.manifestKeys, \.\.\.chunkKeys\]\)/);
  assert.match(auditSource, /filter\(\(id\) => retained\.has\(id\) \|\| id === candidate\.latestSourceFileArchiveId\)/);
});

test("future ingestion performs bounded retention only after new archive storage and logs outcomes", () => {
  const ingest = storeSource.slice(storeSource.indexOf("export async function ingestDossierSourceFileArchive"), storeSource.indexOf("export async function recordDossierSourceFileOpen"));
  assert.match(ingest, /saveSourceFileArchiveRecord/);
  assert.match(ingest, /await import\("@\/lib\/redis-capacity-audit"\)/);
  assert.match(ingest, /cleanupSupersededSourceFileArchives/);
  assert.match(ingest, /deduped/);
  assert.match(ingest, /created/);
  assert.match(ingest, /retention_eviction/);
  assert.match(ingest, /storage_capacity_exceeded/);
  assert.ok(ingest.indexOf("saveSourceFileArchiveRecord") < ingest.indexOf("cleanupSupersededSourceFileArchives"));
});

test("admin authentication protects audit and cleanup and UI requires analysis plus confirmation", () => {
  assert.match(routeSource, /verifyAdminToken/);
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /confirmation !== "CLEAN SUPERSEDED SOURCE FILE ARCHIVES"/);
  assert.match(uiSource, /Analyze Redis Storage/);
  assert.match(uiSource, /Clean Superseded Source File Archives/);
  assert.match(uiSource, /disabled=\{!analysis \|\| Boolean\(loading\)\}/);
  assert.match(uiSource, /window\.confirm/);
});

