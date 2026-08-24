import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Keep lifecycle acceptance isolated from every configured remote queue store.
delete process.env.QUEUE_REDIS_REST_URL;
delete process.env.QUEUE_REDIS_REST_TOKEN;
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
const {
  SIGNAL_HOLD_DISCLOSURE_TEXT,
  SIGNAL_HOLD_TERMS_VERSION,
} = require("../src/lib/queue-types.ts");

const signalHoldAcceptance = {
  acceptedSignalHoldTerms: true,
  signalHoldTermsVersion: SIGNAL_HOLD_TERMS_VERSION,
  signalHoldDisclosureText: SIGNAL_HOLD_DISCLOSURE_TEXT,
};

let trackSequence = 0;

async function startFreshSession(label, { showStarted = true } = {}) {
  const current = await queue.getRadioQueueState();
  if (current.session && current.session.status !== "archived") {
    await queue.archiveCurrentQueueSession();
  }
  const started = await queue.startNewQueueSession({
    title: `${label} ${Date.now()} ${trackSequence}`,
    queueCapacity: 44,
    submissionCooldownSeconds: 0,
  });
  await queue.setQueueOpen(true);
  if (showStarted) await queue.updateRadioTrack("", "startShow");
  return started.session.sessionId;
}

async function enableSignalHold() {
  const state = await queue.updateSignalHoldSettings({
    enabled: true,
    paymentsEnabled: true,
    priceCents: 900,
    currency: "usd",
  });
  assert.equal(state.session.signalHoldEnabled, true);
  assert.equal(state.session.signalHoldPaymentsEnabled, true);
  assert.equal(state.session.signalHoldPriceCents, 900);
  assert.equal(state.session.signalHoldCurrency, "usd");
  return state;
}

async function addTrack(label, options = {}) {
  trackSequence += 1;
  const artist = options.artist ?? `${label} Artist`;
  return queue.addToQueue({
    artist,
    title: `${label} Track`,
    submittedArtistName: artist,
    submittedSongTitle: `${label} Track`,
    submitterArtistName: artist,
    tiktokHandle: `@${label.toLowerCase().replace(/[^a-z0-9]/g, "")}${trackSequence}`,
    submitterToken: options.submitterToken ?? `signal-hold-owner-${trackSequence}`,
    link: `https://example.com/signal-hold/${trackSequence}`,
    sourceType: "other",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    createdAt: options.createdAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, trackSequence)).toISOString(),
  });
}

function checkoutMetadata(track) {
  const suffix = track.id.replace(/[^a-zA-Z0-9]/g, "").slice(-20) || String(trackSequence);
  return {
    provider: "stripe",
    checkoutSessionId: `cs_hold_${suffix}`,
    checkoutUrl: `https://checkout.stripe.test/signal-hold/${suffix}`,
    checkoutCreatedAt: "2026-08-23T08:00:00.000Z",
    checkoutExpiresAt: "2026-08-23T08:30:00.000Z",
    checkoutOwnerTokenHash: "a".repeat(64),
    signalHoldAcceptance,
  };
}

function paymentMetadata(track, overrides = {}) {
  const suffix = track.id.replace(/[^a-zA-Z0-9]/g, "").slice(-20) || String(trackSequence);
  return {
    paymentId: `pi_hold_${suffix}`,
    checkoutSessionId: `cs_hold_${suffix}`,
    amountCents: 900,
    currency: "usd",
    paidAt: "2026-08-23T08:01:00.000Z",
    ...overrides,
  };
}

async function markSignalHoldPending(track, sessionId) {
  const request = await queue.requestSignalHoldCheckout(track.id, sessionId, signalHoldAcceptance);
  assert.equal(request.track.id, track.id);
  assert.equal(request.amountCents, 900);
  assert.equal(request.currency, "usd");
  await queue.markSignalHoldCheckoutPending(track.id, sessionId, checkoutMetadata(track));
  return request;
}

async function activateSignalHold(track, sessionId, overrides = {}) {
  await markSignalHoldPending(track, sessionId);
  const payment = paymentMetadata(track, overrides);
  const result = await queue.markSignalHoldPaidFromStripe(track.id, sessionId, payment);
  assert.equal(result.updated, true, result.reason ?? "paid webhook should activate Signal Hold");
  return { result, payment };
}

function activeTrack(state, id) {
  return [state.loadedTrack, state.nextInLine, ...state.queue].find((entry) => entry?.id === id) ?? null;
}

