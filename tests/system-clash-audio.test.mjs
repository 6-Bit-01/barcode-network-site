import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
import {FIGHT_AUDIO_PROFILES,FIGHT_VOCAL_BANKS,FIGHT_VOCAL_VARIANTS,MAX_VOCAL_CACHE_ENTRIES,MAX_VOCAL_CACHE_BYTES,createFightVariationSelector,CHARACTER_LINE_ASSETS,ARCADE_ANNOUNCER_PATH,planFightSound,renderFightVocal,createFightAudio} from '../public/games/system-clash/play/fight-audio.mjs';

test('every enabled fighter has an original distinct effort/hurt/scream voice profile',()=>{
  assert.deepEqual(Object.keys(FIGHT_AUDIO_PROFILES).sort(),Object.keys(FIGHTER_STYLES).sort());
  for(const mode of ['attack','hurt','big-hurt','scream']){
    const hashes=[];
    for(const id of Object.keys(FIGHT_AUDIO_PROFILES)){
      const a=renderFightVocal(id,mode),b=renderFightVocal(id,mode);
      assert.deepEqual(a,b,'procedural voice is reproducible');
      assert.ok(a.every(Number.isFinite));
      const peak=Math.max(...a.map(Math.abs));
      assert.ok(peak>.77&&peak<.79,'normalized voices retain headroom');
      assert.ok(a.reduce((sum,value)=>sum+value*value,0)/a.length>.001,'voice is audible');
      hashes.push(createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex'));
    }
    assert.equal(new Set(hashes).size,Object.keys(FIGHT_AUDIO_PROFILES).length,mode+' differs for every fighter');
  }
});

test('body blows contain separate sub/body/crack layers; metal and cutting contacts differ',()=>{
  const organic=planFightSound({type:'hit',action:'punch',strength:1,attackerId:'6-bit',victimId:'9-bit'});
  const heavy=planFightSound({type:'hit',action:'power-kick',strength:2.1,damage:23,attackerId:'9-bit',victimId:'6-bit'});
  assert.equal(organic.material,'organic');assert.equal(organic.voices[0].mode,'hurt');
  assert.equal(heavy.voices[0].mode,'big-hurt');assert.ok(heavy.layers.length>organic.layers.length);
  assert.ok(heavy.layers.some(layer=>layer.frequency<100&&layer.duration>.25));
  assert.ok(heavy.layers.filter(layer=>layer.kind==='noise').length>=4,'crack, body, wet tail and grit are distinct');
  const metal=planFightSound({type:'hit',attackerId:'6-bit',victimId:'cache-back'});
  assert.equal(metal.material,'metal');assert.ok(metal.layers.some(layer=>layer.frequency>1200&&layer.duration>.18));
  const steel=planFightSound({type:'hit',attackerId:'6-bit',victimId:'stolz'});
  assert.equal(steel.material,'metal');assert.notDeepEqual(metal.layers,steel.layers);
  const cut=planFightSound({type:'deletion-impact',cue:'drive-blade-cut',strength:3.2,victimId:'wittyf0x'});
  assert.equal(cut.contact,'cut');assert.equal(cut.voices[0].mode,'scream');
  assert.ok(cut.layers.some(layer=>layer.filter==='highpass'&&layer.frequency>4000));
});

test('signature mechanisms route separate slam, crush, puncture and energy Foley within a layer gain budget',()=>{
  const records=[];
  for(const cue of ['nail-strike','chrome-seal','encore-floor-slam','drive-blade-cut','heart-burst','arrow-hit','ban-stamp','speaker-burial']){
    const sound=planFightSound({type:'deletion-impact',cue,strength:3.4,attackerId:'ms-mayhem',victimId:'6-bit'});
    assert.ok(sound.layers.reduce((sum,layer)=>sum+layer.gain,0)<=.9500001);
    assert.ok(sound.layers.every(layer=>layer.gain>0&&layer.duration>0&&layer.delay>=0));
    records.push(JSON.stringify(sound.layers));
  }
  assert.equal(new Set(records).size,5,'related crushes/punctures share mechanism while different mechanisms differ');
  assert.equal(planFightSound({type:'deletion-impact',cue:'nail-strike'}).contact,'puncture');
  assert.equal(planFightSound({type:'deletion-impact',cue:'chrome-seal'}).contact,'crush');
  assert.equal(planFightSound({type:'deletion-impact',cue:'encore-floor-slam'}).contact,'slam');
  assert.equal(planFightSound({type:'deletion-impact',cue:'heart-burst'}).contact,'energy');
});

test('attacker effort and victim pain follow identity, never the opponent voice',()=>{
  const attack=planFightSound({type:'attack',attackerId:'wittyf0x',victimId:'cache-back',action:'kick'});
  assert.deepEqual(attack.voices,[{id:'wittyf0x',mode:'attack',delay:0}]);
  const hurt=planFightSound({type:'hit',attackerId:'wittyf0x',victimId:'cache-back',strength:1});
  assert.equal(hurt.voices[0].id,'cache-back');
  assert.equal(planFightSound({type:'round-start'}).voices.length,0);
  assert.equal(planFightSound({type:'finish-prompt'}).announcer,true);
  assert.equal(planFightSound({type:'deletion',cue:'complete'}).announcer,false);
});

class Param{
  constructor(value=0){this.value=value;this.commands=[];}
  setValueAtTime(v,t){this.value=v;this.commands.push(['set',v,t]);}
  exponentialRampToValueAtTime(v,t){this.commands.push(['ramp',v,t]);}
  setTargetAtTime(v,t,c){this.value=v;this.commands.push(['target',v,t,c]);}
  cancelScheduledValues(t){this.commands.push(['cancel',t]);}
}
class Node{
  constructor(context){this.context=context;this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.disconnected=false;}
  connect(node){this.output=node;return node;}
  disconnect(){this.disconnected=true;}
  start(...args){this.started=args;}
  stop(at){this.stopped=at;}
  end(){this.onended?.();}
}
class FakeContext{
  constructor(){this.currentTime=0;this.sampleRate=22050;this.state='suspended';this.destination={};this.sources=[];this.nodes=[];this.resumeCount=0;}
  createGain(){const node=new Node(this);this.nodes.push(node);return node;}
  createOscillator(){const node=new Node(this);this.sources.push(node);return node;}
  createBufferSource(){const node=new Node(this);this.sources.push(node);return node;}
  createBiquadFilter(){return new Node(this);}
  createWaveShaper(){return new Node(this);}
  createDynamicsCompressor(){return Object.assign(new Node(this),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,new Param()])));}
  createBuffer(channels,length,rate){const data=new Float32Array(length);return {duration:length/rate,getChannelData:()=>data};}
  async decodeAudioData(){return this.createBuffer(1,22050,22050);}
  async resume(){this.state='running';this.resumeCount++;}
}
const okFetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});

