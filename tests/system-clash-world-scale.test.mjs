import test from 'node:test';
import assert from 'node:assert/strict';
import {createFightCamera,advanceFightCamera,deletionCamera} from '../public/games/system-clash/play/fight-presentation.mjs';
import {createStageRenderer} from '../public/games/system-clash/play/fight-stage-renderer.mjs';
import {createStageState} from '../public/games/system-clash/play/fight-stages.mjs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';

function screen(){
 const calls=[],stack=[],state={globalAlpha:1,matrix:[1,0,0,1,0,0]};
 const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
 const ctx=new Proxy(state,{get(target,key){
  if(key in target)return target[key];
  if(key==='save')return ()=>stack.push({...state,matrix:state.matrix.slice()});
  if(key==='restore')return ()=>Object.assign(state,stack.pop());
  if(key==='setTransform')return (...matrix)=>{state.matrix=matrix;};
  if(key==='translate')return (x,y)=>{state.matrix=multiply(state.matrix,[1,0,0,1,x,y]);};
  if(key==='scale')return (x,y)=>{state.matrix=multiply(state.matrix,[x,0,0,y,0,0]);};
  if(key==='rotate')return angle=>{const c=Math.cos(angle),s=Math.sin(angle);state.matrix=multiply(state.matrix,[c,s,-s,c,0,0]);};
  if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
  return (...args)=>calls.push({key,args,matrix:state.matrix.slice()});
 }});
 const canvas={calls,getContext:()=>ctx,width:0,height:0};ctx.canvas=canvas;return canvas;
}

test('world units retain their size through separation, edge traversal and reduced motion',()=>{
 const camera=createFightCamera();const fighters=[{x:1020},{x:1540}],before=structuredClone(fighters);
 for(const reducedMotion of [false,true])for(const pair of [[1020,1540],[210,2350],[210,340],[2220,2350],[1250,1270]]){
  for(let n=0;n<40;n++)advanceFightCamera(camera,{fighters:pair.map(x=>({x})),dtMs:100,reducedMotion});
  assert.equal(100*camera.zoom,100,'A 100-unit prop stays 100 pixels throughout camera travel');
  assert(camera.x>=640&&camera.x<=1920);
 }
 assert.deepEqual(fighters,before);
});

test('the midpoint camera keeps both nearby fighters visible and favors the local seat at wide separation',()=>{
 for(const focusIndex of [0,1]){
  const camera=createFightCamera();const fighters=[{x:210},{x:2350}];
  for(let n=0;n<40;n++)advanceFightCamera(camera,{fighters,focusIndex,dtMs:100});
  const focusedX=640+fighters[focusIndex].x-camera.x;
  assert(focusedX>=200&&focusedX<=1080,'The local fighter remains visible at either world wall');
  assert.equal(camera.zoom,1);
 }
 const camera=createFightCamera();for(let n=0;n<40;n++)advanceFightCamera(camera,{fighters:[{x:1020},{x:1540}],dtMs:100});
 assert(640+1020-camera.x>=200&&640+1540-camera.x<=1080,'Both fit when their physical span allows it');
});

test('Deletion pressure, fitted props and wheels pan without changing body or prop scale',()=>{
 const beats={pressure:900,crush:1400,impact:1400,present:2300};
 for(const mechanism of ['crt','nail','waste-chute','drive','speaker-stack','wheel'])for(const reducedMotion of [false,true]){
  for(const time of [0,325,650,900,1100,1400,1800,2300,2700,3200]){
   const camera=deletionCamera({time,mechanism,beats,targetX:850,direction:1,reducedMotion,
    fitted:mechanism==='speaker-stack'?{zoom:.65,x:750,y:340}:null,wheel:mechanism==='wheel'?{radius:280,y:370}:null});
   assert.equal(camera.zoom,1,mechanism+' at '+time+' retains one world scale');assert(Number.isFinite(camera.x)&&Number.isFinite(camera.y));
  }
 }
});

test('stage background inherits the same camera translation as world props',()=>{
 const canvas=screen(),ctx=canvas.getContext(),renderer=createStageRenderer(canvas),stage=createStageState('radio-studio');
 ctx.translate(-310,27);renderer.drawBackground(ctx,stage,null,{cameraX:950,shakeX:8,shakeY:-4});
 const floor=canvas.calls.find(call=>call.key==='fillRect'&&call.args.join(',')==='0,620,2560,100');
 assert(floor);assert.deepEqual(floor.matrix,[1,0,0,1,-310,27],'Backdrop shares pan and shake already applied by its world owner');
});

test('fixed-scale wide scenes identify the offscreen opponent without moving physical fighters',()=>{
 const canvas=screen(),renderer=createFightRenderer(canvas),stage=createStageState('radio-studio');
 const match={stage,phase:'fight',fighters:[{x:210,hp:100,name:'Lyra'},{x:2350,hp:100,name:'Nine'}],stagePickups:[],projectiles:[],roundRemaining:90000};
 const before=structuredClone(match.fighters);renderer.draw({match,views:[],art:[],cameraFocusIndex:0});
 assert(canvas.calls.some(call=>call.key==='fillText'&&call.args[0]==='NINE'),'A far opponent retains its readable name');
 assert(canvas.calls.some(call=>call.key==='moveTo'&&call.args[0]===1260&&call.args[1]===459),'The right edge direction is drawn as geometry, independent of font glyph support');
 assert.deepEqual(match.fighters,before);
});

test('explicit untimed local rules display infinity while timed rules retain their countdown',()=>{
 for(const [limit,want]of [[0,'\u221e'],[99000,'90']]){
  const canvas=screen(),renderer=createFightRenderer(canvas);
  renderer.draw({match:{phase:'fight',mode:'local',_roundTimeLimit:limit,roundRemaining:90000,fighters:[],stagePickups:[],projectiles:[]},views:[],art:[]});
  assert(canvas.calls.some(call=>call.key==='fillText'&&call.args[0]===want&&call.args[1]===640&&call.args[2]===65));
 }
});