function anyTrack(state, id) {
  return activeTrack(state, id)
    ?? state.history.find((entry) => entry.id === id)
    ?? state.removed.find((entry) => entry.id === id)
    ?? null;
}

function trackOccurrences(state, id) {
  const loaded = state.loadedTrack?.id === id ? 1 : 0;
  const next = state.nextInLine?.id === id ? 1 : 0;
  const queued = state.queue.filter((entry) => entry.id === id).length;
  const completed = state.history.filter((entry) => entry.id === id).length;
  const removed = state.removed.filter((entry) => entry.id === id).length;
  return { loaded, next, queued, completed, removed, total: loaded + next + queued + completed + removed };
}

function publicTrack(snapshot, id) {
  return [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue, ...snapshot.completed]
    .find((entry) => entry?.id === id) ?? null;
}

function currentOrder(state) {
  return {
    loaded: state.loadedTrack?.id ?? null,
    next: state.nextInLine?.id ?? null,
    queue: state.queue.map((entry) => entry.id),
    pointer: state.nextNonPriorityLane,
  };
}

async function signalHoldEvents(sessionId, trackId) {
  const log = await queue.getQueueSessionShowLog(sessionId);
  return log.events.filter((event) => event.track?.trackId === trackId);
}

test("legacy entries normalize with no Hold and every new session is disabled by default", async () => {
  const sessionId = await startFreshSession("Signal Hold disabled default", { showStarted: false });
  const track = await addTrack("Legacy No Hold");
  const state = await queue.getRadioQueueState();
  const normalized = activeTrack(state, track.id);

  assert.equal(state.session.signalHoldEnabled, false);
  assert.equal(state.session.signalHoldPaymentsEnabled, false);
  assert.equal(state.session.signalHoldPriceCents, 0);
  assert.equal(state.session.signalHoldCurrency, "usd");
  assert.equal(normalized.signalHoldStatus, "none");
  assert.equal(normalized.signalHoldApplicationCount, 0);
  assert.equal(normalized.signalHoldQueueOrderAt, null);
  assert.equal(normalized.signalHoldAppliedAt, null);
  assert.equal(normalized.signalHoldFulfilledAt, null);
  assert.equal(normalized.signalHoldExpiredAt, null);
  await assert.rejects(
    () => queue.requestSignalHoldCheckout(track.id, sessionId, signalHoldAcceptance),
    /unavailable|not configured|disabled/i,
  );
});

test("checkout pending is not active protection and cannot move a track", async () => {
  const sessionId = await startFreshSession("Signal Hold pending", { showStarted: false });
  await enableSignalHold();
  const track = await addTrack("Pending Hold");
  await markSignalHoldPending(track, sessionId);

  let state = await queue.getRadioQueueState();
  const pending = activeTrack(state, track.id);
  const orderBefore = currentOrder(state);
  assert.equal(pending.signalHoldStatus, "checkout_pending");
  assert.equal(pending.signalHoldApplicationCount, 0);
  assert.equal(pending.signalHoldAppliedAt, null);

  try {
    await queue.updateRadioTrack(track.id, "useSignalHold");
  } catch (error) {
    assert.match(String(error), /Signal Hold|not active|unavailable/i);
  }
  state = await queue.getRadioQueueState();
  assert.deepEqual(currentOrder(state), orderBefore);
  assert.equal(activeTrack(state, track.id).signalHoldStatus, "checkout_pending");
  assert.equal(activeTrack(state, track.id).signalHoldApplicationCount, 0);
  assert.equal((await signalHoldEvents(sessionId, track.id)).some((event) => event.eventType === "track_signal_hold_applied"), false);
});

test("paid confirmation activates exactly once without changing queue order", async () => {
  const sessionId = await startFreshSession("Signal Hold paid authority", { showStarted: false });
  await enableSignalHold();
  const first = await addTrack("Paid First");
  const protectedTrack = await addTrack("Paid Protected");
  const last = await addTrack("Paid Last");
  await markSignalHoldPending(protectedTrack, sessionId);
  const beforePaid = currentOrder(await queue.getRadioQueueState());
  const payment = paymentMetadata(protectedTrack);

  const paid = await queue.markSignalHoldPaidFromStripe(protectedTrack.id, sessionId, payment);
  const duplicate = await queue.markSignalHoldPaidFromStripe(protectedTrack.id, sessionId, {
    ...payment,
    paymentId: "pi_hold_duplicate_must_not_replace_first",
  });
  const state = await queue.getRadioQueueState();
  const active = activeTrack(state, protectedTrack.id);

  assert.equal(paid.updated, true);
  assert.equal(duplicate.updated, false);
  assert.match(duplicate.reason ?? "", /already/i);
  assert.deepEqual(currentOrder(state), beforePaid, "webhook activation must not move or stage a track");
  assert.equal(active.signalHoldStatus, "active");
  assert.equal(active.signalHoldPaymentId, payment.paymentId);
  assert.equal(active.signalHoldApplicationCount, 0);
  assert.deepEqual(state.queue.map((entry) => entry.id), [first.id, protectedTrack.id, last.id]);
  const events = await signalHoldEvents(sessionId, protectedTrack.id);
  assert.equal(events.filter((event) => event.eventType === "track_signal_hold_activated").length, 1);
});

