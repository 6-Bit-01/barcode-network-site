import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const admin = readFileSync('src/app/admin/page.tsx', 'utf8');

test('manual refresh is strict and does not report success after failed required fetches', () => {
  assert.match(admin, /loadBnl = async \(strict = false\)/);
  assert.match(admin, /if \(strict && \(!publicRes\.ok \|\| !adminRes\.ok\)\)/);
  assert.match(admin, /await loadBnl\(true\); setRelayActionNote\('BNL status refreshed/);
  assert.match(admin, /setRelayActionError\('Manual refresh failed/);
});

test('failed flag update rolls back and failed actions do not report success without ok payload', () => {
  assert.match(admin, /const previous = flags; setFlags\(next\)/);
  assert.match(admin, /catch \(error\) \{ setFlags\(previous\)/);
  assert.match(admin, /payload\?\.ok !== true/);
});

test('pending force-pull polling stops after terminal result and manual refresh can resume unconfirmed polling', () => {
  assert.match(admin, /isPendingForcePullAttempt\(forcePullAttempt\)/);
  assert.match(admin, /Force-pull outcome is still unconfirmed/);
  assert.match(admin, /Pending outcomes were checked again if available/);
});
