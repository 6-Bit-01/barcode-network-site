import test from 'node:test';
import assert from 'node:assert/strict';
import {drawNewDeletionScene} from '../public/games/system-clash/play/new-deletion-renderer.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
import {createFightEffects} from '../public/games/system-clash/play/fight-effects.mjs';

// Mutations caught: restoring an unrelated hug halo, or emitting particle cues
// for peaceful contact/release/dialogue, instead of the intact authored bodies.
test('Soft Power has no extra geometry around either native hug facing',()=>{
 const definition=deletionDefinition('doofnoobler'),calls=[];
 const ctx=new Proxy({}, {get:(_,method)=>(...args)=>calls.push({method,args})});
 for(const direction of [-1,1])for(const time of [definition.beats.hugContact,1500,definition.beats.release-1])for(const front of [false,true]){
  calls.length=0;
  const match={winner:0,fighters:[{id:'doofnoobler'},{id:'9-bit'}],deletionElapsed:time,_deletionOrigin:{direction,target:780}};
  drawNewDeletionScene(ctx,match,{},[{x:500,y:-30},{x:780,y:0}],[],front);
  assert.equal(calls.length,0,'The peaceful scene adds no ring, line, glow or substitute prop to its whole native bodies');
 }
});

test('peaceful hug contacts, release and stay-kind dialogue keep audio without added combat particles',()=>{
 const heard=[],audio={emit(event){heard.push(event);},clear(){},getStats(){return {};}};
 const fx=createFightEffects({seed:13,audio});
 const events=[{type:'deletion',peaceful:true},{type:'deletion-cue',cue:'hug-contact',peaceful:true},{type:'deletion-cue',cue:'hug-release',peaceful:true},{type:'character-line',cue:'stay-kind',line:'Stay soft, stay fuzzy, and stay kind.',fighterId:'doofnoobler',peaceful:true}];
 for(const event of events)fx.emit(event);
 assert.equal(fx.getStats().particles,0);assert.equal(fx.getStats().chunks,0);assert.equal(fx.getStats().decals,0);assert.equal(fx.getStats().smears,0);assert.equal(fx.getStats().shake,0);assert.equal(fx.flash,0);
 assert.deepEqual(heard.map(({strength,...event})=>event),events,'All choreographed audio cues and the exact dialogue reach their existing audio owner');
});
