import { resolveForegroundOverlaySnapshot } from "./foreground-overlay-resolver";
import { getLiveOverlayPlayerSync, getStoredLiveOverlayState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import { getRadioQueueState } from "./queue";
import type { ForegroundOverlaySnapshot } from "./foreground-overlay-resolver";

export async function getForegroundOverlaySnapshot(now = new Date()): Promise<ForegroundOverlaySnapshot> {
  const [queueState, overlayState, playerSync] = await Promise.all([
    getRadioQueueState(),
    getStoredLiveOverlayState(),
    getLiveOverlayPlayerSync(),
  ]);
  const scene = resolveLiveOverlaySceneFromQueueState({ overlayState, queueState, playerSync, now });

  return resolveForegroundOverlaySnapshot({
    queueState,
    scene,
  }, now);
}
