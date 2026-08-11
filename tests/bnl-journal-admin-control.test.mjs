import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const require = createRequire(import.meta.url);

function loadTs(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const cjsModule = { exports: {} };
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === "crypto")
      return {
        createHash: require("node:crypto").createHash,
        randomUUID: () => "00000000-0000-4000-8000-000000000001",
      };
    return require(id);
  };
  vm.runInNewContext(
    code,
    {
      require: localRequire,
      module: cjsModule,
      exports: cjsModule.exports,
      process,
      console,
      JSON,
      Date,
      Set,
      Promise,
    },
    { filename: file },
  );
  return cjsModule.exports;
}

const store = loadTs("src/lib/bnl-journal-control-store.ts", {
  "@/lib/bnl-journal-store": {
    getBNLJournalRedis: () => null,
    listJournalEntryControls: async () => [],
  },
});

class FakeRedis {
  kv = new Map();
  calls = [];

  async get(key) {
    this.calls.push(["get", key]);
    return this.kv.get(key) ?? null;
  }

  async set(key, value) {
    this.calls.push(["set", key]);
    this.kv.set(key, value);
    return "OK";
  }

  async eval(_script, keys, args) {
    if (keys.length === 3) {
      this.calls.push(["eval-report"]);
      const run = JSON.parse(args[0]);
      const terminal = args[1] === "1";
      const requests = [...(this.kv.get(keys[0]) ?? [])];
      const remaining =
        terminal && run.requestId
          ? requests.filter((item) => item.requestId !== run.requestId)
          : requests;
      const previousRuns = [...(this.kv.get(keys[1]) ?? [])];
      const recentRuns = [
        run,
        ...previousRuns.filter(
          (item) =>
            item.runId !== run.runId ||
            (run.state === "backoff" &&
              (item.state === "held" || item.state === "delivery_failed")),
        ),
      ].slice(0, Number(args[2]));
      const previousTelemetry = { ...(this.kv.get(keys[2]) ?? {}) };
      const telemetry = {
        ...previousTelemetry,
        observedAt: run.occurredAt,
        automationStatus:
          run.state === "failed" || run.state === "delivery_failed"
            ? "degraded"
            : previousTelemetry.automationStatus ?? "online",
        lastRun: run,
      };
      if (run.detail) telemetry.detail = run.detail;
      else delete telemetry.detail;
      this.kv.set(keys[0], remaining);
      this.kv.set(keys[1], recentRuns);
      this.kv.set(keys[2], telemetry);
      return JSON.stringify({ run });
    }

    if (keys[0] === store.BNL_FLAGS_KEY && args.length === 1) {
      this.calls.push(["eval-flags"]);
      const merged = {
        ...(this.kv.get(keys[0]) ?? {}),
        ...JSON.parse(args[0]),
      };
      this.kv.set(keys[0], merged);
      return JSON.stringify(merged);
    }

    const key = keys[0];
    const items = [...(this.kv.get(key) ?? [])];
    if (args.length === 3 && (args[0] === "daily" || args[0] === "weekly")) {
      this.calls.push(["eval-enqueue"]);
      const [cadence, requestJson, maxItems] = args;
      const existing = items.find(
        (item) =>
          item.cadence === cadence &&
          (item.status === "queued" || item.status === "running"),
      );
      if (existing)
        return JSON.stringify({ status: "idempotent", request: existing });
      const request = JSON.parse(requestJson);
      items.push(request);
      this.kv.set(key, items.slice(-Number(maxItems)));
      return JSON.stringify({ status: "created", request });
    }
    this.calls.push(["eval-claim"]);
    const [requestId, claimedAt, claimToken, claimedAtEpochMs, leaseCutoffMs] =
      args;
    const request = items.find((item) => item.requestId === requestId);
    if (!request) return JSON.stringify({ status: "missing" });
    if (request.status === "running") {
      if (request.claimToken === claimToken)
        return JSON.stringify({ status: "idempotent", request });
      if (Number(request.claimedAtEpochMs ?? 0) <= Number(leaseCutoffMs)) {
        request.claimedAt = claimedAt;
        request.claimToken = claimToken;
        request.claimedAtEpochMs = Number(claimedAtEpochMs);
        this.kv.set(key, items);
        return JSON.stringify({ status: "reclaimed", request });
      }
      return JSON.stringify({ status: "conflict" });
    }
    request.status = "running";
    request.claimedAt = claimedAt;
    request.claimToken = claimToken;
    request.claimedAtEpochMs = Number(claimedAtEpochMs);
    this.kv.set(key, items);
    return JSON.stringify({ status: "claimed", request });
  }
}

