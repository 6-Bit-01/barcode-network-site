import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex,poseScale} from '../public/games/system-clash/play/fight-attachments.mjs';
import {createMatch,performAction,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
const rendererURL=new URL('../public/games/system-clash/play/fight-renderer.mjs',import.meta.url);
const rendererSource=fs.readFileSync(rendererURL,'utf8').replace(/from '([.]\/[^']+)'/g,(_,relative)=>"from '"+new URL(relative,rendererURL).href+"'");
const {machineViews,poseWorldPoint,trussGeometry,wheelGeometry,machineGeometry}=await import('data:text/javascript;base64,'+Buffer.from(rendererSource+'\nexport {machineViews,poseWorldPoint,trussGeometry,wheelGeometry,machineGeometry};').toString('base64'));
const root=fileURLToPath(new URL('../public/games/system-clash/play/assets/',import.meta.url));
function size(file){const b=fs.readFileSync(file).subarray(0,64);if(b[0]===137)return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};assert.equal(b.toString('ascii',12,16),'VP8X');return {width:1+b.readUIntLE(24,3),height:1+b.readUIntLE(27,3)};}
function native(id){const clips={};let manifest;for(const bank of ['fighters','arcade','deletions']){const folder=path.join(root,bank,id),data=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));if(bank==='fighters')manifest=data;for(const [name,clip]of Object.entries(data.clips)){const key=bank==='deletions'?'delete-'+name:name;clips[key]=compileFightClip(clip,size(path.join(folder,clip.file)),data,key);}}return {manifest,clips};}
const ids=['6-bit','9-bit','ash-flowers','cache-back','cliff','dj-floppydisc','doofnoobler','dr3wbaby','kaveman-brown','lyra','mac-modem','mr-nice-guy','ms-mayhem','papa-oak','stolz','wittyf0x'];
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
for(const id of ids)for(const facing of ['right','left'])test(id+' '+facing+': hanging body and measured prop references share the same native frame',()=>{
 const body=arts[id];assert(body.clips['delete-rip-front'],'Every accepted victim has a whole native hanging source');
 {
  const {match,source,b}=scene('dr3wbaby',id,facing),v=fitted(match,source,b.trussHit),o=match._deletionOrigin;
  assert.equal(v[1].clip,'delete-rip-front');assert.equal(v[1].elapsed,0);
  const target=point({...v[1],x:o.target,y:-o.liftDistance,clip:'delete-rip-front',elapsed:0},body,'head');
  close(point(v[1],body,'head'),target,'Hoisted source reaches its own measured hanging head');
  const bank=additional[deletionDefinition('dr3wbaby').id],g=trussGeometry(match,bank,v,source),reference=bank.manifest.frames.open,contact=reference.attachments.hitContact;
  close({x:g.stageX+(contact[0]-reference.anchor[0])*g.scale,y:g.stageY+(contact[1]-reference.anchor[1])*g.scale},target,'Stable truss reference meets that same hanging head');
  const moving=g.frame.attachments.hitContact,impact={x:g.x+moving[0]*g.scale,y:g.y+moving[1]*g.scale},head=match.fighters[1]._clips[v[1].clip].combatPoses.frames[v[1].facing][0].hurt.find(r=>r.site==='head');
  assert(impact.x>=v[1].x+head.left&&impact.x<=v[1].x+head.right&&impact.y>=620+v[1].y+head.top&&impact.y<=620+v[1].y+head.bottom,'Animated truss beam still intersects the actual native head region');
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
  captured.x=centre-((bounds[0]+bounds[2])/2+offset[0]-f.native.anchor[0])*scale;captured.y=bottom-620-(bounds[3]+offset[1]-f.native.anchor[1])*scale;
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