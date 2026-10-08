import test from 'node:test';
import assert from 'node:assert/strict';
import {createFightMotionFX} from '../public/games/system-clash/play/fight-motion-fx.mjs';
const image=Object.freeze({width:800,height:600,id:'native-pose-atlas'});
const body=(overrides={})=>({key:0,fighterId:'9-bit',image,source:[10,20,100,150],destination:[300,200,200,300],position:{x:400,y:500},facing:'right',airborne:true,...overrides});
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function context(){const images=[],lines=[],stack=[];return {images,lines,globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},drawImage(...args){images.push({args,alpha:this.globalAlpha});},beginPath(){this.path=[];},moveTo(x,y){this.path.push([x,y]);},lineTo(x,y){this.path.push([x,y]);},stroke(){lines.push({points:this.path,alpha:this.globalAlpha,width:this.lineWidth});}};}
function sample(fx,ctx,time,observation,flags={}){fx.beginFrame({timeMs:time,resetKey:'match-a',...flags});fx.drawBody(ctx,observation);}
function fastFall(fx,ctx){sample(fx,ctx,0,body());sample(fx,ctx,16,body({position:{x:404,y:516},destination:[304,216,200,300]}));}
test('fast fall draws the previous intact source crop with the same uniform size and leaves observations untouched',()=>{
 const fx=createFightMotionFX(),ctx=context(),first=freeze(body()),next=freeze(body({source:[120,20,100,150],position:{x:404,y:516},destination:[304,216,200,300]}));
 const before=JSON.stringify([first,next]);sample(fx,ctx,0,first);assert.equal(ctx.images.length,0);sample(fx,ctx,16,next);
 assert.equal(ctx.images.length,1);assert.deepEqual(ctx.images[0].args,[image,10,20,100,150,300,200,200,300]);assert(ctx.images[0].alpha>0&&ctx.images[0].alpha<=.12);assert.equal(ctx.globalAlpha,1);assert.equal(JSON.stringify([first,next]),before);
});
test('slow descent, rise, grounded poses and landing do not leave fall blur',()=>{
 const fx=createFightMotionFX(),ctx=context();sample(fx,ctx,0,body());sample(fx,ctx,16,body({position:{x:400,y:502}}));sample(fx,ctx,32,body({position:{x:400,y:480}}));assert.equal(ctx.images.length,0);
 sample(fx,ctx,48,body({position:{x:400,y:496}}));assert(fx.getStats().echoes>0);ctx.images.length=0;sample(fx,ctx,64,body({airborne:false,position:{x:400,y:512}}));assert.equal(ctx.images.length,0);assert.equal(fx.getStats().echoes,0);
 sample(fx,ctx,80,body({airborne:false,position:{x:400,y:528}}));assert.equal(ctx.images.length,0);
});
test('windlines follow the actual diagonal strike-tip travel in either native facing',()=>{
 for(const facing of ['left','right']){
  const fx=createFightMotionFX(),ctx=context(),direction=facing==='left'?-1:1;
  const first=body({airborne:false,facing,attackKey:'uppercut-100',strikeStart:{x:400,y:370},strike:{x:400+direction*20,y:350}});
  const next=freeze(body({...first,strikeStart:{x:400,y:340},strike:{x:400+direction*50,y:320}}));
  sample(fx,ctx,0,first);sample(fx,ctx,16,next);assert.equal(ctx.lines.length,1);const [from,to]=ctx.lines[0].points;
  assert.deepEqual(from,[400+direction*20,350]);assert.deepEqual(to,[400+direction*50,320]);assert(ctx.lines[0].alpha>0&&ctx.lines[0].alpha<=.3);assert.equal(ctx.images.length,0);
 }
});
test('body translation and an unchanged limb pose do not invent attack windlines',()=>{
 const fx=createFightMotionFX(),ctx=context();sample(fx,ctx,0,body({attackKey:'punch-100',strikeStart:{x:400,y:370},strike:{x:450,y:350}}));
 sample(fx,ctx,16,body({position:{x:420,y:500},attackKey:'punch-100',strikeStart:{x:420,y:370},strike:{x:470,y:350}}));assert.equal(ctx.lines.length,0);
 sample(fx,ctx,32,body({position:{x:420,y:500},attackKey:'punch-200',strikeStart:{x:420,y:370},strike:{x:520,y:320}}));assert.equal(ctx.lines.length,0);
});
test('invalid or stretched crops, large teleports, source changes and facing changes discard stale motion',()=>{
 const cases=[body({source:[750,20,100,150]}),body({destination:[300,200,250,300]}),body({position:{x:NaN,y:530}}),body({position:{x:400,y:1200}}),body({facing:'left'}),body({fighterId:'6-bit'}),body({image:{width:800,height:600}}),body({eligible:false})];
 for(const next of cases){const fx=createFightMotionFX(),ctx=context();fastFall(fx,ctx);ctx.images.length=0;sample(fx,ctx,32,next);assert.equal(ctx.images.length,0);assert.equal(ctx.lines.length,0);assert.equal(fx.getStats().echoes,0);}
});
test('frame state resets on pause, reduced motion, review, peaceful scenes, match reset and time discontinuity',()=>{
 const flags=[{paused:true},{reducedMotion:true},{review:true},{peaceful:true},{resetKey:'match-b'},{timeMs:1},{timeMs:300}];
 for(const state of flags){const fx=createFightMotionFX(),ctx=context();fastFall(fx,ctx);ctx.images.length=0;sample(fx,ctx,32,body({position:{x:408,y:532},destination:[308,232,200,300]}),state);assert.equal(ctx.images.length,0);assert.equal(fx.getStats().echoes,0);assert.equal(fx.getStats().windlines,0);}
 const fx=createFightMotionFX(),ctx=context();fastFall(fx,ctx);fx.clear();assert.equal(fx.getStats().actors,0);assert.equal(fx.getStats().echoes,0);
});
test('history, line travel and opacity are bounded and expire when no actor is drawn',()=>{
 const fx=createFightMotionFX({echoOpacity:1,fallSpeed:1}),ctx=context();
 for(let tick=0;tick<20;tick++){fx.beginFrame({timeMs:tick*16,resetKey:'match-a'});for(let key=0;key<7;key++)fx.drawBody(ctx,body({key,position:{x:400+key*100,y:500+tick*10},destination:[300+key*100,200+tick*10,200,300],attackKey:'kick-10',strikeStart:{x:400+key*100,y:400+tick*10},strike:{x:500+key*100+(tick%2)*200,y:410+tick*10}}));const stats=fx.getStats();assert(stats.actors<=4);assert(stats.echoes<=12);assert(stats.windlines<=8);}
 assert(ctx.images.length>0);assert(ctx.images.every(draw=>draw.alpha<=.12));assert(ctx.lines.every(draw=>Math.hypot(draw.points[1][0]-draw.points[0][0],draw.points[1][1]-draw.points[0][1])<=130.00001));
 fx.beginFrame({timeMs:400,resetKey:'match-a'});assert.equal(fx.getStats().echoes,0);assert.equal(fx.getStats().windlines,0);fx.beginFrame({timeMs:700,resetKey:'match-a'});assert.equal(fx.getStats().actors,0);
});
test('duplicate body drawing in one presentation frame never accumulates or draws an extra echo',()=>{
 const fx=createFightMotionFX(),ctx=context();fastFall(fx,ctx);assert.equal(ctx.images.length,1);fx.drawBody(ctx,body({position:{x:404,y:516},destination:[304,216,200,300]}));assert.equal(ctx.images.length,1);assert.equal(fx.getStats().echoes,1);
});

