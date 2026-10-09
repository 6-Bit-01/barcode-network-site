import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createFightAudio,createFightVariationSelector,planFightSound,FIGHT_AUDIO_PROFILES} from '../public/games/system-clash/play/fight-audio.mjs';
const moduleUrl=new URL('../public/games/system-clash/play/fight-foley.mjs',import.meta.url);
async function owner(){assert.ok(existsSync(moduleUrl),'recorded Foley routing and buffer owner exists');return import(moduleUrl);}
const fixtureAssets=Array.from({length:8},(_,i)=>({id:'clip-'+i,path:'assets/audio/foley/clip-'+i+'.wav',bytes:8,duration:.05,group:'body'}));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const buffer=(duration=.05,rate=1000)=>({duration,sampleRate:rate,numberOfChannels:1,length:Math.round(duration*rate),getChannelData:()=>new Float32Array(Math.round(duration*rate))});
const response=()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});

test('ordinary organic hits use recorded body and wet layers; heavy contacts add bone while metal victims stay dry',async()=>{
 const {planRecordedFoley}=await owner();
 const event={type:'hit',attackerId:'6-bit',victimId:'9-bit',strength:1};
 const light=planRecordedFoley(event,planFightSound(event));
 assert.deepEqual(light.layers.map(x=>x.group),['body','wet']);
 const heavyEvent={...event,strength:2.1,damage:22};
 const heavy=planRecordedFoley(heavyEvent,planFightSound(heavyEvent));
 assert.ok(heavy.layers.some(x=>x.group==='bone'));
 assert.ok(heavy.layers.reduce((n,x)=>n+x.gain,0)<=.72);
 const metalEvent={...heavyEvent,victimId:'cache-back'};
 const metal=planRecordedFoley(metalEvent,planFightSound(metalEvent));
 assert.ok(metal.layers.some(x=>x.group==='metal'));
 assert.ok(metal.layers.every(x=>!['wet','bone','slime','splash'].includes(x.group)));
});

test('all fighter textures preserve distinct recorded timing/composition while unknown and spoken cue events have no recording',async()=>{
 const {planRecordedFoley}=await owner();const signatures=[];
 for(const id of Object.keys(FIGHT_AUDIO_PROFILES)){
  const event={type:'hit',attackerId:id,victimId:'6-bit',strength:2};
  const plan=planRecordedFoley(event,planFightSound(event));
  assert.ok(plan.layers.length>0&&plan.layers.length<=3);
  signatures.push(JSON.stringify(plan.layers.map(({group,gain,rate,delay})=>({group,gain,rate,delay}))));
 }
 assert.equal(new Set(signatures).size,Object.keys(FIGHT_AUDIO_PROFILES).length);
 for(const type of ['unknown','finish-prompt','round-start'])assert.equal(planRecordedFoley({type},planFightSound({type})).layers.length,0);
 const glass={type:'glass-break'};assert.ok(planRecordedFoley(glass,planFightSound(glass)).layers.some(x=>x.group==='glass'));
 const swish={type:'miss',attackerId:'wittyf0x'};assert.ok(planRecordedFoley(swish,planFightSound(swish)).layers.some(x=>x.group==='whoosh'));
});

test('recorded families rotate every source once without consecutive repeats across shuffle bags',async()=>{
 const {planRecordedFoley,FOLEY_BANKS}=await owner();const variations=createFightVariationSelector(773);
 const event={type:'hit',attackerId:'6-bit',victimId:'9-bit',strength:1};const choices=[];
 const next=(key,count)=>variations.next(key,count);
 for(let i=0;i<FOLEY_BANKS.body.length*3;i++)choices.push(planRecordedFoley(event,planFightSound(event),next).layers.find(x=>x.group==='body').id);
 for(let i=1;i<choices.length;i++)assert.notEqual(choices[i],choices[i-1]);
 for(let i=0;i<choices.length;i+=FOLEY_BANKS.body.length)assert.equal(new Set(choices.slice(i,i+FOLEY_BANKS.body.length)).size,FOLEY_BANKS.body.length);
});

