import { NextResponse } from "next/server";
import { getPublicQueueStats } from "@/lib/queue";
import { buildRadioShowFeature } from "@/lib/radio-show-feature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "x-barcode-submitter-token",
};

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("view") === "feature") {
    try {
      // The Radio landing feature never consumes browser-personal history or
      // admin previews. Share this compact public result across viewers.
      const stats = await getPublicQueueStats(null, true);
      return NextResponse.json(buildRadioShowFeature(stats), {
        headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" },
      });
    } catch {
      return NextResponse.json({ error: "Show details unavailable." }, { status: 503, headers: NO_STORE_HEADERS });
    }
  }
  const submitterToken = req.headers.get("x-barcode-submitter-token")?.trim() ?? "";
  if (submitterToken.length > 512) {
    return NextResponse.json({ error: "Invalid submission browser token." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json(await getPublicQueueStats(submitterToken || null, new URL(req.url).searchParams.get("view") === "played"), { headers: NO_STORE_HEADERS });
}
