import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';
import * as flow from '../public/games/system-clash/play/demo-flow.mjs';
const loaderURL=new URL('../public/games/system-clash/play/interface-art.mjs',import.meta.url);
const uiURL=new URL('../public/games/system-clash/play/assets/ui/',import.meta.url);
const manifest=()=>JSON.parse(readFileSync(new URL('manifest.json',uiURL),'utf8'));
const BASE='https://barcode.example/games/system-clash/play/fight.html';
function imagesFor(spec,{fail,mismatch}={}){return (_,key)=>({width:spec.assets[key].width,height:spec.assets[key].height,set src(value){this.source=value;queueMicrotask(()=>{if(key===fail)this.onerror();else {if(key===mismatch)this.width++;this.onload();}});}});}
function surface(){const calls=[],context=new Proxy({}, {get(target,key){if(key in target)return target[key];if(key==='createLinearGradient'||key==='createRadialGradient')return (...args)=>({addColorStop(){}});return (...args)=>calls.push([key,...args]);}});return {calls,width:0,height:0,getContext(){return context;}};}

test('shared settings preserve explicit off against OS preference and use OS only without a valid motion choice',()=>{
 assert.equal(typeof flow.resolveInterfaceSettings,'function');
 assert.deepEqual(flow.resolveInterfaceSettings(BASE+'?sound=0&motion=0',{prefersReducedMotion:true}),{muted:true,reducedMotion:false});
 assert.deepEqual(flow.resolveInterfaceSettings(BASE+'?sound=1&motion=1',{prefersReducedMotion:false}),{muted:false,reducedMotion:true});
 assert.deepEqual(flow.resolveInterfaceSettings(BASE,{prefersReducedMotion:true}),{muted:false,reducedMotion:true});
 assert.deepEqual(flow.resolveInterfaceSettings(new URLSearchParams('motion=broken'),{prefersReducedMotion:true}),{muted:false,reducedMotion:true});
 const roster=[{id:'6-bit'},{id:'9-bit'}];
 assert.equal(flow.parseDemoLaunch(BASE+'?demo=1&motion=0',roster).reducedMotion,false);
});

