import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";

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
const queue = require("../src/lib/queue.ts");

const baseTime = Date.parse("2026-08-31T20:00:00.000Z");
const at = (minute) => new Date(baseTime + minute * 60_000).toISOString();

function entry(id, handle, options = {}) {
  const outcome = options.outcome ?? null;
  const terminal = outcome !== null || options.status === "completed" || options.status === "played";
  const sourceType = options.sourceType ?? "upload";
  return {
    id,
    artist: options.artist ?? `${id} Artist`,
    title: options.title ?? `${id} Song`,
    submittedArtistName: options.artist ?? `${id} Artist`,
    submittedSongTitle: options.title ?? `${id} Song`,
    collaboratorNames: options.collaboratorNames ?? null,
    link: options.link ?? (sourceType === "upload" ? `https://private.example.test/${id}` : `https://music.example.test/${id}`),
    tier: "free",
    lane: options.lane ?? "regular",
    amount: options.amount ?? 0,
    stripeSessionId: options.stripeSessionId ?? null,
    status: options.status ?? (terminal ? "completed" : "queued"),
    createdAt: options.createdAt ?? at(0),
    playedAt: terminal ? at(1) : null,
    completedAt: terminal ? at(2) : null,
    removedAt: options.removedAt ?? null,
    playbackOutcome: outcome,
    tiktokHandle: handle,
    normalizedTikTokHandle: queue.normalizeTikTokHandle(handle),
    contactEmail: options.contactEmail ?? "private@example.test",
    submitterToken: options.submitterToken ?? "private-browser-token",
    sourceType,
    fileUrl: `https://storage.example.test/${id}.mp3`,
    fileName: `${id}.mp3`,
    priorityUpgradePaymentId: options.priorityUpgradePaymentId ?? "pi_private_priority",
    signalHoldPaymentId: options.signalHoldPaymentId ?? "pi_private_signal_hold",
    signalHoldStatus: options.signalHoldStatus ?? "active",
    suspiciousFlags: ["private_flag"],
    isTestTrack: options.isTestTrack === true,
  };
}

function showLogEvent(sequence, eventType, track = null, occurredAt = at(sequence), details = null) {
  return {
    sequence,
    eventType,
    occurredAt,
    track: track ? {
      trackId: track.id,
      artist: track.submittedArtistName,
      title: track.submittedSongTitle,
      tiktokHandle: track.tiktokHandle,
      sourceType: track.sourceType,
      publicSourceUrl: track.sourceType === "upload" ? null : track.link,
      submissionOrder: sequence,
      playedOrder: null,
    } : null,
    details,
  };
}

function session(id, purpose, options = {}) {
  return {
    sessionId: id,
    title: options.title ?? `${id} Show`,
    showDate: options.showDate ?? "2026-08-31",
    createdAt: options.createdAt ?? at(-10),
    updatedAt: options.updatedAt ?? at(20),
    status: options.status ?? "archived",
    purpose,
    provenanceRevision: options.provenanceRevision ?? 1,
    queueOpen: options.queueOpen ?? false,
    showStarted: options.showStarted ?? false,
    broadcastPhase: options.broadcastPhase ?? (options.status === "archived" ? "ended" : "broadcast_active"),
    queue: options.queue ?? [],
    nextInLineTrack: options.nextInLineTrack ?? null,
    loadedTrack: options.loadedTrack ?? null,
    completed: options.completed ?? [],
    removed: options.removed ?? [],
    spotlight: options.spotlight ?? [],
    showLog: options.showLog ?? [],
  };
}

