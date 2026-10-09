import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMatchRules,matchRulesFromURL,withMatchRules,createRoundSet,recordRoundResult} from '../public/games/system-clash/play/fight-rules.mjs';
import {safeGameScreenURL,createGameScreenHost} from '../public/games/system-clash/play/game-screen-host.mjs';
test('match rules accept only supported choices and survive launch URL handoffs',()=>{
 assert.deepEqual(normalizeMatchRules({rounds:9,time:NaN,difficulty:'impossible',musicStyle:'stage'}),{rounds:1,time:99,difficulty:'normal',musicStyle:'stage'});
 const rules={rounds:5,time:0,difficulty:'hard',musicStyle:'stage'};assert.deepEqual(matchRulesFromURL(withMatchRules('https://game.test/games/system-clash/play/fight.html?p1=doofnoobler',rules)),rules);
 assert.deepEqual(matchRulesFromURL('https://game.test/?rounds=3&time=60&difficulty=easy'),{rounds:3,time:60,difficulty:'easy',musicStyle:'stage'});
});
test('best-of sets count each round exactly once, handle draws and finish only at required wins',()=>{
 let set=createRoundSet({rounds:3,time:60,difficulty:'hard',musicStyle:'stage'});set=recordRoundResult(set,{round:1,winner:1});assert.deepEqual(set.wins,[0,1]);assert.equal(set.complete,false);
 assert.equal(recordRoundResult(set,{round:1,winner:1}),set);set=recordRoundResult(set,{round:2,winner:null});assert.equal(set.complete,false);assert.deepEqual(set.wins,[0,1]);set=recordRoundResult(set,{round:3,winner:1});assert.equal(set.complete,true);assert.equal(set.winner,1);
});
test('persistent game host permits only same-origin game documents',()=>{
 const base='https://game.test/games/system-clash/play/index.html';assert.equal(safeGameScreenURL('fight.html?mode=cpu',base).pathname,'/games/system-clash/play/fight.html');
 for(const target of ['https://evil.test/fight.html','/admin','javascript:alert(1)','../secret.html'])assert.equal(safeGameScreenURL(target,base),null);
});
test('screen host changes the same iframe without document navigation or fullscreen exit and rejects unrelated senders',()=>{
 const listeners={},children=[],frame={style:{},setAttribute(){},addEventListener(type,fn){this[type]=fn;},contentWindow:{focus(){}},focus(){},remove(){}};
 const win={location:{href:'https://game.test/games/system-clash/play/index.html'},addEventListener:(type,fn)=>listeners[type]=fn,parent:null};win.parent=win;
 const doc={body:{appendChild(node){children.push(node);return node;},classList:{add(){}}},createElement:()=>frame};let suspended=0;
 const host=createGameScreenHost({window:win,document:doc,onSuspend:()=>suspended++});host.navigate('fight.html?demo=1');const first=frame.src;
 listeners.message({source:{},origin:'https://game.test',data:{type:'system-clash:navigate',url:'online.html'}});assert.equal(frame.src,first);
 listeners.message({source:frame.contentWindow,origin:'https://game.test',data:{type:'system-clash:navigate',url:'fight.html?match=2'}});assert.equal(children.length,1);assert.equal(suspended,1);assert.match(frame.src,/match=2/);assert.equal(host.active,true);
});

