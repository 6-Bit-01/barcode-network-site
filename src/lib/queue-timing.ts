import type { PriorityUpgradeStatus, QueueEntry, QueueLane, QueuePlaybackTiming, QueuePublicTrack, QueueTrackStatus, QueueWheelTiming } from "./queue-types";

export const DEFAULT_UNKNOWN_TRACK_SECONDS = 300;
export const DEFAULT_PRE_TRACK_TALK_SECONDS = 30;
export const DEFAULT_POST_TRACK_TALK_SECONDS = 30;
export const DEFAULT_HOST_TALK_BUFFER_SECONDS = DEFAULT_PRE_TRACK_TALK_SECONDS + DEFAULT_POST_TRACK_TALK_SECONDS;
export const DEFAULT_SPONSOR_BREAK_SECONDS = 12 * 60;
export const DEFAULT_WHEEL_CEREMONY_SECONDS = 120;
export const DEFAULT_MAX_HOST_TALK_SECONDS = 120;
export const TARGET_SHOW_SECONDS = 5 * 60 * 60;
export const WARNING_SHOW_SECONDS = 6 * 60 * 60;
export const TYPICAL_SHOW_TRACK_COUNT = 42;
export const PRACTICAL_HIGH_SUBMISSION_COUNT = 50;
export const EXPECTED_DROPOUT_BUFFER = 8;

export type QueueTimingConfidence = "low" | "medium" | "high";
export type QueueTimingTargetStatus = "comfortable" | "tight" | "over_target" | "warning_ceiling" | "unknown";
export type QueueTimingTrackState = "now_playing" | "up_next" | "queued" | "played" | "removed" | "missing";
export type SponsorBreakStatus = "not_due" | "due" | "running" | "completed" | "skipped" | "unknown";
export type SponsorBreakMode = "mid_show";
export type ProjectionScenario = "new_free_submission" | "existing_track" | "priority_submission";
export type ProjectedShowSegmentType = "pre_track_talk" | "track_runtime" | "post_track_talk" | "sponsor_break" | "wheel_ceremony" | "now_playing_remaining" | "uncertainty_buffer";

type QueueTimingTrack = Partial<Pick<QueueEntry, "id" | "status" | "lane" | "detectedDurationSeconds" | "estimatedDurationSeconds" | "durationIsEstimate" | "durationSource" | "removedAt" | "completedAt" | "playedAt" | "playbackOutcome" | "playbackEndPositionSeconds" | "playbackObservedDurationSeconds" | "priorityUpgradeStatus" | "priorityPausedAt" | "priorityQueueOrderAt" | "createdAt" | "isTestTrack">> &
  Partial<Pick<QueuePublicTrack, "id" | "lane" | "durationIsEstimate" | "priorityUpgradeStatus" | "isSimulation">>;

export interface QueueTimingOptions {
  unknownTrackSeconds?: number;
  preTrackTalkSeconds?: number;
  postTrackTalkSeconds?: number;
  hostTalkBufferSeconds?: number;
  sponsorBreakSeconds?: number;
  wheelCeremonySeconds?: number;
  maxHostTalkSeconds?: number;
  targetShowSeconds?: number;
  warningShowSeconds?: number;
  sponsorBreakAlreadyRun?: boolean | null;
  includeHostBufferForNowPlaying?: boolean;
  now?: Date;
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
    acceptedCount?: number | null;
    sponsorBreakSeconds?: number | null;
    sponsorBreakMode?: SponsorBreakMode | null;
    sponsorBreakStatus?: SponsorBreakStatus | null;
    broadcastStartedAt?: string | null;
    sponsorBreakStartedAt?: string | null;
    sponsorBreakCompletedAt?: string | null;
    sponsorBreakCompletedAfterPlayableCount?: number | null;
    sponsorBreakDueAfterPlayableCount?: number | null;
    sponsorBreakManualNote?: string | null;
    showStarted?: boolean | null;
    broadcastPhase?: "warmup" | "submission_window" | "broadcast_active" | "ended" | null;
  } | null;
  completedRuntimeSeconds?: number | null;
  wheelSpinsOwed?: number | null;
  playbackTiming?: QueuePlaybackTiming | null;
  wheelTiming?: QueueWheelTiming | null;
}

interface NormalizedQueueTimingOptions {
  unknownTrackSeconds: number;
  preTrackTalkSeconds: number;
  postTrackTalkSeconds: number;
  hostTalkBufferSeconds: number;
  sponsorBreakSeconds: number;
  wheelCeremonySeconds: number;
  maxHostTalkSeconds: number;
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
  preTrackTalkSeconds: number;
  postTrackTalkSeconds: number;
  hostBufferSeconds: number;
}

export interface WheelCeremonyEstimate {
  wheelCeremonySeconds: number;
  wheelSpinsOwedIncluded: number;
  wheelUncertaintyNotes: string[];
}

export interface SponsorBreakEstimate {
  totalNonRemovedSubmissions: number | null;
  totalPlayableNonRemovedCount: number | null;
  completedPlayableCount: number;
  completedPlayableNonRemovedCount: number;
  sponsorBreakThreshold: number | null;
  sponsorBreakSeconds: number;
  broadcastStartedAt: string | null;
  broadcastElapsedSeconds: number | null;
  midpointReached: boolean | null;
  commercialBreakEligible: boolean;
  commercialBreakPointSeconds: number | null;
  sponsorBreakIncluded: boolean;
  sponsorBreakAlreadyRun: boolean | null;
  sponsorBreakStatus: SponsorBreakStatus;
  sponsorBreakDue: boolean;
  sponsorBreakAlreadyCompleted: boolean;
  sponsorBreakShouldBeIncludedBeforeTargetTrack: boolean;
  sponsorBreakSecondsIncluded: number;
  sponsorBreakSecondsRemaining: number | null;
  sponsorBreakNotes: string[];
}

export interface ProjectedShowSegment {
  type: ProjectedShowSegmentType;
  trackId?: string;
  label?: string;
  seconds: number;
  durationSource?: string;
  isEstimate?: boolean;
  notes?: string[];
}

export interface ProjectedTimeline {
  segments: ProjectedShowSegment[];
  remainingPlayableCount: number;
  completedPlayableCount: number;
  knownDurationCount: number;
  unknownDurationCount: number;
  preTrackTalkSecondsIncluded: number;
  postTrackTalkSecondsIncluded: number;
  hostBufferSecondsIncluded: number;
  sponsorBreak: SponsorBreakEstimate;
  wheelCeremony: WheelCeremonyEstimate;
  confidence: QueueTimingConfidence;
  notes: string[];
}

