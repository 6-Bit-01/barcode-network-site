import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ts from "typescript";
import vm from "node:vm";
import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function loadTs(file, mocks = {}, globals = {}) {
  let code = ts.transpileModule(awaitFs(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  const cjsModule = { exports };
  const req = (id) => {
    if (mocks[id]) return mocks[id];
    if (id === "crypto") return crypto;
    if (id === "react/jsx-runtime") return awaitImport("react/jsx-runtime");
    if (id === "react") return React;
    if (id === "next/link")
      return function LinkMock({ href, children, ...props }) {
        return React.createElement(
          "a",
          { href: String(href), ...props },
          children,
        );
      };
    if (id === "next/navigation")
      return {
        useRouter: () => ({ refresh() {} }),
        notFound() {
          throw new Error("notFound");
        },
        redirect(path) {
          throw new Error(`redirect:${path}`);
        },
      };
    if (id === "@upstash/redis") return { Redis: class Redis {} };
    throw new Error(`unmocked import ${id} in ${file}`);
  };
  vm.runInNewContext(
    code,
    {
      require: req,
      exports,
      module: cjsModule,
      process,
      Buffer,
      URL,
      URLSearchParams,
      console,
      ...globals,
    },
    { filename: file },
  );
  return cjsModule.exports;
}
function intlWithDefaultTimeZone(defaultTimeZone) {
  function DateTimeFormat(locales, options = {}) {
    return new Intl.DateTimeFormat(locales, {
      ...options,
      timeZone: options.timeZone ?? defaultTimeZone,
    });
  }

  return { DateTimeFormat };
}
function loadJournalDateComponent({
  hydrated = false,
  defaultTimeZone = "UTC",
} = {}) {
  return loadTs(
    "src/components/journal/JournalDate.tsx",
    {
      react: { ...React, useSyncExternalStore: () => hydrated },
    },
    { Intl: intlWithDefaultTimeZone(defaultTimeZone) },
  );
}
function awaitFs(file) {
  return requireFs().readFileSync(file, "utf8");
}
function requireFs() {
  return (globalThis.__fs ??= require("node:fs"));
}
function awaitImport(id) {
  return require(id);
}

const contract = loadTs("src/lib/bnl-journal-contract.ts");
const navigation = loadTs("src/lib/bnl-journal-navigation.ts");
const retry = loadTs("src/components/journal/JournalRetryButton.tsx");
const journalDate = loadTs("src/components/journal/JournalDate.tsx");
const article = loadTs("src/components/journal/JournalArticle.tsx", {
  "@/lib/bnl-journal-store": {},
  "@/lib/bnl-journal-navigation": navigation,
  "@/components/journal/JournalRetryButton": retry,
  "@/components/journal/JournalDate": journalDate,
});
const routeMod = loadTs("src/app/api/bnl/journal/route.ts", {
  "@/lib/bnl-journal-contract": contract,
  "@/lib/bnl-journal-store": {
    publishBNLJournalEntry: async (entry) => ({
      ok: true,
      persisted: true,
      idempotent: false,
      entry,
    }),
  },
  "next/server": {
    NextResponse: {
      json: (body, init) =>
        new Response(JSON.stringify(body), {
          status: init.status,
          headers: init.headers,
        }),
    },
  },
});

function words(n) {
  return Array.from({ length: n }, (_, i) => `word_${i}`).join(" ");
}
function makeEntry(overrides = {}) {
  const entry = {
    entryId: "bnl-journal-fixture-001",
    revision: 1,
    title: "BNL-01 signal uses hyphenated long-form words",
    excerpt:
      "Contractions, underscores, punctuation, Unicode café, and internal\nnewlines\tremain countable.",
    sections: [{ heading: "First section", body: words(251) }],
    authoredAt: "2026-07-18T12:00:00Z",
    sourceWindowStart: "2026-07-11T00:00:00Z",
    sourceWindowEnd: "2026-07-18T11:00:00Z",
    ...overrides,
  };
  entry.contentHash = contract.computeBNLJournalContentHash(entry);
  return entry;
}
function env(entry = makeEntry(), extra = {}) {
  return { contractVersion: 1, kind: "journal_entry", entry, ...extra };
}
class FakeRedis {
  constructor() {
    this.kv = new Map();
    this.z = new Map();
    this.fail = null;
    this.calls = [];
  }
  async get(k) {
    this.calls.push(["get", k]);
    if (this.fail === "get") throw new Error("get fail");
    const v = this.kv.get(k);
    return typeof v === "string" ? JSON.parse(v) : (v ?? null);
  }
  async zadd(k, { score, member }) {
    this.calls.push(["zadd", k, member]);
    if (this.fail === "zadd") throw new Error("zadd fail");
    (this.z.get(k) ?? this.z.set(k, new Map()).get(k)).set(member, score);
    return 1;
  }
  async zrange(k, start, stop, opts) {
    this.calls.push(["zrange", k, start, stop]);
    const rows = [...(this.z.get(k) ?? new Map())]
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m);
    const ordered = opts?.rev ? rows.reverse() : rows;
    const s = Math.max(0, start);
    const e = stop < 0 ? ordered.length + stop : stop;
    return ordered.slice(s, e + 1);
  }
  async zrank(k, member) {
    this.calls.push(["zrank", k, member]);
    const rows = [...(this.z.get(k) ?? new Map())]
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m);
    const i = rows.indexOf(member);
    return i < 0 ? null : i;
  }
  async eval(_script, keys, args) {
    this.calls.push(["eval"]);
    if (this.fail === "eval") throw new Error("eval fail");
    if (_script.includes("journal-entry-control-v1")) {
      const [controlsKey, auditKey, indexKey, dailyIndexKey, weeklyIndexKey, latestKey] = keys;
      const [entryId, controlJson, auditJson, maxAudit] = args;
      const latestJson = this.kv.get(latestKey);
      if (!latestJson) return JSON.stringify({ status: "missing" });
      const latest = JSON.parse(latestJson);
      const controls = this.kv.get(controlsKey)
        ? JSON.parse(this.kv.get(controlsKey))
        : {};
      const control = JSON.parse(controlJson);
      controls[entryId] = control;
      const audit = this.kv.get(auditKey)
        ? JSON.parse(this.kv.get(auditKey))
        : [];
      audit.unshift(JSON.parse(auditJson));
      this.kv.set(controlsKey, JSON.stringify(controls));
      this.kv.set(auditKey, JSON.stringify(audit.slice(0, Number(maxAudit))));
      for (const key of [indexKey, dailyIndexKey, weeklyIndexKey])
        this.z.get(key)?.delete(entryId);
      if (control.publicVisible) {
        await this.zadd(indexKey, { score: latest._score, member: entryId });
        if (latest.entryKind === "daily")
          await this.zadd(dailyIndexKey, { score: latest._score, member: entryId });
        if (latest.entryKind === "weekly")
          await this.zadd(weeklyIndexKey, { score: latest._score, member: entryId });
      }
      return JSON.stringify({ status: "updated", control });
    }
    const [recordKey, latestKey, indexKey, dailyIndexKey, weeklyIndexKey, controlsKey] =
      keys;
    const [entryId, revision, contentHash, recordJson, score] = args;
    const controls = this.kv.get(controlsKey)
      ? JSON.parse(this.kv.get(controlsKey))
      : {};
    const publicVisible = controls[entryId]?.publicVisible !== false;
    const repairKindIndexes = (latest) => {
      const index =
        this.z.get(indexKey) ??
        this.z.set(indexKey, new Map()).get(indexKey);
      const daily =
        this.z.get(dailyIndexKey) ??
        this.z.set(dailyIndexKey, new Map()).get(dailyIndexKey);
      const weekly =
        this.z.get(weeklyIndexKey) ??
        this.z.set(weeklyIndexKey, new Map()).get(weeklyIndexKey);
      index.delete(entryId);
      daily.delete(entryId);
      weekly.delete(entryId);
      if (!publicVisible) return;
      index.set(entryId, latest._score);
      if (latest.entryKind === "daily") daily.set(entryId, latest._score);
      if (latest.entryKind === "weekly") weekly.set(entryId, latest._score);
    };
    const existingJson = this.kv.get(recordKey);
    if (existingJson) {
      const existing = JSON.parse(existingJson);
      if (existing.contentHash !== contentHash)
        return JSON.stringify({ status: "conflict" });
      const latestJson = this.kv.get(latestKey);
      const zset = this.z.get(indexKey);
      const inIndex = zset?.has(entryId);
      const latest = latestJson ? JSON.parse(latestJson) : null;
      let repairedLatest = false;
      let repairedIndexScore = null;
      if (!latestJson && !inIndex) {
        this.kv.set(latestKey, existingJson);
        if (publicVisible)
          await this.zadd(indexKey, { score: existing._score, member: entryId });
        repairedLatest = true;
        repairedIndexScore = existing._score;
      } else if (!latestJson && zset.get(entryId) === existing._score) {
        this.kv.set(latestKey, existingJson);
        repairedLatest = true;
      } else if (
        latest &&
        existing.revision > latest.revision
      ) {
        this.kv.set(latestKey, existingJson);
        if (publicVisible)
          await this.zadd(indexKey, { score: existing._score, member: entryId });
        repairedLatest = true;
        repairedIndexScore = existing._score;
      } else if (latest && publicVisible && !inIndex) {
        await this.zadd(indexKey, { score: latest._score, member: entryId });
        repairedIndexScore = latest._score;
      }
      if (
        !this.kv.get(latestKey) ||
        (publicVisible && !this.z.get(indexKey)?.has(entryId))
      )
        return JSON.stringify({ status: "unavailable" });
      const repaired = JSON.parse(this.kv.get(latestKey));
      const repairedScore = this.z.get(indexKey).get(entryId);
      if (
        (repairedLatest &&
          (repaired.revision !== existing.revision ||
            repaired.contentHash !== existing.contentHash)) ||
        (publicVisible && repairedIndexScore !== null && repairedScore !== repairedIndexScore)
      )
        return JSON.stringify({ status: "unavailable" });
      repairKindIndexes(repaired);
      return JSON.stringify({
        status: "idempotent",
        publishedAt: existing.publishedAt,
      });
    }
    this.kv.set(recordKey, recordJson);
    const latestJson = this.kv.get(latestKey);
    if (!latestJson || JSON.parse(latestJson).revision <= Number(revision)) {
      this.kv.set(latestKey, recordJson);
    }
    repairKindIndexes(JSON.parse(this.kv.get(latestKey)));
    return JSON.stringify({ status: "created" });
  }
}
const store = loadTs("src/lib/bnl-journal-store.ts");

