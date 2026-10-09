import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex,poseScale,resolvePoseAttachments} from '../public/games/system-clash/play/fight-attachments.mjs';
import {createMatch,performAction,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {registerNewDeletionViews,litterBoxGeometry} from '../public/games/system-clash/play/new-deletion-renderer.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
import {makeFightSnapshot,applyFightSnapshot} from '../public/games/system-clash/play/fight-network-state.mjs';
const root=fileURLToPath(new URL('../public/games/system-clash/play/assets/',import.meta.url));
function size(file){
 const bytes=fs.readFileSync(file);
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 assert(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','Native PNG or WebP image');
 for(let at=12;at+8<=bytes.length;){const kind=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),data=at+8;assert(data+length<=bytes.length,'Complete WebP chunk');
  if(kind==='VP8X'){assert(length>=10);return {width:1+bytes.readUIntLE(data+4,3),height:1+bytes.readUIntLE(data+7,3)};}
  if(kind==='VP8L'){assert(length>=5&&bytes[data]===0x2f);const value=bytes.readUInt32LE(data+1);return {width:1+(value&0x3fff),height:1+((value>>>14)&0x3fff)};}
  if(kind==='VP8 '){assert(length>=10&&bytes.subarray(data+3,data+6).equals(Buffer.from([0x9d,0x01,0x2a])));return {width:bytes.readUInt16LE(data+6)&0x3fff,height:bytes.readUInt16LE(data+8)&0x3fff};}
  at=data+length+(length&1);
 }throw new Error('Unknown native sprite dimensions');
}
function native(id){const clips={};let manifest;for(const bank of ['fighters','arcade','deletions']){const folder=path.join(root,bank,id),data=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));if(bank==='fighters')manifest=data;for(const [name,clip] of Object.entries(data.clips)){const key=bank==='deletions'?'delete-'+name:name;clips[key]=compileFightClip(clip,size(path.join(folder,clip.file)),data,key);}}return {manifest,clips};}
const nativeIds=['6-bit','9-bit','ash-flowers','cache-back','cliff','dj-floppydisc','doofnoobler','dr3wbaby','kaveman-brown','lyra','mac-modem','mr-nice-guy','ms-mayhem','papa-oak','stolz','wittyf0x'];
const art=Object.fromEntries(nativeIds.map(id=>[id,native(id)]));
function point(v,a,site){const c=a.clips[v.clip],i=poseFrameIndex(c,v),f=c.data.frames[v.facing][i],o=f.offset??[0,0],raw=f.attachments?.[site],p=raw?{x:raw[0],y:raw[1]}:resolvePoseAttachments(f,v.clip,i,v.facing,a.manifest.id)[site],s=poseScale(c,f);return {x:v.x+(p.x+o[0]-f.anchor[0])*s,y:620+(v.y??0)+(p.y+o[1]-f.anchor[1])*s};}
function scene(hero,victim,facing='right'){const source=[art[hero],art[victim]],match=createMatch({mode:'practice',fighters:source.map(a=>({id:a.manifest.id,height:a.manifest.height})),clips:combatMetadata(source)});match.fighters[0].x=facing==='right'?210:2350;match.fighters[1].x=match.fighters[0].x+(facing==='right'?1:-1)*75;assert(performAction(match,0,'deletion'));return {match,source};}
function views(match,source,t){match.deletionElapsed=t;return registerNewDeletionViews(match,match.fighters.map((_,i)=>getFighterView(match,i)),source,point);}


