import {poseRegistration} from '../public/games/system-clash/play/fight-pose-registration.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {compileFightClip} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseScale,poseTransform,resolvePoseAttachments} from '../public/games/system-clash/play/fight-attachments.mjs';
import {poseWidthFactor} from '../public/games/system-clash/play/fight-pose-widths.mjs';
const ROOT=new URL('../public/games/system-clash/play/',import.meta.url);
const evidence=JSON.parse(readFileSync(new URL('fixtures/system-clash-reviewed-widths.json',import.meta.url),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=(bank,id)=>JSON.parse(readFileSync(new URL(`assets/${bank}/${id}/manifest.json`,ROOT),'utf8'));
const imageCache=new Map();
async function nativeCrop(probe){
 const url=new URL(probe.canonicalSourceFile,ROOT);
 if(!imageCache.has(url.href))imageCache.set(url.href,sharp(readFileSync(url)).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
 const {data,info}=await imageCache.get(url.href),[x,y,w,h]=probe.rect,raw=Buffer.alloc(w*h*4);
 for(let row=0;row<h;row++)data.copy(raw,row*w*4,((y+row)*info.width+x)*4,((y+row)*info.width+x+w)*4);
 return {raw,w,h};
}
function fixedContour({raw,w,h},probe){
 const spans=probe.fixedRows.map(y=>{
  assert(y>=0&&y<h);
  let left=probe.seedX,right=left;
  assert(raw[(y*w+left)*4+3]>16,'Reviewed contour seed stays on opaque anatomy');
  while(left>probe.roiX[0]&&raw[(y*w+left-1)*4+3]>16)left--;
  while(right+1<probe.roiX[1]&&raw[(y*w+right+1)*4+3]>16)right++;
  assert(left>probe.roiX[0]&&right+1<probe.roiX[1],'Reviewed ROI contains the complete contour, not clipped hair or a contact arm');
  return right-left+1;
 });
 spans.sort((a,b)=>a-b);const middle=Math.floor(spans.length/2);return spans.length%2?spans[middle]:(spans[middle-1]+spans[middle])/2;
}
test('Reviewed attack anatomy uses the native pixels at idle-matched width, not its padded source box',async()=>{
 const measured=[];
 for(const probe of evidence.contours){
  const m=manifest(probe.bank,probe.id),clip=m.clips[probe.clip],frame=clip.frames[probe.facing][probe.index];
  const crop=await nativeCrop(probe);assert.equal(sha(crop.raw),probe.rgbaSha256,'Native source pixels preserved');
  const width=fixedContour(crop,probe);assert.equal(width,probe.nativeMedianWidth);
  const asset=compileFightClip(clip,{width:10000,height:10000},m,probe.clip),transform=poseTransform(asset,frame);
  assert.equal(poseScale(asset,frame),probe.worldScale,'Existing height and physical floor registration preserved');
  measured.push({...probe,width:width*transform.sx});
 }
 // Comparable crown and trunk strips were picked from native-grid review, never silhouette widths including an extended limb.
 const comparable=[['6-bit','uppercut','skull-crown','right',1.10],['6-bit','low-punch','trunk-below-arms','right',1.06],['cache-back','uppercut','skull-crown','right',1.12],['dj-floppydisc','low-punch','trunk-below-arms','right',1.10]];
 for(const [id,clip,site,facing,max]of comparable){
  const idle=measured.find(p=>p.id===id&&p.clip==='idle'&&p.site===site&&p.facing===facing);
  const attack=measured.find(p=>p.id===id&&p.clip===clip&&p.site===site&&p.facing===facing);
  assert(idle&&attack,`Reviewed native contour exists for ${id}/${clip}/${site}`);
  assert(attack.width/idle.width<=max,`${id}/${clip} body width ${attack.width.toFixed(2)} vs idle ${idle.width.toFixed(2)}`);
 }
});
test('Every roster frame preserves source metadata, vertical scale and torso station; aliases share one fixed width',()=>{
 let count=0,clips=0;const fighters=new Set(),aliases=new Map();
 for(const [path,hash]of Object.entries(evidence.manifestSha256)){
  const bytes=readFileSync(new URL(path,ROOT));assert.equal(sha(bytes),hash,'Source crops, timings and registrations untouched');
  const m=JSON.parse(bytes),before=JSON.stringify(m);fighters.add(path.split("/")[2]);clips+=Object.keys(m.clips).length;
  for(const [name,data]of Object.entries(m.clips)){
   const asset=compileFightClip(data,{width:10000,height:10000},m,name);
   for(const [facing,frames]of Object.entries(data.frames))for(const [index,frame]of frames.entries()){
    count++;const t=poseTransform(asset,frame),s=poseScale(asset,frame),offset=frame.offset??[0,0];
    const torso=resolvePoseAttachments(frame,name,index,facing,asset.fighterId).torso;
    assert.equal(t.sy,s);assert.equal(t.point(torso).x,(torso.x+offset[0]-frame.anchor[0])*s+poseRegistration(asset,frame).x);
    assert.equal(t.point([0,frame.opaqueBounds?.[3]??frame.rect[3]]).y,((frame.opaqueBounds?.[3]??frame.rect[3])+offset[1]-frame.anchor[1])*s);
    const rgba=frame.nativeSource?.pixelSha256??frame.combatProfile?.sourceRgbaSha256??frame.pixelSha256;
    if(rgba){const q=poseWidthFactor(asset,frame);if(aliases.has(rgba))assert.equal(q,aliases.get(rgba),`${m.id}/${name}/${facing}/${index} reused native source width`);else aliases.set(rgba,q);}
   }
  }
  assert.equal(JSON.stringify(m),before,'Compilation leaves original frame provenance unchanged');
 }
 assert.equal(fighters.size,19);assert.equal(clips,evidence.coverage.clips);assert.equal(count,evidence.coverage.frameReferences);
});
test('Ms Mayhem, 9 Bit, PapaOak and Dr3w native guard envelopes no longer enlarge through attacks',async()=>{
 const widths=[];
 for(const p of evidence.nativeEnvelopes){
  const crop=await nativeCrop(p);assert.equal(sha(crop.raw),p.nativeRgbaSha256);
  const roi=p.rois.skullEnvelope,[x0,y0,x1,y1]=roi.nativeRectXYXY,w=x1-x0,h=y1-y0,raw=Buffer.alloc(w*h*4);
  for(let row=0;row<h;row++)crop.raw.copy(raw,row*w*4,((y0+row)*crop.w+x0)*4,((y0+row)*crop.w+x1)*4);
  assert.equal(sha(raw),roi.rgbaSha256,'Reviewed fixed skull window unchanged');
  const m=manifest(p.bank,p.id),clip=m.clips[p.clip],frame=clip.frames[p.facing][p.index],asset=compileFightClip(clip,{width:10000,height:10000},m,p.clip);
  const nativeWidth=roi.nativeWidthPixels; widths.push({...p,width:nativeWidth*poseTransform(asset,frame).sx});
 }
 for(const [id,clip]of[['ms-mayhem','uppercut'],['9-bit','uppercut'],['papa-oak','double-punch'],['dr3wbaby','jump-punch']])for(const facing of['right','left']){
  const idle=widths.find(p=>p.id===id&&p.clip==='idle'&&p.facing===facing),attack=widths.find(p=>p.id===id&&p.clip===clip&&p.facing===facing);
  assert(attack.width/idle.width<=1.16,`${id}/${clip}/${facing} attack envelope ${attack.width.toFixed(2)} vs idle ${idle.width.toFixed(2)}`);
  assert(attack.width/idle.width>=.85,'Calibration preserves physical head size');
 }
 for(const p of widths.filter(p=>p.id==='stolz'&&p.clip==='brace')){
  const m=manifest(p.bank,p.id),c=m.clips[p.clip];assert.equal(poseWidthFactor(compileFightClip(c,{width:10000,height:10000},m,p.clip),c.frames[p.facing][p.index]),1,'Small brace source remains untouched');
 }
});
