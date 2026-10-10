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
const captureDiagnostic=logs=>(tag,text)=>{assert.equal(tag,'System Clash TURN validation failed');assert.equal(typeof text,'string');logs.push([tag,JSON.parse(text)]);};
const diagnosticDetails=record=>Object.fromEntries(Object.entries(record).filter(([key])=>key!=='providerSummary'));
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
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));
 await assert.rejects(()=>invoke({env,fetch:async()=>response()}),error=>{
  assert.equal(error.constructor,Error);assert.match(error.message,/Realtime relay.*unavailable/);assert.deepEqual(Object.keys(error),[]);return unavailable(error);
 });
 assert.equal(logs.length,1,'One sanitized diagnostic is required for the rejected attempt');
 assert.equal(logs[0][0],'System Clash TURN validation failed');const record=logs[0][1];assert.equal(record.stage,stage);assert.equal(record.category,category);const details=diagnosticDetails(record);
 for(const [key,value]of Object.entries(record)){assert.ok(['stage','category','responseBytes','serverCount','serverIndex','urlCount','urlIndex','valueLength','status','scheme','transport','port','host','blockedPort53Count','providerSummary'].includes(key),'Unknown diagnostic field '+key);if(key==='providerSummary')assertSafeProviderSummary(value);else if(key==='scheme')assert.ok(['stun','turn','turns','other'].includes(value));else if(key==='transport')assert.ok(['udp','tcp','missing','other'].includes(value));else if(key==='host')assert.ok(['stun','turn','other'].includes(value));else if(!['stage','category'].includes(key))assert.ok(Number.isSafeInteger(value)&&value>=0,'Diagnostic details must be nonnegative integers');}
 if(label==='unsupported endpoint')assert.deepEqual(details,{stage:'urls',category:'endpoint_unsupported',serverIndex:0,urlIndex:0,scheme:'turn',transport:'udp',port:3478,host:'other'});
 if(label==='URL count')assert.deepEqual(details,{stage:'urls',category:'count_invalid',serverIndex:0,urlCount:9,blockedPort53Count:0});
 const printed=JSON.stringify(logs);for(const marker of privateDiagnosticMarkers)assert.ok(!printed.includes(marker),'Private provider data must not be logged');assert.ok(!printed.includes('turn.cloudflare.com'));assert.ok(!printed.includes('https://'));assert.ok(!printed.includes('Error:'));
});
test('valid TURN credentials emit no validation diagnostic',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));const result=await invoke({env,fetch:async()=>Response.json(diagnosticProvider(),{status:201})});assert.equal(result.realtimeRelay,true);assert.equal(logs.length,0);
});

test('unsupported Cloudflare endpoint logs only fixed transport and numeric port metadata',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:['turns:turn.cloudflare.com:9999?transport=tcp']}]})}),unavailable);
 assert.deepEqual(logs.map(([tag,record])=>[tag,diagnosticDetails(record)]), [['System Clash TURN validation failed',{stage:'urls',category:'endpoint_unsupported',serverIndex:0,urlIndex:0,scheme:'turns',transport:'tcp',port:9999,host:'turn'}]]);
});
test('rejected URL count logs only the number of browser-blocked port53 endpoints',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:[...Array(8).fill('turn:turn.cloudflare.com:3478?transport=udp'),'turn:turn.cloudflare.com:53?transport=udp']}]})}),unavailable);
 assert.deepEqual(logs.map(([tag,record])=>[tag,diagnosticDetails(record)]),[['System Clash TURN validation failed',{stage:'urls',category:'count_invalid',serverIndex:0,urlCount:9,blockedPort53Count:1}]]);
});


