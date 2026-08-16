import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
let typescript = null;
try {
  const importedTypeScript = await import("typescript");
  typescript = importedTypeScript.default ?? importedTypeScript;
} catch {
  // Node 24 supplies the fallback transformer used below.
}
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

let repositoryCalls = 0;
let bodyReads = 0;
let cookieValue;
let authFailure = false;

class MockHistoricalEvidenceError extends Error {
  constructor(code, status, message, options) {
    super(message, options);
    this.code = code;
    this.status = status;
  }
}

const repositoryMock = {
  QUEUE_HISTORICAL_EVIDENCE_MAX_REQUEST_BYTES: 1_310_720,
  QueueHistoricalEvidenceError: MockHistoricalEvidenceError,
  getQueueHistoricalEvidenceChainSummary: async () => { repositoryCalls += 1; return {}; },
  buildQueueHistoricalEvidenceImportPlan: async () => { repositoryCalls += 1; return {}; },
};
const importerMock = {
  appendQueueHistoricalEvidence: async () => { repositoryCalls += 1; return { appended: true }; },
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/") && ![
    "@/lib/auth",
    "@/lib/queue-historical-evidence-repository",
    "@/lib/queue-historical-evidence-import",
  ].includes(request)) {
    const resolved = path.join(projectRoot, "src", request.slice(2));
    if (fs.existsSync(resolved)) return resolved;
    if (fs.existsSync(`${resolved}.ts`)) return `${resolved}.ts`;
    return resolved;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._load = function load(request, parent, isMain) {
  if (request === "next/headers") {
    return { cookies: async () => ({ get: () => cookieValue === undefined ? undefined : { value: cookieValue } }) };
  }
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} }),
      },
    };
  }
  if (request === "@/lib/auth") {
    return {
      COOKIE_NAME: "admin",
      verifyAdminToken: async () => {
        if (authFailure) throw new Error("auth backend failure");
        return false;
      },
    };
  }
  if (request === "@/lib/queue-historical-evidence-repository") return repositoryMock;
  if (request === "@/lib/queue-historical-evidence-import") return importerMock;
  return originalLoad.call(this, request, parent, isMain);
};
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  let outputText;
  if (typescript) {
    outputText = typescript.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
  } else {
    outputText = Module.stripTypeScriptTypes(source, { mode: "transform" });
    const exports = [];
    outputText = outputText.replace(
      /import\s+\{([\s\S]*?)\}\s+from\s+"([^"]+)";/g,
      (_match, imports, request) => `const {${imports}} = require(${JSON.stringify(request)});`,
    );
    outputText = outputText.replace(
      /export\s+(async\s+)?(const|class|function)\s+(\w+)/g,
      (_match, asyncKeyword = "", kind, name) => {
        exports.push(name);
        return `${asyncKeyword}${kind} ${name}`;
      },
    );
    outputText = outputText.replace(/export\s*\{\s*\};?/g, "");
    outputText += `\nmodule.exports = { ${exports.join(", ")} };\n`;
  }
  module._compile(outputText, filename);
};

function unreadRequest() {
  return {
    headers: { get: () => { bodyReads += 1; return "application/json"; } },
    get body() { bodyReads += 1; throw new Error("unauthorized body was touched"); },
  };
}

test("all historical evidence routes authenticate before body parsing or Blob access", async () => {
  repositoryCalls = 0;
  bodyReads = 0;
  cookieValue = undefined;
  authFailure = false;
  const summaryRoute = require("../src/app/api/admin/queue/historical-evidence/route.ts");
  const dryRunRoute = require("../src/app/api/admin/queue/historical-evidence/dry-run/route.ts");
  const applyRoute = require("../src/app/api/admin/queue/historical-evidence/apply/route.ts");

  const responses = [
    await summaryRoute.GET(),
    await dryRunRoute.POST(unreadRequest()),
    await applyRoute.POST(unreadRequest()),
  ];
  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401]);
  assert.equal(repositoryCalls, 0);
  assert.equal(bodyReads, 0);
  for (const response of responses) {
    assert.match(response.headers["Cache-Control"], /private/);
    assert.match(response.headers["Cache-Control"], /no-store/);
    assert.equal(response.headers.Vary, "Cookie");
  }
});

test("authentication failures return private no-store 503 without reading body or Blob", async () => {
  repositoryCalls = 0;
  bodyReads = 0;
  cookieValue = "present-admin-token";
  authFailure = true;
  const summaryRoute = require("../src/app/api/admin/queue/historical-evidence/route.ts");
  const dryRunRoute = require("../src/app/api/admin/queue/historical-evidence/dry-run/route.ts");
  const applyRoute = require("../src/app/api/admin/queue/historical-evidence/apply/route.ts");
  const responses = [
    await summaryRoute.GET(),
    await dryRunRoute.POST(unreadRequest()),
    await applyRoute.POST(unreadRequest()),
  ];
  assert.deepEqual(responses.map((response) => response.status), [503, 503, 503]);
  assert.equal(repositoryCalls, 0);
  assert.equal(bodyReads, 0);
  for (const response of responses) {
    assert.match(response.headers["Cache-Control"], /private, no-store/);
    assert.equal(response.body.reason, "historical_evidence_unavailable");
  }
  cookieValue = undefined;
  authFailure = false;
});

test("POST source keeps the admin gate textually before bounded parsing and storage calls", () => {
  for (const relativePath of [
    "src/app/api/admin/queue/historical-evidence/dry-run/route.ts",
    "src/app/api/admin/queue/historical-evidence/apply/route.ts",
  ]) {
    const source = fs.readFileSync(relativePath, "utf8");
    const authIndex = source.indexOf("isHistoricalEvidenceAdmin()");
    const parseIndex = source.indexOf("readHistoricalEvidenceJsonBody(request)");
    assert.ok(authIndex >= 0 && parseIndex > authIndex, `${relativePath} authenticates before parsing`);
    const storageIndex = Math.max(
      source.indexOf("buildQueueHistoricalEvidenceImportPlan"),
      source.indexOf("appendQueueHistoricalEvidence"),
    );
    assert.ok(storageIndex >= 0, `${relativePath} has its intended operation`);
  }
});

test("shared parser enforces bounded streaming JSON and private no-store responses", () => {
  const source = fs.readFileSync(
    "src/app/api/admin/queue/historical-evidence/_shared.ts",
    "utf8",
  );
  assert.match(source, /QUEUE_HISTORICAL_EVIDENCE_MAX_REQUEST_BYTES/);
  assert.match(source, /request\.body\.getReader\(\)/);
  assert.match(source, /TextDecoder\("utf-8", \{ fatal: true \}\)/);
  assert.match(source, /"Cache-Control": "private, no-store, max-age=0"/);
  assert.doesNotMatch(source, /await request\.json\(\)|await request\.text\(\)/);
});

test("shared parser rejects an oversized declared body before reading it", async () => {
  const shared = require("../src/app/api/admin/queue/historical-evidence/_shared.ts");
  let bodyAccesses = 0;
  const request = {
    headers: {
      get: (name) => name === "content-type"
        ? "application/json"
        : name === "content-length"
          ? "1310721"
          : null,
    },
    get body() { bodyAccesses += 1; throw new Error("oversized body must not be read"); },
  };
  await assert.rejects(
    shared.readHistoricalEvidenceJsonBody(request),
    (error) => error?.code === "historical_evidence_request_too_large" && error?.status === 413,
  );
  assert.equal(bodyAccesses, 0);
});
