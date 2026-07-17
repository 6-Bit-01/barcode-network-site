import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WHEEL_CEREMONY_AUDIO, WHEEL_SPIN_AUDIO_PATHS, selectWheelSpinAudioPath, wheelAudioFallbackCandidates } from '../src/lib/wheel-audio.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicPath = (urlPath) => join(root, 'public', decodeURIComponent(urlPath.replace(/^\//, '')));
const encoded = (file) => `/audio/wheel/${encodeURIComponent(file).replace(/%28/g, '(').replace(/%29/g, ')')}`;

test('wheel spin pool equals all eligible numeric MP3 files on disk and excludes ceremony SFX', () => {
  const actual = readdirSync(join(root, 'public/audio/wheel')).filter((name) => /^\d+(?: \(1\))?\.mp3$/.test(name)).map(encoded).sort();
  const exported = [...WHEEL_SPIN_AUDIO_PATHS].sort();
  assert.deepEqual(exported, actual);
  assert.equal(new Set(WHEEL_SPIN_AUDIO_PATHS).size, WHEEL_SPIN_AUDIO_PATHS.length);
  for (const path of WHEEL_SPIN_AUDIO_PATHS) {
    assert.equal(existsSync(publicPath(path)), true, `${path} exists`);
    assert.notEqual(path, WHEEL_CEREMONY_AUDIO.cheer);
    assert.notEqual(path, WHEEL_CEREMONY_AUDIO.encrypt);
  }
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
});