test('endpoint metadata maps private scheme transport host and query to literal categories',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));const privateUrl='private-scheme:private-user:private-password@private-host.invalid:9999?transport=private-transport&private-query=private-value';
 await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:[privateUrl]}]})}),unavailable);
 assert.deepEqual(logs.map(([tag,record])=>[tag,diagnosticDetails(record)]),[['System Clash TURN validation failed',{stage:'urls',category:'endpoint_unsupported',serverIndex:0,urlIndex:0,scheme:'other',transport:'other',port:9999,host:'other'}]]);
 const printed=JSON.stringify(logs);for(const marker of ['private-scheme','private-user','private-password','private-host','private-transport','private-query','private-value',privateUrl])assert.ok(!printed.includes(marker));
});
test('endpoint metadata bounds ports to the valid network port range',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:['turn:turn.cloudflare.com:65536?transport=udp']}]})}),unavailable);
 assert.deepEqual(logs.map(([tag,record])=>[tag,diagnosticDetails(record)]),[['System Clash TURN validation failed',{stage:'urls',category:'endpoint_unsupported',serverIndex:0,urlIndex:0,scheme:'turn',transport:'udp',port:0,host:'turn'}]]);
});
function assertSafeProviderSummary(value){
 assert.deepEqual(Object.keys(value).sort(),['serverCount','servers']);assert.ok(Number.isSafeInteger(value.serverCount)&&value.serverCount>=0);assert.ok(value.servers.length<=8);
 for(const server of value.servers){
  assert.deepEqual(Object.keys(server).sort(),['credential','endpoints','serverIndex','urlCount','username']);assert.ok(Number.isSafeInteger(server.serverIndex)&&server.serverIndex>=0&&server.serverIndex<8);assert.ok(Number.isSafeInteger(server.urlCount)&&server.urlCount>=0);assert.ok(server.endpoints.length<=8);
  for(const endpoint of server.endpoints){assert.deepEqual(Object.keys(endpoint).sort(),['host','port','scheme','transport']);assert.ok(['stun','turn','turns','other'].includes(endpoint.scheme));assert.ok(['stun','turn','other'].includes(endpoint.host));assert.ok(['udp','tcp','missing','other'].includes(endpoint.transport));assert.ok(Number.isSafeInteger(endpoint.port)&&endpoint.port>=0&&endpoint.port<=65535);}
  for(const field of [server.username,server.credential]){assert.deepEqual(Object.keys(field).sort(),['includesApiToken','includesKeyId','length','type']);assert.ok(['string','missing','null','array','object','number','boolean','other'].includes(field.type));assert.ok(Number.isSafeInteger(field.length)&&field.length>=0);assert.equal(typeof field.includesKeyId,'boolean');assert.equal(typeof field.includesApiToken,'boolean');}
 }
}
test('exact Cloudflare STUN443 extras are discarded while STUN3478 and relay settings remain',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));const value=provider();value.iceServers[0].urls.push('stun:stun.cloudflare.com:443','stun:turn.cloudflare.com:443');
 const result=await invoke({env,fetch:async()=>Response.json(value,{status:201})});assert.deepEqual(result.iceServers[0],{urls:['stun:stun.cloudflare.com:3478']});assert.deepEqual(result.iceServers[1],{urls:provider().iceServers[1].urls.filter(url=>!url.includes(':53?')),username:'fake-short-username',credential:'fake-short-password'});assert.equal(result.realtimeRelay,true);assert.equal(logs.length,0);
});
test('STUN443 filtering preserves valid TURN and credentials in the same provider entry',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));const server={...diagnosticProvider().iceServers[0],urls:['stun:stun.cloudflare.com:443','turn:turn.cloudflare.com:3478?transport=udp','stun:turn.cloudflare.com:443']};
 const result=await invoke({env,fetch:async()=>Response.json({iceServers:[server]})});assert.deepEqual(result,{iceServers:[{urls:['turn:turn.cloudflare.com:3478?transport=udp'],username:server.username,credential:server.credential}],realtimeRelay:true});assert.equal(logs.length,0);
});
test('STUN443-only entries cannot enable relay and their scalar URLs are summarized safely',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{urls:'stun:stun.cloudflare.com:443'},{urls:'stun:turn.cloudflare.com:443'}]})}),unavailable);
 assert.equal(logs.length,1);assert.equal(logs[0][1].category,'relay_missing');assertSafeProviderSummary(logs[0][1].providerSummary);assert.deepEqual(logs[0][1].providerSummary.servers.map(server=>server.endpoints),[[{scheme:'stun',transport:'missing',port:443,host:'stun'}],[{scheme:'stun',transport:'missing',port:443,host:'turn'}]]);
});
test('URL bounds apply before filtering STUN443 extras',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:[...Array(8).fill('stun:stun.cloudflare.com:443'),'turn:turn.cloudflare.com:3478?transport=udp']}]})}),unavailable);assert.equal(logs[0][1].category,'count_invalid');assert.equal(logs[0][1].urlCount,9);assertSafeProviderSummary(logs[0][1].providerSummary);assert.equal(logs[0][1].providerSummary.servers[0].endpoints.length,8);
});
test('STUN443 filtering does not allow unknown hosts schemes ports or query variants',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));for(const url of ['stun:untrusted.invalid:443','stun:stun.cloudflare.com.untrusted.invalid:443','https://stun.cloudflare.com:443','STUN:stun.cloudflare.com:443','stun:STUN.cloudflare.com:443','stun:stun.cloudflare.com:0443','stun:turn.cloudflare.com:444','stun:stun.cloudflare.com:443?transport=udp','stun:turn.cloudflare.com:443?private-query=private-value','stun:stun.cloudflare.com:443#private-fragment'])await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{...diagnosticProvider().iceServers[0],urls:[url,'turn:turn.cloudflare.com:3478?transport=udp']}]})}),unavailable);assert.equal(logs.length,10);for(const [,record]of logs){assert.equal(record.category,'endpoint_unsupported');assertSafeProviderSummary(record.providerSummary);}
});
test('remaining validation rejection summarizes all bounded endpoint and field guards without values',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));const username='private-user-'+env.SYSTEM_CLASH_TURN_KEY_ID,credential='private-password-'+env.SYSTEM_CLASH_TURN_API_TOKEN,privateUrl='private-scheme:private-user:private-password@private-host.invalid:65536?transport=private-transport&private-query=private-value';
 await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{urls:['stun:stun.cloudflare.com:443','stun:turn.cloudflare.com:443']},{urls:['turn:turn.cloudflare.com:3478?transport=udp',privateUrl],username,credential}],private:'private-body-marker'})}),error=>{assert.equal(error.constructor,Error);assert.deepEqual(Object.keys(error),[]);return unavailable(error);});
 assert.equal(logs.length,1);const summary=logs[0][1].providerSummary;assertSafeProviderSummary(summary);assert.equal(summary.serverCount,2);assert.deepEqual(summary.servers[0].endpoints,[{scheme:'stun',transport:'missing',port:443,host:'stun'},{scheme:'stun',transport:'missing',port:443,host:'turn'}]);assert.deepEqual(summary.servers[1].endpoints,[{scheme:'turn',transport:'udp',port:3478,host:'turn'},{scheme:'other',transport:'other',port:0,host:'other'}]);assert.deepEqual(summary.servers[1].username,{type:'string',length:username.length,includesKeyId:true,includesApiToken:false});assert.deepEqual(summary.servers[1].credential,{type:'string',length:credential.length,includesKeyId:false,includesApiToken:true});
 const printed=JSON.stringify(logs);for(const marker of [username,credential,privateUrl,'private-scheme','private-user','private-password','private-host','private-transport','private-query','private-value','private-body-marker',...privateDiagnosticMarkers])assert.ok(!printed.includes(marker));
});
test('failure summaries cap server and URL rows and map invalid values to fixed types',async t=>{
 const logs=[];t.mock.method(console,'error',captureDiagnostic(logs));const fields=[undefined,null,['private-array'],{private:'private-object'},123,true,'private-string'];const servers=fields.map(username=>({urls:Array(9).fill({private:'private-url'}),username,credential:{private:'private-credential'}}));servers.push('private-invalid-server',servers[0]);
 await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:servers})}),unavailable);assert.equal(logs.length,1);const summary=logs[0][1].providerSummary;assertSafeProviderSummary(summary);assert.equal(summary.serverCount,9);assert.equal(summary.servers.length,8);assert.deepEqual(summary.servers.slice(0,7).map(server=>server.username.type),['missing','null','array','object','number','boolean','string']);assert.equal(summary.servers[0].urlCount,9);assert.equal(summary.servers[0].endpoints.length,8);assert.deepEqual(summary.servers[0].endpoints[0],{scheme:'other',transport:'missing',port:0,host:'other'});assert.equal(summary.servers[7].urlCount,0);const printed=JSON.stringify(logs);for(const marker of ['private-array','private-object','private-url','private-credential','private-string','private-invalid-server'])assert.ok(!printed.includes(marker));
});
test('failure diagnostic emits parseable JSON containing only sanitized nested metadata',async t=>{
 const logs=[];t.mock.method(console,'error',(tag,text)=>logs.push({tag,text}));const privateUrl='turn:private-host.invalid:3478?transport=private-transport&private-query=private-value';
 await assert.rejects(()=>invoke({env,fetch:async()=>Response.json({iceServers:[{urls:[privateUrl],username:'private-user-'+env.SYSTEM_CLASH_TURN_KEY_ID,credential:'private-password-'+env.SYSTEM_CLASH_TURN_API_TOKEN}],private:'private-body-marker'})}),error=>{assert.equal(error.constructor,Error);assert.deepEqual(Object.keys(error),[]);return unavailable(error);});
 assert.equal(logs.length,1);assert.equal(logs[0].tag,'System Clash TURN validation failed');assert.equal(typeof logs[0].text,'string');const record=JSON.parse(logs[0].text);assert.equal(record.category,'endpoint_unsupported');assertSafeProviderSummary(record.providerSummary);assert.deepEqual(record.providerSummary.servers[0].endpoints,[{scheme:'turn',transport:'other',port:3478,host:'other'}]);assert.equal(record.providerSummary.servers[0].username.includesKeyId,true);assert.equal(record.providerSummary.servers[0].credential.includesApiToken,true);
 for(const marker of [privateUrl,'private-host','private-transport','private-query','private-value','private-user','private-password','private-body-marker',...privateDiagnosticMarkers,'[Object]'])assert.ok(!logs[0].text.includes(marker));
});
