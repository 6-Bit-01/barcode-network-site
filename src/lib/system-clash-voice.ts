import {createHash,randomUUID} from "node:crypto";
import {Redis} from "@upstash/redis";

export class TournamentVoiceError extends Error {constructor(message:string,public status=400){super(message);}}
type Actor={id:string;name:string;sessionExpiresAt:number};
type Entrant={id:string;memberId:string;fighter:string};
export type VoiceContext={code:string;status:string;currentBoutId:string|null;hostMemberId:string;bout:{id:string;status:string;roomCode:string|null;roomMatchId:number|null;roomCreatedAt?:number|null;p1:string;p2:string}|null;entrants:Entrant[]};
type Evidence={code:string;createdAt?:number;matchId:number;matchPhase:string;hostMemberId:string;guestMemberId:string|null;hostFighter:string;guestFighter:string;tournament?:{code:string;boutId:string;matchId?:number}|null};
type Description={type:"offer"|"answer";sdp:string};
type Resource={handle:string;code:string;binding:string;memberId:string;kind:"publish"|"subscribe";sessionId:string;mids:string[];expiresAt:number;entrantId?:string;fighter?:string;trackName?:string;ready?:boolean;closing?:boolean;updatedAt:number};
type Publication=Resource & {entrantId:string;fighter:string;trackName:string};
export interface VoiceResourceStore {read(handle:string):Promise<Resource|null>;write(handle:string,value:Resource):Promise<unknown>;remove(handle:string):Promise<unknown>;publications(binding:string):Promise<Publication[]>;renew(value:Resource,activate?:boolean):Promise<boolean>;beginClose(value:Resource):Promise<Resource|null>;}
type ProviderResult={sessionId?:string;sessionDescription?:Description;tracks?:{mid?:string;trackName?:string;errorCode?:string}[];errorCode?:string};
type Provider={enabled:boolean;request(path:string,method?:string,body?:unknown):Promise<ProviderResult>};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const unavailable=()=>new TournamentVoiceError("Fighter voice is currently unavailable.",503);
const fingerprint=(v:string)=>createHash("sha256").update(v).digest("hex");
function fields(value:unknown,allowed:string[]){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new TournamentVoiceError("Invalid voice request.");return value;}
function description(value:unknown,type:"offer"|"answer",count=1,sendOnly=false):Description{
 if(!object(value)||Object.keys(value).some(k=>!["type","sdp"].includes(k))||value.type!==type||typeof value.sdp!=="string"||value.sdp.length>65536||!value.sdp.startsWith("v=0")||value.sdp.includes("\0"))throw new TournamentVoiceError("Invalid voice description.");
 const media=value.sdp.match(/^m=\S+/gm)??[];
 if(media.length!==count||media.some(m=>m!=="m=audio"))throw new TournamentVoiceError("Voice accepts audio tracks only.");
 if(sendOnly&&!/^a=sendonly\r?$/m.test(value.sdp))throw new TournamentVoiceError("Voice publication must be send-only.");
 return {type,sdp:value.sdp};
}
export function createCloudflareVoiceProvider({fetch:fetcher=globalThis.fetch,env=process.env}:{fetch?:typeof fetch;env?:NodeJS.ProcessEnv}={}):Provider{
 const app=env.SYSTEM_CLASH_SFU_APP_ID??"",secret=env.SYSTEM_CLASH_SFU_APP_SECRET??"";
 const enabled=env.SYSTEM_CLASH_VOICE_ENABLED==="1"&&/^[a-zA-Z0-9_-]{1,128}$/.test(app)&&secret.length>0&&secret.length<=512&&/^[\x21-\x7e]+$/.test(secret);
 return {enabled,async request(path,method="POST",body){
  if(!enabled)throw unavailable();
  if(!/^sessions\/(?:new|[a-zA-Z0-9_-]{1,128}\/(?:tracks\/new|tracks\/close|renegotiate))$/.test(path))throw unavailable();
  let response:Response;try{response=await fetcher("https://rtc.live.cloudflare.com/v1/apps/"+app+"/"+path,{method,headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});}catch{throw unavailable();}
  const reader=response.body?.getReader();if(!reader)throw unavailable();let bytes=0,text="";const decoder=new TextDecoder();
  try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>75000){await reader.cancel();throw unavailable();}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  let result:ProviderResult;try{result=JSON.parse(text);}catch{throw unavailable();}
  if(!response.ok||!object(result)||result.errorCode)throw unavailable();
  return result;
 }};
}

