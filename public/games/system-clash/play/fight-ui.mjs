import {resolveJoystickInput} from './fight-input.mjs';
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
 for(const stick of root.querySelectorAll('[data-joystick]')){
  let pointer=null,state=resolveJoystickInput(0,0),travel=0;const keys=new Set(),names=['left','right','crouch'];
  const apply=next=>{
   for(const kind of names)if(state[kind]!==next[kind])onHold(kind,next[kind]);
   if(next.jump&&!state.jump){const key='touch-joystick-jump';onAction('jump',key,true);onAction('jump',key,false);}
   state=next;stick.classList.toggle('is-held',next.direction!=='center');stick.setAttribute('data-direction',next.direction);
   stick.style.setProperty('--joystick-x',next.x===0?'0px':(next.x*travel).toFixed(2)+'px');stick.style.setProperty('--joystick-y',next.y===0?'0px':(next.y*travel).toFixed(2)+'px');
  };
  const clear=()=>{const id=pointer;pointer=null;keys.clear();apply(resolveJoystickInput(0,0));if(id!==null&&stick.hasPointerCapture?.(id)){try{stick.releasePointerCapture(id);}catch{}}};
  records.push({button:stick,clear});
  const readPointer=event=>{const rect=stick.getBoundingClientRect(),radius=Math.min(rect.width,rect.height)/2;travel=radius*.58;return resolveJoystickInput((event.clientX-rect.left-rect.width/2)/radius,(event.clientY-rect.top-rect.height/2)/radius);};
  stick.addEventListener('pointerdown',event=>{if(!active()||stick.disabled||pointer!==null||event.button!==undefined&&event.button!==0)return;event.preventDefault();keys.clear();pointer=event.pointerId;try{stick.setPointerCapture?.(pointer);}catch{}apply(readPointer(event));});
  stick.addEventListener('pointermove',event=>{if(event.pointerId!==pointer)return;event.preventDefault();if(!active()){clear();return;}apply(readPointer(event));});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,event=>{if(event.pointerId===pointer)clear();});
  const keyDirection={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowUp:'up',w:'up',ArrowDown:'down',s:'down'};
  const readKeys=()=>{const directions=new Set([...keys].map(key=>keyDirection[key]));travel=Math.min(stick.getBoundingClientRect().width,stick.getBoundingClientRect().height)*.29;apply(resolveJoystickInput(Number(directions.has('right'))-Number(directions.has('left')),Number(directions.has('down'))-Number(directions.has('up'))));};
  stick.addEventListener('keydown',event=>{const key=event.key?.length===1?event.key.toLowerCase():event.key;if(!keyDirection[key])return;event.preventDefault();event.stopPropagation();if(!active()||pointer!==null||event.repeat)return;keys.add(key);readKeys();});
  stick.addEventListener('keyup',event=>{const key=event.key?.length===1?event.key.toLowerCase():event.key;if(!keyDirection[key]||!keys.delete(key))return;event.preventDefault();event.stopPropagation();readKeys();});
  stick.addEventListener('blur',()=>{if(keys.size)clear();});
 }
 return {clear(){for(const record of records)record.clear();}};
}