test("journal config preserves existing relay flags and defaults automation on", async () => {
  const redis = new FakeRedis();
  await redis.set(store.BNL_FLAGS_KEY, {
    websiteRelayEnabled: false,
    heartbeatEnabled: true,
  });
  const initial = await store.readJournalControlState(redis);
  assert.deepEqual(JSON.parse(JSON.stringify(initial.config)), {
    journalAutoPublishEnabled: true,
    journalDailyEnabled: true,
    journalWeeklyEnabled: true,
  });
  await store.writeJournalAutomationConfig(
    {
      journalAutoPublishEnabled: false,
      journalDailyEnabled: true,
      journalWeeklyEnabled: false,
    },
    redis,
  );
  assert.equal((await redis.get(store.BNL_FLAGS_KEY)).websiteRelayEnabled, false);
  assert.equal(
    (await redis.get(store.BNL_FLAGS_KEY)).journalWeeklyEnabled,
    false,
  );
  assert.equal(
    redis.calls.filter(([name]) => name === "eval-flags").length,
    1,
  );
  await store.mergeBNLFlagsAtomic({ heartbeatEnabled: false }, redis);
  const merged = await redis.get(store.BNL_FLAGS_KEY);
  assert.equal(merged.heartbeatEnabled, false);
  assert.equal(merged.journalAutoPublishEnabled, false);
  assert.equal(merged.journalWeeklyEnabled, false);
});

test("run requests deduplicate by cadence, claim atomically, and clear on terminal report", async () => {
  const redis = new FakeRedis();
  const first = await store.enqueueJournalRunRequest("daily", redis);
  const duplicate = await store.enqueueJournalRunRequest("daily", redis);
  assert.equal(first.idempotent, false);
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.request.requestId, first.request.requestId);

  const claimedAt = "2026-07-19T00:00:00.000Z";
  const claimed = await store.claimJournalRunRequest(
    first.request.requestId,
    claimedAt,
    "worker-token-one",
    redis,
  );
  assert.equal(claimed.request.status, "running");
  assert.equal(claimed.idempotent, false);
  assert.equal(claimed.reclaimed, false);
  const sameOwnerRetry = await store.claimJournalRunRequest(
    first.request.requestId,
    claimedAt,
    "worker-token-one",
    redis,
  );
  assert.equal(sameOwnerRetry.idempotent, true);
  const competingClaim = await store.claimJournalRunRequest(
    first.request.requestId,
    claimedAt,
    "worker-token-two",
    redis,
  );
  assert.equal(competingClaim.conflict, true);

  const takeover = await store.claimJournalRunRequest(
    first.request.requestId,
    "2026-07-19T00:31:00.000Z",
    "worker-token-two",
    redis,
  );
  assert.equal(takeover.idempotent, false);
  assert.equal(takeover.reclaimed, true);
  assert.equal(takeover.request.claimedAt, "2026-07-19T00:31:00.000Z");
  const formerOwner = await store.claimJournalRunRequest(
    first.request.requestId,
    "2026-07-19T00:31:01.000Z",
    "worker-token-one",
    redis,
  );
  assert.equal(formerOwner.conflict, true);
  const newOwnerRetry = await store.claimJournalRunRequest(
    first.request.requestId,
    "2026-07-19T00:31:01.000Z",
    "worker-token-two",
    redis,
  );
  assert.equal(newOwnerRetry.idempotent, true);
  assert.equal(newOwnerRetry.reclaimed, false);

  const weekly = await store.enqueueJournalRunRequest("weekly", redis);
  assert.equal(weekly.request.status, "queued");

  redis.calls = [];
  const run = await store.reportJournalRun(
    {
      runId: "daily-2026-07-18",
      requestId: first.request.requestId,
      cadence: "daily",
      state: "published",
      occurredAt: "2026-07-19T00:32:00.000Z",
      entryId: "journal-daily-2026-07-18",
      sourceCount: 91,
      detail: "Published normally.",
    },
    redis,
  );
  assert.equal(run.state, "published");
  assert.deepEqual(redis.calls, [["eval-report"]]);
  const final = await store.readJournalControlState(redis);
  assert.equal(final.runRequests.length, 1);
  assert.equal(final.runRequests[0].requestId, weekly.request.requestId);
  assert.equal(final.recentRuns[0].sourceCount, 91);
  assert.equal(final.telemetry.lastRun.entryId, "journal-daily-2026-07-18");
});

