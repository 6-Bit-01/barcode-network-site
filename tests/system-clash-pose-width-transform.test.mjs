import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import * as attachments from '../public/games/system-clash/play/fight-attachments.mjs';
import * as rendering from '../public/games/system-clash/play/fight-renderer.mjs';
import {signalFragmentPlan} from '../public/games/system-clash/play/bnl-fighter.mjs';
import {cleaverPiecePlan,drawNativeCleaverPieces} from '../public/games/system-clash/play/cleaver-native-pieces.mjs';
import {nativeTorsoContactEdge,nativeTorsoBandEdge,drawNativeRipForearm} from '../public/games/system-clash/play/new-deletion-renderer.mjs';

function fixture(widthFactor=1){
 const frame={rect:[0,0,100,100],anchor:[50,100],offset:[2,3],opaqueBounds:[0,0,100,100],attachments:{head:[50,10],torso:[50,40],legs:[50,70],grip:[75,30],strike:[80,35],strikeStart:[60,40]},combatHurt:[['torso',20,35,80,70]],combatPush:{core:[20,35,80,70],legs:[[20,70,40,100],[60,70,80,100]]}};
 const data={file:'synthetic-width-fixture.webp',scale:2,order:[0],frameMs:100,contactMs:30,frames:{left:[frame],right:[frame]}},image={width:100,height:100},manifest={id:'synthetic-width-fixture',character:'Synthetic width fixture',height:200},asset=compileFightClip(data,image,manifest,'punch');asset.poseWidthFactor=widthFactor;
 return {frame,asset,art:{manifest,clips:{punch:asset}}};
}
function screen(){
 const calls=[],ctx=new Proxy({globalAlpha:1},{get(target,key){if(key in target)return target[key];if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});return (...args)=>calls.push({key,args});}}),canvas={calls,getContext:()=>ctx};ctx.canvas=canvas;return canvas;
}
test('one narrowed source shares draw, hurt, push, grip and capture geometry while torso and floor stay fixed',()=>{
 const {frame,asset,art}=fixture(.5),original=structuredClone(frame),pose=combatMetadata([art])[0].punch.combatPoses.frames.right[0];
 assert.deepEqual(pose.sites.grip,{x:29,y:-134},'The actual source hand narrows around its original torso station');
 assert.deepEqual(pose.sites.torso,{x:4,y:-114});
 assert.deepEqual(pose.bounds,{left:-46,top:-194,right:54,bottom:6});
 assert.deepEqual(pose.hurt,[{site:'torso',left:-26,top:-124,right:34,bottom:-54}]);
 assert.deepEqual(pose.pushCore,{left:-26,top:-124,right:34,bottom:-54});
 assert.deepEqual(pose.pushLegs,[{site:'legs',left:-26,top:-54,right:-6,bottom:6},{site:'legs',left:14,top:-54,right:34,bottom:6}]);
 assert.deepEqual(pose.strike,{x:34,y:-124});
 const transform=attachments.poseTransform(asset,frame),grip=transform.point([75,30]);assert.deepEqual(grip,pose.sites.grip);assert.deepEqual(transform.inverse(grip),{x:75,y:30});
 const view={clip:'punch',elapsed:0,facing:'right',x:400,y:0},world=rendering.poseWorldPoint(view,art,'grip');assert.deepEqual(world,{x:429,y:486},'Capture registration uses the same visible hand');
 const canvas=screen(),renderer=rendering.createFightRenderer(canvas);renderer.draw({match:{phase:'poses',fighters:[],stagePickups:[],projectiles:[]},views:[view],art:[art],motionReview:true});
 const drawn=canvas.calls.find(c=>c.key==='drawImage'&&c.args[0]===asset.image);assert(drawn);assert.deepEqual(drawn.args.slice(5),[354,426,100,200],'The complete unchanged native crop narrows without height normalization');
 const baseline=fixture(),before=combatMetadata([baseline.art])[0].punch.combatPoses.frames.right[0];assert.deepEqual(pose.sites.torso,before.sites.torso);assert.equal(pose.bounds.bottom,before.bounds.bottom);assert.equal(attachments.poseScale(asset,frame),2);assert.deepEqual(frame,original,'Source metadata stays unchanged');
});
test('weapon spawn and native torso contact edges follow the calibrated visible pixels',()=>{
 const {frame,asset,art}=fixture(.5),transform=attachments.poseTransform(asset,frame),pose=combatMetadata([art])[0].punch.combatPoses.frames.right[0],weapon={manifest:{weapons:{'pulse-driver':{drawWidth:20,frames:{right:{rect:[0,0,20,10],grip:[0,5],tip:[20,5]},left:{rect:[0,0,20,10],grip:[0,5],tip:[20,5]}}}}}},origins=attachments.compileWeaponOrigins(asset,weapon);
 assert.deepEqual(origins.weaponThrowOrigins.right,pose.sites.grip);assert.deepEqual(origins.weaponOrigins['pulse-driver'].right,{x:49,y:-134});
 const mask={width:100,height:100,alpha:new Uint8Array(10000).fill(255)};
 assert.equal(nativeTorsoContactEdge(frame,pose,mask,1,transform.sy,transform),30);assert.equal(nativeTorsoBandEdge(frame,pose,1,transform.sy,transform),30);
});

