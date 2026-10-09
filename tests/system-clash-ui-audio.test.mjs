import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as audio from '../public/games/system-clash/play/fight-audio.mjs';
const types=['ui-select','ui-move','ui-confirm','ui-back','ui-options','ui-invalid-code','ui-unlock','ui-start'];
test('eight menu actions have distinct gentle interface cues without combat or character voices',()=>{
 const signatures=[];
 for(const type of types){const plan=audio.planFightSound({type,attackerId:'mutilator',victimId:'6-bit'});assert.equal(plan.uiSound,true,type);assert.equal(plan.contact,'interface');assert.deepEqual(plan.voices,[]);assert.ok(plan.layers.length>=1);assert.ok(plan.layers.every(l=>l.kind==='tone'&&l.gain<=.18&&l.duration<=.55));assert.ok(plan.uiAsset);signatures.push(JSON.stringify(plan.layers));}
 assert.equal(new Set(signatures).size,8);
 assert.equal(audio.planFightSound({type:'ui-unrecognized'}).uiSound,undefined);
});
test('the exact CC0 menu bank has eight short valid unique PCM derivatives with bounded total decode memory',()=>{
 assert.ok(Array.isArray(audio.UI_SOUND_ASSETS));assert.equal(audio.UI_SOUND_ASSETS.length,8);
 let bytes=0;const hashes=[];
 for(const asset of audio.UI_SOUND_ASSETS){const data=readFileSync(new URL('../public/games/system-clash/play/'+asset.path,import.meta.url));assert.equal(data.length,asset.bytes);assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);assert.ok(asset.duration>0&&asset.duration<1);assert.equal(asset.sampleRate,22050);assert.equal(asset.channels,1);hashes.push(asset.sha256);bytes+=asset.bytes;}
 assert.equal(new Set(hashes).size,8);assert.ok(bytes<220000);
});

class Param{
  constructor(value=0){this.value=value;this.commands=[];}
  setValueAtTime(v,t){this.value=v;this.commands.push(['set',v,t]);}
  exponentialRampToValueAtTime(v,t){this.commands.push(['ramp',v,t]);}
  setTargetAtTime(v,t,c){this.value=v;this.commands.push(['target',v,t,c]);}
  cancelScheduledValues(t){this.commands.push(['cancel',t]);}
}
class Node{
  constructor(context){this.context=context;this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.disconnected=false;}
  connect(node){this.output=node;return node;}
  disconnect(){this.disconnected=true;}
  start(...args){this.started=args;}
  stop(at){this.stopped=at;}
  end(){this.onended?.();}
}
class FakeContext{
  constructor(){this.currentTime=0;this.sampleRate=22050;this.state='suspended';this.destination={};this.sources=[];this.nodes=[];this.resumeCount=0;}
  createGain(){const node=new Node(this);this.nodes.push(node);return node;}
  createOscillator(){const node=new Node(this);this.sources.push(node);return node;}
  createBufferSource(){const node=new Node(this);this.sources.push(node);return node;}
  createBiquadFilter(){return new Node(this);}
  createWaveShaper(){return new Node(this);}
  createDynamicsCompressor(){return Object.assign(new Node(this),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,new Param()])));}
  createBuffer(channels,length,rate){const data=new Float32Array(length);return {duration:length/rate,getChannelData:()=>data};}
  async decodeAudioData(){return this.createBuffer(1,22050,22050);}
  async resume(){this.state='running';this.resumeCount++;}
}

const flushUI=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
function uiFixture({hold=false,menu=true}={}){const context=new FakeContext();context.decodeAudioData=async bytes=>context.createBuffer(1,Math.max(1,Math.floor(bytes.byteLength/2)),22050);let release;const barrier=hold?new Promise(r=>release=r):Promise.resolve();const calls=[];let active=0,maxActive=0;const fetch=async url=>{const spec=audio.UI_SOUND_ASSETS.find(a=>String(url).endsWith(a.path));if(!spec)return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};calls.push(spec.id);active++;maxActive=Math.max(maxActive,active);await barrier;active--;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(spec.bytes)};};return {context,player:audio.createFightAudio({contextFactory:()=>context,fetch,uiSounds:menu}),calls,release:()=>release?.(),maxActive:()=>maxActive};}
test('a cold UI cue is immediate and a delayed asset cannot replay it after mute or pause',async()=>{
 const f=uiFixture({hold:true});assert.equal(f.player.emit({type:'ui-start'}),false);assert.equal(f.context.sources.length,0);
 assert.equal(await f.player.startAudio(),true,'UI asset loading does not block genuine gesture unlock');
 assert.equal(f.player.emit({type:'ui-start'}),true);assert.equal(f.player.getStats().uiFallbackPlayed,1);assert.equal(f.player.getStats().playedVoices,0);
 f.player.setMuted(true);f.player.setPaused(true);const sources=f.context.sources.length;f.release();await flushUI();assert.equal(f.context.sources.length,sources,'loads cache future cues without replay callbacks');assert.equal(f.player.getStats().activeGroups,0);
 f.player.setMuted(false);assert.equal(f.player.emit({type:'ui-start'}),false);f.player.setPaused(false);f.context.currentTime=1;assert.equal(f.player.emit({type:'ui-start'}),true);assert.equal(f.player.getStats().uiRecordedPlayed,1);assert.ok(f.context.sources.at(-1).buffer);
});
test('tiny menu preparation is bounded to two concurrent requests and eight cached cues',async()=>{
 const f=uiFixture({hold:true});await f.player.startAudio();assert.equal(f.maxActive(),2);assert.equal(f.calls.length,2);f.release();await flushUI();assert.equal(f.player.getStats().uiCached,8);assert.equal(f.calls.length,8);assert.equal(new Set(f.calls).size,8);assert.ok(f.player.getStats().uiCacheBytes<=768000);
 await f.player.startAudio();await flushUI();assert.equal(f.calls.length,8,'later gestures reuse the original decode bank');
 for(let i=0;i<80;i++){f.context.currentTime+=.03;f.player.emit({type:'ui-move'});}assert.ok(f.player.getStats().activeGroups<=10);assert.equal(f.player.getStats().playedVoices,0);f.player.clear();assert.equal(f.player.getStats().activeGroups,0);
});

