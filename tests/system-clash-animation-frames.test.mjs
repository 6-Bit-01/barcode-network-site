import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {resolvePoseAttachments} from '../public/games/system-clash/play/fight-attachments.mjs';

const play=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url));
const roster=JSON.parse(fs.readFileSync(path.join(play,'assets/menu/roster.json'),'utf8')).fighters;
const only=process.env.SYSTEM_CLASH_FRAME_IDS?.split(',');
const approvedMainIds=new Set(["6-bit","9-bit","cache-back","cliff","dj-floppydisc","mac-modem","mr-nice-guy","ms-mayhem","stolz","kaveman-brown","dr3wbaby","ash-flowers","wittyf0x"]);
const selected=roster.filter(f=>approvedMainIds.has(f.id)&&(!only||only.includes(f.id)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const fighter of selected) {
  const directory=path.join(play,'assets/fighters',fighter.id);
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  const clip=manifest.clips.punch;
  test(fighter.id+': punch has genuine distinct transitions in both native facings',async()=>{
    assert.equal(clip.frames.right.length,8);
    assert.equal(clip.frames.left.length,8);
    assert.equal(clip.animationPolish.version,1);
    assert.equal(clip.animationPolish.encoding,'webp-quality-94-alpha-preserved');
    const filename=path.resolve(directory,clip.file);
    const image=await sharp(filename).metadata();
    assert.equal(image.format,'webp');
    for(const facing of ['right','left']) {
      const hashes=[];
      for(const frame of clip.frames[facing]) {
        const [left,top,width,height]=frame.rect;
        assert(left>=0&&top>=0&&width>0&&height>0&&left+width<=image.width&&top+height<=image.height);
        const raw=await sharp(filename).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
        hashes.push(sha(raw));
        assert.equal(sha(raw),frame.pixelSha256,'Hosted derivative decode remains reproducible');
        if(frame.poseSource.kind==='approved'){
          const [left,top,width,height]=frame.poseSource.originalRect;
          const native=await sharp(path.resolve(directory,clip.animationPolish.approvedFile)).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
          assert.equal(sha(native),frame.poseSource.pixelSha256,'Approved source keys remain exact');
          let count=0,error=0;for(let i=0;i<native.length;i+=4){assert.equal(raw[i+3],native[i+3],'WebP must retain source alpha');if(native[i+3]>32){for(let channel=0;channel<3;channel++)error+=Math.abs(raw[i+channel]-native[i+channel]);count+=3;}}
          assert(error/Math.max(1,count)<8,'Visually high-quality compression must preserve source detail');
        }
        assert(frame.opaqueBounds[0]>=0&&frame.opaqueBounds[1]>=0&&frame.opaqueBounds[2]<=width&&frame.opaqueBounds[3]<=height);
        assert(frame.anchor[0]>=0&&frame.anchor[0]<=width&&frame.anchor[1]>=0&&frame.anchor[1]<=height);
        for(const site of ['head','torso','legs','grip','strike','strikeStart']) {
          const point=frame.attachments[site];
          assert(point?.length===2&&point.every(Number.isFinite),site+' must be explicit on every reindexed frame');
          assert(point[0]>=0&&point[0]<=width&&point[1]>=0&&point[1]<=height,site+' belongs to the native crop');
        }
        const attached=resolvePoseAttachments(frame,'punch',clip.frames[facing].indexOf(frame),facing,fighter.id);
        assert.equal(attached.authored,true);
        assert.deepEqual([attached.grip.x,attached.grip.y],frame.attachments.grip);
      }
      assert.equal(new Set(hashes).size,8,'No fake duplicated frames');
      assert.deepEqual(clip.frames[facing].map(f=>f.poseSource.kind),['approved','generated','approved','generated','approved','generated','approved','generated']);
    }
  });
  test(fighter.id+': anticipation expands without changing contact, active hold or duration',async()=>{
    const filename=path.resolve(directory,clip.file), image=await sharp(filename).metadata();
    const asset=compileFightClip(clip,image,manifest,'punch');
    const approved=clip.animationPolish.approvedTiming;
    assert.equal(asset.timeline.duration,approved.duration);
    assert.equal(clip.contactMs,approved.contactMs);
    assert.equal(clip.activeEndMs,approved.activeEndMs);
    const active=asset.timeline.entries.find(e=>clip.contactMs>=e.start&&clip.contactMs<e.end);
    assert.equal(active.index,4);
    assert.equal(active.start,approved.contactMs);
    assert.equal(active.end,approved.activeEndMs);
    const metadata=combatMetadata([{manifest,clips:{punch:asset}}])[0].punch;
    assert.equal(metadata.activeEndMs,approved.activeEndMs);
    for(const facing of ['right','left'])assert.equal(metadata.combatPoses.frames[facing].length,8);
    assert.equal(sha(fs.readFileSync(path.resolve(directory,clip.animationPolish.approvedFile))),clip.animationPolish.approvedSha256,'Original approved PNG must remain unchanged');
    assert.equal(sha(fs.readFileSync(filename)),clip.sourceSha256);
  });
}