test('lazy load deduplicates requests and rejects a non-catalog or malformed encoded asset',async()=>{
 const {createFoleyBufferBank}=await owner();let calls=0;const load=deferred();
 const context={sampleRate:1000,decodeAudioData:async()=>buffer()};
 const bank=createFoleyBufferBank({assets:fixtureAssets,getContext:()=>context,fetch:async()=>{calls++;return load.promise;}});
 assert.equal(bank.getStats().cached,0);assert.equal(calls,0);
 const a=bank.request('clip-0'),b=bank.request('clip-0');assert.equal(a,b);assert.equal(calls,1);
 assert.equal(await bank.request('HOLD-not-a-catalog-asset'),null);assert.equal(calls,1);
 load.resolve(response());assert.ok(await a);assert.ok(bank.peek('clip-0'));assert.equal(bank.getStats().cached,1);
 const broken=createFoleyBufferBank({assets:fixtureAssets,getContext:()=>context,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(2000000)})});
 assert.equal(await broken.request('clip-0'),null);assert.equal(broken.getStats().cached,0);assert.equal(broken.getStats().failed,1);
});

test('fetch/decode concurrency, queued jobs, cache entries and actual PCM bytes stay bounded',async()=>{
 const {createFoleyBufferBank}=await owner();let decoding=0,maximum=0;const gates=[];
 const context={sampleRate:1000,decodeAudioData:async()=>{decoding++;maximum=Math.max(maximum,decoding);const gate=deferred();gates.push(gate);await gate.promise;decoding--;return buffer();}};
 const bank=createFoleyBufferBank({assets:fixtureAssets,maxConcurrent:2,maxQueued:2,maxCacheEntries:2,maxCacheBytes:400,getContext:()=>context,fetch:async()=>response()});
 const jobs=fixtureAssets.map(asset=>bank.request(asset.id));await tick();
 assert.equal(bank.getStats().loading,2);assert.equal(bank.getStats().queued,2);assert.equal(maximum,2);
 for(let i=0;i<5;i++){for(const gate of gates.splice(0))gate.resolve();await tick();}
 await Promise.all(jobs);assert.ok(bank.getStats().cached<=2);assert.ok(bank.getStats().cacheBytes<=400);assert.equal(maximum,2);assert.equal(bank.getStats().decoded,4,'bounded jobs still populate the real cache');assert.ok(bank.getStats().dropped>=4);
});

test('pause/reset invalidation rejects old decoded work even when a new request for the same source races it',async()=>{
 const {createFoleyBufferBank}=await owner();const gates=[];let calls=0;
 const context={sampleRate:1000,decodeAudioData:async()=>{const gate=deferred();gates.push(gate);return gate.promise;}};
 const bank=createFoleyBufferBank({assets:fixtureAssets,getContext:()=>context,fetch:async()=>{calls++;return response();}});
 const old=bank.request('clip-0');await tick();bank.invalidate();assert.equal(bank.peek('clip-0'),null);
 const current=bank.request('clip-0');await tick();assert.equal(calls,2);
 gates[0].resolve(buffer());assert.equal(await old,null);assert.equal(bank.peek('clip-0'),null);
 gates[1].resolve(buffer());assert.ok(await current);assert.ok(bank.peek('clip-0'));assert.equal(bank.getStats().pending,0);
});

class Param {constructor(v=0){this.value=v;}setValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(){}linearRampToValueAtTime(){}setTargetAtTime(v){this.value=v;}cancelScheduledValues(){}}
class AudioNode {constructor(){this.gain=new Param();this.frequency=new Param();this.playbackRate=new Param(1);this.Q=new Param();}connect(){}disconnect(){}start(...args){this.started=args;}stop(at){this.stopped=at;}}
class Context {
 constructor(){this.currentTime=0;this.sampleRate=32000;this.state='suspended';this.destination={};this.sources=[];this.decodes=[];}
 createGain(){return new AudioNode();}createBiquadFilter(){return new AudioNode();}createWaveShaper(){return new AudioNode();}
 createDynamicsCompressor(){return Object.assign(new AudioNode(),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,new Param()])));}
 createOscillator(){const n=new AudioNode();this.sources.push(n);return n;}createBufferSource(){const n=new AudioNode();this.sources.push(n);return n;}
 createBuffer(channels,length,rate){const data=new Float32Array(length);return {duration:length/rate,sampleRate:rate,numberOfChannels:channels,length,getChannelData:()=>data};}
 async resume(){this.state='running';}
 async decodeAudioData(bytes){const view=new DataView(bytes);if(bytes.byteLength<44)return this.createBuffer(1,32000,32000);const frames=view.getUint32(40,true)/2,rate=view.getUint32(24,true);return this.createBuffer(1,frames,rate);}
}
const clipBase=new URL('../public/games/system-clash/play/',import.meta.url);
const localFetch=async url=>{const path=new URL(url);if(path.pathname.endsWith('delete-him-arcade.wav'))return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};const b=readFileSync(path);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};

