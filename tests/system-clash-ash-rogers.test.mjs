import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseScale,resolvePoseAttachments} from '../public/games/system-clash/play/fight-attachments.mjs';
const ROOT=new URL('../public/games/system-clash/play/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SOURCES={"arcade-crouch-combo.png":"8b29f25552c09578f28e8d852dc2b1e5b77ccb1e0708c3dd50375ee56185065f","arcade-crouch-low.png":"c78fe207057816f2f346f539e22b89e4da24e2805a4e522edccf045699666333","arcade-jump-attacks.png":"499d244904474c354c3c6be8b53a68dcfda10d2217176a3724c2e9035857c89e","arcade-jump.png":"22a26d01519a3825bb5acd8fcea316cb5cb1a4e9783c2240f0c26b1b179e42de","arcade-low-kick-v2.png":"5d63bcaa4f190fcbb9f06aa45b0c4b6c901c2dc42ff2a832f22e89265c0a6374","arcade-low-punch-v2.png":"343c34099191f2ab6a14edac9066cea6ba00fb3e541567725d0816d6ad387d93","arcade-pickup.png":"251dbbaa0f22f1706deb1788c5408e0a1ed34eb98e2e1495306e166ceb2e9cf2","arcade-uppercut-v2.png":"e87523840acc709a089542bd716bb8b27eaf4c2283d430ab932410f4ad24da27","combat.png":"71bade1cd71a55d755a2dcdea3f1a3b6d0e75a60f5bec196cf5bae4cc98c2126","defense-kick-v2.png":"95db78afa33e4f00e27aac05454957bfe967aa257683de92bc7fa103559598d7","deletion-shove-present.png":"af1738c1308479304cee3223873caa4d70651f642085b24a9425c2f0633bc00f","deletion-suspended-front.png":"1ef096b48cf8488da9226f91090e22d5614d336128c766ac6b356b69e5ca37c6","floor-v2.png":"3506d0c783206494292ab0a8540a874f452dcfe6d7412c3e1583df382034ddc1","grip-lift-release.png":"50756c9bf1b870f34169cdd3a3d38d8ec0a278359482b6e9a9fab634cad72074","grip-low-stomp.png":"0c29e6e6a013f616a81a59bed291964a5ba4b6c9c991b52ae11fa4cfb930dc64","grip-reach-contact.png":"acf2a846d6f6599a20a836530d28c731654f1b6a78914d60e8456a4472f7131a","hurt-v3.png":"9d5f76b8d1243889a35d83036de2d1b7b2b0f387cc106909e9ca03f35bb6cb45","movement-v2.png":"5f6d384db0d0125227c85240b958b75a170dd6a75da3a96b1ff0f781424d58de","restraints-v3.png":"d3994d893004e28e29d695d502d389841f15921cf1fdb418fdc39356e08bf09a"};
const bank=name=>JSON.parse(readFileSync(new URL('assets/'+name+'/ash-flowers/manifest.json',ROOT),'utf8'));
const base=bank('fighters'),arcade=bank('arcade'),utilities=bank('deletions');
const BASE={idle:['combat.png',0,1],punch:['combat.png',2,3],high:['hurt-v3.png',0,1],low:['hurt-v3.png',2,3],walk:['movement-v2.png',0,1],crouch:['movement-v2.png',2,3],block:['defense-kick-v2.png',0,1],kick:['defense-kick-v2.png',2,3],grabbed:['restraints-v3.png',0,1],thrown:['restraints-v3.png',2,3],knockdown:['floor-v2.png',0,1],getup:['floor-v2.png',2,3]};
const cache=new Map();
async function pixels(path){if(!cache.has(path.href))cache.set(path.href,sharp(readFileSync(path)).ensureAlpha().raw().toBuffer({resolveWithObject:true}));return cache.get(path.href);}
function rawFrame(decoded,f){const [x,y,w,h]=f.rect,raw=Buffer.alloc(w*h*4);for(let row=0;row<h;row++)decoded.data.copy(raw,row*w*4,((y+row)*decoded.info.width+x)*4,((y+row)*decoded.info.width+x+w)*4);return raw;}
test('Ash Rogers main skin retains all 96 approved base keys from the six exact approved sources',()=>{
 let keys=0;assert.equal(base.skin.id,'ash-rogers');
 for(const [name,[file,right,left]]of Object.entries(BASE)){
  const c=base.clips[name];
  for(const facing of ['right','left']){
   assert.equal(c.frames[facing].length,4);
   for(const [i,f]of c.frames[facing].entries()){
    const expectedCell=name==='getup'&&i===0?(facing==='right'?3:7):(facing==='right'?right:left)*4+i;
    assert.equal(f.poseSource.sourceFile,file);assert.equal(f.poseSource.cell,expectedCell);
    assert.equal(f.poseSource.sourceSha256,SOURCES[file]);assert.equal(f.poseSource.kind,'approved-rogers-base');keys++;
   }
  }
 }
 assert.equal(keys,96);assert.deepEqual(base.clips.walk.order,[0,1,2,3]);assert.deepEqual(base.clips.walk.frameMs,[150,150,150,150]);
 assert.deepEqual(base.clips.punch.frameMs,[90,80,110,100,90]);assert.equal(base.clips.punch.contactMs,170);assert.equal(base.clips.kick.contactMs,200);
});
test('Every Ash Rogers runtime pose uses an exact retained own source and a complete measured native crop',async()=>{
 let keys=0;
 for(const name of ['fighters','arcade','deletions']){
  const m=bank(name);assert.equal(m.skin.id,'ash-rogers');assert.equal(m.id,name==='fighters'?'ash-flowers':name==='arcade'?'ash-flowers-arcade-actions':'ash-flowers-deletion-utilities');
  for(const [clipName,c]of Object.entries(m.clips)){
   const path=new URL('assets/'+name+'/ash-flowers/'+c.file,ROOT),bytes=readFileSync(path),decoded=await pixels(path);
   assert.equal(c.sourceSha256,sha(bytes));assert.deepEqual(c.sourceSize,[decoded.info.width,decoded.info.height]);
   for(const facing of ['right','left'])for(const [i,f]of c.frames[facing].entries()){
    const tag=name+'/'+clipName+'/'+facing+'/'+i;assert.equal(f.poseSource.sourceSha256,SOURCES[f.poseSource.sourceFile],tag);
    if(!Object.values(BASE).some(v=>v[0]===f.poseSource.sourceFile))assert(f.poseSource.cell>=0&&f.poseSource.cell<4,'Each new source has four large complete independent poses');
    assert(!f.parts&&!f.warp&&!f.sculpt,tag+' stays one whole native source image');
    for(const site of ['head','torso','legs','grip']){const p=f.attachments[site];assert(p?.length===2&&p.every(Number.isFinite),tag+' '+site);assert(p[0]>=0&&p[0]<=f.rect[2]&&p[1]>=0&&p[1]<=f.rect[3]);}
    assert.equal(sha(rawFrame(decoded,f)),f.pixelSha256,tag+' decoded pixels are reproducible');
    assert(Math.abs(f.anchor[1]-f.opaqueBounds[3])<=1,tag+' uses actual native bottom');
    assert.equal(f.combatProfile.kind,'native-alpha-bands');assert(f.combatHurt.length>0);
    assert.equal(f.combatProfile.sourceRgbaSha256,sha(rawFrame(decoded,f)));keys++;
   }
  }
 }
 assert.equal(keys,246);
});
test('Ash Rogers contextual actions preserve existing contact, active hold and total timing with real native impacts',()=>{
 const expected={'crouch-punch':[110,240,'arcade-crouch-low.png',0],'crouch-kick':[160,320,'arcade-crouch-low.png',1],'jump-punch':[100,260,'arcade-jump-attacks.png',0],'jump-kick':[100,300,'arcade-jump-attacks.png',1]};
 for(const [name,[contact,hold,source,cell]]of Object.entries(expected)){
  const c=arcade.clips[name];assert.deepEqual(c.order,[0,1]);assert.deepEqual(c.frameMs,[contact,hold]);assert.equal(c.contactMs,contact);assert.equal(c.activeEndMs,contact+hold);
  for(const facing of ['right','left']){const f=c.frames[facing][1];assert.equal(f.poseSource.sourceFile,source);assert.equal(f.poseSource.cell,cell+(facing==='left'?2:0));assert.equal(f.poseSource.sourceSha256,SOURCES[source]);}
 }
 for(const name of ['grab','grab-low'])for(const facing of ['right','left'])for(const f of base.clips[name].frames[facing])assert.equal(f.nativeSource.kind,'canonical-native-atlas');
});
test('Ash Rogers own floor recovery and exact utility reuse do not substitute another skin',()=>{
 for(const facing of ['right','left']){
  assert.deepEqual(base.clips.knockdown.frames[facing].at(-1),base.clips.getup.frames[facing][0]);
  for(const [utility,clip,indexes]of [['brace','block',[1,2]],['compressed','low',[1,2]],['crumpled','knockdown',[2,3]]])for(const [i,index]of indexes.entries())assert.equal(utilities.clips[utility].frames[facing][i].canonicalPixelSha256,base.clips[clip].frames[facing][index].canonicalPixelSha256);
  const f=utilities.clips['rip-front'].frames[facing][0];assert.equal(f.poseSource.sourceFile,'deletion-suspended-front.png');assert.equal(f.attachments.ripCut[0],f.rect[2]/2);
 }
});
test('Ash Rogers attack registration follows the approved idle body station without changing native art',()=>{
 for(const facing of ['right','left']){
  const idle=base.clips.idle,frame=idle.frames[facing][0],image={width:idle.sourceSize[0],height:idle.sourceSize[1]},asset=compileFightClip(idle,image,base,'idle'),p=resolvePoseAttachments(frame,'idle',0,facing,'ash-flowers'),target=(p.torso.x-frame.anchor[0])*poseScale(asset,frame);
  for(const m of [base,arcade])for(const [name,c]of Object.entries(m.clips)){
   if(!['punch','kick','low-punch','low-kick','uppercut','crouch-punch','crouch-kick','jump-punch','jump-kick','crouch-high-kick','double-punch','power-kick','walk'].includes(name))continue;
   const a=compileFightClip(c,{width:c.sourceSize[0],height:c.sourceSize[1]},m,name);
   for(const [i,f]of c.frames[facing].entries()){const site=resolvePoseAttachments(f,name,i,facing,'ash-flowers').torso;assert(Math.abs((site.x-f.anchor[0])*poseScale(a,f)-target)<.05,name+' '+facing+' '+i);}
  }
 }
});
test('Ash Rogers portrait, standing and idle assets are derived from the same approved own idle bank',async()=>{
 const menu=JSON.parse(readFileSync(new URL('assets/menu/ash-flowers-idle.json',ROOT),'utf8'));assert.equal(menu.skin.id,'ash-rogers');assert.equal(menu.sourceSha256,base.clips.idle.sourceSha256);
 assert.equal(sha(readFileSync(new URL('assets/menu/ash-flowers-idle.webp',ROOT))),base.clips.idle.sourceSha256);
 for(const suffix of ['portrait','standing']){const image=await sharp(readFileSync(new URL('assets/menu/ash-flowers-'+suffix+'.webp',ROOT))).metadata();assert(image.hasAlpha);assert(image.width>0&&image.height>0);}
});
test('Ash Rogers physical profiles use measured own cardigan trunk and separate leg bands',()=>{for(const name of ['idle','crouch','grab-low'])for(const facing of ['right','left'])for(const f of base.clips[name].frames[facing]){const p=f.combatPush;assert.equal(p.kind,'own-native-trunk-and-separate-leg-alpha');assert.equal(p.alphaThreshold,48);assert(p.core.length===4&&p.core.every(Number.isFinite));assert(p.core[2]>p.core[0]&&p.core[3]>p.core[1]);assert(p.core[2]-p.core[0]<f.opaqueBounds[2]-f.opaqueBounds[0]);assert(p.legs.length>=1);for(const r of p.legs)assert(r.length===4&&r[2]>r[0]&&r[3]>r[1]);}});
