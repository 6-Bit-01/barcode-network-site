import { DatabaseSync as Database } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { invalidateSchemaChecks } from '@better-auth/core/db/internal';
import { isAbsolute } from 'node:path';
import { createMailOutbox } from './mail.mjs';
import { AUTH_PATH,COOKIE_PREFIX } from './contract.mjs';
import { APIError } from 'better-auth/api';
import { checkedName } from './names.mjs';
import { migrateAccessSchema, accessSchemaReady, registerNameConstraints, preflightAccessMigration } from './access-schema.mjs';
import { createMemberAccess } from './access.mjs';

export function createMemberAuth(configuration) {
  const {databasePath,baseURL,secret}=configuration;
  const url=new URL(baseURL);
  if(url.protocol!=='https:'||url.pathname!==AUTH_PATH||url.search||url.hash)throw new Error('Invalid canonical auth URL');
  if(!isAbsolute(databasePath)||!secret||secret.length<32)throw new Error('Absolute database path and private auth secret required');
  const database=new Database(databasePath);
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');

  registerNameConstraints(database);
  let tail=Promise.resolve();
  const serial=async(operation)=>{const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;try{return await operation();}finally{release();}};
  const outbox=createMailOutbox(database,{...configuration,databaseOperation:serial});
  const background=new Set();
  const auth=betterAuth({
    appName:'BARCODE Network',baseURL,basePath:AUTH_PATH,secret,database,
    trustedOrigins:[url.origin],verification:{storeIdentifier:'hashed'},
    emailAndPassword:{enabled:true,requireEmailVerification:true,autoSignIn:false,minPasswordLength:12,maxPasswordLength:128,revokeSessionsOnPasswordReset:true,resetPasswordTokenExpiresIn:3600,sendResetPassword:async({user,url})=>{await outbox.enqueue({kind:'recovery',email:user.email,url});}},
    emailVerification:{sendOnSignUp:true,sendOnSignIn:false,autoSignInAfterVerification:true,expiresIn:3600,sendVerificationEmail:async({user,url})=>{await outbox.enqueue({kind:'verification',email:user.email,url});}},

    user:{additionalFields:{nameKey:{type:'string',required:false,input:false,returned:false}}},
    databaseHooks:{
      user:{
        create:{before:async(user)=>({data:checkedName(database,user.name,user.id)})},
        update:{before:async(data,ctx)=>{
          if(!('name' in data))return;
          const userId=ctx?.context?.session?.user?.id;
          if(!userId)throw new APIError('UNAUTHORIZED',{code:'UNAUTHENTICATED',message:'Current account required.'});
          const access=database.prepare('SELECT suspended FROM member_access WHERE user_id=?').get(userId);
          if(!access||access.suspended)throw new APIError('FORBIDDEN',{code:'ACCOUNT_SUSPENDED',message:'Account is suspended.'});
          return{data:checkedName(database,data.name,userId)};
        }},
      },
      session:{create:{before:async(session)=>{
        const access=database.prepare('SELECT suspended FROM member_access WHERE user_id=?').get(session.userId);
        if(!access||access.suspended)throw new APIError('FORBIDDEN',{code:'ACCOUNT_SUSPENDED',message:'Account is suspended.'});
      }}},
    },
    session:{expiresIn:7*86400,updateAge:86400,cookieCache:{enabled:false}},
    rateLimit:{enabled:true,storage:'database',window:60,max:30,customRules:{'/sign-in/email':{window:60,max:5},'/sign-up/email':{window:3600,max:5},'/send-verification-email':{window:3600,max:5},'/request-password-reset':{window:3600,max:5}}},
    advanced:{backgroundTasks:{handler:(promise)=>{const task=Promise.resolve(promise);background.add(task);void task.finally(()=>background.delete(task)).catch(()=>{});}},cookiePrefix:COOKIE_PREFIX,useSecureCookies:true,defaultCookieAttributes:{httpOnly:true,secure:true,sameSite:'lax',path:'/'},ipAddress:{ipAddressHeaders:['x-barcode-client-ip']}},
    logger:{level:'error',log:(level,message,...details)=>{if(configuration.onError&&level==='error'){configuration.onError(message,...details);return;}if(level==='error')console.error('member_auth_error', typeof message==='string'&&message.includes('rate')?'rate_limit':'request_failed');}},
  });

  const originalHandler=auth.handler;
  auth.handler=(request)=>serial(async()=>{
    const response=await originalHandler(request);
    for(const [key,value]of Object.entries({'cache-control':'private, no-store','referrer-policy':'no-referrer'}))response.headers.set(key,value);
    if(new URL(request.url).pathname===AUTH_PATH+'/get-session'&&response.ok){
      const payload=await response.clone().json();
      if(payload?.user?.id&&database.prepare('SELECT suspended FROM member_access WHERE user_id=?').get(payload.user.id)?.suspended)return Response.json(null,{headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer'}});
    }
    return response;
  });
  const access=createMemberAccess({auth,database,outbox,baseURL,serial});
  return {auth,database,outbox,access,async migrate(options){preflightAccessMigration(database,options);const migration=await getMigrations({...auth.options,user:{...auth.options.user,additionalFields:{}}});await migration.runMigrations();migrateAccessSchema(database,options);invalidateSchemaChecks(database);},async assertReady(){const plan=await getMigrations(auth.options);if(plan.toBeCreated.length||plan.toBeAdded.length||plan.toBeAddedIndexes.length||plan.unsafeChanges.length||plan.schemaProblems.length)throw new Error('Explicit account schema migration required');accessSchemaReady(database);},async close(){await Promise.allSettled([...background]);await outbox.waitForIdle();await tail;database.close();}};
}