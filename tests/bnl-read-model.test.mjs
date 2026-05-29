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
const { databasePage } = require("../src/content.ts");
const { getDatabaseAggregateStats } = require("../src/lib/database-stats.ts");
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
  "discordUserId",
  "discordId",
  "privateSeed",
  "internalNote",
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

function publicDatabaseEntries() {
  return databasePage.entries.filter((entry) => entry.clearance === "PUBLIC");
}

function countBy(entries, key) {
  return entries.reduce((counts, entry) => {
    counts[entry[key]] = (counts[entry[key]] ?? 0) + 1;
    return counts;
  }, {});
}

function findForbiddenStringValues(value, pathName = "$", found = []) {
  if (typeof value === "string") {
    if (/contactEmail|submitterToken|stripeSessionId|priorityUpgradePaymentId|priorityUpgradeCheckoutUrl|fileUrl|fileName|fileSize|mimeType|suspiciousFlags|adminNote|discordUserId|discordId|privateSeed|r&d|internalNote/i.test(value)) {
      found.push(`${pathName}: ${value}`);
    }
    return found;
  }
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenStringValues(item, `${pathName}[${index}]`, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    findForbiddenStringValues(child, `${pathName}.${key}`, found);
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

test("BNL read model exposes dynamic full database aggregate registry metadata", async () => {
  await freshReadModelSession();

  const model = await modelJson();
  const registry = model.sections.dossiers.registry;
  const publicEntries = publicDatabaseEntries();
  const entries = databasePage.entries;

  assert.ok(registry);
  assert.equal(registry.source, "databasePage.entries");
  assert.equal(registry.sourceOfTruth, "src/content.ts:databasePage.entries");
  assert.equal(registry.statsHelper, "src/lib/database-stats.ts:getDatabaseAggregateStats");
  assert.equal(registry.countScope, "full_database_aggregates");
  assert.equal(registry.publicItemScope, "public_clearance_only");
  assert.equal(registry.totalCount, entries.length);
  assert.equal(registry.activeCount, entries.filter((entry) => entry.status === "ACTIVE").length);
  assert.equal(registry.pendingCount, entries.filter((entry) => entry.status === "PENDING").length);
  assert.equal(registry.restrictedCount, entries.filter((entry) => entry.clearance === "RESTRICTED").length);
  assert.equal(registry.publicCount, publicEntries.length);
  assert.equal(registry.categoryCount, new Set(entries.map((entry) => entry.category)).size);
  assert.deepEqual(registry.statusCounts, countBy(entries, "status"));
  assert.deepEqual(registry.clearanceCounts, countBy(entries, "clearance"));
  assert.deepEqual(registry.categoryCounts, countBy(entries, "category"));
  assert.equal(registry.publicCount, model.sections.dossiers.public.length);
  assert.equal(registry.publicCount, model.sections.dossiers.items.length);
  assert.equal(registry.restrictedDetailsExposed, false);
  assert.deepEqual(registry.scope, {
    aggregateCounts: "full_database",
    publicItems: "public_clearance_only",
    restrictedDetails: "not_exposed",
  });
  assert.ok(registry.rules.aggregateCounts.includes("count summaries"));
  assert.ok(registry.kinds);
  assert.ok(registry.lifecycleCounts);
  assert.equal(registry.autoPromotion, false);
  assert.equal(registry.queueDerivedProfiles, false);
  assert.equal(model.sections.dossiers.public.some((entry) => entry.kind === "program"), true);
  assert.equal(model.sections.dossiers.public.some((entry) => entry.kind === "interface" || entry.kind === "platform"), true);
});

test("database aggregate stats helper matches the source of truth", () => {
  const entries = databasePage.entries;
  const stats = getDatabaseAggregateStats(entries);

  assert.equal(stats.totalCount, entries.length);
  assert.equal(stats.activeCount, entries.filter((entry) => entry.status === "ACTIVE").length);
  assert.equal(stats.pendingCount, entries.filter((entry) => entry.status === "PENDING").length);
  assert.equal(stats.restrictedCount, entries.filter((entry) => entry.clearance === "RESTRICTED").length);
  assert.equal(stats.publicCount, entries.filter((entry) => entry.clearance === "PUBLIC").length);
  assert.equal(stats.categoryCount, new Set(entries.map((entry) => entry.category)).size);
  assert.deepEqual(stats.statusCounts, countBy(entries, "status"));
  assert.deepEqual(stats.clearanceCounts, countBy(entries, "clearance"));
  assert.deepEqual(stats.categoryCounts, countBy(entries, "category"));
});

test("database page and read model route use the shared aggregate stats helper without hardcoded stat totals", () => {
  const databasePageSource = fs.readFileSync(path.join(projectRoot, "src/app/database/page.tsx"), "utf8");
  const routeSource = fs.readFileSync(path.join(projectRoot, "src/app/api/bnl/read-model/route.ts"), "utf8");

  assert.match(databasePageSource, /getDatabaseAggregateStats\(databaseEntries\)/);
  assert.match(routeSource, /getDatabaseAggregateStats\(allEntries\)/);
  assert.doesNotMatch(routeSource, /totalCount:\s*\d+/);
  assert.doesNotMatch(routeSource, /publicCount:\s*\d+/);
  assert.doesNotMatch(routeSource, /restrictedCount:\s*\d+/);
  assert.doesNotMatch(routeSource, /activeCount:\s*\d+/);
  assert.doesNotMatch(routeSource, /pendingCount:\s*\d+/);
  assert.doesNotMatch(routeSource, /categoryCount:\s*\d+/);
});

test("BNL read model normalizes public dossiers with safe structured fields", async () => {
  await freshReadModelSession();

  const model = await modelJson();

  for (const dossier of model.sections.dossiers.public) {
    for (const field of ["id", "name", "kind", "lifecycle", "authority", "bnlContext", "category", "status", "role", "summary", "tags", "link", "source"]) {
      assert.ok(Object.hasOwn(dossier, field), `public dossier should expose ${field}`);
    }
    assert.ok(Array.isArray(dossier.knownBoundaries));
    assert.ok(Array.isArray(dossier.publicFacts));
    assert.ok(Array.isArray(dossier.relatedPublicIds));
    assert.equal(dossier.bnlContext.visibility, "public");
    assert.equal(dossier.bnlContext.seedDefault, "not_seed_already_public_dossier");
  }
});

test("BNL read model keeps restricted dossier details out of public dossier arrays", async () => {
  await freshReadModelSession();

  const model = await modelJson();
  const publicIds = new Set(publicDatabaseEntries().map((entry) => entry.id));
  const publicDossierJson = JSON.stringify({
    public: model.sections.dossiers.public,
    items: model.sections.dossiers.items,
  });

  assert.equal(model.sections.dossiers.registry.restrictedDetailsExposed, false);
  for (const dossier of [...model.sections.dossiers.public, ...model.sections.dossiers.items]) {
    assert.equal(publicIds.has(dossier.id), true, `${dossier.id} should be public-clearance only`);
  }

  const publicEntryJson = JSON.stringify(publicDatabaseEntries());
  for (const entry of databasePage.entries.filter((item) => item.clearance !== "PUBLIC")) {
    assert.equal(publicDossierJson.includes(entry.id), false, `${entry.id} should not be exposed`);
    if (!publicEntryJson.includes(entry.name)) {
      assert.equal(publicDossierJson.includes(entry.name), false, `${entry.name} should not be exposed`);
    }
    assert.equal(publicDossierJson.includes(entry.summary), false, `${entry.id} summary should not be exposed`);
    if (entry.link && !publicEntryJson.includes(entry.link)) {
      assert.equal(publicDossierJson.includes(entry.link), false, `${entry.id} link should not be exposed`);
    }
  }
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
  assert.deepEqual(findForbiddenStringValues(model), []);
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
  assert.equal(lanes.broadcastMemoryCandidates.length, 0);
  assert.equal(lanes.dossierSeedCandidates.length, 0);
  assert.equal(lanes.publicSafeCopyCandidates.some((item) => item.source === "public_database_dossier" && item.dossierId), true);
  assert.equal(model.sections.dossiers.public.some((dossier) => JSON.stringify(dossier).includes("Memory Queue Artist")), false);
  assert.equal(model.sections.artists.some((entry) => entry.normalizedName === "memory-queue-artist"), true);

  const artist = model.sections.artists.find((entry) => entry.normalizedName === "memory-queue-artist");
  assert.equal(artist.bnlContext.profileStatus, "not_profile");
  assert.equal(artist.bnlContext.identityStatus, "not_discord_or_account_identity");
});
