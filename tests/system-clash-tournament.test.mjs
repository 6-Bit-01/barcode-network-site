import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTournamentRun,validateTournamentRun,launchTournamentMatch,consumeTournamentResult,continueTournamentRun,retryTournamentRun,saveTournamentRun,loadTournamentRun,readTournamentContext,TOURNAMENT_STORAGE_KEY} from '../public/games/system-clash/play/tournament.mjs';
const roster=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/menu/roster.json',import.meta.url))).fighters;
const settings={muted:true,reducedMotion:true,controllerSeats:[3,6]};
const create=(seed=19)=>createTournamentRun(roster,{fighterId:'6-bit',seed,runId:'test-run',settings});
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
test('seeded eight-node tournament excludes its player from early rivals and persists its exact run',()=>{
 const one=create(),two=create();assert.deepEqual(one,two);assert.equal(one.opponents.length,8);assert.equal(new Set(one.opponents).size,8);assert.ok(one.opponents.every(id=>id!=='6-bit'&&roster.some(f=>f.id===id)));
 assert.notDeepEqual(one.opponents,create(20).opponents);const store=storage();assert.equal(saveTournamentRun(store,one,roster),true);assert.deepEqual(loadTournamentRun(store,roster),one);
 assert.throws(()=>createTournamentRun(roster,{fighterId:'hellcat',seed:1,runId:'test'}));
});
test('saved run fails closed for malformed storage, shuffled/duplicate opponents, mismatched tokens and invalid progress',()=>{
 const store=storage();for(const raw of ['{','null','[]','"wrong"']){store.setItem(TOURNAMENT_STORAGE_KEY,raw);assert.equal(loadTournamentRun(store,roster),null);}
 for(const edit of [{version:99},{opponents:Array(8).fill('cliff')},{node:8},{node:3,attempt:1,status:'fighting',resultId:'test-run.3.1'},{node:1,attempt:1,status:'fighting',resultId:'test-run.1.1'},{attempt:-1},{status:'anything'},{fighterId:'hellcat'},{runId:'<script>'},{seed:-1},{settings:{controllerSeats:[-1,0]}},{status:'won',resultId:'bad'}])assert.equal(validateTournamentRun({...create(),...edit},roster),null);
 assert.equal(loadTournamentRun({getItem(){throw new Error('disabled');}},roster),null);assert.equal(saveTournamentRun({setItem(){throw new Error('quota');}},create(),roster),false);
});
test('launch retains seats and sound/motion, and accepts only the saved current fight token and pair',()=>{
 const store=storage(),launch=launchTournamentMatch(create(),'https://barcode.example/games/system-clash/play/index.html',{muted:false,reducedMotion:false,controllerSeats:[2,5]});
 assert.equal(launch.run.status,'fighting');assert.equal(launch.url.searchParams.get('p1'),'6-bit');assert.equal(launch.url.searchParams.get('p2'),launch.run.opponents[0]);assert.equal(launch.url.searchParams.get('mode'),'cpu');assert.equal(launch.url.searchParams.get('sound'),'1');assert.equal(launch.url.searchParams.get('motion'),'0');assert.equal(launch.url.searchParams.get('pad1'),'2');assert.equal(launch.url.searchParams.get('pad2'),'5');
 saveTournamentRun(store,launch.run,roster);assert.deepEqual(readTournamentContext(launch.url,roster,store),launch.run);
 for(const [key,value] of [['run','different'],['match','old-result'],['p2','hellcat'],['mode','local']]){const url=new URL(launch.url);url.searchParams.set(key,value);assert.equal(readTournamentContext(url,roster,store),null);}
 assert.throws(()=>launchTournamentMatch(launch.run,'https://barcode.example/'));
});
test('Deletion finish is never consumed before over, and the exact result is consumed only once',()=>{
 const run=launchTournamentMatch(create(),'https://barcode.example/').run;
 for(const phase of ['ready','fight','finish','deletion'])assert.equal(consumeTournamentResult(run,{phase,winner:0,resultId:run.resultId}),run);
 assert.equal(consumeTournamentResult(run,{phase:'over',winner:0,resultId:'stale'}),run);assert.equal(consumeTournamentResult(run,{phase:'over',winner:2,resultId:run.resultId}),run);
 const won=consumeTournamentResult(run,{phase:'over',winner:0,resultId:run.resultId});assert.equal(won.status,'won');assert.equal(won.node,0);assert.equal(consumeTournamentResult(won,{phase:'over',winner:0,resultId:run.resultId}),won);
 const next=continueTournamentRun(won);assert.equal(next.node,1);assert.equal(next.status,'ready');assert.equal(continueTournamentRun(next),next);
 const launched=launchTournamentMatch(next,'https://barcode.example/').run;assert.notEqual(launched.resultId,run.resultId);assert.equal(consumeTournamentResult(launched,{phase:'over',winner:0,resultId:run.resultId}),launched);
});
test('loss retry and draw replay hold the same node; complete requires eight explicit wins',()=>{
 for(const winner of [1,null]){const run=launchTournamentMatch(create(),'https://barcode.example/').run;const ended=consumeTournamentResult(run,{phase:'over',winner,resultId:run.resultId});assert.equal(ended.status,winner===1?'lost':'draw');assert.equal(continueTournamentRun(ended),ended);const retry=retryTournamentRun(ended);assert.equal(retry.node,run.node);assert.equal(retryTournamentRun(retry),retry);const again=launchTournamentMatch(retry,'https://barcode.example/').run;assert.equal(again.opponents[again.node],run.opponents[run.node]);assert.notEqual(again.resultId,run.resultId);}
 let run=create();for(let i=0;i<8;i++){run=launchTournamentMatch(run,'https://barcode.example/').run;run=consumeTournamentResult(run,{phase:'over',winner:0,resultId:run.resultId});assert.equal(run.node,i);assert.equal(run.status,i===7?'complete':'won');if(i<7)run=continueTournamentRun(run);}
 assert.equal(continueTournamentRun(run),run);assert.equal(retryTournamentRun(run),run);
});

