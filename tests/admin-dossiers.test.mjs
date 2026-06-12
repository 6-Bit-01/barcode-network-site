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
const bnlArchiveIngestRoute = require("../src/app/api/bnl/source-file-enrichments/route.ts");
const workflow = require("../src/lib/dossier-workflow.ts");
const store = require("../src/lib/dossier-workflow-store.ts");
const { databasePage } = require("../src/content.ts");
const readModel = require("../src/app/api/bnl/read-model/route.ts");
const sourceFilesReadModel = require("../src/app/api/bnl/source-files/route.ts");
const populationContextRoute = require("../src/app/api/bnl/population-context/route.ts");
const sourceFileRefreshRequestsRoute = require("../src/app/api/bnl/source-files/refresh-requests/route.ts");
const noteDisplay = require("../src/lib/dossier-note-display.ts");
const sourceFileSummary = require("../src/lib/dossier-source-file-summary.ts");
const entityReadout = require("../src/lib/dossier-entity-activity-readout.ts");
const sourceMemoryMeaning = require("../src/lib/dossier-source-memory-meaning.ts");
const sourceSummaryPanelComponent = require("../src/components/DossierSourceFileSummaryPanel.tsx");
const actionableBrief = require("../src/lib/dossier-source-file-actionable-brief.ts");
const publicCopyGuard = require("../src/lib/dossier-public-copy-guard.ts");
const dossierPageViewModel = require("../src/lib/dossier-page-view-model.ts");

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

test("public database dossiers render through shared dossier page view", () => {
  const publicPageSource = normalizedSource("src/app/database/[slug]/page.tsx");
  const sharedViewSource = source("src/components/DossierPageView.tsx");
  const entry = databasePage.entries[0];
  const viewModel = dossierPageViewModel.databaseEntryToDossierPageViewModel(entry);

  assertIncludesCopy(publicPageSource, "<DossierPageView dossier={databaseEntryToDossierPageViewModel(entry)} />");
  assert.match(sharedViewSource, /Dossier Record/);
  assert.match(sharedViewSource, /Intelligence Brief/);
  assert.match(sharedViewSource, /Attached Files/);
  assert.match(sharedViewSource, /BARCODE_NETWORK \/\/ DOSSIER QUERY/);
  assert.equal(viewModel.id, entry.id);
  assert.equal(viewModel.name, entry.name);
  assert.equal(viewModel.summary, entry.summary);
  assert.equal(viewModel.files, entry.files);
  assert.equal(viewModel.showTerminalReadout, true);
});

test("draft proposed dossier preview maps draft fields into shared public layout model", () => {
  const draft = {
    id: "draft-preview-123456",
    fields: {
      id: "PR-155",
      name: "Preview Subject",
      category: "Personnel",
      status: "PENDING",
      clearance: "INTERNAL",
      role: "Preview Role",
      origin: "UNVERIFIED",
      summary: "Curated public-safe summary.",
      notes: "Curated public-safe notes.",
      tags: ["existing-tag"],
      proposedTags: ["proposed-tag"],
      primaryLink: {
        label: "Preview Link",
        url: "https://example.com/preview",
        type: "website",
        selectedBy: "operator",
        publicSafe: true,
      },
      files: [],
    },
  };

  const viewModel = dossierPageViewModel.draftToDossierPreviewViewModel(draft);

  assert.equal(viewModel.id, "PR-155");
  assert.equal(viewModel.name, "Preview Subject");
  assert.equal(viewModel.category, "Personnel");
  assert.equal(viewModel.status, "PENDING");
  assert.equal(viewModel.clearance, "INTERNAL");
  assert.equal(viewModel.role, "Preview Role");
  assert.equal(viewModel.origin, "UNVERIFIED");
  assert.equal(viewModel.summary, "Curated public-safe summary.");
  assert.equal(viewModel.notes, "Curated public-safe notes.");
  assert.deepEqual(viewModel.tags, ["existing-tag", "proposed-tag"]);
  assert.deepEqual(viewModel.primaryLink, {
    label: "Preview Link",
    url: "https://example.com/preview",
    type: "website",
  });
  assert.equal(viewModel.previewMode, true);
  assert.equal(viewModel.unpublishedLabel, "UNPUBLISHED PREVIEW");
  assert.equal(viewModel.showTerminalReadout, true);
});


test("proposed dossier preview sanitizes internal starter phrases before DossierPageView", () => {
  const adminPageSource = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  assert.match(adminPageSource, /sanitizeDossierPublicCopy\(form\.summary\)/);
  assert.match(adminPageSource, /sanitizeDossierPublicCopy\(form\.notes\)/);
  assert.match(adminPageSource, /<DossierPageView dossier=\{dossier\} \/>/);

  const draft = {
    id: "draft-sanitized-preview",
    fields: {
      name: "Starter Subject",
      role: publicCopyGuard.sanitizeDossierPublicCopy(
        "Starter note only: add a dossier entry",
      ) || publicCopyGuard.DOSSIER_PUBLIC_ROLE_PLACEHOLDER,
      summary: publicCopyGuard.sanitizeDossierPublicCopy(
        "Starter note only: add a dossier entry",
      ) || publicCopyGuard.DOSSIER_PUBLIC_SUMMARY_PLACEHOLDER,
      notes: publicCopyGuard.sanitizeDossierPublicCopy(
        "Starter evidence note: Missing info: confirm copy",
      ),
      tags: [],
      proposedTags: [],
      files: [],
    },
  };
  const viewModel = dossierPageViewModel.draftToDossierPreviewViewModel(draft);
  assert.doesNotMatch(
    JSON.stringify(viewModel),
    /Starter note only|Starter evidence note|Missing info|add a dossier entry/i,
  );
});

