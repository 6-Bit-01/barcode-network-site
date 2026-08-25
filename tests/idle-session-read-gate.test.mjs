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
  const originalTsxExtension = Module._extensions[".tsx"];
  Module._extensions[".ts"] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
  Module._extensions[".tsx"] = Module._extensions[".ts"];
  try { return run(); }
  finally {
    Module._extensions[".ts"] = originalExtension;
    Module._extensions[".tsx"] = originalTsxExtension;
  }
}

function loadQueueRoute(snapshot) {
  const calls = { runtime: 0 };
  const originalLoad = Module._load;
  Module._load = function loadWithStubs(request, parent, isMain) {
    if (request === "next/server") return { NextResponse: { json: (value) => ({ json: async () => value }) } };
    if (request === "@/lib/queue") return {
      getPublicQueueSnapshot: async () => snapshot,
      getRadioQueueState: async () => ({}),
      isTrackPersistedInSessionQueue: async () => false,
      normalizeQueueSourceKey: () => "",
      requestPriorityUpgradePlaceholder: async () => null,
      sanitizeQueueSnapshotForPublic: (value) => value,
      submitRadioTrack: async () => null,
      toPublicQueueTrack: (value) => value,
    };
    if (request === "@/lib/auth") return { verifyAdminRequest: async () => false };
    if (request === "@/lib/live-overlay") return {
      getLiveOverlayRuntimeState: async () => {
        calls.runtime += 1;
        return { playerSync: null, overlayState: null };
      },
    };
    if (request === "@/lib/queue-live-timing") return { attachQueueLiveTiming: (value) => value };
    if (request === "@/lib/queue-types") return {
      APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE: "unsupported",
      PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT: "legal",
      PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION: "1",
      PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION: "1",
      PUBLIC_QUEUE_LEGAL_TERMS_VERSION: "1",
      detectQueueSourceType: () => "other",
      isAppleMusicUrl: () => false,
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return withTypeScriptLoader(() => {
      const routePath = require.resolve(path.join(projectRoot, "src/app/api/queue/route.ts"));
      delete require.cache[routePath];
      return { route: require(routePath), calls };
    });
  } finally {
    Module._load = originalLoad;
  }
}

test("public queue GET does not read shared overlay keys without a current session", async () => {
  const { route, calls } = loadQueueRoute({ revision: 0, sessionActive: false, session: null, status: {}, queue: [], completed: [] });
  await route.GET(new Request("https://example.test/api/queue"));
  assert.deepEqual(calls, { runtime: 0 });
});

test("public queue GET combines shared overlay state into one active-session read", async () => {
  const { route, calls } = loadQueueRoute({ revision: 1, sessionActive: true, session: { status: "open" }, status: {}, queue: [], completed: [] });
  await route.GET(new Request("https://example.test/api/queue"));
  assert.deepEqual(calls, { runtime: 1 });
});

test("overlay builders read queue authority before shared state and short-circuit while idle", () => {
  const liveOverlay = fs.readFileSync(path.join(projectRoot, "src/lib/live-overlay.ts"), "utf8");
  const foregroundOverlay = fs.readFileSync(path.join(projectRoot, "src/lib/foreground-overlay.ts"), "utf8");
  const wheelOverlay = fs.readFileSync(path.join(projectRoot, "src/lib/wheel-overlay.ts"), "utf8");
  assert.match(liveOverlay, /const queueState = await getRadioLiveQueueState\(\);\s*if \(!hasActiveQueueSession\(queueState\)\)/);
  assert.match(liveOverlay, /return resolveLiveOverlaySceneFromQueueState\(\{ overlayState: defaultLiveOverlayState\(\), queueState, playerSync: null \}\)/);
  assert.match(foregroundOverlay, /const queueState = await getRadioLiveQueueState\(\);\s*const sessionActive = hasActiveQueueSession\(queueState\)/);
  const idleBranch = foregroundOverlay.slice(foregroundOverlay.indexOf("if (!sessionActive)"), foregroundOverlay.indexOf("const { overlayState, playerSync }"));
  assert.doesNotMatch(idleBranch, /getLiveOverlayRuntimeState/);
  assert.match(wheelOverlay, /const queueState = await getRadioLiveQueueState\(\);\s*if \(!hasActiveQueueSession\(queueState\)\)/);
  const wheelIdleBranch = wheelOverlay.slice(wheelOverlay.indexOf("if (!hasActiveQueueSession(queueState))"), wheelOverlay.indexOf("const broadcastActive"));
  assert.doesNotMatch(wheelIdleBranch, /getLiveOverlayRuntimeState/);
  assert.doesNotMatch(wheelOverlay, /if \(!broadcastActive\)/);
  assert.match(wheelOverlay, /const broadcastActive[\s\S]*const \{ overlayState, playerSync \} = await getLiveOverlayRuntimeState\(\)/);
});
