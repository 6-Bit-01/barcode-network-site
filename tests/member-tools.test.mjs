import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as cookies from "../services/member-auth/contract.mjs";
const config={serviceUrl:"https://member-auth.barcode-network.com",serviceToken:"private-test-token-1234567890123456",canonicalOrigin:"https://www.barcode-network.com"};
const access={user:{id:"creator",name:"Creator"},session:{expiresAt:"2099-01-01T00:00:00Z"},access:{owner:false,crew:true,permissions:["song.generate"],availablePermissions:["song.generate"]}};
function load(relative,overrides={}) {
 const file=new URL("../src/lib/"+relative+".ts",import.meta.url); assert.ok(fs.existsSync(file),"Required tool module missing: "+relative);
 const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 module:m,exports:m.exports,Request,Response,Headers,URL,AbortSignal,Buffer,Date,fetch,
 require:id=>id==="server-only"?{}:id.endsWith("member-service")?{getMemberServiceConfiguration:()=>config}:id.endsWith("member-access")?{lookupMemberAccess:async()=>overrides.lookup??{ok:true,data:access}}:id.endsWith("contract.mjs")?cookies:id.endsWith("barcode-song-contract")?load("barcode-song-contract"):id==="next/headers"?{headers:async()=>new Headers({cookie:"__Secure-barcode_id.session_token=one"})}:id==="next/navigation"?{redirect:url=>{throw Error("REDIRECT:"+url)},notFound:()=>{throw Error("NOT_FOUND")}}:(()=>{throw Error(id)})()
 });return m.exports;
}
const request=(method="GET",body,extras={})=>new Request(config.canonicalOrigin+"/api/member/tools/songs",{method,headers:{origin:config.canonicalOrigin,cookie:"barcode_admin=old; __Secure-barcode_id.session_token=one",...(body?{"content-type":"application/json"}:{}),...extras},...(body?{body:JSON.stringify(body)}:{})});
const operation={requestId:"123e4567-e89b-42d3-a456-426614174000",expectedRevision:0,kind:"generate",options:{}};
const draft={revision:0,title:"",lyrics:"",style:"",previous:null,pending:null,errorCode:null,selectedTrackId:null,options:{},tracks:[]};
test("empty direction works and lyric cap is distinct from style",()=>{
 const {parseSongRequest,parseSongText}=load("barcode-song-contract");
 assert.equal(parseSongRequest(operation).kind,"generate");
 assert.equal(parseSongText({title:"Song",lyrics:"word ".repeat(2000).trim(),style:"electronic"}).title,"Song");
 assert.throws(()=>parseSongText({title:"Song",lyrics:"word ".repeat(2001),style:"electronic"}));
 assert.throws(()=>parseSongRequest({...operation,actorId:"other"}));
});
test("personal proxy filters cookies and all service-only fields",async()=>{
 const {proxyMemberSongRequest}=load("member-tools");let sent;
 const response=await proxyMemberSongRequest(request(),config,async(url,options)=>{sent={url,options};return Response.json({draft:{...draft,creatorId:"PRIVATE",sessionToken:"PRIVATE"},secret:"PRIVATE"});});
 assert.equal(response.status,200);assert.equal(sent.options.headers.get("cookie"),"__Secure-barcode_id.session_token=one");assert.equal(sent.options.redirect,"manual");
 assert.equal(JSON.stringify(await response.json()).includes("PRIVATE"),false);assert.equal(response.headers.get("cache-control"),"private, no-store");
});
test("personal mutations reject origin, actor spoofing, oversized payloads and redirects",async()=>{
 const {proxyMemberSongRequest}=load("member-tools");let calls=0;const fetcher=async()=>{calls++;return Response.json({draft});};
 assert.equal((await proxyMemberSongRequest(request("POST",operation,{origin:"https://other.test"}),config,fetcher)).status,403);
 assert.equal((await proxyMemberSongRequest(request("POST",{...operation,creatorId:"other"}),config,fetcher)).status,400);
 assert.equal((await proxyMemberSongRequest(request("POST",{...operation,options:{idea:"x".repeat(270000)}}),config,fetcher)).status,413);assert.equal(calls,0);
 assert.equal((await proxyMemberSongRequest(request(),config,async()=>new Response(null,{status:302,headers:{location:"https://other.test"}}))).status,502);
});
test("tool authority requires fresh grant and available permission, including Owner",async()=>{
 const {lookupMemberToolAccess}=load("member-tools");assert.equal((await lookupMemberToolAccess(request(),"song.generate")).ok,true);
 for(const candidate of [
 {...access,access:{...access.access,permissions:[]}},
 {...access,access:{...access.access,availablePermissions:[]}},
 {...access,access:{owner:false,crew:false,permissions:[],availablePermissions:["song.generate"]}}
 ]) {const lib=load("member-tools",{lookup:{ok:true,data:candidate}});assert.equal((await lib.lookupMemberToolAccess(request(),"song.generate")).ok,false);}
 const owner=load("member-tools",{lookup:{ok:true,data:{...access,access:{...access.access,owner:true,crew:false,permissions:[]}}}});assert.equal((await owner.lookupMemberToolAccess(request(),"song.generate")).ok,true);
});
test("worker uses existing service credential but never personal cookies; projects safe commands",async()=>{
 const {proxyMemberSongWorkerRequest}=load("member-tools");let sent;
 const command={id:"command-one",leaseId:"lease-one",kind:"generate",options:{},base:{title:"",lyrics:"",style:""},limits:{maxLyricsWords:2000,targetSeconds:300},creatorId:"PRIVATE"};
 const response=await proxyMemberSongWorkerRequest(request(),config,async(url,options)=>{sent={url,options};return Response.json({contractVersion:1,commands:[command],secret:"PRIVATE"});});
 assert.equal(response.status,200);assert.equal(sent.options.headers.get("cookie"),null);assert.ok(sent.url.endsWith("/api/member/worker/songs/claim"));assert.equal(sent.options.method,"POST");assert.equal(JSON.stringify(await response.json()).includes("PRIVATE"),false);
});
test("aggregated account insights strip all individual identities",async()=>{
 const {fetchMemberToolInsights}=load("member-tools");
 const value=await fetchMemberToolInsights(request(),config,async()=>Response.json({accounts:{total:2,verified:1,active:2,suspended:0,signupsByMonth:[{month:"2026-10",count:2}],email:"PRIVATE"},members:["PRIVATE"]}));
 assert.equal(value.accounts.total,2);assert.equal(JSON.stringify(value).includes("PRIVATE"),false);
});


