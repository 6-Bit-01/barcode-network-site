import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(read(file), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(code, {
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
    module: cjsModule, exports: cjsModule.exports, process: { env: {} }, URL, Buffer, AbortSignal, AbortController, Date, ...globals,
  }, { filename: file });
  return cjsModule.exports;
}

const contract = load("src/lib/hellcat-ladder.ts");
const at = Date.parse("2026-09-29T12:00:00Z");
const tracks = [
  { rank: 1, title: "First song", artist: "HΞLLCΛT", score: 78.5 },
  { rank: 2, title: null, artist: null, score: null },
  { rank: 4, title: "Higher score, lower rank", artist: "Another artist", score: 100 },
  { rank: 5, title: "Zero rating", artist: "Artist", score: 0 },
];
const snapshot = { tracks, fetchedAt: new Date(at).toISOString() };
const config = { url: "https://ladder.example.test/ladder", token: "fixture-secret-do-not-publish" };
const env = { HELLCAT_LADDER_URL: config.url, HELLCAT_LADDER_TOKEN: config.token };

function server({ fetcher = async () => Response.json({ tracks }), cache, environment = env } = {}) {
  const records = [];
  const memory = new Map();
  const cacheFactory = cache ?? ((fn, keys, options) => {
    records.push({ keys, options });
    return async () => {
      const key = JSON.stringify(keys);
      if (!memory.has(key)) memory.set(key, await fn());
      return memory.get(key);
    };
  });
  const api = load("src/lib/hellcat-ladder.server.ts", {
    "server-only": {}, "@/lib/hellcat-ladder": contract, "next/cache": { unstable_cache: cacheFactory },
  }, { fetch: fetcher, process: { env: { ...environment } } });
  return { ...api, records, memory };
}

test("official order, gaps, nullable credits and zero/decimal scores survive; extra fields do not", () => {
  assert.deepEqual(plain(contract.parseHellcatTracks({ tracks: tracks.map((track) => ({ ...track, privateNote: "discard" })), token: config.token })), tracks);
  assert.deepEqual(plain(contract.parseHellcatTracks({ tracks: [] })), []);
  for (const payload of [null, [], {}, { error: "unauthorized" }, { error: "unauthorized", tracks }]) assert.equal(contract.parseHellcatTracks(payload), null);
});

test("malformed, reordered or oversized ladders fail as a whole, never as a partial ranking", () => {
  for (const bad of [
    { rank: 0 }, { rank: 1.5 }, { rank: 2 }, { rank: "1" }, { rank: Infinity },
    { title: undefined }, { artist: {} }, { title: "x".repeat(1001) },
    { score: -1 }, { score: 101 }, { score: "85" }, { score: NaN }, { score: undefined },
  ]) assert.equal(contract.parseHellcatTracks({ tracks: [{ ...tracks[0], ...bad }] }), null);
  for (const entries of [[tracks[0], tracks[0]], [tracks[0], tracks[2], tracks[1]], [tracks[0], null]]) {
    assert.equal(contract.parseHellcatTracks({ tracks: entries }), null);
  }
  assert.equal(contract.parseHellcatTracks({ tracks: Array.from({ length: 1001 }, (_, i) => ({ ...tracks[0], rank: i + 1 })) }), null);
});

