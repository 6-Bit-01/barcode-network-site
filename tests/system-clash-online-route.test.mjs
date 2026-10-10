import test from 'node:test';import assert from 'node:assert/strict';import Module,{createRequire} from 'node:module';import fs from 'node:fs';import ts from 'typescript';
const require=createRequire(import.meta.url),originalLoad=Module._load;
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const rows=new Map();let denied=false,unavailable=false,operations=0;
const store={async allow(){operations++;if(unavailable)throw new Error('offline');return !denied;},async read(code){return rows.get(code)??null;},async cas(code,old,next){if((rows.get(code)??null)!==old)return false;if(next===null)rows.delete(code);else rows.set(code,next);return true;},async list(){return [...rows.values()];}};
Module._load=function(id,parent,isMain){
 if(id==='@/lib/system-clash-online')return require('../src/lib/system-clash-online.ts');
 if(id==='@/lib/system-clash-online-store')return {onlineRoomStore:()=>store};
 if(id==='@/lib/system-clash-turn')return require('../src/lib/system-clash-turn.ts');
 if(id==='server-only')return {};
 if(id==='next/server')return {NextResponse:{json:(body,{status=200,headers={}}={})=>Response.json(body,{status,headers})}};
 return originalLoad.call(this,id,parent,isMain);
};
const {GET,POST}=require('../src/app/api/games/system-clash/rooms/route.ts');Module._load=originalLoad;
const url='https://barcode.example/api/games/system-clash/rooms';
const request=(body,headers={})=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://barcode.example',...headers},body:JSON.stringify(body)});
test('room endpoint rejects foreign origins, wrong MIME, malformed body and oversized requests before storage',async()=>{
 const before=operations;
 assert.equal((await POST(request({action:'create',name:'A'},{Origin:'https://foreign.example'}))).status,403);
 assert.equal((await POST(request({action:'create',name:'A'},{'Sec-Fetch-Site':'cross-site'}))).status,403);
 assert.equal((await POST(request({},{'Content-Type':'text/plain'}))).status,415);
 assert.equal((await POST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalid'}))).status,400);
 assert.equal((await POST(request({action:'create',name:'A'},{'Content-Length':'75001'}))).status,413);
 assert.equal(operations,before);
});
test('private seat credential works only in Bearer header; public session listings contain no secrets or signals',async()=>{
 rows.clear();const created=await POST(request({action:'create',name:'Tester'}));assert.equal(created.status,200);const h=await created.json();
 assert.match(created.headers.get('cache-control'),/no-store/);
 assert.equal((await POST(request({action:'poll',code:h.code,token:h.token}))).status,401);
 assert.equal((await POST(request({action:'poll',code:h.code},{Authorization:'Bearer '+h.token}))).status,200);
 const g=await (await POST(request({action:'join',code:h.code,name:'Opponent'}))).json();
 assert.equal((await POST(request({action:'signal',code:h.code,description:{type:'offer',sdp:'v=0 hidden signal'}},{Authorization:'Bearer '+h.token}))).status,200);
 const state=await (await POST(request({action:'poll',code:h.code},{Authorization:'Bearer '+g.token}))).json();assert.equal(state.description.sdp,'v=0 hidden signal');
 const list=await GET(new Request(url));const text=await list.text();assert.ok(!text.includes(h.token)&&!text.includes(g.token)&&!text.includes('hidden signal'));
 assert.equal((await POST(request({action:'leave',code:h.code},{Authorization:'Bearer '+h.token}))).status,200);assert.equal(rows.size,0);
});
test('rate limits and unavailable storage fail closed with useful fallback and no cached response',async()=>{
 denied=true;assert.equal((await GET(new Request(url))).status,429);assert.equal((await POST(request({action:'create',name:'A'}))).status,429);denied=false;
 unavailable=true;const result=await GET(new Request(url));assert.equal(result.status,503);assert.match((await result.json()).error,/Solo and local/);assert.equal(result.headers.get('cache-control'),'no-store');unavailable=false;
});



test('chunked oversized body is cancelled at the byte limit before rate or storage work',async()=>{
 let pulled=0,cancelled=false;const before=operations;const body=new ReadableStream({pull(controller){pulled++;controller.enqueue(new Uint8Array(40000).fill(32));if(pulled===10)controller.close();},cancel(){cancelled=true;}},{highWaterMark:0});
 const req=new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://barcode.example'},body,duplex:'half'});const response=await POST(req);
 assert.equal(response.status,413);assert.equal(cancelled,true);assert.equal(pulled,2);assert.equal(operations,before);
});

test('Lost Marbles can be selected through the authenticated room endpoint',async()=>{
 rows.clear();const host=await (await POST(request({action:'create',name:'Host'}))).json();
 const selected=await POST(request({action:'select',code:host.code,fighter:'lost-marbles',ready:true},{Authorization:'Bearer '+host.token}));
 assert.equal(selected.status,200);
 const state=await (await POST(request({action:'poll',code:host.code},{Authorization:'Bearer '+host.token}))).json();
 assert.equal(state.host.fighter,'lost-marbles');assert.equal(state.host.ready,true);
 assert.equal((await POST(request({action:'select',code:host.code,fighter:'lost-marbles',ready:true},{Authorization:'Bearer forged'}))).status,401);
 await POST(request({action:'leave',code:host.code},{Authorization:'Bearer '+host.token}));
});
test('authenticated endpoint carries private candidates and bounded cloud controls only to the other seat',async()=>{
 rows.clear();const host=await (await POST(request({action:'create',name:'Host'}))).json(),guest=await (await POST(request({action:'join',code:host.code,name:'Guest'}))).json();
 const post=(seat,fields)=>POST(request({code:host.code,...fields},{Authorization:'Bearer '+seat.token}));
 for(const seat of [host,guest])assert.equal((await post(seat,{action:'select',fighter:seat.role==='host'?'6-bit':'9-bit',ready:true})).status,200);
 const candidate={candidate:'candidate:1 1 UDP 2122260223 192.0.2.1 5000 typ host',sdpMid:'0',sdpMLineIndex:0,usernameFragment:null};
 assert.equal((await post(host,{action:'candidates',generation:1,candidates:[candidate]})).status,200);
 const state=await (await post(guest,{action:'poll'})).json();assert.deepEqual(state.candidates,[candidate]);
 const publicList=await (await GET(new Request(url))).text();assert.ok(!publicList.includes('192.0.2.1'));
 const wire={scope:'system-clash-online-v1',version:'system-clash-20261009-8',seq:1,matchId:1,payload:{type:'hello',version:'system-clash-20261009-8',room:host.code,role:'host'}};
 assert.equal((await post(host,{action:'relay',version:wire.version,ack:0,packets:[{lane:'control',data:JSON.stringify(wire)}]})).status,200);
 const relayed=await (await post(guest,{action:'relay',version:wire.version,ack:0,packets:[]})).json();assert.equal(relayed.packets.length,1);assert.equal(JSON.parse(relayed.packets[0].data).payload.role,'host');
 assert.equal((await POST(request({action:'relay',code:host.code,version:wire.version,ack:0,packets:[],token:guest.token}))).status,401);
 await post(host,{action:'leave'});
});

async function readyTurnRoom(){
 rows.clear();const host=await (await POST(request({action:'create',name:'Host'}))).json(),guest=await (await POST(request({action:'join',code:host.code,name:'Guest'}))).json();
 for(const seat of [host,guest])assert.equal((await POST(request({action:'select',code:host.code,fighter:seat.role==='host'?'6-bit':'9-bit',ready:true},{Authorization:'Bearer '+seat.token}))).status,200);
 return {host,guest};
}
async function withTurnProvider(config,fetcher,run){
 const oldFetch=globalThis.fetch,oldKey=process.env.SYSTEM_CLASH_TURN_KEY_ID,oldToken=process.env.SYSTEM_CLASH_TURN_API_TOKEN;
 if(config){process.env.SYSTEM_CLASH_TURN_KEY_ID='fake-route-key';process.env.SYSTEM_CLASH_TURN_API_TOKEN='fake-route-provider-token';}else{delete process.env.SYSTEM_CLASH_TURN_KEY_ID;delete process.env.SYSTEM_CLASH_TURN_API_TOKEN;}
 globalThis.fetch=fetcher;
 try{await run();}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.SYSTEM_CLASH_TURN_KEY_ID;else process.env.SYSTEM_CLASH_TURN_KEY_ID=oldKey;if(oldToken===undefined)delete process.env.SYSTEM_CLASH_TURN_API_TOKEN;else process.env.SYSTEM_CLASH_TURN_API_TOKEN=oldToken;}
}
test('ice credentials authenticate the existing ready seat before any provider request',async()=>{
 let calls=0;await withTurnProvider(true,async()=>{calls++;return Response.json({iceServers:[{urls:['turn:turn.cloudflare.com:3478?transport=udp'],username:'short-route-user',credential:'short-route-password'}],private:'fake-route-provider-token'});},async()=>{
  const {host,guest}=await readyTurnRoom(),ice={action:'ice',code:host.code};
  assert.equal((await POST(request({...ice,token:host.token}))).status,401);assert.equal((await POST(request(ice,{Authorization:'Bearer forged'}))).status,401);assert.equal(calls,0);
  for(const seat of [host,guest]){const response=await POST(request(ice,{Authorization:'Bearer '+seat.token}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{iceServers:[{urls:['turn:turn.cloudflare.com:3478?transport=udp'],username:'short-route-user',credential:'short-route-password'}],realtimeRelay:true});}
  assert.equal(calls,2);const list=await (await GET(new Request(url))).text();assert.ok(!/short-route-user|short-route-password|fake-route-key|fake-route-provider-token/.test(list));
  assert.ok(!JSON.stringify([...rows.values()]).includes('short-route-password'));await POST(request({action:'leave',code:host.code},{Authorization:'Bearer '+host.token}));
 });
});
test('ice credentials require a guest and both ready seats without touching the provider',async()=>{
 let calls=0;await withTurnProvider(true,async()=>{calls++;throw new Error('must not request');},async()=>{
  rows.clear();const host=await (await POST(request({action:'create',name:'Host'}))).json(),ice={action:'ice',code:host.code},headers={Authorization:'Bearer '+host.token};
  assert.equal((await POST(request(ice,headers))).status,409);
  const guest=await (await POST(request({action:'join',code:host.code,name:'Guest'}))).json();
  assert.equal((await POST(request(ice,headers))).status,409);
  await POST(request({action:'select',code:host.code,fighter:'6-bit',ready:true},headers));assert.equal((await POST(request(ice,headers))).status,409);
  await POST(request({action:'select',code:host.code,fighter:'9-bit',ready:true},{Authorization:'Bearer '+guest.token}));
  await POST(request({action:'select',code:host.code,fighter:'6-bit',ready:false},headers));assert.equal((await POST(request(ice,{Authorization:'Bearer '+guest.token}))).status,409);assert.equal(calls,0);
  await POST(request({action:'leave',code:host.code},headers));
 });
});
test('dormant ice configuration returns empty settings to ready players and never calls external services',async()=>{
 let calls=0;await withTurnProvider(false,async()=>{calls++;throw new Error('unreachable');},async()=>{
  const {host}=await readyTurnRoom();const response=await POST(request({action:'ice',code:host.code},{Authorization:'Bearer '+host.token}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{iceServers:[],realtimeRelay:false});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls,0);await POST(request({action:'leave',code:host.code},{Authorization:'Bearer '+host.token}));
 });
});
test('ice requests retain origin, MIME and rate guards before provider access',async()=>{
 let calls=0;await withTurnProvider(true,async()=>{calls++;throw new Error('unreachable');},async()=>{
  const {host}=await readyTurnRoom(),ice={action:'ice',code:host.code},headers={Authorization:'Bearer '+host.token};
  const before=operations;assert.equal((await POST(request(ice,{...headers,Origin:'https://foreign.example'}))).status,403);assert.equal((await POST(request(ice,{...headers,'Sec-Fetch-Site':'cross-site'}))).status,403);assert.equal((await POST(request(ice,{...headers,'Content-Type':'text/plain'}))).status,415);assert.equal(operations,before);
  denied=true;try{assert.equal((await POST(request(ice,headers))).status,429);}finally{denied=false;}
  assert.equal(calls,0);await POST(request({action:'leave',code:host.code},headers));
 });
});
test('ice provider failure returns a noncached generic error without configuration or response secrets',async()=>{
 await withTurnProvider(true,async()=>new Response('fake-route-key fake-route-provider-token private-provider-dump',{status:503}),async()=>{
  const {host}=await readyTurnRoom();const response=await POST(request({action:'ice',code:host.code},{Authorization:'Bearer '+host.token}));assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');const text=await response.text();assert.ok(!/fake-route-key|fake-route-provider-token|private-provider-dump/.test(text));await POST(request({action:'leave',code:host.code},{Authorization:'Bearer '+host.token}));
 });
});
