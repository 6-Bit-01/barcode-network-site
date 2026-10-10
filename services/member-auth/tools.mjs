import { createHash,randomUUID } from 'node:crypto';
const privateHeaders={'cache-control':'private, no-store','referrer-policy':'no-referrer','vary':'Cookie'};
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fields=['idea','musicalDirection','mood','lengthStructure','revisionInstructions'];
const errorCodes=new Set(['INVALID_COMMAND','BUDGET_UNAVAILABLE','BUDGET_DAILY_TOKENS','BUDGET_DAILY_COST','BUDGET_MONTHLY_COST','BUDGET_PRICING_UNAVAILABLE','PROVIDER_BILLING_REQUIRED','PROVIDER_UNAVAILABLE','INVALID_RESULT','LYRICS_TOO_LONG','RESULT_TOO_LONG','CONTEXT_UNAVAILABLE','GENERATION_INTERRUPTED','AUTHORITY_REVOKED']);
const leaseMs=10*60*1000;
const safeReset=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function object(value,allowed,required=[]){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key));}
function pair(value){
 if(!object(value,['title','lyrics','style'],['title','lyrics','style'])||typeof value.title!=='string'||value.title.length>160||typeof value.lyrics!=='string'||value.lyrics.length>40000||typeof value.style!=='string'||value.style.length>6000||[value.title,value.lyrics,value.style].some(text=>/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)))fail(400,'INVALID_SONG_REQUEST');
 if(value.lyrics.trim().split(/\s+/u).filter(Boolean).length>2000)fail(400,'LYRICS_TOO_LONG');
 return{title:value.title,lyrics:value.lyrics,style:value.style};
}
function songBody(value){
 if(!object(value,['requestId','expectedRevision','kind','options','base','trackId'],['requestId','expectedRevision','kind'])||!uuid(value.requestId)||!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision<0||!['generate','lyrics','style','undo','select'].includes(value.kind))fail(400,'INVALID_SONG_REQUEST');
 if(value.options!==undefined&&(!object(value.options,fields)||Object.values(value.options).some(v=>typeof v!=='string'||v.length>6000)))fail(400,'INVALID_SONG_REQUEST');
 if(value.kind==='select'?(!uuid(value.trackId)||value.options!==undefined||value.base!==undefined):value.trackId!==undefined)fail(400,'INVALID_SONG_REQUEST');
 const options=Object.fromEntries(fields.map(field=>[field,value.options?.[field]??'']));
 return{requestId:value.requestId,expectedRevision:value.expectedRevision,kind:value.kind,options,...(value.trackId!==undefined?{trackId:value.trackId}:{}),...(value.base!==undefined?{base:pair(value.base)}:{})};
}
async function json(request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'JSON_REQUIRED');
 const text=await request.text();if(Buffer.byteLength(text)>262144)fail(413,'INVALID_SONG_REQUEST');
 try{return JSON.parse(text);}catch{fail(400,'INVALID_SONG_REQUEST');}
}
export function createMemberTools({database:db,authority,serial,baseURL}){
 const origin=new URL(baseURL).origin;
 // Historical receipts keep their exact stored snapshot; add empty archive projection only at read time.
 function savedResponse(value){const response=JSON.parse(value);if(response.draft&&!Object.hasOwn(response.draft,'tracks'))response.draft={...response.draft,selectedTrackId:null,options:Object.fromEntries(fields.map(field=>[field,''])),tracks:[]};return response;}
 function user(session,permission){const u=authority.authorize(session);if(!u.owner&&(!u.crew||!JSON.parse(u.permissions).includes(permission)))fail(403,'FORBIDDEN');return u;}
 function authorizedCommand(c){
  if(c.authority_revoked)return false;
  try{user({user:{id:c.user_id},session:{id:c.session_id}},'song.generate');return true;}catch(error){if(error.status===401||error.status===403)return false;throw error;}
 }
 function state(userId){
  const d=db.prepare('SELECT revision,title,lyrics,style,previous,error_code,selected_track_id,options FROM member_song_draft WHERE user_id=?').get(userId);if(!d)fail(503,'SONG_UNAVAILABLE');
  const c=db.prepare("SELECT id,status FROM member_song_command WHERE user_id=? AND status IN('pending','leased')").get(userId);
  // The immutable receipt already owns failure metadata. Match the exact draft
  // revision so old refusals cannot attach a reset time to newer work.
  const failure=d.error_code?db.prepare("SELECT receipt_response FROM member_song_command WHERE user_id=? AND status='failed' AND json_extract(receipt_response,'$.draft.revision')=? AND json_extract(receipt_response,'$.draft.errorCode')=? LIMIT 1").get(userId,d.revision,d.error_code):null;
  const resetAt=failure?JSON.parse(failure.receipt_response).draft.resetAt:undefined;
  return{...(safeReset(resetAt)?{resetAt}:{}),revision:d.revision,title:d.title,lyrics:d.lyrics,style:d.style,previous:d.previous?pair(JSON.parse(d.previous)):null,pending:c?{id:c.id,status:c.status==='pending'?'queued':'claimed'}:null,errorCode:d.error_code,selectedTrackId:d.selected_track_id,options:JSON.parse(d.options),tracks:db.prepare('SELECT id,title,created_at,updated_at FROM member_song_archive WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 40').all(userId).map(track=>({id:track.id,title:track.title,createdAt:track.created_at,updatedAt:track.updated_at}))};
 }
 function audit(c,action,before,after){db.prepare('INSERT INTO member_song_audit(user_id,command_id,action,created_at,previous_state,resulting_state) VALUES(?,?,?,?,?,?)').run(c.user_id,c.id,action,Date.now(),JSON.stringify(before),JSON.stringify(after));}
 function cancel(c){
  const before=state(c.user_id);db.prepare("UPDATE member_song_command SET status='failed',lease_expires_at=NULL WHERE id=? AND status IN('pending','leased')").run(c.id);
  db.prepare("UPDATE member_song_draft SET error_code='AUTHORITY_REVOKED',revision=revision+1 WHERE user_id=?").run(c.user_id);audit(c,'authority-revoked',before,state(c.user_id));
 }
 function revalidatePending(userId){const c=db.prepare("SELECT * FROM member_song_command WHERE user_id=? AND status IN('pending','leased')").get(userId);if(c&&!authorizedCommand(c))cancel(c);}
 async function mutate(session,body){
  const b=songBody(body),{requestId,...complete}=b,requestHash=hash(complete);
  return authority.transaction(()=>{
   const actor=user(session,'song.generate');revalidatePending(actor.id);
   const prior=db.prepare('SELECT request_hash,request_response FROM member_song_command WHERE user_id=? AND request_id=?').get(actor.id,requestId);
   if(prior){if(prior.request_hash!==requestHash)fail(409,'REQUEST_CONFLICT');return savedResponse(prior.request_response);}
   const before=state(actor.id);if(before.revision!==b.expectedRevision)fail(409,'REVISION_CONFLICT');if(before.pending)fail(409,'SONG_PENDING');
   const owned=pair({title:before.title,lyrics:before.lyrics,style:before.style});
   if(b.base&&(b.base.lyrics!==owned.lyrics||b.base.style!==owned.style))fail(409,'SONG_BASE_CONFLICT');
   const base=b.base||owned;
   if(b.kind==='undo'&&!before.previous)fail(409,'NOTHING_TO_UNDO');
   if(['lyrics','style','undo'].includes(b.kind)&&!before.selectedTrackId)fail(409,'TRACK_NOT_FOUND');
   const selected=b.kind==='select'?db.prepare('SELECT id,title,lyrics,style,options FROM member_song_archive WHERE id=? AND user_id=?').get(b.trackId,actor.id):null;
   if(b.kind==='select'&&!selected)fail(409,'TRACK_NOT_FOUND');
   const id=randomUUID(),status=['undo','select'].includes(b.kind)?'applied':'pending',next=b.kind==='select'?pair({title:selected.title,lyrics:selected.lyrics,style:selected.style}):b.kind==='undo'?before.previous:base;
   const options=b.kind==='select'?JSON.parse(selected.options):b.kind==='undo'?before.options:b.options,trackId=b.kind==='select'?selected.id:b.kind==='generate'?null:before.selectedTrackId;
   db.prepare('UPDATE member_song_draft SET title=?,lyrics=?,style=?,previous=?,revision=revision+1,error_code=NULL,selected_track_id=?,options=? WHERE user_id=? AND revision=?').run(next.title,next.lyrics,next.style,b.kind==='select'?null:b.kind==='undo'?JSON.stringify(base):before.previous?JSON.stringify(before.previous):null,b.kind==='select'?trackId:before.selectedTrackId,JSON.stringify(options),actor.id,b.expectedRevision);
   if(b.kind==='undo')db.prepare('UPDATE member_song_archive SET title=?,lyrics=?,style=?,updated_at=? WHERE id=? AND user_id=?').run(next.title,next.lyrics,next.style,Date.now(),trackId,actor.id);
   db.prepare('INSERT INTO member_song_command(id,user_id,session_id,request_id,request_hash,request_response,kind,options,base,status,created_at,track_id,action) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,actor.id,session.session.id,requestId,requestHash,'{}',b.kind==='select'?'undo':b.kind,JSON.stringify(options),JSON.stringify(base),status,Date.now(),trackId,b.kind==='select'?'select':null);
   const response={draft:state(actor.id)};db.prepare('UPDATE member_song_command SET request_response=? WHERE id=?').run(JSON.stringify(response),id);audit({id,user_id:actor.id},b.kind,before,response.draft);return response;
  });
 }
 async function claim(body){
  if(!object(body,['limit'])||(body.limit!==undefined&&(!Number.isSafeInteger(body.limit)||body.limit<1||body.limit>2)))fail(400,'INVALID_SONG_REQUEST');
  return authority.transaction(()=>{
   const commands=[],limit=body.limit??2,now=Date.now();
   // Bound each scan. Revoked commands are finalized rather than revived by later grants.
   const rows=db.prepare("SELECT * FROM member_song_command WHERE status='pending' OR (status='leased' AND lease_expires_at<=?) ORDER BY created_at,id LIMIT 100").all(now);
   for(const c of rows){
    if(!authorizedCommand(c)){cancel(c);continue;}if(commands.length>=limit)break;
    const leaseId=randomUUID(),before=state(c.user_id);db.prepare("UPDATE member_song_command SET status='leased',lease_id=?,lease_expires_at=? WHERE id=? AND (status='pending' OR (status='leased' AND lease_expires_at<=?))").run(leaseId,now+leaseMs,c.id,now);
    audit(c,'claim',before,state(c.user_id));commands.push({id:c.id,leaseId,kind:c.kind,options:JSON.parse(c.options),base:pair(JSON.parse(c.base)),limits:{maxLyricsWords:2000,targetSeconds:300}});
   }
   return{contractVersion:1,commands};
  });
 }
 async function receipt(body){
  if(!object(body,['commandId','leaseId','outcome','result','errorCode','resetAt'],['commandId','leaseId','outcome'])||!uuid(body.commandId)||!uuid(body.leaseId)||!['applied','failed'].includes(body.outcome)||(body.outcome==='applied'&&(!Object.hasOwn(body,'result')||Object.hasOwn(body,'errorCode')||Object.hasOwn(body,'resetAt')))||(body.outcome==='failed'&&(Object.hasOwn(body,'result')||!errorCodes.has(body.errorCode)||(body.resetAt!==undefined&&!safeReset(body.resetAt)))))fail(400,'INVALID_SONG_REQUEST');
  const result=body.outcome==='applied'?pair(body.result):null,receiptHash=hash({commandId:body.commandId,leaseId:body.leaseId,outcome:body.outcome,...(result?{result}:{errorCode:body.errorCode,...(body.resetAt===undefined?{}:{resetAt:body.resetAt})})});
  if(result&&(!result.lyrics.trim()||!result.style.trim()))fail(400,'INVALID_RESULT');
  const outcome=await authority.transaction(()=>{
   const c=db.prepare('SELECT * FROM member_song_command WHERE id=?').get(body.commandId);if(!c)fail(409,'LEASE_CONFLICT');
   if(!authorizedCommand(c)){if(['pending','leased'].includes(c.status))cancel(c);return{denied:true};}
   if(c.lease_id!==body.leaseId)fail(409,'LEASE_CONFLICT');
   if(c.receipt_hash){if(c.receipt_hash!==receiptHash)fail(409,'REQUEST_CONFLICT');return{response:savedResponse(c.receipt_response)};}
   if(c.status!=='leased'||c.lease_expires_at<=Date.now())fail(409,'LEASE_CONFLICT');
   const base=pair(JSON.parse(c.base));if(result&&c.kind!=='generate'&&(result.title!==base.title||(c.kind==='lyrics'&&result.style!==base.style)||(c.kind==='style'&&result.lyrics!==base.lyrics)))fail(400,'INVALID_RESULT');
   const before=state(c.user_id);
   if(result){
    const options=JSON.parse(c.options),now=Date.now();let trackId=c.track_id;
    if(c.kind==='generate'){
     trackId=randomUUID();const last=db.prepare('SELECT max(created_at) time FROM member_song_archive WHERE user_id=?').get(c.user_id).time,createdAt=Math.max(now,(last??0)+1);
     db.prepare('INSERT INTO member_song_archive(id,user_id,title,lyrics,style,options,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(trackId,c.user_id,result.title,result.lyrics,result.style,JSON.stringify(options),createdAt,createdAt);
     db.prepare('DELETE FROM member_song_archive WHERE user_id=? AND id IN (SELECT id FROM member_song_archive WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 40)').run(c.user_id,c.user_id);
    }else{
     if(!trackId||trackId!==before.selectedTrackId)fail(409,'LEASE_CONFLICT');
     if(db.prepare('UPDATE member_song_archive SET title=?,lyrics=?,style=?,options=?,updated_at=? WHERE id=? AND user_id=?').run(result.title,result.lyrics,result.style,JSON.stringify(options),now,trackId,c.user_id).changes!==1)fail(409,'TRACK_NOT_FOUND');
    }
    db.prepare('UPDATE member_song_draft SET title=?,lyrics=?,style=?,previous=?,revision=revision+1,error_code=NULL,selected_track_id=?,options=? WHERE user_id=?').run(result.title,result.lyrics,result.style,c.kind==='generate'?null:JSON.stringify(base),trackId,JSON.stringify(options),c.user_id);
   }
   else db.prepare('UPDATE member_song_draft SET revision=revision+1,error_code=? WHERE user_id=?').run(body.errorCode,c.user_id);
   db.prepare('UPDATE member_song_command SET status=?,receipt_hash=?,lease_expires_at=NULL WHERE id=?').run(body.outcome,receiptHash,c.id);
   const response={ok:true,draft:{...state(c.user_id),...(body.outcome==='failed'&&body.resetAt!==undefined?{resetAt:body.resetAt}:{})}};db.prepare('UPDATE member_song_command SET receipt_response=? WHERE id=?').run(JSON.stringify(response),c.id);audit(c,body.outcome,before,response.draft);return{response};
  });
  if(outcome.denied)fail(409,'AUTHORITY_REVOKED');return outcome.response;
 }
 function insights(session){
  user(session,'insights.read');
  const accounts=db.prepare('SELECT count(*) total,coalesce(sum(u.emailVerified=1),0) verified,coalesce(sum(a.suspended=0),0) active,coalesce(sum(a.suspended=1),0) suspended FROM user u JOIN member_access a ON a.user_id=u.id').get();
  // Only an aggregate leaves this service; no account IDs, names or contacts are returned.
  const now=new Date(),fromMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-119,1)).toISOString().slice(0,7),toMonth=now.toISOString().slice(0,7);
  accounts.signupsByMonth=db.prepare(`WITH signup AS (
   SELECT CASE WHEN typeof(createdAt) IN('integer','real') OR (CAST(createdAt AS TEXT) NOT GLOB '*[^0-9]*' AND length(CAST(createdAt AS TEXT)) BETWEEN 12 AND 14)
    THEN strftime('%Y-%m',CAST(createdAt AS REAL)/1000,'unixepoch') ELSE strftime('%Y-%m',createdAt) END month FROM user
   ) SELECT month,count(*) count FROM signup WHERE month>=? AND month<=? GROUP BY month ORDER BY month LIMIT 120`).all(fromMonth,toMonth);
  return{accounts};
 }
 return{async handle(request){return serial(async()=>{try{
  const url=new URL(request.url);if(url.search)fail(400,'INVALID_SONG_REQUEST');if(request.headers.has('origin')&&request.headers.get('origin')!==origin)fail(403,'ORIGIN_DENIED');
  const worker=url.pathname.startsWith('/api/member/worker/');if(request.method==='POST'&&request.headers.get('origin')!==origin)fail(403,'ORIGIN_DENIED');let payload;
  if(worker){const body=await json(request);if(url.pathname==='/api/member/worker/songs/claim'&&request.method==='POST')payload=await claim(body);else if(url.pathname==='/api/member/worker/songs/receipt'&&request.method==='POST')payload=await receipt(body);else fail(404,'NOT_FOUND');}
  else{const session=await authority.resolve(request);if(url.pathname==='/api/member/tools/songs'&&request.method==='GET')payload=await authority.transaction(()=>{const actor=user(session,'song.generate');revalidatePending(actor.id);return{draft:state(actor.id)};});else if(url.pathname==='/api/member/tools/songs'&&request.method==='POST')payload=await mutate(session,await json(request));else if(url.pathname==='/api/member/tools/insights'&&request.method==='GET')payload=await authority.transaction(()=>insights(session));else fail(404,'NOT_FOUND');}
  return Response.json(payload,{headers:privateHeaders});
 }catch(error){const candidate=error.status||error.statusCode,status=Number.isInteger(candidate)&&candidate>=400&&candidate<=599?candidate:503;return Response.json({code:status===503?'SONG_UNAVAILABLE':error.code||'INVALID_SONG_REQUEST'},{status,headers:privateHeaders});}});}};
}
