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
    playbackEndPositionObservedAt: completed ? at(completedMinute) : null,
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
    completedAtClose: 6,
    finishActions: 5,
    skipActions: 1,
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
  assert.deepEqual(report.operations.wheel.spinTimings, [{
    startedAt: at(21, 10),
    endedAt: at(21, 22),
    durationSeconds: 12,
  }]);
  assert.equal(report.operations.wheel.completedCeremonies, 1);
  assert.equal(report.operations.sponsor.durationSeconds, 300);
  assert.equal(report.calibration.status, "eligible");
  assert.deepEqual(report.calibration.reasons, []);
  assert.deepEqual(report.trackOutcomes.map((entry) => entry.transitionAfterSeconds), [60, 60, 60, 60, 60, null]);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /do-not-export@example\.test|private-submitter-token|private-payment-id|private-storage\.example\.test/);
});

function reportFixture(completed, eventRows, overrides = {}) {
  const { session } = fixture();
  Object.assign(session, { completed, queue: [], removed: [], spotlight: [], sponsorBreakStatus: "not_due", sponsorBreakStartedAt: null, sponsorBreakCompletedAt: null, ...overrides });
  const events = eventRows.map(([eventType, occurredAt, entry], index) => ({
    sequence: index + 1,
    eventType,
    occurredAt,
    track: entry ? publicTrack(entry) : null,
    details: null,
  }));
  return { session, events };
}

test("September 25 Lullaby transition stops at White Monster's external attempt", () => {
  // Minimal reproduction from the saved September 25 review, not a complete
  // packet replay. These recorded timestamps exposed the false 506-second gap.
  const lullaby = track("lullaby", 0, 3);
  const external = track("white-monster", 4, 7, { sourceType: "soundcloud" });
  const binary = track("binary-love", 8, 11);
  const finish = "2026-09-26T04:04:20.878Z";
  const load = "2026-09-26T04:04:46.548Z";
  const externalFinish = "2026-09-26T04:12:06.259Z";
  const nextPlay = "2026-09-26T04:12:46.512Z";
  const { session, events } = reportFixture([lullaby, external, binary], [
    ["track_play_started", "2026-09-26T04:01:00.000Z", lullaby],
    ["track_finished", finish, lullaby],
    ["track_loaded", load, external],
    ["track_finished", externalFinish, external],
    ["track_loaded", "2026-09-26T04:12:20.000Z", binary],
    ["track_play_started", nextPlay, binary],
    ["track_finished", "2026-09-26T04:15:46.512Z", binary],
  ]);
  const report = buildQueueShowReport(session, events);
  const byId = new Map(report.trackOutcomes.map((row) => [row.trackId, row]));
  assert.equal(byId.get(lullaby.id).transitionAfterSeconds, null);
  assert.equal(byId.get(lullaby.id).nextLoadAfterSeconds, 26);
  assert.equal(byId.get(external.id).loadedAt, load);
  assert.equal(byId.get(external.id).playedAt, null, "load is not an audible start");
  assert.equal(byId.get(external.id).wallClockSlotSeconds, null);
  assert.equal(byId.get(external.id).transitionAfterSeconds, 40);
  assert.equal(report.pacing.averageTransitionSeconds, 40);
});

test("multiple intervening external tracks cannot become one long transition", () => {
  const tracks = [track("calm-vs-chaos", 0, 3), track("external-1", 4, 7), track("external-2", 8, 11), track("next-native", 12, 15)];
  const { session, events } = reportFixture(tracks, tracks.flatMap((entry, index) => [
    ["track_loaded", at(index * 4), entry],
    ...([0, 3].includes(index) ? [["track_play_started", at(index * 4, 5), entry]] : []),
    ["track_finished", at(index * 4 + 3), entry],
  ]));
  const report = buildQueueShowReport(session, events);
  assert.deepEqual(report.trackOutcomes.map((row) => row.transitionAfterSeconds), [null, null, 65, null]);
  assert.deepEqual(report.trackOutcomes.map((row) => row.nextLoadAfterSeconds), [60, 60, 60, null]);
});

