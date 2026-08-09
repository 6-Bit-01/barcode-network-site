import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, createForegroundOverlayToken, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const adminToken = (await cookies()).get(COOKIE_NAME)?.value;
  if (!adminToken || !(await verifyAdminToken(adminToken))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await createForegroundOverlayToken();
  return NextResponse.json({ path: `/overlay/foreground#access=${encodeURIComponent(accessToken)}` }, {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
