// ============================================================
// BARCODE RADIO QUEUE v1 — TYPE DEFINITIONS
// ============================================================

export type RadioQueueLane = "priority" | "wheel" | "regular";
export type RadioQueueStatus = "active" | "completed" | "removed";
export type RadioQueueDurationSource = "detected" | "fallback" | "unknown";

export interface QueueTrack {
  id: string;
  artistName: string;
  songTitle: string;
  songUrl: string;
  submitterContact?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  lane: RadioQueueLane;
  status: RadioQueueStatus;
  detectedDurationSeconds: number | null;
  durationSource: RadioQueueDurationSource;
  fallbackDurationSeconds: number;
  completedAt?: string;
  removedAt?: string;
  spotlightedAt?: string;

  // Legacy display aliases kept so older overlay/components can render safely
  // until they are retired from the previous queue experiment.
  artist: string;
  title: string;
  link: string;
  tier: QueueTier;
  playedAt: string | null;
}

export interface QueueRuntimeSummary {
  activeTrackCount: number;
  activeRuntimeSeconds: number;
  completedCount: number;
  completedRuntimeSeconds: number;
  projectedTotalSessionSeconds: number;
  queueOpen: boolean;
}

export interface QueueActiveLanes {
  priority: QueueTrack[];
  wheel: QueueTrack[];
  regular: QueueTrack[];
}

export interface QueueState {
  active: QueueActiveLanes;
  completed: QueueTrack[];
  removed: QueueTrack[];
  spotlight: QueueTrack[];
  summary: QueueRuntimeSummary;

  // Legacy state aliases for the retired AI-stream queue clients.
  nowPlaying: QueueTrack | null;
  queue: QueueTrack[];
  history: QueueTrack[];
  totalPlayed: number;
  streamStatus: "online" | "offline";
}

export interface QueueSubmissionInput {
  artistName: string;
  songTitle: string;
  songUrl: string;
  submitterContact?: string;
  note?: string;
  fallbackDurationSeconds?: number;
}

export type QueueAdminAction = "finish" | "remove" | "moveToPriority" | "spotlight" | "setOpen";

export type QueueTier = "free" | "featured" | "fastlane" | "frontrow";
export type QueueEntry = QueueTrack;

export const DEFAULT_FALLBACK_DURATION_SECONDS = 240;

export const TIERS = {
  free: {
    name: "Free",
    price: 0,
    label: "FREE",
    priority: 0,
    description: "Join the regular BARCODE Radio queue.",
    icon: "○",
  },
  featured: {
    name: "Featured",
    price: 300,
    label: "$3",
    priority: 1,
    description: "Reserved legacy tier. Stripe is not active in Radio Queue v1.",
    icon: "▸",
  },
  fastlane: {
    name: "Fast Lane",
    price: 500,
    label: "$5",
    priority: 2,
    description: "Reserved legacy tier. Stripe is not active in Radio Queue v1.",
    icon: "▸▸",
  },
  frontrow: {
    name: "Front Row",
    price: 1000,
    label: "$10",
    priority: 3,
    description: "Reserved legacy tier. Stripe is not active in Radio Queue v1.",
    icon: "▸▸▸",
  },
} as const;

export const UPGRADE_PATHS: Record<QueueTier, QueueTier[]> = {
  free: ["featured", "fastlane", "frontrow"],
  featured: ["fastlane", "frontrow"],
  fastlane: ["frontrow"],
  frontrow: [],
};

const LEGACY_TIER_MAP: Record<string, QueueTier> = {
  expedited: "featured",
  priority: "fastlane",
  vip: "frontrow",
};

export function normalizeTier(tier: string): QueueTier {
  if (tier in TIERS) return tier as QueueTier;
  return LEGACY_TIER_MAP[tier] ?? "free";
}

export function generateQueueId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `rq_${ts}_${rand}`;
}
