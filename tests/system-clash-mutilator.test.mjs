import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {compileFightClip,combatMetadata,assetPath} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex,poseScale,resolvePoseAttachments} from '../public/games/system-clash/play/fight-attachments.mjs';
import {limbContact} from '../public/games/system-clash/play/fight-combat-geometry.mjs';
import {createMatch,performAction,advanceMatch,getFighterView,consumeEvents,FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
import {deletionDefinition,deletionPose} from '../public/games/system-clash/play/deletion-library.mjs';
import {fightStatProfile} from '../public/games/system-clash/play/fight-stats.mjs';
import {FIGHT_AUDIO_PROFILES,FIGHT_VOCAL_BANKS,renderFightVocal,planFightSound} from '../public/games/system-clash/play/fight-audio.mjs';
import {CHARACTER_FOLEY_PALETTES,planCharacterFoley} from '../public/games/system-clash/play/fight-audio-palettes.mjs';
import {resolveMusicTrack} from '../public/games/system-clash/play/game-music.mjs';
import {MUSIC_MANIFEST} from '../public/games/system-clash/play/assets/audio/music/manifest.mjs';
import {ONLINE_VERSION} from '../public/games/system-clash/play/online-protocol.mjs';
import {createFightEffects} from '../public/games/system-clash/play/fight-effects.mjs';
import {drawRemainsReveal} from '../public/games/system-clash/play/fight-remains.mjs';
import {registerNewDeletionViews} from '../public/games/system-clash/play/new-deletion-renderer.mjs';
const playRoot=new URL('../public/games/system-clash/play/',import.meta.url),native={};
for(const id of ['mutilator','doofnoobler','papa-oak']){
 const clips={};let manifest;
 for(const bank of ['fighters','arcade','deletions']){
  const manifestFile=`assets/${bank}/${id}/manifest.json`,m=JSON.parse(readFileSync(new URL(manifestFile,playRoot),'utf8'));if(bank==='fighters')manifest=m;
  for(const [name,data]of Object.entries(m.clips)){
   const file=assetPath(manifestFile,data.runtimeFile??data.file),key=bank==='deletions'?'delete-'+name:name;
   clips[key]=compileFightClip(data,await sharp(readFileSync(new URL(file,playRoot))).metadata(),m,key);
  }
 }
 const art={manifest,clips};native[id]={art,metadata:combatMetadata([art])[0]};
}
function worldPoint(view,art,site){const asset=art.clips[view.clip],index=poseFrameIndex(asset,view),frame=asset.data.frames[view.facing][index],point=frame.attachments?.[site]??Object.values(resolvePoseAttachments(frame,view.clip,index,view.facing,art.manifest.id)[site]),offset=frame.offset??[0,0],scale=poseScale(asset,frame);return {x:view.x+(point[0]+offset[0]-frame.anchor[0])*scale,y:620+(view.y??0)+(point[1]+offset[1]-frame.anchor[1])*scale};}
function ending(dir,victimId){const source=[native.mutilator,native[victimId]],match=createMatch({mode:'local',start:false,fighters:source.map(n=>({id:n.art.manifest.id,height:n.art.manifest.height})),clips:source.map(n=>n.metadata)});Object.assign(match,{phase:'finish',winner:0,finishRemaining:7000});match.fighters[0].x=dir>0?500:780;match.fighters[1].x=match.fighters[0].x+dir*160;match.fighters[1].hp=0;assert.equal(performAction(match,0,'deletion'),true);consumeEvents(match);return match;}
function advance(match,ms){while(ms>0){const dt=Math.min(100,ms);advanceMatch(match,dt);ms-=dt;}}
test('Mutilator spends 24 points on durable deliberate butcher pressure',()=>{const style=FIGHTER_STYLES.mutilator;assert(style);assert.equal(style.displayName,'Mutilator');assert(style.moveSpeed<240&&style.punchDamage>1.1&&style.tempo.punch>=1);assert.deepEqual(fightStatProfile('mutilator'),{health:8,speed:4,power:8,technique:4});assert.equal(Object.values(fightStatProfile('mutilator')).reduce((a,b)=>a+b,0),24);});
test('Mutilator has four independent Foley gestures and four articulated voices in each effort family',()=>{assert(FIGHT_AUDIO_PROFILES.mutilator);assert.equal(FIGHT_VOCAL_BANKS.mutilator.family,'butcher-bark');const palette=CHARACTER_FOLEY_PALETTES.mutilator;assert(palette);assert.equal(palette.gestures.length,4);assert.equal(new Set(palette.gestures.map(x=>JSON.stringify(x))).size,4);for(const mode of ['attack','hurt','big-hurt','scream']){const variants=FIGHT_VOCAL_BANKS.mutilator.variants[mode];assert.equal(new Set(variants.map(x=>x.phrase)).size,4);const buffers=variants.map((_,i)=>renderFightVocal('mutilator',mode,22050,i));assert.equal(new Set(buffers.map(x=>x.length)).size,4);assert.equal(new Set(buffers.map(x=>createHash('sha256').update(Buffer.from(x.buffer)).digest('hex'))).size,4);for(const buffer of buffers){assert(buffer.every(x=>Number.isFinite(x)&&Math.abs(x)<=.781));assert(buffer.some(x=>Math.abs(x)>.1));}}const sound=planFightSound({type:'deletion-impact',cue:'cleaver-high-cut',attackerId:'mutilator',victimId:'6-bit',damageKind:'cut',strength:2});assert(sound.layers.length>0);assert.equal(planCharacterFoley({type:'attack',attackerId:'mutilator'}, {variant:3}).fighterId,'mutilator');});
test('online compatibility rejects the previous18-fighter build and retains Mutilator in the19-fighter roster',()=>{assert.equal(ONLINE_VERSION,'system-clash-20261010-11');const source=readFileSync(new URL('../src/lib/system-clash-online.ts',import.meta.url),'utf8');const ids=JSON.parse(source.match(/ONLINE_FIGHTERS=(\[[^;]+\]) as const/)[1]);assert.equal(ids.length,19);assert.equal(ids.filter(id=>id==='mutilator').length,1);});
for(const dir of [-1,1])for(const victimId of ['doofnoobler','papa-oak'])test(`Brew City Massacre keeps one frozen native body, emits four ordered actual contacts and retains a heap (${dir},${victimId})`,()=>{
 const definition=deletionDefinition('mutilator');assert.equal(definition.name,'Brew City Massacre');assert.equal(definition.mechanism,'cleaver');assert.equal(definition.prop,false);
 const match=ending(dir,victimId),b=definition.beats,contacts=match._deletionOrigin.cleaverContacts;assert.equal(contacts.length,4);assert.deepEqual(contacts.map(c=>c.at),[b.highCut,b.torsoCut,b.lowCut,b.finalCut]);
 const frozen=contacts[0].victimPose;assert(frozen);assert(contacts.every(c=>JSON.stringify(c.victimPose)===JSON.stringify(frozen)));let last=0;
 for(const c of contacts){
  advance(match,c.at-last);last=c.at;const hero=getFighterView(match,0),victim=getFighterView(match,1);
  assert.equal(hero.clip,'delete-cleaver');assert.equal(hero.elapsed,c.elapsed);assert.equal(hero.frameIndex,c.frameIndex);
  assert.equal(victim.clip,frozen.clip);assert.equal(victim.elapsed,frozen.elapsed);if(frozen.frameIndex!==undefined)assert.equal(victim.frameIndex,frozen.frameIndex);
  assert.equal(victim.rotation??0,0);assert.equal(victim.airborne,false);assert.equal(victim.y,0);assert.equal(hero.y,0);assert.equal(victim.x,match._deletionOrigin.originalVictim);assert(Math.abs(hero.x-c.winnerX)<.001);
  const start=worldPoint(hero,native.mutilator.art,'strikeStart'),end=worldPoint(hero,native.mutilator.art,'strike'),asset=native[victimId].art.clips[victim.clip],index=poseFrameIndex(asset,victim),body=native[victimId].metadata[victim.clip].combatPoses.frames[victim.facing][index];
  assert(body.hurt.filter(r=>r.site===c.site).some(r=>limbContact(start,end,{...r,left:victim.x+r.left,right:victim.x+r.right,top:620+r.top,bottom:620+r.bottom},0)),'Actual blade metal touches the frozen native body without fictitious reach or radius');
 }
 advance(match,definition.duration+500-last);const events=consumeEvents(match).filter(e=>e.type==='deletion-impact');assert.deepEqual(events.map(e=>e.cue),['cleaver-high-cut','cleaver-torso-cut','cleaver-low-cut','cleaver-final']);assert.deepEqual(events.map(e=>e.site),contacts.map(c=>c.site));assert(events.every(e=>e.damageKind==='cut'));
 for(const [i,event]of events.entries()){assert(Math.abs(event.x-contacts[i].contact.x)<.001);assert(Math.abs(event.y-620-contacts[i].contact.y)<.001);}
 assert.equal(events.at(-1).aftermath,'butcher-heap');assert.equal(match.phase,'over');assert.equal(getFighterView(match,1).opacity,0);assert.equal(getFighterView(match,1).clip,frozen.clip);assert.equal(getFighterView(match,1).elapsed,frozen.elapsed);
});
test('cleaver registration follows actual cut sites in the frozen native body and removes it at the final cut',()=>{
 const match=ending(1,'papa-oak'),b=deletionDefinition('mutilator').beats,contacts=match._deletionOrigin.cleaverContacts,art=[native.mutilator.art,native['papa-oak'].art];
 for(const [t,p]of [[b.highCut,.25],[b.torsoCut,.5],[b.lowCut,.85],[b.finalCut,1]]){
  match.deletionElapsed=t;const views=[getFighterView(match,0),getFighterView(match,1)],registered=registerNewDeletionViews(match,views,art,worldPoint,{remains:{}});assert(registered);
  assert.equal(registered[1].remainsState.exposure,p);assert.deepEqual(registered[1].remainsState.woundSites,[...new Set(contacts.filter(c=>c.at<=t).map(c=>c.site))]);assert.equal(registered[1].remainsState.fall,0);assert.equal(registered[1].remainsState.pose,t>=b.finalCut?'heap':'standing');
  assert.equal(registered[1].clip,contacts[0].victimPose.clip);assert.equal(registered[1].elapsed,contacts[0].victimPose.elapsed);if(t>=b.finalCut)assert.equal(registered[1].opacity,0);
 }
});
test('final cleaver produces a bounded seeded native skull, bone, tissue and cloth heap',()=>{const fx=createFightEffects({seed:88});fx.emit({type:'deletion-impact',cue:'cleaver-final',attackerId:'mutilator',victimId:'6-bit',site:'head',damageKind:'cut',aftermath:'butcher-heap',victimHeight:320,x:700,y:360,strength:3.4});const stats=fx.getStats();assert(stats.headChunks>0);assert(stats.boneChunks>=2);assert(stats.organicChunks>stats.boneChunks);assert(stats.clothChunks>0);assert(stats.rupturePileChunks>=10);assert(stats.chunks<=96);});

test('each cleaver cut opens ragged wounds only at its native head, torso and lower-body contact bands',()=>{
 const image={},polygons=[];let path=[];const layer={clearRect(){polygons.length=0;},drawImage(){},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){polygons.push(path);}},canvas={width:0,height:0,getContext:()=>layer},ctx={canvas:{ownerDocument:{createElement:()=>canvas}},drawImage(){}};
 const frame={opaqueBounds:[0,0,100,200],attachments:{head:[50,25],torso:[50,90],legs:[50,160]}},geometry={sx:0,sy:0,sw:100,sh:200,dx:0,dy:0,scale:1,frame};
 for(const site of ['head','torso','legs']){assert.equal(drawRemainsReveal(ctx,image,{remainsState:{exposure:.5,woundSites:[site]}},geometry),true);assert(polygons.length>0);const ys=polygons.flat().map(p=>p[1]);assert(ys.every(y=>Math.abs(y-frame.attachments[site][1])<22),'Whole-source cut mask stays near the actual contact band');}
});

test('Mutilator uses each supplied stage theme even when Character themes is selected',()=>{assert.equal(MUSIC_MANIFEST.fighters.mutilator,undefined);for(const [stage,id]of Object.entries(MUSIC_MANIFEST.stages))for(const musicStyle of ['stage','fighter'])assert.equal(resolveMusicTrack(MUSIC_MANIFEST,{screen:'fight',fighter:'mutilator',stage,musicStyle}).id,id);});
