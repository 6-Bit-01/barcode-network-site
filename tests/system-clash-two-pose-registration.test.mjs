import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileFightClip,assetPath} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseTransform,resolvePoseAttachments} from '../public/games/system-clash/play/fight-attachments.mjs';
const ROOT=new URL('../public/games/system-clash/play/',import.meta.url);
function load(id,name){
 const manifestPath=`assets/fighters/${id}/manifest.json`,manifest=JSON.parse(readFileSync(new URL(manifestPath,ROOT),'utf8')),data=manifest.clips[name],frames=Object.values(data.frames).flat();
 const image={width:Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),height:Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))};
 return {manifestPath,data,asset:compileFightClip(data,image,manifest,name)};
}
function trace({data,asset},facing){return data.frames[facing].map((frame,index)=>{
 const transform=poseTransform(asset,frame),sites=resolvePoseAttachments(frame,asset.name,index,facing,asset.fighterId),bounds=frame.opaqueBounds;
 return {torso:transform.point([sites.torso.x,sites.torso.y]),floor:transform.point(bounds.slice(2)).y};
});}
const round=n=>Math.round(n*100)/100;
test('Nice captured left bookends retain modest native recoil without crossing the fighter root',()=>{
 const poses=trace(load('mr-nice-guy','grabbed'),'left');
 for(let index=0;index<poses.length;index++){
  const next=poses[(index+1)%poses.length];
  assert(Math.abs(next.torso.x-poses[index].torso.x)<=15,`grabbed LEFT${index} to${(index+1)%poses.length} jumps ${round(next.torso.x-poses[index].torso.x)} world units`);
 }
 assert(poses.every(p=>p.torso.x>0),'Every left captured pose stays on the same authored side of the root');
});
test('Cliff left punch recoil stays at the native idle torso station',()=>{
 const idle=trace(load('cliff','idle'),'left')[0],poses=trace(load('cliff','punch'),'left');
 for(const [index,pose]of poses.entries())assert(Math.abs(pose.torso.x-idle.torso.x)<.05,`punch LEFT${index} drifts ${round(pose.torso.x-idle.torso.x)} world units from native idle`);
});
for(const [id,name,right]of [['mr-nice-guy','grabbed',[-66.46,-62.55,-77.07,-73.72]],['cliff','punch',[1.61,1.61,1.61,1.61,1.61,1.61,1.61,1.61]]]){
 test(`${id} ${name} horizontal repair preserves both floor baselines and the right-facing torso stations`,()=>{
  const clip=load(id,name);
  for(const facing of ['right','left'])for(const pose of trace(clip,facing))assert(Math.abs(pose.floor)<.01,`${facing} floor moved to ${pose.floor}`);
  assert.deepEqual(trace(clip,'right').map(p=>round(p.torso.x)),right,'The independently authored right-facing poses keep their measured positions');
 });
}
const SOURCES=[
 ['mr-nice-guy','grabbed','file','a4fcdda12acb28e6b81ee30399e26f17c450bb90cf67c6e322149b7981e840e0'],
 ['mr-nice-guy','grabbed','runtimeFile','3c0e6061162609fa4a64b0aee744d323805f9a8a107a77dccb79da2a415d102b'],
 ['mr-nice-guy','grabbed','clarityFile','26f245a7b556186932a5f81c275798e051cf0371f2b76fcb21243e65b2a8a40d'],
 ['cliff','punch','file','e151f731702dd522937952172b507f3f29e05115d49e3a9fcd0631fbfbb1418f'],
 ['cliff','punch','clarityFile','da435c794e00b1a8a48332f0ffc1640eeda1f7609ae6b6cd99b03e940953f35b'],
];
test('The two registration repairs retain the exact original and runtime sprite bytes',()=>{
 for(const [id,name,key,want]of SOURCES){const clip=load(id,name),file=assetPath(clip.manifestPath,clip.data[key]),bytes=readFileSync(new URL(file,ROOT));assert.equal(createHash('sha256').update(bytes).digest('hex'),want,`${id} ${name} ${key} source image changed`);}
});