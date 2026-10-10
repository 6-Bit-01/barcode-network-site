import {fightLaunchRoster} from './fight-launch.mjs';
import {loadRemainsArt} from './fight-remains.mjs';
import {createGameMusic} from './game-music.mjs';
import {availableControllerItems,canControlMenu} from './fight-menu-controller.mjs';
import {createGameScreenHost} from './game-screen-host.mjs';
import {bindGameScreenControls,onlineSessionScore} from './game-screen-controls.mjs';
import {createMatchOptions,createRoundMenu} from './fight-menus.mjs';
import {createRoundSet,recordRoundResult,loadClashPreferences,loadMatchRules,saveMatchRules,matchRulesFromURL,withMatchRules} from './fight-rules.mjs';
import {nextMenuIndex,pauseMenuPolicy,bindTouchControls} from './fight-ui.mjs';
import {leaveTournamentRun} from './tournament.mjs';
import {createMatch,advanceMatch,performAction,getFighterView,consumeEvents,FIGHTER_STYLES} from './fight-engine.mjs';
import {createFightRenderer} from './fight-renderer.mjs';
import {createFightEffects} from './fight-effects.mjs';
import {loadInterfaceArt} from './interface-art.mjs';
import {loadFightArt,loadDeletionArt,loadArcadeArt,loadWeaponArt,loadStageArt,combatMetadata} from './fight-assets.mjs';
import {DELETION_POSES,BROADCAST_CUT,deletionDefinition} from './deletion-library.mjs';
import {previewBattleWear} from './fight-damage-preview.mjs';
import {createAttackInputBuffer,pressAttackInput,flushAttackInputs,releaseAttackInput,clearAttackInputs} from './fight-input.mjs';
import {createDeletionReview} from './fight-review.mjs';
import {interpolateFightViews} from './fight-presentation.mjs';
import {parseDemoLaunch,controllerSeatsFromURL,withControllerSeats} from './demo-flow.mjs';
import {createGamepadInput} from './fight-gamepad.mjs';
import {createOnlineFightBridge} from './fight-online-bridge.mjs';
import {createOnlineCombatController,applyFightSnapshot} from './fight-network-state.mjs';
import {createOnlineRoundProgression} from './fight-online-rounds.mjs';
import {createTournamentFightOverlay} from './tournament-ui.mjs';

const $ = id=>document.getElementById(id);
const canvas = $('fight-stage');
const pauseDialog=$('pause-menu');let touchBinding=null;
const renderer = createFightRenderer(canvas);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
$('motion-toggle').checked = motionPreference.matches;
let remainsArt=null,remainsArtPending=null;
const effects = createFightEffects({reducedMotion:motionPreference.matches,getRemainsArt:()=>remainsArt});
const held = new Set(), virtual = new Set(), latched = new Set();
const attackInputs=createAttackInputBuffer();
const gamepads=createGamepadInput({seats:controllerSeatsFromURL(location.href)});
let gamepadPlayers=[],windowActive=document.hasFocus();
let controllerLabel='';
let screenSuspended=false,roundNumber=1;
let matchRules=new URL(location.href).searchParams.get('online')==='1'?{rounds:1,time:99,difficulty:'normal',musicStyle:'stage'}:matchRulesFromURL(location.href,loadMatchRules(localStorage)),roundSet=createRoundSet(matchRules);
const screenHost=createGameScreenHost({onDisplayChange:()=>{screenControls.sync();syncPauseMenu();},onSuspend:()=>{screenSuspended=true;clearInput();effects.setPaused(true);music.suspend();}});
const screenControls=bindGameScreenControls(screenHost);
const matchOptions=createMatchOptions({rules:matchRules,locked:new URL(location.href).searchParams.has('online')||new URL(location.href).searchParams.has('tournament'),onApply:rules=>{matchRules=rules;saveMatchRules(localStorage,rules);},onClose:()=>{clearInput();syncPauseMenu();}});
const roundMenu=createRoundMenu({onNext:()=>{roundNumber++;reset(true,undefined,{newSet:false});canvas.focus({preventScroll:true});},onReplay:()=>{reset(true);canvas.focus({preventScroll:true});},onSelect:()=>$('demo-select').click(),onTitle:()=>goTitle()});
function loading(text,progress=0,failed=false){for(const node of document.querySelectorAll?.('header:not(.game-screen-bar),main,footer')??[])node.inert=true;$('asset-loading').hidden=false;$('asset-loading-text').textContent=text;$('asset-loading-progress').value=progress;$('asset-loading-retry').hidden=!failed;}
function updateRoundOutcome(){if(onlineBridge.enabled){if(onlineCombat?.seat===0&&onlineRounds){onlineRounds.observe(match);roundSet=onlineRounds.set;onlineRounds.apply(match);}return;}if(!demoLaunch.enabled||inspectTime!==null||motionTime!==null||match?.phase!=='over')return;const next=recordRoundResult(roundSet,{round:roundNumber,winner:match.winner});roundSet=next;if(tournamentOverlay?.active&&roundSet.complete)tournamentOverlay.update({...match,winner:roundSet.winner});else if(!tournamentOverlay?.blocking)roundMenu.show({set:roundSet,round:roundNumber,winner:match.winner,names:match.fighters.map(f=>f.name)});}
const attackButtons=new Set(['punch','low-punch','kick','low-kick']);
const watchedKeys = new Set(['KeyA','KeyD','KeyS','KeyW','KeyU','KeyI','KeyJ','KeyK','Space','KeyL','KeyF','ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Digit0','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Numpad0','Numpad1','Numpad2','Numpad3','Numpad4','Numpad5','Numpad6','Numpad7','Numpad8','Enter','KeyP','Escape','KeyR']);
let art,metadata,match,deletionProp,weaponArt,ready=false,paused=false,last=performance.now(),accumulator=0,muted=false,statusText='',arenaLabel='',loadRevision=0,inspectTime=null,motionTime=null;
let tapMove=0,tapUntil=0;
let weaponFeedback='',weaponFeedbackUntil=0;
let deletionReviewCache=null;
let activeRoster=[];
let demoLaunch={enabled:false};
let fighterPortraits={};
const portraitCache=new Map();
async function loadFighterPortraits(fighters){
  return Object.fromEntries(await Promise.all(fighters.map(async fighter=>{
    const id=fighter.manifest.id;
    if(!portraitCache.has(id))portraitCache.set(id,new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=new URL('assets/menu/'+id+'-portrait.webp',location.href).href;}));
    return [id,await portraitCache.get(id)];
  })));
}
let previousTravelViews=null,previousTravelPhase=null;
let onlineCombat=null,onlineRounds=null,tournamentOverlay=null,onlineLoaded=false;
const launchParams=new URL(location.href).searchParams;
const sessionScore=onlineSessionScore(launchParams);
if(sessionScore!==null){$('online-session-score').textContent=sessionScore;$('online-session-score').hidden=false;document.body.classList.add('has-online-session-score');}
const music=createGameMusic({muted:launchParams.get('sound')==='0'});
let musicMatchNumber=Math.max(0,(Number(launchParams.get('matchId'))||1)-1);
music.setPaused(true);music.setScene({screen:'arena',stage:launchParams.get('stage')??'radio-studio'});
const keyReleaseGate=new Set();
let stageArt=null,stageArtPending=null,stageArtRevision=0;
let interfaceArtPending=null,motionPresentationEpoch=0;
async function ensureStageArt(id){
 if(!id||stageArt?.id===id||stageArtPending===id)return;
 const revision=++stageArtRevision;stageArtPending=id;ready=false;clearInput();loading('Loading the next stage…',85);
 try{const selected=await loadStageArt({id,bundle:window.SYSTEM_CLASH_FIGHT_BUNDLE,baseURL:new URL('.',location.href)});if(revision!==stageArtRevision)return;stageArtPending=null;if(match?.stage?.id!==id)return;if(!window.SYSTEM_CLASH_FIGHT_BUNDLE&&(!selected.image||!selected.kit||!selected.layers))throw Error('Stage assets could not load. Retry loading.');stageArt=selected;ready=true;last=performance.now();accumulator=0;for(const node of document.querySelectorAll?.('header,main,footer')??[])node.inert=false;$('asset-loading').hidden=true;draw();}catch(error){if(revision===stageArtRevision){stageArtPending=null;loading(error.message,0,true);}}
}
const onlineBridge=createOnlineFightBridge({url:location.href,window,onPacket:packet=>onlineCombat?.receive(packet),onDisconnect:reason=>onlineCombat?.disconnect(reason)});
function applyOnlinePause(value,reason='manual'){paused=value;if(match)match.paused=value;clearInput();accumulator=0;syncAudioPause();$('pause-fight').textContent=value?(reason==='network'?'Reconnecting…':onlineBridge.seat===1?'Waiting for host':'Resume'):'Pause';$('pause-fight').disabled=value&&(reason==='network'||onlineBridge.seat===1);$('pause-fight').setAttribute('aria-pressed',String(value));draw();}
function updateOnlineRounds(delta){
 if(!onlineRounds||!onlineCombat?.started||onlineCombat.seat!==0||!match)return;
 onlineRounds.observe(match);
 const next=onlineRounds.tick(delta,{paused});
 if(next){if(!onlineCombat.startRound(next.round)){onlineCombat.disconnect('The next round could not start. Return to the tournament.');return;}roundNumber=next.round;reset(true,next.seed,{newSet:false});}
 roundSet=onlineRounds.set;onlineRounds.apply(match);
}
function startOnlineFight(packet) {
  matchRules={...matchRules,...(packet.rules??{rounds:1,time:99})};
  onlineRounds=createOnlineRoundProgression({rules:{rounds:matchRules.rounds,time:matchRules.time},seed:packet.seed});
  reset(true,packet.seed);void effects.startAudio();canvas.focus({preventScroll:true});
  if(onlineBridge.seat===1){onlineBridge.send({type:'started',matchId:packet.matchId});onlineCombat.input({move:0,crouch:false,block:false});}
}
function initializeOnlineCombat(){
 if(!onlineBridge.enabled||onlineCombat)return;
 onlineCombat=createOnlineCombatController({seat:onlineBridge.seat,matchId:Number(launchParams.get('matchId'))||1,roster:activeRoster,fighterIds:art.map(f=>f.manifest.id),clipIds:art.map(f=>Object.keys(f.clips)),send:packet=>onlineBridge.send(packet),now:()=>performance.now(),
  clipTimings:art.map(f=>Object.fromEntries(Object.entries(f.clips).map(([id,clip])=>[id,{duration:clip.timeline.duration,loop:clip.data.loop??['idle','walk'].includes(id),frames:clip.timeline.entries.map(({index,start,end})=>({index,start,end}))}]))),onStart:startOnlineFight,onPause:applyOnlinePause,
  onAction:command=>{if(!ready||paused)return;performAction(match,command.index,command.action,command.input);dispatchEvents();},
  onState:snapshot=>{const nextRound=snapshot.state.roundNumber??1;if(nextRound!==roundNumber){roundNumber=nextRound;clearInput();effects.clear();previousTravelViews=null;previousTravelPhase=null;}match=applyFightSnapshot(match,snapshot);paused=snapshot.state.paused;},onEvents:events=>{for(const event of events)emitFightEvent(event);},
  onDisconnect:reason=>{clearInput();paused=true;if(match)match.paused=true;effects.setPaused(true);$('load-status').textContent=reason;$('start-fight').disabled=true;$('restart-fight').disabled=true;}
 });
 for(const id of ['fighter-one','fighter-two','mode-select','inspect-deletion','inspect-motion','deletion-scrub','pose-preset','deletion-facing','motion-clip','motion-facing','motion-weapon','motion-embedded','motion-damage','motion-scrub'])$(id).disabled=true;
 $('demo-start').hidden=true;if(!onlineLoaded){onlineLoaded=true;onlineBridge.send({type:'loaded'});}
}
function emitFightEvent(event){effects.emit(event);if(['weapon-pickup','weapon-empty','weapon-embed'].includes(event.type)){const name=event.name??(event.weaponType==='pulse-driver'?'Pulse Driver':'Neural Spike');weaponFeedback=event.type==='weapon-pickup'?name+' equipped — High punch uses it':event.type==='weapon-empty'?'No charges left — throw the weapon':name+' embedded';weaponFeedbackUntil=performance.now()+1800;}}


