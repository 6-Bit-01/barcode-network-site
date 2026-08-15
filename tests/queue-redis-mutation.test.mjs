import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

class FakeRedis {
  static values = new Map();
  static calls = [];
  static failGets = false;
  static failAllCommands = false;
  static failOnConstruct = false;
  static getFailure = null;

  constructor() {
    if (FakeRedis.failOnConstruct) throw new Error("Redis client URL is invalid");
  }

  static quotaError() {
    return new Error("ERR max requests limit exceeded. Limit: 500000");
  }

  async get(key) {
    FakeRedis.calls.push(["get", key]);
    if (FakeRedis.getFailure) throw FakeRedis.getFailure;
    if (FakeRedis.failAllCommands || FakeRedis.failGets) throw FakeRedis.quotaError();
    return FakeRedis.values.get(key) ?? null;
  }

  async set(key, value, options = {}) {
    FakeRedis.calls.push(["set", key, options]);
    if (FakeRedis.failAllCommands) throw FakeRedis.quotaError();
    if (options.nx && FakeRedis.values.has(key)) return null;
    FakeRedis.values.set(key, value);
    return "OK";
  }

  async eval(script, keys, args) {
    FakeRedis.calls.push(["eval", keys]);
    if (FakeRedis.failAllCommands) throw FakeRedis.quotaError();
    if (script.includes("current_revision")) {
      const [lockKey, stateKey, revisionKey] = keys;
      const [token, expectedRevision, stateJson, nextRevision] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentRevision = FakeRedis.values.get(revisionKey);
      if (currentRevision !== undefined && Number(currentRevision) !== Number(expectedRevision)) return -2;
      FakeRedis.values.set(stateKey, stateJson);
      FakeRedis.values.set(revisionKey, nextRevision);
      return Number(nextRevision);
    }
    const [lockKey] = keys;
    const [token] = args;
    if (FakeRedis.values.get(lockKey) === token) {
      FakeRedis.values.delete(lockKey);
      return 1;
    }
    return 0;
  }
}

class FakeBlob {
  static values = new Map();
  static calls = [];
  static failPuts = false;

  static async put(pathname, body, options = {}) {
    FakeBlob.calls.push(["put", pathname, options]);
    if (FakeBlob.failPuts) throw new Error("Blob snapshot write failed");
    const text = typeof body === "string" ? body : Buffer.from(body).toString("utf8");
    const stored = {
      body: text,
      pathname,
      uploadedAt: new Date(),
      etag: `etag-${FakeBlob.calls.length}`,
    };
    FakeBlob.values.set(pathname, stored);
    return {
      url: `https://blob.example.test/${pathname}`,
      downloadUrl: `https://blob.example.test/${pathname}?download=1`,
      pathname,
      contentType: options.contentType ?? "application/octet-stream",
      contentDisposition: "inline",
      etag: stored.etag,
    };
  }

  static async get(pathname, options = {}) {
    FakeBlob.calls.push(["get", pathname, options]);
    const stored = FakeBlob.values.get(pathname);
    if (!stored) return null;
    const body = new TextEncoder().encode(stored.body);
    return {
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(body);
          controller.close();
        },
      }),
      headers: new Headers({ "content-type": "application/json" }),
      blob: {
        url: `https://blob.example.test/${pathname}`,
        downloadUrl: `https://blob.example.test/${pathname}?download=1`,
        pathname,
        contentDisposition: "inline",
        cacheControl: "max-age=60",
        uploadedAt: stored.uploadedAt,
        etag: stored.etag,
        contentType: "application/json",
        size: body.byteLength,
      },
    };
  }

  static async list(options = {}) {
    FakeBlob.calls.push(["list", options]);
    const prefix = options.prefix ?? "";
    const blobs = [...FakeBlob.values.values()]
      .filter((stored) => stored.pathname.startsWith(prefix))
      .map((stored) => ({
        url: `https://blob.example.test/${stored.pathname}`,
        downloadUrl: `https://blob.example.test/${stored.pathname}?download=1`,
        pathname: stored.pathname,
        size: Buffer.byteLength(stored.body),
        uploadedAt: stored.uploadedAt,
        etag: stored.etag,
      }));
    return { blobs, hasMore: false };
  }

  static async del(pathname) {
    FakeBlob.calls.push(["del", pathname]);
    FakeBlob.values.delete(pathname);
  }
}