test("configuration is server-only, requires both values and accepts a changed HTTPS /ladder URL", () => {
  const { hellcatLadderConfig } = server();
  assert.deepEqual(plain(hellcatLadderConfig(env)), config);
  for (const url of ["http://ladder.example.test/ladder", "https://user:pass@ladder.example.test/ladder", "https://ladder.example.test/other", "https://ladder.example.test/ladder?token=x", "https://ladder.example.test/ladder#x", "bad"]) {
    assert.equal(hellcatLadderConfig({ ...env, HELLCAT_LADDER_URL: url }), null);
  }
  for (const token of ["", "two words", "line\r\nbreak", "x".repeat(4097)]) assert.equal(hellcatLadderConfig({ ...env, HELLCAT_LADDER_TOKEN: token }), null);
  assert.equal(hellcatLadderConfig({}), null);
  assert.equal(hellcatLadderConfig({ NEXT_PUBLIC_HELLCAT_LADDER_URL: config.url, NEXT_PUBLIC_HELLCAT_LADDER_TOKEN: config.token }), null);
  assert.equal(hellcatLadderConfig({ ...env, HELLCAT_LADDER_URL: "https://new-tunnel.trycloudflare.com/ladder" }).url, "https://new-tunnel.trycloudflare.com/ladder");
});

test("server sends only a bounded GET with bearer auth, refuses redirects, and projects public fields", async () => {
  const { fetchHellcatLadder } = server();
  let call;
  const result = await fetchHellcatLadder(config, async (url, init) => {
    call = { url, init };
    return Response.json({ tracks: tracks.map((t) => ({ ...t, internal: config.token })), secret: config.token });
  }, () => at);
  assert.deepEqual(plain(result), snapshot);
  assert.equal(call.url, config.url);
  assert.equal(call.init.method, "GET");
  assert.equal(call.init.headers.Authorization, `Bearer ${config.token}`);
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.cache, "no-store");
  assert.ok(call.init.signal instanceof AbortSignal);
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|example\.test|internal/);
});

test("auth errors, outages, redirects, invalid JSON, timeouts and oversized streamed bodies are unavailable", async () => {
  const { fetchHellcatLadder } = server();
  for (const make of [
    () => Response.json({ error: "unauthorized" }, { status: 401 }),
    () => Response.json({ error: "unauthorized" }),
    () => Response.json({ tracks }, { status: 503 }),
    () => new Response(null, { status: 302, headers: { Location: "https://other.example.test" } }),
    () => new Response("<html>gateway error</html>"),
    () => Response.json({ tracks: [{ ...tracks[0], score: 200 }] }),
    () => new Response("x".repeat(512 * 1024 + 1)),
    () => { throw new DOMException("fixture private timeout detail", "TimeoutError"); },
    () => { throw new Error("fixture private network detail"); },
  ]) assert.equal(await fetchHellcatLadder(config, async () => make()), null);
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(300 * 1024)); },
    cancel() { cancelled = true; },
  });
  assert.equal(await fetchHellcatLadder(config, async () => new Response(stream)), null);
  assert.equal(cancelled, true);
});

test("cache reuses sanitized success and failure, varies with configuration, and never receives raw secrets", async () => {
  let calls = 0;
  const h = server({ fetcher: async () => { calls++; return Response.json({ tracks }); } });
  assert.equal((await h.getHellcatLadder()).status, "ready");
  await h.getHellcatLadder();
  assert.equal(calls, 1);
  assert.equal(h.records[0].options.revalidate, 180);
  assert.doesNotMatch(JSON.stringify([...h.memory]) + JSON.stringify(h.records), /fixture-secret|ladder\.example/);
  const originalKey = h.records[0].keys;
  for (const environment of [{ ...env, HELLCAT_LADDER_URL: "https://changed.example.test/ladder" }, { ...env, HELLCAT_LADDER_TOKEN: "replacement-fixture-token" }]) {
    const changed = server({ environment });
    await changed.getHellcatLadder();
    assert.notDeepEqual(changed.records[0].keys, originalKey);
  }
  let failures = 0;
  const failed = server({ fetcher: async () => { failures++; return Response.json({ error: "unauthorized" }); } });
  assert.equal((await failed.getHellcatLadder()).status, "unavailable");
  assert.equal((await failed.getHellcatLadder()).status, "unavailable");
  assert.equal(failures, 1);
  const missing = server({ environment: {}, fetcher: async () => { assert.fail("must not fetch without configuration"); } });
  assert.equal((await missing.getHellcatLadder()).status, "unavailable");
});

