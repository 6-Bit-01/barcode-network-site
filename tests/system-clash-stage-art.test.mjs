import test from 'node:test';
import assert from 'node:assert/strict';
import {loadStageArt} from '../public/games/system-clash/play/fight-assets.mjs';

function browserAssets(t,{fail=()=>false}={}) {
 const loaded=[],fetched=[];const OriginalImage=globalThis.Image,originalFetch=globalThis.fetch;
 globalThis.Image=class {width=1672;height=941;set src(url){this.url=url;loaded.push(url);queueMicrotask(()=>fail(url)?this.onerror?.():this.onload?.());}};
 globalThis.fetch=async url=>{fetched.push(String(url));return {ok:!fail(String(url)),json:async()=>({frames:{control:{rect:[0,0,160,200],anchor:[80,200]},floorStrip:{rect:[0,200,512,80],anchor:[0,0]}}})};};
 t.after(()=>{globalThis.Image=OriginalImage;globalThis.fetch=originalFetch;});return {loaded,fetched};
}

test('stage loading selects only its plate and matched optional layers',async t=>{
 const {loaded,fetched}=browserAssets(t);const art=await loadStageArt({id:'radio-studio',baseURL:'https://assets.invalid/selected/'});
 assert.equal(art.id,'radio-studio');assert(art.image&&art.kit);assert(art.layers.frames.control);assert.equal(art.warnings.length,0);
 assert.equal(loaded.length,2);assert(loaded.every(url=>url.includes('/radio-studio')));assert.equal(fetched.length,1);
});

test('missing kit or plate preserves a usable selected-stage fallback and reports warnings',async t=>{
 browserAssets(t,{fail:url=>url.includes('kit.webp')||url.includes('sheila-office.webp')});
 const art=await loadStageArt({id:'sheila-office',baseURL:'https://assets.invalid/fallback/'});
 assert.equal(art.id,'sheila-office');assert.equal(art.image,null);assert.equal(art.kit,null);assert(art.warnings.length>=2);
});

test('stage art retains at most two recently selected rooms',async t=>{
 const {loaded}=browserAssets(t);const baseURL='https://assets.invalid/bounded/';
 for(const id of ['radio-studio','sheila-office','containment'])await loadStageArt({id,baseURL});
 const before=loaded.length;await loadStageArt({id:'containment',baseURL});assert.equal(loaded.length,before,'Current stage reuses decoded art');
 await loadStageArt({id:'radio-studio',baseURL});assert.equal(loaded.length,before+2,'Evicted stage reloads instead of retaining six room images');
});

test('offline selected-stage images and metadata need no fetch',async t=>{
 const {loaded,fetched}=browserAssets(t);const id='nature-simulation',frames={control:{rect:[0,0,100,160],anchor:[50,160]}};
 const bundle={images:{[`assets/stages/${id}.webp`]:'data:image/webp;base64,plate',[`assets/stages/${id}-kit.webp`]:'data:image/webp;base64,kit'},stages:{[id]:{frames}}};
 const art=await loadStageArt({id,bundle,baseURL:'https://assets.invalid/offline/'});assert.equal(art.layers.frames,frames);assert.equal(fetched.length,0);assert.equal(loaded.length,2);
});
