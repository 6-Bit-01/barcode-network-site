import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMatch,advanceMatch,performAction,consumeEvents,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {nativeBodyCore,nativeBodyLegs} from '../public/games/system-clash/play/fight-combat-geometry.mjs';
const root=fileURLToPath(new URL('../public/games/system-clash/play/assets/',import.meta.url));
function imageSize(bytes){
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 for(let at=12;at+8<=bytes.length;){const kind=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),data=at+8;
  if(kind==='VP8X')return {width:1+bytes.readUIntLE(data+4,3),height:1+bytes.readUIntLE(data+7,3)};
  if(kind==='VP8L'){const value=bytes.readUInt32LE(data+1);return {width:1+(value&0x3fff),height:1+((value>>>14)&0x3fff)};}
  if(kind==='VP8 ')return {width:bytes.readUInt16LE(data+6)&0x3fff,height:bytes.readUInt16LE(data+8)&0x3fff};at=data+size+(size&1);
 }throw new Error('Unknown native sprite dimensions');
}
const dimensions=new Map();
function nativeSize(file){if(!dimensions.has(file))dimensions.set(file,imageSize(fs.readFileSync(file)));return dimensions.get(file);}
const roster=JSON.parse(fs.readFileSync(path.join(root,'fight-roster.json'),'utf8')).fighters.filter(fighter=>fighter.enabled);
const art=Object.fromEntries(roster.map(({id})=>{const clips={};let manifest;
 for(const bank of ['fighters','arcade']){const directory=path.join(root,bank,id),data=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));if(bank==='fighters')manifest=data;
  for(const [name,clip]of Object.entries(data.clips))clips[name]=compileFightClip(clip,nativeSize(path.resolve(directory,clip.file)),data,name);
 }return [id,{manifest,clips}];}));
