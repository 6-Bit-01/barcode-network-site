import { getTrackRuntimeSeconds } from "./queue-types";
import type {
  QueueEntry,
  QueueLane,
  QueueSession,
  QueueShowLogEvent,
  QueueSourceType,
  SponsorBreakStatus,
} from "./queue-types";

export const QUEUE_SHOW_REPORT_SCHEMA_VERSION = "barcode_queue_show_report_v1" as const;

export type QueueShowReportCalibrationStatus = "eligible" | "review_required";

export interface QueueShowReportTrackOutcome {
  trackId: string;
  artist: string;
  title: string;
  lane: QueueLane;
  sourceType: QueueSourceType;
  outcome: "finished" | "skipped";
  playedAt: string | null;
  completedAt: string | null;
  modeledMusicSeconds: number;
  directlyObserved: boolean;
  wallClockSlotSeconds: number | null;
  transitionAfterSeconds: number | null;
  earlyCutoff: boolean | null;
  playbackIssueCode: string | null;
  durationIsEstimate: boolean;
}

export interface QueueShowReport {
  schemaVersion: typeof QUEUE_SHOW_REPORT_SCHEMA_VERSION;
  timeline: {
    sessionCreatedAt: string;
    submissionsFirstOpenedAt: string | null;
    submissionsLastClosedAt: string | null;
    submissionWindowSeconds: number | null;
    broadcastStartedAt: string | null;
    broadcastEndedAt: string | null;
    broadcastDurationSeconds: number | null;
    firstPlaybackStartedAt: string | null;
    lastPlaybackEndedAt: string | null;
    playbackWindowSeconds: number | null;
  };
  outcomes: {
    totalSubmitted: number;
    played: number;
    finished: number;
    skipped: number;
    removed: number;
    unplayed: number;
    lateSubmissions: number;
    returnedToQueue: number;
    restored: number;
    spotlight: number;
  };
  pacing: {
    modeledMusicAirtimeSeconds: number;
    directlyObservedMusicAirtimeSeconds: number;
    directlyObservedTrackCount: number;
    fallbackTrackCount: number;
    observedTrackCoveragePercent: number;
    sponsorBreakSeconds: number;
    wheelCeremonySeconds: number;
    unattributedBroadcastSeconds: number | null;
    averageUnattributedSecondsPerPlayedTrack: number | null;
    averageTrackSlotSeconds: number | null;
    medianTrackSlotSeconds: number | null;
    averageTransitionSeconds: number | null;
    medianTransitionSeconds: number | null;
    p90TransitionSeconds: number | null;
    tracksPerBroadcastHour: number | null;
    thirds: Array<{
      phase: "opening" | "middle" | "closing";
      trackCount: number;
      elapsedSeconds: number;
      averageSecondsPerTrack: number;
    }>;
  };
  operations: {
    pauses: number;
    stalls: number;
    resumes: number;
    playbackErrors: number;
    earlyCutoffs: number;
    issueTracks: number;
    sponsor: {
      status: SponsorBreakStatus;
      startedAt: string | null;
      completedAt: string | null;
      durationSeconds: number;
      dueAfterPlayableCount: number | null;
      completedAfterPlayableCount: number | null;
    };
    wheel: {
      launches: number;
      spins: number;
      reencryptions: number;
      rejectedResults: number;
      confirmations: number;
      cancellations: number;
      completedCeremonies: number;
      ceremonySeconds: number;
      averageCeremonySeconds: number | null;
      plannedSpinSeconds: number;
      spinsOwedRemaining: number;
    };
  };
  mix: {
    lanes: Record<QueueLane, number>;
    sources: Record<QueueSourceType, number>;
    exactDurationTracks: number;
    estimatedDurationTracks: number;
    purchasedPriorityTracks: number;
    giftedPriorityTracks: number;
    manualPriorityTracks: number;
  };
  calibration: {
    status: QueueShowReportCalibrationStatus;
    reasons: string[];
  };
  trackOutcomes: QueueShowReportTrackOutcome[];
}

