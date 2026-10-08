import {Redis} from "@upstash/redis";
import {createHash} from "node:crypto";
import {ONLINE_HOST_TIMEOUT,type OnlineRoomStore} from "./system-clash-online";
// Ephemeral game-only signaling. No site identity, queue, canon or BNL consumers.
const PREFIX="barcode:system-clash:online:v1:";
export const GAME_ROOM_CAS=`
local old=redis.call('GET',KEYS[1]) or ''
if old~=ARGV[1] then return 0 end
local entries=cjson.decode(redis.call('GET',KEYS[2]) or '[]')
local next={}
local now=tonumber(ARGV[5])
local hostTimeout=tonumber(ARGV[7])
for _,entry in ipairs(entries) do
 local hostLastSeen=entry.hostLastSeen
 if hostLastSeen==nil then
  local stored=redis.call('GET',ARGV[6]..entry.code)
  if stored then hostLastSeen=cjson.decode(stored).host.lastSeen end
 end
 if entry.code~=ARGV[4] and entry.expiresAt>now and hostLastSeen and now-hostLastSeen<hostTimeout then
  table.insert(next,{code=entry.code,expiresAt=entry.expiresAt,hostLastSeen=hostLastSeen})
 end
end
if ARGV[2]~='' then
 local room=cjson.decode(ARGV[2])
 if room.guest==cjson.null and now-room.host.lastSeen<hostTimeout then
  if #next>=30 then
   if ARGV[1]=='' then return 0 end
  else table.insert(next,{code=ARGV[4],expiresAt=room.expiresAt,hostLastSeen=room.host.lastSeen}) end
 end
 redis.call('SET',KEYS[1],ARGV[2],'EX',tonumber(ARGV[3]))
else redis.call('DEL',KEYS[1]) end
local encoded = #next==0 and '[]' or cjson.encode(next)
local indexTTL=1
for _,entry in ipairs(next) do indexTTL=math.max(indexTTL,math.ceil((entry.expiresAt-now)/1000)) end
redis.call('SET',KEYS[2],encoded,'EX',math.min(1200,indexTTL))
return 1
`;
export function onlineRoomStore():OnlineRoomStore & {allow(ip:string,bucket:string,limit:number):Promise<boolean>}{
 let client:Redis|null=null;
 function redis(){if(client)return client;const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!token)throw new Error("Online session storage is unavailable.");client=new Redis({url,token,automaticDeserialization:false,retry:false,signal:AbortSignal.timeout(3000)});return client;}
 return {
  read:code=>redis().get<string>(PREFIX+"room:"+code),
  cas:async(code,old,next,now)=>{
   const ttl=next===null?1:Math.min(1200,Math.ceil((JSON.parse(next).expiresAt-now)/1000));
   if(ttl<=0)return false;
   return Number(await redis().eval(GAME_ROOM_CAS,[PREFIX+"room:"+code,PREFIX+"index"],[old??"",next??"",ttl,code,now,PREFIX+"room:",ONLINE_HOST_TIMEOUT]))===1;
  },
  list:async()=>{
   const raw=await redis().get<string>(PREFIX+"index");if(!raw)return [];
   const parsed=JSON.parse(raw),entries=(Array.isArray(parsed)?parsed:[]) as {code:string;expiresAt:number;hostLastSeen?:number}[],now=Date.now();
   const codes=entries.filter(e=>e.expiresAt>now&&(e.hostLastSeen===undefined||now-e.hostLastSeen<ONLINE_HOST_TIMEOUT)).slice(0,30).map(e=>e.code);
   if(!codes.length)return [];
   return (await redis().mget<(string|null)[]>(...codes.map(c=>PREFIX+"room:"+c))).filter((v):v is string=>typeof v==="string");
  },
  allow:async(ip,bucket,limit)=>{const minute=Math.floor(Date.now()/60000),ipHash=createHash("sha256").update(ip.slice(0,80)).digest("hex").slice(0,24);const n=Number(await redis().eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n",[PREFIX+"rate:"+bucket+":"+ipHash+":"+minute],[]));return n<=limit;},
 };
}
