import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,advanceMatch,consumeEvents,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {readFileSync} from 'node:fs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex} from '../public/games/system-clash/play/fight-attachments.mjs';
import {createStageState,startStageWarning} from '../public/games/system-clash/play/fight-stages.mjs';
import {stageAmbientPlan} from '../public/games/system-clash/play/stage-ambient.mjs';
import {interpolateFightViews} from '../public/games/system-clash/play/fight-presentation.mjs';
import {createStageRenderer} from '../public/games/system-clash/play/fight-stage-renderer.mjs';
const ready=()=>{const match=createMatch({mode:'local',start:false,stage:'interdimensional-station'});match.phase='fight';return match;};
const advance=(match,ms,inputs)=>{while(ms>0){const dt=Math.min(100,ms);advanceMatch(match,dt,inputs);ms-=dt;}};

for(const [seat,direction,start,min,max] of [[0,-1,212,2000,2250],[1,1,2348,310,560]])test(`station ${direction<0?'left':'right'} edge transports seat${seat+1} with inventory and opponent preserved`,()=>{
 const match=ready(),fighter=match.fighters[seat],other=match.fighters[1-seat];fighter.x=start;other.x=1280;fighter.weapon={type:'neural-spike',name:'Neural Spike',charges:2};const hp=fighter.hp,otherBefore={x:other.x,hp:other.hp,action:other.action};
 advance(match,40,seat===0?[{move:direction},{}]:[{},{move:direction}]);
 assert(fighter.x>min&&fighter.x<max,'Body emerges from the partner portal');assert.equal(match.stage.id,'interdimensional-station');assert.equal(match.stage.transitionSerial,0);assert.equal(fighter.hp,hp);assert.equal(fighter.weapon.charges,2);assert.deepEqual({x:other.x,hp:other.hp,action:other.action},otherBefore);
 const events=consumeEvents(match).filter(event=>event.type==='stage-portal');assert.equal(events.length,1);assert.equal(events[0].target,seat);assert.equal(events[0].to,direction<0?'right':'left');assert(match.stage.lastPortalTransit,'Native portal effect retains the crossing');
 advance(match,250,[{},{}]);assert.equal(consumeEvents(match).filter(event=>event.type==='stage-portal').length,0,'Arrival cannot ping-pong');
});

test('station arrival cooldown, pause and deliberate crossing prevent incidental transit',()=>{
 const match=ready();match.fighters[0].x=212;advance(match,40,[{move:-1},{}]);consumeEvents(match);
 match.fighters[0].x=2348;advance(match,40,[{move:1},{}]);assert.equal(consumeEvents(match).filter(event=>event.type==='stage-portal').length,0,'Turning immediately into the arrival portal is locked');
 const clock=match.stage.fightClock;match.paused=true;advance(match,900,[{move:1},{}]);assert.equal(match.stage.fightClock,clock);match.paused=false;advance(match,850,[{},{}]);
 match.fighters[0].x=2348;advance(match,40,[{move:1},{}]);assert.equal(consumeEvents(match).filter(event=>event.type==='stage-portal').length,1,'A new deliberate crossing works after cooldown');
 const still=ready();still.fighters[0].x=210;advance(still,100,[{},{}]);assert.equal(still.fighters[0].x,210);assert.equal(consumeEvents(still).filter(event=>event.type==='stage-portal').length,0);
 const falling=ready();Object.assign(falling.fighters[0],{x:212,action:'knockdown'});advance(falling,100,[{move:-1},{}]);assert.equal(consumeEvents(falling).filter(event=>event.type==='stage-portal').length,0);
});

test('portal exit avoids an occupied partner lip without displacing the opponent',()=>{
 const match=ready();match.fighters[0].x=212;match.fighters[1].x=2130;const other=match.fighters[1].x;advance(match,40,[{move:-1},{}]);
 assert.equal(match.fighters[1].x,other);assert(Math.abs(match.fighters[0].x-other)>=180,'Emerging body has real space to stand');assert.equal(consumeEvents(match).filter(event=>event.type==='stage-portal').length,1);
});

test('simultaneous opposite portal crossings stay deterministic and independent',()=>{
 const run=()=>{const match=ready();match.fighters[0].x=212;match.fighters[1].x=2348;advance(match,40,[{move:-1},{move:1}]);return match;};
 const a=run(),b=run();assert(a.fighters[0].x>2000&&a.fighters[1].x<560);assert.deepEqual(a,b);assert.equal(consumeEvents(a).filter(event=>event.type==='stage-portal').length,2);
});

test('station commuters stand on the visible platform and use four walking poses in travel direction',()=>{
 const state=createStageState('interdimensional-station'),frames=new Set();for(let n=0;n<8;n++){state.clock=4000+n*180;const plan=stageAmbientPlan(state,{fighterPositions:[100]});frames.add(plan.pedestrian.frame);assert(plan.pedestrian.y>=420,'Feet meet the foreground platform');assert(plan.pedestrian.height>=175,'Commuter reads as a person');assert.equal(plan.pedestrian.facing,'right','Walking follows travel instead of snapping toward the fight');assert(plan.observers.every(person=>person.y>=420));}
 assert.equal(frames.size,4);state.clock=42000;assert.equal(stageAmbientPlan(state).pedestrian.facing,'left');state.clock=0;const still=stageAmbientPlan(state,{reducedMotion:true});state.clock=52000;assert.deepEqual(stageAmbientPlan(state,{reducedMotion:true}),still);
});

