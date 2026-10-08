import test from 'node:test';
import assert from 'node:assert/strict';
import {createFightEffects} from '../public/games/system-clash/play/fight-effects.mjs';
const audio=()=>({emit(){},setPaused(){},setReducedMotion(){},clear(){},getStats(){return {};}});
const effect=event=>{const fx=createFightEffects({seed:81,audio:audio()});fx.emit(event);return fx;};
test('landed attack shake grows with actual impact strength and stays bounded',()=>{
 const light=effect({type:'hit',strength:.9}),heavy=effect({type:'hit',strength:2}),extreme=effect({type:'hit',strength:1e6});
 assert(light.getStats().shake>=7,'A landed light attack has a visible seven-pixel impulse');
 assert(heavy.getStats().shake>=14,'A heavy landed attack has a stronger fourteen-pixel impulse');
 assert(heavy.getStats().shake>light.getStats().shake);
 assert(extreme.getStats().shake<=24,'Impact amplitude has a hard ceiling');
 for(let i=0;i<20;i++){extreme.update(16);assert(Math.abs(extreme.camera.x)<=24);assert(Math.abs(extreme.camera.y)<=12);}
 extreme.update(1600);assert.equal(extreme.getStats().shake,0);assert.deepEqual(extreme.camera,{x:0,y:0});
});
test('brutal deletion contact is heavier than a heavy attack without flash escalation',()=>{
 const hit=effect({type:'hit',strength:2}),rupture=effect({type:'deletion-impact',cue:'oak-rip',strength:3.2,x:640,y:300});
 assert(rupture.getStats().shake>=22);assert(rupture.getStats().shake>hit.getStats().shake);assert(rupture.getStats().shake<=24);assert(rupture.flash<=.12);
 const blocked=effect({type:'block',strength:2});assert(blocked.getStats().shake<hit.getStats().shake);
 const whiff=effect({type:'attack',strength:2});assert.equal(whiff.getStats().shake,0);
});
test('peaceful Doof cues never shake, flash or produce brutal particles',()=>{
 const fx=effect({type:'deletion-impact',cue:'hug-contact',peaceful:true,strength:3.2});fx.update(16);
 assert.equal(fx.getStats().shake,0);assert.deepEqual(fx.camera,{x:0,y:0});assert.equal(fx.flash,0);assert.equal(fx.getStats().bloodParticles,0);assert.equal(fx.getStats().chunks,0);
});
test('pause, reduced motion and clear discard camera impulse before drawing again',()=>{
 for(const reset of [fx=>fx.setPaused(true),fx=>fx.setReducedMotion(true),fx=>fx.clear()]){
  const fx=effect({type:'hit',strength:2});fx.update(16);assert.notEqual(fx.camera.x,0);reset(fx);assert.deepEqual(fx.camera,{x:0,y:0});assert.equal(fx.getStats().shake,0);assert.equal(fx.flash,0);
 }
 const fx=createFightEffects({audio:audio(),reducedMotion:true});fx.emit({type:'deletion-impact',strength:2});fx.update(16);assert.deepEqual(fx.camera,{x:0,y:0});assert.equal(fx.getStats().shake,0);
 fx.setReducedMotion(false);fx.setPaused(true);fx.emit({type:'hit',strength:2});fx.update(16);assert.deepEqual(fx.camera,{x:0,y:0});
 fx.setPaused(false);fx.emit({type:'hit',strength:2});assert(fx.getStats().shake>=14);
});
