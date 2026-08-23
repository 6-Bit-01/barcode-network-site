import { defaultLiveOverlayState, getLiveOverlayRuntimeState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import { getRadioLiveQueueState } from "./queue";
import { resolveRadioVisualsSnapshot } from "./radio-visuals-resolver";
import type { RadioVisualsSnapshot } from "./radio-visuals-resolver";
import { hasActiveQueueSession } from "./session-bound-polling";

export type { RadioVisualsMode, RadioVisualsPlayerSignal, RadioVisualsQueueSignal, RadioVisualsShowSignals, RadioVisualsShowStage, RadioVisualsSnapshot } from "./radio-visuals-resolver";
export type { RadioVisualCue, RadioVisualCueType } from "./radio-visuals-cues";
export type { RadioVisualPreview } from "./radio-visuals-preview";
export type { RadioVisualEvent, RadioVisualEventType } from "./radio-visuals-events";

export async function getRadioVisualsSnapshot(now = new Date()): Promise<RadioVisualsSnapshot> {
  const queueState = await getRadioLiveQueueState();
  if (!hasActiveQueueSession(queueState)) {
    const scene = resolveLiveOverlaySceneFromQueueState({
      overlayState: defaultLiveOverlayState(),
      queueState,
      playerSync: null,
      now,
    });
    return resolveRadioVisualsSnapshot({ queueState, scene, overlayState: null, playerSync: null, now });
  }

  const { overlayState, playerSync } = await getLiveOverlayRuntimeState();
  const scene = resolveLiveOverlaySceneFromQueueState({ overlayState, queueState, playerSync, now });
  return resolveRadioVisualsSnapshot({ queueState, scene, overlayState, playerSync, now });
}
