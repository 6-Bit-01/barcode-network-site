import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
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
  const sourceText = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(sourceText, {
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

Module._extensions[".tsx"] = Module._extensions[".ts"];

const require = createRequire(import.meta.url);
const auth = require("../src/lib/auth.ts");
const route = require("../src/app/api/admin/dossiers/route.ts");
const bnlIngestRoute = require("../src/app/api/bnl/dossier-recommendations/route.ts");
const workflow = require("../src/lib/dossier-workflow.ts");
const store = require("../src/lib/dossier-workflow-store.ts");
const { databasePage } = require("../src/content.ts");
const readModel = require("../src/app/api/bnl/read-model/route.ts");
const sourceFilesReadModel = require("../src/app/api/bnl/source-files/route.ts");
const noteDisplay = require("../src/lib/dossier-note-display.ts");
const sourceFileSummary = require("../src/lib/dossier-source-file-summary.ts");

function source(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function normalizedSource(relativePath) {
  return source(relativePath).replace(/\s+/g, " ");
}

function assertIncludesCopy(text, expected) {
  assert.ok(
    text.includes(expected),
    `Expected normalized source to include: ${expected}`,
  );
}

async function adminCookie() {
  const token = await auth.createAdminToken();
  return `${auth.COOKIE_NAME}=${token}`;
}

async function resetWorkflowStore() {
  await store.saveDossierWorkflowState({
    version: 1,
    revision: 0,
    candidates: [],
    drafts: [],
    recommendations: [],
    updatedAt: new Date(0).toISOString(),
  });
}

async function authedGet() {
  return route.GET(
    new Request("https://example.test/api/admin/dossiers", {
      headers: { cookie: await adminCookie() },
    }),
  );
}

async function authedPost(body) {
  return route.POST(
    new Request("https://example.test/api/admin/dossiers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: await adminCookie(),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function sourceFilesGet(query, token = "test-source-file-read-token") {
  return sourceFilesReadModel.GET(
    new Request(`https://example.test/api/bnl/source-files${query}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

async function bnlIngestPost(body, token = "test-bnl-ingest-token") {
  return bnlIngestRoute.POST(
    new Request("https://example.test/api/bnl/dossier-recommendations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

const manualCandidateInput = {
  name: "Manual Candidate Alpha",
  candidateType: "artist",
  reason: "Operator wants a controlled dossier review record.",
  whyNow: "The artist has enough public context to inspect manually.",
  evidenceSummary: "Operator-entered public-safe evidence summary.",
  knownFacts: [
    "Appeared in public show context",
    "Has an operator-approved link",
  ],
  missingInfo: ["Confirm preferred public role"],
  doNotSay: ["Do not imply private Discord identity"],
  publicSafetyNotes: ["Use public facts only"],
  recommendedCategory: "Personnel",
  recommendedKind: "moderator",
  recommendedEcosystemLane: "community_mod",
  recommendedIdentityAuthority: "community_owned",
  recommendedStatus: "PENDING",
  recommendedClearance: "PUBLIC",
  recommendedOrigin: "UNVERIFIED",
  recommendedTags: ["artist", "radio"],
  proposedTags: ["manual-review"],
  primaryLink: {
    label: "Official link",
    url: "https://example.test/manual-alpha",
    type: "website",
    selectedBy: "operator",
    publicSafe: true,
  },
};

test("taxonomy source types, entry annotations, and tag aliases are present", () => {
  const contentSource = source("src/content.ts");
  const tagSource = source("src/lib/dossier-tags.ts");
  assert.match(contentSource, /export type DossierIdentityAuthority/);
  assert.match(contentSource, /export type DossierEcosystemLane/);
  assert.match(contentSource, /ecosystemLane\?: DossierEcosystemLane/);
  assert.match(contentSource, /identityAuthority\?: DossierIdentityAuthority/);
  for (const kind of [
    "core_entity",
    "network_operator",
    "network_staff",
    "moderator",
    "collaborator",
    "community_member",
    "radio_regular",
    "radio_entity",
  ]) {
    assert.match(contentSource, new RegExp(`\"${kind}\"`));
  }

  const byName = Object.fromEntries(
    databasePage.entries.map((entry) => [entry.name, entry]),
  );
  assert.equal(byName["6 Bit"].ecosystemLane, "core_team");
  assert.equal(byName["6 Bit"].identityAuthority, "barcode_controlled");
  for (const name of ["Mac Modem", "DJ Floppydisc", "Cache Back"]) {
    assert.equal(byName[name].ecosystemLane, "core_team");
  }
  assert.equal(byName.Sheila.kind, "network_operator");
  assert.equal(byName.Sheila.ecosystemLane, "network_operator");
  assert.equal(byName.Sheila.identityAuthority, "barcode_controlled");
  assert.equal(byName.Cliff.kind, "network_staff");
  assert.equal(byName.Cliff.ecosystemLane, "network_staff");
  assert.equal(byName.Cliff.identityAuthority, "barcode_controlled");
  assert.equal(
    byName["Mr. Nice Guy Productions"].identityAuthority,
    "community_owned",
  );
  assert.equal(byName["Mind Fanatic"].identityAuthority, "community_owned");
  assert.equal(byName["Studio Rats"].ecosystemLane, "radio_entity");

  for (const tag of [
    "core",
    "operator",
    "collaborator",
    "member",
    "community",
    "anomaly",
    "human",
    "hybrid",
    "unknown-nature",
    "ai",
    "artist",
    "mod",
    "broadcast",
    "radio",
    "executive",
    "manager",
    "stagehand",
    "handler",
    "engineer",
    "tech",
    "systems",
    "automation",
    "producer",
    "virus",
    "writer",
    "architecture",
    "sponsor",
  ]) {
    assert.match(
      tagSource,
      new RegExp(`${tag.replace("-", "-")}:|\"${tag}\":`),
    );
  }
  for (const alias of [
    "network operator",
    "approved operator",
    "core team",
    "barcode core",
    "feature",
    "featured artist",
    "regular",
    "community member",
    "entity anomaly",
    "radio anomaly",
    "unknown nature",
    "unverified nature",
  ]) {
    assert.match(tagSource, new RegExp(alias));
  }
});

test("admin panel includes Dossier Control Center link", () => {
  const adminPage = source("src/app/admin/page.tsx");
  assert.match(adminPage, /Dossier Control Center/);
  assert.match(
    adminPage,
    /Review dossier candidates, manage drafts, and prepare approved website dossier entries\./,
  );
  assert.match(adminPage, /href="\/admin\/dossiers"/);
});

test("admin dossier dashboard is a Control Center overview instead of an all-in-one workbench", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Dossier Control Center",
    "Overview of BNL Source Files as internal working case files, BNL recommendations as evidence inputs, proposed dossiers as curated public-facing drafts, and owner review status. Open a source file to work on a subject.",
    "Total BNL Source Files",
    "Recommendations waiting",
    "Owner Review waiting",
    "BNL Dossier Workbench",
    "BNL drafting comes next.",
    "BNL will use reviewed, public-safe material from each BNL Source File to generate or revise proposed dossiers.",
    "For now, source files collect information and proposed dossiers remain manually reviewable.",
    "Dossier Recommendation Inbox",
    "Manual Recommendation Seed",
    "Use this only when BNL has not suggested something yet. This creates a recommendation, not a direct source file.",
    "BNL Source Files",
    "Source depth / info strength",
    "Unapplied notes:",
    "Open Source File",
    "Archive",
    "Delete Permanently",
    "Move to Existing Dossier Update",
    "Attach to Existing Public Dossier",
    "Existing Dossier Updates / Enrichment Targets",
    "owner approval required before public changes",
    "DELETE SOURCE FILE",
    "Safe cleanup: move this source file out of active dashboard lanes without deleting public dossiers or published data.",
    "case file has warnings",
    "case file has source-blind material",
    "case file has public-safe facts",
    "identity review pending",
    "proposed dossier exists",
    "owner review pending",
    "ready for draft/review",
    "System Boundaries",
    "No BNL invocation",
    "No publishing",
    "No automatic tag creation",
    "No public database mutation",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  assert.match(page, /href="\/admin\/dossiers\/owner-review"/);
  assert.match(page, /href=\{`\/admin\/dossiers\/candidates\/\$\{candidate\.id\}`\}/);
  assert.match(page, /href=\{`\/admin\/dossiers\/drafts\/\$\{openDraftId\}`\}/);
  assert.match(page, /href=\{`\/admin\/dossiers\/duplicates\/\$\{group\.id\}`\}/);
  assert.match(page, /candidateAction\(candidate\.id, "archiveCandidate"\)/);
  assert.match(page, /candidateAction\(\s*candidate\.id,\s*"permanentlyDeleteCandidate"/);
  assert.match(page, /markCandidateAsExistingDossierUpdate/);
  assert.match(page, /attachCandidateToExistingDossier/);
  assert.doesNotMatch(page, /eyebrow="Lane 2"/);
  assert.doesNotMatch(page, /title="Proposed Dossiers"/);
  assert.doesNotMatch(page, /title="Final Admin Drafts"/);
  assert.doesNotMatch(page, /eyebrow="Lane 4"/);
  assert.doesNotMatch(page, /Save Draft/);
  assert.doesNotMatch(page, /Submit for Owner Review/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /if \(loading\)/);
  assert.match(page, /if \(error \|\| !payload\)/);
});

test("dossier admin pages expose the control-center/source-hub/draft-workspace model", () => {
  const dashboard = normalizedSource("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Phase 1 — BNL Source File",
    "Phase 2 — Proposed Dossier + BNL Edit Chat",
    "Phase 3 — Final Admin Draft",
    "Phase 4 — Owner Review",
    "Phase 5 — Approved / Publish Later",
    "BNL Source Files",
    "Duplicate / Identity Warnings",
    "Closed / History",
  ]) {
    assertIncludesCopy(dashboard, label);
  }

  const sourceFileCopy = normalizedSource(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  assertIncludesCopy(sourceFileCopy, "Source File Summary");
  assertIncludesCopy(sourceFileCopy, "Archive");
  assertIncludesCopy(sourceFileCopy, "Delete Permanently");
  assertIncludesCopy(sourceFileCopy, "Restore");
  assertIncludesCopy(sourceFileCopy, "Promote to Source File");
  assertIncludesCopy(sourceFileCopy, "DELETE SOURCE FILE");
  assertIncludesCopy(sourceFileCopy, "Public dossiers and published data are not deleted");
  assertIncludesCopy(sourceFileCopy, "Ready for Proposed Dossier: the proposed dossier should be written from reviewed, public-safe Source File material, not copied wholesale from this working case file.");

  const draftCopy = normalizedSource(
    "src/app/admin/dossiers/drafts/[draftId]/page.tsx",
  );
  assertIncludesCopy(
    draftCopy,
    "This is the curated public-facing draft. It should be generated/written from reviewed BNL Source File material, not copied wholesale from the internal working case file.",
  );
  assertIncludesCopy(draftCopy, "BNL Source File Summary");
  assertIncludesCopy(draftCopy, "Unapplied Source Notes");

  const ownerPage = source("src/app/admin/dossiers/owner-review/page.tsx");
  assert.match(ownerPage, /Phase 4 — Owner Review/);
  assert.match(ownerPage, /This is Owner Review/);
});

test("dossier workflow boundary copy separates case files, drafts, owner review, and recommendations", () => {
  const sourceFilePage = normalizedSource("src/app/admin/dossiers/candidates/[candidateId]/page.tsx");
  for (const label of [
    "Internal working case file",
    "Do not treat this as public copy",
    "Source File Summary",
    "Evidence / Source Notes",
    "Review Context / Possible Supporting Evidence",
    "Public-Safe Facts Pending Owner/Admin Approval",
    "Internal-Only Notes",
    "Source Warnings",
    "Conflicts / Needs Review",
    "Identity / Alias Review",
    "Do Not Say",
    "Missing Info",
    "Ready for Proposed Dossier",
    "Review-only memory context",
    "Internal/private review required",
    "Public use not allowed until review",
  ]) {
    assertIncludesCopy(sourceFilePage, label);
  }

  const draftPage = normalizedSource("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  assertIncludesCopy(draftPage, "This is the curated public-facing draft");
  assertIncludesCopy(draftPage, "not copied wholesale from the internal working case file");

  const ownerPage = normalizedSource("src/app/admin/dossiers/owner-review/page.tsx");
  assertIncludesCopy(ownerPage, "Owner Review is the final gate before anything becomes publishable/public");

  const recommendationPage = normalizedSource("src/app/admin/dossiers/recommendations/[recommendationId]/page.tsx");
  assertIncludesCopy(recommendationPage, "evidence records and Source File inputs, not public copy");
  assertIncludesCopy(recommendationPage, "Identity/alias and duplicate recommendations create proposed review material only");
  assertIncludesCopy(recommendationPage, "Possible connection, not confirmed identity");
});

test("admin dossier page has minimal loading and auth-required states", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  assert.match(page, /Checking admin access\.\.\./);
  assert.match(page, /Admin authentication required/);
  assert.match(page, /Back to Admin/);
  assert.match(page, /MinimalDossierAdminState/);
});

test("dedicated draft editor route contains focused editing workflow and future BNL boundary", () => {
  const routePath = "src/app/admin/dossiers/drafts/[draftId]/page.tsx";
  assert.equal(fs.existsSync(path.join(projectRoot, routePath)), true);
  const page = source(routePath);
  const pageCopy = normalizedSource(routePath);
  for (const label of [
    "Proposed Dossier + BNL Edit Chat",
    "BNL Source File",
    "Proposed Dossier Preview",
    "BNL Edit Chat panel — Coming Next",
    "Open Advanced Manual Edit",
    "fallback/manual override",
    "Save Draft",
    "Complete Admin Draft",
    "Final Admin Draft",
    "Send to Owner Review",
    "Return to Editing",
    "Sending to owner does not publish",
    "BNL edit chat comes next",
    "revise the proposed dossier conversationally",
    "manual override",
    "category",
    "kind",
    "ecosystemLane",
    "identityAuthority",
    "Saving does not publish.",
    "Exact character limits will be enforced in a later PR.",
    "Sent to Owner Review",
    "Waiting for owner final pass",
    "Back to Dossier Dashboard",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }
  assert.match(page, /useParams/);
  assert.match(page, /routeParam\(params\?\.draftId\)/);
  assert.match(page, /action: "saveDraft"/);
  assert.match(page, /action: "submitDraftForOwnerReview"/);
  assert.match(page, /setSubmitted\(true\)/);
  assert.match(page, /nonEditableDraftStatuses/);
  assert.match(page, /draft\.status === "ready_for_owner_review"/);
  assert.match(page, /Already submitted to Owner Review/);
  assertIncludesCopy(
    pageCopy,
    "BNL will eventually generate the proposed dossier from the BNL Source File and approved sources",
  );
  assertIncludesCopy(pageCopy, "BNL should ask only for missing specifics");
  assert.match(page, /Draft is superseded/);
  assert.match(page, /Publishing not built yet/);
  assert.match(page, /Open BNL Source File/);
  assert.match(page, /Send to Owner Review/);
  assert.match(page, /Return to Editing/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.doesNotMatch(page, /publishDraft/);
});

test("dedicated candidate review route is the BNL Source File subject hub", () => {
  const routePath = "src/app/admin/dossiers/candidates/[candidateId]/page.tsx";
  assert.equal(fs.existsSync(path.join(projectRoot, routePath)), true);
  const page = source(routePath);
  const pageCopy = normalizedSource(routePath);
  for (const label of [
    "BNL Source File",
    "Source strength",
    "Current draft status",
    "Recommendations",
    "Source notes",
    "Unapplied notes",
    "Next action",
    "Source File Summary",
    "Review Boundaries",
    "claims that need review",
    "public-safety notes",
    "Add to BNL Source File",
    "This adds information to this subject&apos;s BNL Source File. It does not directly edit the proposed dossier.",
    "Recommendation/evidence clusters",
    "No recommendations attached yet.",
    "Proposed Dossier",
    "Ready for Proposed Dossier: the proposed dossier should be written from reviewed, public-safe Source File material, not copied wholesale from this working case file.",
    "Create Proposed Dossier",
    "Open Proposed Dossier",
    "Save Info",
    "Mark Needs Info",
    "Internal working case file",
    "Do not treat this as public copy",
    "Evidence / Source Notes",
    "Review Context / Possible Supporting Evidence",
    "Public-Safe Facts Pending Owner/Admin Approval",
    "Internal-Only Notes",
    "Source Warnings",
    "Conflicts / Needs Review",
    "Identity / Alias Review",
    "Do Not Say",
    "Missing Info",
    "Review-only memory context",
    "Internal/private review required",
    "Public use not allowed until review",
    "Owner review required",
    "Possible connection, not confirmed identity",
    "Existing Public Dossier Match",
    "No existing public dossier match currently attached.",
    "This internal record is an existing dossier update / enrichment target, not a new dossier proposal.",
    "Move Back to Active Source File",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }
  for (const noteType of [
    "fact",
    "correction",
    "missing_info",
    "public_safety",
    "do_not_say",
    "link_note",
    "general_note",
    "owner_note",
  ]) {
    assert.match(page, new RegExp(noteType));
  }
  assert.match(page, /useParams/);
  assert.match(page, /routeParam\(params\?\.candidateId\)/);
  assert.match(page, /action: "createDraftFromCandidate"/);
  assert.match(page, /action: "addSourceFileNote"/);
  assert.match(page, /attachCandidateToExistingDossier/);
  assert.match(page, /markCandidateAsExistingDossierUpdate/);
  assert.doesNotMatch(page, />Deny<|>Deny<\/button>/);
  assert.doesNotMatch(page, />Final Approve<|>Publish<|>Delete<|>Final Merge</);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.doesNotMatch(page, /publishDraft/);
});


test("admin source file note display derives a human case-file view and collapses raw metadata", () => {
  const legacy = noteDisplay.createHumanReadableSourceFileNoteView({
    type: "general_note",
    text: [
      "Bridge memory suggests recurring source context.",
      "Source qualities: source-blind memory trace",
      "Visibility: internal/debug",
      "Evidence mapping: ingestKey -> bridge record",
      "Missing info: confirm owner-approved public copy",
      "Do not say: do not present bridge memory as a known fact",
    ].join("\n"),
    source: "bnl_recommendation",
    status: "active",
    publicSafe: false,
    createdAt: "2026-05-30T00:00:00.000Z",
    ingestSource: "bnl_source_knowledge_bridge",
    ingestKey: "bnl:bridge-debug-key",
  });

  assert.equal(legacy.sourceLabel, "Older BNL Review Note");
  assert.match(legacy.sourceCopy, /Review-only context connected/);
  assert.equal(legacy.legacyRawFormatting, true);
  assert.match(legacy.summary, /review-only context connected/);
  assert.equal(legacy.sections.some((section) => section.title === "Known Facts"), false);
  assert.equal(legacy.sections.some((section) => section.title === "Open Questions"), true);
  assert.equal(legacy.sections.some((section) => section.title === "Not Public Yet"), true);
  assert.equal(legacy.rawMetadata.some((item) => item.label === "Source qualities"), true);
  assert.equal(legacy.rawMetadata.some((item) => item.label === "ingestKey"), true);

  const enrichment = noteDisplay.createHumanReadableSourceFileNoteView({
    type: "general_note",
    text: "Summary: Enrichment found review-only context.\nSafety note: keep internal.",
    source: "bnl_recommendation",
    status: "active",
    publicSafe: false,
    createdAt: "2026-05-30T00:00:00.000Z",
    ingestSource: "bnl_source_file_enrichment",
    ingestKey: "bnl:enrichment-key",
  });

  assert.equal(enrichment.sourceLabel, "BNL Review Addendum");
  assert.match(enrichment.sourceCopy, /Public copy still requires owner\/admin approval/);
  assert.equal(enrichment.rawMetadata.some((item) => item.label === "ingestKey"), true);
});

test("admin Source File and recommendation pages render readable sections with collapsed audit details", () => {
  const displayHelper = normalizedSource("src/lib/dossier-note-display.ts");
  const summaryHelper = normalizedSource("src/lib/dossier-source-file-summary.ts");
  const candidatePage = `${normalizedSource("src/app/admin/dossiers/candidates/[candidateId]/page.tsx")} ${displayHelper} ${summaryHelper}`;
  const recommendationPage = `${normalizedSource("src/app/admin/dossiers/recommendations/[recommendationId]/page.tsx")} ${displayHelper}`;

  for (const label of [
    "HumanReadableNoteView",
    "Source File Summary",
    "Current Read",
    "What BNL Actually Knows",
    "Why This File Exists",
    "Useful Evidence",
    "Patterns / Themes",
    "Open Questions",
    "Recommended Next Step",
    "Substance:",
    "Public readiness:",
    "Existing public dossier:",
    "Next action:",
    "This file is still thin",
    "Older BNL Review Note",
    "BNL Review Addendum",
    "Review-only context connected to this subject",
    "Technical audit details",
    "warnings",
    "Open Questions",
    "Claimed / Needs Review",
    "Pattern BNL Noticed",
    "Not Public Yet",
  ]) {
    assertIncludesCopy(candidatePage, label);
  }

  for (const label of [
    "Plain-English review view",
    "Recommendation Takeaway",
    "Technical audit details",
    "Adds review context",
    "Thin: routing only",
    "Claimed / Needs Review",
    "Pattern BNL Noticed",
    "Not Public Yet",
    "Open Questions",
    "Recommended Next Step",
  ]) {
    assertIncludesCopy(recommendationPage, label);
  }
});

test("dedicated duplicate merge route contains focused manual merge workflow", () => {
  const routePath = "src/app/admin/dossiers/duplicates/[groupId]/page.tsx";
  assert.equal(fs.existsSync(path.join(projectRoot, routePath)), true);
  const page = source(routePath);
  for (const label of [
    "Merge Review",
    "Merge is owner/lead cleanup",
    "This combines BNL Source Files",
    "Owner/Lead Merge Controls",
    "high-risk admin preview",
    "Nothing auto-merges",
    "Source candidates are preserved",
    "Source drafts are preserved",
    "Merge candidates only",
    "Merge candidates and create/update master draft",
    "Pre-merge summary",
    "Master candidate:",
    "Included candidates:",
    "No public database record will be created.",
    "No tags will be created.",
    "BNL will not be invoked.",
    "Merge result",
    "Merged source candidates",
    "Superseded source drafts",
    "Open master draft",
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /useParams/);
  assert.match(page, /routeParam\(params\?\.groupId\)/);
  assert.match(page, /action: "mergeCandidates"/);
  assert.match(page, /disabled=\{saving \|\| !canMerge\}/);
  assert.match(page, /includedCandidateIds\.includes\(primaryCandidate\.id\)/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.doesNotMatch(page, /publishDraft/);
});

test("dashboard uses actual workflow ids, source metrics, and overview filtering", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  assert.match(page, /href=\{`\/admin\/dossiers\/candidates\/\$\{candidate\.id\}`\}/);
  assert.match(page, /href=\{`\/admin\/dossiers\/drafts\/\$\{openDraftId\}`\}/);
  assert.match(page, /href=\{`\/admin\/dossiers\/duplicates\/\$\{group\.id\}`\}/);
  assert.match(page, /activeCandidateStatuses/);
  assert.match(page, /activeCandidates = candidates\.filter/);
  assert.match(page, /activeDraftStatuses/);
  assert.match(page, /closedDraftStatuses/);
  assert.match(page, /getDossierSourceFileMetrics/);
  assert.match(page, /sourceFilesWithUnappliedNotes/);
  assert.match(page, /sourceFilesWithDrafts/);
  assert.match(page, /Review source updates in proposed dossier/);
  assert.match(page, /Source strength:/);
  assert.match(page, /Recommendations:/);
  assert.match(page, /Evidence:/);
  assert.match(page, /Open Source File/);
  assert.match(page, /Open Proposed Dossier/);
  assert.match(page, /Create Proposed Dossier/);
  assert.match(page, /Mark Needs Info/);
  assert.match(page, /Closed \/ History/);
  assert.match(page, /View Warning \/ Open Merge Review/);
  assert.doesNotMatch(page, />Deny<|>Deny<\/button>/);
});

test("dashboard frames manual recommendation seed as collapsed fallback and BNL workbench as future-only", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Manual Recommendation Seed",
    "Use this only when BNL has not suggested something yet. This creates a recommendation, not a direct source file.",
    "Create Manual Recommendation",
    "BNL Dossier Workbench",
    "BNL drafting comes next.",
    "BNL will use reviewed, public-safe material from each BNL Source File to generate or revise proposed dossiers.",
    "For now, source files collect information and proposed dossiers remain manually reviewable.",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }
  assert.doesNotMatch(page, /createManualCandidate/);
  assert.doesNotMatch(page, /Create Manual Candidate/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
});

test("owner review page is a placeholder lane without publishing", () => {
  const routePath = "src/app/admin/dossiers/owner-review/page.tsx";
  assert.equal(fs.existsSync(path.join(projectRoot, routePath)), true);
  const page = source(routePath);
  assert.match(page, /Owner Final Review Queue/);
  assert.match(page, /This is Owner Review\. Owner Review is the final gate before anything becomes publishable\/public/);
  assert.match(page, /Owner final review is separate from admin drafting/);
  assert.match(
    page,
    /Owner will be able to use BNL assistance plus manual editing/,
  );
  assert.match(
    page,
    /Owner can approve, send back, request more info, or deny/,
  );
  assert.match(
    page,
    /Owner approval will require owner gate\/secret in a later PR/,
  );
  assert.match(
    page,
    /Additional Info Added After Submission \/ Admin Addendum/,
  );
  assert.match(page, /Approval does not publish yet/);
  assert.match(
    page,
    /Owner approval still will not publish until publishing exists/,
  );
  assert.match(page, /View Submitted Draft/);
  assert.doesNotMatch(page, /publishDraft/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
});

test("dossier workflow types include manual input and scoring policy contracts", () => {
  const workflowSource = source("src/lib/dossier-workflow.ts");
  assert.match(workflowSource, /export type DossierCandidateEvidenceType/);
  assert.match(workflowSource, /export type CreateManualDossierCandidateInput/);
  assert.match(workflowSource, /export function scoreManualDossierCandidate/);
  assert.match(workflowSource, /knownFacts\?: string\[\]/);
  assert.match(workflowSource, /recommendedOrigin\?: DossierOrigin/);
  assert.match(workflowSource, /primaryLink\?: DossierWorkflowLink/);

  const storeSource = source("src/lib/dossier-workflow-store.ts");
  assert.match(storeSource, /revision: number/);
  assert.match(storeSource, /DOSSIER_WORKFLOW_LOCK_KEY/);
  assert.match(storeSource, /MAX_UPDATE_ATTEMPTS/);
  assert.match(storeSource, /memoryWriteQueue/);
  assert.match(storeSource, /updateDossierWorkflowState/);

  assert.equal(
    workflow.DOSSIER_CANDIDATE_SCORING_POLICY.gate,
    "Loose intake, strict drafting/publishing.",
  );
  assert.equal(
    workflow.DOSSIER_CANDIDATE_SCORING_POLICY.thresholds.reviewCandidateMin,
    50,
  );
});

test("admin dossier API requires auth for GET and POST", async () => {
  const unauthorizedGet = await route.GET(
    new Request("https://example.test/api/admin/dossiers"),
  );
  assert.equal(unauthorizedGet.status, 401);

  const unauthorizedPost = await route.POST(
    new Request("https://example.test/api/admin/dossiers", {
      method: "POST",
      body: JSON.stringify({
        action: "createManualCandidate",
        input: manualCandidateInput,
      }),
    }),
  );
  assert.equal(unauthorizedPost.status, 401);
});

test("authenticated GET returns workflow store, metadata, authoring guide, tag registry, and scoring policy summaries", async () => {
  await resetWorkflowStore();
  const response = await authedGet();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.candidates, []);
  assert.deepEqual(payload.drafts, []);
  assert.deepEqual(payload.recommendations, []);
  assert.equal(payload.workflow.version, 1);
  assert.equal(payload.workflow.status, "candidate_store_enabled");
  assert.equal(payload.workflow.storage, "memory_fallback");
  assert.equal(payload.workflow.storageKey, "barcode:dossier-workflow:v1");
  assert.equal(payload.workflow.revision, 0);
  assert.ok(payload.workflow.allowedActions.includes("requestDraft"));
  assert.ok(
    payload.workflow.allowedActions.includes("createDraftFromCandidate"),
  );
  assert.ok(payload.workflow.allowedActions.includes("saveDraft"));
  assert.ok(
    payload.workflow.allowedActions.includes("submitDraftForOwnerReview"),
  );
  assert.equal(
    payload.workflow.scoringPolicy.gate,
    "Loose intake, strict drafting/publishing.",
  );
  assert.equal(payload.workflow.scoringPolicy.thresholds.draftReadyMin, 70);
  assert.ok(
    payload.workflow.candidateSourceBoundaries.some(
      (entry) => entry.source === "queue_frequency",
    ),
  );
  assert.equal(payload.authoringGuide.version, "1.0");
  assert.ok(payload.authoringGuide.fieldCount > 0);
  assert.ok(payload.tagRegistry.totalUniqueTags > 0);
  assert.equal(
    payload.tagRegistry.creationPolicy.newTagsAllowed,
    "proposal_only",
  );
  assert.equal(payload.ownerReviewQueue.waitingCount, 0);
  assert.equal(payload.ownerReviewQueue.draftCount, 0);
  assert.equal(payload.ownerReviewQueue.candidateCount, 0);
  assert.equal(payload.workflow.ownerGate.requiresOwnerSecretFuture, true);
  assert.equal(payload.workflow.ownerGate.approvalPublishes, false);
});

test("authenticated POST creates and persists a manual candidate without publishing", async () => {
  await resetWorkflowStore();
  const databaseEntriesBefore = JSON.stringify(databasePage.entries);
  const tagCountBefore = databasePage.entries.flatMap(
    (entry) => entry.tags,
  ).length;

  const createResponse = await authedPost({
    action: "createManualCandidate",
    input: manualCandidateInput,
  });
  assert.equal(createResponse.status, 200);
  const createPayload = await createResponse.json();
  const candidate = createPayload.candidate;

  assert.ok(candidate.id);
  assert.equal(candidate.name, manualCandidateInput.name);
  assert.equal(candidate.source, "manual");
  assert.match(candidate.status, /^(needs_review|suggested)$/);
  assert.ok(["review_candidate", "draft_ready"].includes(candidate.tier));
  assert.equal(typeof candidate.score, "number");
  assert.equal(candidate.whyNow, manualCandidateInput.whyNow);
  assert.equal(candidate.evidenceSummary, manualCandidateInput.evidenceSummary);
  assert.equal(candidate.knownFacts.length, 2);
  assert.equal(
    candidate.missingInfo.includes("Confirm preferred public role"),
    true,
  );
  assert.equal(candidate.doNotSay[0], "Do not imply private Discord identity");
  assert.equal(candidate.publicSafetyNotes[0], "Use public facts only");
  assert.ok(candidate.createdAt);
  assert.ok(candidate.updatedAt);
  assert.equal(candidate.primaryLink.url, manualCandidateInput.primaryLink.url);
  assert.equal(candidate.recommendedKind, manualCandidateInput.recommendedKind);
  assert.equal(
    candidate.recommendedEcosystemLane,
    manualCandidateInput.recommendedEcosystemLane,
  );
  assert.equal(
    candidate.recommendedIdentityAuthority,
    manualCandidateInput.recommendedIdentityAuthority,
  );

  const getResponse = await authedGet();
  const getPayload = await getResponse.json();
  assert.equal(getPayload.candidates.length, 1);
  assert.equal(getPayload.candidates[0].id, candidate.id);
  assert.equal(getPayload.drafts.length, 0);

  assert.equal(JSON.stringify(databasePage.entries), databaseEntriesBefore);
  assert.equal(
    databasePage.entries.flatMap((entry) => entry.tags).length,
    tagCountBefore,
  );
});

test("concurrent manual candidate creation preserves both candidates and increments revision", async () => {
  await resetWorkflowStore();

  const [firstResponse, secondResponse] = await Promise.all([
    authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Concurrent Candidate One" },
    }),
    authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Concurrent Candidate Two" },
    }),
  ]);

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);

  const payload = await (await authedGet()).json();
  const names = payload.candidates.map((candidate) => candidate.name).sort();
  assert.deepEqual(names, [
    "Concurrent Candidate One",
    "Concurrent Candidate Two",
  ]);
  assert.equal(payload.workflow.revision, 2);
});

test("concurrent status updates preserve unrelated candidates", async () => {
  await resetWorkflowStore();

  const firstCreate = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Concurrent Status One" },
    })
  ).json();
  const secondCreate = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Concurrent Status Two" },
    })
  ).json();

  const [denyResponse, needsEvidenceResponse] = await Promise.all([
    authedPost({
      action: "denyCandidate",
      candidateId: firstCreate.candidate.id,
    }),
    authedPost({
      action: "markNeedsMoreEvidence",
      candidateId: secondCreate.candidate.id,
    }),
  ]);

  assert.equal(denyResponse.status, 200);
  assert.equal(needsEvidenceResponse.status, 200);

  const payload = await (await authedGet()).json();
  const firstCandidate = payload.candidates.find(
    (candidate) => candidate.id === firstCreate.candidate.id,
  );
  const secondCandidate = payload.candidates.find(
    (candidate) => candidate.id === secondCreate.candidate.id,
  );
  assert.equal(payload.candidates.length, 2);
  assert.equal(firstCandidate.status, "denied");
  assert.equal(secondCandidate.status, "needs_more_evidence");
  assert.equal(payload.workflow.revision, 4);
});

