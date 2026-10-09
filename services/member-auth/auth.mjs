import { DatabaseSync as Database } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { isAbsolute } from 'node:path';
import { createMailOutbox } from './mail.mjs';
import { AUTH_PATH,COOKIE_PREFIX } from './contract.mjs';

export function createMemberAuth(configuration) {
  const {databasePath,baseURL,secret}=configuration;
  const url=new URL(baseURL);
  if(url.protocol!=='https:'||url.pathname!==AUTH_PATH||url.search||url.hash)throw new Error('Invalid canonical auth URL');
  if(!isAbsolute(databasePath)||!secret||secret.length<32)throw new Error('Absolute database path and private auth secret required');
  const database=new Database(databasePath);
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
  const outbox=createMailOutbox(database,configuration);
  const background=new Set();
  const auth=betterAuth({
    appName:'BARCODE Network',baseURL,basePath:AUTH_PATH,secret,database,
    trustedOrigins:[url.origin],verification:{storeIdentifier:'hashed'},
    emailAndPassword:{enabled:true,requireEmailVerification:true,autoSignIn:false,minPasswordLength:12,maxPasswordLength:128,revokeSessionsOnPasswordReset:true,resetPasswordTokenExpiresIn:3600,sendResetPassword:async({user,url})=>{await outbox.enqueue({kind:'recovery',email:user.email,url});}},
    emailVerification:{sendOnSignUp:true,sendOnSignIn:false,autoSignInAfterVerification:true,expiresIn:3600,sendVerificationEmail:async({user,url})=>{await outbox.enqueue({kind:'verification',email:user.email,url});}},
    session:{expiresIn:7*86400,updateAge:86400,cookieCache:{enabled:false}},
    rateLimit:{enabled:true,storage:'database',window:60,max:30,customRules:{'/sign-in/email':{window:60,max:5},'/sign-up/email':{window:3600,max:5},'/send-verification-email':{window:3600,max:5},'/request-password-reset':{window:3600,max:5}}},
    advanced:{backgroundTasks:{handler:(promise)=>{const task=Promise.resolve(promise);background.add(task);void task.finally(()=>background.delete(task)).catch(()=>{});}},cookiePrefix:COOKIE_PREFIX,useSecureCookies:true,defaultCookieAttributes:{httpOnly:true,secure:true,sameSite:'lax',path:'/'},ipAddress:{ipAddressHeaders:['x-barcode-client-ip']}},
    logger:{level:'error',log:(level,message,...details)=>{if(configuration.onError&&level==='error'){configuration.onError(message,...details);return;}if(level==='error')console.error('member_auth_error', typeof message==='string'&&message.includes('rate')?'rate_limit':'request_failed');}},
  });
  return {auth,database,outbox,async migrate(){const migration=await getMigrations(auth.options);await migration.runMigrations();},async assertReady(){const plan=await getMigrations(auth.options);if(plan.toBeCreated.length||plan.toBeAdded.length||plan.toBeAddedIndexes.length||plan.unsafeChanges.length||plan.schemaProblems.length)throw new Error('Explicit account schema migration required');},async close(){await Promise.allSettled([...background]);database.close();}};
}
