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
const submissionRouting = require("../src/lib/radio-submission-routing.ts");
const queue = require("../src/lib/queue.ts");
const readModel = require("../src/app/api/bnl/read-model/route.ts");
const dossierRecommendations = require("../src/app/api/bnl/dossier-recommendations/route.ts");
const workflowStore = require("../src/lib/dossier-workflow-store.ts");
const adminLive = require("../src/app/api/admin/live/route.ts");
const { derivePublicShowState } = require("../src/lib/live-status-public.ts");

async function resetWorkflowStore() {
  await workflowStore.saveDossierWorkflowState({ version: 1, revision: 0, candidates: [], drafts: [], recommendations: [], updatedAt: new Date(0).toISOString() });
}

async function postDossierRecommendation(body) {
  const previousToken = process.env.BNL_DOSSIER_INGEST_TOKEN;
  process.env.BNL_DOSSIER_INGEST_TOKEN = "queue-production-test-token";
  try {
    return await dossierRecommendations.POST(new Request("https://example.test/api/bnl/dossier-recommendations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer queue-production-test-token" },
      body: JSON.stringify(body),
    }));
  } finally {
    if (previousToken === undefined) delete process.env.BNL_DOSSIER_INGEST_TOKEN;
    else process.env.BNL_DOSSIER_INGEST_TOKEN = previousToken;
  }
}

async function assertNoWorkflowRecords() {
  const state = await workflowStore.getDossierWorkflowState();
  assert.equal(state.recommendations.length, 0);
  assert.equal(state.candidates.length, 0);
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

async function startFreshQueueSession(options) {
  const current = await queue.getRadioQueueState();
  if (current.revision !== 0 && current.session.status !== "archived") {
    await queue.archiveCurrentQueueSession();
  }
  return queue.startNewQueueSession(options);
}

test("queue production capability defaults false and only exact true enables it", () => {
  assert.equal(capability.isQueueProductionEnabled({}), false);
  assert.equal(capability.isQueueProductionEnabled({ BARCODE_QUEUE_PRODUCTION_ENABLED: "" }), false);
  assert.equal(capability.isQueueProductionEnabled({ BARCODE_QUEUE_PRODUCTION_ENABLED: "TRUE" }), false);
  assert.equal(capability.isQueueProductionEnabled({ BARCODE_QUEUE_PRODUCTION_ENABLED: "1" }), false);
  assert.equal(capability.isQueueProductionEnabled({ BARCODE_QUEUE_PRODUCTION_ENABLED: "true" }), true);
});

test("one operational access decision admits only production, admin, or a valid rehearsal capability", () => {
  const disabled = {};
  assert.deepEqual(capability.resolveQueueOperationalAccess({}, disabled), {
    authorized: false,
    authority: null,
    productionEnabled: false,
    isAdmin: false,
    hasRehearsalAccess: false,
  });
  assert.equal(capability.resolveQueueOperationalAccess({ isAdmin: true }, disabled).authority, "admin");
  assert.equal(capability.resolveQueueOperationalAccess({ hasRehearsalAccess: true }, disabled).authority, "rehearsal");
  assert.equal(capability.resolveQueueOperationalAccess({}, { BARCODE_QUEUE_PRODUCTION_ENABLED: "true" }).authority, "production");
  assert.equal(capability.resolveQueueOperationalAccess({}, { BARCODE_QUEUE_PRODUCTION_ENABLED: "TRUE" }).authorized, false);
});

test("Radio submission routing falls back to Auxchord and only exact true cuts over to the native queue", () => {
  for (const value of [undefined, "", "TRUE", "1", "yes"]) {
    const env = value === undefined ? {} : { BARCODE_QUEUE_PRODUCTION_ENABLED: value };
    const routing = submissionRouting.getRadioSubmissionRouting(env);
    assert.equal(routing.mode, "auxchord");
    assert.equal(routing.href, "https://www.auxchord.app/91");
    assert.equal(routing.external, true);
    assert.match(routing.heroDescription, /Auxchord/);
    assert.match(routing.readModelSummary, /through Auxchord/);
  }

  const routing = submissionRouting.getRadioSubmissionRouting({
    BARCODE_QUEUE_PRODUCTION_ENABLED: "true",
  });
  assert.equal(routing.mode, "native_queue");
  assert.equal(routing.href, "/queue");
  assert.equal(routing.external, false);
  assert.equal(routing.resourceLabel, "Radio Queue");
  assert.match(routing.heroDescription, /native BARCODE Radio queue/);
  assert.match(routing.acceptedSourcesRule, /SoundCloud.*Spotify.*YouTube.*TikTok.*MP3\/WAV/);
  assert.doesNotMatch(routing.acceptedSourcesRule, /Apple Music/);
  assert.doesNotMatch(JSON.stringify(routing), /Auxchord/);
});

test("public show-state helper ignores queue snapshots unless production capability is enabled", () => {
  const queueSnapshot = {
    session: {
      sessionId: "test-session",
      status: "active",
      broadcastPhase: "broadcast_active",
    },
    status: { isOpen: true },
  };

  assert.deepEqual(derivePublicShowState({ queueProductionEnabled: false, isLive: false, queueSnapshot }), {
    hasActiveQueueSession: false,
    queueSessionId: null,
    queueHref: null,
    queueSubmissionsOpen: false,
    queueBroadcastPhase: null,
    siteShowMode: "offline",
  });

  assert.equal(
    derivePublicShowState({ queueProductionEnabled: false, isLive: true, queueSnapshot }).siteShowMode,
    "broadcast_live",
  );

  assert.deepEqual(derivePublicShowState({ queueProductionEnabled: true, isLive: false, queueSnapshot }), {
    hasActiveQueueSession: true,
    queueSessionId: "test-session",
    queueHref: "/queue/test-session",
    queueSubmissionsOpen: true,
    queueBroadcastPhase: "broadcast_active",
    siteShowMode: "broadcast_live",
  });
});

test("global live provider source fails closed when capability authority is missing", () => {
  const providerSource = fs.readFileSync(path.join(projectRoot, "src/components/LiveStatusProvider.tsx"), "utf8");
  assert.match(providerSource, /capabilities\?\.queueProduction === true/);
  assert.match(providerSource, /setQueueSnapshot\(null\)/);
  assert.match(providerSource, /if \(!queueProduction\)/);
  assert.match(providerSource, /fetch\("\/api\/queue"/);
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
    await startFreshQueueSession({ title: "Open Test Queue" });
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
      const radioContext = model.sections.sourceContext.find((item) => item.id === "barcode_radio");
      assert.match(radioContext.summary, /through Auxchord/);
      assert.doesNotMatch(radioContext.summary, /native BARCODE Radio queue/);
      const serialized = JSON.stringify(model.sections);
      assert.doesNotMatch(serialized, /Open Test Queue|nowPlaying|upNext|queue_derived_artist_surface|queue_public_snapshot|recap_candidate/);
      assert.ok(model.sections.dossiers.public.length > 0);
    } finally {
      queue.getRadioQueueState = original;
    }
  });
});