test("workflow revision increments on candidate writes but not missing-candidate no-ops", async () => {
  await resetWorkflowStore();
  assert.equal((await store.getDossierWorkflowState()).revision, 0);

  const createPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();
  assert.equal((await store.getDossierWorkflowState()).revision, 1);

  await authedPost({
    action: "denyCandidate",
    candidateId: createPayload.candidate.id,
  });
  assert.equal((await store.getDossierWorkflowState()).revision, 2);

  const missingResponse = await authedPost({
    action: "denyCandidate",
    candidateId: "missing",
  });
  assert.equal(missingResponse.status, 404);
  assert.equal((await store.getDossierWorkflowState()).revision, 2);
});

test("denyCandidate updates status and keeps the candidate record", async () => {
  await resetWorkflowStore();
  const createPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();
  const denyResponse = await authedPost({
    action: "denyCandidate",
    candidateId: createPayload.candidate.id,
  });
  assert.equal(denyResponse.status, 200);
  const denyPayload = await denyResponse.json();
  assert.equal(denyPayload.candidate.status, "denied");
  assert.equal(denyPayload.candidates.length, 1);
  assert.equal(denyPayload.candidates[0].id, createPayload.candidate.id);
});

test("markNeedsMoreEvidence updates status", async () => {
  await resetWorkflowStore();
  const createPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();
  const updateResponse = await authedPost({
    action: "markNeedsMoreEvidence",
    candidateId: createPayload.candidate.id,
  });
  assert.equal(updateResponse.status, 200);
  const updatePayload = await updateResponse.json();
  assert.equal(updatePayload.candidate.status, "needs_more_evidence");
});

test("future actions stay placeholder-only and missing candidates return 404", async () => {
  await resetWorkflowStore();
  for (const action of [
    "requestDraft",
    "requestRevision",
    "ownerApproveDraft",
    "ownerRequestChanges",
    "ownerDenyDraft",
    "publishDraft",
  ]) {
    const response = await authedPost({
      action,
      candidateId: "candidate-test",
      draftId: "draft-test",
    });
    assert.equal(
      response.status,
      501,
      `${action} should stay placeholder-only`,
    );
    const payload = await response.json();
    assert.equal(payload.code, "not_implemented_yet");
  }

  const missingResponse = await authedPost({
    action: "denyCandidate",
    candidateId: "missing",
  });
  assert.equal(missingResponse.status, 404);
});

