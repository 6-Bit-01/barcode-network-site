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
const empty={revision:0,title:'',lyrics:'',style:'',previous:null,pending:null,errorCode:null,selectedTrackId:null,options:{idea:'',musicalDirection:'',mood:'',lengthStructure:'',revisionInstructions:''},tracks:[]};
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
test('server-owned base is atomic, revision protects concurrent commands and UUID retries are bound to the body',async t=>{
 const a=await fixture(t),b=command(0,'generate',{base:{title:'Owner title',lyrics:'',style:''}});const r=await submit(a,b);assert.equal(r.status,200);const queued=await r.json();assert.equal(queued.draft.lyrics,'');
 assert.deepEqual(await(await submit(a,b)).json(),queued);assert.equal((await submit(a,{...b,options:{idea:'different'}})).status,409);
 assert.equal((await submit(a,command(0))).status,409);assert.equal((await submit(a,command(1))).status,409);
 assert.equal(a.database.prepare('SELECT count(*) n FROM member_song_command').get().n,1);
 const c=await take(a);assert.equal((await finish(a,c)).status,200);assert.deepEqual(await(await submit(a,b)).json(),queued);
 const revision=(await(await read(a)).json()).draft.revision;
 const simultaneous=await Promise.all([submit(a,command(revision)),submit(a,command(revision))]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
});
test('lyrics whitespace word bounds permit2000 generated words and reject2001 request and result words',async t=>{
 const a=await fixture(t),lyrics=('word\t').repeat(2000).trimEnd();assert.equal((await submit(a,command())).status,200);
 const c=await take(a);assert.equal(c.base.lyrics,'');assert.equal((await finish(a,c,{...seed,lyrics:lyrics+' next'})).status,400);
 assert.equal((await a.request(receipt,{commandId:c.id,leaseId:c.leaseId,outcome:'failed',errorCode:'INVALID_RESULT'})).status,200);
 const state=(await(await read(a)).json()).draft;assert.equal(state.lyrics,'');assert.equal(state.errorCode,'INVALID_RESULT');
 assert.equal((await submit(a,command(state.revision,'generate',{base:{...seed,lyrics:lyrics+' next'}}))).status,400);
 assert.equal((await submit(a,command(state.revision,'generate',{base:{...seed,lyrics:'x'.repeat(40001)}}))).status,400);
 assert.equal((await submit(a,command(state.revision,'generate',{base:{...seed,title:'x'.repeat(161)}}))).status,400);
 assert.equal((await submit(a,command(state.revision,'generate',{base:{...seed,style:'x'.repeat(6001)}}))).status,400);
 assert.equal((await submit(a,command(state.revision))).status,200);const valid=await take(a);assert.equal((await finish(a,valid,{...seed,lyrics})).status,200);
});
test('partial regeneration rejects worker replacement of the title or untouched component and Undo restores the previous pair',async t=>{
 const a=await fixture(t);let state=await generated(a);
 const edited={...seed,title:'Edited title'};
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
test('model failure retains server-owned song and previous successful pair without changing the archive',async t=>{
 const a=await fixture(t),state=await generated(a),edited={...seed,title:'Keep title'};
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
 assert.equal((await submit(a,command())).status,503);assert.deepEqual((await(await read(a)).json()).draft,empty);assert.equal(a.database.prepare('SELECT count(*) n FROM member_song_command').get().n,0);
 a.database.exec('DROP TRIGGER song_test_audit_failure');await submit(a,command());const c=await take(a);a.database.exec("CREATE TRIGGER song_test_audit_failure BEFORE INSERT ON member_song_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure');END");assert.equal((await finish(a,c)).status,503);assert.equal((await(await read(a)).json()).draft.lyrics,'');assert.equal(a.database.prepare('SELECT status FROM member_song_command WHERE id=?').get(c.id).status,'leased');
});
test('tool migration requires explicit upgrade, preserves all existing identity authority and rejects missing constraints',async t=>{
 const a=await fixture(t),tables=['user','session','member_access','member_artist_state','member_mail_outbox'];const before=Object.fromEntries(tables.map(table=>[table,a.database.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));await a.migrate();await a.assertReady();for(const table of tables)assert.deepEqual(a.database.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),before[table]);
 a.database.exec('DROP TRIGGER member_song_user_insert;DROP TRIGGER member_song_access_revoke;DROP TRIGGER member_song_session_revoke;DROP TRIGGER member_song_verification_revoke;DROP TABLE member_song_audit;DROP TABLE member_song_command;DROP TABLE member_song_draft;DROP TABLE member_song_archive;DROP TABLE member_tool_schema');await assert.rejects(()=>a.assertReady(),/Explicit.*tool/i);await a.migrate();await a.assertReady();assert.deepEqual((await(await read(a)).json()).draft,empty);
 a.database.exec('DROP INDEX member_song_request_unique;CREATE INDEX member_song_request_unique ON member_song_command(user_id,request_id)');await assert.rejects(()=>a.assertReady(),/tool.*constraints/i);
});


test('successful songs automatically archive privately and selection restores server text/options without a model job',async t=>{
 const a=await fixture(t);const options={idea:'Archive first',mood:'Bright'};await submit(a,command(0,'generate',{options}));let c=await take(a);await finish(a,c,seed);
 let first=(await(await read(a)).json()).draft;assert.equal(first.tracks.length,1);assert.equal(first.selectedTrackId,first.tracks[0].id);assert.deepEqual(Object.keys(first.tracks[0]),['id','title','createdAt','updatedAt']);assert.equal(first.options.idea,'Archive first');
 await submit(a,command(first.revision,'generate',{options:{idea:'Second'}}));c=await take(a);await finish(a,c,{title:'Second',lyrics:'Another verse',style:'Another style'});let second=(await(await read(a)).json()).draft;
 assert.equal(second.tracks.length,2);assert.notEqual(second.selectedTrackId,first.selectedTrackId);
 const select=command(second.revision,'select',{trackId:first.selectedTrackId});const response=await submit(a,select);assert.equal(response.status,200);const selected=(await response.json()).draft;assert.equal(selected.lyrics,seed.lyrics);assert.equal(selected.style,seed.style);assert.equal(selected.options.idea,'Archive first');assert.equal(selected.previous,null);assert.equal(selected.selectedTrackId,first.selectedTrackId);assert.deepEqual(await(await submit(a,select)).json(),{draft:selected});assert.deepEqual((await(await a.request(claim,{})).json()).commands,[]);
 assert.equal((await submit(a,command(0,'select',{trackId:first.selectedTrackId}),a.owner)).status,409);assert.equal((await(await read(a,a.owner)).json()).draft.tracks.length,0);
 assert.equal((await submit(a,command(selected.revision,'lyrics',{base:{...seed,lyrics:'Handcrafted replacement'}}))).status,409);assert.equal((await submit(a,command(selected.revision,'generate',{base:{...seed,style:'Handcrafted replacement'}}))).status,409);
 assert.equal((await submit(a,command(selected.revision,'lyrics',{options:{revisionInstructions:'Make it sharper'}}))).status,200);assert.equal((await submit(a,command(selected.revision+1,'select',{trackId:second.selectedTrackId}))).status,409);
 c=await take(a);assert.equal((await finish(a,c,{...seed,lyrics:'A sharper verse'})).status,200);let revised=(await(await read(a)).json()).draft;assert.equal(revised.tracks.length,2);assert.equal(revised.selectedTrackId,first.selectedTrackId);assert.equal((await submit(a,command(revised.revision,'undo'))).status,200);revised=(await(await read(a)).json()).draft;assert.equal(revised.lyrics,seed.lyrics);assert.equal(revised.tracks.length,2);
 await submit(a,command(revised.revision,'select',{trackId:second.selectedTrackId}));second=(await(await read(a)).json()).draft;await submit(a,command(second.revision,'select',{trackId:first.selectedTrackId}));assert.equal((await(await read(a)).json()).draft.lyrics,seed.lyrics);
});
test('archive keeps newest40 replacing only the successful new song creator oldest and retains idempotency',async t=>{
 const a=await fixture(t);let state=(await(await read(a)).json()).draft,oldest;for(let n=0;n<41;n++){assert.equal((await submit(a,command(state.revision,'generate',{options:{idea:'Track '+n}}))).status,200);const c=await take(a);const body={commandId:c.id,leaseId:c.leaseId,outcome:'applied',result:{title:'Track '+n,lyrics:'Verse '+n,style:'Style '+n}};const response=await a.request(receipt,body);assert.equal(response.status,200);state=(await response.json()).draft;if(n===0)oldest=state.selectedTrackId;if(n===40){assert.equal(state.tracks.length,40);assert.equal(state.tracks.some(track=>track.id===oldest),false);assert.deepEqual(await(await a.request(receipt,body)).json(),{ok:true,draft:state});}}
 assert.equal(a.database.prepare('SELECT count(*) n FROM member_song_archive WHERE user_id=?').get(a.crew.id).n,40);assert.equal((await(await read(a,a.owner)).json()).draft.tracks.length,0);
 const before=state;await submit(a,command(state.revision));const failed=await take(a);await a.request(receipt,{commandId:failed.id,leaseId:failed.leaseId,outcome:'failed',errorCode:'PROVIDER_UNAVAILABLE'});state=(await(await read(a)).json()).draft;assert.deepEqual(state.tracks,before.tracks);assert.equal(state.selectedTrackId,before.selectedTrackId);assert.equal(state.lyrics,before.lyrics);
});


test('explicit version1 archive upgrade preserves identity drafts commands audits and receipts and backfills only valid songs',async t=>{
 const a=await fixture(t);const successful=await generated(a);const historical=a.database.prepare("SELECT * FROM member_song_command WHERE kind='generate' AND status='applied'").get();for(const field of ['request_response','receipt_response']){const value=JSON.parse(historical[field]);for(const key of ['tracks','options','selectedTrackId'])delete value.draft[key];a.database.prepare('UPDATE member_song_command SET '+field+'=? WHERE id=?').run(JSON.stringify(value),historical.id);}await submit(a,command(successful.revision,'lyrics',{options:{revisionInstructions:'Refine'}}));const leased=await take(a);
 a.database.exec('ALTER TABLE member_song_command DROP COLUMN action;ALTER TABLE member_song_command DROP COLUMN track_id;ALTER TABLE member_song_draft DROP COLUMN options;ALTER TABLE member_song_draft DROP COLUMN selected_track_id;DROP TABLE member_song_archive;DROP TABLE member_tool_schema;CREATE TABLE member_tool_schema(version INTEGER PRIMARY KEY CHECK(version=1));INSERT INTO member_tool_schema VALUES(1)');
 const tables=['user','session','member_access','member_artist_state','member_mail_outbox','member_song_draft','member_song_command','member_song_audit'],before=Object.fromEntries(tables.map(table=>[table,a.database.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));
 await assert.rejects(()=>a.assertReady(),/Explicit member tool schema migration/);assert.equal(a.database.prepare('SELECT version FROM member_tool_schema').get().version,1);assert.equal(a.database.prepare("SELECT name FROM sqlite_master WHERE name='member_song_archive'").get(),undefined);
 await a.migrate();await a.assertReady();assert.equal(a.database.prepare('SELECT version FROM member_tool_schema').get().version,2);
 for(const table of tables){const columns=Object.keys(before[table][0]??{});if(columns.length)assert.deepEqual(a.database.prepare('SELECT '+columns.join(',')+' FROM '+table+' ORDER BY rowid').all(),before[table]);}
 const replay=await finish(a,{id:historical.id,leaseId:historical.lease_id});assert.equal(replay.status,200);const legacy=(await replay.json()).draft;assert.equal(legacy.lyrics,seed.lyrics);assert.deepEqual(legacy.tracks,[]);assert.equal(legacy.selectedTrackId,null);
 const state=(await(await read(a)).json()).draft;assert.equal(state.tracks.length,1);assert.equal(state.lyrics,seed.lyrics);assert.equal(state.style,seed.style);assert.equal(state.revision,successful.revision+1);assert.equal(state.pending.id,leased.id);assert.equal((await(await read(a,a.owner)).json()).draft.tracks.length,0);
 assert.equal((await finish(a,leased,{...seed,lyrics:'Upgraded pending verse'})).status,200);let current=(await(await read(a)).json()).draft;assert.equal(current.tracks.length,1);assert.equal(current.lyrics,'Upgraded pending verse');await a.migrate();await a.assertReady();current=(await(await read(a)).json()).draft;assert.equal(current.tracks.length,1);
 a.database.exec('DROP INDEX member_song_archive_user_order');await assert.rejects(()=>a.assertReady(),/archive constraints/);
});
test('archive success and selection roll back completely if the existing audit cannot commit',async t=>{
 const a=await fixture(t);let state=await generated(a);const first=state.selectedTrackId;await submit(a,command(state.revision));const c=await take(a);a.database.exec("CREATE TRIGGER song_test_archive_audit_failure BEFORE INSERT ON member_song_audit BEGIN SELECT RAISE(ABORT,'synthetic archive audit failure');END");assert.equal((await finish(a,c,{...seed,title:'Second'})).status,503);state=(await(await read(a)).json()).draft;assert.equal(state.tracks.length,1);assert.equal(state.selectedTrackId,first);assert.equal(state.lyrics,seed.lyrics);a.database.exec('DROP TRIGGER song_test_archive_audit_failure');await finish(a,c,{...seed,title:'Second'});state=(await(await read(a)).json()).draft;
 a.database.exec("CREATE TRIGGER song_test_archive_select_audit_failure BEFORE INSERT ON member_song_audit BEGIN SELECT RAISE(ABORT,'synthetic archive selection audit failure');END");assert.equal((await submit(a,command(state.revision,'select',{trackId:first}))).status,503);assert.deepEqual((await(await read(a)).json()).draft,state);
});


test('incomplete or whitespace-only applied results cannot create or overwrite private archive tracks',async t=>{
 const a=await fixture(t);let state=await generated(a);for(const kind of ['generate','lyrics','style']){await submit(a,command(state.revision,kind));const c=await take(a),before=(await(await read(a)).json()).draft,result={...seed,[kind==='style'?'style':'lyrics']:'   '};assert.equal((await finish(a,c,result)).status,400);const retained=(await(await read(a)).json()).draft;assert.deepEqual(retained.tracks,before.tracks);assert.equal(retained.lyrics,before.lyrics);assert.equal(retained.style,before.style);await a.request(receipt,{commandId:c.id,leaseId:c.leaseId,outcome:'failed',errorCode:'INVALID_RESULT'});state=(await(await read(a)).json()).draft;}
});


test('new songs start fresh Undo history and cannot erase or replace distinct autosaved tracks',async t=>{
 const a=await fixture(t);let first=await generated(a);assert.equal(first.previous,null);let response=await submit(a,command(first.revision,'undo'));assert.equal(response.status,409);assert.equal((await response.json()).code,'NOTHING_TO_UNDO');assert.deepEqual((await(await read(a)).json()).draft,first);
 await submit(a,command(first.revision,'generate'));let c=await take(a);const secondSong={title:'Second distinct song',lyrics:'Second complete verse',style:'Second complete style'};await finish(a,c,secondSong);let second=(await(await read(a)).json()).draft;assert.equal(second.previous,null);assert.equal(second.tracks.length,2);response=await submit(a,command(second.revision,'undo'));assert.equal(response.status,409);assert.equal((await response.json()).code,'NOTHING_TO_UNDO');assert.deepEqual((await(await read(a)).json()).draft,second);
 await submit(a,command(second.revision,'select',{trackId:first.selectedTrackId}));first=(await(await read(a)).json()).draft;assert.equal(first.lyrics,seed.lyrics);assert.equal(first.style,seed.style);assert.equal(first.previous,null);
 await submit(a,command(first.revision,'select',{trackId:second.selectedTrackId}));second=(await(await read(a)).json()).draft;assert.equal(second.lyrics,secondSong.lyrics);assert.equal(second.style,secondSong.style);assert.equal(second.previous,null);
 await submit(a,command(second.revision,'lyrics'));c=await take(a);await finish(a,c,{...secondSong,lyrics:'Refined second verse'});second=(await(await read(a)).json()).draft;assert.deepEqual(second.previous,secondSong);assert.equal((await submit(a,command(second.revision,'undo'))).status,200);second=(await(await read(a)).json()).draft;assert.equal(second.lyrics,secondSong.lyrics);assert.equal(second.style,secondSong.style);assert.equal(second.tracks.length,2);
 await submit(a,command(second.revision,'select',{trackId:first.selectedTrackId}));assert.equal((await(await read(a)).json()).draft.lyrics,seed.lyrics);
});

test('precise refusal receipts preserve saved songs, exact retries and reset lineage',async t=>{
 const a=await fixture(t);let state=await generated(a);
 for(const errorCode of ['BUDGET_DAILY_TOKENS','BUDGET_DAILY_COST','BUDGET_MONTHLY_COST','BUDGET_PRICING_UNAVAILABLE','PROVIDER_BILLING_REQUIRED']){
  const before=state;await submit(a,command(state.revision,'lyrics'));const c=await take(a);
  const body={commandId:c.id,leaseId:c.leaseId,outcome:'failed',errorCode,resetAt:errorCode==='BUDGET_DAILY_TOKENS'?'2026-10-11T00:00:00+00:00':'2026-10-11T00:00:00Z'};
  for(const resetAt of ['private',42,'2026-10-11T00:00:00+01:00'])assert.equal((await a.request(receipt,{...body,resetAt})).status,400);
  const first=await a.request(receipt,body);assert.equal(first.status,200);const saved=await first.json();assert.deepEqual(await(await a.request(receipt,body)).json(),saved);
  assert.equal((await a.request(receipt,{...body,resetAt:'2026-10-12T00:00:00Z'})).status,409);
  state=(await(await read(a)).json()).draft;assert.equal(state.errorCode,errorCode);assert.equal(state.resetAt,body.resetAt);assert.equal(state.lyrics,before.lyrics);assert.equal(state.style,before.style);assert.deepEqual(state.tracks,before.tracks);assert.deepEqual(state.previous,before.previous);
 }
 await submit(a,command(state.revision,'lyrics'));state=(await(await read(a)).json()).draft;assert.equal(state.resetAt,undefined);const c=await take(a);assert.equal((await a.request(receipt,{commandId:c.id,leaseId:c.leaseId,outcome:'applied',result:seed,resetAt:'2026-10-11T00:00:00Z'})).status,400);await finish(a,c);state=(await(await read(a)).json()).draft;assert.equal(state.resetAt,undefined);
});
