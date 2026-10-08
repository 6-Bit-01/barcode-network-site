import test from 'node:test';import assert from 'node:assert/strict';
import {createMatch,performAction,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';
import {registerNewDeletionViews} from '../public/games/system-clash/play/new-deletion-renderer.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
function art(id,height){const image={width:200,height:400,id},manifest={id,character:id,height,scale:height/400},clips={};for(const name of ['idle','walk','crouch','high','low','knockdown','delete-brace','delete-suspended','delete-compressed','delete-crumpled','delete-present','delete-hug','delete-claw','delete-litter-kick','delete-rip']){const frames=Object.fromEntries(['right','left'].map(facing=>[facing,[{rect:[0,0,200,400],anchor:[100,400],opaqueBounds:[30,20,170,400],attachments:{head:[100,70],torso:[100,200],legs:[100,340],grip:[facing==='right'?170:30,180]}}]]));clips[name]=compileFightClip({file:'body.webp',frameMs:1100,order:[0],contactMs:300,frames},image,manifest,name);}return {manifest,clips};}
function screen(){const calls=[],ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];if(String(key).startsWith('create')&&String(key).endsWith('Gradient'))return ()=>({addColorStop(){}});return (...args)=>calls.push([key,...args]);}});return {calls,getContext(){return ctx;}};}
function scene(id,facing='right'){const source=[art(id,id==='doofnoobler'?220:id==='lyra'?320:385),art('9-bit',368)],clips=combatMetadata(source),match=createMatch({mode:'practice',fighters:source.map(({manifest})=>({id:manifest.id,height:manifest.height})),clips});if(facing==='left'){match.fighters[0].x=900;match.fighters[1].x=700;}performAction(match,0,'deletion');return {source,match};}
const frame={rect:[0,0,400,240],anchor:[200,240],opaqueBounds:[10,10,390,240],rimY:155,aperture:[35,30,330,210]},boxImage={width:400,height:240,box:true},prop={additional:{'litter-protocol':{image:boxImage,manifest:{drawWidth:460,referenceWidth:400,frames:{open:frame,captured:frame,impact:frame,dead:frame}}}}};

test('Oak renders one untouched whole body before rip and two masked whole-source halves after',()=>{
 const {source,match}=scene('papa-oak'),canvas=screen(),renderer=createFightRenderer(canvas),definition=deletionDefinition('papa-oak');match.deletionElapsed=definition.beats.rip-1;
 renderer.draw({match,art:source,views:match.fighters.map((_,index)=>getFighterView(match,index))});assert.equal(canvas.calls.filter(([key,image])=>key==='drawImage'&&image===source[1].clips['delete-brace'].image).length,1);
 canvas.calls.length=0;match.deletionElapsed=definition.beats.separated;renderer.draw({match,art:source,views:match.fighters.map((_,index)=>getFighterView(match,index))});
 assert.equal(canvas.calls.filter(([key,image])=>key==='drawImage'&&image===source[1].clips['delete-brace'].image).length,2);assert(canvas.calls.filter(([key])=>key==='clip').length>=2,'Each half masks the same intact source');
 assert(canvas.calls.some(([key,x])=>key==='translate'&&x===110));assert(canvas.calls.some(([key,x])=>key==='translate'&&x===-110));
});

test('Lyra tray draws behind the victim and its exact foreground rim naturally occludes the body',()=>{
 const {source,match}=scene('lyra'),canvas=screen(),renderer=createFightRenderer(canvas);match.deletionElapsed=2100;
 renderer.draw({match,art:source,deletionProp:prop,views:match.fighters.map((_,index)=>getFighterView(match,index))});const sequence=canvas.calls.filter(([key])=>key==='drawImage').map(([,image])=>image);
 const first=sequence.indexOf(boxImage),last=sequence.lastIndexOf(boxImage),victim=sequence.indexOf(source[1].clips['delete-brace'].image);assert(first>=0&&first<victim&&last>victim,'Back and foreground tray surround the actual victim draw');
 assert(canvas.calls.some(([key,,y,,height])=>key==='rect'&&y<620&&height>0),'Captured body is bounded above the game floor');
});

