import { lookupMemberToolAccess } from "@/lib/member-tools";
import { getPublicQueueStats, getRadioLiveQueueState } from "@/lib/queue";
import { getLiveOverlayRuntimeState } from "@/lib/live-overlay";
import { attachQueueLiveTiming } from "@/lib/queue-live-timing";
import { buildCrewShowOverview, crewToolHeaders } from "@/lib/crew-show";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const permitted = await lookupMemberToolAccess(request, "show.overview");
 if (!permitted.ok) return permitted.response;
 const now = new Date();
 const [queue, archive, runtime] = await Promise.allSettled([getRadioLiveQueueState(), getPublicQueueStats(undefined, false), getLiveOverlayRuntimeState()]);
 const state = queue.status === "fulfilled" ? { ...attachQueueLiveTiming(queue.value, runtime.status === "fulfilled" ? runtime.value.playerSync : null, runtime.status === "fulfilled" ? runtime.value.overlayState : null, now), ...(runtime.status !== "fulfilled" || !runtime.value.overlayState ? { wheelTiming: null } : {}) } : null;
 const fresh = await lookupMemberToolAccess(request, "show.overview");
 if (!fresh.ok) return fresh.response;
 if (fresh.access.user.id !== permitted.access.user.id) return Response.json({ code: "ACCESS_CHANGED" }, { status: 403, headers: crewToolHeaders });
 const selected = new URL(request.url).searchParams.get("trackId") ?? undefined;
 return Response.json(buildCrewShowOverview(state, archive.status === "fulfilled" ? archive.value : null, selected && selected.length <= 128 ? selected : undefined, now), { headers: crewToolHeaders });
}
