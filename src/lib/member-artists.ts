import "server-only";
import { getMemberServiceConfiguration, type MemberServiceConfiguration } from "./member-service";
import { memberCookies } from "../../services/member-auth/contract.mjs";
import { lookupMemberAccess } from "./member-access";
import { validateMemberQueueHistoryReference, validateMemberQueueArtistProjectKey } from "./queue";
import type { MemberArtistReference, MemberQueueHistory } from "./member-radio-history";

export type MemberArtistLink = { id: string; projectKey: string };
export type MemberHistoryReference = { id: string; artistId: string; reference: MemberArtistReference };
export type MemberArtists = {
  user: { id: string; name: string }; session: { expiresAt: string }; revision: number;
  artists: MemberArtistLink[]; legacyReferences: MemberHistoryReference[];
};
export type OwnerArtistState = {
  targetId: string; revision: number;
  artists: (MemberArtistLink & { approved: boolean })[];
  legacyReferences: (MemberHistoryReference & { approved: boolean })[];
};
export type MemberRadioHistoryResponse = {
  user: MemberArtists["user"]; session: MemberArtists["session"];
  artists: (MemberArtistLink & { projectLabel: string | null; archiveHref: string | null })[];
  history: MemberQueueHistory;
};
export type MemberSubmissionIdentity = {
  submissionMemberId: string; approvedArtistId: string | null; approvedArtistLinkRevision: number | null;
};
type Lookup = { ok: true; data: MemberArtists } | { ok: false; status: number; code: string };
type SubmissionLookup = { ok: true; identity: MemberSubmissionIdentity | null } | { ok: false; status: number; code: string };
export const memberArtistPrivateHeaders = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", vary: "Cookie" };
const canonicalOrigin = "https://www.barcode-network.com";
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const sourceIdentifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const text = (value: unknown, maximum: number): value is string => typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
export function memberArtistProblem(status: number, code: string) { return Response.json({ code }, { status, headers: memberArtistPrivateHeaders }); }
function configured(value: MemberServiceConfiguration | null): value is MemberServiceConfiguration {
  if (!value || value.canonicalOrigin !== canonicalOrigin || !/^[A-Za-z0-9_-]{32,128}$/.test(value.serviceToken)) return false;
  try { const url = new URL(value.serviceUrl); return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash; } catch { return false; }
}
export function isMemberArtistOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return new URL(request.url).origin === canonicalOrigin && (origin === null || origin === canonicalOrigin) && (request.method !== "POST" || origin === canonicalOrigin);
}
async function boundedText(message: Request | Response, maximum: number) {
  if (!message.body) return "";
  const reader = message.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > maximum) throw new Error("BODY_TOO_LARGE"); chunks.push(value); } return Buffer.concat(chunks).toString("utf8"); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_ARTIST_REQUEST");
  return value as Record<string, unknown>;
}
function exactFields(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) throw new Error("INVALID_ARTIST_REQUEST");
}
export function checkedMemberArtistReference(value: unknown): MemberArtistReference {
  const ref = object(value);
  if (ref.kind === "native") {
    exactFields(ref, ["kind", "sessionId", "trackId", "fingerprint"]);
    if (!sourceIdentifier(ref.sessionId) || !sourceIdentifier(ref.trackId) || !hash(ref.fingerprint)) throw new Error("INVALID_ARTIST_REQUEST");
    return { kind: "native", sessionId: ref.sessionId, trackId: ref.trackId, fingerprint: ref.fingerprint };
  }
  if (ref.kind === "historical") {
    exactFields(ref, ["kind", "bundleDigest", "recoveryTrackId"]);
    if (!hash(ref.bundleDigest) || !sourceIdentifier(ref.recoveryTrackId)) throw new Error("INVALID_ARTIST_REQUEST");
    return { kind: "historical", bundleDigest: ref.bundleDigest, recoveryTrackId: ref.recoveryTrackId };
  }
  throw new Error("INVALID_ARTIST_REQUEST");
}
function artistProjection(value: unknown, owner: boolean) {
  const data = object(value);
  if ((!owner && data.approved !== undefined && data.approved !== true) || !uuid(data.id) || !text(data.projectKey, 512) || (owner && typeof data.approved !== "boolean")) throw new Error("INVALID_SERVICE_RESPONSE");
  return { id: data.id, projectKey: data.projectKey, ...(owner ? { approved: data.approved as boolean } : {}) };
}
function referenceProjection(value: unknown, owner: boolean, artistIds: Set<string>) {
  const data = object(value);
  if ((!owner && data.approved !== undefined && data.approved !== true) || !uuid(data.id) || !uuid(data.artistId) || !artistIds.has(data.artistId) || (owner && typeof data.approved !== "boolean")) throw new Error("INVALID_SERVICE_RESPONSE");
  return { id: data.id, artistId: data.artistId, reference: checkedMemberArtistReference(data.reference), ...(owner ? { approved: data.approved as boolean } : {}) };
}
function collections(data: Record<string, unknown>, owner: boolean) {
  if (!Array.isArray(data.artists) || data.artists.length > 100 || !Array.isArray(data.legacyReferences) || data.legacyReferences.length > 500) throw new Error("INVALID_SERVICE_RESPONSE");
  const artists = data.artists.map(value => artistProjection(value, owner));
  const ids = new Set(artists.map(artist => artist.id));
  if (ids.size !== artists.length || new Set(artists.map(artist => artist.projectKey)).size !== artists.length) throw new Error("INVALID_SERVICE_RESPONSE");
  const legacyReferences = data.legacyReferences.map(value => referenceProjection(value, owner, ids));
  if (new Set(legacyReferences.map(ref => ref.id)).size !== legacyReferences.length) throw new Error("INVALID_SERVICE_RESPONSE");
  return { artists, legacyReferences };
}
function ownProjection(value: unknown): MemberArtists {
  const data = object(value), user = object(data.user), session = object(data.session);
  if (!identifier(user.id) || !text(user.name, 80) || typeof session.expiresAt !== "string" || session.expiresAt.length > 40 || !(Date.parse(session.expiresAt) > Date.now()) || !revision(data.revision)) throw new Error("INVALID_SERVICE_RESPONSE");
  return { user: { id: user.id, name: user.name }, session: { expiresAt: session.expiresAt }, revision: data.revision, ...collections(data, false) } as MemberArtists;
}
function ownerProjection(value: unknown, targetId: string): OwnerArtistState {
  const data = object(value);
  if (!identifier(data.targetId) || data.targetId !== targetId || !revision(data.revision)) throw new Error("INVALID_SERVICE_RESPONSE");
  return { targetId: data.targetId, revision: data.revision, ...collections(data, true) } as OwnerArtistState;
}
function actionBody(value: unknown) {
  const body = object(value);
  if (!uuid(body.requestId) || !identifier(body.targetId) || !revision(body.expectedRevision)) throw new Error("INVALID_ARTIST_REQUEST");
  const extras: Record<string, string[]> = { "approve-project": ["projectKey"], "revoke-project": ["artistId"], "approve-history": ["artistId", "reference"], "revoke-history": ["referenceId"] };
  if (typeof body.action !== "string" || !Object.hasOwn(extras, body.action)) throw new Error("INVALID_ARTIST_REQUEST");
  exactFields(body, ["requestId", "targetId", "expectedRevision", "action", ...extras[body.action]]);
  if (body.action === "approve-project" && !text(body.projectKey, 512)) throw new Error("INVALID_ARTIST_REQUEST");
  if ((body.action === "revoke-project" || body.action === "approve-history") && !uuid(body.artistId)) throw new Error("INVALID_ARTIST_REQUEST");
  if (body.action === "revoke-history" && !uuid(body.referenceId)) throw new Error("INVALID_ARTIST_REQUEST");
  if (body.action === "approve-history") body.reference = checkedMemberArtistReference(body.reference);
  return body;
}

