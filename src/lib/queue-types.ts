// ============================================================
// BARCODE RADIO QUEUE — TYPE DEFINITIONS
// ============================================================

export type QueueTier = "free" | "featured" | "fastlane" | "frontrow";
export type QueueSourceType = "upload" | "link" | "youtube" | "soundcloud" | "spotify" | "tiktok" | "other";
export type QueueLane = "priority" | "wheel" | "regular";
export type QueueNonPriorityLane = "wheel" | "regular";
export type QueueTrackStatus = "queued" | "completed" | "removed" | "playing" | "next" | "pending" | "played" | "refunded" | "expired";
export type QueueDurationSource = "upload_metadata" | "file_metadata" | "youtube" | "soundcloud" | "spotify" | "youtube_api" | "spotify_api" | "soundcloud_api" | "direct_metadata" | "provider_metadata" | "internal_estimate" | "estimated" | "unknown";
export type QueueSessionStatus = "prepared" | "open" | "closed" | "archived";
export type QueueBroadcastPhase = "warmup" | "submission_window" | "broadcast_active" | "ended";
export type QueueSubmissionClosureReason = "manual" | "capacity" | "ended" | "archived" | null;
export type QueueSessionPurpose = "unknown" | "rehearsal" | "live_broadcast" | "simulation" | "internal_test";
export type QueueSessionBnlPublicationStatus = "private" | "runtime_only" | "recap_approved" | "public_copy_approved";
export type PriorityUpgradeStatus = "none" | "requested" | "manual" | "checkout_pending" | "paid" | "paid_needs_attention" | "failed" | "refunded";
export type PriorityUpgradeSource = "admin" | "public_placeholder" | "future_payment" | "stripe";
export type SignalHoldStatus = "none" | "checkout_pending" | "active" | "paid_needs_attention" | "failed" | "refunded" | "fulfilled" | "expired";
export type SponsorBreakMode = "mid_show";
export type SponsorBreakStatus = "not_due" | "due" | "running" | "completed" | "skipped";
export type QueuePlaybackState = "playing" | "paused" | "stopped";
export type QueuePlaybackProvider = "audio" | "youtube" | "tiktok" | "external";
export type QueuePlaybackLifecycleState = "idle" | "loaded" | "ready" | "playing" | "paused" | "stalled" | "ended" | "error" | "cleared";
export type QueuePlaybackLifecycleEventType = "loaded" | "ready" | "play" | "pause" | "stall" | "resume" | "seek" | "ended" | "error" | "finish" | "skip" | "remove" | "return";
export type QueuePlaybackErrorCode = "media_aborted" | "network_error" | "decode_error" | "source_unsupported" | "provider_error" | "ready_timeout" | "sync_error" | "unknown";
export type QueuePlaybackOutcome = "finished" | "skipped" | "removed";
export type QueueShowLogEventType =
  | "session_created"
  | "submissions_opened"
  | "submissions_closed"
  | "broadcast_started"
  | "track_submitted"
  | "track_loaded"
  | "track_play_started"
  | "track_paused"
  | "track_stalled"
  | "track_resumed"
  | "track_playback_error"
  | "track_finished"
  | "track_skipped"
  | "track_removed"
  | "track_returned"
  | "track_restored"
  | "track_signal_hold_activated"
  | "track_signal_hold_needs_attention"
  | "track_signal_hold_applied"
  | "track_signal_hold_fulfilled"
  | "track_signal_hold_expired"
  | "wheel_launched"
  | "wheel_reencrypted"
  | "wheel_spun"
  | "wheel_result_rejected"
  | "wheel_confirmed"
  | "wheel_cancelled"
  | "sponsor_break_started"
  | "sponsor_break_completed"
  | "sponsor_break_skipped"
  | "sponsor_break_reset"
  | "session_archived";
export type QueueWheelTimingStatus = "idle" | "ready" | "reencrypting" | "spinning" | "result_pending" | "confirmed" | "cancelled" | "signal_lost";
export type UploadedFileDeletionStatus = "pending" | "deleted" | "error";