test("phase 2 draft editor stacks source summary, BNL edit panel, and dossier preview full-width", () => {
  const adminPageSource = normalizedSource("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  const sourceSummaryIndex = adminPageSource.indexOf("BNL Source File Summary");
  const editPanelIndex = adminPageSource.indexOf("BNL Edit Chat panel — Coming Next", sourceSummaryIndex);
  const previewIndex = adminPageSource.indexOf("<ProposedDossierPreview form={form} candidate={candidate ?? undefined} />", editPanelIndex);

  assert.notEqual(sourceSummaryIndex, -1);
  assert.notEqual(editPanelIndex, -1);
  assert.notEqual(previewIndex, -1);
  assert.ok(
    sourceSummaryIndex < editPanelIndex,
    "Source summary should appear before BNL edit panel.",
  );
  assert.ok(
    editPanelIndex < previewIndex,
    "BNL edit panel should appear before dossier preview.",
  );
  assertIncludesCopy(adminPageSource, "mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6");
  assert.doesNotMatch(
    adminPageSource,
    /grid grid-cols-1 lg:grid-cols-\[0\.85fr_1\.15fr\]/,
  );
});

test("admin source-file caveats stay outside the public-style dossier preview model", () => {
  const adminPageSource = normalizedSource("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  const componentSource = source("src/components/DossierPageView.tsx");
  const draft = {
    id: "draft-private-raw-metadata",
    fields: {
      name: "Source Safe Subject",
      summary: "Only curated proposed summary.",
      notes: "Only curated proposed notes.",
    },
  };
  const viewModel = dossierPageViewModel.draftToDossierPreviewViewModel(draft);

  assertIncludesCopy(adminPageSource, "Developer / Raw Source Audit — internal debugging only");
  assertIncludesCopy(adminPageSource, "Public safety notes:");
  assert.match(componentSource, /UNPUBLISHED PREVIEW/);
  assert.doesNotMatch(componentSource, /missingInfo|publicSafetyNotes|sourceFileNotes|evidenceSummary|doNotSay/);
  assert.doesNotMatch(JSON.stringify(viewModel), /missingInfo|publicSafetyNotes|sourceFileNotes|evidenceSummary|doNotSay|raw-metadata/);
  assert.equal(viewModel.summary, "Only curated proposed summary.");
  assert.equal(viewModel.notes, "Only curated proposed notes.");
});

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

async function authedPost(body, options = {}) {
  return route.POST(
    new Request(options.url ?? "https://example.test/api/admin/dossiers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: await adminCookie(),
        ...(options.headers ?? {}),
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

async function populationContextGet(token) {
  return populationContextRoute.GET(
    new Request("https://example.test/api/bnl/population-context", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

async function refreshRequestsGet(query = "", token = "test-source-file-read-token") {
  return sourceFileRefreshRequestsRoute.GET(
    new Request(`https://example.test/api/bnl/source-files/refresh-requests${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

async function refreshRequestsPost(body, token = "test-source-file-read-token") {
  return sourceFileRefreshRequestsRoute.POST(
    new Request("https://example.test/api/bnl/source-files/refresh-requests", {
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

async function cloneCandidateForTest(candidate, overrides = {}) {
  const state = await store.getDossierWorkflowState();
  const clone = {
    ...candidate,
    id: overrides.id ?? `${candidate.id}-duplicate`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  await store.saveDossierWorkflowState({
    ...state,
    candidates: [clone, ...state.candidates],
  });
  return clone;
}

async function bnlArchivePost(body, token = "test-bnl-ingest-token") {
  return bnlArchiveIngestRoute.POST(
    new Request("https://example.test/api/bnl/source-file-enrichments", {
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


test("Source File open refresh workflow dedupes, exposes bot polling, and completes on BNL enrichment", async () => {
  await resetWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const created = await (await authedPost({
    action: "createManualCandidate",
    input: {
      name: "Refresh Fixture Subject",
      candidateType: "artist",
      reason: "Operator wants a refresh workflow fixture.",
      whyNow: "The source file needs BNL review.",
      evidenceSummary: "Admin fixture evidence.",
    },
  })).json();
  const candidateId = created.candidate.id;
  await authedPost({ action: "promoteCandidateToSourceFile", candidateId });

  const firstOpen = await (await authedPost({ action: "recordSourceFileOpen", candidateId })).json();
  assert.equal(firstOpen.refresh.request.status, "pending");
  assert.equal(firstOpen.sourceFileRefreshRequests.length, 1);
  assert.equal(firstOpen.sourceFileRefreshRequests[0].requestSource, "missing_bnl_refresh");

  const secondOpen = await (await authedPost({ action: "recordSourceFileOpen", candidateId })).json();
  assert.equal(secondOpen.sourceFileRefreshRequests.length, 1);
  assert.equal(secondOpen.refresh.created, false);

  const thirdOpen = await (await authedPost({ action: "recordSourceFileOpen", candidateId })).json();
  assert.equal(thirdOpen.sourceFileRefreshRequests.filter((request) => request.status === "pending" || request.status === "claimed").length, 1);
  assert.equal(thirdOpen.sourceFileRefreshRequests[0].id, firstOpen.sourceFileRefreshRequests[0].id);

  const duplicateState = await store.getDossierWorkflowState();
  await store.saveDossierWorkflowState({
    ...duplicateState,
    sourceFileRefreshRequests: [
      ...duplicateState.sourceFileRefreshRequests,
      {
        ...duplicateState.sourceFileRefreshRequests[0],
        id: "legacy-duplicate-refresh-request",
        updatedAt: new Date(Date.now() + 1).toISOString(),
      },
    ],
  });
  assert.equal((await store.getDossierWorkflowState()).sourceFileRefreshRequests.filter((request) => request.status === "pending" || request.status === "claimed").length, 1);

  const manual = await (await authedPost({
    action: "requestSourceFileRefresh",
    candidateId,
    reason: "Manual test refresh request.",
  })).json();
  assert.equal(manual.message, "BNL Source File immediate update did not complete. Retry from the status button.");
  assert.equal(manual.immediateRefresh.status, "unavailable");
  assert.equal(manual.sourceFileRefreshRequests.length, 1);
  assert.equal(manual.sourceFileRefreshRequests[0].reason, "Manual test refresh request.");
  assert.equal(manual.sourceFileRefreshRequests[0].requestSource, "manual_admin");
  const manualRequestId = manual.sourceFileRefreshRequests[0].id;

  const manualReload = await (await authedPost({
    action: "requestSourceFileRefresh",
    candidateId,
    reason: "Manual test refresh request clicked again.",
  })).json();
  const manualActiveRequests = manualReload.sourceFileRefreshRequests.filter((request) => request.status === "pending" || request.status === "claimed");
  assert.equal(manualReload.refresh.created, false);
  assert.equal(manualActiveRequests.length, 1);
  assert.equal(manualActiveRequests[0].id, manualRequestId);
  assert.equal(manualActiveRequests[0].reason, "Manual test refresh request clicked again.");

  const poll = await (await refreshRequestsGet("?limit=5")).json();
  assert.equal(poll.ok, true);
  assert.equal(poll.requests.length, 1);
  assert.equal(poll.requests[0].candidateId, candidateId);
  assert.equal(poll.requests[0].subjectName, "Refresh Fixture Subject");

  const claimed = await (await refreshRequestsPost({
    requestId: poll.requests[0].id,
    status: "claimed",
  })).json();
  assert.equal(claimed.request.status, "claimed");
  assert.ok(claimed.request.lastAttemptAt);

  const completed = await (await refreshRequestsPost({
    requestId: poll.requests[0].id,
    status: "completed",
    completedByRecommendationId: "manual-complete-rec",
  })).json();
  assert.equal(completed.request.status, "completed");
  assert.equal(completed.request.completedByRecommendationId, "manual-complete-rec");

  const afterRecentCompletion = await (await authedPost({ action: "recordSourceFileOpen", candidateId })).json();
  assert.equal(afterRecentCompletion.sourceFileRefreshRequests.length, 2);
  assert.equal(afterRecentCompletion.refresh.request.status, "pending");
  assert.equal(afterRecentCompletion.immediateRefresh.status, "unavailable");

  const manualAgain = await (await authedPost({
    action: "requestSourceFileRefresh",
    candidateId,
    reason: "Manual refresh after completion.",
  })).json();
  assert.equal(manualAgain.sourceFileRefreshRequests.filter((request) => request.status === "pending").length, 1);

  const ingest = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Refresh Fixture Subject",
    targetCandidateId: candidateId,
    reason: "BNL refreshed this source file.",
    evidenceSummary: "Fresh enrichment evidence.",
    sourceLanes: ["rd_context"],
    ingestKey: "refresh-fixture-enrichment-1",
    ingestSource: "bnl_source_file_enrichment",
  })).json();
  assert.equal(ingest.ok, true);

  const finalState = await store.getDossierWorkflowState();
  const finalRequest = finalState.sourceFileRefreshRequests.find((request) => request.reason === "Manual refresh after completion.");
  assert.equal(finalRequest.status, "completed");
  assert.equal(finalRequest.completedByRecommendationId, ingest.recommendation.id);
});



test("Source File open and retry call BNL refresh-now server-side with safe status results", async () => {
  await resetWorkflowStore();
  process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL = "https://bnl.example.test/internal/source-files/refresh-now";
  process.env.BNL_SOURCE_FILE_REFRESH_TOKEN = "test-refresh-token";
  process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS = "1000";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    assert.equal(String(url), process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL);
    assert.equal(options.headers["X-BNL-REFRESH-TOKEN"], "test-refresh-token");
    const body = JSON.parse(options.body);
    assert.equal(body.source, calls.length === 1 ? "admin_open_source_file" : "admin_manual");
    assert.equal(body.siteCallbackBaseUrl, "https://example.test");
    assert.equal(body.requestingSiteOrigin, "https://example.test");
    assert.equal(body.sourceFileArchiveCallbackBaseUrl, "https://example.test");
    assert.ok(body.requestId);
    assert.equal(body.candidateId, body.candidateId);
    if (calls.length === 1) {
      return Response.json({ ok: true, status: "success", recommendationId: "fresh-rec-id" });
    }
    return Response.json({ ok: false, status: "failed", failureReason: "BNL fixture failure" }, { status: 500 });
  };

  try {
    const created = await (await authedPost({
      action: "createManualCandidate",
      input: {
        name: "Immediate Refresh Fixture",
        candidateType: "artist",
        reason: "Operator wants immediate refresh coverage.",
        whyNow: "The source file should update on open.",
        evidenceSummary: "Admin fixture evidence.",
      },
    })).json();
    const candidateId = created.candidate.id;
    await authedPost({ action: "promoteCandidateToSourceFile", candidateId });

    const opened = await (await authedPost({ action: "recordSourceFileOpen", candidateId })).json();
    assert.equal(opened.immediateRefresh.ok, true);
    assert.equal(opened.immediateRefresh.status, "success");
    assert.equal(opened.immediateRefresh.recommendationId, "fresh-rec-id");
    assert.equal(opened.immediateRefresh.callbackBaseSent, true);
    assert.equal(opened.immediateRefresh.callbackBaseHost, "example.test");
    assert.equal(opened.sourceFileRefreshRequests[0].status, "completed");
    assert.equal(opened.sourceFileRefreshRequests[0].completedByRecommendationId, "fresh-rec-id");

    const retry = await (await authedPost({
      action: "requestSourceFileRefresh",
      candidateId,
      reason: "Retry immediate refresh after failed visible state.",
    })).json();
    assert.equal(retry.immediateRefresh.ok, false);
    assert.equal(retry.immediateRefresh.status, "failed");
    assert.equal(retry.immediateRefresh.failureReason, "BNL fixture failure");
    assert.equal(retry.immediateRefresh.callbackBaseSent, true);
    assert.equal(retry.immediateRefresh.callbackBaseHost, "example.test");
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
    delete process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL;
    delete process.env.BNL_SOURCE_FILE_REFRESH_TOKEN;
    delete process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  }
});


test("Source File refresh does not forward untrusted callback origins", async () => {
  await resetWorkflowStore();
  process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL = "https://bnl.example.test/internal/source-files/refresh-now";
  process.env.BNL_SOURCE_FILE_REFRESH_TOKEN = "test-refresh-token";
  process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS = "1000";
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL;
  delete process.env.VERCEL_URL;

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return Response.json({ ok: true, status: "success", recommendationId: "untrusted-refresh" });
  };

  try {
    const created = await (await authedPost({
      action: "createManualCandidate",
      input: {
        name: "Untrusted Origin Fixture",
        candidateType: "artist",
        reason: "Operator wants callback origin safety coverage.",
        whyNow: "The source file should not trust hostile hosts.",
        evidenceSummary: "Admin fixture evidence.",
      },
      siteCallbackBaseUrl: "https://evil.example.test",
    }, { url: "https://evil.example.test/api/admin/dossiers" })).json();
    const candidateId = created.candidate.id;
    await authedPost({ action: "promoteCandidateToSourceFile", candidateId }, { url: "https://evil.example.test/api/admin/dossiers" });

    const opened = await (await authedPost({
      action: "recordSourceFileOpen",
      candidateId,
      siteCallbackBaseUrl: "https://evil.example.test",
    }, { url: "https://evil.example.test/api/admin/dossiers" })).json();

    assert.equal(opened.immediateRefresh.callbackBaseSent, false);
    assert.equal(opened.immediateRefresh.callbackBaseHost, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.siteCallbackBaseUrl, undefined);
    assert.equal(calls[0].body.requestingSiteOrigin, undefined);
    assert.equal(calls[0].body.sourceFileArchiveCallbackBaseUrl, undefined);
  } finally {
    global.fetch = originalFetch;
    delete process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL;
    delete process.env.BNL_SOURCE_FILE_REFRESH_TOKEN;
    delete process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS;
  }
});


test("routing guard prevents exact duplicate manual candidates and preserves new info", async () => {
  await resetWorkflowStore();

  const first = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat", evidenceSummary: "First Hellcat signal." } })).json();
  const second = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat", evidenceSummary: "Second Hellcat signal." } })).json();

  assert.equal(second.candidate.id, first.candidate.id);
  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.filter((candidate) => workflow.compactDossierSubjectName(candidate.name) === "hellcat").length, 1);
  assert.match(state.candidates[0].sourceFileNotes.map((note) => note.text).join("\n"), /Second Hellcat signal/);
});

test("routing guard treats safe compact and case-insensitive subjects as one active record", async () => {
  await resetWorkflowStore();

  const first = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat" } })).json();
  const lower = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "hellcat", evidenceSummary: "Lowercase signal." } })).json();
  const spaced = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hell Cat", evidenceSummary: "Compact-name signal." } })).json();

  assert.equal(lower.candidate.id, first.candidate.id);
  assert.equal(spaced.candidate.id, first.candidate.id);
  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 1);
  assert.match(state.candidates[0].sourceFileNotes.map((note) => note.text).join("\n"), /Lowercase signal|Compact-name signal/);
});

test("routing guard prioritizes an active Source File over creating a new Candidate", async () => {
  await resetWorkflowStore();

  const created = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat" } })).json();
  await authedPost({ action: "promoteCandidateToSourceFile", candidateId: created.candidate.id });
  const routed = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat", evidenceSummary: "Source File follow-up." } })).json();

  assert.equal(routed.candidate.id, created.candidate.id);
  assert.equal(routed.candidate.status, "active_source_file");
  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 1);
  assert.match(state.candidates[0].sourceFileNotes[0].text, /Source File follow-up/);
});

test("routing guard sends exact public dossier signals to Dossier Updates instead of Candidates", async () => {
  await resetWorkflowStore();

  const routed = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "6 Bit", evidenceSummary: "Existing dossier update signal." } })).json();

  assert.equal(routed.candidate.status, "existing_dossier_update");
  assert.equal(routed.candidate.existingDossierMatch.name, "6 Bit");
  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0].status, "existing_dossier_update");
});

test("routing guard reuses one connected uncertain identity review record", async () => {
  await resetWorkflowStore();

  const existing = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat" } })).json();
  const possible = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat Annex", evidenceSummary: "Possible annex signal." } })).json();
  const repeat = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat Annex", evidenceSummary: "Repeated possible annex signal." } })).json();

  assert.notEqual(possible.candidate.id, existing.candidate.id);
  assert.equal(repeat.candidate.id, possible.candidate.id);
  assert.equal(repeat.candidate.identityReviewStatus, "needs_confirmation");
  assert.deepEqual(repeat.candidate.possibleMatchCandidateIds, [existing.candidate.id]);
  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 2);
  assert.match(state.candidates.find((candidate) => candidate.id === possible.candidate.id).sourceFileNotes[0].text, /Repeated possible annex signal/);
});

test("confirmed aliases are safe matches, but proposed/rejected/retired aliases are not", async () => {
  await resetWorkflowStore();

  const sourceFile = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hellcat" } })).json();
  await authedPost({ action: "promoteCandidateToSourceFile", candidateId: sourceFile.candidate.id });
  const proposed = await store.addDossierIdentityLink({ candidateId: sourceFile.candidate.id, label: "Hell Kitty", type: "alias", visibility: "internal_only", source: "admin_manual", useForMatching: true });
  await store.confirmDossierIdentityLink({ candidateId: sourceFile.candidate.id, identityLinkId: proposed.id });

  const alias = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hell Kitty", evidenceSummary: "Confirmed alias signal." } })).json();
  assert.equal(alias.candidate.id, sourceFile.candidate.id);

  const proposedOnly = await store.addDossierIdentityLink({ candidateId: sourceFile.candidate.id, label: "Hell Kitten", type: "alias", visibility: "internal_only", source: "admin_manual", useForMatching: true });
  const proposedAlias = await (await authedPost({ action: "createManualCandidate", input: { ...manualCandidateInput, name: "Hell Kitten" } })).json();
  assert.notEqual(proposedAlias.candidate.id, sourceFile.candidate.id);
  assert.equal(proposedAlias.candidate.possibleMatchCandidateIds, undefined);
  await store.rejectDossierIdentityLink({ candidateId: sourceFile.candidate.id, identityLinkId: proposedOnly.id });
});


test("Source File refresh requests case-report backfill and refuses false completion when latest archive lacks report", async () => {
  await resetWorkflowStore();
  process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL = "https://bnl.example.test/internal/source-files/refresh-now";
  process.env.BNL_SOURCE_FILE_REFRESH_TOKEN = "test-refresh-token";
  process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS = "1000";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";

  const created = await (await authedPost({
    action: "createManualCandidate",
    input: {
      name: "Case Report Missing Fixture",
      candidateType: "artist",
      reason: "Operator wants case-report refresh coverage.",
      whyNow: "The archive exists but the report is missing.",
      evidenceSummary: "Admin fixture evidence.",
    },
  })).json();
  const candidateId = created.candidate.id;
  await authedPost({ action: "promoteCandidateToSourceFile", candidateId });

  const state = await store.getDossierWorkflowState();
  const now = "2026-06-10T00:00:00.000Z";
  const candidate = state.candidates.find((item) => item.id === candidateId);
  const archive = {
    id: "archive-missing-case-report",
    candidateId,
    subjectName: candidate.name,
    subjectKey: "case-report-missing-fixture",
    sourceDigest: "abcdef1234567890",
    createdAt: now,
    updatedAt: now,
    archiveSize: 123,
    chunkCount: 1,
    reviewOnly: true,
    compactSummary: "COMPACT_SUMMARY_SHOULD_NOT_BECOME_REPORT",
  };
  await store.saveDossierWorkflowState({
    ...state,
    candidates: state.candidates.map((item) =>
      item.id === candidateId
        ? {
            ...item,
            latestSourceFileArchive: archive,
            latestSourceFileArchiveId: archive.id,
            latestSourceFileArchiveDigest: archive.sourceDigest,
            latestSourceFileArchiveUpdatedAt: archive.updatedAt,
            sourceFileArchiveIds: [archive.id],
          }
        : item,
    ),
    updatedAt: now,
  });
  const missingCandidate = (await store.getDossierWorkflowState()).candidates.find((item) => item.id === candidateId);
  assert.equal(store.sourceFileNeedsCaseReportBackfill(missingCandidate), true);
  assert.equal(store.candidateMissingCaseReport(missingCandidate), true);
  assert.equal(store.latestArchiveMissingCaseReport(missingCandidate), true);

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return Response.json({ ok: true, status: "success", recommendationId: `case-report-refresh-${calls.length}` });
  };

  try {
    const opened = await (await authedPost({ action: "recordSourceFileOpen", candidateId })).json();
    assert.equal(opened.immediateRefresh.ok, false);
    assert.equal(opened.immediateRefresh.status, "failed");
    assert.equal(opened.immediateRefresh.failureReason, "case_report_missing_after_refresh");
    assert.equal(opened.sourceFileRefreshRequests[0].status, "failed");
    assert.equal(opened.sourceFileRefreshRequests[0].completedAt, undefined);
    assert.equal(opened.sourceFileRefreshRequests[0].reason, "case_report_missing");
    assert.equal(opened.sourceFileRefreshRequests[0].caseReportMissing, true);
    assert.equal(opened.sourceFileRefreshRequests[0].requiresCaseReportBackfill, true);
    assert.equal(calls[0].body.reason, "case_report_missing");
    assert.equal(calls[0].body.caseReportMissing, true);
    assert.equal(calls[0].body.requiresCaseReportBackfill, true);
    assert.equal(calls[0].body.siteCallbackBaseUrl, "https://example.test");
    assert.equal(calls[0].body.requestingSiteOrigin, "https://example.test");
    assert.equal(calls[0].body.sourceFileArchiveCallbackBaseUrl, "https://example.test");
    assert.equal(opened.immediateRefresh.callbackBaseSent, true);
    assert.equal(opened.immediateRefresh.callbackBaseHost, "example.test");

    const manual = await (await authedPost({
      action: "requestSourceFileRefresh",
      candidateId,
      reason: "Manual generic refresh should become case report backfill.",
    })).json();
    assert.equal(manual.immediateRefresh.ok, false);
    assert.equal(manual.immediateRefresh.failureReason, "case_report_missing_after_refresh");
    assert.equal(manual.sourceFileRefreshRequests[0].status, "failed");
    assert.equal(manual.sourceFileRefreshRequests[0].reason, "case_report_missing");
    assert.equal(manual.sourceFileRefreshRequests[0].failureReason, "case_report_missing_after_refresh");
    assert.equal(calls[1].body.reason, "case_report_missing");
    assert.equal(calls[1].body.caseReportMissing, true);
    assert.equal(calls[1].body.requiresCaseReportBackfill, true);
    assert.equal(calls[1].body.siteCallbackBaseUrl, "https://example.test");
    assert.equal(calls[1].body.requestingSiteOrigin, "https://example.test");
    assert.equal(calls[1].body.sourceFileArchiveCallbackBaseUrl, "https://example.test");
    assert.equal(manual.immediateRefresh.callbackBaseSent, true);
    assert.equal(manual.immediateRefresh.callbackBaseHost, "example.test");
    const afterRefreshState = await store.getDossierWorkflowState();
    const afterRefreshCandidate = afterRefreshState.candidates.find((item) => item.id === candidateId);
    assert.equal(afterRefreshCandidate.latestSourceFileArchive.sourceFileCaseReportV1, undefined);
    assert.equal(afterRefreshCandidate.latestSourceFileArchive.compactSummary, "COMPACT_SUMMARY_SHOULD_NOT_BECOME_REPORT");

    const withReport = {
      ...missingCandidate,
      latestSourceFileArchive: {
        ...missingCandidate.latestSourceFileArchive,
        sourceFileCaseReportV1: {
          version: "1",
          generatedAt: now,
          caseSummary: "BNL-authored report now exists.",
        },
      },
    };
    assert.equal(store.sourceFileNeedsCaseReportBackfill(withReport), false);
  } finally {
    global.fetch = originalFetch;
    delete process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL;
    delete process.env.BNL_SOURCE_FILE_REFRESH_TOKEN;
    delete process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  }
});



function bnlCaseReportFixture(label) {
  return {
    version: "1",
    generatedAt: "2026-06-10T00:00:00.000Z",
    reportStatus: "dossier_ready",
    caseSummary: `BNL-authored case report from ${label}.`,
    dossierUse: `Use preserved ${label} report for owner review only.`,
    publicSafeClaims: [`Public-safe claim from ${label}.`],
  };
}

test("Source File archive ingest preserves BNL Case File Reports from accepted wrapper shapes", async () => {
  await resetWorkflowStore();

  const created = await (await authedPost({
    action: "createManualCandidate",
    input: {
      name: "Wrapped Case Report Fixture",
      candidateType: "artist",
      reason: "Operator wants wrapper archive coverage.",
      whyNow: "BNL archive callback shape changed.",
      evidenceSummary: "Admin fixture evidence.",
    },
  })).json();
  const candidateId = created.candidate.id;
  await authedPost({ action: "promoteCandidateToSourceFile", candidateId });

  const cases = [
    {
      label: "top-level sourceFileCaseReportV1",
      expectedPath: "input.sourceFileCaseReportV1",
      input: (report) => ({ sourceFileCaseReportV1: report }),
    },
    {
      label: "sourcePackage.sourceFileCaseReportV1",
      expectedPath: "input.sourcePackage.sourceFileCaseReportV1",
      input: (report) => ({ sourcePackagePatch: { sourceFileCaseReportV1: report } }),
    },
    {
      label: "archivePayload.sourceFileCaseReportV1",
      expectedPath: "input.archivePayload.sourceFileCaseReportV1",
      input: (report) => ({ archivePayload: { sourceFileCaseReportV1: report } }),
    },
    {
      label: "archivePayload.sourcePackage.sourceFileCaseReportV1",
      expectedPath: "input.archivePayload.sourcePackage.sourceFileCaseReportV1",
      input: (report) => ({ archivePayload: { sourcePackage: { sourceFileCaseReportV1: report } } }),
    },
    {
      label: "payload.sourceFileBriefV2.caseFileReport",
      expectedPath: "input.payload.sourceFileBriefV2.caseFileReport",
      input: (report) => ({ payload: { sourceFileBriefV2: { oneLineSummary: "Wrapped interim brief.", caseFileReport: report } } }),
    },
  ];

  for (const [index, item] of cases.entries()) {
    const report = bnlCaseReportFixture(item.label);
    const shape = item.input(report);
    const sourcePackage = {
      archiveOrdinal: index,
      compactSummary: `COMPACT_SUMMARY_MUST_NOT_SYNTHESIZE_${index}`,
      ...(shape.sourcePackagePatch ?? {}),
    };
    delete shape.sourcePackagePatch;

    const result = await store.ingestDossierSourceFileArchive({
      candidateId,
      subjectName: "Wrapped Case Report Fixture",
      subjectKey: "wrapped-case-report-fixture",
      ingestKey: `wrapped-case-report-${index}`,
      sourcePackage,
      compactSummary: `COMPACT_SUMMARY_MUST_NOT_SYNTHESIZE_${index}`,
      ...shape,
    });

    assert.equal(result.archive.sourceFileCaseReportV1.caseSummary, report.caseSummary);
    assert.equal(result.archive.caseReportPresent, true);
    assert.equal(result.archive.caseReportExtractedFrom, item.expectedPath);
    assert.equal(store.latestArchiveMissingCaseReport(result.candidate), false);

    const panelText = collectDefaultVisibleText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
      summary: sourceFileReportTestSummary(),
      subjectName: "Wrapped Case Report Fixture",
      latestSourceFileArchive: result.archive,
    }));
    assert.match(panelText, /BNL Case File Report/);
    assert.match(panelText, new RegExp(item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(panelText, /caseReportPresent/);
    assert.match(panelText, new RegExp(item.expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(panelText, /COMPACT_SUMMARY_MUST_NOT_SYNTHESIZE/);
  }
});

test("Source File case-report missing detection uses normalized archive extraction without compact-summary synthesis", () => {
  const report = bnlCaseReportFixture("nested preserved archive");
  const candidateBase = {
    id: "candidate-wrapper-detection",
    name: "Wrapper Detection",
    status: "source_file_open",
    latestSourceFileArchiveId: "archive-wrapper-detection",
    latestSourceFileArchiveDigest: "digest-wrapper-detection",
    latestSourceFileArchiveUpdatedAt: "2026-06-10T00:00:00.000Z",
    sourceFileArchiveIds: ["archive-wrapper-detection"],
  };

  for (const latestSourceFileArchive of [
    { archivePayload: { sourceFileCaseReportV1: report } },
    { archivePayload: { sourcePackage: { sourceFileCaseReportV1: report } } },
    { payload: { sourceFileBriefV2: { caseFileReport: report } } },
    { archive: { sourceFileCaseReportV1: report } },
    { sourceFileArchive: { sourceFileCaseReportV1: report } },
  ]) {
    assert.equal(
      store.latestArchiveMissingCaseReport({ ...candidateBase, latestSourceFileArchive }),
      false,
    );
  }

  const compactOnlyCandidate = {
    ...candidateBase,
    latestSourceFileArchive: {
      id: "archive-wrapper-detection",
      candidateId: "candidate-wrapper-detection",
      subjectName: "Wrapper Detection",
      subjectKey: "wrapper-detection",
      sourceDigest: "digest-wrapper-detection",
      createdAt: "2026-06-10T00:00:00.000Z",
      updatedAt: "2026-06-10T00:00:00.000Z",
      archiveSize: 100,
      chunkCount: 1,
      reviewOnly: true,
      compactSummary: "COMPACT_SUMMARY_SHOULD_NOT_BECOME_REPORT",
      sourceFileBriefV2: { oneLineSummary: "Brief only is not a report." },
    },
  };
  assert.equal(store.latestArchiveMissingCaseReport(compactOnlyCandidate), true);

  const visibleText = collectDefaultVisibleText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary: sourceFileReportTestSummary(),
    latestSourceFileArchive: compactOnlyCandidate.latestSourceFileArchive,
  }));
  assert.match(visibleText, /BNL has not generated a dossier-ready Case File Report/);
  assert.doesNotMatch(visibleText, /COMPACT_SUMMARY_SHOULD_NOT_BECOME_REPORT/);

  const rawArchiveText = collectReactText(sourceSummaryPanelComponent.DossierSourceFileArchiveRawData({
    latestSourceFileArchive: compactOnlyCandidate.latestSourceFileArchive,
  }));
  assert.match(rawArchiveText, /Archive \/ Raw Source File Data/);
  assert.match(rawArchiveText, /COMPACT_SUMMARY_SHOULD_NOT_BECOME_REPORT/);
});

test("Source File immediate refresh timeout/unavailable and stale open requests do not trap retries or cross-file matching", async () => {
  await resetWorkflowStore();
  process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL = "https://bnl.example.test/internal/source-files/refresh-now";
  process.env.BNL_SOURCE_FILE_REFRESH_TOKEN = "test-refresh-token";
  process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS = "5";
  const originalFetch = global.fetch;
  global.fetch = async (_url, options = {}) =>
    new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  try {
    const first = await (await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Candidate Match Alpha" },
    })).json();
    const second = await (await authedPost({
      action: "createManualCandidate",
      input: { ...manualCandidateInput, name: "Candidate Match Beta" },
    })).json();
    await authedPost({ action: "promoteCandidateToSourceFile", candidateId: first.candidate.id });
    await authedPost({ action: "promoteCandidateToSourceFile", candidateId: second.candidate.id });

    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const state = await store.getDossierWorkflowState();
    await store.saveDossierWorkflowState({
      ...state,
      sourceFileRefreshRequests: [{
        id: "old-claimed-for-other-candidate",
        candidateId: first.candidate.id,
        subjectName: "Candidate Match Alpha",
        normalizedSubjectKey: workflow.normalizeDossierSubjectName("Candidate Match Alpha"),
        status: "claimed",
        reason: "Old claimed request should expire for display.",
        requestedAt: old,
        updatedAt: old,
        requestSource: "manual_admin",
        priority: 90,
      }],
    });

    const openedSecond = await (await authedPost({ action: "recordSourceFileOpen", candidateId: second.candidate.id })).json();
    assert.equal(openedSecond.immediateRefresh.status, "timeout");
    assert.equal(openedSecond.sourceFileRefreshRequests.some((request) => request.candidateId === second.candidate.id), true);
    const oldRequest = openedSecond.sourceFileRefreshRequests.find((request) => request.id === "old-claimed-for-other-candidate");
    assert.equal(oldRequest.status, "failed");
    assert.equal(openedSecond.sourceFileRefreshRequests.filter((request) => request.candidateId === second.candidate.id).length, 1);
  } finally {
    global.fetch = originalFetch;
    delete process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL;
    delete process.env.BNL_SOURCE_FILE_REFRESH_TOKEN;
    delete process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS;
  }
});

test("fresh Source File open still asks BNL immediately and public read model stays read-only", async () => {
  await resetWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";

  const now = new Date().toISOString();
  await store.saveDossierWorkflowState({
    version: 1,
    revision: 0,
    candidates: [{
      id: "fresh-source-candidate",
      name: "Fresh Fixture Subject",
      candidateType: "artist",
      source: "manual",
      tier: "review_candidate",
      score: 5,
      whyNow: "Fresh test fixture.",
      reason: "Fresh test fixture.",
      evidenceSummary: "Fresh source file evidence.",
      sourceFileNotes: [],
      status: "active_source_file",
      createdAt: now,
      updatedAt: now,
    }],
    drafts: [],
    recommendations: [{
      id: "fresh-source-rec",
      type: "new_subject",
      subjectName: "Fresh Fixture Subject",
      targetCandidateId: "fresh-source-candidate",
      status: "attached_to_source_file",
      reason: "Fresh BNL enrichment.",
      sourceLanes: ["rd_context"],
      createdAt: now,
      updatedAt: now,
      ingestSource: "bnl_source_file_enrichment",
      ingestedAt: now,
    }],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const opened = await (await authedPost({ action: "recordSourceFileOpen", candidateId: "fresh-source-candidate" })).json();
  assert.equal(opened.refresh.decision.needed, false);
  assert.equal(opened.immediateRefresh.status, "unavailable");
  assert.equal(opened.sourceFileRefreshRequests.length, 1);
  assert.equal(opened.sourceFileRefreshRequests[0].requestSource, "opened_source_file");

  const beforePublicRead = await store.getDossierWorkflowState();
  const publicRead = await (await sourceFilesGet("?subject=Fresh%20Fixture%20Subject")).json();
  assert.equal(publicRead.ok, true);
  assert.equal(publicRead.mutation, false);
  assert.deepEqual(await store.getDossierWorkflowState(), beforePublicRead);
});

test("bot can mark Source File refresh request failed without public workflow side effects", async () => {
  await resetWorkflowStore();
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";

  const created = await (await authedPost({
    action: "createManualCandidate",
    input: {
      name: "Failed Refresh Fixture",
      reason: "Operator wants failure status coverage.",
      whyNow: "Testing refresh request failure.",
      evidenceSummary: "Failure fixture evidence.",
    },
  })).json();
  const candidateId = created.candidate.id;
  await authedPost({ action: "promoteCandidateToSourceFile", candidateId });
  const requested = await (await authedPost({ action: "requestSourceFileRefresh", candidateId })).json();
  const requestId = requested.refresh.request.id;

  const failed = await (await refreshRequestsPost({
    requestId,
    status: "failed",
    failureReason: "Bot worker test failure.",
  })).json();
  assert.equal(failed.request.status, "failed");
  assert.equal(failed.request.failureReason, "Bot worker test failure.");
  assert.equal(failed.publishesPublicDossier, false);

  const state = await store.getDossierWorkflowState();
  assert.equal(state.drafts.length, 0);
  assert.equal(state.recommendations.length, 0);
  assert.equal(state.candidates.some((candidate) => candidate.id === candidateId), true);
});


test("Source File display recommendations prefer completed and newest BNL enrichments without pending false refresh", () => {
  const now = "2026-06-01T00:00:00.000Z";
  const candidate = {
    id: "source-refresh-candidate",
    name: "Source Refresh Subject",
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: 5,
    whyNow: "Refresh selection test.",
    reason: "Refresh selection test.",
    evidenceSummary: "Existing source-file fallback evidence.",
    sourceFileNotes: [],
    status: "active_source_file",
    createdAt: now,
    updatedAt: now,
  };
  const olderBnl = {
    id: "older-bnl-rec",
    type: "new_subject",
    subjectName: candidate.name,
    targetCandidateId: candidate.id,
    status: "attached_to_source_file",
    reason: "Older BNL refresh reason.",
    evidenceSummary: "Older BNL evidence should not control the Source File.",
    knownContext: ["Older BNL known context."],
    usefulEvidence: ["Older BNL useful evidence."],
    sourceLanes: ["rd_context"],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ingestedAt: "2026-06-01T00:00:00.000Z",
    ingestSource: "bnl_source_file_enrichment",
  };
  const newerBnl = {
    ...olderBnl,
    id: "newer-bnl-rec",
    reason: "Newer BNL refresh reason.",
    evidenceSummary: "Newer BNL evidence controls the Source File.",
    knownContext: ["Newer BNL known context."],
    usefulEvidence: ["Newer BNL useful evidence."],
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    ingestedAt: "2026-06-02T00:00:00.000Z",
  };
  const pendingRequest = {
    id: "pending-refresh-request",
    candidateId: candidate.id,
    subjectName: candidate.name,
    normalizedSubjectKey: workflow.normalizeDossierSubjectName(candidate.name),
    status: "pending",
    reason: "Pending refresh should not claim fresh data yet.",
    requestedAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    requestSource: "manual_admin",
    priority: 90,
  };
  const completedRequest = {
    ...pendingRequest,
    id: "completed-refresh-request",
    status: "completed",
    completedAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    completedByRecommendationId: newerBnl.id,
  };

  const completedSelection = sourceFileSummary.selectDossierSourceFileDisplayRecommendations({
    candidate,
    recommendations: [olderBnl, newerBnl],
    refreshRequests: [completedRequest],
  });
  assert.equal(completedSelection[0].id, newerBnl.id);

  const completedByIdSelection =
    sourceFileSummary.selectDossierSourceFileDisplayRecommendations({
      candidate,
      recommendations: [
        olderBnl,
        {
          ...newerBnl,
          subjectName: "BNL Returned Explicit Completed ID",
          subjectKey: "bnl returned explicit completed id",
          targetCandidateId: undefined,
        },
      ],
      refreshRequests: [completedRequest],
    });
  assert.equal(completedByIdSelection[0].id, newerBnl.id);

  const completedSummary = sourceFileSummary.createDossierSourceFileSummary({
    candidate,
    recommendations: completedSelection,
  });
  assert.deepEqual(completedSummary.knownContext, ["Newer BNL known context."]);
  assert.match(completedSummary.usefulEvidence.join(" "), /Newer BNL evidence controls/);
  assert.doesNotMatch(completedSummary.knownContext.join(" "), /Older BNL/);

  const newestFallbackSelection = sourceFileSummary.selectDossierSourceFileDisplayRecommendations({
    candidate,
    recommendations: [olderBnl, newerBnl],
    refreshRequests: [],
  });
  assert.equal(newestFallbackSelection[0].id, newerBnl.id);

  const subjectKeyFallbackSelection = sourceFileSummary.selectDossierSourceFileDisplayRecommendations({
    candidate,
    recommendations: [
      olderBnl,
      {
        ...newerBnl,
        id: "subject-key-bnl-rec",
        targetCandidateId: undefined,
        subjectKey: workflow.normalizeDossierSubjectName(candidate.name),
        knownContext: ["Subject-key BNL known context."],
        updatedAt: "2026-06-05T00:00:00.000Z",
        ingestedAt: "2026-06-05T00:00:00.000Z",
      },
    ],
    refreshRequests: [],
  });
  assert.equal(subjectKeyFallbackSelection[0].id, olderBnl.id);

  const pendingSelection = sourceFileSummary.selectDossierSourceFileDisplayRecommendations({
    candidate,
    recommendations: [olderBnl],
    refreshRequests: [pendingRequest],
  });
  const pendingSummary = sourceFileSummary.createDossierSourceFileSummary({
    candidate,
    recommendations: pendingSelection,
  });
  assert.equal(pendingSelection[0].id, olderBnl.id);
  assert.match(pendingSummary.usefulEvidence.join(" "), /Older BNL evidence/);
});

test("admin Source File page uses immediate refresh status/retry UI and preserves sections", () => {
  const page = source("src/app/admin/dossiers/candidates/[candidateId]/page.tsx");
  const pageCopy = `${normalizedSource("src/app/admin/dossiers/candidates/[candidateId]/page.tsx")} ${normalizedSource("src/components/DossierSourceFileSummaryPanel.tsx")}`;

  assert.match(page, /window\.setInterval/);
  assert.match(page, /pollForRefreshCompletion/);
  assert.match(page, /openRefreshStatuses/);
  assert.match(page, /isOpenRefreshRequest/);
  assert.match(page, /fetchWorkflowPayload\(\{ cacheBust: true \}\)/);
  assert.match(page, /router\.refresh\(\)/);
  assert.match(page, /window\.location\.reload\(\)/);
  assert.match(page, /window\.clearInterval\(interval\)/);
  assert.match(page, /completedByRecommendationId/);
  assert.match(page, /setRefreshPollingTarget\(\{ candidateId, requestId: refresh\.request\.id \}\)/);
  assert.match(page, /UPDATING SOURCE FILE/);
  assert.match(page, /FILE UPDATED/);
  assert.match(page, /FILE NOT UPDATED/);
  assert.match(page, /RETRYING UPDATE/);
  assert.match(page, /Last-known BNL data is not current for this page open/);
  assert.doesNotMatch(page, /Diagnostics: request/);
  assert.doesNotMatch(page, /Refresh Requested/);
  assert.doesNotMatch(page, /Waiting for BNL/);

  for (const label of [
    "Source File header / refresh status",
    "BNL Case File Report",
    "Proposed Dossier status",
    "Source Notes / Admin Addendums",
    "Archive / Raw Source File Data",
    "Identity links / aliases",
    "Advanced Tools",
    "Phase 4 — Owner Review",
    "Diagnostics",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
});

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

test("admin dossier dashboard is a simplified subject sorting overview", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Dossier Control Center",
    "Sort noticed subjects, review updates, and open Source Files.",
    "Summary",
    "Candidates",
    "Dossier Updates",
    "Source Files",
    "Needs Info",
    "Proposed Dossiers",
    "Owner Review waiting",
    "Archive / Dismissed / Trash",
    "Manual Signal",
    "Use this only when BNL has not suggested something yet. This creates a BNL Signal, not a direct source file.",
    "Why BNL noticed",
    "Strength / confidence",
    "Identity status",
    "Suggested next step",
    "Identity: Clear",
    "Identity: Possible Match",
    "Identity: Connected to Existing Subject",
    "Identity: Needs Confirmation",
    "Existing Dossier Match",
    "Possible Duplicate",
    "Why they matter / engagement summary",
    "Dossier status",
    "No Proposed Dossier",
    "Draft started",
    "Needs update from Source File",
    "Ready for Owner Review",
    "Owner changes requested",
    "Approved / publish later",
    "Review Candidate",
    "Review Update",
    "Review Source File",
    "Review Record",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  assert.match(page, /href="\/admin\/dossiers\/owner-review"/);
  assert.match(page, /href=\{`\/admin\/dossiers\/candidates\/\$\{candidate\.id\}`\}/);
  assert.match(page, /href=\{`\/admin\/dossiers\/recommendations\/\$\{recommendation\.id\}`\}/);
  assert.doesNotMatch(page, /`\/admin\/dossiers\/drafts\/\$\{openDraftId\}`/);
  assert.doesNotMatch(page, />\s*Open\s*</);
  assert.doesNotMatch(page, /Add Missing Info|Review Identity|Review Signal|Review Source Update|Open Draft|Review Draft|Review Archived|Review Closed Signal|Review Trash/);
  assert.doesNotMatch(page, /PhaseRail|Numbered dossier phases|Workflow map|System Boundaries/);
  assert.doesNotMatch(page, /Duplicate Analysis|Record Compactor|View Warning \/ Open Merge Review/);
  assert.doesNotMatch(page, /candidateAction\(candidate\.id, "archiveCandidate"\)/);
  assert.doesNotMatch(page, /candidateAction\(\s*candidate\.id,\s*"permanentlyDeleteCandidate"/);
  assert.doesNotMatch(page, />Delete Permanently</);
  assert.doesNotMatch(page, /Save Draft/);
  assert.doesNotMatch(page, /Submit for Owner Review/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.doesNotMatch(page, /opensDraft/);
  assert.match(page, /if \(loading\)/);
  assert.match(page, /if \(error \|\| !payload\)/);
});

test("dossier admin pages keep dashboard simple while detail pages retain workflow controls", () => {
  const dashboard = normalizedSource("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Summary",
    "Candidates",
    "Dossier Updates",
    "Source Files",
    "Archive / Dismissed / Trash",
    "Owner Review",
  ]) {
    assertIncludesCopy(dashboard, label);
  }
  for (const removed of [
    "Phase 1 — BNL Source File",
    "Phase 2 — Proposed Dossier + BNL Edit Chat",
    "Archive / History",
    "System Boundaries",
  ]) {
    assert.ok(!dashboard.includes(removed));
  }

  const sourceFileCopy = normalizedSource(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  assertIncludesCopy(sourceFileCopy, "BNL Case File Report");
  assertIncludesCopy(sourceFileCopy, "Archive");
  assertIncludesCopy(sourceFileCopy, "Delete Permanently");
  assertIncludesCopy(sourceFileCopy, "Restore");
  assertIncludesCopy(sourceFileCopy, "Promote to BNL Source File");
  assertIncludesCopy(sourceFileCopy, "DELETE SOURCE FILE");
  assertIncludesCopy(sourceFileCopy, "Public dossiers and published data are not deleted");
  assertIncludesCopy(sourceFileCopy, "Proposed Dossier status");
  assertIncludesCopy(sourceFileCopy, "Create one only from reviewed, public-safe Source File material.");

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
    "Internal working material only",
    "not public copy",
    "BNL Case File Report",
        "Source Notes / Admin Addendums",
    "Diagnostics",
    "Review Context / Possible Supporting Evidence",
    "Public-Safe Facts Pending Owner/Admin Approval",
    "Internal-Only Notes",
    "Source Warnings",
    "Conflicts / Needs Review",
    "Identity links / aliases",
    "Advanced Tools",
    "Do Not Say",
    "dossier question",
    "Proposed Dossier status",
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
  assertIncludesCopy(recommendationPage, "BNL Signals are incoming source/recommendation inputs");
  assertIncludesCopy(recommendationPage, "Signals can become Dossier Seeds, attach to Case Files, create Dossier Updates, or suggest Identity Links");
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
    "Save Proposed Dossier",
    "Complete Proposed Dossier",
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
  assert.match(page, /PublicCopyGuardWarning/);
  assert.match(page, /Clean draft public copy/);
  assert.match(page, /Do not send to owner review yet/);
  assert.match(page, /sanitizeDossierPublicCopy/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.doesNotMatch(page, /publishDraft/);
});



test("shared DossierPageView preserves PR 155 dossier API and public layout", () => {
  const sharedView = source("src/components/DossierPageView.tsx");
  const viewModel = source("src/lib/dossier-page-view-model.ts");
  assert.match(sharedView, /export type DossierPageViewModel/);
  assert.match(sharedView, /export function DossierPageView\(\{ dossier \}: \{ dossier: DossierPageViewModel \}\)/);
  assert.doesNotMatch(sharedView, /entry: DossierPageViewModel/);
  for (const section of [
    "Dossier Record",
    "Intelligence Brief",
    "Attached Files",
    "Terminal Readout",
    "BARCODE_NETWORK // DOSSIER QUERY",
  ]) {
    assertIncludesCopy(sharedView.replace(/\s+/g, " "), section);
  }
  assert.match(sharedView, /InfoRow label="Role" value=\{dossier\.role\}/);
  assert.match(sharedView, /dossier\.tags\.map/);
  assert.match(sharedView, /dossier\.primaryLink/);
  assert.match(viewModel, /databaseEntryToDossierPageViewModel/);
  assert.match(viewModel, /draftToDossierPreviewViewModel/);
  assert.match(viewModel, /import type \{ DossierPageViewModel \} from "@\/components\/DossierPageView"/);
});

test("admin dirty-copy warning stays outside shared public DossierPageView", () => {
  const draftPage = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  const sharedViewPath = "src/components/DossierPageView.tsx";
  const sharedView = fs.existsSync(path.join(projectRoot, sharedViewPath))
    ? source(sharedViewPath)
    : "";
  assert.match(draftPage, /PublicCopyGuardWarning/);
  assert.match(draftPage, /Clean draft public copy/);
  assert.match(draftPage, /Source material is not strong enough for public dossier copy yet/);
  assert.doesNotMatch(sharedView, /Clean draft public copy/);
  assert.doesNotMatch(sharedView, /PublicCopyGuardWarning/);
});


test("Source File page renders organized BNL Source File workspace with collapsed diagnostics", () => {
  const routePath = "src/app/admin/dossiers/candidates/[candidateId]/page.tsx";
  assert.equal(fs.existsSync(path.join(projectRoot, routePath)), true);
  const page = source(routePath);
  const pageCopy = normalizedSource(routePath);

  for (const label of [
    "BNL Source File",
    "Source File status / refresh state",
    "BNL take / why this file matters",
    "Known facts",
    "Evidence receipts / source lanes",
    "Source notes",
    "Missing info / open questions",
    "Public-safety notes",
    "Do-not-say / review-only notes",
    "Identity links / aliases",
    "Proposed Dossier status",
    "Next recommended action",
    "Diagnostics — collapsed by default",
    "UPDATING SOURCE FILE",
    "FILE UPDATED",
    "FILE NOT UPDATED",
    "RETRYING UPDATE",
    "Create Proposed Dossier Draft",
    "Open Proposed Dossier Draft",
    "Update Draft From Source File",
    "Draft from Source File",
    "Public-safe draft",
    "Review-only evidence",
    "Owner Review remains the final approval lane",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  assert.match(page, /sourceFileFreshForOpen/);
  assert.match(page, /sourceFileOpenState\.running/);
  assert.match(page, /isStaleOpenRefreshRequest/);
  assert.match(page, /action: "createDraftFromCandidate"/);
  assert.match(page, /action: "updateDraftFromSourceFile"/);
  assert.match(page, /action: "addSourceFileNote"/);
  assert.match(page, /<details className="border border-border bg-surface p-5 text-sm text-muted">[\s\S]*Diagnostics — collapsed by default/);
  assert.ok(page.indexOf("Diagnostics — collapsed by default") > page.indexOf("Operator Source File Summary"));
  assert.ok(page.indexOf("Raw Source File Data") > page.indexOf("Diagnostics — collapsed by default"));
  assert.ok(page.indexOf('title="BNL take / why this file matters"') < page.indexOf('title="Known facts"'));
  assert.ok(page.indexOf('title="Known facts"') < page.indexOf('title="Evidence receipts / source lanes"'));
  assert.ok(page.indexOf('title="Evidence receipts / source lanes"') < page.indexOf('title="Source notes"'));
  assert.ok(page.indexOf('title="Source notes"') < page.indexOf('title="Missing info / open questions"'));
  assert.ok(page.indexOf('title="Missing info / open questions"') < page.indexOf('title="Public-safety notes"'));
  assert.ok(page.indexOf('title="Public-safety notes"') < page.indexOf('title="Do-not-say / review-only notes"'));
  assert.ok(page.indexOf('title="Do-not-say / review-only notes"') < page.indexOf('title="Identity links / aliases"'));
  assert.ok(page.indexOf('title="Identity links / aliases"') < page.indexOf('title="Proposed Dossier status"'));
  assert.ok(page.indexOf('title="Proposed Dossier status"') < page.indexOf('title="Next recommended action"'));
  assert.doesNotMatch(pageCopy, /Review source context and decide whether to attach or convert into a BNL Source File/);
  assert.doesNotMatch(pageCopy, /Advanced actions/);
  assert.doesNotMatch(pageCopy, /automatic publishing|canonical profile|public identity merge/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
  assert.doesNotMatch(page, /publishDraft/);
});


test("dossier public-copy guard flags internal starter and source phrases", () => {
  for (const phrase of [
    "Starter note only: internal scaffold",
    "Starter evidence note: internal scaffold",
    "Public safety: private_review_required",
    "Missing info: confirm owner-approved public copy",
    "broadcast_memory: internal lane",
    "Do not expose private Discord identity",
    "Verify public-safe wording before publishing.",
    "Internal discovery classification: review-only",
    "BNL discovery is review-only until admin review.",
    "Medium-confidence BNL discovery.",
    "Review before converting, merging, aliasing, drafting, or publishing.",
    "source-file note copied into public copy",
    "source file note copied into public copy",
    "dossier seed for internal workflow",
    "add a dossier entry",
  ]) {
    assert.equal(
      publicCopyGuard.containsDossierPublicCopyJunk(phrase),
      true,
      `${phrase} should be blocked from public draft fields`,
    );
  }
});

test("dossier public-copy guard flags backend source junk but allows human copy", () => {
  assert.equal(
    publicCopyGuard.containsDossierPublicCopyJunk(
      "Starter note only: user_profiles/local_profile_observed found a source lane mapping",
    ),
    true,
  );
  assert.equal(
    publicCopyGuard.containsDossierPublicCopyJunk(
      [
        "conversations/public_discord_observed: public_home conversation model mentions LostMarbles",
        "conversations/public_discord_observed: public_home conversation model mentions LostMarbles",
      ].join("\n"),
    ),
    true,
  );
  assert.equal(
    publicCopyGuard.containsDossierPublicCopyJunk(
      "Bridge source lane mapping: conversations -> unknown, user_profiles -> unknown",
    ),
    true,
  );
  assert.equal(
    publicCopyGuard.containsDossierPublicCopyJunk(
      "A community artist known for vivid live sets and recurring BARCODE Radio collaborations.",
    ),
    false,
  );
  assert.equal(
    publicCopyGuard.sanitizeDossierPublicCopy(
      [
        "A community artist with a public-safe dossier summary.",
        "conversations/public_discord_observed: source lane mapping",
        "A community artist with a public-safe dossier summary.",
      ].join("\n"),
    ),
    "A community artist with a public-safe dossier summary.",
  );
});

test("draft public-copy validation warns on dirty proposed fields", () => {
  const warnings = publicCopyGuard.validateDossierPublicDraftFields({
    name: "Debug Subject",
    role: "candidateId: dossier_candidate_debug_12345",
    summary: "conversations/public_discord_observed conversations/public_discord_observed",
    notes: "Starter evidence note: Public safety: review before publishing",
    tags: ["artist", "user_profiles/local_profile_observed"],
    proposedTags: ["source file", "manual-review"],
    primaryLink: {
      label: "ingestKey bnl:debug-source",
      url: "https://example.test",
      type: "website",
    },
  });

  assert.deepEqual(
    warnings.map((warning) => warning.label),
    ["Role", "Summary", "Notes", "Tags", "Proposed tags", "Primary Link label"],
  );
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
  const summaryPanel = normalizedSource("src/components/DossierSourceFileSummaryPanel.tsx");
  const candidatePage = `${normalizedSource("src/app/admin/dossiers/candidates/[candidateId]/page.tsx")} ${displayHelper} ${summaryHelper} ${summaryPanel}`;
  const recommendationPage = `${normalizedSource("src/app/admin/dossiers/recommendations/[recommendationId]/page.tsx")} ${displayHelper}`;

  for (const label of [
    "HumanReadableNoteView",
    "BNL Case File Report",
    "Source File header / refresh status",
    "BNL Case File Report",
    "Relationship Context",
    "BNL thinks; the site displays; admins decide",
    "Evidence Summary",
    "Recommended Next Steps",
    "Recommended Next Steps",
    "Subject",
    "Public readiness",
    "Identity certainty",
    "Recommended next step",
    "Diagnostics only. Not BNL Source File claims.",
    "Older BNL Review Note",
    "BNL Review Addendum",
    "Review-only context connected to this subject",
    "Diagnostics only. Not BNL Source File claims.",
    "warnings",
    "Recommended Next Steps",
    "Review-only",
    "BNL Case File Report",
    "Review-only",
  ]) {
    assertIncludesCopy(candidatePage, label);
  }

  for (const label of [
    "Plain-English review view",
    "BNL Signal Takeaway",
    "Developer / Raw Source Audit",
    "Adds review context",
    "Thin: routing only",
    "Claimed / Needs Review",
    "Review-only",
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

test("dashboard uses actual workflow ids, source metrics, and simplified overview filtering", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  assert.match(page, /href=\{`\/admin\/dossiers\/candidates\/\$\{candidate\.id\}`\}/);
  assert.match(page, /href=\{`\/admin\/dossiers\/recommendations\/\$\{recommendation\.id\}`\}/);
  assert.doesNotMatch(page, /`\/admin\/dossiers\/drafts\/\$\{openDraftId\}`/);
  assert.match(page, /candidateActionLabel/);
  assert.match(page, /recommendationActionLabel/);
  assert.match(page, /dossierUpdateActionLabel/);
  assert.match(page, /sourceFileActionLabel/);
  assert.match(page, /Review Record/);
  assert.match(page, /activeCandidateStatuses/);
  assert.match(page, /activeCandidates = candidates\.filter/);
  assert.match(page, /activeDraftStatuses/);
  assert.match(page, /closedDraftStatuses/);
  assert.match(page, /getDossierSourceFileMetrics/);
  assert.match(page, /sourceFilesWithUnappliedNotes/);
  assert.match(page, /sourceFilesWithDrafts/);
  assert.match(page, /metrics\?\.sourceDepth/);
  assert.match(page, /Dossier status/);
  assert.match(page, /identityBadgeForCandidate/);
  assert.match(page, /identityBadgeForRecommendation/);
  assert.match(page, /Archive \/ Dismissed \/ Trash/);
  assert.doesNotMatch(page, /href=\{`\/admin\/dossiers\/duplicates\/\$\{group\.id\}`\}/);
  assert.doesNotMatch(page, /View Warning \/ Open Merge Review/);
  assert.doesNotMatch(page, />Deny<|>Deny<\/button>/);
});

test("dashboard frames manual recommendation seed as collapsed fallback", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  for (const label of [
    "Manual Signal",
    "Use this only when BNL has not suggested something yet. This creates a BNL Signal, not a direct source file.",
    "Create Manual Signal",
    "Candidates",
    "Source Files",
    "Owner Review",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }
  assert.doesNotMatch(page, /createManualCandidate/);
  assert.doesNotMatch(page, /Create Manual Candidate/);
  assert.doesNotMatch(page, /fetch\("\/api\/bnl/);
});



test("Subject Consolidation Queue renders action summary, review cards, blocked lane, and safe copy", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");

  for (const label of [
    "Subject Consolidation Queue",
    "Subject Consolidation: clear",
    "Show consolidation details",
    "Run Subject Consolidation",
    "Auto-consolidation summary",
    "Run Subject Consolidation will:",
    "Needs Review",
    "Blocked",
    "Subject Consolidation Complete",
    "public dossier update signals.",
    "diagnostic artifacts archived/hidden",
    "BNL refresh triggered / queued / needed",
    "skipped items with reasons",
    "blocked items with reasons",
    "remaining review-needed count",
    "publish 0 public pages",
    "change 0 public dossier text",
    "keep internal aliases internal",
    "Similar or ambiguous subjects requiring admin judgment",
    "Incoming Cluster",
    "Kept Source File",
    "Why this needs review:",
    "Recommended action:",
    "Why this target is being kept:",
    "Incoming item count:",
    "Item types summarized:",
    "BNL consolidation brief needed",
    "BNL consolidation brief needed before review.",
    "Action: Generate BNL Consolidation Brief",
    "Generate BNL Consolidation Brief",
    "Requires companion BNL summary PR",
    "Blocked / Needs Info",
    "Target selection unavailable:",
    "Target options",
    "Create Source File: {keptName}",
    "Create Dossier Update: {publicDossierName}",
    "No usable signal cluster found.",
    "Already represented",
    "Internal operation:",
    "What will not change",
    "Blocked reason:",
    "What must be fixed first:",
    "Consolidate Into Kept Source File",
    "Consolidate Into ${keptName}",
    "Create Source File: {keptName}",
    "Create Dossier Update: {publicDossierName}",
    "Keep Separate / Not Same Subject",
    "Select Different Target",
    "Confirm Consolidation",
    "Cancel",
    "View Kept Source File",
    "View New Source File",
    "View Dossier Update Workspace",
    "Raw / Source Details",
    "Diagnostics/Test Artifacts",
    "Diagnostics/Test Artifacts — collapsed by default",
    "Archive Diagnostic Artifact:",
    "Confirm Consolidation",
    "Cancel",
    "View Kept Source File",
    "View New Source File",
    "View Dossier Update Workspace",
    "Incoming cluster collapsed after completion.",
    "Consolidating…",
    "Resolved just now",
    "Consolidated into kept Source File.",
    "Source File Created",
    "Dossier Update Workspace Created",
    "Marked separate.",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  assert.match(page, /createDossierPopulationAudit/);
  assert.match(page, /postWorkflow\(\{ action: "runSubjectConsolidation" \}\)/);
  assert.match(page, /isSubjectConsolidationClear && !consolidationResult/);
  assert.match(page, /setConfirmation\(\{[\s\S]*?groupId: group\.id,[\s\S]*?kind: "consolidate"/);
  assert.match(page, /onClick=\{\(\) => consolidateSubjectGroup\(\)\}/);
  assert.match(page, /Incoming cluster collapsed after completion/);
  assert.match(source("src/lib/dossier-workflow.ts"), /export type SubjectConsolidationBrief/);
  assert.match(source("src/lib/dossier-workflow.ts"), /generatedBy: "BNL"/);
  assert.match(source("src/lib/dossier-workflow.ts"), /isDiagnosticTestArtifactCandidate/);
  assert.match(source("src/lib/dossier-workflow.ts"), /isConsolidationResolvedCandidate/);
  assert.match(page, /!isConsolidationResolvedCandidate\(candidate\)/);
  assert.match(source("src/lib/dossier-workflow-store.ts"), /bundleExactPublicDossierUpdateSignals/);
  assert.doesNotMatch(pageCopy, /Source File Population Audit|Population Audit|Open Recommendation|Open Target|Open Incoming|Merge Into Kept Source File|Attach to Kept Source File|Create Source File From These Signals|Create Dossier Update Workspace without public dossier\/context/);
  const queueCopy = pageCopy.slice(pageCopy.indexOf("Subject Consolidation Queue"), pageCopy.indexOf("Population Method Audit", pageCopy.indexOf("Subject Consolidation Queue")));
  assert.doesNotMatch(queueCopy, /recommendation\.reason|recommendation\.evidenceSummary|raw recommendation\.reason|raw recommendation\.summary/);
  assert.doesNotMatch(pageCopy, /Confirmed aliases count: \{record\.confirmedAliasCount\}/);
  assert.doesNotMatch(pageCopy, /source notes count 0/i);
});



test("Population Method Audit renders read-only admin intake map states", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");

  for (const label of [
    "Population Method Audit",
    "Population Method Audit: clear",
    "populationMethodHealthy ? \"Population Method Audit: clear\" : \"Population Method Audit: needs review\"",
    "Population Method Audit / Intake Map",
    "All resolved records have visible destinations or valid archive/diagnostic status. No orphaned intake records detected.",
    "records need attention.",
    "Intake Summary",
    "BNL recommendations",
    "manual admin records",
    "public dossier update signals",
    "source file refresh/archive records",
    "diagnostic/test artifacts",
    "unknown origin records",
    "Lane Map",
    "Active Source Files",
    "Candidate Intake",
    "Dossier Update Workspaces",
    "Public Dossier Update Signals",
    "Resolved Incoming Records",
    "Diagnostics",
    "Archived/Closed",
    "Needs Population Review",
    "Warnings / Problems",
    "Affected subject:",
    "Affected IDs",
    "Source type",
    "Current status",
    "Expected lane",
    "Detected destination",
    "Recommended admin next step",
    "Hidden Records With Destinations",
    "Hidden Records Without Destinations",
    "Destination Workspaces",
    "View Source Record",
    "View Destination Workspace",
    "View Public Dossier Match",
    "Copy Record IDs",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  assert.match(page, /createDossierPopulationMethodAudit/);
  assert.match(page, /open=\{!populationMethodHealthy\}/);
  assert.match(page, /populationMethodAudit\.warnings\.length === 0 &&[\s\S]*populationMethodNeedsReviewCount === 0/);
  assert.doesNotMatch(source("src/app/database/[slug]/page.tsx"), /Population Method Audit|Intake Map|Copy Record IDs/);

  const auditCopy = pageCopy.slice(
    pageCopy.indexOf("Population Method Audit / Intake Map"),
    pageCopy.indexOf("Incoming BNL Signals", pageCopy.indexOf("Population Method Audit / Intake Map")),
  );
  assert.doesNotMatch(auditCopy, /fix automatically|Fix Automatically|Run Subject Consolidation|Confirm Consolidation|Consolidate Into|Create Source File|Create Dossier Update|Keep Separate|Select Different Target|merge candidates|Merge button|publish public pages|change public dossier text/i);
});

test("Population Method Audit lives in the bottom Diagnostics & Maintenance drawer", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  const subjectConditionalIndex = page.indexOf("isSubjectConsolidationClear && !consolidationResult");
  const subjectQueueIndex = page.indexOf("Subject Consolidation Queue");
  const consolidationResultIndex = page.indexOf("consolidationResult &&");
  const sourceFilesIndex = page.indexOf('eyebrow="Source Files"');
  const archiveIndex = page.indexOf("Archive / Dismissed / Trash", sourceFilesIndex);
  const drawerIndex = page.indexOf("Diagnostics & Maintenance");
  const ownerReviewIndex = page.indexOf("Owner Review", drawerIndex);
  const populationAuditIndex = page.indexOf("Population Method Audit / Intake Map");
  const bnlDiagnosticsIndex = page.indexOf("BNL Signal Diagnostics — filed/non-dossier details collapsed");
  const diagnosticArtifactsIndex = page.indexOf("Diagnostics/Test Artifacts — collapsed by default");
  const clearBranch = page.slice(subjectConditionalIndex, subjectQueueIndex);
  const fullQueueBranch = page.slice(subjectQueueIndex, drawerIndex);
  const normalDashboardCopy = page.slice(0, drawerIndex);

  assert.ok(subjectConditionalIndex >= 0, "Subject Consolidation clear conditional exists");
  assert.ok(subjectQueueIndex > subjectConditionalIndex, "Subject Consolidation queue state still renders");
  assert.ok(consolidationResultIndex > subjectQueueIndex, "consolidationResult state still renders inside the queue state");
  assert.ok(sourceFilesIndex > subjectQueueIndex, "normal Source Files section renders before maintenance diagnostics");
  assert.ok(archiveIndex > sourceFilesIndex, "archive/trash stays near the bottom of the working dashboard");
  assert.ok(drawerIndex > archiveIndex, "Diagnostics & Maintenance is a bottom drawer after normal work sections");
  assert.ok(ownerReviewIndex > drawerIndex, "Owner Review link remains after the maintenance drawer");
  assert.ok(populationAuditIndex > drawerIndex, "Population Method Audit content is inside the maintenance drawer");
  assert.ok(bnlDiagnosticsIndex > drawerIndex, "BNL filed/non-dossier diagnostics are inside the maintenance drawer");
  assert.ok(diagnosticArtifactsIndex > drawerIndex, "Diagnostic/test artifacts are inside the maintenance drawer");
  assert.doesNotMatch(clearBranch, /Population Method Audit|Population Method:/);
  assert.doesNotMatch(fullQueueBranch, /Population Method Audit \/ Intake Map|BNL Signal Diagnostics|Diagnostics\/Test Artifacts — collapsed by default/);
  assert.doesNotMatch(normalDashboardCopy, /Population Method Audit \/ Intake Map|BNL Signal Diagnostics|Diagnostics\/Test Artifacts — collapsed by default/);
  assert.match(page, /<details className="border border-border bg-surface\/70 p-5">\s*<summary className="cursor-pointer text-xl font-bold text-foreground">\s*Diagnostics & Maintenance/, "maintenance drawer is collapsed by default");
  assertIncludesCopy(pageCopy, "Subject Consolidation: clear");
  assertIncludesCopy(pageCopy, "Subject Consolidation Queue");
  assertIncludesCopy(pageCopy, "Subject Consolidation Complete");
  assertIncludesCopy(pageCopy, "Population Method Audit: clear");
  assertIncludesCopy(pageCopy, "Population Method Audit: needs review");
  assertIncludesCopy(pageCopy, "public pages published");
  assertIncludesCopy(pageCopy, "public dossier text changed");
  assert.doesNotMatch(source("src/app/database/[slug]/page.tsx"), /Population Method Audit|Intake Map|Copy Record IDs/);
});

test("Population Method Audit classifies origins, lanes, visibility, destinations, and warnings", () => {
  const now = "2026-06-12T00:00:00.000Z";
  const candidate = (overrides) => ({
    id: overrides.id,
    name: overrides.name,
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: 5,
    whyNow: "Population audit fixture",
    reason: "Population audit fixture",
    evidenceSummary: "Population audit fixture",
    status: "active_source_file",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  const recommendation = (overrides) => ({
    id: overrides.id,
    type: "new_subject",
    subjectName: overrides.subjectName,
    status: "new",
    reason: "Population audit fixture",
    confidence: "medium",
    sourceLanes: ["public_discord"],
    createdAt: now,
    updatedAt: now,
    createdBy: "bnl",
    ingestSource: "bnl",
    ...overrides,
  });

  const publicDossiers = [{ id: "PUB-196", name: "Public Subject" }];
  const candidates = [
    candidate({ id: "active-source", name: "Active Source", status: "active_source_file", source: "bnl_dynamic_candidate_discovery", latestSourceFileArchiveUpdatedAt: now }),
    candidate({ id: "candidate-intake", name: "Candidate Intake", status: "candidate_intake", source: "manual" }),
    candidate({ id: "dossier-update", name: "Public Subject", status: "existing_dossier_update", source: "manual", existingDossierMatch: { id: "PUB-196", name: "Public Subject", confidence: "high" }, sourceRecommendationIds: ["resolved-public-signal"] }),
    candidate({ id: "archived-source", name: "Archived Source", status: "archived", source: "manual" }),
    candidate({ id: "merged-valid", name: "Merged Valid", status: "merged", source: "manual", mergedIntoCandidateId: "active-source" }),
    candidate({ id: "merged-missing", name: "Merged Missing", status: "merged", source: "manual", mergedIntoCandidateId: "missing-target" }),
    candidate({ id: "hidden-public-signal", name: "Public Subject", status: "candidate_intake", source: "manual", existingDossierMatch: { id: "PUB-196", name: "Public Subject", confidence: "high" }, routingReason: "bundled_into_dossier_update" }),
    candidate({ id: "hidden-public-orphan", name: "Orphan Public", status: "candidate_intake", source: "manual", existingDossierMatch: { id: "PUB-MISSING", name: "Orphan Public", confidence: "high" }, routingReason: "bundled_into_dossier_update" }),
    candidate({ id: "hidden-workspace", name: "Hidden Workspace", status: "existing_dossier_update", source: "manual", existingDossierMatch: { id: "PUB-HIDDEN", name: "Hidden Workspace", confidence: "high" }, routingReason: "bundled_into_dossier_update" }),
    candidate({ id: "diagnostic-active", name: "Diagnostic Probe", status: "active_source_file", source: "manual", reason: "manual endpoint smoke test" }),
    candidate({ id: "source-refresh", name: "Refresh Source", status: "active_source_file", source: "bnl_source_file_enrichment", ingestSource: "bnl_source_file_enrichment" }),
    candidate({ id: "source-archive", name: "Archive Source", status: "active_source_file", source: "manual", latestSourceFileArchiveId: "archive-1" }),
    candidate({ id: "alias-link", name: "Alias Source", status: "active_source_file", source: "manual", identityLinks: [{ id: "alias-1", label: "Alias", normalizedLabel: "alias", status: "confirmed", useForMatching: true, createdAt: now, updatedAt: now }] }),
    candidate({ id: "website-read", name: "Website Read", status: "candidate_intake", source: "website_read_model" }),
    candidate({ id: "unknown-origin", name: "Unknown Origin", status: "active_source_file", source: "combined" }),
  ];
  const recommendations = [
    recommendation({ id: "bnl-recommendation", subjectName: "BNL Subject", ingestSource: "bnl" }),
    recommendation({ id: "bnl-bridge", subjectName: "Bridge Subject", ingestSource: "bnl_source_knowledge_bridge" }),
    recommendation({ id: "bnl-discovery", subjectName: "Discovery Subject", ingestSource: "bnl_dynamic_candidate_discovery" }),
    recommendation({ id: "manual-recommendation", subjectName: "Manual Recommendation", createdBy: "admin", ingestSource: "system", sourceLanes: ["admin_manual"] }),
    recommendation({ id: "resolved-public-signal", subjectName: "Public Subject", type: "modify_existing_dossier", status: "attached_to_existing_dossier_update", targetDossierId: "PUB-196", ingestSource: "bnl" }),
    recommendation({ id: "orphan-public-signal", subjectName: "Missing Public", type: "modify_existing_dossier", status: "attached_to_existing_dossier_update", targetDossierId: "PUB-MISSING", ingestSource: "bnl" }),
    recommendation({ id: "missing-target-recommendation", subjectName: "Missing Target", status: "new", targetCandidateId: "missing-target", ingestSource: "bnl" }),
    recommendation({ id: "diagnostic-recommendation", subjectName: "Diagnostic Test", status: "new", reason: "diagnostic probe", ingestSource: "bnl" }),
    recommendation({ id: "unknown-recommendation", subjectName: "Unknown Recommendation", status: "new", createdBy: undefined, ingestSource: "unknown", sourceLanes: ["unknown"] }),
  ];

  const audit = workflow.createDossierPopulationMethodAudit({
    candidates,
    recommendations,
    publicDossiers,
    drafts: [{ id: "draft-update", candidateId: "dossier-update", status: "draft", fields: { name: "Public Subject" }, createdAt: now, updatedAt: now }],
    sourceFileRefreshRequests: [{ id: "refresh-request", candidateId: "source-refresh", subjectName: "Refresh Source", normalizedSubjectKey: "refresh-source", status: "completed", reason: "case report missing", requestSource: "case_report_missing", requestedAt: now, updatedAt: now, priority: 1 }],
  });

  assert.equal(audit.countsByOrigin["BNL recommendation"], 2);
  assert.equal(audit.countsByOrigin["BNL source knowledge bridge"], 1);
  assert.equal(audit.countsByOrigin["BNL dynamic candidate discovery"], 2);
  assert.equal(audit.countsByOrigin["manual admin creation"] >= 2, true);
  assert.equal(audit.countsByOrigin["public dossier update signal"] >= 4, true);
  assert.equal(audit.countsByOrigin["diagnostic/test artifact"], 2);
  assert.equal(audit.countsByOrigin["source file refresh"], 2);
  assert.equal(audit.countsByOrigin["source file archive"], 1);
  assert.equal(audit.countsByOrigin["website read model"], 1);
  assert.equal(audit.countsByOrigin["identity/alias link"], 1);
  assert.equal(audit.countsByOrigin["unknown / insufficient metadata"], 2);

  assert.equal(audit.intakeFlows.find((record) => record.id === "active-source").intendedLane, "Active Source File");
  assert.equal(audit.intakeFlows.find((record) => record.id === "candidate-intake").intendedLane, "Candidate Intake");
  assert.equal(audit.intakeFlows.find((record) => record.id === "dossier-update").intendedLane, "Dossier Update Workspace");
  assert.equal(audit.intakeFlows.find((record) => record.id === "archived-source").intendedLane, "Archived / Closed");
  assert.equal(audit.intakeFlows.find((record) => record.id === "merged-valid").intendedLane, "Merged Source Record");

  assert.ok(audit.hiddenWithDestinations.some((record) => record.id === "merged-valid" && record.destinationId === "active-source"));
  assert.ok(audit.hiddenWithoutDestination.some((record) => record.id === "merged-missing"));
  assert.ok(audit.hiddenWithoutDestination.some((record) => record.id === "orphan-public-signal"));
  assert.ok(audit.visibleDestinationWorkspaces.some((record) => record.id === "dossier-update"));
  assert.ok(audit.diagnosticArtifacts.some((record) => record.id === "diagnostic-active"));
  assert.ok(audit.publicDossierUpdateSignals.some((record) => record.id === "resolved-public-signal"));
  assert.ok(audit.sourceFileRefreshLinks.some((record) => record.id === "source-refresh"));
  assert.ok(audit.recordsNeedingPopulationReview.some((record) => record.id === "unknown-origin"));

  const warningTitles = audit.warnings.map((warning) => warning.issueTitle).join("\n");
  assert.match(warningTitles, /Merged source record points nowhere/);
  assert.match(warningTitles, /Recommendation points to a missing candidate destination/);
  assert.match(warningTitles, /Diagnostic\/test artifact is visible in a normal lane/);
  assert.match(warningTitles, /Public dossier update signals for Missing Public were resolved, but no visible Missing Public Dossier Update workspace was found\./);
  assert.match(warningTitles, /Destination workspace for Hidden Workspace exists but is currently hidden by resolved-candidate filtering\./);
  assert.match(warningTitles, /Visible destination missing for canonical public dossier target/);
});

test("Population Method Audit preserves existing dossier admin and public boundaries", () => {
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  const sourceFilePage = normalizedSource("src/app/admin/dossiers/candidates/[candidateId]/page.tsx");
  const publicPage = normalizedSource("src/app/database/[slug]/page.tsx");
  const publicView = normalizedSource("src/components/DossierPageView.tsx");

  assertIncludesCopy(pageCopy, "Dossier Control Center");
  assertIncludesCopy(pageCopy, "Subject Consolidation Queue");
  assertIncludesCopy(sourceFilePage, "BNL Source File");
  assertIncludesCopy(publicPage, "<DossierPageView dossier={databaseEntryToDossierPageViewModel(entry)} />");
  assert.doesNotMatch(publicPage + publicView, /Population Method Audit|Intake Map|internal aliases|Copy Record IDs/);
  assert.doesNotMatch(pageCopy, /publicPagesPublished: [1-9]|publicDossierTextChanged: [1-9]/);
});

test("canonical subject clustering collapses public-dossier variants into one subject cluster", () => {
  const now = "2026-06-11T00:00:00.000Z";
  const publicEntry =
    databasePage.entries.find((entry) => entry.name === "6 Bit") ??
    databasePage.entries[0];
  assert.equal(
    workflow.normalizeDossierPossessiveVariantName("6 Bit’s"),
    workflow.normalizeDossierSubjectName("6 Bit"),
  );
  assert.equal(
    workflow.normalizeDossierPossessiveVariantName("Crow’s"),
    workflow.normalizeDossierSubjectName("Crow"),
  );
  const candidate = (overrides) => ({
    id: overrides.id,
    name: overrides.name,
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: overrides.score ?? 5,
    whyNow: "Fixture",
    reason: "Fixture",
    evidenceSummary: "Fixture",
    status: overrides.status ?? "active_source_file",
    existingDossierMatch: overrides.existingDossierMatch,
    latestSourceFileArchiveUpdatedAt: overrides.latestSourceFileArchiveUpdatedAt,
    sourceFileNotes: overrides.sourceFileNotes ?? [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  const recommendation = (overrides) => ({
    id: overrides.id,
    type: overrides.type ?? "modify_existing_dossier",
    subjectName: overrides.subjectName,
    subjectKey: overrides.subjectKey,
    targetDossierId: overrides.targetDossierId,
    status: "new",
    reason: "BNL fixture",
    confidence: "medium",
    sourceLanes: ["public_discord"],
    createdAt: now,
    updatedAt: now,
    createdBy: "bnl",
    ingestSource: "bnl_dynamic_candidate_discovery",
    ...overrides,
  });

  const audit = workflow.createDossierPopulationAudit({
    publicDossiers: [{ id: publicEntry.id, name: publicEntry.name }],
    drafts: [],
    candidates: [
      candidate({
        id: "six-bit-kept",
        name: `${publicEntry.name}’s`,
        latestSourceFileArchiveUpdatedAt: now,
        existingDossierMatch: { id: publicEntry.id, name: publicEntry.name, confidence: "high" },
      }),
      candidate({
        id: "six-bit-fragment",
        name: publicEntry.name,
        existingDossierMatch: { id: publicEntry.id, name: publicEntry.name, confidence: "high" },
      }),
    ],
    recommendations: [
      recommendation({ id: "six-bit-rec-a", subjectName: publicEntry.name, subjectKey: publicEntry.id, targetDossierId: publicEntry.id }),
      recommendation({ id: "six-bit-rec-b", subjectName: `${publicEntry.name}'s`, subjectKey: publicEntry.id, targetDossierId: publicEntry.id }),
      recommendation({ id: "six-bit-rec-c", subjectName: publicEntry.name, targetDossierId: publicEntry.id }),
    ],
  });

  const canonicalGroups = audit.possibleDuplicateGroups.filter(
    (group) => group.publicDossierMatch?.id === publicEntry.id,
  );
  assert.equal(canonicalGroups.length, 1);
  const [group] = canonicalGroups;
  assert.equal(group.publicDossierMatch.name, publicEntry.name);
  assert.equal(group.consolidationPlan.targetDisplayName, publicEntry.name);
  assert.notEqual(group.consolidationPlan.targetDisplayName, `${publicEntry.name}’s`);
  assert.ok(group.records.some((record) => record.id === "six-bit-kept"));
  assert.ok(group.records.some((record) => record.id === "six-bit-fragment"));
  assert.ok(group.records.some((record) => record.recommendationId === "six-bit-rec-a"));
  assert.ok(group.records.some((record) => record.recommendationId === "six-bit-rec-b"));
  assert.ok(group.records.some((record) => record.recommendationId === "six-bit-rec-c"));
  assert.equal(new Set(group.records.map((record) => `${record.type}:${record.id}`)).size, group.records.length);
});

test("possessive variants need a strong anchor before auto-folding", () => {
  const now = "2026-06-11T00:00:00.000Z";
  const candidate = (overrides) => ({
    id: overrides.id,
    name: overrides.name,
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: 5,
    whyNow: "Fixture",
    reason: "Fixture",
    evidenceSummary: "Fixture",
    status: "active_source_file",
    sourceFileNotes: overrides.sourceFileNotes ?? [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const audit = workflow.createDossierPopulationAudit({
    publicDossiers: [],
    drafts: [],
    candidates: [
      candidate({ id: "six-bit-variant", name: "6 Bit’s" }),
      candidate({ id: "six-bit-canonical", name: "6 Bit" }),
    ],
    recommendations: [],
  });

  const variantGroups = audit.possibleDuplicateGroups.filter((group) =>
    group.reason === "Variant needs review: 6 Bit’s / 6 Bit",
  );
  assert.equal(variantGroups.length, 1);
  assert.equal(variantGroups[0].matchKind, "similar_name");
  assert.equal(variantGroups[0].consolidationPlan.requiresReview, true);
  assert.notEqual(variantGroups[0].consolidationPlan.automationTier, "Source File merge candidate");
});

test("subject consolidation helper uses conservative duplicate signals and leaves proposed aliases out of confirmed matching", () => {
  const now = "2026-06-11T00:00:00.000Z";
  const baseCandidate = (overrides) => ({
    id: overrides.id,
    name: overrides.name,
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: 5,
    whyNow: "Fixture",
    reason: "Fixture",
    evidenceSummary: "Fixture",
    status: overrides.status ?? "active_source_file",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  const baseRecommendation = (overrides) => ({
    id: overrides.id,
    type: overrides.type ?? "new_subject",
    subjectName: overrides.subjectName,
    subjectKey: overrides.subjectKey,
    targetDossierId: overrides.targetDossierId,
    targetCandidateId: overrides.targetCandidateId,
    status: overrides.status ?? "new",
    reason: "BNL fixture",
    confidence: overrides.confidence ?? "medium",
    sourceLanes: overrides.sourceLanes ?? ["public_discord"],
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    createdBy: "bnl",
    ingestSource: overrides.ingestSource ?? "bnl_dynamic_candidate_discovery",
    ...overrides,
  });

  const audit = workflow.createDossierPopulationAudit({
    publicDossiers: [{ id: "mac-modem", name: "Mac Modem" }],
    candidates: [
      baseCandidate({
        id: "candidate-active",
        name: "Echo Trace",
        sourceRecommendationIds: ["rec-attached"],
        latestSourceFileArchiveUpdatedAt: now,
        identityLinks: [
          {
            id: "alias-confirmed",
            candidateId: "candidate-active",
            label: "Trace Echo",
            normalizedLabel: "trace echo",
            type: "alias",
            visibility: "internal_only",
            status: "confirmed",
            source: "admin_manual",
            useForMatching: true,
            useInPublicDossier: false,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "alias-proposed",
            candidateId: "candidate-active",
            label: "Proposed Only",
            normalizedLabel: "proposed only",
            type: "alias",
            visibility: "internal_only",
            status: "proposed",
            source: "bnl_recommendation",
            useForMatching: true,
            useInPublicDossier: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      baseCandidate({ id: "candidate-name-dupe", name: "Echo Trace" }),
      baseCandidate({ id: "candidate-alias-dupe", name: "Trace Echo" }),
      baseCandidate({
        id: "candidate-public-target",
        name: "Mac Update A",
        status: "existing_dossier_update",
        existingDossierMatch: { id: "mac-modem", name: "Mac Modem", confidence: "high" },
      }),
      baseCandidate({ id: "candidate-intake", name: "Seed Person", status: "candidate_intake" }),
      baseCandidate({ id: "candidate-archived", name: "Old Person", status: "archived" }),
      baseCandidate({ id: "candidate-missing-report", name: "Missing Report" }),
    ],
    recommendations: [
      baseRecommendation({ id: "rec-attached", subjectName: "Echo Trace", targetCandidateId: "candidate-active", status: "attached_to_source_file" }),
      baseRecommendation({ id: "rec-unattached", subjectName: "Loose Signal", subjectKey: "loose-signal" }),
      baseRecommendation({ id: "rec-shared-key-a", subjectName: "Key Alpha", subjectKey: "shared-key" }),
      baseRecommendation({ id: "rec-shared-key-b", subjectName: "Key Beta", subjectKey: "shared-key" }),
      baseRecommendation({ id: "rec-public-target", subjectName: "Mac Update B", targetDossierId: "mac-modem", type: "modify_existing_dossier" }),
    ],
  });

  assert.equal(audit.counts.activeSourceFiles, 4);
  assert.equal(audit.counts.candidateIntake, 1);
  assert.equal(audit.counts.existingDossierUpdates, 1);
  assert.equal(audit.counts.publicDossiers, 1);
  assert.equal(audit.counts.archivedClosedRecords, 1);
  assert.equal(audit.counts.proposedIdentityLinks, 1);
  assert.equal(audit.counts.confirmedIdentityLinks, 1);
  assert.equal(audit.counts.recordsWithAttachedBnlRecommendations, 1);
  assert.equal(audit.counts.unattachedBnlRecommendations, 4);
  assert.equal(audit.counts.recordsMissingLatestCaseReportOrEnrichment, 3);

  assert.ok(audit.possibleDuplicateGroups.some((group) => group.records.some((record) => record.id === "candidate-active") && group.records.some((record) => record.id === "candidate-name-dupe")));
  assert.ok(audit.possibleDuplicateGroups.some((group) => group.records.some((record) => record.id === "candidate-active") && group.records.some((record) => record.id === "candidate-alias-dupe")));
  assert.ok(audit.possibleDuplicateGroups.some((group) => group.matchKind === "public_dossier" && group.publicDossierMatch?.id === "mac-modem"));
  assert.ok(audit.possibleDuplicateGroups.some((group) => group.matchKind === "recommendation_subject_key" && group.records.length === 2));
  assert.ok(!audit.possibleDuplicateGroups.some((group) => group.matchKind === "confirmed_alias" && group.records.some((record) => record.name === "Proposed Only")));
  assert.ok(audit.unattachedBnlRecommendations.some((recommendation) => recommendation.id === "rec-unattached" && recommendation.subjectName === "Loose Signal"));
});


test("subject consolidation plans classify target/source records for automation and review", () => {
  const now = "2026-06-11T00:00:00.000Z";
  const candidate = (overrides) => ({
    id: overrides.id,
    name: overrides.name,
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: 5,
    whyNow: "Fixture",
    reason: "Fixture",
    evidenceSummary: "Fixture",
    status: overrides.status ?? "active_source_file",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  });
  const recommendation = (overrides) => ({
    id: overrides.id,
    type: overrides.type ?? "new_subject",
    subjectName: overrides.subjectName,
    subjectKey: overrides.subjectKey,
    targetDossierId: overrides.targetDossierId,
    targetCandidateId: overrides.targetCandidateId,
    status: overrides.status ?? "new",
    reason: "BNL fixture",
    confidence: overrides.confidence ?? "medium",
    sourceLanes: overrides.sourceLanes ?? ["public_discord"],
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    createdBy: "bnl",
    ingestSource: overrides.ingestSource ?? "bnl_dynamic_candidate_discovery",
    ...overrides,
  });
  const alias = (candidateId, label, status = "confirmed") => ({
    id: `${candidateId}-${label}-${status}`,
    candidateId,
    label,
    normalizedLabel: workflow.normalizeDossierSubjectName(label),
    type: "alias",
    visibility: "internal_only",
    status,
    source: "admin_manual",
    useForMatching: true,
    useInPublicDossier: false,
    createdAt: now,
    updatedAt: now,
  });

  const audit = workflow.createDossierPopulationAudit({
    publicDossiers: [
      { id: "public-keep", name: "Public Keep" },
      { id: "public-other", name: "Public Other" },
      { id: "blocked-public-a", name: "Blocked Public A" },
      { id: "six-bit", name: "6 Bit" },
      { id: "public-only", name: "Public Only" },
    ],
    drafts: [
      {
        id: "draft-target",
        candidateId: "active-with-draft",
        status: "draft",
        fields: { name: "Draft Target", files: [] },
        createdAt: now,
        updatedAt: now,
      },
    ],
    candidates: [
      candidate({
        id: "public-target",
        name: "Public Keep",
        status: "existing_dossier_update",
        existingDossierMatch: { id: "public-keep", name: "Public Keep", confidence: "high" },
      }),
      candidate({ id: "public-loose", name: "Public Keep", status: "candidate_intake" }),
      candidate({
        id: "active-with-draft",
        name: "Active Source",
        identityLinks: [alias("active-with-draft", "Active Alias")],
        sourceFileNotes: [{ id: "note-1", candidateId: "active-with-draft", type: "fact", text: "Useful note", source: "admin_manual", status: "active", createdAt: now, updatedAt: now }],
        latestSourceFileArchiveUpdatedAt: now,
      }),
      candidate({ id: "active-empty-duplicate", name: "Active Source", status: "candidate_intake", reason: "", whyNow: "", evidenceSummary: "" }),
      candidate({ id: "clean-target", name: "Empty Clean", latestSourceFileArchiveUpdatedAt: now }),
      candidate({ id: "clean-duplicate", name: "Empty Clean", status: "candidate_intake", reason: "", whyNow: "", evidenceSummary: "" }),
      candidate({ id: "confirmed-target", name: "Confirmed Primary", identityLinks: [alias("confirmed-target", "Confirmed Secondary")] }),
      candidate({ id: "confirmed-secondary", name: "Confirmed Secondary", sourceFileNotes: [{ id: "note-2", candidateId: "confirmed-secondary", type: "fact", text: "Additive note", source: "admin_manual", status: "active", createdAt: now, updatedAt: now }] }),
      candidate({ id: "proposed-a", name: "Proposed Review", identityLinks: [alias("proposed-a", "Proposed Maybe", "proposed")] }),
      candidate({ id: "proposed-b", name: "Proposed Review" }),
      candidate({ id: "blocked-a", name: "Blocked Same", existingDossierMatch: { id: "blocked-public-a", name: "Blocked Public A", confidence: "high" } }),
      candidate({ id: "blocked-b", name: "Blocked Same", existingDossierMatch: { id: "public-other", name: "Public Other", confidence: "high" } }),
      candidate({ id: "attach-target", name: "Attach Me", identityLinks: [alias("attach-target", "Attach Alias")] }),
      candidate({ id: "six-bit-source", name: "6 Bit’s", existingDossierMatch: { id: "six-bit", name: "6 Bit", confidence: "high" } }),
      candidate({ id: "ambiguous-a", name: "Ambiguous Target" }),
      candidate({ id: "ambiguous-b", name: "Ambiguous Target" }),
    ],
    recommendations: [
      recommendation({ id: "rec-public-loose", subjectName: "Public Keep", targetDossierId: "public-keep" }),
      recommendation({ id: "rec-active", subjectName: "Active Source" }),
      recommendation({ id: "rec-attach", subjectName: "Attach Alias" }),
      recommendation({ id: "rec-only-a", subjectName: "Only Signal A", subjectKey: "only-signal" }),
      recommendation({ id: "rec-only-b", subjectName: "Only Signal B", subjectKey: "only-signal" }),
      recommendation({ id: "rec-six-bit", subjectName: "6 Bit", targetDossierId: "six-bit", evidenceSummary: "Canonical update signal." }),
      recommendation({ id: "rec-public-only-a", subjectName: "Public Only", targetDossierId: "public-only" }),
      recommendation({ id: "rec-public-only-b", subjectName: "Public Only", targetDossierId: "public-only" }),
    ],
  });

  const plans = audit.possibleDuplicateGroups.map((group) => group.consolidationPlan);
  assert.ok(plans.every((plan) => plan.groupId && plan.groupType && plan.confidence && plan.reason && plan.automationTier && plan.recommendedNextStep));

  const publicPlan = plans.find((plan) => plan.groupId.includes("public-dossier-public-keep"));
  assert.equal(publicPlan?.targetRecord?.type !== "recommendation", true);
  assert.equal(publicPlan?.targetRecord?.publicDossierId, "public-keep");
  assert.match(publicPlan.targetSelectionReason, /public dossier match/);

  const activePlan = plans.find((plan) => plan.groupType === "bnl_recommendation_subject_name" && plan.targetRecord?.id === "active-with-draft");
  assert.equal(activePlan?.targetRecord?.type, "source_file");
  assert.ok(activePlan.sourceRecords.some((record) => record.type === "recommendation"));

  const cleanPlan = plans.find((plan) => plan.groupType === "normalized_name" && plan.targetRecord?.id === "clean-target");
  assert.equal(cleanPlan?.automationTier, "Empty duplicate cleanup candidate");

  const mergePlan = plans.find((plan) => plan.groupType === "confirmed_alias" && plan.targetRecord?.id === "confirmed-target");
  assert.equal(mergePlan?.automationTier, "Source File merge candidate");

  const attachPlan = audit.unattachedBnlRecommendations.find((item) => item.id === "rec-attach");
  assert.equal(attachPlan?.planClassification, "Attach to Existing Source File candidate");
  assert.equal(attachPlan?.likelyTargetId, "attach-target");

  const sixBitPlan = plans.find((plan) => plan.groupId.includes("public-dossier-six-bit"));
  assert.equal(sixBitPlan?.automationTier, "Attach to Existing Source File candidate");
  assert.equal(sixBitPlan?.targetRecord?.id, "six-bit-source");
  assert.equal(sixBitPlan?.targetDisplayName, "6 Bit");
  assert.equal(sixBitPlan?.targetSourceFileLabel, "6 Bit’s");
  assert.match(sixBitPlan?.targetDisplayReason ?? "", /public dossier match/);
  assert.notEqual(sixBitPlan?.automationTier, "Source File merge candidate");
  assert.ok(sixBitPlan?.sourceRecords.every((record) => record.type === "recommendation"));
  assert.match(sixBitPlan?.reason ?? "", /not merged into a separate duplicate Source File/);

  const reviewPlan = plans.find((plan) => plan.targetRecord?.id === "proposed-a" || plan.sourceRecords.some((record) => record.id === "proposed-a"));
  assert.equal(reviewPlan?.automationTier, "Review required");

  const blockedPlan = plans.find((plan) => plan.sourceRecords.some((record) => record.id === "blocked-b") || plan.targetRecord?.id === "blocked-b");
  assert.equal(blockedPlan?.automationTier, "Blocked");
  assert.match(blockedPlan?.blockedReasons.join(" ") ?? "", /Different public dossier matches/);

  const sourceFileCreationPlan = plans.find((plan) => plan.sourceRecords.some((record) => record.recommendationId === "rec-only-a") && plan.sourceRecords.some((record) => record.recommendationId === "rec-only-b"));
  assert.equal(sourceFileCreationPlan?.automationTier, "Create Source File candidate");
  assert.equal(sourceFileCreationPlan?.targetRecord, undefined);
  assert.equal(sourceFileCreationPlan?.suggestedWorkspace, "New Source File / Candidate");
  assert.match(sourceFileCreationPlan?.recommendedNextStep ?? "", /no Source File target exists/i);
  assert.match(sourceFileCreationPlan?.blockedReasons.join(" ") ?? "", /No Source File target resolved/);
  assert.doesNotMatch(sourceFileCreationPlan?.targetSelectionReason ?? "", /source and target records could not be resolved/i);

  const updateWorkspacePlan = plans.find((plan) => plan.sourceRecords.some((record) => record.recommendationId === "rec-public-only-a") && plan.sourceRecords.some((record) => record.recommendationId === "rec-public-only-b"));
  assert.equal(updateWorkspacePlan?.automationTier, "Create Dossier Update workspace candidate");
  assert.equal(updateWorkspacePlan?.targetRecord, undefined);
  assert.equal(updateWorkspacePlan?.suggestedWorkspace, "Dossier Update");
  assert.equal(updateWorkspacePlan?.existingPublicDossier?.name, "Public Only");

  const ambiguousPlan = plans.find((plan) => plan.possibleTargetRecords.some((record) => record.id === "ambiguous-a") && plan.possibleTargetRecords.some((record) => record.id === "ambiguous-b"));
  assert.equal(ambiguousPlan?.automationTier, "Select Target Manually");
  assert.equal(ambiguousPlan?.targetRecord, undefined);
  assert.equal(ambiguousPlan?.possibleTargetRecords.length, 2);

  assert.ok(activePlan?.sourceRecords.some((record) => record.type === "recommendation"));
  assert.notEqual(activePlan?.targetRecord?.type, "recommendation");

  const sectionNames = activePlan?.mergePlanSections.map((section) => section.title) ?? [];
  assert.deepEqual(sectionNames, [
    "New info to add",
    "Already represented / duplicate info",
    "Irrelevant to kept entry",
    "Needs review",
    "Blocked reason",
    "No action needed",
  ]);
  assert.ok(activePlan?.mergePlanSections.some((section) => section.newInfoToAdd.length > 0));
  assert.ok(activePlan?.mergePlanSections.some((section) => section.noActionNeeded.join(" ").includes("Nothing publishes automatically")));
  assert.ok(blockedPlan?.mergePlanSections.some((section) => section.blockedReason.join(" ").includes("Different public dossier matches")));

  const publicDossierBefore = JSON.stringify(databasePage.entries.find((entry) => entry.name === "6 Bit"));
  workflow.createDossierPopulationAudit({
    publicDossiers: [{ id: "six-bit", name: "6 Bit" }],
    candidates: [],
    recommendations: [recommendation({ id: "rec-public-readonly", subjectName: "6 Bit", targetDossierId: "six-bit" })],
  });
  assert.equal(JSON.stringify(databasePage.entries.find((entry) => entry.name === "6 Bit")), publicDossierBefore);
});


test("Subject Consolidation pass auto-attaches, cleans, creates workspaces, preserves metadata, and avoids public side effects", async () => {
  await resetWorkflowStore();
  const now = "2026-06-11T00:00:00.000Z";
  const publicEntry = databasePage.entries.find((entry) => entry.name === "6 Bit") ?? databasePage.entries[1] ?? databasePage.entries[0];
  const genericPublicEntry = databasePage.entries.find((entry) => entry.id !== publicEntry.id) ?? publicEntry;
  const blockedEntry = databasePage.entries[0];
  const candidate = (overrides) => ({
    id: overrides.id,
    name: overrides.name,
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: 5,
    whyNow: overrides.whyNow ?? "Fixture",
    reason: overrides.reason ?? "Fixture",
    evidenceSummary: overrides.evidenceSummary ?? "Fixture",
    status: overrides.status ?? "active_source_file",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  });
  const recommendation = (overrides) => ({
    id: overrides.id,
    type: overrides.type ?? "new_subject",
    subjectName: overrides.subjectName,
    subjectKey: overrides.subjectKey,
    targetDossierId: overrides.targetDossierId,
    targetCandidateId: overrides.targetCandidateId,
    status: overrides.status ?? "new",
    reason: overrides.reason ?? "BNL fixture",
    evidenceSummary: overrides.evidenceSummary,
    confidence: overrides.confidence ?? "medium",
    sourceLanes: overrides.sourceLanes ?? ["public_discord"],
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    createdBy: "bnl",
    ingestSource: overrides.ingestSource ?? "bnl_dynamic_candidate_discovery",
    ...overrides,
  });
  const alias = (candidateId, label) => ({
    id: `${candidateId}-${label}`,
    candidateId,
    label,
    normalizedLabel: workflow.normalizeDossierSubjectName(label),
    type: "alias",
    visibility: "internal_only",
    status: "confirmed",
    source: "admin_manual",
    useForMatching: true,
    useInPublicDossier: false,
    createdAt: now,
    updatedAt: now,
  });
  const publicBefore = JSON.stringify(databasePage.entries);

  await store.saveDossierWorkflowState({
    version: 1,
    revision: 0,
    candidates: [
      candidate({ id: "exact-target", name: "Exact Subject", sourceFileNotes: [], connectedRecommendationIds: ["existing-rec"], latestSourceFileArchiveUpdatedAt: now }),
      candidate({ id: "alias-target", name: "Alias Keeper", identityLinks: [alias("alias-target", "Alias Incoming")], sourceFileNotes: [] }),
      candidate({ id: "empty-keep", name: "Empty Dupe", latestSourceFileArchiveUpdatedAt: now }),
      candidate({ id: "empty-lesser", name: "Empty Dupe", status: "candidate_intake", reason: "", whyNow: "", evidenceSummary: "" }),
      candidate({ id: "merge-keep", name: "Merge Subject", latestSourceFileArchiveUpdatedAt: now, sourceFileNotes: [{ id: "keep-note", candidateId: "merge-keep", type: "fact", text: "keep metadata", source: "admin_manual", status: "active", createdAt: now, updatedAt: now }], connectedRecommendationIds: ["keep-rec"] }),
      candidate({ id: "merge-lesser", name: "Merge Subject", sourceFileNotes: [{ id: "lesser-note", candidateId: "merge-lesser", type: "fact", text: "lesser metadata", source: "admin_manual", status: "active", createdAt: now, updatedAt: now }], connectedRecommendationIds: ["lesser-rec"] }),
      candidate({ id: "similar-a", name: "Crow", latestSourceFileArchiveUpdatedAt: now }),
      candidate({ id: "similar-b", name: "Crowe", latestSourceFileArchiveUpdatedAt: now }),
      candidate({ id: "blocked-a", name: "Blocked Subject", existingDossierMatch: { id: blockedEntry.id, name: blockedEntry.name, confidence: "high" } }),
      candidate({ id: "blocked-b", name: "Blocked Subject", existingDossierMatch: { id: "different-public", name: "Different Public", confidence: "high" } }),
      candidate({ id: "public-variant-candidate", name: `${publicEntry.name}’s`, sourceFileNotes: [{ id: "variant-note", candidateId: "public-variant-candidate", type: "fact", text: "variant metadata", source: "admin_manual", status: "active", createdAt: now, updatedAt: now }], connectedRecommendationIds: ["variant-connected-rec"] }),
      candidate({ id: "checkpoint-artifact", name: "Checkpoint BNL Ingest Alpha", reason: "Manual endpoint smoke test", evidenceSummary: "diagnostic probe", status: "active_source_file" }),
    ],
    drafts: [],
    recommendations: [
      recommendation({ id: "rec-exact", subjectName: "Exact Subject", reason: "new exact information", evidenceSummary: "exact summary", sourceLanes: ["rd_context"] }),
      recommendation({ id: "rec-alias", subjectName: "Alias Incoming", reason: "alias information", sourceLanes: ["broadcast_memory"] }),
      recommendation({ id: "rec-no-new", subjectName: "Exact Subject", reason: "", evidenceSummary: "", sourceTypes: [] }),
      recommendation({ id: "rec-new-a", subjectName: "New Cluster A", subjectKey: "new-cluster", reason: "cluster info A" }),
      recommendation({ id: "rec-new-b", subjectName: "New Cluster B", subjectKey: "new-cluster", reason: "cluster info B" }),
      recommendation({ id: "rec-public-a", subjectName: publicEntry.name, targetDossierId: publicEntry.id, type: "modify_existing_dossier", reason: "public update A" }),
      recommendation({ id: "rec-public-b", subjectName: publicEntry.name, targetDossierId: publicEntry.id, type: "modify_existing_dossier", reason: "public update B" }),
      recommendation({ id: "rec-public-variant", subjectName: `${publicEntry.name}'s`, subjectKey: publicEntry.id, targetDossierId: publicEntry.id, type: "modify_existing_dossier", reason: "public update variant" }),
      recommendation({ id: "rec-generic-public-a", subjectName: genericPublicEntry.name, targetDossierId: genericPublicEntry.id, type: "modify_existing_dossier", reason: "generic public update A" }),
      recommendation({ id: "rec-generic-public-b", subjectName: genericPublicEntry.name, targetDossierId: genericPublicEntry.id, type: "modify_existing_dossier", reason: "generic public update B" }),
      recommendation({ id: "rec-checkpoint", subjectName: "Checkpoint BNL Ingest Alpha", type: "new_subject", reason: "Manual endpoint smoke test", evidenceSummary: "diagnostic probe" }),
    ],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const response = await authedPost({ action: "runSubjectConsolidation" });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.consolidation.publicPagesPublished, 0);
  assert.equal(payload.consolidation.publicDossierTextChanged, 0);
  assert.equal(payload.consolidation.internalAliasesExposed, 0);
  assert.ok(payload.consolidation.attachedRecommendations >= 2);
  assert.ok(payload.consolidation.emptyDuplicatesCleaned >= 1);
  assert.ok(payload.consolidation.sourceFilesCreated >= 1);
  assert.ok(payload.consolidation.dossierUpdateWorkspacesCreated >= 1);
  assert.ok(payload.consolidation.bundledPublicDossierUpdateSignals >= 5);
  assert.ok(payload.consolidation.diagnosticArtifactsArchived >= 2);
  assert.ok(payload.consolidation.sourceFileDuplicatesMerged >= 1);
  assert.ok(payload.consolidation.bnlRefreshes.length >= 4);
  assert.ok(payload.consolidation.needsReview >= 1);
  assert.ok(payload.consolidation.blocked >= 1);

  const exact = payload.recommendations.find((item) => item.id === "rec-exact");
  const aliasRec = payload.recommendations.find((item) => item.id === "rec-alias");
  const noNew = payload.recommendations.find((item) => item.id === "rec-no-new");
  assert.equal(exact.status, "attached_to_source_file");
  assert.equal(exact.targetCandidateId, "exact-target");
  assert.equal(aliasRec.status, "attached_to_source_file");
  assert.equal(aliasRec.targetCandidateId, "alias-target");
  assert.equal(noNew.status, "archived");

  const emptyLesser = payload.candidates.find((item) => item.id === "empty-lesser");
  assert.equal(emptyLesser.status, "archived");

  const createdSource = payload.candidates.find((item) => item.createdFromRecommendationId === "rec-new-a" || item.sourceRecommendationIds?.includes("rec-new-a"));
  assert.equal(createdSource.status, "active_source_file");
  const recNewA = payload.recommendations.find((item) => item.id === "rec-new-a");
  const recNewB = payload.recommendations.find((item) => item.id === "rec-new-b");
  assert.equal(recNewA.status, "converted_to_source_file");
  assert.equal(recNewB.status, "converted_to_source_file");
  assert.equal(recNewA.targetCandidateId, createdSource.id);
  assert.equal(recNewB.targetCandidateId, createdSource.id);
  const updateWorkspace = payload.candidates.find((item) => item.status === "existing_dossier_update" && item.existingDossierMatch?.id === publicEntry.id && item.sourceRecommendationIds?.includes("rec-public-a"));
  assert.ok(updateWorkspace);
  assert.equal(updateWorkspace.status, "existing_dossier_update");
  assert.equal(updateWorkspace.existingDossierMatch.name, publicEntry.name);
  assert.ok(updateWorkspace.sourceRecommendationIds.includes("rec-public-a"));
  assert.ok(updateWorkspace.sourceRecommendationIds.includes("rec-public-b"));
  assert.ok(updateWorkspace.sourceRecommendationIds.includes("rec-public-variant"));
  assert.ok(updateWorkspace.sourceRecommendationIds.includes("variant-connected-rec"));
  assert.ok(updateWorkspace.connectedRecommendationIds.includes("rec-public-a"));
  assert.ok(updateWorkspace.connectedRecommendationIds.includes("rec-public-b"));
  assert.ok(updateWorkspace.connectedRecommendationIds.includes("rec-public-variant"));
  assert.ok(updateWorkspace.connectedRecommendationIds.includes("variant-connected-rec"));
  assert.ok(updateWorkspace.sourceFileNotes.some((note) => note.text === "variant metadata" && note.candidateId === updateWorkspace.id));
  assert.ok(updateWorkspace.sourceFileNotes.some((note) => note.candidateId === updateWorkspace.id && /public update A|public update B|public update variant/.test(note.text)));
  assert.ok(updateWorkspace.whyNow.includes(`Bundled 3 ${publicEntry.name} update signals into ${publicEntry.name} Dossier Update workspace.`));
  assert.equal(updateWorkspace.mergeNote, "bundled_into_dossier_update");
  assert.equal(workflow.isConsolidationResolvedCandidate(updateWorkspace), false);
  const sixBitAffectedTarget = payload.consolidation.affectedTargets.find((target) => target.candidateId === updateWorkspace.id);
  assert.ok(sixBitAffectedTarget);
  assert.equal(sixBitAffectedTarget.name, publicEntry.name);
  assert.equal(sixBitAffectedTarget.href, `/admin/dossiers/candidates/${updateWorkspace.id}`);
  const genericWorkspace = payload.candidates.find((item) => item.status === "existing_dossier_update" && item.existingDossierMatch?.id === genericPublicEntry.id && item.sourceRecommendationIds?.includes("rec-generic-public-a"));
  assert.ok(genericWorkspace);
  assert.equal(genericWorkspace.existingDossierMatch.name, genericPublicEntry.name);
  assert.ok(genericWorkspace.sourceRecommendationIds.includes("rec-generic-public-b"));
  assert.ok(genericWorkspace.connectedRecommendationIds.includes("rec-generic-public-a"));
  assert.ok(genericWorkspace.sourceFileNotes.some((note) => note.candidateId === genericWorkspace.id && /generic public update/.test(note.text)));
  assert.equal(workflow.isConsolidationResolvedCandidate(genericWorkspace), false);
  assert.ok(payload.consolidation.affectedTargets.some((target) => target.candidateId === genericWorkspace.id && target.href === `/admin/dossiers/candidates/${genericWorkspace.id}`));
  const foldedVariant = payload.candidates.find((item) => item.id === "public-variant-candidate");
  assert.equal(foldedVariant.status, "merged");
  assert.equal(foldedVariant.mergedIntoCandidateId, updateWorkspace.id);
  assert.equal(foldedVariant.mergeNote, `variant_of_canonical:${publicEntry.id}`);
  assert.ok(workflow.isConsolidationResolvedCandidate(foldedVariant));
  assert.ok(payload.consolidation.skippedItems.some((item) => item.subject === `${publicEntry.name}’s` && item.reason.includes("Resolved variant")));
  for (const id of ["rec-public-a", "rec-public-b", "rec-public-variant"]) {
    const publicRec = payload.recommendations.find((item) => item.id === id);
    assert.equal(publicRec.status, "attached_to_existing_dossier_update");
    assert.equal(publicRec.targetCandidateId, updateWorkspace.id);
  }
  const activeReviewUpdateIds = payload.recommendations
    .filter((item) => ["new", "reviewing"].includes(item.status))
    .filter((item) => item.type === "modify_existing_dossier" || item.targetDossierId || item.targetCandidateId)
    .map((item) => item.id);
  assert.ok(!activeReviewUpdateIds.includes("rec-public-a"));
  assert.ok(!activeReviewUpdateIds.includes("rec-public-b"));
  assert.ok(!activeReviewUpdateIds.includes("rec-public-variant"));
  assert.ok(!activeReviewUpdateIds.includes("rec-generic-public-a"));
  assert.ok(!activeReviewUpdateIds.includes("rec-generic-public-b"));
  const activeDossierUpdateWorkspaceIds = payload.candidates
    .filter((item) => item.status === "existing_dossier_update")
    .filter((item) => !workflow.isConsolidationResolvedCandidate(item))
    .map((item) => item.id);
  assert.ok(activeDossierUpdateWorkspaceIds.includes(updateWorkspace.id));
  assert.ok(activeDossierUpdateWorkspaceIds.includes(genericWorkspace.id));
  const activeSourceReviewIds = payload.candidates
    .filter((item) => ["active_source_file", "candidate_intake", "existing_dossier_update"].includes(item.status))
    .filter((item) => !workflow.isConsolidationResolvedCandidate(item))
    .map((item) => item.id);
  assert.ok(!activeSourceReviewIds.includes("public-variant-candidate"));
  const checkpointCandidate = payload.candidates.find((item) => item.id === "checkpoint-artifact");
  const checkpointRecommendation = payload.recommendations.find((item) => item.id === "rec-checkpoint");
  assert.equal(checkpointCandidate.status, "archived");
  assert.equal(checkpointCandidate.mergeNote, "diagnostic_test_artifact");
  assert.equal(checkpointRecommendation.status, "archived");
  assert.ok(workflow.isDiagnosticTestArtifactCandidate(checkpointCandidate));
  assert.ok(workflow.isDiagnosticTestArtifactRecommendation(checkpointRecommendation));

  const mergeKeep = payload.candidates.find((item) => item.id === "merge-keep");
  const mergeLesser = payload.candidates.find((item) => item.id === "merge-lesser");
  assert.equal(mergeKeep.status, "active_source_file");
  assert.ok(mergeKeep.sourceFileNotes.some((note) => note.text === "keep metadata"));
  assert.ok(mergeKeep.sourceFileNotes.some((note) => note.text === "lesser metadata"));
  assert.ok(mergeKeep.connectedRecommendationIds.includes("keep-rec"));
  assert.ok(mergeKeep.connectedRecommendationIds.includes("lesser-rec"));
  assert.equal(mergeLesser.status, "merged");
  assert.equal(mergeLesser.mergedIntoCandidateId, "merge-keep");

  assert.ok(payload.sourceFileRefreshRequests.some((request) => request.candidateId === "exact-target" && request.status === "pending"));
  assert.ok(payload.sourceFileRefreshRequests.some((request) => request.candidateId === "alias-target" && request.status === "pending"));

  const rebuiltAudit = workflow.createDossierPopulationAudit({
    candidates: payload.candidates,
    recommendations: payload.recommendations,
    publicDossiers: [{ id: publicEntry.id, name: publicEntry.name }, { id: genericPublicEntry.id, name: genericPublicEntry.name }],
    drafts: payload.drafts,
  });
  const remainingAutoGroups = rebuiltAudit.possibleDuplicateGroups.filter((group) =>
    [
      "Attach to Existing Source File candidate",
      "Empty duplicate cleanup candidate",
      "Source File merge candidate",
      "Create Source File candidate",
      "Create Dossier Update workspace candidate",
    ].includes(group.consolidationPlan.automationTier),
  );
  assert.equal(remainingAutoGroups.length, 0);
  assert.ok(rebuiltAudit.possibleDuplicateGroups.every((group) => group.consolidationPlan.requiresReview || group.consolidationPlan.automationTier === "Blocked"));
  assert.ok(!rebuiltAudit.possibleDuplicateGroups.some((group) => group.records.some((record) => record.recommendationId === "rec-new-a" || record.recommendationId === "rec-new-b")));
  assert.ok(!rebuiltAudit.possibleDuplicateGroups.some((group) => group.records.some((record) => ["rec-public-a", "rec-public-b", "rec-public-variant", "rec-generic-public-a", "rec-generic-public-b", "rec-checkpoint"].includes(record.recommendationId))));
  assert.ok(!rebuiltAudit.possibleDuplicateGroups.some((group) => group.records.some((record) => record.id === "public-variant-candidate")));
  assert.ok(!rebuiltAudit.possibleDuplicateGroups.some((group) => group.records.some((record) => record.id === "checkpoint-artifact")));

  const secondResponse = await authedPost({ action: "runSubjectConsolidation" });
  assert.equal(secondResponse.status, 200);
  const secondPayload = await secondResponse.json();
  assert.equal(secondPayload.consolidation.statusLabel, "Subject Consolidation Complete");
  assert.equal(secondPayload.consolidation.attachedRecommendations, 0);
  assert.equal(secondPayload.consolidation.sourceFilesCreated, 0);
  assert.equal(secondPayload.consolidation.dossierUpdateWorkspacesCreated, 0);
  assert.equal(secondPayload.consolidation.bundledPublicDossierUpdateSignals, 0);
  assert.equal(secondPayload.consolidation.diagnosticArtifactsArchived, 0);
  assert.equal(secondPayload.consolidation.emptyDuplicatesCleaned, 0);
  assert.equal(secondPayload.consolidation.duplicateRecommendationsCleaned, 0);
  assert.equal(secondPayload.consolidation.sourceFileDuplicatesMerged, 0);
  assert.equal(JSON.stringify(secondPayload.recommendations), JSON.stringify(payload.recommendations));
  assert.equal(JSON.stringify(secondPayload.candidates), JSON.stringify(payload.candidates));
  assert.equal(JSON.stringify(databasePage.entries), publicBefore);
});


test("Consolidate Into Kept Source File dispatches attach, merge, and block behavior safely", async () => {
  await resetWorkflowStore();
  const now = "2026-06-11T00:00:00.000Z";
  const candidate = (overrides) => ({
    id: overrides.id,
    name: overrides.name,
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: 5,
    whyNow: overrides.whyNow ?? "Fixture",
    reason: overrides.reason ?? "Fixture",
    evidenceSummary: overrides.evidenceSummary ?? "Fixture",
    status: overrides.status ?? "active_source_file",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  });
  const recommendation = (overrides) => ({
    id: overrides.id,
    type: overrides.type ?? "new_subject",
    subjectName: overrides.subjectName,
    subjectKey: overrides.subjectKey,
    status: overrides.status ?? "new",
    reason: overrides.reason ?? "BNL fixture",
    evidenceSummary: overrides.evidenceSummary,
    confidence: overrides.confidence ?? "medium",
    sourceLanes: overrides.sourceLanes ?? ["public_discord"],
    sourceTypes: overrides.sourceTypes ?? ["source_file_note"],
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    createdBy: "bnl",
    ingestSource: overrides.ingestSource ?? "bnl_dynamic_candidate_discovery",
    ingestKey: overrides.ingestKey,
    ...overrides,
  });

  const baseState = {
    version: 1,
    revision: 0,
    candidates: [
      candidate({ id: "attach-target", name: "Attach Subject", sourceFileNotes: [] }),
      candidate({ id: "merge-target", name: "Merge Action", latestSourceFileArchiveUpdatedAt: now, sourceFileNotes: [{ id: "target-note", candidateId: "merge-target", type: "fact", text: "target metadata", source: "admin_manual", status: "active", createdAt: now, updatedAt: now }] }),
      candidate({ id: "merge-lesser", name: "Merge Action", sourceFileNotes: [{ id: "lesser-note", candidateId: "merge-lesser", type: "fact", text: "lesser metadata", source: "admin_manual", status: "active", createdAt: now, updatedAt: now }], connectedRecommendationIds: ["lesser-rec"] }),
      candidate({ id: "ambiguous-a", name: "Crow" }),
      candidate({ id: "ambiguous-b", name: "Crowe" }),
    ],
    drafts: [],
    recommendations: [
      recommendation({ id: "rec-attach-action", subjectName: "Attach Subject", reason: "attach action info", sourceLanes: ["rd_context"], ingestKey: "attach-action-key" }),
    ],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  };
  await store.saveDossierWorkflowState(baseState);

  const attachAudit = workflow.createDossierPopulationAudit({ candidates: baseState.candidates, recommendations: baseState.recommendations, publicDossiers: [], drafts: [] });
  const attachGroup = attachAudit.possibleDuplicateGroups.find((group) => group.consolidationPlan.targetRecord?.id === "attach-target" && group.records.some((record) => record.recommendationId === "rec-attach-action"));
  assert.ok(attachGroup);
  const attachResponse = await authedPost({ action: "consolidateSubjectGroup", groupId: attachGroup.id });
  assert.equal(attachResponse.status, 200);
  const attached = await attachResponse.json();
  const attachedRecommendation = attached.recommendations.find((item) => item.id === "rec-attach-action");
  const attachTarget = attached.candidates.find((item) => item.id === "attach-target");
  assert.equal(attachedRecommendation.status, "attached_to_source_file");
  assert.equal(attachedRecommendation.targetCandidateId, "attach-target");
  assert.deepEqual(attachedRecommendation.sourceLanes, ["rd_context"]);
  assert.equal(attachedRecommendation.ingestKey, "attach-action-key");
  assert.ok(attachTarget.connectedRecommendationIds.includes("rec-attach-action"));
  assert.ok(attachTarget.sourceFileNotes.some((note) => note.publicSafe === false && note.ingestKey === "attach-action-key"));
  assert.ok(attached.sourceFileRefreshRequests.some((request) => request.candidateId === "attach-target" && request.status === "pending"));

  const mergeAudit = workflow.createDossierPopulationAudit({ candidates: attached.candidates, recommendations: attached.recommendations, publicDossiers: [], drafts: [] });
  const mergeGroup = mergeAudit.possibleDuplicateGroups.find((group) => group.consolidationPlan.targetRecord?.id === "merge-target" && group.records.some((record) => record.candidateId === "merge-lesser"));
  assert.ok(mergeGroup);
  const mergeResponse = await authedPost({ action: "consolidateSubjectGroup", groupId: mergeGroup.id });
  assert.equal(mergeResponse.status, 200);
  const merged = await mergeResponse.json();
  const mergeTarget = merged.candidates.find((item) => item.id === "merge-target");
  const lesser = merged.candidates.find((item) => item.id === "merge-lesser");
  assert.ok(mergeTarget.sourceFileNotes.some((note) => note.text === "target metadata"));
  assert.ok(mergeTarget.sourceFileNotes.some((note) => note.text === "lesser metadata"));
  assert.ok(mergeTarget.connectedRecommendationIds.includes("lesser-rec"));
  assert.equal(lesser.status, "merged");
  assert.equal(lesser.mergedIntoCandidateId, "merge-target");
  assert.ok(merged.sourceFileRefreshRequests.some((request) => request.candidateId === "merge-target" && request.status === "pending"));

  const blockedBefore = JSON.stringify(merged.candidates.filter((item) => item.id === "ambiguous-a" || item.id === "ambiguous-b"));
  const blockAudit = workflow.createDossierPopulationAudit({ candidates: merged.candidates, recommendations: merged.recommendations, publicDossiers: [], drafts: [] });
  const blockGroup = blockAudit.possibleDuplicateGroups.find((group) => group.matchKind === "similar_name");
  assert.ok(blockGroup);
  const blockResponse = await authedPost({ action: "consolidateSubjectGroup", groupId: blockGroup.id });
  assert.equal(blockResponse.status, 200);
  const blocked = await blockResponse.json();
  assert.equal(blocked.consolidation.blocked, 1);
  assert.equal(JSON.stringify(blocked.candidates.filter((item) => item.id === "ambiguous-a" || item.id === "ambiguous-b")), blockedBefore);
});

test("Subject Consolidation Queue review UI uses direct decision buttons and collapsed raw links", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");

  for (const label of [
    "Incoming Cluster",
    "Kept Source File",
    "Consolidate Into Kept Source File",
    "Consolidate Into ${keptName}",
    "Create Source File: {keptName}",
    "Create Dossier Update: {publicDossierName}",
    "Keep Separate / Not Same Subject",
    "Select Different Target",
    "Raw / Source Details",
    "Diagnostics/Test Artifacts",
    "Archive Diagnostic Artifact:",
    "Incoming item count:",
    "Item types summarized:",
    "BNL consolidation brief needed",
    "BNL consolidation brief needed before review.",
    "Action: Generate BNL Consolidation Brief",
    "Generate BNL Consolidation Brief",
    "Requires companion BNL summary PR",
    "Blocked / Needs Info",
    "Target selection unavailable:",
    "Target options",
    "Create Source File: {keptName}",
    "Create Dossier Update: {publicDossierName}",
    "No usable signal cluster found.",
    "Already represented",
    "Internal operation:",
    "What will not change",
    "Confirm Consolidation",
    "Cancel",
    "View Kept Source File",
    "View New Source File",
    "View Dossier Update Workspace",
    "Incoming cluster collapsed after completion.",
    "Consolidating…",
    "Resolved just now",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  assert.match(page, /<details className="mt-4 border border-border\/60 bg-background\/30 p-3">/);
  assert.doesNotMatch(pageCopy, /Open Recommendation|Open Target|Open Incoming|Merge Into Kept Source File|Attach to Kept Source File|Create Source File From These Signals|Create Dossier Update Workspace without public dossier\/context|Create Dossier Update Later|Create Source File Later|Attach Later|Merge Later|Clean Later/);
  assert.doesNotMatch(pageCopy, /Create Source File: Checkpoint BNL Ingest Alpha/);
  assert.doesNotMatch(page, /incoming-\$\{record\.type\}/);
  assert.doesNotMatch(pageCopy, /Confirmed aliases count: \{record\.confirmedAliasCount\}/);
  assert.doesNotMatch(pageCopy, /Proposed aliases count: \{record\.proposedAliasCount\}/);
  assert.doesNotMatch(pageCopy, /Archive\/report status: \{record\.hasLatestArchiveOrReport/);
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

test("createDraftFromCandidate keeps internal starter notes out of public draft fields", async () => {
  await resetWorkflowStore();
  const input = {
    ...manualCandidateInput,
    name: "Thin Starter Note Candidate",
    reason: "add a dossier entry",
    whyNow: "broadcast_memory: internal review lane",
    evidenceSummary: "add a dossier entry",
    knownFacts: [],
    missingInfo: ["confirm owner-approved public copy"],
    doNotSay: ["Do not expose private Discord identity"],
    publicSafetyNotes: ["Verify public-safe wording before publishing."],
    recommendedTags: ["source file", "artist"],
    proposedTags: ["dossier seed", "manual-review"],
    primaryLink: {
      ...manualCandidateInput.primaryLink,
      label: "source-file dossier seed",
    },
  };
  const created = await (
    await authedPost({
      action: "createManualCandidate",
      input,
    })
  ).json();
  const payload = await (
    await authedPost({
      action: "createDraftFromCandidate",
      candidateId: created.candidate.id,
    })
  ).json();

  const fields = payload.draft.fields;
  const publicText = JSON.stringify({
    summary: fields.summary,
    notes: fields.notes,
    role: fields.role,
    tags: fields.tags,
    proposedTags: fields.proposedTags,
    primaryLinkLabel: fields.primaryLink?.label,
  });
  for (const phrase of [
    "Starter note only",
    "Starter evidence note",
    "Public safety:",
    "Missing info:",
    "broadcast_memory:",
    "add a dossier entry",
    "dossier seed",
    "source-file",
  ]) {
    assert.doesNotMatch(publicText, new RegExp(phrase, "i"));
  }
  assert.equal(fields.summary, publicCopyGuard.DOSSIER_PUBLIC_SUMMARY_PLACEHOLDER);
  assert.equal(fields.role, publicCopyGuard.DOSSIER_PUBLIC_ROLE_PLACEHOLDER);
  assert.match(fields.notes ?? "", /Boundaries \/ what not to claim:/);
  assert.match(fields.notes ?? "", /Owner-review notes:/);
  assert.deepEqual(fields.tags, ["artist"]);
  assert.deepEqual(fields.proposedTags, ["manual-review"]);
  assert.equal(fields.primaryLink.label, "Featured link");

  const sourceSummary = sourceFileSummary.createDossierSourceFileSummary({
    candidate: created.candidate,
    drafts: [payload.draft],
  });
  assert.equal(sourceSummary.substanceLevel, "thin");
  assert.match(JSON.stringify(sourceSummary), /confirm owner-approved public copy|Verify public-safe wording/);
  assert.doesNotMatch(JSON.stringify(fields), /confirm owner-approved public copy|Verify public-safe wording/);
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


test("owner review submission blocks dirty Summary, Notes, Role, and Tags", async () => {
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
      kind: manualCandidateInput.recommendedKind,
      ecosystemLane: manualCandidateInput.recommendedEcosystemLane,
      identityAuthority: manualCandidateInput.recommendedIdentityAuthority,
      role: "candidateId: dossier_candidate_debug_12345",
      summary: "Starter note only: add a dossier entry",
      notes: "Starter evidence note: Public safety: verify public-safe wording",
      tags: ["artist", "user_profiles/local_profile_observed"],
    },
  });

  const dirtyResponse = await authedPost({
    action: "submitDraftForOwnerReview",
    draftId: createDraftPayload.draft.id,
  });
  assert.equal(dirtyResponse.status, 400);
  const dirtyPayload = await dirtyResponse.json();
  assert.equal(dirtyPayload.code, "invalid_draft_fields");
  assert.ok(dirtyPayload.missingFields.includes("role"));
  assert.ok(dirtyPayload.missingFields.includes("summary"));
  assert.ok(dirtyPayload.missingFields.includes("notes"));
  assert.ok(dirtyPayload.missingFields.includes("tags"));
});



test("public database slug page stays backed by existing public entries", () => {
  const page = source("src/app/database/[slug]/page.tsx");
  assert.match(page, /databasePage\.entries/);
  assert.match(page, /generateStaticParams/);
  assert.match(page, /<DossierPageView dossier=\{databaseEntryToDossierPageViewModel\(entry\)\}/);
  assert.doesNotMatch(page, /dossier-public-copy-guard/);
  assert.ok(databasePage.entries.length > 0);
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
  const second = {
    candidate: await cloneCandidateForTest(first.candidate, {
      id: `${first.candidate.id}-queue`,
      reason: "Queue/session context.",
    }),
  };

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
  const second = {
    candidate: await cloneCandidateForTest(first.candidate, {
      id: `${first.candidate.id}-compact`,
      name: "signalwitch",
    }),
  };

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
  const second = {
    candidate: await cloneCandidateForTest(first.candidate, {
      id: `${first.candidate.id}-merge`,
      reason: "Queue/session context.",
      knownFacts: ["Fact B", "Fact A"],
      missingInfo: ["Missing B"],
      doNotSay: ["Do not say B"],
      publicSafetyNotes: ["Safety B"],
      recommendedTags: ["queue"],
      proposedTags: ["draft-b"],
    }),
  };

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
  const second = {
    candidate: await cloneCandidateForTest(first.candidate, {
      id: `${first.candidate.id}-taxonomy`,
      recommendedCategory: "Entity",
      recommendedKind: "radio_entity",
      recommendedEcosystemLane: "community_artist",
      recommendedIdentityAuthority: "community_owned",
    }),
  };

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
  const second = {
    candidate: await cloneCandidateForTest(first.candidate, {
      id: `${first.candidate.id}-draft`,
      recommendedKind: "radio_entity",
    }),
  };
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

test("admin dossiers dashboard does not promote duplicate merge review", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const mergePage = source(
    "src/app/admin/dossiers/duplicates/[groupId]/page.tsx",
  );
  assert.match(page, /Identity: Possible Match|Identity: Needs Confirmation|Possible Duplicate/);
  assert.doesNotMatch(page, /View Warning \/ Open Merge Review/);
  assert.doesNotMatch(page, /\/admin\/dossiers\/duplicates\//);
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
  assert.equal(confirmed.identityLink.useInPublicDossier, false);

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

  const referenceOnlyLink = await (
    await authedPost({
      action: "addDossierIdentityLink",
      candidateId,
      input: { label: "Ashley Reference", type: "alias" },
    })
  ).json();
  const referenceOnly = await (
    await authedPost({
      action: "confirmDossierIdentityLink",
      candidateId,
      identityLinkId: referenceOnlyLink.identityLink.id,
      useForMatching: false,
      useInPublicDossier: false,
    })
  ).json();
  const referenceOnlyMatch = workflow.matchDossierRecommendationSubject({
    recommendation: { subjectName: "Ashley Reference" },
    candidates: referenceOnly.candidates,
  });
  assert.equal(referenceOnly.identityLink.status, "confirmed");
  assert.equal(referenceOnly.identityLink.useForMatching, false);
  assert.equal(referenceOnly.identityLink.useInPublicDossier, false);
  assert.equal(referenceOnlyMatch.exactCandidateId, undefined);

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
    "Proposed Identity Links",
    "Confirmed Identity Links",
    "Rejected / Retired Identity History",
  ]) {
    assert.match(sourceFilePage, new RegExp(group));
  }
  assert.match(sourceFilePage, /<Section title="Identity links \/ aliases">/);
  assert.doesNotMatch(sourceFilePage, /<Section title="Identity Link Actions">/);
  assert.doesNotMatch(sourceFilePage, /identityLinks\.length > 0 &&/);
  assert.match(sourceFilePage, /No identity links pending/);
  assert.doesNotMatch(sourceFilePage, /No identity links saved yet/);
  assert.match(sourceFilePage, /title: "Proposed Identity Links",[\s\S]*links: proposedIdentityLinks/);
  assert.match(sourceFilePage, /title: "Confirmed Identity Links",[\s\S]*links: confirmedIdentityLinks/);
  assert.match(sourceFilePage, /title: "Rejected \/ Retired Identity History",[\s\S]*links: closedIdentityLinks/);
  assert.match(sourceFilePage, /\.filter\(\(group\) => group\.links\.length > 0\)/);
  const identityCheckStart = sourceFilePage.indexOf('<Section title="Identity links / aliases">');
  const identityCheckEnd = sourceFilePage.indexOf('</Section>', identityCheckStart);
  const identityCheckSection = sourceFilePage.slice(identityCheckStart, identityCheckEnd);
  assert.ok(identityCheckStart >= 0);
  assert.ok(identityCheckStart < sourceFilePage.indexOf('Source Notes / Admin Addendums'));
  assert.ok(identityCheckStart < sourceFilePage.indexOf('Proposed Dossier status'));
  assert.doesNotMatch(sourceFilePage, /Advanced Tools: Add Identity Link Manually/);
  assert.match(sourceFilePage, /Advanced Tools/);
  assert.doesNotMatch(identityCheckSection, /Add Identity Link/);
  assert.match(
    sourceFilePage,
    /This alias is waiting for review\. It will not affect matching until confirmed\./,
  );
  assert.match(
    sourceFilePage,
    /This alias is confirmed and can route future recommendations to this BNL Source File when matching is enabled\.|This alias is confirmed and can route future BNL Signals to this BNL Source File when matching is enabled\./,
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
  assert.match(sourceFilePage, /Reference only \/ Not used for matching/);
  assert.match(sourceFilePage, /Not used for matching/);
  assert.match(sourceFilePage, /Internal only/);
  assert.match(sourceFilePage, /Public-safe label/);
  assert.match(sourceFilePage, /Not public dossier text/);
  assert.match(
    sourceFilePage,
    /Identity links are internal routing\/context tools\.[\s\S]*Resolve these before[\s\S]*using this Source File for dossier drafting\.[\s\S]*Confirming a link can[\s\S]*help future BNL Signals route to this Source File, but it does not[\s\S]*merge Source Files, publish identity, or place the label in a[\s\S]*public dossier\./,
  );
  assert.match(sourceFilePage, /Use for future matching after confirmation/);
  assert.match(sourceFilePage, /identityLink\.status === "proposed"/);
  assert.match(sourceFilePage, /identityLink\.status === "confirmed"/);
  assert.match(sourceFilePage, /identityLink\.status === "rejected" \|\| identityLink\.status === "retired"/);
  assert.match(sourceFilePage, /\{isProposed && \(/);
  assert.match(sourceFilePage, /Confirm for matching/);
  assert.match(sourceFilePage, /Confirm reference only/);
  assert.match(sourceFilePage, /Reject/);
  assert.match(sourceFilePage, /Keep proposed/);
  assert.match(sourceFilePage, /Leave unresolved\. This stays proposed and will not\s+affect matching\./);
  assert.match(sourceFilePage, /\{isConfirmed && \(/);
  assert.match(sourceFilePage, /Retire/);
  assert.match(sourceFilePage, /Created from BNL Signal/);
  assert.match(sourceFilePage, /BNL Signal subject/);
  assert.match(sourceFilePage, /Reason \/ evidence summary/);
  assert.match(sourceFilePage, /Source lanes/);
  assert.match(sourceFilePage, /Open recommendation/);
  assert.match(sourceFilePage, /disabled:pointer-events-none/);
  assert.match(
    sourceFilePage,
    /Identity link confirmed for matching\. Future BNL Signals using this label can route to this Source File\. This does not publish identity or merge Source Files\./,
  );
  assert.match(
    sourceFilePage,
    /Identity link confirmed as reference-only\. It remains internal context and will not route future BNL Signals automatically\./,
  );
  assert.match(
    sourceFilePage,
    /Identity link rejected\. It will not be used for matching\./,
  );
  assert.match(
    sourceFilePage,
    /Identity link retired\. It remains in history and will no longer be used for matching\./,
  );
  assert.match(sourceFilePage, /useForMatching: true/);
  assert.match(sourceFilePage, /useInPublicDossier:\s*identityLink\.useInPublicDossier === true/);
  assert.match(sourceFilePage, /useForMatching: false/);
  assert.match(sourceFilePage, /useInPublicDossier: false/);

  assert.match(dashboard, /Identity: Connected to Existing Subject/);
  assert.match(dashboard, /Identity: Needs Confirmation/);
  assert.match(dashboard, /link\.status === "confirmed"/);
  assert.match(dashboard, /link\.status === "proposed"/);
  assert.doesNotMatch(dashboard, /Review Identity|Identity Link Actions|Create Proposed Identity Link|Confirm<|Reject<|Retire|notification|chip/i);

  assert.match(recommendationPage, /Matched by confirmed alias/);
  assert.match(recommendationPage, /Identity Link Actions/);
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
  assert.doesNotMatch(sourceFilePage, /publishDraft|mergeDossierCandidates|merge Source Files button|public publishing action/i);
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
  assert.equal(convertResponse.status, 200);
  const routedPayload = await convertResponse.json();
  assert.equal(routedPayload.recommendation.status, "attached_to_source_file");
  assert.equal(routedPayload.recommendation.targetCandidateId, candidateId);
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
  assertIncludesCopy(dashboardCopy, "Needs update from Source File");
  assertIncludesCopy(dashboardCopy, "Dossier status");
  assertIncludesCopy(sourceFileCopy, "This BNL Source File has new info not yet applied to the Proposed Dossier.");
  assertIncludesCopy(draftCopy, "BNL Source File has new notes since this Proposed Dossier was last updated.");
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
  assert.equal((await response.json()).code, "candidate_not_attachable");

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
  assert.equal((await response.json()).code, "candidate_not_attachable");

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
  assert.equal(response.status, 200);
  const routedPayload = await response.json();
  assert.equal(routedPayload.recommendation.targetCandidateId, targetPayload.candidate.id);
  assert.equal(routedPayload.candidates.length, 1);

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

test("convert recommendation routes when exact workflow match exists", async () => {
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
  assert.equal(response.status, 200);
  const routedPayload = await response.json();
  assert.equal(routedPayload.recommendation.status, "attached_to_source_file");
  assert.ok(routedPayload.recommendation.targetCandidateId);

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
  assertIncludesCopy(dashboardCopy, "Archive / Dismissed / Trash");
  assertIncludesCopy(dashboardCopy, "dismissed or archived signals");
});

test("recommendation inbox and source note UI are present and bounded", () => {
  const dashboard = source("src/app/admin/dossiers/page.tsx");
  assert.match(dashboard, /Candidates/);
  assert.match(dashboard, /Manual Signal/);
  assert.match(dashboard, /Create Manual Signal/);
  assert.match(dashboard, /Why BNL noticed/);
  assert.match(dashboard, /Identity: Possible Match/);
  assert.match(dashboard, /Identity: Needs Confirmation/);
  assert.match(dashboard, /href=\{`\/admin\/dossiers\/recommendations\/\$\{recommendation\.id\}`\}/);
  assert.match(dashboard, /Review Candidate/);
  assert.match(dashboard, /Review Update/);
  assert.match(dashboard, /Review Source File/);
  assert.match(dashboard, /Review Record/);
  assert.doesNotMatch(dashboard, /Review Identity|Add Missing Info/);

  const sourceFilePage = source(
    "src/app/admin/dossiers/candidates/[candidateId]/page.tsx",
  );
  assert.match(sourceFilePage, /Add to BNL Source File/);
  assert.match(sourceFilePage, /This adds information to this subject&apos;s BNL Source File/);
  assert.match(sourceFilePage, /This source file[\s\S]*remains one subject\/entity/);
  assert.match(sourceFilePage, /create or wait for a separate BNL\s+recommendation/);
  assert.match(sourceFilePage, /Save Info/);
  assert.match(sourceFilePage, /Identity links \/ aliases/);
  assert.doesNotMatch(sourceFilePage, /<Section title="Identity Link Actions">/);
  assert.doesNotMatch(sourceFilePage, /Advanced Tools: Add Identity Link Manually/);
  assert.match(sourceFilePage, /Advanced Tools/);
  assert.match(sourceFilePage, /Aliases help BNL route future BNL Signals/);
  assert.match(sourceFilePage, /Internal aliases are not\s+public dossier text/);
  assert.match(sourceFilePage, /Add Identity Link/);

  const draftPage = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  assert.match(draftPage, /Unapplied Source Notes/);
  assert.match(draftPage, /BNL Source File has new notes since this Proposed Dossier was last/);
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
    /BNL Signals are incoming source\/recommendation inputs/,
  );
  assert.match(recommendationPage, /terminalRecommendationStatuses/);
  assert.match(recommendationPage, /Converted to Dossier Seed\./);
  assert.match(recommendationPage, /Attached to matched Case File \/ BNL Source File\./);
  assert.match(recommendationPage, /Ignored\. This BNL Signal is closed\./);
  assert.match(recommendationPage, /Dismissed\. This BNL Signal is closed\./);
  assert.match(recommendationPage, /!isTerminal &&/);
  assert.match(recommendationPage, /Matches Case File/);
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



test("BNL Source File enrichment upserts changed same-key content but still dedupes identical refreshes", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  process.env.BNL_SOURCE_FILE_READ_TOKEN = "test-source-file-read-token";
  const beforePublic = JSON.stringify(databasePage.entries);
  const publicSlugPageBefore = source("src/app/database/[slug]/page.tsx");

  const intake = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Crow Source File Refresh",
    reason: "BNL dynamic discovery found Crow for source-file review.",
    evidenceSummary: "Starter discovery only.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:crow-source-refresh:discovery",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();
  await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: intake.candidate.id,
  });

  const baseEnrichment = {
    type: "modify_existing_dossier",
    subjectName: "Crow Source File Refresh",
    targetCandidateId: intake.candidate.id,
    reason: "BNL generated source-file enrichment for Crow review.",
    sourceLanes: ["active_source_file", "rd_knowledge_store"],
    sourceTypes: ["source_file_note"],
    ingestKey: "bnl:crow-source-refresh:enrichment",
    ingestSource: "bnl_source_file_enrichment",
    knownContext: ["Older generic BNL enrichment for Crow."],
    usefulEvidence: ["Generic source-file context needs owner review."],
    reviewOnlyEvidence: ["Older review-only packet."],
    publicSafetyNotes: ["Review-only; not public copy."],
    rawProvenance: {
      backendId: "raw-old-backend-id",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  const firstPayload = await (await bnlIngestPost(baseEnrichment)).json();
  assert.equal(firstPayload.duplicate, false);
  assert.equal(firstPayload.autoAction, "attached_existing");
  const originalRecommendationId = firstPayload.recommendation.id;

  const identicalPayload = await (await bnlIngestPost({
    ...baseEnrichment,
    rawProvenance: {
      backendId: "raw-new-backend-id-that-should-not-affect-digest",
      fetchedAt: "2026-06-03T00:00:00.000Z",
    },
  })).json();
  assert.equal(identicalPayload.duplicate, true);
  assert.equal(identicalPayload.recommendation.id, originalRecommendationId);

  let state = await store.getDossierWorkflowState();
  let sourceFile = state.candidates.find((candidate) => candidate.id === intake.candidate.id);
  let enrichmentNotes = sourceFile.sourceFileNotes.filter(
    (note) => note.ingestSource === "bnl_source_file_enrichment",
  );
  assert.equal(enrichmentNotes.length, 1);
  assert.doesNotMatch(enrichmentNotes[0].text, /raw-old-backend-id|raw-new-backend-id/);

  const changedEnrichment = {
    ...baseEnrichment,
    knownContext: ["Crow has recurring named Orion discussion in reviewed context."],
    usefulEvidence: ["Recurring named topic: Orion appears across reviewed messages."],
    conversationHighlights: ["Crow returned to Orion as an ongoing named topic."],
    topTopicDetails: ["Recurring named topic / Orion in reviewed source-file context."],
    musicSignals: ["Suno/tool mention appears in reviewed music-making context."],
    bnlInteractionSignals: ["BNL interaction pattern: asks BNL for source-file readouts and follows up."],
    reviewOnlyEvidence: ["Latest PR #226 fact extraction packet for owner review."],
    recommendedAction: "Review Orion, Suno/tool, and BNL interaction pattern before public use.",
    rawProvenance: {
      backendId: "raw-latest-backend-id",
      fetchedAt: "2026-06-03T12:00:00.000Z",
    },
  };
  const changedPayload = await (await bnlIngestPost(changedEnrichment)).json();
  assert.equal(changedPayload.duplicate, false);
  assert.equal(changedPayload.autoAction, "attached_existing");
  assert.equal(changedPayload.recommendation.id, originalRecommendationId);
  assert.deepEqual(changedPayload.recommendation.knownContext, changedEnrichment.knownContext);
  assert.match(changedPayload.recommendation.publicSafetyNotes.join(" "), /refreshed with newer review-only intelligence/);
  assert.deepEqual(changedPayload.recommendation.rawProvenance, changedEnrichment.rawProvenance);

  state = await store.getDossierWorkflowState();
  const savedRecommendations = state.recommendations.filter(
    (recommendation) => recommendation.ingestKey === baseEnrichment.ingestKey,
  );
  assert.equal(savedRecommendations.length, 1);
  assert.equal(savedRecommendations[0].id, originalRecommendationId);
  assert.deepEqual(savedRecommendations[0].knownContext, changedEnrichment.knownContext);
  assert.equal(savedRecommendations[0].targetCandidateId, intake.candidate.id);
  assert.deepEqual(savedRecommendations[0].rawProvenance, changedEnrichment.rawProvenance);

  sourceFile = state.candidates.find((candidate) => candidate.id === intake.candidate.id);
  enrichmentNotes = sourceFile.sourceFileNotes.filter(
    (note) => note.ingestSource === "bnl_source_file_enrichment",
  );
  assert.equal(enrichmentNotes.length, 1);
  const note = enrichmentNotes[0];
  assert.equal(note.ingestKey, baseEnrichment.ingestKey);
  assert.equal(note.publicSafe, false);
  assert.match(note.text, /Recurring named topic: Orion/);
  assert.match(note.text, /Suno\/tool mention/);
  assert.match(note.text, /BNL interaction pattern/);
  assert.doesNotMatch(note.text, /Older generic BNL enrichment|raw-latest-backend-id|rawProvenance/);

  const protectedPayload = await (
    await sourceFilesGet("?candidateId=" + encodeURIComponent(intake.candidate.id))
  ).json();
  assert.equal(protectedPayload.found, true);
  const protectedEnrichmentNotes = protectedPayload.sourceFile.sourceFileNotes.filter(
    (note) => note.ingestSource === "bnl_source_file_enrichment",
  );
  assert.equal(protectedEnrichmentNotes.length, 1);
  assert.match(protectedEnrichmentNotes[0].summary, /Orion/);
  const protectedEnrichmentRecommendation = protectedPayload.sourceFile.attachedRecommendations.find(
    (recommendation) => recommendation.ingestKey === baseEnrichment.ingestKey,
  );
  assert.equal(protectedEnrichmentRecommendation.id, originalRecommendationId);
  assert.equal(protectedEnrichmentRecommendation.updatedAt, savedRecommendations[0].updatedAt);

  const publicPayload = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
  assert.equal(JSON.stringify(databasePage.entries), beforePublic);
  assert.equal(source("src/app/database/[slug]/page.tsx"), publicSlugPageBefore);
  assert.doesNotMatch(
    JSON.stringify(publicPayload),
    /Crow Source File Refresh|Orion|Suno|bnl_source_file_enrichment|raw-latest-backend-id/,
  );
});

test("non-enrichment ingest keys keep duplicate recommendation behavior", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const first = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Normal Duplicate Subject",
    reason: "BNL discovery should keep ordinary idempotency.",
    evidenceSummary: "Original ordinary recommendation.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:normal-duplicate-key",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();
  const duplicate = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Normal Duplicate Subject",
    reason: "BNL discovery changed but should still dedupe by ingest key.",
    evidenceSummary: "Changed ordinary recommendation should not update.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:normal-duplicate-key",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.recommendation.id, first.recommendation.id);
  assert.equal(duplicate.recommendation.reason, first.recommendation.reason);

  const state = await store.getDossierWorkflowState();
  assert.equal(
    state.recommendations.filter((recommendation) => recommendation.ingestKey === "bnl:normal-duplicate-key").length,
    1,
  );
  assert.equal(state.recommendations[0].reason, first.recommendation.reason);
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
  assert.equal(intakeCandidate.sourceFileNotes[0].publicSafe, false);

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
  assert.equal(updateCandidate.sourceFileNotes[0].publicSafe, false);
  assert.equal(JSON.stringify(databasePage.entries.find((entry) => entry.name === "6 Bit")), beforePublic);
  assert.equal(state.drafts.length, 0);
});

test("BNL Source File enrichment attaches across open review lanes without public draft mutation", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  const beforePublic = JSON.stringify(databasePage.entries);
  const openStatuses = [
    "suggested",
    "needs_review",
    "selected",
    "draft_requested",
    "draft_ready",
    "needs_revision",
    "needs_more_evidence",
  ];

  for (const status of openStatuses) {
    const candidate = await store.createManualDossierCandidate({
      ...manualCandidateInput,
      name: `Open Enrichment ${status}`,
      evidenceSummary: `Public-safe seed for ${status}.`,
    });
    await store.updateDossierCandidateStatus(candidate.id, status);
    let draftBefore;
    if (status === "draft_ready") {
      draftBefore = await store.createDraftFromCandidate(candidate.id);
      await store.updateDossierCandidateStatus(candidate.id, status);
    }

    const response = await bnlIngestPost({
      type: "modify_existing_dossier",
      subjectName: `Open Enrichment ${status}`,
      targetCandidateId: candidate.id,
      reason: `BNL generated ${status} source-file enrichment for review.`,
      evidenceSummary: `Review-only enrichment for ${status}.`,
      sourceLanes: ["active_source_file"],
      sourceTypes: ["source_file_note"],
      publicSafetyNotes: ["Review-only source enrichment."],
      ingestKey: `bnl:open-enrichment:${status}`,
      ingestSource: "bnl_source_file_enrichment",
      rawProvenance: {
        sourcePath: `internal/source/${status}`,
        backendId: `backend-${status}`,
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.autoAction, "attached_existing");
    assert.equal(payload.candidate, undefined);
    assert.equal(payload.recommendation.status, "attached_to_source_file");
    assert.equal(payload.recommendation.targetCandidateId, candidate.id);
    assert.match(payload.recommendation.publicSafetyNotes.join(" "), /review-only BNL Source File Enrichment/);
    assert.match(payload.recommendation.publicSafetyNotes.join(" "), /no public dossier content was changed/);
    assert.match(payload.recommendation.publicSafetyNotes.join(" "), /owner\/admin review is still required/);
    assert.deepEqual(payload.recommendation.rawProvenance, {
      sourcePath: `internal/source/${status}`,
      backendId: `backend-${status}`,
    });

    const state = await store.getDossierWorkflowState();
    const savedCandidate = state.candidates.find((item) => item.id === candidate.id);
    assert.equal(savedCandidate.status, status);
    assert.equal(savedCandidate.sourceFileNotes.length, 1);
    assert.equal(savedCandidate.sourceFileNotes[0].ingestSource, "bnl_source_file_enrichment");
    assert.equal(savedCandidate.sourceFileNotes[0].publicSafe, false);
    assert.match(savedCandidate.sourceFileNotes[0].text, /BNL Source File Enrichment/);

    if (draftBefore) {
      const draftAfter = state.drafts.find((draft) => draft.id === draftBefore.id);
      assert.deepEqual(draftAfter.fields, draftBefore.fields);
      assert.doesNotMatch(JSON.stringify(draftAfter.fields), /Review-only enrichment|source_file_note|backend-/);
    }
  }

  assert.equal(JSON.stringify(databasePage.entries), beforePublic);
  const publicPayload = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
  assert.doesNotMatch(JSON.stringify(publicPayload), /Open Enrichment|bnl_source_file_enrichment|backend-/);
});

test("BNL Source File enrichment terminal targets are left for review without attaching", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  const beforePublic = JSON.stringify(databasePage.entries);
  const terminalStatuses = ["archived", "approved", "denied", "merged"];

  for (const status of terminalStatuses) {
    const candidate = await store.createManualDossierCandidate({
      ...manualCandidateInput,
      name: `Terminal Enrichment ${status}`,
    });
    await store.updateDossierCandidateStatus(candidate.id, status);

    const response = await bnlIngestPost({
      type: "modify_existing_dossier",
      subjectName: `Terminal Enrichment ${status}`,
      targetCandidateId: candidate.id,
      reason: `BNL generated terminal ${status} enrichment for review.`,
      evidenceSummary: `Terminal enrichment for ${status}.`,
      sourceLanes: ["active_source_file"],
      sourceTypes: ["source_file_note"],
      ingestKey: `bnl:terminal-enrichment:${status}`,
      ingestSource: "bnl_source_file_enrichment",
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.autoAction, "left_for_review");
    assert.equal(payload.candidate, undefined);
    assert.equal(payload.recommendation.status, "new");
    assert.equal(payload.recommendation.targetCandidateId, candidate.id);
    assert.match(
      payload.recommendation.publicSafetyNotes.join(" "),
      /Target exists but is not open for enrichment attachment/,
    );
    assert.match(
      payload.recommendation.publicSafetyNotes.join(" "),
      /No Source File, Proposed Dossier, public page, alias, merge, or owner-review state was changed/,
    );

    const state = await store.getDossierWorkflowState();
    const savedCandidate = state.candidates.find((item) => item.id === candidate.id);
    assert.equal(savedCandidate.status, status);
    assert.equal(savedCandidate.sourceFileNotes.length, 0);
  }

  assert.equal(JSON.stringify(databasePage.entries), beforePublic);
});

test("BNL Source File enrichment keeps missing targets strict and does not loosen other target rules", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const missingResponse = await bnlIngestPost({
    type: "modify_existing_dossier",
    subjectName: "Missing Target Enrichment",
    targetCandidateId: "missing-candidate-id",
    reason: "BNL generated enrichment for a bad target.",
    evidenceSummary: "Should fail strictly.",
    ingestKey: "bnl:missing-target-enrichment",
    ingestSource: "bnl_source_file_enrichment",
  });
  assert.equal(missingResponse.status, 404);
  assert.equal((await missingResponse.json()).code, "target_candidate_not_found");

  const intake = await (await bnlIngestPost({
    type: "new_subject",
    subjectName: "Non Enrichment Intake Target",
    reason: "BNL dynamic discovery created candidate intake.",
    sourceLanes: ["rd_context"],
    ingestKey: "bnl:non-enrichment-intake-target:discovery",
    ingestSource: "bnl_dynamic_candidate_discovery",
  })).json();
  assert.equal(intake.candidate.status, "candidate_intake");

  const bridgeResponse = await bnlIngestPost({
    type: "modify_existing_dossier",
    subjectName: "Non Enrichment Intake Target",
    targetCandidateId: intake.candidate.id,
    reason: "Bridge should not attach to candidate intake through enrichment rules.",
    evidenceSummary: "Non-enrichment target rule should stay strict.",
    ingestKey: "bnl:non-enrichment-intake-target:bridge",
    ingestSource: "bnl_source_knowledge_bridge",
  });
  assert.equal(bridgeResponse.status, 400);
  assert.equal((await bridgeResponse.json()).code, "target_candidate_not_active");
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


test("source memory meaning formatter interprets raw labels and keeps mappings debug-only", () => {
  assert.deepEqual(
    sourceMemoryMeaning.sourceMemoryMeaningItems(
      "user_profiles/local_profile_observed: Local profile observed for Crow.",
      { subjectName: "Crow" },
    ),
    ["BNL found an internal local profile match for Crow."],
  );
  assert.deepEqual(
    sourceMemoryMeaning.sourceMemoryMeaningItems(
      "relationship_journal/local_relationship_trace: help_signal: User asked for help...",
    ),
    ["BNL found prior relationship/context notes connected to this subject."],
  );
  assert.deepEqual(
    sourceMemoryMeaning.sourceMemoryMeaningItems(
      "source lane mapping: relationship_journal -> unknown, user_profiles -> unknown",
    ),
    [],
  );
  assert.equal(
    sourceMemoryMeaning.isRawSourceMappingOnly(
      "source lane mapping: relationship_journal -> unknown, user_profiles -> unknown",
    ),
    true,
  );
  assert.deepEqual(
    sourceMemoryMeaning.sourceMemoryMeaningItems("BNL local knowledge stores."),
    ["Internal BNL memory references exist, but they need owner review before public use."],
  );
});

test("candidate Source File visible panels render interpreted memory evidence", () => {
  const candidatePage = normalizedSource("src/app/admin/dossiers/candidates/[candidateId]/page.tsx");
  assert.doesNotMatch(candidatePage, /<p>Source lanes:/);
  assert.match(candidatePage, /recommendationEvidenceItems/);
  assert.match(candidatePage, /sourceFileReasonMeaning\(candidate\.reason, candidate\.name\)/);
  assert.match(candidatePage, /sourceFileWhyNowMeaning\(candidate\.whyNow\)/);

  const summary = sourceFileSummary.createDossierSourceFileSummary({
    candidate: {
      id: "candidate_crow_memory",
      name: "Crow",
      candidateType: "unknown",
      source: "bnl_source_knowledge_bridge",
      tier: "review_candidate",
      score: 4,
      whyNow: "Source lanes: unknown",
      reason:
        "Knowledge bridge found Crow in existing BNL local knowledge stores (relationship_journal, user_profiles). Source qualities: local_profile_observed, local_relationship_trace.",
      evidenceSummary:
        "user_profiles/local_profile_observed relationship_journal/local_relationship_trace source lane mapping: relationship_journal -> unknown, user_profiles -> unknown",
      status: "active_source_file",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      sourceFileNotes: [
        {
          id: "note_crow_memory",
          candidateId: "candidate_crow_memory",
          type: "general_note",
          text: "relationship_journal/local_relationship_trace: help_signal: User asked for help... EDGE_SESSION abc",
          source: "bnl_recommendation",
          status: "active",
          publicSafe: false,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    },
  });

  const visibleSummary = JSON.stringify({
    currentRead: summary.currentRead,
    knownContext: summary.knownContext,
    usefulEvidence: summary.usefulEvidence,
    patterns: summary.patterns,
    confirmedStrong: summary.confirmedStrong,
    claimedNeedsReview: summary.claimedNeedsReview,
    missingInfo: summary.missingInfo,
    notPublicYet: summary.notPublicYet,
    recommendedNextAction: summary.recommendedNextAction,
  });
  assert.doesNotMatch(visibleSummary, /user_profiles\/local_profile_observed/i);
  assert.doesNotMatch(visibleSummary, /relationship_journal\/local_relationship_trace/i);
  assert.doesNotMatch(visibleSummary, /source lane mapping|Source lanes: unknown|unknown -> unknown|help_signal|EDGE_SESSION/i);
  assert.match(visibleSummary, /BNL found an internal local profile match for Crow/);
  assert.match(visibleSummary, /BNL found prior relationship\/context notes connected to Crow/);
  assert.match(visibleSummary, /Public-safe identity is not confirmed/);

  assert.equal(
    sourceMemoryMeaning.sourceFileReasonMeaning(
      "user_profiles/local_profile_observed conversations/public_discord_observed",
      "Crow",
    ),
    "BNL found existing internal context for Crow and created this source file so an owner can decide whether it should become a usable dossier record.",
  );
  assert.equal(
    sourceMemoryMeaning.sourceFileWhyNowMeaning(
      "source lane mapping relationship_journal -> unknown",
    ),
    "Needs owner review before any public dossier copy is drafted, published, merged, or linked to an identity.",
  );
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
  assert.match(mainText, /BNL found an internal local profile match for this subject/);
  assert.match(mainText, /This needs internal review before public use|Do not use publicly until owner\/admin review/);
  assert.equal(
    (mainText.match(/BNL found an internal local profile match for this subject/g) ?? []).length,
    1,
  );
  assert.match(JSON.stringify(view.rawMetadata), /source lane|relationship_journal|unknown/i);
  assert.match(view.rawText, /user_profiles\/local_profile_observed/);
});



test("legacy source-file note view translates raw source memory instead of leaking it", async () => {
  await resetWorkflowStore();
  const beforePublic = JSON.stringify(databasePage.entries);
  const rawLegacyText = [
    "Evidence summary: user_profiles/local_profile_observed: Local profile observed for Crow. help_signal: EDGE_SESSION abc123456789",
    "relationship_journal/local_relationship_trace: help_signal: User asked for help in EDGE_SESSION abc123456789",
    "Source lanes: unknown",
    "Source lane mapping: relationship_journal -> unknown, user_profiles -> unknown",
    "Summary: BNL local knowledge stores.",
  ].join("\n");
  const note = {
    type: "general_note",
    text: rawLegacyText,
    source: "bnl_recommendation",
    status: "active",
    publicSafe: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ingestSource: "bnl_source_knowledge_bridge",
    ingestKey: "bnl:legacy-crow-note",
    evidenceSummary:
      "user_profiles/local_profile_observed: Local profile observed for Crow. relationship_journal/local_relationship_trace help_signal: EDGE_SESSION abc123456789",
    reason: "BNL local knowledge stores. relationship_journal/local_relationship_trace",
    subjectName: "Crow",
  };

  const view = noteDisplay.createHumanReadableSourceFileNoteView(note);
  const visibleSections = JSON.stringify(view.sections);
  const usefulEvidence = JSON.stringify(
    view.sections.find((section) => section.title === "Useful Evidence")?.items ?? [],
  );
  const claimedNeedsReview = JSON.stringify(
    view.sections.find((section) => section.title === "Claimed / Needs Review")?.items ?? [],
  );

  for (const visibleText of [visibleSections, usefulEvidence, claimedNeedsReview]) {
    assert.doesNotMatch(visibleText, /help_signal:?/i);
    assert.doesNotMatch(visibleText, /EDGE_SESSI(?:ON)?/i);
    assert.doesNotMatch(visibleText, /relationship_journal\/local_relationship_trace/i);
    assert.doesNotMatch(visibleText, /user_profiles\/local_profile_observed/i);
    assert.doesNotMatch(visibleText, /conversations\/public_discord_observed/i);
    assert.doesNotMatch(visibleText, /source lane mapping|Source lanes: unknown|unknown -> unknown/i);
    assert.doesNotMatch(visibleText, /: Local profile observed|: BNL local knowledge stores\./i);
  }

  assert.match(usefulEvidence, /BNL found an internal local profile match for Crow/);
  assert.match(usefulEvidence, /BNL found prior relationship\/context notes connected to Crow/);
  assert.match(visibleSections, /Internal BNL memory references exist, but they need owner review before public use/);
  assert.equal(
    (visibleSections.match(/local profile match/g) ?? []).length,
    1,
  );
  assert.equal(
    (visibleSections.match(/relationship\/context notes/g) ?? []).length,
    1,
  );

  assert.match(view.rawText ?? "", /user_profiles\/local_profile_observed/);
  assert.match(view.rawText ?? "", /EDGE_SESSION/);
  assert.match(JSON.stringify(view.rawMetadata), /legacyEvidenceSummary/);
  assert.match(JSON.stringify(view.rawMetadata), /user_profiles\/local_profile_observed/);
  assert.match(JSON.stringify(view.rawMetadata), /legacyReason/);
  assert.match(JSON.stringify(view.rawMetadata), /relationship_journal\/local_relationship_trace/);

  const candidatePayload = await (await authedPost({
    action: "createManualCandidate",
    input: {
      ...manualCandidateInput,
      name: "Crow Legacy Note",
      reason: "Manual review shell for legacy note leak test.",
      evidenceSummary: note.evidenceSummary,
    },
  })).json();
  const draftPayload = await (await authedPost({
    action: "createDraftFromCandidate",
    candidateId: candidatePayload.candidate.id,
  })).json();
  const draftText = JSON.stringify(draftPayload.draft.fields);
  assert.doesNotMatch(draftText, /help_signal|EDGE_SESSION|user_profiles\/local_profile_observed|relationship_journal\/local_relationship_trace/i);

  const publicPayload = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
  assert.equal(JSON.stringify(databasePage.entries), beforePublic);
  assert.doesNotMatch(JSON.stringify(publicPayload), /Crow Legacy Note|help_signal|EDGE_SESSION|local_profile_observed/i);
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
  assert.match(mainText, /BNL found an internal local profile match for Melanie Heart/);
  assert.match(JSON.stringify(view.rawMetadata), /relationship_journal|rd_context|bnl:rec_filter/);
});

test("admin dashboard keeps public dossier-only source lookup fallback bounded", () => {
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  assertIncludesCopy(pageCopy, "Dossier Updates");
  assertIncludesCopy(pageCopy, "No existing dossier updates are waiting.");
  assertIncludesCopy(pageCopy, "Review update details before attaching anywhere public.");
  assertIncludesCopy(pageCopy, "Identity: Needs Confirmation");
});

test("Phase 2 draft workflow keeps PR 155 stacked shared preview order", () => {
  const page = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  assert.match(page, /DossierSourceFileSummaryPanel/);
  assert.match(page, /DossierPageView/);
  assert.match(page, /dossier=\{dossier\}/);
  assert.doesNotMatch(page, /entry=\{dossier\}|entry=\{entry\}/);
  assert.match(page, /DossierSourceFileSummaryPanel/);
  assert.match(page, /BNL Edit Chat panel/);
  assert.match(page, /Public Dossier Preview/);
  const renderedWorkflow = page.slice(page.indexOf("<form onSubmit={saveDraft}"));
  assert.ok(
    renderedWorkflow.indexOf("BNL Edit Chat panel") < renderedWorkflow.indexOf("ProposedDossierPreview"),
  );
  assert.ok(
    page.indexOf("DossierSourceFileSummaryPanel") < page.indexOf("<form onSubmit={saveDraft}"),
  );
  assert.doesNotMatch(page, /grid-cols-\[0\.85fr_1\.15fr\]/);
});

test("meaning-first source summary filters backend source exhaust from normal buckets", () => {
  const summary = sourceFileSummary.createDossierSourceFileSummary({
    candidate: {
      id: "candidate_backend_only",
      name: "LostMarbles",
      candidateType: "unknown",
      source: "bnl_source_knowledge_bridge",
      tier: "review_candidate",
      score: 4,
      whyNow: "Bridge source lane mapping: conversations -> unknown, user_profiles -> unknown",
      reason: "conversations/public_discord_observed: public_home conversation model mentions LostMarbles",
      evidenceSummary: "ingestKey bnl:source:candidate_backend_only",
      status: "active_source_file",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      sourceFileNotes: [
        {
          id: "note_backend_only",
          candidateId: "candidate_backend_only",
          type: "general_note",
          text: "user_profiles/local_profile_observed\nconversations/public_discord_observed",
          source: "bnl_recommendation",
          status: "active",
          publicSafe: false,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    },
  });
  const mainText = JSON.stringify({
    currentRead: summary.currentRead,
    knownContext: summary.knownContext,
    usefulEvidence: summary.usefulEvidence,
    patterns: summary.patterns,
    confirmedStrong: summary.confirmedStrong,
    claimedNeedsReview: summary.claimedNeedsReview,
    missingInfo: summary.missingInfo,
    notPublicYet: summary.notPublicYet,
    recommendedNextAction: summary.recommendedNextAction,
  });
  assert.doesNotMatch(mainText, /user_profiles\/local_profile_observed/i);
  assert.doesNotMatch(mainText, /conversations\/public_discord_observed/i);
  assert.doesNotMatch(mainText, /source lane mapping|ingestKey|unknown -> unknown/i);
  assert.match(mainText, /not yet contain enough human-usable context/i);
});

test("meaning-first source summary keeps human source substance in useful buckets", () => {
  const summary = sourceFileSummary.createDossierSourceFileSummary({
    candidate: {
      id: "candidate_human_context",
      name: "Human Context Subject",
      candidateType: "artist",
      source: "manual",
      tier: "draft_ready",
      score: 12,
      whyNow: "The subject has repeated community presence across BARCODE Radio planning notes.",
      reason: "Admins noticed a recurring collaborator pattern around recent broadcast planning.",
      evidenceSummary: "The subject is repeatedly mentioned as a collaborator in public-safe planning notes.",
      knownFacts: ["The subject is connected to recent BARCODE Radio planning."],
      missingInfo: ["Confirm the preferred public display name."],
      publicSafetyNotes: ["Do not describe private Discord context publicly."],
      status: "active_source_file",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  });
  assert.match(summary.usefulEvidence.join(" "), /repeatedly mentioned as a collaborator/i);
  assert.match(summary.knownContext.join(" "), /BARCODE Radio planning/i);
  assert.match(summary.patterns.join(" "), /repeated community presence/i);
  assert.match(summary.notPublicYet.join(" "), /private Discord context/i);
});

test("raw provenance remains collapsed and outside normal preview surfaces", () => {
  const draftPage = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  const candidatePage = source("src/app/admin/dossiers/candidates/[candidateId]/page.tsx");
  const previewFunction = draftPage.slice(
    draftPage.indexOf("function ProposedDossierPreview"),
    draftPage.indexOf("export default function DossierDraftEditorPage"),
  );
  assert.match(draftPage, /Developer \/ Raw Source Audit — internal debugging only/);
  assert.match(candidatePage, /Developer \/ Raw Source Audit — internal debugging only/);
  assert.doesNotMatch(previewFunction, /candidate\?\.reason|candidate\?\.whyNow|candidate\?\.evidenceSummary|note\.text/);
});

function collectReactText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectReactText).join(" ");
  if (typeof node === "object" && typeof node.type === "function") {
    return collectReactText(node.type(node.props ?? {}));
  }
  if (typeof node === "object") return collectReactText(node.props?.children);
  return "";
}

test("Source File page renders Entity Intelligence Review Console sections", () => {
  const sourceFilePage = normalizedSource("src/app/admin/dossiers/candidates/[candidateId]/page.tsx");
  const recommendationPage = normalizedSource("src/app/admin/dossiers/recommendations/[recommendationId]/page.tsx");
  const summaryPanel = normalizedSource("src/components/DossierSourceFileSummaryPanel.tsx");
  const readoutPanel = normalizedSource("src/components/DossierEntityActivityReadoutPanel.tsx");

  assert.match(sourceFilePage, /createDossierEntityActivityReadoutFromSourceFile/);
  assert.match(sourceFilePage, /DossierSourceFileSummaryPanel/);
  assert.match(sourceFilePage, /entityReadout=\{entityActivityReadout\}/);
  assert.doesNotMatch(sourceFilePage, /DossierEntityActivityReadoutPanel readout=\{entityActivityReadout\}/);
  assert.doesNotMatch(sourceFilePage, /Persistent Source File Draft|Save Internal Summary/);
  assert.match(sourceFilePage, /Operator Source File Summary/);
  assert.match(sourceFilePage, /Add to BNL Source File/);
  assert.ok(
    sourceFilePage.indexOf("DossierSourceFileSummaryPanel") < sourceFilePage.indexOf("<form onSubmit={saveSourceFileSummary}"),
  );
  assert.match(summaryPanel, /BNL Source File Display Layer/);
  assertIncludesCopy(summaryPanel, "Source File header / refresh status");
  assertIncludesCopy(summaryPanel, "BNL Case File Report");
  assertIncludesCopy(summaryPanel, "Recommended Next Steps");
  assertIncludesCopy(summaryPanel, "Queue / Submission Context");
  assertIncludesCopy(summaryPanel, "Review-only");
  assertIncludesCopy(summaryPanel, "Structured packet");
  assertIncludesCopy(summaryPanel, "Safe fallback");
  assertIncludesCopy(summaryPanel, "Evidence Summary");
  assertIncludesCopy(summaryPanel, "Relationship Context");
  assertIncludesCopy(summaryPanel, "Interim BNL Brief");
  assertIncludesCopy(summaryPanel, "Creative / Music Context");
  assertIncludesCopy(summaryPanel, "Community Context");
  assert.doesNotMatch(summaryPanel, /rawProvenance/);

  assert.match(recommendationPage, /createDossierEntityActivityReadoutFromRecommendation/);
  assert.match(recommendationPage, /DossierEntityActivityReadoutPanel/);
  assertIncludesCopy(readoutPanel, "BNL Entity Readout / Entity Activity Summary");
});


function collectDefaultVisibleText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectDefaultVisibleText).join(" ");
  if (typeof node === "object" && typeof node.type === "function") {
    return collectDefaultVisibleText(node.type(node.props ?? {}));
  }
  if (typeof node === "object" && node.type === "details") {
    const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    return children
      .filter((child) => child && typeof child === "object" && child.type === "summary")
      .map(collectDefaultVisibleText)
      .join(" ");
  }
  if (typeof node === "object") return collectDefaultVisibleText(node.props?.children);
  return "";
}

function sourceFileReportTestSummary() {
  return {
    currentRead: "Raw summary should not become a report.",
    knownContext: [],
    whyTracked: "Admin review.",
    usefulEvidence: [],
    patterns: [],
    confirmedStrong: [],
    claimedNeedsReview: [],
    privateRelationshipContext: [],
    publicSafePossibilities: [],
    privateOnlyNotes: [],
    uncertainties: [],
    missingInfo: ["RAW_MISSING_INFO_SHOULD_NOT_RENDER_AS_REPORT"],
    notPublicYet: [],
    observedChannels: [],
    conversationHighlights: [],
    topicBreakdown: ["global_mixed source_blind internal classification automated topic label source row(s) approved approved"],
    bestEvidenceToReview: [],
    bnlInteractionSignals: [],
    musicSignals: [],
    communitySignals: [],
    sourceCoverage: [],
    evidenceDetails: ["RAW_EVIDENCE_CATEGORY_FRAGMENT"],
    representativeEvidence: [],
    activityFrequencySummary: [],
    topChannels: [],
    topTopicDetails: [],
    recentActivitySummary: [],
    authoredVsMentionedSummary: [],
    publicUseCandidates: [],
    reviewOnlyEvidence: [],
    sourceAuthority: [],
    recommendedNextAction: "Wait for BNL report.",
    substanceLevel: "thin",
    publicReadiness: "not_ready",
    existingPublicDossier: "no",
    nextAction: "needs_info",
    lastUpdatedAt: "2026-06-10T00:00:00.000Z",
    summarySource: "structured",
  };
}



test("Source File page renders subjectIntelligenceBriefV1 as the primary report with one collapsed debug fallback", () => {
  const summary = sourceFileReportTestSummary();
  const archive = {
    id: "archive-subject-brief-v1",
    candidateId: "candidate-subject-brief-v1",
    subjectName: "Crow Brief Subject",
    subjectKey: "crow-brief-subject",
    sourceDigest: "abcdef1234567890",
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    archiveSize: 256,
    chunkCount: 2,
    reviewOnly: true,
    compactSummary: "RAW_COMPACT_BRIEF_SHOULD_STAY_COLLAPSED",
    sourceFileCaseReportV1: {
      version: "1",
      generatedAt: "2026-06-10T00:00:00.000Z",
      reportStatus: "dossier_ready",
      caseSummary: "OLD_CATEGORY_CASE_SUMMARY_SHOULD_NOT_BE_PRIMARY",
      dossierUse: "OLD_CATEGORY_DOSSIER_USE_SHOULD_NOT_BE_PRIMARY",
      publicSafeClaims: ["OLD_CATEGORY_PUBLIC_SAFE_CLAIM_SHOULD_NOT_BE_PRIMARY"],
      subjectIntelligenceBriefV1: {
        subjectRead: "Crow is a high-signal community participant with recurring public creative activity.",
        bnlTake: {
          confirmedFact: "Approved public authored items are present in the scan.",
          bnlInterpretation: "BNL reads Crow as active enough for a useful Source File, but not public-copy-ready.",
          uncertainty: "Identity and relationship context still need admin review.",
        },
        activitySnapshot: {
          totalApprovedPublicAuthoredItems: 7,
          totalPublicMentions: 11,
          reviewOnlyEvidenceCount: 3,
          totalEvidenceScanned: 21,
          latestObserved: "2026-06-09T20:30:00.000Z",
          activityLevel: "active",
          topChannels: ["Discord", "Suno"],
        },
        topicBuckets: [
          {
            topic: "music experiments",
            strength: "strong",
            evidenceCount: 4,
            explanation: "Repeated public discussion of generated tracks and mix revisions.",
            exampleSignals: ["shared a Suno link", "asked for mix feedback"],
          },
        ],
        namedAnchors: [
          { name: "Orion", type: "person", strength: "medium", note: "Appears as a recurring public conversation anchor." },
          { name: "noise", type: "noise", strength: "noise", note: "Should be hidden." },
        ],
        musicAndLinkSignals: ["Suno link appears in public-safe evidence."],
        relationshipSignals: ["Possible collaborator context; review-only unless confirmed."],
        queueSubmissionRead: "No queue submission connection is stated in this brief.",
        sourceFileGaps: ["Confirm whether the Suno link is theirs."],
        recommendedAdminActions: ["Ask admins to verify identity-safe phrasing."],
        doNotSayPubliclyYet: ["Do not state collaborator relationships publicly yet."],
      },
    },
  };

  const visibleText = collectDefaultVisibleText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary,
    subjectName: "Crow Brief Subject",
    latestSourceFileArchive: archive,
  }));
  assert.match(visibleText, /BNL Subject Intelligence Brief/);
  assert.match(visibleText, /Activity Snapshot/);
  assert.match(visibleText, /What They Talk About/);
  assert.match(visibleText, /Named Anchors \/ Connections/);
  assert.match(visibleText, /Current Take \/ Admin Guidance/);
  assert.match(visibleText, /Music \/ Link Signals/);
  assert.match(visibleText, /Relationship \/ Context Signals/);
  assert.match(visibleText, /Queue \/ Submission Read/);
  assert.match(visibleText, /What To Add To This Source File/);
  assert.match(visibleText, /Do Not Say Publicly Yet/);
  assert.match(visibleText, /Crow is a high-signal community participant/);
  assert.match(visibleText, /BNL reads Crow as active enough/);
  assert.match(visibleText, /music experiments/);
  assert.match(visibleText, /Orion/);
  assert.doesNotMatch(visibleText, /OLD_CATEGORY_CASE_SUMMARY_SHOULD_NOT_BE_PRIMARY|OLD_CATEGORY_DOSSIER_USE_SHOULD_NOT_BE_PRIMARY|OLD_CATEGORY_PUBLIC_SAFE_CLAIM_SHOULD_NOT_BE_PRIMARY/);
  assert.doesNotMatch(visibleText, /Case Summary|Dossier Use|Public-Safe Claims/);

  const debugElement = sourceSummaryPanelComponent.DossierSourceFileArchiveRawData({ latestSourceFileArchive: archive });
  const defaultDebugText = collectDefaultVisibleText(debugElement);
  assert.match(defaultDebugText, /Raw Report \/ Debug/);
  assert.doesNotMatch(defaultDebugText, /OLD_CATEGORY_CASE_SUMMARY_SHOULD_NOT_BE_PRIMARY|RAW_COMPACT_BRIEF_SHOULD_STAY_COLLAPSED/);
  const fullDebugText = collectReactText(debugElement);
  assert.match(fullDebugText, /Legacy sectioned Case File Report/);
  assert.match(fullDebugText, /OLD_CATEGORY_CASE_SUMMARY_SHOULD_NOT_BE_PRIMARY/);
  assert.match(fullDebugText, /RAW_COMPACT_BRIEF_SHOULD_STAY_COLLAPSED/);
  assert.match(fullDebugText, /Raw archive JSON/);
});

test("Source File page renders only BNL-authored Case File Reports and keeps raw archive collapsed", () => {
  const summary = sourceFileReportTestSummary();
  const archive = {
    id: "archive-report-v1",
    candidateId: "candidate-report-v1",
    subjectName: "Report Subject",
    subjectKey: "report-subject",
    sourceDigest: "1234567890abcdef",
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    archiveSize: 100,
    chunkCount: 1,
    reviewOnly: true,
    compactSummary: "COMPACT_SUMMARY_SHOULD_STAY_ARCHIVED",
    missingInfo: ["RAW_MISSING_INFO_SHOULD_STAY_ARCHIVED"],
    evidenceReceiptSummary: ["RAW_EVIDENCE_CATEGORY_FRAGMENT_SHOULD_STAY_ARCHIVED"],
    sourceFileCaseReportV1: {
      version: "1",
      generatedAt: "2026-06-10T00:00:00.000Z",
      reportStatus: "dossier_ready",
      caseSummary: "BNL-authored case summary sentence.",
      dossierUse: "BNL-authored dossier use sentence.",
      publicSafeClaims: ["BNL-authored public-safe claim."],
      evidenceSummary: ["BNL-authored evidence summary."],
      communityContext: "BNL-authored community context.",
      creativeMusicContext: "BNL-authored creative context.",
      relationshipContext: "BNL-authored relationship context.",
      queueSubmissionContext: "BNL-authored queue context.",
      identityContext: "BNL-authored identity context.",
      reviewBlockers: ["BNL-authored blocker."],
      internalOnlyNotes: ["BNL-authored internal note."],
      recommendedNextSteps: ["BNL-authored next step."],
      confidenceNotes: ["BNL-authored confidence note."],
      memoryCoverage: ["BNL-authored memory coverage."],
    },
  };

  const visibleText = collectDefaultVisibleText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary,
    subjectName: "Report Subject",
    latestSourceFileArchive: archive,
  }));
  assert.match(visibleText, /BNL Case File Report/);
  assert.match(visibleText, /BNL-authored case summary sentence/);
  assert.match(visibleText, /Dossier Use/);
  assert.match(visibleText, /Public-Safe Claims/);
  assert.match(visibleText, /Confidence \/ Memory Coverage/);
  assert.doesNotMatch(visibleText, /COMPACT_SUMMARY_SHOULD_STAY_ARCHIVED|RAW_MISSING_INFO_SHOULD_STAY_ARCHIVED|RAW_EVIDENCE_CATEGORY_FRAGMENT_SHOULD_STAY_ARCHIVED/);
  assert.doesNotMatch(visibleText, /Missing Info|What BNL Knows|Evidence by Category|Latest BNL Source Archive Readout/);
  assert.doesNotMatch(visibleText, /global_mixed|source_blind|source row\(s\)|internal classification|automated topic label|approved approved/);

  const archiveText = collectReactText(sourceSummaryPanelComponent.DossierSourceFileArchiveRawData({ latestSourceFileArchive: archive }));
  assert.match(archiveText, /Archive \/ Raw Source File Data/);
  assert.match(archiveText, /COMPACT_SUMMARY_SHOULD_STAY_ARCHIVED/);
  assert.match(archiveText, /RAW_MISSING_INFO_SHOULD_STAY_ARCHIVED/);

  const missingReportText = collectDefaultVisibleText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary,
    latestSourceFileArchive: { ...archive, sourceFileCaseReportV1: undefined },
  }));
  assert.match(missingReportText, /BNL has not generated a dossier-ready Case File Report/);
  assert.match(missingReportText, /Refresh this Source File after the bot report generator is deployed/);
  assert.doesNotMatch(missingReportText, /COMPACT_SUMMARY_SHOULD_STAY_ARCHIVED|RAW_MISSING_INFO_SHOULD_STAY_ARCHIVED|RAW_EVIDENCE_CATEGORY_FRAGMENT_SHOULD_STAY_ARCHIVED/);

  const briefText = collectDefaultVisibleText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary,
    latestSourceFileArchive: {
      ...archive,
      sourceFileCaseReportV1: undefined,
      sourceFileBriefV2: {
        oneLineSummary: "Interim one-line only.",
        adminSummary: "Interim admin summary only.",
        recommendedNextAction: "Interim next action only.",
      },
    },
  }));
  assert.match(briefText, /Interim BNL Brief/);
  assert.match(briefText, /Interim one-line only/);
  assert.match(briefText, /Interim admin summary only/);
  assert.match(briefText, /Interim next action only/);
  assert.doesNotMatch(briefText, /RAW_MISSING_INFO_SHOULD_NOT_RENDER_AS_REPORT|RAW_EVIDENCE_CATEGORY_FRAGMENT/);

  const componentSource = normalizedSource("src/components/DossierSourceFileSummaryPanel.tsx");
  assert.match(componentSource, /sourceFileCaseReportV1/);
  assert.doesNotMatch(componentSource, /Record Compactor|Duplicate Analysis|compactSummary[\s\S]{0,80}caseSummary/);

  const candidatePage = normalizedSource("src/app/admin/dossiers/candidates/[candidateId]/page.tsx");
  const workbenchStart = candidatePage.indexOf("Proposed Dossier status");
  const workbenchEnd = candidatePage.indexOf("Source Notes / Admin Addendums", workbenchStart);
  const workbench = candidatePage.slice(workbenchStart, workbenchEnd);
  assert.doesNotMatch(workbench, /reviewBlockers|missingInfo|RAW_MISSING_INFO/);
  assert.match(candidatePage, /SourceNotesSummary|sourceNotesSummary|noteCount/);
  assert.doesNotMatch(candidatePage, /publishCandidate|autoConfirm|mergeIdentity|Record Compactor|Duplicate Analysis/);
});


test("Entity Intelligence Review Console collapses duplicate safe bullets and keeps raw labels diagnostic-only", () => {
  const summary = {
    currentRead: "Crow has a useful internal case file.",
    knownContext: ["Local profile match found for Crow."],
    whyTracked: "Internal review.",
    usefulEvidence: ["Local profile match found for Crow."],
    patterns: ["No meaningful pattern has been extracted yet."],
    confirmedStrong: ["No confirmed public-safe facts have been separated yet."],
    claimedNeedsReview: ["Review-only relationship/context signal exists for this subject."],
    privateRelationshipContext: ["Review-only relationship/context signal exists for this subject."],
    publicSafePossibilities: ["May be described after owner review."],
    privateOnlyNotes: ["Internal note for admin review."],
    uncertainties: ["Treat possible connections as unconfirmed."],
    missingInfo: ["Missing owner-confirmed wording."],
    notPublicYet: ["Do not publish relationship context yet."],
    observedChannels: [],
    conversationHighlights: [],
    topicBreakdown: [],
    bestEvidenceToReview: [],
    bnlInteractionSignals: [],
    musicSignals: [],
    communitySignals: [],
    sourceCoverage: [],
    evidenceDetails: [],
    publicUseCandidates: [],
    reviewOnlyEvidence: [],
    sourceAuthority: ["Mixed BNL memory plus admin review; not owner-confirmed."],
    recommendedNextAction: "Ask owner to separate public-safe language.",
    substanceLevel: "useful",
    publicReadiness: "needs_review",
    existingPublicDossier: "no",
    nextAction: "owner_review",
    lastUpdatedAt: "2026-06-03T00:00:00.000Z",
    summarySource: "structured",
  };
  const entityReadoutValue = {
    currentRead: "BNL found an internal local profile match for Crow.",
    knownContext: ["BNL found an internal local profile match for Crow."],
    usefulEvidence: [
      "Local profile match found for Crow.",
      "user_profiles/local_profile_observed",
    ],
    relationshipSignals: [
      "BNL found prior relationship/context notes connected to Crow.",
      "relationship_journal/local_relationship_trace",
    ],
    publicSafePossibilities: ["May be described after owner review."],
    privateOnlyNotes: ["Private owner-review note."],
    notPublicYet: ["Do not publish relationship context yet."],
    observedChannels: ["Raw activity in EDGE_SESSION should be filtered"],
    conversationHighlights: [],
    topicBreakdown: [],
    bestEvidenceToReview: [],
    bnlInteractionSignals: [],
    musicSignals: [],
    communitySignals: [],
    sourceCoverage: [],
    evidenceDetails: [],
    publicUseCandidates: [],
    reviewOnlyEvidence: [],
    missingInfo: ["Missing owner-confirmed wording."],
    sourceAuthority: ["Admin review packet; not owner-confirmed.", "EDGE_SESSION"],
    recommendedAction: "Ask owner to separate public-safe language.",
    confidence: "high",
    readoutSource: "structured",
  };

  const element = sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary,
    entityReadout: entityReadoutValue,
  });
  const text = collectReactText(element);

  assert.match(text, /BNL Source File Display Layer/);
  assert.match(text, /BNL Case File Report/);
  assert.match(text, /has not generated a dossier-ready Case File Report/);
  assert.match(text, /Review-only/);
  assert.doesNotMatch(text, /BNL found an internal local profile match for Crow/);
  assert.doesNotMatch(text, /BNL found prior relationship\/context notes connected to Crow/);
  assert.doesNotMatch(
    text,
    /rawProvenance|user_profiles\/local_profile_observed|relationship_journal\/local_relationship_trace|conversations\/public_discord_observed|memory_tiers\/source_blind_memory_trace|source lane mapping|unknown -> unknown|help_signal|EDGE_SESSION/,
  );
});

test("Entity Intelligence Review Console promotes actionable Crow intelligence above diagnostics", () => {
  const summary = {
    currentRead: "Crow has fresh BNL source-file enrichment for admin review.",
    knownContext: ["Crow appears in repeated approved public-context exchanges involving BNL."],
    whyTracked: "Crow Source File enrichment needs admin review.",
    usefulEvidence: ["Recurring named topic: Orion appears across reviewed messages."],
    patterns: [],
    confirmedStrong: [],
    claimedNeedsReview: [],
    privateRelationshipContext: [],
    publicSafePossibilities: [],
    privateOnlyNotes: [],
    uncertainties: [],
    missingInfo: ["Display name is not owner-confirmed.", "Role is not owner-confirmed.", "Public links are missing."],
    notPublicYet: [],
    observedChannels: ["Crow appears repeatedly in approved public context, especially #barcode-bot and #collaboration-hub."],
    conversationHighlights: [],
    topicBreakdown: ["Automated topic label: music and track-sharing. Needs human review before this becomes a subject claim."],
    bestEvidenceToReview: [],
    bnlInteractionSignals: ["BNL interaction pattern: Crow asks BNL for source-file readouts and follows up."],
    musicSignals: ["Tool/platform mention: Suno appears in reviewed music-making context."],
    communitySignals: [],
    sourceCoverage: ["conversation: 12 source row(s) found"],
    evidenceDetails: ["Generic owner-review warnings are already summarized above."],
    representativeEvidence: [],
    activityFrequencySummary: ["Recurring approved public context"],
    topChannels: ["#barcode-bot", "#collaboration-hub"],
    topTopicDetails: ["Recurring named topic / Orion in reviewed source-file context."],
    recentActivitySummary: [],
    authoredVsMentionedSummary: [],
    publicUseCandidates: [],
    reviewOnlyEvidence: ["Orion appears in review-only/internal context. Do not use publicly without owner/admin review."],
    queueSubmissionStatus: "not_connected",
    queueSubmissionNote: "No confirmed queue/submission identity is linked to Crow.",
    sourceAuthority: [],
    recommendedNextAction: "Review Orion, Suno/tool, and BNL interaction pattern before public use.",
    substanceLevel: "useful",
    publicReadiness: "needs_review",
    existingPublicDossier: "no",
    nextAction: "owner_review",
    lastUpdatedAt: "2026-06-03T00:00:00.000Z",
    summarySource: "structured",
  };
  const attachedRecommendation = {
    subjectName: "Crow",
    usefulEvidence: ["Recurring named topic: Orion appears across reviewed messages."],
    musicSignals: ["Tool/platform mention: Suno appears in reviewed music-making context."],
    bnlInteractionSignals: ["BNL interaction pattern: Crow has repeated BNL conversation evidence."],
    queueSubmissionStatus: "not_connected",
  };
  const sourceFileNotes = [
    {
      text: [
        "Recurring named topic: Orion",
        "Tool/platform mention: Suno",
        "BNL interaction pattern: Crow appears in repeated exchanges involving BNL.",
        "Queue/submission history is not connected yet.",
        "source-file memory cannot confirm submitted songs.",
      ].join("\n"),
    },
  ];
  const readout = entityReadout.createDossierEntityActivityReadoutFromSourceFile({
    summary,
    recommendations: [],
    subjectName: "Crow",
  });
  const text = collectReactText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary,
    entityReadout: readout,
    subjectName: "Crow",
    recommendations: [attachedRecommendation],
    sourceFileNotes,
  }));
  const knowsStart = text.indexOf("BNL Case File Report");
  const diagnosticsStart = text.indexOf("Diagnostics");

  assert.match(text, /BNL Case File Report/);
  assert.match(text, /has not generated a dossier-ready Case File Report/);
  assert.doesNotMatch(text, /Orion appears in reviewed evidence connected to Crow/);
  assert.doesNotMatch(text, /Suno appears in reviewed evidence/);
  assert.doesNotMatch(text, /Admin Action Items \/ Missing Info/);
  assert.doesNotMatch(text, /Review-only Evidence/);
  assert.doesNotMatch(text, /Orion appears in review-only\/internal context/);
  assert.doesNotMatch(text, /Legacy recurring-subject diagnostic: Automated topic label/);
  assert.ok(knowsStart >= 0);
  assert.ok(diagnosticsStart === -1 || diagnosticsStart > knowsStart);
  assert.doesNotMatch(text, /What BNL Found|rawProvenance|Priority\/payment status confirmed|submitted song counts confirmed/);
});

test("Entity Intelligence Review Console displays #238 link categories and one queue bridge warning", () => {
  const summary = {
    currentRead: "Antigrain has cleaner entity-ledger output for admin review.",
    knownContext: ["Antigrain has video platform links in reviewed evidence."],
    whyTracked: "BNL Source File enrichment needs display review.",
    usefulEvidence: ["video platform links: YouTube and youtu.be evidence from https://youtu.be/example123", "event/contest links: Discord contest announcement", "music discussion: collaboration discussion without invented platform claims"],
    patterns: [], confirmedStrong: [], claimedNeedsReview: [], privateRelationshipContext: [],
    publicSafePossibilities: ["Public-safe candidate: video link evidence can be reviewed without private copy."],
    privateOnlyNotes: ["Review-only: owner/admin should validate public wording."],
    uncertainties: [], missingInfo: [], notPublicYet: [],
    observedChannels: ["community/server links: Discord event channel #barcode-bot"],
    conversationHighlights: ["song/track/demo/WIP mentions: demo discussion appears without submission proof"],
    topicBreakdown: ["Legacy recurring-subject candidate dump: do not show as main intelligence"],
    bestEvidenceToReview: [], bnlInteractionSignals: [],
    musicSignals: ["actual music platform links: SoundCloud evidence", "platform references: YouTube was mentioned as a platform", "derived duplicate link references suppressed: 3 duplicate youtu.be references suppressed"],
    communitySignals: ["generic links: project website link"], sourceCoverage: [], evidenceDetails: ["rawRefJson should stay hidden from normal display"], representativeEvidence: [], activityFrequencySummary: [], topChannels: [], topTopicDetails: [], recentActivitySummary: [], authoredVsMentionedSummary: [], publicUseCandidates: [],
    reviewOnlyEvidence: ["Review-only: do not present this as public copy."],
    queueSubmissionStatus: "not_connected", queueSubmissionNote: "No queue bridge exists for these links.", sourceAuthority: [], recommendedNextAction: "Review links before public use.", substanceLevel: "useful", publicReadiness: "needs_review", existingPublicDossier: "no", nextAction: "owner_review", lastUpdatedAt: "2026-06-03T00:00:00.000Z", summarySource: "structured",
  };

  const text = collectReactText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({ summary, subjectName: "Antigrain", currentLane: "active_source_file", latestRecommendationTimestamp: "2026-06-03T01:00:00.000Z" }));
  const normalReviewText = text.slice(0, text.indexOf("Diagnostics"));

  assert.match(text, /Source File header \/ refresh status/);
  assert.match(text, /BNL Case File Report/);
  assert.match(text, /has not generated a dossier-ready Case File Report/);
  assert.doesNotMatch(text, /Video platform links/);
  assert.doesNotMatch(text, /Event\/contest links/);
  assert.doesNotMatch(text, /Music discussion/);
  assert.doesNotMatch(text, /https:\/\/youtu\.be\/example123/);
  assert.doesNotMatch(normalReviewText, /Legacy recurring-subject candidate dump|rawRefJson|source table|row IDs?|\[object Object\]|source lane mapping/);
  assert.doesNotMatch(normalReviewText, /knownContext|usefulEvidence|rawProvenance|sourceCoverage|evidenceDetails|representativeEvidence/);
  assert.doesNotMatch(text, /Public-safe Evidence/);
  assert.doesNotMatch(text, /Review-only Evidence/);
});



test("Entity Intelligence Review Console separates Hellcat-style Discord event receipts from music links", () => {
  const summary = {
    currentRead: "HellcatNZ has event and community link evidence ready for admin review.",
    knownContext: ["HellcatNZ has event/contest links in reviewed evidence."],
    whyTracked: "BNL Source File enrichment needs receipt-level review.",
    usefulEvidence: [
      "event/contest links: Discord event link in #hellcat-nz on 2026-06-03: https://discord.com/events/123/456",
      "community/server links: Discord community context in #hellcat-nz",
    ],
    patterns: [], confirmedStrong: [], claimedNeedsReview: [], privateRelationshipContext: [],
    publicSafePossibilities: [], privateOnlyNotes: [], uncertainties: [], missingInfo: [], notPublicYet: [],
    observedChannels: ["#hellcat-nz"], conversationHighlights: [], topicBreakdown: [], bestEvidenceToReview: [], bnlInteractionSignals: [],
    musicSignals: ["music discussion: track discussion appears separately from the event link"],
    communitySignals: ["event/contest links: Discord event link in #hellcat-nz, Jun 3"],
    sourceCoverage: [], evidenceDetails: ["rawRefJson and source table names remain diagnostic-only"], representativeEvidence: [],
    activityFrequencySummary: [], topChannels: [], topTopicDetails: [], recentActivitySummary: [], authoredVsMentionedSummary: [], publicUseCandidates: [],
    reviewOnlyEvidence: [], queueSubmissionStatus: "not_connected", queueSubmissionNote: "No queue bridge exists for HellcatNZ.",
    sourceAuthority: [], recommendedNextAction: "Review event details before public use.", substanceLevel: "useful", publicReadiness: "needs_review", existingPublicDossier: "no", nextAction: "owner_review", lastUpdatedAt: "2026-06-03T00:00:00.000Z", summarySource: "structured",
  };

  const text = collectReactText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({ summary, subjectName: "HellcatNZ" }));
  const normalReviewText = text.slice(0, text.indexOf("Diagnostics"));

  assert.match(text, /BNL Case File Report/);
  assert.match(text, /has not generated a dossier-ready Case File Report/);
  assert.doesNotMatch(text, /Event\/contest link evidence:.*Discord event link.*#hellcat-nz/i);
  assert.doesNotMatch(text, /Actual music platform link evidence:.*Discord event/i);
  assert.doesNotMatch(text, /https:\/\/discord\.com\/events\/123\/456/);
  assert.doesNotMatch(normalReviewText, /rawRefJson|source table names|\[object Object\]|row IDs?|source lane mapping/);
});

test("actionable brief scans recommendations and source notes without fake Possible topics", () => {
  const summary = {
    currentRead: "Crow has source-file enrichment awaiting review.",
    knownContext: [],
    whyTracked: "Admin review.",
    usefulEvidence: [],
    patterns: [],
    confirmedStrong: [],
    claimedNeedsReview: [],
    privateRelationshipContext: [],
    publicSafePossibilities: [],
    privateOnlyNotes: [],
    uncertainties: [],
    missingInfo: [],
    notPublicYet: [],
    observedChannels: [],
    conversationHighlights: [],
    topicBreakdown: [],
    bestEvidenceToReview: [],
    bnlInteractionSignals: [],
    musicSignals: [],
    communitySignals: [],
    sourceCoverage: [],
    evidenceDetails: [],
    representativeEvidence: [],
    activityFrequencySummary: [],
    topChannels: [],
    topTopicDetails: [],
    recentActivitySummary: [],
    authoredVsMentionedSummary: [],
    publicUseCandidates: [],
    reviewOnlyEvidence: [],
    queueSubmissionStatus: "not_connected",
    queueSubmissionNote: "Queue/submission history is not connected yet.",
    sourceAuthority: [],
    recommendedNextAction: "Review enrichment before public use.",
    substanceLevel: "partial",
    publicReadiness: "needs_review",
    existingPublicDossier: "no",
    nextAction: "owner_review",
    lastUpdatedAt: "2026-06-03T00:00:00.000Z",
    summarySource: "structured",
  };
  const possibleLine = "Possible music/submission-related language appears in reviewed evidence, but queue/submission identity is not connected yet.";
  const brief = actionableBrief.buildSourceFileActionableBrief({
    summary,
    subjectName: "Crow",
    recommendations: [
      {
        subjectName: "Crow",
        usefulEvidence: ["Recurring named topic: Orion appears across reviewed messages."],
        musicSignals: ["Tool/platform mention: Suno appears in reviewed music-making context."],
        bnlInteractionSignals: ["BNL interaction pattern: repeated exchanges involving BNL."],
        evidenceDetails: [possibleLine],
        queueSubmissionStatus: "not_connected",
      },
    ],
    sourceFileNotes: [
      {
        text: [
          "Review-only recurring topic: Orion",
          "Tool/platform mention: Suno",
          "BNL interaction pattern: Crow has repeated BNL interaction evidence.",
          "source-file memory cannot confirm submitted songs.",
          "Reception and co-participant analysis is not available yet.",
          possibleLine,
        ].join("\n"),
      },
    ],
  });
  const allBriefText = JSON.stringify(brief);

  assert.match(allBriefText, /Orion appears in reviewed evidence connected to Crow/);
  assert.match(allBriefText, /Suno appears in reviewed evidence connected to Crow/);
  assert.match(allBriefText, /Crow has repeated BNL interaction evidence in approved review context/);
  assert.match(allBriefText, /Queue\/submission history is not connected yet/);
  assert.match(allBriefText, /source-file memory cannot confirm submitted songs|submitted song counts/);
  assert.match(allBriefText, /Reception and co-participant analysis is not available/);
  assert.doesNotMatch(allBriefText, /Possible appears in reviewed evidence/);
  assert.doesNotMatch(JSON.stringify(brief.namedTopics), /Possible/);
});

test("BNL Entity Readout prefers structured packet fields and filters raw provenance labels", () => {
  const recommendation = {
    subjectName: "Structured Packet Subject",
    knownContext: ["BNL currently reads this subject as a recurring radio-side collaborator."],
    usefulEvidence: ["Two reviewed source notes mention recurring set-support work."],
    relationshipSignals: ["Private relationship context suggests an operator-adjacent connection."],
    publicSafePossibilities: ["May be described as a collaborator after owner review."],
    privateOnlyNotes: ["Private-only note about the internal contact path."],
    notPublicYet: ["Do not publish the collaborator label until owner review."],
    missingInfo: ["Missing owner-confirmed public wording."],
    recommendedAction: "Ask an owner to separate public-safe collaborator language from internal relationship context.",
    confidence: "high",
    sourceAuthority: [
      "Mixed BNL memory plus admin review; not owner-confirmed.",
      "relationship_journal/local_relationship_trace",
    ],
    suggestedAction: "Attach after review.",
  };

  const readout = entityReadout.createDossierEntityActivityReadoutFromRecommendation(recommendation);
  assert.equal(readout.readoutSource, "structured");
  assert.deepEqual(readout.knownContext, recommendation.knownContext);
  assert.deepEqual(readout.usefulEvidence, recommendation.usefulEvidence);
  assert.deepEqual(readout.relationshipSignals, recommendation.relationshipSignals);
  assert.deepEqual(readout.publicSafePossibilities, recommendation.publicSafePossibilities);
  assert.deepEqual(readout.privateOnlyNotes, recommendation.privateOnlyNotes);
  assert.deepEqual(readout.notPublicYet, recommendation.notPublicYet);
  assert.deepEqual(readout.missingInfo, recommendation.missingInfo);
  assert.equal(readout.recommendedAction, recommendation.recommendedAction);
  assert.equal(readout.confidence, "high");
  assert.match(JSON.stringify(readout.sourceAuthority), /Mixed BNL memory/);
  assert.doesNotMatch(
    JSON.stringify(readout),
    /relationship_journal|local_relationship_trace|user_profiles\/local_profile_observed|conversations\/public_discord_observed|source lane mapping|unknown -> unknown|help_signal|EDGE_SESSION|raw-trace|backendTraceId/,
  );
});

test("BNL Entity Readout legacy fallback renders safe empty states without changing public previews", () => {
  const readout = entityReadout.createDossierEntityActivityReadoutFromSourceFile({
    summary: null,
    recommendations: [],
    subjectName: "Legacy Subject",
  });
  assert.equal(readout.readoutSource, "fallback");
  assert.match(readout.currentRead, /not attached a structured entity summary/);
  assert.deepEqual(readout.knownContext, []);
  assert.deepEqual(readout.usefulEvidence, []);
  assert.deepEqual(readout.privateOnlyNotes, []);

  const draftPage = source("src/app/admin/dossiers/drafts/[draftId]/page.tsx");
  assert.doesNotMatch(draftPage, /DossierEntityActivityReadoutPanel|createDossierEntityActivityReadout/);
  assert.doesNotMatch(draftPage, /privateOnlyNotes|rawProvenance|relationshipSignals/);

  const databaseSlugPage = source("src/app/database/[slug]/page.tsx");
  assert.match(databaseSlugPage, /databasePage\.entries/);
  assert.match(databaseSlugPage, /<DossierPageView dossier=\{databaseEntryToDossierPageViewModel\(entry\)\}/);
});

test("BNL structured source packet v2 is ingested, summarized, and kept review-only", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const candidatePayload = await (await authedPost({
    action: "createManualCandidate",
    input: {
      ...manualCandidateInput,
      name: "Structured Packet Subject",
      reason: "Existing source file for structured packet review.",
      evidenceSummary: "Reviewed starter context.",
    },
  })).json();
  await authedPost({
    action: "promoteCandidateToSourceFile",
    candidateId: candidatePayload.candidate.id,
  });

  const packet = {
    type: "modify_existing_dossier",
    subjectName: "Structured Packet Subject",
    targetCandidateId: candidatePayload.candidate.id,
    knownContext: ["BNL currently reads this subject as a recurring radio-side collaborator."],
    usefulEvidence: ["Two reviewed source notes mention recurring set-support work."],
    relationshipSignals: ["Private relationship context suggests an operator-adjacent connection."],
    publicSafePossibilities: ["May be described as a collaborator after owner review."],
    privateOnlyNotes: ["Private-only note about the internal contact path."],
    notPublicYet: ["Do not publish the collaborator label until owner review."],
    recommendedAction: "Ask an owner to separate public-safe collaborator language from internal relationship context.",
    confidence: "high",
    sourceAuthority: ["Mixed BNL memory plus admin review; not owner-confirmed."],
    observedChannels: ["Activity observed in owner-reviewable BARCODE Radio planning context."],
    conversationHighlights: ["Public activity note: subject explicitly shared a show-planning update in approved context."],
    topicBreakdown: ["Automated topic label: radio support and community coordination. Needs human review before this becomes a subject claim."],
    bestEvidenceToReview: ["Review item: owner should review the recurring set-support source note first."],
    bnlInteractionSignals: ["BNL interaction signal: recurring admin-side mention pattern."],
    musicSignals: ["Music/show signal: set-support work appears around radio planning."],
    communitySignals: ["Community signal: repeated collaborator mentions in review context."],
    sourceCoverage: [
      { source: "conversation", count: 14, status: "found" },
      {
        source: "channel_policy",
        counts: { public_home: 12, public_context: 4 },
        status: "found",
      },
      "Legacy source coverage text remains accepted.",
    ],
    evidenceDetails: ["Evidence detail stays internal until owner-approved wording exists."],
    representativeEvidence: [
      {
        activityType: "authored",
        topic: "BNL/source-file/dossier discussion",
        channel: "barcode-bot",
        summary: "BNL classified this approved-context evidence as source-file/dossier-related.",
        detail: "Automated topic classification; review before using as a subject claim.",
      },
    ],
    activityFrequencySummary: [
      { frequency: "Recurring approved public context", count: 5 },
    ],
    topChannels: [{ channel: "finished-tracks", count: 3 }],
    topTopicDetails: [
      { topic: "music/track-sharing", count: 4 },
      { topic: "BNL/source-file/dossier discussion", count: 1 },
    ],
    recentActivitySummary: [{ recency: "Recent approved public context", recentCount: 2 }],
    authoredVsMentionedSummary: [{ postedCount: 4, mentionedCount: 1 }],
    publicUseCandidates: ["Possible collaborator wording pending owner review."],
    reviewOnlyEvidence: ["Review-only evidence: internal relationship context needs owner review."],
    queueSubmissionStatus: "not_connected",
    queueSubmissionNote: "No confirmed queue/submission identity is linked to this source file.",
    rawProvenance: {
      backendTraceId: "raw-trace-structured-packet-v2",
      lanes: ["relationship_journal", "operator_notes"],
    },
    sourceLanes: ["active_source_file", "operator_notes"],
    sourceTypes: ["source_memory_packet_v2"],
    ingestKey: "bnl:structured-source-packet-v2",
    ingestSource: "bnl_source_file_enrichment",
  };

  const response = await bnlIngestPost(packet);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.autoAction, "attached_existing");
  assert.equal(payload.recommendation.reason, packet.knownContext[0]);
  assert.deepEqual(payload.recommendation.knownContext, packet.knownContext);
  assert.deepEqual(payload.recommendation.usefulEvidence, packet.usefulEvidence);
  assert.deepEqual(payload.recommendation.relationshipSignals, packet.relationshipSignals);
  assert.deepEqual(payload.recommendation.publicSafePossibilities, packet.publicSafePossibilities);
  assert.deepEqual(payload.recommendation.privateOnlyNotes, packet.privateOnlyNotes);
  assert.deepEqual(payload.recommendation.notPublicYet, packet.notPublicYet);
  assert.equal(payload.recommendation.recommendedAction, packet.recommendedAction);
  assert.deepEqual(payload.recommendation.sourceAuthority, packet.sourceAuthority);
  assert.deepEqual(payload.recommendation.observedChannels, packet.observedChannels);
  assert.deepEqual(payload.recommendation.conversationHighlights, packet.conversationHighlights);
  assert.deepEqual(payload.recommendation.bestEvidenceToReview, packet.bestEvidenceToReview);
  assert.deepEqual(payload.recommendation.bnlInteractionSignals, packet.bnlInteractionSignals);
  assert.deepEqual(payload.recommendation.musicSignals, packet.musicSignals);
  assert.deepEqual(payload.recommendation.communitySignals, packet.communitySignals);
  assert.match(JSON.stringify(payload.recommendation.sourceCoverage), /conversation: 14 source row\(s\) found/);
  assert.match(JSON.stringify(payload.recommendation.sourceCoverage), /channel policy: public home 12, public context 4 found/);
  assert.match(JSON.stringify(payload.recommendation.sourceCoverage), /Legacy source coverage text remains accepted/);
  assert.doesNotMatch(JSON.stringify(payload.recommendation.sourceCoverage), /\[object Object\]/);
  assert.deepEqual(payload.recommendation.publicUseCandidates, packet.publicUseCandidates);
  assert.deepEqual(payload.recommendation.reviewOnlyEvidence, packet.reviewOnlyEvidence);
  assert.match(JSON.stringify(payload.recommendation.representativeEvidence), /BNL classified this approved-context evidence as source-file\/dossier-related/);
  assert.doesNotMatch(JSON.stringify(payload.recommendation.representativeEvidence), /Crow discussed|Crow posted about|posted about source-file|posted.*BNL\/source-file/);
  assert.match(JSON.stringify(payload.recommendation.topChannels), /#finished tracks|#finished-tracks/);
  assert.match(JSON.stringify(payload.recommendation.topTopicDetails), /music\/track sharing|music track sharing/);
  assert.match(JSON.stringify(payload.recommendation.activityFrequencySummary), /Recurring approved public context/);
  assert.match(JSON.stringify(payload.recommendation.recentActivitySummary), /Recent approved public context/);
  assert.match(JSON.stringify(payload.recommendation.authoredVsMentionedSummary), /posted item|mention/);
  assert.equal(payload.recommendation.queueSubmissionStatus, "not_connected");
  assert.equal(payload.recommendation.queueSubmissionNote, packet.queueSubmissionNote);
  assert.deepEqual(payload.recommendation.rawProvenance, packet.rawProvenance);

  const state = await store.getDossierWorkflowState();
  const savedRecommendation = state.recommendations.find(
    (recommendation) => recommendation.ingestKey === packet.ingestKey,
  );
  assert.ok(savedRecommendation);
  assert.deepEqual(savedRecommendation.usefulEvidence, packet.usefulEvidence);
  assert.deepEqual(savedRecommendation.bestEvidenceToReview, packet.bestEvidenceToReview);
  assert.deepEqual(savedRecommendation.observedChannels, packet.observedChannels);
  assert.deepEqual(savedRecommendation.conversationHighlights, packet.conversationHighlights);
  assert.deepEqual(savedRecommendation.musicSignals, packet.musicSignals);
  assert.deepEqual(savedRecommendation.communitySignals, packet.communitySignals);
  assert.deepEqual(savedRecommendation.bnlInteractionSignals, packet.bnlInteractionSignals);
  assert.match(JSON.stringify(savedRecommendation.representativeEvidence), /BNL classified this approved-context evidence as source-file\/dossier-related/);
  assert.doesNotMatch(JSON.stringify(savedRecommendation.representativeEvidence), /Crow discussed|Crow posted about|posted about source-file|posted.*BNL\/source-file/);
  assert.match(JSON.stringify(savedRecommendation.topChannels), /finished/);
  assert.match(JSON.stringify(savedRecommendation.topTopicDetails), /music/);
  assert.match(JSON.stringify(savedRecommendation.activityFrequencySummary), /Recurring/);
  assert.match(JSON.stringify(savedRecommendation.recentActivitySummary), /Recent/);
  assert.match(JSON.stringify(savedRecommendation.authoredVsMentionedSummary), /posted item|mention/);
  assert.match(JSON.stringify(savedRecommendation.sourceCoverage), /channel policy: public home 12, public context 4 found/);
  assert.doesNotMatch(JSON.stringify(savedRecommendation.sourceCoverage), /\[object Object\]/);
  assert.equal(savedRecommendation.queueSubmissionStatus, "not_connected");
  assert.deepEqual(savedRecommendation.rawProvenance, packet.rawProvenance);
  const sourceFile = state.candidates.find(
    (candidate) => candidate.id === candidatePayload.candidate.id,
  );
  assert.ok(sourceFile);
  assert.equal(sourceFile.sourceFileNotes.length, 1);
  assert.match(sourceFile.sourceFileNotes[0].text, /Useful evidence: Two reviewed source notes/);
  assert.match(sourceFile.sourceFileNotes[0].text, /Relationship signal — private review/);
  assert.match(sourceFile.sourceFileNotes[0].text, /Best evidence to review: Review item: owner should review/);
  assert.match(sourceFile.sourceFileNotes[0].text, /Observed channel\/activity: Activity observed/);
  assert.match(sourceFile.sourceFileNotes[0].text, /Queue\/submission history is not connected yet/);
  assert.match(sourceFile.sourceFileNotes[0].text, /Source coverage: channel policy: public home 12, public context 4 found/);
  assert.doesNotMatch(sourceFile.sourceFileNotes[0].text, /\[object Object\]/);
  assert.doesNotMatch(sourceFile.sourceFileNotes[0].text, /raw-trace-structured-packet-v2/);

  const summary = sourceFileSummary.createDossierSourceFileSummary({
    candidate: sourceFile,
    recommendations: [savedRecommendation],
  });
  assert.match(JSON.stringify(summary.bestEvidenceToReview), /owner should review/i);
  assert.match(JSON.stringify(summary.observedChannels), /Activity observed/);
  assert.match(JSON.stringify(summary.conversationHighlights), /subject explicitly shared/);
  assert.match(JSON.stringify(summary.musicSignals), /Music\/show signal/);
  assert.match(JSON.stringify(summary.communitySignals), /Community signal/);
  assert.match(JSON.stringify(summary.bnlInteractionSignals), /BNL interaction signal/);
  assert.match(JSON.stringify(summary.sourceCoverage), /conversation: 14 source row\(s\) found/);
  assert.match(JSON.stringify(summary.sourceCoverage), /channel policy: public home 12, public context 4 found/);
  assert.match(JSON.stringify(summary.representativeEvidence), /BNL classified this approved-context evidence as source-file\/dossier-related/);
  assert.doesNotMatch(JSON.stringify(summary.representativeEvidence), /Crow discussed|Crow posted about|posted about source-file|posted.*BNL\/source-file/);
  assert.match(JSON.stringify(summary.topChannels), /finished/);
  assert.match(JSON.stringify(summary.topTopicDetails), /music/);
  assert.match(JSON.stringify(summary.topTopicDetails), /Automated topic label|BNL\/source-file\/dossier discussion/);
  assert.match(JSON.stringify(summary.activityFrequencySummary), /Recurring/);
  assert.match(JSON.stringify(summary.recentActivitySummary), /Recent/);
  assert.match(JSON.stringify(summary.authoredVsMentionedSummary), /posted item|mention/);
  assert.doesNotMatch(JSON.stringify(summary.sourceCoverage), /\[object Object\]/);
  assert.match(JSON.stringify(summary.publicUseCandidates), /pending owner review/);
  assert.match(JSON.stringify(summary.reviewOnlyEvidence), /Review-only evidence/);
  assert.equal(summary.queueSubmissionStatus, "not_connected");
  assert.match(summary.queueSubmissionNote, /No confirmed queue/);
  assert.match(JSON.stringify(summary.usefulEvidence), /Two reviewed source notes/);
  assert.match(JSON.stringify(summary.privateRelationshipContext), /Private relationship context/);
  assert.match(JSON.stringify(summary.claimedNeedsReview), /Private relationship context|collaborator after owner review/);
  assert.match(JSON.stringify(summary.publicSafePossibilities), /collaborator after owner review/);
  assert.match(JSON.stringify(summary.privateOnlyNotes), /internal contact path/);
  assert.match(JSON.stringify(summary.notPublicYet), /Do not publish the collaborator label|Private relationship context|internal contact path/);
  assert.match(JSON.stringify(summary.sourceAuthority), /Source confidence: high|Mixed BNL memory/);
  assert.doesNotMatch(JSON.stringify(summary), /raw-trace-structured-packet-v2/);

  const structuredReadout = entityReadout.createDossierEntityActivityReadoutFromSourceFile({
    summary,
    recommendations: [savedRecommendation],
    subjectName: sourceFile.name,
  });
  const panelText = collectReactText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary,
    entityReadout: structuredReadout,
  }));
  assert.match(panelText, /has not generated a dossier-ready Case File Report/);
  assert.doesNotMatch(panelText, /Main evidence categories/);
  assert.doesNotMatch(panelText, /subject explicitly shared a show-planning update/);
  assert.doesNotMatch(panelText, /Crow discussed source-file handling|Crow posted about source-file handling|Crow posted about BNL\/source-file|Crow authored BNL\/source-file|Crow talked about dossier/);

  const view = noteDisplay.createHumanReadableRecommendationView(savedRecommendation);
  assert.match(JSON.stringify(view.sections), /Two reviewed source notes/);
  assert.match(JSON.stringify(view.sections), /Key Intelligence/);
  assert.match(JSON.stringify(view.sections), /Observed Channels \/ Activity/);
  assert.match(JSON.stringify(view.sections), /Music \/ Show Signals/);
  assert.match(JSON.stringify(view.sections), /Community Signals/);
  assert.match(JSON.stringify(view.sections), /BNL Interaction Signals/);
  assert.match(JSON.stringify(view.sections), /Public-Use Candidates Pending Owner Review/);
  assert.match(JSON.stringify(view.sections), /Review-Only Cautions/);
  assert.match(JSON.stringify(view.sections), /Queue\/submission identity is not connected yet/);
  assert.match(JSON.stringify(view.sections), /channel policy: public home 12, public context 4 found/);
  assert.match(JSON.stringify(view.sections), /Representative Activity Details|Activity Frequency|Top Channels|Supporting Classification|Recent Activity|Posted \/ Mentioned Balance/);
  assert.match(JSON.stringify(view.sections), /Automated topic label|BNL classified/);
  assert.doesNotMatch(JSON.stringify(view.sections), /Crow discussed|Crow posted about|posted about source-file|posted.*BNL\/source-file/);
  assert.doesNotMatch(JSON.stringify(view.sections), /\[object Object\]/);
  assert.match(JSON.stringify(view.sections), /Private Relationship Context/);
  assert.match(JSON.stringify(view.rawMetadata), /raw-trace-structured-packet-v2/);
  assert.doesNotMatch(JSON.stringify(view.sections), /raw-trace-structured-packet-v2/);

  const draftPayload = await (await authedPost({
    action: "createDraftFromCandidate",
    candidateId: sourceFile.id,
  })).json();
  const draftText = JSON.stringify(draftPayload.draft.fields);
  assert.doesNotMatch(draftText, /raw-trace-structured-packet-v2/);
  assert.doesNotMatch(draftText, /Private-only note|internal contact path|relationship context|Owner should review|Conversation highlight|Review-only evidence|channel policy|\[object Object\]/);

  const publicPayload = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
  assert.doesNotMatch(JSON.stringify(publicPayload), /Structured Packet Subject|raw-trace-structured-packet-v2|internal contact path/);
  assert.equal(state.drafts.length, 0, "No draft existed before the explicit createDraftFromCandidate call.");
});


test("BNL Source File archive accepts large enrichment, keeps dashboard compact, and dedupes by digest", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const created = await (await authedPost({
    action: "createManualCandidate",
    input: {
      ...manualCandidateInput,
      name: "6-bit Archive Fixture",
      reason: "Active Source File exists before full BNL archive ingest.",
      evidenceSummary: "Compact admin starter evidence.",
    },
  })).json();
  await authedPost({ action: "promoteCandidateToSourceFile", candidateId: created.candidate.id });

  const largePrivateMarker = "PRIVATE_ARCHIVE_DETAIL_SHOULD_NOT_RENDER";
  const sourcePackage = {
    subject: "6-bit Archive Fixture",
    caseFile: Array.from({ length: 220 }, (_, index) => ({
      index,
      observation: `${largePrivateMarker}_${index} ${"full internal BNL intelligence ".repeat(80)}`,
      structuredEvidence: {
        channel: `internal-${index % 7}`,
        receipts: Array.from({ length: 5 }, (__, receipt) => `receipt-${index}-${receipt}`),
      },
    })),
  };

  const first = await (await bnlArchivePost({
    candidateId: created.candidate.id,
    subjectName: "6-bit Archive Fixture",
    ingestKey: "archive-fixture-6-bit-v1",
    compactSummary: "Compact archive readout: BNL has a large internal case file for review.",
    publicSafePossibilities: ["Possible public-safe label requires owner review."],
    missingInfo: ["Confirm public-safe language before drafting."],
    publicSafetyNotes: ["Do not publish archive-only evidence."],
    doNotSay: ["Do not expose private archive marker."],
    evidenceReceiptSummary: ["Large archive receipt summary is available internally."],
    sourcePackage,
  })).json();
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.attachStatus, "attached_active_source_file");
  assert.equal(first.archive.reviewOnly, true);
  assert.ok(first.archive.archiveSize > 100_000);
  assert.ok(first.archive.chunkCount > 1);
  assert.equal(first.archive.chunkKeys.length, first.archive.chunkCount);
  assert.ok(first.archive.chunkKeys.every((chunkKey, index) => chunkKey.endsWith(`:chunk:${index}`)));
  assert.equal(first.archive.sourcePackage, undefined);

  const state = await store.getDossierWorkflowState();
  const sourceFile = state.candidates.find((candidate) => candidate.id === created.candidate.id);
  assert.equal(sourceFile.latestSourceFileArchiveId, first.archive.id);
  assert.equal(sourceFile.latestSourceFileArchiveDigest, first.archive.sourceDigest);
  assert.deepEqual(sourceFile.sourceFileArchiveIds, [first.archive.id]);
  assert.match(sourceFile.latestSourceFileArchive.compactSummary, /Compact archive readout/);
  assert.doesNotMatch(JSON.stringify(state), new RegExp(largePrivateMarker));

  const storedArchive = await store.getDossierSourceFileArchive(first.archive.id);
  assert.deepEqual(storedArchive.sourcePackage, sourcePackage);
  assert.match(JSON.stringify(storedArchive.sourcePackage), new RegExp(largePrivateMarker));

  const dashboardPayload = await (await authedGet()).json();
  assert.match(JSON.stringify(dashboardPayload), /Compact archive readout/);
  assert.doesNotMatch(JSON.stringify(dashboardPayload), new RegExp(largePrivateMarker));
  assert.ok(JSON.stringify(dashboardPayload).length < JSON.stringify(sourcePackage).length / 2);

  const panelText = collectReactText(sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary: sourceFileSummary.createDossierSourceFileSummary({ candidate: sourceFile, recommendations: [] }),
    latestSourceFileArchive: sourceFile.latestSourceFileArchive,
  }));
  const archiveText = collectReactText(sourceSummaryPanelComponent.DossierSourceFileArchiveRawData({
    latestSourceFileArchive: sourceFile.latestSourceFileArchive,
  }));
  assert.match(panelText, /has not generated a dossier-ready Case File Report/);
  assert.match(archiveText, /Archive \/ Raw Source File Data/);
  assert.match(archiveText, /Compact archive readout/);
  assert.doesNotMatch(panelText, new RegExp(largePrivateMarker));

  const duplicate = await (await bnlArchivePost({
    candidateId: created.candidate.id,
    subjectName: "6-bit Archive Fixture",
    ingestKey: "archive-fixture-6-bit-v1-duplicate",
    compactSummary: "Compact archive readout duplicate.",
    sourcePackage,
  })).json();
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.archive.id, first.archive.id);
  assert.equal(duplicate.archive.sourcePackage, undefined);
  assert.equal(duplicate.attachStatus, "deduped_existing");

  const changedPackage = { ...sourcePackage, changed: "BNL archive changed digest and creates history." };
  const changed = await (await bnlArchivePost({
    candidateId: created.candidate.id,
    subjectName: "6-bit Archive Fixture",
    ingestKey: "archive-fixture-6-bit-v2",
    compactSummary: "Compact archive readout: changed archive history.",
    sourcePackage: changedPackage,
  })).json();
  assert.equal(changed.ok, true);
  assert.equal(changed.duplicate, false);
  assert.notEqual(changed.archive.id, first.archive.id);
  assert.notEqual(changed.archive.sourceDigest, first.archive.sourceDigest);

  const changedState = await store.getDossierWorkflowState();
  const changedSourceFile = changedState.candidates.find((candidate) => candidate.id === created.candidate.id);
  assert.deepEqual(changedSourceFile.sourceFileArchiveIds, [changed.archive.id, first.archive.id]);
  assert.equal(changedSourceFile.latestSourceFileArchiveId, changed.archive.id);
  assert.equal(changedState.drafts.length, 0);

  const publicPayload = await (await readModel.GET(new Request("https://example.test/api/bnl/read-model"))).json();
  assert.doesNotMatch(JSON.stringify(publicPayload), /6-bit Archive Fixture|PRIVATE_ARCHIVE_DETAIL_SHOULD_NOT_RENDER|Compact archive readout/);
});

