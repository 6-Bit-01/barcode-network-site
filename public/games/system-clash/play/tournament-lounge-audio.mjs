/** Small, licensed mechanical cues. No queued playback from old polls/unlocks. */
const COUNTS={join:3,whoosh:3,snap:3,slide:2,call:1,ready:1,champion:1};
export function createLoungeAudio({window:win=globalThis.window,fetch=globalThis.fetch,baseURL=win?.location?.href??import.meta.url,muted=false}={}){
 let context=null,master=null,disposed=false,preparing=null;const buffers=new Map(),last=new Map(),active=new Set(),timers=new Set();
 const soundURL=(type,index)=>new URL(`assets/audio/tournament/${type}-${index+1}.mp3`,baseURL).href;
 async function unlock(){if(disposed)return false;try{if(!context){const Audio=win.AudioContext||win.webkitAudioContext;if(!Audio)return false;context=new Audio();master=context.createGain();master.gain.value=muted?0:.62;master.connect(context.destination);}if(context.state==='suspended')await context.resume();
  if(!preparing){const pending=Object.entries(COUNTS).flatMap(([type,count])=>Array.from({length:count},(_,index)=>({type,index})));preparing=Promise.all([0,1].map(async()=>{while(pending.length&&!disposed){const {type,index}=pending.shift();try{const response=await fetch(soundURL(type,index),{signal:AbortSignal.timeout(6000)});if(!response.ok)continue;const raw=await response.arrayBuffer();if(raw.byteLength>65536)continue;const decoded=await context.decodeAudioData(raw);if(!disposed&&decoded.duration>0&&decoded.duration<=1.9)buffers.set(type+':'+index,decoded);}catch{}}}));}return context.state==='running';}catch{return false;}}
 function play(type,{delay=0,gain=1}={}){
  if(disposed||muted||context?.state!=='running'||!COUNTS[type])return false;
  const count=COUNTS[type],previous=last.get(type),choices=Array.from({length:count},(_,i)=>i).filter(i=>count===1||i!==previous),index=choices[Math.floor(Math.random()*choices.length)],buffer=buffers.get(type+':'+index);
  if(!buffer)return false;last.set(type,index);
  const start=()=>{if(disposed||muted||context.state!=='running'||active.size>=6)return;const source=context.createBufferSource(),level=context.createGain();source.buffer=buffer;level.gain.value=Math.max(0,Math.min(1,gain));source.connect(level);level.connect(master);active.add(source);source.onended=()=>{active.delete(source);source.disconnect();level.disconnect();};source.start();};
  if(delay>0){const timer=win.setTimeout(()=>{timers.delete(timer);start();},Math.min(3,delay)*1000);timers.add(timer);}else start();return true;
 }
 function cancelQueued(){for(const timer of timers)win.clearTimeout(timer);timers.clear();}
 return {unlock,play,cancelQueued,setMuted(value){muted=!!value;if(muted)cancelQueued();if(master)master.gain.value=muted?0:.62;if(muted)for(const source of active)try{source.stop();}catch{}},get muted(){return muted;},get stats(){return {cached:buffers.size,active:active.size};},dispose(){disposed=true;for(const timer of timers)win.clearTimeout(timer);timers.clear();for(const source of active)try{source.stop();}catch{}active.clear();buffers.clear();void context?.close?.();}};
}
