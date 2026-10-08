import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex} from '../public/games/system-clash/play/fight-attachments.mjs';
import {createMatch,advanceMatch,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
const play=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url));
const sha=raw=>createHash('sha256').update(raw).digest('hex');
async function crop(directory,clip,frame){const [left,top,width,height]=frame.rect;return sharp(path.join(directory,clip.file)).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();}
async function native(id){const directory=path.join(play,'assets/fighters',id),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));const clips={};for(const [key,data]of Object.entries(manifest.clips))clips[key]=compileFightClip(data,await sharp(path.join(directory,data.file)).metadata(),manifest,key);return {directory,manifest,clips};}
function advance(match,ms){while(ms>0){const dt=Math.min(100,ms);advanceMatch(match,dt);ms-=dt;}}
function geometry(match,art,view){const index=poseFrameIndex(art.clips[view.clip],view),pose=match.fighters[0]._clips[view.clip].combatPoses.frames[view.facing][index];return {sites:Object.fromEntries(Object.entries(pose.sites).map(([key,p])=>[key,{x:view.x+p.x,y:620+(view.y??0)+p.y}])),bounds:{left:view.x+pose.bounds.left,right:view.x+pose.bounds.right,top:620+(view.y??0)+pose.bounds.top,bottom:620+(view.y??0)+pose.bounds.bottom}};}
for(const id of ['lyra','papa-oak'])for(const facing of ['right','left']){
 test(`${id} ${facing}: landed thrown pixels and native anatomy equal the grounded recovery source`,async()=>{
  const art=await native(id),{thrown,knockdown,getup}=art.manifest.clips,a=thrown.frames[facing].at(-1),b=knockdown.frames[facing].at(-1),c=getup.frames[facing][0];
  assert.equal(sha(await crop(art.directory,thrown,a)),sha(await crop(art.directory,knockdown,b)),'Landing must use the actual same intact native body pixels');
  assert.equal(a.pixelSha256,b.pixelSha256);assert.equal(a.canonicalPixelSha256,b.canonicalPixelSha256);
  for(const key of ['anchor','opaqueBounds','attachments','bodyCalibration'])assert.deepEqual(a[key],b[key],`${key} must accompany the reused body`);
  assert.deepEqual(a.offset??[0,0],[0,0],'Existing thrown travel offset is unchanged');
  assert.deepEqual(b,c,'Grounded pose and recovery start remain exact');
  for(const key of ['sourceFile','cell','sourceSha256','uniformResample'])assert.deepEqual(a.poseSource[key],b.poseSource[key]);
  assert.equal(a.poseSource.kind,'reused-native');
 });
 test(`${id} ${facing}: actual thrown to grounded to getup transitions retain every contact site and floor bound`,async()=>{
  const art=await native(id),match=createMatch({mode:'practice',fighters:[{id,height:art.manifest.height},{id,height:art.manifest.height}],clips:combatMetadata([art,art])}),fighter=match.fighters[0];
  Object.assign(fighter,{action:'thrown',actionTime:art.clips.thrown.timeline.duration-.001,facing,x:900,_launched:true,_launchStartY:0,_throwDirection:facing==='right'?1:-1});
  match.phase='fight';const before=getFighterView(match,0),source=geometry(match,art,before);assert.equal(before.clip,'thrown');assert.equal(before.y,0);
  advance(match,1);const landed=getFighterView(match,0);assert.equal(landed.clip,'knockdown');assert.deepEqual(geometry(match,art,landed),source,'No anatomy/root jump after the floor key');
  advance(match,250);const recovery=getFighterView(match,0);assert.equal(recovery.clip,'getup');assert.equal(poseFrameIndex(art.clips.getup,recovery),0);assert.deepEqual(geometry(match,art,recovery),source,'Recovery begins from that same registered body');
  assert(Math.abs(source.bounds.bottom-620)<1,'The native supported body stays on the floor');
 });
}

