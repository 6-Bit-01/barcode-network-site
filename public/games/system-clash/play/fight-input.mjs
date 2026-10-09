/** A bounded keyboard chord window. This module owns no clock or DOM listener. */
const BUTTONS=new Set(['punch','low-punch','kick','low-kick']);
const CHORDS=[{buttons:['punch','low-punch'],action:'double-punch'},
  {buttons:['kick','low-kick'],action:'power-kick'}];
const command=entry=>({index:entry.index,action:entry.action,inputSnapshot:{...entry.inputSnapshot}});

export function createAttackInputBuffer(options={}) {
  return {windowMs:Number.isFinite(options.windowMs)&&options.windowMs>=0?options.windowMs:55,
    pending:new Map(),held:new Set()};
}

export function flushAttackInputs(buffer,time) {
  if(!Number.isFinite(time))return [];
  const due=[...buffer.pending.values()].filter(entry=>entry.deadline<=time)
    .sort((a,b)=>a.deadline-b.deadline||a.index-b.index);
  for(const entry of due)buffer.pending.delete(entry.index);
  return due.map(command);
}

export function pressAttackInput(buffer,{index=0,action,key,time,inputSnapshot={},repeat=false}) {
  if(!Number.isFinite(time)||!BUTTONS.has(action)||![0,1].includes(index))return [];
  const keyId=key??index+':'+action;
  // Repeated keydown events cannot create either a chord or another single tap.
  if(repeat||buffer.held.has(keyId))return [];
  buffer.held.add(keyId);
  const output=[];
  // At the exact window boundary the second key still belongs to this chord.
  // Older windows and the other player's due input can be delivered immediately.
  for(const entry of [...buffer.pending.values()].sort((a,b)=>a.deadline-b.deadline)) {
    if(entry.deadline<time||(entry.index!==index&&entry.deadline<=time)) {
      output.push(command(entry));buffer.pending.delete(entry.index);
    }
  }
  const previous=buffer.pending.get(index);
  const next={index,action,inputSnapshot:{...inputSnapshot},at:time,deadline:time+buffer.windowMs};
  if(previous) {
    const chord=CHORDS.find(item=>item.buttons.includes(previous.action)
      &&item.buttons.includes(action)&&previous.action!==action);
    if(chord&&!previous.inputSnapshot.crouch&&!inputSnapshot.crouch
      &&!previous.inputSnapshot.airborne&&!inputSnapshot.airborne) {
      buffer.pending.delete(index);
      output.push({index,action:chord.action,inputSnapshot:{...inputSnapshot}});
      return output;
    }
    // Different families and crouched inputs remain two ordinary commands.
    output.push(command(previous));buffer.pending.delete(index);
  }
  buffer.pending.set(index,next);
  return output;
}

export function releaseAttackInput(buffer,key) {
  buffer.held.delete(key);
  // A fast key-up must not erase a queued ordinary tap.
}

export function clearAttackInputs(buffer) {
  buffer.pending.clear();buffer.held.clear();
}

/** Resolve a circular analog throw into eight arcade directions without inventing extra movement. */
export function resolveJoystickInput(x,y,{deadzone=.22}={}) {
  const empty={x:0,y:0,left:false,right:false,crouch:false,jump:false,direction:'center'};
  if(!Number.isFinite(x)||!Number.isFinite(y))return empty;
  const distance=Math.hypot(x,y),threshold=Number.isFinite(deadzone)?Math.max(0,Math.min(.9,deadzone)):.22;
  if(distance<=threshold)return empty;
  const scale=Math.max(1,distance);x/=scale;y/=scale;
  // A 45-degree diagonal gets a full horizontal and vertical signal together.
  const sector=Math.tan(Math.PI/8),horizontal=Math.abs(x)>=Math.abs(y)*sector,vertical=Math.abs(y)>=Math.abs(x)*sector;
  const left=horizontal&&x<0,right=horizontal&&x>0,crouch=vertical&&y>0,jump=vertical&&y<0;
  const direction=[jump?'up':crouch?'down':'',left?'left':right?'right':''].filter(Boolean).join('-')||'center';
  return {x,y,left,right,crouch,jump,direction};
}