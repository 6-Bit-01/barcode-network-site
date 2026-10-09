import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemberAuth } from '../auth.mjs';
import { createMemberHandler } from '../handler.mjs';
const origin='https://www.barcode-network.com', baseURL=origin+'/api/member/auth', serviceToken='private-test-service-token-1234567890123456789';
const cookies=r=>r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
async function fixture(t,overrides={}){
 const delivered=[],databasePath=join(mkdtempSync(join(tmpdir(),'access-')),'member.sqlite');
 const configuration={databasePath,baseURL,serviceToken,secret:'test-only-access-secret-123456789012345678901',sender:'BARCODE Network <accounts@mail.barcode-network.com>',replyTo:'thebarcodenetwork@gmail.com',transport:async m=>{delivered.push(m);return{id:'mail-'+delivered.length};},onError:()=>{},...overrides};
 const app=createMemberAuth(configuration);await app.migrate();t.after(()=>app.close());
 const handle=createMemberHandler(app.auth,{...configuration,access:app.access});
 const request=(path,body,cookie='',extras={})=>handle(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json','x-barcode-service-token':serviceToken,cookie,...extras},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 async function user(email,name,verified=true){const signup=await request('/api/member/auth/sign-up/email',{email,name,password:'Private-password-43!'});assert.equal(signup.status,200);const id=app.database.prepare('SELECT id FROM user WHERE email=?').get(email).id;let cookie='';if(verified){do{await app.outbox.flushOne();}while(delivered.at(-1)?.to!==email);const url=delivered.at(-1).text.match(/https:\/\/[^\s]+/)[0];cookie=cookies(await app.auth.handler(new Request(url)));}return{id,cookie,email};}
 return {...app,request,user,delivered};
}
const action=(target,revision,kind,fields={})=>({requestId:crypto.randomUUID(),targetId:target,expectedRevision:revision,action:kind,...fields});
test('access requires a live verified account and explicit exact-ID grants',async t=>{
 const a=await fixture(t),member=await a.user('member@example.com','Member');
 assert.equal((await a.request('/api/member/access')).status,401);
 const response=await a.request('/api/member/access',undefined,member.cookie);assert.equal(response.status,200);
 const p=await response.json();assert.deepEqual(p.access,{owner:false,crew:false,permissions:[],availablePermissions:[]});assert.deepEqual(p.user,{id:member.id,name:'Member'});
 assert.equal((await a.request('/api/member/owner/accounts',undefined,member.cookie)).status,403);
 assert.equal((await a.request('/api/member/access',undefined,member.cookie,{'x-barcode-service-token':'wrong'})).status,403);
 await a.access.bootstrapOwner(member.id);
 assert.equal((await (await a.request('/api/member/access',undefined,member.cookie)).json()).access.owner,true);
 a.database.prepare('UPDATE member_access SET owner=0 WHERE user_id=?').run(member.id);
 assert.equal((await a.request('/api/member/owner/accounts',undefined,member.cookie)).status,403);
});
test('normalized names reject registration and rename collisions atomically without changing permanent IDs',async t=>{
 const a=await fixture(t),one=await a.user('one@example.com','Ｃｏｏｌ   Name'),two=await a.user('two@example.com','Other');
 const collision=await a.request('/api/member/auth/sign-up/email',{email:'collision@example.com',name:' cool name ',password:'Private-password-43!'});assert.equal(collision.status,400);
 const rename=await a.request('/api/member/auth/update-user',{name:'COOL NAME'},two.cookie);assert.equal(rename.status,400);assert.equal((await rename.json()).code,'NAME_UNAVAILABLE');
 assert.equal(a.database.prepare('SELECT name FROM user WHERE id=?').get(two.id).name,'Other');
 for(const name of ['Admin','B\u200bNL','Network\u0000Name'])assert.equal((await a.request('/api/member/auth/update-user',{name},two.cookie)).status,400);
 const writes=await Promise.all(['First','FIRST'].map(name=>a.request('/api/member/auth/update-user',{name},name==='First'?one.cookie:two.cookie)));assert.deepEqual(writes.map(r=>r.status).sort(),[200,400]);
 assert.equal(a.database.prepare('SELECT count(*) n FROM user').get().n,2);
});
test('owner mutations enforce revisions, strict fields and permissions, and retry once with one audit',async t=>{
 const a=await fixture(t),owner=await a.user('owner@example.com','Founder'),member=await a.user('target@example.com','Target');await a.access.bootstrapOwner(owner.id);
 const directory=await a.request('/api/member/owner/accounts?limit=1&sort=name',undefined,owner.cookie);assert.equal(directory.status,200);const d=await directory.json();assert.equal(d.accounts.length,1);assert.ok(d.nextCursor);
 const req=action(member.id,0,'set-crew',{assigned:true,permissions:[]});
 assert.equal((await a.request('/api/member/owner/accounts/action',{...req,actorId:owner.id},owner.cookie)).status,400);
 assert.equal((await a.request('/api/member/owner/accounts/action',{...req,permissions:['song.generate']},owner.cookie)).status,400);
 const result=await a.request('/api/member/owner/accounts/action',req,owner.cookie);assert.equal(result.status,200);const p=await result.json();assert.equal(p.account.crew,true);assert.equal(p.account.revision,1);
 assert.deepEqual(await (await a.request('/api/member/owner/accounts/action',req,owner.cookie)).json(),p);
 assert.equal(a.database.prepare("SELECT count(*) n FROM member_access_audit WHERE action='set-crew'").get().n,1);
 assert.equal((await a.request('/api/member/owner/accounts/action',action(member.id,0,'set-name',{name:'Stale'}),owner.cookie)).status,409);
 assert.equal((await a.request('/api/member/owner/accounts/action',action(member.id,1,'set-name',{name:'Fresh'}),owner.cookie,{origin:'https://evil.example'})).status,403);
 assert.equal((await a.request('/api/member/owner/accounts/action',action(owner.id,1,'suspend'),owner.cookie)).status,409);
 const crew=await (await a.request('/api/member/access',undefined,member.cookie)).json();assert.deepEqual(crew.access,{owner:false,crew:true,permissions:[],availablePermissions:[]});
});
test('suspension revokes sessions, blocks password and verification auto-login, and recovery cannot reactivate',async t=>{
 const a=await fixture(t),owner=await a.user('owner@example.com','Founder'),member=await a.user('target@example.com','Target'),unverified=await a.user('unverified@example.com','Pending',false);await a.access.bootstrapOwner(owner.id);
 assert.equal((await a.request('/api/member/owner/accounts/action',action(member.id,0,'suspend'),owner.cookie)).status,200);
 assert.equal((await a.request('/api/member/access',undefined,member.cookie)).status,401);
 const login=await a.request('/api/member/auth/sign-in/email',{email:member.email,password:'Private-password-43!'});assert.equal(login.status,403);assert.equal(cookies(login),'');
 await a.request('/api/member/owner/accounts/action',action(unverified.id,0,'suspend'),owner.cookie);
 await a.outbox.flushOne();const link=a.delivered.at(-1).text.match(/https:\/\/[^\s]+/)[0];const verify=await a.auth.handler(new Request(link));assert.equal(cookies(verify),'');
 const recovery=action(member.id,1,'send-recovery');assert.equal((await a.request('/api/member/owner/accounts/action',recovery,owner.cookie)).status,200);assert.equal((await a.request('/api/member/owner/accounts/action',recovery,owner.cookie)).status,200);
 assert.equal(a.database.prepare("SELECT count(*) n FROM member_mail_outbox WHERE status='pending'").get().n,1);assert.equal(a.database.prepare('SELECT suspended FROM member_access WHERE user_id=?').get(member.id).suspended,1);
 await a.request('/api/member/owner/accounts/action',action(member.id,2,'reactivate'),owner.cookie);
 assert.equal((await a.request('/api/member/access',undefined,member.cookie)).status,401);
 assert.equal((await a.request('/api/member/auth/sign-in/email',{email:member.email,password:'Private-password-43!'})).status,200);
});
test('bootstrap requires verified permanent ID and refuses suspended, unknown and last-owner removal',async t=>{
 const a=await fixture(t),pending=await a.user('pending@example.com','Pending',false),member=await a.user('member@example.com','Member');
 assert.ok(a.access,'Explicit access authority must exist');
 await assert.rejects(()=>a.access.bootstrapOwner('member@example.com'));await assert.rejects(()=>a.access.bootstrapOwner(pending.id));await a.access.bootstrapOwner(member.id);
 await assert.rejects(()=>a.access.revokeOwner(member.id));await a.assertReady();await a.migrate();assert.equal(a.database.prepare('SELECT owner FROM member_access WHERE user_id=?').get(member.id).owner,1);
});

test('SQLite rejects forged name keys and reserved names even outside the HTTP hooks',async t=>{
 const a=await fixture(t),member=await a.user('member@example.com','Member');
 assert.throws(()=>a.database.prepare('UPDATE user SET name=?,nameKey=? WHERE id=?').run('Admin','admin',member.id));
 assert.throws(()=>a.database.prepare('UPDATE user SET name=?,nameKey=? WHERE id=?').run('Other','forged',member.id));
 assert.equal(a.database.prepare('SELECT name FROM user WHERE id=?').get(member.id).name,'Member');
});
test('migration preserves auth rows, stops privately on conflicts and preserves only reviewed reserved ID',async t=>{
 const {DatabaseSync}=await import('node:sqlite'),{migrateAccessSchema}=await import('../access-schema.mjs');
 const directory=mkdtempSync(join(tmpdir(),'migration-')),db=new DatabaseSync(join(directory,'legacy.sqlite'));t.after(()=>db.close());
 db.exec("PRAGMA foreign_keys=ON;CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER,createdAt TEXT,nameKey TEXT);CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT,expiresAt TEXT);INSERT INTO user VALUES('founder','BARCODE Network','founder@example.com',1,'2026-10-01T00:00:00.000Z',NULL);INSERT INTO session VALUES('session-one','founder','2026-11-01T00:00:00.000Z')");
 assert.throws(()=>migrateAccessSchema(db),/Reserved account name/);assert.equal(db.prepare('SELECT nameKey FROM user').get().nameKey,null);
 migrateAccessSchema(db,{preserveReservedUserId:'founder'});migrateAccessSchema(db);assert.equal(db.prepare('SELECT name FROM user').get().name,'BARCODE Network');assert.equal(db.prepare('SELECT count(*) n FROM session').get().n,1);assert.equal(db.prepare('SELECT owner FROM member_access').get().owner,0);
 const collision=new DatabaseSync(join(directory,'collision.sqlite'));t.after(()=>collision.close());collision.exec("CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,nameKey TEXT);INSERT INTO user VALUES('one','Name',NULL),('two','ＮＡＭＥ',NULL)");
 assert.throws(()=>migrateAccessSchema(collision),/collision/);assert.equal(collision.prepare('SELECT count(*) n FROM user WHERE nameKey IS NULL').get().n,2);
});
test('revoked sessions and grants deny retries and forbidden recovery creates no tokens, mail or audit',async t=>{
 const a=await fixture(t),owner=await a.user('owner@example.com','Founder'),member=await a.user('member@example.com','Member');await a.access.bootstrapOwner(owner.id);
 const req=action(member.id,0,'send-recovery'),mail=a.database.prepare('SELECT count(*) n FROM member_mail_outbox').get().n,verification=a.database.prepare('SELECT count(*) n FROM verification').get().n;
 assert.equal((await a.request('/api/member/owner/accounts/action',req,member.cookie)).status,403);
 assert.equal(a.database.prepare('SELECT count(*) n FROM member_mail_outbox').get().n,mail);assert.equal(a.database.prepare('SELECT count(*) n FROM verification').get().n,verification);
 const changed=action(member.id,0,'set-crew',{assigned:true,permissions:[]});assert.equal((await a.request('/api/member/owner/accounts/action',changed,owner.cookie)).status,200);
 a.database.prepare('UPDATE member_access SET owner=0 WHERE user_id=?').run(owner.id);assert.equal((await a.request('/api/member/owner/accounts/action',changed,owner.cookie)).status,403);
 a.database.prepare('UPDATE member_access SET owner=1 WHERE user_id=?').run(owner.id);a.database.prepare('DELETE FROM session WHERE userId=?').run(owner.id);assert.equal((await a.request('/api/member/owner/accounts/action',changed,owner.cookie)).status,401);
});

test('Owner name errors preserve the prior account and return stable unavailable-name results',async t=>{
 const a=await fixture(t),owner=await a.user('owner@example.com','Founder'),member=await a.user('member@example.com','Member');await a.access.bootstrapOwner(owner.id);
 const unavailable=await a.request('/api/member/owner/accounts/action',action(member.id,0,'set-name',{name:'ADMIN'}),owner.cookie);
 assert.equal(unavailable.status,400);assert.equal((await unavailable.json()).code,'NAME_UNAVAILABLE');assert.equal(a.database.prepare('SELECT name FROM user WHERE id=?').get(member.id).name,'Member');
 const changed=await a.request('/api/member/auth/update-user',{name:'New Member'},member.cookie);assert.equal(changed.status,200);
 const audit=a.database.prepare("SELECT * FROM member_access_audit WHERE actor_id=? AND target_id=? AND action='set-name'").get(member.id,member.id);assert.ok(audit);assert.equal(JSON.parse(audit.previous_state).name,'Member');assert.equal(JSON.parse(audit.resulting_state).name,'New Member');
});
test('Owner recovery uses the target verified address and existing one-use reset without changing suspension',async t=>{
 const a=await fixture(t),owner=await a.user('owner@example.com','Founder'),member=await a.user('member@example.com','Member');await a.access.bootstrapOwner(owner.id);
 await a.request('/api/member/owner/accounts/action',action(member.id,0,'suspend'),owner.cookie);
 assert.equal((await a.request('/api/member/owner/accounts/action',action(member.id,1,'send-recovery'),owner.cookie)).status,200);
 await a.outbox.flushOne();const mail=a.delivered.at(-1);assert.equal(mail.to,'member@example.com');
 const link=mail.text.match(/https:\/\/[^\s]+/)[0],callback=await a.auth.handler(new Request(link)),token=new URL(callback.headers.get('location')).searchParams.get('token');
 assert.ok(!JSON.stringify(a.database.prepare('SELECT * FROM verification').all()).includes(token));
 assert.equal((await a.request('/api/member/auth/reset-password',{token,newPassword:'Replaced-password-83!'})).status,200);assert.equal((await a.request('/api/member/auth/reset-password',{token,newPassword:'Replaced-password-93!'})).status,400);
 assert.equal(a.database.prepare('SELECT suspended FROM member_access WHERE user_id=?').get(member.id).suspended,1);assert.equal((await a.request('/api/member/auth/sign-in/email',{email:member.email,password:'Replaced-password-83!'})).status,403);
 assert.equal((await a.request('/api/member/access',undefined,owner.cookie)).status,200);
});

test('operator CLI only grants an explicitly supplied verified permanent ID',async t=>{
 const {spawnSync}=await import('node:child_process'),{fileURLToPath}=await import('node:url');
 const a=await fixture(t),member=await a.user('member@example.com','Member'),pending=await a.user('pending@example.com','Pending',false);
 const env={...process.env,BARCODE_MEMBER_DATABASE_PATH:a.database.location(),BETTER_AUTH_SECRET:'test-only-access-secret-123456789012345678901',BARCODE_MEMBER_SERVICE_TOKEN:serviceToken,RESEND_API_KEY:'offline-test-unused'};
 const script=fileURLToPath(new URL('../bootstrap-owner.mjs',import.meta.url));
 const run=args=>spawnSync(process.execPath,[script,...args],{env,encoding:'utf8',timeout:15000});
 assert.notEqual(run([]).status,0);assert.notEqual(run(['--user-id',member.email]).status,0);assert.notEqual(run(['--user-id',pending.id]).status,0);assert.equal(a.database.prepare('SELECT count(*) n FROM member_access WHERE owner=1').get().n,0);
 const grant=run(['--user-id',member.id]);assert.equal(grant.status,0,grant.stderr);assert.match(grant.stdout,/member_owner_bootstrap_ready/);assert.equal(a.database.prepare('SELECT owner FROM member_access WHERE user_id=?').get(member.id).owner,1);
 assert.notEqual(run(['--user-id',member.id,'--revoke']).status,0);assert.equal(a.database.prepare('SELECT owner FROM member_access WHERE user_id=?').get(member.id).owner,1);
});

test('migration CLI preflights reserved names before schema writes and explicit preserve-ID is idempotent',async t=>{
 const {spawnSync}=await import('node:child_process'),{fileURLToPath}=await import('node:url'),{DatabaseSync}=await import('node:sqlite'),{betterAuth}=await import('better-auth'),{getMigrations}=await import('better-auth/db/migration');
 const databasePath=join(mkdtempSync(join(tmpdir(),'upgrade-')),'legacy.sqlite'),db=new DatabaseSync(databasePath);t.after(()=>db.close());
 const auth=betterAuth({database:db,baseURL,secret:'test-only-access-secret-123456789012345678901',rateLimit:{enabled:true,storage:'database'},logger:{level:'error',log:()=>{}}});await(await getMigrations(auth.options)).runMigrations();
 db.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run('accepted-founder','BARCODE Network','founder@example.com',1,'2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z');
 const env={...process.env,BARCODE_MEMBER_DATABASE_PATH:databasePath,BETTER_AUTH_SECRET:'test-only-access-secret-123456789012345678901',BARCODE_MEMBER_SERVICE_TOKEN:serviceToken,RESEND_API_KEY:'offline-test-unused'},script=fileURLToPath(new URL('../migrate.mjs',import.meta.url));
 const run=args=>spawnSync(process.execPath,[script,...args],{env,encoding:'utf8',timeout:15000});
 assert.notEqual(run([]).status,0);assert.equal(db.prepare('PRAGMA table_info(user)').all().some(c=>c.name==='nameKey'),false);
 const explicit=run(['--preserve-reserved-user-id','accepted-founder']);assert.equal(explicit.status,0,explicit.stderr);assert.match(explicit.stdout,/member_schema_ready/);assert.equal(run([]).status,0);
 assert.equal(db.prepare('SELECT name FROM user').get().name,'BARCODE Network');assert.equal(db.prepare('SELECT owner FROM member_access').get().owner,0);
});
test('startup rejects incomplete access schema without silently recreating constraints',async t=>{
 const a=await fixture(t);a.database.exec('DROP TRIGGER member_access_session_insert');await assert.rejects(()=>a.assertReady(),/constraints/);
 assert.equal(a.database.prepare("SELECT 1 FROM sqlite_master WHERE name='member_access_session_insert'").get(),undefined);
});

test('access upgrade adds name keys and access tables atomically to an existing native auth schema',async t=>{
 const {DatabaseSync}=await import('node:sqlite'),{migrateAccessSchema}=await import('../access-schema.mjs');
 const db=new DatabaseSync(join(mkdtempSync(join(tmpdir(),'atomic-upgrade-')),'legacy.sqlite'));t.after(()=>db.close());
 db.exec("CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT);INSERT INTO user VALUES('member','Member')");
 migrateAccessSchema(db);assert.equal(db.prepare('SELECT nameKey FROM user').get().nameKey,'member');assert.equal(db.prepare('SELECT owner FROM member_access').get().owner,0);
 const failed=new DatabaseSync(join(mkdtempSync(join(tmpdir(),'atomic-failure-')),'legacy.sqlite'));t.after(()=>failed.close());
 failed.exec("CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT);INSERT INTO user VALUES('member','Member');CREATE TABLE member_access(user_id TEXT PRIMARY KEY);CREATE TRIGGER refuse_access BEFORE INSERT ON member_access BEGIN SELECT RAISE(ABORT,'simulated upgrade failure');END");
 assert.throws(()=>migrateAccessSchema(failed),/simulated upgrade failure/);assert.equal(failed.prepare('PRAGMA table_info(user)').all().some(c=>c.name==='nameKey'),false);assert.equal(failed.prepare("SELECT 1 FROM sqlite_master WHERE name='member_access_audit'").get(),undefined);
});

test('a slow mail provider does not hold the shared auth and account database gate',async t=>{
 let release;const pending=new Promise(resolve=>{release=resolve;});
 const a=await fixture(t,{transport:async()=>{await pending;return{id:'slow-provider'};}});
 await a.user('pending@example.com','Pending',false);
 const delivery=a.outbox.flushOne();
 const result=await Promise.race([a.request('/api/member/auth/get-session'),new Promise(resolve=>setTimeout(()=>resolve('blocked'),250))]);
 release();await delivery;assert.notEqual(result,'blocked');assert.equal(result.status,200);
});

test('authority requires exact verified status and cannot use a malformed user record as Owner',async t=>{
 const a=await fixture(t),owner=await a.user('owner@example.com','Founder');await a.access.bootstrapOwner(owner.id);
 a.database.prepare('UPDATE user SET emailVerified=2 WHERE id=?').run(owner.id);
 assert.equal((await a.request('/api/member/access',undefined,owner.cookie)).status,401);
 assert.equal((await a.request('/api/member/owner/accounts',undefined,owner.cookie)).status,401);
});

test('operator can revoke a suspended Owner while preserving the last active Owner',async t=>{
 const a=await fixture(t),owner=await a.user('owner@example.com','Founder'),other=await a.user('other@example.com','Other Owner');await a.access.bootstrapOwner(owner.id);await a.access.bootstrapOwner(other.id);
 assert.equal((await a.request('/api/member/owner/accounts/action',action(other.id,1,'suspend'),owner.cookie)).status,200);
 const revoked=await a.access.revokeOwner(other.id);assert.equal(revoked.owner,false);assert.equal(revoked.suspended,true);
 await assert.rejects(()=>a.access.revokeOwner(owner.id));assert.equal(a.database.prepare('SELECT owner FROM member_access WHERE user_id=?').get(owner.id).owner,1);
});