test("contract executes bot-compatible validation, hashes, auth, and exact envelope boundary", () => {
  assert.equal(
    contract.computeBNLJournalContentHash({
      title: "Café Signal",
      excerpt: "Tabs\tand\nlines",
      sections: [
        { heading: "Ω heading", body: "Community — activity" },
        { heading: "Second", body: "emoji 🎵" },
      ],
    }),
    // Generated by the bot's Python json.dumps(..., sort_keys=True,
    // separators=(",", ":"), ensure_ascii=False) hash path.
    "5d747286ca4e373b86763a506b9e95e8cfde9904148b2ec08a4116e364f59ad1",
  );
  for (const entryKind of ["daily", "weekly", "manual"]) {
    const classified = makeEntry({ entryKind });
    assert.equal(
      contract.validateBNLJournalPayload(env(classified)).ok,
      true,
      `${entryKind} entries are accepted`,
    );
    assert.equal(
      classified.contentHash,
      makeEntry().contentHash,
      "entry kind remains outside the established public-content hash",
    );
  }
  assert.equal(
    contract.validateBNLJournalPayload(
      env(makeEntry({ entryKind: "monthly" })),
    ).reason,
    "invalid_entry_kind",
  );
  assert.equal(
    contract.validateBNLJournalPayload(env(makeEntry({ extra: "private" }))).ok,
    false,
  );
  assert.equal(
    contract.validateBNLJournalPayload({ ...env(), extra: true }).ok,
    false,
  );
  assert.equal(
    contract.validateBNLJournalPayload(
      env(
        makeEntry({
          sections: [{ heading: "ok", body: `${words(248)}\u0001` }],
        }),
      ),
    ).reason,
    "invalid_sections",
  );
  assert.equal(
    contract.authenticateBNLJournalRequest("secret", "secret"),
    true,
  );
  assert.equal(contract.authenticateBNLJournalRequest("bad", "secret"), false);
});

