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
  const code = ts.transpileModule(read(file), { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(code, { require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
    module: cjsModule, exports: cjsModule.exports, process: { env: {} }, URL, Buffer, AbortSignal, AbortController,
    Date, setTimeout, clearTimeout, ...globals }, { filename: file });
  return cjsModule.exports;
}
const contract = load("src/lib/hellcat-now-playing.ts");
const at = Date.parse("2026-10-06T12:00:00Z");
const track = { live: true, track_id: "10966", title: "Beautiful Dark", artist: "Test Artist",
  started_at: "2026-10-06T11:50:00.000Z", stream_url: "https://radio.example.test/live.mp3" };
const live = (overrides = {}) => ({ ...track, ageMs: 0, ...overrides });
const environment = { HELLCAT_LADDER_TOKEN: "fixture-radio-secret", UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "fixture-storage-secret", VERCEL_ENV: "production", VERCEL_URL: "production.example.test" };

function server({ env = environment, backing = new Map(), failure = false } = {}) {
  const calls = [], warnings = [], invalidations = [], cacheRecords = [];
  const cache = new Map();
  const clock = { now: at };
  const vars = { ...env };
  class Redis {
    constructor(options) { calls.push(["configuration", options]); }
    async set(key, value, options) {
      calls.push(["set", key, plain(value), options]);
      if (failure) throw new Error("private fixture-storage-secret detail");
      backing.set(key, plain(value)); return "OK";
    }
    async get(key) {
      calls.push(["get", key]);
      if (failure) throw new Error("private fixture-radio-secret detail");
      return backing.get(key) ?? null;
    }
  }
  const api = load("src/lib/hellcat-now-playing.server.ts", {
    "server-only": {}, "@/lib/hellcat-now-playing": contract, "@upstash/redis": { Redis },
    "next/cache": {
      unstable_cache: (fn, keys, options) => {
        cacheRecords.push({ keys, options });
        return async () => {
          const key = JSON.stringify(keys);
          if (!cache.has(key)) cache.set(key, await fn());
          return cache.get(key);
        };
      },
      revalidateTag: (tag, profile) => { invalidations.push([tag, profile]); cache.clear(); },
    },
  }, { process: { env: vars }, console: { warn: (...args) => warnings.push(plain(args)) },
    Date: class extends Date { static now() { return clock.now; } } });
  return { ...api, clock, env: vars, calls, warnings, invalidations, cacheRecords, backing };
}
function request(body = track, auth = "Bearer fixture-radio-secret", extra = {}) {
  return new Request("https://website.example.test/api/now-playing", { method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}), ...extra }, body: JSON.stringify(body) });
}
function route(serverApi) {
  return load("src/app/api/now-playing/route.ts", {
    "@/lib/hellcat-now-playing": contract, "@/lib/hellcat-now-playing.server": serverApi,
    "next/server": { NextResponse: Response },
  });
}

test("radio updates project only public fields; inactive updates discard manual-request metadata", () => {
  assert.deepEqual(plain(contract.parseHellcatNowPlaying({ ...track, title: " Beautiful Dark ", artist: " Test Artist ",
    token: "secret", discord_id: "private", file_path: "/private", receivedAt: at })), track);
  assert.deepEqual(plain(contract.parseHellcatNowPlaying({ ...track, live: false, manual_request: "private" })), {
    live: false, track_id: null, title: null, artist: null, started_at: null, stream_url: null,
  });
  assert.equal(contract.parseHellcatNowPlaying({ ...track, title: "  ", artist: "" }).title, null);
  for (const patch of [{ live: "true" }, { live: 1 }, { track_id: 10966 }, { track_id: "" },
    { title: {} }, { artist: "x".repeat(1001) }, { started_at: null }, { started_at: "yesterday" },
    { started_at: "2026-10-06T12:00:00" }, { stream_url: null }]) {
    assert.equal(contract.parseHellcatNowPlaying({ ...track, ...patch }), null);
  }
});

test("stream URLs exclude non-HTTPS, credentials, token queries and local addresses", () => {
  assert.equal(contract.hellcatStreamUrl(track.stream_url), track.stream_url);
  for (const url of ["http://radio.example.test/live.mp3", "javascript:alert(1)", "data:audio/mp3;base64,abc",
    "https://user:pass@radio.example.test/live.mp3", "https://radio.example.test/live.mp3?token=secret",
    "https://radio.example.test/live.mp3#secret", "https://localhost/live.mp3", "https://127.0.0.1/live.mp3",
    "https://[::1]/live.mp3", "https://radio.local/live.mp3", "bad"]) assert.equal(contract.hellcatStreamUrl(url), null);
});

