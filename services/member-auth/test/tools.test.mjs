import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createMemberAuth } from '../auth.mjs';
import { createMemberHandler } from '../handler.mjs';
const origin='https://www.barcode-network.com',baseURL=origin+'/api/member/auth',serviceToken='private-crew-tools-test-token-12345678901234';
const songs='/api/member/tools/songs',claim='/api/member/worker/songs/claim',receipt='/api/member/worker/songs/receipt';
const empty={revision:0,title:'',lyrics:'',style:'',previous:null,pending:null,errorCode:null};
const seed={title:'Original',lyrics:'First verse\nSecond line',style:'Exact original style\n'};
const command=(expectedRevision=0,kind='generate',fields={})=>({requestId:randomUUID(),expectedRevision,kind,...fields});
async function fixture(t){
 const delivered=[],databasePath=join(mkdtempSync(join(tmpdir(),'crew-member-tools-')),'member.sqlite');
 const configuration={databasePath,baseURL,serviceToken,secret:'private-crew-tools-secret-12345678901234567',sender:'BARCODE Network <accounts@mail.barcode-network.com>',replyTo:'thebarcodenetwork@gmail.com',transport:async mail=>{delivered.push(mail);return{id:'mail-'+delivered.length};},onError:()=>{}};
 const app=createMemberAuth(configuration);await app.migrate();t.after(()=>app.close());
 const handle=createMemberHandler(app.auth,{...configuration,access:app.access,artists:app.artists,tools:app.tools});
 const request=(path,body,cookie='',extras={},method=body===undefined?'GET':'POST')=>handle(new Request(origin+path,{method,headers:{origin,'content-type':'application/json','x-barcode-service-token':serviceToken,cookie,...extras},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 async function user(email,name){assert.equal((await request('/api/member/auth/sign-up/email',{email,name,password:'Private-tools-pass-123!'})).status,200);const id=app.database.prepare('SELECT id FROM user WHERE email=?').get(email).id;do{await app.outbox.flushOne();}while(delivered.at(-1)?.to!==email);const response=await app.auth.handler(new Request(delivered.at(-1).text.match(/https:\/\/[^\s]+/)[0]));return{id,cookie:response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};}
 const owner=await user('owner@example.com','Founder');await app.access.bootstrapOwner(owner.id);
 const crew=await user('crew@example.com','Creator');
 app.database.prepare('UPDATE member_access SET crew=1,permissions=? WHERE user_id=?').run(JSON.stringify(['song.generate','insights.read']),crew.id);
 return{...app,request,user,owner,crew,configuration,handle};
}
const read=(a,u=a.crew)=>a.request(songs,undefined,u.cookie);
const submit=(a,b,u=a.crew)=>a.request(songs,b,u.cookie);
const take=async a=>{const r=await a.request(claim,{});assert.equal(r.status,200);return(await r.json()).commands[0];};
const finish=(a,c,result=seed)=>a.request(receipt,{commandId:c.id,leaseId:c.leaseId,outcome:'applied',result});
async function generated(a,result=seed){assert.equal((await submit(a,command())).status,200);const c=await take(a);assert.equal((await finish(a,c,result)).status,200);return(await(await read(a)).json()).draft;}

test('registered tools accept an empty direction and only project the current creator private workspace',async t=>{
 const a=await fixture(t);assert.deepEqual((await(await read(a)).json()).draft,empty);assert.deepEqual((await(await read(a,a.owner)).json()).draft,empty);
 const access=await(await a.request('/api/member/access',undefined,a.crew.cookie)).json();assert.deepEqual(access.access.availablePermissions,['show.overview','song.generate','insights.read']);
 const queued=await submit(a,command());assert.equal(queued.status,200);const draft=(await queued.json()).draft;assert.equal(draft.revision,1);assert.equal(draft.pending.status,'queued');
 const c=await take(a);assert.deepEqual(c.options,{idea:'',musicalDirection:'',mood:'',lengthStructure:'',revisionInstructions:''});assert.deepEqual(c.base,{title:'',lyrics:'',style:''});assert.deepEqual(c.limits,{maxLyricsWords:2000,targetSeconds:300});
 assert.deepEqual(Object.keys(c),['id','leaseId','kind','options','base','limits']);assert.equal(JSON.stringify(c).includes(a.crew.id),false);assert.equal((await(await read(a)).json()).draft.pending.status,'claimed');
 assert.equal((await finish(a,c)).status,200);assert.deepEqual((await(await read(a,a.owner)).json()).draft,empty);
 assert.equal((await a.request(songs+'?creatorId='+a.crew.id,undefined,a.owner.cookie)).status,400);
 assert.equal((await submit(a,{...command(),creatorId:a.owner.id})).status,400);
 assert.equal((await a.request('/api/member/owner/tools/songs?targetId='+a.crew.id,undefined,a.owner.cookie)).status,404);
});
test('edited base is atomic, revision protects concurrent commands and UUID retries are bound to the body',async t=>{
 const a=await fixture(t),b=command(0,'generate',{base:seed});const r=await submit(a,b);assert.equal(r.status,200);const queued=await r.json();assert.equal(queued.draft.lyrics,seed.lyrics);
 assert.deepEqual(await(await submit(a,b)).json(),queued);assert.equal((await submit(a,{...b,options:{idea:'different'}})).status,409);
 assert.equal((await submit(a,command(0))).status,409);assert.equal((await submit(a,command(1))).status,409);
 assert.equal(a.database.prepare('SELECT count(*) n FROM member_song_command').get().n,1);
 const c=await take(a);assert.equal((await finish(a,c)).status,200);assert.deepEqual(await(await submit(a,b)).json(),queued);
 const revision=(await(await read(a)).json()).draft.revision;
 const simultaneous=await Promise.all([submit(a,command(revision)),submit(a,command(revision))]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
});
test('lyrics whitespace word bounds permit 2000 and reject 2001 in edited and generated results',async t=>{
 const a=await fixture(t),lyrics=('word\t').repeat(2000).trimEnd();assert.equal((await submit(a,command(0,'generate',{base:{...seed,lyrics}}))).status,200);
 const c=await take(a);assert.equal(c.base.lyrics,lyrics);assert.equal((await finish(a,c,{...seed,lyrics:lyrics+' next'})).status,400);
 assert.equal((await a.request(receipt,{commandId:c.id,leaseId:c.leaseId,outcome:'failed',errorCode:'INVALID_RESULT'})).status,200);
 const state=(await(await read(a)).json()).draft;assert.equal(state.lyrics,lyrics);assert.equal(state.errorCode,'INVALID_RESULT');
 assert.equal((await submit(a,command(state.revision,'generate',{base:{...seed,lyrics:lyrics+' next'}}))).status,400);
 assert.equal((await submit(a,command(state.revision,'generate',{base:{...seed,lyrics:'x'.repeat(40001)}}))).status,400);
 assert.equal((await submit(a,command(state.revision,'generate',{base:{...seed,title:'x'.repeat(161)}}))).status,400);
 assert.equal((await submit(a,command(state.revision,'generate',{base:{...seed,style:'x'.repeat(6001)}}))).status,400);
 assert.equal((await submit(a,command(state.revision))).status,200);const valid=await take(a);assert.equal((await finish(a,valid,{...seed,lyrics})).status,200);
});
test('partial regeneration rejects worker replacement of the title or untouched component and Undo restores the previous pair',async t=>{
 const a=await fixture(t);let state=await generated(a);
 const edited={title:'Edited title',lyrics:'Edited lyrics\n ',style:'  exact style\n'};
 assert.equal((await submit(a,command(state.revision,'lyrics',{base:edited,options:{revisionInstructions:'Change only lyrics'}}))).status,200);let c=await take(a);
 assert.equal((await finish(a,c,{title:'wrong title',lyrics:'Revised lyrics',style:edited.style})).status,400);
 assert.equal((await finish(a,c,{title:edited.title,lyrics:'Revised lyrics',style:'trimmed'})).status,400);
 assert.equal((await finish(a,c,{title:edited.title,lyrics:'Revised lyrics',style:edited.style})).status,200);
 state=(await(await read(a)).json()).draft;assert.deepEqual(state.previous,edited);assert.equal(state.style,edited.style);
 assert.equal((await submit(a,command(state.revision,'style'))).status,200);c=await take(a);
 assert.equal((await finish(a,c,{title:edited.title,lyrics:'wrong',style:'Revised style'})).status,400);
 assert.equal((await finish(a,c,{title:edited.title,lyrics:'Revised lyrics',style:'Revised style'})).status,200);
 state=(await(await read(a)).json()).draft;assert.equal((await submit(a,command(state.revision,'undo'))).status,200);
 const restored=(await(await read(a)).json()).draft;assert.equal(restored.title,edited.title);assert.equal(restored.lyrics,'Revised lyrics');assert.equal(restored.style,edited.style);assert.equal(restored.pending,null);
 assert.deepEqual((await(await a.request(claim,{})).json()).commands,[]);
});
test('model failure retains edited base and previous successful pair without exposing arbitrary errors',async t=>{
 const a=await fixture(t),state=await generated(a),edited={title:'Keep title',lyrics:'Keep these lyrics',style:'Keep style'};
 assert.equal((await submit(a,command(state.revision,'generate',{base:edited}))).status,200);const c=await take(a);
 assert.equal((await a.request(receipt,{commandId:c.id,leaseId:c.leaseId,outcome:'failed',errorCode:'provider-secret-error'})).status,400);
 const body={commandId:c.id,leaseId:c.leaseId,outcome:'failed',errorCode:'PROVIDER_UNAVAILABLE'},r=await a.request(receipt,body);assert.equal(r.status,200);const saved=await r.json();assert.deepEqual(await(await a.request(receipt,body)).json(),saved);
 const draft=(await(await read(a)).json()).draft;assert.equal(draft.title,edited.title);assert.equal(draft.lyrics,edited.lyrics);assert.equal(draft.style,edited.style);assert.deepEqual(draft.previous,state.previous);assert.equal(draft.pending,null);assert.equal(draft.errorCode,'PROVIDER_UNAVAILABLE');
 assert.equal((await finish(a,c)).status,409);
});
test('permission and originating session are rechecked before claim and receipt and revoked commands never revive',async t=>{
 const a=await fixture(t);await submit(a,command());a.database.prepare('UPDATE member_access SET permissions=? WHERE user_id=?').run('[]',a.crew.id);
 assert.equal((await read(a)).status,403);assert.deepEqual((await(await a.request(claim,{})).json()).commands,[]);
 a.database.prepare('UPDATE member_access SET permissions=? WHERE user_id=?').run('["song.generate"]',a.crew.id);assert.deepEqual((await(await a.request(claim,{})).json()).commands,[]);
 let state=(await(await read(a)).json()).draft;assert.equal(state.pending,null);assert.equal(state.errorCode,'AUTHORITY_REVOKED');
 await submit(a,command(state.revision));const c=await take(a);a.database.prepare('DELETE FROM session WHERE userId=?').run(a.crew.id);assert.equal((await finish(a,c)).status,409);assert.equal((await read(a)).status,401);
 assert.equal(a.database.prepare('SELECT status FROM member_song_command WHERE id=?').get(c.id).status,'failed');
});
test('a permission removed and restored between worker polls cannot revive the original pending command',async t=>{
 const a=await fixture(t);await submit(a,command());const c=await take(a);
 const grant=(expectedRevision,permissions)=>a.request('/api/member/owner/accounts/action',{requestId:randomUUID(),targetId:a.crew.id,expectedRevision,action:'set-crew',assigned:true,permissions},a.owner.cookie);
 assert.equal((await grant(0,[])).status,200);assert.equal((await grant(1,['song.generate'])).status,200);
 assert.equal((await finish(a,c)).status,409);const state=(await(await read(a)).json()).draft;assert.equal(state.pending,null);assert.equal(state.errorCode,'AUTHORITY_REVOKED');assert.deepEqual((await(await a.request(claim,{})).json()).commands,[]);
});
test('suspended and expired sessions cannot accept a generated receipt including a saved success retry',async t=>{
 const a=await fixture(t);await submit(a,command());const c=await take(a);a.database.prepare('UPDATE session SET expiresAt=? WHERE userId=?').run(new Date(Date.now()-1000).toISOString(),a.crew.id);assert.equal((await finish(a,c)).status,409);
 await submit(a,command(),a.owner);const own=await take(a);assert.equal((await finish(a,own)).status,200);a.database.prepare('UPDATE member_access SET suspended=1 WHERE user_id=?').run(a.owner.id);assert.equal((await finish(a,own)).status,409);assert.equal((await read(a,a.owner)).status,401);
});
test('expired leases get a new binding and reject old, unknown or changed receipts',async t=>{
 const a=await fixture(t);await submit(a,command());const old=await take(a);a.database.prepare('UPDATE member_song_command SET lease_expires_at=? WHERE id=?').run(Date.now()-1,old.id);const current=await take(a);assert.equal(old.id,current.id);assert.notEqual(old.leaseId,current.leaseId);assert.equal((await finish(a,old)).status,409);
 assert.equal((await finish(a,{...current,leaseId:randomUUID()})).status,409);assert.equal((await finish(a,{...current,id:randomUUID()})).status,409);
 const r=await finish(a,current);assert.equal(r.status,200);assert.deepEqual(await(await finish(a,current)).json(),await r.json());assert.equal((await finish(a,current,{...seed,title:'changed'})).status,409);
});
test('song and transport requests reject forged fields, origin, content type and wrong methods without exposing auth fallback',async t=>{
 const a=await fixture(t);assert.equal((await read(a)).headers.get('vary'),'Cookie');
 assert.equal((await a.request(songs,undefined,a.crew.cookie,{origin:'https://evil.example'})).status,403);assert.equal((await a.request(songs,command(),a.crew.cookie,{'content-type':'text/plain'})).status,415);
 for(const b of [command(0,'bad'),{...command(),requestId:'not-uuid'},{...command(),options:{actorId:a.owner.id}},{...command(),base:{...seed,creatorId:a.owner.id}},{...command(),options:{idea:4}}])assert.equal((await submit(a,b)).status,400);
 assert.equal((await a.request(claim,{},'',{'x-barcode-service-token':'wrong'})).status,403);assert.equal((await a.request(claim,{},'',{origin:'https://evil.example'})).status,403);
 assert.equal((await a.request(claim,undefined)).status,404);assert.equal((await a.request(receipt,undefined)).status,404);assert.equal((await a.request(claim,{limit:3})).status,400);assert.equal((await a.request(claim,{creatorId:a.crew.id})).status,400);
 assert.equal((await a.request(claim,{},'',{'content-type':'text/plain'})).status,415);assert.equal((await a.request(songs,undefined,'__Secure-admin_session=forged')).status,401);
});
test('account insights contain bounded aggregates with no account identity and enforce the dedicated current permission',async t=>{
 const a=await fixture(t),path='/api/member/tools/insights';const r=await a.request(path,undefined,a.crew.cookie);assert.equal(r.status,200);const p=await r.json();assert.deepEqual({total:p.accounts.total,verified:p.accounts.verified,active:p.accounts.active,suspended:p.accounts.suspended},{total:2,verified:2,active:2,suspended:0});assert.ok(p.accounts.signupsByMonth.length<=120);assert.equal(p.accounts.signupsByMonth.at(-1).count,2);assert.equal(JSON.stringify(p).includes('example.com'),false);assert.equal(JSON.stringify(p).includes(a.owner.id),false);
 assert.equal((await a.request(path,undefined,a.owner.cookie)).status,200);a.database.prepare('UPDATE member_access SET permissions=? WHERE user_id=?').run('["song.generate"]',a.crew.id);assert.equal((await a.request(path,undefined,a.crew.cookie)).status,403);assert.equal((await a.request(path+'?targetId='+a.owner.id,undefined,a.owner.cookie)).status,400);
});
test('signup month aggregates include current genuine accounts with mixed ISO and epoch-millisecond timestamps',async t=>{
 const a=await fixture(t);await a.user('third@example.com','Third');const now=Date.now(),month=new Date(now).toISOString().slice(0,7);
 a.database.prepare('UPDATE user SET createdAt=? WHERE id=?').run(now,a.owner.id);a.database.prepare('UPDATE user SET createdAt=? WHERE id=?').run(String(now),a.crew.id);
 const response=await a.request('/api/member/tools/insights',undefined,a.owner.cookie);assert.equal(response.status,200);const p=await response.json();assert.equal(p.accounts.total,3);assert.deepEqual(p.accounts.signupsByMonth,[{month,count:3}]);
});
test('draft acceptance and worker application roll back if the important action audit cannot be committed',async t=>{
 const a=await fixture(t);a.database.exec("CREATE TRIGGER song_test_audit_failure BEFORE INSERT ON member_song_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure');END");
 assert.equal((await submit(a,command(0,'generate',{base:seed}))).status,503);assert.deepEqual((await(await read(a)).json()).draft,empty);assert.equal(a.database.prepare('SELECT count(*) n FROM member_song_command').get().n,0);
 a.database.exec('DROP TRIGGER song_test_audit_failure');await submit(a,command());const c=await take(a);a.database.exec("CREATE TRIGGER song_test_audit_failure BEFORE INSERT ON member_song_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure');END");assert.equal((await finish(a,c)).status,503);assert.equal((await(await read(a)).json()).draft.lyrics,'');assert.equal(a.database.prepare('SELECT status FROM member_song_command WHERE id=?').get(c.id).status,'leased');
});
test('tool migration requires explicit upgrade, preserves all existing identity authority and rejects missing constraints',async t=>{
 const a=await fixture(t),tables=['user','session','member_access','member_artist_state','member_mail_outbox'];const before=Object.fromEntries(tables.map(table=>[table,a.database.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));await a.migrate();await a.assertReady();for(const table of tables)assert.deepEqual(a.database.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),before[table]);
 a.database.exec('DROP TRIGGER member_song_user_insert;DROP TRIGGER member_song_access_revoke;DROP TRIGGER member_song_session_revoke;DROP TRIGGER member_song_verification_revoke;DROP TABLE member_song_audit;DROP TABLE member_song_command;DROP TABLE member_song_draft;DROP TABLE member_tool_schema');await assert.rejects(()=>a.assertReady(),/Explicit.*tool/i);await a.migrate();await a.assertReady();assert.deepEqual((await(await read(a)).json()).draft,empty);
 a.database.exec('DROP INDEX member_song_request_unique;CREATE INDEX member_song_request_unique ON member_song_command(user_id,request_id)');await assert.rejects(()=>a.assertReady(),/tool.*constraints/i);
});
