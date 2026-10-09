import { createHash,randomUUID } from 'node:crypto';
const privateHeaders={'cache-control':'private, no-store','referrer-policy':'no-referrer','vary':'Cookie'};
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const identity=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const referenceId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function exactFields(value,fields){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field));}
function projectKey(value){
 if(typeof value!=='string'||!value||value.length>512||/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value))return false;
 return value===value.normalize('NFKC').replace(/[\u2018\u2019\u02bc]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/\s+/g,' ').trim().toLocaleLowerCase('en-US');
}
function reference(value){
 if(value?.kind==='native'&&exactFields(value,['kind','sessionId','trackId','fingerprint'])&&referenceId(value.sessionId)&&referenceId(value.trackId)&&digest(value.fingerprint))return{kind:'native',sessionId:value.sessionId,trackId:value.trackId,fingerprint:value.fingerprint};
 if(value?.kind==='historical'&&exactFields(value,['kind','bundleDigest','recoveryTrackId'])&&digest(value.bundleDigest)&&referenceId(value.recoveryTrackId))return{kind:'historical',bundleDigest:value.bundleDigest,recoveryTrackId:value.recoveryTrackId};
 fail(400,'INVALID_ARTIST_REQUEST');
}
function actionBody(body){
 const extras={'approve-project':['projectKey'],'revoke-project':['artistId'],'approve-history':['artistId','reference'],'revoke-history':['referenceId']};
 if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.action!=='string'||!Object.hasOwn(extras,body.action)||!exactFields(body,['requestId','targetId','expectedRevision','action',...extras[body.action]])||!uuid(body.requestId)||!identity(body.targetId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,'INVALID_ARTIST_REQUEST');
 if(body.action==='approve-project'&&!projectKey(body.projectKey))fail(400,'INVALID_ARTIST_REQUEST');
 if(['revoke-project','approve-history'].includes(body.action)&&!uuid(body.artistId))fail(400,'INVALID_ARTIST_REQUEST');
 if(body.action==='revoke-history'&&!uuid(body.referenceId))fail(400,'INVALID_ARTIST_REQUEST');
 return{requestId:body.requestId,targetId:body.targetId,expectedRevision:body.expectedRevision,action:body.action,...(body.action==='approve-project'?{projectKey:body.projectKey}:body.action==='revoke-project'?{artistId:body.artistId}:body.action==='approve-history'?{artistId:body.artistId,reference:reference(body.reference)}:{referenceId:body.referenceId})};
}
export function createMemberArtists({database:db,authority,serial,baseURL}){
 const origin=new URL(baseURL).origin;
 function state(targetId,approvedOnly=false){
  const current=db.prepare('SELECT revision FROM member_artist_state WHERE user_id=?').get(targetId);if(!current)fail(404,'ACCOUNT_NOT_FOUND');
  const links=db.prepare('SELECT p.id,p.catalog_project_key projectKey,l.approved FROM member_artist_link l JOIN artist_project p ON p.id=l.artist_id WHERE l.user_id=?'+(approvedOnly?' AND l.approved=1':'')+' ORDER BY p.catalog_project_key,p.id LIMIT 101').all(targetId);
  const refs=db.prepare('SELECT h.id,h.artist_id artistId,h.reference,h.approved FROM member_artist_history h JOIN member_artist_link l ON l.user_id=h.user_id AND l.artist_id=h.artist_id WHERE h.user_id=?'+(approvedOnly?' AND h.approved=1 AND l.approved=1':'')+' ORDER BY h.rowid LIMIT 501').all(targetId);
  if(links.length>100||refs.length>500)fail(503,'ARTIST_LIMIT_EXCEEDED');
  return{targetId,revision:current.revision,artists:links.map(l=>({id:l.id,projectKey:l.projectKey,...(approvedOnly?{}:{approved:l.approved===1})})),legacyReferences:refs.map(h=>({id:h.id,artistId:h.artistId,reference:reference(JSON.parse(h.reference)),...(approvedOnly?{}:{approved:h.approved===1})}))};
 }
 async function mutate(session,body){
  const b=actionBody(body),{requestId,...complete}=b,hash=createHash('sha256').update(JSON.stringify(complete)).digest('hex');
  return authority.transaction(()=>{
   const actor=authority.authorize(session,true);
   const prior=db.prepare('SELECT request_hash,response FROM member_artist_audit WHERE actor_id=? AND request_id=?').get(actor.id,requestId);
   if(prior){if(prior.request_hash!==hash)fail(409,'REQUEST_CONFLICT');return JSON.parse(prior.response);}
   const before=state(b.targetId);if(before.revision!==b.expectedRevision)fail(409,'REVISION_CONFLICT');
   if(b.action.startsWith('approve-')){
    const target=db.prepare('SELECT u.emailVerified,a.suspended FROM user u JOIN member_access a ON a.user_id=u.id WHERE u.id=?').get(b.targetId);
    if(!target||target.emailVerified!==1||target.suspended!==0)fail(409,'VERIFIED_ACTIVE_ACCOUNT_REQUIRED');
   }
   if(b.action==='approve-project'){
    let artist=db.prepare('SELECT id FROM artist_project WHERE catalog_project_key=?').get(b.projectKey);
    const existing=artist&&db.prepare('SELECT approved FROM member_artist_link WHERE user_id=? AND artist_id=?').get(b.targetId,artist.id);
    if(!existing&&before.artists.length>=100)fail(409,'ARTIST_LIMIT_EXCEEDED');
    if(!artist){artist={id:randomUUID()};db.prepare('INSERT INTO artist_project(id,catalog_project_key) VALUES(?,?)').run(artist.id,b.projectKey);}
    db.prepare('INSERT INTO member_artist_link(user_id,artist_id,approved) VALUES(?,?,1) ON CONFLICT(user_id,artist_id) DO UPDATE SET approved=1').run(b.targetId,artist.id);
   }else if(b.action==='revoke-project'){
    const result=db.prepare('UPDATE member_artist_link SET approved=0 WHERE user_id=? AND artist_id=?').run(b.targetId,b.artistId);if(!result.changes)fail(404,'ARTIST_LINK_NOT_FOUND');
   }else if(b.action==='approve-history'){
    if(db.prepare('SELECT approved FROM member_artist_link WHERE user_id=? AND artist_id=?').get(b.targetId,b.artistId)?.approved!==1)fail(409,'ARTIST_LINK_REQUIRED');
    const text=JSON.stringify(b.reference),existing=db.prepare('SELECT id,artist_id,approved FROM member_artist_history WHERE user_id=? AND reference=?').get(b.targetId,text);
    if(existing&&existing.approved===1&&existing.artist_id!==b.artistId)fail(409,'HISTORY_ARTIST_CONFLICT');
    if(!existing&&before.legacyReferences.length>=500)fail(409,'HISTORY_LIMIT_EXCEEDED');
    if(existing)db.prepare('UPDATE member_artist_history SET artist_id=?,approved=1 WHERE id=? AND user_id=?').run(b.artistId,existing.id,b.targetId);
    else db.prepare('INSERT INTO member_artist_history(id,user_id,artist_id,reference,approved) VALUES(?,?,?,?,1)').run(randomUUID(),b.targetId,b.artistId,text);
   }else{
    const result=db.prepare('UPDATE member_artist_history SET approved=0 WHERE id=? AND user_id=?').run(b.referenceId,b.targetId);if(!result.changes)fail(404,'HISTORY_REFERENCE_NOT_FOUND');
   }
   const updated=db.prepare('UPDATE member_artist_state SET revision=revision+1 WHERE user_id=? AND revision=?').run(b.targetId,b.expectedRevision);if(updated.changes!==1)fail(409,'REVISION_CONFLICT');
   const after=state(b.targetId),response={ok:true,state:after};
   db.prepare('INSERT INTO member_artist_audit(actor_id,target_id,action,created_at,previous_state,resulting_state,request_id,request_hash,response) VALUES(?,?,?,?,?,?,?,?,?)').run(actor.id,b.targetId,b.action,Date.now(),JSON.stringify(before),JSON.stringify(after),requestId,hash,JSON.stringify(response));return response;
  });
 }
 return{async handle(request){return serial(async()=>{try{
  const url=new URL(request.url);if(request.headers.has('origin')&&request.headers.get('origin')!==origin)fail(403,'ORIGIN_DENIED');
  const session=await authority.resolve(request);let payload;
  if(url.pathname==='/api/member/artists'&&request.method==='GET'){
   if(url.search)fail(400,'INVALID_ARTIST_REQUEST');payload=await authority.transaction(()=>{const user=authority.authorize(session),snapshot=state(user.id,true);
    return{user:{id:user.id,name:user.name},session:{expiresAt:new Date(session.session.expiresAt).toISOString()},revision:snapshot.revision,artists:snapshot.artists,legacyReferences:snapshot.legacyReferences};});
  }else if(url.pathname==='/api/member/owner/artists'&&request.method==='GET'){
   payload=await authority.transaction(()=>{authority.authorize(session,true);if([...url.searchParams.keys()].length!==1||url.searchParams.getAll('targetId').length!==1||!identity(url.searchParams.get('targetId')))fail(400,'INVALID_ARTIST_REQUEST');return state(url.searchParams.get('targetId'));});
  }else if(url.pathname==='/api/member/owner/artists/action'&&request.method==='POST'){
   if(url.search)fail(400,'INVALID_ARTIST_REQUEST');if(request.headers.get('origin')!==origin)fail(403,'ORIGIN_DENIED');
   if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'JSON_REQUIRED');
   const text=await request.text();if(Buffer.byteLength(text)>16384)fail(413,'INVALID_ARTIST_REQUEST');let body;try{body=JSON.parse(text);}catch{fail(400,'INVALID_ARTIST_REQUEST');}payload=await mutate(session,body);
  }else fail(404,'NOT_FOUND');
  return Response.json(payload,{headers:privateHeaders});
 }catch(error){const candidate=error.status||error.statusCode,status=Number.isInteger(candidate)&&candidate>=400&&candidate<=599?candidate:503;return Response.json({code:error.code||error.body?.code||'ARTIST_UNAVAILABLE'},{status,headers:privateHeaders});}});}};
}
