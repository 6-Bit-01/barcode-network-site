import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../services/member-auth/contract.mjs";
const file=new URL("../src/lib/member-artists.ts",import.meta.url);
const config={serviceUrl:"https://member-auth.barcode-network.com",serviceToken:"private-service-token-test-only-1234",canonicalOrigin:"https://www.barcode-network.com"};
const expiresAt=new Date(Date.now()+3_600_000).toISOString();
const artistId="123e4567-e89b-42d3-a456-426614174000";
const reference={kind:"native",sessionId:"show-1",trackId:"song-1",fingerprint:"a".repeat(64)};
const own=(changes={})=>({user:{id:"member-id",name:"Artist member"},session:{expiresAt},revision:0,artists:[{id:artistId,projectKey:"artist project"}],legacyReferences:[],...changes});
const owner=(changes={})=>({targetId:"member-id",revision:0,artists:[{id:artistId,projectKey:"artist project",approved:true}],legacyReferences:[],...changes});
function load(overrides={}) {
 const m={exports:{}};const source=fs.existsSync(file)?fs.readFileSync(file,"utf8"):"";
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module:m,exports:m.exports,Request,Response,Headers,URL,AbortSignal,Buffer,Date,fetch,
  require:id=>id==="server-only"?{}:id.endsWith("member-service")?{getMemberServiceConfiguration:()=>config}:id.endsWith("contract.mjs")?contract:id.endsWith("member-access")?{lookupMemberAccess:async()=>overrides.access??{ok:true,data:{user:{id:"owner-id"},access:{owner:true}}}}:id.endsWith("queue")?{validateMemberQueueHistoryReference:async()=>overrides.referenceValid??true,validateMemberQueueArtistProjectKey:async(key)=>key==="artist project"}:(()=>{throw new Error(id)})(),
 });return m.exports;
}
const request=(path="artists",body,headers={})=>new Request(config.canonicalOrigin+"/api/member/"+path,{method:body===undefined?"GET":"POST",headers:{cookie:"barcode_admin=old; __Secure-barcode_id.session_token=member; barcode_queue_submitter=guest",origin:config.canonicalOrigin,...(body===undefined?{}:{"content-type":"application/json"}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const action=(fields={})=>({requestId:"223e4567-e89b-42d3-a456-426614174000",targetId:"member-id",expectedRevision:0,action:"approve-history",artistId,reference,...fields});

test("Artist projection filters service-only data and caller credentials",async()=>{
 const {proxyMemberArtistRequest}=load();let sent;
 const response=await proxyMemberArtistRequest(request(),"artists",config,async(url,options)=>{sent=options;return Response.json(own({secret:"private",session:{expiresAt,token:"private"}}));});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),own());
 assert.equal(sent.headers.get("cookie"),"__Secure-barcode_id.session_token=member");assert.equal(sent.headers.get("x-barcode-service-token"),config.serviceToken);
 assert.equal(sent.redirect,"manual");assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("vary"),"Cookie");
});
test("Artist bridge denies malformed, expired, duplicate and foreign-reference projections",async()=>{
 const {proxyMemberArtistRequest}=load();
 for(const value of [own({revision:-1}),own({session:{expiresAt:"2000-01-01"}}),own({artists:[{id:"name-is-not-id",projectKey:"artist"}]}),own({artists:[...own().artists,...own().artists]}),own({legacyReferences:[{id:"323e4567-e89b-42d3-a456-426614174000",artistId:"423e4567-e89b-42d3-a456-426614174000",reference}]}),own({legacyReferences:[{id:"323e4567-e89b-42d3-a456-426614174000",artistId,reference:{...reference,privateBlobPath:"private"}}]})]){
  assert.equal((await proxyMemberArtistRequest(request(),"artists",config,async()=>Response.json(value))).status,502);
 }
});
test("Owner Artist request rejects forged actors, duplicate queries, unsupported fields and wrong origin",async()=>{
 const {proxyMemberArtistRequest}=load();let calls=0;const upstream=async()=>{calls++;return Response.json({});};
 for(const body of [action({actorId:"owner"}),action({submissionMemberId:"other"}),action({action:"grant-crew"}),action({reference:{...reference,fingerprint:"bad"}})])assert.equal((await proxyMemberArtistRequest(request("owner/artists/action",body),"owner/artists/action",config,upstream)).status,400);
 assert.equal((await proxyMemberArtistRequest(request("owner/artists?targetId=member-id&targetId=other"),"owner/artists",config,upstream)).status,400);
 assert.equal((await proxyMemberArtistRequest(request("artists",undefined,{origin:"https://evil.test"}),"artists",config,upstream)).status,403);
 const noOrigin=new Request(config.canonicalOrigin+"/api/member/owner/artists/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action())});
 assert.equal((await proxyMemberArtistRequest(noOrigin,"owner/artists/action",config,upstream)).status,403);assert.equal(calls,0);
});
test("Owner source association requires current Owner and valid exact source before writing",async()=>{
 let writes=0;const upstream=async()=>{writes++;return Response.json({ok:true,state:owner({revision:1})});};
 const denied=load({access:{ok:true,data:{user:{id:"crew"},access:{owner:false}}}});
 assert.equal((await denied.proxyMemberArtistRequest(request("owner/artists/action",action()),"owner/artists/action",config,upstream)).status,403);
 const stale=load({referenceValid:false});
 assert.equal((await stale.proxyMemberArtistRequest(request("owner/artists/action",action()),"owner/artists/action",config,upstream)).status,409);assert.equal(writes,0);
 const allowed=load();const response=await allowed.proxyMemberArtistRequest(request("owner/artists/action",action()),"owner/artists/action",config,upstream);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,state:owner({revision:1})});assert.equal(writes,1);
});
test("Artist project approval must select a real current catalog project and sanitizes target response",async()=>{
 const {proxyMemberArtistRequest}=load();let writes=0;
 const upstream=async()=>{writes++;return Response.json({ok:true,state:{...owner(),passwordHash:"private"}});};
 assert.equal((await proxyMemberArtistRequest(request("owner/artists/action",action({action:"approve-project",projectKey:"not in catalog",artistId:undefined,reference:undefined})),"owner/artists/action",config,upstream)).status,409);
 const response=await proxyMemberArtistRequest(request("owner/artists/action",action({action:"approve-project",projectKey:"artist project",artistId:undefined,reference:undefined})),"owner/artists/action",config,upstream);
 assert.equal(response.status,200);assert.equal(writes,1);assert.equal((await response.json()).state.passwordHash,undefined);
});
test("submission identity uses service user ID and current grants, never caller Member IDs",async()=>{
 const {resolveMemberSubmissionIdentity}=load();let calls=0;const upstream=async()=>{calls++;return Response.json(own({revision:7}));};
 const guest=await resolveMemberSubmissionIdentity(new Request(config.canonicalOrigin+"/api/queue"),undefined,config,upstream);
 assert.equal(guest.ok,true);assert.equal(guest.identity,null);assert.equal(calls,0);
 const selected=await resolveMemberSubmissionIdentity(request(),artistId,config,upstream);
 assert.equal(selected.ok,true);assert.deepEqual(JSON.parse(JSON.stringify(selected.identity)),{submissionMemberId:"member-id",approvedArtistId:artistId,approvedArtistLinkRevision:7});
 const forged=await resolveMemberSubmissionIdentity(request(),"423e4567-e89b-42d3-a456-426614174000",config,upstream);
 assert.equal(forged.ok,false);assert.equal(forged.status,403);
 const multiple=await resolveMemberSubmissionIdentity(request(),undefined,config,async()=>Response.json(own({artists:[...own().artists,{id:"423e4567-e89b-42d3-a456-426614174000",projectKey:"second project"}]})));
 assert.equal(multiple.ok,true);assert.equal(multiple.identity.approvedArtistId,null);
});
test("signed-in intake fails clearly on expired, suspended or unavailable identity instead of losing ownership",async()=>{
 const {resolveMemberSubmissionIdentity}=load();
 for(const status of [401,403,503]){const result=await resolveMemberSubmissionIdentity(request(),undefined,config,async()=>Response.json({code:"ACCOUNT_UNAVAILABLE"},{status}));assert.equal(result.ok,false);assert.equal(result.status,status);}
 assert.equal((await resolveMemberSubmissionIdentity(request(),undefined,config,async()=>{throw new Error("private-network");})).status,503);
});



