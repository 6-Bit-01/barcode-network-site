import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, createStudioOverlayToken, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRODUCTION_ORIGIN = "https://www.barcode-network.com";
const STUDIO_SOURCE_QUERY = "?studioSource=v1";

export async function POST() {
  const adminToken = (await cookies()).get(COOKIE_NAME)?.value;
  if (!adminToken || !(await verifyAdminToken(adminToken))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await createStudioOverlayToken();
  const fragment = `#access=${encodeURIComponent(accessToken)}`;
  return NextResponse.json({
    links: {
      foreground: `${PRODUCTION_ORIGIN}/overlay/foreground${STUDIO_SOURCE_QUERY}${fragment}`,
      radioVisuals: `${PRODUCTION_ORIGIN}/overlay/radio-visuals${STUDIO_SOURCE_QUERY}${fragment}`,
      wheel: `${PRODUCTION_ORIGIN}/overlay/wheel${STUDIO_SOURCE_QUERY}${fragment}`,
    },
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
