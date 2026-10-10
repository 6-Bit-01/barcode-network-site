import {createOnlineRoundProgression} from '../public/games/system-clash/play/fight-online-rounds.mjs';
import {createRoundSet} from '../public/games/system-clash/play/fight-rules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {createMatch,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';
import {createOnlineCombatController,applyFightSnapshot,makeFightSnapshot} from '../public/games/system-clash/play/fight-network-state.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
import {previewBattleWear} from '../public/games/system-clash/play/fight-damage-preview.mjs';

const screenSource=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
function bindFunction(name,env){
 const found=screenSource.match(new RegExp('(async )?function '+name+'\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n\\}'));assert(found,'Real screen function '+name);
 return new Function('env','with(env){return '+(found[1]??'')+'function('+found[2]+'){'+found[3]+'}}')(env);
}
function art(id){
 const image={width:200,height:400,id},manifest={id,character:id,height:360,scale:.9},clips={};
 for(const clip of ['idle','walk','high','low','jump','knockdown','delete-shove','delete-pull','delete-brace','delete-suspended','delete-compressed','delete-crumpled','delete-present']){
  const frames=Object.fromEntries(['left','right'].map(facing=>[facing,[{rect:[0,0,200,400],anchor:[100,400],opaqueBounds:[20,20,180,400],attachments:{head:[100,60],torso:[100,200],legs:[100,350],grip:[facing==='right'?175:25,180]}}]]));
  clips[clip]=compileFightClip({file:'body.webp',frameMs:1100,order:[0],contactMs:300,frames},image,manifest,clip);
 }
 return {manifest,clips};
}
function canvas(){
 const images=[],stack=[],ctx=new Proxy({globalAlpha:1},{get(target,key){
  if(key in target)return target[key];
  if(key==='save')return ()=>stack.push(ctx.globalAlpha);
  if(key==='restore')return ()=>{ctx.globalAlpha=stack.pop();};
  if(key==='drawImage')return (...args)=>images.push({args,alpha:ctx.globalAlpha});
  if(String(key).startsWith('create')&&String(key).endsWith('Gradient'))return ()=>({addColorStop(){}});
  return ()=>{};
 }});
 return {images,getContext:()=>ctx,focus(){},setAttribute(){}};
}
function harness(){
 const source=[art('6-bit'),art('9-bit')],screen=canvas(),elements=new Map(),env={
  pauseDialog:{open:false,close(){}},roundMenu:{reset(){},close(){}},matchRules:{rounds:1,time:99,difficulty:'normal'},roundSet:createRoundSet(),roundNumber:1,createRoundSet,onlineRounds:null,createOnlineRoundProgression,loading(){},updateRoundOutcome(){},screenSuspended:false,
  art:source,metadata:combatMetadata(source),canvas:screen,renderer:createFightRenderer(screen),ready:true,paused:false,loadRevision:0,motionPresentationEpoch:0,
  inspectTime:null,motionTime:null,accumulator:0,previousTravelViews:null,previousTravelPhase:null,deletionReviewCache:null,
  deletionProp:null,weaponArt:null,fighterPortraits:{},stageArt:{id:"radio-studio"},tournamentOverlay:null,onlineCombat:null,onlineLoaded:false,
  weaponFeedback:'',weaponFeedbackUntil:0,arenaLabel:'',statusText:'',interfaceArtPending:null,time:0,
  launchParams:new URLSearchParams('matchId=1'),activeRoster:source.map(a=>({id:a.manifest.id,name:a.manifest.character})),demoLaunch:{enabled:false},
  performance:{now:()=>env.time},onlineBridge:{enabled:true,seat:1,send:()=>true},document:{hidden:false,querySelectorAll:()=>[]},
  effects:{camera:{x:0,y:0},clear(){},setPaused(){},startAudio:async()=>true,prepareCharacterAudio(){}},
  clearInput(){},syncPauseMenu(){},syncAudioPause(){},ensureStageArt:async()=>{},controls:()=>[{},{}],dispatchEvents(){},emitFightEvent(){},
  getFighterView,createMatch,combatMetadata,createOnlineCombatController,applyFightSnapshot,deletionDefinition,previewBattleWear,
  loadStageArt:async()=>({id:"radio-studio",image:{},kit:{},layers:{}}),loadInterfaceArt:async()=>({images:{}}),loadFightArt:async()=>source,loadArcadeArt:async()=>{},loadDeletionArt:async()=>null,loadWeaponArt:async()=>null,loadFighterPortraits:async()=>({}),
  showContextArtLinks(){},showFighterStyles(){},window:{},location:{href:'https://barcode.example/fight.html'},
 };
 env.$=id=>{if(!elements.has(id))elements.set(id,{value:id==='pose-preset'?'broadcast':id==='mode-select'?'local':id==='deletion-facing'?'right':'none',checked:false,hidden:true,selectedOptions:[{textContent:'Broadcast'}],options:[{textContent:''}],classList:{remove(){},add(){}},setAttribute(){},parentElement:{setAttribute(){}}});return elements.get(id);};
 env.match=createMatch({mode:'local',start:false,clips:env.metadata,fighters:source.map(a=>({id:a.manifest.id,height:a.manifest.height,name:a.manifest.character}))});
 for(const name of ['draw','reset','boot','applyOnlinePause','startOnlineFight','initializeOnlineCombat'])env[name]=bindFunction(name,env);
 env.initializeOnlineCombat();assert(env.onlineCombat.receive({type:'start',matchId:1,seed:42}));
 const hostMatch=env.match;
 const schema={roster:env.activeRoster,fighterIds:source.map(a=>a.manifest.id),clipIds:source.map(a=>Object.keys(a.clips)),matchId:1};let sequence=0;
 const echoes=()=>screen.images.filter(draw=>draw.args[0]===source[0].clips.jump.image&&draw.alpha>0&&draw.alpha<=.12);
 function packet(at,y){
  env.time=at;const match={...hostMatch,phase:'fight',paused:false,combatTime:at},views=match.fighters.map((_,i)=>getFighterView(match,i));
  Object.assign(views[0],{clip:'jump',elapsed:200,x:440,y,airborne:true,opacity:1});Object.assign(views[1],{clip:'idle',elapsed:0,x:950,y:0,airborne:false,opacity:1});
  const snapshot=makeFightSnapshot(match,views,{...schema,seq:++sequence,at});assert(snapshot,'Complete valid wire snapshot');
  assert(env.onlineCombat.receive({type:'snapshot',snapshot}));
  // The production RAF owns painting; snapshot delivery itself no longer draws.
  env.draw();return snapshot;
 }
 function falling(){packet(env.time,-200);packet(env.time+40,-160);env.time+=16;screen.images.length=0;env.draw();assert(echoes().length>0,'Actual intact native draw gains a fall echo');}
 return {env,screen,source,packet,echoes,falling,clear(){screen.images.length=0;}};
}

