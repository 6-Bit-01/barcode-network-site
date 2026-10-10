import "server-only";
import { lookupMemberAccess, type MemberAccess } from "./member-access";
import { getMemberServiceConfiguration, type MemberServiceConfiguration } from "./member-service";
import { memberCookies } from "../../services/member-auth/contract.mjs";
import { parseSongDraft, parseSongOptions, parseSongRequest, parseSongText, SONG_ERROR_CODES } from "./barcode-song-contract";
export type MemberToolPermission = "show.overview" | "song.generate" | "insights.read";
export type MemberToolInsights = { accounts: { total:number; verified:number; active:number; suspended:number; signupsByMonth:{month:string;count:number}[] } };
const canonicalOrigin="https://www.barcode-network.com";
const privateHeaders={"cache-control":"private, no-store","referrer-policy":"no-referrer",vary:"Cookie"};
const serviceErrors=new Set([...SONG_ERROR_CODES,"UNAUTHENTICATED","FORBIDDEN","ORIGIN_DENIED","JSON_REQUIRED","INVALID_SONG_REQUEST","REQUEST_CONFLICT","REVISION_CONFLICT","SONG_PENDING","NOTHING_TO_UNDO","SONG_UNAVAILABLE","LEASE_CONFLICT","NOT_FOUND","AUTH_REQUIRED","ACCESS_DENIED"]);
function problem(status:number,code:string) { return Response.json({code},{status,headers:privateHeaders}); }
export function hasMemberToolAccess(access:MemberAccess, permission:MemberToolPermission) { return access.access.availablePermissions.includes(permission) && (access.access.owner || (access.access.crew && access.access.permissions.includes(permission))); }
export async function lookupMemberToolAccess(request:Request,permission:MemberToolPermission):Promise<{ok:true;access:MemberAccess}|{ok:false;response:Response}> {
 const url=new URL(request.url),origin=request.headers.get("origin"); if(url.origin!==canonicalOrigin || (origin!==null && origin!==canonicalOrigin)) return {ok:false,response:problem(403,"ORIGIN_DENIED")};
 const result=await lookupMemberAccess(request.headers.get("cookie")??"");
 if(!result.ok) return {ok:false,response:problem(result.status,result.code)};
 if(!hasMemberToolAccess(result.data,permission)) return {ok:false,response:problem(403,"ACCESS_DENIED")};
 return {ok:true,access:result.data};
}
export async function requireMemberToolAccess(permission:MemberToolPermission):Promise<MemberAccess> {
 const {headers}=await import("next/headers");const {redirect,notFound}=await import("next/navigation");const incoming=await headers();
 const result=await lookupMemberToolAccess(new Request(canonicalOrigin+"/api/member/access",{headers:{cookie:incoming.get("cookie")??""}}),permission);
 if(!result.ok){if(result.response.status===401)redirect("/account");if(result.response.status===403)notFound();throw Error("Account tools are temporarily unavailable. Please try again.");} return result.access;
}
async function boundedText(message:Request|Response,maximum=262144) {
 if(!message.body)return "";const reader=message.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maximum)throw Error("BODY_TOO_LARGE");chunks.push(value);}return Buffer.concat(chunks).toString("utf8");}
 finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function configured(config:MemberServiceConfiguration|null):config is MemberServiceConfiguration {
 if(!config || config.canonicalOrigin!==canonicalOrigin || !/^[A-Za-z0-9_-]{32,128}$/.test(config.serviceToken))return false;
 try{const url=new URL(config.serviceUrl);return url.protocol==="https:"&&!url.username&&!url.password&&url.pathname==="/"&&!url.search&&!url.hash;}catch{return false;}
}
async function transport(path:string,method:string,body:string|undefined,cookie:string|undefined,config:MemberServiceConfiguration|null,fetcher:typeof fetch) {
 if(!configured(config))return problem(503,"ACCOUNT_UNAVAILABLE");
 const headers=new Headers({"x-barcode-service-token":config.serviceToken,origin:canonicalOrigin,"content-type":"application/json"});
 if(cookie!==undefined){const filtered=memberCookies(cookie);if(filtered.length>8192)return problem(400,"INVALID_COOKIE");if(filtered)headers.set("cookie",filtered);}
 let response:Response;try{response=await fetcher(config.serviceUrl+"/api/member/"+path,{method,headers,body,cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(15000)});}catch{return problem(503,"ACCOUNT_UNAVAILABLE");}
 if(response.headers.has("location") || (response.status>=300 && response.status<400))return problem(502,"INVALID_SERVICE_RESPONSE");
 try {const data=JSON.parse(await boundedText(response));if(!response.ok)return problem(response.status,typeof data?.code==="string"&&serviceErrors.has(data.code)?data.code:"ACCOUNT_REQUEST_FAILED");return Response.json(data,{headers:privateHeaders});}catch{return problem(502,"INVALID_SERVICE_RESPONSE");}
}
function validOrigin(request:Request,post:boolean) {const url=new URL(request.url),origin=request.headers.get("origin");return url.origin===canonicalOrigin&&!url.search&&(origin===null? !post:origin===canonicalOrigin);}
export async function proxyMemberSongRequest(request:Request,configuration=getMemberServiceConfiguration(),fetcher:typeof fetch=fetch):Promise<Response> {
 if(!["GET","POST"].includes(request.method))return problem(405,"METHOD_NOT_ALLOWED");
 if(!validOrigin(request,request.method==="POST"))return problem(403,"ORIGIN_DENIED");
 let body:string|undefined;if(request.method==="POST"){if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return problem(415,"JSON_REQUIRED");
 try{body=JSON.stringify(parseSongRequest(JSON.parse(await boundedText(request))));}catch(error){return problem(error instanceof Error&&error.message==="BODY_TOO_LARGE"?413:400,"INVALID_COMMAND");}}
 const response=await transport("tools/songs",request.method,body,request.headers.get("cookie")??"",configuration,fetcher);if(!response.ok)return response;
 try {const data=await response.json();return Response.json({draft:parseSongDraft(data.draft)},{headers:privateHeaders});}catch{return problem(502,"INVALID_SERVICE_RESPONSE");}
}
export async function fetchMemberToolInsights(request:Request,configuration=getMemberServiceConfiguration(),fetcher:typeof fetch=fetch):Promise<MemberToolInsights|null> {
 const response=await transport("tools/insights","GET",undefined,request.headers.get("cookie")??"",configuration,fetcher);if(!response.ok)return null;
 try{const data=await response.json(),a=data.accounts;const values=["total","verified","active","suspended"] as const;
 if(!a || values.some(key=>!Number.isSafeInteger(a[key])||a[key]<0)||!Array.isArray(a.signupsByMonth)||a.signupsByMonth.length>120)throw Error();
 const signupsByMonth=a.signupsByMonth.map((row:{month:unknown;count:unknown})=>{if(typeof row.month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month)||!Number.isSafeInteger(row.count)||(row.count as number)<0)throw Error();return {month:row.month,count:row.count as number};});
 return {accounts:{total:a.total,verified:a.verified,active:a.active,suspended:a.suspended,signupsByMonth}};
 }catch{return null;}
}
export async function proxyMemberSongWorkerRequest(request:Request,configuration=getMemberServiceConfiguration(),fetcher:typeof fetch=fetch):Promise<Response> {
 if(!["GET","POST"].includes(request.method) || new URL(request.url).search)return problem(400,"INVALID_COMMAND");
 let body='{"limit":2}';
 if(request.method==="POST"){
 if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return problem(415,"JSON_REQUIRED");
 try {const input=JSON.parse(await boundedText(request));if(!input||typeof input!=="object"||Object.keys(input).some(key=>!["commandId","leaseId","outcome","result","errorCode"].includes(key))||!["commandId","leaseId"].every(key=>typeof input[key]==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(input[key]))||!["applied","failed"].includes(input.outcome))throw Error();
 if(input.outcome==="applied"){if(input.errorCode!==undefined)throw Error();body=JSON.stringify({commandId:input.commandId,leaseId:input.leaseId,outcome:input.outcome,result:parseSongText(input.result)});}
 else{if(input.result!==undefined||!SONG_ERROR_CODES.includes(input.errorCode))throw Error();body=JSON.stringify({commandId:input.commandId,leaseId:input.leaseId,outcome:input.outcome,errorCode:input.errorCode});}
 }catch(error){return problem(error instanceof Error&&error.message==="BODY_TOO_LARGE"?413:400,"INVALID_COMMAND");}}
 const response=await transport("worker/songs/"+(request.method==="GET"?"claim":"receipt"),"POST",body,undefined,configuration,fetcher);if(!response.ok)return response;
 try {const data=await response.json();if(request.method==="POST"){if(data.ok!==true)throw Error();return Response.json({ok:true},{headers:privateHeaders});}
 if(data.contractVersion!==1||!Array.isArray(data.commands)||data.commands.length>2)throw Error();
 const commands=data.commands.map((item:Record<string,unknown>)=>{if(!["id","leaseId"].every(key=>typeof item[key]==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(item[key] as string))||!["generate","lyrics","style"].includes(item.kind as string))throw Error();
 const limits=item.limits as Record<string,unknown>;if(limits?.maxLyricsWords!==2000||limits?.targetSeconds!==300)throw Error();
 return {id:item.id,leaseId:item.leaseId,kind:item.kind,options:parseSongOptions(item.options),base:parseSongText(item.base),limits:{maxLyricsWords:2000,targetSeconds:300}};});
 return Response.json({contractVersion:1,commands},{headers:privateHeaders});}catch{return problem(502,"INVALID_SERVICE_RESPONSE");}
}
