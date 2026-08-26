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

export function isActiveRehearsalSession(
  session: RehearsalSessionLike,
  isCurrentSession: boolean,
): session is NonNullable<RehearsalSessionLike> {
  return Boolean(
    isCurrentSession
    && session
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
  isCurrentSession: boolean,
): Promise<boolean> {
  if (!isActiveRehearsalSession(session, isCurrentSession)) return false;
  const token = requestRehearsalQueueToken(request);
  return Boolean(token && await verifyRehearsalQueueToken(token, session.sessionId));
}
