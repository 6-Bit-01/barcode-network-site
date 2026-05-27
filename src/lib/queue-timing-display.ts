import {
  DEFAULT_SPONSOR_BREAK_SECONDS,
  DEFAULT_SPONSOR_BREAK_MIN_ELAPSED_SECONDS,
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

export type TimingDisplayTrack = Partial<Omit<QueueEntry, "tiktokHandle">> & Partial<QueuePublicTrack> & { id: string };
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
  };
  sponsorBreakSummary: {
    status: string;
    statusLabel: string;
    diagnosticLabel: string;
    dueAfterTracks: number | null;
    durationLabel: string;
    minElapsedLabel: string;
    completedPlayableCount: number;
    totalPlayableNonRemovedCount: number | null;
    included: boolean;
    dueNow: boolean;
    includedInProjection: boolean;
    midpointReached: boolean | null;
    twoHourGateReached: boolean | null;
    compactLabel: string;
  };
  wheelTimingSummary: {
    owed: number;
    overheadSeconds: number;
    overheadLabel: string;
    included: boolean;
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
  if (!snapshot) return {};
  return {
    nowPlaying: snapshot.nowPlaying ? timingTrack(snapshot.nowPlaying, "playing") : null,
    upNext: snapshot.upNext ? timingTrack(snapshot.upNext, "next") : null,
    nextInLine: snapshot.upNext ? timingTrack(snapshot.upNext, "next") : null,
    queue: snapshot.queue.map((track) => timingTrack(track, "queued")),
    completed: snapshot.completed.map((track) => timingTrack(track, "completed")),
    session: sessionTimingFields(snapshot.session),
    completedRuntimeSeconds: snapshot.session.completedRuntimeSeconds ?? null,
    wheelSpinsOwed: snapshot.session.wheelSpinsOwed ?? 0,
  };
}

