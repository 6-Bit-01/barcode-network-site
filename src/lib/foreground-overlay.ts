import { resolveBNLCurrentView } from "./bnl-status-store";
import { resolveForegroundOverlaySnapshot } from "./foreground-overlay-resolver";
import { getLiveOverlayPlayerSync, getStoredLiveOverlayState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import { getRadioQueueState } from "./queue";
import type { ForegroundOverlaySnapshot } from "./foreground-overlay-resolver";

export async function getForegroundOverlaySnapshot(now = new Date()): Promise<ForegroundOverlaySnapshot> {
  const [queueState, overlayState, playerSync, bnlView] = await Promise.all([
    getRadioQueueState(),
    getStoredLiveOverlayState(),
    getLiveOverlayPlayerSync(),
    resolveBNLCurrentView(),
  ]);
  const scene = resolveLiveOverlaySceneFromQueueState({ overlayState, queueState, playerSync, now });

  return resolveForegroundOverlaySnapshot({
    queueState,
    scene,
    bnl: {
      message: bnlView.relay?.message ?? null,
      publishedAt: bnlView.relay?.publishedAt ?? null,
    },
  }, now);
}
