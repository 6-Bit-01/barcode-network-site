import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

function withTypeScriptLoader(run) {
  const originalExtension = Module._extensions[".ts"];
  Module._extensions[".ts"] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
  try { return run(); }
  finally { Module._extensions[".ts"] = originalExtension; }
}

function loadWheelOverlayHarness() {
  const calls = { overlay: 0, player: 0, resolve: 0 };
  const playerSync = { trackId: "track-1", playbackState: "playing" };
  let queueState = { session: null };
  let resolvedScene = { sessionActive: true, mode: "session_active", updatedAt: "2026-08-20T12:00:00.000Z" };
  let resolverInput = null;
  const originalLoad = Module._load;

  Module._load = function loadWithStubs(request, parent, isMain) {
    if (request === "./queue" && parent?.filename.endsWith("wheel-overlay.ts")) {
      return { getRadioLiveQueueState: async () => queueState };
    }
    if (request === "./session-bound-polling" && parent?.filename.endsWith("wheel-overlay.ts")) {
      return { hasActiveQueueSession: (value) => Boolean(value?.session && value.session.status !== "archived") };
    }
    if (request === "./live-overlay" && parent?.filename.endsWith("wheel-overlay.ts")) {
      return {
        getLiveOverlayRuntimeState: async () => {
          calls.overlay += 1;
          calls.player += 1;
          return { overlayState: { mode: "auto" }, playerSync };
        },
        resolveLiveOverlaySceneFromQueueState: (input) => {
          calls.resolve += 1;
          resolverInput = input;
          return resolvedScene;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const api = withTypeScriptLoader(() => {
      const modulePath = require.resolve(path.join(projectRoot, "src/lib/wheel-overlay.ts"));
      delete require.cache[modulePath];
      return require(modulePath);
    });
    return {
      api,
      calls,
      playerSync,
      getResolverInput: () => resolverInput,
      setQueueState: (next) => { queueState = next; },
      setResolvedScene: (next) => { resolvedScene = next; },
    };
  } finally {
    Module._load = originalLoad;
  }
}

test("permanent square source wakes with the session, stays live through broadcast, and clears after End", async () => {
  const harness = loadWheelOverlayHarness();
  const now = new Date("2026-08-20T12:00:00.000Z");

  const noSession = await harness.api.getWheelOverlaySnapshot(now);
  assert.deepEqual(noSession, {
    sessionActive: false,
    broadcastActive: false,
    wheelActive: false,
    scene: null,
    updatedAt: now.toISOString(),
  });
  assert.deepEqual(harness.calls, { overlay: 0, player: 0, resolve: 0 });

  harness.setQueueState({ session: { status: "open", showStarted: false, updatedAt: "2026-08-20T12:01:00.000Z" } });
  const preBroadcast = await harness.api.getWheelOverlaySnapshot(now);
  assert.equal(preBroadcast.sessionActive, true, "pre-show session keeps the fast wake cadence");
  assert.equal(preBroadcast.broadcastActive, false);
  assert.equal(preBroadcast.scene?.mode, "session_active", "opening the session wakes the source before Start Broadcast");
  assert.equal(harness.getResolverInput()?.playerSync, harness.playerSync, "the pre-show scene shares live player sync");
  assert.deepEqual(harness.calls, { overlay: 1, player: 1, resolve: 1 });

  harness.setQueueState({ session: { status: "open", showStarted: true, updatedAt: "2026-08-20T12:02:00.000Z" } });
  const live = await harness.api.getWheelOverlaySnapshot(now);
  assert.equal(live.broadcastActive, true);
  assert.equal(live.wheelActive, false);
  assert.equal(live.scene?.mode, "session_active", "the full live scene is visible even without a Wheel ceremony");
  assert.equal(harness.getResolverInput()?.playerSync, harness.playerSync, "the square source shares live player sync");
  assert.deepEqual(harness.calls, { overlay: 2, player: 2, resolve: 2 });

  harness.setResolvedScene({ sessionActive: true, mode: "wheel_spinning", wheelCeremony: { status: "spinning" }, updatedAt: "2026-08-20T12:03:00.000Z" });
  const wheel = await harness.api.getWheelOverlaySnapshot(now);
  assert.equal(wheel.broadcastActive, true);
  assert.equal(wheel.wheelActive, true);
  assert.equal(wheel.scene?.wheelCeremony?.status, "spinning", "Wheel takes over the same live source");

  harness.setQueueState({ session: { status: "archived", showStarted: false, updatedAt: "2026-08-20T12:04:00.000Z" } });
  const ended = await harness.api.getWheelOverlaySnapshot(now);
  assert.equal(ended.broadcastActive, false);
  assert.equal(ended.scene, null, "End Broadcast clears the source back to chroma key");
  assert.deepEqual(harness.calls, { overlay: 3, player: 3, resolve: 3 }, "ended sessions do not read shared overlay state");
});
