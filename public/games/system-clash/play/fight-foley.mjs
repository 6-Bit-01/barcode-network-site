import {FOLEY_ASSETS,FOLEY_BANKS} from './fight-foley-bank.mjs';
export {FOLEY_ASSETS,FOLEY_BANKS};
export const MAX_FOLEY_CACHE_ENTRIES=48;
export const MAX_FOLEY_CACHE_BYTES=8*1024*1024;
export const MAX_FOLEY_CONCURRENT_LOADS=3;
export const MAX_FOLEY_QUEUED_LOADS=12;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f)=>Number.isFinite(v)?v:f;
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
// These are contact textures, not new voices. Existing vocal banks keep identity.
// Source composition, onset spacing and weight vary as well as small rate shifts.
const palettes=freeze({
 'doofnoobler':{accent:'cloth',rate:1.18,body:.27,secondary:.16,crack:.10,offset:.017},
 'lyra':{accent:'metal',rate:1.27,body:.34,secondary:.20,crack:.12,offset:.004},
 'papa-oak':{accent:'wood',rate:.77,body:.46,secondary:.22,crack:.19,offset:.042},
 'lost-marbles':{accent:'glass',rate:1.21,body:.32,secondary:.15,crack:.125,offset:.019},
 '6-bit':{accent:'wet',rate:1.06,body:.40,secondary:.17,crack:.14,offset:.009},
 '9-bit':{accent:'slime',rate:.84,body:.45,secondary:.18,crack:.17,offset:.025},
 'cache-back':{accent:'metal',rate:1.12,body:.34,secondary:.19,crack:.13,offset:.006},
 'mac-modem':{accent:'wood',rate:.93,body:.42,secondary:.14,crack:.15,offset:.020},
 'dj-floppydisc':{accent:'glass',rate:1.15,body:.34,secondary:.13,crack:.12,offset:.012},
 'cliff':{accent:'wood',rate:1.02,body:.36,secondary:.16,crack:.13,offset:.028},
 'mr-nice-guy':{accent:'cloth',rate:1.04,body:.35,secondary:.10,crack:.12,offset:.014},
 'ms-mayhem':{accent:'wet',rate:.96,body:.43,secondary:.20,crack:.18,offset:.005},
 'stolz':{accent:'metal',rate:.82,body:.46,secondary:.17,crack:.15,offset:.033},
 'kaveman-brown':{accent:'wood',rate:.87,body:.44,secondary:.19,crack:.16,offset:.018},
 'dr3wbaby':{accent:'wet',rate:1.01,body:.39,secondary:.16,crack:.14,offset:.035},
 'ash-flowers':{accent:'cloth',rate:.98,body:.33,secondary:.12,crack:.13,offset:.021},
 'wittyf0x':{accent:'cloth',rate:1.23,body:.30,secondary:.13,crack:.11,offset:.008},
});
/** Pure routing uses the existing owner's contact/material assessment and shuffle
 * selector. A choice is an immediate candidate, never an asynchronous play job. */
