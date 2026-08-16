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

const STATE_KEY = "radioQueue:v2:sessions";
const MUTATION_LOCK_KEY = "radioQueue:v2:sessions:mutation-lock";
const MUTATION_REVISION_KEY = "radioQueue:v2:sessions:mutation-revision";
const ACTIVE_SESSION_ID = "session_msvbzi7i_shfud";

const trackedEnvironment = [
  "NODE_ENV",
  "QUEUE_REDIS_REST_URL",
  "QUEUE_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
];
const originalEnvironment = Object.fromEntries(trackedEnvironment.map((key) => [key, process.env[key]]));

class FakeRedis {
  static values = new Map();
  static calls = [];

  constructor(options = {}) {
    FakeRedis.calls.push(["construct", options]);
  }

  static reset() {
    FakeRedis.values.clear();
    FakeRedis.calls.length = 0;
  }

  async get(key) {
    FakeRedis.calls.push(["get", key]);
    return FakeRedis.values.get(key) ?? null;
  }

  async mget(...input) {
    const keys = Array.isArray(input[0]) ? input[0] : input;
    FakeRedis.calls.push(["mget", keys]);
    return keys.map((key) => FakeRedis.values.get(key) ?? null);
  }

  async set(key, value, options = {}) {
    FakeRedis.calls.push(["set", key, options]);
    if (options.nx && FakeRedis.values.has(key)) return null;
    FakeRedis.values.set(key, value);
    return "OK";
  }

  async eval(script, keys, args) {
    if (script.includes("commit_outcome")) {
      FakeRedis.calls.push(["eval-reconcile", keys]);
      const [lockKey, stateKey, revisionKey, legacyKey] = keys;
      const [token, previousRevision, previousState, previousStateExisted, previousRevisionExisted, nextRevision, nextState, , previousLegacy, previousLegacyExisted, legacyCheck] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const currentState = FakeRedis.values.get(stateKey);
      const currentRevision = FakeRedis.values.get(revisionKey);
      if (currentState === nextState && Number(currentRevision) === Number(nextRevision)) return 1;
      const stateMatches = previousStateExisted === "1" ? currentState === previousState : currentState === undefined;
      const revisionMatches = previousRevisionExisted === "1"
        ? Number(currentRevision) === Number(previousRevision)
        : currentRevision === undefined;
      const legacyMatches = legacyCheck !== "1" || (previousLegacyExisted === "1"
        ? FakeRedis.values.get(legacyKey) === previousLegacy
        : FakeRedis.values.get(legacyKey) === undefined);
      if (stateMatches && revisionMatches && legacyMatches) {
        FakeRedis.values.delete(lockKey);
        return 0;
      }
      return -2;
    }

    if (script.includes("current_state") && !script.includes("commit_mutation")) {
      FakeRedis.calls.push(["eval-fence", keys]);
      const [lockKey, stateKey, revisionKey, legacyKey] = keys;
      const [token, expectedRevision, expectedState, , stateExisted = "1", revisionExisted = "1", expectedLegacy = "", legacyExisted = "0", legacyCheck = "0"] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const stateMatches = stateExisted === "1"
        ? FakeRedis.values.get(stateKey) === expectedState
        : FakeRedis.values.get(stateKey) === undefined;
      if (!stateMatches) return -3;
      const revisionMatches = revisionExisted === "1"
        ? Number(FakeRedis.values.get(revisionKey)) === Number(expectedRevision)
        : FakeRedis.values.get(revisionKey) === undefined;
      if (!revisionMatches) return -2;
      if (legacyCheck === "1") {
        const legacyMatches = legacyExisted === "1"
          ? FakeRedis.values.get(legacyKey) === expectedLegacy
          : FakeRedis.values.get(legacyKey) === undefined;
        if (!legacyMatches) return -4;
      }
      return Number(expectedRevision);
    }

    if (script.includes("PEXPIRE") && !script.includes("commit_mutation")) {
      FakeRedis.calls.push(["eval-renew", keys]);
      return FakeRedis.values.get(keys[0]) === args[0] ? 1 : 0;
    }

    if (script.includes("commit_mutation")) {
      FakeRedis.calls.push(["eval-commit", keys]);
      const [lockKey, stateKey, revisionKey, legacyKey] = keys;
      const [token, expectedRevision, previousState, previousStateExisted, previousRevisionExisted, previousLegacy, previousLegacyExisted, legacyCheck, nextState, nextRevision] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      const stateMatches = previousStateExisted === "1"
        ? FakeRedis.values.get(stateKey) === previousState
        : FakeRedis.values.get(stateKey) === undefined;
      const revisionMatches = previousRevisionExisted === "1"
        ? Number(FakeRedis.values.get(revisionKey)) === Number(expectedRevision)
        : FakeRedis.values.get(revisionKey) === undefined;
      const legacyMatches = legacyCheck !== "1" || (previousLegacyExisted === "1"
        ? FakeRedis.values.get(legacyKey) === previousLegacy
        : FakeRedis.values.get(legacyKey) === undefined);
      if (!stateMatches || !revisionMatches || !legacyMatches) return -2;
      FakeRedis.values.set(stateKey, nextState);
      FakeRedis.values.set(revisionKey, nextRevision);
      if (legacyCheck === "1") FakeRedis.values.delete(legacyKey);
      return Number(nextRevision);
    }

    if (keys.length >= 3 && args.length >= 4) {
      FakeRedis.calls.push(["eval-rollback", keys]);
      const [lockKey, stateKey, revisionKey] = keys;
      const [token, expectedRevision, state, revision, stateExisted = "1", revisionExisted = "1"] = args;
      if (FakeRedis.values.get(lockKey) !== token) return -1;
      if (Number(FakeRedis.values.get(revisionKey)) !== Number(expectedRevision)) return -2;
      if (stateExisted === "1") FakeRedis.values.set(stateKey, state);
      else FakeRedis.values.delete(stateKey);
      if (revisionExisted === "1") FakeRedis.values.set(revisionKey, revision);
      else FakeRedis.values.delete(revisionKey);
      return Number(revision);
    }

    FakeRedis.calls.push(["eval-release", keys]);
    const [lockKey] = keys;
    if (FakeRedis.values.get(lockKey) === args[0]) {
      FakeRedis.values.delete(lockKey);
      return 1;
    }
    return 0;
  }
}

