import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMusicTrack} from '../public/games/system-clash/play/game-music.mjs';
import {MUSIC_MANIFEST} from '../public/games/system-clash/play/assets/audio/music/manifest.mjs';
test('Nature Simulation keeps its supplied level song when Player1 is6Bit',()=>{
 const track=resolveMusicTrack(MUSIC_MANIFEST,{screen:'fight',fighter:'6-bit',stage:'nature-simulation'});
 assert.equal(track.id,'nature-simulation');
 assert.match(track.title,/NATURE SIMULATION/);
});
test('Level themes use every supplied arena track independently of either fighter',()=>{
 for(const [stage,id] of Object.entries(MUSIC_MANIFEST.stages))for(const fighter of ['6-bit','lyra','mr-nice-guy']){
  assert.equal(resolveMusicTrack(MUSIC_MANIFEST,{screen:'fight',fighter,stage,musicStyle:'stage',variant:1}).id,id);
 }
});
test('Explicit Character themes preserves fighter music and uses level fallback for missing themes',()=>{
 assert.equal(resolveMusicTrack(MUSIC_MANIFEST,{screen:'fight',fighter:'6-bit',stage:'nature-simulation',musicStyle:'fighter'}).id,'6-bit');
 assert.equal(resolveMusicTrack(MUSIC_MANIFEST,{screen:'fight',fighter:'mr-nice-guy',stage:'nature-simulation',musicStyle:'fighter'}).id,'nature-simulation');
});
