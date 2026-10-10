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

// Parent links, lobby mutations and host end use one preflighted transaction.
export const TOURNAMENT_LINKED_CAS=String.raw`
local writes=cjson.decode(ARGV[1])
local now=tonumber(ARGV[2])
local changed={}
for i,write in ipairs(writes) do
 if (redis.call('GET',KEYS[i+1]) or '')~=write.old then return 0 end
 changed[write.code]=true
end
local entries={}
for _,entry in ipairs(cjson.decode(redis.call('GET',KEYS[1]) or '[]')) do
 if not changed[entry.code] and entry.expiresAt>now then table.insert(entries,entry) end
end
for _,write in ipairs(writes) do
 local event=cjson.decode(write.next)
 if event.status~='complete' and event.status~='cancelled' then
  table.insert(entries,{code=event.code,expiresAt=event.expiresAt,createdAt=event.createdAt})
 end
end
if #entries>30 then return 0 end
local encoded=#entries==0 and '[]' or cjson.encode(entries)
for i,write in ipairs(writes) do
 redis.call('SET',KEYS[i+1],write.next,'EX',write.ttl)
end
redis.call('SET',KEYS[1],encoded,'EX',tonumber(ARGV[3]))
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
  casEvents:async(writes,now)=>{
   if(!Array.isArray(writes)||!writes.length||writes.length>64||!Number.isFinite(now))return false;
   const seen=new Set<string>(),prepared=[];
   for(const write of writes){
    if(!write||! /^[A-Z0-9]{6}$/.test(write.code)||seen.has(write.code)||write.old!==null&&typeof write.old!=="string"||typeof write.next!=="string")return false;
    let event;try{event=JSON.parse(write.next);}catch{return false;}
    if(!event||event.code!==write.code||!Number.isFinite(event.expiresAt)||!Number.isFinite(event.createdAt)||!["lobby","running","paused","complete","cancelled"].includes(event.status))return false;
    const ttl=Math.min(TOURNAMENT_TTL/1000,Math.ceil((event.expiresAt-now)/1000));if(ttl<=0)return false;
    seen.add(write.code);prepared.push({code:write.code,old:write.old??"",next:write.next,ttl});
   }
   return Number(await redis().eval(TOURNAMENT_LINKED_CAS,[PREFIX+"index",...prepared.map(write=>PREFIX+"event:"+write.code)],[JSON.stringify(prepared),now,TOURNAMENT_TTL/1000]))===1;
  },
  list:async()=>{
   const raw=await redis().get<string>(PREFIX+"index");if(!raw)return [];const parsed=JSON.parse(raw),time=Date.now(),entries=(Array.isArray(parsed)?parsed:[]) as {code:string;expiresAt:number}[],codes=entries.filter(entry=>entry.expiresAt>time&&/^[A-Z0-9]{6}$/.test(entry.code)).slice(0,30).map(entry=>entry.code);
   if(!codes.length)return [];return (await redis().mget<(string|null)[]>(...codes.map(code=>PREFIX+"event:"+code))).filter((raw):raw is string=>typeof raw==="string");
  },
  allow:async(identity,bucket,limit)=>{const minute=Math.floor(Date.now()/60000),key=createHash("sha256").update(identity.slice(0,256)).digest("hex").slice(0,32),n=Number(await redis().eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n",[PREFIX+"rate:"+bucket+":"+key+":"+minute],[]));return n<=limit;},
 };
}