test("contract accepts short and more-than-500-word Journal entries", () => {
  const short = makeEntry({
    title: "Quiet day",
    excerpt: "A brief record.",
    sections: [{ heading: "Observation", body: "The room stayed quiet." }],
  });
  assert.equal(contract.validateBNLJournalPayload(env(short)).ok, true);

  const long = makeEntry({
    title: "Full day",
    excerpt: "The complete record needed more room.",
    sections: [{ heading: "Observation", body: words(700) }],
  });
  assert.equal(contract.validateBNLJournalPayload(env(long)).ok, true);
});

test("route accepts short and long valid entries while enforcing the raw byte cap", async () => {
  process.env.BNL_API_KEY = "secret";
  const body = JSON.stringify(env());
  const ok = await routeMod.POST(
    new Request("https://x.test/api/bnl/journal", {
      method: "POST",
      headers: { "x-api-key": "secret", "content-type": "application/json" },
      body,
    }),
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const shortBody = JSON.stringify(
    env(
      makeEntry({
        sections: [{ heading: "Brief record", body: "The room stayed quiet." }],
      }),
    ),
  );
  const short = await routeMod.POST(
    new Request("https://x.test/api/bnl/journal", {
      method: "POST",
      headers: { "x-api-key": "secret", "content-type": "application/json" },
      body: shortBody,
    }),
  );
  assert.equal(short.status, 200);
  const longBody = JSON.stringify(
    env(
      makeEntry({
        sections: [{ heading: "Full record", body: words(700) }],
      }),
    ),
  );
  assert.ok(
    Buffer.byteLength(longBody, "utf8") <
      contract.BNL_JOURNAL_MAX_PAYLOAD_BYTES,
  );
  const long = await routeMod.POST(
    new Request("https://x.test/api/bnl/journal", {
      method: "POST",
      headers: { "x-api-key": "secret", "content-type": "application/json" },
      body: longBody,
    }),
  );
  assert.equal(long.status, 200);
  assert.equal(contract.BNL_JOURNAL_MAX_PAYLOAD_BYTES, 24_000);
  const unauth = await routeMod.POST(
    new Request("https://x.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
  assert.equal(unauth.status, 401);
  const atLimitBody = `${body}${" ".repeat(
    contract.BNL_JOURNAL_MAX_PAYLOAD_BYTES - Buffer.byteLength(body, "utf8"),
  )}`;
  assert.equal(
    Buffer.byteLength(atLimitBody, "utf8"),
    contract.BNL_JOURNAL_MAX_PAYLOAD_BYTES,
  );
  const atLimit = await routeMod.POST(
    new Request("https://x.test", {
      method: "POST",
      headers: { "x-api-key": "secret", "content-type": "application/json" },
      body: atLimitBody,
    }),
  );
  assert.equal(atLimit.status, 200);
  const overLimit = await routeMod.POST(
    new Request("https://x.test", {
      method: "POST",
      headers: { "x-api-key": "secret", "content-type": "application/json" },
      body: `${atLimitBody} `,
    }),
  );
  assert.equal(overLimit.status, 400);

  const multibyteBody = JSON.stringify(
    env(
      makeEntry({
        title: "Café signal",
        sections: [{ heading: "Résumé", body: "é".repeat(1_000) }],
      }),
    ),
  );
  assert.ok(Buffer.byteLength(multibyteBody, "utf8") > multibyteBody.length);
  const multibyte = await routeMod.POST(
    new Request("https://x.test", {
      method: "POST",
      headers: { "x-api-key": "secret", "content-type": "application/json" },
      body: multibyteBody,
    }),
  );
  assert.equal(multibyte.status, 200);
});

test("store executes atomic publication, idempotent self-repair, conflicts, bounded paging, and neighbors", async () => {
  const redis = new FakeRedis();
  const entries = [];
  for (let i = 0; i < 105; i++) {
    const e = makeEntry({
      entryId: `entry-${String(i).padStart(3, "0")}`,
      revision: 1,
    });
    entries.push(e);
    const r = await store.publishBNLJournalEntry(e, redis);
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  const first = entries[0];
  const retry = await store.publishBNLJournalEntry(first, redis);
  assert.equal(retry.idempotent, true);
  const rev2 = makeEntry({ entryId: first.entryId, revision: 2 });
  await store.publishBNLJournalEntry(rev2, redis);
  const oldRetry = await store.publishBNLJournalEntry(first, redis);
  assert.equal(oldRetry.idempotent, true);
  assert.equal(
    (await store.getBNLJournalEntry(first.entryId, redis)).value.revision,
    2,
  );
  const orderBefore = await redis.zrange(store.BNL_JOURNAL_INDEX_KEY, 0, 9, {
    rev: true,
  });
  await store.publishBNLJournalEntry(first, redis);
  assert.deepEqual(
    await redis.zrange(store.BNL_JOURNAL_INDEX_KEY, 0, 9, { rev: true }),
    orderBefore,
  );
  redis.z.get(store.BNL_JOURNAL_INDEX_KEY).delete(first.entryId);
  assert.equal(
    (await store.publishBNLJournalEntry(rev2, redis)).idempotent,
    true,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_INDEX_KEY).has(first.entryId),
    true,
  );
  const storedRev1 = await redis.get(
    store.journalEntryKey(first.entryId, first.revision),
  );
  const storedRev2 = await redis.get(
    store.journalEntryKey(first.entryId, rev2.revision),
  );
  const storedRev1Score = storedRev1._score;
  const storedRev2Score = storedRev2._score;
  redis.kv.delete(store.journalLatestKey(first.entryId));
  redis.z.get(store.BNL_JOURNAL_INDEX_KEY).delete(first.entryId);
  const oldestRehydrated = await store.publishBNLJournalEntry(first, redis);
  assert.equal(oldestRehydrated.ok, true, JSON.stringify(oldestRehydrated));
  assert.equal(oldestRehydrated.idempotent, true);
  assert.equal(
    (await redis.get(store.journalLatestKey(first.entryId))).revision,
    first.revision,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_INDEX_KEY).get(first.entryId),
    storedRev1Score,
  );
  const newestRehydrated = await store.publishBNLJournalEntry(rev2, redis);
  assert.equal(newestRehydrated.ok, true, JSON.stringify(newestRehydrated));
  assert.equal(newestRehydrated.idempotent, true);
  assert.equal(
    (await redis.get(store.journalLatestKey(first.entryId))).revision,
    rev2.revision,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_INDEX_KEY).get(first.entryId),
    storedRev2Score,
  );
  const oldRetryAfterRehydrate = await store.publishBNLJournalEntry(first, redis);
  assert.equal(oldRetryAfterRehydrate.ok, true);
  assert.equal(
    (await redis.get(store.journalLatestKey(first.entryId))).revision,
    rev2.revision,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_INDEX_KEY).get(first.entryId),
    storedRev2Score,
  );
  redis.kv.delete(store.journalLatestKey(first.entryId));
  assert.equal((await store.publishBNLJournalEntry(first, redis)).ok, false);
  assert.equal(
    (await store.publishBNLJournalEntry(rev2, redis)).idempotent,
    true,
  );
  assert.equal(
    (await store.getBNLJournalEntry(first.entryId, redis)).value.revision,
    2,
  );
  const before = new Map(redis.kv);
  const conflict = makeEntry({
    entryId: first.entryId,
    revision: 2,
    title: "Changed title",
  });
  assert.equal(
    (await store.publishBNLJournalEntry(conflict, redis)).conflict,
    true,
  );
  assert.deepEqual(redis.kv, before);
  redis.calls = [];
  const max = await store.listBNLJournalArchive(10000, redis);
  assert.equal(max.ok, true);
  assert.ok(redis.calls.filter((c) => c[0] === "get").length <= 10);
  const allIds = await redis.zrange(store.BNL_JOURNAL_INDEX_KEY, 0, 200, {
    rev: true,
  });
  const nOld = await store.getBNLJournalNeighbors(allIds.at(-1), redis);
  assert.equal(nOld.value.older, null);
  assert.equal(nOld.value.newer.entryId, allIds.at(-2));
  const nNew = await store.getBNLJournalNeighbors(allIds[0], redis);
  assert.equal(nNew.value.newer, null);
  assert.equal(nNew.value.older.entryId, allIds[1]);
  assert.equal(
    (await store.getBNLJournalNeighbors("missing", redis)).value.older,
    null,
  );
  const middleIndex = allIds.indexOf("entry-050");
  const middle = await store.getBNLJournalNeighbors("entry-050", redis);
  assert.equal(middle.value.older.entryId, allIds[middleIndex + 1]);
  assert.equal(middle.value.newer.entryId, allIds[middleIndex - 1]);
});

