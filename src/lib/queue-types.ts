// ============================================================
// BARCODE RADIO QUEUE — TYPE DEFINITIONS
// ============================================================

export type QueueTier = "free" | "featured" | "fastlane" | "frontrow";
export type QueueSourceType = "upload" | "link" | "youtube" | "soundcloud" | "spotify" | "other";
export type QueueLane = "priority" | "wheel" | "regular";
export type QueueNonPriorityLane = "wheel" | "regular";
export type QueueTrackStatus = "queued" | "completed" | "removed" | "playing" | "next" | "pending" | "played" | "refunded" | "expired";
export type QueueDurationSource = "upload_metadata" | "file_metadata" | "youtube" | "soundcloud" | "spotify" | "provider_metadata" | "internal_estimate" | "unknown";
export type QueueSessionStatus = "prepared" | "open" | "closed" | "archived";
export type QueueBroadcastPhase = "submission_window" | "broadcast_active" | "ended";
export type PriorityUpgradeStatus = "none" | "requested" | "manual" | "checkout_pending" | "paid" | "paid_needs_attention" | "failed" | "refunded";
export type PriorityUpgradeSource = "admin" | "public_placeholder" | "future_payment" | "stripe";

export interface QueueEntry {
  id: string;
  artist: string;
  title: string;
  link: string;
  tier: QueueTier;
  lane?: QueueLane;
  amount: number;
  stripeSessionId: string | null;
  status: QueueTrackStatus;
  createdAt: string;
  playedAt: string | null;
  completedAt?: string | null;
  removedAt?: string | null;
  restoredAt?: string | null;
  spotlightedAt?: string | null;
  note?: string | null;
  submitterArtistName?: string;
  submittedArtistName?: string;
  submittedSongTitle?: string;
  collaboratorNames?: string | null;
  tiktokHandle?: string;
  normalizedTikTokHandle?: string;
  contactEmail?: string | null;
  submitterToken?: string | null;
  normalizedSourceKey?: string | null;
  providerId?: string | null;
  sourceArtworkUrl?: string | null;
  suspiciousFlags?: string[];
  limitMatchReasons?: string[];
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
  providerTitle?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  sourceType?: QueueSourceType;
  detectedDurationSeconds?: number | null;
  estimatedDurationSeconds?: number;
  durationIsEstimate?: boolean;
  durationSource?: QueueDurationSource;
  priorityUpgradeRequested?: boolean;
  priorityUpgradeStatus?: PriorityUpgradeStatus;
  priorityUpgradeSource?: PriorityUpgradeSource | null;
  priorityUpgradeAt?: string | null;
  priorityUpgradeRequestedAt?: string | null;
  priorityUpgradePaidAt?: string | null;
  priorityUpgradePaymentProvider?: string | null;
  priorityUpgradePaymentId?: string | null;
  priorityUpgradeCheckoutProvider?: string | null;
  priorityUpgradeCheckoutSessionId?: string | null;
  priorityUpgradeCheckoutUrl?: string | null;
  priorityUpgradeCheckoutCreatedAt?: string | null;
  priorityUpgradeCheckoutExpiresAt?: string | null;
  priorityUpgradeAmountCents?: number | null;
  priorityUpgradeCurrency?: string | null;
  displacedFromNextInLineAt?: string | null;
  stagedAsFallbackForLane?: QueueNonPriorityLane | null;
  priorityPausedAt?: string | null;
  priorityResumedAt?: string | null;
  priorityQueueOrderAt?: string | null;
  isTestTrack?: boolean;
}

export interface QueuePublicStatus {
  isOpen: boolean;
  activeCount: number;
  estimatedRuntimeSeconds: number;
  capacity: number;
  isFull?: boolean;
  pressure: "low" | "medium" | "high" | "max";
}

export interface QueueSessionSummary {
  sessionId: string;
  title: string;
  status: QueueSessionStatus;
  showDate: string;
  createdAt: string;
  updatedAt: string;
  queueOpen: boolean;
  description: string;
  trackLimitPerArtist: number;
  queueCapacity: number;
  skipGameTapTarget: number;
  submissionCooldownSeconds: number;
  activeCount: number;
  completedCount: number;
  removedCount: number;
  spotlightCount: number;
  estimatedActiveRuntimeSeconds: number;
  completedRuntimeSeconds: number;
  nextNonPriorityLane: QueueNonPriorityLane;
  showStarted?: boolean;
  preShowEndsAt?: string | null;
  wheelSpinsOwed?: number;
  broadcastPhase?: QueueBroadcastPhase;
  nextInLineTrackId?: string | null;
  nextInLineHoldTrackId?: string | null;
  loadedTrackId?: string | null;
  priorityUpgradesEnabled: boolean;
  priorityUpgradeLabel: string;
  priorityUpgradeInstructions: string;
  priorityUpgradePriceCents: number;
  priorityUpgradeCurrency: string;
  priorityUpgradePaymentsEnabled: boolean;
}

export interface QueueSession extends QueueSessionSummary {
  queue: QueueEntry[];
  spotlight: QueueEntry[];
  completed: QueueEntry[];
  removed: QueueEntry[];
  publicStatus: QueuePublicStatus;
  nextNonPriorityLane: QueueNonPriorityLane;
  nextInLineTrack?: QueueEntry | null;
  nextInLineTrackId?: string | null;
  loadedTrack?: QueueEntry | null;
  loadedTrackId?: string | null;
  currentTrackPreviousLane?: QueueLane | null;
  currentTrackPreviousIndex?: number | null;
  loadedTrackPreviousLane?: QueueLane | null;
  loadedTrackPreviousIndex?: number | null;
  loadedTrackWasNextInLine?: boolean;
  loadedTrackFallbackForLane?: QueueNonPriorityLane | null;
  nextInLineHoldTrackId?: string | null;
  autoRoutingPaused?: boolean;
}

