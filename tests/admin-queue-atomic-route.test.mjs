import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const originalTypeScriptLoader = Module._extensions[".ts"];

const trackedEnvironment = [
  "NODE_ENV",
  "QUEUE_REDIS_REST_URL",
  "QUEUE_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
];
const originalEnvironment = Object.fromEntries(trackedEnvironment.map((key) => [key, process.env[key]]));

let activeQueueFacade = null;
let overlayResetFailure = null;
let overlayResetCalls = 0;

class FakeRedis {
  static values = new Map();
  static calls = [];
  static getFailure = null;
  static setFailure = null;

  static reset() {
    FakeRedis.values.clear();
    FakeRedis.calls.length = 0;
    FakeRedis.getFailure = null;
    FakeRedis.setFailure = null;
  }

  static commitCount() {
    return FakeRedis.calls.filter(([operation]) => operation === "eval-commit").length;
  }

  async get(key) {
    FakeRedis.calls.push(["get", key]);
    if (FakeRedis.getFailure) throw FakeRedis.getFailure;
    return FakeRedis.values.get(key) ?? null;
  }

  async set(key, value, options = {}) {
    FakeRedis.calls.push(["set", key, options]);
    if (FakeRedis.setFailure) throw FakeRedis.setFailure;
    if (options.nx && FakeRedis.values.has(key)) return null;
    FakeRedis.values.set(key, value);
    return "OK";
  }

