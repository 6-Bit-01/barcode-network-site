export const RADIO_VISUAL_CUE_TYPES = [
  "party",
  "shadow",
  "signal_breach",
  "blackout",
  "lightning",
] as const;

export type RadioVisualCueType = (typeof RADIO_VISUAL_CUE_TYPES)[number];

export const RADIO_VISUAL_CUE_DURATION_MS: Record<RadioVisualCueType, number> = {
  party: 15_000,
  shadow: 9_000,
  signal_breach: 7_000,
  blackout: 6_000,
  lightning: 5_000,
};

export interface RadioVisualCue {
  type: RadioVisualCueType;
  startedAt: string;
  expiresAt: string;
  nonce: string;
}

export function normalizeRadioVisualCueType(value: unknown): RadioVisualCueType | null {
  return typeof value === "string" && RADIO_VISUAL_CUE_TYPES.includes(value as RadioVisualCueType)
    ? value as RadioVisualCueType
    : null;
}

export function activeRadioVisualCue(input: {
  type?: unknown;
  startedAt?: unknown;
  expiresAt?: unknown;
  nonce?: unknown;
}, now = new Date()): RadioVisualCue | null {
  const type = normalizeRadioVisualCueType(input.type);
  const startedAtMs = typeof input.startedAt === "string" ? Date.parse(input.startedAt) : Number.NaN;
  const expiresAtMs = typeof input.expiresAt === "string" ? Date.parse(input.expiresAt) : Number.NaN;
  if (!type || !Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) return null;
  return {
    type,
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    nonce: typeof input.nonce === "string" && input.nonce.trim() ? input.nonce.trim().slice(0, 80) : `${type}:${startedAtMs}`,
  };
}
