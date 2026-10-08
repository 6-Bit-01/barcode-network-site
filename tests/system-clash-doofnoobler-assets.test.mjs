import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
const play=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url));
const lab=fileURLToPath(new URL('../../animation-lab/',import.meta.url));
const id='doofnoobler';
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=bank=>read(join(play,'assets',bank,id,'manifest.json'));
const expected={fighters:['idle','punch','high','low','walk','crouch','block','kick','grabbed','thrown','knockdown','getup'],arcade:['low-punch','low-kick','jump','uppercut','crouch-punch','crouch-kick','jump-punch','jump-kick','pickup','crouch-high-kick','double-punch','power-kick'],deletions:['shove','pull','stomp','present','brace','suspended','compressed','crumpled','hug','hug-happy','rip-front']};
const hangingExpected={"scale":0.42,"region":[512,0,1024,672],"sourceSha256":"0d294672aeba9df840ebb6f04375c22268e9f8085cfd03078c252c1c2ba79978","originalBytes":2599121,"rgbaSha256":"8516220b884b953617a1d7307a2fd197e7363e73f23e046c8b71c8d8b7065c30","regionRgbaSha256":"d176c5072744b624d1d80bc7f8fdae0789d0857c18a118eadd3d9d9236e036ba"};
const hangingHash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function assertHangingSource(clip,dir){
 const source=clip.frontPoseSource,expected=hangingExpected;assert.equal(clip.poseRole,'airborne');assert.equal(clip.scale,expected.scale);assert.deepEqual(clip.order,[0]);assert.deepEqual(clip.frames.left,clip.frames.right);assert.equal(clip.frames.right.length,1);
 assert.equal(source.sourceKind,'approved-four-character-airborne-sheet');assert.equal(source.originalFile,'lift-four-airborne-approved-sheet-4-v1.png');assert.equal(source.originalBytes,expected.originalBytes);assert.deepEqual(source.originalSize,[1024,1536]);assert.equal(source.originalSha256,expected.sourceSha256);assert.deepEqual(source.sourceRegion,expected.region);assert.equal(source.nativeAnatomy.resultScale,expected.scale);assert.match(source.nativeAnatomy.method,/skull, chest and limb widths/);
 const bytes=readFileSync(join(dir,clip.file));assert.equal(hangingHash(bytes),clip.sourceSha256);const image=sharp(bytes),metadata=await image.metadata();assert.deepEqual(clip.sourceSize,[metadata.width,metadata.height]);const rgba=await image.ensureAlpha().raw().toBuffer();assert.equal(hangingHash(rgba),expected.rgbaSha256);assert.equal(hangingHash(rgba),source.nativeRgbaSha256);
 const [left,top,right,bottom]=source.sourceRegion,crop=source.crop;const region=await sharp(rgba,{raw:{width:metadata.width,height:metadata.height,channels:4}}).extract({left:-crop[0],top:-crop[1],width:right-left,height:bottom-top}).raw().toBuffer();assert.equal(hangingHash(region),expected.regionRgbaSha256);assert.equal(hangingHash(region),source.regionRgbaSha256);
 for(const facing of ['right','left'])for(const frame of clip.frames[facing]){assert.equal(frame.nativeFacing,'front');assert.equal(frame.bodyCalibration,1);assert.deepEqual(frame.rect,[0,0,metadata.width,metadata.height]);assert.equal(frame.anchor[0],metadata.width/2);assert.deepEqual(frame.attachments.ripCut,frame.attachments.torso);assert.equal(frame.attachments.ripCut[0],metadata.width/2);assert.equal(frame.poseSource,undefined,'Sheet-derived complete pose retains clip frontPoseSource rather than invented legacy native-atlas provenance');for(const point of Object.values(frame.attachments))assert(point.every(Number.isFinite)&&point[0]>=0&&point[1]>=0&&point[0]<=frame.rect[2]&&point[1]<=frame.rect[3]);}
}

