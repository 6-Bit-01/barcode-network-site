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
const discardedStun443Urls=new Set(['stun:stun.cloudflare.com:443','stun:turn.cloudflare.com:443']);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const unavailable=()=>new Error("Realtime relay is temporarily unavailable.");
type ValidationStage="provider"|"payload"|"schema"|"urls"|"username"|"credential";
type ValidationCategory="body_missing"|"size_exceeded"|"read_failed"|"json_invalid"|"ice_servers_invalid"|"server_count_invalid"|"server_invalid"|"shape_invalid"|"count_invalid"|"value_invalid"|"endpoint_unsupported"|"long_term_token_match"|"key_id_match"|"relay_missing"|"status_unavailable"|"request_failed";
type EndpointDetails={scheme:"stun"|"turn"|"turns"|"other";transport:"udp"|"tcp"|"missing"|"other";port:number;host:"stun"|"turn"|"other"};
type ValidationDetails={responseBytes?:number;serverCount?:number;serverIndex?:number;urlCount?:number;urlIndex?:number;valueLength?:number;status?:number;blockedPort53Count?:number}&Partial<EndpointDetails>;
class TurnValidationError extends Error{
 readonly diagnostic:ValidationDetails&{stage:ValidationStage;category:ValidationCategory};
 constructor(stage:ValidationStage,category:ValidationCategory,details:ValidationDetails={}){
  super("Realtime relay is temporarily unavailable.");
  this.diagnostic={stage,category,...details};
 }
}
const invalid=(stage:ValidationStage,category:ValidationCategory,details:ValidationDetails={})=>new TurnValidationError(stage,category,details);

