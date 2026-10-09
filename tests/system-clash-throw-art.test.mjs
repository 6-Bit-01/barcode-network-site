import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {compileFightClip,loadFightArt,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex} from '../public/games/system-clash/play/fight-attachments.mjs';
const play=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url));
const root=path.join(play,'assets/fighters');
const ids=fs.readdirSync(root).filter(id=>fs.existsSync(path.join(root,id,'manifest.json')));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=id=>JSON.parse(fs.readFileSync(path.join(root,id,'manifest.json'),'utf8'));
for(const id of ids)test(`${id}: native throw contains intact grip lift and release poses`,async()=>{
  const manifest=read(id),data=manifest.clips.grab;
  assert.ok(data,'throw attacker must use a dedicated native grab sequence');
  const encoded=fs.readFileSync(path.join(root,id,data.file)),dimensions=await sharp(encoded).metadata();
  assert.deepEqual(data.sourceSize,[dimensions.width,dimensions.height]);
  assert.equal(digest(encoded),data.sourceSha256);
  const asset=compileFightClip(data,dimensions,manifest,'grab');
  assert.equal(asset.timeline.duration,670);
  assert.equal(data.contactMs,180);assert.equal(data.liftMs,310);assert.equal(data.releaseMs,480);
  for(const facing of ['right','left']){
    const frames=data.frames[facing];assert.equal(frames.length,6);
    assert.equal(new Set(frames.map(frame=>frame.pixelSha256)).size,6,'six real different whole-body phases');
    for(const[index,frame]of frames.entries()){
      const source=frame.nativeSource;if(id!=='mac-modem')assert.ok(source?.file);
      const [left,top,width,height]=frame.rect;
      const pixels=await sharp(encoded).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
      assert.equal(digest(pixels),frame.pixelSha256);
      if(id==='mac-modem'){verifyMacTransfer(frame,pixels,data,index,facing,digest);continue;}
      const [sx,sy,sw,sh]=source.rect;
      const original=await sharp(path.join(play,source.file)).extract({left:sx,top:sy,width:sw,height:sh}).ensureAlpha().raw().toBuffer();
      assert.deepEqual(pixels,original,'native body crops retain actual original RGBA pixels');
      assert.equal(frame.pixelSha256,source.pixelSha256);assert.ok(frame.attachments.grip);
    }
    assert.equal(poseFrameIndex(asset,{clip:'grab',facing,elapsed:180}),2);
    assert.equal(poseFrameIndex(asset,{clip:'grab',facing,elapsed:310}),3);
    assert.equal(poseFrameIndex(asset,{clip:'grab',facing,elapsed:480}),4);
  }
  const metadata=combatMetadata([{manifest,clips:{grab:asset}}])[0].grab;
  assert.equal(metadata.releaseMs,480);assert.equal(metadata.liftMs,310);
});

