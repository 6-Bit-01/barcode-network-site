import { lookupMemberToolAccess, fetchMemberToolInsights } from "@/lib/member-tools";
import { getPublicQueueStats, getQueueSessionShowLog, getRadioQueueState } from "@/lib/queue";
import { crewArchiveShows, crewToolHeaders } from "@/lib/crew-show";
import { buildCrewShowAnalytics } from "@/lib/crew-show-analytics";
import type { QueueState } from "@/lib/queue-types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const permitted = await lookupMemberToolAccess(request, "insights.read");
 if (!permitted.ok) return permitted.response;
 const [archiveResult, accountResult] = await Promise.allSettled([getPublicQueueStats(undefined, false), fetchMemberToolInsights(request)]);
 const stats = archiveResult.status === "fulfilled" ? archiveResult.value : null, archive = crewArchiveShows(stats);
 const reportResults = await Promise.allSettled(archive.slice(0, 2).map(async show => {
  const saved = await getQueueSessionShowLog(show.sessionId);
  if (saved.session.sessionId !== show.sessionId || saved.session.status !== "archived") throw new Error("REPORT_UNAVAILABLE");
  return { sessionId: show.sessionId, report: saved.report };
 }));
 const reports = reportResults.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
 let paymentStates: QueueState[] | undefined, paymentsAvailable = false;
 if (permitted.access.access.owner) {
  paymentStates = []; paymentsAvailable = stats !== null;
  // Bounded, sequential existing-store reads; the DTO states scanned versus retained shows.
  for (const show of archive.slice(0, 20)) {
   try { const state = await getRadioQueueState(show.sessionId); if (state.session?.sessionId !== show.sessionId || state.session.status !== "archived" || state.session.purpose !== "live_broadcast") { paymentsAvailable = false; continue; } paymentStates.push(state); }
   catch { paymentsAvailable = false; }
  }
 }
 const fresh = await lookupMemberToolAccess(request, "insights.read");
 if (!fresh.ok) return fresh.response;
 if (fresh.access.user.id !== permitted.access.user.id || fresh.access.access.owner !== permitted.access.access.owner) return Response.json({ code: "ACCESS_CHANGED" }, { status: 403, headers: crewToolHeaders });
 return Response.json(buildCrewShowAnalytics({ stats, reports, accounts: accountResult.status === "fulfilled" ? accountResult.value?.accounts ?? null : null, owner: fresh.access.access.owner, ...(fresh.access.access.owner ? { paymentStates, paymentsAvailable } : {}) }), { headers: crewToolHeaders });
}