test("backoff reporting retains the failure diagnostic it is waiting on", async () => {
  for (const failureState of ["held", "delivery_failed"]) {
    const redis = new FakeRedis();
    const runId = `daily-${failureState}-2026-07-18`;
    const entryId = `journal-${failureState}-2026-07-18`;

    await store.reportJournalRun(
      {
        runId,
        cadence: "daily",
        state: failureState,
        occurredAt: "2026-07-19T02:07:57.000Z",
        entryId,
        sourceCount: 204,
        detail: `${failureState}_root_cause`,
      },
      redis,
    );
    await store.reportJournalRun(
      {
        runId,
        cadence: "daily",
        state: "backoff",
        occurredAt: "2026-07-19T02:20:42.000Z",
        entryId,
        sourceCount: 204,
        detail: "retry_after_2026-07-19T03:07:57Z",
      },
      redis,
    );

    let state = await store.readJournalControlState(redis);
    assert.deepEqual(
      state.recentRuns.map((run) => run.state),
      ["backoff", failureState],
    );
    assert.equal(state.recentRuns[1].detail, `${failureState}_root_cause`);

    await store.reportJournalRun(
      {
        runId,
        cadence: "daily",
        state: "backoff",
        occurredAt: "2026-07-19T02:35:42.000Z",
        entryId,
        sourceCount: 204,
        detail: "retry_after_2026-07-19T03:07:57Z",
      },
      redis,
    );
    state = await store.readJournalControlState(redis);
    assert.deepEqual(
      state.recentRuns.map((run) => run.state),
      ["backoff", failureState],
    );

    await store.reportJournalRun(
      {
        runId,
        cadence: "daily",
        state: "published",
        occurredAt: "2026-07-19T03:08:00.000Z",
        entryId,
        sourceCount: 204,
        detail: "Published normally.",
      },
      redis,
    );
    state = await store.readJournalControlState(redis);
    assert.deepEqual(
      state.recentRuns.map((run) => run.state),
      ["published"],
    );
  }
});

test("admin and bot Journal routes enforce auth and Redis-required control writes", () => {
  const adminRoute = readFileSync("src/app/api/admin/journal/route.ts", "utf8");
  const botRoute = readFileSync(
    "src/app/api/bnl/journal/control/route.ts",
    "utf8",
  );
  const adminPage = readFileSync("src/app/admin/page.tsx", "utf8");
  const journalAdminPage = readFileSync(
    "src/app/admin/journal/page.tsx",
    "utf8",
  );
  const controlStoreSource = readFileSync(
    "src/lib/bnl-journal-control-store.ts",
    "utf8",
  );
  assert.match(adminRoute, /verifyAdminToken/);
  assert.match(adminRoute, /if \(!redis\)/);
  assert.match(adminRoute, /persistence_unavailable/);
  assert.match(botRoute, /authenticateBNLJournalRequest/);
  assert.match(botRoute, /claimJournalRunRequest/);
  assert.match(botRoute, /reportJournalRun/);
  assert.match(botRoute, /writeJournalTelemetry/);
  assert.match(adminPage, /href="\/admin\/journal"/);
  assert.match(
    journalAdminPage,
    /run\.state === "published" && run\.entryId/,
  );
  assert.match(controlStoreSource, /preserveFailureForBackoff/);
  assert.match(controlStoreSource, /previous\.state == "held"/);
  assert.match(controlStoreSource, /previous\.state == "delivery_failed"/);
});

