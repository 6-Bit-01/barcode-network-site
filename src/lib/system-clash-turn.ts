import "server-only";

export type SystemClashIceServer = {urls:string[];username?:string;credential?:string};
export type SystemClashTurnConfiguration = {iceServers:SystemClashIceServer[];realtimeRelay:boolean};
const MAX_RESPONSE_BYTES=16384;
const allowedUrls=new Set([
 "stun:stun.cloudflare.com:3478",
 "turn:turn.cloudflare.com:3478?transport=udp",
 "turn:turn.cloudflare.com:443?transport=udp",
 "turn:turn.cloudflare.com:3478?transport=tcp",
 "turn:turn.cloudflare.com:80?transport=tcp",
 "turns:turn.cloudflare.com:5349?transport=tcp",
 "turns:turn.cloudflare.com:443?transport=tcp",
]);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const unavailable=()=>new Error("Realtime relay is temporarily unavailable.");

async function boundedJson(response:Response):Promise<unknown>{
 if(!response.ok||!response.body||Number(response.headers.get("content-length")??0)>MAX_RESPONSE_BYTES){
  await response.body?.cancel().catch(()=>{});
  throw unavailable();
 }
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw unavailable();chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function normalize(value:unknown,secrets:string[]):SystemClashIceServer[]{
 if(!object(value)||!Array.isArray(value.iceServers)||value.iceServers.length<1||value.iceServers.length>8)throw unavailable();
 const result:SystemClashIceServer[]=[];let relay=false;
 for(const raw of value.iceServers){
  if(!object(raw))throw unavailable();
  const source=typeof raw.urls==="string"?[raw.urls]:raw.urls;
  if(!Array.isArray(source)||source.length<1||source.length>8)throw unavailable();
  const urls:string[]=[];
  for(const url of source){
   if(typeof url!=="string"||url.length>256)throw unavailable();
   // Browsers block port53; retain only the documented Cloudflare browser endpoints.
   if(/^(?:stun:stun|turns?:turn)\.cloudflare\.com:53(?:\?transport=(?:udp|tcp))?$/.test(url))continue;
   if(!allowedUrls.has(url))throw unavailable();
   if(!urls.includes(url))urls.push(url);
  }
  if(!urls.length)continue;
  const server:SystemClashIceServer={urls};
  if(urls.some(url=>url.startsWith("turn:")||url.startsWith("turns:"))){
   for(const field of ["username","credential"] as const){
    const text=raw[field];
    if(typeof text!=="string"||text.length<1||text.length>512||!/^[\x21-\x7e]+$/.test(text)||secrets.some(secret=>text.includes(secret)))throw unavailable();
    server[field]=text;
   }
   relay=true;
  }
  result.push(server);
 }
 if(!relay)throw unavailable();
 return result;
}

/** Generates short-lived browser credentials; the provider key never leaves the server. */
export async function createOnlineTurnCredentials({fetch:fetcher=globalThis.fetch,env=process.env}:{fetch?:typeof globalThis.fetch;env?:NodeJS.ProcessEnv}={}):Promise<SystemClashTurnConfiguration>{
 const key=env.SYSTEM_CLASH_TURN_KEY_ID??"",token=env.SYSTEM_CLASH_TURN_API_TOKEN??"";
 if(!key&&!token)return {iceServers:[],realtimeRelay:false};
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(key)||!token||token.length>512||!/^[\x21-\x7e]+$/.test(token))throw new Error("Realtime relay configuration is unavailable.");
 try{
  const response=await fetcher("https://rtc.live.cloudflare.com/v1/turn/keys/"+key+"/credentials/generate-ice-servers",{
   method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({ttl:1260}),
  });
  return {iceServers:normalize(await boundedJson(response),[key,token]),realtimeRelay:true};
 }catch{throw unavailable();}
}
