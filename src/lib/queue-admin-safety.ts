import type { QueueSessionSummary, QueueState } from "@/lib/queue-types";

export type QueueAdminReadViewState = "loading" | "unavailable" | "confirmed" | "stale";

export type QueueEndTarget = {
  sessionId: string;
  title: string;
  showDate: string;
};

const QUEUE_STATE_REVALIDATION_CODES = new Set([
  "queue_storage_unavailable",
  "queue_state_unavailable",
  "queue_state_conflict",
  "queue_state_ambiguous",
]);

export function queueAdminReadViewState(state: QueueState | null, error: string | null): QueueAdminReadViewState {
  if (!state) return error ? "unavailable" : "loading";
  return error || Boolean(state.storageAuthority) ? "stale" : "confirmed";
}

export function queueStateUsesDegradedCache(state: QueueState | null | undefined): boolean {
  return Boolean(state?.storageAuthority);
}

export function queuePollingResponseMayApply(input: {
  requestEpoch: number;
  currentMutationEpoch: number;
  mutationsInFlight: number;
  latestAppliedMutationEpoch: number;
}): boolean {
  return input.mutationsInFlight === 0
    && input.requestEpoch === input.currentMutationEpoch
    && input.requestEpoch >= input.latestAppliedMutationEpoch;
}

export function captureQueueEndTarget(session: Pick<QueueSessionSummary, "sessionId" | "title" | "showDate"> | null | undefined): QueueEndTarget | null {
  if (!session?.sessionId) return null;
  return { sessionId: session.sessionId, title: session.title, showDate: session.showDate };
}

export function queueResponseRequiresStateRevalidation(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && typeof (payload as { code?: unknown }).code === "string" && QUEUE_STATE_REVALIDATION_CODES.has((payload as { code: string }).code));
}
