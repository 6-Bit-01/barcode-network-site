import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../services/member-auth/contract.mjs";
const file=new URL("../src/lib/member-access.ts",import.meta.url);
function load(overrides={}) {
 const sandboxModule={exports:{}};
 const source=fs.existsSync(file)?fs.readFileSync(file,"utf8"):"";
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module:sandboxModule,exports:sandboxModule.exports,Request,Response,Headers,URL,AbortSignal,Buffer,Date,fetch:overrides.fetch??fetch,
  require:id=>id==="server-only"?{}:id.endsWith("member-service")?{getMemberServiceConfiguration:()=>overrides.configuration??null}:id.endsWith("contract.mjs")?contract:id==="next/headers"?{headers:async()=>new Headers({cookie:"__Secure-barcode_id.session_token=member",host:overrides.host??"www.barcode-network.com"})}:id==="next/navigation"?{redirect:url=>{throw new Error("REDIRECT:"+url)},notFound:()=>{throw new Error("NOT_FOUND")}}:(()=>{throw new Error(id)})(),
 });
 return sandboxModule.exports;
}
const config={serviceUrl:"https://member-auth.barcode-network.com",serviceToken:"private-service-token-test-only-1234",canonicalOrigin:"https://www.barcode-network.com"};
const expiresAt=new Date(Date.now()+3_600_000).toISOString();
const access=(changes={})=>({user:{id:"member-id",name:"Network member"},session:{expiresAt},access:{owner:false,crew:false,permissions:[],availablePermissions:[]},...changes});
const request=(path="access",body,headers={})=>new Request(config.canonicalOrigin+"/api/member/"+path,{method:body===undefined?"GET":"POST",headers:{cookie:"barcode_admin=legacy; __Secure-barcode_id.session_token=member; barcode_queue_submitter=guest",origin:config.canonicalOrigin,...(body===undefined?{}:{"content-type":"application/json"}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
test("access transport denies forged origin, unsupported role setters and invalid configuration before upstream",async()=>{
 const {proxyMemberAccessRequest}=load();let calls=0;const fetcher=async()=>{calls++;return Response.json(access());};
 assert.equal((await proxyMemberAccessRequest(request("access",undefined,{origin:"https://other.test"}),"access",config,fetcher)).status,403);
 assert.equal((await proxyMemberAccessRequest(request("owner/promote",{role:"owner"}),"owner/promote",config,fetcher)).status,404);
 assert.equal((await proxyMemberAccessRequest(request("access"),"access",{...config,serviceToken:"invalid token"},fetcher)).status,503);
 assert.equal(calls,0);
});
test("access projection cannot reveal service session tokens or trust caller credentials",async()=>{
 const {proxyMemberAccessRequest}=load();let sent;
 const upstream={...access(),session:{expiresAt,token:"never-public"},internalSecret:"never-public"};
 const response=await proxyMemberAccessRequest(request("access",undefined,{"x-barcode-service-token":"forged","x-barcode-client-ip":"forged"}),"access",config,async(url,options)=>{sent={url,options};return Response.json(upstream);});
 assert.equal(response.status,200);
 assert.equal(sent.options.headers.get("cookie"),"__Secure-barcode_id.session_token=member");
 assert.equal(sent.options.headers.get("x-barcode-service-token"),config.serviceToken);
 assert.equal(sent.options.cache,"no-store");
 assert.equal(sent.options.redirect,"manual");
 assert.equal(response.headers.get("cache-control"),"private, no-store");
 const result=await response.json();
 assert.deepEqual(result,{user:{id:"member-id",name:"Network member"},session:{expiresAt},access:{owner:false,crew:false,permissions:[],availablePermissions:[]}});
});
test("access projection fails closed on expired, malformed or inconsistent authority",async()=>{
 const {proxyMemberAccessRequest}=load();
 for(const data of [
  access({session:{expiresAt:"not-a-date"}}),
  access({session:{expiresAt:"2000-01-01T00:00:00.000Z"}}),
  access({user:{id:"",name:"Network member"}}),
  access({access:{owner:"true",crew:false,permissions:[],availablePermissions:[]}}),
  access({access:{owner:false,crew:false,permissions:["song.generate"],availablePermissions:[]}}),
  access({access:{owner:false,crew:true,permissions:["anything.owner"],availablePermissions:[]}}),
 ]) assert.equal((await proxyMemberAccessRequest(request(),"access",config,async()=>Response.json(data))).status,502);
 assert.equal((await proxyMemberAccessRequest(request(),"access",config,async()=>{throw new Error("private-network-detail");})).status,503);
});
test("lookup carries denial and does not turn an old admin cookie into Member authority",async()=>{
 const {lookupMemberAccess}=load();let sent;
 const result=await lookupMemberAccess("barcode_admin=valid-old-admin",config,async(url,options)=>{sent=options;return Response.json({code:"AUTH_REQUIRED",token:"never-public"},{status:401});});
 assert.equal(result.ok,false);assert.equal(result.status,401);
 assert.equal(sent.headers.get("cookie"),null);
});
test("owner projection limits account fields and refuses malformed directory records",async()=>{
 const {proxyMemberAccessRequest}=load();
 const account={id:"other-member",name:"Artist submitter",email:"member@example.test",emailVerified:true,suspended:false,owner:false,crew:false,permissions:[],revision:1,createdAt:"2026-10-01T00:00:00.000Z",passwordHash:"never-public"};
 const response=await proxyMemberAccessRequest(request("owner/accounts"),"owner/accounts",config,async()=>Response.json({accounts:[account],nextCursor:null,serviceSecret:"never-public"}));
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.accounts.length,1);assert.equal("passwordHash" in data.accounts[0],false);assert.equal("serviceSecret" in data,false);
 const bad=await proxyMemberAccessRequest(request("owner/accounts"),"owner/accounts",config,async()=>Response.json({accounts:[{...account,revision:-1}],nextCursor:null}));
 assert.equal(bad.status,502);
});
test("mutation validation refuses actor spoofing and unbounded bodies without action side effects",async()=>{
 const {proxyMemberAccessRequest}=load();let calls=0;
 const body={requestId:"123e4567-e89b-42d3-a456-426614174000",targetId:"target-member",expectedRevision:0,action:"set-crew",assigned:true,permissions:[]};
 const fetcher=async()=>{calls++;return Response.json({ok:true});};
 for(const candidate of [{...body,actorId:"owner"},{...body,role:"owner"},{...body,action:"grant-owner"},{...body,permissions:["arbitrary.owner"]}]) assert.equal((await proxyMemberAccessRequest(request("owner/accounts/action",candidate),"owner/accounts/action",config,fetcher)).status,400);
 assert.equal((await proxyMemberAccessRequest(request("owner/accounts/action",{...body,extra:"x".repeat(17000)}),"owner/accounts/action",config,fetcher)).status,413);
 assert.equal(calls,0);
});

test("workspace guard denies direct Member or Crew access to Owner and denies missing sessions",async()=>{
 const cases=[
  [Response.json(access()),"NOT_FOUND"],
  [Response.json(access({access:{owner:false,crew:true,permissions:[],availablePermissions:[]}})),"NOT_FOUND"],
  [Response.json({code:"AUTH_REQUIRED"},{status:401}),"REDIRECT:/account"],
  [Response.json({code:"ACCESS_DENIED"},{status:403}),"NOT_FOUND"],
 ];
 for(const [response,reason] of cases){
  const {requireMemberWorkspaceAccess}=load({configuration:config,fetch:async()=>response});
  await assert.rejects(requireMemberWorkspaceAccess("owner"),error=>error.message===reason);
 }
 const {requireMemberWorkspaceAccess}=load({configuration:config,fetch:async()=>{throw new Error("private-network-address");}});
 await assert.rejects(requireMemberWorkspaceAccess("owner"),/temporarily unavailable/);
});
test("workspace guard returns only current permitted identity and canonicalizes the apex host",async()=>{
 const data=access({access:{owner:true,crew:false,permissions:[],availablePermissions:[]},privateSecret:"not-client-props"});
 const {requireMemberWorkspaceAccess}=load({configuration:config,fetch:async()=>Response.json(data)});
 assert.deepEqual(await requireMemberWorkspaceAccess("owner"),{user:{id:"member-id",name:"Network member"},session:{expiresAt},access:{owner:true,crew:false,permissions:[],availablePermissions:[]}});
 await assert.rejects(requireMemberWorkspaceAccess("crew"),error=>error.message==="NOT_FOUND");
 let calls=0;
 const canonical=load({configuration:config,host:"barcode-network.com",fetch:async()=>{calls++;return Response.json(data);}});
 await assert.rejects(canonical.requireMemberWorkspaceAccess("owner"),error=>error.message==="REDIRECT:https://www.barcode-network.com/account/owner");
 assert.equal(calls,0);
});
test("owner mutation requires explicit same-origin JSON and never follows an upstream redirect",async()=>{
 const {proxyMemberAccessRequest}=load();let calls=0;
 const body={requestId:"123e4567-e89b-42d3-a456-426614174000",targetId:"target-member",expectedRevision:0,action:"revoke-sessions"};
 const noOrigin=new Request(config.canonicalOrigin+"/api/member/owner/accounts/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 assert.equal((await proxyMemberAccessRequest(noOrigin,"owner/accounts/action",config,async()=>{calls++;return Response.json({});})).status,403);
 assert.equal((await proxyMemberAccessRequest(request("owner/accounts/action",body,{"content-type":"text/plain"}),"owner/accounts/action",config,async()=>{calls++;return Response.json({});})).status,415);
 assert.equal(calls,0);
 assert.equal((await proxyMemberAccessRequest(request(),"access",config,async()=>new Response(null,{status:302,headers:{location:"https://attacker.test/private"}}))).status,502);
});
