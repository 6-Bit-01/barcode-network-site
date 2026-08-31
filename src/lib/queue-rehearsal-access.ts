import {
  verifyAdminRequest,
  verifyAdminToken,
  REHEARSAL_QUEUE_COOKIE_NAME,
  requestCookieValue,
  verifyRehearsalQueueToken,
} from "@/lib/auth";
import { resolveQueueOperationalAccess, type QueueOperationalAccess } from "@/lib/queue-production";

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

export async function resolveQueueRequestAccess(
  request: Request,
  session: RehearsalSessionLike,
  isCurrentSession: boolean,
  env: NodeJS.ProcessEnv = process.env,
): Promise<QueueOperationalAccess> {
  const [isAdmin, hasRehearsalAccess] = await Promise.all([
    verifyAdminRequest(request),
    requestHasRehearsalQueueAccess(request, session, isCurrentSession),
  ]);
  return resolveQueueOperationalAccess({ isAdmin, hasRehearsalAccess }, env);
}

export async function resolveQueueCookieAccess(
  input: {
    adminToken?: string | null;
    rehearsalToken?: string | null;
    session?: RehearsalSessionLike;
    isCurrentSession?: boolean;
    requestedSessionId?: string | null;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<QueueOperationalAccess> {
  const session = input.session ?? null;
  const requestedSessionMatches = !input.requestedSessionId
    || session?.sessionId === input.requestedSessionId;
  const [isAdmin, hasRehearsalAccess] = await Promise.all([
    input.adminToken ? verifyAdminToken(input.adminToken) : false,
    input.rehearsalToken
      && requestedSessionMatches
      && isActiveRehearsalSession(session, input.isCurrentSession === true)
      ? verifyRehearsalQueueToken(input.rehearsalToken, session.sessionId)
      : false,
  ]);
  return resolveQueueOperationalAccess({ isAdmin, hasRehearsalAccess }, env);
}
