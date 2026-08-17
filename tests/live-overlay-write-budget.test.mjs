import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

class FakeRedis {
  static calls = [];

  async get(key) {
    FakeRedis.calls.push(["get", key]);
    return null;
  }

  async set(key, value) {
    FakeRedis.calls.push(["set", key, value]);
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

    const stored = await overlay.updateLiveOverlayPlayerSync({
      provider: "audio",
      trackId: "track-1",
      playbackState: "playing",
      currentTimeSeconds: 12.5,
      durationSeconds: 180,
      updatedAt: "2000-01-01T00:00:00.000Z",
      muted: false,
      correctionReason: "heartbeat",
    }, receivedAt);

    assert.equal(stored.updatedAt, receivedAt.toISOString(), "the server receipt time remains authoritative");
    assert.deepEqual(FakeRedis.calls.map(([operation]) => operation), ["set"], "a heartbeat performs exactly one SET and zero reads");
    assert.equal(FakeRedis.calls[0][1], "barcode:live-overlay:player-sync");
    assert.equal(JSON.parse(FakeRedis.calls[0][2]).updatedAt, receivedAt.toISOString());

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

test("the admin route keeps player-sync writes on the acknowledgement fast path", () => {
  const route = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/overlay/live/route.ts"), "utf8");
  const updateStart = route.indexOf('body?.action === "updatePlayerSync"');
  const clearStart = route.indexOf('body?.action === "clearPlayerSync"');
  const snapshotStart = route.indexOf("setLiveOverlayState(body, serverRequestReceivedAt)");
  assert.ok(updateStart >= 0 && clearStart > updateStart && snapshotStart > clearStart, "sync update and clear return before the snapshot-building action path");
  const fastPath = route.slice(updateStart, snapshotStart);
  assert.match(fastPath, /updateLiveOverlayPlayerSync\(body\.sync, serverRequestReceivedAt\)/);
  assert.match(fastPath, /setLiveOverlayPlayerSync\(null, serverRequestReceivedAt\)/);
  assert.equal((fastPath.match(/NextResponse\.json\(\{ ok: true \}/g) ?? []).length, 2);
  assert.doesNotMatch(fastPath, /getLiveOverlayAdminSnapshot|setLiveOverlayState/);
});