const VOICE_RENEW=`
local raw=redis.call('GET',KEYS[1])
if not raw then return 0 end
local current=cjson.decode(raw)
local next=cjson.decode(ARGV[1])
if current.closing or current.handle~=next.handle or current.memberId~=next.memberId or current.binding~=next.binding or current.sessionId~=next.sessionId then return 0 end
current.updatedAt=math.max(current.updatedAt,next.updatedAt)
if #next.mids>0 then current.mids=next.mids end
if ARGV[3]=='1' then current.ready=true end
local encoded=cjson.encode(current)
redis.call('SET',KEYS[1],encoded,'EX',ARGV[2])
if current.kind=='publish' and current.ready then
 redis.call('HSET',KEYS[2],current.entrantId,encoded)
 redis.call('EXPIRE',KEYS[2],90)
end
return 1
`;
const VOICE_BEGIN_CLOSE=`
local raw=redis.call('GET',KEYS[1])
if not raw then return '' end
local current=cjson.decode(raw)
local expected=cjson.decode(ARGV[1])
if current.handle~=expected.handle or current.memberId~=expected.memberId or current.binding~=expected.binding or current.sessionId~=expected.sessionId then return '' end
current.closing=true
current.ready=false
local encoded=cjson.encode(current)
redis.call('SET',KEYS[1],encoded,'EX',ARGV[2])
if current.kind=='publish' then
 local published=redis.call('HGET',KEYS[2],current.entrantId)
 if published and cjson.decode(published).handle==current.handle then redis.call('HDEL',KEYS[2],current.entrantId) end
end
return encoded
`;

