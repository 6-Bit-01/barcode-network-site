/** Compare confirmed snapshots; hydration and stale polls are silent. */
export function createLoungeTracker(){
 let previous=null;
 const visible=e=>!['withdrawn','rejected'].includes(e.status);
 return {reset(){previous=null;},update(event){
  if(!event?.code||!Array.isArray(event.entrants)||!Array.isArray(event.bouts))return [];
  const next={code:event.code,revision:event.revision,entrants:event.entrants.filter(visible).map(e=>({id:e.id,ready:e.ready})),bouts:event.bouts.map(b=>({id:b.id,round:b.round,p1:b.p1,p2:b.p2})),currentBoutId:event.currentBoutId,championId:event.championId};
  if(!previous||previous.code!==next.code){previous=next;return [];}
  if(Number.isFinite(next.revision)&&Number.isFinite(previous.revision)&&next.revision<previous.revision)return [];
  const changes=[],oldEntrants=new Map(previous.entrants.map(e=>[e.id,e]));
  for(const e of next.entrants){if(!oldEntrants.has(e.id))changes.push({type:'join',entrantId:e.id});else if(e.ready&&!oldEntrants.get(e.id).ready)changes.push({type:'ready',entrantId:e.id});}
  const oldBouts=new Set(previous.bouts.map(b=>b.id)),oldRounds=new Set(previous.bouts.map(b=>b.round));
  for(const b of next.bouts)if(!oldBouts.has(b.id))for(const [slot,entrantId]of[b.p1,b.p2].entries())if(entrantId)changes.push({type:oldRounds.size?'advance':'draw',entrantId,boutId:b.id,slot,round:b.round});
  if(next.currentBoutId&&next.currentBoutId!==previous.currentBoutId)changes.push({type:'call',boutId:next.currentBoutId});
  if(next.championId&&next.championId!==previous.championId)changes.push({type:'champion',entrantId:next.championId});
  previous=next;return changes;
 }};
}
/** Moving clones never alter the real nodes or authoritative bracket order. */
export function animateLoungeChanges(changes,{document,window,audio,reducedMotion=false}={}){
 const find=(id,selector)=>[...document.querySelectorAll(selector)].find(n=>n.dataset.entrantId===id);
 const movers=changes.filter(c=>['draw','advance'].includes(c.type));
 const disposables=[],timers=[];let disposed=false;
 const later=(fn,ms)=>{timers.push(window.setTimeout(()=>{if(!disposed)fn();},ms));};
 for(const [i,c]of changes.filter(c=>c.type==='join').entries()){
  const row=find(c.entrantId,'#entrant-list [data-entrant-id]');if(!reducedMotion)row?.animate?.([{transform:'translateY(-22px)',opacity:0},{transform:'translateY(3px)',opacity:1},{transform:'translateY(0)',opacity:1}],{duration:380,delay:i*100,easing:'ease-out'});
  audio?.play('join',{delay:i*.1});
 }
 for(const [i,c]of movers.entries()){
  const target=[...document.querySelectorAll('[data-bout-id] [data-entrant-id]')].find(n=>n.closest('[data-bout-id]')?.dataset.boutId===c.boutId&&n.dataset.entrantId===c.entrantId);
  const origins=[...document.querySelectorAll('[data-bout-id] [data-entrant-id]')].filter(n=>n.dataset.entrantId===c.entrantId&&n!==target),source=(c.type==='advance'?origins.at(-1):null)||find(c.entrantId,'#entrant-list [data-entrant-id]');
  const delay=i*85,duration=520;
  if(target&&source&&!reducedMotion){const from=source.getBoundingClientRect(),to=target.getBoundingClientRect();
   if(from.width>0&&to.width>0&&to.left>=0&&to.right<=window.innerWidth&&to.top>=0&&to.bottom<=window.innerHeight){
    const clone=source.cloneNode(true);clone.removeAttribute('id');clone.querySelectorAll('button').forEach(n=>n.remove());clone.className='lounge-flying-brick';clone.setAttribute('aria-hidden','true');Object.assign(clone.style,{left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px'});document.body.append(clone);disposables.push(clone);
    const anim=clone.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${(to.left-from.left)*.55}px,${(to.top-from.top)*.55-38}px) scale(.94)`,opacity:1},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:.85}],{delay,duration,easing:'cubic-bezier(.25,.6,.2,1)',fill:'both'});anim.finished.then(()=>clone.remove(),()=>clone.remove());
   }
   later(()=>target.animate?.([{filter:'brightness(2)'},{filter:'brightness(1)'}],{duration:270}),delay+duration);
  }
  audio?.play(c.type==='advance'?'slide':'whoosh',{delay:delay/1000,gain:.68});audio?.play('snap',{delay:(delay+duration)/1000,gain:.76});
 }
 for(const c of changes.filter(c=>['ready','call','champion'].includes(c.type)))audio?.play(c.type,{delay:movers.length?Math.min(1.9,movers.length*.085+.6):0});
 return ()=>{disposed=true;audio?.cancelQueued?.();for(const t of timers)window.clearTimeout(t);for(const n of disposables)n.remove();};
}
