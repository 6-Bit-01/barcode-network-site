import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileMenuIdle,menuIdleFrame,createMenuPreviewLoader} from '../public/games/system-clash/play/menu-preview.mjs';
const root=new URL('../public/games/system-clash/play/',import.meta.url),roster=JSON.parse(readFileSync(new URL('assets/menu/roster.json',root))).fighters;
test('compact atlases retain both approved idle banks, source hashes, timing, common floor and fighter scale',()=>{
 for(const fighter of roster){const source=JSON.parse(readFileSync(new URL(`assets/fighters/${fighter.id}/manifest.json`,root))),idle=source.clips.idle,data=JSON.parse(readFileSync(new URL(`assets/menu/${fighter.id}-idle.json`,root)));assert.equal(data.id,fighter.id);assert.equal(data.heightScale,fighter.heightScale);assert.equal(data.groundY,430);assert.deepEqual(data.canvasSize,fighter.menuCanvasSize??[320,440]);assert.deepEqual(data.order,idle.order??[0,1,2,3]);assert.deepEqual(data.frameMs,idle.frameMs);assert.equal(data.sourceSha256,createHash('sha256').update(readFileSync(new URL(`assets/fighters/${fighter.id}/${idle.file}`,root))).digest('hex'));assert.ok(existsSync(new URL(data.file, new URL('assets/menu/',root))));
  for(const facing of ['left','right']){assert.equal(data.frames[facing].length,idle.frames[facing].length);data.frames[facing].forEach((frame,i)=>{assert.deepEqual(frame.sourceRect??frame.rect,idle.frames[facing][i].rect);assert.deepEqual(frame.anchor,idle.frames[facing][i].anchor);assert.ok(frame.rect[0]+frame.rect[2]<=data.atlasSize[0]&&frame.rect[1]+frame.rect[3]<=data.atlasSize[1]);});}
  const height=Math.max(...Object.entries(data.frames).flatMap(([facing,bank])=>bank.map((frame,i)=>(frame.anchor[1]-idle.frames[facing][i].opaqueBounds[1]-(frame.offset?.[1]??0))*data.scale*(frame.bodyCalibration??1))));assert.ok(Math.abs(height-320*fighter.heightScale)<(source.status==='genuine whole-body native keys'?320*fighter.heightScale*.12:.01));
  const compiled=compileMenuIdle(data,{width:data.atlasSize[0],height:data.atlasSize[1]});assert.equal(menuIdleFrame(compiled,0,'right').index,data.order[0]);assert.equal(menuIdleFrame(compiled,181,'left').facing,'left');assert.equal(menuIdleFrame(compiled,999,'left',true).index,data.order[0]);
 }
});
test('selected-only loading caches identities and ignores stale rapid-selection resolutions',async()=>{
 const pending=new Map(),calls=[];const loader=createMenuPreviewLoader({load:id=>{calls.push(id);return new Promise(resolve=>pending.set(id,resolve));}});let applied=[];
 const first=loader.select(0,'6-bit',value=>applied.push(value)),second=loader.select(0,'9-bit',value=>applied.push(value));await Promise.resolve();pending.get('9-bit')('current');await second;pending.get('6-bit')('stale');await first;assert.deepEqual(applied,['current']);assert.deepEqual(calls,['6-bit','9-bit']);
 await loader.select(1,'9-bit',value=>applied.push(value));assert.deepEqual(calls,['6-bit','9-bit']);assert.deepEqual(applied,['current','current']);loader.invalidate();await loader.select(0,'9-bit',value=>applied.push(value));assert.equal(applied.at(-1),'current');
});
test('invalid menu timing, missing authored bank and overflowing source rect fail to standing fallback',()=>{
 const valid={id:'6-bit',file:'6-bit-idle.webp',atlasSize:[20,20],canvasSize:[320,440],groundY:430,heightScale:1,scale:1,order:[0],frameMs:[180],frames:{right:[{rect:[0,0,10,10],anchor:[5,10]}],left:[{rect:[10,0,10,10],anchor:[5,10]}]}};
 assert.ok(compileMenuIdle(valid,{width:20,height:20}));for(const data of [{...valid,frameMs:[0]},{...valid,frames:{right:valid.frames.right}},{...valid,atlasSize:[2,2]},{...valid,canvasSize:[90000,440]}])assert.throws(()=>compileMenuIdle(data,{width:20,height:20}));
});

test('failed preview loads settle on null without loading unused fighters',async()=>{
 const calls=[];const loader=createMenuPreviewLoader({load:id=>{calls.push(id);throw new Error('missing art');}});let applied='unchanged';await loader.select(0,'cliff',value=>{applied=value;});assert.equal(applied,null);assert.deepEqual(calls,['cliff']);await loader.select(1,'cliff',value=>{applied=value;});assert.equal(applied,null);assert.deepEqual(calls,['cliff']);
});
