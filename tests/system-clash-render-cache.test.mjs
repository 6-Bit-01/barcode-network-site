import test from 'node:test';
import assert from 'node:assert/strict';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';

// Only the slow browser drawing boundary is replaced. The actual scene renderer
// still chooses its layers, creates surfaces and issues every draw operation.
function drawingSurface() {
  const calls=[];
  const context=new Proxy({}, {get(target,key) {
    if(key in target)return target[key];
    if(key==='createLinearGradient'||key==='createRadialGradient')return (...args)=>{calls.push([key,...args]);return {addColorStop(){}};};
    return (...args)=>{calls.push([key,...args]);};
  }});
  return {calls,context,width:0,height:0,getContext(){return context;}};
}

test('static arena and CRT layers reuse bounded surfaces while the camera moves',t=>{
  const canvas=drawingSurface(),surfaces=[];
  canvas.ownerDocument={createElement(){const surface=drawingSurface();surfaces.push(surface);return surface;}};
  const renderer=createFightRenderer(canvas);
  const scene={match:{phase:'fight',fighters:[],stagePickups:[],projectiles:[],roundRemaining:90000},views:[],art:[]};
  renderer.draw(scene);
  const warmSurfaceCalls=surfaces.reduce((sum,surface)=>sum+surface.calls.length,0);
  canvas.calls.length=0;
  for(let frame=0;frame<40;frame++)renderer.draw({...scene,effects:{camera:{x:frame%3-1,y:frame%2},flash:0}});
  const gradients=canvas.calls.filter(([key])=>key==='createLinearGradient'||key==='createRadialGradient').length;
  const fills=canvas.calls.filter(([key])=>key==='fillRect').length;
  t.diagnostic(`steady frame operations: ${gradients/40} gradients, ${fills/40} fill rectangles; ${surfaces.length} static surfaces`);
  assert.equal(surfaces.length,2,'The arena and screen texture each allocate once');
  assert.equal(surfaces.reduce((sum,surface)=>sum+surface.calls.length,0),warmSurfaceCalls,'Camera movement must not rebuild static layers');
  assert(gradients/40<=2,'Only live health gradients are rebuilt');
  assert(fills/40<70,'Repeated studio details and 180 scanlines must come from cached layers');
  assert(surfaces.reduce((sum,surface)=>sum+surface.width*surface.height*4,0)<16*1024*1024,'Static cache memory remains bounded');
  assert(canvas.calls.some(([key,,x,y])=>key==='drawImage'&&x===-400&&y===-400),'Arena overscan remains available to the cinematic camera');
});

test('renderer remains usable when an offscreen surface is unavailable',()=>{
  const canvas=drawingSurface(),renderer=createFightRenderer(canvas);
  assert.doesNotThrow(()=>renderer.draw({match:{phase:'fight',fighters:[],stagePickups:[],projectiles:[]},views:[],art:[]}));
  assert(canvas.calls.some(([key,value])=>key==='fillText'&&value==='ON AIR'));
});
