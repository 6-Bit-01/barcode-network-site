import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

let typescript = null;
try {
  const imported = await import("typescript");
  typescript = imported.default ?? imported;
} catch {
  // The project's normal development install includes TypeScript.
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const originalTypeScriptLoader = Module._extensions[".ts"];

let adminCookie = null;
const LIVE_TEST_KEY = ["sk", "live", "recovery-test-placeholder"].join("_");
const TEST_MODE_KEY = ["sk", "test", "wrong-data-universe"].join("_");

class FakeStripe {
  static instances = [];
  static sessionListHandler = async () => ({ data: [], has_more: false });
  static lineItemListHandler = async () => ({ data: [], has_more: false });

  constructor(key, options) {
    this.key = key;
    this.options = options;
    this.calls = [];
    this.checkout = {
      sessions: {
        list: async (params) => {
          this.calls.push(["sessions.list", params]);
          return FakeStripe.sessionListHandler(params);
        },
        listLineItems: async (sessionId, params) => {
          this.calls.push(["sessions.listLineItems", sessionId, params]);
          return FakeStripe.lineItemListHandler(sessionId, params);
        },
      },
    };
    FakeStripe.instances.push(this);
  }

  static reset() {
    FakeStripe.instances.length = 0;
    FakeStripe.sessionListHandler = async () => ({ data: [], has_more: false });
    FakeStripe.lineItemListHandler = async () => ({ data: [], has_more: false });
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
  let outputText;
  if (typescript) {
    outputText = typescript.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
  } else {
    assert.equal(typeof Module.stripTypeScriptTypes, "function", "TypeScript or Node's type stripper is required");
    outputText = Module.stripTypeScriptTypes(source, { mode: "transform" })
      .replace(/^import (\w+) from "([^"]+)";$/gm, 'const $1 = require("$2");')
      .replace(/import\s+\{([\s\S]*?)\}\s+from\s+"([^"]+)";/g, (_match, names, request) =>
        `const { ${names.replace(/\s+/g, " ").trim()} } = require("${request}");`)
      .replace(/^export\s+/gm, "");
    if (filename.endsWith("/src/lib/stripe.ts")) {
      outputText += "\nmodule.exports = { PRIORITY_SIGNAL_RECOVERY_WINDOW, PrioritySignalRecoveryInventoryError, listPrioritySignalRecoveryCheckoutSessions };\n";
    } else if (filename.endsWith("/priority-checkouts/route.ts")) {
      outputText += "\nmodule.exports = { GET };\n";
    }
  }
  module._compile(outputText, filename);
};

Module._load = function loadWithRecoveryFakes(request, parent, isMain) {
  if (request === "stripe") return FakeStripe;
  if (request === "./queue-types" && parent?.filename?.endsWith("/src/lib/stripe.ts")) return { TIERS: {} };
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body, init = {}) => new Response(JSON.stringify(body), {
          ...init,
          headers: { "content-type": "application/json", ...(init.headers ?? {}) },
        }),
      },
    };
  }
  if (request === "next/headers") {
    return {
      cookies: async () => ({
        get: (name) => name === "barcode_admin" && adminCookie ? { value: adminCookie } : undefined,
      }),
    };
  }
  if (request === "@/lib/auth") {
    return {
      COOKIE_NAME: "barcode_admin",
      verifyAdminToken: async (token) => token === "valid-admin-token",
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("../src/app/api/admin/queue/recovery/priority-checkouts/route.ts");

function checkoutSession(id, overrides = {}) {
  return {
    id,
    created: 1_786_758_000,
    livemode: true,
    status: "open",
    payment_status: "unpaid",
    amount_total: 1200,
    currency: "usd",
    metadata: {
      source: "barcode-radio-priority-signal",
      trackId: `q_${id}`,
      queueSessionId: "session_aug14",
    },
    customer: "cus_private",
    customer_details: {
      email: "private@example.test",
      name: "Private Customer",
      address: { line1: "private" },
    },
    payment_intent: "pi_private",
    url: "https://checkout.stripe.test/private",
    ...overrides,
  };
}

function lineItem(id, description, productDescription) {
  return {
    id,
    description,
    price: {
      product: productDescription === undefined
        ? "prod_unexpanded"
        : {
          id: "prod_private",
          description: productDescription,
          metadata: { private: "do-not-return" },
        },
    },
    quantity: 1,
  };
}

function setStripeKey(value) {
  if (value === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = value;
}

const originalStripeKey = process.env.STRIPE_SECRET_KEY;

test.beforeEach(() => {
  adminCookie = null;
  FakeStripe.reset();
  setStripeKey(LIVE_TEST_KEY);
});

test.after(() => {
  setStripeKey(originalStripeKey);
  Module._resolveFilename = originalResolveFilename;
  Module._load = originalLoad;
  if (originalTypeScriptLoader) Module._extensions[".ts"] = originalTypeScriptLoader;
});

test("Priority recovery requires the admin cookie before Stripe is configured or called", async () => {
  setStripeKey(undefined);
  const missingResponse = await route.GET();
  assert.equal(missingResponse.status, 401);
  assert.equal(missingResponse.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await missingResponse.json(), { error: "Unauthorized" });
  assert.equal(FakeStripe.instances.length, 0);

  adminCookie = "invalid-token";
  setStripeKey(LIVE_TEST_KEY);
  const invalidResponse = await route.GET();
  assert.equal(invalidResponse.status, 401);
  assert.equal(FakeStripe.instances.length, 0);
});

test("Priority recovery fails closed after authentication when Stripe is not configured", async () => {
  adminCookie = "valid-admin-token";
  setStripeKey(undefined);
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "Stripe is not configured.",
    reason: "stripe_not_configured",
    readOnly: true,
    complete: false,
    partialResultsReturned: false,
  });
  assert.equal(FakeStripe.instances.length, 0);
});

test("Priority recovery refuses test-mode Stripe before constructing a client", async () => {
  adminCookie = "valid-admin-token";
  setStripeKey(TEST_MODE_KEY);
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "Live Stripe is not configured.",
    reason: "stripe_live_mode_not_configured",
    readOnly: true,
    complete: false,
    partialResultsReturned: false,
  });
  assert.equal(FakeStripe.instances.length, 0);
});

