import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Keep endpoint tests isolated to the in-memory queue store instead of any configured Redis.
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
const queue = require("../src/lib/queue.ts");
const readModel = require("../src/app/api/bnl/read-model/route.ts");

const forbiddenKeys = [
  "contactEmail",
  "submitterToken",
  "stripeSessionId",
  "priorityUpgradePaymentId",
  "priorityUpgradeCheckoutUrl",
  "fileUrl",
  "fileName",
  "fileSize",
  "mimeType",
  "suspiciousFlags",
  "adminNote",
];

let sequence = 0;

async function freshReadModelSession() {
  sequence += 1;
  await queue.setQueueOpen(false);
  const state = await queue.startNewQueueSession({ title: `BNL Read Model ${Date.now()} ${sequence}` });
  await queue.setQueueOpen(true);
  await queue.updateRadioTrack("", "startShow");
  return state.session.sessionId;
}

async function addTrack(label, options = {}) {
  sequence += 1;
  const artist = options.artist ?? `${label} Artist`;
  return queue.addToQueue({
    artist,
    title: `${label} Track`,
    tiktokHandle: `@${artist.toLowerCase().replace(/[^a-z0-9]/g, "")}${sequence}`,
    link: `https://example.com/${label.toLowerCase().replace(/[^a-z0-9]/g, "")}-${sequence}`,
    tier: "free",
    lane: options.lane ?? "regular",
    amount: 0,
    stripeSessionId: options.stripeSessionId ?? null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString(),
    contactEmail: `${label.toLowerCase().replace(/[^a-z0-9]/g, "")}${sequence}@example.com`,
    submitterToken: `token-${label}-${sequence}`,
    fileUrl: "https://private.example.test/upload.mp3",
    fileName: "upload.mp3",
    fileSize: 123456,
    mimeType: "audio/mpeg",
    suspiciousFlags: ["test-only"],
    priorityUpgradePaymentId: "pi_private_test",
    priorityUpgradeCheckoutUrl: "https://checkout.example.test/private",
  });
}

async function modelJson() {
  const response = await readModel.GET();
  return response.json();
}

