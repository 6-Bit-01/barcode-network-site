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
let balladFixture = null;
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "@/lib/bnl-ballads-store" && balladFixture) return { listPublicBallads: async shows => shows.map(show => ({ show, ...balladFixture })) };
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
    discordConnectionId: "private-discord-reference",
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
    headers: authenticated ? { "x-api-key": typeof authenticated === "string" ? authenticated : "snapshot-service-key" } : {},
  }));
  assert.equal(response.status, 200);
  return { response, body: await response.json() };
}

function assertSanitized(body) {
  const text = JSON.stringify(body);
  for (const secret of ["private@example.test", "private-submitter-token", "private-note",
    "https://private.example.test/hidden.mp3", "private-discord-reference", "discordConnectionId"]) assert.ok(!text.includes(secret), secret);
  assert.equal(body.mutationAllowed, false);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("one queue read supplies live state, show log, archive, public history, and artist memory", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(fixedNow) });
  const { route } = loadHarness();
  const before = FakeRedis.raw;
  const { body } = await request(route, true);
  assert.equal(body.sections.queue.available, true);
  assert.equal(body.sections.archive.available, true);
  assert.equal(body.sections.artistMemory.available, true);
  assert.equal(body.sections.queue.operationalEventsSourceRevision, 12);
  assert.equal(body.sections.archive.sourceRevision, 12);
  assert.equal(body.sections.publicHistory.sourceRevision, 12);
  assert.equal(body.sections.publicHistory.available, true);
  assert.deepEqual(body.sections.publicHistory.shows, [body.sections.archive.currentShow, ...body.sections.archive.shows]);
  assert.equal(body.sections.publicHistory.currentSessionId, "current");
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
    assert.equal(body.sections.publicHistory.available, true);
    assert.equal(body.sections.publicHistory.accessScope, "public");
    assert.equal(body.sections.publicHistory.sourceRevision, revision);
    assert.ok(body.sections.publicHistory.shows.some((show) => show.sessionId === "history"));
    assert.equal(body.sections.publicHistory.shows.some((show) => show.sessionId === id), expectedScope === "public");
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
    assert.equal(body.sections.publicHistory.sourceRevision, 30 + i);
    assert.equal(body.sections.publicHistory.currentSessionId, scope === "public" ? "public30" : null);
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
  for (const section of [body.sections.archive, body.sections.publicHistory, body.sections.artistMemory]) {
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
        assert.equal(body.sections.publicHistory.available, true);
        assert.equal(body.sections.artistMemory.available, true);
      } else {
        assert.equal(body.sections.queue.operationalEventsSourceRevision, 12);
        for (const section of [body.sections.archive, body.sections.publicHistory, body.sections.artistMemory]) {
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


test("public history remains independently public during private rehearsal and invalid-key reads", async () => {
  const store = fixture(40, "runtime_only", "sealed-current");
  store.sessions[0].purpose = "rehearsal";
  for (const [id, purpose, publication, showDate] of [
    ["sealed-archive", "rehearsal", "runtime_only", "2026-09-15"],
    ["no-access", "live_broadcast", "private", "2026-09-14"],
    ["simulation", "simulation", "public_copy_approved", "2026-09-13"],
    ["internal", "internal_test", "runtime_only", "2026-09-12"],
    ["legacy", "unknown", "public_copy_approved", "2026-09-11"],
    ["before-coverage", "live_broadcast", "public_copy_approved", "2026-08-23"],
  ]) store.sessions.push(session(id, publication, { purpose, showDate, status: "archived" }));
  store.sessions.push(session("older-public", "recap_approved", { status: "archived", showDate: "2026-09-04" }));
  const { route } = loadHarness(store);
  let publicHistory;
  for (const token of [false, true, "invalid-key"]) {
    const { body, response } = await request(route, token);
    const history = body.sections.publicHistory;
    assert.equal(body.accessScope, token === true ? "private" : "none");
    assert.equal(body.sections.archive.available, token === true);
    assert.equal(history.available, true);
    assert.equal(history.reason, null);
    assert.equal(history.schemaVersion, "queue_bnl_public_history_v1");
    assert.equal(history.source, "queue_bnl_public_history_projection");
    assert.equal(history.visibility, "public_safe");
    assert.equal(history.accessScope, "public");
    assert.equal(history.publicOnly, true);
    assert.equal(history.mutationAllowed, false);
    assert.equal(history.memoryDefault, "do_not_store");
    assert.equal(history.sourceFileDefault, "review_evidence_only");
    assert.equal(history.publicDossierDefault, "not_automatic");
    assert.equal(history.historyCoverageStartedAt, "2026-08-24");
    assert.equal(history.currentSessionId, null);
    assert.deepEqual(history.shows.map((show) => show.sessionId), ["history", "older-public"]);
    assert.match(history.sourceDigest, /^[a-f0-9]{64}$/);
    assert.equal(history.sourceRevision, 40);
    if (publicHistory) assert.deepEqual(history, publicHistory);
    publicHistory = history;
    for (const key of ["currentShow", "latestShow", "artists", "recentEvents", "personalHistory", "overview"]) {
      assert.equal(Object.hasOwn(history, key), false, "compact history must not duplicate show or artist collections");
    }
    assertSanitized(body);
    assert.match(response.headers.get("vary"), /x-api-key/i);
    if (token === true) assert.match(response.headers.get("cache-control"), /no-store/);
    else assert.match(response.headers.get("cache-control"), body.sections.ballads.available ? /public/ : /no-store/);
    if (token === true) assert.match(response.headers.get("x-robots-tag"), /noindex/);
  }
  assert.equal(FakeRedis.reads, 3);
  store.revision += 1;
  store.sessions[0].title = "Changed private rehearsal";
  store.sessions[0].updatedAt = "2026-09-15T21:00:00.000Z";
  FakeRedis.raw = JSON.stringify(store);
  const afterPrivateChange = (await request(route, true)).body.sections.publicHistory;
  assert.equal(afterPrivateChange.sourceRevision, 41);
  assert.equal(afterPrivateChange.sourceDigest, publicHistory.sourceDigest);
  assert.equal(afterPrivateChange.builtAt, publicHistory.builtAt);
  store.revision += 1;
  store.sessions[1].completed[0].submittedSongTitle = "Corrected public title";
  FakeRedis.raw = JSON.stringify(store);
  const corrected = (await request(route)).body.sections.publicHistory;
  assert.notEqual(corrected.sourceDigest, publicHistory.sourceDigest);
  assert.equal(corrected.shows[0].trackRoster[0].title, "Corrected public title");
  store.revision += 1;
  store.sessions[1].bnlPublicationStatus = "private";
  FakeRedis.raw = JSON.stringify(store);
  const revoked = (await request(route)).body.sections.publicHistory;
  assert.notEqual(revoked.sourceDigest, corrected.sourceDigest);
  assert.deepEqual(revoked.shows.map((show) => show.sessionId), ["older-public"]);
});

test("public history preserves sanitized chronology without simulation or upload leakage", async () => {
  const store = fixture();
  const simulated = { ...track("simulation-secret"), isTestTrack: true };
  const uploaded = { ...track("upload"), sourceType: "upload" };
  store.sessions[1].queue = [simulated, uploaded];
  store.sessions[1].completed[0].playbackOutcome = "finished";
  store.sessions[1].completed[0].completedAt = fixedNow;
  store.sessions[1].removed = [{ ...track("removed"), status: "removed", removedAt: fixedNow }];
  store.sessions[1].showLog = [
    { sequence: 1, eventType: "broadcast_started", occurredAt: fixedNow, track: null, details: null },
    { sequence: 2, eventType: "track_submitted", occurredAt: fixedNow, track: { trackId: simulated.id, artist: simulated.artist, title: simulated.title }, details: null },
    { sequence: 3, eventType: "track_finished", occurredAt: fixedNow, track: { trackId: "historical", artist: "Artist historical", title: "Song historical", submissionOrder: 1, playedOrder: 1 }, details: null },
  ];
  const { route } = loadHarness(store);
  const { body } = await request(route);
  const history = body.sections.publicHistory;
  const show = history.shows.find((show) => show.sessionId === "history");
  assert.deepEqual(show, body.sections.archive.shows[0], "shared public projection must preserve the existing chronology and credits");
  assert.equal(show.submittedTrackCount, 3);
  assert.equal(show.removedTrackCount, 1);
  assert.equal(show.finishedTrackCount, 1);
  assert.equal(show.trackRoster.find((track) => track.trackId === "upload").publicSourceUrl, null);
  assert.equal(show.trackRoster.find((track) => track.trackId === "removed").outcome, "removed");
  assert.deepEqual(show.milestones.map((event) => event.sequence), [1, 3]);
  assert.equal(show.milestones[1].track.playedOrder, 1);
  assert.equal(JSON.stringify(history).includes("simulation-secret"), false);
  assert.equal(new Set(history.shows.map((show) => show.sessionId)).size, history.shows.length);
  assertSanitized(body);
  assert.equal(FakeRedis.reads, 1);
});

test("disabled production keeps public history unavailable without reading the queue", async (t) => {
  const previous = process.env.BARCODE_QUEUE_PRODUCTION_ENABLED;
  process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "false";
  t.after(() => { process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = previous; });
  const { route } = loadHarness();
  const { body } = await request(route, true);
  const history = body.sections.publicHistory;
  assert.equal(history.available, false);
  assert.equal(history.reason, "queue_production_disabled");
  assert.equal(history.schemaVersion, "queue_bnl_public_history_v1");
  assert.equal(history.sourceRevision, null);
  assert.equal(history.sourceDigest, null);
  assert.equal(history.builtAt, null);
  assert.equal(history.currentSessionId, null);
  assert.deepEqual(history.shows, []);
  assert.equal(FakeRedis.reads, 0);
});

test("an empty public history is available and sealed without exposing a hidden current session", async () => {
  const store = fixture(50, "private", "hidden");
  store.sessions = [store.sessions[0]];
  const { route } = loadHarness(store);
  const { body } = await request(route);
  const history = body.sections.publicHistory;
  assert.equal(history.available, true);
  assert.equal(history.reason, null);
  assert.equal(history.sourceRevision, 50);
  assert.match(history.sourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(history.builtAt, null);
  assert.equal(history.currentSessionId, null);
  assert.deepEqual(history.shows, []);
  assert.equal(JSON.stringify(history).includes("hidden"), false);
  assert.equal(FakeRedis.reads, 1);
});

test("published song awareness shares public show eligibility and exposes metadata only", async () => {
  balladFixture = { version: { title: "Released song", lyrics: "PRIVATE_CREATIVE_TEXT", rawOutput: "RAW_OUTPUT" }, presentation: { credits: "BNL-01" }, audioId: "take-1" };
  try {
    const store = fixture();
    store.sessions.push(session("sealed", "private_only", { purpose: "rehearsal", status: "archived" }));
    const { route } = loadHarness(store);
    const { body } = await request(route);
    assert.equal(FakeRedis.reads, 1);
    assert.equal(body.sections.ballads.available, true);
    assert.deepEqual(body.sections.ballads.songs.map(song => song.showId), ["history"]);
    assert.equal(body.sections.ballads.songs[0].title, "Released song");
    assert.match(body.sections.ballads.songs[0].url, /radio\/archive\?view=shows&show=history#broadcast-ballad$/);
    assert.ok(!JSON.stringify(body).includes("PRIVATE_CREATIVE_TEXT"));
    assert.ok(!JSON.stringify(body).includes("RAW_OUTPUT"));
  } finally { balladFixture = null; }
});

test("show-log normalization does not multiply with the number of projected tracks", async (t) => {
  const log = require(path.join(projectRoot, "src/lib/queue-show-log.ts"));
  const normalize = log.normalizeQueueShowLog;
  let calls = 0;
  t.mock.method(log, "normalizeQueueShowLog", (value) => {
    calls += 1;
    return normalize(value);
  });
  const measurements = [];
  for (const count of [1, 48]) {
    const tracks = Array.from({ length: count }, (_,i) => ({
      ...track(`performance-${i}`), status: "played", playbackOutcome: "finished",
      completedAt: fixedNow,
    }));
    const history = session("history", "public_copy_approved", {
      status: "archived", queueOpen: false, queue: [], completed: tracks,
      showLog: Array.from({ length: 48 }, (_,i) => ["track_submitted", "track_play_started", "track_finished"].map((eventType, j) => ({
        sequence: i * 3 + j + 1, eventType, occurredAt: fixedNow,
        track: { trackId: `performance-${i}`, artist: `Artist performance-${i}`, title: `Song performance-${i}` },
        details: null,
      }))).flat(),
    });
    const { queue } = loadHarness({ revision: 50, activeSessionId: null, sessions: [history] });
    calls = 0;
    const snapshot = await queue.getQueueBnlReadSnapshot();
    const projections = await snapshot.getProjections("public");
    const balladShows = snapshot.getPublicBalladShows();
    assert.equal(projections.publicHistory.shows[0].trackRoster.length, count);
    assert.equal(projections.artistMemory.records.length, count);
    assert.equal(balladShows.length, 1);
    measurements.push(calls);
  }
  assert.ok(measurements[1] <= measurements[0] * 2,
    `48 tracks must not repeatedly normalize the same log: ${measurements.join(" -> ")} calls`);
});

test("track event lookups retain normalization, latest sequence, earliest play, and fresh corrections", async () => {
  const item = { ...track("event-track"), status: "played", playbackOutcome: "finished", completedAt: fixedNow };
  const at = minute => `2026-09-10T23:${String(minute).padStart(2, "0")}:00.000Z`;
  const event = (sequence, eventType, minute, id = item.id) => ({
    sequence, eventType, occurredAt: at(minute),
    track: { trackId: id, artist: item.artist, title: item.title }, details: null,
  });
  const history = session("history", "public_copy_approved", {
    status: "archived", queueOpen: false, queue: [], completed: [item],
    showLog: [event(8, "track_finished", 50), event(2, "track_play_started", 20),
      event(1, "track_submitted", 1), event(3, "track_play_started", 10),
      event(7, "track_finished", 40), event(6, "track_submitted", 30),
      event(8, "track_removed", 55), event(9, "track_finished", 59, "another-track"),
      { ...event(99, "track_finished", 50), occurredAt: "invalid" }],
  });
  const store = { revision: 60, activeSessionId: null, sessions: [history] };
  const { queue } = loadHarness(store);
  const first = await queue.getQueueBnlReadProjections("public");
  const projected = first.publicHistory.shows[0].trackRoster[0];
  assert.equal(projected.submissionEventSequence, 6);
  assert.equal(projected.outcomeEventSequence, 8);
  assert.equal(projected.broadcastEvidence, "playback_recorded");
  assert.equal(first.artistMemory.records[0].lifecycle.playedAt, at(10));
  assert.equal(JSON.stringify(first).includes('"trackEvents"'), false);
  assert.equal(first.publicHistory.shows[0].milestones.some(e => e.sequence === 99), false);
  assert.deepEqual(first.archive.shows[0], first.publicHistory.shows[0]);
  history.showLog = [event(1, "track_submitted", 1), event(10, "track_finished", 45)];
  FakeRedis.raw = JSON.stringify({ ...store, revision: 61 });
  const corrected = await queue.getQueueBnlReadProjections("public");
  assert.equal(corrected.publicHistory.shows[0].trackRoster[0].outcomeEventSequence, 10);
  assert.equal(corrected.publicHistory.shows[0].trackRoster[0].broadcastEvidence, "external_host_finished");
  assert.equal(corrected.artistMemory.records[0].lifecycle.playedAt, null);
  assert.equal(corrected.artistMemory.records[0].lifecycle.memoryState, "provisional");
  assert.notEqual(corrected.publicHistory.sourceDigest, first.publicHistory.sourceDigest);
  history.completed[0].playedAt = at(25);
  FakeRedis.raw = JSON.stringify({ ...store, revision: 62 });
  const explicit = await queue.getQueueBnlReadProjections("public");
  assert.equal(explicit.artistMemory.records[0].lifecycle.playedAt, at(25));
});

test("read-model phase timings require the service credential and retain no-store", async () => {
  const { route } = loadHarness();
  for (const token of [false, "invalid-key", true]) {
    const { response, body } = await request(route, token);
    const timing = response.headers.get("server-timing");
    assertSanitized(body);
    assert.equal(body.schemaRevision, "1.11");
    if (token !== true) {
      assert.equal(timing, null);
      continue;
    }
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(response.headers.get("vary"), /x-api-key/i);
    const phases = timing.split(", ").map(metric => {
      assert.match(metric, /^(queue_snapshot|live_queue|projections|ballads|render|total);dur=\d+\.\d{2}$/);
      return metric.split(";")[0];
    });
    assert.deepEqual(phases, ["queue_snapshot", "live_queue", "projections", "ballads", "render", "total"]);
    assert.equal(Object.hasOwn(body, "timings"), false);
  }
  const { route: failingRoute } = loadHarness();
  FakeRedis.takeRead = () => { throw new Error("queue unavailable"); };
  const { response, body } = await request(failingRoute, true);
  assert.equal(body.sections.queue.available, false);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(response.headers.get("server-timing"), /^queue_snapshot;dur=/);
  assert.doesNotMatch(response.headers.get("server-timing"), /live_queue|projections|unavailable/);
});
