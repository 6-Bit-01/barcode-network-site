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
    updatedAt: new Date(0).toISOString(),
  });
}

async function authedGet() {
  return route.GET(new Request("https://example.test/api/admin/dossiers", {
    headers: { cookie: await adminCookie() },
  }));
}

async function authedPost(body) {
  return route.POST(new Request("https://example.test/api/admin/dossiers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: await adminCookie(),
    },
    body: JSON.stringify(body),
  }));
}

const manualCandidateInput = {
  name: "Manual Candidate Alpha",
  candidateType: "artist",
  reason: "Operator wants a controlled dossier review record.",
  whyNow: "The artist has enough public context to inspect manually.",
  evidenceSummary: "Operator-entered public-safe evidence summary.",
  knownFacts: ["Appeared in public show context", "Has an operator-approved link"],
  missingInfo: ["Confirm preferred public role"],
  doNotSay: ["Do not imply private Discord identity"],
  publicSafetyNotes: ["Use public facts only"],
  recommendedCategory: "Personnel",
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

test("admin panel includes Dossier Control Center link", () => {
  const adminPage = source("src/app/admin/page.tsx");
  assert.match(adminPage, /Dossier Control Center/);
  assert.match(adminPage, /Review dossier candidates, manage drafts, and prepare approved website dossier entries\./);
  assert.match(adminPage, /href="\/admin\/dossiers"/);
});

test("admin dossier page gates workflow behind successful API payload and includes manual intake UI", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  for (const label of ["Dossier Control Center", "Manual Candidate Intake", "Candidate Queue", "Candidate Evidence", "Candidate Gate / Scoring", "Draft Readiness / Missing Info", "Draft Workspace", "Review Actions", "Owner Review Queue", "Focused BNL Assistant", "System Boundaries"]) {
    assert.match(page, new RegExp(label));
  }
  for (const label of ["Known facts", "Missing info", "Do Not Say", "Public safety notes", "Deny", "Needs More Evidence", "Create Draft", "Save Draft", "Submit for Owner Review", "Manual draft only", "does not publish", "Focused BNL Assistant", "Disabled placeholder only"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /\/api\/admin\/dossiers/);
  assert.match(page, /Create Manual Candidate/);
  assert.match(page, /Featured\/primary link label/);
  assert.match(page, /selectedBy/);
  assert.match(page, /No selected candidate/);
  assert.match(page, /Why Now/);
  assert.match(page, /Duplicate Risk/);
  assert.match(page, /loose intake \/ strict publishing/i);
  assert.match(page, /Try Again: Too Long/);
  assert.match(page, /Owner Approve Draft/);
  assert.match(page, /BNL generation comes later/);

  assert.doesNotMatch(page, /fetch\(\"\/api\/bnl/);
  assert.match(page, /if \(loading\)/);
  assert.match(page, /if \(error \|\| !payload\)/);

  const loadingGate = page.indexOf("if (loading)");
  const authGate = page.indexOf("if (error || !payload)");
  const fullShell = page.indexOf('aria-label="Dossier Control Center"');
  assert.ok(loadingGate > -1 && loadingGate < fullShell, "loading state must return before the full shell");
  assert.ok(authGate > loadingGate && authGate < fullShell, "auth/error state must return before the full shell");
});

test("admin dossier page has minimal loading and auth-required states", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  assert.match(page, /Checking admin access\.\.\./);
  assert.match(page, /Admin authentication required/);
  assert.match(page, /Back to Admin/);
  assert.match(page, /MinimalDossierAdminState/);
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

  assert.equal(workflow.DOSSIER_CANDIDATE_SCORING_POLICY.gate, "Loose intake, strict drafting/publishing.");
  assert.equal(workflow.DOSSIER_CANDIDATE_SCORING_POLICY.thresholds.reviewCandidateMin, 50);
});

test("admin dossier API requires auth for GET and POST", async () => {
  const unauthorizedGet = await route.GET(new Request("https://example.test/api/admin/dossiers"));
  assert.equal(unauthorizedGet.status, 401);

  const unauthorizedPost = await route.POST(new Request("https://example.test/api/admin/dossiers", {
    method: "POST",
    body: JSON.stringify({ action: "createManualCandidate", input: manualCandidateInput }),
  }));
  assert.equal(unauthorizedPost.status, 401);
});

test("authenticated GET returns workflow store, metadata, authoring guide, tag registry, and scoring policy summaries", async () => {
  await resetWorkflowStore();
  const response = await authedGet();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.candidates, []);
  assert.deepEqual(payload.drafts, []);
  assert.equal(payload.workflow.version, 1);
  assert.equal(payload.workflow.status, "candidate_store_enabled");
  assert.equal(payload.workflow.storage, "memory_fallback");
  assert.equal(payload.workflow.storageKey, "barcode:dossier-workflow:v1");
  assert.equal(payload.workflow.revision, 0);
  assert.ok(payload.workflow.allowedActions.includes("requestDraft"));
  assert.ok(payload.workflow.allowedActions.includes("createDraftFromCandidate"));
  assert.ok(payload.workflow.allowedActions.includes("saveDraft"));
  assert.ok(payload.workflow.allowedActions.includes("submitDraftForOwnerReview"));
  assert.equal(payload.workflow.scoringPolicy.gate, "Loose intake, strict drafting/publishing.");
  assert.equal(payload.workflow.scoringPolicy.thresholds.draftReadyMin, 70);
  assert.ok(payload.workflow.candidateSourceBoundaries.some((entry) => entry.source === "queue_frequency"));
  assert.equal(payload.authoringGuide.version, "1.0");
  assert.ok(payload.authoringGuide.fieldCount > 0);
  assert.ok(payload.tagRegistry.totalUniqueTags > 0);
  assert.equal(payload.tagRegistry.creationPolicy.newTagsAllowed, "proposal_only");
  assert.equal(payload.ownerReviewQueue.waitingCount, 0);
  assert.equal(payload.ownerReviewQueue.draftCount, 0);
  assert.equal(payload.ownerReviewQueue.candidateCount, 0);
  assert.equal(payload.workflow.ownerGate.requiresOwnerSecretFuture, true);
  assert.equal(payload.workflow.ownerGate.approvalPublishes, false);
});

test("authenticated POST creates and persists a manual candidate without publishing", async () => {
  await resetWorkflowStore();
  const databaseEntriesBefore = JSON.stringify(databasePage.entries);
  const tagCountBefore = databasePage.entries.flatMap((entry) => entry.tags).length;

  const createResponse = await authedPost({ action: "createManualCandidate", input: manualCandidateInput });
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
  assert.equal(candidate.missingInfo.includes("Confirm preferred public role"), true);
  assert.equal(candidate.doNotSay[0], "Do not imply private Discord identity");
  assert.equal(candidate.publicSafetyNotes[0], "Use public facts only");
  assert.ok(candidate.createdAt);
  assert.ok(candidate.updatedAt);
  assert.equal(candidate.primaryLink.url, manualCandidateInput.primaryLink.url);

  const getResponse = await authedGet();
  const getPayload = await getResponse.json();
  assert.equal(getPayload.candidates.length, 1);
  assert.equal(getPayload.candidates[0].id, candidate.id);
  assert.equal(getPayload.drafts.length, 0);

  assert.equal(JSON.stringify(databasePage.entries), databaseEntriesBefore);
  assert.equal(databasePage.entries.flatMap((entry) => entry.tags).length, tagCountBefore);
});

test("concurrent manual candidate creation preserves both candidates and increments revision", async () => {
  await resetWorkflowStore();

  const [firstResponse, secondResponse] = await Promise.all([
    authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Concurrent Candidate One" } }),
    authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Concurrent Candidate Two" } }),
  ]);

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);

  const payload = await (await authedGet()).json();
  const names = payload.candidates.map((candidate) => candidate.name).sort();
  assert.deepEqual(names, ["Concurrent Candidate One", "Concurrent Candidate Two"]);
  assert.equal(payload.workflow.revision, 2);
});

