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

  async mget(...keys) {
    FakeRedis.calls.push(["mget", keys]);
    if (FakeRedis.getFailure) throw FakeRedis.getFailure;
    if (FakeRedis.failAllCommands || FakeRedis.failGets) throw FakeRedis.quotaError();
    return keys.map((key) => FakeRedis.values.get(key) ?? null);
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
      const [lockKey, stateKey, revisionKey, liveStateKey] = keys;
      const [token, expectedRevision, stateJson, nextRevision, liveStateJson] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentRevision = FakeRedis.values.get(revisionKey);
      if (currentRevision !== undefined && Number(currentRevision) !== Number(expectedRevision)) return -2;
      FakeRedis.values.set(stateKey, stateJson);
      FakeRedis.values.set(revisionKey, nextRevision);
      if (liveStateKey && liveStateJson) FakeRedis.values.set(liveStateKey, liveStateJson);
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
  static putGate = null;

  static async put(pathname, body, options = {}) {
    FakeBlob.calls.push(["put", pathname, options]);
    if (FakeBlob.putGate) await FakeBlob.putGate.promise;
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

const historicalAugust7SessionId = "session_msjmzqjk_w1rkj";
const historicalAugust7ExportSha256 = "49c950556a9662f98fa402beb84a7e579120afff8da9cc5c70077f4b46cd6c2e";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function historicalRosterIdentity(summary) {
  return Object.fromEntries([
    "sessionId",
    "title",
    "status",
    "purpose",
    "bnlPublicationStatus",
    "showDate",
    "createdAt",
    "updatedAt",
  ].map((field) => [field, summary[field]]));
}

function historicalTrack(index, overrides = {}) {
  return {
    id: `historical-track-${String(index).padStart(2, "0")}`,
    ...legacyEntry(index, {
      createdAt: `2026-08-08T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
      status: "played",
      playedAt: `2026-08-08T${String(index % 24).padStart(2, "0")}:30:00.000Z`,
      isTestTrack: false,
    }),
    ...overrides,
  };
}

function historicalProjectionState(baseState, {
  canonicalShowDate,
  sessionId,
  sourceShowDate,
  sourceStatus,
}) {
  const state = structuredClone(baseState);
  const august7 = canonicalShowDate === "2026-08-07";
  const createdAt = august7 ? "2026-08-08T01:00:00.000Z" : "2026-08-14T19:00:00.000Z";
  const history = august7
    ? Array.from({ length: 40 }, (_, index) => historicalTrack(index + 1))
    : [];
  const removed = august7
    ? [historicalTrack(41, {
      artist: "MagicSZN",
      title: "HighFive",
      status: "removed",
      playedAt: null,
      removedAt: "2026-08-08T04:00:00.000Z",
    })]
    : [];
  const queue = august7
    ? []
    : [historicalTrack(100, {
      artist: "August Fourteen Artist",
      title: "August Fourteen Live Track",
      createdAt: "2026-08-14T20:00:00.000Z",
      playedAt: null,
      status: "queued",
    })];

  state.revision = 73;
  state.viewedSessionId = sessionId;
  state.queue = queue;
  state.history = history;
  state.removed = removed;
  state.spotlight = [];
  state.nextInLine = null;
  state.loadedTrack = null;
  state.nowPlaying = null;
  state.totalPlayed = history.length;
  state.session = {
    ...state.session,
    sessionId,
    title: august7 ? "BARCODE Radio — August 7 live broadcast" : "BARCODE Radio — August 14 live broadcast",
    showDate: sourceShowDate,
    status: sourceStatus,
    purpose: august7 ? "unknown" : "live_broadcast",
    bnlPublicationStatus: "private",
    createdAt,
    updatedAt: "2026-08-15T18:00:00.000Z",
    queueOpen: sourceStatus === "open",
    submissionClosureReason: sourceStatus === "open" ? null : "manual",
    showStarted: sourceStatus === "open",
    broadcastStartedAt: sourceStatus === "open" ? "2026-08-14T21:00:00.000Z" : null,
    broadcastPhase: sourceStatus === "open" ? "live" : "ended",
    nextInLineTrackId: null,
    loadedTrackId: null,
    activeCount: queue.length,
    acceptedCount: queue.length + history.length,
    completedCount: history.length,
    removedCount: removed.length,
    spotlightCount: 0,
  };
  return state;
}

async function historicalCaptureFixture(sourceWorker, {
  august7Status = "closed",
  august14Status = "open",
} = {}) {
  const baseState = await sourceWorker.startNewQueueSession({
    title: "Historical fixture base",
    showDate: "2026-08-14",
    purpose: "live_broadcast",
  });
  const august7 = historicalProjectionState(baseState, {
    canonicalShowDate: "2026-08-07",
    sessionId: historicalAugust7SessionId,
    sourceShowDate: "2026-08-08",
    sourceStatus: august7Status,
  });
  const august14 = historicalProjectionState(baseState, {
    canonicalShowDate: "2026-08-14",
    sessionId: "session_august14_live_verified",
    sourceShowDate: "2026-08-14",
    sourceStatus: august14Status,
  });
  const roster = [
    historicalRosterIdentity(august7.session),
    historicalRosterIdentity(august14.session),
  ];
  august7.sessions = structuredClone(roster);
  august14.sessions = structuredClone(roster);
  return {
    august7,
    august14,
    capture: projectionCapture([
      { canonicalShowDate: "2026-08-07", state: august7 },
      { canonicalShowDate: "2026-08-14", state: august14 },
    ], august7.session.sessionId),
  };
}

function capturedTrackCounts(state) {
  const primary = [
    ...state.queue,
    ...state.history,
    ...state.removed,
    ...(state.nextInLine ? [state.nextInLine] : []),
    ...(state.loadedTrack ? [state.loadedTrack] : []),
  ];
  const isSimulation = (entry) => entry.isTestTrack === true
    || entry.note?.includes("[QUEUE SIMULATION TRACK]")
    || entry.artist.startsWith("SIM ")
    || entry.title.startsWith("SIM ");
  const removedIds = new Set(state.removed.map((entry) => entry.id));
  const acceptedIds = new Set();
  const countAccepted = (entry, allowedStatuses) => {
    if (!entry || removedIds.has(entry.id) || isSimulation(entry)) return;
    if (allowedStatuses.includes(entry.status)) acceptedIds.add(entry.id);
  };
  state.queue.forEach((entry) => countAccepted(entry, ["queued", "playing"]));
  countAccepted(state.nextInLine, ["queued", "next", "playing"]);
  countAccepted(state.loadedTrack, ["queued", "next", "playing"]);
  state.history.forEach((entry) => countAccepted(entry, ["completed", "played"]));
  const completedIds = new Set(state.history
    .filter((entry) => !removedIds.has(entry.id)
      && !isSimulation(entry)
      && ["completed", "played"].includes(entry.status))
    .map((entry) => entry.id));
  return {
    queue: state.queue.length,
    history: state.history.length,
    removed: state.removed.length,
    spotlight: state.spotlight.length,
    nextInLine: state.nextInLine ? 1 : 0,
    loadedTrack: state.loadedTrack ? 1 : 0,
    primaryUnique: new Set(primary.map((entry) => entry.id)).size,
    nonSimulationPrimary: primary.filter((entry) => !isSimulation(entry)).length,
    activeCount: state.queue.filter((entry) => ["queued", "playing"].includes(entry.status)).length
      + (state.nextInLine ? 1 : 0) + (state.loadedTrack ? 1 : 0),
    acceptedCount: acceptedIds.size,
    completedCount: completedIds.size,
    removedCount: state.removed.length,
    spotlightCount: state.spotlight.length,
  };
}

function projectionCapture(targets, sourceActiveSessionId) {
  const capturedAt = "2026-08-15T20:00:00.000Z";
  const august14Target = targets.find((target) => target.canonicalShowDate === "2026-08-14");
  assert.ok(august14Target, "the capture fixture requires an August 14 target");
  const rosterIdentities = targets[0].state.sessions
    .map((summary) => historicalRosterIdentity(summary))
    .sort((left, right) => left.sessionId.localeCompare(right.sessionId));
  const rosterSha256 = createHash("sha256").update(canonicalJson(rosterIdentities)).digest("hex");
  const sessions = targets.map(({ canonicalShowDate, state }) => {
    const raw = Buffer.from(JSON.stringify(state), "utf8");
    return {
      canonicalShowDate,
      sourceShowDate: state.session.showDate,
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
        queueOpen: state.session.queueOpen,
        showStarted: state.session.showStarted,
        broadcastStartedAt: state.session.broadcastStartedAt,
      },
      trackCounts: capturedTrackCounts(state),
    };
  });
  return {
    schema: "barcode_queue_two_session_source_capture_v2",
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
      canonicalShowDates: ["2026-08-07", "2026-08-14"],
      sessionCount: 2,
      sourceDateNormalization: [
        {
          canonicalShowDate: "2026-08-07",
          sourceShowDate: "2026-08-08",
          sessionId: historicalAugust7SessionId,
          rule: "legacy_utc_rollover_to_pacific_broadcast_date",
          provenance: {
            kind: "owner_supplied_export",
            sourceSha256: historicalAugust7ExportSha256,
            detail: "Owner-supplied live export identifies this source session as the August 7 Pacific broadcast.",
          },
        },
        {
          canonicalShowDate: "2026-08-14",
          sourceShowDate: "2026-08-14",
          sessionId: august14Target.state.session.sessionId,
          rule: "exact_source_show_date",
          provenance: {
            kind: "authenticated_source_queue_state",
            detail: "Canonical date equals the authenticated source showDate.",
          },
        },
      ],
    },
    consistency: {
      captureStartedAt: "2026-08-15T19:59:00.000Z",
      captureFinishedAt: capturedAt,
      revision: targets[0].state.revision,
      activeSessionId: sourceActiveSessionId,
      rosterCount: rosterIdentities.length,
      rosterSha256,
      startSentinelResponseSha256: "b".repeat(64),
      startSentinelResponseBytes: 1,
      endSentinelResponseSha256: "c".repeat(64),
      endSentinelResponseBytes: 1,
      startEndMatch: true,
    },
    sessions,
  };
}

function rewriteCapturedRaw(capture, canonicalShowDate, mutate, { refreshTrackCounts = true } = {}) {
  const captured = capture.sessions.find((session) => session.canonicalShowDate === canonicalShowDate);
  assert.ok(captured, `missing ${canonicalShowDate} capture fixture`);
  const rawState = JSON.parse(Buffer.from(captured.sourceResponseBase64, "base64").toString("utf8"));
  mutate(rawState);
  const raw = Buffer.from(JSON.stringify(rawState), "utf8");
  captured.sourceResponseBase64 = raw.toString("base64");
  captured.sourceResponseBytes = raw.byteLength;
  captured.sourceResponseSha256 = createHash("sha256").update(raw).digest("hex");
  if (refreshTrackCounts) captured.trackCounts = capturedTrackCounts(rawState);
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
  FakeBlob.putGate = null;
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

async function mustResolveWhileBlobIsBlocked(promise, label) {
  const timeout = Symbol("timeout");
  const result = await Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(timeout), 500)),
  ]);
  assert.notEqual(result, timeout, `${label} waited for Blob`);
  return result;
}

async function waitForCondition(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function durableCurrentRevision() {
  try {
    const stored = FakeBlob.values.get("barcode-radio-queue-state/v1/current.json");
    return stored ? JSON.parse(stored.body).state.revision : null;
  } catch {
    return null;
  }
}

function seedDurableCurrentSnapshot(state) {
  const checksum = createHash("sha256")
    .update(`${state.revision}\n${JSON.stringify(state)}`)
    .digest("hex");
  const pathname = "barcode-radio-queue-state/v1/current.json";
  FakeBlob.values.set(pathname, {
    body: JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      revision: state.revision,
      checksum,
      state,
    }),
    pathname,
    uploadedAt: new Date(),
    etag: `etag-seeded-${state.revision}`,
  });
}

test("Vercel Production requires an isolated dedicated queue Redis endpoint", async () => {
  resetQueueTestState();
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-bnl.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "shared-token";

  try {
    let worker = loadIndependentQueueModules().first;
    await assert.rejects(
      () => worker.startNewQueueSession({ title: "Shared Redis must fail closed" }),
      /dedicated QUEUE_REDIS_REST_URL and QUEUE_REDIS_REST_TOKEN are required/i,
    );
    assert.equal(FakeRedis.calls.length, 0, "shared Redis must not receive production queue commands");

    process.env.QUEUE_REDIS_REST_URL = "https://shared-bnl.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "different-token-same-endpoint";
    worker = loadIndependentQueueModules().first;
    await assert.rejects(
      () => worker.startNewQueueSession({ title: "Same endpoint must fail closed" }),
      /different Redis endpoint|not isolated/i,
    );
    assert.equal(FakeRedis.calls.length, 0, "same-endpoint credentials must fail before Redis construction");

    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-token";
    worker = loadIndependentQueueModules().first;
    const started = await worker.startNewQueueSession({ title: "Isolated production queue" });
    assert.equal(started.session.title, "Isolated production queue");
  } finally {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("live readers use the atomically committed current-session projection", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  try {
    const { first } = loadIndependentQueueModules();
    await first.startNewQueueSession({ title: "Compact live projection" });
    await first.setQueueOpen(true);
    await first.addToQueue(legacyEntry(1));
    await first.addToQueue(legacyEntry(2));

    const full = await first.getRadioQueueState();
    const storedProjection = JSON.parse(FakeRedis.values.get("radioQueue:v2:live-session"));
    assert.equal(storedProjection.schemaVersion, "queue_live_store_v1");
    assert.equal(storedProjection.revision, full.revision);
    assert.equal(storedProjection.activeSessionId, full.session.sessionId);
    assert.equal(storedProjection.session.sessionId, full.session.sessionId);

    FakeRedis.calls.length = 0;
    const live = await first.getRadioLiveQueueState();
    assert.deepEqual(FakeRedis.calls, [[
      "mget",
      ["radioQueue:v2:live-session", "radioQueue:v2:sessions:mutation-revision"],
    ]], "a live snapshot verifies the compact projection in one round trip");
    for (const key of [
      "revision",
      "nowPlaying",
      "queue",
      "history",
      "removed",
      "spotlight",
      "publicStatus",
      "session",
      "nextInLine",
      "loadedTrack",
      "autoRoutingPaused",
      "nextNonPriorityLane",
      "wheelEligibleArtists",
      "playbackDiagnostics",
      "isCurrentSession",
    ]) {
      assert.deepEqual(live[key], full[key], `live projection preserves ${key}`);
    }
    assert.equal(live.sessions.length, 1, "archived session summaries are excluded from visual polling");

    await first.archiveCurrentQueueSession();
    FakeRedis.calls.length = 0;
    const ended = await first.getRadioLiveQueueState();
    assert.equal(ended.session, undefined);
    assert.equal(ended.isCurrentSession, false);
    assert.deepEqual(FakeRedis.calls, [[
      "mget",
      ["radioQueue:v2:live-session", "radioQueue:v2:sessions:mutation-revision"],
    ]], "ended shows stay on the compact idle projection");

    const staleProjection = JSON.parse(FakeRedis.values.get("radioQueue:v2:live-session"));
    staleProjection.revision -= 1;
    FakeRedis.values.set("radioQueue:v2:live-session", JSON.stringify(staleProjection));
    FakeRedis.calls.length = 0;
    const fallback = await first.getRadioLiveQueueState();
    assert.equal(fallback.revision, ended.revision, "a stale projection falls back to full queue authority");
    assert.deepEqual(FakeRedis.calls[0], [
      "mget",
      ["radioQueue:v2:live-session", "radioQueue:v2:sessions:mutation-revision"],
    ]);
    assert.ok(FakeRedis.calls.some(([command, key]) => command === "get" && key === "radioQueue:v2:sessions"));
  } finally {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("Start New Session is idempotent until the existing show is archived", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  try {
    const { first, second } = loadIndependentQueueModules();
    const [started, concurrentDuplicate] = await Promise.all([
      first.startNewQueueSession({ title: "Only show" }),
      second.startNewQueueSession({ title: "Only show" }),
    ]);
    assert.equal(concurrentDuplicate.session.sessionId, started.session.sessionId);
    assert.equal(concurrentDuplicate.revision, 1);
    assert.equal(started.session.status, "prepared");
    assert.equal(started.revision, 1);
    assert.equal(started.sessions.filter((session) => session.status !== "archived").length, 1);
    assert.equal(JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions")).sessions.length, 1);

    for (const [label, prepare] of [
      ["prepared", async () => {}],
      ["open", async () => { await first.setQueueOpen(true); }],
      ["closed", async () => { await first.setQueueOpen(false); }],
    ]) {
      await prepare();
      const beforeRevision = Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision"));
      const beforeStore = FakeRedis.values.get("radioQueue:v2:sessions");
      const repeated = await second.startNewQueueSession({ title: `Duplicate ${label}` });
      assert.equal(repeated.session.sessionId, started.session.sessionId, `${label} Start must return the existing show`);
      assert.equal(repeated.session.title, "Only show");
      assert.equal(repeated.revision, beforeRevision);
      assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), beforeRevision);
      assert.equal(FakeRedis.values.get("radioQueue:v2:sessions"), beforeStore, `${label} Start must not write queue state`);
    }

    await first.archiveCurrentQueueSession();
    const replacement = await second.startNewQueueSession({ title: "Next show" });
    assert.notEqual(replacement.session.sessionId, started.session.sessionId);
    assert.equal(replacement.session.title, "Next show");
    assert.equal(replacement.sessions.filter((session) => session.status !== "archived").length, 1);
  } finally {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
  }
});

test("ending the visible show then starting again cannot select a legacy closed residue", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  try {
    const { first, second } = loadIndependentQueueModules();
    const unexpected = await first.startNewQueueSession({ title: "Unexpected open show" });
    await first.setQueueOpen(true);

    const stored = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
    const legacyClosed = {
      ...stored.sessions[0],
      sessionId: "session_legacy_closed_residue",
      title: "Legacy closed residue",
      status: "closed",
      queueOpen: false,
      showStarted: false,
      createdAt: "2026-08-14T01:00:00.000Z",
      updatedAt: "2026-08-14T02:00:00.000Z",
    };
    stored.sessions.push(legacyClosed);
    FakeRedis.values.set("radioQueue:v2:sessions", JSON.stringify(stored));

    const visible = await second.getRadioQueueState();
    assert.equal(visible.session.sessionId, unexpected.session.sessionId);
    assert.equal(visible.session.status, "open");
    assert.equal(visible.isCurrentSession, true);

    const ended = await second.archiveCurrentQueueSession();
    assert.equal(ended.session.sessionId, unexpected.session.sessionId);
    assert.equal(ended.session.status, "archived");

    const started = await first.startNewQueueSession({ title: "Actually new show" });
    assert.equal(started.session.title, "Actually new show");
    assert.equal(started.session.status, "prepared");
    assert.equal(started.isCurrentSession, true);
    assert.equal(started.readOnly, false);
    assert.notEqual(started.session.sessionId, unexpected.session.sessionId);
    assert.notEqual(started.session.sessionId, legacyClosed.sessionId);

    const afterStart = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
    assert.equal(afterStart.activeSessionId, started.session.sessionId);
    assert.equal(afterStart.sessions.length, 3);
    assert.equal(afterStart.sessions.find((session) => session.sessionId === started.session.sessionId)?.status, "prepared");
    assert.equal(afterStart.sessions.find((session) => session.sessionId === unexpected.session.sessionId)?.status, "archived");
    assert.equal(afterStart.sessions.find((session) => session.sessionId === legacyClosed.sessionId)?.status, "closed");

    const targetUrlState = await second.getRadioQueueState(started.session.sessionId);
    assert.equal(targetUrlState.session.sessionId, started.session.sessionId);
    assert.equal(targetUrlState.session.status, "prepared");
    assert.equal(targetUrlState.isCurrentSession, true);
    assert.equal(targetUrlState.readOnly, false);
  } finally {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
  }
});

test("deleting an archived queue never creates or resurrects a current session", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  try {
    const { first, second } = loadIndependentQueueModules();
    const previous = await first.startNewQueueSession({ title: "Previous archived queue" });

    const stored = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
    const preservedClosedHistory = {
      ...stored.sessions[0],
      sessionId: "session_closed_history_to_preserve",
      title: "Closed history to preserve",
      status: "closed",
      queueOpen: false,
      showStarted: false,
      createdAt: "2026-08-14T01:00:00.000Z",
      updatedAt: "2026-08-14T02:00:00.000Z",
    };
    stored.sessions.push(preservedClosedHistory);
    FakeRedis.values.set("radioQueue:v2:sessions", JSON.stringify(stored));

    const archived = await second.archiveCurrentQueueSession();
    assert.equal(archived.session.sessionId, previous.session.sessionId);
    assert.equal(archived.session.status, "archived");

    const idsBeforeDelete = new Set(archived.sessions.map((session) => session.sessionId));
    const afterDelete = await first.clearArchivedQueueSessions();
    assert.deepEqual(afterDelete.sessions.map((session) => session.sessionId), [preservedClosedHistory.sessionId]);
    assert.ok(afterDelete.sessions.every((session) => idsBeforeDelete.has(session.sessionId)), "archive deletion must not create a session");
    assert.equal(afterDelete.isCurrentSession, false, "archive deletion must not activate closed history");
    assert.equal(afterDelete.readOnly, false);
    assert.equal(afterDelete.session, undefined, "archive deletion must leave the dashboard with no current session");

    const dashboard = await second.getRadioQueueState();
    assert.deepEqual(dashboard.sessions.map((session) => session.sessionId), [preservedClosedHistory.sessionId]);
    assert.equal(dashboard.isCurrentSession, false, "dashboard read must not resurrect deleted or historical sessions");
    assert.equal(dashboard.readOnly, false);
    assert.equal(dashboard.session, undefined);

    const restarted = await second.startNewQueueSession({ title: "Explicit next session" });
    assert.equal(restarted.session.title, "Explicit next session");
    assert.equal(restarted.session.status, "prepared");
    assert.equal(restarted.isCurrentSession, true);
    assert.equal(restarted.readOnly, false);
    assert.ok(restarted.sessions.some((session) => session.sessionId === preservedClosedHistory.sessionId), "closed history must remain preserved");

    resetQueueTestState();
    const { first: onlyArchiveWorker, second: emptyDashboardWorker } = loadIndependentQueueModules();
    const onlyPrevious = await onlyArchiveWorker.startNewQueueSession({ title: "Only archived queue" });
    await onlyArchiveWorker.archiveCurrentQueueSession();
    const clearedOnlyArchive = await onlyArchiveWorker.clearArchivedQueueSessions();
    assert.deepEqual(clearedOnlyArchive.sessions, [], "deleting the only archived queue must not fabricate a replacement");
    assert.equal(clearedOnlyArchive.session, undefined);
    assert.equal(clearedOnlyArchive.isCurrentSession, false);

    const emptyDashboard = await emptyDashboardWorker.getRadioQueueState();
    assert.deepEqual(emptyDashboard.sessions, []);
    assert.equal(emptyDashboard.session, undefined);
    assert.equal(emptyDashboard.isCurrentSession, false);
    assert.ok(!emptyDashboard.sessions.some((session) => session.sessionId === onlyPrevious.session.sessionId), "deleted queue must stay deleted");
  } finally {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
  }
});

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

  await second.archiveCurrentQueueSession();
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
    await waitForCondition(
      () => durableCurrentRevision() === confirmed.revision,
      "the confirmed queue recovery snapshot",
    );
    assert.ok(FakeBlob.values.has(currentPath), "a private current queue snapshot must exist");
    assert.ok(
      [...FakeBlob.values.keys()].some((pathname) => pathname.startsWith("barcode-radio-queue-state/v1/revisions/")),
      "an immutable revision snapshot must exist",
    );

    // Simulate a new Vercel process with no in-memory cache after Upstash locks
    // every Redis command at the same 500,000-command quota seen in production.
    const { first: freshWorker } = loadIndependentQueueModules();
    FakeRedis.calls.length = 0;
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
    assert.ok(FakeRedis.calls.some(([operation]) => operation === "get"), "Redis must be attempted before the recovery snapshot");
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

test("fresh workers prefer newer Redis through a stale readable Blob and failed Blob writes", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
  FakeRedis.failGets = false;
  FakeRedis.failAllCommands = false;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  FakeBlob.failPuts = false;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  let blockedPut = null;

  try {
    const { first } = loadIndependentQueueModules();
    const started = await first.startNewQueueSession({ title: "Redis remains the live queue" });
    assert.equal(started.session.status, "prepared");
    const currentPath = "barcode-radio-queue-state/v1/current.json";
    await waitForCondition(
      () => durableCurrentRevision() === started.revision,
      "the pre-show recovery snapshot",
    );
    const preShowSnapshot = FakeBlob.values.get(currentPath)?.body;
    assert.ok(preShowSnapshot, "the readable Blob must contain the pre-show state");
    assert.equal(JSON.parse(preShowSnapshot).state.revision, started.revision);

    const putCallsBeforeBlock = FakeBlob.calls.filter(([operation]) => operation === "put").length;
    blockedPut = deferred();
    FakeBlob.putGate = blockedPut;

    const live = await mustResolveWhileBlobIsBlocked(
      first.updateRadioTrack("", "startShow"),
      "Start Broadcast",
    );
    assert.equal(live.session.showStarted, true);
    assert.equal(live.session.broadcastPhase, "broadcast_active");
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-lock"), false, "Blob latency must not hold the Redis mutation lock");
    assert.equal(FakeBlob.values.get(currentPath)?.body, preShowSnapshot, "failed backup writes must leave a stale readable pre-show snapshot");
    await waitForCondition(
      () => FakeBlob.calls.filter(([operation]) => operation === "put").length > putCallsBeforeBlock,
      "the Start Broadcast backup attempt to reach the blocked PUT",
    );

    const putCallsBeforeFreshWorker = FakeBlob.calls.filter(([operation]) => operation === "put").length;
    const { first: freshLiveWorker } = loadIndependentQueueModules();
    const liveFromFreshWorker = await mustResolveWhileBlobIsBlocked(
      freshLiveWorker.getRadioQueueState(),
      "fresh-worker queue read",
    );
    assert.equal(liveFromFreshWorker.revision, live.revision);
    assert.equal(liveFromFreshWorker.session.sessionId, started.session.sessionId);
    assert.equal(liveFromFreshWorker.session.showStarted, true);
    assert.equal(liveFromFreshWorker.session.broadcastPhase, "broadcast_active");
    await waitForCondition(
      () => FakeBlob.calls.filter(([operation]) => operation === "put").length > putCallsBeforeFreshWorker,
      "the fresh worker backup attempt to reach the blocked PUT",
    );
    const blockedPutCalls = FakeBlob.calls.filter(([operation]) => operation === "put").length;
    const repeatedReads = await mustResolveWhileBlobIsBlocked(
      Promise.all(Array.from({ length: 25 }, () => freshLiveWorker.getRadioQueueState())),
      "repeated healthy Redis reads",
    );
    assert.ok(repeatedReads.every((state) => state.revision === live.revision));
    assert.equal(
      FakeBlob.calls.filter(([operation]) => operation === "put").length,
      blockedPutCalls,
      "same-revision reads must coalesce behind one in-flight backup",
    );

    FakeBlob.failPuts = true;
    blockedPut.resolve();
    FakeBlob.putGate = null;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const ended = await freshLiveWorker.archiveCurrentQueueSession();
    assert.equal(ended.session.status, "archived");
    assert.equal(ended.session.broadcastPhase, "ended");

    const { first: freshEndedWorker } = loadIndependentQueueModules();
    const endedFromFreshWorker = await freshEndedWorker.getRadioQueueState();
    assert.equal(endedFromFreshWorker.revision, ended.revision);
    assert.equal(endedFromFreshWorker.session.sessionId, started.session.sessionId);
    assert.equal(endedFromFreshWorker.session.status, "archived");
    assert.equal(endedFromFreshWorker.session.broadcastPhase, "ended");

    assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 3);
    const stored = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
    assert.equal(stored.revision, 3);
    assert.equal(stored.sessions.find((session) => session.sessionId === started.session.sessionId).status, "archived");
    assert.equal(
      FakeRedis.calls.filter(([operation, keys]) => operation === "eval" && keys?.includes("radioQueue:v2:sessions:mutation-revision")).length,
      3,
      "each show lifecycle action must commit once with no backup-driven rollback",
    );
    assert.equal(FakeBlob.values.get(currentPath)?.body, preShowSnapshot, "the stale backup must never override or roll back Redis");

    FakeBlob.failPuts = false;
    await freshEndedWorker.getRadioQueueState();
    await waitForCondition(
      () => durableCurrentRevision() === ended.revision,
      "the failed backup revision to retry",
    );
  } finally {
    FakeBlob.failPuts = true;
    blockedPut?.resolve();
    FakeBlob.putGate = null;
    await new Promise((resolve) => setTimeout(resolve, 0));
    FakeBlob.failPuts = false;
    FakeRedis.failGets = false;
    FakeRedis.failAllCommands = false;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.QUEUE_REDIS_REST_URL;
    delete process.env.QUEUE_REDIS_REST_TOKEN;
  }
});

test("ordinary show actions ignore a conflicting Blob at the same Redis revision", async () => {
  resetQueueTestState();
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first } = loadIndependentQueueModules();
    const started = await first.startNewQueueSession({ title: "Redis authority proof" });
    const redisStore = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
    const conflictingDurable = structuredClone(redisStore);
    conflictingDurable.sessions[0].title = "Conflicting backup title";
    seedDurableCurrentSnapshot(conflictingDurable);

    const { first: freshWorker } = loadIndependentQueueModules();
    const opened = await freshWorker.setQueueOpen(true);
    assert.equal(opened.isOpen, true);
    const after = await freshWorker.getRadioQueueState();
    assert.equal(after.revision, started.revision + 1);
    assert.equal(after.session.title, "Redis authority proof");
    assert.equal(after.session.queueOpen, true);
  } finally {
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
    await waitForCondition(
      () => durableCurrentRevision() === original.revision,
      "the migration source recovery snapshot",
    );

    FakeRedis.values.clear();
    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-redis.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-token";
    const { first: recoveryWorker } = loadIndependentQueueModules();

    const statusBefore = await recoveryWorker.getQueueRecoveryStatus();
    assert.equal(statusBefore.alignment, "durable_only");
    assert.equal(statusBefore.durable.revision, original.revision);
    assert.equal(statusBefore.redis.dedicated, true);
    assert.equal(statusBefore.redis.revision, 0);
    FakeBlob.failPuts = true;
    const ordinaryAction = await recoveryWorker.setQueueOpen(false);
    assert.equal(ordinaryAction.isOpen, false, "a backup-ahead condition must not block an ordinary show action");
    assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 1);
    const divergentStatus = await recoveryWorker.getQueueRecoveryStatus();
    assert.equal(divergentStatus.alignment, "durable_ahead");
    FakeBlob.failPuts = false;
    const redisBeforeDryRun = FakeRedis.values.get("radioQueue:v2:sessions");

    const dryRun = await recoveryWorker.restoreQueueFromDurableSnapshot({ dryRun: true });
    assert.equal(dryRun.restored, false);
    assert.equal(dryRun.revision, original.revision);
    assert.equal(FakeRedis.values.get("radioQueue:v2:sessions"), redisBeforeDryRun);
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

test("the guarded v2 historical import preserves source evidence while normalizing the verified August 7 and August 14 identities", async () => {
  resetQueueTestState();
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-bnl.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "shared-bnl-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: sourceWorker } = loadIndependentQueueModules();
    const { august14, capture } = await historicalCaptureFixture(sourceWorker, {
      august7Status: "closed",
      august14Status: "open",
    });
    await waitForCondition(() => durableCurrentRevision() === 1, "the historical fixture backup to settle");
    const captureBeforeImport = JSON.stringify(capture);

    // Switch to a brand-new queue-only database and a brand-new recovery epoch.
    FakeRedis.values.clear();
    FakeBlob.values.clear();
    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-queue-token";
    const { first: destinationWorker } = loadIndependentQueueModules();

    await destinationWorker.getRadioQueueState();
    await waitForCondition(
      () => durableCurrentRevision() === 0,
      "the empty destination recovery snapshot",
    );
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
    assert.equal(dryRun.sourceActiveSessionId, historicalAugust7SessionId);
    assert.equal(dryRun.activeSessionSelection, "newest_imported_archived_session");
    assert.equal(dryRun.sourceRevision, 73);
    const august7Plan = dryRun.sessions.find((session) => session.showDate === "2026-08-07");
    const august14Plan = dryRun.sessions.find((session) => session.showDate === "2026-08-14");
    assert.equal(august7Plan.sessionId, historicalAugust7SessionId);
    assert.equal(august7Plan.sourceShowDate, "2026-08-08");
    assert.equal(august7Plan.sourceStatus, "closed");
    assert.equal(august7Plan.status, "archived");
    assert.equal(august7Plan.completedCount, 40);
    assert.equal(august7Plan.removedCount, 1);
    assert.ok(august7Plan.appliedNormalizations.includes("source_show_date_to_canonical_pacific_show_date"));
    assert.ok(august7Plan.appliedNormalizations.includes("source_status_to_archived"));
    assert.equal(august14Plan.sourceShowDate, "2026-08-14");
    assert.equal(august14Plan.sourceStatus, "open");
    assert.equal(august14Plan.status, "archived");
    assert.ok(august14Plan.appliedNormalizations.includes("source_status_to_archived"));
    assert.match(dryRun.requiredConfirmation, /^IMPORT 2 HISTORICAL QUEUE SESSIONS [a-f0-9]{64} INTO REVISION 0$/);
    assert.equal(JSON.stringify(capture), captureBeforeImport, "a dry-run must not alter the raw source evidence");

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
    assert.ok(stored.sessions.every((session) => session.status === "archived"
      && session.queueOpen === false
      && session.submissionClosureReason === "archived"
      && session.showStarted === false
      && session.broadcastPhase === "ended"));
    assert.ok(stored.sessions.some((session) => session.queue.some((entry) => entry.artist === "August Fourteen Artist")));
    const storedAugust7 = stored.sessions.find((session) => session.sessionId === historicalAugust7SessionId);
    const storedAugust14 = stored.sessions.find((session) => session.sessionId === august14.session.sessionId);
    assert.equal(stored.activeSessionId, august14.session.sessionId);
    assert.equal(storedAugust7.showDate, "2026-08-07");
    assert.equal(storedAugust7.completed.length, 40);
    assert.equal(storedAugust7.removed.length, 1);
    assert.equal(storedAugust7.removed[0].artist, "MagicSZN");
    assert.equal(storedAugust7.removed[0].title, "HighFive");
    assert.deepEqual(storedAugust7.historicalRecoveryProvenance, {
      schema: "barcode_queue_historical_recovery_provenance_v1",
      sourceUrl: capture.source.baseUrl,
      sourceCommit: capture.source.expectedGitCommit,
      sourceRevision: 73,
      sourceDigest: dryRun.sourceDigest,
      sourceResponseSha256: capture.sessions.find((session) => session.canonicalShowDate === "2026-08-07").sourceResponseSha256,
      sourceSessionId: historicalAugust7SessionId,
      sourceStoredShowDate: "2026-08-08",
      canonicalShowDate: "2026-08-07",
      timeZone: "America/Los_Angeles",
      sourceStatus: "closed",
      appliedNormalizations: [
        "source_show_date_to_canonical_pacific_show_date",
        "source_status_to_archived",
      ],
    });
    assert.equal(storedAugust14.historicalRecoveryProvenance.sourceStoredShowDate, "2026-08-14");
    assert.equal(storedAugust14.historicalRecoveryProvenance.sourceStatus, "open");
    assert.equal(storedAugust14.historicalRecoveryProvenance.sourceDigest, dryRun.sourceDigest);
    assert.deepEqual(storedAugust14.historicalRecoveryProvenance.appliedNormalizations, [
      "source_status_to_archived",
      "queue_closed_for_historical_archive",
      "show_stopped_for_historical_archive",
      "broadcast_phase_ended_for_historical_archive",
    ]);
    assert.equal(JSON.stringify(capture), captureBeforeImport, "the import must preserve the capture's raw response bytes");

    const status = await destinationWorker.getQueueRecoveryStatus();
    assert.equal(status.alignment, "aligned");
    assert.equal(status.redis.dedicated, true);
    assert.equal(status.redis.isolatedFromShared, true);
    assert.equal(status.redis.revision, 1);
    assert.equal(status.durable.revision, 1);
    assert.equal(status.redis.sessionCount, 2);
    assert.equal(status.durable.sessionCount, 2);

    const fromBlob = await destinationWorker.getRadioQueueState(historicalAugust7SessionId);
    assert.equal(fromBlob.session.showDate, "2026-08-07");
    assert.equal(fromBlob.history.length, 40);
    assert.equal(fromBlob.removed[0].artist, "MagicSZN");

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

test("historical v2 capture rejects stale schema and any weakened August 7 identity, date, export, roster, or raw evidence", async () => {
  resetQueueTestState();
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-bnl.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "shared-bnl-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;

  try {
    const { first: sourceWorker } = loadIndependentQueueModules();
    const { capture } = await historicalCaptureFixture(sourceWorker);
    const { capture: openAugust7Capture } = await historicalCaptureFixture(sourceWorker, {
      august7Status: "open",
    });
    await waitForCondition(() => durableCurrentRevision() === 1, "the validation fixture backup to settle");

    FakeRedis.values.clear();
    FakeBlob.values.clear();
    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-queue-token";
    const { first: destinationWorker } = loadIndependentQueueModules();
    await destinationWorker.getRadioQueueState();
    await waitForCondition(
      () => durableCurrentRevision() === 0,
      "the empty validation destination recovery snapshot",
    );
    await destinationWorker.restoreQueueFromDurableSnapshot({
      dryRun: false,
      confirmation: "RESTORE DURABLE QUEUE REVISION 0",
    });
    const redisBefore = FakeRedis.values.get("radioQueue:v2:sessions");

    const staleSchema = structuredClone(capture);
    staleSchema.schema = "barcode_queue_two_session_source_capture_v1";
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: staleSchema, dryRun: true }),
      /schema must be .*_v2/i,
    );

    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: openAugust7Capture, dryRun: true }),
      /August 7 historical session must be closed or archived at the source/i,
    );

    const wrongSessionId = structuredClone(capture);
    wrongSessionId.scope.sourceDateNormalization[0].sessionId = "session_wrong_august7";
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: wrongSessionId, dryRun: true }),
      /August 7 historical queue date-normalization provenance is invalid/i,
    );

    const wrongSourceDate = structuredClone(capture);
    wrongSourceDate.scope.sourceDateNormalization[0].sourceShowDate = "2026-08-07";
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: wrongSourceDate, dryRun: true }),
      /August 7 historical queue date-normalization provenance is invalid/i,
    );

    const wrongExport = structuredClone(capture);
    wrongExport.scope.sourceDateNormalization[0].provenance.sourceSha256 = "0".repeat(64);
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: wrongExport, dryRun: true }),
      /August 7 historical queue date-normalization provenance is invalid/i,
    );

    const missingProvenanceDetail = structuredClone(capture);
    missingProvenanceDetail.scope.sourceDateNormalization[1].provenance.detail = "";
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: missingProvenanceDetail, dryRun: true }),
      /provenance\.detail is required/i,
    );

    const rosterDrift = structuredClone(capture);
    rewriteCapturedRaw(rosterDrift, "2026-08-14", (state) => {
      state.sessions[0].title = "Tampered roster title";
    });
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: rosterDrift, dryRun: true }),
      /sessions does not match the captured roster SHA-256/i,
    );

    for (const missingField of ["removed", "spotlight"]) {
      const missingLifecycleArray = structuredClone(capture);
      rewriteCapturedRaw(missingLifecycleArray, "2026-08-14", (state) => {
        delete state[missingField];
      }, { refreshTrackCounts: false });
      await assert.rejects(
        () => destinationWorker.importHistoricalQueueSessions({ capture: missingLifecycleArray, dryRun: true }),
        new RegExp(`${missingField} must be an array`, "i"),
      );
    }

    const wrongCapturedAcceptedCount = structuredClone(capture);
    wrongCapturedAcceptedCount.sessions
      .find((session) => session.canonicalShowDate === "2026-08-14")
      .trackCounts.acceptedCount += 1;
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: wrongCapturedAcceptedCount, dryRun: true }),
      /capture trackCounts\.acceptedCount does not match the raw response/i,
    );

    const missingTotalPlayed = structuredClone(capture);
    rewriteCapturedRaw(missingTotalPlayed, "2026-08-14", (state) => {
      delete state.totalPlayed;
    });
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: missingTotalPlayed, dryRun: true }),
      /totalPlayed must be a non-negative integer/i,
    );

    const wrongCount = structuredClone(capture);
    rewriteCapturedRaw(wrongCount, "2026-08-07", (state) => {
      state.history.pop();
      state.session.completedCount = state.history.length;
      state.session.acceptedCount = state.history.length;
      state.totalPlayed = state.history.length;
    });
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: wrongCount, dryRun: true }),
      /40 played.*1 removed owner export/i,
    );

    const wrongRemovedIdentity = structuredClone(capture);
    rewriteCapturedRaw(wrongRemovedIdentity, "2026-08-07", (state) => {
      state.removed[0].title = "Not HighFive";
    });
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: wrongRemovedIdentity, dryRun: true }),
      /August 7.*owner export|removed track/i,
    );

    const noRealAugust14Track = structuredClone(capture);
    rewriteCapturedRaw(noRealAugust14Track, "2026-08-14", (state) => {
      state.queue[0].isTestTrack = true;
      state.session.acceptedCount = 0;
    });
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: noRealAugust14Track, dryRun: true }),
      /August 14 historical session contains no real queue records/i,
    );

    const missingSession = structuredClone(capture);
    missingSession.sessions.pop();
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: missingSession, dryRun: true }),
      /exactly two source session projections/i,
    );

    const alteredRawWithoutDigest = structuredClone(capture);
    const august7Capture = alteredRawWithoutDigest.sessions.find((session) => session.canonicalShowDate === "2026-08-07");
    const raw = Buffer.from(august7Capture.sourceResponseBase64, "base64");
    raw[raw.length - 2] ^= 1;
    august7Capture.sourceResponseBase64 = raw.toString("base64");
    await assert.rejects(
      () => destinationWorker.importHistoricalQueueSessions({ capture: alteredRawWithoutDigest, dryRun: true }),
      /sourceResponseSha256 does not match|UTF-8 JSON response/i,
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

test("historical v2 source statuses closed and archived retain provenance while the destination remains archived", async () => {
  try {
    for (const august14Status of ["closed", "archived"]) {
      resetQueueTestState();
      process.env.UPSTASH_REDIS_REST_URL = "https://shared-bnl.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "shared-bnl-token";
      process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
      delete process.env.QUEUE_REDIS_REST_URL;
      delete process.env.QUEUE_REDIS_REST_TOKEN;

      const { first: sourceWorker } = loadIndependentQueueModules();
      const { capture } = await historicalCaptureFixture(sourceWorker, { august14Status });
      await waitForCondition(() => durableCurrentRevision() === 1, "the status-variant fixture backup to settle");
      FakeRedis.values.clear();
      FakeBlob.values.clear();
      process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
      process.env.QUEUE_REDIS_REST_TOKEN = "owned-queue-token";
      const { first: destinationWorker } = loadIndependentQueueModules();
      await destinationWorker.getRadioQueueState();
      await waitForCondition(
        () => durableCurrentRevision() === 0,
        "the empty status-variant destination recovery snapshot",
      );
      await destinationWorker.restoreQueueFromDurableSnapshot({
        dryRun: false,
        confirmation: "RESTORE DURABLE QUEUE REVISION 0",
      });

      const dryRun = await destinationWorker.importHistoricalQueueSessions({ capture, dryRun: true });
      const summary = dryRun.sessions.find((session) => session.showDate === "2026-08-14");
      assert.equal(summary.sourceStatus, august14Status);
      assert.equal(summary.status, "archived");
      assert.equal(summary.appliedNormalizations.includes("source_status_to_archived"), august14Status !== "archived");
    }
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
    const { capture } = await historicalCaptureFixture(sourceWorker);
    await waitForCondition(() => durableCurrentRevision() === 1, "the rollback fixture backup to settle");

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
    await waitForCondition(
      () => durableCurrentRevision() === 0,
      "the empty rollback-test destination recovery snapshot",
    );
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
