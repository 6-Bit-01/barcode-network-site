import test from 'node:test';
import assert from 'node:assert/strict';
import {createStageState,STAGES,startStageWarning} from '../public/games/system-clash/play/fight-stages.mjs';
import {createStageRenderer,stageVisualState} from '../public/games/system-clash/play/fight-stage-renderer.mjs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';

function surface(){const calls=[],ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];if(String(key).startsWith('create')&&String(key).endsWith('Gradient'))return (...args)=>{calls.push([key,...args]);return {addColorStop(){}}};return (...args)=>calls.push([key,...args]);}});return {calls,width:0,height:0,getContext(){return ctx;}};}
function owner(){const screen=surface(),surfaces=[];screen.ownerDocument={createElement(){const value=surface();surfaces.push(value);return value;}};return {screen,surfaces};}
const plate={width:1672,height:941},kit={width:1024,height:1024};
const layers={frames:{control:{rect:[0,0,160,200],anchor:[80,200]},leftWall:{rect:[160,0,190,500],anchor:[95,500]},rightWall:{rect:[350,0,190,500],anchor:[95,500]},floorStrip:{rect:[0,500,512,80],anchor:[0,0]}}};

test('wide stage art keeps uniform proportions and caches only its selected composition',()=>{
 const {screen,surfaces}=owner(),renderer=createStageRenderer(screen),state=createStageState('radio-studio'),art={id:state.id,image:plate,kit,layers};
 renderer.drawBackground(screen.getContext(),state,art);assert.equal(surfaces.length,2);assert.equal(surfaces[0].width,2560);
 const plateCalls=surfaces[0].calls.filter(([key,image])=>key==='drawImage'&&image===plate);assert(plateCalls.length>=3,'Central plate has matching side sections');
 for(const [,image,sx,sy,sw,sh,dx,dy,dw,dh]of plateCalls)assert(Math.abs(dw/sw-dh/sh)<1e-9,'Landscape source pixels scale uniformly');
 assert(surfaces[0].calls.some(([key,image])=>key==='drawImage'&&image===surfaces[1]),'The feathered kit floor is composed into the cached room');
 const calls=surfaces[0].calls.length;for(let i=0;i<30;i++)renderer.drawBackground(screen.getContext(),state,art);assert.equal(surfaces[0].calls.length,calls);
 const next=createStageState('containment');renderer.drawBackground(screen.getContext(),next,art);
 assert.equal(surfaces.length,3);assert(!surfaces[2].calls.some(([key,image])=>key==='drawImage'&&image===plate),'An old asynchronously loaded room cannot appear in a new room');
 assert.equal(renderer.cacheInfo().count,1,'Only one composed room is retained');
});

test('all stage controls identify their own warned hazard without debug collision panels',()=>{
 for(const spec of STAGES){const {screen}=owner(),renderer=createStageRenderer(screen),state=createStageState(spec.id),match={stage:state,fighters:[{x:spec.interaction.x,hp:100}],phase:'fight'};
 renderer.drawFront(screen.getContext(),match,null,{});assert(screen.calls.some(([key,value])=>key==='fillText'&&String(value).includes('R1')));
 startStageWarning(state,0);renderer.drawBehind(screen.getContext(),state,null,{});assert(screen.calls.some(([key,value])=>key==='fillText'&&value===spec.hazard.name));
 const warning=screen.calls.length;state.fightClock=1100;renderer.drawBehind(screen.getContext(),state,null,{});assert(screen.calls.length>warning);
 const active=screen.calls.slice(warning);assert(!active.some(([key])=>key==='strokeRect'),'No placeholder hazard or wall rectangles');
 assert(active.some(([key,value])=>key==='fillText'&&value===spec.hazard.name),'The same warned zone remains identified during the strike');}
});

test('long ambient cycles have multiple phases and reduced motion freezes their geometry',()=>{
 const state=createStageState('containment'),samples=[];for(let i=0;i<6;i++){state.clock=i*10000;samples.push(stageVisualState(state));}
 assert.equal(new Set(samples.map(value=>value.phase)).size,6);assert(new Set(samples.map(value=>value.drift)).size>1);
 state.clock=0;const still=stageVisualState(state,{reducedMotion:true});state.clock=45000;assert.deepEqual(stageVisualState(state,{reducedMotion:true}),still);
});

