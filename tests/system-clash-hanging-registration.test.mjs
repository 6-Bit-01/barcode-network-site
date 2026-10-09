import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex,poseScale,poseTransform} from '../public/games/system-clash/play/fight-attachments.mjs';
import {createMatch,performAction,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
const rendererURL=new URL('../public/games/system-clash/play/fight-renderer.mjs',import.meta.url);
const rendererSource=fs.readFileSync(rendererURL,'utf8').replace(/from '([.]\/[^']+)'/g,(_,relative)=>"from '"+new URL(relative,rendererURL).href+"'");
const {machineViews,poseWorldPoint,trussGeometry,wheelGeometry,machineGeometry}=await import('data:text/javascript;base64,'+Buffer.from(rendererSource+'\nexport {machineViews,trussGeometry,wheelGeometry,machineGeometry};').toString('base64'));
const root=fileURLToPath(new URL('../public/games/system-clash/play/assets/',import.meta.url));
function size(file){
 const bytes=fs.readFileSync(file);
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 assert(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','Native PNG or WebP image');
 for(let at=12;at+8<=bytes.length;){const kind=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),data=at+8;assert(data+length<=bytes.length,'Complete WebP chunk');
  if(kind==='VP8X'){assert(length>=10);return {width:1+bytes.readUIntLE(data+4,3),height:1+bytes.readUIntLE(data+7,3)};}
  if(kind==='VP8L'){assert(length>=5&&bytes[data]===0x2f);const value=bytes.readUInt32LE(data+1);return {width:1+(value&0x3fff),height:1+((value>>>14)&0x3fff)};}
  if(kind==='VP8 '){assert(length>=10&&bytes.subarray(data+3,data+6).equals(Buffer.from([0x9d,0x01,0x2a])));return {width:bytes.readUInt16LE(data+6)&0x3fff,height:bytes.readUInt16LE(data+8)&0x3fff};}
  at=data+length+(length&1);
 }throw new Error('Unknown native sprite dimensions');
}
function native(id){const clips={};let manifest;for(const bank of ['fighters','arcade','deletions']){const folder=path.join(root,bank,id),data=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));if(bank==='fighters')manifest=data;for(const [name,clip]of Object.entries(data.clips)){const key=bank==='deletions'?'delete-'+name:name;clips[key]=compileFightClip(clip,size(path.join(folder,clip.runtimeFile??clip.file)),data,key);clips[key].file=path.join(folder,clip.runtimeFile??clip.file);}}return {manifest,clips};}
const ids=JSON.parse(fs.readFileSync(path.join(root,'menu/roster.json'),'utf8')).fighters.map(f=>f.id);
assert.equal(ids.length,19,'Every current playable fighter is covered');
const arts=Object.fromEntries(ids.map(id=>[id,native(id)]));
const additional={};for(const id of ['9-bit','cache-back','dr3wbaby','mr-nice-guy','wittyf0x','dj-floppydisc']){const key=deletionDefinition(id).id;additional[key]={manifest:JSON.parse(fs.readFileSync(path.join(root,'deletions',key,'atlas.json'),'utf8'))};}
const prop={additional};
function scene(hero,id,facing){const source=[arts[hero],arts[id]],match=createMatch({mode:'practice',fighters:source.map(a=>({id:a.manifest.id,height:a.manifest.height})),clips:combatMetadata(source)});match.fighters[0].x=facing==='right'?210:1050;match.fighters[1].x=match.fighters[0].x+(facing==='right'?75:-75);assert(performAction(match,0,'deletion'));return {match,source,b:deletionDefinition(hero).beats};}
function raw(match,t){match.deletionElapsed=t;return match.fighters.map((_,i)=>getFighterView(match,i));}
function fitted(match,source,t){return machineViews(match,prop,raw(match,t),source);}
function point(view,art,site='torso'){return poseWorldPoint(view,art,site);}
function frame(view,art){const asset=art.clips[view.clip];return {asset,native:asset.data.frames[view.facing][poseFrameIndex(asset,view)]};}
function floorBottom(view,art){const {asset,native}=frame(view,art),offset=native.offset??[0,0];return 620+view.y+(native.opaqueBounds[3]+offset[1]-native.anchor[1])*poseScale(asset,native);}
function close(a,b,message){assert(Math.hypot(a.x-b.x,a.y-b.y)<.01,message+' '+JSON.stringify({a,b}));}
const nativePixels=new Map();
async function sourceAlphaAt(view,art,point){
 const {asset,native:f}=frame(view,art),key=asset.file+':'+f.rect.join(',');
 if(!nativePixels.has(key)){const[left,top,width,height]=f.rect;nativePixels.set(key,sharp(asset.file).extract({left,top,width,height}).ensureAlpha().raw().toBuffer());}
 const pixels=await nativePixels.get(key),scale=poseScale(asset,f),offset=f.offset??[0,0];
 assert.equal(view.rotation??0,0,'Impact uses one unchanged upright source');
 const x=Math.round((point.x-view.x)/scale-offset[0]+f.anchor[0]),y=Math.round((point.y-620-view.y)/scale-offset[1]+f.anchor[1]);
 return x>=0&&y>=0&&x<f.rect[2]&&y<f.rect[3]?pixels[(y*f.rect[2]+x)*4+3]:0;
}