test("concurrent cold reads or revalidations share a single upstream request in one instance", async () => {
  let release;
  let calls = 0;
  const h = server({ cache: (fn) => fn, fetcher: async () => {
    calls++;
    await new Promise((resolve) => { release = resolve; });
    return Response.json({ tracks });
  } });
  const first = h.getHellcatLadder();
  const second = h.getHellcatLadder();
  assert.equal(calls, 1);
  release();
  assert.equal((await first).status, "ready");
  assert.equal((await second).status, "ready");
});

test("stale snapshots are labeled and withheld at ten minutes, including framework-retained stale values", async () => {
  assert.equal(contract.hellcatLadderResult(snapshot, at + 179999).status, "ready");
  assert.equal(contract.hellcatLadderResult(snapshot, at + 180000).status, "stale");
  assert.equal(contract.hellcatLadderResult(snapshot, at + 599999).ageMs, 599999);
  for (const now of [at - 1, at + 600000, NaN]) assert.equal(contract.hellcatLadderResult(snapshot, now).snapshot, null);
  assert.equal(contract.hellcatLadderResult({ ...snapshot, fetchedAt: "invalid" }, at).snapshot, null);
  const old = { ...snapshot, fetchedAt: new Date(Date.now() - 600001).toISOString() };
  const h = server({ cache: () => async () => old });
  assert.deepEqual(plain(await h.getHellcatLadder()), { status: "unavailable", snapshot: null });
  const brokenCache = server({ cache: () => async () => { throw new Error("private cache diagnostic"); } });
  assert.equal((await brokenCache.getHellcatLadder()).status, "unavailable");
});

test("public route ignores visitor credentials and URLs, returns no-store JSON and fails honestly", async () => {
  let result = contract.hellcatLadderResult(snapshot, at);
  const route = load("src/app/api/hellcat/ladder/route.ts", {
    "@/lib/hellcat-ladder.server": { getHellcatLadder: async (...args) => { assert.equal(args.length, 0); return result; } },
  });
  const request = new Request("https://barcode.example.test/api/hellcat/ladder?url=https://evil.example&token=visitor", { headers: { Authorization: "Bearer visitor-secret" } });
  let response = await route.GET(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), plain(result));
  result = { status: "unavailable", snapshot: null };
  response = await route.GET(request);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), result);
  assert.deepEqual(Object.keys(route).sort(), ["GET", "runtime"]);
});

test("table renders official order, nulls, zero and escaped text, with distinct loading/empty/error/stale states", () => {
  const { HellcatLadderView } = load("src/components/HellcatLadder.tsx", {
    "@/lib/hellcat-ladder": contract, "@/lib/session-bound-polling": {},
  });
  const React = require("react");
  const render = (result) => require("react-dom/server").renderToStaticMarkup(React.createElement(HellcatLadderView, { result }));
  const html = render(contract.hellcatLadderResult({ ...snapshot, tracks: [{ ...tracks[0], title: "<script>alert('x')</script>" }, ...tracks.slice(1)] }, at));
  assert.match(html, /HΞLLCΛT/);
  assert.match(html, /Untitled track/);
  assert.match(html, /Unknown artist/);
  assert.match(html, /Not scored/);
  assert.match(html, />0<\/span>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.indexOf("HΞLLCΛT") < html.indexOf("Higher score"));
  assert.match(html, /<caption/);
  assert.match(html, /scope="col"/);
  assert.match(html, /scope="row"/);
  assert.match(render(null), /Loading Hellcat/);
  assert.match(render({ status: "unavailable", snapshot: null }), /temporarily unavailable/);
  assert.match(render(contract.hellcatLadderResult({ ...snapshot, tracks: [] }, at)), /No tracks are listed/);
  assert.match(render(contract.hellcatLadderResult(snapshot, at + 180000)), /Refresh pending/);
});

