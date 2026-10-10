import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
import {createOnlineRelay,createOnlineConnection} from '../public/games/system-clash/play/online-connection.mjs';
import {ONLINE_VERSION} from '../public/games/system-clash/play/online-protocol.mjs';
import {createOnlinePeer} from '../public/games/system-clash/play/online-transport.mjs';
import {createOnlineSession} from '../public/games/system-clash/play/online.mjs';
const require=createRequire(import.meta.url);
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {createOnlineRooms}=require('../src/lib/system-clash-online.ts');
class Timers{
 now=0;id=0;jobs=new Map();
 setTimeout=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{fn,at:this.now+ms});return id;};clearTimeout=id=>this.jobs.delete(id);
 setInterval=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{fn,at:this.now+ms,ms});return id;};clearInterval=id=>this.jobs.delete(id);
 advance(ms){this.now+=ms;for(const [id,j]of [...this.jobs])if(j.at<=this.now){if(j.ms)j.at=this.now+j.ms;else this.jobs.delete(id);j.fn();}}
}
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
async function pair(){
 const rows=new Map(),store={async read(code){return rows.get(code)??null;},async cas(code,old,next){if((rows.get(code)??null)!==old)return false;if(next===null)rows.delete(code);else rows.set(code,next);return true;},async list(){return [...rows.values()];}},rooms=createOnlineRooms({store}),h=await rooms.create('Host'),g=await rooms.join(h.code,'Guest');
 await rooms.select(h.code,h.token,{fighter:'6-bit',ready:true});await rooms.select(h.code,g.token,{fighter:'9-bit',ready:true});
 const timers=new Timers(),received=[[],[]],statuses=[[],[]],ended=[[],[]],routes=[null,null];
 const clients=[h,g].map((seat,index)=>createOnlineRelay({role:seat.role,room:seat.code,timers,now:()=>timers.now,version:ONLINE_VERSION,relayRequest:value=>rooms.relay(h.code,seat.token,value),onPacket:p=>{received[index].push(p);routes[index]?.(p);},onStatus:s=>statuses[index].push(s),onDisconnect:r=>ended[index].push(r)}));
 for(const client of clients)client.start();for(let i=0;i<5;i++){await flush();timers.advance(250);}
 return {clients,timers,received,statuses,ended,rooms,h,g,routes};
}
test('two cloud clients verify the ordinary peer handshake before exchanging controls',async()=>{
 const p=await pair();try{
 assert.ok(p.clients.every(client=>client.connected));assert.ok(p.statuses.every(values=>values.includes('connected')));
 p.clients[1].send({type:'action',action:'punch',input:{move:1,crouch:false,block:false}});
 p.clients[1].send({type:'input',input:{move:0,crouch:false,block:false}});
 for(let i=0;i<3;i++){p.timers.advance(250);await flush();}
 assert.deepEqual(p.received[0].map(packet=>packet.type),['action','input']);
 assert.equal(p.received[0].at(-1).input.move,0);
 for(let i=0;i<3;i++){p.timers.advance(250);await flush();}assert.equal(p.received[0].length,2);
 assert.equal(p.clients[1].send({type:'snapshot',snapshot:{hp:999}}),false);
 }finally{p.clients.forEach(client=>client.close());}assert.equal(p.timers.jobs.size,0);
});
test('cloud latest-state delivery preserves match authority and rematch identity',async()=>{
 const p=await pair();try{
 p.clients[0].send({type:'snapshot',snapshot:{seq:1}});p.clients[0].send({type:'snapshot',snapshot:{seq:2}});
 for(let i=0;i<3;i++){p.timers.advance(250);await flush();}
 assert.deepEqual(p.received[1].filter(x=>x.type==='snapshot').map(x=>x.snapshot.seq),[2]);
 p.clients[0].setMatchId(2);p.clients[0].send({type:'rematch',matchId:2});
 for(let i=0;i<3;i++){p.timers.advance(250);await flush();}
 assert.ok(p.received[1].some(x=>x.type==='rematch'&&x.matchId===2));p.clients[1].setMatchId(2);
 p.clients[1].send({type:'input',input:{move:-1,crouch:false,block:false}});
 for(let i=0;i<3;i++){p.timers.advance(250);await flush();}assert.equal(p.received[0].at(-1).input.move,-1);
 }finally{p.clients.forEach(client=>client.close());}
});
test('browser without direct networking uses the authenticated cloud path',async()=>{
 const p=await pair();p.clients.forEach(client=>client.close());
 const statuses=[],client=createOnlineConnection({role:'host',room:p.h.code,RTCPeerConnection:null,timers:p.timers,now:()=>p.timers.now,relayRequest:value=>p.rooms.relay(p.h.code,p.h.token,value),onStatus:s=>statuses.push(s)});
 try{assert.equal(client.transport,'relay');assert.ok(statuses.includes('relaying'));}finally{client.close();}
});
test('a full reliable batch and latest snapshot stay within the service packet cap without losing controls',async()=>{
 const p=await pair();try{
 for(let i=0;i<16;i++)assert.equal(p.clients[0].send({type:'pause',paused:true}),true);
 assert.equal(p.clients[0].send({type:'snapshot',snapshot:{seq:99}}),true);
 for(let i=0;i<6;i++){p.timers.advance(250);await flush();}
 assert.deepEqual(p.ended,[[],[]]);assert.equal(p.received[1].filter(packet=>packet.type==='pause').length,16);
 assert.equal(p.received[1].filter(packet=>packet.type==='snapshot').at(-1).snapshot.seq,99);
 }finally{p.clients.forEach(client=>client.close());}
});
const advance=async(timers,ms)=>{for(let elapsed=0;elapsed<ms;elapsed+=10){timers.advance(Math.min(10,ms-elapsed));await flush();timers.advance(0);await flush();}};
for(const delay of [150,500])test(`relay starts are paced from request start with ${delay}ms responses and never overlap`,async()=>{
 const timers=new Timers(),starts=[];let active=0,maxActive=0;
 const client=createOnlineRelay({role:'host',room:'ABC123',timers,now:()=>timers.now,relayRequest:async value=>{
  starts.push(timers.now);active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>timers.setTimeout(resolve,delay));active--;
  return {relay:true,accepted:{control:Math.max(0,...value.packets.filter(p=>p.lane==='control').map(p=>JSON.parse(p.data).seq)),state:0},packets:[]};
 }});
 try{client.start();await advance(timers,delay===150?260:510);assert.deepEqual(starts,[0,delay===150?250:500]);assert.equal(maxActive,1);}finally{client.close();}
});
test('continuous input uses the latest state slot while actions retain reliable order',async()=>{
 const p=await pair();try{
 p.clients[1].send({type:'input',inputSeq:1,input:{move:-1,crouch:false,block:false}});
 p.clients[1].send({type:'action',action:'punch',inputSeq:2,input:{move:-1,crouch:false,block:false}});
 p.clients[1].send({type:'input',inputSeq:3,input:{move:0,crouch:false,block:false}});
 await advance(p.timers,1000);
 assert.deepEqual(p.received[0].map(packet=>packet.type),['action','input']);
 assert.deepEqual(p.received[0].map(packet=>packet.inputSeq),[2,3]);assert.equal(p.received[0].at(-1).input.move,0);assert.deepEqual(p.ended,[[],[]]);
 }finally{p.clients.forEach(c=>c.close());}
});
async function delayedPair(profile){
 const timers=new Timers(),rows=new Map(),store={async read(id){return rows.get(id)??null;},async cas(id,old,next){if((rows.get(id)??null)!==old)return false;if(next===null)rows.delete(id);else rows.set(id,next);return true;},async list(){return [...rows.values()];}};
 const rooms=createOnlineRooms({store,now:()=>timers.now}),h=await rooms.create('Host'),g=await rooms.join(h.code,'Guest');
 await rooms.select(h.code,h.token,{fighter:'6-bit',ready:true});await rooms.select(h.code,g.token,{fighter:'9-bit',ready:true});
 const received=[[],[]],ended=[[],[]],starts=[[],[]],active=[0,0],maximum=[0,0],errors=[];let impaired=false,inputReliable=0;
 const clients=[h,g].map((seat,index)=>createOnlineRelay({role:seat.role,room:seat.code,timers,now:()=>timers.now,onPacket:p=>received[index].push(p),onDisconnect:r=>ended[index].push(r),relayRequest:async value=>{
  starts[index].push(timers.now);active[index]++;maximum[index]=Math.max(maximum[index],active[index]);
  inputReliable+=value.packets.filter(p=>p.lane==='control'&&JSON.parse(p.data).payload.type==='input').length;
  const delay=impaired?profile(timers.now,index):50,wait=ms=>new Promise(resolve=>timers.setTimeout(resolve,ms));
  try{await wait(delay/2);const result=await rooms.relay(h.code,seat.token,value);await wait(delay/2);return result;}catch(e){errors.push(e.message);throw e;}finally{active[index]--;}
 }}));
 clients.forEach(c=>c.start());await advance(timers,1500);assert.ok(clients.every(c=>c.connected));impaired=true;
 return {timers,clients,received,ended,starts,maximum,errors,get inputReliable(){return inputReliable;},rows,h,g,rooms};
}
for(const [label,profile]of [['800ms',()=>800],['1500ms',()=>1500],['jitter',(at,seat)=>seat===1&&at%4000<300?1600:50]])test(`60 seconds of ${label} relay timing keep input bounded, release current and attacks reliable`,async()=>{
 const p=await delayedPair(profile);let inputSeq=0,actions=0;
 try{
 for(let elapsed=0;elapsed<60000;elapsed+=100){
  const input={move:elapsed%4000<2000?-1:0,crouch:false,block:false};
  assert.equal(p.clients[1].send({type:'input',inputSeq:++inputSeq,input}),true);
  if(elapsed%1000===0){actions++;assert.equal(p.clients[1].send({type:'action',action:'punch',inputSeq:++inputSeq,input}),true);}
  await advance(p.timers,100);
 }
 const finalSeq=++inputSeq;assert.equal(p.clients[1].send({type:'input',inputSeq:finalSeq,input:{move:0,crouch:false,block:false}}),true);await advance(p.timers,10000);
 assert.deepEqual(p.ended,[[],[]]);assert.deepEqual(p.errors,[]);assert.equal(p.inputReliable,0);assert.deepEqual(p.maximum,[1,1]);
 const inputs=p.received[0].filter(p=>p.type==='input'),attacks=p.received[0].filter(p=>p.type==='action');
 assert.equal(inputs.at(-1).inputSeq,finalSeq);assert.equal(inputs.at(-1).input.move,0);assert.ok(inputs.length<300);assert.equal(attacks.length,actions);assert.ok(attacks.every((p,i)=>i===0||p.inputSeq>attacks[i-1].inputSeq));
 for(const starts of p.starts)assert.ok(starts.every((at,i)=>i===0||at-starts[i-1]>=250));
 const room=JSON.parse(p.rows.get(p.h.code));assert.ok(room.relay.guest.control.length<16);
 }finally{p.clients.forEach(c=>c.close());await p.rooms.leave(p.h.code,p.g.token);await p.rooms.leave(p.h.code,p.h.token);}
});
class NativeEvents{listeners=new Map();addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}emit(type,props={}){for(const fn of [...(this.listeners.get(type)??[])])fn({type,...props});}}
class NativeChannel extends NativeEvents{constructor(label,options){super();Object.assign(this,{label,ordered:options.ordered,maxRetransmits:options.maxRetransmits??null,readyState:'connecting',bufferedAmount:0,sent:[]});}send(data){this.sent.push(data);this.remote.emit('message',{data});}open(){this.readyState='open';this.emit('open');}close(){this.readyState='closed';this.emit('close');}}
class NativePeer extends NativeEvents{channels=[];createDataChannel(label,options){const channel=new NativeChannel(label,options);this.channels.push(channel);return channel;}close(){}}
test('native latest-state direction rejects forged authority and replay without poisoning valid state',()=>{
 const natives=[new NativePeer(),new NativePeer()],timers=new Timers(),received=[[],[]];
 const peers=['host','guest'].map((role,index)=>createOnlinePeer({role,room:'ABC123',peer:natives[index],timers,now:()=>timers.now,onPacket:p=>received[index].push(p)}));
 for(const local of natives[0].channels){const remote=new NativeChannel(local.label,{ordered:local.ordered,maxRetransmits:local.maxRetransmits});local.remote=remote;remote.remote=local;natives[1].channels.push(remote);natives[1].emit('datachannel',{channel:remote});remote.open();local.open();}
 try{
 assert.ok(peers.every(p=>p.connected));const states=natives.map(native=>native.channels.find(c=>c.label==='clash-state'));
 const input={move:-1,crouch:false,block:false};assert.equal(peers[0].send({type:'input',inputSeq:1,input}),false);assert.equal(peers[1].send({type:'input',inputSeq:1,input}),true);
 assert.equal(states[1].sent.length,1);assert.equal(JSON.parse(states[1].sent[0]).payload.type,'input');
 states[0].emit('message',{data:states[1].sent[0]});assert.equal(received[0].length,1);
 const wire=payload=>JSON.stringify({scope:'system-clash-online-v1',version:ONLINE_VERSION,seq:999,matchId:1,payload});
 states[0].emit('message',{data:wire({type:'snapshot',snapshot:{seq:99}})});
 states[1].emit('message',{data:wire({type:'input',inputSeq:99,input})});
 states[0].emit('message',{data:wire({type:'action',action:'punch',input})});
 assert.equal(peers[1].send({type:'input',inputSeq:2,input:{...input,move:0}}),true);
 assert.equal(peers[0].send({type:'snapshot',snapshot:{seq:1}}),true);
 assert.deepEqual(received[0].map(p=>p.inputSeq),[1,2]);assert.deepEqual(received[1].map(p=>p.type),['snapshot']);
 assert.equal(peers[1].send({type:'snapshot',snapshot:{seq:2}}),false);
 }finally{peers.forEach(p=>p.close());}
});