function installTypeScriptLoader() {
  const originalExtension = Module._extensions[".ts"];
  Module._extensions[".ts"] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
  return () => { Module._extensions[".ts"] = originalExtension; };
}

function loadIndependentQueueModules() {
  const originalLoad = Module._load;
  const restoreExtension = installTypeScriptLoader();
  Module._load = function loadWithFakeRedis(request, parent, isMain) {
    if (request === "@upstash/redis") return { Redis: FakeRedis };
    if (request === "@vercel/blob") {
      return {
        del: FakeBlob.del.bind(FakeBlob),
        get: FakeBlob.get.bind(FakeBlob),
        list: FakeBlob.list.bind(FakeBlob),
        put: FakeBlob.put.bind(FakeBlob),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const queuePath = require.resolve(path.join(projectRoot, "src/lib/queue.ts"));
    const durablePath = require.resolve(path.join(projectRoot, "src/lib/queue-durable-snapshot.ts"));
    delete require.cache[queuePath];
    delete require.cache[durablePath];
    const first = require(queuePath);
    delete require.cache[queuePath];
    delete require.cache[durablePath];
    const second = require(queuePath);
    return { first, second };
  } finally {
    Module._load = originalLoad;
    restoreExtension();
  }
}

function legacyEntry(index, overrides = {}) {
  return {
    artist: `Redis Prefill Artist ${index}`,
    title: `Redis Prefill Track ${index}`,
    tiktokHandle: `@redisprefill${index}`,
    link: `https://example.com/redis-prefill-${index}`,
    sourceType: "other",
    tier: "free",
    lane: "regular",
    amount: 0,
    createdAt: new Date(Date.UTC(2026, 7, 8, 0, 0, index)).toISOString(),
    ...overrides,
  };
}

function submission(index, overrides = {}) {
  return {
    artist: `Redis Artist ${index}`,
    title: `Redis Track ${index}`,
    tiktokHandle: `@redisartist${index}`,
    link: `https://example.com/redis-track-${index}`,
    sourceType: "other",
    ...overrides,
  };
}

function projectionCapture(states, sourceActiveSessionId) {
  const capturedAt = "2026-08-15T20:00:00.000Z";
  const sessions = states.map((state) => {
    const raw = Buffer.from(JSON.stringify(state), "utf8");
    return {
      showDate: state.session.showDate,
      sessionId: state.session.sessionId,
      revision: state.revision,
      sourceResponseSha256: createHash("sha256").update(raw).digest("hex"),
      sourceResponseBytes: raw.byteLength,
      sourceResponseBase64: raw.toString("base64"),
      summaryAtStart: {
        sessionId: state.session.sessionId,
        showDate: state.session.showDate,
        status: state.session.status,
        purpose: state.session.purpose,
        bnlPublicationStatus: state.session.bnlPublicationStatus,
        createdAt: state.session.createdAt,
        updatedAt: state.session.updatedAt,
      },
    };
  });
  return {
    schema: "barcode_queue_two_session_source_capture_v1",
    capturedAt,
    source: {
      baseUrl: "https://barcode-network-site-cpps-fg7a9jcmf-6-bits-projects.vercel.app",
      expectedGitCommit: "a1537f611db69e5a1c3d74ebb941d06d68ad49ff",
      route: "/api/admin/queue",
      captureKind: "authenticated_admin_logical_session_state",
      canonicalRawRedis: false,
      remoteMutationRequests: 0,
      automaticRetries: 0,
      redirectsFollowed: 0,
    },
    scope: {
      exactShowDates: ["2026-08-07", "2026-08-14"],
      sessionCount: 2,
    },
    consistency: {
      captureStartedAt: "2026-08-15T19:59:00.000Z",
      captureFinishedAt: capturedAt,
      revision: states[0].revision,
      activeSessionId: sourceActiveSessionId,
      rosterCount: 2,
      rosterSha256: "a".repeat(64),
      startSentinelResponseSha256: "b".repeat(64),
      startSentinelResponseBytes: 1,
      endSentinelResponseSha256: "c".repeat(64),
      endSentinelResponseBytes: 1,
      startEndMatch: true,
    },
    sessions,
  };
}

function resetQueueTestState() {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeRedis.failGets = false;
  FakeRedis.failAllCommands = false;
  FakeRedis.failOnConstruct = false;
  FakeRedis.getFailure = null;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  FakeBlob.failPuts = false;
}

test("Redis fencing serializes independent queue workers without overfill, lost writes, or duplicate acceptance", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeRedis.failGets = false;
  FakeRedis.failAllCommands = false;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first, second } = loadIndependentQueueModules();

  await first.setQueueOpen(false);
  await first.startNewQueueSession({
    title: "Redis atomic capacity",
    queueCapacity: 44,
    trackLimitPerArtist: 3,
    submissionCooldownSeconds: 0,
  });
  await first.setQueueOpen(true);
  for (let index = 1; index <= 42; index += 1) await first.addToQueue(legacyEntry(index));

  let attempts = await Promise.allSettled([
    first.submitRadioTrack(submission(43)),
    second.submitRadioTrack(submission(44)),
    first.submitRadioTrack(submission(45)),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  assert.match(String(attempts.find((result) => result.status === "rejected").reason), /full/i);

  let state = await second.getRadioQueueState();
  const acceptedIds = new Set([
    ...state.queue.map((entry) => entry.id),
    ...(state.nextInLine ? [state.nextInLine.id] : []),
    ...(state.loadedTrack ? [state.loadedTrack.id] : []),
    ...state.history.map((entry) => entry.id),
  ]);
  assert.equal(acceptedIds.size, 44);
  assert.equal(state.session.acceptedCount, 44);
  assert.equal(state.session.submissionClosureReason, "capacity");

  await second.setQueueOpen(false);
  await second.startNewQueueSession({
    title: "Redis atomic duplicate",
    queueCapacity: 44,
    trackLimitPerArtist: 3,
    submissionCooldownSeconds: 0,
  });
  await second.setQueueOpen(true);
  const duplicate = submission(100, {
    artist: "Redis Collision Artist",
    title: "Redis Collision Track",
    tiktokHandle: "@rediscollision",
    link: "https://example.com/redis-collision",
  });
  attempts = await Promise.allSettled([
    first.submitRadioTrack(duplicate),
    second.submitRadioTrack(duplicate),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  assert.match(String(attempts.find((result) => result.status === "rejected").reason), /duplicate/i);

  state = await first.getRadioQueueState();
  assert.equal(state.session.acceptedCount, 1);
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), state.revision);
  assert.ok(FakeRedis.calls.some(([operation, keys]) => operation === "eval" && keys?.includes("radioQueue:v2:sessions:mutation-revision")));

  const stateKey = "radioQueue:v2:sessions";
  const unfencedState = JSON.parse(FakeRedis.values.get(stateKey));
  delete unfencedState.revision;
  FakeRedis.values.set(stateKey, JSON.stringify(unfencedState));
  await assert.rejects(() => second.setQueueOpen(false), /revision is inconsistent/i);
});

test("read-only queue snapshots retain the last confirmed Redis state while quota errors still block mutations", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeRedis.failGets = false;
  FakeRedis.failAllCommands = false;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://quota-locked-redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first } = loadIndependentQueueModules();

  await first.startNewQueueSession({
    title: "Preserved live queue",
    queueCapacity: 44,
    trackLimitPerArtist: 3,
    submissionCooldownSeconds: 0,
  });
  await first.setQueueOpen(true);
  await first.addToQueue(legacyEntry(1));

  const confirmed = await first.getRadioQueueState();
  assert.equal(confirmed.session.title, "Preserved live queue");
  assert.equal(confirmed.queue.length, 1);

  FakeRedis.failGets = true;
  const retained = await first.getRadioQueueState();
  assert.equal(retained.session.sessionId, confirmed.session.sessionId);
  assert.deepEqual(retained.queue.map((entry) => entry.id), confirmed.queue.map((entry) => entry.id));
  await assert.rejects(() => first.setQueueOpen(false), /max requests limit exceeded/i);
  FakeRedis.failGets = false;
  FakeRedis.failAllCommands = false;
});

test("a fresh worker preserves and displays the complete queue from private Blob during the exact Upstash quota lock", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeRedis.failGets = false;
  FakeRedis.failAllCommands = false;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  FakeBlob.failPuts = false;
  process.env.UPSTASH_REDIS_REST_URL = "https://enabled-poodle-4219.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first } = loadIndependentQueueModules();
    await first.startNewQueueSession({
      title: "BARCODE live disaster recovery",
      queueCapacity: 44,
      trackLimitPerArtist: 3,
      submissionCooldownSeconds: 0,
    });
    await first.setQueueOpen(true);
    await first.addToQueue(legacyEntry(1, {
      link: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      sourceType: "spotify",
      contactEmail: "link-submitter@example.com",
    }));
    await first.addToQueue(legacyEntry(2, {
      link: "https://unit.private.blob.vercel-storage.com/barcode-radio-queue/recovery-proof.mp3",
      fileUrl: "https://unit.private.blob.vercel-storage.com/barcode-radio-queue/recovery-proof.mp3",
      fileName: "Recovery Artist - Recovery Proof.mp3",
      fileSize: 4_096,
      mimeType: "audio/mpeg",
      sourceType: "upload",
      contactEmail: "upload-submitter@example.com",
    }));

    const confirmed = await first.getRadioQueueState();
    const expectedIds = [
      ...(confirmed.nextInLine ? [confirmed.nextInLine.id] : []),
      ...confirmed.queue.map((entry) => entry.id),
    ];
    const currentPath = "barcode-radio-queue-state/v1/current.json";
    assert.ok(FakeBlob.values.has(currentPath), "a private current queue snapshot must exist");
    assert.ok(
      [...FakeBlob.values.keys()].some((pathname) => pathname.startsWith("barcode-radio-queue-state/v1/revisions/")),
      "an immutable revision snapshot must exist",
    );

    // Simulate a new Vercel process with no in-memory cache after Upstash locks
    // every Redis command at the same 500,000-command quota seen in production.
    const { first: freshWorker } = loadIndependentQueueModules();
    FakeRedis.calls.length = 0;
    const healthyReadModel = await freshWorker.getRadioQueueState();
    assert.equal(healthyReadModel.revision, confirmed.revision);
    assert.equal(FakeRedis.calls.length, 0, "healthy polling must read the durable model without spending Redis commands");
    FakeRedis.failAllCommands = true;
    const recovered = await freshWorker.getRadioQueueState();
    const recoveredIds = [
      ...(recovered.nextInLine ? [recovered.nextInLine.id] : []),
      ...recovered.queue.map((entry) => entry.id),
    ];
    assert.equal(recovered.revision, confirmed.revision);
    assert.equal(recovered.session.sessionId, confirmed.session.sessionId);
    assert.equal(recovered.session.title, "BARCODE live disaster recovery");
    assert.deepEqual(recoveredIds, expectedIds);
    assert.equal(recovered.session.acceptedCount, 2);
    const recoveredEntries = [recovered.nextInLine, ...recovered.queue].filter(Boolean);
    assert.deepEqual(recoveredEntries.map((entry) => entry.sourceType).sort(), ["spotify", "upload"]);
    assert.equal(recoveredEntries.find((entry) => entry.sourceType === "spotify")?.contactEmail, "link-submitter@example.com");
    assert.equal(recoveredEntries.find((entry) => entry.sourceType === "upload")?.fileName, "Recovery Artist - Recovery Proof.mp3");
    assert.equal(recoveredEntries.find((entry) => entry.sourceType === "upload")?.fileSize, 4_096);

    const recoveryStatus = await freshWorker.getQueueRecoveryStatus();
    assert.equal(recoveryStatus.redis.failureReason, "request_quota_exceeded");
    assert.equal(recoveryStatus.redis.failureStage, "state_read");
    assert.match(recoveryStatus.redis.failureDetail, /max requests limit exceeded/i);

    const snapshotBeforeBlockedMutation = FakeBlob.values.get(currentPath).body;
    await assert.rejects(
      () => freshWorker.setQueueOpen(false),
      /max requests limit exceeded\. Limit: 500000/i,
    );
    assert.equal(FakeBlob.values.get(currentPath).body, snapshotBeforeBlockedMutation);

    // A corrupt current pointer must not erase the queue: a second fresh worker
    // verifies and restores the latest immutable revision object.
    FakeBlob.values.get(currentPath).body = "{corrupt";
    const { first: recoveryWorker } = loadIndependentQueueModules();
    const recoveredFromRevision = await recoveryWorker.getRadioQueueState();
    assert.equal(recoveredFromRevision.revision, confirmed.revision);
    assert.deepEqual(
      [
        ...(recoveredFromRevision.nextInLine ? [recoveredFromRevision.nextInLine.id] : []),
        ...recoveredFromRevision.queue.map((entry) => entry.id),
      ],
      expectedIds,
    );
  } finally {
    FakeRedis.failGets = false;
    FakeRedis.failAllCommands = false;
    FakeRedis.getFailure = null;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
  }
});