function dispatchEvents() {
  if(onlineCombat?.seat===1)return;
  const events=consumeEvents(match).map(event=>renderer.resolveEvent(event,{match,views:match.fighters.map((_,index)=>getFighterView(match,index)),art,deletionProp}));
  for(const event of events)emitFightEvent(event);
  if(events.length)onlineCombat?.publishEvents(events);
}

function clearInput() {
  touchBinding?.clear();
  if(onlineBridge.enabled)for(const key of held)keyReleaseGate.add(key);
  held.clear();virtual.clear();latched.clear();clearAttackInputs(attackInputs);tapMove=0;tapUntil=0;
  gamepads.reset();gamepadPlayers=[];
  document.querySelectorAll('[data-hold]').forEach(button=>{button.classList.remove('is-held');if(['crouch','block'].includes(button.dataset.hold))button.setAttribute('aria-pressed','false');});
}

function showContextArtLinks() {
  const banks=window.SYSTEM_CLASH_FIGHT_BUNDLE?.arcade??Object.fromEntries(art.map(f=>[f.manifest.id,f.arcadeManifest]));
  const list=$('context-art-links');if(!list)return;list.replaceChildren();
  for(const [id,bank] of Object.entries(banks)) {
    const item=document.createElement('li'),title=document.createElement('strong');
    title.textContent=bank.character;item.append(title);
    const files=[...new Set(['crouch-punch','crouch-kick','jump-punch','jump-kick','pickup','crouch-high-kick','double-punch','power-kick'].map(name=>bank.clips[name].file))];
    const prompts=(bank.prompts??[]).filter(file=>/contextual|weapon-pickup|crouch-combos|power-kick/.test(file));
    for(const file of [...files,...prompts]) {
      const row=document.createElement('div'),link=document.createElement('a');
      link.href=new URL('assets/arcade/'+id+'/'+file,location.href).href;
      link.textContent=file;link.target='_blank';link.rel='noopener';row.append(link);item.append(row);
    }
    list.append(item);
  }
}

