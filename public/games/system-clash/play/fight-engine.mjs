import {NEW_FIGHTER_STYLES,newDeletionPositions,splitBodyState} from './new-deletion-library.mjs';
import {deletionDefinition,deletionPose} from './deletion-library.mjs';
import {easedProgress} from './fight-presentation.mjs';
import {createStageState,stageById,stageInteractionReady,startStageWarning,advanceStageState,damageStageWall,enterStage} from './fight-stages.mjs';
/** Complete-body animation combat. Art, camera and audio stay outside this module. */
// Reserve the horizontal width of the complete floor poses at either wall.
const WORLD = { width: 1280, floor: 620, margin: 210, separation: 105 };
const DEFAULT_CLIPS = {
  idle: { duration: 1080, loop: true }, walk: { duration: 600, loop: true },
  crouch: { duration: 510 }, block: { duration: 440 },
  punch: { duration: 470, contactMs: 170 }, kick: { duration: 530, contactMs: 200 },
  'low-punch': {duration:320,contactMs:120}, 'low-kick': {duration:420,contactMs:150},
  'crouch-punch': {duration:350,contactMs:110}, 'crouch-kick': {duration:480,contactMs:160},
  'crouch-high-kick': {duration:520,contactMs:180},
  'double-punch': {duration:650,contactMs:220,strikeHeightRatio:.55},
  'power-kick': {duration:720,contactMs:240,strikeHeightRatio:.48},
  'jump-punch': {duration:360,contactMs:100}, 'jump-kick': {duration:400,contactMs:100},
  jump: {duration:580}, uppercut: {duration:560,contactMs:180},
  pickup: {duration:850,contactMs:350,alignMs:230},
  high: { duration: 450, reactionStartMs: 70 }, low: { duration: 490, reactionStartMs: 70 },
  grabbed: { duration: 600 }, thrown: { duration: 640 },
  knockdown: { duration: 630 }, getup: { duration: 690 },
  'delete-nail':{duration:800,contactMs:500},
  'delete-disc-throw':{duration:800,contactMs:200},
  'delete-cast':{duration:800,contactMs:200},
  'delete-positivity':{duration:980,contactMs:200},
};
const NEUTRAL = new Set(['idle', 'walk', 'crouch', 'block']);
const AIR_ATTACKS = new Set(['jump-punch', 'jump-kick']);
const CROUCH_ATTACKS = new Set(['crouch-punch', 'crouch-kick', 'crouch-high-kick']);
const CHORD_ATTACKS = new Set(['double-punch','power-kick']);
const ATTACKS = new Set(['punch', 'kick', 'low-punch', 'low-kick', 'uppercut', 'grab', ...AIR_ATTACKS, ...CROUCH_ATTACKS, ...CHORD_ATTACKS]);
const COMBO_ATTACKS = new Set(['punch', 'kick', 'low-punch', 'low-kick']);
const RECOVERY_INPUT_MS=100;
const RECOVERY_ATTACKS=new Set([...ATTACKS].filter(action=>action!=='grab'));
const BUTTON_SEQUENCES = [
  {buttons:['low-punch','punch','kick'],action:'power-kick'},
  {buttons:['punch','low-punch','punch'],action:'double-punch'},
];
export const FIGHTER_STYLES = {
  ...NEW_FIGHTER_STYLES,
  '6-bit':{name:'Scrappy Brawler',description:'Versatile hands, dirty reach and steady pressure.',signature:'LP → HP → HK',
    moveSpeed:260,jumpSpeed:210,punchDamage:1,kickDamage:1,throwDamage:1,
    reach:{punch:1,kick:1,throw:1},tempo:{punch:1,kick:1,throw:1},
    knockback:{punch:1,kick:1,throw:1},throwDistance:145,
    preferredSequence:['low-punch','punch','kick'],preferredMoves:['punch','low-punch','kick','low-kick','double-punch','power-kick']},
  '9-bit':{name:'Dark Powerhouse',description:'Slow commitments, punishing hands and heavy knockback.',signature:'HP → LP → HP',
    moveSpeed:195,jumpSpeed:175,punchDamage:1.5,kickDamage:1.3,throwDamage:1.25,
    reach:{punch:1.03,kick:1.03,throw:1},tempo:{punch:1.18,kick:1.22,throw:1.12},
    knockback:{punch:1.4,kick:1.4,throw:1.2},throwDistance:175,
    preferredSequence:['punch','low-punch','punch'],preferredMoves:['punch','double-punch','punch','kick','power-kick','low-punch','low-kick']},
  'cache-back':{name:'Precision Counterstriker',description:'Fast crisp hands and quick recovery, with a shorter reach.',signature:'HP → LP → HP',
    moveSpeed:275,jumpSpeed:210,punchDamage:1.1,kickDamage:.95,throwDamage:.9,
    reach:{punch:.91,kick:.93,throw:.92},tempo:{punch:.82,kick:.9,throw:.95},
    knockback:{punch:.85,kick:.85,throw:.9},throwDistance:130,
    preferredSequence:['punch','low-punch','punch'],preferredMoves:['low-punch','punch','double-punch','low-punch','kick','low-kick','power-kick']},
  'mac-modem':{name:'Close Grappler',description:'Big throws and close body pressure; short kicking range.',signature:'HP → LP → HP',
    moveSpeed:240,jumpSpeed:190,punchDamage:1.1,kickDamage:.9,throwDamage:1.75,
    reach:{punch:.94,kick:.86,throw:1.18},tempo:{punch:.95,kick:1.06,throw:.86},
    knockback:{punch:1.1,kick:1.05,throw:1.4},throwDistance:205,
    preferredSequence:['punch','low-punch','punch'],preferredMoves:['grab','low-punch','double-punch','grab','punch','kick','low-kick','power-kick']},
  'dj-floppydisc':{name:'Mobile Kick Specialist',description:'Fast footwork, long strong kicks and lighter hands.',signature:'LP → HP → HK',
    moveSpeed:305,jumpSpeed:240,punchDamage:.75,kickDamage:1.4,throwDamage:.85,
    reach:{punch:.89,kick:1.17,throw:.9},tempo:{punch:.93,kick:.83,throw:1.02},
    knockback:{punch:.9,kick:1.1,throw:.9},throwDistance:135,
    preferredSequence:['low-punch','punch','kick'],preferredMoves:['kick','power-kick','low-kick','kick','low-punch','punch','double-punch']},
  'cliff':{name:'Measured Counterfighter',description:'Quick short counters, careful floor checks and steady clinch recovery.',signature:'HP → LP → HP',
    moveSpeed:240,jumpSpeed:190,punchDamage:.9,kickDamage:.95,throwDamage:1.1,
    reach:{punch:.93,kick:.90,throw:1.03},tempo:{punch:.86,kick:.94,throw:.95},
    knockback:{punch:.80,kick:1,throw:1.05},throwDistance:150,
    preferredSequence:['punch','low-punch','punch'],preferredMoves:['low-punch','punch','low-kick','double-punch','low-punch','grab','kick']},
  'mr-nice-guy':{name:'Measured Outfighter',description:'Long accurate strikes, patient spacing and modest close throws.',signature:'LP → HP → HK',
    moveSpeed:282,jumpSpeed:228,punchDamage:.95,kickDamage:1.05,throwDamage:.8,
    reach:{punch:1.14,kick:1.08,throw:.9},tempo:{punch:.97,kick:.95,throw:1.03},
    knockback:{punch:.9,kick:1.05,throw:.88},throwDistance:122,
    preferredSequence:['low-punch','punch','kick'],preferredMoves:['punch','low-punch','kick','power-kick','punch','low-kick','double-punch']},
  'ms-mayhem':{name:'Hammer Enforcer',description:'Long forceful hand strikes and heavy sweeps with deliberate commitments.',signature:'HP → LP → HP',
    moveSpeed:225,jumpSpeed:185,punchDamage:1.3,kickDamage:1.15,throwDamage:1.05,
    reach:{punch:1.12,kick:.97,throw:.98},tempo:{punch:1.10,kick:1.03,throw:1.03},
    knockback:{punch:1.25,kick:1.2,throw:1.05},throwDistance:155,
    preferredSequence:['punch','low-punch','punch'],preferredMoves:['double-punch','punch','low-kick','power-kick','punch','low-punch','kick']},
  'stolz':{name:'Steel Clincher',description:'Slow footwork, powerful metal hands and deliberate heavy lifts.',signature:'HP → LP → HP',
    moveSpeed:205,jumpSpeed:160,punchDamage:1.25,kickDamage:1,throwDamage:1.5,
    reach:{punch:.98,kick:.90,throw:1.08},tempo:{punch:1.02,kick:1.12,throw:1.10},
    knockback:{punch:1.2,kick:1.18,throw:1.25},throwDistance:185,
    preferredSequence:['punch','low-punch','punch'],preferredMoves:['grab','punch','double-punch','grab','low-punch','low-kick','kick']},
  'kaveman-brown':{name:'Low-End Bruiser',description:'Driving body shots, broad low kicks and grounded pressure.',signature:'HP → LP → HP',
    moveSpeed:245,jumpSpeed:190,punchDamage:1.2,kickDamage:1.05,throwDamage:1.2,
    reach:{punch:1.05,kick:1.02,throw:1},tempo:{punch:1,kick:1.08,throw:1},
    knockback:{punch:1.25,kick:1.30,throw:1.12},throwDistance:162,
    preferredSequence:['punch','low-punch','punch'],preferredMoves:['low-punch','double-punch','punch','low-kick','power-kick','grab','kick']},
  'dr3wbaby':{name:'Stage Freestyler',description:'Quick feints, mobile kicks and fast pulls keep the routine moving.',signature:'LP → HP → HK',
    moveSpeed:292,jumpSpeed:235,punchDamage:.9,kickDamage:1.1,throwDamage:1.12,
    reach:{punch:.97,kick:1.05,throw:1.04},tempo:{punch:.88,kick:.92,throw:.90},
    knockback:{punch:.87,kick:1.08,throw:1.1},throwDistance:158,
    preferredSequence:['low-punch','punch','kick'],preferredMoves:['low-punch','kick','power-kick','grab','punch','low-kick','double-punch']},
  'ash-flowers':{name:'Loose Rhythm Striker',description:'Relaxed flowing combinations, fast hands and balanced springy kicks.',signature:'LP → HP → HK',
    moveSpeed:280,jumpSpeed:224,punchDamage:1.05,kickDamage:1.12,throwDamage:.95,
    reach:{punch:1.02,kick:1.04,throw:.95},tempo:{punch:.90,kick:.91,throw:1},
    knockback:{punch:.95,kick:1.02,throw:.97},throwDistance:140,
    preferredSequence:['low-punch','punch','kick'],preferredMoves:['low-punch','punch','kick','double-punch','power-kick','low-kick','grab']},
  'wittyf0x':{name:'Fox Skirmisher',description:'The fastest steps and sharpest recoveries trade reach and power for nimble pressure.',signature:'LP → HP → HK',
    moveSpeed:320,jumpSpeed:255,punchDamage:.8,kickDamage:.9,throwDamage:.7,
    reach:{punch:.86,kick:.91,throw:.85},tempo:{punch:.72,kick:.80,throw:.88},
    knockback:{punch:.70,kick:.85,throw:.70},throwDistance:108,
    preferredSequence:['low-punch','punch','kick'],preferredMoves:['low-punch','punch','low-kick','kick','low-punch','power-kick','double-punch']},
};
export const WEAPON_TYPES = {
  'neural-spike': {name:'Neural Spike',charges:3,use:'melee',damage:16,reach:185,throwDamage:18},
  'pulse-driver': {name:'Pulse Driver',charges:3,use:'ranged',damage:13,throwDamage:16},
};
const WEAPON_RULES={firstSpawn:8000,interval:18000,pickupReach:85,pads:[420,860],maxMarks:12,maxEmbedded:4,maxProjectiles:8};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sign = (value) => value < 0 ? -1 : 1;
const face = (direction) => direction > 0 ? 'right' : 'left';
const rightEdge=f=>(f._worldWidth??WORLD.width)-WORLD.margin;
function limitX(f,value,impact) {
  const side=value<WORLD.margin?'left':value>rightEdge(f)?'right':null;
  if(side&&impact&&(impact.strength??0)>=.8)f._wallIntent={side,attacker:impact.attacker,strength:impact.strength,damageId:f._lastDamageId};
  return clamp(value,WORLD.margin,rightEdge(f));
}
const distance = (a, b) => Math.abs(a.x - b.x);
const control = (input = {}) => ({
  move: clamp(Number(input.move) || 0, -1, 1), crouch: !!input.crouch, block: !!input.block,
});
const emptyDamageSites = () => Object.fromEntries(['head','torso','legs'].map(site=>
  [site,{amount:0,hits:0,bruise:0,cut:0,scorch:0}]));

// Public scene state: stagePickups contains one floor item; projectiles contain
// world-space x/y/rotation. Equipment and pose-site damage persist on fighters.
// Renderer attachments use site/facing/direction/heightRatio, never stale world
// coordinates. weaponAction always accompanies the complete native punch clip.

function attackCategory(action) {
  return action==='grab'?'throw':action==='uppercut'||action.includes('punch')?'punch':action.includes('kick')?'kick':null;
}

