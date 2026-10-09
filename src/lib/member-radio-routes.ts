import "server-only";
import { getMemberArtistContext, isMemberArtistOrigin, memberArtistPrivateHeaders, memberArtistProblem } from "./member-artists";
import { lookupMemberAccess } from "./member-access";
import { getMemberQueueHistory, getMemberQueueArtistLabels, getOwnerQueueArtistCatalog, getOwnerQueueAssociationCandidates } from "./queue";
import { broadcastArchiveArtistHref } from "./broadcast-archive";

function query(request: Request, candidates: boolean) {
  const params = new URL(request.url).searchParams;
  const allowed = candidates ? ["query", "source", "cursor", "limit"] : ["query", "cursor", "limit"];
  for (const [key, value] of params) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error("INVALID_QUERY");
    if (key === "query" && (value.length > 100 || /[\u0000-\u001f\u007f]/.test(value))) throw new Error("INVALID_QUERY");
    if (key === "source" && !["all", "native", "historical"].includes(value)) throw new Error("INVALID_QUERY");
    if (key === "cursor" && !/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error("INVALID_QUERY");
    if (key === "limit" && (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > (candidates ? 25 : 50))) throw new Error("INVALID_QUERY");
  }
  return { query: params.get("query") ?? undefined, cursor: params.get("cursor") ?? undefined, limit: Number(params.get("limit") ?? (candidates ? 25 : 50)), ...(candidates ? { source: (params.get("source") ?? "all") as "all" | "native" | "historical" } : {}) };
}
export async function getMemberRadioHistoryResponse(request: Request): Promise<Response> {
  if (request.method !== "GET") return memberArtistProblem(404, "NOT_FOUND");
  if (!isMemberArtistOrigin(request)) return memberArtistProblem(403, "ORIGIN_DENIED");
  if (new URL(request.url).search) return memberArtistProblem(400, "INVALID_ARTIST_REQUEST");
  const cookie = request.headers.get("cookie") ?? "";
  const context = await getMemberArtistContext(cookie);
  if (!context.ok) return memberArtistProblem(context.status, context.code);
  try {
    const [history, labels] = await Promise.all([
      getMemberQueueHistory({ memberId: context.data.user.id, activeArtistIds: context.data.artists.map(artist => artist.id), approvedLegacyReferences: context.data.legacyReferences }),
      getMemberQueueArtistLabels(context.data.artists.map(artist => artist.projectKey)),
    ]);
    // Sources can take time to read. Do not send a history projection after a grant or session changed.
    const current = await getMemberArtistContext(cookie);
    if (!current.ok) return memberArtistProblem(current.status, current.code);
    if (current.data.user.id !== context.data.user.id || current.data.revision !== context.data.revision) return memberArtistProblem(409, "ARTIST_ACCESS_CHANGED");
    const artists = current.data.artists.map(artist => {
      const label = labels.find(item => item.projectKey === artist.projectKey);
      const projectLabel = label?.projectLabel ?? null;
      return { ...artist, projectLabel, archiveHref: label?.archiveAvailable ? broadcastArchiveArtistHref(artist.projectKey) : null };
    });
    return Response.json({ user: current.data.user, session: current.data.session, artists, history }, { headers: memberArtistPrivateHeaders });
  } catch { return memberArtistProblem(503, "RADIO_HISTORY_UNAVAILABLE"); }
}
async function ownerSourceResponse(request: Request, candidates: boolean): Promise<Response> {
  if (request.method !== "GET") return memberArtistProblem(404, "NOT_FOUND");
  if (!isMemberArtistOrigin(request)) return memberArtistProblem(403, "ORIGIN_DENIED");
  let params;
  try { params = query(request, candidates); } catch { return memberArtistProblem(400, "INVALID_ARTIST_REQUEST"); }
  const cookie = request.headers.get("cookie") ?? "";
  const owner = await lookupMemberAccess(cookie);
  if (!owner.ok) return memberArtistProblem(owner.status, owner.code);
  if (!owner.data.access.owner) return memberArtistProblem(403, "ACCESS_DENIED");
  try {
    const data = candidates ? await getOwnerQueueAssociationCandidates(params) : await getOwnerQueueArtistCatalog(params);
    const current = await lookupMemberAccess(cookie);
    if (!current.ok) return memberArtistProblem(current.status, current.code);
    if (!current.data.access.owner || current.data.user.id !== owner.data.user.id) return memberArtistProblem(403, "ACCESS_DENIED");
    return Response.json(data, { headers: memberArtistPrivateHeaders });
  } catch { return memberArtistProblem(503, "ARTIST_SOURCE_UNAVAILABLE"); }
}
export function getOwnerRadioCandidatesResponse(request: Request) { return ownerSourceResponse(request, true); }
export function getOwnerArtistCatalogResponse(request: Request) { return ownerSourceResponse(request, false); }
