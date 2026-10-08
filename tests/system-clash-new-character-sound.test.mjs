import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {FIGHT_AUDIO_PROFILES,FIGHT_VOCAL_BANKS,renderFightVocal,planFightSound,CHARACTER_LINE_ASSETS} from '../public/games/system-clash/play/fight-audio.mjs';
import {CHARACTER_FOLEY_PALETTES} from '../public/games/system-clash/play/fight-audio-palettes.mjs';
import {planRecordedFoley} from '../public/games/system-clash/play/fight-foley.mjs';
test('puppet, cat cyborg and Ent have independent voice articulation and four takes for each reaction',()=>{
 const ids=['doofnoobler','lyra','papa-oak'];assert.equal(new Set(ids.map(id=>FIGHT_VOCAL_BANKS[id].family)).size,3);
 const hashes=new Set();for(const id of ids){assert.ok(FIGHT_AUDIO_PROFILES[id]);assert.ok(CHARACTER_FOLEY_PALETTES[id]);for(const mode of ['attack','hurt','big-hurt','scream'])for(let v=0;v<4;v++){
  const wave=renderFightVocal(id,mode,22050,v);assert.ok(wave.every(Number.isFinite));assert.ok(wave.length>1500);
  hashes.add(createHash('sha256').update(new Uint8Array(wave.buffer)).digest('hex'));
 }}assert.equal(hashes.size,48);
});
test('six stage warnings and activations are audible and distinct; wall breaking layers use matching materials',()=>{
 const ids=['radio-studio','sheila-office','studio-rat-lair','containment','nature-simulation','witty-wasteland'];const variants=[];
 for(const stageId of ids)for(const type of ['stage-warning','stage-activate']){const p=planFightSound({type,stageId});assert.ok(p.layers.length);assert.ok(p.layers.reduce((n,l)=>n+l.gain,0)<=.950001);variants.push(JSON.stringify(p.layers));}
 assert.equal(new Set(variants).size,12);
 for(const stageId of ids){const event={type:'wall-break',stageId},p=planFightSound(event),f=planRecordedFoley(event,p);assert.ok(p.layers.length);assert.ok(f.layers.some(l=>['wood','metal','glass'].includes(l.group)));}
});
test('soft hug is gentle and the spoken character line is fixed to the approved cue and exact words',()=>{
 const event={type:'deletion-cue',fighterId:'doofnoobler',attackerId:'doofnoobler',peaceful:true,cue:'hug-close'};
 const p=planFightSound(event),f=planRecordedFoley(event,p);assert.ok(p.layers.length);assert.equal(p.voices.length,0);
 assert.ok(f.layers.every(l=>l.group==='cloth'));assert.equal(CHARACTER_LINE_ASSETS.doofnoobler.text,'Stay soft, stay fuzzy, and stay kind.');
 assert.equal(planFightSound({type:'character-line',fighterId:'doofnoobler',cue:'stay-kind'}).characterLine,'doofnoobler');
 assert.equal(planFightSound({type:'character-line',fighterId:'doofnoobler',cue:'unapproved-custom-words'}).characterLine,null);
});
