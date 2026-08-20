import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) return path.join(projectRoot, "src", request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const auth = require("../src/lib/auth.ts");
const access = require("../src/lib/foreground-overlay-access.ts");

test("public foreground queue traffic requires both production and session publication", () => {
  const liveRuntime = { purpose: "live_broadcast", bnlPublicationStatus: "runtime_only" };
  const publicCopy = { purpose: "live_broadcast", bnlPublicationStatus: "public_copy_approved" };
  assert.equal(access.isForegroundQueueProjectionPublic({}, liveRuntime), false);
  assert.equal(access.isForegroundQueueProjectionPublic({ BARCODE_QUEUE_PRODUCTION_ENABLED: "true" }, { purpose: "rehearsal", bnlPublicationStatus: "private" }), false);
  assert.equal(access.isForegroundQueueProjectionPublic({ BARCODE_QUEUE_PRODUCTION_ENABLED: "true" }, { purpose: "live_broadcast", bnlPublicationStatus: "private" }), false);
  assert.equal(access.isForegroundQueueProjectionPublic({ BARCODE_QUEUE_PRODUCTION_ENABLED: "true" }, liveRuntime), false);
  assert.equal(access.isForegroundQueueProjectionPublic({ BARCODE_QUEUE_PRODUCTION_ENABLED: "true" }, publicCopy), true);
});

test("foreground source tokens are scoped and cannot authenticate as admin", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = "foreground-overlay-test-secret";
  try {
    const foregroundToken = await auth.createForegroundOverlayToken();
    assert.equal(await auth.verifyForegroundOverlayToken(foregroundToken), true);
    assert.equal(await auth.verifyAdminToken(foregroundToken), false);

    const adminToken = await auth.createAdminToken();
    assert.equal(await auth.verifyAdminToken(adminToken), true);
    assert.equal(await auth.verifyForegroundOverlayToken(adminToken), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("permanent Studio overlay tokens are stable and overlay-only", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = "studio-overlay-test-secret";
  try {
    const first = await auth.createStudioOverlayToken();
    const second = await auth.createStudioOverlayToken();
    assert.equal(first, second);
    assert.equal(await auth.verifyStudioOverlayToken(first), true);
    assert.equal(await auth.verifyAdminToken(first), false);
    assert.equal(await auth.verifyForegroundOverlayToken(first), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
