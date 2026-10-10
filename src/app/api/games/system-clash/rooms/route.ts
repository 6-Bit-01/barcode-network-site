import {NextResponse} from "next/server";
import {createOnlineRooms,OnlineRoomError} from "@/lib/system-clash-online";
import {onlineRoomStore} from "@/lib/system-clash-online-store";
import {createOnlineTurnCredentials} from "@/lib/system-clash-turn";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function reply(value:unknown,status=200){return NextResponse.json(value,{status,headers});}
function ip(req:Request){return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";}
function failure(error:unknown){if(error instanceof OnlineRoomError)return reply({error:error.message},error.status);return reply({error:"Online sessions are temporarily unavailable. Solo and local play remain available."},503);}
export async function GET(req:Request){try{const store=onlineRoomStore();if(!await store.allow(ip(req),"list",30))return reply({error:"Please wait before refreshing sessions."},429);return reply({rooms:await createOnlineRooms({store}).list()});}catch(error){return failure(error);}}
async function boundedBody(req:Request){
 const reader=req.body?.getReader();if(!reader)return "";
 const decoder=new TextDecoder();let bytes=0,text="";
 try{
  while(true){
   const chunk=await reader.read();if(chunk.done)break;
   bytes+=chunk.value.byteLength;
   if(bytes>75000){try{await reader.cancel();}catch{}throw new OnlineRoomError("Session request is too large.",413);}
   text+=decoder.decode(chunk.value,{stream:true});
  }
  return text+decoder.decode();
 }finally{reader.releaseLock();}
}
export async function POST(req:Request){
 const origin=req.headers.get("origin");if((origin&&origin!==new URL(req.url).origin)||req.headers.get("sec-fetch-site")==="cross-site")return reply({error:"Use the game's own session page."},403);
 if(!req.headers.get("content-type")?.includes("application/json"))return reply({error:"Invalid session request."},415);
 try{
  const declared=Number(req.headers.get("content-length")??0);if(declared>75000)throw new OnlineRoomError("Session request is too large.",413);
  const text=await boundedBody(req);
  let body;try{body=JSON.parse(text);}catch{throw new OnlineRoomError("Invalid session request.");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new OnlineRoomError("Invalid session request.");
  const store=onlineRoomStore(),rooms=createOnlineRooms({store}),action=body.action;
  if(!await store.allow(ip(req),action==="relay"?"relay":["create","join"].includes(action)?"enter":"seat",action==="relay"?600:["create","join"].includes(action)?12:240))return reply({error:"Too many requests. Please wait a moment."},429);
  const key=req.headers.get("authorization")?.replace(/^Bearer /,"")??"";
  if(action==="create")return reply(await rooms.create(body.name));
  if(action==="join")return reply(await rooms.join(body.code,body.name));
  if(action==="poll")return reply(await rooms.poll(body.code,key));
  if(action==="ice"){
   const room=await rooms.poll(body.code,key);
   if(!room.host||!room.guest||!room.host.ready||!room.guest.ready)throw new OnlineRoomError("Both players must be ready for a realtime relay.",409);
   return reply(await createOnlineTurnCredentials());
  }
  if(action==="begin")return reply(await rooms.begin(body.code,key,{after:body.after}));
  if(action==="result")return reply(await rooms.result(body.code,key,{matchId:body.matchId,winner:body.winner}));
  if(action==="lobby")return reply(await rooms.lobby(body.code,key));
  if(action==="resume")return reply(await rooms.resume(body.code,key));
  if(action==="select")return reply(await rooms.select(body.code,key,{fighter:body.fighter,ready:body.ready}));
  if(action==="candidates")return reply(await rooms.candidates(body.code,key,body));
  if(action==="relay")return reply(await rooms.relay(body.code,key,body));
  if(action==="signal")return reply(await rooms.signal(body.code,key,body.description));
  if(action==="leave")return reply(await rooms.leave(body.code,key));
  throw new OnlineRoomError("Unknown session action.");
 }catch(error){return failure(error);}
}
