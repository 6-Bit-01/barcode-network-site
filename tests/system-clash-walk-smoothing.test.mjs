import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
const play=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url));
const ids=['6-bit','9-bit','cache-back','cliff','dj-floppydisc','mac-modem','mr-nice-guy','ms-mayhem','stolz','kaveman-brown','dr3wbaby','wittyf0x','lyra','papa-oak'].filter(id=>!process.env.SYSTEM_CLASH_WALK_IDS||process.env.SYSTEM_CLASH_WALK_IDS.split(',').includes(id));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const id of ids)test(id+': approved native walk chronology preserves complete source poses and original pixels',async()=>{
 const directory=path.join(play,'assets/fighters',id),manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')),clip=manifest.clips.walk;
 if(clip.registrationRepair?.kind==='restore-approved-native-walk-chronology') {
  const file=path.join(directory,clip.file),image=await sharp(file).metadata(),asset=compileFightClip(clip,image,manifest,'walk');
  assert.equal(asset.timeline.duration,600);assert.deepEqual(clip.order,[0,1,2,3]);assert.deepEqual(clip.frameMs,[150,150,150,150]);
  assert.equal(clip.sourceSha256,sha(await readFile(file)));assert.equal(clip.registrationRepair.retainedPolishClip.frames.right.length,8);
  for(const facing of ['right','left'])for(const frame of clip.frames[facing]) {
   assert.equal(frame.walkKeyOrigin,'approved');assert.deepEqual(frame.rect,frame.poseSource.originalRect);
   const[left,top,width,height]=frame.rect,raw=await sharp(file).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
   assert.equal(sha(raw),frame.poseSource.pixelSha256,'The full original native walk crop is restored exactly');
   assert.equal(frame.pixelSha256,sha(raw));assert(Math.abs(frame.anchor[1]-frame.opaqueBounds[3])<=1);
  }
  return;
 }
 assert.equal(clip.animationPolish?.version,2,'An explicit native in-between bank must replace the four-key walk');
 assert.deepEqual(clip.order,[0,1,2,3,4,5,6,7]);assert.deepEqual(clip.frameMs,[75,75,75,75,75,75,75,75]);
 const file=path.join(directory,clip.file),image=await sharp(file).metadata(),asset=compileFightClip(clip,image,manifest,'walk');
 assert.equal(asset.timeline.duration,clip.animationPolish.approvedTiming.duration);assert.equal(asset.timeline.duration,600);assert.equal(clip.loop,true);
 assert.equal(clip.sourceSha256,sha(await readFile(file)));assert.deepEqual(clip.sourceSize,[image.width,image.height],'Native source geometry must describe the new encoded atlas');
 const metadata=combatMetadata([{manifest,clips:{walk:asset}}])[0].walk;
 for(const facing of ['right','left']){
  const frames=clip.frames[facing],hashes=[];assert.equal(frames.length,8);
  assert.deepEqual(frames.map(f=>f.walkKeyOrigin),['approved','generated','approved','generated','approved','generated','approved','generated']);
  for(const [index,frame]of frames.entries()){
   if(frame.walkKeyOrigin==='generated'){assert.equal(frame.poseSource.sourceFile,'walk-between-'+facing+'.png');assert.equal(frame.poseSource.cell,(index-1)/2);}else assert.equal(typeof frame.poseSource.originalFile,'string');assert.equal(frame.canonicalPixelSha256,frame.pixelSha256);const [left,top,width,height]=frame.rect;assert(left>=0&&top>=0&&left+width<=image.width&&top+height<=image.height);
   const raw=await sharp(file).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();hashes.push(sha(raw));assert.equal(sha(raw),frame.pixelSha256);
   assert(Math.abs(frame.anchor[1]-frame.opaqueBounds[3])<=1,'Every whole body is registered at its actual floor pixels');
   if(index%2===0){const source=frame.poseSource,original=await sharp(path.join(directory,source.originalFile)).extract({left:source.originalRect[0],top:source.originalRect[1],width,height}).ensureAlpha().raw().toBuffer();assert.equal(sha(original),source.pixelSha256);assert.equal(raw.length,original.length);for(let i=0;i<raw.length;i+=4){assert.equal(raw[i+3],original[i+3],'Approved alpha stays exact');if(original[i+3]>0)for(let c=0;c<3;c++)assert.equal(raw[i+c],original[i+c],'Approved native color stays exact');}}
  }
  assert.equal(new Set(hashes).size,8,'Every inserted key is a genuinely distinct whole-body image');
  const torsos=metadata.combatPoses.frames[facing].map(p=>p.sites.torso.x);assert(Math.max(...torsos)-Math.min(...torsos)<manifest.height*.025,'Changing the support foot must not teleport the body root sideways');
  const heights=frames.map(f=>(f.opaqueBounds[3]-f.opaqueBounds[1])*asset.scale);assert(Math.max(...heights)/Math.min(...heights)<1.08,'Native walk poses cannot pulse the character size');
 }
});
test('Doof keeps the finished independent four-phase 540 ms walk bank',async()=>{
 const manifest=JSON.parse(await readFile(path.join(play,'assets/fighters/doofnoobler/manifest.json'),'utf8')),clip=manifest.clips.walk;
 assert.equal(clip.file,'walk-native-v2.webp');assert.deepEqual(clip.order,[0,1,2,3]);assert.deepEqual(clip.frameMs,[150,120,150,120]);
 for(const facing of ['left','right'])assert.equal(clip.frames[facing].length,4);
});
