import { getStoredLiveOverlayState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import type { ResolvedLiveOverlayScene } from "./live-overlay";
import { getRadioLiveQueueState } from "./queue";
import { hasActiveQueueSession } from "./session-bound-polling";

export interface WheelOverlaySnapshot {
  sessionActive: boolean;
  broadcastActive: boolean;
  wheelActive: boolean;
  scene: ResolvedLiveOverlayScene | null;
  updatedAt: string;
}

export async function getWheelOverlaySnapshot(now = new Date()): Promise<WheelOverlaySnapshot> {
  const queueState = await getRadioLiveQueueState();
  if (!hasActiveQueueSession(queueState)) {
    return {
      sessionActive: false,
      broadcastActive: false,
      wheelActive: false,
      scene: null,
      updatedAt: now.toISOString(),
    };
  }

  const broadcastActive = queueState.session?.showStarted === true;
  const overlayState = await getStoredLiveOverlayState();
  const scene = resolveLiveOverlaySceneFromQueueState({ overlayState, queueState, playerSync: null, now });
  // The resolved ceremony is the authoritative wheel state used by the admin
  // and live receiver. Do not introduce a second flag gate for the link source.
  const wheelActive = Boolean(scene.wheelCeremony);
  return {
    sessionActive: true,
    broadcastActive,
    wheelActive,
    // Keep the permanent Wheel lane warm without mounting a second copy of
    // the live video player. The separate Live lane remains the only media
    // decoder; this source renders only an active Wheel ceremony and audio.
    scene: wheelActive ? scene : null,
    updatedAt: scene.updatedAt || now.toISOString(),
  };
}
