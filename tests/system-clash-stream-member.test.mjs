import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {memberCookies} from '../services/member-auth/contract.mjs';
const origin='https://www.barcode-network.com',watch='/api/games/system-clash/tournaments/watch?code=EVENT1',room='/api/games/system-clash/rooms';
const request=(cookie='__Secure-barcode_id.session_token=one',path=watch,method='GET')=>new Request(origin+path,{method,headers:{...(cookie?{cookie}:{}),...(method==='POST'?{origin}:{})}});
function fixture({lookup}={}){
 let now=10000,calls=0,expiresAt=100000,denied=false;const hashed=[];
 const Clock=class extends Date{static now(){return now;}};
 const loaded={exports:{}},code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/system-clash-member.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module:loaded,exports:loaded.exports,require:id=>{
  if(id==='server-only')return{};
  if(id==='./member-access')return{lookupMemberAccess:async cookie=>{calls++;if(lookup)return lookup(cookie);return denied?{ok:false,status:401}:{ok:true,data:{user:{id:cookie,name:'Verified'},session:{expiresAt:new Date(expiresAt).toISOString()}}};}};
  if(id==='../../services/member-auth/contract.mjs')return{memberCookies};
  if(id==='node:crypto')return{createHash:algorithm=>{assert.equal(algorithm,'sha256');const hash=createHash(algorithm);return{update(value){hashed.push(value);hash.update(value);return this;},digest:encoding=>hash.digest(encoding)};}};
  throw new Error(id);
 },Request,URL,Date:Clock,Map,Promise});
 return{gate:loaded.exports.requireSystemClashMember,setTime:value=>now=value,setExpiry:value=>expiresAt=value,deny:()=>denied=true,get calls(){return calls;},hashed};
}
const stream={publicPoseStream:true};
test('public poses reuse only a positive verification for less than three seconds, then recheck revocation',async()=>{
 const f=fixture();await f.gate(request(),stream);f.deny();f.setTime(12999);await f.gate(request(),stream);assert.equal(f.calls,1);f.setTime(13000);await assert.rejects(f.gate(request(),stream),e=>e.status===401);assert.equal(f.calls,2);await assert.rejects(f.gate(request(),stream),e=>e.status===401);assert.equal(f.calls,3,'Denied checks are never cached');
});
test('session expiry bounds pose reuse and an absent account cookie immediately denies',async()=>{
 const f=fixture();f.setExpiry(11000);await f.gate(request(),stream);f.deny();f.setTime(11000);await assert.rejects(f.gate(request(),stream),e=>e.status===401);const before=f.calls;for(const cookie of ['', 'unrelated=private'])await assert.rejects(f.gate(request(cookie),stream),e=>e.status===401);assert.equal(f.calls,before);
});
test('pose verification isolates account cookies, hashes only filtered member cookies and returns independent projections',async()=>{
 const f=fixture(),one=await f.gate(request('unrelated=secret; __Secure-barcode_id.session_token=one'),stream);one.name='Edited';const again=await f.gate(request('__Secure-barcode_id.session_token=one'),stream),two=await f.gate(request('__Secure-barcode_id.session_token=two'),stream);assert.equal(again.name,'Verified');assert.notEqual(again.id,two.id);assert.equal(f.calls,2);assert(f.hashed.length);assert(f.hashed.every(value=>!value.includes('unrelated')&&!value.includes('secret')));
});
test('all ordinary reads and actions use fresh authority and a fresh denial invalidates pose reuse',async()=>{
 const f=fixture();await f.gate(request(),stream);await f.gate(request(undefined,room));await f.gate(request(undefined,room,'POST'));await f.gate(request(undefined,'/api/games/system-clash/tournaments'),stream);assert.equal(f.calls,4);f.deny();await assert.rejects(f.gate(request(undefined,room,'POST')),e=>e.status===401);await assert.rejects(f.gate(request(),stream),e=>e.status===401);assert.equal(f.calls,6);
});
test('only the explicit public pose endpoints reuse identity and origins are checked before cached responses',async()=>{
 const f=fixture();await f.gate(request(),stream);await f.gate(request(undefined,room,'POST'),stream);assert.equal(f.calls,1);await assert.rejects(f.gate(new Request(origin+watch,{headers:{cookie:'__Secure-barcode_id.session_token=one',origin:'https://other.test'}}),stream),e=>e.status===403);await assert.rejects(f.gate(new Request(origin+room,{method:'POST',headers:{cookie:'__Secure-barcode_id.session_token=one'}}),stream),e=>e.status===403);assert.equal(f.calls,1);
});
test('simultaneous public pose checks deduplicate verification and a late reply cannot extend the window',async()=>{
 let release;const waiting=new Promise(resolve=>release=resolve),f=fixture({lookup:()=>waiting});const first=f.gate(request(),stream),second=f.gate(request(),stream);assert.equal(f.calls,1);f.setTime(14000);release({ok:true,data:{user:{id:'same',name:'Verified'},session:{expiresAt:new Date(100000).toISOString()}}});await Promise.all([first,second]);await f.gate(request(),stream);assert.equal(f.calls,2);
});
test('pose cache capacity is bounded and never retains every account indefinitely',async()=>{
 const f=fixture();for(let i=0;i<258;i++)await f.gate(request('__Secure-barcode_id.session_token='+i),stream);await f.gate(request('__Secure-barcode_id.session_token=0'),stream);assert.equal(f.calls,259);
});