test("createDraftFromCandidate creates one workflow draft from candidate recommendations", async () => {
  await resetWorkflowStore();
  const createCandidatePayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();

  const response = await authedPost({
    action: "createDraftFromCandidate",
    candidateId: createCandidatePayload.candidate.id,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const draft = payload.draft;

  assert.ok(draft.id);
  assert.equal(draft.candidateId, createCandidatePayload.candidate.id);
  assert.equal(draft.status, "draft");
  assert.equal(draft.fields.name, manualCandidateInput.name);
  assert.equal(draft.fields.category, manualCandidateInput.recommendedCategory);
  assert.equal(draft.fields.kind, manualCandidateInput.recommendedKind);
  assert.equal(
    draft.fields.ecosystemLane,
    manualCandidateInput.recommendedEcosystemLane,
  );
  assert.equal(
    draft.fields.identityAuthority,
    manualCandidateInput.recommendedIdentityAuthority,
  );
  assert.equal(draft.fields.status, manualCandidateInput.recommendedStatus);
  assert.equal(
    draft.fields.clearance,
    manualCandidateInput.recommendedClearance,
  );
  assert.equal(draft.fields.origin, manualCandidateInput.recommendedOrigin);
  assert.deepEqual(draft.fields.tags, manualCandidateInput.recommendedTags);
  assert.deepEqual(
    draft.fields.proposedTags,
    manualCandidateInput.proposedTags,
  );
  assert.equal(
    draft.fields.primaryLink.url,
    manualCandidateInput.primaryLink.url,
  );
  assert.equal(payload.candidates[0].id, createCandidatePayload.candidate.id);
  assert.notEqual(payload.candidates[0].status, "published");
  assert.equal(payload.drafts.length, 1);
});

test("createDraftFromCandidate returns existing active draft without duplicating", async () => {
  await resetWorkflowStore();
  const createCandidatePayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();
  const firstPayload = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: createCandidatePayload.candidate.id,
    })
  ).json();
  const secondResponse = await authedPost({
    action: "createDraftFromCandidate",
    candidateId: createCandidatePayload.candidate.id,
  });
  assert.equal(secondResponse.status, 200);
  const secondPayload = await secondResponse.json();
  assert.equal(secondPayload.draft.id, firstPayload.draft.id);
  assert.equal(secondPayload.drafts.length, 1);
});

test("saveDraft updates draft fields, persists through GET, and does not mutate public content", async () => {
  await resetWorkflowStore();
  const databaseEntriesBefore = JSON.stringify(databasePage.entries);
  const readModelBefore = await (await readModel.GET()).json();
  const readModelNamesBefore = readModelBefore.sections.dossiers.items
    .map((entry) => entry.name)
    .join("|");
  const createCandidatePayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();
  const createDraftPayload = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: createCandidatePayload.candidate.id,
    })
  ).json();

  const fields = {
    ...createDraftPayload.draft.fields,
    name: "Manual Candidate Alpha Draft",
    role: "Public artist profile",
    summary: "A saved public-safe manual draft summary.",
    notes: "Operator edited notes.",
    tags: ["artist", "radio", "saved-draft"],
  };
  const saveResponse = await authedPost({
    action: "saveDraft",
    draftId: createDraftPayload.draft.id,
    fields,
  });
  assert.equal(saveResponse.status, 200);
  const savePayload = await saveResponse.json();
  assert.equal(savePayload.draft.fields.name, "Manual Candidate Alpha Draft");
  assert.equal(savePayload.draft.fields.role, "Public artist profile");
  assert.equal(
    savePayload.draft.fields.kind,
    manualCandidateInput.recommendedKind,
  );
  assert.equal(
    savePayload.draft.fields.ecosystemLane,
    manualCandidateInput.recommendedEcosystemLane,
  );
  assert.equal(
    savePayload.draft.fields.identityAuthority,
    manualCandidateInput.recommendedIdentityAuthority,
  );
  assert.deepEqual(savePayload.draft.fields.tags, [
    "artist",
    "radio",
    "saved-draft",
  ]);

  const getPayload = await (await authedGet()).json();
  assert.equal(
    getPayload.drafts[0].fields.summary,
    "A saved public-safe manual draft summary.",
  );
  assert.equal(
    getPayload.drafts[0].fields.kind,
    manualCandidateInput.recommendedKind,
  );
  assert.equal(
    getPayload.drafts[0].fields.ecosystemLane,
    manualCandidateInput.recommendedEcosystemLane,
  );
  assert.equal(
    getPayload.drafts[0].fields.identityAuthority,
    manualCandidateInput.recommendedIdentityAuthority,
  );
  assert.equal(JSON.stringify(databasePage.entries), databaseEntriesBefore);
  const readModelAfter = await (await readModel.GET()).json();
  assert.equal(
    readModelAfter.sections.dossiers.items.map((entry) => entry.name).join("|"),
    readModelNamesBefore,
  );
  assert.equal(
    readModelAfter.sections.dossiers.items.some(
      (entry) => entry.name === "Manual Candidate Alpha Draft",
    ),
    false,
  );
});

test("submitDraftForOwnerReview validates required fields and updates owner queue", async () => {
  await resetWorkflowStore();
  const createCandidatePayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();
  const createDraftPayload = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: createCandidatePayload.candidate.id,
    })
  ).json();

  await authedPost({
    action: "saveDraft",
    draftId: createDraftPayload.draft.id,
    fields: {
      ...createDraftPayload.draft.fields,
      kind: "",
      ecosystemLane: "",
      identityAuthority: "",
    },
  });
  const invalidResponse = await authedPost({
    action: "submitDraftForOwnerReview",
    draftId: createDraftPayload.draft.id,
  });
  assert.equal(invalidResponse.status, 400);
  const invalidPayload = await invalidResponse.json();
  assert.equal(invalidPayload.code, "invalid_draft_fields");
  assert.ok(invalidPayload.missingFields.includes("role"));
  assert.ok(invalidPayload.missingFields.includes("kind"));
  assert.ok(invalidPayload.missingFields.includes("ecosystemLane"));
  assert.ok(invalidPayload.missingFields.includes("identityAuthority"));

  const fields = {
    ...createDraftPayload.draft.fields,
    kind: manualCandidateInput.recommendedKind,
    ecosystemLane: manualCandidateInput.recommendedEcosystemLane,
    identityAuthority: manualCandidateInput.recommendedIdentityAuthority,
    role: "Public artist profile",
    summary: "A complete enough manual draft summary for owner review.",
    tags: ["artist", "radio"],
  };
  await authedPost({
    action: "saveDraft",
    draftId: createDraftPayload.draft.id,
    fields,
  });
  const submitResponse = await authedPost({
    action: "submitDraftForOwnerReview",
    draftId: createDraftPayload.draft.id,
  });
  assert.equal(submitResponse.status, 200);
  const submitPayload = await submitResponse.json();
  assert.equal(submitPayload.draft.status, "ready_for_owner_review");
  assert.equal(submitPayload.ownerReviewQueue.waitingCount, 1);

  const getPayload = await (await authedGet()).json();
  assert.equal(getPayload.ownerReviewQueue.waitingCount, 1);
  assert.equal(getPayload.drafts[0].status, "ready_for_owner_review");
});

test("manual candidate workflow does not publish to database, read model dossiers, or tag registry", async () => {
  await resetWorkflowStore();
  const publicDossierIdsBefore = databasePage.entries
    .map((entry) => entry.id)
    .join("|");
  const tagNamesBefore = new Set(
    databasePage.entries.flatMap((entry) => entry.tags),
  );
  const readModelBefore = await (await readModel.GET()).json();
  const publicReadModelNamesBefore = readModelBefore.sections.dossiers.items
    .map((entry) => entry.name)
    .join("|");

  const createPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Workflow Only Candidate Zed" },
    })
  ).json();
  await authedPost({
    action: "denyCandidate",
    candidateId: createPayload.candidate.id,
  });

  assert.equal(
    databasePage.entries.map((entry) => entry.id).join("|"),
    publicDossierIdsBefore,
  );
  assert.deepEqual(
    new Set(databasePage.entries.flatMap((entry) => entry.tags)),
    tagNamesBefore,
  );

  const readModelAfter = await (await readModel.GET()).json();
  assert.equal(
    readModelAfter.sections.dossiers.items.map((entry) => entry.name).join("|"),
    publicReadModelNamesBefore,
  );
  assert.equal(
    readModelAfter.sections.dossiers.items.some(
      (entry) => entry.name === "Workflow Only Candidate Zed",
    ),
    false,
  );
});

test("duplicate awareness marks candidates matching existing database entries", async () => {
  await resetWorkflowStore();
  const response = await authedPost({
    action: "createManualCandidate",
    input: {
      ...manualCandidateInput,
      name: databasePage.entries[0].name,
      reason: "Operator wants to verify duplicate handling.",
    },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.candidate.duplicateRisk, "high");
  assert.equal(
    payload.candidate.existingDossierMatch.id,
    databasePage.entries[0].id,
  );
  assert.equal(
    payload.candidate.existingDossierMatch.name,
    databasePage.entries[0].name,
  );
  assert.ok(
    payload.candidate.missingInfo.some((item) =>
      /Duplicate review required/.test(item),
    ),
  );
  assert.ok(
    payload.candidate.publicSafetyNotes.some((item) =>
      /Duplicate review required/.test(item),
    ),
  );
});

test("workflow duplicate group detection returns deterministic high-risk groups", async () => {
  await resetWorkflowStore();
  const first = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Signal Witch" },
    })
  ).json();
  const second = await (
    await authedPost({
      action: "createManualCandidate",
      input: {
        ...manualCandidateInput,
        name: "Signal Witch",
        reason: "Queue/session context.",
      },
    })
  ).json();

  const payload = await (await authedGet()).json();
  assert.equal(payload.duplicateGroups.length, 1);
  const group = payload.duplicateGroups[0];
  assert.equal(group.risk, "high");
  assert.deepEqual(
    new Set(group.candidateIds),
    new Set([first.candidate.id, second.candidate.id]),
  );
  assert.equal(group.suggestedMasterCandidateId, first.candidate.id);
});

test("workflow duplicate group detection catches compact near duplicates", async () => {
  await resetWorkflowStore();
  const first = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Signal Witch" },
    })
  ).json();
  const second = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "signalwitch" },
    })
  ).json();

  const payload = await (await authedGet()).json();
  assert.equal(payload.duplicateGroups.length, 1);
  assert.ok(["high", "medium"].includes(payload.duplicateGroups[0].risk));
  assert.deepEqual(
    new Set(payload.duplicateGroups[0].candidateIds),
    new Set([first.candidate.id, second.candidate.id]),
  );
});

test("workflow duplicate group detection leaves clear non-duplicates ungrouped", async () => {
  await resetWorkflowStore();
  await authedPost({
    action: "createManualCandidate",
    input: { ...manualCandidateInput, name: "Signal Witch" },
  });
  await authedPost({
    action: "createManualCandidate",
    input: { ...manualCandidateInput, name: "Cache Bird" },
  });
  const payload = await (await authedGet()).json();
  assert.deepEqual(payload.duplicateGroups, []);
});

test("mergeCandidates preserves sources and unions candidate review fields", async () => {
  await resetWorkflowStore();
  const first = await (
    await authedPost({
      action: "createManualCandidate",
      input: {
        ...manualCandidateInput,
        name: "Signal Witch",
        knownFacts: ["Fact A"],
        missingInfo: ["Missing A"],
        doNotSay: ["Do not say A"],
        publicSafetyNotes: ["Safety A"],
        recommendedTags: ["signal", "witch"],
        proposedTags: ["draft-a"],
      },
    })
  ).json();
  const second = await (
    await authedPost({
      action: "createManualCandidate",
      input: {
        ...manualCandidateInput,
        name: "Signal Witch",
        reason: "Queue/session context.",
        knownFacts: ["Fact B", "Fact A"],
        missingInfo: ["Missing B"],
        doNotSay: ["Do not say B"],
        publicSafetyNotes: ["Safety B"],
        recommendedTags: ["queue"],
        proposedTags: ["draft-b"],
      },
    })
  ).json();

  const response = await authedPost({
    action: "mergeCandidates",
    input: {
      primaryCandidateId: first.candidate.id,
      sourceCandidateIds: [first.candidate.id, second.candidate.id],
      mergeNote: "Manual duplicate merge test.",
    },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const master = payload.candidates.find(
    (candidate) => candidate.id === first.candidate.id,
  );
  const secondary = payload.candidates.find(
    (candidate) => candidate.id === second.candidate.id,
  );
  assert.equal(master.status, "needs_review");
  assert.equal(secondary.status, "merged");
  assert.equal(secondary.mergedIntoCandidateId, first.candidate.id);
  assert.deepEqual(new Set(master.knownFacts), new Set(["Fact A", "Fact B"]));
  assert.deepEqual(
    new Set(master.missingInfo),
    new Set(["Missing A", "Missing B"]),
  );
  assert.deepEqual(
    new Set(master.doNotSay),
    new Set(["Do not say A", "Do not say B"]),
  );
  assert.deepEqual(
    new Set(master.publicSafetyNotes),
    new Set(["Safety A", "Safety B"]),
  );
  assert.deepEqual(
    new Set(master.recommendedTags),
    new Set(["signal", "witch", "queue"]),
  );
  assert.deepEqual(
    new Set(master.proposedTags),
    new Set(["draft-a", "draft-b"]),
  );
  assert.equal(payload.candidates.length, 2);
});

test("mergeCandidates prefers primary taxonomy and fills missing taxonomy from secondary", async () => {
  await resetWorkflowStore();
  const first = await (
    await authedPost({
      action: "createManualCandidate",
      input: {
        ...manualCandidateInput,
        name: "Taxonomy Merge Subject",
        recommendedCategory: undefined,
        recommendedKind: undefined,
        recommendedEcosystemLane: "radio_entity",
        recommendedIdentityAuthority: "barcode_controlled",
      },
    })
  ).json();
  const second = await (
    await authedPost({
      action: "createManualCandidate",
      input: {
        ...manualCandidateInput,
        name: "Taxonomy Merge Subject",
        recommendedCategory: "Entity",
        recommendedKind: "radio_entity",
        recommendedEcosystemLane: "community_artist",
        recommendedIdentityAuthority: "community_owned",
      },
    })
  ).json();

  const payload = await (
    await authedPost({
      action: "mergeCandidates",
      input: {
        primaryCandidateId: first.candidate.id,
        sourceCandidateIds: [first.candidate.id, second.candidate.id],
      },
    })
  ).json();
  const master = payload.merge.masterCandidate;
  assert.equal(master.recommendedCategory, "Entity");
  assert.equal(master.recommendedKind, "radio_entity");
  assert.equal(master.recommendedEcosystemLane, "radio_entity");
  assert.equal(master.recommendedIdentityAuthority, "barcode_controlled");
});

test("mergeCandidates can create/update a master draft and supersede secondary drafts", async () => {
  await resetWorkflowStore();
  const first = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Draft Merge Subject" },
    })
  ).json();
  const second = await (
    await authedPost({
      action: "createManualCandidate",
      input: {
        ...manualCandidateInput,
        name: "Draft Merge Subject",
        recommendedKind: "radio_entity",
      },
    })
  ).json();
  const firstDraft = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: first.candidate.id,
    })
  ).json();
  const secondDraft = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: second.candidate.id,
    })
  ).json();

  const payload = await (
    await authedPost({
      action: "mergeCandidates",
      input: {
        primaryCandidateId: first.candidate.id,
        sourceCandidateIds: [first.candidate.id, second.candidate.id],
        sourceDraftIds: [firstDraft.draft.id, secondDraft.draft.id],
        createMasterDraft: true,
      },
    })
  ).json();

  const masterDraft = payload.merge.masterDraft;
  const secondaryDraft = payload.drafts.find(
    (draft) => draft.id === secondDraft.draft.id,
  );
  assert.equal(masterDraft.id, firstDraft.draft.id);
  assert.equal(masterDraft.candidateId, first.candidate.id);
  assert.equal(masterDraft.status, "draft");
  assert.equal(secondaryDraft.status, "superseded");
  assert.equal(secondaryDraft.mergedIntoDraftId, masterDraft.id);
  assert.equal(
    masterDraft.fields.ecosystemLane,
    manualCandidateInput.recommendedEcosystemLane,
  );
  assert.equal(
    masterDraft.fields.identityAuthority,
    manualCandidateInput.recommendedIdentityAuthority,
  );
});

test("mergeCandidates validation covers auth, missing primary, too few sources, and denied primary", async () => {
  await resetWorkflowStore();
  const unauthorized = await route.POST(
    new Request("https://example.test/api/admin/dossiers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "mergeCandidates",
        input: { primaryCandidateId: "x", sourceCandidateIds: ["x", "y"] },
      }),
    }),
  );
  assert.equal(unauthorized.status, 401);

  const missing = await authedPost({
    action: "mergeCandidates",
    input: {
      primaryCandidateId: "missing",
      sourceCandidateIds: ["missing", "also-missing"],
    },
  });
  assert.equal(missing.status, 404);

  const first = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Validation Subject" },
    })
  ).json();
  const tooFew = await authedPost({
    action: "mergeCandidates",
    input: {
      primaryCandidateId: first.candidate.id,
      sourceCandidateIds: [first.candidate.id],
    },
  });
  assert.equal(tooFew.status, 400);

  await authedPost({
    action: "denyCandidate",
    candidateId: first.candidate.id,
  });
  const second = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Validation Subject" },
    })
  ).json();
  const denied = await authedPost({
    action: "mergeCandidates",
    input: {
      primaryCandidateId: first.candidate.id,
      sourceCandidateIds: [first.candidate.id, second.candidate.id],
    },
  });
  assert.equal(denied.status, 400);
});

test("mergeCandidates does not mutate public database, public read model, tag registry, or publish", async () => {
  await resetWorkflowStore();
  const publicDossierIdsBefore = databasePage.entries
    .map((entry) => entry.id)
    .join("|");
  const tagNamesBefore = new Set(
    databasePage.entries.flatMap((entry) => entry.tags),
  );
  const readModelBefore = await (await readModel.GET()).json();
  const publicReadModelNamesBefore = readModelBefore.sections.dossiers.items
    .map((entry) => entry.name)
    .join("|");

  const first = await (
    await authedPost({
      action: "createManualCandidate",
      input: {
        ...manualCandidateInput,
        name: "Workflow Merge Only",
        recommendedTags: ["workflow-only-tag-a"],
      },
    })
  ).json();
  const second = await (
    await authedPost({
      action: "createManualCandidate",
      input: {
        ...manualCandidateInput,
        name: "Workflow Merge Only",
        recommendedTags: ["workflow-only-tag-b"],
      },
    })
  ).json();
  await authedPost({
    action: "mergeCandidates",
    input: {
      primaryCandidateId: first.candidate.id,
      sourceCandidateIds: [first.candidate.id, second.candidate.id],
      createMasterDraft: true,
    },
  });

  assert.equal(
    databasePage.entries.map((entry) => entry.id).join("|"),
    publicDossierIdsBefore,
  );
  assert.deepEqual(
    new Set(databasePage.entries.flatMap((entry) => entry.tags)),
    tagNamesBefore,
  );
  const readModelAfter = await (await readModel.GET()).json();
  assert.equal(
    readModelAfter.sections.dossiers.items.map((entry) => entry.name).join("|"),
    publicReadModelNamesBefore,
  );
  assert.equal(
    readModelAfter.sections.dossiers.items.some(
      (entry) => entry.name === "Workflow Merge Only",
    ),
    false,
  );
});

