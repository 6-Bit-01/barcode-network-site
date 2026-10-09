import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const backupScript = fileURLToPath(new URL('../backup.mjs', import.meta.url));
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'barcode-member-native-backup-test-'));
  const source = join(directory, 'member.sqlite');
  const destination = join(directory, 'backup.sqlite');
  const database = new DatabaseSync(source);
  t.after(() => database.close());
  database.exec('CREATE TABLE records (value TEXT NOT NULL)');
  database.prepare('INSERT INTO records (value) VALUES (?)').run('original committed row');
  return { directory, source, destination, database };
}
function runBackup(source, destination, cwd) {
  return spawnSync(process.execPath, ['--no-addons', backupScript, destination], {
    cwd,
    env: { ...process.env, BARCODE_MEMBER_DATABASE_PATH: source },
    encoding: 'utf8',
    timeout: 15000,
  });
}

test('backup CLI uses native SQLite and captures committed WAL rows with verified integrity', (t) => {
  const { source, destination, database } = fixture(t);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0');
  database.prepare('INSERT INTO records (value) VALUES (?)').run('recent committed WAL row');
  assert.ok(statSync(`${source}-wal`).size > 0, 'The recent write must still be in WAL');
  const result = runBackup(source, destination);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /member_backup_verified/);
  const restored = new DatabaseSync(destination, { readOnly: true });
  try {
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(restored.prepare('SELECT value FROM records ORDER BY rowid').all().map(row => row.value), [
      'original committed row',
      'recent committed WAL row',
    ]);
  } finally {
    restored.close();
  }
});

test('backup CLI rejects a missing source without creating either database file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'barcode-member-native-backup-test-'));
  const source = join(directory, 'missing.sqlite');
  const destination = join(directory, 'backup.sqlite');
  const result = runBackup(source, destination);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(source), false);
  assert.equal(existsSync(destination), false);
});

test('backup CLI refuses an existing destination and preserves all of its bytes', (t) => {
  const { source, destination } = fixture(t);
  const existing = new DatabaseSync(destination);
  existing.exec("CREATE TABLE prior_backup (value TEXT); INSERT INTO prior_backup VALUES ('retain this backup')");
  existing.close();
  const before = readFileSync(destination);
  const result = runBackup(source, destination);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.deepEqual(readFileSync(destination), before);
});

test('backup CLI rejects relative and identical destination paths without changing the source', (t) => {
  const { directory, source } = fixture(t);
  const before = readFileSync(source);
  const relative = runBackup(source, 'relative-backup.sqlite', directory);
  const identical = runBackup(source, source);
  assert.notEqual(relative.status, 0);
  assert.notEqual(identical.status, 0);
  assert.equal(existsSync(join(directory, 'relative-backup.sqlite')), false);
  assert.deepEqual(readFileSync(source), before);
});
