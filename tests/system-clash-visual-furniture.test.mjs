import test from 'node:test';
import assert from 'node:assert/strict';
import {createStageState,STAGES,startStageWarning} from '../public/games/system-clash/play/fight-stages.mjs';
import {createStageRenderer} from '../public/games/system-clash/play/fight-stage-renderer.mjs';
function surface(){const calls=[],ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];if(String(key).startsWith('create')&&String(key).endsWith('Gradient'))return()=>({addColorStop(){}});return (...args)=>calls.push([key,...args]);}});return {calls,getContext(){return ctx;}};}
const keys=['hazardShutter','hazardBeam','hazardThorns','hazardFeedback','hazardBlast','hazardBarrel','hazardWarning','wallCracks','menuPlate'];
const images=Object.fromEntries(keys.map(key=>[key,{key,width:400,height:300}]));
test('ready stage hazards and weak walls use artwork, with no debug warning rectangles or wall instructions',()=>{
 for(const spec of STAGES){
  const screen=surface(),state=createStageState(spec.id),renderer=createStageRenderer(screen),options={interfaceArt:{images}};
  startStageWarning(state,0);renderer.drawBehind(screen.getContext(),state,null,options);
  assert(screen.calls.some(([key,image])=>key==='drawImage'&&image===images.hazardWarning),spec.id+' warned floor');
  assert(!screen.calls.some(([key])=>key==='strokeRect'),spec.id+' no debug boxes');
  assert(!screen.calls.some(([key,value])=>key==='fillText'&&/WEAK|UPPERCUT|POWER|THROW TO BREAK/i.test(String(value))),spec.id+' no instructions');
  screen.calls.length=0;state.fightClock=state.activation.warningEnd+spec.hazard.impactDelayMs;
  renderer.drawBehind(screen.getContext(),state,null,options);
  const active={shutter:'hazardShutter',beam:'hazardBeam',thorns:'hazardThorns',feedback:'hazardFeedback',amplifier:'hazardFeedback',barrel:'hazardBlast'}[spec.hazard.type];
  assert(screen.calls.some(([key,image])=>key==='drawImage'&&image===images[active]),spec.id+' physical active art');
 }
});
test('weak-wall damage cracks have fixed geometry and gain damage detail rather than resizing',()=>{
 const screen=surface(),state=createStageState('containment'),renderer=createStageRenderer(screen),options={interfaceArt:{images}};
 for(const damage of [0,40,79]){state.walls.left.damage=damage;renderer.drawBehind(screen.getContext(),state,null,options);}
 const calls=screen.calls.filter(([key,image])=>key==='drawImage'&&image===images.wallCracks);
 assert.equal(calls.length,6);
 assert.equal(new Set(calls.map(call=>call.slice(4).join(','))).size,1,'All crack overlays retain one native size');
});

test('physical hazard and crack images keep their source proportions',()=>{
 for(const id of ['radio-studio','sheila-office','witty-wasteland','containment']){
  const screen=surface(),state=createStageState(id),spec=STAGES.find(s=>s.id===id),renderer=createStageRenderer(screen),options={interfaceArt:{images}};
  startStageWarning(state,0);state.fightClock=state.activation.warningEnd+spec.hazard.impactDelayMs;renderer.drawBehind(screen.getContext(),state,null,options);
  for(const call of screen.calls.filter(([key,image])=>key==='drawImage'&&['hazardShutter','hazardFeedback','hazardBlast','wallCracks'].includes(image?.key)))assert(Math.abs(call[4]/call[5]-call[1].width/call[1].height)<.00001,id+' '+call[1].key+' native aspect');
 }
});

test('active pressure and salvage artwork covers every damaged horizontal location at the impact beat',()=>{
 for(const id of ['radio-studio','studio-rat-lair','witty-wasteland']){
  const screen=surface(),state=createStageState(id),spec=STAGES.find(s=>s.id===id),renderer=createStageRenderer(screen),options={interfaceArt:{images}};
  startStageWarning(state,0);state.fightClock=state.activation.warningEnd+spec.hazard.impactDelayMs;renderer.drawBehind(screen.getContext(),state,null,options);
  const active=id==='witty-wasteland'?'hazardBlast':'hazardFeedback',calls=screen.calls.filter(([key,image])=>key==='drawImage'&&image===images[active]);
  for(let x=spec.hazard.zone.left+1;x<spec.hazard.zone.right;x+=25)assert(calls.some(call=>x>=call[2]&&x<=call[2]+call[4]),id+' damages x'+x+' only where its impact art appears');
 }
});
