import "server-only";
import {createHash} from "node:crypto";
import {memberCookies} from "../../services/member-auth/contract.mjs";
import {lookupMemberAccess} from "./member-access";
export type SystemClashMember={id:string;name:string;sessionExpiresAt:string};
export class SystemClashMemberError extends Error {
 constructor(message:string,public status:number,public code:string){super(message);}
}
// This bounded projection is used only for public fight poses. The existing
// account service remains authoritative; every other game request verifies live.
const poseLifetimeMs=3000,poseCapacity=256;
const poseMembers=new Map<string,{member:SystemClashMember;expiresAt:number}>();
const poseChecks=new Map<string,{promise:Promise<SystemClashMember>;expiresAt:number;cancelled:boolean;failure:SystemClashMemberError|null}>();
const accountRequired=()=>new SystemClashMemberError("Sign in to your verified BARCODE account to play online.",401,"ACCOUNT_REQUIRED");
function invalidatePose(key:string,failure:SystemClashMemberError){poseMembers.delete(key);const check=poseChecks.get(key);if(check){check.cancelled=true;check.failure=failure;}}
async function verifyMember(cookie:string,key:string):Promise<SystemClashMember>{
 const lookup=await lookupMemberAccess(cookie);
 if(!lookup.ok){
  const failure=lookup.status===401||lookup.status===403?accountRequired():new SystemClashMemberError("Accounts are temporarily unavailable. Solo and local play remain available.",503,"ACCOUNT_UNAVAILABLE");
  invalidatePose(key,failure);throw failure;
 }
 return {id:lookup.data.user.id,name:lookup.data.user.name,sessionExpiresAt:lookup.data.session.expiresAt};
}
export async function requireSystemClashMember(request:Request,{publicPoseStream=false}:{publicPoseStream?:boolean}={}):Promise<SystemClashMember>{
 const url=new URL(request.url),origin=url.origin,source=request.headers.get("origin");
 if(origin!=="https://www.barcode-network.com"||(source!==null&&source!==origin)||request.headers.get("sec-fetch-site")==="cross-site"||(request.method!=="GET"&&source!==origin))throw new SystemClashMemberError("Use System Clash on the BARCODE website.",403,"ORIGIN_DENIED");
 const cookie=memberCookies(request.headers.get("cookie")??""),key=cookie?createHash("sha256").update(cookie).digest("hex"):"";
 const poses=publicPoseStream&&((request.method==="GET"&&url.pathname==="/api/games/system-clash/tournaments/watch")||(request.method==="POST"&&url.pathname==="/api/games/system-clash/rooms"));
 if(!cookie)throw accountRequired();
 if(!poses)return verifyMember(cookie,key);
 const now=Date.now();
 for(const [value,entry]of poseMembers)if(entry.expiresAt<=now)poseMembers.delete(value);
 // Retain expired in-flight slots until settlement so a newer live denial
 // can invalidate an older reply without extending the deduplication window.
 for(const entry of poseChecks.values())if(entry.expiresAt<=now)entry.cancelled=true;
 const cached=poseMembers.get(key);if(cached)return {...cached.member};
 const pending=poseChecks.get(key);if(pending){if(pending.cancelled)return verifyMember(cookie,key);const member=await pending.promise;if(pending.failure)throw pending.failure;return {...member};}
 // Never allocate unbounded promises under many distinct cookies. Overflow
 // requests verify directly and do not populate either projection map.
 if(poseChecks.size>=poseCapacity)return verifyMember(cookie,key);
 const check={promise:verifyMember(cookie,key),expiresAt:now+poseLifetimeMs,cancelled:false,failure:null as SystemClashMemberError|null};poseChecks.set(key,check);
 try{
  const member=await check.promise,expiresAt=Math.min(check.expiresAt,Date.parse(member.sessionExpiresAt));if(check.failure)throw check.failure;
  if(!check.cancelled&&poseChecks.get(key)===check&&expiresAt>Date.now()){
   if(poseMembers.size>=poseCapacity)poseMembers.delete(poseMembers.keys().next().value!);
   poseMembers.set(key,{member:{...member},expiresAt});
  }
  return {...member};
 }finally{if(poseChecks.get(key)===check)poseChecks.delete(key);}
}
