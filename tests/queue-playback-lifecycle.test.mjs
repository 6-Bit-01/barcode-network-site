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
const lifecycle = require("../src/lib/queue-playback-lifecycle.ts");
const audioResponse = require("../src/lib/queue-audio-response.ts");
const diagnosticExport = require("../src/lib/queue-playback-diagnostics.ts");

let sequence = 0;

async function startFreshQueueSession(options) {
  const current = await queue.getRadioQueueState();
  if (current.revision !== 0 && current.session.status !== "archived") {
    await queue.archiveCurrentQueueSession();
  }
  return queue.startNewQueueSession(options);
}

async function freshSession(label, options = {}) {
  const state = await startFreshQueueSession({
    title: `${label} ${Date.now()} ${sequence}`,
    queueCapacity: options.queueCapacity ?? 44,
    submissionCooldownSeconds: 0,
  });
  await queue.setQueueOpen(true);
  await queue.updateRadioTrack("", "startShow");
  return state.session.sessionId;
}

async function addUpload(label, options = {}) {
  sequence += 1;
  const artist = options.artist ?? `${label} Artist`;
  const title = options.title ?? `${label} Track`;
  return queue.addToQueue({
    artist,
    title,
    submittedArtistName: artist,
    submittedSongTitle: title,
    tiktokHandle: `@${label.toLowerCase().replace(/[^a-z0-9]/g, "")}${sequence}`,
    contactEmail: options.contactEmail ?? null,
    link: options.fileUrl ?? `https://store.private.blob.vercel-storage.com/barcode-radio-queue/${label}-${sequence}.mp3`,
    fileUrl: options.fileUrl ?? `https://store.private.blob.vercel-storage.com/barcode-radio-queue/${label}-${sequence}.mp3`,
    fileName: options.fileName ?? `${label}-${sequence}.mp3`,
    fileSize: options.fileSize ?? 123_456,
    mimeType: options.mimeType ?? "audio/mpeg",
    sourceType: "upload",
    detectedDurationSeconds: options.durationSeconds ?? null,
    durationSource: options.durationSeconds ? "upload_metadata" : "internal_estimate",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: options.stripeSessionId ?? null,
    priorityUpgradePaymentId: options.priorityUpgradePaymentId ?? null,
    createdAt: new Date(Date.UTC(2026, 7, 8, 2, 0, sequence)).toISOString(),
  });
}

async function loadTrack(track) {
  await queue.updateRadioTrack("", "pullNext");
  return queue.updateRadioTrack(track.id, "load");
}

async function report(track, eventType, values = {}) {
  return queue.recordQueuePlaybackEvent({
    trackId: track.id,
    provider: "audio",
    eventType,
    currentTimeSeconds: values.currentTimeSeconds,
    durationSeconds: values.durationSeconds,
    readyState: values.readyState,
    networkState: values.networkState,
    errorCode: values.errorCode,
  });
}

