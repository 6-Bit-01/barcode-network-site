import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url);
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {createOnlineRooms,OnlineRoomError,ONLINE_FIGHTERS}=require('../src/lib/system-clash-online.ts');
function fixture(){let time=1000,tokens=0,codes=0;const rows=new Map();const store={async read(code){return rows.get(code)??null;},async cas(code,old,next){if((rows.get(code)??null)!==old)return false;if(next===null)rows.delete(code);else rows.set(code,next);return true;},async list(){return [...rows.values()];}};
const rooms=createOnlineRooms({store,now:()=>time,token:()=>('token'+(++tokens)).padEnd(32,'x'),code:()=>('ROOM'+(++codes)).padEnd(6,'A')});return {rooms,rows,setTime:x=>{time=x;}};}
const fails=(fn,status)=>assert.rejects(fn,e=>e instanceof OnlineRoomError&&e.status===status);
test('guest screen names are bounded and rooms never publish tokens, signals or host IPs',async()=>{
 const {rooms,rows}=fixture();const a=await rooms.create('  Name <evil>  ');assert.equal(a.role,'host');assert.equal(a.token.length,32);const raw=rows.get(a.code);assert.ok(!raw.includes(a.token));
 const list=await rooms.list();assert.equal(list.length,1);assert.deepEqual(Object.keys(list[0]).sort(),['code','createdAt','fighter','hostName']);assert.ok(!JSON.stringify(list).includes('Token'));assert.equal(list[0].hostName,'Name evil');
 await fails(()=>rooms.create('   '),400);await fails(()=>rooms.create('x'.repeat(25)),400);
});
test('two simultaneous guests cannot occupy the same seat',async()=>{const {rooms}=fixture(),host=await rooms.create('Host');const result=await Promise.allSettled([rooms.join(host.code,'Guest one'),rooms.join(host.code,'Guest two')]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.status,409);assert.deepEqual(await rooms.list(),[]);});
test('seat credentials isolate private signaling and forbid forged credentials',async()=>{const {rooms}=fixture(),h=await rooms.create('Host'),g=await rooms.join(h.code,'Guest');await fails(()=>rooms.poll(h.code,'forged'),401);await rooms.signal(h.code,h.token,{type:'offer',sdp:'v=0\r\na=example'});await rooms.signal(h.code,g.token,{type:'answer',sdp:'v=0\r\na=answer'});assert.equal((await rooms.poll(h.code,g.token)).description.type,'offer');assert.equal((await rooms.poll(h.code,h.token)).description.type,'answer');await fails(()=>rooms.signal(h.code,g.token,{type:'offer',sdp:'v=0'}),400);await fails(()=>rooms.signal(h.code,h.token,{type:'offer',sdp:'x'.repeat(65537)}),400);});
test('fighter validation and ready resets prevent stale or invalid ready states',async()=>{const {rooms}=fixture(),h=await rooms.create('Host'),g=await rooms.join(h.code,'Guest');await fails(()=>rooms.select(h.code,h.token,{fighter:'nova-cordova',ready:true}),400);await rooms.select(h.code,h.token,{fighter:'9-bit',ready:true});assert.equal((await rooms.poll(h.code,g.token)).host.ready,true);await rooms.select(h.code,h.token,{fighter:'6-bit',ready:true});assert.equal((await rooms.poll(h.code,g.token)).host.ready,false);});
test('idle, expired and departed rooms vanish without touching other keys',async()=>{const f=fixture(),h=await f.rooms.create('Host');f.setTime(61001);assert.deepEqual(await f.rooms.list(),[]);f.setTime(2000);const g=await f.rooms.join(h.code,'Guest');await f.rooms.leave(h.code,g.token);await fails(()=>f.rooms.poll(h.code,g.token),401);assert.equal((await f.rooms.list()).length,1);await f.rooms.leave(h.code,h.token);assert.equal(f.rows.size,0);await fails(()=>f.rooms.poll(h.code,h.token),404);const second=await f.rooms.create('Next');f.setTime(2000000);await fails(()=>f.rooms.poll(second.code,second.token),410);});
test('guest departure resets host readiness and signaling before a new guest joins',async()=>{const {rooms}=fixture(),h=await rooms.create('Host'),g=await rooms.join(h.code,'Guest');await rooms.select(h.code,h.token,{fighter:'6-bit',ready:true});await rooms.signal(h.code,h.token,{type:'offer',sdp:'v=0'});await rooms.leave(h.code,g.token);const replacement=await rooms.join(h.code,'New guest');const state=await rooms.poll(h.code,replacement.token);assert.equal(state.host.ready,false);assert.equal(state.description,null);});
test('bounded compare-and-set retry never overwrites concurrent signals',async()=>{const {rooms}=fixture(),h=await rooms.create('Host'),g=await rooms.join(h.code,'Guest');await Promise.all([rooms.signal(h.code,h.token,{type:'offer',sdp:'v=0 host'}),rooms.signal(h.code,g.token,{type:'answer',sdp:'v=0 guest'})]);assert.equal((await rooms.poll(h.code,h.token)).description.sdp,'v=0 guest');assert.equal((await rooms.poll(h.code,g.token)).description.sdp,'v=0 host');});