export interface QueueTimingSnapshot {
  estimatedTotalShowSeconds: number;
  estimatedRemainingPlayableSeconds: number;
  projectedTotalShowSeconds: number;
  projectedRemainingShowSeconds: number;
  broadcastElapsedSeconds: number | null;
  projectedEndAt: string | null;
  targetPaceProjectedTotalShowSeconds: number;
  currentPaceProjectedTotalShowSeconds: number;
  maximumTalkProjectedTotalShowSeconds: number;
  currentPaceTalkSecondsPerTrack: number;
  targetPaceTalkSecondsPerTrack: number;
  maximumTalkSecondsPerTrack: number;
  timeBankSeconds: number;
  hardLimitMarginSeconds: number;
  fixedWorkloadRemainingSeconds: number;
  plannedTalkRemainingSeconds: number;
  talkBudgetToTargetSeconds: number | null;
  talkBudgetToWarningSeconds: number | null;
  talkSecondsPerRemainingTrackToTarget: number | null;
  talkSecondsPerRemainingTrackToWarning: number | null;
  completedRuntimeSeconds: number | null;
  remainingTargetSeconds: number;
  targetStatus: QueueTimingTargetStatus;
  warningStatus: "below_warning_ceiling" | "warning_ceiling" | "unknown";
  confidence: QueueTimingConfidence;
  completedPlayableCount: number;
  removedCount: number | null;
  activePlayableCount: number;
  remainingPlayableCount: number;
  knownDurationCount: number;
  unknownDurationCount: number;
  observedAverageTrackRuntimeSeconds: number | null;
  observedAverageSlotSeconds: number | null;
  sponsorBreak: SponsorBreakEstimate;
  sponsorBreakStatus: SponsorBreakStatus;
  sponsorBreakSecondsIncluded: number;
  wheelCeremony: WheelCeremonyEstimate;
  wheelCeremonySecondsIncluded: number;
  targetShowSeconds: number;
  warningShowSeconds: number;
  timelineSegments: ProjectedShowSegment[];
  notes: string[];
}

export interface ProjectionRangeSeconds {
  min: number;
  max: number;
  label: string;
}

export interface NewSubmissionTimingEstimate {
  scenario: "new_free_submission";
  songsAhead: number;
  estimatedSeconds: number;
  estimatedSecondsUntilPlay: number;
  estimatedRangeSeconds: ProjectionRangeSeconds;
  timelineSegmentsIncluded: ProjectedShowSegment[];
  knownDurationCount: number;
  unknownDurationCount: number;
  preTrackTalkSecondsIncluded: number;
  postTrackTalkSecondsIncluded: number;
  hostBufferSeconds: number;
  hostBufferSecondsIncluded: number;
  wheelCeremonySeconds: number;
  wheelCeremonySecondsIncluded: number;
  sponsorBreakSecondsIncluded: number;
  sponsorBreakIncluded: boolean;
  sponsorBreakThreshold: number | null;
  targetStatus: QueueTimingTargetStatus;
  confidence: QueueTimingConfidence;
  notes: string[];
}

export interface ExistingTrackTimingEstimate {
  scenario: "existing_track";
  trackId: string;
  found: boolean;
  state: QueueTimingTrackState;
  songsAhead: number;
  estimatedSeconds: number;
  estimatedSecondsUntilPlay: number;
  estimatedRangeSeconds: ProjectionRangeSeconds;
  timelineSegmentsIncluded: ProjectedShowSegment[];
  sponsorBreakIncluded: boolean;
  sponsorBreakSecondsIncluded: number;
  wheelCeremonySeconds: number;
  wheelCeremonySecondsIncluded: number;
  targetStatus: QueueTimingTargetStatus;
  confidence: QueueTimingConfidence;
  notes: string[];
}

export type ProjectionEstimate = NewSubmissionTimingEstimate | ExistingTrackTimingEstimate;

export interface PriorityImpactEstimate {
  freeEstimate: ProjectionEstimate;
  priorityEstimate: ProjectionEstimate;
  estimatedSecondsSaved: number | null;
  priorityEligible: boolean;
  ineligibleReason?: string;
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
  const explicitPre = safeNonNegativeSeconds(options?.preTrackTalkSeconds);
  const explicitPost = safeNonNegativeSeconds(options?.postTrackTalkSeconds);
  const compatibilityHost = safeNonNegativeSeconds(options?.hostTalkBufferSeconds);
  const preTrackTalkSeconds = explicitPre ?? (compatibilityHost !== null ? Math.floor(compatibilityHost / 2) : DEFAULT_PRE_TRACK_TALK_SECONDS);
  const postTrackTalkSeconds = explicitPost ?? (compatibilityHost !== null ? compatibilityHost - preTrackTalkSeconds : DEFAULT_POST_TRACK_TALK_SECONDS);
  return {
    unknownTrackSeconds: safePositiveSeconds(options?.unknownTrackSeconds) ?? DEFAULT_UNKNOWN_TRACK_SECONDS,
    preTrackTalkSeconds,
    postTrackTalkSeconds,
    hostTalkBufferSeconds: preTrackTalkSeconds + postTrackTalkSeconds,
    sponsorBreakSeconds: safeNonNegativeSeconds(options?.sponsorBreakSeconds) ?? DEFAULT_SPONSOR_BREAK_SECONDS,
    wheelCeremonySeconds: safeNonNegativeSeconds(options?.wheelCeremonySeconds) ?? DEFAULT_WHEEL_CEREMONY_SECONDS,
    maxHostTalkSeconds: safeNonNegativeSeconds(options?.maxHostTalkSeconds) ?? DEFAULT_MAX_HOST_TALK_SECONDS,
    targetShowSeconds: safePositiveSeconds(options?.targetShowSeconds) ?? TARGET_SHOW_SECONDS,
    warningShowSeconds: safePositiveSeconds(options?.warningShowSeconds) ?? WARNING_SHOW_SECONDS,
    sponsorBreakAlreadyRun: typeof options?.sponsorBreakAlreadyRun === "boolean" ? options.sponsorBreakAlreadyRun : null,
    includeHostBufferForNowPlaying: options?.includeHostBufferForNowPlaying === true,
  };
}

function optionsAtTalkPace(options: NormalizedQueueTimingOptions, talkSecondsPerTrack: number): NormalizedQueueTimingOptions {
  const safeTalk = Math.max(0, Math.round(talkSecondsPerTrack));
  const preTrackTalkSeconds = Math.floor(safeTalk / 2);
  const postTrackTalkSeconds = safeTalk - preTrackTalkSeconds;
  return { ...options, preTrackTalkSeconds, postTrackTalkSeconds, hostTalkBufferSeconds: safeTalk };
}

function isRemovedTrack(track: QueueTimingTrack | null | undefined): boolean {
  return track?.status === "removed" || Boolean(track?.removedAt);
}

function isCompletedTrack(track: QueueTimingTrack | null | undefined): boolean {
  if (track?.status === "playing" || track?.status === "next" || track?.status === "queued") return false;
  return track?.status === "played" || track?.status === "completed" || Boolean(track?.completedAt);
}

function isSimulationTimingTrack(track: QueueTimingTrack | null | undefined): boolean {
  return track?.isTestTrack === true || track?.isSimulation === true;
}

function resolvedUpNext(input: QueueTimingInput): QueueTimingTrack | null {
  return input.upNext ?? input.nextInLine ?? null;
}