test("Space Vibe's finish survives a later removal without borrowing removal telemetry", () => {
  const entry = track("space-vibe", 0, 3);
  const removed = { ...entry, status: "removed", playbackOutcome: "removed", playbackEndPositionSeconds: 0, playbackEndPositionObservedAt: at(20), removedAt: at(20) };
  const { session, events } = reportFixture([], [
    ["track_play_started", at(0), entry],
    ["track_finished", at(3), entry],
    ["track_removed", at(20), entry],
  ], { removed: [removed] });
  const before = structuredClone(session);
  const report = buildQueueShowReport(session, events);
  assert.equal(report.outcomes.played, 1);
  assert.equal(report.outcomes.finished, 1);
  assert.equal(report.outcomes.finishActions, 1);
  assert.equal(report.outcomes.completedAtClose, 0);
  assert.equal(report.outcomes.removed, 1);
  assert.equal(report.trackOutcomes[0].outcome, "finished");
  assert.equal(report.trackOutcomes[0].finalStatus, "removed");
  assert.equal(report.trackOutcomes[0].completedAt, at(3));
  assert.equal(report.trackOutcomes[0].directlyObserved, false);
  assert.equal(report.trackOutcomes[0].modeledMusicSeconds, 180);
  assert.deepEqual(session, before, "report never rewrites queue history");
});

test("repeated finishes count actions separately and use the latest completed attempt", () => {
  const entry = track("replayed", 6, 9);
  const { session, events } = reportFixture([entry], [
    ["track_loaded", at(0), entry],
    ["track_play_started", at(0, 5), entry],
    ["track_finished", at(3), entry],
    ["track_restored", at(4), entry],
    ["track_loaded", at(6), entry],
    ["track_play_started", at(6, 10), entry],
    ["track_finished", at(9), entry],
  ]);
  const report = buildQueueShowReport(session, events);
  assert.equal(report.outcomes.played, 1);
  assert.equal(report.outcomes.finishActions, 2);
  assert.equal(report.trackOutcomes[0].playedAt, at(6, 10));
  assert.equal(report.trackOutcomes[0].completedAt, at(9));
  assert.equal(report.trackOutcomes[0].wallClockSlotSeconds, 170);
  assert.ok(report.calibration.reasons.some((reason) => reason.includes("Repeated Finish / Skip")));
});

test("a returned attempt never borrows the finish of a later load of the same song", () => {
  const entry = track("returned", 6, 9);
  const { session, events } = reportFixture([entry], [
    ["track_loaded", at(0), entry],
    ["track_play_started", at(0, 5), entry],
    ["track_returned", at(1), entry],
    ["track_loaded", at(6), entry],
    ["track_finished", at(9), entry],
  ]);
  const report = buildQueueShowReport(session, events);
  assert.equal(report.trackOutcomes[0].loadedAt, at(6));
  assert.equal(report.trackOutcomes[0].playedAt, null);
  assert.equal(report.trackOutcomes[0].wallClockSlotSeconds, null);
});

test("an abandoned next load stops transitions, while repeated play receipts keep the first start", () => {
  const first = track("first", 0, 3);
  const abandoned = track("abandoned", null, null);
  const last = track("last", 6, 9);
  const { session, events } = reportFixture([first, last], [
    ["track_play_started", at(0), first],
    ["track_play_started", at(1), first],
    ["track_finished", at(3), first],
    ["track_loaded", at(4), abandoned],
    ["track_returned", at(5), abandoned],
    ["track_play_started", at(6), last],
    ["track_finished", at(9), last],
  ], { queue: [abandoned] });
  const report = buildQueueShowReport(session, events);
  assert.equal(report.trackOutcomes[0].wallClockSlotSeconds, 180);
  assert.equal(report.trackOutcomes[0].transitionAfterSeconds, null);
  assert.equal(report.trackOutcomes[0].nextLoadAfterSeconds, 60);
});

