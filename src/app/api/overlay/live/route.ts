import { NextResponse } from "next/server";
import { verifyStudioOverlayToken } from "@/lib/auth";
import { getResolvedLiveOverlayScene } from "@/lib/live-overlay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() || null : null;
}

export async function GET(req: Request) {
  const accessToken = bearerToken(req);
  const allowPrivateQueueState = Boolean(accessToken && await verifyStudioOverlayToken(accessToken));
  const serverRequestReceivedAt = new Date();
  const scene = await getResolvedLiveOverlayScene({ allowPrivateQueueState });
  const serverNow = new Date();
  return NextResponse.json({ scene, serverRequestReceivedAt: serverRequestReceivedAt.toISOString(), serverNow: serverNow.toISOString() }, {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
