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
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
Module._extensions[".tsx"] = Module._extensions[".ts"];

const require = createRequire(import.meta.url);
const queue = require("../src/lib/queue.ts");
const timing = require("../src/lib/queue-timing.ts");
const { derivePublicShowState } = require("../src/lib/live-status-public.ts");
const queueRoute = require("../src/app/api/queue/route.ts");

function publicTrack(id, isSimulation = false) {
  return {
    id,
    submittedArtistName: `${id} Artist`,
    submittedSongTitle: `${id} Song`,
    sourceType: "link",
    lane: "regular",
    durationLabel: "3:00",
    detectedDurationSeconds: 180,
    estimatedDurationSeconds: 180,
    durationIsEstimate: false,
    isSimulation,
  };
}

function snapshot(purpose) {
  const real = publicTrack("real");
  const simulation = publicTrack("simulation", true);
  return {
    revision: 17,
    sessionActive: true,
    session: {
      sessionId: `${purpose}-session`,
      title: `${purpose} session`,
      showDate: "2026-08-31",
      status: "open",
      purpose,
      description: "private test",
      completedCount: 0,
      completedRuntimeSeconds: 0,
      activeCount: 1,
      acceptedCount: 1,
      removedCount: 0,
      submissionCooldownSeconds: 0,
      queueOpen: true,
      showStarted: true,
      broadcastPhase: "broadcast_active",
      broadcastStartedAt: "2026-08-31T19:00:00.000Z",
      wheelSpinsOwed: 0,
      priorityUpgradesEnabled: false,
      priorityUpgradeLabel: "Priority Signal",
      priorityUpgradeInstructions: "",
      priorityUpgradePriceCents: 0,
      priorityUpgradeCurrency: "usd",
      priorityUpgradePaymentsEnabled: false,
      signalHoldEnabled: false,
      signalHoldLabel: "Signal Hold",
      signalHoldInstructions: "",
      signalHoldPriceCents: 0,
      signalHoldCurrency: "usd",
      signalHoldPaymentsEnabled: false,
    },
    status: {
      isOpen: true,
      activeCount: 1,
      acceptedCount: 1,
      estimatedRuntimeSeconds: 180,
      capacity: 44,
      pressure: "low",
    },
    queue: [real, simulation],
    completed: [],
    nowPlaying: null,
    upNext: null,
    submitterStatus: null,
  };
}

function storedEntry(id, isTestTrack = false) {
  return {
    id,
    artist: `${id} Artist`,
    title: `${id} Song`,
    submittedArtistName: `${id} Artist`,
    submittedSongTitle: `${id} Song`,
    link: `https://music.example.test/${id}`,
    tier: "free",
    lane: "regular",
    amount: 0,
    status: "completed",
    createdAt: "2026-08-31T19:00:00.000Z",
    playedAt: "2026-08-31T19:03:00.000Z",
    completedAt: "2026-08-31T19:04:00.000Z",
    playbackOutcome: "finished",
    tiktokHandle: `@${id}`,
    normalizedTikTokHandle: `@${id}`,
    sourceType: "link",
    isTestTrack,
  };
}

function storedSession(id, purpose, tracks) {
  return {
    sessionId: id,
    title: `${id} Show`,
    showDate: "2026-08-31",
    createdAt: "2026-08-31T18:00:00.000Z",
    updatedAt: "2026-08-31T22:00:00.000Z",
    status: "archived",
    purpose,
    provenanceRevision: 3,
    queueOpen: false,
    showStarted: false,
    broadcastPhase: "ended",
    queue: [],
    nextInLineTrack: null,
    loadedTrack: null,
    completed: tracks,
    removed: [],
    spotlight: [],
    showLog: [],
  };
}

test("private sessions collapse to an empty public snapshot and suppress independent Live Now state", () => {
  for (const purpose of ["rehearsal", "simulation", "internal_test", "unknown"]) {
    const hidden = queue.sanitizeQueueSnapshotForPublic(snapshot(purpose));
    assert.equal(hidden.session, null);
    assert.equal(hidden.sessionActive, false);
    assert.equal(hidden.suppressPublicLiveStatus, true);
    assert.deepEqual(hidden.queue, []);
    assert.deepEqual(hidden.completed, []);
    assert.equal(JSON.stringify(hidden).includes("private test"), false);
    assert.equal(derivePublicShowState({ queueProductionEnabled: true, isLive: true, queueSnapshot: hidden }).siteShowMode, "offline");
  }
});

test("the public queue API and public schedule consume only the sanitized public state", async () => {
  const response = await queueRoute.GET(new Request("https://example.test/api/queue"));
  const payload = await response.json();
  const schedule = fs.readFileSync(path.join(projectRoot, "src/components/LocalSchedule.tsx"), "utf8");

  assert.equal(response.status, 200);
  assert.equal(payload.session, null);
  assert.equal(payload.suppressPublicLiveStatus, true);
  assert.deepEqual(payload.queue, []);
  assert.match(schedule, /siteShowMode\s*===\s*"broadcast_live"/);
  assert.doesNotMatch(schedule, /const\s*\{\s*isLive\s*\}\s*=\s*useLiveStatus/);
});

