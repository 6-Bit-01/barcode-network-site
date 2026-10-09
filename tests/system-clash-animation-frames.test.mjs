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
const approvedMainIds=new Set(["6-bit","9-bit","cache-back","cliff","dj-floppydisc","mac-modem","mr-nice-guy","ms-mayhem","stolz","kaveman-brown","dr3wbaby","wittyf0x"]);
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
      for(const [index,frame] of clip.frames[facing].entries()) {
        const [left,top,width,height]=frame.rect;
        assert(left>=0&&top>=0&&width>0&&height>0&&left+width<=image.width&&top+height<=image.height);
        const raw=await sharp(filename).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
        hashes.push(sha(raw));
        assert.equal(sha(raw),frame.pixelSha256,'Hosted derivative decode remains reproducible');
        if(fighter.id==='mac-modem')verifyMacTransfer(frame,raw,clip,index,facing,sha);
        if(frame.poseSource.kind==='approved'){
          const [left,top,width,height]=frame.poseSource.originalRect;
          const native=await sharp(path.resolve(directory,clip.animationPolish.approvedFile)).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
          assert.equal(sha(native),frame.poseSource.pixelSha256,'Approved source keys remain exact');
          let count=0,error=0;for(let i=0;i<native.length;i+=4){assert.equal(raw[i+3],native[i+3],'WebP must retain source alpha');if(native[i+3]>32){for(let channel=0;channel<3;channel++)error+=Math.abs(raw[i+channel]-native[i+channel]);count+=3;}}
          assert(error/Math.max(1,count)<8,'Visually high-quality compression must preserve source detail');
        }
        assert(frame.opaqueBounds[0]>=0&&frame.opaqueBounds[1]>=0&&frame.opaqueBounds[2]<=width&&frame.opaqueBounds[3]<=height);
        assert(frame.anchor[0]>=0&&frame.anchor[0]<=width&&frame.anchor[1]>=0&&frame.anchor[1]<=height);
        for(const site of (fighter.id==='mac-modem'&&index!==4?['head','torso','legs','grip']:['head','torso','legs','grip','strike','strikeStart'])) {
          const point=frame.attachments[site];
          assert(point?.length===2&&point.every(Number.isFinite),site+' must be explicit on every reindexed frame');
          assert(point[0]>=0&&point[0]<=width&&point[1]>=0&&point[1]<=height,site+' belongs to the native crop');
        }
        const attached=resolvePoseAttachments(frame,'punch',clip.frames[facing].indexOf(frame),facing,fighter.id);
        assert.equal(attached.authored,true);
        assert.deepEqual([attached.grip.x,attached.grip.y],frame.attachments.grip);
      }
      assert.equal(new Set(hashes).size,8,'No fake duplicated frames');
      assert.deepEqual(clip.frames[facing].map((f,index)=>fighter.id==='mac-modem'?clip.nativeIdentityTransfer.phaseLineage[`${facing}/${index}`].originalPhaseOrigin:f.poseSource.kind),['approved','generated','approved','generated','approved','generated','approved','generated']);
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