test("BNL Source File archive ingest requires auth and safe existing target without creating candidates", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const unauthorized = await bnlArchivePost({
    subjectName: "Unauthorized Archive",
    sourcePackage: { secret: true },
  }, "wrong-token");
  assert.equal(unauthorized.status, 401);

  const missingTarget = await (await bnlArchivePost({
    subjectName: "No Existing Source File",
    sourcePackage: { large: "archive" },
  })).json();
  assert.equal(missingTarget.code, "archive_target_not_found");

  const state = await store.getDossierWorkflowState();
  assert.equal(state.candidates.length, 0);
  assert.equal(state.drafts.length, 0);
  assert.equal(state.recommendations.length, 0);
});

test("bounded BNL recommendation ingest still rejects oversized recommendation-card fields", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const response = await bnlIngestPost({
    type: "new_subject",
    subjectName: "Oversized Recommendation Field",
    reason: "This compact recommendation card should reject oversized text fields.",
    knownContext: ["x".repeat(1001)],
    ingestKey: "oversized-recommendation-card-field",
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "Text field is too long");

  const state = await store.getDossierWorkflowState();
  assert.equal(state.recommendations.length, 0);
});

test("Source File archive foundation does not add queue, payment, tags, identity merge, or public publishing hooks", () => {
  const archiveRoute = source("src/app/api/bnl/source-file-enrichments/route.ts");
  const storeSource = source("src/lib/dossier-workflow-store.ts");
  const workflowSource = source("src/lib/dossier-workflow.ts");

  assert.doesNotMatch(archiveRoute, /queue|payment|stripe|tag|draft|publish|identity|merge/i);
  assert.doesNotMatch(archiveRoute, /createDossierRecommendation|createDraftFromCandidate|mergeDossierCandidates/);
  assert.match(workflowSource, /latestSourceFileArchiveId/);
  assert.match(storeSource, /DOSSIER_SOURCE_FILE_ARCHIVE_KEY_PREFIX/);
});

