import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const stateKey = "radioQueue:v2:sessions";
const fixedNow = "2026-09-11T02:50:00.000Z";

// Exercise the real queue reader, projections, and endpoint without remote I/O.
process.env.QUEUE_REDIS_REST_URL = "https://queue-snapshot.test";
process.env.QUEUE_REDIS_REST_TOKEN = "snapshot-test-token";
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
process.env.BNL_API_KEY = "snapshot-service-key";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.BLOB_READ_WRITE_TOKEN;

class FakeRedis {
  static raw = null;
  static reads = 0;
  static takeRead = null;

  async get(key) {
    assert.equal(key, stateKey, "fixture has a current store; no legacy fallback needed");
    FakeRedis.reads += 1;
    return FakeRedis.takeRead ? FakeRedis.takeRead() : FakeRedis.raw;
  }

  async set() { assert.fail("read-model must not write Redis"); }
  async eval() { assert.fail("read-model must not mutate the queue"); }
}

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const resolved = path.join(projectRoot, "src", request.slice(2));
    return fs.existsSync(resolved) ? resolved : `${resolved}.ts`;
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "@upstash/redis") return { Redis: FakeRedis };
  return originalLoad.call(this, request, parent, isMain);
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

function loadHarness(store = fixture()) {
  FakeRedis.raw = JSON.stringify(store);
  FakeRedis.reads = 0;
  FakeRedis.takeRead = null;
  for (const relative of ["src/lib/queue.ts", "src/lib/queue-durable-snapshot.ts",
    "src/lib/live-overlay.ts", "src/app/api/bnl/read-model/route.ts"]) {
    delete require.cache[path.join(projectRoot, relative)];
  }
  return {
    queue: require(path.join(projectRoot, "src/lib/queue.ts")),
    route: require(path.join(projectRoot, "src/app/api/bnl/read-model/route.ts")),
  };
}

function track(id) {
  return {
    id, artist: `Artist ${id}`, title: `Song ${id}`,
    submittedArtistName: `Artist ${id}`, submittedSongTitle: `Song ${id}`,
    tiktokHandle: `@${id}`, link: `https://example.test/${id}`,
    sourceType: "other", tier: "free", lane: "regular", amount: 0,
    createdAt: "2026-09-10T23:00:00.000Z", status: "queued",
    contactEmail: "private@example.test", submitterToken: "private-submitter-token",
    adminNote: "private-note", fileUrl: "https://private.example.test/hidden.mp3",
  };
}

function session(id, publication = "public_copy_approved", overrides = {}) {
  return {
    sessionId: id, title: `Show ${id}`, status: "open", purpose: "live_broadcast",
    bnlPublicationStatus: publication, showDate: "2026-09-10",
    createdAt: "2026-09-10T22:00:00.000Z", updatedAt: "2026-09-10T23:00:00.000Z",
    queueOpen: true, showStarted: false, preShowEndsAt: "2026-09-10T22:20:15.000Z",
    nextNonPriorityLane: "regular", queue: [track(id)], completed: [], removed: [],
    ...overrides,
  };
}

function fixture(revision = 12, publication = "public_copy_approved", id = "current") {
  return {
    revision, activeSessionId: id,
    sessions: [session(id, publication), session("history", "public_copy_approved", {
      status: "archived", queueOpen: false, queue: [], completed: [{
        ...track("historical"), status: "played", playedAt: "2026-09-10T23:30:00.000Z",
      }],
    })],
  };
}

async function request(route, authenticated = false) {
  const response = await route.GET(new Request("https://example.test/api/bnl/read-model", {
    headers: authenticated ? { "x-api-key": "snapshot-service-key" } : {},
  }));
  assert.equal(response.status, 200);
  return { response, body: await response.json() };
}

function assertSanitized(body) {
  const text = JSON.stringify(body);
  for (const secret of ["private@example.test", "private-submitter-token", "private-note",
    "https://private.example.test/hidden.mp3"]) assert.ok(!text.includes(secret), secret);
  assert.equal(body.mutationAllowed, false);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("one queue read supplies live state, show log, archive, and artist memory", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(fixedNow) });
  const { route } = loadHarness();
  const before = FakeRedis.raw;
  const { body } = await request(route, true);
  assert.equal(body.sections.queue.available, true);
  assert.equal(body.sections.archive.available, true);
  assert.equal(body.sections.artistMemory.available, true);
  assert.equal(body.sections.queue.operationalEventsSourceRevision, 12);
  assert.equal(body.sections.archive.sourceRevision, 12);
  assert.equal(body.sections.artistMemory.sourceRevision, 12);
  assert.equal(FakeRedis.raw, before, "timer-derived live state must not persist a mutation");
  assertSanitized(body);
  assert.equal(FakeRedis.reads, 1, "one response must read the queue store only once");
});

test("snapshot projections match established getters and preserve the captured source", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(fixedNow) });
  const store = fixture();
  store.sessions[0].sponsorBreakStatus = "running";
  store.sessions[0].sponsorBreakStartedAt = "2026-09-11T02:00:00.000Z";
  const { queue } = loadHarness(store);
  const source = FakeRedis.raw;
  const expectedState = await queue.getRadioQueueState();
  assert.equal(expectedState.session.sponsorBreakStatus, "completed");
  assert.equal(JSON.parse(source).sessions[0].sponsorBreakStatus, "running");
  const expectedLog = await queue.getQueueSessionShowLog("current");
  const expectedProjections = new Map();
  for (const scope of ["public", "private", null]) {
    expectedProjections.set(scope, await queue.getQueueBnlReadProjections(scope));
  }
  FakeRedis.reads = 0;
  const snapshot = await queue.getQueueBnlReadSnapshot();
  assert.deepEqual(await snapshot.getState(), expectedState);
  assert.deepEqual(await snapshot.getShowLog("current"), expectedLog);
  for (const scope of ["public", "private", null]) {
    assert.deepEqual(await snapshot.getProjections(scope), expectedProjections.get(scope));
  }
  assert.equal(FakeRedis.reads, 1);
  assert.equal(FakeRedis.raw, source);
  FakeRedis.raw = JSON.stringify(fixture(13, "private", "replacement"));
  assert.deepEqual(await snapshot.getState(), expectedState, "later source revision cannot replace this request's state");
  assert.deepEqual(await snapshot.getShowLog("current"), expectedLog);
  assert.equal(FakeRedis.reads, 1);
});

