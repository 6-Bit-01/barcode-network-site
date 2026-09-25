import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function fixture({mime='audio/mpeg',status=200,sdkReady=true}={}){
  const events=new Map(),requests=[],loads=[],commands=[];let current,options;
  const player={isConnected:true,isPaused:true,playerState:'PAUSED',currentTime:0,duration:150,canSeek:true,volumeLevel:.5,isMuted:false};
  const emit=()=>{for(const fn of events.get('change')??[])fn();};
  const media={media:{contentId:''},idleReason:undefined,play(_r,ok){commands.push('play');player.isPaused=false;player.playerState='PLAYING';emit();ok();},pause(_r,ok){commands.push('pause');player.isPaused=true;player.playerState='PAUSED';emit();ok();}};
  const session={loadMedia:async request=>{loads.push(request);media.media=request.media;player.currentTime=request.currentTime;player.isPaused=true;player.playerState='PAUSED';emit();},getMediaSession:()=>media,getCastDevice:()=>({friendlyName:'Fixture receiver'})};
  const add=(type,fn)=>{if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);};
  const remove=(type,fn)=>events.get(type)?.delete(fn);
  const context={setOptions:v=>options=v,getCastState:()=> 'NOT_CONNECTED',getCurrentSession:()=>current,requestSession:()=>{commands.push('picker');current=session;return Promise.resolve();},endCurrentSession:stop=>{commands.push(['disconnect',stop]);current=null;},addEventListener:add,removeEventListener:remove};
  const remoteController={playOrPause(){throw Error('Must not toggle a stale paused flag');},seek(){commands.push(['seek',player.currentTime]);},setVolumeLevel(){commands.push(['volume',player.volumeLevel]);},muteOrUnmute(){player.isMuted=!player.isMuted;},addEventListener:add,removeEventListener:remove};
  const mediaSdk={DEFAULT_MEDIA_RECEIVER_APP_ID:'fixture-default',MediaInfo:class{constructor(contentId,contentType){Object.assign(this,{contentId,contentType});}},LoadRequest:class{constructor(media){this.media=media;}}};
  const target={location:{origin:'https://barcode.test'},setTimeout,clearTimeout,chrome:{cast:{media:mediaSdk,AutoJoinPolicy:{PAGE_SCOPED:'page'}}},cast:{framework:{CastContext:{getInstance:()=>context},RemotePlayer:class{constructor(){return player;}},RemotePlayerController:class{constructor(){return remoteController;}},RemotePlayerEventType:{ANY_CHANGE:'change'},CastContextEventType:{CAST_STATE_CHANGED:'state',SESSION_STATE_CHANGED:'session'}}}};
  const readyCast=target.cast,readyChrome=target.chrome.cast,scripts=[];
  const installSDK=()=>{target.cast=readyCast;target.chrome.cast=readyChrome;};
  if(!sdkReady){delete target.cast;delete target.chrome.cast;}
  function load(file){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,AbortSignal,Set,window:target,document:{createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}},fetch:async(...args)=>{requests.push(args);return new Response(null,{status,headers:{'Content-Type':mime}});},require:id=>id.startsWith('@/')?load('src/'+id.slice(2)+'.ts'):require(id)});return mod.exports;}
  return {api:load('src/lib/site-audio-cast.ts'),requests,loads,commands,options:()=>options,media,player,emit,events,context,target,scripts,installSDK};
}
const track={showId:'show & 1',audioId:'take/2',key:'show:take',availability:'available',src:'https://private.test/admin?token=never-forward',title:'Test music',artist:'BNL-01'};
test('Cast initialization stays silent; the explicit picker uses the default receiver without automatic joining',async()=>{
  const f=fixture();const picker=await f.api.prepareCast();assert.equal(f.commands.length,0);assert.equal(f.options().resumeSavedSession,false);assert.equal(f.options().autoJoinPolicy,'page');assert.equal(f.options().receiverApplicationId,'fixture-default');
  const promise=picker.choose();assert.equal(f.commands[0],'picker');const output=await promise;assert.equal(output.label,'Fixture receiver');assert.equal(f.loads.length,0);
});
test('sender script error or timeout permits an explicit retry without refreshing the page',async()=>{
  for(const failure of ['error','timeout']){
    const f=fixture({sdkReady:false});let timeout;
    f.target.setTimeout=fn=>{timeout=fn;return 1;};f.target.clearTimeout=()=>{};
    const first=f.api.prepareCast();assert.equal(f.scripts.length,1);
    if(failure==='error')f.scripts[0].onerror();else timeout();
    await assert.rejects(first);
    const retry=f.api.prepareCast();assert.notEqual(first,retry);assert.equal(f.scripts.length,2);
    f.installSDK();f.target.__onGCastApiAvailable(true);
    const picker=await retry;assert.equal(picker.available(),true);assert.equal(f.commands.length,0);
  }
});
test('receiver loads use validated public media and actual MIME, omit credentials and remain paused until Play',async()=>{
  const f=fixture({mime:'audio/wav'}), output=await(await f.api.prepareCast()).choose();await output.load(track,39);
  const [url,init]=f.requests[0];assert.equal(new URL(url).origin,'https://barcode.test');assert.equal(new URL(url).searchParams.get('public'),'1');assert.equal(new URL(url).searchParams.get('showId'),track.showId);assert.equal(new URL(url).searchParams.get('audioId'),track.audioId);assert.ok(!url.includes('token'));
  assert.equal(init.method,'HEAD');assert.equal(init.credentials,'omit');assert.equal(f.loads[0].autoplay,false);assert.equal(f.loads[0].currentTime,39);assert.equal(f.loads[0].media.contentType,'audio/wav');assert.equal(f.commands.includes('play'),false);
  output.play();assert.equal(f.commands.at(-1),'play');output.pause();assert.equal(f.commands.at(-1),'pause');
});
test('unpublished responses and unsupported media never reach the receiver',async()=>{
  for(const options of [{status:404},{mime:'text/html'}]){const f=fixture(options), output=await(await f.api.prepareCast()).choose();await assert.rejects(output.load(track,0));assert.equal(f.loads.length,0);}
});
test('only natural completion maps to ended; receiver errors, cancellation and session ending remain distinct',async()=>{
  const f=fixture(), output=await(await f.api.prepareCast()).choose();await output.load(track,0);f.player.playerState='IDLE';
  f.media.idleReason='FINISHED';assert.equal(output.getState().status,'ended');f.media.idleReason='ERROR';assert.equal(output.getState().status,'error');f.media.idleReason='CANCELLED';assert.equal(output.getState().status,'paused');
  let updates=0;const detach=output.subscribe(()=>updates++);f.emit();assert.equal(updates,1);detach();f.emit();assert.equal(updates,1);assert.equal(f.events.get('session').size,0);
  f.player.isConnected=false;assert.equal(output.getState().connected,false);assert.ok(f.context.getCurrentSession());f.player.isConnected=true;
  output.disconnect();assert.equal(output.getState().connected,false);assert.deepEqual(f.commands.at(-1),['disconnect',true]);
});
