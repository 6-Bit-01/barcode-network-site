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
  const snapshot = { session: { sessionId: "test-show" }, queue: [{ id: "waiting" }] };
  const freshStats = { currentShow: { sessionId: "test-show", submittedTrackCount: 3, removedTrackCount: 1 } };
  for (const failure of ["http", "network", "malformed", "none"]) {
    const observed = { stats: { currentShow: { sessionId: "test-show", submittedTrackCount: 3, removedTrackCount: 0 } } };
    const poll = evaluate(load.arguments[0], {
      window: { localStorage: { getItem: () => "" } },
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
