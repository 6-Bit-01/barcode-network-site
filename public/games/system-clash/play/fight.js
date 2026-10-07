import {createMatch,advanceMatch,performAction,getFighterView,consumeEvents,FIGHTER_STYLES} from './fight-engine.mjs';
import {createFightRenderer} from './fight-renderer.mjs';
import {createFightEffects} from './fight-effects.mjs';
import {loadFightArt,loadDeletionArt,loadArcadeArt,loadWeaponArt,combatMetadata} from './fight-assets.mjs';
import {DELETION_POSES,BROADCAST_CUT,deletionDefinition} from './deletion-library.mjs';
import {previewBattleWear} from './fight-damage-preview.mjs';
import {createAttackInputBuffer,pressAttackInput,flushAttackInputs,releaseAttackInput,clearAttackInputs} from './fight-input.mjs';
import {createDeletionReview} from './fight-review.mjs';
import {interpolateFightViews} from './fight-presentation.mjs';

const $ = id=>document.getElementById(id);
const canvas = $('fight-stage');
const renderer = createFightRenderer(canvas);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
$('motion-toggle').checked = motionPreference.matches;
const effects = createFightEffects({reducedMotion:motionPreference.matches});
const held = new Set(), virtual = new Set(), latched = new Set();
const attackInputs=createAttackInputBuffer();
const attackButtons=new Set(['punch','low-punch','kick','low-kick']);
const watchedKeys = new Set(['KeyA','KeyD','KeyS','KeyW','KeyU','KeyI','KeyJ','KeyK','Space','KeyL','KeyF','ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Digit0','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Numpad0','Numpad1','Numpad2','Numpad3','Numpad4','Numpad5','Numpad6','Numpad7','Numpad8','Enter','KeyP','Escape','KeyR']);
let art,metadata,match,deletionProp,weaponArt,ready=false,paused=false,last=performance.now(),accumulator=0,muted=false,statusText='',arenaLabel='',loadRevision=0,inspectTime=null,motionTime=null;
let tapMove=0,tapUntil=0;
let weaponFeedback='',weaponFeedbackUntil=0;
let deletionReviewCache=null;
let activeRoster=[];
let previousTravelViews=null,previousTravelPhase=null;

function dispatchEvents() {
  for(const event of consumeEvents(match)) {
    effects.emit(renderer.resolveEvent(event,{match,views:match.fighters.map((_,index)=>getFighterView(match,index)),art,deletionProp}));
    if(['weapon-pickup','weapon-empty','weapon-embed'].includes(event.type)) {
      const name=event.name ?? (event.weaponType==='pulse-driver'?'Pulse Driver':'Neural Spike');
      weaponFeedback=event.type==='weapon-pickup'?name+' equipped — High punch uses it':event.type==='weapon-empty'?'No charges left — throw the weapon':name+' embedded';
      weaponFeedbackUntil=performance.now()+1800;
    }
  }
}

function clearInput() {
  held.clear();virtual.clear();latched.clear();clearAttackInputs(attackInputs);tapMove=0;tapUntil=0;
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
  const key=loadRevision+':'+$('deletion-facing').value+':'+time+':'+$('motion-toggle').checked;
  if(deletionReviewCache?.key===key)return deletionReviewCache.match;
  deletionReviewCache={key,...createDeletionReview({time,metadata,art,deletionProp,renderer,direction:$('deletion-facing').value,reducedMotion:$('motion-toggle').checked})};
  return deletionReviewCache.match;
}