test('Doof retains native public banks and validates the added sheet-derived hanging source',async()=>{
 for(const [bank,names] of Object.entries(expected)){
  const m=manifest(bank),dir=join(play,'assets',bank,id);assert.equal(m.height,220);assert.equal(m.scale,1);assert.deepEqual(Object.keys(m.clips).sort(),names.slice().sort());
  for(const [name,c] of Object.entries(m.clips)){
   assert.ok(existsSync(join(dir,c.file)),`${bank}/${name}`);assert.equal(digest(join(dir,c.file)),c.sourceSha256);
   const compiled=compileFightClip(c,{width:c.sourceSize[0],height:c.sourceSize[1]},m,name);assert.ok(compiled.timeline.duration>0&&compiled.timeline.duration<3000);
   if(name==='rip-front'){assert.equal(bank,'deletions');await assertHangingSource(c,dir);continue;}
   for(const facing of ['right','left'])for(const f of c.frames[facing]){
    const [x,y,w,h]=f.rect;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=c.sourceSize[0]&&y+h<=c.sourceSize[1]);
    assert.match(f.pixelSha256,/^[0-9a-f]{64}$/);assert.match(f.canonicalPixelSha256,/^[0-9a-f]{64}$/);assert.ok(['generated','reused-native'].includes(f.poseSource.kind));
    assert.match(f.poseSource.sourceFile,/^[a-z0-9-]+\.png$/);assert.match(f.poseSource.sourceSha256,/^[0-9a-f]{64}$/);assert.ok(f.poseSource.uniformResample>0&&f.poseSource.uniformResample<1);
    for(const site of ['head','torso','legs','grip']){const p=f.attachments[site];assert.equal(p.length,2);assert.ok(p.every(Number.isFinite));assert.ok(p[0]>=0&&p[0]<=w&&p[1]>=0&&p[1]<=h);}
   }
  }
 }
});
test('knockdown and recovery share the exact native seated frame in the same encoded atlas',()=>{
 const m=manifest('fighters'),a=m.clips.knockdown,b=m.clips.getup;assert.equal(a.file,b.file);
 for(const facing of ['right','left']){assert.deepEqual(a.frames[facing].at(-1),b.frames[facing][0]);assert.equal(a.frames[facing].at(-1).poseSource.sourceFile,'base-grabbed-thrown-v1.png');assert.equal(a.frames[facing].at(-1).poseSource.cell,facing==='right'?11:15);}
});
test('eight punch keys have full extension contact and honest source order in each facing',()=>{
 const p=manifest('fighters').clips.punch;assert.deepEqual(p.order,[0,1,2,3,4,5,6,7,0]);assert.equal(p.contactMs,170);assert.equal(p.activeEndMs,280);assert.equal(p.frameMs.reduce((a,b)=>a+b),470);
 assert.deepEqual(p.frames.right.map(f=>f.poseSource.cell),[0,1,2,4,3,5,6,7]);assert.deepEqual(p.frames.left.map(f=>f.poseSource.cell),[8,9,10,11,12,13,14,15]);
 for(const facing of ['right','left'])assert.equal(new Set(p.frames[facing].map(f=>f.canonicalPixelSha256)).size,8);
});
test('hug contact uses low forward mittens and records five real keys with one repeated hold',()=>{
 const c=manifest('deletions').clips.hug;assert.equal(c.contactMs,300);assert.equal(c.frameMs.reduce((a,b)=>a+b),1100);
 for(const facing of ['right','left']){assert.equal(c.frames[facing].length,6);assert.equal(c.frames[facing][2].poseSource.cell,facing==='right'?2:6);assert.equal(c.frames[facing][2].poseSource.sourceFile,'base-grabbed-thrown-v1.png');assert.equal(c.frames[facing][2].canonicalPixelSha256,c.frames[facing][3].canonicalPixelSha256);assert.equal(new Set(c.frames[facing].map(f=>f.canonicalPixelSha256)).size,5);assert.ok(c.frames[facing].every(f=>f.poseSource.kind==='reused-native'));}
});
test('pickup and rising low kick contacts stay on the actual authored hand and foot',()=>{
 const base=manifest('fighters'),arc=manifest('arcade');const clips={...base.clips,...arc.clips};const art={manifest:base,clips:Object.fromEntries(Object.entries(clips).map(([name,c])=>[name,compileFightClip(c,{width:c.sourceSize[0],height:c.sourceSize[1]},base,name)]))};const meta=combatMetadata([art])[0];
 for(const facing of ['right','left']){
  const hand=meta.pickup.pickupOrigins[facing];assert.ok(-hand.y>=5&&-hand.y<=25,`${facing} pickup hand near floor: ${-hand.y}`);
  const c=arc.clips['low-kick'];const entry=meta['low-kick'].combatPoses.entries.find(e=>c.contactMs>=e.start&&c.contactMs<e.end);const foot=meta['low-kick'].combatPoses.frames[facing][entry.index].strike;
  assert.ok(-foot.y>=65&&-foot.y<=105,`${facing} actual kick foot: ${-foot.y}`);assert.ok(facing==='right'?foot.x>0:foot.x<0);
 }
});
test('menu derivatives exist and preserve native idle metadata',()=>{
 for(const suffix of ['idle.webp','idle.json','portrait.webp','standing.webp']){const p=join(play,'assets','menu',`${id}-${suffix}`);assert.ok(existsSync(p));}
 const m=read(join(play,'assets','menu',`${id}-idle.json`));assert.equal(m.groundY,430);assert.deepEqual(m.canvasSize,[320,440]);assert.deepEqual(m.frames,manifest('fighters').clips.idle.frames);assert.equal(m.sourceSha256,digest(join(play,'assets','fighters',id,manifest('fighters').clips.idle.file)));
});

