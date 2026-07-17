import test from 'node:test';
import assert from 'node:assert/strict';
import { QueuePollError, beginQueuePoll, createQueuePollController, deriveQueueRecoveryView, fetchQueueSnapshot, initialQueuePollState, isQueuePublicSnapshot, queueHasCurrentAuthority, reduceQueuePollFailure, reduceQueuePollSuccess, snapshotsAreCompatible } from '../src/lib/queue-public-polling.ts';

const track = (id = 't1') => ({ id, submittedArtistName: 'Artist', submittedSongTitle: 'Song', sourceType: 'youtube', lane: 'regular', durationLabel: '5:00', durationIsEstimate: true });
const snapshot = (sessionId = 's1') => ({ session: { sessionId, status: 'open', broadcastPhase: 'pre_show' }, status: { isOpen: true, activeCount: 1, estimatedRuntimeSeconds: 300, capacity: 44, pressure: 'low' }, queue: [track()], completed: [], nowPlaying: null, upNext: null });
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

test('compatible last good is same session identity and wrong route session is rejected', () => {
  assert.equal(snapshotsAreCompatible(snapshot('a'), snapshot('a')), true);
  assert.equal(snapshotsAreCompatible(snapshot('a'), snapshot('b')), false);
  const rejected = reduceQueuePollSuccess(reduceQueuePollSuccess(initialQueuePollState, snapshot('old')), snapshot('new'), 20, 'old');
  assert.equal(rejected.status, 'unavailable');
  assert.equal(rejected.snapshot, null);
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