test('production loader includes all present grab variants, authored timing and selected fighters only',async()=>{
  const manifests={'doofnoobler':read('doofnoobler'),'9-bit':read('9-bit')};
  manifests.doofnoobler.clips['grab-high'].liftMs=329;manifests.doofnoobler.clips['grab-high'].releaseMs=499;
  manifests['9-bit'].clips['grab-low'].liftMs=337;manifests['9-bit'].clips['grab-low'].releaseMs=507;
  const originalImage=globalThis.Image,loaded=[],progress=[];
  globalThis.Image=class {set src(value){loaded.push(value);sharp(path.join(play,new URL(value).pathname)).metadata().then(size=>{this.width=size.width;this.height=size.height;this.onload();},error=>this.onerror(error));}};
  try{
    const art=await loadFightArt({ids:['doofnoobler','9-bit'],bundle:{manifests,images:{}},baseURL:'https://system-clash.invalid/',onProgress:(done,total)=>progress.push([done,total])});
    assert.ok(art[0].clips.grab);assert.ok(art[0].clips['grab-high']);assert.ok(art[1].clips['grab-low']);
    const metadata=combatMetadata(art);
    assert.equal(metadata[0]['grab-high'].liftMs,329);assert.equal(metadata[0]['grab-high'].releaseMs,499);
    assert.equal(metadata[1]['grab-low'].liftMs,337);assert.equal(metadata[1]['grab-low'].releaseMs,507);
    assert.deepEqual(progress.at(-1),[24,24]);
    assert.ok(loaded.every(url=>/\/(doofnoobler|9-bit)\//.test(new URL(url).pathname)),'only requested fighters demand-load');
    const legacy=structuredClone(manifests.doofnoobler);for(const name of ['grab','grab-low','grab-high'])delete legacy.clips[name];
    const [old]=await loadFightArt({ids:['doofnoobler'],bundle:{manifests:{doofnoobler:legacy},images:{}},baseURL:'https://system-clash.invalid/'});
    for(const name of ['grab','grab-low','grab-high'])assert.equal(old.clips[name],undefined);
  }finally{globalThis.Image=originalImage;}
});

// Mac's accepted identity correction retains phase provenance, not the old wrong pixels.
const macAcceptedSources={"right":[["idle-right-v3.png",0,"8bd7439de25fe75373e6e359f8471c4e1e1cdceeb869e8e0008bf201b261ba7f","6a02365e189eea6e4fe0bd2daefc89408afd91731f63527d85c47287f3ab71c1"],["native-batch-23-v3.png",2,"5691b70a398cbb09b3ad2bbbc63df7f2d7afb127649c12a9b6e8af8407e88c55","4480446999e6d133405c2501209398c77b7554332aff6137e4675c8972b2711d"],["native-batch-23-v3.png",3,"5691b70a398cbb09b3ad2bbbc63df7f2d7afb127649c12a9b6e8af8407e88c55","c63a6b16e403f6ff06b70eaa3ba059e81b6275dbdba137504d0b2dc7ce76caeb"],["native-batch-24-v3.png",0,"615c77412a39976d31dfa99b8138387318baba3d37f61585e29165a053a2676c","01932c634722f60b87f8a5e6bf489755ff51e0764780d3d466d7417640d45fb2"],["native-batch-24-v3.png",1,"615c77412a39976d31dfa99b8138387318baba3d37f61585e29165a053a2676c","2f3ec97be72c2ab75a0c6878ffccc481ff95f8cc4aa41195e96facfdcbd40eec"],["native-batch-24-v3.png",2,"615c77412a39976d31dfa99b8138387318baba3d37f61585e29165a053a2676c","70d6d5ef23acb4fdb92fbe7b40d44a3e07f8db5737bc36abdf777f3f80bd4a78"]],"left":[["idle-left-v3.png",0,"c939623f9d8fe1772155a5e5025a59a8caf3bf1ea952912449cca440cc8d680b","b06b9b03e4d042e58db806a790539f07ffd4d19ad9efe970ce988e27a9600dc4"],["native-batch-24-v3.png",3,"615c77412a39976d31dfa99b8138387318baba3d37f61585e29165a053a2676c","b673563578ff7a37b2c01c77b7e708ab5a1c48df2d6b3ee92d433af10726aa70"],["native-batch-25-v3.png",0,"a090b38fd9c6997277a96bf82ea5ca7ef8167b68ee0a7f720c5c8f4f4a7434ee","b81b63182d666fdc0876cdfa0d6842430c13292b22a9b02975b9b8f9b485ec7d"],["native-batch-25-v3.png",1,"a090b38fd9c6997277a96bf82ea5ca7ef8167b68ee0a7f720c5c8f4f4a7434ee","21968297fc925db5164ae1b1e90eb0fc4bdc57ec2950c37ecf8aaa455ea12d57"],["native-batch-25-v3.png",2,"a090b38fd9c6997277a96bf82ea5ca7ef8167b68ee0a7f720c5c8f4f4a7434ee","1c0b22ed2bc59ab810c921da5f4fa9b09b856fde49c92e04c6b1b1512b3f26d4"],["native-batch-25-v3.png",3,"a090b38fd9c6997277a96bf82ea5ca7ef8167b68ee0a7f720c5c8f4f4a7434ee","aa29b4f25551721e285112b36072f14461b2cc2a7d622a012d0824816dccd1a8"]]};
function verifyMacTransfer(frame,raw,clip,index,facing,hash){
 const source=frame.poseSource,lineage=clip.nativeIdentityTransfer.phaseLineage[`${facing}/${index}`];
 assert.equal(source.kind,'native-identity-transfer');assert.deepEqual([source.sourceFile,source.cell,source.sourceSha256,frame.canonicalPixelSha256],macAcceptedSources[facing][index]);
 assert.equal(hash(raw),frame.canonicalPixelSha256);assert.equal(frame.pixelSha256,frame.canonicalPixelSha256);assert.notEqual(frame.pixelSha256,source.retainedOriginalRgbaSha256,'The approved correction is new art, never mislabeled unchanged original pixels');
 assert.equal(lineage.originalPhaseIndex,index);assert.equal(lineage.originalFile,source.retainedOriginalFile);assert.deepEqual(lineage.originalRect,source.retainedOriginalRect);assert.equal(lineage.originalRgbaSha256,source.retainedOriginalRgbaSha256);
 assert.ok(Number.isFinite(source.uniformResample)&&source.uniformResample>0);assert.equal(frame.bodyCalibration,1);assert.equal(frame.combatProfile.kind,'native-alpha-bands');assert.equal(frame.combatProfile.sourceSha256,clip.sourceSha256);assert.equal(frame.combatProfile.sourceRgbaSha256,frame.canonicalPixelSha256);
 const width=frame.rect[2],height=frame.rect[3];for(const site of ['grip','strike','strikeStart'])if(frame.attachments[site]){const[x,y]=frame.attachments[site];let alpha=0;for(let yy=Math.max(0,Math.floor(y)-1);yy<=Math.min(height-1,Math.ceil(y)+1);yy++)for(let xx=Math.max(0,Math.floor(x)-1);xx<=Math.min(width-1,Math.ceil(x)+1);xx++)alpha=Math.max(alpha,raw[(yy*width+xx)*4+3]);assert(alpha>=128,site+' must lie on decoded own native opaque hand/shoe within integer resample rounding');}
}
