import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requestCookieValue } from "@/lib/auth";
import { discordConnectionStore, type DiscordConnectionStore } from "@/lib/discord-connection-store";

export const DISCORD_BROWSER_COOKIE = "barcode_discord_browser";
const FLOW_MS = 10 * 60 * 1000;
const CONNECTION_MS = 180 * 24 * 60 * 60 * 1000;
const CALLBACK = "/api/discord/connection/callback";
const PAGE = "/connect/discord";
const opaque = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const discordConnectionHash = (value: string) => createHash("sha256").update(value).digest("hex");

type Identity = { id: string; userId: string; username: string; verifiedAt: number; expiresAt: number };
type Flow = { stateHash: string; expiresAt: number; stage: "started" | "exchanging" };
type RecordValue = { connection?: Identity; flow?: Flow };
type Configuration = { origin: string; clientId: string; clientSecret: string };
type Options = {
  store?: DiscordConnectionStore;
  config?: Configuration | null;
  fetcher?: typeof fetch;
  now?: () => number;
};

export function discordConnectionConfig(env: NodeJS.ProcessEnv = process.env): Configuration | null {
  if (env.BARCODE_DISCORD_CONNECTION_ENABLED !== "true") return null;
  try {
    const origin = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null;
    if (origin.protocol !== "https:" && !(env.NODE_ENV !== "production" && origin.hostname === "localhost")) return null;
    const clientId = env.DISCORD_CLIENT_ID ?? "";
    const clientSecret = env.DISCORD_CLIENT_SECRET ?? "";
    return /^\d{17,20}$/.test(clientId) && clientSecret ? { origin: origin.origin, clientId, clientSecret } : null;
  } catch { return null; }
}

function cookieId(request: Request) {
  const cookie = requestCookieValue(request, DISCORD_BROWSER_COOKIE);
  return opaque(cookie) ? discordConnectionHash(cookie) : null;
}
function parse(raw: string | null): RecordValue { return raw ? JSON.parse(raw) as RecordValue : {}; }
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
function cookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(DISCORD_BROWSER_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
  return response;
}
function activeIdentity(value: RecordValue, now: number) {
  return value.connection && value.connection.expiresAt > now ? value.connection : null;
}
function ttl(value: RecordValue, now: number) {
  return Math.max(1, Math.ceil((Math.max(value.connection?.expiresAt ?? 0, value.flow?.expiresAt ?? 0) - now) / 1000));
}
async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) throw new Error("Discord unavailable.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) throw new Error("Discord response too large.");
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid response.");
    return result;
  } finally { await reader.cancel().catch(() => {}); }
}

