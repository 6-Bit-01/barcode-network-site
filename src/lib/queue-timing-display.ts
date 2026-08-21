import {
  DEFAULT_SPONSOR_BREAK_SECONDS,
  estimateExistingTrackTiming,
  estimateNewSubmissionTiming,
  estimatePriorityImpact,
  buildQueueTimingSnapshot,
  type ExistingTrackTimingEstimate,
  type NewSubmissionTimingEstimate,
  type PriorityImpactEstimate,
  type QueueTimingInput,
  type QueueTimingTargetStatus,
} from "./queue-timing";
import { formatRuntime, getTrackRuntimeSeconds, type QueueDurationSource, type QueueEntry, type QueuePublicSnapshot, type QueuePublicTrack, type QueueSessionSummary, type QueueTrackStatus } from "./queue-types";
import { pacificClockLabel } from "./pacific-time";

export type TimingDisplayTrack = Partial<Omit<QueueEntry, "tiktokHandle" | "priorityGiftAttribution">> & Partial<QueuePublicTrack> & { id: string };
export type PublicTimingNote = "sponsor" | "wheel";

export interface TimingDisplayEstimate {
  songsAhead: number;
  label: string;
  noteKeys: PublicTimingNote[];
  sponsorBreakIncluded: boolean;
  wheelCeremonyIncluded: boolean;
  confidence: "low" | "medium" | "high";
}

export interface PriorityTimingDisplay {
  freeLabel: string;
  priorityLabel: string;
  compactCopy: string;
  helperCopy: string;
}

export interface QueueTimingDisplaySummary {
  submitNowFreeEstimate: TimingDisplayEstimate | null;
  submitNowPriorityEstimate: TimingDisplayEstimate | null;
  priorityImpactEstimate: PriorityImpactEstimate | null;
  personalClosestTrackEstimate: ExistingTrackTimingEstimate | null;
  showRuntimeSummary: {
    projectedLabel: string;
    publicProjectedLabel: string | null;
    targetLabel: string;
    publicTargetLabel: string;
    targetStatus: QueueTimingTargetStatus;
    targetStatusLabel: string;
    notes: string[];
    knownDurationCount: number;
    unknownDurationCount: number;
    confidenceLabel: string;
    elapsedLabel: string;
    remainingLabel: string;
    estimatedEndLabel: string;
    completedRemainingLabel: string;
    talkRoomLabel: string;
    warningRoomLabel: string;
    talkPerTrackLabel: string;
  };
  sponsorBreakSummary: {
    status: string;
    statusLabel: string;
    diagnosticLabel: string;
    dueAfterTracks: number | null;
    durationLabel: string;
    completedPlayableCount: number;
    totalPlayableNonRemovedCount: number | null;
    included: boolean;
    dueNow: boolean;
    includedInProjection: boolean;
    midpointReached: boolean | null;
    elapsedGateReached: boolean;
    minimumElapsedSeconds: number;
    broadcastElapsedSeconds: number | null;
    compactLabel: string;
  };
  wheelTimingSummary: {
    owed: number;
    overheadSeconds: number;
    overheadLabel: string;
    included: boolean;
  };
  timeBankSummary: {
    bankSeconds: number;
    targetProjectionSeconds: number;
    currentProjectionSeconds: number;
    remainingProjectionSeconds: number;
    maximumTalkProjectionSeconds: number;
    currentTalkPaceSecondsPerTrack: number;
    activePlayableCount: number;
    completedPlayableCount: number;
    removedCount: number;
    knownDurationCount: number;
    wheelSpinsOwed: number;
    wheelSecondsBudgeted: number;
    sponsorStatus: string;
    isLive: boolean;
  };
  pressureSummary: {
    score: number;
    level: "low" | "medium" | "high" | "critical";
    label: string;
    description: string;
    recommendation: string;
    factors: string[];
    mode: "pre_show" | "live" | "ended" | "unknown";
    isLive: boolean;
  };
  lineFitStatus: QueueTimingTargetStatus;
  lineFitCopy: string;
  publicNotes: string[];
  input: QueueTimingInput;
}