test('reviewed whole-pose registration moves every narrowed native contact together without changing floor or pixels',()=>{
 const {frame,asset,art}=fixture(.5),original=structuredClone(frame),before=combatMetadata([art])[0].punch.combatPoses.frames.right[0];asset.poseRegistration={x:8,y:0};
 const after=combatMetadata([art])[0].punch.combatPoses.frames.right[0],transform=attachments.poseTransform(asset,frame);
 for(const site of Object.keys(before.sites)){assert.equal(after.sites[site].x,before.sites[site].x+8);assert.equal(after.sites[site].y,before.sites[site].y);}
 for(const key of ['strike','strikeStart']){assert.equal(after[key].x,before[key].x+8);assert.equal(after[key].y,before[key].y);}
 for(const [a,b]of [...before.hurt.map((r,i)=>[r,after.hurt[i]]),[before.pushCore,after.pushCore],...before.pushLegs.map((r,i)=>[r,after.pushLegs[i]])]){assert.equal(b.left,a.left+8);assert.equal(b.right,a.right+8);assert.equal(b.top,a.top);assert.equal(b.bottom,a.bottom);}
 assert.equal(after.bounds.left,before.bounds.left+8);assert.equal(after.bounds.right,before.bounds.right+8);assert.equal(after.bounds.bottom,before.bounds.bottom);assert.deepEqual(transform.inverse(after.sites.grip),{x:75,y:30});
 const view={clip:'punch',elapsed:0,facing:'right',x:400,y:0};assert.deepEqual(rendering.poseWorldPoint(view,art,'grip'),{x:437,y:486});assert.deepEqual(attachments.compileWeaponOrigins(asset).weaponThrowOrigins.right,after.sites.grip);
 const canvas=screen();rendering.createFightRenderer(canvas).draw({match:{phase:'poses',fighters:[],stagePickups:[],projectiles:[]},views:[view],art:[art],motionReview:true});assert.deepEqual(canvas.calls.find(c=>c.key==='drawImage'&&c.args[0]===asset.image).args.slice(5),[362,426,100,200]);
 assert.deepEqual(frame,original,'Registration never rewrites native source metadata');assert.equal(transform.sx,1);assert.equal(transform.sy,2);
});

test('a native diagonal wrap axis keeps its vertical component while its width narrows',()=>{
 const {asset,frame}=fixture(.5),transform=attachments.poseTransform(asset,frame),axis=transform.vector({x:20/Math.sqrt(2),y:20/Math.sqrt(2)});
 assert(Math.abs(axis.x-14.14213562373095)<1e-9);assert(Math.abs(axis.y-28.2842712474619)<1e-9,'A slanted wrap cannot compress its vertical axis by the horizontal factor');
 assert.deepEqual(transform.vector({x:20,y:0}),{x:20,y:0});assert.deepEqual(transform.vector({x:0,y:20}),{x:0,y:40});
});
test('direct native fragments retain their source pixels and share the corrected width transform',()=>{
 const {frame,asset}=fixture(.5),transform=attachments.poseTransform(asset,frame),options={progress:0,x:400,y:620,scale:2,transform},fragments=signalFragmentPlan(frame,options),baseline=signalFragmentPlan(frame,{...options,transform:undefined});
 assert.deepEqual(fragments.map(f=>f.source),baseline.map(f=>f.source));for(const piece of fragments){assert.equal(piece.width,piece.source[2]);assert.equal(piece.height,piece.source[3]*2);}
 assert.deepEqual([fragments[0].x,fragments[0].y],[363,444]);
 const points=[[60,15],[60,40],[60,75],[50,50]],contacts=points.map((p,index)=>{const local=transform.point(p);return {contact:{x:400+local.x,y:local.y},at:index*100,site:['head','torso','legs','torso'][index]};}),pieces=cleaverPiecePlan(frame,{contacts,scale:2,transform,originX:400});
 assert.equal(pieces.reduce((sum,p)=>sum+p.rect[2]*p.rect[3],0),10000);for(const p of pieces){assert.equal(p.width,p.rect[2]);assert.equal(p.height,p.rect[3]*2);}
 const canvas=screen();drawNativeCleaverPieces(canvas.getContext(),asset.image,frame,pieces,0);for(const call of canvas.calls.filter(c=>c.key==='drawImage'))assert.deepEqual(call.args.slice(-2),[100,200]);
 frame.frontOcclusion=[[0,0],[100,0],[100,100],[0,100]];assert(drawNativeRipForearm(canvas.getContext(),{clip:'punch',elapsed:0,facing:'right',x:400,y:0},{clips:{punch:asset}}));
 assert(canvas.calls.some(c=>c.key==='translate'&&c.args[0]===354&&c.args[1]===426));assert(canvas.calls.some(c=>c.key==='scale'&&c.args[0]===1&&c.args[1]===2));
});
test('legacy fallback hurt geometry and existing body calibration keep independent horizontal and vertical dimensions',()=>{
 const narrow=fixture(.5),wide=fixture();for(const f of [narrow,wide]){delete f.frame.combatHurt;f.frame.bodyCalibration=.8;}
 const a=combatMetadata([narrow.art])[0].punch.combatPoses.frames.right[0],b=combatMetadata([wide.art])[0].punch.combatPoses.frames.right[0];
 assert.deepEqual(a.sites.torso,b.sites.torso);assert.equal(a.bounds.bottom,b.bounds.bottom);assert.equal(attachments.poseScale(narrow.asset,narrow.frame),1.6);
 for(let i=0;i<a.hurt.length;i++){assert.equal(a.hurt[i].top,b.hurt[i].top);assert.equal(a.hurt[i].bottom,b.hurt[i].bottom);assert(Math.abs((a.hurt[i].right-a.hurt[i].left)*2-(b.hurt[i].right-b.hurt[i].left))<1e-9);}
});
test('documented bank IDs resolve to the core fighter when explicit identity context is absent',()=>{
 for(const id of ['6-bit','mac-modem','bnl-01','lost-marbles'])for(const suffix of ['', '-arcade','-arcade-actions','-deletion','-deletions','-deletion-utilities']){
  const {asset}=fixture(),manifest={id:id+suffix,character:id,height:200},compiled=compileFightClip(asset.data,asset.image,manifest,'punch');assert.equal(compiled.fighterId,id);
 }
});

