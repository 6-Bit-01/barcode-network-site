import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) return path.join(root, "src", request.slice(2)) + ".ts";
  return originalResolve.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const require = createRequire(import.meta.url);
const { createDiscordConnectionService, discordConnectionConfig, resolveDiscordConnection, requestDiscordConnectionId } = require("../src/lib/discord-connection.ts");
const { verifyAdminToken } = require("../src/lib/auth.ts");
const origin = "https://barcode.example.test";
const config = { origin, clientId: "123456789012345678", clientSecret: "test-client-secret" };
process.env.BARCODE_DISCORD_CONNECTION_ENABLED = "true";
process.env.DISCORD_CLIENT_ID = config.clientId;
process.env.DISCORD_CLIENT_SECRET = config.clientSecret;
process.env.NEXT_PUBLIC_SITE_URL = origin;
const startTime = Date.parse("2026-09-24T12:00:00Z");

class MemoryStore {
  rows = new Map();
  rateAllowed = true;
  writes = 0;
  async read(id) { return this.rows.get(id) ?? null; }
  async compareAndSet(id, previous, next) {
    if ((this.rows.get(id) ?? null) !== previous) return false;
    this.writes++;
    if (next === null) this.rows.delete(id); else this.rows.set(id, next);
    return true;
  }
  async allowStart() { return this.rateAllowed; }
}
function harness(options = {}) {
  const store = new MemoryStore();
  let clock = startTime;
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (options.fetcher) return options.fetcher(url, init);
    if (url.endsWith("/token")) return Response.json({ access_token: "transient-access", refresh_token: "transient-refresh", token_type: "Bearer", scope: "identify" });
    if (url.endsWith("/@me")) return Response.json({ id: "123456789012345679", username: "test.member", email: "discard@example.test", global_name: "Discard Display Name" });
    return new Response(null, { status: 200 });
  };
  const service = createDiscordConnectionService({ store, config, fetcher, now: () => clock });
  return { store, service, calls, advance: (ms) => { clock += ms; } };
}
function post(action, cookie = "", extra = {}) {
  return new Request(origin + "/api/discord/connection", { method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
}
async function start(h, previousCookie = "") {
  const response = await h.service.post(post("start", previousCookie));
  assert.equal(response.status, 200);
  const authorize = new URL((await response.json()).authorizationUrl);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  return { cookie, state: authorize.searchParams.get("state"), authorize };
}
function callback(flow, options = {}) {
  const url = new URL(origin + "/api/discord/connection/callback");
  url.search = new URLSearchParams({ state: flow.state, ...(options.error ? { error: options.error } : { code: "test-code" }) }).toString();
  return new Request(url, { headers: { cookie: flow.cookie } });
}
const result = (response) => new URL(response.headers.get("location")).searchParams.get("result");

test("connection requires explicit configuration, canonical origin and identify only", async () => {
  const base = { BARCODE_DISCORD_CONNECTION_ENABLED: "true", DISCORD_CLIENT_ID: config.clientId, DISCORD_CLIENT_SECRET: config.clientSecret, NEXT_PUBLIC_SITE_URL: origin, NODE_ENV: "production" };
  assert.equal(discordConnectionConfig({ ...base, BARCODE_DISCORD_CONNECTION_ENABLED: "false" }), null);
  assert.equal(discordConnectionConfig({ ...base, DISCORD_CLIENT_SECRET: "" }), null);
  assert.equal(discordConnectionConfig({ ...base, NEXT_PUBLIC_SITE_URL: "http://barcode.example.test" }), null);
  assert.equal(discordConnectionConfig({ ...base, NEXT_PUBLIC_SITE_URL: "https://user:password@barcode.example.test" }), null);
  assert.deepEqual(discordConnectionConfig(base), config);
  const h = harness();
  const flow = await start(h);
  assert.equal(flow.authorize.origin, "https://discord.com");
  assert.equal(flow.authorize.searchParams.get("scope"), "identify");
  assert.equal(flow.authorize.searchParams.get("redirect_uri"), origin + "/api/discord/connection/callback");
  assert.match(flow.state, /^[a-f0-9]{64}$/);
  assert.equal(await verifyAdminToken(flow.cookie.split("=")[1]), false);
  assert.ok(!JSON.stringify([...h.store.rows.values()]).includes(flow.state));
  assert.ok(!JSON.stringify([...h.store.rows.values()]).includes(flow.cookie.split("=")[1]));
});

test("successful identity is private, provider-issued and revocable; tokens are discarded", async () => {
  const h = harness();
  const flow = await start(h);
  assert.equal(result(await h.service.callback(callback(flow))), "connected");
  const response = await h.service.get(new Request(origin + "/api/discord/connection", { headers: { cookie: flow.cookie } }));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const status = await response.json();
  assert.equal(status.connected.username, "test.member");
  assert.ok(!JSON.stringify(status).includes("123456789012345679"));
  const raw = [...h.store.rows.values()][0];
  for (const forbidden of ["transient-access", "transient-refresh", "test-code", "discard@example.test", "Discard Display Name"]) assert.ok(!raw.includes(forbidden));
  const [browserId] = h.store.rows.keys();
  const reference = `${browserId}.${JSON.parse(raw).connection.id}`;
  assert.equal((await resolveDiscordConnection(reference, h.store, startTime)).userId, "123456789012345679");
  assert.equal(h.calls.filter(call => call.url.endsWith("/revoke")).length, 1);
  assert.equal(result(await h.service.callback(callback(flow))), "expired");
  assert.equal(h.calls.filter(call => call.url.endsWith("/token")).length, 1);
  assert.equal((await h.service.post(post("disconnect", flow.cookie))).status, 200);
  assert.equal(await resolveDiscordConnection(reference, h.store, startTime), null);
});

test("wrong browser, missing state, expired attempt and forged identity cannot connect", async () => {
  const h = harness();
  const flow = await start(h);
  assert.equal(result(await h.service.callback(callback({ ...flow, cookie: `barcode_discord_browser=${"a".repeat(64)}` }))), "expired");
  assert.equal(result(await h.service.callback(callback({ ...flow, state: "" }))), "expired");
  assert.equal((await h.service.post(post("verify", flow.cookie, { userId: "123456789012345679", username: "forged" }))).status, 400);
  h.advance(600001);
  assert.equal(result(await h.service.callback(callback(flow))), "expired");
  assert.equal(h.calls.length, 0);
});

test("CSRF, disabled configuration and rate limit perform no connection writes", async () => {
  const h = harness();
  const bad = new Request(origin + "/api/discord/connection", { method: "POST", headers: { Origin: "https://other.example.test" }, body: JSON.stringify({ action: "start" }) });
  assert.equal((await h.service.post(bad)).status, 403);
  assert.equal((await createDiscordConnectionService({ store: h.store, config: null }).post(post("start"))).status, 503);
  h.store.rateAllowed = false;
  assert.equal((await h.service.post(post("start"))).status, 429);
  assert.equal(h.store.writes, 0);
});

test("cancellation and provider failure do not replace an existing connection", async () => {
  const h = harness();
  const first = await start(h);
  await h.service.callback(callback(first));
  const next = await start(h, first.cookie);
  assert.equal(result(await h.service.callback(callback(next, { error: "access_denied" }))), "cancelled");
  assert.equal((await (await h.service.get(new Request(origin, { headers: { cookie: first.cookie } }))).json()).connected.username, "test.member");
  const failing = harness({ fetcher: async () => { throw new Error("secret provider detail"); } });
  const failedFlow = await start(failing);
  assert.equal(result(await failing.service.callback(callback(failedFlow))), "unavailable");
  assert.ok(!JSON.stringify([...failing.store.rows.values()]).includes("secret provider detail"));
});

test("disconnect during token exchange prevents late callback resurrection", async () => {
  let release;
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const h = harness({ fetcher: async (url) => {
    if (url.endsWith("/token")) { entered(); await blocked; return Response.json({ access_token: "ephemeral", token_type: "Bearer", scope: "identify" }); }
    if (url.endsWith("/@me")) return Response.json({ id: "123456789012345679", username: "test.member" });
    return new Response(null);
  } });
  const flow = await start(h);
  const completing = h.service.callback(callback(flow));
  await waiting;
  await h.service.post(post("disconnect", flow.cookie));
  release();
  assert.equal(result(await completing), "expired");
  assert.equal(h.store.rows.size, 0);
});

test("a newer attempt supersedes old callbacks; reconnect never reassigns old tracks", async () => {
  const h = harness();
  const first = await start(h);
  const second = await start(h, first.cookie);
  assert.equal(result(await h.service.callback(callback(first))), "expired");
  assert.equal(result(await h.service.callback(callback(second))), "connected");
  const [browserId] = h.store.rows.keys();
  const oldReference = `${browserId}.${JSON.parse(h.store.rows.get(browserId)).connection.id}`;
  const third = await start(h, first.cookie);
  await h.service.callback(callback(third));
  assert.equal(await resolveDiscordConnection(oldReference, h.store, startTime), null);
  const newReference = `${browserId}.${JSON.parse(h.store.rows.get(browserId)).connection.id}`;
  assert.notEqual(newReference, oldReference);
  assert.equal((await resolveDiscordConnection(newReference, h.store, startTime)).username, "test.member");
});

test("disconnect still works after activation is disabled, and anonymous intake stays independent", async () => {
  const h = harness();
  const flow = await start(h);
  await h.service.callback(callback(flow));
  const disabled = createDiscordConnectionService({ store: h.store, config: null });
  assert.equal((await disabled.post(post("disconnect", flow.cookie))).status, 200);
  assert.equal(h.store.rows.size, 0);
  assert.equal(await requestDiscordConnectionId(new Request(origin)), null);
});

test("provider identity validation fails closed and discards excess data", async () => {
  for (const user of [{ id: "not-an-id", username: "test" }, { id: "123456789012345679", username: "test", bot: true }, { id: "123456789012345679", username: "x".repeat(33) }]) {
    const h = harness({ fetcher: async url => url.endsWith("/token") ? Response.json({ access_token: "transient", token_type: "Bearer", scope: "identify" }) : url.endsWith("/@me") ? Response.json(user) : new Response(null) });
    const flow = await start(h);
    assert.equal(result(await h.service.callback(callback(flow))), "unavailable");
    assert.ok(![...h.store.rows.values()].some(raw => JSON.parse(raw).connection));
  }
});

test("simultaneous callbacks exchange once and the kill switch disables resolution", async () => {
  const h = harness();
  const flow = await start(h);
  const results = await Promise.all([h.service.callback(callback(flow)), h.service.callback(callback(flow))]);
  assert.deepEqual(results.map(result).sort(), ["connected", "expired"]);
  assert.equal(h.calls.filter(call => call.url.endsWith("/token")).length, 1);
  const [id] = h.store.rows.keys();
  const ref = `${id}.${JSON.parse(h.store.rows.get(id)).connection.id}`;
  process.env.BARCODE_DISCORD_CONNECTION_ENABLED = "false";
  try { assert.equal(await resolveDiscordConnection(ref, h.store, startTime), null); }
  finally { process.env.BARCODE_DISCORD_CONNECTION_ENABLED = "true"; }
});
