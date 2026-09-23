import type { QueueBroadcastPhase, QueuePublicSnapshot } from "@/lib/queue-types";

export type SiteShowMode = "offline" | "intake_open" | "broadcast_live";

export type QueueReadState = "loading" | "ready" | "unavailable" | "disabled";
export type RadioQueueEntryState = {
  status: "loading" | "unavailable" | "closed" | "standby" | "open" | "live_open" | "live_closed" | "full";
  href: string | null;
};

// Radio reuses the global queue read, but never advertises an authenticated
// operator's private session as a public destination.
export function deriveRadioQueueEntryState({ queueSnapshot, queueProductionEnabled, readState }: Pick<PublicShowStateInput, "queueSnapshot" | "queueProductionEnabled"> & { readState: QueueReadState }): RadioQueueEntryState {
  if (readState === "loading") return { status: "loading", href: null };
  if (!queueProductionEnabled || readState !== "ready") return { status: "unavailable", href: null };
  const session = queueSnapshot?.session;
  if (!session || queueSnapshot?.sessionActive !== true || session.purpose !== "live_broadcast" || session.status === "archived" || session.broadcastPhase === "ended") {
    return { status: "closed", href: null };
  }
  const href = `/queue/${encodeURIComponent(session.sessionId)}`;
  if (queueSnapshot.status.isFull) return { status: "full", href };
  const live = session.broadcastPhase === "broadcast_active" || session.showStarted;
  const open = queueSnapshot.status.isOpen;
  return { status: live ? open ? "live_open" : "live_closed" : open ? "open" : "standby", href };
}

// A schedule window or private rehearsal is not evidence of a public broadcast.
// Reuse the current queue read and drop the live destination on a failed read.
export function isPublicTikTokBroadcastLive({ queueSnapshot, queueProductionEnabled, readState }: Pick<PublicShowStateInput, "queueSnapshot" | "queueProductionEnabled"> & { readState: QueueReadState }): boolean {
  const session = queueSnapshot?.session;
  return Boolean(queueProductionEnabled && readState === "ready" && queueSnapshot?.sessionActive === true &&
    !queueSnapshot.suppressPublicLiveStatus && session?.purpose === "live_broadcast" &&
    session.status !== "archived" && session.broadcastPhase !== "ended" &&
    (session.broadcastPhase === "broadcast_active" || session.showStarted));
}

export type PublicShowStateInput = {
  queueProductionEnabled: boolean;
  isLive: boolean;
  queueSnapshot: QueuePublicSnapshot | null | undefined;
};

export type PublicShowState = {
  hasActiveQueueSession: boolean;
  queueSessionId: string | null;
  queueHref: string | null;
  queueSubmissionsOpen: boolean;
  queueBroadcastPhase: QueueBroadcastPhase | null;
  siteShowMode: SiteShowMode;
};

export function derivePublicShowState({
  queueProductionEnabled,
  isLive,
  queueSnapshot,
}: PublicShowStateInput): PublicShowState {
  const suppressPublicLiveStatus = queueProductionEnabled && queueSnapshot?.suppressPublicLiveStatus === true;
  const queueSession = queueProductionEnabled ? queueSnapshot?.session : null;
  const hasActiveQueueSession = Boolean(
    queueSession &&
      queueSession.status !== "archived" &&
      queueSession.broadcastPhase !== "ended",
  );
  const queueSessionId = hasActiveQueueSession
    ? queueSession?.sessionId ?? null
    : null;
  const queueHref = queueSessionId ? `/queue/${queueSessionId}` : null;
  const queueSubmissionsOpen = Boolean(
    hasActiveQueueSession && queueSnapshot?.status?.isOpen,
  );
  const queueBroadcastPhase = hasActiveQueueSession
    ? queueSession?.broadcastPhase ?? null
    : null;

  let siteShowMode: SiteShowMode = "offline";
  if (queueSubmissionsOpen) siteShowMode = "intake_open";
  if (!suppressPublicLiveStatus && (queueBroadcastPhase === "broadcast_active" || isLive))
    siteShowMode = "broadcast_live";

  return {
    hasActiveQueueSession,
    queueSessionId,
    queueHref,
    queueSubmissionsOpen,
    queueBroadcastPhase,
    siteShowMode,
  };
}
