import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Keep endpoint tests isolated to the in-memory queue store instead of any configured Redis.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
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
const { databasePage } = require("../src/content.ts");
const { getDatabaseAggregateStats } = require("../src/lib/database-stats.ts");
const { getDossierPrimaryLink, getDossierPublicLinks, legacyDossierLink } = require("../src/lib/dossier-links.ts");
const { buildDossierTagRegistry, resolveDossierTagCanonical } = require("../src/lib/dossier-tags.ts");
const { isBnlReadModelDossierVisible, isPublicDatabasePageVisible } = require("../src/lib/database-visibility.ts");
const readModel = require("../src/app/api/bnl/read-model/route.ts");
const sourceFilesReadModel = require("../src/app/api/bnl/source-files/route.ts");
const workflowStore = require("../src/lib/dossier-workflow-store.ts");
const workflow = require("../src/lib/dossier-workflow.ts");

const forbiddenKeys = [
  "contactEmail",
  "submitterToken",
  "stripeSessionId",
  "priorityUpgradePaymentId",
  "priorityUpgradeCheckoutUrl",
  "priorityLegalAcceptance",
  "fileUrl",
  "fileName",
  "fileSize",
  "mimeType",
  "uploadedFileDeleteAfter",
  "uploadedFileDeletedAt",
  "uploadedFileDeletionStatus",
  "uploadedFileDeletionError",
  "suspiciousFlags",
  "adminNote",
  "discordUserId",
  "discordId",
  "privateSeed",
  "internalNote",
  "privateNotes",
  "adminOnly",
];

let sequence = 0;

async function resetDossierWorkflowStore() {
  await workflowStore.saveDossierWorkflowState({
    version: 1,
    revision: 0,
    candidates: [],
    drafts: [],
    recommendations: [],
    updatedAt: new Date(0).toISOString(),
  });
}