test("browser requests only the public route, ages from server time and clears data after failure or expiry", async () => {
  let poll, cleanup, state, stopped = false;
  const timers = new Map();
  let timerId = 0;
  let response = Response.json({ status: "stale", snapshot, ageMs: 599000 });
  const calls = [];
  const { HellcatLadder } = load("src/components/HellcatLadder.tsx", {
    react: { useState: () => [null, (value) => { state = value; }], useEffect: (effect) => { cleanup = effect(); } },
    "@/lib/hellcat-ladder": contract,
    "@/lib/session-bound-polling": { startSessionBoundPolling: (options) => {
      assert.equal(options.intervalMs, 180000);
      assert.equal(options.standbyIntervalMs, 180000);
      poll = options.poll;
      return () => { stopped = true; };
    } },
  }, {
    window: { setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: (id) => timers.delete(id) },
    fetch: async (...args) => { calls.push(args); return response; },
  });
  HellcatLadder();
  await poll();
  assert.equal(state.status, "stale", "fixture date is deliberately older than the browser clock");
  assert.equal(calls[0][0], "/api/hellcat/ladder");
  assert.equal(calls[0][1].credentials, "omit");
  assert.equal(calls[0][1].headers, undefined);
  const expiry = [...timers.values()].find((timer) => timer.ms === 1000);
  assert.ok(expiry);
  expiry.fn();
  assert.equal(state.snapshot, null);
  response = Response.json({ status: "ready", snapshot, ageMs: 0 });
  await poll();
  assert.equal(state.status, "ready");
  [...timers.values()].find((timer) => timer.ms === 180000).fn();
  assert.equal(state.status, "stale");
  response = new Response("unavailable", { status: 503 });
  await poll();
  assert.equal(state.snapshot, null);
  assert.equal(timers.size, 0);
  cleanup();
  assert.equal(stopped, true);
  assert.equal(calls.at(-1)[1].signal.aborted, true);
});

test("Contests has its own canonical page and discovery links, with no ladder on Radio", async () => {
  const React = require("react");
  const render = require("react-dom/server").renderToStaticMarkup;
  const page = load("src/app/contests/page.tsx", {
    "@/components/HellcatLadder": { HellcatLadder: () => React.createElement("section", { id: "hellcat-fixture" }) },
  });
  assert.equal(page.metadata.alternates.canonical, "/contests");
  assert.match(render(React.createElement(page.default)), /<h1[^>]*>Contests<\/h1>/);
  assert.match(render(React.createElement(page.default)), /hellcat-fixture/);
  assert.doesNotMatch(read("src/app/radio/page.tsx"), /Hellcat|hellcat|\/contests/);

  const { Footer } = load("src/components/Footer.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/image": ({ src, alt }) => React.createElement("img", { src, alt }),
    "@/content": { siteConfig: { name: "BARCODE", logo: "/logo.png" }, externalLinks: { discord: "https://discord.example.test", tiktok: "https://tiktok.example.test" } },
  });
  for (const external of [true, false]) {
    const html = render(React.createElement(Footer, { submission: { external, href: external ? "https://auxchord.example.test" : "/queue", resourceLabel: "Submit", footerSummary: "BARCODE" } }));
    assert.match(html, /href="\/contests"[^>]*>Community Contests<\/a>/);
    assert.match(html, external ? /href="https:\/\/auxchord\.example\.test"/ : /href="\/queue"/);
  }
  const sitemap = load("src/app/sitemap.ts", {
    "@/content": { databasePage: { entries: [] } },
    "@/lib/transmissions": { getAllTransmissions: () => [] },
    "@/lib/bnl-journal-store": { listAllBNLJournalEntries: async () => ({ ok: true, value: [] }) },
  });
  const urls = (await sitemap.default()).map((entry) => entry.url);
  assert.equal(urls.filter((url) => url === "https://www.barcode-network.com/contests").length, 1);
});