test('every interface source and served artwork decodes at its declared dimensions with no external dependency',async()=>{
 const spec=manifest();assert.equal(spec.version,1);assert.equal(Object.keys(spec.assets).length,21);
 const sharp=(await import('sharp')).default;
 for(const [key,asset]of Object.entries(spec.assets)){
  const source=readFileSync(new URL(asset.file,uiURL));
  if(asset.file.endsWith('.svg')){
   const text=source.toString();
   assert.match(text,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
   assert.doesNotMatch(text,/<(?:script|text|foreignObject|image)\b|(?:href|src)=|@import|url\(https?:/i,key);
  }
  for(const file of [asset.file,...(asset.runtimeFile?[asset.runtimeFile]:[])]){
   const actual=await sharp(readFileSync(new URL(file,uiURL))).metadata();
   assert.equal(actual.width,asset.width,key);assert.equal(actual.height,asset.height,key);
   if(file.endsWith('.webp'))assert.equal(actual.hasAlpha,true,key+' has native transparency');
  }

 }
});

test('hosted interface loads once from the current origin and verifies each decoded dimension',async()=>{
 const {loadInterfaceArt}=await import(loaderURL),spec=manifest(),requests=[];
 const art=await loadInterfaceArt({baseURL:BASE,fetch:async value=>{requests.push(String(value));return {ok:true,json:async()=>spec};},imageFactory:imagesFor(spec)});
 assert.deepEqual(requests,['https://barcode.example/games/system-clash/play/assets/ui/manifest.json']);
 assert.equal(Object.keys(art.images).length,21);assert.deepEqual(art.failures,[]);
 for(const [key,image]of Object.entries(art.images))assert.equal(image.source,new URL('assets/ui/'+(spec.assets[key].runtimeFile??spec.assets[key].file),BASE).href);
});

test('portable bundles use embedded interface art and an older bundle falls back without network work',async()=>{
 const {loadInterfaceArt}=await import(loaderURL),spec=manifest();let requests=0;
 const fetch=async()=>{requests++;throw Error('Portable interface must not fetch');};
 const bundle={interface:spec,images:Object.fromEntries(Object.values(spec.assets).map(a=>['assets/ui/'+a.file,'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')]))};
 const ready=await loadInterfaceArt({baseURL:'file:///D:/portable/fight.html',bundle,fetch,imageFactory:imagesFor(spec)});
 assert.equal(Object.keys(ready.images).length,21);assert.equal(requests,0);
 const old=await loadInterfaceArt({baseURL:'file:///D:/portable/fight.html',bundle:{images:{}},fetch,imageFactory:()=>{throw Error('No available images');}});
 assert.deepEqual(old.images,{});assert.equal(requests,0);
 const escaped={interface:spec,images:Object.fromEntries(Object.values(spec.assets).map(a=>['assets/ui/'+a.file,'file:///C:/outside.svg']))};
 const safe=await loadInterfaceArt({baseURL:'file:///D:/portable/fight.html',bundle:escaped,fetch,imageFactory:()=>{throw Error('No external decode');}});
 assert.deepEqual(safe.images,{});assert.equal(requests,0);
});

test('invalid remote/traversal SVG references fail closed, while a failed optional image leaves usable native fallbacks',async()=>{
 const {loadInterfaceArt}=await import(loaderURL),spec=manifest();
 for(const file of ['https://outside.example/frame.svg','../fighters/frame.svg','%2e%2e/frame.svg','//outside.example/frame.svg']){
  const bad=structuredClone(spec);bad.assets.timer.file=file;let decoded=0;
  const rejected=await loadInterfaceArt({baseURL:BASE,fetch:async()=>({ok:true,json:async()=>bad}),imageFactory:()=>{decoded++;throw Error('Unexpected decode');}});
  assert.deepEqual(rejected.images,{});assert.equal(decoded,0);assert.ok(rejected.failures.includes('manifest'));
 }
 for(const option of [{fail:'timer'},{mismatch:'timer'}]){
  const partial=await loadInterfaceArt({baseURL:BASE,fetch:async()=>({ok:true,json:async()=>spec}),imageFactory:imagesFor(spec,option)});
  assert.equal(Object.keys(partial.images).length,20);assert.ok(partial.failures.includes('timer'));assert.equal(partial.images.timer,undefined);
 }
 const missing=await loadInterfaceArt({baseURL:BASE,fetch:async()=>{throw Error('offline');}});assert.deepEqual(missing.images,{});
});

test('actual HUD uses vector furniture after the world transform while health, charges, names and timer remain native',()=>{
 const spec=manifest(),screen=surface(),renderer=createFightRenderer(screen),images=Object.fromEntries(Object.entries(spec.assets).map(([key,a])=>[key,{key,width:a.width,height:a.height}]));
 assert.equal(typeof renderer.prepareInterface,'function');renderer.prepareInterface({manifest:spec,images});
 const match={phase:'fight',fighters:[{id:'6-bit',name:'Six',hp:50,maxHp:100,weapon:{type:'pulse-driver',name:'PULSE DRIVER',charges:2}},{id:'9-bit',name:'Nine',hp:25,maxHp:100,weapon:{type:'neural-spike',charges:1}}],stagePickups:[],projectiles:[],roundRemaining:90000};
 const before=structuredClone(match),portraits={'6-bit':{width:80,height:80},'9-bit':{width:80,height:80}};
 screen.calls.length=0;renderer.draw({match,views:[],art:[],portraits,effects:{camera:{x:8,y:-4},flash:0}});
 assert.deepEqual(match,before,'Cosmetic interface cannot mutate combat');
 const reset=screen.calls.findLastIndex(([key,...args])=>key==='setTransform'&&args.join(',')==='1,0,0,1,0,0');
 const furniture=screen.calls.map((call,index)=>({call,index})).filter(({call})=>call[0]==='drawImage'&&call[1]?.key);
 assert.deepEqual(new Set(furniture.map(({call})=>call[1].key)),new Set(['railP1','railP2','portraitP1','portraitP2','timer','weaponP1','weaponP2','barcodeMark']));
 assert.ok(furniture.every(({index})=>index>reset),'Furniture stays fixed to viewport');
 assert.ok(screen.calls.some(([key,x,y,w,h])=>key==='fillRect'&&x===143&&y===55&&w===179&&h===13),'P1 health remains its exact native value');
 assert.ok(screen.calls.some(([key,x,y,w,h])=>key==='fillRect'&&x===1047.5&&y===55&&w===89.5&&h===13),'P2 meter drains inward');
 for(const value of ['Six','Nine','50 / 100','25 / 100','90','PULSE DRIVER'])assert.ok(screen.calls.some(([key,text])=>key==='fillText'&&text===value),value);
 screen.calls.length=0;renderer.draw({match:{...match,phase:'ready'},views:[],art:[],portraits});
 assert.ok(screen.calls.some(([key,image])=>key==='drawImage'&&image===images.announcement));
 assert.ok(screen.calls.some(([key,text])=>key==='fillText'&&text==='START FIGHT'));
 renderer.prepareInterface(null);assert.doesNotThrow(()=>renderer.draw({match,views:[],art:[]}));
});


test('actual online lobby bootstrap honors motion off even when the OS prefers reduced motion',async()=>{
 const {mountOnlineLobby}=await import('../public/games/system-clash/play/online.mjs');
 for(const [query,os,expected]of [['?motion=0&sound=0',true,false],['?motion=1',false,true],['',true,true],['',false,false]]){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,dataset:{},addEventListener(){},setAttribute(){},removeAttribute(){},querySelectorAll(){return [];}});return nodes.get(id);};
  const document=Object.assign(new EventTarget(),{documentElement:node('document-element'),getElementById:node,querySelectorAll:()=>[],hasFocus:()=>true});
  const window={location:{href:'https://barcode.example/online.html'+query},matchMedia:()=>({matches:os}),addEventListener(){},removeEventListener(){},clearTimeout(){},cancelAnimationFrame(){},sessionStorage:{removeItem(){}}};
  // Stop at the roster boundary after the real lobby has resolved/applied settings.
  const lobby=await mountOnlineLobby({document,window,fetch:async()=>({ok:false})});
  assert.equal(node('motion-setting').checked,expected,query||'OS default');
  assert.equal(node('sound-setting').checked,!query.includes('sound=0'));
  lobby.destroy();
 }
});

test('hosted interface requires every current hazard asset while legacy portable nine-key art remains valid',async()=>{
 const {loadInterfaceArt}=await import(loaderURL),spec=manifest();
 for(const key of Object.keys(spec.assets).slice(9)){const partial=structuredClone(spec);delete partial.assets[key];const loaded=await loadInterfaceArt({baseURL:BASE,fetch:async()=>({ok:true,json:async()=>partial}),imageFactory:imagesFor(partial)});assert(loaded.failures.includes('manifest'),key+' missing hosted art rejects');}
 const old=structuredClone(spec);for(const key of Object.keys(old.assets).slice(9))delete old.assets[key];
 const bundle={interface:old,images:Object.fromEntries(Object.values(old.assets).map(a=>['assets/ui/'+a.file,'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')]))};
 const legacy=await loadInterfaceArt({baseURL:'file:///D:/portable/fight.html',bundle,imageFactory:imagesFor(old)});assert.deepEqual(legacy.failures,[]);assert.equal(Object.keys(legacy.images).length,9);
});