function metadata(input = {},style=FIGHTER_STYLES['6-bit']) {
  return Object.fromEntries([...new Set([...Object.keys(DEFAULT_CLIPS),...Object.keys(input)])].map(name => {
    const fallback=DEFAULT_CLIPS[name] || {duration:700};
    const entry = input[name] || {};
    const duration = Number(entry.duration);
    const nativeDuration=Number.isFinite(duration)&&duration>0?duration:fallback.duration;
    const nativeContactMs=entry.contactMs??fallback.contactMs;
    const nativeActiveEndMs=entry.activeEndMs??(Number.isFinite(nativeContactMs)?nativeContactMs+70:undefined);
    const category=ATTACKS.has(name)?attackCategory(name):null;
    const tempo=category?style.tempo[category]:1;
    return [name, {
      ...fallback, ...entry,
      duration:nativeDuration*tempo,nativeDuration,playbackRate:1/tempo,
      ...(Number.isFinite(nativeContactMs)?{contactMs:nativeContactMs*tempo,nativeContactMs}:{}),
      ...(Number.isFinite(nativeActiveEndMs)?{activeEndMs:Math.min(nativeDuration,nativeActiveEndMs)*tempo}:{}),
    }];
  }));
}

function fighter(index, clips, identity = {}) {
  const id=identity.id??(index===0?'6-bit':'9-bit'),style=FIGHTER_STYLES[id]??FIGHTER_STYLES['6-bit'];
  return {
    id, name: identity.name ?? style.displayName ?? (index === 0 ? '6 Bit' : '9 Bit'),
    x: index === 0 ? 380 : 900, facing: index === 0 ? 'right' : 'left',
    hp: 100, maxHp: 100, height: identity.height ?? style.height ?? (index === 0 ? 320 : 368),
    action: 'idle', actionTime: 0,
    _clips: metadata(clips,style), _style:style, _control: control(), _contactDone: false,
    deletionVictimReady:['delete-brace','delete-suspended','delete-compressed','delete-crumpled','knockdown']
      .every(name=>Number.isFinite(clips?.[name]?.duration)&&clips[name].duration>0),
    _offset: 0, _next: null, _travel: null, _ko: false,
    _buffer:null, _missEvent:null, _hitConnected:false, _chainCount:0, _jumpMove:0, _launched:false,
    _sequence:[], _sequenceEntry:null,
    _launchStartY:0,
    _jump:null,_pickup:null,
    weapon:null,damageTaken:0,damageTier:0,damageSites:emptyDamageSites(),damageMarks:[],embeddedWeapons:[],_weaponAction:null,
    _floorImpactDone:false,_worldWidth:WORLD.width,_stageAction:null,_wallIntent:null,_wallImpactUntil:0,_lastDamageId:0,_lastWallDamageId:null,
  };
}

export function createMatch(options = {}) {
  const mode = ['cpu', 'local', 'practice','weapons'].includes(options.mode) ? options.mode : 'cpu';
  const stage=createStageState(options.stage);
  const match = {
    stage,mode, phase: options.start === false ? 'ready' : 'countdown', phaseTime: 0,
    fighters: [fighter(0, options.clips?.[0],options.fighters?.[0]), fighter(1, options.clips?.[1],options.fighters?.[1])],
    roundRemaining: 99000, finishRemaining: 0, winner: null,
    deletionElapsed: 0, deletionName: null, deletionId:null, deletionTargetX: 0,
    status: options.start === false ? 'READY TO CLASH' : 'ROUND 1',
    hitstop: 0, events: [], combatTime:0,
    _seed: (Number(options.seed) || 0x6b19) >>> 0,
    _cpuDecision: 0, _cpuControl: control(), _deletionOrigin: null,
    paused:false,stagePickups:[],projectiles:[],nextPickupAt:WEAPON_RULES.firstSpawn,
    _weaponSpawnIndex:0,_nextWeaponId:1,_nextProjectileId:1,_nextMarkId:1,
  };
  for(const f of match.fighters){f._worldWidth=stage.width;f.x+=(stage.width-WORLD.width)/2;}
  if (mode === 'practice' && options.start !== false && canDelete(match,0)) {
    stage.cinematicOrigin=(stage.width-WORLD.width)/2;
    match.fighters[0].x = 470;
    match.fighters[1].x = 780;
    openFinish(match, 0);
    match.finishRemaining = 60000;
  }
  if(mode==='weapons')spawnWeapon(match,match.fighters[0].x+75);
  return match;
}

function canDelete(match, index) {
  return !!deletionDefinition(match.fighters[index].id)&&match.fighters[1-index].deletionVictimReady;
}

function random(match) {
  match._seed = (Math.imul(match._seed, 1664525) + 1013904223) >>> 0;
  return match._seed / 0x100000000;
}

function emit(match, type, extra = {}) {
  // Identities follow the current match and actual event participants. Deletion
  // machinery and KO cues retain the same winner/victim pair through every beat.
  const attacker=Number.isInteger(extra.attacker)?extra.attacker:
    Number.isInteger(extra.winner)?extra.winner:
    match.phase==='deletion'||type==='deletion'?match.winner:null;
  const target=Number.isInteger(extra.target)?extra.target:
    Number.isInteger(attacker)&&(match.phase==='deletion'||['ko','finish-prompt','deletion'].includes(type))?1-attacker:null;
  const identity={};
  if(match.winner!==null&&deletionDefinition(match.fighters[match.winner]?.id)?.peaceful&&['deletion','over'].includes(match.phase))identity.peaceful=true;
  if(match.fighters[attacker])Object.assign(identity,{attacker,attackerId:match.fighters[attacker].id});
  if(match.fighters[target])Object.assign(identity,{target,victimId:match.fighters[target].id});
  match.events.push({ ...extra, ...identity, type });
}

function spawnWeapon(match,position) {
  const types=Object.keys(WEAPON_TYPES),type=types[match._weaponSpawnIndex%types.length];
  const spec=WEAPON_TYPES[type],id='weapon-'+match._nextWeaponId++;
  const pickup={id,type,name:spec.name,charges:spec.charges,
    x:position??WEAPON_RULES.pads[match._weaponSpawnIndex%WEAPON_RULES.pads.length]+((match.stage?.width??WORLD.width)-WORLD.width)/2,
    y:WORLD.floor,spawnedAt:match.combatTime};
  match._weaponSpawnIndex++;
  match.stagePickups.push(pickup);
  emit(match,'weapon-spawn',{...pickup,weaponType:type});
}

function updateWeaponSpawn(match) {
  if(match.mode==='practice'||match.combatTime<match.nextPickupAt)return;
  while(match.nextPickupAt<=match.combatTime)match.nextPickupAt+=WEAPON_RULES.interval;
  if(!match.stagePickups.length)spawnWeapon(match);
}

function vulnerable(f) {
  return f.hp>0&&!['grabbed','thrown','knockdown','getup'].includes(f.action);
}

function nearbyOpponent(match,index) {
  const target=match.fighters[1-index];
  return vulnerable(target)&&airOffset(target)>=-60&&distance(match.fighters[index],target)<=130*match.fighters[index]._style.reach.throw;
}

function pickWeapon(match,index) {
  const f=match.fighters[index];
  const pickup=match.stagePickups.find(item=>Math.abs(item.x-f.x)<=WEAPON_RULES.pickupReach);
  if(!pickup)return false;
  const facing=pickup.x===f.x?f.facing:face(pickup.x-f.x);
  const origin=f._clips.pickup.pickupOrigins?.[facing];
  let targetX=f.x;
  if(Number.isFinite(origin?.x)) {
    const other=match.fighters[1-index];
    let minimum=Math.max(WORLD.margin,f.x-WEAPON_RULES.pickupReach);
    let maximum=Math.min(rightEdge(f),f.x+WEAPON_RULES.pickupReach);
    const otherPosition=other._pickup?.targetX??other.x;
    if(other.x>=f.x)maximum=Math.min(maximum,otherPosition-WORLD.separation);
    else minimum=Math.max(minimum,otherPosition+WORLD.separation);
    if(minimum<=maximum)targetX=clamp(pickup.x-origin.x,minimum,maximum);
  }
  setAction(f,'pickup');f.facing=facing;
  // This is an intent to take a particular item, not an exclusive reservation:
  // either fighter can race for it, and the first real contact consumes it.
  f._pickup={itemId:pickup.id,type:pickup.type,name:pickup.name,
    x:pickup.x,y:pickup.y,contactDone:false,acquired:false,
    startX:f.x,targetX,alignMs:Math.max(1,Math.min(f._clips.pickup.alignMs??230,contactTime(f)))};
  return true;
}

function pickupContact(match,index) {
  const f=match.fighters[index],intent=f._pickup;
  if(!intent||intent.contactDone)return;
  intent.contactDone=true;
  const pickup=match.stagePickups.find(item=>item.id===intent.itemId);
  const origin=f._clips.pickup.pickupOrigins?.[f.facing];
  const reach=Number.isFinite(origin?.x)?Math.abs(f.x+origin.x-(pickup?.x??intent.x))<=22:
    Math.abs(f.x-(pickup?.x??intent.x))<=WEAPON_RULES.pickupReach;
  if(!pickup||f.weapon||!reach)return;
  f.weapon={id:pickup.id,type:pickup.type,name:pickup.name,charges:pickup.charges};
  intent.acquired=true;
  match.stagePickups=match.stagePickups.filter(item=>item.id!==pickup.id);
  emit(match,'weapon-pickup',{attacker:index,x:f.x,y:WORLD.floor,
    weaponId:pickup.id,weaponType:pickup.type,name:pickup.name,charges:pickup.charges});
}

function startWeaponAction(match,index,kind) {
  const f=match.fighters[index];
  if(!f.weapon||!NEUTRAL.has(f.action))return false;
  const equipment=f.weapon;
  faceOpponent(match,index);setAction(f,'punch');
  f._sequence=[];
  f._weaponAction={kind,type:equipment.type,name:equipment.name,weaponId:equipment.id,released:false};
  f._attackLevel='mid';
  emit(match,'attack',{attacker:index,target:1-index,action:'weapon-'+kind,x:f.x,y:WORLD.floor-f.height*.6,direction:f.facing==='right'?1:-1});
  return true;
}

function recordDamage(match,index,amount,event,weaponType=null,kind) {
  if(amount<=0)return;
  const f=match.fighters[index],number=match._nextMarkId++;
  if(!event.secondary){f._lastDamageId=number;f._lastAttacker=event.attacker;f._lastHitStrength=event.strength??1;}
  const site=event.site??(event.level==='low'?'legs':event.level==='mid'?'torso':'head');
  const heightRatio=event.heightRatio??({head:.82,torso:.53,legs:.24}[site]);
  const damageKind=kind??(weaponType?'cut':'bruise');
  f.damageTaken+=amount;
  f.damageTier=f.damageTaken>=60?3:f.damageTaken>=30?2:1;
  const aggregate=f.damageSites[site];
  aggregate.amount+=amount;aggregate.hits++;aggregate[damageKind]+=amount;
  f.damageMarks.push({id:'damage-'+number,site,kind:damageKind,
    intensity:clamp(amount/20,.25,1),amount,at:match.combatTime,facing:f.facing,
    direction:event.direction,heightRatio,weaponType,seed:Math.imul(number,2654435761)>>>0});
  if(f.damageMarks.length>WEAPON_RULES.maxMarks)f.damageMarks.shift();
  // Material and anatomy accompany the actual landed contact. The recent mark
  // list may roll over, while these totals retain the entire fight's damage.
  return {site,heightRatio,damageKind,damageTaken:f.damageTaken,
    bloodWeight:damageKind==='scorch'?0:damageKind==='cut'?1.5:
      clamp(.6+amount/22+aggregate.bruise/100,.7,1.8)};
}

function floorDamage(f) {
  const wet=Object.values(f.damageSites).reduce((amount,site)=>amount+site.cut+site.bruise,0);
  return {blood:wet>=12,bloodWeight:clamp(wet/45,.45,1.8),damageTaken:f.damageTaken};
}

function embedWeapon(match,index,projectile,event) {
  const f=match.fighters[index];
  // Equipment is lodged in the chest even when its projectile contacted a
  // different height. The damage mark still retains the actual impact site.
  const attachment={id:projectile.weaponId,type:projectile.type,site:'torso',
    facing:f.facing,direction:projectile.direction,at:match.combatTime,
    heightRatio:.57,seed:projectile.seed};
  f.embeddedWeapons.push(attachment);
  if(f.embeddedWeapons.length>WEAPON_RULES.maxEmbedded)f.embeddedWeapons.shift();
  emit(match,'weapon-embed',{...event,weaponType:projectile.type,attachment});
}

function weaponOrigin(f,type,throwing) {
  const clip=f._clips.punch,dir=f.facing==='right'?1:-1;
  // Origins are compiled from the native contact pose by the art loader. Their
  // coordinates share the fighter's feet anchor, so no sprite is rescaled.
  const authored=throwing?clip.weaponThrowOrigins?.[f.facing]:clip.weaponOrigins?.[type]?.[f.facing];
  return {x:f.x+(Number.isFinite(authored?.x)?authored.x:dir*110),
    y:WORLD.floor+(Number.isFinite(authored?.y)?authored.y:-f.height*.62)};
}

