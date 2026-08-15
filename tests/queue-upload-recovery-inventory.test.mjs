import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

let typescript = null;
try {
  const imported = await import("typescript");
  typescript = imported.default ?? imported;
} catch {
  // The normal project install includes TypeScript. The Node 24 fallback keeps
  // this focused incident test runnable in a production-dependency-only tree.
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

let adminCookie = null;

class FakeBlob {
  static calls = [];
  static handler = async () => ({ blobs: [], hasMore: false });

  static async list(options) {
    FakeBlob.calls.push(["list", options]);
    return FakeBlob.handler(options);
  }

  static reset() {
    FakeBlob.calls.length = 0;
    FakeBlob.handler = async () => ({ blobs: [], hasMore: false });
  }
}

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
    assert.equal(typeof Module.stripTypeScriptTypes, "function", "TypeScript or Node's type stripper is required");
    outputText = Module.stripTypeScriptTypes(source, { mode: "transform" })
      .replace(/^import \{ ([^}]+) \} from "([^"]+)";$/gm, 'const { $1 } = require("$2");')
      .replace(/^export const (\w+) =/gm, "const $1 =")
      .replace(/^export async function GET\b/gm, "async function GET");
    outputText += "\nmodule.exports = { GET };\n";
  }
  module._compile(outputText, filename);
};

Module._load = function loadWithRecoveryFakes(request, parent, isMain) {
  if (request === "@vercel/blob") return { list: FakeBlob.list.bind(FakeBlob) };
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body, init = {}) => new Response(JSON.stringify(body), {
          ...init,
          headers: { "content-type": "application/json", ...(init.headers ?? {}) },
        }),
      },
    };
  }
  if (request === "next/headers") {
    return {
      cookies: async () => ({
        get: (name) => name === "barcode_admin" && adminCookie ? { value: adminCookie } : undefined,
      }),
    };
  }
  if (request === "@/lib/auth") {
    return {
      COOKIE_NAME: "barcode_admin",
      verifyAdminToken: async (token) => token === "valid-admin-token",
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("../src/app/api/admin/queue/recovery/uploads/route.ts");

function blob(uploadedAt, pathname, overrides = {}) {
  return {
    pathname,
    uploadedAt: new Date(uploadedAt),
    size: 1234,
    contentType: "audio/mpeg",
    url: `https://secret.private.blob.vercel-storage.com/${pathname}`,
    downloadUrl: `https://secret.private.blob.vercel-storage.com/${pathname}?download=1`,
    etag: "private-etag",
    ...overrides,
  };
}

function epochPath(uploadedAt, name) {
  return `barcode-radio-queue/${Date.parse(uploadedAt)}-${name}`;
}

function withBlobToken(value, fn) {
  const previous = process.env.BLOB_READ_WRITE_TOKEN;
  if (value === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = previous;
    });
}

test.beforeEach(() => {
  adminCookie = null;
  FakeBlob.reset();
});

test("upload recovery inventory requires the admin cookie and never lists when unauthorized", async () => {
  await withBlobToken("private-token", async () => {
    const response = await route.GET();
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
    assert.equal(FakeBlob.calls.length, 0);

    adminCookie = "invalid-token";
    const invalidResponse = await route.GET();
    assert.equal(invalidResponse.status, 401);
    assert.equal(FakeBlob.calls.length, 0);
  });
});

test("upload recovery inventory fails closed when owned Blob storage is not configured", async () => {
  adminCookie = "valid-admin-token";
  await withBlobToken(undefined, async () => {
    const response = await route.GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), {
      error: "Upload storage is not configured.",
      reason: "blob_storage_not_configured",
      readOnly: true,
    });
    assert.equal(FakeBlob.calls.length, 0);
  });
});

