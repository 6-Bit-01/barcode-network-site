import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,advanceMatch,performAction,getFighterView,consumeEvents,FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
import {deletionDefinition,deletionPose} from '../public/games/system-clash/play/deletion-library.mjs';
import {createFightEffects} from '../public/games/system-clash/play/fight-effects.mjs';
const heights={doofnoobler:220,lyra:320,'papa-oak':385};
const victimClips=Object.fromEntries(['delete-brace','delete-suspended','delete-compressed','delete-crumpled','delete-present','delete-hug','delete-claw','delete-litter-kick','delete-rip','knockdown'].map(id=>[id,{duration:1100,contactMs:300}]));
function advance(match,ms){while(ms>0){const dt=Math.min(100,ms);advanceMatch(match,dt);ms-=dt;}}
function ending(id,dir=1){const match=createMatch({mode:'local',start:false,fighters:[{id,height:heights[id]},{id:'9-bit',height:368}],clips:[victimClips,victimClips]});Object.assign(match,{phase:'finish',winner:0,finishRemaining:7000});match.fighters[0].x=dir===1?500:780;match.fighters[1].x=match.fighters[0].x+dir*160;match.fighters[1].hp=0;performAction(match,0,'deletion');consumeEvents(match);return match;}

test('three new styles preserve small quick feints, agile claws and heavy rooted grabs',()=>{
 const d=FIGHTER_STYLES.doofnoobler,l=FIGHTER_STYLES.lyra,p=FIGHTER_STYLES['papa-oak'];assert(d&&l&&p);
 assert(d.tempo.punch<.85&&d.reach.punch<1);assert(l.moveSpeed>280&&l.punchDamage>d.punchDamage);assert(p.throwDamage>1.7&&p.moveSpeed<210&&p.knockback.throw>1.2);
 assert.equal(createMatch({fighters:[{id:'papa-oak'},{id:'doofnoobler'}]}).fighters[0].height,385);assert.equal(createMatch({fighters:[{id:'lyra'},{id:'doofnoobler'}]}).fighters[1].height,220);
});

for(const dir of [-1,1])test(`Doof's warm hug is a peaceful grounded KO with one exact line (${dir})`,()=>{
 const definition=deletionDefinition('doofnoobler');assert(definition?.peaceful);assert.equal(definition.mechanism,'hug');const match=ending('doofnoobler',dir);assert.equal(match.phase,'deletion');
 advance(match,definition.beats.hugContact);const hug=getFighterView(match,0);assert.equal(hug.clip,'delete-hug');assert.equal(hug.y,0);
 advance(match,definition.duration+500);const events=consumeEvents(match),lines=events.filter(event=>event.type==='character-line');assert.equal(lines.length,1);assert.equal(lines[0].cue,'stay-kind');assert.equal(lines[0].line,'Stay soft, stay fuzzy, and stay kind.');assert.equal(lines[0].fighterId,'doofnoobler');
 assert(events.every(event=>event.peaceful),'Every hug event suppresses generic gore and hard impact audio');assert(!events.some(event=>event.type==='deletion-impact'||event.type==='hit'));
 const target=getFighterView(match,1);assert.equal(target.clip,'knockdown');assert.equal(target.opacity,1);assert.equal(target.y,0);assert.equal(match.phase,'over');
});

for(const dir of [-1,1])test(`Lyra scratches, turns and kicks litter with a stationary whole-body root (${dir})`,()=>{
 const definition=deletionDefinition('lyra');assert.equal(definition?.mechanism,'litter-box');const match=ending('lyra',dir);advance(match,definition.beats.scratch1);
 assert.equal(getFighterView(match,0).clip,'delete-claw');advance(match,definition.beats.kick-definition.beats.scratch1);const kick=getFighterView(match,0);assert.equal(kick.clip,'delete-litter-kick');assert.equal(kick.facing,dir===1?'left':'right');assert.equal(kick.y,0);
 const x=kick.x;advance(match,definition.beats.buried-definition.beats.kick);assert.equal(getFighterView(match,0).x,x,'Kick and burial never slide Lyra along the floor');assert.equal(getFighterView(match,1).opacity,0);
 const events=consumeEvents(match);assert.equal(events.filter(event=>event.cue==='claw-cut').length,2);assert.equal(events.filter(event=>event.cue==='litter-kick').length,1);
});

for(const dir of [-1,1])test(`Oak holds an intact victim until a single horizontal rip, retaining both masked halves (${dir})`,()=>{
 const definition=deletionDefinition('papa-oak');assert.equal(definition?.mechanism,'rip');const match=ending('papa-oak',dir);advance(match,definition.beats.rip-10);assert.equal(getFighterView(match,1).splitBody,undefined);
 advance(match,20);assert(getFighterView(match,1).splitBody);advance(match,definition.duration);const victim=getFighterView(match,1);assert.equal(victim.opacity,1);assert.equal(victim.clip,'knockdown');assert(victim.splitBody.gap>80);assert.equal(victim.y,0);
 const events=consumeEvents(match).filter(event=>event.cue==='oak-rip');assert.equal(events.length,1);assert.equal(events[0].damageKind,'cut');
});

test('peaceful scene effects make no blood, chunks or red impact flash and preload only selected speech',async()=>{
 const emitted=[],prepared=[],audio={emit:event=>emitted.push(event),prepareCharacterLines:async ids=>{prepared.push(ids);return true;},getStats:()=>({}),setReducedMotion(){},setMuted(){},setPaused(){},clear(){},startAudio(){return false;}};
 const fx=createFightEffects({audio});fx.emit({type:'deletion-impact',cue:'hug-contact',peaceful:true,x:600,y:500,strength:2});fx.emit({type:'character-line',cue:'stay-kind',peaceful:true});
 const stats=fx.getStats();assert.equal(stats.bloodParticles,0);assert.equal(stats.chunks,0);assert.equal(stats.decals,0);assert.equal(fx.flash,0);assert.equal(emitted.length,2);
 assert.equal(await fx.prepareCharacterAudio(['doofnoobler']),true);assert.deepEqual(prepared,[['doofnoobler']]);
});


for(const dir of [-1,1])test(`Lyra approaches while the grounded opponent stays in place at either wall (${dir})`,()=>{
 const match=createMatch({mode:'practice',fighters:[{id:'lyra'},{id:'9-bit'}],clips:[victimClips,victimClips]});match.fighters[0].x=dir>0?210:2350;match.fighters[1].x=match.fighters[0].x+dir*75;performAction(match,0,'deletion');const initial=getFighterView(match,1).x;
 for(const t of [200,400,600,840,850,1200,1800,2600]){match.deletionElapsed=t;assert.equal(getFighterView(match,1).x,initial);assert.equal(getFighterView(match,1).y,0);}
 assert(initial>=400&&initial<=880,'Camera frame leaves real room for the arriving tray');
});