export interface QueuePlaybackLifecycleEventInput {
  sessionId?: string | null;
  trackId: string;
  provider: QueuePlaybackProvider;
  eventType: QueuePlaybackLifecycleEventType;
  currentTimeSeconds?: number | null;
  durationSeconds?: number | null;
  readyState?: number | null;
  networkState?: number | null;
  errorCode?: QueuePlaybackErrorCode | null;
}

export interface QueuePlaybackLifecycleEvent {
  sequence: number;
  trackId: string;
  provider: QueuePlaybackProvider;
  eventType: QueuePlaybackLifecycleEventType;
  lifecycleState: QueuePlaybackLifecycleState;
  observedAt: string;
  currentTimeSeconds: number | null;
  durationSeconds: number | null;
  readyState: number | null;
  networkState: number | null;
  errorCode: QueuePlaybackErrorCode | null;
}

export interface QueuePlaybackDiagnostics {
  schemaVersion: "queue_playback_lifecycle_v1";
  currentTrackId: string | null;
  lifecycleState: QueuePlaybackLifecycleState;
  lastEventAt: string | null;
  lastErrorCode: QueuePlaybackErrorCode | null;
  nextSequence: number;
  events: QueuePlaybackLifecycleEvent[];
}

export interface QueueShowLogTrack {
  trackId: string;
  artist: string;
  title: string;
  tiktokHandle: string;
  sourceType: QueueSourceType;
  publicSourceUrl: string | null;
  submissionOrder: number | null;
  playedOrder: number | null;
}

export interface QueueShowLogEvent {
  sequence: number;
  eventType: QueueShowLogEventType;
  occurredAt: string;
  track: QueueShowLogTrack | null;
  details?: QueueShowLogEventDetails | null;
}

export interface QueueShowLogEventDetails {
  playbackProvider?: QueuePlaybackProvider | null;
  playbackPositionSeconds?: number | null;
  playbackDurationSeconds?: number | null;
  playbackErrorCode?: QueuePlaybackErrorCode | null;
  wheelCandidateCount?: number | null;
  wheelSpinDurationMs?: number | null;
  signalHoldPreviousLane?: QueueLane | null;
  signalHoldApplicationCount?: number | null;
}

export interface QueuePlaybackTiming {
  trackId: string;
  playbackState: QueuePlaybackState;
  currentTimeSeconds: number;
  durationSeconds: number | null;
  observedAt: string;
  source: "player_sync" | "loaded_clock";
}

export interface QueueWheelTiming {
  status: QueueWheelTimingStatus;
  startedAt: string | null;
  observedAt: string;
  remainingSeconds: number;
  spinsOwed: number;
}

export const PUBLIC_QUEUE_LEGAL_TERMS_VERSION = "1.2";
export const PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION = "1.1";
export const PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION = "1.0";
export const PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT = "I agree to the BARCODE Network Terms, Queue Submission Terms, and Privacy Policy. I confirm I am 13+ and, if under 18, have parent/guardian permission. I confirm I have the rights to submit this track, and I understand uploads are temporary and may be used for BARCODE Radio/live show-related playback, clips, recaps, platform replays, and related BARCODE Network features as described in the terms.";
export const PRIORITY_TERMS_VERSION = "1.1";
export const PRIORITY_DISCLOSURE_TEXT = "Priority Signal moves an eligible submission closer to the front after payment clears. It does not guarantee approval, airplay, promotion, review, a specific stream time, permanent placement, or interruption of the track currently playing. By continuing to checkout, I confirm that I am at least 18 years old or have permission from a parent or legal guardian to make this payment.";
export const PRIORITY_GIFT_ATTRIBUTION_VERSION = "1.0";
export const PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT = "For a skip sent to someone else, the public name you enter—or Anonymous if you leave it blank—will appear with the recipient artist on the public queue and broadcast overlay after payment clears.";
export const PRIORITY_GIFT_ANONYMOUS_NAME = "Anonymous";
export const PRIORITY_GIFT_NAME_MAX_LENGTH = 48;
export const SIGNAL_HOLD_TERMS_VERSION = "1.0";
export const SIGNAL_HOLD_DISCLOSURE_TEXT = "Signal Hold protects one eligible track from absence-based removal during the current BARCODE Radio session. If the artist is called and is not present, the host may move the track to the bottom of the active queue instead of removing it. Signal Hold does not preserve Next In Line, Priority, or Wheel position; does not guarantee airplay or a specific time; does not carry into another show; and expires when the session ends. It does not prevent removal for invalid or unavailable media, rights or policy issues, artist withdrawal, moderation, or other non-absence reasons. By continuing to checkout, I confirm that I am at least 18 years old or have permission from a parent or legal guardian to make this payment.";
export const SIGNAL_HOLD_NEXT_TWO_UNAVAILABLE_MESSAGE = "Signal Hold is unavailable once this track is one of the next two to play.";
export const SIGNAL_HOLD_CHECKOUT_POSITION_CUTOFF = 2;

