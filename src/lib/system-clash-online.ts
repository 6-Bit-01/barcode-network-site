import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
export const ONLINE_ROOM_TTL=20*60*1000;
export const ONLINE_HOST_TIMEOUT=60000;
export const ONLINE_GUEST_TIMEOUT=60000;
export const ONLINE_FIGHTERS=["6-bit","cache-back","cliff","dj-floppydisc","mac-modem","mr-nice-guy","ms-mayhem","stolz","kaveman-brown","dr3wbaby","ash-flowers","wittyf0x","doofnoobler","lyra","papa-oak","lost-marbles","mutilator","bnl-01","9-bit"] as const;
export class OnlineRoomError extends Error { constructor(message:string,public status=400){super(message);} }
type Seat={name:string;fighter:string;ready:boolean;lastSeen:number;tokenHash:string};
type Description={type:"offer"|"answer";sdp:string;generation?:number};
type Candidate={candidate:string;sdpMid:string|null;sdpMLineIndex:number|null;usernameFragment:string|null};
type RelayPacket={lane:"control"|"state";data:string};
type RelayLane={control:RelayPacket[];state:RelayPacket|null;lastControl:number;lastState:number};
type Relay={version:string;host:RelayLane;guest:RelayLane};
type MatchResult={matchId:number;winner:0|1|null};
type Room={wins?:[number,number];matchId?:number;matchPhase?:"selection"|"match"|"over";selectionVersion?:number;result?:MatchResult|null;generation?:number;hostCandidates?:Candidate[];guestCandidates?:Candidate[];relay?:Relay|null;code:string;createdAt:number;expiresAt:number;host:Seat;guest:Seat|null;hostDescription:Description|null;guestDescription:Description|null};
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
const emptyRelayLane=():RelayLane=>({control:[],state:null,lastControl:0,lastState:0});
function sessionState(room:Room){return {wins:room.wins??[0,0],matchId:room.matchId??0,matchPhase:room.matchPhase??"selection",selectionVersion:room.selectionVersion??0,result:room.result??null};}
function publicRoom(room:Room,seat:"host"|"guest"){return {code:room.code,role:seat,expiresAt:room.expiresAt,host:publicSeat(room.host),guest:publicSeat(room.guest),description:seat==="host"?room.guestDescription:room.hostDescription,relay:!!room.relay,generation:room.generation??1,candidates:(seat==="host"?room.guestCandidates:room.hostCandidates)??[],...sessionState(room)};}
function resetConnection(room:Room){room.host.ready=false;if(room.guest)room.guest.ready=false;room.generation=1;room.hostCandidates=[];room.guestCandidates=[];room.relay=null;room.hostDescription=null;room.guestDescription=null;}
function selectScreen(room:Room){resetConnection(room);room.matchPhase="selection";room.selectionVersion=(room.selectionVersion??0)+1;}
function releaseGuest(room:Room){room.guest=null;room.wins=[(room.wins??[0,0])[0],0];room.result=null;selectScreen(room);}
function expireGuest(room:Room,time:number){if(room.guest&&time-room.guest.lastSeen>=ONLINE_GUEST_TIMEOUT)releaseGuest(room);}