test("loaded, ready, play, pause, stall, resume, seek, and ended form one truthful lifecycle without auto-finishing", async () => {
  await freshSession("natural lifecycle");
  const track = await addUpload("Natural Lifecycle");
  let state = await loadTrack(track);

  assert.equal(state.playbackDiagnostics.currentTrackId, track.id);
  assert.equal(state.playbackDiagnostics.lifecycleState, "loaded");

  await report(track, "ready", { currentTimeSeconds: 0, durationSeconds: 180, readyState: 4, networkState: 1 });
  await report(track, "play", { currentTimeSeconds: 0, durationSeconds: 180, readyState: 4, networkState: 1 });
  await report(track, "pause", { currentTimeSeconds: 40, durationSeconds: 180, readyState: 4, networkState: 1 });
  await report(track, "stall", { currentTimeSeconds: 40, durationSeconds: 180, readyState: 2, networkState: 2 });
  await report(track, "resume", { currentTimeSeconds: 40, durationSeconds: 180, readyState: 4, networkState: 1 });
  await report(track, "seek", { currentTimeSeconds: 176, durationSeconds: 180, readyState: 4, networkState: 1 });
  await report(track, "ended", { currentTimeSeconds: 180, durationSeconds: 180, readyState: 4, networkState: 1 });

  state = await queue.getRadioQueueState();
  assert.equal(state.nowPlaying?.id, track.id, "a natural media end must stay loaded until the operator chooses an outcome");
  assert.equal(state.history.some((entry) => entry.id === track.id), false, "ended must never silently count as Finish");
  assert.equal(state.removed.some((entry) => entry.id === track.id), false);
  assert.equal(state.playbackDiagnostics.lifecycleState, "ended");
  assert.deepEqual(
    state.playbackDiagnostics.events.slice(-7).map((event) => event.eventType),
    ["ready", "play", "pause", "stall", "resume", "seek", "ended"],
  );
  assert.equal(state.nowPlaying.detectedDurationSeconds, 180, "player duration should replace the internal estimate");
  assert.equal(state.nowPlaying.durationIsEstimate, false);

  state = await queue.updateRadioTrack(track.id, "finish");
  const completed = state.history.find((entry) => entry.id === track.id);
  assert.ok(completed);
  assert.equal(completed.playbackOutcome, "finished");
  assert.equal(completed.playbackEndedNaturally, true);
  assert.equal(completed.playbackEarlyCutoff, false);
  assert.equal(completed.playbackEndPositionSeconds, 180);
  assert.ok(completed.playbackEndPositionObservedAt);
  assert.equal(completed.detectedDurationSeconds, 180);
  assert.equal(state.playbackDiagnostics.currentTrackId, null);
  assert.equal(state.playbackDiagnostics.events.at(-1).eventType, "finish");
});

test("Skip is a completed early cutoff while Remove remains a removal that reopens capacity", async () => {
  await freshSession("skip remove outcomes", { queueCapacity: 1 });
  const skippedTrack = await addUpload("Explicit Skip", { durationSeconds: 300 });
  let state = await loadTrack(skippedTrack);
  await report(skippedTrack, "play", { currentTimeSeconds: 0, durationSeconds: 300 });
  await report(skippedTrack, "pause", { currentTimeSeconds: 120, durationSeconds: 300 });

  state = await queue.updateRadioTrack(skippedTrack.id, "skip");
  const skipped = state.history.find((entry) => entry.id === skippedTrack.id);
  assert.ok(skipped, "Skip should remain part of played broadcast history");
  assert.equal(skipped.playbackOutcome, "skipped");
  assert.equal(skipped.playbackEndedNaturally, false);
  assert.equal(skipped.playbackEarlyCutoff, true);
  assert.equal(skipped.playbackEndPositionSeconds, 120);
  assert.ok(skipped.playbackEndPositionObservedAt);
  assert.equal(state.session.completedCount, 1);
  assert.equal(state.session.acceptedCount, 1, "a skipped aired track still consumes its accepted show slot");

  await freshSession("remove reopens", { queueCapacity: 1 });
  const removedTrack = await addUpload("Explicit Remove", { durationSeconds: 240 });
  state = await loadTrack(removedTrack);
  assert.equal(state.session.acceptedCount, 1);
  assert.equal(state.publicStatus.isOpen, false);
  await report(removedTrack, "play", { currentTimeSeconds: 0, durationSeconds: 240 });
  await report(removedTrack, "pause", { currentTimeSeconds: 15, durationSeconds: 240 });

  state = await queue.updateRadioTrack(removedTrack.id, "remove");
  const removed = state.removed.find((entry) => entry.id === removedTrack.id);
  assert.ok(removed);
  assert.equal(removed.playbackOutcome, "removed");
  assert.equal(state.history.some((entry) => entry.id === removedTrack.id), false);
  assert.equal(state.session.completedCount, 0);
  assert.equal(state.session.acceptedCount, 0);
  assert.equal(state.publicStatus.isOpen, true, "Remove should reopen a capacity-closed session");
});

test("Finish near EOF is not misclassified as an early cutoff", async () => {
  await freshSession("near eof finish");
  const track = await addUpload("Near EOF", { durationSeconds: 300 });
  await loadTrack(track);
  await report(track, "play", { currentTimeSeconds: 0, durationSeconds: 300 });
  await report(track, "pause", { currentTimeSeconds: 297, durationSeconds: 300 });

  const state = await queue.updateRadioTrack(track.id, "finish");
  const completed = state.history.find((entry) => entry.id === track.id);
  assert.equal(completed.playbackOutcome, "finished");
  assert.equal(completed.playbackEndedNaturally, false);
  assert.equal(completed.playbackEarlyCutoff, false);
});

