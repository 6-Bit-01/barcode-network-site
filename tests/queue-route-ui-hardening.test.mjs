import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function compileWithStubs(relativePath, stubs = {}) {
  const filename = path.join(projectRoot, relativePath);
  const extension = path.extname(filename).toLowerCase();
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const originalLoad = Module._load;
  Module._load = function loadStub(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(filename);
    compiled.filename = filename;
    compiled.paths = Module._nodeModulePaths(path.dirname(filename));
    compiled._compile(output, extension === ".tsx" ? filename.replace(/\.tsx$/, ".js") : filename);
    return compiled.exports;
  } finally {
    Module._load = originalLoad;
  }
}

function publicSnapshot(session) {
  return {
    revision: 1,
    session,
    status: { isOpen: false, activeCount: 0, acceptedCount: 0, estimatedRuntimeSeconds: 0, capacity: 44, isFull: false, pressure: "low" },
    queue: [],
    completed: [],
    nowPlaying: null,
    upNext: null,
    submitterStatus: null,
  };
}

function session(status = "open") {
  return {
    sessionId: `session-${status}`,
    title: "Queue hardening test",
    showDate: "2026-08-16",
    status,
    description: "Queue hardening test",
    completedCount: 0,
    completedRuntimeSeconds: 0,
    activeCount: 0,
    acceptedCount: 0,
    submissionClosureReason: null,
    removedCount: 0,
    submissionCooldownSeconds: 300,
    queueOpen: status === "open",
    showStarted: false,
    preShowEndsAt: null,
    broadcastPhase: status === "archived" ? "ended" : "warmup",
    broadcastStartedAt: null,
    nextInLineTrackId: null,
    loadedTrackId: null,
    wheelSpinsOwed: 0,
    priorityUpgradesEnabled: false,
    priorityUpgradeLabel: "Priority Signal",
    priorityUpgradeInstructions: "",
    priorityUpgradePriceCents: 0,
    priorityUpgradeCurrency: "usd",
    priorityUpgradePaymentsEnabled: false,
    sponsorBreakSeconds: 630,
    sponsorBreakMode: "mid_show",
    sponsorBreakStatus: "not_due",
    sponsorBreakStartedAt: null,
    sponsorBreakCompletedAt: null,
    sponsorBreakCompletedAfterPlayableCount: null,
    sponsorBreakDueAfterPlayableCount: null,
    sponsorBreakManualNote: null,
  };
}

function renderFunctionElement(element) {
  let rendered = element;
  while (rendered && typeof rendered.type === "function") rendered = rendered.type(rendered.props);
  return rendered;
}

test("public view state distinguishes loading, unavailable, stale, empty, active, and archived", () => {
  const view = compileWithStubs("src/lib/queue-public-view-state.ts");
  const empty = publicSnapshot(null);
  const active = publicSnapshot(session("open"));
  const archived = publicSnapshot(session("archived"));
  const degraded = { ...active, storageAuthority: "degraded_cached" };

  assert.equal(view.queuePublicViewState(null, false, null), "loading");
  assert.equal(view.queuePublicViewState(null, false, "network unavailable"), "unavailable");
  assert.equal(view.queuePublicViewState(null, true, null), "empty");
  assert.equal(view.queuePublicViewState(empty, true, null), "empty");
  assert.equal(view.queuePublicSnapshotIsArchived(empty), false, "an empty store is not an archived show");
  assert.equal(view.queuePublicViewState(active, true, null), "active");
  assert.equal(view.queuePublicViewState(active, true, "refresh failed"), "stale");
  assert.equal(view.queuePublicSnapshotUsesDegradedCache(degraded), true);
  assert.equal(view.queuePublicViewState(degraded, true, null), "stale", "a server-verified cache is still stale, not live authority");
  assert.equal(view.queuePublicViewState(archived, true, null), "archived");
});

