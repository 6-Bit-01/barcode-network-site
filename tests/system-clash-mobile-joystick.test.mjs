import test from 'node:test';
import assert from 'node:assert/strict';
import * as input from '../public/games/system-clash/play/fight-input.mjs';
import {bindTouchControls} from '../public/games/system-clash/play/fight-ui.mjs';
class Joystick {
 constructor(){this.dataset={joystick:''};this.handlers={};this.disabled=false;this.captured=new Set();this.classes=new Set();this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};this.properties=new Map();this.style={setProperty:(key,value)=>this.properties.set(key,value)};}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
 setAttribute(key,value){this[key]=value;}
 setPointerCapture(id){this.captured.add(id);}
 releasePointerCapture(id){this.captured.delete(id);}
 hasPointerCapture(id){return this.captured.has(id);}
 getBoundingClientRect(){return {left:0,top:0,width:120,height:120};}
 emit(type,values={}){const event={pointerId:1,clientX:60,clientY:60,button:0,preventDefault(){},stopPropagation(){},...values};for(const fn of this.handlers[type]??[])fn(event);}
}
const rootFor=stick=>({querySelectorAll:selector=>selector==='[data-joystick]'?[stick]:[]});
const direction=(value)=>[value.left,value.right,value.crouch,value.jump];
test('joystick deadzone, cardinal sectors and true diagonals stay distinct',()=>{
 assert.equal(typeof input.resolveJoystickInput,'function');
 const cases=[[[0,0],[false,false,false,false]],[[.12,-.12],[false,false,false,false]],[[-1,0],[true,false,false,false]],[[1,0],[false,true,false,false]],[[0,1],[false,false,true,false]],[[0,-1],[false,false,false,true]],[[-1,-1],[true,false,false,true]],[[1,-1],[false,true,false,true]],[[-1,1],[true,false,true,false]],[[1,1],[false,true,true,false]],[[1,.2],[false,true,false,false]]];
 for(const [[x,y],want] of cases)assert.deepEqual(direction(input.resolveJoystickInput(x,y)),want,`${x},${y}`);
 assert.ok(Math.hypot(input.resolveJoystickInput(3,4).x,input.resolveJoystickInput(3,4).y)<=1.000001);
 assert.deepEqual(direction(input.resolveJoystickInput(NaN,Infinity)),[false,false,false,false]);
});
test('captured drag moves diagonally, jumps once per upper transition and returns to neutral',()=>{
 const stick=new Joystick(),held=new Set(),actions=[];
 bindTouchControls(rootFor(stick),{onHold:(kind,down)=>down?held.add(kind):held.delete(kind),onAction:(...args)=>actions.push(args)});
 stick.emit('pointerdown',{pointerId:4,clientX:100,clientY:20});
 assert.deepEqual([...held],['right']);assert.equal(stick.captured.has(4),true);assert.equal(actions.filter(action=>action[0]==='jump'&&action[2]).length,1);
 stick.emit('pointermove',{pointerId:4,clientX:104,clientY:16});assert.equal(actions.filter(action=>action[2]).length,1);
 stick.emit('pointermove',{pointerId:4,clientX:20,clientY:100});assert.deepEqual([...held].sort(),['crouch','left']);
 stick.emit('pointermove',{pointerId:4,clientX:20,clientY:20});assert.deepEqual([...held],['left']);assert.equal(actions.filter(action=>action[2]).length,2);
 stick.emit('pointerup',{pointerId:4});assert.equal(held.size,0);assert.equal(stick.captured.size,0);assert.equal(stick.classes.has('is-held'),false);assert.equal(stick.properties.get('--joystick-x'),'0px');assert.equal(stick.properties.get('--joystick-y'),'0px');
});
test('cancel, capture loss, clear and inactive drag cannot leave stuck movement',()=>{
 for(const finish of ['pointercancel','lostpointercapture','clear','inactive']){
  const stick=new Joystick(),held=new Set();let active=true;
  const binding=bindTouchControls(rootFor(stick),{active:()=>active,onHold:(kind,down)=>down?held.add(kind):held.delete(kind),onAction(){}});
  stick.emit('pointerdown',{clientX:100,clientY:100});assert.deepEqual([...held].sort(),['crouch','right']);
  if(finish==='clear')binding.clear();else if(finish==='inactive'){active=false;stick.emit('pointermove',{clientX:20});}else stick.emit(finish);
  assert.equal(held.size,0,finish);stick.emit('pointermove',{clientX:20,clientY:20});assert.equal(held.size,0,finish+' ignores released drag');
 }
});
test('a second finger cannot steal joystick capture and focused arrows provide keyboard diagonals',()=>{
 const stick=new Joystick(),held=new Set(),actions=[];
 bindTouchControls(rootFor(stick),{onHold:(kind,down)=>down?held.add(kind):held.delete(kind),onAction:(...args)=>actions.push(args)});
 stick.emit('pointerdown',{pointerId:8,clientX:20});stick.emit('pointerdown',{pointerId:9,clientX:100});stick.emit('pointerup',{pointerId:9});assert.deepEqual([...held],['left']);
 stick.emit('pointerup',{pointerId:8});stick.emit('keydown',{key:'ArrowRight'});stick.emit('keydown',{key:'ArrowDown'});assert.deepEqual([...held].sort(),['crouch','right']);
 stick.emit('keyup',{key:'ArrowDown'});stick.emit('keydown',{key:'ArrowUp'});stick.emit('keydown',{key:'ArrowUp',repeat:true});assert.equal(actions.filter(action=>action[2]).length,1);assert.deepEqual([...held],['right']);
 stick.emit('blur');assert.equal(held.size,0);
});
test('a key released after focus changes can still release the surrounding keyboard input',()=>{
 const stick=new Joystick();bindTouchControls(rootFor(stick),{onHold(){},onAction(){}});let blocked=false;
 stick.emit('keyup',{key:'ArrowLeft',stopPropagation(){blocked=true;}});assert.equal(blocked,false,'unowned release reaches the arena listener');
 stick.emit('keydown',{key:'ArrowLeft'});stick.emit('keyup',{key:'ArrowLeft',stopPropagation(){blocked=true;}});assert.equal(blocked,true,'owned joystick release stays inside its control');
});