test("fresh action snapshots clock the endpoint while stale lifecycle positions fall back", async () => {
  let diagnostics = lifecycle.emptyQueuePlaybackDiagnostics();
  diagnostics = lifecycle.appendQueuePlaybackEvent(diagnostics, {
    trackId: "track_endpoint",
    provider: "audio",
    eventType: "play",
    currentTimeSeconds: 0,
    durationSeconds: 300,
  }, "track_endpoint", new Date("2026-08-21T20:00:00.000Z")).diagnostics;

  const stale = lifecycle.queuePlaybackOutcomeFields(diagnostics, "track_endpoint", "skipped", {
    now: new Date("2026-08-21T20:03:00.000Z"),
  });
  assert.equal(stale.playbackEndPositionSeconds, null);
  assert.equal(stale.playbackEndPositionObservedAt, null);

  const observedAt = "2026-08-21T20:02:58.000Z";
  const captured = lifecycle.queuePlaybackOutcomeFields(diagnostics, "track_endpoint", "skipped", {
    now: new Date("2026-08-21T20:03:00.000Z"),
    snapshot: {
      trackId: "track_endpoint",
      playbackState: "playing",
      currentTimeSeconds: 118,
      durationSeconds: 300,
      observedAt,
    },
  });
  assert.equal(captured.playbackEndPositionSeconds, 120);
  assert.equal(captured.playbackEndPositionObservedAt, observedAt);
});

test("operator Finish and Skip persist a matching endpoint snapshot", async () => {
  await freshSession("endpoint snapshot");
  const track = await addUpload("Endpoint Snapshot", { durationSeconds: 300 });
  await loadTrack(track);
  await report(track, "play", { currentTimeSeconds: 0, durationSeconds: 300 });
  const observedAt = new Date().toISOString();

  const state = await queue.updateRadioTrack(track.id, "skip", {
    trackId: track.id,
    playbackState: "paused",
    currentTimeSeconds: 87,
    durationSeconds: 300,
    observedAt,
  });
  const completed = state.history.find((entry) => entry.id === track.id);
  assert.equal(completed.playbackEndPositionSeconds, 87);
  assert.equal(completed.playbackEndPositionObservedAt, observedAt);
});

test("stall, malformed-media error, and interrupted-network error never advance the queue", async () => {
  for (const [label, errorCode] of [["Malformed Media", "decode_error"], ["Interrupted Network", "network_error"]]) {
    await freshSession(label);
    const track = await addUpload(label, { durationSeconds: 210 });
    await loadTrack(track);
    await report(track, "ready", { currentTimeSeconds: 0, durationSeconds: 210, readyState: 4, networkState: 1 });
    await report(track, "play", { currentTimeSeconds: 0, durationSeconds: 210, readyState: 4, networkState: 1 });
    await report(track, "stall", { currentTimeSeconds: 31, durationSeconds: 210, readyState: 2, networkState: 2 });
    await report(track, "error", { currentTimeSeconds: 31, durationSeconds: 210, readyState: 0, networkState: 3, errorCode });

    const state = await queue.getRadioQueueState();
    assert.equal(state.nowPlaying?.id, track.id);
    assert.equal(state.history.some((entry) => entry.id === track.id), false);
    assert.equal(state.removed.some((entry) => entry.id === track.id), false);
    assert.equal(state.playbackDiagnostics.lifecycleState, "error");
    assert.equal(state.playbackDiagnostics.lastErrorCode, errorCode);
  }
});

