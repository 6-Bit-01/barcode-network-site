import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, createStudioOverlayToken, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STUDIO_SOURCE_QUERY = "?studioSource=v1";

export async function POST() {
  const adminToken = (await cookies()).get(COOKIE_NAME)?.value;
  if (!adminToken || !(await verifyAdminToken(adminToken))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await createStudioOverlayToken();
  return NextResponse.json({ path: `/overlay/foreground${STUDIO_SOURCE_QUERY}#access=${encodeURIComponent(accessToken)}` }, {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