test("concurrent status updates preserve unrelated candidates", async () => {
  await resetWorkflowStore();

  const firstCreate = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Concurrent Status One" } })).json();
  const secondCreate = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Concurrent Status Two" } })).json();

  const [denyResponse, needsEvidenceResponse] = await Promise.all([
    authedPost({ action: "denyCandidate", candidateId: firstCreate.candidate.id }),
    authedPost({ action: "markNeedsMoreEvidence", candidateId: secondCreate.candidate.id }),
  ]);

  assert.equal(denyResponse.status, 200);
  assert.equal(needsEvidenceResponse.status, 200);

  const payload = await (await authedGet()).json();
  const firstCandidate = payload.candidates.find((candidate) => candidate.id === firstCreate.candidate.id);
  const secondCandidate = payload.candidates.find((candidate) => candidate.id === secondCreate.candidate.id);
  assert.equal(payload.candidates.length, 2);
  assert.equal(firstCandidate.status, "denied");
  assert.equal(secondCandidate.status, "needs_more_evidence");
  assert.equal(payload.workflow.revision, 4);
});

test("workflow revision increments on candidate writes but not missing-candidate no-ops", async () => {
  await resetWorkflowStore();
  assert.equal((await store.getDossierWorkflowState()).revision, 0);

  const createPayload = await (await authedPost({ action: "createManualCandidate", input: manualCandidateInput })).json();
  assert.equal((await store.getDossierWorkflowState()).revision, 1);

  await authedPost({ action: "denyCandidate", candidateId: createPayload.candidate.id });
  assert.equal((await store.getDossierWorkflowState()).revision, 2);

  const missingResponse = await authedPost({ action: "denyCandidate", candidateId: "missing" });
  assert.equal(missingResponse.status, 404);
  assert.equal((await store.getDossierWorkflowState()).revision, 2);
});

