import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createMemberAuth } from '../auth.mjs';
import { createMemberHandler } from '../handler.mjs';
const origin='https://www.barcode-network.com',baseURL=origin+'/api/member/auth',serviceToken='private-artist-test-service-token-123456789';
const native={kind:'native',sessionId:'show-1',trackId:'track-1',fingerprint:'a'.repeat(64)};
const historical={kind:'historical',bundleDigest:'b'.repeat(64),recoveryTrackId:'recovery-1'};
async function fixture(t){
 const delivered=[],databasePath=join(mkdtempSync(join(tmpdir(),'artists-')),'member.sqlite');
 const configuration={databasePath,baseURL,serviceToken,secret:'private-test-artist-secret-123456789012345',sender:'BARCODE Network <accounts@mail.barcode-network.com>',replyTo:'thebarcodenetwork@gmail.com',transport:async mail=>{delivered.push(mail);return{id:'mail-'+delivered.length};},onError:()=>{}};
 const app=createMemberAuth(configuration);await app.migrate();t.after(()=>app.close());
 const handle=createMemberHandler(app.auth,{...configuration,access:app.access,artists:app.artists});
 const request=(path,body,cookie='',headers={})=>handle(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json','x-barcode-service-token':serviceToken,cookie,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 async function user(email,name,verified=true){assert.equal((await request('/api/member/auth/sign-up/email',{email,name,password:'Artist-password-123!'})).status,200);const id=app.database.prepare('SELECT id FROM user WHERE email=?').get(email).id;let cookie='';if(verified){do{await app.outbox.flushOne();}while(delivered.at(-1)?.to!==email);const response=await app.auth.handler(new Request(delivered.at(-1).text.match(/https:\/\/[^\s]+/)[0]));cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}return{id,cookie};}
 const owner=await user('owner@example.com','Founder');await app.access.bootstrapOwner(owner.id);
 return{...app,request,user,owner,configuration};
}
const action=(targetId,expectedRevision,kind,fields={})=>({requestId:randomUUID(),targetId,expectedRevision,action:kind,...fields});
const own=(a,u)=>a.request('/api/member/artists',undefined,u.cookie);
const review=(a,u)=>a.request('/api/member/owner/artists?targetId='+u.id,undefined,a.owner.cookie);
const change=(a,body,cookie=a.owner.cookie)=>a.request('/api/member/owner/artists/action',body,cookie);
test('Artist migration is explicit and preserves existing identity, access, credentials and mail',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','Member');
 const tables=['user','account','session','member_access','member_mail_outbox'],before=Object.fromEntries(tables.map(table=>[table,a.database.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));
 await a.migrate();await a.assertReady();for(const table of tables)assert.deepEqual(a.database.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),before[table]);
 assert.equal(a.database.prepare('SELECT version FROM member_access_schema').get().version,1);assert.equal(a.database.prepare('SELECT version FROM member_artist_schema').get().version,1);
 const response=await own(a,member);assert.equal(response.status,200);assert.deepEqual(await response.json(),{user:{id:member.id,name:'Member'},session:{expiresAt:before.session.find(s=>s.userId===member.id).expiresAt},revision:0,artists:[],legacyReferences:[]});
 a.database.exec('DROP TABLE member_artist_history');await assert.rejects(()=>a.assertReady(),/Artist|artist/);assert.equal(a.database.prepare("SELECT count(*) n FROM sqlite_master WHERE name='member_artist_history'").get().n,0);
});
test('only live Owner may approve exact projects; multiple representatives and projects preserve stable IDs',async t=>{
 const a=await fixture(t),one=await a.user('one@example.com','One'),two=await a.user('two@example.com','Two');
 assert.equal((await own(a,one)).status,200);assert.equal((await a.request('/api/member/artists')).status,401);
 assert.equal((await change(a,action(one.id,0,'approve-project',{projectKey:'collective'}),one.cookie)).status,403);
 const first=await change(a,action(one.id,0,'approve-project',{projectKey:'collective'}));assert.equal(first.status,200);const firstState=await first.json();assert.equal(firstState.ok,true);assert.equal(firstState.state.revision,1);const id=firstState.state.artists[0].id;assert.match(id,/^[0-9a-f-]{36}$/);
 assert.equal((await change(a,action(two.id,0,'approve-project',{projectKey:'collective'}))).status,200);
 assert.equal((await change(a,action(one.id,1,'approve-project',{projectKey:'side-project'}))).status,200);
 assert.equal((await (await own(a,two)).json()).artists[0].id,id);assert.equal((await (await own(a,one)).json()).artists.length,2);
 assert.equal((await a.request('/api/member/auth/update-user',{name:'Renamed'},one.cookie)).status,200);const renamed=await(await own(a,one)).json();assert.equal(renamed.user.name,'Renamed');assert.equal(renamed.artists[0].id,id);
 assert.equal(a.database.prepare('SELECT crew FROM member_access WHERE user_id=?').get(one.id).crew,0);
 assert.equal((await a.request('/api/member/artists',undefined,one.cookie,{'x-barcode-service-token':'wrong'})).status,403);
});
test('exact durable retries, complete body conflict and whole-target revision prevent lost updates',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','One'),req=action(member.id,0,'approve-project',{projectKey:'first'});
 const first=await change(a,req);assert.equal(first.status,200);const saved=await first.json();assert.deepEqual(await(await change(a,req)).json(),saved);
 assert.equal((await change(a,{...req,projectKey:'other'})).status,409);
 const results=await Promise.all(['second','third'].map(projectKey=>change(a,action(member.id,1,'approve-project',{projectKey}))));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await(await review(a,member)).json()).revision,2);assert.equal(a.database.prepare('SELECT count(*) n FROM member_artist_audit').get().n,2);
 a.database.prepare('UPDATE member_access SET owner=0 WHERE user_id=?').run(a.owner.id);assert.equal((await change(a,req)).status,403);
 a.database.prepare('UPDATE member_access SET owner=1 WHERE user_id=?').run(a.owner.id);a.database.prepare('DELETE FROM session WHERE userId=?').run(a.owner.id);assert.equal((await change(a,req)).status,401);
});
test('exact history is account-scoped and Artist revocation hides history while retaining reviewed rows',async t=>{
 const a=await fixture(t),one=await a.user('one@example.com','One'),two=await a.user('two@example.com','Two');
 await change(a,action(one.id,0,'approve-project',{projectKey:'collective'}));await change(a,action(two.id,0,'approve-project',{projectKey:'collective'}));const artistId=(await(await own(a,one)).json()).artists[0].id;
 assert.equal((await change(a,action(one.id,1,'approve-history',{artistId,reference:native}))).status,200);
 assert.equal((await change(a,action(one.id,2,'approve-history',{artistId,reference:historical}))).status,200);
 const visible=await(await own(a,one)).json();assert.equal(visible.legacyReferences.length,2);assert.equal((await(await own(a,two)).json()).legacyReferences.length,0);
 assert.equal((await change(a,action(one.id,3,'revoke-project',{artistId}))).status,200);const revoked=await(await own(a,one)).json();assert.deepEqual(revoked.artists,[]);assert.deepEqual(revoked.legacyReferences,[]);
 const ownerView=await(await review(a,one)).json();assert.equal(ownerView.artists[0].approved,false);assert.equal(ownerView.legacyReferences.length,2);assert.equal(ownerView.legacyReferences[0].approved,true);
 assert.equal((await change(a,action(one.id,4,'approve-history',{artistId,reference:native}))).status,409);
 assert.equal((await change(a,action(one.id,4,'revoke-history',{referenceId:visible.legacyReferences[0].id}))).status,200);
 assert.equal((await change(a,action(one.id,5,'approve-project',{projectKey:'collective'}))).status,200);assert.equal((await(await own(a,one)).json()).legacyReferences.length,1);
 assert.equal((await change(a,action(two.id,1,'revoke-history',{referenceId:visible.legacyReferences[1].id}))).status,404);
});
test('strict action/reference/query/origin validation rejects forged authority and active-target violations',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','One'),pending=await a.user('pending@example.com','Pending',false),body=action(member.id,0,'approve-project',{projectKey:'artist'});
 for(const extra of [{actorId:a.owner.id},{owner:true},{permissions:[]},{artistId:randomUUID()}])assert.equal((await change(a,{...body,...extra})).status,400);
 for(const projectKey of ['',' Artist ','ARTIST','bad\u0000key','a'.repeat(513)])assert.equal((await change(a,{...body,projectKey})).status,400);
 assert.equal((await change(a,{...body,requestId:'not-a-uuid'})).status,400);assert.equal((await change(a,body,a.owner.cookie.replaceAll('barcode_id','shared_admin'))).status,401);
 assert.equal((await a.request('/api/member/owner/artists/action',body,a.owner.cookie,{origin:'https://evil.example'})).status,403);
 for(const query of ['', '?targetId='+member.id+'&targetId='+member.id,'?targetId='+member.id+'&actorId='+a.owner.id])assert.equal((await a.request('/api/member/owner/artists'+query,undefined,a.owner.cookie)).status,400);
 assert.equal((await a.request('/api/member/artists?targetId='+member.id,undefined,member.cookie)).status,400);
 assert.equal((await change(a,action(pending.id,0,'approve-project',{projectKey:'pending'}))).status,409);
 await change(a,body);const artistId=(await(await own(a,member)).json()).artists[0].id;
 for(const reference of [{...native,privatePath:'/secret'},{...native,fingerprint:'f'.repeat(63)},{...native,kind:'rehearsal'},{...historical,bundleDigest:'G'.repeat(64)},{...historical,sessionId:'extra'}])assert.equal((await change(a,action(member.id,1,'approve-history',{artistId,reference}))).status,400);
 a.database.prepare('UPDATE member_access SET suspended=1 WHERE user_id=?').run(member.id);assert.equal((await own(a,member)).status,401);assert.equal((await change(a,action(member.id,1,'approve-history',{artistId,reference:native}))).status,409);
 assert.equal((await change(a,action(member.id,1,'revoke-project',{artistId}))).status,200);
});
test('committed retry survives another service connection and target isolation prevents reference transfer',async t=>{
 const a=await fixture(t),one=await a.user('one@example.com','One'),req=action(one.id,0,'approve-project',{projectKey:'one'});
 const saved=await(await change(a,req)).json(),reopened=createMemberAuth(a.configuration);await reopened.assertReady();t.after(()=>reopened.close());
 const handle=createMemberHandler(reopened.auth,{...a.configuration,access:reopened.access,artists:reopened.artists});
 const retry=await handle(new Request(origin+'/api/member/owner/artists/action',{method:'POST',headers:{origin,cookie:a.owner.cookie,'content-type':'application/json','x-barcode-service-token':serviceToken},body:JSON.stringify(req)}));assert.equal(retry.status,200);assert.deepEqual(await retry.json(),saved);
 assert.equal((await a.request('/api/member/auth/update-user',{name:'Renamed One'},one.cookie)).status,200);
 const two=await a.user('two@example.com','one');assert.deepEqual((await(await own(a,two)).json()).artists,[]);
 await change(a,action(one.id,1,'approve-project',{projectKey:'two'}));const ids=(await(await own(a,one)).json()).artists.map(v=>v.id);
 await change(a,action(one.id,2,'approve-history',{artistId:ids[0],reference:native}));assert.equal((await change(a,action(one.id,3,'approve-history',{artistId:ids[1],reference:native}))).status,409);
 assert.equal((await(await review(a,one)).json()).revision,3);
});
test('audit failure rolls back grant, registry and revision together',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','One');
 a.database.exec("CREATE TRIGGER artist_test_audit_failure BEFORE INSERT ON member_artist_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure');END");
 assert.equal((await change(a,action(member.id,0,'approve-project',{projectKey:'artist'}))).status,503);
 assert.equal(a.database.prepare('SELECT count(*) n FROM artist_project').get().n,0);assert.equal(a.database.prepare('SELECT count(*) n FROM member_artist_link').get().n,0);assert.equal((await(await own(a,member)).json()).revision,0);
});
test('retained-link and history bounds reject growth atomically and allow exact retained rows to be reapproved',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','One');
 for(let i=0;i<100;i++){const id=randomUUID();a.database.prepare('INSERT INTO artist_project(id,catalog_project_key) VALUES(?,?)').run(id,'project-'+i);a.database.prepare('INSERT INTO member_artist_link(user_id,artist_id,approved) VALUES(?,?,1)').run(member.id,id);}
 assert.equal((await change(a,action(member.id,0,'approve-project',{projectKey:'overflow'}))).status,409);assert.equal((await(await own(a,member)).json()).revision,0);
 const artistId=(await(await own(a,member)).json()).artists[0].id;
 for(let i=0;i<500;i++)a.database.prepare('INSERT INTO member_artist_history(id,user_id,artist_id,reference,approved) VALUES(?,?,?,?,0)').run(randomUUID(),member.id,artistId,JSON.stringify({...native,trackId:'track-'+i}));
 assert.equal((await change(a,action(member.id,0,'approve-history',{artistId,reference:{...native,trackId:'overflow'}}))).status,409);
 assert.equal((await change(a,action(member.id,0,'approve-history',{artistId,reference:{...native,trackId:'track-0'}}))).status,200);assert.equal((await(await own(a,member)).json()).legacyReferences.length,1);assert.equal((await(await review(a,member)).json()).legacyReferences.length,500);
});
test('existing access v1 database requires explicit Artist upgrade and validates real uniqueness',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','One');
 a.database.exec('DROP TRIGGER member_artist_user_insert;DROP TABLE member_artist_audit;DROP TABLE member_artist_history;DROP TABLE member_artist_link;DROP TABLE member_artist_state;DROP TABLE artist_project;DROP TABLE member_artist_schema');
 const authBefore=a.database.prepare('SELECT * FROM user ORDER BY id').all(),accessBefore=a.database.prepare('SELECT * FROM member_access ORDER BY user_id').all();
 await assert.rejects(()=>a.assertReady(),/Explicit Artist/);await a.migrate();await a.assertReady();assert.deepEqual(a.database.prepare('SELECT * FROM user ORDER BY id').all(),authBefore);assert.deepEqual(a.database.prepare('SELECT * FROM member_access ORDER BY user_id').all(),accessBefore);assert.equal((await(await own(a,member)).json()).revision,0);
 a.database.exec('DROP INDEX member_artist_project_key_unique;CREATE INDEX member_artist_project_key_unique ON artist_project(catalog_project_key)');await assert.rejects(()=>a.assertReady(),/Artist schema constraints/);
});
test('Artist endpoints enforce canonical origin, JSON and private projections without Crew inheritance',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','One');a.database.prepare('UPDATE member_access SET crew=1 WHERE user_id=?').run(member.id);
 assert.equal((await a.request('/api/member/owner/artists?targetId='+member.id,undefined,member.cookie)).status,403);
 assert.equal((await a.request('/api/member/artists',undefined,member.cookie,{origin:'https://evil.example'})).status,403);
 const req=action(member.id,0,'approve-project',{projectKey:'ac/dc'});
 assert.equal((await a.request('/api/member/owner/artists/action',req,a.owner.cookie,{'content-type':'text/plain'})).status,415);
 const missingOrigin=await createMemberHandler(a.auth,{...a.configuration,access:a.access,artists:a.artists})(new Request(origin+'/api/member/owner/artists/action',{method:'POST',headers:{cookie:a.owner.cookie,'content-type':'application/json','x-barcode-service-token':serviceToken},body:JSON.stringify(req)}));assert.equal(missingOrigin.status,403);
 const response=await change(a,req);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');
 const projection=await(await own(a,member)).json();assert.deepEqual(Object.keys(projection),['user','session','revision','artists','legacyReferences']);assert.equal(JSON.stringify(projection).includes('example.com'),false);assert.equal(projection.artists[0].projectKey,'ac/dc');
});
test('reviewed catalog keys and ledger portable identifiers retain their existing bounds and punctuation',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','One');
 assert.equal((await change(a,action(member.id,0,'approve-project',{projectKey:'a'.repeat(512)}))).status,200);const artistId=(await(await own(a,member)).json()).artists[0].id;
 const ref={kind:'native',sessionId:'native:2026.10-09',trackId:'t'+'x'.repeat(199),fingerprint:'c'.repeat(64)};
 assert.equal((await change(a,action(member.id,1,'approve-history',{artistId,reference:ref}))).status,200);
 const recovered={kind:'historical',bundleDigest:'d'.repeat(64),recoveryTrackId:'august:recovery.track-1'};assert.equal((await change(a,action(member.id,2,'approve-history',{artistId,reference:recovered}))).status,200);
 for(const trackId of ['x'.repeat(201),'bad/track','bad\u0000track','.leading','_leading'])assert.equal((await change(a,action(member.id,3,'approve-history',{artistId,reference:{...ref,trackId}}))).status,400);
});
test('Owner can correct a revoked exact history reference without implicit transfer or losing reference lineage',async t=>{
 const a=await fixture(t),member=await a.user('one@example.com','One');
 await change(a,action(member.id,0,'approve-project',{projectKey:'first'}));await change(a,action(member.id,1,'approve-project',{projectKey:'second'}));
 const artists=(await(await own(a,member)).json()).artists,firstId=artists.find(artist=>artist.projectKey==='first').id,secondId=artists.find(artist=>artist.projectKey==='second').id;
 await change(a,action(member.id,2,'approve-history',{artistId:firstId,reference:native}));const referenceId=(await(await own(a,member)).json()).legacyReferences[0].id;
 assert.equal((await change(a,action(member.id,3,'approve-history',{artistId:secondId,reference:native}))).status,409);assert.equal((await(await review(a,member)).json()).revision,3);
 assert.equal((await change(a,action(member.id,3,'revoke-history',{referenceId}))).status,200);
 const correction=action(member.id,4,'approve-history',{artistId:secondId,reference:native}),result=await change(a,correction);assert.equal(result.status,200);const corrected=await result.json();
 assert.deepEqual(corrected.state.legacyReferences,[{id:referenceId,artistId:secondId,reference:native,approved:true}]);assert.equal(corrected.state.revision,5);
 assert.deepEqual(await(await change(a,correction)).json(),corrected);assert.equal(a.database.prepare('SELECT count(*) n FROM member_artist_history WHERE user_id=?').get(member.id).n,1);
 const audit=a.database.prepare('SELECT previous_state,resulting_state FROM member_artist_audit WHERE actor_id=? AND request_id=?').get(a.owner.id,correction.requestId);
 assert.deepEqual(JSON.parse(audit.previous_state).legacyReferences,[{id:referenceId,artistId:firstId,reference:native,approved:false}]);assert.deepEqual(JSON.parse(audit.resulting_state).legacyReferences,corrected.state.legacyReferences);
});
