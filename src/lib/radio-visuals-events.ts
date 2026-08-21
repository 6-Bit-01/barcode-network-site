export const RADIO_VISUAL_EVENT_TYPES = [
  "show_started",
  "show_complete",
  "track_started",
  "track_skipped",
  "priority_sent",
  "priority_confirmed",
  "wheel_gained",
  "wheel_launched",
  "wheel_spinning",
  "intake_opened",
  "intake_closed",
  "stage_shift",
] as const;

export type RadioVisualEventType = (typeof RADIO_VISUAL_EVENT_TYPES)[number];

export const RADIO_VISUAL_EVENT_DURATION_MS: Record<RadioVisualEventType, number> = {
  show_started: 9_000,
  show_complete: 7_000,
  track_started: 4_200,
  track_skipped: 5_200,
  priority_sent: 4_800,
  priority_confirmed: 6_200,
  wheel_gained: 6_800,
  wheel_launched: 7_000,
  wheel_spinning: 7_500,
  intake_opened: 5_400,
  intake_closed: 5_400,
  stage_shift: 5_000,
};

export interface RadioVisualEvent {
  type: RadioVisualEventType;
  occurredAt: string;
  expiresAt: string;
  seed: number;
}

export interface RadioVisualBroadcastTransitionState {
  broadcastPhase: string | null;
  showStage: string;
}

export function radioVisualBroadcastStartedTransition(
  previous: RadioVisualBroadcastTransitionState,
  current: RadioVisualBroadcastTransitionState,
): boolean {
  if (previous.broadcastPhase !== "broadcast_active" && current.broadcastPhase === "broadcast_active") return true;
  if (previous.broadcastPhase !== null || current.broadcastPhase !== null) return false;
  return previous.showStage === "intake"
    && current.showStage !== "intake"
    && current.showStage !== "standby"
    && current.showStage !== "complete";
}

export function hashRadioVisualToken(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function activeRadioVisualEvent(input: {
  type: RadioVisualEventType;
  occurredAt?: string | null;
  nonce: string;
}, now = new Date()): RadioVisualEvent | null {
  const occurredAtMs = typeof input.occurredAt === "string" ? Date.parse(input.occurredAt) : Number.NaN;
  if (!Number.isFinite(occurredAtMs) || occurredAtMs > now.getTime() + 5_000) return null;
  const durationMs = RADIO_VISUAL_EVENT_DURATION_MS[input.type];
  const expiresAtMs = occurredAtMs + durationMs;
  if (expiresAtMs <= now.getTime()) return null;
  const occurredAt = new Date(occurredAtMs).toISOString();
  return {
    type: input.type,
    occurredAt,
    expiresAt: new Date(expiresAtMs).toISOString(),
    seed: hashRadioVisualToken(`${input.type}:${input.nonce}:${occurredAt}`),
  };
}

export function radioVisualEventProgress(event: RadioVisualEvent, nowMs: number): number | null {
  const startedAtMs = Date.parse(event.occurredAt);
  const expiresAtMs = Date.parse(event.expiresAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= startedAtMs || nowMs >= expiresAtMs) return null;
  return Math.min(1, Math.max(0, (nowMs - startedAtMs) / (expiresAtMs - startedAtMs)));
}

function smoothstep(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return bounded * bounded * (3 - 2 * bounded);
}

export function radioVisualEventEnvelope(event: RadioVisualEvent, nowMs: number): number {
  const progress = radioVisualEventProgress(event, nowMs);
  if (progress === null) return 0;
  const sharp = event.type === "track_skipped" || event.type === "priority_confirmed" || event.type === "wheel_gained";
  const attackEnd = sharp ? 0.075 : 0.14;
  const releaseStart = sharp ? 0.58 : 0.68;
  if (progress < attackEnd) return smoothstep(progress / attackEnd);
  if (progress > releaseStart) return smoothstep((1 - progress) / (1 - releaseStart));
  return 1;
}
