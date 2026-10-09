import test from 'node:test';import assert from 'node:assert/strict';
import {BNL_STYLE,BNL_DELETION,bnlDeletionPose,bnlDeletionPositions,signalFragmentPlan} from '../public/games/system-clash/play/bnl-fighter.mjs';
import {FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
import {fightStatProfile,FIGHT_STAT_BUDGET} from '../public/games/system-clash/play/fight-stats.mjs';
test('BNL is registered in the same balanced fighter and Deletion owners',()=>{
 assert.equal(FIGHTER_STYLES['bnl-01'],BNL_STYLE);assert.equal(BNL_STYLE.height,320);assert.match(BNL_STYLE.description,/construct/i);
 assert.equal(Object.values(fightStatProfile('bnl-01')).reduce((a,b)=>a+b,0),FIGHT_STAT_BUDGET);assert.equal(deletionDefinition('bnl-01'),BNL_DELETION);
 assert.equal(BNL_DELETION.mechanism,'signal-overload');assert.equal(BNL_DELETION.prop,false);
});
test('signal overload freezes a genuine hanging victim before rigid source fragmentation',()=>{
 const b=BNL_DELETION.beats,clips={'delete-rip-front':{},'delete-signal-focus':{},'delete-signal-overload':{},'delete-signal-burst':{}};
 assert.equal(bnlDeletionPose('victim',b.overload,clips).clip,'delete-rip-front');assert.equal(bnlDeletionPose('victim',b.fragment+200,clips).elapsed,0);
 assert.equal(bnlDeletionPose('attacker',b.overload,clips).clip,'delete-signal-overload');assert.equal(bnlDeletionPose('attacker',b.fragment,clips).clip,'delete-signal-burst');
 const match={_deletionOrigin:{winner:120,near:320,originalVictim:640,direction:1}};
 const lifted=bnlDeletionPositions(match,b.overload);assert(lifted.victimY<0);assert.equal(lifted.victimX,640);assert.equal(bnlDeletionPositions(match,b.fragment+1000).victimY,lifted.victimY,'No animated reaction source while pieces fly');
});
test('digital fragments partition every frozen source pixel exactly once without changing sizes',()=>{
 const frame={rect:[33,11,173,319],anchor:[86,319]};const initial=signalFragmentPlan(frame,{progress:0,x:640,y:540,scale:1,direction:1});
 const occupied=new Uint8Array(173*319);assert(initial.length<=180);
 for(const piece of initial){const [sx,sy,w,h]=piece.source;assert.equal(piece.width,w);assert.equal(piece.height,h);for(let y=sy-11;y<sy-11+h;y++)for(let x=sx-33;x<sx-33+w;x++)occupied[y*173+x]++;}
 assert(occupied.every(v=>v===1),'No source is lost or duplicated');
 const flying=signalFragmentPlan(frame,{progress:.6,x:640,y:540,scale:1,direction:1});assert.deepEqual(flying.map(p=>[p.source,p.width,p.height]),initial.map(p=>[p.source,p.width,p.height]));assert(flying.some((p,i)=>p.x!==initial[i].x));
 assert.deepEqual(signalFragmentPlan(frame,{progress:1,x:640,y:540}),[]);
});

import {createFightEffects} from '../public/games/system-clash/play/fight-effects.mjs';
import {drawNewDeletionScene} from '../public/games/system-clash/play/new-deletion-renderer.mjs';
test('damage to BNL sheds signal energy, never flesh, blood, bones or metal',()=>{
 for(const event of [{type:'hit'},{type:'weapon-embed'},{type:'eye-pop'},{type:'land',blood:true},{type:'ko',blood:true},{type:'deletion-impact',cue:'oak-rip',aftermath:'body-rupture'},{type:'deletion-cue',cue:'blue-erased'}]){
  const fx=createFightEffects({muted:true,seed:4});fx.emit({...event,victimId:'bnl-01',x:640,y:400,strength:2});const stats=fx.getStats();
  for(const key of ['bloodParticles','chunks','organicChunks','boneChunks','metalChunks','decals','smears'])assert.equal(stats[key],0,`${event.type} ${key}`);
  assert(stats.energyParticles>0,`${event.type} retains visible signal damage`);
 }
 const organic=createFightEffects({muted:true});organic.emit({type:'hit',victimId:'9-bit'});assert(organic.getStats().bloodParticles>0,'Existing organic fighters retain their effects');
});
test('Lost Marbles fragments BNL native pixels instead of substituting a human skeleton',()=>{
 const image={nativeBNL:true},frame={rect:[0,0,120,220],anchor:[60,220],offset:[0,0],drawScale:1,opaqueBounds:[0,0,120,220]},asset={image,data:{frames:{left:[frame],right:[frame]},msPerFrame:100},scale:1};
 const match={winner:0,deletionElapsed:2500,fighters:[{id:'lost-marbles'},{id:'bnl-01',height:320}],_deletionOrigin:{direction:1}},views=[{}, {clip:'high',facing:'left',elapsed:0,frameIndex:0,x:640,y:0}],art=[{}, {clips:{high:asset}}],draws=[];
 const ctx=new Proxy({drawImage(img,...rest){draws.push({img,rest});}}, {get:(o,k)=>k in o?o[k]:()=>{}});
 drawNewDeletionScene(ctx,match,null,views,art,false);
 assert(draws.length>1,'The source is actually fragmented');assert(draws.every(d=>d.img===image),'Every piece comes from BNL own pixels');
 match.deletionElapsed=4300;draws.length=0;drawNewDeletionScene(ctx,match,null,views,art,false);assert.equal(draws.length,0,'No skeleton persists after his signal disperses');
});

import {readFileSync} from 'node:fs';
import {createMatch,performAction,advanceMatch,getFighterView,consumeEvents} from '../public/games/system-clash/play/fight-engine.mjs';
import {damageOverlayPlans,resolvePoseAttachments} from '../public/games/system-clash/play/fight-attachments.mjs';
test('a real landed hit on BNL records signal damage and preserves visible digital battle wear',()=>{
 const match=createMatch({mode:'local',start:false,fighters:[{id:'6-bit'},{id:'bnl-01'}]});match.phase='fight';match.fighters[0].x=1200;match.fighters[1].x=1306;
 assert(performAction(match,0,'low-punch'));for(let i=0;i<40;i++)advanceMatch(match,10);
 const view=getFighterView(match,1),hit=consumeEvents(match).find(e=>e.type==='hit');assert(view.damageTaken>0);assert.equal(hit.victimId,'bnl-01');assert.equal(hit.damageKind,'scorch');assert(view.damageMarks.every(m=>m.kind==='scorch'));
 const manifest=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/fighters/bnl-01/manifest.json',import.meta.url))),frame=manifest.clips.idle.frames.left[0],points=resolvePoseAttachments(frame,'idle',0,'left','bnl-01');
 const plans=damageOverlayPlans(view,points,'bnl-01',320/manifest.clips.idle.scale);assert(plans.length>0,'Damage remains visible on his own native body');assert(plans.every(p=>p.effect==='signal'&&p.kind==='signal'),'No bruise, blood, cloth tear, metal or flesh overlay');
 assert.deepEqual(plans,damageOverlayPlans(view,points,'bnl-01',320/manifest.clips.idle.scale),'The injury stays in its own source coordinates');
});