test('fight renderer applies one uniform world camera before fighters and restores HUD coordinates',()=>{
 const {screen}=owner(),renderer=createFightRenderer(screen),stage=createStageState('radio-studio');
 const match={stage,phase:'fight',fighters:[{x:1020,hp:100},{x:1540,hp:100}],stagePickups:[],projectiles:[],roundRemaining:90000};
 renderer.draw({match,views:[],art:[]});stage.clock=100;renderer.draw({match,views:[],art:[]});
 assert(screen.calls.some(([key,x,y])=>key==='translate'&&x===640&&y===620),'World camera pivots around the floor');
 assert(screen.calls.some(([key,x,y])=>key==='scale'&&x===y&&x>0),'Sprites keep uniform proportions');
 assert(screen.calls.some(([key,...args])=>key==='setTransform'&&args.join(',')==='1,0,0,1,0,0'),'HUD resets to viewport coordinates');
});

test('stage interaction fixtures clear the Deletion set without changing the room cache',()=>{
 const {screen,surfaces}=owner(),renderer=createStageRenderer(screen),state=createStageState('containment'),art={id:state.id,image:plate,kit,layers};
 const control=call=>call[0]==='drawImage'&&call[1]===kit&&call[2]===0&&call[3]===0&&call[4]===160&&call[5]===200;
 renderer.drawBackground(screen.getContext(),state,art);
 assert(!surfaces[0].calls.some(control),'A cached room must not bake a console underneath Deletion actors');
 renderer.drawBehind(screen.getContext(),state,art,{});
 assert(screen.calls.some(control),'The console remains visible during ordinary play');
 const start=screen.calls.length;
 renderer.drawBehind(screen.getContext(),state,art,{fighting:false,cinematicElapsed:350});
 assert(!screen.calls.slice(start).some(control),'The settled cinematic leaves its mechanism and actor silhouettes clear');
 assert.equal(surfaces.length,2,'Cinematic presentation does not rebuild room pixels');
});

test('wide cinematic backdrop keeps native aspect and floor pixels without stretched bands',()=>{
 const {screen,surfaces}=owner(),renderer=createStageRenderer(screen),state=createStageState('containment');
 renderer.drawBackground(screen.getContext(),state,{id:state.id,image:plate,kit,layers},{cameraX:1420,shakeX:2,shakeY:-1});
 assert(!screen.calls.some(([key])=>key==='setTransform'),'World backdrop cannot discard the foreground camera transform');
 const images=screen.calls.filter(([key,image])=>key==='drawImage'&&image===surfaces[0]);
 assert.equal(images.length,1,'No stretched top or bottom copies');
 assert.deepEqual(images[0].slice(2),[0,0],'The cached native landscape remains at its world origin');
});


test('floor kit edges feather into the room and the blend is cached',()=>{
 const {screen,surfaces}=owner(),renderer=createStageRenderer(screen),state=createStageState('radio-studio');
 renderer.drawBackground(screen.getContext(),state,{id:state.id,image:plate,kit,layers});
 const tile=surfaces.find(value=>value.width===512&&value.height===80);
 assert(tile,'Matched floor strip has a small isolated mask surface');
 assert.equal(tile.getContext().globalCompositeOperation,'destination-in');
 assert.equal(tile.calls.filter(([key])=>key==='createLinearGradient').length,2,'Both horizontal tile joins and vertical strip borders feather');
 const count=surfaces.length;renderer.drawBackground(screen.getContext(),state,{id:state.id,image:plate,kit,layers});
 assert.equal(surfaces.length,count,'No per-frame blend surfaces');
});


test('side landscape extensions meet the same source edge as the central room',()=>{
 const {screen,surfaces}=owner(),renderer=createStageRenderer(screen),state=createStageState('radio-studio');
 renderer.drawBackground(screen.getContext(),state,{id:state.id,image:plate,kit,layers});
 const calls=surfaces[0].calls,images=calls.filter(([key,image])=>key==='drawImage'&&image===plate);
 assert.equal(images[1][2],0,'Left join repeats the central left edge, instead of splicing in the unrelated right side');
 assert.equal(images[2][2],plate.width/2,'Right join repeats the central right edge');
 assert.equal(calls.filter(([key,x,y])=>key==='scale'&&x===-1&&y===1).length,2,'Matching edge pixels are reflected into both outer landscape sections');
});