function showFighterStyles() {
  const list=$('fighter-styles');list.replaceChildren();
  for(const entry of activeRoster) {
    const style=FIGHTER_STYLES[entry.id],item=document.createElement('p'),title=document.createElement('strong'),body=document.createElement('span');
    title.textContent=entry.name+' · '+style.name;body.textContent=style.description+' '+style.signature;
    item.append(title,body);list.append(item);
  }
  const links=$('deletion-art-links');if(!links)return;links.replaceChildren();
  const banks=window.SYSTEM_CLASH_FIGHT_BUNDLE?.deletions??{
    ...Object.fromEntries(art.map(f=>[f.manifest.id,f.deletionManifest])),
    'broadcast-cut':deletionProp.manifest,'broadcast-front':deletionProp.front.manifest,
    ...Object.fromEntries(Object.entries(deletionProp.additional).map(([id,bank])=>[id,bank.manifest])),
  };
  for(const id of Object.keys(banks)) {
    const bank=banks[id];if(!bank)continue;
    const files=bank.clips?[...new Set(Object.values(bank.clips).map(clip=>clip.file))]:[bank.file];
    const prompts=bank.prompts??[bank.prompt,bank.repairPrompt].filter(Boolean);
    const item=document.createElement('li'),title=document.createElement('strong');title.textContent=bank.character??bank.id;item.append(title);
    for(const file of [...files,...(Array.isArray(prompts)?prompts:[prompts])]) {
      const row=document.createElement('div'),link=document.createElement('a');
      const folder=id==='broadcast-front'?'broadcast-cut':id;
      link.href=new URL('assets/deletions/'+folder+'/'+file,location.href).href;link.textContent=file;link.target='_blank';link.rel='noopener';row.append(link);item.append(row);
    }
    links.append(item);
  }
}

function inspectDeletionScene(time) {
  const key=loadRevision+':'+match.stage.id+':'+$('deletion-facing').value+':'+time+':'+$('motion-toggle').checked;
  if(deletionReviewCache?.key===key)return deletionReviewCache.match;
  deletionReviewCache={key,...createDeletionReview({time,metadata,art,deletionProp,renderer,stage:match.stage.id,direction:$('deletion-facing').value,reducedMotion:$('motion-toggle').checked})};
  return deletionReviewCache.match;
}

function syncAudioPause() {
  const quiet=!ready||!windowActive||screenSuspended||paused||inspectTime!==null||motionTime!==null||document.hidden;effects.setPaused(quiet);
  if(typeof music==='object'){music.setPaused(quiet);if(ready&&typeof match==='object'&&match)music.setScene({screen:typeof tournamentOverlay==='object'&&tournamentOverlay?.blocking?'tournament':match.phase==='ready'?'arena':'fight',fighter:typeof art==='object'?art?.[0]?.manifest?.id:match.fighters?.[0]?.id,stage:match.stage?.id??'radio-studio',musicStyle:matchRules.musicStyle,variant:typeof tournamentOverlay==='object'&&tournamentOverlay?.active?tournamentOverlay.node:typeof musicMatchNumber==='number'?musicMatchNumber:0});}
}

function draw() {
  syncPauseMenu();
  if (!ready || !art || !match) return;
  syncAudioPause();
  const definition=deletionDefinition(art[0].manifest.id);
  const preset=$('pose-preset').value,poseKey=inspectTime<(definition?.duration??6500)/2?1:2;
  const posePairs={brace:['shove','brace'],suspended:['pull','suspended'],compressed:['pull','compressed'],crumpled:['stomp','crumpled'],present:['present','crumpled']};
  const display=inspectTime===null?match:preset==='broadcast'?inspectDeletionScene(inspectTime):{...match,phase:'poses',winner:0,deletionElapsed:0,poseLabel:$('pose-preset').selectedOptions[0].textContent.toUpperCase(),poseKey,stagePickups:[],projectiles:[],fighters:match.fighters.map(f=>({...f,...previewBattleWear(f,'fresh'),weapon:null,_weaponAction:null,embeddedWeapons:[]}))};
  let views=onlineCombat?.seat===1?(onlineCombat.views()??display.fighters.map((_,index)=>getFighterView(display,index))):display.fighters.map((_,index)=>getFighterView(display,index));
  if(onlineCombat?.seat!==1&&inspectTime===null&&motionTime===null&&!paused&&previousTravelPhase===match.phase&&match.phase==='fight')
    views=interpolateFightViews(previousTravelViews,views,accumulator/(1000/60));
  let reviewPickups=[];
  if(inspectTime!==null){
    views.forEach((view,index)=>Object.assign(view,{...previewBattleWear(match.fighters[index],'fresh'),weapon:null,weaponAction:null,embeddedWeapons:[]}));
    if(preset!=='broadcast') {
      const right=$('deletion-facing').value==='right';
      for(let index=0;index<2;index++)Object.assign(views[index],{clip:'delete-'+posePairs[preset][index],elapsed:poseKey===1?0:10000,x:(index===0)===right?390:870,y:0,opacity:1,facing:(index===0)===right?'right':'left'});
    }
    $('deletion-time').textContent=preset==='broadcast'?(inspectTime/1000).toFixed(2)+'s':'Key '+poseKey;
  }
  if(motionTime!==null) {
    const clip=$('motion-clip').value,facing=$('motion-facing').value;
    const type=$('motion-weapon').value,embedded=$('motion-embedded').value;
    const pickupType=type;
    const selectedType=type;
    const equipment=selectedType==='none'||(clip==='pickup'&&motionTime<art[0].clips.pickup.data.contactMs)?null:{type:selectedType,name:selectedType==='neural-spike'?'Neural Spike':'Pulse Driver',charges:3};
    if(clip==='pickup'&&type!=='none'&&motionTime<art[0].clips.pickup.data.contactMs) {
      const origin=metadata[0].pickup.pickupOrigins[facing];
      reviewPickups=[{id:'review-pickup',type:pickupType,name:pickupType==='neural-spike'?'Neural Spike':'Pulse Driver',x:420+origin.x,y:620,gripY:620+origin.y,facing,angle:origin.angle}];
    }
    const attachments=embedded==='none'?[]:[{id:'review-embedded',type:embedded,site:'torso',heightRatio:.57,facing,direction:facing==='right'?-1:1,seed:1}];
    const jumpProgress=Math.min(1,motionTime/art[0].clips[clip].timeline.duration);
    const height=clip.startsWith('jump-')?-145:clip==='jump'?-185*4*jumpProgress*(1-jumpProgress):0;
    // A separate review scene freezes the match; it never changes fighter state.
    views.forEach((view,index)=>Object.assign(view,{...previewBattleWear(match.fighters[index],'fresh'),weapon:null,weaponAction:null,embeddedWeapons:[]}));
    Object.assign(views[0],previewBattleWear({...match.fighters[0],combatTime:match.combatTime},$('motion-damage').value),{clip,elapsed:motionTime,x:420,y:height,airborne:clip==='jump'||clip.startsWith('jump-'),facing,opacity:1,weapon:equipment,embeddedWeapons:attachments});
    Object.assign(views[1],{clip:'idle',elapsed:0,x:940,y:0,facing:'left',opacity:1});
    $('motion-time').textContent=(motionTime/1000).toFixed(2)+'s';
  }
  const reviewEntry=motionTime===null?null:art[0].clips[$('motion-clip').value].timeline.entries.find(entry=>motionTime>=entry.start&&motionTime<entry.end);
  const scene=motionTime===null?display:{...match,phase:'poses',motionReview:true,poseKey:(reviewEntry?.index??0)+1,poseLabel:$('motion-clip').selectedOptions[0].textContent.toUpperCase()+' / '+$('motion-facing').value.toUpperCase(),fighters:match.fighters.map((f,index)=>({...f,...previewBattleWear(f,index===0?$('motion-damage').value:'fresh'),weapon:views[index].weapon,embeddedWeapons:views[index].embeddedWeapons})),stagePickups:reviewPickups,projectiles:[]};
  const sceneEffects=motionTime!==null?null:inspectTime===null?effects:preset==='broadcast'?deletionReviewCache.effects:null;
  scene.cameraFocusIndex=onlineBridge.enabled?onlineBridge.seat:0;
  if(stageArt?.id!==scene.stage?.id){void ensureStageArt(scene.stage?.id);return;}
  renderer.draw({match:scene,stageArt,motionReview:motionTime!==null,deletionReview:inspectTime!==null,presentationTimeMs:performance.now(),motionResetKey:motionPresentationEpoch,views,art,effects:sceneEffects,deletionProp,weaponArt,portraits:fighterPortraits,paused:paused&&inspectTime===null&&motionTime===null,reducedMotion:$('motion-toggle').checked});
  for(let index=0;index<2;index++) {
    const f=scene.fighters[index],weapon=f.weapon;
    const condition=['Fresh','Bloodied','Battered','Ravaged'][f.damageTier ?? 0];
    $('gear-'+index).textContent=f.name+' · '+(weapon?weapon.name+' / '+weapon.charges+' uses':'Unarmed')+' · '+condition+(f.embeddedWeapons?.length?' / '+f.embeddedWeapons.length+' embedded':'');
  }
  const pickup=match.stagePickups?.[0];
  const stageLabel=inspectTime!==null?'Deletion preview':match.phase==='fight'?(pickup?pickup.name+' available — Throw nearby to equip':'Next pickup in '+Math.max(0,Math.ceil(((match.nextPickupAt ?? 8000)-match.combatTime)/1000))+'s'):match.phase==='deletion'?'Deletion in progress':match.phase==='finish'?'Finish the fight':match.phase==='over'?'Round ended':pickup?pickup.name+' on the stage':'Pickups arrive during the fight';
  $('stage-gear').textContent=motionTime!==null?'Move preview — match frozen':stageLabel;
  const own=onlineBridge.enabled?onlineBridge.seat:0,ownFighter=match.fighters[own];
  const equipped=!!ownFighter.weapon;
  $('hurl-weapon').disabled=!equipped||match.phase!=='fight'||paused||inspectTime!==null||motionTime!==null||!['idle','walk','crouch','block'].includes(ownFighter.action);
  const air=!!views[own].airborne,duck=controls()[0].crouch;
  document.querySelectorAll('[data-action="double-punch"],[data-action="power-kick"]').forEach(button=>button.disabled=air||duck||match.phase!=='fight'||paused||inspectTime!==null||motionTime!==null);
  $('use-weapon-label').textContent=air?'Jump punch':duck?'Uppercut':equipped?(ownFighter.weapon.charges>0?'Use weapon':'Empty weapon'):'High punch';
  $('high-kick-label').textContent=air?'Jump kick':duck?'Rising knee / boot':'High kick';
  $('low-punch-label').textContent=air?'Jump punch':duck?'Crouch jab':'Low punch';
  $('low-kick-label').textContent=air?'Jump kick':duck?'Low sweep':'Low kick';
  for(const id of ['use-weapon-label','high-kick-label','low-punch-label','low-kick-label'])$(id).parentElement.setAttribute('aria-label',$(id).textContent);
  const reviewLabel=preset==='broadcast'?'Inspecting '+definition.name+' at '+(inspectTime/1000).toFixed(2)+' seconds':'Shared pose review: '+display.poseLabel+', key '+poseKey;
  const moveLabel=view=>view.clip.startsWith('delete-')?'Deletion pose':view.clip.replaceAll('-',' ');
  const motionLabel=motionTime!==null?'Move review: '+scene.poseLabel+' at '+(motionTime/1000).toFixed(2)+' seconds, hand: '+$('motion-weapon').selectedOptions[0].textContent+', chest: '+$('motion-embedded').selectedOptions[0].textContent+', wear: '+$('motion-damage').selectedOptions[0].textContent:null;
  const label=`${scene.fighters[0].name}: ${scene.fighters[0].hp} health, ${moveLabel(views[0])}, ${$('gear-0').textContent}. ${scene.fighters[1].name}: ${scene.fighters[1].hp} health, ${moveLabel(views[1])}, ${$('gear-1').textContent}. ${motionLabel??stageLabel}. ${inspectTime!==null?reviewLabel:paused?'Paused':match.status || match.phase}.`;
  if (label !== arenaLabel) {canvas.setAttribute('aria-label',label);arenaLabel=label;}
  const state = motionLabel??(inspectTime!==null?reviewLabel:paused ? onlineBridge.enabled?(onlineCombat?.pauseReason==='network'?'Connection interrupted — release controls while the match reconnects.':onlineBridge.seat===0?'Paused — release controls; host Options / P resumes.':'Paused — the host can resume after controls are released.'):'Paused — Options / × or P to resume; ○ returns to character select.' : match.phase==='fight'&&performance.now()<weaponFeedbackUntil?weaponFeedback:match.status || 'Fight');
  if (state !== statusText) {$('fight-status').textContent=state;statusText=state;}
  if(onlineBridge.enabled){$('start-fight').disabled=match.phase!=='over'||!onlineCombat?.started||match.setComplete!==true;$('restart-fight').disabled=$('start-fight').disabled;$('pause-fight').disabled=!onlineCombat?.started||match.phase==='ready'||(paused&&(onlineCombat?.pauseReason==='network'||onlineBridge.seat===1));}
  updateRoundOutcome();if(tournamentOverlay?.active){$('restart-fight').disabled=match.phase!=='ready';$('start-fight').disabled=tournamentOverlay.blocking;}
}