test("a failed durable snapshot rolls the fenced Redis mutation back instead of creating an unprotected queue change", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeRedis.failGets = false;
  FakeRedis.failAllCommands = false;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  FakeBlob.failPuts = true;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first } = loadIndependentQueueModules();
    await assert.rejects(
      () => first.startNewQueueSession({ title: "Must not commit without recovery copy" }),
      /Blob snapshot write failed/,
    );
    assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 0);
    const stored = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
    assert.equal(stored.revision, 0);
    assert.notEqual(stored.sessions[0].title, "Must not commit without recovery copy");
    assert.ok(
      FakeRedis.calls.filter(([operation, keys]) => operation === "eval" && keys?.includes("radioQueue:v2:sessions:mutation-revision")).length >= 2,
      "the fenced commit must be followed by a fenced rollback",
    );
  } finally {
    FakeBlob.failPuts = false;
    FakeRedis.failGets = false;
    FakeRedis.failAllCommands = false;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
  }
});

test("the reviewed restore dry-runs and copies a verified snapshot into an empty dedicated queue Redis", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeRedis.failGets = false;
  FakeRedis.failAllCommands = false;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  FakeBlob.failPuts = false;
  process.env.UPSTASH_REDIS_REST_URL = "https://old-shared-redis.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "old-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: oldWorker } = loadIndependentQueueModules();
    await oldWorker.startNewQueueSession({ title: "Queue to migrate", submissionCooldownSeconds: 0 });
    await oldWorker.setQueueOpen(true);
    await oldWorker.addToQueue(legacyEntry(1));
    const original = await oldWorker.getRadioQueueState();

    FakeRedis.values.clear();
    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-redis.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-token";
    const { first: recoveryWorker } = loadIndependentQueueModules();

    const statusBefore = await recoveryWorker.getQueueRecoveryStatus();
    assert.equal(statusBefore.alignment, "durable_only");
    assert.equal(statusBefore.durable.revision, original.revision);
    assert.equal(statusBefore.redis.dedicated, true);
    assert.equal(statusBefore.redis.revision, 0);
    await assert.rejects(
      () => recoveryWorker.setQueueOpen(false),
      /durable queue revision .* is ahead of Redis revision 0/i,
    );
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);

    const dryRun = await recoveryWorker.restoreQueueFromDurableSnapshot({ dryRun: true });
    assert.equal(dryRun.restored, false);
    assert.equal(dryRun.revision, original.revision);
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
    await assert.rejects(
      () => recoveryWorker.restoreQueueFromDurableSnapshot({ dryRun: false, confirmation: "RESTORE" }),
      /must exactly match/,
    );

    const restored = await recoveryWorker.restoreQueueFromDurableSnapshot({
      dryRun: false,
      confirmation: `RESTORE DURABLE QUEUE REVISION ${original.revision}`,
    });
    assert.equal(restored.restored, true);
    assert.equal(restored.activeSessionId, original.session.sessionId);
    const stored = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
    assert.equal(stored.revision, original.revision);
    assert.equal(stored.activeSessionId, original.session.sessionId);
    const statusAfter = await recoveryWorker.getQueueRecoveryStatus();
    assert.equal(statusAfter.alignment, "aligned");
  } finally {
    FakeRedis.failGets = false;
    FakeRedis.failAllCommands = false;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
  }
});

