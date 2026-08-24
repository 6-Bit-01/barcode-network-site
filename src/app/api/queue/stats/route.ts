import { NextResponse } from "next/server";
import { getPublicQueueStats, normalizeTikTokHandle } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const requestedTikTokHandle = new URL(req.url).searchParams.get("tiktokHandle");
  if (requestedTikTokHandle !== null && !normalizeTikTokHandle(requestedTikTokHandle)) {
    return NextResponse.json({ error: "Enter a valid TikTok handle." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json(await getPublicQueueStats(requestedTikTokHandle), { headers: NO_STORE_HEADERS });
}
