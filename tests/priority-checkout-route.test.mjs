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
const stripe = require("../src/lib/stripe.ts");
const checkoutRoute = require("../src/app/api/queue/priority-checkout/route.ts");
const queueTypes = require("../src/lib/queue-types.ts");

function checkoutRequest(body) {
  return new Request("https://example.test/api/queue/priority-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      acceptedPriorityTerms: true,
      priorityTermsVersion: queueTypes.PRIORITY_TERMS_VERSION,
      priorityDisclosureText: queueTypes.PRIORITY_DISCLOSURE_TEXT,
      ...body,
    }),
  });
}

async function withCheckoutMocks(mocks, callback) {
  const originals = {
    getPublicQueueSnapshot: queue.getPublicQueueSnapshot,
    requestPriorityCheckout: queue.requestPriorityCheckout,
    markPriorityUpgradeCheckoutPending: queue.markPriorityUpgradeCheckoutPending,
    createPrioritySignalCheckoutSession: stripe.createPrioritySignalCheckoutSession,
    secret: process.env.STRIPE_SECRET_KEY,
    webhook: process.env.STRIPE_WEBHOOK_SECRET,
    queueProduction: process.env.BARCODE_QUEUE_PRODUCTION_ENABLED,
  };
  process.env.STRIPE_SECRET_KEY = "sk_test_priority_boundary";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_priority_boundary";
  process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
  queue.getPublicQueueSnapshot = mocks.getPublicQueueSnapshot ?? (async (sessionId) => ({ session: { sessionId, purpose: "live_broadcast" } }));
  queue.requestPriorityCheckout = mocks.requestPriorityCheckout ?? originals.requestPriorityCheckout;
  queue.markPriorityUpgradeCheckoutPending = mocks.markPriorityUpgradeCheckoutPending ?? originals.markPriorityUpgradeCheckoutPending;
  stripe.createPrioritySignalCheckoutSession = mocks.createPrioritySignalCheckoutSession ?? originals.createPrioritySignalCheckoutSession;
  try {
    return await callback();
  } finally {
    queue.getPublicQueueSnapshot = originals.getPublicQueueSnapshot;
    queue.requestPriorityCheckout = originals.requestPriorityCheckout;
    queue.markPriorityUpgradeCheckoutPending = originals.markPriorityUpgradeCheckoutPending;
    stripe.createPrioritySignalCheckoutSession = originals.createPrioritySignalCheckoutSession;
    if (originals.secret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originals.secret;
    if (originals.webhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originals.webhook;
    if (originals.queueProduction === undefined) delete process.env.BARCODE_QUEUE_PRODUCTION_ENABLED;
    else process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = originals.queueProduction;
  }
}

test("only the initiating browser can resume a usable pending Priority checkout", async () => {
  const ownerToken = "a".repeat(64);
  const otherToken = "b".repeat(64);
  let stripeCalls = 0;
  let pendingWrites = 0;
  const track = {
    id: "track-pending",
    artist: "Recipient Artist",
    title: "Pending Track",
    status: "queued",
    lane: "regular",
    priorityUpgradeStatus: "checkout_pending",
    priorityUpgradeCheckoutUrl: "https://checkout.stripe.test/original",
    priorityUpgradeCheckoutSessionId: "cs_original",
    priorityUpgradeCheckoutExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    priorityUpgradeCheckoutOwnerTokenHash: checkoutRoute.hashPriorityCheckoutOwnerToken(ownerToken),
    submitterToken: "track-owner",
  };

  await withCheckoutMocks({
    requestPriorityCheckout: async () => ({ session: { sessionId: "session-1", activeCount: 4 }, track, amountCents: 1000, currency: "usd", label: "Priority Signal" }),
    markPriorityUpgradeCheckoutPending: async () => { pendingWrites += 1; },
    createPrioritySignalCheckoutSession: async () => { stripeCalls += 1; throw new Error("must not create another checkout"); },
  }, async () => {
    const denied = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-1", checkoutOwnerToken: otherToken, priorityGift: true }));
    const deniedPayload = await denied.json();
    assert.equal(denied.status, 409);
    assert.equal(deniedPayload.code, "checkout_owned_elsewhere");
    assert.equal("url" in deniedPayload, false);
    assert.equal(stripeCalls, 0);
    assert.equal(pendingWrites, 0);

    const resumed = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-1", checkoutOwnerToken: ownerToken, priorityGift: true }));
    const resumedPayload = await resumed.json();
    assert.equal(resumed.status, 200);
    assert.equal(resumedPayload.url, track.priorityUpgradeCheckoutUrl);
    assert.equal(resumedPayload.sessionId, track.priorityUpgradeCheckoutSessionId);
    assert.equal(stripeCalls, 0);
    assert.equal(pendingWrites, 0);
  });
});

test("new Priority checkout stores only the owner-token hash and accepts the submitter's self-upgrade", async () => {
  const checkoutOwnerToken = "c".repeat(64);
  let storedMetadata = null;
  let checkoutInput = null;
  const track = {
    id: "track-new",
    artist: "Self Artist",
    title: "Self Track",
    status: "queued",
    lane: "regular",
    priorityUpgradeStatus: "none",
    submitterToken: "self-submitter-token",
  };

  await withCheckoutMocks({
    requestPriorityCheckout: async () => ({ session: { sessionId: "session-2", activeCount: 4 }, track, amountCents: 1200, currency: "usd", label: "Priority Signal" }),
    createPrioritySignalCheckoutSession: async (input) => {
      checkoutInput = input;
      return { sessionId: "cs_new", url: "https://checkout.stripe.test/new", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    },
    markPriorityUpgradeCheckoutPending: async (_trackId, _sessionId, metadata) => { storedMetadata = metadata; },
  }, async () => {
    const response = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-2", submitterToken: track.submitterToken, checkoutOwnerToken }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.url, "https://checkout.stripe.test/new");
    assert.equal(checkoutInput.priorityGiftAttribution, null);
    assert.equal(storedMetadata.checkoutOwnerTokenHash, checkoutRoute.hashPriorityCheckoutOwnerToken(checkoutOwnerToken));
    assert.equal(JSON.stringify(storedMetadata).includes(checkoutOwnerToken), false, "raw owner token must not be persisted");
  });
});
