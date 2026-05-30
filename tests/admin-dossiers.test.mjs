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
const workflow = require("../src/lib/dossier-workflow.ts");
const store = require("../src/lib/dossier-workflow-store.ts");
const { databasePage } = require("../src/content.ts");
const readModel = require("../src/app/api/bnl/read-model/route.ts");

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

test("admin dossier dashboard is traffic control instead of an all-in-one workbench", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Dossier Control Center",
    "Quick Candidate Intake",
    "Manual fallback / quick seed",
    "BNL Dossier Workbench — Coming Next",
    "Prompt-based dossier drafting comes next",
    "BNL will generate complete dossier drafts from source files",
    "BNL will ask only for missing decisions",
    "Manual editing remains available",
    "Manual fields are fallback/advanced",
    "Manual fields are fallback only",
    "Active BNL Source Files",
    "Proposed Dossiers",
    "Owner Review",
    "Final Admin Drafts",
    "Duplicate Warnings",
    "Closed / History",
    "System Boundaries",
    "Create Manual Candidate",
    "Open Source File",
    "Create Proposed Dossier",
    "Open Proposed Dossier",
    "View Warning / Open Merge Review",
    "No BNL invocation",
    "No publishing",
    "No automatic tag creation",
    "No public database mutation",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  for (const route of [
    "/admin/dossiers/candidates/",
    "/admin/dossiers/drafts/",
    "/admin/dossiers/duplicates/",
  ]) {
    assert.match(page, new RegExp(route));
  }

  assert.doesNotMatch(page, /Draft Workspace/);
  assert.doesNotMatch(page, /Candidate Evidence/);
  assert.doesNotMatch(page, /Candidate Gate \/ Scoring/);
  assert.doesNotMatch(page, /Focused BNL Assistant/);
  assert.doesNotMatch(page, /Merge candidates and create\/update master draft/);
  assert.doesNotMatch(page, /Save Draft/);
  assert.doesNotMatch(page, /Submit for Owner Review/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /if \(loading\)/);
  assert.match(page, /if \(error \|\| !payload\)/);

  const loadingGate = page.indexOf("if (loading)");
  const authGate = page.indexOf("if (error || !payload)");
  const fullShell = page.indexOf('aria-label="Dossier Control Center"');
  assert.ok(
    loadingGate > -1 && loadingGate < fullShell,
    "loading state must return before the full shell",
  );
  assert.ok(
    authGate > loadingGate && authGate < fullShell,
    "auth/error state must return before the full shell",
  );
});

