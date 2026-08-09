import { resolveForegroundOverlaySnapshot } from "./foreground-overlay-resolver";
import { isForegroundQueueProjectionPublic } from "./foreground-overlay-access";
import { getLiveOverlayPlayerSync, getStoredLiveOverlayState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import { getRadioQueueState } from "./queue";
import type { ForegroundOverlaySnapshot } from "./foreground-overlay-resolver";
import type { QueueState } from "./queue-types";

function blockedForegroundQueueState(): QueueState {
  return {
    revision: 0,
    nowPlaying: null,
    loadedTrack: null,
    nextInLine: null,
    queue: [],
    history: [],
    removed: [],
    totalPlayed: 0,
    streamStatus: "offline",
    publicStatus: {
      isOpen: false,
      activeCount: 0,
      acceptedCount: 0,
      estimatedRuntimeSeconds: 0,
      capacity: 44,
      pressure: "low",
    },
  };
}

export async function getForegroundOverlaySnapshot(
  now = new Date(),
  options: { allowPrivateQueueState?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<ForegroundOverlaySnapshot> {
  const [queueState, overlayState, playerSync] = await Promise.all([
    getRadioQueueState(),
    getStoredLiveOverlayState(),
    getLiveOverlayPlayerSync(),
  ]);
  const publicProjectionAllowed = isForegroundQueueProjectionPublic(options.env ?? process.env, queueState.session);
  const projectionAllowed = options.allowPrivateQueueState === true || publicProjectionAllowed;
  const projectedQueueState = projectionAllowed ? queueState : blockedForegroundQueueState();
  const scene = resolveLiveOverlaySceneFromQueueState({
    overlayState,
    queueState: projectedQueueState,
    playerSync: projectionAllowed ? playerSync : null,
    now,
  });

  return resolveForegroundOverlaySnapshot({
    queueState: projectedQueueState,
    scene,
  }, now);
}