export function planRecordedFoley(event={},sound={},next=()=>0){
 const type=event.type??'',attacker=sound.attackerId??event.attackerId??event.fighterId;
 const victim=sound.victimId??event.victimId??event.targetId;
 const actor=['land','ko','block'].includes(type)?victim??attacker:attacker??victim;
 const p=palettes[actor]??palettes['6-bit'],layers=[];
 const material=sound.material??(event.victimMaterial==='metal'||['cache-back','stolz'].includes(victim)?'metal':'organic');
 const heavy=sound.heavy??(type==='deletion-impact'||finite(event.strength,1)>=1.65||finite(event.damage,0)>=18);
 const contact=sound.contact??'blunt';
 const add=(group,gain,delay=0,rate=p.rate)=>{
  const bank=FOLEY_BANKS[group];if(!bank?.length||layers.length>=3)return;
  const index=((Math.floor(finite(next((actor??'stage')+':'+group,bank.length),0))%bank.length)+bank.length)%bank.length;
  layers.push({id:bank[index],group,gain,delay,rate:clamp(rate,.75,1.3)});
 };
 if(event.peaceful){add('cloth',.15);}
 else if(type==='wall-break'){const glass=['containment','nature-simulation'].includes(event.stageId);add(glass?'glass':'wood',.39);add('metal',.14,.04,.87);}
 else if(type==='stage-activate'){const bank=event.stageId==='sheila-office'?'metal':event.stageId==='witty-wasteland'?'wood':'whoosh';add(bank,.26);if(event.stageId==='witty-wasteland')add('metal',.13,.025,.84);}
 else if(['hit','deletion-impact','weapon-embed'].includes(type)){
  if(material==='metal'){
   add('metal',heavy?.49:.39);add(p.accent==='wood'?'wood':'metal',heavy?.16:.11,p.offset,p.rate*.95);
  }else{
   add('body',p.body*(heavy?1.08:1));
   add(contact==='cut'||contact==='puncture'?'wet':p.accent,p.secondary, p.offset,p.rate*(heavy?.94:1));
   if(heavy)add('bone',p.crack,p.offset+.013,p.rate*.93);
  }
 }else if(type==='glass-break'||type==='glass-impact'){add('glass',type==='glass-break'?.51:.34);if(type==='glass-break')add('glass',.14,.032,.94);}
 else if(['attack','special','miss','weapon-throw','weapon-use','jump'].includes(type)){
  add('whoosh',type==='special'?.25:type==='miss'?.21:.15,0,Math.min(1.3,p.rate*1.06));
  if(['wittyf0x','ash-flowers','mr-nice-guy'].includes(actor))add('cloth',.08,p.offset);
 }else if(type==='block'){add(material==='metal'?'metal':'wood',.32);add('body',.12,.006);}
 else if(type==='throw'){add('cloth',.16);add('whoosh',.22,.018,p.rate*.92);}
 else if(type==='land'||type==='ko'){
  add(material==='metal'?'metal':'body',event.jump?.14:type==='ko'?.42:.24,0,p.rate*.91);
  if(type==='ko'&&!event.timeout&&material!=='metal')add('wet',.12,.018);
 }else if(type==='eye-pop'){add('slime',.35);add('splash',.14,.014);}
 else if(type==='deletion-cue'){
  const cue=event.cue??'';
  if(/bind|tether|tape|snare|drag/.test(cue))add('cloth',.2);
  else if(/release|sweep|boot/.test(cue))add('whoosh',.23);
  else if(/gut|rupture|burst|splatter/.test(cue)){add('wet',.28);add('splash',.14,.024);}
  else if(/seal|lid-close|latch|captured|stamp|break|drop|topple/.test(cue))add(p.accent==='metal'?'metal':'wood',.28);
 }
 const sum=layers.reduce((n,layer)=>n+layer.gain,0),scale=Math.min(1,.72/Math.max(.01,sum));
 for(const layer of layers)layer.gain*=scale;
 return {layers,actor,material,heavy,contact};
}
/** A bounded, lazy decoded bank. It owns storage only; playback remains entirely
 * synchronous in fight-audio.mjs. Stale work can never schedule a sound source. */
