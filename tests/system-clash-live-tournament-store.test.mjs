import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url),original=Module._load;
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const rows=new Map(),expires=new Map(),calls=[];
class Redis {
 async get(key){return rows.get(key)??null;}
 async mget(...keys){return keys.map(key=>rows.get(key)??null);}
 async eval(script,keys,args){calls.push({script,keys,args});if(keys.length===1){const n=Number(rows.get(keys[0])??0)+1;rows.set(keys[0],String(n));return n;}const [eventKey,indexKey,claimKey]=keys,[old,next,ttl,code,now,,indexTTL,claim]=args;
  if((rows.get(eventKey)??'')!==old)return 0;if(claim&&rows.has(claimKey)&&rows.get(claimKey)!==claim)return 0;
  const event=JSON.parse(next),entries=JSON.parse(rows.get(indexKey)??'[]').filter(e=>e.code!==code&&e.expiresAt>now);
  if(!['complete','cancelled'].includes(event.status)){if(entries.length>=30){if(old==='')return 0;}else entries.push({code,expiresAt:event.expiresAt,createdAt:event.createdAt});}
  rows.set(eventKey,next);expires.set(eventKey,Number(now)+Number(ttl)*1000);if(claim){rows.set(claimKey,claim);expires.set(claimKey,Number(now)+Number(ttl)*1000);}rows.set(indexKey,JSON.stringify(entries));expires.set(indexKey,Number(now)+Number(indexTTL)*1000);return 1;
 }
}
Module._load=function(id,parent,main){if(id==='@upstash/redis')return{Redis};return original.call(this,id,parent,main);};
const {systemClashTournamentStore,TOURNAMENT_CAS}=require('../src/lib/system-clash-tournament-store.ts');Module._load=original;
const prefix='barcode:system-clash:online:v1:tournament:';
process.env.UPSTASH_REDIS_REST_URL='https://private-adapter.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='private-adapter-fixture';
function event(code,now,status='running'){return JSON.stringify({version:1,code,status,createdAt:now,expiresAt:now+86400000});}
test('adapter retains event and match claim in the same CAS, rejects races and never extends fixed event expiry',async()=>{rows.clear();calls.length=0;const store=systemClashTournamentStore(),now=Date.now(),a=event('EVENTA',now),b=event('EVENTB',now),binding={roomCode:'ROOMAA',createdAt:now,matchId:1,boutId:'bout-a'};assert.equal(await store.cas('EVENTA',null,a,now,binding),true);assert.equal(await store.cas('EVENTB',null,b,now,{...binding,boutId:'bout-b'}),false);assert.equal(await store.read('EVENTB'),null);assert.equal(await store.cas('EVENTA','stale',a,now,binding),false);assert.equal(await store.cas('EVENTA',a,a,now+30000,binding),true);assert.equal(expires.get(prefix+'event:EVENTA'),now+86400000);assert.equal((await store.list()).length,1);assert.ok(calls.every(call=>call.keys.every(key=>key.startsWith(prefix))));assert.ok(calls.every(call=>call.script===TOURNAMENT_CAS));assert.ok(TOURNAMENT_CAS.indexOf("if prior~=ARGV[1]")<TOURNAMENT_CAS.indexOf("redis.call('SET',KEYS[1]"));assert.ok(TOURNAMENT_CAS.indexOf("claimed and claimed~=ARGV[8]")<TOURNAMENT_CAS.indexOf("redis.call('SET',KEYS[1]"));});
test('completed events retain their record but leave discovery; empty index remains a real array',async()=>{rows.clear();const store=systemClashTournamentStore(),now=Date.now(),before=event('EVENTA',now),after=event('EVENTA',now,'complete');assert.equal(await store.cas('EVENTA',null,before,now),true);assert.equal(await store.cas('EVENTA',before,after,now),true);assert.deepEqual(await store.list(),[]);assert.equal(rows.get(prefix+'index'),'[]');assert.equal(await store.read('EVENTA'),after);});
test('expired mutations do not call Redis, while hashed rates contain no account identifier',async()=>{rows.clear();calls.length=0;const store=systemClashTournamentStore(),now=Date.now(),expired=JSON.stringify({code:'EVENTA',expiresAt:now});assert.equal(await store.cas('EVENTA',null,expired,now),false);assert.equal(calls.length,0);assert.equal(await store.allow('private-member-identity:127.0.0.1','read',1),true);assert.equal(await store.allow('private-member-identity:127.0.0.1','read',1),false);assert.ok(!calls[0].keys[0].includes('private-member'));});