test("Priority recovery uses a fixed full window, paginates sessions and line items, filters source, and returns only allowlisted evidence", async () => {
  adminCookie = "valid-admin-token";
  const ignored = checkoutSession("cs_ignored", {
    metadata: { source: "some-other-checkout", trackId: "private-other" },
  });
  const later = checkoutSession("cs_priority_later", {
    created: 1_786_762_000,
    status: "complete",
    payment_status: "paid",
    amount_total: 1500,
    metadata: {
      source: "barcode-radio-priority-signal",
      trackId: "q_later",
      queueSessionId: "session_aug14",
      customerEmail: "metadata-private@example.test",
    },
  });
  const earlier = checkoutSession("cs_priority_earlier", {
    created: 1_786_750_000,
    amount_total: null,
    currency: null,
    metadata: {
      source: "barcode-radio-priority-signal",
      trackId: "q_earlier",
      queueSessionId: "session_aug14",
      supporterName: "Private Supporter",
    },
  });

  FakeStripe.sessionListHandler = async ({ starting_after }) => {
    if (!starting_after) return { data: [later, ignored], has_more: true };
    assert.equal(starting_after, "cs_ignored");
    return { data: [earlier], has_more: false };
  };

  FakeStripe.lineItemListHandler = async (sessionId, { starting_after }) => {
    if (sessionId === later.id) {
      if (!starting_after) {
        return {
          data: [lineItem("li_later_1", "Priority Signal", "Later Artist — Later Track")],
          has_more: true,
        };
      }
      assert.equal(starting_after, "li_later_1");
      return {
        data: [lineItem("li_later_2", "Fallback Artist — Fallback Track")],
        has_more: false,
      };
    }
    assert.equal(sessionId, earlier.id);
    assert.equal(starting_after, undefined);
    return {
      data: [lineItem("li_earlier_1", "Priority Signal", "Earlier Artist — Earlier Track")],
      has_more: false,
    };
  };

  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();
  assert.deepEqual(payload, {
    readOnly: true,
    complete: true,
    truncated: false,
    source: "barcode-radio-priority-signal",
    window: {
      startInclusive: "2026-08-14T07:00:00.000Z",
      endInclusive: "2026-08-15T10:23:00.000Z",
    },
    sessionListCalls: 2,
    lineItemListCalls: 3,
    count: 2,
    sessions: [
      {
        sessionId: "cs_priority_earlier",
        status: "open",
        paymentStatus: "unpaid",
        amountTotal: null,
        currency: null,
        created: new Date(earlier.created * 1000).toISOString(),
        metadata: {
          source: "barcode-radio-priority-signal",
          trackId: "q_earlier",
          queueSessionId: "session_aug14",
        },
        lineItems: [
          {
            description: "Earlier Artist — Earlier Track",
            descriptionSource: "product_description",
          },
        ],
      },
      {
        sessionId: "cs_priority_later",
        status: "complete",
        paymentStatus: "paid",
        amountTotal: 1500,
        currency: "usd",
        created: new Date(later.created * 1000).toISOString(),
        metadata: {
          source: "barcode-radio-priority-signal",
          trackId: "q_later",
          queueSessionId: "session_aug14",
        },
        lineItems: [
          {
            description: "Later Artist — Later Track",
            descriptionSource: "product_description",
          },
          {
            description: "Fallback Artist — Fallback Track",
            descriptionSource: "line_item_description",
          },
        ],
      },
    ],
  });

  assert.equal(FakeStripe.instances.length, 1);
  const stripe = FakeStripe.instances[0];
  assert.equal(stripe.key, LIVE_TEST_KEY);
  assert.deepEqual(stripe.options, { apiVersion: "2026-02-25.clover" });
  assert.deepEqual(stripe.calls, [
    ["sessions.list", {
      created: { gte: Date.parse("2026-08-14T07:00:00.000Z") / 1000, lte: Date.parse("2026-08-15T10:23:00.000Z") / 1000 },
      limit: 100,
      starting_after: undefined,
    }],
    ["sessions.list", {
      created: { gte: Date.parse("2026-08-14T07:00:00.000Z") / 1000, lte: Date.parse("2026-08-15T10:23:00.000Z") / 1000 },
      limit: 100,
      starting_after: "cs_ignored",
    }],
    ["sessions.listLineItems", "cs_priority_later", { limit: 100, starting_after: undefined, expand: ["data.price.product"] }],
    ["sessions.listLineItems", "cs_priority_later", { limit: 100, starting_after: "li_later_1", expand: ["data.price.product"] }],
    ["sessions.listLineItems", "cs_priority_earlier", { limit: 100, starting_after: undefined, expand: ["data.price.product"] }],
  ]);

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /private@example|Private Customer|Private Supporter|cus_private|pi_private|checkout\.stripe|prod_private|sk_live|customer|address|payment_intent|url/i);
});