test("a protected queued track moves behind intervening tracks without changing createdAt or active slots", async () => {
  const sessionId = await startFreshSession("Signal Hold queued bottom");
  await enableSignalHold();
  const playing = await addTrack("Already Playing");
  const staged = await addTrack("Already Staged");
  await queue.updateRadioTrack("", "pullNext");
  await queue.updateRadioTrack(playing.id, "load");
  const protectedTrack = await addTrack("Old Protected Queue");
  const middle = await addTrack("Intervening Middle");
  const tail = await addTrack("Intervening Tail");
  await activateSignalHold(protectedTrack, sessionId);

  const before = await queue.getRadioQueueState();
  assert.equal(before.loadedTrack?.id, playing.id);
  assert.equal(before.nextInLine?.id, staged.id);
  assert.deepEqual(before.queue.map((entry) => entry.id), [protectedTrack.id, middle.id, tail.id]);
  const pointerBefore = before.nextNonPriorityLane;

  const state = await queue.updateRadioTrack(protectedTrack.id, "useSignalHold");
  const held = activeTrack(state, protectedTrack.id);
  assert.equal(state.loadedTrack?.id, playing.id);
  assert.equal(state.nextInLine?.id, staged.id);
  assert.equal(state.nextNonPriorityLane, pointerBefore);
  assert.deepEqual(state.queue.map((entry) => entry.id), [middle.id, tail.id, protectedTrack.id]);
  assert.equal(held.createdAt, protectedTrack.createdAt, "Signal Hold must not rewrite submission time");
  assert.equal(held.lane, "regular");
  assert.equal(held.status, "queued");
  assert.equal(held.signalHoldStatus, "active");
  assert.equal(held.signalHoldApplicationCount, 1);
  assert.ok(held.signalHoldAppliedAt);
  assert.ok(held.signalHoldQueueOrderAt);
  assert.deepEqual(trackOccurrences(state, protectedTrack.id), { loaded: 0, next: 0, queued: 1, completed: 0, removed: 0, total: 1 });
});

test("Signal Hold on Next In Line resolves the next owner and stays truly last after normalization", async () => {
  const sessionId = await startFreshSession("Signal Hold Next In Line");
  await enableSignalHold();
  const protectedTrack = await addTrack("Next Protected");
  const middle = await addTrack("Next Intervening");
  const tail = await addTrack("Next Tail");
  await activateSignalHold(protectedTrack, sessionId);
  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, protectedTrack.id);
  const pointerBefore = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(protectedTrack.id, "useSignalHold");
  assert.equal(state.nextInLine?.id, middle.id, "the existing resolver should stage the next eligible track");
  assert.equal(state.nextNonPriorityLane, pointerBefore, "absence must not consume Free/Wheel alternation");
  assert.deepEqual(state.queue.map((entry) => entry.id), [tail.id, protectedTrack.id]);
  const held = state.queue.at(-1);
  assert.equal(held.id, protectedTrack.id);
  assert.equal(held.createdAt, protectedTrack.createdAt);
  assert.equal(held.signalHoldStatus, "active");
  assert.equal(state.history.some((entry) => entry.id === protectedTrack.id), false);
  assert.equal(state.removed.some((entry) => entry.id === protectedTrack.id), false);
  assert.equal(trackOccurrences(state, protectedTrack.id).total, 1);

  const events = await signalHoldEvents(sessionId, protectedTrack.id);
  const applied = events.filter((event) => event.eventType === "track_signal_hold_applied");
  assert.equal(applied.length, 1);
  assert.equal(applied[0].details?.signalHoldPreviousLane, "regular");
  assert.equal(applied[0].details?.signalHoldApplicationCount, 1);

  const showLog = await queue.getQueueSessionShowLog(sessionId);
  assert.deepEqual(showLog.report.operations.signalHold, {
    activations: 1,
    needsAttention: 0,
    applications: 1,
    fulfilled: 0,
    expired: 0,
  });
  const showLogCsv = await queue.getQueueSessionShowLogCsv(sessionId);
  assert.match(showLogCsv.csv, /Signal Hold previous lane/);
  assert.match(showLogCsv.csv, /Signal Hold application count/);
  const appliedCsvRow = showLogCsv.csv.split("\n").find((row) => row.includes("track_signal_hold_applied"));
  assert.ok(appliedCsvRow);
  assert.match(appliedCsvRow, /,regular,1$/);
});