const SOURCE_TYPES: QueueSourceType[] = ["upload", "link", "youtube", "soundcloud", "spotify", "tiktok", "other"];

function isSimulationTrack(entry: QueueEntry | null | undefined): boolean {
  if (!entry) return false;
  return entry.isTestTrack === true
    || entry.note?.includes("[QUEUE SIMULATION TRACK]") === true
    || entry.artist.startsWith("SIM ")
    || entry.title.startsWith("SIM ");
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function secondsBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  const startTime = start ? Date.parse(start) : Number.NaN;
  const endTime = end ? Date.parse(end) : Number.NaN;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
  return Math.round((endTime - startTime) / 1000);
}

function timestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function rounded(value: number): number {
  return Math.max(0, Math.round(value));
}

function average(values: number[]): number | null {
  return values.length > 0 ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return rounded(sorted[index] ?? 0);
}

function uniqueRealEntries(session: QueueSession): QueueEntry[] {
  const entries = [
    ...(session.loadedTrack ? [session.loadedTrack] : []),
    ...(session.nextInLineTrack ? [session.nextInLineTrack] : []),
    ...session.queue,
    ...session.completed,
    ...session.removed,
  ];
  const unique = new Map<string, QueueEntry>();
  for (const entry of entries) {
    if (!isSimulationTrack(entry)) unique.set(entry.id, entry);
  }
  return [...unique.values()];
}

function sortedEvents(events: QueueShowLogEvent[]): QueueShowLogEvent[] {
  return [...events].sort((left, right) => left.sequence - right.sequence);
}

function eventCount(events: QueueShowLogEvent[], eventType: QueueShowLogEvent["eventType"]): number {
  return events.filter((event) => event.eventType === eventType).length;
}

function firstEventAt(events: QueueShowLogEvent[], eventType: QueueShowLogEvent["eventType"]): string | null {
  return events.find((event) => event.eventType === eventType)?.occurredAt ?? null;
}

function lastEventAt(events: QueueShowLogEvent[], eventType: QueueShowLogEvent["eventType"]): string | null {
  return [...events].reverse().find((event) => event.eventType === eventType)?.occurredAt ?? null;
}

function submissionWindowSeconds(events: QueueShowLogEvent[], fallbackEnd: string | null): number | null {
  let openedAt: string | null = null;
  let total = 0;
  let sawWindow = false;
  for (const event of events) {
    if (event.eventType === "submissions_opened" && !openedAt) {
      openedAt = event.occurredAt;
      sawWindow = true;
    } else if (event.eventType === "submissions_closed" && openedAt) {
      total += secondsBetween(openedAt, event.occurredAt) ?? 0;
      openedAt = null;
    }
  }
  if (openedAt && fallbackEnd) total += secondsBetween(openedAt, fallbackEnd) ?? 0;
  return sawWindow ? total : null;
}

function modeledMusic(entry: QueueEntry): { seconds: number; observedSeconds: number; directlyObserved: boolean } {
  const scheduled = getTrackRuntimeSeconds(entry);
  const observedDuration = typeof entry.playbackObservedDurationSeconds === "number" && Number.isFinite(entry.playbackObservedDurationSeconds)
    ? Math.max(0, entry.playbackObservedDurationSeconds)
    : null;
  const observedPosition = typeof entry.playbackEndPositionSeconds === "number" && Number.isFinite(entry.playbackEndPositionSeconds)
    ? Math.max(0, entry.playbackEndPositionSeconds)
    : null;
  if (observedPosition !== null) {
    const seconds = observedDuration === null ? observedPosition : Math.min(observedPosition, observedDuration);
    return { seconds, observedSeconds: seconds, directlyObserved: true };
  }
  if (entry.playbackEndedNaturally === true && observedDuration !== null) {
    return { seconds: observedDuration, observedSeconds: observedDuration, directlyObserved: true };
  }
  return { seconds: scheduled, observedSeconds: 0, directlyObserved: false };
}