test('online guest packet replacement retains motion history during the same round',()=>{
 const h=harness();h.falling();const before=h.env.match;h.clear();h.packet(80,-120);
 assert.notEqual(h.env.match,before,'The real guest callback replaces the wire match object');
 assert(h.echoes().length>0,'Native fall echo survives the replacement packet');
});

test('pause, reduced motion and both review screens clear the actual rendered guest motion',()=>{
 for(const mode of ['pause','reduce','motion-review','deletion-review']){
  const h=harness();h.falling();h.clear();h.env.time+=16;
  if(mode==='pause')h.env.applyOnlinePause(true);
  if(mode==='reduce'){h.env.$('motion-toggle').checked=true;h.env.draw();}
  if(mode==='motion-review'){h.env.motionTime=0;h.env.$('motion-clip').value='jump';h.env.draw();}
  if(mode==='deletion-review'){h.env.inspectTime=0;h.env.$('pose-preset').value='brace';h.env.draw();}
  assert.equal(h.echoes().length,0,mode+' excludes stale fall echoes');
  h.env.paused=false;h.env.$('motion-toggle').checked=false;h.env.motionTime=null;h.env.inspectTime=null;h.clear();h.env.time+=16;h.env.draw();
  assert.equal(h.echoes().length,0,mode+' return begins a fresh observation');
 }
});

test('screen reset and fighter reload start a fresh native motion lifetime',async()=>{
 const h=harness();h.falling();const epoch=h.env.motionPresentationEpoch;h.env.reset(true,99);assert(h.env.motionPresentationEpoch>epoch);
 const next=h.env.motionPresentationEpoch;await h.env.boot();assert(h.env.motionPresentationEpoch>next);
 h.packet(100,-200);h.clear();h.env.time=116;h.env.draw();assert.equal(h.echoes().length,0,'New round/source begins with no previous fall path');
});
