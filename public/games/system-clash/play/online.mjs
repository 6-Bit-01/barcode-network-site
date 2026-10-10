import {compactTournamentBroadcast} from './fight-tournament-broadcast.mjs';
import {readTournamentLaunch,createTournamentRoomHandoff,tournamentReturnURL} from './online-tournament-session.mjs';
import {isSealedFighter,appendSealedFighterCard} from './sealed-fighter-card.mjs';
import {createGameMusic} from './game-music.mjs';
import {normalizeMatchRules,loadMatchRules,loadClashPreferences,matchRulesFromURL} from './fight-rules.mjs';
import {createGameScreenHost} from './game-screen-host.mjs';
import {bindGameScreenControls} from './game-screen-controls.mjs';
import {ONLINE_SCOPE,ONLINE_STAGES,createFrameCoordinator,createFrameRouter,validPayload,validSessionWins} from './online-protocol.mjs';
import {createOnlineConnection} from './online-connection.mjs';
import {DEFAULT_ICE_SERVERS} from './online-transport.mjs';
import {createGamepadInput} from './fight-gamepad.mjs';
import {controllerSeatsFromURL,withControllerSeats,resolveInterfaceSettings,demoRoster} from './demo-flow.mjs';
const ENDPOINT='/api/games/system-clash/rooms';
export function createRoomClient({fetch=globalThis.fetch,endpoint=ENDPOINT}={}){
 let seat=null;
 async function call(options){let response;try{response=await fetch(endpoint,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000),...options});}catch{throw new Error('Sessions are unavailable right now. Solo and Two players still work.');}let result;try{result=await response.json();}catch{throw new Error('The session service returned an unreadable response.');}if(!response.ok){const error=new Error(typeof result?.error==='string'?result.error.slice(0,240):'The session request failed.');error.status=response.status;throw error;}return result;}
 return {setSeat(value){seat=value;},releaseSeat(value){return call({method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+value.token},body:JSON.stringify({action:'leave',code:value.code})});},list(){return call({method:'GET'});},request(action,fields={}){const authenticated=!!seat&&!['create','join'].includes(action);return call({method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+seat.token}:{})},body:JSON.stringify({action,...(authenticated?{code:seat.code}:{}),...fields})});},leaveOnUnload(){if(!seat)return;try{fetch(endpoint,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+seat.token},body:JSON.stringify({action:'leave',code:seat.code})}).catch(()=>{});}catch{}}};
}
export function onlineFightURL(base,seat,state,settings={}){
 const url=new URL('fight.html',base),params={demo:'1',mode:'local',online:'1',seat:seat.role==='guest'?'1':'0',p1:state.host.fighter,p2:state.guest.fighter,name1:state.host.name??'Host',name2:state.guest.name??'Guest',sound:settings.muted?'0':'1',motion:settings.reducedMotion?'1':'0',musicStyle:normalizeMatchRules({musicStyle:settings.musicStyle}).musicStyle,winHost:String(state.wins?.[0]??0),winGuest:String(state.wins?.[1]??0)};
 for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
 url.searchParams.set('stage',ONLINE_STAGES.includes(settings.stage)?settings.stage:'radio-studio');
 if(settings.tournament&&settings.rules){url.searchParams.set('tournamentOnline','1');url.searchParams.set('rounds',String(settings.rules.rounds));url.searchParams.set('time',String(settings.rules.time));}
  return withControllerSeats(url,settings.controllerSeats);
}
export function onlineMenuURL(base,settings={}){
 const url=new URL('index.html',base);for(const [key,value] of Object.entries({musicStyle:normalizeMatchRules({musicStyle:settings.musicStyle}).musicStyle,sound:settings.muted?'0':'1',motion:settings.reducedMotion?'1':'0'}))url.searchParams.set(key,value);
 return withControllerSeats(url,settings.controllerSeats);
}
/** Spectator updates never wait on, queue behind, or pause player transport. */
export function createTournamentBroadcaster({send,now=Date.now}){
 let pending=false,last=-Infinity,closed=false,intervalMs=500;
 return {offer(snapshot){if(closed||pending||now()-last<intervalMs)return false;last=now();pending=true;try{Promise.resolve(send(snapshot)).then(result=>{intervalMs=result?.intervalMs===100?100:500;}).catch(()=>{intervalMs=500;}).finally(()=>{pending=false;});}catch{pending=false;}return true;},destroy(){closed=true;}};
}
/** Lobby authority is explicit; this class never advances the fight engine. */
export function createOnlineSession({seat,roomState,peer,settings={},postFrame=()=>{},loadFrame=()=>{},onStatus=()=>{},onMatchPhase=()=>{},onScore=()=>{},onBroadcast=()=>{},onResult,beginMatch,onEnd=()=>{},timers=globalThis}){
 let matchId=Number.isSafeInteger(roomState?.matchId)&&roomState.matchId>0?roomState.matchId:1,frameLoaded=false,started=false,ended=false,setup=false,phase='ready',pendingStart=null,startTimer=null,resultValue=null,resultTask=null,resultReady=!onResult,restarting=false;
 const host=seat.role==='host';
 const coordinator=createFrameCoordinator({rules:settings.tournament?settings.rules:undefined,onStart:packet=>{if(!host||ended)return;pendingStart=packet;peer.send(packet);timers.clearTimeout(startTimer);startTimer=timers.setTimeout(()=>end('The other player did not start the match. Leave this session and try again.'),8000);onStatus('Waiting for the other player to start…');}});
 if(matchId>1)coordinator.reset(matchId);
 function saveResult(){
  if(!host||!resultValue||resultTask||ended)return resultTask;
  resultReady=false;
  try{resultTask=Promise.resolve(onResult?.(resultValue)).then(()=>{if(!ended)resultReady=true;},()=>{if(!ended&&!resultReady)onStatus('The result could not be saved. Retry the score before playing again.');}).finally(()=>{resultTask=null;});}catch{resultTask=null;if(!ended&&!resultReady)onStatus('The result could not be saved. Retry the score before playing again.');}
  return resultTask;
 }
 function reconcileResult(room){
  const result=room?.result;
  if(ended||!started||room?.matchPhase!=='over'||room.matchId!==matchId||result?.matchId!==matchId||!validSessionWins(room.wins)||![0,1,null].includes(result.winner))return false;
  if((host&&!resultValue)||(resultValue&&resultValue.winner!==result.winner))return false;
  resultValue={matchId,winner:result.winner};resultReady=true;
  if(phase!=='over'){phase='over';onMatchPhase(phase,resultValue);}
  return true;
 }
 function rememberPhase(packet){
  const snapshot=packet.snapshot,state=snapshot?.state;
  if(packet.type!=='snapshot'||!['ready','countdown','fight','finish','deletion','over'].includes(state?.phase)||(snapshot.matchId!==undefined&&snapshot.matchId!==matchId))return;
  if(resultValue&&phase==='over')return;
  if(settings.tournament&&state.phase==='over'&&state.setComplete!==true)return;
  if(state.phase==='over'&&state.winner!==undefined&&![0,1,null].includes(state.winner))return;
  if(phase!==state.phase){phase=state.phase;onMatchPhase(phase,{matchId,winner:state.winner});}
  if(host&&onResult&&!resultValue&&phase==='over'&&snapshot.matchId===matchId&&Number.isSafeInteger(snapshot.seq)&&snapshot.seq>0&&[0,1,null].includes(state.winner)){resultValue={matchId,winner:state.winner};saveResult();}
 }
 function load(){timers.clearTimeout(startTimer);pendingStart=null;frameLoaded=false;started=false;phase='ready';resultValue=null;resultTask=null;resultReady=!onResult;onMatchPhase(phase);loadFrame(matchId,settings);onStatus('Loading both fighters…');}
 function restart(){
  if(settings.tournament||!host||ended||!started||phase!=='over'||restarting)return;
  const advance=value=>{if(ended)return;const next=value?.matchId??matchId+1;if(next!==matchId+1)throw new Error('The match changed. Return to fighter selection.');matchId=coordinator.reset(next);peer.setMatchId(matchId);peer.send({type:'rematch',matchId,...(validSessionWins(value?.wins)?{wins:[...value.wins]}:{})});load();};
  if(!beginMatch&&!onResult){advance();return;}
  restarting=true;void (async()=>{try{if(resultTask)await resultTask;if(!resultReady||ended)return;advance(await beginMatch?.(matchId));}catch(error){onStatus(error.message??'Could not start the rematch.');}finally{restarting=false;}})();
 }
 function end(reason){if(ended)return;ended=true;started=false;pendingStart=null;timers.clearTimeout(startTimer);postFrame({type:'leave'});onEnd(reason);}
 return {get matchId(){return matchId;},connected(){if(ended||setup)return;peer.setMatchId(matchId);if(host){setup=true;peer.send({type:'setup',...(settings.tournament?{rules:settings.rules}:{}),...(settings.stage?{stage:settings.stage}:{}),...(validSessionWins(roomState?.wins)?{wins:[...roomState.wins]}:{})});load();}else onStatus('Connected. Waiting for the host’s arena…');},receiveFrame(packet){
  if(ended||!validPayload(packet))return;
  if(packet.type==='loaded'){if(frameLoaded)return;frameLoaded=true;peer.send(packet);if(host)coordinator.loaded('local');else onStatus('Ready. Waiting for both fighters…');return;}
  if(packet.type==='leave'){peer.send(packet);end('You left the match.');return;}
  if(packet.type==='rematch'){if(settings.tournament)return;if(phase==='over'){if(host)restart();else peer.send({type:'rematch'});}return;}
  if(packet.type==='started'&&!host&&pendingStart&&packet.matchId===matchId&&!started){pendingStart=null;started=true;peer.send(packet);onStatus('Clash!');return;}
  if(!started)return;
  if(['action','input'].includes(packet.type)){if(!host)peer.send(packet);return;}
  if(packet.type==='pause'){if(!host&&!packet.paused)return;postFrame(packet);peer.send(packet);onStatus(packet.paused?(packet.reason==='network'?'Connection interrupted. Waiting to reconnect…':'Paused by a player.'):'Clash!');return;}
  if(host&&['snapshot','events'].includes(packet.type)){rememberPhase(packet);peer.send(packet);if(settings.tournament&&packet.type==='snapshot')try{onBroadcast(packet.snapshot);}catch{}}
 },receivePeer(packet){
  if(ended||!validPayload(packet))return;
  if(packet.type==='leave'){end('The other player left.');return;}
  if(settings.tournament&&['setup','start'].includes(packet.type)&&(packet.rules?.rounds!==settings.rules?.rounds||packet.rules?.time!==settings.rules?.time)){end('The tournament rules changed. Return to its bracket.');return;}
  if(packet.type==='setup'&&!host&&!setup){setup=true;settings.stage=packet.stage;if(validSessionWins(packet.wins))onScore([...packet.wins],matchId);load();return;}
  if(packet.type==='loaded'){if(host)coordinator.loaded('remote');return;}
  if(packet.type==='rematch'){if(settings.tournament)return;if(host){if(packet.matchId===undefined)restart();}else if(packet.matchId===matchId+1){matchId=packet.matchId;peer.setMatchId(matchId);if(validSessionWins(packet.wins))onScore([...packet.wins],matchId);load();}return;}
  if(packet.type==='start'&&!host&&frameLoaded&&!started&&!pendingStart&&packet.matchId===matchId){pendingStart=packet;postFrame(packet);onStatus('Starting your fighter…');return;}
  if(packet.type==='started'&&host&&pendingStart&&packet.matchId===matchId&&!started){const start=pendingStart;pendingStart=null;timers.clearTimeout(startTimer);started=true;postFrame(start);onStatus('Clash!');return;}
  if(!started)return;
  if(packet.type==='pause'){if(host&&!packet.paused)return;postFrame(packet);if(host)peer.send(packet);onStatus(packet.paused?(packet.reason==='network'?'Connection interrupted. Waiting to reconnect…':'Paused by a player.'):'Clash!');return;}
  if((host&&['action','input'].includes(packet.type))||(!host&&['snapshot','events'].includes(packet.type))){if(!host)rememberPhase(packet);postFrame(packet);}
 },end,reconcileResult,retryResult:saveResult,destroy(){ended=true;started=false;pendingStart=null;timers.clearTimeout(startTimer);}};
}
export function nextLobbyFocus(items,current,key,columns=1){
 const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[key];
 if(!delta||!items.length)return null;
 if(current<0||current>=items.length)return items[0];
 return items[(current+delta+items.length)%items.length];
}
export async function mountOnlineLobby({document=globalThis.document,window=globalThis.window,fetch=globalThis.fetch}={}){
 let screenControls;const screenHost=createGameScreenHost({window,document,onSuspend:()=>unload(),onDisplayChange:()=>screenControls?.sync()});screenControls=bindGameScreenControls(screenHost,{document});
 const $=id=>document.getElementById(id),client=createRoomClient({fetch}),launch=new URL(window.location.href);
 const settings={musicStyle:matchRulesFromURL(launch.href,loadMatchRules(window.localStorage)).musicStyle,...resolveInterfaceSettings(launch,{prefersReducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches}),controllerSeats:controllerSeatsFromURL(launch.href),stage:ONLINE_STAGES.includes(launch.searchParams.get('stage'))?launch.searchParams.get('stage'):'radio-studio'};
 let tournamentIntent=null,tournamentLinkError=null;try{tournamentIntent=readTournamentLaunch(launch.href);}catch(error){tournamentLinkError=error;}
  const tournamentHandoff=tournamentIntent?createTournamentRoomHandoff({intent:tournamentIntent,fetch}):null;let tournamentState=null,tournamentPreparing=false,tournamentReturning=false;
  const menuLinks=[...document.querySelectorAll('a[href="index.html"]')].filter(link=>link.tagName==='A');for(const link of menuLinks){link.href=onlineMenuURL(launch,settings).href;link.addEventListener('click',event=>{event.preventDefault();const previous=seat;resetRoom();if(previous)void client.releaseSeat(previous).catch(()=>{});screenHost.navigate(onlineMenuURL(launch,settings));});}
 const music=createGameMusic({window,document,muted:settings.muted});music.setScene({screen:'online'});music.setPaused(!document.hasFocus());
 const blur=()=>music.setPaused(true),focus=()=>music.setPaused(false);window.addEventListener('blur',blur);window.addEventListener('focus',focus);
 const pads=createGamepadInput({seats:settings.controllerSeats});
 let account=null,accountExpiresAt=0;
  function confirmMember(result){if(typeof result.member?.name!=='string'||!result.member.name.trim()||result.member.name.length>80||!Number.isFinite(Date.parse(result.sessionExpiresAt))||Date.parse(result.sessionExpiresAt)<=Date.now())throw new Error('Your account could not be confirmed. Sign in again.');account={name:result.member.name};accountExpiresAt=Date.parse(result.sessionExpiresAt);}
  const accountURL=new URL('/account',launch);accountURL.searchParams.set('returnTo','/games/system-clash/play/online.html'+launch.search);$('account-signin').href=accountURL.href;accountURL.searchParams.set('mode','signup');$('account-signup').href=accountURL.href;
  let seat=null,state=null,peer=null,session=null,broadcaster=null,roster=[],busy=false,pollTimer=null,listTimer=null,expiryTimer=null,epoch=0,pollErrors=0,destroyed=false,connected=false,stopped=false,listing=false,suspended=false,raf=null,pendingJoinCode=null,pendingEntry=null,connecting=false,currentScreen='browser',fighterPage=0,displayResult=null,scoreFailed=false;
 const status=(text,kind='info')=>{$('online-status').textContent=text==='Clash!'&&peer?.transport==='relay'?'Clash! · Cloud connection':text;$('online-status').setAttribute('data-kind',kind);};
 function showScreen(screen,{focus=false}={}){
  currentScreen=screen;$('online-lobby').dataset.onlineScreen=screen;
  for(const name of ['browser','session','selection','fight','results'])$(name+'-screen').hidden=name!==screen;
  $('entry-panel').hidden=screen!=='browser';$('room-panel').hidden=screen!=='session';$('fight-frame').hidden=screen!=='fight';$('match-actions').hidden=screen!=='fight';$('session-score').hidden=!seat;
  if(focus){const target={browser:'screen-name',session:'session-select',selection:'ready-button',results:'rematch-button',fight:'fight-frame'}[screen];($(target)?.disabled&&screen==='results'?$('results-leave'):$(target))?.focus?.({preventScroll:true});}
 }
 function renderFighterPage(){
  const pages=Math.max(1,Math.ceil(roster.length/8));fighterPage=Math.max(0,Math.min(pages-1,fighterPage));
  for(const [index,button]of [...$('fighter-grid').querySelectorAll('button')].entries())button.hidden=Math.floor(index/8)!==fighterPage;
  $('fighter-page').textContent=(fighterPage+1)+' / '+pages;$('fighter-prev').disabled=fighterPage===0;$('fighter-next').disabled=fighterPage===pages-1;$('fighter-pagination').hidden=pages<=1;
 }
 function renderScores(){if(!state)return;$('score-host-name').textContent=state.host?.name??'Host';$('score-guest-name').textContent=state.guest?.name??'Waiting';$('score-host').textContent=String(state.wins?.[0]??0);$('score-guest').textContent=String(state.wins?.[1]??0);}
 function renderResults(){
  const result=displayResult??state?.result;if(!result)return;const winner=result.winner;
  $('result-heading').textContent=winner===null?'Draw':(state?.[winner===0?'host':'guest']?.name??'Player')+' wins';
  const saved=state?.matchPhase==='over'&&state.matchId===result.matchId&&state.result?.matchId===result.matchId&&state.result.winner===winner;$('result-note').textContent=saved?'Score saved. Keep the clash going.':scoreFailed?'The score is not saved yet. Retry before playing again.':'Saving the session score…';
  $('rematch-button').textContent=tournamentIntent?'Return to tournament →':'Rematch →';$('rematch-button').disabled=!saved||(!tournamentIntent&&!peer)||busy||tournamentReturning;$('results-select').hidden=!!tournamentIntent;$('session-select').textContent=tournamentIntent?'Reserved fighter / Ready':'Choose fighters →';$('results-select').disabled=!saved||busy;$('results-retry').hidden=saved||!scoreFailed||seat?.role!=='host';
 }
 function closeMatch(){broadcaster?.destroy();broadcaster=null;postFrame({type:'leave'});session?.destroy();session=null;peer?.close();peer=null;connected=false;connecting=false;$('fight-frame').src='about:blank';$('fight-frame').hidden=true;displayResult=null;scoreFailed=false;}
 function armExpiry(){window.clearTimeout(expiryTimer);if(seat)expiryTimer=window.setTimeout(()=>stop('This 20-minute session expired. Leave it and create another.'),Math.max(0,seat.expiresAt-Date.now()));}
 showScreen('browser');
 $('stage-choice').value=settings.stage;$('sound-setting').checked=!settings.muted;$('motion-setting').checked=settings.reducedMotion;
 const buttons=()=>[...document.querySelectorAll('button,input,a[href],select')].filter(el=>!el.disabled&&!el.closest('[hidden]'));
 function renderEntry(){
  const disabled=busy||!roster.length||!account||accountExpiresAt<=Date.now()||!!tournamentLinkError||!!tournamentIntent;
   $('account-required').hidden=!!account;$('screen-name').readOnly=true;$('screen-name').value=account?.name??'';
  $('entry-panel').setAttribute('aria-busy',String(busy));
  for(const id of ['create-room','join-room'])$(id).disabled=disabled;
  for(const id of ['screen-name','join-code'])$(id).disabled=busy||!account;
  $('refresh-rooms').disabled=busy||listing;
  $('create-room').textContent=pendingEntry==='create'?'Creating session…':'Create new session →';
  $('join-room').textContent=pendingEntry==='join'?'Joining…':pendingJoinCode?'Join '+pendingJoinCode:'Join session';
  for(const button of $('room-list').querySelectorAll('button')){button.disabled=disabled;button.setAttribute('aria-pressed',String(button.dataset.code===pendingJoinCode));}
 }
 function chooseJoin(code){pendingJoinCode=code;$('join-code').value=code;renderEntry();}
 function clearTimers(){window.clearTimeout(pollTimer);window.clearTimeout(listTimer);window.clearTimeout(expiryTimer);}
 function stop(reason){
  if(stopped||destroyed||suspended)return;stopped=true;busy=false;++epoch;clearTimers();closeMatch();showScreen('session');renderSeat();$('session-note').textContent='Connection ended. Your saved wins are retained. Choose fighters to reconnect.';
  if(!destroyed&&!suspended){music.resume();music.setScene({screen:'online'});}status(reason,'error');if(seat&&seat.expiresAt>Date.now()){armExpiry();pollTimer=window.setTimeout(()=>poll(epoch),1500);}
 }
 function resetRoom(){
  ++epoch;clearTimers();peer?.send({type:'leave'});closeMatch();client.setSeat(null);seat=null;state=null;stopped=false;busy=false;pollErrors=0;pendingJoinCode=null;pendingEntry=null;pads.reset();fighterPage=0;
  try{window.sessionStorage.removeItem('system-clash-online-seat');}catch{}
  $('fighter-grid').removeAttribute('aria-disabled');$('stage-choice').disabled=false;$('ready-button').disabled=!roster.length;
  for(const button of $('fighter-grid').querySelectorAll('button'))button.disabled=roster.find(f=>f.id===button.dataset.fighter)?.enabled!==true;
  $('join-code').value='';showScreen('browser');renderFighterPage();renderEntry();if(!destroyed&&!suspended){music.resume();music.setScene({screen:'online'});}status(account?'Your BARCODE account is ready. Create or join a session.':'Sign in to your verified BARCODE account to play online.');
 }
 async function leave(){if(tournamentIntent)return returnTournament({unfinished:true});if(busy||destroyed||suspended)return;const previous=seat;resetRoom();const revision=epoch;refreshRooms();try{if(previous)await client.releaseSeat(previous);}catch(error){if(revision===epoch&&!destroyed&&!suspended&&!seat)status(error.message);}}
 function renderSeat(){
  if(!seat)return;$('room-code').textContent=seat.code;$('seat-label').textContent=(seat.role==='host'?'You host this session':'You joined this session')+(peer?.transport==='relay'?' · Cloud connection':'');
  if(!state){$('players').textContent='Loading players…';$('selected-fighter').textContent='Loading fighter…';$('ready-button').disabled=true;$('ready-button').textContent='Loading session…';$('ready-button').setAttribute('aria-label','Loading session.');$('ready-button').setAttribute('aria-pressed','false');$('stage-choice').disabled=true;for(const button of $('fighter-grid').querySelectorAll('button'))button.disabled=true;status('Loading your session…');return;}
  const own=state[seat.role],other=state[seat.role==='host'?'guest':'host'];if(!own)return;const ownFighter=roster.find(fighter=>fighter.id===own.fighter);renderScores();renderResults();
  $('players').textContent=state.host.name+' · '+(state.host.ready?'Ready':'Choosing')+' / '+(state.guest?state.guest.name+' · '+(state.guest.ready?'Ready':'Choosing'):'Waiting for another player');
  $('selected-fighter').textContent=ownFighter?.name??own.fighter;$('ready-button').textContent=stopped?'Connection ended':own.ready?'Ready ✓':'Ready to clash';$('ready-button').setAttribute('aria-pressed',String(own.ready));$('ready-button').setAttribute('aria-label',stopped?'Connection ended':own.ready?peer||busy||connecting?'You are ready.':'You are ready. Press to cancel readiness.':'Ready to clash');$('ready-button').disabled=busy||connecting||!!peer||stopped||ownFighter?.enabled!==true;$('stage-choice').disabled=!!tournamentIntent||seat.role!=='host'||connecting||!!peer;
   if(tournamentIntent)for(const button of $('fighter-grid').querySelectorAll('button'))button.disabled=true;
  $('session-select').disabled=busy||connecting;$('session-select').textContent=tournamentIntent?'Reserved fighter / Ready':stopped?'Choose fighters to reconnect →':'Choose fighter →';
  for(const button of $('fighter-grid').querySelectorAll('button')){button.setAttribute('aria-pressed',String(button.dataset.fighter===own.fighter));button.disabled=!!tournamentIntent||busy||connecting||!!peer||stopped||roster.find(f=>f.id===button.dataset.fighter)?.enabled!==true;}renderFighterPage();
  if(!peer&&!stopped&&!busy)status(other?(own.ready&&other.ready?'Both ready. Connecting…':'Choose your fighter, then press Ready.'):'Session '+seat.code+' is open. Share its code or wait for a player.');
 }
 function postFrame(payload){const frame=$('fight-frame');if(!frame.contentWindow||!session)return;frame.contentWindow.postMessage({scope:ONLINE_SCOPE,matchId:session.matchId,payload},launch.origin);if(payload.type==='start'){frame.focus();frame.contentWindow.focus?.();}}
 function loadFrame(matchId,chosenSettings){music.suspend();$('stage-choice').value=chosenSettings.stage??'radio-studio';const url=onlineFightURL(launch.href,seat,state,chosenSettings);url.searchParams.set('matchId',String(matchId));$('fight-frame').src=url.href;showScreen('fight');$('rematch-button').disabled=true;}
 async function connect(){
  if(destroyed||suspended||stopped||connecting||peer||!seat||!state?.guest||!state.host.ready||!state.guest.ready||tournamentIntent&&state.matchPhase==='over')return;
   if(tournamentIntent&&(!tournamentState||state.tournament?.code!==tournamentIntent.event||state.tournament?.boutId!==tournamentIntent.bout))return;
  const revision=epoch,previous=seat;if(seat.role==='guest'&&state.matchPhase!=='match')return;connecting=true;renderSeat();
  try{
   if(tournamentIntent){tournamentState=await tournamentHandoff.refresh();if(!currentSeatRequest(revision,previous))return;settings.rules=state.tournament.rules;if(seat.role==='guest'&&tournamentState.bout.status!=='live')return;}
   if(seat.role==='host'&&state.matchPhase!=='match'){const begun=await client.request('begin',{after:state.matchId??0});if(!currentSeatRequest(revision,previous))return;state=begun;}
   if(tournamentIntent&&seat.role==='host'){await tournamentHandoff.bind(seat.code,state.matchId);if(!currentSeatRequest(revision,previous))return;state=await client.request('poll');if(!currentSeatRequest(revision,previous))return;}
    if(!Number.isSafeInteger(state?.matchId)||state.matchId<1)throw new Error('The session returned an invalid match. Return to fighter selection.');
   let configuration;try{configuration=await client.request('ice');}catch{}
   if(!currentSeatRequest(revision,previous)||stopped||!state?.guest||!state.host.ready||!state.guest.ready)return;
   const relayServers=Array.isArray(configuration?.iceServers)&&configuration.iceServers.length<=8?configuration.iceServers.filter(server=>{
    const urls=Array.isArray(server?.urls)?server.urls:[server?.urls];
    return urls.length>0&&urls.length<=8&&urls.every(url=>typeof url==='string'&&/^turns?:turn\.cloudflare\.com:(3478|443|80|5349)\?transport=(udp|tcp)$/.test(url))&&typeof server.username==='string'&&server.username.length>0&&server.username.length<=2048&&typeof server.credential==='string'&&server.credential.length>0&&server.credential.length<=2048;
   }):[];
   const iceServers=[...DEFAULT_ICE_SERVERS,...relayServers];
   broadcaster=tournamentIntent&&seat.role==='host'?createTournamentBroadcaster({send:snapshot=>{const compact=compactTournamentBroadcast(snapshot);return compact?client.request('broadcast',{snapshot:compact}):Promise.resolve({intervalMs:500});}}):null;
   peer=createOnlineConnection({role:seat.role,room:seat.code,matchId:state.matchId,iceServers,RTCPeerConnection:window.RTCPeerConnection,onPacket:packet=>{if(revision===epoch)session?.receivePeer(packet);},sendSignal:description=>client.request('signal',{description}),sendCandidates:value=>client.request('candidates',value),relayRequest:value=>client.request('relay',value),onStatus:value=>{if(revision!==epoch)return;if(value==='connected'){connected=true;session?.connected();status(peer?.transport==='relay'?'Cloud connection. Loading the match…':'Connected. Loading the match…');}else if(value==='connecting')status('Connecting players…');else if(value==='relaying')status('Connecting through cloud…');else if(value==='retrying')status('Retrying the direct connection…');},onDisconnect:reason=>{if(revision===epoch)stop(reason);}});peer.setMatchId(state.matchId);session=createOnlineSession({seat,roomState:state,peer,settings,postFrame,loadFrame,onStatus:status,onBroadcast:snapshot=>broadcaster?.offer(snapshot),onScore:(wins,matchId)=>{if(revision===epoch&&state){state={...state,wins,matchId,matchPhase:'match',result:null};renderScores();}},onMatchPhase:(phase,result)=>{if(revision!==epoch)return;if(phase==='over'){displayResult=result;showScreen('results',{focus:true});renderResults();}else if(phase==='ready')scoreFailed=false;},onResult:async result=>{try{const saved=await client.request('result',result);if(!currentSeatRequest(revision,previous))return;state=saved;scoreFailed=false;renderScores();renderResults();}catch(error){if(revision===epoch){scoreFailed=!session?.reconcileResult(state);renderResults();}throw error;}},beginMatch:async after=>{const begun=await client.request('begin',{after});if(!currentSeatRequest(revision,previous))throw new Error('This session changed.');state=begun;renderScores();return begun;},onEnd:reason=>{if(revision===epoch)stop(reason);},timers:window});renderSeat();if(seat.role==='host')peer.start();
  }finally{if(revision===epoch){connecting=false;if(!stopped)renderSeat();}}
 }
 async function poll(revision){
  if(destroyed||suspended||revision!==epoch||!seat)return;
  try{const result=await client.request('poll');if(revision!==epoch||suspended)return;
   const returned=(state?.selectionVersion??0)!==(result.selectionVersion??0);
   if((result.matchId??0)<(state?.matchId??0)||(result.selectionVersion??0)<(state?.selectionVersion??0)||!returned&&state?.matchPhase==='over'&&result.matchPhase==='match'){pollTimer=window.setTimeout(()=>poll(revision),1500);return;}
   state=result;pollErrors=0;
   if(returned&&(peer||session||stopped)){++epoch;clearTimers();closeMatch();stopped=false;busy=false;showScreen('selection',{focus:true});music.resume();music.setScene({screen:'online'});renderSeat();armExpiry();void poll(epoch);return;}
   if(connected&&!result.guest){stop('The other player left. Your saved wins are retained.');return;}
   if(result.matchPhase==='over'&&result.result&&(tournamentIntent||['fight','results'].includes(currentScreen))){const confirmed=tournamentIntent||session?.reconcileResult(result);if(confirmed){displayResult=result.result;scoreFailed=false;}showScreen('results');}
   renderSeat();if(!stopped)await connect();if(revision!==epoch||!seat)return;
   if(result.relay&&peer&&!connected)peer.useRelay();if(result.candidates?.length&&peer)await peer.receiveCandidates({generation:result.generation,candidates:result.candidates});if(result.description&&peer)await peer.receiveDescription(result.description);
  }catch(error){if(revision!==epoch)return;if([401,403,404,410].includes(error.status)){if([401,403].includes(error.status)){account=null;accountExpiresAt=0;}resetRoom();status(error.message,'error');refreshRooms();return;}pollErrors++;status(error.message,'error');if(pollErrors>=3&&!stopped){stop('Session service lost contact. Your saved wins are retained.');return;}}
  if(revision===epoch&&seat&&!suspended)pollTimer=window.setTimeout(()=>poll(revision),connected&&currentScreen==='fight'?15000:1500);
 }
 async function returnSelection(action='lobby'){
  if(busy||destroyed||suspended||!seat)return;const previous=seat,revision=epoch;busy=true;renderSeat();
  try{const selected=await client.request(action);if(!currentSeatRequest(revision,previous))return;
   ++epoch;clearTimers();state=selected;closeMatch();stopped=false;busy=false;showScreen('selection',{focus:true});music.resume();music.setScene({screen:'online'});$('session-note').textContent='Share the code with a rival. Your wins stay with this session.';renderSeat();armExpiry();void poll(epoch);
  }catch(error){if(currentSeatRequest(revision,previous)){busy=false;renderSeat();status(error.message,'error');}}
 }
 async function restoreSeat(){
  if(destroyed||suspended)return;let restored=seat;
  if(!restored){try{restored=JSON.parse(window.sessionStorage.getItem('system-clash-online-seat')??'null');}catch{}if(!restored||!/^[A-Z0-9]{6}$/.test(restored.code)||!['host','guest'].includes(restored.role)||typeof restored.token!=='string'||restored.token.length<24||restored.token.length>96||!Number.isFinite(restored.expiresAt)||restored.expiresAt<=Date.now()){try{window.sessionStorage.removeItem('system-clash-online-seat');}catch{}return false;}}
  seat=restored;client.setSeat(seat);showScreen('session');const revision=++epoch,previous=seat;busy=true;renderSeat();
  try{const resumed=await client.request('resume');if(!currentSeatRequest(revision,previous))return true;state=resumed;stopped=false;busy=false;if(tournamentIntent&&state.matchPhase==='over'&&state.result){displayResult=state.result;showScreen('results',{focus:true});}renderSeat();armExpiry();void poll(revision);status(tournamentIntent?'Tournament session restored. Your saved score is retained.':'Session restored. Choose fighters to clash again.');}
  catch(error){if(currentSeatRequest(revision,previous)){busy=false;if([401,403,404,410].includes(error.status)){resetRoom();status(error.message,'error');return false;}stopped=true;renderSeat();status(error.message,'error');armExpiry();pollTimer=window.setTimeout(()=>poll(revision),1500);}}
  return true;
 }
 async function enter(action,code){
  if(busy||seat||destroyed||suspended)return;
   if(tournamentLinkError){status(tournamentLinkError.message,'error');return;}
   if(tournamentIntent&&(!tournamentState||action!==(tournamentIntent.role==='host'?'create':'join')||(action==='join'&&code!==tournamentState.bout.roomCode))){status('Use your assigned tournament match. Return to its bracket.','error');return;}
   if(!account||accountExpiresAt<=Date.now()){status("Sign in to your verified BARCODE account to play online.","error");renderEntry();return;}
  if(action==='join'){
   code=typeof code==='string'?code.trim().toUpperCase():'';
   if(!/^[A-Z0-9]{6}$/.test(code)){status('Enter a six-character session code, or choose an open session.','error');$('join-code').focus();return;}
   chooseJoin(code);
  }else{pendingJoinCode=null;renderEntry();}
  const revision=++epoch;busy=true;pendingEntry=action;window.clearTimeout(listTimer);renderEntry();status(action==='join'?'Joining session '+code+'…':'Creating a new session…','pending');
  try{
   const result=await client.request(action,action==='join'?{code}:{});
   if(typeof result?.token!=='string'||!result.token||!['host','guest'].includes(result.role)||!/^[A-Z0-9]{6}$/.test(result.code))throw new Error('The session service returned an invalid seat.');
   if(result.role!==(action==='join'?'guest':'host')||(action==='join'&&result.code!==code)||!Number.isFinite(result.expiresAt)){
    void client.releaseSeat(result).catch(()=>{});throw new Error(action==='join'?'Could not join the requested session. Please try again.':'Could not create your session. Please try again.');
   }
   if(destroyed||suspended||revision!==epoch){void client.releaseSeat(result).catch(()=>{});return;}
   seat=tournamentIntent?{...result,tournament:{event:tournamentIntent.event,bout:tournamentIntent.bout}}:result;client.setSeat(seat);try{window.sessionStorage.setItem('system-clash-online-seat',JSON.stringify(seat));}catch{}
   if(tournamentIntent&&action==='create'){await tournamentHandoff.offer(seat.code);if(!currentSeatRequest(revision,seat))return;tournamentState=await tournamentHandoff.refresh();}
    window.clearTimeout(listTimer);showScreen('session');renderSeat();armExpiry();busy=false;await poll(revision);
  }catch(error){if(!destroyed&&!suspended&&revision===epoch)status(error.message,'error');}
  finally{if(!destroyed&&!suspended&&revision===epoch){busy=false;pendingEntry=null;renderEntry();if(!seat)refreshRooms();}}
 }
 async function refreshRooms(){
  if(tournamentIntent||tournamentLinkError){void prepareTournament();return;}
   if(listing||busy||destroyed||suspended||seat)return;
  const revision=epoch;listing=true;window.clearTimeout(listTimer);const list=$('room-list');list.setAttribute('aria-busy','true');renderEntry();
  try{
   const result=await client.list();if(destroyed||suspended||seat||revision!==epoch)return;confirmMember(result);renderEntry();list.replaceChildren();
   const rooms=(Array.isArray(result.rooms)?result.rooms:[]).filter(room=>/^[A-Z0-9]{6}$/.test(room?.code)).slice(0,20);
   if(!rooms.length){const empty=document.createElement('p');empty.className='empty-rooms';empty.textContent='No hosts are waiting. Create a new session, or join with a code.';list.append(empty);}
   for(const room of rooms){
    const button=document.createElement('button');button.type='button';button.className='room-row';button.dataset.code=room.code;
    const hostName=String(room.hostName??'Player').slice(0,80),label=document.createElement('strong');label.textContent=hostName;
    const code=document.createElement('span');code.textContent='Join '+room.code;button.setAttribute('aria-label','Join '+hostName+'’s session '+room.code);
    button.append(label,code);button.addEventListener('click',()=>enter('join',room.code));list.append(button);
   }
  }catch(error){if(destroyed||suspended||seat||revision!==epoch)return;account=null;accountExpiresAt=0;renderEntry();status(error.message,'error');list.replaceChildren();const empty=document.createElement('p');empty.className='empty-rooms room-list-error';empty.textContent=error.message;list.append(empty);}
  finally{listing=false;list.setAttribute('aria-busy','false');if(!destroyed&&!suspended){renderEntry();if(!seat&&!busy)listTimer=window.setTimeout(refreshRooms,revision===epoch?5000:0);}}
 }
 async function prepareTournament(){
  if(tournamentPreparing||destroyed||suspended)return;tournamentPreparing=true;window.clearTimeout(listTimer);
  try{
   if(tournamentLinkError)throw tournamentLinkError;
   confirmMember(await client.list());if(destroyed||suspended)return;renderEntry();
   tournamentState=await tournamentHandoff.refresh();if(destroyed||suspended)return;
   settings.tournament=true;settings.rules=tournamentState.rules;settings.stage='radio-studio';
   let restored=seat;try{restored??=JSON.parse(window.sessionStorage.getItem('system-clash-online-seat')??'null');}catch{}
   if(restored?.tournament?.event===tournamentIntent.event&&restored?.tournament?.bout===tournamentIntent.bout&&restored.role===tournamentIntent.role&&(!tournamentState.bout.roomCode||restored.code===tournamentState.bout.roomCode)){
    seat=restored;client.setSeat(seat);
    if(seat.role==='host'&&!tournamentState.bout.roomCode){await tournamentHandoff.offer(seat.code);tournamentState=await tournamentHandoff.refresh();}
    if(destroyed||suspended)return;await restoreSeat();return;
   }
   if(restored){throw new Error('Return to the original match tab, or leave its session before opening this tournament match.');}
   if(tournamentIntent.role==='host'){
    if(tournamentState.bout.roomCode)throw new Error('This tournament match already has a session. Return to its original tab to reconnect.');
    await enter('create');
   }else if(tournamentState.bout.roomCode)await enter('join',tournamentState.bout.roomCode);
   else{status('Waiting for Player 1 to open your tournament session…');listTimer=window.setTimeout(prepareTournament,2000);}
  }catch(error){
   if(destroyed||suspended)return;if([401,403].includes(error.status)){account=null;accountExpiresAt=0;}
   renderEntry();if(seat){busy=false;showScreen('session');renderSeat();armExpiry();}status(error.message,'error');
  }finally{tournamentPreparing=false;}
 }
 async function returnTournament({unfinished=false}={}){
  if(tournamentReturning||destroyed||suspended)return;tournamentReturning=true;renderResults();
  try{
   if(!unfinished||state?.matchPhase==='over'){
    if(state?.matchPhase!=='over'||!state.result)throw new Error('Wait for the match score to be saved before returning.');
    await tournamentHandoff.advance();
   }
   const target=tournamentReturnURL(launch,tournamentIntent.event),previous=seat;resetRoom();
   if(previous)await client.releaseSeat(previous).catch(()=>{});screenHost.navigate(target);
  }catch(error){status(error.message,'error');tournamentReturning=false;renderResults();}
 }
 function currentSeatRequest(revision,previous){return !destroyed&&!suspended&&revision===epoch&&seat===previous;}
 async function choose(id){
  if(tournamentIntent||stopped||busy||connecting||peer||!seat||!state||destroyed||suspended||!roster.some(f=>f.id===id&&f.enabled===true))return;
  const previous=seat,revision=epoch;busy=true;renderSeat();
  try{await client.request('select',{fighter:id,ready:false});if(currentSeatRequest(revision,previous)&&state)state[previous.role]={...state[previous.role],fighter:id,ready:false};}
  catch(error){if(currentSeatRequest(revision,previous))status(error.message);}
  finally{if(currentSeatRequest(revision,previous)){busy=false;renderSeat();}}
 }
 $('create-room').addEventListener('click',()=>enter('create'));$('join-form').addEventListener('submit',event=>{event.preventDefault();enter('join',$('join-code').value);});$('entry-form').addEventListener('submit',event=>{event.preventDefault();if(pendingJoinCode)enter('join',pendingJoinCode);else{status('Choose an open session or enter its code to join. Use Create new session to host.');$('create-room').focus();}});$('refresh-rooms').addEventListener('click',refreshRooms);for(const id of ['leave-room','selection-leave','results-leave','fight-leave'])$(id).addEventListener('click',()=>{if(tournamentIntent)void returnTournament({unfinished:true});else void leave();});
 $('session-select').addEventListener('click',()=>{if(stopped){void returnSelection('resume');return;}if(busy||connecting||peer)return;const selected=roster.findIndex(fighter=>fighter.enabled===true&&fighter.id===state?.[seat?.role]?.fighter);fighterPage=selected<0?0:Math.floor(selected/8);renderFighterPage();showScreen('selection',{focus:true});});$('selection-back').addEventListener('click',()=>{if(!peer)showScreen('session',{focus:true});});$('results-select').addEventListener('click',()=>returnSelection());$('results-retry').addEventListener('click',()=>session?.retryResult());
 $('fighter-prev').addEventListener('click',()=>{fighterPage--;renderFighterPage();});$('fighter-next').addEventListener('click',()=>{fighterPage++;renderFighterPage();});
 $('ready-button').addEventListener('click',async()=>{
  if(busy||connecting||peer||!state||!seat||destroyed||suspended||!roster.some(fighter=>fighter.id===state[seat.role]?.fighter&&fighter.enabled===true))return;
  const previous=seat,revision=epoch,own=state[previous.role],nextReady=!own.ready;busy=true;renderSeat();
  try{await client.request('select',{fighter:own.fighter,ready:nextReady});if(currentSeatRequest(revision,previous)&&state)state[previous.role]={...state[previous.role],fighter:own.fighter,ready:nextReady};}
  catch(error){if(currentSeatRequest(revision,previous))status(error.message);}
  finally{if(currentSeatRequest(revision,previous)){busy=false;renderSeat();void connect().catch(()=>{if(revision===epoch)stop('Could not prepare the connection. Leave this session and try again.');});}}
 });
 $('join-code').addEventListener('input',()=>{const code=$('join-code').value.trim().toUpperCase();pendingJoinCode=/^[A-Z0-9]{6}$/.test(code)?code:null;renderEntry();});
 $('rematch-button').addEventListener('click',()=>{if(tournamentIntent)void returnTournament();else session?.receiveFrame({type:'rematch'});});$('sound-setting').addEventListener('change',()=>{settings.muted=!$('sound-setting').checked;music.setMuted(settings.muted);if(!settings.muted)void music.unlock();});$('motion-setting').addEventListener('change',()=>{settings.reducedMotion=$('motion-setting').checked;});$('stage-choice').addEventListener('change',()=>{settings.stage=$('stage-choice').value||undefined;});
 function moveFocus(key){
  const active=document.activeElement,cards=[...$('fighter-grid').querySelectorAll('button')].filter(button=>!button.disabled&&!button.hidden),index=cards.indexOf(active);
  if(index>=0){
   const columns=window.getComputedStyle($('fighter-grid')).gridTemplateColumns.split(' ').filter(Boolean).length||4;
   if(key==='ArrowUp'&&index<columns){$('ready-button').focus();return;}
   if(key==='ArrowDown'&&index+columns>=cards.length){($('fighter-next').disabled?$('selection-back'):$('fighter-next')).focus();return;}
   if((key==='ArrowRight'&&index===cards.length-1&&!$('fighter-next').disabled)||(key==='ArrowLeft'&&index===0&&!$('fighter-prev').disabled)){
    fighterPage+=key==='ArrowRight'?1:-1;renderFighterPage();const next=[...$('fighter-grid').querySelectorAll('button')].filter(button=>!button.disabled&&!button.hidden);(key==='ArrowRight'?next[0]:next.at(-1))?.focus();return;
   }
   nextLobbyFocus(cards,index,key,columns)?.focus();return;
  }
  const available=buttons();nextLobbyFocus(available,available.indexOf(active),key)?.focus();
 }
 const keydown=event=>{if(!$('fight-frame').hidden||event.target?.closest?.('input,select,textarea'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code)){event.preventDefault();moveFocus(event.code);}else if(event.code==='Escape'&&seat){event.preventDefault();leave();}};window.addEventListener('keydown',keydown);
 const router=createFrameRouter({origin:launch.origin,source:()=>$('fight-frame').contentWindow,matchId:()=>session?.matchId,onPacket:packet=>session?.receiveFrame(packet)});window.addEventListener('message',router);
 const unload=()=>{if(suspended)return;suspended=true;++epoch;clearTimers();music.suspend();closeMatch();busy=false;pendingEntry=null;stopped=false;showScreen(seat?'session':'browser');window.cancelAnimationFrame(raf);raf=null;};window.addEventListener('pagehide',unload);
 const restore=()=>{if(destroyed||!suspended)return;suspended=false;music.resume();pads.reset();if(roster.length){if(tournamentIntent||tournamentLinkError)void prepareTournament();else void restoreSeat().then(restored=>{if(!restored&&!destroyed&&!suspended)refreshRooms();});if(raf===null)raf=window.requestAnimationFrame(menuTick);}};window.addEventListener('pageshow',restore);
 const menuTick=now=>{if(destroyed||suspended)return;if($('fight-frame').hidden){let devices=[];try{devices=window.navigator.getGamepads?.()??[];}catch{}const sample=pads.sample(devices,now,{context:'menu',active:document.hasFocus()&&!document.hidden});settings.controllerSeats=pads.seatIndices();for(const event of sample.events){if(event.type==='navigate'){moveFocus(event.action);}else if(event.type==='press'){void music.unlock();if(event.action==='confirm'){const focused=document.activeElement;if(focused?.tagName==='BUTTON')focused.click();else if(seat&&!peer)$('ready-button').click();}else if(event.action==='back'){if(currentScreen==='selection')showScreen('session',{focus:true});else if(seat)leave();else screenHost.navigate(withControllerSeats(new URL('index.html',launch),settings.controllerSeats));}else if(event.action==='random'&&seat&&!peer&&roster.length){const choices=roster.filter(fighter=>fighter.enabled);const picked=choices[Math.floor(Math.random()*choices.length)];if(picked){fighterPage=Math.floor(roster.indexOf(picked)/8);renderFighterPage();choose(picked.id);}}}}}raf=window.requestAnimationFrame(menuTick);};
 try{const response=await fetch(new URL('assets/menu/roster.json',launch),{cache:'no-cache'});if(!response.ok)throw new Error('Fighter selection is unavailable.');const data=await response.json();let corporateUnlocked=false;try{corporateUnlocked=loadClashPreferences(window.localStorage).corporateUnlocked;}catch{}roster=Array.isArray(data.fighters)?demoRoster(data.fighters.filter(f=>/^[a-z0-9-]{1,40}$/.test(f.id)).slice(0,19),{corporateUnlocked}):[];if(!roster.length)throw new Error('Fighter selection is unavailable.');for(const fighter of roster){const button=document.createElement('button');button.type='button';button.dataset.fighter=fighter.id;button.disabled=fighter.enabled!==true;button.className='fighter-card';if(isSealedFighter(fighter)){appendSealedFighterCard(document,button,{baseURL:launch});$('fighter-grid').append(button);continue;}if(button.disabled)button.setAttribute('aria-label',fighter.name+' — locked');button.setAttribute('aria-pressed','false');const image=document.createElement('img');image.src=new URL(fighter.portrait,launch).href;image.alt='';image.width=90;image.height=90;image.loading='lazy';const name=document.createElement('span');name.textContent=fighter.name;button.append(image,name);button.addEventListener('click',()=>choose(fighter.id));$('fighter-grid').append(button);}if(!destroyed&&!suspended){renderFighterPage();if(tournamentIntent||tournamentLinkError)await prepareTournament();else if(!await restoreSeat())refreshRooms();raf=window.requestAnimationFrame(menuTick);}}catch(error){status(error.message);$('create-room').disabled=true;$('join-room').disabled=true;}
 return {destroy(){if(destroyed)return;destroyed=true;music.destroy();screenControls.destroy();const previous=seat;resetRoom();if(previous)void client.releaseSeat(previous).catch(()=>{});window.cancelAnimationFrame(raf);raf=null;window.removeEventListener('keydown',keydown);window.removeEventListener('message',router);window.removeEventListener('pagehide',unload);window.removeEventListener('pageshow',restore);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);}};
}
if(globalThis.document?.getElementById('online-lobby'))mountOnlineLobby();
