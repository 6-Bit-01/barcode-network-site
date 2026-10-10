import {compactTournamentBroadcast} from "../../public/games/system-clash/play/fight-tournament-broadcast.mjs";
import {readFightSnapshot} from "../../public/games/system-clash/play/fight-network-state.mjs";
import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
export const ONLINE_ROOM_TTL=20*60*1000;
export const ONLINE_HOST_TIMEOUT=60000;
export const ONLINE_GUEST_TIMEOUT=60000;
export const ONLINE_FIGHTERS=["6-bit","cache-back","cliff","dj-floppydisc","mac-modem","mr-nice-guy","ms-mayhem","stolz","kaveman-brown","dr3wbaby","ash-flowers","wittyf0x","doofnoobler","lyra","papa-oak","lost-marbles","mutilator","bnl-01","9-bit"] as const;
export class OnlineRoomError extends Error { constructor(message:string,public status=400){super(message);} }
type Seat={memberId?:string;name:string;fighter:string;ready:boolean;lastSeen:number;tokenHash:string};
type Description={type:"offer"|"answer";sdp:string;generation?:number};
type Candidate={candidate:string;sdpMid:string|null;sdpMLineIndex:number|null;usernameFragment:string|null};
type RelayPacket={lane:"control"|"state";data:string};
type RelayLane={control:RelayPacket[];state:RelayPacket|null;lastControl:number;lastState:number};
type Relay={version:string;host:RelayLane;guest:RelayLane};
type MatchResult={matchId:number;winner:0|1|null};
type TournamentBinding={code:string;boutId:string;hostMemberId:string;guestMemberId:string;hostFighter:string;guestFighter:string;rules:{rounds:number;time:number};matchId?:number};
type BroadcastSnapshot={seq:number;matchId:number;state:{stage:{id:string};fighters:{id:string;name:string}[]}};
type Room={broadcastWatchUntil?:number;broadcast?:{snapshot:BroadcastSnapshot;updatedAt:number};tournament?:TournamentBinding;wins?:[number,number];matchId?:number;matchPhase?:"selection"|"match"|"over";selectionVersion?:number;result?:MatchResult|null;generation?:number;hostCandidates?:Candidate[];guestCandidates?:Candidate[];relay?:Relay|null;code:string;createdAt:number;expiresAt:number;host:Seat;guest:Seat|null;hostDescription:Description|null;guestDescription:Description|null};
export interface OnlineRoomStore {read(code:string):Promise<string|null>;cas(code:string,old:string|null,next:string|null,now:number):Promise<boolean>;list():Promise<string[]>;}
const hash=(token:string)=>createHash("sha256").update(token).digest("hex");
function screenName(value:unknown){if(typeof value!=="string")throw new OnlineRoomError("Choose a screen name.");const name=value.replace(/[^\p{L}\p{N} _.-]/gu,"").replace(/\s+/g," ").trim();if(!name||Array.from(name).length>24)throw new OnlineRoomError("Use a screen name of 1–24 characters.");return name;}
function roomCode(value:unknown){if(typeof value!=="string"||! /^[A-Z0-9]{6}$/.test(value))throw new OnlineRoomError("Use the six-character room code.");return value;}
function publicSeat(seat:Seat|null){return seat?{name:seat.name,fighter:seat.fighter,ready:seat.ready}:null;}
function owns(seat:Seat|null,token:string){if(!seat||typeof token!=="string"||token.length<24||token.length>96)return false;const actual=hash(token);return seat.tokenHash.length===actual.length&&timingSafeEqual(Buffer.from(seat.tokenHash),Buffer.from(actual));}
const relayActions=new Set(["punch","kick","low-punch","low-kick","uppercut","grab","jump","double-punch","power-kick","crouch-punch","crouch-kick","crouch-high-kick","jump-punch","jump-kick","weapon-throw","weapon-use","deletion"]);
const relayStages=new Set(["radio-studio","sheila-office","studio-rat-lair","containment","nature-simulation","witty-wasteland","interdimensional-station"]);
const relayObject=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const positive=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0;
const relayInputSequence=(value:unknown)=>value===undefined||(positive(value)&&Number(value)<=4294967295);
function relayInput(value:unknown){return relayObject(value)&&[-1,0,1].includes(Number(value.move))&&typeof value.move==="number"&&typeof value.crouch==="boolean"&&typeof value.block==="boolean"&&Object.keys(value).every(key=>["move","crouch","block"].includes(key));}
function relaySequence(packet:RelayPacket){return JSON.parse(packet.data).seq as number;}
function relayPacket(value:unknown,seat:"host"|"guest",room:Room,version:string):RelayPacket{
 if(!relayObject(value)||!["control","state"].includes(String(value.lane))||typeof value.data!=="string"||Buffer.byteLength(value.data,"utf8")>(value.lane==="state"&&seat==="host"?61440:8192))throw new OnlineRoomError("Cloud connection packet is invalid.");
 let wire;try{wire=JSON.parse(value.data);}catch{throw new OnlineRoomError("Cloud connection packet is invalid.");}
 if(!relayObject(wire)||wire.scope!=="system-clash-online-v1"||wire.version!==version||!positive(wire.seq)||!positive(wire.matchId)||!relayObject(wire.payload))throw new OnlineRoomError("Cloud connection packet is invalid.");
 const payload=wire.payload;
 if(payload.round!==undefined&&(!Number.isSafeInteger(payload.round)||Number(payload.round)<1||Number(payload.round)>10000))throw new OnlineRoomError("Cloud connection round is invalid.");
 if(["setup","start"].includes(String(payload.type))){
  const rules=payload.rules;
  if(rules!==undefined&&(!relayObject(rules)||Object.keys(rules).length!==2||![1,3,5].includes(Number(rules.rounds))||![0,60,99].includes(Number(rules.time))||typeof rules.rounds!=="number"||typeof rules.time!=="number"))throw new OnlineRoomError("Cloud match rules are invalid.");
  if(room.tournament&&(!relayObject(rules)||rules.rounds!==room.tournament.rules.rounds||rules.time!==room.tournament.rules.time))throw new OnlineRoomError("Use the tournament's saved match rules.",403);
 }

 if(payload.wins!==undefined&&(seat!=="host"||!Array.isArray(payload.wins)||payload.wins.length!==2||!payload.wins.every((win,index)=>Number.isSafeInteger(win)&&Number(win)>=0&&Number(win)<=1000&&win===(room.wins??[0,0])[index])))throw new OnlineRoomError("The session score is not valid for this seat.");
 if(value.lane==="state"){
  const valid=seat==="host"?payload.type==="snapshot"&&relayObject(payload.snapshot):payload.type==="input"&&relayInput(payload.input)&&relayInputSequence(payload.inputSeq);
  if(!valid)throw new OnlineRoomError("Cloud connection state is invalid for this seat.");
 }else{
  if(seat==="guest"&&["setup","start","events","snapshot"].includes(String(payload.type)))throw new OnlineRoomError("Only the host can control the match.");
  let valid=false;
  switch(payload.type){
   case "loaded":case "leave":case "ping":case "pong":valid=true;break;
   case "hello":valid=payload.version===version&&payload.room===room.code&&payload.role===seat;break;
   case "started":valid=positive(payload.matchId);break;
   case "rematch":valid=payload.matchId===undefined||positive(payload.matchId);break;
   case "setup":valid=payload.stage===undefined||relayStages.has(String(payload.stage));break;
   case "start":valid=Number.isInteger(payload.seed)&&Number(payload.seed)>=0&&Number(payload.seed)<=4294967295&&positive(payload.matchId);break;
   case "pause":valid=typeof payload.paused==="boolean";break;
   case "input":valid=relayInput(payload.input)&&relayInputSequence(payload.inputSeq);break;
   case "action":valid=relayActions.has(String(payload.action))&&relayInput(payload.input)&&relayInputSequence(payload.inputSeq);break;
   case "events":valid=Array.isArray(payload.events)&&payload.events.length<=64&&payload.events.every(event=>relayObject(event)&&typeof event.type==="string"&&event.type.length<=60);break;
  }
  if(!valid)throw new OnlineRoomError("Cloud connection control is invalid.");
 }
 return {lane:value.lane as "control"|"state",data:value.data};
}
// Public pose identifiers come from the existing ordinary fighter, arcade and Deletion manifests.
const broadcastCommonClips=["block","crouch","crouch-high-kick","crouch-kick","crouch-punch","delete-brace","delete-compressed","delete-crumpled","delete-present","delete-rip-front","delete-suspended","double-punch","getup","grab","grabbed","high","idle","jump","jump-kick","jump-punch","kick","knockdown","low","low-kick","low-punch","pickup","power-kick","punch","thrown","uppercut","walk"];
const broadcastFighterClips:Record<string,string[]>={
 "6-bit":[...broadcastCommonClips,...["delete-pull","delete-shove","delete-stomp","grab-low"]],
 "cache-back":[...broadcastCommonClips,...["delete-pull","delete-shove","delete-stomp","grab-low"]],
 "cliff":[...broadcastCommonClips,...["delete-pull","delete-shove","delete-stomp","grab-low"]],
 "dj-floppydisc":[...broadcastCommonClips,...["delete-disc-throw","delete-pull","delete-shove","delete-stomp","grab-low"]],
 "mac-modem":[...broadcastCommonClips,...["delete-pull","delete-shove","delete-stomp","grab-low"]],
 "mr-nice-guy":[...broadcastCommonClips,...["delete-bow","delete-pull","delete-shove","delete-stomp","grab-low"]],
 "ms-mayhem":[...broadcastCommonClips,...["delete-hammer","delete-pull","delete-shove","delete-stamp","delete-stomp","grab-low"]],
 "stolz":[...broadcastCommonClips,...["delete-pull","delete-shove","delete-stomp","grab-low"]],
 "kaveman-brown":[...broadcastCommonClips,...["delete-pull","delete-shove","delete-stomp","grab-low"]],
 "dr3wbaby":[...broadcastCommonClips,...["delete-pull","delete-shove","delete-stomp","grab-low"]],
 "ash-flowers":[...broadcastCommonClips,...["delete-positivity","delete-pull","delete-shove","delete-stomp","grab-low"]],
 "wittyf0x":[...broadcastCommonClips,...["delete-cast","delete-pull","delete-shove","delete-stomp","grab-low"]],
 "doofnoobler":[...broadcastCommonClips,...["delete-hug","delete-hug-happy","delete-pull","delete-shove","delete-stomp","grab-high"]],
 "lyra":[...broadcastCommonClips,...["delete-claw","delete-front","delete-litter-kick","delete-pull","delete-shove","delete-stomp","grab-low"]],
 "papa-oak":[...broadcastCommonClips,...["delete-rip","grab-low"]],
 "lost-marbles":[...broadcastCommonClips,...["delete-front","delete-marble","delete-pull","delete-shove","delete-stomp","grab-low"]],
 "mutilator":[...broadcastCommonClips,...["delete-cleaver","delete-cleaver-windup","delete-pull","delete-shove","delete-stomp","grab-low"]],
 "bnl-01":[...broadcastCommonClips,...["delete-pull","delete-shove","delete-signal-burst","delete-signal-focus","delete-signal-overload","delete-victim-front-lift","delete-victory","grab-low"]],
 "9-bit":[...broadcastCommonClips,...["delete-nail","delete-pull","delete-shove","delete-stomp","grab-low"]],
};
const broadcastKeys=new Set(["seq","matchId","at","state","views","mode","phase","phaseTime","roundRemaining","finishRemaining","winner","deletionElapsed","deletionName","deletionId","deletionTargetX","status","hitstop","combatTime","paused","pauseReason","finisherAvailable","stagePickups","projectiles","nextPickupAt","stage","_deletionOrigin","roundNumber","roundWins","setComplete","roundIntermission","fighters","id","name","x","y","facing","hp","maxHp","height","action","actionTime","weapon","damageTaken","damageTier","damageSites","damageMarks","embeddedWeapons","_deleted","clip","elapsed","opacity","poseIndex","head","torso","legs","amount","hits","bruise","cut","scorch","site","kind","intensity","heightRatio","direction","seed","type","charges","owner","embed","vx","vy","gravity","rotation","damage","age","ttl","target","victimFacing","near","victim","width","clock","fightClock","cooldownUntil","interaction","activation","activationSerial","transitionSerial","cinematicOrigin","portalSerial","lastPortalTransit","walls","wallRooms","lastWallImpact","left","right","broken","serial","actor","warningEnd","impactAt","endAt","active","impacted","side","strength","from","to","index",...relayStages]);
function broadcastProjection(value:unknown):unknown{
 if(Array.isArray(value))return value.map(broadcastProjection);
 if(!relayObject(value))return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>broadcastKeys.has(key)).map(([key,item])=>[key,broadcastProjection(item)]));
}
function validatedBroadcast(room:Room,value:unknown):BroadcastSnapshot{
 const reader=readFightSnapshot as unknown as (value:unknown,options:{roster:string[];fighterIds:string[];clipIds:string[][];matchId:number})=>BroadcastSnapshot|null;
 const snapshot=reader(value,{roster:[...ONLINE_FIGHTERS],fighterIds:[room.host.fighter,room.guest!.fighter],clipIds:[broadcastFighterClips[room.host.fighter],broadcastFighterClips[room.guest!.fighter]],matchId:room.matchId!});
 if(!snapshot)throw new OnlineRoomError("The live match snapshot is invalid.");
 const result=broadcastProjection(snapshot) as BroadcastSnapshot;result.state.fighters[0].name=room.host.name;result.state.fighters[1].name=room.guest!.name;const compact=compactTournamentBroadcast(result) as BroadcastSnapshot|null;if(!compact)throw new OnlineRoomError("The live view pose update is too large.",413);return compact;
}
const emptyRelayLane=():RelayLane=>({control:[],state:null,lastControl:0,lastState:0});
function sessionState(room:Room){return {wins:room.wins??[0,0],matchId:room.matchId??0,matchPhase:room.matchPhase??"selection",selectionVersion:room.selectionVersion??0,result:room.result??null};}
function publicRoom(room:Room,seat:"host"|"guest"){return {...(room.tournament?{tournament:{code:room.tournament.code,boutId:room.tournament.boutId,rules:room.tournament.rules}}:{}),code:room.code,role:seat,expiresAt:room.expiresAt,host:publicSeat(room.host),guest:publicSeat(room.guest),description:seat==="host"?room.guestDescription:room.hostDescription,relay:!!room.relay,generation:room.generation??1,candidates:(seat==="host"?room.guestCandidates:room.hostCandidates)??[],...sessionState(room)};}
function resetConnection(room:Room){room.broadcast=undefined;room.broadcastWatchUntil=undefined;room.host.ready=false;if(room.guest)room.guest.ready=false;room.generation=1;room.hostCandidates=[];room.guestCandidates=[];room.relay=null;room.hostDescription=null;room.guestDescription=null;}
function selectScreen(room:Room){resetConnection(room);room.matchPhase="selection";room.selectionVersion=(room.selectionVersion??0)+1;}
function releaseGuest(room:Room){if(room.tournament&&room.matchPhase==="over"&&room.result&&room.guest){room.guest.tokenHash="";room.guest.ready=false;return;}room.guest=null;room.wins=[(room.wins??[0,0])[0],0];room.result=null;selectScreen(room);}
function expireGuest(room:Room,time:number){if(room.guest&&time-room.guest.lastSeen>=ONLINE_GUEST_TIMEOUT)releaseGuest(room);}