function draw() {
  if (!art || !match) return;
  const definition=deletionDefinition(art[0].manifest.id);
  const preset=$('pose-preset').value,poseKey=inspectTime<(definition?.duration??6500)/2?1:2;
  const posePairs={brace:['shove','brace'],suspended:['pull','suspended'],compressed:['pull','compressed'],crumpled:['stomp','crumpled'],present:['present','crumpled']};
  const display=inspectTime===null?match:preset==='broadcast'?inspectDeletionScene(inspectTime):{...match,phase:'poses',winner:0,deletionElapsed:0,poseLabel:$('pose-preset').selectedOptions[0].textContent.toUpperCase(),poseKey,stagePickups:[],projectiles:[],fighters:match.fighters.map(f=>({...f,...previewBattleWear(f,'fresh'),weapon:null,_weaponAction:null,embeddedWeapons:[]}))};
  let views=display.fighters.map((_,index)=>getFighterView(display,index));
  if(inspectTime===null&&motionTime===null&&!paused&&previousTravelPhase===match.phase&&match.phase==='fight')
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
  renderer.draw({match:scene,motionReview:motionTime!==null,views,art,effects:sceneEffects,deletionProp,weaponArt,paused:paused&&inspectTime===null&&motionTime===null,reducedMotion:$('motion-toggle').checked});
  for(let index=0;index<2;index++) {
    const f=scene.fighters[index],weapon=f.weapon;
    const condition=['Fresh','Bloodied','Battered','Ravaged'][f.damageTier ?? 0];
    $('gear-'+index).textContent=f.name+' · '+(weapon?weapon.name+' / '+weapon.charges+' uses':'Unarmed')+' · '+condition+(f.embeddedWeapons?.length?' / '+f.embeddedWeapons.length+' embedded':'');
  }
  const pickup=match.stagePickups?.[0];
  const stageLabel=inspectTime!==null?'Deletion preview':match.phase==='fight'?(pickup?pickup.name+' available — Throw nearby to equip':'Next pickup in '+Math.max(0,Math.ceil(((match.nextPickupAt ?? 8000)-match.combatTime)/1000))+'s'):match.phase==='deletion'?'Deletion in progress':match.phase==='finish'?'Finish the fight':match.phase==='over'?'Round ended':pickup?pickup.name+' on the stage':'Pickups arrive during the fight';
  $('stage-gear').textContent=motionTime!==null?'Move preview — match frozen':stageLabel;
  const equipped=!!match.fighters[0].weapon;
  $('hurl-weapon').disabled=!equipped||match.phase!=='fight'||paused||inspectTime!==null||motionTime!==null||!['idle','walk','crouch','block'].includes(match.fighters[0].action);
  const air=!!views[0].airborne,duck=controls()[0].crouch;
  document.querySelectorAll('[data-action="double-punch"],[data-action="power-kick"]').forEach(button=>button.disabled=air||duck||match.phase!=='fight'||paused||inspectTime!==null||motionTime!==null);
  $('use-weapon-label').textContent=air?'Jump punch':duck?'Uppercut':equipped?(match.fighters[0].weapon.charges>0?'Use weapon':'Empty weapon'):'High punch';
  $('high-kick-label').textContent=air?'Jump kick':duck?'Rising knee / boot':'High kick';
  $('low-punch-label').textContent=air?'Jump punch':duck?'Crouch jab':'Low punch';
  $('low-kick-label').textContent=air?'Jump kick':duck?'Low sweep':'Low kick';
  const reviewLabel=preset==='broadcast'?'Inspecting '+definition.name+' at '+(inspectTime/1000).toFixed(2)+' seconds':'Shared pose review: '+display.poseLabel+', key '+poseKey;
  const moveLabel=view=>view.clip.startsWith('delete-')?'Deletion pose':view.clip.replaceAll('-',' ');
  const motionLabel=motionTime!==null?'Move review: '+scene.poseLabel+' at '+(motionTime/1000).toFixed(2)+' seconds, hand: '+$('motion-weapon').selectedOptions[0].textContent+', chest: '+$('motion-embedded').selectedOptions[0].textContent+', wear: '+$('motion-damage').selectedOptions[0].textContent:null;
  const label=`${scene.fighters[0].name}: ${scene.fighters[0].hp} health, ${moveLabel(views[0])}, ${$('gear-0').textContent}. ${scene.fighters[1].name}: ${scene.fighters[1].hp} health, ${moveLabel(views[1])}, ${$('gear-1').textContent}. ${motionLabel??stageLabel}. ${inspectTime!==null?reviewLabel:paused?'Paused':match.status || match.phase}.`;
  if (label !== arenaLabel) {canvas.setAttribute('aria-label',label);arenaLabel=label;}
  const state = motionLabel??(inspectTime!==null?reviewLabel:paused ? 'Paused — press P to resume.' : match.phase==='fight'&&performance.now()<weaponFeedbackUntil?weaponFeedback:match.status || 'Fight');
  if (state !== statusText) {$('fight-status').textContent=state;statusText=state;}
}

