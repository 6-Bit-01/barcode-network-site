import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,stageById,createStageState,enterStage,damageStageWall} from '../public/games/system-clash/play/fight-stages.mjs';
import {stageAmbientPlan,STAGE_FIXTURE_SIZES} from '../public/games/system-clash/play/stage-ambient.mjs';
import {createTitleFX,titleSignalFrame} from '../public/games/system-clash/play/title-fx.mjs';

test('station is a real wide reciprocal room using the existing hazard and wall owner',()=>{
 const station=STAGES.find(s=>s.id==='interdimensional-station');assert(station);assert.equal(station.width,2560);
 assert.equal(station.walls.left.target,'witty-wasteland');assert.equal(stageById('witty-wasteland').walls.right.target,station.id);
 const state=createStageState('witty-wasteland');for(let i=0;i<4;i++)damageStageWall(state,'right',1.2);
 assert.equal(state.walls.right.broken,true);enterStage(state,station.id,'right');assert.equal(state.walls.left.broken,true);
 assert(station.hazard.warningMs>=1000);assert.equal(state.activation,null);
});
test('all rooms have long changing ambient plans with fixed-sized authored fixtures',()=>{
 for(const room of STAGES){const state=createStageState(room.id);const first=stageAmbientPlan(state);state.clock=17423;const next=stageAmbientPlan(state);
 assert.notDeepEqual(first,next,room.id);assert.deepEqual(first.fixtures,next.fixtures,'Light animation cannot scale furniture');
 assert.deepEqual(stageAmbientPlan(state,{reducedMotion:true}),stageAmbientPlan({...state,clock:0},{reducedMotion:true}));}
 assert(STAGE_FIXTURE_SIZES['radio-studio'].controlHeight>=280,'The booth must read as full-size radio equipment');
});
test('station observers look toward the current fighters and remain outside gameplay collision',()=>{
 const state=createStageState('interdimensional-station');const plan=stageAmbientPlan(state,{fighterPositions:[1600,1800]});
 assert(plan.observers.length>=2);assert(plan.observers.every(n=>n.facing==='right'&&n.y<500&&n.height<160));
 const other=stageAmbientPlan(state,{fighterPositions:[300,400]});assert(other.observers.every(n=>n.facing==='left'));
 assert.equal(state.fighters,undefined);assert.equal(state.activation,null);
});
test('title electricity uses the existing draw clock and reduced motion keeps stable pixels',()=>{
 assert.notDeepEqual(titleSignalFrame(0),titleSignalFrame(4185));assert.deepEqual(titleSignalFrame(4185,{reducedMotion:true}),titleSignalFrame(0,{reducedMotion:true}));
 const calls=[];const ctx=new Proxy({}, {get(o,k){if(k==='createLinearGradient')return ()=>({addColorStop(){}});return o[k]??((...a)=>calls.push([k,...a]));}});
 const canvas={width:0,height:0,clientWidth:1280,clientHeight:720,getContext:()=>ctx};
 const fx=createTitleFX(canvas,{imageFactory:()=>({complete:true,width:1280,height:400})});
 fx.draw(500,{active:true});const count=calls.length;fx.draw(520,{active:false});assert(calls.length>count,'Inactive title clears decoration once');
 const after=calls.length;fx.draw(600,{active:false});assert.equal(calls.length,after,'Hidden title does no recurring rendering');
 fx.draw(700,{active:true,reducedMotion:true});const still=calls.length;fx.draw(1700,{active:true,reducedMotion:true});assert.equal(calls.length,still,'Reduced motion has one stable drawing');
 assert.equal(fx.ownsAnimationLoop,false);
});

test('cold or failed title electricity cannot stop the shared menu/controller clock',()=>{
 for(const complete of [false,true]){
  let draws=0;const bolt={complete,width:0,height:0};const ctx=new Proxy({drawImage(image){if(!image.complete||!image.width)throw new Error('InvalidStateError');draws++;},createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:()=>{}});
  const canvas={clientWidth:1280,clientHeight:720,getContext:()=>ctx};const fx=createTitleFX(canvas,{imageFactory:()=>bolt});
  assert.doesNotThrow(()=>fx.draw(11000,{active:true}));assert.equal(draws,0,'Neither a failed nor delayed image is drawable');
  bolt.complete=true;bolt.width=1280;bolt.height=400;assert.doesNotThrow(()=>fx.draw(11001,{active:true}));assert(draws>0,'The same clock recovers when the image arrives');
 }
});
