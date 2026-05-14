import { NextResponse } from "next/server";
import { getLiveOverlayState } from "@/lib/live-overlay";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getLiveOverlayState(), {
    headers: { "Cache-Control": "no-store" },
  });
}
