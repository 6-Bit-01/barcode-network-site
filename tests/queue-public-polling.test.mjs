import test from 'node:test';
import assert from 'node:assert/strict';
import { QueuePollError, beginQueuePoll, createQueuePollController, derivePublicQueueActionEligibility, deriveQueueRecoveryView, fetchQueueSnapshot, initialQueuePollState, isQueuePublicSnapshot, queueHasCurrentAuthority, reduceQueuePollFailure, reduceQueuePollSuccess, snapshotsAreCompatible } from '../src/lib/queue-public-polling.ts';

const track = (id = 't1', sourceType = 'other') => ({ id, submittedArtistName: 'Artist', submittedSongTitle: 'Song', sourceType, lane: 'regular', durationLabel: '5:00', durationIsEstimate: true, estimatedDurationSeconds: 300, priorityUpgradeStatus: 'none', publicSourceUrl: 'https://example.com/track' });
const snapshot = (sessionId = 's1', overrides = {}) => ({ session: { sessionId, title: 'Show', showDate: '2026-07-17', status: 'open', description: 'desc', completedCount: 0, completedRuntimeSeconds: 0, activeCount: 1, removedCount: 0, submissionCooldownSeconds: 0, queueOpen: true, showStarted: false, broadcastPhase: 'submission_window', priorityUpgradesEnabled: true, priorityUpgradePaymentsEnabled: true, priorityUpgradePriceCents: 1000, priorityUpgradeCurrency: 'usd', priorityUpgradeLabel: 'Priority Signal', priorityUpgradeInstructions: 'Move closer' }, status: { isOpen: true, activeCount: 1, estimatedRuntimeSeconds: 300, capacity: 44, pressure: 'low' }, queue: [track()], completed: [], nowPlaying: null, upNext: null, ...overrides });
const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function env() {
  const listeners = { focus: new Set(), online: new Set(), visibilitychange: new Set() };
  const win = { addEventListener: (n, f) => listeners[n].add(f), removeEventListener: (n, f) => listeners[n].delete(f), setTimeout, clearTimeout };
  const doc = { visibilityState: 'visible', addEventListener: (n, f) => listeners[n].add(f), removeEventListener: (n, f) => listeners[n].delete(f) };
  return { win, doc, listeners, fire(name) { for (const fn of listeners[name]) fn(); } };
}
function controller(fetcher, options = {}) { let state = initialQueuePollState; const e = env(); const c = createQueuePollController({ fetcher, getUrl: () => '/api/queue', requiredSessionId: () => options.sessionId, getState: () => state, onState: (u) => { state = u(state); }, intervalMs: options.intervalMs ?? 30, timeoutMs: options.timeoutMs ?? 25, coalesceMs: options.coalesceMs ?? 5, windowRef: e.win, documentRef: e.doc }); return { c, e, get state() { return state; } }; }

test('validates nested public queue snapshot shape', () => {
  assert.equal(isQueuePublicSnapshot(snapshot()), true);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), queue: [null] }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), nowPlaying: {} }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), status: { isOpen: true } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, title: {} } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), status: { ...snapshot().status, isFull: 'yes' } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, status: 'toString' } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, priorityUpgradeCurrency: { bad: true } } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), queue: [track('bad-url', 'other')].map((entry) => ({ ...entry, publicSourceUrl: 'javascript:alert(1)' })) }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), submitterStatus: false }), false);
  for (const sourceType of ['upload', 'link', 'youtube', 'soundcloud', 'spotify', 'tiktok', 'other']) assert.equal(isQueuePublicSnapshot(snapshot('s1', { queue: [track('t-' + sourceType, sourceType)] })), true);
  for (const status of ['prepared', 'open', 'closed', 'archived']) assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, status } }), true);
  for (const broadcastPhase of ['warmup', 'submission_window', 'broadcast_active', 'ended']) assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, broadcastPhase } }), true);
  assert.equal(isQueuePublicSnapshot(snapshot('s1', { queue: [track('bad', 'unknown')] })), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, broadcastPhase: 'pre_show' } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, showDate: '2026-02-31' } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, broadcastStartedAt: '2026-02-31T00:00:00.000Z' } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), status: { ...snapshot().status, activeCount: Number.MAX_SAFE_INTEGER + 1 } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, showStarted: null } }), false);
  assert.equal(isQueuePublicSnapshot({ ...snapshot(), session: { ...snapshot().session, broadcastPhase: null } }), false);
});