test("stale player events are ignored after the operator clears the loaded track", async () => {
  await freshSession("stale event");
  const track = await addUpload("Stale Event", { durationSeconds: 200 });
  await loadTrack(track);
  await report(track, "play", { currentTimeSeconds: 1, durationSeconds: 200 });
  const finished = await queue.updateRadioTrack(track.id, "finish");
  const eventCount = finished.playbackDiagnostics.events.length;

  const receipt = await report(track, "error", { currentTimeSeconds: 2, durationSeconds: 200, errorCode: "network_error" });
  const state = await queue.getRadioQueueState();
  assert.equal(receipt.accepted, false);
  assert.equal(receipt.reason, "track_not_loaded");
  assert.equal(state.playbackDiagnostics.events.length, eventCount);
  assert.equal(state.history.filter((entry) => entry.id === track.id).length, 1);
});

test("cross-session, wrong-provider, and operator-only client events are rejected without mutation", async () => {
  const sessionId = await freshSession("event boundary");
  const track = await addUpload("Event Boundary", { durationSeconds: 200 });
  const loaded = await loadTrack(track);
  const eventCount = loaded.playbackDiagnostics.events.length;

  const staleSession = await queue.recordQueuePlaybackEvent({ sessionId: `${sessionId}-stale`, trackId: track.id, provider: "audio", eventType: "play" });
  const wrongProvider = await queue.recordQueuePlaybackEvent({ sessionId, trackId: track.id, provider: "youtube", eventType: "play" });
  const operatorOnly = await queue.recordQueuePlaybackEvent({ sessionId, trackId: track.id, provider: "audio", eventType: "finish" });
  const state = await queue.getRadioQueueState();

  assert.equal(staleSession.reason, "track_not_loaded");
  assert.equal(wrongProvider.reason, "invalid_event");
  assert.equal(operatorOnly.reason, "invalid_event");
  assert.equal(state.playbackDiagnostics.events.length, eventCount);
  assert.equal(state.nowPlaying?.id, track.id);
});

test("playback lifecycle history remains bounded", () => {
  let diagnostics = lifecycle.emptyQueuePlaybackDiagnostics();
  diagnostics = lifecycle.appendQueuePlaybackEvent(diagnostics, {
    trackId: "track_bounded",
    provider: "audio",
    eventType: "loaded",
  }, "track_bounded", new Date("2026-08-08T02:00:00.000Z")).diagnostics;
  assert.equal(diagnostics.events[0].currentTimeSeconds, null);
  assert.equal(diagnostics.events[0].durationSeconds, null);
  assert.equal(diagnostics.events[0].readyState, null);
  assert.equal(diagnostics.events[0].networkState, null);

  for (let index = 0; index < lifecycle.MAX_QUEUE_PLAYBACK_EVENTS + 25; index += 1) {
    diagnostics = lifecycle.appendQueuePlaybackEvent(diagnostics, {
      trackId: "track_bounded",
      provider: "audio",
      eventType: index % 2 === 0 ? "play" : "pause",
      currentTimeSeconds: index,
      durationSeconds: 600,
    }, "track_bounded", new Date(1_786_154_400_000 + index * 1_000)).diagnostics;
  }

  assert.equal(diagnostics.events.length, lifecycle.MAX_QUEUE_PLAYBACK_EVENTS);
  assert.ok(diagnostics.events[0].sequence > 1, "oldest events should be discarded first");
  assert.equal(diagnostics.events.at(-1).sequence, lifecycle.MAX_QUEUE_PLAYBACK_EVENTS + 26);
});

