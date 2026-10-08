import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,advanceMatch,performAction,getFighterView,consumeEvents,FIGHTER_STYLES,WEAPON_TYPES} from '../public/games/system-clash/play/fight-engine.mjs';
import {fightStatProfile,fightStatScalars,FIGHTER_STAT_PROFILES,BASELINE_FIGHT_STATS} from '../public/games/system-clash/play/fight-stats.mjs';

const clips={punch:{duration:470,contactMs:170,activeEndMs:240},'power-kick':{duration:690,contactMs:285,activeEndMs:355}};
function fight(ids=['cache-back','6-bit']){
 const match=createMatch({mode:'local',start:false,fighters:ids.map(id=>({id})),clips:[clips,clips]});match.phase='fight';match.fighters[0].x=500;match.fighters[1].x=1100;return match;
}
function neutralFixture(match,index=0){
 // Explicit neutral-balance fixture for timing comparisons; production still
 // creates the real profile for every identity before this test-only override.
 const f=match.fighters[index],canonical=FIGHTER_STYLES[f.id];
 f._statScalars=fightStatScalars(BASELINE_FIGHT_STATS);f._style=structuredClone(canonical);f.hp=f.maxHp=100;
 return match;
}
function advance(match,ms,inputs=[{},{}]){while(ms>0){const dt=Math.min(100,ms);advanceMatch(match,dt,inputs);ms-=dt;}}
function recoveryEnd(f){const base=f._clips[f.action].duration,active=f._clips[f.action].activeEndMs;return active+(base-active)*f._statScalars.recoveryTimeScale;}

for(const id of Object.keys(FIGHTER_STAT_PROFILES))test(`${id} engine applies its actual immutable profile without changing geometry or contact timing`,()=>{
 const before=structuredClone(FIGHTER_STYLES),match=fight([id,'6-bit']),f=match.fighters[0],expected=fightStatScalars(id),style=FIGHTER_STYLES[id];
 assert.equal(f.hp,expected.maxHealth);assert.equal(f.maxHp,expected.maxHealth);assert.deepEqual(f._statProfile,fightStatProfile(id));
 assert.equal(f._style.moveSpeed,style.moveSpeed*expected.speedScale);assert.equal(f._style.jumpSpeed,style.jumpSpeed*expected.speedScale);
 for(const key of ['punchDamage','kickDamage','throwDamage'])assert.equal(f._style[key],style[key]*expected.powerScale);
 for(const key of ['reach','tempo','knockback'])assert.deepEqual(f._style[key],style[key]);
 assert.notEqual(f._style,style);assert.notEqual(f._style.reach,style.reach);assert.deepEqual(FIGHTER_STYLES,before);
 assert.equal(f._clips.punch.contactMs,170*style.tempo.punch);assert.equal(f._clips.punch.activeEndMs,240*style.tempo.punch);assert.equal(f._clips.punch.nativeDuration,470);
});

test('Speed scales actual horizontal walk and jump while retaining the authored jump duration and vertical arc',()=>{
 const stat=fight(),neutral=neutralFixture(fight()),speed=fightStatScalars('cache-back').speedScale;
 advance(stat,200,[{move:1},{}]);advance(neutral,200,[{move:1},{}]);assert(Math.abs((stat.fighters[0].x-500)/(neutral.fighters[0].x-500)-speed)<1e-10);
 const a=fight(),b=neutralFixture(fight());assert(performAction(a,0,'jump',{move:1}));assert(performAction(b,0,'jump',{move:1}));advance(a,200);advance(b,200);
 assert.equal(a.fighters[0]._jump.duration,b.fighters[0]._jump.duration);assert.equal(getFighterView(a,0).y,getFighterView(b,0).y);assert(Math.abs((a.fighters[0].x-500)/(b.fighters[0].x-500)-speed)<1e-10);
});

test('Technique preserves every pre-active native time and power-kick travel point',()=>{
 const stat=fight(),neutral=neutralFixture(fight());assert(performAction(stat,0,'power-kick'));assert(performAction(neutral,0,'power-kick'));
 const active=stat.fighters[0]._clips['power-kick'].activeEndMs;
 for(const dt of [active*.3,active*.3,active*.3]){
  advance(stat,dt);advance(neutral,dt);assert.equal(stat.fighters[0].actionTime,neutral.fighters[0].actionTime);assert.equal(getFighterView(stat,0).elapsed,getFighterView(neutral,0).elapsed);assert.equal(stat.fighters[0].x,neutral.fighters[0].x);
 }
});

