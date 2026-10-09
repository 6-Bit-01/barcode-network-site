import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoRoster,createDemoSelection,beginDemoSelection,previewDemoFighter,confirmDemoFighter,backDemoSelection,randomDemoFighter,navigateDemoFighter,demoFightURL,parseDemoLaunch} from '../public/games/system-clash/play/demo-flow.mjs';
const mains=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/menu/roster.json',import.meta.url))).fighters;

test('all registered fighters are playable and unregistered Mutilator stays reserved',()=>{
 const roster=demoRoster(mains);assert.equal(roster.length,18);assert.equal(roster.filter(f=>f.enabled).length,mains.length);
 assert.deepEqual(roster.filter(f=>!f.enabled).map(f=>f.name),mains.some(f=>f.id==='mutilator')?[]:['Mutilator']);
 for(const future of roster.filter(f=>!f.enabled)){
  const state=beginDemoSelection(createDemoSelection(mains),'cpu');assert.equal(previewDemoFighter(state,future.id),state);
 }
});
test('both demo modes require two valid locks and preserve independently selected identities, including mirror matches',()=>{
 for(const mode of ['cpu','local'])for(const a of mains)for(const b of mains){
  let state=createDemoSelection(mains);assert.equal(beginDemoSelection(state,'practice'),state);
  state=beginDemoSelection(state,mode);state=previewDemoFighter(state,a.id);
  assert.throws(()=>demoFightURL(state,'https://barcode.example/games/system-clash/play/index.html'));
  state=confirmDemoFighter(state);assert.equal(state.activePlayer,1);assert.equal(state.screen,'select');
  state=previewDemoFighter(state,b.id);state=confirmDemoFighter(state);assert.equal(state.screen,'ready');
  const url=demoFightURL(state,'https://barcode.example/games/system-clash/play/index.html',{muted:true,reducedMotion:true});
  assert.equal(url.pathname,'/games/system-clash/play/fight.html');assert.equal(url.origin,'https://barcode.example');
  assert.equal(url.searchParams.get('p1'),a.id);assert.equal(url.searchParams.get('p2'),b.id);assert.equal(url.searchParams.get('mode'),mode);
  assert.equal(url.searchParams.get('sound'),'0');assert.equal(url.searchParams.get('motion'),'1');
  state=backDemoSelection(state);assert.equal(state.screen,'select');assert.equal(state.activePlayer,0);assert.deepEqual(state.confirmed,[false,false]);
 }
});
test('Random chooses only playable opponents, covers all other fighters and changes the current preview',()=>{
 for(const fighter of mains){
  let state=beginDemoSelection(createDemoSelection(mains,{p2:fighter.id}),'cpu');state=confirmDemoFighter(state);
  const results=new Set();for(let i=0;i<120;i++){const next=randomDemoFighter(state,()=>i/120);assert.notEqual(next.picks[1],fighter.id);assert.ok(mains.some(f=>f.id===next.picks[1]));assert.equal(next.picks[0],state.picks[0]);results.add(next.picks[1]);}
  assert.equal(results.size,mains.length-1);assert.ok(mains.some(f=>f.id===randomDemoFighter(state,()=>NaN).picks[1]));
 }
});
test('keyboard navigation reaches every current main and skips the reserved slot in both selection stages',()=>{
 for(const mode of ['cpu','local'])for(const stage of [0,1]){
  let state=beginDemoSelection(createDemoSelection(mains),mode);if(stage)state=confirmDemoFighter(state);
  const seen=new Set();for(let i=0;i<18;i++){state=navigateDemoFighter(state,'ArrowRight');seen.add(state.picks[stage]);assert.ok(mains.some(f=>f.id===state.picks[stage]));}
  assert.equal(seen.size,mains.length);
  for(const key of ['ArrowLeft','ArrowUp','ArrowDown'])for(let i=0;i<18;i++){state=navigateDemoFighter(state,key);assert.ok(mains.some(f=>f.id===state.picks[stage]));}
 }
});
test('demo URL launch accepts only playable identities and the two advertised modes',()=>{
 const good=parseDemoLaunch('https://barcode.example/fight.html?demo=1&mode=local&p1=wittyf0x&p2=cliff&sound=0&motion=1',mains);
 assert.deepEqual(good,{stage:'radio-studio',enabled:true,mode:'local',p1:'wittyf0x',p2:'cliff',muted:true,reducedMotion:true});
 const bad=parseDemoLaunch('https://barcode.example/fight.html?demo=1&mode=practice&p1=hellcat&p2=javascript:alert(1)',mains);
 assert.equal(bad.mode,'cpu');assert.equal(bad.p1,mains[0].id);assert.equal(bad.p2,mains[1].id);
 assert.equal(parseDemoLaunch('https://barcode.example/fight.html',mains).enabled,false);
});

test('Tournament selects only P1 and leaves normal solo and local two-lock flows intact',()=>{
 let state=beginDemoSelection(createDemoSelection(mains),'tournament');assert.equal(state.mode,'tournament');assert.equal(state.screen,'select');state=previewDemoFighter(state,'wittyf0x');state=confirmDemoFighter(state);assert.equal(state.screen,'ready');assert.equal(state.picks[0],'wittyf0x');assert.deepEqual(state.confirmed,[true,true]);assert.throws(()=>demoFightURL(state,'https://barcode.example/'));
 state=backDemoSelection(state);assert.equal(state.screen,'select');assert.equal(state.activePlayer,0);assert.deepEqual(state.confirmed,[false,false]);assert.equal(backDemoSelection(state).screen,'title');
});

test('select roster follows the chosen sequence, retains other relative order and finishes Mutilator then 9 Bit',()=>{
 const expected=['6-bit','cache-back','dj-floppydisc','mac-modem','cliff','mr-nice-guy','lost-marbles','ash-flowers','wittyf0x','lyra','papa-oak','ms-mayhem','stolz','kaveman-brown','dr3wbaby','doofnoobler','mutilator','9-bit'];
 assert.deepEqual(demoRoster(mains).map(f=>f.id),expected);
 const unregistered=mains.filter(f=>f.id!=='mutilator'),registered=[...unregistered,{id:'mutilator',name:'Mutilator'}];
 assert.deepEqual(demoRoster(registered).map(f=>f.id),expected);
 assert.equal(demoRoster(unregistered).at(-2).enabled,false);assert.equal(demoRoster(registered).at(-2).enabled,true);
});

test('selection copy has no future placeholder when all 18 fighters are playable',()=>{
 assert.equal(demoRoster(mains).filter(fighter=>fighter.enabled).length,18);
 const html=readFileSync(new URL('../public/games/system-clash/play/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/Future roster|class="future-note"/i);
});
