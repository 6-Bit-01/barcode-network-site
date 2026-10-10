import { createHash, randomUUID } from 'node:crypto';
import { runWithTransaction } from '@better-auth/core/context';
import { checkedName } from './names.mjs';
import { memberCookies } from './contract.mjs';
const availablePermissions=Object.freeze(['show.overview','song.generate','insights.read']);
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const jsonHeaders={'cache-control':'private, no-store','referrer-policy':'no-referrer'};
function identity(value){return typeof value==='string'&&value.length>0&&value.length<=128&&/^[A-Za-z0-9_-]+$/.test(value);}
function actionBody(body){
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'INVALID_ACCOUNT_REQUEST');
 const fields={'set-name':['name'],'set-crew':['assigned','permissions'],suspend:[],reactivate:[],'revoke-sessions':[],'send-recovery':[]}[body.action];
 if(!fields||Object.keys(body).some(k=>!['requestId','targetId','expectedRevision','action',...fields].includes(k))||!identity(body.requestId)||!identity(body.targetId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,'INVALID_ACCOUNT_REQUEST');
 if(body.action==='set-name'&&typeof body.name!=='string')fail(400,'INVALID_ACCOUNT_REQUEST');
 if(body.action==='set-crew'&&(typeof body.assigned!=='boolean'||!Array.isArray(body.permissions)||body.permissions.length>availablePermissions.length||body.permissions.some(p=>!availablePermissions.includes(p))||new Set(body.permissions).size!==body.permissions.length||(!body.assigned&&body.permissions.length)))fail(400,'INVALID_ACCOUNT_REQUEST');
 return body;
}
export function createMemberAccess({auth,database:db,outbox,baseURL,serial}){
 const origin=new URL(baseURL).origin;
 const row=id=>db.prepare('SELECT u.id,u.name,u.email,u.emailVerified,u.createdAt,a.owner,a.crew,a.permissions,a.suspended,a.revision FROM user u JOIN member_access a ON a.user_id=u.id WHERE u.id=?').get(id);
 function account(r){if(!r)fail(404,'ACCOUNT_NOT_FOUND');return{id:r.id,name:r.name,email:r.email,emailVerified:r.emailVerified===1,suspended:r.suspended===1,owner:r.owner===1,crew:r.crew===1,permissions:JSON.parse(r.permissions),revision:r.revision,createdAt:new Date(r.createdAt).toISOString()};}
 async function resolve(request){
  const headers=new Headers(),cookie=memberCookies(request.headers.get('cookie')||'');if(cookie)headers.set('cookie',cookie);
  const s=await auth.api.getSession({headers});
  if(!s||!identity(s.user?.id)||!identity(s.session?.id)||s.session.userId!==s.user.id||!Number.isFinite(new Date(s.session.expiresAt).getTime())||new Date(s.session.expiresAt).getTime()<=Date.now())fail(401,'UNAUTHENTICATED');
  return s;
 }
 function authorize(session,requireOwner=false){
  const live=db.prepare('SELECT userId,expiresAt FROM session WHERE id=?').get(session.session.id),user=row(session.user.id);
  if(!live||live.userId!==session.user.id||(!Number.isFinite(new Date(live.expiresAt).getTime())||new Date(live.expiresAt).getTime()<=Date.now())||!user||user.suspended||user.emailVerified!==1)fail(401,'UNAUTHENTICATED');
  if(requireOwner&&!user.owner)fail(403,'FORBIDDEN');
  return user;
 }
 async function transaction(fn){const context=await auth.$context;return runWithTransaction(context.adapter,fn);}
 function audit(actor,target,action,previous,result,{requestId,requestHash,response}={}){
  db.prepare('INSERT INTO member_access_audit(actor_id,target_id,action,created_at,previous_state,resulting_state,request_id,request_hash,response) VALUES(?,?,?,?,?,?,?,?,?)').run(actor,target,action,Date.now(),JSON.stringify(previous),JSON.stringify(result),requestId||null,requestHash||null,response?JSON.stringify(response):null);
 }
 function directory(params){
  const allowed=['query','sort','verification','status','role','cursor','limit'];for(const k of params.keys())if(!allowed.includes(k)||params.getAll(k).length!==1)fail(400,'INVALID_ACCOUNT_REQUEST');
  const query=params.get('query')||'',sort=params.get('sort')||'name',verification=params.get('verification')||'all',status=params.get('status')||'all',role=params.get('role')||'all';
  if(query.length>100||!['name','newest'].includes(sort)||!['all','verified','unverified'].includes(verification)||!['all','active','suspended'].includes(status)||!['all','member','crew','owner'].includes(role))fail(400,'INVALID_ACCOUNT_REQUEST');
  const limit=Number(params.get('limit')||25);if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail(400,'INVALID_ACCOUNT_REQUEST');
  const filterHash=createHash('sha256').update(JSON.stringify({query,sort,verification,status,role})).digest('hex').slice(0,24);
  let offset=0;if(params.has('cursor')){const cursor=params.get('cursor');try{if(cursor.length>128||! /^[A-Za-z0-9_-]+$/.test(cursor))throw Error();const decoded=JSON.parse(Buffer.from(cursor,'base64url').toString());if(decoded.hash!==filterHash||!Number.isSafeInteger(decoded.offset)||decoded.offset<0||decoded.offset>1_000_000)throw Error();offset=decoded.offset;}catch{fail(400,'INVALID_ACCOUNT_REQUEST');}}
  const where=[],args=[];if(query){where.push('(instr(lower(u.name),?)>0 OR instr(lower(u.email),?)>0 OR u.id=?)');args.push(query.toLowerCase(),query.toLowerCase(),query);}
  if(verification!=='all'){where.push('u.emailVerified=?');args.push(verification==='verified'?1:0);}
  if(status!=='all'){where.push('a.suspended=?');args.push(status==='suspended'?1:0);}
  if(role==='owner')where.push('a.owner=1');if(role==='crew')where.push('a.crew=1');if(role==='member')where.push('a.owner=0 AND a.crew=0');
  const rows=db.prepare('SELECT u.id,u.name,u.email,u.emailVerified,u.createdAt,a.owner,a.crew,a.permissions,a.suspended,a.revision FROM user u JOIN member_access a ON a.user_id=u.id'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY '+(sort==='newest'?'u.createdAt DESC,u.id':'u.nameKey,u.id')+' LIMIT ? OFFSET ?').all(...args,limit+1,offset);
  return{accounts:rows.slice(0,limit).map(account),nextCursor:rows.length>limit?Buffer.from(JSON.stringify({hash:filterHash,offset:offset+limit})).toString('base64url'):null};
 }
 async function mutate(session,body){
  const b=actionBody(body),hash=createHash('sha256').update(JSON.stringify({targetId:b.targetId,expectedRevision:b.expectedRevision,action:b.action,...(b.action==='set-name'?{name:b.name}:b.action==='set-crew'?{assigned:b.assigned,permissions:b.permissions}:{})})).digest('hex');
  return transaction(async()=>{
   const actor=authorize(session,true);
   const prior=db.prepare('SELECT request_hash,response FROM member_access_audit WHERE actor_id=? AND request_id=?').get(actor.id,b.requestId);
   if(prior){if(prior.request_hash!==hash)fail(409,'REQUEST_CONFLICT');return JSON.parse(prior.response);}
   const before=account(row(b.targetId));if(before.revision!==b.expectedRevision)fail(409,'REVISION_CONFLICT');
   if(b.action==='set-name'){
    const name=checkedName(db,b.name,b.targetId);db.prepare('UPDATE user SET name=?,nameKey=?,updatedAt=? WHERE id=?').run(name.name,name.nameKey,new Date().toISOString(),b.targetId);
   }else if(b.action==='set-crew')db.prepare('UPDATE member_access SET crew=?,permissions=? WHERE user_id=?').run(b.assigned?1:0,JSON.stringify(b.permissions),b.targetId);
   else if(b.action==='suspend'){
    if(b.targetId===actor.id||(before.owner&&db.prepare('SELECT count(*) n FROM member_access WHERE owner=1 AND suspended=0').get().n<=1))fail(409,'OWNER_PROTECTED');
    db.prepare('UPDATE member_access SET suspended=1 WHERE user_id=?').run(b.targetId);db.prepare('DELETE FROM session WHERE userId=?').run(b.targetId);
   }else if(b.action==='reactivate')db.prepare('UPDATE member_access SET suspended=0 WHERE user_id=?').run(b.targetId);
   else if(b.action==='revoke-sessions')db.prepare('DELETE FROM session WHERE userId=?').run(b.targetId);
   else if(b.action==='send-recovery'){
    if(!before.emailVerified)fail(409,'VERIFIED_ADDRESS_REQUIRED');
    const ctx=await auth.$context,token=randomUUID().replaceAll('-',''),expiresAt=new Date(Date.now()+3600_000);
    await ctx.internalAdapter.createVerificationValue({value:b.targetId,identifier:'reset-password:'+token,expiresAt});
    const queued=await outbox.enqueue({kind:'recovery',email:before.email,url:baseURL+'/reset-password/'+token+'?callbackURL='+encodeURIComponent(origin+'/account/reset-password')});
    if(!queued)fail(429,'RECOVERY_LIMIT');
   }
   db.prepare('UPDATE member_access SET revision=revision+1 WHERE user_id=? AND revision=?').run(b.targetId,b.expectedRevision);
   const result=account(row(b.targetId)),response={ok:true,account:result};audit(actor.id,b.targetId,b.action,before,result,{requestId:b.requestId,requestHash:hash,response});return response;
  });
 }
 return{
  authority:{resolve,authorize,transaction},
  async handle(request){return serial(async()=>{try{
   const url=new URL(request.url),s=await resolve(request);
   let payload;
   if(url.pathname==='/api/member/access'&&request.method==='GET'){const u=authorize(s);payload={user:{id:u.id,name:u.name},session:{expiresAt:new Date(s.session.expiresAt).toISOString()},access:{owner:!!u.owner,crew:!!u.crew,permissions:JSON.parse(u.permissions).filter(p=>availablePermissions.includes(p)),availablePermissions:[...availablePermissions]}};}
   else if(url.pathname==='/api/member/owner/accounts'&&request.method==='GET')payload=await transaction(()=>{authorize(s,true);return directory(url.searchParams);});
   else if(url.pathname==='/api/member/owner/accounts/action'&&request.method==='POST'){
    if(request.headers.get('origin')!==origin)fail(403,'ORIGIN_DENIED');
    const text=await request.text();if(Buffer.byteLength(text)>16384)fail(400,'INVALID_ACCOUNT_REQUEST');let b;try{b=JSON.parse(text);}catch{fail(400,'INVALID_ACCOUNT_REQUEST');}payload=await mutate(s,b);
   }else fail(404,'NOT_FOUND');
   return Response.json(payload,{headers:jsonHeaders});
  }catch(e){const candidate=typeof e.status==='number'?e.status:e.statusCode;const status=Number.isInteger(candidate)&&candidate>=400&&candidate<=599?candidate:503;return Response.json({code:e.code||e.body?.code||'ACCOUNT_UNAVAILABLE'},{status,headers:jsonHeaders});}});},
  async bootstrapOwner(userId){if(!identity(userId))fail(400,'INVALID_USER_ID');return serial(()=>transaction(()=>{const before=account(row(userId));if(!before.emailVerified||before.suspended)fail(409,'VERIFIED_ACTIVE_ACCOUNT_REQUIRED');if(before.owner)return before;db.prepare('UPDATE member_access SET owner=1,revision=revision+1 WHERE user_id=?').run(userId);const result=account(row(userId));audit('operator',userId,'bootstrap-owner',before,result);return result;}));},
  async revokeOwner(userId){return serial(()=>transaction(()=>{const before=account(row(userId));if(before.owner&&!before.suspended&&db.prepare('SELECT count(*) n FROM member_access WHERE owner=1 AND suspended=0').get().n<=1)fail(409,'LAST_OWNER_PROTECTED');db.prepare('UPDATE member_access SET owner=0,revision=revision+1 WHERE user_id=?').run(userId);const result=account(row(userId));audit('operator',userId,'revoke-owner',before,result);return result;}));},
 };
}
