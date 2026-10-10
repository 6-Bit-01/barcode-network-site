import {createSystemClashTournaments,TournamentError} from "@/lib/system-clash-tournament";
import {systemClashTournamentStore} from "@/lib/system-clash-tournament-store";
import {requireSystemClashMember,SystemClashMemberError} from "@/lib/system-clash-member";
import {getOnlineMatchEvidence,OnlineRoomError} from "@/lib/system-clash-online";
import {onlineRoomStore} from "@/lib/system-clash-online-store";
import {createOnlineTurnCredentials} from "@/lib/system-clash-turn";
import {createCloudflareVoiceProvider,createTournamentVoiceService,tournamentVoiceResources,TournamentVoiceError} from "@/lib/system-clash-voice";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
const fields:Record<string,string[]>={status:[],ice:[],publish:["offer","mid"],subscribe:[],answer:["handle","answer"],ready:["handle"],heartbeat:["handle"],close:["handle"]};
async function body(request:Request){
 if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new TournamentVoiceError("Use a JSON voice request.",415);
 if(Number(request.headers.get("content-length")??0)>70000)throw new TournamentVoiceError("Voice request is too large.",413);
 const reader=request.body?.getReader();if(!reader)throw new TournamentVoiceError("Invalid voice request.");
 const decoder=new TextDecoder();let text="",bytes=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>70000){await reader.cancel().catch(()=>{});throw new TournamentVoiceError("Voice request is too large.",413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 let value:Record<string,unknown>;try{value=JSON.parse(text);}catch{throw new TournamentVoiceError("Invalid voice request.");}
 if(!value||typeof value!=="object"||Array.isArray(value)||typeof value.action!=="string"||!Object.hasOwn(fields,value.action)||Object.keys(value).some(k=>!["code","action",...fields[value.action as string]].includes(k))||typeof value.code!=="string"||!/^[A-Z0-9]{6}$/.test(value.code))throw new TournamentVoiceError("Invalid voice request.");
 return value;
}
export async function POST(request:Request){
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")return reply({error:"Use the tournament's own voice controls."},403);
 try{
  const value=await body(request),authenticated=await requireSystemClashMember(request),actor={id:authenticated.id,name:authenticated.name,sessionExpiresAt:Date.parse(authenticated.sessionExpiresAt)},store=systemClashTournamentStore();
  const action=String(value.action),ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown",bucket=action==="status"?"voice-status":action==="heartbeat"?"voice-heartbeat":action==="close"?"voice-close":"voice-media";
  if(!await store.allow(actor.id+":"+ip,bucket,action==="status"?45:action==="heartbeat"?20:action==="close"?60:12))throw new TournamentVoiceError("Too many voice requests. Please wait a moment.",429);
  const readMatch=(v:{code:string;matchId:number;requireResult:boolean})=>getOnlineMatchEvidence({store:onlineRoomStore(),...v}),domain=createSystemClashTournaments({store,readMatch}),service=createTournamentVoiceService({provider:createCloudflareVoiceProvider(),resources:tournamentVoiceResources(),readContext:(code,member)=>domain.readVoiceContext(code,member),readMatch});
  const {action:unused,...input}=value;void unused;
  if(action==="status")return reply(await service.status(String(value.code),actor));
  if(action==="ice"){
   const state=await service.status(String(value.code),actor);if(!state.available||!state.active)return reply({iceServers:[]});
   try{return reply(await createOnlineTurnCredentials());}catch{return reply({iceServers:[]});}
  }
  if(action==="publish")return reply(await service.publish(input,actor));
  if(action==="subscribe")return reply(await service.subscribe(input,actor));
  if(action==="answer")return reply(await service.answer(input,actor));
  if(action==="ready")return reply(await service.ready(input,actor));
  if(action==="heartbeat")return reply(await service.heartbeat(input,actor));
  if(action==="close")return reply(await service.close(input,actor));
  throw new TournamentVoiceError("Invalid voice action.");
 }catch(error){
  if(error instanceof TournamentVoiceError||error instanceof TournamentError||error instanceof OnlineRoomError||error instanceof SystemClashMemberError)return reply({error:error.message},error.status);
  return reply({error:"Fighter voice is currently unavailable."},503);
 }
}