function launchWeapon(match,index,equipment,throwing) {
  const f=match.fighters[index],dir=f.facing==='right'?1:-1;
  const number=match._nextProjectileId++,origin=weaponOrigin(f,equipment.type,throwing);
  const hand=weaponOrigin(f,equipment.type,true);
  const projectile={id:'projectile-'+number,weaponId:equipment.id,type:equipment.type,
    kind:throwing?'throw':'pulse',owner:index,...origin,vx:dir*(throwing?650:900),
    vy:throwing?-30:0,gravity:throwing?90:0,direction:dir,rotation:0,
    damage:throwing?WEAPON_TYPES[equipment.type].throwDamage:WEAPON_TYPES[equipment.type].damage,
    embed:throwing,age:0,ttl:1800,seed:Math.imul(number,2246822519)>>>0,
    _initialSweepX:hand.x,_initialSweepY:hand.y};
  match.projectiles.push(projectile);
  if(match.projectiles.length>WEAPON_RULES.maxProjectiles)match.projectiles.shift();
  return projectile;
}

function weaponHit(match,index,event,damage,projectile=null) {
  const victim=match.fighters[1-index],dir=event.direction,air=airOffset(victim);
  if(match.phase!=='fight'||!vulnerable(victim))return false;
  if(victim._control.block&&NEUTRAL.has(victim.action)) {
    victim.hp=Math.max(1,victim.hp-1);
    victim.facing=face(-dir);setAction(victim,'block');
    victim.x=limitX(victim,victim.x+dir*12);
    match.hitstop=Math.max(match.hitstop,35);
    emit(match,'block',event);
    return true;
  }
  const dealt=Math.min(victim.hp,damage);
  victim.hp-=dealt;victim.facing=face(-dir);
  const injury=recordDamage(match,1-index,dealt,event,event.weaponType,event.action==='pulse-shot'?'scorch':'cut');
  if(projectile?.embed)embedWeapon(match,1-index,projectile,event);
  match.hitstop=Math.max(match.hitstop,65);
  emit(match,'hit',{...event,...injury,damage:dealt,combo:1});
  if(victim.hp===0){openFinish(match,index);return true;}
  if(air<0) {
    setAction(victim,'thrown','knockdown');victim._throwDirection=dir;
    victim._throwAttacker=index;victim._launched=true;victim._launchStartY=air;
    startTravel(victim,100);
    emit(match,'throw',{...event,launch:true,strength:1.6});
  } else {
    setAction(victim,'low',null,victim._clips.low.reactionStartMs||0);
    victim._fallDirection=dir;
    victim.x=limitX(victim,victim.x+dir*35,event);
  }
  return true;
}

function weaponContact(match,index) {
  const f=match.fighters[index],mode=f._weaponAction,equipment=f.weapon;
  if(!mode||!equipment||equipment.id!==mode.weaponId)return;
  mode.released=true;
  const dir=f.facing==='right'?1:-1,spec=WEAPON_TYPES[equipment.type];
  const origin=weaponOrigin(f,equipment.type,mode.kind==='throw');
  const cue={attacker:index,target:1-index,weaponType:equipment.type,
    weaponId:equipment.id,name:equipment.name,x:origin.x,y:origin.y,direction:dir};
  if(mode.kind==='throw') {
    f.weapon=null;
    const projectile=launchWeapon(match,index,equipment,true);
    emit(match,'weapon-throw',{...cue,projectileId:projectile.id,charges:equipment.charges});
    return;
  }
  if(equipment.charges<=0){emit(match,'weapon-empty',{...cue,charges:0});return;}
  equipment.charges--;
  emit(match,'weapon-use',{...cue,charges:equipment.charges});
  if(spec.use==='ranged') {launchWeapon(match,index,equipment,false);return;}
  const target=match.fighters[1-index],air=airOffset(target);
  const event={...cue,x:target.x,y:WORLD.floor+air-target.height*.53,
    action:'weapon-use',level:'mid',site:'torso',heightRatio:.53,strength:1.6};
  if(!vulnerable(target)||(target.x-f.x)*dir<=0||distance(f,target)>spec.reach||air<-130) {
    emit(match,'miss',{...event,x:f.x+dir*spec.reach});return;
  }
  weaponHit(match,index,event,spec.damage);
}

function updateProjectiles(match,dt) {
  if(match.phase!=='fight')return;
  const survivors=[];
  for(const p of match.projectiles) {
    // A muzzle may already overlap a very close opponent. The first sweep also
    // covers the occupied hand-to-muzzle segment, avoiding shots that appear to
    // pass through a body because the visible barrel extends beyond its centre.
    const previousX=p._initialSweepX??p.x,previousY=p._initialSweepY??p.y;
    delete p._initialSweepX;delete p._initialSweepY;
    p.age+=dt;p.x+=p.vx*dt/1000;
    p.y+=p.vy*dt/1000+p.gravity*(dt/1000)**2/2;p.vy+=p.gravity*dt/1000;
    p.rotation=p.kind==='throw'?p.direction*p.age*.012:0;
    if(p.age>=p.ttl||p.x<-120||p.x>(match.stage?.width??WORLD.width)+120)continue;
    const victim=match.fighters[1-p.owner],air=airOffset(victim);
    const duck=isCrouched(victim);
    const height=victim.height*(duck ? .54 : 1),feet=WORLD.floor+air;
    // Sweep the small projectile across this fixed step; fast shots cannot skip
    // a body just because a rendering frame was dropped.
    const minX=Math.min(previousX,p.x),maxX=Math.max(previousX,p.x);
    const contactY=(previousY+p.y)/2;
    const contact=vulnerable(victim)&&maxX>=victim.x-45&&minX<=victim.x+45
      &&contactY>=feet-height&&contactY<=feet-10;
    if(contact) {
      const heightRatio=clamp((feet-contactY)/victim.height,.12,.93);
      const site=heightRatio>.74?'head':heightRatio<.32?'legs':'torso';
      const event={attacker:p.owner,target:1-p.owner,x:victim.x,y:contactY,
        action:p.kind==='throw'?'weapon-throw':'pulse-shot',level:'mid',site,heightRatio,
        direction:p.direction,strength:p.kind==='throw'?1.7:1.3,weaponType:p.type,
        weaponId:p.weaponId,projectileId:p.id};
      if(weaponHit(match,p.owner,event,p.damage,p)) {
        if(match.phase!=='fight')return;
        continue;
      }
    }
    survivors.push(p);
  }
  match.projectiles=survivors;
}

function setAction(f, action, next = null, offset = 0, preserveJump = false) {
  const jump=preserveJump?f._jump:null;
  f.action = action;
  f.actionTime = 0;
  f._offset = offset;
  f._contactDone = false;
  f._missEvent = null;
  f._next = next;
  f._travel = null;
  f._buffer = null;
  f._hitConnected = false;
  f._launched = false;
  f._launchStartY = 0;
  f._jump = jump;
  f._jumpMove = jump?.move??0;
  f._chainCount = 0;
  f._weaponAction = null;
  f._pickup = null;
  f._stageAction=null;f._wallIntent=null;
  f._floorImpactDone = false;
  f._sequenceEntry = null;
  // Recovery keeps a short confirmed input history, while interruption and
  // contextual actions cannot donate hits to a later button sequence.
  if(!NEUTRAL.has(action)&&!COMBO_ATTACKS.has(action)&&!CHORD_ATTACKS.has(action))f._sequence=[];
}

function duration(f) {
  if (f.action === 'grab') return 670*f._style.tempo.throw;
  return Math.max(1, (f._clips[f.action]?.duration || 450) - f._offset);
}

function contactTime(f) {
  return f.action === 'grab' ? 180*f._style.tempo.throw : f._clips[f.action]?.contactMs ?? 180;
}

function activeEndTime(f) {
  return f.action==='grab'||f._weaponAction?contactTime(f):f._clips[f.action]?.activeEndMs??contactTime(f)+70;
}

function combatPose(f,view) {
  const clip=view?.clip??(f.action==='grab'?'punch':f.action),metadata=f._clips[clip],poses=metadata?.combatPoses;
  if(!poses)return null;
  const elapsed=Math.max(0,view?.elapsed??(f.actionTime+f._offset)*(metadata.playbackRate??1));
  const time=poses.loop?elapsed%poses.duration:Math.min(elapsed,poses.duration-.001);
  const entry=poses.entries.find(entry=>time>=entry.start&&time<entry.end)??poses.entries.at(-1);
  return {index:entry?.index??0,frame:poses.frames[view?.facing??f.facing]?.[entry?.index??0]};
}

function hurtRegions(f) {
  const pose=combatPose(f)?.frame,feet=WORLD.floor+airOffset(f);
  const regions=pose?.hurt??[{site:'torso',left:-45,right:45,top:-f.height*(isCrouched(f)?.54:1),bottom:-10}];
  return regions.map(region=>({...region,left:f.x+region.left,right:f.x+region.right,top:feet+region.top,bottom:feet+region.bottom}));
}

// Segment against three expanded body boxes. This follows a forearm/shin while
// keeping collision bounded and independent of canvas/image readback.
function limbContact(start,end,body,radius) {
  let enter=0,leave=1;
  for(const [axis,min,max]of [['x',body.left-radius,body.right+radius],['y',body.top-radius,body.bottom+radius]]) {
    const delta=end[axis]-start[axis];
    if(Math.abs(delta)<.00001) {if(start[axis]<min||start[axis]>max)return null;continue;}
    const a=(min-start[axis])/delta,b=(max-start[axis])/delta;
    enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    if(enter>leave)return null;
  }
  return {x:clamp(start.x+(end.x-start.x)*enter,body.left,body.right),
    y:clamp(start.y+(end.y-start.y)*enter,body.top,body.bottom),site:body.site};
}

function airOffset(f) {
  if (f._jump) {
    const progress = clamp(f._jump.elapsed / f._jump.duration, 0, 1);
    return -185 * 4 * progress * (1 - progress);
  }
  if (f.action === 'thrown' && f._launched) {
    // Land before the authored final floor pose; move the entire source image.
    const airDuration = Math.max(1, Math.min(duration(f) * .65, duration(f) - 220));
    const progress = clamp(f.actionTime / airDuration, 0, 1);
    return f._launchStartY * (1 - progress) - 80 * 4 * progress * (1 - progress);
  }
  return 0;
}

function isCrouched(f) {
  return CROUCH_ATTACKS.has(f.action)||(f._control.crouch&&NEUTRAL.has(f.action));
}

function canCancel(f, action, sequenceFinish = false) {
  return !f._weaponAction&&COMBO_ATTACKS.has(f.action) && (COMBO_ATTACKS.has(action)||sequenceFinish)
    && f._hitConnected && f._chainCount < 2 && action !== f.action
    && f.actionTime >= contactTime(f) + 40;
}

function sequenceFinish(f,action,at) {
  const previous=f._sequence.slice(-2);
  if(previous.length!==2||previous.some(entry=>!entry.connected)
    ||at-previous[0].at>1250||at-previous[1].at>600
    ||previous[1].at-previous[0].at>600)return null;
  return BUTTON_SEQUENCES.find(sequence=>sequence.buttons[0]===previous[0].action
    &&sequence.buttons[1]===previous[1].action&&sequence.buttons[2]===action)?.action??null;
}

function rememberButton(f,action,at) {
  if(!COMBO_ATTACKS.has(action)){f._sequence=[];return;}
  if(f._sequence.length&&at-f._sequence.at(-1).at>600)f._sequence=[];
  const entry={action,at,connected:false};
  f._sequence.push(entry);f._sequence=f._sequence.slice(-2);f._sequenceEntry=entry;
}

function endOffset(f, clip) {
  const offset = Number(f._clips[clip]?.endOffsetX?.[f.facing]);
  return Number.isFinite(offset) ? offset : 0;
}

function faceOpponent(match, index) {
  const f = match.fighters[index], other = match.fighters[1 - index];
  f.facing = face(other.x - f.x);
}