test("Source File workspace layout keeps advanced diagnostics below the normal review flow", () => {
  const page = source("src/app/admin/dossiers/candidates/[candidateId]/page.tsx");
  const normalizedPage = page.replace(/\s+/g, " ");
  const workspaceStart = page.indexOf('<section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">');
  const reviewStart = page.indexOf("Review Boundaries", workspaceStart);
  const identityStart = page.indexOf('<Section title="Identity links / aliases">', workspaceStart);
  const readoutStart = page.indexOf("<DossierSourceFileSummaryPanel", workspaceStart);
  const workbenchStart = page.indexOf("Proposed Dossier status");
  const addInfoStart = page.indexOf("Add to BNL Source File");
  const notesStart = page.indexOf("Source Notes / Admin Addendums");
  const advancedStart = page.indexOf("Advanced Tools", notesStart);
  const diagnosticsStart = page.indexOf("Diagnostics — collapsed by default", advancedStart);
  const rawStart = page.indexOf("<DossierSourceFileArchiveRawData", diagnosticsStart);

  for (const [label, index] of Object.entries({
    reviewStart,
    identityStart,
    readoutStart,
    workbenchStart,
    addInfoStart,
    notesStart,
    rawStart,
    advancedStart,
    diagnosticsStart,
  })) {
    assert.ok(index >= 0, `Expected ${label} to be present`);
  }

  assert.ok(reviewStart < identityStart);
  assert.ok(identityStart < readoutStart);
  assert.ok(readoutStart < workbenchStart);
  assert.ok(workbenchStart < addInfoStart);
  assert.ok(addInfoStart < notesStart);
  assert.ok(notesStart < advancedStart);
  assert.ok(advancedStart < diagnosticsStart);
  assert.ok(diagnosticsStart < rawStart);
  assert.doesNotMatch(page.slice(0, readoutStart), /<summary[^>]*>\s*Advanced Tools|Diagnostics — collapsed by default|Advanced Tools: Add Identity Link Manually/);
  assert.equal((page.match(/Advanced Tools: Add Identity Link Manually/g) ?? []).length, 0);
  assert.equal((page.match(/Diagnostics — collapsed by default/g) ?? []).length, 1);
  assert.match(normalizedPage, /<details open=\{Boolean\(candidate\.existingDossierMatch\)\} className="border border-border bg-surface p-5 space-y-4" > <summary className="cursor-pointer text-xl font-bold text-foreground"> Dossier Update Actions/);
  assert.match(page, /No identity links pending/);
  assert.match(page, /SourceNotesSummary|sourceNotesSummary/);
});