test('audio stays locked until user start, preserves reduced motion, and mute/pause stop active tails',async()=>{
  const context=new FakeContext(),audio=createFightAudio({contextFactory:()=>context,fetch:okFetch,reducedMotion:true});
  assert.equal(audio.emit({type:'hit'}),false);assert.equal(context.sources.length,0);
  assert.equal(await audio.startAudio(),true);assert.equal(context.resumeCount,1);
  audio.emit({type:'hit',attackerId:'9-bit',victimId:'6-bit',strength:2});
  assert.ok(context.sources.length>5);assert.equal(audio.getStats().reducedMotion,true);
  audio.setMuted(true);assert.equal(audio.getStats().activeGroups,0);
  const previous=context.sources.length;assert.equal(audio.emit({type:'hit'}),false);assert.equal(context.sources.length,previous);
  audio.setMuted(false);context.currentTime+=1;assert.equal(audio.emit({type:'hit',victimId:'6-bit'}),true);
  audio.setPaused(true);assert.equal(audio.getStats().activeGroups,0);
  assert.equal(audio.emit({type:'attack',attackerId:'9-bit'}),false);
  audio.setPaused(false);context.currentTime+=1;assert.equal(audio.emit({type:'attack',attackerId:'9-bit'}),true);
  audio.clear();assert.equal(audio.getStats().activeGroups,0);
  assert.ok(context.sources.every(source=>source.stopped!==undefined),'pause and clear stop scheduled sources');
});

test('announcer plays once per match, decoded bytes are reusable, and clear rearms it',async()=>{
  const context=new FakeContext();let fetchCount=0;
  const audio=createFightAudio({contextFactory:()=>context,fetch:async()=>{fetchCount++;return okFetch();}});
  await Promise.all([audio.startAudio(),audio.startAudio()]);
  assert.equal(fetchCount,1);assert.equal(audio.getStats().announcerLoaded,true);
  assert.equal(audio.emit({type:'finish-prompt'}),true);
  assert.equal(audio.emit({type:'finish-prompt'}),false);
  assert.equal(context.sources.filter(source=>source.buffer?.duration===1).length,1);
  audio.clear();context.currentTime+=2;assert.equal(audio.emit({type:'finish-prompt'}),true);
  await audio.startAudio();assert.equal(fetchCount,1);
});