test('reviewed 9 Bit walk playback selects retained coherent keys without changing native atlas metadata',()=>{
 const root=new URL('../public/games/system-clash/play/assets/fighters/9-bit/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root))),data=manifest.clips.walk,original=JSON.stringify(data),frames=Object.values(data.frames).flat(),image={width:Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),height:Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))},asset=compileFightClip(data,image,manifest,'walk'),metadata=combatMetadata([{manifest,clips:{walk:asset}}])[0].walk;
 assert.deepEqual(asset.timeline.entries.map(entry=>entry.index),[0,2,4,6]);assert.deepEqual(asset.timeline.entries.map(entry=>entry.end-entry.start),[150,150,150,150]);assert.equal(metadata.duration,600);assert.deepEqual(metadata.combatPoses.entries,asset.timeline.entries);
 for(const facing of ['left','right'])for(const [elapsed,index]of [[0,0],[149,0],[150,2],[300,4],[450,6],[600,0]])assert.equal(attachments.poseFrameIndex(asset,{clip:'walk',facing,elapsed}),index,'Drawing and compiled combat select the same retained key');
 assert.equal(JSON.stringify(data),original,'Authored order, frame timing, source crops and provenance remain intact');assert.equal(data.frames.left.length,8);assert.equal(data.frames.right.length,8);
});
test('all actual fighter banks calibrate around the same authored core-fighter torso',()=>{
 const root=new URL('../public/games/system-clash/play/assets/',import.meta.url),ids=JSON.parse(readFileSync(new URL('fight-roster.json',root))).fighters.filter(f=>f.enabled).map(f=>f.id);
 for(const id of ids)for(const bank of ['fighters','arcade','deletions']){
  const original=JSON.parse(readFileSync(new URL(`${bank}/${id}/manifest.json`,root))),manifest={...original};delete manifest.fighterId;delete manifest.baseId;
  for(const [name,data]of Object.entries(original.clips)){
   const clip=bank==='deletions'?'delete-'+name:name,frames=Object.values(data.frames).flat(),image={width:Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),height:Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))},asset=compileFightClip(data,image,manifest,clip);asset.poseWidthFactor=.5;assert.equal(asset.fighterId,id,`${bank}/${id}/${name}`);
   for(const facing of ['left','right'])for(const [index,frame]of data.frames[facing].entries()){
    const torso=attachments.resolvePoseAttachments(frame,clip,index,facing,id).torso,scale=attachments.poseScale(asset,frame),offset=frame.offset??[0,0],transform=attachments.poseTransform(asset,frame),point=transform.point(torso);
    assert(Math.abs(point.x-(torso.x+offset[0]-frame.anchor[0])*scale-transform.registration.x)<1e-9,`${bank}/${id}/${name}/${facing}/${index}: authored torso station changed outside reviewed registration`);
   }
  }
 }
});
