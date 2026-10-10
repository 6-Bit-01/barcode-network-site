import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url),originalLoad=Module._load;
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
Module._load=function(id,parent,isMain){if(id==='server-only')return {};return originalLoad.call(this,id,parent,isMain);};
let createOnlineTurnCredentials;
try{({createOnlineTurnCredentials}=require('../src/lib/system-clash-turn.ts'));}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
finally{Module._load=originalLoad;}
const env={SYSTEM_CLASH_TURN_KEY_ID:'fake-key-id',SYSTEM_CLASH_TURN_API_TOKEN:'fake-long-term-provider-token'};
const provider=()=>({iceServers:[{urls:['stun:stun.cloudflare.com:3478']},{urls:['turn:turn.cloudflare.com:3478?transport=udp','turn:turn.cloudflare.com:443?transport=udp','turn:turn.cloudflare.com:3478?transport=tcp','turn:turn.cloudflare.com:80?transport=tcp','turns:turn.cloudflare.com:5349?transport=tcp','turns:turn.cloudflare.com:443?transport=tcp','turn:turn.cloudflare.com:53?transport=udp'],username:'fake-short-username',credential:'fake-short-password',providerOnly:'must-not-escape'}],providerSecret:'must-not-escape'});
const invoke=options=>{assert.equal(typeof createOnlineTurnCredentials,'function','Dormant TURN credential helper must be available');return createOnlineTurnCredentials(options);};
const unavailable=error=>{assert.ok(error instanceof Error);assert.ok(!/fake-key-id|fake-long-term-provider-token|providerSecret|must-not-escape/.test(error.message));return true;};
test('missing TURN configuration returns disabled settings without any provider request',async()=>{
 let calls=0;assert.deepEqual(await invoke({env:{},fetch:async()=>{calls++;throw new Error('unreachable');}}),{iceServers:[],realtimeRelay:false});assert.equal(calls,0);
});
test('partial and unsafe TURN configuration fail closed before provider access',async()=>{
 let calls=0;for(const configured of [{SYSTEM_CLASH_TURN_KEY_ID:env.SYSTEM_CLASH_TURN_KEY_ID},{SYSTEM_CLASH_TURN_API_TOKEN:env.SYSTEM_CLASH_TURN_API_TOKEN},{...env,SYSTEM_CLASH_TURN_KEY_ID:'../external/key'},{...env,SYSTEM_CLASH_TURN_API_TOKEN:'token\r\nInjected: value'}])await assert.rejects(()=>invoke({env:configured,fetch:async()=>{calls++;throw new Error('unreachable');}}),unavailable);
 assert.equal(calls,0);
});
test('configured credentials use fixed Cloudflare endpoint, server Bearer token and room-length TTL',async()=>{
 const calls=[];const result=await invoke({env,fetch:async(url,options)=>{calls.push({url,options});return Response.json(provider(),{status:201});}});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://rtc.live.cloudflare.com/v1/turn/keys/fake-key-id/credentials/generate-ice-servers');
 const request=calls[0].options;assert.equal(request.method,'POST');assert.equal(request.headers.Authorization,'Bearer fake-long-term-provider-token');assert.equal(request.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(request.body),{ttl:1260});assert.equal(request.redirect,'error');assert.equal(request.cache,'no-store');assert.ok(request.signal instanceof AbortSignal);
 assert.deepEqual(result,{iceServers:[{urls:['stun:stun.cloudflare.com:3478']},{urls:['turn:turn.cloudflare.com:3478?transport=udp','turn:turn.cloudflare.com:443?transport=udp','turn:turn.cloudflare.com:3478?transport=tcp','turn:turn.cloudflare.com:80?transport=tcp','turns:turn.cloudflare.com:5349?transport=tcp','turns:turn.cloudflare.com:443?transport=tcp'],username:'fake-short-username',credential:'fake-short-password'}],realtimeRelay:true});
 assert.ok(!JSON.stringify(result).includes('must-not-escape'));assert.ok(!JSON.stringify(result).includes(env.SYSTEM_CLASH_TURN_API_TOKEN));
});
test('single URL forms normalize while browser-blocked port53 is excluded',async()=>{
 const result=await invoke({env,fetch:async()=>Response.json({iceServers:[{urls:'stun:stun.cloudflare.com:3478'},{urls:'turns:turn.cloudflare.com:443?transport=tcp',username:'short-user',credential:'short-password'},{urls:'turn:turn.cloudflare.com:53?transport=tcp',username:'short-user',credential:'short-password'}]})});
 assert.deepEqual(result,{iceServers:[{urls:['stun:stun.cloudflare.com:3478']},{urls:['turns:turn.cloudflare.com:443?transport=tcp'],username:'short-user',credential:'short-password'}],realtimeRelay:true});
});
test('provider response accepts only documented Cloudflare endpoints and usable relay credentials',async()=>{
 const bad=[{}, {iceServers:[]}, {iceServers:Array(9).fill(provider().iceServers[0])}, {iceServers:[{urls:Array(9).fill('stun:stun.cloudflare.com:3478')}]}, {iceServers:[{urls:'turn:attacker.example:3478?transport=udp',username:'u',credential:'p'}]}, {iceServers:[{urls:'turn:turn.cloudflare.com.attacker.example:3478?transport=udp',username:'u',credential:'p'}]}, {iceServers:[{urls:'https://turn.cloudflare.com:443'}]}, {iceServers:[{urls:'turns:turn.cloudflare.com:443?transport=udp',username:'u',credential:'p'}]}, {iceServers:[{urls:'turn:turn.cloudflare.com:9999?transport=udp',username:'u',credential:'p'}]}, {iceServers:[{urls:'turn:turn.cloudflare.com:3478?transport=udp'}]}, {iceServers:[{urls:'turn:turn.cloudflare.com:3478?transport=udp',username:'u',credential:'p'.repeat(513)}]}, {iceServers:[{urls:'turn:turn.cloudflare.com:3478?transport=udp',username:'u\nleak',credential:'p'}]}, {iceServers:[{urls:'turn:turn.cloudflare.com:3478?transport=udp',username:'u',credential:env.SYSTEM_CLASH_TURN_API_TOKEN}]}, {iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]}];
 for(const value of bad)await assert.rejects(()=>invoke({env,fetch:async()=>Response.json(value)}),unavailable);
});
test('oversized streamed provider response is cancelled at the byte bound',async()=>{
 let cancelled=false,pulled=0;
 const body=new ReadableStream({pull(controller){pulled++;controller.enqueue(new Uint8Array(10000).fill(32));if(pulled===10)controller.close();},cancel(){cancelled=true;}},{highWaterMark:0});
 await assert.rejects(()=>invoke({env,fetch:async()=>new Response(body)}),unavailable);assert.equal(cancelled,true);assert.equal(pulled,2);
});
test('declared oversized and broken provider responses never expose their body or server secrets',async()=>{
 for(const response of [new Response('must-not-escape',{status:503}),new Response('must-not-escape'),new Response('{}',{headers:{'Content-Length':'16385'}})])await assert.rejects(()=>invoke({env,fetch:async()=>response}),unavailable);
 await assert.rejects(()=>invoke({env,fetch:async()=>{throw new Error(env.SYSTEM_CLASH_TURN_API_TOKEN);}}),unavailable);
});
test('provider calls use a five-second abort deadline and discard abort details',async t=>{
 const controller=new AbortController();let deadline;
 t.mock.method(AbortSignal,'timeout',ms=>{deadline=ms;return controller.signal;});
 const result=invoke({env,fetch:async(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error(env.SYSTEM_CLASH_TURN_API_TOKEN)),{once:true}))});
 controller.abort();await assert.rejects(()=>result,unavailable);assert.equal(deadline,5000);
});

