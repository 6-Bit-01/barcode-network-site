import { defaultLiveOverlayState, getLiveOverlayPlayerSync, getStoredLiveOverlayState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import { getRadioQueueState } from "./queue";
import { resolveRadioVisualsSnapshot } from "./radio-visuals-resolver";
import type { RadioVisualsSnapshot } from "./radio-visuals-resolver";
import { hasActiveQueueSession } from "./session-bound-polling";

export type { RadioVisualsMode, RadioVisualsPlayerSignal, RadioVisualsQueueSignal, RadioVisualsShowStage, RadioVisualsSnapshot, RadioVisualsTrack } from "./radio-visuals-resolver";

export async function getRadioVisualsSnapshot(now = new Date()): Promise<RadioVisualsSnapshot> {
  const queueState = await getRadioQueueState();
  if (!hasActiveQueueSession(queueState)) {
    const scene = resolveLiveOverlaySceneFromQueueState({
      overlayState: defaultLiveOverlayState(),
      queueState,
      playerSync: null,
      now,
    });
    return resolveRadioVisualsSnapshot({ queueState, scene, playerSync: null, now });
  }

  const [overlayState, playerSync] = await Promise.all([
    getStoredLiveOverlayState(),
    getLiveOverlayPlayerSync(),
  ]);
  const scene = resolveLiveOverlaySceneFromQueueState({ overlayState, queueState, playerSync, now });
  return resolveRadioVisualsSnapshot({ queueState, scene, playerSync, now });
}