test("admin dossiers dashboard links duplicate groups to dedicated merge review", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const mergePage = source(
    "src/app/admin/dossiers/duplicates/[groupId]/page.tsx",
  );
  assert.match(page, /Duplicate \/ Identity Warnings/);
  assert.match(page, /View Warning \/ Open Merge Review/);
  assert.match(page, /\/admin\/dossiers\/duplicates\//);
  assert.doesNotMatch(page, /Merge into Master Candidate/);
  assert.doesNotMatch(page, /Create Master Draft from Merge/);
  assert.match(mergePage, /Merge is owner\/lead cleanup/);
  assert.match(mergePage, /This combines BNL Source Files/);
  assert.match(mergePage, /Nothing auto-merges/);
  assert.match(mergePage, /Source candidates are preserved/);
  assert.match(mergePage, /Source drafts are preserved/);
  assert.match(mergePage, /BNL merge writing comes later/);
});

test("workflow state defaults recommendations and source notes for older stores", async () => {
  await store.saveDossierWorkflowState({
    version: 1,
    revision: 0,
    candidates: [
      {
        id: "legacy-candidate",
        name: "Legacy Candidate",
        candidateType: "unknown",
        source: "manual",
        tier: "review_candidate",
        score: 50,
        whyNow: "Legacy state",
        reason: "Legacy reason",
        evidenceSummary: "Legacy evidence",
        status: "needs_review",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    ],
    drafts: [],
    updatedAt: new Date(0).toISOString(),
  });
  const payload = await (await authedGet()).json();
  assert.deepEqual(payload.recommendations, []);
  assert.deepEqual(payload.candidates[0].sourceFileNotes, []);
  assert.deepEqual(payload.candidates[0].identityLinks, []);
});

test("source file notes persist without mutating draft fields or public read model", async () => {
  await resetWorkflowStore();
  const created = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();
  const draftPayload = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: created.candidate.id,
    })
  ).json();
  const originalFields = JSON.stringify(draftPayload.draft.fields);
  const originalUpdatedAt = created.candidate.updatedAt;

  const noteResponse = await authedPost({
    action: "addSourceFileNote",
    candidateId: created.candidate.id,
    input: {
      type: "correction",
      text: "  Correct the public-safe spelling later.  ",
      source: "admin_manual",
      publicSafe: true,
      appliesToDraftId: draftPayload.draft.id,
    },
  });
  assert.equal(noteResponse.status, 200);
  const notePayload = await noteResponse.json();
  const candidate = notePayload.candidates.find(
    (item) => item.id === created.candidate.id,
  );
  assert.equal(
    notePayload.note.text,
    "Correct the public-safe spelling later.",
  );
  assert.equal(candidate.sourceFileNotes.length, 1);
  assert.notEqual(candidate.updatedAt, originalUpdatedAt);
  assert.equal(JSON.stringify(notePayload.drafts[0].fields), originalFields);

  const getPayload = await (await authedGet()).json();
  assert.equal(getPayload.candidates[0].sourceFileNotes[0].type, "correction");
  await authedPost({
    action: "createDossierRecommendation",
    input: {
      type: "new_subject",
      subjectName: "Private Recommendation Seed",
      reason: "This admin-only recommendation must not leak publicly.",
      sourceLanes: ["admin_manual"],
    },
  });
  const publicReadModel = JSON.stringify(await (await readModel.GET()).json());
  assert.doesNotMatch(
    publicReadModel,
    /sourceFileNotes|recommendations|Correct the public-safe spelling|Private Recommendation Seed|admin_manual|doNotSay/,
  );
  assert.doesNotMatch(
    source("src/app/database/page.tsx") +
      source("src/app/database/[slug]/page.tsx"),
    /sourceFileNotes|recommendations|dossier-workflow|admin_manual/,
  );
});



test("identity links default, persist safely, and never publish", async () => {
  await resetWorkflowStore();
  const created = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Deadite Ash" },
    })
  ).json();
  const draft = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: created.candidate.id,
    })
  ).json();
  const draftFields = JSON.stringify(draft.draft.fields);

  const addResponse = await authedPost({
    action: "addDossierIdentityLink",
    candidateId: created.candidate.id,
    input: {
      label: "  ShadowsPit  ",
      type: "discord_handle",
      visibility: "internal_only",
      source: "owner_confirmed",
      note: "Internal identity link for routing future recommendations.",
      useForMatching: true,
      useInPublicDossier: true,
    },
  });
  assert.equal(addResponse.status, 200);
  const addPayload = await addResponse.json();
  assert.equal(addPayload.identityLink.label, "ShadowsPit");
  assert.equal(addPayload.identityLink.normalizedLabel, "shadowspit");
  assert.equal(addPayload.identityLink.status, "proposed");
  assert.equal(addPayload.identityLink.visibility, "internal_only");
  assert.equal(addPayload.identityLink.useForMatching, false);
  assert.equal(addPayload.identityLink.useInPublicDossier, false);
  assert.equal(JSON.stringify(addPayload.drafts[0].fields), draftFields);
  assert.equal(addPayload.drafts[0].fields.name, "Deadite Ash");
  assert.deepEqual(addPayload.drafts[0].fields.tags, manualCandidateInput.recommendedTags);

  const duplicateResponse = await authedPost({
    action: "addDossierIdentityLink",
    candidateId: created.candidate.id,
    input: { label: "shadowspit", type: "alias" },
  });
  assert.equal(duplicateResponse.status, 400);
  assert.equal((await duplicateResponse.json()).code, "duplicate_identity_link");

  const publicReadModel = JSON.stringify(await (await readModel.GET()).json());
  assert.doesNotMatch(publicReadModel, /ShadowsPit|identityLinks/);
  assert.doesNotMatch(
    normalizedSource("src/app/database/page.tsx") +
      normalizedSource("src/app/database/[slug]/page.tsx"),
    /identityLinks|ShadowsPit/,
  );
});

test("identity link review statuses control alias matching", async () => {
  await resetWorkflowStore();
  const created = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Deadite Ash" },
    })
  ).json();
  const candidateId = created.candidate.id;

  const proposed = await (
    await authedPost({
      action: "addDossierIdentityLink",
      candidateId,
      input: { label: "ShadowsPit", type: "discord_handle" },
    })
  ).json();
  const proposedMatch = workflow.matchDossierRecommendationSubject({
    recommendation: { subjectName: "ShadowsPit" },
    candidates: (await (await authedGet()).json()).candidates,
  });
  assert.equal(proposedMatch.exactCandidateId, undefined);

  const confirmed = await (
    await authedPost({
      action: "confirmDossierIdentityLink",
      candidateId,
      identityLinkId: proposed.identityLink.id,
      reviewedBy: "admin-test",
      useForMatching: true,
    })
  ).json();
  assert.equal(confirmed.identityLink.status, "confirmed");
  assert.equal(confirmed.identityLink.confidence, "confirmed");
  assert.ok(confirmed.identityLink.confirmedAt);
  assert.equal(confirmed.identityLink.useForMatching, true);

  const confirmedMatch = workflow.matchDossierRecommendationSubject({
    recommendation: { subjectName: "ShadowsPit" },
    candidates: confirmed.candidates,
  });
  assert.equal(confirmedMatch.exactCandidateId, candidateId);
  assert.equal(confirmedMatch.exactMatchKind, "confirmed_alias");
  assert.equal(confirmedMatch.aliasLabel, "ShadowsPit");
  assert.equal(confirmedMatch.reason, "Confirmed identity link / alias match.");

  const retired = await (
    await authedPost({
      action: "retireDossierIdentityLink",
      candidateId,
      identityLinkId: proposed.identityLink.id,
    })
  ).json();
  const retiredMatch = workflow.matchDossierRecommendationSubject({
    recommendation: { subjectName: "ShadowsPit" },
    candidates: retired.candidates,
  });
  assert.equal(retired.identityLink.status, "retired");
  assert.equal(retiredMatch.exactCandidateId, undefined);

  const rejectedLink = await (
    await authedPost({
      action: "addDossierIdentityLink",
      candidateId,
      input: { label: "Ash Old Name", type: "previous_name" },
    })
  ).json();
  const rejected = await (
    await authedPost({
      action: "rejectDossierIdentityLink",
      candidateId,
      identityLinkId: rejectedLink.identityLink.id,
    })
  ).json();
  const rejectedMatch = workflow.matchDossierRecommendationSubject({
    recommendation: { subjectName: "Ash Old Name" },
    candidates: rejected.candidates,
  });
  assert.equal(rejected.identityLink.status, "rejected");
  assert.equal(rejectedMatch.exactCandidateId, undefined);
});


test("identity link recommendations create proposed aliases safely", async () => {
  await resetWorkflowStore();
  const publicEntriesBefore = JSON.stringify(databasePage.entries);

  const candidatePayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Deadite Ash" },
    })
  ).json();
  const candidateId = candidatePayload.candidate.id;
  const recommendationPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "identity_link",
        subjectName: "ShadowsPit",
        targetCandidateId: candidateId,
        reason: "BNL recommends reviewing this as an identity label.",
        evidenceSummary: "Observed in admin-safe source lanes.",
        sourceLanes: ["rd_context", "broadcast_memory"],
        ingestSource: "bnl",
        createdBy: "bnl",
      },
    })
  ).json();

  const response = await authedPost({
    action: "createIdentityLinkFromRecommendation",
    recommendationId: recommendationPayload.recommendation.id,
    candidateId,
    input: {
      label: "ShadowsPit",
      note: "Review before matching.",
    },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.identityLink.label, "ShadowsPit");
  assert.equal(payload.identityLink.type, "alias");
  assert.equal(payload.identityLink.visibility, "internal_only");
  assert.equal(payload.identityLink.source, "bnl_recommendation");
  assert.equal(payload.identityLink.status, "proposed");
  assert.equal(payload.identityLink.useForMatchingAfterConfirmation, true);
  assert.equal(payload.identityLink.useForMatching, false);
  assert.equal(payload.identityLink.useInPublicDossier, false);
  assert.equal(
    payload.identityLink.createdFromRecommendationId,
    recommendationPayload.recommendation.id,
  );
  assert.equal(payload.identityLink.createdFromRecommendationSubject, "ShadowsPit");
  assert.equal(payload.recommendation.status, "identity_link_created");
  assert.equal(payload.recommendation.targetCandidateId, candidateId);
  assert.equal(payload.drafts.length, 0);
  assert.equal(payload.candidates.length, 1);
  assert.equal(JSON.stringify(databasePage.entries), publicEntriesBefore);
  assert.doesNotMatch(
    JSON.stringify(await (await readModel.GET()).json()),
    /ShadowsPit|identityLinks|identity_link_created/,
  );

  const proposedMatch = workflow.matchDossierRecommendationSubject({
    recommendation: { subjectName: "ShadowsPit" },
    candidates: payload.candidates,
  });
  assert.equal(proposedMatch.exactCandidateId, undefined);

  const staleResponse = await authedPost({
    action: "createIdentityLinkFromRecommendation",
    recommendationId: recommendationPayload.recommendation.id,
    candidateId,
    input: { label: "Shadow Pit Duplicate" },
  });
  assert.equal(staleResponse.status, 400);
  assert.equal((await staleResponse.json()).code, "recommendation_already_terminal");
});

test("identity link recommendation duplicate, invalid, and target mismatch cases fail safely", async () => {
  await resetWorkflowStore();
  const first = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Deadite Ash" },
    })
  ).json();
  const second = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Other Source File" },
    })
  ).json();
  const candidateId = first.candidate.id;

  await authedPost({
    action: "addDossierIdentityLink",
    candidateId,
    input: { label: "ShadowsPit" },
  });
  const duplicateRec = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "identity_link",
        subjectName: "ShadowsPit",
        reason: "Duplicate label should fail.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();
  const duplicateResponse = await authedPost({
    action: "createIdentityLinkFromRecommendation",
    recommendationId: duplicateRec.recommendation.id,
    candidateId,
    input: { label: "shadowspit" },
  });
  assert.equal(duplicateResponse.status, 400);
  assert.equal((await duplicateResponse.json()).code, "duplicate_identity_link");

  const invalidResponse = await authedPost({
    action: "createIdentityLinkFromRecommendation",
    recommendationId: duplicateRec.recommendation.id,
    candidateId: "missing-candidate",
    input: { label: "Missing Candidate Alias" },
  });
  assert.equal(invalidResponse.status, 404);
  assert.equal((await invalidResponse.json()).code, "candidate_not_found");

  const targeted = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "identity_link",
        subjectName: "Wrong Target Label",
        targetCandidateId: candidateId,
        reason: "Target mismatch should fail.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();
  const mismatch = await authedPost({
    action: "createIdentityLinkFromRecommendation",
    recommendationId: targeted.recommendation.id,
    candidateId: second.candidate.id,
    input: { label: "Wrong Target Label" },
  });
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).code, "recommendation_target_mismatch");
});

test("identity alias review UX is grouped, status-aware, and public-safe", () => {
  const dashboard = source("src/app/admin/dossiers/page.tsx");
  const sourceFilePage = source(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  const recommendationPage = source(
    "src/app/admin/dossiers/recommendations/[recommendationId]/page.tsx",
  );

  for (const label of ["Proposed", "Confirmed", "Rejected", "Retired"]) {
    assert.match(sourceFilePage, new RegExp(label));
  }
  for (const group of [
    "Pending Review",
    "Confirmed Aliases",
    "Closed / Inactive",
  ]) {
    assert.match(sourceFilePage, new RegExp(group));
  }
  assert.match(
    sourceFilePage,
    /This alias is waiting for review\. It will not affect matching until confirmed\./,
  );
  assert.match(
    sourceFilePage,
    /This alias is confirmed and can route future recommendations to this BNL Source File when matching is enabled\./,
  );
  assert.match(
    sourceFilePage,
    /This alias was rejected and will not be used for matching\./,
  );
  assert.match(
    sourceFilePage,
    /This alias is retired and no longer used for matching\./,
  );
  assert.match(sourceFilePage, /Active for matching/);
  assert.match(sourceFilePage, /Not used for matching/);
  assert.match(sourceFilePage, /Internal only/);
  assert.match(sourceFilePage, /Public-safe label/);
  assert.match(sourceFilePage, /Not public dossier text/);
  assert.match(
    sourceFilePage,
    /Adding an alias does not make it public and does not affect\s+matching until confirmed/,
  );
  assert.match(sourceFilePage, /Use for future matching after confirmation/);
  assert.match(sourceFilePage, /identityLink\.status === "proposed"/);
  assert.match(sourceFilePage, /identityLink\.status === "confirmed"/);
  assert.match(sourceFilePage, /identityLink\.status === "rejected" \|\| identityLink\.status === "retired"/);
  assert.match(sourceFilePage, /\{isProposed && \(/);
  assert.match(sourceFilePage, /Confirm/);
  assert.match(sourceFilePage, /Reject/);
  assert.match(sourceFilePage, /\{isConfirmed && \(/);
  assert.match(sourceFilePage, /Retire/);
  assert.match(sourceFilePage, /Created from recommendation/);
  assert.match(sourceFilePage, /Recommendation subject:/);
  assert.match(sourceFilePage, /Open recommendation/);
  assert.match(sourceFilePage, /disabled:pointer-events-none/);
  assert.match(
    sourceFilePage,
    /Identity link confirmed\. Future recommendations can now match this alias if matching is enabled; it is still not public identity proof\./,
  );
  assert.match(
    sourceFilePage,
    /Identity link rejected\. It will not be used for matching\./,
  );
  assert.match(
    sourceFilePage,
    /Identity link retired\. It is no longer active\./,
  );

  assert.match(dashboard, /Aliases: \{confirmedIdentityLinks\.length\} confirmed/);
  assert.match(dashboard, /Pending aliases: \{proposedIdentityLinks\.length\}/);
  assert.match(dashboard, /identityLink\.status === "confirmed"/);
  assert.match(dashboard, /identityLink\.status === "proposed"/);
  assert.match(dashboard, /identity_link_created/);

  assert.match(recommendationPage, /Matched by confirmed alias/);
  assert.match(recommendationPage, /Create Identity Link/);
  assert.match(recommendationPage, /Create Proposed Identity Link/);
  assert.match(recommendationPage, /Use for future matching after confirmation/);
  assert.match(recommendationPage, /Use in public dossier later after review/);
  assert.match(recommendationPage, /Proposed identity link created\. Confirm it from the BNL Source File when ready\./);
  assert.match(recommendationPage, /Target source file/);
  assert.match(
    recommendationPage,
    /This alias is used for internal routing only unless public\s+use is later approved\./,
  );
  assert.match(recommendationPage, /Possible identity review needed/);
  assert.doesNotMatch(
    recommendationPage,
    /Possible alias conflict[\s\S]*exact confirmed match/,
  );

  assert.doesNotMatch(
    source("src/app/api/bnl/read-model/route.ts") +
      source("src/app/database/page.tsx") +
      source("src/app/database/[slug]/page.tsx"),
    /identityLinks|publishDraft|automatic merge/i,
  );
});

test("confirmed alias match allows attach and blocks duplicate conversion", async () => {
  await resetWorkflowStore();
  const created = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Deadite Ash" },
    })
  ).json();
  const candidateId = created.candidate.id;
  const alias = await (
    await authedPost({
      action: "addDossierIdentityLink",
      candidateId,
      input: { label: "ShadowsPit", type: "discord_handle" },
    })
  ).json();
  await authedPost({
    action: "confirmDossierIdentityLink",
    candidateId,
    identityLinkId: alias.identityLink.id,
    useForMatching: true,
  });
  const rec = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "identity_link",
        subjectName: "ShadowsPit",
        reason: "Review identity link.",
        evidenceSummary: "ShadowsPit may be an alternate identity label.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const attachResponse = await authedPost({
    action: "attachRecommendationToCandidate",
    recommendationId: rec.recommendation.id,
    candidateId,
    createSourceNote: true,
  });
  assert.equal(attachResponse.status, 200);
  const attached = await attachResponse.json();
  assert.equal(attached.recommendation.status, "attached_to_source_file");
  assert.equal(attached.drafts.length, 0);
  assert.equal(attached.candidates.length, 1);

  const secondRec = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "identity_link",
        subjectName: "ShadowsPit",
        reason: "Exact alias match should not duplicate source file.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();
  const convertResponse = await authedPost({
    action: "convertRecommendationToCandidate",
    recommendationId: secondRec.recommendation.id,
  });
  assert.equal(convertResponse.status, 400);
  const errorPayload = await convertResponse.json();
  assert.equal(errorPayload.code, "recommendation_existing_source_file_match");
  assert.equal(errorPayload.exactMatchKind, "confirmed_alias");
});

