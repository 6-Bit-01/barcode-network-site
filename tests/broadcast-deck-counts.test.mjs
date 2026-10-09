import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const filename = path.resolve(import.meta.dirname, "../src/components/BroadcastDeck.tsx");
const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const deck = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "BroadcastDeck");
assert.ok(deck?.body);
const declarations = deck.body.statements.filter(ts.isVariableStatement).flatMap((node) => [...node.declarationList.declarations]);
function initializer(name) {
  const declaration = declarations.find((node) => ts.isIdentifier(node.name) && node.name.text === name);
  assert.ok(declaration?.initializer, `missing Deck ${name}`);
  return declaration.initializer;
}
function evaluate(node, context) {
  const compiled = ts.transpileModule(`(${node.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(compiled, context);
}

test("Deck does not present queue capacity or terminal counts as full-show totals when stats are unavailable", () => {
  // Three submissions: one finished, one removed, one still active. The queue's
  // accepted count is capacity occupancy and deliberately excludes the removal.
  const snapshot = { session: { sessionId: "test-show", acceptedCount: 2, completedCount: 1, removedCount: 1 } };
  const liveTracks = [{ id: "waiting" }];
  for (const stats of [null, { currentShow: { sessionId: "previous-show", submittedTrackCount: 99, finishedTrackCount: 98 } }]) {
    const currentShow = evaluate(initializer("currentShow"), { stats, snapshot });
    const finishedCount = evaluate(initializer("finishedCount"), { currentShow, snapshot });
    const submittedCount = evaluate(initializer("submittedCount"), { currentShow, snapshot, liveTracks, finishedCount });
    assert.equal(submittedCount, null, "missing matching show totals must be unavailable, never 2 received");
    assert.equal(finishedCount, null, "terminal queue count cannot prove finished-play outcomes");
  }
  const stats = { currentShow: { sessionId: "test-show", submittedTrackCount: 3, finishedTrackCount: 1, removedTrackCount: 1 } };
  const currentShow = evaluate(initializer("currentShow"), { stats, snapshot });
  const finishedCount = evaluate(initializer("finishedCount"), { currentShow, snapshot });
  assert.equal(evaluate(initializer("submittedCount"), { currentShow, snapshot, liveTracks, finishedCount }), 3);
  assert.equal(finishedCount, 1);
  assert.equal(snapshot.session.acceptedCount, 2, "display logic must not change capacity accounting");
});

test("Deck clears stale totals after HTTP, network or malformed stats failures while refreshing the queue", async () => {
  const load = initializer("load");
  assert.ok(ts.isCallExpression(load));
  const snapshot = { session: { sessionId: "test-show", purpose: "live_broadcast" }, queue: [{ id: "waiting" }] };
  const freshStats = { currentShow: { sessionId: "test-show", submittedTrackCount: 3, removedTrackCount: 1 } };
  for (const failure of ["http", "network", "malformed", "none"]) {
    const observed = { stats: { currentShow: { sessionId: "test-show", submittedTrackCount: 3, removedTrackCount: 0 } } };
    const poll = evaluate(load.arguments[0], {
      window: { localStorage: { getItem: () => "" }, location: { search: "", origin: "https://barcode.test" } },
      URLSearchParams, previewMode: false, setArrival: () => {},
      queueEndpoint: "/api/queue", statsEndpoint: "/api/queue/stats",
      fetch: async (url) => {
        if (url === "/api/queue") return { ok: true, json: async () => snapshot };
        if (failure === "network") throw new Error("synthetic offline stats");
        return { ok: failure !== "http", json: async () => {
          if (failure === "malformed") throw new Error("synthetic invalid JSON");
          return freshStats;
        } };
      },
      setSnapshot: (value) => { observed.snapshot = value; },
      setStats: (value) => { observed.stats = value; },
      setLoadError: (value) => { observed.loadError = value; },
      setLoaded: () => {}, setClockNow: () => {},
      hasActiveQueueSession: (value) => Boolean(value.session),
    });
    assert.equal(await poll(), true, failure);
    assert.equal(observed.snapshot, snapshot, `${failure}: queue refresh must survive a stats failure`);
    assert.equal(observed.stats, failure === "none" ? freshStats : null, `${failure}: stale stats must not survive`);
    assert.equal(observed.loadError, false, failure);
  }
});

const endpointDeclaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "endpointWithParam");
const endpointWithParam = evaluate(endpointDeclaration, { URL, window: { location: { origin: "https://barcode.test" } } });

async function loadDeckSnapshot({ snapshot, stats = null, previewMode = false, search = "", token = "", queueEndpoint = "/api/queue", statsEndpoint = "/api/queue/stats" }) {
  const observed = { requests: [] };
  const load = initializer("load");
  const poll = evaluate(load.arguments[0], {
    window: { location: { search, origin: "https://barcode.test" }, localStorage: { getItem: () => token } },
    URLSearchParams, endpointWithParam, previewMode, queueEndpoint, statsEndpoint,
    fetch: async (url, options) => {
      observed.requests.push({ url, options });
      return { ok: true, json: async () => url.startsWith(statsEndpoint.split("?")[0]) ? stats : snapshot };
    },
    setSnapshot: (value) => { observed.snapshot = value; },
    setStats: (value) => { observed.stats = value; },
    setArrival: (value) => { observed.arrival = value; },
    setLoadError: (value) => { observed.loadError = value; },
    setLoaded: () => {}, setClockNow: () => {},
    hasActiveQueueSession: (value) => Boolean(value?.session),
  });
  observed.active = await poll();
  return observed;
}

test("Deck handoff scopes both existing reads to the exact requested session", async () => {
  const snapshot = { session: { sessionId: "show/October 9", purpose: "live_broadcast" }, queue: [] };
  const observed = await loadDeckSnapshot({ snapshot, search: "?sessionId=show%2FOctober+9&submitted=accepted-track", token: "browser-token" });
  assert.deepEqual(observed.requests.map(({ url }) => url), [
    "/api/queue?sessionId=show%2FOctober+9&submitterToken=browser-token",
    "/api/queue/stats?sessionId=show%2FOctober+9",
  ]);
  assert.equal(observed.requests[1].options.headers["x-barcode-submitter-token"], "browser-token");
  assert.equal(observed.snapshot, snapshot);
});

test("public Deck discards signed rehearsal and unknown-purpose snapshots including owned tracks", async () => {
  for (const purpose of ["rehearsal", "simulation", "internal_test", undefined]) {
    const snapshot = { session: { sessionId: "private-show", purpose }, queue: [{ id: "private-track" }], ownedTracks: [{ id: "private-own" }] };
    const observed = await loadDeckSnapshot({ snapshot, stats: { currentShow: { sessionId: "private-show" } } });
    assert.equal(observed.snapshot, null, purpose);
    assert.equal(observed.stats, null, purpose);
    assert.equal(observed.active, false, purpose);
    assert.equal(observed.loadError, false, purpose);
  }
});

test("private Deck preview retains its selected rehearsal and endpoint parameters", async () => {
  const snapshot = { session: { sessionId: "private-show", purpose: "rehearsal" }, queue: [{ id: "private-track" }] };
  const stats = { currentShow: { sessionId: "private-show" } };
  const observed = await loadDeckSnapshot({ snapshot, stats, previewMode: true, search: "?sessionId=public-query", token: "preview-token", queueEndpoint: "/api/admin/deck?sessionId=private-show", statsEndpoint: "/api/admin/stats?sessionId=private-show" });
  assert.equal(observed.snapshot, snapshot);
  assert.equal(observed.stats, stats);
  assert.deepEqual(observed.requests.map(({ url }) => url), ["/api/admin/deck?sessionId=private-show&submitterToken=preview-token", "/api/admin/stats?sessionId=private-show"]);
});

test("Deck does not silently substitute another live show for a requested handoff", async () => {
  const observed = await loadDeckSnapshot({ snapshot: { session: { sessionId: "different-show", purpose: "live_broadcast" } }, search: "?sessionId=requested-show&submitted=track-1" });
  assert.equal(observed.snapshot, null);
  assert.equal(observed.stats, null);
  assert.equal(observed.active, false);
});