for(const id of ids)for(const facing of ['right','left'])test(id+' '+facing+': hanging body and measured prop references share the same native frame',async()=>{
 const body=arts[id];assert(body.clips['delete-rip-front'],'Every accepted victim has a whole native hanging source');
 {
  const {match,source,b}=scene('dr3wbaby',id,facing),v=fitted(match,source,b.trussHit),o=match._deletionOrigin;
  assert.equal(v[1].clip,'delete-rip-front');assert.equal(v[1].elapsed,0);
  const target=point({...v[1],x:o.target,y:-o.liftDistance,clip:'delete-rip-front',elapsed:0},body,'head');
  close(point(v[1],body,'head'),target,'Hoisted source reaches its own measured hanging head');
  const bank=additional[deletionDefinition('dr3wbaby').id],g=trussGeometry(match,bank,v,source),reference=bank.manifest.frames.open,contact=reference.attachments.hitContact;
  close({x:g.stageX+(contact[0]-reference.anchor[0])*g.scale,y:g.stageY+(contact[1]-reference.anchor[1])*g.scale},target,'Stable truss reference meets that same hanging head');
  const moving=g.frame.attachments.hitContact,impact={x:g.x+moving[0]*g.scale,y:g.y+moving[1]*g.scale},selected=frame(v[1],body),nativeHead=match.fighters[1]._clips[v[1].clip].combatPoses.frames[v[1].facing][poseFrameIndex(selected.asset,v[1])].hurt.filter(r=>r.site==='head');
  assert(nativeHead.some(head=>impact.x>=v[1].x+head.left&&impact.x<=v[1].x+head.right&&impact.y>=620+v[1].y+head.top&&impact.y<=620+v[1].y+head.bottom),'Animated truss beam intersects one exact native head band of the selected impact frame');
  assert(await sourceAlphaAt(v[1],body,impact)>=128,'Animated truss contact lands on independently decoded opaque native head pixels');
  close(point(fitted(match,source,b.slamPull)[1],body,'head'),target,'Slam starts from the unchanged captured native head');
 }
 {
  const {match,source,b}=scene('mr-nice-guy',id,facing),v=fitted(match,source,b.captured+300),g=wheelGeometry(match,additional[deletionDefinition('mr-nice-guy').id],v,source),f=frame(v[1],body),torso=f.native.attachments.torso,bounds=f.native.opaqueBounds;
  const radius=Math.max(...[bounds[0],bounds[2]].flatMap(x=>[bounds[1],bounds[3]].map(y=>Math.hypot(x-torso[0],y-torso[1])*poseScale(f.asset,f.native))))+14;
  assert.equal(v[1].clip,'delete-rip-front');assert(Math.abs(g.radius-radius)<.01,'Wheel encloses actual hanging corners at native scale');
  close(point(v[1],body),{x:g.x,y:g.y},'Actual captured hanging torso meets wheel centre');
  assert(g.y+g.radius-14<620,'Every rigidly rotated body corner clears the floor');
 }
 {
  const {match,source,b}=scene('wittyf0x',id,facing),v=fitted(match,source,b.lifted),o=match._deletionOrigin;
  assert.equal(v[1].clip,'delete-rip-front');assert(floorBottom(v[1],body)<620,'Suspended native feet clear the floor');
  const zero={...v[1],x:o.target,y:0,elapsed:0},footDrop=floorBottom(zero,body)-point(zero,body).y,ceiling=620-footDrop,end=point({...zero,y:-o.liftDistance},body);
  assert(Math.abs(point(v[1],body).y-Math.min(end.y,ceiling-o.liftDistance))<.01,'Wand lift endpoint uses the selected source torso and foot envelope');
 }
 {
  const {match,source,b}=scene('6-bit',id,facing),t=(b.drive+b.captured)/2,v=fitted(match,source,t),flight=raw(match,t)[1].deletionFlight;
  const start=point({...v[1],x:flight.startX,y:flight.startY,clip:'delete-rip-front',elapsed:0},body),end=point({...v[1],x:flight.endX,y:flight.endY,clip:'delete-brace',elapsed:650},body),p=flight.progress;
  assert.equal(v[1].clip,'delete-rip-front');close(point(v[1],body),{x:start.x+(end.x-start.x)*p,y:start.y+(end.y-start.y)*p-flight.height*Math.sin(p*Math.PI)},'TV incoming path measures actual hanging start and retained captured brace endpoint');
  assert.equal(fitted(match,source,b.captured)[1].clip,'delete-brace','TV front compression remains intact');
 }
 {
  const {match,source,b}=scene('cache-back',id,facing),t=(b.load+b.captured)/2,v=fitted(match,source,t),flight=raw(match,t)[1].deletionFlight,g=machineGeometry({...match,deletionElapsed:b.captured},prop),ap=g.frame.aperture;
  const centre=g.x+(ap[0]+ap[2]/2)*g.scale,bottom=g.y+(ap[1]+ap[3])*g.scale-5,captured={...v[1],clip:'delete-crumpled',elapsed:10000},f=frame(captured,body),bounds=f.native.opaqueBounds,offset=f.native.offset??[0,0],scale=poseScale(f.asset,f.native);
  const mapped=poseTransform(f.asset,f.native).point([(bounds[0]+bounds[2])/2,bounds[3]]);captured.x=centre-mapped.x;captured.y=bottom-620-mapped.y;
  const start=point({...v[1],x:flight.startX,y:flight.startY,clip:'delete-rip-front',elapsed:0},body),end=point(captured,body),p=flight.progress;
  assert.equal(v[1].clip,'delete-rip-front');close(point(v[1],body),{x:start.x+(end.x-start.x)*p,y:start.y+(end.y-start.y)*p-flight.height*Math.sin(p*Math.PI)},'Chute flight measures selected hanging source and original compact aperture endpoint');
  assert.equal(fitted(match,source,b.captured)[1].clip,'delete-crumpled');
 }
 {
  const {match,source,b}=scene('9-bit',id,facing),t=(b.entry+b.landed)/2,input=raw(match,t),actual=machineViews(match,prop,input,source),reference=input.map(v=>({...v}));
  reference[1].y=0;delete reference[1].deletionFlight;
  const singleArc=machineViews(match,prop,reference,source);close(point(actual[1],body),point(singleArc[1],body),'Engine and coffin aperture blend retain exactly one 45px flight arc');
 }
 {
  const {match,source,b}=scene('dj-floppydisc',id,facing);
  for(const t of [b.ankleSnare+100,b.prone,b.dragStart+200,b.captured-100]){const v=fitted(match,source,t)[1];assert.equal(v.clip,'delete-rip-front');assert.equal(v.elapsed,0);assert.equal(v.rotation,0,'Cord supports an upright slumped body throughout its flight');assert(floorBottom(v,body)<620,'Cord-fed victim stays visibly lifted while it travels');assert.equal(v.facing,match._deletionOrigin.victimFacing);}
  assert.equal(fitted(match,source,b.captured)[1].opacity,0,'Original closed drive endpoint remains hidden');
 }
});
