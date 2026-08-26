import {
  REHEARSAL_QUEUE_COOKIE_NAME,
  requestCookieValue,
  verifyRehearsalQueueToken,
} from "@/lib/auth";

type RehearsalSessionLike = {
  sessionId: string;
  purpose?: string | null;
  status?: string | null;
  broadcastPhase?: string | null;
} | null | undefined;

export function isActiveRehearsalSession(session: RehearsalSessionLike): session is NonNullable<RehearsalSessionLike> {
  return Boolean(
    session
    && session.purpose === "rehearsal"
    && session.status !== "archived"
    && session.broadcastPhase !== "ended",
  );
}

export function requestRehearsalQueueToken(request: Request): string {
  return requestCookieValue(request, REHEARSAL_QUEUE_COOKIE_NAME);
}

export async function requestHasRehearsalQueueAccess(
  request: Request,
  session: RehearsalSessionLike,
): Promise<boolean> {
  if (!isActiveRehearsalSession(session)) return false;
  const token = requestRehearsalQueueToken(request);
  return Boolean(token && await verifyRehearsalQueueToken(token, session.sessionId));
}
