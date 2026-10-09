import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
const boot=source.slice(source.indexOf('async function boot()'),source.indexOf("$('fighter-one').addEventListener('change'"));
function harness(loader){
 const prepared=[],errors=[],elements=new Map(),art=[{manifest:{id:'6-bit',character:'Six'}},{manifest:{id:'9-bit',character:'Nine'}}];
 const node=id=>elements.get(id)??(elements.set(id,{value:'6-bit',options:[{}],classList:{remove(){},add(value){errors.push(value);}}}),elements.get(id));
 const env={loadRevision:0,motionPresentationEpoch:0,interfaceArtPending:null,remainsArt:null,remainsArtPending:null,pauseDialog:{open:false},roundMenu:{reset(){}},loading(){},loading(){},roundMenu:{reset(){}},stageArt:null,stageArtPending:null,match:null,loadStageArt:async()=>({id:"radio-studio",image:{},kit:{},layers:{}}),clearInput(){},effects:{clear(){}},URL,location:{href:'https://example.com/fight.html'},window:{SYSTEM_CLASH_FIGHT_BUNDLE:{images:{}}},$:node,
  loadInterfaceArt:loader,loadRemainsArt:async()=>({manifest:{anonymous:true,normalHeight:665,frames:{}},images:{}}),loadFightArt:async()=>art,loadArcadeArt:async()=>{},loadDeletionArt:async()=>({}),loadWeaponArt:async()=>({}),loadFighterPortraits:async()=>({}),
  renderer:{prepareArt(){},prepareInterface(value){prepared.push(value);}},combatMetadata:()=>[],showContextArtLinks(){},showFighterStyles(){},document:{querySelectorAll:()=>[]},onlineBridge:{enabled:false},launchParams:new URLSearchParams(),deletionDefinition:()=>null,reset(){},initializeOnlineCombat(){}};
 runInNewContext(boot,env);return {env,prepared,errors,node};
}
test('boot loads optional interface art once and passes it to the real renderer preparation path',async()=>{
 let calls=0;const art={manifest:{version:1},images:{timer:{width:84,height:68}}},h=harness(async options=>{calls++;assert.equal(options.bundle,h.env.window.SYSTEM_CLASH_FIGHT_BUNDLE);return art;});
 assert.ok(/import\s*\{loadInterfaceArt\}\s*from ['"]\.\/interface-art\.mjs['"]/.test(source),'Imports the optional loader');
 await h.env.boot();await h.env.boot();assert.equal(calls,1);assert.equal(h.prepared.length,2);assert(h.prepared.every(value=>value===art));assert.equal(h.env.ready,true);
});
test('an optional interface failure preserves a ready playable match and native interface fallback',async()=>{
 const h=harness(async()=>{throw Error('optional SVG missing');});await h.env.boot();
 assert.equal(h.env.ready,true);assert.equal(h.errors.length,0);assert.equal(h.prepared.length,1);assert.deepEqual(Object.keys(h.prepared[0].images),[]);
});
test('an obsolete load cannot prepare interface art or overwrite the latest fighter bank',async()=>{
 let finish,calls=0;const art={manifest:{version:1},images:{}},h=harness(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
 const banks=[];h.env.loadFightArt=async()=>{const bank=[{manifest:{id:'6-bit',character:'Six '+banks.length}},{manifest:{id:'9-bit',character:'Nine'}}];banks.push(bank);return bank;};
 const old=h.env.boot();for(let i=0;i<8;i++)await Promise.resolve();
 const next=h.env.boot();for(let i=0;i<8;i++)await Promise.resolve();
 finish(art);await Promise.all([old,next]);assert.equal(calls,1);assert.equal(h.prepared.length,1);assert.equal(h.env.ready,true);assert.equal(h.env.art,banks.at(-1),'Latest bank stays installed');
});
test('boot draw feeds presentation time and both review states without replacing original status text',()=>{
 assert(!source.includes('\uFFFD'));
 assert.match(source,/presentationTimeMs:\s*performance\.now\(\)/);
 assert.match(source,/deletionReview:\s*inspectTime!==null/);
 assert(source.includes('Loading attack poses…'));assert(source.includes('Paused — Options / × or P to resume; ○ returns to character select.'));
});
test('boot and match reset advance a stable presentation epoch used by every rendered snapshot',()=>{
 assert.ok(/motionResetKey:\s*motionPresentationEpoch/.test(source),'Draw supplies explicit run identity');
 const reset=source.slice(source.indexOf('function reset('),source.indexOf('function start('));
 assert.ok(/motionPresentationEpoch\+\+/.test(boot),'Fighter reload discards old motion');
 assert.ok(/motionPresentationEpoch\+\+/.test(reset),'Actual match reset discards old motion');
 assert.ok(!/motionPresentationEpoch/.test(source.match(/onState:snapshot=>\{([^}]*)\}/)?.[1]??''),'A guest snapshot keeps the run identity');
});

test('boot stays blocked behind the static loading screen until selected stage art settles',async()=>{const h=harness(async()=>({manifest:null,images:{},failures:[]}));let finish;h.env.loadStageArt=()=>new Promise(resolve=>finish=resolve);const pending=h.env.boot();for(let i=0;i<12&&!finish;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(h.env.ready,false);assert.notEqual(h.node('asset-loading').hidden,true);assert.equal(h.prepared.length,0);finish({id:'radio-studio',image:{},kit:{},layers:{}});await pending;assert.equal(h.env.ready,true);assert.equal(h.node('asset-loading').hidden,true);});
test('required stage failure leaves input blocked and retryable rather than a half-drawn arena',async()=>{const h=harness(async()=>({images:{}}));h.env.window.SYSTEM_CLASH_FIGHT_BUNDLE=undefined;let failure;h.env.loading=(text,_progress,failed)=>{if(failed)failure=text;};h.env.loadStageArt=async()=>({id:'radio-studio',image:null,kit:null,layers:null});await h.env.boot();assert.equal(h.env.ready,false);assert.match(failure,/Retry loading/);h.env.loadStageArt=async()=>({id:'radio-studio',image:{},kit:{},layers:{}});await h.env.boot();assert.equal(h.env.ready,true);});

test('hosted visual-art failure stays on the real loader and retry fetches fresh art',async()=>{
 let calls=0;const h=harness(async()=>{calls++;if(calls===1)throw Error('missing artwork');return {manifest:{version:1},images:{timer:{}},failures:[]};});
 h.env.window.SYSTEM_CLASH_FIGHT_BUNDLE=undefined;let failure;
 h.env.loading=(message,_progress,failed)=>{if(failed)failure=message;};
 await h.env.boot();assert.equal(h.env.ready,false);assert.match(failure,/Interface artwork.*Retry loading/);
 assert.equal(h.env.interfaceArtPending,null,'Failed art must not be reused on Retry');
 await h.env.boot();assert.equal(h.env.ready,true);assert.equal(calls,2);
});


test('boot gates the arena on required shared remains and registers its cached bank',async()=>{
 const h=harness(async()=>({images:{},failures:[]})),bank={manifest:{anonymous:true,normalHeight:665,frames:{}},images:{standing:{}}};
 h.env.window.SYSTEM_CLASH_FIGHT_BUNDLE=undefined;let finish,calls=0,stageCalls=0;
 h.env.loadRemainsArt=options=>{calls++;assert.equal(options.bundle,undefined);return new Promise(resolve=>{finish=resolve;});};
 h.env.loadStageArt=async()=>{stageCalls++;return {id:'radio-studio',image:{},kit:{},layers:{}};};
 const pending=h.env.boot();for(let i=0;i<12&&!finish;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.match(source,/import\s*\{loadRemainsArt\}\s*from ['"]\.\/fight-remains\.mjs['"]/);
 assert.equal(typeof finish,'function');assert.equal(h.env.ready,false);assert.notEqual(h.node('asset-loading').hidden,true);assert.equal(h.prepared.length,0);assert.equal(stageCalls,0,'A required anatomy wait precedes arena registration');
 finish(bank);await pending;
 assert.equal(h.env.ready,true);assert.equal(h.env.deletionProp.remains,bank);assert.equal(h.env.remainsArt,bank);assert.equal(stageCalls,1);
 await h.env.boot();assert.equal(calls,1,'Fighter reloads reuse the settled shared bank');assert.equal(h.env.deletionProp.remains,bank);assert.equal(h.prepared.length,2);
});

test('required shared-remains failure keeps input blocked and retries a fresh bank',async()=>{
 const h=harness(async()=>({images:{},failures:[]})),bank={manifest:{anonymous:true,normalHeight:665,frames:{}},images:{standing:{}}};
 h.env.window.SYSTEM_CLASH_FIGHT_BUNDLE=undefined;let calls=0,stageCalls=0,failure;
 h.env.loadRemainsArt=async()=>{calls++;if(calls===1)throw Error('The shared remains artwork could not load. Retry loading.');return bank;};
 h.env.loadStageArt=async()=>{stageCalls++;return {id:'radio-studio',image:{},kit:{},layers:{}};};
 h.env.loading=(message,_progress,failed)=>{if(failed)failure=message;};
 await h.env.boot();assert.equal(h.env.ready,false);assert.notEqual(h.node('asset-loading').hidden,true);assert.match(failure,/shared remains artwork.*Retry loading/);
 assert.equal(h.env.remainsArtPending,null,'A rejected shared bank must be fetched again on Retry');assert.equal(h.env.remainsArt,null);assert.equal(h.prepared.length,0);assert.equal(stageCalls,0);
 await h.env.boot();assert.equal(h.env.ready,true);assert.equal(calls,2);assert.equal(h.env.deletionProp.remains,bank);assert.equal(h.prepared.length,1);assert.equal(stageCalls,1);
});