test('distinguishes network non-2xx malformed and unexpected payload failures', async () => {
  await assert.rejects(() => fetchQueueSnapshot(async () => { throw new Error('offline'); }, '/api/queue'), (e) => e instanceof QueuePollError && e.reason === 'network');
  await assert.rejects(() => fetchQueueSnapshot(async () => response({}, false, 500), '/api/queue'), (e) => e instanceof QueuePollError && e.reason === 'non_2xx' && e.statusCode === 500);
  await assert.rejects(() => fetchQueueSnapshot(async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }), '/api/queue'), (e) => e instanceof QueuePollError && e.reason === 'malformed_json');
  await assert.rejects(() => fetchQueueSnapshot(async () => response({ nope: true }), '/api/queue'), (e) => e instanceof QueuePollError && e.reason === 'unexpected_payload');
});

test('initial unavailable view, current authority, stale authorization, and recovery clearing', () => {
  const unavailable = reduceQueuePollFailure(initialQueuePollState, 'network');
  assert.equal(deriveQueueRecoveryView(unavailable), 'unavailable');
  assert.equal(queueHasCurrentAuthority(unavailable), false);
  const current = reduceQueuePollSuccess(initialQueuePollState, snapshot(), 10);
  assert.equal(queueHasCurrentAuthority(current), true);
  assert.equal(current.restoredAt, null, 'initial success does not announce restoration');
  const stale = reduceQueuePollFailure(current, 'non_2xx');
  assert.equal(deriveQueueRecoveryView(stale), 'stale');
  assert.equal(queueHasCurrentAuthority(stale), false);
  const retrying = beginQueuePoll(stale, 'manual');
  assert.equal(deriveQueueRecoveryView(retrying), 'retrying');
  assert.equal(retrying.failureReason, stale.failureReason, 'begin retry does not manufacture a new failure');
  const recovered = reduceQueuePollSuccess(stale, snapshot(), 20, 's1');
  assert.equal(recovered.status, 'current');
  assert.equal(recovered.failureReason, null);
  assert.equal(recovered.restoredAt, 20);
});

test('ordinary background in-flight keeps current authority until actual failure', () => {
  const current = reduceQueuePollSuccess(initialQueuePollState, snapshot(), 10);
  const refreshing = beginQueuePoll(current, 'interval');
  assert.equal(queueHasCurrentAuthority(refreshing), true);
  assert.equal(deriveQueueRecoveryView(refreshing), 'current');
  const failed = reduceQueuePollFailure(refreshing, 'network');
  assert.equal(queueHasCurrentAuthority(failed), false);
  assert.equal(failed.status, 'stale');
  assert.equal(queueHasCurrentAuthority(reduceQueuePollSuccess(failed, snapshot(), 20, 's1')), true);
});

test('compatible last good is same session identity and wrong route session is rejected', () => {
  assert.equal(snapshotsAreCompatible(snapshot('a'), snapshot('a')), true);
  assert.equal(snapshotsAreCompatible(snapshot('a'), snapshot('b')), false);
  const rejected = reduceQueuePollSuccess(reduceQueuePollSuccess(initialQueuePollState, snapshot('old')), snapshot('new'), 20, 'old');
  assert.equal(rejected.status, 'stale');
  assert.equal(rejected.snapshot.session.sessionId, 'old');
});



