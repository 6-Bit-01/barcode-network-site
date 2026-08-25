import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

class FakeStripe {
  static instances = [];
  static checkoutSession = {
    id: "cs_signal_hold",
    url: "https://checkout.stripe.test/signal-hold",
    created: 1_787_472_000,
    expires_at: 1_787_473_800,
  };

  constructor(key, options) {
    this.key = key;
    this.options = options;
    this.checkoutCreateCalls = [];
    this.checkout = {
      sessions: {
        create: async (input) => {
          this.checkoutCreateCalls.push(input);
          return FakeStripe.checkoutSession;
        },
      },
    };
    this.webhooks = {
      constructEvent: () => {
        throw new Error("Tests must mock the signed webhook constructor.");
      },
    };
    FakeStripe.instances.push(this);
  }

  static reset() {
    FakeStripe.instances.length = 0;
  }
}

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

Module._load = function loadWithFakeStripe(request, parent, isMain) {
  if (request === "stripe") return FakeStripe;
  return originalLoad.call(this, request, parent, isMain);
};

const require = createRequire(import.meta.url);
const queue = require("../src/lib/queue.ts");
const stripe = require("../src/lib/stripe.ts");
const queueTypes = require("../src/lib/queue-types.ts");
const checkoutClient = require("../src/lib/signal-hold-checkout-client.ts");
const checkoutRoute = require("../src/app/api/queue/signal-hold-checkout/route.ts");
const webhookRoute = require("../src/app/api/stripe/webhook/route.ts");

function checkoutRequest(body) {
  return new Request("https://example.test/api/queue/signal-hold-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      acceptedSignalHoldTerms: true,
      signalHoldTermsVersion: queueTypes.SIGNAL_HOLD_TERMS_VERSION,
      signalHoldDisclosureText: queueTypes.SIGNAL_HOLD_DISCLOSURE_TEXT,
      ...body,
    }),
  });
}

function webhookRequest({ signature = "sig_signal_hold", body = "signed-body" } = {}) {
  return new Request("https://example.test/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : undefined,
    body,
  });
}

