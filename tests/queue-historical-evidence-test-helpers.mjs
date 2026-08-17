import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
let typescript = null;
try {
  const importedTypeScript = await import("typescript");
  typescript = importedTypeScript.default ?? importedTypeScript;
} catch {
  // Node 24's transformer keeps these focused tests runnable when the local
  // dependency tree is not installed.
}

let loaderInstalled = false;
let blobSdkMock = {
  get: async () => { throw new Error("unexpected default Blob get"); },
  list: async () => { throw new Error("unexpected default Blob list"); },
  put: async () => { throw new Error("unexpected default Blob put"); },
};

export function installHistoricalEvidenceTypeScriptLoader() {
  if (loaderInstalled) return;
  loaderInstalled = true;
  const originalResolveFilename = Module._resolveFilename;
  const originalLoad = Module._load;
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
  Module._load = function load(request, parent, isMain) {
    if (request === "@vercel/blob") return blobSdkMock;
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
      assert.equal(typeof Module.stripTypeScriptTypes, "function");
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
}

export function setBlobSdkMock(mock) {
  blobSdkMock = { ...blobSdkMock, ...mock };
}

export function loadHistoricalEvidenceModules() {
  installHistoricalEvidenceTypeScriptLoader();
  return {
    ledger: require("../src/lib/queue-historical-evidence-ledger.ts"),
    repository: require("../src/lib/queue-historical-evidence-repository.ts"),
    importer: require("../src/lib/queue-historical-evidence-import.ts"),
  };
}

export function makeLedger(ledgerModule, overrides = {}) {
  const canonicalShowDate = overrides.canonicalShowDate ?? "2026-08-07";
  const acceptance = overrides.acceptance ?? {
    mode: "aggregate",
    acceptedRequestCount: 0,
    rejectedCooldownRequestCount: 0,
    acceptedEvidenceIds: [],
    rejectedCooldownEvidenceIds: [],
    events: [],
  };
  const tracks = overrides.tracks ?? [];
  const sources = overrides.sources ?? [{
    evidenceId: "owner-attestation",
    kind: "owner_attestation",
    sha256: "0".repeat(64),
    recordLocator: "private/recovery/owner-only-source.json",
    privacy: "private",
    observedAt: "2026-08-08T01:00:00.000Z",
    canonicalShowDate,
    coverage: "not_applicable",
  }];
  return ledgerModule.sealQueueHistoricalEvidenceLedger({
    schema: ledgerModule.QUEUE_HISTORICAL_EVIDENCE_SCHEMA,
    previousBundleDigest: overrides.previousBundleDigest ?? null,
    canonicalShowDate,
    sourceSessionId: overrides.sourceSessionId ?? "private-session-id",
    completeness: overrides.completeness ?? "partial",
    visibility: "admin_only",
    acceptance,
    sources,
    tracks,
    candidates: overrides.candidates ?? [],
    coverage: overrides.coverage
      ?? ledgerModule.deriveQueueHistoricalEvidenceCoverage(acceptance, tracks),
  });
}

export function digestMapForLedger(value) {
  return Object.fromEntries(
    value.sources
      .filter((source) => source.sha256 !== null)
      .map((source) => [source.evidenceId, source.sha256]),
  );
}

export class FakeHistoricalEvidenceBlobStore {
  constructor(repositoryModule, entries = []) {
    this.repository = repositoryModule;
    this.objects = new Map(entries);
    this.listCalls = 0;
    this.getCalls = 0;
    this.putCalls = [];
    this.beforeList = null;
    this.failList = null;
  }

  readDependencies() {
    return {
      listBlobs: async (options) => {
        this.listCalls += 1;
        if (this.beforeList) await this.beforeList(this.listCalls, options, this);
        if (this.failList) throw this.failList;
        const all = [...this.objects.entries()]
          .filter(([pathname]) => pathname.startsWith(options.prefix))
          .sort(([left], [right]) => left.localeCompare(right));
        const start = options.cursor ? Number(options.cursor) : 0;
        const page = all.slice(start, start + options.limit);
        const next = start + page.length;
        return {
          blobs: page.map(([pathname, body]) => ({
            pathname,
            size: new TextEncoder().encode(body).byteLength,
          })),
          cursor: next < all.length ? String(next) : undefined,
          hasMore: next < all.length,
        };
      },
      getBlob: async (pathname, options) => {
        this.getCalls += 1;
        assert.equal(options.access, "private");
        assert.equal(options.useCache, false);
        const body = this.objects.get(pathname);
        if (body === undefined) return null;
        const bytes = new TextEncoder().encode(body);
        return {
          statusCode: 200,
          blob: { size: bytes.byteLength },
          stream: new Response(bytes).body,
        };
      },
    };
  }

  writeDependencies(putImplementation) {
    return {
      ...this.readDependencies(),
      putBlob: async (pathname, body, options) => {
        this.putCalls.push({ pathname, body, options });
        if (putImplementation) return putImplementation(pathname, body, options, this);
        if (this.objects.has(pathname)) throw new Error("Blob already exists");
        this.objects.set(pathname, body);
        return { pathname };
      },
    };
  }

  addLedger(ledgerModule, ledger) {
    const pathname = this.repository.queueHistoricalEvidencePathnameForPredecessor(
      ledger.previousBundleDigest,
    );
    this.objects.set(pathname, ledgerModule.canonicalQueueHistoricalEvidenceJson(ledger));
  }
}

export function withDedicatedToken(callback) {
  const previous = process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN;
  process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN = "test-dedicated-private-token";
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (previous === undefined) delete process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN;
      else process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN = previous;
    });
}
