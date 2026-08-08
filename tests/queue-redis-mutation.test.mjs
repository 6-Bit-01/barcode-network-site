import assert from "node:assert/strict";
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

  async get(key) {
    FakeRedis.calls.push(["get", key]);
    return FakeRedis.values.get(key) ?? null;
  }

  async set(key, value, options = {}) {
    FakeRedis.calls.push(["set", key, options]);
    if (options.nx && FakeRedis.values.has(key)) return null;
    FakeRedis.values.set(key, value);
    return "OK";
  }

  async eval(script, keys, args) {
    FakeRedis.calls.push(["eval", keys]);
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
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const queuePath = require.resolve(path.join(projectRoot, "src/lib/queue.ts"));
    delete require.cache[queuePath];
    const first = require(queuePath);
    delete require.cache[queuePath];
    const second = require(queuePath);
    return { first, second };
  } finally {
    Module._load = originalLoad;
    restoreExtension();
  }
}

function legacyEntry(index) {
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

test("Redis fencing serializes independent queue workers without overfill, lost writes, or duplicate acceptance", async () => {
  FakeRedis.values.clear();
  FakeRedis.calls.length = 0;
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