function reset(start=true,seed,{newSet=true}={}) {
  if (!ready||(onlineBridge.enabled&&onlineCombat?.started&&seed===undefined)) return;
  motionPresentationEpoch++;
  if(typeof musicMatchNumber==='number'&&newSet&&start&&match?.phase==='over')musicMatchNumber++;
  if(newSet){roundSet=createRoundSet(matchRules);roundNumber=1;roundMenu.reset();}else roundMenu.close();
  if(pauseDialog.open)pauseDialog.close();
  clearInput();effects.clear();paused=false;accumulator=0;inspectTime=null;motionTime=null;weaponFeedback='';weaponFeedbackUntil=0;
  previousTravelViews=null;previousTravelPhase=null;
  syncAudioPause();
  $('deletion-review').hidden=true;$('motion-review').hidden=true;
  match=createMatch({roundNumber,roundTimeMs:roundSet.rules.time*1000,difficulty:roundSet.rules.difficulty,mode:onlineBridge.enabled?'local':$('mode-select').value,stage:match?.stage?.id??launchParams.get('stage')??'radio-studio',seed,clips:metadata,fighters:art.map(f=>({id:f.manifest.id,name:f.manifest.character,height:f.manifest.height})),start});
  $('pause-fight').textContent='Pause';$('pause-fight').setAttribute('aria-pressed','false');
  $('start-fight').textContent=match.phase === 'ready' ? 'Start fight' : 'Fight again';
  $('frame-link').hidden=true;
  if($('demo-start'))$('demo-start').hidden=!demoLaunch.enabled||start;
  if(onlineBridge.enabled&&onlineRounds)onlineRounds.apply(match);
  dispatchEvents();
  draw();
}

function start() {
  if (!ready) return;
  const net=typeof onlineCombat==='object'?onlineCombat:null,tournament=typeof tournamentOverlay==='object'?tournamentOverlay:null;
  if(net){if(match.setComplete===true)net.requestRematch(match.phase);return;}
  if(tournament?.active){if(tournament.blocking){tournament.handleAction('confirm');return;}if(match.phase!=='ready')return;}
  void effects.startAudio();if(typeof music==='object')void music.unlock();reset(true);canvas.focus({preventScroll:true});
}