test("archive filters paginate over matching entries and constrain neighbors", async () => {
  const redis = new FakeRedis();
  for (let i = 0; i < 30; i++) {
    const entryKind = i % 3 === 0 ? "daily" : i % 3 === 1 ? "weekly" : null;
    const entry = makeEntry({
      entryId: `kind-entry-${String(i).padStart(2, "0")}`,
      ...(entryKind ? { entryKind } : {}),
    });
    assert.equal((await store.publishBNLJournalEntry(entry, redis)).ok, true);
    redis.z.get(store.BNL_JOURNAL_INDEX_KEY).set(entry.entryId, i);
    if (entryKind === "daily")
      redis.z.get(store.BNL_JOURNAL_DAILY_INDEX_KEY).set(entry.entryId, i);
    if (entryKind === "weekly")
      redis.z.get(store.BNL_JOURNAL_WEEKLY_INDEX_KEY).set(entry.entryId, i);
  }

  redis.calls = [];
  const dailyPage1 = await store.listBNLJournalArchive(1, redis, "daily");
  assert.deepEqual(redis.calls[0], [
    "zrange",
    store.BNL_JOURNAL_DAILY_INDEX_KEY,
    0,
    9,
  ]);
  assert.equal(redis.calls.filter((call) => call[0] === "zrange").length, 1);
  assert.equal(redis.calls.filter((call) => call[0] === "get").length, 10);
  const dailyPage2 = await store.listBNLJournalArchive(2, redis, "daily");
  assert.equal(dailyPage1.ok, true);
  assert.equal(dailyPage1.value.entries.length, 9);
  assert.equal(dailyPage1.value.hasOlder, true);
  assert.equal(dailyPage1.value.hasNewer, false);
  assert.equal(dailyPage2.value.entries.length, 1);
  assert.equal(dailyPage2.value.hasOlder, false);
  assert.equal(dailyPage2.value.hasNewer, true);
  assert.deepEqual(
    [...dailyPage1.value.entries, ...dailyPage2.value.entries].map(
      (entry) => entry.entryId,
    ),
    [27, 24, 21, 18, 15, 12, 9, 6, 3, 0].map(
      (i) => `kind-entry-${String(i).padStart(2, "0")}`,
    ),
  );
  assert.equal(
    dailyPage1.value.entries.every((entry) => entry.entryKind === "daily"),
    true,
  );

  const weeklyPage1 = await store.listBNLJournalArchive(1, redis, "weekly");
  assert.equal(weeklyPage1.value.entries.length, 9);
  assert.equal(
    weeklyPage1.value.entries.every((entry) => entry.entryKind === "weekly"),
    true,
  );
  redis.calls = [];
  const highEmpty = await store.listBNLJournalArchive(10000, redis, "weekly");
  assert.equal(highEmpty.ok, true);
  assert.equal(highEmpty.value.entries.length, 0);
  assert.deepEqual(redis.calls, [
    ["zrange", store.BNL_JOURNAL_WEEKLY_INDEX_KEY, 89991, 90000],
  ]);
  const allPage = await store.listBNLJournalArchive(1, redis, "all");
  assert.equal(
    allPage.value.entries.some((entry) => entry.entryKind === undefined),
    true,
    "legacy records remain visible in All",
  );

  redis.calls = [];
  const neighbors = await store.getBNLJournalNeighbors(
    "kind-entry-15",
    redis,
    "daily",
  );
  assert.equal(neighbors.value.older.entryId, "kind-entry-12");
  assert.equal(neighbors.value.newer.entryId, "kind-entry-18");
  assert.equal(
    redis.calls
      .filter((call) => call[0] === "zrank" || call[0] === "zrange")
      .every((call) => call[1] === store.BNL_JOURNAL_DAILY_INDEX_KEY),
    true,
  );
  assert.equal(redis.calls.filter((call) => call[0] === "zrange").length, 2);
});