test("admin safety state is explicit, risky responses require revalidation, and End targets survive polling drift", () => {
  const safety = compileWithStubs("src/lib/queue-admin-safety.ts");
  const confirmed = { session: { ...session("open"), sessionId: "session-a", title: "Show A", showDate: "2026-08-16" } };

  assert.equal(safety.queueAdminReadViewState(null, null), "loading");
  assert.equal(safety.queueAdminReadViewState(null, "offline"), "unavailable");
  assert.equal(safety.queueAdminReadViewState(confirmed, null), "confirmed");
  assert.equal(safety.queueAdminReadViewState(confirmed, "refresh failed"), "stale");
  assert.equal(safety.queueAdminReadViewState({ ...confirmed, storageAuthority: "degraded_cached" }, null), "stale");
  assert.equal(safety.queueStateUsesDegradedCache({ ...confirmed, storageAuthority: "degraded_cached" }), true);

  for (const code of ["queue_storage_unavailable", "queue_state_unavailable", "queue_state_conflict", "queue_state_ambiguous"]) {
    assert.equal(safety.queueResponseRequiresStateRevalidation({ code }), true, `${code} must block ordinary mutations until a confirmed read`);
  }
  assert.equal(safety.queueResponseRequiresStateRevalidation({ code: "invalid_action" }), false);
  assert.equal(safety.queueResponseRequiresStateRevalidation(null), false);

  const captured = safety.captureQueueEndTarget(confirmed.session);
  confirmed.session = { ...confirmed.session, sessionId: "session-b", title: "Show B" };
  assert.deepEqual(captured, { sessionId: "session-a", title: "Show A", showDate: "2026-08-16" }, "a poll that switches the displayed session must not retarget an open End confirmation");

  assert.equal(safety.queuePollingResponseMayApply({ requestEpoch: 0, currentMutationEpoch: 0, mutationsInFlight: 0, latestAppliedMutationEpoch: 0 }), true);
  assert.equal(safety.queuePollingResponseMayApply({ requestEpoch: 0, currentMutationEpoch: 1, mutationsInFlight: 1, latestAppliedMutationEpoch: 0 }), false, "a GET started before an in-flight mutation cannot apply");
  assert.equal(safety.queuePollingResponseMayApply({ requestEpoch: 0, currentMutationEpoch: 1, mutationsInFlight: 0, latestAppliedMutationEpoch: 1 }), false, "an old GET cannot overwrite the completed POST snapshot");
  assert.equal(safety.queuePollingResponseMayApply({ requestEpoch: 1, currentMutationEpoch: 1, mutationsInFlight: 0, latestAppliedMutationEpoch: 1 }), true, "a GET started after the mutation can confirm live state");
});

test("polling accepts only the newest request and never rolls a confirmed revision backward", () => {
  const polling = compileWithStubs("src/lib/queue-polling-safety.ts");
  let latestRequestSequence = 0;
  let latestAppliedRevision = 10;
  const applied = [];
  const issue = () => ++latestRequestSequence;
  const settle = (requestSequence, responseRevision) => {
    const mayApply = polling.queuePollingSnapshotMayApply({
      requestSequence,
      latestRequestSequence,
      responseRevision,
      latestAppliedRevision,
    });
    if (mayApply) {
      latestAppliedRevision = responseRevision;
      applied.push(responseRevision);
    }
    return mayApply;
  };

  const slowOlderRequest = issue();
  const fastNewerRequest = issue();
  assert.equal(settle(fastNewerRequest, 12), true);
  assert.equal(settle(slowOlderRequest, 11), false, "a slower response from an older request cannot overwrite the newer response");
  const newestRequestWithRegressedStorage = issue();
  assert.equal(settle(newestRequestWithRegressedStorage, 9), false, "even the newest request cannot roll a confirmed revision backward");
  const nextConfirmedRequest = issue();
  assert.equal(settle(nextConfirmedRequest, 13), true);
  assert.deepEqual(applied, [12, 13]);
  assert.equal(polling.queuePollingRequestIsCurrent({ requestSequence: slowOlderRequest, latestRequestSequence }), false);
  assert.equal(polling.queuePollingRequestIsCurrent({ requestSequence: latestRequestSequence, latestRequestSequence }), true);
});

