import {createGameMusic} from './game-music.mjs';
import {normalizeMatchRules,loadMatchRules,loadClashPreferences,matchRulesFromURL} from './fight-rules.mjs';
import {createGameScreenHost} from './game-screen-host.mjs';
import {ONLINE_SCOPE,ONLINE_STAGES,createFrameCoordinator,createFrameRouter,validPayload} from './online-protocol.mjs';
import {createOnlineConnection} from './online-connection.mjs';
import {createGamepadInput} from './fight-gamepad.mjs';
import {controllerSeatsFromURL,withControllerSeats,resolveInterfaceSettings,demoRoster} from './demo-flow.mjs';
const ENDPOINT='/api/games/system-clash/rooms';
export function createRoomClient({fetch=globalThis.fetch,endpoint=ENDPOINT}={}){
 let seat=null;
 async function call(options){let response;try{response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(10000),...options});}catch{throw new Error('Sessions are unavailable right now. Solo and Two players still work.');}let result;try{result=await response.json();}catch{throw new Error('The session service returned an unreadable response.');}if(!response.ok)throw new Error(typeof result?.error==='string'?result.error.slice(0,240):'The session request failed.');return result;}
 return {setSeat(value){seat=value;},releaseSeat(value){return call({method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+value.token},body:JSON.stringify({action:'leave',code:value.code})});},list(){return call({method:'GET'});},request(action,fields={}){const authenticated=!!seat&&!['create','join'].includes(action);return call({method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+seat.token}:{})},body:JSON.stringify({action,...(authenticated?{code:seat.code}:{}),...fields})});},leaveOnUnload(){if(!seat)return;try{fetch(endpoint,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+seat.token},body:JSON.stringify({action:'leave',code:seat.code})}).catch(()=>{});}catch{}}};
}
export function onlineFightURL(base,seat,state,settings={}){
 const url=new URL('fight.html',base),params={demo:'1',mode:'local',online:'1',seat:seat.role==='guest'?'1':'0',p1:state.host.fighter,p2:state.guest.fighter,name1:state.host.name??'Host',name2:state.guest.name??'Guest',sound:settings.muted?'0':'1',motion:settings.reducedMotion?'1':'0',musicStyle:normalizeMatchRules({musicStyle:settings.musicStyle}).musicStyle};
 for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
 url.searchParams.set('stage',ONLINE_STAGES.includes(settings.stage)?settings.stage:'radio-studio');
 return withControllerSeats(url,settings.controllerSeats);
}
export function onlineMenuURL(base,settings={}){
 const url=new URL('index.html',base);for(const [key,value] of Object.entries({musicStyle:normalizeMatchRules({musicStyle:settings.musicStyle}).musicStyle,sound:settings.muted?'0':'1',motion:settings.reducedMotion?'1':'0'}))url.searchParams.set(key,value);
 return withControllerSeats(url,settings.controllerSeats);
}
/** Lobby authority is explicit; this class never advances the fight engine. */
export function createOnlineSession({seat,roomState,peer,settings={},postFrame=()=>{},loadFrame=()=>{},onStatus=()=>{},onMatchPhase=()=>{},onEnd=()=>{},timers=globalThis}){
 let matchId=1,frameLoaded=false,started=false,ended=false,setup=false,phase='ready',pendingStart=null,startTimer=null;
 const host=seat.role==='host';
 const coordinator=createFrameCoordinator({onStart:packet=>{if(!host||ended)return;pendingStart=packet;peer.send(packet);timers.clearTimeout(startTimer);startTimer=timers.setTimeout(()=>end('The other player did not start the match. Leave this session and try again.'),8000);onStatus('Waiting for the other player to start…');}});
 function rememberPhase(packet){if(packet.type==='snapshot'&&['ready','countdown','fight','finish','deletion','over'].includes(packet.snapshot?.state?.phase)){phase=packet.snapshot.state.phase;onMatchPhase(phase);}}
 function load(){timers.clearTimeout(startTimer);pendingStart=null;frameLoaded=false;started=false;phase='ready';onMatchPhase(phase);loadFrame(matchId,settings);onStatus('Loading both fighters…');}
 function restart(){if(!host||ended||!started||phase!=='over')return;matchId=coordinator.reset();peer.setMatchId(matchId);peer.send({type:'rematch',matchId});load();}
 function end(reason){if(ended)return;ended=true;started=false;pendingStart=null;timers.clearTimeout(startTimer);postFrame({type:'leave'});onEnd(reason);}
 return {get matchId(){return matchId;},connected(){if(ended||setup)return;peer.setMatchId(matchId);if(host){setup=true;peer.send({type:'setup',...(settings.stage?{stage:settings.stage}:{})});load();}else onStatus('Connected. Waiting for the host’s arena…');},receiveFrame(packet){
  if(ended||!validPayload(packet))return;
  if(packet.type==='loaded'){if(frameLoaded)return;frameLoaded=true;peer.send(packet);if(host)coordinator.loaded('local');else onStatus('Ready. Waiting for both fighters…');return;}
  if(packet.type==='leave'){peer.send(packet);end('You left the match.');return;}
  if(packet.type==='rematch'){if(phase==='over'){if(host)restart();else peer.send({type:'rematch'});}return;}
  if(packet.type==='started'&&!host&&pendingStart&&packet.matchId===matchId&&!started){pendingStart=null;started=true;peer.send(packet);onStatus('Clash!');return;}
  if(!started)return;
  if(['action','input'].includes(packet.type)){if(!host)peer.send(packet);return;}
  if(packet.type==='pause'){if(!host&&!packet.paused)return;postFrame(packet);peer.send(packet);onStatus(packet.paused?'Paused by a player.':'Clash!');return;}
  if(host&&['snapshot','events'].includes(packet.type)){rememberPhase(packet);peer.send(packet);}
 },receivePeer(packet){
  if(ended||!validPayload(packet))return;
  if(packet.type==='leave'){end('The other player left.');return;}
  if(packet.type==='setup'&&!host&&!setup){setup=true;settings.stage=packet.stage;load();return;}
  if(packet.type==='loaded'){if(host)coordinator.loaded('remote');return;}
  if(packet.type==='rematch'){if(host){if(packet.matchId===undefined)restart();}else if(packet.matchId===matchId+1){matchId=packet.matchId;peer.setMatchId(matchId);load();}return;}
  if(packet.type==='start'&&!host&&frameLoaded&&!started&&!pendingStart&&packet.matchId===matchId){pendingStart=packet;postFrame(packet);onStatus('Starting your fighter…');return;}
  if(packet.type==='started'&&host&&pendingStart&&packet.matchId===matchId&&!started){const start=pendingStart;pendingStart=null;timers.clearTimeout(startTimer);started=true;postFrame(start);onStatus('Clash!');return;}
  if(!started)return;
  if(packet.type==='pause'){if(host&&!packet.paused)return;postFrame(packet);if(host)peer.send(packet);onStatus(packet.paused?'Paused by a player.':'Clash!');return;}
  if((host&&['action','input'].includes(packet.type))||(!host&&['snapshot','events'].includes(packet.type))){if(!host)rememberPhase(packet);postFrame(packet);}
 },end,destroy(){ended=true;started=false;pendingStart=null;timers.clearTimeout(startTimer);}};
}
export function nextLobbyFocus(items,current,key,columns=1){
 const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[key];
 if(!delta||!items.length)return null;
 if(current<0||current>=items.length)return items[0];
 return items[(current+delta+items.length)%items.length];
}
export async function mountOnlineLobby({document=globalThis.document,window=globalThis.window,fetch=globalThis.fetch}={}){
 const screenHost=createGameScreenHost({window,document,onSuspend:()=>unload()});
 const $=id=>document.getElementById(id),client=createRoomClient({fetch}),launch=new URL(window.location.href);
 const settings={musicStyle:matchRulesFromURL(launch.href,loadMatchRules(window.localStorage)).musicStyle,...resolveInterfaceSettings(launch,{prefersReducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches}),controllerSeats:controllerSeatsFromURL(launch.href),stage:ONLINE_STAGES.includes(launch.searchParams.get('stage'))?launch.searchParams.get('stage'):'radio-studio'};
 const menuLinks=[...document.querySelectorAll('a[href="index.html"]')].filter(link=>link.tagName==='A');for(const link of menuLinks){link.href=onlineMenuURL(launch,settings).href;link.addEventListener('click',event=>{event.preventDefault();screenHost.navigate(onlineMenuURL(launch,settings));});}
 const music=createGameMusic({window,document,muted:settings.muted});music.setScene({screen:'online'});music.setPaused(!document.hasFocus());
 const blur=()=>music.setPaused(true),focus=()=>music.setPaused(false);window.addEventListener('blur',blur);window.addEventListener('focus',focus);
 const pads=createGamepadInput({seats:settings.controllerSeats});
 let seat=null,state=null,peer=null,session=null,roster=[],busy=false,pollTimer=null,listTimer=null,expiryTimer=null,epoch=0,pollErrors=0,destroyed=false,connected=false,stopped=false,listing=false,suspended=false,raf=null,pendingJoinCode=null,pendingEntry=null;
 const status=(text,kind='info')=>{$('online-status').textContent=text==='Clash!'&&peer?.transport==='relay'?'Clash! · Cloud connection':text;$('online-status').setAttribute('data-kind',kind);};
 $('stage-choice').value=settings.stage;$('sound-setting').checked=!settings.muted;$('motion-setting').checked=settings.reducedMotion;
 const buttons=()=>[...document.querySelectorAll('button,input,a[href],select')].filter(el=>!el.disabled&&!el.closest('[hidden]'));
 function renderEntry(){
  const disabled=busy||!roster.length;
  $('entry-panel').setAttribute('aria-busy',String(busy));
  for(const id of ['create-room','join-room'])$(id).disabled=disabled;
  for(const id of ['screen-name','join-code'])$(id).disabled=busy;
  $('refresh-rooms').disabled=busy||listing;
  $('create-room').textContent=pendingEntry==='create'?'Creating session…':'Create new session →';
  $('join-room').textContent=pendingEntry==='join'?'Joining…':pendingJoinCode?'Join '+pendingJoinCode:'Join session';
  for(const button of $('room-list').querySelectorAll('button')){button.disabled=disabled;button.setAttribute('aria-pressed',String(button.dataset.code===pendingJoinCode));}
 }
 function chooseJoin(code){pendingJoinCode=code;$('join-code').value=code;renderEntry();}
 function clearTimers(){window.clearTimeout(pollTimer);window.clearTimeout(listTimer);window.clearTimeout(expiryTimer);}
 function stop(reason){if(stopped)return;stopped=true;busy=false;++epoch;clearTimers();if(seat)client.request('leave').catch(()=>{});peer?.close();peer=null;connected=false;session?.end(reason);$('fight-frame').hidden=true;$('fight-frame').src='about:blank';$('match-actions').hidden=true;$('ready-button').disabled=true;$('ready-button').textContent='Connection ended';$('ready-button').setAttribute('aria-label','Connection ended');$('ready-button').setAttribute('aria-pressed','false');$('players').textContent='Connection ended. Leave this session to try again.';$('fighter-grid').setAttribute('aria-disabled','true');if(!destroyed&&!suspended){music.resume();music.setScene({screen:'online'});}status(reason);}
 function resetRoom(){
  ++epoch;clearTimers();postFrame({type:'leave'});peer?.send({type:'leave'});peer?.close();peer=null;session?.destroy();session=null;client.setSeat(null);seat=null;state=null;connected=false;stopped=false;busy=false;pollErrors=0;pendingJoinCode=null;pendingEntry=null;pads.reset();
  try{window.sessionStorage.removeItem('system-clash-online-seat');}catch{}
  $('room-panel').hidden=true;$('entry-panel').hidden=false;$('fight-frame').hidden=true;$('fight-frame').src='about:blank';$('match-actions').hidden=true;$('fighter-grid').removeAttribute('aria-disabled');$('stage-choice').disabled=false;$('ready-button').disabled=!roster.length;$('create-room').disabled=!roster.length;$('join-room').disabled=!roster.length;
  for(const button of $('fighter-grid').querySelectorAll('button'))button.disabled=roster.find(f=>f.id===button.dataset.fighter)?.enabled!==true;
  $('join-code').value='';renderEntry();if(!destroyed&&!suspended){music.resume();music.setScene({screen:'online'});}status('Choose a screen name, then create or join a session.');
 }
 async function leave(){if(busy||destroyed||suspended)return;const previous=seat;resetRoom();const revision=epoch;refreshRooms();try{if(previous)await client.releaseSeat(previous);}catch(error){if(revision===epoch&&!destroyed&&!suspended&&!seat)status(error.message);}}
 function renderSeat(){if(!seat)return;if(!state){
  $('room-code').textContent=seat.code;$('seat-label').textContent=seat.role==='host'?'You host this session':'You joined this session';$('players').textContent='Loading players…';$('selected-fighter').textContent='Loading fighter…';
  $('ready-button').disabled=true;$('ready-button').textContent='Loading session…';$('ready-button').setAttribute('aria-label','Loading session.');$('ready-button').setAttribute('aria-pressed','false');$('stage-choice').disabled=true;
  for(const button of $('fighter-grid').querySelectorAll('button'))button.disabled=true;
  status('Loading your session…');return;
 }const own=state[seat.role],other=state[seat.role==='host'?'guest':'host'];$('room-code').textContent=seat.code;$('seat-label').textContent=(seat.role==='host'?'You host this session':'You joined this session')+(peer?.transport==='relay'?' · Cloud connection':'');$('players').textContent=state.host.name+' · '+(state.host.ready?'Ready':'Choosing')+' / '+(state.guest?state.guest.name+' · '+(state.guest.ready?'Ready':'Choosing'):'Waiting for another player');$('selected-fighter').textContent=roster.find(f=>f.id===own.fighter)?.name??own.fighter;$('ready-button').textContent=own.ready?'Ready ✓':'Ready to clash';$('ready-button').setAttribute('aria-pressed',String(own.ready));$('ready-button').setAttribute('aria-label',own.ready?peer||busy?'You are ready.':'You are ready. Press to cancel readiness.':'Ready to clash');$('ready-button').disabled=busy||!!peer;$('stage-choice').disabled=seat.role!=='host'||!!peer;for(const button of $('fighter-grid').querySelectorAll('button')){button.setAttribute('aria-pressed',String(button.dataset.fighter===own.fighter));button.disabled=busy||!!peer||roster.find(f=>f.id===button.dataset.fighter)?.enabled!==true;}if(!peer)status(other?(own.ready&&other.ready?'Both ready. Connecting…':'Choose your fighter, then press Ready.'):'Room '+seat.code+' is open. Share its code or wait for a player.');}
 function postFrame(payload){const frame=$('fight-frame');if(!frame.contentWindow||!session)return;frame.contentWindow.postMessage({scope:ONLINE_SCOPE,matchId:session.matchId,payload},launch.origin);if(payload.type==='start'){frame.focus();frame.contentWindow.focus?.();frame.scrollIntoView?.({block:'start',behavior:settings.reducedMotion?'auto':'smooth'});}}
 function loadFrame(matchId,chosenSettings){music.suspend();$('stage-choice').value=chosenSettings.stage??'radio-studio';const url=onlineFightURL(launch.href,seat,state,chosenSettings);url.searchParams.set('matchId',String(matchId));$('fight-frame').src=url.href;$('fight-frame').hidden=false;$('match-actions').hidden=false;$('rematch-button').disabled=true;}
 function connect(){if(stopped||peer||!state?.guest||!state.host.ready||!state.guest.ready)return;const revision=epoch;peer=createOnlineConnection({role:seat.role,room:seat.code,RTCPeerConnection:window.RTCPeerConnection,onPacket:packet=>{if(revision===epoch)session?.receivePeer(packet);},sendSignal:description=>client.request('signal',{description}),sendCandidates:value=>client.request('candidates',value),relayRequest:value=>client.request('relay',value),onStatus:value=>{if(revision!==epoch)return;if(value==='connected'){connected=true;session?.connected();status(peer?.transport==='relay'?'Cloud connection. Loading the match…':'Connected. Loading the match…');}else if(value==='connecting')status('Connecting players…');else if(value==='relaying')status('Connecting through cloud…');else if(value==='retrying')status('Retrying the direct connection…');},onDisconnect:reason=>{if(revision===epoch)stop(reason);}});session=createOnlineSession({seat,roomState:state,peer,settings,postFrame,loadFrame,onStatus:status,onMatchPhase:phase=>{$('rematch-button').disabled=phase!=='over';},onEnd:reason=>{if(revision===epoch)stop(reason);},timers:window});renderSeat();if(seat.role==='host')peer.start();}
 async function poll(revision){if(destroyed||revision!==epoch||!seat)return;try{const result=await client.request('poll');if(revision!==epoch)return;state=result;pollErrors=0;if(seat.role==='host'&&connected&&!result.guest){stop('The other player left. Leave this room to create a new session.');return;}renderSeat();connect();if(result.relay&&peer&&!connected)peer.useRelay();if(result.candidates?.length&&peer)await peer.receiveCandidates({generation:result.generation,candidates:result.candidates});if(result.description&&peer)await peer.receiveDescription(result.description);}catch(error){if(revision!==epoch)return;pollErrors++;status(error.message);if(pollErrors>=3){stop('Session service lost contact. Leave this room and try again.');return;}}if(revision===epoch&&seat)pollTimer=window.setTimeout(()=>poll(revision),connected?15000:1500);}
 async function enter(action,code){
  if(busy||seat||destroyed||suspended)return;
  if(action==='join'){
   code=typeof code==='string'?code.trim().toUpperCase():'';
   if(!/^[A-Z0-9]{6}$/.test(code)){status('Enter a six-character session code, or choose an open session.','error');$('join-code').focus();return;}
   chooseJoin(code);
  }else{pendingJoinCode=null;renderEntry();}
  const name=$('screen-name').value.trim();
  if(!name||Array.from(name).length>24){status(action==='join'?'Enter your screen name to join '+code+', then press Join.':'Enter a screen name using 1–24 characters.','error');$('screen-name').focus();return;}
  const revision=++epoch;busy=true;pendingEntry=action;window.clearTimeout(listTimer);renderEntry();status(action==='join'?'Joining session '+code+'…':'Creating a new session…','pending');
  try{
   const result=await client.request(action,{name,...(action==='join'?{code}:{})});
   if(typeof result?.token!=='string'||!result.token||!['host','guest'].includes(result.role)||!/^[A-Z0-9]{6}$/.test(result.code))throw new Error('The session service returned an invalid seat.');
   if(result.role!==(action==='join'?'guest':'host')||(action==='join'&&result.code!==code)||!Number.isFinite(result.expiresAt)){
    void client.releaseSeat(result).catch(()=>{});throw new Error(action==='join'?'Could not join the requested session. Please try again.':'Could not create your session. Please try again.');
   }
   if(destroyed||suspended||revision!==epoch){void client.releaseSeat(result).catch(()=>{});return;}
   seat=result;client.setSeat(seat);try{window.sessionStorage.setItem('system-clash-online-seat',JSON.stringify(seat));}catch{}
   window.clearTimeout(listTimer);$('entry-panel').hidden=true;$('room-panel').hidden=false;renderSeat();expiryTimer=window.setTimeout(()=>stop('This 20-minute session expired. Leave it and create another.'),Math.max(0,result.expiresAt-Date.now()));busy=false;await poll(revision);
  }catch(error){if(!destroyed&&!suspended&&revision===epoch)status(error.message,'error');}
  finally{if(!destroyed&&!suspended&&revision===epoch){busy=false;pendingEntry=null;renderEntry();if(!seat)refreshRooms();}}
 }
 async function refreshRooms(){
  if(listing||busy||destroyed||suspended||seat)return;
  const revision=epoch;listing=true;window.clearTimeout(listTimer);const list=$('room-list');list.setAttribute('aria-busy','true');renderEntry();
  try{
   const result=await client.list();if(destroyed||suspended||seat||revision!==epoch)return;list.replaceChildren();
   const rooms=(Array.isArray(result.rooms)?result.rooms:[]).filter(room=>/^[A-Z0-9]{6}$/.test(room?.code)).slice(0,20);
   if(!rooms.length){const empty=document.createElement('p');empty.className='empty-rooms';empty.textContent='No hosts are waiting. Create a new session, or join with a code.';list.append(empty);}
   for(const room of rooms){
    const button=document.createElement('button');button.type='button';button.className='room-row';button.dataset.code=room.code;
    const hostName=String(room.hostName??'Player').slice(0,24),label=document.createElement('strong');label.textContent=hostName;
    const code=document.createElement('span');code.textContent='Join '+room.code;button.setAttribute('aria-label','Join '+hostName+'’s session '+room.code);
    button.append(label,code);button.addEventListener('click',()=>enter('join',room.code));list.append(button);
   }
  }catch(error){if(destroyed||suspended||seat||revision!==epoch)return;list.replaceChildren();const empty=document.createElement('p');empty.className='empty-rooms room-list-error';empty.textContent=error.message;list.append(empty);}
  finally{listing=false;list.setAttribute('aria-busy','false');if(!destroyed&&!suspended){renderEntry();if(!seat&&!busy)listTimer=window.setTimeout(refreshRooms,revision===epoch?5000:0);}}
 }
 function currentSeatRequest(revision,previous){return !destroyed&&!suspended&&revision===epoch&&seat===previous;}
 async function choose(id){
  if(stopped||busy||peer||!seat||!state||destroyed||suspended||!roster.some(f=>f.id===id&&f.enabled===true))return;
  const previous=seat,revision=epoch;busy=true;
  try{await client.request('select',{fighter:id,ready:false});if(currentSeatRequest(revision,previous)&&state)state[previous.role]={...state[previous.role],fighter:id,ready:false};}
  catch(error){if(currentSeatRequest(revision,previous))status(error.message);}
  finally{if(currentSeatRequest(revision,previous)){busy=false;renderSeat();}}
 }
 $('create-room').addEventListener('click',()=>enter('create'));$('join-form').addEventListener('submit',event=>{event.preventDefault();enter('join',$('join-code').value);});$('entry-form').addEventListener('submit',event=>{event.preventDefault();if(pendingJoinCode)enter('join',pendingJoinCode);else{status('Choose an open session or enter its code to join. Use Create new session to host.');$('create-room').focus();}});$('refresh-rooms').addEventListener('click',refreshRooms);$('leave-room').addEventListener('click',leave);
 $('ready-button').addEventListener('click',async()=>{
  if(busy||peer||!state||!seat||destroyed||suspended)return;
  const previous=seat,revision=epoch,own=state[previous.role],nextReady=!own.ready;busy=true;
  try{await client.request('select',{fighter:own.fighter,ready:nextReady});if(currentSeatRequest(revision,previous)&&state)state[previous.role]={...state[previous.role],fighter:own.fighter,ready:nextReady};}
  catch(error){if(currentSeatRequest(revision,previous))status(error.message);}
  finally{if(currentSeatRequest(revision,previous)){busy=false;renderSeat();connect();}}
 });
 $('join-code').addEventListener('input',()=>{const code=$('join-code').value.trim().toUpperCase();pendingJoinCode=/^[A-Z0-9]{6}$/.test(code)?code:null;renderEntry();});
 $('rematch-button').addEventListener('click',()=>session?.receiveFrame({type:'rematch'}));$('sound-setting').addEventListener('change',()=>{settings.muted=!$('sound-setting').checked;music.setMuted(settings.muted);if(!settings.muted)void music.unlock();});$('motion-setting').addEventListener('change',()=>{settings.reducedMotion=$('motion-setting').checked;});$('stage-choice').addEventListener('change',()=>{settings.stage=$('stage-choice').value||undefined;});
 function moveFocus(key){const active=document.activeElement,cards=[...$('fighter-grid').querySelectorAll('button')].filter(button=>!button.disabled);if(cards.includes(active)){const columns=window.getComputedStyle($('fighter-grid')).gridTemplateColumns.split(' ').filter(Boolean).length;nextLobbyFocus(cards,cards.indexOf(active),key,columns)?.focus();return;}const available=buttons();nextLobbyFocus(available,available.indexOf(active),key)?.focus();}
 const keydown=event=>{if(!$('fight-frame').hidden||event.target?.closest?.('input,select,textarea'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code)){event.preventDefault();moveFocus(event.code);}else if(event.code==='Escape'&&seat){event.preventDefault();leave();}};window.addEventListener('keydown',keydown);
 const router=createFrameRouter({origin:launch.origin,source:()=>$('fight-frame').contentWindow,matchId:()=>session?.matchId,onPacket:packet=>session?.receiveFrame(packet)});window.addEventListener('message',router);
 const unload=()=>{suspended=true;music.suspend();client.leaveOnUnload();resetRoom();window.cancelAnimationFrame(raf);raf=null;};window.addEventListener('pagehide',unload);
 const restore=()=>{if(destroyed||!suspended)return;suspended=false;music.resume();pads.reset();if(roster.length){refreshRooms();if(raf===null)raf=window.requestAnimationFrame(menuTick);}};window.addEventListener('pageshow',restore);
 const menuTick=now=>{if(destroyed||suspended)return;if($('fight-frame').hidden){let devices=[];try{devices=window.navigator.getGamepads?.()??[];}catch{}const sample=pads.sample(devices,now,{context:'menu',active:document.hasFocus()&&!document.hidden});settings.controllerSeats=pads.seatIndices();for(const event of sample.events){if(event.type==='navigate'){moveFocus(event.action);}else if(event.type==='press'){void music.unlock();if(event.action==='confirm'){const focused=document.activeElement;if(focused?.tagName==='BUTTON')focused.click();else if(seat&&!peer)$('ready-button').click();}else if(event.action==='back'){if(seat)leave();else screenHost.navigate(withControllerSeats(new URL('index.html',launch),settings.controllerSeats));}else if(event.action==='random'&&seat&&!peer&&roster.length)choose(roster[Math.floor(Math.random()*roster.length)].id);}}}raf=window.requestAnimationFrame(menuTick);};
 try{const response=await fetch(new URL('assets/menu/roster.json',launch),{cache:'no-cache'});if(!response.ok)throw new Error('Fighter selection is unavailable.');const data=await response.json();let corporateUnlocked=false;try{corporateUnlocked=loadClashPreferences(window.localStorage).corporateUnlocked;}catch{}roster=Array.isArray(data.fighters)?demoRoster(data.fighters.filter(f=>/^[a-z0-9-]{1,40}$/.test(f.id)).slice(0,19),{corporateUnlocked}):[];if(!roster.length)throw new Error('Fighter selection is unavailable.');for(const fighter of roster){const button=document.createElement('button');button.type='button';button.dataset.fighter=fighter.id;button.disabled=fighter.enabled!==true;button.className='fighter-card';if(button.disabled)button.setAttribute('aria-label',fighter.name+' — locked');button.setAttribute('aria-pressed','false');const image=document.createElement('img');image.src=new URL(fighter.portrait,launch).href;image.alt='';image.width=90;image.height=90;image.loading='lazy';const name=document.createElement('span');name.textContent=fighter.name;button.append(image,name);button.addEventListener('click',()=>choose(fighter.id));$('fighter-grid').append(button);}if(!destroyed&&!suspended){refreshRooms();raf=window.requestAnimationFrame(menuTick);}}catch(error){status(error.message);$('create-room').disabled=true;$('join-room').disabled=true;}
 return {destroy(){if(destroyed)return;destroyed=true;music.destroy();const previous=seat;resetRoom();if(previous)void client.releaseSeat(previous).catch(()=>{});window.cancelAnimationFrame(raf);raf=null;window.removeEventListener('keydown',keydown);window.removeEventListener('message',router);window.removeEventListener('pagehide',unload);window.removeEventListener('pageshow',restore);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);}};
}
if(globalThis.document?.getElementById('online-lobby'))mountOnlineLobby();
