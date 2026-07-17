import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOverlayScene, isResolvedLiveOverlayScene, playWheelSpinWithFallback, reduceOverlayFailure, reduceOverlaySuccess, terminateWheelSpinAudio } from '../src/lib/live-overlay-client-recovery.ts';
import { resolveLiveOverlayScene } from '../src/lib/live-overlay-resolver.ts';

const now = new Date('2026-07-17T00:00:00.000Z');
const session = { sessionId: 's1', title: 'Show', status: 'open', queueOpen: true, broadcastPhase: 'broadcast_active', wheelSpinsOwed: 1, sponsorBreakStatus: 'not_due' };
const ytTrack = { id: 'yt-a', submittedArtistName: 'Artist', submittedSongTitle: 'Video', sourceType: 'youtube', sourceArtworkUrl: 'https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg', link: 'https://youtube.com/watch?v=abcdefghijk', durationLabel: '3:00', youtubeVideoId: 'abcdefghijk' };
const ttTrack = { id: 'tt-a', submittedArtistName: 'TT', submittedSongTitle: 'Post', sourceType: 'tiktok', sourceArtworkUrl: 'https://www.tiktok.com/example.jpg', link: 'https://www.tiktok.com/@scout2015/video/6718335390845095173', durationLabel: '0:59', tiktokPostId: '6718335390845095173' };
const candidates = [{ id: 'person:a', artistName: 'Artist A', trackTitle: '2 eligible tracks', trackIds: ['a1', 'a2'], trackCount: 2, tracks: [{ id: 'a1', artistName: 'Artist A', trackTitle: 'Song A' }, { id: 'a2', artistName: 'Artist A', trackTitle: 'Song B' }] }, { id: 'person:b', artistName: 'Artist B', trackTitle: 'Song C', trackIds: ['b1'], trackCount: 1 }];

function assertExtracts(scene, label) {
  assert.equal(isResolvedLiveOverlayScene(scene), true, label);
  assert.equal(extractOverlayScene({ scene }).mode, scene.mode, `${label} extracts`);
}

test('production resolver wheel, result, YouTube, TikTok, and optional trackId scenes pass extraction', () => {
  assertExtracts(resolveLiveOverlayScene({ currentSession: session, overlayState: { wheelOverlayActive: true, wheelCeremonyStatus: 'ready' }, wheelCandidates: candidates, now }), 'grouped wheel ready without nested weights');
  assertExtracts(resolveLiveOverlayScene({ currentSession: session, overlayState: { wheelOverlayActive: true, wheelCeremonyStatus: 'result_pending', wheelCeremonyResultTrackId: 'person:a', wheelCeremonyCandidateOrder: ['person:a', 'person:b'], wheelCeremonyFinalRotationDeg: 720, wheelCeremonyLandingAngleDeg: 90 }, wheelCandidates: candidates, now }), 'wheel result');
  assertExtracts(resolveLiveOverlayScene({ currentSession: session, nowPlaying: ytTrack, playerSync: { provider: 'youtube', videoId: 'abcdefghijk', playbackState: 'playing', currentTimeSeconds: 12, updatedAt: now.toISOString(), muted: true }, now }), 'youtube sync optional trackId');
  assertExtracts(resolveLiveOverlayScene({ currentSession: session, nowPlaying: ttTrack, playerSync: { provider: 'tiktok', postId: '6718335390845095173', playbackState: 'paused', currentTimeSeconds: 4, durationSeconds: 59, updatedAt: now.toISOString(), muted: true }, now }), 'tiktok sync optional trackId');
});

test('overlay rejects malformed nested fields and retains last-good until later valid recovery', () => {
  const scene = resolveLiveOverlayScene({ currentSession: session, nowPlaying: ytTrack, now });
  for (const bad of [
    { ...scene, title: {} },
    { ...scene, sourceUrl: 'javascript:alert(1)' },
    { ...scene, priority: Number.NaN },
    { ...scene, track: { ...scene.track, sourceType: 'bogus' } },
    { ...scene, youtube: { provider: 'youtube', videoId: 'abcdefghijk', playbackState: 'playing', currentTimeSeconds: 1, hostUpdatedAt: now.toISOString(), muted: true } },
    { ...scene, wheelCeremony: { status: 'cancelled', storedStatus: 'cancelled', candidateCount: 1, displayCandidates: 'not-array', hiddenCandidateCount: 0, spinDurationMs: 24000 } },
  ]) assert.equal(isResolvedLiveOverlayScene(bad), false);
  const initial = { scene, connected: true, held: false, failureReason: null, generation: 1 };
  const held = reduceOverlayFailure(initial, 'timeout', 2);
  assert.equal(held.scene.title, scene.title);
  assert.equal(held.held, true);
  const recovered = reduceOverlaySuccess(held, resolveLiveOverlayScene({ currentSession: session, nowPlaying: ttTrack, now }), 3);
  assert.equal(recovered.connected, true);
  assert.equal(recovered.scene.track.trackTitle, 'Post');
  assert.equal(reduceOverlaySuccess(recovered, scene, 2).scene.track.trackTitle, 'Post');
});

test('wheel audio primary fallback success, total failure, blocked autoplay, and stale generation isolation', async () => {
  const attempts = [];
  const success = await playWheelSpinWithFallback(['a.mp3', 'b.mp3'], async (path) => { attempts.push(path); if (path === 'a.mp3') throw new Error('decode'); }, 1, (g) => g === 1);
  assert.deepEqual(attempts, ['a.mp3', 'b.mp3']);
  assert.equal(success.played, true);
  const failed = await playWheelSpinWithFallback(['a.mp3', 'b.mp3', 'c.mp3'], async () => { throw new Error('decode'); }, 2, (g) => g === 2);
  assert.equal(failed.attempts.length, 2);
  assert.match(failed.notice, /CONTINUES SILENTLY/);
  const blocked = await playWheelSpinWithFallback(['a.mp3', 'b.mp3'], async () => { throw new DOMException('blocked', 'NotAllowedError'); }, 3, (g) => g === 3);
  assert.equal(blocked.blocked, true);
  assert.deepEqual(blocked.attempts, ['a.mp3']);
  const stale = await playWheelSpinWithFallback(['a.mp3', 'b.mp3'], async () => {}, 4, () => false);
  assert.equal(stale.notice, null);
});

test('wheel audio termination stops, resets, and can clear source before replacement/unmount', () => {
  const audio = { src: 'a.mp3', loop: true, volume: 0.2, currentTime: 14, paused: false, pause() { this.paused = true; }, play: async () => {} };
  terminateWheelSpinAudio(audio, { volume: 0.82, clearSource: true });
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.volume, 0.82);
  assert.equal(audio.loop, false);
  assert.equal(audio.src, '');
});
