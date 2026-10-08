import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {FIGHTER_STAT_PROFILES,fightStatScalars} from '../public/games/system-clash/play/fight-stats.mjs';
import {makeFightSnapshot,readFightSnapshot,applyFightSnapshot} from '../public/games/system-clash/play/fight-network-state.mjs';
const roster=Object.keys(FIGHTER_STAT_PROFILES),options={roster,clipIds:[['idle'],['idle']],matchId:1};
const scene=id=>createMatch({mode:'local',start:false,fighters:[{id},{id:'9-bit'}]});
const publish=match=>makeFightSnapshot(match,match.fighters.map((_,i)=>getFighterView(match,i)),{...options,seq:1,at:0});
for(const id of roster)test(`${id}: host health survives the public snapshot and guest hydration`,()=>{
 const host=scene(id),wire=publish(host);assert.ok(wire,'Every balanced fighter must publish fresh health');
 const expected=fightStatScalars(id).maxHealth;assert.equal(wire.state.fighters[0].hp,expected);assert.equal(wire.state.fighters[0].maxHp,expected);
 const local=scene(id),guest=applyFightSnapshot(local,wire);assert.equal(guest.fighters[0].maxHp,expected);assert.equal(guest.fighters[0].hp,expected);assert.equal(guest.fighters[0]._clips,local.fighters[0]._clips);assert.equal(guest.fighters[0]._style,local.fighters[0]._style);assert.equal(guest.fighters[0]._statProfile,local.fighters[0]._statProfile);assert.equal(guest.fighters[0]._statScalars,local.fighters[0]._statScalars);
 const damaged=structuredClone(wire);damaged.state.fighters[0].hp=expected/2;assert.ok(readFightSnapshot(damaged,options));
 for(const mutate of [f=>f.hp=-1,f=>f.hp=expected+1,f=>f.maxHp=expected+1,f=>f.maxHp=Infinity]){const bad=structuredClone(wire);mutate(bad.state.fighters[0]);assert.equal(readFightSnapshot(bad,options),null,'Health remains bounded by the selected canonical profile');}
});
test('hidden balance and local simulation fields never become public wire fields',()=>{
 const wire=publish(scene('papa-oak'));assert.ok(wire);const text=JSON.stringify(wire);for(const key of ['_statProfile','_statScalars','_style','_clips'])assert.ok(!text.includes(key));
 for(const key of ['_statProfile','_statScalars']){const bad=structuredClone(wire);bad.views[0][key]={health:10};assert.equal(readFightSnapshot(bad,options),null);}
});