// Mac's accepted identity correction retains phase provenance, not the old wrong pixels.
const macAcceptedSources={"right":[["punch-right-part1-v3.png",0,"01886a66e8c734446090caf0787c29d9e91e93e150a735a8aefb5127491927e7","75c27cc32f63f4326843551ae66627d26bf993afe04da1da1baa4ee49663ed07"],["punch-right-part1-v3.png",1,"01886a66e8c734446090caf0787c29d9e91e93e150a735a8aefb5127491927e7","9899dcd1424794dff42cd73b21f7ca677256cd15c25bc3e2798481d703a938ac"],["punch-right-part1-v3.png",2,"01886a66e8c734446090caf0787c29d9e91e93e150a735a8aefb5127491927e7","87519a5a6549a86847ca5fc9505e388ccac360196d3e4dc8b11a1286b853a1d4"],["punch-right-part1-v3.png",3,"01886a66e8c734446090caf0787c29d9e91e93e150a735a8aefb5127491927e7","6086ee98576d708b7efc1568f5d6bac59f0d9d142593919da06b11d14598f68b"],["native-batch-00-v3.png",0,"0098ad28315f4033bd722038d78c6f4f4cd2ca18db7ea4c963cb873f097db2cc","5d854485de4fb90384a4b628d2739386b2cfe68e93e3074084f02833cae00848"],["native-batch-00-v3.png",1,"0098ad28315f4033bd722038d78c6f4f4cd2ca18db7ea4c963cb873f097db2cc","db524781a53b8d2ca12c439f49d6f637251772d79e8dfe6cbcc167a8cac70dc5"],["native-batch-00-v3.png",2,"0098ad28315f4033bd722038d78c6f4f4cd2ca18db7ea4c963cb873f097db2cc","63b81383b6d689e7d9b4ed743d2a3b0c7163d6b4f49c330792e63b47dc0c208c"],["native-batch-00-v3.png",3,"0098ad28315f4033bd722038d78c6f4f4cd2ca18db7ea4c963cb873f097db2cc","61443ff8d90a08900af21ac35de43b0f3b3eef9ce8af3f3ac8e78fa9f1a1494a"]],"left":[["punch-left-part1-v3.png",0,"10bea48b8e3f9e3fed7b285c6a6f7a25d383ede1f6d3c9466f0c2d0c040014c2","91405d6c3315c2ec1c78652f0d0554f602223d2b23dbfc69d7fb0d12759be45b"],["punch-left-part1-v3.png",1,"10bea48b8e3f9e3fed7b285c6a6f7a25d383ede1f6d3c9466f0c2d0c040014c2","b4423789d58ceb0d8d8684e148209be4094453fc2e5d46937f978435d2cfe617"],["punch-left-part1-v3.png",2,"10bea48b8e3f9e3fed7b285c6a6f7a25d383ede1f6d3c9466f0c2d0c040014c2","ad2dc28698f4f9f0f522336cd67a3fd2bd2692ae05eaa4f1ac161308157f16fb"],["punch-left-part1-v3.png",3,"10bea48b8e3f9e3fed7b285c6a6f7a25d383ede1f6d3c9466f0c2d0c040014c2","869a37ebc3e317af3debefaa89b5f84bce370691c4d1634b27f9706f0ce44983"],["native-batch-01-v3.png",0,"b6248662f14b33e573082649e31cbd4e73a38bb6af872a612eaa48c4849e6af7","3769d33a2a9cb2ce26e94941ec56de4ec4790663f178ee16ff3dc18d66a13092"],["native-batch-01-v3.png",1,"b6248662f14b33e573082649e31cbd4e73a38bb6af872a612eaa48c4849e6af7","b8e502906fc87a4013f3e3435f1d5e496f5a12ccecb9436a3af46d4142215c3d"],["native-batch-01-v3.png",2,"b6248662f14b33e573082649e31cbd4e73a38bb6af872a612eaa48c4849e6af7","834f6ab9b19fb6d44816416009bf667072af712ad659e6af3201cbb801e2f4c3"],["native-batch-01-v3.png",3,"b6248662f14b33e573082649e31cbd4e73a38bb6af872a612eaa48c4849e6af7","e8744dc24e34f7a2297f6a88e2aba65013173d50d5be4e303de5a38733a56f41"]]};
function verifyMacTransfer(frame,raw,clip,index,facing,hash){
 const source=frame.poseSource,lineage=clip.nativeIdentityTransfer.phaseLineage[`${facing}/${index}`];
 assert.equal(source.kind,'native-identity-transfer');assert.deepEqual([source.sourceFile,source.cell,source.sourceSha256,frame.canonicalPixelSha256],macAcceptedSources[facing][index]);
 assert.equal(hash(raw),frame.canonicalPixelSha256);assert.equal(frame.pixelSha256,frame.canonicalPixelSha256);assert.notEqual(frame.pixelSha256,source.retainedOriginalRgbaSha256,'The approved correction is new art, never mislabeled unchanged original pixels');
 assert.equal(lineage.originalPhaseIndex,index);assert.equal(lineage.originalFile,source.retainedOriginalFile);assert.deepEqual(lineage.originalRect,source.retainedOriginalRect);assert.equal(lineage.originalRgbaSha256,source.retainedOriginalRgbaSha256);
 assert.ok(Number.isFinite(source.uniformResample)&&source.uniformResample>0);assert.equal(frame.bodyCalibration,1);assert.equal(frame.combatProfile.kind,'native-alpha-bands');assert.equal(frame.combatProfile.sourceSha256,clip.sourceSha256);assert.equal(frame.combatProfile.sourceRgbaSha256,frame.canonicalPixelSha256);
 const width=frame.rect[2],height=frame.rect[3];for(const site of ['grip','strike','strikeStart'])if(frame.attachments[site]){const[x,y]=frame.attachments[site];let alpha=0;for(let yy=Math.max(0,Math.floor(y)-1);yy<=Math.min(height-1,Math.ceil(y)+1);yy++)for(let xx=Math.max(0,Math.floor(x)-1);xx<=Math.min(width-1,Math.ceil(x)+1);xx++)alpha=Math.max(alpha,raw[(yy*width+xx)*4+3]);assert(alpha>=128,site+' must lie on decoded own native opaque hand/shoe within integer resample rounding');}
}
