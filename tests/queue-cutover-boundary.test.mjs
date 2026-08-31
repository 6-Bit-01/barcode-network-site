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
Module._extensions[".tsx"] = Module._extensions[".ts"];

const require = createRequire(import.meta.url);
const queue = require("../src/lib/queue.ts");
const queueRoute = require("../src/app/api/queue/route.ts");
const priorityRoute = require("../src/app/api/queue/priority-checkout/route.ts");
const signalHoldRoute = require("../src/app/api/queue/signal-hold-checkout/route.ts");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function checkoutRequest(pathname, body) {
  return new Request(`https://example.test${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("disabled anonymous queue reads, writes, and checkout initiation fail before mutation", { concurrency: false }, async () => {
  const previousCapability = process.env.BARCODE_QUEUE_PRODUCTION_ENABLED;
  const originals = {
    getPublicQueueSnapshot: queue.getPublicQueueSnapshot,
    requestPriorityCheckout: queue.requestPriorityCheckout,
    requestSignalHoldCheckout: queue.requestSignalHoldCheckout,
  };
  delete process.env.BARCODE_QUEUE_PRODUCTION_ENABLED;
  let snapshotReads = 0;
  let mutationCalls = 0;
  queue.getPublicQueueSnapshot = async (sessionId) => {
    snapshotReads += 1;
    return {
      session: {
        sessionId: sessionId ?? "active-session",
        purpose: "live_broadcast",
        status: "open",
        broadcastPhase: "submission_window",
      },
      sessionActive: true,
    };
  };
  queue.requestPriorityCheckout = async () => { mutationCalls += 1; throw new Error("must not mutate"); };
  queue.requestSignalHoldCheckout = async () => { mutationCalls += 1; throw new Error("must not mutate"); };

  try {
    const getResponse = await queueRoute.GET(new Request("https://example.test/api/queue"));
    assert.equal(getResponse.status, 404);
    assert.equal((await getResponse.json()).code, "queue_production_disabled");
    assert.match(getResponse.headers.get("cache-control") ?? "", /no-store/);

    const postResponse = await queueRoute.POST(checkoutRequest("/api/queue", { artist: "Blocked" }));
    assert.equal(postResponse.status, 404);
    assert.equal((await postResponse.json()).code, "queue_production_disabled");

    const directSubmission = await queueRoute.submitTrackFromBody({});
    assert.equal(directSubmission.status, 404);
    assert.equal((await directSubmission.json()).code, "queue_production_disabled");
    assert.equal(snapshotReads, 0, "ordinary disabled traffic must not read queue storage");

    const priority = await priorityRoute.POST(checkoutRequest("/api/queue/priority-checkout", {
      trackId: "priority-track",
      sessionId: "priority-session",
    }));
    assert.equal(priority.status, 404);
    assert.equal((await priority.json()).code, "queue_production_disabled");

    const signalHold = await signalHoldRoute.POST(checkoutRequest("/api/queue/signal-hold-checkout", {
      trackId: "hold-track",
      sessionId: "hold-session",
    }));
    assert.equal(signalHold.status, 404);
    assert.equal((await signalHold.json()).code, "queue_production_disabled");
    assert.equal(snapshotReads, 2, "checkout authorization reads only the named session snapshot");
    assert.equal(mutationCalls, 0);
  } finally {
    queue.getPublicQueueSnapshot = originals.getPublicQueueSnapshot;
    queue.requestPriorityCheckout = originals.requestPriorityCheckout;
    queue.requestSignalHoldCheckout = originals.requestSignalHoldCheckout;
    if (previousCapability === undefined) delete process.env.BARCODE_QUEUE_PRODUCTION_ENABLED;
    else process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = previousCapability;
  }
});

test("every direct native surface consumes the shared cutover decision and webhooks stay outside it", () => {
  const publicRoute = read("src/app/api/queue/route.ts");
  const uploadRoute = read("src/app/api/queue/upload/route.ts");
  const priorityRouteSource = read("src/app/api/queue/priority-checkout/route.ts");
  const signalHoldRouteSource = read("src/app/api/queue/signal-hold-checkout/route.ts");
  const queuePage = read("src/app/queue/page.tsx");
  const sessionPage = read("src/app/queue/[sessionId]/page.tsx");
  const obsPage = read("src/app/obs/page.tsx");
  const webhook = read("src/app/api/stripe/webhook/route.ts");

  assert.match(publicRoute, /resolveQueueOperationalAccess/);
  assert.match(uploadRoute, /resolveQueueOperationalAccess/);
  assert.match(priorityRouteSource, /resolveQueueRequestAccess/);
  assert.match(signalHoldRouteSource, /resolveQueueRequestAccess/);
  assert.match(queuePage, /resolveQueueCookieAccess/);
  assert.match(queuePage, /redirect\("\/radio"\)/);
  assert.match(sessionPage, /resolveQueueCookieAccess/);
  assert.match(sessionPage, /redirect\("\/radio"\)/);
  assert.match(obsPage, /resolveQueueCookieAccess/);
  assert.match(obsPage, /notFound\(\)/);
  assert.doesNotMatch(webhook, /queue-production|queue_production_disabled|resolveQueueOperationalAccess|resolveQueueRequestAccess/);
});

test("Footer receives server-resolved routing and public dossiers no longer claim stale intake ownership", () => {
  const layout = read("src/app/layout.tsx");
  const siteChrome = read("src/components/SiteChrome.tsx");
  const footer = read("src/components/Footer.tsx");
  const content = read("src/content.ts");

  assert.match(layout, /const radioSubmission = getRadioSubmissionRouting\(\)/);
  assert.match(layout, /<SiteChrome radioSubmission=\{radioSubmission\}>/);
  assert.match(siteChrome, /<Footer submission=\{radioSubmission\}/);
  assert.doesNotMatch(footer, /getRadioSubmissionRouting\(\)/);
  assert.doesNotMatch(content, /Accepts submissions via Auxchord/);
  assert.doesNotMatch(content, /Primary intake for BARCODE Radio queue/);
  assert.match(content, /historical BARCODE Radio intake interface record/);
  assert.match(content, /Current submission instructions live on BARCODE Radio/);
});