test("Journal control routes return 401 without auth and 503 without Redis", async () => {
  const nextServer = {
    NextResponse: {
      json: (body, init = {}) =>
        new Response(JSON.stringify(body), {
          status: init.status ?? 200,
          headers: init.headers,
        }),
    },
  };
  const unavailableStore = {
    getJournalControlRedis: () => null,
  };
  const botUnauthorized = loadTs(
    "src/app/api/bnl/journal/control/route.ts",
    {
      "next/server": nextServer,
      "@/lib/bnl-journal-contract": {
        authenticateBNLJournalRequest: () => false,
      },
      "@/lib/bnl-journal-control-store": unavailableStore,
    },
  );
  assert.equal(
    (
      await botUnauthorized.GET(
        new Request("https://example.test/api/bnl/journal/control"),
      )
    ).status,
    401,
  );

  const botNoRedis = loadTs("src/app/api/bnl/journal/control/route.ts", {
    "next/server": nextServer,
    "@/lib/bnl-journal-contract": {
      authenticateBNLJournalRequest: () => true,
    },
    "@/lib/bnl-journal-control-store": unavailableStore,
  });
  assert.equal(
    (
      await botNoRedis.POST(
        new Request("https://example.test/api/bnl/journal/control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "heartbeat", telemetry: {} }),
        }),
      )
    ).status,
    503,
  );

  const adminUnauthorized = loadTs("src/app/api/admin/journal/route.ts", {
    "next/server": nextServer,
    "@/lib/auth": {
      COOKIE_NAME: "barcode_admin",
      verifyAdminToken: async () => false,
    },
    "@/lib/bnl-journal-control-store": unavailableStore,
    "@/lib/bnl-journal-store": {},
  });
  assert.equal(
    (
      await adminUnauthorized.POST(
        new Request("https://example.test/api/admin/journal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "requestRun", cadence: "daily" }),
        }),
      )
    ).status,
    401,
  );

  const adminNoRedis = loadTs("src/app/api/admin/journal/route.ts", {
    "next/server": nextServer,
    "@/lib/auth": {
      COOKIE_NAME: "barcode_admin",
      verifyAdminToken: async () => true,
    },
    "@/lib/bnl-journal-control-store": unavailableStore,
    "@/lib/bnl-journal-store": {},
  });
  assert.equal(
    (
      await adminNoRedis.POST(
        new Request("https://example.test/api/admin/journal", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: "barcode_admin=valid",
          },
          body: JSON.stringify({ action: "requestRun", cadence: "daily" }),
        }),
      )
    ).status,
    503,
  );
});

test("Journal entry control snapshot is deterministic and independently excludes public and memory reuse", () => {
  const snapshot = store.buildJournalEntryControlSnapshot(
    [
      {
        entryId: "journal-memory-excluded",
        publicVisible: true,
        memoryEligible: false,
        updatedAt: "2026-08-10T08:00:00.000Z",
        updatedBy: "website-admin",
      },
      {
        entryId: "journal-hidden",
        publicVisible: false,
        memoryEligible: false,
        updatedAt: "2026-08-10T08:01:00.000Z",
        updatedBy: "website-admin",
      },
    ],
    "2026-08-10T08:02:00.000Z",
  );
  assert.equal(snapshot.controlSnapshotVersion, 1);
  assert.equal(snapshot.controlRevision, "2026-08-10T08:01:00.000Z");
  assert.match(snapshot.controlDigest, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.controlObservedAt, "2026-08-10T08:02:00.000Z");
  assert.equal(snapshot.controlFreshUntil, "2026-08-10T08:04:00.000Z");
  assert.equal(snapshot.controlFreshForSeconds, 120);
  assert.deepEqual(Array.from(snapshot.publicExcludedEntryIds), [
    "journal-hidden",
  ]);
  assert.deepEqual(Array.from(snapshot.memoryExcludedEntryIds), [
    "journal-hidden",
    "journal-memory-excluded",
  ]);
});

