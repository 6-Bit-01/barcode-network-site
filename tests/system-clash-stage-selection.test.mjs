import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {STAGES} from '../public/games/system-clash/play/fight-stages.mjs';
import {createDemoSelection,beginDemoSelection,confirmDemoFighter,selectDemoStage,cycleDemoStage,demoFightURL,parseDemoLaunch} from '../public/games/system-clash/play/demo-flow.mjs';
import {createTournamentRun,launchTournamentMatch,consumeTournamentResult,continueTournamentRun,retryTournamentRun} from '../public/games/system-clash/play/tournament.mjs';
const mains=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/menu/roster.json',import.meta.url))).fighters;
test('all six stages are selectable, survive demo URL and reject unknown room IDs',()=>{
 for(const spec of STAGES){
  let state=beginDemoSelection(createDemoSelection(mains,{stage:spec.id}),'cpu');
  assert.equal(state.stage,spec.id);state=confirmDemoFighter(confirmDemoFighter(state));
  const url=demoFightURL(state,'https://barcode.example/index.html');
  assert.equal(url.searchParams.get('stage'),spec.id);assert.equal(parseDemoLaunch(url,mains).stage,spec.id);
 }
 const state=createDemoSelection(mains);assert.equal(selectDemoStage(state,'secret-unregistered-room'),state);
 assert.equal(parseDemoLaunch('https://barcode.example/fight.html?stage=bad',mains).stage,'radio-studio');
});
test('ready-screen stage cycling wraps and keeps locked fighter choices',()=>{
 let state=beginDemoSelection(createDemoSelection(mains),'local');state=confirmDemoFighter(confirmDemoFighter(state));
 const picks=[...state.picks];for(let i=0;i<6;i++)state=cycleDemoStage(state,1);
 assert.equal(state.stage,'radio-studio');assert.deepEqual(state.picks,picks);assert.deepEqual(state.confirmed,[true,true]);
 assert.equal(cycleDemoStage(state,-1).stage,'witty-wasteland');
});
test('tournament distributes six rooms across its eight nodes and keeps room on retry',()=>{
 let run=createTournamentRun(mains,{fighterId:mains[0].id,seed:17,runId:'stage-test'});const visited=new Set();
 for(let i=0;i<8;i++){
  const launch=launchTournamentMatch(run,'https://barcode.example/index.html');visited.add(launch.url.searchParams.get('stage'));
  assert.ok(STAGES.some(s=>s.id===launch.url.searchParams.get('stage')));
  const lost=consumeTournamentResult(launch.run,{phase:'over',winner:1,resultId:launch.run.resultId});
  const retry=launchTournamentMatch(retryTournamentRun(lost),launch.url);
  assert.equal(retry.url.searchParams.get('stage'),launch.url.searchParams.get('stage'));
  const won=consumeTournamentResult(launch.run,{phase:'over',winner:0,resultId:launch.run.resultId});run=continueTournamentRun(won);
 }
 assert.equal(visited.size,6);
});
test('every stage includes its central plate and distinct floor, wall, control and emitter assets',()=>{
 for(const spec of STAGES){
  const dir=new URL('../public/games/system-clash/play/assets/stages/',import.meta.url);
  for(const suffix of ['.webp','-kit.webp','-layers.json'])assert.ok(existsSync(new URL(spec.id+suffix,dir)));
  const layers=JSON.parse(readFileSync(new URL(spec.id+'-layers.json',dir)));
  assert.equal(layers.id,spec.id);assert.deepEqual(Object.keys(layers.frames),['leftWall','rightWall','control','emitter','floorStrip']);
  const bounds=[];for(const frame of Object.values(layers.frames)){
   const [x,y,w,h]=frame.rect;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=layers.width&&y+h<=layers.height);
   assert.ok(frame.anchor[0]>=0&&frame.anchor[0]<=w&&frame.anchor[1]===h);bounds.push(frame.rect);
  }
  for(let a=0;a<bounds.length;a++)for(let b=a+1;b<bounds.length;b++){
   const [x,y,w,h]=bounds[a],[u,v,p,q]=bounds[b];assert.ok(x+w<=u||u+p<=x||y+h<=v||v+q<=y);
  }
 }
});


import {createDeletionReview} from '../public/games/system-clash/play/fight-review.mjs';
test('frame inspection retains the selected room rather than switching to a different stage',()=>{
 const art=[{manifest:{id:'6-bit',character:'6 Bit',height:320}},{manifest:{id:'9-bit',character:'9 Bit',height:368}}];
 for(const stage of ['containment','studio-rat-lair','witty-wasteland']){
  const review=createDeletionReview({stage,time:0,art,metadata:Array.from({length:2},()=>Object.fromEntries(['delete-brace','delete-suspended','delete-compressed','delete-crumpled','knockdown'].map(name=>[name,{duration:700}]))),renderer:{resolveEvent:event=>event},reducedMotion:true});assert.equal(review.match.stage.id,stage);assert.equal(review.match.phase,'deletion');
 }
});
