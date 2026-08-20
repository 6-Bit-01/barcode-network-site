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
  const wheelActive = overlayState.wheelOverlayActive === true && Boolean(scene.wheelCeremony);
  return {
    sessionActive: true,
    wheelActive,
    scene: wheelActive ? scene : null,
    updatedAt: scene.updatedAt || now.toISOString(),
  };
}
