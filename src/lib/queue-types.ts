// ============================================================
// QUEUE SYSTEM — TYPE DEFINITIONS
// ============================================================

export type QueueTier = "free" | "featured" | "fastlane" | "frontrow";

export interface QueueEntry {
  id: string;
  artist: string;
  title: string;
  link: string;
  tier: QueueTier;
  amount: number; // cents
  stripeSessionId: string | null;
  status: "pending" | "queued" | "playing" | "played" | "refunded" | "expired";
  createdAt: string; // ISO
  playedAt: string | null;
}

export interface QueueState {
  nowPlaying: QueueEntry | null;
  queue: QueueEntry[];
  history: QueueEntry[];
  totalPlayed: number;
  streamStatus: "online" | "offline";
}

export const TIERS = {
  free: {
    name: "Free",
    price: 0,
    label: "FREE",
    priority: 0,
    description: "Join the queue for free. Plays when no paid requests are waiting.",
    icon: "○",
  },
  featured: {
    name: "Featured",
    price: 300, // $3.00
    label: "$3",
    priority: 1,
    description: "Skip the free line. Plays when no Fast Lane or Front Row requests are queued.",
    icon: "▸",
  },
  fastlane: {
    name: "Fast Lane",
    price: 500, // $5.00
    label: "$5",
    priority: 2,
    description: "Skip ahead — plays when no Front Row requests are in the queue.",
    icon: "▸▸",
  },
  frontrow: {
    name: "Front Row",
    price: 1000, // $10.00
    label: "$10",
    priority: 3,
    description: "Top of the queue. Guaranteed next play. Stacks in order paid.",
    icon: "▸▸▸",
  },
} as const;

/** Tiers a user can upgrade TO from a given tier (pay difference) */
export const UPGRADE_PATHS: Record<QueueTier, QueueTier[]> = {
  free: ["featured", "fastlane", "frontrow"],
  featured: ["fastlane", "frontrow"],
  fastlane: ["frontrow"],
  frontrow: [],
};

/** Map legacy tier names (from Redis) to current tier names */
const LEGACY_TIER_MAP: Record<string, QueueTier> = {
  expedited: "featured",
  priority: "fastlane",
  vip: "frontrow",
};

/** Normalize a tier value — handles old entries still stored in Redis */
export function normalizeTier(tier: string): QueueTier {
  if (tier in TIERS) return tier as QueueTier;
  return LEGACY_TIER_MAP[tier] ?? "free";
}

/** Generate a unique queue entry ID */
export function generateQueueId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `q_${ts}_${rand}`;
}