test("Broadcast Archive projects only retained live shows into separate Shows and Artists catalogs", () => {
  const waiting = entry("waiting", "TikTok.com/@Submitter.One", {
    artist: "Neon   Signal",
    title: "Waiting Song",
    collaboratorNames: "Guest Voice",
    sourceType: "link",
    createdAt: at(8),
  });
  const next = entry("next", "@submitter.two", { artist: "NEON SIGNAL", title: "Next Song", createdAt: at(7) });
  const playing = entry("playing", "@third.handle", { artist: "Neon Signals", title: "Different Project", status: "playing", createdAt: at(6) });
  const finished = entry("finished", "@submitter.one", { artist: "neon signal", title: "Played Song", collaboratorNames: "Guest Voice", outcome: "finished", sourceType: "youtube", lane: "wheel", createdAt: at(2) });
  const skipped = entry("skipped", "@submitter.two", { artist: "NEON SIGNAL", title: "Not Completed", outcome: "skipped", createdAt: at(3) });
  const removed = entry("removed", "@submitter.one", { artist: "Neon Signal", title: "Removed Song", outcome: "removed", status: "removed", removedAt: at(9), createdAt: at(4) });
  const unknown = entry("unknown", "@submitter.one", { artist: "Neon Signal", title: "Legacy Outcome", status: "played", createdAt: at(5) });
  const differentArchived = entry("different-archived", "@third.handle", { artist: "Neon Signals", title: "Different Project", outcome: "finished", createdAt: at(6) });
  const firstRetained = entry("first-retained", "@archive.handle", { artist: "Archive Artist", outcome: "finished", createdAt: at(1) });
  const simulation = entry("simulation", "@submitter.one", { artist: "Neon Signal", outcome: "finished", isTestTrack: true });
  const currentLog = [
    showLogEvent(1, "session_created"),
    showLogEvent(2, "submissions_opened"),
    showLogEvent(3, "track_submitted", waiting),
    showLogEvent(4, "track_loaded", waiting),
    showLogEvent(5, "track_play_started", waiting),
    showLogEvent(6, "track_paused", waiting),
    showLogEvent(7, "track_stalled", waiting),
    showLogEvent(8, "track_resumed", waiting),
    showLogEvent(9, "track_playback_error", waiting),
    showLogEvent(10, "track_skipped", waiting),
    showLogEvent(11, "track_removed", waiting),
    showLogEvent(12, "track_signal_hold_applied", waiting),
    showLogEvent(13, "wheel_spin_unlocked", null, at(13), { wheelSpinsAdded: 1, wheelSpinsOwed: 2 }),
    showLogEvent(14, "wheel_launched"),
    showLogEvent(15, "wheel_reencrypted"),
    showLogEvent(16, "wheel_spun"),
    showLogEvent(17, "wheel_result_rejected"),
    showLogEvent(18, "wheel_confirmed"),
    showLogEvent(19, "wheel_cancelled"),
    showLogEvent(20, "sponsor_break_started"),
    showLogEvent(21, "sponsor_break_skipped"),
    showLogEvent(22, "sponsor_break_reset"),
    showLogEvent(23, "submissions_closed"),
  ];
  const archivedLog = [
    showLogEvent(1, "submissions_opened"),
    showLogEvent(2, "track_submitted", finished),
    showLogEvent(3, "wheel_confirmed", finished),
    showLogEvent(4, "track_finished", finished),
    showLogEvent(5, "session_archived"),
  ];

  const result = queue.buildQueuePublicStats({
    revision: 42,
    activeSessionId: "live-current",
    sessions: [
      session("live-current", "live_broadcast", {
        status: "open",
        queueOpen: true,
        showStarted: true,
        showDate: "2026-08-31",
        queue: [waiting],
        nextInLineTrack: next,
        loadedTrack: playing,
        showLog: currentLog,
      }),
      session("coverage-start", "live_broadcast", {
        showDate: "2026-08-24",
        completed: [firstRetained, finished, skipped, unknown, differentArchived, simulation],
        removed: [removed],
        showLog: archivedLog,
      }),
      session("before-coverage", "live_broadcast", {
        showDate: "2026-08-23",
        completed: [entry("too-old", "@old.handle", { outcome: "finished" })],
      }),
      session("rehearsal", "rehearsal", {
        showDate: "2026-08-31",
        completed: [entry("rehearsal-track", "@private.handle", { outcome: "finished" })],
      }),
    ],
  });

  assert.equal(result.schemaVersion, "queue_public_history_projection_v1");
  assert.equal(result.source, "queue_public_history_projection");
  assert.equal(result.visibility, "public_safe");
  assert.equal(result.historyCoverageStartedAt, "2026-08-24");
  assert.equal(result.sourceRevision, 42);
  assert.equal(result.overview.showCount, 1);
  assert.equal(result.overview.artistCount, 3);
  assert.equal(result.overview.submittedTrackCount, 6);
  assert.equal(result.overview.finishedTrackCount, 3);
  assert.equal(result.overview.skippedTrackCount, 1);
  assert.equal(result.overview.removedTrackCount, 1);
  assert.equal(result.overview.unknownOutcomeTrackCount, 1);
  assert.equal(result.overview.waitingTrackCount, 0);
  assert.equal(result.overview.upNextTrackCount, 0);
  assert.equal(result.overview.nowPlayingTrackCount, 0);
  assert.equal(result.overview.wheelChosenTrackCount, 1);
  assert.deepEqual(result.shows.map((show) => show.sessionId), ["coverage-start"]);
  assert.equal(result.currentShow.sessionId, "live-current");
  assert.equal(result.currentShow.trackRoster.length, 3);
  assert.equal(result.currentShow.trackRoster.find((track) => track.trackId === "waiting").publicSourceUrl, "https://music.example.test/waiting");
  assert.equal(result.currentShow.trackRoster.find((track) => track.trackId === "next").publicSourceUrl, null);
  assert.deepEqual(result.currentShow.milestones.map((event) => event.eventType), currentLog.map((event) => event.eventType));
  const wheelUnlocked = result.currentShow.milestones.find((event) => event.eventType === "wheel_spin_unlocked");
  assert.equal(wheelUnlocked.detail, "2 Wheel spins are waiting.");
  assert.equal(wheelUnlocked.details.wheelSpinsAdded, 1);
  assert.equal(wheelUnlocked.details.wheelSpinsOwed, 2);
  assert.equal(result.currentShow.milestones.find((event) => event.eventType === "track_skipped").headline, "Track skipped");
  assert.equal(result.currentShow.milestones.find((event) => event.eventType === "track_playback_error").headline, "Playback issue detected");
  const submittedMilestone = result.currentShow.milestones.find((event) => event.eventType === "track_submitted");
  assert.equal(submittedMilestone.track.trackId, "waiting");
  assert.equal(submittedMilestone.track.submittedByTikTokHandle, "@submitter.one");
  assert.equal(submittedMilestone.track.lane, "regular");
  assert.equal(submittedMilestone.track.outcome, "active");
  assert.equal(submittedMilestone.track.submissionOrder, 3);
  assert.equal(result.shows[0].trackRoster.find((track) => track.trackId === "finished").wheelChosen, true);

  const neon = result.artists.find((artist) => artist.projectKey === "neon signal");
  assert.ok(neon);
  assert.equal(neon.showCount, 1);
  assert.equal(neon.submittedTrackCount, 4);
  assert.deepEqual([...new Set(neon.tracks.map((track) => track.submittedByTikTokHandle))].sort(), ["@submitter.one", "@submitter.two"]);
  assert.equal(neon.tracks.find((track) => track.trackId === "finished").collaboratorNames, "Guest Voice");
  assert.equal(result.artists.some((artist) => artist.projectKey === "guest voice"), false, "collaborators do not become or merge artist records");
  assert.ok(result.artists.some((artist) => artist.projectKey === "neon signals"), "similar project names remain separate");
  assert.equal(result.personalHistory, null);
});

