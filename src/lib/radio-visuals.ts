import { defaultLiveOverlayState, getLiveOverlayRuntimeState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import { getRadioLiveQueueState } from "./queue";
import { resolveRadioVisualsSnapshot } from "./radio-visuals-resolver";
import type { RadioVisualsSnapshot } from "./radio-visuals-resolver";
import { hasActiveQueueSession } from "./session-bound-polling";

export type { RadioVisualsMode, RadioVisualsPlayerSignal, RadioVisualsQueueSignal, RadioVisualsShowSignals, RadioVisualsShowStage, RadioVisualsSnapshot, RadioVisualsTimelineSignal } from "./radio-visuals-resolver";
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
      ignoreSponsorBreak: true,
    });
    return resolveRadioVisualsSnapshot({ queueState, scene, overlayState: null, playerSync: null, now });
  }

  const { overlayState, playerSync } = await getLiveOverlayRuntimeState();
  // Commercials are a separate TikTok Studio source layered above Show
  // Visuals. Sponsor-break state must never select, dim, stop, or otherwise
  // influence the visual source underneath it.
  const scene = resolveLiveOverlaySceneFromQueueState({
    overlayState,
    queueState,
    playerSync,
    now,
    ignoreSponsorBreak: true,
  });
  return resolveRadioVisualsSnapshot({ queueState, scene, overlayState, playerSync, now });
}
