/** Dedicated CC0 menu cues. This tiny bank loads after a user unlock and never replays an old event. */
export const UI_SOUND_ASSETS=Object.freeze([{"id":"select","path":"assets/audio/ui/ui-select.wav","bytes":1860,"sha256":"f30f745aaa7bb05825100a4ae2045feeb2028667e88c3274006193caa5c81c46","duration":0.040408,"sampleRate":22050,"channels":1,"sourceFile":"Audio/select_002.ogg"},{"id":"move","path":"assets/audio/ui/ui-move.wav","bytes":436,"sha256":"dbfef49f99f520a039aceb6b85d265c0584f69c0f8001d808bdd309100888711","duration":0.008118,"sampleRate":22050,"channels":1,"sourceFile":"Audio/tick_001.ogg"},{"id":"confirm","path":"assets/audio/ui/ui-confirm.wav","bytes":12704,"sha256":"03cdd0f8d6731379ca48db9734ed39096f49ab0df229e5a25f375f179c73a126","duration":0.286304,"sampleRate":22050,"channels":1,"sourceFile":"Audio/confirmation_001.ogg"},{"id":"back","path":"assets/audio/ui/ui-back.wav","bytes":4046,"sha256":"a099a674629de4cf059b5c59b9c73bff76934249bda515a4b3c03a8ed691f22a","duration":0.089977,"sampleRate":22050,"channels":1,"sourceFile":"Audio/back_003.ogg"},{"id":"options","path":"assets/audio/ui/ui-options.wav","bytes":5858,"sha256":"111c9f9c52324cf6652bf0778448053a71119a01f6788bdd4f9701c4618f963b","duration":0.131066,"sampleRate":22050,"channels":1,"sourceFile":"Audio/switch_006.ogg"},{"id":"invalid-code","path":"assets/audio/ui/ui-invalid-code.wav","bytes":4680,"sha256":"cf94b685daa68be6869994e5d9f54131008cde51f575c6800b38129e73e21b6d","duration":0.104354,"sampleRate":22050,"channels":1,"sourceFile":"Audio/error_004.ogg"},{"id":"unlock","path":"assets/audio/ui/ui-unlock.wav","bytes":9094,"sha256":"436b4096ce633551b426781fbd7aa6ecd123facd57d5210c566ad18f5e3909e3","duration":0.204444,"sampleRate":22050,"channels":1,"sourceFile":"Audio/maximize_003.ogg"},{"id":"start","path":"assets/audio/ui/ui-start.wav","bytes":21298,"sha256":"4df1fbf10ff932d590d9c82633f4d3c89c8280e8b363f2af123f795bbef4a7ba","duration":0.481179,"sampleRate":22050,"channels":1,"sourceFile":"Audio/confirmation_004.ogg"}].map(a=>Object.freeze(a)));
export const MAX_UI_CACHE_BYTES=768000;
const byId=new Map(UI_SOUND_ASSETS.map(a=>[a.id,a]));
export function planUISound(type){
 const id=typeof type==='string'&&type.startsWith('ui-')?type.slice(3):null;
 if(!byId.has(id))return null;
 const patterns={select:[[440,660,.075,.12,0]],move:[[680,720,.035,.085,0]],confirm:[[392,392,.09,.12,0],[523,523,.12,.11,.055],[784,784,.16,.1,.12]],back:[[610,392,.085,.12,0]],options:[[480,540,.055,.11,0],[540,480,.045,.09,.065]],'invalid-code':[[220,196,.12,.12,0],[174,174,.09,.1,.1]],unlock:[[523,523,.13,.11,0],[659,659,.13,.1,.07],[784,1046,.22,.1,.14]],start:[[392,392,.11,.12,0],[523,523,.13,.11,.055],[784,1046,.24,.1,.13]]};
 return {type,uiSound:true,uiAsset:id,contact:'interface',priority:1,announcer:false,characterLine:null,voices:[],layers:patterns[id].map(([frequency,end,duration,gain,delay])=>({kind:'tone',frequency,end,duration,gain,delay,waveform:'triangle'}))};
}
export function createUIBufferBank({getContext,fetch,urlForAsset}={}){
 const cache=new Map(),pending=new Map(),queue=[];let loading=0,cacheBytes=0,failed=0;
 function pump(){while(loading<2&&queue.length){const {asset,resolve}=queue.shift();loading++;
 (async()=>{let timer;try{
  const context=getContext?.();if(!context||!fetch)return null;
  const controller=typeof AbortController==='function'?new AbortController():null;
  if(controller)timer=setTimeout(()=>controller.abort(),6000);
  const response=await fetch(urlForAsset(asset),controller?{signal:controller.signal}:undefined);if(!response.ok)throw new Error('UI sound HTTP');
  const raw=await response.arrayBuffer();if(raw.byteLength!==asset.bytes||raw.byteLength>65536)throw new Error('UI sound bytes');
  const buffer=await context.decodeAudioData(raw),bytes=(buffer.length??Math.ceil(buffer.duration*context.sampleRate))*(buffer.numberOfChannels??1)*4;
  if(!(buffer.duration>0&&buffer.duration<1)||(buffer.numberOfChannels??1)!==1||cacheBytes+bytes>MAX_UI_CACHE_BYTES)throw new Error('UI sound decode budget');
  cache.set(asset.id,buffer);cacheBytes+=bytes;return buffer;
 }catch{failed++;return null;}finally{if(timer)clearTimeout(timer);}})().then(resolve).finally(()=>{loading--;pending.delete(asset.id);pump();});
 }}
 function request(id){const asset=byId.get(id);if(!asset)return Promise.resolve(null);if(cache.has(id))return Promise.resolve(cache.get(id));if(pending.has(id))return pending.get(id);const promise=new Promise(resolve=>queue.push({asset,resolve}));pending.set(id,promise);pump();return promise;}
 return {peek:id=>cache.get(id)??null,request,prepare:()=>Promise.all(UI_SOUND_ASSETS.map(a=>request(a.id))),getStats:()=>({cached:cache.size,cacheBytes,pending:pending.size,loading,queued:queue.length,failed})};
}
