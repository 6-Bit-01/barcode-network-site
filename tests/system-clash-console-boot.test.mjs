import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {consoleBootFrame,CONSOLE_BOOT_DURATION,createConsoleBoot} from '../public/games/system-clash/play/console-boot.mjs';
import {createGamepadInput} from '../public/games/system-clash/play/fight-gamepad.mjs';
const source=readFileSync(new URL('../public/games/system-clash/play/demo.mjs',import.meta.url),'utf8');
function intro(){
 const element={hidden:true,dataset:{}},image={hidden:false,style:{},getAttribute(){return this.src;}},caption={style:{},textContent:''};let finished=0;
 const boot=createConsoleBoot({element,image,caption,onFinish:()=>finished++});boot.start();
 return {boot,element,image,caption,get finished(){return finished;}};
}
test('the three console marks lead into a brief animated PRESENTS card before completing',()=>{
 const h=intro();
 for(let now=0;now<=3800;now+=50)h.boot.tick(now);
 assert.equal(h.boot.active,true);assert.equal(h.image.hidden,true);assert.equal(h.caption.textContent,'PRESENTS');
 assert.ok(Number(h.caption.style.opacity)>0);assert.equal(h.finished,0);
 for(let now=3850;now<=4600;now+=50)h.boot.tick(now);
 assert.equal(h.boot.active,false);assert.equal(h.element.hidden,true);assert.equal(h.finished,1);
 h.boot.tick(9000);assert.equal(h.finished,1);
 assert.equal(consoleBootFrame(CONSOLE_BOOT_DURATION).complete,true);
});
test('reduced motion retains every mark and PRESENTS with no fade or movement',()=>{
 for(const now of [250,1450,2650,3850]){
  const frame=consoleBootFrame(now,{reducedMotion:true});assert.equal(frame.alpha,1);assert.equal(frame.offset,0);assert.equal(frame.complete,false);
 }
 const h=intro();h.boot.pause();h.boot.tick(20000);assert.equal(h.boot.active,true);assert.equal(h.finished,0);
});
test('Enter, Space and Escape cannot bypass the short console intro',()=>{
 const h=intro();let keydown,menuActions=0;
 const env={menuReady:true,boot:h.boot,window:{addEventListener:(_type,fn)=>keydown=fn},$:id=>({click(){if(id==='console-skip')h.boot.skip();else menuActions++;}})};
 runInNewContext(source.slice(source.indexOf("window.addEventListener('keydown'"),source.indexOf("$('fighter-grid').addEventListener('keydown'")),env);
 for(const code of ['Enter','Space','Escape']){keydown({code,repeat:false,preventDefault(){}});assert.equal(h.boot.active,true);}
 assert.equal(h.boot.active,true);assert.equal(h.finished,0);assert.equal(menuActions,0);
});
test('controller confirm, back and pause leave the console intro running',()=>{
 for(const button of [0,1,9]){
  const h=intro();let menuActions=0;
  const pad=buttons=>({index:0,id:'DualSense',connected:true,mapping:'standard',buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0})),axes:[0,0]});
  const env={menuReady:true,state:{screen:'title'},windowActive:true,document:{hidden:false},navigator:{getGamepads:()=>env.pads},pads:[pad([])],controllerLabel:'',gamepads:createGamepadInput(),boot:h.boot,music:undefined,$:id=>({textContent:'',click(){if(id==='console-skip')h.boot.skip();else menuActions++;}})};
  runInNewContext(source.slice(source.indexOf('function pollMenuGamepads(now)'),source.indexOf("$('demo-fullscreen').addEventListener")),env);
  env.pollMenuGamepads(0);env.pads=[pad([button])];env.pollMenuGamepads(20);
  assert.equal(h.boot.active,true);assert.equal(h.finished,0);assert.equal(menuActions,0);
 }
});