test('airborne kick weapon grip stays in the raised native mitten rather than its cuff or toe',()=>{
 const c=manifest('arcade').clips['jump-kick'];
 for(const facing of ['right','left']){
  const f=c.frames[facing][1],g=f.attachments.grip,s=f.attachments.strike;
  const above=f.anchor[1]-g[1];assert.ok(above>=120&&above<=135,`${facing} raised mitten center height ${above}`);
  assert.ok(Math.hypot(g[0]-s[0],g[1]-s[1])>=40,'Weapon remains in hand, separated from attacking foot');
 }
});


test('local-only Doof original source hashes and public/private asset parity',{skip:!existsSync(lab)},async()=>{
 const hashes=new Map(),cachedDigest=path=>{if(!hashes.has(path))hashes.set(path,digest(path));return hashes.get(path);};
 for(const bank of Object.keys(expected)){
  const m=manifest(bank),dir=join(play,'assets',bank,id),privateDir=join(lab,'assets',bank,id);
  assert.equal(cachedDigest(join(dir,'manifest.json')),cachedDigest(join(privateDir,'manifest.json')));
  for(const c of Object.values(m.clips)){
   assert.equal(cachedDigest(join(dir,c.file)),cachedDigest(join(privateDir,c.file)));
   if(bank==='deletions'&&c===m.clips['rip-front']){const source=c.frontPoseSource,original=join(lab,'..','..','scratch','visual-sound-20261008',source.originalFile);assert.equal(cachedDigest(original),source.originalSha256);const metadata=await sharp(original).metadata();assert.deepEqual([metadata.width,metadata.height],source.originalSize);const [left,top,right,bottom]=source.sourceRegion;const region=await sharp(original).extract({left,top,width:right-left,height:bottom-top}).ensureAlpha().raw().toBuffer();assert.equal(hangingHash(region),source.regionRgbaSha256);for(const reference of source.identityReferences)assert.equal(cachedDigest(reference.path),reference.sha256);}else{for(const facing of ['right','left'])for(const frame of c.frames[facing])assert.equal(cachedDigest(join(lab,'assets','new-fighters-20261008',id,frame.poseSource.sourceFile)),frame.poseSource.sourceSha256);}
  }
 }
 for(const suffix of ['idle.webp','idle.json','portrait.webp','standing.webp'])assert.equal(cachedDigest(join(play,'assets','menu',`${id}-${suffix}`)),cachedDigest(join(lab,'assets','menu',`${id}-${suffix}`)));
});
