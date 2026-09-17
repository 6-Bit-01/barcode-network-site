import { NextResponse } from "next/server";
import { listPublicBallads } from "@/lib/bnl-ballads-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ ballads: await listPublicBallads() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Published Ballads are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
