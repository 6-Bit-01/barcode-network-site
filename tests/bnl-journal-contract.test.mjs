import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ts from "typescript";
import vm from "node:vm";
import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function loadTs(file, mocks = {}) {
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
    { require: req, exports, module: cjsModule, process, Buffer, URL, console },
    { filename: file },
  );
  return cjsModule.exports;
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
const retry = loadTs("src/components/journal/JournalRetryButton.tsx");
const article = loadTs("src/components/journal/JournalArticle.tsx", {
  "@/lib/bnl-journal-store": {},
  "@/components/journal/JournalRetryButton": retry,
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
    const [recordKey, latestKey, indexKey] = keys;
    const [entryId, revision, contentHash, recordJson, score] = args;
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
        await this.zadd(indexKey, { score: existing._score, member: entryId });
        repairedLatest = true;
        repairedIndexScore = existing._score;
      } else if (latest && !inIndex) {
        await this.zadd(indexKey, { score: latest._score, member: entryId });
        repairedIndexScore = latest._score;
      }
      if (!this.kv.get(latestKey) || !this.z.get(indexKey)?.has(entryId))
        return JSON.stringify({ status: "unavailable" });
      const repaired = JSON.parse(this.kv.get(latestKey));
      const repairedScore = this.z.get(indexKey).get(entryId);
      if (
        (repairedLatest &&
          (repaired.revision !== existing.revision ||
            repaired.contentHash !== existing.contentHash)) ||
        (repairedIndexScore !== null && repairedScore !== repairedIndexScore)
      )
        return JSON.stringify({ status: "unavailable" });
      return JSON.stringify({
        status: "idempotent",
        publishedAt: existing.publishedAt,
      });
    }
    this.kv.set(recordKey, recordJson);
    const latestJson = this.kv.get(latestKey);
    if (!latestJson || JSON.parse(latestJson).revision <= Number(revision)) {
      this.kv.set(latestKey, recordJson);
      await this.zadd(indexKey, { score: Number(score), member: entryId });
    } else if (!this.z.get(indexKey)?.has(entryId)) {
      await this.zadd(indexKey, {
        score: JSON.parse(latestJson)._score,
        member: entryId,
      });
    }
    return JSON.stringify({ status: "created" });
  }
}
const store = loadTs("src/lib/bnl-journal-store.ts");

test("contract executes bot-compatible validation, word counts, hashes, auth, and exact envelope boundary", () => {
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
  const e250 = makeEntry({
    title: "Title",
    excerpt: "Excerpt",
    sections: [{ heading: "Heading", body: words(247) }],
  });
  assert.equal(contract.countJournalWords(e250), 250);
  assert.equal(contract.validateBNLJournalPayload(env(e250)).ok, true);
  const e500 = makeEntry({
    title: "Title",
    excerpt: "Excerpt",
    sections: [{ heading: "Heading", body: words(497) }],
  });
  assert.equal(contract.validateBNLJournalPayload(env(e500)).ok, true);
  const e249 = makeEntry({
    title: "Title",
    excerpt: "Excerpt",
    sections: [{ heading: "Heading", body: words(246) }],
  });
  assert.equal(
    contract.validateBNLJournalPayload(env(e249)).reason,
    "invalid_word_count",
  );
  const e501 = makeEntry({
    title: "Title",
    excerpt: "Excerpt",
    sections: [{ heading: "Heading", body: words(498) }],
  });
  assert.equal(
    contract.validateBNLJournalPayload(env(e501)).reason,
    "invalid_word_count",
  );
  assert.equal(contract.countJournalWords(makeEntry()), 271);
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

test("route executes auth, raw byte cap, validation, and sanitized success/error responses", async () => {
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
  const unauth = await routeMod.POST(
    new Request("https://x.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
  assert.equal(unauth.status, 401);
  const huge = await routeMod.POST(
    new Request("https://x.test", {
      method: "POST",
      headers: { "x-api-key": "secret", "content-type": "application/json" },
      body: `${body}${" ".repeat(contract.BNL_JOURNAL_MAX_PAYLOAD_BYTES)}`,
    }),
  );
  assert.equal(huge.status, 400);
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
  assert.doesNotMatch(
    html,
    /contentHash|sourceWindowStart|sourceWindowEnd|authoredAt|3a4b2b|2026-07-11T00:00:00Z/,
  );
  assert.equal(article.JournalArticle.toString().includes("useRouter"), false);
});
