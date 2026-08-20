import { NextResponse } from "next/server";
import { verifyStudioOverlayToken } from "@/lib/auth";
import { getWheelOverlaySnapshot } from "@/lib/wheel-overlay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() || null : null;
}

export async function GET(req: Request) {
  const accessToken = bearerToken(req);
  if (!accessToken || !(await verifyStudioOverlayToken(accessToken))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
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
