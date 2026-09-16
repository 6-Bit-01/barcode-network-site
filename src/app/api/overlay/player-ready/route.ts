import { NextResponse } from "next/server";
import { verifyStudioOverlayToken } from "@/lib/auth";
import { acknowledgeVideoPreparation } from "@/lib/live-overlay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The Studio capability may acknowledge the current preparation only. It cannot
// select a track, request a start, or mutate the queue.
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !(await verifyStudioOverlayToken(token))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const ready = await acknowledgeVideoPreparation(body.prepareToken);
    return NextResponse.json({ ready }, { status: ready ? 200 : 409, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Readiness acknowledgement unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
