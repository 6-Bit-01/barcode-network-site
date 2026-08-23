import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const resolved = path.join(projectRoot, "src", request.slice(2));
    if (fs.existsSync(resolved)) return resolved;
    if (fs.existsSync(`${resolved}.ts`)) return `${resolved}.ts`;
    if (fs.existsSync(`${resolved}.tsx`)) return `${resolved}.tsx`;
    return resolved;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const { buildQueueShowReport } = require("../src/lib/queue-show-report.ts");
const baseTime = Date.parse("2026-08-21T20:00:00.000Z");
const at = (minute, second = 0) => new Date(baseTime + ((minute * 60) + second) * 1_000).toISOString();

function track(id, playedMinute, completedMinute, options = {}) {
  const completed = playedMinute !== null && completedMinute !== null;
  return {
    id,
    artist: `${id} private artist fallback`,
    title: `${id} private title fallback`,
    submittedArtistName: `${id} Artist`,
    submittedSongTitle: `${id} Song`,
    link: options.privateLink ?? `https://private.example.test/${id}`,
    tier: "free",
    lane: options.lane ?? "regular",
    amount: 0,
    stripeSessionId: options.privatePaymentId ?? null,
    status: completed ? "completed" : options.status ?? "queued",
    createdAt: options.createdAt ?? at(-4),
    playedAt: completed ? at(playedMinute) : null,
    completedAt: completed ? at(completedMinute) : null,
    removedAt: options.removedAt ?? null,
    playbackOutcome: completed ? options.outcome ?? "finished" : null,
    playbackEndedNaturally: completed,
    playbackEarlyCutoff: completed ? false : null,
    playbackEndPositionSeconds: completed ? 180 : null,
    playbackObservedDurationSeconds: completed ? 180 : null,
    playbackIssueCode: null,
    sourceType: options.sourceType ?? "upload",
    detectedDurationSeconds: 180,
    estimatedDurationSeconds: 300,
    durationIsEstimate: false,
    priorityUpgradeStatus: options.priorityUpgradeStatus ?? "none",
    contactEmail: options.privateEmail ?? null,
    submitterToken: options.privateToken ?? null,
  };
}

function publicTrack(entry) {
  return {
    trackId: entry.id,
    artist: entry.submittedArtistName,
    title: entry.submittedSongTitle,
    tiktokHandle: "",
    sourceType: entry.sourceType,
    publicSourceUrl: null,
    submissionOrder: null,
    playedOrder: null,
  };
}

function fixture() {
  const completed = [
    track("track-1", 0, 3),
    track("track-2", 4, 7, { lane: "priority", sourceType: "youtube" }),
    track("track-3", 8, 11, { sourceType: "soundcloud" }),
    track("track-4", 17, 20, { lane: "wheel", sourceType: "spotify" }),
    track("track-5", 23, 26, { createdAt: at(2), sourceType: "tiktok" }),
    track("track-6", 27, 30, { lane: "priority", sourceType: "other", outcome: "skipped" }),
  ];
  const queued = track("track-unplayed", null, null, {
    createdAt: at(5),
    privateEmail: "do-not-export@example.test",
    privateToken: "private-submitter-token",
  });
  const removed = track("track-removed", null, null, {
    status: "removed",
    removedAt: at(6),
    privateLink: "https://private-storage.example.test/removed.mp3",
    privatePaymentId: "private-payment-id",
  });
  const entries = [...completed, queued, removed];
  const events = [
    { eventType: "session_created", occurredAt: at(-10), track: null },
    { eventType: "submissions_opened", occurredAt: at(-5), track: null },
    ...entries.map((entry) => ({ eventType: "track_submitted", occurredAt: entry.createdAt, track: publicTrack(entry) })),
    { eventType: "submissions_closed", occurredAt: at(0), track: null },
    { eventType: "broadcast_started", occurredAt: at(0), track: null },
    ...completed.flatMap((entry) => [
      { eventType: "track_play_started", occurredAt: entry.playedAt, track: publicTrack(entry) },
      { eventType: entry.playbackOutcome === "skipped" ? "track_skipped" : "track_finished", occurredAt: entry.completedAt, track: publicTrack(entry) },
    ]),
    { eventType: "sponsor_break_started", occurredAt: at(12), track: null },
    { eventType: "sponsor_break_completed", occurredAt: at(17), track: null },
    { eventType: "wheel_launched", occurredAt: at(21), track: null },
    { eventType: "wheel_spun", occurredAt: at(21, 10), track: null, details: { wheelSpinDurationMs: 12_000 } },
    { eventType: "wheel_confirmed", occurredAt: at(23), track: null },
    { eventType: "track_removed", occurredAt: removed.removedAt, track: publicTrack(removed) },
    { eventType: "session_archived", occurredAt: at(30), track: null },
  ]
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    .map((event, index) => ({ ...event, sequence: index + 1, details: event.details ?? null }));

  return {
    session: {
      sessionId: "session-report",
      title: "Clean timing show",
      showDate: "2026-08-21",
      createdAt: at(-10),
      updatedAt: at(30),
      status: "archived",
      broadcastStartedAt: at(0),
      sponsorBreakStatus: "completed",
      sponsorBreakStartedAt: at(12),
      sponsorBreakCompletedAt: at(17),
      sponsorBreakDueAfterPlayableCount: 3,
      sponsorBreakCompletedAfterPlayableCount: 3,
      wheelSpinsOwed: 0,
      loadedTrack: null,
      nextInLineTrack: null,
      queue: [queued],
      completed,
      removed: [removed],
      spotlight: [completed[1]],
    },
    events,
  };
}