test('abort after response headers releases the body reader and never exposes provider read errors',async t=>{
 const controller=new AbortController();let streamController;
 const body=new ReadableStream({start(value){streamController=value;}});
 t.mock.method(AbortSignal,'timeout',()=>controller.signal);
 const result=invoke({env,fetch:async(_url,options)=>{options.signal.addEventListener('abort',()=>streamController.error(new Error('must-not-escape '+env.SYSTEM_CLASH_TURN_API_TOKEN)),{once:true});return new Response(body);}});
 await Promise.resolve();await Promise.resolve();controller.abort();await assert.rejects(()=>result,unavailable);assert.equal(body.locked,false);
});

// The provider boundary must identify a rejection without logging provider data.
const privateDiagnosticMarkers=['fake-key-id','fake-long-term-provider-token','temporary-private-user','temporary-private-password','private-response-marker','turn:untrusted.invalid:3478?transport=udp'];
const diagnosticProvider=()=>({iceServers:[{urls:['turn:turn.cloudflare.com:3478?transport=udp'],username:'temporary-private-user',credential:'temporary-private-password'}],private:'private-response-marker'});
const diagnosticCases=[
 ['missing body','payload','body_missing',()=>new Response(null,{status:201})],
 ['declared payload bound','payload','size_exceeded',()=>new Response('private-response-marker',{status:201,headers:{'Content-Length':'16385'}})],
 ['streamed payload bound','payload','size_exceeded',()=>new Response(' '.repeat(16385))],
 ['body reader failure','payload','read_failed',()=>new Response(new ReadableStream({start(controller){controller.error(new Error('private-response-marker '+env.SYSTEM_CLASH_TURN_API_TOKEN));}}))],
 ['invalid JSON','payload','json_invalid',()=>new Response('{private-response-marker')],
 ['missing ICE array','schema','ice_servers_invalid',()=>Response.json({private:'private-response-marker'})],
 ['empty ICE array','schema','server_count_invalid',()=>Response.json({iceServers:[]})],
 ['oversized ICE array','schema','server_count_invalid',()=>Response.json({iceServers:Array(9).fill(diagnosticProvider().iceServers[0])})],
 ['invalid server','schema','server_invalid',()=>Response.json({iceServers:['private-response-marker']})],
 ['URL shape','urls','shape_invalid',()=>Response.json({iceServers:[{urls:{private:'private-response-marker'}}]})],
 ['URL count','urls','count_invalid',()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:Array(9).fill('turn:turn.cloudflare.com:3478?transport=udp')}]})],
 ['invalid URL value','urls','value_invalid',()=>Response.json({iceServers:[{urls:[{private:'private-response-marker'}]}]})],
 ['unsupported endpoint','urls','endpoint_unsupported',()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:['turn:untrusted.invalid:3478?transport=udp']}]})],
 ['invalid username','username','value_invalid',()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],username:'temporary-private-user\n'}]})],
 ['invalid credential','credential','value_invalid',()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],credential:'temporary-private-password'.repeat(30)}]})],
 ['username provider-token match','username','long_term_token_match',()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],username:env.SYSTEM_CLASH_TURN_API_TOKEN}]})],
 ['credential provider-token match','credential','long_term_token_match',()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],credential:env.SYSTEM_CLASH_TURN_API_TOKEN}]})],
 ['username key-ID match','username','key_id_match',()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],username:'prefix-'+env.SYSTEM_CLASH_TURN_KEY_ID+'-suffix'}]})],
 ['credential key-ID match','credential','key_id_match',()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],credential:'prefix-'+env.SYSTEM_CLASH_TURN_KEY_ID+'-suffix'}]})],
 ['no usable relay','schema','relay_missing',()=>Response.json({iceServers:[{urls:['stun:stun.cloudflare.com:3478']}]})],
 ['provider HTTP failure','provider','status_unavailable',()=>new Response('private-response-marker',{status:401})],
 ['provider request failure','provider','request_failed',()=>{throw new Error('private-response-marker '+env.SYSTEM_CLASH_TURN_API_TOKEN);}],
];
for(const [label,stage,category,response] of diagnosticCases)test('server-only TURN diagnostic classifies '+label+' without revealing values',async t=>{
 const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));
 await assert.rejects(()=>invoke({env,fetch:async()=>response()}),error=>{
  assert.equal(error.constructor,Error);assert.match(error.message,/Realtime relay.*unavailable/);assert.deepEqual(Object.keys(error),[]);return unavailable(error);
 });
 assert.equal(logs.length,1,'One sanitized diagnostic is required for the rejected attempt');
 assert.equal(logs[0][0],'System Clash TURN validation failed');const record=logs[0][1];assert.equal(record.stage,stage);assert.equal(record.category,category);
 for(const [key,value]of Object.entries(record)){assert.ok(['stage','category','responseBytes','serverCount','serverIndex','urlCount','urlIndex','valueLength','status','scheme','transport','port','cloudflareHost','blockedPort53Count'].includes(key),'Unknown diagnostic field '+key);if(key==='scheme')assert.ok(['stun','turn','turns','other'].includes(value));else if(key==='transport')assert.ok(['udp','tcp','missing','other'].includes(value));else if(key==='cloudflareHost')assert.equal(typeof value,'boolean');else if(!['stage','category'].includes(key))assert.ok(Number.isSafeInteger(value)&&value>=0,'Diagnostic details must be nonnegative integers');}
 if(label==='unsupported endpoint')assert.deepEqual(record,{stage:'urls',category:'endpoint_unsupported',serverIndex:0,urlIndex:0,scheme:'turn',transport:'udp',port:3478,cloudflareHost:false});
 if(label==='URL count')assert.deepEqual(record,{stage:'urls',category:'count_invalid',serverIndex:0,urlCount:9,blockedPort53Count:0});
 const printed=JSON.stringify(logs);for(const marker of privateDiagnosticMarkers)assert.ok(!printed.includes(marker),'Private provider data must not be logged');assert.ok(!printed.includes('turn.cloudflare.com'));assert.ok(!printed.includes('https://'));assert.ok(!printed.includes('Error:'));
});
test('valid TURN credentials emit no validation diagnostic',async t=>{
 const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));const result=await invoke({env,fetch:async()=>Response.json(diagnosticProvider(),{status:201})});assert.equal(result.realtimeRelay,true);assert.equal(logs.length,0);
});