test('a restored room begins its cloud handshake on the stored match identity',async()=>{
 const p=await pair();p.clients.forEach(client=>client.close());await p.rooms.resume(p.h.code,p.h.token);
 for(const seat of [p.h,p.g])await p.rooms.select(p.h.code,seat.token,{fighter:seat.role==='host'?'6-bit':'9-bit',ready:true});
 for(let id=1;id<3;id++){await p.rooms.begin(p.h.code,p.h.token,{after:id-1});await p.rooms.result(p.h.code,p.h.token,{matchId:id,winner:0});}await p.rooms.begin(p.h.code,p.h.token,{after:2});
 const ids=[],ended=[],clients=[p.h,p.g].map(seat=>createOnlineConnection({role:seat.role,room:seat.code,matchId:3,RTCPeerConnection:null,timers:p.timers,now:()=>p.timers.now,onDisconnect:reason=>ended.push(reason),relayRequest:value=>{ids.push(...value.packets.map(packet=>JSON.parse(packet.data).matchId));return p.rooms.relay(p.h.code,seat.token,value);}}));
 try{clients.forEach(client=>client.setMatchId(3));for(let index=0;index<5;index++){await flush();p.timers.advance(250);}assert.ok(clients.every(client=>client.connected));assert.ok(ids.length>0);assert.deepEqual([...new Set(ids)],[3]);assert.deepEqual(ended,[]);}finally{clients.forEach(client=>client.close());}
});