test('impact bursts are bounded; the same fighter never layers simultaneous pain and effort',async()=>{
  const context=new FakeContext(),audio=createFightAudio({contextFactory:()=>context,fetch:okFetch});
  await audio.startAudio();
  for(let i=0;i<80;i++){context.currentTime+=.08;audio.emit({type:'hit',cue:'contact-'+i,attackerId:'9-bit',victimId:'6-bit',strength:2});}
  assert.ok(audio.getStats().activeGroups<=11);
  assert.equal(audio.getStats().activeVoices,1);
  context.currentTime+=1;audio.emit({type:'deletion-impact',victimId:'6-bit',cue:'crush',strength:3});
  const count=audio.getStats().playedVoices;
  context.currentTime+=.25;audio.emit({type:'attack',attackerId:'6-bit'});
  assert.equal(audio.getStats().playedVoices,count,'effort cannot overwrite a stronger pain cue');
  audio.clear();assert.equal(audio.getStats().activeVoices,0);
});

test('missing announcer degrades quietly and missing WebAudio stays optional',async()=>{
  const context=new FakeContext(),audio=createFightAudio({contextFactory:()=>context,fetch:async()=>({ok:false,status:404})});
  assert.equal(await audio.startAudio(),true);assert.equal(audio.getStats().announcerLoaded,false);
  assert.match(audio.getStats().assetError,/404/);assert.equal(audio.emit({type:'finish-prompt'}),false);
  assert.equal(audio.emit({type:'hit',victimId:'stolz'}),true);
  assert.equal(await createFightAudio({contextFactory:()=>null}).startAudio(),false);
});

test('bundled offline announcer is actual speech PCM with headroom and retained-source integrity',()=>{
  const wav=readFileSync(new URL('../public/games/system-clash/play/'+ARCADE_ANNOUNCER_PATH,import.meta.url));
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
  assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),22050);assert.equal(wav.readUInt16LE(34),16);
  let peak=0;for(let i=44;i+1<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i))/32768);
  assert.ok(peak>.7&&peak<.77);assert.ok(wav.length>30000&&wav.length<70000);
  assert.equal(createHash('sha256').update(wav).digest('hex'),'c430cb82c7f0e1a549f17e933ed833a925e0127ebb78440b262e98165899f0a1');
  assert.equal(wav.length,40102);
});


function vocalFeatures(data){
  const energy=Array(12).fill(0);let total=0,difference=0;
  for(let i=0;i<data.length;i++){const value=data[i];energy[Math.min(11,Math.floor(i/data.length*12))]+=value*value;total+=value*value;if(i)difference+=(value-data[i-1])**2;}
  return {energy:energy.map(value=>value/Math.max(.0001,total)),roughness:Math.sqrt(difference/Math.max(.0001,total))};
}

const utteranceCount=Object.values(FIGHT_VOCAL_BANKS).reduce((sum,bank)=>sum+Object.values(bank.variants).reduce((n,takes)=>n+takes.length,0),0);

test('all original utterances change normalized phrasing and spectral texture, with four takes for every reaction',()=>{
  const hashes=new Set();let count=0;
  for(const [id,bank]of Object.entries(FIGHT_VOCAL_BANKS))for(const [mode,variants]of Object.entries(bank.variants)){
    assert.equal(variants.length,4);assert.equal(new Set(variants.map(v=>v.phrase)).size,4);
    const waves=variants.map(({variant})=>renderFightVocal(id,mode,22050,variant)),features=waves.map(vocalFeatures);
    assert.equal(new Set(waves.map(w=>w.length)).size,4,'takes have independently authored durations');
    for(const wave of waves){hashes.add(createHash('sha256').update(new Uint8Array(wave.buffer)).digest('hex'));assert.ok(wave.every(Number.isFinite));count++;}
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
      const distance=Math.sqrt(features[a].energy.reduce((sum,value,i)=>sum+(value-features[b].energy[i])**2,0));
      assert.ok(distance>.025,id+' '+mode+' variants change the gain-independent temporal envelope');
    }
    assert.ok(Math.max(...features.map(f=>f.roughness))-Math.min(...features.map(f=>f.roughness))>.008,id+' '+mode+' variants change normalized spectral texture');
  }
  assert.equal(count,utteranceCount);assert.equal(hashes.size,utteranceCount);
  assert.deepEqual(renderFightVocal('6-bit','hurt'),renderFightVocal('6-bit','hurt',22050,0),'legacy call chooses take zero');
  assert.deepEqual(renderFightVocal('6-bit','hurt',22050,4),renderFightVocal('6-bit','hurt',22050,0),'variant indices are bounded deterministically');
});

