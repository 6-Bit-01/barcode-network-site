import type { QueueEntry, QueuePublicTrack, QueueTrackStatus } from "./queue-types";

export const DEFAULT_UNKNOWN_TRACK_SECONDS = 300;
export const DEFAULT_HOST_TALK_BUFFER_SECONDS = 120;
export const DEFAULT_SPONSOR_BREAK_SECONDS = 630;
export const DEFAULT_WHEEL_CEREMONY_SECONDS = 120;
export const TARGET_SHOW_SECONDS = 14400;
export const WARNING_SHOW_SECONDS = 18000;
export const TYPICAL_SHOW_TRACK_COUNT = 42;
export const PRACTICAL_HIGH_SUBMISSION_COUNT = 50;
export const EXPECTED_DROPOUT_BUFFER = 8;

export type QueueTimingConfidence = "low" | "medium" | "high";
export type QueueTimingTargetStatus = "comfortable" | "tight" | "over_target" | "warning_ceiling" | "unknown";
export type QueueTimingTrackState = "now_playing" | "up_next" | "queued" | "played" | "removed" | "missing";
export type SponsorBreakStatus = "already_run" | "due" | "pending" | "not_needed" | "unknown";

type QueueTimingTrack = Partial<Pick<QueueEntry, "id" | "status" | "detectedDurationSeconds" | "estimatedDurationSeconds" | "durationIsEstimate" | "removedAt" | "completedAt" | "playedAt">> &
  Partial<Pick<QueuePublicTrack, "id" | "durationIsEstimate">>;

export interface QueueTimingOptions {
  unknownTrackSeconds?: number;
  hostTalkBufferSeconds?: number;
  sponsorBreakSeconds?: number;
  wheelCeremonySeconds?: number;
  targetShowSeconds?: number;
  warningShowSeconds?: number;
  sponsorBreakAlreadyRun?: boolean | null;
  includeHostBufferForNowPlaying?: boolean;
}

export interface QueueTimingInput {
  nowPlaying?: QueueTimingTrack | null;
  upNext?: QueueTimingTrack | null;
  nextInLine?: QueueTimingTrack | null;
  queue?: QueueTimingTrack[] | null;
  completed?: QueueTimingTrack[] | null;
  removed?: QueueTimingTrack[] | null;
  session?: {
    completedCount?: number | null;
    removedCount?: number | null;
    completedRuntimeSeconds?: number | null;
    estimatedActiveRuntimeSeconds?: number | null;
    wheelSpinsOwed?: number | null;
    activeCount?: number | null;
  } | null;
  completedRuntimeSeconds?: number | null;
  wheelSpinsOwed?: number | null;
}

interface NormalizedQueueTimingOptions {
  unknownTrackSeconds: number;
  hostTalkBufferSeconds: number;
  sponsorBreakSeconds: number;
  wheelCeremonySeconds: number;
  targetShowSeconds: number;
  warningShowSeconds: number;
  sponsorBreakAlreadyRun: boolean | null;
  includeHostBufferForNowPlaying: boolean;
}

export interface QueueRuntimeEstimate {
  trackSeconds: number;
  slotSeconds: number;
  knownDurationCount: number;
  unknownDurationCount: number;
  hostBufferSeconds: number;
}

export interface WheelCeremonyEstimate {
  wheelCeremonySeconds: number;
  wheelSpinsOwedIncluded: number;
  wheelUncertaintyNotes: string[];
}

export interface SponsorBreakEstimate {
  totalNonRemovedSubmissions: number | null;
  completedPlayableCount: number;
  sponsorBreakThreshold: number | null;
  sponsorBreakSeconds: number;
  sponsorBreakIncluded: boolean;
  sponsorBreakAlreadyRun: boolean | null;
  sponsorBreakStatus: SponsorBreakStatus;
  sponsorBreakNotes: string[];
}