test('priority action eligibility rejects closed full wrong position and accepts checkout transitions', () => {
  const base = reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { status: { ...snapshot().status, activeCount: 2 }, queue: [track('front'), track('target')] }), 1);
  assert.equal(derivePublicQueueActionEligibility(base, { sessionId: 's1', action: 'priority_request', trackId: 'target', priorityDepth: 2 }).allowed, true);
  assert.equal(derivePublicQueueActionEligibility(base, { sessionId: 's2', action: 'priority_request', trackId: 'target', priorityDepth: 2 }).reason, 'wrong_session');
  assert.equal(derivePublicQueueActionEligibility(base, { sessionId: 's1', action: 'priority_request', trackId: 'front', priorityDepth: 2 }).reason, 'front_edge');
  assert.equal(derivePublicQueueActionEligibility(reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { status: { ...snapshot().status, isOpen: false } }), 1), { sessionId: 's1', action: 'priority_request', trackId: 'target', priorityDepth: 2 }).reason, 'closed');
  assert.equal(derivePublicQueueActionEligibility(reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { status: { ...snapshot().status, activeCount: 44, isFull: true }, queue: [track('front'), track('target')] }), 1), { sessionId: 's1', action: 'priority_request', trackId: 'target', priorityDepth: 2 }).allowed, true, 'full queue still permits existing-track upgrade');
  assert.equal(derivePublicQueueActionEligibility(reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { queue: [track('target')], nowPlaying: track('np') }), 1), { sessionId: 's1', action: 'priority_request', trackId: 'np', priorityDepth: 2 }).reason, 'track_missing');
  const pending = reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { queue: [{ ...track('target'), priorityUpgradeStatus: 'checkout_pending' }] }), 1);
  assert.equal(derivePublicQueueActionEligibility(pending, { sessionId: 's1', action: 'priority_checkout_completed', trackId: 'target', priorityDepth: 2 }).allowed, true);
  assert.equal(derivePublicQueueActionEligibility(pending, { sessionId: 's1', action: 'priority_resume', trackId: 'target', priorityDepth: 2 }).allowed, true);
  const behindPriority = reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { status: { ...snapshot().status, activeCount: 3 }, queue: [{ ...track('paid'), lane: 'priority', priorityUpgradeStatus: 'paid' }, track('regular-behind-priority')] }), 1);
  assert.equal(derivePublicQueueActionEligibility(behindPriority, { sessionId: 's1', action: 'priority_request', trackId: 'regular-behind-priority', priorityDepth: 2 }).allowed, true, 'first regular behind paid Priority is not effective front edge');
  const behindWheel = reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { status: { ...snapshot().status, activeCount: 3 }, queue: [{ ...track('wheel'), lane: 'wheel' }, track('regular-behind-wheel')] }), 1);
  assert.equal(derivePublicQueueActionEligibility(behindWheel, { sessionId: 's1', action: 'priority_request', trackId: 'regular-behind-wheel', priorityDepth: 2 }).allowed, true, 'first regular behind Wheel is not effective front edge');
  const pendingFull = reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { status: { ...snapshot().status, activeCount: 44, isFull: true }, queue: [{ ...track('pending'), priorityUpgradeStatus: 'checkout_pending' }] }), 1);
  assert.equal(derivePublicQueueActionEligibility(pendingFull, { sessionId: 's1', action: 'priority_resume', trackId: 'pending', priorityDepth: 99 }).allowed, true, 'pending checkout resumes even at full capacity and low depth');
  const cooldown = reduceQueuePollSuccess(initialQueuePollState, snapshot('s1', { status: { ...snapshot().status, activeCount: 44, isFull: true }, queue: [track('front'), track('accepted')], submitterStatus: { used: 1, limit: 2, remaining: 1, cooldownRemainingSeconds: 299, submitted: [] } }), 1);
  assert.equal(derivePublicQueueActionEligibility(cooldown, { sessionId: 's1', action: 'submit' }).allowed, false, 'cooldown blocks another submission');
  assert.equal(derivePublicQueueActionEligibility(cooldown, { sessionId: 's1', action: 'priority_checkout_preflight', trackId: 'accepted', priorityDepth: 2 }).allowed, true, 'cooldown does not block accepted-track checkout');
});

test('controller supports manual retry focus online visible interval coalescing cleanup and wrong-session rejection', async () => {
  let calls = 0;
  const ctl = controller(async () => { calls += 1; return response(snapshot(calls === 1 ? 'bad' : 's1')); }, { sessionId: 's1', intervalMs: 50 });
  ctl.c.start();
  await wait(10);
  assert.equal(ctl.state.status, 'unavailable');
  ctl.c.retry();
  await wait(10);
  assert.equal(ctl.state.status, 'current');
  assert.equal(ctl.state.failureReason, null);
  ctl.e.fire('focus'); ctl.e.fire('online'); ctl.e.doc.visibilityState = 'hidden'; ctl.e.fire('visibilitychange'); ctl.e.doc.visibilityState = 'visible'; ctl.e.fire('visibilitychange');
  await wait(20);
  assert.ok(calls <= 4, `coalesced event burst, calls=${calls}`);
  await wait(60);
  assert.ok(calls >= 3, 'interval refreshes');
  ctl.c.dispose();
  const afterDispose = calls;
  ctl.e.fire('focus'); ctl.e.fire('online'); await wait(20);
  assert.equal(calls, afterDispose);
  assert.equal(ctl.e.listeners.focus.size, 0);
  assert.equal(ctl.e.listeners.online.size, 0);
  assert.equal(ctl.e.listeners.visibilitychange.size, 0);
});

test('controller classifies timeout/abort and suppresses stale responses', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const ctl = controller(async (_url, init) => {
    await Promise.race([slow, new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }))]);
    return response(snapshot());
  }, { timeoutMs: 5, intervalMs: 100 });
  ctl.c.start();
  await wait(20);
  assert.equal(ctl.state.failureReason, 'timeout');
  release();
  await wait(10);
  assert.notEqual(ctl.state.status, 'current');
  ctl.c.dispose();
});


test('controller disposes hung fetch and restarts cleanly', async () => {
  let calls = 0;
  const ctl = controller(async () => { calls += 1; return new Promise(() => {}); }, { timeoutMs: 1000, intervalMs: 1000 });
  ctl.c.start();
  await wait(10);
  assert.equal(ctl.state.inFlight, true);
  ctl.c.dispose();
  ctl.c.start();
  await wait(10);
  assert.equal(calls, 2, 'restart after hung disposal begins a fresh request');
  ctl.c.dispose();
});
