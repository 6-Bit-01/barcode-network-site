import { redirect } from "next/navigation";
import { broadcastArchiveShowHref } from "@/lib/broadcast-archive";
export const dynamic = "force-dynamic";
export default async function BroadcastBallads({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const { show, q } = await searchParams;
  if (show) redirect(`${broadcastArchiveShowHref(show)}#broadcast-ballad`);
  redirect(`/bnl/music${typeof q === "string" && q ? `?q=${encodeURIComponent(q.slice(0, 200))}` : ""}`);
}
