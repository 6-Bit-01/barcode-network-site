import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {createMatch,advanceMatch,getFighterView,performAction} from '../public/games/system-clash/play/fight-engine.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
import {poseFrameIndex} from '../public/games/system-clash/play/fight-attachments.mjs';

const reviewed=JSON.parse(readFileSync(new URL('fixtures/system-clash-aerial-head-landmarks.json',import.meta.url))).fighters;
const assets=new URL('../public/games/system-clash/play/assets/',import.meta.url);
const roster=JSON.parse(readFileSync(new URL('menu/roster.json',assets))).fighters;
const art=Object.fromEntries(roster.map(({id})=>{
 let manifest;const clips={};
 for(const bank of ['fighters','arcade','deletions']){
  const source=JSON.parse(readFileSync(new URL(`${bank}/${id}/manifest.json`,assets)));
  if(bank==='fighters')manifest=source;
  for(const [name,data] of Object.entries(source.clips)){
   const clip=bank==='deletions'?'delete-'+name:name,frames=Object.values(data.frames).flat();
   const size={width:Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),height:Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))};
   clips[clip]=compileFightClip(data,size,source,clip);
  }
 }
 return [id,{manifest,clips}];
}));
const metadata=Object.fromEntries(roster.map(({id})=>[id,combatMetadata([art[id]])[0]]));
function scene(id,direction){
 const ids=['6-bit',id],match=createMatch({mode:'local',start:false,fighters:ids.map(id=>({id,height:art[id].manifest.height})),clips:ids.map(id=>metadata[id])});
 match.phase='fight';match.fighters[0].x=direction>0?450:830;match.fighters[1].x=direction>0?650:630;
 const victim=match.fighters[1];Object.assign(victim,{action:'grabbed',actionTime:victim._clips.grabbed.duration-5,facing:direction>0?'left':'right',_throwDirection:direction,_throwDistance:140,_throwAttacker:0});
 advanceMatch(match,10,[{},{}]);return match;
}
function actualHeadDirection(id,view){
 const proof=reviewed[id][view.clip==='thrown'?(view.airborne===false?'landed':'air'):'ground'][view.facing];
 if(view.clip==='thrown'){
  const asset=art[id].clips.thrown,frame=asset.data.frames[view.facing][poseFrameIndex(asset,view)];
  assert.deepEqual(frame.rect,proof.rect,'Selection uses the independently reviewed native crop');
 }
 return proof.head[0]-proof.legs[0];
}
test('all nineteen reviewed air/floor landmark fixtures retain their exact served source pixels',()=>{
 const hashes=new Map();
 for(const fighter of Object.values(reviewed))for(const phase of Object.values(fighter))for(const proof of Object.values(phase)){
  if(!hashes.has(proof.file))hashes.set(proof.file,createHash('sha256').update(readFileSync(new URL(proof.file,assets))).digest('hex'));
  assert.equal(hashes.get(proof.file),proof.imageSha256);
 }
});

for(const {id} of roster)for(const direction of [-1,1]){
 test(`${id} released throw travels head first and keeps the same orientation on landing (${direction})`,()=>{
  const match=scene(id,direction),victim=match.fighters[1];assert.equal(victim.action,'thrown');
  let facing,landed=false;
  for(let ms=0;ms<950;ms+=10){
   const view=getFighterView(match,1);
   if(view.y<0){
    assert.equal(view.clip,'thrown','Released fighters use their existing free-flight source instead of a suspended capture pose');
    assert(actualHeadDirection(id,view)*direction>0,'Independently reviewed visible head leads horizontal travel');
    facing??=view.facing;
    const entry=metadata[id].thrown.combatPoses.entries.at(-1);assert(view.elapsed<entry.start,'Floor pose cannot appear in air');
   } else if(facing&&['thrown','knockdown'].includes(view.clip)){
    landed=true;assert(actualHeadDirection(id,view)*direction>0,'Independently reviewed floor head stays on the same side');
   }
   advanceMatch(match,10,[{},{}]);
  }
  assert(facing,'Actual released body enters flight');assert(landed,'Actual released body reaches its grounded recovery');
 });
}

const rendererURL=new URL('../public/games/system-clash/play/fight-renderer.mjs',import.meta.url);
const rendererSource=readFileSync(rendererURL,'utf8').replace(/from '([.]\/[^']+)'/g,(_,relative)=>"from '"+new URL(relative,rendererURL).href+"'");
const {machineViews,poseWorldPoint}=await import('data:text/javascript;base64,'+Buffer.from(rendererSource+'\nexport {machineViews};').toString('base64'));
const prop={manifest:JSON.parse(readFileSync(new URL('deletions/broadcast-cut/atlas.json',assets))),additional:{}};
for(const hero of ['9-bit','cache-back','mr-nice-guy','kaveman-brown']){
 const id=deletionDefinition(hero).id;prop.additional[id]={manifest:JSON.parse(readFileSync(new URL(`deletions/${id}/atlas.json`,assets)))};
}
for(const {id} of roster)for(const direction of [-1,1])for(const hero of ['6-bit','cache-back','9-bit','mr-nice-guy','kaveman-brown']){
 test(`${hero} released Deletion travels head first with ${id} (${direction})`,()=>{
  const source=[art[hero],art[id]],match=createMatch({mode:'practice',fighters:source.map(a=>({id:a.manifest.id,height:a.manifest.height})),clips:[metadata[hero],metadata[id]]});
  match.fighters[0].x=direction>0?210:1050;match.fighters[1].x=match.fighters[0].x+direction*75;
  assert(performAction(match,0,'deletion'));
  const definition=deletionDefinition(hero),b=definition.beats,mechanism=definition.mechanism;
  const [from,to]=mechanism==='crt'?[b.drive,b.captured]:mechanism==='waste-chute'?[b.load,b.captured]:mechanism==='coffin'?[b.entry,b.landed]:mechanism==='wheel'?[b.launch,b.landed]:[b.fall,b.landed];
  match.deletionElapsed=(from+to)/2;
  const raw=match.fighters.map((_,i)=>getFighterView(match,i)),actual=machineViews(match,prop,raw,source)[1];
  assert.equal(actual.clip,'thrown','Released Deletion uses its complete free-flight crop');
  const head=poseWorldPoint(actual,art[id],'head'),legs=poseWorldPoint(actual,art[id],'legs');
  const travel=mechanism==='wheel'?Math.sign(match._deletionOrigin.landX-match._deletionOrigin.target):Math.sign(match._deletionOrigin.target-match._deletionOrigin.victim);
  assert(actualHeadDirection(id,actual)*travel>0,'Independently reviewed visible head leads the actual travel direction');
  assert((head.x-legs.x)*travel>0,'Shared native anatomical sites follow the visible head');
  assert.equal(actual.rotation??0,0,'Release retains native orientation without procedural rotation');
  if(['coffin','wheel','speaker-stack'].includes(mechanism)){
   match.deletionElapsed=to;
   const landed=machineViews(match,prop,match.fighters.map((_,i)=>getFighterView(match,i)),source)[1];
   assert(actualHeadDirection(id,landed)*travel>0,'Reviewed floor orientation retains the leading head side');
   const head=poseWorldPoint(landed,art[id],'head'),legs=poseWorldPoint(landed,art[id],'legs');
   assert((head.x-legs.x)*travel>0,'Floor head remains on the leading side');
  }
 });
}