export function queueTimingInputFromAdminState(state: { nowPlaying?: QueueEntry | null; nextInLine?: QueueEntry | null; queue?: QueueEntry[] | null; history?: QueueEntry[] | null; removed?: QueueEntry[] | null; session?: QueueSessionSummary | null } | null): QueueTimingInput {
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

function sessionTimingFields(session: QueuePublicSnapshot["session"] | QueueSessionSummary) {
  return {
    completedCount: session.completedCount,
    removedCount: session.removedCount,
    completedRuntimeSeconds: session.completedRuntimeSeconds,
    estimatedActiveRuntimeSeconds: "estimatedActiveRuntimeSeconds" in session ? session.estimatedActiveRuntimeSeconds : undefined,
    wheelSpinsOwed: session.wheelSpinsOwed,
    activeCount: session.activeCount,
    sponsorBreakSeconds: session.sponsorBreakSeconds,
    sponsorBreakMode: session.sponsorBreakMode,
    sponsorBreakStatus: session.sponsorBreakStatus,
    broadcastStartedAt: session.broadcastStartedAt,
    sponsorBreakStartedAt: session.sponsorBreakStartedAt,
    sponsorBreakCompletedAt: session.sponsorBreakCompletedAt,
    sponsorBreakCompletedAfterPlayableCount: session.sponsorBreakCompletedAfterPlayableCount,
    sponsorBreakManualNote: session.sponsorBreakManualNote,
    showStarted: session.showStarted,
    broadcastPhase: session.broadcastPhase,
  };
}

export function buildQueueTimingDisplay(input: QueueTimingInput, options: { priorityEligible?: boolean; personalTrackId?: string | null } = {}): QueueTimingDisplaySummary {
  const snapshot = buildQueueTimingSnapshot(input);
  const free = estimateNewSubmissionTiming(input);
  const priorityImpact = options.priorityEligible === false ? null : estimatePriorityImpact(input);
  const priorityEstimate = priorityImpact?.priorityEligible ? displayEstimate(priorityImpact.priorityEstimate as NewSubmissionTimingEstimate | ExistingTrackTimingEstimate) : null;
  const publicNotes = publicNotesFor(free.sponsorBreakIncluded, free.wheelCeremonySecondsIncluded > 0);
  const pressureSummary = buildPressureSummary(snapshot, input.session ?? null);

  return {
    submitNowFreeEstimate: displayEstimate(free),
    submitNowPriorityEstimate: priorityEstimate,
    priorityImpactEstimate: priorityImpact,
    personalClosestTrackEstimate: options.personalTrackId ? estimateExistingTrackTiming(input, options.personalTrackId) : null,
    showRuntimeSummary: {
      projectedLabel: `${formatHoursMinutes(snapshot.projectedTotalShowSeconds)} projected`,
      publicProjectedLabel: publicProjectedShowTimeLabel(snapshot.projectedTotalShowSeconds, snapshot.targetStatus),
      targetLabel: "4h goal · 5h warning ceiling",
      publicTargetLabel: "4h goal",
      targetStatus: snapshot.targetStatus,
      targetStatusLabel: targetStatusLabel(snapshot.targetStatus),
      notes: snapshot.notes,
      knownDurationCount: snapshot.knownDurationCount,
      unknownDurationCount: snapshot.unknownDurationCount,
    },
    sponsorBreakSummary: {
      status: snapshot.sponsorBreakStatus,
      statusLabel: sponsorStatusLabel(snapshot.sponsorBreakStatus),
      diagnosticLabel: sponsorDiagnosticLabel(snapshot.sponsorBreak),
      dueAfterTracks: snapshot.sponsorBreak.sponsorBreakThreshold,
      durationLabel: formatHoursMinutes(snapshot.sponsorBreak.sponsorBreakSeconds || DEFAULT_SPONSOR_BREAK_SECONDS),
      minElapsedLabel: formatHoursMinutes(snapshot.sponsorBreak.sponsorBreakMinElapsedSeconds || DEFAULT_SPONSOR_BREAK_MIN_ELAPSED_SECONDS),
      completedPlayableCount: snapshot.sponsorBreak.completedPlayableCount,
      totalPlayableNonRemovedCount: snapshot.sponsorBreak.totalPlayableNonRemovedCount,
      included: snapshot.sponsorBreakSecondsIncluded > 0,
      dueNow: isSponsorDueNowNow(snapshot.sponsorBreak),
      includedInProjection: snapshot.sponsorBreakSecondsIncluded > 0,
      midpointReached: currentMidpointReached(snapshot.sponsorBreak),
      twoHourGateReached: currentTwoHourGateReached(snapshot.sponsorBreak),
      compactLabel: sponsorCompactLabel(snapshot.sponsorBreak),
    },
    wheelTimingSummary: {
      owed: snapshot.wheelCeremony.wheelSpinsOwedIncluded,
      overheadSeconds: snapshot.wheelCeremonySecondsIncluded,
      overheadLabel: formatHoursMinutes(snapshot.wheelCeremonySecondsIncluded),
      included: snapshot.wheelCeremonySecondsIncluded > 0,
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
  if (status === "warning_ceiling" || seconds >= 5 * 60 * 60) return "About 5h+";
  return `About ${formatHoursMinutes(seconds)}`;
}

export function lineFitCopy(status: QueueTimingTargetStatus): string {
  if (status === "comfortable") return "Looks playable tonight.";
  if (status === "tight") return "Line is getting tight tonight.";
  if (status === "over_target") return "This may run late.";
  if (status === "warning_ceiling") return "Some late submissions may not fit tonight.";
  return "Timing updates as the line changes.";
}

export function targetStatusLabel(status: QueueTimingTargetStatus): string {
  if (status === "comfortable") return "Comfortable";
  if (status === "tight") return "Tight";
  if (status === "over_target") return "Over target";
  if (status === "warning_ceiling") return "Warning ceiling";
  return "Unknown";
}

export function sponsorDiagnosticLabel(sponsor: { sponsorBreakStatus?: string | null; midpointReached?: boolean | null; minElapsedGateReached?: boolean | null; secondsUntilMinElapsedGate?: number | null; sponsorBreakIncluded?: boolean | null; broadcastStartedAt?: string | null; sponsorBreakSecondsRemaining?: number | null }): string {
  if (sponsor.sponsorBreakStatus === "completed") return "Completed";
  if (sponsor.sponsorBreakStatus === "skipped") return "Skipped";
  if (sponsor.sponsorBreakStatus === "running") return `Running${typeof sponsor.sponsorBreakSecondsRemaining === "number" ? ` · ${formatHoursMinutes(sponsor.sponsorBreakSecondsRemaining)} remaining` : ""}`;
  if (sponsor.sponsorBreakIncluded || (sponsor.midpointReached === true && sponsor.minElapsedGateReached === true)) return "Due now";
  if (!sponsor.broadcastStartedAt || sponsor.minElapsedGateReached === null) return "Waiting for playback start";
  if (sponsor.midpointReached === true && sponsor.minElapsedGateReached === false) return "Midpoint reached · waiting for 2h mark";
  if (sponsor.midpointReached === false && sponsor.minElapsedGateReached === true) return "2h mark reached · waiting for midpoint";
  const remaining = typeof sponsor.secondsUntilMinElapsedGate === "number" ? ` · ${formatHoursMinutes(sponsor.secondsUntilMinElapsedGate)} until 2h mark` : "";
  return `Not eligible yet${remaining}`;
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

function currentTwoHourGateReached(sponsor: { broadcastElapsedSeconds?: number | null; sponsorBreakMinElapsedSeconds?: number | null }): boolean | null {
  if (typeof sponsor.broadcastElapsedSeconds !== "number") return null;
  return sponsor.broadcastElapsedSeconds >= (sponsor.sponsorBreakMinElapsedSeconds ?? DEFAULT_SPONSOR_BREAK_MIN_ELAPSED_SECONDS);
}

function isSponsorDueNowNow(sponsor: { sponsorBreakStatus?: string | null; sponsorBreakThreshold?: number | null; completedPlayableCount?: number | null; broadcastElapsedSeconds?: number | null; sponsorBreakMinElapsedSeconds?: number | null }): boolean {
  if (sponsor.sponsorBreakStatus === "completed" || sponsor.sponsorBreakStatus === "skipped" || sponsor.sponsorBreakStatus === "running") return false;
  return currentMidpointReached(sponsor) === true && currentTwoHourGateReached(sponsor) === true;
}

function sponsorCompactLabel(sponsor: { sponsorBreakStatus?: string | null; sponsorBreakThreshold?: number | null; completedPlayableCount?: number | null; broadcastElapsedSeconds?: number | null; sponsorBreakMinElapsedSeconds?: number | null; broadcastStartedAt?: string | null; sponsorBreakSecondsRemaining?: number | null }): string {
  if (sponsor.sponsorBreakStatus === "completed") return "Done";
  if (sponsor.sponsorBreakStatus === "skipped") return "Skipped";
  if (sponsor.sponsorBreakStatus === "running") return `Running ${formatHoursMinutes(sponsor.sponsorBreakSecondsRemaining ?? 0)}`;
  const midpointReached = currentMidpointReached(sponsor);
  const twoHourGateReached = currentTwoHourGateReached(sponsor);
  if (!sponsor.broadcastStartedAt || twoHourGateReached === null) return "Pre-show";
  if (midpointReached === true && twoHourGateReached === false) return "Waiting 2h";
  if (midpointReached === false && twoHourGateReached === true) return "Waiting midpoint";
  if (isSponsorDueNowNow(sponsor)) return "Due";
  return "Not due";
}

function buildPressureSummary(snapshot: ReturnType<typeof buildQueueTimingSnapshot>, session: QueueTimingInput["session"] | null) {
  const hasBroadcastStart = Boolean(snapshot.sponsorBreak.broadcastStartedAt);
  const isEnded = session?.broadcastPhase === "ended";
  const showStarted = session?.showStarted === true;
  const mode: "pre_show" | "live" | "ended" | "unknown" = isEnded ? "ended" : (hasBroadcastStart || showStarted) ? "live" : "pre_show";

  if (mode !== "live") {
    const preScore = Math.max(10, Math.min(70, Math.round((snapshot.projectedTotalShowSeconds / snapshot.targetShowSeconds) * 45)));
    const preFactors: string[] = [];
    if (snapshot.projectedTotalShowSeconds > snapshot.targetShowSeconds) preFactors.push("Projected runtime is over the 4h target.");
    if (snapshot.unknownDurationCount > 0) preFactors.push(`${snapshot.unknownDurationCount} tracks still use unknown 5:00 runtime estimates.`);
    if (snapshot.wheelCeremony.wheelSpinsOwedIncluded > 0) preFactors.push(`Wheel spins owed add ${formatHoursMinutes(snapshot.wheelCeremonySecondsIncluded)} ceremony overhead.`);
    return {
      score: preScore,
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
  const projected = snapshot.projectedTotalShowSeconds;
  const projectedRatio = projected / snapshot.targetShowSeconds;
  let score = Math.round(Math.max(0, Math.min(100, projectedRatio * 55)));
  if (projected >= snapshot.warningShowSeconds) {
    score = Math.max(score, 92);
    factors.push("Projected runtime is at/over the 5h warning ceiling.");
  } else if (projected > snapshot.targetShowSeconds) {
    score += 18;
    factors.push("Projected runtime is over the 4h target.");
  } else if (projected < snapshot.targetShowSeconds * 0.82) {
    score -= 10;
    factors.push("Projected runtime is comfortably under the 4h target.");
  }
  const unknownPenalty = Math.min(12, snapshot.unknownDurationCount * 2);
  if (unknownPenalty > 0) factors.push(`${snapshot.unknownDurationCount} tracks still use unknown 5:00 runtime estimates.`);
  score += unknownPenalty;
  if (snapshot.wheelCeremony.wheelSpinsOwedIncluded > 0) {
    score += Math.min(12, snapshot.wheelCeremony.wheelSpinsOwedIncluded * 3);
    factors.push(`Wheel spins owed add ${formatHoursMinutes(snapshot.wheelCeremonySecondsIncluded)} ceremony overhead.`);
  }
  if (!snapshot.sponsorBreak.sponsorBreakAlreadyCompleted) {
    score += snapshot.sponsorBreak.sponsorBreakIncluded ? 8 : 4;
    factors.push("Commercial break is still owed/running and remains in the projection.");
  } else {
    score -= 4;
  }
  if (snapshot.completedPlayableCount >= 4 && snapshot.completedRuntimeSeconds && snapshot.sponsorBreak.broadcastElapsedSeconds) {
    const expectedElapsed = snapshot.completedRuntimeSeconds + (snapshot.sponsorBreak.sponsorBreakStatus === "running" ? snapshot.sponsorBreak.sponsorBreakSecondsIncluded : 0);
    const drift = snapshot.sponsorBreak.broadcastElapsedSeconds - expectedElapsed;
    if (drift > 20 * 60) {
      score += 14;
      factors.push("Pace is slower than expected from completed tracks; transitions may be stretching.");
    } else if (drift < -10 * 60) {
      score -= 6;
      factors.push("Pace is ahead of projected slot timing so far.");
    }
  }
  if (snapshot.removedCount && snapshot.removedCount > 0) {
    score -= Math.min(10, snapshot.removedCount);
    factors.push("Removed/no-show tracks reduced active runtime load.");
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: "low" | "medium" | "high" | "critical" = score >= 85 ? "critical" : score >= 65 ? "high" : score >= 40 ? "medium" : "low";
  const label = level === "critical" ? "CRITICAL" : level === "high" ? "HIGH" : level === "medium" ? "MEDIUM" : "LOW";
  const recommendation = snapshot.sponsorBreak.sponsorBreakStatus === "due"
    ? "Commercial break due. Run it now, then keep transitions tight."
    : level === "critical"
      ? "Keep transitions tight and remove absent artists quickly."
      : level === "high"
        ? "Keep transitions tight."
        : "You are on pace.";
  const description = level === "critical"
    ? "Show is near/over the warning ceiling."
    : level === "high"
      ? "Show is likely to run past target."
      : level === "medium"
        ? "Watch pacing and pending overhead."
        : "Projection is currently manageable.";
  return { score, level, label, description, recommendation, factors, mode: "live" as const, isLive: true };
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
