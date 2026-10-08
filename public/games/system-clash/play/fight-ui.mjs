export function nextMenuIndex(length,index,key){if(!length)return -1;const step=['ArrowUp','ArrowLeft'].includes(key)?-1:1;return index<0?0:(index+step+length)%length;}
export function pauseMenuPolicy({online=false,seat=0,tournament=false,phase='fight'}={}){return {resume:!online||seat===0,restart:!tournament&&(!online||phase==='over')};}
export async function toggleDisplayMode(doc,element){
 if(doc.fullscreenElement){await doc.exitFullscreen();return 'window';}
 if(element.classList.contains('is-expanded')){element.classList.toggle('is-expanded',false);return 'window';}
 if(element.requestFullscreen){try{await element.requestFullscreen();return 'fullscreen';}catch{}}
 element.classList.toggle('is-expanded',true);return 'expanded';
}
export function bindTouchControls(root,{active=()=>true,onAction,onHold,onTap=()=>{}}){
 const records=[];
 for(const button of root.querySelectorAll('[data-action]')){
  const pointers=new Set(),name=button.dataset.action,key=id=>'touch-'+name+'-'+id;records.push({button,clear(){for(const id of pointers)onAction(name,key(id),false);pointers.clear();button.classList.toggle('is-held',false);}});
  button.addEventListener('pointerdown',event=>{if(!active()||button.disabled||pointers.has(event.pointerId))return;event.preventDefault();pointers.add(event.pointerId);button.setPointerCapture?.(event.pointerId);button.classList.toggle('is-held',true);onAction(name,key(event.pointerId),true);});
  const release=event=>{if(!pointers.delete(event.pointerId))return;onAction(name,key(event.pointerId),false);button.classList.toggle('is-held',pointers.size>0);};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
  button.addEventListener('click',event=>{if(event.detail!==0||!active()||button.disabled)return;onAction(name,key('keyboard'),true);onAction(name,key('keyboard'),false);});
 }
 for(const button of root.querySelectorAll('[data-hold]')){
  const pointers=new Set(),kind=button.dataset.hold;records.push({button,clear(){pointers.clear();button.classList.toggle('is-held',false);button.setAttribute('aria-pressed','false');onHold(kind,false);}});
  const update=()=>{const down=pointers.size>0;button.classList.toggle('is-held',down);button.setAttribute('aria-pressed',String(down));onHold(kind,down);};
  button.addEventListener('pointerdown',event=>{if(!active()||button.disabled)return;event.preventDefault();pointers.add(event.pointerId);button.setPointerCapture?.(event.pointerId);update();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>{if(pointers.delete(event.pointerId))update();});
  button.addEventListener('click',event=>{if(event.detail===0&&active())onTap(kind,button);});
 }
 return {clear(){for(const record of records)record.clear();}};
}