test('a live denial during an older pose check prevents late or deduplicated replies from restoring access',async()=>{
 let release;const waiting=new Promise(resolve=>release=resolve);let calls=0;const f=fixture({lookup:()=>++calls===1?waiting:Promise.resolve({ok:false,status:401})});
 const first=f.gate(request(),stream),duplicate=f.gate(request(),stream);
 await assert.rejects(f.gate(request(undefined,room,'POST')),e=>e.status===401);
 const deniedFirst=assert.rejects(first,e=>e.status===401),deniedDuplicate=assert.rejects(duplicate,e=>e.status===401);
 release({ok:true,data:{user:{id:'revoked',name:'Old reply'},session:{expiresAt:new Date(100000).toISOString()}}});await Promise.all([deniedFirst,deniedDuplicate]);
 await assert.rejects(f.gate(request(),stream),e=>e.status===401);assert.equal(f.calls,3);
});
test('distinct pending pose checks have bounded deduplication slots and missing cookies never reach identity services',async()=>{
 let release;const waiting=new Promise(resolve=>release=resolve),f=fixture({lookup:()=>waiting}),calls=[];
 for(let i=0;i<270;i++)calls.push(f.gate(request('__Secure-barcode_id.session_token='+i),stream));
 calls.push(f.gate(request('__Secure-barcode_id.session_token=0'),stream));assert.equal(f.calls,270);
 calls.push(f.gate(request('__Secure-barcode_id.session_token=269'),stream));assert.equal(f.calls,271,'Overflow checks verify freshly instead of allocating another deduplication slot');
 await assert.rejects(f.gate(request('',room,'POST')),e=>e.status===401);assert.equal(f.calls,271);
 release({ok:true,data:{user:{id:'verified',name:'Verified'},session:{expiresAt:new Date(100000).toISOString()}}});await Promise.all(calls);
});

test('expired in-flight checks cannot overwrite a later live denial for the same cookie',async()=>{
 let release;const waiting=new Promise(resolve=>release=resolve);let calls=0;const f=fixture({lookup:()=>++calls===1?waiting:Promise.resolve({ok:false,status:401})});
 const old=f.gate(request(),stream);f.setTime(14000);await assert.rejects(f.gate(request(),stream),e=>e.status===401);
 const deniedOld=assert.rejects(old,e=>e.status===401);release({ok:true,data:{user:{id:'revoked',name:'Late reply'},session:{expiresAt:new Date(100000).toISOString()}}});await deniedOld;
});
