import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMatch,advanceMatch,performAction,consumeEvents,FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
import {createFightEffects} from '../public/games/system-clash/play/fight-effects.mjs';
import {createFightAudio} from '../public/games/system-clash/play/fight-audio.mjs';

const bank=()=>Object.fromEntries(['delete-brace','delete-suspended','delete-compressed','delete-crumpled','knockdown'].map(name=>[name,{duration:700}]));
const advance=(match,ms)=>{while(ms>0){const dt=Math.min(ms,100);advanceMatch(match,dt,[{},{}]);ms-=dt;}};
function fight(ids=['6-bit','9-bit'],options={}){
  const match=createMatch({mode:'local',fighters:ids.map(id=>({id,name:id})),clips:[bank(),bank()],...options});
  if(match.phase==='countdown')advance(match,1500);
  consumeEvents(match);match.fighters[0].x=500;match.fighters[1].x=650;return match;
}

test('accepted effort events bind all 18 identities and rejected actions create no voice event',()=>{
  for(const id of Object.keys(FIGHTER_STYLES)){
    const match=fight([id,'6-bit']);
    assert.equal(performAction(match,0,'punch'),true);
    const events=consumeEvents(match).filter(event=>event.type==='attack');
    assert.equal(events.length,1);assert.equal(events[0].attackerId,id);assert.equal(events[0].victimId,'6-bit');
    assert.equal(events[0].action,'punch');
    assert.equal(performAction(match,0,'unsupported'),false);
    assert.equal(performAction(match,0,'punch'),false);
    assert.equal(consumeEvents(match).filter(event=>event.type==='attack').length,0);
  }
});

test('air, crouch, weapon and chord efforts use their accepted actions without duplicate special effort',()=>{
  const air=fight(['wittyf0x','cache-back']);
  assert.equal(performAction(air,0,'jump'),true);advance(air,110);consumeEvents(air);
  assert.equal(performAction(air,0,'kick'),true);
  const aerial=consumeEvents(air).find(event=>event.type==='attack');
  assert.equal(aerial.action,'jump-kick');assert.equal(aerial.attackerId,'wittyf0x');assert.equal(aerial.victimId,'cache-back');
  assert.equal(performAction(air,0,'punch'),false);assert.equal(consumeEvents(air).length,0);
  const crouch=fight(['stolz','6-bit']);
  performAction(crouch,0,'punch',{crouch:true});
  assert.equal(consumeEvents(crouch).find(event=>event.type==='attack').action,'uppercut');
  const weapon=fight(['cache-back','9-bit']);
  weapon.fighters[0].weapon={id:'fixture',type:'pulse-driver',name:'Pulse Driver',charges:3};
  performAction(weapon,0,'punch');
  assert.equal(consumeEvents(weapon).find(event=>event.type==='attack').action,'weapon-use');
  const special=fight(['9-bit','6-bit']);performAction(special,0,'power-kick');
  const efforts=consumeEvents(special).filter(event=>['attack','special'].includes(event.type));
  assert.equal(efforts.length,1);assert.equal(efforts[0].type,'special');
});