test("freshness uses receive time even for a long song and cannot be renewed by reads", () => {
  const snapshot = { state: track, receivedAt: at };
  assert.equal(contract.hellcatRadioResult(snapshot, at + 89999).live, true);
  assert.equal(contract.hellcatRadioResult(snapshot, at + 89999).ageMs, 89999);
  for (const now of [at + 90000, at - 1, NaN]) assert.deepEqual(plain(contract.hellcatRadioResult(snapshot, now)), { live: false });
  assert.equal(contract.hellcatRadioResult({ state: { ...track, live: false }, receivedAt: at }, at).live, false);
  for (const value of [null, {}, { ...live(), ageMs: -1 }, { ...live(), ageMs: 90000 },
    { ...live(), ageMs: "0" }, { ...live(), stream_url: "http://unsafe.example.test" }]) {
    assert.equal(contract.parseHellcatRadioResult(value).live, false);
  }
});

test("matching trims both labels, ignores case, and never overrides differing IDs", () => {
  const row = { title: " BEAUTIFUL dark ", artist: " test ARTIST " };
  assert.equal(contract.hellcatTrackIsLive(row, live()), true);
  assert.equal(contract.hellcatTrackIsLive({ ...row, track_id: "10966" }, live()), true);
  assert.equal(contract.hellcatTrackIsLive({ ...row, track_id: "different" }, live()), false);
  for (const row of [{ title: null, artist: null }, { title: "Beautiful Dark", artist: "Different Artist" },
    { title: "", artist: "Test Artist" }]) assert.equal(contract.hellcatTrackIsLive(row, live()), false);
  assert.equal(contract.hellcatTrackIsLive(row, { live: false }), false);
});

test("POST authenticates before consuming a body, rejects browser credentials and never echoes secrets", async () => {
  const h = server(), api = route(h);
  for (const auth of [null, "Bearer wrong", "fixture-radio-secret", "Bearer fixture-radio-secret-extra"]) {
    const req = request(track, auth);
    const response = await api.POST(req);
    assert.equal(response.status, 401);
    assert.equal(req.bodyUsed, false);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await response.text(), /fixture-radio-secret|fixture-storage-secret/);
  }
  assert.equal(h.calls.length, 0);
  assert.equal(server({ env: {} }).authorizeHellcatRadio(request()), false);
});

test("accepted POSTs persist a sanitized 90-second snapshot and immediately invalidate public cache", async () => {
  const h = server(), api = route(h);
  assert.equal((await api.POST(request({ ...track, token: "private", receivedAt: at + 999999 }))).status, 200);
  const write = h.calls.find((call) => call[0] === "set");
  assert.equal(write[3].ex, 90);
  assert.deepEqual(write[2], { state: track, receivedAt: at });
  assert.doesNotMatch(write[1], /fixture-radio-secret|fixture-storage-secret/);
  assert.deepEqual(plain(h.invalidations[0][1]), { expire: 0 });
  const response = await api.GET(new Request("https://website.example.test/api/now-playing?token=other"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), live());
  h.clock.now += 90000;
  assert.deepEqual(plain(await h.getHellcatNowPlaying()), { live: false }, "cached metadata is re-aged on every read");
});

test("POST body validation rejects malformed, oversized and incorrect media types without changing live state", async () => {
  const h = server(), api = route(h);
  await api.POST(request());
  const writes = () => h.calls.filter((call) => call[0] === "set").length;
  for (const [req, status] of [
    [request({ ...track, live: "true" }), 400],
    [request(track, "Bearer fixture-radio-secret", { "Content-Type": "text/plain" }), 415],
    [request({ ...track, unused: "x".repeat(17000) }), 413],
    [new Request("https://website.example.test/api/now-playing", { method: "POST", headers: request().headers, body: "{" }), 400],
  ]) assert.equal((await api.POST(req)).status, status);
  assert.equal(writes(), 1);
  assert.deepEqual(plain(await h.getHellcatNowPlaying()), live());
  let cancelled = false;
  const req = new Request("https://website.example.test/api/now-playing", { method: "POST", headers: request().headers,
    duplex: "half", body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(17000)); }, cancel() { cancelled = true; } }) });
  assert.equal((await api.POST(req)).status, 413);
  assert.equal(cancelled, true);
  assert.equal(writes(), 1);
});

