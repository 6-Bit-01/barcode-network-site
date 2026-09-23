import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(outputText, {
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
    module: cjsModule, exports: cjsModule.exports, process, URL, encodeURIComponent,
  }, { filename: file });
  return cjsModule.exports;
}
const { deriveRadioQueueEntryState } = load("src/lib/live-status-public.ts");
const { resolveQueueOperationalAccess } = load("src/lib/queue-production.ts");
const snapshot = (overrides = {}) => ({
  sessionActive: true,
  session: { sessionId: "public-night", purpose: "live_broadcast", status: "open", broadcastPhase: "submission_window", showStarted: false },
  status: { isOpen: true, isFull: false },
  queue: [], completed: [], nowPlaying: null, upNext: null,
  ...overrides,
});
const entry = (queueSnapshot = snapshot(), overrides = {}) => deriveRadioQueueEntryState({ queueProductionEnabled: true, readState: "ready", queueSnapshot, ...overrides });

test("Radio never mistakes initial, failed, or disabled reads for an open or closed queue", () => {
  for (const readState of ["loading", "unavailable", "disabled"]) {
    const result = entry(snapshot(), { readState });
    assert.equal(result.status, readState === "loading" ? "loading" : "unavailable");
    assert.equal(result.href, null, "stale successful data must not keep an entry link after failure");
  }
  assert.equal(entry(snapshot(), { queueProductionEnabled: false }).href, null);
});

test("Radio entry reflects open, closed-intake, live and capacity states without hiding the active queue", () => {
  const open = snapshot();
  assert.equal(entry(open).status, "open");
  assert.equal(entry(open).href, "/queue/public-night");
  const closed = { ...open, status: { isOpen: false, isFull: false } };
  assert.equal(entry(closed).status, "standby");
  assert.equal(entry(closed).href, "/queue/public-night");
  for (const [isOpen, status] of [[true, "live_open"], [false, "live_closed"]]) {
    const live = snapshot({ session: { ...open.session, broadcastPhase: "broadcast_active" }, status: { isOpen, isFull: false } });
    assert.equal(entry(live).status, status);
    assert.equal(entry(live).href, "/queue/public-night");
  }
  assert.equal(entry(snapshot({ status: { isOpen: false, isFull: true } })).status, "full");
});

test("Radio does not advertise private, missing, stale, archived, ended or unknown-purpose sessions", () => {
  const base = snapshot();
  for (const purpose of ["rehearsal", "simulation", "internal_test", "unknown", undefined]) {
    const result = entry(snapshot({ session: { ...base.session, purpose } }));
    assert.equal(result.status, "closed");
    assert.equal(result.href, null);
  }
  for (const hidden of [snapshot({ session: null }), snapshot({ sessionActive: false }), snapshot({ session: { ...base.session, status: "archived" } }), snapshot({ session: { ...base.session, broadcastPhase: "ended" } })]) {
    assert.equal(entry(hidden).status, "closed");
    assert.equal(entry(hidden).href, null);
  }
  assert.equal(entry(snapshot({ session: { ...base.session, sessionId: "show / one" } })).href, "/queue/show%20%2F%20one");
});

async function route({ raw = snapshot(), production = true, adminToken, rehearsalToken, readFails = false } = {}) {
  let reads = 0, sanitizations = 0;
  const env = { BARCODE_QUEUE_PRODUCTION_ENABLED: production ? "true" : "false" };
  const auth = {
    COOKIE_NAME: "admin", REHEARSAL_QUEUE_COOKIE_NAME: "rehearsal",
    verifyAdminToken: async (token) => token === "valid-admin",
    verifyRehearsalQueueToken: async (token, id) => token === `signed:${id}`,
  };
  const access = load("src/lib/queue-rehearsal-access.ts", {
    "@/lib/auth": auth,
    "@/lib/queue-production": { resolveQueueOperationalAccess: (authorities) => resolveQueueOperationalAccess(authorities, env) },
  });
  const page = load("src/app/queue/page.tsx", {
    "next/headers": { cookies: async () => ({ get: (name) => ({ value: name === "admin" ? adminToken : rehearsalToken }) }) },
    "next/navigation": { redirect: (href) => { throw Object.assign(new Error("redirect"), { href }); } },
    "@/lib/auth": auth,
    "@/lib/queue-rehearsal-access": access,
    "@/lib/queue": {
      getPublicQueueSnapshot: async () => { reads++; if (readFails) throw new Error("fixture storage unavailable"); return raw; },
      sanitizeQueueSnapshotForPublic: (value) => {
        sanitizations++;
        assert.equal(value, raw);
        return value.session?.purpose === "live_broadcast" ? value : snapshot({ session: null, sessionActive: false });
      },
    },
  });
  let href;
  try { await page.default(); assert.fail("queue entry must redirect without rendering a gateway"); }
  catch (error) { if (!error.href) throw error; href = error.href; }
  return { href, reads, sanitizations };
}