test("unapplied source notes count after draft creation without mutating draft fields", async () => {
  await resetWorkflowStore();
  const created = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Unapplied Notes Subject" },
    })
  ).json();
  const draftPayload = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: created.candidate.id,
    })
  ).json();
  const originalFields = JSON.stringify(draftPayload.draft.fields);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const notePayload = await (
    await authedPost({
      action: "addSourceFileNote",
      candidateId: created.candidate.id,
      input: {
        type: "fact",
        text: "New public-safe fact after draft creation.",
        source: "admin_manual",
        publicSafe: true,
        appliesToDraftId: draftPayload.draft.id,
      },
    })
  ).json();
  const candidate = notePayload.candidates.find(
    (item) => item.id === created.candidate.id,
  );
  const draft = notePayload.drafts.find((item) => item.id === draftPayload.draft.id);
  const metrics = workflow.getDossierSourceFileMetrics({
    candidate,
    drafts: notePayload.drafts,
    recommendations: notePayload.recommendations,
  });
  assert.equal(metrics.unappliedSourceNotesCount, 1);
  assert.equal(metrics.unappliedSourceNotes[0].text, "New public-safe fact after draft creation.");
  assert.equal(JSON.stringify(draft.fields), originalFields);

  const dashboardCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  const sourceFileCopy = normalizedSource(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  const draftCopy = normalizedSource(
    "src/app/admin/dossiers/drafts/[draftId]/page.tsx",
  );
  assertIncludesCopy(dashboardCopy, "Unapplied notes:");
  assertIncludesCopy(dashboardCopy, "Review source updates in proposed dossier");
  assertIncludesCopy(sourceFileCopy, "This source file has new info not yet applied to the proposed dossier.");
  assertIncludesCopy(draftCopy, "BNL Source File has new notes since this draft was last updated.");
  assertIncludesCopy(draftCopy, "Draft fields are not mutated automatically when new source notes arrive.");
});

test("post-submission source note persists as admin addendum without changing submitted draft", async () => {
  await resetWorkflowStore();
  const created = await (
    await authedPost({
      action: "createManualCandidate",
      input: manualCandidateInput,
    })
  ).json();
  const draftPayload = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: created.candidate.id,
    })
  ).json();
  const fields = {
    ...draftPayload.draft.fields,
    role: "Public artist profile",
    summary: "Owner-ready summary.",
    tags: ["artist", "radio"],
  };
  await authedPost({
    action: "saveDraft",
    draftId: draftPayload.draft.id,
    fields,
  });
  const submitted = await (
    await authedPost({
      action: "submitDraftForOwnerReview",
      draftId: draftPayload.draft.id,
    })
  ).json();
  const submittedFields = JSON.stringify(submitted.draft.fields);
  const note = await (
    await authedPost({
      action: "addSourceFileNote",
      candidateId: created.candidate.id,
      input: {
        type: "owner_note",
        text: "Owner should see this addendum.",
        source: "admin_manual",
        publicSafe: false,
        appliesToDraftId: draftPayload.draft.id,
      },
    })
  ).json();
  assert.equal(
    note.candidates[0].sourceFileNotes[0].text,
    "Owner should see this addendum.",
  );
  assert.equal(
    JSON.stringify(
      note.drafts.find((draft) => draft.id === draftPayload.draft.id).fields,
    ),
    submittedFields,
  );
  const sourcePage = source(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  assert.match(sourcePage, /Admin Addendum for owner review/);
  assert.match(sourcePage, /does not overwrite the submitted draft/);
});

test("recommendations can be created manually without automatic candidate or draft creation", async () => {
  await resetWorkflowStore();
  const response = await authedPost({
    action: "createDossierRecommendation",
    input: {
      type: "new_subject",
      subjectName: "Antigrain",
      reason:
        "Recurring public/community presence and likely dossier-worthy subject.",
      evidenceSummary: "Manual seed until BNL recommendation engine exists.",
      confidence: "medium",
      sourceLanes: ["admin_manual"],
    },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recommendation.status, "new");
  assert.deepEqual(payload.recommendation.sourceLanes, ["admin_manual"]);
  assert.equal(payload.candidates.length, 0);
  assert.equal(payload.drafts.length, 0);
});

test("convert recommendation creates a BNL Source File with recommendation source notes and no draft", async () => {
  await resetWorkflowStore();
  const created = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "new_subject",
        subjectName: "Convert Seed",
        reason: "Reason to convert.",
        evidenceSummary: "Evidence to preserve.",
        confidence: "high",
        sourceLanes: ["admin_manual"],
        missingInfo: ["Confirm role"],
        publicSafetyNotes: ["Use public facts"],
        doNotSay: ["No private identity"],
        recommendedTags: ["artist"],
        recommendedCategory: "Personnel",
        recommendedKind: "community_member",
        recommendedEcosystemLane: "community",
        recommendedIdentityAuthority: "community_owned",
      },
    })
  ).json();
  const response = await authedPost({
    action: "convertRecommendationToCandidate",
    recommendationId: created.recommendation.id,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recommendation.status, "converted_to_source_file");
  assert.equal(payload.recommendation.targetCandidateId, payload.candidate.id);
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.drafts.length, 0);
  assert.equal(payload.candidate.name, "Convert Seed");
  assert.equal(payload.candidate.sourceFileNotes.length, 1);
  assert.match(payload.candidate.sourceFileNotes[0].text, /Reason to convert/);
  assert.match(
    payload.candidate.sourceFileNotes[0].text,
    /Evidence to preserve/,
  );
  assert.equal(payload.candidate.recommendedKind, "community_member");
});

test("terminal recommendations cannot be converted twice or duplicate source files", async () => {
  await resetWorkflowStore();
  const created = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "new_subject",
        subjectName: "Terminal Convert Seed",
        reason: "Convert once only.",
        evidenceSummary: "One evidence packet.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const firstResponse = await authedPost({
    action: "convertRecommendationToCandidate",
    recommendationId: created.recommendation.id,
  });
  assert.equal(firstResponse.status, 200);
  const firstPayload = await firstResponse.json();
  assert.equal(firstPayload.recommendation.status, "converted_to_source_file");
  assert.equal(
    firstPayload.recommendation.targetCandidateId,
    firstPayload.candidate.id,
  );
  assert.equal(firstPayload.candidates.length, 1);
  assert.equal(firstPayload.candidate.sourceFileNotes.length, 1);

  const retryResponse = await authedPost({
    action: "convertRecommendationToCandidate",
    recommendationId: created.recommendation.id,
  });
  assert.equal(retryResponse.status, 400);
  const retryPayload = await retryResponse.json();
  assert.equal(retryPayload.code, "recommendation_already_terminal");

  const finalPayload = await (await authedGet()).json();
  assert.equal(finalPayload.candidates.length, 1);
  assert.equal(finalPayload.candidates[0].sourceFileNotes.length, 1);
  assert.equal(
    finalPayload.recommendations[0].targetCandidateId,
    firstPayload.candidate.id,
  );
});

test("terminal recommendations cannot be attached, reattached, ignored, dismissed, or converted", async () => {
  await resetWorkflowStore();
  const candidatePayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Already Attached" },
    })
  ).json();

  async function createRecommendation(subjectName) {
    return (
      await (
        await authedPost({
          action: "createDossierRecommendation",
          input: {
            type: "new_subject",
            subjectName,
            reason: `${subjectName} reason`,
            evidenceSummary: `${subjectName} evidence`,
            sourceLanes: ["admin_manual"],
          },
        })
      ).json()
    ).recommendation;
  }

  const converted = await createRecommendation("Already Converted");
  const convertedPayload = await (
    await authedPost({
      action: "convertRecommendationToCandidate",
      recommendationId: converted.id,
    })
  ).json();
  const convertedCandidateCount = convertedPayload.candidates.length;

  const attached = await createRecommendation("Already Attached");
  const attachedPayload = await (
    await authedPost({
      action: "attachRecommendationToCandidate",
      recommendationId: attached.id,
      candidateId: candidatePayload.candidate.id,
      createSourceNote: true,
    })
  ).json();
  const attachedNoteCount = attachedPayload.candidates.find(
    (candidate) => candidate.id === candidatePayload.candidate.id,
  ).sourceFileNotes.length;

  const ignored = await createRecommendation("Already Ignored");
  await authedPost({
    action: "ignoreDossierRecommendation",
    recommendationId: ignored.id,
  });

  const dismissed = await createRecommendation("Already Dismissed");
  await authedPost({
    action: "dismissDossierRecommendation",
    recommendationId: dismissed.id,
  });

  for (const recommendation of [converted, attached, ignored, dismissed]) {
    const attachResponse = await authedPost({
      action: "attachRecommendationToCandidate",
      recommendationId: recommendation.id,
      candidateId: candidatePayload.candidate.id,
      createSourceNote: true,
    });
    assert.equal(attachResponse.status, 400);
    assert.equal(
      (await attachResponse.json()).code,
      "recommendation_already_terminal",
    );

    const convertResponse = await authedPost({
      action: "convertRecommendationToCandidate",
      recommendationId: recommendation.id,
    });
    assert.equal(convertResponse.status, 400);
    assert.equal(
      (await convertResponse.json()).code,
      "recommendation_already_terminal",
    );

    const ignoreResponse = await authedPost({
      action: "ignoreDossierRecommendation",
      recommendationId: recommendation.id,
    });
    assert.equal(ignoreResponse.status, 400);
    assert.equal(
      (await ignoreResponse.json()).code,
      "recommendation_already_terminal",
    );

    const dismissResponse = await authedPost({
      action: "dismissDossierRecommendation",
      recommendationId: recommendation.id,
    });
    assert.equal(dismissResponse.status, 400);
    assert.equal(
      (await dismissResponse.json()).code,
      "recommendation_already_terminal",
    );
  }

  const finalPayload = await (await authedGet()).json();
  assert.equal(finalPayload.candidates.length, convertedCandidateCount);
  const finalTarget = finalPayload.candidates.find(
    (candidate) => candidate.id === candidatePayload.candidate.id,
  );
  assert.equal(finalTarget.sourceFileNotes.length, attachedNoteCount);
});


test("arbitrary recommendation attach is blocked by same-subject guardrails", async () => {
  await resetWorkflowStore();
  const candidatePayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Mac Modem" },
    })
  ).json();
  const recPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "new_subject",
        subjectName: "Signal Witch",
        reason: "Signal Witch evidence should not attach to Mac Modem.",
        evidenceSummary: "Unrelated evidence cluster.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const response = await authedPost({
    action: "attachRecommendationToCandidate",
    recommendationId: recPayload.recommendation.id,
    candidateId: candidatePayload.candidate.id,
    createSourceNote: true,
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "recommendation_subject_mismatch");

  const finalPayload = await (await authedGet()).json();
  const macModem = finalPayload.candidates.find(
    (candidate) => candidate.id === candidatePayload.candidate.id,
  );
  const signalWitch = finalPayload.recommendations.find(
    (recommendation) => recommendation.id === recPayload.recommendation.id,
  );
  assert.equal(macModem.sourceFileNotes.length, 0);
  assert.ok(["new", "reviewing"].includes(signalWitch.status));
});


test("pre-targeted recommendation attaches to target source file despite alias subject", async () => {
  await resetWorkflowStore();
  const targetPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Deadite Ash" },
    })
  ).json();
  const recPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "modify_existing_dossier",
        subjectName: "ShadowsPit",
        targetCandidateId: targetPayload.candidate.id,
        reason: "Alias evidence intentionally targets Deadite Ash.",
        evidenceSummary: "Legacy/public name points to the canonical source file.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const response = await authedPost({
    action: "attachRecommendationToCandidate",
    recommendationId: recPayload.recommendation.id,
    candidateId: targetPayload.candidate.id,
    createSourceNote: true,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recommendation.status, "attached_to_source_file");
  assert.equal(payload.recommendation.targetCandidateId, targetPayload.candidate.id);
  const target = payload.candidates.find(
    (candidate) => candidate.id === targetPayload.candidate.id,
  );
  assert.equal(target.sourceFileNotes.length, 1);
  assert.match(target.sourceFileNotes[0].text, /Alias evidence intentionally/);
});

test("pre-targeted recommendation cannot attach to a different source file", async () => {
  await resetWorkflowStore();
  const targetPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Deadite Ash" },
    })
  ).json();
  const otherPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Mac Modem" },
    })
  ).json();
  const recPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "modify_existing_dossier",
        subjectName: "ShadowsPit",
        targetCandidateId: targetPayload.candidate.id,
        reason: "Targeted alias should not attach elsewhere.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const response = await authedPost({
    action: "attachRecommendationToCandidate",
    recommendationId: recPayload.recommendation.id,
    candidateId: otherPayload.candidate.id,
    createSourceNote: true,
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "recommendation_subject_mismatch");

  const finalPayload = await (await authedGet()).json();
  const other = finalPayload.candidates.find(
    (candidate) => candidate.id === otherPayload.candidate.id,
  );
  const recommendation = finalPayload.recommendations.find(
    (item) => item.id === recPayload.recommendation.id,
  );
  assert.equal(other.sourceFileNotes.length, 0);
  assert.equal(recommendation.status, "new");
});

test("pre-targeted recommendation cannot convert to duplicate source file", async () => {
  await resetWorkflowStore();
  const targetPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Deadite Ash" },
    })
  ).json();
  const recPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "modify_existing_dossier",
        subjectName: "ShadowsPit",
        targetCandidateId: targetPayload.candidate.id,
        reason: "Targeted alias should update existing source file.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const response = await authedPost({
    action: "convertRecommendationToCandidate",
    recommendationId: recPayload.recommendation.id,
  });
  assert.equal(response.status, 400);
  const errorPayload = await response.json();
  assert.equal(errorPayload.code, "recommendation_existing_source_file_match");
  assert.equal(errorPayload.exactCandidateId, targetPayload.candidate.id);
  assert.equal(errorPayload.exactMatchKind, "pre_targeted");

  const finalPayload = await (await authedGet()).json();
  assert.equal(finalPayload.candidates.length, 1);
});

test("pre-targeted recommendation target must be active", async () => {
  await resetWorkflowStore();
  const targetPayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Closed Target" },
    })
  ).json();
  await authedPost({
    action: "denyCandidate",
    candidateId: targetPayload.candidate.id,
  });
  const recPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "modify_existing_dossier",
        subjectName: "Closed Alias",
        targetCandidateId: targetPayload.candidate.id,
        reason: "Closed targets cannot receive pre-targeted evidence.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const response = await authedPost({
    action: "attachRecommendationToCandidate",
    recommendationId: recPayload.recommendation.id,
    candidateId: targetPayload.candidate.id,
    createSourceNote: true,
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "candidate_not_attachable");
});

test("convert recommendation is blocked when exact source file match exists", async () => {
  await resetWorkflowStore();
  await authedPost({
    action: "createManualCandidate",
    input: { ...manualCandidateInput, name: "Signal Witch" },
  });
  const recPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "new_subject",
        subjectName: "Signal Witch",
        reason: "Exact match should attach, not duplicate.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const response = await authedPost({
    action: "convertRecommendationToCandidate",
    recommendationId: recPayload.recommendation.id,
  });
  assert.equal(response.status, 400);
  const errorPayload = await response.json();
  assert.equal(errorPayload.code, "recommendation_existing_source_file_match");
  assert.ok(errorPayload.exactCandidateId);

  const finalPayload = await (await authedGet()).json();
  assert.equal(finalPayload.candidates.length, 1);
});

test("convert recommendation is allowed when no source file match exists", async () => {
  await resetWorkflowStore();
  const recPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "new_subject",
        subjectName: "Antigrain",
        reason: "No existing source file match.",
        evidenceSummary: "Create a new one-subject packet.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();

  const response = await authedPost({
    action: "convertRecommendationToCandidate",
    recommendationId: recPayload.recommendation.id,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.candidate.name, "Antigrain");
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.recommendation.status, "converted_to_source_file");
});

test("exact match attach recommendation to existing source file creates a source note and no draft", async () => {
  await resetWorkflowStore();
  const candidatePayload = await (
    await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Attach Seed" },
    })
  ).json();
  const recPayload = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "modify_existing_dossier",
        subjectName: "Attach Seed",
        reason: "Attach this reason.",
        evidenceSummary: "Attach this evidence.",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();
  const response = await authedPost({
    action: "attachRecommendationToCandidate",
    recommendationId: recPayload.recommendation.id,
    candidateId: candidatePayload.candidate.id,
    createSourceNote: true,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recommendation.status, "attached_to_source_file");
  assert.equal(
    payload.recommendation.targetCandidateId,
    candidatePayload.candidate.id,
  );
  assert.equal(payload.candidates[0].sourceFileNotes.length, 1);
  assert.match(
    payload.candidates[0].sourceFileNotes[0].text,
    /Attach this reason/,
  );
  assert.equal(payload.drafts.length, 0);
});

test("ignore, dismiss, and archive recommendations preserve records", async () => {
  await resetWorkflowStore();
  const first = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "new_subject",
        subjectName: "Ignore Seed",
        reason: "Ignore reason",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();
  const second = await (
    await authedPost({
      action: "createDossierRecommendation",
      input: {
        type: "new_subject",
        subjectName: "Dismiss Seed",
        reason: "Dismiss reason",
        sourceLanes: ["admin_manual"],
      },
    })
  ).json();
  const ignored = await (
    await authedPost({
      action: "ignoreDossierRecommendation",
      recommendationId: first.recommendation.id,
    })
  ).json();
  const dismissed = await (
    await authedPost({
      action: "dismissDossierRecommendation",
      recommendationId: second.recommendation.id,
    })
  ).json();
  assert.equal(ignored.recommendation.status, "ignored");
  assert.equal(dismissed.recommendation.status, "dismissed");
  const payload = await (await authedGet()).json();
  assert.equal(payload.recommendations.length, 2);
  const dashboard = source("src/app/admin/dossiers/page.tsx");
  const dashboardCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  assert.match(dashboard, /activeRecommendations/);
  assert.match(dashboard, /\["new", "reviewing"\]/);
  assert.match(dashboard, /terminalRecommendations/);
  assertIncludesCopy(dashboardCopy, "Closed / History");
  assertIncludesCopy(dashboardCopy, "closed recommendation records");
});

