import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createAttackInputBuffer,pressAttackInput,releaseAttackInput,flushAttackInputs} from '../public/games/system-clash/play/fight-input.mjs';
const url=new URL('../public/games/system-clash/play/fight-gamepad.mjs',import.meta.url);
const mod=existsSync(url)?await import(url):{};
const make=(options)=>{assert.equal(typeof mod.createGamepadInput,'function','gamepad adapter must exist');return mod.createGamepadInput(options);};
const pad=(index=0,held=[],axes=[0,0],id='DualSense')=>({index,id,mapping:'standard',connected:true,axes,buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))});
const ready=(options)=>{const a=make(options);a.sample([pad(0),pad(3)],0);return a;};
const presses=r=>r.events.filter(e=>e.type==='press').map(e=>e.action);
test('approved face buttons, jump ordering and hold snapshots',()=>{
 const a=ready();let r=a.sample([pad(0,[2,3,0,1,7,12])],1);
 assert.deepEqual(presses(r),['jump','punch','low-punch','kick','low-kick']);assert.equal(r.players[0].block,true);
 assert.deepEqual(presses(a.sample([pad(0,[2,3,0,1,7,12])],90)),[]);
 r=a.sample([pad()],91);assert.equal(r.events.filter(e=>e.type==='release').length,5);assert.equal(r.players[0].block,false);
});
test('movement deadzone, Dpad priority, crouch and finite values',()=>{
 const a=ready();assert.equal(a.sample([pad(0,[],[.25,0])],1).players[0].move,0);
 assert.equal(a.sample([pad(0,[],[.26,0])],2).players[0].move,1);
 let r=a.sample([pad(0,[14,13],[1,-1])],3);assert.equal(r.players[0].move,-1);assert.equal(r.players[0].crouch,true);assert.deepEqual(presses(r),[]);
 r=a.sample([pad(0,[14,15])],4);assert.equal(r.players[0].move,0);
 assert.equal(a.sample([pad(0,[],[NaN,Infinity])],5).players[0].move,0);
});
test('both players feed ordinary 55ms attack chords through existing buffer',()=>{
 const a=ready();const b=createAttackInputBuffer();let commands=[];
 for(const [now,pads] of [[10,[pad(0,[2]),pad(3,[0])]], [40,[pad(0,[2,3]),pad(3,[0,1])]]]){
  const r=a.sample(pads,now);for(const e of r.events){if(e.type==='press')commands.push(...pressAttackInput(b,{index:e.player,action:e.action,key:e.key,time:now,inputSnapshot:r.players[e.player]}));if(e.type==='release')releaseAttackInput(b,e.key);}
 }
 assert.deepEqual(commands.map(c=>[c.index,c.action]),[[0,'double-punch'],[1,'power-kick']]);assert.deepEqual(flushAttackInputs(b,100),[]);
});
test('stable seats survive unplug, replacement and held connection neutral gates',()=>{
 const a=make();let r=a.sample([null,pad(3,[2]),null,pad(0)],0);assert.deepEqual(a.seatIndices(),[0,3]);assert.deepEqual(presses(r),[]);
 a.sample([pad(0),pad(3)],1);r=a.sample([pad(3,[2])],2);assert.equal(r.players[0].connected,false);assert.equal(r.players[1].index,3);assert.deepEqual(r.events.filter(e=>e.type==='disconnect').map(e=>e.player),[0]);
 r=a.sample([pad(0,[2],[],'replacement'),pad(3)],3);assert.deepEqual(presses(r),[]);a.sample([pad(0,[],[],'replacement'),pad(3)],4);
 assert.deepEqual(presses(a.sample([pad(0,[2],[],'replacement'),pad(3)],5)),['punch']);
 r=a.sample([pad(0,[2],[],'different'),pad(3)],6);assert.equal(r.events.some(e=>e.type==='disconnect'),true);assert.deepEqual(presses(r),[]);
 const pinned=make({seats:[3,8]});pinned.sample([pad(0),pad(3)],0);assert.deepEqual(pinned.seatIndices(),[3,8]);
});
test('Deletion suppresses modified kick and grab and cannot repeat until all chord members release',()=>{
 const a=ready();assert.deepEqual(presses(a.sample([pad(0,[4,5])],1)),[]);
 assert.deepEqual(presses(a.sample([pad(0,[4,5,0])],2)),['deletion']);
 assert.deepEqual(presses(a.sample([pad(0,[4,5,0])],80)),[]);
 a.sample([pad(0,[5])],81);assert.deepEqual(presses(a.sample([pad(0,[4,5,0])],82)),[]);
 a.sample([pad()],83);assert.deepEqual(presses(a.sample([pad(0,[4,5,0])],84)),['deletion']);
});
test('R1-first Deletion cancels deferred grab while standalone quick tap survives release',()=>{
 const a=ready();assert.deepEqual(presses(a.sample([pad(0,[5])],1)),[]);
 assert.deepEqual(presses(a.sample([pad(0,[5,4,0])],40)),['deletion']);assert.deepEqual(presses(a.sample([pad(0,[5,4,0])],60)),[]);
 a.sample([pad()],61);a.sample([pad(0,[5])],100);a.sample([pad()],110);
 const r=a.sample([pad()],155);assert.deepEqual(r.events.map(e=>[e.type,e.action]),[['press','grab'],['release','grab']]);
});
test('standalone grab fires once at 55ms and releases with stable key',()=>{
 const a=ready();a.sample([pad(0,[5])],10);assert.deepEqual(presses(a.sample([pad(0,[5])],64)),[]);
 let r=a.sample([pad(0,[5])],65);assert.deepEqual(presses(r),['grab']);assert.equal(r.events[0].key,'pad-0-5');
 assert.deepEqual(presses(a.sample([pad(0,[5])],200)),[]);assert.equal(a.sample([pad()],201).events[0].type,'release');
});
test('menu controls and directional repeat are bounded and context changes neutral gate',()=>{
 const a=make();a.sample([pad()],0,{context:'menu'});
 let r=a.sample([pad(0,[0,1,3,15])],1,{context:'menu'});assert.deepEqual(presses(r),['confirm','back','random']);assert.equal(r.events.find(e=>e.type==='navigate').action,'ArrowRight');
 assert.equal(a.sample([pad(0,[15])],350,{context:'menu'}).events.some(e=>e.type==='navigate'),false);
 assert.equal(a.sample([pad(0,[15])],351,{context:'menu'}).events.filter(e=>e.type==='navigate').length,1);
 assert.equal(a.sample([pad(0,[15])],9000,{context:'menu'}).events.filter(e=>e.type==='navigate').length,1);
 assert.deepEqual(presses(a.sample([pad(0,[0])],9001,{context:'fight'})),[]);a.sample([pad()],9002);assert.deepEqual(presses(a.sample([pad(0,[0])],9003)),['kick']);
});
test('pause takes priority and inactive/reset polling neutral gates every held input',()=>{
 const a=ready();assert.deepEqual(presses(a.sample([pad(0,[2,9])],1)),['pause']);
 assert.deepEqual(a.sample([pad(0,[2])],2,{active:false}).events,[]);assert.deepEqual(presses(a.sample([pad(0,[2])],3)),[]);
 a.sample([pad()],4);assert.deepEqual(presses(a.sample([pad(0,[2])],5)),['punch']);a.reset();assert.deepEqual(presses(a.sample([pad(0,[2])],6)),[]);
});
test('holes malformed and unsupported devices remain bounded and harmless',()=>{
 const a=make({seats:[-1,NaN,9]});let r=a.sample([null,{}, {...pad(4),mapping:'vendor'},pad(2),pad(5),pad(8)],NaN);
 assert.equal(r.unsupported,1);assert.equal(r.players.length,2);assert.deepEqual(a.seatIndices(),[2,5]);assert.equal(r.events.length,0);
 r=a.sample(null,1);assert.equal(r.players.every(p=>p.move===0&&!p.block&&!p.crouch),true);
});
test('Deletion release waits until all three physical members release',()=>{
 const a=ready();a.sample([pad(0,[4,5,0])],1);
 assert.deepEqual(a.sample([pad(0,[4,5,0])],2).events,[]);
 assert.deepEqual(a.sample([pad(0,[5])],3).events,[]);
 assert.deepEqual(a.sample([pad()],4).events.map(e=>[e.type,e.action]),[['release','deletion']]);
});
test('held Options suppresses subsequent combat edges until released',()=>{
 const a=ready();a.sample([pad(0,[9])],1);assert.deepEqual(presses(a.sample([pad(0,[9,2])],2)),[]);
});
test('stick jump releases before a new jump and reset drops delayed quick taps',()=>{
 const a=ready();assert.deepEqual(presses(a.sample([pad(0,[],[0,-1])],1)),['jump']);
 assert.deepEqual(presses(a.sample([pad(0,[],[0,-1])],2)),[]);assert.equal(a.sample([pad()],3).events[0].type,'release');
 assert.deepEqual(presses(a.sample([pad(0,[],[0,-1])],4)),['jump']);
 a.sample([pad()],5);a.sample([pad(0,[5])],6);a.reset();a.sample([pad()],7);assert.deepEqual(presses(a.sample([pad()],100)),[]);
});
test('deferred R1 quick taps preserve crouch at the press edge',()=>{
 const a=ready();a.sample([pad(0,[13,5])],1);a.sample([pad()],2);
 let r=a.sample([pad()],56);assert.deepEqual(r.events.find(e=>e.type==='press'&&e.action==='grab').inputSnapshot,{crouch:true});
 a.sample([pad(0,[5])],100);a.sample([pad(0,[13])],101);
 r=a.sample([pad(0,[13])],155);assert.deepEqual(r.events.find(e=>e.type==='press'&&e.action==='grab').inputSnapshot,{crouch:false});
});
