/** Layered arcade contact Foley and original synthetic effort voices.
 * Character voices are procedural phonation, not recordings or cloned identities.
 * Only the generic "DELETE HIM" announcer is an offline SAPI-generated PCM sample.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f)=>Number.isFinite(v)?v:f;
export const ARCADE_ANNOUNCER_PATH='assets/audio/delete-him-arcade.wav';
export const FIGHT_AUDIO_PROFILES=Object.freeze(Object.fromEntries(Object.entries({
  '6-bit':{pitch:119,formants:[760,1280,2540],rasp:.22,breath:.14,weight:1,accent:165,voice:'scrappy gravel'},
  '9-bit':{pitch: 72,formants:[570,980,2220],rasp:.44,breath:.08,weight:1.42,accent: 84,voice:'deep dark growl'},
  'cache-back':{pitch:188,formants:[640,1720,3100],rasp:.05,breath:.03,weight:.85,accent:780,robot:true,voice:'gated synthetic servo'},
  'mac-modem':{pitch:91,formants:[670,1130,2340],rasp:.34,breath:.18,weight:1.3,accent:112,voice:'rough chest grunt'},
  'dj-floppydisc':{pitch:157,formants:[830,1460,2870],rasp:.12,breath:.12,weight:.87,accent:440,voice:'bright clipped effort'},
  'cliff':{pitch:134,formants:[580,1610,2510],rasp:.19,breath:.1,weight:.94,accent:230,voice:'dry nasal bark'},
  'mr-nice-guy':{pitch:173,formants:[890,1590,3010],rasp:.06,breath:.24,weight:.92,accent:520,voice:'clear airy effort'},
  'ms-mayhem':{pitch:214,formants:[790,1360,2710],rasp:.4,breath:.1,weight:1.22,accent:185,voice:'sharp gravel roar'},
  'stolz':{pitch:83,formants:[490,1040,1980],rasp:.32,breath:.03,weight:1.38,accent:310,steel:true,voice:'heavy steel resonance'},
  'kaveman-brown':{pitch:104,formants:[690,1110,2240],rasp:.28,breath:.09,weight:1.25,accent: 64,voice:'low bass chest effort'},
  'dr3wbaby':{pitch:145,formants:[820,1830,2760],rasp:.27,breath:.16,weight:.97,accent:350,voice:'rhythmic rough shout'},
  'ash-flowers':{pitch:182,formants:[930,1490,2920],rasp:.1,breath:.3,weight:.96,accent:620,voice:'warm breathy effort'},
  'wittyf0x':{pitch:318,formants:[1180,2380,3740],rasp:.25,breath:.1,weight:.7,accent:1280,fox:true,voice:'fox bark yip and howl'},
}).map(([id,profile])=>[id,Object.freeze({...profile,formants:Object.freeze(profile.formants)})])));

const fallback=FIGHT_AUDIO_PROFILES['6-bit'];
const profile=id=>FIGHT_AUDIO_PROFILES[id]??fallback;
const layer=(kind,frequency,end,duration,gain,delay=0,extra={})=>({kind,frequency,end,duration,gain,delay,...extra});
const tone=(frequency,end,duration,gain,delay=0,waveform='sine')=>layer('tone',frequency,end,duration,gain,delay,{waveform});
const noise=(frequency,duration,gain,delay=0,filter='bandpass',q=.7)=>layer('noise',frequency,frequency,duration,gain,delay,{filter,q});

function mechanism(event){
  const cue=event.cue??'';
  if(/disc|blade|cable|tape/.test(cue)||event.damageKind==='cut')return 'cut';
  if(/stamp|crush|pressure|chrome|jaws|speaker-burial/.test(cue))return 'crush';
  if(/nail|arrow|spike/.test(cue)||event.type==='weapon-embed')return 'puncture';
  if(/peace|heart|blue|signal|pulse/.test(cue)||event.damageKind==='scorch')return 'energy';
  if(/slam|stomp|truss|sign-strike|topple/.test(cue))return 'slam';
  return 'blunt';
}

/** Pure deterministic routing; useful to review without a browser audio device. */
export function planFightSound(event={}){
  const type=event.type??'',strength=clamp(finite(event.strength,1),.25,3.4);
  const attackerId=event.attackerId??event.fighterId,victimId=event.victimId??event.targetId;
  const attacker=profile(attackerId),victim=profile(victimId),layers=[],voices=[];
  const add=(...items)=>layers.push(...items);
  const voice=(id,mode,delay=0)=>{if(id&&FIGHT_AUDIO_PROFILES[id])voices.push({id,mode,delay});};
  const heavy=type==='deletion-impact'||strength>=1.65||finite(event.damage,0)>=18;
  const material=event.victimMaterial==='metal'||victim.robot||victim.steel?'metal':'organic';
  const contact=mechanism(event);
  let priority=1,announcer=false;
  if(type==='finish-prompt'){announcer=true;priority=4;}
  else if(type==='attack'||type==='special'){
    voice(attackerId,'attack');priority=1;
    add(noise(attacker.fox?3400:2200,.085,.12,0,'highpass'),tone(attacker.accent*1.2,attacker.accent*.55,.09,.08,0,'triangle'));
  } else if(type==='hit'||type==='deletion-impact'||type==='weapon-embed'){
    priority=heavy?3:2;
    const kick=/kick|uppercut/.test(event.action??'');
    const weight=clamp(strength*attacker.weight,.55,2.8);
    add(tone((kick?95:142)/Math.sqrt(attacker.weight),22,heavy?.29:.16,.42));
    // A short hard transient, irregular dry fractures, and a separate wet body
    // contact make heavy blows read as bone and flesh rather than a long buzz.
    if(material==='organic'){
      add(noise(kick?1350:2150,.027,.3,0,'bandpass',1.2),noise(heavy?610:920,heavy?.2:.095,.3,.008,'lowpass'));
      add(noise(880,heavy?.12:.047,heavy?.38:.19,.016,'bandpass',2.2));
      for(let i=0;i<(heavy?4:2);i++)add(tone(330+137*i,70+31*i,.022+i*.003,(heavy?.1:.055)/(1+i*.25),.018+i*.019,'triangle'));
      if(heavy)add(noise(430,.25,.23,.065,'lowpass'),noise(2800,.042,.19,.043,'highpass'));
    } else {
      add(noise(3400,.043,.31,0,'highpass'));
      for(const [i,f] of [417,731,1267].entries())add(tone(f*(victim.robot?1.18:1),f*.91,heavy?.36:.19,.17/(i+1),.008*i,'triangle'));
      add(noise(victim.robot?4400:1800,heavy?.2:.085,.2,.035,'bandpass',2));
    }
    if(contact==='cut')add(noise(4700,heavy?.25:.095,.3,.014,'highpass'),tone(920,140,.19,.13,0,'sawtooth'));
    if(contact==='crush')add(tone(61,17,.47,.24,.035,'triangle'),noise(380,.42,.24,.07,'lowpass'),noise(1320,.11,.21,.12));
    if(contact==='puncture')add(tone(1480,180,.12,.14,0,'triangle'),noise(2800,.06,.23,.012,'bandpass',3));
    if(contact==='energy')add(tone(1000,80,.3,.25,0,'sawtooth'),tone(1470,220,.19,.12,.06,'square'),noise(4300,.19,.21,.015,'highpass'));
    if(contact==='slam')add(tone(55,20,.38,.25,.03),noise(290,.27,.25,.016,'lowpass'));
    // Contact intensity governs vocal effort; repeats are rate limited at play.
    voice(victimId,type==='deletion-impact'?'scream':heavy?'big-hurt':'hurt',.025);
    if(type==='hit'&&!heavy&&finite(event.combo,1)>1)voice(attackerId,'attack',.035);
    if(weight>1.5)for(const item of layers)item.gain*=1.08;
  } else if(type==='block'){
    add(tone(420+attacker.accent*.18,190,.1,.2,0,'triangle'),noise(3900,.055,.3,0,'highpass'));
    if(victim.robot||victim.steel)add(tone(970,690,.2,.12,.012,'triangle'));
  } else if(type==='miss'){add(noise(2600,.14,.21,0,'highpass'));}
  else if(type==='throw'){priority=2;add(noise(1200,.19,.27,0,'lowpass'),tone(125, 42,.18,.2));voice(victimId,'big-hurt',.08);}
  else if(type==='land'||type==='ko'){
    priority=type==='ko'?3:1;
    add(tone(event.jump?90: 64,22,event.jump?.12:.28,event.jump?.13:.36),noise(500,event.jump?.07:.15,event.jump?.1:.26,0,'lowpass'));
    if(type==='ko'&&!event.timeout)voice(victimId,'big-hurt');
    else if(!event.jump&&strength>1.2)voice(victimId,'hurt');
  } else if(type==='deletion'){
    if(event.cue!=='complete'){priority=2;add(tone(148,44,.32,.17,0,'sawtooth'));voice(attackerId,'attack');}
    else add(tone(180,90,.16,.12,0,'triangle'));
  } else if(type==='deletion-cue'){
    const cue=event.cue??'';
    priority=2;
    if(/bind|tether|tape|snare|drag/.test(cue))add(noise(2100,.18,.15,0,'highpass'),tone(680,190,.12,.1,0,'triangle'));
    else if(/disc-release|arrow-release|rig-release/.test(cue))add(noise(4800,.22,.22,0,'highpass'),tone(780, 84,.2,.1,0,'triangle'));
    else if(/blue|peace|love|heart/.test(cue))add(tone(attacker.accent,attacker.accent*1.9,.42,.17,0,'triangle'),tone(attacker.accent*1.51,attacker.accent*2.3,.3,.1,.03));
    else if(/seal|lid-close|latch|entry|load|captured/.test(cue))add(tone(130, 42,.15,.19,0,'square'),noise(1350,.11,.2),tone(630,410,.16,.09,.02,'triangle'));
    else if(/spin|channel|charge|hoist|lift|raise/.test(cue))add(tone(95,320,.34,.16,0,'sawtooth'),noise(1400,.3,.1));
    else if(/drop|break|topple|gut|boot|sweep/.test(cue))add(tone(170, 32,.15,.2),noise(1650,.11,.18));
    else if(/eject|reopen|reveal|verdict|present|erased|signal/.test(cue))add(tone(attacker.accent,attacker.accent*.55,.19,.13,0,'triangle'),noise(2300,.09,.1));
    else add(noise(1400,.11,.13),tone(attacker.accent,attacker.accent*.6,.1,.07,0,'triangle'));
  } else if(type==='weapon-pickup')add(tone(420,840,.1,.16,0,'triangle'),tone(630,1050,.16,.12,.07,'triangle'));
  else if(type==='weapon-use'){
    if(event.weaponType==='pulse-driver')add(tone(1240,75,.2,.3,0,'sawtooth'),noise(5200,.11,.21,0,'highpass'));
    else add(noise(2850,.12,.21,0,'highpass'),tone(245, 72,.1,.14,0,'triangle'));
    voice(attackerId,'attack');
  } else if(type==='weapon-throw')add(noise(3300,.22,.24,0,'highpass'));
  else if(type==='weapon-empty')add(tone(210, 96,.045,.13,0,'square'));
  else if(type==='glass-break'||type==='glass-impact'){
    priority=2;add(noise(6100,type==='glass-break'?.44:.12,.31,0,'highpass'));
    for(let i=0;i<4;i++)add(tone(1700+i*511,470+i*113,.17+i*.035,.13/(i+1),i*.024,'triangle'));
  } else if(type==='eye-pop')add(noise(920,.07,.25,0,'lowpass'),tone(620, 72,.14,.2,0,'triangle'));
  else if(type==='round-start')add(tone(180,180,.1,.17,0,'square'),tone(270,270,.14,.17,.14,'square'));
  // Bound the complete layer sum. A compressor and final soft limiter also
  // protect combined events, but no individual impact relies on hard clipping.
  const sum=layers.reduce((v,item)=>v+item.gain,0);
  const scale=Math.min(1,.95/Math.max(.01,sum));
  for(const item of layers)item.gain*=scale;
  return {type,attackerId,victimId,material,contact,heavy,priority,announcer,layers,voices};
}