test('a missing measured strike vector discards existing windlines rather than reusing stale contact',()=>{
 const fx=createFightMotionFX(),ctx=context();sample(fx,ctx,0,body({airborne:false,attackKey:'punch-100',strikeStart:{x:400,y:370},strike:{x:450,y:350}}));sample(fx,ctx,16,body({airborne:false,attackKey:'punch-100',strikeStart:{x:410,y:360},strike:{x:480,y:330}}));assert.equal(fx.getStats().windlines,1);ctx.lines.length=0;
 sample(fx,ctx,32,body({airborne:false,attackKey:'punch-100',strikeStart:null,strike:{x:510,y:320}}));assert.equal(ctx.lines.length,0);assert.equal(fx.getStats().windlines,0);
});
test('resuming from pause starts a fresh fall trajectory',()=>{
 const fx=createFightMotionFX(),ctx=context();fastFall(fx,ctx);sample(fx,ctx,32,body({position:{x:408,y:532}}),{paused:true});ctx.images.length=0;sample(fx,ctx,48,body({position:{x:420,y:550},destination:[320,250,200,300]}));assert.equal(ctx.images.length,0);
 sample(fx,ctx,64,body({position:{x:424,y:566},destination:[324,266,200,300]}));assert.equal(ctx.images.length,1);assert.deepEqual(ctx.images[0].args.slice(5),[320,250,200,300]);
});

test('current native uppercut atlases produce bounded measured windlines without altering their metadata',async()=>{
 const {readFileSync}=await import('node:fs'),{compileFightClip,combatMetadata}=await import('../public/games/system-clash/play/fight-assets.mjs'),{poseScale,poseFrameIndex}=await import('../public/games/system-clash/play/fight-attachments.mjs');
 for(const id of ['6-bit','9-bit','lyra','papa-oak']) {
  const folder=new URL(`../public/games/system-clash/play/assets/arcade/${id}/`,import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',folder),'utf8')),data=manifest.clips.uppercut;
  const size=data.sourceSize??[Math.max(...Object.values(data.frames).flat().map(frame=>frame.rect[0]+frame.rect[2])),Math.max(...Object.values(data.frames).flat().map(frame=>frame.rect[1]+frame.rect[3]))];
  const atlas=Object.freeze({width:size[0],height:size[1]}),asset=compileFightClip(data,atlas,manifest,'uppercut'),art={manifest,clips:{uppercut:asset}},metadata=freeze(combatMetadata([art])[0].uppercut),before=JSON.stringify(metadata);
  for(const facing of ['left','right']) {
   const fx=createFightMotionFX(),ctx=context();
   for(let elapsed=0;elapsed<asset.timeline.duration;elapsed+=16) {
    const index=poseFrameIndex(asset,{clip:'uppercut',elapsed,facing}),frame=data.frames[facing][index],scale=poseScale(asset,frame),offset=frame.offset??[0,0],pose=metadata.combatPoses.frames[facing][index];
    sample(fx,ctx,elapsed,{key:0,fighterId:id,image:atlas,source:frame.rect,destination:[480+(offset[0]-frame.anchor[0])*scale,620+(offset[1]-frame.anchor[1])*scale,frame.rect[2]*scale,frame.rect[3]*scale],position:{x:480,y:620},facing,airborne:false,attackKey:'uppercut-0',strikeStart:{x:480+pose.strikeStart.x,y:620+pose.strikeStart.y},strike:{x:480+pose.strike.x,y:620+pose.strike.y}});
   }
   assert(ctx.lines.length>0,`${id} ${facing}: actual uppercut tip travels between native poses`);assert(ctx.lines.every(line=>Math.hypot(line.points[1][0]-line.points[0][0],line.points[1][1]-line.points[0][1])<=130.00001));assert.equal(ctx.images.length,0);
  }
  assert.equal(JSON.stringify(metadata),before);
 }
});
