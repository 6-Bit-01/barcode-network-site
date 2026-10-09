import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const moduleURL=new URL('../public/games/system-clash/play/fight-stats.mjs',import.meta.url);
async function stats(){assert.ok(existsSync(moduleURL),'The approved hidden stat module is required');return import(moduleURL.href);}
const roster=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/fight-roster.json',import.meta.url),'utf8')).fighters.filter(f=>f.enabled).map(f=>f.id);

test('Every current main fighter receives exactly the same 24-point four-stat budget',async()=>{
 const {FIGHT_STAT_KEYS,FIGHT_STAT_BUDGET,FIGHTER_STAT_PROFILES}=await stats();assert.deepEqual(FIGHT_STAT_KEYS,['health','speed','power','technique']);assert.equal(FIGHT_STAT_BUDGET,24);assert.equal(roster.length,18);assert.deepEqual(Object.keys(FIGHTER_STAT_PROFILES).sort(),roster.slice().sort());
 for(const profile of Object.values(FIGHTER_STAT_PROFILES)){assert.deepEqual(Object.keys(profile).sort(),['health','power','speed','technique']);assert.equal(Object.values(profile).reduce((sum,value)=>sum+value,0),24);assert.ok(Object.values(profile).every(value=>Number.isInteger(value)&&value>=1&&value<=10));assert.equal('defense'in profile,false);assert.equal('reach'in profile,false);}
});

test('An attempted stat mutation cannot change a subsequent match profile or fallback',async()=>{
 const {FIGHT_STAT_KEYS,FIGHTER_STAT_PROFILES,BASELINE_FIGHT_STATS,fightStatProfile}=await stats();assert.ok(Object.isFrozen(FIGHT_STAT_KEYS)&&Object.isFrozen(FIGHTER_STAT_PROFILES)&&Object.isFrozen(BASELINE_FIGHT_STATS));
 for(const id of roster){const profile=fightStatProfile(id);assert.strictEqual(profile,FIGHTER_STAT_PROFILES[id]);assert.ok(Object.isFrozen(profile));const original=profile.health;assert.throws(()=>{profile.health=1;},TypeError);assert.equal(fightStatProfile(id).health,original);}
 assert.throws(()=>{FIGHTER_STAT_PROFILES['6-bit']={health:1};},TypeError);assert.throws(()=>{BASELINE_FIGHT_STATS.power=10;},TypeError);
});

test('Unknown or prototype-like IDs receive the same frozen neutral profile',async()=>{
 const {BASELINE_FIGHT_STATS,fightStatProfile}=await stats();assert.deepEqual(BASELINE_FIGHT_STATS,{health:6,speed:6,power:6,technique:6});for(const id of ['missing','__proto__','constructor','toString','',undefined,null,{},42])assert.strictEqual(fightStatProfile(id),BASELINE_FIGHT_STATS);
});

test('Six is neutral for health, movement, power and the existing technique windows',async()=>{
 const {fightStatScalars}=await stats();const expected={maxHealth:100,speedScale:1,powerScale:1,inputBufferScale:1,recoveryTimeScale:1,combinationWindowScale:1};assert.deepEqual(fightStatScalars({health:6,speed:6,power:6,technique:6}),expected);assert.deepEqual(fightStatScalars('unknown'),expected);assert.deepEqual(fightStatScalars(),expected);
});

test('Scalar endpoints and malformed caller profiles remain inside the approved modest limits',async()=>{
 const {fightStatScalars}=await stats();assert.deepEqual(fightStatScalars({health:1,speed:1,power:1,technique:1}),{maxHealth:68,speedScale:.85,powerScale:.85,inputBufferScale:.9,recoveryTimeScale:1.08,combinationWindowScale:.9});assert.deepEqual(fightStatScalars({health:10,speed:10,power:10,technique:10}),{maxHealth:132,speedScale:1.15,powerScale:1.15,inputBufferScale:1.1,recoveryTimeScale:.92,combinationWindowScale:1.1});assert.deepEqual(fightStatScalars({health:-100,speed:100,power:Infinity,technique:NaN}),{maxHealth:68,speedScale:1.15,powerScale:1,inputBufferScale:1,recoveryTimeScale:1,combinationWindowScale:1});assert.deepEqual(fightStatScalars({health:'10',speed:null,power:undefined,technique:'8'}),{maxHealth:100,speedScale:1,powerScale:1,inputBufferScale:1,recoveryTimeScale:1,combinationWindowScale:1});
 for(const value of [-1e6,1,2.5,6,9.5,10,1e6,NaN,Infinity]){const out=fightStatScalars({health:value,speed:value,power:value,technique:value});assert.ok(out.maxHealth>=68&&out.maxHealth<=132);assert.ok(out.speedScale>=.85&&out.speedScale<=1.15);assert.ok(out.powerScale>=.85&&out.powerScale<=1.15);assert.ok(out.inputBufferScale>=.9&&out.inputBufferScale<=1.1);assert.ok(out.recoveryTimeScale>=.92&&out.recoveryTimeScale<=1.08);assert.ok(out.combinationWindowScale>=.9&&out.combinationWindowScale<=1.1);}
});

test('Technique changes only buffer, recovery and combination timing, never health or damage power',async()=>{
 const {fightStatScalars}=await stats();const low=fightStatScalars({health:6,speed:6,power:6,technique:1}),high=fightStatScalars({health:6,speed:6,power:6,technique:10});for(const value of [low,high]){assert.equal(value.maxHealth,100);assert.equal(value.speedScale,1);assert.equal(value.powerScale,1);}assert.ok(high.inputBufferScale>low.inputBufferScale);assert.ok(high.combinationWindowScale>low.combinationWindowScale);assert.ok(high.recoveryTimeScale<low.recoveryTimeScale);
});

test('Current builds trade durability, mobility, force and timing rather than receiving free extra strength',async()=>{
 const {fightStatScalars}=await stats();assert.ok(fightStatScalars('papa-oak').maxHealth>fightStatScalars('doofnoobler').maxHealth);assert.ok(fightStatScalars('9-bit').powerScale>fightStatScalars('cache-back').powerScale);assert.ok(fightStatScalars('wittyf0x').speedScale>fightStatScalars('papa-oak').speedScale);assert.ok(fightStatScalars('cache-back').inputBufferScale>fightStatScalars('9-bit').inputBufferScale);
});

test('Derived scalars are immutable and leave caller-owned profile data unchanged',async()=>{
 const {fightStatScalars}=await stats();const profile={health:8,speed:4,power:7,technique:5},before={...profile},out=fightStatScalars(profile);assert.deepEqual(profile,before);assert.ok(Object.isFrozen(out));assert.throws(()=>{out.maxHealth=1000;},TypeError);assert.equal(profile.health,8);assert.deepEqual(Object.keys(out).sort(),['combinationWindowScale','inputBufferScale','maxHealth','powerScale','recoveryTimeScale','speedScale']);
});
