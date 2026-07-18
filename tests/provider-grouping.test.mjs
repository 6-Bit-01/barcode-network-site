import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('TikTok and Apple Music are grouped as built-in while Apple remains external-open only', () => {
  const source = readFileSync('src/components/RadioQueueForm.tsx', 'utf8');
  const builtIn = source.slice(source.indexOf('Built-in support'), source.indexOf('Also accepted'));
  const generic = source.slice(source.indexOf('Also accepted'), source.indexOf('Some accepted services'));
  assert.match(builtIn, /TikTok video or Short/);
  assert.match(builtIn, /Apple Music \(external open only\)/);
  assert.doesNotMatch(builtIn, /Amazon Music|Suno|Bandcamp/);
  const overlaySource = readFileSync('src/components/LiveOverlayReceiver.tsx', 'utf8') + readFileSync('src/components/AdminRadioQueueControl.tsx', 'utf8') + readFileSync('src/lib/live-overlay.ts', 'utf8');
  assert.doesNotMatch(overlaySource, /MusicKit|AppleMusicPlayer|apple_music.*iframe|provider: ["']apple_music["']/i);
  assert.match(generic, /Amazon Music/);
  assert.match(generic, /Suno/);
  assert.match(generic, /Bandcamp/);
});
