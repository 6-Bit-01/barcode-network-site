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
    for(const frame of frames){
      const source=frame.nativeSource;assert.ok(source?.file);
      const [left,top,width,height]=frame.rect;
      const pixels=await sharp(encoded).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
      assert.equal(digest(pixels),frame.pixelSha256);
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