test("Source File brief leads with Subject Read and renders Current Take once", () => {
  const summary = sourceFileReportTestSummary();
  const archive = {
    id: "layout-archive-report-v1",
    candidateId: "layout-candidate-report-v1",
    subjectName: "Layout Subject",
    subjectKey: "layout-subject",
    sourceDigest: "abcdefabcdef1234",
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    archiveSize: 100,
    chunkCount: 1,
    reviewOnly: true,
    sourceFileCaseReportV1: {
      version: "1",
      generatedAt: "2026-06-10T00:00:00.000Z",
      reportStatus: "dossier_ready",
      subjectIntelligenceBriefV1: {
        subjectRead: "Subject Read should lead this brief.",
        bnlTake: {
          confirmedFact: "Confirmed fact for layout test.",
          bnlInterpretation: "BNL Take should appear only as admin guidance.",
          uncertainty: "Still needs owner review.",
        },
        activitySnapshot: { totalEvidenceScanned: 3, activityLevel: "active" },
        topicBuckets: [],
        namedAnchors: [],
        musicAndLinkSignals: [],
        relationshipSignals: [],
        queueSubmissionRead: "No queue bridge is confirmed.",
        sourceFileGaps: [],
        recommendedAdminActions: [],
        doNotSayPubliclyYet: [],
      },
    },
  };

  const element = sourceSummaryPanelComponent.DossierSourceFileSummaryPanel({
    summary,
    subjectName: "Layout Subject",
    latestSourceFileArchive: archive,
  });
  const visibleText = collectDefaultVisibleText(element);
  assert.match(visibleText, /BNL Subject Intelligence Brief/);
  assert.ok(visibleText.indexOf("Subject Read") < visibleText.indexOf("Activity Snapshot"));
  assert.ok(visibleText.indexOf("Activity Snapshot") < visibleText.indexOf("Current Take / Admin Guidance"));
  assert.equal((visibleText.match(/Current Take \/ Admin Guidance/g) ?? []).length, 1);
  assert.equal((visibleText.match(/BNL Take/g) ?? []).length, 1);
  assert.doesNotMatch(visibleText, /Subject read[\s\S]{0,240}BNL take/i);

  const panelSource = source("src/components/DossierSourceFileSummaryPanel.tsx");
  assert.doesNotMatch(panelSource, /lg:grid-cols-2[\s\S]{0,260}BNL take/i);
});