test("public queue history stays empty until the production capability is exactly enabled", () => {
  const live = session("live-current", "live_broadcast", {
    status: "open",
    queueOpen: true,
    showStarted: true,
    queue: [entry("waiting", "@private.test", { sourceType: "link" })],
    showLog: [showLogEvent(1, "track_submitted", entry("waiting", "@private.test", { sourceType: "link" }))],
  });
  const archived = session("live-archive", "live_broadcast", {
    completed: [entry("finished", "@archive.test", { outcome: "finished", sourceType: "link" })],
  });
  const input = {
    revision: 73,
    activeSessionId: live.sessionId,
    sessions: [live, archived],
    submitterToken: "private-browser-token",
  };

  for (const value of [undefined, "", "TRUE", "1", "yes", "false"]) {
    const env = value === undefined ? {} : { BARCODE_QUEUE_PRODUCTION_ENABLED: value };
    const result = queue.buildQueuePublicStats(input, env);
    assert.equal(result.sourceRevision, 0);
    assert.equal(result.builtAt, null);
    assert.equal(result.currentShow, null);
    assert.equal(result.latestShow, null);
    assert.equal(result.overview.showCount, 0);
    assert.equal(result.overview.submittedTrackCount, 0);
    assert.deepEqual(result.shows, []);
    assert.deepEqual(result.artists, []);
    assert.deepEqual(result.recentEvents, []);
    assert.equal(result.personalHistory, null);
    assert.doesNotMatch(JSON.stringify(result), /private\.test|archive\.test|live-current|live-archive/);
  }

  const enabled = queue.buildQueuePublicStats(input, { BARCODE_QUEUE_PRODUCTION_ENABLED: "true" });
  assert.equal(enabled.sourceRevision, 73);
  assert.equal(enabled.currentShow.sessionId, "live-current");
  assert.deepEqual(enabled.shows.map((show) => show.sessionId), ["live-archive"]);

  const privatePreview = queue.buildQueueAdminPreviewStats({
    revision: 73,
    selectedSession: session("private-rehearsal", "rehearsal", {
      status: "open",
      queue: [entry("test-track", "@trusted.tester")],
    }),
  });
  assert.equal(privatePreview.currentShow.sessionId, "private-rehearsal");
  assert.equal(privatePreview.currentShow.submittedTrackCount, 1);
});

test("project normalization is deterministic but deliberately avoids fuzzy identity merging", () => {
  assert.equal(queue.normalizeQueueProjectKey("  Signal\u00a0Artist  "), "signal artist");
  assert.equal(queue.normalizeQueueProjectKey("SIGNAL ARTIST"), "signal artist");
  assert.equal(queue.normalizeQueueProjectKey("Signal—Artist"), "signal-artist");
  assert.equal(queue.normalizeQueueProjectKey("Ｓｉｇｎａｌ Artist"), "signal artist");
  assert.notEqual(queue.normalizeQueueProjectKey("Signal Artist"), queue.normalizeQueueProjectKey("Signal Artists"));
  assert.notEqual(queue.normalizeQueueProjectKey("Signal Artist"), queue.normalizeQueueProjectKey("Signal-Artist"));
});

test("same-browser history is token-gated while public artist attribution remains unverified", () => {
  const token = "owned-browser-token";
  const owned = entry("owned", "@owner.handle", { artist: "Owner Project", outcome: "finished", submitterToken: token });
  const sameHandleOtherBrowser = entry("same-handle", "@owner.handle", { artist: "Second Project", outcome: "finished", submitterToken: "different-token" });
  const unrelated = entry("unrelated", "@another.handle", { artist: "Other Project", outcome: "finished", submitterToken: "different-token" });
  const input = {
    revision: 8,
    activeSessionId: null,
    sessions: [session("public-live", "live_broadcast", { completed: [owned, sameHandleOtherBrowser, unrelated] })],
  };

  const anonymous = queue.buildQueuePublicStats(input);
  assert.equal(anonymous.personalHistory, null);
  assert.equal(anonymous.artists.find((artist) => artist.projectKey === "owner project").tracks[0].submittedByTikTokHandle, "@owner.handle");

  const personal = queue.buildQueuePublicStats({ ...input, submitterToken: token }).personalHistory;
  assert.equal(personal.access, "confirmed_same_browser_submission");
  assert.equal(personal.identityStatus, "submitted_handle_not_verified_account");
  assert.equal(personal.profileStatus, "not_verified_profile");
  assert.deepEqual(personal.handles.map((handle) => handle.tiktokHandle), ["@owner.handle"]);
  assert.equal(personal.handles[0].submittedTrackCount, 2, "the token confirms the submitted handle, not ownership of a person or account");
});

