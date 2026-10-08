import test from 'node:test';
import assert from 'node:assert/strict';
let ui={};try{ui=await import('../public/games/system-clash/play/fight-ui.mjs');}catch{}
class Button{
 constructor(data){this.dataset=data;this.handlers={};this.disabled=false;this.classes=new Set();this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn)} setPointerCapture(){} setAttribute(key,value){this[key]=value}
 emit(type,values={}){const event={pointerId:1,detail:1,preventDefault(){},...values};for(const fn of this.handlers[type]??[])fn(event)}
}
const pad=(buttons)=>({querySelectorAll:selector=>buttons.filter(b=>selector==='[data-action]'?b.dataset.action:b.dataset.hold)});
test('pause navigation wraps available choices and keeps guest authority',()=>{
 assert.equal(typeof ui.nextMenuIndex,'function');assert.equal(ui.nextMenuIndex(3,2,'ArrowDown'),0);assert.equal(ui.nextMenuIndex(3,0,'ArrowUp'),2);
 assert.deepEqual(ui.pauseMenuPolicy({online:true,seat:1,phase:'fight'}),{resume:false,restart:false});assert.deepEqual(ui.pauseMenuPolicy({online:false,tournament:true,phase:'fight'}),{resume:true,restart:false});
});
test('multi-touch holds release only after final pointer and cancel clears controls',()=>{
 assert.equal(typeof ui.bindTouchControls,'function');const button=new Button({hold:'crouch'}),states=[];
 const binding=ui.bindTouchControls(pad([button]),{active:()=>true,onHold:(kind,down)=>states.push([kind,down]),onAction(){}});
 button.emit('pointerdown',{pointerId:10});button.emit('pointerdown',{pointerId:11});button.emit('pointerup',{pointerId:10});assert.deepEqual(states.at(-1),['crouch',true]);button.emit('pointercancel',{pointerId:11});assert.deepEqual(states.at(-1),['crouch',false]);
 button.emit('pointerdown',{pointerId:12});binding.clear();assert.equal(button.classes.has('is-held'),false);assert.deepEqual(states.at(-1),['crouch',false]);
});
test('touch actions fire on press, preserve chords, and suppress delayed duplicate clicks',()=>{
 assert.equal(typeof ui.bindTouchControls,'function');const hp=new Button({action:'punch'}),lp=new Button({action:'low-punch'}),grab=new Button({action:'grab'}),events=[];
 ui.bindTouchControls(pad([hp,lp,grab]),{active:()=>true,onHold(){},onAction:(...args)=>events.push(args)});
 hp.emit('pointerdown',{pointerId:1});lp.emit('pointerdown',{pointerId:2});grab.emit('pointerdown',{pointerId:3});assert.equal(events.filter(e=>e[2]).length,3);
 grab.emit('pointerup',{pointerId:3});grab.emit('click');assert.equal(events.filter(e=>e[0]==='grab'&&e[2]).length,1);
 hp.emit('pointerup');lp.emit('lostpointercapture',{pointerId:2});assert.equal(events.filter(e=>!e[2]).length,3);
 grab.emit('click',{detail:0});assert.equal(events.filter(e=>e[0]==='grab'&&e[2]).length,2);
});
test('fullscreen toggles native mode, supports rejection, and offers reversible expansion',async()=>{
 assert.equal(typeof ui.toggleDisplayMode,'function');const classes=new Set(),element={classList:{contains:k=>classes.has(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)}};
 const doc={fullscreenElement:null,async exitFullscreen(){this.fullscreenElement=null;}};element.requestFullscreen=async()=>{doc.fullscreenElement=element;};
 assert.equal(await ui.toggleDisplayMode(doc,element),'fullscreen');assert.equal(await ui.toggleDisplayMode(doc,element),'window');
 element.requestFullscreen=async()=>{throw Error('unsupported')};assert.equal(await ui.toggleDisplayMode(doc,element),'expanded');assert.equal(await ui.toggleDisplayMode(doc,element),'window');
});

// Execute the real toolbar listener: an inline guide underneath the arena is
// unreachable when the mobile landscape arena intentionally disables scrolling.
test('toolbar Controls opens the pause guide before a fight, during play, and when paused',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
 const listener=source.split('\n').find(line=>line.startsWith("$('demo-controls')?.addEventListener"));assert(listener);
 for(const [phase,alreadyPaused] of [['ready',false],['fight',false],['fight',true]]){
  const buttons={},elements=new Map(),element=id=>elements.get(id)??(elements.set(id,{hidden:true,expanded:'false',focused:false,addEventListener(type,fn){buttons[id]=fn;},setAttribute(k,v){this[k]=v;},focus(){this.focused=true;}}),elements.get(id));
  const env={$:element,document:{body:{classList:{toggle(){return true;}}}},ready:true,paused:alreadyPaused,match:{phase},clearInput(){},syncPauseMenu(){},togglePause(){env.paused=!env.paused;}};
  runInNewContext(listener,env);buttons['demo-controls']();
  assert.equal(element('pause-guide').hidden,false,phase+' guide is in the modal');assert.equal(element('pause-controls')['aria-expanded'],'true');assert.equal(env.paused,true);assert.equal(element('pause-controls').focused,true);
 }
});

test('a superseded fighter load stops before fetching and decoding the next art bank',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
 const boot=source.slice(source.indexOf('async function boot()'),source.indexOf("$('fighter-one').addEventListener('change'"));
 const phases=['loadFightArt','loadArcadeArt','loadDeletionArt','loadWeaponArt','loadFighterPortraits'];
 for(let supersededAt=0;supersededAt<4;supersededAt++){
  const calls=[],elements=new Map(),env={loadRevision:0,motionPresentationEpoch:0,interfaceArtPending:null,loadInterfaceArt:async()=>({images:{}}),clearInput(){},effects:{clear(){}},URL,location:{href:'https://example.com/fight.html'},window:{},$:(id)=>elements.get(id)??(elements.set(id,{value:'6-bit',classList:{remove(){},add(){}}}),elements.get(id))};
  for(const [index,phase] of phases.entries())env[phase]=async()=>{calls.push(phase);if(index===supersededAt)env.loadRevision=2;return phase==='loadFightArt'?[{}]:{};};
  runInNewContext(boot,env);await env.boot();assert.deepEqual(calls,phases.slice(0,supersededAt+1),'cancel after '+phases[supersededAt]);
 }
});