export function queueTimingInputFromPublicSnapshot(snapshot: QueuePublicSnapshot | null): QueueTimingInput {
  if (!snapshot?.session) return {};
  return {
    nowPlaying: snapshot.nowPlaying ? timingTrack(snapshot.nowPlaying, "playing") : null,
    upNext: snapshot.upNext ? timingTrack(snapshot.upNext, "next") : null,
    nextInLine: snapshot.upNext ? timingTrack(snapshot.upNext, "next") : null,
    queue: snapshot.queue.map((track) => timingTrack(track, "queued")),
    completed: snapshot.completed.map((track) => timingTrack(track, "completed")),
    session: sessionTimingFields(snapshot.session),
    completedRuntimeSeconds: snapshot.session.completedRuntimeSeconds ?? null,
    wheelSpinsOwed: snapshot.session.wheelSpinsOwed ?? 0,
    playbackTiming: snapshot.playbackTiming ?? null,
    wheelTiming: snapshot.wheelTiming ?? null,
  };
}

export function queueTimingInputFromAdminState(state: { nowPlaying?: QueueEntry | null; nextInLine?: QueueEntry | null; queue?: QueueEntry[] | null; history?: QueueEntry[] | null; removed?: QueueEntry[] | null; session?: QueueSessionSummary | null; playbackTiming?: QueuePublicSnapshot["playbackTiming"]; wheelTiming?: QueuePublicSnapshot["wheelTiming"] } | null): QueueTimingInput {
  if (!state) return {};
  return {
    nowPlaying: state.nowPlaying ? timingTrack(state.nowPlaying, "playing") : null,
    upNext: state.nextInLine ? timingTrack(state.nextInLine, "next") : null,
    nextInLine: state.nextInLine ? timingTrack(state.nextInLine, "next") : null,
    queue: (state.queue ?? []).map((track) => timingTrack(track, "queued")),
    completed: (state.history ?? []).map((track) => timingTrack(track, "completed")),
    removed: (state.removed ?? []).map((track) => timingTrack(track, "removed")),
    session: state.session ? sessionTimingFields(state.session) : null,
    completedRuntimeSeconds: state.session?.completedRuntimeSeconds ?? null,
    wheelSpinsOwed: state.session?.wheelSpinsOwed ?? 0,
    playbackTiming: state.playbackTiming ?? null,
    wheelTiming: state.wheelTiming ?? null,
  };
}

function timingTrack(track: TimingDisplayTrack, status: QueueTrackStatus): TimingDisplayTrack {
  return {
    ...track,
    status: track.status ?? status,
    lane: track.lane ?? "regular",
    detectedDurationSeconds: track.detectedDurationSeconds ?? null,
    estimatedDurationSeconds: track.estimatedDurationSeconds,
    durationIsEstimate: track.durationIsEstimate ?? true,
    durationSource: track.durationSource,
  };
}

function sessionTimingFields(session: NonNullable<QueuePublicSnapshot["session"]> | QueueSessionSummary) {
  return {
    completedCount: session.completedCount,
    removedCount: session.removedCount,
    completedRuntimeSeconds: session.completedRuntimeSeconds,
    estimatedActiveRuntimeSeconds: "estimatedActiveRuntimeSeconds" in session ? session.estimatedActiveRuntimeSeconds : undefined,
    wheelSpinsOwed: session.wheelSpinsOwed,
    activeCount: session.activeCount,
    acceptedCount: session.acceptedCount,
    sponsorBreakSeconds: session.sponsorBreakSeconds,
    sponsorBreakMode: session.sponsorBreakMode,
    sponsorBreakStatus: session.sponsorBreakStatus,
    broadcastStartedAt: session.broadcastStartedAt,
    sponsorBreakStartedAt: session.sponsorBreakStartedAt,
    sponsorBreakCompletedAt: session.sponsorBreakCompletedAt,
    sponsorBreakCompletedAfterPlayableCount: session.sponsorBreakCompletedAfterPlayableCount,
    sponsorBreakDueAfterPlayableCount: session.sponsorBreakDueAfterPlayableCount,
    sponsorBreakManualNote: session.sponsorBreakManualNote,
    showStarted: session.showStarted,
    broadcastPhase: session.broadcastPhase,
  };
}