test("projection is idempotent, rebuilds corrections and deletions, and serializes no protected fields", () => {
  const privateEntry = entry("private", "@privacy.artist", {
    artist: "Privacy Artist",
    title: "Original Title",
    outcome: "finished",
    contactEmail: "secret@example.test",
    submitterToken: "secret-browser-token",
    stripeSessionId: "cs_secret",
    priorityUpgradePaymentId: "pi_secret_priority",
    signalHoldPaymentId: "pi_secret_hold",
  });
  const retained = session("public-live", "live_broadcast", { completed: [privateEntry] });
  const input = { revision: 9, activeSessionId: null, sessions: [retained] };
  const first = queue.buildQueuePublicStats(input);
  const repeated = queue.buildQueuePublicStats(input);
  assert.equal(first.sourceDigest, repeated.sourceDigest);

  const corrected = queue.buildQueuePublicStats({
    ...input,
    revision: 10,
    sessions: [session("public-live", "live_broadcast", { completed: [{ ...privateEntry, title: "Corrected Title", submittedSongTitle: "Corrected Title" }] })],
  });
  assert.notEqual(corrected.sourceDigest, first.sourceDigest);
  assert.equal(corrected.artists[0].tracks[0].title, "Corrected Title");

  const deleted = queue.buildQueuePublicStats({ revision: 11, activeSessionId: null, sessions: [] });
  assert.notEqual(deleted.sourceDigest, corrected.sourceDigest);
  assert.equal(deleted.overview.showCount, 0);
  assert.equal(deleted.overview.submittedTrackCount, 0);

  const json = JSON.stringify(first);
  assert.match(json, /@privacy\.artist/);
  assert.match(json, /Privacy Artist/);
  for (const forbidden of [
    "secret@example.test",
    "secret-browser-token",
    "cs_secret",
    "pi_secret_priority",
    "pi_secret_hold",
    "private.example.test",
    "storage.example.test",
    "signalHold",
    "priorityUpgrade",
    "suspiciousFlags",
    "contactEmail",
    "submitterToken",
    "fileUrl",
    "fileName",
    "amount",
  ]) {
    assert.doesNotMatch(json, new RegExp(forbidden, "i"));
  }
});

