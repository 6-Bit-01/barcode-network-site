import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFightAudio} from '../public/games/system-clash/play/fight-audio.mjs';
import * as flow from '../public/games/system-clash/play/demo-flow.mjs';
const source=()=>readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');

test('controller start enters the match immediately even if browser audio remains suspended',async()=>{
  const body=source().match(/(?:async )?function start\(\) \{([\s\S]*?)\n\}/)?.[1];assert.ok(body);
  let starts=0,resets=0,focus=0;
  const run=new Function('ready','effects','reset','canvas',body);
  run(true,{startAudio:()=>{starts++;return new Promise(()=>{});}},value=>{assert.equal(value,true);resets++;},{focus:()=>focus++});
  assert.equal(starts,1);assert.equal(resets,1);assert.equal(focus,1);
});

test('a later user gesture retries audio resume while an earlier controller start is pending',async()=>{
  let resumes=0,unlock;
  const waiting=new Promise(resolve=>{unlock=resolve;});
  const ctx={state:'suspended',sampleRate:22050,destination:{},
    resume(){resumes++;if(resumes===2){this.state='running';unlock();}return waiting;},
    createGain(){return {gain:{value:0},connect(){}};},
    createDynamicsCompressor(){return Object.assign({connect(){}},Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,{value:0}])));},
    createWaveShaper(){return {connect(){}};},
    createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}};
  const audio=createFightAudio({contextFactory:()=>ctx,fetch:false});
  const first=audio.startAudio(),second=audio.startAudio();
  try{assert.equal(resumes,2);}finally{ctx.state='running';unlock();}
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
});

test('controller seat routing survives menu, arena and back without changing fighter/settings query',()=>{
  assert.equal(typeof flow.controllerSeatsFromURL,'function');assert.equal(typeof flow.withControllerSeats,'function');
  const url=flow.withControllerSeats('https://barcode.example/index.html?screen=select&p1=9-bit&p2=6-bit&mode=local&sound=0&motion=1',[3,0]);
  assert.deepEqual(flow.controllerSeatsFromURL(url),[3,0]);
  for(const [key,value]of Object.entries({screen:'select',p1:'9-bit',p2:'6-bit',mode:'local',sound:'0',motion:'1'}))assert.equal(url.searchParams.get(key),value);
  assert.deepEqual(flow.controllerSeatsFromURL('https://barcode.example/?pad1=0&pad2=0'),[0,null]);
  assert.deepEqual(flow.controllerSeatsFromURL('https://barcode.example/?pad1=-1&pad2=1.5'),[null,null]);
  assert.deepEqual(flow.controllerSeatsFromURL(flow.withControllerSeats(url,[null,0])),[null,0]);
});

test('both fighters merge live controller directions and guards with existing keyboard controls',()=>{
  const body=source().match(/function controls\(\) \{([\s\S]*?)\n\}/)?.[1];assert.ok(body);
  const run=new Function('held','virtual','latched','tapMove','tapUntil','performance','gamepadPlayers','match',body);
  const result=run(new Set(['KeyD','ArrowRight']),new Set(),new Set(),0,0,{now:()=>100},[
    {connected:true,move:-1,crouch:true,block:true},{connected:true,move:0,crouch:false,block:true}],{mode:'local'});
  assert.deepEqual(result,[{move:0,crouch:true,block:true},{move:1,crouch:false,block:true}]);
});