type SignalHoldCheckoutLineTrack = { id: string };

export function signalHoldCheckoutPosition(
  trackId: string,
  line: { upNext?: SignalHoldCheckoutLineTrack | null; queue?: readonly SignalHoldCheckoutLineTrack[] | null },
): number | null {
  const upcoming = [line.upNext, ...(line.queue ?? [])].filter((track): track is SignalHoldCheckoutLineTrack => Boolean(track));
  const position = upcoming.findIndex((track) => track.id === trackId);
  return position >= 0 ? position + 1 : null;
}

export function isSignalHoldCheckoutNearFront(
  trackId: string,
  line: { upNext?: SignalHoldCheckoutLineTrack | null; queue?: readonly SignalHoldCheckoutLineTrack[] | null },
): boolean {
  const position = signalHoldCheckoutPosition(trackId, line);
  return position !== null && position <= SIGNAL_HOLD_CHECKOUT_POSITION_CUTOFF;
}

export function normalizePriorityGiftDisplayName(value: unknown, fallback: string): string {
  const normalized = typeof value === "string"
    ? value
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    : "";
  return Array.from(normalized || fallback).slice(0, PRIORITY_GIFT_NAME_MAX_LENGTH).join("");
}

export const QUEUE_SESSION_PURPOSES = [
  "unknown",
  "rehearsal",
  "live_broadcast",
  "simulation",
  "internal_test",
] as const satisfies readonly QueueSessionPurpose[];

export const QUEUE_SESSION_BNL_PUBLICATION_STATUSES = [
  "private",
  "runtime_only",
  "recap_approved",
  "public_copy_approved",
] as const satisfies readonly QueueSessionBnlPublicationStatus[];

export function isQueueSessionPurpose(value: unknown): value is QueueSessionPurpose {
  return typeof value === "string" && (QUEUE_SESSION_PURPOSES as readonly string[]).includes(value);
}

export function isQueueSessionBnlPublicationStatus(value: unknown): value is QueueSessionBnlPublicationStatus {
  return typeof value === "string" && (QUEUE_SESSION_BNL_PUBLICATION_STATUSES as readonly string[]).includes(value);
}

export function normalizeQueueSessionPurpose(value: unknown): QueueSessionPurpose {
  return isQueueSessionPurpose(value) ? value : "unknown";
}

export function normalizeQueueSessionBnlPublicationStatus(
  value: unknown,
  purpose: QueueSessionPurpose,
): QueueSessionBnlPublicationStatus {
  if (purpose !== "live_broadcast") return "private";
  return isQueueSessionBnlPublicationStatus(value) ? value : "private";
}

export type QueueSessionBnlPublicationAccess = {
  purpose: QueueSessionPurpose;
  status: QueueSessionBnlPublicationStatus;
  runtimeContext: boolean;
  recapCandidates: boolean;
  publicCopyCandidates: boolean;
  reason:
    | "legacy_or_unknown_session_quarantined"
    | "session_purpose_quarantined"
    | "session_publication_private"
    | "runtime_only_approved"
    | "recap_approved"
    | "public_copy_approved";
};

