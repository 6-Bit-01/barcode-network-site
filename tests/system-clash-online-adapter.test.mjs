import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url),originalLoad=Module._load;
const PREFIX='barcode:system-clash:online:v1:';
const rows=new Map(),calls=[],expires=new Map();let time=1000000;const realNow=Date.now;Date.now=()=>time;
// SDK-boundary model retains Lua CJSON's empty-table object behavior unless
// the submitted CAS script explicitly emits [] for an empty index.
class FakeRedis {
 constructor(options){calls.push({command:'construct',options});}
 async get(key){calls.push({command:'get',keys:[key]});if(expires.has(key)&&expires.get(key)<=time){rows.delete(key);expires.delete(key);}return rows.get(key)??null;}
 async mget(...keys){calls.push({command:'mget',keys});return keys.map(key=>rows.get(key)??null);}
 async eval(script,keys,args){
  calls.push({command:'eval',script,keys,args});
  if(keys.length===1){const n=Number(rows.get(keys[0])??0)+1;rows.set(keys[0],String(n));return n;}
  const [roomKey,indexKey]=keys,[old,next,,code,now]=args;
  if((rows.get(roomKey)??'')!==old)return 0;if(old!==''&&next!==''&&script.includes('if prior.guest')){const prior=JSON.parse(old),room=JSON.parse(next);if(prior.guest&&room.guest){rows.set(roomKey,next);expires.set(roomKey,time+Number(args[2])*1000);return 1;}}
  const decoded=JSON.parse(rows.get(indexKey)??'[]');const entries=Array.isArray(decoded)?decoded:[];
  const heartbeatAware=/hostLastSeen/.test(script);const active=entries.filter(entry=>{const roomRaw=rows.get(PREFIX+'room:'+entry.code);const lastSeen=entry.hostLastSeen??(roomRaw?JSON.parse(roomRaw).host.lastSeen:0);return entry.code!==code&&entry.expiresAt>now&&(!heartbeatAware||now-lastSeen<60000);});
  if(next!==''){
   const room=JSON.parse(next);
   if(room.guest===null){if(active.length>=30){if(old===''||!script.includes("if ARGV[1]=='' then return 0 end"))return 0;}else active.push({code,expiresAt:room.expiresAt,...(heartbeatAware?{hostLastSeen:room.host.lastSeen}:{})});}
   rows.set(roomKey,next);const usesTTLArg=/'EX',\s*(?:tonumber\()?ARGV\[3\]/.test(script);expires.set(roomKey,time+Number(usesTTLArg?args[2]:1200)*1000);
  }else rows.delete(roomKey);
  const explicitEmpty=/#next\s*==\s*0/.test(script)&&/['"]\[\]['"]/.test(script);
  rows.set(indexKey,active.length||explicitEmpty?JSON.stringify(active):'{}');return 1;
 }
}
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
Module._load=function(id,parent,isMain){if(id==='@upstash/redis')return {Redis:FakeRedis};return originalLoad.call(this,id,parent,isMain);};
const {onlineRoomStore,GAME_ROOM_CAS}=require('../src/lib/system-clash-online-store.ts');
const {createOnlineRooms}=require('../src/lib/system-clash-online.ts');Module._load=originalLoad;
const savedURL=process.env.UPSTASH_REDIS_REST_URL,savedToken=process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.UPSTASH_REDIS_REST_URL='https://redis.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-sdk-boundary-token';
function fixture(){rows.clear();expires.clear();calls.length=0;time=1000000;let count=0;const store=onlineRoomStore(),rooms=createOnlineRooms({store,token:()=>('seat'+(++count)).padEnd(32,'x'),code:()=>('ROOM'+count).padEnd(6,'A')});return {store,rooms};}

test('real adapter reads a missing and deliberately empty array index as an empty lobby',async()=>{
 const {store}=fixture();assert.deepEqual(await store.list(),[]);rows.set(PREFIX+'index','[]');assert.deepEqual(await store.list(),[]);rows.set(PREFIX+'index','{}');assert.deepEqual(await store.list(),[]);assert.equal(calls.filter(c=>c.command==='mget').length,0);
});
test('create and sole-room join round-trip through the adapter without poisoning the empty lobby',async()=>{
 const {store,rooms}=fixture(),host=await rooms.create('Host');assert.equal((await rooms.list())[0].code,host.code);
 const guest=await rooms.join(host.code,'Guest');assert.equal(guest.role,'guest');assert.equal(rows.get(PREFIX+'index'),'[]');assert.deepEqual(await store.list(),[]);
 assert.ok(calls.some(c=>c.command==='eval'&&c.script===GAME_ROOM_CAS));
});
test('guest leave restores one open entry and host leave restores a valid empty array',async()=>{
 const {store,rooms}=fixture(),host=await rooms.create('Host'),guest=await rooms.join(host.code,'Guest');await rooms.leave(host.code,guest.token);
 assert.equal(JSON.parse(rows.get(PREFIX+'index')).length,1);assert.equal((await rooms.list())[0].code,host.code);await rooms.leave(host.code,host.token);
 assert.equal(rows.get(PREFIX+'index'),'[]');assert.deepEqual(await store.list(),[]);assert.equal(rows.has(PREFIX+'room:'+host.code),false);
});
test('adapter CAS retries and rate keys stay confined to the existing game namespace',async()=>{
 const {store,rooms}=fixture();rows.set('barcode:queue:live','protected');rows.set('bnl:memory:live','protected');const host=await rooms.create('Host');const raw=rows.get(PREFIX+'room:'+host.code);
 assert.equal(await store.cas(host.code,'stale',raw,Date.now()),false);assert.equal(rows.get(PREFIX+'room:'+host.code),raw);assert.equal(await store.allow('192.0.2.1','enter',1),true);assert.equal(await store.allow('192.0.2.1','enter',1),false);
 assert.equal(rows.get('barcode:queue:live'),'protected');assert.equal(rows.get('bnl:memory:live'),'protected');for(const call of calls)for(const key of call.keys??[])assert.ok(key.startsWith(PREFIX));
 const client=calls.find(c=>c.command==='construct').options;assert.equal(client.automaticDeserialization,false);assert.equal(client.retry,false);assert.ok(client.signal instanceof AbortSignal);
});
test.after(()=>{Date.now=realNow;if(savedURL===undefined)delete process.env.UPSTASH_REDIS_REST_URL;else process.env.UPSTASH_REDIS_REST_URL=savedURL;if(savedToken===undefined)delete process.env.UPSTASH_REDIS_REST_TOKEN;else process.env.UPSTASH_REDIS_REST_TOKEN=savedToken;});


test('stale unjoinable entries cannot consume capacity while a live room remains discoverable',async()=>{
 const {rooms}=fixture(),index=[];
 for(let i=0;i<30;i++){
  const code=('OLD'+String(i).padStart(3,'0')),seen=i===0?time:time-120000;const room={code,createdAt:time-120000,expiresAt:time+1000000,host:{name:'Retained '+i,fighter:'6-bit',ready:false,lastSeen:seen,tokenHash:'unused'},guest:null,hostDescription:null,guestDescription:null};rows.set(PREFIX+'room:'+code,JSON.stringify(room));index.push({code,expiresAt:room.expiresAt});
 }
 rows.set(PREFIX+'index',JSON.stringify(index));const host=await rooms.create('Fresh');const open=await rooms.list();assert.equal(open.length,2);assert.ok(open.some(room=>room.code==='OLD000'));assert.ok(open.some(room=>room.code===host.code));assert.equal(JSON.parse(rows.get(PREFIX+'index')).length,2);assert.ok(rows.has(PREFIX+'room:OLD000'),'Live room data preserved');
});
test('room polling never extends Redis data beyond the fixed session expiry',async()=>{
 const {store,rooms}=fixture(),host=await rooms.create('Host');time+=61000;await rooms.poll(host.code,host.token);const rowKey=PREFIX+'room:'+host.code;
 assert.equal(expires.get(rowKey),host.expiresAt);const call=calls.filter(c=>c.command==='eval'&&c.keys.length===2).at(-1);assert.equal(call.args[2],1139);
 time=host.expiresAt+1;assert.equal(await store.read(host.code),null);
});


test('live lobby capacity still permits seat departure without deleting another live room',async()=>{
 const {rooms}=fixture(),host=await rooms.create('Host'),guest=await rooms.join(host.code,'Guest'),index=[];
 for(let i=0;i<30;i++){
  const code='NEW'+String(i).padStart(3,'0');const room={code,createdAt:time,expiresAt:time+1200000,host:{name:'Live '+i,fighter:'6-bit',ready:false,lastSeen:time,tokenHash:'unused'},guest:null,hostDescription:null,guestDescription:null};rows.set(PREFIX+'room:'+code,JSON.stringify(room));index.push({code,expiresAt:room.expiresAt,hostLastSeen:time});
 }
 rows.set(PREFIX+'index',JSON.stringify(index));await rooms.leave(host.code,guest.token);
 const raw=JSON.parse(rows.get(PREFIX+'room:'+host.code));assert.equal(raw.guest,null);assert.equal(JSON.parse(rows.get(PREFIX+'index')).length,30);
 for(const item of index)assert.ok(rows.has(PREFIX+'room:'+item.code));
 await assert.rejects(()=>rooms.poll(host.code,guest.token),e=>e.status===401);assert.equal((await rooms.poll(host.code,host.token)).role,'host');
});
test('occupied-room updates bypass lobby index work while retaining fixed expiry',async()=>{
 const {rooms}=fixture(),host=await rooms.create('Host'),guest=await rooms.join(host.code,'Guest');
 const marker='sealed-index-marker';rows.set(PREFIX+'index',marker);
 await rooms.select(host.code,host.token,{fighter:'6-bit',ready:true});
 await rooms.select(host.code,guest.token,{fighter:'9-bit',ready:true});
 await rooms.relay(host.code,host.token,{version:'system-clash-20261009-8',ack:0,packets:[]});
 assert.equal(rows.get(PREFIX+'index'),marker);
 assert.ok(GAME_ROOM_CAS.indexOf("if prior.guest")<GAME_ROOM_CAS.indexOf('local entries='));assert.equal(expires.get(PREFIX+'room:'+host.code),host.expiresAt);
});
