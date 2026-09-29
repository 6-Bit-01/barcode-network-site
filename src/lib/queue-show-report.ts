import { getTrackRuntimeSeconds } from "./queue-types";
import { normalizeQueuePlaybackDiagnostics } from "./queue-playback-lifecycle";
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
  finalStatus: QueueEntry["status"];
  loadedAt: string | null;
  playedAt: string | null;
  completedAt: string | null;
  modeledMusicSeconds: number;
  directlyObserved: boolean;
  wallClockSlotSeconds: number | null;
  transitionAfterSeconds: number | null;
  nextLoadAfterSeconds: number | null;
  earlyCutoff: boolean | null;
  playbackIssueCode: string | null;
  durationIsEstimate: boolean;
}

export interface QueueShowReportWheelSpinTiming {
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
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
    completedAtClose: number;
    finishActions: number;
    skipActions: number;
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
    signalHold: {
      activations: number;
      needsAttention: number;
      applications: number;
      fulfilled: number;
      expired: number;
    };
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
      spinTimings: QueueShowReportWheelSpinTiming[];
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
  unfinishedPlayback: Array<{
    trackId: string;
    artist: string;
    title: string;
    finalStatus: QueueEntry["status"];
    naturallyEndedAt: string;
  }>;
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

function modeledMusic(entry: QueueEntry, useStoredPlayback: boolean): { seconds: number; observedSeconds: number; directlyObserved: boolean } {
  const scheduled = getTrackRuntimeSeconds(entry);
  if (!useStoredPlayback) return { seconds: scheduled, observedSeconds: 0, directlyObserved: false };
  const observedDuration = typeof entry.playbackObservedDurationSeconds === "number" && Number.isFinite(entry.playbackObservedDurationSeconds)
    ? Math.max(0, entry.playbackObservedDurationSeconds)
    : null;
  const observedPosition = typeof entry.playbackEndPositionSeconds === "number" && Number.isFinite(entry.playbackEndPositionSeconds)
    ? Math.max(0, entry.playbackEndPositionSeconds)
    : null;
  const observedAt = iso(entry.playbackEndPositionObservedAt);
  if (observedPosition !== null && observedAt !== null) {
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

function clipIntervalsToWindow(intervals: TimedInterval[], startedAt: string | null, endedAt: string | null): TimedInterval[] {
  const windowStart = startedAt ? Date.parse(startedAt) : Number.NaN;
  const windowEnd = endedAt ? Date.parse(endedAt) : Number.NaN;
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd < windowStart) return intervals;
  return intervals.flatMap((interval) => {
    const intervalStart = Date.parse(interval.startedAt);
    const intervalEnd = Date.parse(interval.endedAt);
    if (!Number.isFinite(intervalStart) || !Number.isFinite(intervalEnd)) return [];
    const clippedStart = Math.max(windowStart, intervalStart);
    const clippedEnd = Math.min(windowEnd, intervalEnd);
    if (clippedEnd <= clippedStart) return [];
    return [{
      startedAt: new Date(clippedStart).toISOString(),
      endedAt: new Date(clippedEnd).toISOString(),
      durationSeconds: Math.round((clippedEnd - clippedStart) / 1_000),
    }];
  });
}

function wheelSpinTimings(events: QueueShowLogEvent[]): QueueShowReportWheelSpinTiming[] {
  return events
    .filter((event) => event.eventType === "wheel_spun")
    .map((event) => {
      const startedAtMs = Date.parse(event.occurredAt);
      const durationMs = event.details?.wheelSpinDurationMs;
      if (!Number.isFinite(startedAtMs) || typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
        return { startedAt: event.occurredAt, endedAt: null, durationSeconds: null };
      }
      return {
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date(startedAtMs + durationMs).toISOString(),
        durationSeconds: rounded(durationMs / 1_000),
      };
    });
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

interface TrackAttempt {
  trackId: string;
  loaded: QueueShowLogEvent | null;
  started: QueueShowLogEvent | null;
  outcome: QueueShowLogEvent | null;
  closed: boolean;
}

function continuousEventsBetween(events: QueueShowLogEvent[], first: QueueShowLogEvent, last: QueueShowLogEvent): boolean {
  const range = events.filter((event) => event.sequence >= first.sequence && event.sequence <= last.sequence);
  return range.length === last.sequence - first.sequence + 1;
}

function trackEventPairs(events: QueueShowLogEvent[], operationalIntervals: TimedInterval[]) {
  const attempts: TrackAttempt[] = [];
  let current: TrackAttempt | null = null;
  for (const event of events) {
    const trackId = event.track?.trackId;
    if (event.eventType === "session_archived") {
      if (current) current.closed = true;
      current = null;
    }
    if (!trackId) continue;
    const loaded = event.eventType === "track_loaded";
    const started = event.eventType === "track_play_started";
    const completed = event.eventType === "track_finished" || event.eventType === "track_skipped";
    if (loaded || started || completed) {
      // Every load (including an external player or a reload of the same song)
      // bounds the next attempt. A later play receipt cannot skip over it.
      if (loaded || !current || current.trackId !== trackId || current.closed) {
        current = { trackId, loaded: null, started: null, outcome: null, closed: false };
        attempts.push(current);
      }
      if (loaded) current.loaded = event;
      if (started && !current.started) current.started = event;
      if (completed) {
        current.outcome = event;
        current.closed = true;
      }
    } else if (current?.trackId === trackId && (event.eventType === "track_returned" || event.eventType === "track_removed" || event.eventType === "track_restored")) {
      current.closed = true;
      current = null;
    }
  }

  const result = new Map<string, {
    loadedAt: string | null;
    startedAt: string | null;
    endedAt: string | null;
    outcome: "finished" | "skipped";
    wallClockSeconds: number | null;
    transitionAfterSeconds: number | null;
    nextLoadAfterSeconds: number | null;
  }>();
  attempts.forEach((attempt, index) => {
    const end = attempt.outcome;
    if (!end) return;
    const next = attempts[index + 1];
    const nextStart = next?.started;
    const nextLoad = next?.loaded;
    const rawTransitionSeconds = nextStart && continuousEventsBetween(events, end, nextStart)
      ? secondsBetween(end.occurredAt, nextStart.occurredAt) : null;
    // One row per song, using its latest completed attempt. A later unfinished
    // attempt never overwrites or lends timing to that historical outcome.
    result.set(attempt.trackId, {
      loadedAt: iso(attempt.loaded?.occurredAt),
      startedAt: iso(attempt.started?.occurredAt),
      endedAt: iso(end.occurredAt),
      outcome: end.eventType === "track_skipped" ? "skipped" : "finished",
      wallClockSeconds: attempt.started && continuousEventsBetween(events, attempt.started, end)
        ? secondsBetween(attempt.started.occurredAt, end.occurredAt) : null,
      transitionAfterSeconds: rawTransitionSeconds === null || !nextStart
        ? null
        : Math.max(0, rawTransitionSeconds - intervalOverlapSeconds(end.occurredAt, nextStart.occurredAt, operationalIntervals)),
      nextLoadAfterSeconds: nextLoad && continuousEventsBetween(events, end, nextLoad)
        ? secondsBetween(end.occurredAt, nextLoad.occurredAt) : null,
    });
  });
  return result;
}

function unfinishedNaturalEnds(session: QueueSession, active: QueueEntry[], events: QueueShowLogEvent[]): QueueShowReport["unfinishedPlayback"] {
  const diagnostics = normalizeQueuePlaybackDiagnostics(session.playbackDiagnostics);
  return active.flatMap((entry) => {
    const trackEvents = diagnostics.events.filter((event) => event.trackId === entry.id);
    const latest = trackEvents.at(-1);
    const naturalEnd = trackEvents.findLast((event) => event.eventType === "ended");
    // A final seek receipt can preserve the ended state (September 25). Keep
    // the actual natural-end timestamp rather than mistaking that seek for play.
    if (latest?.lifecycleState !== "ended" || !naturalEnd) return [];
    const endedAt = Date.parse(naturalEnd.observedAt);
    // A restore/reload after an older natural end invalidates that receipt for
    // the current attempt, even if the bounded player log lost its reset event.
    const resetAfterEnd = events.some((event) => event.track?.trackId === entry.id
      && ["track_loaded", "track_returned", "track_restored", "track_finished", "track_skipped", "track_removed"].includes(event.eventType)
      && Date.parse(event.occurredAt) > endedAt);
    if (resetAfterEnd || (entry.playedAt && Date.parse(entry.playedAt) > endedAt)) return [];
    return [{
      trackId: entry.id,
      artist: entry.submittedArtistName ?? entry.artist,
      title: entry.submittedSongTitle ?? entry.title,
      finalStatus: entry.status,
      naturallyEndedAt: naturalEnd.observedAt,
    }];
  });
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
  const ceremonies = clipIntervalsToWindow(wheelCeremonies(events), broadcastStartedAt, broadcastEndedAt);
  const spinTimings = wheelSpinTimings(events);
  const eventPairs = trackEventPairs(events, [...sponsorInterval, ...ceremonies]);
  const completed = entries.filter((entry) => eventPairs.has(entry.id) || (completedIds.has(entry.id) && !removedIds.has(entry.id)));
  const historicalCompletedIds = new Set(completed.map((entry) => entry.id));
  const unfinishedPlayback = unfinishedNaturalEnds(session, active, events);
  const realIds = new Set(entries.map((entry) => entry.id));
  const completionEvents = events.filter((event) => event.track && realIds.has(event.track.trackId)
    && (event.eventType === "track_finished" || event.eventType === "track_skipped"));

  const trackOutcomes: QueueShowReportTrackOutcome[] = completed
    .map((entry) => {
      const pair = eventPairs.get(entry.id);
      const storedOutcomeMatches = (entry.playbackOutcome === "finished" || entry.playbackOutcome === "skipped")
        && (!pair || (iso(entry.completedAt) === pair.endedAt && entry.playbackOutcome === pair.outcome));
      const music = modeledMusic(entry, storedOutcomeMatches);
      return {
        trackId: entry.id,
        artist: entry.submittedArtistName ?? entry.artist,
        title: entry.submittedSongTitle ?? entry.title,
        lane: entry.lane ?? "regular",
        sourceType: entry.sourceType ?? "other",
        outcome: pair?.outcome ?? (entry.playbackOutcome === "skipped" ? "skipped" : "finished"),
        finalStatus: entry.status,
        loadedAt: pair?.loadedAt ?? (storedOutcomeMatches ? iso(entry.playedAt) : null),
        playedAt: pair?.startedAt ?? null,
        completedAt: pair?.endedAt ?? iso(entry.completedAt),
        modeledMusicSeconds: rounded(music.seconds),
        directlyObserved: music.directlyObserved,
        wallClockSlotSeconds: pair?.wallClockSeconds ?? null,
        transitionAfterSeconds: pair?.transitionAfterSeconds ?? null,
        nextLoadAfterSeconds: pair?.nextLoadAfterSeconds ?? null,
        earlyCutoff: storedOutcomeMatches && typeof entry.playbackEarlyCutoff === "boolean" ? entry.playbackEarlyCutoff : null,
        playbackIssueCode: storedOutcomeMatches ? entry.playbackIssueCode ?? null : null,
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
    plannedSpinSeconds: rounded(events.filter((event) => event.eventType === "wheel_spun").reduce((sum, event) => sum + ((event.details?.wheelSpinDurationMs ?? 0) / 1_000), 0)),
    spinTimings,
    spinsOwedRemaining: Math.max(0, Math.floor(session.wheelSpinsOwed ?? 0)),
  };

  const calibrationReasons: string[] = [];
  if (events[0]?.sequence > 1 || events.some((event, index) => index > 0 && event.sequence !== events[index - 1].sequence + 1)) calibrationReasons.push("The retained Show Log is incomplete; missing events cannot establish playback or transition timing.");
  if (unfinishedPlayback.length > 0) calibrationReasons.push(`${unfinishedPlayback.length} track${unfinishedPlayback.length === 1 ? " has" : "s have"} a natural playback end without a Finish or Skip action; final queue status is unchanged.`);
  if (completionEvents.length > new Set(completionEvents.map((event) => event.track!.trackId)).size) calibrationReasons.push("Repeated Finish / Skip actions exist; per-track timing uses each song's latest completed attempt, not total replay airtime.");
  if (session.status !== "archived") calibrationReasons.push("The show is not archived yet.");
  if (broadcastDurationSeconds === null) calibrationReasons.push("Broadcast start/end timestamps are incomplete.");
  if (trackOutcomes.length < 5) calibrationReasons.push("Fewer than five played tracks makes the pacing sample too small.");
  if (fallbackTrackCount > 0) calibrationReasons.push(`${fallbackTrackCount} played track${fallbackTrackCount === 1 ? " lacks" : "s lack"} direct playback-position timing.`);
  const missingTrackSlots = trackOutcomes.length - trackSlots.length;
  if (missingTrackSlots > 0) calibrationReasons.push(`${missingTrackSlots} played track${missingTrackSlots === 1 ? " lacks" : "s lack"} complete playback start/end event timing.`);
  const missingTransitions = Math.max(0, trackOutcomes.length - 1 - transitions.length);
  if (missingTransitions > 0) calibrationReasons.push(`${missingTransitions} between-track transition${missingTransitions === 1 ? " is" : "s are"} missing event timing.`);
  if (laneCounts.wheel > 0 && wheel.confirmations === 0) calibrationReasons.push("Wheel-selected tracks exist, but Wheel ceremony telemetry is missing.");
  const missingSpinEndTimings = spinTimings.filter((timing) => timing.endedAt === null).length;
  if (missingSpinEndTimings > 0) calibrationReasons.push(`${missingSpinEndTimings} Wheel spin${missingSpinEndTimings === 1 ? " is" : "s are"} missing start-to-end timing.`);
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
      unplayed: active.filter((entry) => !historicalCompletedIds.has(entry.id)).length,
      lateSubmissions,
      returnedToQueue: eventCount(events, "track_returned"),
      restored: eventCount(events, "track_restored"),
      spotlight: new Set(session.spotlight.filter((entry) => !isSimulationTrack(entry)).map((entry) => entry.id)).size,
      completedAtClose: entries.filter((entry) => completedIds.has(entry.id) && !removedIds.has(entry.id)).length,
      finishActions: eventCount(completionEvents, "track_finished"),
      skipActions: eventCount(completionEvents, "track_skipped"),
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
      signalHold: {
        activations: eventCount(events, "track_signal_hold_activated"),
        needsAttention: eventCount(events, "track_signal_hold_needs_attention"),
        applications: eventCount(events, "track_signal_hold_applied"),
        fulfilled: eventCount(events, "track_signal_hold_fulfilled"),
        expired: eventCount(events, "track_signal_hold_expired"),
      },
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
    unfinishedPlayback,
  };
}
