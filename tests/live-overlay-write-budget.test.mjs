import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

class FakeRedis {
  static calls = [];
  static values = new Map();

  async get(key) {
    FakeRedis.calls.push(["get", key]);
    return FakeRedis.values.get(key) ?? null;
  }

  async mget(...keys) {
    FakeRedis.calls.push(["mget", keys]);
    return keys.map((key) => FakeRedis.values.get(key) ?? null);
  }

  async set(key, value) {
    FakeRedis.calls.push(["set", key, value]);
    FakeRedis.values.set(key, value);
    return "OK";
  }

  async del(key) {
    FakeRedis.calls.push(["del", key]);
    return 1;
  }
}

function loadLiveOverlayWithFakeRedis() {
  const originalLoad = Module._load;
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
  Module._load = function loadWithFakes(request, parent, isMain) {
    if (request === "@upstash/redis") return { Redis: FakeRedis };
    if (request === "./queue" && parent?.filename.endsWith(path.join("src", "lib", "live-overlay.ts"))) {
      return {
        getRadioQueueState: async () => { throw new Error("queue reads are forbidden in player-sync writes"); },
        isWheelEligibleTrack: () => false,
        updateRadioTrack: async () => { throw new Error("queue mutations are forbidden in player-sync writes"); },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve(path.join(projectRoot, "src/lib/live-overlay.ts"));
    delete require.cache[modulePath];
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
    Module._extensions[".ts"] = originalExtension;
  }
}

test("the 1 Hz player-sync path uses one shared Redis command per heartbeat and clear", async () => {
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-overlay-redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  try {
    const overlay = loadLiveOverlayWithFakeRedis();
    const receivedAt = new Date("2026-08-16T12:34:56.789Z");
    FakeRedis.calls.length = 0;
    FakeRedis.values.clear();

    const stored = await overlay.updateLiveOverlayPlayerSync({
      provider: "audio",
      trackId: "track-1",
      playbackState: "playing",
      currentTimeSeconds: 12.5,
      durationSeconds: 180,
      updatedAt: "2000-01-01T00:00:00.000Z",
      muted: false,
      audioAnalysis: { energy: 0.7, bass: 0.82, mid: 0.6, treble: 0.4, peak: 0.9 },
      correctionReason: "heartbeat",
    }, receivedAt);

    assert.equal(stored.updatedAt, receivedAt.toISOString(), "the server receipt time remains authoritative");
    assert.deepEqual(FakeRedis.calls.map(([operation]) => operation), ["set"], "a heartbeat performs exactly one SET and zero reads");
    assert.equal(FakeRedis.calls[0][1], "barcode:live-overlay:player-sync");
    assert.equal(JSON.parse(FakeRedis.calls[0][2]).updatedAt, receivedAt.toISOString());
    assert.equal(JSON.parse(FakeRedis.calls[0][2]).audioAnalysis.bass, 0.82, "analysis piggybacks on the existing heartbeat instead of adding writes");

    for (const media of [{ provider: "youtube", videoId: "abcdefghijk" }, { provider: "tiktok", postId: "6718335390845095173" }]) {
      FakeRedis.calls.length = 0;
      const planned = await overlay.updateLiveOverlayPlayerSync({ ...media, trackId: "track-1", playbackState: "playing", currentTimeSeconds: 12.5 }, receivedAt, 3000);
      assert.equal(planned.scheduledStartAt, "2026-08-16T12:34:59.789Z");
      assert.deepEqual(FakeRedis.calls.map(([operation]) => operation), ["set"], "preparation shares the one-write path and never reads or mutates the queue");
      FakeRedis.values.set("barcode:live-overlay:player-sync", FakeRedis.calls[0][2]);
      FakeRedis.calls.length = 0;
      const runtime = await overlay.getLiveOverlayRuntimeState();
      assert.deepEqual(runtime.playerSync, planned, "stored normalizer preserves the original start token and deadline");
      assert.deepEqual(FakeRedis.calls.map(([operation]) => operation), ["mget"]);
    }

    FakeRedis.calls.length = 0;
    await overlay.setLiveOverlayPlayerSync(null, receivedAt);
    assert.deepEqual(FakeRedis.calls, [["del", "barcode:live-overlay:player-sync"]], "clear performs exactly one DEL and zero reads");
  } finally {
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});

test("active readers fetch overlay state and player sync with one MGET", async () => {
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-overlay-redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  try {
    const overlay = loadLiveOverlayWithFakeRedis();
    FakeRedis.values.clear();
    FakeRedis.values.set("barcode:live-overlay:state", JSON.stringify({
      mode: "auto",
      title: "BARCODE RADIO",
      updatedAt: "2026-08-21T20:00:00.000Z",
    }));
    FakeRedis.values.set("barcode:live-overlay:player-sync", JSON.stringify({
      provider: "audio",
      trackId: "track-1",
      playbackState: "playing",
      currentTimeSeconds: 42,
      durationSeconds: 180,
      updatedAt: "2026-08-21T20:00:01.000Z",
      muted: false,
    }));
    FakeRedis.calls.length = 0;

    const runtime = await overlay.getLiveOverlayRuntimeState();
    assert.equal(runtime.overlayState.title, "BARCODE RADIO");
    assert.equal(runtime.playerSync.trackId, "track-1");
    assert.deepEqual(FakeRedis.calls, [[
      "mget",
      ["barcode:live-overlay:state", "barcode:live-overlay:player-sync"],
    ]]);
  } finally {
    FakeRedis.values.clear();
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});

test("the admin route returns scheduled acknowledgements without a queue snapshot and keeps legacy heartbeats compact", async () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/overlay/live/route.ts"), "utf8");
  const root = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  const code = root.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText().replace(/^export /, "")).join("\n");
  const writes = [];
  const stamped = { provider: "youtube", startToken: "video-start-test", scheduledStartAt: "2026-09-13T12:00:03Z" };
  const globals = {
    cookies: async () => ({ get: () => ({ value: "admin-test-token" }) }), COOKIE_NAME: "admin", verifyAdminToken: () => true,
    NextResponse: { json: (body, options) => ({ body, ...options }) },
    updateLiveOverlayPlayerSync: async (...args) => { writes.push(args); return stamped; },
    setLiveOverlayPlayerSync: async (...args) => { writes.push(args); },
    getLiveOverlayAdminSnapshot: () => { throw new Error("snapshot read on sync path"); },
    setLiveOverlayState: () => { throw new Error("snapshot mutation on sync path"); },
  };
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const post = vm.runInNewContext(`${js}\nPOST`, globals);
  const normal = await post({ json: async () => ({ action: "updatePlayerSync", sync: { provider: "youtube" } }) });
  assert.deepEqual(JSON.parse(JSON.stringify(normal.body)), { ok: true });
  const planned = await post({ json: async () => ({ action: "updatePlayerSync", sync: { provider: "youtube" }, startDelayMs: 3000 }) });
  assert.equal(planned.body.sync, stamped);
  assert.equal(writes[1][2], 3000);
  assert.equal(writes[1][1].toISOString(), planned.headers["X-BNL-Request-Received-At"]);
  const cleared = await post({ json: async () => ({ action: "clearPlayerSync" }) });
  assert.deepEqual(JSON.parse(JSON.stringify(cleared.body)), { ok: true });
  assert.equal(writes[2][0], null);
  globals.verifyAdminToken = () => false;
  const denied = await post({ json: async () => ({ action: "updatePlayerSync", startDelayMs: 3000 }) });
  assert.equal(denied.status, 401);
  assert.equal(writes.length, 3, "unauthorized requests cannot schedule or clear players");
});

test("preparation readiness is scoped to the current paused token and does not read the queue", async () => {
  const oldUrl = process.env.UPSTASH_REDIS_REST_URL, oldToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://shared-overlay-redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  try {
    const overlay = loadLiveOverlayWithFakeRedis();
    const prepareToken = "prepare-12345678-1234-1234-1234-123456789012";
    FakeRedis.values.clear();
    await overlay.updateLiveOverlayPlayerSync({ provider: "youtube", videoId: "PWYFa2OCWj0", trackId: "C1", playbackState: "paused", currentTimeSeconds: 0, prepareToken });
    assert.equal(await overlay.acknowledgeVideoPreparation("invalid"), false);
    assert.equal(await overlay.acknowledgeVideoPreparation(prepareToken + "-old"), false);
    assert.equal(await overlay.isVideoPreparationReady(prepareToken), false);
    FakeRedis.calls.length = 0;
    assert.equal(await overlay.acknowledgeVideoPreparation(prepareToken), true);
    assert.deepEqual(FakeRedis.calls.map(([op]) => op), ["get", "set"]);
    FakeRedis.calls.length = 0;
    assert.equal(await overlay.isVideoPreparationReady(prepareToken), true);
    assert.deepEqual(FakeRedis.calls.map(([op]) => op), ["get"]);
    await overlay.updateLiveOverlayPlayerSync({ provider: "youtube", videoId: "PWYFa2OCWj0", trackId: "C1", playbackState: "playing", currentTimeSeconds: 0 });
    assert.equal(await overlay.acknowledgeVideoPreparation(prepareToken), false, "a late acknowledgement cannot change playback");
    FakeRedis.values.set("barcode:live-overlay:player-ready", JSON.stringify({ token: prepareToken, expiresAt: Date.now() - 1 }));
    assert.equal(await overlay.isVideoPreparationReady(prepareToken), false);
  } finally {
    FakeRedis.values.clear();
    if (oldUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = oldUrl;
    if (oldToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = oldToken;
  }
});

test("readiness endpoint requires the Studio capability and can only acknowledge a preparation token", async () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/app/api/overlay/player-ready/route.ts"), "utf8");
  const root = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  const code = root.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText().replace(/^export /, "")).join("\n");
  const calls = [];
  const globals = {
    verifyStudioOverlayToken: async (token) => token === "valid-studio", NextResponse: { json: (body, options) => ({ body, ...options }) },
    acknowledgeVideoPreparation: async (token) => { calls.push(token); return token === "current"; },
  };
  const post = vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "\nPOST", globals);
  const req = (auth, prepareToken) => ({ headers: new Headers(auth ? { Authorization: `Bearer ${auth}` } : {}), json: async () => ({ prepareToken, action: "load", trackId: "injected" }) });
  assert.equal((await post(req(null, "current"))).status, 401);
  assert.equal((await post(req("wrong", "current"))).status, 401);
  assert.deepEqual(calls, []);
  assert.equal((await post(req("valid-studio", "stale"))).status, 409);
  assert.equal((await post(req("valid-studio", "current"))).status, 200);
  assert.deepEqual(calls, ["stale", "current"]);
});
