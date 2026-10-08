import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,advanceMatch,performAction,consumeEvents,FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';

function advance(match,ms){while(ms>0){const dt=Math.min(ms,100);advanceMatch(match,dt,[{},{}]);ms-=dt;}}
test('jump and jump landing retain the moving fighter identity for all main fighters and player slots',()=>{
 for(const id of Object.keys(FIGHTER_STYLES))for(const index of [0,1]){
  const other=id==='6-bit'?'wittyf0x':'6-bit',ids=index===0?[id,other]:[other,id];
  const match=createMatch({mode:'local',fighters:ids.map(id=>({id,name:id})),clips:ids.map(()=>({jump:{duration:700}}))});
  if(match.phase==='countdown')advance(match,1500);
  consumeEvents(match);
  assert.equal(performAction(match,index,'jump'),true);
  const start=consumeEvents(match).filter(event=>event.type==='jump');
  assert.equal(start.length,1);assert.equal(start[0].attacker,index);assert.equal(start[0].attackerId,id);
  advance(match,900);
  const land=consumeEvents(match).filter(event=>event.type==='land'&&event.jump);
  assert.equal(land.length,1);assert.equal(land[0].target,index);assert.equal(land[0].victimId,id);
 }
});
