/** One bounded wire contract shared by the lobby, peers and game frame. */
export const ONLINE_SCOPE='system-clash-online-v1';
export const ONLINE_VERSION='system-clash-20261008-1';
export const MAX_PACKET_BYTES=65536;
export const ONLINE_STAGES=Object.freeze(['radio-studio','sheila-office','studio-rat-lair','containment','nature-simulation','witty-wasteland']);
const actions=new Set(['punch','kick','low-punch','low-kick','uppercut','grab','jump','double-punch','power-kick','crouch-punch','crouch-kick','crouch-high-kick','jump-punch','jump-kick','weapon-throw','weapon-use','deletion']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function packetBytes(value){try{return new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).length;}catch{return Infinity;}}
export function validInput(input){return object(input)&&[-1,0,1].includes(input.move)&&typeof input.crouch==='boolean'&&typeof input.block==='boolean'&&Object.keys(input).every(key=>['move','crouch','block'].includes(key));}
export function validPayload(payload){
 if(!object(payload)||packetBytes(payload)>MAX_PACKET_BYTES)return false;
 switch(payload.type){
  case 'loaded':case 'leave':case 'ping':case 'pong':return true;
  case 'rematch':return payload.matchId===undefined||(Number.isSafeInteger(payload.matchId)&&payload.matchId>0);
  case 'hello':return typeof payload.version==='string'&&payload.version.length<100&&/^[A-Z0-9]{6}$/.test(payload.room)&&['host','guest'].includes(payload.role);
  case 'setup':return payload.stage===undefined||ONLINE_STAGES.includes(payload.stage);
  case 'start':return Number.isInteger(payload.seed)&&payload.seed>=0&&payload.seed<=0xffffffff&&Number.isSafeInteger(payload.matchId)&&payload.matchId>0;
  case 'action':return actions.has(payload.action)&&validInput(payload.input);
  case 'input':return validInput(payload.input);
  case 'pause':return typeof payload.paused==='boolean';
  case 'snapshot':return object(payload.snapshot);
  case 'events':return Array.isArray(payload.events)&&payload.events.length<=64&&payload.events.every(event=>object(event)&&typeof event.type==='string'&&event.type.length<=60);
  default:return false;
 }
}
export function createFrameRouter({origin,source,matchId,onPacket}){return event=>{if(event.origin!==origin||event.source!==source()||event.data?.scope!==ONLINE_SCOPE||(matchId&&event.data.matchId!==matchId())||!validPayload(event.data.payload))return false;onPacket(event.data.payload);return true;};}
export function createFrameCoordinator({onStart,random=Math.random}){
 let matchId=1,local=false,remote=false,started=false;
 return {get matchId(){return matchId;},loaded(which){if(which==='local')local=true;else if(which==='remote')remote=true;else return false;if(local&&remote&&!started){started=true;onStart({type:'start',matchId,seed:Math.floor(Math.max(0,Math.min(.999999999,random()))*0x100000000)});return true;}return false;},reset(next=matchId+1){if(!Number.isSafeInteger(next)||next<=matchId)return matchId;matchId=next;local=false;remote=false;started=false;return matchId;}};
}