test("recommendation inbox and source note UI are present and bounded", () => {
  const dashboard = source("src/app/admin/dossiers/page.tsx");
  assert.match(dashboard, /Dossier Recommendation Inbox/);
  assert.match(dashboard, /Compact Dossier Recommendation Inbox summary/);
  assert.match(dashboard, /Manual Recommendation Seed/);
  assert.match(dashboard, /Create Manual Recommendation/);
  assert.match(dashboard, /Match state/);
  assert.match(dashboard, /Matched existing BNL Source File/);
  assert.match(dashboard, /Pre-targeted BNL Source File/);
  assert.match(dashboard, /Possible duplicate \/ identity warning/);
  assert.match(dashboard, /No active source file match/);
  assert.match(dashboard, /Review Recommendation/);
  assert.match(dashboard, /archiveDossierRecommendation/);
  assert.doesNotMatch(dashboard, /Attach to Existing Source File/);

  const sourceFilePage = source(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  assert.match(sourceFilePage, /Add to BNL Source File/);
  assert.match(sourceFilePage, /This adds information to this subject&apos;s BNL Source File/);
  assert.match(sourceFilePage, /This source file[\s\S]*remains one subject\/entity/);
  assert.match(sourceFilePage, /create or wait for a separate BNL recommendation/);
  assert.match(sourceFilePage, /Save Info/);
  assert.match(sourceFilePage, /Identity \/ Alias Review/);
  assert.match(sourceFilePage, /Aliases help BNL route future recommendations/);
  assert.match(sourceFilePage, /Internal aliases are not\s+public dossier text/);
  assert.match(sourceFilePage, /Add Identity Link/);
  assert.match(dashboard, /Aliases: /);
  assert.match(dashboard, /Identity warnings/);

  const draftPage = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  assert.match(draftPage, /Unapplied Source Notes/);
  assert.match(draftPage, /BNL Source File has new notes since this draft was last/);
  assert.match(draftPage, /Do not auto-apply notes to draft fields/);

  const recommendationPagePath =
    "src/app/admin/dossiers/recommendations/[recommendationId]/page.tsx";
  assert.equal(
    fs.existsSync(path.join(projectRoot, recommendationPagePath)),
    true,
  );
  const recommendationPage = source(recommendationPagePath);
  assert.match(
    recommendationPage,
    /BNL Recommendation \/ Evidence Cluster records are admin-only/,
  );
  assert.match(recommendationPage, /terminalRecommendationStatuses/);
  assert.match(recommendationPage, /Converted to BNL Source File\./);
  assert.match(recommendationPage, /Attached to matched BNL Source File\./);
  assert.match(recommendationPage, /Ignored\. This recommendation is closed\./);
  assert.match(recommendationPage, /Dismissed\. This recommendation is closed\./);
  assert.match(recommendationPage, /!isTerminal &&/);
  assert.match(recommendationPage, /Matched BNL Source File/);
  assert.match(recommendationPage, /Pre-targeted BNL Source File/);
  assert.match(recommendationPage, /This recommendation already points to an existing/);
  assert.match(recommendationPage, /Attach to Matched BNL Source File/);
  assert.match(recommendationPage, /Matched by confirmed alias/);
  assert.match(recommendationPage, /Create Identity Link/);
  assert.match(recommendationPage, /Create Proposed Identity Link/);
  assert.match(recommendationPage, /Use for future matching after confirmation/);
  assert.match(recommendationPage, /Use in public dossier later after review/);
  assert.match(recommendationPage, /Proposed identity link created\. Confirm it from the BNL Source File when ready\./);
  assert.match(recommendationPage, /This alias is used for internal routing only/);
  assert.match(recommendationPage, /Possible identity review needed/);
  assert.match(recommendationPage, /Owner\/lead identity review is required/);
  assert.doesNotMatch(recommendationPage, /Choose existing BNL Source File/);
  assert.match(recommendationPage, /Terminal recommendation actions are closed/);
  assert.doesNotMatch(
    dashboard + sourceFilePage + draftPage + recommendationPage,
    /fetch\("\/api\/bnl/,
  );
  assert.doesNotMatch(
    dashboard + sourceFilePage + draftPage + recommendationPage,
    /publishDraft/,
  );
});



test("derived Source File summary labels thin files without fake substance", () => {
  const thinCandidate = {
    id: "candidate_thin",
    name: "Thin Subject",
    candidateType: "unknown",
    source: "bnl_dynamic_candidate_discovery",
    tier: "weak_candidate",
    score: 1,
    whyNow: "",
    reason: "",
    evidenceSummary: "",
    sourceFileNotes: [],
    status: "active_source_file",
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
  };
  const summary = sourceFileSummary.createDossierSourceFileSummary({
    candidate: thinCandidate,
    drafts: [],
    recommendations: [],
  });
  assert.equal(summary.substanceLevel, "thin");
  assert.equal(summary.publicReadiness, "not_ready");
  assert.match(summary.currentRead, /still thin/);
  assert.match(summary.usefulEvidence[0], /No useful evidence/);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /ingest|source lane|evidence mapping|workflow record|bridge|metadata|payload|normalized|targetCandidateId|internal id|raw source|source qualities/i,
  );

  const usefulSummary = sourceFileSummary.createDossierSourceFileSummary({
    candidate: {
      ...thinCandidate,
      reason: "Repeated approved-channel mentions and admin notes suggest this subject needs review.",
      whyNow: "The subject has appeared repeatedly around BARCODE Radio planning notes.",
      evidenceSummary: "Approved notes mention repeated appearances and a public-safe role summary.",
      knownFacts: ["Confirmed / Strong public-safe context exists in approved notes."],
      evidenceItems: [
        {
          id: "evidence_1",
          type: "operator_note",
          label: "Approved note",
          summary: "Public-safe approved note with repeated appearances.",
          publicSafe: true,
        },
      ],
      sourceFileNotes: [
        {
          id: "note_1",
          candidateId: "candidate_thin",
          type: "fact",
          text: "Public-safe admin note with concrete context for review.",
          source: "admin_manual",
          status: "active",
          publicSafe: true,
          createdAt: "2026-05-31T00:00:00.000Z",
          updatedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
    },
    drafts: [],
    recommendations: [
      {
        id: "rec_1",
        type: "new_subject",
        subjectName: "Thin Subject",
        reason: "Repeated approved-channel references need admin review.",
        evidenceSummary: "Multiple approved notes mention the subject in the same context.",
        confidence: "medium",
        status: "new",
        createdBy: "bnl",
        sourceLanes: ["rd_context"],
        sourceTypes: [],
        targetCandidateId: "candidate_thin",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    ],
  });
  assert.match(usefulSummary.substanceLevel, /useful|strong/);
});

test("source note and recommendation actions enforce auth and validation", async () => {
  await resetWorkflowStore();
  const unauthNote = await route.POST(
    new Request("https://example.test/api/admin/dossiers", {
      method: "POST",
      body: JSON.stringify({
        action: "addSourceFileNote",
        candidateId: "x",
        input: { text: "Nope" },
      }),
    }),
  );
  assert.equal(unauthNote.status, 401);
  const unauthRecommendation = await route.POST(
    new Request("https://example.test/api/admin/dossiers", {
      method: "POST",
      body: JSON.stringify({
        action: "createDossierRecommendation",
        input: { subjectName: "Nope", reason: "Nope", type: "new_subject" },
      }),
    }),
  );
  assert.equal(unauthRecommendation.status, 401);
  assert.equal(
    (
      await authedPost({
        action: "addSourceFileNote",
        candidateId: "missing",
        input: { text: "" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await authedPost({
        action: "createDossierRecommendation",
        input: { subjectName: "", reason: "", type: "new_subject" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await authedPost({
        action: "addSourceFileNote",
        candidateId: "missing",
        input: { text: "valid" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await authedPost({
        action: "convertRecommendationToCandidate",
        recommendationId: "missing",
      })
    ).status,
    404,
  );
});

test("BNL dossier recommendation ingest requires a private token", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const missingToken = await bnlIngestRoute.POST(
    new Request("https://example.test/api/bnl/dossier-recommendations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectName: "Signal Witch", reason: "Observed." }),
    }),
  );
  assert.equal(missingToken.status, 401);

  const wrongToken = await bnlIngestPost(
    { subjectName: "Signal Witch", reason: "Observed." },
    "wrong-token",
  );
  assert.equal(wrongToken.status, 401);

  const validToken = await bnlIngestPost({
    type: "new_subject",
    subjectName: "Signal Witch",
    reason: "Signal Witch appears in multiple approved source lanes.",
    sourceLanes: ["rd_context"],
  });
  assert.equal(validToken.status, 200);
  const payload = await validToken.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.duplicate, false);
  assert.equal(payload.recommendation.createdBy, "bnl");
});

test("BNL ingest creates review-only recommendations visible to admin without candidates or drafts", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const response = await bnlIngestPost({
    type: "new_subject",
    subjectName: "Signal Witch",
    subjectKey: "signal-witch",
    reason: "Signal Witch appears in multiple approved source lanes.",
    evidenceSummary: "Mentioned in R&D and broadcast-memory context.",
    confidence: "medium",
    sourceLanes: ["rd_context", "broadcast_memory"],
    suggestedAction: "Review source file and create or update proposed dossier.",
    missingInfo: ["public link", "preferred display name"],
    publicSafetyNotes: [
      "Do not expose private Discord identity without owner approval.",
    ],
    doNotSay: [],
    recommendedTags: ["artist", "broadcast-context"],
    recommendedCategory: "Entity",
    recommendedKind: "community_member",
    recommendedEcosystemLane: "community_member",
    recommendedIdentityAuthority: "community_owned",
    ingestKey: "bnl:signal-witch:rd+broadcast:2026-05-30",
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recommendation.status, "new");
  assert.equal(payload.recommendation.createdBy, "bnl");
  assert.equal(payload.recommendation.ingestSource, "bnl");
  assert.ok(payload.recommendation.ingestedAt);
  assert.equal(payload.recommendation.ingestKey, "bnl:signal-witch:rd+broadcast:2026-05-30");

  const adminResponse = await authedGet();
  const adminPayload = await adminResponse.json();
  assert.equal(adminPayload.recommendations.length, 1);
  assert.equal(adminPayload.recommendations[0].subjectName, "Signal Witch");
  assert.deepEqual(adminPayload.candidates, []);
  assert.deepEqual(adminPayload.drafts, []);
});


test("BNL dynamic discovery creates a Candidate Intake item with provenance and no public side effects", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  const beforePublicTagCount = databasePage.entries.flatMap((entry) => entry.tags).length;

  const response = await bnlIngestPost({
    type: "new_subject",
    subjectName: "Dynamic Signal System",
    subjectKey: "dynamic-signal-system",
    reason: "BNL discovered a source-file subject from approved lanes.",
    evidenceSummary: "R&D context and broadcast memory both mention the system.",
    confidence: "high",
    sourceLanes: ["rd_context", "broadcast_memory"],
    publicSafetyNotes: ["Keep internal until reviewed."],
    missingInfo: ["Confirm public-safe label."],
    recommendedCategory: "Interface",
    recommendedKind: "system",
    recommendedEcosystemLane: "infrastructure",
    recommendedIdentityAuthority: "barcode_controlled",
    recommendedTags: ["dynamic-private-tag"],
    ingestKey: "bnl:dynamic-signal-system:2026-05-30",
    ingestSource: "bnl_dynamic_candidate_discovery",
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.autoAction, "created_candidate");
  assert.equal(payload.duplicate, false);
  assert.equal(payload.recommendation.status, "converted_to_source_file");
  assert.equal(payload.recommendation.ingestSource, "bnl_dynamic_candidate_discovery");
  assert.ok(payload.candidate.id);
  assert.equal(payload.candidate.name, "Dynamic Signal System");
  assert.equal(payload.candidate.source, "bnl_dynamic_candidate_discovery");
  assert.deepEqual(payload.candidate.sourceLanes, ["rd_context", "broadcast_memory"]);
  assert.equal(payload.candidate.ingestKey, "bnl:dynamic-signal-system:2026-05-30");
  assert.equal(payload.candidate.createdFromRecommendationId, payload.recommendation.id);
  assert.equal(payload.candidate.reason, "BNL discovered a source-file subject from approved lanes.");
  assert.equal(payload.candidate.evidenceSummary, "R&D context and broadcast memory both mention the system.");
  assert.deepEqual(payload.candidate.publicSafetyNotes, ["Keep internal until reviewed."]);
  assert.equal(payload.candidate.confidence, "high");
  assert.equal(payload.candidate.recommendedCategory, "Interface");
  assert.equal(payload.candidate.recommendedKind, "system");
  assert.equal(payload.candidate.status, "candidate_intake");
  assert.equal(payload.candidate.sourceFileNotes.length, 1);
  assert.match(payload.candidate.sourceFileNotes[0].text, /BNL dynamic discovery source lanes: rd_context, broadcast_memory/);
  assert.equal(payload.candidate.sourceFileNotes[0].ingestSource, "bnl_dynamic_candidate_discovery");

  const adminPayload = await (await authedGet()).json();
  assert.equal(adminPayload.candidates.length, 1);
  assert.equal(adminPayload.candidates[0].id, payload.candidate.id);
  assert.equal(adminPayload.recommendations.length, 1);
  assert.equal(adminPayload.drafts.length, 0);
  assert.equal(databasePage.entries.flatMap((entry) => entry.tags).length, beforePublicTagCount);
  assert.doesNotMatch(JSON.stringify(databasePage.entries), /Dynamic Signal System|dynamic-private-tag/);

  const readModelResponse = await readModel.GET(
    new Request("https://example.test/api/bnl/read-model"),
  );
  const readModelPayload = await readModelResponse.json();
  assert.doesNotMatch(JSON.stringify(readModelPayload), /Dynamic Signal System|dynamic-private-tag/);
});

test("BNL dynamic discovery dedupes by ingestKey and exact subject candidate", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const input = {
    type: "new_subject",
    subjectName: "Deduped Dynamic System",
    reason: "BNL found a system candidate.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:deduped-dynamic-system",
    ingestSource: "bnl_dynamic_candidate_discovery",
  };
  const first = await (await bnlIngestPost(input)).json();
  const second = await (await bnlIngestPost(input)).json();
  assert.equal(first.autoAction, "created_candidate");
  assert.equal(second.duplicate, true);
  assert.equal(second.recommendation.id, first.recommendation.id);

  await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: first.candidate.id,
  });

  const sameSubject = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "The Deduped Dynamic System",
    reason: "BNL found the same normalized subject under a different ingest key.",
    sourceLanes: ["broadcast_memory"],
    ingestKey: "bnl:deduped-dynamic-system:second-key",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();
  assert.equal(sameSubject.autoAction, "attached_existing");
  assert.equal(sameSubject.recommendation.status, "attached_to_source_file");
  assert.equal(sameSubject.recommendation.targetCandidateId, first.candidate.id);

  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 1);
  assert.equal(state.recommendations.length, 2);
  assert.equal(state.candidates[0].sourceFileNotes.length, 2);
  assert.equal(state.drafts.length, 0);
});

test("BNL dynamic identity and possible duplicate recommendations remain review-only", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const existing = await (await authedPost({
    action: "createManualCandidate",
    input: {
      ...manualCandidateInput,
      name: "Signal Archive",
      reason: "Existing candidate for duplicate review.",
    },
  })).json();

  const identity = await (await bnlIngestPost({
    type: "identity_link",
    subjectName: "Signal Alias",
    targetCandidateId: existing.candidate.id,
    reason: "BNL found a possible alias for review.",
    sourceLanes: ["public_discord"],
    ingestKey: "bnl:identity-link-review",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();
  assert.equal(identity.recommendation.status, "new");
  assert.equal(identity.autoAction, undefined);

  const possibleDuplicate = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Signal Archive Annex",
    reason: "BNL found a nearby source-file subject that may be a duplicate.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:possible-duplicate-review",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();
  assert.equal(possibleDuplicate.autoAction, "left_for_review");
  assert.equal(possibleDuplicate.recommendation.status, "new");
  assert.match(
    possibleDuplicate.recommendation.publicSafetyNotes.join(" "),
    /possible existing source files/,
  );

  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 1);
  assert.equal(state.drafts.length, 0);
  assert.equal(state.recommendations.length, 2);
  assert.equal(state.candidates[0].identityLinks?.length ?? 0, 0);
});



test("BNL Source Knowledge Bridge new-subject recommendations create Candidate Intake items with warnings", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const beforePublicTagCount = databasePage.entries.flatMap((entry) => entry.tags).length;

  const response = await bnlIngestPost({
    type: "new_subject",
    subjectName: "Bridge Memory Subject",
    subjectKey: "bridge-memory-subject",
    reason: "Source Knowledge Bridge found an older known subject in local stores.",
    evidenceSummary: "Older source-file knowledge mentions the subject repeatedly.",
    confidence: "medium",
    sourceLanes: ["source_blind_memory_trace", "local_knowledge_store"],
    suggestedAction: "Create an internal source file only; review before public use.",
    missingInfo: ["Confirm public-safe name."],
    publicSafetyNotes: ["source-blind memory trace", "public use requires review"],
    doNotSay: ["Do not expose internal alias material."],
    recommendedTags: ["bridge-private-tag"],
    recommendedCategory: "Entity",
    recommendedKind: "entity",
    recommendedEcosystemLane: "unknown",
    recommendedIdentityAuthority: "mixed_or_unclear",
    ingestKey: "bnl:bridge-memory-subject",
    ingestSource: "bnl_source_knowledge_bridge",
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.autoAction, "created_candidate");
  assert.equal(payload.duplicate, false);
  assert.equal(payload.recommendation.status, "converted_to_source_file");
  assert.equal(payload.recommendation.ingestSource, "bnl_source_knowledge_bridge");
  assert.deepEqual(payload.recommendation.sourceLanes, ["broadcast_memory", "admin_manual"]);
  assert.match(payload.recommendation.evidenceSummary, /Bridge source lane mapping: source_blind_memory_trace -> broadcast_memory, local_knowledge_store -> admin_manual/);
  assert.equal(payload.candidate.name, "Bridge Memory Subject");
  assert.equal(payload.candidate.source, "bnl_source_knowledge_bridge");
  assert.equal(payload.candidate.ingestSource, "bnl_source_knowledge_bridge");
  assert.equal(payload.candidate.status, "candidate_intake");
  assert.equal(payload.candidate.recommendedKind, "entity");
  assert.deepEqual(payload.candidate.sourceLanes, ["broadcast_memory", "admin_manual"]);
  assert.match(payload.candidate.publicSafetyNotes.join(" "), /Source Knowledge Bridge origin|Public use requires review|Internal\/private review required|source-blind memory trace/);
  assert.match(payload.candidate.sourceFileNotes[0].text, /BNL Source Knowledge Bridge origin/);
  assert.match(payload.candidate.sourceFileNotes[0].text, /source lanes\/types summary: broadcast_memory, admin_manual/);
  assert.match(payload.candidate.sourceFileNotes[0].text, /source-blind memory trace/);
  assert.match(payload.candidate.sourceFileNotes[0].text, /public use requires review/i);
  assert.equal(payload.candidate.sourceFileNotes[0].ingestSource, "bnl_source_knowledge_bridge");

  const adminPayload = await (await authedGet()).json();
  assert.equal(adminPayload.candidates.length, 1);
  assert.equal(adminPayload.candidates[0].id, payload.candidate.id);
  assert.equal(adminPayload.recommendations.length, 1);
  assert.equal(adminPayload.drafts.length, 0);

  const intakeProtectedPayload = await (await sourceFilesGet("?subject=Bridge%20Memory%20Subject")).json();
  assert.equal(intakeProtectedPayload.found, true);
  assert.equal(intakeProtectedPayload.sourceFile.workflowLane, "candidate_intake");
  assert.equal(intakeProtectedPayload.sourceFile.sourceFileActive, false);

  const promoted = await (await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: payload.candidate.id,
  })).json();
  assert.equal(promoted.candidate.status, "active_source_file");

  const protectedPayload = await (await sourceFilesGet("?subject=Bridge%20Memory%20Subject")).json();
  assert.equal(protectedPayload.sourceFile.source, "bnl_source_knowledge_bridge");
  assert.equal(protectedPayload.sourceFile.ingestSource, "bnl_source_knowledge_bridge");
  assert.equal(protectedPayload.sourceFile.workflowLane, "active_source_file");
  assert.equal(protectedPayload.sourceFile.sourceFileActive, true);
  assert.match(protectedPayload.sourceFile.visibility.boundaryLabel, /internal working case file; not a public dossier/);
  assert.equal(protectedPayload.sourceFile.visibility.publicUseReviewRequired, true);
  assert.match(JSON.stringify(protectedPayload.sourceFile), /Source Knowledge Bridge origin|public use requires review|source-blind memory trace/);

  const publicReadModelPayload = await (await readModel.GET(
    new Request("https://example.test/api/bnl/read-model"),
  )).json();
  assert.equal(databasePage.entries.flatMap((entry) => entry.tags).length, beforePublicTagCount);
  assert.doesNotMatch(JSON.stringify(publicReadModelPayload), /Bridge Memory Subject|bridge-private-tag|Source Knowledge Bridge/);
});

test("BNL Source Knowledge Bridge attach, duplicate, possible-match, and identity recommendations stay bounded", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const first = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Bridge Deduped Subject",
    reason: "Bridge found an older known subject.",
    sourceLanes: ["broadcast_memory"],
    publicSafetyNotes: ["source-blind memory trace"],
    ingestKey: "bnl:bridge-deduped-subject",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();
  assert.equal(first.autoAction, "created_candidate");

  const duplicate = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Bridge Deduped Subject",
    reason: "Bridge found an older known subject.",
    sourceLanes: ["broadcast_memory"],
    ingestKey: "bnl:bridge-deduped-subject",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.recommendation.id, first.recommendation.id);

  await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: first.candidate.id,
  });

  const sameSubject = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "The Bridge Deduped Subject",
    reason: "Bridge found the same subject under a separate ingest key.",
    sourceLanes: ["local_source_file"],
    ingestKey: "bnl:bridge-deduped-subject:second",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();
  assert.equal(sameSubject.autoAction, "attached_existing");
  assert.equal(sameSubject.recommendation.status, "attached_to_source_file");
  assert.equal(sameSubject.recommendation.targetCandidateId, first.candidate.id);

  const possible = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Bridge Deduped Subject Annex",
    reason: "Bridge found a nearby source-file subject that may be a duplicate.",
    sourceLanes: ["local_knowledge_store"],
    ingestKey: "bnl:bridge-possible-duplicate",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();
  assert.equal(possible.autoAction, "left_for_review");
  assert.equal(possible.recommendation.status, "new");
  assert.match(possible.recommendation.publicSafetyNotes.join(" "), /possible existing source files/);

  const identity = await (await bnlIngestPost({
    type: "identity_link",
    subjectName: "Bridge Alias",
    targetCandidateId: first.candidate.id,
    reason: "Bridge found a possible alias for review only.",
    sourceLanes: ["source_blind_memory_trace"],
    ingestKey: "bnl:bridge-identity-review",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();
  assert.equal(identity.recommendation.status, "new");
  assert.equal(identity.autoAction, undefined);

  const connection = await (await bnlIngestPost({
    type: "possible_connection_review",
    subjectName: "Bridge Connection",
    reason: "Bridge found a possible connection for human review only.",
    sourceLanes: ["local_knowledge_store"],
    ingestKey: "bnl:bridge-connection-review",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();
  assert.equal(connection.recommendation.status, "new");
  assert.equal(connection.autoAction, undefined);

  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 1);
  assert.equal(state.drafts.length, 0);
  assert.equal(state.recommendations.length, 5);
  assert.equal(state.candidates[0].sourceFileNotes.length, 2);
  assert.equal(state.candidates[0].identityLinks?.length ?? 0, 0);
});



test("active source file cleanup controls archive, restore, and delete without public data mutation", async () => {
  await resetWorkflowStore();
  const publicDossierBefore = JSON.stringify(databasePage.entries);
  const publicReadModelBefore = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();

  const created = await (await authedPost({
    action: "createManualCandidate",
    input: {
      ...manualCandidateInput,
      name: "Active Cleanup Source",
      reason: "Operator needs to clean an active source file.",
    },
  })).json();

  const promoted = await (await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: created.candidate.id,
  })).json();
  assert.equal(promoted.candidate.status, "active_source_file");

  const draft = await (await authedPost({
    action: "createDraftFromCandidate",
    candidateId: created.candidate.id,
  })).json();
  assert.equal(draft.draft.candidateId, created.candidate.id);

  const activeRead = await (await sourceFilesGet("?subject=Active%20Cleanup%20Source")).json();
  assert.equal(activeRead.found, true);

  const archived = await (await authedPost({
    action: "archiveCandidate",
    candidateId: created.candidate.id,
  })).json();
  assert.equal(archived.candidate.status, "archived");
  assert.equal(
    archived.candidates.some((candidate) =>
      candidate.id === created.candidate.id && candidate.status === "active_source_file",
    ),
    false,
  );
  assert.equal(
    archived.candidates.some((candidate) =>
      candidate.id === created.candidate.id && candidate.status === "archived",
    ),
    true,
  );
  const archivedRead = await (await sourceFilesGet("?subject=Active%20Cleanup%20Source")).json();
  assert.equal(archivedRead.found, false);

  const restored = await (await authedPost({
    action: "restoreCandidate",
    candidateId: created.candidate.id,
  })).json();
  assert.equal(restored.candidate.status, "candidate_intake");

  const blockedDelete = await authedPost({
    action: "permanentlyDeleteCandidate",
    candidateId: created.candidate.id,
    confirmation: "DELETE",
  });
  assert.equal(blockedDelete.status, 400);
  assert.equal(
    (await store.getDossierWorkflowState()).candidates.some(
      (candidate) => candidate.id === created.candidate.id,
    ),
    true,
  );

  const deleted = await (await authedPost({
    action: "permanentlyDeleteCandidate",
    candidateId: created.candidate.id,
    confirmation: "DELETE SOURCE FILE",
  })).json();
  assert.equal(deleted.deletion.deleted, true);
  assert.equal(
    deleted.candidates.some((candidate) => candidate.id === created.candidate.id),
    false,
  );
  assert.equal(
    deleted.drafts.some((item) => item.candidateId === created.candidate.id),
    false,
  );

  const publicReadModelAfter = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
  assert.equal(JSON.stringify(databasePage.entries), publicDossierBefore);
  assert.deepEqual(publicReadModelAfter.sections.dossiers, publicReadModelBefore.sections.dossiers);
});

test("Candidate Intake promotion, archive/restore, and protected delete keep source warnings bounded", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";

  const intake = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Cleanup Intake Subject",
    reason: "BNL found a cleanup candidate.",
    evidenceSummary: "Bridge evidence should survive promotion.",
    sourceLanes: ["rd_context"],
    publicSafetyNotes: ["source warning survives"],
    doNotSay: ["do not publish raw alias"],
    missingInfo: ["confirm public-safe details"],
    ingestKey: "bnl:cleanup-intake-subject",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();

  assert.equal(intake.candidate.status, "candidate_intake");
  assert.equal((await sourceFilesGet("?subject=Cleanup%20Intake%20Subject")).status, 200);
  const intakeRead = await (await sourceFilesGet("?subject=Cleanup%20Intake%20Subject")).json();
  assert.equal(intakeRead.found, true);
  assert.equal(intakeRead.sourceFile.workflowLane, "candidate_intake");
  assert.equal(intakeRead.sourceFile.sourceFileActive, false);

  const promoted = await (await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: intake.candidate.id,
  })).json();
  assert.equal(promoted.candidate.status, "active_source_file");
  assert.deepEqual(promoted.candidate.publicSafetyNotes, intake.candidate.publicSafetyNotes);
  assert.deepEqual(promoted.candidate.doNotSay, intake.candidate.doNotSay);
  assert.deepEqual(promoted.candidate.missingInfo, intake.candidate.missingInfo);
  assert.equal(promoted.candidate.ingestKey, intake.candidate.ingestKey);
  assert.equal(promoted.candidate.sourceFileNotes[0].ingestSource, "bnl_dynamic_candidate_discovery");

  const activeRead = await (await sourceFilesGet("?subject=Cleanup%20Intake%20Subject")).json();
  assert.equal(activeRead.found, true);
  assert.equal(activeRead.sourceFile.workflowLane, "active_source_file");

  const archived = await (await authedPost({
    action: "archiveCandidate",
    candidateId: intake.candidate.id,
  })).json();
  assert.equal(archived.candidate.status, "archived");
  const archivedRead = await (await sourceFilesGet("?subject=Cleanup%20Intake%20Subject")).json();
  assert.equal(archivedRead.found, false);

  const restore = await (await authedPost({
    action: "restoreCandidate",
    candidateId: intake.candidate.id,
  })).json();
  assert.equal(restore.candidate.status, "candidate_intake");

  const blockedDelete = await authedPost({
    action: "permanentlyDeleteCandidate",
    candidateId: intake.candidate.id,
    confirmation: "delete",
  });
  assert.equal(blockedDelete.status, 400);

  const deleted = await (await authedPost({
    action: "permanentlyDeleteCandidate",
    candidateId: intake.candidate.id,
    confirmation: "DELETE SOURCE FILE",
  })).json();
  assert.equal(deleted.deletion.deleted, true);
  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 0);
});