interface TimedInterval {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

function wheelCeremonies(events: QueueShowLogEvent[]): TimedInterval[] {
  const ceremonies: TimedInterval[] = [];
  let launchedAt: string | null = null;
  for (const event of events) {
    if (event.eventType === "wheel_launched") {
      launchedAt = event.occurredAt;
      continue;
    }
    if (!launchedAt || (event.eventType !== "wheel_confirmed" && event.eventType !== "wheel_cancelled")) continue;
    const duration = secondsBetween(launchedAt, event.occurredAt);
    if (duration !== null) ceremonies.push({ startedAt: launchedAt, endedAt: event.occurredAt, durationSeconds: duration });
    launchedAt = null;
  }
  return ceremonies;
}

function intervalOverlapSeconds(start: string, end: string, intervals: TimedInterval[]): number {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return 0;
  return intervals.reduce((total, interval) => {
    const overlapStart = Math.max(startTime, Date.parse(interval.startedAt));
    const overlapEnd = Math.min(endTime, Date.parse(interval.endedAt));
    return total + Math.max(0, Math.round((overlapEnd - overlapStart) / 1000));
  }, 0);
}

function trackEventPairs(events: QueueShowLogEvent[], operationalIntervals: TimedInterval[]): Map<string, {
  startedAt: string;
  endedAt: string | null;
  wallClockSeconds: number | null;
  transitionAfterSeconds: number | null;
}> {
  const starts = events.filter((event) => event.eventType === "track_play_started" && event.track);
  const outcomes = events.filter((event) => (event.eventType === "track_finished" || event.eventType === "track_skipped") && event.track);
  const result = new Map<string, { startedAt: string; endedAt: string | null; wallClockSeconds: number | null; transitionAfterSeconds: number | null }>();
  starts.forEach((start, index) => {
    const endedAt = outcomes.find((event) => event.track?.trackId === start.track?.trackId && Date.parse(event.occurredAt) >= Date.parse(start.occurredAt))?.occurredAt ?? null;
    const nextStartedAt = starts[index + 1]?.occurredAt ?? null;
    const rawTransitionSeconds = endedAt && nextStartedAt ? secondsBetween(endedAt, nextStartedAt) : null;
    result.set(start.track!.trackId, {
      startedAt: start.occurredAt,
      endedAt,
      wallClockSeconds: secondsBetween(start.occurredAt, endedAt),
      transitionAfterSeconds: rawTransitionSeconds === null || !endedAt || !nextStartedAt
        ? null
        : Math.max(0, rawTransitionSeconds - intervalOverlapSeconds(endedAt, nextStartedAt, operationalIntervals)),
    });
  });
  return result;
}

function paceThirds(broadcastStartedAt: string | null, trackOutcomes: QueueShowReportTrackOutcome[]): QueueShowReport["pacing"]["thirds"] {
  const phases = ["opening", "middle", "closing"] as const;
  const completed = trackOutcomes.filter((track) => track.completedAt).sort((left, right) => Date.parse(left.completedAt!) - Date.parse(right.completedAt!));
  if (completed.length === 0) return [];
  const groups = phases.map((phase) => ({ phase, entries: [] as QueueShowReportTrackOutcome[] }));
  completed.forEach((track, index) => groups[Math.min(2, Math.floor(index * 3 / completed.length))].entries.push(track));
  let priorBoundary = broadcastStartedAt ?? completed[0]?.playedAt ?? completed[0]?.completedAt ?? null;
  return groups.flatMap((group) => {
    if (group.entries.length === 0) return [];
    const end = group.entries.at(-1)?.completedAt ?? null;
    const elapsedSeconds = secondsBetween(priorBoundary, end) ?? 0;
    priorBoundary = end;
    return [{
      phase: group.phase,
      trackCount: group.entries.length,
      elapsedSeconds,
      averageSecondsPerTrack: rounded(elapsedSeconds / group.entries.length),
    }];
  });
}

export function buildQueueShowReport(session: QueueSession, inputEvents: QueueShowLogEvent[]): QueueShowReport {
  const events = sortedEvents(inputEvents);
  const entries = uniqueRealEntries(session);
  const completedIds = new Set(session.completed.filter((entry) => !isSimulationTrack(entry)).map((entry) => entry.id));
  const removedIds = new Set(session.removed.filter((entry) => !isSimulationTrack(entry)).map((entry) => entry.id));
  const completed = entries.filter((entry) => completedIds.has(entry.id) && !removedIds.has(entry.id));
  const removed = entries.filter((entry) => removedIds.has(entry.id));
  const active = entries.filter((entry) => !completedIds.has(entry.id) && !removedIds.has(entry.id));
  const broadcastStartedAt = iso(session.broadcastStartedAt) ?? firstEventAt(events, "broadcast_started");
  const broadcastEndedAt = lastEventAt(events, "session_archived") ?? (session.status === "archived" ? iso(session.updatedAt) : null);
  const firstPlaybackStartedAt = firstEventAt(events, "track_play_started");
  const lastPlaybackEndedAt = [...events].reverse().find((event) => event.eventType === "track_finished" || event.eventType === "track_skipped")?.occurredAt ?? null;
  const sponsorBreakSeconds = secondsBetween(session.sponsorBreakStartedAt, session.sponsorBreakCompletedAt) ?? 0;
  const sponsorInterval = sponsorBreakSeconds > 0 && session.sponsorBreakStartedAt && session.sponsorBreakCompletedAt
    ? [{ startedAt: session.sponsorBreakStartedAt, endedAt: session.sponsorBreakCompletedAt, durationSeconds: sponsorBreakSeconds }]
    : [];
  const ceremonies = wheelCeremonies(events);
  const eventPairs = trackEventPairs(events, [...sponsorInterval, ...ceremonies]);

  const trackOutcomes: QueueShowReportTrackOutcome[] = completed
    .map((entry) => {
      const music = modeledMusic(entry);
      const pair = eventPairs.get(entry.id);
      return {
        trackId: entry.id,
        artist: entry.submittedArtistName ?? entry.artist,
        title: entry.submittedSongTitle ?? entry.title,
        lane: entry.lane ?? "regular",
        sourceType: entry.sourceType ?? "other",
        outcome: entry.playbackOutcome === "skipped" ? "skipped" : "finished",
        playedAt: pair?.startedAt ?? iso(entry.playedAt),
        completedAt: pair?.endedAt ?? iso(entry.completedAt),
        modeledMusicSeconds: rounded(music.seconds),
        directlyObserved: music.directlyObserved,
        wallClockSlotSeconds: pair?.wallClockSeconds ?? null,
        transitionAfterSeconds: pair?.transitionAfterSeconds ?? null,
        earlyCutoff: typeof entry.playbackEarlyCutoff === "boolean" ? entry.playbackEarlyCutoff : null,
        playbackIssueCode: entry.playbackIssueCode ?? null,
        durationIsEstimate: entry.durationIsEstimate === true,
      } satisfies QueueShowReportTrackOutcome;
    })
    .sort((left, right) => timestamp(left.playedAt ?? left.completedAt) - timestamp(right.playedAt ?? right.completedAt));

  const modeledMusicAirtimeSeconds = trackOutcomes.reduce((sum, track) => sum + track.modeledMusicSeconds, 0);
  const directlyObservedMusicAirtimeSeconds = trackOutcomes.filter((track) => track.directlyObserved).reduce((sum, track) => sum + track.modeledMusicSeconds, 0);
  const directlyObservedTrackCount = trackOutcomes.filter((track) => track.directlyObserved).length;
  const fallbackTrackCount = trackOutcomes.length - directlyObservedTrackCount;
  const observedTrackCoveragePercent = trackOutcomes.length > 0 ? rounded(directlyObservedTrackCount / trackOutcomes.length * 100) : 0;
  const ceremonyDurations = ceremonies.map((ceremony) => ceremony.durationSeconds);
  const wheelCeremonySeconds = ceremonyDurations.reduce((sum, value) => sum + value, 0);
  const broadcastDurationSeconds = secondsBetween(broadcastStartedAt, broadcastEndedAt);
  const unattributedBroadcastSeconds = broadcastDurationSeconds === null
    ? null
    : Math.max(0, broadcastDurationSeconds - modeledMusicAirtimeSeconds - sponsorBreakSeconds - wheelCeremonySeconds);
  const trackSlots = trackOutcomes.map((track) => track.wallClockSlotSeconds).filter((value): value is number => value !== null);
  const transitions = trackOutcomes.map((track) => track.transitionAfterSeconds).filter((value): value is number => value !== null);
  const laneCounts: Record<QueueLane, number> = { priority: 0, wheel: 0, regular: 0 };
  const sourceCounts = Object.fromEntries(SOURCE_TYPES.map((source) => [source, 0])) as Record<QueueSourceType, number>;
  for (const entry of entries) {
    laneCounts[entry.lane ?? "regular"] += 1;
    sourceCounts[entry.sourceType ?? "other"] += 1;
  }
  const lateSubmissions = broadcastStartedAt
    ? events.filter((event) => event.eventType === "track_submitted" && Date.parse(event.occurredAt) >= Date.parse(broadcastStartedAt)).length
    : 0;
  const wheel = {
    launches: eventCount(events, "wheel_launched"),
    spins: eventCount(events, "wheel_spun"),
    reencryptions: eventCount(events, "wheel_reencrypted"),
    rejectedResults: eventCount(events, "wheel_result_rejected"),
    confirmations: eventCount(events, "wheel_confirmed"),
    cancellations: eventCount(events, "wheel_cancelled"),
    completedCeremonies: ceremonyDurations.length,
    ceremonySeconds: wheelCeremonySeconds,
    averageCeremonySeconds: average(ceremonyDurations),
    plannedSpinSeconds: rounded(events.filter((event) => event.eventType === "wheel_spun").reduce((sum, event) => sum + ((event.details?.wheelSpinDurationMs ?? 0) / 1000), 0)),
    spinsOwedRemaining: Math.max(0, Math.floor(session.wheelSpinsOwed ?? 0)),
  };

  const calibrationReasons: string[] = [];
  if (session.status !== "archived") calibrationReasons.push("The show is not archived yet.");
  if (broadcastDurationSeconds === null) calibrationReasons.push("Broadcast start/end timestamps are incomplete.");
  if (trackOutcomes.length < 5) calibrationReasons.push("Fewer than five played tracks makes the pacing sample too small.");
  if (fallbackTrackCount > 0) calibrationReasons.push(`${fallbackTrackCount} played track${fallbackTrackCount === 1 ? " lacks" : "s lack"} direct playback-position timing.`);
  const missingTrackSlots = trackOutcomes.length - trackSlots.length;
  if (missingTrackSlots > 0) calibrationReasons.push(`${missingTrackSlots} played track${missingTrackSlots === 1 ? " lacks" : "s lack"} complete playback start/end event timing.`);
  const missingTransitions = Math.max(0, trackOutcomes.length - 1 - transitions.length);
  if (missingTransitions > 0) calibrationReasons.push(`${missingTransitions} between-track transition${missingTransitions === 1 ? " is" : "s are"} missing event timing.`);
  if (laneCounts.wheel > 0 && wheel.confirmations === 0) calibrationReasons.push("Wheel-selected tracks exist, but Wheel ceremony telemetry is missing.");
  if ((session.sponsorBreakStatus === "completed" || session.sponsorBreakStatus === "skipped") && !session.sponsorBreakCompletedAt) calibrationReasons.push("Sponsor-break completion timing is incomplete.");
  const interruptionCount = eventCount(events, "track_stalled") + eventCount(events, "track_playback_error");
  if (interruptionCount > 0) calibrationReasons.push("Playback stalls or errors require review before using this show as a timing baseline.");
  const calibrationStatus: QueueShowReportCalibrationStatus = calibrationReasons.length > 0 ? "review_required" : "eligible";

  return {
    schemaVersion: QUEUE_SHOW_REPORT_SCHEMA_VERSION,
    timeline: {
      sessionCreatedAt: session.createdAt,
      submissionsFirstOpenedAt: firstEventAt(events, "submissions_opened"),
      submissionsLastClosedAt: lastEventAt(events, "submissions_closed"),
      submissionWindowSeconds: submissionWindowSeconds(events, broadcastEndedAt),
      broadcastStartedAt,
      broadcastEndedAt,
      broadcastDurationSeconds,
      firstPlaybackStartedAt,
      lastPlaybackEndedAt,
      playbackWindowSeconds: secondsBetween(firstPlaybackStartedAt, lastPlaybackEndedAt),
    },
    outcomes: {
      totalSubmitted: entries.length,
      played: completed.length,
      finished: trackOutcomes.filter((track) => track.outcome === "finished").length,
      skipped: trackOutcomes.filter((track) => track.outcome === "skipped").length,
      removed: removed.length,
      unplayed: active.length,
      lateSubmissions,
      returnedToQueue: eventCount(events, "track_returned"),
      restored: eventCount(events, "track_restored"),
      spotlight: new Set(session.spotlight.filter((entry) => !isSimulationTrack(entry)).map((entry) => entry.id)).size,
    },
    pacing: {
      modeledMusicAirtimeSeconds,
      directlyObservedMusicAirtimeSeconds,
      directlyObservedTrackCount,
      fallbackTrackCount,
      observedTrackCoveragePercent,
      sponsorBreakSeconds,
      wheelCeremonySeconds,
      unattributedBroadcastSeconds,
      averageUnattributedSecondsPerPlayedTrack: unattributedBroadcastSeconds !== null && completed.length > 0 ? rounded(unattributedBroadcastSeconds / completed.length) : null,
      averageTrackSlotSeconds: average(trackSlots),
      medianTrackSlotSeconds: percentile(trackSlots, 0.5),
      averageTransitionSeconds: average(transitions),
      medianTransitionSeconds: percentile(transitions, 0.5),
      p90TransitionSeconds: percentile(transitions, 0.9),
      tracksPerBroadcastHour: broadcastDurationSeconds && broadcastDurationSeconds > 0 ? Math.round(trackOutcomes.length * 3600 / broadcastDurationSeconds * 10) / 10 : null,
      thirds: paceThirds(broadcastStartedAt, trackOutcomes),
    },
    operations: {
      pauses: eventCount(events, "track_paused"),
      stalls: eventCount(events, "track_stalled"),
      resumes: eventCount(events, "track_resumed"),
      playbackErrors: eventCount(events, "track_playback_error"),
      earlyCutoffs: trackOutcomes.filter((track) => track.earlyCutoff === true).length,
      issueTracks: trackOutcomes.filter((track) => Boolean(track.playbackIssueCode)).length,
      sponsor: {
        status: session.sponsorBreakStatus ?? "not_due",
        startedAt: iso(session.sponsorBreakStartedAt),
        completedAt: iso(session.sponsorBreakCompletedAt),
        durationSeconds: sponsorBreakSeconds,
        dueAfterPlayableCount: session.sponsorBreakDueAfterPlayableCount ?? null,
        completedAfterPlayableCount: session.sponsorBreakCompletedAfterPlayableCount ?? null,
      },
      wheel,
    },
    mix: {
      lanes: laneCounts,
      sources: sourceCounts,
      exactDurationTracks: entries.filter((entry) => entry.durationIsEstimate !== true).length,
      estimatedDurationTracks: entries.filter((entry) => entry.durationIsEstimate === true).length,
      purchasedPriorityTracks: entries.filter((entry) => entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "paid_needs_attention").length,
      giftedPriorityTracks: entries.filter((entry) => Boolean(entry.priorityGiftAttribution) && (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "paid_needs_attention")).length,
      manualPriorityTracks: entries.filter((entry) => (entry.lane ?? "regular") === "priority" && entry.priorityUpgradeStatus === "manual").length,
    },
    calibration: {
      status: calibrationStatus,
      reasons: calibrationReasons,
    },
    trackOutcomes,
  };
}
