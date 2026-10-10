import {ONLINE_VERSION,packetBytes} from './online-protocol.mjs';
import {createOnlinePeer} from './online-transport.mjs';
const labels={control:'clash-control',state:'clash-state'};
class RelayEvents{
 listeners=new Map();
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,fields={}){for(const fn of [...(this.listeners.get(type)??[])])fn({type,...fields});}
}
/** Carries the existing two wire lanes through the same authenticated room. */
export function createOnlineRelay({role,room,relayRequest,timers=globalThis,now=()=>performance.now(),version=ONLINE_VERSION,onDisconnect=()=>{},...options}){
 if(typeof relayRequest!=='function')throw new Error('Cloud connection is unavailable.');
 let closed=false,started=false,timer=null,errors=0,ack=0,state=null;
 const outgoing=[],channels={};
 const queueSize=()=>outgoing.reduce((size,item)=>size+packetBytes(item.data),0);
 function cleanup(){if(closed)return;closed=true;timers.clearTimeout(timer);outgoing.length=0;state=null;}
 class Channel extends RelayEvents{
  constructor(label,settings){super();this.label=label;this.ordered=settings.ordered;this.maxRetransmits=settings.maxRetransmits??null;this.readyState='connecting';}
  get bufferedAmount(){return this.label===labels.control?queueSize():state?packetBytes(state.data):0;}
  send(data){
   if(closed||this.readyState!=='open')throw new Error('Cloud connection closed.');
   const lane=this.label===labels.control?'control':'state',packet={lane,data};
   if(lane==='state'){if(packetBytes({version,ack,packets:[packet]})>74000)throw new Error('Match state is too large.');state=packet;}
   else{if(outgoing.length>=32)throw new Error('Cloud connection fell behind.');outgoing.push(packet);}
  }
  close(){this.readyState='closed';this.emit('close');}
  open(){this.readyState='open';this.emit('open');}
 }
 const link=new RelayEvents();Object.assign(link,{connectionState:'new',createDataChannel(label,settings){const lane=label===labels.control?'control':'state';return channels[lane]=new Channel(label,settings);},close:cleanup});
 const peer=createOnlinePeer({role,room,peer:link,timers,version,...options,now,onDisconnect:reason=>onDisconnect(/^Connection lost\./.test(reason)?'Cloud connection lost contact. Leave this session and try again.':reason)});
 if(role==='guest')for(const [lane,label]of Object.entries(labels)){const channel=new Channel(label,{ordered:lane==='control',...(lane==='state'?{maxRetransmits:0}:{})});channels[lane]=channel;link.emit('datachannel',{channel});}
 async function pump(){
  if(closed)return;
  const startedAt=now();
  const controls=outgoing.slice(0,state?15:16),packets=[...controls];
  if(state&&packetBytes({version,ack,packets:[...packets,state]})<=74000)packets.push(state);
  try{
   const result=await relayRequest({version,ack,packets});
   if(closed)return;
   if(result?.relay!==true||!Number.isSafeInteger(result.accepted?.control)||!Number.isSafeInteger(result.accepted?.state)||!Array.isArray(result.packets)||result.packets.length>33)throw new Error('Cloud connection returned an invalid response.');
   errors=0;
   while(outgoing.length&&JSON.parse(outgoing[0].data).seq<=result.accepted.control)outgoing.shift();
   if(state&&JSON.parse(state.data).seq<=result.accepted.state)state=null;
   for(const packet of result.packets){
    if(closed)return;
    if(!['control','state'].includes(packet?.lane)||typeof packet.data!=='string'||packetBytes(packet.data)>65536)throw new Error('Cloud connection returned an invalid packet.');
    channels[packet.lane].emit('message',{data:packet.data});
    if(packet.lane==='control')ack=Math.max(ack,JSON.parse(packet.data).seq);
   }
  }catch{
   if(closed)return;
   if(++errors>=3){channels.control.emit('error');return;}
  }
  if(!closed)timer=timers.setTimeout(pump,Math.max(0,250-Math.max(0,now()-startedAt)));
 }
 return {get connected(){return peer.connected;},get transport(){return 'relay';},start(){if(started||closed)return;started=true;for(const channel of Object.values(channels))channel.open();void pump();},receiveDescription(){return Promise.resolve(false);},receiveCandidates(){return Promise.resolve(false);},setMatchId:peer.setMatchId,send:peer.send,close(){peer.close();cleanup();}};
}
/** Direct play is preferred; an initial network failure switches both ready seats. */
export function createOnlineConnection({relayRequest,matchId=1,onStatus=()=>{},onDisconnect=()=>{},...options}){
 let active=null,transport='direct',closed=false,everConnected=false,generation=0,currentMatchId=Number.isSafeInteger(matchId)&&matchId>0?matchId:1;
 const events=revision=>({onStatus(value){if(closed||revision!==generation)return;if(value==='connected')everConnected=true;onStatus(value);},onDisconnect(reason){
  if(closed||revision!==generation)return;
  if(!everConnected&&transport==='direct'&&/^(Could not connect these networks\.|Connection lost\.)/.test(reason)){useRelay();return;}
  closed=true;onDisconnect(reason);
 }});
 function useRelay(){
  if(closed||everConnected||transport==='relay')return false;
  const revision=++generation;active?.close();transport='relay';onStatus('relaying');
  active=createOnlineRelay({...options,relayRequest,...events(revision)});active.setMatchId(currentMatchId);active.start();return true;
 }
 if(typeof options.RTCPeerConnection!=='function'&&!options.peer)useRelay();
 else {active=createOnlinePeer({...options,...events(generation)});active.setMatchId(currentMatchId);}
 return {get connected(){return active?.connected??false;},get transport(){return transport;},start(){return active?.start();},receiveDescription(value){return active?.receiveDescription(value)??Promise.resolve(false);},receiveCandidates(value){return active?.receiveCandidates(value)??Promise.resolve(false);},useRelay,setMatchId(value){if(Number.isSafeInteger(value)&&value>=currentMatchId){currentMatchId=value;active?.setMatchId(value);}},send(value){return active?.send(value)??false;},close(){if(closed)return;closed=true;++generation;active?.close();}};
}