test("the same paid entitlement can be applied again after a later call", async () => {
  const sessionId = await startFreshSession("Signal Hold repeated absence");
  await enableSignalHold();
  const protectedTrack = await addTrack("Repeat Protected");
  const intervening = await addTrack("Repeat Intervening");
  await activateSignalHold(protectedTrack, sessionId);
  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, protectedTrack.id);

  state = await queue.updateRadioTrack(protectedTrack.id, "useSignalHold");
  assert.equal(state.nextInLine?.id, intervening.id);
  assert.equal(activeTrack(state, protectedTrack.id).signalHoldApplicationCount, 1);
  state = await queue.updateRadioTrack(intervening.id, "finish");
  state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, protectedTrack.id, "the protected song remains callable later in the show");

  state = await queue.updateRadioTrack(protectedTrack.id, "useSignalHold");
  const held = activeTrack(state, protectedTrack.id);
  assert.equal(held.signalHoldStatus, "active");
  assert.equal(held.signalHoldApplicationCount, 2);
  assert.equal(held.lane, "regular");
  assert.equal(held.status, "queued");
  assert.equal(trackOccurrences(state, protectedTrack.id).total, 1);
  const events = await signalHoldEvents(sessionId, protectedTrack.id);
  assert.equal(events.filter((event) => event.eventType === "track_signal_hold_applied").length, 2);
});

test("a protected Wheel winner becomes regular, restores one owed spin, and chooses no replacement", async () => {
  const sessionId = await startFreshSession("Signal Hold Wheel");
  await enableSignalHold();
  const protectedTrack = await addTrack("Wheel Protected");
  const firstFree = await addTrack("Wheel Free One");
  const secondFree = await addTrack("Wheel Free Two");
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  let state = await queue.updateRadioTrack(protectedTrack.id, "wheel");
  assert.equal(state.nextInLine?.id, protectedTrack.id);
  assert.equal(state.nextInLine?.lane, "wheel");
  assert.equal(state.session.wheelSpinsOwed, 0);
  await activateSignalHold(protectedTrack, sessionId);
  state = await queue.getRadioQueueState();
  const pointerBefore = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(protectedTrack.id, "useSignalHold");
  const held = activeTrack(state, protectedTrack.id);
  assert.equal(held.lane, "regular");
  assert.equal(held.signalHoldStatus, "active");
  assert.equal(held.signalHoldApplicationCount, 1);
  assert.equal(state.session.wheelSpinsOwed, 1, "the selected Wheel turn remains owed");
  assert.equal(state.nextNonPriorityLane, pointerBefore);
  assert.equal(state.nextInLine, null, "the host must manually choose another Wheel winner");
  assert.equal(state.queue.some((entry) => entry.lane === "wheel"), false);
  assert.deepEqual(state.queue.map((entry) => entry.id), [firstFree.id, secondFree.id, protectedTrack.id]);
  assert.equal(trackOccurrences(state, protectedTrack.id).total, 1);
});

