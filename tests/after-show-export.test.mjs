import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

delete process.env.QUEUE_REDIS_REST_URL;
delete process.env.QUEUE_REDIS_REST_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.BLOB_READ_WRITE_TOKEN;
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";

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
const queue = require("../src/lib/queue.ts");
const route = require("../src/app/api/ops/after-show/route.ts");

const secret = "fixture-after-show-token-00000000000000";
const request = (id, token = secret) => new Request(`https://example.test/api/ops/after-show${id ? `?sessionId=${encodeURIComponent(id)}` : ""}`, { headers: { authorization: `Bearer ${token}` } });

async function session(purpose = "live_broadcast", access = "public_copy_approved", start = true) {
  const existing = await queue.getRadioQueueState();
  if (existing.session?.status !== "archived") await queue.archiveCurrentQueueSession();
  const state = await queue.startNewQueueSession({ title: "Evidence fixture", purpose, bnlPublicationStatus: access });
  if (start) await queue.updateRadioTrack("", "startShow");
  return state.session.sessionId;
}

test("export requires its dedicated credential and leaves production disabled when disabled", async () => {
  delete process.env.BARCODE_AFTER_SHOW_EXPORT_TOKEN;
  assert.equal((await route.GET(request())).status, 401);
  process.env.BARCODE_AFTER_SHOW_EXPORT_TOKEN = secret;
  assert.equal((await route.GET(request(undefined, "wrong"))).status, 401);
  process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "false";
  assert.equal((await route.GET(request())).status, 503);
  process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
});

test("active, private, rehearsal and unstarted sessions never enter the automatic export", async () => {
  const live = await session();
  assert.equal((await route.GET(request(live))).status, 404);
  await queue.archiveCurrentQueueSession();
  for (const [purpose, access, started] of [["rehearsal", "runtime_only", true], ["live_broadcast", "private", true], ["live_broadcast", "public_copy_approved", false]]) {
    const id = await session(purpose, access, started);
    await queue.archiveCurrentQueueSession();
    assert.equal((await route.GET(request(id))).status, 404);
  }
  const index = await (await route.GET(request())).json();
  assert.deepEqual(index.shows.map(show => show.sessionId), [live]);
});

test("one archived snapshot exports both reports without private fields, simulation tracks or mutation", async () => {
  const id = await session();
  for (const [artist, isTestTrack] of [["Fixture Artist", false], ["SIM private fixture", true]]) {
    await queue.addToQueue({ artist, title: "Fixture Song", link: "https://private.example/upload.mp3", sourceType: "upload", fileUrl: "https://private.example/upload.mp3", contactEmail: "private-contact@example.test", submitterToken: "private-browser-token", note: "private-admin-note", stripeSessionId: "private-stripe-id", isTestTrack, tier: "free", lane: "regular", amount: 0, createdAt: new Date().toISOString() });
  }
  await queue.archiveCurrentQueueSession();
  const before = await queue.getRadioQueueState(id);
  const response = await route.GET(request(id));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.json();
  assert.equal(body.show.sessionId, id);
  assert.equal(body.showLog.revision, body.playback.session.revision);
  assert.equal(body.playback.liveTiming, null);
  assert.equal(body.showLog.session.status, "archived");
  assert.equal(body.coverage.completeShowTraceGuaranteed, false);
  const text = JSON.stringify(body);
  for (const forbidden of ["private.example", "private-contact", "private-browser-token", "private-admin-note", "private-stripe-id", "SIM private fixture"]) assert.equal(text.includes(forbidden), false, forbidden);
  const after = await queue.getRadioQueueState(id);
  assert.deepEqual(after, before);
});

test("missing or malformed exact session never falls back to a live show", async () => {
  await session();
  assert.equal((await route.GET(request("missing-session"))).status, 404);
  assert.equal((await route.GET(request("../private"))).status, 400);
});