test("each request sees the new revision and current public/private/no-access decision", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(fixedNow) });
  const { route } = loadHarness();
  for (const [revision, publication, authenticated, expectedScope] of [
    [20, "public_copy_approved", false, "public"],
    [21, "runtime_only", false, "none"],
    [22, "runtime_only", true, "private"],
    [23, "private", true, "none"],
  ]) {
    const id = `session${revision}`;
    FakeRedis.raw = JSON.stringify(fixture(revision, publication, id));
    const { response, body } = await request(route, authenticated);
    assert.equal(body.accessScope, expectedScope);
    assert.equal(body.sections.queue.available, expectedScope !== "none");
    assert.equal(body.sections.artistMemory.sourceRevision, revision);
    assert.ok(body.sections.artistMemory.records.some((record) => record.track.title === "Song historical"));
    if (expectedScope === "none") {
      assert.equal(body.sections.archive.available, false);
      assert.ok(!JSON.stringify(body).includes(`Song ${id}`));
    } else {
      assert.equal(body.sections.queue.session.sessionId, id);
      assert.equal(body.sections.queue.operationalEventsSourceRevision, revision);
      assert.equal(body.sections.archive.sourceRevision, revision);
    }
    if (authenticated) assert.match(response.headers.get("cache-control"), /no-store/);
    assertSanitized(body);
  }
  assert.equal(FakeRedis.reads, 4);
});

test("overlapping requests keep separate revisions and authorization scopes", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(fixedNow) });
  const { route } = loadHarness();
  const reads = [deferred(), deferred(), deferred()];
  let index = 0;
  FakeRedis.takeRead = () => {
    assert.ok(index < reads.length, "overlapping requests must not perform follow-up queue reads");
    return reads[index++].promise;
  };
  const pending = [request(route, false), request(route, true), request(route, false)];
  assert.equal(index, 3);
  reads[1].resolve(JSON.stringify(fixture(31, "runtime_only", "private31")));
  reads[2].resolve(JSON.stringify(fixture(32, "runtime_only", "hidden32")));
  reads[0].resolve(JSON.stringify(fixture(30, "public_copy_approved", "public30")));
  const results = await Promise.all(pending);
  for (const [i, scope] of ["public", "private", "none"].entries()) {
    const { body } = results[i];
    assert.equal(body.accessScope, scope);
    assert.equal(body.sections.artistMemory.sourceRevision, 30 + i);
    if (scope !== "none") assert.equal(body.sections.queue.operationalEventsSourceRevision, 30 + i);
    assertSanitized(body);
  }
  assert.ok(!JSON.stringify(results[0].body).includes("private31"));
  assert.ok(!JSON.stringify(results[2].body).includes("hidden32"));
  assert.equal(FakeRedis.reads, 3);
});

test("failed initial queue read keeps nonqueue context and unavailable durable envelopes", async () => {
  const { route } = loadHarness();
  FakeRedis.takeRead = () => { throw new Error("queue unavailable"); };
  const { response, body } = await request(route);
  assert.equal(FakeRedis.reads, 1);
  assert.equal(body.sections.queue.available, false);
  for (const section of [body.sections.archive, body.sections.artistMemory]) {
    assert.equal(section.available, false);
    assert.equal(section.reason, "queue_projection_unavailable");
    assert.equal(section.sourceRevision, null);
    assert.equal(section.sourceDigest, null);
  }
  assert.ok(body.sections.dossiers.items.length > 0);
  assert.ok(body.sections.sourceContext.length > 0);
  assert.match(response.headers.get("cache-control"), /no-store/);
});


test("derived show-log and durable projection failures keep their separate envelopes", async (t) => {
  for (const method of ["getShowLog", "getProjections"]) {
    await t.test(method, async (t) => {
      const { route, queue } = loadHarness();
      const original = queue.getQueueBnlReadSnapshot;
      queue.getQueueBnlReadSnapshot = async () => ({
        ...await original(),
        [method]: async () => { throw new Error("derived projection unavailable"); },
      });
      t.after(() => { queue.getQueueBnlReadSnapshot = original; });
      const { response, body } = await request(route);
      assert.equal(FakeRedis.reads, 1);
      assert.equal(body.sections.queue.available, true);
      assert.ok(body.sections.dossiers.items.length > 0);
      assert.ok(body.sections.sourceContext.length > 0);
      if (method === "getShowLog") {
        assert.equal(body.sections.queue.operationalEventsSourceRevision, null);
        assert.equal(body.sections.archive.available, true);
        assert.equal(body.sections.artistMemory.available, true);
      } else {
        assert.equal(body.sections.queue.operationalEventsSourceRevision, 12);
        for (const section of [body.sections.archive, body.sections.artistMemory]) {
          assert.equal(section.available, false);
          assert.equal(section.reason, "queue_projection_unavailable");
          assert.equal(section.sourceRevision, null);
        }
        assert.match(response.headers.get("cache-control"), /no-store/);
      }
      assertSanitized(body);
    });
  }
});