export function performAction(match, index, action, inputSnapshot, acceptedAt = match?.combatTime) {
  const f = match?.fighters?.[index];
  if (!f || match.paused) return false;
  if (action === 'deletion') {
    if (match.phase !== 'finish' || match.winner !== index || !canDelete(match,index)) return false;
    startDeletion(match);
    return true;
  }
  if(match.paused||match.phase!=='fight'||f.hp<=0)return false;
  if(inputSnapshot!==undefined)f._control=control(inputSnapshot);
  if(f._jump) {
    const aerial=['punch','low-punch','jump-punch'].includes(action)?'jump-punch'
      :['kick','low-kick','jump-kick'].includes(action)?'jump-kick':null;
    if(!aerial||f.action!=='jump'||f._jump.attackUsed)return false;
    const contact=f._clips[aerial].contactMs??100;
    if(f._jump.duration-f._jump.elapsed<=contact)return false;
    f._jump.attackUsed=true;
    setAction(f,aerial,null,0,true);f._attackLevel='overhead';
    emit(match,'attack',{attacker:index,target:1-index,action:aerial,x:f.x,y:WORLD.floor-f.height*.6,direction:f.facing==='right'?1:-1});
    return true;
  }
  if(action==='weapon-throw')return startWeaponAction(match,index,'throw');
  if(action==='weapon-use'||(action==='punch'&&f.weapon&&!f._control.crouch))return startWeaponAction(match,index,'use');
  if(action==='grab'&&NEUTRAL.has(f.action)) {
    if(f.weapon&&f._control.crouch)return startWeaponAction(match,index,'throw');
    if(!nearbyOpponent(match,index)) {
      if(f.weapon)return startWeaponAction(match,index,'throw');
      if(pickWeapon(match,index))return true;
      if(startStageInteraction(match,index))return true;
    }
  }
  if(action==='jump') {
    if(!NEUTRAL.has(f.action))return false;
    const move=f._control.move;
    faceOpponent(match,index);
    setAction(f,'jump');f._jumpMove=move;f._chainCount=0;
    f._jump={elapsed:0,duration:f._clips.jump.duration,move,attackUsed:false};
    emit(match,'jump',{attacker:index,x:f.x,y:WORLD.floor,direction:move<0?-1:1});
    return true;
  }
  if(!ATTACKS.has(action))return false;
  if(AIR_ATTACKS.has(action))return false;
  if(f._control.crouch) {
    if(action==='punch')action='uppercut';
    else if(action==='low-punch')action='crouch-punch';
    else if(action==='kick')action='crouch-high-kick';
    else if(action==='low-kick')action='crouch-kick';
  }
  if(CHORD_ATTACKS.has(action)&&f._control.crouch)return false;
  const requested=action,sequence=sequenceFinish(f,action,acceptedAt);
  if(sequence)action=sequence;
  const cancel=canCancel(f,action,!!sequence);
  if(!NEUTRAL.has(f.action)&&!cancel) {
    if(!f._weaponAction&&COMBO_ATTACKS.has(f.action)&&COMBO_ATTACKS.has(requested)&&f._chainCount<2
      &&requested!==f.action&&(!f._contactDone||f._hitConnected)) {
      f._buffer={kind:'combo',action:requested,at:acceptedAt,inputSnapshot:{...f._control},expires:match.combatTime+140};return true;
    }
    if(!f._weaponAction&&!f._jump&&RECOVERY_ATTACKS.has(f.action)&&RECOVERY_ATTACKS.has(requested)
      &&f.actionTime>=activeEndTime(f)&&duration(f)-f.actionTime<=RECOVERY_INPUT_MS) {
      f._buffer={kind:'recovery',action:requested,at:acceptedAt,inputSnapshot:{...f._control},expires:match.combatTime+140};return true;
    }
    return false;
  }
  const chainCount=sequence?2:cancel?f._chainCount+1:0;
  faceOpponent(match, index);
  const low = action === 'low-kick'||action==='crouch-kick';
  setAction(f, action);
  f._chainCount=chainCount;
  rememberButton(f,sequence?action:requested,acceptedAt);
  f._attackLevel = low ? 'low' : action==='crouch-high-kick'?'overhead'
    : ['low-punch','crouch-punch','double-punch','power-kick'].includes(action)?'mid':'high';
  if(action==='power-kick') {
    const dir=f.facing==='right'?1:-1;
    const room=Math.max(0,(match.fighters[1-index].x-f.x)*dir-WORLD.separation);
    f._travel={start:f.x,end:limitX(f,f.x+dir*Math.min(65,room))};
  }
  if(!CHORD_ATTACKS.has(action))emit(match,'attack',{attacker:index,target:1-index,action,x:f.x,y:WORLD.floor-f.height*.6,direction:f.facing==='right'?1:-1});
  if(CHORD_ATTACKS.has(action))emit(match,'special',{attacker:index,target:1-index,
    action,sequence:!!sequence,x:f.x,y:WORLD.floor-f.height*.5,direction:f.facing==='right'?1:-1});
  return true;
}

function attackContact(match, index) {
  const attacker = match.fighters[index], victim = match.fighters[1 - index];
  if(attacker._weaponAction){attacker._contactDone=true;weaponContact(match,index);return;}
  const dir = attacker.facing === 'right' ? 1 : -1;
  const action = attacker.action;
  const category=attackCategory(action),style=attacker._style;
  const low = attacker._attackLevel === 'low';
  const air=airOffset(victim);
  const reach = ({punch:180,kick:220,'low-punch':165,'low-kick':195,uppercut:165,grab:130,
    'crouch-punch':160,'crouch-kick':225,'crouch-high-kick':200,
    'double-punch':220,'power-kick':275,'jump-punch':175,'jump-kick':225}[action])*style.reach[category];
  const pose=combatPose(attacker)?.frame;
  const authoredRatio=Number(attacker._clips[action]?.strikeHeightRatio);
  const strikeRatio=Number.isFinite(authoredRatio)?authoredRatio:
    ({punch:.78,kick:.62,'low-punch':.40,'low-kick':.22,uppercut:.88,grab:.55,
      'crouch-punch':.36,'crouch-kick':.15,'crouch-high-kick':.49,'double-punch':.55,'power-kick':.48,'jump-punch':.53,'jump-kick':.35}[action]);
  // A contact belongs to the attacking limb, never to the victim's altitude.
  const contactY=WORLD.floor+airOffset(attacker)+(pose?.strike.y??-attacker.height*strikeRatio);
  const contactX=attacker.x+(pose?pose.strike.x*style.reach[category]:dir*reach);
  const radius=pose?.strikeRadius??(action==='crouch-high-kick'?12:14);
  const limbEnd={x:contactX,y:contactY};
  const limbStart=pose?.strikeStart?{x:attacker.x+pose.strikeStart.x,y:WORLD.floor+airOffset(attacker)+pose.strikeStart.y}:
    {x:attacker.x+dir*Math.min(50,reach*.25),y:contactY};
  const contact=action==='grab'?{x:victim.x,y:WORLD.floor+air-victim.height*.55,site:'torso'}:
    hurtRegions(victim).map(body=>limbContact(limbStart,limbEnd,body,radius)).find(Boolean);
  const heightRatio=clamp((WORLD.floor+air-(contact?.y??contactY))/victim.height,.12,.93);
  const event = {
    attacker:index,target:1-index,x:contact?.x??contactX,
    y:contact?.y??contactY,direction:dir,heightRatio,site:contact?.site??(heightRatio>.74?'head':heightRatio<.32?'legs':'torso'),
    strength:(action.includes('punch')?.9:action==='uppercut'?2:action.includes('kick')?1.5:1.8)*style.knockback[category],
    action,level:attacker._attackLevel,
  };
  const targetVulnerable=!['grabbed','thrown','knockdown','getup'].includes(victim.action);
  const front=(victim.x-attacker.x)*dir>0;
  const duck=['punch','kick'].includes(action)&&!low&&isCrouched(victim);
  const outOfHeight=air<-60&&(low||action==='grab');
  if(!targetVulnerable||!front||distance(attacker,victim)>reach||duck||outOfHeight||!contact) {
    attacker._missEvent={...event,x:contactX};
    if(action==='grab')finishMiss(match,index);
    return;
  }
  attacker._contactDone=true;attacker._missEvent=null;
  const blocks = action !== 'grab' && victim._control.block && NEUTRAL.has(victim.action)
    && (attacker._attackLevel==='overhead'?!victim._control.crouch:!low||victim._control.crouch);
  if (blocks) {
    attacker._buffer=null;
    attacker._sequence=[];attacker._sequenceEntry=null;
    victim.hp = Math.max(1, victim.hp - 1);
    faceOpponent(match, 1 - index);
    setAction(victim, 'block');
    victim.x=limitX(victim,victim.x+dir*12);
    match.hitstop = Math.max(match.hitstop, 35);
    emit(match, 'block', event);
    return;
  }
  const baseDamage={punch:8,kick:low?10:14,'low-punch':6,'low-kick':10,uppercut:19,grab:12,
    'crouch-punch':6,'crouch-kick':10,'crouch-high-kick':12,
    'double-punch':18,'power-kick':21,'jump-punch':9,'jump-kick':13}[action];
  const damageMultiplier=category==='punch'?style.punchDamage:category==='kick'?style.kickDamage:style.throwDamage;
  const damage=Math.min(victim.hp,Math.max(4,Math.round(baseDamage*damageMultiplier*(1-attacker._chainCount*.14))));
  attacker._hitConnected=true;
  if(attacker._sequenceEntry)attacker._sequenceEntry.connected=true;
  victim.hp = Math.max(0, victim.hp - damage);
  victim.facing = face(-dir);
  const injury=recordDamage(match,1-index,damage,action==='grab'?{...event,site:'torso'}:event);
  match.hitstop = Math.max(match.hitstop, action === 'punch' ? 55 : 75);
  emit(match, 'hit', { ...event, ...injury, damage, combo:attacker._chainCount+1 });
  if (victim.hp === 0) {
    openFinish(match, index);
    return;
  }
  if (action === 'grab') {
    setAction(victim, 'grabbed', 'thrown');
    victim._throwDirection = dir;
    victim._throwAttacker = index;
    victim._throwDistance=style.throwDistance;
    attacker._contactDone = true;
    return;
  }
  if (action === 'uppercut' || air < 0) {
    setAction(victim, 'thrown', 'knockdown');
    victim._throwDirection=dir;
    victim._throwAttacker=index;
    victim._launched=true;
    victim._launchStartY=air;
    startTravel(victim,130*style.knockback[category]);
    emit(match,'throw',{x:victim.x,y:WORLD.floor+air-victim.height*.5,direction:dir,strength:1.8,attacker:index,target:1-index,launch:true});
    return;
  }
  const reaction = low || ['low-punch','crouch-punch','double-punch'].includes(action) ? 'low' : 'high';
  const next = ['kick','crouch-kick','power-kick'].includes(action) ? 'knockdown' : null;
  setAction(victim, reaction, next, victim._clips[reaction].reactionStartMs || 0);
  victim._fallDirection = dir;
  victim.x=limitX(victim,victim.x+dir*(action==='punch'?27:action==='crouch-high-kick'?55:action==='double-punch'?50:40)*style.knockback[category],event);
}

function finishMiss(match,index) {
  const f=match.fighters[index];f._contactDone=true;
  if(f._buffer?.kind!=='recovery')f._buffer=null;
  f._sequence=[];f._sequenceEntry=null;
  if(f._missEvent)emit(match,'miss',f._missEvent);
  f._missEvent=null;
}

function openFinish(match, winner) {
  match.projectiles=[];
  match.phase = 'finish';
  match.phaseTime = 0;
  match.winner = winner;
  match.finishRemaining = canDelete(match,winner) ? 7000 : 1500;
  match.status = canDelete(match,winner) ? 'DELETE HIM!' : match.fighters[winner].name.toUpperCase()+' WINS';
  match.finisherAvailable=canDelete(match,winner);
  const definition=deletionDefinition(match.fighters[winner].id);
  match.deletionName=match.finisherAvailable?definition.name:null;
  match.deletionId=match.finisherAvailable?definition.id:null;
  match.hitstop = 0;
  const victim = match.fighters[1 - winner], attacker = match.fighters[winner];
  victim.hp = 0;
  victim.facing = face(attacker.x - victim.x);
  setAction(victim, 'high', null, victim._clips.high.reactionStartMs || 0);
  victim.actionTime = Math.min(140, duration(victim) - 1);
  setAction(attacker, 'idle');
  faceOpponent(match, winner);
  emit(match, 'ko', { x: victim.x, y: WORLD.floor - victim.height * 0.55, direction: sign(victim.x - attacker.x), winner, finishing: canDelete(match,winner) });
  if(match.finisherAvailable)emit(match,'finish-prompt',{winner,name:match.deletionName,x:640,y:270});
}

function collapse(match) {
  if (match.winner == null) return;
  const victim = match.fighters[1 - match.winner];
  victim._ko = true;
  setAction(victim, 'knockdown');
  victim._fallDirection = sign(victim.x - match.fighters[match.winner].x);
  victim._travel={start:victim.x,end:limitX(victim,victim.x+victim._fallDirection*45)};
  setAction(match.fighters[match.winner], 'idle');
  match.phase = 'over';
  match.phaseTime = 0;
  match.status = `${match.fighters[match.winner].name.toUpperCase()} WINS`;
}

