import type { QueueBroadcastPhase, QueuePublicSnapshot } from "@/lib/queue-types";

export type SiteShowMode = "offline" | "intake_open" | "broadcast_live";

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
