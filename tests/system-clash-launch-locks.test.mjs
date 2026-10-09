import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fightLaunchRoster} from '../public/games/system-clash/play/fight-launch.mjs';import {parseDemoLaunch,demoRoster} from '../public/games/system-clash/play/demo-flow.mjs';
import {createTournamentRun,launchTournamentMatch,saveTournamentRun,tournamentStage,readTournamentContext} from '../public/games/system-clash/play/tournament.mjs';
const roster=JSON.parse(fs.readFileSync(new URL('../public/games/system-clash/play/assets/fight-roster.json',import.meta.url))).fighters;
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
test('direct new local launches respect CORPORATE for both hidden fighters',()=>{
 for(const id of ['bnl-01','9-bit']){const url=`https://game.invalid/fight.html?demo=1&p1=${id}&p2=6-bit`;const local=fightLaunchRoster(url,roster,{});
 assert.equal(local.find(f=>f.id===id).enabled,false);assert.notEqual(parseDemoLaunch(url,local).p1,id);assert.equal(parseDemoLaunch(url,fightLaunchRoster(url,roster,{corporateUnlocked:true})).p1,id);}
});
test('valid online opponents use server catalog regardless of guest local preferences',()=>{assert.deepEqual(fightLaunchRoster('https://game.invalid/fight.html',roster,{online:true}),roster);});
test('a legitimate saved unlocked climb preserves its player and opponent after preference reset',()=>{
 const store=storage(),run=createTournamentRun(demoRoster(roster,{corporateUnlocked:true}),{fighterId:'9-bit',seed:12,runId:'owned-climb'}),launch=launchTournamentMatch(run,'https://game.invalid/index.html');
 assert(saveTournamentRun(store,launch.run,roster));assert.equal(parseDemoLaunch(launch.url,fightLaunchRoster(launch.url,roster,{storage:store})).p1,'9-bit');
 const forged=new URL(launch.url);forged.searchParams.set('match','invalid');assert.notEqual(parseDemoLaunch(forged,fightLaunchRoster(forged,roster,{storage:store})).p1,'9-bit');
});
test('new climbs snapshot seven rooms while earlier climbs keep their original six-room route',()=>{
 const run=createTournamentRun(roster,{fighterId:'6-bit',seed:5,runId:'new-seven'});assert.equal(run.availableStages.length,7);assert(run.availableStages.includes('interdimensional-station'));
 const old={...run};delete old.availableStages;assert.equal(tournamentStage(old),'witty-wasteland');assert.equal(tournamentStage({...old,node:1}),'radio-studio');
});
