import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMatch,advanceMatch,performAction,getFighterView,consumeEvents,FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {interpolateFightViews} from '../public/games/system-clash/play/fight-presentation.mjs';

const root=fileURLToPath(new URL('../public/games/system-clash/play/assets/',import.meta.url));
const roster=JSON.parse(fs.readFileSync(path.join(root,'fight-roster.json'),'utf8')).fighters;
function imageSize(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('Unknown native sprite format');
  for(let at=12;at+8<=bytes.length;) {
    const kind=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),data=at+8;
    if(kind==='VP8X')return {width:1+bytes.readUIntLE(data+4,3),height:1+bytes.readUIntLE(data+7,3)};
    if(kind==='VP8L'){const value=bytes.readUInt32LE(data+1);return {width:1+(value&0x3fff),height:1+((value>>>14)&0x3fff)};}
    if(kind==='VP8 ')return {width:bytes.readUInt16LE(data+6)&0x3fff,height:bytes.readUInt16LE(data+8)&0x3fff};
    at=data+size+(size&1);
  }
  throw new Error('WebP sprite dimensions unavailable');
}
function nativeArt(id) {
  const clips={};let manifest;
  for(const bank of ['fighters','arcade']) {
    const directory=path.join(root,bank,id),data=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
    if(bank==='fighters')manifest=data;
    for(const [name,clip] of Object.entries(data.clips)) {
      const bytes=fs.readFileSync(path.resolve(directory,clip.file));
      clips[name]=compileFightClip(clip,imageSize(bytes),data,name);
    }
  }
  return {manifest,clips};
}
const art=Object.fromEntries(roster.map(({id})=>[id,nativeArt(id)]));
function matchFor(ids=['6-bit','9-bit'],facing='right',native=true) {
  const source=ids.map(id=>art[id]);
  const match=createMatch({mode:'local',start:false,fighters:source.map(({manifest})=>({id:manifest.id,height:manifest.height})),clips:native?combatMetadata(source):undefined});
  match.phase='fight';
  match.fighters[0].x=facing==='right'?500:780;
  match.fighters[1].x=match.fighters[0].x+(facing==='right'?1:-1)*150;
  match.fighters[0].facing=facing;match.fighters[1].facing=facing==='right'?'left':'right';
  return match;
}
function advance(match,ms,inputs=[{},{}]) {while(ms>0){const dt=Math.min(ms,100);advanceMatch(match,dt,inputs);ms-=dt;}}

for(const facing of ['right','left'])test(`a moving opponent can enter the visible punch contact pose once (${facing})`,()=>{
  const match=matchFor(['6-bit','9-bit'],facing),dir=facing==='right'?1:-1;
  match.fighters[1].x=match.fighters[0].x+dir*240;
  performAction(match,0,'punch');consumeEvents(match);advance(match,180);
  assert.equal(match.fighters[1].hp,match.fighters[1].maxHp);
  match.fighters[1].x=match.fighters[0].x+dir*150;
  advance(match,30);
  assert(match.fighters[1].hp<match.fighters[1].maxHp,'Contact pose is still extended and must catch an entering torso');
  const hp=match.fighters[1].hp;advance(match,200);
  assert.equal(match.fighters[1].hp,hp,'A single strike cannot deal damage repeatedly during its active pose');
  const events=consumeEvents(match);assert.equal(events.filter(event=>event.type==='hit').length,1);
  assert.equal(events.filter(event=>event.type==='miss').length,0,'A successful late contact is never also announced as a miss');
});

test('a grounded kick cannot move its contact height to an airborne victim',()=>{
  const match=matchFor(['6-bit','9-bit'],'right',false);
  match.fighters[0].height=180;
  Object.assign(match.fighters[1],{action:'jump',actionTime:0,_jump:{elapsed:50000,duration:100000,move:0,attackUsed:false}});
  performAction(match,0,'kick');advance(match,340);
  assert.equal(match.fighters[1].hp,match.fighters[1].maxHp,'The entire jumping body is above the short attacker’s kick');
  assert.equal(consumeEvents(match).filter(event=>event.type==='hit').length,0);
});

test('a tap during final whiff recovery starts the next ordinary attack at recovery',()=>{
  const match=matchFor(['6-bit','9-bit'],'right',false);match.fighters[1].x=1040;
  performAction(match,0,'kick');advance(match,480);
  assert.equal(performAction(match,0,'punch'),true,'A recent tap during the final recovery window is retained');
  advance(match,70);
  assert.equal(match.fighters[0].action,'punch');
  assert(match.fighters[0].actionTime<=30,'The queued move starts at the recovery boundary');
});

test('presentation interpolates native time within one pose and keeps new contact poses discrete',()=>{
  const before={clip:'punch',poseIndex:1,facing:'right',elapsed:120,nativeElapsed:120,x:500,y:0};
  const current={...before,elapsed:140,nativeElapsed:140,x:504};
  const [smooth]=interpolateFightViews([before],[current],.5);
  assert.equal(smooth.elapsed,130);assert.equal(smooth.nativeElapsed,130);assert.equal(smooth.x,502);
  const [contact]=interpolateFightViews([before],[{...current,poseIndex:2,elapsed:170}],.5);
  assert.equal(contact.elapsed,170,'A newly active limb must not be delayed back into windup');
});

