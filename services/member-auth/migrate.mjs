import { createMemberAuth } from './auth.mjs';
import { loadConfiguration } from './configuration.mjs';
const app=createMemberAuth(loadConfiguration());
try {await app.migrate();console.info('member_schema_ready');}finally{await app.close();}
