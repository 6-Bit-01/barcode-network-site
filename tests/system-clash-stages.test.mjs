import test from 'node:test';import assert from 'node:assert/strict';
import {createMatch,advanceMatch,performAction,consumeEvents,getFighterView,FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
import * as presentation from '../public/games/system-clash/play/fight-presentation.mjs';
const stages=await import('../public/games/system-clash/play/fight-stages.mjs').catch(()=>null);
function advance(match,ms,controls=[{},{}]){while(ms>0){const dt=Math.min(ms,100);advanceMatch(match,dt,controls);ms-=dt;}}
function ready(stage='radio-studio'){const m=createMatch({mode:'local',start:false,stage});m.phase='fight';return m;}

test('the six wide stages have reciprocal weak-wall connections and solid outer edges',()=>{
 assert(stages,'Stage catalog is shipped');assert.equal(stages.STAGES.length,6);
 const order=['studio-rat-lair','radio-studio','sheila-office','containment','nature-simulation','witty-wasteland'];
 for(let i=0;i<order.length;i++){const s=stages.stageById(order[i]);assert.equal(s.width,2560);assert.equal(s.walls.left.target,order[i-1]??null);assert.equal(s.walls.right.target,order[i+1]??null);assert(s.ambientCycleMs>=30000);assert.equal(s.hazard.warningMs,1000);}
 assert.match(stages.stageById('studio-rat-lair').description,/cats/i);
});

test('ordinary movement reaches fixed wide-world edges independent of the camera',()=>{
 const match=ready();assert.equal(match.stage?.width,2560);
 advance(match,9000,[{move:1},{move:1}]);assert.equal(match.fighters[1].x,2350);
 assert(match.fighters[0].x>1900);assert.equal(consumeEvents(match).filter(e=>e.type==='stage-transition').length,0);
});

test('world camera follows both bodies with easing and never changes physical state',()=>{
 assert.equal(typeof presentation.createFightCamera,'function');assert.equal(typeof presentation.advanceFightCamera,'function');
 const camera=presentation.createFightCamera({worldWidth:2560}),fighters=[{x:800,height:320},{x:1400,height:368}];
 const copy=structuredClone(fighters);presentation.advanceFightCamera(camera,{fighters,worldWidth:2560,dtMs:100});
 assert(camera.x<1280&&camera.x>1100,'Pan eases toward the pair');assert(camera.zoom>0.75&&camera.zoom<=1.04);
 for(let n=0;n<30;n++)presentation.advanceFightCamera(camera,{fighters:[{x:210},{x:340}],worldWidth:2560,dtMs:100});
 assert(camera.x>=640/camera.zoom,'The left viewport never shows outside the world');assert.deepEqual(fighters,copy);
});

test('Throw prioritizes opponent and weapons before a nearby stage control',()=>{
 const match=ready();assert(match.stage,'Stage state is present');const x=stages.stageById(match.stage.id).interaction.x;
 match.fighters[0].x=x+30;match.fighters[1].x=x+140;
 assert.equal(performAction(match,0,'grab'),true);assert.equal(match.fighters[0].action,'grab');assert.equal(match.stage.interaction,null);
 const pickup=ready();pickup.fighters[0].x=x+30;pickup.fighters[1].x=x+500;
 pickup.stagePickups=[{id:'existing',type:'neural-spike',name:'Neural Spike',charges:3,x:x+35,y:620}];
 assert.equal(performAction(pickup,0,'grab'),true);assert.equal(pickup.fighters[0].action,'pickup');assert.equal(pickup.stage.interaction,null);
});

for(const stage of ['radio-studio','sheila-office','studio-rat-lair','containment','nature-simulation','witty-wasteland'])test(`${stage} warns visibly for a second and uses existing wear/health once per body`,()=>{
 const match=ready(stage);assert(match.stage,'Stage state is present');const spec=stages.stageById(stage),zone=spec.hazard.zone;
 match.fighters[0].x=spec.interaction.x+30;match.fighters[1].x=(zone.left+zone.right)/2;
 assert.equal(performAction(match,0,'grab'),true);assert.equal(match.fighters[0].action,'pickup');advance(match,350);
 assert(match.stage.activation,'Native contact commits a hazard warning');assert.equal(match.fighters[1].hp,100);
 advance(match,950);assert.equal(match.fighters[1].hp,100,'The full warning remains harmless');
 advance(match,1000);assert(match.fighters[1].hp<100);assert(match.fighters[1].damageTaken>0);assert(match.fighters[1].damageMarks.length>0);
 const hp=match.fighters[1].hp;advance(match,1000);assert.equal(match.fighters[1].hp,hp);
 const hits=consumeEvents(match).filter(e=>e.type==='stage-hit');assert.equal(hits.filter(e=>e.target===1).length,1);
 assert.equal(performAction(match,0,'grab'),true);assert.equal(match.stage.activation,null,'Cooldown cannot retrigger the object');
});

test('hazard damages its operator too, while a jump clears a warned floor trap',()=>{
 const match=ready('nature-simulation');assert(match.stage);const spec=stages.stageById(match.stage.id),zone=spec.hazard.zone;
 match.fighters[0].x=spec.interaction.x+30;match.fighters[1].x=1450;performAction(match,0,'grab');advance(match,900);
 match.fighters[0].x=1200;Object.assign(match.fighters[1],{x:1450,action:'jump',actionTime:0,_jump:{elapsed:50000,duration:100000,move:0,attackUsed:false}});match.fighters[1]._clips.jump.duration=100000;
 advance(match,1000);assert(match.fighters[0].hp<100,'The operator is not immune');assert.equal(match.fighters[1].hp,100,'Body entirely above thorns is safe');
});

test('hazard and cooldown stop outside active fight and pause, while ambient time remains separate',()=>{
 const match=ready();assert(match.stage);const spec=stages.stageById(match.stage.id);match.fighters[0].x=spec.interaction.x+30;match.fighters[1].x=1300;
 performAction(match,0,'grab');advance(match,350);const fightClock=match.stage.fightClock,ambient=match.stage.clock;
 match.paused=true;advance(match,2000);assert.equal(match.stage.clock,ambient);assert.equal(match.stage.fightClock,fightClock);
 match.paused=false;match.phase='ready';advance(match,500);assert(match.stage.clock>ambient);assert.equal(match.stage.fightClock,fightClock);assert.equal(match.fighters[1].hp,100);
});

test('strong wall knockback cracks then transitions once, preserving both fighters and fixed edges',()=>{
 const match=ready('radio-studio');assert(match.stage);match.fighters[0].x=2200;match.fighters[1].x=2340;
 for(let hit=0;hit<3;hit++){performAction(match,0,'kick');advance(match,2200);if(match.stage.id!=='radio-studio')break;match.fighters[0].x=2200;match.fighters[1].x=2340;}
 assert.equal(match.stage.id,'sheila-office');assert.equal(match.stage.transitionSerial,1);assert(match.fighters[0].hp>0&&match.fighters[1].hp>0);
 assert(match.fighters.every(f=>f.x>=210&&f.x<=2350));assert(Math.abs(match.fighters[0].x-match.fighters[1].x)>=150);
 assert.equal(consumeEvents(match).filter(e=>e.type==='stage-transition').length,1);
 const id=match.stage.id;advance(match,1000);assert.equal(match.stage.id,id,'Standing at an edge does not repeat a transition');
});

test('wall impact respects a body cooldown and a wall KO never transitions rooms',()=>{
 const match=ready();assert(match.stage);match.fighters[0].x=2200;match.fighters[1].x=2340;match.fighters[1].hp=16;
 performAction(match,0,'kick');advance(match,300);assert.equal(match.phase,'finish');assert.equal(match.stage.id,'radio-studio');assert.equal(match.stage.transitionSerial,0);
 const events=consumeEvents(match);assert.equal(events.filter(e=>e.type==='wall-impact').length,1);assert.equal(events.filter(e=>e.type==='ko').length,1);
 advance(match,1000);assert.equal(consumeEvents(match).filter(e=>e.type==='wall-impact').length,0);
});

test('camera fits both bodies at opposite fixed world walls after settling',()=>{
 const camera=presentation.createFightCamera({worldWidth:2560}),fighters=[{x:210},{x:2350}];
 for(let n=0;n<40;n++)presentation.advanceFightCamera(camera,{fighters,worldWidth:2560,dtMs:100});
 const left=camera.x-640/camera.zoom,right=camera.x+640/camera.zoom;
 assert(left<=fighters[0].x-80&&right>=fighters[1].x+80,'Both intact fighters fit without turning viewport edges into walls');
});

for(const facing of ['left','right'])test(`beam geometry lets a crouched fighter duck its marked strip (${facing})`,()=>{
 const match=ready('containment'),spec=stages.stageById('containment');match.fighters[0].x=spec.interaction.x+30;match.fighters[1].x=1200;match.fighters[1].facing=facing;
 performAction(match,0,'grab');advance(match,900,[{},{crouch:true}]);match.fighters[0].x=facing==='left'?700:1900;advance(match,1400,[{},{crouch:true}]);assert.equal(match.fighters[1].facing,facing);assert.equal(match.fighters[1].hp,100,'Crouched body is below the overhead beam');
 assert.equal(consumeEvents(match).filter(event=>event.type==='stage-hit'&&event.target===1).length,0);
});

test('warned stage damage can catch a living fighter recovering from knockdown',()=>{
 const match=ready('nature-simulation'),spec=stages.stageById(match.stage.id);match.fighters[0].x=spec.interaction.x+30;match.fighters[1].x=1300;
 performAction(match,0,'grab');advance(match,400);Object.assign(match.fighters[1],{action:'getup',actionTime:0});match.fighters[1]._clips.getup.duration=100000;
 advance(match,2000);assert.equal(match.fighters[1].hp,83,'A recovery animation grants no immunity to a warned floor trap');assert.equal(consumeEvents(match).filter(event=>event.type==='stage-hit'&&event.target===1).length,1);
});

test('a stage KO and simultaneous stage draw use the ordinary round ending once',()=>{
 for(const both of [false,true]){const match=ready('nature-simulation'),spec=stages.stageById(match.stage.id);match.fighters[0].x=spec.interaction.x+30;match.fighters[1].x=1450;
 performAction(match,0,'grab');advance(match,900);Object.assign(match.fighters[0],{x:1200,hp:10});if(both)match.fighters[1].hp=10;
 advance(match,2000);assert.equal(match.winner,both?null:1);assert.equal(match.phase,both?'over':'finish');assert.equal(consumeEvents(match).filter(event=>event.type==='ko').length,1);}
});

for(const [id,side]of stages.STAGES.flatMap(stage=>['left','right'].filter(side=>stage.walls[side].target).map(side=>[stage.id,side])))test(`weak ${id} ${side} wall enters its reciprocal neighbour once`,()=>{
 const match=ready(id),direction=side==='left'?-1:1,target=stages.stageById(id).walls[side].target;
 for(let hit=0;hit<3;hit++){match.fighters[0].x=side==='left'?360:2200;match.fighters[1].x=side==='left'?220:2340;performAction(match,0,'kick');advance(match,2200);if(match.stage.id!==id)break;}
 assert.equal(match.stage.id,target);assert.equal(match.stage.transitionSerial,1);const incoming=direction===-1?'right':'left';assert(match.stage.walls[incoming].broken,'Both sides of the connected opening agree');
 assert.equal(consumeEvents(match).filter(event=>event.type==='stage-transition').length,1);assert(match.fighters[0].hp>0&&match.fighters[1].hp>0);
});

for(const id of Object.keys(FIGHTER_STYLES))for(const direction of [-1,1])test(`${id} Deletion rebases safely from the ${direction===-1?'left':'right'} world edge`,()=>{
 const match=ready();match.fighters[0].id=id;match.fighters[0].x=direction===1?2200:360;match.fighters[1].x=direction===1?2340:220;match.fighters[1].hp=0;match.fighters[1].deletionVictimReady=true;
 Object.assign(match,{phase:'finish',winner:0,finisherAvailable:true,finishRemaining:5000});const equipment={type:'neural-spike',charges:2};match.fighters[0].weapon=equipment;
 assert.equal(performAction(match,0,'deletion'),true);assert.equal(match.phase,'deletion');assert(Number.isFinite(match.stage.cinematicOrigin));assert(match.stage.cinematicOrigin>=0&&match.stage.cinematicOrigin<=1280);
 assert.equal(match._deletionOrigin.direction,direction);assert(match.fighters.every(f=>f._worldWidth===1280));assert.equal(match.fighters[0].weapon,null);
 advance(match,12000);assert.equal(match.phase,'over');assert.equal(match.winner,0);assert(match.fighters.every(f=>Number.isFinite(f.x)&&f.x>=0&&f.x<=1280));
});
