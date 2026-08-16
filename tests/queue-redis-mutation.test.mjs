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
  static getFailuresRemaining = 0;
  static commitFailure = null;
  static rollbackFailure = null;
  static delayedCommandResults = [];
  static beforeCommit = null;
  static commitRenewals = [];
  static lockExpiries = new Map();
  static commitRenewalDeadlines = [];
  static constructorOptions = [];

  constructor(options = {}) {
    FakeRedis.constructorOptions.push(options);
    if (FakeRedis.failOnConstruct) throw new Error("Redis client URL is invalid");
  }

  static quotaError() {
    return new Error("ERR max requests limit exceeded. Limit: 500000");
  }

  async get(key) {
    FakeRedis.calls.push(["get", key]);
    if (FakeRedis.getFailure) throw FakeRedis.getFailure;
    if (FakeRedis.getFailuresRemaining > 0) {
      FakeRedis.getFailuresRemaining -= 1;
      throw new Error("Redis observation unavailable");
    }
    if (FakeRedis.failAllCommands || FakeRedis.failGets) throw FakeRedis.quotaError();
    return FakeRedis.values.get(key) ?? null;
  }

  async set(key, value, options = {}) {
    FakeRedis.calls.push(["set", key, options]);
    if (FakeRedis.failAllCommands) throw FakeRedis.quotaError();
    if (options.nx && FakeRedis.values.has(key)) return null;
    FakeRedis.values.set(key, value);
    if (Number.isFinite(options.px)) FakeRedis.lockExpiries.set(key, Date.now() + Number(options.px));
    return "OK";
  }

  async eval(script, keys, args) {
    const scriptKind = script.includes("commit_outcome")
      ? "commit-reconcile"
      : script.includes("commit_mutation")
      ? "commit"
      : script.includes("current_state")
      ? "fence"
      : script.includes("PEXPIRE")
        ? "renew"
        : script.includes("current_revision")
          ? args.length >= 6 ? "rollback" : "commit"
          : "release";
    FakeRedis.calls.push(["eval", keys, scriptKind]);
    if (FakeRedis.failAllCommands) throw FakeRedis.quotaError();
    if (script.includes("commit_outcome")) {
      if (FakeRedis.getFailuresRemaining > 0) {
        FakeRedis.getFailuresRemaining = 0;
        throw new Error("Redis reconciliation unavailable");
      }
      const [lockKey, stateKey, revisionKey, legacyKey] = keys;
      const [token, previousRevision, previousStateJson, previousStateExisted, previousRevisionExisted, nextRevision, nextStateJson, , previousLegacyJson, previousLegacyExisted, legacyCheck] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentState = FakeRedis.values.get(stateKey);
      const currentRevision = FakeRedis.values.get(revisionKey);
      if (currentState === nextStateJson && Number(currentRevision) === Number(nextRevision)) return 1;
      const previousStateMatches = previousStateExisted === "1"
        ? currentState === previousStateJson
        : currentState === undefined;
      const previousRevisionMatches = previousRevisionExisted === "1"
        ? Number(currentRevision) === Number(previousRevision)
        : currentRevision === undefined;
      const currentLegacy = FakeRedis.values.get(legacyKey);
      const previousLegacyMatches = legacyCheck !== "1"
        || (previousLegacyExisted === "1" ? currentLegacy === previousLegacyJson : currentLegacy === undefined);
      if (previousStateMatches && previousRevisionMatches && previousLegacyMatches) {
        FakeRedis.values.delete(lockKey);
        FakeRedis.lockExpiries.delete(lockKey);
        return 0;
      }
      return -2;
    }
    if (script.includes("current_state") && !script.includes("commit_mutation")) {
      const [lockKey, stateKey, revisionKey, legacyKey] = keys;
      const [token, expectedRevision, stateJson, , stateExisted = "1", revisionExisted = "1", legacyJson = "", legacyExisted = "0", legacyCheck = "0"] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentRevision = FakeRedis.values.get(revisionKey);
      const revisionMatches = revisionExisted === "1"
        ? currentRevision !== undefined && Number(currentRevision) === Number(expectedRevision)
        : currentRevision === undefined;
      if (!revisionMatches) return -2;
      const currentState = FakeRedis.values.get(stateKey);
      const stateMatches = stateExisted === "1" ? currentState === stateJson : currentState === undefined;
      if (!stateMatches) return -3;
      if (legacyCheck === "1") {
        const currentLegacy = FakeRedis.values.get(legacyKey);
        const legacyMatches = legacyExisted === "1" ? currentLegacy === legacyJson : currentLegacy === undefined;
        if (!legacyMatches) return -4;
      }
      return Number(expectedRevision);
    }
    if (script.includes("PEXPIRE") && !script.includes("commit_mutation")) {
      const [lockKey] = keys;
      const [token, ttlMs] = args;
      if (FakeRedis.values.get(lockKey) !== token) return 0;
      FakeRedis.lockExpiries.set(lockKey, Date.now() + Number(ttlMs));
      return 1;
    }
    if (script.includes("current_revision") || script.includes("commit_mutation")) {
      const [lockKey, stateKey, revisionKey, legacyKey] = keys;
      const isCommit = script.includes("commit_mutation");
      const isRollback = !isCommit && args.length >= 6;
      const [token, expectedRevision] = args;
      const previousStateJson = isCommit ? args[2] : null;
      const previousStateExisted = isCommit ? args[3] : null;
      const previousRevisionExisted = isCommit ? args[4] : null;
      const previousLegacyJson = isCommit ? args[5] : null;
      const previousLegacyExisted = isCommit ? args[6] : null;
      const legacyCheck = isCommit ? args[7] : null;
      const stateJson = isCommit ? args[8] : args[2];
      const nextRevision = isCommit ? args[9] : args[3];
      const ttlMs = isCommit ? args[10] : null;
      const stateExisted = isCommit ? null : args[4];
      const revisionExisted = isCommit ? null : args[5];
      const configuredFailure = isRollback ? FakeRedis.rollbackFailure : FakeRedis.commitFailure;
      if (!isRollback && configuredFailure?.when === "delayed-after-observation") {
        FakeRedis.commitFailure = null;
        const delayed = new Promise((resolve) => {
          setImmediate(() => {
            if (FakeRedis.values.get(lockKey) !== token) {
              resolve(-1);
              return;
            }
            const delayedState = FakeRedis.values.get(stateKey);
            const delayedRevision = FakeRedis.values.get(revisionKey);
            const delayedStateMatches = previousStateExisted === "1"
              ? delayedState === previousStateJson
              : delayedState === undefined;
            const delayedRevisionMatches = previousRevisionExisted === "1"
              ? delayedRevision !== undefined && Number(delayedRevision) === Number(expectedRevision)
              : delayedRevision === undefined;
            if (!delayedStateMatches || !delayedRevisionMatches) {
              resolve(-2);
              return;
            }
            if (legacyCheck === "1") {
              const delayedLegacy = FakeRedis.values.get(legacyKey);
              const delayedLegacyMatches = previousLegacyExisted === "1"
                ? delayedLegacy === previousLegacyJson
                : delayedLegacy === undefined;
              if (!delayedLegacyMatches) {
                resolve(-3);
                return;
              }
            }
            FakeRedis.values.set(stateKey, stateJson);
            FakeRedis.values.set(revisionKey, nextRevision);
            if (legacyCheck === "1") FakeRedis.values.delete(legacyKey);
            FakeRedis.commitRenewals.push(Number(ttlMs));
            resolve(Number(nextRevision));
          });
        });
        FakeRedis.delayedCommandResults.push(delayed);
        throw new Error(configuredFailure.message ?? "Redis acknowledgement unavailable before delayed execution");
      }
      if (configuredFailure?.when === "before") {
        if (isRollback) FakeRedis.rollbackFailure = null;
        else FakeRedis.commitFailure = null;
        if (configuredFailure.observationFailures) FakeRedis.getFailuresRemaining = configuredFailure.observationFailures;
        throw new Error(configuredFailure.message ?? "Redis acknowledgement unavailable");
      }
      if (isCommit && FakeRedis.beforeCommit) {
        const beforeCommit = FakeRedis.beforeCommit;
        FakeRedis.beforeCommit = null;
        await beforeCommit({ lockKey, stateKey, revisionKey, token, expectedRevision, nextState: stateJson, nextRevision });
      }
      const lockExpiry = FakeRedis.lockExpiries.get(lockKey);
      if (lockExpiry !== undefined && lockExpiry <= Date.now()) {
        FakeRedis.values.delete(lockKey);
        FakeRedis.lockExpiries.delete(lockKey);
      }
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentRevision = FakeRedis.values.get(revisionKey);
      if (isCommit) {
        const currentState = FakeRedis.values.get(stateKey);
        const stateMatches = previousStateExisted === "1"
          ? currentState === previousStateJson
          : currentState === undefined;
        const revisionMatches = previousRevisionExisted === "1"
          ? currentRevision !== undefined && Number(currentRevision) === Number(expectedRevision)
          : currentRevision === undefined;
        const currentLegacy = FakeRedis.values.get(legacyKey);
        const legacyMatches = legacyCheck !== "1"
          || (previousLegacyExisted === "1" ? currentLegacy === previousLegacyJson : currentLegacy === undefined);
        if (!stateMatches || !revisionMatches || !legacyMatches) return -2;
      } else if (currentRevision !== undefined && Number(currentRevision) !== Number(expectedRevision)) return -2;
      if (isRollback) {
        if (stateExisted === "1") FakeRedis.values.set(stateKey, stateJson);
        else FakeRedis.values.delete(stateKey);
        if (revisionExisted === "1") FakeRedis.values.set(revisionKey, nextRevision);
        else FakeRedis.values.delete(revisionKey);
      } else {
        FakeRedis.values.set(stateKey, stateJson);
        FakeRedis.values.set(revisionKey, nextRevision);
        if (legacyCheck === "1") FakeRedis.values.delete(legacyKey);
        FakeRedis.commitRenewals.push(Number(ttlMs));
        const renewalDeadline = Date.now() + Number(ttlMs);
        FakeRedis.lockExpiries.set(lockKey, renewalDeadline);
        FakeRedis.commitRenewalDeadlines.push(renewalDeadline);
      }
      if (configuredFailure?.when === "after") {
        if (isRollback) FakeRedis.rollbackFailure = null;
        else FakeRedis.commitFailure = null;
        if (configuredFailure.observationFailures) FakeRedis.getFailuresRemaining = configuredFailure.observationFailures;
        throw new Error(configuredFailure.message ?? "Redis acknowledgement unavailable");
      }
      return Number(nextRevision);
    }
    const [lockKey] = keys;
    const [token] = args;
    if (FakeRedis.values.get(lockKey) === token) {
      FakeRedis.values.delete(lockKey);
      FakeRedis.lockExpiries.delete(lockKey);
      return 1;
    }
    return 0;
  }
}