function activeTracksInResolvedOrder(input: QueueTimingInput): QueueTimingTrack[] {
  return [input.nowPlaying, resolvedUpNext(input), ...(input.queue ?? [])].filter((track): track is QueueTimingTrack => Boolean(track && !isRemovedTrack(track) && !isCompletedTrack(track) && !isSimulationTimingTrack(track)));
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

function knownRuntime(track: QueueTimingTrack | null | undefined): number | null {
  return safePositiveSeconds(track?.detectedDurationSeconds) ?? safePositiveSeconds(track?.estimatedDurationSeconds);
}

function hasKnownDetectedDuration(track: QueueTimingTrack | null | undefined): boolean {
  return safePositiveSeconds(track?.detectedDurationSeconds) !== null && track?.durationIsEstimate !== true;
}

export function getEstimatedTrackRuntimeSeconds(track?: QueueTimingTrack | null, options?: QueueTimingOptions): number {
  const normalized = normalizeOptions(options);
  return knownRuntime(track) ?? normalized.unknownTrackSeconds;
}

export function getEstimatedTrackSlotSeconds(track?: QueueTimingTrack | null, options?: QueueTimingOptions): number {
  const normalized = normalizeOptions(options);
  return getEstimatedTrackRuntimeSeconds(track, normalized) + normalized.preTrackTalkSeconds + normalized.postTrackTalkSeconds;
}

export function estimateRuntimeForTracks(tracks: readonly (QueueTimingTrack | null | undefined)[], options?: QueueTimingOptions): QueueRuntimeEstimate {
  const normalized = normalizeOptions(options);
  return tracks.reduce<QueueRuntimeEstimate>((estimate, track) => {
    if (!track || isRemovedTrack(track)) return estimate;
    const runtimeSeconds = knownRuntime(track);
    const isKnownDuration = hasKnownDetectedDuration(track);
    const trackSeconds = runtimeSeconds ?? normalized.unknownTrackSeconds;
    return {
      trackSeconds: estimate.trackSeconds + trackSeconds,
      slotSeconds: estimate.slotSeconds + trackSeconds + normalized.preTrackTalkSeconds + normalized.postTrackTalkSeconds,
      knownDurationCount: estimate.knownDurationCount + (isKnownDuration ? 1 : 0),
      unknownDurationCount: estimate.unknownDurationCount + (isKnownDuration ? 0 : 1),
      preTrackTalkSeconds: estimate.preTrackTalkSeconds + normalized.preTrackTalkSeconds,
      postTrackTalkSeconds: estimate.postTrackTalkSeconds + normalized.postTrackTalkSeconds,
      hostBufferSeconds: estimate.hostBufferSeconds + normalized.preTrackTalkSeconds + normalized.postTrackTalkSeconds,
    };
  }, { trackSeconds: 0, slotSeconds: 0, knownDurationCount: 0, unknownDurationCount: 0, preTrackTalkSeconds: 0, postTrackTalkSeconds: 0, hostBufferSeconds: 0 });
}

function segmentsForTrack(track: QueueTimingTrack, options: NormalizedQueueTimingOptions, nowPlaying = false, playbackTiming?: QueuePlaybackTiming | null, now = new Date()): ProjectedShowSegment[] {
  const trackId = track.id;
  const matchingPlayback = nowPlaying && playbackTiming?.trackId === trackId ? playbackTiming : null;
  const runtime = safePositiveSeconds(matchingPlayback?.durationSeconds) ?? getEstimatedTrackRuntimeSeconds(track, options);
  const source = matchingPlayback?.source ?? track.durationSource ?? (hasKnownDetectedDuration(track) ? "stored_duration" : "estimated");
  const isEstimate = !matchingPlayback?.durationSeconds && !hasKnownDetectedDuration(track);
  if (nowPlaying && !options.includeHostBufferForNowPlaying) {
    const observedCurrent = safeNonNegativeSeconds(matchingPlayback?.currentTimeSeconds) ?? 0;
    const projectedSinceObservation = matchingPlayback?.playbackState === "playing" ? secondsSince(matchingPlayback.observedAt, now) ?? 0 : 0;
    const currentTime = Math.min(runtime, observedCurrent + projectedSinceObservation);
    const segments: ProjectedShowSegment[] = [];
    if ((!matchingPlayback || matchingPlayback.playbackState === "stopped") && currentTime === 0 && options.preTrackTalkSeconds > 0) {
      segments.push({ type: "pre_track_talk", trackId, label: "Host setup before playback", seconds: options.preTrackTalkSeconds });
    }
    segments.push({ type: "now_playing_remaining", trackId, label: "Current track runtime still in workload", seconds: Math.max(0, runtime - currentTime), durationSource: source, isEstimate });
    if (options.postTrackTalkSeconds > 0) segments.push({ type: "post_track_talk", trackId, label: "Host reaction / transition", seconds: options.postTrackTalkSeconds });
    return segments;
  }
  return [
    { type: "pre_track_talk", trackId, label: "Host intro / setup", seconds: options.preTrackTalkSeconds },
    { type: "track_runtime", trackId, label: "Track runtime", seconds: runtime, durationSource: source, isEstimate },
    { type: "post_track_talk", trackId, label: "Host reaction / transition", seconds: options.postTrackTalkSeconds },
  ];
}

export function estimateWheelCeremonySeconds(wheelSpinsOwed?: number | null, options?: QueueTimingOptions, wheelTiming?: QueueWheelTiming | null): WheelCeremonyEstimate {
  const normalized = normalizeOptions(options);
  const wheelSpinsOwedIncluded = safeNonNegativeInteger(wheelSpinsOwed);
  const timingMatches = wheelTiming?.spinsOwed === wheelSpinsOwedIncluded;
  const ceremonyActive = wheelTiming?.status === "ready" || wheelTiming?.status === "reencrypting" || wheelTiming?.status === "spinning" || wheelTiming?.status === "result_pending";
  const elapsedSinceObservation = timingMatches && ceremonyActive ? secondsSince(wheelTiming?.observedAt ?? null, options?.now) ?? 0 : 0;
  const observedRemaining = timingMatches && ceremonyActive ? safeNonNegativeSeconds(wheelTiming?.remainingSeconds) : null;
  const wheelCeremonySeconds = observedRemaining === null
    ? wheelSpinsOwedIncluded * normalized.wheelCeremonySeconds
    : Math.max(0, observedRemaining - elapsedSinceObservation);
  return {
    wheelCeremonySeconds,
    wheelSpinsOwedIncluded,
    wheelUncertaintyNotes: wheelSpinsOwedIncluded > 0 ? ["Wheel spins owed add ceremony overhead but do not add extra song durations until a track is chosen.", "Wheel rerolls, missing artists, or host recovery can shift timing."] : [],
  };
}

function countCompletedPlayable(input: QueueTimingInput): number {
  const completed = uniqueTracks(input.completed ?? []).filter((track) => isCompletedTrack(track) && !isRemovedTrack(track) && !isSimulationTimingTrack(track)).length;
  return Math.max(completed, safeNonNegativeInteger(input.session?.completedCount));
}

function countRemoved(input: QueueTimingInput): number | null {
  if (input.removed) return uniqueTracks(input.removed).length;
  const removedCount = input.session?.removedCount;
  return typeof removedCount === "number" && Number.isFinite(removedCount) ? Math.max(0, Math.floor(removedCount)) : null;
}

function countTotalNonRemoved(input: QueueTimingInput): number | null {
  const completed = uniqueTracks(input.completed ?? []).filter((track) => !isRemovedTrack(track) && !isSimulationTimingTrack(track));
  const active = activeTracksInResolvedOrder(input);
  const totalFromTracks = uniqueTracks([...completed, ...active]).length;
  const sessionCompleted = safeNonNegativeInteger(input.session?.completedCount);
  const sessionActive = safeNonNegativeInteger(input.session?.activeCount);
  const sessionAccepted = safeNonNegativeInteger(input.session?.acceptedCount);
  const hasSessionAccepted = typeof input.session?.acceptedCount === "number" && Number.isFinite(input.session.acceptedCount);
  const totalFromSession = hasSessionAccepted ? sessionAccepted : sessionCompleted + sessionActive;
  const total = Math.max(totalFromTracks, totalFromSession);
  return total > 0 ? total : null;
}

function countResolvedWheelSpins(input: QueueTimingInput): number {
  const completed = uniqueTracks(input.completed ?? []).filter((track) => !isRemovedTrack(track) && !isSimulationTimingTrack(track));
  const active = activeTracksInResolvedOrder(input);
  return uniqueTracks([...completed, ...active]).filter((track) => track.lane === "wheel").length;
}


function validIsoString(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? value : null;
}

function secondsRemainingFrom(startedAt: string | null | undefined, totalSeconds: number, now = new Date()): number | null {
  const started = validIsoString(startedAt);
  if (!started) return null;
  const elapsed = secondsSince(started, now);
  if (elapsed === null) return null;
  return Math.max(0, totalSeconds - elapsed);
}

function deriveBroadcastStartedAt(input: QueueTimingInput): string | null {
  const explicit = validIsoString(input.session?.broadcastStartedAt);
  if (explicit) return explicit;
  const candidates = [
    validIsoString(input.nowPlaying?.playedAt),
    ...(input.completed ?? []).map((track) => validIsoString(track?.playedAt) ?? validIsoString(track?.completedAt)),
  ].filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

function secondsSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const started = Date.parse(iso);
  const current = now.getTime();
  if (!Number.isFinite(started) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.floor((current - started) / 1000));
}

function completedObservedMusicSeconds(input: QueueTimingInput, options: NormalizedQueueTimingOptions): number {
  return uniqueTracks(input.completed ?? [])
    .filter((track) => isCompletedTrack(track) && !isRemovedTrack(track) && !isSimulationTimingTrack(track))
    .reduce((total, track) => {
      const observedEnd = safeNonNegativeSeconds(track.playbackEndPositionSeconds);
      const observedDuration = safePositiveSeconds(track.playbackObservedDurationSeconds);
      const estimated = getEstimatedTrackRuntimeSeconds(track, options);
      if (observedEnd !== null && (track.playbackOutcome === "skipped" || observedEnd < (observedDuration ?? estimated))) {
        return total + Math.min(observedEnd, observedDuration ?? estimated);
      }
      return total + estimated;
    }, 0);
}

function currentObservedMusicSeconds(input: QueueTimingInput, options: NormalizedQueueTimingOptions, now: Date): number {
  const nowPlaying = input.nowPlaying;
  if (!nowPlaying) return 0;
  const playbackTiming = input.playbackTiming;
  const runtime = safePositiveSeconds(playbackTiming?.durationSeconds) ?? getEstimatedTrackRuntimeSeconds(nowPlaying, options);
  if (playbackTiming && playbackTiming.trackId === nowPlaying.id) {
    const observed = safeNonNegativeSeconds(playbackTiming.currentTimeSeconds) ?? 0;
    const projected = playbackTiming.playbackState === "playing" ? secondsSince(playbackTiming.observedAt, now) ?? 0 : 0;
    return Math.min(runtime, observed + projected);
  }
  return Math.min(runtime, secondsSince(validIsoString(nowPlaying.playedAt), now) ?? 0);
}

function sponsorElapsedSeconds(input: QueueTimingInput, now: Date): number {
  const status = input.session?.sponsorBreakStatus;
  if (status !== "running" && status !== "completed" && status !== "skipped") return 0;
  const startedAt = validIsoString(input.session?.sponsorBreakStartedAt);
  const completedAt = validIsoString(input.session?.sponsorBreakCompletedAt);
  if (startedAt && completedAt) return Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000));
  if (startedAt && status === "running") return secondsSince(startedAt, now) ?? 0;
  return 0;
}

