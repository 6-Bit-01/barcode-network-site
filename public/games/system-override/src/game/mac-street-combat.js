window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/mac-street-combat.js',
  exports: ['BARCODE.MacStreetCombat'],
  dependencies: []
});
(function(B) {
  'use strict';

  // A six-zone unsaved city chapter. The host owns input, drawing, sound and
  // its frame loop. Feed elapsed milliseconds; no rhythm judgment gates actions.
  // Input is a complete sample: {move_x, move_y} in [-1,1] and jump/strike/
  // guard/throw/run as {pressed, held}. Press edges survive until a simulation step.
  // Ordinary Strike needs a fresh edge; a held Strike only repeats the bounded
  // pummel while an enemy is held. L/Throw holds context and release commits a
  // toss, never regrabbing on one uninterrupted hold. Guard's parry is a fresh edge,
  // not a repeated pressed flag while held. y/laneY is the feet's ground plane;
  // elevation is a separate positive height, so drawing feet uses y-elevation.
  // Actual Run+Strike commits one grounded kick before an equipped weapon;
  // Counter and Jump+Strike retain priority over that running commitment.
  const C = Object.freeze({
    version:7,worldWidth:20400,zoneWidth:3400,laneMin:780,laneMax:970,
    startX:200,startLaneY:880,deskX:20100,
    stepMs:1000/120,maxDeltaMs:100,maxSubsteps:12,
    maxEnemies:3,totalEnemies:30,totalWaves:12,maxProjectiles:18,
    maxHitFx:24,maxEvents:64,waveBreakMs:1250,
    playerHp:100,zoneHeal:22,moveSpeed:260,laneSpeed:180,
    jumpSpeed:560,gravity:1500,hitHeight:62,laneReach:40,parryMs:125,counterMs:800,
    playerInvulnerableMs:720,playerHurtMs:220,comboWindowMs:360,
    throwReach:74,throwDamage:28,throwCommitMs:420,throwReleaseMs:140,throwCooldownMs:700,
    maxImpactPauseMs:60,launchGravity:1200,bodyDamage:14,bodyLaneReach:70,bodyRadius:38,
    knockdownMs:360,pickupHeal:18,pickupReach:58,advanceEntryOffset:1800,
    runTapMs:280,runMultiplier:1.65,grabMaxMs:3000,pummelMaxMs:1000,
    strength:100,propReach:85,maxPickups:48,overdriveMs:10000,barrierMs:12000,impactMs:15000,
    carryForward:59.826903630,carryElevation:121.929830769,propReleaseForward:73.907,propReleaseElevation:155.394,
    carRecoilMs:420,carRecoilX:10,carBounceHeight:20,carRecoilRotation:.025,
    tellSpacingMs:300,interruptedRearmMs:220,fixtureDischargeRange:235,fixtureDischargeLaneReach:95,
    bodySpacingPad:18,bodySpacingDepth:54,bodySpacingSpeed:260,laterApproachMultiplier:1.15,laterRecoveryMultiplier:.82
  });
  const STRIKES = Object.freeze([
    Object.freeze({kind:'jab',windupMs:90,activeMs:80,recoveryMs:155,reach:90,damage:12}),
    Object.freeze({kind:'cross',windupMs:100,activeMs:80,recoveryMs:175,reach:96,damage:14}),
    Object.freeze({kind:'finisher',windupMs:130,activeMs:105,recoveryMs:240,reach:112,damage:20})
  ]);
  const ATTACKS=Object.freeze({
    'step-strike':Object.freeze({kind:'step-strike',windupMs:110,activeMs:100,recoveryMs:210,reach:105,damage:15,rootSpeed:230}),
    'running-kick':Object.freeze({kind:'running-kick',windupMs:85,activeMs:145,recoveryMs:245,reach:132,laneReach:48,
      damage:24,rootSpeed:540,maxRootShift:125,launch:true,stunMs:500}),
    'air-kick':Object.freeze({kind:'air-kick',windupMs:60,activeMs:190,recoveryMs:180,reach:120,damage:18,hitHeight:150}),
    counter:Object.freeze({kind:'counter',windupMs:65,activeMs:105,recoveryMs:180,reach:104,damage:22,rootSpeed:100})
  });
  // Every weapon has its own contact rule, rather than eight skins for a jab.
  const WEAPONS=Object.freeze({
    pipe:Object.freeze({kind:'pipe',name:'Pipe',charges:14,windupMs:100,activeMs:95,recoveryMs:170,reach:135,laneReach:40,damage:17,propDamage:24}),
    crowbar:Object.freeze({kind:'crowbar',name:'Crowbar',charges:12,windupMs:150,activeMs:110,recoveryMs:240,reach:122,laneReach:42,damage:21,propDamage:38,shieldBreak:true,pull:45}),
    'shock-baton':Object.freeze({kind:'shock-baton',name:'Shock Baton',charges:10,windupMs:100,activeMs:100,recoveryMs:240,reach:110,laneReach:40,damage:15,propDamage:18,stunMs:900,chain:true}),
    'energy-blade':Object.freeze({kind:'energy-blade',name:'Energy Blade',charges:12,windupMs:75,activeMs:130,recoveryMs:175,reach:152,laneReach:72,damage:18,propDamage:28,shieldBreak:true}),
    'gravity-hammer':Object.freeze({kind:'gravity-hammer',name:'Gravity Hammer',charges:7,windupMs:300,activeMs:140,recoveryMs:390,reach:145,laneReach:82,damage:28,propDamage:64,launch:true,radial:true}),
    // Authored origins use each complete contact cel's crop-local shotAnchor and body scale.
    'scatter-blaster':Object.freeze({kind:'scatter-blaster',name:'Scatter Blaster',charges:8,windupMs:130,activeMs:90,recoveryMs:300,reach:430,laneReach:32,damage:9,propDamage:10,projectile:'scatter-bolt',muzzleForward:67.267772750,muzzleElevation:173.870090584}),
    'coil-rifle':Object.freeze({kind:'coil-rifle',name:'Coil Rifle',charges:7,windupMs:240,activeMs:75,recoveryMs:310,reach:780,laneReach:22,damage:25,propDamage:45,projectile:'coil-bolt',muzzleForward:88.366194752,muzzleElevation:185.569008979}),
    'plasma-disc':Object.freeze({kind:'plasma-disc',name:'Plasma Disc',charges:8,windupMs:140,activeMs:85,recoveryMs:240,reach:380,laneReach:44,damage:19,propDamage:30,projectile:'plasma-disc',muzzleForward:98.887601932,muzzleElevation:174.721652493})
  });
  const GRAB_STRENGTH=Object.freeze({chitin_scuttler:45,psion_lancer:75,bile_spitter:40,prism_guard:120,rift_stalker:65,shock_mantid:110,null_regent:180});
  const ROLES = Object.freeze({
    chitin_scuttler:Object.freeze({name:'Chitin Scuttler',bloodColor:'green',hp:42,speed:155,laneSpeed:105,distance:72,tellMs:480,activeMs:110,recoverMs:600,reach:98,damage:9,attackType:'jab',tell:'Claws drawn back'}),
    psion_lancer:Object.freeze({name:'Psion Lancer',bloodColor:'purple',hp:58,speed:106,laneSpeed:70,distance:220,tellMs:900,activeMs:420,recoverMs:920,reach:45,damage:15,chargeSpeed:650,attackType:'lunge',tell:'Spear line locked'}),
    bile_spitter:Object.freeze({name:'Bile Spitter',bloodColor:'green',hp:40,speed:96,laneSpeed:75,distance:330,tellMs:950,activeMs:140,recoverMs:1100,reach:30,damage:11,projectileSpeed:390,attackType:'bile',tell:'Throat sac swelling'}),
    prism_guard:Object.freeze({name:'Prism Guard',bloodColor:'purple',hp:72,speed:82,laneSpeed:65,distance:85,tellMs:850,activeMs:140,recoverMs:980,reach:120,damage:14,shieldReduction:.7,attackType:'shield-bash',tell:'Shield raised; counter or throw breaks it'}),
    rift_stalker:Object.freeze({name:'Rift Stalker',bloodColor:'purple',hp:48,speed:136,laneSpeed:115,distance:145,tellMs:760,activeMs:360,recoverMs:900,reach:48,damage:12,attackType:'rift-cross',tell:'Flank crossing marked'}),
    shock_mantid:Object.freeze({name:'Shock Mantid',bloodColor:'green',hp:64,speed:88,laneSpeed:60,distance:235,tellMs:1050,activeMs:180,recoverMs:1250,reach:30,damage:14,projectileSpeed:320,attackType:'ground-wave',tell:'Ground pulse charging; jump or change lane'}),
    null_regent:Object.freeze({name:'Null Regent',bloodColor:'purple',hp:300,speed:94,laneSpeed:78,distance:112,tellMs:1000,activeMs:160,recoverMs:1150,reach:158,damage:17,attackType:'cleave',tell:'Four arms drawn wide',boss:true})
  });
  // Conservative inner torso spans at the native 260px standing scale (Regent
  // 335px). Feet locate the ground plane; hair, antennae, splayed shoes, weapon
  // tips and transparent cel margins are never damageable body radius.
  const BODIES=Object.freeze({
    mac:Object.freeze({offsetX:5,radius:34}),chitin_scuttler:Object.freeze({offsetX:-6,radius:42}),
    psion_lancer:Object.freeze({offsetX:-8,radius:44}),bile_spitter:Object.freeze({offsetX:-4,radius:45}),
    prism_guard:Object.freeze({offsetX:6,radius:48}),rift_stalker:Object.freeze({offsetX:-12,radius:38}),
    shock_mantid:Object.freeze({offsetX:-6,radius:46}),null_regent:Object.freeze({offsetX:-2,radius:70})
  });
  const zone=(id,name,index,arrival,exit,waves)=>Object.freeze({
    id,name,index:index+1,startX:index*C.zoneWidth,endX:(index+1)*C.zoneWidth,
    entryX:index*C.zoneWidth+(index?160:480),arrival,exit,
    waves:Object.freeze(waves.map(w=>Object.freeze(w)))
  });
  const ZONES=Object.freeze([
    zone('service-alley','Service Alley',0,'Enter the service street','Walk through the market arch',
      [['chitin_scuttler','psion_lancer'],['chitin_scuttler','chitin_scuttler','prism_guard']]),
    zone('night-market','Night Market',1,'Beyond the market arch','Walk into the transit entrance',
      [['bile_spitter','chitin_scuttler'],['prism_guard','psion_lancer','bile_spitter']]),
    zone('transit-concourse','Transit Concourse',2,'Across the station concourse','Take the canal service passage',
      [['rift_stalker','psion_lancer'],['rift_stalker','bile_spitter','chitin_scuttler']]),
    zone('relay-canal','Relay Canal',3,'Along the canal maintenance road','Walk to the rooftop stair entrance',
      [['shock_mantid','prism_guard'],['shock_mantid','bile_spitter','rift_stalker']]),
    zone('rooftop-relay','Rooftop Relay',4,'At the rooftop relay landing','Take the plaza descent',
      [['prism_guard','rift_stalker','psion_lancer'],['shock_mantid','chitin_scuttler','bile_spitter']]),
    zone('broadcast-plaza','Broadcast Plaza',5,'Through the broadcast plaza approach','Walk to the review studio entrance',
      [['bile_spitter','prism_guard','shock_mantid'],['null_regent']])
  ]);
  // Both fights occupy different parts of every street. These describe the
  // real combination, not a random objective or an extra completion condition.
  const ENCOUNTERS=Object.freeze([
    Object.freeze([{name:'First contact',objective:'Dodge the spear line; punish the claw rush.'},
      {name:'Armored delivery',objective:'Throw a claw fighter through the shield; break it with the crowbar.'}]),
    Object.freeze([{name:'Market crossfire',objective:'Close on the spitter between globs; use the barrel to clear space.'},
      {name:'Shielded vendor',objective:'Break the guard protecting the spitter, then finish the spear fighter.'}]),
    Object.freeze([{name:'Platform crossing',objective:'Let the stalker cross, then punish its landing. Watch the spear line.'},
      {name:'Cargo ambush',objective:'Throw cargo through the flankers; smash the terminal to interrupt the pack.'}]),
    Object.freeze([{name:'Canal pulse',objective:'Jump or leave the shock lane; crack the guard during recovery.'},
      {name:'Maintenance crossfire',objective:'Use the barrel to interrupt crossfire before chasing the stalker.'}]),
    Object.freeze([{name:'Relay perimeter',objective:'Break the shield formation; punish the stalker and spear in turn.'},
      {name:'Relay overload',objective:'Smash the terminal near the pack; turn its discharge into a free attack window.'}]),
    Object.freeze([{name:'Plaza blockade',objective:'Disrupt the shielded firing line; save the car reward for the Regent.'},
      {name:'Null Regent',objective:'Respect the locked tell. Dodge or parry, then punish the exposed recovery.'}])
  ].map(pair=>Object.freeze(pair.map(Object.freeze))));
  const BOSS_PHASES=Object.freeze({1:'Four-arm enforcer',2:'Relay crossfire',3:'Plaza overload'});
  const BLOOD=Object.freeze({green:'#78ea68',purple:'#b374ed',red:'#f04455'});
  const streetProp=(id,zoneId,kind,x,laneY,maxHp,drop='health')=>Object.freeze({id,zoneId,kind,x,laneY,maxHp,drop:drop?Object.freeze({kind:drop}):null,
    variant:kind==='car'?(id.includes('canal')?'van':'coupe'):null,
    bonusWeapon:null,
    width:kind==='car'?(id.includes('canal')?790:680):kind==='stall'?330.940171:kind==='crate'?161.330935:
      kind==='barrel'?117.181529:kind==='terminal'?187.696629:kind==='streetlight'?338.361045:154.716981,
    height:kind==='car'?(id.includes('canal')?284.083095:209.074627):kind==='stall'?320:kind==='crate'?150:kind==='barrel'?165:
      kind==='terminal'?260:kind==='streetlight'?550:280,
    depth:kind==='car'?98.8:kind==='stall'?84.5:62.4,
    placement:['streetlight','terminal'].includes(kind)?'street-fixture':'ground',
    carryable:['crate','barrel'].includes(kind),weight:kind==='barrel'?60:kind==='crate'?40:999,targetable:!!maxHp});
  const STREET_PROPS=Object.freeze([
    streetProp('alley-health-crate','service-alley','crate',1140,832,24),
    streetProp('alley-exit-crate','service-alley','crate',2380,907,24),
    streetProp('alley-car','service-alley','car',1540,945,240,'barrier'),
    streetProp('alley-streetlight','service-alley','streetlight',2740,795,32,'overdrive'),
    streetProp('market-stall','night-market','stall',4580,880,40),
    streetProp('market-health-crate','night-market','crate',5780,815,24),
    streetProp('market-barrel','night-market','barrel',4070,940,28,'overdrive'),
    streetProp('market-car','night-market','car',6080,940,260,'impact'),
    streetProp('market-relay','night-market','relay',6400,880,0,null),
    streetProp('transit-crate','transit-concourse','crate',7820,835,24),
    streetProp('transit-terminal','transit-concourse','terminal',8500,795,40,'barrier'),
    streetProp('transit-cargo','transit-concourse','crate',9410,940,30,'overdrive'),
    streetProp('canal-barrel','relay-canal','barrel',11020,835,28,'impact'),
    streetProp('canal-car','relay-canal','car',11920,945,300),
    streetProp('canal-streetlight','relay-canal','streetlight',12820,795,36,'barrier'),
    streetProp('rooftop-crate','rooftop-relay','crate',14420,835,24,'overdrive'),
    streetProp('rooftop-terminal','rooftop-relay','terminal',15420,795,40,'impact'),
    streetProp('rooftop-barrel','rooftop-relay','barrel',16200,940,28),
    streetProp('plaza-car','broadcast-plaza','car',17840,940,280,'barrier'),
    streetProp('plaza-crate','broadcast-plaza','crate',18820,820,24,'impact'),
    streetProp('plaza-streetlight','broadcast-plaza','streetlight',19400,795,36,'overdrive')
  ]);
  // Roll the chapter once, never during physics. Each street has two readable
  // floor caches in different fight pockets and one hidden carryable reward.
  // The first Pipe remains fixed so learning L never depends on a lucky roll.
  const DEFAULT_LOOT_SEED=0x4d4143;
  const LOOT_DISTRICTS=Object.freeze([
    {floor:['pipe','crowbar'],spots:[[[300,880]],[[1980,900],[2210,907],[2690,840]]],
      props:['alley-health-crate','alley-exit-crate'],pool:['pipe','crowbar']},
    {floor:['shock-baton','energy-blade'],spots:[[[3690,840],[4380,810],[4860,910]],[[5540,900],[5810,940],[6590,835]]],
      props:['market-stall','market-health-crate','market-barrel'],pool:['crowbar','shock-baton','energy-blade']},
    {floor:['gravity-hammer',null],spots:[[[7130,835],[7540,920],[8240,900]],[[9030,840],[9700,880],[9930,940]]],
      props:['transit-crate','transit-cargo'],pool:['crowbar','shock-baton','energy-blade','gravity-hammer']},
    {floor:['scatter-blaster',null],spots:[[[10560,850],[10890,940],[11580,895]],[[12390,840],[12600,930],[13210,880]]],
      props:['canal-barrel'],pool:['shock-baton','gravity-hammer','scatter-blaster']},
    {floor:['coil-rifle',null],spots:[[[13920,835],[14150,945],[15090,900]],[[15780,875],[16520,850],[16850,940]]],
      props:['rooftop-crate','rooftop-barrel'],pool:['energy-blade','gravity-hammer','scatter-blaster','coil-rifle']},
    {floor:['plasma-disc',null],spots:[[[17330,850],[17620,935],[18310,875]],[[19250,900],[19580,880],[19860,845]]],
      props:['plaza-crate'],pool:['gravity-hammer','scatter-blaster','coil-rifle','plasma-disc']}
  ].map(rule=>Object.freeze({floor:Object.freeze(rule.floor),pool:Object.freeze(rule.pool),props:Object.freeze(rule.props),
    spots:Object.freeze(rule.spots.map(pocket=>Object.freeze(pocket.map(Object.freeze))))})));
  function normalizeLootSeed(seed){return Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff?seed>>>0:DEFAULT_LOOT_SEED;}
  function lootLayout(requestedSeed){
    const seed=normalizeLootSeed(requestedSeed);let cursor=seed;
    const roll=length=>{cursor=(cursor+0x6d2b79f5)>>>0;let word=cursor;
      word=Math.imul(word^(word>>>15),word|1);word^=word+Math.imul(word^(word>>>7),word|61);
      return Math.floor(((word^(word>>>14))>>>0)/4294967296*length);};
    const pickups=[],propWeapons=[];
    for(let index=0;index<ZONES.length;index++){
      const zone=ZONES[index],rule=LOOT_DISTRICTS[index];
      for(let pocket=0;pocket<2;pocket++){
        const weaponKind=rule.floor[pocket]||rule.pool[roll(rule.pool.length)],spot=rule.spots[pocket][roll(rule.spots[pocket].length)];
        const tutorial=index===0&&pocket===0,x=spot[0]+(tutorial?0:roll(65)-32),laneY=spot[1]+(tutorial?0:roll(21)-10);
        pickups.push(Object.freeze({id:rule.floor[pocket]?'street-weapon-'+weaponKind:zone.id+'-cache-weapon',kind:'weapon',
          weaponKind,charges:WEAPONS[weaponKind].charges,zoneId:zone.id,x,laneY,source:'street-cache'}));
      }
      const propId=rule.props[roll(rule.props.length)];
      propWeapons.push(Object.freeze({propId,weaponKind:rule.pool[roll(rule.pool.length)]}));
      for(const car of STREET_PROPS.filter(prop=>prop.zoneId===zone.id&&prop.kind==='car'))
        propWeapons.push(Object.freeze({propId:car.id,weaponKind:rule.pool[roll(rule.pool.length)]}));
    }
    return Object.freeze({seed,pickups:Object.freeze(pickups),propWeapons:Object.freeze(propWeapons)});
  }
  const TACTICS=Object.freeze({
    chitin_scuttler:Object.freeze(['jab','rush-jab']),
    psion_lancer:Object.freeze(['lunge','lancer-sweep']),
    bile_spitter:Object.freeze(['bile','bile-spread']),
    prism_guard:Object.freeze(['shield-bash','shield-heavy']),
    rift_stalker:Object.freeze(['rift-cross','retreat-slash']),
    shock_mantid:Object.freeze(['ground-wave','mantid-leap']),
    null_regent:Object.freeze(['cleave','charge','fan','ground-wave'])
  });

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  const copy = v => JSON.parse(JSON.stringify(v));
  const toward = (value, target, distance) => value + clamp(target - value, -distance, distance);
  const action = v => typeof v === 'boolean' ? {pressed: false, held: v}
    : {pressed: !!v?.pressed, held: !!v?.held};
  const readyAt = (value, duration) => value + 1e-7 >= duration;
  const gaitPoint=(x,y)=>({x,y});
  const gaitEase=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};
  const gaitBlend=(a,b,t)=>gaitPoint(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
  const gaitCopy=feet=>({front:{...feet.front},rear:{...feet.rear}});
  const gaitInitial=()=>({front:gaitPoint(25,0),rear:gaitPoint(-23,0)});
  function walkTarget(phase,ratio,front){
    const t=((phase+(front?0:.5))%1+1)%1,span=110*.6/2*ratio;
    if(t<.6)return gaitPoint(span-2*span*t/.6,0);
    const swing=(t-.6)/.4;
    return gaitPoint(-span+2*span*gaitEase(swing),-Math.sin(swing*Math.PI)*(9+Math.abs(span)*.12));
  }
  function settleTarget(actor,front){
    const from=actor.transitionFrom,phase=actor.motionStridePhase;
    const frontFirst=from.front.y<-.01?true:from.rear.y<-.01?false:phase>=.5;
    const start=front?from.front:from.rear,first=front===frontFirst;
    const t=clamp((actor.settleAgeMs-(first?0:120))/120,0,1);
    const target=gaitBlend(start,gaitPoint(front?25:-23,0),gaitEase(t));
    // An interrupted lifted step must not accumulate another lift each stop.
    // Keep its current arc or the new 8px arc, rather than adding both heights.
    target.y=Math.min(target.y,-Math.sin(t*Math.PI)*8);return target;
  }

  // Keep the last real local stride direction while a renderer settles feet.
  // The first stationary simulation tick is the stop origin, not one tick old.
  function trackMotion(actor,dt){
    const speed=Math.hypot(actor.vx,actor.laneVelocity*.75),moving=speed>.01;
    if(moving){
      const reversing=actor.motionMoving&&(actor.vx*actor.motionVx+actor.laneVelocity*actor.motionLaneVelocity*.75*.75)<-.01;
      if(!actor.motionMoving||reversing){
        actor.transitionFrom=gaitCopy(actor.feet);
        actor.moveAgeMs=0;actor.fromMoving=actor.motionMoving;
        actor.fromStopAgeMs=actor.wasMoving?actor.settleAgeMs:240;
        actor.fromStridePhase=actor.motionStridePhase;actor.fromStrideRatio=actor.strideRatio;
      }else actor.moveAgeMs+=dt;
      actor.strideRatio=clamp(actor.vx*actor.facing/speed,-1,1);
      actor.settleAgeMs=0;actor.wasMoving=true;
      const phase=(actor.travelDistance/110)%1,t=gaitEase(actor.moveAgeMs/100);
      actor.feet={front:gaitBlend(actor.transitionFrom.front,walkTarget(phase,actor.strideRatio,true),t),
        rear:gaitBlend(actor.transitionFrom.rear,walkTarget(phase,actor.strideRatio,false),t)};
    }else{
      if(actor.motionMoving)actor.transitionFrom=gaitCopy(actor.feet);
      actor.settleAgeMs=actor.motionMoving?0:actor.wasMoving?actor.settleAgeMs+dt:0;
      if(actor.wasMoving)actor.feet={front:settleTarget(actor,true),rear:settleTarget(actor,false)};
    }
    actor.motionMoving=moving;
    actor.motionVx=actor.vx;actor.motionLaneVelocity=actor.laneVelocity;
    actor.motionStridePhase=(actor.travelDistance/110)%1;
  }

  function initialState(lootSeed){
    const layout=lootLayout(lootSeed),propWeapons=new Map(layout.propWeapons.map(item=>[item.propId,item.weaponKind]));
    return {lootSeed:layout.seed,elapsedMs:0,status:'active',kills:0,zoneIndex:0,waveIndex:0,arenaIndex:0,
      completedWaves:0,clearedZones:[],waveState:'entry',waveBreakMs:0,
      player:{x:C.startX,laneY:C.startLaneY,elevation:0,velocityZ:0,facing:1,
        hp:C.playerHp,maxHp:C.playerHp,attack:null,comboNext:1,comboMs:0,queuedStrike:false,
        guarding:false,parryMs:0,counterMs:0,hurtMs:0,invulnerableMs:0,knockbackVx:0,
        throwMs:0,throwCooldownMs:0,grapple:null,carry:null,strength:C.strength,weapon:null,
        running:false,runDirection:0,lastTapDirection:0,lastTapMs:-Infinity,
        powerups:{overdriveMs:0,barrierMs:0,barrierCharges:0,impactMs:0},animAction:'idle',animAgeMs:0,
        vx:0,laneVelocity:0,travelDistance:0,strideRatio:0,settleAgeMs:0,
        wasMoving:false,motionMoving:false,moveAgeMs:0,fromMoving:false,fromStopAgeMs:240,
        fromStridePhase:0,fromStrideRatio:0,motionStridePhase:0,motionVx:0,motionLaneVelocity:0,
        feet:gaitInitial(),transitionFrom:gaitInitial(),hitFeedback:null},
      enemies:[],projectiles:[],hitFx:[],events:[],nextFxId:1,nextProjectileId:1,
      props:STREET_PROPS.map(prop=>({...prop,bonusWeapon:propWeapons.get(prop.id)||null,hp:prop.maxHp,broken:false,heldBy:null,
        launched:false,elevation:0,velocityZ:0,knockbackVx:0,launchAgeMs:0,bodyHitIds:[],recoil:null})),pickups:layout.pickups.map(copy),nextPickupId:1,
      relay:{available:false,restored:false,x:6400,laneY:880},
      impact:{remainingMs:0,strength:0,x:0,laneY:880},lastEnemyTellMs:-Infinity,
      checkpoint:{zoneIndex:0,waveIndex:0,kills:0,completedWaves:0,clearedZones:[],
        x:C.startX,laneY:C.startLaneY,started:false}};
  }

  function create(options={}) {
    let state = initialState(options.lootSeed), accumulator = 0;
    let input = {move_x: 0, move_y: 0, jump: {held: false}, strike: {held: false},
      guard: {held: false}, throw: {held: false},run:{held:false}};
    let edges = {jump: false, strike: false, guard: false, throw: false,moveTaps:[]},impactBufferedStrike=false;

    function emit(type, data = {}) {
      state.events.push({type, atMs: state.elapsedMs, ...data});
      if (state.events.length > C.maxEvents) state.events.shift();
    }
    function fx(kind,x,laneY,bloodColor=null,direction=0){
      const id=state.nextFxId++,particles=bloodColor?Array.from({length:8},(_,index)=>{
        const seed=(id*37+index*53)%101;
        return {x,laneY,elevation:120+(index%3)*15,radius:3+(seed%4),
          vx:direction*(85+seed*1.4)+(index%2?32:-32),laneVelocity:(seed%5-2)*20,
          velocityZ:90+(seed%7)*24};
      }):[];
      state.hitFx.push({id,kind,x,laneY,elevation:130,ageMs:0,
        lifeMs:bloodColor?700:320,bloodColor,bloodHex:bloodColor?BLOOD[bloodColor]:null,direction,particles});
      if(state.hitFx.length>C.maxHitFx)state.hitFx.shift();
    }
    function phase(e,value){
      const previous=e.phase;
      if(['windup','active'].includes(previous)&&['stunned','grappled','launched','defeated'].includes(value)){
        emit('enemy-interrupted',{id:e.id,kind:e.kind,attackType:e.attackSpec?.attackType||null,phase:previous});
        if(ROLES[e.kind].boss&&e.hp)e.punishUntilMs=Math.max(e.punishUntilMs,state.elapsedMs+1000);
      }
      if(value==='approach'&&['stunned','grappled','knockdown','recovery'].includes(previous))
        e.nextTellAtMs=Math.max(e.nextTellAtMs,state.elapsedMs+C.interruptedRearmMs);
      if(value==='recovery'&&ROLES[e.kind].boss){
        e.punishUntilMs=Math.max(e.punishUntilMs,state.elapsedMs+(previous==='active'?e.attackSpec.recoverMs:0));
        emit('boss-exposed',{id:e.id,phase:e.bossPhase,durationMs:Math.max(0,e.punishUntilMs-state.elapsedMs),attackType:e.attackSpec?.attackType||null});
      }
      e.phase=value;e.phaseMs=0;e.animAgeMs=0;
    }
    function makeEnemy(kind,slot,started){
      const z=ZONES[state.zoneIndex],rule=ROLES[kind];
      const stageFloor=state.waveIndex===1?z.startX+C.advanceEntryOffset+320:z.startX+820;
      const baseX=clamp(state.player.x+440,stageFloor,z.endX-780);
      const x=clamp(baseX+slot*240,z.startX+120,z.endX-170);
      return {id:z.id+'-w'+(state.waveIndex+1)+'-'+slot+'-'+kind,kind,name:rule.name,
        arena:z.index,zoneId:z.id,wave:state.waveIndex+1,bloodColor:rule.bloodColor,bloodHex:BLOOD[rule.bloodColor],
        x,laneY:[880,930,815][slot],hp:rule.hp,maxHp:rule.hp,facing:-1,
        phase:started?'approach':'dormant',phaseMs:0,attackLaneY:880,attackFacing:-1,
        attackOriginX:x,attackTargetX:x,attackDone:false,attackSpawned:false,attackSpec:null,
        attackCount:0,bossPhase:rule.boss?1:null,shieldBrokenMs:0,stunMs:0,nextTellAtMs:0,punishUntilMs:0,
        knockbackVx:0,flashMs:0,ageMs:0,animAgeMs:0,animAction:started?'walk':'idle',hitFeedback:null,
        elevation:0,velocityZ:0,launched:false,launchAgeMs:0,knockdownMs:0,knockdownAgeMs:0,bodyHitIds:[],slot,rangedRetreatMs:0,
        vx:0,laneVelocity:0,travelDistance:0,strideRatio:0,settleAgeMs:0,
        wasMoving:false,motionMoving:false,moveAgeMs:0,fromMoving:false,fromStopAgeMs:240,
        fromStridePhase:0,fromStrideRatio:0,motionStridePhase:0,motionVx:0,motionLaneVelocity:0,
        feet:gaitInitial(),transitionFrom:gaitInitial(),grappledBy:null,tactic:'approach'};
    }
    function spawnWave(started){
      const z=ZONES[state.zoneIndex];
      state.enemies=z.waves[state.waveIndex].map((kind,slot)=>makeEnemy(kind,slot,started));
      state.projectiles=[];state.waveState=started?'combat':'entry';state.waveBreakMs=0;state.lastEnemyTellMs=-Infinity;
      state.arenaIndex=started?state.zoneIndex+1:0;
      state.checkpoint={zoneIndex:state.zoneIndex,waveIndex:state.waveIndex,kills:state.kills,
        completedWaves:state.completedWaves,clearedZones:state.clearedZones.slice(),
        x:state.player.x,laneY:state.player.laneY,started,
        props:copy(state.props),pickups:copy(state.pickups),relay:copy(state.relay),weapon:copy(state.player.weapon),powerups:copy(state.player.powerups),nextPickupId:state.nextPickupId};
      if(started){
        emit('wave-start',{zoneId:z.id,zone:z.index,wave:state.waveIndex+1,kinds:state.enemies.map(e=>e.kind)});
        for(const e of state.enemies)emit('enemy-arrive',{id:e.id,kind:e.kind,arena:e.arena,bloodColor:e.bloodColor});
      }
    }
    spawnWave(false);

    function handleInput(raw = {}) {
      const next = {move_x: clamp(finite(raw.move_x), -1, 1),
        move_y: clamp(finite(raw.move_y), -1, 1)};
      for (const name of ['jump', 'strike', 'guard', 'throw']) {
        next[name] = action(raw[name]);
        const freshHold = next[name].held && !input[name].held;
        edges[name] ||= name === 'guard' ? freshHold :name==='throw'?freshHold||next[name].pressed&&!input[name].held:next[name].pressed || freshHold;
        if(name==='strike'&&state.impact.remainingMs>0&&(next[name].pressed||freshHold))impactBufferedStrike=true;
      }
      next.run=action(raw.run);
      const direction=Math.abs(next.move_x)>.45?Math.sign(next.move_x):0;
      const oldDirection=Math.abs(input.move_x)>.45?Math.sign(input.move_x):0;
      if(direction&&direction!==oldDirection){edges.moveTaps.push(direction);if(edges.moveTaps.length>2)edges.moveTaps.shift();}
      input = next;
    }
    function currentGate(){
      const z=ZONES[state.zoneIndex];
      return state.waveState==='zone-clear'?Math.min(C.worldWidth-40,z.endX+220)
        :state.status==='desk-ready'?C.worldWidth-40:z.endX-220;
    }
    function live(e){return e.hp>0&&e.phase!=='dormant';}
    function body(e){return BODIES[e.kind||'mac'];}
    function bodyCenter(e){return e.x+(e.facing||1)*body(e).offsetX;}
    function forwardContact(x,beforeX,facing,target,reach,radial=false){
      const center=bodyCenter(target),radius=body(target).radius;
      const now=(center-x)*facing,before=(center-beforeX)*facing;
      // Sweep only the committed front, including the real target torso.
      // Symmetric ±reach around a charger incorrectly struck people behind it.
      return Math.max(now,before)+radius>=(radial?-reach:0)&&Math.min(now,before)-radius<=reach;
    }
    function spaceBodies(dt){
      const sec=dt/1000,z=ZONES[state.zoneIndex];
      const grounded=state.enemies.filter(e=>live(e)&&!e.grappledBy&&!e.launched&&!e.knockdownMs&&!e.elevation);
      const remaining=new Map(grounded.map(e=>[e.id,C.bodySpacingSpeed*sec]));
      const movable=e=>['approach','recovery'].includes(e.phase);
      for(let pass=0;pass<2;pass++)for(let a=0;a<grounded.length;a++)for(let b=a+1;b<grounded.length;b++){
        const left=grounded[a],right=grounded[b],moveLeft=movable(left),moveRight=movable(right);
        if(!moveLeft&&!moveRight)continue;
        const width=body(left).radius+body(right).radius+C.bodySpacingPad,depth=C.bodySpacingDepth;
        let dx=bodyCenter(right)-bodyCenter(left),dy=right.laneY-left.laneY;
        const ratio=Math.hypot(dx/width,dy/depth);if(ratio>=1)continue;
        if(ratio<.001){dx=right.slot>left.slot?1:-1;dy=0;}
        const stretch=1/Math.max(.001,Math.hypot(dx/width,dy/depth))-1;
        let shiftX=dx*stretch,shiftY=dy*stretch;
        const shares=Number(moveLeft)+Number(moveRight);
        const length=Math.hypot(shiftX,shiftY),cap=Math.min(moveLeft?remaining.get(left.id)*shares:Infinity,moveRight?remaining.get(right.id)*shares:Infinity);
        if(length>cap){shiftX*=cap/length;shiftY*=cap/length;}
        const moved=Math.hypot(shiftX,shiftY)/shares;
        if(moveLeft)remaining.set(left.id,Math.max(0,remaining.get(left.id)-moved));
        if(moveRight)remaining.set(right.id,Math.max(0,remaining.get(right.id)-moved));
        if(moveLeft){left.x=clamp(left.x-shiftX/shares,z.startX+60,z.endX-60);left.laneY=clamp(left.laneY-shiftY/shares,C.laneMin,C.laneMax);}
        if(moveRight){right.x=clamp(right.x+shiftX/shares,z.startX+60,z.endX-60);right.laneY=clamp(right.laneY+shiftY/shares,C.laneMin,C.laneMax);}
      }
    }
    function impactPause(duration,strength,x,laneY){
      state.impact={remainingMs:Math.max(state.impact.remainingMs,Math.min(C.maxImpactPauseMs,duration)),
        strength:Math.max(state.impact.strength,strength),x,laneY};
    }
    function damageProp(prop,amount,cause,direction=Math.sign(prop.x-state.player.x)||state.player.facing){
      if(prop.broken||!prop.maxHp||prop.heldBy||prop.zoneId!==ZONES[state.zoneIndex].id)return;
      amount=WEAPONS[cause]?.propDamage??amount;
      prop.hp=Math.max(0,prop.hp-amount);
      const strength=clamp(.3+amount/85,.35,1),heavy=amount>=24;
      if(prop.kind==='car'&&prop.hp)prop.recoil={ageMs:0,lifeMs:C.carRecoilMs,remainingMs:C.carRecoilMs,
        strength,direction:Math.sign(direction)||1,x:0,elevation:0,rotation:0};
      emit('prop-hit',{id:prop.id,kind:prop.kind,x:prop.x,laneY:prop.laneY,damage:amount,hp:prop.hp,cause,
        direction:Math.sign(direction)||1,heavy,recoilStrength:prop.recoil?.strength||0});
      if(!prop.hp){
        prop.broken=true;prop.launched=false;prop.elevation=0;prop.velocityZ=0;prop.recoil=null;
        const pickup=prop.drop?addPickup({...prop.drop,id:prop.id+'-'+prop.drop.kind,zoneId:prop.zoneId,x:prop.x,laneY:prop.laneY}):null;
        const weaponPickup=prop.bonusWeapon?addPickup({id:prop.id+'-weapon',kind:'weapon',weaponKind:prop.bonusWeapon,
          charges:WEAPONS[prop.bonusWeapon].charges,zoneId:prop.zoneId,x:prop.x+38,laneY:prop.laneY,source:'prop',sourceId:prop.id}):null;
        fx('prop-break',prop.x,prop.laneY);
        emit('prop-break',{id:prop.id,kind:prop.kind,x:prop.x,laneY:prop.laneY,cause,pickupId:pickup?.id||null,
          weaponPickupId:weaponPickup?.id||null,weaponKind:weaponPickup?.weaponKind||null});
        if(['terminal','streetlight'].includes(prop.kind))dischargeFixture(prop);
        impactPause(32,.6,prop.x,prop.laneY);
      }
    }
    function dischargeFixture(prop){
      // One break, one enemy-only interruption. No persistent hazard, damage
      // timer, invisible player hit or recursive destruction chain is created.
      const victims=state.enemies.filter(e=>live(e)&&!e.grappledBy&&!e.launched&&
        Math.abs(e.x-prop.x)<=C.fixtureDischargeRange&&Math.abs(e.laneY-prop.laneY)<=C.fixtureDischargeLaneReach);
      for(const e of victims){
        damageEnemy(e,12,Math.sign(e.x-prop.x)||state.player.facing,'fixture-discharge',780,100);
      }
      const item=state.hitFx.find(f=>f.kind==='prop-break'&&f.x===prop.x&&f.laneY===prop.laneY);
      if(item){item.discharge=true;item.radius=C.fixtureDischargeRange;item.laneReach=C.fixtureDischargeLaneReach;}
      emit('fixture-discharge',{id:prop.id,kind:prop.kind,x:prop.x,laneY:prop.laneY,
        radius:C.fixtureDischargeRange,laneReach:C.fixtureDischargeLaneReach,damage:12,enemyIds:victims.map(e=>e.id)});
    }
    function addPickup(item){
      // Previous streets cannot be revisited. Retire only their inaccessible
      // floor loot when the bounded chapter pool needs room for a real drop.
      if(state.pickups.length>=C.maxPickups){const previous=new Set(ZONES.slice(0,state.zoneIndex).map(zone=>zone.id));
        state.pickups=state.pickups.filter(pickup=>!previous.has(pickup.zoneId));}
      if(state.pickups.length>=C.maxPickups)return null;
      const pickup={...item,id:item.id||'pickup-'+state.nextPickupId++};state.pickups.push(pickup);return pickup;
    }
    function stopRun(reason){const p=state.player;if(p.running)emit('run-stop',{reason,x:p.x,laneY:p.laneY});p.running=false;p.runDirection=0;}
    function heldEnemy(){return state.player.grapple&&!state.player.grapple.released;}
    function holding(){return heldEnemy()||!!state.player.carry&&!state.player.carry.released;}
    function propTarget(){const p=state.player;return state.props.filter(prop=>!prop.broken&&prop.carryable&&!prop.heldBy&&!prop.launched&&
      prop.zoneId===ZONES[state.zoneIndex].id&&Math.abs(prop.laneY-p.laneY)<=55&&Math.abs(prop.x-p.x)<=C.propReach)
      .sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x)||a.id.localeCompare(b.id))[0]||null;}
    function weaponTarget(){const p=state.player;return state.pickups.filter(item=>item.kind==='weapon'&&item.zoneId===ZONES[state.zoneIndex].id&&
      Math.abs(item.x-p.x)<=C.pickupReach&&Math.abs(item.laneY-p.laneY)<=55)
      .sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x)||a.id.localeCompare(b.id))[0]||null;}
    function gripTarget(){const enemy=throwTarget();if(enemy)return {type:'enemy',item:enemy};const prop=propTarget();if(prop)return {type:'prop',item:prop};
      const weapon=weaponTarget();return weapon?{type:'weapon',item:weapon}:null;}
    function dropWeapon(reason='swap'){const p=state.player;if(!p.weapon)return;
      const item=addPickup({kind:'weapon',weaponKind:p.weapon.kind,charges:p.weapon.charges,zoneId:ZONES[state.zoneIndex].id,
        x:clamp(p.x-32*p.facing,ZONES[state.zoneIndex].startX+40,currentGate()),laneY:p.laneY});
      emit('weapon-dropped',{id:item?.id||null,kind:p.weapon.kind,charges:p.weapon.charges,reason,x:item?.x??p.x,laneY:p.laneY});p.weapon=null;}
    function cancelHolding(reason){
      const p=state.player;
      if(p.grapple){const victim=state.enemies.find(e=>e.id===p.grapple.targetId);
        if(victim?.grappledBy){victim.grappledBy=null;if(victim.hp)phase(victim,'approach');}
        if(!p.grapple.released)emit('grab-end',{id:p.grapple.targetId,reason,thrown:false,x:p.x,laneY:p.laneY});}
      if(p.carry){const prop=state.props.find(item=>item.id===p.carry.id);if(prop?.heldBy){prop.heldBy=null;prop.elevation=0;prop.velocityZ=0;
        prop.x=clamp(p.x+p.facing*60,ZONES[state.zoneIndex].startX+40,currentGate());prop.laneY=p.laneY;}
        if(!p.carry.thrown)emit('prop-drop',{id:p.carry.id,reason,x:prop?.x||p.x,laneY:p.laneY});}
      p.grapple=null;p.carry=null;p.throwMs=0;
    }
    function beginRelease(reason){const p=state.player,grip=p.grapple||p.carry;if(!grip||grip.released)return;
      grip.released=true;grip.releaseElapsedMs=0;grip.reason=reason;p.throwMs=C.throwCommitMs;
      p.attack=null;p.queuedStrike=false;p.throwCooldownMs=C.throwCooldownMs;stopRun('throw');
      if(p.grapple)emit('grab-end',{id:grip.targetId,reason,thrown:true,x:p.x,laneY:p.laneY});}
    function beginGrip(){
      const p=state.player,target=gripTarget();if(!target)return;
      stopRun('grab');p.guarding=false;p.parryMs=0;p.comboMs=0;p.comboNext=1;
      if(target.type==='weapon'){
        dropWeapon();const item=target.item,rule=WEAPONS[item.weaponKind];
        p.weapon={kind:item.weaponKind,name:rule.name,charges:item.charges,maxCharges:rule.charges};item.collected=true;
        emit('weapon-equipped',{id:item.id,kind:item.weaponKind,name:rule.name,charges:item.charges,x:p.x,laneY:p.laneY});return;
      }
      if(target.type==='prop'){
        const prop=target.item;p.carry={id:prop.id,kind:prop.kind,weight:prop.weight,elapsedMs:0,maxHoldMs:null,remainingMs:null,
          facing:p.facing,released:false,releaseElapsedMs:0};prop.heldBy='mac';prop.elevation=C.carryElevation;prop.velocityZ=0;
        emit('prop-pickup',{id:prop.id,kind:prop.kind,weight:prop.weight,x:prop.x,laneY:prop.laneY});return;
      }
      const enemy=target.item,strength=GRAB_STRENGTH[enemy.kind],maxHoldMs=clamp(C.grabMaxMs-(strength-p.strength)*18,1000,C.grabMaxMs);
      p.grapple={targetId:enemy.id,elapsedMs:0,maxHoldMs,remainingMs:maxHoldMs,strength,facing:p.facing,released:false,
        releaseElapsedMs:0,pummelUsedMs:0,pummelRemainingMs:C.pummelMaxMs};
      enemy.grappledBy='mac';enemy.attackDone=true;enemy.knockbackVx=0;phase(enemy,'grappled');
      emit('grab-start',{id:enemy.id,kind:enemy.kind,strength,maxHoldMs,x:enemy.x,laneY:enemy.laneY});
      emit('throw',{id:enemy.id,phase:'grab',facing:p.facing,releaseMs:null,maxHoldMs});
    }
    function releaseInputs(reason='pause'){
      cancelHolding(reason);stopRun(reason);const p=state.player;p.attack=null;p.queuedStrike=false;p.guarding=false;p.parryMs=0;
      p.comboNext=1;p.comboMs=0;p.counterMs=0;
      p.lastTapDirection=0;p.lastTapMs=-Infinity;
      input={move_x:0,move_y:0,jump:{held:false},strike:{held:false},guard:{held:false},throw:{held:false},run:{held:false}};
      edges={jump:false,strike:false,guard:false,throw:false,moveTaps:[]};impactBufferedStrike=false;
    }
    function launchEnemy(e,direction,cause){
      if(ROLES[e.kind].boss)return;
      e.launched=true;e.launchAgeMs=0;e.knockdownMs=0;e.knockdownAgeMs=0;e.bodyHitIds=[];
      e.velocityZ=cause==='throw'?360:310;e.elevation=Math.max(1,e.elevation);
      e.knockbackVx=direction*(cause==='throw'?530:460);e.attackDone=true;
      phase(e,e.hp?'launched':'defeated');
      emit('launch',{id:e.id,kind:e.kind,cause,move:cause==='strike'?'finisher':cause,
        x:e.x,laneY:e.laneY,direction,bloodColor:e.bloodColor});
    }
    function throwTarget(){
      const p=state.player;
      return state.enemies.filter(e=>live(e)&&!e.launched&&!e.knockdownMs&&(!ROLES[e.kind].boss||['stunned','recovery'].includes(e.phase))&&
        Math.abs(e.laneY-p.laneY)<=C.laneReach&&(e.x-p.x)*p.facing>=-12&&(e.x-p.x)*p.facing<=C.throwReach)
        .sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x)||a.id.localeCompare(b.id))[0]||null;
    }
    function damageEnemy(e,amount,direction,cause,stunMs,speed,launch=false){
      if(!live(e))return;
      const rule=ROLES[e.kind],shield=rule.shieldReduction&&!e.shieldBrokenMs&&direction===-e.facing&&
        ['strike','step-strike','running-kick','air-kick','pipe','gravity-hammer','scatter-blaster','coil-rifle','plasma-disc'].includes(cause);
      if(shield){amount=Math.max(1,Math.round(amount*(1-rule.shieldReduction)));fx('shield',e.x,e.laneY);}
      if(rule.shieldReduction&&['counter','throw','crowbar','energy-blade','shock-baton','fixture-discharge'].includes(cause)){
        e.shieldBrokenMs=2600;emit('shield-broken',{id:e.id,durationMs:e.shieldBrokenMs,cause});
      }
      e.hp=Math.max(0,e.hp-amount);e.flashMs=150;
      e.hitFeedback={kind:cause,ageMs:0,lifeMs:320,bloodColor:e.bloodColor,bloodHex:e.bloodHex,damage:amount,direction,shielded:!!shield};
      const armoredBoss=rule.boss&&e.hp&&['windup','active'].includes(e.phase)&&
        (['strike','step-strike','running-kick','air-kick'].includes(cause)||!!WEAPONS[cause]);
      if(!armoredBoss){
        e.knockbackVx=direction*speed;e.attackDone=true;
        // Hitting an exposed Regent must not replace its long punish window
        // with a short stun followed by an immediate armored retaliation.
        if(!(rule.boss&&e.hp&&e.phase==='recovery'))phase(e,e.hp?'stunned':'defeated');
        e.stunMs=rule.boss?Math.min(stunMs,420):stunMs;
      }
      const heavy=launch||['counter','throw','body-impact','prop-impact'].includes(cause);
      if(launch&&!shield&&!armoredBoss)launchEnemy(e,direction,cause);
      fx(e.hp?cause:'defeat',e.x,e.laneY,e.bloodColor,direction);
      state.hitFx.at(-1).heavy=heavy;state.hitFx.at(-1).damage=amount;
      impactPause(shield?10:heavy?48:12,shield ? .2 : heavy ? 1 : .35,e.x,e.laneY);
      emit('enemy-hit',{id:e.id,kind:e.kind,damage:amount,cause,hp:e.hp,bloodColor:e.bloodColor,
        x:e.x,laneY:e.laneY,direction,heavy,move:launch&&cause==='strike'?'finisher':cause,shielded:!!shield,
        stunMs:armoredBoss?0:e.stunMs,armored:!!armoredBoss});
      if(rule.boss&&e.hp){
        const nextPhase=e.hp<=e.maxHp/3?3:e.hp<=e.maxHp*2/3?2:1;
        if(nextPhase>e.bossPhase){
          e.bossPhase=nextPhase;emit('boss-phase',{id:e.id,phase:nextPhase,hp:e.hp,
            name:BOSS_PHASES[nextPhase],description:nextPhase===2?'Charge and relay fan':'Ground waves and four-arm pressure'});
        }
      }
      if(!e.hp){state.kills++;emit('enemy-defeated',{id:e.id,kind:e.kind,bloodColor:e.bloodColor});}
    }

    function startStrike(step) {
      const p=state.player,counter=p.counterMs>0,air=p.elevation>0||p.velocityZ>0;
      const running=!counter&&!air&&p.running;
      const weapon=!counter&&!air&&!running&&p.weapon?WEAPONS[p.weapon.kind]:null;
      let selected=counter?ATTACKS.counter:air?ATTACKS['air-kick']:running?ATTACKS['running-kick']:weapon||
        (step===1&&Math.abs(input.move_x)>.45?ATTACKS['step-strike']:STRIKES[step-1]);
      if(p.powerups.overdriveMs)selected={...selected,windupMs:selected.windupMs*.75,activeMs:selected.activeMs,recoveryMs:selected.recoveryMs*.75};
      if(counter||air||running||weapon)step=1;
      p.attack={step,kind:selected.kind,rule:selected,elapsedMs:0,facing:p.facing,
        hitIds:[],propHitIds:[],counter,airborne:air,running,rootShift:0,weaponKind:weapon?.kind||null,fired:false,spent:false,pulseDone:false};
      p.counterMs = 0; p.guarding = false; p.parryMs = 0;
      p.queuedStrike = false; p.comboMs = 0;
      stopRun('strike');emit('strike',{step,kind:selected.kind,weaponKind:weapon?.kind||null,counter,airborne:air,facing:p.facing});
      if(running)emit('running-kick',{x:p.x,laneY:p.laneY,facing:p.facing,damage:selected.damage,maxRootShift:selected.maxRootShift});
    }
    function startPummel(){
      const p=state.player,g=p.grapple,total=245;
      if(!g||g.released||g.pummelRemainingMs+1e-7<total)return;
      p.attack={step:1,kind:'pummel',rule:{kind:'pummel',windupMs:75,activeMs:65,recoveryMs:105,reach:74,damage:6},
        elapsedMs:0,facing:g.facing,hitIds:[],propHitIds:[],counter:false,airborne:false,rootShift:0};
      emit('pummel',{id:g.targetId,phase:'start',remainingMs:g.pummelRemainingMs,x:p.x,laneY:p.laneY});
    }
    function spendWeapon(attack){
      const p=state.player;if(!attack.weaponKind||attack.spent)return;attack.spent=true;
      if(p.weapon?.kind===attack.weaponKind){p.weapon.charges=Math.max(0,p.weapon.charges-1);
        if(!p.weapon.charges){emit('weapon-spent',{kind:p.weapon.kind,x:p.x,laneY:p.laneY});p.weapon=null;}}
    }
    function fireWeapon(attack){
      const p=state.player,r=attack.rule;if(attack.fired)return;attack.fired=true;spendWeapon(attack);
      const offsets=r.projectile==='scatter-bolt'?[-26,0,26]:[0];
      for(const offset of offsets){if(state.projectiles.length>=C.maxProjectiles)break;
        state.projectiles.push({id:state.nextProjectileId++,owner:'player',ownerId:'mac',kind:r.projectile,weaponKind:attack.weaponKind,
          x:p.x+attack.facing*r.muzzleForward,laneY:clamp(p.laneY+offset,C.laneMin,C.laneMax),elevation:r.muzzleElevation,facing:attack.facing,
          sweepStartX:p.x+attack.facing*12,firstSweep:true,
          vx:attack.facing*(r.projectile==='coil-bolt'?950:r.projectile==='scatter-bolt'?650:520),damage:r.damage,
          width:r.projectile==='plasma-disc'?24:10,laneReach:r.laneReach,ageMs:0,
          lifeMs:r.projectile==='plasma-disc'?1400:r.projectile==='coil-bolt'?850:650,
          hitIds:[],propHitIds:[],returning:false,maxHits:r.projectile==='coil-bolt'?3:r.projectile==='plasma-disc'?3:1});}
      emit('weapon-fired',{kind:attack.weaponKind,projectile:r.projectile,facing:attack.facing,x:p.x,laneY:p.laneY,
        muzzleX:p.x+attack.facing*r.muzzleForward,elevation:r.muzzleElevation,sweepStartX:p.x+attack.facing*12});
    }
    function impactPulse(attack){
      const p=state.player;if(attack.pulseDone||!p.powerups.impactMs)return;attack.pulseDone=true;p.powerups.impactMs=0;
      for(const e of state.enemies)if(live(e)&&!e.grappledBy&&Math.abs(e.x-p.x)<=210&&Math.abs(e.laneY-p.laneY)<=95)
        damageEnemy(e,18,Math.sign(e.x-p.x)||p.facing,'impact-pulse',500,440,true);
      for(const prop of state.props)if(!prop.broken&&!prop.heldBy&&prop.zoneId===ZONES[state.zoneIndex].id&&Math.abs(prop.x-p.x)<=210&&Math.abs(prop.laneY-p.laneY)<=95)
        damageProp(prop,36,'impact-pulse');
      fx('impact-pulse',p.x,p.laneY);emit('impact-pulse',{id:'mac',radius:210,x:p.x,laneY:p.laneY});
    }
    function strikePhase(attack) {
      const rule=attack.rule;
      return attack.elapsedMs < rule.windupMs ? 'windup'
        : attack.elapsedMs < rule.windupMs + rule.activeMs ? 'active' : 'recovery';
    }
    function takeHit(e,beforeX,spec,projectile=false){
      const p=state.player;
      if((!projectile&&e.attackDone)||p.hp<=0||p.invulnerableMs>0||p.elevation>(spec.hitHeight??C.hitHeight))return;
      if(!projectile)e.attackDone=true;
      if(p.powerups.barrierMs&&p.powerups.barrierCharges){
        cancelHolding('barrier-hit');stopRun('hit');
        p.powerups.barrierCharges--;p.invulnerableMs=240;
        if(!p.powerups.barrierCharges)p.powerups.barrierMs=0;
        fx('barrier',p.x,p.laneY);emit('barrier-block',{id:e.id,charges:p.powerups.barrierCharges,x:p.x,laneY:p.laneY});return;
      }
      const front=(beforeX-p.x)*p.facing>=-12&&e.attackFacing===-p.facing;
      if(p.guarding&&front&&spec.guardable!==false){
        if(p.parryMs>0){
          phase(e,'stunned');e.stunMs=650;e.knockbackVx=p.facing*100;
          p.parryMs=0;p.counterMs=C.counterMs;fx('parry',p.x+p.facing*42,p.laneY);
          impactPause(38,.7,p.x,p.laneY);
          emit('parry',{id:e.id,kind:e.kind,counterMs:C.counterMs,projectile});
        }else{fx('block',p.x+p.facing*42,p.laneY);emit('block',{id:e.id,kind:e.kind,projectile});}
        return;
      }
      p.hp=Math.max(0,p.hp-spec.damage);p.hurtMs=C.playerHurtMs;p.invulnerableMs=C.playerInvulnerableMs;
      p.knockbackVx=e.attackFacing*240;p.attack=null;p.queuedStrike=false;p.comboNext=1;p.comboMs=0;
      dropWeapon('hit');
      cancelHolding('hit');stopRun('hit');p.lastTapDirection=0;p.lastTapMs=-Infinity;
      p.guarding=false;p.parryMs=0;p.throwMs=0;
      p.hitFeedback={kind:'damage',ageMs:0,lifeMs:320,bloodColor:'red',bloodHex:BLOOD.red,
        damage:spec.damage,direction:e.attackFacing};
      fx('damage',p.x,p.laneY,'red',e.attackFacing);state.hitFx.at(-1).damage=spec.damage;
      impactPause(24,.55,p.x,p.laneY);emit('player-hit',{id:e.id,kind:e.kind,
        attackType:spec.attackType||spec.kind,damage:spec.damage,hp:p.hp,bloodColor:'red',bloodHex:BLOOD.red,
        x:p.x,laneY:p.laneY,direction:e.attackFacing,heavy:false});
      if(!p.hp){state.status='defeated';emit('player-defeated',{zone:state.zoneIndex+1,wave:state.waveIndex+1});}
    }

    function tickPlayer(dt, pressed) {
      const p = state.player, sec = dt / 1000;
      const previousX=p.x,previousLane=p.laneY;
      if(p.hitFeedback){p.hitFeedback.ageMs+=dt;if(p.hitFeedback.ageMs>=p.hitFeedback.lifeMs)p.hitFeedback=null;}
      for (const timer of ['hurtMs', 'invulnerableMs', 'parryMs', 'counterMs',
        'comboMs', 'throwMs', 'throwCooldownMs']) p[timer] = Math.max(0, p[timer] - dt);
      for(const kind of ['overdrive','barrier','impact']){const key=kind+'Ms',before=p.powerups[key];
        p.powerups[key]=Math.max(0,before-dt);if(before&&!p.powerups[key]){if(kind==='barrier')p.powerups.barrierCharges=0;emit('powerup-expired',{kind});}}
      if (!p.comboMs && !p.attack) p.comboNext = 1;
      p.guarding = input.guard.held && !p.attack && !p.throwMs && !holding() && !p.hurtMs && p.elevation === 0;
      if (pressed.guard && p.guarding) p.parryMs = C.parryMs;
      if (!p.guarding) p.parryMs = 0;
      for(const tap of pressed.moveTaps){
        if(p.lastTapDirection===tap&&state.elapsedMs-p.lastTapMs<=C.runTapMs)p.runDirection=tap;
        else p.runDirection=0;
        p.lastTapDirection=tap;p.lastTapMs=state.elapsedMs;
      }
      const running=!p.guarding&&!holding()&&!p.attack&&!p.throwMs&&!p.hurtMs&&!p.elevation&&
        (input.run.held&&Math.hypot(input.move_x,input.move_y)>.45||Math.abs(input.move_x)>.45&&p.runDirection===Math.sign(input.move_x));
      if(running&&!p.running)emit('run-start',{direction:Math.sign(input.move_x),x:p.x,laneY:p.laneY});
      if(!running&&p.running)stopRun('input');p.running=!!running;
      if(!input.move_x)p.runDirection=0;
      if (!p.attack && !p.throwMs && !heldEnemy() && !p.hurtMs && input.move_x) p.facing = Math.sign(input.move_x);
      if(p.carry&&!p.carry.released)p.carry.facing=p.facing;
      if (pressed.jump && !p.attack && !p.throwMs && !holding() && !p.hurtMs && p.elevation === 0) {
        p.velocityZ = C.jumpSpeed; p.guarding = false; p.parryMs = 0; emit('jump');
      }
      if (pressed.strike && !p.throwMs && !p.hurtMs) {
        if(heldEnemy()){if(!p.attack)startPummel();}
        else if(!p.carry&&!p.attack) startStrike(p.comboMs > 0 ? p.comboNext : 1);
        else if(p.attack&&(strikePhase(p.attack)==='recovery'||impactBufferedStrike&&strikePhase(p.attack)==='active')&&
          p.attack.step<3&&!p.attack.airborne&&!p.attack.counter&&!p.attack.running&&!p.attack.weaponKind)p.queuedStrike=true;
      }
      if (pressed.throw && !p.attack && !p.throwMs && !holding() && !p.hurtMs && !p.throwCooldownMs && p.elevation === 0)beginGrip();
      if(holding()&&!input.throw.held)beginRelease('release');
      if(heldEnemy()&&input.strike.held&&!p.attack)startPummel();
      let mobility = p.hurtMs || p.throwMs ? 0 : p.guarding ? .22 : heldEnemy()?clamp(.62-p.grapple.strength*.0025,.22,.55)
        :p.carry?clamp(.72-p.carry.weight*.003,.38,.6):p.running?C.runMultiplier:1;
      if (p.attack&&!heldEnemy()) mobility = strikePhase(p.attack) === 'recovery' ? .5 : .18;
      if(p.attack?.kind==='pummel')mobility=0;
      const magnitude = Math.max(1, Math.hypot(input.move_x, input.move_y));
      const rootCommit=p.attack?.rule.rootSpeed&&strikePhase(p.attack)!=='recovery';
      const remainingRoot=p.attack?.rule.maxRootShift===undefined?Infinity:Math.max(0,p.attack.rule.maxRootShift-Math.abs(p.attack.rootShift));
      const rootMotion=rootCommit?p.attack.facing*Math.min(p.attack.rule.rootSpeed*sec,remainingRoot):0;
      p.x+=(rootCommit?0:input.move_x/magnitude*C.moveSpeed*mobility*sec)+rootMotion+p.knockbackVx*sec;
      if(rootCommit)p.attack.rootShift+=rootMotion;
      p.laneY = clamp(p.laneY + input.move_y / magnitude * C.laneSpeed * mobility * sec, C.laneMin, C.laneMax);
      p.x = clamp(p.x, ZONES[state.zoneIndex].startX + 40, currentGate());
      p.knockbackVx = toward(p.knockbackVx, 0, 1000 * sec);
      if (p.elevation > 0 || p.velocityZ > 0) {
        p.elevation = Math.max(0, p.elevation + p.velocityZ * sec - .5 * C.gravity * sec * sec);
        p.velocityZ -= C.gravity * sec;
        if (!p.elevation && p.velocityZ < 0) { p.velocityZ = 0; emit('land'); }
      }
      if (p.attack) {
        const attack=p.attack,rule=attack.rule;
        attack.elapsedMs += dt;
        if(attack.kind==='pummel'&&p.grapple){p.grapple.pummelUsedMs=Math.min(C.pummelMaxMs,p.grapple.pummelUsedMs+dt);
          p.grapple.pummelRemainingMs=Math.max(0,C.pummelMaxMs-p.grapple.pummelUsedMs);}
        if(strikePhase(attack)==='active'&&p.elevation<=(rule.hitHeight??C.hitHeight)){
          if(rule.projectile)fireWeapon(attack);
          else if(attack.kind==='pummel'){
            const victim=state.enemies.find(e=>e.id===p.grapple?.targetId);
            if(victim?.hp&&!attack.hitIds.length){attack.hitIds.push(victim.id);damageEnemy(victim,rule.damage,attack.facing,'pummel',0,0);
              if(victim.hp){phase(victim,'grappled');victim.knockbackVx=0;}
              else cancelHolding('defeated');}
          }else{
          if(attack.weaponKind)spendWeapon(attack);
          if(attack.kind==='air-kick')impactPulse(attack);
          for (const e of state.enemies) {
            if (live(e) && !e.grappledBy&&!e.launched&&!e.knockdownMs&&!attack.hitIds.includes(e.id) && forwardContact(p.x,p.x,attack.facing,e,rule.reach,rule.radial) &&
              Math.abs(e.laneY - p.laneY) <= (rule.laneReach??C.laneReach)) {
              attack.hitIds.push(e.id);
              const cause=attack.weaponKind|| (attack.counter?'counter':['air-kick','running-kick','step-strike'].includes(attack.kind)?attack.kind:'strike');
              damageEnemy(e,rule.damage,rule.radial?Math.sign(e.x-p.x)||attack.facing:attack.facing,cause,rule.stunMs|| (attack.step===3||attack.kind==='air-kick'?420:230),
                rule.launch?460:attack.step===3?240:attack.kind==='air-kick'?210:95,!!rule.launch||attack.step===3);
              if(rule.pull&&e.hp&&!e.launched)e.x=toward(e.x,p.x+attack.facing*65,rule.pull);
              if(rule.chain){const next=state.enemies.filter(v=>live(v)&&v.id!==e.id&&!v.grappledBy&&!attack.hitIds.includes(v.id)&&Math.abs(v.x-e.x)<155&&Math.abs(v.laneY-e.laneY)<85)
                .sort((a,b)=>Math.abs(a.x-e.x)-Math.abs(b.x-e.x))[0];if(next){attack.hitIds.push(next.id);damageEnemy(next,7,attack.facing,'shock-baton',650,80);fx('shock-chain',next.x,next.laneY);}}
            }
          }
          for(const prop of state.props){
            const distance=(prop.x-p.x)*attack.facing;
            if(!prop.broken&&!prop.heldBy&&prop.maxHp&&distance>=-12-prop.width/2&&distance<=rule.reach+prop.width/2&&
              Math.abs(prop.laneY-p.laneY)<=(rule.laneReach??C.laneReach)&&!attack.propHitIds.includes(prop.id)){
              attack.propHitIds.push(prop.id);damageProp(prop,rule.damage,attack.weaponKind|| (attack.running?'running-kick':'strike'),attack.facing);
            }
          }
          }
        }
        if (readyAt(attack.elapsedMs, rule.windupMs + rule.activeMs + rule.recoveryMs)) {
          const chainable=attack.step<3&&!attack.airborne&&!attack.counter&&!attack.running&&!attack.weaponKind&&attack.kind!=='pummel',queued=p.queuedStrike&&chainable;
          p.attack = null; p.queuedStrike = false;
          p.comboNext=chainable?attack.step+1:1;
          p.comboMs=chainable?C.comboWindowMs:0;
          if (queued) startStrike(attack.step + 1);
        }
      }
      if(p.grapple){
        const grapple=p.grapple,victim=state.enemies.find(e=>e.id===grapple.targetId);
        if(!grapple.released&&victim?.hp){
          grapple.elapsedMs=Math.min(grapple.maxHoldMs,grapple.elapsedMs+dt);grapple.remainingMs=Math.max(0,grapple.maxHoldMs-grapple.elapsedMs);
          victim.x=toward(victim.x,p.x+grapple.facing*52,180*sec);
          victim.laneY=toward(victim.laneY,p.laneY,160*sec);
          if(!grapple.remainingMs)beginRelease('strength-limit');
        }
        if(grapple.released){grapple.releaseElapsedMs+=dt;
          if(!grapple.thrown&&readyAt(grapple.releaseElapsedMs,C.throwReleaseMs)){
            grapple.thrown=true;if(victim)victim.grappledBy=null;
            if(victim?.hp){
            damageEnemy(victim,C.throwDamage,grapple.facing,'throw',720,530,true);
            emit('throw-release',{id:victim.id,facing:grapple.facing,damage:C.throwDamage});}
          }
          if(readyAt(grapple.releaseElapsedMs,C.throwCommitMs)){p.grapple=null;p.throwMs=0;}
        }
      }
      if(p.carry){const carry=p.carry,prop=state.props.find(item=>item.id===carry.id);
        if(prop&&!carry.released){carry.elapsedMs+=dt;prop.x=p.x+carry.facing*C.carryForward;prop.laneY=p.laneY;prop.elevation=C.carryElevation;}
        if(carry.released){carry.releaseElapsedMs+=dt;
          if(prop&&!carry.thrown&&readyAt(carry.releaseElapsedMs,C.throwReleaseMs)){
            carry.thrown=true;prop.heldBy=null;prop.launched=true;prop.launchAgeMs=0;prop.bodyHitIds=[];
            prop.x=p.x+carry.facing*C.propReleaseForward;prop.laneY=p.laneY;
            prop.velocityZ=260;prop.knockbackVx=carry.facing*(580-carry.weight*2);prop.elevation=C.propReleaseElevation;
            emit('prop-throw',{id:prop.id,kind:prop.kind,weight:prop.weight,x:prop.x,laneY:prop.laneY,direction:carry.facing});}
          if(readyAt(carry.releaseElapsedMs,C.throwCommitMs)){p.carry=null;p.throwMs=0;}}
      }
      p.vx=(p.x-previousX)/sec;p.laneVelocity=(p.laneY-previousLane)/sec;
      p.travelDistance+=Math.hypot(p.x-previousX,(p.laneY-previousLane)*.75);
      trackMotion(p,dt);
      if(p.motionMoving&&!state.playerWasMoving)emit('player-move',{id:'mac',x:p.x,laneY:p.laneY});
      state.playerWasMoving=p.motionMoving;
      for(const pickup of state.pickups){
        if(pickup.kind!=='weapon'&&!pickup.collected&&pickup.zoneId===ZONES[state.zoneIndex].id&&(pickup.kind!=='health'||p.hp<p.maxHp)&&!p.elevation&&
          Math.abs(pickup.x-p.x)<=C.pickupReach&&Math.abs(pickup.laneY-p.laneY)<=55){
          let heal=0;if(pickup.kind==='health'){heal=Math.min(C.pickupHeal,p.maxHp-p.hp);p.hp+=heal;}
          else{const kind=pickup.kind,key=kind+'Ms';p.powerups[key]=C[key];if(kind==='barrier')p.powerups.barrierCharges=3;
            emit('powerup',{id:pickup.id,kind,durationMs:C[key],charges:kind==='barrier'?3:null,x:pickup.x,laneY:pickup.laneY});}
          pickup.collected=true;
          emit('pickup',{id:pickup.id,kind:pickup.kind,x:pickup.x,laneY:pickup.laneY,heal,hp:p.hp});
        }
      }
      state.pickups=state.pickups.filter(pickup=>!pickup.collected);
    }
    function attackSpec(e){
      const rule=ROLES[e.kind],p=state.player,gap=Math.abs(p.x-e.x),alternate=e.attackCount%2===1;
      const base={...rule,guardable:rule.attackType!=='ground-wave',canJump:true,laneReach:C.laneReach,tactic:rule.attackType};
      if(!rule.boss){
        if(e.kind==='chitin_scuttler'&&(alternate||e.attackCount>0&&gap>150))
          return {...base,attackType:'rush-jab',tactic:'feint-and-rush',distance:220,tellMs:640,
            activeMs:310,recoverMs:800,reach:55,chargeSpeed:360,damage:11,tell:'Low feint, then a straight rush'};
        if(e.kind==='psion_lancer'&&(alternate||gap<120&&p.guarding))
          return {...base,attackType:'lancer-sweep',tactic:'wide-sweep',distance:135,tellMs:820,
            activeMs:190,recoverMs:1050,reach:145,laneReach:65,damage:11,tell:'Spear lowered across the lane'};
        if(e.kind==='bile_spitter'&&(alternate||p.guarding))
          return {...base,attackType:'bile-spread',tactic:'spread-and-recoil',tellMs:1100,
            activeMs:160,recoverMs:1250,damage:8,recoilSpeed:90,tell:'Three throat sacs swelling'};
        if(e.kind==='bile_spitter')return {...base,tactic:'glob-and-recoil',recoilSpeed:90};
        if(e.kind==='prism_guard'&&(alternate||e.shieldBrokenMs>0||p.guarding))
          return {...base,attackType:'shield-heavy',tactic:'overhead-pressure',distance:110,tellMs:1150,
            activeMs:240,recoverMs:1300,reach:132,laneReach:52,damage:17,guardable:false,
            tell:'Shield overhead; jump or leave the lane'};
        if(e.kind==='prism_guard')return {...base,tactic:'shield-bash',chargeSpeed:145};
        if(e.kind==='rift_stalker'&&(alternate||p.guarding))
          return {...base,attackType:'retreat-slash',tactic:'backstep-ambush',distance:110,tellMs:800,
            activeMs:380,recoverMs:950,reach:105,damage:13,recoilSpeed:75,tell:'Backstep marked, then a returning slash'};
        if(e.kind==='shock_mantid'&&(alternate||gap<135))
          return {...base,attackType:'mantid-leap',tactic:'leaping-strike',distance:235,tellMs:1050,
            activeMs:500,recoverMs:1250,reach:75,damage:15,guardable:true,canJump:false,hitHeight:150,
            tell:'Mantid crouches; guard or change lane'};
        return base;
      }
      const patterns=e.bossPhase===1?['cleave']:e.bossPhase===2?['charge','fan','cleave']:['ground-wave','fan','charge','cleave'];
      const type=patterns[e.attackCount%patterns.length],shared={...base,attackType:type,tactic:'regent-'+type,guardable:type!=='ground-wave'};
      if(type==='charge')return {...shared,distance:260,tellMs:1100,activeMs:440,recoverMs:1500,reach:60,chargeSpeed:660,damage:19,tell:'Regent charge line locked'};
      if(type==='fan')return {...shared,distance:310,tellMs:1200,activeMs:180,recoverMs:1600,projectileSpeed:350,damage:13,tell:'Three relay bolts charging'};
      if(type==='ground-wave')return {...shared,distance:240,tellMs:1250,activeMs:180,recoverMs:1700,projectileSpeed:340,damage:18,tell:'Plaza shock line; jump or leave the lane'};
      return {...shared,tellMs:e.bossPhase===3?950:1000,recoverMs:e.bossPhase===3?1350:1250,tell:'Four-arm cleave drawn back'};
    }
    function attackResponse(spec){
      return spec.guardable===false?'Jump or change lane':spec.canJump===false?'Guard or change lane'
        :['fan','bile-spread'].includes(spec.attackType)?'Guard, jump or find a gap':'Parry, jump or change lane';
    }
    function canBeginTell(e){return state.elapsedMs>=e.nextTellAtMs&&state.elapsedMs-state.lastEnemyTellMs+1e-7>=C.tellSpacingMs;}
    function beginTell(e,spec){
      const later=state.zoneIndex>=2&&!ROLES[e.kind].boss;
      spec={...spec,recoverMs:Math.round(spec.recoverMs*(later?C.laterRecoveryMultiplier:1)),
        damage:spec.damage+(later?(state.zoneIndex>=4?2:1):0),response:attackResponse(spec)};
      phase(e,'windup');e.attackDone=false;e.attackSpawned=false;e.attackSpec=spec;state.lastEnemyTellMs=state.elapsedMs;
      e.rangedRetreatMs=0;
      e.tactic=spec.tactic;
      e.attackLaneY=e.laneY;e.attackFacing=e.facing;e.attackOriginX=e.x;
      const z=ZONES[state.zoneIndex],targetOffset=spec.attackType==='mantid-leap'?0:85;
      e.attackTargetX=clamp(state.player.x+e.facing*targetOffset,z.startX+60,z.endX-60);
      emit('enemy-tell',{id:e.id,kind:e.kind,attackType:spec.attackType,label:spec.tell,tellMs:spec.tellMs,
        laneY:e.attackLaneY,facing:e.attackFacing,originX:e.attackOriginX,targetX:e.attackTargetX,
        guardable:spec.guardable,canJump:spec.canJump,bossPhase:e.bossPhase,tactic:spec.tactic,response:spec.response});
    }
    function addProjectile(e,spec,laneOffset=0,facing=e.attackFacing){
      const spread=['fan','bile-spread'].includes(spec.attackType);
      const center=spread?clamp(e.attackLaneY,C.laneMin+64,C.laneMax-64):e.attackLaneY;
      const laneY=clamp(center+laneOffset,C.laneMin,C.laneMax);
      state.projectiles.push({id:state.nextProjectileId++,ownerId:e.id,kind:spec.attackType,
        x:e.x+facing*28,laneY,
        facing,vx:facing*spec.projectileSpeed,ageMs:0,lifeMs:2600,damage:spec.damage,guardable:spec.guardable,
        width:spec.attackType==='ground-wave'?44:22,laneReach:spec.attackType==='ground-wave'?48:23,
        color:['bile','bile-spread'].includes(spec.attackType)?BLOOD.green:BLOOD.purple});
      if(state.projectiles.length>C.maxProjectiles)state.projectiles.shift();
      emit('enemy-projectile',{id:e.id,kind:e.kind,attackType:spec.attackType,laneY});
    }
    function enemyAnim(e){
      return e.hp<=0?'defeat':['stunned','grappled','launched','knockdown'].includes(e.phase)?'hurt':e.phase==='windup'?'tell'
        :e.phase==='active'?'attack':e.phase==='recovery'?'recover':e.phase==='approach'?'walk':'idle';
    }
    function ranged(e){return e.kind==='bile_spitter'||e.kind==='shock_mantid'&&
      (['windup','active'].includes(e.phase)?e.attackSpec:attackSpec(e)).attackType==='ground-wave';}
    function melee(e){return !ROLES[e.kind].boss&&!ranged(e);}
    function attackLeaders(){
      return state.enemies.filter(e=>live(e)&&melee(e)&&e.phase==='approach'&&state.elapsedMs>=e.nextTellAtMs)
        .sort((a,b)=>a.attackCount-b.attackCount||Math.abs(a.x-state.player.x)-Math.abs(b.x-state.player.x)||a.slot-b.slot);
    }
    function streetPosition(e,spec,sec){
      const p=state.player,z=ZONES[state.zoneIndex],gap=Math.abs(p.x-e.x),isRanged=ranged(e);
      const pace=state.zoneIndex>=2?C.laterApproachMultiplier:1;
      e.facing=Math.sign(p.x-e.x)||e.facing;
      if(state.elapsedMs<e.nextTellAtMs){e.tactic='recover-stance';return false;}
      if(isRanged){
        const atEdge=e.x<=z.startX+62||e.x>=z.endX-62,retreat=e.kind==='bile_spitter'&&gap<250&&e.rangedRetreatMs<650&&!atEdge;
        e.tactic=retreat?'ranged-retreat':e.kind==='shock_mantid'?'pulse-line':'ranged-line';
        e.laneY=toward(e.laneY,p.laneY,spec.laneSpeed*pace*sec);
        if(retreat){e.rangedRetreatMs+=sec*1000;e.x=clamp(e.x-e.facing*spec.speed*pace*sec,z.startX+60,z.endX-60);}
        else if(gap>spec.distance)e.x+=e.facing*Math.min(spec.speed*pace*sec,gap-spec.distance);
        // A formation's torso clearance can leave the rear gunner a few pixels
        // outside its preferred spot. It still fires; spacing never idles it.
        return !retreat&&gap<=spec.distance+C.bodySpacingPad+1&&Math.abs(e.laneY-p.laneY)<=24;
      }
      const committed=state.enemies.filter(other=>other.id!==e.id&&live(other)&&melee(other)&&['windup','active'].includes(other.phase));
      const leaders=attackLeaders(),rank=leaders.findIndex(other=>other.id===e.id),budget=state.zoneIndex<2?1:2;
      const canCommit=rank>=0&&rank<budget-committed.length;
      const offset=e.slot%2?62:-62;
      let side=e.kind==='rift_stalker'?-p.facing:e.slot%2?-p.facing:(Math.sign(e.x-p.x)||p.facing);
      if(canCommit&&committed.length)side=-(Math.sign(committed[0].attackOriginX-p.x)||side);
      else if(canCommit&&rank===1){const first=leaders[0];side=first.kind==='rift_stalker'?p.facing:-(Math.sign(first.x-p.x)||p.facing);}
      const reserveDistance=e.kind==='psion_lancer'?190:e.kind==='chitin_scuttler'?130:150;
      let targetX=p.x+side*(canCommit?spec.distance:reserveDistance),targetLane=canCommit?p.laneY:clamp(p.laneY+offset,C.laneMin,C.laneMax);
      e.tactic=canCommit?e.kind==='psion_lancer'?'spear-line':e.kind==='rift_stalker'?'flank-pressure':'pressure'
        :e.kind==='rift_stalker'||e.slot%2?'flank':'circle';
      if(!canCommit&&e.kind==='prism_guard'){
        const spitter=state.enemies.find(other=>live(other)&&ranged(other));
        if(spitter){targetX=p.x+(spitter.x-p.x)*.5;targetLane=spitter.laneY;e.tactic='protect-spitter';}
      }
      e.x=toward(e.x,clamp(targetX,z.startX+60,z.endX-60),spec.speed*pace*sec);
      e.laneY=toward(e.laneY,targetLane,spec.laneSpeed*pace*sec);e.facing=Math.sign(p.x-e.x)||e.facing;
      return canCommit&&Math.abs(e.x-p.x)<=spec.distance+1&&Math.abs(e.laneY-p.laneY)<=24;
    }
    function tickEnemy(e,dt,before){
      const sec=dt/1000,previousX=before?.x??e.x,previousLane=before?.laneY??e.laneY;e.ageMs+=dt;e.animAgeMs+=dt;
      if(e.launched){
        const z=ZONES[state.zoneIndex];e.launchAgeMs+=dt;
        e.x=clamp(e.x+e.knockbackVx*sec,z.startX+60,z.endX-60);
        e.elevation=Math.max(0,e.elevation+e.velocityZ*sec-.5*C.launchGravity*sec*sec);
        e.velocityZ-=C.launchGravity*sec;e.knockbackVx=toward(e.knockbackVx,0,140*sec);
        if(!e.elevation&&e.velocityZ<0){
          e.launched=false;e.velocityZ=0;e.knockdownMs=C.knockdownMs;e.knockdownAgeMs=0;e.knockbackVx=0;
          phase(e,e.hp?'knockdown':'defeated');
          emit('body-land',{id:e.id,kind:e.kind,x:e.x,laneY:e.laneY,bloodColor:e.bloodColor});
        }
        e.vx=(e.x-previousX)/sec;e.laneVelocity=0;trackMotion(e,dt);e.animAction=enemyAnim(e);return;
      }
      if(e.knockdownMs>0){
        e.knockdownMs=Math.max(0,e.knockdownMs-dt);e.knockdownAgeMs+=dt;e.vx=0;e.laneVelocity=0;
        if(!e.knockdownMs&&e.hp)phase(e,'approach');
        trackMotion(e,dt);e.animAction=enemyAnim(e);return;
      }
      if(!(e.phase==='active'&&e.attackSpec?.attackType==='mantid-leap'))e.elevation=Math.max(0,e.elevation-450*sec);
      e.flashMs=Math.max(0,e.flashMs-dt);e.shieldBrokenMs=Math.max(0,e.shieldBrokenMs-dt);
      if(e.hitFeedback){e.hitFeedback.ageMs+=dt;if(e.hitFeedback.ageMs>=e.hitFeedback.lifeMs)e.hitFeedback=null;}
      if(!live(e)){e.vx=0;e.laneVelocity=0;trackMotion(e,dt);e.animAction=enemyAnim(e);return;}
      const p=state.player,z=ZONES[state.zoneIndex];
      e.x=clamp(e.x+e.knockbackVx*sec,z.startX+60,z.endX-60);
      e.knockbackVx=toward(e.knockbackVx,0,900*sec);e.phaseMs+=dt;
      if(e.phase==='stunned'){
        if(readyAt(e.phaseMs,e.stunMs))phase(e,ROLES[e.kind].boss&&state.elapsedMs<e.punishUntilMs?'recovery':'approach');
      }
      else if(e.phase==='recovery'){
        if(e.attackSpec?.recoilSpeed&&e.phaseMs<400)e.x=clamp(e.x-e.attackFacing*e.attackSpec.recoilSpeed*sec,z.startX+60,z.endX-60);
        if(ROLES[e.kind].boss?state.elapsedMs+1e-7>=e.punishUntilMs
          :readyAt(e.phaseMs,e.attackSpec?.recoverMs||ROLES[e.kind].recoverMs))phase(e,'approach');
      }
      else if(e.phase==='approach'){
        const spec=attackSpec(e);e.tactic=spec.tactic;e.facing=Math.sign(p.x-e.x)||e.facing;
        if(!ROLES[e.kind].boss){if(streetPosition(e,spec,sec)&&canBeginTell(e))beginTell(e,spec);}
        else{
          e.laneY=toward(e.laneY,p.laneY,spec.laneSpeed*sec);
          const gap=Math.abs(p.x-e.x);
          if(gap>spec.distance)e.x+=e.facing*Math.min(spec.speed*sec,gap-spec.distance);
          if(gap<=spec.distance+1&&Math.abs(e.laneY-p.laneY)<=24&&canBeginTell(e))beginTell(e,spec);
        }
      }else if(e.phase==='windup'){
        // Locked aim, lane and published duration never track Mac during a tell.
        if(e.attackSpec.attackType==='rush-jab')e.x=e.attackOriginX-e.attackFacing*24*Math.sin(Math.PI*Math.min(1,e.phaseMs/280));
        if(readyAt(e.phaseMs,e.attackSpec.tellMs)){
          phase(e,'active');e.attackCount++;
          emit('enemy-attack',{id:e.id,kind:e.kind,attackType:e.attackSpec.attackType,bossPhase:e.bossPhase,tactic:e.attackSpec.tactic});
        }
      }else if(e.phase==='active'){
        const spec=e.attackSpec,beforeX=e.x,type=spec.attackType;
        if(['lunge','charge','rush-jab','shield-bash'].includes(type))e.x=clamp(e.x+e.attackFacing*spec.chargeSpeed*sec,z.startX+60,z.endX-60);
        if(type==='rift-cross')e.x=e.attackOriginX+(e.attackTargetX-e.attackOriginX)*Math.min(1,e.phaseMs/spec.activeMs);
        if(type==='retreat-slash'){
          const progress=Math.min(1,e.phaseMs/spec.activeMs),retreat=e.attackOriginX-e.attackFacing*45;
          e.x=progress<.45?e.attackOriginX+(retreat-e.attackOriginX)*(progress/.45)
            :retreat+(e.attackOriginX+e.attackFacing*75-retreat)*((progress-.45)/.55);
        }
        if(type==='mantid-leap'){
          const progress=Math.min(1,e.phaseMs/spec.activeMs);
          e.x=e.attackOriginX+(e.attackTargetX-e.attackOriginX)*progress;e.elevation=Math.sin(Math.PI*progress)*110;
        }
        if(['bile','bile-spread','fan','ground-wave'].includes(type)){
          if(!e.attackSpawned){
            e.attackSpawned=true;if(type==='fan'||type==='bile-spread')for(const offset of [-64,0,64])addProjectile(e,spec,offset);else addProjectile(e,spec);
          }
        }else{
          const swept=['lunge','charge','rush-jab','shield-bash','rift-cross','retreat-slash','mantid-leap'].includes(type);
          const inLane=Math.abs(p.laneY-e.attackLaneY)<=(spec.laneReach??C.laneReach);
          const inReach=forwardContact(e.x,swept?beforeX:e.x,e.attackFacing,p,spec.reach);
          const contactReady=type==='rift-cross'?e.phaseMs>=spec.activeMs*.5
            :type==='retreat-slash'?e.phaseMs>=spec.activeMs*.55:type==='mantid-leap'?e.phaseMs>=spec.activeMs*.65
              :type==='lancer-sweep'?e.phaseMs>=55:type==='shield-heavy'?e.phaseMs>=100:true;
          if(inLane&&inReach&&contactReady)takeHit(e,beforeX,spec);
        }
        if(e.phase==='active'&&readyAt(e.phaseMs,spec.activeMs))phase(e,'recovery');
      }
      e.x=clamp(e.x,z.startX+60,z.endX-60);
      e.vx=(e.x-previousX)/sec;e.laneVelocity=(e.laneY-previousLane)/sec;
      e.travelDistance+=Math.hypot(e.x-previousX,(e.laneY-previousLane)*.75);
      trackMotion(e,dt);
      const anim=enemyAnim(e);if(e.animAction!==anim)e.animAgeMs=0;e.animAction=anim;
    }
    function tickProjectiles(dt){
      const p=state.player,sec=dt/1000,z=ZONES[state.zoneIndex];
      for(const item of state.projectiles){
        const before=item.owner==='player'&&item.firstSweep?item.sweepStartX:item.x;
        item.firstSweep=false;item.x+=item.vx*sec;item.ageMs+=dt;
        if(item.owner==='player'){
          if(item.kind==='plasma-disc'&&item.ageMs>=600){item.returning=true;item.vx=(Math.sign(p.x-item.x)||-item.facing)*520;
            item.laneY=toward(item.laneY,p.laneY,180*sec);
            if(Math.abs(item.x-p.x)<35&&Math.abs(item.laneY-p.laneY)<40)item.ageMs=item.lifeMs;}
          const direction=Math.sign(item.x-before)||item.facing,contacts=[];
          for(const target of state.enemies){
            if(!live(target)||target.grappledBy||target.launched||item.hitIds.includes(target.id))continue;
            if(bodyCenter(target)+body(target).radius>=Math.min(before,item.x)-item.width&&bodyCenter(target)-body(target).radius<=Math.max(before,item.x)+item.width&&Math.abs(target.laneY-item.laneY)<=item.laneReach)
              contacts.push({target,type:'enemy',distance:Math.max(0,(bodyCenter(target)-before)*direction-body(target).radius-item.width)});
          }
          for(const prop of state.props){if(prop.broken||prop.heldBy||!prop.maxHp||prop.zoneId!==z.id||item.propHitIds.includes(prop.id))continue;
            if(prop.x>=Math.min(before,item.x)-prop.width/2&&prop.x<=Math.max(before,item.x)+prop.width/2&&Math.abs(prop.laneY-item.laneY)<=item.laneReach)
              contacts.push({target:prop,type:'prop',distance:Math.max(0,(prop.x-before)*direction-prop.width/2)});}
          contacts.sort((a,b)=>a.distance-b.distance||a.target.id.localeCompare(b.target.id));
          for(const contact of contacts){if(item.hitIds.length+item.propHitIds.length>=item.maxHits)break;
            const target=contact.target;
            if(contact.type==='enemy'){item.hitIds.push(target.id);damageEnemy(target,item.damage,direction,item.weaponKind,320,130);}
            else{item.propHitIds.push(target.id);damageProp(target,item.damage,item.weaponKind,item.facing);}
            if(item.hitIds.length+item.propHitIds.length>=item.maxHits&&item.kind!=='plasma-disc')item.ageMs=item.lifeMs;}
          if(item.x<z.startX+20||item.x>z.endX-20)item.ageMs=item.lifeMs;
          continue;
        }
        const e=state.enemies.find(foe=>foe.id===item.ownerId);
        if(!e||!e.hp){item.ageMs=item.lifeMs;continue;}
        const intersects=bodyCenter(p)+body(p).radius>=Math.min(before,item.x)-item.width&&bodyCenter(p)-body(p).radius<=Math.max(before,item.x)+item.width&&Math.abs(p.laneY-item.laneY)<=item.laneReach;
        if(intersects&&p.elevation>C.hitHeight&&!item.evadedPlayer){
          item.evadedPlayer=true;emit('projectile-evaded',{id:e.id,kind:e.kind,
            attackType:item.kind,elevation:p.elevation});
        }
        if(intersects&&p.elevation<=C.hitHeight){
          const previous=e.attackFacing;e.attackFacing=item.facing;
          takeHit(e,before,item,true);e.attackFacing=previous;item.ageMs=item.lifeMs;
        }
        if(item.x<z.startX+20||item.x>z.endX-20)item.ageMs=item.lifeMs;
      }
      state.projectiles=state.projectiles.filter(item=>item.ageMs<item.lifeMs);
    }
    function tickProps(dt){
      const sec=dt/1000,z=ZONES[state.zoneIndex];
      for(const prop of state.props)if(prop.recoil&&prop.zoneId===z.id){
        const r=prop.recoil;r.ageMs=Math.min(r.lifeMs,r.ageMs+dt);r.remainingMs=Math.max(0,r.lifeMs-r.ageMs);
        if(!r.remainingMs||prop.broken){prop.recoil=null;continue;}
        const t=r.ageMs/r.lifeMs,envelope=(1-t)*(1-t),wave=Math.sin(t*Math.PI*3);
        r.x=r.direction*C.carRecoilX*r.strength*wave*envelope;
        r.elevation=C.carBounceHeight*r.strength*Math.abs(wave)*envelope;
        r.rotation=r.direction*C.carRecoilRotation*r.strength*wave*envelope;
      }
      for(const prop of state.props){if(!prop.launched||prop.broken||prop.zoneId!==z.id)continue;
        const before=prop.x;prop.launchAgeMs+=dt;prop.x=clamp(prop.x+prop.knockbackVx*sec,z.startX+40,z.endX-40);
        prop.elevation=Math.max(0,prop.elevation+prop.velocityZ*sec-.5*C.launchGravity*sec*sec);prop.velocityZ-=C.launchGravity*sec;
        for(const victim of state.enemies){if(!live(victim)||victim.grappledBy||victim.launched||prop.bodyHitIds.includes(victim.id))continue;
          if(victim.x<Math.min(before,prop.x)-prop.width/2||victim.x>Math.max(before,prop.x)+prop.width/2||Math.abs(victim.laneY-prop.laneY)>65)continue;
          prop.bodyHitIds.push(victim.id);const damage=20+Math.round(prop.weight*.15),direction=Math.sign(prop.knockbackVx)||1;
          damageEnemy(victim,damage,direction,'prop-impact',500,180);
          emit('body-impact',{id:prop.id,targetId:victim.id,kind:victim.kind,damage,x:victim.x,laneY:victim.laneY,direction,bloodColor:victim.bloodColor,heavy:true});}
        for(const target of state.props){if(target.id===prop.id||target.broken||target.heldBy||!target.maxHp||target.zoneId!==z.id||prop.bodyHitIds.includes(target.id))continue;
          if(target.x<Math.min(before,prop.x)-(target.width+prop.width)/2||target.x>Math.max(before,prop.x)+(target.width+prop.width)/2||Math.abs(target.laneY-prop.laneY)>65)continue;
          prop.bodyHitIds.push(target.id);damageProp(target,40,'prop-impact',Math.sign(prop.knockbackVx)||1);
          emit('body-impact',{id:prop.id,targetId:target.id,kind:target.kind,damage:40,x:target.x,laneY:target.laneY,heavy:true});}
        if(!prop.elevation&&prop.velocityZ<0){prop.launched=false;prop.velocityZ=0;prop.knockbackVx=0;
          emit('prop-land',{id:prop.id,kind:prop.kind,x:prop.x,laneY:prop.laneY});damageProp(prop,prop.maxHp,'landing');}
      }
    }
    function tickBodies(beforeEnemies){
      for(const body of state.enemies){
        if(!body.launched&&!(body.launchAgeMs>0&&body.knockdownMs===C.knockdownMs))continue;
        const before=beforeEnemies.get(body.id)||body;
        for(const victim of state.enemies){
          if(victim.id===body.id||!live(victim)||victim.launched||victim.phase==='grappled'||body.bodyHitIds.includes(victim.id))continue;
          const victimBefore=beforeEnemies.get(victim.id)||victim;
          const start=before.x-victimBefore.x,end=body.x-victim.x;
          if(Math.min(start,end)>C.bodyRadius||Math.max(start,end)<-C.bodyRadius||
            Math.abs(body.laneY-victim.laneY)>C.bodyLaneReach)continue;
          body.bodyHitIds.push(victim.id);
          const direction=Math.sign(body.x-before.x)||Math.sign(body.knockbackVx)||-body.facing;
          damageEnemy(victim,C.bodyDamage,direction,'body-impact',320,160);
          emit('body-impact',{id:body.id,targetId:victim.id,kind:victim.kind,damage:C.bodyDamage,
            x:victim.x,laneY:victim.laneY,direction,bloodColor:victim.bloodColor,heavy:true});
        }
        for(const prop of state.props){
          if(prop.broken||prop.heldBy||!prop.maxHp||prop.zoneId!==ZONES[state.zoneIndex].id||body.bodyHitIds.includes(prop.id))continue;
          if(prop.x<Math.min(before.x,body.x)-C.bodyRadius-prop.width/2||prop.x>Math.max(before.x,body.x)+C.bodyRadius+prop.width/2||
            Math.abs(prop.laneY-body.laneY)>C.bodyLaneReach)continue;
          body.bodyHitIds.push(prop.id);damageProp(prop,40,'body-impact',Math.sign(body.x-before.x)||Math.sign(body.knockbackVx)||-body.facing);
          emit('body-impact',{id:body.id,targetId:prop.id,kind:prop.kind,damage:40,x:prop.x,laneY:prop.laneY,heavy:true});
        }
      }
    }
    function progression(dt){
      const z=ZONES[state.zoneIndex],p=state.player;
      const entryX=state.waveIndex===1?z.startX+C.advanceEntryOffset:z.entryX;
      if(['entry','advance'].includes(state.waveState)&&p.x>=entryX){
        state.waveState='combat';state.arenaIndex=state.zoneIndex+1;
        state.checkpoint.started=true;state.checkpoint.x=p.x;state.checkpoint.laneY=p.laneY;
        state.checkpoint.props=copy(state.props);state.checkpoint.pickups=copy(state.pickups);state.checkpoint.relay=copy(state.relay);
        state.checkpoint.weapon=copy(p.weapon);state.checkpoint.powerups=copy(p.powerups);
        state.checkpoint.nextPickupId=state.nextPickupId;
        for(const e of state.enemies){phase(e,'approach');emit('enemy-arrive',{id:e.id,kind:e.kind,arena:e.arena,bloodColor:e.bloodColor});}
        if(!state.waveIndex)emit('zone-enter',{zoneId:z.id,name:z.name,index:z.index,arrival:z.arrival});
        emit('wave-start',{zoneId:z.id,zone:z.index,wave:state.waveIndex+1,kinds:state.enemies.map(e=>e.kind)});
      }
      if(state.waveState==='combat'&&state.enemies.every(e=>!e.hp)){
        state.completedWaves++;state.projectiles=[];emit('wave-cleared',{zoneId:z.id,zone:z.index,wave:state.waveIndex+1});
        if(state.waveIndex+1<z.waves.length){state.waveState='intermission';state.waveBreakMs=C.waveBreakMs;}
        else{
          state.waveState='zone-clear';state.clearedZones.push(z.id);p.hp=Math.min(p.maxHp,p.hp+C.zoneHeal);
          emit('zone-cleared',{zoneId:z.id,name:z.name,index:z.index,exit:z.exit,exitX:z.endX,heal:C.zoneHeal});
          if(state.zoneIndex===1&&!state.relay.restored){
            state.relay.available=true;emit('relay-ready',{id:'market-relay',x:state.relay.x,laneY:state.relay.laneY});
          }
          if(state.zoneIndex===ZONES.length-1){state.status='desk-ready';emit('desk-unlocked',{x:C.deskX,entrance:'review-studio'});}
        }
      }
      if(state.waveState==='intermission'){
        state.waveBreakMs=Math.max(0,state.waveBreakMs-dt);
        if(!state.waveBreakMs){
          state.waveIndex++;
          const advancing=p.x<z.startX+C.advanceEntryOffset;
          spawnWave(!advancing);
          if(advancing){state.waveState='advance';emit('street-advance',{zoneId:z.id,x:z.startX+C.advanceEntryOffset,wave:state.waveIndex+1});}
        }
      }else if(state.waveState==='zone-clear'&&state.zoneIndex+1<ZONES.length&&p.x>=ZONES[state.zoneIndex+1].entryX){
        releaseInputs('zone-exit');
        for(const prop of state.props)prop.recoil=null;
        state.zoneIndex++;state.waveIndex=0;spawnWave(true);
        const next=ZONES[state.zoneIndex];emit('zone-enter',{zoneId:next.id,name:next.name,index:next.index,arrival:next.arrival});
      }
    }
    function tick(dt,pressed){
      state.elapsedMs+=dt;
      for(const item of state.hitFx){
        item.ageMs+=dt;
        for(const particle of item.particles){const sec=dt/1000;
          particle.x+=particle.vx*sec;particle.laneY+=particle.laneVelocity*sec;
          particle.elevation=Math.max(0,particle.elevation+particle.velocityZ*sec-.5*900*sec*sec);
          particle.velocityZ-=900*sec;
          if(!particle.elevation){particle.vx*=.8;particle.laneVelocity*=.8;particle.velocityZ=0;}
        }
      }
      state.hitFx=state.hitFx.filter(item=>item.ageMs<item.lifeMs);
      if(state.status==='defeated')return;
      const beforeEnemies=new Map(state.enemies.map(e=>[e.id,{x:e.x,laneY:e.laneY}]));
      tickPlayer(dt,pressed);progression(dt);spaceBodies(dt/2);
      for(const e of state.enemies)tickEnemy(e,dt,beforeEnemies.get(e.id));
      spaceBodies(dt/2);
      tickBodies(beforeEnemies);
      tickProps(dt);
      tickProjectiles(dt);
      const p=state.player,currentMode=mode();
      p.animAgeMs=currentMode===p.animAction?p.animAgeMs+dt:0;p.animAction=currentMode;
      if(state.status!=='defeated')progression(0);
    }

    function update(deltaMs, rawInput) {
      if (rawInput !== undefined) handleInput(rawInput);
      accumulator += clamp(finite(deltaMs), 0, C.maxDeltaMs);
      let count = 0;
      while (readyAt(accumulator, C.stepMs) && count < C.maxSubsteps) {
        if(state.impact.remainingMs>0){
          state.impact.remainingMs=Math.max(0,state.impact.remainingMs-C.stepMs);
          if(!state.impact.remainingMs)state.impact.strength=0;
        }else{
          const pressed = edges;
          edges = {jump: false, strike: false, guard: false, throw: false,moveTaps:[]};
          tick(C.stepMs, pressed);
          impactBufferedStrike=false;
        }
        accumulator = Math.max(0, accumulator - C.stepMs); count++;
      }
      return getSnapshot();
    }
    function mode() {
      const p = state.player;
      return p.hp <= 0 ? 'defeated' : p.hurtMs ? 'hurt' : p.throwMs ? p.carry?'carry-throw':'throw'
        : heldEnemy()?p.attack?.kind==='pummel'?'grab-pummel':'grab-hold':p.carry?'carry'
        : p.attack?.running?'running-kick':p.attack?.weaponKind?p.attack.rule.projectile?p.attack.rule.projectile==='plasma-disc'?'weapon-disc':'weapon-fire':p.attack.rule.launch?'weapon-heavy':'weapon-melee'
        : p.attack ? 'strike' : p.guarding ? Math.hypot(p.vx,p.laneVelocity)>.01?'guard-creep':'guard' : p.elevation > 0 ? 'jump'
        :p.running?'run': input.move_x || input.move_y ? 'walk' : 'idle';
    }
    function animation(e){
      const frames={idle:0,tell:3,attack:4,recover:5,hurt:6,defeat:7};
      const spec=e.attackSpec,duration=e.phase==='windup'?spec?.tellMs:e.phase==='active'?spec?.activeMs
        :e.phase==='recovery'?spec?.recoverMs:e.phase==='stunned'?e.stunMs:e.phase==='knockdown'?C.knockdownMs:0;
      const attackPose=['windup','active','recovery'].includes(e.phase)?spec?.attackType:null;
      return {action:e.animAction,facing:e.facing,ageMs:e.animAgeMs,
        frame:e.animAction==='walk'?1+Math.floor(e.animAgeMs/120)%2:frames[e.animAction]||0,hitFeedback:e.hitFeedback,
        pose:attackPose||e.animAction,phase:e.phase,phaseProgress:duration?clamp(e.phaseMs/duration,0,1):0,
        motion:{vx:e.vx,laneVelocity:e.laneVelocity,speed:Math.hypot(e.vx,e.laneVelocity),
          stridePhase:(e.travelDistance/110)%1,strideRatio:e.strideRatio,
          settleAgeMs:e.settleAgeMs,wasMoving:e.wasMoving,moveAgeMs:e.moveAgeMs,fromMoving:e.fromMoving,
          fromStopAgeMs:e.fromStopAgeMs,fromStridePhase:e.fromStridePhase,fromStrideRatio:e.fromStrideRatio,
          feet:e.feet,elevation:e.elevation,
          attackType:attackPose||null,tactic:e.tactic,grappled:!!e.grappledBy,
          phaseProgress:duration?clamp(e.phaseMs/duration,0,1):0}};
    }
    function getSnapshot(){
      const p=state.player,z=ZONES[state.zoneIndex],rule=p.attack?.rule,attackPhase=p.attack?strikePhase(p.attack):null;
      const attackDuration=rule?rule.windupMs+rule.activeMs+rule.recoveryMs:0;
      const phaseStart=attackPhase==='active'?rule.windupMs:attackPhase==='recovery'?rule.windupMs+rule.activeMs:0;
      const phaseDuration=attackPhase==='windup'?rule.windupMs:attackPhase==='active'?rule.activeMs:rule?.recoveryMs;
      const attack=p.attack?{step:p.attack.step,kind:p.attack.kind,phase:attackPhase,elapsedMs:p.attack.elapsedMs,
        timing:{windupMs:rule.windupMs,activeMs:rule.activeMs,recoveryMs:rule.recoveryMs},
        reach:rule.reach,damage:rule.damage,hitHeight:rule.hitHeight??C.hitHeight,rootShift:p.attack.rootShift,
        facing:p.attack.facing,counter:p.attack.counter,airborne:p.attack.airborne,running:!!p.attack.running,
        maxRootShift:rule.maxRootShift??null,weaponKind:p.attack.weaponKind||null,
        phaseProgress:clamp((p.attack.elapsedMs-phaseStart)/phaseDuration,0,1),
        normalizedProgress:clamp(p.attack.elapsedMs/attackDuration,0,1),remainingMs:Math.max(0,attackDuration-p.attack.elapsedMs)}:null;
      const grapple=p.grapple?{...p.grapple,releaseAgeMs:p.grapple.releaseElapsedMs,
        phase:!p.grapple.released?p.attack?.kind==='pummel'?'pummel':'hold':p.grapple.releaseElapsedMs<280?'release':'recover',
        progress:p.grapple.released?clamp(p.grapple.releaseElapsedMs/C.throwCommitMs,0,1):clamp(p.grapple.elapsedMs/p.grapple.maxHoldMs,0,1)}:null;
      const carry=p.carry?{...p.carry,releaseAgeMs:p.carry.releaseElapsedMs,
        phase:!p.carry.released?'hold':p.carry.releaseElapsedMs<280?'release':'recover',
        progress:p.carry.released?clamp(p.carry.releaseElapsedMs/C.throwCommitMs,0,1):0}:null;
      const boss=state.enemies.find(e=>ROLES[e.kind].boss);
      return copy({version:C.version,lootSeed:state.lootSeed,elapsedMs:state.elapsedMs,status:state.status,kills:state.kills,
        player:{...p,body:BODIES.mac,y:p.laneY,grounded:p.elevation===0&&p.velocityZ===0,mode:mode(),attack,grapple,carry,
          bloodColor:'red',bloodHex:BLOOD.red,
          animation:{action:mode(),pose:attack?.weaponKind?mode():attack?.kind||mode(),weaponKind:p.weapon?.kind||attack?.weaponKind||null,
            phase:attackPhase||grapple?.phase||carry?.phase||mode(),
            phaseProgress:attack?.phaseProgress??grapple?.progress??carry?.progress??0,ageMs:p.animAgeMs,facing:p.facing,frame:Math.floor(p.animAgeMs/120)%2,
            motion:{vx:p.vx,laneVelocity:p.laneVelocity,speed:Math.hypot(p.vx,p.laneVelocity),
              stridePhase:(p.travelDistance/110)%1,strideRatio:p.strideRatio,
              settleAgeMs:p.settleAgeMs,wasMoving:p.wasMoving,moveAgeMs:p.moveAgeMs,fromMoving:p.fromMoving,
              fromStopAgeMs:p.fromStopAgeMs,fromStridePhase:p.fromStridePhase,fromStrideRatio:p.fromStrideRatio,
              feet:p.feet,elevation:p.elevation,velocityZ:p.velocityZ,
              attackType:attack?.kind||null,rootShift:attack?.rootShift||0,
              phaseProgress:attack?.phaseProgress??grapple?.progress??0,guarding:p.guarding,
              hurtProgress:p.hitFeedback?clamp(p.hitFeedback.ageMs/p.hitFeedback.lifeMs,0,1):0}}},
        enemies:state.enemies.map(e=>({...e,body:BODIES[e.kind],y:e.laneY,tellMs:(e.attackSpec||attackSpec(e)).tellMs,
          attackReach:(e.attackSpec||attackSpec(e)).reach,warning:e.phase==='windup',active:e.phase==='active',
          shielded:e.kind==='prism_guard'&&!e.shieldBrokenMs,animFrame:animation(e).frame,animation:animation(e),
          attackTell:e.phase==='windup'?{type:e.attackSpec.attackType,label:e.attackSpec.tell,
            remainingMs:Math.max(0,e.attackSpec.tellMs-e.phaseMs),durationMs:e.attackSpec.tellMs,
            laneY:e.attackLaneY,facing:e.attackFacing,originX:e.attackOriginX,targetX:e.attackTargetX,
            range:e.attackSpec.reach,laneReach:e.attackSpec.laneReach,guardable:e.attackSpec.guardable,
            lanes:['fan','bile-spread'].includes(e.attackSpec.attackType)?[-64,0,64].map(offset=>clamp(e.attackLaneY,C.laneMin+64,C.laneMax-64)+offset):[e.attackLaneY],
            canJump:e.attackSpec.canJump,tactic:e.attackSpec.tactic,response:e.attackSpec.response}:null,
          punishRemainingMs:ROLES[e.kind].boss?Math.max(0,e.punishUntilMs-state.elapsedMs):0})),
        projectiles:state.projectiles,hitFx:state.hitFx,impact:state.impact,
        props:state.props.filter(prop=>prop.zoneId===z.id),pickups:state.pickups.filter(pickup=>pickup.zoneId===z.id),relay:state.relay,
        arena:{index:state.arenaIndex,gateX:currentGate(),active:state.enemies.some(e=>live(e)),remaining:state.enemies.filter(e=>e.hp>0).length},
        city:{worldWidth:C.worldWidth,zoneCount:ZONES.length,totalWaves:C.totalWaves,totalEnemies:C.totalEnemies,
          completedWaves:state.completedWaves,clearedZones:state.clearedZones,progress:state.completedWaves/C.totalWaves,complete:state.status==='desk-ready'},
        zones:ZONES.map(item=>({...item,cleared:state.clearedZones.includes(item.id)})),
        zone:{...z,title:z.name,cleared:state.clearedZones.includes(z.id),exitLabel:z.exit,
          wave:state.waveIndex+1,waveCount:z.waves.length,state:state.waveState,waveBreakMs:state.waveBreakMs,
          advanceX:state.waveState==='advance'?z.startX+C.advanceEntryOffset:null,
          encounter:{...ENCOUNTERS[state.zoneIndex][state.waveIndex],advanceX:z.startX+C.advanceEntryOffset},
          exitX:z.endX,walkToExit:state.waveState==='zone-clear',roomBounds:{minX:z.startX+40,maxX:currentGate(),laneMin:C.laneMin,laneMax:C.laneMax}},
        wave:{index:state.waveIndex+1,number:state.waveIndex+1,total:z.waves.length,
          state:state.waveState,kinds:z.waves[state.waveIndex],remaining:state.enemies.filter(e=>e.hp>0).length},
        checkpoint:{...state.checkpoint,zoneId:ZONES[state.checkpoint.zoneIndex].id,zone:state.checkpoint.zoneIndex+1,wave:state.checkpoint.waveIndex+1},
        camera:{minX:z.startX,maxX:Math.max(z.startX,currentGate()-1400),targetX:p.x},
        boss:boss?{id:boss.id,kind:boss.kind,hp:boss.hp,maxHp:boss.maxHp,phase:boss.bossPhase,
          phaseName:BOSS_PHASES[boss.bossPhase],window:boss.hp===0?'defeated':boss.phase==='windup'?'warning'
            :boss.phase==='active'?'committed':boss.punishUntilMs>state.elapsedMs?'punish':'approach',
          punishRemainingMs:boss.hp?Math.max(0,boss.punishUntilMs-state.elapsedMs):0,
          attackType:boss.attackSpec?.attackType||null,warning:boss.phase==='windup',defeated:boss.hp===0,bloodColor:boss.bloodColor}:null,
        desk:{x:C.deskX,unlocked:state.status==='desk-ready',entrance:'review-studio'}});
    }

    function getControlState() {
      const p = state.player, alive = p.hp > 0, busy = !!(p.attack || p.throwMs || p.hurtMs||holding());
      const target = gripTarget(),grip=p.grapple||p.carry;
      const nextStep=p.attack?p.attack.step+1:p.comboMs>0?p.comboNext:1;
      return {
        interactAvailable:canInteract(),interactLabel:'Restore relay',
        move: {enabled: alive, held: !!(input.move_x || input.move_y),running:p.running},
        jump: {label: 'Jump', enabled: alive, ready: alive && !busy && p.elevation === 0, held: input.jump.held},
        strike: {label:heldEnemy()?'Pummel':p.counterMs>0?'Counter':p.elevation>0||p.velocityZ>0?'Air Kick':p.running||p.attack?.running?'Run Kick':p.weapon?.name|| (nextStep===1&&Math.abs(input.move_x)>.45?'Step Strike':'Strike'),enabled:alive&&!p.carry,
          ready: alive && !p.throwMs && !p.carry && !p.hurtMs && (heldEnemy()?p.grapple.pummelRemainingMs>=245&&!p.attack:(!p.attack ||
            strikePhase(p.attack)==='recovery'&&p.attack.step<3&&!p.attack.airborne&&!p.attack.counter&&!p.attack.running&&!p.attack.weaponKind)),held:input.strike.held},
        guard: {label: 'Guard', enabled: alive, ready: alive && !busy && p.elevation === 0,
          held: input.guard.held, parryMs: p.parryMs, counterMs: p.counterMs},
        throw: {label:holding()?'Throw':target?.type==='enemy'?'Grab':target?.type==='prop'?'Lift':target?.type==='weapon'?'Pick up':'Grab', enabled: alive && (!!target||!!grip),
          ready: alive && !!target && !busy && !p.throwCooldownMs && p.elevation === 0,
          targetId: grip?.targetId||grip?.id||target?.item.id||null,targetType:p.grapple?'enemy':p.carry?'prop':target?.type||null,
          holding:!!holding(),holdRemainingMs:p.grapple?.remainingMs??null,held: input.throw.held, cooldownMs: p.throwCooldownMs},
        retry: {label: 'Retry wave', enabled: !alive, ready: !alive}
      };
    }
    function retry(){
      const cp=copy(state.checkpoint),lootSeed=state.lootSeed;state=initialState(lootSeed);
      state.zoneIndex=cp.zoneIndex;state.waveIndex=cp.waveIndex;state.kills=cp.kills;
      state.completedWaves=cp.completedWaves;state.clearedZones=cp.clearedZones;
      if(cp.props)state.props=copy(cp.props);if(cp.pickups)state.pickups=copy(cp.pickups);if(cp.relay)state.relay=copy(cp.relay);
      for(const prop of state.props)prop.recoil=null;
      if(cp.weapon)state.player.weapon=copy(cp.weapon);if(cp.powerups)state.player.powerups=copy(cp.powerups);
      if(cp.nextPickupId)state.nextPickupId=cp.nextPickupId;
      state.player.x=cp.x;state.player.laneY=cp.laneY;accumulator=0;
      input={move_x:0,move_y:0,jump:{held:false},strike:{held:false},guard:{held:false},throw:{held:false},run:{held:false}};
      edges={jump:false,strike:false,guard:false,throw:false,moveTaps:[]};impactBufferedStrike=false;spawnWave(cp.started);
      if(!cp.started&&cp.waveIndex===1)state.waveState='advance';
      state.events=[];
      return getSnapshot();
    }

    function drainEvents() { const events = copy(state.events); state.events.length = 0; return events; }
    function canInteract(){
      const p=state.player,r=state.relay;
      return state.zoneIndex===1&&r.available&&!r.restored&&p.hp>0&&!p.attack&&!p.throwMs&&!holding()&&!p.hurtMs&&
        !p.elevation&&!state.impact.remainingMs&&Math.abs(p.x-r.x)<=110&&Math.abs(p.laneY-r.laneY)<=65;
    }
    function interact(){
      if(!canInteract())return false;
      state.relay.restored=true;state.relay.available=false;
      emit('relay-restored',{id:'market-relay',x:state.relay.x,laneY:state.relay.laneY});return true;
    }
    return {handleInput, update, getSnapshot, getControlState, retry, drainEvents,interact,releaseInputs};
  }
  B.MacStreetCombat={create,constants:C,strikes:STRIKES,attacks:ATTACKS,weapons:WEAPONS,roles:ROLES,tactics:TACTICS,zones:ZONES,props:STREET_PROPS,
    encounters:ENCOUNTERS,bossPhases:BOSS_PHASES,lootLayout,defaultLootSeed:DEFAULT_LOOT_SEED};
})(window.BARCODE = window.BARCODE || {});