export function buildQueueTimingDisplay(input: QueueTimingInput, options: { priorityEligible?: boolean; personalTrackId?: string | null; now?: Date } = {}): QueueTimingDisplaySummary {
  const timingOptions = { now: options.now };
  const snapshot = buildQueueTimingSnapshot(input, timingOptions);
  const free = estimateNewSubmissionTiming(input, timingOptions);
  const priorityImpact = options.priorityEligible === false ? null : estimatePriorityImpact(input, null, timingOptions);
  const priorityEstimate = priorityImpact?.priorityEligible ? displayEstimate(priorityImpact.priorityEstimate as NewSubmissionTimingEstimate | ExistingTrackTimingEstimate) : null;
  const publicNotes = publicNotesFor(free.sponsorBreakIncluded, free.wheelCeremonySecondsIncluded > 0);
  const pressureSummary = buildPressureSummary(snapshot, input.session ?? null);

  return {
    submitNowFreeEstimate: displayEstimate(free),
    submitNowPriorityEstimate: priorityEstimate,
    priorityImpactEstimate: priorityImpact,
    personalClosestTrackEstimate: options.personalTrackId ? estimateExistingTrackTiming(input, options.personalTrackId, timingOptions) : null,
    showRuntimeSummary: {
      projectedLabel: `${formatHoursMinutes(snapshot.projectedTotalShowSeconds)} projected`,
      publicProjectedLabel: publicProjectedShowTimeLabel(snapshot.projectedTotalShowSeconds, snapshot.targetStatus),
      targetLabel: "5h target · 6h redline",
      publicTargetLabel: "5h target",
      targetStatus: snapshot.targetStatus,
      targetStatusLabel: targetStatusLabel(snapshot.targetStatus),
      notes: snapshot.notes,
      knownDurationCount: snapshot.knownDurationCount,
      unknownDurationCount: snapshot.unknownDurationCount,
      confidenceLabel: `${snapshot.confidence[0].toUpperCase()}${snapshot.confidence.slice(1)} confidence`,
      elapsedLabel: typeof snapshot.broadcastElapsedSeconds === "number" ? `${formatHoursMinutes(snapshot.broadcastElapsedSeconds)} elapsed` : "Not started",
      remainingLabel: `${formatHoursMinutes(snapshot.projectedRemainingShowSeconds)} projected remaining`,
      estimatedEndLabel: pacificClockLabel(snapshot.projectedEndAt, options.now) ?? "Available after broadcast starts",
      completedRemainingLabel: `${snapshot.completedPlayableCount} completed · ${snapshot.remainingPlayableCount} remaining`,
      talkRoomLabel: talkBudgetLabel(snapshot.talkBudgetToTargetSeconds, "5h target"),
      warningRoomLabel: talkBudgetLabel(snapshot.talkBudgetToWarningSeconds, "6h redline"),
      talkPerTrackLabel: talkPerTrackLabel(snapshot.talkSecondsPerRemainingTrackToTarget),
    },
    sponsorBreakSummary: {
      status: snapshot.sponsorBreakStatus,
      statusLabel: sponsorStatusLabel(snapshot.sponsorBreakStatus),
      diagnosticLabel: sponsorDiagnosticLabel(snapshot.sponsorBreak),
      dueAfterTracks: snapshot.sponsorBreak.sponsorBreakThreshold,
      durationLabel: formatMinutesSeconds(snapshot.sponsorBreak.sponsorBreakSeconds || DEFAULT_SPONSOR_BREAK_SECONDS),
      completedPlayableCount: snapshot.sponsorBreak.completedPlayableCount,
      totalPlayableNonRemovedCount: snapshot.sponsorBreak.totalPlayableNonRemovedCount,
      included: snapshot.sponsorBreakSecondsIncluded > 0,
      dueNow: isSponsorDueNowNow(snapshot.sponsorBreak),
      includedInProjection: snapshot.sponsorBreakSecondsIncluded > 0,
      midpointReached: currentMidpointReached(snapshot.sponsorBreak),
      elapsedGateReached: snapshot.sponsorBreak.elapsedGateReached,
      minimumElapsedSeconds: snapshot.sponsorBreak.minimumElapsedSeconds,
      broadcastElapsedSeconds: snapshot.sponsorBreak.broadcastElapsedSeconds,
      compactLabel: sponsorCompactLabel(snapshot.sponsorBreak),
    },
    wheelTimingSummary: {
      owed: snapshot.wheelCeremony.wheelSpinsOwedIncluded,
      overheadSeconds: snapshot.wheelCeremonySecondsIncluded,
      overheadLabel: formatHoursMinutes(snapshot.wheelCeremonySecondsIncluded),
      included: snapshot.wheelCeremonySecondsIncluded > 0,
    },
    timeBankSummary: {
      bankSeconds: snapshot.timeBankSeconds,
      targetProjectionSeconds: snapshot.targetPaceProjectedTotalShowSeconds,
      currentProjectionSeconds: snapshot.currentPaceProjectedTotalShowSeconds,
      remainingProjectionSeconds: snapshot.projectedRemainingShowSeconds,
      maximumTalkProjectionSeconds: snapshot.maximumTalkProjectedTotalShowSeconds,
      currentTalkPaceSecondsPerTrack: snapshot.currentPaceTalkSecondsPerTrack,
      activePlayableCount: snapshot.activePlayableCount,
      completedPlayableCount: snapshot.completedPlayableCount,
      removedCount: snapshot.removedCount ?? 0,
      knownDurationCount: snapshot.knownDurationCount,
      wheelSpinsOwed: snapshot.wheelCeremony.wheelSpinsOwedIncluded,
      wheelSecondsBudgeted: snapshot.wheelCeremonySecondsIncluded,
      sponsorStatus: snapshot.sponsorBreakStatus,
      isLive: pressureSummary.isLive,
    },
    pressureSummary,
    lineFitStatus: snapshot.targetStatus,
    lineFitCopy: lineFitCopy(snapshot.targetStatus),
    publicNotes,
    input,
  };
}