test("a loaded Wheel winner can use Signal Hold before playback and still restores the owed spin", async () => {
  const sessionId = await startFreshSession("Signal Hold loaded Wheel");
  await enableSignalHold();
  const protectedTrack = await addTrack("Loaded Wheel Protected");
  const firstFree = await addTrack("Loaded Wheel Free One");
  const secondFree = await addTrack("Loaded Wheel Free Two");
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  let state = await queue.updateRadioTrack(protectedTrack.id, "wheel");
  assert.equal(state.nextInLine?.id, protectedTrack.id);
  await activateSignalHold(protectedTrack, sessionId);
  state = await queue.updateRadioTrack(protectedTrack.id, "load");
  assert.equal(state.loadedTrack?.id, protectedTrack.id);
  assert.equal(state.nextInLine?.id, firstFree.id, "loading may stage a speculative regular successor");
  const pointerBefore = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(protectedTrack.id, "useSignalHold");
  const held = activeTrack(state, protectedTrack.id);
  assert.equal(state.loadedTrack, null);
  assert.equal(state.nextInLine, null, "the speculative successor is unwound so the host can choose another Wheel winner");
  assert.equal(state.session.wheelSpinsOwed, 1);
  assert.equal(state.nextNonPriorityLane, pointerBefore);
  assert.equal(state.autoRoutingPaused, true);
  assert.deepEqual(state.queue.map((entry) => entry.id), [firstFree.id, secondFree.id, protectedTrack.id]);
  assert.equal(held.lane, "regular");
  assert.equal(held.signalHoldApplicationCount, 1);
  assert.equal(state.playbackDiagnostics.events.at(-1)?.eventType, "return");
  assert.deepEqual(trackOccurrences(state, protectedTrack.id), { loaded: 0, next: 0, queued: 1, completed: 0, removed: 0, total: 1 });
});

test("a paid Priority track relinquishes active Priority but keeps payment history", async () => {
  const sessionId = await startFreshSession("Signal Hold Priority");
  await enableSignalHold();
  const protectedTrack = await addTrack("Priority Protected");
  const regular = await addTrack("Priority Regular Waiting");
  const priorityPayment = {
    paymentId: "pi_priority_history_preserved",
    amountCents: 1700,
    currency: "usd",
    paidAt: "2026-08-23T07:00:00.000Z",
  };
  const promoted = await queue.markPriorityUpgradePaidFromStripe(protectedTrack.id, sessionId, priorityPayment);
  assert.equal(promoted.updated, true);
  await activateSignalHold(protectedTrack, sessionId);
  let state = await queue.getRadioQueueState();
  assert.equal(state.nextInLine?.id, protectedTrack.id);
  assert.equal(state.nextInLine?.lane, "priority");
  const pointerBefore = state.nextNonPriorityLane;

  state = await queue.updateRadioTrack(protectedTrack.id, "useSignalHold");
  const held = activeTrack(state, protectedTrack.id);
  assert.equal(state.nextInLine?.id, regular.id, "old Priority payment must not immediately reclaim Next In Line");
  assert.equal(state.nextNonPriorityLane, pointerBefore);
  assert.equal(held.lane, "regular");
  assert.equal(held.signalHoldStatus, "active");
  assert.ok(held.signalHoldPriorityRelinquishedAt);
  assert.equal(held.priorityUpgradeStatus, "paid");
  assert.equal(held.priorityUpgradePaymentId, priorityPayment.paymentId);
  assert.equal(held.priorityUpgradeAmountCents, priorityPayment.amountCents);
  assert.equal(held.priorityUpgradeCurrency, priorityPayment.currency);
  assert.equal(held.priorityUpgradePaidAt, priorityPayment.paidAt);
  assert.equal(state.queue.at(-1)?.id, protectedTrack.id);
  const ownerPublic = await queue.getPublicQueueSnapshot(sessionId, { submitterToken: protectedTrack.submitterToken });
  const publicHeld = publicTrack(ownerPublic, protectedTrack.id);
  const ownerHeld = ownerPublic.submitterStatus?.submitted.find((entry) => entry.id === protectedTrack.id);
  assert.equal(publicHeld?.lane, "regular");
  assert.equal(publicHeld?.priorityUpgradeStatus, "paid", "historical Priority payment remains auditable without an active Priority lane");
  assert.equal(ownerHeld?.signalHoldStatus, "active");
  assert.equal(trackOccurrences(state, protectedTrack.id).total, 1);
});