function findForbiddenKeys(value, pathName = "$", found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${pathName}[${index}]`, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.includes(key)) found.push(`${pathName}.${key}`);
    findForbiddenKeys(child, `${pathName}.${key}`, found);
  }
  return found;
}

function allTrackIds(model) {
  const queueSection = model.sections.queue;
  return [
    queueSection.nowPlaying?.id,
    queueSection.upNext?.id,
    ...queueSection.queue.map((track) => track.id),
    ...queueSection.completed.map((track) => track.id),
  ].filter(Boolean);
}

test("BNL read model preserves v1 compatibility and adds semantic sections", async () => {
  await freshReadModelSession();
  const queued = await addTrack("Queued", { artist: "Queued Artist" });
  const completed = await addTrack("Completed", { artist: "完成 Artist" });
  await queue.updateRadioTrack(completed.id, "finish");

  const model = await modelJson();

  assert.equal(model.ok, true);
  assert.equal(model.version, 1);
  assert.equal(model.schemaRevision, "1.1");
  assert.equal(model.publicOnly, true);
  assert.ok(model.sections.sourceContext);
  assert.ok(model.sections.queue);
  assert.ok(model.sections.artists);
  assert.ok(model.sections.dossiers);
  assert.ok(model.sections.rules);
  assert.ok(model.sections.operatorLanes);

  for (const lane of ["temporaryRuntimeContext", "recapCandidates", "broadcastMemoryCandidates", "dossierSeedCandidates", "publicSafeCopyCandidates", "doNotStore"]) {
    assert.ok(Array.isArray(model.sections.operatorLanes[lane]), `${lane} should be an array`);
  }

  const queuedModelTrack = [model.sections.queue.nowPlaying, model.sections.queue.upNext, ...model.sections.queue.queue].filter(Boolean).find((track) => track.id === queued.id);
  assert.ok(queuedModelTrack, "queued/runtime track should be exposed on an active public queue surface");
  assert.equal(queuedModelTrack.bnlContext.contextRole, "runtime");
  assert.match(queuedModelTrack.bnlContext.status, /^(queued|upNext|nowPlaying)$/);
  assert.equal(queuedModelTrack.bnlContext.memoryDefault, "do_not_store");
  assert.equal(queuedModelTrack.bnlContext.profileDefault, "not_profile");
  assert.equal(queuedModelTrack.bnlContext.identityDefault, "not_discord_identity");
  assert.equal(queuedModelTrack.bnlContext.recapDefault, "not_until_completed");

  const completedModelTrack = model.sections.queue.completed.find((track) => track.id === completed.id);
  assert.equal(completedModelTrack.bnlContext.contextRole, "recap_candidate");
  assert.equal(completedModelTrack.bnlContext.status, "completed");
  assert.equal(completedModelTrack.bnlContext.memoryDefault, "recap_candidate_only");

  const artist = model.sections.artists.find((entry) => entry.normalizedName === "queued-artist");
  assert.equal(artist.bnlContext.profileStatus, "not_profile");
  assert.equal(artist.bnlContext.identityStatus, "not_discord_or_account_identity");
  assert.equal(artist.trackStatusCounts.queued + artist.trackStatusCounts.upNext + artist.trackStatusCounts.nowPlaying, 1);

  assert.ok(model.sections.dossiers.public.length > 0, "expected public database dossiers in fixture content");
  assert.equal(model.sections.dossiers.public[0].bnlContext.dossierStatus, "existing_public_dossier");
  assert.equal(model.sections.dossiers.items.length, model.sections.dossiers.public.length);
});

test("BNL read model labels now playing and up next as runtime context", async () => {
  await freshReadModelSession();
  const nowPlaying = await addTrack("Now Playing", { artist: "Now Artist" });
  const upNext = await addTrack("Up Next", { artist: "Next Artist" });
  await queue.updateRadioTrack(nowPlaying.id, "load");
  await queue.updateRadioTrack("", "pullNext");

  const model = await modelJson();

  assert.equal(model.sections.queue.nowPlaying.id, nowPlaying.id);
  assert.equal(model.sections.queue.nowPlaying.bnlContext.status, "nowPlaying");
  assert.equal(model.sections.queue.nowPlaying.bnlContext.contextRole, "runtime");
  assert.equal(model.sections.queue.upNext.id, upNext.id);
  assert.equal(model.sections.queue.upNext.bnlContext.status, "upNext");
  assert.equal(model.sections.queue.upNext.bnlContext.contextRole, "runtime");
});

test("BNL read model excludes simulation/test tracks from all public semantic surfaces", async () => {
  await freshReadModelSession();
  const real = await addTrack("Real", { artist: "Real Artist" });
  await queue.updateRadioTrack("", "addSimulationFreeTrack");
  await queue.updateRadioTrack("", "addSimulationCheckoutPending");

  const model = await modelJson();
  const json = JSON.stringify(model);

  assert.ok(allTrackIds(model).includes(real.id));
  assert.equal(json.includes("SIM "), false);
  assert.equal(json.includes("[QUEUE SIMULATION TRACK]"), false);
  assert.equal(json.includes("sim-track"), false);
  assert.equal(json.includes("Glass Circuit"), false);
});

test("BNL read model excludes private queue/payment/upload keys", async () => {
  await freshReadModelSession();
  await addTrack("Private Fields", { artist: "Private Artist", stripeSessionId: "cs_private_test" });

  const model = await modelJson();
  assert.deepEqual(findForbiddenKeys(model), []);
});

test("BNL read model keeps normal queue items out of broadcast memory candidates", async () => {
  await freshReadModelSession();
  const queued = await addTrack("Memory Queued", { artist: "Memory Queue Artist" });
  const completed = await addTrack("Memory Completed", { artist: "Memory Completed Artist" });
  await queue.updateRadioTrack(completed.id, "finish");

  const model = await modelJson();
  const lanes = model.sections.operatorLanes;

  assert.ok(lanes.temporaryRuntimeContext.some((item) => item.trackId === queued.id));
  assert.ok(lanes.recapCandidates.some((item) => item.trackId === completed.id));
  assert.equal(lanes.broadcastMemoryCandidates.some((item) => item.trackId === queued.id), false);
  assert.equal(lanes.broadcastMemoryCandidates.some((item) => item.trackId === completed.id), false);

  const artist = model.sections.artists.find((entry) => entry.normalizedName === "memory-queue-artist");
  assert.equal(artist.bnlContext.profileStatus, "not_profile");
  assert.equal(artist.bnlContext.identityStatus, "not_discord_or_account_identity");
});
