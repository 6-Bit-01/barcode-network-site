import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,advanceMatch,performAction} from '../public/games/system-clash/play/fight-engine.mjs';
const levels=['easy','normal','hard'];
function arena(difficulty,seed,gap=170){
 const match=createMatch({difficulty,seed,start:false,roundTimeMs:0,fighters:[{id:'6-bit'},{id:'9-bit'}],clips:[{'low-kick':{duration:1400,contactMs:700,activeEndMs:770}},{}]});
 match.phase='fight';match.fighters[0].x=500;match.fighters[1].x=500+gap;return match;
}
test('every CPU tier closes its old slow decision window while keeping three distinct speeds',()=>{
 for(let seed=1;seed<=80;seed++){
  const matches=levels.map(level=>arena(level,seed,500));matches.forEach(match=>advanceMatch(match,10));
  assert.ok(matches[0]._cpuDecision<=410,'Easy no longer leaves a 480–680 ms decision gap');
  assert.ok(matches[1]._cpuDecision<=250,'Normal no longer leaves a 230–400 ms decision gap');
  assert.ok(matches[2]._cpuDecision<=135,'Hard no longer leaves a 135–225 ms decision gap');
  assert.ok(matches[0]._cpuDecision>matches[1]._cpuDecision);assert.ok(matches[1]._cpuDecision>matches[2]._cpuDecision);
 }
});
test('CPU never guards a newly visible attack before the shortest human-scale reaction window',()=>{
 for(const level of levels)for(let seed=1;seed<=60;seed++){
  const match=arena(level,seed);match._cpuDecision=1000;performAction(match,0,'low-kick');advanceMatch(match,50);
  match._cpuDecision=0;advanceMatch(match,10);assert.equal(match._cpuControl.block,false,`${level} seed ${seed} read a fresh attack`);
 }
});
test('visible low attacks receive stronger and clearly separated correct defense rates',()=>{
 const correct=levels.map(level=>{
  let defended=0;for(let seed=1;seed<=160;seed++){
   const match=arena(level,seed);match._cpuDecision=1000;performAction(match,0,'low-kick');advanceMatch(match,280);match._cpuDecision=0;advanceMatch(match,10);
   if(match._cpuControl.block&&match._cpuControl.crouch)defended++;
  }return defended;
 });
 assert.ok(correct[0]>32,`Easy defense: ${correct}`);assert.ok(correct[1]>72,`Normal defense: ${correct}`);assert.ok(correct[2]>112,`Hard defense: ${correct}`);
 assert.ok(correct[1]-correct[0]>24,`Easy/Normal overlap: ${correct}`);assert.ok(correct[2]-correct[1]>24,`Normal/Hard overlap: ${correct}`);
});
test('higher CPU tiers recognize a visible close guard and choose throws more reliably',()=>{
 const throws=levels.map(level=>{
  let chosen=0;for(let seed=1;seed<=160;seed++){
   const match=arena(level,seed,120);match._cpuDecision=1000;advanceMatch(match,280,[{block:true},{}]);match._cpuDecision=0;advanceMatch(match,10,[{block:true},{}]);
   if(match.fighters[1].action==='grab')chosen++;
  }return chosen;
 });
 assert.ok(throws[0]>16,`Easy throws: ${throws}`);assert.ok(throws[1]>64,`Normal throws: ${throws}`);assert.ok(throws[2]>112,`Hard throws: ${throws}`);
 assert.ok(throws[0]<throws[1]&&throws[1]<throws[2],`Tactical separation: ${throws}`);
});
test('held player controls do not change the CPU decision until they become visible actions',()=>{
 for(const level of levels)for(let seed=1;seed<=50;seed++){
  const idle=arena(level,seed),held=arena(level,seed);
  advanceMatch(idle,10,[{},{}]);advanceMatch(held,10,[{block:true,crouch:true,move:1},{}]);
  assert.deepEqual(held._cpuControl,idle._cpuControl);assert.equal(held.fighters[1].action,idle.fighters[1].action);assert.equal(held._seed,idle._seed);
 }
});

test('Normal occupies a clear middle challenge between Easy and Hard in the same bounded combat pattern',()=>{
 const damage=levels.map(difficulty=>{
  let total=0;for(let seed=1;seed<=64;seed++){
   const match=createMatch({difficulty,seed,roundTimeMs:0,fighters:[{id:'6-bit'},{id:'9-bit'}]});match.phase='fight';match.fighters[0].x=500;match.fighters[1].x=700;
   for(let ms=0;ms<20000&&match.phase==='fight';ms+=20){
    const player=match.fighters[0],gap=Math.abs(match.fighters[1].x-player.x),beat=ms%900;
    const input={move:gap>150?Math.sign(match.fighters[1].x-player.x):0,block:beat>620,crouch:beat>620&&seed%2===0};
    if(ms%180===0&&gap<230)performAction(match,0,['low-punch','punch','kick','low-kick'][(ms/180+seed)%4],input);
    advanceMatch(match,20,[input,{}]);
   }total+=match.fighters[0].maxHp-match.fighters[0].hp;
  }return total/64;
 });
 assert.ok(damage[0]>30&&damage[0]<55,`Easy challenge: ${damage}`);
 assert.ok(damage[1]>55&&damage[1]<80,`Normal should fill the middle: ${damage}`);
 assert.ok(damage[2]>85,`Hard challenge: ${damage}`);
 assert.ok(damage[1]-damage[0]>15&&damage[2]-damage[1]>15,`Difficulty overlap: ${damage}`);
});