export function displayEstimate(estimate: NewSubmissionTimingEstimate | ExistingTrackTimingEstimate): TimingDisplayEstimate {
  return {
    songsAhead: estimate.songsAhead,
    label: publicRangeLabel(estimate.estimatedRangeSeconds.label),
    noteKeys: noteKeysFor(estimate.sponsorBreakIncluded, estimate.wheelCeremonySecondsIncluded > 0),
    sponsorBreakIncluded: estimate.sponsorBreakIncluded,
    wheelCeremonyIncluded: estimate.wheelCeremonySecondsIncluded > 0,
    confidence: estimate.confidence,
  };
}

export function priorityDisplayFromImpact(impact: PriorityImpactEstimate | null | undefined): PriorityTimingDisplay | null {
  if (!impact?.priorityEligible) return null;
  const free = displayEstimate(impact.freeEstimate as NewSubmissionTimingEstimate | ExistingTrackTimingEstimate);
  const priority = displayEstimate(impact.priorityEstimate as NewSubmissionTimingEstimate | ExistingTrackTimingEstimate);
  return {
    freeLabel: free.label,
    priorityLabel: `${priority.label} after payment clears`,
    compactCopy: `Priority could move this from ${free.label.toLowerCase()} to ${priority.label.toLowerCase()} after payment clears.`,
    helperCopy: "Priority moves your track closer to the front after payment clears. It does not interrupt the song currently playing.",
  };
}

export function publicRangeLabel(label: string): string {
  if (label === "Now") return "Now";
  return label.startsWith("About") ? label : `About ${label}`;
}

export function publicNotesFor(sponsorIncluded: boolean, wheelIncluded: boolean): string[] {
  const notes: string[] = [];
  if (sponsorIncluded) notes.push("Wheel spins or the commercial break may add time.");
  if (wheelIncluded && !sponsorIncluded) notes.push("Wheel spins may add time.");
  return notes;
}

