import {ONLINE_SCOPE,validPayload} from './online-protocol.mjs';
/** The game receives only messages from its own same-origin lobby parent. */
export function createOnlineFightBridge({url=globalThis.location?.href,window=globalThis.window,onPacket=()=>{},onDisconnect=()=>{}}={}){
 const launch=new URL(url??'https://system-clash.invalid/');
 const matchId=Number(launch.searchParams.get('matchId'))||1;
 const seat=launch.searchParams.get('seat')==='1'?1:0;
 const enabled=launch.searchParams.get('online')==='1'&&['0','1'].includes(launch.searchParams.get('seat'))&&!!window?.parent&&window.parent!==window;
 let closed=false;
 function disconnect(reason){if(closed)return;closed=true;onDisconnect(reason);}
 const listener=event=>{if(closed||event.source!==window.parent||event.origin!==launch.origin||event.data?.scope!==ONLINE_SCOPE||event.data.matchId!==matchId||!validPayload(event.data.payload))return;const payload=event.data.payload;if(payload.type==='leave')disconnect('The online session ended.');else onPacket(payload);};
 if(enabled)window.addEventListener('message',listener);
 return {enabled,seat,send(payload){if(!enabled||closed||!validPayload(payload))return false;window.parent.postMessage({scope:ONLINE_SCOPE,matchId,payload},launch.origin);return true;},destroy(){closed=true;if(enabled)window.removeEventListener('message',listener);}};
}
