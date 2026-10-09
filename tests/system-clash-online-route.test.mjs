import test from 'node:test';import assert from 'node:assert/strict';import Module,{createRequire} from 'node:module';import fs from 'node:fs';import ts from 'typescript';
const require=createRequire(import.meta.url),originalLoad=Module._load;
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const rows=new Map();let denied=false,unavailable=false,operations=0;
const store={async allow(){operations++;if(unavailable)throw new Error('offline');return !denied;},async read(code){return rows.get(code)??null;},async cas(code,old,next){if((rows.get(code)??null)!==old)return false;if(next===null)rows.delete(code);else rows.set(code,next);return true;},async list(){return [...rows.values()];}};
Module._load=function(id,parent,isMain){
 if(id==='@/lib/system-clash-online')return require('../src/lib/system-clash-online.ts');
 if(id==='@/lib/system-clash-online-store')return {onlineRoomStore:()=>store};
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