export function createOnlineRooms({store,now=Date.now,token=()=>randomBytes(24).toString("base64url"),code=()=>{const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",bytes=randomBytes(6);return Array.from(bytes,b=>chars[b%chars.length]).join("");}}:{store:OnlineRoomStore;now?:()=>number;token?:()=>string;code?:()=>string}){
 async function read(id:string){const raw=await store.read(roomCode(id));if(!raw)throw new OnlineRoomError("This session is no longer available.",404);const room=JSON.parse(raw) as Room;if(room.expiresAt<=now())throw new OnlineRoomError("This session expired. Create another.",410);return {raw,room};}
 function role(room:Room,key:string){if(owns(room.host,key))return "host" as const;if(owns(room.guest,key))return "guest" as const;throw new OnlineRoomError("This seat is no longer available.",401);}
 async function mutate<T>(id:string,key:string,change:(room:Room,seat:"host"|"guest")=>T){for(let i=0;i<5;i++){const {raw,room}=await read(id),seat=role(room,key),result=change(room,seat);if(room[seat])room[seat]!.lastSeen=now();if(await store.cas(id,raw,JSON.stringify(room),now()))return result;}throw new OnlineRoomError("Session changed. Please retry.",409);}
 return {
 async create(value:unknown){const name=screenName(value),key=token(),time=now();for(let i=0;i<6;i++){const id=code();const room:Room={wins:[0,0],matchId:0,matchPhase:"selection",selectionVersion:0,result:null,code:id,createdAt:time,expiresAt:time+ONLINE_ROOM_TTL,host:{name,fighter:"6-bit",ready:false,lastSeen:time,tokenHash:hash(key)},guest:null,hostDescription:null,guestDescription:null,relay:null,generation:1,hostCandidates:[],guestCandidates:[]};if(await store.cas(id,null,JSON.stringify(room),time))return {code:id,role:"host" as const,token:key,expiresAt:room.expiresAt};}throw new OnlineRoomError("Sessions are busy. Please retry.",503);},
 async join(id:string,value:unknown){const name=screenName(value),key=token();for(let i=0;i<5;i++){const {raw,room}=await read(id),time=now();if(room.guest&&time-room.guest.lastSeen<ONLINE_GUEST_TIMEOUT)throw new OnlineRoomError("This session already has two players.",409);if(time-room.host.lastSeen>=ONLINE_HOST_TIMEOUT)throw new OnlineRoomError("The host is no longer here.",410);expireGuest(room,time);room.wins=[(room.wins??[0,0])[0],0];room.result=null;room.guest={name,fighter:"6-bit",ready:false,lastSeen:now(),tokenHash:hash(key)};if(await store.cas(id,raw,JSON.stringify(room),now()))return {code:id,role:"guest" as const,token:key,expiresAt:room.expiresAt};}throw new OnlineRoomError("Another player joined. Choose another session.",409);},
 async list(){const time=now();return (await store.list()).map(raw=>JSON.parse(raw) as Room).filter(r=>!r.guest&&r.expiresAt>time&&time-r.host.lastSeen<ONLINE_HOST_TIMEOUT).sort((a,b)=>b.createdAt-a.createdAt).slice(0,20).map(r=>({code:r.code,hostName:r.host.name,fighter:r.host.fighter,createdAt:r.createdAt}));},
 async poll(id:string,key:string){return mutate(id,key,(room,seat)=>{if(seat==="host")expireGuest(room,now());return publicRoom(room,seat);});},
 async begin(id:string,key:string,value:{after?:unknown}){return mutate(id,key,(room,seat)=>{
  if(seat!=="host")throw new OnlineRoomError("Only the host starts a match.",403);
  if(!Number.isSafeInteger(value.after)||Number(value.after)<0)throw new OnlineRoomError("The match request is invalid.");
  const current=room.matchId??0;
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
 async lobby(id:string,key:string){return mutate(id,key,(room,seat)=>{if(room.matchPhase==="selection"&&room.result)return publicRoom(room,seat);if(room.matchPhase!=="over")throw new OnlineRoomError("Finish this match before changing fighters.",409);selectScreen(room);return publicRoom(room,seat);});},
 async resume(id:string,key:string){return mutate(id,key,(room,seat)=>{selectScreen(room);return publicRoom(room,seat);});},
 async select(id:string,key:string,value:{fighter?:unknown;ready?:unknown}){if(!ONLINE_FIGHTERS.includes(value.fighter as typeof ONLINE_FIGHTERS[number])||typeof value.ready!=="boolean")throw new OnlineRoomError("Choose an available fighter.");return mutate(id,key,(room,seat)=>{if(room.matchPhase==="match"||room.matchPhase==="over")throw new OnlineRoomError("Return to fighter selection before choosing.",409);const player=room[seat]!;const changed=player.fighter!==value.fighter;player.fighter=value.fighter as string;player.ready=player.ready&&changed?false:value.ready as boolean;if(changed||!player.ready){room.generation=1;room.hostCandidates=[];room.guestCandidates=[];room.relay=null;room.hostDescription=null;room.guestDescription=null;}return {ok:true};});},
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
 async leave(id:string,key:string){for(let i=0;i<5;i++){const {raw,room}=await read(id),seat=role(room,key);if(seat==="guest")releaseGuest(room);if(await store.cas(id,raw,seat==="host"?null:JSON.stringify(room),now()))return {ok:true};}throw new OnlineRoomError("Session changed. Please retry.",409);},
 };
}
