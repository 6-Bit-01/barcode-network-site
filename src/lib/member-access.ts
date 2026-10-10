import "server-only";
import { getMemberServiceConfiguration, type MemberServiceConfiguration } from "./member-service";
import { memberCookies } from "../../services/member-auth/contract.mjs";

export type MemberAccess = {
  user: { id: string; name: string };
  session: { expiresAt: string };
  access: { owner: boolean; crew: boolean; permissions: string[]; availablePermissions: string[] };
};
export type OwnerAccount = {
  id: string; name: string; email: string; emailVerified: boolean; suspended: boolean;
  owner: boolean; crew: boolean; permissions: string[]; revision: number; createdAt: string;
};
type Lookup = { ok: true; data: MemberAccess } | { ok: false; status: number; code: string };
const privateHeaders = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
const permissionIds = ["support.conversations", "show.overview", "song.generate", "quality.reports", "insights.read"];
const canonicalOrigin = "https://www.barcode-network.com";
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const name = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 80 && !/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value);
const permissions = (value: unknown): value is string[] => Array.isArray(value) && value.length <= permissionIds.length && value.every(item => typeof item === "string" && permissionIds.includes(item)) && new Set(value).size === value.length;
const date = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
function problem(status: number, code: string) { return Response.json({ code }, { status, headers: privateHeaders }); }
function configured(value: MemberServiceConfiguration | null): value is MemberServiceConfiguration {
  if (!value || value.canonicalOrigin !== canonicalOrigin || typeof value.serviceToken !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(value.serviceToken)) return false;
  try { const url = new URL(value.serviceUrl); return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash; }
  catch { return false; }
}
async function boundedText(message: Request | Response, maximum: number) {
  if (!message.body) return "";
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > maximum) throw new Error("BODY_TOO_LARGE"); chunks.push(value); }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function accessProjection(value: unknown): MemberAccess {
  if (!value || typeof value !== "object") throw new Error("INVALID_SERVICE_RESPONSE");
  const data = value as MemberAccess;
  if (!identifier(data.user?.id) || !name(data.user?.name) || !date(data.session?.expiresAt) || Date.parse(data.session.expiresAt) <= Date.now()) throw new Error("INVALID_SERVICE_RESPONSE");
  if (!data.access || typeof data.access.owner !== "boolean" || typeof data.access.crew !== "boolean" || !permissions(data.access.permissions) || !permissions(data.access.availablePermissions) || (!data.access.crew && data.access.permissions.length > 0)) throw new Error("INVALID_SERVICE_RESPONSE");
  return { user: { id: data.user.id, name: data.user.name }, session: { expiresAt: data.session.expiresAt }, access: { owner: data.access.owner, crew: data.access.crew, permissions: [...data.access.permissions], availablePermissions: [...data.access.availablePermissions] } };
}
function accountProjection(value: unknown): OwnerAccount {
  if (!value || typeof value !== "object") throw new Error("INVALID_SERVICE_RESPONSE");
  const data = value as OwnerAccount;
  if (!identifier(data.id) || !name(data.name) || typeof data.email !== "string" || data.email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(data.email) || !date(data.createdAt)) throw new Error("INVALID_SERVICE_RESPONSE");
  if ([data.emailVerified, data.suspended, data.owner, data.crew].some(item => typeof item !== "boolean") || !permissions(data.permissions) || (!data.crew && data.permissions.length > 0) || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error("INVALID_SERVICE_RESPONSE");
  return { id: data.id, name: data.name, email: data.email, emailVerified: data.emailVerified, suspended: data.suspended, owner: data.owner, crew: data.crew, permissions: [...data.permissions], revision: data.revision, createdAt: data.createdAt };
}
function directoryQuery(url: URL) {
  const choices: Record<string, string[]> = { sort: ["name", "newest"], verification: ["all", "verified", "unverified"], status: ["all", "active", "suspended"], role: ["all", "member", "crew", "owner"] };
  for (const [key, value] of url.searchParams) {
    if (url.searchParams.getAll(key).length !== 1) throw new Error("INVALID_ACCOUNT_REQUEST");
    if (key in choices) { if (!choices[key].includes(value)) throw new Error("INVALID_ACCOUNT_REQUEST"); }
    else if (key === "query") { if (value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("INVALID_ACCOUNT_REQUEST"); }
    else if (key === "cursor") { if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error("INVALID_ACCOUNT_REQUEST"); }
    else if (key === "limit") { if (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 50) throw new Error("INVALID_ACCOUNT_REQUEST"); }
    else throw new Error("INVALID_ACCOUNT_REQUEST");
  }
}
function actionBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_ACCOUNT_REQUEST");
  const body = value as Record<string, unknown>;
  if (typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId) || !identifier(body.targetId) || !Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) throw new Error("INVALID_ACCOUNT_REQUEST");
  const extras: Record<string, string[]> = { "set-name": ["name"], "set-crew": ["assigned", "permissions"], suspend: [], reactivate: [], "revoke-sessions": [], "send-recovery": [] };
  if (typeof body.action !== "string" || !(body.action in extras)) throw new Error("INVALID_ACCOUNT_REQUEST");
  const fields = ["requestId", "targetId", "expectedRevision", "action", ...extras[body.action]];
  if (Object.keys(body).some(key => !fields.includes(key))) throw new Error("INVALID_ACCOUNT_REQUEST");
  if (body.action === "set-name" && !name(body.name)) throw new Error("INVALID_ACCOUNT_REQUEST");
  if (body.action === "set-crew" && (typeof body.assigned !== "boolean" || !permissions(body.permissions) || (!body.assigned && (body.permissions as string[]).length > 0))) throw new Error("INVALID_ACCOUNT_REQUEST");
  return body;
}

