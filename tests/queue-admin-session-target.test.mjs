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
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const { resolveQueueArchiveSessionId } = require("../src/lib/queue-admin-session-target.ts");

function session(sessionId, status, updatedAt, showStarted = false) {
  return {
    sessionId,
    status,
    createdAt: updatedAt,
    updatedAt,
    showStarted,
  };
}

test("uses the current non-archived session", () => {
  const current = session("live", "open", "2026-08-16T01:00:00.000Z");
  assert.equal(resolveQueueArchiveSessionId({ session: current, sessions: [current], isCurrentSession: true }), "live");
});

test("skips an archived selected session and finds the real open session", () => {
  const archived = session("historical", "archived", "2026-08-16T02:00:00.000Z");
  const live = session("live", "open", "2026-08-16T01:00:00.000Z");
  assert.equal(resolveQueueArchiveSessionId({ session: archived, sessions: [archived, live], isCurrentSession: false }), "live");
});

test("prefers an active broadcast even when submissions are closed", () => {
  const archived = session("historical", "archived", "2026-08-16T03:00:00.000Z");
  const closedBroadcast = session("closed-live", "closed", "2026-08-16T02:00:00.000Z", true);
  const prepared = session("prepared", "prepared", "2026-08-16T01:00:00.000Z");
  assert.equal(resolveQueueArchiveSessionId({ session: archived, sessions: [archived, prepared, closedBroadcast], isCurrentSession: false }), "closed-live");
});

test("otherwise prefers open, then prepared, then closed", () => {
  const archived = session("historical", "archived", "2026-08-16T04:00:00.000Z");
  const closed = session("closed", "closed", "2026-08-16T03:00:00.000Z");
  const prepared = session("prepared", "prepared", "2026-08-16T02:00:00.000Z");
  const open = session("open", "open", "2026-08-16T01:00:00.000Z");
  assert.equal(resolveQueueArchiveSessionId({ session: archived, sessions: [archived, closed, prepared, open], isCurrentSession: false }), "open");
});

test("an explicit session id wins", () => {
  const current = session("live", "open", "2026-08-16T03:00:00.000Z");
  const requested = session("requested", "closed", "2026-08-16T01:00:00.000Z");
  assert.equal(resolveQueueArchiveSessionId({ session: current, sessions: [current, requested], isCurrentSession: true }, "requested"), "requested");
});

test("an explicitly archived session is already ended", () => {
  const archived = session("historical", "archived", "2026-08-16T01:00:00.000Z");
  assert.equal(resolveQueueArchiveSessionId({ session: archived, sessions: [archived], isCurrentSession: false }, "historical"), null);
});

test("rejects an unknown explicit session id", () => {
  const current = session("live", "open", "2026-08-16T01:00:00.000Z");
  assert.throws(
    () => resolveQueueArchiveSessionId({ session: current, sessions: [current], isCurrentSession: true }, "missing"),
    /Queue session not found/,
  );
});