test("shared storage supports separate webhook/read instances; heartbeat updates clear cached idle and live states", async () => {
  const backing = new Map(), writer = server({ backing }), reader = server({ backing });
  await writer.saveHellcatNowPlaying(track);
  assert.deepEqual(plain(await reader.getHellcatNowPlaying()), live());
  await reader.getHellcatNowPlaying();
  assert.equal(reader.calls.filter((call) => call[0] === "get").length, 1);
  assert.equal(reader.cacheRecords[0].options.revalidate, 5);
  await reader.saveHellcatNowPlaying(contract.parseHellcatNowPlaying({ live: false }));
  assert.deepEqual(plain(await reader.getHellcatNowPlaying()), { live: false });
  await reader.saveHellcatNowPlaying(track);
  assert.equal((await reader.getHellcatNowPlaying()).live, true);
  for (const changes of [{ HELLCAT_LADDER_TOKEN: "rotated-fixture" }, { VERCEL_ENV: "preview" }, { VERCEL_URL: "other.example.test" }]) {
    assert.equal((await server({ backing, env: { ...environment, ...changes } }).getHellcatNowPlaying()).live, false);
  }
  assert.doesNotMatch(JSON.stringify(reader.cacheRecords), /fixture-radio-secret|fixture-storage-secret|redis.example/);
});

test("missing configuration or storage failure never acknowledges a lost update or fabricates live state", async () => {
  for (const options of [{ env: { HELLCAT_LADDER_TOKEN: environment.HELLCAT_LADDER_TOKEN } }, { failure: true }]) {
    const h = server(options), api = route(h);
    assert.equal((await api.POST(request())).status, 503);
    assert.deepEqual(await (await api.GET()).json(), { live: false });
    assert.doesNotMatch(JSON.stringify(h.warnings), /fixture-radio-secret|fixture-storage-secret|private/);
  }
});

class Audio extends EventTarget {
  paused = true; playCalls = 0; pauseCalls = 0; loads = 0; sources = [];
  set src(value) { this.sources.push(value); }
  play() { this.playCalls++; this.paused = false; return this.promise ?? Promise.resolve(); }
  pause() { this.pauseCalls++; this.paused = true; this.dispatchEvent(new Event("pause")); }
  removeAttribute() {}
  load() { this.loads++; }
}
const playerModule = load("src/lib/hellcat-radio-player.ts");
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test("audio defaults off; one opt-in stream survives track and ladder changes without reloading", async () => {
  const audio = new Audio(), states = [], player = playerModule.createHellcatRadioPlayer(audio, (state) => states.push(state));
  player.update(live());
  assert.equal(audio.playCalls, 0);
  player.toggle(); await flush();
  assert.equal(audio.playCalls, 1);
  assert.equal(states.at(-1), "playing");
  player.update(live({ title: "Next Track", artist: "Next Artist", track_id: "10967", started_at: "2026-10-06T12:05:00Z" }));
  assert.equal(audio.playCalls, 1);
  assert.deepEqual(audio.sources, [track.stream_url]);
  assert.equal(audio.loads, 0);
  player.toggle();
  assert.equal(audio.paused, true);
  assert.equal(player.isListening(), false);
  player.dispose();
});

test("idle and stale state pause; a new live track resumes only for someone who opted in", async () => {
  const audio = new Audio(), player = playerModule.createHellcatRadioPlayer(audio, () => {});
  player.update(live()); player.toggle(); await flush();
  player.update({ live: false });
  assert.equal(audio.paused, true);
  assert.equal(player.isListening(), true);
  player.update(live({ track_id: "10967" })); await flush();
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.loads, 0);
  player.toggle(); player.update(null); player.update(live());
  assert.equal(audio.playCalls, 2, "a deliberate pause is never undone by a heartbeat");
  player.dispose();
});

test("autoplay rejection and stream errors leave a retryable button; waiting can recover naturally", async () => {
  const audio = new Audio(), states = [], player = playerModule.createHellcatRadioPlayer(audio, (state) => states.push(state));
  audio.promise = Promise.reject(new DOMException("blocked", "NotAllowedError"));
  player.update(live()); player.toggle(); await flush();
  assert.equal(states.at(-1), "blocked");
  assert.equal(player.isListening(), false);
  audio.paused = true; audio.promise = Promise.resolve();
  player.toggle(); await flush();
  audio.dispatchEvent(new Event("waiting")); assert.equal(states.at(-1), "connecting");
  audio.dispatchEvent(new Event("playing")); assert.equal(states.at(-1), "playing");
  audio.dispatchEvent(new Event("error")); assert.equal(states.at(-1), "error");
  assert.equal(audio.paused, true);
  player.update(live()); assert.equal(audio.playCalls, 2);
  player.toggle(); await flush(); assert.equal(states.at(-1), "playing");
  player.dispose();
});