test('the existing emit owner plays immediate fallback then recorded contact; never replays a hit after late decode',async()=>{
 await owner();const context=new Context(),gate=deferred();let defer=false;
 const audio=createFightAudio({contextFactory:()=>context,baseUrl:clipBase.href,fetch:async url=>{if(defer&&!String(url).endsWith('delete-him-arcade.wav'))await gate.promise;return localFetch(url);}});
 await audio.startAudio();defer=true;audio.emit({type:'hit',attackerId:'6-bit',victimId:'9-bit'});const sources=context.sources.length;
 assert.ok(sources>0,'uncached impact retains immediate procedural contact and current voices');audio.setPaused(true);gate.resolve();await tick();
 assert.equal(context.sources.length,sources,'old load completion cannot create a delayed source');audio.setPaused(false);
 for(let i=0;i<30;i++){context.currentTime+=1;audio.emit({type:'hit',attackerId:'6-bit',victimId:'9-bit'});await tick();for(const source of context.sources)source.onended?.();}
 assert.ok(audio.getStats().recordedFoleyPlayed>0,'real WAV clips reach existing event playback');
 assert.ok(audio.getStats().foleyCacheBytes<=8*1024*1024);assert.ok(audio.getStats().cachedFoley<=48);
 const before=audio.getStats().recordedFoleyPlayed;audio.setMuted(true);context.currentTime+=1;assert.equal(audio.emit({type:'hit',attackerId:'6-bit'}),false);await tick();assert.equal(audio.getStats().recordedFoleyPlayed,before);
});

test('network/decode failures preserve procedural impact and all original fighter voice families',async()=>{
 await owner();const context=new Context(),audio=createFightAudio({contextFactory:()=>context,fetch:async()=>({ok:false,status:404})});
 assert.equal(await audio.startAudio(),true);context.currentTime+=1;assert.equal(audio.emit({type:'hit',attackerId:'9-bit',victimId:'6-bit',strength:2}),true);await tick();
 assert.ok(audio.getStats().playedVoices>0);assert.equal(audio.getStats().recordedFoleyPlayed,0);assert.equal(Object.keys(FIGHT_AUDIO_PROFILES).length,18);
});

test('runtime clip bytes, WAV headroom, short duration and source credits exclude every held asset',async()=>{
 const {FOLEY_ASSETS}=await owner();assert.ok(FOLEY_ASSETS.length>=48&&FOLEY_ASSETS.length<=80);let total=0;
 const creditUrl=new URL('../public/games/system-clash/play/assets/audio/foley/SOURCE-LICENSES.json',import.meta.url);
 assert.ok(existsSync(creditUrl));const credits=JSON.parse(readFileSync(creditUrl,'utf8'));assert.equal(credits.files.length,FOLEY_ASSETS.length);
 const creditMap=new Map(credits.files.map(x=>[x.id,x]));
 for(const asset of FOLEY_ASSETS){
  const bytes=readFileSync(new URL(asset.path,clipBase));total+=bytes.length;assert.equal(bytes.length,asset.bytes);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.equal(bytes.readUInt16LE(20),1);assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt32LE(24),32000);assert.equal(bytes.readUInt16LE(34),16);
  const duration=bytes.readUInt32LE(40)/64000;assert.ok(duration>=.04&&duration<=1.2);assert.ok(Math.abs(duration-asset.duration)<.001);
  let peak=0;for(let i=44;i<bytes.length;i+=2)peak=Math.max(peak,Math.abs(bytes.readInt16LE(i)/32768));assert.ok(peak>0&&peak<=.7101);
  const credit=creditMap.get(asset.id);assert.ok(credit);assert.ok(['CC0-1.0','CC-BY-3.0'].includes(credit.license));assert.ok(!/cgeffex|HOLD/i.test(JSON.stringify(credit)));assert.match(credit.original_sha256,/^[a-f0-9]{64}$/);assert.match(credit.source_page,/^https:\/\//);assert.match(credit.download_url,/^https:\/\//);assert.equal(createHash('sha256').update(bytes).digest('hex'),credit.sha256);
  if(credit.license==='CC-BY-3.0'){assert.match(credit.attribution,/Vinrax.*vinraxarts.ru.*creativecommons.org\/licenses\/by\/3.0/);assert.doesNotMatch(credit.attribution,/no modifications/i);assert.match(credit.attribution,/trimmed.*normalized/i);}
 }
 assert.ok(total<=5*1024*1024);assert.equal(readdirSync(new URL('assets/audio/foley/',clipBase)).filter(x=>x.endsWith('.wav')).length,FOLEY_ASSETS.length);
});