const trayManifest=JSON.parse(fs.readFileSync(path.join(root,'deletions/litter-protocol/atlas.json'),'utf8')),tray={additional:{'litter-protocol':{manifest:trayManifest}}};
function fitted(match,source,t){match.deletionElapsed=t;return registerNewDeletionViews(match,match.fighters.map((_,i)=>getFighterView(match,i)),source,point,tray);}
function wholeBounds(v,a){const c=a.clips[v.clip],f=c.data.frames[v.facing][poseFrameIndex(c,v)],o=f.offset??[0,0],s=poseScale(c,f),b=f.opaqueBounds;return {left:v.x+(b[0]+o[0]-f.anchor[0])*s,right:v.x+(b[2]+o[0]-f.anchor[0])*s,bottom:620+v.y+(b[3]+o[1]-f.anchor[1])*s};}
for(const facing of ['right','left'])for(const id of nativeIds)test('Native basin fit, constant compact pose and clear hero spacing: '+id+' '+facing,()=>{
 const {match,source}=scene('lyra',id,facing),b=deletionDefinition('lyra').beats,settled=fitted(match,source,b.basinSettled),g=litterBoxGeometry(match,tray,source),body=wholeBounds(settled[1],source[1]),reference=trayManifest.frames.open;
 assert(Math.abs(g.left-(g.centre+(reference.aperture[0]-reference.anchor[0])*g.scale))<.001,'Mask follows the actual authored opening');assert(Math.abs(g.right-g.left-reference.aperture[2]*g.scale)<.001,'No separate wider mask');assert(body.left>=g.left+7.5&&body.right<=g.right-7.5,'Complete asymmetric native pose fits with clearance');assert(Math.abs(body.bottom-g.basinFloor)<.001,'Native bottom rests on the actual litter plane');
 const expected=['lyra','papa-oak','doofnoobler'].includes(id)?2:source[1].clips['delete-crumpled'].timeline.entries.at(-1).index;assert.equal(poseFrameIndex(source[1].clips['delete-crumpled'],settled[1]),expected,'Existing compact full-body key is selected without timeline mutation');
 const identity=v=>[v.clip,v.elapsed,v.facing,v.frameIndex];for(const t of [b.basinContact,b.basinSettled,b.kick,b.litterImpact,b.buried]){const v=fitted(match,source,t)[1];assert.deepEqual(identity(v),identity(settled[1]));assert.equal(v.rotation??0,0);assert(!v.halfMask&&!v.splitBody);}
 const base=g.scale;for(const t of [b.boxReach,b.boxSet,b.fallStart,b.basinContact,b.kick,b.buried,b.complete]){fitted(match,source,t);assert.equal(litterBoxGeometry(match,tray,source).scale,base,'Scale is fixed before entry through victory');}
 for(const t of [b.kick,b.complete]){const v=fitted(match,source,t)[0],box=litterBoxGeometry(match,tray,source),f=box.frame,outerLeft=box.x+f.opaqueBounds[0]*box.scale,outerRight=box.x+f.opaqueBounds[2]*box.scale,h=wholeBounds(v,source[0]);assert(facing==='right'?h.right<=outerLeft-11.5:h.left>=outerRight+11.5,'Full native hero clears the tray at kick/victory');}
 const before=fitted(match,source,b.fallStart-.001)[1],start=fitted(match,source,b.fallStart)[1];assert(Math.hypot(point(before,source[1],'torso').x-point(start,source[1],'torso').x,point(before,source[1],'torso').y-point(start,source[1],'torso').y)<2);assert(point(settled[1],source[1],'torso').y>point(start,source[1],'torso').y+31.5,'Every native size has a visible downward fall before settling');let previous=point(start,source[1],'torso');for(let t=b.fallStart;t<=b.basinContact;t+=10){const v=fitted(match,source,t)[1],p=point(v,source[1],'torso');assert(Math.hypot(p.x-previous.x,p.y-previous.y)<15,'One smooth native airborne path reaches the compact basin pose');previous=p;}
});
test('Explicit native frame selection validates indices and preserves legacy timelines',()=>{const a=art.lyra.clips['delete-crumpled'],v={clip:'delete-crumpled',facing:'right',elapsed:10000};const legacy=poseFrameIndex(a,v);assert.equal(legacy,1);assert.equal(poseFrameIndex(a,{...v,frameIndex:2}),2);for(const invalid of [-1,.5,99,'2',NaN,Infinity])assert.equal(poseFrameIndex(a,{...v,frameIndex:invalid}),legacy);assert.equal(poseFrameIndex(a,{...v,facing:'front',frameIndex:2}),legacy);assert.deepEqual(a.data.order,[0,1]);});

test('Fitted tray poses and spacing derive identically from guest snapshots',()=>{let seq=0;for(const id of nativeIds)for(const facing of ['right','left']){const {match,source}=scene('lyra',id,facing),b=deletionDefinition('lyra').beats,options={roster:nativeIds,clipIds:source.map(a=>Object.keys(a.clips)),matchId:1};match.mode='local';const guest=createMatch({mode:'local',fighters:source.map(a=>({id:a.manifest.id,height:a.manifest.height})),clips:combatMetadata(source)});for(const t of [b.fallStart,b.basinContact,b.kick,b.buried,b.complete]){match.deletionElapsed=t;const raw=match.fighters.map((_,i)=>getFighterView(match,i)),wire=makeFightSnapshot(match,raw,{...options,seq:++seq,at:t});assert(wire);assert.deepEqual(registerNewDeletionViews(applyFightSnapshot(guest,wire),wire.views,source,point,tray),registerNewDeletionViews(match,raw,source,point,tray));}}});
