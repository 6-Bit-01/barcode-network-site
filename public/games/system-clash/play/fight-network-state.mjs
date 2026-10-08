import {fightStatScalars} from './fight-stats.mjs';
import {ONLINE_STAGES,MAX_PACKET_BYTES,packetBytes,validInput,validPayload} from './online-protocol.mjs';
const MATCH_KEYS=['mode','phase','phaseTime','roundRemaining','finishRemaining','winner','deletionElapsed','deletionName','deletionId','deletionTargetX','status','hitstop','combatTime','paused','finisherAvailable','stagePickups','projectiles','nextPickupAt','stage','_deletionOrigin'];
const FIGHTER_KEYS=['id','name','x','facing','hp','maxHp','height','action','actionTime','weapon','damageTaken','damageTier','damageSites','damageMarks','embeddedWeapons','_deleted'];
const FORBIDDEN=new Set(['__proto__','constructor','prototype','token','credentials','sdp','image','_clips','_style','_statProfile','_statScalars','metadata']);
const PHASES=new Set(['ready','countdown','fight','finish','deletion','over']);
const neutral=()=>({move:0,crouch:false,block:false});
const finite=(value,min=0,max=10000000)=>Number.isFinite(value)&&value>=min&&value<=max;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function stripFightInput(value={}){return {move:Math.sign(Number(value.move)||0),crouch:!!value.crouch,block:!!value.block};}
function clone(value,depth=0){
 if(depth>8)throw new Error('State is too deep.');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!finite(value,-4294967295,4294967295))throw new Error('Invalid coordinate.');return value;}
 if(typeof value==='string'){if(value.length>240)throw new Error('State text is too long.');return value;}
 if(Array.isArray(value)){if(value.length>64)throw new Error('State array is too long.');return value.map(item=>clone(item,depth+1));}
 if(!object(value)||Object.keys(value).length>64)throw new Error('Invalid state object.');
 const result={};for(const [key,item]of Object.entries(value)){if(FORBIDDEN.has(key))throw new Error('Private fields are not wire state.');if(item!==undefined)result[key]=clone(item,depth+1);}return result;
}

const weaponTypes=new Set(['neural-spike','pulse-driver']);
const direction=value=>value===1||value===-1;
const uint=value=>Number.isInteger(value)&&value>=0&&value<=4294967295;
function validWear(value){
 if(!object(value.damageSites)||!Array.isArray(value.damageMarks)||value.damageMarks.length>12||!Array.isArray(value.embeddedWeapons)||value.embeddedWeapons.length>4||!finite(value.damageTaken,0,10000)||!Number.isInteger(value.damageTier)||value.damageTier<0||value.damageTier>3)return false;
 for(const site of ['head','torso','legs'])if(!object(value.damageSites[site])||['amount','hits','bruise','cut','scorch'].some(key=>!finite(value.damageSites[site][key],0,10000)))return false;
 for(const mark of value.damageMarks)if(!object(mark)||!['head','torso','legs'].includes(mark.site)||!['cut','bruise','scorch'].includes(mark.kind)||!finite(mark.intensity,0,1)||!finite(mark.amount,0,10000)||!finite(mark.at)||!finite(mark.heightRatio,0,1)||!['left','right'].includes(mark.facing)||!direction(mark.direction)||!uint(mark.seed))return false;
 for(const item of value.embeddedWeapons)if(!object(item)||!weaponTypes.has(item.type)||!['head','torso','legs'].includes(item.site)||!finite(item.heightRatio,0,1)||!['left','right'].includes(item.facing)||!direction(item.direction)||!uint(item.seed))return false;
 return value.weapon===null||(object(value.weapon)&&weaponTypes.has(value.weapon.type)&&typeof value.weapon.name==='string'&&Number.isInteger(value.weapon.charges)&&value.weapon.charges>=0&&value.weapon.charges<=99);
}
function validFloorItem(item){return object(item)&&typeof item.id==='string'&&weaponTypes.has(item.type)&&typeof item.name==='string'&&Number.isInteger(item.charges)&&item.charges>=0&&item.charges<=99&&finite(item.x,-2048,10240)&&finite(item.y,-4096,4096);}
function validProjectile(item){return object(item)&&typeof item.id==='string'&&weaponTypes.has(item.type)&&['throw','pulse'].includes(item.kind)&&[0,1].includes(item.owner)&&direction(item.direction)&&uint(item.seed)&&typeof item.embed==='boolean'&&['x','y','vx','vy','gravity','rotation'].every(key=>finite(item[key],-10240,10240))&&['damage','age','ttl'].every(key=>finite(item[key]));}