export function queueSessionBnlPublicationAccess(
  session: Pick<QueueSessionSummary, "purpose" | "bnlPublicationStatus"> | null | undefined,
): QueueSessionBnlPublicationAccess {
  const purpose = normalizeQueueSessionPurpose(session?.purpose);
  const status = normalizeQueueSessionBnlPublicationStatus(session?.bnlPublicationStatus, purpose);
  if (purpose === "unknown") {
    return {
      purpose,
      status: "private",
      runtimeContext: false,
      recapCandidates: false,
      publicCopyCandidates: false,
      reason: "legacy_or_unknown_session_quarantined",
    };
  }
  if (purpose !== "live_broadcast") {
    return {
      purpose,
      status: "private",
      runtimeContext: false,
      recapCandidates: false,
      publicCopyCandidates: false,
      reason: "session_purpose_quarantined",
    };
  }
  if (status === "private") {
    return {
      purpose,
      status,
      runtimeContext: false,
      recapCandidates: false,
      publicCopyCandidates: false,
      reason: "session_publication_private",
    };
  }
  return {
    purpose,
    status,
    runtimeContext: true,
    recapCandidates: status === "recap_approved" || status === "public_copy_approved",
    publicCopyCandidates: status === "public_copy_approved",
    reason: status === "runtime_only" ? "runtime_only_approved" : status,
  };
}

export const APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE =
  "Apple Music links are not currently accepted because BARCODE Radio cannot reliably access the full track. Use another accepted source or upload an MP3/WAV instead.";

export function isAppleMusicUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase().replace(/\.+$/, "");
    return hostname === "music.apple.com" || hostname.endsWith(".music.apple.com");
  } catch {
    return false;
  }
}

export interface QueueLegalAcceptance {
  acceptedAt: string;
  termsVersion: string;
  privacyVersion: string;
  queueTermsVersion: string;
  acceptedCheckboxText: string;
  source: "public_queue_form";
}

export interface PriorityLegalAcceptance {
  acceptedAt: string;
  priorityTermsVersion: typeof PRIORITY_TERMS_VERSION;
  priorityDisclosureText: string;
  source: "priority_checkout";
}

export interface PriorityLegalAcceptanceInput {
  acceptedPriorityTerms: boolean;
  priorityTermsVersion: string;
  priorityDisclosureText: string;
}

export interface SignalHoldLegalAcceptance {
  acceptedAt: string;
  signalHoldTermsVersion: typeof SIGNAL_HOLD_TERMS_VERSION;
  signalHoldDisclosureText: string;
  source: "signal_hold_checkout";
}

export interface SignalHoldLegalAcceptanceInput {
  acceptedSignalHoldTerms: boolean;
  signalHoldTermsVersion: string;
  signalHoldDisclosureText: string;
}

export interface PriorityGiftAttributionInput {
  attributionVersion: string;
  attributionDisclosureText: string;
  supporterName?: string | null;
}

export interface PriorityGiftAttribution {
  version: typeof PRIORITY_GIFT_ATTRIBUTION_VERSION;
  supporterName: string;
  recipientName: string;
  capturedAt: string;
}

export type PriorityGiftPublicAttribution = Pick<PriorityGiftAttribution, "version" | "supporterName" | "recipientName">;

export interface PriorityPurchaseDisplayInput {
  priorityUpgradeStatus?: PriorityUpgradeStatus;
  priorityGiftAttribution?: PriorityGiftPublicAttribution | null;
  submittedArtistName?: string | null;
  artist?: string | null;
}

export interface PriorityPurchaseDisplay {
  kind: "own" | "gift";
  supporterName: string | null;
  recipientName: string;
  text: string;
}