function noteKeysFor(sponsorIncluded: boolean, wheelIncluded: boolean): PublicTimingNote[] {
  const notes: PublicTimingNote[] = [];
  if (sponsorIncluded) notes.push("sponsor");
  if (wheelIncluded) notes.push("wheel");
  return notes;
}

export function publicProjectedShowTimeLabel(seconds: number | null | undefined, status: QueueTimingTargetStatus = "unknown"): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (status === "warning_ceiling" || seconds >= 6 * 60 * 60) return "About 6h+";
  return `About ${formatHoursMinutes(seconds)}`;
}

export function lineFitCopy(status: QueueTimingTargetStatus): string {
  if (status === "comfortable") return "Looks playable tonight.";
  if (status === "tight") return "Line is getting tight tonight.";
  if (status === "over_target") return "This may run late.";
  if (status === "warning_ceiling") return "Show is under strong time pressure; playback continues.";
  return "Timing updates as the line changes.";
}

export function targetStatusLabel(status: QueueTimingTargetStatus): string {
  if (status === "comfortable") return "Comfortable";
  if (status === "tight") return "Tight";
  if (status === "over_target") return "Over target";
  if (status === "warning_ceiling") return "6h redline";
  return "Unknown";
}

export function sponsorDiagnosticLabel(sponsor: { sponsorBreakStatus?: string | null; midpointReached?: boolean | null; sponsorBreakIncluded?: boolean | null; sponsorBreakThreshold?: number | null; completedPlayableCount?: number | null; sponsorBreakSecondsRemaining?: number | null; elapsedGateReached?: boolean | null; minimumElapsedSeconds?: number | null; broadcastElapsedSeconds?: number | null }): string {
  if (sponsor.sponsorBreakStatus === "completed") return "Completed";
  if (sponsor.sponsorBreakStatus === "skipped") return "Skipped";
  if (sponsor.sponsorBreakStatus === "running") return `Running${typeof sponsor.sponsorBreakSecondsRemaining === "number" ? ` · ${formatMinutesSeconds(sponsor.sponsorBreakSecondsRemaining)} remaining` : ""}`;
  if (sponsor.elapsedGateReached === false) return `${formatHoursMinutes(sponsor.minimumElapsedSeconds ?? 2 * 60 * 60)} minimum · ${formatHoursMinutes(sponsor.broadcastElapsedSeconds ?? 0)} elapsed`;
  if (sponsor.sponsorBreakStatus === "due" || sponsor.midpointReached === true) return "Due now";
  if (typeof sponsor.sponsorBreakThreshold === "number") return `Due at midpoint · ${sponsor.completedPlayableCount ?? 0}/${sponsor.sponsorBreakThreshold} completed`;
  return "Waiting for counted midpoint";
}

export function sponsorStatusLabel(status?: string | null): string {
  if (status === "due") return "Due";
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "skipped") return "Skipped";
  return "Not due";
}

function currentMidpointReached(sponsor: { sponsorBreakThreshold?: number | null; completedPlayableCount?: number | null }): boolean | null {
  if (typeof sponsor.sponsorBreakThreshold !== "number") return null;
  return (sponsor.completedPlayableCount ?? 0) >= sponsor.sponsorBreakThreshold;
}

function isSponsorDueNowNow(sponsor: { sponsorBreakStatus?: string | null }): boolean {
  if (sponsor.sponsorBreakStatus === "completed" || sponsor.sponsorBreakStatus === "skipped" || sponsor.sponsorBreakStatus === "running") return false;
  return sponsor.sponsorBreakStatus === "due";
}