test('combat metadata carries the actual native contact window and per-facing pose geometry',()=>{
  const metadata=combatMetadata([art['6-bit']])[0].punch;
  assert.equal(metadata.activeEndMs,280,'The extended native punch frame runs from 170 through 280 ms');
  const contact=metadata.combatPoses.entries.find(entry=>metadata.contactMs>=entry.start&&metadata.contactMs<entry.end);
  assert(contact,'Authored contact time must select a native pose');
  assert(metadata.combatPoses.frames.right[contact.index].strike.x>110);
  assert(metadata.combatPoses.frames.left[contact.index].strike.x<-110);
  assert(metadata.combatPoses.frames.right[contact.index].hurt.length>=3);
});


for(const facing of ['right','left'])for(const action of ['kick','uppercut'])test(`9 Bit's extended ${action} connects through its limb at close range (${facing})`,()=>{
  const match=matchFor(['9-bit','9-bit'],facing),dir=facing==='right'?1:-1;
  // Native charging uppercut trunks require about 204/207px of separation.
  // Start outside both cores rather than letting the old 106px fixture overlap.
  match.fighters[1].x=match.fighters[0].x+dir*210;
  performAction(match,0,action);advance(match,650);
  assert(match.fighters[1].hp<match.fighters[1].maxHp,'The opponent crosses the extended shin/forearm before the tip');
  assert.equal(consumeEvents(match).filter(event=>event.type==='hit').length,1);
});

for(const facing of ['right','left'])test(`native crouch posture ducks a high hand but can be checked by a body punch (${facing})`,()=>{
  for(const [action,wantHit]of [['punch',false],['low-punch',true]]) {
    const match=matchFor(['9-bit','6-bit'],facing);
    advance(match,550,[{},{crouch:true}]);consumeEvents(match);
    performAction(match,0,action);advance(match,420,[{},{crouch:true}]);
    assert.equal(match.fighters[1].hp<match.fighters[1].maxHp,wantHit,action+' uses the crouched native head/body bounds');
  }
});

for(const facing of ['right','left'])test(`native height-edge hand contacts stay on the shortest fighter’s head (${facing})`,()=>{
  const match=matchFor(['9-bit','wittyf0x'],facing);
  performAction(match,0,'punch');advance(match,420);
  const hit=consumeEvents(match).find(event=>event.type==='hit');
  assert(hit,'The forearm edge crosses the upright fox’s head');
  assert.equal(hit.site,'head');
  assert(hit.y>=350&&hit.y<=390,'The hit follows the forearm/head contact instead of moving down to the victim’s torso');
});

test('recovery buffering never queues a grab, weapon action or Deletion',()=>{
  for(const action of ['grab','weapon-use','weapon-throw','deletion']) {
    const match=matchFor(['6-bit','9-bit'],'right',false);match.fighters[1].x=1040;
    performAction(match,0,'kick');advance(match,480);
    assert.equal(performAction(match,0,action),false);advance(match,70);
    assert.equal(match.fighters[0].action,'idle');
  }
});

for(const id of roster.map(fighter=>fighter.id))test(`fallback combat preserves ${id}'s close pressure and throws in either facing`,()=>{
  for(const facing of ['right','left'])for(const action of ['punch','kick','low-punch','low-kick','uppercut','grab']) {
    const match=matchFor([id,id],facing,false),dir=facing==='right'?1:-1;
    match.fighters[1].x=match.fighters[0].x+dir*106;
    performAction(match,0,action);advance(match,700);
    assert(match.fighters[1].hp<match.fighters[1].maxHp,action+': '+facing+' must keep its established close-range behavior');
    assert.equal(consumeEvents(match).filter(event=>event.type==='hit').length,1);
  }
});

test('native clip offsets, calibration and six source frame entries share the draw/combat floor space',()=>{
  const frames=Array.from({length:6},(_,index)=>({rect:[index*100,0,100,120],anchor:[50,115],opaqueBounds:[10,5,95,115],offset:[5,-4],bodyCalibration:1.25,
    attachments:{head:[50,20],torso:[50,45],legs:[50,95],grip:[90,40],strike:[90,40],strikeStart:[70,40]}}));
  const data={file:'poses.png',frames:{right:frames,left:frames},order:[0,1,2,3,4,5],frameMs:[30,40,50,60,70,80],contactMs:70,activeEndMs:180};
  const fighter={manifest:{id:'custom',height:220},clips:{punch:compileFightClip(data,{width:600,height:120},{character:'fixture',height:220,scale:2},'punch')}};
  const clip=combatMetadata([fighter])[0].punch;
  assert.equal(clip.combatPoses.entries.length,6);assert.equal(clip.duration,330);assert.equal(clip.activeEndMs,180);
  assert.equal(clip.combatPoses.frames.right[2].strike.x,112.5);assert.equal(clip.combatPoses.frames.right[2].strike.y,-197.5);
  assert.equal(clip.combatPoses.frames.right[2].strikeStart.x,62.5);
  assert.equal(clip.combatPoses.frames.right[2].bounds.top,-285);assert.equal(clip.combatPoses.frames.right[2].bounds.bottom,-10);
});

test('finish views select the native held reaction pose instead of the underlying idle action',()=>{
  const match=matchFor();match.phase='finish';match.winner=0;
  const view=getFighterView(match,1);
  assert.equal(view.clip,'high');assert.equal(view.elapsed,210);assert.equal(view.poseIndex,2);
});