test("exact existing public dossier matches route to Existing Dossier Update without editing public content", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  const before = JSON.stringify(databasePage.entries.find((entry) => entry.name === "6 Bit"));

  const payload = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "6 Bit",
    reason: "BNL found enrichment material for an existing public dossier.",
    evidenceSummary: "New internal source note only.",
    sourceLanes: ["website_dossier", "rd_context"],
    ingestKey: "bnl:existing-dossier-6-bit-update",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();

  assert.equal(payload.autoAction, "left_for_review");
  assert.equal(payload.candidate.status, "existing_dossier_update");
  assert.equal(payload.candidate.existingDossierMatch.name, "6 Bit");
  assert.match(payload.recommendation.publicSafetyNotes.join(" "), /Existing Dossier Update/);
  assert.equal(JSON.stringify(databasePage.entries.find((entry) => entry.name === "6 Bit")), before);

  const adminPayload = await (await authedGet()).json();
  assert.equal(adminPayload.candidates[0].status, "existing_dossier_update");
  assert.equal(adminPayload.drafts.length, 0);
});

test("active Source File with an existing public dossier match reclassifies to Existing Dossier Update safely", async () => {
  await resetWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const publicBefore = JSON.stringify(databasePage.entries.find((entry) => entry.name === "Mac Modem"));

  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  const created = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Mac Modem",
    reason: "Existing public dossier has enrichment material to review.",
    evidenceSummary: "Existing public dossier enrichment evidence.",
    sourceLanes: ["website_dossier", "rd_context"],
    missingInfo: ["Confirm whether this belongs in the public dossier."],
    doNotSay: ["Do not publish internal modem lore note."],
    publicSafetyNotes: ["Owner approval required before public copy changes."],
    ingestKey: "bnl:mac-modem-existing-update",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();
  assert.equal(created.candidate.existingDossierMatch.name, "Mac Modem");

  const promoted = await (await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: created.candidate.id,
  })).json();
  assert.equal(promoted.candidate.status, "active_source_file");

  await (await authedPost({
    action: "addSourceFileNote",
    candidateId: created.candidate.id,
    input: {
      type: "correction",
      text: "Preserve this enrichment note during reclassification.",
      source: "bnl_recommendation",
      publicSafe: false,
    },
  })).json();

  const activeRead = await (await sourceFilesGet(`?subject=${encodeURIComponent("Mac Modem")}`)).json();
  assert.equal(activeRead.found, true);
  assert.equal(activeRead.sourceFile.workflowLane, "active_source_file");
  assert.equal(activeRead.sourceFile.sourceFileActive, true);

  const reclassified = await (await authedPost({
    action: "markCandidateAsExistingDossierUpdate",
    candidateId: created.candidate.id,
  })).json();
  assert.equal(reclassified.candidate.status, "existing_dossier_update");
  assert.equal(reclassified.candidate.existingDossierMatch.name, "Mac Modem");
  assert.equal(reclassified.candidate.ingestKey, "bnl:mac-modem-existing-update");
  assert.equal(reclassified.candidate.ingestSource, "bnl_source_knowledge_bridge");
  assert.deepEqual(reclassified.candidate.missingInfo, ["Confirm whether this belongs in the public dossier."]);
  assert.deepEqual(reclassified.candidate.doNotSay, ["Do not publish internal modem lore note."]);
  assert.ok(reclassified.candidate.publicSafetyNotes.includes("Owner approval required before public copy changes."));
  assert.match(reclassified.candidate.publicSafetyNotes.join(" "), /Source Knowledge Bridge origin|Public use requires review/);
  assert.match(JSON.stringify(reclassified.candidate.sourceFileNotes), /Preserve this enrichment note/);
  assert.equal(JSON.stringify(databasePage.entries.find((entry) => entry.name === "Mac Modem")), publicBefore);

  const adminPayload = await (await authedGet()).json();
  const updateLaneCandidate = adminPayload.candidates.find((candidate) => candidate.id === created.candidate.id);
  assert.equal(updateLaneCandidate.status, "existing_dossier_update");
  assert.equal(updateLaneCandidate.existingDossierMatch.name, "Mac Modem");

  const subjectRead = await (await sourceFilesGet(`?subject=${encodeURIComponent("Mac Modem")}`)).json();
  assert.equal(subjectRead.found, true);
  assert.equal(subjectRead.matchKind, "existing_dossier_update_name");
  assert.equal(subjectRead.sourceFile.workflowLane, "existing_dossier_update");
  assert.equal(subjectRead.sourceFile.sourceFileActive, false);

  const candidateRead = await (await sourceFilesGet(`?candidateId=${encodeURIComponent(created.candidate.id)}`)).json();
  assert.equal(candidateRead.found, true);
  assert.equal(candidateRead.sourceFile.workflowLane, "existing_dossier_update");
  assert.equal(candidateRead.sourceFile.sourceFileActive, false);
  assert.match(candidateRead.sourceFile.laneDescription, /Existing Dossier Update \/ Enrichment material/);
  assert.equal(candidateRead.sourceFile.duplicateWarnings.existingDossierMatch.name, "Mac Modem");

  const publicReadModelPayload = await (await readModel.GET(
    new Request("https://example.test/api/bnl/read-model"),
  )).json();
  assert.doesNotMatch(JSON.stringify(publicReadModelPayload), /Preserve this enrichment note|bnl:mac-modem-existing-update|Existing public dossier enrichment evidence/);

  const archived = await (await authedPost({
    action: "archiveCandidate",
    candidateId: created.candidate.id,
  })).json();
  assert.equal(archived.candidate.status, "archived");

  const restoredActive = await (await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: created.candidate.id,
  })).json();
  assert.equal(restoredActive.candidate.status, "active_source_file");
  assert.equal(restoredActive.candidate.existingDossierMatch.name, "Mac Modem");
});

test("BNL ingest dedupes active recommendations by ingestKey and fallback comparison", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const input = {
    type: "new_subject",
    subjectName: "Duplicate Signal",
    reason: "The same recommendation should not be stored twice.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:duplicate-signal:2026-05-30",
  };
  const first = await (await bnlIngestPost(input)).json();
  const second = await (await bnlIngestPost(input)).json();
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.recommendation.id, first.recommendation.id);

  const fallbackInput = {
    type: "new_subject",
    subjectName: "Fallback Signal",
    reason: "Normalize this reason for duplicate checking.",
    sourceLanes: ["broadcast_memory", "rd_context"],
  };
  const fallbackFirst = await (await bnlIngestPost(fallbackInput)).json();
  const fallbackSecond = await (await bnlIngestPost({
    ...fallbackInput,
    sourceLanes: ["rd_context", "broadcast_memory"],
  })).json();
  assert.equal(fallbackFirst.duplicate, false);
  assert.equal(fallbackSecond.duplicate, true);

  const state = await store.getDossierWorkflowState();
  assert.equal(state.recommendations.length, 2);
});