function startDeletion(match) {
  match.projectiles=[];
  match.stagePickups=[];
  const winner = match.fighters[match.winner], victim = match.fighters[1-match.winner];
  const definition=deletionDefinition(winner.id);
  if(match.stage){
    if(['hug','litter-box','rip'].includes(definition.mechanism)){
      // The ending uses an authored local pair cut. Its scenery camera remains
      // within the world even when the victim was standing at the outer wall.
      const shift=victim.x-640;match.stage.cinematicOrigin=clamp((match.stage.cinematicOrigin??0)+shift,0,match.stage.width-WORLD.width);
      for(const f of match.fighters)f.x-=shift;
    }
    else if(match.stage.cinematicOrigin===null){match.stage.cinematicOrigin=clamp((winner.x+victim.x)/2-640,0,match.stage.width-WORLD.width);for(const f of match.fighters)f.x-=match.stage.cinematicOrigin;}
    for(const f of match.fighters)f._worldWidth=WORLD.width;
    match.stage.activation=null;match.stage.interaction=null;
  }
  // Cinematic grips belong to the intact authored body poses. Equipped gear is
  // stowed; lodged gear and the accumulated injuries remain on the victim.
  for(const fighter of match.fighters) {
    fighter.weapon=null;fighter._weaponAction=null;fighter._pickup=null;
    fighter._buffer=null;fighter._sequence=[];
  }
  const dir = sign(victim.x - winner.x);
  // Keep the CRT and the complete thrown fighter within the visible stage.
  let target = clamp(victim.x + dir * 205, 430, WORLD.width - 430);
  let throwStart = dir > 0 ? Math.min(victim.x, target - 180) : Math.max(victim.x, target + 180);
  let near=throwStart-dir*130;
  if(definition.mechanism==='drive') {
    // The drive sits between DJ and target, leaving a clear pull lane.
    // The waist-bound airborne victim never travels through the operator.
    target=dir>0?680:600;near=dir>0?180:1100;throwStart=dir>0?980:300;
  }
  if(definition.mechanism==='sign') {
    // Keep the opponent under the hanging sign. Cliff delivers the notice
    // nearby, then physically walks back to the separate lever station.
    target=clamp(victim.x,520,760);throwStart=target;near=target-dir*140;
  }
  if(definition.mechanism==='wheel') {
    // Leave a real bow range on either side while keeping both complete
    // fighters onstage. Clamping only the archer erased that range at a wall.
    target=clamp(victim.x+dir*100,dir>0?660:520,dir>0?760:620);throwStart=target;near=target-dir*125;
  }
  if(definition.mechanism==='stamp') {
    target=clamp(victim.x,520,760);throwStart=target;near=target-dir*140;
  }
  if(definition.mechanism==='speaker-stack') {
    target=dir>0?830:450;throwStart=target-dir*40;near=target-dir*180;
  }
  if(definition.mechanism==='truss') {
    target=clamp(victim.x+dir*140,520,760);throwStart=target-dir*90;near=target-dir*260;
  }
  if(['positivity','wand'].includes(definition.mechanism)) {
    target=definition.mechanism==='wand'?clamp(victim.x,dir>0?650:520,dir>0?760:630):clamp(victim.x,520,760);
    throwStart=target;near=clamp(target-dir*(definition.mechanism==='wand'?420:300),WORLD.margin,WORLD.width-WORLD.margin);
  }
  if(['hug','litter-box','rip'].includes(definition.mechanism)){target=clamp(victim.x,520,760);throwStart=target;near=target-dir*({hug:105,'litter-box':255,rip:155}[definition.mechanism]);}
  match.phase = 'deletion';
  match.phaseTime = 0;
  match.deletionElapsed = 0;
  match.deletionTargetX = target;
  match.status = definition.name.toUpperCase();
  match._deletionOrigin = {
    winner: winner.x, originalVictim: victim.x, victim: throwStart,
    direction: dir,victimFacing:face(-dir),near,target,
    ...(definition.mechanism==='drive'?{dragDirection:-dir,tripX:throwStart-dir*65}:{}),
    ...(definition.mechanism==='sign'?{operatorX:clamp(target-dir*330,WORLD.margin,WORLD.width-WORLD.margin),
      leverX:target-dir*260,leverY:445}:{}),
    ...(definition.mechanism==='wheel'?{operatorX:clamp(target-dir*450,WORLD.margin,WORLD.width-WORLD.margin),
      wheelX:target,wheelY:440,landX:clamp(target+dir*160,WORLD.margin,WORLD.width-WORLD.margin)}:{}),
    ...(definition.mechanism==='jaws'?{operatorX:target}:{}),
    ...(definition.mechanism==='speaker-stack'?{operatorX:target-dir*200,stackX:target-dir*70}:{}),
    ...(definition.mechanism==='truss'?{trussX:target+dir*80,slamX:target-dir*80}:{}),
  };
  if(definition.mechanism==='litter-box'){
    const strike=winner._clips['delete-claw']?.contactStrikeOrigins?.[face(dir)],bodyClip=victim._clips['delete-brace'],bodyTime=Math.min(300,(bodyClip?.nativeDuration??301)-.001);
    const bodyIndex=bodyClip?.combatPoses?.entries?.find(entry=>bodyTime>=entry.start&&bodyTime<entry.end)?.index??0,sites=bodyClip?.combatPoses?.frames?.[face(-dir)]?.[bodyIndex]?.sites;
    const headOffset=victim.height>260&&sites?sites.head.x-sites.torso.x:0;
    if(Number.isFinite(strike?.x))match._deletionOrigin.scratchNear=target+headOffset-strike.x;
  }
  if(['wand','truss'].includes(definition.mechanism)) {
    const top=Number(victim._clips['delete-suspended']?.topOffsets?.[face(-dir)]);
    const nominal=definition.mechanism==='wand'?150:190;
    // Raised hands on taller native poses need less lift to clear the HUD.
    // Only the complete body's travel changes; its native scale stays fixed.
    match._deletionOrigin.liftDistance=definition.mechanism==='truss'?nominal:
      Number.isFinite(top)?clamp(WORLD.floor+top-130,definition.mechanism==='wand'?90:0,nominal):nominal;
  }
  if(definition.mechanism==='coffin') {
    const nail=winner._clips['delete-nail'],tips=nail?.contactNailTipOrigins??nail?.nailTipOrigins;
    const bodies=nail?.contactTorsoOrigins??nail?.contactHeadOrigins??nail?.headOrigins;
    const authoredFacing=nail?.nailPoseFacing??nail?.nailFacing;
    const preferred=authoredFacing==='left'||authoredFacing==='right'?authoredFacing:face(dir);
    const measured=['right','left'].flatMap(facing=>{
      const tip=tips?.[facing],body=bodies?.[facing];
      if(!Number.isFinite(tip?.x)||!Number.isFinite(body?.x))return [];
      const rootX=target-tip.x,bodyX=rootX+body.x;
      return [{facing,rootX,bodyX,tip}];
    }).filter(candidate=>candidate.rootX>=WORLD.margin&&candidate.rootX<=WORLD.width-WORLD.margin&&candidate.bodyX<target-8);
    const registration=measured.find(candidate=>candidate.facing===preferred)??measured.sort((a,b)=>Math.abs(a.bodyX-(target-100))-Math.abs(b.bodyX-(target-100)))[0];
    if(registration) {
      match._deletionOrigin.nailRootX=registration.rootX;
      match._deletionOrigin.nailFacing=registration.facing;
      match._deletionOrigin.nailPoseFacing=registration.facing;
      match._deletionOrigin.nailTipOrigin={...registration.tip};
    }
    const originX=registration?null:nail?.contactGripOrigins?.[face(dir)]?.x;
    // This is the native contact hand relative to its own floor anchor. The
    // active coffin's centered spike hole is at target; no body scale changes.
    if(Number.isFinite(originX))match._deletionOrigin.nailRootX=target-originX;
  }
  winner.facing = face(dir);
  victim.facing = face(-dir);
  emit(match, 'deletion', { name: match.deletionName, x: target, y: WORLD.floor - 150, direction: dir, strength: 2 });
}

const isDistinctDeletion=definition=>['coffin','waste-chute','drive','sign','wheel','stamp','jaws','speaker-stack','truss','positivity','wand','hug','litter-box','rip'].includes(definition.mechanism);
const interpolate=(start,end,time,from,to)=>start+(end-start)*clamp((time-from)/(to-from),0,1);
const easedTravel=(start,end,time,from,to)=>start+(end-start)*easedProgress(time,from,to);

function deletionFlight(match,time) {
  const o=match._deletionOrigin,definition=deletionDefinition(match.fighters[match.winner].id),b=definition.beats;
  const from=definition.mechanism==='crt'?b.drive:definition.mechanism==='waste-chute'?b.load:null;
  if(from===null||time<from||time>=b.captured)return null;
  const endY=definition.mechanism==='crt'?-80:-75,height=definition.mechanism==='crt'?105:110;
  return {mechanism:definition.mechanism,progress:clamp((time-from)/(b.captured-from),0,1),
    direction:o.direction,startX:o.victim,endX:o.target,startY:0,endY,height};
}

function broadcastCutPositions(match,time) {
  const o=match._deletionOrigin,b=deletionDefinition(match.fighters[match.winner].id).beats,flight=deletionFlight(match,time);
  const winnerX=easedTravel(o.winner,o.near,time,0,b.shove);
  const victimX=time<b.drive?interpolate(o.originalVictim,o.victim,time,0,b.shove):
    flight?o.victim+(o.target-o.victim)*flight.progress:o.target;
  const victimY=flight?flight.endY*flight.progress-flight.height*Math.sin(Math.PI*flight.progress):
    time>=b.eyePop?-130:time>=b.captured?-80:0;
  return {winnerX,victimX,victimY:victimY===0?0:victimY};
}

function approvedDeletionPositions(match,time) {
  const o=match._deletionOrigin,winner=match.fighters[match.winner],victim=match.fighters[1-match.winner];
  const definition=deletionDefinition(winner.id),b=definition.beats;
  if(['hug','litter-box','rip'].includes(definition.mechanism))return newDeletionPositions(match,time,definition);
  const approachEnd=definition.mechanism==='waste-chute'?b.fold:b.shove;
  let winnerX=easedTravel(o.winner,o.near,time,0,approachEnd);
  let victimX,victimY=0,rotation=0,eraseProgress=0;
  if(definition.mechanism==='wheel') {
    if(time>=b.retreat)winnerX=easedTravel(o.near,o.operatorX,time,b.retreat,b.aim);
    if(time<b.launch) {
      victimX=interpolate(o.originalVictim,o.target,time,0,b.bind);
      if(time>=b.captured)victimY=interpolate(0,-25,time,b.captured,b.captured+250);
      const spin=clamp((time-b.spin)/(b.arrowHit-b.spin),0,1);
      rotation=Math.PI*(1-Math.cos(Math.PI*spin));
    } else if(time<b.landed) {
      victimX=interpolate(o.target,o.landX-endOffset(victim,'thrown'),time,b.launch,b.landed);
      victimY=interpolate(-25,0,time,b.launch,b.landed);
    } else victimX=o.landX-endOffset(victim,'knockdown');
  } else if(definition.mechanism==='stamp') {
    if(time<b.fall)victimX=interpolate(o.originalVictim,o.target,time,0,b.gut);
    else victimX=interpolate(o.target,o.target-endOffset(victim,'knockdown'),time,b.fall,b.landed);
  } else if(definition.mechanism==='jaws') {
    if(time>=b.haul)winnerX=easedTravel(o.near,o.operatorX,time,b.haul,b.captured);
    if(time<b.haul)victimX=interpolate(o.originalVictim,o.victim,time,0,b.grip);
    else victimX=interpolate(o.victim,o.target,time,b.haul,b.captured);
  } else if(definition.mechanism==='speaker-stack') {
    if(time>=b.landed)winnerX=easedTravel(o.near,o.operatorX,time,b.landed,b.stackReach);
    if(time<b.fall)victimX=interpolate(o.originalVictim,o.victim,time,0,b.kickWindup);
    else if(time<b.landed)victimX=interpolate(o.victim,o.target-endOffset(victim,'thrown'),time,b.fall,b.landed);
    else victimX=o.target-endOffset(victim,'knockdown');
  } else if(definition.mechanism==='truss') {
    if(time<b.hoist)victimX=interpolate(o.originalVictim,o.victim,time,0,b.cableCast);
    else if(time<b.slamPull) {
      const swing=clamp((time-b.hoist)/(b.trussHit-b.hoist),0,1);
      victimX=o.victim+(o.target-o.victim)*swing*swing;
      victimY=-o.liftDistance*swing*swing;
    } else {
      victimX=interpolate(o.target,o.slamX-endOffset(victim,'knockdown'),time,b.slamPull,b.floorSlam);
      const fall=clamp((time-b.slamPull)/(b.floorSlam-b.slamPull),0,1);
      victimY=-o.liftDistance*(1-fall*fall);
    }
  } else if(definition.mechanism==='positivity') {
    if(time<b.positivitySurge)victimX=interpolate(o.originalVictim,o.target,time,0,b.castWindup);
    else victimX=interpolate(o.target,o.target-endOffset(victim,'knockdown'),time,b.positivitySurge,b.landed);
  } else if(definition.mechanism==='wand') {
    victimX=interpolate(o.originalVictim,o.target,time,0,b.castWindup);
    const lift=clamp((time-b.lift)/(b.lifted-b.lift),0,1);
    victimY=-o.liftDistance*(.5-.5*Math.cos(Math.PI*lift));
    eraseProgress=clamp((time-b.dissolve)/(b.erased-b.dissolve),0,1);
  } else if(definition.mechanism==='sign') {
    if(time>=b.retreat)winnerX=easedTravel(o.near,o.operatorX,time,b.retreat,b.operate);
    victimX=interpolate(o.originalVictim,o.target,time,0,b.noticeWindup);
  } else if(definition.mechanism==='coffin') {
    if(Number.isFinite(o.nailRootX)&&time>=b.nailApproach)winnerX=interpolate(o.near,o.nailRootX,time,b.nailApproach,b.nailRaise);
    if(time<b.entry)victimX=interpolate(o.originalVictim,o.victim,time,0,b.bootWindup);
    else if(time<b.landed)victimX=interpolate(o.victim,o.target-endOffset(victim,'thrown'),time,b.entry,b.landed);
    else victimX=o.target-endOffset(victim,'knockdown');
  } else if(definition.mechanism==='waste-chute') {
    if(time<b.load)victimX=interpolate(o.originalVictim,o.victim,time,0,b.fold);
    else victimX=interpolate(o.victim,o.target,time,b.load,b.captured);
    const flight=deletionFlight(match,time);
    victimY=flight?flight.endY*flight.progress-flight.height*Math.sin(Math.PI*flight.progress):
      time>=b.captured&&time<b.lidClose?-75:0;
  } else {
    const corpseRoot=o.tripX-endOffset(victim,'knockdown');
    if(time<b.fall)victimX=interpolate(o.originalVictim,o.victim,time,0,b.windup);
    else if(time<b.prone)victimX=interpolate(o.victim,corpseRoot,time,b.fall,b.prone);
    else victimX=interpolate(o.tripX,o.target,time,b.dragStart,b.captured)-endOffset(victim,'knockdown');
  }
  return {winnerX,victimX,victimY:victimY===0?0:victimY,rotation,eraseProgress};
}

