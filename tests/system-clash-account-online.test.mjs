import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createMatch,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import * as broadcastState from '../public/games/system-clash/play/fight-tournament-broadcast.mjs';
import * as fightState from '../public/games/system-clash/play/fight-network-state.mjs';
import {normalizeBody,memberCookies} from '../services/member-auth/contract.mjs';
const require=createRequire(import.meta.url);
function load(file,dependencies={}){
 const loaded={exports:{}},source=ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(source,{module:loaded,exports:loaded.exports,require:id=>id in dependencies?dependencies[id]:id==='../../services/member-auth/contract.mjs'?{memberCookies}:id==='../../public/games/system-clash/play/fight-network-state.mjs'?fightState:id==='../../public/games/system-clash/play/fight-tournament-broadcast.mjs'?broadcastState:require(id),Request,Response,Headers,Buffer,URL,AbortSignal,TextDecoder,Date,console});return loaded.exports;
}
const {createOnlineRooms,OnlineRoomError}=load('../src/lib/system-clash-online.ts');
const expiry=new Date(Date.now()+3600000).toISOString();
function fixture(){const rows=new Map();let serial=0,work=0;const store={async allow(){work++;return true;},async read(code){return rows.get(code)??null;},async cas(code,old,next){if((rows.get(code)??null)!==old)return false;if(next===null)rows.delete(code);else rows.set(code,next);return true;},async list(){return [...rows.values()];}};return {rows,store,get work(){return work;},rooms:(id,name)=>createOnlineRooms({store,member:{id,name},token:()=>`private-seat-token-${++serial}-abcdefghijklmnop`,code:()=>`ROOM${String(++serial).padStart(2,'0')}`})};}
test('online seats use trusted account identity and the full authoritative display name',async()=>{
 const f=fixture(),rooms=f.rooms('permanent-member-id','A verified name with more than twenty four characters'),h=await rooms.create('Spoofed guest label');
 const stored=JSON.parse(f.rows.get(h.code));assert.equal(stored.host.memberId,'permanent-member-id');
 const room=await rooms.poll(h.code,h.token);assert.equal(room.host.name,'A verified name with more than twenty four characters');
 assert.equal(JSON.stringify(room).includes('permanent-member-id'),false);assert.equal(JSON.stringify(room).includes('tokenHash'),false);
});
test('a stolen seat token fails for a different current account and cannot mutate or read the room',async()=>{
 const f=fixture(),owner=f.rooms('owner-member','Owner member'),h=await owner.create('Spoof');const before=f.rows.get(h.code),other=f.rooms('other-member','Other member');
 for(const action of [()=>other.poll(h.code,h.token),()=>other.resume(h.code,h.token),()=>other.select(h.code,h.token,{fighter:'6-bit',ready:true}),()=>other.leave(h.code,h.token)])await assert.rejects(action,e=>e instanceof OnlineRoomError&&e.status===401);
 assert.equal(f.rows.get(h.code),before);
});
test('the account cannot occupy both seats and a rename preserves same-account reconnect',async()=>{
 const f=fixture(),rooms=f.rooms('same-member','Original account'),h=await rooms.create('Spoof');await assert.rejects(()=>rooms.join(h.code,'Second identity'),e=>e.status===409);
 const renamed=f.rooms('same-member','Renamed account');const restored=await renamed.resume(h.code,h.token);assert.equal(restored.host.name,'Renamed account');assert.equal(JSON.parse(f.rows.get(h.code)).host.memberId,'same-member');
});
test('legacy anonymous rooms remain unavailable to account room browsing',async()=>{
 const f=fixture();const legacy=createOnlineRooms({store:f.store,token:()=> 'legacy-seat-token-abcdefghijklmnopqrstuvwxyz',code:()=> 'LEGACY'});await legacy.create('Unbound anonymous host');
 assert.deepEqual(await f.rooms('member','Verified account').list(),[]);
});
class GateError extends Error{constructor(message,status=401,code="ACCOUNT_REQUIRED"){super(message);this.status=status;this.code=code;}}
function routeFixture(){const f=fixture();let account=null,lookups=0;const scopes=[];const route=load('../src/app/api/games/system-clash/rooms/route.ts',{'next/server':{NextResponse:{json:(data,{status=200,headers={}}={})=>Response.json(data,{status,headers})}},'@/lib/system-clash-online':{createOnlineRooms,OnlineRoomError},'@/lib/system-clash-online-store':{onlineRoomStore:()=>f.store},'@/lib/system-clash-turn':{createOnlineTurnCredentials:async()=>{throw new Error('Provider must remain untouched');}},'@/lib/system-clash-member':{requireSystemClashMember:async(request,options)=>{scopes.push(options?.publicPoseStream===true);lookups++;if(!account)throw new GateError('Sign in to your BARCODE account to play online.');return {...account,sessionExpiresAt:expiry};},SystemClashMemberError:GateError}});return {f,route,scopes,setAccount:value=>{account=value;},get lookups(){return lookups;}};}
const url='https://www.barcode-network.com/api/games/system-clash/rooms';
const request=(body,headers={})=>new Request(url,{method:'POST',headers:{origin:'https://www.barcode-network.com','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('every room read and action requires the existing account before game storage or provider access',async()=>{
 const r=routeFixture();assert.equal((await r.route.GET(new Request(url))).status,401);
 for(const action of ['create','join','poll','ice','begin','result','lobby','resume','select','candidates','relay','signal','leave','broadcast'])assert.equal((await r.route.POST(request({action,name:'Guest',code:'ROOM01'}))).status,401,action);
 assert.equal(r.f.work,0);assert.equal(r.f.rows.size,0);assert.equal(r.lookups,15);assert.deepEqual(r.scopes,Array.from({length:15},(_,index)=>index===14));
});
test('normal verified Members enter rooms without staff grants and browser account fields never own a seat',async()=>{
 const r=routeFixture();r.setAccount({id:'real-account',name:'Real account display'});const response=await r.route.POST(request({action:'create',name:'Spoofed display',memberId:'someone-else',email:'private@example.test'}));assert.equal(response.status,200);const h=await response.json();
 const row=JSON.parse(r.f.rows.get(h.code));assert.equal(row.host.memberId,'real-account');assert.equal(row.host.name,'Real account display');
 r.setAccount({id:'different-account',name:'Different member'});const denied=await r.route.POST(request({action:'poll',code:h.code},{authorization:'Bearer '+h.token}));assert.equal(denied.status,401);
 assert.equal((await denied.text()).includes('private@example.test'),false);
});
test('shared account gate returns only live account ID, display name and expiry and preserves fail-closed denials',async()=>{
 const source=new URL('../src/lib/system-clash-member.ts',import.meta.url);assert.equal(fs.existsSync(source),true,'A shared gate is required for online rooms and tournaments');
 let result={ok:true,data:{user:{id:'member-id',name:'Verified member',email:'private@example.test'},session:{expiresAt:expiry,token:'private'},access:{owner:false,crew:false,permissions:[]}}},cookie;
 const gate=load('../src/lib/system-clash-member.ts',{'server-only':{},'./member-access':{lookupMemberAccess:async value=>{cookie=value;return result;}}});
 assert.deepEqual(JSON.parse(JSON.stringify(await gate.requireSystemClashMember(new Request(url,{headers:{cookie:'__Secure-barcode_id.session_token=private'}})))),{id:'member-id',name:'Verified member',sessionExpiresAt:expiry});assert.equal(cookie,'__Secure-barcode_id.session_token=private');
 for(const denial of [{ok:false,status:401,code:'UNAUTHENTICATED'},{ok:false,status:503,code:'ACCOUNT_UNAVAILABLE'}]){result=denial;await assert.rejects(()=>gate.requireSystemClashMember(new Request(url,{headers:{cookie:'__Secure-barcode_id.session_token=private'}})),e=>e.status===denial.status&&!e.message.includes('private'));}
});

test('account return paths allow only the known online game pages and refuse external or malformed redirects',()=>{
 const source=new URL('../src/lib/member-return.ts',import.meta.url);assert.equal(fs.existsSync(source),true,'A bounded game return parser is required');const {memberGameReturnPath}=load('../src/lib/member-return.ts');
 assert.equal(memberGameReturnPath('/games/system-clash/play/online.html?event=ABC123&bout=B1'),'/games/system-clash/play/online.html?event=ABC123&bout=B1');assert.equal(memberGameReturnPath('/games/system-clash/play/tournament-online.html'),'/games/system-clash/play/tournament-online.html');assert.equal(memberGameReturnPath('/games/system-clash/play/tournament-watch.html?event=EVENT1&expanded=1'),'/games/system-clash/play/tournament-watch.html?event=EVENT1&expanded=1');
 for(const value of ['https://other.test/games/system-clash/play/online.html','//other.test/games/system-clash/play/online.html','/account/owner','/games/system-clash/play/fight.html','/games/system-clash/play/online.html#secret','/games/system-clash/play/online.html?x='+String.fromCharCode(10),'x'.repeat(2100),null])assert.equal(memberGameReturnPath(value),undefined);
});

test('tournament reservation seals a casual room to its two assigned accounts and trusted fighters',async()=>{
 const loaded=load('../src/lib/system-clash-online.ts');assert.equal(typeof loaded.reserveOnlineTournamentRoom,'function','A server-owned reservation is required before disclosing a tournament room');const f=fixture(),host=f.rooms('p1-member','Player one'),guest=f.rooms('p2-member','Player two'),other=f.rooms('intruder-member','Other member'),seat=await host.create('Spoof');
 await loaded.reserveOnlineTournamentRoom({store:f.store,code:seat.code,eventCode:'EVENT1',boutId:'bout-one',hostMemberId:'p1-member',guestMemberId:'p2-member',hostFighter:'cliff',guestFighter:'lyra',rules:{rounds:3,time:60}});
 assert.deepEqual(await other.list(),[]);await assert.rejects(()=>other.join(seat.code,'Intruder'),e=>e.status===403);const joined=await guest.join(seat.code,'Spoof');const state=await guest.poll(seat.code,joined.token);assert.equal(state.host.fighter,'cliff');assert.equal(state.guest.fighter,'lyra');assert.deepEqual(JSON.parse(JSON.stringify(state.tournament)),{code:'EVENT1',boutId:'bout-one',rules:{rounds:3,time:60}});assert.equal(JSON.stringify(state).includes('p1-member'),false);
 await assert.rejects(()=>guest.select(seat.code,joined.token,{fighter:'6-bit',ready:true}),e=>e.status===403);
 await host.select(seat.code,seat.token,{fighter:'cliff',ready:true});await guest.select(seat.code,joined.token,{fighter:'lyra',ready:true});await host.begin(seat.code,seat.token,{after:0});
 const binding={store:f.store,code:seat.code,matchId:1,eventCode:'EVENT1',boutId:'bout-one',hostMemberId:'p1-member',guestMemberId:'p2-member',hostFighter:'cliff',guestFighter:'lyra',rules:{rounds:3,time:60}};await loaded.bindOnlineTournamentMatch(binding);await loaded.bindOnlineTournamentMatch(binding);
 await assert.rejects(()=>loaded.bindOnlineTournamentMatch({...binding,eventCode:'EVENT2'}),e=>e.status===409);
 const wire=(seq,payload)=>({lane:'control',data:JSON.stringify({scope:'system-clash-online-v1',version:'tournament-test',seq,matchId:1,payload})});
 for(const rules of [undefined,{rounds:1,time:99},{rounds:3,time:60,email:'private'}])await assert.rejects(()=>host.relay(seat.code,seat.token,{version:'tournament-test',ack:0,packets:[wire(1,{type:'setup',rules})]}));
 await host.relay(seat.code,seat.token,{version:'tournament-test',ack:0,packets:[wire(1,{type:'setup',rules:{rounds:3,time:60}})]});

 const evidence=await loaded.getOnlineMatchEvidence({store:f.store,code:seat.code,matchId:1});assert.equal(evidence.hostFighter,'cliff');assert.equal(evidence.guestFighter,'lyra');assert.equal(evidence.result,null);await assert.rejects(()=>loaded.getOnlineMatchEvidence({store:f.store,code:seat.code,matchId:1,requireResult:true}),e=>e.status===409);
 await host.result(seat.code,seat.token,{matchId:1,winner:0});assert.equal((await loaded.getOnlineMatchEvidence({store:f.store,code:seat.code,matchId:1,requireResult:true})).result.winner,0);await assert.rejects(()=>host.begin(seat.code,seat.token,{after:1}),e=>e.status===403);
 await guest.leave(seat.code,joined.token);await assert.rejects(()=>guest.poll(seat.code,joined.token),e=>e.status===401);assert.equal((await loaded.getOnlineMatchEvidence({store:f.store,code:seat.code,matchId:1,requireResult:true})).result.winner,0);
 await host.leave(seat.code,seat.token);await assert.rejects(()=>host.poll(seat.code,seat.token),e=>e.status===401);assert.equal((await loaded.getOnlineMatchEvidence({store:f.store,code:seat.code,matchId:1,requireResult:true})).result.winner,0);

});

test('email verification keeps a same-origin account return query for both signup and resends',()=>{
 const origin='https://www.barcode-network.com',callback='/account?returnTo='+encodeURIComponent('/games/system-clash/play/online.html?event=EVENT1&bout=bout-one&role=host');
 for(const path of ['sign-up/email','send-verification-email'])assert.equal(normalizeBody(path,{email:'member@example.test',callbackURL:callback},origin).callbackURL,new URL(callback,origin).href);
 assert.equal(normalizeBody('sign-up/email',{email:'member@example.test'},origin).callbackURL,origin+'/account');
 assert.throws(()=>normalizeBody('sign-up/email',{callbackURL:'https://other.test/account'},origin));
});

test('tournament live broadcast validates the assigned host snapshot and exposes no private transport or account fields',async()=>{
 const loaded=load('../src/lib/system-clash-online.ts');assert.equal(typeof loaded.getOnlineTournamentBroadcast,'function','A scoped read-only broadcast is required');
 const f=fixture();let time=Date.now();const host=createOnlineRooms({store:f.store,member:{id:'p1-member',name:'Player One'},now:()=>time,code:()=> 'LIVE01',token:()=> 'host-token-abcdefghijklmnopqrstuvwxyz'}),guest=f.rooms('p2-member','Player Two'),seat=await host.create();
 const binding={store:f.store,code:seat.code,eventCode:'EVENT1',boutId:'bout-one',hostMemberId:'p1-member',guestMemberId:'p2-member',hostFighter:'6-bit',guestFighter:'cliff',rules:{rounds:3,time:60}};
 await loaded.reserveOnlineTournamentRoom(binding);const g=await guest.join(seat.code);await host.select(seat.code,seat.token,{fighter:'6-bit',ready:true});await guest.select(seat.code,g.token,{fighter:'cliff',ready:true});await host.begin(seat.code,seat.token,{after:0});await loaded.bindOnlineTournamentMatch({...binding,matchId:1});
 const read={store:f.store,code:seat.code,eventCode:'EVENT1',boutId:'bout-one',matchId:1};assert.equal(await loaded.getOnlineTournamentBroadcast(read),null);
 const match=createMatch({mode:'local',stage:'radio-studio',start:false,fighters:[{id:'6-bit',name:'Engine Name'},{id:'cliff',name:'Engine Other'}]});const views=match.fighters.map((_,index)=>getFighterView(match,index)),snap=fightState.makeFightSnapshot(match,views,{roster:['6-bit','cliff'],fighterIds:['6-bit','cliff'],clipIds:[['idle'],['idle']],matchId:1,seq:1,at:10});assert(snap);
 const dense=structuredClone(snap),mark={site:'head',kind:'cut',intensity:1,amount:5,at:10,heightRatio:.3,facing:'left',direction:1,seed:10};for(const actor of [...dense.state.fighters,...dense.views])actor.damageMarks=Array.from({length:12},()=>({...mark}));assert(Buffer.byteLength(JSON.stringify(dense))>4096);const compact=broadcastState.compactTournamentBroadcast(dense);assert(compact);assert(Buffer.byteLength(JSON.stringify(compact))<=4096);assert(fightState.readFightSnapshot(compact,{roster:['6-bit','cliff'],fighterIds:['6-bit','cliff'],clipIds:[['idle'],['idle']],matchId:1}));
 snap.email='private@example.test';snap.state.fighters[0].email='private@example.test';
 await assert.rejects(()=>guest.broadcast(seat.code,g.token,{snapshot:snap}),e=>e.status===403);
 await assert.rejects(()=>host.broadcast(seat.code,seat.token,{snapshot:{...snap,matchId:2}}),e=>e.status===400);
 await assert.rejects(()=>host.broadcast(seat.code,seat.token,{snapshot:{...snap,token:'private-token'}}),e=>e.status===400);
 const foreignPose=structuredClone(snap);foreignPose.views[0].clip='delete-nail';await assert.rejects(()=>host.broadcast(seat.code,seat.token,{snapshot:foreignPose}),e=>e.status===400);
 assert.equal((await host.broadcast(seat.code,seat.token,{snapshot:snap})).accepted,true);
 let shown=await loaded.getOnlineTournamentBroadcast(read);assert.equal(shown.snapshot.state.fighters[0].name,'Player One');assert.equal(shown.fighters[1].id,'cliff');const text=JSON.stringify(shown);for(const forbidden of ['private@example.test','p1-member','p2-member','tokenHash','sdp','host-token'])assert.equal(text.includes(forbidden),false);
 assert.equal((await host.broadcast(seat.code,seat.token,{snapshot:{...snap,seq:2,at:20}})).accepted,false);time+=100;assert.equal((await host.broadcast(seat.code,seat.token,{snapshot:{...snap,seq:2,at:20}})).accepted,true);shown=await loaded.getOnlineTournamentBroadcast(read);assert.equal(shown.snapshot.seq,2);time+=6500;assert.equal((await host.broadcast(seat.code,seat.token,{snapshot:{...snap,seq:3,at:30}})).intervalMs,500);
 await assert.rejects(()=>loaded.getOnlineTournamentBroadcast({...read,eventCode:'EVENT2'}),e=>e.status===409);await assert.rejects(()=>loaded.getOnlineTournamentBroadcast({...read,boutId:'different-bout'}),e=>e.status===409);
});