test("explicit Personal Member selection does not auto-attribute a song to the only approved Artist",async()=>{
 const {resolveMemberSubmissionIdentity}=load();
 const result=await resolveMemberSubmissionIdentity(request(),"",config,async()=>Response.json(own({revision:2})));
 assert.equal(result.ok,true);assert.equal(result.identity.submissionMemberId,"member-id");assert.equal(result.identity.approvedArtistId,null);assert.equal(result.identity.approvedArtistLinkRevision,null);
});
test("website can roll out before Artist schema while preserving verified Member provenance",async()=>{
 const legacy={ok:true,data:{user:{id:"member-id",name:"Artist member"},session:{expiresAt},access:{owner:false}}};
 const {proxyMemberArtistRequest,resolveMemberSubmissionIdentity}=load({access:legacy});
 const upstream=async()=>Response.json({code:"NOT_FOUND"},{status:404});
 const response=await proxyMemberArtistRequest(request(),"artists",config,upstream);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),own({revision:0,artists:[],legacyReferences:[]}));
 const result=await resolveMemberSubmissionIdentity(request(),"",config,upstream);assert.equal(result.ok,true);assert.equal(result.identity.submissionMemberId,"member-id");assert.equal(result.identity.approvedArtistId,null);
 const revoked=load({access:{ok:false,status:403,code:"ACCOUNT_SUSPENDED"}});
 assert.equal((await revoked.resolveMemberSubmissionIdentity(request(),"",config,upstream)).status,403);
});
test("reference bridge accepts existing ledger portable identifiers and rejects nonportable paths",()=>{
 const {checkedMemberArtistReference}=load();
 const historical={kind:"historical",bundleDigest:"a".repeat(64),recoveryTrackId:"legacy.show:7-track.1"};
 assert.equal(checkedMemberArtistReference(historical).recoveryTrackId,historical.recoveryTrackId);
 assert.throws(()=>checkedMemberArtistReference({...historical,recoveryTrackId:"../secret"}));
});

test("Member projection must not promote explicitly revoked Artist links or legacy approvals",async()=>{
 const {proxyMemberArtistRequest}=load();
 for(const value of [own({artists:[{...own().artists[0],approved:false}]}),own({legacyReferences:[{id:"323e4567-e89b-42d3-a456-426614174000",artistId,reference,approved:false}]})]){
  assert.equal((await proxyMemberArtistRequest(request(),"artists",config,async()=>Response.json(value))).status,502);
 }
});