const {createGamepadInput}=await import('../public/games/system-clash/play/fight-gamepad.mjs');
const {createAttackInputBuffer,pressAttackInput,flushAttackInputs,releaseAttackInput,clearAttackInputs}=await import('../public/games/system-clash/play/fight-input.mjs');
const {createDemoSelection,beginDemoSelection,confirmDemoFighter,backDemoSelection,navigateDemoFighter}=await import('../public/games/system-clash/play/demo-flow.mjs');
const fightSource=source();
const menuSource=readFileSync(new URL('../public/games/system-clash/play/demo.mjs',import.meta.url),'utf8');
function controller(index=0,buttons=[],axes=[0,0]){return {index,id:'DualSense-'+index,connected:true,mapping:'standard',buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0})),axes};}
function sourceFunction(source,name,env){const body=source.match(new RegExp('function '+name+'\\(now\\)\\s*\\{([\\s\\S]*?)\\n\\}'));assert.ok(body,'source function '+name+' exists');return new Function('env','with(env){return function(now){'+body[1]+'}}')(env);}
function arenaHarness(mode='local',phase='fight'){
 const calls=[],elements=new Map(),env={ready:true,paused:false,inspectTime:null,motionTime:null,windowActive:true,match:{mode,phase},gamepadPlayers:[],controllerLabel:'',gamepads:createGamepadInput(),attackInputs:createAttackInputBuffer(),attackButtons:new Set(['punch','low-punch','kick','low-kick']),document:{hidden:false,body:{classList:{contains:()=>false}}},navigator:{getGamepads:()=>env.pads},pads:[],releaseAttackInput};
 env.$=id=>{if(!elements.has(id))elements.set(id,{textContent:'',click:()=>calls.push({action:id})});return elements.get(id);};
 env.controls=()=>env.gamepadPlayers;
 env.action=(index,action,inputSnapshot)=>calls.push({index,action,inputSnapshot});
 env.queueAttack=(index,action,key)=>{calls.push(...pressAttackInput(env.attackInputs,{index,action,key,time:env.now,inputSnapshot:env.controls()[index]}));};
 env.clearInput=()=>{clearAttackInputs(env.attackInputs);env.gamepads.reset();env.gamepadPlayers=[];};
 env.togglePause=()=>{env.paused=!env.paused;env.clearInput();calls.push({action:'pause'});};
 env.start=()=>{env.match.phase='fight';env.clearInput();calls.push({action:'start'});};
 env.handlePauseAction=name=>{if(['confirm','back','pause'].includes(name))env.togglePause();};
 const poll=sourceFunction(fightSource,'pollGamepads',env);
 return {env,calls,tick(now,pads){env.now=now;env.pads=pads;poll(now);},flush(now){calls.push(...flushAttackInputs(env.attackInputs,now));}};
}
test('arena cancels buffered kick for Cross-first and R1+Cross-first Deletion without throw leakage',()=>{
 for(const before of [[0],[0,5]]){
  const h=arenaHarness();h.tick(0,[controller()]);h.tick(10,[controller(0,before)]);h.tick(40,[controller(0,[0,4,5])]);h.flush(100);
  assert.deepEqual(h.calls.map(c=>c.action),['deletion']);assert.equal(h.env.attackInputs.pending.size,0);
 }
});
test('arena preserves Down+R1 quick tap direction after both buttons release',()=>{
 const h=arenaHarness();h.tick(0,[controller()]);h.tick(10,[controller(0,[5,13])]);h.tick(20,[controller()]);h.tick(65,[controller()]);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'grab');assert.equal(h.calls[0].inputSnapshot.crouch,true);
});
test('arena pauses and discards both players queued inputs on controller disconnect',()=>{
 const h=arenaHarness();h.tick(0,[controller(),controller(1)]);h.tick(10,[controller(0,[2]),controller(1,[0])]);h.tick(20,[null,controller(1,[0])]);h.flush(100);
 assert.equal(h.env.paused,true);assert.deepEqual(h.calls.map(c=>c.action),['pause']);
 h.tick(30,[controller(0,[0]),controller(1)]);assert.equal(h.env.paused,true);assert.deepEqual(h.env.gamepads.seatIndices(),[0,1]);
});
test('arena CPU controls are isolated and pause/start/confirm never become attacks',()=>{
 const h=arenaHarness('cpu','ready');h.tick(0,[controller(),controller(1)]);h.tick(10,[controller(0,[0]),controller(1,[0])]);h.tick(20,[controller(0,[0]),controller(1)]);h.flush(100);
 assert.deepEqual(h.calls.map(c=>c.action),['start']);h.tick(110,[controller(),controller(1)]);h.tick(120,[controller(0,[9,0]),controller(1,[2])]);h.flush(200);
 assert.equal(h.env.paused,true);assert.deepEqual(h.calls.map(c=>c.action),['start','pause']);
 h.tick(210,[controller(),controller(1)]);h.tick(220,[controller(0,[0]),controller(1)]);h.tick(230,[controller(0,[0]),controller(1)]);h.flush(300);
 assert.equal(h.env.paused,false);assert.deepEqual(h.calls.map(c=>c.action),['start','pause','pause']);
});
function selectionHarness(mode='local'){
 const calls=[],elements=new Map(),env={state:beginDemoSelection(createDemoSelection([{id:'6-bit'},{id:'9-bit'},{id:'cache-back'}]),mode),gamepads:createGamepadInput(),windowActive:true,controllerLabel:'',document:{hidden:false,activeElement:null},navigator:{getGamepads:()=>env.pads},pads:[],navigateDemoFighter};
 env.$=id=>{if(!elements.has(id))elements.set(id,{disabled:false,open:false,textContent:'',focus(){env.document.activeElement=this;},click:()=>calls.push(id)});return elements.get(id);};
 env.render=()=>{};env.focusSelection=()=>{};
 env.confirm=()=>{env.gamepads.reset();env.state=confirmDemoFighter(env.state);calls.push('confirm');};
 env.back=()=>{env.gamepads.reset();env.state=backDemoSelection(env.state);calls.push('back');};
 env.closeControls=()=>{env.gamepads.reset();env.$('controls-dialog').open=false;calls.push('close');};
 const poll=sourceFunction(menuSource,'pollMenuGamepads',env);
 return {env,calls,tick(now,pads){env.pads=pads;poll(now);}};
}
test('selection requires independent player confirmation and ignores the other controller',()=>{
 const h=selectionHarness();h.tick(0,[controller(),controller(1)]);h.tick(10,[controller(0,[0]),controller(1,[0])]);assert.deepEqual(h.calls,['confirm']);assert.equal(h.env.state.activePlayer,1);
 h.tick(20,[controller(),controller(1,[0])]);h.tick(30,[controller(),controller(1)]);h.tick(40,[controller(0,[0]),controller(1,[15])]);assert.equal(h.calls.length,1);assert.equal(h.env.state.picks[1],'cache-back');
 h.tick(50,[controller(),controller(1)]);h.tick(60,[controller(),controller(1,[0])]);assert.equal(h.env.state.screen,'ready');assert.deepEqual(h.calls,['confirm','confirm']);
});
test('one-controller local selection chooses both fighters but held confirm cannot skip a screen',()=>{
 const h=selectionHarness();h.tick(0,[controller()]);h.tick(10,[controller(0,[0])]);h.tick(20,[controller(0,[0])]);assert.equal(h.env.state.screen,'select');assert.deepEqual(h.calls,['confirm']);
 h.tick(30,[controller()]);h.tick(40,[controller(0,[0])]);assert.equal(h.env.state.screen,'ready');h.tick(50,[controller(0,[0])]);assert.deepEqual(h.calls,['confirm','confirm']);
});
test('controller dialog consumes confirm/back without changing fighter state or dispatching underlying UI',()=>{
 const h=selectionHarness('cpu');h.tick(0,[controller()]);h.env.$('controls-dialog').open=true;const before=h.env.state;
 h.tick(10,[controller(0,[0,1])]);assert.equal(h.env.state,before);assert.deepEqual(h.calls,['close']);h.tick(20,[controller(0,[0])]);assert.deepEqual(h.calls,['close']);
});

test('CPU opponent cannot be moved by P2 controller holds during the finish phase',()=>{
 const body=source().match(/function controls\(\) \{([\s\S]*?)\n\}/)?.[1];assert.ok(body);
 const run=new Function('held','virtual','latched','tapMove','tapUntil','performance','gamepadPlayers','match',body);
 const result=run(new Set(),new Set(),new Set(),0,0,{now:()=>100},[{move:0,crouch:false,block:false},{connected:true,move:1,crouch:true,block:true}],{mode:'cpu',phase:'finish'});
 assert.deepEqual(result[1],{move:0,crouch:false,block:false});
});