test("late play promises cannot restore stale playback or update an unmounted player", async () => {
  const audio = new Audio(), states = [], player = playerModule.createHellcatRadioPlayer(audio, (state) => states.push(state));
  let release; audio.promise = new Promise((resolve) => { release = resolve; });
  player.update(live()); player.toggle(); player.update(null);
  release(); await flush();
  audio.dispatchEvent(new Event("playing"));
  assert.equal(audio.paused, true);
  assert.equal(states.at(-1), "paused");
  player.dispose(); const count = states.length;
  audio.dispatchEvent(new Event("playing")); await flush();
  assert.equal(states.length, count);
});

test("only matching live rows expose a dot and accessible listening control, with safe duplicate-name behavior", () => {
  const React = require("react");
  const ladder = load("src/lib/hellcat-ladder.ts");
  const { HellcatLadderView } = load("src/components/HellcatLadder.tsx", {
    "@/lib/hellcat-ladder": ladder, "@/lib/hellcat-now-playing": contract,
    "@/lib/session-bound-polling": {}, "@/components/useHellcatRadio": {},
  });
  const tracks = [ { rank: 1, title: "Beautiful Dark", artist: "Test Artist", score: 90 },
    { rank: 2, title: "Other Track", artist: "Other Artist", score: 89 } ];
  const result = { status: "ready", snapshot: { tracks, fetchedAt: new Date(at).toISOString() }, ageMs: 0 };
  const render = (radio, entries = tracks) => require("react-dom/server").renderToStaticMarkup(React.createElement(HellcatLadderView,
    { result: { ...result, snapshot: { ...result.snapshot, tracks: entries } }, radio: { nowPlaying: radio, playback: "paused", toggleListen: () => {} } }));
  const html = render(live());
  assert.equal((html.match(/data-radio-live="true"/g) ?? []).length, 1);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, /aria-label="Listen to HellcatNZ radio"/);
  assert.match(html, /aria-pressed="false"/);
  assert.doesNotMatch(html, /no audio/i);
  for (const radio of [null, { live: false }, live({ artist: "Different Artist" })]) assert.doesNotMatch(render(radio), /<button|data-radio-live/);
  assert.equal((render(live(), [tracks[0], { ...tracks[0], rank: 2 }]).match(/data-radio-live="true"/g) ?? []).length, 2);
});

test("browser polling expires from server age, continues for background listeners and cleans up fully", async () => {
  const refs = [], states = [], effects = [], timers = new Map(), events = new Map(), docEvents = new Map();
  const audio = new Audio(); let id = 0, calls = 0, response = live({ ageMs: 89000 });
  const document = { visibilityState: "visible", addEventListener: (name, fn) => docEvents.set(name, fn), removeEventListener: (name) => docEvents.delete(name) };
  const window = { setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimeout: (id) => timers.delete(id),
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name) };
  const { useHellcatRadio } = load("src/components/useHellcatRadio.ts", {
    "@/lib/hellcat-now-playing": contract, "@/lib/hellcat-radio-player": playerModule,
    react: { useRef: (value) => { const ref = { current: value }; refs.push(ref); return ref; },
      useState: (value) => { const index = states.length; states.push(value); return [value, (next) => { states[index] = next; }]; },
      useEffect: (fn) => effects.push(fn) },
  }, { window, document, performance: { now: () => 0 }, fetch: async (url, options) => {
    assert.equal(url, "/api/now-playing"); assert.equal(options.credentials, "omit"); assert.equal(options.headers, undefined);
    calls++; return Response.json(response);
  } });
  const hook = useHellcatRadio([{ rank: 1, title: track.title, artist: track.artist, score: 80 }]);
  refs[0].current = audio;
  effects[0](); const cleanup = effects[1](); await flush(); await flush();
  assert.equal(states[0].live, true);
  const expiry = [...timers.values()].find((timer) => timer.ms === 1000);
  assert.ok(expiry);
  hook.toggleListen(); await flush(); await flush();
  document.visibilityState = "hidden"; docEvents.get("visibilitychange")(); await flush(); await flush();
  assert.equal(refs[1].current.isListening(), true);
  assert.ok([...timers.values()].some((timer) => timer.ms === 10000), "a listener continues receiving heartbeats in a hidden tab");
  expiry.fn(); assert.equal(states[0], null); assert.equal(audio.paused, true);
  response = { live: false }; events.get("online")(); await flush(); await flush();
  assert.equal(states[0], null);
  cleanup(); const before = calls;
  assert.equal(timers.size, 0); assert.equal(events.size, 0); assert.equal(docEvents.size, 0);
  hook.toggleListen(); await flush(); assert.equal(calls, before); assert.equal(audio.paused, true);
});