test("queue-derived dossier recommendation provenance is rejected while disabled", async () => {
  await withQueueProduction(undefined, async () => {
    const rejectedPayloads = [
      { subjectName: "Queue Context Artist", reason: "Queue context", sourceLanes: ["queue_context"] },
      { subjectName: "Queue Frequency Artist", reason: "Population queue frequency", type: "population_recommendation", ingestSource: "bnl_population_recommender", sourceLanes: ["queue_frequency"] },
      { subjectName: "Queue Source Type Artist", reason: "Queue public snapshot", sourceTypes: ["queue_public_snapshot"] },
      { subjectName: "Queue Submission Artist", reason: "Queue submission found", queueSubmissionStatus: "confirmed_submission" },
    ];

    for (const payload of rejectedPayloads) {
      await resetWorkflowStore();
      const response = await postDossierRecommendation(payload);
      assert.equal(response.status, 400, `${payload.subjectName} should be rejected`);
      await assertNoWorkflowRecords();
    }
  });
});

test("not_connected queue submission boundary remains compatible while disabled", async () => {
  await withQueueProduction(undefined, async () => {
    await resetWorkflowStore();
    const response = await postDossierRecommendation({
      subjectName: "Non Queue Boundary Artist",
      reason: "No queue submission is connected to this Source File packet.",
      sourceLanes: ["website_dossier"],
      queueSubmissionStatus: "not_connected",
    });
    assert.equal(response.status, 200);
    const state = await workflowStore.getDossierWorkflowState();
    assert.equal(state.recommendations.length, 1);
    assert.equal(state.recommendations[0].queueSubmissionStatus, "not_connected");
  });
});

test("enabled capability plus public BNL access restores public-facing queue behavior", async () => {
  await withQueueProduction("true", async () => {
    await startFreshQueueSession({
      title: "Production Enabled Queue",
      purpose: "live_broadcast",
      bnlPublicationStatus: "public_copy_approved",
    });
    await queue.setQueueOpen(true);
    const added = await queue.addToQueue({ artist: "Enabled Artist", title: "Enabled Track", tier: "free", lane: "regular", amount: 0, createdAt: new Date().toISOString() });
    const model = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
    assert.equal(model.capabilities.queueProduction, true);
    assert.equal(model.sections.queue.available, true);
    assert.ok(JSON.stringify(model.sections.queue).includes(added.id));
    assert.ok(model.sections.artists.some((artist) => artist.name === "Enabled Artist"));
    const radioContext = model.sections.sourceContext.find((item) => item.id === "barcode_radio");
    assert.match(radioContext.summary, /native BARCODE Radio queue/);
    assert.doesNotMatch(radioContext.summary, /Auxchord/);
  });
});

test("enabled native queue capability does not override session-level BNL quarantine", async () => {
  await withQueueProduction("true", async () => {
    await startFreshQueueSession({ title: "Production Rehearsal Queue" });
    await queue.setQueueOpen(true);
    const added = await queue.addToQueue({ artist: "Rehearsal Artist", title: "Rehearsal Track", tier: "free", lane: "regular", amount: 0, createdAt: new Date().toISOString() });
    const publicSnapshot = await queue.getPublicQueueSnapshot();
    assert.ok(JSON.stringify(publicSnapshot).includes(added.id));

    const model = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
    assert.equal(model.capabilities.queueProduction, true);
    assert.equal(model.sections.queue.available, false);
    assert.equal(model.sections.queue.reason, "queue_data_unavailable");
    assert.equal(JSON.stringify(model.sections.queue).includes(added.id), false);
    assert.equal(model.sections.artists.some((artist) => artist.name === "Rehearsal Artist"), false);
    assert.equal(model.sections.operatorLanes.temporaryRuntimeContext.some((item) => item.source === "queue_public_snapshot"), false);
    assert.equal(model.sections.operatorLanes.recapCandidates.some((item) => item.source === "queue_public_snapshot"), false);
    assert.equal(model.sections.operatorLanes.publicSafeCopyCandidates.some((item) => item.source === "queue_public_snapshot"), false);
  });
});