function reset(start=true) {
  if (!ready) return;
  clearInput();effects.clear();paused=false;accumulator=0;inspectTime=null;motionTime=null;weaponFeedback='';weaponFeedbackUntil=0;
  previousTravelViews=null;previousTravelPhase=null;
  $('deletion-review').hidden=true;$('motion-review').hidden=true;
  match=createMatch({mode:$('mode-select').value,clips:metadata,fighters:art.map(f=>({id:f.manifest.id,name:f.manifest.character,height:f.manifest.height})),start});
  $('pause-fight').textContent='Pause';$('pause-fight').setAttribute('aria-pressed','false');
  $('start-fight').textContent=match.phase === 'ready' ? 'Start fight' : 'Fight again';
  $('frame-link').hidden=true;
  dispatchEvents();
  draw();
}

async function start() {
  if (!ready) return;
  await effects.startAudio();
  reset(true);
  canvas.focus({preventScroll:true});
}

function togglePause() {
  if (!ready || inspectTime!==null || motionTime!==null || match.phase === 'ready') return;
  paused=!paused;clearInput();accumulator=0;
  $('pause-fight').textContent=paused?'Resume':'Pause';
  $('pause-fight').setAttribute('aria-pressed',String(paused));
  draw();
}

function action(index,name) {
  if (!ready || paused || inspectTime!==null || motionTime!==null || (index === 1 && match.mode !== 'local')) return;
  performAction(match,index,name,controls()[index]);
  dispatchEvents();
  draw();
}

function attackCommands(commands) {
  if(!commands.length||!ready||paused||inspectTime!==null||motionTime!==null)return;
  for(const command of commands) {
    if(command.index===1&&match.mode!=='local')continue;
    performAction(match,command.index,command.action,command.inputSnapshot);
  }
  dispatchEvents();draw();
}

function queueAttack(index,name,key,repeat=false) {
  if(!ready||paused||inspectTime!==null||motionTime!==null)return;
  attackCommands(pressAttackInput(attackInputs,{index,action:name,key,time:performance.now(),repeat,
    inputSnapshot:{...controls()[index],airborne:!!match.fighters[index]._jump}}));
}

function controls() {
  const down=key=>held.has(key);
  return [
    {move:Number(down('KeyD')||virtual.has('right')||(tapMove===1&&performance.now()<tapUntil))-Number(down('KeyA')||virtual.has('left')||(tapMove===-1&&performance.now()<tapUntil)),crouch:down('KeyS')||virtual.has('crouch')||latched.has('crouch'),block:down('Space')||virtual.has('block')||latched.has('block')},
    {move:Number(down('ArrowRight'))-Number(down('ArrowLeft')),crouch:down('ArrowDown'),block:down('Digit0')||down('Numpad0')},
  ];
}

