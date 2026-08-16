import type { QueuePublicSnapshot } from "@/lib/queue-types";

export type QueuePublicViewState = "loading" | "unavailable" | "stale" | "empty" | "archived" | "active";

export function queuePublicSnapshotIsArchived(snapshot: QueuePublicSnapshot | null): boolean {
  return Boolean(snapshot?.session && (snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended"));
}

export function queuePublicSnapshotUsesDegradedCache(snapshot: QueuePublicSnapshot | null | undefined): boolean {
  return Boolean(snapshot?.storageAuthority);
}

export function queuePublicViewState(
  snapshot: QueuePublicSnapshot | null,
  hasConfirmedSnapshot: boolean,
  syncError: string | null,
): QueuePublicViewState {
  if (!hasConfirmedSnapshot) return syncError ? "unavailable" : "loading";
  if (syncError || queuePublicSnapshotUsesDegradedCache(snapshot)) return snapshot ? "stale" : "unavailable";
  if (!snapshot?.session) return "empty";
  if (queuePublicSnapshotIsArchived(snapshot)) return "archived";
  return "active";
}

export function publicQueueResponseError(payload: unknown, fallback: string): string {
  return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : fallback;
}