function seededRandom(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};}
function hash(text){let out=2166136261;for(const char of text)out=Math.imul(out^char.charCodeAt(0),16777619);return out>>>0;}
function bandpass(frequency,q,rate){
  const omega=2*Math.PI*clamp(frequency,30,rate*.44)/rate,alpha=Math.sin(omega)/(2*q),a0=1+alpha;
  const b0=alpha/a0,b2=-b0,a1=-2*Math.cos(omega)/a0,a2=(1-alpha)/a0;
  let x1=0,x2=0,y1=0,y2=0;
  return x=>{const y=b0*x+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;};
}
/** Deterministic vowel-like grunts: breath onset, voiced throat/formants, release.
 * Robot/steel resonances and fox barks are deliberately different source shapes.
 */
export function renderFightVocal(id,mode='hurt',sampleRate=22050){
  const p=profile(id),duration=mode==='attack'?.23:mode==='hurt'?.3:mode==='big-hurt'?.54:1.16;
  const count=Math.ceil(duration*sampleRate),data=new Float32Array(count);
  const random=seededRandom(hash(id+':'+mode)),offset=mode==='hurt'?.82:mode==='big-hurt'?.88:mode==='scream'?1.2:1;
  const vowel=mode==='attack'?[1.14,1,1]:mode==='hurt'?[.66,.77,.93]:mode==='big-hurt'?[.91,.85,.95]:[1.24,1.12,1.04];
  const filters=p.formants.map((f,i)=>bandpass(f*vowel[i],i===0?3.1:4.6,sampleRate));
  const weights=[1,.52,.23];
  let phase=0,peak=.01;
  for(let i=0;i<count;i++){
    const t=i/sampleRate,u=t/duration;
    const gliss=mode==='scream'?1.07-.31*u:mode==='big-hurt'?1.14-.33*u:mode==='attack'?1.1-.24*u:1.15-.27*u;
    const pitch=p.pitch*offset*gliss*(1+.009*Math.sin(t*83)+.018*Math.sin(t*31));
    phase+=2*Math.PI*pitch/sampleRate;
    const breath=random();
    const cycle=(phase/(2*Math.PI))%1;
    // An open glottal pulse with a fast closure excites upper speech formants.
    const pulse=cycle<.58?Math.sin(Math.PI*cycle/.58):-.46*Math.exp(-(cycle-.58)*23);
    const throat=pulse*.8+(Math.sin(phase)+.42*Math.sin(phase*2)+.21*Math.sin(phase*3))*.2;
    const rough=Math.sin(phase*.49)*p.rasp*.65+breath*p.rasp*.23;
    let value=filters.reduce((sum,filter,j)=>sum+filter(throat+rough+breath*p.breath)*weights[j],0);
    value+=breath*(u<.12?p.breath*.18:p.breath*.045);
    const onset=clamp(u/(mode==='scream'?.075:.045),0,1),release=clamp((1-u)/.16,0,1);
    let shape=Math.pow(Math.sin(Math.PI*clamp(u,0,1)),mode==='attack'?.56:.3)*onset*release;
    if(p.fox)shape*=mode==='scream'?.6+.4*Math.pow(Math.sin(t*15),2):.44+.56*Math.pow(Math.sin(t*22+1),2);
    if(p.robot)value=Math.round(value*(.68+.32*Math.sin(t*2*Math.PI*91))*19)/19*(Math.sin(t*2*Math.PI*27)>-.55?1:.18);
    if(p.steel)value=value*.8+value*Math.sin(t*2*Math.PI*113)*.27;
    value=Math.tanh(value*(1+p.rasp*2))*shape;
    data[i]=value;peak=Math.max(peak,Math.abs(value));
  }
  for(let i=0;i<count;i++)data[i]*=.78/peak;
  return data;
}