const keyActions = {KeyU:[0,'punch'],KeyI:[0,'kick'],KeyJ:[0,'low-punch'],KeyK:[0,'low-kick'],KeyW:[0,'jump'],KeyL:[0,'grab'],KeyF:[0,'deletion'],ArrowUp:[1,'jump'],Digit7:[1,'punch'],Numpad7:[1,'punch'],Digit8:[1,'kick'],Numpad8:[1,'kick'],Digit4:[1,'low-punch'],Numpad4:[1,'low-punch'],Digit5:[1,'low-kick'],Numpad5:[1,'low-kick'],Digit6:[1,'grab'],Numpad6:[1,'grab'],Digit1:[1,'punch'],Numpad1:[1,'punch'],Digit2:[1,'kick'],Numpad2:[1,'kick'],Digit3:[1,'grab'],Numpad3:[1,'grab'],Enter:[1,'deletion']};
window.addEventListener('keydown',event=>{
  if (event.target.closest?.('input,select,textarea') || !watchedKeys.has(event.code)) return;
  // Space and Enter keep their normal behavior on buttons; the arena owns fighting keys.
  if (['Enter','Space'].includes(event.code) && event.target.closest?.('button,a')) return;
  event.preventDefault();
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
window.addEventListener('keyup',event=>{held.delete(event.code);releaseAttackInput(attackInputs,event.code);});
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{
  clearInput();last=performance.now();accumulator=0;
  if (document.hidden && ready && !paused && !['ready','over'].includes(match.phase)) togglePause();
});

document.querySelectorAll('[data-action]').forEach(button=>{
  const name=button.dataset.action,key='screen-'+name;
  if(attackButtons.has(name)) {
    let pointerHandled=false;
    button.addEventListener('pointerdown',event=>{pointerHandled=true;queueAttack(0,name,key);button.setPointerCapture(event.pointerId);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>releaseAttackInput(attackInputs,key));
    button.addEventListener('click',event=>{if(!pointerHandled||event.detail===0)queueAttack(0,name,key);pointerHandled=false;releaseAttackInput(attackInputs,key);canvas.focus({preventScroll:true});});
  } else button.addEventListener('click',()=>{action(0,name);canvas.focus({preventScroll:true});});
});
document.querySelectorAll('[data-hold]').forEach(button=>{
  let pressedAt=0,heldFor=0;
  const kind=button.dataset.hold,toggle=['crouch','block'].includes(kind);
  if(toggle)button.setAttribute('aria-pressed','false');
  const release=()=>{heldFor=performance.now()-pressedAt;virtual.delete(kind);button.classList.toggle('is-held',latched.has(kind));};
  button.addEventListener('pointerdown',event=>{
    if (!ready || paused) return;
    event.preventDefault();pressedAt=performance.now();button.setPointerCapture(event.pointerId);virtual.add(kind);button.classList.add('is-held');
  });
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  button.addEventListener('click',event=>{
    if(!ready || paused || (event.detail!==0&&heldFor>=200))return;
    if(toggle) {
      if(latched.has(kind))latched.delete(kind);else latched.add(kind);
      button.setAttribute('aria-pressed',String(latched.has(kind)));button.classList.toggle('is-held',latched.has(kind));
    } else {
      const direction=kind==='right'?1:-1,now=performance.now();
      tapUntil=Math.min((tapMove===direction?Math.max(now,tapUntil):now)+180,now+1200);tapMove=direction;
    }
    canvas.focus({preventScroll:true});
  });
});
$('start-fight').addEventListener('click',start);
$('restart-fight').addEventListener('click',start);
$('pause-fight').addEventListener('click',togglePause);
$('mode-select').addEventListener('change',()=>reset(false));
$('mute-fight').addEventListener('click',()=>{
  muted=!muted;effects.setMuted(muted);
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

function tick(now) {
  const delta=Math.min(100,Math.max(0,now-last));last=now;
  if (ready && !paused && inspectTime===null && motionTime===null) {
    attackCommands(flushAttackInputs(attackInputs,now));
    accumulator+=delta;
    while (accumulator >= 1000/60) {
      previousTravelViews=match.fighters.map((_,index)=>getFighterView(match,index));previousTravelPhase=match.phase;
      advanceMatch(match,1000/60,controls());
      dispatchEvents();
      effects.update(1000/60);accumulator-=1000/60;
    }
  }
  draw();requestAnimationFrame(tick);
}

async function boot() {
  const revision=++loadRevision;
  ready=false;clearInput();effects.clear();inspectTime=null;motionTime=null;$('deletion-review').hidden=true;$('motion-review').hidden=true;$('load-status').classList.remove('error');
  for(const id of ['start-fight','restart-fight','pause-fight','inspect-deletion','inspect-motion','save-fight-frame'])$(id).disabled=true;
  try {
    const options={bundle:window.SYSTEM_CLASH_FIGHT_BUNDLE,baseURL:new URL('.',location.href)};
    const nextArt=await loadFightArt({...options,ids:[$('fighter-one').value,$('fighter-two').value],onProgress:(count,total)=>{if(revision===loadRevision)$('load-status').textContent=`Loading fighters · ${count} / ${total} actions`;}});
    await loadArcadeArt({...options,art:nextArt});
    const nextProp=await loadDeletionArt({...options,art:nextArt});
    const nextWeaponArt=await loadWeaponArt(options);
    if(revision!==loadRevision)return;
    art=nextArt;deletionProp=nextProp;weaponArt=nextWeaponArt;
    renderer.prepareArt(art);metadata=combatMetadata(art,weaponArt);ready=true;
    showContextArtLinks();
    showFighterStyles();
    document.querySelectorAll('button').forEach(button=>button.disabled=false);
    $('load-status').textContent=art.map(f=>f.manifest.character).join(' / ')+' ready · distinct styles / combos / Deletions';
    $('arena-title').textContent=art[0].manifest.character+' vs. '+art[1].manifest.character;
    $('player-one-label').textContent='PLAYER ONE / '+art[0].manifest.character.toUpperCase();
    $('player-two-label').textContent='PLAYER TWO / '+art[1].manifest.character.toUpperCase();
    const definition=deletionDefinition(art[0].manifest.id);
    $('inspect-deletion').disabled=!definition;
    document.querySelectorAll('[data-action="deletion"]').forEach(button=>button.disabled=!definition);
    $('pose-preset').options[0].textContent=definition?definition.name+' sequence':'Signature Deletion pending';
    $('deletion-scrub').max=String((definition?.duration??6500)-1);
    reset(false);
  } catch (error) {
    if(revision===loadRevision){$('load-status').textContent=error.message;$('load-status').classList.add('error');}
  }
}

$('fighter-one').addEventListener('change',boot);
$('fighter-two').addEventListener('change',boot);
$('inspect-deletion').addEventListener('click',()=>{
  if(!ready||!deletionDefinition(art[0].manifest.id))return;
  clearInput();motionTime=null;$('motion-review').hidden=true;inspectTime=deletionDefinition(art[0].manifest.id).beats.pressure??3100;$('pose-preset').value='broadcast';$('deletion-review').hidden=false;$('deletion-scrub').value=String(inspectTime);draw();
});
$('deletion-scrub').max=String(BROADCAST_CUT.duration-1);
$('deletion-scrub').addEventListener('input',()=>{inspectTime=Number($('deletion-scrub').value);draw();});
$('pose-preset').addEventListener('change',()=>draw());
$('return-fight').addEventListener('click',()=>{inspectTime=null;clearInput();$('deletion-review').hidden=true;draw();});
$('deletion-facing').addEventListener('change',draw);
function syncMotionClip() {
  if(!ready||motionTime===null)return;
  const duration=art[0].clips[$('motion-clip').value]?.timeline.duration??1;
  $('motion-scrub').max=String(Math.max(0,duration-1));
  motionTime=Math.min(motionTime,duration-1);$('motion-scrub').value=String(motionTime);draw();
}
$('inspect-motion').addEventListener('click',()=>{
  if(!ready)return;
  clearInput();inspectTime=null;$('deletion-review').hidden=true;
  motionTime=0;$('motion-review').hidden=false;syncMotionClip();
});
$('motion-clip').addEventListener('change',()=>{motionTime=0;if($('motion-clip').value==='pickup'&&$('motion-weapon').value==='none')$('motion-weapon').value='neural-spike';syncMotionClip();});
$('motion-scrub').addEventListener('input',()=>{motionTime=Number($('motion-scrub').value);draw();});
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
    for(const id of ['fighter-one','fighter-two']) {
      const select=$(id),previous=select.value;select.replaceChildren();
      for(const fighter of roster){const option=document.createElement('option');option.value=fighter.id;option.textContent=fighter.name;select.append(option);}
      select.value=roster.some(f=>f.id===previous)?previous:roster[id==='fighter-two'?Math.min(1,roster.length-1):0].id;
    }
    $('roster-label').textContent=roster.length+' PLAYABLE MAIN FIGHTERS / ARCADE PROTOTYPE';
    $('styles-title').textContent=roster.length+' ways to clash.';
    $('roster-footer').textContent='PLAYABLE PROTOTYPE · '+roster.length+' MAIN FIGHTERS';
    $('deletion-count').textContent=roster.filter(f=>deletionDefinition(f.id)).length+' SIGNATURE DELETIONS';
    const finishes=$('deletion-summary');finishes.replaceChildren();
    for(const fighter of roster){const definition=deletionDefinition(fighter.id),line=document.createElement('span');line.textContent=fighter.name+' · '+(definition?.name??'Signature Deletion pending');finishes.append(line,document.createElement('br'));}
    await boot();
  } catch(error){$('load-status').textContent=error.message;$('load-status').classList.add('error');}
}
initializeRoster();requestAnimationFrame(tick);