test('unsupported Cloudflare endpoint logs only fixed transport and numeric port metadata',async t=>{
 const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:['turns:turn.cloudflare.com:9999?transport=tcp']}]})}),unavailable);
 assert.deepEqual(logs, [['System Clash TURN validation failed',{stage:'urls',category:'endpoint_unsupported',serverIndex:0,urlIndex:0,scheme:'turns',transport:'tcp',port:9999,cloudflareHost:true}]]);
});
test('rejected URL count logs only the number of browser-blocked port53 endpoints',async t=>{
 const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:[...Array(8).fill('turn:turn.cloudflare.com:3478?transport=udp'),'turn:turn.cloudflare.com:53?transport=udp']}]})}),unavailable);
 assert.deepEqual(logs,[['System Clash TURN validation failed',{stage:'urls',category:'count_invalid',serverIndex:0,urlCount:9,blockedPort53Count:1}]]);
});


test('endpoint metadata maps private scheme transport host and query to literal categories',async t=>{
 const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));const privateUrl='private-scheme:private-user:private-password@private-host.invalid:9999?transport=private-transport&private-query=private-value';
 await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:[privateUrl]}]})}),unavailable);
 assert.deepEqual(logs,[['System Clash TURN validation failed',{stage:'urls',category:'endpoint_unsupported',serverIndex:0,urlIndex:0,scheme:'other',transport:'other',port:9999,cloudflareHost:false}]]);
 const printed=JSON.stringify(logs);for(const marker of ['private-scheme','private-user','private-password','private-host','private-transport','private-query','private-value',privateUrl])assert.ok(!printed.includes(marker));
});
test('endpoint metadata bounds ports to the valid network port range',async t=>{
 const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:['turn:turn.cloudflare.com:65536?transport=udp']}]})}),unavailable);
 assert.deepEqual(logs,[['System Clash TURN validation failed',{stage:'urls',category:'endpoint_unsupported',serverIndex:0,urlIndex:0,scheme:'turn',transport:'udp',port:0,cloudflareHost:true}]]);
});
