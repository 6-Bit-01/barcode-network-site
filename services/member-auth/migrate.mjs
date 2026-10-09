import { createMemberAuth } from './auth.mjs';
import { loadConfiguration } from './configuration.mjs';
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--preserve-reserved-user-id'&&/^[A-Za-z0-9_-]{1,128}$/.test(args[1])))throw new Error('Usage: node migrate.mjs [--preserve-reserved-user-id REVIEWED_EXISTING_BARCODE_ID]');
const app=createMemberAuth(loadConfiguration());
try {await app.migrate(args.length?{preserveReservedUserId:args[1]}:{});await app.assertReady();console.info('member_schema_ready');}finally{await app.close();}
