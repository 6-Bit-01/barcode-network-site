import { getLiveOverlayPlayerSync, getStoredLiveOverlayState, resolveLiveOverlaySceneFromQueueState } from "./live-overlay";
import type { ResolvedLiveOverlayScene } from "./live-overlay";
import { getRadioQueueState } from "./queue";
import { hasActiveQueueSession } from "./session-bound-polling";

export interface WheelOverlaySnapshot {
  sessionActive: boolean;
  broadcastActive: boolean;
  wheelActive: boolean;
  scene: ResolvedLiveOverlayScene | null;
  updatedAt: string;
}

export async function getWheelOverlaySnapshot(now = new Date()): Promise<WheelOverlaySnapshot> {
  const queueState = await getRadioQueueState();
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
  if (!broadcastActive) {
    return {
      // Keep the permanent source on its active-show polling cadence so it
      // sees Start Broadcast promptly without exposing the pre-show scene.
      sessionActive: true,
      broadcastActive: false,
      wheelActive: false,
      scene: null,
      updatedAt: queueState.session?.updatedAt || now.toISOString(),
    };
  }

  const [overlayState, playerSync] = await Promise.all([getStoredLiveOverlayState(), getLiveOverlayPlayerSync()]);
  const scene = resolveLiveOverlaySceneFromQueueState({ overlayState, queueState, playerSync, now });
  // The resolved ceremony is the authoritative wheel state used by the admin
  // and live receiver. Do not introduce a second flag gate for the link source.
  const wheelActive = Boolean(scene.wheelCeremony);
  return {
    sessionActive: true,
    broadcastActive: true,
    wheelActive,
    // This permanent square source replaces the former shared live-overlay
    // window for the whole broadcast. The Wheel ceremony takes over this same
    // scene when launched and uses the same authoritative ceremony state.
    scene,
    updatedAt: scene.updatedAt || now.toISOString(),
  };
}