test("service error bodies cannot leak even a plausible uppercase private value",async()=>{
 const {proxyMemberSongRequest}=load("member-tools");
 const response=await proxyMemberSongRequest(request(),config,async()=>Response.json({code:"PRIVATE_ACCOUNT_VALUE",secret:"PRIVATE"},{status:503}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:"ACCOUNT_REQUEST_FAILED"});
});


test('personal proxy preserves known archive conflicts and strips arbitrary private codes',async()=>{
 const {proxyMemberSongRequest}=load('member-tools');for(const code of ['TRACK_NOT_FOUND','SONG_BASE_CONFLICT']){const response=await proxyMemberSongRequest(request(),config,async()=>Response.json({code,secret:'PRIVATE'},{status:409}));assert.equal(response.status,409);assert.deepEqual(await response.json(),{code});}
 const response=await proxyMemberSongRequest(request(),config,async()=>Response.json({code:'PRIVATE_ARCHIVE_CONTENT',secret:'PRIVATE'},{status:409}));assert.deepEqual(await response.json(),{code:'ACCOUNT_REQUEST_FAILED'});
});
test('personal archive safely projects40 metadata entries and accepts bounded complete Unicode workspace responses',async()=>{
 const {proxyMemberSongRequest}=load('member-tools'),song={title:'字'.repeat(160),lyrics:'字'.repeat(40000),style:'字'.repeat(6000)},options=Object.fromEntries(['idea','musicalDirection','mood','lengthStructure','revisionInstructions'].map(key=>[key,'字'.repeat(6000)])),tracks=Array.from({length:40},(_,i)=>({id:'123e4567-e89b-42d3-a456-'+String(i).padStart(12,'0'),title:song.title,createdAt:i,updatedAt:i,lyrics:'PRIVATE',userId:'PRIVATE'}));
 const data={draft:{...draft,...song,previous:song,options,tracks,selectedTrackId:tracks[0].id}};assert.ok(Buffer.byteLength(JSON.stringify(data))>262144);assert.ok(Buffer.byteLength(JSON.stringify(data))<524288);
 const response=await proxyMemberSongRequest(request(),config,async()=>Response.json(data));assert.equal(response.status,200);const result=await response.json();assert.equal(result.draft.tracks.length,40);assert.equal(result.draft.lyrics,song.lyrics);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 assert.equal((await proxyMemberSongRequest(request(),config,async()=>Response.json({...data,padding:'x'.repeat(524288)}))).status,502);
});
test('archive contract accepts only revisioned private selection and valid bounded metadata',()=>{
 const {parseSongRequest,parseSongDraft}=load('barcode-song-contract');const track={id:operation.requestId,title:'Song',createdAt:1,updatedAt:2};assert.equal(parseSongRequest({...operation,kind:'select',options:undefined,trackId:track.id}).trackId,track.id);
 for(const value of [{...operation,kind:'select'},{...operation,kind:'select',trackId:track.id},{...operation,trackId:track.id}])assert.throws(()=>parseSongRequest(value));
 assert.equal(parseSongDraft({...draft,selectedTrackId:track.id,tracks:[track]}).selectedTrackId,track.id);
 for(const value of [{...draft,selectedTrackId:track.id},{...draft,tracks:[track,track]},{...draft,tracks:Array(41).fill(track)},{...draft,tracks:[{...track,createdAt:-1}]}])assert.throws(()=>parseSongDraft(value));
});