test("strict entry-control reads reject malformed or mismatched stored records", async () => {
  const invalidMaps = [
    {
      "journal-hidden": {
        entryId: "journal-hidden",
        publicVisible: false,
        memoryEligible: "false",
        updatedAt: "2026-08-10T08:00:00.000Z",
        updatedBy: "website-admin",
      },
    },
    {
      "journal-stored-key": {
        entryId: "journal-different-key",
        publicVisible: false,
        memoryEligible: false,
        updatedAt: "2026-08-10T08:00:00.000Z",
        updatedBy: "website-admin",
      },
    },
    ["not", "a", "control", "map"],
  ];
  for (const raw of invalidMaps) {
    const redis = new FakeRedis();
    redis.kv.set(store.BNL_JOURNAL_ENTRY_CONTROLS_KEY, raw);
    await assert.rejects(
      store.listJournalEntryControls(redis, { failOnInvalid: true }),
      /invalid_journal_entry_control/,
    );
  }
});

test("entry controls hide immediately, remain recoverable, and keep memory eligibility separate", async () => {
  const redis = new FakeRedis();
  const entry = makeEntry({
    entryId: "controlled-daily-entry",
    entryKind: "daily",
  });
  assert.equal((await store.publishBNLJournalEntry(entry, redis)).ok, true);

  const hidden = await store.updateJournalEntryControl(
    entry.entryId,
    false,
    false,
    redis,
  );
  assert.equal(hidden.ok, true);
  assert.equal(hidden.control.publicVisible, false);
  assert.equal(hidden.control.memoryEligible, false);
  assert.equal(
    (await store.listBNLJournalArchive(1, redis)).value.entries.length,
    0,
  );
  assert.equal((await store.getBNLJournalEntry(entry.entryId, redis)).value, null);

  const adminHidden = await store.listBNLJournalAdminEntries(redis);
  assert.equal(adminHidden.ok, true);
  assert.equal(adminHidden.value.length, 1);
  assert.equal(adminHidden.value[0].entryId, entry.entryId);
  assert.equal(adminHidden.value[0].control.publicVisible, false);
  assert.equal((await store.listJournalEntryControlAudit(redis)).length, 1);

  const revisionTwo = makeEntry({
    entryId: entry.entryId,
    revision: 2,
    entryKind: "daily",
  });
  assert.equal((await store.publishBNLJournalEntry(revisionTwo, redis)).ok, true);
  assert.equal(
    (await store.listBNLJournalArchive(1, redis)).value.entries.length,
    0,
    "a later revision cannot silently republish a hidden entry",
  );

  const restored = await store.updateJournalEntryControl(
    entry.entryId,
    true,
    false,
    redis,
  );
  assert.equal(restored.ok, true);
  assert.equal(restored.control.publicVisible, true);
  assert.equal(restored.control.memoryEligible, false);
  assert.equal(
    (await store.getBNLJournalEntry(entry.entryId, redis)).value.revision,
    2,
  );
  assert.equal(
    (await store.listBNLJournalArchive(1, redis, "daily")).value.entries.length,
    1,
  );
  assert.equal((await store.listJournalEntryControlAudit(redis)).length, 2);

  const missing = await store.updateJournalEntryControl(
    "missing-entry",
    false,
    false,
    redis,
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.missing, true);
});