test("admin clients surface JSON/network errors, retain failed End confirmation, and send exact session IDs", () => {
  const files = [
    source("src/components/AdminShowManagement.tsx"),
    source("src/components/AdminRadioQueueControl.tsx"),
  ];

  for (const admin of files) {
    assert.doesNotMatch(admin, /if\s*\(!res\.ok\)\s*return null/, "non-2xx responses must not be silently swallowed");
    assert.match(admin, /const payload = await res\.json\(\)\.catch\(\(\) => null\);[\s\S]*if \(!res\.ok\) \{[\s\S]*setOperationError\(responseErrorMessage\(payload,/);
    assert.match(admin, /catch \{[\s\S]*setOperationError\("The queue request could not reach the server\./);
    assert.match(admin, /const sessionId = endTarget\?\.sessionId;[\s\S]*post\(\{ action: "archiveSession", sessionId \}, \{ allowWhileStale: true \}\)/);
    assert.match(admin, /const next = await post\(\{ action: "archiveSession", sessionId \}, \{ allowWhileStale: true \}\);\s*if \(!next\) return;\s*setEndConfirmOpen\(false\);\s*setEndTarget\(null\);/);
    assert.match(admin, /const target = captureQueueEndTarget\(state\?\.session\);[\s\S]*setEndTarget\(target\);[\s\S]*setEndConfirmOpen\(true\);/);
    assert.match(admin, /endTarget\.sessionId|target\.sessionId/, "the confirmation must visibly identify its captured target");
    assert.match(admin, /finally \{\s*setEndingSession\(false\);\s*\}/);
    assert.match(admin, /role="alert"/);
  }

  const queueControl = files[1];
  assert.match(queueControl, /try \{\s*const res = await fetch\([\s\S]*finally \{\s*mutationInFlightRef\.current = Math\.max\(0, mutationInFlightRef\.current - 1\);/);
});

test("admin clients preserve confirmed snapshots, expose recovery, and gate ordinary mutations while stale", () => {
  const management = source("src/components/AdminShowManagement.tsx");
  const queueControl = source("src/components/AdminRadioQueueControl.tsx");

  for (const admin of [management, queueControl]) {
    assert.match(admin, /const readViewState = queueAdminReadViewState\(state, error\);/);
    assert.match(admin, /readViewState === "unavailable"[\s\S]*No confirmed [^<]+ snapshot is available/);
    assert.match(admin, /readViewState === "loading"[\s\S]*Loading the first confirmed snapshot/);
    assert.match(admin, /LAST CONFIRMED SNAPSHOT PRESERVED/);
    assert.match(admin, /Recovery Diagnostics/);
    assert.match(admin, /if \(error && !options\.allowWhileStale\)/);
    assert.match(admin, /queueResponseRequiresStateRevalidation\(payload\)\) setError\(/);
    assert.match(admin, /outcome is unknown; check diagnostics before retrying\."\);\s*setError\(/);
    assert.match(admin, /setState|applyMutationState/);
    assert.match(admin, /queueStateUsesDegradedCache\(next\)[\s\S]*setError\(DEGRADED_QUEUE_READ_MESSAGE\)/);
    assert.match(admin, /queuePollingResponseMayApply\(/);
    assert.match(admin, /const requestSequence = \+\+pollRequestSequenceRef\.current;/);
    assert.match(admin, /queuePollingSnapshotMayApply\(\{[\s\S]*responseRevision: next\.revision,[\s\S]*latestAppliedRevision: latestAppliedRevisionRef\.current/);
    assert.match(admin, /nextRevision < latestAppliedRevisionRef\.current[\s\S]*older queue snapshot/);
    assert.match(admin, /mutationEpochRef\.current \+= 1;[\s\S]*mutationInFlightRef\.current \+= 1;/);
    assert.match(admin, /finally \{[\s\S]*mutationInFlightRef\.current = Math\.max\(0, mutationInFlightRef\.current - 1\);/);
    assert.match(admin, /setError\(null\);\s*setLastConfirmedAt\(new Date\(\)\.toISOString\(\)\);/, "a successful full-state POST must establish a new confirmed snapshot");
  }

  assert.match(management, /controlsDisabled=\{stale\}/);
  assert.match(management, /onEnd=\{openEndConfirmation\}/);
  assert.match(queueControl, /const readOnly = serverReadOnly \|\| stale;/);
  assert.match(queueControl, /const canControlSession = hasCurrentSession && !stale;/);
  assert.match(queueControl, /activeUtilityPanel === "visuals" && hasCurrentSession/);
  assert.match(queueControl, /Download Playback Diagnostics/);
  assert.match(queueControl, /disabled=\{!canControlSession\}[\s\S]*End Broadcast/);
  assert.match(queueControl, /mode === "next"[\s\S]*disabled=\{readOnly \|\| playerOccupied\}/, "loading a player must be disabled from a stale snapshot");
  assert.match(queueControl, /disabled=\{readOnly\}[\s\S]*Pull Next Track[\s\S]*disabled=\{!canControlSession\}[\s\S]*Open Wheel Panel/, "rail mutations must remain visibly disabled while stale");
});

test("public degraded-cache reads remain visibly stale and already-open intake cannot submit", () => {
  const gateway = source("src/components/PublicQueueGateway.tsx");
  const sessionSource = source("src/components/PublicQueueSession.tsx");
  const form = source("src/components/RadioQueueForm.tsx");

  for (const client of [gateway, sessionSource]) {
    assert.match(client, /queuePublicSnapshotUsesDegradedCache\(next\)/);
    assert.match(client, /setSyncError\(DEGRADED_PUBLIC_QUEUE_MESSAGE\)/);
    assert.match(client, /next\.revision > previous\.revision/, "a degraded response must not roll the browser back behind its last snapshot");
    assert.match(client, /const requestSequence = \+\+pollRequestSequenceRef\.current;/);
    assert.match(client, /queuePollingSnapshotMayApply\(\{[\s\S]*responseRevision: next\.revision,[\s\S]*latestAppliedRevision: latestAppliedRevisionRef\.current/);
    assert.match(client, /next\.revision < latestAppliedRevisionRef\.current[\s\S]*older snapshot/);
  }
  assert.match(sessionSource, /blockedByParentStale=\{viewState === "stale"\}/);
  assert.match(sessionSource, /if \(viewState !== "active"\)[\s\S]*Priority checkout is paused/);

  assert.match(form, /async function loadStatus\(\): Promise<QueuePublicSnapshot \| null> \{[\s\S]*const requestSequence = statusRequestSequenceRef\.current \+ 1;[\s\S]*try \{/);
  assert.match(form, /const payload = await res\.json\(\)\.catch\(\(\) => null\);[\s\S]*queuePollingRequestIsCurrent\([\s\S]*if \(!res\.ok\) \{\s*setStatusSyncError\(publicQueueResponseError/);
  assert.match(form, /catch \{[\s\S]*queuePollingRequestIsCurrent\([\s\S]*setStatusSyncError\("The live queue could not be reached\. Retrying automatically\."\);\s*return null;/);
  assert.match(form, /queuePublicSnapshotUsesDegradedCache\(next\)[\s\S]*setStatusSyncError\(DEGRADED_PUBLIC_QUEUE_MESSAGE\);\s*return null;/);
  assert.match(form, /queuePollingSnapshotMayApply\(\{[\s\S]*responseRevision: next\.revision,[\s\S]*latestAppliedRevision: latestStatusSnapshotRef\.current\?\.revision \?\? -1/);
  assert.match(form, /if \(!refreshedBeforeSubmit\) throw new Error\(QUEUE_STATUS_UNAVAILABLE_MESSAGE\)/, "a failed pre-submit refresh must not fall back to an old session ID");
  assert.match(form, /const intakeStateUnavailable = blockedByParentStale \|\| !hasConfirmedStatus \|\| Boolean\(statusSyncError\);/);
  assert.match(form, /disabled=\{intakeStateUnavailable \|\|[\s\S]*status\?\.isOpen !== true/);
  assert.match(form, /SUBMISSION PAUSED — LIVE QUEUE STATE NOT CONFIRMED/);
});

test("Show Management keeps a post-commit warning visible and does not immediately redirect", () => {
  const management = source("src/components/AdminShowManagement.tsx");
  assert.match(management, /if \(next\.warnings\?\.length\) \{[\s\S]*setOperationNotice\([\s\S]*return;\s*\}[\s\S]*router\.push/);
  assert.match(management, /operationNotice && <div role="status"/);
});

test("admin provenance failures use the safe queue response mapper", async () => {
  const rawSecret = "raw-provider-secret https://private.upstash.io Limit: 500000";
  const route = compileWithStubs("src/app/api/admin/queue/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json" } }) } },
    "next/headers": { cookies: async () => ({ get: () => ({ value: "admin" }) }) },
    "@/lib/auth": { COOKIE_NAME: "admin", verifyAdminToken: async () => true },
    "@/lib/live-overlay": { getLiveOverlayPlayerSync: async () => null, getStoredLiveOverlayState: async () => ({}), resetWheelCeremonyStateForNewSession: async () => {} },
    "@/lib/queue-live-timing": { attachQueueLiveTiming: (value) => value },
    "@/lib/queue-admin-session-target": { resolveQueueArchiveSessionId: () => null },
    "@/lib/queue-types": { isQueueSessionPurpose: () => true, isQueueSessionBnlPublicationStatus: () => true },
    "@/lib/queue": {
      queueOperationErrorResponse: (_error, fallback) => ({ payload: { error: fallback, code: "queue_operation_failed" }, status: 500 }),
      updateQueueSessionProvenance: async () => { throw new Error(rawSecret); },
    },
  });

  const response = await route.POST(new Request("https://example.test/api/admin/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "updateSessionProvenance", sessionId: "session-1", purpose: "live_broadcast", bnlPublicationStatus: "private" }),
  }));
  const payload = await response.json();
  assert.equal(response.status, 500);
  assert.equal(payload.error, "Queue session provenance could not be updated.");
  assert.equal(payload.code, "queue_operation_failed");
  assert.doesNotMatch(JSON.stringify(payload), /raw-provider-secret|upstash\.io|500000/i);
});

test("upload failures preserve safe validation messages but redact provider and queue-storage details", async () => {
  const rawSecret = "raw-provider-secret https://private.upstash.io Limit: 500000";
  const nextServer = { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json" } }) } };
  const queueErrorResponse = (error, fallback) => error?.code === "queue_storage_unavailable"
    ? { payload: { error: "Queue storage is temporarily unavailable. Mutation refused.", code: error.code }, status: 503 }
    : { payload: { error: fallback, code: "queue_operation_failed" }, status: 500 };

  const storageRoute = compileWithStubs("src/app/api/queue/upload/route.ts", {
    "next/server": nextServer,
    "@vercel/blob/client": { handleUpload: async ({ onBeforeGenerateToken }) => onBeforeGenerateToken("barcode-radio-queue/test.mp3", JSON.stringify({ sessionId: "session-1", uploadOriginalName: "test.mp3", fileSize: 10, mimeType: "audio/mpeg" })) },
    "@/lib/queue": {
      getPublicQueueSnapshot: async () => { throw Object.assign(new Error(rawSecret), { code: "queue_storage_unavailable", status: 503 }); },
      queueOperationErrorResponse: queueErrorResponse,
    },
  });
  const storageResponse = await storageRoute.POST(new Request("https://example.test/api/queue/upload", { method: "POST", body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }) }));
  const storagePayload = await storageResponse.json();
  assert.equal(storageResponse.status, 503);
  assert.equal(storagePayload.code, "queue_storage_unavailable");
  assert.doesNotMatch(JSON.stringify(storagePayload), /raw-provider-secret|upstash\.io|500000/i);

  const unknownRoute = compileWithStubs("src/app/api/queue/upload/route.ts", {
    "next/server": nextServer,
    "@vercel/blob/client": { handleUpload: async () => { throw new Error(rawSecret); } },
    "@/lib/queue": { getPublicQueueSnapshot: async () => publicSnapshot(session("open")), queueOperationErrorResponse: queueErrorResponse },
  });
  const unknownResponse = await unknownRoute.POST(new Request("https://example.test/api/queue/upload", { method: "POST", body: JSON.stringify({}) }));
  const unknownPayload = await unknownResponse.json();
  assert.equal(unknownResponse.status, 500);
  assert.equal(unknownPayload.error, "Upload could not be completed.");
  assert.doesNotMatch(JSON.stringify(unknownPayload), /raw-provider-secret|upstash\.io|500000/i);
});

test("priority checkout allowlists validation errors and redacts queue, Stripe, and unknown failures", async () => {
  const rawSecret = "raw-provider-secret https://api.stripe.invalid/sk_live_secret";
  const previousStripeKey = process.env.STRIPE_SECRET_KEY;
  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "configured-for-test";
  process.env.STRIPE_WEBHOOK_SECRET = "configured-for-test";

  const nextServer = { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json" } }) } };
  const checkoutRequest = {
    session: { sessionId: "session-1", activeCount: 3 },
    track: {
      id: "track-1",
      artist: "Artist",
      title: "Track",
      submittedArtistName: "Artist",
      submittedSongTitle: "Track",
      submitterToken: "submitter-1",
      priorityUpgradeStatus: "none",
    },
    amountCents: 1000,
    currency: "usd",
    label: "Priority Signal",
  };
  const queueFailureResponse = (error, fallback) => error?.code === "queue_state_ambiguous"
    ? { payload: { error: "Queue mutation outcome could not be confirmed.", code: error.code }, status: 409 }
    : { payload: { error: fallback, code: "queue_operation_failed" }, status: 500 };
  const request = () => new Request("https://example.test/api/queue/priority-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      trackId: "track-1",
      sessionId: "session-1",
      submitterToken: "submitter-1",
      checkoutOwnerToken: "a".repeat(32),
      acceptedPriorityTerms: true,
      priorityTermsVersion: "test",
      priorityDisclosureText: "test",
    }),
  });
  const compileRoute = ({ requestFailure, checkoutFailure }) => compileWithStubs("src/app/api/queue/priority-checkout/route.ts", {
    "next/server": nextServer,
    "@/lib/stripe": {
      createPrioritySignalCheckoutSession: async () => {
        if (checkoutFailure) throw checkoutFailure;
        return { url: "https://checkout.example.test", sessionId: "checkout-1", createdAt: new Date().toISOString(), expiresAt: null };
      },
    },
    "@/lib/queue": {
      createPriorityGiftAttribution: () => null,
      markPriorityUpgradeCheckoutPending: async () => null,
      queueOperationErrorResponse: queueFailureResponse,
      requestPriorityCheckout: async () => {
        if (requestFailure) throw requestFailure;
        return checkoutRequest;
      },
    },
  });

  try {
    const stripeError = Object.assign(new Error(rawSecret), { type: "StripeAPIError", statusCode: 503 });
    const stripeResponse = await compileRoute({ checkoutFailure: stripeError }).POST(request());
    const stripePayload = await stripeResponse.json();
    assert.equal(stripeResponse.status, 503);
    assert.deepEqual(stripePayload, {
      error: "Priority Signal checkout is temporarily unavailable. Please try again later.",
      code: "priority_checkout_unavailable",
    });
    assert.doesNotMatch(JSON.stringify(stripePayload), /raw-provider-secret|stripe\.invalid|sk_live/i);

    const unknownResponse = await compileRoute({ checkoutFailure: new Error(rawSecret) }).POST(request());
    const unknownPayload = await unknownResponse.json();
    assert.equal(unknownResponse.status, 500);
    assert.equal(unknownPayload.error, "Priority Signal checkout is temporarily unavailable. Please try again later.");
    assert.doesNotMatch(JSON.stringify(unknownPayload), /raw-provider-secret|stripe\.invalid|sk_live/i);

    const queueError = Object.assign(new Error(rawSecret), { code: "queue_state_ambiguous", status: 409 });
    const queueResponse = await compileRoute({ requestFailure: queueError }).POST(request());
    const queuePayload = await queueResponse.json();
    assert.equal(queueResponse.status, 409);
    assert.equal(queuePayload.code, "queue_state_ambiguous");
    assert.doesNotMatch(JSON.stringify(queuePayload), /raw-provider-secret|stripe\.invalid|sk_live/i);

    const validationMessage = "Priority Signal Upgrade is not available for this track.";
    const validationResponse = await compileRoute({ requestFailure: new Error(validationMessage) }).POST(request());
    assert.equal(validationResponse.status, 409);
    assert.deepEqual(await validationResponse.json(), { error: validationMessage });
  } finally {
    if (previousStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousStripeKey;
    if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
  }
});

test("an exact archived public URL renders its completed-log client instead of redirecting", async () => {
  const archived = publicSnapshot(session("archived"));
  const calls = [];
  const redirects = [];
  function PublicQueueSessionStub() {}
  const page = compileWithStubs("src/app/queue/[sessionId]/page.tsx", {
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { redirect: (href) => { redirects.push(href); throw new Error(`redirect:${href}`); } },
    "@/components/PublicQueueSession": { PublicQueueSession: PublicQueueSessionStub },
    "@/lib/queue": { getPublicQueueSnapshot: async (sessionId) => { calls.push(sessionId); return archived; } },
    "@/lib/queue-public-view-state": { queuePublicSnapshotIsArchived: (snapshot) => snapshot?.session?.status === "archived" || snapshot?.session?.broadcastPhase === "ended" },
  });

  const rendered = renderFunctionElement(await page.default({ params: Promise.resolve({ sessionId: "session-archived" }) }));
  const section = rendered.props.children;
  const queueClient = Array.isArray(section.props.children) ? section.props.children.find((child) => child?.type === PublicQueueSessionStub) : section.props.children;
  assert.equal(queueClient.type, PublicQueueSessionStub);
  assert.equal(queueClient.props.sessionId, "session-archived");
  assert.deepEqual(calls, ["session-archived"], "an archived exact hit must not consult ambient active state");
  assert.deepEqual(redirects, []);
});

test("a queue read outage renders the retrying client while a genuinely missing URL redirects only to a live session", async () => {
  function PublicQueueSessionStub() {}
  const common = {
    "next/link": { __esModule: true, default: "a" },
    "@/components/PublicQueueSession": { PublicQueueSession: PublicQueueSessionStub },
    "@/lib/queue-public-view-state": { queuePublicSnapshotIsArchived: (snapshot) => snapshot?.session?.status === "archived" || snapshot?.session?.broadcastPhase === "ended" },
  };

  const unavailablePage = compileWithStubs("src/app/queue/[sessionId]/page.tsx", {
    ...common,
    "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
    "@/lib/queue": { getPublicQueueSnapshot: async () => { throw Object.assign(new Error("provider detail"), { code: "queue_state_unavailable" }); } },
  });
  const unavailable = renderFunctionElement(await unavailablePage.default({ params: Promise.resolve({ sessionId: "session-unknown-outcome" }) }));
  const unavailableClient = unavailable.props.children.props.children;
  assert.equal(unavailableClient.type, PublicQueueSessionStub);
  assert.equal(unavailableClient.props.sessionId, "session-unknown-outcome");

  const redirects = [];
  const calls = [];
  const active = publicSnapshot({ ...session("open"), sessionId: "current-live-session" });
  const missingPage = compileWithStubs("src/app/queue/[sessionId]/page.tsx", {
    ...common,
    "next/navigation": { redirect: (href) => { redirects.push(href); throw new Error(`redirect:${href}`); } },
    "@/lib/queue": { getPublicQueueSnapshot: async (sessionId) => {
      calls.push(sessionId);
      if (sessionId) throw Object.assign(new Error("missing"), { code: "queue_session_not_found" });
      return active;
    } },
  });
  await assert.rejects(
    () => missingPage.default({ params: Promise.resolve({ sessionId: "missing-session" }) }),
    /redirect:\/queue\/current-live-session/,
  );
  assert.deepEqual(calls, ["missing-session", undefined]);
  assert.deepEqual(redirects, ["/queue/current-live-session"]);
});

test("public component contracts preserve stale snapshots and never label null as archived/ended", () => {
  const gateway = source("src/components/PublicQueueGateway.tsx");
  const sessionSource = source("src/components/PublicQueueSession.tsx");
  const page = source("src/app/queue/[sessionId]/page.tsx");

  assert.match(gateway, /queuePublicViewState\(snapshot, hasConfirmedSnapshot, syncError\)/);
  assert.match(gateway, /Live queue refresh failed — showing last confirmed data/);
  assert.doesNotMatch(gateway, /if \(!snapshot\.session\) return "archived"/);
  assert.match(sessionSource, /if \(viewState === "loading"\)/);
  assert.match(sessionSource, /if \(viewState === "unavailable"\)/);
  assert.match(sessionSource, /if \(viewState === "empty" \|\| \(viewState === "stale" && !snapshot\?\.session\)\)/);
  assert.match(sessionSource, /const isEnded = queuePublicSnapshotIsArchived\(snapshot\)/);
  assert.doesNotMatch(sessionSource, /const isEnded = !snapshot\?\.session/);
  assert.match(page, /getPublicQueueSnapshot\(sessionId\)/);
  assert.match(page, /if \(!queuePublicSnapshotIsArchived\(snapshot\)\) \{[\s\S]*getPublicQueueSnapshot\(\)/);
});
