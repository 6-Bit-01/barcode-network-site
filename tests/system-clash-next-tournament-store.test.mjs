import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url),original=Module._load,rows=new Map(),calls=[];
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
class Redis {
 async get(key){return rows.get(key)??null;}
 async eval(script,keys,args){
  calls.push({script,keys,args});const [encoded,now]=args,writes=JSON.parse(encoded);
  if(writes.some((write,n)=>(rows.get(keys[n+1])??'')!==write.old))return 0;
  const codes=new Set(writes.map(write=>write.code)),entries=JSON.parse(rows.get(keys[0])??'[]').filter(entry=>entry.expiresAt>now&&!codes.has(entry.code));
  for(const write of writes){const event=JSON.parse(write.next);if(!['complete','cancelled'].includes(event.status))entries.push({code:event.code,expiresAt:event.expiresAt,createdAt:event.createdAt});}
  if(entries.length>30)return 0;
  for(let n=0;n<writes.length;n++)rows.set(keys[n+1],writes[n].next);rows.set(keys[0],JSON.stringify(entries));return 1;
 }
}
Module._load=function(id,parent,main){if(id==='@upstash/redis')return{Redis};return original.call(this,id,parent,main);};
const {systemClashTournamentStore,TOURNAMENT_LINKED_CAS}=require('../src/lib/system-clash-tournament-store.ts');Module._load=original;
process.env.UPSTASH_REDIS_REST_URL='https://private-adapter.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='private-adapter-fixture';
const prefix='barcode:system-clash:online:v1:tournament:',event=(code,now,status='lobby')=>JSON.stringify({version:1,code,status,createdAt:now,expiresAt:now+86400000});
test('linked adapter atomically rejects either stale side without creating a child',async()=>{
 rows.clear();calls.length=0;const store=systemClashTournamentStore(),now=Date.now(),old=event('PARENT',now),next=JSON.stringify({...JSON.parse(old),nextTournamentCode:'CHILDA'}),child=event('CHILDA',now);rows.set(prefix+'event:PARENT',old);
 assert.equal(await store.casEvents([{code:'PARENT',old:'stale',next},{code:'CHILDA',old:null,next:child}],now),false);assert.equal(await store.read('CHILDA'),null);assert.equal(await store.read('PARENT'),old);
 assert.equal(await store.casEvents([{code:'PARENT',old,next},{code:'CHILDA',old:null,next:child}],now),true);assert.equal(await store.read('PARENT'),next);assert.equal(await store.read('CHILDA'),child);
 assert.ok(calls.every(call=>call.script===TOURNAMENT_LINKED_CAS&&call.keys.every(key=>key.startsWith(prefix))));assert.ok(TOURNAMENT_LINKED_CAS.indexOf('for i,write in ipairs(writes)')<TOURNAMENT_LINKED_CAS.indexOf("redis.call('SET'"));
 assert.ok(TOURNAMENT_LINKED_CAS.indexOf('if #entries>30')<TOURNAMENT_LINKED_CAS.indexOf("redis.call('SET'"));
});
test('linked adapter does not publish an orphan when discovery is full and keeps cancelled child record',async()=>{
 rows.clear();const store=systemClashTournamentStore(),now=Date.now(),old=event('PARENT',now),child=event('CHILDA',now);rows.set(prefix+'event:PARENT',old);rows.set(prefix+'index',JSON.stringify(Array.from({length:30},(_,n)=>({code:('ITEM'+n).padEnd(6,'A'),expiresAt:now+86400000,createdAt:now}))));
 assert.equal(await store.casEvents([{code:'PARENT',old,next:old},{code:'CHILDA',old:null,next:child}],now),false);assert.equal(await store.read('CHILDA'),null);rows.set(prefix+'index','[]');
 assert.equal(await store.casEvents([{code:'PARENT',old,next:old},{code:'CHILDA',old:null,next:child}],now),true);
 const ended=event('PARENT',now,'cancelled'),closed=event('CHILDA',now,'cancelled');assert.equal(await store.casEvents([{code:'PARENT',old,next:ended},{code:'CHILDA',old:child,next:closed}],now),true);assert.equal(rows.get(prefix+'index'),'[]');assert.equal(await store.read('CHILDA'),closed);
});
test('linked adapter validates codes, duplicate keys, finite TTL and payload before Redis',async()=>{
 rows.clear();calls.length=0;const store=systemClashTournamentStore(),now=Date.now(),raw=event('PARENT',now);
 for(const writes of [[],[{code:'PARENT',old:null,next:'null'}],[{code:'PARENT',old:null,next:JSON.stringify({code:'PARENT',expiresAt:null})}],[{code:'PARENT',old:null,next:event('OTHERX',now)}],[{code:'PARENT',old:null,next:raw},{code:'PARENT',old:null,next:raw}],[{code:'bad',old:null,next:raw}],[{code:'PARENT',old:null,next:event('PARENT',now-86400000)}]])assert.equal(await store.casEvents(writes,now),false);
 assert.equal(calls.length,0);await store.casEvents([{code:'PARENT',old:null,next:raw}],now+30000);const payload=JSON.parse(calls[0].args[0]);assert.equal(payload[0].ttl,86370);
});