test("a loaded protected track can use Signal Hold before playback begins", async () => {
  const sessionId = await startFreshSession("Signal Hold loaded before playback");
  await enableSignalHold();
  const protectedTrack = await addTrack("Loaded Protected");
  const following = await addTrack("Loaded Following");
  const tail = await addTrack("Loaded Tail");
  await activateSignalHold(protectedTrack, sessionId);
  await queue.updateRadioTrack("", "pullNext");
  let before = await queue.updateRadioTrack(protectedTrack.id, "load");
  assert.equal(before.loadedTrack?.id, protectedTrack.id);
  assert.equal(before.nextInLine?.id, following.id);
  const ready = await queue.recordQueuePlaybackEvent({
    sessionId,
    trackId: protectedTrack.id,
    provider: "external",
    eventType: "ready",
    currentTimeSeconds: 0,
  });
  assert.equal(ready.accepted, true);
  before = await queue.getRadioQueueState();
  const pointerBefore = before.nextNonPriorityLane;

  const state = await queue.updateRadioTrack(protectedTrack.id, "useSignalHold");
  const held = activeTrack(state, protectedTrack.id);
  assert.equal(state.loadedTrack, null, "using the player action must clear the loaded player");
  assert.equal(state.nextInLine?.id, following.id, "the speculative next track remains the next owner");
  assert.equal(state.nextNonPriorityLane, pointerBefore, "loading and applying Hold must not consume alternation");
  assert.deepEqual(state.queue.map((entry) => entry.id), [tail.id, protectedTrack.id]);
  assert.equal(held.signalHoldStatus, "active");
  assert.equal(held.signalHoldApplicationCount, 1);
  assert.equal(held.status, "queued");
  assert.equal(held.lane, "regular");
  assert.equal(state.playbackDiagnostics.currentTrackId, null);
  assert.equal(state.playbackDiagnostics.lifecycleState, "cleared");
  assert.equal(state.playbackDiagnostics.events.at(-1)?.eventType, "return");
  assert.deepEqual(trackOccurrences(state, protectedTrack.id), { loaded: 0, next: 0, queued: 1, completed: 0, removed: 0, total: 1 });
  const events = await signalHoldEvents(sessionId, protectedTrack.id);
  assert.equal(events.filter((event) => event.eventType === "track_signal_hold_applied").length, 1);
  assert.equal(events.filter((event) => event.eventType === "track_finished").length, 0);
  assert.equal(events.filter((event) => event.eventType === "track_skipped").length, 0);
  assert.equal(events.filter((event) => event.eventType === "track_removed").length, 0);
});

test("Signal Hold rejects a loaded track after playback begins without mutating it", async () => {
  const sessionId = await startFreshSession("Signal Hold playback begun");
  await enableSignalHold();
  const protectedTrack = await addTrack("Playback Begun Protected");
  const following = await addTrack("Playback Begun Following");
  await activateSignalHold(protectedTrack, sessionId);
  await queue.updateRadioTrack("", "pullNext");
  await queue.updateRadioTrack(protectedTrack.id, "load");
  const played = await queue.recordQueuePlaybackEvent({
    sessionId,
    trackId: protectedTrack.id,
    provider: "external",
    eventType: "play",
    currentTimeSeconds: 0,
  });
  assert.equal(played.accepted, true);
  const before = await queue.getRadioQueueState();
  assert.equal(before.loadedTrack?.id, protectedTrack.id);
  assert.equal(before.nextInLine?.id, following.id);
  const targetBefore = structuredClone(before.loadedTrack);
  const orderBefore = currentOrder(before);

  await assert.rejects(
    () => queue.updateRadioTrack(protectedTrack.id, "useSignalHold"),
    /after playback has begun/i,
  );
  const after = await queue.getRadioQueueState();
  assert.deepEqual(currentOrder(after), orderBefore);
  assert.deepEqual(after.loadedTrack, targetBefore);
  assert.equal(after.loadedTrack.signalHoldStatus, "active");
  assert.equal(after.loadedTrack.signalHoldApplicationCount, 0);
  assert.equal(after.loadedTrack.signalHoldAppliedAt, null);
  assert.equal(after.playbackDiagnostics.currentTrackId, protectedTrack.id);
  assert.equal(after.playbackDiagnostics.lifecycleState, "playing");
  assert.deepEqual(trackOccurrences(after, protectedTrack.id), { loaded: 1, next: 0, queued: 0, completed: 0, removed: 0, total: 1 });
  const events = await signalHoldEvents(sessionId, protectedTrack.id);
  assert.equal(events.filter((event) => event.eventType === "track_signal_hold_applied").length, 0);
});

test("playing a protected track fulfills it without conflating the playback outcome", async () => {
  const sessionId = await startFreshSession("Signal Hold fulfilled");
  await enableSignalHold();
  const protectedTrack = await addTrack("Fulfilled Protected");
  await activateSignalHold(protectedTrack, sessionId);
  await queue.updateRadioTrack("", "pullNext");
  await queue.updateRadioTrack(protectedTrack.id, "load");

  const state = await queue.updateRadioTrack(protectedTrack.id, "finish");
  const completed = state.history.find((entry) => entry.id === protectedTrack.id);
  assert.ok(completed);
  assert.equal(completed.signalHoldStatus, "fulfilled");
  assert.ok(completed.signalHoldFulfilledAt);
  assert.equal(completed.signalHoldExpiredAt, null);
  assert.equal(completed.playbackOutcome, "finished");
  assert.equal(trackOccurrences(state, protectedTrack.id).total, 1);
  const events = await signalHoldEvents(sessionId, protectedTrack.id);
  assert.equal(events.filter((event) => event.eventType === "track_signal_hold_fulfilled").length, 1);
  assert.equal(events.filter((event) => event.eventType === "track_finished").length, 1);
});