class FakeBlob {
  static values = new Map();
  static calls = [];
  static failPuts = false;
  static getFailure = null;
  static getFailurePaths = new Set();
  static failPutPaths = new Set();
  static failPutPrefixes = new Set();
  static throwAfterPutPaths = new Set();
  static putDelayMsByPath = new Map();
  static beforePutByPath = new Map();
  static putCountsByPath = new Map();
  static failPutOccurrenceByPath = new Map();

  static async put(pathname, body, options = {}) {
    FakeBlob.calls.push(["put", pathname, options]);
    const occurrence = (FakeBlob.putCountsByPath.get(pathname) ?? 0) + 1;
    FakeBlob.putCountsByPath.set(pathname, occurrence);
    const beforePut = FakeBlob.beforePutByPath.get(pathname);
    if (beforePut) {
      FakeBlob.beforePutByPath.delete(pathname);
      await beforePut(pathname, body, options);
    }
    const delayMs = FakeBlob.putDelayMsByPath.get(pathname) ?? 0;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (FakeBlob.failPuts
      || FakeBlob.failPutPaths.has(pathname)
      || FakeBlob.failPutOccurrenceByPath.get(pathname) === occurrence
      || [...FakeBlob.failPutPrefixes].some((prefix) => pathname.startsWith(prefix))) {
      throw new Error("Blob snapshot write failed");
    }
    const current = FakeBlob.values.get(pathname);
    if (options.ifMatch && current?.etag !== options.ifMatch) throw new Error("Blob precondition failed");
    if (options.allowOverwrite === false && current) throw new Error("Blob already exists");
    const text = typeof body === "string" ? body : Buffer.from(body).toString("utf8");
    const stored = {
      body: text,
      pathname,
      uploadedAt: new Date(),
      etag: `etag-${FakeBlob.calls.length}`,
    };
    FakeBlob.values.set(pathname, stored);
    if (FakeBlob.throwAfterPutPaths.has(pathname)) {
      FakeBlob.throwAfterPutPaths.delete(pathname);
      throw new Error("Blob acknowledgement unavailable");
    }
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
    if (FakeBlob.getFailure) throw FakeBlob.getFailure;
    if (FakeBlob.getFailurePaths.has(pathname)) throw new Error("Blob marker read unavailable");
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
    const firstDurable = require(durablePath);
    delete require.cache[queuePath];
    delete require.cache[durablePath];
    const second = require(queuePath);
    const secondDurable = require(durablePath);
    return { first, second, firstDurable, secondDurable };
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
  FakeRedis.getFailuresRemaining = 0;
  FakeRedis.commitFailure = null;
  FakeRedis.rollbackFailure = null;
  FakeRedis.delayedCommandResults.length = 0;
  FakeRedis.beforeCommit = null;
  FakeRedis.commitRenewals.length = 0;
  FakeRedis.lockExpiries.clear();
  FakeRedis.commitRenewalDeadlines.length = 0;
  FakeRedis.constructorOptions.length = 0;
  FakeBlob.values.clear();
  FakeBlob.calls.length = 0;
  FakeBlob.failPuts = false;
  FakeBlob.getFailure = null;
  FakeBlob.getFailurePaths.clear();
  FakeBlob.failPutPaths.clear();
  FakeBlob.failPutPrefixes.clear();
  FakeBlob.throwAfterPutPaths.clear();
  FakeBlob.putDelayMsByPath.clear();
  FakeBlob.beforePutByPath.clear();
  FakeBlob.putCountsByPath.clear();
  FakeBlob.failPutOccurrenceByPath.clear();
}

function durableSnapshotFixture(state, savedAt = "2026-08-16T12:00:00.000Z") {
  const checksum = createHash("sha256")
    .update(`${state.revision}\n${JSON.stringify(state)}`)
    .digest("hex");
  const revisionPath = `barcode-radio-queue-state/v1/revisions/${String(state.revision).padStart(12, "0")}-${checksum}.json`;
  const commitPath = `barcode-radio-queue-state/v1/commits/${String(state.revision).padStart(12, "0")}-${checksum}.json`;
  return {
    envelope: {
      schemaVersion: 1,
      savedAt,
      revision: state.revision,
      checksum,
      state,
    },
    marker: {
      schemaVersion: 1,
      committedAt: savedAt,
      revision: state.revision,
      checksum,
      revisionPath,
    },
    revisionPath,
    commitPath,
  };
}

function configureDurableQueueTest(endpoint = "https://durable-queue.example.test") {
  process.env.UPSTASH_REDIS_REST_URL = endpoint;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
}

async function assertQueueOperationError(operation, code, status, causePattern) {
  try {
    await operation();
    assert.fail(`Expected queue operation to fail with ${code}`);
  } catch (error) {
    const details = `${error?.stack ?? error}\ncause: ${error?.cause?.stack ?? error?.cause ?? ""}`;
    assert.equal(error?.code, code, details);
    assert.equal(error?.status, status, details);
    if (causePattern) assert.match(String(error?.cause?.message ?? error?.cause ?? ""), causePattern);
  }
}

test("empty queue reads and close no-ops never synthesize or persist a session", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://empty-read.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first } = loadIndependentQueueModules();

  for (let index = 0; index < 100; index += 1) {
    const state = await first.getRadioQueueState();
    assert.equal(state.session, undefined);
    assert.deepEqual(state.sessions, []);
    assert.equal(state.revision, 0);
  }
  const publicSnapshot = await first.getPublicQueueSnapshot();
  assert.equal(publicSnapshot.session, null);
  assert.deepEqual(publicSnapshot.queue, []);

  const commitsBeforeClose = FakeRedis.calls.filter(([operation, , kind]) => operation === "eval" && kind === "commit").length;
  const closed = await first.setQueueOpen(false);
  assert.equal(closed.isOpen, false);
  assert.equal(
    FakeRedis.calls.filter(([operation, , kind]) => operation === "eval" && kind === "commit").length,
    commitsBeforeClose,
    "Close must take the lock but must not persist an empty synthetic session",
  );
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeBlob.calls.some(([operation]) => operation === "put"), false);
  await assertQueueOperationError(() => first.setQueueOpen(true), "queue_session_not_found", 404);
});

test("clearing the last archived session leaves explicit empty state and Start creates the only new session", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://clear-empty.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "clear-empty-start-1", title: "Archive then clear" });
  const archived = await first.archiveQueueSession(started.session.sessionId);
  assert.equal(archived.session.status, "archived");
  const afterArchive = await first.getRadioQueueState();
  assert.equal(afterArchive.session.sessionId, started.session.sessionId);
  assert.equal(afterArchive.session.status, "archived");
  assert.equal(afterArchive.isCurrentSession, false);
  assert.equal(afterArchive.sessions.length, 1);
  assert.equal(afterArchive.sessions[0].status, "archived");
  assert.equal(JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions")).activeSessionId, started.session.sessionId);
  const cleared = await first.clearArchivedQueueSessions();
  assert.equal(cleared.session, undefined);
  assert.deepEqual(cleared.sessions, []);
  const storedEmpty = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  assert.equal(storedEmpty.activeSessionId, null);
  assert.deepEqual(storedEmpty.sessions, []);

  const restarted = await first.startNewQueueSession({ requestId: "clear-empty-start-2", title: "Only real replacement" });
  assert.equal(restarted.sessions.length, 1);
  assert.equal(restarted.session.title, "Only real replacement");
});

