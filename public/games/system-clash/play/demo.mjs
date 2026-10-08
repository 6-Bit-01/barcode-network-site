import {FIGHTER_STYLES} from './fight-engine.mjs';
import {createFightAudio} from './fight-audio.mjs';
import {createDemoSelection,beginDemoSelection,previewDemoFighter,confirmDemoFighter,backDemoSelection,randomDemoFighter,navigateDemoFighter,demoFightURL,controllerSeatsFromURL} from './demo-flow.mjs';
import {createGamepadInput} from './fight-gamepad.mjs';
const $=id=>document.getElementById(id),params=new URL(location.href).searchParams;
let state=null,catalog=null;
const gamepads=createGamepadInput({seats:controllerSeatsFromURL(location.href)});
let windowActive=document.hasFocus(),controllerLabel='';
let muted=params.get('sound')==='0',reducedMotion=params.has('motion')?params.get('motion')==='1':matchMedia('(prefers-reduced-motion: reduce)').matches;
const audio=createFightAudio({muted,reducedMotion,baseUrl:location.href});
function sound(id){void audio.startAudio().then(()=>audio.emit({type:'attack',action:'punch',attackerId:id}));}
function settings(){document.body.classList.toggle('motion-reduced',reducedMotion);$('demo-sound').textContent=muted?'Sound off':'Sound on';$('demo-sound').setAttribute('aria-pressed',String(muted));$('demo-motion').checked=reducedMotion;audio.setMuted(muted);audio.setReducedMotion(reducedMotion);}
function render(){
 if(!state)return;
 const selecting=state.screen!=='title';$('title-screen').hidden=selecting;$('select-screen').hidden=!selecting;
 $('select-mode').textContent=state.mode==='local'?'LOCAL TWO-PLAYER':'SOLO VS CPU';
 $('opponent-tag').textContent=state.mode==='local'?'PLAYER TWO':'CPU OPPONENT';
 $('select-heading').textContent=state.screen==='ready'?'READY TO CLASH':state.activePlayer===0?'CHOOSE YOUR FIGHTER':state.mode==='cpu'?'CHOOSE YOUR OPPONENT':'PLAYER TWO / CHOOSE YOUR FIGHTER';
 $('selection-instruction').textContent=state.screen==='ready'?state.picks.map(id=>catalog.fighters.find(f=>f.id===id).name).join(' vs. '):state.activePlayer===0?'Player one selects.':state.mode==='cpu'?'Choose the CPU opponent, or use Random.':'Player two selects.';
 for(let index=0;index<2;index++){
  const suffix=index?'two':'one',fighter=catalog.fighters.find(f=>f.id===state.picks[index]);
  $('face-'+suffix).src=fighter.portrait;$('face-'+suffix).alt='';
  $('standing-'+suffix).src=fighter.standing;$('standing-'+suffix).alt=fighter.name+' in their fighting stance';
  $('name-'+suffix).textContent=fighter.name;$('style-'+suffix).textContent=FIGHTER_STYLES[fighter.id].name;
  $('lock-'+suffix).textContent=state.confirmed[index]?'LOCKED':state.activePlayer===index&&state.screen==='select'?'SELECTING':'WAITING';
  document.querySelector('.player-'+suffix).classList.toggle('active',state.activePlayer===index&&state.screen==='select');
 }
 for(const button of $('fighter-grid').children){
  const one=button.dataset.fighter===state.picks[0],two=button.dataset.fighter===state.picks[1],active=button.dataset.fighter===state.picks[state.activePlayer];
  button.classList.toggle('is-one',one);button.classList.toggle('is-two',two);button.classList.toggle('is-both',one&&two);button.classList.toggle('is-current',active);
  button.setAttribute('aria-pressed',String(active));button.tabIndex=active?0:-1;
  button.querySelector('.slot-tag.one').hidden=!one;button.querySelector('.slot-tag.two').hidden=!two;
  button.disabled=button.dataset.enabled!=='true'||state.screen==='ready';
 }
 $('confirm-fighter').disabled=state.screen==='ready';$('random-fighter').disabled=state.screen==='ready';
 $('confirm-fighter').textContent=state.activePlayer===0?'LOCK PLAYER ONE':state.mode==='cpu'?'LOCK CPU OPPONENT':'LOCK PLAYER TWO';
 $('enter-arena').hidden=state.screen!=='ready';
 $('selection-back').textContent=state.activePlayer===1?'← CHANGE PLAYER ONE':'← TITLE SCREEN';
}
function focusSelection(){const active=$('fighter-grid').querySelector('[data-fighter="'+state.picks[state.activePlayer]+'"]');active?.focus({preventScroll:true});}
function choose(id){const next=previewDemoFighter(state,id);if(next===state)return;state=next;render();sound(id);}
function confirm(){if(state.screen!=='select')return;gamepads.reset();sound(state.picks[state.activePlayer]);state=confirmDemoFighter(state);render();if(state.screen==='ready')$('enter-arena').focus({preventScroll:true});else focusSelection();}
function begin(mode){gamepads.reset();state=beginDemoSelection(state,mode);render();void audio.startAudio();focusSelection();}
function back(){if(!state)return;gamepads.reset();state=backDemoSelection(state);audio.clear();render();if(state.screen==='title')$('solo-mode').focus();else focusSelection();}
function buildGrid(){
 const grid=$('fighter-grid');grid.replaceChildren();
 for(const fighter of state.roster){
  const button=document.createElement('button');button.type='button';button.className='fighter-card'+(fighter.enabled?'':' future');button.dataset.fighter=fighter.id;button.dataset.enabled=String(fighter.enabled);
  button.setAttribute('aria-label',fighter.name+(fighter.enabled?'':', future roster slot, unavailable in this demo'));
  if(fighter.enabled){const image=document.createElement('img');image.src=fighter.portrait;image.alt='';image.loading='lazy';image.width=256;image.height=256;button.append(image);button.addEventListener('click',()=>choose(fighter.id));}
  else{const icon=document.createElement('span');icon.className='locked-mark';icon.textContent='×';icon.setAttribute('aria-hidden','true');const note=document.createElement('small');note.textContent='FUTURE SIGNAL';button.append(icon,note);}
  const label=document.createElement('span');label.className='fighter-name';label.textContent=fighter.name;button.append(label);
  for(const [suffix,text]of [['one','P1'],['two','P2']]){const tag=document.createElement('span');tag.className='slot-tag '+suffix;tag.textContent=text;tag.hidden=true;button.append(tag);}
  grid.append(button);
 }
}
async function load(){
 $('retry-demo').hidden=true;$('demo-load').classList.remove('error');
 try{
  const response=await fetch(new URL('assets/menu/roster.json',location.href));if(!response.ok)throw new Error('The fighter roster could not connect.');
  catalog=await response.json();if(catalog.fighters.length!==13||catalog.fighters.some(f=>!FIGHTER_STYLES[f.id]||![f.portrait,f.standing].every(path=>/^assets\/menu\/[a-z0-9-]+\.webp$/.test(path))))throw new Error('The fighter roster needs its registered artwork.');
  state=createDemoSelection(catalog.fighters,{p1:params.get('p1'),p2:params.get('p2'),mode:params.get('mode'),screen:params.get('screen')});
  buildGrid();render();$('solo-mode').disabled=false;$('local-mode').disabled=false;$('demo-load').textContent='SIGNAL READY / 13 FIGHTERS ONLINE';
 }catch(error){$('demo-load').textContent=error.message;$('demo-load').classList.add('error');$('retry-demo').hidden=false;}
}
$('solo-mode').addEventListener('click',()=>begin('cpu'));$('local-mode').addEventListener('click',()=>begin('local'));
$('confirm-fighter').addEventListener('click',confirm);$('selection-back').addEventListener('click',back);
$('random-fighter').addEventListener('click',()=>{state=randomDemoFighter(state);render();sound(state.picks[state.activePlayer]);focusSelection();});
$('enter-arena').addEventListener('click',()=>{audio.clear();location.href=demoFightURL(state,location.href,{muted,reducedMotion,controllerSeats:gamepads.seatIndices()}).href;});
$('retry-demo').addEventListener('click',load);
$('demo-sound').addEventListener('click',()=>{muted=!muted;settings();if(!muted)void audio.startAudio();});
$('demo-motion').addEventListener('change',()=>{reducedMotion=$('demo-motion').checked;settings();});
function closeControls(){gamepads.reset();$('controls-dialog').close();}
$('controls-open').addEventListener('click',()=>{gamepads.reset();$('controls-dialog').showModal();});$('controls-close').addEventListener('click',closeControls);
$('controls-dialog').addEventListener('close',()=>gamepads.reset());
window.addEventListener('keydown',event=>{
 if(!state||$('controls-dialog').open||event.target.closest?.('input'))return;
 if(event.key==='Escape'){event.preventDefault();back();return;}
 if(state.screen!=='select')return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();state=navigateDemoFighter(state,event.key);render();focusSelection();}
 else if(event.key==='Enter'&&!event.target.closest?.('button,a')){event.preventDefault();confirm();}
});
$('fighter-grid').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.repeat){event.preventDefault();event.stopPropagation();confirm();}});
function pollMenuGamepads(now){
 let pads=[];try{pads=navigator.getGamepads?.()??[];}catch{}
 const sample=gamepads.sample(pads,now,{context:'menu',active:!!state&&windowActive&&!document.hidden});
 const connected=sample.players.filter(player=>player.connected);
 const label=connected.length?sample.players.map((player,index)=>'P'+(index+1)+': '+(player.connected?'controller '+(player.index+1):'keyboard')).join(' · ')+' · × confirm · ○ back · △ Random':'Press a controller button to connect · Keyboard / touch available';
 const status=label+(sample.unsupported?' · Unsupported controller mapping; keyboard available':'');
 if(status!==controllerLabel){controllerLabel=status;$('controller-status').textContent=status;}
 if(sample.events.some(event=>event.type==='disconnect')){gamepads.reset();return;}
 for(const event of sample.events){
  if(!['press','navigate'].includes(event.type))continue;
  if($('controls-dialog').open){if(event.type==='press'&&['back','pause','confirm'].includes(event.action))closeControls();return;}
  if(state.screen==='title'){
   if(event.player!==0)continue;
   const items=['solo-mode','local-mode','controls-open','demo-sound','demo-motion'].map($).filter(item=>!item.disabled);
   if(event.type==='navigate'){
    const index=items.indexOf(document.activeElement),step=['ArrowUp','ArrowLeft'].includes(event.action)?-1:1;
    items[index<0?0:(index+step+items.length)%items.length]?.focus({preventScroll:true});
   }else if(event.action==='confirm'){(items.includes(document.activeElement)?document.activeElement:$('solo-mode')).click();gamepads.reset();return;}
   else if(event.action==='pause'){$('controls-open').click();return;}
   continue;
  }
  if(state.mode==='local'&&connected.length===2&&state.screen==='select'&&event.player!==state.activePlayer)continue;
  if(state.mode==='cpu'&&event.player!==0)continue;
  if(event.type==='navigate'&&state.screen==='select'){state=navigateDemoFighter(state,event.action);render();focusSelection();}
  else if(event.action==='back'){back();return;}
  else if(event.action==='random'&&state.screen==='select'){$('random-fighter').click();}
  else if(event.action==='confirm'){if(state.screen==='ready'){$('enter-arena').click();gamepads.reset();}else confirm();return;}
  else if(event.action==='pause'){$('controls-open').click();return;}
 }
}
function menuTick(now){pollMenuGamepads(now);requestAnimationFrame(menuTick);}
window.addEventListener('blur',()=>{windowActive=false;gamepads.reset();audio.setPaused(true);});
window.addEventListener('focus',()=>{windowActive=true;gamepads.reset();audio.setPaused(document.hidden);});
document.addEventListener('visibilitychange',()=>{gamepads.reset();audio.setPaused(document.hidden||!windowActive);});
window.addEventListener('pagehide',()=>{gamepads.reset();audio.clear();});
settings();void load();requestAnimationFrame(menuTick);
