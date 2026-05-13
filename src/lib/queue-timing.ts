import type { QueueEntry, QueuePublicSnapshot, QueuePublicTrack, QueueSessionSummary } from "@/lib/queue-types";

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
export type SponsorBreakStatus = "already_run" | "due" | "pending" | "not_applicable" | "unknown";
export type ExistingTrackTimingState = "now_playing" | "up_next" | "queued" | "played" | "removed" | "missing";

export type QueueTimingTrack = Partial<Pick<QueueEntry,
  "id" | "status" | "detectedDurationSeconds" | "estimatedDurationSeconds" | "durationIsEstimate" | "durationSource" | "playedAt" | "completedAt" | "removedAt" | "createdAt"
>> & Partial<Pick<QueuePublicTrack, "durationLabel">>;

export type QueueTimingOptions = {
  unknownTrackSeconds?: number;
  hostTalkBufferSeconds?: number;
  sponsorBreakSeconds?: number;
  wheelCeremonySeconds?: number;
  targetShowSeconds?: number;
  warningShowSeconds?: number;
  sponsorBreakAlreadyRun?: boolean | null;
  includeHostBuffer?: boolean;
};

export type QueueTimingInput = {
  nowPlaying?: QueueTimingTrack | null;
  upNext?: QueueTimingTrack | null;
  queue?: QueueTimingTrack[];
  completed?: QueueTimingTrack[];
  removed?: QueueTimingTrack[];
  session?: Partial<Pick<QueueSessionSummary,
    "completedCount" | "completedRuntimeSeconds" | "removedCount" | "wheelSpinsOwed" | "activeCount" | "queueCapacity" | "broadcastPhase" | "showStarted"
  >> | null;
  status?: Partial<QueuePublicSnapshot["status"]> | null;
  wheelSpinsOwed?: number | null;
  completedRuntimeSeconds?: number | null;
};

export type TrackRuntimeEstimate = {
  runtimeSeconds: number;
  isFallback: boolean;
  source: "detected" | "stored_estimate" | "fallback";
};

export type RuntimeTracksEstimate = {
  trackRuntimeSeconds: number;
  hostBufferSeconds: number;
  totalSeconds: number;
  knownDurationCount: number;
  unknownDurationCount: number;
  trackCount: number;
};

export type WheelCeremonyEstimate = {
  wheelCeremonySeconds: number;
  wheelSpinsOwedIncluded: number;
  wheelUncertaintyNotes: string[];
};

export type SponsorBreakEstimate = {
  sponsorBreakSeconds: number;
  sponsorBreakIncluded: boolean;
  sponsorBreakThreshold: number | null;
  sponsorBreakAlreadyRun: boolean | null;
  sponsorBreakStatus: SponsorBreakStatus;
  totalNonRemovedSubmissions: number;
  completedPlayableCount: number;
  targetPlayableOrdinal: number | null;
  sponsorBreakNotes: string[];
};

export type QueueTimingSnapshot = {
  activeTracks: QueueTimingTrack[];
  completedTracks: QueueTimingTrack[];
  removedTracks: QueueTimingTrack[];
  activeRuntime: RuntimeTracksEstimate;
  completedPlayableCount: number;
  removedCount: number;
  completedRuntimeSeconds: number | null;
  observedAverageTrackRuntimeSeconds: number | null;
  observedAverageSlotSeconds: number | null;
  estimatedShowRuntimeSeconds: number;
  remainingToTargetSeconds: number;
  targetStatus: QueueTimingTargetStatus;
  warningStatus: "below_warning" | "at_or_over_warning" | "unknown";
  confidence: QueueTimingConfidence;
  sponsorBreak: SponsorBreakEstimate;
  wheelCeremony: WheelCeremonyEstimate;
  notes: string[];
};

export type NewSubmissionTimingEstimate = {
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
};

export type ExistingTrackTimingEstimate = {
  trackId: string;
  found: boolean;
  state: ExistingTrackTimingState;
  songsAhead: number;
  estimatedSeconds: number;
  sponsorBreakIncluded: boolean;
  wheelCeremonySeconds: number;
  confidence: QueueTimingConfidence;
  notes: string[];
};

function optionSeconds(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) >= 0 ? Math.floor(value ?? fallback) : fallback;
}

