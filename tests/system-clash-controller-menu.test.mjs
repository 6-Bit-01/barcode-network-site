import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createGamepadInput} from '../public/games/system-clash/play/fight-gamepad.mjs';
const helperURL=new URL('../public/games/system-clash/play/fight-menu-controller.mjs',import.meta.url);
const helper=existsSync(helperURL)?await import(helperURL):{};
function api(name){assert.equal(typeof helper[name],'function',name+' must provide the real controller-menu integration helper');return helper[name];}
const pad=(index=0,held=[],axes=[0,0],id='DualSense')=>({index,id,connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))});
const menu={context:'menu'};
const nav=result=>result.events.filter(e=>e.type==='navigate').map(e=>e.action);
const presses=result=>result.events.filter(e=>e.type==='press').map(e=>e.action);

test('menu reclaims stale URL slots for a newly indexed live controller',()=>{
 const input=createGamepadInput({menuSeatRecovery:true,seats:[4,8]});const first=input.sample([pad(2)],0,menu);
 assert.equal(first.players[0].connected,true);assert.equal(first.players[0].index,2);
 assert.deepEqual(presses(input.sample([pad(2,[0])],1,menu)),['confirm']);
 assert.deepEqual(input.seatIndices(),[2,8]);
});
test('fight keeps pinned seat identities and never promotes another player on disconnect',()=>{
 const input=createGamepadInput({menuSeatRecovery:true,seats:[4,8]});const result=input.sample([pad(2),pad(8)],0);
 assert.deepEqual(input.seatIndices(),[4,8]);assert.equal(result.players[0].connected,false);assert.equal(result.players[1].index,8);
});
test('menu replacement at a different index releases the old same-id input and gates held confirm',()=>{
 const input=createGamepadInput({menuSeatRecovery:true,seats:[0,1]});input.sample([pad(0),pad(1)],0,menu);input.sample([pad(0,[0]),pad(1)],1,menu);
 const replaced=input.sample([pad(1),pad(9,[0])],2,menu);
 assert.deepEqual(input.seatIndices(),[9,1]);assert.deepEqual(presses(replaced),[]);
 assert.deepEqual(replaced.events.filter(e=>e.player===0).map(e=>[e.type,e.action]),[['release','confirm'],['disconnect','disconnect']]);
 input.sample([pad(1),pad(9)],3,menu);assert.deepEqual(presses(input.sample([pad(1),pad(9,[0])],4,menu)),['confirm']);
});
test('connected menu seats retain their player ownership even when another device appears',()=>{
 const input=createGamepadInput({menuSeatRecovery:true,seats:[5,2]});input.sample([pad(0),pad(2),pad(5)],0,menu);
 assert.deepEqual(input.seatIndices(),[5,2]);assert.deepEqual(presses(input.sample([pad(2,[0]),pad(5,[1])],1,menu)),['back','confirm']);
});
test('first discovery and screen reset consume held confirm until neutral release',()=>{
 const input=createGamepadInput({menuSeatRecovery:true});assert.deepEqual(presses(input.sample([pad(3,[0])],0,menu)),[]);
 assert.deepEqual(presses(input.sample([pad(3,[0])],1000,menu)),[]);input.sample([pad(3)],1001,menu);
 assert.deepEqual(presses(input.sample([pad(3,[0])],1002,menu)),['confirm']);input.reset();assert.deepEqual(presses(input.sample([pad(3,[0])],1003,menu)),[]);
});
test('menu diagonal navigation moves focus once per poll and repeats without catching up',()=>{
 const input=createGamepadInput({menuSeatRecovery:true});input.sample([pad()],0,menu);
 assert.equal(nav(input.sample([pad(0,[],[1,-1])],1,menu)).length,1);
 assert.deepEqual(nav(input.sample([pad(0,[],[.98,-1])],200,menu)),[]);
 assert.equal(nav(input.sample([pad(0,[],[1,-.98])],351,menu)).length,1);
 assert.equal(nav(input.sample([pad(0,[],[1,-1])],9000,menu)).length,1);
 assert.deepEqual(nav(input.sample([pad(0,[],[1,-1])],9001,menu)),[]);
});
test('menu stick hysteresis rejects idle drift and does not restart repeats at the deadzone edge',()=>{
 const input=createGamepadInput({menuSeatRecovery:true});input.sample([pad(0,[],[.3,0])],0,menu);
 assert.deepEqual(nav(input.sample([pad(0,[],[.3,0])],1,menu)),[]);
 assert.deepEqual(nav(input.sample([pad(0,[],[.4,0])],2,menu)),['ArrowRight']);
 assert.deepEqual(nav(input.sample([pad(0,[],[.29,0])],100,menu)),[]);
 assert.deepEqual(nav(input.sample([pad(0,[],[.36,0])],101,menu)),[]);
 assert.deepEqual(nav(input.sample([pad(0,[],[.29,0])],352,menu)),['ArrowRight']);
 input.sample([pad(0,[],[.24,0])],353,menu);assert.deepEqual(nav(input.sample([pad(0,[],[-.4,0])],354,menu)),['ArrowLeft']);
});
test('physical Dpad wins over both stick axes in menus',()=>{
 const input=createGamepadInput({menuSeatRecovery:true});input.sample([pad()],0,menu);
 assert.deepEqual(nav(input.sample([pad(0,[15],[0,-1])],1,menu)),['ArrowRight']);
 input.sample([pad()],2,menu);assert.deepEqual(nav(input.sample([pad(0,[12],[1,0])],3,menu)),['ArrowUp']);
});
test('hidden or unfocused polling cannot queue menu actions or resume a held repeat',()=>{
 const input=createGamepadInput({menuSeatRecovery:true});input.sample([pad()],0,menu);input.sample([pad(0,[15])],1,menu);
 assert.deepEqual(input.sample([pad(0,[0,3,15])],400,{...menu,active:false}).events,[]);
 assert.deepEqual(input.sample([pad(0,[0,3,15])],401,menu).events,[]);
 input.sample([pad()],402,menu);assert.deepEqual(presses(input.sample([pad(0,[0,3])],403,menu)),['confirm','random']);
});
test('menu clock rewind neutral-gates held buttons and discards old repeat deadlines',()=>{
 const input=createGamepadInput({menuSeatRecovery:true});input.sample([pad()],1000,menu);input.sample([pad(0,[15])],1001,menu);
 assert.deepEqual(input.sample([pad(0,[15])],1,menu).events,[]);assert.deepEqual(input.sample([pad(0,[15])],2,menu).events,[]);
 input.sample([pad()],3,menu);assert.deepEqual(nav(input.sample([pad(0,[15])],4,menu)),['ArrowRight']);
});
test('typed axis snapshots retain menu and combat navigation',()=>{
 const input=createGamepadInput({menuSeatRecovery:true});input.sample([pad()],0,menu);assert.deepEqual(nav(input.sample([pad(0,[],new Float32Array([1,0]))],1,menu)),['ArrowRight']);
 input.sample([pad()],2);assert.equal(input.sample([pad(0,[],new Float32Array([-.6,0]))],3).players[0].move,-1);
});

