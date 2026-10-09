import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as net from 'node:net';
import ts from 'typescript';
import * as contract from '../services/member-auth/contract.mjs';
const testEnvironment={};
const testModule={exports:{}};
const source=fs.readFileSync(new URL('../src/lib/member-service.ts',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:testModule,exports:testModule.exports,Request,Response,Headers,URL,AbortSignal,TextDecoder,Buffer,process:{env:testEnvironment},require:(id)=>id==='server-only'?{}:id==='node:net'?net:id.endsWith('contract.mjs')?contract: (()=>{throw new Error(id)})()});
const {proxyMemberRequest,getMemberServiceConfiguration}=testModule.exports;
const config={serviceUrl:'https://member-auth.barcode-network.com',serviceToken:'private-service-token-test-only-1234',canonicalOrigin:'https://www.barcode-network.com'};
const call=(path,body,headers={})=>new Request(`${config.canonicalOrigin}/api/member/auth/${path}`,{method:body===undefined?'GET':'POST',headers:{origin:config.canonicalOrigin,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});

test('proxy denies unsupported routes, roles, foreign origins and large bodies before any upstream request',async()=>{
 let calls=0;const upstream=async()=>{calls++;return Response.json({});};
 for(const [path,body,headers,status] of [['admin/list-users',{}, {},404],['update-user',{role:'owner'}, {},400],['sign-in/email',{email:'x@y.test',password:'private'}, {origin:'https://evil.test'},403],['update-user',{name:'x'.repeat(17000)},{},413]]){
  assert.equal((await proxyMemberRequest(call(path,body,headers),path,config,upstream)).status,status);
 }
 assert.equal(calls,0);
});

test('proxy forwards only member cookies; browser headers cannot supply service credentials',async()=>{
 let sent;
 const response=await proxyMemberRequest(call('get-session',undefined,{cookie:'barcode_admin=operator; barcode_queue_submitter=guest; __Secure-barcode_id.session_token=member','x-barcode-service-token':'forged','x-barcode-client-ip':'forged','x-forwarded-for':'192.0.2.20'}),'get-session',config,async(url,options)=>{sent={url,options};return Response.json({user:{id:'member-id',name:'Member',email:'private@sample.test',emailVerified:true},session:{token:'secret-token',ipAddress:'private',expiresAt:'2026-10-12T00:00:00Z'}});});
 assert.equal(sent.options.headers.get('cookie'),'__Secure-barcode_id.session_token=member');
 assert.equal(sent.options.headers.get('x-barcode-service-token'),config.serviceToken);
 assert.notEqual(sent.options.headers.get('x-barcode-client-ip'),'forged');
 assert.equal(sent.options.redirect,'manual');
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.ok(!JSON.stringify(await response.json()).includes('secret-token'));
});

test('transport failures fail closed and redirects cannot escape account pages',async()=>{
 assert.equal((await proxyMemberRequest(call('get-session'),'get-session',config,async()=>{throw new Error('private internal address');})).status,503);
 assert.equal((await proxyMemberRequest(call('verify-email'),'verify-email',config,async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}))).status,502);
 assert.equal((await proxyMemberRequest(call('get-session'),'get-session',null,async()=>{throw new Error('should not fetch');})).status,503);
});

test('safe verification redirects preserve each member cookie and exclude unrelated cookies',async()=>{
 const headers=new Headers({location:`${config.canonicalOrigin}/account`});
 headers.append('set-cookie','__Secure-barcode_id.session_token=member; Path=/; Secure; HttpOnly; SameSite=Lax');
 headers.append('set-cookie','barcode_admin=should-never-pass; Path=/');
 const result=await proxyMemberRequest(call('verify-email'),'verify-email',config,async()=>new Response(null,{status:302,headers}));
 assert.equal(result.status,302);
 assert.equal(result.headers.getSetCookie().length,1);
 assert.ok(!result.headers.get('set-cookie').includes('barcode_admin'));
});
const invalidConnectionTokens=[
 ['embedded newline','A'.repeat(16)+'\n'+'A'.repeat(16)],
 ['undersized','A'.repeat(31)],
 ['trailing newline','A'.repeat(32)+'\n'],
 ['unicode','A'.repeat(32)+'\u0100'],
 ['oversized','A'.repeat(129)],
 ['surrounding whitespace',' '+'A'.repeat(32)+' '],
 ['pasted text','synthetic unrelated clipboard text '.repeat(2)],
];
for(const [label,serviceToken] of invalidConnectionTokens){
 test(`invalid ${label} connection configuration closes account access`,()=>{
  Object.assign(testEnvironment,{BARCODE_MEMBER_SERVICE_URL:'https://member-auth.barcode-network.com',BARCODE_MEMBER_SERVICE_TOKEN:serviceToken});
  try{assert.equal(getMemberServiceConfiguration(),null);}
  finally{delete testEnvironment.BARCODE_MEMBER_SERVICE_URL;delete testEnvironment.BARCODE_MEMBER_SERVICE_TOKEN;}
 });
 test(`direct invalid ${label} connection fails closed before upstream requests`,async()=>{
  let calls=0;
  const upstream=async()=>{calls++;return Response.json(null);};
  for(const [path,body] of [['get-session',undefined],['sign-in/email',{email:'diagnostic@example.invalid',password:'synthetic-invalid-password'}]]){
   const response=await proxyMemberRequest(call(path,body),path,{...config,serviceToken},upstream);
   assert.equal(response.status,503);
   assert.deepEqual(await response.json(),{code:'ACCOUNT_UNAVAILABLE'});
   assert.equal(response.headers.get('cache-control'),'private, no-store');
   assert.equal(response.headers.get('referrer-policy'),'no-referrer');
   assert.equal(calls,0);
  }
 });
}

test('valid base64url connection values retain exact lower and upper boundaries',()=>{
 for(const serviceToken of ['A'.repeat(31)+'_','A'.repeat(126)+'-_']){
  Object.assign(testEnvironment,{BARCODE_MEMBER_SERVICE_URL:'https://member-auth.barcode-network.com',BARCODE_MEMBER_SERVICE_TOKEN:serviceToken});
  try{const configuration=getMemberServiceConfiguration();assert.equal(configuration.serviceUrl,'https://member-auth.barcode-network.com');assert.equal(configuration.serviceToken,serviceToken);assert.equal(configuration.canonicalOrigin,'https://www.barcode-network.com');}
  finally{delete testEnvironment.BARCODE_MEMBER_SERVICE_URL;delete testEnvironment.BARCODE_MEMBER_SERVICE_TOKEN;}
 }
});