test('Doof exact subtitle stays readable after the peaceful ending',()=>{
 const {source,match}=scene('doofnoobler'),canvas=screen(),renderer=createFightRenderer(canvas);match.deletionElapsed=4000;
 renderer.draw({match,art:source,views:match.fighters.map((_,index)=>getFighterView(match,index))});assert(canvas.calls.some(([key,value,,y])=>key==='fillText'&&value==='Stay soft, stay fuzzy, and stay kind.'&&y===166),'The exact line stays in the HUD below health bars, away from the Deletion title');
});


test('Doof planted root stays put as the released victim changes from brace to a floor pose',()=>{
 const {match}=scene('doofnoobler'),definition=deletionDefinition('doofnoobler');
 const point=(view,unused,site)=>({x:view.x+(site==='grip'?40:view.clip==='knockdown'?-120:0),y:0});
 match.deletionElapsed=definition.beats.release;const held=registerNewDeletionViews(match,match.fighters.map((_,i)=>getFighterView(match,i)),[],point)[0];
 match.deletionElapsed=definition.beats.landed;const settled=registerNewDeletionViews(match,match.fighters.map((_,i)=>getFighterView(match,i)),[],point)[0];assert.equal(held.x,settled.x);
});

for(const facing of ['right','left'])test(`Doof mirror embrace uses the grounded upright waist instead of crouching beneath his mittens (${facing})`,()=>{
 const source=[art('doofnoobler',220),art('doofnoobler',220)];for(const a of source)for(const f of ['right','left']){a.clips['delete-hug'].data.frames[f][0].attachments.grip=[f==='right'?170:30,200];a.clips.crouch.data.frames[f][0].attachments.torso=[100,340];}
 const match=createMatch({mode:'practice',fighters:[{id:'doofnoobler',height:220},{id:'doofnoobler',height:220}],clips:combatMetadata(source)});if(facing==='left'){match.fighters[0].x=900;match.fighters[1].x=700;}performAction(match,0,'deletion');match.deletionElapsed=1500;const views=match.fighters.map((_,i)=>getFighterView(match,i));assert.equal(views[1].clip,'delete-brace');
 const point=(v,a,site)=>{const frame=a.clips[v.clip].data.frames[v.facing][0],p=frame.attachments[site];return {x:v.x+(p[0]-frame.anchor[0])*a.clips[v.clip].scale,y:620+(p[1]-frame.anchor[1])*a.clips[v.clip].scale};},registered=registerNewDeletionViews(match,views,source,point);assert(Math.abs(point(registered[0],source[0],'grip').y-point(registered[1],source[1],'torso').y)<5);assert.equal(registered[0].y,0);assert.equal(registered[1].y,0);
});

for(const facing of ['right','left'])test(`Canvas masks use independently attached native hand positions during Oak's spread (${facing})`,()=>{
 const {source,match}=scene('papa-oak',facing);for(const f of ['right','left'])source[0].clips['delete-rip'].data.frames[f][0].attachments.ripHands=[[30,180],[170,190]];
 match.deletionElapsed=2650;
 const point=(v,a,site)=>{const asset=a.clips[v.clip],f=asset.data.frames[v.facing][0],p=f.attachments[site];return {x:v.x+(p[0]-f.anchor[0])*asset.scale,y:620+(v.y??0)+(p[1]-f.anchor[1])*asset.scale};},raw=match.fighters.map((_,i)=>getFighterView(match,i)),registered=registerNewDeletionViews(match,raw,source,point),saved=JSON.stringify(raw),canvas=screen();
 assert.equal(registered[1].splitPieces.length,2);createFightRenderer(canvas).draw({match,art:source,views:raw});assert.equal(JSON.stringify(raw),saved,'Derived pieces never mutate the raw public snapshot vectors');
 const draws=canvas.calls.filter(([key,image])=>key==='drawImage'&&image===source[1].clips['delete-brace'].image);assert.equal(draws.length,2);
 for(const [i,draw] of draws.entries()){const cut={x:draw[6]+100*source[1].clips['delete-brace'].scale,y:draw[7]+200*source[1].clips['delete-brace'].scale},expected=point({...registered[1],...registered[1].splitPieces[i]},source[1],'torso');assert(Math.hypot(cut.x-expected.x,cut.y-expected.y)<.001,'Actual masked source draw meets each individually measured hand');}
 assert.equal(raw[1].splitPieces,undefined);assert.equal(raw[1].splitBody.gap,registered[1].splitBody.gap,'Renderer never alters the authoritative split state');
});