test('Technique shortens only post-active recovery and traverses the same native recovery sequence',()=>{
 const stat=fight(),neutral=neutralFixture(fight());performAction(stat,0,'punch');performAction(neutral,0,'punch');
 const a=stat.fighters[0],b=neutral.fighters[0],active=a._clips.punch.activeEndMs,tail=80;
 a.actionTime=active+tail*a._statScalars.recoveryTimeScale;b.actionTime=active+tail;assert(Math.abs(getFighterView(stat,0).elapsed-getFighterView(neutral,0).elapsed)<1e-8);
 const end=recoveryEnd(a);a.actionTime=end-.001;a._contactDone=true;b.actionTime=end-.001;b._contactDone=true;advance(stat,1);advance(neutral,1);
 assert.equal(a.action,'idle');assert.equal(b.action,'punch','Neutral recovery still occupies its original tail');
 for(const action of ['high','low','thrown','knockdown','getup','jump']){
  Object.assign(a,{action,actionTime:100,_offset:0,_launched:false,_jump:null});Object.assign(b,{action,actionTime:100,_offset:0,_launched:false,_jump:null});assert.equal(getFighterView(stat,0).elapsed,getFighterView(neutral,0).elapsed,`${action} keeps whole native timing`);
 }
});

test('Technique extends the existing recovery acceptance and expiry in wall-clock milliseconds',()=>{
 const stat=fight(),neutral=neutralFixture(fight());performAction(stat,0,'punch');performAction(neutral,0,'punch');
 for(const match of [stat,neutral]){const f=match.fighters[0];f.actionTime=recoveryEnd(f)-102;f._contactDone=true;f._hitConnected=false;match.combatTime=700;}
 assert.equal(performAction(stat,0,'low-punch'),true);assert.equal(performAction(neutral,0,'low-punch'),false);const f=stat.fighters[0];assert.equal(f._buffer.kind,'recovery');assert.equal(f._buffer.expires,700+140*f._statScalars.inputBufferScale);
});

test('Technique expands an already connected combination window without fabricating connections',()=>{
 const stat=fight(),neutral=neutralFixture(fight());
 for(const match of [stat,neutral]){match.combatTime=1200;match.fighters[0]._sequence=[{action:'low-punch',at:0,connected:true},{action:'punch',at:580,connected:true}];assert(performAction(match,0,'kick',{},1200));}
 assert.equal(stat.fighters[0].action,'power-kick');assert.equal(neutral.fighters[0].action,'kick');
 const missed=fight();missed.fighters[0]._sequence=[{action:'low-punch',at:0,connected:false},{action:'punch',at:580,connected:true}];performAction(missed,0,'kick',{},1200);assert.equal(missed.fighters[0].action,'kick');
});

test('Power changes physical attack damage while leaving shared weapon values fixed',()=>{
 const match=fight(['9-bit','6-bit']);match.fighters[1].x=650;performAction(match,0,'punch');advance(match,300);
 const hits=consumeEvents(match).filter(e=>e.type==='hit'&&e.action==='punch');assert.equal(hits.length,1);assert.equal(hits[0].damage,Math.round(8*FIGHTER_STYLES['9-bit'].punchDamage*fightStatScalars('9-bit').powerScale));assert.notEqual(hits[0].damage,Math.round(8*FIGHTER_STYLES['9-bit'].punchDamage));assert.equal(match.fighters[1].hp,match.fighters[1].maxHp-hits[0].damage);
 assert.equal(WEAPON_TYPES['neural-spike'].damage,16);assert.equal(WEAPON_TYPES['neural-spike'].throwDamage,18);assert.equal(WEAPON_TYPES['pulse-driver'].damage,13);
});

test('timeouts compare remaining health fractions and preserve equal-fraction draws',()=>{
 const less=fight(['9-bit','wittyf0x']);less.fighters[0].hp=62;less.fighters[1].hp=60;less.roundRemaining=1;advance(less,1);assert.equal(less.winner,1,'The smaller remaining raw HP pool can have more health left');
 const equal=fight(['6-bit','9-bit']);equal.fighters[0].hp=50;equal.fighters[1].hp=62;equal.roundRemaining=1;advance(equal,1);assert.equal(equal.winner,null,'50/100 and62/124 are the same remaining fraction');
});
