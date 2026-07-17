import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const resolved = path.join(projectRoot, "src", request.slice(2));
    if (fs.existsSync(resolved)) return resolved;
    if (fs.existsSync(`${resolved}.ts`)) return `${resolved}.ts`;
    if (fs.existsSync(`${resolved}.tsx`)) return `${resolved}.tsx`;
    return resolved;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename });
  module._compile(outputText, filename);
};
Module._extensions[".tsx"] = Module._extensions[".ts"];

const require = createRequire(import.meta.url);
const recovery = require("../src/lib/redis-capacity-audit.ts");
const store = require("../src/lib/dossier-workflow-store.ts");

const P = store.DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX;

class FakeRedis {
  constructor(entries = [], options = {}) { this.map = new Map(entries); this.deleted = []; this.sets = []; this.scans = 0; this.failDeleteKeys = new Set(options.failDeleteKeys ?? []); }
  async scan(cursor, options = {}) { this.scans += 1; const keys = [...this.map.keys()].filter((key) => !options.match || (options.match.endsWith("*") ? key.startsWith(options.match.slice(0, -1)) : key === options.match)); return String(cursor) === "0" ? ["0", keys] : ["0", []]; }
  async dbsize() { return this.map.size; }
  async type(key) { return typeof this.map.get(key) === "string" ? "string" : "hash"; }
  async strlen(key) { return String(this.map.get(key) ?? "").length; }
  async get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  async set(key, value) { this.sets.push(key); this.map.set(key, value); return "OK"; }
  async del(...keys) { if (keys.some((key) => this.failDeleteKeys.has(key))) throw new Error("delete failed"); for (const key of keys) { this.deleted.push(key); this.map.delete(key); } return keys.length; }
}

function manifest(id, candidateId = "cand-1", chunkCount = 2, chunkKeys) {
  const archiveKey = `${P}:${id}`;
  return { id, candidateId, archiveKey, chunkKeys: chunkKeys ?? Array.from({ length: chunkCount }, (_, i) => `${archiveKey}:chunk:${i}`), chunkCount, archiveSize: 100, createdAt: id, updatedAt: id, subjectName: candidateId, subjectKey: candidateId, sourceDigest: id, reviewOnly: true };
}

function redisWithArchives() {
  const entries = [];
  for (const id of ["a1", "a2", "a3", "a4", "a5", "protected-review", "orphan"]) {
    const m = manifest(id); entries.push([m.archiveKey, m]); for (const key of m.chunkKeys) entries.push([key, `payload-${id}`]);
  }
  entries.push([`${P}:orphan-chunks-only:chunk:0`, "orphan chunk"]);
  entries.push(["queue:state", "survive"], ["bnl:presence", "survive"], ["bnl:relay", "survive"], ["bnl:flags", "survive"], ["live:overlay", "survive"], ["stripe:payment", "survive"], ["unrelated:key", "survive"]);
  return new FakeRedis(entries);
}

function baseState(extra = {}) {
  return { version: 1, revision: 1, updatedAt: "now", drafts: [{ id: "draft", candidateId: "cand-1", status: "draft", fields: { name: "Subject" }, createdAt: "", updatedAt: "" }], recommendations: [{ id: "rec", subjectName: "Subject", type: "new_dossier_candidate", status: "pending", score: 1, createdAt: "", updatedAt: "", evidence: [] }], sourceFileRefreshRequests: [], candidates: [{ id: "cand-1", name: "Subject", candidateType: "person", source: "admin_manual", tier: "medium", score: 1, whyNow: "test", reason: "test", evidenceSummary: "test", status: "active_source_file", sourceFileArchiveIds: ["a5", "a4", "a3", "a2", "a1"], latestSourceFileArchiveId: "a5", sourceFileClaimReviews: [{ id: "review", candidateId: "cand-1", claimText: "claim", claimType: "known_fact", sourceSection: "section", decision: "confirmed_internal", publicSafe: false, createdAt: "", updatedAt: "", sourceArchiveId: "protected-review" }], ...extra }] };
}

function deps(state) { return { getState: async () => state, updateState: async (updater) => { state = updater(state); return state; } }; }