test('independent deterministic shuffle bags play every take once per bank and never repeat across bag boundaries',()=>{
  const a=createFightVariationSelector(713),b=createFightVariationSelector(713),first=[];
  for(const id of Object.keys(FIGHT_VOCAL_BANKS))for(const mode of Object.keys(FIGHT_VOCAL_VARIANTS)){
    const key=id+':'+mode,values=[];
    for(let i=0;i<20;i++){const value=a.next(key,4);assert.equal(value,b.next(key,4));if(i)assert.notEqual(value,values.at(-1));values.push(value);}
    for(let i=0;i<20;i+=4)assert.equal(new Set(values.slice(i,i+4)).size,4);
    first.push({key,values});
  }
  assert.equal(a.size,Object.keys(FIGHT_VOCAL_BANKS).length*Object.keys(FIGHT_VOCAL_VARIANTS).length);a.clear();assert.equal(a.size,0);
  for(const {key,values}of first)assert.deepEqual(Array.from({length:20},()=>a.next(key,4)),values,'reset recreates the same bank, independently of other identities');
});

const voiceEvent=(id,mode)=>mode==='attack'?{type:'attack',attackerId:id,victimId:'6-bit'}:
  {type:mode==='scream'?'deletion-impact':'hit',attackerId:'6-bit',victimId:id,strength:mode==='hurt'?1:mode==='big-hurt'?2.1:3.2,cue:mode==='scream'?'nail-strike':undefined};
function finishFakeSources(context,from=0){for(const source of context.sources.slice(from))source.end();}

test('event playback rotates actual PCM takes for all fighters and pauses/mute do not consume a voice choice',async()=>{
  const context=new FakeContext(),audio=createFightAudio({contextFactory:()=>context,fetch:okFetch,seed:713});await audio.startAudio();
  assert.equal(audio.getStats().cachedVoices,0,'no bank is eagerly synthesized during unlock');
  for(const id of Object.keys(FIGHT_VOCAL_BANKS))for(const mode of Object.keys(FIGHT_VOCAL_VARIANTS)){
    const key=id+':'+mode,choices=[];
    for(let i=0;i<8;i++){
      context.currentTime+=2.3;const from=context.sources.length;
      assert.equal(audio.emit(voiceEvent(id,mode)),true);const stats=audio.getStats();choices.push(stats.lastVocalVariants[key]);
      if(i)assert.notEqual(choices[i],choices[i-1],key+' rotates actual scheduled takes');
      finishFakeSources(context,from);
    }
    assert.equal(new Set(choices.slice(0,4)).size,4);assert.equal(new Set(choices.slice(4)).size,4);
  }
  const previous=audio.getStats(),sources=context.sources.length;
  audio.setPaused(true);assert.equal(audio.emit(voiceEvent('6-bit','attack')),false);audio.setPaused(false);
  audio.setMuted(true);assert.equal(audio.emit(voiceEvent('6-bit','attack')),false);audio.setMuted(false);
  assert.deepEqual(audio.getStats().lastVocalVariants,previous.lastVocalVariants);assert.equal(context.sources.length,sources);
  audio.clear();assert.equal(audio.getStats().variationFamilies,0);assert.deepEqual(audio.getStats().lastVocalVariants,{});
});

test('LRU vocal storage stays within both byte and entry bounds at high device sample rates',async()=>{
  const context=new FakeContext();context.sampleRate=96000;
  const audio=createFightAudio({contextFactory:()=>context,fetch:okFetch,seed:713});await audio.startAudio();
  let rendered=0;
  for(const id of Object.keys(FIGHT_VOCAL_BANKS))for(const mode of Object.keys(FIGHT_VOCAL_VARIANTS))for(let i=0;i<4;i++){
    context.currentTime+=2.3;audio.emit(voiceEvent(id,mode));finishFakeSources(context);context.sources.length=0;
    const stats=audio.getStats();assert.ok(stats.cachedVoices<=MAX_VOCAL_CACHE_ENTRIES);assert.ok(stats.vocalCacheBytes<=MAX_VOCAL_CACHE_BYTES);rendered++;
  }
  assert.equal(rendered,utteranceCount);assert.equal(audio.getStats().playedVoices,utteranceCount);assert.ok(audio.getStats().cachedVoices<utteranceCount,'older variants are evicted while active buffers remain source-owned');
});