test("live broadcasts remain public while simulation tracks stay out of public queue surfaces", () => {
  const visible = queue.sanitizeQueueSnapshotForPublic(snapshot("live_broadcast"));
  assert.equal(visible.session?.purpose, "live_broadcast");
  assert.equal(visible.suppressPublicLiveStatus, false);
  assert.deepEqual(visible.queue.map((track) => track.id), ["real"]);
  assert.equal(derivePublicShowState({ queueProductionEnabled: true, isLive: false, queueSnapshot: visible }).siteShowMode, "broadcast_live");
});

test("simulation tracks count in private timing but stay excluded from live-broadcast timing", () => {
  const simulation = { id: "sim", status: "queued", detectedDurationSeconds: 180, durationIsEstimate: false, isTestTrack: true };
  const rehearsal = timing.buildQueueTimingSnapshot({ queue: [simulation], session: { purpose: "rehearsal", sponsorBreakStatus: "completed" } });
  const internal = timing.buildQueueTimingSnapshot({ queue: [simulation], session: { purpose: "internal_test", sponsorBreakStatus: "completed" } });
  const live = timing.buildQueueTimingSnapshot({ queue: [simulation], session: { purpose: "live_broadcast", sponsorBreakStatus: "completed" } });
  assert.equal(rehearsal.remainingPlayableCount, 1);
  assert.equal(rehearsal.projectedRemainingShowSeconds, 240);
  assert.equal(internal.remainingPlayableCount, 1);
  assert.equal(live.remainingPlayableCount, 0);
  assert.equal(live.projectedRemainingShowSeconds, 0);
});

test("admin Archive Preview selects one private persisted session and includes its simulation evidence", () => {
  const real = storedEntry("real");
  const simulation = storedEntry("simulation", true);
  const privateSession = storedSession("private-rehearsal", "rehearsal", [real, simulation]);
  const publicProjection = queue.buildQueuePublicStats({ revision: 31, activeSessionId: null, sessions: [privateSession] });
  const adminProjection = queue.buildQueueAdminPreviewStats({ revision: 31, selectedSession: privateSession });

  assert.equal(publicProjection.overview.showCount, 0);
  assert.equal(adminProjection.overview.showCount, 1);
  assert.equal(adminProjection.overview.submittedTrackCount, 2);
  assert.deepEqual(adminProjection.shows.map((show) => show.sessionId), ["private-rehearsal"]);
  assert.equal(adminProjection.shows[0].trackRoster.find((track) => track.trackId === "simulation")?.isSimulation, true);
  assert.equal(adminProjection.sourceRevision, 31);
  assert.match(adminProjection.sourceDigest, /^[a-f0-9]{64}$/);
});

