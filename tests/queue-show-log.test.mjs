import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

delete process.env.QUEUE_REDIS_REST_URL;
delete process.env.QUEUE_REDIS_REST_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.BLOB_READ_WRITE_TOKEN;
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
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const queue = require("../src/lib/queue.ts");
const showLog = require("../src/lib/queue-show-log.ts");

let trackSequence = 0;

async function startFreshSession(label) {
  const current = await queue.getRadioQueueState();
  if (current.session && current.session.status !== "archived") {
    await queue.archiveCurrentQueueSession();
  }
  return queue.startNewQueueSession({
    title: `${label} ${Date.now()}`,
    queueCapacity: 44,
    submissionCooldownSeconds: 0,
  });
}

async function addTrack({ label, sourceType, link, tiktokHandle, contactEmail }) {
  trackSequence += 1;
  return queue.addToQueue({
    artist: `${label} Artist`,
    title: `${label} Song`,
    submittedArtistName: `${label} Artist`,
    submittedSongTitle: `${label} Song`,
    submitterArtistName: `${label} Submitter`,
    tiktokHandle,
    normalizedTikTokHandle: tiktokHandle.toLowerCase(),
    contactEmail,
    submitterToken: `secret-token-${trackSequence}`,
    legalAcceptance: {
      termsVersion: "secret-terms",
      privacyVersion: "secret-privacy",
      queueTermsVersion: "secret-queue-terms",
      acceptedAt: "2026-08-16T20:00:00.000Z",
      checkboxText: "secret legal acceptance",
    },
    link,
    fileUrl: sourceType === "upload" ? link : null,
    fileName: sourceType === "upload" ? `${label}.mp3` : null,
    fileSize: sourceType === "upload" ? 123_456 : null,
    mimeType: sourceType === "upload" ? "audio/mpeg" : null,
    sourceType,
    detectedDurationSeconds: 180,
    durationSource: sourceType === "upload" ? "upload_metadata" : "provider_metadata",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: `secret-stripe-${trackSequence}`,
    priorityUpgradePaymentId: null,
    createdAt: new Date(Date.UTC(2026, 7, 16, 20, 0, trackSequence)).toISOString(),
  });
}