test("BNL population context endpoint is authenticated, compact, and routing-safe", async () => {
  await resetWorkflowStore();
  process.env.BNL_API_KEY = "test-population-context-token";
  const now = new Date().toISOString();
  const older = new Date(Date.now() - 60_000).toISOString();
  const baseCandidate = (overrides) => ({
    id: overrides.id,
    name: overrides.name,
    candidateType: "artist",
    source: "manual",
    tier: "review_candidate",
    score: 50,
    whyNow: "Routing context only.",
    reason: "Population context fixture.",
    evidenceSummary: "Fixture evidence summary should not include raw messages.",
    status: "needs_review",
    createdAt: older,
    updatedAt: now,
    ...overrides,
  });
  const baseRecommendation = (overrides) => ({
    id: overrides.id,
    type: "modify_existing_dossier",
    subjectName: overrides.subjectName,
    status: "new",
    reason: "Recommendation routing fixture.",
    sourceLanes: ["website_dossier"],
    createdAt: older,
    updatedAt: now,
    ...overrides,
  });

  await store.saveDossierWorkflowState({
    version: 1,
    revision: 1,
    candidates: [
      baseCandidate({
        id: "active-source-file",
        name: "Active Subject",
        status: "active_source_file",
        sourceLanes: ["broadcast_memory"],
        latestSourceFileArchiveId: "archive-active-1",
        latestSourceFileArchiveUpdatedAt: now,
        sourceFileArchiveIds: ["archive-active-1"],
        sourceFileSummary: { summaryText: "private admin summary text", updatedAt: older },
        identityLinks: [
          {
            id: "private-alias",
            candidateId: "active-source-file",
            label: "Private Raw Alias Text",
            normalizedLabel: "private raw alias text",
            type: "alias",
            visibility: "internal_only",
            status: "confirmed",
            source: "admin_manual",
            confidence: "high",
            useForMatching: true,
            useInPublicDossier: false,
            note: "private note",
            createdAt: older,
            updatedAt: now,
          },
          {
            id: "public-alias",
            candidateId: "active-source-file",
            label: "Public Safe Alias",
            normalizedLabel: "public safe alias",
            type: "alias",
            visibility: "public_safe",
            status: "confirmed",
            source: "owner_confirmed",
            confidence: "confirmed",
            useForMatching: true,
            useInPublicDossier: true,
            createdAt: older,
            updatedAt: now,
          },
        ],
      }),
      baseCandidate({
        id: "candidate-intake",
        name: "Intake Subject",
        status: "candidate_intake",
        source: "bnl_dynamic_candidate_discovery",
        ingestSource: "bnl",
        createdFromRecommendationId: "rec-intake",
        connectedRecommendationIds: ["rec-intake"],
        sourceRecommendationIds: ["rec-intake"],
      }),
      baseCandidate({
        id: "dossier-update-workspace",
        name: "6 Bit",
        status: "existing_dossier_update",
        existingDossierMatch: { id: "EN-001", name: "6 Bit", confidence: "high" },
        sourceRecommendationIds: ["rec-update"],
        connectedRecommendationIds: ["rec-update", "rec-update-connected"],
        sourceFileNotes: [
          {
            id: "workspace-note",
            candidateId: "dossier-update-workspace",
            type: "fact",
            text: "private workspace note",
            source: "bnl_recommendation",
            status: "active",
            createdAt: older,
            updatedAt: now,
          },
        ],
        sourceFileSummary: { summaryText: "private update summary", updatedAt: now },
      }),
      baseCandidate({
        id: "merged-record",
        name: "Merged Subject",
        status: "merged",
        mergedIntoCandidateId: "active-source-file",
        mergeNote: "merged duplicate into active source file",
      }),
    ],
    drafts: [],
    recommendations: [
      baseRecommendation({
        id: "rec-intake",
        subjectName: "Intake Subject",
        status: "attached_to_candidate_intake",
        targetCandidateId: "candidate-intake",
        connectedCandidateId: "candidate-intake",
        ingestSource: "bnl",
      }),
      baseRecommendation({
        id: "rec-update",
        subjectName: "6 Bit",
        status: "attached_to_existing_dossier_update",
        targetDossierId: "EN-001",
        targetCandidateId: "dossier-update-workspace",
        connectedCandidateId: "dossier-update-workspace",
        connectedSourceFileCandidateId: "dossier-update-workspace",
      }),
      baseRecommendation({
        id: "rec-pending-candidate",
        type: "new_subject",
        subjectName: "Recommendation Backed Subject",
        subjectKey: "recommendation backed subject",
        status: "new",
        ingestSource: "bnl",
        recommendedKind: "community_member",
      }),
      baseRecommendation({
        id: "rec-mind-fanatic",
        type: "new_subject",
        subjectName: "Mind Fanatic [Barcode_Network]",
        subjectKey: "mind fanatic barcode network",
        status: "reviewing",
        ingestSource: "bnl",
        reason: "BNL-01_MEMBER_LOG / Orion candidate recommendation fixture.",
        recommendedKind: "community_member",
      }),
      baseRecommendation({
        id: "rec-diagnostic-artifact",
        type: "new_subject",
        subjectName: "Diagnostic Probe Candidate",
        status: "new",
        reason: "diagnostic test artifact should stay hidden",
        ingestSource: "system",
      }),
      baseRecommendation({
        id: "rec-terminal-candidate",
        type: "new_subject",
        subjectName: "Terminal Candidate",
        status: "dismissed",
        reason: "Resolved terminal recommendation should stay hidden",
      }),
    ],
    sourceFileRefreshRequests: [
      {
        id: "refresh-update",
        candidateId: "dossier-update-workspace",
        subjectName: "6 Bit",
        normalizedSubjectKey: "6 bit",
        status: "pending",
        reason: "Refresh workspace fixture.",
        requestedAt: older,
        updatedAt: now,
        requestSource: "existing_dossier_update_review",
        priority: 75,
      },
    ],
    updatedAt: now,
  });

  const unauthorized = await populationContextGet();
  assert.equal(unauthorized.status, 401);

  const response = await populationContextGet("test-population-context-token");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();

  assert.equal(payload.ok, true);
  assert.equal(payload.version, "population_context_v1");
  assert.ok(Array.isArray(payload.publicDossiers));
  assert.ok(Array.isArray(payload.sourceFiles));
  assert.ok(Array.isArray(payload.candidates));
  assert.ok(Array.isArray(payload.dossierUpdateWorkspaces));
  assert.ok(Array.isArray(payload.identityLinks));
  assert.ok(Array.isArray(payload.resolvedRecords));
  assert.equal(payload.diagnostics.publicDossierCount, payload.publicDossiers.length);
  assert.equal(payload.diagnostics.sourceFileCount, payload.sourceFiles.length);
  assert.equal(payload.diagnostics.candidateDestinationCount, payload.candidates.length);
  assert.equal(payload.diagnostics.candidateCount, 1);
  assert.equal(payload.diagnostics.pendingRecommendationCandidateCount, 2);
  assert.equal(payload.candidates.filter((item) => item.isRecommendationBacked).length, 2);
  assert.equal(payload.diagnostics.dossierUpdateWorkspaceCount, payload.dossierUpdateWorkspaces.length);
  assert.equal(payload.diagnostics.identityLinkCount, payload.identityLinks.length);
  assert.equal(payload.diagnostics.resolvedRecordCount, payload.resolvedRecords.length);

  const sourceFile = payload.sourceFiles.find((item) => item.candidateId === "active-source-file");
  assert.equal(sourceFile.subjectName, "Active Subject");
  assert.equal(sourceFile.normalizedSubjectKey, "active subject");
  assert.equal(sourceFile.status, "active_source_file");
  assert.equal(sourceFile.route.path, "/admin/dossiers/candidates/active-source-file");
  assert.equal(sourceFile.hasAdminSummary, true);
  assert.equal(sourceFile.adminSummaryStale, true);

  const intake = payload.candidates.find((item) => item.candidateId === "candidate-intake");
  assert.equal(intake.source, "bnl_dynamic_candidate_discovery");
  assert.equal(intake.ingestSource, "bnl");

  const workspace = payload.dossierUpdateWorkspaces.find((item) => item.candidateId === "dossier-update-workspace");
  assert.equal(workspace.publicDossierId, "EN-001");
  assert.equal(workspace.publicDossierName, "6 Bit");
  assert.deepEqual(workspace.sourceRecommendationIds, ["rec-update"]);
  assert.deepEqual(workspace.connectedRecommendationIds, ["rec-update", "rec-update-connected"]);
  assert.equal(workspace.sourceFileNotesCount, 1);
  assert.equal(workspace.hasUpdateSummary, true);
  assert.equal(workspace.bnlRefreshStatus.status, "pending");

  const privateLink = payload.identityLinks.find((item) => item.publicSafe === false);
  assert.equal(privateLink.useForMatching, true);
  assert.match(privateLink.normalizedLabel, /^internal_identity_key:/);
  const publicLink = payload.identityLinks.find((item) => item.publicSafe === true);
  assert.equal(publicLink.normalizedLabel, "public safe alias");

  const mergedRecord = payload.resolvedRecords.find((item) => item.recordId === "merged-record");
  assert.equal(mergedRecord.destinationCandidateId, "active-source-file");
  assert.equal(mergedRecord.destinationSubjectName, "Active Subject");
  assert.equal(mergedRecord.destinationLane, "source_file");

  const pendingRecommendation = payload.resolvedRecords.find((item) => item.recordId === "rec-pending-candidate");
  assert.equal(pendingRecommendation.resolvedReason, "pending_candidate_recommendation");
  assert.equal(pendingRecommendation.destinationLane, "candidate_recommendation");
  assert.equal(pendingRecommendation.destinationSubjectName, "Recommendation Backed Subject");
  assert.equal(pendingRecommendation.normalizedSubjectKey, "recommendation backed subject");
  assert.equal(pendingRecommendation.recommendationId, "rec-pending-candidate");
  assert.equal(pendingRecommendation.route, "/admin/dossiers/recommendations/rec-pending-candidate");

  const mindFanaticRecord = payload.resolvedRecords.find((item) => item.recordId === "rec-mind-fanatic");
  assert.equal(mindFanaticRecord.resolvedReason, "pending_candidate_recommendation");
  assert.equal(mindFanaticRecord.normalizedSubjectKey, "mind fanatic barcode network");
  assert.equal(mindFanaticRecord.destinationLane, "candidate_recommendation");

  assert.equal(payload.resolvedRecords.some((item) => item.recordId === "rec-diagnostic-artifact"), false);
  assert.equal(payload.resolvedRecords.some((item) => item.recordId === "rec-terminal-candidate" && item.resolvedReason === "pending_candidate_recommendation"), false);

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /relationship_journal|raw Discord message|raw discord message/i);
  assert.doesNotMatch(serialized, /protected_system|private_admin|internal_controlled/i);
  assert.doesNotMatch(serialized, /token|secret/i);
  assert.doesNotMatch(serialized, /Private Raw Alias Text|private raw alias text|private admin summary text|private update summary|private workspace note|private note/);
  assert.doesNotMatch(serialized, /summaryText|evidenceItems|rawProvenance|sourcePackage|relationshipSignals|conversationHighlights/i);

  const routeSource = source("src/app/api/bnl/population-context/route.ts");
  assert.doesNotMatch(routeSource, /export async function POST|export async function PUT|export async function PATCH|export async function DELETE/);
  assert.doesNotMatch(routeSource, /databasePage\.entries\s*=|summary:\s*|notes:\s*|role:\s*/);
  assert.match(source("src/app/api/bnl/read-model/route.ts"), /export async function GET/);
  assert.match(source("src/app/admin/dossiers/page.tsx"), /Dossier Control Center/);
  assert.match(source("src/app/admin/dossiers/page.tsx"), /Candidates & Recommendation Intake/);
  assert.match(source("src/app/admin/dossiers/candidates/[candidateId]/page.tsx"), /Source File/);
  assert.match(source("src/lib/dossier-workflow-store.ts"), /Subject Consolidation/);

  delete process.env.BNL_API_KEY;
});