test("a closed selected show blocks Start until it is archived", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://archive-null.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first } = loadIndependentQueueModules();

  const older = await first.startNewQueueSession({ requestId: "older-closed-1", title: "Older closed show" });
  assert.equal(older.sessionCreated, true);
  await first.setQueueOpen(true);
  await first.setQueueOpen(false);
  const revisionBeforeRetry = (await first.getRadioQueueState()).revision;
  const blocked = await first.startNewQueueSession({ requestId: "blocked-by-closed-1", title: "Must not replace closed show" });
  assert.equal(blocked.session.sessionId, older.session.sessionId);
  assert.equal(blocked.sessionCreated, false);
  assert.equal(blocked.revision, revisionBeforeRetry);
  assert.equal(blocked.sessions.length, 1);

  await first.archiveQueueSession(older.session.sessionId);
  const current = await first.startNewQueueSession({ requestId: "current-archive-1", title: "Current show" });
  assert.notEqual(current.session.sessionId, older.session.sessionId);
  assert.equal(current.sessionCreated, true);

  await first.archiveQueueSession(current.session.sessionId);
  const afterArchive = await first.getRadioQueueState();
  assert.equal(afterArchive.session.sessionId, current.session.sessionId);
  assert.equal(afterArchive.session.status, "archived");
  assert.equal(afterArchive.isCurrentSession, false);
  assert.equal(JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions")).activeSessionId, current.session.sessionId);

  await first.clearArchivedQueueSessions();
  const afterClear = await first.getRadioQueueState();
  assert.equal(afterClear.session, undefined);
  assert.equal(afterClear.sessions.length, 0);
  assert.equal(JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions")).activeSessionId, null);

  const replacement = await first.startNewQueueSession({ requestId: "replacement-after-archive-1", title: "Replacement show" });
  assert.notEqual(replacement.session.sessionId, older.session.sessionId);
  assert.notEqual(replacement.session.sessionId, current.session.sessionId);
  assert.equal(replacement.session.title, "Replacement show");
});

test("Start fails visibly when a non-archived legacy session is not the selected slot owner", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://legacy-nonselected-show.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first, second } = loadIndependentQueueModules();

  const archived = await first.startNewQueueSession({ requestId: "legacy-selected-1", title: "Selected archive" });
  await first.archiveQueueSession(archived.session.sessionId);
  const residue = await first.startNewQueueSession({ requestId: "legacy-residue-1", title: "Closed residue" });
  const raw = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  raw.activeSessionId = archived.session.sessionId;
  FakeRedis.values.set("radioQueue:v2:sessions", JSON.stringify(raw));
  const revisionBefore = raw.revision;

  const visible = await second.getRadioQueueState();
  assert.equal(visible.session.sessionId, archived.session.sessionId);
  assert.equal(visible.session.status, "archived");
  await assertQueueOperationError(
    () => second.startNewQueueSession({ requestId: "legacy-new-1", title: "Must not silently adopt" }),
    "queue_state_conflict",
    409,
  );
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), revisionBefore);
  assert.equal(JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions")).activeSessionId, archived.session.sessionId);
  assert.equal(raw.sessions.some((session) => session.sessionId === residue.session.sessionId), true);
});

test("production reads never fall through to shared Redis without a verified durable snapshot", async () => {
  resetQueueTestState();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-only.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "shared-token";
  try {
    const { first } = loadIndependentQueueModules();
    await assertQueueOperationError(
      () => first.getRadioQueueState(),
      "queue_storage_configuration_invalid",
      503,
    );
    assert.equal(FakeRedis.calls.length, 0, "unsafe shared Redis must not be read as QueueStore");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("production dedicated empty Redis plus empty Blob reports no session without writes", async () => {
  resetQueueTestState();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.QUEUE_REDIS_REST_URL = "https://dedicated-empty.upstash.io";
  process.env.QUEUE_REDIS_REST_TOKEN = "dedicated-token";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    const { first } = loadIndependentQueueModules();
    const state = await first.getRadioQueueState();
    assert.equal(state.session, undefined);
    assert.deepEqual(state.sessions, []);
    assert.equal(FakeRedis.calls.some(([operation]) => operation === "set" || operation === "eval"), false);
    assert.equal(FakeBlob.calls.some(([operation]) => operation === "put"), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("a warm worker serves its last verified durable snapshot when Blob and Redis both fail", async () => {
  resetQueueTestState();
  process.env.BLOB_READ_WRITE_TOKEN = "warm-fallback-blob-token";
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://warm-fallback.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  try {
    const { first } = loadIndependentQueueModules();
    const started = await first.startNewQueueSession({ requestId: "warm-fallback-start", title: "Warm verified queue" });
    const confirmed = await first.getRadioQueueState();
    assert.equal(confirmed.session.sessionId, started.session.sessionId);

    FakeBlob.getFailure = new Error("Blob read unavailable");
    FakeRedis.failAllCommands = true;
    const retained = await first.getRadioQueueState();
    assert.equal(retained.revision, confirmed.revision);
    assert.equal(retained.session.sessionId, confirmed.session.sessionId);
    assert.equal(retained.session.title, "Warm verified queue");
    assert.equal(retained.storageAuthority, "degraded_cached");
    const publicSnapshot = await first.getPublicQueueSnapshot();
    assert.equal(publicSnapshot.storageAuthority, "degraded_cached");
    assert.equal(publicSnapshot.session.sessionId, confirmed.session.sessionId);
  } finally {
    FakeBlob.getFailure = null;
    FakeRedis.failAllCommands = false;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  }
});

test("warm Redis and durable caches are never reused across a Blob resource change", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://cache-scope.example.test");
  process.env.BLOB_READ_WRITE_TOKEN = "cache-scope-token-a";
  const { first } = loadIndependentQueueModules();

  await first.startNewQueueSession({ requestId: "cache-scope-start-1", title: "Old resource state" });
  await first.getRadioQueueState();
  process.env.BLOB_READ_WRITE_TOKEN = "cache-scope-token-b";
  FakeBlob.getFailure = new Error("New Blob resource unavailable");
  FakeRedis.failAllCommands = true;

  await assertQueueOperationError(
    () => first.getRadioQueueState(),
    "queue_state_unavailable",
    503,
  );
});

test("Redis-ahead state without an exact prepared snapshot blocks even an idempotent Start retry", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://redis-ahead.example.test");
  const { first, second, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "redis-ahead-start-1", title: "Committed show" });
  const committedRevision = started.revision;
  const redisAhead = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  redisAhead.revision = committedRevision + 1;
  redisAhead.sessions[0].description = "Unverified Redis-only mutation";
  FakeRedis.values.set("radioQueue:v2:sessions", JSON.stringify(redisAhead));
  FakeRedis.values.set("radioQueue:v2:sessions:mutation-revision", committedRevision + 1);

  await assertQueueOperationError(
    () => second.startNewQueueSession({ requestId: "redis-ahead-start-1", title: "Committed show" }),
    "queue_state_conflict",
    409,
    /ahead of the durable snapshot/i,
  );
  const durable = await secondDurable.readQueueDurableSnapshot();
  assert.equal(durable.revision, committedRevision);
  assert.equal(durable.sessions[0].description, started.session.description);
});

test("an exact immutable prepared snapshot can finish an interrupted Redis-ahead commit", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://prepared-reconcile.example.test");
  const { first, second, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "prepared-reconcile-start-1", title: "Prepared recovery" });
  const prepared = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  prepared.revision = started.revision + 1;
  prepared.sessions[0].description = "Exact prepared Redis state";
  FakeRedis.values.set("radioQueue:v2:sessions", JSON.stringify(prepared));
  FakeRedis.values.set("radioQueue:v2:sessions:mutation-revision", prepared.revision);
  const fixture = durableSnapshotFixture(prepared);
  await FakeBlob.put(fixture.revisionPath, JSON.stringify(fixture.envelope));
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(fixture.envelope));
  assert.equal(FakeBlob.values.has(fixture.commitPath), false);

  const replayed = await second.startNewQueueSession({ requestId: "prepared-reconcile-start-1", title: "Prepared recovery" });
  assert.equal(replayed.sessionCreated, false);
  assert.equal(replayed.revision, prepared.revision);
  assert.equal(FakeBlob.values.has(fixture.commitPath), true);
  const durable = await secondDurable.readQueueDurableSnapshot();
  assert.equal(durable.revision, prepared.revision);
  assert.equal(durable.sessions[0].description, "Exact prepared Redis state");
});

test("exact prepared Redis-ahead recovery fences the captured raw representation", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://prepared-raw-reconcile.example.test");
  const { first, second, secondDurable } = loadIndependentQueueModules();
  const started = await first.startNewQueueSession({ requestId: "prepared-raw-1", title: "Raw prepared recovery" });
  const prepared = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  prepared.revision = started.revision + 1;
  prepared.sessions[0].description = "Canonical prepared payload";
  const rawWithIgnoredField = JSON.stringify({ rollingDeployIgnoredField: "preserve bytes", ...prepared }, null, 2);
  FakeRedis.values.set("radioQueue:v2:sessions", rawWithIgnoredField);
  FakeRedis.values.set("radioQueue:v2:sessions:mutation-revision", prepared.revision);
  const fixture = durableSnapshotFixture(prepared);
  await FakeBlob.put(fixture.revisionPath, JSON.stringify(fixture.envelope));

  const replayed = await second.startNewQueueSession({ requestId: "prepared-raw-1", title: "Raw prepared recovery" });
  assert.equal(replayed.sessionCreated, false);
  assert.equal(replayed.revision, prepared.revision);
  assert.equal((await secondDurable.readQueueDurableSnapshot()).revision, prepared.revision);
});

test("exact immutable-only reconciliation promotes a bounded current head even when manifest repair fails", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://prepared-current-head.example.test");
  const { first, second } = loadIndependentQueueModules();
  const started = await first.startNewQueueSession({ requestId: "prepared-current-head-1", title: "Prepared recovery" });
  const prepared = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  prepared.revision = started.revision + 1;
  prepared.sessions[0].description = "Immutable-only Redis state";
  FakeRedis.values.set("radioQueue:v2:sessions", JSON.stringify(prepared));
  FakeRedis.values.set("radioQueue:v2:sessions:mutation-revision", prepared.revision);
  const fixture = durableSnapshotFixture(prepared);
  await FakeBlob.put(fixture.revisionPath, JSON.stringify(fixture.envelope));
  FakeBlob.failPutPaths.add("barcode-radio-queue-state/v1/committed.json");

  await assertQueueOperationError(
    () => second.startNewQueueSession({ requestId: "prepared-current-head-1", title: "Prepared recovery" }),
    "queue_state_ambiguous",
    409,
    /baseline manifest could not be confirmed/i,
  );
  assert.equal(FakeBlob.values.has(fixture.commitPath), true);
  const current = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/current.json").body);
  assert.equal(current.revision, prepared.revision);

  const { firstDurable: coldDurable } = loadIndependentQueueModules();
  const recovered = await coldDurable.readQueueDurableSnapshot();
  assert.equal(recovered.revision, prepared.revision);
  assert.equal(recovered.sessions[0].description, "Immutable-only Redis state");
});