test("upload recovery inventory paginates all blobs, returns only three explicit windows, and strips private fields", async () => {
  adminCookie = "valid-admin-token";
  const token = "private-blob-token-must-not-leak";
  const mismatchPath = epochPath("2026-08-12T12:00:00.000Z", "clock-mismatch.mp3");
  const missingEpochPath = "barcode-radio-queue/no-client-epoch.mp3";

  FakeBlob.handler = async ({ cursor }) => {
    if (!cursor) {
      return {
        blobs: [
          blob("2026-08-07T06:59:59.999Z", epochPath("2026-08-07T06:59:59.999Z", "before-aug7.mp3")),
          blob("2026-08-07T07:00:00.000Z", epochPath("2026-08-07T07:00:00.000Z", "aug7-start.mp3")),
          blob("2026-08-08T07:00:00.000Z", epochPath("2026-08-08T07:00:00.000Z", "aug7-end-excluded.mp3")),
          blob("2026-08-14T07:00:00.000Z", epochPath("2026-08-14T07:00:00.000Z", "aug14-start.wav"), { size: 4321, contentType: "audio/wave" }),
          blob("2026-08-15T07:00:00.000Z", epochPath("2026-08-15T07:00:00.000Z", "spillover-start.mp3")),
          blob("2026-08-15T10:23:00.001Z", epochPath("2026-08-15T10:23:00.001Z", "after-cutoff.mp3")),
          blob("2026-08-14T12:00:00.000Z", mismatchPath),
          blob("2026-08-14T13:00:00.000Z", missingEpochPath, { contentType: undefined }),
        ],
        hasMore: true,
        cursor: "page-two",
      };
    }
    assert.equal(cursor, "page-two");
    return {
      blobs: [
        blob("2026-08-08T06:59:59.999Z", epochPath("2026-08-08T06:59:59.999Z", "aug7-last.mp3")),
        blob("2026-08-15T10:23:00.000Z", epochPath("2026-08-15T10:23:00.000Z", "cutoff-inclusive.mp3")),
      ],
      hasMore: false,
    };
  };

  await withBlobToken(token, async () => {
    const response = await route.GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const payload = await response.json();

    assert.equal(payload.readOnly, true);
    assert.equal(payload.complete, true);
    assert.equal(payload.truncated, false);
    assert.equal(payload.listCalls, 2);
    assert.equal(payload.count, 7);
    assert.deepEqual(payload.windows, [
      {
        label: "aug7_pdt",
        startInclusive: "2026-08-07T07:00:00.000Z",
        endExclusive: "2026-08-08T07:00:00.000Z",
        count: 2,
      },
      {
        label: "aug14_canonical",
        startInclusive: "2026-08-14T07:00:00.000Z",
        endExclusive: "2026-08-15T07:00:00.000Z",
        count: 3,
      },
      {
        label: "aug14_spillover",
        startInclusive: "2026-08-15T07:00:00.000Z",
        endInclusive: "2026-08-15T10:23:00.000Z",
        count: 2,
      },
    ]);

    assert.deepEqual(payload.uploads.map((item) => item.recoveryWindow), [
      "aug7_pdt",
      "aug7_pdt",
      "aug14_canonical",
      "aug14_canonical",
      "aug14_canonical",
      "aug14_spillover",
      "aug14_spillover",
    ]);

    const exact = payload.uploads.find((item) => item.pathname.endsWith("aug14-start.wav"));
    assert.deepEqual(exact, {
      pathname: epochPath("2026-08-14T07:00:00.000Z", "aug14-start.wav"),
      uploadedAt: "2026-08-14T07:00:00.000Z",
      size: 4321,
      contentType: "audio/wave",
      recoveryWindow: "aug14_canonical",
      clientEpochMs: Date.parse("2026-08-14T07:00:00.000Z"),
      clientEpochAt: "2026-08-14T07:00:00.000Z",
      epochPrefixDeltaMs: 0,
      epochPrefixDiscrepancy: false,
    });

    const mismatch = payload.uploads.find((item) => item.pathname === mismatchPath);
    assert.equal(mismatch.clientEpochAt, "2026-08-12T12:00:00.000Z");
    assert.equal(mismatch.epochPrefixDeltaMs, 172_800_000);
    assert.equal(mismatch.epochPrefixDiscrepancy, true);

    const missing = payload.uploads.find((item) => item.pathname === missingEpochPath);
    assert.equal(missing.clientEpochMs, null);
    assert.equal(missing.clientEpochAt, null);
    assert.equal(missing.epochPrefixDeltaMs, null);
    assert.equal(missing.epochPrefixDiscrepancy, true);
    assert.equal(Object.hasOwn(missing, "contentType"), false);

    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /private-blob-token-must-not-leak|private\.blob\.vercel-storage\.com|downloadUrl|private-etag|etag/);
    assert.deepEqual(FakeBlob.calls, [
      ["list", { prefix: "barcode-radio-queue/", mode: "expanded", limit: 1000, cursor: undefined, token }],
      ["list", { prefix: "barcode-radio-queue/", mode: "expanded", limit: 1000, cursor: "page-two", token }],
    ]);
  });
});

test("upload recovery inventory rejects stalled pagination without returning partial results", async () => {
  adminCookie = "valid-admin-token";
  FakeBlob.handler = async () => ({
    blobs: [blob("2026-08-14T08:00:00.000Z", epochPath("2026-08-14T08:00:00.000Z", "partial.mp3"))],
    hasMore: true,
    cursor: "stalled",
  });

  await withBlobToken("private-token", async () => {
    const response = await route.GET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "Upload recovery inventory could not be collected.",
      reason: "blob_inventory_unavailable",
      readOnly: true,
      complete: false,
      partialResultsReturned: false,
      listCalls: 2,
    });
    assert.equal(FakeBlob.calls.length, 2);
  });
});

test("upload recovery inventory fails explicitly instead of truncating after the safe page cap", async () => {
  adminCookie = "valid-admin-token";
  FakeBlob.handler = async () => ({
    blobs: [],
    hasMore: true,
    cursor: `cursor-${FakeBlob.calls.length}`,
  });

  await withBlobToken("private-token", async () => {
    const response = await route.GET();
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.complete, false);
    assert.equal(payload.partialResultsReturned, false);
    assert.equal(payload.listCalls, 100);
    assert.equal(Object.hasOwn(payload, "uploads"), false);
    assert.equal(FakeBlob.calls.length, 100);
  });
});

test("upload recovery route has only a GET surface and imports only the Blob list operation", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/queue/recovery/uploads/route.ts"), "utf8");
  assert.match(source, /import \{ list \} from "@vercel\/blob";/);
  assert.doesNotMatch(source, /import \{[^}]*\b(?:get|put|del)\b[^}]*\} from "@vercel\/blob";/);
  assert.doesNotMatch(source, /export async function (?:POST|PUT|PATCH|DELETE)\b/);
});
