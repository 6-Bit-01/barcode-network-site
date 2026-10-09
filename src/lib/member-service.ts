import "server-only";
import { isIP } from "node:net";
import { AUTH_PATH, allowedEndpoint, memberCookies, normalizeBody, safeRedirect } from "../../services/member-auth/contract.mjs";

export type MemberServiceConfiguration = { serviceUrl: string; serviceToken: string; canonicalOrigin: string };
const canonicalOrigin = "https://www.barcode-network.com";
const privateHeaders = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
function validServiceToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 128 && !/[^A-Za-z0-9_-]/.test(value);
}
export function getMemberServiceConfiguration(): MemberServiceConfiguration | null {
  const serviceUrl = process.env.BARCODE_MEMBER_SERVICE_URL;
  const serviceToken = process.env.BARCODE_MEMBER_SERVICE_TOKEN;
  if (!serviceUrl || !validServiceToken(serviceToken)) return null;
  try {
    const url = new URL(serviceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { serviceUrl: url.origin, serviceToken, canonicalOrigin };
  } catch { return null; }
}
function problem(status: number, code: string) { return Response.json({ code }, { status, headers: privateHeaders }); }
async function boundedText(request: Request | Response, maximum: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) throw new Error("BODY_TOO_LARGE");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function proxyMemberRequest(request: Request, path: string, configuration = getMemberServiceConfiguration(), fetcher: typeof fetch = fetch): Promise<Response> {
  if (!allowedEndpoint(path, request.method)) return problem(404, "NOT_FOUND");
  if (!configuration || !validServiceToken(configuration.serviceToken)) return problem(503, "ACCOUNT_UNAVAILABLE");
  const { serviceUrl, serviceToken, canonicalOrigin: origin } = configuration;
  const requestURL = new URL(request.url);
  if (requestURL.origin !== origin) return problem(403, "ORIGIN_DENIED");
  if (request.method === "POST" && request.headers.get("origin") !== origin) return problem(403, "ORIGIN_DENIED");
  if (request.method === "POST" && !request.headers.get("content-type")?.startsWith("application/json")) return problem(415, "JSON_REQUIRED");
  let body: string | undefined;
  try {
    if (request.method === "POST") body = JSON.stringify(normalizeBody(path, JSON.parse(await boundedText(request, 16_384)), origin));
    for (const field of ["callbackURL", "redirectTo"]) {
      const value = requestURL.searchParams.get(field);
      if (value !== null && !safeRedirect(value, origin)) return problem(400, "INVALID_RETURN_LINK");
    }
  } catch (error) { return problem(error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, "INVALID_ACCOUNT_REQUEST"); }
  const headers = new Headers({ "x-barcode-service-token": serviceToken, "content-type": "application/json", "origin": origin });
  const cookie = memberCookies(request.headers.get("cookie") ?? "");
  if (cookie.length > 8192) return problem(400, "INVALID_COOKIE");
  if (cookie) headers.set("cookie", cookie);
  // Vercel overwrites X-Forwarded-For. Never accept the caller's service-IP header.
  const address = request.headers.get("x-forwarded-for")?.trim() ?? "";
  headers.set("x-barcode-client-ip", isIP(address) ? address : "0.0.0.0");
  let upstream: Response;
  try {
    upstream = await fetcher(`${serviceUrl}${AUTH_PATH}/${path}${requestURL.search}`, { method: request.method, headers, body, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch { return problem(503, "ACCOUNT_UNAVAILABLE"); }
  const responseHeaders = new Headers(privateHeaders);
  for (const cookie of upstream.headers.getSetCookie()) {
    if (/^(?:__Secure-)?barcode_id\.[A-Za-z0-9_.-]+=/.test(cookie) && !/;\s*domain=/i.test(cookie) && /;\s*secure(?:;|$)/i.test(cookie) && /;\s*httponly(?:;|$)/i.test(cookie)) responseHeaders.append("set-cookie", cookie);
  }
  const location = upstream.headers.get("location");
  if (location) {
    const redirect = safeRedirect(location, origin);
    if (!redirect || ![302,303,307,308].includes(upstream.status)) return problem(502, "INVALID_SERVICE_RESPONSE");
    responseHeaders.set("location", redirect);
    return new Response(null, { status: upstream.status, headers: responseHeaders });
  }
  try {
    const data = JSON.parse(await boundedText(upstream, 65_536));
    if (!upstream.ok) return Response.json({ code: typeof data?.code === "string" ? data.code : "ACCOUNT_REQUEST_FAILED" }, { status: upstream.status, headers: responseHeaders });
    if (path === "get-session") {
      if (!data?.user?.emailVerified) return Response.json(null, { headers: responseHeaders });
      return Response.json({ user: { id: data.user.id, name: data.user.name, email: data.user.email, emailVerified: true }, session: { expiresAt: data.session?.expiresAt } }, { headers: responseHeaders });
    }
    return Response.json({ ok: true }, { headers: responseHeaders });
  } catch { return problem(502, "INVALID_SERVICE_RESPONSE"); }
}