test("dossier admin pages expose numbered dossier phases and clearer labels", () => {
  const dashboard = source("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Phase 1 — BNL Source File",
    "Phase 2 — Proposed Dossier + BNL Edit Chat",
    "Phase 3 — Final Admin Draft",
    "Phase 4 — Owner Review",
    "Phase 5 — Approved / Publish Later",
    "Active BNL Source Files",
    "Proposed Dossiers",
    "Duplicate Warnings",
    "Closed / History",
  ]) {
    assert.ok(dashboard.includes(label), `${label} should be present`);
  }

  const sourceFilePage = source(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  const sourceFileCopy = normalizedSource(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  assert.match(sourceFilePage, /Phase 1 — BNL Source File/);
  assertIncludesCopy(
    sourceFileCopy,
    "This BNL Source File is one subject/entity source packet",
  );
  assertIncludesCopy(sourceFileCopy, "Admins can add information to this BNL Source File");

  const draftPage = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  const draftCopy = normalizedSource(
    "src/app/admin/dossiers/drafts/[draftId]/page.tsx",
  );
  assert.match(draftPage, /Phase 2 — Proposed Dossier \+ BNL Edit Chat/);
  assertIncludesCopy(
    draftCopy,
    "This page shows the proposed completed dossier built from the BNL Source File",
  );

  const ownerPage = source("src/app/admin/dossiers/owner-review/page.tsx");
  assert.match(ownerPage, /Phase 4 — Owner Review/);
  assert.match(ownerPage, /This is Owner Review/);
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

test("dedicated candidate review route contains focused evidence and action workflow", () => {
  const routePath = "src/app/admin/dossiers/candidates/[candidateId]/page.tsx";
  assert.equal(fs.existsSync(path.join(projectRoot, routePath)), true);
  const page = source(routePath);
  const pageCopy = normalizedSource(routePath);
  for (const label of [
    "BNL Source File",
    "Add to BNL Source File",
    "Additional Info Added After Submission",
    "Admin Addendum",
    "Admins can add information to this BNL Source File. It does not directly edit the proposed dossier.",
    "This source file remains one subject/entity.",
    "Save Info",
    "Create / Open Proposed Dossier",
    "Open Proposed Dossier",
    "Mark Needs Info",
    "Evidence summary",
    "Evidence items",
    "Public safety notes",
    "Do-not-say",
    "Recommended taxonomy",
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
  assert.doesNotMatch(page, /Coming later: this will save notes/);
  assert.match(page, /useParams/);
  assert.match(page, /routeParam\(params\?\.candidateId\)/);
  assert.match(page, /action: "createDraftFromCandidate"/);
  assert.doesNotMatch(page, />Deny<|>Deny<\/button>/);
  assert.doesNotMatch(page, />Final Approve<|>Publish<|>Delete<|>Final Merge</);
  assert.match(page, /action, candidateId/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.doesNotMatch(page, /publishDraft/);
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

test("dashboard uses actual workflow ids and state-aware lane filtering", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  assert.match(
    page,
    /href=\{`\/admin\/dossiers\/candidates\/\$\{candidate\.id\}`\}/,
  );
  assert.match(page, /href=\{`\/admin\/dossiers\/drafts\/\$\{draft\.id\}`\}/);
  assert.match(
    page,
    /href=\{`\/admin\/dossiers\/duplicates\/\$\{group\.id\}`\}/,
  );
  assert.match(page, /activeCandidateStatuses/);
  assert.match(page, /activeCandidates = candidates\.filter/);
  assert.match(
    page,
    /candidate\.status === "denied" \|\| candidate\.status === "merged"/,
  );
  assert.match(page, /activeDraftStatuses/);
  assert.match(page, /closedDraftStatuses/);
  assert.match(page, /Closed \/ History/);
  assert.match(page, /Closed \/ History — Merged Candidates/);
  assert.match(page, /Closed \/ History — Superseded Drafts/);
  assert.match(page, /disabled=\{saving \|\| !canCreateDraft\}/);
  assert.match(page, /Active draft already exists/);
  assert.match(page, /Source file was merged or closed/);
  assert.match(page, /Add info or create proposed dossier/);
  assert.match(page, /Add to Source File/);
  assert.match(page, /Open proposed dossier/);
  assert.match(page, /Mark Needs Info/);
  assert.match(page, /Recommend Dismissal/);
  assert.match(page, /Open Proposed Dossier/);
  assert.match(page, /Superseded by/);
  assert.match(page, /Active BNL Source Files/);
  assert.match(page, /Duplicate Warnings/);
  assert.match(page, /View Warning \/ Open Merge Review/);
  assert.match(page, /Recommend Dismissal/);
  assert.doesNotMatch(page, />Deny<|>Deny<\/button>/);
  assert.match(page, /"approved"/);
  assert.match(page, /"owner_approved"/);
  assert.match(page, /mergedIntoCandidateId/);
  assert.match(page, /mergedAt/);
  assert.match(page, /mergedIntoDraftId/);
  assert.match(page, /No normal active action buttons/);
  assert.match(page, /Reference-only; no normal active edit button/);
});

test("dashboard frames manual intake as fallback and future BNL-led workbench", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Manual fallback / quick seed",
    "Use this when BNL has not suggested a candidate yet",
    "Main BNL-led workbench comes later",
    "BNL Dossier Workbench — Coming Next",
    "Prompt-based dossier drafting comes next",
    "Mods/admins will guide BNL in plain language",
    "BNL will use the source file and approved sources to build a complete dossier draft",
    "BNL will generate complete dossier drafts from source files",
    "BNL will ask only for missing decisions",
    "Manual editing remains available",
    "Manual fields are fallback/advanced",
    "Manual fields are fallback only",
    "Admin selects or creates a candidate",
    "Owner opens the submitted draft",
    "Future source packet",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
});

test("owner review page is a placeholder lane without publishing", () => {
  const routePath = "src/app/admin/dossiers/owner-review/page.tsx";
  assert.equal(fs.existsSync(path.join(projectRoot, routePath)), true);
  const page = source(routePath);
  assert.match(page, /Owner Final Review Queue/);
  assert.match(page, /This is Owner Review\. The owner does the final pass/);
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
  assert.match(page, /Duplicate Warnings/);
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

test("ignore and dismiss recommendations preserve records", async () => {
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
  assertIncludesCopy(
    dashboardCopy,
    "Recommendation History — converted / attached / ignored / dismissed",
  );
  assertIncludesCopy(
    dashboardCopy,
    "Closed recommendation; no active action buttons",
  );
});

test("recommendation inbox and source note UI are present and bounded", () => {
  const dashboard = source("src/app/admin/dossiers/page.tsx");
  assert.match(dashboard, /Dossier Recommendation Inbox/);
  assert.match(dashboard, /BNL Recommendation \/ Evidence Cluster/);
  assert.match(dashboard, /Create Manual Recommendation/);
  assert.match(dashboard, /Convert to New BNL Source File/);
  assert.match(dashboard, /Match state/);
  assert.match(dashboard, /Matched existing BNL Source File/);
  assert.match(dashboard, /Possible duplicate \/ identity warning/);
  assert.match(dashboard, /No BNL Source File match/);
  assert.match(dashboard, /Attach to Matched Source File/);
  assert.doesNotMatch(dashboard, /Attach to Existing Source File/);

  const sourceFilePage = source(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  assert.match(sourceFilePage, /Add to BNL Source File/);
  assert.match(sourceFilePage, /Admins can add information to this BNL Source File/);
  assert.match(sourceFilePage, /This source file[\s\S]*remains one subject\/entity/);
  assert.match(sourceFilePage, /create or wait for a separate BNL recommendation/);
  assert.match(sourceFilePage, /Save Info/);

  const draftPage = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  assert.match(draftPage, /BNL Source File Notes/);
  assert.match(draftPage, /active source note/);

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
  assert.match(
    recommendationPage,
    /Dismissed\. This recommendation is closed\./,
  );
  assert.match(recommendationPage, /!isTerminal &&/);
  assert.match(recommendationPage, /Matched BNL Source File/);
  assert.match(recommendationPage, /Attach to Matched BNL Source File/);
  assert.match(recommendationPage, /Owner\/lead identity review is required/);
  assert.doesNotMatch(recommendationPage, /Choose existing BNL Source File/);
  assert.match(
    recommendationPage,
    /Terminal recommendation actions are closed/,
  );
  assert.doesNotMatch(
    dashboard + sourceFilePage + draftPage + recommendationPage,
    /fetch\("\/api\/bnl/,
  );
  assert.doesNotMatch(
    dashboard + sourceFilePage + draftPage + recommendationPage,
    /publishDraft/,
  );
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