test("BNL ingest rejects missing fields, invalid taxonomy, invalid lanes, and empty payloads", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  assert.equal((await bnlIngestPost({ reason: "Missing subject" })).status, 400);
  assert.equal((await bnlIngestPost({ subjectName: "Missing reason" })).status, 400);
  assert.equal((await bnlIngestPost({})).status, 400);
  assert.equal(
    (
      await bnlIngestPost({
        subjectName: "Bad Taxonomy",
        reason: "Invalid taxonomy should fail.",
        recommendedKind: "not_a_kind",
        sourceLanes: ["rd_context"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await bnlIngestPost({
        subjectName: "Bad Lane",
        reason: "Invalid source lane should fail.",
        sourceLanes: ["private_dm"],
      })
    ).status,
    400,
  );
});

test("BNL targeted ingest stores active targetCandidateId without attaching or mutating source files", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const candidateResponse = await authedPost({
    action: "createManualCandidate",
    input: manualCandidateInput,
  });
  const candidatePayload = await candidateResponse.json();
  const candidateId = candidatePayload.candidate.id;

  const beforeState = await store.getDossierWorkflowState();
  const response = await bnlIngestPost({
    type: "new_subject",
    subjectName: candidatePayload.candidate.name,
    targetCandidateId: candidateId,
    reason: "BNL found additional evidence for this source file.",
    sourceLanes: ["rd_context"],
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recommendation.targetCandidateId, candidateId);
  assert.equal(payload.recommendation.status, "new");

  const afterState = await store.getDossierWorkflowState();
  assert.equal(afterState.candidates.length, beforeState.candidates.length);
  assert.equal(afterState.drafts.length, 0);
  assert.equal(afterState.candidates[0].sourceFileNotes.length, beforeState.candidates[0].sourceFileNotes.length);

  const invalidTarget = await bnlIngestPost({
    subjectName: "Missing Target",
    targetCandidateId: "not-a-candidate",
    reason: "Invalid target should fail.",
    sourceLanes: ["rd_context"],
  });
  assert.equal(invalidTarget.status, 404);

  await authedPost({ action: "denyCandidate", candidateId });
  const deniedTarget = await bnlIngestPost({
    subjectName: candidatePayload.candidate.name,
    targetCandidateId: candidateId,
    reason: "Denied target should fail.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:denied-target",
  });
  assert.equal(deniedTarget.status, 400);
});

test("BNL-ingested recommendations stay out of public read model and database pages", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  await bnlIngestPost({
    type: "new_subject",
    subjectName: "Private Ingest Signal",
    reason: "This admin-only recommendation must not leak publicly.",
    sourceLanes: ["rd_context"],
    publicSafetyNotes: ["Keep private until owner approval."],
    recommendedTags: ["brand-new-private-tag"],
  });

  const readModelResponse = await readModel.GET(
    new Request("https://example.test/api/bnl/read-model"),
  );
  const readModelPayload = await readModelResponse.json();
  assert.doesNotMatch(
    JSON.stringify(readModelPayload),
    /Private Ingest Signal|brand-new-private-tag|recommendations|sourceFileNotes|identityLinks/,
  );

  assert.doesNotMatch(
    normalizedSource("src/app/database/page.tsx"),
    /sourceFileNotes|recommendations|identityLinks|Private Ingest Signal|brand-new-private-tag/,
  );
  assert.doesNotMatch(
    normalizedSource("src/app/database/[slug]/page.tsx"),
    /sourceFileNotes|recommendations|identityLinks|Private Ingest Signal|brand-new-private-tag/,
  );
});

test("BNL Source File enrichment preserves provenance and attaches to an active Source File without public side effects", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const beforePublic = JSON.stringify(databasePage.entries);

  const intake = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Enrichment Active Subject",
    reason: "BNL dynamic discovery found the active subject.",
    evidenceSummary: "Starter evidence.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:enrichment-active-subject:discovery",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();
  const promoted = await (await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: intake.candidate.id,
  })).json();
  assert.equal(promoted.candidate.status, "active_source_file");

  const response = await bnlIngestPost({
    type: "modify_existing_dossier",
    subjectName: "Enrichment Active Subject",
    targetCandidateId: intake.candidate.id,
    reason: "BNL generated source-file enrichment for review.",
    evidenceSummary: {
      observedFacts: ["Active source enrichment fact."],
      warnings: ["Needs owner review."],
      missingInfo: ["Confirm public-safe source."],
      doNotSay: ["Do not publish internal language."],
    },
    confidence: "medium",
    sourceLanes: ["active_source_file", "rd_knowledge_store"],
    sourceTypes: ["source_file_note", "public_safety_note"],
    missingInfo: ["Confirm public-safe source."],
    publicSafetyNotes: ["Review-only; not public copy."],
    doNotSay: ["Do not publish internal language."],
    ingestKey: "bnl:enrichment-active-subject:enrichment",
    ingestSource: "bnl_source_file_enrichment",
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.autoAction, "attached_existing");
  assert.equal(payload.candidate, undefined);
  assert.equal(payload.recommendation.ingestSource, "bnl_source_file_enrichment");
  assert.equal(payload.recommendation.ingestKey, "bnl:enrichment-active-subject:enrichment");
  assert.equal(payload.recommendation.status, "attached_to_source_file");
  assert.equal(payload.recommendation.targetCandidateId, intake.candidate.id);
  assert.deepEqual(payload.recommendation.sourceLanes, ["admin_manual", "rd_context"]);
  assert.deepEqual(payload.recommendation.sourceTypes, ["source_file_note", "public_safety_note"]);
  assert.match(payload.recommendation.evidenceSummary, /observedFacts/);
  assert.deepEqual(payload.recommendation.missingInfo, ["Confirm public-safe source."]);
  assert.deepEqual(payload.recommendation.doNotSay, ["Do not publish internal language."]);
  assert.deepEqual(payload.recommendation.publicSafetyNotes.slice(0, 1), ["Review-only; not public copy."]);
  assert.match(payload.recommendation.publicSafetyNotes.join(" "), /Active BNL Source File/);

  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 1);
  const active = state.candidates[0];
  assert.equal(active.status, "active_source_file");
  assert.equal(active.sourceFileNotes[0].ingestSource, "bnl_source_file_enrichment");
  assert.equal(active.sourceFileNotes[0].ingestKey, "bnl:enrichment-active-subject:enrichment");
  assert.equal(active.sourceFileNotes[0].publicSafe, false);
  assert.match(active.sourceFileNotes[0].text, /BNL Source File Enrichment/);
  assert.match(active.sourceFileNotes[0].text, /source_file_note, public_safety_note/);
  assert.equal(state.drafts.length, 0);

  const protectedPayload = await (await sourceFilesGet("?candidateId=" + encodeURIComponent(intake.candidate.id))).json();
  assert.equal(protectedPayload.found, true);
  assert.equal(protectedPayload.sourceFile.sourceFileNotes[0].ingestSource, "bnl_source_file_enrichment");
  assert.equal(protectedPayload.sourceFile.attachedRecommendations[0].ingestSource, "bnl_source_file_enrichment");
  assert.deepEqual(protectedPayload.sourceFile.attachedRecommendations[0].sourceTypes, ["source_file_note", "public_safety_note"]);
  assert.equal(protectedPayload.sourceFile.visibility.publicUse, false);
  assert.equal(protectedPayload.sourceFile.visibility.publicUseReviewRequired, true);

  const publicPayload = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
  assert.equal(JSON.stringify(databasePage.entries), beforePublic);
  assert.doesNotMatch(JSON.stringify(publicPayload), /Enrichment Active Subject|bnl_source_file_enrichment|source_file_note/);
});

test("BNL Source File enrichment attaches to Candidate Intake and Existing Dossier Update without promotion or public edits", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  const beforePublic = JSON.stringify(databasePage.entries.find((entry) => entry.name === "6 Bit"));

  const intake = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Enrichment Intake Subject",
    reason: "BNL discovered an intake subject.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:enrichment-intake-subject:discovery",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();
  assert.equal(intake.candidate.status, "candidate_intake");

  const intakeEnrichment = await (await bnlIngestPost({
    type: "modify_existing_dossier",
    subjectName: "Enrichment Intake Subject",
    targetCandidateId: intake.candidate.id,
    reason: "BNL generated intake enrichment for review.",
    evidenceSummary: "Candidate Intake enrichment only.",
    sourceLanes: ["candidate_intake"],
    sourceTypes: ["intake_enrichment"],
    ingestKey: "bnl:enrichment-intake-subject:enrichment",
    ingestSource: "bnl_source_file_enrichment",
  })).json();
  assert.equal(intakeEnrichment.autoAction, "attached_existing");
  assert.equal(intakeEnrichment.recommendation.status, "attached_to_candidate_intake");
  assert.equal(intakeEnrichment.recommendation.ingestSource, "bnl_source_file_enrichment");
  let state = await store.getDossierWorkflowState();
  let intakeCandidate = state.candidates.find((candidate) => candidate.id === intake.candidate.id);
  assert.equal(intakeCandidate.status, "candidate_intake");
  assert.equal(intakeCandidate.sourceFileNotes[0].ingestSource, "bnl_source_file_enrichment");

  const existingUpdate = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "6 Bit",
    reason: "Bridge found an existing public dossier update lane.",
    sourceLanes: ["website_dossier"],
    ingestKey: "bnl:enrichment-existing-update:bridge",
    ingestSource: "bnl_source_knowledge_bridge",
  })).json();
  assert.equal(existingUpdate.candidate.status, "existing_dossier_update");

  const updateEnrichment = await (await bnlIngestPost({
    type: "modify_existing_dossier",
    subjectName: "6 Bit",
    targetCandidateId: existingUpdate.candidate.id,
    reason: "BNL generated existing dossier update enrichment.",
    evidenceSummary: "Existing Dossier Update enrichment only.",
    sourceLanes: ["existing_dossier_update"],
    sourceTypes: ["existing_dossier_update_note"],
    ingestKey: "bnl:enrichment-existing-update:enrichment",
    ingestSource: "bnl_source_file_enrichment",
  })).json();
  assert.equal(updateEnrichment.autoAction, "attached_existing");
  assert.equal(updateEnrichment.recommendation.status, "attached_to_existing_dossier_update");
  state = await store.getDossierWorkflowState();
  const updateCandidate = state.candidates.find((candidate) => candidate.id === existingUpdate.candidate.id);
  assert.equal(updateCandidate.status, "existing_dossier_update");
  assert.equal(updateCandidate.sourceFileNotes[0].ingestSource, "bnl_source_file_enrichment");
  assert.equal(JSON.stringify(databasePage.entries.find((entry) => entry.name === "6 Bit")), beforePublic);
  assert.equal(state.drafts.length, 0);
});

test("BNL Source File enrichment without target remains in inbox and cannot convert to a new candidate", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const payload = await (await bnlIngestPost({
    type: "modify_existing_dossier",
    subjectName: "Untargeted Enrichment Subject",
    reason: "BNL generated enrichment without a safe target.",
    evidenceSummary: "Review-only enrichment should not create intake.",
    sourceLanes: ["source_file_enrichment"],
    sourceTypes: ["untargeted_enrichment"],
    missingInfo: ["Resolve exact target."],
    publicSafetyNotes: ["Owner/admin review required."],
    doNotSay: ["Do not create public copy."],
    ingestKey: "bnl:untargeted-enrichment",
    ingestSource: "bnl_source_file_enrichment",
  })).json();

  assert.equal(payload.autoAction, "left_for_review");
  assert.equal(payload.candidate, undefined);
  assert.equal(payload.recommendation.status, "new");
  assert.equal(payload.recommendation.ingestSource, "bnl_source_file_enrichment");
  assert.deepEqual(payload.recommendation.sourceLanes, ["admin_manual"]);
  assert.deepEqual(payload.recommendation.sourceTypes, ["untargeted_enrichment"]);
  assert.match(payload.recommendation.publicSafetyNotes.join(" "), /left in Recommendation Inbox/);

  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 0);
  assert.equal(state.drafts.length, 0);
  assert.equal(state.recommendations.length, 1);

  const convertResponse = await authedPost({
    action: "convertRecommendationToCandidate",
    recommendationId: payload.recommendation.id,
  });
  assert.equal(convertResponse.status, 400);
  assert.equal((await convertResponse.json()).code, "enrichment_cannot_create_candidate");
});

test("admin dossier UI labels BNL Source File enrichment separately from bridge and discovery", () => {
  const dashboard = source("src/app/admin/dossiers/page.tsx");
  const recommendationPage = source("src/app/admin/dossiers/recommendations/[recommendationId]/page.tsx");
  const candidatePage = `${source("src/app/admin/dossiers/candidates/[candidateId]/page.tsx")} ${source("src/lib/dossier-note-display.ts")}`;

  assert.match(dashboard, /BNL review addendum|Known from BNL records \/ review addendum/);
  assert.match(recommendationPage, /BNL Review Addendum|BNL review addendum/);
  assert.match(recommendationPage, /not candidate discovery/);
  assert.doesNotMatch(recommendationPage, /raw bridge intake/);
  assert.match(recommendationPage, /Owner\/admin review[\s\S]*required before any public use/);
  assert.match(candidatePage, /BNL Review Addendum/);
  assert.match(candidatePage, /Internal working material|Review-only enrichment/);
});

test("source file meaning filter hides backend terms from main views while preserving audit details", () => {
  const note = {
    type: "general_note",
    text: [
      "Evidence summary: user_profiles/local_profile_observed",
      "Evidence summary: user_profiles/local_profile_observed",
      "Source lane mapping: relationship_journal -> unknown",
      "Public safety: private_review_required",
      "Public safety: public_use_not_allowed_until_review",
    ].join("\n"),
    source: "bnl_recommendation",
    status: "active",
    publicSafe: false,
    createdAt: "2026-05-31T00:00:00.000Z",
    ingestSource: "bnl_source_knowledge_bridge",
    ingestKey: "bnl:test:candidate_id_123456789",
  };

  const view = noteDisplay.createHumanReadableSourceFileNoteView(note);
  const mainText = JSON.stringify({ summary: view.summary, sections: view.sections });
  assert.doesNotMatch(mainText, /user_profiles|local_profile_observed|relationship_journal|unknown -> unknown|private_review_required|public_use_not_allowed_until_review|source lane/i);
  assert.match(mainText, /BNL has a local profile match for this subject/);
  assert.match(mainText, /This needs internal review before public use|Do not use publicly until owner\/admin review/);
  assert.equal(
    (mainText.match(/BNL has a local profile match for this subject/g) ?? []).length,
    1,
  );
  assert.match(JSON.stringify(view.rawMetadata), /source lane|relationship_journal|unknown/i);
  assert.match(view.rawText, /user_profiles\/local_profile_observed/);
});

test("source file summary suppresses fake patterns, shows thin warning, and prefers operator summary", () => {
  const baseCandidate = {
    id: "candidate_summary_filter",
    name: "Melanie Heart",
    candidateType: "unknown",
    source: "bnl_source_knowledge_bridge",
    tier: "review_candidate",
    score: 1,
    whyNow: "source lane mapping relationship_journal -> unknown",
    reason: "user_profiles/local_profile_observed conversations/public_discord_observed",
    evidenceSummary: "relationship_journal -> unknown",
    publicSafetyNotes: ["private_review_required", "private_review_required"],
    doNotSay: ["public_use_not_allowed_until_review"],
    sourceFileNotes: [
      {
        id: "note_backend_only",
        candidateId: "candidate_summary_filter",
        type: "general_note",
        text: "Evidence summary: user_profiles/local_profile_observed",
        source: "bnl_recommendation",
        status: "active",
        publicSafe: false,
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    ],
    status: "active_source_file",
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
  };

  const thin = sourceFileSummary.createDossierSourceFileSummary({ candidate: baseCandidate });
  const thinMain = JSON.stringify(thin);
  assert.equal(thin.summarySource, "thin");
  assert.match(thin.currentRead, /This file is still thin/);
  assert.deepEqual(thin.patterns, ["No meaningful pattern has been extracted yet."]);
  assert.doesNotMatch(thinMain, /user_profiles|local_profile_observed|relationship_journal|private_review_required|public_use_not_allowed_until_review|unknown -> unknown/);

  const operator = sourceFileSummary.createDossierSourceFileSummary({
    candidate: {
      ...baseCandidate,
      sourceFileSummary: {
        summaryText: "Operator says Melanie Heart has repeat community context to review.",
        knownContext: ["Appears across repeated community review notes."],
        openQuestions: ["Confirm what is public-safe before drafting."],
        nextAction: "Ask an owner to review the context before drafting.",
        updatedAt: "2026-05-31T01:00:00.000Z",
        updatedBy: "admin",
      },
    },
  });
  assert.equal(operator.summarySource, "operator");
  assert.equal(
    operator.currentRead,
    "Operator says Melanie Heart has repeat community context to review.",
  );
  assert.deepEqual(operator.knownContext, ["Appears across repeated community review notes."]);

  const shortOperator = sourceFileSummary.createDossierSourceFileSummary({
    candidate: {
      ...baseCandidate,
      sourceFileSummary: {
        summaryText: "Archive",
        knownContext: ["Ask owner", "Ask owner"],
        openQuestions: ["Needs review"],
        nextAction: "Enrich",
        updatedAt: "2026-05-31T01:00:00.000Z",
        updatedBy: "admin",
      },
    },
  });
  assert.equal(shortOperator.summarySource, "operator");
  assert.equal(shortOperator.currentRead, "Archive");
  assert.deepEqual(shortOperator.knownContext, ["Ask owner"]);
  assert.deepEqual(shortOperator.missingInfo, ["Needs review"]);
  assert.equal(shortOperator.recommendedNextAction, "Enrich");

  const junkOperator = sourceFileSummary.createDossierSourceFileSummary({
    candidate: {
      ...baseCandidate,
      sourceFileSummary: {
        summaryText: "local_profile_observed",
        knownContext: ["relationship_journal -> unknown"],
        openQuestions: ["metadata"],
        nextAction: "ingestKey",
        updatedAt: "2026-05-31T01:00:00.000Z",
        updatedBy: "admin",
      },
    },
  });
  const junkText = JSON.stringify(junkOperator);
  assert.equal(junkOperator.summarySource, "thin");
  assert.doesNotMatch(junkText, /local_profile_observed|relationship_journal|metadata|ingestKey/);
});

test("recommendation detail case-file view uses the same sanitizer", () => {
  const recommendation = {
    id: "rec_filter",
    type: "new_subject",
    subjectName: "Melanie Heart",
    status: "new",
    reason: "BNL Source Knowledge Bridge origin: relationship_journal -> unknown",
    evidenceSummary: "user_profiles/local_profile_observed conversations/public_discord_observed",
    confidence: "low",
    sourceLanes: ["rd_context"],
    sourceTypes: ["relationship_journal"],
    publicSafetyNotes: ["private_review_required", "private_review_required"],
    ingestKey: "bnl:rec_filter:raw_target_id_123456789",
    ingestSource: "bnl_source_knowledge_bridge",
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
  };

  const view = noteDisplay.createHumanReadableRecommendationView(recommendation);
  const mainText = JSON.stringify({ summary: view.summary, sections: view.sections });
  assert.doesNotMatch(mainText, /relationship_journal|local_profile_observed|public_discord_observed|private_review_required|rd_context|target_id/);
  assert.match(mainText, /BNL has a local profile match for this subject/);
  assert.match(JSON.stringify(view.rawMetadata), /relationship_journal|rd_context|bnl:rec_filter/);
});
