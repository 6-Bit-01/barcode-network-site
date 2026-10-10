const ENDPOINT='/api/games/system-clash/tournaments';
const code=value=>typeof value==='string'&&/^[A-Z0-9]{6}$/.test(value);
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value);
export function readTournamentLaunch(value){
 const params=new URL(value).searchParams;
 if(!['event','bout','role','room'].some(key=>params.has(key)))return null;
 for(const key of ['event','bout','role','room'])if(params.getAll(key).length>1)throw new Error('This tournament match link is invalid. Return to the tournament.');
 const intent={event:params.get('event'),bout:params.get('bout'),role:params.get('role'),room:params.get('room')};
 if(!code(intent.event)||!identifier(intent.bout)||!['host','guest'].includes(intent.role)||(intent.room!==null&&!code(intent.room)))throw new Error('This tournament match link is invalid. Return to the tournament.');
 return intent;
}
export function tournamentReturnURL(base,event){const url=new URL('tournament-online.html',base);url.searchParams.set('code',event);return url;}
export function createTournamentRoomHandoff({intent,fetch=globalThis.fetch,requestId=()=>globalThis.crypto.randomUUID()}={}){
 const pending=new Map();let current=null;
 async function call(action,fields={}){
  const options={credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)};let url=ENDPOINT+'?code='+intent.event,key;
  if(action){key=JSON.stringify({action,...fields});if(!pending.has(key))pending.set(key,requestId());url=ENDPOINT;Object.assign(options,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code:intent.event,requestId:pending.get(key),...fields})});}
  let response;try{response=await fetch(url,options);}catch{throw new Error('The tournament request could not be confirmed. Retry the same action.');}
  let data;try{data=await response.json();}catch{throw new Error('The tournament returned an unreadable response.');}
  if(!response.ok)throw Object.assign(new Error(typeof data?.error==='string'?data.error.slice(0,240):'The tournament request failed.'),{status:response.status});
  if(data?.code!==intent.event)throw new Error('The tournament changed. Return to its bracket.');
  if(key)pending.delete(key);return data;
 }
 function assignment(event){
  const bout=event.bouts?.find(entry=>entry.id===intent.bout),ownId=intent.role==='host'?bout?.p1:bout?.p2,otherId=intent.role==='host'?bout?.p2:bout?.p1;
  const own=event.entrants?.find(entry=>entry.id===ownId),other=event.entrants?.find(entry=>entry.id===otherId);
  if(!bout||event.currentBoutId!==bout.id||event.status!=='running'||!['ready','live'].includes(bout.status)||event.selfEntrantId!==ownId||!own||!other||own.status!=='active'||other.status!=='active')throw new Error('This match is available only to its assigned players. Return to the tournament.');
  if(intent.room&&intent.room!==bout.roomCode)throw new Error('The assigned session changed. Return to the tournament.');
  if(![1,3,5].includes(event.settings?.rounds)||![0,60,99].includes(event.settings?.time)||typeof own.fighter!=='string'||typeof other.fighter!=='string'||own.fighter===other.fighter||!Number.isFinite(event.expiresAt)||event.expiresAt<=Date.now())throw new Error('This tournament match is no longer available.');
  return {event,bout,own,other,rules:{rounds:event.settings.rounds,time:event.settings.time}};
 }
 return {get current(){return current;},async refresh(){current=assignment(await call());return current;},offer(roomCode){return call('offer',{boutId:intent.bout,roomCode});},bind(roomCode,roomMatchId){return call('bind',{boutId:intent.bout,roomCode,roomMatchId});},advance(){return call('advance',{boutId:intent.bout});}};
}
