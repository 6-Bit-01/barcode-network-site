import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileFightClip} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseTransform,poseScale} from '../public/games/system-clash/play/fight-attachments.mjs';
const ROOT=new URL('../public/games/system-clash/play/assets/',import.meta.url);
const fixture=JSON.parse(readFileSync(new URL('fixtures/system-clash-jitter-alignment.json',import.meta.url),'utf8'));
const read=id=>JSON.parse(readFileSync(new URL(`fighters/${id}/manifest.json`,ROOT),'utf8'));
const compiled=(id,clip)=>{const m=read(id),data=m.clips[clip];return compileFightClip(data,{width:10000,height:10000},m,clip);};
test('6 Bit punch inserted cells stay between approved native cap stations in both directions',()=>{
 const a=compiled('6-bit','punch');
 for(const p of fixture.priorityLandmarks){const f=a.data.frames[p.facing][p.index],t=poseTransform(a,f),cap=t.point([(p.capNativeX[0]+p.capNativeX[1])/2,0]).x;
  assert.equal(f.combatProfile.sourceRgbaSha256,p.nativeRgbaSha256);
  assert.equal(t.sy,p.heightScale);assert.equal(t.point([0,f.opaqueBounds[3]]).y,(f.opaqueBounds[3]+(f.offset?.[1]??0)-f.anchor[1])*poseScale(a,f));
  const expected=p.linearBetweenApprovedCapWorldX??p.capWorldX;
  assert(Math.abs(cap-expected)<.8,`${p.facing} punch${p.index}: cap ${cap.toFixed(2)}, native key path ${expected.toFixed(2)}`);
 }
});
test('9 Bit walk plays a coherent native gait without incompatible generated leg reset frames',()=>{
 const m=read('9-bit'),data=m.clips.walk,before=JSON.stringify(data),a=compileFightClip(data,{width:10000,height:10000},m,'walk');
 assert.deepEqual(a.timeline.entries.map(e=>e.index),[0,2,4,6]);assert.equal(a.timeline.duration,600);
 for(const e of a.timeline.entries)assert.equal(e.end-e.start,150);
 assert.equal(JSON.stringify(a.data),before,'Original packed art, order provenance and anchors remain retained');
 for(const facing of['left','right'])for(const e of a.timeline.entries){const f=a.data.frames[facing][e.index],t=poseTransform(a,f);assert(Math.abs(t.point([0,f.opaqueBounds[3]]).y)<3,'Approved walking feet stay on their floor plane');}
});

test('Reviewed registration cells preserve native pixels, floor height and exact attachment projection',()=>{
 for(const r of fixture.reviewedOffsets){
  const a=compiled(r.id,r.clip),f=a.data.frames[r.facing][r.index],t=poseTransform(a,f),s=poseScale(a,f),hash=f.nativeSource?.pixelSha256??f.combatProfile?.sourceRgbaSha256??f.pixelSha256;
  assert.equal(hash,r.hash,`${r.id}/${r.clip}/${r.facing}/${r.index}: reviewed native crop identity`);
  const dx=(r.nativeDx??0)*s+(r.worldDx??0),anchor=t.point(f.anchor);
  assert.equal(t.registration.x,dx);assert.equal(t.registration.y,0);assert.equal(t.sy,s);
  assert(Math.abs(anchor.x-(f.offset?.[0]??0)*s-dx)<1e-9);assert.equal(anchor.y,(f.offset?.[1]??0)*s);
  const grip=f.attachments?.grip??f.anchor,point=t.point(grip),back=t.inverse(point);
  assert(Math.abs(back.x-grip[0])<1e-9&&Math.abs(back.y-grip[1])<1e-9,'Corrected render attachment retains its exact native inverse');
 }
});
