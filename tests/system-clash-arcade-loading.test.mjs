import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assetPath,loadArcadeArt} from '../public/games/system-clash/play/fight-assets.mjs';

const root=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url));
const actions=['low-punch','low-kick','jump','uppercut','crouch-punch','crouch-kick','jump-punch','jump-kick','pickup','crouch-high-kick','double-punch','power-kick'];
const manifests=Object.fromEntries(['6-bit','9-bit'].map(id=>[id,JSON.parse(fs.readFileSync(path.join(root,'assets/arcade',id,'manifest.json'),'utf8'))]));
const urlFor=(id,data)=>new URL(assetPath(`assets/arcade/${id}/manifest.json`,data.runtimeFile??data.file),'https://game.example/').href;
function size(bytes){
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 for(let at=12;at+8<=bytes.length;){const kind=bytes.toString('ascii',at,at+4),n=bytes.readUInt32LE(at+4),p=at+8;
  if(kind==='VP8X')return {width:1+bytes.readUIntLE(p+4,3),height:1+bytes.readUIntLE(p+7,3)};
  if(kind==='VP8L'){const v=bytes.readUInt32LE(p+1);return {width:1+(v&0x3fff),height:1+((v>>>14)&0x3fff)};}
  if(kind==='VP8 ')return {width:bytes.readUInt16LE(p+6)&0x3fff,height:bytes.readUInt16LE(p+8)&0x3fff};at=p+n+(n&1);
 }throw Error('Unknown native image dimensions');
}
function gate({failManifest}={}){
 const previousImage=globalThis.Image,previousFetch=globalThis.fetch,requests=[],fetched=[];
 globalThis.Image=class {
  set src(value){this.source=value;Object.assign(this,size(fs.readFileSync(path.join(root,new URL(value).pathname.slice(1)))));requests.push(this);}
 };
 globalThis.fetch=async value=>{const id=new URL(value).pathname.split('/').at(-2);fetched.push(id);return {ok:id!==failManifest,json:async()=>manifests[id]};};
 return {requests,fetched,restore(){globalThis.Image=previousImage;globalThis.fetch=previousFetch;}};
}
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function fighters(ids){return ids.map(id=>({manifest:{id,character:id},clips:{idle:{marker:id}}}));}

// No atlas may complete until all independent atlas requests are observed.
// The duplicate fighter exercises the one-cache-per-load identity contract.
test('arcade manifests and every unique native atlas start together before any image completes',{timeout:3000},async()=>{
 const gated=gate(),art=fighters(['6-bit','9-bit','6-bit']);let finished=false;
 const loading=loadArcadeArt({baseURL:'https://game.example/',art});
 const observed=loading.then(()=>{finished=true;return null;},error=>{finished=true;return error;});
 try{
  await nextTurn();
  assert.deepEqual(gated.fetched,['6-bit','9-bit','6-bit'],'independent fighter manifests start before an atlas can finish');
  const expected=new Set(art.flatMap(f=>actions.map(name=>urlFor(f.manifest.id,manifests[f.manifest.id].clips[name]))));
  assert.deepEqual(new Set(gated.requests.map(image=>image.source)),expected,'all unique atlas requests begin while image completion is gated');
  assert.equal(gated.requests.length,expected.size,'shared clip and duplicate-fighter atlases request one image each');
  assert.equal(finished,false);
  for(const image of [...gated.requests].reverse())image.onload();
  assert.equal(await observed,null);
  for(const fighter of art){
   assert.equal(fighter.arcadeManifest,manifests[fighter.manifest.id]);
   assert.deepEqual(fighter.clips.idle,{marker:fighter.manifest.id});
   assert.deepEqual(Object.keys(fighter.clips),['idle',...actions],'asynchronous image completion preserves final clip order');
   for(const name of actions){const clip=fighter.clips[name];assert.equal(clip.data,manifests[fighter.manifest.id].clips[name]);assert.equal(clip.image.source,urlFor(fighter.manifest.id,clip.data));assert(clip.timeline.duration>0);}
  }
  for(const name of actions)assert.equal(art[0].clips[name].image,art[2].clips[name].image);
 }finally{
  if(!finished)for(const image of gated.requests)image.onerror();
  await observed;gated.restore();
 }
});

test('arcade manifest failure propagates without waiting for another fighter image',{timeout:3000},async()=>{
 const gated=gate({failManifest:'9-bit'});const loading=loadArcadeArt({baseURL:'https://game.example/',art:fighters(['6-bit','9-bit'])});
 try{await assert.rejects(loading,/9-bit: arcade poses unavailable/);assert(gated.requests.length>0,'the other fighter atlas remains gated when manifest failure rejects');}finally{for(const image of gated.requests)image.onload();await nextTurn();gated.restore();}
});

test('arcade atlas failure rejects the load rather than leaving it pending',{timeout:3000},async()=>{
 const gated=gate();const loading=loadArcadeArt({baseURL:'https://game.example/',art:fighters(['6-bit','9-bit'])});
 const rejection=assert.rejects(loading,/An arcade pose sheet did not load/);
 try{await nextTurn();assert(gated.requests.length>0);gated.requests[0].onerror();await rejection;}finally{for(const image of gated.requests)image.onload();await nextTurn();gated.restore();}
});
