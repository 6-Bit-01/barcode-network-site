import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('queue route segment has loading and error recovery boundaries with reset and return link', () => {
  assert.equal(existsSync('src/app/queue/loading.tsx'), true);
  assert.equal(existsSync('src/app/queue/error.tsx'), true);
  const loading = readFileSync('src/app/queue/loading.tsx', 'utf8');
  const error = readFileSync('src/app/queue/error.tsx', 'utf8');
  assert.match(loading, /role="status"/);
  assert.match(error, /onClick=\{reset\}/);
  assert.match(error, /href="\/queue"/);
  assert.match(error, /does not mean the queue is closed/);
});