function approvedDeletionView(match,index,time) {
  const f=match.fighters[index],winner=match.fighters[match.winner],definition=deletionDefinition(winner.id);
  const pose=deletionPose(index===match.winner?'attacker':'victim',time,winner.id,f._clips,f.height);
  const position=approvedDeletionPositions(match,time),b=definition.beats;
  const hiddenAt={hug:Infinity,rip:Infinity,'litter-box':b.buried,drive:b.captured,sign:b.landed,wheel:Infinity,stamp:b.stampStrike,jaws:b.sealed,
    'speaker-stack':b.burial,truss:Infinity,positivity:Infinity,wand:b.erased}[definition.mechanism]??b.lidClose;
  return {...pose,x:index===match.winner?position.winnerX:position.victimX,y:index===match.winner?0:position.victimY,
    facing:approvedDeletionFacing(match,index,time),opacity:index===match.winner||time<hiddenAt?1:0,
    ...(definition.mechanism==='rip'&&index!==match.winner&&splitBodyState(time,definition)?{splitBody:splitBodyState(time,definition)}:{}),
    ...(definition.mechanism==='litter-box'&&index!==match.winner?{litterCaptured:time>=b.boxSet}:{}),
    ...(definition.mechanism==='wheel'&&index!==match.winner?{rotation:position.rotation,rotationPivot:'torso'}:{}),
    ...(definition.mechanism==='wand'&&index!==match.winner?{eraseProgress:position.eraseProgress}:{}),
    ...(index!==match.winner&&deletionFlight(match,time)?{deletionFlight:deletionFlight(match,time),airborne:true}:{}),
    ...(definition.mechanism==='drive'&&index!==match.winner&&time>=b.fall&&time<b.prone?
      {deletionTrip:{progress:clamp((time-b.fall)/(b.prone-b.fall),0,1),direction:match._deletionOrigin.dragDirection}}:{}),
  };
}

function approvedDeletionFacing(match,index,time) {
  const o=match._deletionOrigin,definition=deletionDefinition(match.fighters[match.winner].id);
  if(index!==match.winner)return o.victimFacing??face(-o.direction);
  if(definition.mechanism==='litter-box'&&time>=definition.beats.retreat&&time<definition.beats.present)return face(-o.direction);
  if(definition.mechanism==='coffin'&&Number.isFinite(o.nailRootX)&&time>=definition.beats.nailApproach) {
    if(time<definition.beats.nailRaise)return face(sign(o.nailRootX-o.near));
    return o.nailPoseFacing??o.nailFacing??face(o.direction);
  }
  if(['wheel','stamp','jaws','speaker-stack','truss','positivity','wand'].includes(definition.mechanism)) {
    const b=definition.beats;
    if(time<b.shove)return face(sign(o.near-o.winner));
    if(definition.mechanism==='wheel'&&time>=b.retreat&&time<b.aim)return face(sign(o.operatorX-o.near));
    if(definition.mechanism==='speaker-stack'&&time>=b.landed&&time<b.stackReach)return face(sign(o.operatorX-o.near));
    return face(o.direction);
  }
  if(definition.mechanism==='sign') {
    const b=definition.beats;
    if(time<b.noticeWindup)return face(sign(o.near-o.winner));
    if(time>=b.retreat&&time<b.operate)return face(sign(o.operatorX-o.near));
    return face(o.direction);
  }
  // The disc is launched toward the original opponent. Once the victim is
  // inside the drive, the eject and presentation face that actual endpoint.
  if(definition.mechanism==='drive'&&time>=definition.beats.ejectWindup) {
    return face(sign(o.target-approvedDeletionPositions(match,time).winnerX));
  }
  return face(o.direction);
}

function updateApprovedDeletion(match,previous,time) {
  const winner=match.fighters[match.winner],target=1-match.winner;
  const definition=deletionDefinition(winner.id),b=definition.beats,o=match._deletionOrigin;
  match.fighters[target].facing=o.victimFacing??face(-o.direction);
  const position=approvedDeletionPositions(match,time);
  winner.x=position.winnerX;winner.facing=approvedDeletionFacing(match,match.winner,time);
  match.fighters[target].x=position.victimX;
  const cue=(at,name,site='torso',type='deletion-cue',extra={})=>{
    if(!Number.isFinite(at)||previous>=at||time<at)return;
    const contactView=approvedDeletionView(match,target,at),sourceView=approvedDeletionView(match,match.winner,at);
    emit(match,type,{cue:name,at,attacker:match.winner,target,site,direction:o.direction,strength:.7,
      x:contactView.x,y:WORLD.floor-match.fighters[target].height*(site==='head'?.85:site==='legs'?.15:.57),
      contact:{fighterIndex:target,site,offset:[0,0],space:'pose'},contactView,
      sourceContact:{fighterIndex:match.winner,site:'grip',offset:[0,0],space:'pose'},sourceView,...extra});
  };
  if(definition.mechanism==='hug') {
    cue(b.hugContact,'hug-contact','torso','deletion-cue',{peaceful:true});cue(b.release,'hug-release','torso','deletion-cue',{peaceful:true});cue(b.slump,'peaceful-slump','legs','deletion-cue',{peaceful:true});
    cue(b.present,'stay-kind','torso','character-line',{fighterId:'doofnoobler',line:definition.line,peaceful:true});
  } else if(definition.mechanism==='litter-box') {
    cue(b.boxSet,'litter-box-set','legs');[b.scratch1,b.scratch2].forEach((at,index)=>cue(at,'claw-cut',match.fighters[target].height<=260?'torso':'head','deletion-impact',{strength:1.05,damageKind:'cut',scratch:index+1}));
    cue(b.kick,'litter-kick','legs');cue(b.litterImpact,'litter-burst','legs','deletion-cue');cue(b.buried,'litter-buried','legs','deletion-cue');
  } else if(definition.mechanism==='rip') {
    cue(b.gripContact,'oak-grip');cue(b.strain,'oak-strain');cue(b.rip,'oak-rip','torso','deletion-impact',{strength:3.2,damageKind:'cut',aftermath:'body-halves'});cue(b.settled,'oak-halves-land','legs','deletion-cue');
  } else if(definition.mechanism==='wheel') {
    cue(b.bindContact,'wheel-bind');cue(b.captured,'wheel-captured');cue(b.spin,'wheel-spin');
    cue(b.release,'arrow-release');cue(b.arrowHit,'arrow-hit','torso','deletion-impact',{strength:2.8});
    cue(b.wheelBreak,'wheel-break','torso','deletion-cue',{direction:o.direction});
    cue(b.landed,'wheel-land','legs','land');
  } else if(definition.mechanism==='stamp') {
    cue(b.gutContact,'appeal-gut');cue(b.sweepContact,'appeal-sweep','legs');
    cue(b.landed,'appeal-land','legs','land');cue(b.stampRaise,'ban-stamp-raise');
    cue(b.stampStrike,'ban-stamp','torso','deletion-impact',{strength:3.4});
    cue(b.lift,'ban-stamp-lift');cue(b.reveal,'ban-verdict');
  } else if(definition.mechanism==='jaws') {
    cue(b.gripContact,'chrome-grip');cue(b.captured,'chrome-load');cue(b.close,'jaws-close');
    cue(b.squeeze,'chrome-squeeze','torso','deletion-impact',{strength:1.4});
    cue(b.sealed,'chrome-seal','torso','deletion-impact',{strength:3.2});
    cue(b.reopen,'jaws-reopen');cue(b.cube,'cube-reveal');
  } else if(definition.mechanism==='speaker-stack') {
    cue(b.kickContact,'speaker-boot');cue(b.landed,'speaker-land','legs','land');
    cue(b.stackReach,'speaker-grip');cue(b.push,'speaker-push');cue(b.topple,'speaker-topple');
    cue(b.burial,'speaker-burial','torso','deletion-impact',{strength:3.4});
  } else if(definition.mechanism==='truss') {
    cue(b.bind,'mic-tether-bind');cue(b.hoist,'mic-tether-hoist');
    cue(b.trussHit,'truss-hit','head','deletion-impact',{strength:2.2});
    cue(b.slamPull,'mic-tether-yank');cue(b.floorSlam,'encore-floor-slam','torso','deletion-impact',{strength:3.4});
    cue(b.micDrop,'mic-drop');
  } else if(definition.mechanism==='positivity') {
    cue(b.peacePulse,'peace-pulse');cue(b.loveCharge,'love-charge');
    cue(b.positivitySurge,'heart-burst','torso','deletion-impact',{strength:3.3});
    cue(b.landed,'positivity-land','legs','land');
  } else if(definition.mechanism==='wand') {
    cue(b.bind,'wand-bind');cue(b.lift,'wand-lift');cue(b.channel,'blue-channel');
    cue(b.dissolve,'blue-dissolve','legs');cue(b.erased,'blue-erased','head');
  } else if(definition.mechanism==='sign') {
    cue(b.noticePin,'notice-pin');
    cue(b.signRelease,'rig-release');
    cue(b.signImpact,'sign-strike','head','deletion-impact',{strength:3.2});
    cue(b.landed,'sign-landed','legs');
  } else if(definition.mechanism==='coffin') {
    cue(b.bootContact,'coffin-boot');
    cue(b.entry,'coffin-entry','torso','throw');
    cue(b.landed,'coffin-land','legs','land');
    cue(b.lidClose,'coffin-lid-close');
    b.latchTimes.forEach((at,index)=>cue(at,'coffin-latch','torso','deletion-cue',{latch:index+1}));
    cue(b.nailRaise,'nail-raise');
    cue(b.nailStrike,'nail-strike','torso','deletion-impact',{strength:3.2});
  } else if(definition.mechanism==='waste-chute') {
    cue(b.gutContact,'garbage-gut');cue(b.gripContact,'garbage-grab');
    cue(b.folded,'garbage-fold');cue(b.load,'garbage-load','torso','throw',{strength:1.4});
    cue(b.captured,'garbage-captured');cue(b.lidClose,'chute-lid-close');
    cue(b.hopOn,'chute-hop-on','legs');
    cue(b.stamp,'chute-stamp','torso','deletion-impact',{strength:3.2});
    cue(b.hopOff,'chute-hop-off','legs');
  } else {
    cue(b.release,'disc-release');
    cue(b.upperCut,'disc-upper-cut','head','deletion-impact',{strength:1.8});
    cue(b.bodyCut,'disc-body-cut','torso','deletion-impact',{strength:1.8});
    cue(b.tapeCast,'tape-cast','torso');cue(b.ankleSnare,'tape-snare','torso');
    cue(b.prone,'tape-tension','torso','deletion-cue',{direction:o.dragDirection});
    cue(b.dragStart,'drag-start','torso','deletion-cue',{direction:o.dragDirection});
    cue(b.captured,'drive-entry','legs','deletion-cue',{direction:o.dragDirection});
    cue(b.bladeCut,'drive-blade-cut','torso','deletion-impact',{strength:3.2});
    cue(b.eject,'drive-eject','legs');
  }
  cue(b.signalCut,definition.id+'-signal-cut');
  if(definition.mechanism==='sign')cue(b.closedStamp,'closed-stamp');
  if(definition.mechanism==='positivity')cue(b.peace,'peace-present');
}

