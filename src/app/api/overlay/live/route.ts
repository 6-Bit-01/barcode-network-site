import { NextResponse } from "next/server";
import { getResolvedLiveOverlayScene } from "@/lib/live-overlay";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ scene: await getResolvedLiveOverlayScene() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
