import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex} from '../public/games/system-clash/play/fight-attachments.mjs';
import {createMatch,advanceMatch,performAction,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
const root=new URL('../public/games/system-clash/play/assets/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
function art(id){let manifest;const clips={};for(const bank of ['fighters','arcade','deletions']){const m=JSON.parse(readFileSync(new URL(bank+'/'+id+'/manifest.json',root)));if(bank==='fighters')manifest=m;for(const [name,c]of Object.entries(m.clips)){const frames=Object.values(c.frames).flat(),size={width:Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),height:Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))},key=bank==='deletions'?'delete-'+name:name;clips[key]=compileFightClip(c,size,m,key);}}return {manifest,clips};}
const native=art('bnl-01'),idle=native.clips.idle.data;
for(const name of ['grab','grab-low'])for(const facing of ['right','left'])test('BNL '+name+' retains six distinct own phases and carries from the opaque FRONT fist '+facing,async()=>{
 const asset=native.clips[name],c=asset.data;assert.equal(asset.timeline.duration,670);assert.deepEqual(c.frameMs,[70,70,90,150,170,120]);assert.deepEqual([c.contactMs,c.liftMs,c.releaseMs],[180,310,480]);
 const frames=c.frames[facing];assert.equal(frames.length,6);assert.equal(new Set(frames.map(f=>f.pixelSha256)).size,6);assert.equal(frames[0].pixelSha256,idle.frames[facing][0].pixelSha256);assert.equal(frames[5].pixelSha256,idle.frames[facing][1].pixelSha256);
 assert.deepEqual(frames.slice(1,5).map(f=>[f.poseSource.sourceFile,f.poseSource.cell]),Array.from({length:4},(_,i)=>['bnl-grapple.png',i]));
 const index=poseFrameIndex(asset,{facing,elapsed:310}),f=frames[index],dir=facing==='right'?1:-1;assert.equal(index,3);assert.deepEqual(f.attachments.grip,facing==='right'?[328,173]:[47,173]);assert((f.attachments.grip[0]-f.anchor[0])*dir>90,'Rear fist would drag the captive backwards');
 const encoded=readFileSync(new URL('fighters/bnl-01/'+c.file,root));assert.equal(sha(encoded),'4108fdcac5b522dc8ead7463c36bcbb5207a2f6b0af5b3a3f10a6f0dd56e9a50','Accepted entire native atlas remains byte exact');
 const [left,top,width,height]=f.rect,pixels=await sharp(encoded).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();assert.equal(sha(pixels),f.pixelSha256);const[x,y]=f.attachments.grip;assert.equal(pixels[(y*width+x)*4+3],253,'Exact authored front fist pixel');
});
for(const facing of ['right','left'])test('BNL whole hovering body lifts its own native captive with exact palm contact '+facing,()=>{
 const dir=facing==='right'?1:-1;let m;for(let gap=65;gap<=300;gap+=5){const candidate=createMatch({mode:'local',start:false,stage:'radio-studio',roundTimeMs:0,fighters:[native,native].map(a=>({id:a.manifest.id,height:a.manifest.height})),clips:combatMetadata([native,native])});candidate.phase='fight';candidate.fighters[0].x=1200;candidate.fighters[1].x=1200+dir*gap;candidate.fighters[0].facing=facing;candidate.fighters[1].facing=facing==='right'?'left':'right';performAction(candidate,0,'grab');for(let t=0;t<230;t+=10)advanceMatch(candidate,10);if(candidate.fighters[1].action==='grabbed'){m=candidate;break;}}assert(m,'Real own palm must capture');
 while(m.fighters[0].actionTime<330)advanceMatch(m,5);const a=getFighterView(m,0),v=getFighterView(m,1),hand=m.fighters[0]._clips[a.clip].combatPoses.frames[a.facing][a.poseIndex],held=m.fighters[1]._clips[v.clip].combatPoses.frames[v.facing][v.poseIndex];assert.equal(m.fighters[1].action,'grabbed');assert.equal(v.clip,'delete-rip-front');assert(a.y<0&&v.y<0,'Intact wisp moves upward; captive does not slide on the floor');assert(Math.abs(a.x+hand.sites.grip.x-v.x-held.sites.torso.x)<1e-7);assert(Math.abs(a.y+hand.sites.grip.y-v.y-held.sites.torso.y)<1e-7);assert(620+v.y+held.bounds.top>=0);
});
for(const facing of ['right','left'])test('BNL Oak split retains an authored central native seam '+facing,()=>{for(const f of native.clips['delete-rip-front'].data.frames[facing]){assert.deepEqual(f.attachments.ripCut,[f.rect[2]/2,f.attachments.torso[1]]);assert.equal(f.ripCutProfile.sourceRgbaSha256,f.pixelSha256);assert.equal(f.ripCutProfile.kind,'whole-native-central-seam');}});
