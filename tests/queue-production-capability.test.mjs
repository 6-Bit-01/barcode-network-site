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
  const { outputText } = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename });
  module._compile(outputText, filename);
};
Module._extensions[".tsx"] = Module._extensions[".ts"];

const require = createRequire(import.meta.url);
const capability = require("../src/lib/queue-production.ts");
const queue = require("../src/lib/queue.ts");
const readModel = require("../src/app/api/bnl/read-model/route.ts");
const dossierRecommendations = require("../src/app/api/bnl/dossier-recommendations/route.ts");
const workflowStore = require("../src/lib/dossier-workflow-store.ts");
const adminLive = require("../src/app/api/admin/live/route.ts");

async function resetWorkflowStore() {
  await workflowStore.saveDossierWorkflowState({ version: 1, revision: 0, candidates: [], drafts: [], recommendations: [], updatedAt: new Date(0).toISOString() });
}

async function withQueueProduction(value, fn) {
  const previous = process.env.BARCODE_QUEUE_PRODUCTION_ENABLED;
  if (value === undefined) delete process.env.BARCODE_QUEUE_PRODUCTION_ENABLED;
  else process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = value;
  try { return await fn(); }
  finally {
    if (previous === undefined) delete process.env.BARCODE_QUEUE_PRODUCTION_ENABLED;
    else process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = previous;
  }
}

test("queue production capability defaults false and only exact true enables it", () => {
  assert.equal(capability.isQueueProductionEnabled({}), false);
  assert.equal(capability.isQueueProductionEnabled({ BARCODE_QUEUE_PRODUCTION_ENABLED: "" }), false);
  assert.equal(capability.isQueueProductionEnabled({ BARCODE_QUEUE_PRODUCTION_ENABLED: "TRUE" }), false);
  assert.equal(capability.isQueueProductionEnabled({ BARCODE_QUEUE_PRODUCTION_ENABLED: "1" }), false);
  assert.equal(capability.isQueueProductionEnabled({ BARCODE_QUEUE_PRODUCTION_ENABLED: "true" }), true);
});

test("global live provider source gates queue polling while preserving manual live mode", () => {
  const providerSource = fs.readFileSync(path.join(projectRoot, "src/components/LiveStatusProvider.tsx"), "utf8");
  assert.match(providerSource, /capabilities\?\.queueProduction === true/);
  assert.match(providerSource, /setQueueSnapshot\(null\)/);
  assert.match(providerSource, /if \(!queueProduction\)/);
  assert.match(providerSource, /fetch\("\/api\/queue"/);
  assert.match(providerSource, /queueBroadcastPhase === "broadcast_active" \|\| isLive/);
  assert.doesNotMatch(providerSource, /NEXT_PUBLIC_BARCODE_QUEUE_PRODUCTION_ENABLED/);
});

test("admin live exposes non-sensitive capability without exposing env name", async () => {
  await withQueueProduction(undefined, async () => {
    const payload = await (await adminLive.GET()).json();
    assert.equal(payload.capabilities.queueProduction, false);
  });
  await withQueueProduction("true", async () => {
    const payload = await (await adminLive.GET()).json();
    assert.equal(payload.capabilities.queueProduction, true);
  });
});

test("disabled BNL read model does not read queue storage or expose queue-derived data", async () => {
  await withQueueProduction(undefined, async () => {
    await queue.startNewQueueSession({ title: "Open Test Queue" });
    await queue.setQueueOpen(true);
    const original = queue.getRadioQueueState;
    queue.getRadioQueueState = async () => { throw new Error("queue storage should not be read"); };
    try {
      const model = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
      assert.equal(model.capabilities.queueProduction, false);
      assert.equal(model.sections.queue.available, false);
      assert.equal(model.sections.queue.reason, "queue_production_disabled");
      assert.deepEqual(model.sections.artists, []);
      assert.deepEqual(model.sections.operatorLanes.temporaryRuntimeContext, []);
      assert.deepEqual(model.sections.operatorLanes.recapCandidates, []);
      assert.deepEqual(model.sections.operatorLanes.dossierSeedCandidates, []);
      const serialized = JSON.stringify(model.sections);
      assert.doesNotMatch(serialized, /Open Test Queue|nowPlaying|upNext|queue_derived_artist_surface|queue_public_snapshot|recap_candidate/);
      assert.ok(model.sections.dossiers.public.length > 0);
    } finally {
      queue.getRadioQueueState = original;
    }
  });
});

test("queue_context cannot create approved BNL or Source File evidence while disabled", async () => {
  await withQueueProduction(undefined, async () => {
    await resetWorkflowStore();
    const previousToken = process.env.BNL_DOSSIER_INGEST_TOKEN;
    process.env.BNL_DOSSIER_INGEST_TOKEN = "queue-production-test-token";
    const response = await dossierRecommendations.POST(new Request("https://example.test/api/bnl/dossier-recommendations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer queue-production-test-token" },
      body: JSON.stringify({ subjectName: "Queue Test Artist", reason: "Queue context", sourceLanes: ["queue_context"] }),
    }));
    assert.equal(response.status, 400);
    if (previousToken === undefined) delete process.env.BNL_DOSSIER_INGEST_TOKEN;
    else process.env.BNL_DOSSIER_INGEST_TOKEN = previousToken;
    const state = await workflowStore.getDossierWorkflowState();
    assert.equal(state.recommendations.length, 0);
    assert.equal(state.candidates.length, 0);
  });
});

test("enabled capability restores public-facing BNL queue behavior", async () => {
  await withQueueProduction("true", async () => {
    await queue.startNewQueueSession({ title: "Production Enabled Queue" });
    await queue.setQueueOpen(true);
    const added = await queue.addToQueue({ artist: "Enabled Artist", title: "Enabled Track", tier: "free", lane: "regular", amount: 0, createdAt: new Date().toISOString() });
    const model = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
    assert.equal(model.capabilities.queueProduction, true);
    assert.equal(model.sections.queue.available, true);
    assert.ok(JSON.stringify(model.sections.queue).includes(added.id));
    assert.ok(model.sections.artists.some((artist) => artist.name === "Enabled Artist"));
  });
});
