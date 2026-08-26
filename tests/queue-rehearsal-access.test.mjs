import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const resolved = path.join(projectRoot, "src", request.slice(2));
    if (fs.existsSync(resolved)) return resolved;
    if (fs.existsSync(`${resolved}.ts`)) return `${resolved}.ts`;
    return resolved;
  }
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

process.env.JWT_SECRET = "queue-rehearsal-access-test-secret";
const require = createRequire(import.meta.url);
const auth = require("../src/lib/auth.ts");
const access = require("../src/lib/queue-rehearsal-access.ts");

test("rehearsal access tokens are signed, session-scoped, and cannot authenticate as admin", async () => {
  const token = await auth.createRehearsalQueueToken("session_rehearsal_one");
  assert.equal(await auth.verifyRehearsalQueueToken(token, "session_rehearsal_one"), true);
  assert.equal(await auth.verifyRehearsalQueueToken(token, "session_rehearsal_two"), false);
  assert.equal(await auth.verifyAdminToken(token), false);
  assert.equal(await auth.verifyRehearsalQueueToken(`${token}tampered`, "session_rehearsal_one"), false);
});

test("the rehearsal cookie authorizes only an active rehearsal session", async () => {
  const sessionId = "session_rehearsal_cookie";
  const token = await auth.createRehearsalQueueToken(sessionId);
  const request = new Request("https://example.test/api/queue", {
    headers: { cookie: `${auth.REHEARSAL_QUEUE_COOKIE_NAME}=${token}` },
  });
  const base = { sessionId, purpose: "rehearsal", status: "open", broadcastPhase: "submission_window" };

  assert.equal(await access.requestHasRehearsalQueueAccess(request, base), true);
  assert.equal(await access.requestHasRehearsalQueueAccess(request, { ...base, purpose: "simulation" }), false);
  assert.equal(await access.requestHasRehearsalQueueAccess(request, { ...base, purpose: "internal_test" }), false);
  assert.equal(await access.requestHasRehearsalQueueAccess(request, { ...base, purpose: "live_broadcast" }), false);
  assert.equal(await access.requestHasRehearsalQueueAccess(request, { ...base, status: "archived" }), false);
  assert.equal(await access.requestHasRehearsalQueueAccess(request, { ...base, broadcastPhase: "ended" }), false);
  assert.equal(await access.requestHasRehearsalQueueAccess(request, { ...base, sessionId: "session_other" }), false);
});
