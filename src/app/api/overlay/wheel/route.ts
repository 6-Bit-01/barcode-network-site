import { NextResponse } from "next/server";
import { getWheelOverlaySnapshot } from "@/lib/wheel-overlay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const serverRequestReceivedAt = new Date();
  const snapshot = await getWheelOverlaySnapshot(serverRequestReceivedAt);
  const serverNow = new Date();
  return NextResponse.json({
    snapshot,
    serverRequestReceivedAt: serverRequestReceivedAt.toISOString(),
    serverNow: serverNow.toISOString(),
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