const browserBlockedPort53=/^(?:stun:stun|turns?:turn)\.cloudflare\.com:53(?:\?transport=(?:udp|tcp))?$/;
function endpointDetails(url:string):EndpointDetails{
 const parsed=/^([A-Za-z][A-Za-z0-9+.-]*):(?:\/\/)?([^/?#]*)(?:\?([^#]*))?$/.exec(url);
 const rawScheme=parsed?.[1],scheme=rawScheme==="stun"||rawScheme==="turn"||rawScheme==="turns"?rawScheme:"other";
 const address=/^(?:[^@]*@)?([^:]+)(?::([0-9]+))?$/.exec(parsed?.[2]??"");
 const candidatePort=Number(address?.[2]??0),port=Number.isSafeInteger(candidatePort)&&candidatePort>=0&&candidatePort<=65535?candidatePort:0;
 const transports=new URLSearchParams(parsed?.[3]??"").getAll("transport");
 const transport=transports.length===0?"missing":transports.length===1&&(transports[0]==="udp"||transports[0]==="tcp")?transports[0]:"other";
 return {scheme,transport,port,host:address?.[1]==="stun.cloudflare.com"?"stun":address?.[1]==="turn.cloudflare.com"?"turn":"other"};
}
type FieldDetails={type:"string"|"missing"|"null"|"array"|"object"|"number"|"boolean"|"other";length:number;includesKeyId:boolean;includesApiToken:boolean};
type ProviderSummary={serverCount:number;servers:{serverIndex:number;urlCount:number;endpoints:EndpointDetails[];username:FieldDetails;credential:FieldDetails}[]};
function fieldDetails(value:unknown,secrets:string[]):FieldDetails{
 const type=typeof value==="string"?"string":value===undefined?"missing":value===null?"null":Array.isArray(value)?"array":typeof value==="object"?"object":typeof value==="number"?"number":typeof value==="boolean"?"boolean":"other";
 return {type,length:typeof value==="string"?value.length:0,includesKeyId:typeof value==="string"&&value.includes(secrets[0]),includesApiToken:typeof value==="string"&&value.includes(secrets[1])};
}
function summarizeProvider(value:unknown,secrets:string[]):ProviderSummary|undefined{
 if(!object(value)||!Array.isArray(value.iceServers))return;
 return {serverCount:value.iceServers.length,servers:value.iceServers.slice(0,8).map((raw,serverIndex)=>{
  const row=object(raw)?raw:{},source=typeof row.urls==="string"?[row.urls]:Array.isArray(row.urls)?row.urls:[];
  return {serverIndex,urlCount:source.length,endpoints:source.slice(0,8).map(url=>endpointDetails(typeof url==="string"?url:"")),username:fieldDetails(row.username,secrets),credential:fieldDetails(row.credential,secrets)};
 })};
}
async function boundedJson(response:Response):Promise<unknown>{
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw invalid("provider","status_unavailable",{status:response.status});}
 if(!response.body)throw invalid("payload","body_missing");
 const declared=Number(response.headers.get("content-length")??0);
 if(declared>MAX_RESPONSE_BYTES){await response.body.cancel().catch(()=>{});throw invalid("payload","size_exceeded",Number.isSafeInteger(declared)?{responseBytes:declared}:{});}
 let reader:ReadableStreamDefaultReader<Uint8Array>;
 try{reader=response.body.getReader();}catch{throw invalid("payload","read_failed");}
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   let chunk:ReadableStreamReadResult<Uint8Array>;
   try{chunk=await reader.read();}catch{throw invalid("payload","read_failed");}
   if(chunk.done)break;
   size+=chunk.value.byteLength;if(size>MAX_RESPONSE_BYTES)throw invalid("payload","size_exceeded",{responseBytes:size});chunks.push(chunk.value);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw invalid("payload","json_invalid",{responseBytes:size});}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function normalize(value:unknown,secrets:string[]):SystemClashIceServer[]{
 if(!object(value)||!Array.isArray(value.iceServers))throw invalid("schema","ice_servers_invalid");
 if(value.iceServers.length<1||value.iceServers.length>8)throw invalid("schema","server_count_invalid",{serverCount:value.iceServers.length});
 const result:SystemClashIceServer[]=[];let relay=false;
 for(const [serverIndex,raw]of value.iceServers.entries()){
  if(!object(raw))throw invalid("schema","server_invalid",{serverIndex});
  const source=typeof raw.urls==="string"?[raw.urls]:raw.urls;
  if(!Array.isArray(source))throw invalid("urls","shape_invalid",{serverIndex});
  if(source.length<1||source.length>8)throw invalid("urls","count_invalid",{serverIndex,urlCount:source.length,blockedPort53Count:source.filter(url=>typeof url==="string"&&browserBlockedPort53.test(url)).length});
  const urls:string[]=[];
  for(const [urlIndex,url]of source.entries()){
   if(typeof url!=="string"||url.length>256)throw invalid("urls","value_invalid",{serverIndex,urlIndex,...(typeof url==="string"?{valueLength:url.length}:{})});
   // Drop blocked port53 and known provider STUN443 extras; retain documented relay endpoints.
   if(browserBlockedPort53.test(url)||discardedStun443Urls.has(url))continue;
   if(!allowedUrls.has(url))throw invalid("urls","endpoint_unsupported",{serverIndex,urlIndex,...endpointDetails(url)});
   if(!urls.includes(url))urls.push(url);
  }
  if(!urls.length)continue;
  const server:SystemClashIceServer={urls};
  if(urls.some(url=>url.startsWith("turn:")||url.startsWith("turns:"))){
   for(const field of ["username","credential"] as const){
    const text=raw[field];
    const details={serverIndex,...(typeof text==="string"?{valueLength:text.length}:{})};
    if(typeof text!=="string"||text.length<1||text.length>512||!/^[\x21-\x7e]+$/.test(text))throw invalid(field,"value_invalid",details);
    if(text.includes(secrets[1]))throw invalid(field,"long_term_token_match",details);
    if(text.includes(secrets[0]))throw invalid(field,"key_id_match",details);
    server[field]=text;
   }
   relay=true;
  }
  result.push(server);
 }
 if(!relay)throw invalid("schema","relay_missing");
 return result;
}

/** Generates short-lived browser credentials; the provider key never leaves the server. */
export async function createOnlineTurnCredentials({fetch:fetcher=globalThis.fetch,env=process.env}:{fetch?:typeof globalThis.fetch;env?:NodeJS.ProcessEnv}={}):Promise<SystemClashTurnConfiguration>{
 const key=env.SYSTEM_CLASH_TURN_KEY_ID??"",token=env.SYSTEM_CLASH_TURN_API_TOKEN??"";
 if(!key&&!token)return {iceServers:[],realtimeRelay:false};
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(key)||!token||token.length>512||!/^[\x21-\x7e]+$/.test(token))throw new Error("Realtime relay configuration is unavailable.");
 let payload:unknown;
 try{
  const response=await fetcher("https://rtc.live.cloudflare.com/v1/turn/keys/"+key+"/credentials/generate-ice-servers",{
   method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({ttl:1260}),
  });
  payload=await boundedJson(response);
  return {iceServers:normalize(payload,[key,token]),realtimeRelay:true};
 }catch(error){
  // Only fixed labels, bounded summaries, numbers and booleans; never provider values or errors.
  const diagnostic=error instanceof TurnValidationError?error.diagnostic:{stage:"provider",category:"request_failed"};
  const providerSummary=error instanceof TurnValidationError?summarizeProvider(payload,[key,token]):undefined;
  console.error("System Clash TURN validation failed",JSON.stringify(providerSummary?{...diagnostic,providerSummary}:diagnostic));
  throw unavailable();
 }
}
