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
  };
  wheelTimingSummary: {
    owed: number;
    overheadSeconds: number;
    overheadLabel: string;
    included: boolean;
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
  };
}

export function buildQueueTimingDisplay(input: QueueTimingInput, options: { priorityEligible?: boolean; personalTrackId?: string | null } = {}): QueueTimingDisplaySummary {
  const snapshot = buildQueueTimingSnapshot(input);
  const free = estimateNewSubmissionTiming(input);
  const priorityImpact = options.priorityEligible === false ? null : estimatePriorityImpact(input);
  const priorityEstimate = priorityImpact?.priorityEligible ? displayEstimate(priorityImpact.priorityEstimate as NewSubmissionTimingEstimate | ExistingTrackTimingEstimate) : null;
  const publicNotes = publicNotesFor(free.sponsorBreakIncluded, free.wheelCeremonySecondsIncluded > 0);

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
    },
    wheelTimingSummary: {
      owed: snapshot.wheelCeremony.wheelSpinsOwedIncluded,
      overheadSeconds: snapshot.wheelCeremonySecondsIncluded,
      overheadLabel: formatHoursMinutes(snapshot.wheelCeremonySecondsIncluded),
      included: snapshot.wheelCeremonySecondsIncluded > 0,
    },
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
  if (sponsorIncluded) notes.push("Estimate includes the mid-show sponsor break.");
  if (wheelIncluded) notes.push("Wheel spins waiting may add time.");
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

export function sponsorDiagnosticLabel(sponsor: { sponsorBreakStatus?: string | null; midpointReached?: boolean | null; minElapsedGateReached?: boolean | null; secondsUntilMinElapsedGate?: number | null; sponsorBreakIncluded?: boolean | null; broadcastStartedAt?: string | null }): string {
  if (sponsor.sponsorBreakStatus === "completed") return "Completed";
  if (sponsor.sponsorBreakStatus === "skipped") return "Skipped";
  if (sponsor.sponsorBreakStatus === "running") return "Running";
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