test("/queue immediately redirects open, closed-intake and full sessions after one sanitized read", async () => {
  for (const status of [{ isOpen: true }, { isOpen: false }, { isOpen: false, isFull: true }]) {
    assert.deepEqual(await route({ raw: snapshot({ status }) }), { href: "/queue/public-night", reads: 1, sanitizations: 1 });
  }
});

test("/queue sends missing, ended and private public sessions back to Radio without a redirect loop", async () => {
  const base = snapshot();
  for (const raw of [snapshot({ session: null }), snapshot({ sessionActive: false }), snapshot({ session: { ...base.session, status: "archived" } }), snapshot({ session: { ...base.session, broadcastPhase: "ended" } }), snapshot({ session: { ...base.session, purpose: "rehearsal" } })]) {
    assert.equal((await route({ raw })).href, "/radio#queue-status");
  }
});

test("/queue rejects disabled anonymous access before reading the queue", async () => {
  assert.deepEqual(await route({ production: false }), { href: "/radio", reads: 0, sanitizations: 0 });
});

test("/queue returns failed reads to Radio's recoverable status view", async () => {
  assert.deepEqual(await route({ readFails: true }), { href: "/radio#queue-status", reads: 1, sanitizations: 0 });
});

test("/queue retains admin and exact current rehearsal access, with no privilege for stale or invalid tokens", async () => {
  const raw = snapshot({ session: { ...snapshot().session, sessionId: "private-night", purpose: "rehearsal" } });
  assert.deepEqual(await route({ raw, production: false, adminToken: "valid-admin" }), { href: "/queue/private-night", reads: 1, sanitizations: 0 });
  assert.deepEqual(await route({ raw, production: false, rehearsalToken: "signed:private-night" }), { href: "/queue/private-night", reads: 1, sanitizations: 0 });
  for (const rehearsalToken of ["signed:other-night", "invalid"]) assert.equal((await route({ raw, production: false, rehearsalToken })).href, "/radio");
  assert.equal((await route({ raw: { ...raw, sessionActive: false }, production: false, rehearsalToken: "signed:private-night" })).href, "/radio");
  assert.equal((await route({ raw: snapshot(), production: false, rehearsalToken: "signed:public-night" })).href, "/radio");
});

test("Radio's primary card renders a direct session link only from current public state", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const render = (radioQueueEntry) => {
    const { RadioQueueEntry } = load("src/components/RadioQueueEntry.tsx", {
      "next/link": ({ children, prefetch, ...props }) => { void prefetch; return React.createElement("a", props, children); },
      "@/components/LiveStatusProvider": { useLiveStatus: () => ({ radioQueueEntry, refreshQueueStatus: () => {} }) },
    });
    return renderToStaticMarkup(React.createElement(RadioQueueEntry));
  };
  assert.match(render(entry()), /href="\/queue\/public-night"/);
  assert.match(render(entry()), /Enter current queue/);
  assert.match(render(entry(snapshot({ status: { isOpen: false } }))), /View current queue/);
  assert.doesNotMatch(render(entry(snapshot({ session: null }))), /href="\/queue/);
  assert.match(render(entry(snapshot(), { readState: "unavailable" })), /Status unavailable/);
  assert.match(render(entry(snapshot(), { readState: "loading" })), /Checking the queue/);
  const source = fs.readFileSync(new URL("../src/components/RadioQueueEntry.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\(|setInterval|startSessionBoundPolling/, "the card must reuse the existing queue read");
  assert.equal(fs.existsSync(new URL("../src/components/PublicQueueGateway.tsx", import.meta.url)), false);
});