import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRoundMenu} from '../public/games/system-clash/play/fight-menus.mjs';
import {createMatch} from '../public/games/system-clash/play/fight-engine.mjs';
import {withControllerSeats} from '../public/games/system-clash/play/demo-flow.mjs';
import {createTournamentRun,launchTournamentMatch,saveTournamentRun,loadTournamentRun,leaveTournamentRun} from '../public/games/system-clash/play/tournament.mjs';
import {createTournamentFightOverlay} from '../public/games/system-clash/play/tournament-ui.mjs';
const fightSource=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
const tournamentRoster=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/menu/roster.json',import.meta.url))).fighters;
// Run the actual arena outcome/reset functions and actual dialog callbacks.
// Drawing/audio/storage are isolated at their browser boundaries only.
class SessionElement{
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.handlers={};this.dataset={};this.attributes={};this.style={setProperty(){}};this.className='';this.hidden=false;this.open=false;this.modalCount=0;this.classList={add:name=>{this.className+=' '+name;}};}
 append(...nodes){this.children.push(...nodes);}appendChild(node){this.append(node);return node;}replaceChildren(...nodes){this.children=nodes;}setAttribute(key,value){this.attributes[key]=value;}addEventListener(type,fn){this.handlers[type]=fn;}focus(){this.doc.activeElement=this;}click(){this.handlers.click?.({preventDefault(){}});}showModal(){this.open=true;this.modalCount++;}close(){this.open=false;}
 querySelectorAll(query){const found=[];const visit=node=>{for(const child of node.children){if(query==='button'&&child.tagName==='BUTTON'||query==='.tournament-actions button'&&child.tagName==='BUTTON'&&node.className==='tournament-actions'||query==='.tournament-message'&&child.className==='tournament-message')found.push(child);visit(child);}};visit(this);return found;}querySelector(query){return this.querySelectorAll(query)[0]??null;}
}
function sessionHarness(t,{rules={rounds:3,time:60,difficulty:'hard',musicStyle:'stage'},tournament=false}={}){
 const doc={activeElement:null,querySelector:()=>null,createElement(tag){return new SessionElement(tag,this);},createElementNS(_,tag){return new SessionElement(tag,this);}};doc.body=new SessionElement('body',doc);doc.head=new SessionElement('head',doc);const previousDocument=globalThis.document;globalThis.document=doc;t.after(()=>{globalThis.document=previousDocument;});
 const values=new Map(),storage={writes:0,getItem:key=>values.get(key)??null,setItem(key,value){this.writes++;values.set(key,value);},removeItem:key=>values.delete(key)},navigations=[],elements=new Map(),base='https://game.test/games/system-clash/play/index.html';
 const launch=tournament?launchTournamentMatch(createTournamentRun(tournamentRoster,{fighterId:'6-bit',seed:19,runId:'session-set',settings:{matchRules:rules}}),base):null;if(launch)assert(saveTournamentRun(storage,launch.run,tournamentRoster));
 const url=launch?.url??new URL('fight.html?demo=1&mode=cpu&p1=6-bit&p2=9-bit&stage=radio-studio',base);const element=id=>{if(!elements.has(id))elements.set(id,new SessionElement('div',doc));return elements.get(id);};element('mode-select').value='cpu';element('demo-select').href=new URL('index.html?screen=select&mode=cpu&p1=6-bit&p2=9-bit',base).href;element('motion-toggle').checked=false;
 const env={URL,document:doc,$:element,canvas:{focus(){}},ready:true,paused:false,onlineBridge:{enabled:false},onlineCombat:null,inspectTime:null,motionTime:null,roundNumber:1,matchRules:normalizeMatchRules(rules),roundSet:createRoundSet(rules),demoLaunch:{enabled:true,stage:'radio-studio'},launchParams:url.searchParams,location:{href:url.href},sessionStorage:storage,tournamentOverlay:null,muted:false,gamepads:{seatIndices:()=>[null,null]},screenHost:{navigate:value=>navigations.push(new URL(value))},motionPresentationEpoch:0,accumulator:0,weaponFeedback:'',weaponFeedbackUntil:0,previousTravelViews:null,previousTravelPhase:null,pauseDialog:{open:false},effects:{clear(){}},clearInput(){},syncAudioPause(){},dispatchEvents(){},draw(){},goTitle(){},withMatchRules,withControllerSeats,leaveTournamentRun,createRoundSet,recordRoundResult,createMatch,createRoundMenu:options=>createRoundMenu({...options,document:doc}),metadata:undefined,art:[{manifest:{id:'6-bit',character:'6 Bit',height:320}},{manifest:{id:'9-bit',character:'9 Bit',height:368}}]};env.match=createMatch({mode:'local',start:false});
 const resetStart=fightSource.indexOf('function reset('),resetEnd=fightSource.indexOf('\nfunction start()',resetStart),outcome=fightSource.split(/\r?\n/).find(line=>line.startsWith('function updateRoundOutcome()')),menu=fightSource.split(/\r?\n/).find(line=>line.startsWith('const roundMenu=')),select=fightSource.split(/\r?\n/).find(line=>line.startsWith("$('demo-select')?.addEventListener"));assert(resetStart>=0&&resetEnd>resetStart&&outcome&&menu&&select);runInNewContext(fightSource.slice(resetStart,resetEnd)+'\n'+outcome+'\n'+menu.replace('const roundMenu=','roundMenu=')+'\n'+select,env);
 let host=null;if(tournament){host=doc.body.appendChild(new SessionElement('section',doc));const createLine=fightSource.split(/\r?\n/).find(line=>line.includes('tournamentOverlay=createTournamentFightOverlay')),leave=createLine.match(/onLeave:(run=>\{.*\})\}\);if\(!tournamentOverlay/)?.[1];assert(leave,'The actual arena Tournament leave callback is available');runInNewContext('tournamentLeave='+leave,env);env.tournamentOverlay=createTournamentFightOverlay({url,roster:tournamentRoster,storage,host,getSettings:()=>({muted:env.muted,reducedMotion:false,controllerSeats:[null,null],matchRules:env.roundSet.rules}),onNavigate:value=>navigations.push(new URL(value)),onLeave:env.tournamentLeave});}
 const roundDialog=doc.body.children.find(node=>node.className.includes('round-result'));return {env,doc,storage,host,navigations,roundDialog,finish(winner){env.match.phase='over';env.match.winner=winner;env.updateRoundOutcome();},press(label){const owner=env.roundMenu.open?roundDialog:host,button=owner?.querySelectorAll('button').find(node=>node.textContent===label);assert(button,'Actual result action '+label+' exists');button.click();}};
}