export function createOnlineRooms({store,member,now=Date.now,token=()=>randomBytes(24).toString("base64url"),code=()=>{const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",bytes=randomBytes(6);return Array.from(bytes,b=>chars[b%chars.length]).join("");}}:{store:OnlineRoomStore;member?:{id:string;name:string};now?:()=>number;token?:()=>string;code?:()=>string}){
 async function read(id:string){const raw=await store.read(roomCode(id));if(!raw)throw new OnlineRoomError("This session is no longer available.",404);const room=JSON.parse(raw) as Room;if(room.expiresAt<=now())throw new OnlineRoomError("This session expired. Create another.",410);return {raw,room};}
 function role(room:Room,key:string){if((!member||room.host.memberId===member.id)&&owns(room.host,key))return "host" as const;if((!member||room.guest?.memberId===member.id)&&owns(room.guest,key))return "guest" as const;throw new OnlineRoomError("This seat is no longer available.",401);}
 async function mutate<T>(id:string,key:string,change:(room:Room,seat:"host"|"guest")=>T){for(let i=0;i<5;i++){const {raw,room}=await read(id),seat=role(room,key);if(member&&room[seat])room[seat]!.name=member.name;const result=change(room,seat);if(room[seat])room[seat]!.lastSeen=now();if(await store.cas(id,raw,JSON.stringify(room),now()))return result;}throw new OnlineRoomError("Session changed. Please retry.",409);}
 return {
 async create(value:unknown){const name=member?member.name:screenName(value),key=token(),time=now();for(let i=0;i<6;i++){const id=code();const room:Room={wins:[0,0],matchId:0,matchPhase:"selection",selectionVersion:0,result:null,code:id,createdAt:time,expiresAt:time+ONLINE_ROOM_TTL,host:{...(member?{memberId:member.id}:{}),name,fighter:"6-bit",ready:false,lastSeen:time,tokenHash:hash(key)},guest:null,hostDescription:null,guestDescription:null,relay:null,generation:1,hostCandidates:[],guestCandidates:[]};if(await store.cas(id,null,JSON.stringify(room),time))return {code:id,role:"host" as const,token:key,expiresAt:room.expiresAt};}throw new OnlineRoomError("Sessions are busy. Please retry.",503);},
 async join(id:string,value:unknown){const name=member?member.name:screenName(value),key=token();for(let i=0;i<5;i++){const {raw,room}=await read(id),time=now();if(room.tournament&&(room.matchId??0)>=1)throw new OnlineRoomError("Return to the tournament for the next match.",409);if(room.tournament&&(!member||member.id!==room.tournament.guestMemberId))throw new OnlineRoomError("This tournament seat belongs to the assigned player.",403);if(member&&room.host.memberId===member.id)throw new OnlineRoomError("Your account already hosts this session.",409);if(member&&!room.host.memberId)throw new OnlineRoomError("This session is no longer available.",410);if(room.guest&&time-room.guest.lastSeen<ONLINE_GUEST_TIMEOUT)throw new OnlineRoomError("This session already has two players.",409);if(time-room.host.lastSeen>=ONLINE_HOST_TIMEOUT)throw new OnlineRoomError("The host is no longer here.",410);expireGuest(room,time);room.wins=[(room.wins??[0,0])[0],0];room.result=null;room.guest={...(member?{memberId:member.id}:{}),name,fighter:room.tournament?.guestFighter??"6-bit",ready:false,lastSeen:now(),tokenHash:hash(key)};if(await store.cas(id,raw,JSON.stringify(room),now()))return {code:id,role:"guest" as const,token:key,expiresAt:room.expiresAt};}throw new OnlineRoomError("Another player joined. Choose another session.",409);},
 async list(){const time=now();return (await store.list()).map(raw=>JSON.parse(raw) as Room).filter(r=>!r.tournament&&(!member||!!r.host.memberId)&&!r.guest&&r.expiresAt>time&&time-r.host.lastSeen<ONLINE_HOST_TIMEOUT).sort((a,b)=>b.createdAt-a.createdAt).slice(0,20).map(r=>({code:r.code,hostName:r.host.name,fighter:r.host.fighter,createdAt:r.createdAt}));},
 async poll(id:string,key:string){return mutate(id,key,(room,seat)=>{if(seat==="host")expireGuest(room,now());return publicRoom(room,seat);});},
 async begin(id:string,key:string,value:{after?:unknown}){return mutate(id,key,(room,seat)=>{
  if(seat!=="host")throw new OnlineRoomError("Only the host starts a match.",403);
  if(!Number.isSafeInteger(value.after)||Number(value.after)<0)throw new OnlineRoomError("The match request is invalid.");
  const current=room.matchId??0;if(room.tournament&&current>=1&&!(room.matchPhase==="match"&&value.after===current-1))throw new OnlineRoomError("Return to the tournament for the next match.",403);
  if(room.matchPhase==="match"&&value.after===current-1)return publicRoom(room,seat);
  if(value.after!==current||room.matchPhase==="match")throw new OnlineRoomError("The match changed. Refresh this session.",409);
  if(!room.guest||!room.host.ready||!room.guest.ready)throw new OnlineRoomError("Both players must be ready to start.",409);
  if(current>=1000)throw new OnlineRoomError("Create a new session to keep playing.",409);
  room.matchId=current+1;room.matchPhase="match";room.result=null;return publicRoom(room,seat);
 });},
 async result(id:string,key:string,value:{matchId?:unknown;winner?:unknown}){return mutate(id,key,(room,seat)=>{
  if(seat!=="host")throw new OnlineRoomError("Only the host records a completed match.",403);
  if(!positive(value.matchId)||![0,1,null].includes(value.winner as number|null))throw new OnlineRoomError("The match result is invalid.");
  if(value.matchId!==(room.matchId??0))throw new OnlineRoomError("The match changed. Its result cannot be recorded.",409);
  if(room.result?.matchId===value.matchId){if(room.result.winner!==value.winner)throw new OnlineRoomError("This match already has a different result.",409);return publicRoom(room,seat);}
  if(room.matchPhase!=="match"||!room.guest||!room.host.ready||!room.guest.ready)throw new OnlineRoomError("This match is no longer active.",409);
  room.wins=room.wins??[0,0];if(value.winner===0||value.winner===1)room.wins[value.winner]++;
  room.result={matchId:Number(value.matchId),winner:value.winner as 0|1|null};room.matchPhase="over";return publicRoom(room,seat);
 });},
 async lobby(id:string,key:string){return mutate(id,key,(room,seat)=>{if(room.tournament)throw new OnlineRoomError("Return to the tournament to change matches.",403);if(room.matchPhase==="selection"&&room.result)return publicRoom(room,seat);if(room.matchPhase!=="over")throw new OnlineRoomError("Finish this match before changing fighters.",409);selectScreen(room);return publicRoom(room,seat);});},
 async resume(id:string,key:string){return mutate(id,key,(room,seat)=>{if(room.tournament&&room.matchPhase!=="selection")return publicRoom(room,seat);selectScreen(room);return publicRoom(room,seat);});},
 async select(id:string,key:string,value:{fighter?:unknown;ready?:unknown}){if(!ONLINE_FIGHTERS.includes(value.fighter as typeof ONLINE_FIGHTERS[number])||typeof value.ready!=="boolean")throw new OnlineRoomError("Choose an available fighter.");return mutate(id,key,(room,seat)=>{if(room.matchPhase==="match"||room.matchPhase==="over")throw new OnlineRoomError("Return to fighter selection before choosing.",409);const player=room[seat]!;if(room.tournament&&value.fighter!==room.tournament[seat==="host"?"hostFighter":"guestFighter"])throw new OnlineRoomError("This tournament uses your reserved fighter.",403);const changed=player.fighter!==value.fighter;player.fighter=value.fighter as string;player.ready=player.ready&&changed?false:value.ready as boolean;if(changed||!player.ready){room.generation=1;room.hostCandidates=[];room.guestCandidates=[];room.relay=null;room.hostDescription=null;room.guestDescription=null;}return {ok:true};});},
 async relay(id:string,key:string,value:unknown){return mutate(id,key,(room,seat)=>{
  if(!room.guest||!room.host.ready||!room.guest.ready)throw new OnlineRoomError("Both players must be ready for a cloud connection.",409);
  if(!relayObject(value)||typeof value.version!=="string"||!/^[a-z0-9-]{1,90}$/.test(value.version)||!Number.isSafeInteger(value.ack)||Number(value.ack)<0||!Array.isArray(value.packets)||value.packets.length>16||Buffer.byteLength(JSON.stringify(value),"utf8")>74000)throw new OnlineRoomError("Cloud connection request is invalid.");
  if(room.relay&&room.relay.version!==value.version)throw new OnlineRoomError("Game versions differ. Both players should refresh and create a new session.",409);
  const packets=value.packets.map(packet=>relayPacket(packet,seat,room,value.version as string));
  const relay=room.relay??{version:value.version,host:emptyRelayLane(),guest:emptyRelayLane()},own=relay[seat],other=relay[seat==="host"?"guest":"host"];
  if(Number(value.ack)>other.lastControl)throw new OnlineRoomError("Cloud connection acknowledgement is invalid.");
  other.control=other.control.filter(packet=>relaySequence(packet)>Number(value.ack));
  for(const packet of packets){
   const seq=relaySequence(packet);
   if(packet.lane==="state"){if(seq>own.lastState){own.state=packet;own.lastState=seq;}continue;}
   if(seq<=own.lastControl)continue;
   if(seq!==own.lastControl+1)throw new OnlineRoomError("Cloud connection controls arrived out of order.",409);
   own.control.push(packet);own.lastControl=seq;
  }
  if(own.control.length>32||own.control.reduce((size,packet)=>size+Buffer.byteLength(packet.data,"utf8"),0)>12288)throw new OnlineRoomError("Cloud connection fell behind. Leave this session and try again.",409);
  room.relay=relay;room.hostDescription=null;room.guestDescription=null;
  return {relay:true,accepted:{control:own.lastControl,state:own.lastState},packets:[...other.control,...(other.state?[other.state]:[])]};
 });},
 async broadcast(id:string,key:string,value:unknown){return mutate(id,key,(room,seat)=>{
  if(seat!=="host")throw new OnlineRoomError("Only the assigned match host can broadcast.",403);
  if(!room.tournament||room.tournament.matchId!==room.matchId||!room.guest||!["match","over"].includes(room.matchPhase??""))throw new OnlineRoomError("This tournament match is not live.",409);
  if(!relayObject(value))throw new OnlineRoomError("The live match snapshot is invalid.");
  const snapshot=validatedBroadcast(room,value.snapshot),time=now(),intervalMs=(room.broadcastWatchUntil??0)>time?100:500;
  if(room.broadcast&&(snapshot.seq<=room.broadcast.snapshot.seq||time-room.broadcast.updatedAt<intervalMs))return {ok:true,accepted:false,intervalMs};
  room.broadcast={snapshot,updatedAt:time};return {ok:true,accepted:true,intervalMs};
 });},
 async candidates(id:string,key:string,value:unknown){return mutate(id,key,(room,seat)=>{
  if(!relayObject(value)||!Number.isInteger(value.generation)||value.generation!==(room.generation??1)||room.relay)throw new OnlineRoomError("The connection attempt changed.",409);
  if(!Array.isArray(value.candidates)||value.candidates.length>16)throw new OnlineRoomError("The connection candidates are invalid.");
  const candidates=value.candidates.map(raw=>{
   if(!relayObject(raw)||typeof raw.candidate!=="string"||!raw.candidate.startsWith("candidate:")||raw.candidate.length>2048||/[\r\n\0]/.test(raw.candidate)||(raw.sdpMid!==null&&raw.sdpMid!==undefined&&(typeof raw.sdpMid!=="string"||raw.sdpMid.length>32))||(raw.sdpMLineIndex!==null&&raw.sdpMLineIndex!==undefined&&(!Number.isInteger(raw.sdpMLineIndex)||Number(raw.sdpMLineIndex)<0||Number(raw.sdpMLineIndex)>16))||(raw.usernameFragment!==null&&raw.usernameFragment!==undefined&&(typeof raw.usernameFragment!=="string"||raw.usernameFragment.length>256)))throw new OnlineRoomError("The connection candidates are invalid.");
   return {candidate:raw.candidate,sdpMid:raw.sdpMid??null,sdpMLineIndex:raw.sdpMLineIndex??null,usernameFragment:raw.usernameFragment??null} as Candidate;
  });
  const field=seat==="host"?"hostCandidates":"guestCandidates",stored=room[field]??[],seen=new Set(stored.map(candidate=>JSON.stringify(candidate)));
  for(const candidate of candidates){const identity=JSON.stringify(candidate);if(!seen.has(identity)){if(stored.length>=64)throw new OnlineRoomError("Too many connection candidates.");seen.add(identity);stored.push(candidate);}}
  room[field]=stored;return {ok:true};
 });},
 async signal(id:string,key:string,value:unknown){return mutate(id,key,(room,seat)=>{
  const description=value as Description,generation=description?.generation??1,current=room.generation??1;
  if(!description||description.type!==(seat==="host"?"offer":"answer")||typeof description.sdp!=="string"||description.sdp.length>65536||!description.sdp.startsWith("v=0")||!Number.isInteger(generation)||generation<1||generation>2)throw new OnlineRoomError("The connection signal is invalid.");
  if(room.relay||generation<current||generation>current+(seat==="host"?1:0))throw new OnlineRoomError("The connection attempt changed.",409);
  if(seat==="host"&&generation>current){room.generation=generation;room.hostDescription=null;room.guestDescription=null;room.hostCandidates=[];room.guestCandidates=[];}
  const field=seat==="host"?"hostDescription":"guestDescription";
  if(room[field]&&room[field]!.sdp!==description.sdp)throw new OnlineRoomError("The connection signal changed. Retry the session.",409);
  room[field]={type:description.type,sdp:description.sdp,generation};return {ok:true};
 });},
 async leave(id:string,key:string){for(let i=0;i<5;i++){const {raw,room}=await read(id),seat=role(room,key);if(seat==="guest")releaseGuest(room);const retain=!!room.tournament&&room.matchPhase==="over"&&!!room.result;if(seat==="host"&&retain){room.host.tokenHash="";room.host.ready=false;}if(await store.cas(id,raw,seat==="host"&&!retain?null:JSON.stringify(room),now()))return {ok:true};}throw new OnlineRoomError("Session changed. Please retry.",409);},
 };
}

/** Private game-store evidence; account identifiers never enter browser projections. */
async function privateOnlineRoom(store:OnlineRoomStore,code:string){
 const raw=await store.read(roomCode(code));if(!raw)throw new OnlineRoomError("This session is no longer available.",404);
 const room=JSON.parse(raw) as Room;if(room.expiresAt<=Date.now())throw new OnlineRoomError("This session expired.",410);
 if(!room.host.memberId)throw new OnlineRoomError("This session has no account-bound host.",409);
 return {raw,room};
}
export async function getOnlineRoomEvidence({store,code}:{store:OnlineRoomStore;code:string}){
 const {room}=await privateOnlineRoom(store,code);
 return {code:room.code,createdAt:room.createdAt,expiresAt:room.expiresAt,matchId:room.matchId??0,matchPhase:room.matchPhase??"selection",hostMemberId:room.host.memberId!,guestMemberId:room.guest?.memberId??null,hostFighter:room.host.fighter,guestFighter:room.guest?.fighter??null,tournament:room.tournament?{code:room.tournament.code,boutId:room.tournament.boutId,rules:room.tournament.rules}:null};
}
export async function getOnlineMatchEvidence({store,code,matchId,requireResult=false}:{store:OnlineRoomStore;code:string;matchId:number;requireResult?:boolean}){
 if(!Number.isSafeInteger(matchId)||matchId<1)throw new OnlineRoomError("The match binding is invalid.",409);
 const {room}=await privateOnlineRoom(store,code);
 if(!room.guest?.memberId||room.host.memberId===room.guest.memberId||room.matchId!==matchId||!["match","over"].includes(room.matchPhase??""))throw new OnlineRoomError("The tournament match changed.",409);
 if(requireResult&&(room.matchPhase!=="over"||room.result?.matchId!==matchId))throw new OnlineRoomError("Finish this match before advancing the tournament.",409);
 return {code:room.code,createdAt:room.createdAt,matchId,matchPhase:room.matchPhase!,hostMemberId:room.host.memberId!,guestMemberId:room.guest.memberId,hostFighter:room.host.fighter,guestFighter:room.guest.fighter,tournament:room.tournament?{code:room.tournament.code,boutId:room.tournament.boutId,rules:room.tournament.rules}:null,result:room.result??null};
}
type OnlineTournamentReservation={store:OnlineRoomStore;code:string;eventCode:string;boutId:string;hostMemberId:string;guestMemberId:string;hostFighter:string;guestFighter:string;rules:{rounds:number;time:number}};
function tournamentBinding(value:OnlineTournamentReservation):TournamentBinding{
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(value.hostMemberId)||!/^[A-Za-z0-9_-]{1,128}$/.test(value.guestMemberId)||value.hostMemberId===value.guestMemberId||!/^[A-Za-z0-9_-]{1,80}$/.test(value.boutId)||!ONLINE_FIGHTERS.includes(value.hostFighter as typeof ONLINE_FIGHTERS[number])||!ONLINE_FIGHTERS.includes(value.guestFighter as typeof ONLINE_FIGHTERS[number])||value.hostFighter===value.guestFighter||![1,3,5].includes(value.rules.rounds)||![0,60,99].includes(value.rules.time))throw new OnlineRoomError("The tournament assignment is invalid.",409);
 return {code:roomCode(value.eventCode),boutId:value.boutId,hostMemberId:value.hostMemberId,guestMemberId:value.guestMemberId,hostFighter:value.hostFighter,guestFighter:value.guestFighter,rules:{rounds:value.rules.rounds,time:value.rules.time}};
}
function sameTournamentBinding(a:TournamentBinding,b:TournamentBinding){return a.code===b.code&&a.boutId===b.boutId&&a.hostMemberId===b.hostMemberId&&a.guestMemberId===b.guestMemberId&&a.hostFighter===b.hostFighter&&a.guestFighter===b.guestFighter&&a.rules.rounds===b.rules.rounds&&a.rules.time===b.rules.time;}
export async function reserveOnlineTournamentRoom(value:OnlineTournamentReservation){
 const expected=tournamentBinding(value);
 for(let attempt=0;attempt<5;attempt++){
  const {raw,room}=await privateOnlineRoom(value.store,value.code);
  if(room.host.memberId!==expected.hostMemberId||(room.guest&&room.guest.memberId!==expected.guestMemberId))throw new OnlineRoomError("The tournament players do not match this session.",409);
  if(room.tournament){if(!sameTournamentBinding(room.tournament,expected))throw new OnlineRoomError("This session already belongs to another tournament match.",409);return {ok:true};}
  if((room.matchId??0)!==0||room.matchPhase!=="selection")throw new OnlineRoomError("Create a fresh session for this tournament match.",409);
  room.tournament=expected;room.host.fighter=expected.hostFighter;if(room.guest)room.guest.fighter=expected.guestFighter;resetConnection(room);
  if(await value.store.cas(value.code,raw,JSON.stringify(room),Date.now()))return {ok:true};
 }
 throw new OnlineRoomError("The tournament session changed. Retry its launch.",409);
}
export async function bindOnlineTournamentMatch(value:OnlineTournamentReservation&{matchId:number}){
 const expected=tournamentBinding(value);
 for(let attempt=0;attempt<5;attempt++){
  const {raw,room}=await privateOnlineRoom(value.store,value.code);
  if(room.host.memberId!==expected.hostMemberId||room.guest?.memberId!==expected.guestMemberId||room.host.fighter!==expected.hostFighter||room.guest.fighter!==expected.guestFighter||room.matchId!==value.matchId||room.matchPhase!=="match"||room.result)throw new OnlineRoomError("The tournament match does not match its assigned players.",409);
  if(room.tournament&&!sameTournamentBinding(room.tournament,expected))throw new OnlineRoomError("This session already belongs to another tournament match.",409);
  room.tournament={...expected,matchId:value.matchId};
  if(await value.store.cas(value.code,raw,JSON.stringify(room),Date.now()))return {ok:true};
 }
 throw new OnlineRoomError("The tournament session changed. Retry its launch.",409);
}

/** Spectator projection and a short interest lease; the caller owns current event access. */
export async function getOnlineTournamentBroadcast({store,code,eventCode,boutId,matchId}:{store:OnlineRoomStore;code:string;eventCode:string;boutId:string;matchId:number}){
 for(let attempt=0;attempt<5;attempt++){
  const {raw,room}=await privateOnlineRoom(store,code),time=Date.now();
  if(!positive(matchId)||room.matchId!==matchId||room.tournament?.matchId!==matchId||room.tournament.code!==eventCode||room.tournament.boutId!==boutId||!room.guest||!["match","over"].includes(room.matchPhase??""))throw new OnlineRoomError("The featured tournament match changed.",409);
  if((room.broadcastWatchUntil??0)<time+3000){room.broadcastWatchUntil=time+6000;if(!await store.cas(code,raw,JSON.stringify(room),time))continue;}
  if(!room.broadcast)return null;
  const snapshot=validatedBroadcast(room,room.broadcast.snapshot);
  return {snapshot,updatedAt:room.broadcast.updatedAt,matchId,stage:snapshot.state.stage.id,fighters:[{id:room.host.fighter,name:room.host.name},{id:room.guest.fighter,name:room.guest.name}]};
 }
 throw new OnlineRoomError("The featured match is busy. Refresh its live view.",409);
}