export function confirmedPriorityPurchaseDisplay(input: PriorityPurchaseDisplayInput): PriorityPurchaseDisplay | null {
  if (input.priorityUpgradeStatus !== "paid" && input.priorityUpgradeStatus !== "paid_needs_attention") return null;
  const recipientName = normalizePriorityGiftDisplayName(input.priorityGiftAttribution?.recipientName ?? input.submittedArtistName ?? input.artist, "Unknown Artist");
  if (!input.priorityGiftAttribution) {
    return { kind: "own", supporterName: null, recipientName, text: `${recipientName} BOUGHT A SKIP` };
  }
  const supporterName = normalizePriorityGiftDisplayName(input.priorityGiftAttribution.supporterName, PRIORITY_GIFT_ANONYMOUS_NAME);
  return { kind: "gift", supporterName, recipientName, text: `${supporterName} BOUGHT A SKIP FOR ${recipientName}` };
}

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
  playbackOutcome?: QueuePlaybackOutcome | null;
  playbackEndedNaturally?: boolean | null;
  playbackEarlyCutoff?: boolean | null;
  playbackEndPositionSeconds?: number | null;
  playbackEndPositionObservedAt?: string | null;
  playbackObservedDurationSeconds?: number | null;
  playbackIssueCode?: QueuePlaybackErrorCode | null;
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
  uploadedFileDeleteAfter?: string | null;
  uploadedFileDeletedAt?: string | null;
  uploadedFileDeletionStatus?: UploadedFileDeletionStatus | null;
  uploadedFileDeletionError?: string | null;
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
  priorityUpgradeCheckoutOwnerTokenHash?: string | null;
  priorityUpgradeAmountCents?: number | null;
  priorityUpgradeCurrency?: string | null;
  priorityGiftAttribution?: PriorityGiftAttribution | null;
  displacedFromNextInLineAt?: string | null;
  stagedAsFallbackForLane?: QueueNonPriorityLane | null;
  priorityPausedAt?: string | null;
  priorityResumedAt?: string | null;
  priorityQueueOrderAt?: string | null;
  legalAcceptance?: QueueLegalAcceptance | null;
  priorityLegalAcceptance?: PriorityLegalAcceptance | null;
  signalHoldStatus?: SignalHoldStatus;
  signalHoldRequestedAt?: string | null;
  signalHoldPaidAt?: string | null;
  signalHoldPaymentProvider?: string | null;
  signalHoldPaymentId?: string | null;
  signalHoldCheckoutProvider?: string | null;
  signalHoldCheckoutSessionId?: string | null;
  signalHoldCheckoutUrl?: string | null;
  signalHoldCheckoutCreatedAt?: string | null;
  signalHoldCheckoutExpiresAt?: string | null;
  signalHoldCheckoutOwnerTokenHash?: string | null;
  signalHoldAmountCents?: number | null;
  signalHoldCurrency?: string | null;
  signalHoldLegalAcceptance?: SignalHoldLegalAcceptance | null;
  signalHoldAppliedAt?: string | null;
  signalHoldApplicationCount?: number;
  signalHoldQueueOrderAt?: string | null;
  signalHoldPriorityRelinquishedAt?: string | null;
  signalHoldFulfilledAt?: string | null;
  signalHoldExpiredAt?: string | null;
  isTestTrack?: boolean;
}

export interface QueuePublicStatus {
  isOpen: boolean;
  activeCount: number;
  acceptedCount?: number;
  estimatedRuntimeSeconds: number;
  capacity: number;
  isFull?: boolean;
  closureReason?: QueueSubmissionClosureReason;
  pressure: "low" | "medium" | "high" | "max";
}

