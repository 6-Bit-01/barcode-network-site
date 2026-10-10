import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url),original=Module._load;
Module._extensions['.ts']=(unit,file)=>unit._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
let auth=false,limited=false,storageCalls=0,broadcastCalls=0,live=true,failed=false,roomCode="ROOM16",replays=0;
class MemberError extends Error{constructor(message,status=401){super(message);this.status=status;}}
class TournamentError extends Error{constructor(message,status=400){super(message);this.status=status;}}
class RoomError extends Error{constructor(message,status=409){super(message);this.status=status;}}
const store={allow:async(identity,bucket,limit)=>{storageCalls++;assert.equal(bucket,'read');assert.ok(limit>=650);return!limited;}};
Module._load=function(id,parent,main){
 if(id==='@/lib/system-clash-member')return{SystemClashMemberError:MemberError,requireSystemClashMember:async(request,options)=>{assert.equal(options?.publicPoseStream,true);if(!auth)throw new MemberError('Sign in to watch.');return{id:'private-host',name:'Fixture Host',sessionExpiresAt:'2099-01-01T00:00:00Z'};}};
 if(id==='@/lib/system-clash-tournament')return{TournamentError,createSystemClashTournaments:options=>{assert.equal(typeof options.readMatch,'function');return{view:async code=>{assert.equal(code,'MOCK16');return{code,title:'Private fixture',status:'running',round:1,currentBoutId:'bout',settings:{rounds:3,time:60},bouts:[{id:'bout',roomCode:live?roomCode:null,roomMatchId:1,status:'live',replays}]};}};}};
 if(id==='@/lib/system-clash-tournament-store')return{systemClashTournamentStore:()=>store};
 if(id==='@/lib/system-clash-online-store')return{onlineRoomStore:()=>store};
 if(id==='@/lib/system-clash-online')return{OnlineRoomError:RoomError,getOnlineMatchEvidence:async()=>null,getOnlineTournamentBroadcast:async value=>{broadcastCalls++;assert.equal(value.eventCode,'MOCK16');assert.equal(value.boutId,'bout');assert.equal(value.matchId,1);if(failed)throw new Error('private configuration detail');return{snapshot:{seq:1},updatedAt:1234,matchId:1,stage:'radio-studio',fighters:[{id:'6-bit',name:'One'},{id:'cache-back',name:'Two'}]};}};
 return original.call(this,id,parent,main);
};
const {GET}=require('../src/app/api/games/system-clash/tournaments/watch/route.ts');Module._load=original;
const url='https://www.barcode-network.com/api/games/system-clash/tournaments/watch';
test('spectator route requires current website identity before storage',async()=>{const before=storageCalls,response=await GET(new Request(url+'?code=MOCK16'));assert.equal(response.status,401);assert.equal(storageCalls,before);});
test('watch route rejects ambiguous audience parameters and enforces the bounded viewer read rate',async()=>{auth=true;assert.equal((await GET(new Request(url+'?code=MOCK16&code=OTHER1'))).status,400);assert.equal((await GET(new Request(url+'?code=MOCK16&memberId=forged'))).status,400);limited=true;assert.equal((await GET(new Request(url+'?code=MOCK16'))).status,429);limited=false;});
test('only the current bout broadcast is returned privately with its frozen rules and no account identifiers',async()=>{const response=await GET(new Request(url+'?code=MOCK16')),data=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');assert.deepEqual(data.tournament.rules,{rounds:3,time:60});assert.equal(data.match.matchId,1);assert.ok(!JSON.stringify(data).includes('private-host'));live=false;const before=broadcastCalls;assert.equal((await(await GET(new Request(url+'?code=MOCK16'))).json()).match,null);assert.equal(broadcastCalls,before);live=true;});
test('unexpected spectator storage failure hides details and does not fabricate a fight',async()=>{failed=true;const response=await GET(new Request(url+'?code=MOCK16'));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('configuration'));failed=false;});
test('a replay with the same bout and match number has a distinct public broadcast generation',async()=>{
 const before=(await(await GET(new Request(url+'?code=MOCK16'))).json()).tournament;
 assert.match(before.broadcastId,/^[a-f0-9]{64}$/);assert.ok(!before.broadcastId.includes('ROOM16'));
 roomCode='ROOM17';replays=1;const replay=(await(await GET(new Request(url+'?code=MOCK16'))).json()).tournament;
 assert.equal(replay.currentBoutId,before.currentBoutId);assert.notEqual(replay.broadcastId,before.broadcastId);
 roomCode='ROOM16';const reusedRoomCode=(await(await GET(new Request(url+'?code=MOCK16'))).json()).tournament;assert.notEqual(reusedRoomCode.broadcastId,before.broadcastId,'The replay generation changes even if an expired room code is reused');replays=0;
});