test("Dossier Control Center keeps healthy diagnostics compact and preserves default workflow sections", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");

  assert.match(page, /open=\{!populationMethodHealthy\}/, "Population Method Audit stays collapsed when healthy");
  assert.match(page, /populationMethodAudit\.warnings\.length === 0 &&[\s\S]*populationMethodNeedsReviewCount === 0/, "healthy audit requires no warnings or review records");
  assert.match(page, /Population Method Audit: needs review/, "Population Method Audit surfaces when warnings exist");
  assert.match(page, /showIncomingBnlSignals = unresolvedPopulationSignals\.length > 0/, "Incoming BNL Signals hides when every signal is filed");
  assert.match(page, /showIncomingBnlSignals \? \([\s\S]*Incoming BNL Signals/, "Incoming BNL Signals appears for unresolved signals");
  assert.match(page, /unresolvedPopulationSignals\.map/, "Incoming BNL Signals renders exception cards only from unresolved signals");
  assert.doesNotMatch(page, /No unresolved BNL Signals|No BNL signals|empty BNL/i, "Incoming BNL Signals does not render an empty card wall");
  assert.match(page, /data-compact-diagnostic-status/, "Summary includes compact diagnostic status copy");
  assert.match(page, /bnlSignalStatusText/, "Summary has compact BNL signal status");
  assert.match(page, /populationMethodStatusText/, "Summary has compact Population Method Audit status");
  assert.match(page, /Diagnostics & Maintenance/, "Diagnostics and maintenance material lives in one bottom drawer");
  assert.ok(page.indexOf("Diagnostics & Maintenance") > page.indexOf('eyebrow="Source Files"'), "Diagnostics & Maintenance renders after default work sections");
  assert.doesNotMatch(page.slice(0, page.indexOf("Diagnostics & Maintenance")), /Population Method Audit \/ Intake Map|BNL Signal Diagnostics|Diagnostics\/Test Artifacts — collapsed by default/, "normal dashboard flow does not expose full diagnostic sections");

  for (const label of [
    "Candidates & Recommendation Intake",
    "Source Files",
    "Dossier Updates",
    "Proposed Dossiers",
    "Owner Review",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  assert.match(page, /optionalText\(sourceFileSummary\?\.summaryText\)[\s\S]*optionalText\(dynamicRecord\.adminSummary\)[\s\S]*optionalText\(dynamicRecord\.whyNow\)[\s\S]*optionalText\(dynamicRecord\.reason\)[\s\S]*optionalText\(dynamicRecord\.evidenceSummary\)[\s\S]*optionalText\(dynamicRecord\.recommendedNextStep\)/, "Why it matters priority order is explicit");
  assert.match(page, /return selected \? compactUsefulSummary\(selected\) : "Needs more evidence"/, "Why it matters fallback stays concise");
  assert.match(page, /rawEvidenceRefs\?|evidenceRefs\?|sourcePackage|relationship\[_-\]journal|private_admin|internal_controlled/, "Why it matters rejects raw JSON/evidence refs");
  assert.match(page, /publishes\? 0 public pages|changes\? 0 public dossier text|exposes\? 0 internal aliases|raw\/private evidence/, "Why it matters rejects safety boilerplate");
  assert.match(page, /review source context and decide whether to attach or convert into a bnl source file/i, "Why it matters rejects generic workflow filler");
  assert.match(page, /genericWhyItMattersPatterns/, "Why it matters rejects generic admin review phrases");
  assert.doesNotMatch(pageCopy, /Review source context and decide whether to attach or convert into a BNL Source File\./, "generic workflow filler is not rendered as row copy");
  assert.match(page, /BNL Signal Diagnostics — filed\/non-dossier details collapsed/, "Filed/already-represented BNL signals stay in collapsed diagnostics");
  assert.match(page, /Diagnostics\/Test Artifacts — collapsed by default/, "Diagnostics/Test Artifacts remain accessible but collapsed");
  assert.match(page, /nonDossierPopulationSignals\.length > 0/, "Non-dossier signals remain accessible only when present");

  assert.doesNotMatch(source("src/app/database/[slug]/page.tsx"), /Incoming BNL Signals|Population Method Audit|rawEvidenceRefs|internal aliases/i);
  assert.doesNotMatch(source("src/app/database/page.tsx"), /Incoming BNL Signals|Population Method Audit|rawEvidenceRefs|internal aliases/i);
  assert.match(source("src/app/api/admin/dossiers/route.ts"), /reconcile_population_signals/);
  assert.match(source("src/app/api/bnl/population-context/route.ts"), /export async function GET/);
  assert.match(source("src/app/api/bnl/dossier-recommendations/route.ts"), /BNL_DOSSIER_INGEST_TOKEN|authorization/i);
  assert.match(source("src/lib/dossier-workflow-store.ts"), /Subject Consolidation|createDossierPopulationMethodAudit|candidate_intake|active_source_file/);
});

test("Incoming BNL Signals renders filing summary, unresolved exceptions, and safe admin actions", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");

  for (const label of [
    "Incoming BNL Signals",
    "BNL Signal Filing",
    "Unresolved BNL Signals",
    "Source of recommendation: Incoming BNL Signals",
    "Signals reviewed",
    "Filed automatically",
    "New candidates created",
    "Attached to existing records",
    "Already represented",
    "Unresolved",
    "Public pages published",
    "Public dossier text changed",
    "Internal aliases exposed",
    "Filed / Already Represented",
    "Non-dossier Signals",
    "Dismiss",
    "No action needed. Filed automatically.",
    "raw/private evidence is not shown",
    "publishes 0 public pages, changes 0 public dossier text, exposes 0 internal aliases",
  ]) {
    assertIncludesCopy(pageCopy, label);
  }

  assert.doesNotMatch(pageCopy, /BNL Signal Reconcile|Reconcile BNL Signals|Population Reconcile|reconcile queue/i);
  assert.match(source("src/app/api/admin/dossiers/route.ts"), /reconcile_population_signals/);

  for (const action of [
    "attach_to_existing_source_file",
    "attach_to_existing_dossier_update",
    "create_dossier_update_workspace",
    "create_source_file_candidate",
    "mark_no_new_info",
    "mark_not_population_subject",
    "dismiss_population_recommendation",
    "reopen_population_recommendation",
  ]) {
    assert.match(page, new RegExp(action));
    assert.match(source("src/app/api/admin/dossiers/route.ts"), new RegExp(action));
    assert.match(source("src/lib/dossier-workflow-store.ts"), new RegExp(action));
  }

  assert.doesNotMatch(source("src/app/database/[slug]/page.tsx"), /Population Review Queue|BNL Population Scan|rawEvidenceRefs|Internal refs/);
  assertIncludesCopy(pageCopy, "Review");
  assertIncludesCopy(pageCopy, "data-primary-population-actions={primaryActions.length}");
  assert.match(page, /primaryActions\.slice\(0, 2\)\.map/);
  assert.doesNotMatch(pageCopy, /Advanced actions/);
  assert.doesNotMatch(page, /mark_needs_more_info[^\n]+Review|Review[^\n]+mark_needs_more_info/);
  assert.doesNotMatch(pageCopy, /raw Discord message|relationship_journal|private relationship journal|internal alias label/i);
});

test("BNL population ingest normalizes population source lanes into allowed site lanes", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const laneCases = [
    ["relationship_state", ["admin_manual"]],
    ["relationship_journal", ["admin_manual"]],
    ["user_memory_facts", ["admin_manual"]],
    ["entity_evidence_events", ["admin_manual"]],
    ["community_presence", ["public_discord"]],
    ["conversations", ["public_discord"]],
    ["memory_tiers", ["admin_manual"]],
    ["broadcast_memory_note", ["broadcast_memory"]],
    ["show_state_note", ["broadcast_memory"]],
    ["unmapped_safe_population_lane", ["unknown"]],
  ];

  for (const [lane, expectedSourceLanes] of laneCases) {
    const response = await bnlIngestPost({
      type: "population_recommendation",
      ingestSource: "bnl_population_recommender",
      subjectName: `Population ${lane}`,
      adminSummary: `Safe population summary for ${lane}.`,
      recommendedLane: "needs_population_review",
      recommendedAction: "admin_review_required",
      inputHash: `population-lane-${lane}`,
      sourceLanes: [lane],
    });
    assert.equal(response.status, 200, `${lane} should ingest`);
    const payload = await response.json();
    assert.deepEqual(payload.recommendation.sourceLanes, expectedSourceLanes);
    assert.deepEqual(
      payload.recommendation.normalizedSourceLaneDetails,
      [`${lane} -> ${expectedSourceLanes[0]}`],
    );
    assert.equal(payload.recommendation.populationRecommendation, true);
  }

  const state = await store.getDossierWorkflowState();
  assert.equal(state.recommendations.length, laneCases.length);
  assert.ok(
    state.recommendations.every(
      (recommendation) => recommendation.type === "population_recommendation",
    ),
    "Population Review Queue receives every ingested population recommendation",
  );
  assert.deepEqual(
    state.recommendations.find(
      (recommendation) => recommendation.subjectName === "Population relationship_state",
    )?.normalizedSourceLaneDetails,
    ["relationship_state -> admin_manual"],
  );
});

