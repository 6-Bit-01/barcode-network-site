import {createTitleFX} from './title-fx.mjs';
import {createConsoleBoot} from './console-boot.mjs';
import {createGameMusic} from './game-music.mjs';
import {availableControllerItems,canControlMenu} from './fight-menu-controller.mjs';
import {createGameScreenHost} from './game-screen-host.mjs';
import {bindGameScreenControls} from './game-screen-controls.mjs';
import {createMatchOptions} from './fight-menus.mjs';
import {loadMatchRules,saveMatchRules,loadClashPreferences,enterCorporateCode,matchRulesFromURL,withMatchRules} from './fight-rules.mjs';
import {nextMenuIndex} from './fight-ui.mjs';
import {STAGES,stageById} from './fight-stages.mjs';
import {FIGHTER_STYLES} from './fight-engine.mjs';
import {createFightAudio} from './fight-audio.mjs';
import {selectDemoStage,cycleDemoStage,demoRoster,DEMO_ROSTER_CAPACITY,createDemoSelection,beginDemoSelection,previewDemoFighter,confirmDemoFighter,backDemoSelection,randomDemoFighter,navigateDemoFighter,demoFightURL,controllerSeatsFromURL} from './demo-flow.mjs';
import {createGamepadInput} from './fight-gamepad.mjs';
import {createMenuPreviews} from './menu-preview.mjs';
import {createMenuPortraits} from './menu-portraits.mjs';
import {isSealedFighter,appendSealedFighterCard,SEALED_FIGHTER_ART} from './sealed-fighter-card.mjs';
import {createTournamentRun,launchTournamentMatch,saveTournamentRun} from './tournament.mjs';
import {withControllerSeats,resolveInterfaceSettings} from './demo-flow.mjs';
const $=id=>document.getElementById(id),params=new URL(location.href).searchParams;
let state=null,catalog=null,tournamentRun=null,menuReady=false;
let corporateUnlocked=loadClashPreferences(localStorage).corporateUnlocked;
let matchRules=matchRulesFromURL(location.href,loadMatchRules(localStorage));
const screenHost=createGameScreenHost({onDisplayChange:()=>screenControls.sync(),onSuspend:()=>{menuSuspended=true;gamepads.reset();audio.clear();music.suspend();bootAudio.pause();bootAudio.currentTime=0;boot.pause();previews.destroy();}});
const screenControls=bindGameScreenControls(screenHost);
const matchOptions=createMatchOptions({rules:matchRules,onApply:rules=>{matchRules=rules;saveMatchRules(localStorage,rules);gamepads.reset();},onClose:()=>gamepads.reset(),onCode:code=>{const result=enterCorporateCode(localStorage,code);if(result.accepted){corporateUnlocked=true;if(state){state={...state,roster:demoRoster(catalog.fighters,{corporateUnlocked})};buildGrid();render();}}return result;},onSound:uiSound});
for(const id of ['options-open','title-options-open'])$(id).addEventListener('click',()=>{if(!menuReady)return;gamepads.reset();uiSound('ui-options');matchOptions.show(matchRules);});
function titleChoices(){return availableControllerItems(['online-tournament-mode','solo-mode','local-mode','tournament-mode','online-mode','title-options-open','controls-open','demo-sound','demo-fullscreen','demo-motion'].map($));}
function loading(text,progress=0,failed=false){for(const node of document.querySelectorAll?.('header:not(.game-screen-bar),main,footer')??[])node.inert=true;$('asset-loading').hidden=false;$('asset-loading-text').textContent=text;$('asset-loading-progress').value=progress;$('asset-loading-retry').hidden=!failed;}
function menuImage(path){return new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(Error('A menu image could not load. Retry loading.'));image.src=new URL(path,location.href).href;});}
const tournamentStorage={getItem:key=>sessionStorage.getItem(key),setItem:(key,value)=>sessionStorage.setItem(key,value)};
const gamepads=createGamepadInput({menuSeatRecovery:true,seats:controllerSeatsFromURL(location.href)});
let windowActive=document.hasFocus(),controllerLabel='';
const titleFX=createTitleFX($('title-fx'),{logoCanvas:$('title-logo-fx'),logoImage:$('title-logo-image')});
let menuRAF=null,menuSuspended=false;
let {muted,reducedMotion}=resolveInterfaceSettings(params,{prefersReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
const audio=createFightAudio({muted,reducedMotion,baseUrl:location.href,uiSounds:true});
const music=createGameMusic({muted});
const bootAudio=new Audio(new URL('assets/audio/barcode-console-start.wav',location.href));bootAudio.preload='none';bootAudio.volume=.32;
const boot=createConsoleBoot({element:$('console-boot'),image:$('console-mark'),caption:$('console-caption'),reducedMotion:()=>reducedMotion,onFinish:()=>{for(const node of document.querySelectorAll('header,main,footer'))node.inert=false;try{sessionStorage.setItem('system-clash-console-seen','1');}catch{}$('online-tournament-mode').focus({preventScroll:true});music.setPaused(document.hidden||!windowActive||menuSuspended);void music.unlock();}});
const portraits=createMenuPortraits({baseURL:location.href});
const previews=createMenuPreviews({baseURL:location.href,canvases:[$('idle-one'),$('idle-two')],fallbacks:[$('standing-one'),$('standing-two')],isActive:()=>!!state&&state.screen!=='title'&&windowActive&&!document.hidden});
function uiSound(type){void audio.emitUISound(type);}
function settings(){document.body.classList.toggle('motion-reduced',reducedMotion);$('demo-sound').textContent=muted?'Sound off':'Sound on';$('demo-sound').setAttribute('aria-pressed',String(muted));$('demo-motion').checked=reducedMotion;audio.setMuted(muted);music.setMuted(muted);bootAudio.muted=muted;audio.setReducedMotion(reducedMotion);previews.setReducedMotion(reducedMotion);}
function render(){
 document.body.dataset.demoScreen=state.screen;
 if(!state)return;
 if(typeof music==='object')music.setScene({screen:state.screen==='title'?'title':state.mode==='tournament'&&state.screen==='ready'?'tournament':'select',fighter:state.picks[0],stage:state.stage});
 const stage=stageById(state.stage);$('stage-choice').hidden=state.mode==='tournament';$('demo-stage').value=stage.id;$('stage-preview').src='assets/stages/'+stage.id+'.webp';$('stage-description').textContent=stage.description;
 const selecting=state.screen!=='title',tournament=state.mode==='tournament';$('options-open').hidden=!selecting;
 $('demo-scope').textContent=state.roster.filter(f=>f.enabled).length+' playable fighters · '+state.roster.length+' roster slots · Classic arcade controls';$('fighter-grid').setAttribute('aria-label',state.roster.length+'-slot fighter roster');$('title-screen').hidden=selecting;$('select-screen').hidden=!selecting;
 $('select-mode').textContent=tournament?'TOURNAMENT / EIGHT-NODE CLIMB':state.mode==='local'?'LOCAL TWO-PLAYER':'SOLO VS CPU';
 $('opponent-tag').textContent=tournament?'FIRST CHALLENGER':state.mode==='local'?'PLAYER TWO':'CPU OPPONENT';
 $('select-heading').textContent=state.screen==='ready'?'READY TO CLASH':state.activePlayer===0?'CHOOSE YOUR FIGHTER':state.mode==='cpu'?'CHOOSE YOUR OPPONENT':'PLAYER TWO / CHOOSE YOUR FIGHTER';
 $('selection-instruction').textContent=tournament?(state.screen==='ready'?'Eight rivals. One climb. Enter when ready.':'Choose your fighter. Six rivals lead to BNL and the final boss.'):state.screen==='ready'?state.picks.map(id=>catalog.fighters.find(f=>f.id===id).name).join(' vs. '):state.activePlayer===0?'Player one selects.':state.mode==='cpu'?'Choose the CPU opponent, or use Random.':'Player two selects.';
 for(let index=0;index<2;index++){
  const suffix=index?'two':'one',waiting=tournament&&index===1&&!tournamentRun,fighter=catalog.fighters.find(f=>f.id===(tournament&&index===1&&tournamentRun?tournamentRun.opponents[0]:state.picks[index]));
  document.querySelector('.player-'+suffix).classList.toggle('tournament-waiting',waiting);
  $('face-'+suffix).src=fighter.portrait;$('face-'+suffix).alt='';
  const panel=document.querySelector('.player-'+suffix);panel.style.setProperty('--menu-canvas-width',(fighter.menuCanvasSize?.[0]??320)+'px');panel.style.setProperty('--menu-canvas-height',(fighter.menuCanvasSize?.[1]??440)+'px');
  if(!$('standing-'+suffix).src.endsWith(fighter.standing))$('standing-'+suffix).src=fighter.standing;$('standing-'+suffix).alt=fighter.name+' in their fighting stance';
  if(selecting&&!waiting)previews.select(index,fighter.id);
  $('name-'+suffix).textContent=waiting?'8 CPU RIVALS':fighter.name;$('style-'+suffix).textContent=waiting?'EIGHT DISTINCT OPPONENTS':FIGHTER_STYLES[fighter.id].name;
  $('lock-'+suffix).textContent=waiting?'CLIMB AWAITS':state.confirmed[index]?'LOCKED':state.activePlayer===index&&state.screen==='select'?'SELECTING':'WAITING';
  document.querySelector('.player-'+suffix).classList.toggle('active',state.activePlayer===index&&state.screen==='select');
 }
 for(const button of $('fighter-grid').children){
  const one=button.dataset.fighter===state.picks[0],two=!tournament&&button.dataset.fighter===state.picks[1],active=button.dataset.fighter===state.picks[state.activePlayer];
  button.classList.toggle('is-one',one);button.classList.toggle('is-two',two);button.classList.toggle('is-both',one&&two);button.classList.toggle('is-current',active);
  button.setAttribute('aria-pressed',String(active));button.tabIndex=active?0:-1;
  button.querySelector('.slot-tag.one').hidden=!one;button.querySelector('.slot-tag.two').hidden=!two;
  button.disabled=button.dataset.enabled!=='true'||state.screen==='ready';
 }
 $('confirm-fighter').disabled=state.screen==='ready';$('random-fighter').disabled=state.screen==='ready';
 $('confirm-fighter').textContent=state.activePlayer===0?'LOCK PLAYER ONE':state.mode==='cpu'?'LOCK CPU OPPONENT':'LOCK PLAYER TWO';
 $('enter-arena').hidden=state.screen!=='ready';$('enter-arena').textContent=tournament?'START THE CLIMB →':'ENTER THE ARENA →';if(state.screen==='ready'&&!tournament)$('selection-instruction').textContent+=' · ← / → changes stage';
 $('selection-back').textContent=state.activePlayer===1||tournament&&state.screen==='ready'?'← CHANGE PLAYER ONE':'← TITLE SCREEN';
}
function focusSelection(){const active=$('fighter-grid').querySelector('[data-fighter="'+state.picks[state.activePlayer]+'"]');active?.focus({preventScroll:true});active?.scrollIntoView?.({block:'nearest',inline:'nearest'});}
function choose(id){const next=previewDemoFighter(state,id);if(next===state)return;state=next;render();uiSound('ui-select');}
function confirm(){if(state.screen!=='select')return;gamepads.reset();uiSound('ui-confirm');state=confirmDemoFighter(state);if(state.mode==='tournament')tournamentRun=createTournamentRun(state.roster,{fighterId:state.picks[0],settings:{muted,reducedMotion,controllerSeats:gamepads.seatIndices(),matchRules,corporateUnlocked}});render();if(state.screen==='ready')$('enter-arena').focus({preventScroll:true});else focusSelection();}
function begin(mode){gamepads.reset();tournamentRun=null;state=beginDemoSelection(state,mode);render();uiSound('ui-start');focusSelection();}
function back(){if(!state)return;gamepads.reset();state=backDemoSelection(state);tournamentRun=null;audio.clear();uiSound('ui-back');render();if(state.screen==='title')$('online-tournament-mode').focus();else focusSelection();}
function buildGrid(){
 const grid=$('fighter-grid');grid.replaceChildren();
 for(const fighter of state.roster){
  const button=document.createElement('button');button.type='button';button.className='fighter-card'+(fighter.enabled?'':' future');button.dataset.fighter=fighter.id;button.dataset.enabled=String(fighter.enabled);
  if(isSealedFighter(fighter)){button.disabled=true;appendSealedFighterCard(document,button,{baseURL:location.href});}
  else {button.setAttribute('aria-label',fighter.name+(fighter.enabled?'':', locked. Enter a broadcast code in Options to unlock.'));
  const face=document.createElement('canvas');face.className='card-portrait';face.setAttribute('aria-hidden','true');button.append(face);void portraits.add(face,fighter).catch(()=>{button.dataset.portraitError='true';});
  if(fighter.enabled)button.addEventListener('click',()=>choose(fighter.id));
  else{const icon=document.createElement('span');icon.className='locked-mark';icon.textContent='LOCKED';icon.setAttribute('aria-hidden','true');button.append(icon);}
  const label=document.createElement('span');label.className='fighter-name';label.textContent=fighter.name;button.append(label);}
  for(const [suffix,text]of [['one','P1'],['two','P2']]){const tag=document.createElement('span');tag.className='slot-tag '+suffix;tag.textContent=text;tag.hidden=true;button.append(tag);}
  grid.append(button);
 }
}
async function load(){
 let failed=false;
 $('retry-demo').hidden=true;$('demo-load').classList.remove('error');menuReady=false;loading('Loading the fighter roster…',5);
 try{
  const response=await fetch(new URL('assets/menu/roster.json',location.href),{cache:'no-store'});if(!response.ok)throw new Error('The fighter roster could not connect.');
  catalog=await response.json();if((catalog.fighters.length<1||catalog.fighters.length>DEMO_ROSTER_CAPACITY||new Set(catalog.fighters.map(f=>f.id)).size!==catalog.fighters.length)||catalog.fighters.some(f=>!FIGHTER_STYLES[f.id]||![f.portrait,f.standing].every(path=>/^assets\/menu\/[a-z0-9-]+\.webp$/.test(path))))throw new Error('The fighter roster needs its registered artwork.');
  state=createDemoSelection(catalog.fighters,{corporateUnlocked,p1:params.get('p1'),p2:params.get('p2'),stage:params.get('stage'),mode:params.get('mode'),screen:params.get('screen')});
  const paths=[...new Set([SEALED_FIGHTER_ART,'assets/menu/title-arena.webp','assets/console/system-clash-title.webp','assets/console/barcode-circuit-works.webp','assets/console/soft-signal-systems.webp','assets/console/channel-06-entertainment.webp','assets/menu/6-bit-standing.webp','assets/menu/9-bit-standing.webp',...catalog.fighters.flatMap(f=>[f.portrait,f.standing])])];let done=0;await Promise.all(paths.map(async path=>{await menuImage(path);if(failed)return;loading('Loading menu artwork · '+(++done)+' / '+paths.length,10+done/paths.length*90);}));
  menuReady=true;for(const node of document.querySelectorAll?.('header,main,footer')??[])node.inert=false;$('asset-loading').hidden=true;buildGrid();render();$('solo-mode').disabled=false;$('local-mode').disabled=false;$('tournament-mode').disabled=false;$('online-mode').disabled=false;$('online-tournament-mode').disabled=false;$('demo-load').textContent='SIGNAL READY / '+catalog.fighters.length+' FIGHTERS ONLINE';
  let seen=false;try{seen=sessionStorage.getItem('system-clash-console-seen')==='1';}catch{}if(!seen&&state.screen==='title'){for(const node of document.querySelectorAll('header:not(.game-screen-bar),main,footer'))node.inert=true;music.setPaused(true);boot.start();if(!muted)void bootAudio.play().catch(()=>{});}
 }catch(error){failed=true;loading(error.message,0,true);$('demo-load').textContent=error.message;$('demo-load').classList.add('error');$('retry-demo').hidden=false;}
}
for(const stage of STAGES){const option=document.createElement('option');option.value=stage.id;option.textContent=stage.name;$('demo-stage').append(option);}
$('demo-stage').addEventListener('change',()=>{state=selectDemoStage(state,$('demo-stage').value);render();});
$('tournament-mode').addEventListener('click',()=>begin('tournament'));
$('online-tournament-mode').addEventListener('click',()=>{audio.clear();const url=new URL('tournament-online.html',location.href);url.searchParams.set('sound',muted?'0':'1');url.searchParams.set('motion',reducedMotion?'1':'0');screenHost.navigate(withControllerSeats(url,gamepads.seatIndices()));});
$('online-mode').addEventListener('click',()=>{audio.clear();const url=new URL('online.html',location.href);url.searchParams.set('sound',muted?'0':'1');url.searchParams.set('motion',reducedMotion?'1':'0');screenHost.navigate(withMatchRules(withControllerSeats(url,gamepads.seatIndices()),matchRules));});
$('solo-mode').addEventListener('click',()=>begin('cpu'));$('local-mode').addEventListener('click',()=>begin('local'));
$('confirm-fighter').addEventListener('click',confirm);$('selection-back').addEventListener('click',back);
$('random-fighter').addEventListener('click',()=>{state=randomDemoFighter(state);render();uiSound('ui-select');focusSelection();});
$('enter-arena').addEventListener('click',()=>{const settings={muted,reducedMotion,controllerSeats:gamepads.seatIndices(),matchRules};if(state.mode==='tournament'){if(!tournamentRun)return;const launch=launchTournamentMatch(tournamentRun,location.href,settings);if(!saveTournamentRun(tournamentStorage,launch.run,catalog.fighters)){$('selection-instruction').textContent='This browser could not save the Tournament. Enable session storage to start the climb.';return;}audio.clear();screenHost.navigate(launch.url);return;}audio.clear();screenHost.navigate(withMatchRules(demoFightURL(state,location.href,settings),matchRules));});
$('retry-demo').addEventListener('click',load);$('asset-loading-retry').addEventListener('click',load);
$('demo-sound').addEventListener('click',()=>{muted=!muted;settings();if(!muted)void audio.startAudio();});
$('demo-motion').addEventListener('change',()=>{reducedMotion=$('demo-motion').checked;settings();});
function closeControls(){gamepads.reset();$('controls-dialog').close();}
$('controls-open').addEventListener('click',()=>{if(!menuReady)return;gamepads.reset();$('controls-dialog').showModal();});$('controls-close').addEventListener('click',closeControls);
$('controls-dialog').addEventListener('close',()=>gamepads.reset());
window.addEventListener('keydown',event=>{
 if(!menuReady)return;
 if(typeof boot==='object'&&boot.active){if(['Enter','Space','Escape'].includes(event.code))event.preventDefault();return;}
 if(matchOptions.open){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape'].includes(event.code)){event.preventDefault();if(!event.repeat)matchOptions.handleAction(event.code==='Enter'?'confirm':event.code==='Escape'?'back':event.code);}return;}
 if(state?.screen==='title'&&!$('controls-dialog').open&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(event.code)){const items=titleChoices();event.preventDefault();if(event.code==='Enter'){if(!event.repeat)(items.includes(document.activeElement)?document.activeElement:items[0])?.click();}else {items[nextMenuIndex(items.length,items.indexOf(document.activeElement),event.code)]?.focus({preventScroll:true});uiSound('ui-move');}return;}

 if(!state||$('controls-dialog').open||event.target.closest?.('input,select'))return;
 if(event.key==='Escape'){event.preventDefault();back();return;}
 if(state.screen==='ready'&&state.mode!=='tournament'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();state=cycleDemoStage(state,event.key==='ArrowLeft'?-1:1);render();$('enter-arena').focus({preventScroll:true});return;}
 if(state.screen!=='select')return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();state=navigateDemoFighter(state,event.key);render();uiSound('ui-move');focusSelection();}
 else if(event.key==='Enter'&&!event.target.closest?.('button,a')){event.preventDefault();confirm();}
});
$('fighter-grid').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.repeat){event.preventDefault();event.stopPropagation();confirm();}});
function pollMenuGamepads(now){
 let pads=[];try{pads=navigator.getGamepads?.()??[];}catch{}
 const sample=gamepads.sample(pads,now,{context:'menu',active:menuReady&&!!state&&windowActive&&!document.hidden});
 const connected=sample.players.filter(player=>player.connected);
 const label=connected.length?sample.players.map((player,index)=>'P'+(index+1)+': '+(player.connected?'controller '+(player.index+1):'keyboard')).join(' · ')+' · × confirm · ○ back · △ Random':'Press a controller button to connect · Keyboard / touch available';
 const status=label+(sample.unsupported?' · Unsupported controller mapping; keyboard available':'');
 if(status!==controllerLabel){controllerLabel=status;$('controller-status').textContent=status;}
 if(sample.events.some(event=>event.type==='disconnect')){gamepads.reset();return;}
 for(const event of sample.events){
  if(!['press','navigate'].includes(event.type))continue;
  if(typeof music==='object'&&event.type==='press')void music.unlock();
  if(typeof boot==='object'&&boot.active){gamepads.reset();return;}
  if(matchOptions.open){matchOptions.handleAction(event.action);return;}
  if($('controls-dialog').open){if(event.type==='press'&&['back','pause','confirm'].includes(event.action))closeControls();return;}
  if(!canControlMenu(event.player,sample.players,{screen:state.screen,mode:state.mode,activePlayer:state.activePlayer}))continue;
  if(state.screen==='title'){
   const items=titleChoices();
   if(event.type==='navigate'){
    const index=items.indexOf(document.activeElement),step=['ArrowUp','ArrowLeft'].includes(event.action)?-1:1;
    items[index<0?0:(index+step+items.length)%items.length]?.focus({preventScroll:true});uiSound('ui-move');
   }else if(event.action==='confirm'){(items.includes(document.activeElement)?document.activeElement:items[0])?.click();gamepads.reset();return;}
   else if(event.action==='pause'){$('options-open').hidden?$('title-options-open').click():$('options-open').click();return;}
   continue;
  }
  if(event.type==='navigate'&&state.screen==='ready'&&state.mode!=='tournament'){state=cycleDemoStage(state,['ArrowLeft','ArrowUp'].includes(event.action)?-1:1);render();$('enter-arena').focus({preventScroll:true});}
  else if(event.type==='navigate'&&state.screen==='select'){state=navigateDemoFighter(state,event.action);render();uiSound('ui-move');focusSelection();}
  else if(event.action==='back'){back();return;}
  else if(event.action==='random'&&state.screen==='select'){availableControllerItems([$('random-fighter')])[0]?.click();}
  else if(event.action==='confirm'){if(state.screen==='ready'){availableControllerItems([$('enter-arena')])[0]?.click();gamepads.reset();}else confirm();return;}
  else if(event.action==='pause'){$('options-open').hidden?$('title-options-open').click():$('options-open').click();return;}
 }
}
function menuTick(now){if(menuSuspended)return;titleFX.draw(now,{reducedMotion,active:state?.screen==='title'&&windowActive&&!document.hidden});pollMenuGamepads(now);if(windowActive&&!document.hidden)boot.tick(now);previews.tick(now);menuRAF=requestAnimationFrame(menuTick);}
window.addEventListener('blur',()=>{windowActive=false;gamepads.reset();audio.setPaused(true);music.setPaused(true);bootAudio.pause();bootAudio.currentTime=0;boot.pause();});
window.addEventListener('focus',()=>{windowActive=true;gamepads.reset();audio.setPaused(document.hidden);music.setPaused(document.hidden||boot.active);boot.pause();});
document.addEventListener('visibilitychange',()=>{gamepads.reset();audio.setPaused(document.hidden||!windowActive);music.setPaused(document.hidden||!windowActive||boot.active);if(document.hidden||!windowActive){bootAudio.pause();bootAudio.currentTime=0;}boot.pause();});
window.addEventListener('pagehide',()=>{menuSuspended=true;cancelAnimationFrame(menuRAF);menuRAF=null;gamepads.reset();audio.clear();music.suspend();bootAudio.pause();bootAudio.currentTime=0;boot.pause();previews.destroy();});
window.addEventListener('pageshow',()=>{if(!menuSuspended)return;menuSuspended=false;music.resume();windowActive=document.hasFocus();gamepads.reset();audio.setPaused(document.hidden||!windowActive);music.setPaused(document.hidden||!windowActive||boot.active);if(document.hidden||!windowActive){bootAudio.pause();bootAudio.currentTime=0;}boot.pause();render();if(menuRAF===null)menuRAF=requestAnimationFrame(menuTick);});
settings();void load();menuRAF=requestAnimationFrame(menuTick);