export interface QueuePublicTrack {
  id: string;
  submittedArtistName: string;
  submittedSongTitle: string;
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
  providerTitle?: string | null;
  sourceType: QueueSourceType;
  lane: QueueLane;
  durationLabel: string;
  durationIsEstimate: boolean;
  sourceArtworkUrl?: string | null;
  publicSourceUrl?: string | null;
  tiktokHandle?: string | null;
  priorityUpgradeRequested?: boolean;
  priorityUpgradeStatus?: PriorityUpgradeStatus;
}

export interface QueuePublicSubmitterStatus {
  used: number;
  limit: number;
  remaining: number;
  cooldownRemainingSeconds: number;
  submitted: Pick<QueuePublicTrack, "id" | "submittedArtistName" | "submittedSongTitle" | "sourceType" | "lane" | "durationLabel">[];
}

export interface QueuePublicSnapshot {
  session: Pick<QueueSessionSummary, "sessionId" | "title" | "showDate" | "status" | "description" | "completedCount" | "completedRuntimeSeconds" | "activeCount" | "submissionCooldownSeconds" | "priorityUpgradesEnabled" | "priorityUpgradeLabel" | "priorityUpgradeInstructions" | "priorityUpgradePriceCents" | "priorityUpgradeCurrency" | "priorityUpgradePaymentsEnabled">;
  status: QueuePublicStatus;
  queue: QueuePublicTrack[];
  completed: QueuePublicTrack[];
  nowPlaying?: QueuePublicTrack | null;
  upNext?: QueuePublicTrack | null;
  submitterStatus?: QueuePublicSubmitterStatus | null;
}

export interface QueueWheelArtistOption {
  artist: string;
  normalizedArtist: string;
  trackIds: string[];
  trackCount: number;
}

export interface QueueState {
  nowPlaying: QueueEntry | null;
  queue: QueueEntry[];
  history: QueueEntry[];
  totalPlayed: number;
  streamStatus: "online" | "offline";
  removed?: QueueEntry[];
  spotlight?: QueueEntry[];
  publicStatus?: QueuePublicStatus;
  session?: QueueSessionSummary;
  sessions?: QueueSessionSummary[];
  viewedSessionId?: string;
  readOnly?: boolean;
  isCurrentSession?: boolean;
  nextInLine?: QueueEntry | null;
  loadedTrack?: QueueEntry | null;
  autoRoutingPaused?: boolean;
  nextNonPriorityLane?: QueueNonPriorityLane;
  wheelEligibleArtists?: QueueWheelArtistOption[];
}

export function parseQueueYouTubeVideoId(link?: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host.includes("youtube.com")) return url.searchParams.get("v") || url.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] || url.pathname.match(/\/embed\/([^/?#]+)/)?.[1] || null;
    return null;
  } catch {
    return null;
  }
}

export function getTrackArtworkUrl(track: Pick<QueueEntry, "sourceType" | "sourceArtworkUrl" | "link"> | Pick<QueuePublicTrack, "sourceType" | "sourceArtworkUrl">): string | null {
  if (track.sourceType === "youtube" && "link" in track) {
    const videoId = parseQueueYouTubeVideoId(track.link);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
  if ((track.sourceType === "spotify" || track.sourceType === "soundcloud" || track.sourceType === "youtube") && track.sourceArtworkUrl) return track.sourceArtworkUrl;
  return null;
}

export const INTERNAL_BUFFER_DURATION_SECONDS = 240;
export const RADIO_QUEUE_CAPACITY = 40;

export const TIERS = {
  free: { name: "Free Transmissions", price: 0, label: "FREE", priority: 0, description: "Enter the live BARCODE Radio request flow.", icon: "○" },
  featured: { name: "Spotlight", price: 0, label: "SPOTLIGHT", priority: 1, description: "Host-selected spotlight lane for special attention.", icon: "✦" },
  fastlane: { name: "Priority Lane", price: 0, label: "PRIORITY", priority: 2, description: "Host-controlled priority lane. Payment flow is not enabled yet.", icon: "▸▸" },
  frontrow: { name: "Wheel Chosen", price: 0, label: "WHEEL", priority: 3, description: "Winner lane controlled by the BARCODE Radio host.", icon: "◈" },
} as const;

export const UPGRADE_PATHS: Record<QueueTier, QueueTier[]> = {
  free: ["featured", "fastlane", "frontrow"],
  featured: ["fastlane", "frontrow"],
  fastlane: ["frontrow"],
  frontrow: [],
};

const LEGACY_TIER_MAP: Record<string, QueueTier> = { expedited: "featured", priority: "fastlane", vip: "frontrow" };

export function normalizeTier(tier: string): QueueTier {
  if (tier in TIERS) return tier as QueueTier;
  return LEGACY_TIER_MAP[tier] ?? "free";
}

export function generateQueueId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `q_${ts}_${rand}`;
}

export function getTrackRuntimeSeconds(entry: Pick<QueueEntry, "detectedDurationSeconds" | "estimatedDurationSeconds">): number {
  return entry.detectedDurationSeconds ?? entry.estimatedDurationSeconds ?? INTERNAL_BUFFER_DURATION_SECONDS;
}

export function formatRuntime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function detectQueueSourceType(value: string): QueueSourceType {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    if (host.includes("soundcloud.com")) return "soundcloud";
    if (host.includes("spotify.com")) return "spotify";
    return "other";
  } catch {
    return "link";
  }
}
