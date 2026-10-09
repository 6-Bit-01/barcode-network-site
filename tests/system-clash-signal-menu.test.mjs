import test from 'node:test';
import assert from 'node:assert/strict';
import * as flow from '../public/games/system-clash/play/demo-flow.mjs';
import * as rules from '../public/games/system-clash/play/fight-rules.mjs';
import {createTournamentRun,validateTournamentRun} from '../public/games/system-clash/play/tournament.mjs';
const ids=['6-bit','cache-back','dj-floppydisc','mac-modem','cliff','mr-nice-guy','lost-marbles','ash-flowers','wittyf0x','lyra','papa-oak','ms-mayhem','stolz','kaveman-brown','dr3wbaby','doofnoobler','mutilator','bnl-01','9-bit'];
const catalog=ids.map(id=>({id,name:id}));
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
test('19-slot catalog keeps BNL and 9 Bit locked until CORPORATE, with 9 Bit last',()=>{
 const roster=flow.demoRoster(catalog);assert.equal(roster.length,19);assert.deepEqual(roster.map(f=>f.id),ids);assert.deepEqual(roster.filter(f=>!f.enabled).map(f=>f.id),['bnl-01','9-bit']);assert.equal(roster.filter(f=>f.enabled).length,17);
 const unlocked=flow.demoRoster(catalog,{corporateUnlocked:true});assert.ok(unlocked.every(f=>f.enabled));assert.equal(unlocked.at(-1).id,'9-bit');assert.ok(catalog.every(f=>f.enabled===undefined));
});
test('locked preview, random, CPU launch and tournament pool use the same enabled roster',()=>{
 let state=flow.beginDemoSelection(flow.createDemoSelection(catalog,{p1:'bnl-01',p2:'9-bit'}),'cpu');assert.deepEqual(state.picks,['6-bit','cache-back']);assert.equal(flow.previewDemoFighter(state,'bnl-01'),state);
 for(let i=0;i<80;i++){state=flow.randomDemoFighter(state,()=>i/80);assert.ok(!['bnl-01','9-bit'].includes(state.picks[0]));}
 const run=createTournamentRun(state.roster,{fighterId:state.picks[0],seed:1,runId:'locked-menu'});assert.ok(run.opponents.every(id=>!['bnl-01','9-bit'].includes(id)));
 state=flow.confirmDemoFighter(flow.confirmDemoFighter(state));assert.throws(()=>flow.demoFightURL({...state,picks:['bnl-01','6-bit']},'https://barcode.example/'));
 const parsed=flow.parseDemoLaunch('https://barcode.example/fight.html?demo=1&p1=bnl-01&p2=9-bit',flow.demoRoster(catalog));assert.deepEqual([parsed.p1,parsed.p2],['6-bit','cache-back']);
});
test('each keyboard/controller direction reaches all 19 unlocked slots',()=>{
 for(const key of ['ArrowRight','ArrowLeft','ArrowUp','ArrowDown']){let state=flow.beginDemoSelection(flow.createDemoSelection(catalog,{corporateUnlocked:true}),'local');const seen=new Set();for(let i=0;i<19;i++){seen.add(state.picks[0]);state=flow.navigateDemoFighter(state,key);}assert.equal(seen.size,19,key);}
});
test('CORPORATE unlock lives in the existing preference record and normal option saves preserve it',()=>{
 assert.equal(typeof rules.loadClashPreferences,'function');assert.equal(typeof rules.enterCorporateCode,'function');const saved=storage();saved.setItem('system-clash-match-rules-v1',JSON.stringify({rounds:3,time:60,difficulty:'hard',musicStyle:'fighter'}));assert.equal(rules.loadClashPreferences(saved).corporateUnlocked,false);
 const before=saved.getItem('system-clash-match-rules-v1');assert.equal(rules.enterCorporateCode(saved,'CORPORATION').accepted,false);assert.equal(saved.getItem('system-clash-match-rules-v1'),before);
 const result=rules.enterCorporateCode(saved,' corporate ');assert.equal(result.accepted,true);assert.equal(result.persisted,true);assert.equal(rules.loadClashPreferences(saved).corporateUnlocked,true);assert.equal(rules.loadClashPreferences(saved).musicStyle,'fighter');
 rules.saveMatchRules(saved,{rounds:5,time:0,difficulty:'easy'});assert.equal(rules.loadClashPreferences(saved).corporateUnlocked,true);assert.equal(rules.loadMatchRules(saved).rounds,5);
 assert.ok(!rules.withMatchRules('https://barcode.example/',rules.loadClashPreferences(saved)).searchParams.has('corporateUnlocked'));
 assert.equal(rules.enterCorporateCode({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},'CORPORATE').persisted,false);
});

test('tournament pool snapshot survives unlocking and validates legacy v1 runs without the field',()=>{
 const run=createTournamentRun(flow.demoRoster(catalog),{fighterId:'6-bit',seed:7,runId:'pool-snapshot'});
 assert.equal(run.availableFighters.length,17);const unlocked=flow.demoRoster(catalog,{corporateUnlocked:true});assert.deepEqual(validateTournamentRun(run,unlocked).opponents,run.opponents);
 assert.equal(validateTournamentRun({...run,availableFighters:[...run.availableFighters,'unregistered']},unlocked),null);
 const legacy=createTournamentRun(unlocked,{fighterId:'6-bit',seed:8,runId:'legacy-pool'});delete legacy.availableFighters;assert.ok(validateTournamentRun(legacy,unlocked));
});
test('portrait framing applies one uniform head occupation at mobile and desktop card sizes',async()=>{
 const {portraitViewport,PORTRAIT_HEAD_BOUNDS}=await import('../public/games/system-clash/play/menu-portraits.mjs');for(const bounds of Object.values(PORTRAIT_HEAD_BOUNDS))for(const [width,height]of [[42,40],[92,80],[110,100]]){const view=portraitViewport(bounds,width,height);assert.ok(Number.isFinite(view.scale)&&view.scale>0);assert.ok(Math.abs((bounds[3]-bounds[1])*view.scale/height-.62)<1e-8);assert.ok(Math.abs((bounds[0]+bounds[2])/2*view.scale+view.left-width/2)<1e-8);}
});

test('pre-expansion18-fighter tournament retains a legitimate9 Bit opponent after BNL registration',()=>{
 const old=catalog.filter(f=>f.id!=='bnl-01');const legacy=createTournamentRun(old,{fighterId:'9-bit',seed:12,runId:'legacy18'});delete legacy.availableFighters;
 const validated=validateTournamentRun(legacy,flow.demoRoster(catalog));assert.ok(validated);assert.deepEqual(validated.opponents,legacy.opponents);assert.equal(validated.fighterId,'9-bit');
 assert.equal(validateTournamentRun({...legacy,opponents:[...legacy.opponents].reverse()},flow.demoRoster(catalog)),null);
});