const project=(value,keys)=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
export function readFightSnapshot(value,{roster=[],fighterIds,clipIds=[],matchId}={}){
 try{
  if(!object(value)||packetBytes(value)>Math.min(MAX_PACKET_BYTES-1024,61440)||!Number.isSafeInteger(value.seq)||value.seq<1||!Number.isSafeInteger(value.matchId)||value.matchId<1||(matchId!==undefined&&value.matchId!==matchId)||!finite(value.at))return null;
  const result=clone(value),state=result.state,views=result.views,ids=roster.map(f=>typeof f==='string'?f:f.id);
  if(!object(state)||!PHASES.has(state.phase)||state.mode!=='local'||!Array.isArray(state.fighters)||state.fighters.length!==2||!Array.isArray(views)||views.length!==2||![null,0,1].includes(state.winner)||typeof state.paused!=='boolean')return null;
  for(const key of ['phaseTime','roundRemaining','finishRemaining','deletionElapsed','combatTime'])if(!finite(state[key]))return null;
  if(!object(state.stage)||!ONLINE_STAGES.includes(state.stage.id)||!finite(state.stage.width,1280,4096)||!finite(state.stage.clock)||!finite(state.stage.fightClock))return null;
  if(!Array.isArray(state.projectiles)||state.projectiles.length>8||!state.projectiles.every(validProjectile)||!Array.isArray(state.stagePickups)||state.stagePickups.length>4||!state.stagePickups.every(validFloorItem))return null;
  for(let index=0;index<2;index++){
   const f=state.fighters[index],view=views[index];
   if(!object(f)||!ids.includes(f.id)||(fighterIds&&f.id!==fighterIds[index])||!['left','right'].includes(f.facing)||!finite(f.hp,0,f.maxHp)||f.maxHp!==fightStatScalars(f.id).maxHealth||!finite(f.x,-2048,10240)||!finite(f.height,20,800)||!finite(f.actionTime)||typeof f.action!=='string'||!/^[a-z-]{1,50}$/.test(f.action))return null;
   if(!object(view)||view.id!==f.id||!['left','right'].includes(view.facing)||!clipIds[index]?.includes(view.clip)||!finite(view.x,-2048,10240)||!finite(view.y,-4096,4096)||!finite(view.elapsed)||!finite(view.opacity,0,1))return null;
   if(view.poseIndex!==undefined&&(!Number.isInteger(view.poseIndex)||view.poseIndex<0||view.poseIndex>256))return null;
   if(!validWear(f)||!validWear(view))return null;
  }
  if(state.phase==='deletion'||(state.phase==='over'&&state.deletionElapsed>0)){
   const origin=state._deletionOrigin;if(state.winner===null||!object(origin)||![1,-1].includes(origin.direction)||!['left','right'].includes(origin.victimFacing)||!finite(origin.target,-2048,10240)||!finite(origin.near,-2048,10240)||!finite(origin.winner,-2048,10240)||!finite(origin.victim,-2048,10240))return null;
  }
  return result;
 }catch{return null;}
}
export function makeFightSnapshot(match,views,options={}){
 try{const state=project(match,MATCH_KEYS);state.mode='local';state.fighters=match.fighters.map(f=>project(f,FIGHTER_KEYS));const snapshot={seq:options.seq,matchId:options.matchId,at:options.at,state,views};return readFightSnapshot(snapshot,options);}catch{return null;}
}
export function applyFightSnapshot(local,snapshot){return {...snapshot.state,fighters:snapshot.state.fighters.map((f,index)=>({...f,_clips:local?.fighters[index]?._clips,_style:local?.fighters[index]?._style,_statProfile:local?.fighters[index]?._statProfile,_statScalars:local?.fighters[index]?._statScalars})),events:[]};}
/** Pure seat ownership, cadence and freshness; the browser owns engine/render calls. */
export function createOnlineCombatController({seat,matchId,roster,fighterIds,clipIds,send=()=>false,now=()=>performance.now(),onStart=()=>{},onPause=()=>{},onState=()=>{},onEvents=()=>{},onAction=()=>{},onDisconnect=()=>{}}){
 if(![0,1].includes(seat)||!Number.isSafeInteger(matchId)||matchId<1)throw new Error('Invalid combat seat.');
 const schema={roster,fighterIds,clipIds,matchId};let started=false,paused=false,closed=false,remote=neutral(),lastRemote=-Infinity,remoteReleased=false,lastInput=-Infinity,lastPublish=-Infinity,lastSnapshot=-Infinity,snapshotSeq=0,receivedSeq=0,eventSeq=0,receivedEvents=0,current=null,previous=null,arrivedAt=0;
 function applyPause(value){paused=value;remote=neutral();if(value)remoteReleased=false;onPause(value);}
 const api={seat,get started(){return started;},get paused(){return paused;},get remoteInput(){return {...remote};},receive(packet){
  if(closed||!validPayload(packet))return false;
  if(packet.type==='start'){if(started||packet.matchId!==matchId)return false;started=true;paused=false;lastRemote=lastSnapshot=now();onStart(packet);return true;}
  if(!started)return false;
  if(packet.type==='pause'){if(seat===0&&!packet.paused)return false;if(seat===1&&!packet.paused&&Number.isSafeInteger(packet.snapshotSeq)&&packet.snapshotSeq>=0)receivedSeq=Math.max(receivedSeq,packet.snapshotSeq);applyPause(packet.paused);return true;}
  if(packet.type==='leave'){api.disconnect('The session ended.');return true;}
  if(packet.type==='input'||packet.type==='action'){
   if(seat!==0||!validInput(packet.input))return false;lastRemote=now();remoteReleased=packet.input.move===0&&!packet.input.crouch&&!packet.input.block;remote=paused?neutral():stripFightInput(packet.input);
   if(packet.type==='action'&&!paused)onAction({index:1,action:packet.action,input:stripFightInput(packet.input)});return true;
  }
  if(packet.type==='snapshot'){
   if(seat!==1)return false;const next=readFightSnapshot(packet.snapshot,schema);if(!next||next.seq<=receivedSeq)return false;receivedSeq=next.seq;previous=current;current=next;arrivedAt=lastSnapshot=now();if(next.state.paused&&!paused)applyPause(true);next.state.paused=paused;onState(next);return true;
  }
  if(packet.type==='events'){
   if(seat!==1||packet.matchId!==matchId||!Number.isSafeInteger(packet.seq)||packet.seq<=receivedEvents)return false;
   let events;try{events=clone(packet.events);}catch{return false;}receivedEvents=packet.seq;onEvents(events);return true;
  }
  return false;
 },input(value){if(closed||!started)return false;const input=stripFightInput(paused?neutral():value);if(seat!==1)return true;if(now()-lastInput<100)return false;lastInput=now();return send({type:'input',input});},action(action,value){if(closed||!started||paused)return false;const input=stripFightInput(value),packet={type:'action',action,input};if(!validPayload(packet))return false;if(seat===1)return send(packet);onAction({index:0,action,input});return true;},requestPause(value){
  if(closed||!started||typeof value!=='boolean')return false;
  if(!value&&(seat!==0||now()-lastRemote>=1000||!remoteReleased))return false;
  applyPause(value);return send({type:'pause',paused:value,...(seat===0?{snapshotSeq}:{})});
 },requestRematch(phase){return !closed&&started&&phase==='over'?send({type:'rematch'}):false;},publish(match,views){
  if(closed||!started||seat!==0||now()-lastPublish<40)return false;
  const snapshot=makeFightSnapshot({...match,paused},views,{...schema,seq:snapshotSeq+1,at:now()});if(!snapshot)return false;lastPublish=now();snapshotSeq++;return send({type:'snapshot',snapshot});
 },publishEvents(events){if(closed||!started||seat!==0||!events.length)return false;try{const packet={type:'events',matchId,seq:eventSeq+1,events:clone(events)};if(!validPayload(packet)||packetBytes(packet)>61440)return false;eventSeq++;return send(packet);}catch{return false;}},views(time=now()){
  if(!current)return null;const fraction=Math.max(0,Math.min(1,(time-arrivedAt)/40));return current.views.map((view,index)=>{const before=previous?.views[index];if(current.state.phase!=='fight'||previous?.state.phase!=='fight'||current.state.stage.id!==previous.state.stage.id||!before||before.clip!==view.clip||before.facing!==view.facing||before.poseIndex!==view.poseIndex||before.opacity!==view.opacity)return view;return {...view,x:before.x+(view.x-before.x)*fraction,y:before.y+(view.y-before.y)*fraction};});
 },tick(){if(closed||!started||paused)return;if((seat===0&&now()-lastRemote>=1000)||(seat===1&&now()-lastSnapshot>=1000))api.requestPause(true);},disconnect(reason){if(closed)return;closed=true;started=false;paused=true;remote=neutral();onPause(true);onDisconnect(reason);},destroy(){closed=true;started=false;remote=neutral();}};
 return api;
}