export function createFoleyBufferBank(options={}){
 const assets=new Map((options.assets??FOLEY_ASSETS).map(asset=>[asset.id,asset]));
 const cache=new Map(),pending=new Map(),queue=[],failed=new Set();
 const maxEntries=clamp(Math.floor(finite(options.maxCacheEntries,MAX_FOLEY_CACHE_ENTRIES)),1,MAX_FOLEY_CACHE_ENTRIES);
 const maxBytes=clamp(Math.floor(finite(options.maxCacheBytes,MAX_FOLEY_CACHE_BYTES)),1,MAX_FOLEY_CACHE_BYTES);
 const maxConcurrent=clamp(Math.floor(finite(options.maxConcurrent,MAX_FOLEY_CONCURRENT_LOADS)),1,MAX_FOLEY_CONCURRENT_LOADS);
 const maxQueued=clamp(Math.floor(finite(options.maxQueued,MAX_FOLEY_QUEUED_LOADS)),0,MAX_FOLEY_QUEUED_LOADS);
 let generation=0,loading=0,cacheBytes=0,decoded=0,dropped=0,lastError='';
 function peek(id){const entry=cache.get(id);if(!entry)return null;cache.delete(id);cache.set(id,entry);return entry.buffer;}
 function store(id,buffer,bytes){
  if(bytes>maxBytes)return false;
  while(cache.size&&(cache.size>=maxEntries||cacheBytes+bytes>maxBytes)){
   const old=cache.keys().next().value;cacheBytes-=cache.get(old).bytes;cache.delete(old);
  }
  const old=cache.get(id);if(old){cacheBytes-=old.bytes;cache.delete(id);}
  cache.set(id,{buffer,bytes});cacheBytes+=bytes;return true;
 }
 async function load(job){
  loading++;const controller=typeof AbortController==='function'?new AbortController():null;
  job.controller=controller;const timer=controller?setTimeout(()=>controller.abort(),8000):null;timer?.unref?.();
  let result=null;
  try{
   const context=options.getContext?.();if(!context||typeof context.decodeAudioData!=='function'||!options.fetch)throw new Error('Foley decoder unavailable');
   const url=options.urlForAsset?.(job.asset)??job.asset.path;
   const response=await options.fetch(url,controller?{signal:controller.signal}:undefined);
   if(!response?.ok)throw new Error('Foley HTTP '+(response?.status??'unavailable'));
   const bytes=await response.arrayBuffer();
   if(job.generation!==generation)return;
   if(bytes.byteLength!==job.asset.bytes||bytes.byteLength>160000)throw new Error('Foley encoded byte budget');
   const buffer=await context.decodeAudioData(bytes);
   if(job.generation!==generation||context!==options.getContext?.())return;
   const rate=buffer.sampleRate??context.sampleRate,channels=buffer.numberOfChannels??1;
   const length=buffer.length??Math.round(buffer.duration*rate),size=length*channels*4;
   if(!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>1.2||Math.abs(buffer.duration-job.asset.duration)>.015||channels!==1||!Number.isFinite(size)||size<=0)throw new Error('Foley decoded format budget');
   if(store(job.asset.id,buffer,size)){decoded++;result=buffer;}
   else dropped++;
  }catch(error){if(job.generation===generation){failed.add(job.asset.id);lastError=String(error?.message??'Foley unavailable');}}
  finally{
   if(timer)clearTimeout(timer);loading--;if(pending.get(job.asset.id)===job)pending.delete(job.asset.id);
   job.resolve(result);drain();
  }
 }
 function drain(){while(loading<maxConcurrent&&queue.length){const job=queue.shift();if(job.generation===generation)void load(job);else job.resolve(null);}}
 function request(id){
  const cached=peek(id);if(cached)return Promise.resolve(cached);
  if(pending.has(id))return pending.get(id).promise;
  const asset=assets.get(id);if(!asset||failed.has(id))return Promise.resolve(null);
  if(loading>=maxConcurrent&&queue.length>=maxQueued){dropped++;return Promise.resolve(null);}
  let resolve;const promise=new Promise(yes=>{resolve=yes;});const job={asset,generation,promise,resolve,controller:null};pending.set(id,job);
  if(loading<maxConcurrent)void load(job);else queue.push(job);
  return promise;
 }
 function invalidate(){
  generation++;failed.clear();lastError='';
  for(const job of pending.values())job.controller?.abort();
  for(const job of queue.splice(0))job.resolve(null);
  pending.clear();
 }
 return {peek,request,invalidate,getStats(){return {cached:cache.size,cacheBytes,pending:pending.size,loading,queued:queue.length,decoded,dropped,failed:failed.size,generation,lastError};}};
}
