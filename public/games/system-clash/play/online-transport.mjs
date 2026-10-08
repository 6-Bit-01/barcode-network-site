import {ONLINE_SCOPE,ONLINE_VERSION,MAX_PACKET_BYTES,packetBytes,validPayload} from './online-protocol.mjs';
const CONTROL='clash-control',STATE='clash-state',BUFFER_LIMIT=262144;
/** Host authority; controls are ordered/reliable, snapshots are disposable. */
export function createOnlinePeer({role,room,peer,RTCPeerConnection=globalThis.RTCPeerConnection,timers=globalThis,now=()=>Date.now(),version=ONLINE_VERSION,sendSignal=()=>{},onPacket=()=>{},onStatus=()=>{},onDisconnect=()=>{}}){
 if(!['host','guest'].includes(role)||!/^[A-Z0-9]{6}$/.test(room))throw new Error('Invalid online seat.');
 const pc=peer??new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
 const channels={},cleanups=[],pendingDescriptions=new Map();
 let closed=false,connected=false,helloSent=false,remoteHello=false,offered=false,matchId=1,lastIncoming=now(),disconnectTimer=null;
 const sent={control:0,state:0},received={control:0,state:0};
 const listen=(target,type,fn)=>{target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));};
 function close(reason){if(closed)return;closed=true;connected=false;for(const cleanup of cleanups.splice(0))cleanup();timers.clearTimeout(connectTimer);timers.clearTimeout(disconnectTimer);timers.clearInterval(heartbeat);for(const channel of Object.values(channels))try{channel.close();}catch{}try{pc.close();}catch{}if(reason){onStatus('disconnected');onDisconnect(reason);}}
 function fail(reason='Connection lost. Try a different network, or choose Solo / Two players.'){close(reason);}
 function wire(payload,lane='control'){
  if(closed||!validPayload(payload))return false;
  const channel=channels[lane];if(channel?.readyState!=='open')return false;
  if(channel.bufferedAmount>BUFFER_LIMIT){if(lane==='control')fail('Connection overloaded. The match ended; create or join another session.');return false;}
  const data=JSON.stringify({scope:ONLINE_SCOPE,version,seq:sent[lane]+1,matchId,payload});
  if(packetBytes(data)>MAX_PACKET_BYTES)return false;
  try{channel.send(data);sent[lane]++;return true;}catch{fail();return false;}
 }
 function checkReady(){if(closed)return;if(channels.control?.readyState==='open'&&channels.state?.readyState==='open'&&!helloSent){helloSent=true;wire({type:'hello',version,room,role});}if(helloSent&&remoteHello&&!connected){connected=true;lastIncoming=now();timers.clearTimeout(connectTimer);onStatus('connected');}}
 function message(event,lane){
  if(closed||typeof event.data!=='string'||packetBytes(event.data)>MAX_PACKET_BYTES)return;
  let packet;try{packet=JSON.parse(event.data);}catch{return;}
  if(packet?.scope!==ONLINE_SCOPE||!Number.isSafeInteger(packet.seq)||packet.seq<=received[lane]||!validPayload(packet.payload))return;
  const payload=packet.payload;
  if(packet.version!==version||(payload.type==='hello'&&payload.version!==version)){fail('Game versions differ. Both players should refresh the game and create a new session.');return;}
  if(lane==='state'&&payload.type!=='snapshot')return;
  if(payload.type==='hello'){
   if(lane!=='control'||payload.room!==room||payload.role===role){fail('The peer could not verify this session.');return;}
   received[lane]=packet.seq;lastIncoming=now();remoteHello=true;checkReady();return;
  }
  if(!connected)return;
  const transition=payload.type==='rematch'&&Number.isSafeInteger(payload.matchId)&&payload.matchId===matchId+1&&packet.matchId===payload.matchId&&role==='guest';
  if(packet.matchId!==matchId&&!transition)return;
  if(role==='host'&&['snapshot','events','start','setup'].includes(payload.type))return;
  received[lane]=packet.seq;lastIncoming=now();
  if(payload.type==='ping'){wire({type:'pong'});return;}if(payload.type==='pong')return;
  onPacket(payload);
 }
 function bind(channel){
  const lane=channel.label===CONTROL?'control':channel.label===STATE?'state':null;
  if(!lane||channels[lane]||channel.ordered!==(lane==='control')||(lane==='state'&&channel.maxRetransmits!==0)){try{channel.close();}catch{}return;}
  channels[lane]=channel;listen(channel,'open',checkReady);listen(channel,'message',event=>message(event,lane));listen(channel,'close',()=>fail());listen(channel,'error',()=>fail());checkReady();
 }
 const connectTimer=timers.setTimeout(()=>fail('Could not connect these networks. Try a different network, or choose Solo / Two players.'),25000);
 const heartbeat=timers.setInterval(()=>{if(!connected||closed)return;if(now()-lastIncoming>12000){fail('The other player stopped responding. The match ended.');return;}wire({type:'ping'});},4000);
 listen(pc,'connectionstatechange',()=>{if(closed)return;if(['failed','closed'].includes(pc.connectionState)){fail();return;}if(pc.connectionState==='disconnected'){if(disconnectTimer===null)disconnectTimer=timers.setTimeout(()=>fail(),3000);}else{timers.clearTimeout(disconnectTimer);disconnectTimer=null;}});
 listen(pc,'datachannel',event=>{if(role==='guest')bind(event.channel);else try{event.channel.close();}catch{}});
 if(role==='host'){bind(pc.createDataChannel(CONTROL,{ordered:true}));bind(pc.createDataChannel(STATE,{ordered:false,maxRetransmits:0}));}
 async function gather(){if(pc.iceGatheringState==='complete')return;await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;timers.clearTimeout(id);pc.removeEventListener('icegatheringstatechange',change);resolve();};const change=()=>{if(pc.iceGatheringState==='complete')finish();};const id=timers.setTimeout(finish,8000);pc.addEventListener('icegatheringstatechange',change);change();});}
 async function publish(description){await pc.setLocalDescription(description);await gather();if(closed)return;const local=pc.localDescription;if(!local||typeof local.sdp!=='string'||local.sdp.length>65536)throw new Error('The connection signal is unavailable.');await sendSignal({type:local.type,sdp:local.sdp});}
 return {get connected(){return connected;},async start(){if(closed||role!=='host'||offered)return;offered=true;onStatus('connecting');try{await publish(await pc.createOffer());}catch(error){fail(error.message??'Could not prepare the connection.');}},receiveDescription(description){
  if(closed||!description||description.type!==(role==='host'?'answer':'offer')||typeof description.sdp!=='string'||!description.sdp.startsWith('v=0')||description.sdp.length>65536)return Promise.resolve(false);
  const key=description.type+description.sdp;if(pendingDescriptions.has(key))return pendingDescriptions.get(key);
  if(pendingDescriptions.size>=2){fail('The session connection changed. Please create another.');return Promise.resolve(false);}
  const operation=(async()=>{try{await pc.setRemoteDescription(description);if(role==='guest'){onStatus('connecting');await publish(await pc.createAnswer());}return !closed;}catch(error){fail(error.message??'Could not connect to the other player.');return false;}})();pendingDescriptions.set(key,operation);return operation;
 },setMatchId(value){if(Number.isSafeInteger(value)&&value>=matchId)matchId=value;},send(payload){if(!connected||closed||!validPayload(payload)||(role==='guest'&&['snapshot','events','start','setup'].includes(payload.type)))return false;return wire(payload,payload.type==='snapshot'?'state':'control');},close(){close();}};
}
