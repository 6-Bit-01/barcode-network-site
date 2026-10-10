import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url);
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {createSystemClashTournaments,TOURNAMENT_FIGHTERS}=require('../src/lib/system-clash-tournament.ts');
const {createOnlineRooms,getOnlineRoomEvidence,getOnlineMatchEvidence,reserveOnlineTournamentRoom,bindOnlineTournamentMatch}=require('../src/lib/system-clash-online.ts');
function fixture(){let n=0;const events=new Map(),rooms=new Map(),claims=new Map(),now=Date.now(),host={id:'trusted-host',name:'Host',sessionExpiresAt:now+86400000},actors=[0,1].map(index=>({id:'trusted-player-'+index,name:'Player '+index,sessionExpiresAt:now+86400000}));
 const gameStore={read:async code=>rooms.get(code)??null,list:async()=>[...rooms.values()],cas:async(code,old,next)=>{if((rooms.get(code)??null)!==old)return false;if(next===null)rooms.delete(code);else rooms.set(code,next);return true;}};
 const eventStore={read:async code=>events.get(code)??null,list:async()=>[...events.values()],cas:async(code,old,next,time,binding)=>{if((events.get(code)??null)!==old)return false;if(binding){const key=binding.roomCode+':'+binding.createdAt+':'+binding.matchId,owner=code+':'+binding.boutId;if(claims.has(key)&&claims.get(key)!==owner)return false;claims.set(key,owner);}events.set(code,next);return true;}};
 const domain=createSystemClashTournaments({store:eventStore,readRoom:value=>getOnlineRoomEvidence({store:gameStore,...value}),readMatch:value=>getOnlineMatchEvidence({store:gameStore,...value}),reserveMatch:value=>reserveOnlineTournamentRoom({store:gameStore,...value}),bindMatch:value=>bindOnlineTournamentMatch({store:gameStore,...value})});
 const command=(actor,value)=>domain.command(actor,{requestId:'00000000-0000-4000-8000-'+String(++n).padStart(12,'0'),...value});
 const game=actor=>createOnlineRooms({store:gameStore,member:actor});
 return{host,actors,command,domain,game,rooms};
}
async function called(){const f=fixture();let event=await f.command(f.host,{action:'create',title:'Live integration fixture',settings:{maxPlayers:2,strikes:2,rounds:3,time:60,preset:'custom'}});
 for(const[i,actor]of f.actors.entries()){const joined=await f.command(actor,{action:'join',code:event.code,fighter:TOURNAMENT_FIGHTERS[i]});await f.command(f.host,{action:'approve',code:event.code,entrantId:joined.selfEntrantId});await f.command(actor,{action:'ready',code:event.code,ready:true});}
 await f.command(f.host,{action:'start',code:event.code});event=await f.command(f.host,{action:'next',code:event.code});const bout=event.currentBout,p1=f.actors.find(actor=>actor.name===event.entrants.find(e=>e.id===bout.p1).name),p2=f.actors.find(actor=>actor.name===event.entrants.find(e=>e.id===bout.p2).name);return{...f,event,bout,p1,p2};
}
test('real event offer reserves the existing room, full binding freezes rules, and only its saved result advances',async()=>{const f=await called(),seat=await f.game(f.p1).create('Browser supplied impostor');let event=await f.command(f.p1,{action:'offer',code:f.event.code,boutId:f.bout.id,roomCode:seat.code});assert.equal(event.currentBout.roomCode,seat.code);assert.deepEqual(await f.game(f.host).list(),[]);await assert.rejects(()=>f.game(f.host).join(seat.code,'Steal seat'),e=>e.status===403);
 const guest=await f.game(f.p2).join(seat.code,'Wrong name');for(const[actor,key]of[[f.p1,seat.token],[f.p2,guest.token]]){await f.command(actor,{action:'ready',code:event.code,ready:true});const state=await f.game(actor).poll(seat.code,key);await f.game(actor).select(seat.code,key,{fighter:state[actor.id===f.p1.id?'host':'guest'].fighter,ready:true});}
 const begun=await f.game(f.p1).begin(seat.code,seat.token,{after:0});event=await f.command(f.p1,{action:'bind',code:event.code,boutId:f.bout.id,roomCode:seat.code,roomMatchId:begun.matchId});assert.equal(event.currentBout.status,'live');const state=await f.game(f.p2).poll(seat.code,guest.token);assert.deepEqual(state.tournament.rules,{rounds:3,time:60});assert.ok(!JSON.stringify(state).includes(f.p1.id));assert.equal(state.host.name,f.p1.name);
 await assert.rejects(()=>f.game(f.p2).result(seat.code,guest.token,{matchId:1,winner:1}),e=>e.status===403);await f.game(f.p1).result(seat.code,seat.token,{matchId:1,winner:1});event=await f.command(f.p2,{action:'advance',code:event.code,boutId:f.bout.id});assert.equal(event.bouts.find(b=>b.id===f.bout.id).winner,f.bout.p2);assert.equal(event.entrants.find(e=>e.id===f.bout.p1).losses,1);const retry=await f.command(f.host,{action:'advance',code:event.code,boutId:f.bout.id});assert.equal(retry.revision,event.revision);
});
test('a pending room offer retry cannot change the reserved fighters or target account',async()=>{const f=await called(),seat=await f.game(f.p1).create('Name');const first=await f.command(f.p1,{action:'offer',code:f.event.code,boutId:f.bout.id,roomCode:seat.code}),second=await f.command(f.p1,{action:'offer',code:f.event.code,boutId:f.bout.id,roomCode:seat.code});assert.equal(second.revision,first.revision);const raw=JSON.parse(f.rooms.get(seat.code));assert.equal(raw.tournament.guestMemberId,f.p2.id);assert.equal(raw.tournament.hostFighter,first.entrants.find(e=>e.id===f.bout.p1).fighter);});