export interface QueueTimingSnapshot {
  estimatedTotalShowSeconds: number;
  estimatedRemainingPlayableSeconds: number;
  completedRuntimeSeconds: number | null;
  remainingTargetSeconds: number;
  targetStatus: QueueTimingTargetStatus;
  warningStatus: "below_warning_ceiling" | "warning_ceiling" | "unknown";
  confidence: QueueTimingConfidence;
  completedPlayableCount: number;
  removedCount: number | null;
  activePlayableCount: number;
  knownDurationCount: number;
  unknownDurationCount: number;
  observedAverageTrackRuntimeSeconds: number | null;
  observedAverageSlotSeconds: number | null;
  sponsorBreak: SponsorBreakEstimate;
  wheelCeremony: WheelCeremonyEstimate;
  notes: string[];
}

export interface NewSubmissionTimingEstimate {
  songsAhead: number;
  estimatedSeconds: number;
  knownDurationCount: number;
  unknownDurationCount: number;
  hostBufferSeconds: number;
  wheelCeremonySeconds: number;
  sponsorBreakSecondsIncluded: number;
  sponsorBreakIncluded: boolean;
  sponsorBreakThreshold: number | null;
  targetStatus: QueueTimingTargetStatus;
  confidence: QueueTimingConfidence;
  notes: string[];
}

export interface ExistingTrackTimingEstimate {
  trackId: string;
  found: boolean;
  state: QueueTimingTrackState;
  songsAhead: number;
  estimatedSeconds: number;
  sponsorBreakIncluded: boolean;
  wheelCeremonySeconds: number;
  confidence: QueueTimingConfidence;
  notes: string[];
}

function safePositiveSeconds(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

function safeNonNegativeSeconds(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric);
}