test('online accepts exactly the hosted main roster',()=>{const roster=JSON.parse(fs.readFileSync(new URL('../public/games/system-clash/play/assets/menu/roster.json',import.meta.url))).fighters;assert.deepEqual([...ONLINE_FIGHTERS],[...new Set([...roster.map(f=>f.id),'doofnoobler','lyra','papa-oak'])]);});


test('a departing guest cannot refresh the heartbeat of an absent host',async()=>{
 const f=fixture(),host=await f.rooms.create('Host'),guest=await f.rooms.join(host.code,'Guest');f.setTime(63001);await f.rooms.leave(host.code,guest.token);
 assert.equal(JSON.parse(f.rows.get(host.code)).host.lastSeen,1000);assert.deepEqual(await f.rooms.list(),[]);await fails(()=>f.rooms.join(host.code,'Replacement'),410);
});

test('Lost Marbles selection survives both seats and changing fighter resets readiness',async()=>{
 const {rooms}=fixture(),host=await rooms.create('Host'),guest=await rooms.join(host.code,'Guest');
 await rooms.select(host.code,host.token,{fighter:'lost-marbles',ready:true});
 await rooms.select(guest.code,guest.token,{fighter:'lost-marbles',ready:true});
 const state=await rooms.poll(host.code,guest.token);
 assert.equal(state.host.fighter,'lost-marbles');assert.equal(state.host.ready,true);
 assert.equal(state.guest.fighter,'lost-marbles');assert.equal(state.guest.ready,true);
 await rooms.select(host.code,host.token,{fighter:'6-bit',ready:true});
 assert.equal((await rooms.poll(host.code,guest.token)).host.ready,false);
 await fails(()=>rooms.select(host.code,host.token,{fighter:'lost-marbles-unreleased',ready:true}),400);
});

test('Mutilator selection survives both seats and changing fighter resets readiness',async()=>{
 const {rooms}=fixture(),host=await rooms.create('Host'),guest=await rooms.join(host.code,'Guest');
 await rooms.select(host.code,host.token,{fighter:'mutilator',ready:true});
 await rooms.select(guest.code,guest.token,{fighter:'mutilator',ready:true});
 const state=await rooms.poll(host.code,guest.token);
 assert.equal(state.host.fighter,'mutilator');assert.equal(state.host.ready,true);
 assert.equal(state.guest.fighter,'mutilator');assert.equal(state.guest.ready,true);
 await rooms.select(host.code,host.token,{fighter:'6-bit',ready:true});
 assert.equal((await rooms.poll(host.code,guest.token)).host.ready,false);
 await fails(()=>rooms.select(host.code,host.token,{fighter:'mutilator-unreleased',ready:true}),400);
});