  async eval(script, keys, args) {
    if (script.includes("commit_mutation")) {
      FakeRedis.calls.push(["eval-commit", keys]);
      const [lockKey, stateKey, revisionKey, legacyKey] = keys;
      const [token, expectedRevision, previousState, previousStateExisted, previousRevisionExisted, previousLegacy, previousLegacyExisted, legacyCheck, nextState, nextRevision] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentState = FakeRedis.values.get(stateKey);
      const currentRevision = FakeRedis.values.get(revisionKey);
      const stateMatches = previousStateExisted === "1" ? currentState === previousState : currentState === undefined;
      const revisionMatches = previousRevisionExisted === "1"
        ? currentRevision !== undefined && Number(currentRevision) === Number(expectedRevision)
        : currentRevision === undefined;
      if (!stateMatches || !revisionMatches) return -2;
      if (legacyCheck === "1") {
        const legacyState = FakeRedis.values.get(legacyKey);
        const legacyMatches = previousLegacyExisted === "1" ? legacyState === previousLegacy : legacyState === undefined;
        if (!legacyMatches) return -3;
      }
      FakeRedis.values.set(stateKey, nextState);
      FakeRedis.values.set(revisionKey, nextRevision);
      if (legacyCheck === "1") FakeRedis.values.delete(legacyKey);
      return Number(nextRevision);
    }
    if (script.includes("current_state")) {
      FakeRedis.calls.push(["eval-fence", keys]);
      const [lockKey, stateKey, revisionKey, legacyKey] = keys;
      const [token, expectedRevision, stateJson, , stateExisted = "1", revisionExisted = "1", legacyJson = "", legacyExisted = "0", legacyCheck = "0"] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentRevision = FakeRedis.values.get(revisionKey);
      if (revisionExisted === "1"
        ? currentRevision === undefined || Number(currentRevision) !== Number(expectedRevision)
        : currentRevision !== undefined) return -2;
      const currentState = FakeRedis.values.get(stateKey);
      if (stateExisted === "1" ? currentState !== stateJson : currentState !== undefined) return -3;
      if (legacyCheck === "1") {
        const currentLegacy = FakeRedis.values.get(legacyKey);
        if (legacyExisted === "1" ? currentLegacy !== legacyJson : currentLegacy !== undefined) return -4;
      }
      return Number(expectedRevision);
    }
    if (script.includes("PEXPIRE") && !script.includes("commit_mutation")) {
      FakeRedis.calls.push(["eval-renew", keys]);
      const [lockKey] = keys;
      const [token] = args;
      return FakeRedis.values.get(lockKey) === token ? 1 : 0;
    }
    if (keys.length === 3) {
      FakeRedis.calls.push(["eval-rollback", keys]);
      const [lockKey, stateKey, revisionKey] = keys;
      const [token, expectedRevision, stateJson, nextRevision, stateExisted, revisionExisted] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentRevision = FakeRedis.values.get(revisionKey);
      if (currentRevision !== undefined && currentRevision !== null && Number(currentRevision) !== Number(expectedRevision)) return -2;
      if (args.length >= 6) {
        if (stateExisted === "1") FakeRedis.values.set(stateKey, stateJson);
        else FakeRedis.values.delete(stateKey);
        if (revisionExisted === "1") FakeRedis.values.set(revisionKey, nextRevision);
        else FakeRedis.values.delete(revisionKey);
      } else {
        FakeRedis.values.set(stateKey, stateJson);
        FakeRedis.values.set(revisionKey, nextRevision);
      }
      return Number(nextRevision);
    }

    FakeRedis.calls.push(["eval-release", keys]);
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

  static reset() {
    FakeBlob.values.clear();
    FakeBlob.calls.length = 0;
  }

  static async put(pathname, body, options = {}) {
    FakeBlob.calls.push(["put", pathname, options]);
    const current = FakeBlob.values.get(pathname);
    if (options.ifMatch && current?.etag !== options.ifMatch) throw new Error("Blob precondition failed");
    if (options.allowOverwrite === false && current) throw new Error("Blob already exists");
    const text = typeof body === "string" ? body : Buffer.from(body).toString("utf8");
    const stored = { pathname, body: text, uploadedAt: new Date(), etag: `etag-${FakeBlob.calls.length}` };
    FakeBlob.values.set(pathname, stored);
    return {
      url: `https://private.example.test/${pathname}`,
      downloadUrl: `https://private.example.test/${pathname}?download=1`,
      pathname,
      contentType: options.contentType ?? "application/json",
      contentDisposition: "inline",
      etag: stored.etag,
    };
  }

  static async get(pathname, options = {}) {
    FakeBlob.calls.push(["get", pathname, options]);
    const stored = FakeBlob.values.get(pathname);
    if (!stored) return null;
    const bytes = new TextEncoder().encode(stored.body);
    return {
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      headers: new Headers({ "content-type": "application/json" }),
      blob: {
        url: `https://private.example.test/${pathname}`,
        downloadUrl: `https://private.example.test/${pathname}?download=1`,
        pathname,
        contentDisposition: "inline",
        cacheControl: "max-age=60",
        uploadedAt: stored.uploadedAt,
        etag: stored.etag,
        contentType: "application/json",
        size: bytes.byteLength,
      },
    };
  }

  static async list(options = {}) {
    FakeBlob.calls.push(["list", options]);
    const prefix = options.prefix ?? "";
    const blobs = [...FakeBlob.values.values()]
      .filter((stored) => stored.pathname.startsWith(prefix))
      .map((stored) => ({
        url: `https://private.example.test/${stored.pathname}`,
        downloadUrl: `https://private.example.test/${stored.pathname}?download=1`,
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

Module._load = function loadWithQueueFakes(request, parent, isMain) {
  if (request === "@upstash/redis") return { Redis: FakeRedis };
  if (request === "@vercel/blob") {
    return {
      del: FakeBlob.del.bind(FakeBlob),
      get: FakeBlob.get.bind(FakeBlob),
      list: FakeBlob.list.bind(FakeBlob),
      put: FakeBlob.put.bind(FakeBlob),
    };
  }
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body, init = {}) => new Response(JSON.stringify(body), {
          ...init,
          headers: { "content-type": "application/json", ...(init.headers ?? {}) },
        }),
      },
    };
  }
  if (request === "next/headers") {
    return { cookies: async () => ({ get: () => ({ value: "valid-admin-token" }) }) };
  }
  if (request === "@/lib/auth") {
    return { COOKIE_NAME: "barcode_admin", verifyAdminToken: async (token) => token === "valid-admin-token" };
  }
  if (request === "@/lib/live-overlay") {
    return {
      getLiveOverlayPlayerSync: async () => null,
      getStoredLiveOverlayState: async () => ({}),
      resetWheelCeremonyStateForNewSession: async () => {
        overlayResetCalls += 1;
        if (overlayResetFailure) throw overlayResetFailure;
      },
    };
  }
  if (request === "@/lib/queue" && activeQueueFacade) return activeQueueFacade;
  return originalLoad.call(this, request, parent, isMain);
};

function clearProjectModuleCache() {
  const srcPrefix = `${path.join(projectRoot, "src")}${path.sep}`;
  for (const filename of Object.keys(require.cache)) {
    if (filename.startsWith(srcPrefix)) delete require.cache[filename];
  }
}

function configureHealthyStorage() {
  process.env.NODE_ENV = "production";
  process.env.QUEUE_REDIS_REST_URL = "https://queue-atomic-test.upstash.io";
  process.env.QUEUE_REDIS_REST_TOKEN = "queue-test-token";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "private-blob-test-token";
}

function loadHarness() {
  clearProjectModuleCache();
  activeQueueFacade = null;
  const queue = require(path.join(projectRoot, "src/lib/queue.ts"));
  const calls = { archiveExact: 0, archiveExactSessionIds: [], archiveCurrent: 0, activate: 0 };
  activeQueueFacade = {
    ...queue,
    archiveQueueSession: async (...args) => {
      calls.archiveExact += 1;
      calls.archiveExactSessionIds.push(args[0]);
      return queue.archiveQueueSession(...args);
    },
    archiveCurrentQueueSession: async (...args) => {
      calls.archiveCurrent += 1;
      return queue.archiveCurrentQueueSession(...args);
    },
    activateQueueSession: async (...args) => {
      calls.activate += 1;
      return queue.activateQueueSession(...args);
    },
  };
  const route = require(path.join(projectRoot, "src/app/api/admin/queue/route.ts"));
  return { calls, queue, route };
}

function adminPost(route, body) {
  return route.POST(new Request("https://example.test/api/admin/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function adminGet(route) {
  return route.GET(new Request("https://example.test/api/admin/queue", {
    method: "GET",
  }));
}

function startRequest(requestId, title = "Atomic Route Rehearsal") {
  return {
    action: "startSession",
    requestId,
    title,
    showDate: "2026-08-16",
    description: "Private atomic route integration rehearsal.",
    purpose: "rehearsal",
    bnlPublicationStatus: "private",
    trackLimitPerArtist: 3,
    queueCapacity: 44,
    submissionCooldownSeconds: 300,
    priorityUpgradesEnabled: false,
    priorityUpgradePaymentsEnabled: false,
    priorityUpgradePriceCents: 0,
    priorityUpgradeCurrency: "usd",
  };
}

async function expectStructuredFailure(response, status, code) {
  assert.equal(response.status, status);
  const payload = await response.json();
  assert.equal(payload.code, code);
  assert.equal(typeof payload.error, "string");
  assert.ok(payload.error.length > 0);
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /queue-test-token|private-blob-test-token|raw-provider-secret|500000|upstash\.io/i);
  return payload;
}

test.beforeEach(() => {
  configureHealthyStorage();
  FakeRedis.reset();
  FakeBlob.reset();
  overlayResetFailure = null;
  overlayResetCalls = 0;
});

test.after(() => {
  Module._resolveFilename = originalResolveFilename;
  Module._load = originalLoad;
  Module._extensions[".ts"] = originalTypeScriptLoader;
  for (const key of trackedEnvironment) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Start replay is idempotent across the actual admin route and queue store", async () => {
  const { queue, route } = loadHarness();
  const body = startRequest("start-replay:atomic-route:001");

  const firstResponse = await adminPost(route, body);
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  const firstCommitCount = FakeRedis.commitCount();
  const firstSessionCount = first.sessions.length;

  const replayResponse = await adminPost(route, body);
  assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json();

  assert.equal(replay.session.sessionId, first.session.sessionId);
  assert.equal(replay.revision, first.revision);
  assert.equal(replay.sessions.length, firstSessionCount);
  assert.equal(FakeRedis.commitCount(), firstCommitCount, "a replay must not commit another queue revision");
  assert.equal(overlayResetCalls, 1, "a replay must not reset the live Wheel overlay again");

  const stored = await queue.getRadioQueueState(first.session.sessionId);
  assert.equal(stored.session.sessionId, first.session.sessionId);
  assert.equal(stored.revision, first.revision);
  assert.equal(stored.sessions.length, firstSessionCount);
});

test("a post-commit overlay reset failure returns queue success with a safe warning", async () => {
  const { queue, route } = loadHarness();
  overlayResetFailure = new Error("raw-provider-secret Redis Limit: 500000 https://queue-atomic-test.upstash.io");

  const response = await adminPost(route, startRequest("start-overlay-warning:atomic-route:001"));
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(overlayResetCalls, 1);
  assert.deepEqual(payload.warnings, [{
    code: "overlay_reset_failed",
    message: "The queue session started, but the Wheel overlay reset did not complete.",
  }]);
  assert.doesNotMatch(JSON.stringify(payload), /raw-provider-secret|500000|upstash\.io/i);

  const stored = await queue.getRadioQueueState(payload.session.sessionId);
  assert.equal(stored.session.sessionId, payload.session.sessionId);
  assert.equal(stored.revision, payload.revision);
  assert.equal(FakeRedis.commitCount(), 1, "the queue commit survives the non-authoritative overlay failure");
});

test("archive targets the displayed current session ID with one atomic queue call and one revision", async () => {
  const { calls, queue, route } = loadHarness();

  const started = await (await adminPost(route, startRequest("start-archive:atomic-route:001", "Current Session"))).json();
  const displayedSessionId = started.session.sessionId;

  const revisionBeforeArchive = started.revision;
  const commitsBeforeArchive = FakeRedis.commitCount();
  const archiveResponse = await adminPost(route, { action: "archiveSession", sessionId: displayedSessionId });
  assert.equal(archiveResponse.status, 200);
  const archived = await archiveResponse.json();

  assert.equal(calls.archiveExact, 1);
  assert.deepEqual(calls.archiveExactSessionIds, [displayedSessionId]);
  assert.equal(calls.activate, 0, "exact archive must not activate the historical target first");
  assert.equal(calls.archiveCurrent, 0, "route must not use the ambient-current compatibility archive");
  assert.equal(archived.session.sessionId, displayedSessionId);
  assert.equal(archived.session.status, "archived");
  assert.equal(archived.revision, revisionBeforeArchive + 1);
  assert.equal(FakeRedis.commitCount(), commitsBeforeArchive + 1);

  const stored = await queue.getRadioQueueState(displayedSessionId);
  assert.equal(stored.session.sessionId, displayedSessionId);
  assert.equal(stored.session.status, "archived");
  assert.equal(stored.isCurrentSession, false);
});

test("admin queue mutations map storage failures to safe structured non-2xx responses", async (t) => {
  await t.test("unsafe production configuration", async () => {
    FakeRedis.reset();
    FakeBlob.reset();
    configureHealthyStorage();
    delete process.env.QUEUE_REDIS_REST_TOKEN;
    const { route } = loadHarness();
    const response = await adminPost(route, startRequest("start-error:configuration:001"));
    await expectStructuredFailure(response, 503, "queue_storage_configuration_invalid");
    configureHealthyStorage();
  });

  await t.test("storage provider unavailable before lock acquisition", async () => {
    FakeRedis.reset();
    FakeBlob.reset();
    configureHealthyStorage();
    const { route } = loadHarness();
    FakeRedis.setFailure = new Error("ERR max requests limit exceeded. Limit: 500000 raw-provider-secret");
    const response = await adminPost(route, startRequest("start-error:storage:001"));
    await expectStructuredFailure(response, 503, "queue_storage_unavailable");
  });

  await t.test("queue state unavailable on a fresh read", async () => {
    FakeRedis.reset();
    FakeBlob.reset();
    configureHealthyStorage();
    const { route } = loadHarness();
    FakeRedis.getFailure = new Error("network unavailable raw-provider-secret https://queue-atomic-test.upstash.io");
    const response = await adminGet(route);
    await expectStructuredFailure(response, 503, "queue_state_unavailable");
  });

  await t.test("exact archive session does not exist", async () => {
    FakeRedis.reset();
    FakeBlob.reset();
    configureHealthyStorage();
    const { route } = loadHarness();
    const response = await adminPost(route, { action: "archiveSession", sessionId: "missing-session" });
    await expectStructuredFailure(response, 404, "queue_session_not_found");
  });
});