test("BNL population ingest accepts population recommended lanes", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  for (const recommendedLane of [
    "needs_population_review",
    "active_source_file",
    "candidate_intake",
    "existing_dossier_update",
    "public_dossier_update_signal",
  ]) {
    const response = await bnlIngestPost({
      type: "population_recommendation",
      ingestSource: "bnl_population_recommender",
      subjectName: `Population recommended ${recommendedLane}`,
      adminSummary: `Safe population summary for ${recommendedLane}.`,
      recommendedLane,
      recommendedAction: "admin_review_required",
      inputHash: `population-recommended-lane-${recommendedLane}`,
      sourceLanes: [recommendedLane],
    });
    assert.equal(response.status, 200, `${recommendedLane} should ingest`);
    const payload = await response.json();
    assert.equal(payload.recommendation.recommendedLane, recommendedLane);
  }

  const state = await store.getDossierWorkflowState();
  assert.equal(state.recommendations.length, 5);
});

test("BNL population source lane validation fails only malformed lane payloads", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const nonString = await bnlIngestPost({
    type: "population_recommendation",
    ingestSource: "bnl_population_recommender",
    subjectName: "Population Non String Lane",
    adminSummary: "Safe population summary.",
    sourceLanes: ["relationship_state", 42],
  });
  assert.equal(nonString.status, 400);
  assert.equal(
    (await nonString.json()).error,
    "Invalid source lane: sourceLanes entries must be strings",
  );

  const nonArray = await bnlIngestPost({
    type: "population_recommendation",
    ingestSource: "bnl_population_recommender",
    subjectName: "Population Non Array Lane",
    adminSummary: "Safe population summary.",
    sourceLanes: "relationship_state",
  });
  assert.equal(nonArray.status, 400);
  assert.equal(
    (await nonArray.json()).error,
    "Invalid source lane: sourceLanes must be a list",
  );
});

test("BNL non-population recommendations still enforce allowed source lanes", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const invalid = await bnlIngestPost({
    type: "new_subject",
    subjectName: "Strict Lane Subject",
    reason: "Normal recommendations must keep strict source lanes.",
    sourceLanes: ["relationship_state"],
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "Invalid source lane");

  const valid = await bnlIngestPost({
    type: "new_subject",
    subjectName: "Strict Lane Subject",
    reason: "Normal recommendations may use allowed source lanes.",
    sourceLanes: ["rd_context"],
  });
  assert.equal(valid.status, 200);
});

test("Population recommendation ingest dedupes by input hash and preserves raw refs internally", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const first = await bnlIngestPost({
    type: "population_recommendation",
    createdBy: "bnl_population_recommender",
    subjectName: "Population Queue Subject",
    adminSummary: "BNL sees one safe routing signal.",
    recommendedLane: "candidate_intake",
    recommendedAction: "create_source_file_candidate",
    confidence: "high",
    inputHash: "population-hash-1",
    rawEvidenceRefs: ["discord:private-message-1"],
    sourceLanes: ["broadcast_memory"],
  });
  assert.equal(first.status, 200);
  const second = await bnlIngestPost({
    type: "population_recommendation",
    createdBy: "bnl_population_recommender",
    subjectName: "Population Queue Subject",
    adminSummary: "BNL sees one safe routing signal, refreshed.",
    recommendedLane: "candidate_intake",
    recommendedAction: "create_source_file_candidate",
    confidence: "high",
    inputHash: "population-hash-1",
    rawEvidenceRefs: ["discord:private-message-2"],
    sourceLanes: ["broadcast_memory"],
  });
  assert.equal(second.status, 200);
  const duplicatePayload = await second.json();
  assert.equal(duplicatePayload.duplicate, true);

  const state = await store.getDossierWorkflowState();
  const populationRecommendations = state.recommendations.filter((item) => item.type === "population_recommendation");
  assert.equal(populationRecommendations.length, 1);
  assert.equal(populationRecommendations[0].rawEvidenceRefs.length, 2);
  assert.equal(populationRecommendations[0].seenCount, 2);
});

test("Population recommendation ingest marks matching active recommendations already represented", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  const now = new Date().toISOString();

  await store.saveDossierWorkflowState({
    version: 1,
    revision: 1,
    candidates: [],
    drafts: [],
    recommendations: [
      {
        id: "rec-active-mind-fanatic",
        type: "new_subject",
        subjectName: "Mind Fanatic [Barcode_Network]",
        subjectKey: "mind fanatic barcode network",
        status: "new",
        reason: "BNL-01_MEMBER_LOG / Orion candidate recommendation fixture.",
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
        createdBy: "bnl",
        ingestSource: "bnl",
      },
    ],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const response = await bnlIngestPost({
    type: "population_recommendation",
    createdBy: "bnl_population_recommender",
    subjectName: "Mind Fanatic [Barcode_Network]",
    subjectKey: "mind fanatic barcode network",
    adminSummary: "BNL sees a safe routing signal already queued elsewhere.",
    recommendedLane: "needs_population_review",
    recommendedAction: "admin_review_required",
    confidence: "high",
    inputHash: "population-mind-fanatic-duplicate",
    rawEvidenceRefs: ["discord:private-relationship-row"],
    sourceLanes: ["broadcast_memory"],
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.duplicate, true);
  assert.equal(payload.recommendation.recommendedLane, "already_represented");
  assert.equal(payload.recommendation.recommendedAction, "mark_duplicate_no_new_info");
  assert.deepEqual(payload.recommendation.connectedRecommendationIds, ["rec-active-mind-fanatic"]);

  const state = await store.getDossierWorkflowState();
  const populationRecommendations = state.recommendations.filter((item) => item.populationRecommendation);
  assert.equal(populationRecommendations.length, 1);
  assert.equal(populationRecommendations[0].rawEvidenceRefs.length, 1);
  assert.equal(populationRecommendations[0].recommendedLane, "already_represented");
  assert.equal(populationRecommendations[0].recommendedAction, "mark_duplicate_no_new_info");
  assert.equal(
    state.recommendations.filter(
      (item) =>
        item.populationRecommendation &&
        item.recommendedLane === "needs_population_review" &&
        item.recommendedAction === "admin_review_required",
    ).length,
    0,
  );
});


test("Mind Fanatic-style recommendation-backed candidate is a population destination, not a repeated admin-review card", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";
  const now = new Date().toISOString();

  await store.saveDossierWorkflowState({
    version: 1,
    revision: 1,
    candidates: [
      {
        id: "candidate-mind-fanatic-intake",
        name: "Mind Fanatic [Barcode_Network]",
        candidateType: "community_member",
        source: "bnl_dynamic_candidate_discovery",
        tier: "review_candidate",
        score: 66,
        whyNow: "Already visible in Candidates & Recommendation Intake.",
        reason: "Recommendation-backed intake row exists.",
        status: "candidate_intake",
        createdFromRecommendationId: "rec-mind-fanatic-intake",
        connectedRecommendationIds: ["rec-mind-fanatic-intake"],
        sourceRecommendationIds: ["rec-mind-fanatic-intake"],
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
        sourceFileNotes: [],
      },
    ],
    drafts: [],
    recommendations: [],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const response = await bnlIngestPost({
    type: "population_recommendation",
    createdBy: "bnl_population_recommender",
    ingestSource: "bnl_population_recommender",
    subjectName: "Mind Fanatic [Barcode_Network]",
    subjectKey: "mind fanatic barcode network",
    adminSummary: "BNL found new evidence for a subject already waiting in Recommendation Intake.",
    recommendedLane: "needs_population_review",
    recommendedAction: "admin_review_required",
    confidence: "high",
    inputHash: "population-mind-fanatic-candidate-fixture",
    rawEvidenceRefs: ["discord:private-evidence-hidden"],
    sourceLanes: ["broadcast_memory"],
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.duplicate, true);
  assert.equal(payload.recommendation.recommendedLane, "already_represented");
  assert.equal(payload.recommendation.recommendedAction, "mark_duplicate_no_new_info");
  assert.equal(payload.recommendation.targetCandidateId, "candidate-mind-fanatic-intake");

  const state = await store.getDossierWorkflowState();
  assert.equal(
    state.recommendations.filter(
      (item) =>
        item.populationRecommendation &&
        item.subjectName === "Mind Fanatic [Barcode_Network]" &&
        item.recommendedLane === "needs_population_review" &&
        item.recommendedAction === "admin_review_required",
    ).length,
    0,
  );
  assert.equal(
    state.recommendations.filter(
      (item) =>
        item.populationRecommendation &&
        item.subjectName === "Mind Fanatic [Barcode_Network]",
    ).length,
    1,
  );
});

test("Population Review Queue actions update internal workflow records without publishing", async () => {
  await resetWorkflowStore();
  process.env.BNL_API_KEY = "test-population-context-token";
  const now = new Date().toISOString();
  await store.saveDossierWorkflowState({
    version: 1,
    revision: 1,
    candidates: [
      {
        id: "existing-source-file-pop",
        name: "Existing Population Source",
        candidateType: "artist",
        source: "manual",
        tier: "review_candidate",
        score: 70,
        whyNow: "Existing source file.",
        reason: "Existing source file.",
        status: "active_source_file",
        createdAt: now,
        updatedAt: now,
        sourceFileNotes: [],
      },
    ],
    drafts: [],
    recommendations: [
      {
        id: "pop-rec-attach",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "Existing Population Source",
        status: "new",
        reason: "Attach safe summary only.",
        adminSummary: "Attach this to the existing Source File.",
        recommendedLane: "active_source_file",
        recommendedAction: "attach_to_existing_source_file",
        matchedExistingCandidateId: "existing-source-file-pop",
        confidence: "high",
        sourceLanes: ["broadcast_memory"],
        rawEvidenceRefs: ["relationship_journal:private-row"],
        rawEvidenceRefCount: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pop-rec-nonsubject",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "Show State Note",
        status: "new",
        reason: "Broadcast memory note only.",
        recommendedLane: "broadcast_memory_note",
        recommendedAction: "broadcast_memory_note",
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const attachResponse = await authedPost({
    action: "attach_to_existing_source_file",
    recommendationId: "pop-rec-attach",
    candidateId: "existing-source-file-pop",
    actionBy: "admin-test",
    actionReason: "Attach from population queue.",
  });
  assert.equal(attachResponse.status, 200);
  const attachPayload = await attachResponse.json();
  assert.equal(attachPayload.recommendation.status, "attached_to_source_file");
  assert.equal(attachPayload.candidates.find((item) => item.id === "existing-source-file-pop").sourceFileNotes.length, 1);

  const filedState = await store.getDossierWorkflowState();
  assert.equal(filedState.recommendations.find((item) => item.id === "pop-rec-nonsubject")?.status, "not_population_subject");
  assert.equal(filedState.candidates.length, 1);

  const contextResponse = await populationContextGet("test-population-context-token");
  assert.equal(contextResponse.status, 200);
  const context = await contextResponse.json();
  assert.equal(JSON.stringify(context).includes("existing-source-file-pop"), true);
  assert.equal(JSON.stringify(context).includes("relationship_journal:private-row"), false);
});

test("Incoming BNL Signals search includes matched candidate names and Review stays navigational", () => {
  const page = source("src/app/admin/dossiers/page.tsx");
  const pageCopy = normalizedSource("src/app/admin/dossiers/page.tsx");
  assert.match(page, /populationRecommendationSearchText\(recommendation, candidates\)/);
  assert.match(page, /matchedCandidateNames/);
  assert.match(page, /Filed \/ Already Represented/);
  assert.match(page, /candidate\.name/);
  assert.match(page, /return \["new", "reviewing"\]\.includes\(recommendation\.status\)/);
  assertIncludesCopy(pageCopy, "Search unresolved signal, dossier, candidate, or Source File");
  assertIncludesCopy(pageCopy, "Review");
});

test("Population recommendation ingest dedupes by recommendationId and by subject plus action", async () => {
  await resetWorkflowStore();
  process.env.BNL_DOSSIER_INGEST_TOKEN = "test-bnl-ingest-token";

  const byId = await bnlIngestPost({
    type: "population_recommendation",
    recommendationId: "bnl-pop-rec-same-id",
    createdBy: "bnl_population_recommender",
    subjectName: "Same External Recommendation",
    adminSummary: "First summary.",
    recommendedLane: "candidate_intake",
    recommendedAction: "create_source_file_candidate",
    sourceLanes: ["broadcast_memory"],
  });
  assert.equal(byId.status, 200);
  const byIdAgain = await bnlIngestPost({
    type: "population_recommendation",
    recommendationId: "bnl-pop-rec-same-id",
    createdBy: "bnl_population_recommender",
    subjectName: "Same External Recommendation",
    adminSummary: "Refreshed summary.",
    recommendedLane: "candidate_intake",
    recommendedAction: "create_source_file_candidate",
    sourceLanes: ["broadcast_memory"],
  });
  assert.equal(byIdAgain.status, 200);
  assert.equal((await byIdAgain.json()).duplicate, true);

  const bySubjectAction = await bnlIngestPost({
    type: "population_recommendation",
    createdBy: "bnl_population_recommender",
    subjectName: "Same Subject Action",
    adminSummary: "First subject/action summary.",
    recommendedLane: "needs_population_review",
    recommendedAction: "admin_review_required",
    sourceLanes: ["broadcast_memory"],
  });
  assert.equal(bySubjectAction.status, 200);
  const bySubjectActionAgain = await bnlIngestPost({
    type: "population_recommendation",
    createdBy: "bnl_population_recommender",
    subjectName: "Same Subject Action",
    adminSummary: "Updated subject/action summary.",
    recommendedLane: "needs_population_review",
    recommendedAction: "admin_review_required",
    sourceLanes: ["broadcast_memory"],
  });
  assert.equal(bySubjectActionAgain.status, 200);
  assert.equal((await bySubjectActionAgain.json()).duplicate, true);

  const state = await store.getDossierWorkflowState();
  assert.equal(state.recommendations.filter((item) => item.subjectName === "Same External Recommendation").length, 1);
  assert.equal(state.recommendations.filter((item) => item.subjectName === "Same Subject Action").length, 1);
});

test("Population Review Queue create and attach actions route to existing internal workflows", async () => {
  await resetWorkflowStore();
  const now = new Date().toISOString();
  await store.saveDossierWorkflowState({
    version: 1,
    revision: 1,
    candidates: [
      {
        id: "existing-update-pop",
        name: "6 Bit",
        candidateType: "entity",
        source: "website_read_model",
        tier: "review_candidate",
        score: 58,
        whyNow: "Existing dossier update workspace.",
        reason: "Existing dossier update workspace.",
        status: "existing_dossier_update",
        existingDossierMatch: { id: "EN-001", name: "6 Bit", confidence: "high" },
        createdAt: now,
        updatedAt: now,
        sourceFileNotes: [],
      },
    ],
    drafts: [],
    recommendations: [
      {
        id: "pop-create-candidate",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "Brand New Population Subject",
        status: "new",
        reason: "Create candidate only.",
        adminSummary: "Create an internal Source File candidate.",
        recommendedLane: "candidate_intake",
        recommendedAction: "create_source_file_candidate",
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pop-create-workspace",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "6 Bit",
        status: "new",
        reason: "Create update workspace only.",
        adminSummary: "Create an internal Dossier Update workspace.",
        recommendedLane: "public_dossier_update_signal",
        recommendedAction: "create_dossier_update_workspace",
        matchedPublicDossierId: "EN-001",
        matchedPublicDossierName: "6 Bit",
        sourceLanes: ["website_dossier"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pop-attach-update",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "6 Bit",
        status: "new",
        reason: "Attach to update workspace only.",
        adminSummary: "Attach to existing Dossier Update workspace.",
        recommendedLane: "existing_dossier_update",
        recommendedAction: "attach_to_existing_dossier_update",
        matchedDossierUpdateCandidateId: "existing-update-pop",
        matchedPublicDossierId: "EN-001",
        matchedPublicDossierName: "6 Bit",
        sourceLanes: ["website_dossier"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pop-dismiss",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "Dismiss Me",
        status: "new",
        reason: "Dismiss only.",
        recommendedLane: "needs_population_review",
        recommendedAction: "admin_review_required",
        possibleTargets: [
          { id: "candidate-a", kind: "candidate", name: "Candidate A", confidence: "medium" },
          { id: "candidate-b", kind: "candidate", name: "Candidate B", confidence: "medium" },
        ],
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pop-needs-info",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "Needs Info Subject",
        status: "new",
        reason: "Needs info only.",
        recommendedLane: "needs_population_review",
        recommendedAction: "admin_review_required",
        possibleTargets: [
          { id: "candidate-a", kind: "candidate", name: "Candidate A", confidence: "medium" },
          { id: "candidate-b", kind: "candidate", name: "Candidate B", confidence: "medium" },
        ],
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const workspacePayload = await (await authedPost({
    action: "create_dossier_update_workspace",
    recommendationId: "pop-create-workspace",
    dossierId: "EN-001",
    actionBy: "admin-test",
  })).json();
  assert.equal(workspacePayload.recommendation.status, "attached_to_existing_dossier_update");
  assert.equal(workspacePayload.candidate.status, "existing_dossier_update");

  const filingResponse = await authedGet();
  assert.equal(filingResponse.status, 200);
  const filingPayload = await filingResponse.json();
  const candidateRecommendation = filingPayload.recommendations.find((item) => item.id === "pop-create-candidate");
  assert.equal(candidateRecommendation.status, "attached_to_candidate_intake");
  assert.equal(filingPayload.candidates.find((item) => item.name === "Brand New Population Subject")?.status, "candidate_intake");

  const filedState = await store.getDossierWorkflowState();

  const attachRecommendation = filedState.recommendations.find((item) => item.id === "pop-attach-update");
  assert.equal(attachRecommendation.status, "attached_to_existing_dossier_update");
  assert.equal(attachRecommendation.connectedCandidateId, "existing-update-pop");

  const dismissPayload = await (await authedPost({
    action: "dismiss_population_recommendation",
    recommendationId: "pop-dismiss",
    actionBy: "admin-test",
  })).json();
  assert.equal(dismissPayload.recommendation.status, "dismissed");

  const needsInfoPayload = await (await authedPost({
    action: "mark_needs_more_info",
    recommendationId: "pop-needs-info",
    actionBy: "admin-test",
  })).json();
  assert.equal(needsInfoPayload.recommendation.status, "needs_more_info");
  assert.ok(needsInfoPayload.recommendation.populationReviewActions[0].actionAt);

  const finalState = await store.getDossierWorkflowState();
  assert.equal(finalState.drafts.length, 0);
  assert.equal(finalState.recommendations.find((item) => item.id === "pop-dismiss").status, "dismissed");
});

test("reconcile_population_signals returns safe counts and files Mind Fanatic public-dossier duplicates", async () => {
  await resetWorkflowStore();
  const now = new Date().toISOString();
  await store.saveDossierWorkflowState({
    version: 1,
    revision: 1,
    candidates: [],
    drafts: [],
    recommendations: [
      {
        id: "mind-pop-1",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "Mind Fanatic [Barcode_Network]",
        status: "new",
        reason: "Existing public dossier signal.",
        adminSummary: "Public-safe summary only.",
        recommendedLane: "needs_population_review",
        recommendedAction: "admin_review_required",
        sourceLanes: ["broadcast_memory"],
        rawEvidenceRefs: ["private:mind:1"],
        rawEvidenceRefCount: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "mind-pop-2",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "Mind Fanatic [Barcode_Network]",
        status: "new",
        reason: "Duplicate existing public dossier signal.",
        adminSummary: "Second public-safe summary only.",
        recommendedLane: "needs_population_review",
        recommendedAction: "admin_review_required",
        sourceLanes: ["broadcast_memory"],
        rawEvidenceRefs: ["private:mind:2"],
        rawEvidenceRefCount: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "unknown-pop-1",
        type: "population_recommendation",
        populationRecommendation: true,
        createdBy: "bnl_population_recommender",
        ingestSource: "bnl_population_recommender",
        subjectName: "Unknown Filing Subject",
        status: "new",
        reason: "No destination exists.",
        recommendedLane: "needs_population_review",
        recommendedAction: "admin_review_required",
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const response = await authedPost({ action: "reconcile_population_signals" });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.action, "reconcile_population_signals");
  assert.equal(payload.populationReconcile.signalsReviewed, 3);
  assert.equal(payload.populationReconcile.publicPagesPublished, 0);
  assert.equal(payload.populationReconcile.publicDossierTextChanged, 0);
  assert.equal(payload.populationReconcile.internalAliasesExposed, 0);
  assert.equal(payload.populationReconcile.createdSourceFileCandidates, 1);
  assert.equal(payload.populationReconcile.markedNoNewInfo >= 1, true);
  assert.equal(payload.populationReconcile.duplicatesCollapsed >= 1, true);
  assert.equal(payload.populationReconcile.unresolvedNeedsReview, 0);

  const state = await store.getDossierWorkflowState();
  const mindVisible = state.recommendations.filter((item) =>
    item.subjectName.includes("Mind Fanatic") &&
    ["new", "reviewing"].includes(item.status) &&
    item.recommendedAction === "admin_review_required"
  );
  assert.equal(mindVisible.length, 0);
  assert.equal(state.candidates.length, 1);
});

test("population context exposes reconcile destinations and diagnostics", async () => {
  await resetWorkflowStore();
  process.env.BNL_API_KEY = "test-population-context-token";
  const now = new Date().toISOString();
  await store.saveDossierWorkflowState({
    version: 1,
    revision: 1,
    candidates: [
      {
        id: "ctx-candidate-intake",
        name: "Context Intake",
        candidateType: "artist",
        source: "manual",
        tier: "review_candidate",
        score: 55,
        whyNow: "Context test.",
        reason: "Context test.",
        status: "candidate_intake",
        createdAt: now,
        updatedAt: now,
        sourceFileNotes: [],
      },
    ],
    drafts: [
      {
        id: "ctx-draft",
        candidateId: "ctx-candidate-intake",
        status: "draft",
        fields: { id: "CTX", name: "Context Intake", category: "Artist", status: "DRAFT", clearance: "INTERNAL", role: "Draft", origin: "UNKNOWN", summary: "Draft.", notes: "Draft.", tags: [] },
        createdAt: now,
        updatedAt: now,
      },
    ],
    recommendations: [
      {
        id: "ctx-pop",
        type: "population_recommendation",
        populationRecommendation: true,
        subjectName: "Context Intake",
        status: "new",
        reason: "Population mapping.",
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "ctx-rec-backed",
        type: "new_subject",
        subjectName: "Recommendation Backed Intake",
        status: "new",
        reason: "Recommendation-backed destination.",
        sourceLanes: ["broadcast_memory"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const response = await populationContextGet("test-population-context-token");
  assert.equal(response.status, 200);
  const context = await response.json();
  assert.equal(context.diagnostics.draftDestinationCount, 1);
  assert.equal(context.diagnostics.recommendationBackedIntakeCount, 2);
  assert.equal(context.diagnostics.existingPopulationRecommendationCount, 1);
  assert.equal(context.draftDestinations.length, 1);
  assert.equal(context.recommendationBackedIntakeRecords.length, 2);
  assert.equal(context.existingPopulationRecommendations.length, 1);
  assert.equal(JSON.stringify(context).includes("private:"), false);
  delete process.env.BNL_API_KEY;
});

test("Draft from Source File creates and updates public-safe Proposed Dossier drafts without publishing or identity confirmation", async () => {
  await resetWorkflowStore();
  const now = new Date("2026-06-12T00:00:00.000Z").toISOString();
  await store.saveDossierWorkflowState({
    version: 1,
    revision: 0,
    candidates: [
      {
        id: "source-bridge-candidate",
        name: "Bridge Subject",
        candidateType: "entity",
        source: "manual",
        tier: "seed",
        score: 80,
        whyNow: "Public BARCODE Network mention surfaced for review.",
        reason: "Known public connection to BARCODE Network programming.",
        evidenceSummary: "Public-safe summary of Bridge Subject.",
        evidenceItems: [
          {
            id: "private-evidence-ref",
            label: "raw-private-ref-123",
            summary: "raw-private-ref-123 private evidence should stay internal",
          },
        ],
        knownFacts: ["Bridge Subject appeared in a public BARCODE Network context."],
        missingInfo: ["Confirm the exact public role before owner review."],
        doNotSay: ["Do not claim private alias Internal Alias."],
        publicSafetyNotes: ["Avoid private evidence refs in public copy."],
        recommendedCategory: "Entity",
        recommendedStatus: "PENDING",
        recommendedClearance: "PUBLIC",
        recommendedOrigin: "UNVERIFIED",
        sourceFileNotes: [
          {
            id: "public-note-1",
            candidateId: "source-bridge-candidate",
            type: "fact",
            text: "Public-safe source note for draft use.",
            source: "admin_manual",
            publicSafe: true,
            status: "active",
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "private-note-1",
            candidateId: "source-bridge-candidate",
            type: "do_not_say",
            text: "raw-private-ref-123 and Internal Alias are review-only evidence.",
            source: "admin_manual",
            publicSafe: false,
            status: "active",
            createdAt: now,
            updatedAt: now,
          },
        ],
        identityLinks: [
          {
            id: "identity-link-1",
            candidateId: "source-bridge-candidate",
            label: "Internal Alias",
            normalizedLabel: "internal alias",
            type: "alias",
            visibility: "internal_only",
            source: "admin_manual",
            status: "proposed",
            useForMatching: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
        status: "suggested",
        createdAt: now,
        updatedAt: now,
      },
    ],
    drafts: [],
    recommendations: [],
    sourceFileRefreshRequests: [],
    updatedAt: now,
  });

  const createResponse = await authedPost({
    action: "createDraftFromCandidate",
    candidateId: "source-bridge-candidate",
  });
  assert.equal(createResponse.status, 200);
  const createPayload = await createResponse.json();
  const draft = createPayload.draft;
  assert.equal(draft.status, "draft");
  assert.equal(draft.fields.name, "Bridge Subject");
  assert.match(draft.fields.summary, /Public-safe summary/);
  assert.match(draft.fields.notes, /Public-safe facts:/);
  assert.match(draft.fields.notes, /Connection to BARCODE Network:/);
  assert.match(draft.fields.notes, /Boundaries \/ what not to claim:/);
  assert.match(draft.fields.notes, /Owner-review notes:/);
  assert.doesNotMatch(JSON.stringify(draft.fields), /raw-private-ref-123|Internal Alias/);
  assert.deepEqual(draft.sourceFileDraftMetadata.publicSafeDraft, true);
  assert.deepEqual(draft.sourceFileDraftMetadata.reviewOnlyEvidence, true);
  assert.deepEqual(draft.sourceFileDraftMetadata.publicPagesMutated, false);
  assert.deepEqual(draft.sourceFileDraftMetadata.autoConfirmedIdentityLinks, false);

  const stateAfterCreate = await store.getDossierWorkflowState();
  assert.equal(stateAfterCreate.drafts.length, 1);
  assert.equal(stateAfterCreate.drafts[0].status, "draft");
  assert.equal(stateAfterCreate.candidates[0].identityLinks[0].status, "proposed");
  assert.equal(databasePage.entries.some((entry) => entry.name === "Bridge Subject"), false);

  const later = new Date("2026-06-12T00:10:00.000Z").toISOString();
  await store.saveDossierWorkflowState({
    ...stateAfterCreate,
    candidates: stateAfterCreate.candidates.map((candidate) =>
      candidate.id === "source-bridge-candidate"
        ? {
            ...candidate,
            sourceFileNotes: [
              ...candidate.sourceFileNotes,
              {
                id: "public-note-2",
                candidateId: candidate.id,
                type: "fact",
                text: "New public-safe fact added after draft creation.",
                source: "admin_manual",
                publicSafe: true,
                status: "active",
                createdAt: later,
                updatedAt: later,
              },
            ],
            updatedAt: later,
          }
        : candidate,
    ),
    updatedAt: later,
  });

  const updateResponse = await authedPost({
    action: "updateDraftFromSourceFile",
    draftId: draft.id,
  });
  assert.equal(updateResponse.status, 200);
  const updatePayload = await updateResponse.json();
  assert.match(updatePayload.draft.fields.notes, /New public-safe fact added after draft creation/);
  assert.equal(updatePayload.draft.status, "draft");
  assert.equal(updatePayload.draft.sourceFileDraftMetadata.publicPagesMutated, false);

  const stateAfterUpdate = await store.getDossierWorkflowState();
  assert.equal(stateAfterUpdate.candidates[0].identityLinks[0].status, "proposed");
  assert.equal(databasePage.entries.some((entry) => entry.name === "Bridge Subject"), false);
});