async function sourceFilesPost(body, token = "test-source-file-read-token") {
  return sourceFilesReadModel.POST(
    new Request("https://example.test/api/bnl/source-files", {
      method: "POST",
      headers: token
        ? {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          }
        : { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function sourceFilesGet(query, token = "test-source-file-read-token") {
  return sourceFilesReadModel.GET(
    new Request(`https://example.test/api/bnl/source-files${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

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
    priorityLegalAcceptance: { acceptedAt: new Date().toISOString(), priorityTermsVersion: "1.0", priorityDisclosureText: "private acknowledgement", source: "priority_checkout" },
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

function publicClearanceEntries() {
  return databasePage.entries.filter((entry) => entry.clearance === "PUBLIC");
}

function publicPageVisibleEntries() {
  return databasePage.entries.filter(isPublicDatabasePageVisible);
}

function bnlVisibleDossierEntries() {
  return databasePage.entries.filter(isBnlReadModelDossierVisible);
}

function countBy(entries, key) {
  return entries.reduce((counts, entry) => {
    counts[entry[key]] = (counts[entry[key]] ?? 0) + 1;
    return counts;
  }, {});
}

function findForbiddenStringValues(value, pathName = "$", found = []) {
  if (typeof value === "string") {
    if (/contactEmail|submitterToken|stripeSessionId|priorityUpgradePaymentId|priorityUpgradeCheckoutUrl|fileUrl|fileName|fileSize|mimeType|suspiciousFlags|adminNote|discordUserId|discordId|privateSeed|r&d|internalNote|privateNotes|adminOnly/i.test(value)) {
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
  assert.equal(model.schemaRevision, "1.4");
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
  assert.equal(model.sections.dossiers.public[0].bnlContext.dossierStatus, "existing_public_page_dossier");
  assert.equal(model.sections.dossiers.items.length, model.sections.dossiers.public.length);
  assert.ok(model.sections.dossiers.items.every((entry) => Object.hasOwn(entry, "ecosystemLane")));
  assert.ok(model.sections.dossiers.items.every((entry) => Object.hasOwn(entry, "identityAuthority")));
  assert.ok(model.sections.dossiers.taxonomyGuide);
});

test("BNL read model exposes dynamic full database aggregate registry metadata and visibility counts", async () => {
  await freshReadModelSession();

  const model = await modelJson();
  const registry = model.sections.dossiers.registry;
  const entries = databasePage.entries;
  const siteVisibleEntries = publicPageVisibleEntries();
  const bnlEntries = bnlVisibleDossierEntries();
  const publicClearance = publicClearanceEntries();

  assert.ok(registry);
  assert.equal(registry.source, "databasePage.entries");
  assert.equal(registry.sourceOfTruth, "src/content.ts:databasePage.entries");
  assert.equal(registry.statsHelper, "src/lib/database-stats.ts:getDatabaseAggregateStats");
  assert.equal(registry.visibilityHelper, "src/lib/database-visibility.ts");
  assert.equal(registry.countScope, "full_database_aggregates");
  assert.equal(registry.publicItemScope, "public_database_page_visible");
  assert.equal(registry.totalCount, entries.length);
  assert.equal(registry.siteVisibleCount, siteVisibleEntries.length);
  assert.equal(registry.bnlExposedDetailCount, bnlEntries.length);
  assert.equal(registry.publicCount, bnlEntries.length);
  assert.equal(registry.publicClearanceCount, publicClearance.length);
  assert.equal(registry.internalClearanceCount, entries.filter((entry) => entry.clearance === "INTERNAL").length);
  assert.equal(registry.restrictedClearanceCount, entries.filter((entry) => entry.clearance === "RESTRICTED").length);
  assert.equal(registry.aggregateOnlyCount, 0);
  assert.equal(registry.hiddenFromBnlCount, 0);
  assert.equal(registry.activeCount, entries.filter((entry) => entry.status === "ACTIVE").length);
  assert.equal(registry.pendingCount, entries.filter((entry) => entry.status === "PENDING").length);
  assert.equal(registry.restrictedCount, entries.filter((entry) => entry.clearance === "RESTRICTED").length);
  assert.equal(registry.categoryCount, new Set(entries.map((entry) => entry.category)).size);
  assert.deepEqual(registry.statusCounts, countBy(entries, "status"));
  assert.deepEqual(registry.clearanceCounts, countBy(entries, "clearance"));
  assert.deepEqual(registry.categoryCounts, countBy(entries, "category"));
  assert.equal(registry.bnlExposedDetailCount, model.sections.dossiers.public.length);
  assert.equal(registry.bnlExposedDetailCount, model.sections.dossiers.items.length);
  assert.equal(model.sections.dossiers.publicClearanceOnly.length, registry.publicClearanceCount);
  assert.equal(registry.restrictedDetailsExposed, false);
  assert.equal(registry.restrictedSummariesExposed, entries.some((entry) => entry.clearance === "RESTRICTED" && isBnlReadModelDossierVisible(entry)));
  assert.equal(registry.clearanceMeaning, "public_lore_label");
  assert.deepEqual(registry.scope, {
    aggregateCounts: "full_database",
    publicItems: "public_database_page_visible",
    public: "compatibility_alias_for_public_database_page_visible",
    publicClearanceOnly: "clearance_label_public_only",
    restrictedDetails: "summary_only_no_hidden_details",
  });
  assert.ok(registry.rules.aggregateCounts.includes("count summaries"));
  assert.ok(registry.rules.clearance.includes("classification label"));
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

test("BNL read model normalizes public-page-visible dossiers with safe structured fields", async () => {
  await freshReadModelSession();

  const model = await modelJson();
  const bnlVisibleIds = new Set(bnlVisibleDossierEntries().map((entry) => entry.id));

  assert.equal(model.sections.dossiers.items.length, model.sections.dossiers.registry.bnlExposedDetailCount);
  assert.equal(model.sections.dossiers.public.length, model.sections.dossiers.registry.bnlExposedDetailCount);

  for (const dossier of model.sections.dossiers.public) {
    for (const field of ["id", "name", "kind", "lifecycle", "authority", "bnlContext", "category", "status", "role", "summary", "tags", "link", "source", "clearance", "publicPageVisibility", "bnlReadModelExposure", "clearanceMeaning", "visibilityBoundary"]) {
      assert.ok(Object.hasOwn(dossier, field), `public dossier should expose ${field}`);
    }
    assert.equal(bnlVisibleIds.has(dossier.id), true, `${dossier.id} should be BNL-visible via public page semantics`);
    assert.ok(Array.isArray(dossier.knownBoundaries));
    assert.ok(Array.isArray(dossier.publicFacts));
    assert.ok(Array.isArray(dossier.relatedPublicIds));
    assert.equal(dossier.publicPageVisibility, "listed_publicly");
    assert.equal(dossier.bnlReadModelExposure, "public_summary");
    assert.equal(dossier.clearanceMeaning, "public_lore_label");
    assert.equal(dossier.visibilityBoundary, "same_summary_fields_as_public_database_page");
    assert.equal(dossier.bnlContext.visibility, "public_page_visible");
    assert.equal(dossier.bnlContext.clearanceMeaning, "public_lore_label");
    assert.equal(dossier.bnlContext.hiddenDetailsDefault, "do_not_infer");
    assert.equal(dossier.bnlContext.seedDefault, "not_seed_already_public_dossier");
  }
});

test("BNL read model exposes restricted/internal only as public-page-safe summaries", async () => {
  await freshReadModelSession();

  const model = await modelJson();
  const dossierJson = JSON.stringify({
    public: model.sections.dossiers.public,
    items: model.sections.dossiers.items,
  });
  const restrictedDossiers = model.sections.dossiers.items.filter((dossier) => dossier.clearance === "RESTRICTED");
  const internalDossiers = model.sections.dossiers.items.filter((dossier) => dossier.clearance === "INTERNAL");

  assert.equal(model.sections.dossiers.registry.restrictedDetailsExposed, false);
  assert.equal(model.sections.dossiers.registry.restrictedSummariesExposed, restrictedDossiers.length > 0);
  assert.ok(restrictedDossiers.length > 0, "fixture should include restricted public-page-visible summaries");
  assert.ok(internalDossiers.length > 0, "fixture should include internal public-page-visible summaries");

  for (const dossier of [...restrictedDossiers, ...internalDossiers]) {
    assert.equal(dossier.publicPageVisibility, "listed_publicly");
    assert.equal(dossier.bnlReadModelExposure, "public_summary");
    assert.equal(dossier.clearanceMeaning, "public_lore_label");
    assert.equal(dossier.visibilityBoundary, "same_summary_fields_as_public_database_page");
    assert.ok(dossier.knownBoundaries.includes("do not infer hidden restricted/internal details"));
    assert.equal(dossier.bnlContext.hiddenDetailsDefault, "do_not_infer");
  }

  for (const field of forbiddenKeys) {
    assert.equal(dossierJson.includes(field), false, `${field} should not appear in public dossier summaries`);
  }
});


test("BNL read model exposes the dossier authoring guide with current page structure", async () => {
  await freshReadModelSession();
  const model = await modelJson();
  const guide = model.sections.dossiers.authoringGuide;

  assert.ok(guide, "authoring guide should exist under sections.dossiers");
  assert.ok(Array.isArray(guide.pageStructure));
  assert.ok(guide.fieldGuide);
  assert.ok(guide.toneGuide);
  assert.ok(guide.lengthGuide);
  assert.ok(Array.isArray(guide.draftingRules));

  const pageStructure = guide.pageStructure.join("\n");
  for (const phrase of ["Hero", "DOSSIER", "Dossier Record", "Intelligence Brief", "Attached Files", "Terminal Readout"]) {
    assert.match(pageStructure, new RegExp(phrase, "i"));
  }
});

test("dossier authoring guide matches sections rendered by the dossier page", () => {
  const dossierPageSource = fs.readFileSync(path.join(projectRoot, "src/app/database/[slug]/page.tsx"), "utf8");
  const authoringGuideSource = fs.readFileSync(path.join(projectRoot, "src/lib/dossier-authoring-guide.ts"), "utf8");

  for (const phrase of ["// DOSSIER", "Dossier Record", "Intelligence Brief", "Attached Files", "DOSSIER QUERY"]) {
    assert.ok(dossierPageSource.includes(phrase), `${phrase} should be rendered by the dossier page`);
  }
  for (const phrase of ["Hero", "Dossier Record", "Intelligence Brief", "Attached Files", "Terminal Readout"]) {
    assert.ok(authoringGuideSource.includes(phrase), `${phrase} should be documented in the guide`);
  }
});




test("BNL read model exposes dossier taxonomy guide and annotated taxonomy fields", async () => {
  await freshReadModelSession();
  const model = await modelJson();
  const guide = model.sections.dossiers.taxonomyGuide;

  assert.equal(model.version, 1);
  assert.ok(guide, "taxonomy guide should exist under sections.dossiers");
  const guideText = JSON.stringify(guide).toLowerCase();
  assert.ok(guideText.includes("ai, human, hybrid, and unknown nature are tags/traits, not the organizing structure"));
  assert.ok(guideText.includes("do not classify community-owned mods as barcode-created characters"));
  assert.ok(guideText.includes("identity authority describes who controls/owns the identity"));

  const byName = Object.fromEntries(model.sections.dossiers.items.map((entry) => [entry.name, entry]));
  assert.equal(byName["6 Bit"].kind, "core_entity");
  assert.equal(byName["6 Bit"].ecosystemLane, "core_team");
  assert.equal(byName["6 Bit"].identityAuthority, "barcode_controlled");
  assert.equal(byName.Sheila.kind, "network_operator");
  assert.equal(byName.Sheila.ecosystemLane, "network_operator");
  assert.equal(byName.Sheila.identityAuthority, "barcode_controlled");
  assert.equal(byName.Cliff.kind, "network_staff");
  assert.equal(byName.Cliff.ecosystemLane, "network_staff");
  assert.equal(byName.Cliff.identityAuthority, "barcode_controlled");
  assert.equal(byName["Mr. Nice Guy Productions"].identityAuthority, "community_owned");
  assert.equal(byName["Mind Fanatic"].identityAuthority, "community_owned");
  assert.equal(byName["Studio Rats"].ecosystemLane, "radio_entity");
});

test("BNL read model exposes a dynamic dossier tag registry", async () => {
  await freshReadModelSession();
  const model = await modelJson();
  const registry = model.sections.dossiers.tagRegistry;
  const sourceTags = databasePage.entries.flatMap((entry) => entry.tags);
  const normalizedUniqueTags = [...new Set(sourceTags.map((tag) => tag.toLowerCase()))];
  const expectedRegistry = buildDossierTagRegistry(databasePage.entries);

  assert.ok(registry, "tag registry should exist under sections.dossiers");
  for (const key of ["items", "usageCounts", "categories", "aliases", "rules", "creationPolicy"]) {
    assert.ok(Object.hasOwn(registry, key), `tag registry should expose ${key}`);
  }
  assert.equal(registry.source, "databasePage.entries");
  assert.ok(registry.totalUniqueTags >= normalizedUniqueTags.length);
  assert.equal(registry.totalTagAssignments, sourceTags.length);
  assert.deepEqual(registry, expectedRegistry);

  for (const tag of normalizedUniqueTags) {
    const sourceEntries = databasePage.entries.filter((entry) => entry.tags.some((entryTag) => entryTag.toLowerCase() === tag));
    const item = registry.items.find((entry) => entry.tag.toLowerCase() === tag);
    assert.ok(item, `${tag} should appear in registry items`);
    assert.equal(item.usageCount, sourceEntries.reduce((count, entry) => count + entry.tags.filter((entryTag) => entryTag.toLowerCase() === tag).length, 0));
    assert.deepEqual(item.usedByIds, sourceEntries.map((entry) => entry.id).sort());
    assert.equal(registry.usageCounts[item.tag], item.usageCount);
  }
});

test("dossier tag registry preserves raw entry tags and leaves database UI tag behavior freeform", async () => {
  await freshReadModelSession();
  const beforeTags = databasePage.entries.map((entry) => ({ id: entry.id, tags: [...entry.tags] }));
  const model = await modelJson();
  const afterTags = databasePage.entries.map((entry) => ({ id: entry.id, tags: [...entry.tags] }));
  const databaseTableSource = fs.readFileSync(path.join(projectRoot, "src/components/DatabaseTable.tsx"), "utf8");
  const dossierPageSource = fs.readFileSync(path.join(projectRoot, "src/app/database/[slug]/page.tsx"), "utf8");

  assert.deepEqual(afterTags, beforeTags);
  for (const entry of databasePage.entries) {
    assert.ok(Array.isArray(entry.tags));
    assert.ok(entry.tags.every((tag) => typeof tag === "string"));
  }
  assert.ok(model.sections.dossiers.items.every((entry) => Array.isArray(entry.tags) && entry.tags.every((tag) => typeof tag === "string")));
  assert.match(databaseTableSource, /entry\.tags\.some\(\(t\) => t\.toLowerCase\(\)\.includes\(q\)\)/);
  assert.match(databaseTableSource, /entry\.tags\.slice\(0, 3\)\.map/);
  assert.match(dossierPageSource, /entry\.tags\.map/);
});

test("dossier tag creation policy keeps new tags proposal-only", async () => {
  await freshReadModelSession();
  const model = await modelJson();
  const { creationPolicy, rules } = model.sections.dossiers.tagRegistry;
  const policyText = JSON.stringify(creationPolicy).toLowerCase();
  const rulesText = rules.join(" ").toLowerCase();

  assert.equal(creationPolicy.defaultAction, "reuse_existing_tag_first");
  assert.equal(creationPolicy.newTagsAllowed, "proposal_only");
  assert.equal(creationPolicy.creationRequires, "operator_or_site_content_update");
  for (const phrase of ["synonyms of existing tags", "temporary queue appearances", "payment/customer data", "private identities"]) {
    assert.ok(policyText.includes(phrase), `${phrase} should be rejected by policy`);
  }
  for (const phrase of ["synonyms", "temporary queue", "payment/customer data", "private identities"]) {
    assert.ok(rulesText.includes(phrase), `${phrase} should be included in rules`);
  }
});

test("dossier tag aliases resolve to canonical tags without creating duplicate registry items", async () => {
  await freshReadModelSession();
  const model = await modelJson();
  const registry = model.sections.dossiers.tagRegistry;
  const aliasCount = Object.keys(registry.aliases).length;

  assert.ok(aliasCount > 0, "registry should expose aliases");
  assert.equal(registry.aliases.live, "broadcast");
  assert.equal(registry.aliases["network operator"], "operator");
  assert.equal(registry.aliases["core team"], "core");
  assert.equal(registry.aliases.feature, "collaborator");
  assert.equal(registry.aliases.regular, "member");
  assert.equal(registry.aliases["entity anomaly"], "anomaly");
  assert.equal(registry.aliases["unknown nature"], "unknown-nature");
  assert.equal(resolveDossierTagCanonical("live"), "broadcast");
  assert.equal(resolveDossierTagCanonical("network operator"), "operator");
  assert.equal(resolveDossierTagCanonical("core team"), "core");
  assert.equal(resolveDossierTagCanonical("feature"), "collaborator");
  assert.equal(resolveDossierTagCanonical("regular"), "member");
  assert.equal(resolveDossierTagCanonical("radio anomaly"), "anomaly");
  assert.equal(resolveDossierTagCanonical("unverified nature"), "unknown-nature");
  assert.equal(registry.items.filter((item) => item.tag === "broadcast").length, 1);
  assert.equal(registry.items.some((item) => item.tag === "live"), false);
});

test("featured dossier link helpers preserve legacy links and prefer public primary links", () => {
  const legacyEntry = { link: "https://discord.gg/4tHazmD528" };
  const legacy = legacyDossierLink(legacyEntry.link);
  assert.equal(legacy.url, "https://discord.gg/4tHazmD528");
  assert.equal(legacy.selectedBy, "legacy");
  assert.equal(legacy.publicSafe, true);

  const entry = {
    link: "https://legacy.example.test/path",
    primaryLink: { label: "Chosen Signal", url: "https://primary.example.test", type: "official", selectedBy: "subject", publicSafe: true },
    links: [
      { label: "Private Draft", url: "https://private.example.test", type: "other", selectedBy: "operator", publicSafe: false },
      { label: "Public Backup", url: "https://backup.example.test", type: "website", selectedBy: "operator", publicSafe: true },
    ],
  };

  const primary = getDossierPrimaryLink(entry);
  assert.equal(primary.label, "Chosen Signal");
  assert.equal(primary.url, "https://primary.example.test/");
  assert.equal(primary.type, "official");
  assert.equal(primary.selectedBy, "subject");

  const links = getDossierPublicLinks(entry);
  assert.deepEqual(links.map((link) => link.label), ["Chosen Signal", "Public Backup", "legacy.example.test"]);
  assert.equal(JSON.stringify(links).includes("Private Draft"), false);
});

test("normalized dossiers expose safe primaryLink/links while preserving legacy link", async () => {
  await freshReadModelSession();
  const model = await modelJson();
  const legacySource = databasePage.entries.find((entry) => entry.link);
  assert.ok(legacySource, "fixture should include at least one legacy link");

  const dossier = model.sections.dossiers.items.find((item) => item.id === legacySource.id);
  assert.ok(dossier, "legacy-linked public dossier should appear in the read model");
  assert.equal(dossier.link, legacySource.link);
  assert.ok(dossier.primaryLink);
  assert.equal(dossier.primaryLink.url, legacySource.link);
  assert.equal(dossier.primaryLink.selectedBy, "legacy");
  assert.equal(dossier.primaryLink.publicSafe, true);
  assert.ok(Array.isArray(dossier.links));
  assert.ok(dossier.links.some((link) => link.url === legacySource.link && link.publicSafe === true));
});

test("dossier page link rendering uses featured link helper and remains safe without links", () => {
  const dossierPageSource = fs.readFileSync(path.join(projectRoot, "src/app/database/[slug]/page.tsx"), "utf8");
  const noLinkEntry = databasePage.entries.find((entry) => !entry.link && !entry.primaryLink && (!entry.links || entry.links.length === 0));

  assert.ok(noLinkEntry, "fixture should include entries without links");
  assert.match(dossierPageSource, /getDossierPrimaryLink\(entry\)/);
  assert.match(dossierPageSource, /primaryLink &&/);
  assert.match(dossierPageSource, /href=\{primaryLink\.url\}/);
  assert.match(dossierPageSource, /\{primaryLink\.label\}/);
});

test("BNL dossier style profile is dynamically derived from current entries", async () => {
  await freshReadModelSession();
  const model = await modelJson();
  const styleProfile = model.sections.dossiers.styleProfile;
  const entries = databasePage.entries;
  const wordCounts = entries.map((entry) => (entry.summary.trim().match(/\S+/g) ?? []).length);
  const average = Math.round(wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length);
  const routeSource = fs.readFileSync(path.join(projectRoot, "src/app/api/bnl/read-model/route.ts"), "utf8");

  assert.equal(styleProfile.entryCount, entries.length);
  assert.equal(styleProfile.summaryWordCount.min, Math.min(...wordCounts));
  assert.equal(styleProfile.summaryWordCount.max, Math.max(...wordCounts));
  assert.equal(styleProfile.summaryWordCount.average, average);
  assert.equal(styleProfile.notesPresenceCount, entries.filter((entry) => entry.notes.trim().length > 0).length);
  const sourceTags = entries.flatMap((entry) => entry.tags);
  const expectedAverageTags = Math.round((sourceTags.length / entries.length) * 100) / 100;
  assert.equal(styleProfile.tagProfile.totalUniqueTags, model.sections.dossiers.tagRegistry.totalUniqueTags);
  assert.equal(styleProfile.tagProfile.averageTagsPerDossier, expectedAverageTags);
  assert.ok(styleProfile.tagProfile.mostUsedTags.length <= 10);
  assert.ok(styleProfile.tagProfile.singleUseTags.length <= 10);
  assert.deepEqual(styleProfile.tagProfile.singleUseTags, model.sections.dossiers.tagRegistry.items.filter((item) => item.usageCount === 1).map((item) => item.tag).sort((a, b) => a.localeCompare(b)).slice(0, 10));
  for (const section of ["Dossier Record", "Intelligence Brief", "Attached Files", "Terminal Readout"]) {
    assert.ok(styleProfile.commonSections.includes(section));
  }
  for (const field of ["id", "name", "category", "status", "clearance", "role", "origin", "summary", "tags", "notes", "link", "files"]) {
    assert.ok(styleProfile.commonFields.includes(field));
  }
  assert.doesNotMatch(routeSource, /entryCount:\s*\d+/);
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
  await queue.addToQueue({
    artist: "Private Upload Artist",
    title: "Private Upload Track",
    tiktokHandle: "@privateuploadartist",
    link: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/bnl-private-upload.mp3",
    fileUrl: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/bnl-private-upload.mp3",
    fileName: "bnl-private-upload.mp3",
    fileSize: 123456,
    mimeType: "audio/mpeg",
    uploadedFileDeleteAfter: new Date(Date.UTC(2026, 0, 2)).toISOString(),
    uploadedFileDeletedAt: null,
    uploadedFileDeletionStatus: "pending",
    uploadedFileDeletionError: null,
    sourceType: "upload",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    createdAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
  });

  const model = await modelJson();
  assert.deepEqual(findForbiddenKeys(model), []);
  assert.deepEqual(findForbiddenStringValues(model), []);
  assert.equal(JSON.stringify(model).includes("private.blob.vercel-storage.com"), false);
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
  const dossierCopyCandidates = lanes.publicSafeCopyCandidates.filter((item) => item.source === "public_database_dossier" && item.dossierId);
  assert.equal(dossierCopyCandidates.length, model.sections.dossiers.registry.bnlExposedDetailCount);
  assert.equal(dossierCopyCandidates.some((item) => model.sections.dossiers.items.find((dossier) => dossier.id === item.dossierId)?.clearance === "RESTRICTED"), true);
  assert.equal(dossierCopyCandidates.every((item) => item.reason.includes("not private memory or a seed")), true);
  assert.equal(model.sections.dossiers.public.some((dossier) => JSON.stringify(dossier).includes("Memory Queue Artist")), false);
  assert.equal(model.sections.artists.some((entry) => entry.normalizedName === "memory-queue-artist"), true);

  const artist = model.sections.artists.find((entry) => entry.normalizedName === "memory-queue-artist");
  assert.equal(artist.bnlContext.profileStatus, "not_profile");
  assert.equal(artist.bnlContext.identityStatus, "not_discord_or_account_identity");
});

function sourceFileCandidate(overrides = {}) {
  const now = "2026-05-30T00:00:00.000Z";
  const id = overrides.id ?? "candidate_signal_witch";
  const name = overrides.name ?? "Signal Witch";
  return {
    id,
    name,
    candidateType: overrides.candidateType ?? "artist",
    source: overrides.source ?? "bnl_dynamic_candidate_discovery",
    tier: overrides.tier ?? "draft_ready",
    score: overrides.score ?? 82,
    whyNow: overrides.whyNow ?? "BNL found approved source-lane momentum.",
    reason: overrides.reason ?? "Approved source lanes point to a stable subject.",
    evidenceSummary: overrides.evidenceSummary ?? "Public show context plus operator-approved evidence.",
    knownFacts: overrides.knownFacts ?? ["Appeared in public show context"],
    missingInfo: overrides.missingInfo ?? ["Confirm preferred role"],
    doNotSay: overrides.doNotSay ?? ["Do not imply private Discord identity"],
    publicSafetyNotes: overrides.publicSafetyNotes ?? ["Use only public-safe phrasing"],
    confidence: overrides.confidence ?? "high",
    duplicateRisk: overrides.duplicateRisk ?? "low",
    existingDossierMatch: overrides.existingDossierMatch ?? null,
    recommendedCategory: overrides.recommendedCategory ?? "Personnel",
    recommendedKind: overrides.recommendedKind ?? "radio_regular",
    recommendedEcosystemLane: overrides.recommendedEcosystemLane ?? "radio_regular",
    recommendedIdentityAuthority: overrides.recommendedIdentityAuthority ?? "community_owned",
    recommendedStatus: overrides.recommendedStatus ?? "PENDING",
    recommendedClearance: overrides.recommendedClearance ?? "PUBLIC",
    recommendedOrigin: overrides.recommendedOrigin ?? "UNVERIFIED",
    recommendedTags: overrides.recommendedTags ?? ["radio", "artist"],
    proposedTags: overrides.proposedTags ?? ["bnl-discovered"],
    sourceLanes: overrides.sourceLanes ?? ["rd_context", "broadcast_memory"],
    ingestSource: overrides.ingestSource ?? "bnl_dynamic_candidate_discovery",
    ingestKey: overrides.ingestKey ?? "bnl:signal-witch:read-model-test",
    createdFromRecommendationId: overrides.createdFromRecommendationId ?? "rec_signal_witch",
    sourceFileSummary: overrides.sourceFileSummary,
    sourceFileNotes: overrides.sourceFileNotes ?? [
      {
        id: "note_signal_witch",
        candidateId: id,
        type: "fact",
        text: "BNL internal source summary from approved lanes; keep context bounded.",
        source: "bnl_recommendation",
        status: "active",
        publicSafe: false,
        ingestSource: "bnl_dynamic_candidate_discovery",
        ingestKey: "bnl:signal-witch:read-model-test",
        createdAt: now,
        updatedAt: now,
      },
    ],
    identityLinks: overrides.identityLinks ?? [
      {
        id: "alias_shadowspit",
        candidateId: id,
        label: "ShadowsPit",
        normalizedLabel: workflow.normalizeDossierSubjectName("ShadowsPit"),
        type: "alias",
        visibility: "internal_only",
        status: "confirmed",
        source: "owner_confirmed",
        confidence: "confirmed",
        useForMatching: true,
        useInPublicDossier: false,
        note: "Internal routing alias only.",
        createdFromRecommendationId: "rec_alias_shadowspit",
        createdFromRecommendationSubject: "ShadowsPit",
        createdAt: now,
        updatedAt: now,
      },
    ],
    status: overrides.status ?? "needs_review",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

async function seedSourceFileReadModelState(extra = {}) {
  const now = "2026-05-30T00:00:00.000Z";
  const candidate = sourceFileCandidate(extra.candidate ?? {});
  await workflowStore.saveDossierWorkflowState({
    version: 1,
    revision: 0,
    candidates: [candidate, ...(extra.candidates ?? [])],
    drafts: extra.drafts ?? [
      {
        id: "draft_signal_witch",
        candidateId: candidate.id,
        status: "ready_for_owner_review",
        fields: { name: candidate.name },
        createdAt: now,
        updatedAt: now,
      },
    ],
    recommendations: extra.recommendations ?? [
      {
        id: "rec_signal_witch",
        type: "new_subject",
        subjectName: candidate.name,
        targetCandidateId: candidate.id,
        status: "converted_to_source_file",
        reason: "BNL dynamic candidate discovery converted this recommendation.",
        evidenceSummary: "Approved source lanes found the subject.",
        confidence: "high",
        sourceLanes: ["rd_context", "broadcast_memory"],
        ingestKey: "bnl:signal-witch:read-model-test",
        ingestSource: "bnl_dynamic_candidate_discovery",
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  });
  return candidate;
}

test("BNL source file read model requires the private read token", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";

  assert.equal((await sourceFilesGet("?subject=Signal%20Witch", "")).status, 401);
  assert.equal((await sourceFilesGet("?subject=Signal%20Witch", "wrong-token")).status, 401);
});

test("BNL source file read model resolves active Source Files by subject and returns bounded provenance and safety metadata", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const candidate = await seedSourceFileReadModelState();
  const before = await workflowStore.getDossierWorkflowState();

  const response = await sourceFilesGet("?subject=Signal%20Witch");
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.ok, true);
  assert.equal(payload.found, true);
  assert.equal(payload.mutation, false);
  assert.equal(payload.matchKind, "name");
  assert.equal(payload.workflowLane, "active_source_file");
  assert.equal(payload.sourceFileActive, true);
  assert.equal(payload.sourceFile.workflowLane, "active_source_file");
  assert.equal(payload.sourceFile.sourceFileActive, true);
  assert.equal(payload.sourceRecord.candidateId, candidate.id);
  assert.equal(payload.sourceFile.candidateId, candidate.id);
  assert.equal(payload.sourceFile.name, "Signal Witch");
  assert.equal(payload.sourceFile.normalizedName, "signal witch");
  assert.equal(payload.sourceFile.source, "bnl_dynamic_candidate_discovery");
  assert.deepEqual(payload.sourceFile.sourceLanes, ["rd_context", "broadcast_memory"]);
  assert.equal(payload.sourceFile.ingestSource, "bnl_dynamic_candidate_discovery");
  assert.equal(payload.sourceFile.ingestKey, "bnl:signal-witch:read-model-test");
  assert.equal(payload.sourceFile.createdFromRecommendationId, "rec_signal_witch");
  assert.equal(payload.sourceFile.sourceFileNotes[0].summary.includes("BNL internal source summary"), true);
  assert.equal(payload.sourceFile.sourceFileNotes[0].publicSafe, false);
  assert.equal(payload.sourceFile.identityLinks[0].label, "ShadowsPit");
  assert.equal(payload.sourceFile.identityLinks[0].status, "confirmed");
  assert.equal(payload.sourceFile.identityLinks[0].useForMatching, true);
  assert.equal(payload.sourceFile.attachedRecommendations[0].id, "rec_signal_witch");
  assert.equal(payload.sourceFile.activeDraft.status, "ready_for_owner_review");
  assert.equal(payload.sourceFile.ownerReview.status, "waiting");
  assert.equal(payload.sourceFile.visibility.visibility, "internal_bnl_source_file");
  assert.equal(payload.sourceFile.visibility.boundaryLabel, "internal working case file; not a public dossier");
  assert.equal(payload.sourceFile.visibility.publicUse, false);
  assert.equal(payload.sourceFile.visibility.publicUseReviewRequired, true);
  assert.match(payload.sourceFile.visibility.publicSummaryAllowed, /reviewed, owner-approved/);
  assert.match(payload.sourceFile.visibility.identityWarning, /not public identity proof/);
  assert.match(payload.sourceFile.visibility.publishWarning, /internal working case files, not public dossiers/);
  assert.match(payload.sourceFile.visibility.draftWarning, /curated public-facing drafts only/);
  assert.equal(payload.sourceFile.recommendedTaxonomy.kind, "radio_regular");
  assert.equal(payload.sourceFile.duplicateWarnings.duplicateRisk, "low");

  const after = await workflowStore.getDossierWorkflowState();
  assert.deepEqual(after, before);
});




test("BNL source file read model falls back to a public dossier-only target without exposing internal notes", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const before = await workflowStore.getDossierWorkflowState();

  const response = await sourceFilesGet(`?subject=${encodeURIComponent("DJ Floppydisc")}`);
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.ok, true);
  assert.equal(payload.found, true);
  assert.equal(payload.matchKind, "public_dossier_only");
  assert.equal(payload.workflowLane, "public_dossier_update_target");
  assert.equal(payload.sourceFileActive, false);
  assert.equal(payload.publicDossierMatchFound, true);
  assert.equal(payload.existingDossierUpdateLane, false);
  assert.equal(payload.candidateIntake, false);
  assert.equal(payload.publicCopyApproval, false);
  assert.equal(payload.targetDossierId, "EN-004");
  assert.equal(payload.publicDossierName, "DJ Floppydisc");
  assert.equal(payload.publicDossierSlug, "dj-floppydisc");
  assert.equal(payload.recommendedAction, "create_existing_dossier_update");
  assert.equal(payload.createExistingDossierUpdateAction.action, "create_existing_dossier_update");
  assert.equal(payload.createExistingDossierUpdateAction.publishesPublicDossier, false);
  assert.match(payload.warning, /Public dossier exists/);
  assert.equal(payload.sourceFile, null);
  assert.equal(payload.sourceRecord, null);
  assert.doesNotMatch(JSON.stringify(payload), /sourceFileNotes|identityLinks|internal notes|private aliases/i);

  const after = await workflowStore.getDossierWorkflowState();
  assert.deepEqual(after, before);
});

test("BNL source file read model public dossier fallback resolves normalized and compact public names", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";

  const normalized = await (await sourceFilesGet("?normalizedName=dj%20floppydisc")).json();
  assert.equal(normalized.matchKind, "public_dossier_only");
  assert.equal(normalized.publicDossierName, "DJ Floppydisc");
  assert.equal(normalized.publicDossierMatch.matchKind, "public_dossier_normalized_name");

  const compact = await (await sourceFilesGet("?subject=DJFloppydisc")).json();
  assert.equal(compact.matchKind, "public_dossier_only");
  assert.equal(compact.publicDossierName, "DJ Floppydisc");
  assert.equal(compact.publicDossierMatch.matchKind, "public_dossier_compact_name");
});

test("BNL source file read model creates an internal Existing Dossier Update target from public dossier fallback only", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const publicBefore = JSON.stringify(databasePage.entries.find((entry) => entry.id === "EN-004"));

  const createResponse = await sourceFilesPost({
    action: "create_existing_dossier_update",
    targetDossierId: "EN-004",
    requestedSubject: "DJ Floppydisc",
  });
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();

  assert.equal(created.ok, true);
  assert.equal(created.mutation, "internal_workflow_only");
  assert.equal(created.publishesPublicDossier, false);
  assert.equal(created.publicDossierMutated, false);
  assert.equal(created.workflowLane, "existing_dossier_update");
  assert.equal(created.sourceFileActive, false);
  assert.equal(created.candidate.status, "existing_dossier_update");
  assert.equal(created.candidate.source, "website_read_model");
  assert.equal(created.candidate.candidateType, "entity");
  assert.equal(created.candidate.existingDossierMatch.id, "EN-004");
  assert.equal(created.candidate.existingDossierMatch.name, "DJ Floppydisc");
  assert.match(created.candidate.reason, /Existing public dossier found/);
  assert.match(created.candidate.whyNow, /BNL\/operator requested/);
  assert.match(created.candidate.publicSafetyNotes.join(" "), /Review-only update material; do not publish automatically/);
  assert.match(created.candidate.doNotSay.join(" "), /Do not treat update notes as owner-approved public copy/);
  assert.equal(JSON.stringify(databasePage.entries.find((entry) => entry.id === "EN-004")), publicBefore);

  const lookup = await (await sourceFilesGet(`?subject=${encodeURIComponent("DJ Floppydisc")}`)).json();
  assert.equal(lookup.matchKind, "existing_dossier_update_name");
  assert.equal(lookup.workflowLane, "existing_dossier_update");
  assert.equal(lookup.sourceFileActive, false);
  assert.equal(lookup.sourceFile.duplicateWarnings.existingDossierMatch.id, "EN-004");

  const publicReadModelPayload = await (await readModel.GET(
    new Request("https://example.test/api/bnl/read-model"),
  )).json();
  assert.doesNotMatch(JSON.stringify(publicReadModelPayload), /internal update lane|review-only enrichment|owner-approved public copy/i);
});

test("BNL source file read model includes Source Knowledge Bridge candidates with boundary warnings", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const candidate = await seedSourceFileReadModelState({
    candidate: {
      id: "candidate_bridge_subject",
      name: "Bridge Known Subject",
      source: "bnl_source_knowledge_bridge",
      ingestSource: "bnl_source_knowledge_bridge",
      ingestKey: "bnl:bridge-known-subject",
      createdFromRecommendationId: "rec_bridge_subject",
      sourceLanes: ["broadcast_memory", "admin_manual"],
      publicSafetyNotes: [
        "Source Knowledge Bridge origin: BNL local knowledge stores.",
        "Public use requires review before any public dossier copy is written.",
        "source-blind memory trace",
      ],
      sourceFileNotes: [
        {
          id: "note_bridge_subject",
          candidateId: "candidate_bridge_subject",
          type: "general_note",
          text: "BNL Source Knowledge Bridge origin. Source Knowledge Bridge source lanes/types summary: broadcast_memory, admin_manual. Public use requires review before any public dossier copy is written. source-blind memory trace.",
          source: "bnl_recommendation",
          status: "active",
          publicSafe: false,
          ingestSource: "bnl_source_knowledge_bridge",
          ingestKey: "bnl:bridge-known-subject",
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z",
        },
      ],
    },
    recommendations: [
      {
        id: "rec_bridge_subject",
        type: "new_subject",
        subjectName: "Bridge Known Subject",
        targetCandidateId: "candidate_bridge_subject",
        status: "converted_to_source_file",
        reason: "Bridge recommendation converted into an internal source file.",
        evidenceSummary: "Bridge local knowledge stores found the subject.",
        confidence: "medium",
        sourceLanes: ["broadcast_memory", "admin_manual"],
        ingestKey: "bnl:bridge-known-subject",
        ingestSource: "bnl_source_knowledge_bridge",
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    ],
  });

  const payload = await (await sourceFilesGet("?subject=Bridge%20Known%20Subject")).json();
  assert.equal(payload.found, true);
  assert.equal(payload.sourceFile.candidateId, candidate.id);
  assert.equal(payload.sourceFile.source, "bnl_source_knowledge_bridge");
  assert.equal(payload.sourceFile.ingestSource, "bnl_source_knowledge_bridge");
  assert.deepEqual(payload.sourceFile.sourceLanes, ["broadcast_memory", "admin_manual"]);
  assert.match(payload.sourceFile.visibility.boundaryLabel, /internal working case file; not a public dossier/);
  assert.equal(payload.sourceFile.visibility.publicUseReviewRequired, true);
  assert.match(JSON.stringify(payload.sourceFile), /Source Knowledge Bridge origin|Public use requires review|source-blind memory trace/);

  const publicPayload = await modelJson();
  assert.doesNotMatch(
    JSON.stringify(publicPayload),
    /Bridge Known Subject|bnl:bridge-known-subject|Source Knowledge Bridge/,
  );
});

test("BNL source file read model resolves candidateId and normalizedName lookups", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const candidate = await seedSourceFileReadModelState();

  const byId = await (await sourceFilesGet(`?candidateId=${candidate.id}`)).json();
  assert.equal(byId.found, true);
  assert.equal(byId.matchKind, "candidate_id");

  const byNormalizedName = await (await sourceFilesGet("?normalizedName=signal%20witch")).json();
  assert.equal(byNormalizedName.found, true);
  assert.equal(byNormalizedName.matchKind, "normalized_name");
});

test("BNL source file read model resolves Existing Dossier Updates by exact subject when no active Source File exists", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const candidate = await seedSourceFileReadModelState({
    candidate: {
      id: "candidate_hellcatnz_update",
      name: "HellcatNZ",
      status: "existing_dossier_update",
      existingDossierMatch: { id: "hellcatnz", name: "HellcatNZ", confidence: "high" },
    },
    drafts: [],
  });

  const payload = await (await sourceFilesGet("?subject=HellcatNZ")).json();
  assert.equal(payload.ok, true);
  assert.equal(payload.found, true);
  assert.equal(payload.matchKind, "existing_dossier_update_name");
  assert.equal(payload.workflowLane, "existing_dossier_update");
  assert.equal(payload.sourceFileActive, false);
  assert.equal(payload.laneDescription, "Existing Dossier Update / Enrichment material; not an active Source File and not public copy.");
  assert.equal(payload.sourceFile.candidateId, candidate.id);
  assert.equal(payload.sourceFile.workflowLane, "existing_dossier_update");
  assert.equal(payload.sourceFile.sourceFileActive, false);
  assert.equal(payload.sourceRecord.workflowLane, "existing_dossier_update");
  assert.match(payload.readModelBoundary.boundaryLabel, /internal working case file; not a public dossier/);
});

test("BNL source file read model resolves Existing Dossier Updates by candidateId, alias, and normalizedName with lane labels", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const candidate = await seedSourceFileReadModelState({
    candidate: {
      id: "candidate_update_alias_lookup",
      name: "Existing Update Target",
      status: "existing_dossier_update",
      identityLinks: [
        {
          id: "alias_update_lookup",
          candidateId: "candidate_update_alias_lookup",
          label: "Update Alias",
          normalizedLabel: workflow.normalizeDossierSubjectName("Update Alias"),
          type: "alias",
          visibility: "internal_only",
          status: "confirmed",
          source: "owner_confirmed",
          confidence: "confirmed",
          useForMatching: true,
          useInPublicDossier: false,
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z",
        },
      ],
    },
    drafts: [],
  });

  const byId = await (await sourceFilesGet(`?candidateId=${candidate.id}`)).json();
  assert.equal(byId.found, true);
  assert.equal(byId.matchKind, "candidate_id");
  assert.equal(byId.sourceFile.workflowLane, "existing_dossier_update");
  assert.equal(byId.sourceFile.sourceFileActive, false);

  const byNormalized = await (await sourceFilesGet("?normalizedName=existing%20update%20target")).json();
  assert.equal(byNormalized.found, true);
  assert.equal(byNormalized.matchKind, "existing_dossier_update_normalized_name");
  assert.equal(byNormalized.sourceFile.workflowLane, "existing_dossier_update");

  const byAlias = await (await sourceFilesGet("?alias=Update%20Alias")).json();
  assert.equal(byAlias.found, true);
  assert.equal(byAlias.matchKind, "existing_dossier_update_confirmed_alias");
  assert.equal(byAlias.matchedAlias.label, "Update Alias");
  assert.equal(byAlias.sourceFile.workflowLane, "existing_dossier_update");
});

test("BNL source file read model resolves Candidate Intake exact lookup with intake lane labels", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  await seedSourceFileReadModelState({
    candidate: {
      id: "candidate_intake_lookup",
      name: "Fresh Intake Target",
      status: "candidate_intake",
    },
    drafts: [],
  });

  const payload = await (await sourceFilesGet("?subject=Fresh%20Intake%20Target")).json();
  assert.equal(payload.found, true);
  assert.equal(payload.matchKind, "candidate_intake_name");
  assert.equal(payload.workflowLane, "candidate_intake");
  assert.equal(payload.sourceFile.workflowLane, "candidate_intake");
  assert.equal(payload.sourceFile.sourceFileActive, false);
  assert.equal(payload.sourceFile.laneDescription, "Candidate Intake / newly discovered subject; not active case-file fact.");
});

test("BNL source file read model keeps active Source File priority over same-name update records", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const active = sourceFileCandidate({
    id: "candidate_shared_active",
    name: "Shared Signal",
    status: "active_source_file",
  });
  const update = sourceFileCandidate({
    id: "candidate_shared_update",
    name: "Shared Signal",
    status: "existing_dossier_update",
    sourceFileNotes: [],
    identityLinks: [],
  });
  await workflowStore.saveDossierWorkflowState({
    version: 1,
    revision: 0,
    candidates: [update, active],
    drafts: [],
    recommendations: [],
    updatedAt: "2026-05-30T00:00:00.000Z",
  });

  const payload = await (await sourceFilesGet("?subject=Shared%20Signal")).json();
  assert.equal(payload.found, true);
  assert.equal(payload.sourceFile.candidateId, active.id);
  assert.equal(payload.matchKind, "name");
  assert.equal(payload.sourceFile.workflowLane, "active_source_file");
  assert.equal(payload.possibleMatches.some((match) => match.candidateId === update.id && match.workflowLane === "existing_dossier_update"), true);

  const byUpdateId = await (await sourceFilesGet(`?candidateId=${update.id}`)).json();
  assert.equal(byUpdateId.found, true);
  assert.equal(byUpdateId.sourceFile.candidateId, update.id);
  assert.equal(byUpdateId.sourceFile.workflowLane, "existing_dossier_update");
});

test("BNL source file read model resolves confirmed aliases only", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  await seedSourceFileReadModelState();

  const payload = await (await sourceFilesGet("?alias=ShadowsPit")).json();
  assert.equal(payload.found, true);
  assert.equal(payload.matchKind, "confirmed_alias");
  assert.equal(payload.matchedAlias.label, "ShadowsPit");
  assert.equal(payload.sourceFile.name, "Signal Witch");
});

test("BNL source file read model does not confirm proposed, rejected, or retired aliases", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const now = "2026-05-30T00:00:00.000Z";

  for (const status of ["proposed", "rejected", "retired"]) {
    await resetDossierWorkflowStore();
    await seedSourceFileReadModelState({
      candidate: {
        identityLinks: [
          {
            id: `alias_${status}`,
            candidateId: "candidate_signal_witch",
            label: "Soft Alias",
            normalizedLabel: workflow.normalizeDossierSubjectName("Soft Alias"),
            type: "alias",
            visibility: "internal_only",
            status,
            source: "bnl_recommendation",
            confidence: "medium",
            useForMatching: true,
            useInPublicDossier: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    });

    const payload = await (await sourceFilesGet("?alias=Soft%20Alias")).json();
    assert.equal(payload.found, false);
    assert.equal(payload.reviewRequired, true);
    assert.equal(payload.possibleMatches.length, 1);
    assert.equal(payload.possibleMatches[0].matchKind, "unconfirmed_alias");
    assert.equal(payload.possibleMatches[0].alias.status, status);
  }
});


test("BNL source file read model does not return archived or denied workflow records", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  await seedSourceFileReadModelState({
    candidate: {
      status: "archived",
    },
    drafts: [],
  });

  const archivedPayload = await (await sourceFilesGet("?subject=Signal%20Witch")).json();
  assert.equal(archivedPayload.found, false);

  await seedSourceFileReadModelState({
    candidate: {
      status: "denied",
    },
    drafts: [],
  });

  const deniedPayload = await (await sourceFilesGet("?subject=Signal%20Witch")).json();
  assert.equal(deniedPayload.found, false);
});

test("BNL source file read model labels Existing Dossier Updates without making them active Source Files", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const candidate = await seedSourceFileReadModelState({
    candidate: {
      status: "existing_dossier_update",
      existingDossierMatch: { id: "mac-modem", name: "Mac Modem", confidence: "high" },
    },
    drafts: [],
  });

  const subjectPayload = await (await sourceFilesGet("?subject=Signal%20Witch")).json();
  assert.equal(subjectPayload.found, true);
  assert.equal(subjectPayload.matchKind, "existing_dossier_update_name");
  assert.equal(subjectPayload.sourceFile.workflowLane, "existing_dossier_update");
  assert.equal(subjectPayload.sourceFile.sourceFileActive, false);

  const candidatePayload = await (await sourceFilesGet(`?candidateId=${candidate.id}`)).json();
  assert.equal(candidatePayload.found, true);
  assert.equal(candidatePayload.sourceFile.workflowLane, "existing_dossier_update");
  assert.equal(candidatePayload.sourceFile.sourceFileActive, false);
  assert.match(candidatePayload.sourceFile.laneDescription, /Existing Dossier Update \/ Enrichment material/);
  assert.equal(candidatePayload.sourceFile.duplicateWarnings.existingDossierMatch.name, "Mac Modem");
});

test("BNL source file read model returns found=false without mutation for no-match", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  await seedSourceFileReadModelState();
  const before = await workflowStore.getDossierWorkflowState();

  const response = await sourceFilesGet("?subject=Missing%20Subject");
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.found, false);
  assert.equal(payload.reviewRequired, false);
  assert.deepEqual(payload.possibleMatches, []);
  assert.match(payload.reason, /No BNL Source File match/);

  const after = await workflowStore.getDossierWorkflowState();
  assert.deepEqual(after, before);
});

test("BNL source file read model keeps public endpoint separate and does not expose private keys", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  await seedSourceFileReadModelState({
    candidate: {
      sourceFileSummary: {
        summaryText: "Operator-only Signal Witch summary must stay private.",
        knownContext: ["Operator-only known context"],
        openQuestions: ["Operator-only open question"],
        nextAction: "Operator-only next action",
        updatedAt: "2026-05-30T01:00:00.000Z",
        updatedBy: "admin",
      },
    },
  });

  const unauthorized = await sourceFilesGet("?subject=Signal%20Witch", "");
  assert.equal(unauthorized.status, 401);
  assert.doesNotMatch(JSON.stringify(await unauthorized.json()), /Signal Witch|sourceFileNotes|identityLinks/);

  const publicPayload = await modelJson();
  assert.doesNotMatch(
    JSON.stringify(publicPayload),
    /Signal Witch|sourceFileNotes|identityLinks|sourceFileSummary|Operator-only|bnl:signal-witch:read-model-test|candidate_intake|existing_dossier_update/,
  );

  const internalPayload = await (await sourceFilesGet("?subject=Signal%20Witch")).json();
  assert.equal(internalPayload.sourceFile.sourceFileSummary, undefined);
  assert.doesNotMatch(JSON.stringify(internalPayload), /Operator-only|sourceFileSummary/);
  assert.deepEqual(findForbiddenKeys(internalPayload), []);
  assert.doesNotMatch(JSON.stringify(internalPayload), /test-source-file-read-token|stripeSessionId|customerId|accountId|paymentIntent|submitterToken|fileUrl|contactEmail/);
});

test("BNL source file read model includes Source File Enrichment notes only in protected source files", async () => {
  await resetDossierWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const candidate = await seedSourceFileReadModelState({
    candidate: {
      id: "candidate_enrichment_subject",
      name: "Enrichment Read Subject",
      status: "active_source_file",
      sourceFileNotes: [
        {
          id: "note_enrichment_subject",
          candidateId: "candidate_enrichment_subject",
          type: "general_note",
          text: "BNL Source File Enrichment origin. Review-only internal case-file material; not public copy. Owner/admin review required before public use.",
          source: "bnl_recommendation",
          status: "active",
          publicSafe: false,
          ingestSource: "bnl_source_file_enrichment",
          ingestKey: "bnl:enrichment-read-subject",
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z",
        },
      ],
    },
    recommendations: [
      {
        id: "rec_enrichment_subject",
        type: "modify_existing_dossier",
        subjectName: "Enrichment Read Subject",
        targetCandidateId: "candidate_enrichment_subject",
        status: "attached_to_source_file",
        reason: "BNL generated review-only source-file enrichment.",
        evidenceSummary: JSON.stringify({ observedFacts: ["Internal enrichment fact"], warnings: ["Do not publish raw note"] }),
        confidence: "medium",
        sourceLanes: ["admin_manual", "rd_context"],
        sourceTypes: ["source_file_note", "warning"],
        ingestKey: "bnl:enrichment-read-subject",
        ingestSource: "bnl_source_file_enrichment",
        publicSafetyNotes: ["Review-only internal case-file material."],
        missingInfo: ["Confirm owner-approved public copy."],
        doNotSay: ["Do not publish raw note."],
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    ],
    drafts: [],
  });

  const payload = await (await sourceFilesGet("?subject=Enrichment%20Read%20Subject")).json();
  assert.equal(payload.found, true);
  assert.equal(payload.sourceFile.candidateId, candidate.id);
  assert.equal(payload.sourceFile.sourceFileNotes[0].ingestSource, "bnl_source_file_enrichment");
  assert.equal(payload.sourceFile.sourceFileNotes[0].publicSafe, false);
  assert.equal(payload.sourceFile.attachedRecommendations[0].ingestSource, "bnl_source_file_enrichment");
  assert.deepEqual(payload.sourceFile.attachedRecommendations[0].sourceTypes, ["source_file_note", "warning"]);
  assert.match(payload.sourceFile.attachedRecommendations[0].evidenceSummary, /observedFacts/);
  assert.equal(payload.sourceFile.visibility.publicUse, false);
  assert.equal(payload.sourceFile.visibility.publicUseReviewRequired, true);

  const publicPayload = await modelJson();
  assert.doesNotMatch(
    JSON.stringify(publicPayload),
    /Enrichment Read Subject|bnl_source_file_enrichment|Internal enrichment fact|source_file_note/,
  );
});
