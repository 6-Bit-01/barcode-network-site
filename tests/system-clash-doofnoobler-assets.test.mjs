import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
const play=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url));
const lab=fileURLToPath(new URL('../../animation-lab/',import.meta.url));
const id='doofnoobler';
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=bank=>read(join(play,'assets',bank,id,'manifest.json'));
const expected={fighters:['idle','punch','high','low','walk','crouch','block','kick','grabbed','thrown','knockdown','getup'],arcade:['low-punch','low-kick','jump','uppercut','crouch-punch','crouch-kick','jump-punch','jump-kick','pickup','crouch-high-kick','double-punch','power-kick'],deletions:['shove','pull','stomp','present','brace','suspended','compressed','crumpled','hug']};
test('Doof has complete native public banks and credible per-frame provenance',()=>{
 for(const [bank,names] of Object.entries(expected)){
  const m=manifest(bank),dir=join(play,'assets',bank,id);assert.equal(m.height,220);assert.equal(m.scale,1);assert.deepEqual(Object.keys(m.clips).sort(),names.slice().sort());
  for(const [name,c] of Object.entries(m.clips)){
   assert.ok(existsSync(join(dir,c.file)),`${bank}/${name}`);assert.equal(digest(join(dir,c.file)),c.sourceSha256);
   const compiled=compileFightClip(c,{width:c.sourceSize[0],height:c.sourceSize[1]},m,name);assert.ok(compiled.timeline.duration>0&&compiled.timeline.duration<3000);
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


test('local-only Doof original source hashes and public/private asset parity',{skip:!existsSync(lab)},()=>{
 const hashes=new Map(),cachedDigest=path=>{if(!hashes.has(path))hashes.set(path,digest(path));return hashes.get(path);};
 for(const bank of Object.keys(expected)){
  const m=manifest(bank),dir=join(play,'assets',bank,id),privateDir=join(lab,'assets',bank,id);
  assert.equal(cachedDigest(join(dir,'manifest.json')),cachedDigest(join(privateDir,'manifest.json')));
  for(const c of Object.values(m.clips)){
   assert.equal(cachedDigest(join(dir,c.file)),cachedDigest(join(privateDir,c.file)));
   for(const facing of ['right','left'])for(const frame of c.frames[facing])assert.equal(cachedDigest(join(lab,'assets','new-fighters-20261008',id,frame.poseSource.sourceFile)),frame.poseSource.sourceSha256);
  }
 }
 for(const suffix of ['idle.webp','idle.json','portrait.webp','standing.webp'])assert.equal(cachedDigest(join(play,'assets','menu',`${id}-${suffix}`)),cachedDigest(join(lab,'assets','menu',`${id}-${suffix}`)));
});
