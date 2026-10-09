import { createMemberAuth } from './auth.mjs';
import { createMemberHandler } from './handler.mjs';
import { createMemberHttpServer } from './http-server.mjs';
import { loadConfiguration } from './configuration.mjs';
const configuration=loadConfiguration();
const app=createMemberAuth(configuration);
// Schema upgrades are explicit; startup never silently migrates.
await app.assertReady();
const handle=createMemberHandler(app.auth,{...configuration,access:app.access,artists:app.artists});
const server=createMemberHttpServer(handle,configuration.baseURL);
server.listen(8788,'127.0.0.1',()=>console.info('member_auth_ready'));
const delivery=setInterval(()=>{void app.outbox.flushOne().catch(()=>console.error('member_mail_worker_failed'));},1000);
let closing=false;
async function shutdown(){if(closing)return;closing=true;clearInterval(delivery);await new Promise(resolve=>server.close(resolve));await app.outbox.waitForIdle();await app.close();}
process.on('SIGTERM',()=>{void shutdown();});process.on('SIGINT',()=>{void shutdown();});
