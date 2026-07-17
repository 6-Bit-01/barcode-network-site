import test from 'node:test';
import assert from 'node:assert/strict';
import { QueuePollError, fetchQueueSnapshot, initialQueuePollState, isQueuePublicSnapshot, reduceQueuePollFailure, reduceQueuePollSuccess, snapshotsAreCompatible } from '../src/lib/queue-public-polling.ts';

const snapshot = (sessionId = 's1') => ({ session: { sessionId, status: 'open', broadcastPhase: 'pre_show' }, status: { isOpen: true }, queue: [], completed: [] });
const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('validates public queue snapshot shape', () => {
  assert.equal(isQueuePublicSnapshot(snapshot()), true);
  assert.equal(isQueuePublicSnapshot({ status: { isOpen: false }, queue: [] }), false);
});

test('distinguishes network non-2xx malformed and unexpected payload failures', async () => {
  await assert.rejects(() => fetchQueueSnapshot(async () => { throw new Error('offline'); }, '/api/queue'), (e) => e instanceof QueuePollError && e.reason === 'network');
  await assert.rejects(() => fetchQueueSnapshot(async () => response({}, false, 500), '/api/queue'), (e) => e instanceof QueuePollError && e.reason === 'non_2xx' && e.statusCode === 500);
  await assert.rejects(() => fetchQueueSnapshot(async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }), '/api/queue'), (e) => e instanceof QueuePollError && e.reason === 'malformed_json');
  await assert.rejects(() => fetchQueueSnapshot(async () => response({ nope: true }), '/api/queue'), (e) => e instanceof QueuePollError && e.reason === 'unexpected_payload');
});

test('initial failure is unavailable, last good is stale/retrying, successful recovery clears error', () => {
  const unavailable = reduceQueuePollFailure(initialQueuePollState, 'network');
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.snapshot, null);
  const current = reduceQueuePollSuccess(initialQueuePollState, snapshot(), 10);
  const stale = reduceQueuePollFailure(current, 'non_2xx');
  assert.equal(stale.status, 'stale');
  assert.equal(stale.snapshot.session.sessionId, 's1');
  const retrying = reduceQueuePollFailure(current, 'network', true);
  assert.equal(retrying.status, 'retrying');
  const recovered = reduceQueuePollSuccess(stale, snapshot(), 20, 's1');
  assert.equal(recovered.status, 'current');
  assert.equal(recovered.failureReason, null);
});

test('compatible last good is same session identity and active session mismatch is rejected', () => {
  assert.equal(snapshotsAreCompatible(snapshot('a'), snapshot('a')), true);
  assert.equal(snapshotsAreCompatible(snapshot('a'), snapshot('b')), false);
  const rejected = reduceQueuePollSuccess(reduceQueuePollSuccess(initialQueuePollState, snapshot('old')), snapshot('new'), 20, 'old');
  assert.equal(rejected.status, 'unavailable');
  assert.equal(rejected.snapshot, null);
});
