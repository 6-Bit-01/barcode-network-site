import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOnlineCombatController,makeFightSnapshot,applyFightSnapshot} from '../public/games/system-clash/play/fight-network-state.mjs';
import {createMatch,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
function initialize(){
 const source=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
 const body=source.match(/function initializeOnlineCombat\(\)\{([\s\S]*?)\n\}/)?.[1];assert.ok(body);
 const elements=new Map();let now=0,draws=0;
 const env={onlineBridge:{enabled:true,seat:1,send:()=>true},onlineCombat:null,roundNumber:1,previousTravelViews:null,previousTravelPhase:null,launchParams:new URLSearchParams('matchId=1'),activeRoster:['6-bit','9-bit'],
  art:['6-bit','9-bit'].map(id=>({manifest:{id},clips:{idle:{data:{loop:true},timeline:{duration:1000,entries:[{index:0,start:0,end:250},{index:1,start:250,end:500},{index:2,start:500,end:750},{index:3,start:750,end:1000}]}}}})),
  createOnlineCombatController,applyFightSnapshot,performance:{now:()=>now},startOnlineFight(){},applyOnlinePause(){},ready:true,paused:false,
  match:createMatch({mode:'local',start:false}),performAction(){},dispatchEvents(){},draw:()=>draws++,emitFightEvent(){},clearInput(){},effects:{setPaused(){},clear(){}},
  $:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},onlineLoaded:false};
 new Function('env','with(env){'+body+'}')(env);
 const views=env.match.fighters.map((_,i)=>({...getFighterView(env.match,i),clip:'idle',elapsed:0,nativeElapsed:0,poseIndex:0}));
 env.match.phase='fight';
 const wire=makeFightSnapshot(env.match,views,{roster:env.activeRoster,clipIds:[['idle'],['idle']],seq:1,matchId:1,at:0});assert.ok(wire);
 env.onlineCombat.receive({type:'start',matchId:1,seed:7});
 return {env,wire,setTime:value=>{now=value;},get draws(){return draws;}};
}
test('guest snapshot updates authority once and leaves painting to the animation frame',()=>{
 const h=initialize();h.env.onlineCombat.receive({type:'snapshot',snapshot:h.wire});
 assert.equal(h.env.match.phase,'fight');assert.equal(h.env.match.fighters[0].id,'6-bit');assert.equal(h.draws,0);
});
test('browser provides local animation timing so guest idle poses advance between cloud snapshots',()=>{
 const h=initialize();h.env.onlineCombat.receive({type:'snapshot',snapshot:h.wire});h.setTime(100);
 const view=h.env.onlineCombat.views()[0];assert.equal(view.elapsed,100);assert.equal(view.nativeElapsed,100);
});


test('fight pause control describes automatic network recovery and preserves manual resume',()=>{
 const source=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8'),body=source.match(/function applyOnlinePause\([^)]*\)\{([^\n]+)\}/)?.[1];assert.ok(body);
 const button={textContent:'',disabled:false,setAttribute(){}},env={paused:false,match:{},accumulator:5,onlineBridge:{seat:0},onlineCombat:{pauseReason:'network'},clearInput(){},syncAudioPause(){},draw(){},$:()=>button};
 const apply=new Function('env','value','reason','with(env){'+body+'}');
 apply(env,true,'network');assert.equal(button.textContent,'Reconnecting…');assert.equal(button.disabled,true);assert.equal(env.match.paused,true);
 env.onlineCombat.pauseReason='manual';apply(env,true,'manual');assert.equal(button.textContent,'Resume');assert.equal(button.disabled,false);
 apply(env,false,'manual');assert.equal(button.textContent,'Pause');assert.equal(button.disabled,false);
 env.onlineBridge.seat=1;apply(env,true,'manual');assert.equal(button.textContent,'Waiting for host');assert.equal(button.disabled,true);
});
