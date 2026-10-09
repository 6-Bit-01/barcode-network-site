import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
import {createOnlineRelay,createOnlineConnection} from '../public/games/system-clash/play/online-connection.mjs';
import {ONLINE_VERSION} from '../public/games/system-clash/play/online-protocol.mjs';
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
 const timers=new Timers(),received=[[],[]],statuses=[[],[]],ended=[[],[]];
 const clients=[h,g].map((seat,index)=>createOnlineRelay({role:seat.role,room:seat.code,timers,now:()=>timers.now,version:ONLINE_VERSION,relayRequest:value=>rooms.relay(h.code,seat.token,value),onPacket:p=>received[index].push(p),onStatus:s=>statuses[index].push(s),onDisconnect:r=>ended[index].push(r)}));
 for(const client of clients)client.start();for(let i=0;i<5;i++){await flush();timers.advance(250);}
 return {clients,timers,received,statuses,ended,rooms,h,g};
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