function sponsorCompactLabel(sponsor: { sponsorBreakStatus?: string | null; sponsorBreakThreshold?: number | null; completedPlayableCount?: number | null; sponsorBreakSecondsRemaining?: number | null; elapsedGateReached?: boolean | null; minimumElapsedSeconds?: number | null; broadcastElapsedSeconds?: number | null }): string {
  if (sponsor.sponsorBreakStatus === "completed") return "Done";
  if (sponsor.sponsorBreakStatus === "skipped") return "Skipped";
  if (sponsor.sponsorBreakStatus === "running") return `Running ${formatMinutesSeconds(sponsor.sponsorBreakSecondsRemaining ?? 0)}`;
  if (isSponsorDueNowNow(sponsor)) return "Due";
  if (sponsor.elapsedGateReached === false) return `${formatHoursMinutes(sponsor.minimumElapsedSeconds ?? 2 * 60 * 60)} minimum`;
  return typeof sponsor.sponsorBreakThreshold === "number" ? `Midpoint ${sponsor.completedPlayableCount ?? 0}/${sponsor.sponsorBreakThreshold}` : "Not due";
}

function buildPressureSummary(snapshot: ReturnType<typeof buildQueueTimingSnapshot>, session: QueueTimingInput["session"] | null) {
  const hasBroadcastStart = Boolean(snapshot.sponsorBreak.broadcastStartedAt);
  const isEnded = session?.broadcastPhase === "ended";
  const showStarted = session?.showStarted === true;
  const broadcastRunning = hasBroadcastStart || showStarted;
  const mode: "pre_show" | "live" | "ended" | "unknown" = isEnded
    ? "ended"
    : broadcastRunning
      ? "live"
      : "pre_show";

  if (mode !== "live") {
    const preFactors: string[] = [];
    if (snapshot.projectedTotalShowSeconds > snapshot.targetShowSeconds) preFactors.push("Projected runtime is over the 5h target.");
    if (snapshot.unknownDurationCount > 0) preFactors.push(`${snapshot.unknownDurationCount} track durations are estimated; this changes confidence, not pressure by itself.`);
    return {
      score: 10,
      level: "low" as const,
      label: mode === "ended" ? "ENDED" : "PRE-SHOW",
      description: mode === "ended" ? "Broadcast is ended/archived." : "Pre-show projection only. Live pressure is inactive.",
      recommendation: mode === "ended" ? "Broadcast is ended." : "Pressure activates when broadcast starts.",
      factors: preFactors,
      mode,
      isLive: false,
    };
  }

  const factors: string[] = [];
  const score = Math.max(
    requiredTalkPressureScore(snapshot.talkSecondsPerRemainingTrackToTarget, snapshot.maximumTalkSecondsPerTrack, snapshot.remainingPlayableCount),
    boundaryMarginPressureScore(snapshot.timeBankSeconds),
    hardLimitMarginPressureScore(snapshot.hardLimitMarginSeconds),
  );
  const level: "low" | "medium" | "high" | "critical" = score >= 88 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
  const label = level === "critical" ? "CRITICAL" : level === "high" ? "HIGH" : level === "medium" ? "MEDIUM" : "LOW";
  factors.push(`${formatHoursMinutes(snapshot.fixedWorkloadRemainingSeconds)} of fixed song, wheel, and sponsor work remains.`);
  factors.push(talkBudgetLabel(snapshot.talkBudgetToTargetSeconds, "5h target"));
  factors.push(talkBudgetLabel(snapshot.talkBudgetToWarningSeconds, "6h redline"));
  factors.push(`${formatMinutesSeconds(snapshot.currentPaceTalkSecondsPerTrack)} current talk/transition pace per track.`);
  if (snapshot.unknownDurationCount > 0) factors.push(`${snapshot.unknownDurationCount} track durations are estimated; timing confidence is ${snapshot.confidence}.`);
  const recommendation = snapshot.sponsorBreak.sponsorBreakStatus === "due"
    ? "SPONSOR BREAK DUE · start the 10:30 break."
    : level === "critical"
      ? "MOVE NOW · use only necessary transitions."
      : level === "high"
        ? "KEEP COMMENTS SHORT · protect the 6h redline."
        : level === "medium"
          ? "KEEP COMMENTS FOCUSED · pacing is usable but not loose."
          : "ROOM TO TALK · the current workload supports normal conversation.";
  const description = level === "critical"
    ? "Committed work has consumed the usable 6h planning room. Playback continues; the redline is a warning, not an automatic cutoff."
    : level === "high"
      ? "The 5h target is tight or already spent, with some room still available before the 6h redline."
      : level === "medium"
        ? "There is limited room for host talk while staying near the 5h target."
        : "There is room for host talk at the current completed-versus-remaining pace.";
  return { score, level, label, description, recommendation, factors, mode: "live" as const, isLive: true };
}