test("finished-session report separates music, ordinary transitions, sponsor time, and Wheel time", () => {
  const { session, events } = fixture();
  const report = buildQueueShowReport(session, events);

  assert.equal(report.schemaVersion, "barcode_queue_show_report_v1");
  assert.equal(report.timeline.broadcastDurationSeconds, 1_800);
  assert.equal(report.timeline.submissionWindowSeconds, 300);
  assert.deepEqual(report.outcomes, {
    totalSubmitted: 8,
    played: 6,
    finished: 5,
    skipped: 1,
    removed: 1,
    unplayed: 1,
    lateSubmissions: 2,
    returnedToQueue: 0,
    restored: 0,
    spotlight: 1,
  });
  assert.equal(report.pacing.modeledMusicAirtimeSeconds, 1_080);
  assert.equal(report.pacing.directlyObservedMusicAirtimeSeconds, 1_080);
  assert.equal(report.pacing.observedTrackCoveragePercent, 100);
  assert.equal(report.pacing.sponsorBreakSeconds, 300);
  assert.equal(report.pacing.wheelCeremonySeconds, 120);
  assert.equal(report.pacing.unattributedBroadcastSeconds, 300);
  assert.equal(report.pacing.averageTransitionSeconds, 60, "sponsor and Wheel intervals are not misclassified as ordinary transitions");
  assert.equal(report.pacing.medianTransitionSeconds, 60);
  assert.equal(report.pacing.p90TransitionSeconds, 60);
  assert.equal(report.pacing.tracksPerBroadcastHour, 12);
  assert.equal(report.operations.wheel.plannedSpinSeconds, 12);
  assert.equal(report.operations.wheel.completedCeremonies, 1);
  assert.equal(report.operations.sponsor.durationSeconds, 300);
  assert.equal(report.calibration.status, "eligible");
  assert.deepEqual(report.calibration.reasons, []);
  assert.deepEqual(report.trackOutcomes.map((entry) => entry.transitionAfterSeconds), [60, 60, 60, 60, 60, null]);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /do-not-export@example\.test|private-submitter-token|private-payment-id|private-storage\.example\.test/);
});

test("finished-session report surfaces ordinary playback data-quality problems", () => {
  const { session, events } = fixture();
  const incomplete = { ...session.completed[0] };
  delete incomplete.playbackEndPositionSeconds;
  delete incomplete.playbackObservedDurationSeconds;
  incomplete.playbackEndedNaturally = false;
  session.completed = [incomplete, ...session.completed.slice(1)];
  events.push(
    { sequence: events.length + 1, eventType: "track_stalled", occurredAt: at(1), track: publicTrack(incomplete), details: null },
    { sequence: events.length + 2, eventType: "track_playback_error", occurredAt: at(1, 5), track: publicTrack(incomplete), details: { playbackErrorCode: "network_error" } },
  );

  const report = buildQueueShowReport(session, events);
  assert.equal(report.pacing.fallbackTrackCount, 1);
  assert.equal(report.operations.stalls, 1);
  assert.equal(report.operations.playbackErrors, 1);
  assert.equal(report.calibration.status, "review_required");
  assert.ok(report.calibration.reasons.some((reason) => reason.includes("direct playback-position timing")));
  assert.ok(report.calibration.reasons.some((reason) => reason.includes("Playback stalls or errors")));
});

test("directly observed playback position is not truncated by a shorter duration fallback", () => {
  const { session, events } = fixture();
  session.completed[0] = {
    ...session.completed[0],
    detectedDurationSeconds: null,
    estimatedDurationSeconds: 180,
    playbackEndPositionSeconds: 240,
    playbackObservedDurationSeconds: null,
    playbackEndedNaturally: false,
  };

  const report = buildQueueShowReport(session, events);
  assert.equal(report.trackOutcomes[0].modeledMusicSeconds, 240);
  assert.equal(report.trackOutcomes[0].directlyObserved, true);
});