export function createFightAudio(options={}){
  let context=null,master=null,fxBus=null,voiceBus=null,announcerBus=null,noiseBuffer=null,announcerBuffer=null;
  let muted=!!options.muted,paused=!!options.paused,reducedMotion=!!options.reducedMotion,announcerPlayed=false;
  let pendingStart=null,assetError='',playedEvents=0,droppedEvents=0,playedVoices=0;
  const active=new Set(),voiceGroups=new Map(),cooldowns=new Map(),vocalBuffers=new Map();
  const contextFactory=options.contextFactory??(()=>{
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    return Context?new Context({latencyHint:'interactive'}):null;
  });
  const fetchImpl=options.fetch??globalThis.fetch?.bind(globalThis);
  function disconnect(node){try{node.disconnect();}catch{}}
  function stopGroup(group){
    if(!group||group.stopped)return;group.stopped=true;
    try{group.gain.gain.cancelScheduledValues(context.currentTime);group.gain.gain.setTargetAtTime(.0001,context.currentTime,.012);}catch{}
    for(const source of group.sources)try{source.stop(context.currentTime+.035);}catch{}
    active.delete(group);
    if(group.voiceId&&voiceGroups.get(group.voiceId)===group)voiceGroups.delete(group.voiceId);
  }
  function stopAll(){for(const group of [...active])stopGroup(group);}
  function busVolume(){if(!context)return;master.gain.setTargetAtTime(muted||paused?0:.72,context.currentTime,.02);}
  function makeGraph(){
    master=context.createGain();master.gain.value=muted||paused?0:.72;
    fxBus=context.createGain();fxBus.gain.value=.84;fxBus.connect(master);
    voiceBus=context.createGain();voiceBus.gain.value=.64;voiceBus.connect(master);
    announcerBus=context.createGain();announcerBus.gain.value=.8;announcerBus.connect(master);
    const compressor=context.createDynamicsCompressor();
    Object.assign(compressor.threshold,{value:-15});Object.assign(compressor.knee,{value:8});
    Object.assign(compressor.ratio,{value:5});Object.assign(compressor.attack,{value:.003});Object.assign(compressor.release,{value:.14});
    const limiter=context.createWaveShaper(),curve=new Float32Array(2048);
    for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=.97*Math.tanh(x*1.25);}
    limiter.curve=curve;limiter.oversample='2x';master.connect(compressor);compressor.connect(limiter);limiter.connect(context.destination);
    noiseBuffer=context.createBuffer(1,context.sampleRate,context.sampleRate);
    const data=noiseBuffer.getChannelData(0),random=seededRandom(948712);
    for(let i=0;i<data.length;i++)data[i]=random();
  }
  async function startAudio(){
    if(pendingStart)return pendingStart;
    pendingStart=(async()=>{
      try{
        if(!context){context=contextFactory();if(!context)return false;makeGraph();}
        if(context.state==='suspended')await context.resume();
        if(!announcerBuffer&&fetchImpl){
          try{
            const bundle=globalThis.SYSTEM_CLASH_FIGHT_BUNDLE?.audio??{};
            const url=options.announcerUrl??bundle[ARCADE_ANNOUNCER_PATH]??new URL(ARCADE_ANNOUNCER_PATH,options.baseUrl??globalThis.document?.baseURI??globalThis.location?.href??'http://localhost/').href;
            const response=await fetchImpl(url);
            if(!response.ok)throw new Error('announcer HTTP '+response.status);
            announcerBuffer=await context.decodeAudioData(await response.arrayBuffer());
            assetError='';
          }catch(error){assetError=String(error?.message??'announcer unavailable');}
        }
        return context.state==='running';
      }catch(error){assetError=String(error?.message??'audio unavailable');return false;}
    })().finally(()=>{pendingStart=null;});
    return pendingStart;
  }
  function group(bus,priority,voiceId=null){
    const sfx=[...active].filter(g=>!g.voiceId);
    if(!voiceId&&sfx.length>=10){
      const victim=sfx.find(g=>g.priority<=priority);
      if(victim)stopGroup(victim);else return null;
    }
    if(voiceId){
      const voices=[...active].filter(g=>g.voiceId&&g.voiceId!==voiceId);
      if(voices.length>=3){const victim=voices.find(g=>g.priority<=priority);if(victim)stopGroup(victim);else return null;}
    }
    const node=context.createGain();node.connect(bus);
    const entry={gain:node,nodes:[node],sources:[],remaining:0,priority,voiceId,stopped:false};
    active.add(entry);
    if(voiceId){stopGroup(voiceGroups.get(voiceId));voiceGroups.set(voiceId,entry);}
    return entry;
  }
  function own(group,source,nodes,endAt){
    group.sources.push(source);group.nodes.push(...nodes);group.remaining++;
    source.onended=()=>{
      disconnect(source);for(const node of nodes)disconnect(node);
      group.remaining--;
      if(!group.remaining){disconnect(group.gain);active.delete(group);if(group.voiceId&&voiceGroups.get(group.voiceId)===group)voiceGroups.delete(group.voiceId);}
    };
    source.stop(endAt+.025);
  }
  function envelope(node,at,duration,gain){
    node.gain.setValueAtTime(.0001,at);node.gain.exponentialRampToValueAtTime(Math.max(.0001,gain),at+.003);
    node.gain.exponentialRampToValueAtTime(.0001,at+duration);
  }
  function playLayer(item,entry,at){
    const gain=context.createGain();envelope(gain,at,item.duration,item.gain);gain.connect(entry.gain);
    if(item.kind==='tone'){
      const source=context.createOscillator();source.type=item.waveform;
      source.frequency.setValueAtTime(item.frequency,at);source.frequency.exponentialRampToValueAtTime(Math.max(10,item.end),at+item.duration);
      source.connect(gain);source.start(at);own(entry,source,[gain],at+item.duration);
    }else{
      const source=context.createBufferSource(),filter=context.createBiquadFilter();
      source.buffer=noiseBuffer;filter.type=item.filter;filter.frequency.setValueAtTime(item.frequency,at);filter.Q.value=item.q;
      source.connect(filter);filter.connect(gain);source.start(at,Math.min(.8,item.delay*1.7));own(entry,source,[gain,filter],at+item.duration);
    }
  }
  function playVocal(cue,priority,at){
    const key=cue.id+':'+cue.mode,last=cooldowns.get('voice:'+cue.id)??-Infinity;
    const wait=cue.mode==='scream'?.7:cue.mode==='big-hurt'?.27:cue.mode==='attack'?.2:.15;
    const vocalPriority=cue.mode==='scream'?4:cue.mode==='big-hurt'?3:cue.mode==='hurt'?2:1;
    const previous=voiceGroups.get(cue.id);
    if(at-last<wait&&(!previous||previous.priority>=vocalPriority))return;
    // New pain wins over an effort grunt; attack never masks an active scream.
    if(previous&&previous.priority>vocalPriority&&cue.mode==='attack')return;
    cooldowns.set('voice:'+cue.id,at);
    let buffer=vocalBuffers.get(key);
    if(!buffer){
      const data=renderFightVocal(cue.id,cue.mode,context.sampleRate);
      buffer=context.createBuffer(1,data.length,context.sampleRate);buffer.getChannelData(0).set(data);vocalBuffers.set(key,buffer);
    }
    const entry=group(voiceBus,vocalPriority,cue.id);if(!entry)return;
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;gain.gain.value=cue.mode==='attack'?.31:cue.mode==='hurt'?.43:cue.mode==='big-hurt'?.5:.57;
    source.connect(gain);gain.connect(entry.gain);source.start(at);
    own(entry,source,[gain],at+buffer.duration);playedVoices++;
  }
  function emit(event={}){
    if(!context||context.state!=='running'||muted||paused){droppedEvents++;return false;}
    const plan=planFightSound(event),at=context.currentTime+.004;
    if(plan.announcer){
      if(announcerPlayed)return false;announcerPlayed=true;
      if(!announcerBuffer){assetError=assetError||'announcer not loaded';return false;}
      // Keep the spoken decision cue intelligible above ongoing contact tails.
      for(const entry of [...active])if(!entry.voiceId)stopGroup(entry);
      const entry=group(announcerBus,4,'announcer');if(!entry)return false;
      const source=context.createBufferSource();
      source.buffer=announcerBuffer;source.connect(entry.gain);source.start(at);own(entry,source,[],at+announcerBuffer.duration);
      playedEvents++;return true;
    }
    if(!plan.layers.length&&!plan.voices.length)return false;
    const throttleKey=plan.type+':'+(plan.attackerId??'')+':'+(event.cue??'');
    const last=cooldowns.get(throttleKey)??-Infinity;
    const spacing=['hit','deletion-impact','weapon-embed','ko'].includes(plan.type)?.032:.075;
    if(at-last<spacing){droppedEvents++;return false;}cooldowns.set(throttleKey,at);
    if(plan.layers.length){
      const entry=group(fxBus,plan.priority);
      if(entry)for(const item of plan.layers)playLayer(item,entry,at+item.delay);
    }
    for(const cue of plan.voices)playVocal(cue,plan.priority,at+cue.delay);
    playedEvents++;return true;
  }
  return {emit,startAudio,
    setMuted(value){muted=!!value;if(muted)stopAll();busVolume();},
    setPaused(value){const next=!!value;if(next===paused)return;paused=next;if(paused)stopAll();busVolume();},
    setReducedMotion(value){reducedMotion=!!value;},
    clear(){stopAll();cooldowns.clear();announcerPlayed=false;},
    getStats(){return {muted,paused,reducedMotion,audioStarted:!!context,audioRunning:context?.state==='running',announcerLoaded:!!announcerBuffer,announcerPlayed,assetError,activeGroups:active.size,activeVoices:voiceGroups.size,cachedVoices:vocalBuffers.size,playedEvents,playedVoices,droppedEvents};},
  };
}


