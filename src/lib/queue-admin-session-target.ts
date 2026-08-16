import type { QueueSessionSummary } from "./queue-types";

type ArchiveSessionSummary = Pick<
  QueueSessionSummary,
  "sessionId" | "status" | "createdAt" | "updatedAt" | "showStarted"
>;

export interface QueueArchiveTargetState {
  session?: ArchiveSessionSummary | null;
  sessions: ArchiveSessionSummary[];
  isCurrentSession: boolean;
}

const STATUS_PRIORITY: Record<ArchiveSessionSummary["status"], number> = {
  open: 0,
  prepared: 1,
  closed: 2,
  archived: 3,
};

function targetPriority(session: ArchiveSessionSummary): number {
  if (session.showStarted) return -1;
  return STATUS_PRIORITY[session.status];
}

function newestFirst(left: ArchiveSessionSummary, right: ArchiveSessionSummary): number {
  return right.updatedAt.localeCompare(left.updatedAt)
    || right.createdAt.localeCompare(left.createdAt)
    || right.sessionId.localeCompare(left.sessionId);
}

/**
 * Resolve the exact non-archived session that an End Broadcast action should
 * archive. Historical recovery can intentionally leave an archived session as
 * the selected/active record, so blindly archiving activeSessionId can become a
 * successful no-op while a real broadcast session still exists.
 */
export function resolveQueueArchiveSessionId(
  state: QueueArchiveTargetState,
  requestedSessionId?: string | null,
): string | null {
  const requested = requestedSessionId?.trim() ?? "";
  if (requested) {
    const target = state.sessions.find((session) => session.sessionId === requested);
    if (!target) throw new Error("Queue session not found.");
    return target.status === "archived" ? null : target.sessionId;
  }

  if (state.isCurrentSession && state.session && state.session.status !== "archived") {
    return state.session.sessionId;
  }

  return [...state.sessions]
    .filter((session) => session.status !== "archived")
    .sort((left, right) => targetPriority(left) - targetPriority(right) || newestFirst(left, right))[0]
    ?.sessionId ?? null;
}
