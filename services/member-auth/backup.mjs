import { DatabaseSync, backup } from 'node:sqlite';
import { isAbsolute } from 'node:path';
import { closeSync, existsSync, openSync } from 'node:fs';

const [destination] = process.argv.slice(2);
const source = process.env.BARCODE_MEMBER_DATABASE_PATH;
if (!source || !destination || !isAbsolute(source) || !isAbsolute(destination)
    || source === destination || !existsSync(source) || existsSync(destination)) {
  throw new Error('Existing source and distinct absolute database/unused backup paths required');
}

const database = new DatabaseSync(source, { readOnly: true });
try {
  // Reserve the new path exclusively so a concurrent backup cannot be overwritten.
  closeSync(openSync(destination, 'wx', 0o600));
  await backup(database, destination);
  const verified = new DatabaseSync(destination, { readOnly: true });
  try {
    if (verified.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') {
      throw new Error('Backup integrity failed');
    }
  } finally {
    verified.close();
  }
  console.info('member_backup_verified');
} finally {
  database.close();
}