test('eligible KO announces once for either winner and native deletion beats keep actual participant IDs',()=>{
  for(const winner of [0,1]){
    const ids=winner===0?['9-bit','wittyf0x']:['cache-back','stolz'],match=fight(ids);
    match.fighters[1-winner].hp=1;
    assert.equal(performAction(match,winner,'punch'),true);
    advance(match,500);
    const events=consumeEvents(match),ko=events.find(event=>event.type==='ko'),prompt=events.filter(event=>event.type==='finish-prompt');
    assert.ok(ko);assert.equal(prompt.length,1);
    assert.equal(ko.attacker,winner);assert.equal(ko.target,1-winner);
    assert.equal(ko.attackerId,ids[winner]);assert.equal(ko.victimId,ids[1-winner]);
    assert.equal(prompt[0].attackerId,ids[winner]);assert.equal(prompt[0].victimId,ids[1-winner]);
    advance(match,1100);assert.equal(consumeEvents(match).filter(event=>event.type==='finish-prompt').length,0);
    assert.equal(performAction(match,winner,'deletion'),true);
    advance(match,6500);
    const beats=consumeEvents(match).filter(event=>['deletion','deletion-cue','deletion-impact','throw','land','eye-pop','glass-break'].includes(event.type));
    assert.ok(beats.length>3);
    for(const event of beats){assert.equal(event.attackerId,ids[winner],event.type);assert.equal(event.victimId,ids[1-winner],event.cue??event.type);}
  }
  const unavailable=fight(['9-bit','6-bit'],{clips:[bank(),{}]});unavailable.fighters[1].hp=1;
  performAction(unavailable,0,'punch');advance(unavailable,500);
  const events=consumeEvents(unavailable);assert.ok(events.some(event=>event.type==='ko'));assert.equal(events.filter(event=>event.type==='finish-prompt').length,0);
});

test('effects delegate sound once and carry audio mute, review pause, reduced motion and clear state',async()=>{
  const calls=[],state={audioStarted:false,paused:false};
  const audio={emit:event=>calls.push(['emit',event]),startAudio:async()=>{state.audioStarted=true;return true;},
    setMuted:value=>calls.push(['muted',value]),setPaused:value=>{state.paused=value;calls.push(['paused',value]);},
    setReducedMotion:value=>calls.push(['motion',value]),clear:()=>calls.push(['clear']),getStats:()=>({...state})};
  const effects=createFightEffects({audio});
  assert.equal(await effects.startAudio(),true);
  effects.emit({type:'hit',attackerId:'9-bit',victimId:'6-bit',strength:2});
  assert.equal(calls.filter(([type])=>type==='emit').length,1);
  assert.equal(calls[0][1].victimId,'6-bit');
  effects.setMuted(true);effects.setPaused(true);effects.setReducedMotion(true);
  assert.equal(effects.getStats().audioStarted,true);assert.equal(effects.getStats().audio.paused,true);
  effects.clear();assert.ok(calls.some(([type])=>type==='clear'));
  assert.equal(effects.getStats().particles,0);
});

test('native audio resolves the narrator relative to the current same-origin game URL',async()=>{
  let fetched='';
  const fakeContext={state:'running',sampleRate:22050,destination:{},
    createGain(){return {gain:{value:0},connect(){}};},
    createDynamicsCompressor(){return Object.assign({connect(){}},Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,{value:0}])));},
    createWaveShaper(){return {connect(){}};},
    createBuffer(_channels,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};},
    async decodeAudioData(){return {duration:1};}};
  const audio=createFightAudio({baseUrl:'https://www.barcode-network.com/games/system-clash/play/fight.html',contextFactory:()=>fakeContext,fetch:async url=>{fetched=url;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};}});
  assert.equal(await audio.startAudio(),true);
  assert.equal(fetched,'https://www.barcode-network.com/games/system-clash/play/assets/audio/delete-him-arcade.wav');
});


test('hosted review and visibility states silence production sound while normal play resumes it',()=>{
  const source=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
  const sync=source.match(/function syncAudioPause\(\) \{([\s\S]*?)\n\}/);
  assert.ok(sync,'Production audio pause hook exists');
  const run=new Function('effects','paused','inspectTime','motionTime','document','ready','screenSuspended','windowActive',sync[1]);
  for(const [paused,inspectTime,motionTime,hidden,expected] of [[false,null,null,false,false],[true,null,null,false,true],[false,0,null,false,true],[false,null,0,false,true],[false,null,null,true,true]]){
    let actual;run({setPaused:value=>{actual=value;}},paused,inspectTime,motionTime,{hidden},true,false,true);assert.equal(actual,expected);
  }
  for(const [ready,screenSuspended] of [[false,false],[true,true]]){
    let actual;run({setPaused:value=>{actual=value;}},false,null,null,{hidden:false},ready,screenSuspended,true);assert.equal(actual,true);
  }
});
