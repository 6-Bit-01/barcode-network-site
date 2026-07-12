import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getLiveOverlayAdminSnapshot, setLiveOverlayState } from "@/lib/live-overlay";

export const dynamic = "force-dynamic";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getLiveOverlayAdminSnapshot(), { headers: { "Cache-Control": "no-store" } });
}

function transportHeaders(serverRequestReceivedAt: Date, serverResponseGeneratedAt: Date) {
  return {
    "Cache-Control": "no-store",
    "X-BNL-Request-Received-At": serverRequestReceivedAt.toISOString(),
    "X-BNL-Response-Generated-At": serverResponseGeneratedAt.toISOString(),
  };
}

export async function POST(req: Request) {
  const serverRequestReceivedAt = new Date();
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const snapshot = await setLiveOverlayState(body, serverRequestReceivedAt);
    const serverResponseGeneratedAt = new Date();
    return NextResponse.json(snapshot, { headers: transportHeaders(serverRequestReceivedAt, serverResponseGeneratedAt) });
  } catch (error) {
    const serverResponseGeneratedAt = new Date();
    return NextResponse.json({ error: error instanceof Error ? error.message : "Overlay update failed." }, { status: 400, headers: transportHeaders(serverRequestReceivedAt, serverResponseGeneratedAt) });
  }
}