test("idempotent publication repairs the stored kind index without trusting an incoming kind", async () => {
  const redis = new FakeRedis();
  const daily = makeEntry({
    entryId: "daily-repair",
    entryKind: "daily",
  });
  assert.equal((await store.publishBNLJournalEntry(daily, redis)).ok, true);
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_DAILY_INDEX_KEY).has(daily.entryId),
    true,
  );

  redis.z.get(store.BNL_JOURNAL_DAILY_INDEX_KEY).delete(daily.entryId);
  redis.z
    .get(store.BNL_JOURNAL_WEEKLY_INDEX_KEY)
    .set(daily.entryId, 123);
  const repaired = await store.publishBNLJournalEntry(daily, redis);
  assert.equal(repaired.ok, true);
  assert.equal(repaired.idempotent, true);
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_DAILY_INDEX_KEY).has(daily.entryId),
    true,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_WEEKLY_INDEX_KEY).has(daily.entryId),
    false,
  );

  const differingRetry = makeEntry({
    entryId: daily.entryId,
    entryKind: "weekly",
  });
  const rejected = await store.publishBNLJournalEntry(differingRetry, redis);
  assert.equal(rejected.ok, false);
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_DAILY_INDEX_KEY).has(daily.entryId),
    true,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_WEEKLY_INDEX_KEY).has(daily.entryId),
    false,
  );

  const weeklyRevision = makeEntry({
    entryId: daily.entryId,
    revision: 2,
    entryKind: "weekly",
  });
  assert.equal(
    (await store.publishBNLJournalEntry(weeklyRevision, redis)).ok,
    true,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_DAILY_INDEX_KEY).has(daily.entryId),
    false,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_WEEKLY_INDEX_KEY).has(daily.entryId),
    true,
  );
  assert.equal((await store.publishBNLJournalEntry(daily, redis)).ok, true);
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_DAILY_INDEX_KEY).has(daily.entryId),
    false,
  );
  assert.equal(
    redis.z.get(store.BNL_JOURNAL_WEEKLY_INDEX_KEY).has(daily.entryId),
    true,
  );
});

