import { getStoredLiveOverlayState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import type { ResolvedLiveOverlayScene } from "./live-overlay";
import { getRadioQueueState } from "./queue";
import { hasActiveQueueSession } from "./session-bound-polling";

export interface WheelOverlaySnapshot {
  sessionActive: boolean;
  wheelActive: boolean;
  scene: ResolvedLiveOverlayScene | null;
  updatedAt: string;
}

export async function getWheelOverlaySnapshot(now = new Date()): Promise<WheelOverlaySnapshot> {
  const queueState = await getRadioQueueState();
  if (!hasActiveQueueSession(queueState)) {
    return {
      sessionActive: false,
      wheelActive: false,
      scene: null,
      updatedAt: now.toISOString(),
    };
  }

  const overlayState = await getStoredLiveOverlayState();
  const scene = resolveLiveOverlaySceneFromQueueState({ overlayState, queueState, playerSync: null, now });
  // The resolved ceremony is the authoritative wheel state used by the admin
  // and live receiver. Do not introduce a second flag gate for the link source.
  const wheelActive = Boolean(scene.wheelCeremony);
  return {
    sessionActive: true,
    wheelActive,
    scene: wheelActive ? scene : null,
    updatedAt: scene.updatedAt || now.toISOString(),
  };
}
