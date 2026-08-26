import { NextResponse } from "next/server";
import {
  REHEARSAL_QUEUE_COOKIE_NAME,
  REHEARSAL_QUEUE_TOKEN_TTL,
  verifyRehearsalQueueToken,
} from "@/lib/auth";
import { getPublicQueueSnapshot } from "@/lib/queue";
import { isActiveRehearsalSession } from "@/lib/queue-rehearsal-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const accessToken = new URL(request.url).searchParams.get("access")?.trim() ?? "";
  const snapshot = await getPublicQueueSnapshot();
  const validSession = isActiveRehearsalSession(snapshot.session, snapshot.sessionActive === true)
    && snapshot.session.sessionId === sessionId;
  const validAccess = validSession
    && Boolean(accessToken)
    && await verifyRehearsalQueueToken(accessToken, sessionId);
  const destination = new URL(`/queue/${encodeURIComponent(sessionId)}`, request.url);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  if (validAccess) {
    response.cookies.set(REHEARSAL_QUEUE_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REHEARSAL_QUEUE_TOKEN_TTL,
    });
  }

  return response;
}