export async function proxyMemberArtistRequest(request: Request, path: string, configuration = getMemberServiceConfiguration(), fetcher: typeof fetch = fetch): Promise<Response> {
  const allowed = request.method === "GET" ? ["artists", "owner/artists"].includes(path) : request.method === "POST" && path === "owner/artists/action";
  if (!allowed) return memberArtistProblem(404, "NOT_FOUND");
  if (!configured(configuration)) return memberArtistProblem(503, "ACCOUNT_UNAVAILABLE");
  if (!isMemberArtistOrigin(request)) return memberArtistProblem(403, "ORIGIN_DENIED");
  if (request.method === "POST" && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return memberArtistProblem(415, "JSON_REQUIRED");
  const url = new URL(request.url); let action: Record<string, unknown> | null = null; let targetId = "";
  try {
    if (path === "owner/artists") {
      targetId = url.searchParams.get("targetId") ?? "";
      if (url.searchParams.size !== 1 || url.searchParams.getAll("targetId").length !== 1 || !identifier(targetId)) throw new Error("INVALID_ARTIST_REQUEST");
    } else if (url.search) throw new Error("INVALID_ARTIST_REQUEST");
    if (request.method === "POST") { action = actionBody(JSON.parse(await boundedText(request, 16_384))); targetId = action.targetId as string; }
  } catch (error) { return memberArtistProblem(error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, "INVALID_ARTIST_REQUEST"); }
  const cookie = memberCookies(request.headers.get("cookie") ?? "");
  if (cookie.length > 8192) return memberArtistProblem(400, "INVALID_COOKIE");
  if (action && (action.action === "approve-project" || action.action === "approve-history")) {
    const authority = await lookupMemberAccess(cookie, configuration, fetcher);
    if (!authority.ok) return memberArtistProblem(authority.status, authority.code);
    if (!authority.data.access.owner) return memberArtistProblem(403, "ACCESS_DENIED");
    try {
      const valid = action.action === "approve-project" ? await validateMemberQueueArtistProjectKey(action.projectKey as string) : await validateMemberQueueHistoryReference(action.reference as MemberArtistReference);
      if (!valid) return memberArtistProblem(409, "ARTIST_SOURCE_CHANGED");
    } catch { return memberArtistProblem(503, "ARTIST_SOURCE_UNAVAILABLE"); }
  }
  const headers = new Headers({ "x-barcode-service-token": configuration.serviceToken, origin: canonicalOrigin, "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  let upstream: Response;
  try { upstream = await fetcher(configuration.serviceUrl + "/api/member/" + path + url.search, { method: request.method, headers, ...(action ? { body: JSON.stringify(action) } : {}), cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15_000) }); }
  catch { return memberArtistProblem(503, "ACCOUNT_UNAVAILABLE"); }
  if (upstream.headers.has("location") || (upstream.status >= 300 && upstream.status < 400)) return memberArtistProblem(502, "INVALID_SERVICE_RESPONSE");
  try {
    const data = JSON.parse(await boundedText(upstream, 524_288));
    if (path === "artists" && upstream.status === 404 && data?.code === "NOT_FOUND") {
      // Site and service deploy separately. Existing verified Member authority
      // still saves submission provenance before the explicit Artist migration.
      const member = await lookupMemberAccess(cookie, configuration, fetcher);
      if (!member.ok) return memberArtistProblem(member.status, member.code);
      return Response.json(ownProjection({ user: member.data.user, session: member.data.session, revision: 0, artists: [], legacyReferences: [] }), { headers: memberArtistPrivateHeaders });
    }
    if (!upstream.ok) return memberArtistProblem(upstream.status, typeof data?.code === "string" && /^[A-Z_]{1,64}$/.test(data.code) ? data.code : "ACCOUNT_REQUEST_FAILED");
    if (path === "artists") return Response.json(ownProjection(data), { headers: memberArtistPrivateHeaders });
    if (path === "owner/artists") return Response.json(ownerProjection(data, targetId), { headers: memberArtistPrivateHeaders });
    if (data?.ok !== true) throw new Error("INVALID_SERVICE_RESPONSE");
    return Response.json({ ok: true, state: ownerProjection(data.state, targetId) }, { headers: memberArtistPrivateHeaders });
  } catch { return memberArtistProblem(502, "INVALID_SERVICE_RESPONSE"); }
}
export async function getMemberArtistContext(cookie: string, configuration = getMemberServiceConfiguration(), fetcher: typeof fetch = fetch): Promise<Lookup> {
  const response = await proxyMemberArtistRequest(new Request(canonicalOrigin + "/api/member/artists", { headers: { cookie } }), "artists", configuration, fetcher);
  const data = await response.json();
  return response.ok ? { ok: true, data: data as MemberArtists } : { ok: false, status: response.status, code: data.code };
}
export async function resolveMemberSubmissionIdentity(request: Request, selectedArtistId: unknown, configuration = getMemberServiceConfiguration(), fetcher: typeof fetch = fetch): Promise<SubmissionLookup> {
  const cookie = memberCookies(request.headers.get("cookie") ?? "");
  const automatic = selectedArtistId === undefined || selectedArtistId === null;
  const selected = selectedArtistId === undefined || selectedArtistId === null || selectedArtistId === "" ? null : selectedArtistId;
  if (!/(?:^|;\s*)(?:__Secure-)?barcode_id\.session_token=/.test(cookie)) return selected === null ? { ok: true, identity: null } : { ok: false, status: 401, code: "SIGN_IN_REQUIRED" };
  if (!isMemberArtistOrigin(request)) return { ok: false, status: 403, code: "ORIGIN_DENIED" };
  if (selected !== null && !uuid(selected)) return { ok: false, status: 400, code: "INVALID_ARTIST_REQUEST" };
  const result = await getMemberArtistContext(cookie, configuration, fetcher);
  if (!result.ok) return result;
  const artist = selected === null ? (automatic && result.data.artists.length === 1 ? result.data.artists[0] : null) : result.data.artists.find(item => item.id === selected);
  if (selected !== null && !artist) return { ok: false, status: 403, code: "ARTIST_NOT_APPROVED" };
  return { ok: true, identity: { submissionMemberId: result.data.user.id, approvedArtistId: artist?.id ?? null, approvedArtistLinkRevision: artist ? result.data.revision : null } };
}