export interface QueueSessionSummary {
  sessionId: string;
  title: string;
  status: QueueSessionStatus;
  purpose: QueueSessionPurpose;
  bnlPublicationStatus: QueueSessionBnlPublicationStatus;
  provenanceRevision: number;
  provenanceUpdatedAt?: string | null;
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
  acceptedCount?: number;
  submissionClosureReason?: QueueSubmissionClosureReason;
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
  broadcastStartedAt?: string | null;
  nextInLineTrackId?: string | null;
  nextInLineHoldTrackId?: string | null;
  loadedTrackId?: string | null;
  priorityUpgradesEnabled: boolean;
  priorityUpgradeLabel: string;
  priorityUpgradeInstructions: string;
  priorityUpgradePriceCents: number;
  priorityUpgradeCurrency: string;
  priorityUpgradePaymentsEnabled: boolean;
  signalHoldEnabled: boolean;
  signalHoldLabel: string;
  signalHoldInstructions: string;
  signalHoldPriceCents: number;
  signalHoldCurrency: string;
  signalHoldPaymentsEnabled: boolean;
  sponsorBreakSeconds?: number;
  sponsorBreakMode?: SponsorBreakMode;
  sponsorBreakStatus?: SponsorBreakStatus;
  sponsorBreakStartedAt?: string | null;
  sponsorBreakCompletedAt?: string | null;
  sponsorBreakCompletedAfterPlayableCount?: number | null;
  sponsorBreakDueAfterPlayableCount?: number | null;
  sponsorBreakManualNote?: string | null;
}

export interface QueueHistoricalRecoveryProvenance {
  schema: "barcode_queue_historical_recovery_provenance_v1";
  sourceUrl: string;
  sourceCommit: string;
  sourceRevision: number;
  sourceDigest: string;
  sourceResponseSha256: string;
  sourceSessionId: string;
  sourceStoredShowDate: string;
  canonicalShowDate: string;
  timeZone: "America/Los_Angeles";
  sourceStatus: QueueSessionStatus;
  appliedNormalizations: string[];
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
  playbackDiagnostics?: QueuePlaybackDiagnostics;
  showLog: QueueShowLogEvent[];
  historicalRecoveryProvenance?: QueueHistoricalRecoveryProvenance | null;
}

export interface QueuePublicTrack {
  id: string;
  submittedArtistName: string;
  submittedSongTitle: string;
  collaboratorNames?: string | null;
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
  providerTitle?: string | null;
  sourceType: QueueSourceType;
  lane: QueueLane;
  durationLabel: string;
  detectedDurationSeconds?: number | null;
  estimatedDurationSeconds?: number;
  durationIsEstimate: boolean;
  durationSource?: QueueDurationSource;
  sourceArtworkUrl?: string | null;
  publicSourceUrl?: string | null;
  tiktokHandle?: string | null;
  priorityUpgradeRequested?: boolean;
  priorityUpgradeStatus?: PriorityUpgradeStatus;
  priorityGiftAttribution?: PriorityGiftPublicAttribution | null;
  isSimulation?: boolean;
}

export interface QueuePublicSubmitterStatus {
  used: number;
  limit: number;
  remaining: number;
  cooldownRemainingSeconds: number;
  submitted: Array<Pick<QueuePublicTrack, "id" | "submittedArtistName" | "submittedSongTitle" | "collaboratorNames" | "sourceType" | "lane" | "durationLabel" | "detectedDurationSeconds" | "estimatedDurationSeconds" | "durationIsEstimate" | "durationSource" | "priorityUpgradeStatus"> & {
    signalHoldStatus?: SignalHoldStatus;
    signalHoldApplicationCount?: number;
  }>;
}

export interface QueuePublicSnapshot {
  revision: number;
  sessionActive?: boolean;
  suppressPublicLiveStatus?: boolean;
  session: Pick<QueueSessionSummary, "sessionId" | "title" | "showDate" | "status" | "purpose" | "description" | "completedCount" | "completedRuntimeSeconds" | "activeCount" | "acceptedCount" | "submissionClosureReason" | "removedCount" | "submissionCooldownSeconds" | "queueOpen" | "showStarted" | "preShowEndsAt" | "broadcastPhase" | "broadcastStartedAt" | "nextInLineTrackId" | "loadedTrackId" | "wheelSpinsOwed" | "priorityUpgradesEnabled" | "priorityUpgradeLabel" | "priorityUpgradeInstructions" | "priorityUpgradePriceCents" | "priorityUpgradeCurrency" | "priorityUpgradePaymentsEnabled" | "signalHoldEnabled" | "signalHoldLabel" | "signalHoldInstructions" | "signalHoldPriceCents" | "signalHoldCurrency" | "signalHoldPaymentsEnabled" | "sponsorBreakSeconds" | "sponsorBreakMode" | "sponsorBreakStatus" | "sponsorBreakStartedAt" | "sponsorBreakCompletedAt" | "sponsorBreakCompletedAfterPlayableCount" | "sponsorBreakDueAfterPlayableCount" | "sponsorBreakManualNote"> | null;
  status: QueuePublicStatus;
  queue: QueuePublicTrack[];
  completed: QueuePublicTrack[];
  nowPlaying?: QueuePublicTrack | null;
  upNext?: QueuePublicTrack | null;
  submitterStatus?: QueuePublicSubmitterStatus | null;
  playbackTiming?: QueuePlaybackTiming | null;
  wheelTiming?: QueueWheelTiming | null;
}