function togglePause() {
  if (!ready || roundMenu.open || matchOptions.open || inspectTime!==null || motionTime!==null || match.phase === 'ready'||tournamentOverlay?.blocking) return;
  if(onlineCombat){if(!onlineCombat.requestPause(!paused))$('load-status').textContent=onlineCombat.seat===1?'The host resumes this match.':'Release controls and wait for the other player before resuming.';return;}
  paused=!paused;clearInput();accumulator=0;syncAudioPause();$('pause-fight').textContent=paused?'Resume':'Pause';$('pause-fight').setAttribute('aria-pressed',String(paused));draw();
}

function action(index,name,inputSnapshot=controls()[index]) {
  if (!ready || paused || inspectTime!==null || motionTime!==null || tournamentOverlay?.blocking || (onlineBridge.enabled&&index!==0) || (index === 1 && match.mode !== 'local')) return;
  if(onlineCombat){onlineCombat.action(name,inputSnapshot);return;}
  if(onlineBridge.enabled)return;
  performAction(match,index,name,inputSnapshot);dispatchEvents();draw();
}

function attackCommands(commands) {
  if(!commands.length||!ready||paused||inspectTime!==null||motionTime!==null||tournamentOverlay?.blocking)return;
  for(const command of commands){if(onlineBridge.enabled){if(command.index===0)onlineCombat?.action(command.action,command.inputSnapshot);continue;}if(command.index===1&&match.mode!=='local')continue;performAction(match,command.index,command.action,command.inputSnapshot);}
  if(!onlineBridge.enabled){dispatchEvents();draw();}
}

function queueAttack(index,name,key,repeat=false) {
  if(!ready||paused||inspectTime!==null||motionTime!==null||tournamentOverlay?.blocking||(onlineBridge.enabled&&index!==0))return;
  attackCommands(pressAttackInput(attackInputs,{index,action:name,key,time:performance.now(),repeat,
    inputSnapshot:{...controls()[index],airborne:onlineCombat?.seat===1?!!onlineCombat.views()?.[1]?.airborne:!!match.fighters[index]._jump}}));
}

function controls() {
  const down=key=>held.has(key);
  const network=typeof onlineBridge==='object'&&onlineBridge.enabled;
  return [
    {move:Number(down('KeyD')||virtual.has('right')||(tapMove===1&&performance.now()<tapUntil))-Number(down('KeyA')||virtual.has('left')||(tapMove===-1&&performance.now()<tapUntil)),crouch:down('KeyS')||virtual.has('crouch')||latched.has('crouch'),block:down('Space')||virtual.has('block')||latched.has('block')},
    {move:Number(down('ArrowRight'))-Number(down('ArrowLeft')),crouch:down('ArrowDown'),block:down('Digit0')||down('Numpad0')},
  ].map((input,index)=>index===1&&(network||match?.mode!=='local')?{move:0,crouch:false,block:false}:{move:Math.sign(input.move+(gamepadPlayers[index]?.move??0)),crouch:input.crouch||!!gamepadPlayers[index]?.crouch,block:input.block||!!gamepadPlayers[index]?.block});
}