test("diagnostic export is bounded, useful, and excludes private upload, contact, and payment fields", async () => {
  await freshSession("private diagnostic export");
  const privateUrl = "https://store.private.blob.vercel-storage.com/barcode-radio-queue/private-diagnostic.mp3";
  const track = await addUpload("Private Diagnostic", {
    fileUrl: privateUrl,
    contactEmail: "private-person@example.com",
    stripeSessionId: "cs_private_secret",
    priorityUpgradePaymentId: "pi_private_secret",
    durationSeconds: 222,
    title: "Private Diagnostic Track https://leak.example/private private-person@example.com cs_private_secret",
  });
  await loadTrack(track);
  await report(track, "play", { currentTimeSeconds: 5, durationSeconds: 222 });
  await report(track, "error", { currentTimeSeconds: 5, durationSeconds: 222, errorCode: "network_error" });
  const state = await queue.getRadioQueueState();

  const exported = diagnosticExport.buildQueuePlaybackDiagnosticExport(state, new Date("2026-08-08T03:00:00.000Z"));
  const json = JSON.stringify(exported);
  assert.equal(exported.schemaVersion, "barcode_queue_playback_diagnostics_v1");
  assert.ok(exported.lifecycle.events.length > 0);
  assert.ok(exported.tracks.some((entry) => entry.trackId === track.id && entry.title === "Private Diagnostic Track [redacted-url] [redacted-email] [redacted-payment-id]"));
  assert.equal(json.includes("https://leak.example/private"), false);
  assert.equal(json.includes(privateUrl), false);
  assert.equal(json.includes("private-person@example.com"), false);
  assert.equal(json.includes("cs_private_secret"), false);
  assert.equal(json.includes("pi_private_secret"), false);
  assert.equal(json.includes("fileUrl"), false);
  assert.equal(json.includes("contactEmail"), false);
  assert.equal(json.includes("stripeSessionId"), false);
  assert.equal(exported.lifecycle.events.length <= lifecycle.MAX_QUEUE_PLAYBACK_EVENTS, true);
  assert.equal(exported.tracks.length <= diagnosticExport.MAX_DIAGNOSTIC_TRACKS, true);
});

test("public queue snapshots never expose playback lifecycle diagnostics or private outcome evidence", async () => {
  await freshSession("public playback privacy");
  const track = await addUpload("Public Playback Privacy", {
    contactEmail: "hidden-playback@example.com",
    stripeSessionId: "cs_hidden_playback",
    priorityUpgradePaymentId: "pi_hidden_playback",
    durationSeconds: 199,
  });
  await loadTrack(track);
  await report(track, "play", { currentTimeSeconds: 0, durationSeconds: 199 });
  await report(track, "error", { currentTimeSeconds: 20, durationSeconds: 199, errorCode: "decode_error" });
  await queue.updateRadioTrack(track.id, "skip");

  const json = JSON.stringify(await queue.getPublicQueueSnapshot());
  for (const privateValue of ["playbackDiagnostics", "playbackOutcome", "playbackIssueCode", "playbackEndPositionSeconds", "playbackEndPositionObservedAt", "hidden-playback@example.com", "cs_hidden_playback", "pi_hidden_playback"]) {
    assert.equal(json.includes(privateValue), false, privateValue);
  }
});

function byteStream(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from(bytes));
      controller.close();
    },
  });
}

function blobResult(bytes, { statusCode = 200, contentType = "audio/mpeg", headers = {} } = {}) {
  return {
    statusCode,
    stream: byteStream(bytes),
    blob: { contentType },
    headers: new Headers(headers),
  };
}

function audioEntry(overrides = {}) {
  return {
    id: "track_audio_delivery",
    sourceType: "upload",
    fileUrl: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/audio-delivery.mp3",
    fileName: "audio-delivery.mp3",
    mimeType: "audio/mpeg",
    ...overrides,
  };
}

