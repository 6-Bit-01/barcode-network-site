import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('queue route segment has loading and error recovery boundaries', () => {
  assert.equal(existsSync('src/app/queue/loading.tsx'), true);
  assert.equal(existsSync('src/app/queue/error.tsx'), true);
  const error = readFileSync('src/app/queue/error.tsx', 'utf8');
  assert.match(error, /reset/);
  assert.match(error, /does not mean the queue is closed/);
});