test('lesser hurt and effort cannot truncate a stronger active scream or consume its next bank take',async()=>{
  const context=new FakeContext(),audio=createFightAudio({contextFactory:()=>context,fetch:okFetch});await audio.startAudio();
  audio.emit(voiceEvent('9-bit','scream'));const voiceCount=audio.getStats().playedVoices,previous=audio.getStats().lastVocalVariants;
  for(const [delay,mode]of [[.3,'hurt'],[.4,'big-hurt'],[.4,'attack']]){context.currentTime+=delay;audio.emit(voiceEvent('9-bit',mode));assert.equal(audio.getStats().playedVoices,voiceCount);}
  assert.deepEqual(audio.getStats().lastVocalVariants,previous);assert.equal(audio.getStats().activeVoices,1);
});

test('Foley rotations belong to the actual landing, blocking and KO fighter rather than their opponent',async()=>{
  const context=new FakeContext(),audio=createFightAudio({contextFactory:()=>context,fetch:okFetch});await audio.startAudio();
  for(const type of ['land','block','ko']){
    const choices=[];
    for(let i=0;i<4;i++){
      context.currentTime+=2.3;const from=context.sources.length;
      audio.emit({type,attackerId:i%2?'9-bit':'6-bit',victimId:'cache-back',strength:1});const selection=audio.getStats().lastFoleyVariation;
      assert.ok(selection.key.startsWith('foley:cache-back:'),type+' uses the sound owner identity');choices.push(selection.variant);finishFakeSources(context,from);
    }
    assert.equal(new Set(choices).size,4,'changing the attacker cannot restart the defender bank');
  }
});
test('selected Doof spoken line loads once, plays once per match and honors pause and mute',async()=>{
 const context=new FakeContext(),requests=[];
 const fetchLine=async url=>{requests.push(String(url));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(String(url).endsWith(CHARACTER_LINE_ASSETS.doofnoobler.path)?CHARACTER_LINE_ASSETS.doofnoobler.bytes:4)};};
 const audio=createFightAudio({contextFactory:()=>context,fetch:fetchLine});
 await audio.prepareCharacterLines(['6-bit','doofnoobler']);assert.equal(requests.length,0,'audio context remains user-unlocked');
 await audio.startAudio();assert.equal(audio.getStats().characterLinesLoaded,1);assert.equal(requests.length,2);
 await audio.prepareCharacterLines(['doofnoobler']);assert.equal(requests.length,2,'reuse one decoded line');
 const event={type:'character-line',fighterId:'doofnoobler',cue:'stay-kind',peaceful:true};
 audio.setPaused(true);assert.equal(audio.emit(event),false);audio.setPaused(false);
 audio.setMuted(true);assert.equal(audio.emit(event),false);audio.setMuted(false);
 assert.equal(audio.emit(event),true);assert.equal(audio.emit(event),false);assert.equal(audio.getStats().characterLinesPlayed,1);
 audio.setPaused(true);assert.equal(audio.getStats().activeVoices,0);audio.setPaused(false);
 audio.clear();assert.equal(audio.emit(event),true);assert.equal(audio.getStats().characterLinesPlayed,2);
});
test('a cold character line never replays a past cue when decoding finishes',async()=>{
 const context=new FakeContext();let release;
 const audio=createFightAudio({contextFactory:()=>context,fetch:async url=>String(url).endsWith(CHARACTER_LINE_ASSETS.doofnoobler.path)?new Promise(resolve=>{release=()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(CHARACTER_LINE_ASSETS.doofnoobler.bytes)});}):okFetch()});
 await audio.startAudio();const count=context.sources.length;
 assert.equal(audio.emit({type:'character-line',fighterId:'doofnoobler',cue:'stay-kind'}),false);assert.equal(context.sources.length,count);
 release();await audio.prepareCharacterLines(['doofnoobler']);assert.equal(audio.getStats().characterLinesLoaded,1);assert.equal(audio.getStats().characterLinesPlayed,0);assert.equal(context.sources.length,count);
});