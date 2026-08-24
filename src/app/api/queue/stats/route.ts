import { NextResponse } from "next/server";
import { getPublicQueueStats } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "x-barcode-submitter-token",
};

export async function GET(req: Request) {
  const submitterToken = req.headers.get("x-barcode-submitter-token")?.trim() ?? "";
  if (submitterToken.length > 512) {
    return NextResponse.json({ error: "Invalid submission browser token." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json(await getPublicQueueStats(submitterToken || null), { headers: NO_STORE_HEADERS });
}
