import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOverlayScene, isResolvedLiveOverlayScene, playWheelSpinWithFallback, providerBeginMedia, providerMarkFailed, providerShouldInitialize, providerSwitchMedia, reduceOverlayFailure, reduceOverlaySuccess, terminateWheelSpinAudio } from '../src/lib/live-overlay-client-recovery.ts';

const now = new Date().toISOString();
const scene = (id = 'a') => ({ mode: 'now_playing', resolvedMode: 'now_playing', reason: 'ok', title: 'Now', priority: 1, automatic: true, overrideActive: false, wheelOverlayActive: false, wheelSpinsOwed: 0, updatedAt: now, track: { artistName: 'Artist', trackTitle: `Song ${id}` } });

test('overlay rejects malformed scene and retains last-good until later valid recovery', () => {
  assert.equal(isResolvedLiveOverlayScene({ scene: {} }), false);
  assert.throws(() => extractOverlayScene({ scene: {} }));
  assert.equal(isResolvedLiveOverlayScene({ ...scene(), wheelCeremony: { status: 'ready', displayCandidates: 'not-array' } }), false);
  assert.equal(isResolvedLiveOverlayScene({ ...scene(), tiktok: {} }), false);
  assert.equal(isResolvedLiveOverlayScene({ ...scene(), track: undefined }), false);
  const initial = { scene: scene('a'), connected: true, held: false, failureReason: null, generation: 1 };
  const held = reduceOverlayFailure(initial, 'timeout', 2);
  assert.equal(held.scene.track.trackTitle, 'Song a');
  assert.equal(held.held, true);
  const recovered = reduceOverlaySuccess(held, scene('b'), 3);
  assert.equal(recovered.connected, true);
  assert.equal(recovered.scene.track.trackTitle, 'Song b');
});

test('provider lifecycle blocks recreation of same failed media and recovers on different media', () => {
  let yt = { failedId: null, initCount: 0, status: 'idle' };
  yt = providerBeginMedia(yt, 'youtube:A');
  yt = providerMarkFailed(yt, 'youtube:A');
  assert.equal(providerShouldInitialize(yt, 'youtube:A'), false);
  yt = providerSwitchMedia(yt, 'youtube:B');
  assert.equal(providerShouldInitialize(yt, 'youtube:B'), true);
  assert.equal(yt.failedId, null);
  let tt = providerMarkFailed({ failedId: null, initCount: 0, status: 'idle' }, 'tiktok:A');
  assert.equal(providerShouldInitialize(tt, 'tiktok:A'), false);
  tt = providerSwitchMedia(tt, 'tiktok:B');
  assert.equal(tt.failedId, null);
  assert.equal(tt.status, 'ready');
});

test('wheel audio primary fallback success, total failure, and stale generation isolation', async () => {
  const attempts = [];
  const success = await playWheelSpinWithFallback(['a.mp3', 'b.mp3'], async (path) => { attempts.push(path); if (path === 'a.mp3') throw new Error('decode'); }, 1, (g) => g === 1);
  assert.deepEqual(attempts, ['a.mp3', 'b.mp3']);
  assert.equal(success.played, true);
  const failed = await playWheelSpinWithFallback(['a.mp3', 'b.mp3', 'c.mp3'], async () => { throw new Error('decode'); }, 2, (g) => g === 2);
  assert.equal(failed.played, false);
  assert.equal(failed.attempts.length, 2);
  assert.match(failed.notice, /CONTINUES SILENTLY/);
  const stale = await playWheelSpinWithFallback(['a.mp3', 'b.mp3'], async () => {}, 3, () => false);
  assert.equal(stale.notice, null);
});


test('wheel audio termination stops and resets audio lifecycle', () => {
  const audio = { src: 'a.mp3', loop: true, volume: 0.2, currentTime: 14, paused: false, pause() { this.paused = true; }, play: async () => {} };
  terminateWheelSpinAudio(audio, { volume: 0.82 });
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.volume, 0.82);
  assert.equal(audio.loop, false);
});
