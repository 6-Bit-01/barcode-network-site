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
    version:3,worldWidth:20400,zoneWidth:3400,laneMin:780,laneMax:970,
    startX:200,startLaneY:880,deskX:20100,
    stepMs:1000/120,maxDeltaMs:100,maxSubsteps:12,
    maxEnemies:3,totalEnemies:30,totalWaves:12,maxProjectiles:18,
    maxHitFx:24,maxEvents:64,waveBreakMs:1250,
    playerHp:100,zoneHeal:28,moveSpeed:260,laneSpeed:180,
    jumpSpeed:560,gravity:1500,hitHeight:62,laneReach:40,parryMs:125,counterMs:800,
    playerInvulnerableMs:720,playerHurtMs:220,comboWindowMs:360,
    throwReach:74,throwDamage:28,throwCommitMs:420,throwReleaseMs:140,throwCooldownMs:700
  });
  const STRIKES = Object.freeze([
    Object.freeze({kind:'jab',windupMs:90,activeMs:80,recoveryMs:155,reach:90,damage:12}),
    Object.freeze({kind:'cross',windupMs:100,activeMs:80,recoveryMs:175,reach:96,damage:14}),
    Object.freeze({kind:'finisher',windupMs:130,activeMs:105,recoveryMs:240,reach:112,damage:20})
  ]);
  const ATTACKS=Object.freeze({
    'step-strike':Object.freeze({kind:'step-strike',windupMs:110,activeMs:100,recoveryMs:210,reach:105,damage:15,rootSpeed:230}),
    'air-kick':Object.freeze({kind:'air-kick',windupMs:60,activeMs:190,recoveryMs:180,reach:120,damage:18,hitHeight:150}),
    counter:Object.freeze({kind:'counter',windupMs:65,activeMs:105,recoveryMs:180,reach:104,damage:22,rootSpeed:100})
  });
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
  const BLOOD=Object.freeze({green:'#78ea68',purple:'#b374ed',red:'#f04455'});
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

  function initialState(){
    return {elapsedMs:0,status:'active',kills:0,zoneIndex:0,waveIndex:0,arenaIndex:0,
      completedWaves:0,clearedZones:[],waveState:'entry',waveBreakMs:0,
      player:{x:C.startX,laneY:C.startLaneY,elevation:0,velocityZ:0,facing:1,
        hp:C.playerHp,maxHp:C.playerHp,attack:null,comboNext:1,comboMs:0,queuedStrike:false,
        guarding:false,parryMs:0,counterMs:0,hurtMs:0,invulnerableMs:0,knockbackVx:0,
        throwMs:0,throwCooldownMs:0,grapple:null,animAction:'idle',animAgeMs:0,
        vx:0,laneVelocity:0,travelDistance:0,strideRatio:0,settleAgeMs:0,
        wasMoving:false,motionMoving:false,moveAgeMs:0,fromMoving:false,fromStopAgeMs:240,
        fromStridePhase:0,fromStrideRatio:0,motionStridePhase:0,motionVx:0,motionLaneVelocity:0,
        feet:gaitInitial(),transitionFrom:gaitInitial(),hitFeedback:null},
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
        knockbackVx:0,flashMs:0,ageMs:0,animAgeMs:0,animAction:started?'walk':'idle',hitFeedback:null,
        elevation:0,vx:0,laneVelocity:0,travelDistance:0,strideRatio:0,settleAgeMs:0,
        wasMoving:false,motionMoving:false,moveAgeMs:0,fromMoving:false,fromStopAgeMs:240,
        fromStridePhase:0,fromStrideRatio:0,motionStridePhase:0,motionVx:0,motionLaneVelocity:0,
        feet:gaitInitial(),transitionFrom:gaitInitial(),grappledBy:null,tactic:'approach'};
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
      const rule=ROLES[e.kind],shield=rule.shieldReduction&&!e.shieldBrokenMs&&direction===-e.facing&&['strike','step-strike','air-kick'].includes(cause);
      if(shield){amount=Math.max(1,Math.round(amount*(1-rule.shieldReduction)));fx('shield',e.x,e.laneY);}
      if(rule.shieldReduction&&(cause==='counter'||cause==='throw')){
        e.shieldBrokenMs=2600;emit('shield-broken',{id:e.id,durationMs:e.shieldBrokenMs});
      }
      e.hp=Math.max(0,e.hp-amount);e.flashMs=150;
      e.hitFeedback={kind:cause,ageMs:0,lifeMs:320,bloodColor:e.bloodColor,bloodHex:e.bloodHex,damage:amount,direction,shielded:!!shield};
      const armoredBoss=rule.boss&&e.hp&&['windup','active'].includes(e.phase)&&['strike','step-strike','air-kick'].includes(cause);
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
      const p=state.player,counter=p.counterMs>0,air=p.elevation>0||p.velocityZ>0;
      const selected=counter?ATTACKS.counter:air?ATTACKS['air-kick']
        :step===1&&Math.abs(input.move_x)>.45?ATTACKS['step-strike']:STRIKES[step-1];
      if(counter||air)step=1;
      p.attack={step,kind:selected.kind,rule:selected,elapsedMs:0,facing:p.facing,
        hitIds:[],counter,airborne:air,rootShift:0};
      p.counterMs = 0; p.guarding = false; p.parryMs = 0;
      p.queuedStrike = false; p.comboMs = 0;
      emit('strike',{step,kind:selected.kind,counter,airborne:air,facing:p.facing});
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
      if(p.grapple){const victim=state.enemies.find(item=>item.id===p.grapple.targetId);
        if(victim?.phase==='grappled'){victim.grappledBy=null;phase(victim,'approach');}}
      p.guarding=false;p.parryMs=0;p.throwMs=0;p.grapple=null;
      p.hitFeedback={kind:'damage',ageMs:0,lifeMs:320,bloodColor:'red',bloodHex:BLOOD.red,
        damage:spec.damage,direction:e.attackFacing};
      fx('damage',p.x,p.laneY,'red',e.attackFacing);emit('player-hit',{id:e.id,kind:e.kind,
        attackType:spec.attackType||spec.kind,damage:spec.damage,hp:p.hp,bloodColor:'red',bloodHex:BLOOD.red});
      if(!p.hp){state.status='defeated';emit('player-defeated',{zone:state.zoneIndex+1,wave:state.waveIndex+1});}
    }

    function tickPlayer(dt, pressed) {
      const p = state.player, sec = dt / 1000;
      const previousX=p.x,previousLane=p.laneY;
      if(p.hitFeedback){p.hitFeedback.ageMs+=dt;if(p.hitFeedback.ageMs>=p.hitFeedback.lifeMs)p.hitFeedback=null;}
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
        else if(strikePhase(p.attack)==='recovery'&&p.attack.step<3&&!p.attack.airborne&&!p.attack.counter)p.queuedStrike=true;
      }
      if (pressed.throw && !p.attack && !p.throwMs && !p.hurtMs && !p.throwCooldownMs && p.elevation === 0) {
        const target = throwTarget();
        if (target) {
          p.throwMs=C.throwCommitMs;p.throwCooldownMs=C.throwCooldownMs;
          p.grapple={targetId:target.id,elapsedMs:0,facing:p.facing,released:false};
          target.grappledBy='mac';target.attackDone=true;target.knockbackVx=0;phase(target,'grappled');
          p.guarding = false; p.parryMs = 0; p.comboMs = 0; p.comboNext = 1;
          emit('throw',{id:target.id,phase:'grab',facing:p.facing,releaseMs:C.throwReleaseMs});
        }
      }
      let mobility = p.hurtMs || p.throwMs ? 0 : p.guarding ? .28 : 1;
      if (p.attack) mobility = strikePhase(p.attack) === 'recovery' ? .5 : .18;
      const magnitude = Math.max(1, Math.hypot(input.move_x, input.move_y));
      const rootCommit=p.attack?.rule.rootSpeed&&strikePhase(p.attack)!=='recovery';
      const rootMotion=rootCommit?p.attack.facing*p.attack.rule.rootSpeed*sec:0;
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
        if(strikePhase(attack)==='active'&&p.elevation<=(rule.hitHeight??C.hitHeight)){
          for (const e of state.enemies) {
            const distance = (e.x - p.x) * attack.facing;
            if (live(e) && !attack.hitIds.includes(e.id) && distance >= -12 && distance <= rule.reach &&
              Math.abs(e.laneY - p.laneY) <= C.laneReach) {
              attack.hitIds.push(e.id);
              const cause=attack.counter?'counter':attack.kind==='air-kick'?'air-kick':attack.kind==='step-strike'?'step-strike':'strike';
              damageEnemy(e,rule.damage,attack.facing,cause,attack.step===3||attack.kind==='air-kick'?420:230,
                attack.step===3?240:attack.kind==='air-kick'?210:95);
            }
          }
        }
        if (readyAt(attack.elapsedMs, rule.windupMs + rule.activeMs + rule.recoveryMs)) {
          const chainable=attack.step<3&&!attack.airborne&&!attack.counter,queued=p.queuedStrike&&chainable;
          p.attack = null; p.queuedStrike = false;
          p.comboNext=chainable?attack.step+1:1;
          p.comboMs=chainable?C.comboWindowMs:0;
          if (queued) startStrike(attack.step + 1);
        }
      }
      if(p.grapple){
        const grapple=p.grapple,victim=state.enemies.find(e=>e.id===grapple.targetId);
        grapple.elapsedMs+=dt;
        if(!grapple.released&&victim?.hp){
          victim.x=toward(victim.x,p.x+grapple.facing*52,180*sec);
          victim.laneY=toward(victim.laneY,p.laneY,160*sec);
          if(readyAt(grapple.elapsedMs,C.throwReleaseMs)){
            grapple.released=true;victim.grappledBy=null;
            damageEnemy(victim,C.throwDamage,grapple.facing,'throw',720,530);
            emit('throw-release',{id:victim.id,facing:grapple.facing,damage:C.throwDamage});
          }
        }
        if(readyAt(grapple.elapsedMs,C.throwCommitMs)){p.grapple=null;p.throwMs=0;}
      }
      p.vx=(p.x-previousX)/sec;p.laneVelocity=(p.laneY-previousLane)/sec;
      p.travelDistance+=Math.hypot(p.x-previousX,(p.laneY-previousLane)*.75);
      trackMotion(p,dt);
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
      if(type==='charge')return {...shared,distance:260,tellMs:1100,activeMs:440,recoverMs:1300,reach:60,chargeSpeed:660,damage:19,tell:'Regent charge line locked'};
      if(type==='fan')return {...shared,distance:310,tellMs:1200,activeMs:180,recoverMs:1450,projectileSpeed:350,damage:13,tell:'Three relay bolts charging'};
      if(type==='ground-wave')return {...shared,distance:240,tellMs:1250,activeMs:180,recoverMs:1500,projectileSpeed:340,damage:18,tell:'Plaza shock line; jump or leave the lane'};
      return {...shared,tellMs:e.bossPhase===3?850:1000,recoverMs:1150,tell:'Four-arm cleave drawn back'};
    }
    function beginTell(e,spec){
      phase(e,'windup');e.attackDone=false;e.attackSpawned=false;e.attackSpec=spec;
      e.tactic=spec.tactic;
      e.attackLaneY=e.laneY;e.attackFacing=e.facing;e.attackOriginX=e.x;
      const z=ZONES[state.zoneIndex],targetOffset=spec.attackType==='mantid-leap'?0:85;
      e.attackTargetX=clamp(state.player.x+e.facing*targetOffset,z.startX+60,z.endX-60);
      emit('enemy-tell',{id:e.id,kind:e.kind,attackType:spec.attackType,label:spec.tell,tellMs:spec.tellMs,
        laneY:e.attackLaneY,facing:e.attackFacing,originX:e.attackOriginX,targetX:e.attackTargetX,
        guardable:spec.guardable,canJump:spec.canJump,bossPhase:e.bossPhase,tactic:spec.tactic});
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
      return e.hp<=0?'defeat':['stunned','grappled'].includes(e.phase)?'hurt':e.phase==='windup'?'tell'
        :e.phase==='active'?'attack':e.phase==='recovery'?'recover':e.phase==='approach'?'walk':'idle';
    }
    function tickEnemy(e,dt,before){
      const sec=dt/1000,previousX=before?.x??e.x,previousLane=before?.laneY??e.laneY;e.ageMs+=dt;e.animAgeMs+=dt;
      if(!(e.phase==='active'&&e.attackSpec?.attackType==='mantid-leap'))e.elevation=Math.max(0,e.elevation-450*sec);
      e.flashMs=Math.max(0,e.flashMs-dt);e.shieldBrokenMs=Math.max(0,e.shieldBrokenMs-dt);
      if(e.hitFeedback){e.hitFeedback.ageMs+=dt;if(e.hitFeedback.ageMs>=e.hitFeedback.lifeMs)e.hitFeedback=null;}
      if(!live(e)){e.vx=0;e.laneVelocity=0;trackMotion(e,dt);e.animAction=enemyAnim(e);return;}
      const p=state.player,z=ZONES[state.zoneIndex];
      e.x=clamp(e.x+e.knockbackVx*sec,z.startX+60,z.endX-60);
      e.knockbackVx=toward(e.knockbackVx,0,900*sec);e.phaseMs+=dt;
      if(e.phase==='stunned'){if(readyAt(e.phaseMs,e.stunMs))phase(e,'approach');}
      else if(e.phase==='recovery'){
        if(e.attackSpec?.recoilSpeed&&e.phaseMs<400)e.x=clamp(e.x-e.attackFacing*e.attackSpec.recoilSpeed*sec,z.startX+60,z.endX-60);
        if(readyAt(e.phaseMs,e.attackSpec?.recoverMs||ROLES[e.kind].recoverMs))phase(e,'approach');
      }
      else if(e.phase==='approach'){
        const spec=attackSpec(e);e.tactic=spec.tactic;e.facing=Math.sign(p.x-e.x)||e.facing;
        e.laneY=toward(e.laneY,p.laneY,spec.laneSpeed*sec);
        const gap=Math.abs(p.x-e.x);
        if(gap>spec.distance)e.x+=e.facing*Math.min(spec.speed*sec,gap-spec.distance);
        if(gap<=spec.distance+1&&Math.abs(e.laneY-p.laneY)<=24)beginTell(e,spec);
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
          const inReach=swept?p.x>=Math.min(beforeX,e.x)-spec.reach&&p.x<=Math.max(beforeX,e.x)+spec.reach
            :(p.x-e.x)*e.attackFacing>=-12&&(p.x-e.x)*e.attackFacing<=spec.reach;
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
      tickPlayer(dt,pressed);progression(dt);
      for(const e of state.enemies)tickEnemy(e,dt,beforeEnemies.get(e.id));
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
      const spec=e.attackSpec,duration=e.phase==='windup'?spec?.tellMs:e.phase==='active'?spec?.activeMs
        :e.phase==='recovery'?spec?.recoverMs:e.phase==='stunned'?e.stunMs:0;
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
        facing:p.attack.facing,counter:p.attack.counter,airborne:p.attack.airborne,
        phaseProgress:clamp((p.attack.elapsedMs-phaseStart)/phaseDuration,0,1),
        normalizedProgress:clamp(p.attack.elapsedMs/attackDuration,0,1),remainingMs:Math.max(0,attackDuration-p.attack.elapsedMs)}:null;
      const grapple=p.grapple?{...p.grapple,phase:!p.grapple.released?'grab':p.grapple.elapsedMs<280?'release':'recover',
        progress:clamp(p.grapple.elapsedMs/C.throwCommitMs,0,1)}:null;
      const boss=state.enemies.find(e=>ROLES[e.kind].boss);
      return copy({version:C.version,elapsedMs:state.elapsedMs,status:state.status,kills:state.kills,
        player:{...p,y:p.laneY,grounded:p.elevation===0&&p.velocityZ===0,mode:mode(),attack,grapple,
          bloodColor:'red',bloodHex:BLOOD.red,
          animation:{action:mode(),pose:attack?.kind||mode(),phase:attackPhase||grapple?.phase||mode(),
            phaseProgress:attack?.phaseProgress??grapple?.progress??0,ageMs:p.animAgeMs,facing:p.facing,frame:Math.floor(p.animAgeMs/120)%2,
            motion:{vx:p.vx,laneVelocity:p.laneVelocity,speed:Math.hypot(p.vx,p.laneVelocity),
              stridePhase:(p.travelDistance/110)%1,strideRatio:p.strideRatio,
              settleAgeMs:p.settleAgeMs,wasMoving:p.wasMoving,moveAgeMs:p.moveAgeMs,fromMoving:p.fromMoving,
              fromStopAgeMs:p.fromStopAgeMs,fromStridePhase:p.fromStridePhase,fromStrideRatio:p.fromStrideRatio,
              feet:p.feet,elevation:p.elevation,velocityZ:p.velocityZ,
              attackType:attack?.kind||null,rootShift:attack?.rootShift||0,
              phaseProgress:attack?.phaseProgress??grapple?.progress??0,guarding:p.guarding,
              hurtProgress:p.hitFeedback?clamp(p.hitFeedback.ageMs/p.hitFeedback.lifeMs,0,1):0}}},
        enemies:state.enemies.map(e=>({...e,y:e.laneY,tellMs:(e.attackSpec||attackSpec(e)).tellMs,
          attackReach:(e.attackSpec||attackSpec(e)).reach,warning:e.phase==='windup',active:e.phase==='active',
          shielded:e.kind==='prism_guard'&&!e.shieldBrokenMs,animFrame:animation(e).frame,animation:animation(e),
          attackTell:e.phase==='windup'?{type:e.attackSpec.attackType,label:e.attackSpec.tell,
            remainingMs:Math.max(0,e.attackSpec.tellMs-e.phaseMs),durationMs:e.attackSpec.tellMs,
            laneY:e.attackLaneY,facing:e.attackFacing,originX:e.attackOriginX,targetX:e.attackTargetX,
            range:e.attackSpec.reach,laneReach:e.attackSpec.laneReach,guardable:e.attackSpec.guardable,
            lanes:['fan','bile-spread'].includes(e.attackSpec.attackType)?[-64,0,64].map(offset=>clamp(e.attackLaneY,C.laneMin+64,C.laneMax-64)+offset):[e.attackLaneY],
            canJump:e.attackSpec.canJump,tactic:e.attackSpec.tactic}:null})),
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
      const nextStep=p.attack?p.attack.step+1:p.comboMs>0?p.comboNext:1;
      return {
        move: {enabled: alive, held: !!(input.move_x || input.move_y)},
        jump: {label: 'Jump', enabled: alive, ready: alive && !busy && p.elevation === 0, held: input.jump.held},
        strike: {label:p.counterMs>0?'Counter':p.elevation>0||p.velocityZ>0?'Air Kick':nextStep===1&&Math.abs(input.move_x)>.45?'Step Strike':'Strike',enabled:alive,
          ready: alive && !p.throwMs && !p.hurtMs && (!p.attack ||
            strikePhase(p.attack)==='recovery'&&p.attack.step<3&&!p.attack.airborne&&!p.attack.counter),held:input.strike.held},
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
  B.MacStreetCombat={create,constants:C,strikes:STRIKES,attacks:ATTACKS,roles:ROLES,tactics:TACTICS,zones:ZONES};
})(window.BARCODE = window.BARCODE || {});