test("unfinished replay preserves an earlier skip and does not relabel its start or outcome", () => {
  const entry = track("skipped-then-restored", null, null, { status: "playing" });
  entry.playedAt = at(6);
  const { session, events } = reportFixture([], [
    ["track_play_started", at(0), entry],
    ["track_skipped", at(1), entry],
    ["track_restored", at(4), entry],
    ["track_loaded", at(6), entry],
    ["track_play_started", at(6, 10), entry],
  ], { loadedTrack: entry });
  const report = buildQueueShowReport(session, events);
  assert.equal(report.outcomes.played, 1);
  assert.equal(report.outcomes.skipped, 1);
  assert.equal(report.outcomes.unplayed, 0);
  assert.equal(report.outcomes.skipActions, 1);
  assert.equal(report.trackOutcomes[0].playedAt, at(0));
  assert.equal(report.trackOutcomes[0].completedAt, at(1));
  assert.equal(report.trackOutcomes[0].finalStatus, "playing");
});

function endedDiagnostics(entry, endedAt) {
  return {
    schemaVersion: "queue_playback_lifecycle_v1", currentTrackId: entry.id,
    lifecycleState: "ended", lastEventAt: endedAt, lastErrorCode: null, nextSequence: 2,
    events: [{ sequence: 1, trackId: entry.id, provider: "audio", eventType: "ended", lifecycleState: "ended", observedAt: endedAt, currentTimeSeconds: 180, durationSeconds: 180, readyState: 4, networkState: 1, errorCode: null }],
  };
}

test("Galaxy Song's natural end without Finish is explicit and never auto-completes the queue", () => {
  const entry = track("galaxy-song", null, null, { status: "playing" });
  entry.playedAt = at(26);
  const { session, events } = reportFixture([], [
    ["track_loaded", at(26), entry],
    ["track_play_started", at(26, 5), entry],
    ["session_archived", at(30)],
  ], { loadedTrack: entry, playbackDiagnostics: endedDiagnostics(entry, at(29)) });
  const before = structuredClone({ session, events });
  const report = buildQueueShowReport(session, events);
  assert.deepEqual(report.unfinishedPlayback, [{ trackId: entry.id, artist: entry.submittedArtistName, title: entry.submittedSongTitle, finalStatus: "playing", naturallyEndedAt: at(29) }]);
  assert.equal(report.outcomes.played, 0);
  assert.equal(report.outcomes.finishActions, 0);
  assert.ok(report.calibration.reasons.some((reason) => reason.includes("natural playback end without a Finish")));
  assert.deepEqual({ session, events }, before);

  // The original packet ends with a seek receipt while lifecycleState remains
  // ended: sequence 256 at 07:48:05.043Z, then 257 at 07:48:06.514Z.
  session.playbackDiagnostics.events = [
    { ...session.playbackDiagnostics.events[0], sequence: 256, provider: "youtube", observedAt: "2026-09-26T07:48:05.043Z", currentTimeSeconds: 163.901, durationSeconds: 163.901 },
    { ...session.playbackDiagnostics.events[0], sequence: 257, provider: "youtube", eventType: "seek", lifecycleState: "ended", observedAt: "2026-09-26T07:48:06.514Z", currentTimeSeconds: 163.901, durationSeconds: 163.901 },
  ];
  assert.equal(buildQueueShowReport(session, events).unfinishedPlayback[0]?.naturallyEndedAt, "2026-09-26T07:48:05.043Z");
  session.playbackDiagnostics.events.push({ ...session.playbackDiagnostics.events[1], sequence: 258, eventType: "play", lifecycleState: "playing", observedAt: "2026-09-26T07:48:10.000Z" });
  assert.deepEqual(buildQueueShowReport(session, events).unfinishedPlayback, [], "a new playback receipt invalidates the ended state");

  session.loadedTrack = null;
  session.completed = [{ ...entry, status: "completed", completedAt: at(29, 10), playbackOutcome: "finished" }];
  assert.deepEqual(buildQueueShowReport(session, events).unfinishedPlayback, []);
});

