import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

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

const baseTime = Date.parse("2026-08-21T20:00:00.000Z");
const at = (minute) => new Date(baseTime + minute * 60_000).toISOString();

function entry(id, handle, options = {}) {
  const outcome = options.outcome ?? null;
  const terminal = outcome !== null || options.status === "completed" || options.status === "played";
  return {
    id,
    artist: options.artist ?? `${id} Artist`,
    title: `${id} Song`,
    submittedArtistName: options.artist ?? `${id} Artist`,
    submittedSongTitle: `${id} Song`,
    link: `https://private.example.test/${id}`,
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
    sourceType: "upload",
    fileUrl: `https://storage.example.test/${id}.mp3`,
    fileName: `${id}.mp3`,
    priorityUpgradePaymentId: options.priorityUpgradePaymentId ?? "pi_private_priority",
    signalHoldPaymentId: options.signalHoldPaymentId ?? "pi_private_signal_hold",
    signalHoldStatus: options.signalHoldStatus ?? "active",
    suspiciousFlags: ["private_flag"],
    isTestTrack: options.isTestTrack === true,
  };
}

function session(id, purpose, options = {}) {
  return {
    sessionId: id,
    title: options.title ?? `${id} Show`,
    showDate: options.showDate ?? "2026-08-21",
    createdAt: options.createdAt ?? at(-10),
    updatedAt: options.updatedAt ?? at(20),
    status: options.status ?? "archived",
    purpose,
    queue: options.queue ?? [],
    nextInLineTrack: options.nextInLineTrack ?? null,
    loadedTrack: options.loadedTrack ?? null,
    completed: options.completed ?? [],
    removed: options.removed ?? [],
    spotlight: options.spotlight ?? [],
    showLog: options.showLog ?? [],
  };
}

const counts = (submittedTrackCount, finishedTrackCount, skippedTrackCount, removedTrackCount, activeTrackCount, unknownOutcomeTrackCount) => ({
  submittedTrackCount,
  finishedTrackCount,
  skippedTrackCount,
  removedTrackCount,
  activeTrackCount,
  unknownOutcomeTrackCount,
});

test("public queue stats aggregate exact TikTok handles across live broadcasts without double-counting", () => {
  const active = entry("active", "TikTok.com/@Signal.Artist", { artist: "Signal Artist", createdAt: at(8) });
  const finished = entry("finished", "@SIGNAL.ARTIST", { artist: "Signal Artist", outcome: "finished", createdAt: at(4) });
  const skipped = entry("skipped", "signal.artist", { artist: "Signal Artist", outcome: "skipped", createdAt: at(5) });
  const removed = entry("removed", "@signal.artist", { artist: "Signal Artist", outcome: "removed", status: "removed", removedAt: at(7), createdAt: at(6) });
  const other = entry("other", "@another.artist", { artist: "Another Artist", outcome: "finished" });
  const simulation = entry("simulation", "@signal.artist", { outcome: "finished", isTestTrack: true });
  const legacyUnknown = entry("legacy", "@signal.artist", { artist: "Earlier Name", status: "played", createdAt: at(-20) });

  const result = queue.buildQueuePublicStats({
    revision: 42,
    activeSessionId: "live-current",
    requestedTikTokHandle: "https://www.tiktok.com/@SIGNAL.ARTIST?lang=en",
    sessions: [
      session("live-current", "live_broadcast", {
        status: "open",
        showDate: "2026-08-21",
        queue: [active],
        nextInLineTrack: active,
        completed: [finished, skipped, other, simulation],
        removed: [removed],
      }),
      session("live-prior", "live_broadcast", {
        showDate: "2026-08-14",
        completed: [legacyUnknown],
      }),
      session("rehearsal", "rehearsal", {
        showDate: "2026-08-20",
        completed: [entry("rehearsal-track", "@signal.artist", { outcome: "finished" })],
      }),
      session("legacy-private", "unknown", {
        showDate: "2026-08-13",
        completed: [entry("legacy-private-track", "@signal.artist", { outcome: "finished" })],
      }),
    ],
  });

  assert.equal(result.schemaVersion, "queue_public_stats_v1");
  assert.equal(result.revision, 42);
  assert.deepEqual(result.overview, {
    showCount: 2,
    ...counts(6, 2, 1, 1, 1, 1),
  });
  assert.deepEqual(result.currentShow, {
    sessionId: "live-current",
    title: "live-current Show",
    showDate: "2026-08-21",
    status: "open",
    ...counts(5, 2, 1, 1, 1, 0),
  });
  assert.deepEqual(result.latestShow, result.currentShow);
  assert.deepEqual(result.artist, {
    tiktokHandle: "@signal.artist",
    artistNames: ["Signal Artist", "Earlier Name"],
    showCount: 2,
    firstShowDate: "2026-08-14",
    latestShowDate: "2026-08-21",
    ...counts(5, 1, 1, 1, 1, 1),
    currentShow: counts(4, 1, 1, 1, 1, 0),
  });
});

test("public queue stats do not enumerate handles and serialize no private queue fields", () => {
  const privateEntry = entry("private", "@privacy.artist", {
    artist: "Privacy Artist",
    outcome: "finished",
    contactEmail: "secret@example.test",
    submitterToken: "secret-browser-token",
    stripeSessionId: "cs_secret",
    priorityUpgradePaymentId: "pi_secret_priority",
    signalHoldPaymentId: "pi_secret_hold",
  });
  const input = {
    revision: 9,
    activeSessionId: null,
    sessions: [session("public-live", "live_broadcast", { completed: [privateEntry] })],
  };

  const anonymous = queue.buildQueuePublicStats(input);
  assert.equal(anonymous.artist, null);
  assert.doesNotMatch(JSON.stringify(anonymous), /privacy\.artist/i);

  const selected = queue.buildQueuePublicStats({ ...input, requestedTikTokHandle: "@privacy.artist" });
  const json = JSON.stringify(selected);
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
    "sourceType",
    "submittedSongTitle",
  ]) {
    assert.doesNotMatch(json, new RegExp(forbidden, "i"));
  }
});

test("public queue stats route is GET-only, validates handles, and disables caching", async () => {
  const route = require("../src/app/api/queue/stats/route.ts");
  assert.equal(typeof route.GET, "function");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(route[method], undefined);

  const invalid = await route.GET(new Request("https://example.test/api/queue/stats?tiktokHandle=%20%20"));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("cache-control"), "no-store");

  const response = await route.GET(new Request("https://example.test/api/queue/stats"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).schemaVersion, "queue_public_stats_v1");
});