function updateDeletion(match, dt) {
  const previous=match.deletionElapsed;
  match.deletionElapsed+=dt;
  const t=match.deletionElapsed,o=match._deletionOrigin;
  const winner=match.fighters[match.winner],victim=match.fighters[1-match.winner];
  const definition=deletionDefinition(winner.id),b=definition.beats;
  const cue=(at,type,extra={})=>{
    if(previous<at&&t>=at)emit(match,type,{x:o.target,y:400,direction:o.direction,strength:2.4,...extra});
  };
  if(isDistinctDeletion(definition))updateApprovedDeletion(match,previous,t);
  else {
  if(definition.mechanism==='crt') {
    const positions=broadcastCutPositions(match,t);winner.x=positions.winnerX;victim.x=positions.victimX;
    victim.facing=o.victimFacing;
  } else {
    const approach=clamp(t/b.shove,0,1);winner.x=o.winner+(o.near-o.winner)*approach;
    if(t<b.drive)victim.x=o.originalVictim+(o.victim-o.originalVictim)*approach;
    else victim.x=o.victim+(o.target-o.victim)*clamp((t-b.drive)/(b.captured-b.drive),0,1);
  }
  cue(b.contact,'hit',{x:o.victim,y:WORLD.floor-victim.height*.6,action:'shove',attacker:match.winner,target:1-match.winner});
  cue(b.drive,'throw',{x:o.victim,y:450});
  cue(b.captured,'land',{x:o.target,y:530});
  if(definition.mechanism==='crt') {
    cue(b.glassImpact,'glass-impact',{y:365,attacker:match.winner,target:1-match.winner});
    cue(b.glassBreak,'glass-break',{y:365,attacker:match.winner,target:1-match.winner});
    cue(b.pressure,'deletion-impact',{cue:'pressure',strength:1.5});
    cue(b.eyePop,'eye-pop',{cue:'eye-pop',y:390,strength:1.1});
    cue(b.crush,'deletion-impact',{cue:'crt-crush',strength:3.2});
    cue(b.stomp+350,'deletion-impact',{cue:'last-stomp',strength:2.8});
    cue(b.signalCut,'deletion-impact',{cue:'signal-cut',strength:3.8});
  } else {
    const impactCue={coffin:'nail-strike',compactor:'compactor-crush',winch:'cable-snap',drive:'disc-cut'}[definition.mechanism];
    cue(b.pressure,'deletion-impact',{cue:definition.mechanism+'-pressure',strength:1.5});
    cue(b.impact,'deletion-impact',{cue:impactCue,strength:3.2});
    cue(b.final,'deletion-impact',{cue:definition.id+'-final',strength:2.8});
    cue(b.signalCut,'deletion-impact',{cue:definition.id+'-signal-cut',strength:3.8});
  }
  }
  if(t>=definition.duration) {
    match.phase='over';match.phaseTime=0;
    match.status=(definition.peaceful?'PEACEFUL KO — ':'DELETION — ')+winner.name.toUpperCase()+' WINS';
    if(!isDistinctDeletion(definition))winner.x=o.near;
    setAction(winner,'idle');
    victim._deleted=true;victim._ko=true;setAction(victim,'knockdown');victim.actionTime=duration(victim);
    if(isDistinctDeletion(definition)) {winner._jump=null;victim._jump=null;}
    emit(match,'deletion',{cue:'complete',name:match.deletionName,x:o.target,y:400,direction:o.direction,strength:0});
  }
}

function startTravel(f, distancePixels) {
  const authoredOffset = f.action === 'thrown' ? endOffset(f, 'thrown') : 0;
  const direction = (f.action==='thrown' ? f._throwDirection : f._fallDirection)
    || (f.facing === 'left' ? 1 : -1);
  const desiredEnd=f.x+direction*distancePixels,bodyEnd=desiredEnd+authoredOffset;
  const side=bodyEnd<WORLD.margin?'left':bodyEnd>rightEdge(f)?'right':null;
  f._travel={start:f.x,end:limitX(f,bodyEnd)-authoredOffset,wallIntent:side?{side,attacker:f._lastAttacker,strength:f._lastHitStrength??1.5,damageId:f._lastDamageId}:null};
}

function updateAction(match, index, dt) {
  const f = match.fighters[index];
  f.actionTime += dt;
  if(f._jump) {
    const moveTime=Math.max(0,Math.min(dt,f._jump.duration-f._jump.elapsed));
    f.x=limitX(f,f.x+f._jump.move*f._style.jumpSpeed*moveTime/1000);
    f._jump.elapsed=Math.min(f._jump.duration,f._jump.elapsed+dt);
    // Landing ends the air action first. A clipped late attack can never make a
    // phantom contact after the fighter has returned to the ground.
    if(f._jump.elapsed>=f._jump.duration) {
      setAction(f,'idle');faceOpponent(match,index);
      emit(match,'land',{target:index,x:f.x,y:WORLD.floor,direction:f.facing==='right'?1:-1,strength:.35,jump:true});
      return;
    }
  }
  if (f._travel) {
    const progress = clamp(f.actionTime / duration(f), 0, 1);
    f.x = f._travel.start + (f._travel.end - f._travel.start) * progress;
    if(progress>=1&&f._travel.wallIntent){f._wallIntent=f._travel.wallIntent;f._travel.wallIntent=null;}
  }
  if(f.action==='pickup'&&f._pickup) {
    const progress=clamp(f.actionTime/f._pickup.alignMs,0,1);
    const eased=progress*progress*(3-2*progress);
    f.x=f._pickup.startX+(f._pickup.targetX-f._pickup.startX)*eased;
  }
  if(f.action==='pickup'&&f._stageAction){
    const action=f._stageAction,p=easedProgress(f.actionTime,0,action.alignMs);f.x=action.startX+(action.targetX-action.startX)*p;
    if(!action.committed&&f.actionTime>=contactTime(f))commitStageInteraction(match,index);
  }
  if(f.action==='pickup'&&f._pickup&&!f._pickup.contactDone&&f.actionTime>=contactTime(f))
    pickupContact(match,index);
  // A kick/KO fall also needs a single stage impact; thrown bodies already emit
  // theirs while entering the final floor pose below. No gameplay timing moves.
  if(f.action==='knockdown'&&!f._deleted&&!f._floorImpactDone&&f.actionTime>=duration(f)*.72) {
    f._floorImpactDone=true;
    emit(match,'land',{x:f.x,y:WORLD.floor-12,direction:f._fallDirection||
      (f.facing==='left'?1:-1),strength:1.2,target:index,...floorDamage(f)});
  }
  if (ATTACKS.has(f.action) && !f._contactDone) {
    const contactAt = contactTime(f);
    if(f.actionTime>=contactAt&&(f.action==='grab'||f._weaponAction||f.actionTime<=activeEndTime(f)))attackContact(match,index);
    if(!f._contactDone&&f.actionTime>=activeEndTime(f))finishMiss(match,index);
    if (match.phase !== 'fight') return;
  }
  if(f._buffer) {
    if(f._buffer.expires<=match.combatTime)f._buffer=null;
    else if(f._buffer.kind!=='recovery'&&canCancel(f,sequenceFinish(f,f._buffer.action,f._buffer.at)??f._buffer.action,
      !!sequenceFinish(f,f._buffer.action,f._buffer.at))) {
      const buffer=f._buffer;f._buffer=null;
      performAction(match,index,buffer.action,buffer.inputSnapshot,buffer.at);
    }
  }
  if (NEUTRAL.has(f.action) || f.actionTime < duration(f)) return;
  const recovery=f._buffer?.kind==='recovery'?f._buffer:null;
  if(AIR_ATTACKS.has(f.action)&&f._jump) {
    const elapsed=f._jump.elapsed;
    setAction(f,'jump',null,0,true);f.actionTime=elapsed;
  } else if (f.action === 'grabbed') {
    setAction(f, 'thrown', 'knockdown');
    startTravel(f, f._throwDistance??145);
    emit(match, 'throw', { x: f.x, y: WORLD.floor - f.height * 0.5, direction: f._throwDirection, strength: 1.8, attacker: f._throwAttacker, target: index });
  } else if (f.action === 'thrown') {
    // The last thrown pose is already on the floor. Start at the final fall pose
    // so a landed body never rises and falls a second time before getting up.
    f.x += endOffset(f, 'thrown') - endOffset(f, 'knockdown');
    setAction(f, 'knockdown', 'getup', Math.max(0, f._clips.knockdown.duration - 250));
    f._floorImpactDone=true;
    emit(match, 'land', { x: f.x, y: WORLD.floor - 12, direction: f._throwDirection, strength: 1.6,target:index,...floorDamage(f) });
  } else if (f.action === 'knockdown') {
    if (f._ko) f.actionTime = duration(f);
    else setAction(f, 'getup');
  } else if (f._next === 'knockdown') {
    setAction(f, 'knockdown', 'getup');
    startTravel(f, 40);
  } else {
    setAction(f, CROUCH_ATTACKS.has(f.action)&&f._control.crouch?'crouch':'idle');
    faceOpponent(match, index);
    if(recovery)performAction(match,index,recovery.action,recovery.inputSnapshot,recovery.at);
  }
}

function cpuInput(match, dt) {
  const cpu = match.fighters[1], player = match.fighters[0];
  match._cpuDecision -= dt;
  if (match._cpuDecision > 0) return match._cpuControl;
  match._cpuDecision = 230 + random(match) * 170;
  const gap = distance(cpu, player), toPlayer = sign(player.x - cpu.x);
  const roll = random(match);
  match._cpuControl = control();
  if(cpu._jump) {
    if(cpu.action==='jump'&&!cpu._jump.attackUsed&&gap<=230&&roll>.2) {
      performAction(match,1,roll<.6?'punch':'kick',match._cpuControl);
    }
    return match._cpuControl;
  }
  const history=cpu._sequence,preferred=cpu._style.preferredSequence;
  const continuation=history.length>0&&history.length<3
    &&history.every((entry,index)=>entry.action===preferred[index]&&entry.connected)
    &&match.combatTime-history.at(-1).at<=600?preferred[history.length]:null;
  if(continuation&&!cpu.weapon&&cpu._chainCount<2&&roll>.15&&gap<=230
    &&performAction(match,1,continuation,match._cpuControl))return match._cpuControl;
  if(NEUTRAL.has(cpu.action)) {
    const pickup=!cpu.weapon&&match.stagePickups[0];
    if(pickup&&gap>150&&roll<.65) {
      if(Math.abs(cpu.x-pickup.x)<=WEAPON_RULES.pickupReach)performAction(match,1,'grab',match._cpuControl);
      else match._cpuControl.move=sign(pickup.x-cpu.x);
      return match._cpuControl;
    }
    if(cpu.weapon&&gap>175) {
      if(roll>.8){performAction(match,1,'weapon-throw',match._cpuControl);return match._cpuControl;}
      if(cpu.weapon.charges>0&&WEAPON_TYPES[cpu.weapon.type].use==='ranged'&&roll<.45) {
        performAction(match,1,'punch',match._cpuControl);return match._cpuControl;
      }
    }
  }
  if (gap > 175) {
    match._cpuControl.move = toPlayer * (gap > 225 ? 1 : 0.65);
    if(gap<360&&roll<.1&&NEUTRAL.has(cpu.action)) {
      cpu._control=match._cpuControl;
      performAction(match,1,'jump');
    }
  }
  else if (gap < 120 && roll < 0.14) match._cpuControl.move = -toPlayer;
  else if (ATTACKS.has(player.action) && roll < 0.4) {
    match._cpuControl.block = true;
    // React to visible attacks with an imperfect guard, never to held inputs.
    match._cpuControl.crouch = random(match) < .5;
  } else if (NEUTRAL.has(cpu.action) && roll > 0.22) {
    const attackRoll=random(match);
    let action=gap<135&&attackRoll>.97?'grab':cpu._style.preferredMoves[
      Math.min(cpu._style.preferredMoves.length-1,Math.floor(attackRoll*cpu._style.preferredMoves.length))];
    if(action==='grab'&&gap>130*cpu._style.reach.throw)action='low-punch';
    match._cpuControl.crouch=action!=='grab'&&!CHORD_ATTACKS.has(action)&&random(match)<.2;
    cpu._control=match._cpuControl;
    performAction(match, 1, action);
  }
  return match._cpuControl;
}

function applyNeutral(match, index, input, dt) {
  const f = match.fighters[index];
  f._control = input;
  if (!NEUTRAL.has(f.action)) return;
  faceOpponent(match, index);
  const next = input.block ? 'block' : input.crouch ? 'crouch' : input.move ? 'walk' : 'idle';
  if (next !== f.action) setAction(f, next);
  if (next === 'walk') {
    f.x=limitX(f,f.x+input.move*f._style.moveSpeed*dt/1000);
  }
}

function separate(match) {
  const [a, b] = match.fighters;
  if(a._jump||b._jump||airOffset(a)<-40||airOffset(b)<-40)return;
  if (!NEUTRAL.has(a.action) && !NEUTRAL.has(b.action)) return;
  const gap = Math.abs(b.x - a.x);
  if (gap >= WORLD.separation) return;
  const order = b.x >= a.x ? 1 : -1;
  const overlap = WORLD.separation - gap;
  const aCanMove = NEUTRAL.has(a.action), bCanMove = NEUTRAL.has(b.action);
  const aShare = aCanMove && bCanMove ? 0.5 : aCanMove ? 1 : 0;
  a.x=limitX(a,a.x-order*overlap*aShare);
  b.x=limitX(b,b.x+order*overlap*(1-aShare));
}

