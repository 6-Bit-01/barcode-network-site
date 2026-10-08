import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMatch,advanceMatch,performAction,consumeEvents,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
const root=fileURLToPath(new URL('../public/games/system-clash/play/assets/',import.meta.url));
function size(file){const bytes=fs.readFileSync(file);if(bytes[0]===137)return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};for(let at=12;at+8<=bytes.length;){const kind=bytes.toString('ascii',at,at+4),n=bytes.readUInt32LE(at+4),p=at+8;if(kind==='VP8X')return {width:1+bytes.readUIntLE(p+4,3),height:1+bytes.readUIntLE(p+7,3)};if(kind==='VP8L'){const v=bytes.readUInt32LE(p+1);return {width:1+(v&0x3fff),height:1+((v>>>14)&0x3fff)};}if(kind==='VP8 ')return {width:bytes.readUInt16LE(p+6)&0x3fff,height:bytes.readUInt16LE(p+8)&0x3fff};at=p+n+(n&1);}throw new Error('Unknown sprite');}
const roster=JSON.parse(fs.readFileSync(path.join(root,'fight-roster.json'))).fighters.filter(f=>f.enabled);
const art=Object.fromEntries(roster.map(({id})=>{let manifest;const clips={};for(const bank of ['fighters','arcade']){const dir=path.join(root,bank,id),m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));if(bank==='fighters')manifest=m;for(const [name,c]of Object.entries(m.clips))clips[name]=compileFightClip(c,size(path.join(dir,c.file)),m,name);}return [id,{manifest,clips}];}));
function scene(ids,facing,gap){const source=ids.map(id=>art[id]),match=createMatch({mode:'local',start:false,fighters:source.map(a=>({id:a.manifest.id,height:a.manifest.height})),clips:combatMetadata(source)});match.phase='fight';const dir=facing==='right'?1:-1;match.fighters[0].x=900;match.fighters[1].x=900+dir*gap;match.fighters[0].facing=facing;match.fighters[1].facing=dir>0?'left':'right';return match;}
function run(match,ms,controls=[{},{}]){for(let elapsed=0;elapsed<ms;elapsed+=10)advanceMatch(match,Math.min(10,ms-elapsed),controls);}
for(const facing of ['right','left'])test(`Doof's full native punch hits 9 Bit's visible lower leg (${facing})`,()=>{
 const match=scene(['doofnoobler','9-bit'],facing,168);assert(performAction(match,0,'punch'));consumeEvents(match);run(match,650);
 const hits=consumeEvents(match).filter(e=>e.type==='hit'&&e.action==='punch');assert.equal(hits.length,1,'The committed native palm intersects the visible shin, including the leg away from its single attachment');assert.equal(hits[0].site,'legs');assert(match.fighters[1].hp<match.fighters[1].maxHp);
});
for(const facing of ['right','left'])test(`a short native fighter pushes a tall body gently without walking behind a leg (${facing})`,()=>{
 const match=scene(['doofnoobler','9-bit'],facing,210),dir=facing==='right'?1:-1;const startTall=match.fighters[1].x;let maxPush=0;
 for(let elapsed=0;elapsed<1400;elapsed+=10){const before=match.fighters[1].x;advanceMatch(match,10,[{move:dir},{}]);maxPush=Math.max(maxPush,Math.abs(match.fighters[1].x-before));assert((match.fighters[1].x-match.fighters[0].x)*dir>=145,'The small chest cannot enter either native upper shin');}
 assert((match.fighters[1].x-startTall)*dir>20,'Walking body pressure moves the other fighter');assert(maxPush<5,'Normal pressure is shared in small simulation steps');
});
for(const facing of ['right','left'])test(`Drew's uppercut lands during its native rise against Mayhem (${facing})`,()=>{
 const match=scene(['dr3wbaby','ms-mayhem'],facing,140);assert(performAction(match,0,'uppercut'));consumeEvents(match);run(match,900);
 const hits=consumeEvents(match).filter(e=>e.type==='hit'&&e.action==='uppercut');assert.equal(hits.length,1,'The grounded forward fist reaches the body before the authored high-fist marker');assert(match.fighters[1].hp<match.fighters[1].maxHp);
});
for(const {id}of roster)for(const facing of ['right','left'])test(`${id}'s full native uppercut can contact an unequal-height opponent (${facing})`,()=>{
 const target=id==='9-bit'?'papa-oak':id==='papa-oak'?'6-bit':'9-bit';let landed;
 for(const gap of [100,120,140,160,180,200,220,240]){const match=scene([id,target],facing,gap);run(match,20);assert(performAction(match,0,'uppercut'));consumeEvents(match);const duration=match.fighters[0]._clips.uppercut.duration;run(match,duration+350);const events=consumeEvents(match),hits=events.filter(e=>e.type==='hit'&&e.action==='uppercut');assert(hits.length<=1,'One native rise cannot hit repeatedly');if(hits.length){landed=hits[0];assert(match.fighters[1].hp<match.fighters[1].maxHp);break;}}
 assert(landed,'At legal body spacing at least one authored rising forearm reaches the real unequal-height body');
});
for(const facing of ['right','left'])test(`native uppercuts keep a true distant miss and original playback (${facing})`,()=>{
 for(const {id}of roster){const target=id==='9-bit'?'papa-oak':id==='papa-oak'?'6-bit':'9-bit',match=scene([id,target],facing,600);assert(performAction(match,0,'uppercut'));const before=getFighterView(match,0),duration=match.fighters[0]._clips.uppercut.duration;consumeEvents(match);run(match,duration+350);const events=consumeEvents(match);assert.equal(events.filter(e=>e.type==='hit'||e.type==='block').length,0);assert.equal(events.filter(e=>e.type==='miss'&&e.action==='uppercut').length,1);assert.equal(match.fighters[1].hp,match.fighters[1].maxHp);assert.equal(before.nativeElapsed,0);}
});

