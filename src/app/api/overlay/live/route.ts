import { NextResponse } from "next/server";
import { getResolvedLiveOverlayScene } from "@/lib/live-overlay";

export const dynamic = "force-dynamic";

export async function GET() {
  const scene = await getResolvedLiveOverlayScene();
  return NextResponse.json({ scene, serverNow: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
