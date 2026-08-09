import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken, verifyForegroundOverlayToken } from "@/lib/auth";
import { getForegroundOverlaySnapshot } from "@/lib/foreground-overlay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() || null : null;
}

export async function GET(req: Request) {
  const sourceToken = bearerToken(req);
  const adminToken = (await cookies()).get(COOKIE_NAME)?.value ?? null;
  const allowPrivateQueueState = Boolean(
    (sourceToken && await verifyForegroundOverlayToken(sourceToken))
    || (adminToken && await verifyAdminToken(adminToken)),
  );
  const snapshot = await getForegroundOverlaySnapshot(new Date(), { allowPrivateQueueState });
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