for(const {id}of roster)for(const facing of ['right','left'])test(`${id} keeps a smaller native body in front under walking pressure (${facing})`,()=>{
 const target=id==='doofnoobler'?'9-bit':'doofnoobler',match=scene([id,target],facing,300),dir=facing==='right'?1:-1,start=match.fighters[1].x;let maxPush=0;
 for(let t=0;t<1800;t+=10){const previous=match.fighters[1].x;advanceMatch(match,10,[{move:dir},{}]);maxPush=Math.max(maxPush,Math.abs(match.fighters[1].x-previous));assert((match.fighters[1].x-match.fighters[0].x)*dir>=70,'Native bodies keep their order through the whole walk loop');}
 assert((match.fighters[1].x-start)*dir>5,'Contact pressure reaches and pushes the other native body');assert(maxPush<8,'Body pressure cannot pop the victim by a large fraction of its height');
});
for(const facing of ['right','left'])test(`lower-body pressure transfers a wall-blocked share to the other fighter (${facing})`,()=>{
 const match=scene(['doofnoobler','9-bit'],facing,100),dir=facing==='right'?1:-1,target=match.fighters[1];target.x=dir>0?2350:210;match.fighters[0].x=target.x-dir*100;const before=match.fighters[0].x;run(match,20);
 assert.equal(target.x,dir>0?2350:210);assert((match.fighters[0].x-before)*dir<0,'A blocked wall share is resolved by the other body, rather than allowing overlap');assert((target.x-match.fighters[0].x)*dir>145);
});
for(const facing of ['right','left'])test(`both authored 9 Bit shins remain hittable with empty space between their lower bands (${facing})`,async()=>{
 const {nativeBodyLegs,gripContact}=await import('../public/games/system-clash/play/fight-combat-geometry.mjs'),sharp=(await import('sharp')).default,a=art['9-bit'],asset=a.clips.idle,frame=asset.data.frames[facing][0],pose=combatMetadata([a])[0].idle.combatPoses.frames[facing][0];const {poseScale}=await import('../public/games/system-clash/play/fight-attachments.mjs'),scale=poseScale(asset,frame);
 const legs=nativeBodyLegs(pose,pose,{id:'9-bit',height:368,facing}),row=facing==='right'?213:206,columns=facing==='right'?[40,160]:[45,165];const pixels=await sharp(path.join(root,'fighters/9-bit',asset.data.file)).extract({left:frame.rect[0],top:frame.rect[1],width:frame.rect[2],height:frame.rect[3]}).ensureAlpha().raw().toBuffer();
 for(const x of columns){assert(pixels[(row*frame.rect[2]+x)*4+3]>=128,'The fixture is an opaque authored shin pixel');const point={x:(x-frame.anchor[0])*scale,y:(row-frame.anchor[1])*scale};assert(legs.some(region=>gripContact(point,region,0)),'Both native shins accept an exact real body contact');}
 const gap={x:facing==='right'?15:20,y:-70};assert(legs.every(region=>!gripContact(gap,region,0)),'Separated lower legs do not turn the empty central gap into a solid rectangle');
});

test('lower-body profiles fail closed without a native body or facing',async()=>{
 const {nativeBodyLegs}=await import('../public/games/system-clash/play/fight-combat-geometry.mjs');assert.deepEqual(nativeBodyLegs(null,null,{id:'9-bit',facing:'right',height:368}),[]);const pose=combatMetadata([art['9-bit']])[0].idle.combatPoses.frames.right[0];for(const options of [{id:'unknown',facing:'right',height:368},{id:'9-bit',facing:'sideways',height:368},{id:'9-bit',facing:'right',height:NaN},{id:'9-bit',facing:'right',height:0}])assert.deepEqual(nativeBodyLegs(pose,pose,options),[]);
});
