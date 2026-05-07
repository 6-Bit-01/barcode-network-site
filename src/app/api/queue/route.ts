import { NextResponse } from "next/server";
import { getQueueState } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getQueueState());
  } catch (error) {
    console.error("[queue/get]", error);
    return NextResponse.json({ error: "Queue unavailable" }, { status: 500 });
  }
}