test("a stale natural end cannot describe a restored or reloaded attempt", () => {
  const entry = track("restored-after-end", null, null, { status: "playing" });
  entry.playedAt = at(6);
  const { session, events } = reportFixture([], [
    ["track_loaded", at(0), entry],
    ["track_play_started", at(0, 5), entry],
    ["track_returned", at(4), entry],
    ["track_loaded", at(6), entry],
  ], { loadedTrack: entry, playbackDiagnostics: endedDiagnostics(entry, at(3)) });
  assert.deepEqual(buildQueueShowReport(session, events).unfinishedPlayback, []);
});

test("missing log events keep timing unknown and simulated outcomes stay excluded", () => {
  const first = track("first", 0, 3);
  const simulated = { ...track("simulation", 4, 7), isTestTrack: true };
  const last = track("last", 8, 11);
  const { session, events } = reportFixture([first, simulated, last], [
    ["track_play_started", at(0), first],
    ["track_finished", at(3), first],
    ["track_play_started", at(4), simulated],
    ["track_finished", at(7), simulated],
    ["track_play_started", at(8), last],
    ["track_finished", at(11), last],
  ]);
  events.splice(2, 2); // Preserve sequence numbers: the missing interval is unknown.
  const report = buildQueueShowReport(session, events);
  assert.equal(report.outcomes.played, 2);
  assert.equal(report.outcomes.finishActions, 2);
  assert.equal(report.trackOutcomes[0].transitionAfterSeconds, null);
  assert.ok(report.calibration.reasons.some((reason) => reason.includes("retained Show Log is incomplete")));
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
    playbackEndPositionObservedAt: at(3),
    playbackObservedDurationSeconds: null,
    playbackEndedNaturally: false,
  };

  const report = buildQueueShowReport(session, events);
  assert.equal(report.trackOutcomes[0].modeledMusicSeconds, 240);
  assert.equal(report.trackOutcomes[0].directlyObserved, true);
});

test("unclocked manual endpoint positions remain fallback-quality report evidence", () => {
  const { session, events } = fixture();
  session.completed[0] = {
    ...session.completed[0],
    playbackEndedNaturally: false,
    playbackEndPositionSeconds: 30,
    playbackEndPositionObservedAt: null,
  };

  const report = buildQueueShowReport(session, events);
  assert.equal(report.trackOutcomes[0].modeledMusicSeconds, 180);
  assert.equal(report.trackOutcomes[0].directlyObserved, false);
  assert.equal(report.pacing.fallbackTrackCount, 1);
  assert.equal(report.calibration.status, "review_required");
});

test("Wheel ceremony airtime is clipped to the actual broadcast window", () => {
  const { session, events } = fixture();
  const withoutWheel = events.filter((event) => !event.eventType.startsWith("wheel_"));
  const replacement = [
    { eventType: "wheel_launched", occurredAt: at(-2), track: null, details: null },
    { eventType: "wheel_spun", occurredAt: at(-1, 50), track: null, details: { wheelSpinDurationMs: 12_000 } },
    { eventType: "wheel_confirmed", occurredAt: at(1), track: null, details: null },
  ];
  const clippedEvents = [...withoutWheel, ...replacement]
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    .map((event, index) => ({ ...event, sequence: index + 1 }));

  const report = buildQueueShowReport(session, clippedEvents);
  assert.equal(report.pacing.wheelCeremonySeconds, 60);
  assert.equal(report.operations.wheel.ceremonySeconds, 60);
  assert.deepEqual(report.operations.wheel.spinTimings, [{
    startedAt: at(-1, 50),
    endedAt: at(0, 2),
    durationSeconds: 12,
  }]);
});