test("MP3 full download is served inline with private no-store and byte-range support", async () => {
  let request = null;
  const response = await audioResponse.serveAdminQueueAudio({
    entry: audioEntry(),
    rangeHeader: null,
    getBlob: async (url, options) => {
      request = { url, options };
      return blobResult([1, 2, 3, 4], { headers: { "content-length": "4", "accept-ranges": "bytes" } });
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(request.url, audioEntry().fileUrl);
  assert.deepEqual(request.options, { access: "private" });
});

test("WAV Range, seek, and near-EOF requests preserve exact single-byte ranges and 206 headers", async () => {
  const cases = [
    ["bytes=0-1", "bytes 0-1/10"],
    ["bytes=4-5", "bytes 4-5/10"],
    ["bytes=8-", "bytes 8-9/10"],
    ["bytes=-2", "bytes 8-9/10"],
  ];
  for (const [rangeHeader, contentRange] of cases) {
    let forwardedRange = null;
    const response = await audioResponse.serveAdminQueueAudio({
      entry: audioEntry({ fileUrl: "https://store.private.blob.vercel-storage.com/barcode-radio-queue/audio-delivery.wav", fileName: "audio-delivery.wav", mimeType: "audio/wav" }),
      rangeHeader,
      getBlob: async (_url, options) => {
        forwardedRange = options.headers.range;
        return blobResult([5, 6], {
          statusCode: 200,
          contentType: "audio/wav",
          headers: { "content-range": contentRange, "content-length": "2", "accept-ranges": "bytes" },
        });
      },
    });

    assert.equal(response.status, 206);
    assert.equal(forwardedRange, rangeHeader);
    assert.match(response.headers.get("content-range"), /^bytes /);
    assert.equal(response.headers.get("content-length"), "2");
    assert.equal(response.headers.get("content-type"), "audio/wav");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [5, 6]);
  }
});

test("malformed or multi-range requests fail closed before private storage is read", async () => {
  for (const rangeHeader of ["items=0-1", "bytes=10-5", "bytes=0-1,4-5", "bytes=-", "bytes=-0", "bytes=wat-"]) {
    let called = false;
    const response = await audioResponse.serveAdminQueueAudio({
      entry: audioEntry(),
      rangeHeader,
      getBlob: async () => {
        called = true;
        return blobResult([1]);
      },
    });
    assert.equal(response.status, 416, rangeHeader);
    assert.equal(called, false, rangeHeader);
  }
});

test("invalid partial storage responses and interrupted streams stay errors instead of looking complete", async () => {
  const invalidPartial = await audioResponse.serveAdminQueueAudio({
    entry: audioEntry(),
    rangeHeader: "bytes=100-",
    getBlob: async () => blobResult([1, 2], { statusCode: 206, headers: { "content-length": "2" } }),
  });
  assert.equal(invalidPartial.status, 502);
  assert.match(await invalidPartial.text(), /Audio delivery failed/);

  const mismatchedSeek = await audioResponse.serveAdminQueueAudio({
    entry: audioEntry(),
    rangeHeader: "bytes=400-499",
    getBlob: async () => blobResult([1, 2], { statusCode: 200, headers: { "content-range": "bytes 0-1/1000", "content-length": "2" } }),
  });
  assert.equal(mismatchedSeek.status, 502);

  const unverifiableOpenEnd = await audioResponse.serveAdminQueueAudio({
    entry: audioEntry(),
    rangeHeader: "bytes=100-",
    getBlob: async () => blobResult([1, 2], { statusCode: 200, headers: { "content-range": "bytes 100-101/*", "content-length": "2" } }),
  });
  assert.equal(unverifiableOpenEnd.status, 502);

  const interrupted = await audioResponse.serveAdminQueueAudio({
    entry: audioEntry(),
    rangeHeader: "bytes=100-",
    getBlob: async () => ({
      statusCode: 206,
      blob: { contentType: "audio/mpeg" },
      headers: new Headers({ "content-range": "bytes 100-999/1000", "content-length": "900", "accept-ranges": "bytes" }),
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([1, 2, 3]));
          controller.error(new Error("private upstream interruption"));
        },
      }),
    }),
  });
  assert.equal(interrupted.status, 206);
  await assert.rejects(() => interrupted.arrayBuffer(), /private upstream interruption/);
});

test("storage exceptions return a generic diagnostic-safe response", async () => {
  const privateUrl = audioEntry().fileUrl;
  const response = await audioResponse.serveAdminQueueAudio({
    entry: audioEntry(),
    rangeHeader: null,
    getBlob: async () => { throw new Error(`failed reading ${privateUrl}`); },
  });
  const body = await response.text();
  assert.equal(response.status, 502);
  assert.match(body, /Audio delivery failed/);
  assert.equal(body.includes(privateUrl), false);
});

test("operator UI exposes explicit outcomes and diagnostics without auto-finish code", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");
  const audioPlayer = source.slice(source.indexOf("function AdminAudioPlayer"), source.indexOf("function PlayerDock"));
  assert.match(source, />Skip Track</);
  assert.match(source, /Download Playback Diagnostics/);
  assert.match(source, /Playback ended/);
  assert.match(source, /Playback error/);
  assert.doesNotMatch(audioPlayer, /updateRadioTrack|onAction\([^,]+,\s*"finish"\)|action:\s*"finish"/);
});
