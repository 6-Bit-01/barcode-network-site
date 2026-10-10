import {createHash,randomUUID} from "node:crypto";
import {ONLINE_FIGHTERS} from "./system-clash-online";

export const TOURNAMENT_TTL=24*60*60*1000;
export const TOURNAMENT_FIGHTERS=ONLINE_FIGHTERS.filter(id=>id!=="bnl-01"&&id!=="9-bit");
export type TournamentMember={id:string;name:string;sessionExpiresAt:number};
export class TournamentError extends Error {constructor(message:string,public status=400){super(message);}}
type Settings={preset:"quick"|"standard"|"endurance"|"custom";maxPlayers:number;strikes:number;time:number;rounds:number};
type Entrant={id:string;memberId:string;name:string;fighter:string;status:"pending"|"approved"|"active"|"eliminated"|"withdrawn"|"rejected";ready:boolean;losses:number;byeCount:number;lastBye:number;lastSeen:number};
type Binding={roomCode:string;createdAt:number;matchId:number;boutId:string};
type Bout={id:string;round:number;p1:string;p2:string;status:"queued"|"ready"|"live"|"decision"|"complete"|"void";winner:string|null;source:null|"room"|"referee"|"withdrawal";reason?:string;roomCode:string|null;roomMatchId:number|null;roomCreatedAt:number|null;replays:number;usedRooms:string[]};
type Receipt={actor:string;requestId:string;fingerprint:string};
type Event={version:1;code:string;title:string;revision:number;status:"lobby"|"running"|"paused"|"complete"|"cancelled";settings:Settings;hostMemberId:string;hostLastSeen:number;createdAt:number;expiresAt:number;seed:number;entrants:Entrant[];round:number;bouts:Bout[];currentBoutId:string|null;championId:string|null;receipts:Receipt[]};
export interface TournamentStore {read(code:string):Promise<string|null>;cas(code:string,old:string|null,next:string,now:number,binding?:Binding):Promise<boolean>;list():Promise<string[]>;}
export type TournamentMatchEvidence={code:string;createdAt:number;matchId:number;matchPhase:string;hostMemberId:string;guestMemberId:string;hostFighter:string;guestFighter:string;tournament?:{code:string;boutId:string;rules:{rounds:number;time:number}}|null;result:{matchId:number;winner:0|1|null}|null};
export type TournamentRoomEvidence=Omit<TournamentMatchEvidence,"guestMemberId"|"guestFighter"|"result">&{guestMemberId:string|null;guestFighter:string|null};
export type TournamentRoomReservation={code:string;eventCode:string;boutId:string;hostMemberId:string;guestMemberId:string;hostFighter:string;guestFighter:string;rules:{rounds:number;time:number}};
type Command=Record<string,unknown>;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const uuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const integer=(value:unknown,min:number,max:number)=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max;
const validCode=(value:unknown):value is string=>typeof value==="string"&&/^[A-Z0-9]{6}$/.test(value);
const canonical=(value:unknown):string=>Array.isArray(value)?"["+value.map(canonical).join(",")+"]":object(value)?"{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}":JSON.stringify(value);
const fingerprint=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
const active=(event:Event)=>event.entrants.filter(p=>p.status==="active");
const holding=(p:Entrant)=>!["withdrawn","rejected"].includes(p.status);
export function normalizeTournamentSettings(value:unknown={}):Settings{
 if(!object(value)||Object.keys(value).some(key=>!["preset","maxPlayers","strikes","time","rounds"].includes(key)))throw new TournamentError("Choose valid tournament settings.");
 const preset=value.preset??"standard";
 if(!["quick","standard","endurance","custom"].includes(String(preset)))throw new TournamentError("Choose a tournament preset.");
 const defaults=preset==="quick"?{strikes:1,time:60,rounds:1}:preset==="endurance"?{strikes:3,time:99,rounds:3}:{strikes:2,time:99,rounds:1};
 const settings={preset:preset as Settings["preset"],maxPlayers:value.maxPlayers??16,strikes:value.strikes??defaults.strikes,time:value.time??defaults.time,rounds:value.rounds??defaults.rounds};
 if(!integer(settings.maxPlayers,2,16)||!integer(settings.strikes,1,5)||![0,60,99].includes(Number(settings.time))||![1,3,5].includes(Number(settings.rounds))||typeof settings.time!=="number"||typeof settings.rounds!=="number")throw new TournamentError("Use 2–16 players, 1–5 strikes and supported match rules.");
 return settings as Settings;
}
const allowed:Record<string,string[]>={
 create:["title","settings"],join:["fighter"],choose:["fighter"],approve:["entrantId"],reject:["entrantId"],ready:["ready"],settings:["settings"],start:[],next:[],offer:["boutId","roomCode"],bind:["boutId","roomCode","roomMatchId"],advance:["boutId"],adjudicate:["boutId","winnerEntrantId","reason"],replay:["boutId"],withdraw:[],pause:[],resume:[],cancel:[],ping:[],
};
function command(value:unknown):Command{
 if(!object(value)||typeof value.action!=="string"||!Object.hasOwn(allowed,value.action)||!uuid(value.requestId)||Object.keys(value).some(key=>!["action","code","requestId","expectedRevision",...allowed[value.action as string]].includes(key)))throw new TournamentError("The tournament request is invalid.");
 if(value.action!=="create"&&!validCode(value.code))throw new TournamentError("Use the six-character tournament code.");
 if(value.expectedRevision!==undefined&&!integer(value.expectedRevision,0,1000000))throw new TournamentError("Refresh this tournament before trying again.");
 return value;
}
function publicEvent(event:Event,member:TournamentMember,time:number){
 const own=event.entrants.find(p=>p.memberId===member.id&&holding(p)),role=event.hostMemberId===member.id?"host":own?"entrant":"spectator";
 const current=event.bouts.find(b=>b.id===event.currentBoutId);
 return {code:event.code,title:event.title,revision:event.revision,status:event.status,settings:{...event.settings},role,selfEntrantId:own?.id??null,createdAt:event.createdAt,expiresAt:event.expiresAt,round:event.round,currentBoutId:event.currentBoutId,nextBoutId:event.bouts.find(b=>b.status==="queued")?.id??null,championId:event.championId,hostConnected:time-event.hostLastSeen<90000,
  entrants:event.entrants.map(p=>({id:p.id,name:p.name,fighter:p.fighter,status:p.status,ready:p.ready,losses:p.losses,byeCount:p.byeCount,connected:time-p.lastSeen<90000})),
  bouts:event.bouts.map(b=>({id:b.id,round:b.round,p1:b.p1,p2:b.p2,status:b.status,winner:b.winner,source:b.source,reason:b.reason??null,roomCode:b.roomCode,roomMatchId:b.roomMatchId,replays:b.replays})),
  currentBout:current?{id:current.id,p1:current.p1,p2:current.p2,status:current.status,roomCode:current.roomCode,roomMatchId:current.roomMatchId}:null,
 };
}
function host(event:Event,member:TournamentMember){if(event.hostMemberId!==member.id)throw new TournamentError("Only the tournament host can do that.",403);}
function lobby(event:Event){if(event.status!=="lobby")throw new TournamentError("Tournament entries and rules are locked after the start.",409);}
function player(event:Event,member:TournamentMember){const found=event.entrants.find(p=>p.memberId===member.id&&holding(p));if(!found)throw new TournamentError("Join this tournament first.",403);return found;}
function fighter(event:Event,id:unknown,own?:Entrant){
 if(typeof id!=="string"||!TOURNAMENT_FIGHTERS.includes(id as typeof TOURNAMENT_FIGHTERS[number]))throw new TournamentError("Choose an available ordinary fighter.");
 if(event.entrants.some(p=>holding(p)&&p.id!==own?.id&&p.fighter===id))throw new TournamentError("That character is already reserved.",409);return id;
}
function finishIfTerminal(event:Event){
 const remaining=active(event);if(remaining.length>1)return false;
 event.currentBoutId=null;event.championId=remaining[0]?.id??null;event.status=remaining.length?"complete":"cancelled";
 for(const bout of event.bouts)if(["queued","ready"].includes(bout.status))bout.status="void";
 return true;
}
function shuffled(event:Event,values:Entrant[]){let state=(event.seed+event.round*0x9e3779b9)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};return values.map(p=>({p,n:random()})).sort((a,b)=>a.n-b.n||a.p.id.localeCompare(b.p.id)).map(v=>v.p);}
function schedule(event:Event,id:()=>string){
 if(finishIfTerminal(event))return;
 event.round++;let entries=shuffled(event,active(event));
 if(entries.length%2){const bye=[...entries].sort((a,b)=>a.byeCount-b.byeCount||a.lastBye-b.lastBye||entries.indexOf(a)-entries.indexOf(b))[0];bye.byeCount++;bye.lastBye=event.round;entries=entries.filter(p=>p.id!==bye.id);}
 const encounters=(a:string,b:string)=>event.bouts.filter(m=>m.status==="complete"&&((m.p1===a&&m.p2===b)||(m.p1===b&&m.p2===a))).length;
 while(entries.length){const p1=entries.shift()!,p2=[...entries].sort((a,b)=>encounters(p1.id,a.id)-encounters(p1.id,b.id)||entries.indexOf(a)-entries.indexOf(b))[0];entries=entries.filter(p=>p.id!==p2.id);event.bouts.push({id:id(),round:event.round,p1:p1.id,p2:p2.id,status:"queued",winner:null,source:null,roomCode:null,roomMatchId:null,roomCreatedAt:null,replays:0,usedRooms:[]});}
}
function settle(event:Event,bout:Bout,winner:string,source:Bout["source"],reason?:string){
 if(![bout.p1,bout.p2].includes(winner))throw new TournamentError("The winner must be one of this match's players.");
 const loser=event.entrants.find(p=>p.id===(winner===bout.p1?bout.p2:bout.p1))!;
 if(loser.status==="active"){loser.losses++;if(loser.losses>=event.settings.strikes)loser.status="eliminated";}
 bout.status="complete";bout.winner=winner;bout.source=source;if(reason)bout.reason=reason;event.currentBoutId=null;
 for(const entrant of event.entrants)if([bout.p1,bout.p2].includes(entrant.id))entrant.ready=false;
 finishIfTerminal(event);
}
function current(event:Event,boutId:unknown){const bout=event.bouts.find(b=>b.id===boutId);if(!bout)throw new TournamentError("This tournament match is unavailable.",404);return bout;}
const roomIdentity=(evidence:TournamentMatchEvidence)=>evidence.code+":"+evidence.createdAt+":"+evidence.matchId;
export function createSystemClashTournaments({store,readMatch,readRoom,reserveMatch,bindMatch,now=Date.now,id=randomUUID,code}:{store:TournamentStore;readMatch:(value:{code:string;matchId:number;requireResult:boolean})=>Promise<TournamentMatchEvidence>;readRoom?:(value:{code:string})=>Promise<TournamentRoomEvidence>;reserveMatch?:(value:TournamentRoomReservation)=>Promise<unknown>;bindMatch?:(value:TournamentRoomReservation&{matchId:number})=>Promise<unknown>;now?:()=>number;id?:()=>string;code?:()=>string}){
 function member(value:TournamentMember){if(!value||typeof value.id!=="string"||!value.id||typeof value.name!=="string"||!Number.isFinite(value.sessionExpiresAt)||value.sessionExpiresAt<=now())throw new TournamentError("Sign in to your website account to play online.",401);}
 async function read(value:unknown){if(!validCode(value))throw new TournamentError("Use the six-character tournament code.");const raw=await store.read(value);if(!raw)throw new TournamentError("This tournament is no longer available.",404);let event:Event;try{event=JSON.parse(raw);}catch{throw new TournamentError("Tournament storage is unavailable.",503);}if(event.version!==1)throw new TournamentError("Refresh to use this tournament version.",409);if(event.expiresAt<=now())throw new TournamentError("This tournament expired.",410);return {raw,event};}
 async function mutate(actor:TournamentMember,body:Command,change:(event:Event)=>Promise<boolean|void>|boolean|void){
  const digest=fingerprint(body);for(let attempt=0;attempt<8;attempt++){
   const {raw,event}=await read(body.code),receipt=event.receipts.find(r=>r.actor===actor.id&&r.requestId===body.requestId);
   if(receipt){if(receipt.fingerprint!==digest)throw new TournamentError("This request already has different details.",409);return publicEvent(event,actor,now());}
   if(body.expectedRevision!==undefined&&body.expectedRevision!==event.revision)throw new TournamentError("The tournament changed. Refresh and retry.",409);
   const previousBindings=new Set(event.bouts.filter(b=>b.roomCode&&b.roomMatchId).map(b=>b.roomCode+":"+b.roomCreatedAt+":"+b.roomMatchId));
   if(await change(event)===false)return publicEvent(event,actor,now());
   if(event.receipts.length>=2048)throw new TournamentError("This tournament reached its command limit. Finish with a new event.",409);event.revision++;const own=event.entrants.find(p=>p.memberId===actor.id);if(own)own.lastSeen=now();if(event.hostMemberId===actor.id)event.hostLastSeen=now();
   event.receipts.push({actor:actor.id,requestId:String(body.requestId),fingerprint:digest});
   const bound=event.bouts.find(b=>b.roomCode&&b.roomMatchId&&!previousBindings.has(b.roomCode+":"+b.roomCreatedAt+":"+b.roomMatchId));
   const binding=bound?{roomCode:bound.roomCode!,createdAt:bound.roomCreatedAt!,matchId:bound.roomMatchId!,boutId:bound.id}:undefined;
   if(await store.cas(event.code,raw,JSON.stringify(event),now(),binding))return publicEvent(event,actor,now());
  }throw new TournamentError("The tournament changed. Refresh and retry.",409);
 }
 return {
 async list(actor:TournamentMember){member(actor);const time=now();return {tournaments:(await store.list()).map(raw=>{try{return JSON.parse(raw) as Event;}catch{return null;}}).filter((event):event is Event=>!!event&&event.version===1&&event.expiresAt>time&&!["complete","cancelled"].includes(event.status)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,30).map(event=>({code:event.code,title:event.title,status:event.status,approvedCount:event.entrants.filter(p=>["approved","active"].includes(p.status)).length,maxPlayers:event.settings.maxPlayers,strikes:event.settings.strikes,preset:event.settings.preset,createdAt:event.createdAt}))};},
 async view(value:string,actor:TournamentMember){member(actor);for(let attempt=0;attempt<3;attempt++){const {event,raw}=await read(value),own=event.entrants.find(p=>p.memberId===actor.id&&holding(p));if(!own&&event.hostMemberId!==actor.id||(!own||now()-own.lastSeen<30000)&&(event.hostMemberId!==actor.id||now()-event.hostLastSeen<30000))return publicEvent(event,actor,now());if(own)own.lastSeen=now();if(event.hostMemberId===actor.id)event.hostLastSeen=now();if(await store.cas(event.code,raw,JSON.stringify(event),now()))return publicEvent(event,actor,now());}throw new TournamentError("The tournament changed. Refresh and retry.",409);},
 async command(actor:TournamentMember,value:unknown){member(actor);const body=command(value),action=String(body.action);
  if(action==="ping")return this.view(String(body.code),actor);
  if(action==="create"){
   const title=typeof body.title==="string"?body.title.replace(/[^\p{L}\p{N} _.,!?'-]/gu,"").trim():"Live Tournament";
   if(!title||Array.from(title).length>60)throw new TournamentError("Use a tournament title of 1–60 characters.");
   const settings=normalizeTournamentSettings(body.settings),time=now(),bytes=createHash("sha256").update(actor.id+":"+body.requestId).digest(),alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",eventCode=code?.()??Array.from(bytes.subarray(0,6),byte=>alphabet[byte%alphabet.length]).join("");
   const digest=fingerprint(body),existing=await store.read(eventCode);if(existing){const prior=JSON.parse(existing) as Event,receipt=prior.receipts.find(r=>r.actor===actor.id&&r.requestId===body.requestId);if(receipt&&receipt.fingerprint===digest&&prior.expiresAt>time)return publicEvent(prior,actor,time);throw new TournamentError("This request already has different details. Start a fresh request.",409);}
   const event:Event={version:1,code:eventCode,title,revision:1,status:"lobby",settings,hostMemberId:actor.id,hostLastSeen:time,createdAt:time,expiresAt:time+TOURNAMENT_TTL,seed:bytes.readUInt32BE(0),entrants:[],round:0,bouts:[],currentBoutId:null,championId:null,receipts:[{actor:actor.id,requestId:String(body.requestId),fingerprint:digest}]};
   if(await store.cas(eventCode,null,JSON.stringify(event),time))return publicEvent(event,actor,time);
   const saved=await read(eventCode),receipt=saved.event.receipts.find(r=>r.actor===actor.id&&r.requestId===body.requestId);if(receipt?.fingerprint===digest)return publicEvent(saved.event,actor,time);throw new TournamentError("Tournament changed. Retry with a fresh request.",409);
  }
  return mutate(actor,body,async event=>{
   if(["complete","cancelled"].includes(event.status)){if(action==="advance"&&current(event,body.boutId).status==="complete")return false;throw new TournamentError("This tournament has ended.",409);}
   if(["approve","reject","settings","start","next","adjudicate","replay","pause","resume","cancel"].includes(action))host(event,actor);
   if(action==="join"){
    lobby(event);const own=event.entrants.find(p=>p.memberId===actor.id&&holding(p));if(own)return false;
    if(event.entrants.filter(holding).length>=event.settings.maxPlayers)throw new TournamentError("This tournament is full.",409);
    if(event.entrants.length>=64)throw new TournamentError("This lobby has reached its entry limit.",409);
    event.entrants.push({id:id(),memberId:actor.id,name:actor.name,fighter:fighter(event,body.fighter),status:"pending",ready:false,losses:0,byeCount:0,lastBye:0,lastSeen:now()});return;
   }
   if(action==="choose"){lobby(event);const own=player(event,actor);own.fighter=fighter(event,body.fighter,own);own.ready=false;return;}
   if(action==="approve"||action==="reject"){lobby(event);const target=event.entrants.find(p=>p.id===body.entrantId);if(!target||target.status!=="pending")throw new TournamentError("This entry is no longer pending.",409);target.status=action==="approve"?"approved":"rejected";target.ready=false;return;}
   if(action==="settings"){lobby(event);const settings=normalizeTournamentSettings(body.settings);if(event.entrants.filter(holding).length>settings.maxPlayers)throw new TournamentError("Remove entries before reducing the capacity.",409);event.settings=settings;for(const p of event.entrants)p.ready=false;return;}
   if(action==="ready"){
    if(typeof body.ready!=="boolean")throw new TournamentError("Choose a valid ready state.");const own=player(event,actor);
    if(!["approved","active"].includes(own.status))throw new TournamentError("Wait for host approval before checking in.",409);
    if(event.status!=="lobby"){const bout=event.bouts.find(b=>b.id===event.currentBoutId);if(!bout||bout.status!=="ready"||![bout.p1,bout.p2].includes(own.id))throw new TournamentError("Wait until your match is called.",409);}
    own.ready=body.ready;return;
   }
   if(action==="start"){lobby(event);const approved=event.entrants.filter(p=>p.status==="approved");if(approved.length<2||approved.some(p=>!p.ready))throw new TournamentError("At least two approved players must be ready.",409);for(const p of event.entrants){if(p.status==="pending")p.status="rejected";if(p.status==="approved")p.status="active";p.ready=false;}event.status="running";schedule(event,id);return;}
   if(action==="next"){
    if(event.status!=="running")throw new TournamentError("Resume this tournament before calling a match.",409);
    if(event.currentBoutId)throw new TournamentError("Finish the current match first.",409);
    for(const bout of event.bouts)if(bout.status==="queued"&&[bout.p1,bout.p2].some(p=>!active(event).some(entry=>entry.id===p)))bout.status="void";
    if(!event.bouts.some(b=>b.status==="queued"))schedule(event,id);if(active(event).length<2)return;
    const bout=event.bouts.find(b=>b.status==="queued")!;bout.status="ready";event.currentBoutId=bout.id;for(const p of event.entrants)if([bout.p1,bout.p2].includes(p.id))p.ready=false;return;
   }
   if(action==="offer"){
    if(event.status!=="running")throw new TournamentError("Resume the tournament before connecting players.",409);
    const bout=current(event,body.boutId),p1=event.entrants.find(p=>p.id===bout.p1)!,p2=event.entrants.find(p=>p.id===bout.p2)!;
    if(actor.id!==p1.memberId)throw new TournamentError("Only the assigned P1 can offer this room.",403);
    if(event.currentBoutId!==bout.id||bout.status!=="ready"||!validCode(body.roomCode)||!readRoom||!reserveMatch)throw new TournamentError("This match cannot connect to that room.",409);
    if(bout.roomCode&&bout.roomCode!==body.roomCode){try{await readRoom({code:bout.roomCode});throw new TournamentError("Use this match's existing online room.",409);}catch(error){if(!(error instanceof Error)||![404,410].includes(Number((error as Error&{status?:number}).status)))throw error;}}
    const room=await readRoom({code:body.roomCode});
    if(room.hostMemberId!==p1.memberId||room.guestMemberId!==null&&room.guestMemberId!==p2.memberId||room.matchPhase!=="selection"||!Number.isFinite(room.createdAt))throw new TournamentError("This room does not belong to the assigned players.",409);
    await reserveMatch({code:body.roomCode,eventCode:event.code,boutId:bout.id,hostMemberId:p1.memberId,guestMemberId:p2.memberId,hostFighter:p1.fighter,guestFighter:p2.fighter,rules:{rounds:event.settings.rounds,time:event.settings.time}});
    if(bout.roomCode===body.roomCode&&bout.roomCreatedAt===room.createdAt)return false;
    bout.roomCode=room.code;bout.roomCreatedAt=room.createdAt;return;
   }
   if(action==="bind"){
    if(event.status!=="running")throw new TournamentError("Resume the tournament before starting a match.",409);const bout=current(event,body.boutId),p1=event.entrants.find(p=>p.id===bout.p1)!,p2=event.entrants.find(p=>p.id===bout.p2)!;
    if(actor.id!==p1.memberId&&actor.id!==event.hostMemberId)throw new TournamentError("Only the assigned match host can connect this bout.",403);
    if(bout.status==="live"&&bout.roomCode===body.roomCode&&bout.roomMatchId===body.roomMatchId)return false;
    if(event.currentBoutId!==bout.id||bout.status!=="ready"||!p1.ready||!p2.ready)throw new TournamentError("Both called players must check in first.",409);
    if(!validCode(body.roomCode)||!integer(body.roomMatchId,1,1000))throw new TournamentError("Choose the current online match.");
    const evidence=await readMatch({code:body.roomCode,matchId:Number(body.roomMatchId),requireResult:false}),identity=roomIdentity(evidence);
    if(evidence.hostMemberId!==p1.memberId||evidence.guestMemberId!==p2.memberId||evidence.hostFighter!==p1.fighter||evidence.guestFighter!==p2.fighter||bout.roomCode&&bout.roomCode!==evidence.code||bout.roomCreatedAt!==null&&bout.roomCreatedAt!==evidence.createdAt||evidence.matchPhase!=="match"||evidence.result||!Number.isFinite(evidence.createdAt))throw new TournamentError("This room does not contain the assigned active match.",409);
    if(event.bouts.some(b=>b.usedRooms.includes(identity)))throw new TournamentError("This online match was already used.",409);
    if(evidence.tournament&&(evidence.tournament.code!==event.code||evidence.tournament.boutId!==bout.id||evidence.tournament.rules.rounds!==event.settings.rounds||evidence.tournament.rules.time!==event.settings.time))throw new TournamentError("This room belongs to a different tournament.",409);
    await bindMatch?.({code:body.roomCode,eventCode:event.code,boutId:bout.id,matchId:Number(body.roomMatchId),hostMemberId:p1.memberId,guestMemberId:p2.memberId,hostFighter:p1.fighter,guestFighter:p2.fighter,rules:{rounds:event.settings.rounds,time:event.settings.time}});
    bout.usedRooms.push(identity);bout.roomCode=evidence.code;bout.roomMatchId=evidence.matchId;bout.roomCreatedAt=evidence.createdAt;bout.status="live";return;
   }
   if(action==="advance"){
    const bout=current(event,body.boutId);if(bout.status==="complete")return false;
    if(event.currentBoutId!==bout.id||bout.status!=="live"||!bout.roomCode||!bout.roomMatchId)throw new TournamentError("This match has no committed online result.",409);
    const p1=event.entrants.find(p=>p.id===bout.p1)!,p2=event.entrants.find(p=>p.id===bout.p2)!;
    if(actor.id!==event.hostMemberId&&actor.id!==p1.memberId&&actor.id!==p2.memberId)throw new TournamentError("Only this match's players or the host can save its result.",403);
    const evidence=await readMatch({code:bout.roomCode,matchId:bout.roomMatchId,requireResult:true});
    if(evidence.createdAt!==bout.roomCreatedAt||evidence.hostMemberId!==p1.memberId||evidence.guestMemberId!==p2.memberId||evidence.hostFighter!==p1.fighter||evidence.guestFighter!==p2.fighter||evidence.tournament?.code!==event.code||evidence.tournament?.boutId!==bout.id||evidence.tournament?.rules.rounds!==event.settings.rounds||evidence.tournament?.rules.time!==event.settings.time||evidence.matchPhase!=="over"||evidence.result?.matchId!==bout.roomMatchId||![0,1,null].includes(evidence.result?.winner as number|null))throw new TournamentError("This result belongs to another match.",409);
    if(evidence.result!.winner===null){bout.status="decision";bout.source="room";return;}
    settle(event,bout,evidence.result!.winner===0?bout.p1:bout.p2,"room");return;
   }
   if(action==="adjudicate"){
    const bout=current(event,body.boutId);if(event.currentBoutId!==bout.id||!["ready","live","decision"].includes(bout.status))throw new TournamentError("This match is no longer current.",409);
    if(typeof body.reason!=="string"||body.reason.trim().length<5||body.reason.length>240||/[\u0000-\u001f]/.test(body.reason))throw new TournamentError("Explain the referee decision in 5–240 characters.");
    if(typeof body.winnerEntrantId!=="string")throw new TournamentError("Choose one of this match's players.");settle(event,bout,body.winnerEntrantId,"referee",body.reason.trim());return;
   }
   if(action==="replay"){const bout=current(event,body.boutId);if(event.currentBoutId!==bout.id||bout.status!=="decision"||bout.replays>=1)throw new TournamentError("A tied match can be replayed once. Resolve further ties with a referee decision.",409);bout.replays++;bout.status="ready";bout.roomCode=null;bout.roomMatchId=null;bout.roomCreatedAt=null;for(const p of event.entrants)if([bout.p1,bout.p2].includes(p.id))p.ready=false;return;}
   if(action==="withdraw"){
    const own=player(event,actor);if(event.status==="lobby"){own.status="withdrawn";own.ready=false;return;}
    if(own.status!=="active")throw new TournamentError("This player is already out.",409);
    const bout=event.bouts.find(b=>b.id===event.currentBoutId);
    if(bout&&[bout.p1,bout.p2].includes(own.id))settle(event,bout,own.id===bout.p1?bout.p2:bout.p1,"withdrawal","Player withdrew.");
    own.losses=event.settings.strikes;own.status="withdrawn";own.ready=false;finishIfTerminal(event);return;
   }
   if(action==="pause"){if(event.status!=="running")throw new TournamentError("Only a running tournament can be paused.",409);event.status="paused";return;}
   if(action==="resume"){if(event.status!=="paused")throw new TournamentError("This tournament is not paused.",409);event.status="running";return;}
   if(action==="cancel"){event.status="cancelled";event.currentBoutId=null;for(const bout of event.bouts)if(["queued","ready","live","decision"].includes(bout.status))bout.status="void";return;}
   if(action==="ping"){player(event,actor);return;}
  });
 },
 };
}