function uniqueTracks(tracks: Array<QueueTimingTrack | null | undefined>): QueueTimingTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track): track is QueueTimingTrack => {
    if (!track) return false;
    if (!track.id) return true;
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function isPositiveFiniteSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizedWheelSpinsOwed(input: QueueTimingInput): number {
  const value = input.wheelSpinsOwed ?? input.session?.wheelSpinsOwed ?? 0;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function activeTracksInResolvedOrder(input: QueueTimingInput): QueueTimingTrack[] {
  return uniqueTracks([input.nowPlaying, input.upNext, ...(input.queue ?? [])]).filter((track) => track.removedAt == null && track.status !== "removed");
}

function completedTracks(input: QueueTimingInput): QueueTimingTrack[] {
  return uniqueTracks(input.completed ?? []).filter((track) => track.removedAt == null && track.status !== "removed");
}

function removedTracks(input: QueueTimingInput): QueueTimingTrack[] {
  return uniqueTracks(input.removed ?? []);
}

export function getEstimatedTrackRuntimeSeconds(track: QueueTimingTrack | null | undefined, options: QueueTimingOptions = {}): TrackRuntimeEstimate {
  if (isPositiveFiniteSeconds(track?.detectedDurationSeconds)) return { runtimeSeconds: Math.round(track.detectedDurationSeconds), isFallback: false, source: "detected" };
  if (isPositiveFiniteSeconds(track?.estimatedDurationSeconds)) return { runtimeSeconds: Math.round(track.estimatedDurationSeconds), isFallback: track?.durationIsEstimate !== false, source: "stored_estimate" };
  return { runtimeSeconds: optionSeconds(options.unknownTrackSeconds, DEFAULT_UNKNOWN_TRACK_SECONDS), isFallback: true, source: "fallback" };
}

export function getEstimatedTrackSlotSeconds(track: QueueTimingTrack | null | undefined, options: QueueTimingOptions = {}): number {
  const runtime = getEstimatedTrackRuntimeSeconds(track, options).runtimeSeconds;
  const buffer = options.includeHostBuffer === false ? 0 : optionSeconds(options.hostTalkBufferSeconds, DEFAULT_HOST_TALK_BUFFER_SECONDS);
  return runtime + buffer;
}

export function estimateRuntimeForTracks(tracks: QueueTimingTrack[], options: QueueTimingOptions = {}): RuntimeTracksEstimate {
  const bufferPerTrack = options.includeHostBuffer === false ? 0 : optionSeconds(options.hostTalkBufferSeconds, DEFAULT_HOST_TALK_BUFFER_SECONDS);
  return tracks.reduce<RuntimeTracksEstimate>((estimate, track) => {
    const runtime = getEstimatedTrackRuntimeSeconds(track, options);
    estimate.trackRuntimeSeconds += runtime.runtimeSeconds;
    estimate.hostBufferSeconds += bufferPerTrack;
    estimate.totalSeconds += runtime.runtimeSeconds + bufferPerTrack;
    estimate.trackCount += 1;
    if (runtime.isFallback) estimate.unknownDurationCount += 1;
    else estimate.knownDurationCount += 1;
    return estimate;
  }, { trackRuntimeSeconds: 0, hostBufferSeconds: 0, totalSeconds: 0, knownDurationCount: 0, unknownDurationCount: 0, trackCount: 0 });
}

export function estimateWheelCeremonySeconds(wheelSpinsOwed: number | null | undefined, options: QueueTimingOptions = {}): WheelCeremonyEstimate {
  const wheelSpinsOwedIncluded = Number.isFinite(wheelSpinsOwed) ? Math.max(0, Math.floor(wheelSpinsOwed ?? 0)) : 0;
  const wheelCeremonySeconds = wheelSpinsOwedIncluded * optionSeconds(options.wheelCeremonySeconds, DEFAULT_WHEEL_CEREMONY_SECONDS);
  return {
    wheelCeremonySeconds,
    wheelSpinsOwedIncluded,
    wheelUncertaintyNotes: wheelSpinsOwedIncluded > 0 ? ["Wheel ceremonies add overhead but do not automatically add extra track runtime.", "Wheel rerolls, errors, or missing artists can shift timing."] : [],
  };
}

function targetStatusForSeconds(seconds: number, options: QueueTimingOptions = {}): QueueTimingTargetStatus {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  const target = optionSeconds(options.targetShowSeconds, TARGET_SHOW_SECONDS);
  const warning = optionSeconds(options.warningShowSeconds, WARNING_SHOW_SECONDS);
  if (seconds >= warning) return "warning_ceiling";
  if (seconds > target) return "over_target";
  if (seconds >= target * 0.9) return "tight";
  return "comfortable";
}

function confidenceForEstimate(knownDurationCount: number, unknownDurationCount: number, completedPlayableCount: number): QueueTimingConfidence {
  const total = knownDurationCount + unknownDurationCount;
  if (total === 0) return completedPlayableCount >= 8 ? "medium" : "low";
  const knownRatio = knownDurationCount / total;
  if (knownRatio >= 0.75 && completedPlayableCount >= 8) return "high";
  if (knownRatio >= 0.4 || completedPlayableCount >= 4) return "medium";
  return "low";
}

export function estimateSponsorBreakPlacement(input: QueueTimingInput & { targetPlayableOrdinal?: number | null }, options: QueueTimingOptions = {}): SponsorBreakEstimate {
  const active = activeTracksInResolvedOrder(input);
  const completed = completedTracks(input);
  const removed = removedTracks(input);
  const completedPlayableCount = Math.max(input.session?.completedCount ?? completed.length, completed.length);
  const removedCount = Math.max(input.session?.removedCount ?? removed.length, removed.length);
  const activeCount = Math.max(input.status?.activeCount ?? input.session?.activeCount ?? active.length, active.length);
  const totalNonRemovedSubmissions = completedPlayableCount + activeCount;
  const sponsorBreakThreshold = totalNonRemovedSubmissions > 0 ? Math.ceil(totalNonRemovedSubmissions / 2) : null;
  const sponsorBreakAlreadyRun = options.sponsorBreakAlreadyRun ?? null;
  const targetPlayableOrdinal = input.targetPlayableOrdinal ?? null;
  const sponsorBreakSeconds = optionSeconds(options.sponsorBreakSeconds, DEFAULT_SPONSOR_BREAK_SECONDS);
  const crossesSponsorBreak = sponsorBreakThreshold !== null && targetPlayableOrdinal !== null && targetPlayableOrdinal > sponsorBreakThreshold;
  const sponsorBreakDue = sponsorBreakThreshold !== null && completedPlayableCount >= sponsorBreakThreshold;
  const sponsorBreakIncluded = crossesSponsorBreak && sponsorBreakAlreadyRun !== true;
  const sponsorBreakNotes: string[] = [];
  if (sponsorBreakThreshold === null) sponsorBreakNotes.push("Sponsor midpoint cannot be calculated without non-removed submission counts.");
  if (removedCount > 0) sponsorBreakNotes.push("Removed tracks are excluded from sponsor midpoint and playable runtime counts.");
  if (sponsorBreakAlreadyRun === null && sponsorBreakIncluded) sponsorBreakNotes.push("Sponsor break persistence is not tracked here, so inclusion is conservative.");

  const sponsorBreakStatus: SponsorBreakStatus = sponsorBreakAlreadyRun === true
    ? "already_run"
    : sponsorBreakThreshold === null
      ? "unknown"
      : sponsorBreakDue
        ? "due"
        : totalNonRemovedSubmissions === 0
          ? "not_applicable"
          : "pending";

  return {
    sponsorBreakSeconds,
    sponsorBreakIncluded,
    sponsorBreakThreshold,
    sponsorBreakAlreadyRun,
    sponsorBreakStatus,
    totalNonRemovedSubmissions,
    completedPlayableCount,
    targetPlayableOrdinal,
    sponsorBreakNotes,
  };
}

export function buildQueueTimingSnapshot(input: QueueTimingInput, options: QueueTimingOptions = {}): QueueTimingSnapshot {
  const activeTracks = activeTracksInResolvedOrder(input);
  const completed = completedTracks(input);
  const removed = removedTracks(input);
  const activeRuntime = estimateRuntimeForTracks(activeTracks, options);
  const completedRuntimeSeconds = input.completedRuntimeSeconds ?? input.session?.completedRuntimeSeconds ?? null;
  const completedPlayableCount = Math.max(input.session?.completedCount ?? completed.length, completed.length);
  const removedCount = Math.max(input.session?.removedCount ?? removed.length, removed.length);
  const wheelCeremony = estimateWheelCeremonySeconds(normalizedWheelSpinsOwed(input), options);
  const sponsorBreak = estimateSponsorBreakPlacement({ ...input, targetPlayableOrdinal: completedPlayableCount + activeTracks.length }, options);
  const completedRuntimeForTotal = Number.isFinite(completedRuntimeSeconds) ? Math.max(0, Math.floor(completedRuntimeSeconds ?? 0)) : estimateRuntimeForTracks(completed, options).totalSeconds;
  const estimatedShowRuntimeSeconds = completedRuntimeForTotal + activeRuntime.totalSeconds + wheelCeremony.wheelCeremonySeconds + (sponsorBreak.sponsorBreakIncluded ? sponsorBreak.sponsorBreakSeconds : 0);
  const target = optionSeconds(options.targetShowSeconds, TARGET_SHOW_SECONDS);
  const warning = optionSeconds(options.warningShowSeconds, WARNING_SHOW_SECONDS);
  const observedAverageTrackRuntimeSeconds = completedPlayableCount > 0 && completedRuntimeSeconds !== null ? completedRuntimeForTotal / completedPlayableCount : null;
  const observedAverageSlotSeconds = observedAverageTrackRuntimeSeconds === null ? null : observedAverageTrackRuntimeSeconds + optionSeconds(options.hostTalkBufferSeconds, DEFAULT_HOST_TALK_BUFFER_SECONDS);
  const targetStatus = targetStatusForSeconds(estimatedShowRuntimeSeconds, options);
  const notes = [...sponsorBreak.sponsorBreakNotes, ...wheelCeremony.wheelUncertaintyNotes];
  if (removedCount === 0 && !input.removed && (input.session?.removedCount ?? 0) === 0) notes.push("No removed-track list was provided; removed/dropout diagnostics are limited to available counts.");
  if (completedRuntimeSeconds !== null) notes.push("Completed runtime seconds are used as live pace diagnostics only; estimates still use stored/fallback track runtime.");

  return {
    activeTracks,
    completedTracks: completed,
    removedTracks: removed,
    activeRuntime,
    completedPlayableCount,
    removedCount,
    completedRuntimeSeconds: completedRuntimeSeconds === null ? null : completedRuntimeForTotal,
    observedAverageTrackRuntimeSeconds,
    observedAverageSlotSeconds,
    estimatedShowRuntimeSeconds,
    remainingToTargetSeconds: target - estimatedShowRuntimeSeconds,
    targetStatus,
    warningStatus: estimatedShowRuntimeSeconds >= warning ? "at_or_over_warning" : "below_warning",
    confidence: confidenceForEstimate(activeRuntime.knownDurationCount, activeRuntime.unknownDurationCount, completedPlayableCount),
    sponsorBreak,
    wheelCeremony,
    notes,
  };
}

export function estimateNewSubmissionTiming(input: QueueTimingInput, options: QueueTimingOptions = {}): NewSubmissionTimingEstimate {
  const tracksAhead = activeTracksInResolvedOrder(input);
  const runtimeAhead = estimateRuntimeForTracks(tracksAhead, options);
  const completedPlayableCount = Math.max(input.session?.completedCount ?? completedTracks(input).length, completedTracks(input).length);
  const targetPlayableOrdinal = completedPlayableCount + tracksAhead.length + 1;
  const sponsorBreak = estimateSponsorBreakPlacement({ ...input, targetPlayableOrdinal }, options);
  const wheelCeremony = estimateWheelCeremonySeconds(normalizedWheelSpinsOwed(input), options);
  const sponsorBreakSecondsIncluded = sponsorBreak.sponsorBreakIncluded ? sponsorBreak.sponsorBreakSeconds : 0;
  const estimatedSeconds = runtimeAhead.totalSeconds + wheelCeremony.wheelCeremonySeconds + sponsorBreakSecondsIncluded;
  const snapshot = buildQueueTimingSnapshot(input, options);

  return {
    songsAhead: tracksAhead.length,
    estimatedSeconds,
    knownDurationCount: runtimeAhead.knownDurationCount,
    unknownDurationCount: runtimeAhead.unknownDurationCount,
    hostBufferSeconds: runtimeAhead.hostBufferSeconds,
    wheelCeremonySeconds: wheelCeremony.wheelCeremonySeconds,
    sponsorBreakSecondsIncluded,
    sponsorBreakIncluded: sponsorBreak.sponsorBreakIncluded,
    sponsorBreakThreshold: sponsorBreak.sponsorBreakThreshold,
    targetStatus: snapshot.targetStatus,
    confidence: confidenceForEstimate(runtimeAhead.knownDurationCount, runtimeAhead.unknownDurationCount, completedPlayableCount),
    notes: [...sponsorBreak.sponsorBreakNotes, ...wheelCeremony.wheelUncertaintyNotes, "Estimate uses current resolved visible order only and does not replace queue resolver behavior."],
  };
}

function findTrackIndexById(tracks: QueueTimingTrack[], trackId: string): number {
  return tracks.findIndex((track) => track.id === trackId);
}

export function estimateExistingTrackTiming(input: QueueTimingInput, trackId: string, options: QueueTimingOptions = {}): ExistingTrackTimingEstimate {
  const notes = ["Estimate uses current resolved visible order only and does not replace queue resolver behavior."];
  if (input.nowPlaying?.id === trackId) return { trackId, found: true, state: "now_playing", songsAhead: 0, estimatedSeconds: 0, sponsorBreakIncluded: false, wheelCeremonySeconds: 0, confidence: "high", notes: ["Track is playing now."] };

  const wheelCeremony = estimateWheelCeremonySeconds(normalizedWheelSpinsOwed(input), options);
  const completedPlayableCount = Math.max(input.session?.completedCount ?? completedTracks(input).length, completedTracks(input).length);

  if (input.upNext?.id === trackId) {
    const tracksAhead = input.nowPlaying ? [input.nowPlaying] : [];
    const runtimeAhead = estimateRuntimeForTracks(tracksAhead, options);
    const sponsorBreak = estimateSponsorBreakPlacement({ ...input, targetPlayableOrdinal: completedPlayableCount + 1 }, options);
    const sponsorBreakSecondsIncluded = sponsorBreak.sponsorBreakIncluded ? sponsorBreak.sponsorBreakSeconds : 0;
    return { trackId, found: true, state: "up_next", songsAhead: 0, estimatedSeconds: runtimeAhead.totalSeconds + wheelCeremony.wheelCeremonySeconds + sponsorBreakSecondsIncluded, sponsorBreakIncluded: sponsorBreak.sponsorBreakIncluded, wheelCeremonySeconds: wheelCeremony.wheelCeremonySeconds, confidence: confidenceForEstimate(runtimeAhead.knownDurationCount, runtimeAhead.unknownDurationCount, completedPlayableCount), notes: [...notes, ...sponsorBreak.sponsorBreakNotes, ...wheelCeremony.wheelUncertaintyNotes, "Track is currently Next In Line."] };
  }

  const queuedIndex = findTrackIndexById(input.queue ?? [], trackId);
  if (queuedIndex >= 0) {
    const tracksAhead = activeTracksInResolvedOrder({ ...input, queue: (input.queue ?? []).slice(0, queuedIndex) });
    const runtimeAhead = estimateRuntimeForTracks(tracksAhead, options);
    const targetPlayableOrdinal = completedPlayableCount + tracksAhead.length + 1;
    const sponsorBreak = estimateSponsorBreakPlacement({ ...input, targetPlayableOrdinal }, options);
    const sponsorBreakSecondsIncluded = sponsorBreak.sponsorBreakIncluded ? sponsorBreak.sponsorBreakSeconds : 0;
    return { trackId, found: true, state: "queued", songsAhead: tracksAhead.length, estimatedSeconds: runtimeAhead.totalSeconds + wheelCeremony.wheelCeremonySeconds + sponsorBreakSecondsIncluded, sponsorBreakIncluded: sponsorBreak.sponsorBreakIncluded, wheelCeremonySeconds: wheelCeremony.wheelCeremonySeconds, confidence: confidenceForEstimate(runtimeAhead.knownDurationCount, runtimeAhead.unknownDurationCount, completedPlayableCount), notes: [...notes, ...sponsorBreak.sponsorBreakNotes, ...wheelCeremony.wheelUncertaintyNotes] };
  }

  if (findTrackIndexById(input.completed ?? [], trackId) >= 0) return { trackId, found: true, state: "played", songsAhead: 0, estimatedSeconds: 0, sponsorBreakIncluded: false, wheelCeremonySeconds: 0, confidence: "high", notes: ["Track has already played."] };
  if (findTrackIndexById(input.removed ?? [], trackId) >= 0) return { trackId, found: true, state: "removed", songsAhead: 0, estimatedSeconds: 0, sponsorBreakIncluded: false, wheelCeremonySeconds: 0, confidence: "high", notes: ["Track was removed and is excluded from playable timing."] };

  return { trackId, found: false, state: "missing", songsAhead: 0, estimatedSeconds: 0, sponsorBreakIncluded: false, wheelCeremonySeconds: 0, confidence: "low", notes: ["Track was not found in the provided timing input."] };
}
