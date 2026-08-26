import { NextResponse } from "next/server";
import { createRehearsalQueueToken, verifyAdminRequest } from "@/lib/auth";
import { getRadioQueueState } from "@/lib/queue";
import { isActiveRehearsalSession } from "@/lib/queue-rehearsal-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim() ?? "";
  if (!sessionId) {
    return NextResponse.json({ error: "Rehearsal session ID is required." }, { status: 400 });
  }

  const state = await getRadioQueueState(sessionId);
  if (!isActiveRehearsalSession(state.session, state.isCurrentSession === true) || state.session.sessionId !== sessionId) {
    return NextResponse.json({ error: "A current rehearsal session is required." }, { status: 409 });
  }

  const accessToken = await createRehearsalQueueToken(sessionId);
  const href = `/queue/rehearsal/${encodeURIComponent(sessionId)}?access=${encodeURIComponent(accessToken)}`;
  return NextResponse.json(
    { href },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
