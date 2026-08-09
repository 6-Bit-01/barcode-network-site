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

test("pending and newly confirmed Priority skips become safe action-rail events", () => {
  const pending = entry("pending", {
    submittedArtistName: "Artist One",
    submittedSongTitle: "Signal One",
    tiktokHandle: "@artistone",
    priorityUpgradeStatus: "checkout_pending",
    priorityUpgradeCheckoutCreatedAt: "2026-08-09T03:00:30.000Z",
    priorityUpgradePaymentId: "pi_do_not_show",
  });
  const pendingSnapshot = foreground.resolveForegroundOverlaySnapshot({ queueState: queueState({ queue: [pending] }), scene: scene() }, new Date("2026-08-09T03:01:00.000Z"));
  assert.equal(pendingSnapshot.action.label, "SKIP SENT");
  assert.equal(pendingSnapshot.action.message, "Artist One — Signal One // FOR @artistone");
  assert.doesNotMatch(JSON.stringify(pendingSnapshot.action), /pi_do_not_show/);

  const confirmed = entry("confirmed", {
    submittedArtistName: "Artist Two",
    submittedSongTitle: "Signal Two",
    priorityUpgradeStatus: "paid",
    priorityUpgradePaidAt: "2026-08-09T03:00:45.000Z",
  });
  const confirmedSnapshot = foreground.resolveForegroundOverlaySnapshot({ queueState: queueState({ queue: [confirmed] }), scene: scene() }, new Date("2026-08-09T03:01:00.000Z"));
  assert.equal(confirmedSnapshot.action.label, "SKIP CONFIRMED");
  assert.match(confirmedSnapshot.action.message, /Artist Two — Signal Two/);

  const oldConfirmation = foreground.resolveForegroundOverlaySnapshot({ queueState: queueState({ queue: [confirmed] }), scene: scene(), bnl: { message: "BNL relay standing by.", publishedAt: "2026-08-09T03:04:00.000Z" } }, new Date("2026-08-09T03:05:00.000Z"));
  assert.equal(oldConfirmation.action.label, "BNL");
  assert.equal(oldConfirmation.action.message, "BNL relay standing by.");
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

test("one chained show simulation updates track, skip, Wheel, sponsor, and intake state without stale owners", () => {
  const playing = entry("playing", { status: "playing", playedAt: "2026-08-09T03:00:00.000Z", submittedArtistName: "Live Artist", submittedSongTitle: "Live Track" });
  const priority = entry("priority", { priorityUpgradeStatus: "checkout_pending", priorityUpgradeCheckoutCreatedAt: "2026-08-09T03:01:00.000Z" });
  const baseSession = { ...queueState().session, activeCount: 2, wheelSpinsOwed: 1 };

  const sent = foreground.resolveForegroundOverlaySnapshot({
    queueState: queueState({ nowPlaying: playing, loadedTrack: playing, queue: [priority], session: baseSession, publicStatus: { ...queueState().publicStatus, activeCount: 2 } }),
    scene: scene("now_playing", { wheelSpinsOwed: 1 }),
  }, new Date("2026-08-09T03:01:30.000Z"));
  assert.equal(sent.track.id, "playing");
  assert.equal(sent.action.label, "SKIP SENT");
  assert.equal(sent.wheelSpinsOwed, 1);
  assert.equal(sent.submissionsOpen, true);

  const confirmedPriority = { ...priority, priorityUpgradeStatus: "paid", priorityUpgradePaidAt: "2026-08-09T03:01:45.000Z" };
  const wheel = foreground.resolveForegroundOverlaySnapshot({
    queueState: queueState({ nowPlaying: playing, loadedTrack: playing, queue: [confirmedPriority], session: baseSession }),
    scene: scene("wheel_ready", { wheelSpinsOwed: 1, wheelOverlayActive: true, message: "Candidates standing by." }),
  }, new Date("2026-08-09T03:02:00.000Z"));
  assert.equal(wheel.action.label, "WHEEL READY");
  assert.equal(wheel.action.message, "Candidates standing by.");

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
  assert.equal(closed.action.label, "SKIP CONFIRMED");
});

test("functional receiver is exact-source, reconnect-aware, and opened beside the live overlay", () => {
  const receiver = fs.readFileSync(path.join(projectRoot, "src/components/ForegroundOverlayReceiver.tsx"), "utf8");
  const strip = fs.readFileSync(path.join(projectRoot, "src/components/ForegroundOverlayStrip.tsx"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "src/app/overlay/foreground/calibration/foreground-calibration.css"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "src/components/AdminLiveOverlayControl.tsx"), "utf8");
  const api = fs.readFileSync(path.join(projectRoot, "src/app/api/overlay/foreground/route.ts"), "utf8");
  const combined = `${receiver}\n${strip}`;

  assert.match(receiver, /fetch\("\/api\/overlay\/foreground"/);
  assert.match(receiver, /visibilitychange/);
  assert.match(receiver, /addEventListener\("focus"/);
  assert.match(receiver, /addEventListener\("online"/);
  assert.match(receiver, /data-source-resolution="1080x1920"/);
  assert.match(receiver, /"--fg-key-color": "#0000ff"/);
  assert.match(css, /\.foreground-overlay-canvas > \.foreground-strip/);
  assert.match(css, /top: calc\(var\(--fg-anchor-y\) - var\(--fg-height\)\)/);
  assert.match(admin, /href="\/overlay\/live"[\s\S]*href="\/overlay\/foreground"/);
  assert.match(admin, /Open Live Overlay/);
  assert.match(admin, /Open Foreground Overlay/);
  assert.match(api, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(combined, /current[- ](?:song|track).*remaining|time left in (?:this|current) (?:song|track)/i);
});