const keyActions = {KeyU:[0,'punch'],KeyI:[0,'kick'],KeyJ:[0,'low-punch'],KeyK:[0,'low-kick'],KeyW:[0,'jump'],KeyL:[0,'grab'],KeyF:[0,'deletion'],ArrowUp:[1,'jump'],Digit7:[1,'punch'],Numpad7:[1,'punch'],Digit8:[1,'kick'],Numpad8:[1,'kick'],Digit4:[1,'low-punch'],Numpad4:[1,'low-punch'],Digit5:[1,'low-kick'],Numpad5:[1,'low-kick'],Digit6:[1,'grab'],Numpad6:[1,'grab'],Digit1:[1,'punch'],Numpad1:[1,'punch'],Digit2:[1,'kick'],Numpad2:[1,'kick'],Digit3:[1,'grab'],Numpad3:[1,'grab'],Enter:[1,'deletion']};
window.addEventListener('keydown',event=>{
  if(matchOptions.open||roundMenu.open){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','KeyP'].includes(event.code)){event.preventDefault();if(!event.repeat)(matchOptions.open?matchOptions:roundMenu).handleAction(event.code==='Enter'?'confirm':['Escape','KeyP'].includes(event.code)?'back':event.code);}return;}
  if(pauseDialog.open){if(handlePauseKey(event))return;}
  if (event.target.closest?.('input,select,textarea') || !watchedKeys.has(event.code)) return;
  // Space and Enter keep their normal behavior on buttons; the arena owns fighting keys.
  if (['Enter','Space'].includes(event.code) && event.target.closest?.('button,a')) return;
  event.preventDefault();
  if(tournamentOverlay?.blocking){if(!event.repeat)tournamentOverlay.handleAction(event.code==='Enter'?'confirm':event.code==='Escape'?'back':event.code);return;}
  if(onlineBridge.enabled&&(keyReleaseGate.has(event.code)||event.repeat||keyActions[event.code]?.[0]===1))return;
  held.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
  else if (event.code === 'KeyR') start();
  else if (keyActions[event.code]) {
    const [index,name]=keyActions[event.code];
    if(attackButtons.has(name))queueAttack(index,name,event.code,event.repeat);
    else action(index,name);
  }
});
window.addEventListener('keyup',event=>{keyReleaseGate.delete(event.code);held.delete(event.code);releaseAttackInput(attackInputs,event.code);});
window.addEventListener('blur',()=>{windowActive=false;clearInput();if(ready&&!paused&&!['ready','over'].includes(match.phase))togglePause();syncAudioPause();});
window.addEventListener('focus',()=>{windowActive=true;clearInput();syncAudioPause();});
document.addEventListener('visibilitychange',()=>{
  clearInput();last=performance.now();accumulator=0;
  if (document.hidden && ready && !paused && !['ready','over'].includes(match.phase)) togglePause();
  syncAudioPause();
});

touchBinding=bindTouchControls(document.querySelector('.touch-controls'),{active:()=>ready&&!paused&&inspectTime===null&&motionTime===null,onHold:(kind,down)=>down?virtual.add(kind):virtual.delete(kind),onAction:(name,key,down)=>{if(attackButtons.has(name)){if(down)queueAttack(0,name,key);else releaseAttackInput(attackInputs,key);}else if(down)action(0,name);},onTap:(kind,button)=>{if(['crouch','block'].includes(kind)){if(latched.has(kind))latched.delete(kind);else latched.add(kind);button.setAttribute('aria-pressed',String(latched.has(kind)));}else {tapMove=kind==='right'?1:-1;tapUntil=performance.now()+180;}}});
$('start-fight').addEventListener('click',start);
$('restart-fight').addEventListener('click',start);
$('pause-fight').addEventListener('click',togglePause);
$('mode-select').addEventListener('change',()=>{if(!onlineBridge.enabled&&!tournamentOverlay?.active)reset(false);});
$('mute-fight').addEventListener('click',()=>{
  muted=!muted;effects.setMuted(muted);music.setMuted(muted);if(!muted){void effects.startAudio();void music.unlock();}
  $('mute-fight').textContent=muted?'Sound off':'Sound on';$('mute-fight').setAttribute('aria-pressed',String(muted));
});
$('motion-toggle').addEventListener('change',()=>effects.setReducedMotion($('motion-toggle').checked));

$('save-fight-frame').addEventListener('click',async()=>{
  if (!ready) return;
  draw();
  const data=canvas.toDataURL('image/png');
  const button=$('save-fight-frame');button.disabled=true;
  try {
      const link=document.createElement('a');link.href=data;link.download='SYSTEM-CLASH-fight-'+match.phase+'.png';link.click();
      $('fight-status').textContent='Fight frame saved.';
  } catch (error) {
    $('fight-status').textContent=error.message;
  } finally {button.disabled=false;}
});

function pollGamepads(now) {
  let pads=[];try{pads=navigator.getGamepads?.()??[];}catch{}
  const network=typeof onlineBridge==='object'&&onlineBridge.enabled,tournament=typeof tournamentOverlay==='object'?tournamentOverlay:null;
  const menu=matchOptions.open||roundMenu.open||paused||!ready||tournament?.blocking||['ready','over'].includes(match?.phase);
  const sample=gamepads.sample(pads,now,{context:menu?'menu':'fight',active:windowActive&&!screenSuspended&&!document.hidden&&ready&&inspectTime===null&&motionTime===null});
  gamepadPlayers=sample.players;
  const connected=sample.players.filter(player=>player.connected);
  const label=sample.unsupported?'Controller mapping unavailable — use keyboard or a standard-mapped controller.':connected.length?sample.players.map((player,index)=>index===1&&match?.mode!=='local'?'P2: CPU':'P'+(index+1)+': '+(player.connected?'controller '+(player.index+1):'keyboard')).join(' · ')+(menu?' · × '+(paused?'resume':'start / rematch')+' · ○ select':' · Options pause'):'Press a controller button to connect · Keyboard / touch available';
  if(label!==controllerLabel){controllerLabel=label;if($('controller-status'))$('controller-status').textContent=label;}
  // Disconnect wins over every queued press in this snapshot.
  if(sample.events.some(event=>event.type==='disconnect'&&(event.player===0||(!network&&match?.mode==='local')))){
    clearInput();if(ready&&!paused&&!['ready','over'].includes(match.phase))togglePause();return;
  }
  for(const event of sample.events){
    if(event.type==='press'&&typeof music==='object')void music.unlock();
    if((matchOptions.open||roundMenu.open)&&canControlMenu(event.player,sample.players,{screen:'title',mode:'cpu'})&&['navigate','press'].includes(event.type)){(matchOptions.open?matchOptions:roundMenu).handleAction(event.action);return;}
    if(event.type==='release'){releaseAttackInput(attackInputs,event.key);continue;}
    if(tournament?.blocking&&event.player===0&&(event.type==='navigate'||event.type==='press')){tournament.handleAction(event.action);return;}
    if(paused&&(event.type==='navigate'||event.type==='press')&&(event.player===0||(!network&&match?.mode==='local'))){handlePauseAction(event.action);continue;}
    if(event.type!=='press'||(event.player===1&&(network||match?.mode!=='local')))continue;
    if(event.action==='pause'){togglePause();return;}
    if(menu){
      if(event.action==='back'){
        if(document.body.classList.contains('show-controls')){$('demo-controls')?.click();return;}
        clearInput();$('demo-select')?.click();return;
      }
      if(event.action==='confirm'){if(paused)togglePause();else start();return;}
      continue;
    }
    if(event.action==='deletion')attackInputs.pending.delete(event.player);
    if(attackButtons.has(event.action))queueAttack(event.player,event.action,event.key);
    else action(event.player,event.action,event.inputSnapshot?{...controls()[event.player],...event.inputSnapshot}:controls()[event.player]);
  }
}

function tick(now) {
  if(screenSuspended){requestAnimationFrame(tick);return;}
  pollGamepads(now);
  const delta=Math.min(100,Math.max(0,now-last));last=now;
  const net=typeof onlineCombat==='object'?onlineCombat:null,network=typeof onlineBridge==='object'&&onlineBridge.enabled;
  if(net){net.input(windowActive&&!document.hidden?controls()[0]:{move:0,crouch:false,block:false});net.tick();}
  const running=!network||net?.started;
  if(ready&&!paused&&inspectTime===null&&motionTime===null&&running){
    attackCommands(flushAttackInputs(attackInputs,now));
    if(!net||net.seat===0){accumulator+=delta;while(accumulator>=1000/60){previousTravelViews=match.fighters.map((_,index)=>getFighterView(match,index));previousTravelPhase=match.phase;const inputs=net?[controls()[0],net.remoteInput]:controls();advanceMatch(match,1000/60,inputs);dispatchEvents();effects.update(1000/60);accumulator-=1000/60;}}
    else effects.update(delta);
  }
  if(net?.seat===0&&ready)updateOnlineRounds(delta);
  if(net?.seat===0&&ready)net.publish(match,match.fighters.map((_,index)=>getFighterView(match,index)));
  draw();requestAnimationFrame(tick);
}

async function boot() {
  const revision=++loadRevision;let failed=false;motionPresentationEpoch++;
  ready=false;paused=false;if(pauseDialog.open)pauseDialog.close();loading('Loading fighter animations…',5);clearInput();effects.clear();inspectTime=null;motionTime=null;roundMenu.reset();$('deletion-review').hidden=true;$('motion-review').hidden=true;$('load-status').classList.remove('error');
  for(const id of ['start-fight','restart-fight','pause-fight','inspect-deletion','inspect-motion','save-fight-frame'])$(id).disabled=true;
  try {
    const options={bundle:window.SYSTEM_CLASH_FIGHT_BUNDLE,baseURL:new URL('.',location.href)};
    interfaceArtPending??=loadInterfaceArt(options).catch(()=>({manifest:null,images:{},failures:['manifest']}));
    const nextArt=await loadFightArt({...options,ids:[$('fighter-one').value,$('fighter-two').value],onProgress:(count,total)=>{if(!failed&&revision===loadRevision){$('load-status').textContent=`Loading fighters · ${count} / ${total} actions`;loading($('load-status').textContent,5+count/total*35);}}});
    if(revision!==loadRevision)return;
    $('load-status').textContent='Loading attack poses…';loading('Loading attack poses…',45);
    await loadArcadeArt({...options,art:nextArt});
    if(revision!==loadRevision)return;
    $('load-status').textContent='Loading Deletions…';loading('Loading Deletions…',60);
    const nextProp=await loadDeletionArt({...options,art:nextArt});
    if(revision!==loadRevision)return;
    if(!options.bundle||options.bundle.remains){remainsArtPending??=loadRemainsArt(options).catch(error=>{remainsArtPending=null;throw error;});remainsArt=await remainsArtPending;}
    nextProp.remains=remainsArt;
    if(revision!==loadRevision)return;
    $('load-status').textContent='Loading stage weapons…';loading('Loading stage weapons…',75);
    const nextWeaponArt=await loadWeaponArt(options);
    if(revision!==loadRevision)return;
    $('load-status').textContent='Loading fighter portraits…';loading('Loading fighter portraits…',80);
    const nextPortraits=await loadFighterPortraits(nextArt);
    if(revision!==loadRevision)return;
    loading('Loading the stage and interface…',90);
    const selectedStage=match?.stage?.id??launchParams.get('stage')??'radio-studio';
    const nextStageArt=await loadStageArt({...options,id:selectedStage});
    if(revision!==loadRevision)return;
    if(!options.bundle&&(!nextStageArt.image||!nextStageArt.kit||!nextStageArt.layers))throw Error('Stage assets could not load. Retry loading.');
    stageArt=nextStageArt;stageArtPending=null;
    const nextInterfaceArt=await interfaceArtPending;
    if(revision!==loadRevision)return;
    if(!options.bundle&&nextInterfaceArt.failures?.length){interfaceArtPending=null;throw Error('Interface artwork could not load. Retry loading.');}
    renderer.prepareInterface(nextInterfaceArt);
    art=nextArt;deletionProp=nextProp;weaponArt=nextWeaponArt;fighterPortraits=nextPortraits;
    void effects.prepareCharacterAudio?.(art.map(fighter=>fighter.manifest.id));
    renderer.prepareArt(art);metadata=combatMetadata(art,weaponArt);ready=true;
    showContextArtLinks();
    showFighterStyles();
    document.querySelectorAll('button').forEach(button=>button.disabled=false);
    $('load-status').textContent=art.map(f=>f.manifest.character).join(' / ')+' ready · distinct styles / combos / Deletions';
    $('arena-title').textContent=art[0].manifest.character+' vs. '+art[1].manifest.character;
    $('player-one-label').textContent='PLAYER ONE / '+(onlineBridge.enabled?(launchParams.get('name1')??'Host').slice(0,24)+' · ':'')+art[0].manifest.character.toUpperCase();
    $('player-two-label').textContent='PLAYER TWO / '+(onlineBridge.enabled?(launchParams.get('name2')??'Guest').slice(0,24)+' · ':'')+art[1].manifest.character.toUpperCase();
    const definition=deletionDefinition(art[onlineBridge.enabled?onlineBridge.seat:0].manifest.id);
    $('inspect-deletion').disabled=!definition;
    document.querySelectorAll('[data-action="deletion"]').forEach(button=>button.disabled=!definition);
    $('pose-preset').options[0].textContent=definition?definition.name+' sequence':'Signature Deletion pending';
    $('deletion-scrub').max=String((definition?.duration??6500)-1);
    reset(false);initializeOnlineCombat();$('asset-loading-progress').value=100;for(const node of document.querySelectorAll?.('header,main,footer')??[])node.inert=false;$('asset-loading').hidden=true;
  } catch (error) {
    failed=true;if(revision===loadRevision){ready=false;loading(error.message,0,true);$('load-status').textContent=error.message;$('load-status').classList.add('error');}
  }
}

$('fighter-one').addEventListener('change',()=>{if(!onlineBridge.enabled&&!tournamentOverlay?.active)boot();});
$('fighter-two').addEventListener('change',()=>{if(!onlineBridge.enabled&&!tournamentOverlay?.active)boot();});
$('inspect-deletion').addEventListener('click',()=>{
  if(onlineBridge.enabled||!ready||!deletionDefinition(art[0].manifest.id))return;
  clearInput();motionTime=null;$('motion-review').hidden=true;inspectTime=deletionDefinition(art[0].manifest.id).beats.pressure??3100;$('pose-preset').value='broadcast';$('deletion-review').hidden=false;$('deletion-scrub').value=String(inspectTime);draw();
});
$('deletion-scrub').max=String(BROADCAST_CUT.duration-1);
$('deletion-scrub').addEventListener('input',()=>{if(onlineBridge.enabled)return;inspectTime=Number($('deletion-scrub').value);draw();});
$('pose-preset').addEventListener('change',()=>{if(!onlineBridge.enabled)draw();});
$('return-fight').addEventListener('click',()=>{inspectTime=null;clearInput();$('deletion-review').hidden=true;draw();});
$('deletion-facing').addEventListener('change',draw);
function syncMotionClip() {
  if(!ready||motionTime===null)return;
  const duration=art[0].clips[$('motion-clip').value]?.timeline.duration??1;
  $('motion-scrub').max=String(Math.max(0,duration-1));
  motionTime=Math.min(motionTime,duration-1);$('motion-scrub').value=String(motionTime);draw();
}
$('inspect-motion').addEventListener('click',()=>{
  if(onlineBridge.enabled||!ready)return;
  clearInput();inspectTime=null;$('deletion-review').hidden=true;
  motionTime=0;$('motion-review').hidden=false;syncMotionClip();
});
$('motion-clip').addEventListener('change',()=>{if(onlineBridge.enabled)return;motionTime=0;if($('motion-clip').value==='pickup'&&$('motion-weapon').value==='none')$('motion-weapon').value='neural-spike';syncMotionClip();});
$('motion-scrub').addEventListener('input',()=>{if(onlineBridge.enabled)return;motionTime=Number($('motion-scrub').value);draw();});
for(const id of ['motion-facing','motion-weapon','motion-embedded','motion-damage'])$(id).addEventListener('change',draw);
$('return-motion').addEventListener('click',()=>{motionTime=null;clearInput();$('motion-review').hidden=true;draw();});
for(const [role,poses] of Object.entries(DELETION_POSES)) {
  for(const pose of poses) {
    const item=document.createElement('li');item.innerHTML='<strong>'+pose.name+'</strong><span>'+pose.uses+'</span>';$('shared-'+role+'-poses')?.append(item);
  }
}
async function initializeRoster() {
  try {
    let roster=window.SYSTEM_CLASH_FIGHT_BUNDLE?.roster;
    if(!roster){const response=await fetch(new URL('assets/fight-roster.json',location.href),{cache:'no-store'});if(!response.ok)throw new Error('The main roster is unavailable.');roster=(await response.json()).fighters.filter(fighter=>fighter.enabled);}
    if(!roster.length||new Set(roster.map(f=>f.id)).size!==roster.length||roster.some(f=>!FIGHTER_STYLES[f.id]))throw new Error('The main roster needs its verified fighting styles.');
    activeRoster=roster;
    const launchRoster=fightLaunchRoster(location.href,roster,{corporateUnlocked:loadClashPreferences(localStorage).corporateUnlocked,online:onlineBridge.enabled,storage:sessionStorage});
    demoLaunch=parseDemoLaunch(location.href,launchRoster);
    if(launchParams.get('tournament')==='1'&&!onlineBridge.enabled){tournamentOverlay=createTournamentFightOverlay({url:location.href,roster:activeRoster,storage:sessionStorage,onShow:scene=>music.setScene(scene),getSettings:()=>({muted,reducedMotion:$('motion-toggle').checked,controllerSeats:gamepads.seatIndices(),stage:match?.stage?.id??launchParams.get('stage'),matchRules:{...roundSet.rules,musicStyle:matchRules.musicStyle}}),onNavigate:url=>screenHost.navigate(url),onLeave:run=>{const back=new URL('index.html',location.href);if(run.returnScreen==='select'){back.searchParams.set('screen','select');back.searchParams.set('mode','tournament');}back.searchParams.set('stage',match?.stage?.id??demoLaunch.stage);back.searchParams.set('sound',muted?'0':'1');back.searchParams.set('motion',$('motion-toggle').checked?'1':'0');screenHost.navigate(withMatchRules(withControllerSeats(back,gamepads.seatIndices()),{...roundSet.rules,musicStyle:matchRules.musicStyle}));}});if(!tournamentOverlay.active)throw new Error('This Tournament run is unavailable. Return to the game menu.');}

    if(demoLaunch.enabled){
      document.body.classList.add('demo');document.title='BARCODE: SYSTEM CLASH — Demo';$('demo-toolbar').hidden=false;
      $('mode-select').value=demoLaunch.mode;muted=demoLaunch.muted;effects.setMuted(muted);if(typeof music==='object')music.setMuted(muted);
      $('mute-fight').textContent=muted?'Sound off':'Sound on';$('mute-fight').setAttribute('aria-pressed',String(muted));
      $('motion-toggle').checked=demoLaunch.reducedMotion;effects.setReducedMotion(demoLaunch.reducedMotion);
      const back=new URL('index.html',location.href);for(const [key,value]of Object.entries({screen:'select',mode:demoLaunch.mode,p1:demoLaunch.p1,p2:demoLaunch.p2,stage:demoLaunch.stage,sound:muted?'0':'1',motion:$('motion-toggle').checked?'1':'0'}))back.searchParams.set(key,value);$('demo-select').href=withMatchRules(withControllerSeats(back,gamepads.seatIndices()),{...roundSet.rules,musicStyle:matchRules.musicStyle}).href;
    }
    for(const id of ['fighter-one','fighter-two']) {
      const select=$(id),previous=select.value;select.replaceChildren();
      for(const fighter of launchRoster){const option=document.createElement('option');option.value=fighter.id;option.textContent=fighter.name;option.disabled=fighter.enabled===false;select.append(option);}
      const requested=demoLaunch.enabled?(id==='fighter-one'?demoLaunch.p1:demoLaunch.p2):previous;
      const available=launchRoster.filter(f=>f.enabled!==false);select.value=available.some(f=>f.id===requested)?requested:available[id==='fighter-two'?Math.min(1,available.length-1):0].id;
    }
    $('roster-label').textContent=roster.length+' PLAYABLE MAIN FIGHTERS / ARCADE PROTOTYPE';
    $('styles-title').textContent=roster.length+' ways to clash.';
    $('roster-footer').textContent=(demoLaunch.enabled?'DEMO':'PLAYABLE PROTOTYPE')+' · '+roster.length+' MAIN FIGHTERS';
    $('deletion-count').textContent=roster.filter(f=>deletionDefinition(f.id)).length+' SIGNATURE DELETIONS';
    const finishes=$('deletion-summary');finishes.replaceChildren();
    for(const fighter of roster){const definition=deletionDefinition(fighter.id),line=document.createElement('span');line.textContent=fighter.name+' · '+(definition?.name??'Signature Deletion pending');finishes.append(line,document.createElement('br'));}
    await boot();
  } catch(error){loading(error.message,0,true);$('load-status').textContent=error.message;$('load-status').classList.add('error');}
}
$('asset-loading-retry').addEventListener('click',()=>activeRoster.length?boot():initializeRoster());
$('demo-select')?.addEventListener('click',event=>{event.preventDefault();if(onlineBridge.enabled){event.preventDefault();clearInput();onlineBridge.send({type:'leave'});return;}if(tournamentOverlay?.active)leaveTournamentRun(sessionStorage);const back=new URL($('demo-select').href);back.searchParams.set('stage',match?.stage?.id??demoLaunch.stage);back.searchParams.set('sound',muted?'0':'1');back.searchParams.set('motion',$('motion-toggle').checked?'1':'0');$('demo-select').href=withControllerSeats(back,gamepads.seatIndices()).href;screenHost.navigate(withMatchRules(withControllerSeats(back,gamepads.seatIndices()),matchRules));});
$('demo-start')?.addEventListener('click',start);
$('demo-controls')?.addEventListener('click',()=>{if(!ready)return;$('pause-guide').hidden=false;$('pause-controls').setAttribute('aria-expanded','true');clearInput();if(!paused){if(match.phase==='ready')paused=true;else togglePause();}syncPauseMenu();$('pause-controls').focus({preventScroll:true});});
window.addEventListener('pagehide',()=>{clearInput();onlineCombat?.destroy();onlineBridge.destroy();tournamentOverlay?.destroy();effects.setPaused(true);music.suspend();});
window.addEventListener('pageshow',()=>{music.resume();syncAudioPause();});
initializeRoster();requestAnimationFrame(tick);

function pauseChoices(){return availableControllerItems([...pauseDialog.querySelectorAll('.pause-options button')],{scope:pauseDialog});}
function syncPauseMenu(){
 if(!pauseDialog||matchOptions.open)return;
 const full=screenHost.isFullscreen;$('pause-fullscreen').textContent=full?'Exit fullscreen':'Fullscreen';$('fullscreen-fight').textContent=full?'Exit fullscreen':'Fullscreen';
 $('demo-controls')?.setAttribute('aria-expanded',String(paused&&!$('pause-guide').hidden));
 if(!paused){if(pauseDialog.open){pauseDialog.close();$('pause-guide').hidden=true;$('pause-controls').setAttribute('aria-expanded','false');canvas.focus({preventScroll:true});}return;}
 const policy=pauseMenuPolicy({online:onlineBridge.enabled,seat:onlineBridge.seat,tournament:tournamentOverlay?.active,phase:match?.phase});
 $('pause-resume').disabled=!policy.resume;$('pause-resume').textContent=policy.resume?'Resume':'Waiting for host';$('pause-restart').disabled=!policy.restart;
 $('pause-sound').textContent=muted?'Sound off':'Sound on';$('pause-motion').textContent='Reduce motion: '+($('motion-toggle').checked?'on':'off');
 $('pause-note').textContent=onlineBridge.enabled?(policy.resume?'Release controls before resuming.':'The host resumes this match. You can review controls or leave.'):'Take a breath. The signal can wait.';
 if(!pauseDialog.open){pauseDialog.showModal();pauseChoices()[0]?.focus({preventScroll:true});}
}
function handlePauseAction(name){const choices=pauseChoices();if(name.startsWith?.('Arrow')){choices[nextMenuIndex(choices.length,choices.indexOf(document.activeElement),name)]?.focus({preventScroll:true});}else if(name==='confirm'){(choices.includes(document.activeElement)?document.activeElement:choices[0])?.click();}else if(['back','pause'].includes(name)){if(!$('pause-guide').hidden){$('pause-guide').hidden=true;$('pause-controls').setAttribute('aria-expanded','false');$('pause-controls').focus();}else if(match?.phase==='ready'){paused=false;syncPauseMenu();}else togglePause();}}
function handlePauseKey(event){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();handlePauseAction(event.code);return true;}if(['Escape','KeyP'].includes(event.code)){event.preventDefault();if(!event.repeat)handlePauseAction('back');return true;}if(event.code==='Tab'){const items=[...pauseDialog.querySelectorAll('button,a,input')].filter(x=>!x.disabled&&!x.hidden),index=items.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();items.at(-1)?.focus();}else if(!event.shiftKey&&index===items.length-1){event.preventDefault();items[0]?.focus();}return true;}return true;}
document.addEventListener('fullscreenchange',syncPauseMenu);
$('demo-menu').addEventListener('click',()=>{if(match?.phase==='ready'){paused=true;clearInput();syncPauseMenu();}else togglePause();});
pauseDialog.addEventListener('cancel',event=>{event.preventDefault();handlePauseAction('back');});
$('pause-resume').addEventListener('click',()=>{if(match?.phase==='ready'){paused=false;syncPauseMenu();}else togglePause();});$('pause-restart').addEventListener('click',start);
$('pause-controls').addEventListener('click',()=>{const guide=$('pause-guide');guide.hidden=!guide.hidden;$('pause-controls').setAttribute('aria-expanded',String(!guide.hidden));});
$('pause-sound').addEventListener('click',()=>{$('mute-fight').click();syncPauseMenu();});$('pause-motion').addEventListener('click',()=>{$('motion-toggle').checked=!$('motion-toggle').checked;$('motion-toggle').dispatchEvent(new Event('change'));syncPauseMenu();});
$('pause-settings').addEventListener('click',()=>{pauseDialog.close();clearInput();matchOptions.show(matchRules);});
$('pause-select').addEventListener('click',()=>{$('demo-select').click();});$('pause-title').addEventListener('click',goTitle);function goTitle(){clearInput();if(onlineBridge.enabled){onlineBridge.send({type:'leave'});return;}if(tournamentOverlay?.active)leaveTournamentRun(sessionStorage);const url=new URL('index.html',location.href);url.searchParams.set('sound',muted?'0':'1');url.searchParams.set('motion',$('motion-toggle').checked?'1':'0');screenHost.navigate(withMatchRules(withControllerSeats(url,gamepads.seatIndices()),matchRules));}