test("journal navigation preserves archive filters and rejects unknown filters", () => {
  assert.equal(navigation.parseJournalArchiveFilter(), "all");
  assert.equal(navigation.parseJournalArchiveFilter("all"), "all");
  assert.equal(navigation.parseJournalArchiveFilter("daily"), "daily");
  assert.equal(navigation.parseJournalArchiveFilter("weekly"), "weekly");
  assert.equal(navigation.parseJournalArchiveFilter("monthly"), null);
  assert.equal(navigation.journalArchiveHref("all"), "/journal");
  assert.equal(
    navigation.journalArchiveHref("daily", 2),
    "/journal?kind=daily&page=2",
  );
  assert.equal(
    navigation.journalEntryHref("entry/unsafe", "weekly"),
    "/journal/entry%2Funsafe?kind=weekly",
  );
});

test("journal pages canonicalize explicit All and mismatched detail filters", async () => {
  const placeholderComponents = {
    JournalArchiveCard: () => React.createElement("div"),
    JournalArticle: () => React.createElement("article"),
    JournalUnavailable: () => React.createElement("div"),
  };
  const archivePage = loadTs("src/app/journal/page.tsx", {
    "@/content": { externalLinks: { discord: "https://discord.gg/4tHazmD528" } },
    "@/components/journal/JournalArticle": placeholderComponents,
    "@/lib/bnl-journal-navigation": navigation,
    "@/lib/bnl-journal-store": {
      listBNLJournalArchive: () => {
        throw new Error("canonical redirect must happen before storage read");
      },
    },
  });
  await assert.rejects(
    archivePage.default({
      searchParams: Promise.resolve({ kind: "all", page: "2" }),
    }),
    /redirect:\/journal\?page=2/,
  );

  let detailEntry = {
    ...makeEntry({ entryId: "daily-detail", entryKind: "daily" }),
    publishedAt: "2026-07-18T12:30:00Z",
  };
  let neighborFilter = null;
  const detailPage = loadTs("src/app/journal/[entryId]/page.tsx", {
    "@/content": { externalLinks: { discord: "https://discord.gg/4tHazmD528" } },
    "@/components/journal/JournalArticle": placeholderComponents,
    "@/lib/bnl-journal-navigation": navigation,
    "@/lib/bnl-journal-store": {
      getBNLJournalEntry: async () => ({ ok: true, value: detailEntry }),
      getBNLJournalNeighbors: async (_entryId, _redis, filter) => {
        neighborFilter = filter;
        return { ok: true, value: { older: null, newer: null } };
      },
    },
  });
  await assert.rejects(
    detailPage.default({
      params: Promise.resolve({ entryId: detailEntry.entryId }),
      searchParams: Promise.resolve({ kind: "weekly" }),
    }),
    /redirect:\/journal\/daily-detail/,
  );
  await assert.rejects(
    detailPage.default({
      params: Promise.resolve({ entryId: detailEntry.entryId }),
      searchParams: Promise.resolve({ kind: "all" }),
    }),
    /redirect:\/journal\/daily-detail/,
  );
  const matching = await detailPage.default({
    params: Promise.resolve({ entryId: detailEntry.entryId }),
    searchParams: Promise.resolve({ kind: "daily" }),
  });
  assert.ok(matching);
  assert.equal(neighborFilter, "daily");

  detailEntry = {
    ...makeEntry({ entryId: "legacy-detail" }),
    publishedAt: "2026-07-18T12:30:00Z",
  };
  await assert.rejects(
    detailPage.default({
      params: Promise.resolve({ entryId: detailEntry.entryId }),
      searchParams: Promise.resolve({ kind: "daily" }),
    }),
    /redirect:\/journal\/legacy-detail/,
  );
});