test("hot recovery fails closed when an unmarked current pointer hides the bounded committed head", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://orphan-snapshot.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "orphan-start-1", title: "Last committed show" });
  const orphan = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  orphan.revision = started.revision + 1;
  orphan.sessions[0].title = "Must never be recovered";
  const fixture = durableSnapshotFixture(orphan);
  await FakeBlob.put(fixture.revisionPath, JSON.stringify(fixture.envelope));
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(fixture.envelope));
  FakeBlob.values.delete("barcode-radio-queue-state/v1/committed.json");

  await assert.rejects(
    () => secondDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError" },
  );
  assert.equal(FakeBlob.values.has(fixture.commitPath), false);
});

test("a valid newer commit marker with a missing immutable fails closed instead of rolling back", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://missing-immutable.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "missing-immutable-start-1", title: "Committed revision" });
  const missing = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  missing.revision = started.revision + 1;
  missing.sessions[0].title = "Marker without immutable";
  const fixture = durableSnapshotFixture(missing);
  await FakeBlob.put(fixture.commitPath, JSON.stringify(fixture.marker));

  await assert.rejects(
    () => secondDurable.auditQueueDurableSnapshots(),
    { name: "QueueDurableSnapshotIntegrityError", message: /revision 2 cannot be verified/i },
  );
});

test("a valid committed manifest with a corrupt immutable fails closed", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://corrupt-manifest-immutable.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "corrupt-manifest-start-1", title: "Committed revision" });
  const corrupt = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  corrupt.revision = started.revision + 1;
  corrupt.sessions[0].title = "Corrupt manifest target";
  const fixture = durableSnapshotFixture(corrupt);
  await FakeBlob.put(fixture.revisionPath, "{corrupt");
  await FakeBlob.put("barcode-radio-queue-state/v1/committed.json", JSON.stringify(fixture.marker));

  await assert.rejects(
    () => secondDurable.auditQueueDurableSnapshots(),
    { name: "QueueDurableSnapshotIntegrityError", message: /revision 2 cannot be verified/i },
  );
});

test("a manifest and immutable cannot become authority without the canonical commit marker", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://manifest-without-commit.example.test");
  const { firstDurable } = loadIndependentQueueModules();
  const state = { revision: 1, activeSessionId: null, sessions: [] };
  const fixture = durableSnapshotFixture(state);
  await FakeBlob.put("barcode-radio-queue-state/v1/protocol-v2.json", JSON.stringify({
    schemaVersion: 2,
    protocol: "committed-revision-markers",
  }));
  await FakeBlob.put(fixture.revisionPath, JSON.stringify(fixture.envelope));
  await FakeBlob.put("barcode-radio-queue-state/v1/committed.json", JSON.stringify(fixture.marker));

  await assert.rejects(
    () => firstDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError", message: /Canonical commit marker .* cannot be verified/i },
  );
});

test("an exact checksummed current pointer can prove a committed marker whose immutable is unavailable", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://current-proof.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "current-proof-start-1", title: "Committed revision" });
  const proved = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  proved.revision = started.revision + 1;
  proved.sessions[0].title = "Exact current proof";
  const fixture = durableSnapshotFixture(proved);
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(fixture.envelope));
  await FakeBlob.put(fixture.commitPath, JSON.stringify(fixture.marker));

  const recovered = await secondDurable.readQueueDurableSnapshot();
  assert.equal(recovered.revision, fixture.envelope.revision);
  assert.equal(recovered.sessions[0].title, "Exact current proof");
});

test("a canonical commit blob with invalid or filename-mismatched content fails closed", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://canonical-marker-integrity.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "canonical-marker-start-1", title: "Committed revision" });
  const next = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  next.revision = started.revision + 1;
  const nextFixture = durableSnapshotFixture(next);
  const originalCurrent = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/current.json").body);
  const originalFixture = durableSnapshotFixture(originalCurrent.state, originalCurrent.savedAt);
  await FakeBlob.put(nextFixture.commitPath, JSON.stringify(originalFixture.marker));

  await assert.rejects(
    () => secondDurable.auditQueueDurableSnapshots(),
    { name: "QueueDurableSnapshotIntegrityError", message: /marker .* cannot be verified/i },
  );
});

test("an unreadable listed canonical commit marker fails closed", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://unreadable-marker.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();
  await first.startNewQueueSession({ requestId: "unreadable-marker-start-1", title: "Committed revision" });
  const markerPath = [...FakeBlob.values.keys()].find((pathname) => (
    pathname.startsWith("barcode-radio-queue-state/v1/commits/")
  ));
  assert.ok(markerPath);
  FakeBlob.getFailurePaths.add(markerPath);

  await assert.rejects(
    () => secondDurable.auditQueueDurableSnapshots(),
    { name: "QueueDurableSnapshotIntegrityError", message: /marker .* cannot be read/i },
  );
});

test("noncanonical copied marker junk cannot influence numeric committed revision selection", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://numeric-marker-selection.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "numeric-marker-start-1", title: "Revision one" });
  const revisionTwo = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  revisionTwo.revision = started.revision + 1;
  revisionTwo.sessions[0].title = "Numeric revision two";
  const revisionTwoFixture = durableSnapshotFixture(revisionTwo);
  await FakeBlob.put(revisionTwoFixture.revisionPath, JSON.stringify(revisionTwoFixture.envelope));
  await FakeBlob.put(revisionTwoFixture.commitPath, JSON.stringify(revisionTwoFixture.marker));
  const oldManifest = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/committed.json").body);
  await FakeBlob.put("barcode-radio-queue-state/v1/commits/zzzz-copied-marker.json", JSON.stringify(oldManifest));

  const recovered = await secondDurable.auditQueueDurableSnapshots();
  assert.equal(recovered.revision, revisionTwo.revision);
  assert.equal(recovered.sessions[0].title, "Numeric revision two");
});

test("hot durable reads use a bounded Blob operation count independent of marker history", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://bounded-hot-read.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();
  const started = await first.startNewQueueSession({ requestId: "bounded-read-start-1", title: "Bounded head" });

  FakeBlob.calls.length = 0;
  const initial = await secondDurable.readQueueDurableSnapshot();
  const initialOperations = FakeBlob.calls.map(([operation]) => operation);
  assert.equal(initial.revision, started.revision);
  assert.equal(initialOperations.includes("list"), false);

  const base = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  for (let revision = 10; revision < 110; revision += 1) {
    const historical = structuredClone(base);
    historical.revision = revision;
    historical.sessions[0].title = `Unheaded history ${revision}`;
    const fixture = durableSnapshotFixture(historical);
    await FakeBlob.put(fixture.revisionPath, JSON.stringify(fixture.envelope));
    await FakeBlob.put(fixture.commitPath, JSON.stringify(fixture.marker));
  }
  FakeBlob.calls.length = 0;
  const afterHistory = await secondDurable.readQueueDurableSnapshot();
  const afterOperations = FakeBlob.calls.map(([operation]) => operation);
  assert.equal(afterHistory.revision, started.revision, "hot reads follow bounded committed heads, not lifetime history");
  assert.deepEqual(afterOperations, initialOperations);
  assert.equal(afterOperations.includes("list"), false);
});

test("a present but invalid protocol marker cannot reactivate an uncommitted current pointer", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://invalid-protocol.example.test");
  const { first, second, secondDurable } = loadIndependentQueueModules();

  await first.startNewQueueSession({ requestId: "invalid-protocol-start-1", title: "Committed revision" });
  const ambiguous = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  ambiguous.revision += 1;
  ambiguous.sessions[0].title = "Uncommitted pointer";
  const fixture = durableSnapshotFixture(ambiguous);
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(fixture.envelope));
  await FakeBlob.put("barcode-radio-queue-state/v1/protocol-v2.json", "{corrupt");

  await assert.rejects(
    () => secondDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError", message: /protocol marker is invalid/i },
  );
  await assertQueueOperationError(
    () => second.getRadioQueueState(),
    "queue_state_conflict",
    409,
    /protocol marker is invalid/i,
  );
});

test("protocol v2 with only an uncommitted current pointer fails closed on fresh reads", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://v2-no-authority.example.test");
  const { first, firstDurable } = loadIndependentQueueModules();
  const uncommitted = { revision: 1, activeSessionId: null, sessions: [] };
  const fixture = durableSnapshotFixture(uncommitted);
  await FakeBlob.put("barcode-radio-queue-state/v1/protocol-v2.json", JSON.stringify({
    schemaVersion: 2,
    protocol: "committed-revision-markers",
  }));
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(fixture.envelope));

  await assert.rejects(
    () => firstDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError", message: /No committed durable queue snapshot/i },
  );
  await assertQueueOperationError(
    () => first.getRadioQueueState(),
    "queue_state_conflict",
    409,
    /No committed durable queue snapshot/i,
  );
});

test("legacy reads stay read-only and continue following current until a fenced mutation migrates", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://legacy-stale-marker.example.test");
  const { firstDurable } = loadIndependentQueueModules();
  const legacyOne = { revision: 1, activeSessionId: null, sessions: [] };
  const firstFixture = durableSnapshotFixture(legacyOne);
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(firstFixture.envelope));
  assert.equal((await firstDurable.readQueueDurableSnapshot()).revision, 1);
  assert.equal(FakeBlob.values.has(firstFixture.commitPath), false, "ordinary reads must not seed commit artifacts");
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/protocol-v2.json"), false);

  const legacyTwo = { revision: 2, activeSessionId: null, sessions: [] };
  const secondFixture = durableSnapshotFixture(legacyTwo);
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(secondFixture.envelope));
  assert.equal((await firstDurable.readQueueDurableSnapshot()).revision, 2);
  assert.equal(FakeBlob.calls.some(([operation]) => operation === "put"), true, "fixture writes are recorded");
  assert.equal(FakeBlob.values.has(firstFixture.commitPath), false);
  assert.equal(FakeBlob.values.has(secondFixture.commitPath), false);
});