test("public history route is GET-only, token-bounded, and never cacheable", async () => {
  const route = require("../src/app/api/queue/stats/route.ts");
  assert.equal(typeof route.GET, "function");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(route[method], undefined);

  const invalid = await route.GET(new Request("https://example.test/api/queue/stats", {
    headers: { "x-barcode-submitter-token": "x".repeat(513) },
  }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("cache-control"), "no-store");

  const response = await route.GET(new Request("https://example.test/api/queue/stats"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "x-barcode-submitter-token");
  assert.equal((await response.json()).schemaVersion, "queue_public_history_projection_v1");
});

test("the Radio feature joins the active queue as a Deck entry while archive pages stay post-show", () => {
  const archivePage = fs.readFileSync(path.join(projectRoot, "src/app/radio/archive/page.tsx"), "utf8");
  const archive = fs.readFileSync(path.join(projectRoot, "src/components/BroadcastArchive.tsx"), "utf8");
  const deckPage = fs.readFileSync(path.join(projectRoot, "src/app/radio/deck/page.tsx"), "utf8");
  const deck = fs.readFileSync(path.join(projectRoot, "src/components/BroadcastDeck.tsx"), "utf8");
  const gateway = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueGateway.tsx"), "utf8");
  const publicQueue = fs.readFileSync(path.join(projectRoot, "src/components/PublicQueueSession.tsx"), "utf8");
  const radio = fs.readFileSync(path.join(projectRoot, "src/app/radio/page.tsx"), "utf8");
  const sitemap = fs.readFileSync(path.join(projectRoot, "src/app/sitemap.ts"), "utf8");
  const management = fs.readFileSync(path.join(projectRoot, "src/components/AdminShowManagement.tsx"), "utf8");
  const activityLogPath = path.join(projectRoot, "src/components/BroadcastActivityLog.tsx");

  assert.match(archivePage, /BroadcastArchive/);
  assert.doesNotMatch(deckPage, /BroadcastArchive/);
  assert.match(deckPage, /BroadcastDeck/);
  assert.match(deck, /archiveHref\s*=\s*"\/radio\/archive"/);
  assert.match(deck, /href=\{archiveHref\}/);
  assert.match(deck, /BROADCAST ARCHIVE|Broadcast Archive/);
  assert.match(deck, /startSessionBoundPolling/);
  assert.match(deck, /PUBLIC_QUEUE_POLL_INTERVAL_MS/);
  assert.match(deck, /From this browser/);
  assert.match(deck, /multiple artists|multiple artists|multiple/i);
  assert.match(deck, /BroadcastActivityLog/);
  assert.doesNotMatch(deck, /slice\(0,\s*14\)/);

  assert.ok(fs.existsSync(activityLogPath), "the Deck must own an interactive full-show activity log");
  const activityLog = fs.readFileSync(activityLogPath, "utf8");
  assert.match(activityLog, /Everything/);
  assert.match(activityLog, /Tracks/);
  assert.match(activityLog, /Wheel/);
  assert.match(activityLog, /Show/);
  assert.match(activityLog, /Newest first/);
  assert.match(activityLog, /Oldest first/);
  assert.match(activityLog, /aria-live="polite"/);

  assert.match(archive, /Shows ·/);
  assert.match(archive, /Artists ·/);
  assert.match(archive, /Search shows, artists, songs, TikTok handles, collaborators/);
  assert.match(archive, /Submitted by/);
  assert.match(archive, /Wheel Chosen/);
  assert.match(archive, /not a verified artist account/);
  assert.match(archive, /Finish outcomes; full playback is not implied/);
  assert.match(archive, /deckHref &&/);

  assert.doesNotMatch(gateway, /href="\/radio\/deck"/);
  assert.match(gateway, /href="\/radio\/archive"/);
  assert.match(publicQueue, /\/radio\/deck/);
  assert.match(publicQueue, /Done submitting—or just watching\?/);
  assert.match(publicQueue, /Song submissions stay here in the queue/);
  assert.match(publicQueue, /Submission complete · follow the show on the Deck/);
  assert.match(publicQueue, /\/radio\/archive/);
  assert.match(radio, /<RadioBroadcastFeature \/>/);
  assert.doesNotMatch(archivePage, /deckHref|\/radio\/deck/);
  assert.doesNotMatch(sitemap, /\/radio\/deck/);
  assert.match(sitemap, /\/radio\/archive/);
  assert.match(deck, /Song submissions stay in the queue/);
  assert.match(deck, /Submissions happen in the queue/);
  assert.match(publicQueue, /broadcastArchiveArtistHref/);
  assert.match(publicQueue, /Artist Archive/);

  assert.match(management, /useState<QueueSessionPurpose \| "">\(""\)/);
  assert.match(management, /Choose purpose/);
  assert.match(management, /Live broadcast · retained in public Archive/);
  assert.match(management, /disabled=\{locked \|\| !purpose\}/);
});

test("Broadcast Deck exposes only valid external links as music actions", () => {
  const contractPath = path.join(projectRoot, "src/lib/broadcast-deck.ts");
  assert.ok(fs.existsSync(contractPath), "the Deck link boundary must be explicit and reusable");
  const { deckExternalTrackHref } = require(contractPath);

  assert.equal(deckExternalTrackHref({ sourceType: "youtube", publicSourceUrl: "https://www.youtube.com/watch?v=abcdefghijk" }), "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(deckExternalTrackHref({ sourceType: "link", publicSourceUrl: "http://music.example.test/track" }), "http://music.example.test/track");
  assert.equal(deckExternalTrackHref({ sourceType: "upload", publicSourceUrl: "https://private.example.test/audio.mp3" }), null);
  assert.equal(deckExternalTrackHref({ sourceType: "link", publicSourceUrl: "javascript:alert(1)" }), null);
  assert.equal(deckExternalTrackHref({ sourceType: "link", publicSourceUrl: null }), null);

  const deck = fs.readFileSync(path.join(projectRoot, "src/components/BroadcastDeck.tsx"), "utf8");
  assert.match(deck, /deckExternalTrackHref/);
  assert.doesNotMatch(deck, /fileUrl|AdminAudioPlayer|\/api\/admin\/queue\/file/);
});

test("played archive excludes loaded-only and unplayed removals without changing source or full Deck history", () => {
  const waiting = entry("never-submitted-play", "@never", { artist: "Never Aired" });
  const loaded = { ...entry("loaded-only", "@loaded", { status: "playing" }), playedAt: at(3) };
  const removed = entry("removed-before-play", "@removed", { outcome: "removed", status: "removed" });
  const manualFinish = entry("manual-finish-no-play", "@manual", { outcome: "finished" });
  const finished = entry("started-finished", "@finished", { outcome: "finished" });
  const partial = entry("partial-removed", "@partial", { outcome: "removed", status: "removed" });
  const natural = { ...entry("natural-finish", "@natural", { outcome: "finished" }), playbackEndedNaturally: true };
  const showLog = [
    showLogEvent(1, "track_loaded", loaded),
    showLogEvent(2, "track_finished", manualFinish),
    showLogEvent(3, "track_play_started", finished),
    showLogEvent(4, "track_resumed", finished),
    showLogEvent(5, "track_play_started", partial),
    showLogEvent(6, "track_removed", removed),
    showLogEvent(7, "track_removed", partial),
  ];
  const input = { revision: 19, sessions: [session("evidence-show", "live_broadcast", {
    queue: [waiting], loadedTrack: loaded, completed: [manualFinish, finished, natural], removed: [removed, partial], showLog,
  })] };
  const original = JSON.stringify(input);
  const allBefore = queue.buildQueuePublicStats(input);
  const played = queue.buildQueuePublicStats({ ...input, playedOnly: true });
  assert.equal(played.catalogScope, "played_broadcast");
  assert.deepEqual(played.shows[0].trackRoster.map(x => x.trackId).sort(), [finished.id, partial.id, natural.id].sort());
  assert.equal(played.overview.submittedTrackCount, 3);
  assert.equal(played.overview.artistCount, 3);
  assert.equal(played.overview.finishedTrackCount, 2);
  assert.equal(played.overview.removedTrackCount, 1);
  assert.ok(played.recentEvents.every(e => !e.track || [finished.id, partial.id, natural.id].includes(e.track.trackId)));
  assert.equal(allBefore.overview.submittedTrackCount, 7);
  assert.deepEqual(queue.buildQueuePublicStats(input), allBefore);
  assert.equal(JSON.stringify(input), original);
  assert.notEqual(played.sourceDigest, allBefore.sourceDigest);
  assert.equal(queue.buildQueuePublicStats({ ...input, playedOnly: true }).sourceDigest, played.sourceDigest);
  const privateShow = { ...input.sessions[0], purpose: "rehearsal" };
  assert.equal(queue.buildQueuePublicStats({ revision: 19, sessions: [privateShow], playedOnly: true }).shows.length, 0);
  const preview = queue.buildQueueAdminPreviewStats({ revision: 19, selectedSession: privateShow, playedOnly: true });
  assert.equal(preview.overview.submittedTrackCount, 3);
  assert.equal(queue.buildQueueAdminPreviewStats({ revision: 19, selectedSession: privateShow }).overview.submittedTrackCount, 7);
});

test("archive refresh requests played projection; ordinary stats remain the complete history", async () => {
  const route = require("../src/app/api/queue/stats/route.ts");
  const played = await route.GET(new Request("https://example.test/api/queue/stats?view=played"));
  assert.equal(played.status, 200);
  assert.equal((await played.json()).catalogScope, "played_broadcast");
  const all = await route.GET(new Request("https://example.test/api/queue/stats"));
  assert.equal((await all.json()).catalogScope, undefined);
  const page = fs.readFileSync(path.join(projectRoot, "src/app/radio/archive/page.tsx"), "utf8");
  const component = fs.readFileSync(path.join(projectRoot, "src/components/BroadcastArchive.tsx"), "utf8");
  assert.match(page, /getPublicQueueStats\(null, true\)/);
  assert.match(component, /refreshEndpoint = "\/api\/queue\/stats\?view=played"/);
});

test("external host-finished records stay distinct from playback receipts and never credit mere load or removal", () => {
  const externalTypes = ["spotify", "soundcloud", "link", "other"];
  const completed = externalTypes.flatMap((sourceType) => [
    entry(`${sourceType}-finished`, "@external", { sourceType, outcome: "finished" }),
    entry(`${sourceType}-skipped`, "@external", { sourceType, outcome: "skipped" }),
    entry(`${sourceType}-unknown`, "@external", { sourceType, status: "completed" }),
  ]);
  const nativeSilent = ["upload", "youtube", "tiktok"].map((sourceType) =>
    entry(`${sourceType}-silent`, "@native", { sourceType, outcome: "finished" }));
  const removed = externalTypes.map((sourceType) => entry(`${sourceType}-removed`, "@external", { sourceType, outcome: "removed", status: "removed" }));
  const partial = entry("external-partial", "@partial", { sourceType: "spotify", outcome: "removed", status: "removed" });
  const loaded = { ...entry("external-loaded", "@loaded", { sourceType: "spotify", status: "playing" }), playedAt: at(3) };
  const simulation = entry("external-simulation", "@simulation", { sourceType: "spotify", outcome: "finished", isTestTrack: true });
  const source = session("external-show", "live_broadcast", {
    queue: externalTypes.map((sourceType) => entry(`${sourceType}-waiting`, "@waiting", { sourceType })),
    loadedTrack: loaded, completed: [...completed, ...nativeSilent, simulation], removed: [...removed, partial],
    showLog: [showLogEvent(1, "track_loaded", loaded), showLogEvent(2, "track_play_started", partial), showLogEvent(3, "track_resumed", partial)],
  });
  const original = JSON.stringify(source);
  const stats = queue.buildQueuePublicStats({ revision: 40, sessions: [source], playedOnly: true });
  const roster = stats.shows[0].trackRoster;
  assert.deepEqual(roster.map((track) => track.trackId).sort(), [...externalTypes.map((type) => `${type}-finished`), partial.id].sort());
  assert.ok(roster.filter((track) => track.outcome === "finished").every((track) => track.broadcastEvidence === "external_host_finished"));
  assert.equal(roster.find((track) => track.trackId === partial.id).broadcastEvidence, "playback_recorded");
  assert.equal(stats.shows[0].milestones.filter((event) => event.eventType === "track_play_started").length, 1, "do not synthesize playback events for host-finished tracks");
  assert.equal(JSON.stringify(source), original, "history reads never backfill playback or natural completion");
  const privateShow = { ...source, purpose: "rehearsal" };
  assert.equal(queue.buildQueuePublicStats({ revision: 40, sessions: [privateShow], playedOnly: true }).shows.length, 0);
  const preview = queue.buildQueueAdminPreviewStats({ revision: 40, selectedSession: privateShow, playedOnly: true });
  assert.equal(preview.shows[0].trackRoster.length, 6, "only the authorized preview may also include its simulation");
});

test("Radio and Archive reconcile a 50-submission show: 21 playback receipts plus 20 external finishes, nine removals excluded", () => {
  const { buildRadioShowFeature } = require("../src/lib/radio-show-feature.ts");
  const observed = Array.from({ length: 21 }, (_, i) => entry(`observed-${i}`, `@artist${i % 11}`, {
    artist: `Project ${i % 11}`, sourceType: i < 18 ? "upload" : "youtube", outcome: "finished", createdAt: at(i),
  }));
  observed[0].playbackEndedNaturally = true;
  const external = Array.from({ length: 20 }, (_, i) => entry(`external-${i}`, `@artist${11 + i % 14}`, {
    artist: `Project ${11 + i % 14}`, sourceType: i < 11 ? "spotify" : "other", outcome: "finished", createdAt: at(i + 21),
  }));
  const removed = Array.from({ length: 9 }, (_, i) => entry(`removed-${i}`, `@removed${i}`, { sourceType: "spotify", outcome: "removed", status: "removed" }));
  let sequence = 0;
  const log = (eventType, track, occurredAt) => showLogEvent(++sequence, eventType, track, occurredAt);
  const show = session("mixed-source-show", "live_broadcast", {
    completed: [...observed, ...external], removed,
    showLog: [
      log("broadcast_started", null, at(0)),
      ...observed.slice(1).map((track, i) => log("track_play_started", track, at(i + 1))),
      log("track_resumed", observed[1], at(23)),
      ...external.flatMap((track, i) => [log("track_loaded", track, at(25 + i * 5)), log("track_finished", track, at(29 + i * 5))]),
      ...Array.from({ length: 14 }, (_, i) => log("wheel_spun", null, at(130 + i))),
      log("session_archived", null, at(288)),
    ],
  });
  const input = { revision: 41, sessions: [show] };
  const original = JSON.stringify(input);
  const all = queue.buildQueuePublicStats(input);
  const archive = queue.buildQueuePublicStats({ ...input, playedOnly: true });
  const feature = buildRadioShowFeature(archive);
  assert.equal(all.latestShow.submittedTrackCount, 50);
  assert.equal(all.latestShow.finishedTrackCount, 41);
  assert.equal(all.latestShow.removedTrackCount, 9);
  assert.equal(archive.latestShow.trackRoster.length, 41);
  assert.equal(archive.latestShow.trackRoster.filter((track) => track.broadcastEvidence === "playback_recorded").length, 21);
  assert.equal(archive.latestShow.trackRoster.filter((track) => track.broadcastEvidence === "external_host_finished").length, 20);
  assert.equal(archive.artists.length, 34, "accepted primary artists retain cards before airplay");
  assert.equal(archive.artists.filter(artist => artist.tracks.length > 0).length, 25);
  assert.equal(feature.show.tracksInShow, 41);
  assert.equal(feature.show.artistCredits, 25);
  assert.equal(feature.show.hostFinishedExternalTracks, 20);
  assert.equal(feature.show.wheelSpins, 14);
  assert.equal(feature.show.durationSeconds, 288 * 60);
  assert.equal(feature.show.href, "/radio/archive?view=shows&show=mixed-source-show");
  for (const track of external) {
    assert.ok(archive.artists.some((artist) => artist.tracks.some((record) => record.trackId === track.id)), "external tracks and their music links must be discoverable in the artist catalog too");
    assert.equal(archive.latestShow.trackRoster.find((record) => record.trackId === track.id).publicSourceUrl, track.link);
  }
  assert.deepEqual(queue.buildQueuePublicStats(input), all, "complete Deck/BNL history stays intact");
  assert.equal(JSON.stringify(input), original);
});

test("Radio switches from the live Deck to the exact archived show using observed playback", () => {
  const { buildRadioShowFeature } = require("../src/lib/radio-show-feature.ts");
  const silent = entry("silent-finish", "@silent", { outcome: "finished" });
  const complete = { ...entry("complete", "@artist", { artist: "Signal Artist", outcome: "finished" }), playbackEndedNaturally: true };
  const partial = entry("partial", "@artist", { artist: "Signal Artist", outcome: "removed", status: "removed" });
  const simulated = { ...entry("simulation", "@simulation", { outcome: "finished", isTestTrack: true }), playbackEndedNaturally: true };
  const live = session("public-night", "live_broadcast", {
    status: "open", queueOpen: true, showStarted: true, broadcastPhase: "broadcast_active",
    completed: [silent, complete, simulated], removed: [partial],
    showLog: [
      showLogEvent(1, "broadcast_started", null, at(0)),
      showLogEvent(2, "track_loaded", silent),
      showLogEvent(3, "track_finished", silent),
      showLogEvent(4, "track_play_started", complete),
      showLogEvent(5, "track_play_started", partial),
      showLogEvent(6, "track_resumed", partial),
      showLogEvent(7, "wheel_spun"),
      showLogEvent(8, "wheel_cancelled"),
      showLogEvent(9, "wheel_spun"),
    ],
  });
  const original = JSON.stringify(live);
  const stats = queue.buildQueuePublicStats({ revision: 20, activeSessionId: live.sessionId, sessions: [live], playedOnly: true });
  const feature = buildRadioShowFeature(stats, Date.parse(at(45)));
  assert.equal(feature.mode, "live");
  assert.equal(feature.show.href, "/radio/deck");
  assert.equal(feature.queueHref, "/queue/public-night");
  assert.equal(feature.submissionsOpen, true);
  assert.equal(feature.show.tracksInShow, 2, "a silent Finish and a simulation must not inflate playback");
  assert.equal(feature.show.artistCredits, 1);
  assert.equal(feature.show.wheelSpins, 2, "cancelled selections still count as real spins");
  assert.equal(feature.show.durationSeconds, 45 * 60);
  assert.deepEqual(feature.show.artists, [{ name: "Signal Artist", href: "/radio/archive?view=artists&artist=signal%20artist" }]);
  assert.doesNotMatch(JSON.stringify(feature), /private-browser-token|private@example|storage.example|pi_private|submittedByTikTokHandle|sourceRevision/);

  const ended = { ...live, status: "archived", broadcastPhase: "ended", queueOpen: false,
    showLog: [...live.showLog, showLogEvent(10, "session_archived", null, at(90))] };
  const archive = buildRadioShowFeature(queue.buildQueuePublicStats({ revision: 21, sessions: [ended], playedOnly: true }), Date.parse(at(180)));
  assert.equal(archive.mode, "archive");
  assert.equal(archive.show.href, "/radio/archive?view=shows&show=public-night");
  assert.equal(archive.show.durationSeconds, 90 * 60, "an archived duration must stop advancing");
  assert.equal(archive.show.tracksInShow, 2);
  assert.equal(archive.queueHref, null);
  assert.equal(archive.submissionsOpen, false);
  assert.equal(JSON.stringify(live), original, "the feature never changes queue history");
});

test("Radio keeps private rehearsals dark and retains the last public show during intake", () => {
  const { buildRadioShowFeature } = require("../src/lib/radio-show-feature.ts");
  const heard = { ...entry("public-track", "@public", { outcome: "finished" }), playbackEndedNaturally: true };
  const archived = session("public-archive", "live_broadcast", { completed: [heard], broadcastPhase: "ended" });
  const privateShow = session("secret-rehearsal", "rehearsal", {
    title: "Private rehearsal title", showDate: "2026-09-01", status: "open", queueOpen: true,
    completed: [{ ...heard, id: "private-track" }],
  });
  const publicStats = (sessions, activeSessionId) => queue.buildQueuePublicStats({ revision: 22, sessions, activeSessionId, playedOnly: true });
  const feature = buildRadioShowFeature(publicStats([archived, privateShow], privateShow.sessionId));
  assert.equal(feature.mode, "archive");
  assert.equal(feature.show.title, archived.title);
  assert.equal(feature.show.durationSeconds, null, "missing broadcast events do not fabricate a duration");
  assert.equal(feature.queueHref, null);
  assert.doesNotMatch(JSON.stringify(feature), /secret-rehearsal|Private rehearsal title|private-track/);
  const empty = buildRadioShowFeature(publicStats([privateShow], privateShow.sessionId));
  assert.equal(empty.mode, "archive");
  assert.equal(empty.show, null);

  const intake = session("next-public-show", "live_broadcast", { status: "open", queueOpen: true, broadcastPhase: "submission_window" });
  const beforeShow = buildRadioShowFeature(publicStats([archived, intake], intake.sessionId));
  assert.equal(beforeShow.mode, "archive", "opening submissions alone is not an on-air claim");
  assert.equal(beforeShow.show.title, archived.title);
  assert.equal(beforeShow.submissionsOpen, true);
  assert.equal(beforeShow.queueHref, "/queue/next-public-show");
  assert.equal(buildRadioShowFeature(queue.buildQueuePublicStats({ revision: 22, sessions: [archived] })).show, null, "full outcome counts are not a substitute for playback evidence");
});

test("Radio feature endpoint shares only a compact anonymous public summary and honors the production gate", async () => {
  const route = require("../src/app/api/queue/stats/route.ts");
  const response = await route.GET(new Request("https://example.test/api/queue/stats?view=feature", {
    headers: { "x-barcode-submitter-token": "private-browser-token", cookie: "barcode-admin=private" },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /public.*s-maxage=30/);
  assert.equal(response.headers.get("vary"), null);
  const result = await response.json();
  assert.equal(result.schemaVersion, "radio_show_feature_v2");
  assert.deepEqual(Object.keys(result).sort(), ["mode", "queueHref", "schemaVersion", "show", "submissionsOpen"]);
  assert.doesNotMatch(JSON.stringify(result), /private-browser-token|personalHistory|sourceRevision|trackRoster/);
  process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "false";
  try {
    const disabled = await route.GET(new Request("https://example.test/api/queue/stats?view=feature"));
    assert.deepEqual(await disabled.json(), { schemaVersion: "radio_show_feature_v2", mode: "archive", submissionsOpen: false, queueHref: null, show: null });
  } finally {
    process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
  }
});
