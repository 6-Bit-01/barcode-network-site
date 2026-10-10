import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url);
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {createSystemClashTournaments,TOURNAMENT_FIGHTERS}=require('../src/lib/system-clash-tournament.ts');
function fixture(){
 let request=0,id=0,time=1000,rejectWrites=0,beforeAtomic=null;
 const rows=new Map();
 const store={async read(code){return rows.get(code)??null;},async list(){return [...rows.values()];},
  async cas(code,old,next){if((rows.get(code)??null)!==old)return false;rows.set(code,next);return true;},
  async casEvents(writes){if(beforeAtomic){const hook=beforeAtomic;beforeAtomic=null;await hook(writes);}if(rejectWrites-->0)return false;if(writes.some(write=>(rows.get(write.code)??null)!==write.old))return false;for(const write of writes)rows.set(write.code,write.next);return true;}};
 const domain=createSystemClashTournaments({store,now:()=>time,id:()=>String(++id),readMatch:async()=>{throw Error('unused');}});
 const actor=id=>({id:'private-member-'+id,name:'Player '+id,sessionExpiresAt:100000000}),host=actor('host');
 const command=(who,body)=>domain.command(who,{requestId:'00000000-0000-4000-8000-'+String(++request).padStart(12,'0'),...body});
 const create=()=>command(host,{action:'create',title:'Live Show',settings:{preset:'custom',maxPlayers:16,strikes:3,time:60,rounds:3}});
 return {domain,store,rows,actor,host,command,create,setTime:value=>time=value,rejectAtomic:n=>rejectWrites=n,hook:fn=>beforeAtomic=fn};
}
const conflict=error=>error.status===409;
async function readyPair(f,code){
 for(let n=0;n<2;n++){const actor=f.actor(n),joined=await f.command(actor,{action:'join',code,fighter:TOURNAMENT_FIGHTERS[n]});await f.command(f.host,{action:'approve',code,entrantId:joined.selfEntrantId});await f.command(actor,{action:'ready',code,ready:true});}
}
test('open-next inherits rules, links both directions and projects only caller reservation',async()=>{
 const f=fixture(),parent=await f.create(),opened=await f.command(f.host,{action:'open-next',code:parent.code});
 assert.equal(opened.parentTournamentCode,null);assert.equal(opened.nextTournament.title,parent.title);assert.deepEqual(opened.nextTournament.settings,parent.settings);assert.equal(opened.nextTournament.approvedCount,0);
 const code=opened.nextTournament.code,child=await f.domain.view(code,f.actor(1));assert.equal(child.parentTournamentCode,parent.code);assert.equal(child.nextTournament,null);assert.equal(child.status,'lobby');
 const current=await f.command(f.actor(1),{action:'join',code:parent.code,fighter:'6-bit'}),next=await f.command(f.actor(1),{action:'join',code,fighter:'6-bit'});
 assert.notEqual(current.selfEntrantId,next.selfEntrantId);assert.equal((await f.domain.view(parent.code,f.actor(1))).nextTournament.selfEntrantId,next.selfEntrantId);
 await f.command(f.host,{action:'approve',code,entrantId:next.selfEntrantId});const publicView=await f.domain.view(parent.code,f.actor('watcher'));
 assert.equal(publicView.nextTournament.selfEntrantId,null);assert.equal(publicView.nextTournament.approvedCount,1);assert.ok(!JSON.stringify(publicView).includes('private-member-'));
});
test('open-next exact retries and concurrent host requests publish one child',async()=>{
 const f=fixture(),event=await f.create(),body={action:'open-next',code:event.code,expectedRevision:event.revision,requestId:'12345678-1234-4123-8123-123456789012'};
 const results=await Promise.all([f.domain.command(f.host,body),f.domain.command(f.host,body)]);assert.equal(results[0].nextTournament.code,results[1].nextTournament.code);assert.equal(results[0].revision,results[1].revision);assert.equal(f.rows.size,2);
 await assert.rejects(()=>f.domain.command(f.host,{...body,title:'Changed'}),conflict);
 const again=await Promise.all([f.command(f.host,{action:'open-next',code:event.code}),f.command(f.host,{action:'open-next',code:event.code})]);assert.equal(again[0].nextTournament.code,again[1].nextTournament.code);assert.equal(f.rows.size,2);
});
test('failed atomic link cannot leave an orphan child; a later retry can open it',async()=>{
 const f=fixture(),event=await f.create();f.rejectAtomic(8);const body={action:'open-next',code:event.code,requestId:'12345678-1234-4123-8123-123456789012'};
 await assert.rejects(()=>f.domain.command(f.host,body),conflict);assert.equal(f.rows.size,1);assert.equal((await f.domain.view(event.code,f.host)).nextTournament,null);
 const opened=await f.domain.command(f.host,body);assert.equal(f.rows.size,2);assert.ok(opened.nextTournament.code);
});
test('only host can open next and malformed settings, title, revision or link are rejected',async()=>{
 const f=fixture(),event=await f.create();await assert.rejects(()=>f.command(f.actor('spectator'),{action:'open-next',code:event.code}),error=>error.status===403);
 for(const extra of [{title:42},{title:' '},{title:'x'.repeat(61)},{settings:{maxPlayers:17}},{settings:[]},{settings:{memberId:'forged'}},{nextTournamentCode:'FORGED'}])await assert.rejects(()=>f.command(f.host,{action:'open-next',code:event.code,...extra}),error=>error.status===400);
 await assert.rejects(()=>f.command(f.host,{action:'open-next',code:event.code,expectedRevision:0}),conflict);
 const raw=JSON.parse(f.rows.get(event.code));raw.nextTournamentCode=[];f.rows.set(event.code,JSON.stringify(raw));await assert.rejects(()=>f.domain.view(event.code,f.host),error=>error.status===503);
});
test('explicit end atomically closes registration and stale exact open retry stays visibly closed',async()=>{
 const f=fixture(),event=await f.create(),body={action:'open-next',code:event.code,requestId:'12345678-1234-4123-8123-123456789012'},opened=await f.domain.command(f.host,body),code=opened.nextTournament.code;
 const joined=await f.command(f.actor(1),{action:'join',code,fighter:'6-bit'});await f.command(f.host,{action:'approve',code,entrantId:joined.selfEntrantId});await f.command(f.actor(1),{action:'ready',code,ready:true});
 const ended=await f.command(f.host,{action:'cancel',code:event.code});assert.equal(ended.status,'cancelled');assert.equal(ended.nextTournament.status,'cancelled');const child=await f.domain.view(code,f.actor(1));assert.equal(child.status,'cancelled');assert.equal(child.entrants[0].ready,false);
 await assert.rejects(()=>f.command(f.actor(2),{action:'join',code,fighter:'cliff'}),conflict);await assert.rejects(()=>f.command(f.host,{action:'open-next',code:event.code}),conflict);
 assert.equal((await f.domain.command(f.host,body)).nextTournament.status,'cancelled');
});
test('host disconnect leaves next registration open; child cannot run before current finishes',async()=>{
 const f=fixture(),event=await f.create(),opened=await f.command(f.host,{action:'open-next',code:event.code}),code=opened.nextTournament.code;await readyPair(f,code);
 f.setTime(121000);const snapshot=await f.domain.view(event.code,f.actor('viewer'));assert.equal(snapshot.hostConnected,false);assert.equal(snapshot.nextTournament.status,'lobby');
 await assert.rejects(()=>f.command(f.host,{action:'start',code}),conflict);
 await readyPair(f,event.code);await f.command(f.host,{action:'start',code:event.code});let parent=await f.command(f.host,{action:'next',code:event.code});
 while(parent.status!=='complete'){parent=await f.command(f.host,{action:'adjudicate',code:parent.code,boutId:parent.currentBout.id,winnerEntrantId:parent.currentBout.p1,reason:'Reviewed live-show result'});if(parent.status!=='complete')parent=await f.command(f.host,{action:'next',code:parent.code});}
 assert.equal(parent.nextTournament.status,'lobby');const running=await f.command(f.host,{action:'start',code});assert.equal(running.status,'running');assert.equal(running.parentTournamentCode,parent.code);
});
test('completed current retains next link and host end closes it',async()=>{
 const f=fixture(),event=await f.create(),raw=JSON.parse(f.rows.get(event.code));raw.status='complete';f.rows.set(event.code,JSON.stringify(raw));
 const opened=await f.command(f.host,{action:'open-next',code:event.code,title:'Afterparty',settings:{preset:'quick',maxPlayers:4}});assert.equal(opened.status,'complete');assert.equal(opened.nextTournament.title,'Afterparty');assert.equal(opened.nextTournament.settings.strikes,1);
 await assert.rejects(()=>f.command(f.host,{action:'open-next',code:event.code,title:'Different'}),conflict);assert.equal((await f.command(f.host,{action:'cancel',code:event.code})).nextTournament.status,'cancelled');
});
test('end winning a race with open leaves no orphan event',async()=>{
 const f=fixture(),event=await f.create();f.hook(()=>f.command(f.host,{action:'cancel',code:event.code}));
 await assert.rejects(()=>f.command(f.host,{action:'open-next',code:event.code}),conflict);assert.equal(f.rows.size,1);
});
test('end winning a race with a child join or start never admits stale work',async()=>{
 for(const action of ['join','start']){const f=fixture(),event=await f.create(),opened=await f.command(f.host,{action:'open-next',code:event.code}),code=opened.nextTournament.code;if(action==='start'){await readyPair(f,code);const raw=JSON.parse(f.rows.get(event.code));raw.status='complete';f.rows.set(event.code,JSON.stringify(raw));}
 f.hook(()=>f.command(f.host,{action:'cancel',code:event.code}));await assert.rejects(()=>f.command(action==='start'?f.host:f.actor(1),{action,code,...(action==='join'?{fighter:'6-bit'}:{})}),conflict);assert.equal((await f.domain.view(code,f.host)).status,'cancelled');}
});
test('next lobby retains character and sixteen-seat races, approval and ready gates',async()=>{
 const f=fixture(),event=await f.create(),opened=await f.command(f.host,{action:'open-next',code:event.code}),code=opened.nextTournament.code;
 const racers=await Promise.allSettled([f.command(f.actor(0),{action:'join',code,fighter:'6-bit'}),f.command(f.actor('duplicate'),{action:'join',code,fighter:'6-bit'})]);assert.equal(racers.filter(r=>r.status==='fulfilled').length,1);
 for(let n=1;n<16;n++)await f.command(f.actor(n),{action:'join',code,fighter:TOURNAMENT_FIGHTERS[n]});await assert.rejects(()=>f.command(f.actor(17),{action:'join',code,fighter:TOURNAMENT_FIGHTERS[16]}),conflict);
 await assert.rejects(()=>f.command(f.actor(1),{action:'ready',code,ready:true}),conflict);
});
test('server-only voice context authenticates and preserves private IDs outside public snapshot',async()=>{
 const f=fixture(),event=await f.create();await f.command(f.actor(1),{action:'join',code:event.code,fighter:'6-bit'});
 const context=await f.domain.readVoiceContext(event.code,f.actor('viewer'));assert.equal(context.hostMemberId,f.host.id);assert.equal(context.entrants[0].memberId,f.actor(1).id);assert.equal(context.bout,null);assert.equal(context.currentBoutId,null);
 await assert.rejects(()=>f.domain.readVoiceContext(event.code,{...f.host,sessionExpiresAt:0}),error=>error.status===401);assert.ok(!JSON.stringify(await f.domain.view(event.code,f.host)).includes('private-member-'));
});