test("denyCandidate updates status and keeps the candidate record", async () => {
  await resetWorkflowStore();
  const createPayload = await (await authedPost({ action: "createManualCandidate", input: manualCandidateInput })).json();
  const denyResponse = await authedPost({ action: "denyCandidate", candidateId: createPayload.candidate.id });
  assert.equal(denyResponse.status, 200);
  const denyPayload = await denyResponse.json();
  assert.equal(denyPayload.candidate.status, "denied");
  assert.equal(denyPayload.candidates.length, 1);
  assert.equal(denyPayload.candidates[0].id, createPayload.candidate.id);
});

test("markNeedsMoreEvidence updates status", async () => {
  await resetWorkflowStore();
  const createPayload = await (await authedPost({ action: "createManualCandidate", input: manualCandidateInput })).json();
  const updateResponse = await authedPost({ action: "markNeedsMoreEvidence", candidateId: createPayload.candidate.id });
  assert.equal(updateResponse.status, 200);
  const updatePayload = await updateResponse.json();
  assert.equal(updatePayload.candidate.status, "needs_more_evidence");
});

test("future actions stay placeholder-only and missing candidates return 404", async () => {
  await resetWorkflowStore();
  for (const action of ["requestDraft", "requestRevision", "ownerApproveDraft", "ownerRequestChanges", "ownerDenyDraft", "publishDraft"]) {
    const response = await authedPost({ action, candidateId: "candidate-test", draftId: "draft-test" });
    assert.equal(response.status, 501, `${action} should stay placeholder-only`);
    const payload = await response.json();
    assert.equal(payload.code, "not_implemented_yet");
  }

  const missingResponse = await authedPost({ action: "denyCandidate", candidateId: "missing" });
  assert.equal(missingResponse.status, 404);
});



test("createDraftFromCandidate creates one workflow draft from candidate recommendations", async () => {
  await resetWorkflowStore();
  const createCandidatePayload = await (await authedPost({ action: "createManualCandidate", input: manualCandidateInput })).json();

  const response = await authedPost({ action: "createDraftFromCandidate", candidateId: createCandidatePayload.candidate.id });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const draft = payload.draft;

  assert.ok(draft.id);
  assert.equal(draft.candidateId, createCandidatePayload.candidate.id);
  assert.equal(draft.status, "draft");
  assert.equal(draft.fields.name, manualCandidateInput.name);
  assert.equal(draft.fields.category, manualCandidateInput.recommendedCategory);
  assert.equal(draft.fields.status, manualCandidateInput.recommendedStatus);
  assert.equal(draft.fields.clearance, manualCandidateInput.recommendedClearance);
  assert.equal(draft.fields.origin, manualCandidateInput.recommendedOrigin);
  assert.deepEqual(draft.fields.tags, manualCandidateInput.recommendedTags);
  assert.deepEqual(draft.fields.proposedTags, manualCandidateInput.proposedTags);
  assert.equal(draft.fields.primaryLink.url, manualCandidateInput.primaryLink.url);
  assert.equal(payload.candidates[0].id, createCandidatePayload.candidate.id);
  assert.notEqual(payload.candidates[0].status, "published");
  assert.equal(payload.drafts.length, 1);
});

test("createDraftFromCandidate returns existing active draft without duplicating", async () => {
  await resetWorkflowStore();
  const createCandidatePayload = await (await authedPost({ action: "createManualCandidate", input: manualCandidateInput })).json();
  const firstPayload = await (await authedPost({ action: "createDraftFromCandidate", candidateId: createCandidatePayload.candidate.id })).json();
  const secondResponse = await authedPost({ action: "createDraftFromCandidate", candidateId: createCandidatePayload.candidate.id });
  assert.equal(secondResponse.status, 200);
  const secondPayload = await secondResponse.json();
  assert.equal(secondPayload.draft.id, firstPayload.draft.id);
  assert.equal(secondPayload.drafts.length, 1);
});

