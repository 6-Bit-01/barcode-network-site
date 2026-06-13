import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Keep queue tests isolated to the in-memory store instead of any configured Redis.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

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
const cleanupRoute = require("../src/app/api/admin/queue/cleanup-uploads/route.ts");

test("scheduled upload cleanup rejects requests without CRON_SECRET", async () => {
  const original = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const response = await cleanupRoute.GET(new Request("https://example.test/api/admin/queue/cleanup-uploads"));
    assert.equal(response.status, 401);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});

test("scheduled upload cleanup rejects incorrect bearer token", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const response = await cleanupRoute.GET(new Request("https://example.test/api/admin/queue/cleanup-uploads", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    assert.equal(response.status, 401);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});

test("scheduled upload cleanup accepts CRON_SECRET bearer token and runs cleanup", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const response = await cleanupRoute.GET(new Request("https://example.test/api/admin/queue/cleanup-uploads", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { scanned: 0, deleted: 0, skippedActive: 0, failed: 0 });
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});