test("ordinary removal remains available and is not disguised as Signal Hold use", async () => {
  const sessionId = await startFreshSession("Signal Hold ordinary remove");
  await enableSignalHold();
  const protectedTrack = await addTrack("Removed Protected");
  await activateSignalHold(protectedTrack, sessionId);
  let state = await queue.updateRadioTrack("", "pullNext");
  assert.equal(state.nextInLine?.id, protectedTrack.id);

  state = await queue.updateRadioTrack(protectedTrack.id, "remove");
  const removed = state.removed.find((entry) => entry.id === protectedTrack.id);
  assert.ok(removed, "moderation, rights, withdrawal, and other removals must remain possible");
  assert.equal(removed.playbackOutcome, "removed");
  assert.equal(removed.signalHoldPaymentId, paymentMetadata(protectedTrack).paymentId);
  assert.equal(removed.signalHoldFulfilledAt, null);
  assert.equal(activeTrack(state, protectedTrack.id), null);
  assert.equal(trackOccurrences(state, protectedTrack.id).total, 1);
  const events = await signalHoldEvents(sessionId, protectedTrack.id);
  assert.equal(events.filter((event) => event.eventType === "track_removed").length, 1);
  assert.equal(events.filter((event) => event.eventType === "track_signal_hold_applied").length, 0);
});

test("archive expires an unfulfilled Hold and a new show receives no carryover", async () => {
  const sessionId = await startFreshSession("Signal Hold archive expiry");
  await enableSignalHold();
  const protectedTrack = await addTrack("Expired Protected");
  const { payment } = await activateSignalHold(protectedTrack, sessionId);

  const archived = await queue.archiveCurrentQueueSession();
  const expired = anyTrack(archived, protectedTrack.id);
  assert.equal(archived.session.status, "archived");
  assert.equal(expired.signalHoldStatus, "expired");
  assert.ok(expired.signalHoldExpiredAt);
  assert.equal(expired.signalHoldFulfilledAt, null);
  assert.equal(expired.signalHoldPaymentId, payment.paymentId, "archive must retain payment audit history");

  const next = await queue.startNewQueueSession({ title: `No Hold Carryover ${Date.now()}` });
  assert.equal(next.session.signalHoldEnabled, false);
  assert.equal(next.session.signalHoldPaymentsEnabled, false);
  assert.equal(trackOccurrences(next, protectedTrack.id).total, 0);
  const archivedAgain = await queue.getRadioQueueState(sessionId);
  assert.equal(anyTrack(archivedAgain, protectedTrack.id).signalHoldStatus, "expired");
  const events = await signalHoldEvents(sessionId, protectedTrack.id);
  assert.equal(events.filter((event) => event.eventType === "track_signal_hold_expired").length, 1);
});

test("late paid confirmation is needs-attention and cannot reorder the new live show", async () => {
  const oldSessionId = await startFreshSession("Signal Hold late payment", { showStarted: false });
  await enableSignalHold();
  const oldTrack = await addTrack("Late Paid Protected");
  const oldTail = await addTrack("Late Paid Tail");
  await markSignalHoldPending(oldTrack, oldSessionId);
  const oldOrder = (await queue.getRadioQueueState()).queue.map((entry) => entry.id);
  await queue.archiveCurrentQueueSession();

  const started = await queue.startNewQueueSession({ title: `Signal Hold live after late payment ${Date.now()}` });
  const newSessionId = started.session.sessionId;
  await queue.setQueueOpen(true);
  await queue.updateRadioTrack("", "startShow");
  const currentFirst = await addTrack("Current First");
  const currentTail = await addTrack("Current Tail");
  await queue.updateRadioTrack("", "pullNext");
  const liveBefore = currentOrder(await queue.getRadioQueueState());

  const latePayment = paymentMetadata(oldTrack, { paymentId: "pi_signal_hold_late_archived" });
  const result = await queue.markSignalHoldPaidFromStripe(oldTrack.id, oldSessionId, latePayment);
  assert.equal(result.updated, true, result.reason ?? "late payment should be recorded for review");
  const liveAfter = await queue.getRadioQueueState(newSessionId);
  assert.deepEqual(currentOrder(liveAfter), liveBefore);
  assert.equal(liveAfter.nextInLine?.id, currentFirst.id);
  assert.deepEqual(liveAfter.queue.map((entry) => entry.id), [currentTail.id]);
  assert.equal(trackOccurrences(liveAfter, oldTrack.id).total, 0);

  const archived = await queue.getRadioQueueState(oldSessionId);
  const attention = anyTrack(archived, oldTrack.id);
  assert.deepEqual(archived.queue.map((entry) => entry.id), oldOrder);
  assert.equal(attention.signalHoldStatus, "paid_needs_attention");
  assert.equal(attention.signalHoldPaymentId, latePayment.paymentId);
  assert.equal(attention.signalHoldQueueOrderAt, null);
  assert.equal(attention.signalHoldApplicationCount, 0);
  assert.equal(anyTrack(archived, oldTail.id)?.id, oldTail.id);
  const events = await signalHoldEvents(oldSessionId, oldTrack.id);
  assert.equal(events.filter((event) => event.eventType === "track_signal_hold_needs_attention").length, 1);
});