function startStageInteraction(match,index) {
  const state=match.stage,f=match.fighters[index];if(!state||!stageInteractionReady(state,f.x))return false;
  const spec=stageById(state.id),dir=sign(spec.interaction.x-f.x);f.facing=face(dir);setAction(f,'pickup');
  const origin=f._clips.pickup.pickupOrigins?.[f.facing];
  const targetX=limitX(f,spec.interaction.x-(Number.isFinite(origin?.x)?origin.x:dir*60));
  f._stageAction={stageId:state.id,startX:f.x,targetX,alignMs:Math.min(230,contactTime(f)),committed:false};
  state.interaction={actor:index,at:state.fightClock};
  emit(match,'stage-interact',{attacker:index,stageId:state.id,x:spec.interaction.x,y:spec.interaction.y,action:'stage-interact'});return true;
}
function commitStageInteraction(match,index) {
  const f=match.fighters[index],state=match.stage,action=f._stageAction;if(!action||state.interaction?.actor!==index||action.stageId!==state.id)return;
  action.committed=true;const activation=startStageWarning(state,index);if(!activation)return;
  const spec=stageById(state.id);emit(match,'stage-warning',{attacker:index,stageId:state.id,name:spec.hazard.name,zone:spec.hazard.zone,x:(spec.hazard.zone.left+spec.hazard.zone.right)/2,y:spec.hazard.zone.top,serial:activation.serial});
}
function processStageEvents(match,events) {
  const spec=stageById(match.stage.id),zone=spec.hazard.zone;
  for(const stageEvent of events){
    const activation=stageEvent.activation;emit(match,stageEvent.type,{attacker:activation.actor,stageId:spec.id,name:spec.hazard.name,zone,x:(zone.left+zone.right)/2,y:(zone.top+zone.bottom)/2,serial:activation.serial,strength:1.6});
    if(stageEvent.type!=='stage-impact')continue;
    for(let index=0;index<2;index++){
      const f=match.fighters[index];if(f.hp<=0)continue;
      const overlaps=hurtRegions(f).map(body=>({body,width:Math.min(body.right,zone.right)-Math.max(body.left,zone.left),height:Math.min(body.bottom,zone.bottom)-Math.max(body.top,zone.top)})).filter(hit=>hit.width>0&&hit.height>0).sort((a,b)=>b.width*b.height-a.width*a.height);
      const region=overlaps[0]?.body;if(!region)continue;
      const x=(Math.max(region.left,zone.left)+Math.min(region.right,zone.right))/2,y=(Math.max(region.top,zone.top)+Math.min(region.bottom,zone.bottom))/2;
      const event={attacker:activation.actor,target:index,stageId:spec.id,serial:activation.serial,action:'stage-'+spec.hazard.type,site:region.site,x,y,direction:sign(f.x-(zone.left+zone.right)/2),strength:1.6,level:'mid',heightRatio:clamp((WORLD.floor+airOffset(f)-y)/f.height,.12,.93)};
      const damage=Math.min(f.hp,spec.hazard.damage);f.hp-=damage;const injury=recordDamage(match,index,damage,event,null,spec.hazard.kind);
      const reaction=['knockdown','getup'].includes(f.action)?'knockdown':'low';
      setAction(f,reaction,null,f._clips[reaction].reactionStartMs||0);f._fallDirection=event.direction;
      match.hitstop=Math.max(match.hitstop,65);emit(match,'stage-hit',{...event,...injury,damage});emit(match,'hit',{...event,...injury,damage,combo:1});
    }
    const dead=match.fighters.map((f,index)=>f.hp<=0?index:null).filter(index=>index!==null);
    if(dead.length===1){openFinish(match,1-dead[0]);return;}
    if(dead.length===2){match.phase='over';match.phaseTime=0;match.winner=null;match.status='STAGE CLASH — DRAW';match.projectiles=[];for(const f of match.fighters){setAction(f,'knockdown');f._ko=true;}emit(match,'ko',{winner:null,stageId:spec.id,x:(zone.left+zone.right)/2,y:zone.top,direction:1});return;}
  }
}
function processStageWalls(match) {
  for(let index=0;index<2;index++){
    const f=match.fighters[index],intent=f._wallIntent;f._wallIntent=null;
    if(!intent||f.hp<=0||f._wallImpactUntil>match.combatTime||intent.damageId===f._lastWallDamageId)continue;
    f._wallImpactUntil=match.combatTime+650;f._lastWallDamageId=intent.damageId;
    const wall=damageStageWall(match.stage,intent.side,intent.strength),damage=Math.min(2,f.hp);
    const event={attacker:Number.isInteger(intent.attacker)?intent.attacker:1-index,target:index,stageId:match.stage.id,side:intent.side,x:intent.side==='left'?WORLD.margin:match.stage.width-WORLD.margin,y:WORLD.floor-f.height*.55,direction:intent.side==='left'?1:-1,strength:intent.strength,action:'wall-slam',site:'torso',heightRatio:.55,secondary:true};
    f.hp-=damage;const injury=recordDamage(match,index,damage,event);match.hitstop=Math.max(match.hitstop,35);
    emit(match,'wall-impact',{...event,...injury,damage,wallDamage:wall.damage,weak:!!stageById(match.stage.id).walls[intent.side].target});emit(match,'hit',{...event,...injury,damage,combo:1});
    if(f.hp<=0){openFinish(match,1-index);return;}
    if(wall.broke)emit(match,'wall-break',{...event,toStage:wall.target});
    if(wall.target){
      const transition=enterStage(match.stage,wall.target,intent.side),ordered=[...match.fighters].sort((a,b)=>a.x-b.x),base=intent.side==='right'?250:match.stage.width-430;
      ordered.forEach((fighter,slot)=>{setAction(fighter,'idle');fighter.x=base+slot*180;fighter._worldWidth=match.stage.width;fighter._wallImpactUntil=match.combatTime+650;});
      match.projectiles=[];match.stagePickups=[];for(let seat=0;seat<2;seat++)faceOpponent(match,seat);
      emit(match,'stage-transition',{...transition,attacker:event.attacker,target:index,x:match.fighters[index].x,y:WORLD.floor});return;
    }
  }
}

function timeout(match) {
  match.projectiles=[];
  const [a, b] = match.fighters;
  match.winner = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
  match.phase = 'over';
  match.phaseTime = 0;
  if (match.winner === null) {
    match.status = 'TIME UP — DRAW';
    match.fighters.forEach(f => setAction(f, 'idle'));
  } else {
    collapse(match);
    match.status = `TIME UP — ${match.fighters[match.winner].name.toUpperCase()} WINS`;
  }
  emit(match, 'ko', { winner: match.winner, timeout: true, x: match.winner == null ? 640 : match.fighters[1 - match.winner].x, y: WORLD.floor - 150, direction: 1 });
}

function step(match, dt, inputs) {
  if (match.hitstop > 0) {
    const used = Math.min(dt, match.hitstop);
    match.hitstop -= used;
    dt -= used;
    if (dt <= 0) return;
  }
  const stageEvents=match.stage?advanceStageState(match.stage,dt,{fighting:match.phase==='fight'}):[];
  if(match.stage?.interaction){const actor=match.fighters[match.stage.interaction.actor];if(actor.action!=='pickup'||!actor._stageAction)match.stage.interaction=null;}
  match.phaseTime += dt;
  if (match.phase === 'ready') {
    match.fighters.forEach(f => { f.actionTime += dt; });
    return;
  }
  if (match.phase === 'countdown') {
    match.status = match.phaseTime > 950 ? 'FIGHT!' : 'ROUND 1';
    match.fighters.forEach(f => { f.actionTime += dt; });
    if (match.phaseTime >= 1500) {
      match.phase = 'fight'; match.phaseTime = 0; match.status = 'SYSTEM CLASH';
      emit(match, 'round-start', { x: 640, y: 270, direction: 1 });
    }
    return;
  }
  if (match.phase === 'deletion') { updateDeletion(match, dt); return; }
  if (match.phase === 'finish') {
    match.finishRemaining = Math.max(0, match.finishRemaining - dt);
    const winner = match.fighters[match.winner];
    const input = inputs[match.winner];
    applyNeutral(match, match.winner, { ...input, crouch: false, block: false }, dt);
    winner.actionTime += dt;
    if(match.mode==='cpu'&&match.winner===1&&match.finisherAvailable&&match.phaseTime>=1500)startDeletion(match);
    else if (match.finishRemaining <= 0) collapse(match);
    return;
  }
  if (match.phase === 'over') {
    for (let i = 0; i < 2; i++) {
      const f = match.fighters[i];
      if (f._ko && f.action === 'knockdown') updateAction(match, i, dt);
      else if (!f._deleted) f.actionTime += dt;
    }
    return;
  }
  if(match.mode!=='weapons')match.roundRemaining = Math.max(0, match.roundRemaining - dt);
  match.combatTime += dt;
  if (match.mode!=='weapons'&&match.roundRemaining <= 0) { timeout(match); return; }
  updateWeaponSpawn(match);
  const controls = [inputs[0], match.mode === 'cpu' ? cpuInput(match, dt) : match.mode==='weapons'?control():inputs[1]];
  for (let i = 0; i < 2; i++) applyNeutral(match, i, controls[i], dt);
  separate(match);
  for (let i = 0; i < 2; i++) {
    updateAction(match, i, dt);
    if (match.phase !== 'fight') break;
  }
  updateProjectiles(match,dt);
  if(match.phase==='fight'){processStageEvents(match,stageEvents);if(match.phase==='fight')processStageWalls(match);}
}

export function advanceMatch(match, dtMs, controls = []) {
  if (!match || match.paused || !Number.isFinite(dtMs) || dtMs <= 0) return match;
  const inputs = [control(controls[0]), control(controls[1])];
  // Fixed subdivisions preserve contact edges, CPU behavior and recovery order
  // even when a browser drops a frame. Long background gaps cannot rush a round.
  let remaining = Math.min(dtMs, 1000);
  while (remaining > 0) {
    const dt = Math.min(remaining, 10);
    step(match, dt, inputs);
    remaining -= dt;
  }
  return match;
}

export function getFighterView(match, index) {
  const f = match.fighters[index];
  const playbackRate=f.action==='grab'?1/f._style.tempo.throw:f._clips[f.action]?.playbackRate??1;
  const nativeElapsed=(f.actionTime+f._offset)*playbackRate;
  const view = { clip: f.action === 'grab' ? 'punch' : f.action, elapsed:nativeElapsed,
    nativeElapsed,combatElapsed:f.actionTime+f._offset,playbackRate,
    x: f.x, y: airOffset(f), facing: f.facing, opacity: f._deleted ? 0 : 1 };
  Object.assign(view,{id:f.id,height:f.height,combatTime:match.combatTime,weapon:f.weapon,damageTaken:f.damageTaken,damageTier:f.damageTier,
    damageSites:f.damageSites,damageMarks:f.damageMarks,embeddedWeapons:f.embeddedWeapons,
    pickupAction:f._pickup?{...f._pickup,elapsed:f.actionTime,contactMs:contactTime(f)}:null,
    weaponAction:f._weaponAction?{...f._weaponAction,elapsed:f.actionTime,contactMs:contactTime(f)}:null,
    airborne:!!f._jump,jumpElapsed:f._jump?.elapsed??null,jumpDuration:f._jump?.duration??null});
  if (match.phase === 'finish' && index !== match.winner) {
    view.clip = 'high'; view.elapsed = 210;
  }
  if(match.phase==='deletion') {
    const winner=match.fighters[match.winner],definition=deletionDefinition(winner.id);
    const pose=deletionPose(index===match.winner?'attacker':'victim',match.deletionElapsed,winner.id,f._clips,f.height);
    Object.assign(view,pose);
    if(isDistinctDeletion(definition))Object.assign(view,approvedDeletionView(match,index,match.deletionElapsed));
    else if(index!==match.winner) {
      const b=definition.beats;
      if(definition.mechanism==='crt') {
        const positions=broadcastCutPositions(match,match.deletionElapsed),flight=deletionFlight(match,match.deletionElapsed);
        view.x=positions.victimX;view.y=positions.victimY;view.facing=match._deletionOrigin.victimFacing;
        if(flight){view.deletionFlight=flight;view.airborne=true;}
        view.opacity=match.deletionElapsed>=b.crush?0:1;
      } else {
        const lift=definition.mechanism==='winch'?clamp((match.deletionElapsed-b.captured)/
          (b.pressure-b.captured),0,1):0;
        view.y=lift?-80*lift:0;
        view.opacity=match.deletionElapsed>=b.impact?0:1;
      }
    }
  }

  const definition=match.winner==null?null:deletionDefinition(match.fighters[match.winner].id);
  if(match.phase==='over'&&definition?.retainFloorBody&&match.deletionElapsed>=definition.duration&&index!==match.winner)Object.assign(view,approvedDeletionView(match,index,match.deletionElapsed));
  if(match.phase==='over'&&definition&&match.deletionElapsed>=definition.duration&&index===match.winner){
    if(['positivity','jaws'].includes(definition.mechanism))Object.assign(view,deletionPose('attacker',match.deletionElapsed,f.id,f._clips));
    else {view.clip='delete-present';view.elapsed=10000;}
  }
  view.nativeElapsed=view.elapsed;
  view.poseIndex=combatPose(f,view)?.index;
  if(match.phase==='deletion'||match.phase==='finish'||view.clip.startsWith('delete-'))view.playbackRate=1;
  return view;
}

export function consumeEvents(match) {
  const events = match.events;
  match.events = [];
  return events;
}
