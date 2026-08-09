import { NextResponse } from "next/server";
import { getForegroundOverlaySnapshot } from "@/lib/foreground-overlay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const snapshot = await getForegroundOverlaySnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