test('all19 online fighter IDs include BNL in either legitimate seat without local unlock authority',async()=>{assert.equal(ONLINE_FIGHTERS.length,19);assert.equal(new Set(ONLINE_FIGHTERS).size,19);const {rooms}=fixture(),host=await rooms.create('Host'),guest=await rooms.join(host.code,'Guest');await rooms.select(host.code,host.token,{fighter:'bnl-01',ready:true});await rooms.select(guest.code,guest.token,{fighter:'bnl-01',ready:true});const state=await rooms.poll(host.code,guest.token);assert.equal(state.host.fighter,'bnl-01');assert.equal(state.guest.fighter,'bnl-01');await fails(()=>rooms.select(host.code,host.token,{fighter:'bnl-01-unreleased',ready:true}),400);});
const relayPacket=(seq,payload,lane='control')=>({lane,data:JSON.stringify({scope:'system-clash-online-v1',version:'system-clash-20261009-8',seq,matchId:1,payload})});
async function readyRelayFixture(){const f=fixture(),host=await f.rooms.create('Host'),guest=await f.rooms.join(host.code,'Guest');await f.rooms.select(host.code,host.token,{fighter:'6-bit',ready:true});await f.rooms.select(host.code,guest.token,{fighter:'9-bit',ready:true});return {...f,host,guest};}
test('cloud relay converges two authenticated ready seats and acknowledges reliable controls exactly once',async()=>{
 const {rooms,host,guest}=await readyRelayFixture(),request={version:'system-clash-20261009-8',ack:0,packets:[relayPacket(1,{type:'hello',version:'system-clash-20261009-8',room:host.code,role:'host'})]};
 const first=await rooms.relay(host.code,host.token,request);assert.equal(first.accepted.control,1);assert.deepEqual(first.packets,[]);
 assert.equal((await rooms.poll(host.code,guest.token)).relay,true);
 const received=await rooms.relay(host.code,guest.token,{version:request.version,ack:0,packets:[]});assert.deepEqual(received.packets,request.packets);
 await rooms.relay(host.code,host.token,request);
 const acked=await rooms.relay(host.code,guest.token,{version:request.version,ack:1,packets:[]});assert.deepEqual(acked.packets,[]);
});
test('cloud relay replaces disposable snapshots but never drops reliable release and attack controls',async()=>{
 const {rooms,host,guest}=await readyRelayFixture(),version='system-clash-20261009-8';
 const controls=[relayPacket(1,{type:'input',input:{move:1,crouch:false,block:false}}),relayPacket(2,{type:'action',action:'punch',input:{move:1,crouch:false,block:false}}),relayPacket(3,{type:'input',input:{move:0,crouch:false,block:false}})];
 await rooms.relay(host.code,guest.token,{version,ack:0,packets:controls});
 assert.deepEqual((await rooms.relay(host.code,host.token,{version,ack:0,packets:[relayPacket(1,{type:'snapshot',snapshot:{seq:1}},'state')]})).packets,controls);
 await rooms.relay(host.code,host.token,{version,ack:3,packets:[relayPacket(2,{type:'snapshot',snapshot:{seq:2}},'state')]});
 const latest=await rooms.relay(host.code,guest.token,{version,ack:0,packets:[]});assert.equal(latest.packets.length,1);assert.equal(JSON.parse(latest.packets[0].data).payload.snapshot.seq,2);
});
test('cloud relay rejects unready, forged, cross-room, incompatible and guest authority packets',async()=>{
 const f=fixture(),host=await f.rooms.create('Host');await fails(()=>f.rooms.relay(host.code,host.token,{version:'system-clash-20261009-8',ack:0,packets:[]}),409);
 const {rooms,host:h,guest:g}=await readyRelayFixture(),version='system-clash-20261009-8',request={version,ack:0,packets:[]};
 await fails(()=>rooms.relay(h.code,'forged',request),401);
 await fails(()=>rooms.relay(h.code,g.token,{...request,packets:[relayPacket(1,{type:'snapshot',snapshot:{}},'state')]}),400);
 await fails(()=>rooms.relay(h.code,g.token,{...request,packets:[relayPacket(1,{type:'hello',version,room:'OTHER1',role:'guest'})]}),400);
 await rooms.relay(h.code,h.token,request);
 await fails(()=>rooms.relay(h.code,g.token,{...request,version:'older-game'}),409);
 await fails(()=>rooms.relay(h.code,g.token,{...request,ack:100}),400);
});
test('cloud relay bounds pending controls, request bytes and session lifetime without touching other data',async()=>{
 const {rooms,rows,host,guest,setTime}=await readyRelayFixture(),version='system-clash-20261009-8';rows.set('protected:BNL','retained');
 const batch=Array.from({length:16},(_,index)=>relayPacket(index+1,{type:'ping'}));await rooms.relay(host.code,guest.token,{version,ack:0,packets:batch});
 await rooms.relay(host.code,guest.token,{version,ack:0,packets:batch.map((p,index)=>relayPacket(index+17,{type:'ping'}))});
 await fails(()=>rooms.relay(host.code,guest.token,{version,ack:0,packets:[relayPacket(33,{type:'ping'})]}),409);
 await fails(()=>rooms.relay(host.code,host.token,{version,ack:0,packets:[relayPacket(1,{type:'snapshot',snapshot:{large:'x'.repeat(70000)}},'state')]}),400);
 assert.equal(rows.get('protected:BNL'),'retained');setTime(host.expiresAt+1);await fails(()=>rooms.relay(host.code,host.token,{version,ack:0,packets:[]}),410);
});
test('trickle candidates remain private, deduplicated and bound to the current host negotiation',async()=>{
 const {rooms,host,guest}=await readyRelayFixture(),candidate={candidate:'candidate:1 1 UDP 2122260223 192.0.2.1 5000 typ host',sdpMid:'0',sdpMLineIndex:0,usernameFragment:'first'};
 await rooms.candidates(host.code,host.token,{generation:1,candidates:[candidate,candidate]});
 assert.equal((await rooms.poll(host.code,guest.token)).candidates.length,1);assert.ok(!JSON.stringify(await rooms.list()).includes(candidate.candidate));
 await rooms.signal(host.code,host.token,{type:'offer',sdp:'v=0 first',generation:1});
 await rooms.signal(host.code,host.token,{type:'offer',sdp:'v=0 restart',generation:2});
 const restarted=await rooms.poll(host.code,guest.token);assert.equal(restarted.description.generation,2);assert.deepEqual(restarted.candidates,[]);
 await fails(()=>rooms.candidates(host.code,guest.token,{generation:1,candidates:[candidate]}),409);
 await fails(()=>rooms.signal(host.code,guest.token,{type:'answer',sdp:'v=0 stale',generation:1}),409);
 await fails(()=>rooms.candidates(host.code,'forged',{generation:2,candidates:[candidate]}),401);
 await fails(()=>rooms.candidates(host.code,guest.token,{generation:2,candidates:Array(17).fill(candidate)}),400);
});