function safeNonNegativeInteger(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function normalizeOptions(options?: QueueTimingOptions): NormalizedQueueTimingOptions {
  return {
    unknownTrackSeconds: safePositiveSeconds(options?.unknownTrackSeconds) ?? DEFAULT_UNKNOWN_TRACK_SECONDS,
    hostTalkBufferSeconds: safeNonNegativeSeconds(options?.hostTalkBufferSeconds) ?? DEFAULT_HOST_TALK_BUFFER_SECONDS,
    sponsorBreakSeconds: safeNonNegativeSeconds(options?.sponsorBreakSeconds) ?? DEFAULT_SPONSOR_BREAK_SECONDS,
    wheelCeremonySeconds: safeNonNegativeSeconds(options?.wheelCeremonySeconds) ?? DEFAULT_WHEEL_CEREMONY_SECONDS,
    targetShowSeconds: safePositiveSeconds(options?.targetShowSeconds) ?? TARGET_SHOW_SECONDS,
    warningShowSeconds: safePositiveSeconds(options?.warningShowSeconds) ?? WARNING_SHOW_SECONDS,
    sponsorBreakAlreadyRun: typeof options?.sponsorBreakAlreadyRun === "boolean" ? options.sponsorBreakAlreadyRun : null,
    includeHostBufferForNowPlaying: options?.includeHostBufferForNowPlaying === true,
  };
}

function isRemovedTrack(track: QueueTimingTrack | null | undefined): boolean {
  return track?.status === "removed" || Boolean(track?.removedAt);
}

function isCompletedTrack(track: QueueTimingTrack | null | undefined): boolean {
  return track?.status === "played" || track?.status === "completed" || Boolean(track?.completedAt || track?.playedAt);
}

function resolvedUpNext(input: QueueTimingInput): QueueTimingTrack | null {
  return input.upNext ?? input.nextInLine ?? null;
}

function activeTracksInResolvedOrder(input: QueueTimingInput): QueueTimingTrack[] {
  return [input.nowPlaying, resolvedUpNext(input), ...(input.queue ?? [])].filter((track): track is QueueTimingTrack => Boolean(track && !isRemovedTrack(track)));
}

function uniqueTracks(tracks: QueueTimingTrack[]): QueueTimingTrack[] {
  const seen = new Set<string>();
  const unique: QueueTimingTrack[] = [];
  tracks.forEach((track) => {
    const id = typeof track.id === "string" ? track.id : "";
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    unique.push(track);
  });
  return unique;
}

export function getEstimatedTrackRuntimeSeconds(track?: QueueTimingTrack | null, options?: QueueTimingOptions): number {
  const normalized = normalizeOptions(options);
  return safePositiveSeconds(track?.detectedDurationSeconds) ?? safePositiveSeconds(track?.estimatedDurationSeconds) ?? normalized.unknownTrackSeconds;
}

export function getEstimatedTrackSlotSeconds(track?: QueueTimingTrack | null, options?: QueueTimingOptions): number {
  const normalized = normalizeOptions(options);
  return getEstimatedTrackRuntimeSeconds(track, normalized) + normalized.hostTalkBufferSeconds;
}

export function estimateRuntimeForTracks(tracks: readonly (QueueTimingTrack | null | undefined)[], options?: QueueTimingOptions): QueueRuntimeEstimate {
  const normalized = normalizeOptions(options);
  return tracks.reduce<QueueRuntimeEstimate>((estimate, track) => {
    if (!track || isRemovedTrack(track)) return estimate;
    const knownSeconds = safePositiveSeconds(track.detectedDurationSeconds) ?? safePositiveSeconds(track.estimatedDurationSeconds);
    const trackSeconds = knownSeconds ?? normalized.unknownTrackSeconds;
    return {
      trackSeconds: estimate.trackSeconds + trackSeconds,
      slotSeconds: estimate.slotSeconds + trackSeconds + normalized.hostTalkBufferSeconds,
      knownDurationCount: estimate.knownDurationCount + (knownSeconds ? 1 : 0),
      unknownDurationCount: estimate.unknownDurationCount + (knownSeconds ? 0 : 1),
      hostBufferSeconds: estimate.hostBufferSeconds + normalized.hostTalkBufferSeconds,
    };
  }, { trackSeconds: 0, slotSeconds: 0, knownDurationCount: 0, unknownDurationCount: 0, hostBufferSeconds: 0 });
}

export function estimateWheelCeremonySeconds(wheelSpinsOwed?: number | null, options?: QueueTimingOptions): WheelCeremonyEstimate {
  const normalized = normalizeOptions(options);
  const wheelSpinsOwedIncluded = safeNonNegativeInteger(wheelSpinsOwed);
  const wheelCeremonySeconds = wheelSpinsOwedIncluded * normalized.wheelCeremonySeconds;
  return {
    wheelCeremonySeconds,
    wheelSpinsOwedIncluded,
    wheelUncertaintyNotes: wheelSpinsOwedIncluded > 0 ? ["Wheel ceremonies add overhead but usually move an already-submitted track rather than adding another song.", "Wheel rerolls, missing artists, or host recovery can shift timing."] : [],
  };
}

function countCompletedPlayable(input: QueueTimingInput): number {
  const completed = uniqueTracks(input.completed ?? []).filter((track) => isCompletedTrack(track) && !isRemovedTrack(track)).length;
  return Math.max(completed, safeNonNegativeInteger(input.session?.completedCount));
}

function countRemoved(input: QueueTimingInput): number | null {
  if (input.removed) return uniqueTracks(input.removed).length;
  const removedCount = input.session?.removedCount;
  return typeof removedCount === "number" && Number.isFinite(removedCount) ? Math.max(0, Math.floor(removedCount)) : null;
}

function countTotalNonRemoved(input: QueueTimingInput): number | null {
  const completed = uniqueTracks(input.completed ?? []).filter((track) => !isRemovedTrack(track));
  const active = activeTracksInResolvedOrder(input);
  const totalFromTracks = uniqueTracks([...completed, ...active]).length;
  const sessionCompleted = safeNonNegativeInteger(input.session?.completedCount);
  const sessionActive = safeNonNegativeInteger(input.session?.activeCount);
  const totalFromSession = sessionCompleted + sessionActive;
  const total = Math.max(totalFromTracks, totalFromSession);
  return total > 0 ? total : null;
}

export function estimateSponsorBreakPlacement(input: QueueTimingInput, options?: QueueTimingOptions & { targetSongsAhead?: number | null }): SponsorBreakEstimate {
  const normalized = normalizeOptions(options);
  const completedPlayableCount = countCompletedPlayable(input);
  const totalNonRemovedSubmissions = countTotalNonRemoved(input);
  const sponsorBreakThreshold = totalNonRemovedSubmissions ? Math.ceil(totalNonRemovedSubmissions / 2) : null;
  const targetSongsAhead = safeNonNegativeInteger(options?.targetSongsAhead);
  const targetStartCompletedCount = completedPlayableCount + targetSongsAhead;
  const sponsorBreakNotes: string[] = [];

  if (normalized.sponsorBreakAlreadyRun === null) sponsorBreakNotes.push("Sponsor break persistence is not tracked by this helper input; estimates include the break when the midpoint appears due or crossed.");
  if (totalNonRemovedSubmissions === null) sponsorBreakNotes.push("Non-removed submission total is unavailable, so sponsor midpoint placement is unknown.");

  let sponsorBreakIncluded = false;
  let sponsorBreakStatus: SponsorBreakStatus = "unknown";
  if (normalized.sponsorBreakAlreadyRun === true) {
    sponsorBreakStatus = "already_run";
  } else if (sponsorBreakThreshold === null) {
    sponsorBreakStatus = "unknown";
  } else if (sponsorBreakThreshold <= 0) {
    sponsorBreakStatus = "not_needed";
  } else if (completedPlayableCount >= sponsorBreakThreshold) {
    sponsorBreakStatus = "due";
    sponsorBreakIncluded = true;
  } else {
    sponsorBreakStatus = "pending";
    sponsorBreakIncluded = targetStartCompletedCount >= sponsorBreakThreshold;
  }

  if (normalized.sponsorBreakAlreadyRun === false && sponsorBreakStatus === "due") sponsorBreakNotes.push("Sponsor midpoint has been reached and the break is not marked as already run.");

  return {
    totalNonRemovedSubmissions,
    completedPlayableCount,
    sponsorBreakThreshold,
    sponsorBreakSeconds: normalized.sponsorBreakSeconds,
    sponsorBreakIncluded,
    sponsorBreakAlreadyRun: normalized.sponsorBreakAlreadyRun,
    sponsorBreakStatus,
    sponsorBreakNotes,
  };
}

function targetStatusFor(seconds: number, options: NormalizedQueueTimingOptions): QueueTimingTargetStatus {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  if (seconds >= options.warningShowSeconds) return "warning_ceiling";
  if (seconds > options.targetShowSeconds) return "over_target";
  if (seconds >= options.targetShowSeconds * 0.9) return "tight";
  return "comfortable";
}

function confidenceFor(knownDurationCount: number, unknownDurationCount: number, completedPlayableCount: number, sponsorBreak: SponsorBreakEstimate): QueueTimingConfidence {
  if (unknownDurationCount === 0 && knownDurationCount > 0 && completedPlayableCount >= 8 && sponsorBreak.sponsorBreakAlreadyRun !== null) return "high";
  if (knownDurationCount >= unknownDurationCount && knownDurationCount > 0) return "medium";
  return "low";
}

export function buildQueueTimingSnapshot(input: QueueTimingInput, options?: QueueTimingOptions): QueueTimingSnapshot {
  const normalized = normalizeOptions(options);
  const active = activeTracksInResolvedOrder(input);
  const activeRuntime = estimateRuntimeForTracks(active, normalized);
  const completedRuntimeSeconds = safePositiveSeconds(input.completedRuntimeSeconds) ?? safePositiveSeconds(input.session?.completedRuntimeSeconds) ?? null;
  const completedEstimatedRuntime = completedRuntimeSeconds ?? estimateRuntimeForTracks(input.completed ?? [], normalized).slotSeconds;
  const wheelCeremony = estimateWheelCeremonySeconds(input.wheelSpinsOwed ?? input.session?.wheelSpinsOwed, normalized);
  const sponsorBreak = estimateSponsorBreakPlacement(input, { ...normalized, targetSongsAhead: active.length });
  const sponsorBreakSeconds = sponsorBreak.sponsorBreakIncluded ? sponsorBreak.sponsorBreakSeconds : 0;
  const estimatedTotalShowSeconds = completedEstimatedRuntime + activeRuntime.slotSeconds + wheelCeremony.wheelCeremonySeconds + sponsorBreakSeconds;
  const completedPlayableCount = countCompletedPlayable(input);
  const observedAverageSlotSeconds = completedRuntimeSeconds && completedPlayableCount > 0 ? Math.round(completedRuntimeSeconds / completedPlayableCount) : null;
  const completedTrackRuntime = estimateRuntimeForTracks(input.completed ?? [], { ...normalized, hostTalkBufferSeconds: 0 }).trackSeconds;
  const observedAverageTrackRuntimeSeconds = completedTrackRuntime > 0 && completedPlayableCount > 0 ? Math.round(completedTrackRuntime / completedPlayableCount) : null;
  const confidence = confidenceFor(activeRuntime.knownDurationCount, activeRuntime.unknownDurationCount, completedPlayableCount, sponsorBreak);
  const notes = [...sponsorBreak.sponsorBreakNotes, ...wheelCeremony.wheelUncertaintyNotes];
  if (activeRuntime.unknownDurationCount > 0) notes.push("Unknown or unavailable track durations use the 5-minute fallback before host buffer.");
  if (completedRuntimeSeconds === null) notes.push("Completed runtime seconds were not provided, so completed tracks use the same estimate rules as queued tracks.");
  if (countRemoved(input) === null) notes.push("Removed track detail/count was not provided; removed/dropout diagnostics may be incomplete.");

  return {
    estimatedTotalShowSeconds,
    estimatedRemainingPlayableSeconds: activeRuntime.slotSeconds + wheelCeremony.wheelCeremonySeconds + sponsorBreakSeconds,
    completedRuntimeSeconds,
    remainingTargetSeconds: normalized.targetShowSeconds - estimatedTotalShowSeconds,
    targetStatus: targetStatusFor(estimatedTotalShowSeconds, normalized),
    warningStatus: estimatedTotalShowSeconds >= normalized.warningShowSeconds ? "warning_ceiling" : "below_warning_ceiling",
    confidence,
    completedPlayableCount,
    removedCount: countRemoved(input),
    activePlayableCount: active.length,
    knownDurationCount: activeRuntime.knownDurationCount,
    unknownDurationCount: activeRuntime.unknownDurationCount,
    observedAverageTrackRuntimeSeconds,
    observedAverageSlotSeconds,
    sponsorBreak,
    wheelCeremony,
    notes,
  };
}

export function estimateNewSubmissionTiming(input: QueueTimingInput, options?: QueueTimingOptions): NewSubmissionTimingEstimate {
  const normalized = normalizeOptions(options);
  const tracksAhead = activeTracksInResolvedOrder(input);
  const runtimeAhead = estimateRuntimeForTracks(tracksAhead, normalized);
  const wheelCeremony = estimateWheelCeremonySeconds(input.wheelSpinsOwed ?? input.session?.wheelSpinsOwed, normalized);
  const sponsorBreak = estimateSponsorBreakPlacement(input, { ...normalized, targetSongsAhead: tracksAhead.length });
  const sponsorBreakSecondsIncluded = sponsorBreak.sponsorBreakIncluded ? sponsorBreak.sponsorBreakSeconds : 0;
  const snapshot = buildQueueTimingSnapshot(input, normalized);
  const notes = [...sponsorBreak.sponsorBreakNotes, ...wheelCeremony.wheelUncertaintyNotes];
  notes.push("New submission timing uses the current resolved visible order only and does not replace queue resolver decisions.");

  return {
    songsAhead: tracksAhead.length,
    estimatedSeconds: runtimeAhead.slotSeconds + wheelCeremony.wheelCeremonySeconds + sponsorBreakSecondsIncluded,
    knownDurationCount: runtimeAhead.knownDurationCount,
    unknownDurationCount: runtimeAhead.unknownDurationCount,
    hostBufferSeconds: runtimeAhead.hostBufferSeconds,
    wheelCeremonySeconds: wheelCeremony.wheelCeremonySeconds,
    sponsorBreakSecondsIncluded,
    sponsorBreakIncluded: sponsorBreak.sponsorBreakIncluded,
    sponsorBreakThreshold: sponsorBreak.sponsorBreakThreshold,
    targetStatus: snapshot.targetStatus,
    confidence: snapshot.confidence,
    notes,
  };
}

function statusState(track: QueueTimingTrack, fallback: QueueTimingTrackState): QueueTimingTrackState {
  if (isRemovedTrack(track)) return "removed";
  if (isCompletedTrack(track)) return "played";
  const status = track.status as QueueTrackStatus | undefined;
  if (status === "playing") return "now_playing";
  if (status === "next") return "up_next";
  return fallback;
}

export function estimateExistingTrackTiming(input: QueueTimingInput, trackId: string, options?: QueueTimingOptions): ExistingTrackTimingEstimate {
  const normalized = normalizeOptions(options);
  const notes: string[] = [];
  const nowPlaying = input.nowPlaying ?? null;
  if (nowPlaying?.id === trackId) return { trackId, found: true, state: "now_playing", songsAhead: 0, estimatedSeconds: 0, sponsorBreakIncluded: false, wheelCeremonySeconds: 0, confidence: "high", notes: ["Track is currently loaded as Now Playing."] };

  const upNext = resolvedUpNext(input);
  if (upNext?.id === trackId) {
    const sponsorBreak = estimateSponsorBreakPlacement(input, { ...normalized, targetSongsAhead: nowPlaying && !isRemovedTrack(nowPlaying) ? 1 : 0 });
    return { trackId, found: true, state: "up_next", songsAhead: nowPlaying && !isRemovedTrack(nowPlaying) ? 1 : 0, estimatedSeconds: (nowPlaying && !isRemovedTrack(nowPlaying) ? getEstimatedTrackSlotSeconds(nowPlaying, normalized) : 0) + (sponsorBreak.sponsorBreakIncluded ? sponsorBreak.sponsorBreakSeconds : 0), sponsorBreakIncluded: sponsorBreak.sponsorBreakIncluded, wheelCeremonySeconds: 0, confidence: confidenceFor(1, 0, countCompletedPlayable(input), sponsorBreak), notes: [...sponsorBreak.sponsorBreakNotes, "Track is currently staged as Up Next / Next In Line."] };
  }

  const queue = input.queue ?? [];
  const queueIndex = queue.findIndex((track) => track?.id === trackId);
  if (queueIndex >= 0) {
    const tracksAhead = activeTracksInResolvedOrder({ ...input, queue: queue.slice(0, queueIndex) });
    const runtimeAhead = estimateRuntimeForTracks(tracksAhead, normalized);
    const wheelCeremony = estimateWheelCeremonySeconds(input.wheelSpinsOwed ?? input.session?.wheelSpinsOwed, normalized);
    const sponsorBreak = estimateSponsorBreakPlacement(input, { ...normalized, targetSongsAhead: tracksAhead.length });
    const sponsorBreakSecondsIncluded = sponsorBreak.sponsorBreakIncluded ? sponsorBreak.sponsorBreakSeconds : 0;
    notes.push("Queued track timing uses tracks ahead in the current resolved visible order and does not simulate resolver lane decisions.");
    return { trackId, found: true, state: statusState(queue[queueIndex], "queued"), songsAhead: tracksAhead.length, estimatedSeconds: runtimeAhead.slotSeconds + wheelCeremony.wheelCeremonySeconds + sponsorBreakSecondsIncluded, sponsorBreakIncluded: sponsorBreak.sponsorBreakIncluded, wheelCeremonySeconds: wheelCeremony.wheelCeremonySeconds, confidence: confidenceFor(runtimeAhead.knownDurationCount, runtimeAhead.unknownDurationCount, countCompletedPlayable(input), sponsorBreak), notes: [...notes, ...sponsorBreak.sponsorBreakNotes, ...wheelCeremony.wheelUncertaintyNotes] };
  }

  const completed = input.completed?.find((track) => track?.id === trackId);
  if (completed) return { trackId, found: true, state: statusState(completed, "played"), songsAhead: 0, estimatedSeconds: 0, sponsorBreakIncluded: false, wheelCeremonySeconds: 0, confidence: "high", notes: ["Track is in completed/played history."] };

  const removed = input.removed?.find((track) => track?.id === trackId);
  if (removed) return { trackId, found: true, state: "removed", songsAhead: 0, estimatedSeconds: 0, sponsorBreakIncluded: false, wheelCeremonySeconds: 0, confidence: "high", notes: ["Track is marked removed and is excluded from playable timing."] };

  return { trackId, found: false, state: "missing", songsAhead: 0, estimatedSeconds: 0, sponsorBreakIncluded: false, wheelCeremonySeconds: 0, confidence: "low", notes: ["Track was not found in now playing, up next, queue, completed, or removed input."] };
}