test("legacy Redis normalization is deterministic and a successful v2 commit retires the exact legacy key", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://legacy-deterministic.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const rawLegacy = JSON.stringify({
    isOpen: true,
    queue: [legacyEntry(1, { id: "legacy-deterministic-track" })],
    completed: [],
    removed: [],
    spotlight: [],
  });
  FakeRedis.values.set("radioQueue:v1:state", rawLegacy);
  const { first, second } = loadIndependentQueueModules();

  const firstRead = await first.getRadioQueueState();
  const secondRead = await second.getRadioQueueState();
  assert.equal(firstRead.session.sessionId, secondRead.session.sessionId);
  assert.equal(firstRead.session.createdAt, secondRead.session.createdAt);

  await first.setQueueOpen(false);
  assert.equal(FakeRedis.values.has("radioQueue:v1:state"), false);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), true);
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 1);
});

test("a legacy-only pending crash is abandoned deterministically and the exact retry commits once", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://legacy-pending-retry.example.test");
  const rawLegacy = JSON.stringify({
    isOpen: true,
    queue: [legacyEntry(2, { id: "legacy-pending-track" })],
    completed: [],
    removed: [],
    spotlight: [],
  });
  FakeRedis.values.set("radioQueue:v1:state", rawLegacy);
  FakeRedis.commitFailure = {
    when: "before",
    observationFailures: 2,
    message: "legacy commit acknowledgement unavailable",
  };
  const { first, second } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.setQueueOpen(false),
    "queue_state_ambiguous",
    409,
    /Redis commit outcome is unavailable/i,
  );
  assert.equal(FakeRedis.values.get("radioQueue:v1:state"), rawLegacy);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "pending");

  const retried = await second.setQueueOpen(false);
  assert.equal(retried.isOpen, false);
  assert.equal(FakeRedis.values.has("radioQueue:v1:state"), false);
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 1);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "resolved");
});

test("a concurrent legacy rewrite after durable prepare is never overwritten by the v2 commit", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://legacy-concurrent-write.example.test");
  const originalLegacy = JSON.stringify({
    isOpen: true,
    queue: [legacyEntry(3, { id: "legacy-original-track" })],
    completed: [],
  });
  const newerLegacy = JSON.stringify({
    isOpen: true,
    queue: [legacyEntry(4, { id: "legacy-newer-track" })],
    completed: [],
  });
  FakeRedis.values.set("radioQueue:v1:state", originalLegacy);
  FakeRedis.beforeCommit = async () => {
    FakeRedis.values.set("radioQueue:v1:state", newerLegacy);
  };
  const { first } = loadIndependentQueueModules();

  await assertQueueOperationError(() => first.setQueueOpen(false), "queue_state_conflict", 409);
  assert.equal(FakeRedis.values.get("radioQueue:v1:state"), newerLegacy);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "pending");
});

test("losing the Redis fence during protocol migration cannot produce a clean stale durable read", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://migration-fence-loss.example.test");
  const originalLegacy = JSON.stringify({
    isOpen: true,
    queue: [legacyEntry(5, { id: "migration-original-track" })],
    completed: [],
  });
  const newerLegacy = JSON.stringify({
    isOpen: true,
    queue: [legacyEntry(6, { id: "migration-newer-track" })],
    completed: [],
  });
  FakeRedis.values.set("radioQueue:v1:state", originalLegacy);
  FakeBlob.beforePutByPath.set("barcode-radio-queue-state/v1/protocol-v2.json", async () => {
    FakeRedis.values.delete("radioQueue:v2:sessions:mutation-lock");
    FakeRedis.values.set("radioQueue:v1:state", newerLegacy);
  });
  const { first } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.setQueueOpen(false),
    "queue_storage_unavailable",
    503,
    /fencing lease could not be confirmed/i,
  );
  assert.equal(FakeRedis.values.get("radioQueue:v1:state"), newerLegacy);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/protocol-v2.json"), true);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "pending");
  const { first: coldWorker } = loadIndependentQueueModules();
  await assertQueueOperationError(() => coldWorker.getRadioQueueState(), "queue_state_conflict", 409);
});

test("a legacy rewrite during baseline manifest seeding remains visibly pending before protocol enable", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://migration-manifest-fence-loss.example.test");
  const originalLegacy = JSON.stringify({
    isOpen: true,
    queue: [legacyEntry(7, { id: "manifest-original-track" })],
    completed: [],
  });
  const newerLegacy = JSON.stringify({
    isOpen: true,
    queue: [legacyEntry(8, { id: "manifest-newer-track" })],
    completed: [],
  });
  FakeRedis.values.set("radioQueue:v1:state", originalLegacy);
  FakeBlob.beforePutByPath.set("barcode-radio-queue-state/v1/committed.json", () => {
    FakeRedis.values.delete("radioQueue:v2:sessions:mutation-lock");
    FakeRedis.values.set("radioQueue:v1:state", newerLegacy);
  });
  const { first } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.setQueueOpen(false),
    "queue_storage_unavailable",
    503,
    /fencing lease could not be confirmed/i,
  );
  assert.equal(FakeRedis.values.get("radioQueue:v1:state"), newerLegacy);
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/protocol-v2.json"), false);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "pending");
  const { first: coldWorker } = loadIndependentQueueModules();
  await assertQueueOperationError(() => coldWorker.getRadioQueueState(), "queue_state_conflict", 409);
});

test("deleting the protocol marker cannot make an unmarked newer current look legacy", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://deleted-protocol.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  const committed = await first.startNewQueueSession({ requestId: "deleted-protocol-start-1", title: "Committed revision" });
  FakeBlob.values.delete("barcode-radio-queue-state/v1/protocol-v2.json");
  const unmarked = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  unmarked.revision = committed.revision + 1;
  unmarked.sessions[0].title = "Unmarked prepared current";
  const fixture = durableSnapshotFixture(unmarked);
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(fixture.envelope));

  await assert.rejects(
    () => secondDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError", message: /legacy current and committed queue snapshot artifacts do not match/i },
  );
});

test("prepared reconciliation cannot enable protocol v2 when the legacy seed fails", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://legacy-seed-failure.example.test");
  const { firstDurable } = loadIndependentQueueModules();
  const legacy = { revision: 1, activeSessionId: null, sessions: [] };
  const legacyFixture = durableSnapshotFixture(legacy);
  await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(legacyFixture.envelope));
  const prepared = { revision: 2, activeSessionId: null, sessions: [] };
  const preparedFixture = durableSnapshotFixture(prepared);
  await FakeBlob.put(preparedFixture.revisionPath, JSON.stringify(preparedFixture.envelope));
  FakeBlob.failPutPaths.add(legacyFixture.commitPath);

  await assert.rejects(() => firstDurable.commitPreparedQueueDurableSnapshotIfExact(prepared));
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/protocol-v2.json"), false);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "pending");
  await assert.rejects(
    () => firstDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError", message: /pending commit resolution/i },
  );
  FakeBlob.failPutPaths.delete(legacyFixture.commitPath);
  assert.equal(await firstDurable.commitPreparedQueueDurableSnapshotIfExact(prepared), true);
  assert.equal((await firstDurable.readQueueDurableSnapshot()).revision, 2);
});

test("a failed first immutable prepare leaves protocol disabled and Start can retry from unchanged Redis", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://first-prepare-retry.example.test");
  const { first, firstDurable } = loadIndependentQueueModules();
  FakeBlob.failPutPrefixes.add("barcode-radio-queue-state/v1/revisions/000000000001-");

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "first-prepare-retry-1", title: "Retryable first show" }),
    "queue_storage_unavailable",
    503,
    /prepare could not be confirmed/i,
  );
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);
  assert.equal(await firstDurable.readQueueDurableSnapshot(), null);
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/protocol-v2.json"), false);
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/pending.json"), false);

  FakeBlob.failPutPrefixes.clear();
  const retried = await first.startNewQueueSession({ requestId: "first-prepare-retry-1", title: "Retryable first show" });
  assert.equal(retried.sessionCreated, true);
  assert.equal(retried.sessions.length, 1);
  const committed = await firstDurable.readQueueDurableSnapshot();
  assert.equal(committed.revision, retried.revision);
  assert.equal(committed.sessions.length, 1);
  assert.equal(committed.sessions[0].startRequestId, "first-prepare-retry-1");
});

test("a protocol PUT failure after baseline seeding remains recoverable and retryable", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://baseline-protocol-retry.example.test");
  const { first, firstDurable } = loadIndependentQueueModules();
  FakeBlob.failPutPaths.add("barcode-radio-queue-state/v1/protocol-v2.json");

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "baseline-protocol-retry-1", title: "Retry after protocol failure" }),
    "queue_storage_unavailable",
    503,
    /protocol could not be confirmed/i,
  );
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/protocol-v2.json"), false);
  await assert.rejects(
    () => firstDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError", message: /pending commit resolution/i },
  );

  FakeBlob.failPutPaths.delete("barcode-radio-queue-state/v1/protocol-v2.json");
  const retried = await first.startNewQueueSession({
    requestId: "baseline-protocol-retry-1",
    title: "Retry after protocol failure",
  });
  assert.equal(retried.sessionCreated, true);
  assert.equal(retried.sessions.length, 1);
  assert.equal((await firstDurable.readQueueDurableSnapshot()).revision, retried.revision);
});