test("the guarded historical import moves only the archived August 7 and August 14 live sessions into aligned dedicated Redis and Blob", async () => {
  resetQueueTestState();
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-bnl.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "shared-bnl-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: sourceWorker } = loadIndependentQueueModules();

    let august7 = await sourceWorker.startNewQueueSession({
      title: "BARCODE Radio — August 7 live broadcast",
      showDate: "2026-08-07",
      purpose: "unknown",
      submissionCooldownSeconds: 0,
    });
    await sourceWorker.setQueueOpen(true);
    await sourceWorker.addToQueue(legacyEntry(7, { artist: "August Seven Artist" }));
    await sourceWorker.archiveCurrentQueueSession();
    const august7SessionId = august7.session.sessionId;

    let august14 = await sourceWorker.startNewQueueSession({
      title: "BARCODE Radio — August 14 live broadcast",
      showDate: "2026-08-14",
      purpose: "live_broadcast",
      submissionCooldownSeconds: 0,
    });
    await sourceWorker.setQueueOpen(true);
    await sourceWorker.addToQueue(legacyEntry(14, { artist: "August Fourteen Artist" }));
    await sourceWorker.archiveCurrentQueueSession();
    const august14SessionId = august14.session.sessionId;
    august7 = await sourceWorker.getRadioQueueState(august7SessionId);
    august14 = await sourceWorker.getRadioQueueState(august14SessionId);

    assert.equal(august7.session.status, "archived");
    assert.equal(august14.session.status, "archived");
    assert.equal(august7.revision, august14.revision);
    const capture = projectionCapture([august7, august14], august14.session.sessionId);

    // Switch to a brand-new queue-only database and a brand-new recovery epoch.
    FakeRedis.values.clear();
    FakeBlob.values.clear();
    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-queue-token";
    const { first: destinationWorker } = loadIndependentQueueModules();

    await destinationWorker.getRadioQueueState();
    const restored = await destinationWorker.restoreQueueFromDurableSnapshot({
      dryRun: false,
      confirmation: "RESTORE DURABLE QUEUE REVISION 0",
    });
    assert.equal(restored.restored, true);
    assert.equal(restored.revision, 0);

    const dryRun = await destinationWorker.importHistoricalQueueSessions({ capture, dryRun: true });
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.imported, false);
    assert.equal(dryRun.currentRevision, 0);
    assert.equal(dryRun.targetRevision, 1);
    assert.deepEqual(dryRun.sessions.map((session) => session.showDate).sort(), ["2026-08-07", "2026-08-14"]);
    assert.equal(dryRun.activeSessionId, august14.session.sessionId);
    assert.equal(dryRun.activeSessionSelection, "source_active_session");
    assert.match(dryRun.requiredConfirmation, /^IMPORT 2 HISTORICAL QUEUE SESSIONS [a-f0-9]{64} INTO REVISION 0$/);

    const redisBeforeWrongConfirmation = FakeRedis.values.get("radioQueue:v2:sessions");
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({
        capture,
        dryRun: false,
        confirmation: "IMPORT THE WRONG DATA",
      }),
      /confirmation must exactly match/i,
    );
    assert.equal(FakeRedis.values.get("radioQueue:v2:sessions"), redisBeforeWrongConfirmation);
    assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 0);

    const imported = await destinationWorker.importHistoricalQueueSessions({
      capture,
      dryRun: false,
      confirmation: dryRun.requiredConfirmation,
    });
    assert.equal(imported.imported, true);
    assert.equal(imported.alreadyPresent, false);
    assert.equal(imported.targetRevision, 1);

    const stored = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
    assert.equal(stored.revision, 1);
    assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 1);
    assert.equal(stored.sessions.length, 2);
    assert.deepEqual(stored.sessions.map((session) => session.showDate).sort(), ["2026-08-07", "2026-08-14"]);
    assert.ok(stored.sessions.every((session) => session.status === "archived" && session.queueOpen === false));
    assert.ok(stored.sessions.some((session) => session.queue.some((entry) => entry.artist === "August Seven Artist")));
    assert.ok(stored.sessions.some((session) => session.queue.some((entry) => entry.artist === "August Fourteen Artist")));

    const status = await destinationWorker.getQueueRecoveryStatus();
    assert.equal(status.alignment, "aligned");
    assert.equal(status.redis.dedicated, true);
    assert.equal(status.redis.isolatedFromShared, true);
    assert.equal(status.redis.revision, 1);
    assert.equal(status.durable.revision, 1);
    assert.equal(status.redis.sessionCount, 2);
    assert.equal(status.durable.sessionCount, 2);

    const fromBlob = await destinationWorker.getRadioQueueState(august7.session.sessionId);
    assert.equal(fromBlob.session.showDate, "2026-08-07");
    assert.ok(fromBlob.queue.some((entry) => entry.artist === "August Seven Artist"));

    const retry = await destinationWorker.importHistoricalQueueSessions({ capture, dryRun: false });
    assert.equal(retry.imported, false);
    assert.equal(retry.alreadyPresent, true);
    assert.equal(retry.targetRevision, 1);
  } finally {
    resetQueueTestState();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("historical import refuses the shared BNL endpoint and rolls Redis back if the durable revision cannot be written", async () => {
  resetQueueTestState();
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-bnl.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "shared-bnl-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: sourceWorker } = loadIndependentQueueModules();
    let august7 = await sourceWorker.startNewQueueSession({ title: "August 7", showDate: "2026-08-07", purpose: "unknown" });
    await sourceWorker.archiveCurrentQueueSession();
    const august7SessionId = august7.session.sessionId;
    let august14 = await sourceWorker.startNewQueueSession({ title: "August 14", showDate: "2026-08-14", purpose: "live_broadcast" });
    await sourceWorker.archiveCurrentQueueSession();
    const august14SessionId = august14.session.sessionId;
    august7 = await sourceWorker.getRadioQueueState(august7SessionId);
    august14 = await sourceWorker.getRadioQueueState(august14SessionId);
    const capture = projectionCapture([august7, august14], august14.session.sessionId);

    FakeRedis.values.clear();
    FakeBlob.values.clear();
    process.env.QUEUE_REDIS_REST_URL = "https://shared-bnl.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "another-token-for-the-same-endpoint";
    const { first: unsafeDestinationWorker } = loadIndependentQueueModules();
    const unsafeStatus = await unsafeDestinationWorker.getQueueRecoveryStatus();
    assert.equal(unsafeStatus.redis.dedicated, true);
    assert.equal(unsafeStatus.redis.isolatedFromShared, false);
    await assert.rejects(
      () => unsafeDestinationWorker.importHistoricalQueueSessions({ capture, dryRun: true }),
      /same endpoint|shared.*endpoint|different Redis endpoint|distinct/i,
    );
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);

    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-queue-token";
    const { first: destinationWorker } = loadIndependentQueueModules();
    await destinationWorker.getRadioQueueState();
    await destinationWorker.restoreQueueFromDurableSnapshot({
      dryRun: false,
      confirmation: "RESTORE DURABLE QUEUE REVISION 0",
    });
    const dryRun = await destinationWorker.importHistoricalQueueSessions({ capture, dryRun: true });
    const redisBefore = FakeRedis.values.get("radioQueue:v2:sessions");

    FakeBlob.failPuts = true;
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({
        capture,
        dryRun: false,
        confirmation: dryRun.requiredConfirmation,
      }),
      /Blob snapshot write failed/,
    );
    assert.equal(FakeRedis.values.get("radioQueue:v2:sessions"), redisBefore);
    assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 0);
  } finally {
    resetQueueTestState();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("recovery diagnostics report a partial dedicated Redis configuration without throwing or mutating", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://old-shared-redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "old-token";
  process.env.QUEUE_REDIS_REST_URL = "https://incomplete-owned-queue.example.test";
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: recoveryWorker } = loadIndependentQueueModules();
    const status = await recoveryWorker.getQueueRecoveryStatus();

    assert.equal(status.alignment, "unavailable");
    assert.equal(status.durable.failureReason, "not_configured");
    assert.equal(status.redis.configured, true);
    assert.equal(status.redis.configurationStatus, "partial_dedicated");
    assert.equal(status.redis.available, false);
    assert.equal(status.redis.failureReason, "configuration_error");
    assert.equal(status.redis.failureStage, "configuration");
    assert.equal(FakeRedis.calls.length, 0, "a partial configuration must not issue Redis commands");
  } finally {
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
  }
});

