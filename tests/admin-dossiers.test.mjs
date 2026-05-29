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
const workflow = require("../src/lib/dossier-workflow.ts");

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

test("admin dossier page gates workflow shell behind successful API payload", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  for (const label of ["Dossier Control Center", "Candidate Queue", "Candidate Evidence", "Candidate Gate / Scoring", "Draft Readiness / Missing Info", "Draft Workspace", "Review Actions", "Focused BNL Assistant", "System Boundaries"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /\/api\/admin\/dossiers/);
  assert.match(page, /No candidates yet/);
  assert.match(page, /No draft selected/);
  assert.match(page, /Candidate intake wiring comes in a later PR/);
  assert.match(page, /Why Now/);
  assert.match(page, /Duplicate Risk/);
  assert.match(page, /Missing Info/);
  assert.match(page, /Do Not Say/);
  assert.match(page, /loose intake \/ strict publishing/i);
  assert.match(page, /Try Again: Too Long/);
  assert.match(page, /Try Again: Too Vague/);
  assert.match(page, /Rewrite Summary Only/);

  assert.doesNotMatch(page, /payload\?\.candidates \?\? \[\]/);
  assert.doesNotMatch(page, /payload\?\.workflow\.boundaries \?\? \[/);
  assert.match(page, /if \(loading\)/);
  assert.match(page, /if \(error \|\| !payload\)/);
  assert.match(page, /const candidates = payload\.candidates/);
  assert.match(page, /const boundaries = payload\.workflow\.boundaries/);

  const loadingGate = page.indexOf("if (loading)");
  const authGate = page.indexOf("if (error || !payload)");
  const payloadRead = page.indexOf("const candidates = payload.candidates");
  const fullShell = page.indexOf('aria-label="Dossier Control Center"');

  assert.ok(loadingGate > -1 && loadingGate < fullShell, "loading state must return before the full shell");
  assert.ok(authGate > loadingGate && authGate < fullShell, "auth/error state must return before the full shell");
  assert.ok(payloadRead > authGate && payloadRead < fullShell, "full shell must use an authenticated payload");
});

test("admin dossier page has minimal loading and auth-required states", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  assert.match(page, /Checking admin access\.\.\./);
  assert.match(page, /Admin authentication required/);
  assert.match(page, /Back to Admin/);
  assert.match(page, /MinimalDossierAdminState/);
});

test("dossier workflow types include candidate evidence and scoring policy contracts", () => {
  const workflowSource = source("src/lib/dossier-workflow.ts");
  assert.match(workflowSource, /export type DossierCandidateEvidenceType/);
  assert.match(workflowSource, /export type DossierCandidateEvidence/);
  assert.match(workflowSource, /candidateType: DossierCandidateType/);
  assert.match(workflowSource, /tier: DossierCandidateTier/);
  assert.match(workflowSource, /score: number/);
  assert.match(workflowSource, /whyNow: string/);
  assert.match(workflowSource, /duplicateRisk\?: DossierDuplicateRisk/);
  assert.match(workflowSource, /missingInfo\?: string\[\]/);
  assert.match(workflowSource, /doNotSay\?: string\[\]/);
  assert.equal(workflow.DOSSIER_CANDIDATE_SCORING_POLICY.gate, "Loose intake, strict drafting/publishing.");
  assert.equal(workflow.DOSSIER_CANDIDATE_SCORING_POLICY.thresholds.reviewCandidateMin, 50);
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
  assert.equal(payload.workflow.scoringPolicy.gate, "Loose intake, strict drafting/publishing.");
  assert.equal(payload.workflow.scoringPolicy.thresholds.draftReadyMin, 70);
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