test("baseline manifest failure cannot enable protocol v2 or brick a later retry", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://baseline-manifest-retry.example.test");
  const { first, firstDurable } = loadIndependentQueueModules();
  FakeBlob.failPutPaths.add("barcode-radio-queue-state/v1/committed.json");

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "baseline-manifest-retry-1", title: "Retry after head failure" }),
    "queue_storage_unavailable",
    503,
    /baseline manifest could not be confirmed/i,
  );
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/protocol-v2.json"), false);
  await assert.rejects(
    () => firstDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError", message: /pending commit resolution/i },
  );

  FakeBlob.failPutPaths.delete("barcode-radio-queue-state/v1/committed.json");
  const retried = await first.startNewQueueSession({
    requestId: "baseline-manifest-retry-1",
    title: "Retry after head failure",
  });
  assert.equal(retried.sessionCreated, true);
  assert.equal((await firstDurable.readQueueDurableSnapshot()).revision, retried.revision);
});

test("the exported durable persist API refuses brand-new protocol initialization without a baseline", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://required-baseline.example.test");
  const { firstDurable } = loadIndependentQueueModules();

  await assert.rejects(
    () => firstDurable.persistQueueDurableSnapshot({ revision: 1, activeSessionId: null, sessions: [] }),
    { name: "QueueDurableSnapshotWriteError", message: /baseline is required/i },
  );
  assert.equal(FakeBlob.calls.some(([operation]) => operation === "put"), false);
});

test("append-only committed markers defeat regressed mutable Blob pointers", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://pointer-regression.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "pointer-regression-start-1", title: "Revision one" });
  const revisionTwo = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  revisionTwo.revision = started.revision + 1;
  revisionTwo.sessions[0].title = "Newest committed revision";
  const fixture = durableSnapshotFixture(revisionTwo);
  await FakeBlob.put(fixture.revisionPath, JSON.stringify(fixture.envelope));
  await FakeBlob.put(fixture.commitPath, JSON.stringify(fixture.marker));
  // current.json and committed.json intentionally remain at revision one.

  const recovered = await secondDurable.auditQueueDurableSnapshots();
  assert.equal(recovered.revision, revisionTwo.revision);
  assert.equal(recovered.sessions[0].title, "Newest committed revision");
});

test("conditional pointer promotion cannot overwrite a concurrently newer current.json", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://pointer-cas.example.test");
  FakeBlob.beforePutByPath.set("barcode-radio-queue-state/v1/current.json", async (_pathname, body) => {
    const proposed = JSON.parse(typeof body === "string" ? body : Buffer.from(body).toString("utf8"));
    const newerState = structuredClone(proposed.state);
    newerState.revision = proposed.revision + 1;
    newerState.sessions[0].title = "Concurrent newer pointer";
    const newer = durableSnapshotFixture(newerState);
    await FakeBlob.put("barcode-radio-queue-state/v1/current.json", JSON.stringify(newer.envelope));
  });
  const { first } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "pointer-cas-start-1", title: "Stale pointer writer" }),
    "queue_state_ambiguous",
    409,
    /current pointer promotion could not be confirmed/i,
  );
  const current = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/current.json").body);
  assert.equal(current.revision, 2);
  assert.equal(current.state.sessions[0].title, "Concurrent newer pointer");
  assert.equal(
    [...FakeBlob.values.keys()].some((pathname) => (
      pathname.startsWith("barcode-radio-queue-state/v1/commits/")
      && !pathname.includes("/000000000000-")
    )),
    false,
  );
});

test("a lost Redis commit acknowledgement is reconciled only after exact state and fence verification", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://commit-ack.example.test");
  FakeRedis.commitFailure = { when: "after", message: "Redis commit acknowledgement lost" };
  const { first, firstDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "commit-ack-start-1", title: "Confirmed after ACK loss" });
  assert.equal(started.sessionCreated, true);
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), started.revision);
  const durable = await firstDurable.readQueueDurableSnapshot();
  assert.equal(durable.revision, started.revision);
  assert.equal(durable.sessions[0].sessionId, started.session.sessionId);
});

test("a delayed Redis commit cannot land after an exact refused outcome is reported", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://commit-delayed.example.test");
  FakeRedis.commitFailure = {
    when: "delayed-after-observation",
    message: "Redis transport failed before delayed execution",
  };
  const { first, firstDurable } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "commit-delayed-start-1", title: "Must stay refused" }),
    "queue_storage_unavailable",
    503,
    /transport failed before delayed execution/i,
  );
  const delayedResults = await Promise.all(FakeRedis.delayedCommandResults);
  assert.deepEqual(delayedResults, [-1], "revoking the exact prior-state lock must fence the delayed EVAL");
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "resolved");
  const durable = await firstDurable.readQueueDurableSnapshot();
  assert.equal(durable.revision, 0);
  assert.deepEqual(durable.sessions, []);
});

test("Redis commit refuses a same-revision raw state change that occurs after durable prepare", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://commit-exact-prior.example.test");
  const { first } = loadIndependentQueueModules();
  await first.startNewQueueSession({ requestId: "commit-exact-prior-1", title: "Exact prior state" });
  let replacementRaw = "";
  FakeRedis.beforeCommit = async ({ stateKey }) => {
    const parsed = JSON.parse(FakeRedis.values.get(stateKey));
    replacementRaw = JSON.stringify({ rollingDeployRepresentation: true, ...parsed });
    FakeRedis.values.set(stateKey, replacementRaw);
  };

  await assertQueueOperationError(
    () => first.setQueueOpen(true),
    "queue_state_conflict",
    409,
  );
  assert.equal(FakeRedis.values.get("radioQueue:v2:sessions"), replacementRaw);
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 1);
  assert.equal(
    [...FakeBlob.values.keys()].some((pathname) => pathname.includes("/commits/000000000002-")),
    false,
  );
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "pending");
  const { first: coldWorker } = loadIndependentQueueModules();
  await assertQueueOperationError(
    () => coldWorker.getRadioQueueState(),
    "queue_state_conflict",
    409,
  );
});

test("mutation Redis preserves exact noncanonical JSON bytes for unchanged Lua fencing", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://raw-json-fence.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first, second } = loadIndependentQueueModules();
  await first.startNewQueueSession({ requestId: "raw-json-fence-1", title: "Raw JSON" });
  const noncanonicalRaw = JSON.stringify(JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions")), null, 2);
  FakeRedis.values.set("radioQueue:v2:sessions", noncanonicalRaw);

  const opened = await second.setQueueOpen(true);
  assert.equal(opened.isOpen, true);
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 2);
  assert.ok(
    FakeRedis.constructorOptions.every((options) => options.automaticDeserialization === false),
    "all authoritative Redis clients must return the exact stored bytes",
  );
});

test("Redis commit atomically renews a near-expiry mutation lease", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://commit-renewal.example.test");
  const { first } = loadIndependentQueueModules();
  FakeRedis.beforeCommit = async ({ lockKey }) => {
    FakeRedis.lockExpiries.set(lockKey, Date.now() + 100);
  };

  await first.startNewQueueSession({ requestId: "commit-renewal-1", title: "Renew at commit" });
  assert.deepEqual(FakeRedis.commitRenewals, [15_000]);
  assert.ok(
    FakeRedis.commitRenewalDeadlines[0] - Date.now() > 14_000,
    "the atomic commit must extend the same lock token before durable promotion",
  );
});

test("a direct commit conflict preserves pending intent when Redis already contains the exact target", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://commit-target-race.example.test");
  const { first } = loadIndependentQueueModules();
  await first.startNewQueueSession({ requestId: "commit-target-race-1", title: "Target race" });
  FakeRedis.beforeCommit = async ({ stateKey, revisionKey, nextState, nextRevision }) => {
    FakeRedis.values.set(stateKey, nextState);
    FakeRedis.values.set(revisionKey, nextRevision);
  };

  await assertQueueOperationError(
    () => first.setQueueOpen(true),
    "queue_state_conflict",
    409,
  );
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 2);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "pending");
  const { first: coldWorker } = loadIndependentQueueModules();
  await assertQueueOperationError(() => coldWorker.getRadioQueueState(), "queue_state_conflict", 409);
});

test("a crash-equivalent refusal after durable prepare leaves only a harmless orphan and can retry", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://prepare-before-redis.example.test");
  FakeRedis.commitFailure = { when: "before", message: "Redis commit refused after durable prepare" };
  const { first, firstDurable } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "prepare-before-redis-1", title: "Prepared before Redis" }),
    "queue_storage_unavailable",
    503,
    /refused after durable prepare/i,
  );
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);
  assert.ok([...FakeBlob.values.keys()].some((pathname) => pathname.includes("/revisions/000000000001-")));
  assert.equal([...FakeBlob.values.keys()].some((pathname) => pathname.includes("/commits/000000000001-")), false);
  assert.equal((await firstDurable.readQueueDurableSnapshot()).revision, 0);

  const retried = await first.startNewQueueSession({ requestId: "prepare-before-redis-1", title: "Prepared before Redis" });
  assert.equal(retried.sessionCreated, true);
  assert.equal(retried.sessions.length, 1);
});