test('combat-only unlock keeps menu samples lazy until an actual UI event needs one',async()=>{const f=uiFixture({menu:false});await f.player.startAudio();await flushUI();assert.equal(f.calls.length,0);assert.equal(f.player.emit({type:'ui-select'}),true);await flushUI();assert.deepEqual(f.calls,['select']);});

test('BNL owns four computational articulations and Foley gestures per mode rather than robot reskins',async()=>{
 const {CHARACTER_FOLEY_PALETTES,planCharacterFoley}=await import('../public/games/system-clash/play/fight-audio-palettes.mjs');
 assert.ok(audio.FIGHT_AUDIO_PROFILES['bnl-01']);assert.equal(audio.FIGHT_VOCAL_BANKS['bnl-01'].family,'computational-resonance');
 for(const mode of ['attack','hurt','big-hurt','scream']){const hashes=[];for(let variant=0;variant<4;variant++){const data=audio.renderFightVocal('bnl-01',mode,22050,variant);assert.ok(data.every(Number.isFinite));const hash=createHash('sha256').update(new Uint8Array(data.buffer)).digest('hex');hashes.push(hash);for(const peer of ['cache-back','lyra','9-bit'])assert.notEqual(hash,createHash('sha256').update(new Uint8Array(audio.renderFightVocal(peer,mode,22050,variant).buffer)).digest('hex'));}assert.equal(new Set(hashes).size,4);}
 const palette=CHARACTER_FOLEY_PALETTES['bnl-01'];assert.ok(palette);assert.equal(palette.gestures.length,4);assert.equal(new Set(palette.gestures.map(g=>JSON.stringify(g))).size,4);for(let variant=0;variant<4;variant++){const plan=planCharacterFoley({type:'attack',attackerId:'bnl-01'},{variant});assert.equal(plan.fighterId,'bnl-01');assert.ok(plan.layers.length);assert.ok(plan.layers.every(l=>Number.isFinite(l.gain)&&l.duration>0));}
});


test('the first title Start waits only for actual browser resume and keeps its complete cue',async()=>{
 const {runInNewContext}=await import('node:vm');const source=readFileSync(new URL('../public/games/system-clash/play/demo.mjs',import.meta.url),'utf8');
 const ui=source.split('\n').find(line=>line.startsWith('function uiSound(')),begin=source.split('\n').find(line=>line.startsWith('function begin('));
 const arena=source.split('\n').find(line=>line.startsWith("$('enter-arena').addEventListener"));assert.ok(!arena.includes("uiSound('ui-start')"),'arena handoff does not retrigger and truncate the title Start');
 const f=uiFixture({hold:true});let resume;f.context.resume=()=>new Promise(resolve=>resume=()=>{f.context.state='running';resolve();});
 runInNewContext(ui+';'+begin+";begin('cpu');",{audio:f.player,state:{},tournamentRun:null,gamepads:{reset(){}},beginDemoSelection:state=>state,render(){},focusSelection(){}});
 assert.equal(f.context.sources.length,0,'browser has not resumed yet');resume();await flushUI();
 assert.equal(f.player.getStats().uiFallbackPlayed,1,'first Start is audible without waiting for held network requests');assert.equal(f.player.getStats().playedVoices,0);
 const layers=audio.planFightSound({type:'ui-start'}).layers;assert.equal(f.context.sources.length,layers.length);for(const [index,node]of f.context.sources.entries())assert.ok(node.stopped-node.started[0]>=layers[index].duration,'every title Start layer retains its authored duration');
 f.release();await flushUI();assert.equal(f.player.getStats().uiFallbackPlayed,1,'background loads never replay the gesture');
 f.context.currentTime=1;assert.equal(await f.player.emitUISound('ui-start'),true);const recorded=f.context.sources.at(-1);assert.ok(recorded.stopped-recorded.started[0]>=.48,'warm Start retains its complete recorded duration');
});

test('pending browser resume cannot replay an obsolete, paused, muted, cleared or stale UI gesture',async()=>{
 for(const cancel of ['mute','pause','clear','stale']){
  const f=uiFixture({hold:true});let resume;f.context.resume=()=>new Promise(resolve=>resume=()=>{f.context.state='running';resolve();});let now=0;
  const player=audio.createFightAudio({contextFactory:()=>f.context,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}),uiNow:()=>now});
  const pending=player.emitUISound('ui-start');if(cancel==='mute'){player.setMuted(true);player.setMuted(false);}if(cancel==='pause'){player.setPaused(true);player.setPaused(false);}if(cancel==='clear')player.clear();if(cancel==='stale')now=500;
  resume();assert.equal(await pending,false,cancel);assert.equal(f.context.sources.length,0,cancel);
 }
 const f=uiFixture();let resume;f.context.resume=()=>new Promise(resolve=>resume=()=>{f.context.state='running';resolve();});const old=f.player.emitUISound('ui-start'),latest=f.player.emitUISound('ui-select');resume();assert.equal(await old,false);assert.equal(await latest,true);assert.equal(f.player.getStats().playedEvents,1);
});