function observedHostPaceSeconds(input: QueueTimingInput, options: NormalizedQueueTimingOptions, now: Date): number {
  const liveElapsed = secondsSince(deriveBroadcastStartedAt(input), now);
  if (liveElapsed === null) return options.hostTalkBufferSeconds;
  const completedCount = countCompletedPlayable(input);
  const paceUnits = completedCount + (input.nowPlaying ? 1 : 0);
  if (paceUnits <= 0) return options.hostTalkBufferSeconds;
  const observedMusic = completedObservedMusicSeconds(input, options) + currentObservedMusicSeconds(input, options, now);
  const knownWheelTime = countResolvedWheelSpins(input) * options.wheelCeremonySeconds;
  const observedOverhead = Math.max(0, liveElapsed - observedMusic - sponsorElapsedSeconds(input, now) - knownWheelTime);
  return Math.min(10 * 60, Math.round(observedOverhead / paceUnits));
}

function explicitSponsorStatus(input: QueueTimingInput, normalized: NormalizedQueueTimingOptions): SponsorBreakStatus | null {
  const status = input.session?.sponsorBreakStatus;
  if (status === "completed" || status === "skipped" || status === "running" || status === "due" || status === "not_due") return status;
  if (normalized.sponsorBreakAlreadyRun === true) return "completed";
  return null;
}