test("bot control GET exposes a content-free visibility and reuse snapshot", async () => {
  const nextServer = {
    NextResponse: {
      json: (body, init = {}) =>
        new Response(JSON.stringify(body), {
          status: init.status ?? 200,
          headers: init.headers,
        }),
    },
  };
  const route = loadTs("src/app/api/bnl/journal/control/route.ts", {
    "next/server": nextServer,
    "@/lib/bnl-journal-contract": {
      authenticateBNLJournalRequest: () => true,
    },
    "@/lib/bnl-journal-control-store": {
      buildJournalEntryControlSnapshot:
        store.buildJournalEntryControlSnapshot,
      getJournalControlRedis: () => ({}),
      readJournalControlState: async (_redis, options) => {
        assert.equal(options.strictEntryControls, true);
        return {
          config: {
            journalAutoPublishEnabled: true,
            journalDailyEnabled: true,
            journalWeeklyEnabled: true,
          },
          runRequests: [],
          telemetry: null,
          recentRuns: [],
          entryControls: [
            {
              entryId: "journal-visible",
              publicVisible: true,
              memoryEligible: true,
              updatedAt: "2026-08-10T08:00:00.000Z",
              updatedBy: "website-admin",
            },
            {
              entryId: "journal-memory-excluded",
              publicVisible: true,
              memoryEligible: false,
              updatedAt: "2026-08-10T08:01:00.000Z",
              updatedBy: "website-admin",
            },
            {
              entryId: "journal-hidden",
              publicVisible: false,
              memoryEligible: false,
              updatedAt: "2026-08-10T08:02:00.000Z",
              updatedBy: "website-admin",
            },
          ],
        };
      },
    },
  });

  const response = await route.GET(
    new Request("https://example.test/api/bnl/journal/control"),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.contractVersion, 1);
  assert.equal(body.controlSnapshotVersion, 1);
  assert.equal(body.controlRevision, "2026-08-10T08:02:00.000Z");
  assert.match(body.controlDigest, /^[a-f0-9]{64}$/);
  assert.match(body.controlObservedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(body.controlFreshUntil, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(body.controlFreshForSeconds, 120);
  assert.deepEqual(body.publicExcludedEntryIds, ["journal-hidden"]);
  assert.deepEqual(body.memoryExcludedEntryIds, [
    "journal-hidden",
    "journal-memory-excluded",
  ]);
  assert.equal(body.entryControls, undefined);
});

test("bot control GET returns 503 instead of a partial malformed snapshot", async () => {
  const route = loadTs("src/app/api/bnl/journal/control/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, init = {}) =>
          new Response(JSON.stringify(body), {
            status: init.status ?? 200,
            headers: init.headers,
          }),
      },
    },
    "@/lib/bnl-journal-contract": {
      authenticateBNLJournalRequest: () => true,
    },
    "@/lib/bnl-journal-control-store": {
      getJournalControlRedis: () => ({}),
      readJournalControlState: async () => {
        throw new Error("invalid_journal_entry_control_record");
      },
    },
  });

  const response = await route.GET(
    new Request("https://example.test/api/bnl/journal/control"),
  );
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.reason, "persistence_unavailable");
  assert.equal(body.controlSnapshotVersion, undefined);
});

test("legacy control mutation cannot write Journal automation fields", () => {
  const legacy = readFileSync(
    "src/app/api/bnl/status/control-flags/route.ts",
    "utf8",
  );
  const mutationStart = legacy.indexOf("export async function POST");
  const allowedStart = legacy.indexOf("const allowedKeys", mutationStart);
  const allowedEnd = legacy.indexOf(";", allowedStart);
  const allowedMutationKeys = legacy.slice(allowedStart, allowedEnd);
  assert.doesNotMatch(allowedMutationKeys, /journalAutoPublishEnabled/);
  assert.doesNotMatch(allowedMutationKeys, /journalDailyEnabled/);
  assert.doesNotMatch(allowedMutationKeys, /journalWeeklyEnabled/);
});

test("legacy control GET requires the bot API key before exposing Journal pause fields", async () => {
  const previousKey = process.env.BNL_API_KEY;
  process.env.BNL_API_KEY = "journal-control-secret";
  try {
    const route = loadTs("src/app/api/bnl/status/control-flags/route.ts", {
      "next/server": {
        NextResponse: {
          json: (body, init = {}) =>
            new Response(JSON.stringify(body), {
              status: init.status ?? 200,
              headers: init.headers,
            }),
        },
      },
      "@upstash/redis": { Redis: class Redis {} },
      "@/lib/bnl-journal-control-store": {
        mergeBNLFlagsAtomic: async (patch) => patch,
      },
    });
    const unauthorized = await route.GET(
      new Request("https://example.test/api/bnl/control-flags"),
    );
    assert.equal(unauthorized.status, 401);
    const authorized = await route.GET(
      new Request("https://example.test/api/bnl/control-flags", {
        headers: { "x-api-key": "journal-control-secret" },
      }),
    );
    assert.equal(authorized.status, 200);
    const body = await authorized.json();
    assert.equal(body.journalAutoPublishEnabled, true);
    assert.equal(body.journalDailyEnabled, true);
    assert.equal(body.journalWeeklyEnabled, true);
  } finally {
    if (previousKey === undefined) delete process.env.BNL_API_KEY;
    else process.env.BNL_API_KEY = previousKey;
  }
});