test("a Redis commit followed by pre-current failure is exactly recoverable on retry", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://redis-before-current.example.test");
  FakeBlob.failPutPaths.add("barcode-radio-queue-state/v1/current.json");
  const { first, second, secondDurable } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "redis-before-current-1", title: "Recover exact commit" }),
    "queue_state_ambiguous",
    409,
    /current pointer promotion could not be confirmed/i,
  );
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 1);
  assert.ok([...FakeBlob.values.keys()].some((pathname) => pathname.includes("/revisions/000000000001-")));
  assert.equal([...FakeBlob.values.keys()].some((pathname) => pathname.includes("/commits/000000000001-")), false);
  const { first: coldReadWorker } = loadIndependentQueueModules();
  await assertQueueOperationError(() => coldReadWorker.getRadioQueueState(), "queue_state_conflict", 409);

  FakeBlob.failPutPaths.delete("barcode-radio-queue-state/v1/current.json");
  const recovered = await second.startNewQueueSession({ requestId: "redis-before-current-1", title: "Recover exact commit" });
  assert.equal(recovered.sessionCreated, false);
  assert.equal(recovered.revision, 1);
  assert.equal((await secondDurable.readQueueDurableSnapshot()).revision, 1);
});

test("a fully committed manifest remains readable if the final pending status flip is interrupted", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://pending-resolve-interrupted.example.test");
  FakeBlob.failPutOccurrenceByPath.set("barcode-radio-queue-state/v1/pending.json", 2);
  const { first, second } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "pending-resolve-1", title: "Committed before resolve" }),
    "queue_state_ambiguous",
    409,
    /pending intent resolution could not be confirmed/i,
  );
  const pending = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body);
  const manifest = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/committed.json").body);
  assert.equal(pending.status, "pending");
  assert.equal(manifest.revision, 1);
  assert.equal(manifest.checksum, pending.checksum);

  const { first: coldWorker, firstDurable: coldDurable } = loadIndependentQueueModules();
  assert.equal((await coldDurable.readQueueDurableSnapshot()).revision, 1);
  const visible = await coldWorker.getRadioQueueState();
  assert.equal(visible.revision, 1);
  assert.equal(visible.session.title, "Committed before resolve");

  await second.setQueueOpen(true);
  assert.equal(JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body).status, "resolved");
});

test("a current plus canonical marker stays readable before manifest repair and protects the prior head on succession", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://bounded-head-succession.example.test");
  FakeBlob.failPutOccurrenceByPath.set("barcode-radio-queue-state/v1/committed.json", 2);
  const { first, second } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "bounded-head-1", title: "Committed marker head" }),
    "queue_state_ambiguous",
    409,
    /baseline manifest could not be confirmed/i,
  );
  const firstPending = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/pending.json").body);
  const firstManifest = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/committed.json").body);
  assert.equal(firstPending.status, "pending");
  assert.equal(firstManifest.revision, 0);
  const { firstDurable: coldDurable } = loadIndependentQueueModules();
  assert.equal((await coldDurable.readQueueDurableSnapshot()).revision, 1);

  FakeBlob.beforePutByPath.set("barcode-radio-queue-state/v1/current.json", () => {
    FakeRedis.values.delete("radioQueue:v2:sessions:mutation-lock");
  });
  await assertQueueOperationError(
    () => second.setQueueOpen(true),
    "queue_state_ambiguous",
    409,
    /fencing lease could not be confirmed/i,
  );
  const repairedManifest = JSON.parse(FakeBlob.values.get("barcode-radio-queue-state/v1/committed.json").body);
  assert.equal(repairedManifest.revision, 1, "the committed N head must be repaired before current is overwritten by N+1");
  const { first: coldWorker } = loadIndependentQueueModules();
  await assertQueueOperationError(() => coldWorker.getRadioQueueState(), "queue_state_conflict", 409);
});

test("an unobservable Redis commit acknowledgement loss is recoverable only from its exact prepared immutable", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://commit-ambiguous.example.test");
  FakeRedis.commitFailure = {
    when: "after",
    observationFailures: 2,
    message: "Redis commit acknowledgement lost",
  };
  const { first, second, secondDurable } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "commit-ambiguous-start-1", title: "Ambiguous show" }),
    "queue_state_ambiguous",
    409,
    /Redis commit outcome is unavailable/i,
  );
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 1);
  assert.equal(FakeBlob.values.has("barcode-radio-queue-state/v1/current.json"), false);
  const recovered = await second.startNewQueueSession({
    requestId: "commit-ambiguous-start-1",
    title: "Ambiguous show",
  });
  assert.equal(recovered.sessionCreated, false);
  assert.equal(recovered.revision, 1);
  assert.equal((await secondDurable.readQueueDurableSnapshot()).revision, 1);
});

test("a cold worker exposes an atomic Redis commit as degraded while Blob authority is unavailable", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://commit-cold-outage.example.test");
  FakeRedis.commitFailure = {
    when: "after",
    observationFailures: 2,
    message: "Redis commit acknowledgement lost",
  };
  const { first } = loadIndependentQueueModules();
  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "commit-cold-outage-1", title: "Unconfirmed Redis" }),
    "queue_state_ambiguous",
    409,
    /Redis commit outcome is unavailable/i,
  );
  FakeBlob.getFailure = new Error("Blob authority unavailable");
  const { first: coldWorker } = loadIndependentQueueModules();
  const degraded = await coldWorker.getRadioQueueState();
  assert.equal(degraded.storageAuthority, "degraded_redis_only");
  assert.equal(degraded.revision, 1);
  assert.equal(degraded.session.title, "Unconfirmed Redis");
});

test("a durable prepare failure is refused before any Redis commit or rollback", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://rollback-ack.example.test");
  FakeBlob.failPutPaths.add("barcode-radio-queue-state/v1/protocol-v2.json");
  const { first } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "rollback-ack-start-1", title: "Must roll back" }),
    "queue_storage_unavailable",
    503,
    /Durable queue snapshot protocol could not be confirmed/i,
  );
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);
  assert.equal(FakeRedis.calls.some(([, , kind]) => kind === "commit" || kind === "rollback"), false);
});

test("an immutable prepare failure cannot expose a Redis-only next revision", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://prepare-immutable-refusal.example.test");
  FakeBlob.failPutPrefixes.add("barcode-radio-queue-state/v1/revisions/000000000001-");
  const { first } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "prepare-immutable-refusal-1", title: "Never Redis-only" }),
    "queue_storage_unavailable",
    503,
    /prepare could not be confirmed/i,
  );
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
  assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);
  assert.equal(FakeRedis.calls.some(([, , kind]) => kind === "commit" || kind === "rollback"), false);
});

test("conflicting committed snapshots at one revision fail closed instead of falling back to Redis", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://durable-conflict.example.test");
  const { first, secondDurable } = loadIndependentQueueModules();

  await first.startNewQueueSession({ requestId: "durable-conflict-start-1", title: "Original committed state" });
  const divergent = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  divergent.sessions[0].title = "Conflicting committed state";
  const conflict = durableSnapshotFixture(divergent);
  await FakeBlob.put(conflict.revisionPath, JSON.stringify(conflict.envelope));
  await FakeBlob.put(conflict.commitPath, JSON.stringify(conflict.marker));

  await assert.rejects(
    () => secondDurable.auditQueueDurableSnapshots(),
    { name: "QueueDurableSnapshotIntegrityError", message: /Conflicting committed queue snapshots/i },
  );
});

test("verified durable cache wins a same-revision Redis mismatch during provider failure", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://cache-tie.example.test");
  const { first } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "cache-tie-start-1", title: "Verified durable title" });
  await first.getRadioQueueState();
  const divergent = JSON.parse(FakeRedis.values.get("radioQueue:v2:sessions"));
  divergent.sessions[0].title = "Rejected Redis title";
  FakeRedis.values.set("radioQueue:v2:sessions", JSON.stringify(divergent));
  FakeBlob.getFailure = new Error("Blob temporarily unavailable");

  const fallback = await first.getRadioQueueState();
  assert.equal(fallback.revision, started.revision);
  assert.equal(fallback.session.title, "Verified durable title");
});

test("the mutation lease is renewed while a slow durable pointer write is in flight", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://slow-durable.example.test");
  FakeBlob.putDelayMsByPath.set("barcode-radio-queue-state/v1/current.json", 5300);
  const { first, firstDurable } = loadIndependentQueueModules();

  const started = await first.startNewQueueSession({ requestId: "slow-durable-start-1", title: "Lease stays fenced" });
  const renewals = FakeRedis.calls.filter(([operation, , kind]) => operation === "eval" && kind === "renew").length;
  assert.ok(renewals >= 4, `expected a periodic renewal in addition to fence renewals, saw ${renewals}`);
  const durable = await firstDurable.readQueueDurableSnapshot();
  assert.equal(durable.revision, started.revision);
});

test("cleanup releases its distributed lease between Blob candidates", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://cleanup-race.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first } = loadIndependentQueueModules();
  const firstUrl = "https://store.private.blob.vercel-storage.com/barcode-radio-queue/cleanup-one.mp3";
  const secondUrl = "https://store.private.blob.vercel-storage.com/barcode-radio-queue/cleanup-two.mp3";

  await first.startNewQueueSession({ requestId: "cleanup-race-old", title: "Archived upload" });
  for (const [index, fileUrl] of [firstUrl, secondUrl].entries()) {
    await first.addToQueue({
      artist: `Archived Artist ${index}`,
      title: `Archived Upload ${index}`,
      link: fileUrl,
      fileUrl,
      fileName: `cleanup-${index}.mp3`,
      fileSize: 100 + index,
      mimeType: "audio/mpeg",
      sourceType: "upload",
      createdAt: "2025-01-01T00:00:00.000Z",
    });
  }
  await first.archiveCurrentQueueSession();
  const lockTokens = [];
  const result = await first.cleanupExpiredQueueUploads({
    now: new Date("2027-01-01T00:00:00.000Z"),
    deleteBlob: async () => {
      lockTokens.push(FakeRedis.values.get("radioQueue:v2:sessions:mutation-lock"));
    },
  });
  assert.deepEqual(result, { scanned: 2, deleted: 2, skippedActive: 0, failed: 0 });
  assert.equal(lockTokens.length, 2);
  assert.ok(lockTokens.every(Boolean));
  assert.notEqual(lockTokens[0], lockTokens[1], "each external delete must use a separately acquired lease");
});

