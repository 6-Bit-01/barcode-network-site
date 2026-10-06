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
  // guard/throw as {pressed, held}. Press edges survive until a simulation step.
  // Holding Strike/Throw never repeats them. Guard's parry is a fresh hold edge,
  // not a repeated pressed flag while held. y/laneY is the feet's ground plane;
  // elevation is a separate positive height, so drawing feet uses y-elevation.
  const C = Object.freeze({
    version:2,worldWidth:20400,zoneWidth:3400,laneMin:780,laneMax:970,
    startX:200,startLaneY:880,deskX:20100,
    stepMs:1000/120,maxDeltaMs:100,maxSubsteps:12,
    maxEnemies:3,totalEnemies:30,totalWaves:12,maxProjectiles:18,
    maxHitFx:24,maxEvents:64,waveBreakMs:1250,
    playerHp:100,zoneHeal:28,moveSpeed:260,laneSpeed:180,
    jumpSpeed:560,gravity:1500,hitHeight:62,laneReach:40,parryMs:125,counterMs:800,
    playerInvulnerableMs:720,playerHurtMs:220,comboWindowMs:360,
    throwReach:74,throwDamage:28,throwCommitMs:360,throwCooldownMs:650
  });
  const STRIKES = Object.freeze([
    Object.freeze({windupMs: 90, activeMs: 80, recoveryMs: 155, reach: 90, damage: 12}),
    Object.freeze({windupMs: 100, activeMs: 80, recoveryMs: 175, reach: 96, damage: 14}),
    Object.freeze({windupMs: 130, activeMs: 105, recoveryMs: 240, reach: 112, damage: 20})
  ]);
  const ROLES = Object.freeze({
    chitin_scuttler:Object.freeze({name:'Chitin Scuttler',bloodColor:'green',hp:42,speed:155,laneSpeed:105,distance:72,tellMs:480,activeMs:110,recoverMs:600,reach:98,damage:9,attackType:'jab',tell:'Claws drawn back'}),
    psion_lancer:Object.freeze({name:'Psion Lancer',bloodColor:'purple',hp:58,speed:106,laneSpeed:70,distance:220,tellMs:900,activeMs:420,recoverMs:920,reach:45,damage:15,chargeSpeed:650,attackType:'lunge',tell:'Spear line locked'}),
    bile_spitter:Object.freeze({name:'Bile Spitter',bloodColor:'green',hp:40,speed:96,laneSpeed:75,distance:330,tellMs:950,activeMs:140,recoverMs:1100,reach:30,damage:11,projectileSpeed:390,attackType:'bile',tell:'Throat sac swelling'}),
    prism_guard:Object.freeze({name:'Prism Guard',bloodColor:'purple',hp:72,speed:82,laneSpeed:65,distance:85,tellMs:850,activeMs:140,recoverMs:980,reach:120,damage:14,shieldReduction:.7,attackType:'shield-bash',tell:'Shield raised; counter or throw breaks it'}),
    rift_stalker:Object.freeze({name:'Rift Stalker',bloodColor:'purple',hp:48,speed:136,laneSpeed:115,distance:145,tellMs:760,activeMs:360,recoverMs:900,reach:48,damage:12,attackType:'rift-cross',tell:'Flank crossing marked'}),
    shock_mantid:Object.freeze({name:'Shock Mantid',bloodColor:'green',hp:64,speed:88,laneSpeed:60,distance:235,tellMs:1050,activeMs:180,recoverMs:1250,reach:30,damage:14,projectileSpeed:320,attackType:'ground-wave',tell:'Ground pulse charging; jump or change lane'}),
    null_regent:Object.freeze({name:'Null Regent',bloodColor:'purple',hp:300,speed:94,laneSpeed:78,distance:112,tellMs:1000,activeMs:160,recoverMs:1150,reach:158,damage:17,attackType:'cleave',tell:'Four arms drawn wide',boss:true})
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
  const BLOOD=Object.freeze({green:'#78ea68',purple:'#b374ed'});

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  const copy = v => JSON.parse(JSON.stringify(v));
  const toward = (value, target, distance) => value + clamp(target - value, -distance, distance);
  const action = v => typeof v === 'boolean' ? {pressed: false, held: v}
    : {pressed: !!v?.pressed, held: !!v?.held};
  const readyAt = (value, duration) => value + 1e-7 >= duration;

  function initialState(){
    return {elapsedMs:0,status:'active',kills:0,zoneIndex:0,waveIndex:0,arenaIndex:0,
      completedWaves:0,clearedZones:[],waveState:'entry',waveBreakMs:0,
      player:{x:C.startX,laneY:C.startLaneY,elevation:0,velocityZ:0,facing:1,
        hp:C.playerHp,maxHp:C.playerHp,attack:null,comboNext:1,comboMs:0,queuedStrike:false,
        guarding:false,parryMs:0,counterMs:0,hurtMs:0,invulnerableMs:0,knockbackVx:0,
        throwMs:0,throwCooldownMs:0,animAction:'idle',animAgeMs:0},
      enemies:[],projectiles:[],hitFx:[],events:[],nextFxId:1,nextProjectileId:1,
      checkpoint:{zoneIndex:0,waveIndex:0,kills:0,completedWaves:0,clearedZones:[],
        x:C.startX,laneY:C.startLaneY,started:false}};
  }

  function create() {
    let state = initialState(), accumulator = 0;
    let input = {move_x: 0, move_y: 0, jump: {held: false}, strike: {held: false},
      guard: {held: false}, throw: {held: false}};
    let edges = {jump: false, strike: false, guard: false, throw: false};

    function emit(type, data = {}) {
      state.events.push({type, atMs: state.elapsedMs, ...data});
      if (state.events.length > C.maxEvents) state.events.shift();
    }
    function fx(kind,x,laneY,bloodColor=null,direction=0){
      state.hitFx.push({id:state.nextFxId++,kind,x,laneY,ageMs:0,
        lifeMs:kind==='defeat'?600:320,bloodColor,bloodHex:bloodColor?BLOOD[bloodColor]:null,direction});
      if(state.hitFx.length>C.maxHitFx)state.hitFx.shift();
    }
    function phase(e,value){e.phase=value;e.phaseMs=0;e.animAgeMs=0;}
    function makeEnemy(kind,slot,started){
      const z=ZONES[state.zoneIndex],rule=ROLES[kind];
      const baseX=clamp(state.player.x+440,z.startX+820,z.endX-780);
      const x=clamp(baseX+slot*240,z.startX+120,z.endX-170);
      return {id:z.id+'-w'+(state.waveIndex+1)+'-'+slot+'-'+kind,kind,name:rule.name,
        arena:z.index,zoneId:z.id,wave:state.waveIndex+1,bloodColor:rule.bloodColor,bloodHex:BLOOD[rule.bloodColor],
        x,laneY:[880,930,815][slot],hp:rule.hp,maxHp:rule.hp,facing:-1,
        phase:started?'approach':'dormant',phaseMs:0,attackLaneY:880,attackFacing:-1,
        attackOriginX:x,attackTargetX:x,attackDone:false,attackSpawned:false,attackSpec:null,
        attackCount:0,bossPhase:rule.boss?1:null,shieldBrokenMs:0,stunMs:0,
        knockbackVx:0,flashMs:0,ageMs:0,animAgeMs:0,animAction:started?'walk':'idle',hitFeedback:null};
    }
    function spawnWave(started){
      const z=ZONES[state.zoneIndex];
      state.enemies=z.waves[state.waveIndex].map((kind,slot)=>makeEnemy(kind,slot,started));
      state.projectiles=[];state.waveState=started?'combat':'entry';state.waveBreakMs=0;
      state.arenaIndex=started?state.zoneIndex+1:0;
      state.checkpoint={zoneIndex:state.zoneIndex,waveIndex:state.waveIndex,kills:state.kills,
        completedWaves:state.completedWaves,clearedZones:state.clearedZones.slice(),
        x:state.player.x,laneY:state.player.laneY,started};
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
        edges[name] ||= name === 'guard' ? freshHold : next[name].pressed || freshHold;
      }
      input = next;
    }
    function currentGate(){
      const z=ZONES[state.zoneIndex];
      return state.waveState==='zone-clear'?Math.min(C.worldWidth-40,z.endX+220)
        :state.status==='desk-ready'?C.worldWidth-40:z.endX-220;
    }
    function live(e){return e.hp>0&&e.phase!=='dormant';}
    function throwTarget(){
      const p=state.player;
      return state.enemies.filter(e=>live(e)&&(!ROLES[e.kind].boss||['stunned','recovery'].includes(e.phase))&&
        Math.abs(e.laneY-p.laneY)<=C.laneReach&&(e.x-p.x)*p.facing>=-12&&(e.x-p.x)*p.facing<=C.throwReach)
        .sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x)||a.id.localeCompare(b.id))[0]||null;
    }
    function damageEnemy(e,amount,direction,cause,stunMs,speed){
      if(!live(e))return;
      const rule=ROLES[e.kind],shield=rule.shieldReduction&&!e.shieldBrokenMs&&direction===-e.facing&&cause==='strike';
      if(shield){amount=Math.max(1,Math.round(amount*(1-rule.shieldReduction)));fx('shield',e.x,e.laneY);}
      if(rule.shieldReduction&&(cause==='counter'||cause==='throw')){
        e.shieldBrokenMs=2600;emit('shield-broken',{id:e.id,durationMs:e.shieldBrokenMs});
      }
      e.hp=Math.max(0,e.hp-amount);e.flashMs=150;
      e.hitFeedback={kind:cause,ageMs:0,lifeMs:320,bloodColor:e.bloodColor,bloodHex:e.bloodHex,damage:amount,direction,shielded:!!shield};
      const armoredBoss=rule.boss&&e.hp&&['windup','active'].includes(e.phase)&&cause==='strike';
      if(!armoredBoss){
        e.knockbackVx=direction*speed;e.attackDone=true;phase(e,e.hp?'stunned':'defeated');
        e.stunMs=rule.boss?Math.min(stunMs,420):stunMs;
      }
      fx(e.hp?cause:'defeat',e.x,e.laneY,e.bloodColor,direction);
      emit('enemy-hit',{id:e.id,kind:e.kind,damage:amount,cause,hp:e.hp,bloodColor:e.bloodColor,shielded:!!shield});
      if(rule.boss&&e.hp){
        const nextPhase=e.hp<=e.maxHp/3?3:e.hp<=e.maxHp*2/3?2:1;
        if(nextPhase>e.bossPhase){
          e.bossPhase=nextPhase;emit('boss-phase',{id:e.id,phase:nextPhase,hp:e.hp,
            description:nextPhase===2?'Charge and relay fan':'Ground waves and four-arm pressure'});
        }
      }
      if(!e.hp){state.kills++;emit('enemy-defeated',{id:e.id,kind:e.kind,bloodColor:e.bloodColor});}
    }

    function startStrike(step) {
      const p = state.player, counter = p.counterMs > 0;
      p.attack = {step, elapsedMs: 0, facing: p.facing, hitIds: [], counter};
      p.counterMs = 0; p.guarding = false; p.parryMs = 0;
      p.queuedStrike = false; p.comboMs = 0;
      emit('strike', {step, counter});
    }
    function strikePhase(attack) {
      const rule = STRIKES[attack.step - 1];
      return attack.elapsedMs < rule.windupMs ? 'windup'
        : attack.elapsedMs < rule.windupMs + rule.activeMs ? 'active' : 'recovery';
    }
    function takeHit(e,beforeX,spec,projectile=false){
      const p=state.player;
      if((!projectile&&e.attackDone)||p.hp<=0||p.invulnerableMs>0||p.elevation>C.hitHeight)return;
      if(!projectile)e.attackDone=true;
      const front=(beforeX-p.x)*p.facing>=-12&&e.attackFacing===-p.facing;
      if(p.guarding&&front&&spec.guardable!==false){
        if(p.parryMs>0){
          phase(e,'stunned');e.stunMs=650;e.knockbackVx=p.facing*100;
          p.parryMs=0;p.counterMs=C.counterMs;fx('parry',p.x+p.facing*42,p.laneY);
          emit('parry',{id:e.id,kind:e.kind,counterMs:C.counterMs,projectile});
        }else{fx('block',p.x+p.facing*42,p.laneY);emit('block',{id:e.id,kind:e.kind,projectile});}
        return;
      }
      p.hp=Math.max(0,p.hp-spec.damage);p.hurtMs=C.playerHurtMs;p.invulnerableMs=C.playerInvulnerableMs;
      p.knockbackVx=e.attackFacing*240;p.attack=null;p.queuedStrike=false;p.comboNext=1;p.comboMs=0;
      p.guarding=false;p.parryMs=0;p.throwMs=0;
      fx('damage',p.x,p.laneY);emit('player-hit',{id:e.id,kind:e.kind,
        attackType:spec.attackType||spec.kind,damage:spec.damage,hp:p.hp});
      if(!p.hp){state.status='defeated';emit('player-defeated',{zone:state.zoneIndex+1,wave:state.waveIndex+1});}
    }

    function tickPlayer(dt, pressed) {
      const p = state.player, sec = dt / 1000;
      for (const timer of ['hurtMs', 'invulnerableMs', 'parryMs', 'counterMs',
        'comboMs', 'throwMs', 'throwCooldownMs']) p[timer] = Math.max(0, p[timer] - dt);
      if (!p.comboMs && !p.attack) p.comboNext = 1;
      p.guarding = input.guard.held && !p.attack && !p.throwMs && !p.hurtMs && p.elevation === 0;
      if (pressed.guard && p.guarding) p.parryMs = C.parryMs;
      if (!p.guarding) p.parryMs = 0;
      if (!p.attack && !p.throwMs && !p.hurtMs && input.move_x) p.facing = Math.sign(input.move_x);
      if (pressed.jump && !p.attack && !p.throwMs && !p.hurtMs && p.elevation === 0) {
        p.velocityZ = C.jumpSpeed; p.guarding = false; p.parryMs = 0; emit('jump');
      }
      if (pressed.strike && !p.throwMs && !p.hurtMs) {
        if (!p.attack) startStrike(p.comboMs > 0 ? p.comboNext : 1);
        else if (strikePhase(p.attack) === 'recovery' && p.attack.step < 3) p.queuedStrike = true;
      }
      if (pressed.throw && !p.attack && !p.throwMs && !p.hurtMs && !p.throwCooldownMs && p.elevation === 0) {
        const target = throwTarget();
        if (target) {
          p.throwMs = C.throwCommitMs; p.throwCooldownMs = C.throwCooldownMs;
          p.guarding = false; p.parryMs = 0; p.comboMs = 0; p.comboNext = 1;
          damageEnemy(target, C.throwDamage, p.facing, 'throw', 720, 530);
          emit('throw', {id: target.id});
        }
      }
      let mobility = p.hurtMs || p.throwMs ? 0 : p.guarding ? .28 : 1;
      if (p.attack) mobility = strikePhase(p.attack) === 'recovery' ? .5 : .18;
      const magnitude = Math.max(1, Math.hypot(input.move_x, input.move_y));
      p.x += input.move_x / magnitude * C.moveSpeed * mobility * sec + p.knockbackVx * sec;
      p.laneY = clamp(p.laneY + input.move_y / magnitude * C.laneSpeed * mobility * sec, C.laneMin, C.laneMax);
      p.x = clamp(p.x, ZONES[state.zoneIndex].startX + 40, currentGate());
      p.knockbackVx = toward(p.knockbackVx, 0, 1000 * sec);
      if (p.elevation > 0 || p.velocityZ > 0) {
        p.elevation = Math.max(0, p.elevation + p.velocityZ * sec - .5 * C.gravity * sec * sec);
        p.velocityZ -= C.gravity * sec;
        if (!p.elevation && p.velocityZ < 0) { p.velocityZ = 0; emit('land'); }
      }
      if (p.attack) {
        const attack = p.attack, rule = STRIKES[attack.step - 1];
        attack.elapsedMs += dt;
        if (strikePhase(attack) === 'active' && p.elevation <= C.hitHeight) {
          for (const e of state.enemies) {
            const distance = (e.x - p.x) * attack.facing;
            if (live(e) && !attack.hitIds.includes(e.id) && distance >= -12 && distance <= rule.reach &&
              Math.abs(e.laneY - p.laneY) <= C.laneReach) {
              attack.hitIds.push(e.id);
              damageEnemy(e, rule.damage + (attack.counter ? 10 : 0), attack.facing,
                attack.counter ? 'counter' : 'strike', attack.step === 3 ? 420 : 230, attack.step === 3 ? 240 : 95);
            }
          }
        }
        if (readyAt(attack.elapsedMs, rule.windupMs + rule.activeMs + rule.recoveryMs)) {
          const queued = p.queuedStrike && attack.step < 3;
          p.attack = null; p.queuedStrike = false;
          p.comboNext = attack.step < 3 ? attack.step + 1 : 1;
          p.comboMs = attack.step < 3 ? C.comboWindowMs : 0;
          if (queued) startStrike(attack.step + 1);
        }
      }
    }
    function attackSpec(e){
      const rule=ROLES[e.kind];
      if(!rule.boss)return {...rule,guardable:rule.attackType!=='ground-wave'};
      const patterns=e.bossPhase===1?['cleave']:e.bossPhase===2?['charge','fan','cleave']:['ground-wave','fan','charge','cleave'];
      const type=patterns[e.attackCount%patterns.length],shared={...rule,attackType:type,guardable:type!=='ground-wave'};
      if(type==='charge')return {...shared,distance:260,tellMs:1100,activeMs:440,recoverMs:1300,reach:60,chargeSpeed:660,damage:19,tell:'Regent charge line locked'};
      if(type==='fan')return {...shared,distance:310,tellMs:1200,activeMs:180,recoverMs:1450,projectileSpeed:350,damage:13,tell:'Three relay bolts charging'};
      if(type==='ground-wave')return {...shared,distance:240,tellMs:1250,activeMs:180,recoverMs:1500,projectileSpeed:340,damage:18,tell:'Plaza shock line; jump or leave the lane'};
      return {...shared,tellMs:e.bossPhase===3?850:1000,recoverMs:1150,tell:'Four-arm cleave drawn back'};
    }
    function beginTell(e,spec){
      phase(e,'windup');e.attackDone=false;e.attackSpawned=false;e.attackSpec=spec;
      e.attackLaneY=e.laneY;e.attackFacing=e.facing;e.attackOriginX=e.x;
      const z=ZONES[state.zoneIndex];e.attackTargetX=clamp(state.player.x+e.facing*85,z.startX+60,z.endX-60);
      emit('enemy-tell',{id:e.id,kind:e.kind,attackType:spec.attackType,label:spec.tell,tellMs:spec.tellMs,
        laneY:e.attackLaneY,facing:e.attackFacing,originX:e.attackOriginX,targetX:e.attackTargetX,
        guardable:spec.guardable,canJump:true,bossPhase:e.bossPhase});
    }
    function addProjectile(e,spec,laneOffset=0,facing=e.attackFacing){
      state.projectiles.push({id:state.nextProjectileId++,ownerId:e.id,kind:spec.attackType,
        x:e.x+facing*28,laneY:clamp(e.attackLaneY+laneOffset,C.laneMin,C.laneMax),
        facing,vx:facing*spec.projectileSpeed,ageMs:0,lifeMs:2600,damage:spec.damage,guardable:spec.guardable,
        width:spec.attackType==='ground-wave'?44:22,laneReach:spec.attackType==='ground-wave'?48:23,
        color:spec.attackType==='bile'?BLOOD.green:BLOOD.purple});
      if(state.projectiles.length>C.maxProjectiles)state.projectiles.shift();
      emit('enemy-projectile',{id:e.id,kind:e.kind,attackType:spec.attackType,laneY:e.attackLaneY+laneOffset});
    }
    function enemyAnim(e){
      return e.hp<=0?'defeat':e.phase==='stunned'?'hurt':e.phase==='windup'?'tell'
        :e.phase==='active'?'attack':e.phase==='recovery'?'recover':e.phase==='approach'?'walk':'idle';
    }
    function tickEnemy(e,dt){
      const sec=dt/1000;e.ageMs+=dt;e.animAgeMs+=dt;
      e.flashMs=Math.max(0,e.flashMs-dt);e.shieldBrokenMs=Math.max(0,e.shieldBrokenMs-dt);
      if(e.hitFeedback){e.hitFeedback.ageMs+=dt;if(e.hitFeedback.ageMs>=e.hitFeedback.lifeMs)e.hitFeedback=null;}
      if(!live(e)){e.animAction=enemyAnim(e);return;}
      const p=state.player,z=ZONES[state.zoneIndex];
      e.x=clamp(e.x+e.knockbackVx*sec,z.startX+60,z.endX-60);
      e.knockbackVx=toward(e.knockbackVx,0,900*sec);e.phaseMs+=dt;
      if(e.phase==='stunned'){if(readyAt(e.phaseMs,e.stunMs))phase(e,'approach');}
      else if(e.phase==='recovery'){if(readyAt(e.phaseMs,e.attackSpec?.recoverMs||ROLES[e.kind].recoverMs))phase(e,'approach');}
      else if(e.phase==='approach'){
        const spec=attackSpec(e);e.facing=Math.sign(p.x-e.x)||e.facing;
        e.laneY=toward(e.laneY,p.laneY,spec.laneSpeed*sec);
        const gap=Math.abs(p.x-e.x);
        if(gap>spec.distance)e.x+=e.facing*Math.min(spec.speed*sec,gap-spec.distance);
        if(gap<=spec.distance+1&&Math.abs(e.laneY-p.laneY)<=24)beginTell(e,spec);
      }else if(e.phase==='windup'){
        // Locked aim, lane and published duration never track Mac during a tell.
        if(readyAt(e.phaseMs,e.attackSpec.tellMs)){
          phase(e,'active');e.attackCount++;
          emit('enemy-attack',{id:e.id,kind:e.kind,attackType:e.attackSpec.attackType,bossPhase:e.bossPhase});
        }
      }else if(e.phase==='active'){
        const spec=e.attackSpec,beforeX=e.x,type=spec.attackType;
        if(type==='lunge'||type==='charge')e.x=clamp(e.x+e.attackFacing*spec.chargeSpeed*sec,z.startX+60,z.endX-60);
        if(type==='rift-cross')e.x=e.attackOriginX+(e.attackTargetX-e.attackOriginX)*Math.min(1,e.phaseMs/spec.activeMs);
        if(['bile','fan','ground-wave'].includes(type)){
          if(!e.attackSpawned){
            e.attackSpawned=true;if(type==='fan')for(const offset of [-64,0,64])addProjectile(e,spec,offset);else addProjectile(e,spec);
          }
        }else{
          const swept=['lunge','charge','rift-cross'].includes(type);
          const inLane=Math.abs(p.laneY-e.attackLaneY)<=C.laneReach;
          const inReach=swept?p.x>=Math.min(beforeX,e.x)-spec.reach&&p.x<=Math.max(beforeX,e.x)+spec.reach
            :(p.x-e.x)*e.attackFacing>=-12&&(p.x-e.x)*e.attackFacing<=spec.reach;
          if(inLane&&inReach&&(type!=='rift-cross'||e.phaseMs>=spec.activeMs*.5))takeHit(e,beforeX,spec);
        }
        if(e.phase==='active'&&readyAt(e.phaseMs,spec.activeMs))phase(e,'recovery');
      }
      const anim=enemyAnim(e);if(e.animAction!==anim)e.animAgeMs=0;e.animAction=anim;
    }
    function tickProjectiles(dt){
      const p=state.player,sec=dt/1000,z=ZONES[state.zoneIndex];
      for(const item of state.projectiles){
        const before=item.x;item.x+=item.vx*sec;item.ageMs+=dt;
        const e=state.enemies.find(foe=>foe.id===item.ownerId);
        if(!e||!e.hp){item.ageMs=item.lifeMs;continue;}
        const intersects=p.x>=Math.min(before,item.x)-item.width&&p.x<=Math.max(before,item.x)+item.width&&Math.abs(p.laneY-item.laneY)<=item.laneReach;
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
    function progression(dt){
      const z=ZONES[state.zoneIndex],p=state.player;
      if(state.waveState==='entry'&&p.x>=z.entryX){
        state.waveState='combat';state.arenaIndex=state.zoneIndex+1;
        state.checkpoint.started=true;state.checkpoint.x=p.x;state.checkpoint.laneY=p.laneY;
        for(const e of state.enemies){phase(e,'approach');emit('enemy-arrive',{id:e.id,kind:e.kind,arena:e.arena,bloodColor:e.bloodColor});}
        emit('zone-enter',{zoneId:z.id,name:z.name,index:z.index,arrival:z.arrival});
        emit('wave-start',{zoneId:z.id,zone:z.index,wave:1,kinds:state.enemies.map(e=>e.kind)});
      }
      if(state.waveState==='combat'&&state.enemies.every(e=>!e.hp)){
        state.completedWaves++;state.projectiles=[];emit('wave-cleared',{zoneId:z.id,zone:z.index,wave:state.waveIndex+1});
        if(state.waveIndex+1<z.waves.length){state.waveState='intermission';state.waveBreakMs=C.waveBreakMs;}
        else{
          state.waveState='zone-clear';state.clearedZones.push(z.id);p.hp=Math.min(p.maxHp,p.hp+C.zoneHeal);
          emit('zone-cleared',{zoneId:z.id,name:z.name,index:z.index,exit:z.exit,exitX:z.endX,heal:C.zoneHeal});
          if(state.zoneIndex===ZONES.length-1){state.status='desk-ready';emit('desk-unlocked',{x:C.deskX,entrance:'review-studio'});}
        }
      }
      if(state.waveState==='intermission'){
        state.waveBreakMs=Math.max(0,state.waveBreakMs-dt);
        if(!state.waveBreakMs){state.waveIndex++;spawnWave(true);}
      }else if(state.waveState==='zone-clear'&&state.zoneIndex+1<ZONES.length&&p.x>=ZONES[state.zoneIndex+1].entryX){
        state.zoneIndex++;state.waveIndex=0;spawnWave(true);
        const next=ZONES[state.zoneIndex];emit('zone-enter',{zoneId:next.id,name:next.name,index:next.index,arrival:next.arrival});
      }
    }
    function tick(dt,pressed){
      state.elapsedMs+=dt;
      for(const item of state.hitFx)item.ageMs+=dt;
      state.hitFx=state.hitFx.filter(item=>item.ageMs<item.lifeMs);
      if(state.status==='defeated')return;
      tickPlayer(dt,pressed);progression(dt);
      for(const e of state.enemies)tickEnemy(e,dt);
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
        const pressed = edges;
        edges = {jump: false, strike: false, guard: false, throw: false};
        tick(C.stepMs, pressed);
        accumulator = Math.max(0, accumulator - C.stepMs); count++;
      }
      return getSnapshot();
    }
    function mode() {
      const p = state.player;
      return p.hp <= 0 ? 'defeated' : p.hurtMs ? 'hurt' : p.throwMs ? 'throw'
        : p.attack ? 'strike' : p.guarding ? 'guard' : p.elevation > 0 ? 'jump'
        : input.move_x || input.move_y ? 'walk' : 'idle';
    }
    function animation(e){
      const frames={idle:0,tell:3,attack:4,recover:5,hurt:6,defeat:7};
      return {action:e.animAction,facing:e.facing,ageMs:e.animAgeMs,
        frame:e.animAction==='walk'?1+Math.floor(e.animAgeMs/120)%2:frames[e.animAction]||0,hitFeedback:e.hitFeedback};
    }
    function getSnapshot(){
      const p=state.player,z=ZONES[state.zoneIndex],rule=p.attack?STRIKES[p.attack.step-1]:null;
      const attack=p.attack?{step:p.attack.step,phase:strikePhase(p.attack),elapsedMs:p.attack.elapsedMs,
        facing:p.attack.facing,counter:p.attack.counter,remainingMs:Math.max(0,rule.windupMs+rule.activeMs+rule.recoveryMs-p.attack.elapsedMs)}:null;
      const boss=state.enemies.find(e=>ROLES[e.kind].boss);
      return copy({version:C.version,elapsedMs:state.elapsedMs,status:state.status,kills:state.kills,
        player:{...p,y:p.laneY,grounded:p.elevation===0&&p.velocityZ===0,mode:mode(),attack,
          animation:{action:mode(),ageMs:p.animAgeMs,facing:p.facing,frame:Math.floor(p.animAgeMs/120)%2}},
        enemies:state.enemies.map(e=>({...e,y:e.laneY,tellMs:(e.attackSpec||attackSpec(e)).tellMs,
          attackReach:(e.attackSpec||attackSpec(e)).reach,warning:e.phase==='windup',active:e.phase==='active',
          shielded:e.kind==='prism_guard'&&!e.shieldBrokenMs,animFrame:animation(e).frame,animation:animation(e),
          attackTell:e.phase==='windup'?{type:e.attackSpec.attackType,label:e.attackSpec.tell,
            remainingMs:Math.max(0,e.attackSpec.tellMs-e.phaseMs),durationMs:e.attackSpec.tellMs,
            laneY:e.attackLaneY,facing:e.attackFacing,originX:e.attackOriginX,targetX:e.attackTargetX,
            range:e.attackSpec.reach,guardable:e.attackSpec.guardable,canJump:true}:null})),
        projectiles:state.projectiles,hitFx:state.hitFx,
        arena:{index:state.arenaIndex,gateX:currentGate(),active:state.enemies.some(e=>live(e)),remaining:state.enemies.filter(e=>e.hp>0).length},
        city:{worldWidth:C.worldWidth,zoneCount:ZONES.length,totalWaves:C.totalWaves,totalEnemies:C.totalEnemies,
          completedWaves:state.completedWaves,clearedZones:state.clearedZones,progress:state.completedWaves/C.totalWaves,complete:state.status==='desk-ready'},
        zones:ZONES.map(item=>({...item,cleared:state.clearedZones.includes(item.id)})),
        zone:{...z,title:z.name,cleared:state.clearedZones.includes(z.id),exitLabel:z.exit,
          wave:state.waveIndex+1,waveCount:z.waves.length,state:state.waveState,waveBreakMs:state.waveBreakMs,
          exitX:z.endX,walkToExit:state.waveState==='zone-clear',roomBounds:{minX:z.startX+40,maxX:currentGate(),laneMin:C.laneMin,laneMax:C.laneMax}},
        wave:{index:state.waveIndex+1,number:state.waveIndex+1,total:z.waves.length,
          state:state.waveState,kinds:z.waves[state.waveIndex],remaining:state.enemies.filter(e=>e.hp>0).length},
        checkpoint:{...state.checkpoint,zoneId:ZONES[state.checkpoint.zoneIndex].id,zone:state.checkpoint.zoneIndex+1,wave:state.checkpoint.waveIndex+1},
        camera:{minX:z.startX,maxX:Math.max(z.startX,currentGate()-1400),targetX:p.x},
        boss:boss?{id:boss.id,kind:boss.kind,hp:boss.hp,maxHp:boss.maxHp,phase:boss.bossPhase,
          attackType:boss.attackSpec?.attackType||null,warning:boss.phase==='windup',defeated:boss.hp===0,bloodColor:boss.bloodColor}:null,
        desk:{x:C.deskX,unlocked:state.status==='desk-ready',entrance:'review-studio'}});
    }

    function getControlState() {
      const p = state.player, alive = p.hp > 0, busy = !!(p.attack || p.throwMs || p.hurtMs);
      const target = throwTarget();
      return {
        move: {enabled: alive, held: !!(input.move_x || input.move_y)},
        jump: {label: 'Jump', enabled: alive, ready: alive && !busy && p.elevation === 0, held: input.jump.held},
        strike: {label: p.counterMs > 0 ? 'Counter' : 'Strike', enabled: alive,
          ready: alive && !p.throwMs && !p.hurtMs && (!p.attack ||
            strikePhase(p.attack) === 'recovery' && p.attack.step < 3), held: input.strike.held},
        guard: {label: 'Guard', enabled: alive, ready: alive && !busy && p.elevation === 0,
          held: input.guard.held, parryMs: p.parryMs, counterMs: p.counterMs},
        throw: {label: 'Throw', enabled: alive && !!target,
          ready: alive && !!target && !busy && !p.throwCooldownMs && p.elevation === 0,
          targetId: target?.id || null, held: input.throw.held, cooldownMs: p.throwCooldownMs},
        retry: {label: 'Retry wave', enabled: !alive, ready: !alive}
      };
    }
    function retry(){
      const cp=copy(state.checkpoint);state=initialState();
      state.zoneIndex=cp.zoneIndex;state.waveIndex=cp.waveIndex;state.kills=cp.kills;
      state.completedWaves=cp.completedWaves;state.clearedZones=cp.clearedZones;
      state.player.x=cp.x;state.player.laneY=cp.laneY;accumulator=0;
      input={move_x:0,move_y:0,jump:{held:false},strike:{held:false},guard:{held:false},throw:{held:false}};
      edges={jump:false,strike:false,guard:false,throw:false};spawnWave(cp.started);state.events=[];
      return getSnapshot();
    }

    function drainEvents() { const events = copy(state.events); state.events.length = 0; return events; }
    return {handleInput, update, getSnapshot, getControlState, retry, drainEvents};
  }
  B.MacStreetCombat = {create, constants: C, strikes: STRIKES, roles: ROLES, zones: ZONES};
})(window.BARCODE = window.BARCODE || {});