export interface QueuePublicStatsCounts {
  submittedTrackCount: number;
  finishedTrackCount: number;
  skippedTrackCount: number;
  removedTrackCount: number;
  activeTrackCount: number;
  waitingTrackCount: number;
  nowPlayingTrackCount: number;
  upNextTrackCount: number;
  unknownOutcomeTrackCount: number;
  wheelChosenTrackCount: number;
}

export interface QueuePublicShowStats extends QueuePublicStatsCounts {
  sessionId: string;
  title: string;
  showDate: string;
  status: QueueSessionStatus;
  broadcastPhase: QueueBroadcastPhase;
  submissionsOpen: boolean;
  sourceRevision: number;
  sourceUpdatedAt: string;
  trackRoster: QueuePublicHistoryTrack[];
  milestones: QueuePublicHistoryEvent[];
}

export type QueuePublicHistoryOutcome = "active" | "finished" | "skipped" | "removed" | "unknown";

export interface QueuePublicHistoryTrack {
  sessionId: string;
  sessionTitle: string;
  showDate: string;
  trackId: string;
  projectLabel: string;
  projectKey: string;
  title: string;
  submittedByTikTokHandle: string;
  collaboratorNames: string | null;
  sourceType: QueueSourceType;
  publicSourceUrl: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  outcome: QueuePublicHistoryOutcome;
  lane: QueueLane;
  wheelChosen: boolean;
  isSimulation?: boolean;
  submissionEventSequence: number | null;
  outcomeEventSequence: number | null;
}

export interface QueuePublicProjectHistory extends QueuePublicStatsCounts {
  projectKey: string;
  projectLabel: string;
  showCount: number;
  firstShowDate: string;
  latestShowDate: string;
  tracks: QueuePublicHistoryTrack[];
}

export interface QueuePublicHandleHistory extends QueuePublicStatsCounts {
  tiktokHandle: string;
  identityStatus: "submitted_handle_not_verified_account";
  profileStatus: "not_verified_profile";
  showCount: number;
  projectCount: number;
  firstShowDate: string;
  latestShowDate: string;
  currentShow: QueuePublicStatsCounts | null;
  projects: QueuePublicProjectHistory[];
}

export type QueuePublicHistoryEventType =
  | "submissions_opened"
  | "submissions_closed"
  | "broadcast_started"
  | "track_submitted"
  | "track_loaded"
  | "track_play_started"
  | "track_finished"
  | "track_removed"
  | "track_returned"
  | "track_restored"
  | "wheel_launched"
  | "wheel_spun"
  | "wheel_confirmed"
  | "sponsor_break_started"
  | "sponsor_break_completed"
  | "session_archived";

export interface QueuePublicHistoryEvent {
  eventId: string;
  sessionId: string;
  showDate: string;
  sequence: number;
  eventType: QueuePublicHistoryEventType;
  occurredAt: string;
  headline: string;
  detail: string;
  track: { projectLabel: string; title: string } | null;
}