test("cleanup performs no external delete while any non-archived show exists", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://cleanup-active-show.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first } = loadIndependentQueueModules();
  const uploadUrl = "https://store.private.blob.vercel-storage.com/barcode-radio-queue/cleanup-active.mp3";
  await first.startNewQueueSession({ requestId: "cleanup-active-old", title: "Archived upload" });
  await first.addToQueue({
    artist: "Archived Artist",
    title: "Archived Upload",
    link: uploadUrl,
    fileUrl: uploadUrl,
    fileName: "cleanup-active.mp3",
    fileSize: 100,
    mimeType: "audio/mpeg",
    sourceType: "upload",
    createdAt: "2025-01-01T00:00:00.000Z",
  });
  await first.archiveCurrentQueueSession();
  await first.startNewQueueSession({ requestId: "cleanup-active-current", title: "Current show" });
  let deleteCalls = 0;

  const result = await first.cleanupExpiredQueueUploads({
    now: new Date("2027-01-01T00:00:00.000Z"),
    deleteBlob: async () => { deleteCalls += 1; },
  });
  assert.deepEqual(result, { scanned: 1, deleted: 0, skippedActive: 1, failed: 0 });
  assert.equal(deleteCalls, 0);
});

test("cleanup persists a redacted provider failure without leaking signed data", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://cleanup-redaction.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first } = loadIndependentQueueModules();
  const uploadUrl = "https://store.private.blob.vercel-storage.com/barcode-radio-queue/cleanup-redaction.mp3";
  const started = await first.startNewQueueSession({ requestId: "cleanup-redaction-old", title: "Archived upload" });
  const uploaded = await first.addToQueue({
    artist: "Archived Artist",
    title: "Archived Upload",
    link: uploadUrl,
    fileUrl: uploadUrl,
    fileName: "cleanup-redaction.mp3",
    fileSize: 100,
    mimeType: "audio/mpeg",
    sourceType: "upload",
    createdAt: "2025-01-01T00:00:00.000Z",
  });
  await first.archiveCurrentQueueSession();

  const result = await first.cleanupExpiredQueueUploads({
    now: new Date("2027-01-01T00:00:00.000Z"),
    deleteBlob: async () => {
      throw new Error("signed=https://secret.example/?token=SUPER_SECRET request=req_sensitive");
    },
  });
  assert.deepEqual(result, { scanned: 1, deleted: 0, skippedActive: 0, failed: 1 });
  const archived = await first.getRadioQueueState(started.session.sessionId);
  const entry = archived.queue.find((item) => item.id === uploaded.id);
  assert.equal(entry.uploadedFileDeletionError, "Upload deletion failed.");
  assert.doesNotMatch(JSON.stringify(entry), /SUPER_SECRET|req_sensitive|secret\.example/i);
});

test("a post-delete queue write failure propagates without a second mutation attempt", async () => {
  resetQueueTestState();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_REDIS_REST_URL;
  delete process.env.QUEUE_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://cleanup-write-failure.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { first } = loadIndependentQueueModules();
  const uploadUrl = "https://store.private.blob.vercel-storage.com/barcode-radio-queue/cleanup-write-failure.mp3";
  await first.startNewQueueSession({ requestId: "cleanup-write-failure-old", title: "Archived upload" });
  await first.addToQueue({
    artist: "Archived Artist",
    title: "Archived Upload",
    link: uploadUrl,
    fileUrl: uploadUrl,
    fileName: "cleanup-write-failure.mp3",
    fileSize: 100,
    mimeType: "audio/mpeg",
    sourceType: "upload",
    createdAt: "2025-01-01T00:00:00.000Z",
  });
  await first.archiveCurrentQueueSession();
  const commitCallsBefore = FakeRedis.calls.filter(([operation, , kind]) => operation === "eval" && kind === "commit").length;
  FakeRedis.commitFailure = { when: "before", message: "cleanup status commit transport failed" };
  let deleteCalls = 0;

  await assertQueueOperationError(
    () => first.cleanupExpiredQueueUploads({
      now: new Date("2027-01-01T00:00:00.000Z"),
      deleteBlob: async () => { deleteCalls += 1; },
    }),
    "queue_storage_unavailable",
    503,
    /cleanup status commit transport failed/i,
  );
  const commitCallsAfter = FakeRedis.calls.filter(([operation, , kind]) => operation === "eval" && kind === "commit").length;
  assert.equal(deleteCalls, 1);
  assert.equal(commitCallsAfter - commitCallsBefore, 1, "cleanup must not attempt a second state write after deletion");
});

test("a lost fence after pointer upload leaves an uncommitted orphan and returns ambiguous", async () => {
  resetQueueTestState();
  configureDurableQueueTest("https://lost-fence.example.test");
  FakeBlob.beforePutByPath.set("barcode-radio-queue-state/v1/current.json", () => {
    FakeRedis.values.delete("radioQueue:v2:sessions:mutation-lock");
  });
  const { first, second, firstDurable } = loadIndependentQueueModules();

  await assertQueueOperationError(
    () => first.startNewQueueSession({ requestId: "lost-fence-start-1", title: "Fence interrupted" }),
    "queue_state_ambiguous",
    409,
    /fencing lease could not be confirmed/i,
  );
  assert.equal(Number(FakeRedis.values.get("radioQueue:v2:sessions:mutation-revision")), 1);
  assert.equal(
    [...FakeBlob.values.keys()].some((pathname) => (
      pathname.startsWith("barcode-radio-queue-state/v1/commits/")
      && !pathname.includes("/000000000000-")
    )),
    false,
  );
  await assert.rejects(
    () => firstDurable.readQueueDurableSnapshot(),
    { name: "QueueDurableSnapshotIntegrityError", message: /pending commit resolution|without a commit marker/i },
  );
  await assertQueueOperationError(
    () => first.getRadioQueueState(),
    "queue_state_conflict",
    409,
  );

  const reconciled = await second.startNewQueueSession({ requestId: "lost-fence-start-1", title: "Fence interrupted" });
  assert.equal(reconciled.sessionCreated, false);
  assert.equal(reconciled.revision, 1);
  const durable = await firstDurable.readQueueDurableSnapshot();
  assert.equal(durable.revision, 1);
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
  await second.archiveQueueSession(state.session.sessionId);
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
  await assertQueueOperationError(
    () => second.setQueueOpen(false),
    "queue_state_conflict",
    409,
    /revision is inconsistent/i,
  );
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
  await assertQueueOperationError(
    () => first.setQueueOpen(false),
    "queue_storage_unavailable",
    503,
    /max requests limit exceeded/i,
  );
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
    await assertQueueOperationError(
      () => freshWorker.setQueueOpen(false),
      "queue_storage_unavailable",
      503,
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

test("a failed durable preparation leaves Redis unchanged instead of creating an unprotected queue change", async () => {
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
    await assertQueueOperationError(
      () => first.startNewQueueSession({ title: "Must not commit without recovery copy" }),
      "queue_storage_unavailable",
      503,
      /Durable queue snapshot (?:prepare|protocol) could not be confirmed/i,
    );
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
    assert.equal(
      FakeRedis.calls.some(([operation, , kind]) => operation === "eval" && (kind === "commit" || kind === "rollback")),
      false,
      "durable preparation must finish before Redis COMMIT is attempted",
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
    await assertQueueOperationError(
      () => recoveryWorker.setQueueOpen(false),
      "queue_state_conflict",
      409,
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
    const captureBeforeImport = JSON.stringify(capture);

    // Switch to a brand-new queue-only database and a brand-new recovery epoch.
    FakeRedis.values.clear();
    FakeBlob.values.clear();
    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-queue-token";
    const { first: destinationWorker } = loadIndependentQueueModules();

    const empty = await destinationWorker.getRadioQueueState();
    assert.equal(empty.session, undefined);
    assert.equal(empty.revision, 0);
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);

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
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);

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

    FakeRedis.values.clear();
    FakeBlob.values.clear();
    process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
    process.env.QUEUE_REDIS_REST_TOKEN = "owned-queue-token";
    const { first: destinationWorker } = loadIndependentQueueModules();
    const empty = await destinationWorker.getRadioQueueState();
    assert.equal(empty.session, undefined);
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
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
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);
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
      FakeRedis.values.clear();
      FakeBlob.values.clear();
      process.env.QUEUE_REDIS_REST_URL = "https://owned-queue-only.upstash.io";
      process.env.QUEUE_REDIS_REST_TOKEN = "owned-queue-token";
      const { first: destinationWorker } = loadIndependentQueueModules();
      const empty = await destinationWorker.getRadioQueueState();
      assert.equal(empty.session, undefined);
      assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);

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
    const empty = await destinationWorker.getRadioQueueState();
    assert.equal(empty.session, undefined);
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions"), false);
    const dryRun = await destinationWorker.importHistoricalQueueSessions({ capture, dryRun: true });
    const redisBefore = FakeRedis.values.get("radioQueue:v2:sessions");

    FakeBlob.failPuts = true;
    await assertQueueOperationError(
      () => destinationWorker.importHistoricalQueueSessions({
        capture,
        dryRun: false,
        confirmation: dryRun.requiredConfirmation,
      }),
      "queue_storage_unavailable",
      503,
      /Durable queue snapshot (?:prepare|protocol) could not be confirmed/i,
    );
    assert.equal(FakeRedis.values.get("radioQueue:v2:sessions"), redisBefore);
    assert.equal(FakeRedis.values.has("radioQueue:v2:sessions:mutation-revision"), false);
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
