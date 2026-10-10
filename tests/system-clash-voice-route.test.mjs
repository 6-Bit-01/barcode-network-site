import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url),original=Module._load;
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const path=new URL('../src/app/api/games/system-clash/tournaments/voice/route.ts',import.meta.url);
let denied=false,limited=false,calls=0,auth=0;
class MemberError extends Error{constructor(message='Sign in.',status=401){super(message);this.status=status;}}
class VoiceError extends Error{constructor(message='Invalid request.',status=400){super(message);this.status=status;}}
Module._load=function(id,parent,main){
 if(id==='@/lib/system-clash-member')return{SystemClashMemberError:MemberError,requireSystemClashMember:async()=>{auth++;if(denied)throw new MemberError();return{id:'one',name:'One',sessionExpiresAt:'2099-01-01T00:00:00Z'};}};
 if(id==='@/lib/system-clash-tournament-store')return{systemClashTournamentStore:()=>({allow:async()=>!limited})};
 if(id==='@/lib/system-clash-tournament')return{TournamentError:MemberError,createSystemClashTournaments:()=>({readVoiceContext:async()=>({})})};
 if(id==='@/lib/system-clash-online')return{OnlineRoomError:MemberError,getOnlineMatchEvidence:async()=>({})};
 if(id==='@/lib/system-clash-online-store')return{onlineRoomStore:()=>({})};
 if(id==='@/lib/system-clash-turn')return{createOnlineTurnCredentials:async()=>({iceServers:[]})};
 if(id==='@/lib/system-clash-voice')return{TournamentVoiceError:VoiceError,createCloudflareVoiceProvider:()=>({enabled:false}),tournamentVoiceResources:()=>({}),createTournamentVoiceService:()=>({status:async()=>{calls++;return{available:false};},publish:async v=>{calls++;return{accepted:v};},subscribe:async()=>({}),close:async()=>({})})};
 return original.call(this,id,parent,main);
};
const route=fs.existsSync(path)?require(path.pathname.replace(/^\/([A-Za-z]:)/,'$1')):{POST:async()=>new Response('{}')};Module._load=original;
const url='https://example.com/api/games/system-clash/tournaments/voice';
const request=(body,headers={})=>new Request(url,{method:'POST',headers:{origin:'https://example.com','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('voice route authenticates and returns a private unavailable state without activation',async()=>{denied=true;assert.equal((await route.POST(request({action:'status',code:'ABCDEF'}))).status,401);denied=false;const response=await route.POST(request({action:'status',code:'ABCDEF'}));assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).available,false);});
test('cross-site, wrong MIME, oversized and arbitrary track references do not reach voice authority',async()=>{const before=calls;assert.equal((await route.POST(request({action:'status',code:'ABCDEF'},{origin:'https://elsewhere.example'}))).status,403);assert.equal((await route.POST(request({action:'status',code:'ABCDEF'},{'content-type':'text/plain'}))).status,415);assert.equal((await route.POST(new Request(url,{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:'x'.repeat(76000)}))).status,413);assert.equal((await route.POST(request({action:'subscribe',code:'ABCDEF',sessionId:'other'}))).status,400);assert.equal(calls,before);});
test('rate limit applies after member authentication and before SFU work',async()=>{const before=calls,count=auth;limited=true;assert.equal((await route.POST(request({action:'status',code:'ABCDEF'}))).status,429);limited=false;assert.equal(auth,count+1);assert.equal(calls,before);});
