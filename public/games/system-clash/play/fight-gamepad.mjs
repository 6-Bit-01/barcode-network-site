/** Pure standard-mapping controller adapter. Time and device snapshots belong to the caller. */
const FACE=[[2,'punch'],[3,'low-punch'],[0,'kick'],[1,'low-kick']];
const MENU=[[0,'confirm'],[1,'back'],[3,'random']];
const ARROWS=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
const fresh=()=>({id:null,connected:false,gated:true,held:new Set(),emitted:new Map(),grab:null,deletion:false,nav:new Map()});
const finite=value=>Number.isFinite(value)?value:0;
function read(pad){
 const buttons=Array.isArray(pad.buttons)?pad.buttons:[];
 const held=new Set();for(let i=0;i<17;i++){const b=buttons[i];if(b&&typeof b==='object'&&(b.pressed===true||(Number.isFinite(b.value)&&b.value>.5)))held.add(i);}
 const axes=Array.isArray(pad.axes)?pad.axes:[];
 const x=finite(axes[0]),y=finite(axes[1]);
 const horizontal=held.has(14)||held.has(15)?Number(held.has(15))-Number(held.has(14)):x>.25?1:x<-.25?-1:0;
 const vertical=held.has(12)||held.has(13)?Number(held.has(13))-Number(held.has(12)):y>.25?1:y<-.25?-1:0;
 return {held,horizontal,vertical,neutral:held.size===0&&horizontal===0&&vertical===0};
}
export function createGamepadInput({seats=[]}={}){
 const indices=[0,1].map(i=>Number.isInteger(seats?.[i])&&seats[i]>=0?seats[i]:null);
 if(indices[0]!==null&&indices[0]===indices[1])indices[1]=null;
 let states=[fresh(),fresh()],context=null;
 const key=(seat,button)=>'pad-'+seat+'-'+button;
 function reset(){states=states.map(s=>({...fresh(),id:s.id,connected:s.connected}));}
 function sample(pads,now,{context:nextContext='fight',active=true}={}){
  const events=[],valid=new Map();let unsupported=0;
  for(const pad of Array.from(pads??[])){
   if(!pad||pad.connected===false||!Number.isInteger(pad.index)||pad.index<0)continue;
   if(pad.mapping!=='standard'){unsupported++;continue;}
   if(!valid.has(pad.index))valid.set(pad.index,pad);
  }
  for(const index of [...valid.keys()].sort((a,b)=>a-b))if(!indices.includes(index)){
   const empty=indices.indexOf(null);if(empty<0)break;indices[empty]=index;
  }
  if(context!==null&&nextContext!==context)reset();context=nextContext;
  if(!active||!Number.isFinite(now))reset();
  const inputs=[];
  const emit=(player,type,action,button)=>events.push({player,type,action,key:key(player,button)});
  const players=indices.map((index,player)=>{
   let s=states[player];const pad=valid.get(index),id=pad?String(pad.id??''):null;
   if(s.connected&&(!pad||s.id!==id)){
    if(active&&Number.isFinite(now)){for(const [button,action]of s.emitted)emit(player,'release',action,button);emit(player,'disconnect','disconnect','disconnect');}
    s=states[player]=fresh();
   }
   if(pad&&!s.connected){s.connected=true;s.id=id;s.gated=true;}
   const input=pad?read(pad):{held:new Set(),horizontal:0,vertical:0,neutral:true};inputs.push(input);
   const allowed=active&&Number.isFinite(now)&&!s.gated;
   const snapshot={connected:!!pad,index,id,move:allowed?input.horizontal:0,crouch:allowed&&input.vertical>0,block:allowed&&input.held.has(7)};
   if(s.gated&&input.neutral&&active&&Number.isFinite(now))s.gated=false;
   return snapshot;
  });
  if(!active||!Number.isFinite(now))return {players,events:[],unsupported};
  for(let player=0;player<2;player++){
   const s=states[player],input=inputs[player],held=input.held;
   if(!s.connected||s.gated){s.held=new Set(held);continue;}
   const press=(button,action,inputSnapshot)=>{emit(player,'press',action,button);if(inputSnapshot)events[events.length-1].inputSnapshot={...inputSnapshot};s.emitted.set(button,action);};
   for(const [button,action]of s.emitted)if(!held.has(button)&&button!=='jump-axis'&&button!=='deletion'){
    emit(player,'release',action,button);s.emitted.delete(button);
   }
   if(s.emitted.has('jump-axis')&&input.vertical>=0){emit(player,'release','jump','jump-axis');s.emitted.delete('jump-axis');}
   const rising=b=>held.has(b)&&!s.held.has(b);
   const pause=rising(9);
   if(held.has(9)){if(pause)press(9,'pause');s.grab=null;s.nav.clear();s.held=new Set(held);continue;}
   if(nextContext==='menu'){
    for(const [button,action]of MENU)if(rising(button))press(button,action);
    const directions=[input.vertical<0,input.vertical>0,input.horizontal<0,input.horizontal>0];
    directions.forEach((down,i)=>{
     const arrow=ARROWS[i];if(!down){s.nav.delete(arrow);return;}
     const deadline=s.nav.get(arrow);if(deadline===undefined||now>=deadline){emit(player,'navigate',arrow,arrow);s.nav.set(arrow,now+(deadline===undefined?350:110));}
    });
   }else{
    if(s.deletion&&![0,4,5].some(b=>held.has(b)))s.deletion=false;
    const deletion=held.has(0)&&held.has(4)&&held.has(5)&&!s.deletion;
    if(deletion){s.grab=null;s.deletion=true;press('deletion','deletion');}
    // Release the synthetic chord only when every constituent has been released.
    if(s.emitted.has('deletion')&&![0,4,5].some(b=>held.has(b))){emit(player,'release','deletion','deletion');s.emitted.delete('deletion');}
    if(held.has(4)||s.deletion)s.grab=null;
    if(!deletion){
     if(input.vertical<0&&!s.emitted.has('jump-axis')&&!s.held.has(12)&&!s.held.has('up'))press('jump-axis','jump');
     for(const [button,action]of FACE)if(rising(button)&&!(button===0&&(held.has(4)||s.deletion)))press(button,action);
     if(rising(5)&&!held.has(4)&&!s.deletion)s.grab={deadline:now+55,inputSnapshot:{crouch:input.vertical>0}};
     if(s.grab&&now>=s.grab.deadline){const inputSnapshot=s.grab.inputSnapshot;s.grab=null;press(5,'grab',inputSnapshot);if(!held.has(5)){emit(player,'release','grab',5);s.emitted.delete(5);}}
    }
   }
   s.held=new Set(held);if(input.vertical<0)s.held.add('up');
  }
  return {players,events,unsupported};
 }
 return {sample,reset,seatIndices:()=>[...indices]};
}