test("public Journal dates resolve in the viewer's browser timezone after hydration", () => {
  const value = "2026-07-20T04:52:03Z";
  const serverHtml = renderToStaticMarkup(
    React.createElement(
      loadJournalDateComponent({
        hydrated: false,
        defaultTimeZone: "America/Los_Angeles",
      }).JournalDate,
      { value },
    ),
  );
  const pacificHtml = renderToStaticMarkup(
    React.createElement(
      loadJournalDateComponent({
        hydrated: true,
        defaultTimeZone: "America/Los_Angeles",
      }).JournalDate,
      { value },
    ),
  );
  const tokyoHtml = renderToStaticMarkup(
    React.createElement(
      loadJournalDateComponent({
        hydrated: true,
        defaultTimeZone: "Asia/Tokyo",
      }).JournalDate,
      { value },
    ),
  );

  assert.match(serverHtml, /July 20, 2026/);
  assert.match(pacificHtml, /July 19, 2026/);
  assert.match(tokyoHtml, /July 20, 2026/);
  assert.match(pacificHtml, /datetime="2026-07-20T04:52:03Z"/i);
  assert.equal(journalDate.formatJournalDate("not-a-date"), "Date unavailable");
});

test("React server rendering exposes only display data and escapes hostile text", () => {
  const entry = {
    ...makeEntry({
      title: "<script>alert(1)</script>",
      excerpt: "Visible excerpt",
      sections: [
        {
          heading: "Safe heading",
          body: `${words(250)} <img src=x onerror=alert(1)>`,
        },
      ],
    }),
    publishedAt: "2026-07-18T12:30:00Z",
  };
  const html = renderToStaticMarkup(
    React.createElement(article.JournalArticle, { entry }),
  );
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /By BNL-01\./);
  assert.match(html, /Journal entry type: Manual/);
  assert.doesNotMatch(
    html,
    /contentHash|sourceWindowStart|sourceWindowEnd|authoredAt|3a4b2b|2026-07-11T00:00:00Z/,
  );
  const dailyHtml = renderToStaticMarkup(
    React.createElement(article.JournalArticle, {
      entry: { ...entry, entryKind: "daily" },
      prominent: true,
      archiveFilter: "daily",
    }),
  );
  assert.match(dailyHtml, /Journal entry type: Daily/);
  assert.match(
    dailyHtml,
    /href="\/journal\/bnl-journal-fixture-001\?kind=daily"/,
  );
  const weeklyCardHtml = renderToStaticMarkup(
    React.createElement(article.JournalArchiveCard, {
      entry: { ...entry, entryKind: "weekly" },
      archiveFilter: "weekly",
    }),
  );
  assert.match(weeklyCardHtml, /Journal entry type: Weekly/);
  assert.match(weeklyCardHtml, /\?kind=weekly/);
  assert.equal(article.JournalArticle.toString().includes("useRouter"), false);
});

test("public archive UI exposes server-backed filters and preserves them in navigation", () => {
  const archivePage = awaitFs("src/app/journal/page.tsx");
  const entryPage = awaitFs("src/app/journal/[entryId]/page.tsx");
  assert.match(archivePage, /aria-label="Filter journal archive"/);
  assert.match(
    archivePage,
    /listBNLJournalArchive\(page, undefined, filter\)/,
  );
  assert.match(
    archivePage,
    /journalArchiveHref\(filter, archive\.value\.page \+ 1\)/,
  );
  assert.match(archivePage, /params\?\.kind === "all"/);
  assert.match(
    archivePage,
    /redirect\(journalArchiveHref\(filter, page\)\)/,
  );
  assert.match(
    entryPage,
    /getBNLJournalNeighbors\(entryId, undefined, filter\)/,
  );
  assert.match(entryPage, /journalArchiveHref\(filter\)/);
  assert.match(entryPage, /result\.value\.entryKind !== filter/);
  assert.match(entryPage, /redirect\(journalEntryHref\(entryId\)\)/);
});