function surface(){const calls=[],ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];if(String(key).startsWith('create')&&String(key).endsWith('Gradient'))return ()=>({addColorStop(){}});return (...args)=>calls.push([key,...args]);}});return {calls,getContext(){return ctx;}};}
test('native edge portals are human-passable, centered on transport edges and flare on both ends',()=>{
 const screen=surface(),renderer=createStageRenderer(screen),state=createStageState('interdimensional-station'),kit={width:1220,height:1468},art={id:state.id,kit,layers:{frames:{leftWall:{rect:[0,0,486,681],anchor:[127.5,678]},rightWall:{rect:[610,0,487,682],anchor:[358.5,679]},control:{rect:[0,682,610,452],anchor:[303,449]},emitter:{rect:[610,682,560,555],anchor:[278,552]}}}};
 renderer.drawBehind(screen.getContext(),state,art,{});const portalDraws=screen.calls.filter(([key,image,,sy])=>key==='drawImage'&&image===kit&&sy===0),portals=[portalDraws.find(call=>call[2]===0),portalDraws.find(call=>call[2]===610)];assert(portals.every(Boolean));for(const [index,call]of portals.entries()){assert(call[9]>=600,'Native portal is larger than a standing body');assert(Math.abs(call[6]+call[8]/2-[210,2350][index])<1,'Rendered aperture shares the playable trigger edge');}
 const before=screen.calls.length;state.lastPortalTransit={at:state.clock,serial:1,transits:[{target:0,from:'left',to:'right',fromX:210,toX:2350,exitX:2130}]};renderer.drawBehind(screen.getContext(),state,art,{});const fx=screen.calls.slice(before).filter(([key])=>key==='ellipse');assert(fx.length>=2,'Departure and arrival have visible native portal effects');
});


test('jump travel preserves authored flight instead of changing action or height',()=>{
 const match=ready();Object.assign(match.fighters[0],{x:212,action:'jump',actionTime:200,_jump:{elapsed:200,duration:580,move:-1,attackUsed:false}});advance(match,40,[{move:-1},{}]);
 assert(match.fighters[0].x>2000);assert.equal(match.fighters[0].action,'jump');assert(getFighterView(match,0).y<0,'The same airborne pose emerges');assert.equal(match.fighters[0]._jump.attackUsed,false);assert.equal(match.stage.lastWallImpact,null);assert.equal(consumeEvents(match).filter(event=>event.type==='stage-portal').length,1);
});

test('the same edge movement remains solid in ordinary rooms and outside active rounds',()=>{
 for(const stage of ['radio-studio','containment']){const match=createMatch({mode:'local',start:false,stage});match.phase='fight';match.fighters[0].x=212;advance(match,100,[{move:-1},{}]);assert.equal(match.fighters[0].x,210);assert.equal(consumeEvents(match).filter(event=>event.type==='stage-portal').length,0);}
 const match=ready();match.phase='ready';match.fighters[0].x=212;advance(match,100,[{move:-1},{}]);assert.equal(match.fighters[0].x,212);assert.equal(match.stage.lastPortalTransit,null);
});


test('a real station teleport snaps local view interpolation directly to the partner portal',()=>{
 const match=ready();match.fighters[0].x=212;const before=match.fighters.map((_,index)=>getFighterView(match,index));advance(match,40,[{move:-1},{}]);const after=match.fighters.map((_,index)=>getFighterView(match,index)),rendered=interpolateFightViews(before,after,.5);
 assert(after[0].x>2000,'The real deterministic engine crossed the left edge');assert.equal(rendered[0].x,after[0].x,'Presentation cannot draw the teleporting body in the middle of the arena');assert.equal(rendered[1].x,after[1].x,'The stationary partner retains its native position');
});


test('a released native body below the containment beam cannot be hit through its old upright anticipation key',()=>{
 const clips={};let manifest;for(const bank of ['fighters','arcade','deletions']){const source=JSON.parse(readFileSync(new URL(`../public/games/system-clash/play/assets/${bank}/6-bit/manifest.json`,import.meta.url),'utf8'));if(bank==='fighters')manifest=source;for(const [name,data]of Object.entries(source.clips)){const key=bank==='deletions'?'delete-'+name:name,frames=Object.values(data.frames).flat();clips[key]=compileFightClip(data,{width:Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),height:Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))},source,key);}}
 const native={manifest,clips},metadata=combatMetadata([native])[0],match=createMatch({mode:'local',start:false,stage:'containment',fighters:[{id:'6-bit'},{id:'6-bit'}],clips:[metadata,metadata]});match.phase='fight';match.fighters[0].x=2200;const victim=match.fighters[1];Object.assign(victim,{x:1280,action:'thrown',actionTime:10,_launched:true,_throwDirection:1,_launchHeight:80,_launchStartY:0});
 const visible=getFighterView(match,1),frame=metadata.thrown.combatPoses.frames[visible.facing][poseFrameIndex(clips.thrown,visible)],visibleTop=Math.min(...frame.hurt.map(region=>620+visible.y+region.top));assert(visibleTop>400,'The actual rendered native source is entirely below the marked beam');
 victim.actionTime=0;startStageWarning(match.stage,0);match.stage.fightClock=match.stage.activation.impactAt-10;const hp=victim.hp;advanceMatch(match,10,[{},{}]);assert.equal(victim.hp,hp,'The beam must test the same released source that the player sees');assert.equal(consumeEvents(match).filter(event=>event.type==='stage-hit'&&event.target===1).length,0);
});