test('a complete room-backed cloud session scores once and carries the result into an immediate rematch',async()=>{
 const p=await pair(),sessions=[],scores=[[0,0],[0,0]],loads=[[],[]];await p.rooms.begin(p.h.code,p.h.token,{after:0});
 try{
  for(const [index,seat]of [p.h,p.g].entries()){
   const roomState=await p.rooms.poll(p.h.code,seat.token);scores[index]=roomState.wins;
   sessions[index]=createOnlineSession({seat,roomState,peer:p.clients[index],timers:p.timers,onScore:wins=>{scores[index]=wins;},loadFrame:matchId=>{loads[index].push({matchId,wins:[...scores[index]]});sessions[index].receiveFrame({type:'loaded'});},postFrame:packet=>{if(index===1&&packet.type==='start')sessions[index].receiveFrame({type:'started',matchId:packet.matchId});},onResult:async result=>{const saved=await p.rooms.result(p.h.code,p.h.token,result);scores[0]=saved.wins;},beginMatch:async after=>p.rooms.begin(p.h.code,p.h.token,{after})});
   p.routes[index]=packet=>sessions[index].receivePeer(packet);
  }
  sessions.forEach(session=>session.connected());await advance(p.timers,1500);
  const result={type:'snapshot',snapshot:{seq:1,matchId:1,state:{phase:'over',winner:0}}};sessions[0].receiveFrame(result);sessions[0].receiveFrame(result);sessions[0].receiveFrame({type:'rematch'});await advance(p.timers,1500);
  assert.deepEqual((await p.rooms.poll(p.h.code,p.g.token)).wins,[1,0]);assert.deepEqual(sessions.map(session=>session.matchId),[2,2]);assert.deepEqual(loads[1].at(-1),{matchId:2,wins:[1,0]});assert.deepEqual(p.ended,[[],[]]);
  sessions[0].receiveFrame(result);assert.deepEqual((await p.rooms.poll(p.h.code,p.h.token)).wins,[1,0]);
 }finally{sessions.forEach(session=>session.destroy());p.clients.forEach(client=>client.close());}
});