test("recovery diagnostics report a partial shared Redis fallback without throwing or mutating", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://incomplete-shared-redis.example.test";
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: recoveryWorker } = loadIndependentQueueModules();
    const status = await recoveryWorker.getQueueRecoveryStatus();

    assert.equal(status.redis.configured, true);
    assert.equal(status.redis.configurationStatus, "partial_shared");
    assert.equal(status.redis.available, false);
    assert.equal(status.redis.failureReason, "configuration_error");
    assert.equal(status.redis.failureStage, "configuration");
    assert.equal(FakeRedis.calls.length, 0, "a partial shared fallback must not issue Redis commands");
  } finally {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("recovery diagnostics catch Redis client construction failures without touching queue state", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  FakeRedis.failOnConstruct = true;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://malformed-at-runtime.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "configured-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: recoveryWorker } = loadIndependentQueueModules();
    const status = await recoveryWorker.getQueueRecoveryStatus();

    assert.equal(status.redis.configurationStatus, "shared_fallback");
    assert.equal(status.redis.available, false);
    assert.equal(status.redis.failureReason, "configuration_error");
    assert.equal(status.redis.failureStage, "client_initialization");
    assert.equal(status.redis.failureDetail, "Redis client URL is invalid");
    assert.equal(FakeRedis.calls.length, 0, "client construction failure must issue no commands");
    assert.equal(FakeRedis.values.size, 0, "client construction failure must not mutate Redis state");
  } finally {
    FakeRedis.failOnConstruct = false;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("recovery diagnostics identify a rejected Redis credential without exposing it or mutating state", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  FakeRedis.getFailure = new Error("WRONGPASS invalid or expired token for https://private-redis.example.test");
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://private-redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "credential-that-must-never-appear-in-diagnostics";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: recoveryWorker } = loadIndependentQueueModules();
    const status = await recoveryWorker.getQueueRecoveryStatus();

    assert.equal(status.redis.configurationStatus, "shared_fallback");
    assert.equal(status.redis.available, false);
    assert.equal(status.redis.failureReason, "authentication_failed");
    assert.equal(status.redis.failureStage, "state_read");
    assert.match(status.redis.failureDetail, /WRONGPASS invalid or expired token/i);
    assert.match(status.redis.failureDetail, /\[redacted-endpoint\]/);
    assert.doesNotMatch(status.redis.failureDetail, /private-redis\.example\.test|credential-that-must-never/i);
    assert.equal(FakeRedis.values.size, 0, "credential diagnostics must not mutate Redis state");
  } finally {
    FakeRedis.getFailure = null;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});
