import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MATCH_RULES,normalizeMatchRules,matchRulesFromURL,withMatchRules,loadMatchRules,saveMatchRules} from '../public/games/system-clash/play/fight-rules.mjs';
import * as online from '../public/games/system-clash/play/online.mjs';
const {onlineFightURL}=online;
import {createTournamentRun,launchTournamentMatch,saveTournamentRun,loadTournamentRun} from '../public/games/system-clash/play/tournament.mjs';
import {readFileSync} from 'node:fs';
const roster=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/menu/roster.json',import.meta.url),'utf8')).fighters;
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
test('legacy and malformed music preferences use level themes without changing combat settings',()=>{
 assert.equal(DEFAULT_MATCH_RULES.musicStyle,'stage');
 for(const musicStyle of [undefined,null,'','garbage'])assert.deepEqual(normalizeMatchRules({rounds:3,time:60,difficulty:'hard',musicStyle}),{rounds:3,time:60,difficulty:'hard',musicStyle:'stage'});
 const saved=storage();saved.setItem('system-clash-match-rules-v1',JSON.stringify({rounds:5,time:0,difficulty:'easy'}));assert.deepEqual(loadMatchRules(saved),{rounds:5,time:0,difficulty:'easy',musicStyle:'stage'});
 assert.equal(loadMatchRules({getItem(){throw Error('blocked');}}).musicStyle,'stage');
});
test('character themes persist and survive title, match and return URL handoffs',()=>{
 const saved=storage(),rules={rounds:3,time:60,difficulty:'hard',musicStyle:'fighter'};assert.equal(saveMatchRules(saved,rules),true);assert.deepEqual(loadMatchRules(saved),rules);
 for(const path of ['index.html?screen=select','fight.html?p1=6-bit&p2=9-bit','online.html']){
  const url=withMatchRules('https://game.test/games/system-clash/play/'+path,rules);assert.equal(url.searchParams.get('musicStyle'),'fighter');assert.deepEqual(matchRulesFromURL(url),rules);
 }
 assert.equal(matchRulesFromURL('https://game.test/index.html',rules).musicStyle,'fighter');
 assert.equal(matchRulesFromURL('https://game.test/index.html?musicStyle=stage',rules).musicStyle,'stage');
 assert.equal(matchRulesFromURL('https://game.test/index.html?musicStyle=bad',rules).musicStyle,'stage');
});
test('online launch carries the local music preference without changing shared combat rules',()=>{
 const state={host:{fighter:'6-bit'},guest:{fighter:'9-bit'}};
 for(const role of ['host','guest']){
  const url=onlineFightURL('https://game.test/games/system-clash/play/online.html',{role},state,{musicStyle:'fighter'});assert.equal(url.searchParams.get('musicStyle'),'fighter');assert.equal(url.searchParams.has('rounds'),false);assert.equal(url.searchParams.has('difficulty'),false);
 }
 assert.equal(onlineFightURL('https://game.test/online.html',{role:'host'},state).searchParams.get('musicStyle'),'stage');
});
test('saved tournament settings retain the selected music style across launches',()=>{
 const saved=storage(),run=createTournamentRun(roster,{fighterId:'6-bit',seed:39,settings:{matchRules:{musicStyle:'fighter'}}});
 const launch=launchTournamentMatch(run,'https://game.test/games/system-clash/play/index.html');assert.equal(launch.url.searchParams.get('musicStyle'),'fighter');assert.equal(saveTournamentRun(saved,launch.run,roster),true);assert.equal(loadTournamentRun(saved,roster).settings.matchRules.musicStyle,'fighter');
});

test('online menu return preserves local music, sound, motion and controller choices',()=>{
 assert.equal(typeof online.onlineMenuURL,'function');
 const url=online.onlineMenuURL('https://game.test/games/system-clash/play/online.html',{musicStyle:'fighter',muted:true,reducedMotion:true,controllerSeats:[3,null]});
 assert.equal(url.pathname,'/games/system-clash/play/index.html');assert.equal(url.searchParams.get('musicStyle'),'fighter');assert.equal(url.searchParams.get('sound'),'0');assert.equal(url.searchParams.get('motion'),'1');assert.equal(url.searchParams.get('pad1'),'3');
});

test('Tournament launch settings retain a changed live music preference alongside fixed combat rules',()=>{
 const source=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
 const getter=source.match(/getSettings:(\(\)=>\(\{[\s\S]*?\}\)),onNavigate/)?.[1];assert.ok(getter,'actual arena Tournament settings callback');
 const getSettings=new Function('muted','reducedMotion','$','gamepads','match','launchParams','roundSet','matchRules','return '+getter)(false,false,()=>({checked:false}),{seatIndices:()=>[null,null]},{stage:{id:'nature-simulation'}},new URLSearchParams(),{rules:{rounds:3,time:60,difficulty:'hard',musicStyle:'stage'}},{rounds:1,time:99,difficulty:'normal',musicStyle:'fighter'});
 assert.deepEqual(getSettings().matchRules,{rounds:3,time:60,difficulty:'hard',musicStyle:'fighter'});
});
