import {createSystemClashTournaments,TournamentError} from "@/lib/system-clash-tournament";
import {systemClashTournamentStore} from "@/lib/system-clash-tournament-store";
import {requireSystemClashMember,SystemClashMemberError} from "@/lib/system-clash-member";
import {getOnlineMatchEvidence,getOnlineRoomEvidence,reserveOnlineTournamentRoom,bindOnlineTournamentMatch,OnlineRoomError} from "@/lib/system-clash-online";
import {onlineRoomStore} from "@/lib/system-clash-online-store";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
function failure(error:unknown){if(error instanceof TournamentError||error instanceof OnlineRoomError)return reply({error:error.message},error.status);if(error instanceof SystemClashMemberError)return reply({error:error.message,code:error.code},error.status);return reply({error:"Live tournaments are temporarily unavailable."},503);}
function sameOrigin(request:Request){const origin=request.headers.get("origin");return (!origin||origin===new URL(request.url).origin)&&request.headers.get("sec-fetch-site")!=="cross-site";}
async function body(request:Request){
 if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new TournamentError("Use a JSON tournament request.",415);
 if(Number(request.headers.get("content-length")??0)>16384)throw new TournamentError("Tournament request is too large.",413);
 const reader=request.body?.getReader();if(!reader)throw new TournamentError("The tournament request is invalid.");const decoder=new TextDecoder();let text="",bytes=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>16384){await reader.cancel().catch(()=>{});throw new TournamentError("Tournament request is too large.",413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 try{return JSON.parse(text);}catch{throw new TournamentError("The tournament request is invalid.");}
}
async function context(request:Request,bucket:"read"|"write"){
 const authenticated=await requireSystemClashMember(request),member={id:authenticated.id,name:authenticated.name,sessionExpiresAt:Date.parse(authenticated.sessionExpiresAt)},store=systemClashTournamentStore();
 const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";
 if(!await store.allow(member.id+":"+ip,bucket,bucket==="read"?120:90))throw new TournamentError("Too many tournament requests. Please wait a moment.",429);
 const domain=createSystemClashTournaments({store,readMatch:value=>getOnlineMatchEvidence({store:onlineRoomStore(),...value}),readRoom:value=>getOnlineRoomEvidence({store:onlineRoomStore(),...value}),reserveMatch:value=>reserveOnlineTournamentRoom({store:onlineRoomStore(),...value}),bindMatch:value=>bindOnlineTournamentMatch({store:onlineRoomStore(),...value})});return {member,domain};
}
export async function GET(request:Request){
 if(!sameOrigin(request))return reply({error:"Use the game's own tournament page."},403);
 try{const url=new URL(request.url);if([...url.searchParams.keys()].some(key=>key!=="code")||url.searchParams.getAll("code").length>1)throw new TournamentError("The tournament request is invalid.");const {member,domain}=await context(request,"read"),code=url.searchParams.get("code");return reply(code?await domain.view(code,member):await domain.list(member));}catch(error){return failure(error);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return reply({error:"Use the game's own tournament page."},403);
 try{const value=await body(request),{member,domain}=await context(request,"write");return reply(await domain.command(member,value));}catch(error){return failure(error);}
}


