import test from 'node:test';import assert from 'node:assert/strict';
import {createMatch,performAction,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';
import {registerNewDeletionViews} from '../public/games/system-clash/play/new-deletion-renderer.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
function art(id,height){const image={width:400,height:400,id},manifest={id,character:id,height,scale:height/400},clips={};for(const name of ['idle','walk','crouch','high','low','thrown','knockdown','delete-brace','delete-suspended','delete-compressed','delete-crumpled','delete-present','delete-hug','delete-claw','delete-litter-kick','delete-rip']){const frames=Object.fromEntries(['right','left'].map(facing=>{const first={rect:[0,0,200,400],anchor:[100,400],opaqueBounds:[30,20,170,400],attachments:{head:[100,70],torso:[100,200],legs:[100,340],grip:[facing==='right'?170:30,180]}};return [facing,name==='delete-suspended'?[first,{...structuredClone(first),rect:[200,0,200,400]}]:[first]];}));clips[name]=compileFightClip({file:'body.webp',frameMs:name==='delete-suspended'?75:1100,order:name==='delete-suspended'?[0,1]:[0],contactMs:300,frames},image,manifest,name);}return {manifest,clips};}
function screen(){const calls=[],ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];if(String(key).startsWith('create')&&String(key).endsWith('Gradient'))return ()=>({addColorStop(){}});return (...args)=>calls.push([key,...args]);}});return {calls,getContext(){return ctx;}};}
function scene(id,facing='right'){const source=[art(id,id==='doofnoobler'?220:id==='lyra'?320:385),art('9-bit',368)],clips=combatMetadata(source),match=createMatch({mode:'practice',fighters:source.map(({manifest})=>({id:manifest.id,height:manifest.height})),clips});if(facing==='left'){match.fighters[0].x=900;match.fighters[1].x=700;}performAction(match,0,'deletion');return {source,match};}
const frame={rect:[0,0,400,240],anchor:[200,240],opaqueBounds:[10,10,390,240],rimY:155,aperture:[35,30,330,210]},boxImage={width:400,height:240,box:true},prop={additional:{'litter-protocol':{image:boxImage,manifest:{drawWidth:460,referenceWidth:400,frames:{open:frame,captured:frame,impact:frame,dead:frame}}}}};

function maskedSourceDraws(calls,image){
 const draws=[];let path=[],closed=false,mask=null;
 for(const [key,...args]of calls){
  if(key==='beginPath'){path=[];closed=false;}
  else if(key==='moveTo'||key==='lineTo')path.push({key,x:args[0],y:args[1]});
  else if(key==='closePath')closed=true;
  else if(key==='clip')mask={points:path.map(point=>({...point})),closed};
  else if(key==='drawImage'&&args[0]===image)draws.push({draw:args,mask});
 }
 return draws;
}
function nativeHalfSeam({draw,mask},side){
 const [,sx,sy,sw,sh,dx,dy,dw,dh]=draw,scale=dw/sw;
 assert.deepEqual([sx,sy,sw,sh],[0,0,200,400],'Each half draws the entire frozen native source crop');
 assert(Math.abs(dh/sh-scale)<1e-10,'The full source keeps one uniform body scale');
 assert(mask?.closed,'Each half has its own closed clipping polygon');
 assert.equal(mask.points[0].key,'moveTo');
 const edge=mask.points.slice(1,-1),outer=side<0?dx-5:dx+dw+5;
 assert(edge.length>8,'The wound has a detailed ragged boundary');
 assert(Math.abs(mask.points[0].x-outer)<1e-7&&Math.abs(mask.points.at(-1).x-outer)<1e-7,'The polygon closes at the correct outer body side');
 assert(Math.abs(edge[0].y-(dy-5))<1e-7&&Math.abs(edge.at(-1).y-(dy+dh+5))<1e-7,'The shared cut covers the whole body height');
 const native=edge.map(p=>({x:(p.x-dx)/scale,y:(p.y-dy)/scale}));
 assert(native.every((p,i)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>30&&p.x<170&&(i===0||p.y>native[i-1].y)),'The cut is finite, stays inside the native torso width and never folds back');
 assert(Math.max(...native.map(p=>p.x))-Math.min(...native.map(p=>p.x))>5,'The boundary is jagged rather than a replacement straight rectangle');
 return native;
}
function sameSeam(actual,expected,message){assert.equal(actual.length,expected.length,message);for(let i=0;i<actual.length;i++)assert(Math.hypot(actual[i].x-expected[i].x,actual[i].y-expected[i].y)<1e-7,message);}
for(const facing of ['right','left'])test(`Oak keeps one intact source then two complementary ragged masks frozen through the fall (${facing})`,()=>{
 const {source,match}=scene('papa-oak',facing),canvas=screen(),renderer=createFightRenderer(canvas),definition=deletionDefinition('papa-oak'),asset=source[1].clips['delete-suspended'];
 for(const f of ['right','left'])source[0].clips['delete-rip'].data.frames[f][0].attachments.ripHands=[[30,180],[170,190]];
 // A second distinct atlas crop makes advancing the captured victim key detectable.
 assert.equal(asset.data.frames.right.length,2);match.deletionElapsed=definition.beats.rip-1;
 renderer.draw({match,art:source,views:match.fighters.map((_,index)=>getFighterView(match,index))});
 const whole=maskedSourceDraws(canvas.calls,asset.image);assert.equal(whole.length,1);assert.deepEqual(whole[0].draw.slice(1,5),[0,0,200,400],'Before ripping, the victim is one untouched full native source');
 let frozenSeam;
 for(const time of [definition.beats.rip,definition.beats.separated,(definition.beats.separated+definition.beats.settled)/2,definition.beats.settled,definition.beats.settled+500]){
  canvas.calls.length=0;match.deletionElapsed=time;renderer.draw({match,art:source,views:match.fighters.map((_,index)=>getFighterView(match,index))});
  const halves=maskedSourceDraws(canvas.calls,asset.image);assert.equal(halves.length,2,'Exactly two masks replay the same intact source');
  const left=nativeHalfSeam(halves[0],-1),right=nativeHalfSeam(halves[1],1);
  sameSeam(left,right,'Both halves share the identical native boundary, so the masks join without a gap or overlap');
  if(frozenSeam)sameSeam(left,frozenSeam,'The captured native key and ragged edge remain unchanged through release, fall and settlement');else frozenSeam=left;
 }
});
test('Lyra tray draws behind the victim and its exact foreground rim naturally occludes the body',()=>{
 const {source,match}=scene('lyra'),canvas=screen(),renderer=createFightRenderer(canvas);match.deletionElapsed=2100;
 renderer.draw({match,art:source,deletionProp:prop,views:match.fighters.map((_,index)=>getFighterView(match,index))});const sequence=canvas.calls.filter(([key])=>key==='drawImage').map(([,image])=>image);
 const first=sequence.indexOf(boxImage),last=sequence.lastIndexOf(boxImage),victim=sequence.indexOf(source[1].clips[getFighterView(match,1).clip].image);assert(first>=0&&first<victim&&last>victim,'Back and foreground tray surround the actual victim draw');
 assert(canvas.calls.some(([key,,y,,height])=>key==='rect'&&y<620&&height>0),'Captured body is bounded above the game floor');
});