test("only the owner-specific public projection exposes Hold status and never payment secrets", async () => {
  const sessionId = await startFreshSession("Signal Hold public privacy", { showStarted: false });
  await enableSignalHold();
  const ownerToken = "signal-hold-private-owner-token";
  const protectedTrack = await addTrack("Owner Public Status", { submitterToken: ownerToken });
  const { payment } = await activateSignalHold(protectedTrack, sessionId);

  const anonymous = await queue.getPublicQueueSnapshot(sessionId);
  const anonymousTrack = publicTrack(anonymous, protectedTrack.id);
  assert.ok(anonymousTrack);
  assert.equal(Object.hasOwn(anonymousTrack, "signalHoldStatus"), false);
  assert.equal(Object.hasOwn(anonymousTrack, "signalHoldApplicationCount"), false);
  assert.equal(Object.hasOwn(anonymousTrack, "signalHoldPaymentId"), false);
  assert.equal(Object.hasOwn(anonymousTrack, "signalHoldCheckoutOwnerTokenHash"), false);

  const owner = await queue.getPublicQueueSnapshot(sessionId, { submitterToken: ownerToken });
  const ownerTrack = owner.submitterStatus?.submitted.find((entry) => entry.id === protectedTrack.id);
  assert.equal(ownerTrack?.signalHoldStatus, "active");
  assert.equal(ownerTrack?.signalHoldApplicationCount, 0);
  const otherViewer = await queue.getPublicQueueSnapshot(sessionId, { submitterToken: "different-viewer-token" });
  assert.equal(otherViewer.submitterStatus?.submitted.some((entry) => entry.id === protectedTrack.id) ?? false, false);
  const artistImpersonator = await queue.getPublicQueueSnapshot(sessionId, { artist: protectedTrack.submittedArtistName });
  const artistMatchedTrack = artistImpersonator.submitterStatus?.submitted.find((entry) => entry.id === protectedTrack.id);
  assert.ok(artistMatchedTrack, "legacy artist matching may still find the public track");
  assert.equal(Object.hasOwn(artistMatchedTrack, "signalHoldStatus"), false);
  assert.equal(Object.hasOwn(artistMatchedTrack, "signalHoldApplicationCount"), false);
  const tiktokImpersonator = await queue.getPublicQueueSnapshot(sessionId, { tiktokHandle: protectedTrack.tiktokHandle });
  const tiktokMatchedTrack = tiktokImpersonator.submitterStatus?.submitted.find((entry) => entry.id === protectedTrack.id);
  assert.ok(tiktokMatchedTrack, "legacy TikTok matching may still find the public track");
  assert.equal(Object.hasOwn(tiktokMatchedTrack, "signalHoldStatus"), false);
  assert.equal(Object.hasOwn(tiktokMatchedTrack, "signalHoldApplicationCount"), false);

  for (const snapshot of [anonymous, owner, otherViewer, artistImpersonator, tiktokImpersonator]) {
    const serialized = JSON.stringify(snapshot);
    assert.equal(serialized.includes(ownerToken), false);
    assert.equal(serialized.includes(payment.paymentId), false);
    assert.equal(serialized.includes("a".repeat(64)), false);
    assert.equal(serialized.includes("checkout.stripe.test"), false);
    assert.equal(serialized.includes(SIGNAL_HOLD_DISCLOSURE_TEXT), false);
  }
});