function requiredTalkPressureScore(requiredSecondsPerTrack: number | null, maxSecondsPerTrack: number, remainingTrackCount: number): number {
  if (remainingTrackCount <= 0 || requiredSecondsPerTrack === null || !Number.isFinite(requiredSecondsPerTrack)) return 10;
  const required = requiredSecondsPerTrack;
  const maximum = Math.max(1, maxSecondsPerTrack);
  if (required >= maximum * 1.5) return 10;
  if (required >= maximum) return Math.round(10 + ((maximum * 1.5 - required) / (maximum * 0.5)) * 20);
  if (required >= maximum * 0.75) return Math.round(30 + ((maximum - required) / (maximum * 0.25)) * 35);
  if (required >= maximum * 0.5) return Math.round(65 + ((maximum * 0.75 - required) / (maximum * 0.25)) * 13);
  if (required >= 0) return Math.round(78 + ((maximum * 0.5 - required) / (maximum * 0.5)) * 10);
  return Math.min(100, 92 + Math.round(Math.min(8, Math.abs(required) / 30)));
}

function boundaryMarginPressureScore(marginSeconds: number): number {
  if (marginSeconds >= 60 * 60) return 10;
  if (marginSeconds >= 30 * 60) return Math.round(10 + ((60 * 60 - marginSeconds) / (30 * 60)) * 25);
  if (marginSeconds >= 0) return Math.round(35 + ((30 * 60 - marginSeconds) / (30 * 60)) * 35);
  if (marginSeconds >= -60 * 60) return Math.round(70 + (Math.abs(marginSeconds) / (60 * 60)) * 22);
  return 95;
}

function hardLimitMarginPressureScore(marginSeconds: number): number {
  if (marginSeconds >= 60 * 60) return 10;
  if (marginSeconds >= 30 * 60) return Math.round(20 + ((60 * 60 - marginSeconds) / (30 * 60)) * 20);
  if (marginSeconds >= 0) return Math.round(40 + ((30 * 60 - marginSeconds) / (30 * 60)) * 30);
  if (marginSeconds >= -60 * 60) return Math.round(70 + (Math.abs(marginSeconds) / (60 * 60)) * 22);
  return 96;
}

function talkBudgetLabel(seconds: number | null, boundary: string): string {
  if (seconds === null || !Number.isFinite(seconds)) return `Talk room to ${boundary} is unavailable`;
  if (seconds >= 0) return `${formatHoursMinutes(seconds)} total talk room to ${boundary}`;
  return `${formatHoursMinutes(Math.abs(seconds))} beyond ${boundary} before additional talk`;
}

function talkPerTrackLabel(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "No remaining-track talk rate";
  if (seconds < 0) return `5h target already spent by ${formatMinutesSeconds(Math.abs(seconds))} per remaining track`;
  return `${formatMinutesSeconds(seconds)} talk room per remaining track to 5h`;
}

export function formatMinutesSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (minutes === 0) return `${remaining}s`;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

export function formatHoursMinutes(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export function publicTrackDurationLabel(track: Pick<TimingDisplayTrack, "detectedDurationSeconds" | "estimatedDurationSeconds" | "durationIsEstimate" | "durationSource" | "durationLabel">): string {
  if (track.durationIsEstimate) return `est. ${formatRuntime(getTrackRuntimeSeconds({ detectedDurationSeconds: track.detectedDurationSeconds ?? null, estimatedDurationSeconds: track.estimatedDurationSeconds }))}`;
  return track.durationLabel ?? formatRuntime(getTrackRuntimeSeconds({ detectedDurationSeconds: track.detectedDurationSeconds ?? null, estimatedDurationSeconds: track.estimatedDurationSeconds }));
}

export function durationWasDetected(source?: QueueDurationSource | null): boolean {
  return Boolean(source && source !== "internal_estimate" && source !== "estimated" && source !== "unknown");
}
