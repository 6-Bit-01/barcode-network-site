// Adrenaline follows resolved road opportunities, never a second clock.
// The road owns accepted pads, expired misses, skill edges and real wrecks.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/game/cache-road-adrenaline.js',
  exports:['BARCODE.CacheRoadAdrenaline'],dependencies:[]});
(function(B) {
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const integer=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
  const number=(n,lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi;
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const MAX_RECEIPTS=128;
  const SETTINGS=Object.freeze({initial:25,charged:35,rush:70,
    good:15,perfect:20,missGrace:1,missBase:12,missStep:6,missMax:24,
    turboCost:10,disruptCost:14,wreckLoss:12});
  const tier=value=>value>=SETTINGS.rush?'rush':value>=SETTINGS.charged?'charged':'cold';
  const idValid=id=>typeof id==='string'&&id.length>0&&id.length<=96;
  function benefits(value=0) {
    const ratio=clamp(finite(value),0,100)/100;
    return {power:1+.30*ratio,recharge:1-.25*ratio,ammo:1-.30*ratio,
      guardMs:250*ratio,trackingMs:300*ratio,footprint:1-.18*ratio};
  }
  function create({value=SETTINGS.initial}={}) {
    return {version:1,value:clamp(finite(value,SETTINGS.initial),0,100),
      chain:0,missStreak:0,receipts:[],lastResult:'start',lastDelta:0,lastAtMs:0,
      stats:{good:0,perfect:0,missed:0,turbos:0,disrupts:0,wrecks:0}};
  }
  function change(state,delta,result,atMs) {
    const before=state.value,oldTier=tier(before);
    state.value=clamp(before+delta,0,100);state.lastDelta=state.value-before;
    state.lastResult=result;state.lastAtMs=Math.max(0,finite(atMs));
    return {accepted:true,value:state.value,delta:state.lastDelta,
      tier:tier(state.value),tierChanged:oldTier!==tier(state.value),result};
  }
  function resolve(state,{id,result,atMs=0}={}) {
    if(state?.version!==1||!idValid(id)||!['good','perfect','miss'].includes(result))
      return {accepted:false,reason:'unavailable'};
    if(state.receipts.some(receipt=>receipt.id===id))return {accepted:false,reason:'resolved'};
    // The authored song has fewer than 128 opportunities. Refuse new receipts
    // if that contract changes rather than silently allowing a replay farm.
    if(state.receipts.length>=MAX_RECEIPTS)return {accepted:false,reason:'receipt-limit'};
    state.receipts.push({id,result});
    if(result==='miss') {
      state.chain=0;state.missStreak++;state.stats.missed++;
      const loss=state.missStreak<=SETTINGS.missGrace?0:
        Math.min(SETTINGS.missMax,SETTINGS.missBase+(state.missStreak-2)*SETTINGS.missStep);
      return change(state,-loss,result,atMs);
    }
    state.chain++;state.missStreak=0;state.stats[result]++;
    return change(state,SETTINGS[result],result,atMs);
  }
  function spend(state,skill,{atMs=0}={}) {
    if(state?.version!==1||!['turbo','disrupt'].includes(skill))return {accepted:false,reason:'unavailable'};
    // The skill owner must first accept the actual input. A cold meter never
    // prevents a skill; only available charge is spent after that acceptance.
    state.stats[skill==='turbo'?'turbos':'disrupts']++;
    return change(state,-SETTINGS[skill==='turbo'?'turboCost':'disruptCost'],skill,atMs);
  }
  function wreck(state,{atMs=0}={}) {
    if(state?.version!==1)return {accepted:false,reason:'unavailable'};
    state.chain=0;state.stats.wrecks++;
    return change(state,-SETTINGS.wreckLoss,'wreck',atMs);
  }
  function pose(state) {
    if(state?.version!==1)return null;
    const value=clamp(finite(state.value),0,100),current=tier(value);
    return {version:1,value,ratio:value/100,tier:current,
      nextThreshold:current==='cold'?SETTINGS.charged:current==='charged'?SETTINGS.rush:100,
      chain:state.chain,missStreak:state.missStreak,lastResult:state.lastResult,
      lastDelta:state.lastDelta,lastAtMs:state.lastAtMs,...benefits(value)};
  }
  function snapshot(state) {return state?.version===1?copy(state):null;}
  function restore(raw) {
    if(!object(raw)||raw.version!==1||!number(raw.value,0,100)||
      !integer(raw.chain,0,MAX_RECEIPTS)||!integer(raw.missStreak,0,MAX_RECEIPTS)||
      !Array.isArray(raw.receipts)||raw.receipts.length>MAX_RECEIPTS||
      !['start','resume','good','perfect','miss','turbo','disrupt','wreck'].includes(raw.lastResult)||
      !number(raw.lastDelta,-100,100)||!number(raw.lastAtMs,0,1e10)||!object(raw.stats)||
      Object.keys(create().stats).some(key=>!integer(raw.stats[key],0,1e6)))return null;
    const ids=new Set(),counts={good:0,perfect:0,missed:0};
    for(const receipt of raw.receipts) {
      if(!object(receipt)||!idValid(receipt.id)||ids.has(receipt.id)||
        !['good','perfect','miss'].includes(receipt.result))return null;
      ids.add(receipt.id);counts[receipt.result==='miss'?'missed':receipt.result]++;
    }
    if(Object.keys(counts).some(key=>counts[key]!==raw.stats[key])||
      raw.chain>counts.good+counts.perfect||raw.missStreak>counts.missed||
      (raw.chain>0&&raw.missStreak>0))return null;
    const state=copy(raw);
    // A checkpoint restarts the road's presentation clock. Keep earned charge
    // and anti-duplicate receipts, without reviving an old delta indefinitely.
    state.lastResult='resume';state.lastDelta=0;state.lastAtMs=0;
    return state;
  }
  B.CacheRoadAdrenaline={create,resolve,spend,wreck,pose,snapshot,restore,benefits,
    settings:SETTINGS,limits:Object.freeze({receipts:MAX_RECEIPTS})};
})(window.BARCODE=window.BARCODE||{});
