import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WHEEL_CEREMONY_AUDIO, WHEEL_SPIN_AUDIO_PATHS, selectWheelSpinAudioPath, wheelAudioFallbackCandidates } from '../src/lib/wheel-audio.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicPath = (urlPath) => join(root, 'public', decodeURIComponent(urlPath.replace(/^\//, '')));

test('wheel spin pool only references existing numeric assets', () => {
  assert.equal(new Set(WHEEL_SPIN_AUDIO_PATHS).size, WHEEL_SPIN_AUDIO_PATHS.length);
  for (const path of WHEEL_SPIN_AUDIO_PATHS) {
    assert.match(path, /^\/audio\/wheel\/.+\.mp3$/);
    assert.equal(existsSync(publicPath(path)), true, `${path} exists`);
    assert.notEqual(path, WHEEL_CEREMONY_AUDIO.cheer);
    assert.notEqual(path, WHEEL_CEREMONY_AUDIO.encrypt);
  }
  assert.equal(existsSync(publicPath(WHEEL_CEREMONY_AUDIO.cheer)), true);
  assert.equal(existsSync(publicPath(WHEEL_CEREMONY_AUDIO.encrypt)), true);
});

test('deterministic selection cannot produce missing or ceremony paths', () => {
  for (let i = 0; i < WHEEL_SPIN_AUDIO_PATHS.length * 4; i += 1) {
    const selected = selectWheelSpinAudioPath(() => i / (WHEEL_SPIN_AUDIO_PATHS.length * 4));
    assert.equal(WHEEL_SPIN_AUDIO_PATHS.includes(selected), true);
    assert.equal(existsSync(publicPath(selected)), true);
  }
});

test('bounded audio fallback candidates stay in the verified manifest', () => {
  assert.deepEqual(wheelAudioFallbackCandidates('/audio/wheel/not-real.mp3'), [WHEEL_SPIN_AUDIO_PATHS[0]]);
  const candidates = wheelAudioFallbackCandidates(WHEEL_SPIN_AUDIO_PATHS[2]);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0], WHEEL_SPIN_AUDIO_PATHS[2]);
  assert.equal(new Set(candidates).size, candidates.length);
  for (const candidate of candidates) assert.equal(WHEEL_SPIN_AUDIO_PATHS.includes(candidate), true);
});