test('saved final result survives reload without duplicate advancement and carries current settings into retry',()=>{
 const store=storage(),started=launchTournamentMatch(create(),'https://barcode.example/'),lost=consumeTournamentResult(started.run,{phase:'over',winner:1,resultId:started.run.resultId});saveTournamentRun(store,lost,roster);const restored=readTournamentContext(started.url,roster,store);assert.equal(restored.status,'lost');assert.equal(consumeTournamentResult(restored,{phase:'over',winner:0,resultId:restored.resultId}),restored);const retry=launchTournamentMatch(retryTournamentRun(restored),started.url,{muted:false,reducedMotion:true,controllerSeats:[4,null]});assert.equal(retry.url.searchParams.get('sound'),'1');assert.equal(retry.url.searchParams.get('motion'),'1');assert.equal(retry.url.searchParams.get('pad1'),'4');assert.equal(retry.url.searchParams.has('pad2'),false);assert.equal(retry.run.node,0);
});


test('new tournaments reserve BNL and 9 Bit for the final two nodes even while player selection is locked',()=>{
 const locked=roster.map(f=>({...f,enabled:!['bnl-01','9-bit'].includes(f.id)}));
 for(let seed=0;seed<200;seed++){
  const run=createTournamentRun(locked,{fighterId:'6-bit',seed,runId:'boss-route'});
  assert.deepEqual(run.opponents.slice(6),['bnl-01','9-bit']);
  assert.equal(new Set(run.opponents).size,8);
  assert.ok(run.opponents.slice(0,6).every(id=>!['6-bit','bnl-01','9-bit'].includes(id)));
  assert.equal(validateTournamentRun(run,locked)?.runId,run.runId);
 }
 for(const fighterId of ['bnl-01','9-bit'])assert.throws(()=>createTournamentRun(roster,{fighterId,seed:1,runId:'locked-player'}));
});
test('CORPORATE players retain the fixed boss order with an intentional late mirror match',()=>{
 const unlocked=roster.map(f=>({...f,enabled:true}));
 for(const fighterId of ['bnl-01','9-bit']){
  const run=createTournamentRun(unlocked,{fighterId,seed:17,runId:'unlocked-player',settings:{...settings,corporateUnlocked:true}});
  assert.deepEqual(run.opponents.slice(6),['bnl-01','9-bit']);assert.ok(!run.opponents.slice(0,6).includes(fighterId));
  const store=storage();assert.equal(saveTournamentRun(store,run,unlocked),true);assert.deepEqual(loadTournamentRun(store,unlocked),run);
 }
});
test('new boss route cannot be reordered or downgraded into a legacy random route',()=>{
 const run=createTournamentRun(roster,{fighterId:'6-bit',seed:19,runId:'route-tamper'});
 for(const opponents of [[...run.opponents.slice(0,6),'9-bit','bnl-01'],['bnl-01',...run.opponents.slice(1)]])assert.equal(validateTournamentRun({...run,opponents},roster),null);
 assert.equal(validateTournamentRun({...run,routeVersion:99},roster),null);
 const noRoute={...run};delete noRoute.routeVersion;assert.equal(validateTournamentRun(noRoute,roster),null);
});
test('a literal pre-expansion save resumes its original rivals and launch settings',()=>{
 const legacy={version:1,runId:'legacy18',seed:12,fighterId:'9-bit',opponents:['dr3wbaby','papa-oak','dj-floppydisc','cliff','doofnoobler','ash-flowers','wittyf0x','mr-nice-guy'],node:0,attempt:0,status:'ready',resultId:null,settings:{muted:false,reducedMotion:false,controllerSeats:[null,null],matchRules:{rounds:3,time:60,difficulty:'hard',musicStyle:'fighter'}}};
 const locked=roster.map(f=>({...f,enabled:!['bnl-01','9-bit'].includes(f.id)}));
 const valid=validateTournamentRun(legacy,locked);assert.ok(valid);assert.deepEqual(valid.opponents,legacy.opponents);
 const store=storage();assert.equal(saveTournamentRun(store,valid,locked),true);const launched=launchTournamentMatch(loadTournamentRun(store,locked),'https://barcode.example/');
 assert.equal(launched.url.searchParams.get('p2'),'dr3wbaby');assert.equal(launched.url.searchParams.get('rounds'),'3');assert.equal(launched.url.searchParams.get('difficulty'),'hard');
});
