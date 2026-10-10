import {ONLINE_SCOPE,ONLINE_VERSION,MAX_PACKET_BYTES,packetBytes,validPayload} from './online-protocol.mjs';
export const DEFAULT_ICE_SERVERS=Object.freeze([{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},{urls:'stun:stun.cloudflare.com:3478'}]);
const CONTROL='clash-control',STATE='clash-state',BUFFER_LIMIT=262144;
/** Host authority; controls are ordered/reliable, snapshots are disposable. */
export function createOnlinePeer({role,room,peer,RTCPeerConnection=globalThis.RTCPeerConnection,timers=globalThis,now=()=>Date.now(),version=ONLINE_VERSION,iceServers=DEFAULT_ICE_SERVERS,sendSignal=()=>{},sendCandidates=()=>{},onPacket=()=>{},onStatus=()=>{},onDisconnect=()=>{}}){
 if(!['host','guest'].includes(role)||!/^[A-Z0-9]{6}$/.test(room))throw new Error('Invalid online seat.');
 const pc=peer??new RTCPeerConnection({iceServers});
 const channels={},cleanups=[],pendingDescriptions=new Map(),remoteCandidates=new Map(),localSeen=new Set();
 let closed=false,connected=false,helloSent=false,remoteHello=false,offered=false,matchId=1,lastIncoming=now(),disconnectTimer=null,connectTimer=null,candidateTimer=null,generation=1,remoteGeneration=0,signaled=0,retrying=false,guestWaited=false,candidateSending=false,candidateErrors=0,localCandidates=[],remoteQueue=Promise.resolve(),candidateDrain=Promise.resolve();
 const sent={control:0,state:0},received={control:0,state:0};
 const listen=(target,type,fn)=>{target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));};
 function close(reason){if(closed)return;closed=true;connected=false;for(const cleanup of cleanups.splice(0))cleanup();timers.clearTimeout(connectTimer);timers.clearTimeout(candidateTimer);timers.clearTimeout(disconnectTimer);localCandidates=[];remoteCandidates.clear();timers.clearInterval(heartbeat);for(const channel of Object.values(channels))try{channel.close();}catch{}try{pc.close();}catch{}if(reason){onStatus('disconnected');onDisconnect(reason);}}
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
  if(lane==='state'&&payload.type!==(role==='host'?'input':'snapshot'))return;
  if(payload.type==='hello'){
   if(lane!=='control'||payload.room!==room||payload.role===role){fail('The peer could not verify this session.');return;}
   received[lane]=packet.seq;lastIncoming=now();remoteHello=true;checkReady();return;
  }
  if(!connected)return;
  const transition=payload.type==='rematch'&&Number.isSafeInteger(payload.matchId)&&payload.matchId===matchId+1&&packet.matchId===payload.matchId&&role==='guest';
  if(packet.matchId!==matchId&&!transition)return;
  if(role==='host'&&(payload.wins!==undefined||['snapshot','events','start','setup'].includes(payload.type)))return;
  received[lane]=packet.seq;lastIncoming=now();
  if(payload.type==='ping'){wire({type:'pong'});return;}if(payload.type==='pong')return;
  onPacket(payload);
 }
 function bind(channel){
  const lane=channel.label===CONTROL?'control':channel.label===STATE?'state':null;
  if(!lane||channels[lane]||channel.ordered!==(lane==='control')||(lane==='state'&&channel.maxRetransmits!==0)){try{channel.close();}catch{}return;}
  channels[lane]=channel;listen(channel,'open',checkReady);listen(channel,'message',event=>message(event,lane));listen(channel,'close',()=>fail());listen(channel,'error',()=>fail());checkReady();
 }
 function armDeadline(ms=18000){timers.clearTimeout(connectTimer);connectTimer=timers.setTimeout(()=>{if(closed||connected)return;if(role==='host'&&retry())return;if(role==='guest'&&generation===1&&!guestWaited){guestWaited=true;onStatus('retrying');armDeadline();return;}fail('Could not connect these networks. Try a different network, or choose Solo / Two players.');},ms);}
 armDeadline(25000);
 const heartbeat=timers.setInterval(()=>{if(!connected||closed)return;if(now()-lastIncoming>12000){fail('The other player stopped responding. The match ended.');return;}wire({type:'ping'});},4000);
 listen(pc,'connectionstatechange',()=>{if(closed)return;if(pc.connectionState==='closed'){fail();return;}if(pc.connectionState==='failed'){connectionFailure();return;}if(pc.connectionState==='disconnected'){if(disconnectTimer===null)disconnectTimer=timers.setTimeout(connectionFailure,3000);}else{timers.clearTimeout(disconnectTimer);disconnectTimer=null;}});
 listen(pc,'datachannel',event=>{if(role==='guest')bind(event.channel);else try{event.channel.close();}catch{}});
 if(role==='host'){bind(pc.createDataChannel(CONTROL,{ordered:true}));bind(pc.createDataChannel(STATE,{ordered:false,maxRetransmits:0}));}
 function validCandidate(value){return value&&typeof value.candidate==='string'&&value.candidate.startsWith('candidate:')&&value.candidate.length<=2048&&!/[\r\n\0]/.test(value.candidate)&&(value.sdpMid===null||value.sdpMid===undefined||typeof value.sdpMid==='string'&&value.sdpMid.length<=32)&&(value.sdpMLineIndex===null||value.sdpMLineIndex===undefined||Number.isInteger(value.sdpMLineIndex)&&value.sdpMLineIndex>=0&&value.sdpMLineIndex<=16)&&(value.usernameFragment===null||value.usernameFragment===undefined||typeof value.usernameFragment==='string'&&value.usernameFragment.length<=256);}
 function normalizeCandidate(value){return {candidate:value.candidate,sdpMid:value.sdpMid??null,sdpMLineIndex:value.sdpMLineIndex??null,usernameFragment:value.usernameFragment??null};}
 function scheduleCandidates(){if(closed||candidateSending||candidateTimer!==null||signaled!==generation||!localCandidates.length||candidateErrors>2)return;candidateTimer=timers.setTimeout(flushCandidates,80);}
 async function flushCandidates(){
  candidateTimer=null;if(closed||candidateSending||signaled!==generation||!localCandidates.length)return;
  const turn=generation,batch=localCandidates.slice(0,16);candidateSending=true;
  try{await sendCandidates({generation:turn,candidates:batch});if(!closed&&turn===generation){localCandidates.splice(0,batch.length);candidateErrors=0;}}
  catch{if(turn===generation)candidateErrors++;}
  finally{candidateSending=false;scheduleCandidates();}
 }
 listen(pc,'icecandidate',event=>{
  if(closed||!event.candidate)return;const raw=typeof event.candidate.toJSON==='function'?event.candidate.toJSON():event.candidate;if(!validCandidate(raw))return;
  const candidate=normalizeCandidate(raw),fragment=pc.localDescription?.sdp?.match(/^a=ice-ufrag:(\S+)/m)?.[1];if(fragment&&candidate.usernameFragment&&fragment!==candidate.usernameFragment)return;
  const key=JSON.stringify(candidate);if(localSeen.has(key)||localSeen.size>=64)return;localSeen.add(key);localCandidates.push(candidate);scheduleCandidates();
 });
 function drainCandidates(){
  candidateDrain=candidateDrain.then(async()=>{if(closed||remoteGeneration!==generation||typeof pc.addIceCandidate!=='function')return;const turn=generation;
   for(const item of remoteCandidates.get(turn)?.values()??[]){if(closed||turn!==generation)return;if(item.applied)continue;item.applied=true;try{await pc.addIceCandidate(item.candidate);}catch{}}
  });return candidateDrain;
 }
 function nextGeneration(next){generation=next;signaled=0;remoteGeneration=0;localCandidates=[];localSeen.clear();candidateErrors=0;timers.clearTimeout(candidateTimer);candidateTimer=null;for(const turn of remoteCandidates.keys())if(turn<generation)remoteCandidates.delete(turn);}
 async function publish(description,turn=generation){
  await pc.setLocalDescription(description);if(closed||turn!==generation)return;const local=pc.localDescription;if(!local||typeof local.sdp!=='string'||local.sdp.length>65536)throw new Error('The connection signal is unavailable.');
  await sendSignal({type:local.type,sdp:local.sdp,generation:turn});if(closed||turn!==generation)return;signaled=turn;scheduleCandidates();armDeadline();
 }
 async function offer(restart=false){
  const turn=generation;retrying=true;armDeadline();
  try{await publish(await pc.createOffer(restart?{iceRestart:true}:undefined),turn);}
  catch(error){if(!closed&&turn===generation)fail(error.message??'Could not prepare the connection.');}
  finally{if(turn===generation)retrying=false;}
 }
 function retry(){if(closed||connected||role!=='host'||!offered||retrying||generation>=2)return false;nextGeneration(generation+1);onStatus('retrying');void offer(true);return true;}
 function connectionFailure(){if(closed)return;if(connected){fail();return;}if(role==='host'){if(retrying||retry())return;fail();}else{onStatus('retrying');}}
 return {get connected(){return connected;},get generation(){return generation;},async start(){if(closed||role!=='host'||offered)return;offered=true;onStatus('connecting');await offer();},receiveCandidates(value){
  const turn=value?.generation??1;if(closed||!Number.isInteger(turn)||turn<generation||turn>2||(role==='host'&&turn!==generation)||!Array.isArray(value?.candidates)||value.candidates.length>64)return Promise.resolve(false);
  if(!remoteCandidates.has(turn))remoteCandidates.set(turn,new Map());const pending=remoteCandidates.get(turn);
  for(const raw of value.candidates){if(!validCandidate(raw))continue;const candidate=normalizeCandidate(raw),key=JSON.stringify(candidate);if(!pending.has(key)&&pending.size<64)pending.set(key,{candidate,applied:false});}
  return drainCandidates().then(()=>true);
 },receiveDescription(description){
  const turn=description?.generation??1;
  if(closed||!description||description.type!==(role==='host'?'answer':'offer')||typeof description.sdp!=='string'||!description.sdp.startsWith('v=0')||description.sdp.length>65536||!Number.isInteger(turn)||turn<generation||turn>2||(role==='host'&&turn!==generation))return Promise.resolve(false);
  const key=turn+description.type+description.sdp;if(pendingDescriptions.has(key))return pendingDescriptions.get(key);
  if(pendingDescriptions.size>=2){fail('The session connection changed. Please create another.');return Promise.resolve(false);}
  const operation=remoteQueue.then(async()=>{try{if(closed||turn<generation)return false;if(role==='guest'&&turn>generation)nextGeneration(turn);await pc.setRemoteDescription({type:description.type,sdp:description.sdp});if(closed||turn!==generation)return false;remoteGeneration=turn;await drainCandidates();if(role==='guest'){onStatus(turn>1?'retrying':'connecting');await publish(await pc.createAnswer(),turn);}return !closed;}catch(error){if(!closed)fail(error.message??'Could not connect to the other player.');return false;}});
  remoteQueue=operation;pendingDescriptions.set(key,operation);return operation;
 },setMatchId(value){if(Number.isSafeInteger(value)&&value>=matchId)matchId=value;},send(payload){if(!connected||closed||!validPayload(payload)||(role==='host'&&payload.type==='input')||(role==='guest'&&(payload.wins!==undefined||['snapshot','events','start','setup'].includes(payload.type))))return false;return wire(payload,['snapshot','input'].includes(payload.type)?'state':'control');},close(){close();}};
}