test('a sole live player-two controller owns title and solo navigation',()=>{
 const allowed=api('canControlMenu'),players=[{connected:false,index:0},{connected:true,index:3}];
 for(const screen of ['title','select','ready'])assert.equal(allowed(1,players,{screen,mode:'cpu'}),true);
 assert.equal(allowed(0,players,{screen:'title'}),false);
});
test('two live controllers preserve local independent selection and the title driver',()=>{
 const allowed=api('canControlMenu'),players=[{connected:true,index:5},{connected:true,index:2}];
 assert.equal(allowed(0,players,{screen:'title',mode:'local'}),true);assert.equal(allowed(1,players,{screen:'title',mode:'local'}),false);
 assert.equal(allowed(0,players,{screen:'select',mode:'local',activePlayer:1}),false);assert.equal(allowed(1,players,{screen:'select',mode:'local',activePlayer:1}),true);
 assert.equal(allowed(1,players,{screen:'ready',mode:'local'}),true);assert.equal(allowed(1,players,{screen:'select',mode:'cpu'}),false);
});
test('menu ownership rejects malformed events and disconnected devices',()=>{
 const allowed=api('canControlMenu');for(const player of [-1,2,NaN,'0'])assert.equal(allowed(player,[{connected:true},{connected:true}],{screen:'title'}),false);
 assert.equal(allowed(0,null,{screen:'title'}),false);assert.equal(allowed(0,[{connected:false}],{screen:'select',mode:'local'}),false);
});
function item(options={}){return {isConnected:options.connected??true,disabled:options.disabled??false,hidden:options.hidden??false,matches:selector=>selector===':disabled'&&!!options.fieldsetDisabled,closest:()=>options.hiddenAncestor||options.inert||options.ariaHidden?{}:null,getClientRects:()=>options.noRect?[]:[{}],ownerDocument:{defaultView:{getComputedStyle:()=>({visibility:options.visibility??'visible',display:options.display??'block'})}},...options};}
test('controller focus candidates exclude hidden ancestors, inert, detached and disabled controls',()=>{
 const available=api('availableControllerItems'),visible=item();
 const rejected=[item({disabled:true}),item({fieldsetDisabled:true}),item({hidden:true}),item({hiddenAncestor:true}),item({inert:true}),item({ariaHidden:true}),item({connected:false}),item({noRect:true})];
 assert.deepEqual(available([null,...rejected,visible]),[visible]);
});
test('CSS-hidden controls never become a controller focus or confirm target',()=>{
 const available=api('availableControllerItems'),visible=item();assert.deepEqual(available([item({visibility:'hidden'}),item({visibility:'collapse'}),item({display:'none'}),visible]),[visible]);
});
test('modal scope restricts controller targets without mutating DOM elements',()=>{
 const available=api('availableControllerItems'),outside=item(),inside=item(),scope={contains:x=>x===inside},before={...inside};
 assert.deepEqual(available([outside,inside],{scope}),[inside]);assert.deepEqual(inside,before);
});
test('control availability is recalculated after visibility, disabled or connectivity changes',()=>{
 const available=api('availableControllerItems'),control=item();assert.deepEqual(available([control]),[control]);control.hidden=true;assert.deepEqual(available([control]),[]);control.hidden=false;control.disabled=true;assert.deepEqual(available([control]),[]);control.disabled=false;control.isConnected=false;assert.deepEqual(available([control]),[]);
});
test('a newly discovered controller fills a stale primary menu seat before an empty secondary seat',()=>{
 const input=createGamepadInput({menuSeatRecovery:true,seats:[4,null]});input.sample([pad(2)],0,menu);
 assert.deepEqual(input.seatIndices(),[2,null]);assert.deepEqual(presses(input.sample([pad(2,[0])],1,menu)),['confirm']);
});
test('sole surviving menu controller becomes player one for the next solo fight',()=>{
 const input=createGamepadInput({menuSeatRecovery:true,seats:[4,2]});const result=input.sample([pad(2)],0,menu);
 assert.deepEqual(input.seatIndices(),[2,4]);assert.equal(result.players[0].index,2);assert.equal(result.players[0].connected,true);
 assert.deepEqual(presses(input.sample([pad(2,[0])],1,menu)),['confirm']);
 input.sample([pad(2)],2);assert.deepEqual(presses(input.sample([pad(2,[2])],3)),['punch']);
});

test('arena pause menu keeps both match seat identities after a player disconnects',()=>{
 const input=createGamepadInput({seats:[0,1]});input.sample([pad(0),pad(1)],0);
 input.sample([pad(1,[2])],1);const paused=input.sample([pad(1,[2])],2,{context:'menu'});
 assert.deepEqual(input.seatIndices(),[0,1]);assert.equal(paused.players[0].connected,false);assert.equal(paused.players[1].index,1);
 assert.deepEqual(presses(paused),[]);input.sample([pad(1)],3,{context:'menu'});
 const resumed=input.sample([pad(1)],4);assert.equal(resumed.players[0].connected,false);assert.equal(resumed.players[1].index,1);
});
