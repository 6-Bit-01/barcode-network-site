import {Redis} from "@upstash/redis";
import {createHash} from "node:crypto";
import {TOURNAMENT_TTL,type TournamentStore} from "./system-clash-tournament";

// Tournament metadata extends the existing ephemeral game room owner.
const PREFIX="barcode:system-clash:online:v1:tournament:";
export const TOURNAMENT_CAS=String.raw`
local prior=redis.call('GET',KEYS[1]) or ''
if prior~=ARGV[1] then return 0 end
if ARGV[8]~='' then
 local claimed=redis.call('GET',KEYS[3])
 if claimed and claimed~=ARGV[8] then return 0 end
end
local now=tonumber(ARGV[5])
local entries=cjson.decode(redis.call('GET',KEYS[2]) or '[]')
local next={}
for _,entry in ipairs(entries) do
 if entry.code~=ARGV[4] and entry.expiresAt>now then table.insert(next,entry) end
end
local event=cjson.decode(ARGV[2])
if event.status~='complete' and event.status~='cancelled' then
 if #next>=30 then
  if ARGV[1]=='' then return 0 end
 else table.insert(next,{code=event.code,expiresAt=event.expiresAt,createdAt=event.createdAt}) end
end
redis.call('SET',KEYS[1],ARGV[2],'EX',tonumber(ARGV[3]))
if ARGV[8]~='' then redis.call('SET',KEYS[3],ARGV[8],'EX',tonumber(ARGV[3])) end
local encoded=#next==0 and '[]' or cjson.encode(next)
redis.call('SET',KEYS[2],encoded,'EX',tonumber(ARGV[7]))
return 1
`;
export function systemClashTournamentStore():TournamentStore & {allow(identity:string,bucket:string,limit:number):Promise<boolean>}{
 let client:Redis|null=null;
 function redis(){if(client)return client;const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!token)throw new Error("Tournament storage is unavailable.");client=new Redis({url,token,automaticDeserialization:false,retry:false,signal:AbortSignal.timeout(3000)});return client;}
 return {
  read:code=>redis().get<string>(PREFIX+"event:"+code),
  cas:async(code,old,next,now,binding)=>{
   const event=JSON.parse(next),ttl=Math.min(TOURNAMENT_TTL/1000,Math.ceil((event.expiresAt-now)/1000));if(ttl<=0)return false;
   const claim=binding?createHash("sha256").update(binding.roomCode+":"+binding.createdAt+":"+binding.matchId).digest("hex"):"unused";
   return Number(await redis().eval(TOURNAMENT_CAS,[PREFIX+"event:"+code,PREFIX+"index",PREFIX+"bout-claim:"+claim],[old??"",next,ttl,code,now,PREFIX,TOURNAMENT_TTL/1000,binding?code+":"+binding.boutId:""]))===1;
  },
  list:async()=>{
   const raw=await redis().get<string>(PREFIX+"index");if(!raw)return [];const parsed=JSON.parse(raw),time=Date.now(),entries=(Array.isArray(parsed)?parsed:[]) as {code:string;expiresAt:number}[],codes=entries.filter(entry=>entry.expiresAt>time&&/^[A-Z0-9]{6}$/.test(entry.code)).slice(0,30).map(entry=>entry.code);
   if(!codes.length)return [];return (await redis().mget<(string|null)[]>(...codes.map(code=>PREFIX+"event:"+code))).filter((raw):raw is string=>typeof raw==="string");
  },
  allow:async(identity,bucket,limit)=>{const minute=Math.floor(Date.now()/60000),key=createHash("sha256").update(identity.slice(0,256)).digest("hex").slice(0,32),n=Number(await redis().eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n",[PREFIX+"rate:"+bucket+":"+key+":"+minute],[]));return n<=limit;},
 };
}