class UnavailableBlob {
  static calls = [];
  static readsReturnMissing = false;

  static reset() {
    UnavailableBlob.calls.length = 0;
    UnavailableBlob.readsReturnMissing = false;
  }

  static async get(pathname) {
    UnavailableBlob.calls.push(["get", pathname]);
    if (UnavailableBlob.readsReturnMissing) return null;
    throw new Error("Blob provider read unavailable");
  }

  static async put(pathname) {
    UnavailableBlob.calls.push(["put", pathname]);
    throw new Error("Blob provider write unavailable");
  }

  static async list(options = {}) {
    UnavailableBlob.calls.push(["list", options]);
    throw new Error("Blob provider list unavailable");
  }

  static async del(pathname) {
    UnavailableBlob.calls.push(["del", pathname]);
    throw new Error("Blob provider delete unavailable");
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

Module._load = function loadWithStorageOutage(request, parent, isMain) {
  if (request === "@upstash/redis") return { Redis: FakeRedis };
  if (request === "@vercel/blob") {
    return {
      del: UnavailableBlob.del.bind(UnavailableBlob),
      get: UnavailableBlob.get.bind(UnavailableBlob),
      list: UnavailableBlob.list.bind(UnavailableBlob),
      put: UnavailableBlob.put.bind(UnavailableBlob),
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
      resetWheelCeremonyStateForNewSession: async () => {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function clearProjectModuleCache() {
  const srcPrefix = `${path.join(projectRoot, "src")}${path.sep}`;
  for (const filename of Object.keys(require.cache)) {
    if (filename.startsWith(srcPrefix)) delete require.cache[filename];
  }
}

function queueTrack() {
  return {
    id: "track_live_001",
    artist: "Waiting Artist",
    title: "Waiting Track",
    link: "https://example.test/waiting-track",
    tiktokHandle: "@waitingartist",
    tier: "free",
    lane: "regular",
    amount: 0,
    status: "queued",
    createdAt: "2026-08-16T02:05:00.000Z",
    playedAt: null,
    completedAt: null,
    removedAt: null,
    spotlightedAt: null,
    sourceType: "other",
  };
}

function queueSession({ id, title, status, showDate, queue = [] }) {
  const queueOpen = status === "open";
  return {
    sessionId: id,
    title,
    status,
    purpose: "live_broadcast",
    bnlPublicationStatus: "private",
    showDate,
    createdAt: `${showDate}T01:00:00.000Z`,
    updatedAt: `${showDate}T03:00:00.000Z`,
    queueOpen,
    showStarted: status === "open",
    queue,
    completed: [],
    removed: [],
    spotlight: [],
    nextInLineTrack: null,
    loadedTrack: null,
  };
}

function screenshotRedisStore() {
  return {
    revision: 14,
    activeSessionId: ACTIVE_SESSION_ID,
    sessions: [
      queueSession({
        id: ACTIVE_SESSION_ID,
        title: "Current live broadcast",
        status: "open",
        showDate: "2026-08-15",
        queue: [queueTrack()],
      }),
      queueSession({
        id: "session_previous_closed",
        title: "Previous broadcast",
        status: "closed",
        showDate: "2026-08-08",
      }),
      queueSession({
        id: "session_previous_archived",
        title: "Archived broadcast",
        status: "archived",
        showDate: "2026-08-01",
      }),
    ],
  };
}

function configureScreenshotState() {
  process.env.NODE_ENV = "production";
  process.env.QUEUE_REDIS_REST_URL = "https://queue-dedicated.upstash.io";
  process.env.QUEUE_REDIS_REST_TOKEN = "queue-dedicated-token";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "configured-but-unavailable-blob-token";
  FakeRedis.reset();
  UnavailableBlob.reset();
  const store = screenshotRedisStore();
  FakeRedis.values.set(STATE_KEY, JSON.stringify(store));
  FakeRedis.values.set(MUTATION_REVISION_KEY, store.revision);
  clearProjectModuleCache();
  return require(path.join(projectRoot, "src/app/api/admin/queue/route.ts"));
}

function adminGet(route) {
  return route.GET(new Request("https://example.test/api/admin/queue", { method: "GET" }));
}

function exactEnd(route) {
  return route.POST(new Request("https://example.test/api/admin/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "archiveSession", sessionId: ACTIVE_SESSION_ID }),
  }));
}

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

test("admin GET serves the valid dedicated Redis show as explicit degraded Redis-only state when Blob is unavailable", async () => {
  const route = configureScreenshotState();

  const response = await adminGet(route);
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.storageAuthority, "degraded_redis_only");
  assert.equal(payload.revision, 14);
  assert.equal(payload.session.sessionId, ACTIVE_SESSION_ID);
  assert.equal(payload.sessions.length, 3);
  assert.equal(
    payload.queue.length + (payload.nextInLine ? 1 : 0) + (payload.loadedTrack ? 1 : 0),
    1,
    "the accepted track must remain present even when normal routing stages it as Next",
  );
});

test("admin GET preserves the existing Redis show before its first durable snapshot exists", async () => {
  const route = configureScreenshotState();
  UnavailableBlob.readsReturnMissing = true;

  const response = await adminGet(route);
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.storageAuthority, "degraded_redis_only");
  assert.equal(payload.revision, 14);
  assert.equal(payload.session.sessionId, ACTIVE_SESSION_ID);
  assert.equal(payload.sessions.length, 3);
});

test("exact-ID End archives the displayed Redis-only show in one revision while Blob reads and writes are unavailable", async () => {
  const route = configureScreenshotState();

  const response = await exactEnd(route);
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.storageAuthority, "degraded_redis_only");
  assert.equal(payload.revision, 15);
  assert.equal(payload.session.sessionId, ACTIVE_SESSION_ID);
  assert.equal(payload.session.status, "archived");
  assert.equal(
    FakeRedis.calls.filter(([operation]) => operation === "eval-commit").length,
    1,
    "End must make exactly one atomic Redis commit",
  );
  const persisted = JSON.parse(FakeRedis.values.get(STATE_KEY));
  assert.equal(persisted.revision, 15);
  assert.equal(persisted.sessions.find((session) => session.sessionId === ACTIVE_SESSION_ID).status, "archived");
  assert.equal(Number(FakeRedis.values.get(MUTATION_REVISION_KEY)), 15);
  assert.equal(FakeRedis.values.has(MUTATION_LOCK_KEY), false, "the mutation lock must be released");
});

test("exact-ID End also works before the first durable snapshot exists", async () => {
  const route = configureScreenshotState();
  UnavailableBlob.readsReturnMissing = true;

  const response = await exactEnd(route);
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.storageAuthority, "degraded_redis_only");
  assert.equal(payload.revision, 15);
  assert.equal(payload.session.status, "archived");
  assert.equal(FakeRedis.calls.filter(([operation]) => operation === "eval-commit").length, 1);
});

test("the Blob-outage escape hatch is limited to exact-ID End", async () => {
  const route = configureScreenshotState();

  const response = await route.POST(new Request("https://example.test/api/admin/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "setOpen", isOpen: false }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 409, JSON.stringify(payload));
  assert.equal(payload.code, "queue_state_ambiguous");
  assert.equal(
    FakeRedis.calls.filter(([operation]) => operation === "eval-commit").length,
    0,
    "ordinary mutations must not bypass the durable store",
  );
  assert.equal(Number(FakeRedis.values.get(MUTATION_REVISION_KEY)), 14);
});