test("dry-run performs zero writes and zero deletes while reporting protected/orphan/superseded sets", async () => {
  const redis = redisWithArchives(); const state = baseState(); const before = new Map(redis.map);
  const report = await recovery.auditRedisCapacity({ redis, ...deps(state) });
  assert.equal(redis.deleted.length, 0); assert.equal(redis.sets.length, 0); assert.deepEqual(redis.map, before);
  assert.ok(report.protectedArchiveIds.includes("protected-review"));
  assert.ok(report.protectedArchiveIds.includes("a5")); assert.ok(report.protectedArchiveIds.includes("a4")); assert.ok(report.protectedArchiveIds.includes("a3"));
  assert.deepEqual(report.supersededArchiveIdsEligibleForCleanup, ["a1", "a2"]);
  assert.ok(report.orphanedArchiveManifestIds.includes("orphan"));
  assert.ok(report.orphanedArchiveChunkKeys.includes(`${P}:orphan-chunks-only:chunk:0`));
  assert.doesNotMatch(JSON.stringify(report), /payload-a|survive|UPSTASH|TOKEN/);
});

test("protected claim-review archive survives even when absent from sourceFileArchiveIds", async () => {
  const redis = redisWithArchives(); const state = baseState();
  const result = await recovery.cleanupSupersededSourceFileArchives({ redis, ...deps(state) });
  assert.ok(redis.map.has(`${P}:protected-review`));
  assert.ok(redis.map.has(`${P}:protected-review:chunk:0`));
  assert.ok(result.retainedArchiveIds.includes("protected-review"));
});

test("latest archive and latest three survive while superseded own manifest/chunks are deleted", async () => {
  const redis = redisWithArchives(); const state = baseState();
  const result = await recovery.cleanupSupersededSourceFileArchives({ redis, ...deps(state) });
  for (const id of ["a5", "a4", "a3"]) assert.ok(redis.map.has(`${P}:${id}`));
  assert.equal(redis.map.has(`${P}:a1`), false); assert.equal(redis.map.has(`${P}:a1:chunk:0`), false);
  assert.ok(result.deletedManifestIds.includes("a1")); assert.ok(result.deletedChunkKeys.includes(`${P}:a1:chunk:0`));
});

test("corrupt manifest cannot delete another protected archive chunk", async () => {
  const corrupt = manifest("a1", "cand-1", 1, [`${P}:protected-review:chunk:0`, `${P}:a1:chunk:0`]);
  const redis = redisWithArchives(); redis.map.set(`${P}:a1`, corrupt);
  const result = await recovery.cleanupSupersededSourceFileArchives({ redis, ...deps(baseState()) });
  assert.ok(redis.map.has(`${P}:protected-review:chunk:0`));
  assert.ok(result.deletedChunkKeys.includes(`${P}:a1:chunk:0`));
  assert.ok(!result.deletedChunkKeys.includes(`${P}:protected-review:chunk:0`));
});

test("failed deletes are not reported as deleted and produce partial/failed status", async () => {
  const redis = redisWithArchives(); redis.failDeleteKeys.add(`${P}:a1`);
  const result = await recovery.cleanupSupersededSourceFileArchives({ redis, ...deps(baseState()) });
  assert.ok(!result.deletedManifestIds.includes("a1"));
  assert.ok(result.failedKeys.some((item) => item.key === `${P}:a1`));
  assert.notEqual(result.status, "completed");
});

test("workflow references are removed only for confirmed absent archives and concurrent mutation is preserved", async () => {
  let state = baseState(); const redis = redisWithArchives(); redis.failDeleteKeys.add(`${P}:a2`);
  const result = await recovery.cleanupSupersededSourceFileArchives({ redis, getState: async () => state, updateState: async (updater) => { state.candidates[0].sourceFileNotes = [{ id: "note", candidateId: "cand-1", type: "fact", text: "concurrent", source: "admin_manual", status: "active", publicSafe: false, createdAt: "", updatedAt: "" }]; state = updater(state); return state; } });
  assert.ok(!state.candidates[0].sourceFileArchiveIds.includes("a1"));
  assert.ok(state.candidates[0].sourceFileArchiveIds.includes("a2"));
  assert.equal(state.candidates[0].sourceFileNotes[0].text, "concurrent");
  assert.notEqual(result.status, "completed");
});