test('actual arena counts duplicate results once and carries a drawn round into the same best-of set',t=>{
 const h=sessionHarness(t);h.finish(0);const one=h.env.roundSet;for(let i=0;i<8;i++)h.env.updateRoundOutcome();assert.equal(h.env.roundSet,one);assert.deepEqual(h.env.roundSet.wins,[1,0]);assert.equal(h.roundDialog.modalCount,1);
 h.press('NEXT ROUND');assert.equal(h.env.roundNumber,2);assert.equal(h.env.match.status,'ROUND 2');assert.equal(h.env.match.phase,'countdown');assert.deepEqual(h.env.roundSet.wins,[1,0]);assert.equal(h.env.match.roundRemaining,60000);h.finish(null);assert.deepEqual(h.env.roundSet.wins,[1,0]);assert.equal(h.env.roundSet.complete,false);assert.equal(h.env.roundSet.lastRound,2);assert.equal(h.roundDialog.children[0].textContent,'ROUND DRAW');
 h.press('NEXT ROUND');assert.equal(h.env.roundNumber,3);h.finish(0);assert.equal(h.env.roundSet.complete,true);assert.equal(h.env.roundSet.winner,0);assert.deepEqual(h.env.roundSet.wins,[2,0]);assert(h.roundDialog.querySelectorAll('button').some(node=>node.textContent==='PLAY AGAIN'));
});
test('actual completed-set replay clears prior wins and permits the same result dialog to open again',t=>{
 const h=sessionHarness(t,{rules:{rounds:1,time:0,difficulty:'easy',musicStyle:'stage'}});h.finish(1);assert.equal(h.env.roundSet.complete,true);h.press('PLAY AGAIN');assert.deepEqual(h.env.roundSet.wins,[0,0]);assert.equal(h.env.roundNumber,1);assert.equal(h.env.roundSet.lastRound,0);assert.equal(h.env.roundSet.complete,false);assert.equal(h.env.match.roundRemaining,0);assert.equal(h.env.match._difficulty,'easy');h.finish(1);assert.equal(h.roundDialog.modalCount,2);assert.equal(h.env.roundMenu.open,true);
});
test('actual loss character selection uses the arena navigation callback with current match options',t=>{
 const h=sessionHarness(t,{rules:{rounds:1,time:60,difficulty:'hard',musicStyle:'stage'}});h.finish(1);h.press('CHOOSE ANOTHER CHARACTER');assert.equal(h.navigations.length,1);const url=h.navigations[0];assert.equal(url.searchParams.get('screen'),'select');assert.equal(url.searchParams.get('mode'),'cpu');assert.deepEqual(matchRulesFromURL(url),{rounds:1,time:60,difficulty:'hard',musicStyle:'stage'});
});
test('actual arena sends only a completed best-of set to Tournament and Continue advances one node',t=>{
 const h=sessionHarness(t,{tournament:true});h.finish(0);assert.equal(loadTournamentRun(h.storage,tournamentRoster).status,'fighting');assert.equal(h.env.tournamentOverlay.blocking,false);assert.equal(h.storage.writes,1);h.press('NEXT ROUND');h.finish(null);assert.equal(loadTournamentRun(h.storage,tournamentRoster).status,'fighting');assert.equal(h.storage.writes,1);h.press('NEXT ROUND');h.finish(0);assert.equal(loadTournamentRun(h.storage,tournamentRoster).status,'won');assert.equal(loadTournamentRun(h.storage,tournamentRoster).node,0);assert.equal(h.storage.writes,2);for(let i=0;i<8;i++)h.env.updateRoundOutcome();assert.equal(h.storage.writes,2);h.press('CONTINUE →');const run=loadTournamentRun(h.storage,tournamentRoster);assert.equal(run.node,1);assert.equal(run.status,'fighting');assert.equal(h.navigations.length,1);assert.deepEqual(matchRulesFromURL(h.navigations[0]),{rounds:3,time:60,difficulty:'hard',musicStyle:'stage'});
});
test('actual Tournament set loss exposes character selection and returns to Tournament selection',t=>{
 const h=sessionHarness(t,{tournament:true});h.finish(1);h.press('NEXT ROUND');h.finish(1);assert.equal(loadTournamentRun(h.storage,tournamentRoster).status,'lost');h.press('CHOOSE ANOTHER CHARACTER');assert.equal(loadTournamentRun(h.storage,tournamentRoster),null);assert.equal(h.navigations.length,1);const url=h.navigations[0];assert.equal(url.searchParams.get('screen'),'select');assert.equal(url.searchParams.get('mode'),'tournament');assert.deepEqual(matchRulesFromURL(url),{rounds:3,time:60,difficulty:'hard',musicStyle:'stage'});
});