export function estimateSponsorBreakPlacement(input: QueueTimingInput, options?: QueueTimingOptions & { targetSongsAhead?: number | null; targetProjectedSecondsAhead?: number | null; now?: Date }): SponsorBreakEstimate {
  const normalized = normalizeOptions(options);
  const actualSponsorBreakSeconds = safeNonNegativeSeconds(input.session?.sponsorBreakSeconds) ?? normalized.sponsorBreakSeconds;
  const completedPlayableCount = countCompletedPlayable(input);
  const totalNonRemovedSubmissions = countTotalNonRemoved(input);
  const latchedThreshold = safeNonNegativeInteger(input.session?.sponsorBreakDueAfterPlayableCount);
  const sponsorBreakThreshold = latchedThreshold > 0 ? latchedThreshold : totalNonRemovedSubmissions ? Math.ceil(totalNonRemovedSubmissions / 2) : null;
  const targetSongsAhead = safeNonNegativeInteger(options?.targetSongsAhead);
  const targetProjectedSecondsAhead = safeNonNegativeSeconds(options?.targetProjectedSecondsAhead) ?? 0;
  const targetStartCompletedCount = completedPlayableCount + targetSongsAhead;
  const sponsorBreakNotes: string[] = [];
  const explicitStatus = explicitSponsorStatus(input, normalized);
  const broadcastStartedAt = deriveBroadcastStartedAt(input);
  const broadcastElapsedSeconds = secondsSince(broadcastStartedAt, options?.now);
  const midpointReached = sponsorBreakThreshold === null ? null : completedPlayableCount >= sponsorBreakThreshold;
  const targetCrossesMidpoint = sponsorBreakThreshold !== null && targetStartCompletedCount >= sponsorBreakThreshold;
  const commercialBreakPointSeconds = targetCrossesMidpoint ? targetProjectedSecondsAhead : null;
  const commercialBreakEligible = midpointReached === true;

  if (!explicitStatus) sponsorBreakNotes.push("Sponsor break status is derived from counted real submissions and the completed-song midpoint.");
  if (input.session?.sponsorBreakManualNote) sponsorBreakNotes.push(input.session.sponsorBreakManualNote);
  if (totalNonRemovedSubmissions === null) sponsorBreakNotes.push("Non-removed submission total is unavailable, so sponsor midpoint placement is unknown.");

  let sponsorBreakStatus: SponsorBreakStatus = explicitStatus ?? "unknown";
  let sponsorBreakIncluded = false;
  const runningRemainingSeconds = explicitStatus === "running" ? secondsRemainingFrom(input.session?.sponsorBreakStartedAt, actualSponsorBreakSeconds, options?.now) : null;
  const runningPlanningReserveSeconds = explicitStatus === "running" ? secondsRemainingFrom(input.session?.sponsorBreakStartedAt, normalized.sponsorBreakSeconds, options?.now) : null;
  if (explicitStatus === "completed" || explicitStatus === "skipped") {
    sponsorBreakIncluded = false;
  } else if (explicitStatus === "running") {
    sponsorBreakIncluded = true;
    sponsorBreakNotes.push("Sponsor break is marked running; remaining break duration is included.");
  } else if (midpointReached === true || explicitStatus === "due") {
    sponsorBreakStatus = "due";
    sponsorBreakIncluded = true;
  } else if (targetCrossesMidpoint) {
    sponsorBreakStatus = "not_due";
    sponsorBreakIncluded = true;
  } else if (sponsorBreakThreshold === null) {
    sponsorBreakStatus = "unknown";
  } else {
    sponsorBreakStatus = "not_due";
  }

  const sponsorBreakAlreadyCompleted = sponsorBreakStatus === "completed" || sponsorBreakStatus === "skipped";
  const sponsorBreakSecondsIncluded = sponsorBreakIncluded && !sponsorBreakAlreadyCompleted
    ? (explicitStatus === "running" ? (runningPlanningReserveSeconds ?? normalized.sponsorBreakSeconds) : normalized.sponsorBreakSeconds)
    : 0;
  if (sponsorBreakStatus === "due") sponsorBreakNotes.push("The counted-submission midpoint has been reached; include the sponsor break until it completes.");
  if (sponsorBreakStatus === "not_due" && targetCrossesMidpoint) sponsorBreakNotes.push("The projected target crosses the counted-submission midpoint, so the full sponsor break is reserved before it.");
  if (sponsorBreakAlreadyCompleted && input.session?.sponsorBreakCompletedAt) sponsorBreakNotes.push(`Sponsor break completion recorded at ${input.session.sponsorBreakCompletedAt}.`);

  return {
    totalNonRemovedSubmissions,
    totalPlayableNonRemovedCount: totalNonRemovedSubmissions,
    completedPlayableCount,
    completedPlayableNonRemovedCount: completedPlayableCount,
    sponsorBreakThreshold,
    sponsorBreakSeconds: actualSponsorBreakSeconds,
    broadcastStartedAt,
    broadcastElapsedSeconds,
    midpointReached,
    commercialBreakEligible,
    commercialBreakPointSeconds,
    sponsorBreakIncluded,
    sponsorBreakAlreadyRun: sponsorBreakAlreadyCompleted ? true : normalized.sponsorBreakAlreadyRun,
    sponsorBreakStatus,
    sponsorBreakDue: sponsorBreakStatus === "due" || sponsorBreakStatus === "running",
    sponsorBreakAlreadyCompleted,
    sponsorBreakShouldBeIncludedBeforeTargetTrack: sponsorBreakIncluded,
    sponsorBreakSecondsIncluded,
    sponsorBreakSecondsRemaining: explicitStatus === "running" ? runningRemainingSeconds : null,
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

function confidenceFor(knownDurationCount: number, unknownDurationCount: number, completedPlayableCount: number, sponsorBreak: SponsorBreakEstimate, orderIsExact = false): QueueTimingConfidence {
  if (unknownDurationCount === 0 && knownDurationCount > 0 && completedPlayableCount >= 8 && sponsorBreak.sponsorBreakStatus !== "unknown" && orderIsExact) return "high";
  if (knownDurationCount >= unknownDurationCount && knownDurationCount > 0) return "medium";
  return "low";
}

function sumSegments(segments: readonly ProjectedShowSegment[]): number {
  return segments.reduce((total, segment) => total + segment.seconds, 0);
}

function segmentStats(segments: readonly ProjectedShowSegment[]) {
  return {
    preTrackTalkSecondsIncluded: segments.filter((segment) => segment.type === "pre_track_talk").reduce((total, segment) => total + segment.seconds, 0),
    postTrackTalkSecondsIncluded: segments.filter((segment) => segment.type === "post_track_talk").reduce((total, segment) => total + segment.seconds, 0),
    sponsorBreakSecondsIncluded: segments.filter((segment) => segment.type === "sponsor_break").reduce((total, segment) => total + segment.seconds, 0),
    wheelCeremonySecondsIncluded: segments.filter((segment) => segment.type === "wheel_ceremony").reduce((total, segment) => total + segment.seconds, 0),
  };
}

export function buildProjectedShowTimeline(input: QueueTimingInput, options?: QueueTimingOptions & { targetSongsAhead?: number | null; targetProjectedSecondsAhead?: number | null; includeWheelCeremony?: boolean; now?: Date }): ProjectedTimeline {
  const normalized = normalizeOptions(options);
  const tracks = activeTracksInResolvedOrder(input);
  const segments: ProjectedShowSegment[] = [];
  const completedPlayableCount = countCompletedPlayable(input);
  const wheelCeremony = estimateWheelCeremonySeconds(input.wheelSpinsOwed ?? input.session?.wheelSpinsOwed, { ...normalized, now: options?.now }, input.wheelTiming);
  let sponsorInserted = false;
  let projectedSecondsAhead = 0;
  let sponsorBreak = estimateSponsorBreakPlacement(input, { ...normalized, targetSongsAhead: options?.targetSongsAhead ?? tracks.length, targetProjectedSecondsAhead: options?.targetProjectedSecondsAhead ?? 0, now: options?.now });

  tracks.forEach((track, index) => {
    const sponsorAtThisPoint = estimateSponsorBreakPlacement(input, { ...normalized, targetSongsAhead: index, targetProjectedSecondsAhead: projectedSecondsAhead, now: options?.now });
    if (!sponsorInserted && sponsorAtThisPoint.sponsorBreakIncluded) {
      segments.push({ type: "sponsor_break", label: "Mid-show sponsor break", seconds: sponsorAtThisPoint.sponsorBreakSecondsIncluded, isEstimate: sponsorAtThisPoint.sponsorBreakStatus === "running", notes: sponsorAtThisPoint.sponsorBreakNotes });
      projectedSecondsAhead += sponsorAtThisPoint.sponsorBreakSecondsIncluded;
      sponsorInserted = true;
      sponsorBreak = sponsorAtThisPoint;
    }
    const trackSegments = segmentsForTrack(track, normalized, index === 0 && input.nowPlaying?.id === track.id, input.playbackTiming, options?.now);
    segments.push(...trackSegments);
    projectedSecondsAhead += sumSegments(trackSegments);
  });

  if (!sponsorInserted) {
    const finalTargetSongsAhead = options?.targetSongsAhead ?? tracks.length;
    const finalTargetSecondsAhead = options?.targetProjectedSecondsAhead ?? projectedSecondsAhead;
    sponsorBreak = estimateSponsorBreakPlacement(input, { ...normalized, targetSongsAhead: finalTargetSongsAhead, targetProjectedSecondsAhead: finalTargetSecondsAhead, now: options?.now });
    if (sponsorBreak.sponsorBreakIncluded) {
      segments.push({ type: "sponsor_break", label: "Mid-show sponsor break", seconds: sponsorBreak.sponsorBreakSecondsIncluded, isEstimate: sponsorBreak.sponsorBreakStatus === "running", notes: sponsorBreak.sponsorBreakNotes });
      sponsorInserted = true;
    }
  }

  if (options?.includeWheelCeremony !== false && wheelCeremony.wheelCeremonySeconds > 0) {
    segments.push({ type: "wheel_ceremony", label: "Wheel spin ceremony overhead", seconds: wheelCeremony.wheelCeremonySeconds, isEstimate: true, notes: wheelCeremony.wheelUncertaintyNotes });
  }

  const runtime = estimateRuntimeForTracks(tracks, normalized);
  const notes = [...sponsorBreak.sponsorBreakNotes, ...wheelCeremony.wheelUncertaintyNotes, "Projection uses already-visible/resolved order and does not call provider, payment, or resolver services."];
  if (runtime.unknownDurationCount > 0) notes.push("Unknown or unavailable track durations use the stored/standard 5-minute fallback before host buffers.");

  return {
    segments,
    remainingPlayableCount: tracks.length,
    completedPlayableCount,
    knownDurationCount: runtime.knownDurationCount,
    unknownDurationCount: runtime.unknownDurationCount,
    preTrackTalkSecondsIncluded: runtime.preTrackTalkSeconds,
    postTrackTalkSecondsIncluded: runtime.postTrackTalkSeconds,
    hostBufferSecondsIncluded: runtime.hostBufferSeconds,
    sponsorBreak,
    wheelCeremony,
    confidence: confidenceFor(runtime.knownDurationCount, runtime.unknownDurationCount, completedPlayableCount, sponsorBreak),
    notes,
  };
}

export function buildQueueTimingSnapshot(input: QueueTimingInput, options?: QueueTimingOptions): QueueTimingSnapshot {
  const normalized = normalizeOptions(options);
  const now = options?.now ?? new Date();
  const targetPaceTalkSecondsPerTrack = normalized.hostTalkBufferSeconds;
  const currentPaceTalkSecondsPerTrack = observedHostPaceSeconds(input, normalized, now);
  const targetPaceTimeline = buildProjectedShowTimeline(input, { ...normalized, now });
  const currentPaceTimeline = buildProjectedShowTimeline(input, { ...optionsAtTalkPace(normalized, currentPaceTalkSecondsPerTrack), now });
  const maximumTalkTimeline = buildProjectedShowTimeline(input, { ...optionsAtTalkPace(normalized, normalized.maxHostTalkSeconds), now });
  const activeRuntime = estimateRuntimeForTracks(activeTracksInResolvedOrder(input), normalized);
  const completedRuntimeSeconds = safePositiveSeconds(input.completedRuntimeSeconds) ?? safePositiveSeconds(input.session?.completedRuntimeSeconds) ?? null;
  const completedTracks = (input.completed ?? []).filter((track) => !isSimulationTimingTrack(track));
  const completedEstimatedRuntime = completedRuntimeSeconds ?? estimateRuntimeForTracks(completedTracks, normalized).slotSeconds;
  const targetPaceProjectedRemainingShowSeconds = sumSegments(targetPaceTimeline.segments);
  const projectedRemainingShowSeconds = sumSegments(currentPaceTimeline.segments);
  const maximumTalkProjectedRemainingShowSeconds = sumSegments(maximumTalkTimeline.segments);
  const liveElapsedSeconds = targetPaceTimeline.sponsorBreak.broadcastElapsedSeconds;
  const elapsedForProjection = liveElapsedSeconds ?? completedEstimatedRuntime;
  const targetPaceProjectedTotalShowSeconds = elapsedForProjection + targetPaceProjectedRemainingShowSeconds;
  const currentPaceProjectedTotalShowSeconds = elapsedForProjection + projectedRemainingShowSeconds;
  const maximumTalkProjectedTotalShowSeconds = elapsedForProjection + maximumTalkProjectedRemainingShowSeconds;
  const fixedWorkloadRemainingSeconds = targetPaceTimeline.segments
    .filter((segment) => segment.type === "track_runtime" || segment.type === "now_playing_remaining" || segment.type === "sponsor_break" || segment.type === "wheel_ceremony")
    .reduce((total, segment) => total + segment.seconds, 0);
  const plannedTalkRemainingSeconds = targetPaceTimeline.segments
    .filter((segment) => segment.type === "pre_track_talk" || segment.type === "post_track_talk")
    .reduce((total, segment) => total + segment.seconds, 0);
  const elapsedForBudget = elapsedForProjection;
  const talkBudgetToTargetSeconds = normalized.targetShowSeconds - elapsedForBudget - fixedWorkloadRemainingSeconds;
  const talkBudgetToWarningSeconds = normalized.warningShowSeconds - elapsedForBudget - fixedWorkloadRemainingSeconds;
  const remainingTrackDivisor = Math.max(1, targetPaceTimeline.remainingPlayableCount);
  const projectedEndAt = typeof liveElapsedSeconds === "number" ? new Date(now.getTime() + projectedRemainingShowSeconds * 1000).toISOString() : null;
  const completedPlayableCount = countCompletedPlayable(input);
  const observedAverageSlotSeconds = completedRuntimeSeconds && completedPlayableCount > 0 ? Math.round(completedRuntimeSeconds / completedPlayableCount) : null;
  const completedTrackRuntime = estimateRuntimeForTracks(completedTracks, { ...normalized, preTrackTalkSeconds: 0, postTrackTalkSeconds: 0 }).trackSeconds;
  const observedAverageTrackRuntimeSeconds = completedTrackRuntime > 0 && completedPlayableCount > 0 ? Math.round(completedTrackRuntime / completedPlayableCount) : null;
  const notes = [...targetPaceTimeline.notes];
  if (completedRuntimeSeconds === null) notes.push("Completed runtime seconds were not provided, so completed tracks use estimate rules unless live elapsed playback time is available.");
  if (countRemoved(input) === null) notes.push("Removed track detail/count was not provided; removed/dropout diagnostics may be incomplete.");

  return {
    estimatedTotalShowSeconds: currentPaceProjectedTotalShowSeconds,
    estimatedRemainingPlayableSeconds: projectedRemainingShowSeconds,
    projectedTotalShowSeconds: currentPaceProjectedTotalShowSeconds,
    projectedRemainingShowSeconds,
    broadcastElapsedSeconds: liveElapsedSeconds,
    projectedEndAt,
    targetPaceProjectedTotalShowSeconds,
    currentPaceProjectedTotalShowSeconds,
    maximumTalkProjectedTotalShowSeconds,
    currentPaceTalkSecondsPerTrack,
    targetPaceTalkSecondsPerTrack,
    maximumTalkSecondsPerTrack: normalized.maxHostTalkSeconds,
    timeBankSeconds: normalized.targetShowSeconds - currentPaceProjectedTotalShowSeconds,
    hardLimitMarginSeconds: normalized.warningShowSeconds - maximumTalkProjectedTotalShowSeconds,
    fixedWorkloadRemainingSeconds,
    plannedTalkRemainingSeconds,
    talkBudgetToTargetSeconds,
    talkBudgetToWarningSeconds,
    talkSecondsPerRemainingTrackToTarget: targetPaceTimeline.remainingPlayableCount > 0 ? talkBudgetToTargetSeconds / remainingTrackDivisor : null,
    talkSecondsPerRemainingTrackToWarning: targetPaceTimeline.remainingPlayableCount > 0 ? talkBudgetToWarningSeconds / remainingTrackDivisor : null,
    completedRuntimeSeconds,
    remainingTargetSeconds: normalized.targetShowSeconds - currentPaceProjectedTotalShowSeconds,
    targetStatus: targetStatusFor(currentPaceProjectedTotalShowSeconds, normalized),
    warningStatus: currentPaceProjectedTotalShowSeconds >= normalized.warningShowSeconds ? "warning_ceiling" : "below_warning_ceiling",
    confidence: targetPaceTimeline.confidence,
    completedPlayableCount,
    removedCount: countRemoved(input),
    activePlayableCount: activeTracksInResolvedOrder(input).length,
    remainingPlayableCount: activeTracksInResolvedOrder(input).length,
    knownDurationCount: activeRuntime.knownDurationCount,
    unknownDurationCount: activeRuntime.unknownDurationCount,
    observedAverageTrackRuntimeSeconds,
    observedAverageSlotSeconds,
    sponsorBreak: targetPaceTimeline.sponsorBreak,
    sponsorBreakStatus: targetPaceTimeline.sponsorBreak.sponsorBreakStatus,
    sponsorBreakSecondsIncluded: targetPaceTimeline.sponsorBreak.sponsorBreakSecondsIncluded,
    wheelCeremony: targetPaceTimeline.wheelCeremony,
    wheelCeremonySecondsIncluded: targetPaceTimeline.wheelCeremony.wheelCeremonySeconds,
    targetShowSeconds: normalized.targetShowSeconds,
    warningShowSeconds: normalized.warningShowSeconds,
    timelineSegments: currentPaceTimeline.segments,
    notes,
  };
}

export function buildProjectionRangeSeconds(seconds: number, confidence: QueueTimingConfidence = "medium", hasUncertainty = false): ProjectionRangeSeconds {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded === 0) return { min: 0, max: 0, label: "Now" };
  const minutes = Math.ceil(rounded / 60);
  let minMinutes: number;
  let maxMinutes: number;
  if (minutes <= 5) [minMinutes, maxMinutes] = [0, 5];
  else if (minutes <= 15) [minMinutes, maxMinutes] = [5, 15];
  else if (minutes <= 30) [minMinutes, maxMinutes] = [20, 30];
  else if (minutes <= 60) [minMinutes, maxMinutes] = [35, 60];
  else {
    minMinutes = Math.max(60, Math.floor(minutes / 30) * 30);
    maxMinutes = minMinutes + 30;
  }
  if ((confidence === "low" || hasUncertainty) && minutes > 15) {
    const uncertaintyMinutes = minutes >= 60 ? 30 : 10;
    minMinutes = Math.max(0, minMinutes - uncertaintyMinutes);
    maxMinutes += uncertaintyMinutes;
  }
  const label = maxMinutes <= 60
    ? (minMinutes === 0 ? `About ${maxMinutes} min` : `About ${minMinutes}–${maxMinutes} min`)
    : `About ${formatHours(minMinutes)}–${formatHours(maxMinutes)}`;
  return { min: minMinutes * 60, max: maxMinutes * 60, label };
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)} hr`;
}

export function estimateNewSubmissionTiming(input: QueueTimingInput, options?: QueueTimingOptions): NewSubmissionTimingEstimate {
  const normalized = normalizeOptions(options);
  const snapshot = buildQueueTimingSnapshot(input, { ...normalized, now: options?.now });
  const currentPaceOptions = optionsAtTalkPace(normalized, snapshot.currentPaceTalkSecondsPerTrack);
  const tracksAhead = activeTracksInResolvedOrder(input);
  const timeline = buildProjectedShowTimeline(input, { ...currentPaceOptions, targetSongsAhead: tracksAhead.length, now: options?.now });
  const stats = segmentStats(timeline.segments);
  const seconds = sumSegments(timeline.segments);
  const hasUncertainty = stats.sponsorBreakSecondsIncluded > 0 || stats.wheelCeremonySecondsIncluded > 0 || timeline.unknownDurationCount > 0;
  const notes = [...timeline.notes, "New submission timing uses the current resolved visible order only and does not replace queue resolver decisions."];

  return {
    scenario: "new_free_submission",
    songsAhead: tracksAhead.length,
    estimatedSeconds: seconds,
    estimatedSecondsUntilPlay: seconds,
    estimatedRangeSeconds: buildProjectionRangeSeconds(seconds, timeline.confidence, hasUncertainty),
    timelineSegmentsIncluded: timeline.segments,
    knownDurationCount: timeline.knownDurationCount,
    unknownDurationCount: timeline.unknownDurationCount,
    preTrackTalkSecondsIncluded: stats.preTrackTalkSecondsIncluded,
    postTrackTalkSecondsIncluded: stats.postTrackTalkSecondsIncluded,
    hostBufferSeconds: stats.preTrackTalkSecondsIncluded + stats.postTrackTalkSecondsIncluded,
    hostBufferSecondsIncluded: stats.preTrackTalkSecondsIncluded + stats.postTrackTalkSecondsIncluded,
    wheelCeremonySeconds: stats.wheelCeremonySecondsIncluded,
    wheelCeremonySecondsIncluded: stats.wheelCeremonySecondsIncluded,
    sponsorBreakSecondsIncluded: stats.sponsorBreakSecondsIncluded,
    sponsorBreakIncluded: stats.sponsorBreakSecondsIncluded > 0,
    sponsorBreakThreshold: timeline.sponsorBreak.sponsorBreakThreshold,
    targetStatus: snapshot.targetStatus,
    confidence: timeline.confidence,
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

function emptyExistingEstimate(input: QueueTimingInput, trackId: string, state: QueueTimingTrackState, found: boolean, note: string, options?: QueueTimingOptions): ExistingTrackTimingEstimate {
  const snapshot = buildQueueTimingSnapshot(input, options);
  return { scenario: "existing_track", trackId, found, state, songsAhead: 0, estimatedSeconds: 0, estimatedSecondsUntilPlay: 0, estimatedRangeSeconds: buildProjectionRangeSeconds(0, found ? "high" : "low"), timelineSegmentsIncluded: [], sponsorBreakIncluded: false, sponsorBreakSecondsIncluded: 0, wheelCeremonySeconds: 0, wheelCeremonySecondsIncluded: 0, targetStatus: snapshot.targetStatus, confidence: found ? "high" : "low", notes: [note] };
}

export function estimateExistingTrackTiming(input: QueueTimingInput, trackId: string, options?: QueueTimingOptions): ExistingTrackTimingEstimate {
  const normalized = normalizeOptions(options);
  const snapshot = buildQueueTimingSnapshot(input, { ...normalized, now: options?.now });
  const currentPaceOptions = optionsAtTalkPace(normalized, snapshot.currentPaceTalkSecondsPerTrack);
  const nowPlaying = input.nowPlaying ?? null;
  if (nowPlaying?.id === trackId) return emptyExistingEstimate(input, trackId, "now_playing", true, "Track is currently loaded as Now Playing.", currentPaceOptions);

  const upNext = resolvedUpNext(input);
  const tracksBeforeTarget = activeTracksInResolvedOrder({ ...input, queue: [] });
  if (upNext?.id === trackId) {
    const ahead = nowPlaying && !isRemovedTrack(nowPlaying) && nowPlaying.id !== trackId ? [nowPlaying] : [];
    const timeline = buildProjectedShowTimeline({ ...input, upNext: null, nextInLine: null, queue: ahead }, { ...currentPaceOptions, targetSongsAhead: ahead.length, includeWheelCeremony: false, now: options?.now });
    const seconds = sumSegments(timeline.segments);
    const stats = segmentStats(timeline.segments);
    return { scenario: "existing_track", trackId, found: true, state: "up_next", songsAhead: ahead.length, estimatedSeconds: seconds, estimatedSecondsUntilPlay: seconds, estimatedRangeSeconds: buildProjectionRangeSeconds(seconds, timeline.confidence, stats.sponsorBreakSecondsIncluded > 0), timelineSegmentsIncluded: timeline.segments, sponsorBreakIncluded: stats.sponsorBreakSecondsIncluded > 0, sponsorBreakSecondsIncluded: stats.sponsorBreakSecondsIncluded, wheelCeremonySeconds: 0, wheelCeremonySecondsIncluded: 0, targetStatus: snapshot.targetStatus, confidence: timeline.confidence, notes: [...timeline.notes, "Track is currently staged as Up Next / Next In Line."] };
  }

  const queue = input.queue ?? [];
  const queueIndex = queue.findIndex((track) => track?.id === trackId);
  if (queueIndex >= 0) {
    const priorQueue = queue.slice(0, queueIndex);
    const aheadInput = { ...input, queue: priorQueue };
    const tracksAhead = uniqueTracks([...tracksBeforeTarget, ...priorQueue.filter((track): track is QueueTimingTrack => Boolean(track && !isRemovedTrack(track) && !isCompletedTrack(track)))]);
    const timeline = buildProjectedShowTimeline(aheadInput, { ...currentPaceOptions, targetSongsAhead: tracksAhead.length, now: options?.now });
    const seconds = sumSegments(timeline.segments);
    const stats = segmentStats(timeline.segments);
    const notes = [...timeline.notes, "Queued track timing uses tracks ahead in the current resolved visible order and does not simulate resolver lane decisions."];
    return { scenario: "existing_track", trackId, found: true, state: statusState(queue[queueIndex], "queued"), songsAhead: tracksAhead.length, estimatedSeconds: seconds, estimatedSecondsUntilPlay: seconds, estimatedRangeSeconds: buildProjectionRangeSeconds(seconds, timeline.confidence, stats.sponsorBreakSecondsIncluded > 0 || stats.wheelCeremonySecondsIncluded > 0), timelineSegmentsIncluded: timeline.segments, sponsorBreakIncluded: stats.sponsorBreakSecondsIncluded > 0, sponsorBreakSecondsIncluded: stats.sponsorBreakSecondsIncluded, wheelCeremonySeconds: stats.wheelCeremonySecondsIncluded, wheelCeremonySecondsIncluded: stats.wheelCeremonySecondsIncluded, targetStatus: snapshot.targetStatus, confidence: timeline.confidence, notes };
  }

  const completed = input.completed?.find((track) => track?.id === trackId);
  if (completed) return emptyExistingEstimate(input, trackId, statusState(completed, "played"), true, "Track is in completed/played history.", currentPaceOptions);

  const removed = input.removed?.find((track) => track?.id === trackId);
  if (removed) return emptyExistingEstimate(input, trackId, "removed", true, "Track is marked removed and is excluded from playable timing.", currentPaceOptions);

  return emptyExistingEstimate(input, trackId, "missing", false, "Track was not found in now playing, up next, queue, completed, or removed input.", currentPaceOptions);
}

function isActivePriorityTrack(track: QueueTimingTrack | null | undefined): boolean {
  const status = track?.priorityUpgradeStatus as PriorityUpgradeStatus | undefined;
  return track?.lane === "priority" && !track.priorityPausedAt && (status === "paid" || status === "manual");
}

function priorityEligible(track: QueueTimingTrack | null | undefined): { eligible: boolean; reason?: string } {
  if (!track) return { eligible: true };
  if (isRemovedTrack(track)) return { eligible: false, reason: "removed" };
  if (isCompletedTrack(track)) return { eligible: false, reason: "already_played" };
  if (track.status === "playing") return { eligible: false, reason: "now_playing" };
  if (isActivePriorityTrack(track)) return { eligible: false, reason: "already_priority" };
  if (track.priorityUpgradeStatus === "checkout_pending") return { eligible: false, reason: "payment_processing_not_priority" };
  return { eligible: true };
}

function priorityScenarioInput(input: QueueTimingInput, track?: QueueTimingTrack | null): QueueTimingInput {
  const upNext = resolvedUpNext(input);
  const activePriorityAhead: QueueTimingTrack[] = [];
  if (isActivePriorityTrack(upNext)) activePriorityAhead.push(upNext as QueueTimingTrack);
  activePriorityAhead.push(...(input.queue ?? []).filter((entry) => entry?.id !== track?.id && isActivePriorityTrack(entry)));
  return { ...input, upNext: input.nowPlaying ? null : (activePriorityAhead[0] ?? null), nextInLine: input.nowPlaying ? null : (activePriorityAhead[0] ?? null), queue: activePriorityAhead.slice(input.nowPlaying ? 0 : 1) };
}

export function estimatePriorityImpact(input: QueueTimingInput, track?: QueueTimingTrack | null, options?: QueueTimingOptions): PriorityImpactEstimate {
  const eligibility = priorityEligible(track);
  const freeEstimate = track?.id ? estimateExistingTrackTiming(input, track.id, options) : estimateNewSubmissionTiming(input, options);
  if (!eligibility.eligible) {
    return { freeEstimate, priorityEstimate: freeEstimate, estimatedSecondsSaved: null, priorityEligible: false, ineligibleReason: eligibility.reason, confidence: freeEstimate.confidence, notes: ["Priority impact is pure simulation only; queue/payment state is not mutated.", "Payment Processing is not treated as active Priority."] };
  }

  const priorityInput = priorityScenarioInput(input, track);
  const priorityEstimate = track?.id ? estimateExistingTrackTiming({ ...priorityInput, queue: [...(priorityInput.queue ?? []), { ...track, lane: "priority" as QueueLane, priorityUpgradeStatus: "paid" as PriorityUpgradeStatus }] }, track.id, options) : estimateNewSubmissionTiming(priorityInput, options);
  const saved = Math.max(0, freeEstimate.estimatedSecondsUntilPlay - priorityEstimate.estimatedSecondsUntilPlay);
  const confidence: QueueTimingConfidence = freeEstimate.confidence === "low" || priorityEstimate.confidence === "low" ? "low" : "medium";
  return { freeEstimate, priorityEstimate, estimatedSecondsSaved: saved, priorityEligible: true, confidence, notes: ["Priority impact is simulated without mutating queue state or payment state.", "Payment Processing / checkout_pending is not active Priority; only paid/manual priority is treated as confirmed.", "New Priority does not skip Now Playing or confirmed active Priority already ahead."] };
}