test("Priority recovery returns no partial data when Checkout Session pagination cannot advance", async () => {
  adminCookie = "valid-admin-token";
  FakeStripe.sessionListHandler = async () => ({ data: [], has_more: true });

  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "Priority Signal recovery inventory could not be collected.",
    reason: "stripe_inventory_unavailable",
    readOnly: true,
    complete: false,
    partialResultsReturned: false,
    sessionListCalls: 1,
    lineItemListCalls: 0,
  });
});

test("Priority recovery rejects non-live session data without returning partial evidence", async () => {
  adminCookie = "valid-admin-token";
  FakeStripe.sessionListHandler = async () => ({
    data: [checkoutSession("cs_test_wrong_universe", { livemode: false })],
    has_more: false,
  });

  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Priority Signal recovery inventory could not be collected.",
    reason: "stripe_inventory_unavailable",
    readOnly: true,
    complete: false,
    partialResultsReturned: false,
    sessionListCalls: 1,
    lineItemListCalls: 0,
  });
});

test("Priority recovery fails explicitly instead of truncating at the Checkout Session page cap", async () => {
  adminCookie = "valid-admin-token";
  let sessionPage = 0;
  FakeStripe.sessionListHandler = async () => {
    sessionPage += 1;
    return {
      data: [checkoutSession(`cs_unrelated_page_${sessionPage}`, {
        metadata: { source: "unrelated-checkout" },
      })],
      has_more: true,
    };
  };

  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Priority Signal recovery inventory could not be collected.",
    reason: "stripe_inventory_unavailable",
    readOnly: true,
    complete: false,
    partialResultsReturned: false,
    sessionListCalls: 100,
    lineItemListCalls: 0,
  });
  assert.equal(sessionPage, 100);
});

test("Priority recovery returns no partial data when line-item pagination cannot advance", async () => {
  adminCookie = "valid-admin-token";
  FakeStripe.sessionListHandler = async () => ({ data: [checkoutSession("cs_priority")], has_more: false });
  FakeStripe.lineItemListHandler = async () => ({ data: [], has_more: true });

  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Priority Signal recovery inventory could not be collected.",
    reason: "stripe_inventory_unavailable",
    readOnly: true,
    complete: false,
    partialResultsReturned: false,
    sessionListCalls: 1,
    lineItemListCalls: 1,
  });
});

test("Priority recovery fails explicitly instead of truncating at the line-item page cap", async () => {
  adminCookie = "valid-admin-token";
  FakeStripe.sessionListHandler = async () => ({ data: [checkoutSession("cs_priority")], has_more: false });
  let linePage = 0;
  FakeStripe.lineItemListHandler = async () => {
    linePage += 1;
    return {
      data: [lineItem(`li_page_${linePage}`, `Artist ${linePage} — Track ${linePage}`)],
      has_more: true,
    };
  };

  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Priority Signal recovery inventory could not be collected.",
    reason: "stripe_inventory_unavailable",
    readOnly: true,
    complete: false,
    partialResultsReturned: false,
    sessionListCalls: 1,
    lineItemListCalls: 10,
  });
  assert.equal(linePage, 10);
});

test("Priority recovery route exposes only GET and has no request-driven filters", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/queue/recovery/priority-checkouts/route.ts"), "utf8");
  assert.match(source, /export async function GET\(\)/);
  assert.doesNotMatch(source, /export async function (?:POST|PUT|PATCH|DELETE)|NextRequest|searchParams|request\s*:/);
});