test("the private Broadcast Test surface is authenticated, noindexed, and reuses the Deck and Archive", () => {
  const page = fs.readFileSync(path.join(projectRoot, "src/app/admin/queue/broadcast-test/page.tsx"), "utf8");
  const route = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/queue/broadcast-preview/route.ts"), "utf8");
  const deck = fs.readFileSync(path.join(projectRoot, "src/components/BroadcastDeck.tsx"), "utf8");
  const archive = fs.readFileSync(path.join(projectRoot, "src/components/BroadcastArchive.tsx"), "utf8");

  assert.match(page, /verifyAdminToken/);
  assert.match(page, /robots:\s*\{\s*index:\s*false/);
  assert.match(page, /PRIVATE BROADCAST TEST/);
  assert.match(page, /filter\(\(session\) => session\.purpose !== "live_broadcast"\)/);
  assert.match(page, /BroadcastDeck/);
  assert.match(page, /BroadcastArchive/);
  assert.match(route, /verifyAdminToken/);
  assert.match(route, /getQueueAdminPreviewStats/);
  assert.match(route, /getQueueAdminPreviewReadback/);
  assert.match(deck, /queueEndpoint/);
  assert.match(deck, /statsEndpoint/);
  assert.match(archive, /refreshEndpoint/);
});

test("the active private queue dashboard opens that session's Deck Preview directly", () => {
  const queuePage = fs.readFileSync(path.join(projectRoot, "src/app/admin/queue/page.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");

  assert.match(queuePage, /href="\/admin\/queue\/broadcast-test"/);
  assert.match(queuePage, /Browse Test Broadcasts/);
  assert.match(dashboard, /state\.session\.purpose === "rehearsal"/);
  assert.match(dashboard, /state\.session\.purpose === "simulation"/);
  assert.match(dashboard, /state\.session\.purpose === "internal_test"/);
  assert.match(dashboard, /broadcast-test\?sessionId=\$\{encodeURIComponent\(state\.session\.sessionId\)\}&surface=deck/);
  assert.match(dashboard, /Open Test Broadcast Deck/);
  assert.match(dashboard, /target="_blank"/);
});

test("BNL controls expose exactly no access, private access, and public access in plain language", () => {
  const showManagement = fs.readFileSync(path.join(projectRoot, "src/components/AdminShowManagement.tsx"), "utf8");
  const provenance = fs.readFileSync(path.join(projectRoot, "src/components/AdminQueueSessionProvenance.tsx"), "utf8");
  const queueArchive = fs.readFileSync(path.join(projectRoot, "src/components/AdminQueueArchive.tsx"), "utf8");

  for (const source of [showManagement, provenance]) {
    assert.match(source, /No BNL queue access/);
    assert.match(source, /Private BNL queue access/);
    assert.match(source, /Public BNL queue access/);
    assert.doesNotMatch(source, /show recap|sanitized public message use|Runtime context only|Recap candidates approved|Public copy approved/i);
  }
  assert.match(showManagement, /BNL queue access/);
  assert.match(provenance, /BNL queue access/);
  assert.match(showManagement, /Tests can use private BNL access without appearing in public BNL outputs or the public Broadcast Archive/);
  assert.match(provenance, /Payment, checkout, contact, upload, legal-acceptance, and admin-only fields are never included/);
  assert.match(queueArchive, /No BNL access/);
  assert.match(queueArchive, /Private BNL access/);
  assert.match(queueArchive, /Public BNL access/);
  assert.doesNotMatch(queueArchive, /BNL \{session\.bnlPublicationStatus\}/);
});

test("only a signed rehearsal link extends private intake and checkout beyond authenticated admins", () => {
  const publicQueueRoute = fs.readFileSync(path.join(projectRoot, "src/app/api/queue/route.ts"), "utf8");
  const uploadRoute = fs.readFileSync(path.join(projectRoot, "src/app/api/queue/upload/route.ts"), "utf8");
  const priorityRoute = fs.readFileSync(path.join(projectRoot, "src/app/api/queue/priority-checkout/route.ts"), "utf8");
  const signalHoldRoute = fs.readFileSync(path.join(projectRoot, "src/app/api/queue/signal-hold-checkout/route.ts"), "utf8");
  const accessBoundary = fs.readFileSync(path.join(projectRoot, "src/lib/queue-rehearsal-access.ts"), "utf8");

  assert.match(publicQueueRoute, /sanitizeQueueSnapshotForPublic\(rawSnapshot\)/);
  assert.match(publicQueueRoute, /requestHasRehearsalQueueAccess\(req, rawSnapshot\.session, rawSnapshot\.sessionActive === true\)/);
  assert.match(publicQueueRoute, /allowAdminPrivateSession/);
  assert.match(publicQueueRoute, /allowRehearsalSession/);
  assert.match(uploadRoute, /requestHasRehearsalQueueAccess\(request, snapshot\.session, snapshot\.sessionActive === true\)/);
  assert.match(priorityRoute, /requestHasRehearsalQueueAccess\(req, snapshot\.session, snapshot\.sessionActive === true\)/);
  assert.match(signalHoldRoute, /requestHasRehearsalQueueAccess\(req, snapshot\.session, snapshot\.sessionActive === true\)/);
  assert.match(accessBoundary, /isCurrentSession/);
  assert.match(accessBoundary, /session\.purpose === "rehearsal"/);
  assert.match(accessBoundary, /session\.status !== "archived"/);
  assert.match(accessBoundary, /session\.broadcastPhase !== "ended"/);
  assert.doesNotMatch(accessBoundary, /simulation|internal_test/);
});

test("rehearsal mode provides an admin-copyable private queue link without public discovery", () => {
  const management = fs.readFileSync(path.join(projectRoot, "src/components/AdminShowManagement.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(projectRoot, "src/components/AdminRadioQueueControl.tsx"), "utf8");
  const shareControl = fs.readFileSync(path.join(projectRoot, "src/components/AdminRehearsalShareLink.tsx"), "utf8");
  const issueRoute = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/queue/rehearsal-access/route.ts"), "utf8");
  const acceptRoute = fs.readFileSync(path.join(projectRoot, "src/app/queue/rehearsal/[sessionId]/route.ts"), "utf8");

  assert.match(management, /session\.purpose === "rehearsal" && <AdminRehearsalShareLink/);
  assert.match(dashboard, /state\?\.session\?\.purpose === "rehearsal" && <AdminRehearsalShareLink/);
  assert.match(shareControl, /Copy Rehearsal Queue Link/);
  assert.match(shareControl, /This session stays unlisted/);
  assert.match(issueRoute, /verifyAdminRequest/);
  assert.match(issueRoute, /createRehearsalQueueToken/);
  assert.match(acceptRoute, /verifyRehearsalQueueToken/);
  assert.match(acceptRoute, /response\.cookies\.set\(REHEARSAL_QUEUE_COOKIE_NAME/);
  assert.match(acceptRoute, /Referrer-Policy", "no-referrer/);
  assert.match(acceptRoute, /noindex, nofollow, noarchive/);
});