test('a child join winning an end race retains its entrant but registration still closes',async()=>{
 const f=fixture(),event=await f.create(),opened=await f.command(f.host,{action:'open-next',code:event.code}),code=opened.nextTournament.code;
 f.hook(()=>f.command(f.actor(1),{action:'join',code,fighter:'6-bit'}));const ended=await f.command(f.host,{action:'cancel',code:event.code});assert.equal(ended.nextTournament.status,'cancelled');
 const child=await f.domain.view(code,f.actor(1));assert.equal(child.entrants.length,1);assert.equal(child.status,'cancelled');await assert.rejects(()=>f.command(f.actor(2),{action:'join',code,fighter:'cliff'}),conflict);
});
test('a successor start winning an end race cannot continue the stopped session',async()=>{
 const f=fixture(),event=await f.create(),opened=await f.command(f.host,{action:'open-next',code:event.code}),code=opened.nextTournament.code;await readyPair(f,code);const raw=JSON.parse(f.rows.get(event.code));raw.status='complete';f.rows.set(event.code,JSON.stringify(raw));
 f.hook(()=>f.command(f.host,{action:'start',code}));await f.command(f.host,{action:'cancel',code:event.code});const child=await f.domain.view(code,f.host);assert.equal(child.status,'cancelled');assert.ok(child.bouts.every(bout=>bout.status==='void'));await assert.rejects(()=>f.command(f.host,{action:'next',code}),conflict);
});
test('foreign stored child linkage fails closed before exposing its lobby or taking reservations',async()=>{
 const f=fixture(),event=await f.create(),opened=await f.command(f.host,{action:'open-next',code:event.code}),code=opened.nextTournament.code,raw=JSON.parse(f.rows.get(code));raw.parentTournamentCode='FOREIG';f.rows.set(code,JSON.stringify(raw));
 await assert.rejects(()=>f.domain.view(event.code,f.actor(1)),error=>error.status===503);await assert.rejects(()=>f.command(f.actor(1),{action:'join',code,fighter:'6-bit'}),error=>[404,503].includes(error.status));assert.equal(JSON.parse(f.rows.get(code)).entrants.length,0);
});