test("private show log records submission, load, playback, outcome, archive, TikTok, and public links", async () => {
  const started = await startFreshSession("Show Log");
  const sessionId = started.session.sessionId;
  await queue.setQueueOpen(true);

  const upload = await addTrack({
    label: "Private Upload",
    sourceType: "upload",
    link: "https://private-store.private.blob.vercel-storage.com/barcode-radio-queue/private-upload.mp3",
    tiktokHandle: "@@Upload.Artist",
    contactEmail: "upload-secret@example.test",
  });
  const linked = await addTrack({
    label: "Public Link",
    sourceType: "youtube",
    link: "https://www.youtube.com/watch?v=abcdefghijk",
    tiktokHandle: "Linked_Artist",
    contactEmail: "link-secret@example.test",
  });

  await queue.updateRadioTrack("", "startShow");
  await queue.updateRadioTrack("", "pullNext");
  await queue.updateRadioTrack(upload.id, "load");
  const playback = await queue.recordQueuePlaybackEvent({
    sessionId,
    trackId: upload.id,
    provider: "audio",
    eventType: "play",
    currentTimeSeconds: 0,
    durationSeconds: 180,
  });
  assert.equal(playback.accepted, true);
  await queue.updateRadioTrack(upload.id, "finish");
  await queue.updateRadioTrack(linked.id, "load");
  await queue.updateRadioTrack(linked.id, "remove");
  await queue.archiveCurrentQueueSession();

  const exported = await queue.getQueueSessionShowLog(sessionId);
  assert.equal(exported.schemaVersion, "barcode_queue_show_log_v1");
  assert.equal(exported.session.sessionId, sessionId);
  assert.equal(exported.session.status, "archived");
  assert.deepEqual(
    exported.events.map((event) => event.sequence),
    exported.events.map((_, index) => index + 1),
    "events remain append-only and monotonically ordered",
  );
  for (const event of exported.events) {
    assert.ok(Number.isFinite(Date.parse(event.occurredAt)), `${event.eventType} must have an ISO timestamp`);
  }

  const eventTypes = exported.events.map((event) => event.eventType);
  for (const expected of [
    "session_created",
    "submissions_opened",
    "broadcast_started",
    "track_loaded",
    "track_play_started",
    "track_finished",
    "track_removed",
    "submissions_closed",
    "session_archived",
  ]) {
    assert.ok(eventTypes.includes(expected), `missing ${expected}`);
  }
  assert.equal(eventTypes.filter((eventType) => eventType === "track_submitted").length, 2);

  const uploadEvents = exported.events.filter((event) => event.track?.trackId === upload.id);
  const linkedEvents = exported.events.filter((event) => event.track?.trackId === linked.id);
  assert.ok(uploadEvents.length >= 4);
  assert.ok(linkedEvents.length >= 3);
  assert.ok(uploadEvents.every((event) => event.track.tiktokHandle === "@upload.artist"));
  assert.ok(linkedEvents.every((event) => event.track.tiktokHandle === "@linked_artist"));
  assert.ok(uploadEvents.every((event) => event.track.publicSourceUrl === null), "private upload URLs must never enter the log");
  assert.ok(linkedEvents.every((event) => event.track.publicSourceUrl === "https://www.youtube.com/watch?v=abcdefghijk"));

  const uploadSubmitted = uploadEvents.find((event) => event.eventType === "track_submitted");
  const linkedSubmitted = linkedEvents.find((event) => event.eventType === "track_submitted");
  const uploadPlayed = uploadEvents.find((event) => event.eventType === "track_play_started");
  const uploadFinished = uploadEvents.find((event) => event.eventType === "track_finished");
  assert.equal(uploadSubmitted.occurredAt, upload.createdAt);
  assert.equal(linkedSubmitted.occurredAt, linked.createdAt);
  assert.equal(uploadSubmitted.track.submissionOrder, 1);
  assert.equal(linkedSubmitted.track.submissionOrder, 2);
  assert.equal(uploadPlayed.track.playedOrder, 1);
  assert.equal(uploadFinished.track.playedOrder, 1);

  const serialized = JSON.stringify(exported);
  for (const forbidden of [
    "upload-secret@example.test",
    "link-secret@example.test",
    "secret-token-",
    "secret-stripe-",
    "secret legal acceptance",
    "private-store.private.blob.vercel-storage.com",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }

  const csv = await queue.getQueueSessionShowLogCsv(sessionId);
  assert.match(csv.csv, /TikTok handle/);
  assert.match(csv.csv, /@upload\.artist/);
  assert.match(csv.csv, /@linked_artist/);
  assert.match(csv.csv, /https:\/\/www\.youtube\.com\/watch\?v=abcdefghijk/);
  assert.doesNotMatch(csv.csv, /upload-secret@example\.test|secret-token-|private-store\.private\.blob/);

  const publicSnapshot = await queue.getPublicQueueSnapshot(sessionId);
  assert.doesNotMatch(JSON.stringify(publicSnapshot), /"showLog"|barcode_queue_show_log_v1/);

  const beforeRejectedEvent = exported.events.length;
  const rejected = await queue.recordQueuePlaybackEvent({
    sessionId,
    trackId: upload.id,
    provider: "audio",
    eventType: "play",
  });
  assert.equal(rejected.accepted, false);
  assert.equal((await queue.getQueueSessionShowLog(sessionId)).events.length, beforeRejectedEvent);
});

test("simulation tracks are omitted from the operator show log", async () => {
  const started = await startFreshSession("Simulation exclusion");
  const sessionId = started.session.sessionId;
  await queue.updateRadioTrack("", "addSimulationFreeTrack");
  const exported = await queue.getQueueSessionShowLog(sessionId);
  assert.deepEqual(exported.events.map((event) => event.eventType), ["session_created"]);
  assert.ok(exported.events.every((event) => event.track === null));
});

test("show-log normalization is bounded and strips non-public upload URLs", () => {
  const occurredAt = "2026-08-16T20:00:00.000Z";
  const inputs = Array.from({ length: showLog.MAX_QUEUE_SHOW_LOG_EVENTS + 2 }, (_, index) => ({
    eventType: "track_submitted",
    occurredAt,
    track: {
      trackId: `track-${index + 1}`,
      artist: "Artist",
      title: "Song",
      tiktokHandle: "@@Artist Handle!",
      sourceType: "upload",
      publicSourceUrl: "https://private.example.test/audio.mp3",
      submissionOrder: index + 1,
      playedOrder: null,
    },
  }));
  const normalized = showLog.appendQueueShowLogEvents([], inputs);
  assert.equal(normalized.length, showLog.MAX_QUEUE_SHOW_LOG_EVENTS);
  assert.equal(normalized[0].sequence, 3);
  assert.equal(normalized.at(-1).sequence, showLog.MAX_QUEUE_SHOW_LOG_EVENTS + 2);
  assert.equal(normalized[0].track.tiktokHandle, "@artisthandle");
  assert.equal(normalized[0].track.publicSourceUrl, null);
});

test("the download surface is private and confined to authenticated admin UI", () => {
  const route = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/queue/show-log/route.ts"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");
  const archive = fs.readFileSync(path.join(projectRoot, "src/components/AdminQueueArchive.tsx"), "utf8");
  assert.ok(route.indexOf("await assertAdmin()") < route.indexOf("new URL(req.url)"));
  assert.match(route, /private, no-store/);
  assert.match(route, /verifyAdminToken/);
  assert.match(admin, /\/api\/admin\/queue\/show-log/);
  assert.match(archive, /\/api\/admin\/queue\/show-log/);
});