export interface QueuePublicStats {
  schemaVersion: "queue_public_history_projection_v1";
  source: "queue_public_history_projection";
  visibility: "public_safe";
  historyCoverageStartedAt: "2026-08-24";
  builtAt: string | null;
  sourceRevision: number;
  sourceDigest: string;
  memoryDefault: "do_not_store";
  sourceFileDefault: "review_evidence_only";
  publicDossierDefault: "not_automatic";
  overview: QueuePublicStatsCounts & {
    showCount: number;
    artistCount: number;
    submitterHandleCount: number;
    publicTrackLinkCount: number;
  };
  currentShow: QueuePublicShowStats | null;
  latestShow: QueuePublicShowStats | null;
  shows: QueuePublicShowStats[];
  artists: QueuePublicProjectHistory[];
  recentEvents: QueuePublicHistoryEvent[];
  personalHistory: {
    access: "confirmed_same_browser_submission";
    identityStatus: "submitted_handle_not_verified_account";
    profileStatus: "not_verified_profile";
    handles: QueuePublicHandleHistory[];
  } | null;
}

export interface QueueWheelArtistOption {
  artist: string;
  normalizedArtist: string;
  trackIds: string[];
  trackCount: number;
}

export interface QueueState {
  revision?: number;
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
  playbackTiming?: QueuePlaybackTiming | null;
  wheelTiming?: QueueWheelTiming | null;
  playbackDiagnostics?: QueuePlaybackDiagnostics;
}


export interface ParsedTikTokVideoUrl {
  postId: string;
  sourceForm: "post" | "player";
  canonicalSourceUrl: string;
  playerUrl: string;
  oEmbedSourceUrl: string | null;
  handle?: string;
}

const TIKTOK_VIDEO_ID_PATTERN = /^\d{8,32}$/;
const TIKTOK_HANDLE_PATTERN = /^@[A-Za-z0-9._-]{1,64}$/;

export function parseTikTokVideoUrl(value?: string | null): ParsedTikTokVideoUrl | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (host !== "www.tiktok.com" && host !== "tiktok.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 3 && TIKTOK_HANDLE_PATTERN.test(parts[0]) && parts[1] === "video" && TIKTOK_VIDEO_ID_PATTERN.test(parts[2])) {
      const handle = parts[0].toLowerCase();
      const postId = parts[2];
      const canonicalSourceUrl = `https://www.tiktok.com/${handle}/video/${postId}`;
      return { postId, sourceForm: "post", handle, canonicalSourceUrl, playerUrl: `https://www.tiktok.com/player/v1/${postId}`, oEmbedSourceUrl: canonicalSourceUrl };
    }
    if (parts.length === 3 && parts[0] === "player" && parts[1] === "v1" && TIKTOK_VIDEO_ID_PATTERN.test(parts[2])) {
      const postId = parts[2];
      const playerUrl = `https://www.tiktok.com/player/v1/${postId}`;
      return { postId, sourceForm: "player", canonicalSourceUrl: playerUrl, playerUrl, oEmbedSourceUrl: null };
    }
    return null;
  } catch {
    return null;
  }
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

function isSafeHttpsArtworkUrl(value?: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function getTrackArtworkUrl(track: Pick<QueueEntry, "sourceType" | "sourceArtworkUrl" | "link"> | Pick<QueuePublicTrack, "sourceType" | "sourceArtworkUrl">): string | null {
  if (track.sourceType === "youtube" && "link" in track) {
    const videoId = parseQueueYouTubeVideoId(track.link);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
  if ((track.sourceType === "spotify" || track.sourceType === "soundcloud" || track.sourceType === "youtube" || track.sourceType === "tiktok") && isSafeHttpsArtworkUrl(track.sourceArtworkUrl)) return track.sourceArtworkUrl;
  return null;
}

export const INTERNAL_BUFFER_DURATION_SECONDS = 300;

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

export function getTrackDurationLabel(entry: Pick<QueueEntry, "detectedDurationSeconds" | "estimatedDurationSeconds" | "durationIsEstimate">): string {
  const runtime = getTrackRuntimeSeconds(entry);
  return entry.durationIsEstimate ? `est. ${formatRuntime(runtime)}` : formatRuntime(runtime);
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
  if (parseTikTokVideoUrl(value)) return "tiktok";
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
