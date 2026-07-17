import type { QueuePublicSnapshot } from "./queue-types";

export type QueuePollFailureReason = "network" | "non_2xx" | "malformed_json" | "unexpected_payload" | "aborted";
export type QueuePollStatus = "loading" | "current" | "retrying" | "unavailable" | "stale";
export type QueuePollState = { status: QueuePollStatus; snapshot: QueuePublicSnapshot | null; lastGoodAt: number | null; failureReason: QueuePollFailureReason | null; message: string | null };

export class QueuePollError extends Error {
  reason: QueuePollFailureReason;
  statusCode?: number;

  constructor(reason: QueuePollFailureReason, message: string, statusCode?: number) {
    super(message);
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

export function isQueuePublicSnapshot(value: unknown): value is QueuePublicSnapshot {
  const v = value as Partial<QueuePublicSnapshot> | null;
  return Boolean(v && typeof v === "object" && v.session && typeof v.session === "object" && typeof v.session.sessionId === "string" && v.status && typeof v.status === "object" && typeof v.status.isOpen === "boolean" && Array.isArray(v.queue) && Array.isArray(v.completed));
}

export function queueSnapshotIdentity(snapshot: QueuePublicSnapshot | null): string | null {
  if (!snapshot) return null;
  return `${snapshot.session.sessionId}:${snapshot.session.status}:${snapshot.session.broadcastPhase ?? "unknown"}`;
}

export function snapshotsAreCompatible(a: QueuePublicSnapshot | null, b: QueuePublicSnapshot | null): boolean {
  if (!a || !b) return false;
  return queueSnapshotIdentity(a) === queueSnapshotIdentity(b);
}

export function messageForQueuePollFailure(reason: QueuePollFailureReason): string {
  if (reason === "network") return "Queue signal unavailable. Check connection and retry.";
  if (reason === "non_2xx") return "Queue server returned an error. The queue state was not changed.";
  if (reason === "malformed_json") return "Queue response was unreadable. Retry to resync.";
  if (reason === "unexpected_payload") return "Queue response was incompatible. Retry to resync.";
  return "Queue request was cancelled during refresh.";
}

export async function fetchQueueSnapshot(fetcher: typeof fetch, url: string, signal?: AbortSignal): Promise<QueuePublicSnapshot> {
  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store", signal });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw new QueuePollError("aborted", messageForQueuePollFailure("aborted"));
    throw new QueuePollError("network", messageForQueuePollFailure("network"));
  }
  if (!response.ok) throw new QueuePollError("non_2xx", messageForQueuePollFailure("non_2xx"), response.status);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new QueuePollError("malformed_json", messageForQueuePollFailure("malformed_json")); }
  if (!isQueuePublicSnapshot(payload)) throw new QueuePollError("unexpected_payload", messageForQueuePollFailure("unexpected_payload"));
  return payload;
}

export function reduceQueuePollFailure(previous: QueuePollState, reason: QueuePollFailureReason, retrying = false): QueuePollState {
  const canKeepStale = previous.snapshot && previous.status !== "loading";
  return { ...previous, status: canKeepStale ? (retrying ? "retrying" : "stale") : retrying ? "retrying" : "unavailable", failureReason: reason, message: messageForQueuePollFailure(reason) };
}

export function reduceQueuePollSuccess(previous: QueuePollState, snapshot: QueuePublicSnapshot, now = Date.now(), requiredSessionId?: string): QueuePollState {
  if (requiredSessionId && snapshot.session.sessionId !== requiredSessionId) {
    return reduceQueuePollFailure({ ...previous, snapshot: null }, "unexpected_payload");
  }
  if (previous.snapshot && !snapshotsAreCompatible(previous.snapshot, snapshot) && requiredSessionId && previous.snapshot.session.sessionId !== snapshot.session.sessionId) {
    return reduceQueuePollFailure({ ...previous, snapshot: null }, "unexpected_payload");
  }
  return { status: "current", snapshot, lastGoodAt: now, failureReason: null, message: null };
}

export const initialQueuePollState: QueuePollState = { status: "loading", snapshot: null, lastGoodAt: null, failureReason: null, message: null };
