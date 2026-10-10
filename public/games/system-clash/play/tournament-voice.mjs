/** Independent tournament voice. No combat transport, game clock, or controls are owned here. */
const DEFAULT_ENDPOINT='/api/games/system-clash/tournaments/voice';
const stopTracks=stream=>{for(const track of stream?.getTracks?.()??[])try{track.stop();}catch{}};
const disconnect=node=>{try{node?.disconnect();}catch{}};
function identity(event){
 const bout=event?.bouts?.find(b=>b.id===event.currentBoutId)??event?.currentBout;
 const active=event?.status==='running'&&bout?.status==='live'&&bout.roomCode&&bout.roomMatchId;
 const own=event?.entrants?.find(e=>e.id===event.selfEntrantId);
 return {code:event?.code??'',bout:active?bout:null,own,canPublish:!!(active&&own&&[bout.p1,bout.p2].includes(own.id)),key:[event?.code??'',active?bout.id:'',active?bout.roomCode:'',active?bout.roomMatchId:''].join(':')};
}
function filterMicrophone(context,stream,fighter){
 const seed=[...(fighter??'')].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0),source=context.createMediaStreamSource(stream),high=context.createBiquadFilter(),low=context.createBiquadFilter(),shape=context.createWaveShaper(),compressor=context.createDynamicsCompressor(),gain=context.createGain(),destination=context.createMediaStreamDestination(),analyser=context.createAnalyser();
 high.type='highpass';high.frequency.value=100+seed%80;low.type='lowpass';low.frequency.value=3500+seed%1400;low.Q.value=.65;
 const curve=new Float32Array(4096);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.round(Math.tanh(x*1.12)*512)/512;}shape.curve=curve;shape.oversample='2x';
 compressor.threshold.value=-18;compressor.knee.value=12;compressor.ratio.value=3;compressor.attack.value=.004;compressor.release.value=.08;gain.gain.value=.82;analyser.fftSize=256;
 source.connect(high);high.connect(low);low.connect(shape);shape.connect(compressor);compressor.connect(gain);gain.connect(destination);gain.connect(analyser);
 return {stream:destination.stream,analyser,dispose(){stopTracks(destination.stream);for(const node of [source,high,low,shape,compressor,gain,destination,analyser])disconnect(node);}};
}
function waitFor(pc,kind,win,timeout){
 const ready=()=>kind==='ice'?pc.iceGatheringState==='complete':pc.connectionState==='connected';
 if(ready())return Promise.resolve();
 return new Promise((resolve,reject)=>{const event=kind==='ice'?'icegatheringstatechange':'connectionstatechange';let timer;
  const finish=error=>{win.clearTimeout(timer);pc.removeEventListener(event,check);error?reject(error):resolve();};
  const check=()=>{if(ready())finish();else if(['failed','closed'].includes(pc.connectionState))finish(new Error('Voice connection ended.'));};
  pc.addEventListener(event,check);timer=win.setTimeout(()=>finish(new Error('Voice connection timed out.')),timeout);check();
 });
}
export function createTournamentVoice({endpoint=DEFAULT_ENDPOINT,fetch:fetcher=globalThis.fetch,window:win=globalThis.window,onState=()=>{},onLevels=()=>{}}={}){
 let current=identity(null),revision=0,micRevision=0,disposed=false,publisher=null,subscriber=null,context=null,volume=.75,muted=true,available=false,canPublish=false,error='',receiving=false,busy=false,enabling=false,lastRefresh=-Infinity,lastHeartbeat=0,signature='',ice=null;
 let pollTimer=null,levelTimer=null;const meters=new Map(),audioElements=new Set();
 const emit=()=>{try{onState({available,enabled:!!publisher?.handle,muted,canPublish,receiving,error,connecting:enabling});}catch{}};
 async function call(action,input={},code=current.code,keepalive=false){
  const response=await fetcher(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code,...input}),...(keepalive?{keepalive:true}:{signal:AbortSignal.timeout(12000)})});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'Fighter voice is unavailable.');return value;
 }
 function report(value){error=value;emit();}
 function release(handle,code){return handle?call('close',{handle},code,true).catch(()=>{}):Promise.resolve();}
 function stopPublisher(){
  ++micRevision;const old=publisher;publisher=null;muted=true;enabling=false;meters.delete('local');if(old){stopTracks(old.stream);old.graph?.dispose();try{old.pc?.close();}catch{}}emit();return release(old?.handle,old?.code);
 }
 function stopSubscriber(){
  const old=subscriber;subscriber=null;receiving=false;signature='';for(const el of audioElements){try{el.pause();stopTracks(el.srcObject);el.srcObject=null;el.remove();}catch{}}audioElements.clear();
  for(const [key,meter]of meters)if(key!=='local'){disconnect(meter.source);disconnect(meter.analyser);meters.delete(key);}
  try{old?.pc?.close();}catch{}emit();return release(old?.handle,old?.code);
 }
 function ensureContext(){
  if(!context){const Constructor=win.AudioContext||win.webkitAudioContext;if(!Constructor)throw new Error('Voice audio is unsupported in this browser.');context=new Constructor({latencyHint:'interactive'});startLevels();}
  return context;
 }
 function startLevels(){
  if(levelTimer!==null)return;levelTimer=win.setInterval(()=>{if(disposed)return;const levels=[];for(const meter of meters.values()){const data=new Uint8Array(meter.analyser.fftSize);meter.analyser.getByteTimeDomainData(data);let sum=0;for(const v of data)sum+=((v-128)/128)**2;levels.push({entrantId:meter.entrantId,fighter:meter.fighter,level:Math.min(1,Math.sqrt(sum/data.length)*3)});}try{onLevels(levels);}catch{}},100);
 }
 function meterRemote(id,stream,fighter){
  if(!context||meters.has(id))return;const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=256;source.connect(analyser);meters.set(id,{source,analyser,entrantId:id,fighter});
 }
 async function enableAudio(){
  if(disposed)return false;
  try{await ensureContext().resume();for(const el of audioElements){meterRemote(el.dataset.entrantId,el.srcObject,el.dataset.fighter);await el.play();}error='';emit();return true;}catch{report('Tap voice playback to allow audio in this browser.');return false;}
 }
 async function peer(){
  if(typeof win.RTCPeerConnection!=='function')throw new Error('Voice connections are unsupported in this browser.');
  if(!ice){const result=await call('ice');ice=Array.isArray(result.iceServers)?result.iceServers:[];}
  const pc=new win.RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'},...ice],bundlePolicy:'max-bundle'});
  pc.addEventListener('connectionstatechange',()=>{if(disposed||!['failed','disconnected'].includes(pc.connectionState))return;if(publisher?.pc===pc){void stopPublisher();report('Microphone connection ended. Enable it again to retry.');}if(subscriber?.pc===pc){void stopSubscriber();report('Voice playback connection ended.');}});
  return pc;
 }
 async function subscribe(speakers,turn){
  const wanted=speakers.filter(s=>s.entrantId!==current.own?.id),next=wanted.map(s=>s.id).sort().join(':');if(next===signature)return;
  await stopSubscriber();if(disposed||turn!==revision||!wanted.length)return;
  const code=current.code,pc=await peer();if(disposed||turn!==revision){pc.close();return;}
  const entry={pc,handle:null,code};subscriber=entry;
  try{
   const result=await call('subscribe',{},code);entry.handle=result.handle;
   if(disposed||turn!==revision||subscriber!==entry){pc.close();await release(result.handle,code);return;}
   if(!result.handle){await stopSubscriber();return;}
   const mapping=new Map(result.tracks.map(t=>[t.mid,t]));
   pc.addEventListener('track',event=>{if(disposed||subscriber!==entry)return;const info=mapping.get(event.transceiver.mid);if(!info)return;const stream=new win.MediaStream([event.track]),el=win.document.createElement('audio');el.autoplay=true;el.hidden=true;el.volume=volume;el.srcObject=stream;win.document.body?.append(el);el.dataset.entrantId=info.entrantId;el.dataset.fighter=info.fighter;audioElements.add(el);meterRemote(info.entrantId,stream,info.fighter);receiving=true;void el.play().catch(()=>report('Tap voice playback to allow audio in this browser.'));emit();});
   await pc.setRemoteDescription(result.sessionDescription);await pc.setLocalDescription(await pc.createAnswer());await waitFor(pc,'ice',win,8000);
   if(disposed||turn!==revision||subscriber!==entry){await release(result.handle,code);return;}
   await call('answer',{handle:result.handle,answer:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}},code);
   if(disposed||turn!==revision||subscriber!==entry){await release(result.handle,code);return;}signature=next;error='';emit();
  }catch(e){if(subscriber===entry)await stopSubscriber();throw e;}
 }
 async function refresh(force=false){
  if(disposed||!current.code||busy||!force&&Date.now()-lastRefresh<5000)return;
  busy=true;lastRefresh=Date.now();const turn=revision,code=current.code;
  try{
   const state=await call('status',{},code);if(disposed||turn!==revision)return;available=state.available===true;canPublish=available&&current.canPublish&&state.canPublish===true;
   if(!available||!state.active||!current.bout||state.boutId!==current.bout.id){await stopPublisher();await stopSubscriber();emit();return;}
   if(publisher&&(!canPublish||Date.now()-lastHeartbeat>=10000)){if(!canPublish)await stopPublisher();else{await call('heartbeat',{handle:publisher.handle},code);lastHeartbeat=Date.now();}}
   if(disposed||turn!==revision)return;await subscribe(state.speakers??[],turn);emit();
  }catch(e){if(!disposed&&turn===revision){await stopPublisher();await stopSubscriber();report(e.message||'Fighter voice is unavailable.');}}finally{busy=false;}
 }
 async function sync(snapshot){
  if(disposed)return;const next=identity(snapshot),changed=next.key!==current.key||next.own?.id!==current.own?.id;current=next;
  if(changed){++revision;ice=null;available=false;canPublish=false;error='';lastRefresh=-Infinity;void stopPublisher();void stopSubscriber();}
  if(!current.canPublish&&publisher)void stopPublisher();emit();await refresh(changed);
 }
 async function enableMic(){
  if(disposed||enabling||!available||!canPublish||!current.canPublish||!win.navigator?.mediaDevices?.getUserMedia)return false;
  if(publisher?.handle)return true;const turn=revision,micTurn=++micRevision,code=current.code,fighter=current.own.fighter;enabling=true;muted=false;error='';emit();
  let entry=null,stream=null,graph=null;
  const valid=()=>!disposed&&turn===revision&&micTurn===micRevision&&!muted;
  try{
   if(!await enableAudio()||!valid())return false;
   stream=await win.navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(!valid()){stopTracks(stream);return false;}
   graph=filterMicrophone(ensureContext(),stream,fighter);const pc=await peer();if(!valid()){stopTracks(stream);graph.dispose();pc.close();return false;}
   entry={pc,stream,graph,handle:null,code};publisher=entry;meters.set('local',{analyser:graph.analyser,entrantId:current.own.id,fighter});
   for(const track of stream.getTracks())track.addEventListener?.('ended',()=>{if(publisher===entry){void stopPublisher();report('Microphone stopped. Enable it again to retry.');}});
   const transceiver=pc.addTransceiver(graph.stream.getAudioTracks()[0],{direction:'sendonly'});try{const params=transceiver.sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];params.encodings[0].maxBitrate=24000;await transceiver.sender.setParameters(params);}catch{}
   await pc.setLocalDescription(await pc.createOffer());await waitFor(pc,'ice',win,8000);if(!valid())return false;
   const result=await call('publish',{offer:{type:pc.localDescription.type,sdp:pc.localDescription.sdp},mid:transceiver.mid},code);entry.handle=result.handle;
   if(!valid()||publisher!==entry){await release(result.handle,code);return false;}
   await pc.setRemoteDescription(result.sessionDescription);await waitFor(pc,'connected',win,12000);if(!valid())return false;
   await call('ready',{handle:result.handle},code);if(!valid()){await release(result.handle,code);return false;}lastHeartbeat=Date.now();enabling=false;emit();return true;
  }catch(e){if(valid())report(e.name==='NotAllowedError'?'Microphone access was not granted.':e.message||'Microphone could not connect.');return false;}
  finally{if(!valid()||enabling){if(entry&&publisher===entry)await stopPublisher();else{stopTracks(stream);graph?.dispose();try{entry?.pc.close();}catch{}await release(entry?.handle,code);}if(micTurn===micRevision){enabling=false;emit();}}}
 }
 const pagehide=()=>dispose();
 function dispose(){if(disposed)return;disposed=true;++revision;void stopPublisher();void stopSubscriber();win.clearInterval(pollTimer);win.clearInterval(levelTimer);pollTimer=null;levelTimer=null;win.removeEventListener('pagehide',pagehide);try{void context?.close().catch(()=>{});}catch{}context=null;meters.clear();}
 pollTimer=win.setInterval(()=>{void refresh();},5000);win.addEventListener('pagehide',pagehide);
 return{sync,enableMic,enableAudio,mute(value=true){return value?stopPublisher():enableMic();},setVolume(value){volume=Math.min(1,Math.max(0,Number(value)||0));for(const el of audioElements)el.volume=volume;},dispose};
}