test('Doof exact subtitle stays readable after the peaceful ending',()=>{
 const {source,match}=scene('doofnoobler'),canvas=screen(),renderer=createFightRenderer(canvas);match.deletionElapsed=4000;
 renderer.draw({match,art:source,views:match.fighters.map((_,index)=>getFighterView(match,index))});assert(canvas.calls.some(([key,value,,y])=>key==='fillText'&&value==='Stay soft, stay fuzzy, and stay kind.'&&y===166),'The exact line stays in the HUD below health bars, away from the Deletion title');
});


test('Doof whole body is shoved back while the opponent remains upright and escapes',()=>{
 const {match}=scene('doofnoobler'),definition=deletionDefinition('doofnoobler');
 const point=(view,unused,site)=>({x:view.x+(site==='grip'?40:view.clip==='knockdown'?-120:0),y:0});
 match.deletionElapsed=definition.beats.release;const held=registerNewDeletionViews(match,match.fighters.map((_,i)=>getFighterView(match,i)),[],point)[0];
 match.deletionElapsed=definition.beats.landed;const settled=registerNewDeletionViews(match,match.fighters.map((_,i)=>getFighterView(match,i)),[],point)[0];assert.equal(held.x-settled.x,95);
});

for(const facing of ['right','left'])test(`Canvas masks use independently attached native hand positions during Oak's spread (${facing})`,()=>{
 const {source,match}=scene('papa-oak',facing);for(const f of ['right','left'])source[0].clips['delete-rip'].data.frames[f][0].attachments.ripHands=[[30,180],[170,190]];
 match.deletionElapsed=2650;
 const point=(v,a,site)=>{const asset=a.clips[v.clip],f=asset.data.frames[v.facing][0],p=f.attachments[site];return {x:v.x+(p[0]-f.anchor[0])*asset.scale,y:620+(v.y??0)+(p[1]-f.anchor[1])*asset.scale};},raw=match.fighters.map((_,i)=>getFighterView(match,i)),registered=registerNewDeletionViews(match,raw,source,point),saved=JSON.stringify(raw),canvas=screen();
 assert.equal(registered[1].splitPieces.length,2);createFightRenderer(canvas).draw({match,art:source,views:raw});assert.equal(JSON.stringify(raw),saved,'Derived pieces never mutate the raw public snapshot vectors');
 const draws=canvas.calls.filter(([key,image])=>key==='drawImage'&&image===source[1].clips['delete-suspended'].image);assert.equal(draws.length,2);
 for(const [i,draw] of draws.entries()){const cut={x:draw[6]+100*source[1].clips['delete-suspended'].scale,y:draw[7]+200*source[1].clips['delete-brace'].scale},expected=point({...registered[1],...registered[1].splitPieces[i]},source[1],'torso');assert(Math.hypot(cut.x-expected.x,cut.y-expected.y)<.001,'Actual masked source draw meets each individually measured hand');}
 assert.equal(raw[1].splitPieces,undefined);assert.equal(raw[1].splitBody.gap,registered[1].splitBody.gap,'Renderer never alters the authoritative split state');
});