async function withCheckoutMocks(mocks, callback) {
  const originals = {
    getPublicQueueSnapshot: queue.getPublicQueueSnapshot,
    requestSignalHoldCheckout: queue.requestSignalHoldCheckout,
    markSignalHoldCheckoutPending: queue.markSignalHoldCheckoutPending,
    createSignalHoldCheckoutSession: stripe.createSignalHoldCheckoutSession,
    secret: process.env.STRIPE_SECRET_KEY,
    webhook: process.env.STRIPE_WEBHOOK_SECRET,
  };
  process.env.STRIPE_SECRET_KEY = "sk_test_signal_hold_boundary";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_signal_hold_boundary";
  queue.getPublicQueueSnapshot = mocks.getPublicQueueSnapshot ?? (async (sessionId) => ({ session: { sessionId, purpose: "live_broadcast" } }));
  queue.requestSignalHoldCheckout = mocks.requestSignalHoldCheckout ?? originals.requestSignalHoldCheckout;
  queue.markSignalHoldCheckoutPending = mocks.markSignalHoldCheckoutPending ?? originals.markSignalHoldCheckoutPending;
  stripe.createSignalHoldCheckoutSession = mocks.createSignalHoldCheckoutSession ?? originals.createSignalHoldCheckoutSession;
  try {
    return await callback();
  } finally {
    queue.getPublicQueueSnapshot = originals.getPublicQueueSnapshot;
    queue.requestSignalHoldCheckout = originals.requestSignalHoldCheckout;
    queue.markSignalHoldCheckoutPending = originals.markSignalHoldCheckoutPending;
    stripe.createSignalHoldCheckoutSession = originals.createSignalHoldCheckoutSession;
    if (originals.secret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originals.secret;
    if (originals.webhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originals.webhook;
  }
}

async function withWebhookMocks(mocks, callback) {
  const originals = {
    constructWebhookEvent: stripe.constructWebhookEvent,
    markSignalHoldPaidFromStripe: queue.markSignalHoldPaidFromStripe,
    markPriorityUpgradePaidFromStripe: queue.markPriorityUpgradePaidFromStripe,
  };
  stripe.constructWebhookEvent = mocks.constructWebhookEvent ?? originals.constructWebhookEvent;
  queue.markSignalHoldPaidFromStripe = mocks.markSignalHoldPaidFromStripe ?? originals.markSignalHoldPaidFromStripe;
  queue.markPriorityUpgradePaidFromStripe = mocks.markPriorityUpgradePaidFromStripe ?? originals.markPriorityUpgradePaidFromStripe;
  try {
    return await callback();
  } finally {
    stripe.constructWebhookEvent = originals.constructWebhookEvent;
    queue.markSignalHoldPaidFromStripe = originals.markSignalHoldPaidFromStripe;
    queue.markPriorityUpgradePaidFromStripe = originals.markPriorityUpgradePaidFromStripe;
  }
}

function checkoutEvent({
  source = "barcode-radio-signal-hold",
  paymentStatus = "paid",
  trackId = "track-webhook",
  queueSessionId = "session-webhook",
} = {}) {
  return {
    id: "evt_signal_hold",
    type: "checkout.session.completed",
    created: 1_787_472_000,
    data: {
      object: {
        id: "cs_webhook",
        payment_intent: "pi_signal_hold",
        payment_status: paymentStatus,
        amount_total: 900,
        currency: "usd",
        metadata: { source, trackId, queueSessionId },
      },
    },
  };
}

test("Signal Hold Stripe checkout has a distinct source and mirrors only safe routing metadata", async () => {
  FakeStripe.reset();
  const originalSecret = process.env.STRIPE_SECRET_KEY;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.STRIPE_SECRET_KEY = "sk_test_signal_hold_helper";
  process.env.NEXT_PUBLIC_SITE_URL = "https://barcode.example/";
  try {
    const result = await stripe.createSignalHoldCheckoutSession({
      trackId: "track-1",
      queueSessionId: "session-1",
      artist: "Artist",
      title: "Song",
      amountCents: 900,
      currency: "usd",
    });
    const instance = FakeStripe.instances.at(-1);
    const input = instance.checkoutCreateCalls[0];
    assert.deepEqual(input.metadata, {
      trackId: "track-1",
      queueSessionId: "session-1",
      source: "barcode-radio-signal-hold",
    });
    assert.deepEqual(input.payment_intent_data.metadata, input.metadata);
    assert.equal(input.line_items[0].price_data.unit_amount, 900);
    assert.equal(input.success_url, "https://barcode.example/queue/session-1?signalHold=processing");
    assert.equal(input.cancel_url, "https://barcode.example/queue/session-1?signalHold=cancelled");
    assert.equal(JSON.stringify(input).includes("priorityGift"), false);
    assert.equal(result.url, FakeStripe.checkoutSession.url);
    assert.equal(stripe.isSignalHoldCheckoutSession({ metadata: input.metadata }), true);
    assert.equal(stripe.isPrioritySignalCheckoutSession({ metadata: input.metadata }), false);
  } finally {
    if (originalSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecret;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("Signal Hold checkout owner tokens use a product-specific browser namespace", () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const originalWindow = globalThis.window;
  const stored = new Map();
  globalThis.window = {
    crypto: {
      getRandomValues(bytes) {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
        return bytes;
      },
    },
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
    },
  };
  try {
    const token = checkoutClient.getOrCreateSignalHoldCheckoutOwnerToken("session-1", "track-1");
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.deepEqual([...stored.keys()], ["barcode-radio-signal-hold-checkout-owner:session-1:track-1"]);
    assert.equal(checkoutClient.getSignalHoldCheckoutOwnerToken("session-1", "track-1"), token);
    checkoutClient.clearSignalHoldCheckoutOwnerToken("session-1", "track-1");
    assert.equal(stored.size, 0);
  } finally {
    if (hadWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  }
});

test("Signal Hold checkout is owner-bound and only its initiating browser can resume", async () => {
  const checkoutOwnerToken = "a".repeat(64);
  const otherCheckoutOwnerToken = "b".repeat(64);
  let stripeCalls = 0;
  let pendingWrites = 0;
  const track = {
    id: "track-pending",
    artist: "Artist",
    title: "Song",
    status: "queued",
    signalHoldStatus: "checkout_pending",
    signalHoldCheckoutUrl: "https://checkout.stripe.test/original-hold",
    signalHoldCheckoutSessionId: "cs_original_hold",
    signalHoldCheckoutExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    signalHoldCheckoutOwnerTokenHash: checkoutRoute.hashSignalHoldCheckoutOwnerToken(checkoutOwnerToken),
    submitterToken: "own-submitter-token",
  };

  await withCheckoutMocks({
    requestSignalHoldCheckout: async () => ({ session: { sessionId: "session-1" }, track, amountCents: 900, currency: "usd", label: "Signal Hold" }),
    markSignalHoldCheckoutPending: async () => { pendingWrites += 1; },
    createSignalHoldCheckoutSession: async () => { stripeCalls += 1; throw new Error("must not create another checkout"); },
  }, async () => {
    const missingCheckoutOwner = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-1", submitterToken: track.submitterToken, checkoutOwnerToken: "" }));
    assert.equal(missingCheckoutOwner.status, 400);
    assert.equal("url" in await missingCheckoutOwner.json(), false);

    const missingSubmitter = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-1", checkoutOwnerToken }));
    const missingSubmitterPayload = await missingSubmitter.json();
    assert.equal(missingSubmitter.status, 409);
    assert.match(missingSubmitterPayload.error, /only for your own submitted track/i);
    assert.equal("url" in missingSubmitterPayload, false);

    const otherViewer = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-1", submitterToken: "another-viewer", checkoutOwnerToken }));
    const otherViewerPayload = await otherViewer.json();
    assert.equal(otherViewer.status, 409);
    assert.match(otherViewerPayload.error, /only for your own submitted track/i);
    assert.equal("url" in otherViewerPayload, false);

    const otherBrowser = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-1", submitterToken: track.submitterToken, checkoutOwnerToken: otherCheckoutOwnerToken }));
    const otherBrowserPayload = await otherBrowser.json();
    assert.equal(otherBrowser.status, 409);
    assert.equal(otherBrowserPayload.code, "checkout_owned_elsewhere");
    assert.equal("url" in otherBrowserPayload, false);

    const resumed = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-1", submitterToken: track.submitterToken, checkoutOwnerToken }));
    const resumedPayload = await resumed.json();
    assert.equal(resumed.status, 200);
    assert.equal(resumedPayload.url, track.signalHoldCheckoutUrl);
    assert.equal(resumedPayload.sessionId, track.signalHoldCheckoutSessionId);
    assert.match(resumedPayload.message, /not active yet/i);
    assert.equal(stripeCalls, 0);
    assert.equal(pendingWrites, 0);
  });
});

test("new own-track checkout persists only a Signal Hold owner-token hash", async () => {
  const checkoutOwnerToken = "c".repeat(64);
  let storedMetadata = null;
  let checkoutInput = null;
  const track = {
    id: "track-new",
    artist: "Artist",
    title: "Song",
    status: "queued",
    signalHoldStatus: "none",
    submitterToken: "self-submitter-token",
  };

  await withCheckoutMocks({
    requestSignalHoldCheckout: async () => ({ session: { sessionId: "session-2" }, track, amountCents: 900, currency: "usd", label: "Signal Hold" }),
    createSignalHoldCheckoutSession: async (input) => {
      checkoutInput = input;
      return {
        sessionId: "cs_new_hold",
        url: "https://checkout.stripe.test/new-hold",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      };
    },
    markSignalHoldCheckoutPending: async (_trackId, _sessionId, metadata) => { storedMetadata = metadata; },
  }, async () => {
    const response = await checkoutRoute.POST(checkoutRequest({ trackId: track.id, sessionId: "session-2", submitterToken: track.submitterToken, checkoutOwnerToken }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.url, "https://checkout.stripe.test/new-hold");
    assert.equal("priorityGiftAttribution" in checkoutInput, false);
    assert.equal(storedMetadata.checkoutOwnerTokenHash, checkoutRoute.hashSignalHoldCheckoutOwnerToken(checkoutOwnerToken));
    assert.equal(storedMetadata.signalHoldAcceptance.acceptedSignalHoldTerms, true);
    assert.equal(JSON.stringify(storedMetadata).includes(checkoutOwnerToken), false, "raw owner token must not be persisted");
    assert.match(payload.message, /not active yet/i);
  });
});

test("near-front ineligibility stops checkout before Stripe or pending state", async () => {
  let stripeCalls = 0;
  let pendingWrites = 0;
  const message = queueTypes.SIGNAL_HOLD_NEXT_TWO_UNAVAILABLE_MESSAGE;

  await withCheckoutMocks({
    requestSignalHoldCheckout: async () => { throw new Error(message); },
    createSignalHoldCheckoutSession: async () => { stripeCalls += 1; throw new Error("Stripe must not be called"); },
    markSignalHoldCheckoutPending: async () => { pendingWrites += 1; },
  }, async () => {
    const response = await checkoutRoute.POST(checkoutRequest({
      trackId: "track-near-front",
      sessionId: "session-near-front",
      submitterToken: "owner-near-front",
      checkoutOwnerToken: "d".repeat(64),
    }));
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.error, message);
    assert.equal("url" in payload, false);
  });

  assert.equal(stripeCalls, 0);
  assert.equal(pendingWrites, 0);
});

test("webhook rejects a missing or invalid signature before any paid mutation", async () => {
  let signalMutations = 0;
  let priorityMutations = 0;
  let verificationCalls = 0;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withWebhookMocks({
      constructWebhookEvent: async () => { verificationCalls += 1; throw new Error("invalid signature"); },
      markSignalHoldPaidFromStripe: async () => { signalMutations += 1; },
      markPriorityUpgradePaidFromStripe: async () => { priorityMutations += 1; },
    }, async () => {
      const missing = await webhookRoute.POST(webhookRequest({ signature: "" }));
      assert.equal(missing.status, 400);
      assert.equal(verificationCalls, 0);

      const invalid = await webhookRoute.POST(webhookRequest());
      assert.equal(invalid.status, 400);
      assert.equal(verificationCalls, 1);
      assert.equal(signalMutations, 0);
      assert.equal(priorityMutations, 0);
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test("webhook ignores wrong-source and unpaid Hold sessions, then delegates paid replay idempotency", async () => {
  let event = checkoutEvent();
  const signalPayments = [];
  let priorityMutations = 0;

  await withWebhookMocks({
    constructWebhookEvent: async (body, signature) => {
      assert.equal(body, "signed-body");
      assert.equal(signature, "sig_signal_hold");
      return event;
    },
    markSignalHoldPaidFromStripe: async (trackId, sessionId, payment) => {
      signalPayments.push({ trackId, sessionId, payment });
      return signalPayments.length === 1 ? { updated: true } : { updated: false, reason: "already_active" };
    },
    markPriorityUpgradePaidFromStripe: async () => { priorityMutations += 1; return { updated: true }; },
  }, async () => {
    event = checkoutEvent({ source: "unrelated-checkout" });
    const wrongSource = await webhookRoute.POST(webhookRequest());
    assert.deepEqual(await wrongSource.json(), { received: true, ignored: true });

    event = checkoutEvent({ paymentStatus: "unpaid" });
    const unpaid = await webhookRoute.POST(webhookRequest());
    assert.deepEqual(await unpaid.json(), { received: true, ignored: "unpaid_checkout" });
    assert.equal(signalPayments.length, 0);
    assert.equal(priorityMutations, 0);

    event = checkoutEvent();
    const paid = await webhookRoute.POST(webhookRequest());
    assert.deepEqual(await paid.json(), { received: true, result: { updated: true } });
    assert.deepEqual(signalPayments[0], {
      trackId: "track-webhook",
      sessionId: "session-webhook",
      payment: {
        paymentId: "pi_signal_hold",
        amountCents: 900,
        currency: "usd",
        paidAt: "2026-08-23T08:00:00.000Z",
        checkoutSessionId: "cs_webhook",
      },
    });

    const replay = await webhookRoute.POST(webhookRequest());
    assert.deepEqual(await replay.json(), { received: true, result: { updated: false, reason: "already_active" } });
    assert.equal(signalPayments.length, 2, "the queue mutation remains the replay-idempotency authority");
    assert.equal(priorityMutations, 0);
  });
});

test("paid Priority webhook routing remains on the existing mutation path", async () => {
  let priorityPayment = null;
  let signalMutations = 0;
  const event = checkoutEvent({ source: "barcode-radio-priority-signal" });

  await withWebhookMocks({
    constructWebhookEvent: async () => event,
    markSignalHoldPaidFromStripe: async () => { signalMutations += 1; return { updated: true }; },
    markPriorityUpgradePaidFromStripe: async (trackId, sessionId, payment) => {
      priorityPayment = { trackId, sessionId, payment };
      return { updated: true };
    },
  }, async () => {
    const response = await webhookRoute.POST(webhookRequest());
    assert.equal(response.status, 200);
    assert.equal(signalMutations, 0);
    assert.equal(priorityPayment.trackId, "track-webhook");
    assert.equal(priorityPayment.sessionId, "session-webhook");
    assert.equal(priorityPayment.payment.giftAttribution, null);
  });
});
