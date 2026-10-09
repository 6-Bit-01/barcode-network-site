import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import path from 'node:path';import sharp from 'sharp';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex} from '../public/games/system-clash/play/fight-attachments.mjs';
const root=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const targets=[['mr-nice-guy','arcade','crouch-kick'],['mac-modem','arcade','crouch-kick'],['stolz','arcade','crouch-kick'],['ash-flowers','arcade','crouch-punch'],['ash-flowers','arcade','jump-kick'],['dj-floppydisc','deletions','brace'],['dj-floppydisc','deletions','pull'],['cache-back','deletions','brace'],['cache-back','deletions','shove']];
for(const[id,bank,name]of targets)test(id+' '+name+': whole-body motion keys keep actual native contacts and timing',async()=>{
 const dir=path.join(root,'assets',bank,id),m=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')),base=JSON.parse(await readFile(path.join(root,'assets/fighters',id,'manifest.json'),'utf8')),clip=m.clips[name],p=clip.animationPolish;
 assert.equal(p?.kind,'native-full-body-action-inbetweens');assert.equal(p.generatedKeysPerFacing,2);
 const file=path.join(dir,clip.file),bytes=await readFile(file),meta=await sharp(bytes).metadata(),runtimeName=bank==='deletions'?'delete-'+name:name,asset=compileFightClip(clip,meta,m,runtimeName),md=combatMetadata([{manifest:base,clips:{[runtimeName]:asset}}])[0][runtimeName];
 assert.deepEqual(clip.sourceSize,[meta.width,meta.height]);assert.equal(clip.sourceSha256,sha(bytes));assert.equal(asset.timeline.duration,p.approvedTiming.duration);
 assert.equal(clip.contactMs,p.approvedTiming.contactMs);assert.equal(md.activeEndMs,p.approvedTiming.activeEndMs);
 const oldImage=await sharp(path.join(dir,p.approvedFile)).metadata(),oldAsset=compileFightClip(p.approvedClip,oldImage,m,runtimeName),oldMd=combatMetadata([{manifest:base,clips:{[runtimeName]:oldAsset}}])[0][runtimeName];
 for(const facing of ['right','left']){
  assert.equal(clip.frames[facing].length,4);assert.equal(clip.frames[facing].filter(f=>f.motionKeyOrigin==='generated').length,2);assert.deepEqual(clip.frames[facing].filter(f=>f.motionKeyOrigin==='approved').map(f=>f.poseSource.originalIndex),[0,1]);const hashes=[];
  for(const[index,frame]of clip.frames[facing].entries()){const[left,top,width,height]=frame.rect,raw=await sharp(bytes).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();hashes.push(sha(raw));assert.equal(sha(raw),frame.canonicalPixelSha256);
   if(frame.motionKeyOrigin==='approved'){const source=frame.poseSource,old=await sharp(path.join(dir,p.approvedFile)).extract({left:source.originalRect[0],top:source.originalRect[1],width,height}).ensureAlpha().raw().toBuffer();for(let i=0;i<raw.length;i+=4){assert.equal(raw[i+3],old[i+3]);if(old[i+3]>0)for(let c=0;c<3;c++)assert.equal(raw[i+c],old[i+c]);}assert.deepEqual(md.combatPoses.frames[facing][index],oldMd.combatPoses.frames[facing][source.originalIndex],'Original native contact/hurt geometry stays exact after timeline reindexing');}
   else {assert.equal(frame.poseSource.kind,'generated');assert.equal(frame.poseSource.sourceFile,name+'-between-source.png');assert.match(frame.poseSource.sourceSha256,/^[a-f0-9]{64}$/);}
  }
  assert.equal(new Set(hashes).size,4,'Four real whole-character source images, without duplicated padding');
  if(Number.isFinite(clip.contactMs)){for(const t of [clip.contactMs,md.activeEndMs-.001]){const index=poseFrameIndex(asset,{facing,elapsed:t}),oldIndex=poseFrameIndex(oldAsset,{facing,elapsed:t});assert.deepEqual(md.combatPoses.frames[facing][index],oldMd.combatPoses.frames[facing][oldIndex],'Active contact pose and reach remain authored');}}
  const end=poseFrameIndex(asset,{facing,elapsed:asset.timeline.duration-.001}),oldEnd=poseFrameIndex(oldAsset,{facing,elapsed:oldAsset.timeline.duration-.001});assert.deepEqual(md.combatPoses.frames[facing][end],oldMd.combatPoses.frames[facing][oldEnd],'Final held/recovery pose remains authored');
 }
});