export function createDiscordConnectionService(options: Options = {}) {
  const store = options.store ?? discordConnectionStore();
  const config = options.config === undefined ? discordConnectionConfig() : options.config;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const configuredFor = (request: Request) => Boolean(config && new URL(request.url).origin === config.origin);
  async function mutate(id: string, update: (current: RecordValue) => RecordValue | null | false) {
    for (let n = 0; n < 3; n++) {
      const old = await store.read(id);
      const next = update(parse(old));
      if (next === false) return false;
      if (await store.compareAndSet(id, old, next ? JSON.stringify(next) : null, next ? ttl(next, now()) : 1)) return true;
    }
    throw new Error("Connection changed; retry.");
  }
  async function get(request: Request) {
    try {
      const id = cookieId(request);
      const record = id ? parse(await store.read(id)) : {};
      const connected = activeIdentity(record, now());
      return json({ configured: configuredFor(request), connected: connected ? { username: connected.username, verifiedAt: connected.verifiedAt, expiresAt: connected.expiresAt } : null });
    } catch { return json({ error: "Discord connection status is unavailable. You can still submit your music." }, 503); }
  }
  async function post(request: Request) {
    if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Please use the BARCODE connection page." }, 403);
    try {
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 1024) return json({ error: "Invalid request." }, 400);
      const body = JSON.parse(raw);
      const id = cookieId(request);
      if (body.action === "disconnect") {
        // Available even when the connection feature is switched off.
        if (id) await mutate(id, () => null);
        return cookie(json({ ok: true }), "", 0);
      }
      if (body.action !== "start") return json({ error: "Invalid request." }, 400);
      if (!config || !configuredFor(request)) return json({ error: "Discord connection is not available yet. You can still submit your music." }, 503);
      const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      if (!(await store.allowStart(discordConnectionHash(ip), Math.floor(now() / 60000)))) return json({ error: "Please wait a minute before trying again." }, 429);
      const browser = requestCookieValue(request, DISCORD_BROWSER_COOKIE);
      const browserToken = opaque(browser) ? browser : randomBytes(32).toString("hex");
      const browserId = discordConnectionHash(browserToken);
      const state = randomBytes(32).toString("hex");
      await mutate(browserId, (current) => ({
        ...(activeIdentity(current, now()) ? { connection: current.connection } : {}),
        flow: { stateHash: discordConnectionHash(state), stage: "started", expiresAt: now() + FLOW_MS },
      }));
      const authorize = new URL("https://discord.com/oauth2/authorize");
      authorize.search = new URLSearchParams({ client_id: config.clientId, response_type: "code", scope: "identify", redirect_uri: config.origin + CALLBACK, state, prompt: "consent" }).toString();
      return cookie(json({ authorizationUrl: authorize.toString() }), browserToken, CONNECTION_MS / 1000);
    } catch { return json({ error: "Discord connection could not be saved. Please try again. Your queue submission is unaffected." }, 503); }
  }
  async function callback(request: Request) {
    const result = (status: string) => NextResponse.redirect(new URL(`${PAGE}?result=${status}`, request.url), { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    if (!config || !configuredFor(request)) return result("unavailable");
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const id = cookieId(request);
    if (!id || !opaque(state)) return result("expired");
    const stateHash = discordConnectionHash(state);
    const matches = (value: RecordValue, stage: Flow["stage"]) => value.flow?.stateHash === stateHash && value.flow.stage === stage && value.flow.expiresAt > now();
    let accessToken = "";
    try {
      // Claim once before contacting Discord; duplicates cannot exchange or write twice.
      if (!(await mutate(id, (current) => matches(current, "started") ? { ...current, flow: { ...current.flow!, stage: "exchanging" } } : false))) return result("expired");
      if (url.searchParams.has("error")) return result("cancelled");
      const code = url.searchParams.get("code");
      if (!code || code.length > 2048) return result("expired");
      const token = await boundedJson(await fetcher("https://discord.com/api/oauth2/token", {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", code, redirect_uri: config.origin + CALLBACK }),
      }));
      if (typeof token.access_token !== "string" || token.access_token.length > 2048 || token.token_type !== "Bearer" || token.scope !== "identify") throw new Error("Invalid token.");
      accessToken = token.access_token;
      const user = await boundedJson(await fetcher("https://discord.com/api/v10/users/@me", { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${accessToken}` } }));
      if (typeof user.id !== "string" || !/^\d{17,20}$/.test(user.id) || typeof user.username !== "string" || !user.username || user.username.length > 32 || /[\x00-\x1f\x7f]/.test(user.username) || user.bot === true || user.system === true) throw new Error("Invalid user.");
      const connected: Identity = { id: randomBytes(32).toString("hex"), userId: user.id, username: user.username, verifiedAt: now(), expiresAt: now() + CONNECTION_MS };
      // A disconnect, new attempt or timeout during the provider awaits wins.
      if (!(await mutate(id, (current) => matches(current, "exchanging") ? { connection: connected } : false))) return result("expired");
      return result("connected");
    } catch { return result("unavailable"); }
    finally {
      // Tokens are transient. Neither access/refresh tokens nor auth codes enter storage/logs.
      if (accessToken) {
        try {
          await fetcher("https://discord.com/api/oauth2/token/revoke", { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, token: accessToken, token_type_hint: "access_token" }) });
        } catch { /* Expiring provider grant is not retained or used again. */ }
      }
    }
  }
  return { get, post, callback };
}

/** Private submitter attribution only. Never implies artist/TikTok ownership. */
export async function requestDiscordConnectionId(request: Request): Promise<string | null> {
  if (!discordConnectionConfig()) return null;
  const id = cookieId(request);
  if (!id) return null;
  try {
    const connected = activeIdentity(parse(await discordConnectionStore().read(id)), Date.now());
    return connected ? `${id}.${connected.id}` : null;
  }
  catch { return null; } // Optional identity must not block music submission.
}

/** Service-side adapter for the later BNL consumer. Re-read before use; never cache as canon. */
export async function resolveDiscordConnection(reference: string, store = discordConnectionStore(), now = Date.now()) {
  if (!discordConnectionConfig()) return null;
  const [browserId, connectionId, extra] = reference.split(".");
  if (!opaque(browserId) || !opaque(connectionId) || extra !== undefined) return null;
  const connected = activeIdentity(parse(await store.read(browserId)), now);
  return connected?.id === connectionId ? connected : null;
}
