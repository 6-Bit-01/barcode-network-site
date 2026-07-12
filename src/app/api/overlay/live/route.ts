import { NextResponse } from "next/server";
import { getResolvedLiveOverlayScene } from "@/lib/live-overlay";

export const dynamic = "force-dynamic";

export async function GET() {
  const serverRequestReceivedAt = new Date();
  const scene = await getResolvedLiveOverlayScene();
  const serverNow = new Date();
  return NextResponse.json({ scene, serverRequestReceivedAt: serverRequestReceivedAt.toISOString(), serverNow: serverNow.toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