import {consumeTournamentResult,continueTournamentRun} from '../public/games/system-clash/play/tournament.mjs';
for(const status of ['won','lost','draw','complete'])test(`saved Tournament ${status} result reopens its blocking actions without replaying the decided set`,t=>{
 const h=sessionHarness(t,{tournament:true});let run=loadTournamentRun(h.storage,tournamentRoster),url=new URL(h.env.location.href);
 if(status==='complete')while(run.node<7){run=continueTournamentRun(consumeTournamentResult(run,{phase:'over',winner:0,resultId:run.resultId}));const launch=launchTournamentMatch(run,url);run=launch.run;url=launch.url;}
 run=consumeTournamentResult(run,{phase:'over',winner:status==='lost'?1:status==='draw'?null:0,resultId:run.resultId});assert.equal(run.status,status);assert(saveTournamentRun(h.storage,run,tournamentRoster));const writes=h.storage.writes,host=h.doc.body.appendChild(new SessionElement('section',h.doc)),navigations=[],leaves=[];
 const overlay=createTournamentFightOverlay({url,roster:tournamentRoster,storage:h.storage,host,onNavigate:value=>navigations.push(new URL(value)),onLeave:value=>leaves.push(value)});
 assert.equal(overlay.blocking,true,'The persisted result blocks normal play immediately, before any new match can reach over');assert.equal(host.hidden,false);assert.equal(h.storage.writes,writes,'Opening a saved result cannot consume or advance it again');overlay.update({phase:'over',winner:status==='lost'?0:1});assert.equal(h.storage.writes,writes,'A contradictory duplicate cannot replace the recorded result');assert.equal(loadTournamentRun(h.storage,tournamentRoster).status,status);
 const primary=host.querySelectorAll('.tournament-actions button')[0];assert.equal(primary.textContent,status==='won'?'CONTINUE →':status==='lost'?'RETRY NODE':status==='draw'?'REPLAY NODE':'RETURN TO TITLE');overlay.handleAction('confirm');
 if(status==='complete'){assert.equal(leaves.length,1);assert.equal(loadTournamentRun(h.storage,tournamentRoster),null);assert.equal(navigations.length,0);}else{const next=loadTournamentRun(h.storage,tournamentRoster);assert.equal(next.node,run.node+(status==='won'?1:0));assert.equal(next.status,'fighting');assert.notEqual(next.resultId,run.resultId);assert.equal(navigations.length,1);}
});
