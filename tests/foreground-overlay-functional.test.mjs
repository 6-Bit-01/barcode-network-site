import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) return path.join(projectRoot, "src", request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const foreground = require("../src/lib/foreground-overlay-resolver.ts");

function entry(id, overrides = {}) {
  return {
    id,
    artist: "Submitted Artist",
    title: "Submitted Track",
    submittedArtistName: "Submitted Artist",
    submittedSongTitle: "Submitted Track",
    link: "https://example.com/track",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    status: "queued",
    createdAt: "2026-08-09T03:00:00.000Z",
    playedAt: null,
    ...overrides,
  };
}

function queueState(overrides = {}) {
  return {
    revision: 7,
    nowPlaying: null,
    loadedTrack: null,
    nextInLine: null,
    queue: [],
    history: [],
    removed: [],
    totalPlayed: 0,
    streamStatus: "online",
    publicStatus: { isOpen: true, activeCount: 0, acceptedCount: 0, estimatedRuntimeSeconds: 0, capacity: 44, pressure: "low" },
    session: {
      sessionId: "session-1",
      title: "BARCODE Radio",
      status: "open",
      purpose: "rehearsal",
      bnlPublicationStatus: "private",
      provenanceRevision: 1,
      showDate: "2026-08-08",
      createdAt: "2026-08-09T02:00:00.000Z",
      updatedAt: "2026-08-09T03:00:00.000Z",
      queueOpen: true,
      description: "",
      trackLimitPerArtist: 3,
      queueCapacity: 44,
      skipGameTapTarget: 10_000,
      submissionCooldownSeconds: 0,
      activeCount: 0,
      completedCount: 0,
      removedCount: 0,
      spotlightCount: 0,
      estimatedActiveRuntimeSeconds: 0,
      completedRuntimeSeconds: 0,
      nextNonPriorityLane: "regular",
      wheelSpinsOwed: 0,
      priorityUpgradesEnabled: true,
      priorityUpgradeLabel: "Priority Signal",
      priorityUpgradeInstructions: "",
      priorityUpgradePriceCents: 1000,
      priorityUpgradeCurrency: "usd",
      priorityUpgradePaymentsEnabled: true,
      sponsorBreakSeconds: 630,
      sponsorBreakStatus: "not_due",
    },
    ...overrides,
  };
}

function scene(mode = "session_active", overrides = {}) {
  return {
    mode,
    resolvedMode: mode,
    reason: "test",
    title: "BARCODE RADIO",
    subtitle: "TEST",
    priority: 20,
    automatic: true,
    overrideActive: false,
    updatedAt: "2026-08-09T03:00:00.000Z",
    wheelSpinsOwed: 0,
    wheelOverlayActive: false,
    ...overrides,
  };
}

test("artist/title phase remains anchored across background or reconnect catch-up", () => {
  assert.deepEqual(foreground.foregroundIdentityPhaseAt(0, 0), { phase: "artist", remainingMs: 12_000 });
  assert.equal(foreground.foregroundIdentityPhaseAt(0, 11_999).phase, "artist");
  assert.deepEqual(foreground.foregroundIdentityPhaseAt(0, 12_000), { phase: "track", remainingMs: 6_000 });
  assert.equal(foreground.foregroundIdentityPhaseAt(0, 17_999).phase, "track");
  assert.deepEqual(foreground.foregroundIdentityPhaseAt(0, 18_000), { phase: "artist", remainingMs: 12_000 });
});

test("operational action rotation is anchored and advances without polling drift", () => {
  const actions = [
    { id: "one", label: "ONE", message: "ONE", tone: "neutral", source: "queue", occurredAt: null },
    { id: "two", label: "TWO", message: "TWO", tone: "neutral", source: "queue", occurredAt: null },
    { id: "three", label: "THREE", message: "THREE", tone: "neutral", source: "queue", occurredAt: null },
  ];
  assert.equal(foreground.foregroundActionAt(actions, 0, 0).id, "one");
  assert.equal(foreground.foregroundActionAt(actions, 0, foreground.FOREGROUND_ACTION_HOLD_MS).id, "two");
  assert.equal(foreground.foregroundActionAt(actions, 0, foreground.FOREGROUND_ACTION_HOLD_MS * 2).id, "three");
  assert.equal(foreground.foregroundActionAt(actions, 0, foreground.FOREGROUND_ACTION_HOLD_MS * 3).id, "one");
});

test("foreground snapshot exposes only safe track identity and live queue state", () => {
  const current = entry("current", {
    detectedArtistName: "Detected Artist",
    detectedSongTitle: "Detected Track",
    playedAt: "2026-08-09T03:04:00.000Z",
    contactEmail: "private@example.com",
    priorityUpgradePaymentId: "pi_private",
    priorityUpgradeCheckoutUrl: "https://checkout.example/private",
  });
  const state = queueState({
    nowPlaying: current,
    loadedTrack: current,
    publicStatus: { isOpen: false, activeCount: 1, acceptedCount: 1, estimatedRuntimeSeconds: 300, capacity: 44, pressure: "low" },
    session: { ...queueState().session, queueOpen: false, wheelSpinsOwed: 12 },
  });
  const snapshot = foreground.resolveForegroundOverlaySnapshot({ queueState: state, scene: scene("now_playing", { wheelSpinsOwed: 12 }) }, new Date("2026-08-09T03:05:00.000Z"));
  assert.deepEqual(snapshot.track, { id: "current", artistName: "Detected Artist", trackTitle: "Detected Track", cycleStartedAt: "2026-08-09T03:04:00.000Z" });
  assert.equal(snapshot.submissionsOpen, false);
  assert.equal(snapshot.wheelSpinsOwed, 12);
  assert.doesNotMatch(JSON.stringify(snapshot), /private@example|pi_private|checkout\.example|contactEmail|paymentId/i);
});

test("pending Priority stays off the rail and confirmed gifted Priority owns exactly three seconds", () => {
  const pending = entry("pending", {
    submittedArtistName: "Artist One",
    submittedSongTitle: "Signal One",
    tiktokHandle: "@artistone",
    priorityUpgradeStatus: "checkout_pending",
    priorityUpgradeCheckoutCreatedAt: "2026-08-09T03:00:30.000Z",
    priorityUpgradePaymentId: "pi_do_not_show",
  });
  const pendingSnapshot = foreground.resolveForegroundOverlaySnapshot({ queueState: queueState({ queue: [pending] }), scene: scene() }, new Date("2026-08-09T03:01:00.000Z"));
  assert.notEqual(pendingSnapshot.action.source, "priority");
  assert.doesNotMatch(JSON.stringify(pendingSnapshot), /SKIP SENT|pi_do_not_show/);

  const confirmed = entry("confirmed", {
    submittedArtistName: "Artist Two",
    submittedSongTitle: "Signal Two",
    priorityUpgradeStatus: "paid",
    priorityUpgradePaidAt: "2026-08-09T03:00:45.000Z",
    priorityGiftAttribution: {
      version: "1.0",
      supporterName: "Signal Friend",
      recipientName: "Artist Two",
      capturedAt: "2026-08-09T03:00:30.000Z",
    },
  });
  const confirmedSnapshot = foreground.resolveForegroundOverlaySnapshot({ queueState: queueState({ queue: [confirmed] }), scene: scene("wheel_spinning", { message: "Wheel still owns the fallback." }) }, new Date("2026-08-09T03:00:46.000Z"));
  assert.equal(confirmedSnapshot.action.label, "GIFTED PRIORITY");
  assert.equal(confirmedSnapshot.action.message, "FROM Signal Friend // FOR Artist Two // THANK YOU FOR THE SKIP");
  assert.equal(confirmedSnapshot.action.expiresAt, "2026-08-09T03:00:48.000Z");
  assert.equal(confirmedSnapshot.actions[1].label, "WHEEL SPINNING");
  assert.equal(foreground.foregroundActionWithExpiryAt(confirmedSnapshot.actions, confirmedSnapshot.actionCycleStartedAt, Date.parse("2026-08-09T03:00:47.999Z")).label, "GIFTED PRIORITY");
  assert.equal(foreground.foregroundActionWithExpiryAt(confirmedSnapshot.actions, confirmedSnapshot.actionCycleStartedAt, Date.parse("2026-08-09T03:00:48.000Z")).label, "WHEEL SPINNING");
  assert.equal(foreground.foregroundActionWithExpiryAt(confirmedSnapshot.actions, confirmedSnapshot.actionCycleStartedAt, Date.parse("2026-08-09T03:01:48.000Z")).label, "WHEEL SPINNING", "reconnects must not replay the popup");

  const oldConfirmation = foreground.resolveForegroundOverlaySnapshot({ queueState: queueState({ queue: [confirmed] }), scene: scene() }, new Date("2026-08-09T03:05:00.000Z"));
  assert.notEqual(oldConfirmation.action.source, "priority");
  assert.ok(oldConfirmation.actions.length >= 3);
});

test("passive rail traffic comes from live show owners instead of BNL Relays", () => {
  const playing = entry("playing", { status: "playing", playedAt: "2026-08-09T03:00:00.000Z" });
  const next = entry("next", { status: "next", submittedArtistName: "Next Artist", submittedSongTitle: "Next Signal" });
  const openState = queueState({
    nowPlaying: playing,
    nextInLine: next,
    publicStatus: { isOpen: true, activeCount: 7, acceptedCount: 19, estimatedRuntimeSeconds: 2100, capacity: 44, pressure: "low" },
    session: {
      ...queueState().session,
      showStarted: true,
      broadcastPhase: "broadcast_active",
      broadcastStartedAt: "2026-08-09T03:00:00.000Z",
      activeCount: 7,
      acceptedCount: 19,
      completedCount: 12,
      updatedAt: "2026-08-09T03:00:30.000Z",
    },
  });
  const snapshot = foreground.resolveForegroundOverlaySnapshot({ queueState: openState, scene: scene("now_playing") }, new Date("2026-08-09T03:02:00.000Z"));
  const labels = snapshot.actions.map((action) => action.label);
  assert.ok(labels.includes("SIGNAL LOCKED"));
  assert.ok(labels.includes("INTAKE OPEN"));
  assert.ok(labels.includes("NEXT SIGNAL"));
  assert.ok(labels.includes("SIGNAL STACK"));
  assert.ok(labels.includes("ARCHIVE SYNC"));
  assert.ok(snapshot.actions.every((action) => action.source !== "bnl"));
  assert.equal(snapshot.actionCycleStartedAt, "2026-08-09T03:00:30.000Z");
});

test("closed intake, sponsor due, and owed Wheel spins produce BARCODE status traffic", () => {
  const state = queueState({
    publicStatus: { isOpen: false, activeCount: 22, acceptedCount: 44, estimatedRuntimeSeconds: 6600, capacity: 44, pressure: "max", closureReason: "capacity" },
    session: {
      ...queueState().session,
      queueOpen: false,
      acceptedCount: 44,
      activeCount: 22,
      completedCount: 22,
      submissionClosureReason: "capacity",
      showStarted: true,
      broadcastPhase: "broadcast_active",
      broadcastStartedAt: "2026-08-09T01:00:00.000Z",
      wheelSpinsOwed: 2,
      sponsorBreakStatus: "due",
    },
  });
  const snapshot = foreground.resolveForegroundOverlaySnapshot({ queueState: state, scene: scene() }, new Date("2026-08-09T03:05:00.000Z"));
  assert.deepEqual(snapshot.actions.slice(0, 3).map((action) => action.label), ["WHEEL UNLOCKED", "SPONSOR WINDOW", "INTAKE MAXED"]);
  assert.ok(snapshot.actions.some((action) => action.label === "INTAKE MAXED"));
  assert.match(snapshot.actions.find((action) => action.label === "WHEEL UNLOCKED").message, /2 SPINS ARMED/);
});

test("Wheel, sponsor, and system scenes stay partnered with live-overlay priority", () => {
  const state = queueState({ session: { ...queueState().session, sponsorBreakStatus: "running", sponsorBreakStartedAt: "2026-08-09T03:00:00.000Z", sponsorBreakSeconds: 630 } });
  const wheel = foreground.resolveForegroundOverlaySnapshot({ queueState: state, scene: scene("wheel_spinning", { message: "Result incoming.", wheelOverlayActive: true }) }, new Date("2026-08-09T03:01:00.000Z"));
  assert.equal(wheel.action.label, "WHEEL SPINNING");
  assert.equal(wheel.action.tone, "wheel");

  const sponsor = foreground.resolveForegroundOverlaySnapshot({ queueState: state, scene: scene("sponsor") }, new Date("2026-08-09T03:01:00.000Z"));
  assert.equal(sponsor.action.label, "SPONSOR BREAK");
  assert.equal(sponsor.sponsorEndsAt, "2026-08-09T03:10:30.000Z");

  const system = foreground.resolveForegroundOverlaySnapshot({ queueState: queueState(), scene: scene("system_message", { title: "BNL-01", message: "Transmission received." }) }, new Date("2026-08-09T03:01:00.000Z"));
  assert.equal(system.action.label, "BNL");
  assert.equal(system.action.message, "Transmission received.");
});

test("one chained show simulation updates track, gifted skip, Wheel, sponsor, and intake state without stale owners", () => {
  const playing = entry("playing", { status: "playing", playedAt: "2026-08-09T03:00:00.000Z", submittedArtistName: "Live Artist", submittedSongTitle: "Live Track" });
  const priority = entry("priority", { priorityUpgradeStatus: "checkout_pending", priorityUpgradeCheckoutCreatedAt: "2026-08-09T03:01:00.000Z" });
  const baseSession = { ...queueState().session, activeCount: 2, wheelSpinsOwed: 1 };

  const sent = foreground.resolveForegroundOverlaySnapshot({
    queueState: queueState({ nowPlaying: playing, loadedTrack: playing, queue: [priority], session: baseSession, publicStatus: { ...queueState().publicStatus, activeCount: 2 } }),
    scene: scene("now_playing", { wheelSpinsOwed: 1 }),
  }, new Date("2026-08-09T03:01:30.000Z"));
  assert.equal(sent.track.id, "playing");
  assert.equal(sent.action.label, "WHEEL UNLOCKED");
  assert.equal(sent.wheelSpinsOwed, 1);
  assert.equal(sent.submissionsOpen, true);

  const confirmedPriority = { ...priority, priorityUpgradeStatus: "paid", priorityUpgradePaidAt: "2026-08-09T03:01:45.000Z", priorityGiftAttribution: { version: "1.0", supporterName: "Anonymous", recipientName: "Submitted Artist", capturedAt: "2026-08-09T03:01:00.000Z" } };
  const wheel = foreground.resolveForegroundOverlaySnapshot({
    queueState: queueState({ nowPlaying: playing, loadedTrack: playing, queue: [confirmedPriority], session: baseSession }),
    scene: scene("wheel_ready", { wheelSpinsOwed: 1, wheelOverlayActive: true, message: "Candidates standing by." }),
  }, new Date("2026-08-09T03:01:46.000Z"));
  assert.equal(wheel.action.label, "GIFTED PRIORITY");
  assert.equal(wheel.actions[1].label, "WHEEL READY");
  assert.equal(foreground.foregroundActionWithExpiryAt(wheel.actions, wheel.actionCycleStartedAt, Date.parse("2026-08-09T03:01:48.000Z")).label, "WHEEL READY");

  const sponsorSession = { ...baseSession, sponsorBreakStatus: "running", sponsorBreakStartedAt: "2026-08-09T03:02:00.000Z" };
  const sponsor = foreground.resolveForegroundOverlaySnapshot({
    queueState: queueState({ nowPlaying: playing, loadedTrack: playing, queue: [confirmedPriority], session: sponsorSession }),
    scene: scene("sponsor"),
  }, new Date("2026-08-09T03:03:00.000Z"));
  assert.equal(sponsor.action.label, "SPONSOR BREAK");
  assert.equal(sponsor.sponsorEndsAt, "2026-08-09T03:12:30.000Z");

  const closedSession = { ...baseSession, queueOpen: false, sponsorBreakStatus: "completed" };
  const closed = foreground.resolveForegroundOverlaySnapshot({
    queueState: queueState({ nowPlaying: playing, loadedTrack: playing, queue: [confirmedPriority], session: closedSession, publicStatus: { ...queueState().publicStatus, isOpen: false, activeCount: 2 } }),
    scene: scene("now_playing"),
  }, new Date("2026-08-09T03:03:15.000Z"));
  assert.equal(closed.submissionsOpen, false);
  assert.equal(closed.sponsorEndsAt, null);
  assert.equal(closed.action.label, "WHEEL UNLOCKED");
});

test("functional receiver is a permanent session-driven Studio source", () => {
  const receiver = fs.readFileSync(path.join(projectRoot, "src/components/ForegroundOverlayReceiver.tsx"), "utf8");
  const sessionBoundPolling = fs.readFileSync(path.join(projectRoot, "src/lib/session-bound-polling.ts"), "utf8");
  const strip = fs.readFileSync(path.join(projectRoot, "src/components/ForegroundOverlayStrip.tsx"), "utf8");
  const foregroundSource = fs.readFileSync(path.join(projectRoot, "src/lib/foreground-overlay.ts"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "src/app/overlay/foreground/calibration/foreground-calibration.css"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "src/components/AdminLiveOverlayControl.tsx"), "utf8");
  const api = fs.readFileSync(path.join(projectRoot, "src/app/api/overlay/foreground/route.ts"), "utf8");
  const sourceAccessApi = fs.readFileSync(path.join(projectRoot, "src/app/api/admin/overlay/source-access/route.ts"), "utf8");
  const combined = `${receiver}\n${strip}`;

  assert.match(receiver, /fetch\("\/api\/overlay\/foreground"/);
  assert.match(receiver, /startPermanentOverlayPolling\(\{[\s\S]*activeIntervalMs: POLL_INTERVAL_MS,[\s\S]*standbyIntervalMs: FOREGROUND_OVERLAY_STANDBY_POLL_INTERVAL_MS,[\s\S]*poll: load/);
  assert.match(sessionBoundPolling, /visibilitychange/);
  assert.match(sessionBoundPolling, /addEventListener\("focus"/);
  assert.match(sessionBoundPolling, /addEventListener\("online"/);
  assert.match(receiver, /data-source-resolution="1080x1920"/);
  assert.match(receiver, /"--fg-key-color": "#0000ff"/);
  assert.match(css, /\.foreground-overlay-canvas > \.foreground-strip/);
  assert.match(css, /top: calc\(var\(--fg-anchor-y\) - var\(--fg-height\)\)/);
  assert.match(admin, /One-Time TikTok Studio Source Setup/);
  assert.match(admin, /\/api\/admin\/overlay\/source-access/);
  assert.match(admin, /Load Permanent Private Links/);
  assert.doesNotMatch(admin, /Open Live Overlay|Open Foreground Overlay|Preview Visuals|Copy Visuals Link|Preview Wheel Source|Copy Wheel Link/);
  assert.match(api, /"Cache-Control": "no-store"/);
  assert.match(api, /allowPrivateQueueState: true/);
  assert.match(api, /verifyStudioOverlayToken/);
  assert.match(api, /authorization\.startsWith\("Bearer "\)/);
  assert.match(receiver, /studioOverlayRequestHeaders/);
  assert.doesNotMatch(receiver, /foreground-access|verifyForegroundOverlayToken/);
  assert.match(sourceAccessApi, /createStudioOverlayToken/);
  assert.match(sourceAccessApi, /https:\/\/www\.barcode-network\.com/);
  assert.match(sourceAccessApi, /\/overlay\/foreground\$\{fragment\}/);
  assert.match(receiver, /sessionActive \? <ForegroundOverlayStrip/);
  assert.match(receiver, /foregroundActionWithExpiryAt/);
  assert.doesNotMatch(foregroundSource, /resolveBNLCurrentView/);
  assert.match(strip, /useRef<number \| null>\(null\)/);
  assert.match(strip, /previousCount === null/);
  assert.match(css, /--fg-primary-size: 36px/);
  assert.match(css, /padding: 6px 18px 0/);
  assert.doesNotMatch(combined, /current[- ](?:song|track).*remaining|time left in (?:this|current) (?:song|track)/i);
});
