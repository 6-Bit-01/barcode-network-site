import { NextResponse } from "next/server";
import { getHellcatLadder } from "@/lib/hellcat-ladder.server";

export const runtime = "nodejs";

// GET handlers are dynamic by default. Only the validated upstream snapshot
// uses the Data Cache; browsers/CDNs must not extend its freshness window.
export async function GET() {
  const result = await getHellcatLadder();
  return NextResponse.json(result, {
    status: result.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
