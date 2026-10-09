import {MUSIC_MANIFEST} from './assets/audio/music/manifest.mjs';
const OWNER='__systemClashMusicOwnerV1';
/** Level themes own gameplay by default; Character themes is an explicit local preference. */
export function resolveMusicTrack(manifest,scene={}){
 let id;
 if(scene.screen==='fight'){
  const stageId=manifest.stages?.[scene.stage],variants=manifest.fighters?.[scene.fighter];
  if(scene.musicStyle!=='fighter'&&manifest.tracks?.[stageId])id=stageId;
  else if(Array.isArray(variants)&&variants.length){const value=Number(scene.variant);const variant=Number.isInteger(value)&&value>=0?value:0;id=variants[variant%variants.length];}
  else id=manifest.stages?.[scene.stage];
 }else if(scene.screen==='arena')id=manifest.stages?.[scene.stage];
 else id=manifest.menus?.[scene.screen];
 const track=manifest.tracks?.[id];return track?{id,...track}:null;
}
function musicHost(win){let owner=win,current=win;try{for(let depth=0;depth<10&&current?.parent&&current.parent!==current;depth++){current=current.parent;if(current.document?.documentElement?.dataset?.systemClashHost==='1')owner=current;}}catch{}return owner;}
function trackURL(track,base){if(!/^assets\/audio\/music\/[a-z0-9-]+\.mp3$/.test(track?.file??''))return null;try{const root=new URL('.',base),url=new URL(track.file,root);return url.origin===root.origin&&url.pathname.startsWith(root.pathname+'assets/audio/music/')?url.href:null;}catch{return null;}}
function createMusicOwner(win,{manifest,baseURL,volume,fadeMs}){
 const doc=win.document;let media=null,token=null,desired=null,source=null,muted=false,paused=false,unlocked=false,timer=null,fadeRevision=0,playRevision=0;
 const targetVolume=Math.max(0,Math.min(1,Number(volume)||.28)),duration=Math.max(0,Number(fadeMs)||0);
 const setTimer=win.setTimeout?.bind(win)??globalThis.setTimeout,clearTimer=win.clearTimeout?.bind(win)??globalThis.clearTimeout;
 const canPlay=()=>!!media&&unlocked&&!muted&&!paused&&!doc?.hidden;
 // Pausing or replacing a source invalidates any older asynchronous play result.
 function pauseMedia(){playRevision++;media?.pause();}
 function cancelFade(){fadeRevision++;if(timer!==null)clearTimer(timer);timer=null;}
 function fade(value,done=()=>{}){
  cancelFade();if(!media)return done();const revision=fadeRevision,start=media.volume;let elapsed=0;
  if(!duration){media.volume=value;done();return;}
  const step=()=>{if(revision!==fadeRevision)return;elapsed+=30;media.volume=Math.max(0,Math.min(1,start+(value-start)*Math.min(1,elapsed/duration)));if(elapsed>=duration){timer=null;done();}else timer=setTimer(step,30);};timer=setTimer(step,30);
 }
 function ensureMedia(){if(media)return true;try{if(typeof win.Audio!=='function')return false;media=new win.Audio();media.loop=true;media.preload='none';media.volume=0;return true;}catch{return false;}}
 function replaceSource(){if(!ensureMedia()||!desired)return;pauseMedia();media.volume=0;media.src=desired.url;source=desired.url;}
 function play(){
  if(!canPlay())return Promise.resolve(false);if(!media.paused)return Promise.resolve(true);
  const revision=++playRevision;let pending;try{pending=media.play();}catch{return Promise.resolve(false);}
  return Promise.resolve(pending).then(()=>{
   if(revision!==playRevision)return false;
   if(!canPlay()){pauseMedia();return false;}fade(targetVolume);return true;
  },()=>{if(revision!==playRevision)return false;unlocked=false;cancelFade();return false;});
 }
 function sync(){
  if(!desired){cancelFade();pauseMedia();return;}
  if(!ensureMedia())return;
  media.muted=muted;
  if(!canPlay()){cancelFade();pauseMedia();if(source!==desired.url)replaceSource();return;}
  if(source!==desired.url){
   if(!media.paused&&media.volume>0){fade(0,()=>{replaceSource();void play();});return;}
   cancelFade();replaceSource();
  }
  void play();
 }
 doc?.addEventListener?.('visibilitychange',sync);
 return {
  select(client,scene,settings){const track=resolveMusicTrack(manifest,scene),url=trackURL(track,baseURL),next=url?{...track,url}:null;const changed=token!==client||muted!==settings.muted||paused!==settings.paused||desired?.id!==next?.id||desired?.url!==next?.url;token=client;muted=settings.muted;paused=settings.paused;desired=next;if(changed)sync();},
  setState(client,settings){if(token!==client||(muted===settings.muted&&paused===settings.paused))return;muted=settings.muted;paused=settings.paused;sync();},
  unlock(client){if(token!==client)return Promise.resolve(false);unlocked=true;if(desired&&source!==desired.url)replaceSource();return play();},
  release(client){if(token!==client)return;paused=true;sync();},
  get track(){return desired?.id??null;}
 };
}
/** Foreground clients share the top same-origin game host's streaming player. */
export function createGameMusic({window:win=globalThis.window,document:doc=globalThis.document,manifest=MUSIC_MANIFEST,baseURL=win?.location?.href??import.meta.url,muted=false,volume=.28,fadeMs=360}={}){
 const host=musicHost(win),client=Symbol('music-screen');
 const owner=host?.[OWNER]??createMusicOwner(host??{}, {manifest,baseURL,volume,fadeMs});if(host&&!host[OWNER])host[OWNER]=owner;
 let scene=null,localMuted=!!muted,localPaused=false,suspended=false,destroyed=false;
 const settings=()=>({muted:localMuted,paused:localPaused||suspended});
 const update=()=>{if(!destroyed)owner.setState(client,settings());};
 function unlock(){return destroyed||suspended?Promise.resolve(false):owner.unlock(client);}
 const gesture=event=>{if(event?.isTrusted===true&&!event.repeat)void unlock();};
 doc?.addEventListener?.('pointerdown',gesture);doc?.addEventListener?.('keydown',gesture);
 return {
  setScene(value){if(destroyed)return;scene=value;if(!suspended)owner.select(client,value,settings());},
  setMuted(value){localMuted=!!value;update();},
  setPaused(value){if(localPaused===!!value)return;localPaused=!!value;update();},
  unlock,
  suspend(){if(destroyed)return;suspended=true;update();},
  resume(){if(destroyed)return;suspended=false;if(scene)owner.select(client,scene,settings());},
  get currentTrack(){return owner.track;},
  destroy(){if(destroyed)return;destroyed=true;owner.release(client);doc?.removeEventListener?.('pointerdown',gesture);doc?.removeEventListener?.('keydown',gesture);}
 };
}
