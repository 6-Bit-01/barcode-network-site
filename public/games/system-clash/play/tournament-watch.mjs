import {ONLINE_SCOPE,ONLINE_STAGES,validPayload,validOnlineMatchRules} from './online-protocol.mjs';
import {createGameScreenHost} from './game-screen-host.mjs';
import {bindGameScreenControls} from './game-screen-controls.mjs';
export function featuredFightURL(base,{fighters,stage,matchId}){
 if(!Array.isArray(fighters)||fighters.length!==2||!fighters.every(f=>/^[a-z0-9-]{1,40}$/.test(f.id)&&typeof f.name==='string'&&f.name.length<=80)||!ONLINE_STAGES.includes(stage)||!Number.isSafeInteger(matchId)||matchId<1)throw new Error('Featured fighters are unavailable.');
 const url=new URL('fight.html',base);for(const[k,v]of Object.entries({demo:'1',online:'1',seat:'1',spectator:'1',mode:'local',p1:fighters[0].id,p2:fighters[1].id,name1:fighters[0].name,name2:fighters[1].name,stage,matchId:String(matchId),sound:'1'}))url.searchParams.set(k,v);return url;
}
// Spectators mirror the source pause state locally; they never send commands to a game room.
export function featuredSnapshotPackets(snapshot){return [{type:'pause',paused:snapshot.state.paused,reason:snapshot.state.pauseReason||'manual',snapshotSeq:Math.max(0,snapshot.seq-1)},{type:'snapshot',snapshot}];}
// Fast responses keep a 125 ms request-start cadence. Slow services get breathing
// room instead of another request immediately after the previous one finishes.
export function featuredPollDelay(elapsed,{failed=false,hidden=false}={}){
 if(hidden)return 1000;
 if(failed)return Math.min(5000,Math.max(1000,elapsed));
 return elapsed>=250?Math.min(1500,elapsed):Math.max(25,125-elapsed);
}
export function featuredBroadcastIdentity({tournament,match}){
 if(!match)return null;
 if(typeof tournament.broadcastId!=='string'||!/^[a-f0-9]{64}$/.test(tournament.broadcastId))throw new Error('Refresh to load the current featured match.');
 return tournament.currentBoutId+'/'+match.matchId+'/'+tournament.broadcastId;
}
export async function mountFeaturedMatch({window=globalThis.window,document=globalThis.document,fetch=globalThis.fetch}={}){
 const launch=new URL(window.location.href),code=launch.searchParams.get('event')||launch.searchParams.get('code'),$=id=>document.getElementById(id),host=createGameScreenHost({window,document}),controls=bindGameScreenControls(host,{document});let timer=null,destroyed=false,loaded=false,identity=null,current=null,lastSeq=0,pending=false,nextDelay=125;
 const back=new URL('tournament-online.html',launch);if(code)back.searchParams.set('event',code);$('watch-back').href=back.href;$('watch-back').addEventListener('click',e=>{e.preventDefault();host.navigate(back);});
 const presentation=()=>{const doc=$('watch-frame').contentDocument;if(!doc||doc.querySelector('#spectator-presentation'))return;const style=doc.createElement('style');style.id='spectator-presentation';style.textContent='body.demo.game-screen-page{padding:0!important;--game-bar-height:0px;--fight-touch-space:0px}#demo-toolbar,.touch-controls,.match-controls,.online-session-score,.controller-status,.status-row,.bezel-label,header,footer,.instructions{display:none!important}.demo.game-screen-page main{height:100dvh!important;max-width:none;padding:0!important}.demo.game-screen-page .arena{grid-template-rows:1fr!important}.demo.game-screen-page .screen-bezel{width:min(100%,calc((100dvh - 4px)*16/9));padding:0;border:0;box-shadow:none}.game-screen-page .asset-loading{top:0}';doc.head.append(style);doc.addEventListener('keydown',event=>{if(event.key!=='Tab')event.preventDefault();event.stopImmediatePropagation();},true);};$('watch-frame').addEventListener('load',presentation);
 function send(payload){if(!loaded||!current||!validPayload(payload))return false;$('watch-frame').contentWindow?.postMessage({scope:ONLINE_SCOPE,matchId:current.matchId,payload},launch.origin);return true;}
 function snapshot(){if(loaded&&current?.snapshot&&current.snapshot.seq>lastSeq){for(const packet of featuredSnapshotPackets(current.snapshot))send(packet);lastSeq=current.snapshot.seq;}}
 const listener=e=>{if(e.origin!==launch.origin||e.source!==$('watch-frame').contentWindow||e.data?.scope!==ONLINE_SCOPE||e.data.matchId!==current?.matchId)return;if(e.data.payload?.type==='loaded'){loaded=true;lastSeq=0;send({type:'start',seed:0,matchId:current.matchId,rules:current.rules});snapshot();}else if(e.data.payload?.type==='started')snapshot();};window.addEventListener('message',listener);
 async function refresh(){if(destroyed||pending)return;pending=true;const started=performance.now();let failed=false;try{
  const response=await fetch('/api/games/system-clash/tournaments/watch?code='+encodeURIComponent(code||''),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}),data=await response.json();if(!response.ok){const error=new Error(data.error||'Featured match unavailable.');error.status=response.status;throw error;}
  $('watch-title').textContent=data.tournament.title;const match=data.match;if(!match){current=null;loaded=false;identity=null;lastSeq=0;$('watch-frame').hidden=true;$('watch-waiting').hidden=false;$('watch-status').textContent=data.tournament.status==='complete'?'Tournament complete. Return to the bracket for the champion.':'Waiting for the featured match.';return;}
  if(!validOnlineMatchRules(data.tournament.rules))throw new Error('Refresh to load the saved tournament rules.');current={...match,rules:data.tournament.rules};const key=featuredBroadcastIdentity(data);
  if(key!==identity){identity=key;loaded=false;lastSeq=0;$('watch-frame').src=featuredFightURL(launch,match).href;}
  $('watch-frame').hidden=false;$('watch-waiting').hidden=true;const age=Date.now()-match.updatedAt;$('watch-status').textContent=age>1500?'Broadcast interrupted. Waiting for fresh frames…':match.fighters[0].name+' vs '+match.fighters[1].name+' · ROUND '+data.tournament.round+' · Spectator view';if(age<=1500)snapshot();
 }catch(error){failed=true;$('watch-status').textContent=error.message;if(error.status===401||error.status===403){$('watch-frame').hidden=true;$('watch-waiting').hidden=false;$('watch-note').textContent='Use your BARCODE website account to watch online.';$('watch-signin').hidden=false;$('watch-signin').href='/account?returnTo='+encodeURIComponent(launch.pathname+launch.search);}}finally{pending=false;nextDelay=featuredPollDelay(performance.now()-started,{failed});}}
 await refresh();const tick=async()=>{if(destroyed)return;if(document.hidden)nextDelay=featuredPollDelay(0,{hidden:true});else await refresh();if(!destroyed)timer=window.setTimeout(tick,nextDelay);};timer=window.setTimeout(tick,nextDelay);const destroy=()=>{destroyed=true;window.clearTimeout(timer);window.removeEventListener('message',listener);$('watch-frame').removeEventListener('load',presentation);controls.destroy();};window.addEventListener('pagehide',destroy,{once:true});return {refresh,destroy};
}
if(typeof document!=='undefined')void mountFeaturedMatch();