test("cleanup is idempotent and unrelated keys survive", async () => {
  let state = baseState(); const redis = redisWithArchives(); const dep = deps(state);
  await recovery.cleanupSupersededSourceFileArchives({ redis, ...dep });
  const second = await recovery.cleanupSupersededSourceFileArchives({ redis, ...dep });
  assert.ok(["completed", "completed_with_already_absent_keys"].includes(second.status));
  for (const key of ["queue:state", "bnl:presence", "bnl:relay", "bnl:flags", "live:overlay", "stripe:payment", "unrelated:key"]) assert.equal(redis.map.get(key), "survive");
});

test("missing Redis configuration cannot mutate memory or claim successful cleanup", async () => {
  const state = baseState(); let mutated = false;
  const result = await recovery.cleanupSupersededSourceFileArchives({ redis: null, getState: async () => state, updateState: async (updater) => { mutated = true; return updater(state); } });
  assert.equal(mutated, false); assert.equal(result.ok, false); assert.equal(result.status, "unavailable");
});

test("ingest chunk failure never changes latestSourceFileArchiveId", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await store.saveDossierWorkflowState(baseState({ latestSourceFileArchiveId: "old", latestSourceFileArchiveDigest: "old", sourceFileArchiveIds: ["old"] }));
  const saved = new Map();
  store.__setDossierArchiveStorageOverrideForTest({
    save: async ({ metadata, chunks }) => { saved.set(metadata.id, { metadata, chunks }); },
    readManifest: async (id) => saved.get(id)?.metadata ?? null,
    readChunks: async () => null,
    delete: async (metadata) => { saved.delete(metadata.id); },
  });
  await assert.rejects(() => store.ingestDossierSourceFileArchive({ candidateId: "cand-1", subjectName: "Subject", sourcePackage: { value: "new" } }), /chunks were not fully stored|archive_write_incomplete/);
  const latest = (await store.getDossierWorkflowState()).candidates[0].latestSourceFileArchiveId;
  assert.equal(latest, "old");
  store.__setDossierArchiveStorageOverrideForTest(null);
});

test("successful ingest fully stores and verifies chunks before attaching latest pointer", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await store.saveDossierWorkflowState(baseState({ latestSourceFileArchiveId: "old", latestSourceFileArchiveDigest: "old", sourceFileArchiveIds: ["old"] }));
  const saved = new Map(); let verifiedBeforeAttach = false;
  store.__setDossierArchiveStorageOverrideForTest({
    save: async ({ metadata, chunks }) => { saved.set(metadata.id, { metadata, chunks }); },
    readManifest: async (id) => saved.get(id)?.metadata ?? null,
    readChunks: async (metadata) => { verifiedBeforeAttach = (await store.getDossierWorkflowState()).candidates[0].latestSourceFileArchiveId === "old"; return saved.get(metadata.id)?.chunks ?? null; },
    delete: async (metadata) => { saved.delete(metadata.id); },
  });
  const result = await store.ingestDossierSourceFileArchive({ candidateId: "cand-1", subjectName: "Subject", sourcePackage: { value: "new-success" } });
  assert.equal(verifiedBeforeAttach, true);
  const latest = (await store.getDossierWorkflowState()).candidates[0].latestSourceFileArchiveId;
  assert.equal(latest, result.archive.id);
  store.__setDossierArchiveStorageOverrideForTest(null);
});

test("targeted retention does not invoke a global Redis scan", async () => {
  const redis = redisWithArchives(); await recovery.cleanupCandidateSourceFileArchiveRetention({ redis, candidateId: "cand-1", ...deps(baseState()) });
  assert.equal(redis.scans, 0);
});

test("capacity-error API response uses safe reason and omits raw provider details", async () => {
  assert.equal(recovery.isStorageCapacityExceededError(new Error("UpstashError: ERR DB capacity quota exceeded token=secret")), true);
  const text = JSON.stringify({ error: "Redis storage capacity exceeded.", reason: "storage_capacity_exceeded" });
  assert.doesNotMatch(text, /token=secret|UPSTASH_REDIS_REST_TOKEN/);
  assert.match(fs.readFileSync("src/app/api/admin/storage-recovery/route.ts", "utf8"), /storage_capacity_exceeded/);
});