// Independent closest-distance oracle, not the production rounded-strip code.
function distance2(start,end,body){
 const dx=end.x-start.x,dy=end.y-start.y;let enter=0,leave=1,intersects=true;
 for(const [origin,delta,min,max]of [[start.x,dx,body.left,body.right],[start.y,dy,body.top,body.bottom]]){
  if(delta===0){if(origin<min||origin>max)intersects=false;continue;}
  const a=(min-origin)/delta,b=(max-origin)/delta;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
 }
 if(intersects&&enter<=leave)return 0;
 const pointBox=p=>Math.max(body.left-p.x,0,p.x-body.right)**2+Math.max(body.top-p.y,0,p.y-body.bottom)**2;
 let result=Math.min(pointBox(start),pointBox(end));const length2=dx*dx+dy*dy;
 for(const x of [body.left,body.right])for(const y of [body.top,body.bottom]){
  const t=length2?Math.max(0,Math.min(1,((x-start.x)*dx+(y-start.y)*dy)/length2)):0;
  result=Math.min(result,(x-start.x-t*dx)**2+(y-start.y-t*dy)**2);
 }return result;
}
function poseAt(clip,facing,elapsed){
 const bank=clip.combatPoses,time=bank.loop?elapsed%bank.duration:Math.min(elapsed,bank.duration-.001);
 const entry=bank.entries.find(entry=>time>=entry.start&&time<entry.end)??bank.entries.at(-1);
 return bank.frames[facing][entry.index];
}
function scene(id,facing,guard={},warmup=0){
 const source=art[id],match=createMatch({mode:'local',start:false,fighters:[0,1].map(()=>({id,height:source.manifest.height})),clips:combatMetadata([source,source])});
 match.phase='fight';const dir=facing==='right'?1:-1;
 match.fighters[0].x=900;match.fighters[1].x=900+dir*600;
 match.fighters[0].facing=facing;match.fighters[1].facing=dir>0?'left':'right';
 match.fighters[1].action=guard.block?'block':guard.crouch?'crouch':'idle';match.fighters[1].actionTime=warmup;
 return match;
}
const openingFrames={'6-bit':0,'9-bit':0,'mr-nice-guy':1,'papa-oak':1};
function samples(f,action){
 const clip=f._clips[action==='grab'&&f._clips.grab?'grab':action==='grab'?'punch':action],rate=action==='grab'?1/f._style.tempo.throw:clip.playbackRate;
 const marker=action==='grab'?180*f._style.tempo.throw:clip.contactMs;
 const dir=f.facing==='right'?1:-1;
 const early=action==='uppercut'?clip.combatPoses.entries.find(entry=>{const p=clip.combatPoses.frames[f.facing][entry.index];return (p.strike.x-p.sites.torso.x)*dir>0&&p.strike.y<p.sites.torso.y-1;}):null;
 const start=early?Math.min(marker,early.start/rate):marker,end=action==='grab'?marker:clip.activeEndMs;
 if(action==='grab')return [{time:marker,pose:poseAt(clip,f.facing,marker*rate)}];
 return clip.combatPoses.entries.filter(entry=>entry.end/rate>start&&entry.start/rate<end).map(entry=>{
  const time=(Math.max(start,entry.start/rate)+Math.min(end,entry.end/rate))/2;
  return {time,index:entry.index,pose:clip.combatPoses.frames[f.facing][entry.index]};
 });
}
function bodyRegions(f,pose){
 const reference=f._clips.idle.combatPoses.frames[f.facing][0],core=nativeBodyCore(pose,reference,{id:f.id,facing:f.facing,height:f.height});
 return {core,regions:pose.measuredHurt?[...pose.hurt]:[...pose.hurt,...(core?[{...core,site:'torso'}]:[]),...nativeBodyLegs(pose,reference,{id:f.id,facing:f.facing,height:f.height})]};
}
function candidate(id,action,facing,guard={},warmup=0){
 const match=scene(id,facing,guard,warmup),[f,v]=match.fighters,dir=facing==='right'?1:-1;
 const victimPose=poseAt(v._clips[v.action],v.facing,warmup+1),victim=bodyRegions(v,victimPose);
 const initial=bodyRegions(f,poseAt(f._clips.idle,f.facing,0)).core;
 const attackerIdle=poseAt(f._clips.idle,f.facing,0),victimIdle=poseAt(v._clips.idle,v.facing,0);
 const physical=(fighter,pose,core)=>[{...core,site:'torso'},...nativeBodyLegs(pose,pose,{id:fighter.id,facing:fighter.facing,height:fighter.height})];
 const attackerBodies=physical(f,attackerIdle,initial),victimBodies=physical(v,victimIdle,bodyRegions(v,victimIdle).core);
 const legal=Math.max(...attackerBodies.flatMap(a=>victimBodies.filter(b=>!(a.site==='legs'&&b.site==='legs')&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)).map(b=>dir>0?a.right-b.left:b.right-a.left)))+1;
 let first;
 for(const sample of samples(f,action)){
  // Physical stance stays at its native idle body; changing strike keys cannot
  // enlarge its blocker. Perspective feet may interleave, as in real play.
  const start=action==='grab'?sample.pose.sites.grip:sample.pose.strikeStart,end=action==='grab'?start:sample.pose.strike;
  const radius=sample.pose.strikeRadius;
  for(let gap=Math.ceil(legal);gap<=450;gap++){
   const regions=victim.regions.map(body=>({...body,left:body.left+dir*gap,right:body.right+dir*gap}));
   const touching=regions.some(body=>distance2(start,end,body)<=radius**2-1e-7);
   const choice={...sample,gap,regions,touching,legal};first??=choice;
   if(touching)return choice;
  }
 }assert(first,`${id} ${action} has a native active source pose`);return first;
}
function snapshot(id,action,facing,choice,guard={},warmup=0){
 const match=scene(id,facing,guard,warmup),[f,v]=match.fighters,dir=facing==='right'?1:-1;
 v.x=f.x+dir*choice.gap;assert(performAction(match,0,action));
 // Isolate one real source pose; existing combat-polish checks cover full move
 // travel/lifetime. Attack/body geometry and identity stats stay native.
 f._travel=null;f.actionTime=choice.time-1;consumeEvents(match);
 advanceMatch(match,1,[{},guard]);
 return {match,events:consumeEvents(match).filter(event=>event.attacker===0&&event.action===action)};
}
const nativeActions=['punch','kick','low-punch','low-kick','uppercut','grab','double-punch','power-kick'];
for(const {id}of roster)test(`${id} separated native bodies obey actual fist, foot and grip contacts in both facings`,t=>{
 let contacts=0,misses=0;
 for(const action of nativeActions)for(const facing of ['right','left'])for(const warmup of [0,550,850])for(const guard of [{},{block:true}]){
  const choice=candidate(id,action,facing,guard,warmup),{match,events}=snapshot(id,action,facing,choice,guard,warmup);
  const context=`${id} ${action} ${facing} phase${warmup} guard${!!guard.block}`;
  assert(choice.gap>=choice.legal,context+' starts with physically separated native cores');
  const hitType=guard.block&&!['grab','low-kick'].includes(action)?'block':'hit';
  const collisions=events.filter(event=>event.type==='hit'||event.type==='block');
  assert.equal(collisions.length,choice.touching?1:0,context+' independent native intersection');
  if(choice.touching){
   contacts++;assert.equal(collisions[0].type,hitType,context+' guard response');
   assert(match.fighters[1].hp<match.fighters[1].maxHp,context+' damages the actual profile');
   if(hitType==='block')assert.equal(match.fighters[1].hp,match.fighters[1].maxHp-1,context+' single chip');
   const event=collisions[0],x=event.x-900,y=event.y-620;
   assert(choice.regions.some(body=>x>=body.left-1e-7&&x<=body.right+1e-7&&y>=body.top-1e-7&&y<=body.bottom+1e-7),context+' impact lies on the native body');
  }else{misses++;assert.equal(match.fighters[1].hp,match.fighters[1].maxHp,context+' a nonintersecting limb cannot hit');}
 }
 assert(contacts>=60,`${id} retains meaningful physical contacts; observed ${contacts}`);
 t.diagnostic(`${contacts} actual contact/guard fixtures; ${misses} physically unreachable source-pose fixtures`);
});
for(const {id}of roster)test(`${id} native attacks have one true distant miss in either facing`,()=>{
 for(const action of nativeActions)for(const facing of ['right','left']){
  const match=scene(id,facing);assert(performAction(match,0,action));consumeEvents(match);
  advanceMatch(match,1300);const events=consumeEvents(match).filter(event=>event.attacker===0&&event.action===action);
  assert.equal(match.fighters[1].hp,match.fighters[1].maxHp,`${id} ${action} ${facing} beyond native reach and travel`);
  assert.equal(events.filter(event=>event.type==='hit'||event.type==='block').length,0);
  assert.equal(events.filter(event=>event.type==='miss').length,1);
 }
});
for(const id of Object.keys(openingFrames))for(const facing of ['right','left'])test(`${id} uppercut contacts its actual reachable native frame without broad body padding (${facing})`,()=>{
 const choice=candidate(id,'uppercut',facing),match=scene(id,facing),[f,v]=match.fighters,dir=facing==='right'?1:-1;
 v.x=f.x+dir*choice.legal;assert(performAction(match,0,'uppercut'));consumeEvents(match);
 const clips=f._clips.uppercut,events=[];let contactView;
 for(let elapsed=0;elapsed<clips.duration+50;elapsed+=10){advanceMatch(match,10);const batch=consumeEvents(match);if(batch.some(e=>e.type==='hit'&&e.attacker===0))contactView=getFighterView(match,0);events.push(...batch);}
 const hits=events.filter(event=>event.type==='hit'&&event.attacker===0&&event.action==='uppercut');
 assert.equal(hits.length,1,'The whole active native rise, including its tip sweep, reaches at physical body spacing');
 assert(contactView.elapsed<=clips.activeEndMs*(clips.playbackRate??1),'Contact belongs to the actual native active rise');
 assert.equal(contactView.poseIndex,clips.combatPoses.entries.find(e=>contactView.elapsed>=e.start&&contactView.elapsed<e.end)?.index,'The striking pose stays at its unchanged native playback frame');
});
for(const facing of ['right','left'])test(`native high hand ducks while an intersecting body punch checks crouch (${facing})`,()=>{
 const high=candidate('mr-nice-guy','punch',facing,{crouch:true}),highResult=snapshot('mr-nice-guy','punch',facing,high,{crouch:true});
 assert.equal(highResult.match.fighters[1].hp,highResult.match.fighters[1].maxHp);
 assert.equal(highResult.events.filter(event=>event.type==='hit').length,0);
 const low=candidate('mr-nice-guy','low-punch',facing,{crouch:true});
 assert(low.touching,'The native body punch intersects the actual crouched source');
 assert.equal(snapshot('mr-nice-guy','low-punch',facing,low,{crouch:true}).events.filter(event=>event.type==='hit').length,1);
});