test("saveDraft updates draft fields, persists through GET, and does not mutate public content", async () => {
  await resetWorkflowStore();
  const databaseEntriesBefore = JSON.stringify(databasePage.entries);
  const readModelBefore = await (await readModel.GET()).json();
  const readModelNamesBefore = readModelBefore.sections.dossiers.items.map((entry) => entry.name).join("|");
  const createCandidatePayload = await (await authedPost({ action: "createManualCandidate", input: manualCandidateInput })).json();
  const createDraftPayload = await (await authedPost({ action: "createDraftFromCandidate", candidateId: createCandidatePayload.candidate.id })).json();

  const fields = {
    ...createDraftPayload.draft.fields,
    name: "Manual Candidate Alpha Draft",
    role: "Public artist profile",
    summary: "A saved public-safe manual draft summary.",
    notes: "Operator edited notes.",
    tags: ["artist", "radio", "saved-draft"],
  };
  const saveResponse = await authedPost({ action: "saveDraft", draftId: createDraftPayload.draft.id, fields });
  assert.equal(saveResponse.status, 200);
  const savePayload = await saveResponse.json();
  assert.equal(savePayload.draft.fields.name, "Manual Candidate Alpha Draft");
  assert.equal(savePayload.draft.fields.role, "Public artist profile");
  assert.deepEqual(savePayload.draft.fields.tags, ["artist", "radio", "saved-draft"]);

  const getPayload = await (await authedGet()).json();
  assert.equal(getPayload.drafts[0].fields.summary, "A saved public-safe manual draft summary.");
  assert.equal(JSON.stringify(databasePage.entries), databaseEntriesBefore);
  const readModelAfter = await (await readModel.GET()).json();
  assert.equal(readModelAfter.sections.dossiers.items.map((entry) => entry.name).join("|"), readModelNamesBefore);
  assert.equal(readModelAfter.sections.dossiers.items.some((entry) => entry.name === "Manual Candidate Alpha Draft"), false);
});

test("submitDraftForOwnerReview validates required fields and updates owner queue", async () => {
  await resetWorkflowStore();
  const createCandidatePayload = await (await authedPost({ action: "createManualCandidate", input: manualCandidateInput })).json();
  const createDraftPayload = await (await authedPost({ action: "createDraftFromCandidate", candidateId: createCandidatePayload.candidate.id })).json();

  const invalidResponse = await authedPost({ action: "submitDraftForOwnerReview", draftId: createDraftPayload.draft.id });
  assert.equal(invalidResponse.status, 400);
  const invalidPayload = await invalidResponse.json();
  assert.equal(invalidPayload.code, "invalid_draft_fields");
  assert.ok(invalidPayload.missingFields.includes("role"));

  const fields = {
    ...createDraftPayload.draft.fields,
    role: "Public artist profile",
    summary: "A complete enough manual draft summary for owner review.",
    tags: ["artist", "radio"],
  };
  await authedPost({ action: "saveDraft", draftId: createDraftPayload.draft.id, fields });
  const submitResponse = await authedPost({ action: "submitDraftForOwnerReview", draftId: createDraftPayload.draft.id });
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
  const publicDossierIdsBefore = databasePage.entries.map((entry) => entry.id).join("|");
  const tagNamesBefore = new Set(databasePage.entries.flatMap((entry) => entry.tags));
  const readModelBefore = await (await readModel.GET()).json();
  const publicReadModelNamesBefore = readModelBefore.sections.dossiers.items.map((entry) => entry.name).join("|");

  const createPayload = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Workflow Only Candidate Zed" } })).json();
  await authedPost({ action: "denyCandidate", candidateId: createPayload.candidate.id });

  assert.equal(databasePage.entries.map((entry) => entry.id).join("|"), publicDossierIdsBefore);
  assert.deepEqual(new Set(databasePage.entries.flatMap((entry) => entry.tags)), tagNamesBefore);

  const readModelAfter = await (await readModel.GET()).json();
  assert.equal(readModelAfter.sections.dossiers.items.map((entry) => entry.name).join("|"), publicReadModelNamesBefore);
  assert.equal(readModelAfter.sections.dossiers.items.some((entry) => entry.name === "Workflow Only Candidate Zed"), false);
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
  assert.equal(payload.candidate.existingDossierMatch.id, databasePage.entries[0].id);
  assert.equal(payload.candidate.existingDossierMatch.name, databasePage.entries[0].name);
  assert.ok(payload.candidate.missingInfo.some((item) => /Duplicate review required/.test(item)));
  assert.ok(payload.candidate.publicSafetyNotes.some((item) => /Duplicate review required/.test(item)));
});
