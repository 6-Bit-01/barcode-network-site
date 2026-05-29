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
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const auth = require("../src/lib/auth.ts");
const route = require("../src/app/api/admin/dossiers/route.ts");

function source(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

async function adminCookie() {
  const token = await auth.createAdminToken();
  return `${auth.COOKIE_NAME}=${token}`;
}

test("admin panel includes Dossier Control Center link", () => {
  const adminPage = source("src/app/admin/page.tsx");
  assert.match(adminPage, /Dossier Control Center/);
  assert.match(adminPage, /Review dossier candidates, manage drafts, and prepare approved website dossier entries\./);
  assert.match(adminPage, /href="\/admin\/dossiers"/);
});

test("admin dossier page includes workflow shell sections", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  for (const label of ["Dossier Control Center", "Candidate Queue", "Draft Workspace", "Review Actions", "System Boundaries"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /\/api\/admin\/dossiers/);
  assert.match(page, /No candidates yet/);
  assert.match(page, /No draft selected/);
  assert.match(page, /Candidate intake wiring comes in a later PR/);
});

test("admin dossier API uses admin auth and returns empty workflow arrays", async () => {
  const unauthorized = await route.GET(new Request("https://example.test/api/admin/dossiers"));
  assert.equal(unauthorized.status, 401);

  const response = await route.GET(new Request("https://example.test/api/admin/dossiers", {
    headers: { cookie: await adminCookie() },
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.candidates, []);
  assert.deepEqual(payload.drafts, []);
  assert.equal(payload.workflow.version, 1);
  assert.equal(payload.workflow.status, "foundation_only");
  assert.ok(payload.workflow.allowedActions.includes("requestDraft"));
  assert.ok(payload.workflow.candidateSourceBoundaries.some((entry) => entry.source === "queue_frequency"));
});

test("admin dossier mutations are placeholder-only and do not publish", async () => {
  const contentBefore = source("src/content.ts");
  const response = await route.POST(new Request("https://example.test/api/admin/dossiers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: await adminCookie(),
    },
    body: JSON.stringify({ action: "approveDraft", candidateId: "candidate-test" }),
  }));

  assert.equal(response.status, 501);
  const payload = await response.json();
  assert.equal(payload.code, "not_implemented_yet");
  assert.match(payload.message, /intentionally disabled/);
  assert.equal(source("src/content.ts"), contentBefore);
});