export async function proxyMemberAccessRequest(request: Request, path: string, configuration = getMemberServiceConfiguration(), fetcher: typeof fetch = fetch): Promise<Response> {
  const allowed = (path === "access" || path === "owner/accounts") ? request.method === "GET" : path === "owner/accounts/action" && request.method === "POST";
  if (!allowed) return problem(404, "NOT_FOUND");
  if (!configured(configuration)) return problem(503, "ACCOUNT_UNAVAILABLE");
  const url = new URL(request.url), origin = request.headers.get("origin");
  if (url.origin !== canonicalOrigin || (origin !== null && origin !== canonicalOrigin) || (request.method === "POST" && origin !== canonicalOrigin)) return problem(403, "ORIGIN_DENIED");
  if (request.method === "POST" && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return problem(415, "JSON_REQUIRED");
  let body: string | undefined;
  try {
    if (path === "owner/accounts") directoryQuery(url);
    else if (url.search) throw new Error("INVALID_ACCOUNT_REQUEST");
    if (request.method === "POST") body = JSON.stringify(actionBody(JSON.parse(await boundedText(request, 16_384))));
  } catch (error) { return problem(error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, "INVALID_ACCOUNT_REQUEST"); }
  const headers = new Headers({ "x-barcode-service-token": configuration.serviceToken, origin: canonicalOrigin, "content-type": "application/json" });
  const cookie = memberCookies(request.headers.get("cookie") ?? "");
  if (cookie.length > 8192) return problem(400, "INVALID_COOKIE");
  if (cookie) headers.set("cookie", cookie);
  let upstream: Response;
  try { upstream = await fetcher(configuration.serviceUrl + "/api/member/" + path + url.search, { method: request.method, headers, body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15_000) }); }
  catch { return problem(503, "ACCOUNT_UNAVAILABLE"); }
  if (upstream.headers.has("location") || (upstream.status >= 300 && upstream.status < 400)) return problem(502, "INVALID_SERVICE_RESPONSE");
  try {
    const data = JSON.parse(await boundedText(upstream, 65_536));
    if (!upstream.ok) return problem(upstream.status, typeof data?.code === "string" && /^[A-Z_]{1,64}$/.test(data.code) ? data.code : "ACCOUNT_REQUEST_FAILED");
    if (path === "access") return Response.json(accessProjection(data), { headers: privateHeaders });
    if (path === "owner/accounts") {
      if (!Array.isArray(data?.accounts) || data.accounts.length > 50 || !(data.nextCursor === null || (typeof data.nextCursor === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(data.nextCursor)))) throw new Error("INVALID_SERVICE_RESPONSE");
      return Response.json({ accounts: data.accounts.map(accountProjection), nextCursor: data.nextCursor }, { headers: privateHeaders });
    }
    if (data?.ok !== true) throw new Error("INVALID_SERVICE_RESPONSE");
    return Response.json({ ok: true, account: accountProjection(data.account) }, { headers: privateHeaders });
  } catch { return problem(502, "INVALID_SERVICE_RESPONSE"); }
}
export async function lookupMemberAccess(cookie: string, configuration = getMemberServiceConfiguration(), fetcher: typeof fetch = fetch): Promise<Lookup> {
  const request = new Request(canonicalOrigin + "/api/member/access", { headers: { cookie } });
  const response = await proxyMemberAccessRequest(request, "access", configuration, fetcher);
  const data = await response.json();
  return response.ok ? { ok: true, data: data as MemberAccess } : { ok: false, status: response.status, code: data.code };
}
export async function requireMemberWorkspaceAccess(workspace: "owner" | "crew"): Promise<MemberAccess> {
  const { headers } = await import("next/headers");
  const { redirect, notFound } = await import("next/navigation");
  const incoming = await headers();
  if (incoming.get("host") === "barcode-network.com") redirect(canonicalOrigin + "/account/" + workspace);
  const result = await lookupMemberAccess(incoming.get("cookie") ?? "");
  if (!result.ok) {
    if (result.status === 401) redirect("/account");
    if (result.status === 403) notFound();
    throw new Error("Account access is temporarily unavailable. Please try again.");
  }
  if (!result.data.access[workspace]) notFound();
  return result.data;
}
