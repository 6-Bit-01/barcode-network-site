import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('TikTok is grouped as built-in without promoting generic providers', () => {
  const source = readFileSync('src/components/RadioQueueForm.tsx', 'utf8');
  const builtIn = source.slice(source.indexOf('Built-in support'), source.indexOf('Also accepted'));
  const generic = source.slice(source.indexOf('Also accepted'), source.indexOf('Some accepted services'));
  assert.match(builtIn, /TikTok video or Short/);
  assert.doesNotMatch(builtIn, /Apple Music|Amazon Music|Suno|Bandcamp/);
  assert.match(generic, /Apple Music/);
  assert.match(generic, /Amazon Music/);
  assert.match(generic, /Suno/);
  assert.match(generic, /Bandcamp/);
});