/** SFU resource registry only; tournament/room identity remains with their existing owners. */
export function tournamentVoiceResources():VoiceResourceStore{
 let client:Redis|null=null;
 function redis(){if(client)return client;const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!token)throw unavailable();return client=new Redis({url,token,automaticDeserialization:false,retry:false,signal:AbortSignal.timeout(3000)});}
 const prefix="system-clash-voice:v1:",session=(handle:string)=>prefix+"session:"+fingerprint(handle),pub=(binding:string)=>prefix+"publications:"+fingerprint(binding);
 return{
  async read(handle){const value=await redis().get<string>(session(handle));return typeof value==="string"?JSON.parse(value):null;},
  async write(handle,value){return redis().set(session(handle),JSON.stringify(value),{ex:Math.max(1,Math.ceil((value.expiresAt-Date.now())/1000))});},
  remove:handle=>redis().del(session(handle)),
  async publications(binding){const values=await redis().hgetall<Record<string,string>>(pub(binding));return Object.values(values??{}).map(value=>typeof value==="string"?JSON.parse(value):value) as Publication[];},
  async renew(value,activate=false){return Number(await redis().eval(VOICE_RENEW,[session(value.handle),pub(value.binding)],[JSON.stringify(value),Math.max(1,Math.ceil((value.expiresAt-Date.now())/1000)),activate?"1":"0"]))===1;},
  async beginClose(value){const raw=await redis().eval(VOICE_BEGIN_CLOSE,[session(value.handle),pub(value.binding)],[JSON.stringify(value),Math.max(1,Math.ceil((value.expiresAt-Date.now())/1000))]);return typeof raw==="string"&&raw?JSON.parse(raw):null;},
 };
}
export function createTournamentVoiceService({provider,resources,readContext,readMatch,now=Date.now,id=randomUUID}:{provider:Provider;resources:VoiceResourceStore;readContext:(code:string,actor:Actor)=>Promise<VoiceContext>;readMatch:(value:{code:string;matchId:number;requireResult:boolean})=>Promise<Evidence>;now?:()=>number;id?:()=>string}){
 function member(actor:Actor){if(!actor?.id||!Number.isFinite(actor.sessionExpiresAt)||actor.sessionExpiresAt<=now())throw new TournamentVoiceError("Sign in to use fighter voice.",401);}
 const binding=(ctx:VoiceContext)=>[ctx.code,ctx.bout!.id,ctx.bout!.roomCode,ctx.bout!.roomCreatedAt??"",ctx.bout!.roomMatchId].join(":");
 async function context(code:string,actor:Actor,strict=true){
  member(actor);if(!/^[A-Z0-9]{6}$/.test(code))throw new TournamentVoiceError("Choose a tournament.");
  const ctx=await readContext(code,actor),b=ctx.bout;
  if(ctx.status!=="running"||!b||ctx.currentBoutId!==b.id||b.status!=="live"||!b.roomCode||!b.roomMatchId){if(strict)throw new TournamentVoiceError("Voice is available only during the current live match.",409);return null;}
  const players=[b.p1,b.p2].map(p=>ctx.entrants.find(e=>e.id===p));if(players.some(p=>!p))throw new TournamentVoiceError("This match has no assigned fighters.",409);
  const match=await readMatch({code:b.roomCode,matchId:b.roomMatchId,requireResult:false});
  if(!match||match.code!==b.roomCode||match.matchId!==b.roomMatchId||match.matchPhase!=="match"||b.roomCreatedAt!=null&&match.createdAt!==b.roomCreatedAt||match.hostMemberId!==players[0]!.memberId||match.guestMemberId!==players[1]!.memberId||match.hostFighter!==players[0]!.fighter||match.guestFighter!==players[1]!.fighter||match.tournament?.code!==ctx.code||match.tournament?.boutId!==b.id||match.tournament.matchId!==undefined&&match.tournament.matchId!==b.roomMatchId)throw new TournamentVoiceError("The voice match binding changed.",409);
  return ctx;
 }
 function publishing(ctx:VoiceContext,actor:Actor){const own=ctx.entrants.find(e=>e.memberId===actor.id&&[ctx.bout!.p1,ctx.bout!.p2].includes(e.id));if(!own)throw new TournamentVoiceError("Only the two assigned fighters may enable a microphone.",403);return own;}
 async function livePublications(ctx:VoiceContext){return(await resources.publications(binding(ctx))).filter(p=>p.ready&&p.expiresAt>now()&&now()-p.updatedAt<30000&&[ctx.bout!.p1,ctx.bout!.p2].includes(p.entrantId));}
 async function owned(code:string,handle:unknown,actor:Actor,live=true){
  member(actor);if(typeof handle!=="string"||!/^[a-zA-Z0-9_-]{8,128}$/.test(handle))throw new TournamentVoiceError("Invalid voice handle.");
  const record=await resources.read(handle);if(!record||record.code!==code||record.expiresAt<=now())throw new TournamentVoiceError("The voice session ended.",410);
  if(record.memberId!==actor.id)throw new TournamentVoiceError("This voice session belongs to another listener.",403);
  if(live){if(record.closing)throw new TournamentVoiceError("The voice session is closing.",409);const ctx=await context(code,actor);if(record.binding!==binding(ctx!))throw new TournamentVoiceError("The voice match changed.",409);if(record.kind==="publish")publishing(ctx!,actor);}
  return record;
 }
 async function cleanup(record:Resource){const closing=await resources.beginClose(record);if(!closing)return;if(closing.mids.length){const result=await provider.request("sessions/"+closing.sessionId+"/tracks/close","PUT",{tracks:closing.mids.map(mid=>({mid})),force:true});if(result.tracks?.some(t=>t.errorCode))throw unavailable();}await resources.remove(closing.handle);}
 async function allocate(ctx:VoiceContext,actor:Actor,kind:Resource["kind"]):Promise<Resource>{
  if(!provider.enabled)throw unavailable();const result=await provider.request("sessions/new");
  if(typeof result.sessionId!=="string"||!/^[a-zA-Z0-9_-]{1,128}$/.test(result.sessionId))throw unavailable();
  return {handle:id(),code:ctx.code,binding:binding(ctx),memberId:actor.id,kind,sessionId:result.sessionId,mids:[],expiresAt:Math.min(actor.sessionExpiresAt,now()+20*60000),updatedAt:now()};
 }
 async function sameContext(ctx:VoiceContext,actor:Actor){const current=await context(ctx.code,actor);if(binding(current!)!==binding(ctx))throw new TournamentVoiceError("The voice match changed.",409);}
 return{
  async status(code:string,actor:Actor){
   member(actor);const ctx=await context(code,actor,false);if(!provider.enabled)return{available:false,active:false,canPublish:false,speakers:[]};
   if(!ctx)return{available:true,active:false,canPublish:false,speakers:[]};
   const speakers=(await livePublications(ctx)).map(p=>({id:fingerprint(p.handle).slice(0,16),entrantId:p.entrantId,fighter:p.fighter}));
   return{available:true,active:true,boutId:ctx.bout!.id,canPublish:ctx.entrants.some(e=>e.memberId===actor.id&&[ctx.bout!.p1,ctx.bout!.p2].includes(e.id)),speakers};
  },
  async publish(value:unknown,actor:Actor){
   const v=fields(value,["code","offer","mid"]),code=String(v.code),offer=description(v.offer,"offer",1,true);if(typeof v.mid!=="string"||!/^[a-zA-Z0-9_-]{1,32}$/.test(v.mid)||!offer.sdp.split(/\r?\n/).includes("a=mid:"+v.mid))throw new TournamentVoiceError("Invalid audio mid.");
   const ctx=(await context(code,actor))!,own=publishing(ctx,actor),record=await allocate(ctx,actor,"publish");
   Object.assign(record,{entrantId:own.id,fighter:own.fighter,trackName:"voice-"+id(),mids:[v.mid]});
   await resources.write(record.handle,record);
   try{
    const result=await provider.request("sessions/"+record.sessionId+"/tracks/new","POST",{sessionDescription:offer,tracks:[{location:"local",mid:v.mid,trackName:record.trackName}]});
    if(!result.tracks||result.tracks.length!==1||result.tracks[0].errorCode||result.tracks[0].mid!==v.mid||result.tracks[0].trackName!==record.trackName)throw unavailable();const remote=description(result.sessionDescription,"answer");await sameContext(ctx,actor);if(!await resources.renew(record))throw new TournamentVoiceError("The voice session closed.",409);
    return{handle:record.handle,sessionDescription:remote,fighter:own.fighter};
   }catch(error){await cleanup(record).catch(()=>{});throw error;}
  },
  async ready(value:unknown,actor:Actor){
   const v=fields(value,["code","handle"]),record=await owned(String(v.code),v.handle,actor);if(record.kind!=="publish")throw new TournamentVoiceError("This voice session cannot publish.",403);
   record.updatedAt=now();if(!await resources.renew(record,true))throw new TournamentVoiceError("The voice session closed.",409);return{ok:true};
  },
  async heartbeat(value:unknown,actor:Actor){
   const v=fields(value,["code","handle"]),record=await owned(String(v.code),v.handle,actor);record.updatedAt=now();if(!await resources.renew(record))throw new TournamentVoiceError("The voice session closed.",409);return{ok:true};
  },
  async subscribe(value:unknown,actor:Actor){
   const v=fields(value,["code"]),ctx=(await context(String(v.code),actor))!,pubs=(await livePublications(ctx)).filter(p=>p.memberId!==actor.id);
   if(!provider.enabled)throw unavailable();if(!pubs.length)return{handle:null,tracks:[]};
   const record=await allocate(ctx,actor,"subscribe");await resources.write(record.handle,record);
   try{
    const result=await provider.request("sessions/"+record.sessionId+"/tracks/new","POST",{tracks:pubs.map(p=>({location:"remote",sessionId:p.sessionId,trackName:p.trackName}))});
    record.mids=(result.tracks??[]).filter(t=>!t.errorCode&&typeof t.mid==="string").map(t=>t.mid!);if(!await resources.renew(record))throw new TournamentVoiceError("The voice session closed.",409);if(!result.tracks||result.tracks.length!==pubs.length||result.tracks.some(t=>t.errorCode))throw unavailable();
    const tracks=result.tracks.map(t=>{const p=pubs.find(p=>p.trackName===t.trackName);if(!p||typeof t.mid!=="string")throw unavailable();return{mid:t.mid,entrantId:p.entrantId,fighter:p.fighter};});
    record.mids=tracks.map(t=>t.mid);const remote=description(result.sessionDescription,"offer",tracks.length);await sameContext(ctx,actor);
    return{handle:record.handle,sessionDescription:remote,tracks};
   }catch(error){await cleanup(record).catch(()=>{});throw error;}
  },
  async answer(value:unknown,actor:Actor){
   const v=fields(value,["code","handle","answer"]),record=await owned(String(v.code),v.handle,actor);if(record.kind!=="subscribe")throw new TournamentVoiceError("This voice session cannot subscribe.",403);
   await provider.request("sessions/"+record.sessionId+"/renegotiate","PUT",{sessionDescription:description(v.answer,"answer",record.mids.length)});await owned(String(v.code),v.handle,actor);return{ok:true};
  },
  async close(value:unknown,actor:Actor){const v=fields(value,["code","handle"]),record=await owned(String(v.code),v.handle,actor,false);await cleanup(record);return{ok:true};},
 };
}
