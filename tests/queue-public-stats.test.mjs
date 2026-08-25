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
  assert.equal(result.currentShow.milestones.find((event) => event.eventType === "wheel_spin_unlocked").detail, "2 Wheel spins are waiting.");
  assert.equal(result.currentShow.milestones.find((event) => event.eventType === "track_skipped").headline, "Track skipped");
  assert.equal(result.currentShow.milestones.find((event) => event.eventType === "track_playback_error").headline, "Playback issue detected");
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

test("the active queue is the only public Broadcast Deck entry point", () => {
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
  assert.match(archive, /Completed-play outcomes only/);
  assert.match(archive, /deckHref &&/);

  assert.doesNotMatch(gateway, /href="\/radio\/deck"/);
  assert.match(gateway, /href="\/radio\/archive"/);
  assert.match(publicQueue, /\/radio\/deck/);
  assert.match(publicQueue, /Done submitting—or just watching\?/);
  assert.match(publicQueue, /Song submissions stay here in the queue/);
  assert.match(publicQueue, /Submission complete · follow the show on the Deck/);
  assert.match(publicQueue, /\/radio\/archive/);
  assert.doesNotMatch(radio, /\/radio\/deck/);
  assert.match(radio, /\/radio\/archive/);
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
