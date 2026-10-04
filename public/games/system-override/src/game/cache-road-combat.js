// Fresh Cache Road combat owns finite physical opponents, not the music clock.
// The road applies emitted player hits, queued Turbo and rewards in its owners.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name:'src/game/cache-road-combat.js',
  exports:['BARCODE.CacheRoadCombat'], dependencies:[] });
(function(B) {
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const round=n=>Math.round(n*1e6)/1e6;
  const MAX_ACTORS=3, MAX_PROJECTILES=6, MAX_WRECKS=6, MAX_LEDGER=96;
  // The car nose reaches the hostile rear chassis before tire-plane overlap.
  const RAM_REACH=48;
  const RIDER_LAND_MS=1900, RIDER_LANE_THROW=.34, RIDER_CONTACT_GAP=.36;
  const ROLES=Object.freeze({
    bike:Object.freeze({hp:2,attack:'kick'}),
    rammer:Object.freeze({hp:3,attack:'ram'}),
    escort:Object.freeze({hp:3,attack:'ram'}),
    disruptor:Object.freeze({hp:3,attack:'shot'}),
    rig:Object.freeze({hp:12,attack:'scan'})
  });
  const SYSTEMS=Object.freeze(['scanner','ram','emitter']);
  const SETTINGS=Object.freeze({
    relaxed:Object.freeze({spawnMs:6800,warningMs:1500,gap:.48}),
    standard:Object.freeze({spawnMs:5500,warningMs:1250,gap:.52}),
    overclocked:Object.freeze({spawnMs:4700,warningMs:1100,gap:.55})
  });
  const SKILLS=Object.freeze({attack:550,defend:4000,turbo:7000,disrupt:8500});
  const syncBenefits=(count,adrenaline=0)=>{
    const charge=B.CacheRoadAdrenaline?.benefits?.(adrenaline)||
      {power:1,recharge:1,ammo:1,guardMs:0,trackingMs:0,footprint:1};
    return {power:(1+count*.25)*charge.power,recharge:(1-count*.1)*charge.recharge,
      ammoMs:(4500-count*750)*charge.ammo,footprint:(1-count*.12)*charge.footprint,
      guardMs:charge.guardMs,trackingMs:charge.trackingMs};
  };
  const inFlight=state=>state.projectiles.find(item=>item.friendly);
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const number=(n,lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi;
  const integer=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
  function inputOf(input={}) {
    return {...input,progress:clamp(finite(input.progress),0,24000),
      lanePos:clamp(finite(input.lanePos,1.5),0,3),speed:clamp(finite(input.speed,52),10,110),
      bar:clamp(finite(input.bar),0,100),syncCount:clamp(Math.floor(finite(input.syncCount)),0,4),
      adrenaline:clamp(finite(input.adrenaline),0,100),
      boosting:input.boosting===true,invulnerableMs:Math.max(0,finite(input.invulnerableMs))};
  }
  function create({difficultyId='standard',seed=27469}={}) {
    return {version:4,difficultyId:Object.hasOwn(SETTINGS,difficultyId)?difficultyId:'standard',
      seed:integer(seed,0,0xffffffff)?seed:27469,elapsedMs:0,lastBar:0,lastProgress:0,
      trackedLane:1.5,lastLanePos:1.5,spawnSeq:0,nextSpawnMs:4500,enemies:[],projectiles:[],wrecks:[],ledger:[],
      bossArrived:false,defeated:false,boss:null,projectileSeq:0,defendMs:0,disruptMs:0,
      turboPending:false,boosting:false,ramContacts:[],ammo:2,ammoMs:0,
      cooldowns:{attack:0,defend:0,turbo:0,disrupt:0},
      stats:{damageDealt:0,takedowns:0,playerHits:0,blocks:0,shots:0,
        attacks:0,defends:0,turbos:0,disrupts:0}};
  }
  function event(type,enemy,extras={}) {
    return {type,id:enemy?.id,kind:enemy?.kind,at:enemy?.at,lane:enemy?.lane,...extras};
  }
  function ledgerFor(state,id) {return state.ledger.find(item=>item.id===id);}
  function statsFromLedger(state) {
    state.stats.damageDealt=round(state.ledger.reduce((sum,item)=>sum+item.damage,0));
    state.stats.takedowns=state.ledger.filter(item=>item.hp===0).length;
  }
  function systemState(hp) {
    return SYSTEMS.map((id,index)=>({id,broken:hp<=8-index*4}));
  }
  function actorPose(enemy,input) {
    return {id:enemy.id,kind:enemy.kind,at:enemy.at,lane:enemy.lane,
      distance:enemy.at-input.progress,hp:enemy.hp,maxHp:enemy.maxHp,
      damage:1-enemy.hp/enemy.maxHp,ageMs:enemy.ageMs,
      phase:enemy.phase==='attack'?'committed':enemy.phase,
      warning:enemy.phase==='windup',locked:enemy.phase==='attack',
      lockLane:enemy.attackLane,attackKind:enemy.attackKind,boss:enemy.kind==='rig',
      vulnerable:['recover','stunned'].includes(enemy.phase),
      // Physical contacts are resolved once here, never by a second road hull.
      collidable:false,threatActive:enemy.phase==='attack',alpha:1};
  }
  function riderLane(wreck,settled=false) {
    const side=wreck.lane>=1.5?-1:1;
    return clamp(wreck.lane+side*RIDER_LANE_THROW*(settled?1:Math.min(1,wreck.ageMs/RIDER_LAND_MS)),0,3);
  }
  function bossPose(state,input) {
    if(!state.bossArrived)return null;
    const record=ledgerFor(state,'rig'),body=state.enemies.find(item=>item.id==='rig')||
      state.wrecks.find(item=>item.id==='rig');
    return {id:'rig',kind:'rig',arrived:true,at:body?.at??null,lane:body?.lane??1.5,
      hp:record.hp,maxHp:12,health:Math.ceil(record.hp/4),systems:systemState(record.hp),
      defeated:record.hp===0,phase:record.hp===0?'defeated':
        body?.phase==='attack'?'committed':body?.phase||'approach',alpha:1,
      visible:!!body&&body.at-input.progress<=440&&body.at-input.progress>=-720};
  }
  function targetFor(state,input) {
    const flight=inFlight(state);
    if(flight){const locked=state.enemies.find(enemy=>enemy.id===flight.targetId&&enemy.hp>0);
      return locked?{...actorPose(locked,input),attackMode:'shot',inFlight:true}:null;}
    const candidates=state.enemies.filter(enemy=>enemy.hp>0&&enemy.phase!=='flee')
      .map(enemy=>({enemy,d:enemy.at-input.progress,gap:Math.abs(enemy.lane-input.lanePos)}));
    const melee=candidates.filter(item=>item.d>=-65&&item.d<=75&&item.gap<=1.05)
      .sort((a,b)=>Math.abs(a.d)+a.gap*40-(Math.abs(b.d)+b.gap*40)||a.enemy.id.localeCompare(b.enemy.id))[0];
    if(melee)return {...actorPose(melee.enemy,input),attackMode:'strike'};
    const forward=candidates.filter(item=>item.d>=16&&item.d<=260&&item.gap<=.55)
      .sort((a,b)=>a.d-b.d||a.enemy.id.localeCompare(b.enemy.id))[0];
    return forward?{...actorPose(forward.enemy,input),attackMode:'shot'}:null;
  }
  function pose(state,input={}) {
    if(state?.version!==4)return null;
    const view=inputOf({...input,progress:input.progress??state.lastProgress,bar:input.bar??state.lastBar});
    const benefits=syncBenefits(view.syncCount,view.adrenaline),flight=inFlight(state);
    const active={attack:0,defend:state.defendMs,turbo:state.boosting?1:0,disrupt:state.disruptMs};
    return {version:4,actors:state.enemies.filter(enemy=>enemy.at-view.progress>=-300&&enemy.at-view.progress<=440)
        .map(enemy=>actorPose(enemy,view)),
      projectiles:state.projectiles.filter(item=>Math.abs(item.at-view.progress)<=440)
        .map(item=>({...item,distance:item.at-view.progress,warning:!item.friendly,collidable:false})),
      wrecks:state.wrecks.map(item=>({...item,phase:'wreck',wreck:true,distance:item.at-view.progress,
        flipAngle:item.flip?Math.min(1,item.ageMs/1600)*Math.PI*2:0,
        height:item.flip?Math.sin(Math.min(1,item.ageMs/1600)*Math.PI)*58:0,
        riderHeight:item.rider?Math.sin(Math.min(1,item.ageMs/RIDER_LAND_MS)*Math.PI)*95:0,
        riderOffset:item.rider?Math.min(110,item.ageMs*.06):0,
        riderAt:item.rider?item.at:null,riderLane:item.rider?riderLane(item):null,
        riderSide:item.lane>=1.5?-1:1,
        splattered:Number.isFinite(item.riderSplatAtMs),
        riderSplatAgeMs:Number.isFinite(item.riderSplatAtMs)?item.ageMs-item.riderSplatAtMs:0,
        alpha:clamp((720-(view.progress-item.at))/160,0,1)})),
      target:targetFor(state,view),boss:bossPose(state,view),
      skills:Object.fromEntries(Object.keys(SKILLS).map(kind=>[kind,{ready:state.cooldowns[kind]<=0&&(kind!=='attack'||!flight),
        cooldownMs:state.cooldowns[kind],rechargeMs:SKILLS[kind]*benefits.recharge,activeMs:active[kind],active:active[kind]>0,
        ...(kind==='attack'?{charges:state.ammo,inFlight:!!flight}:{}),...(kind==='turbo'?{pending:state.turboPending}:{})}])),
      syncCount:view.syncCount,adrenaline:view.adrenaline,benefits,footprint:round(benefits.footprint),stats:{...state.stats}};
  }
  function occupied(input,at,lane) {
    return (input.actors||[]).some(actor=>Number.isFinite(actor.at)&&Number.isFinite(actor.lane)&&
      !actor.cleared&&Math.abs(actor.at-at)<90&&Math.abs(actor.lane-lane)<.72);
  }
  function pulseConflict(input,at,lane) {
    return (input.protectedPulses||[]).some(pulse=>Number.isFinite(pulse.at)&&Number.isFinite(pulse.lane)&&
      Math.abs(pulse.at-at)<95&&Math.abs(pulse.lane-lane)<.85);
  }
  function laneFor(state,input,at,wanted,ignoreId=null) {
    const lanes=[0,1,2,3].sort((a,b)=>Math.abs(a-wanted)-Math.abs(b-wanted)||a-b);
    return lanes.find(lane=>!occupied(input,at,lane)&&!pulseConflict(input,at,lane)&&
      !state.enemies.some(enemy=>enemy.id!==ignoreId&&enemy.hp>0&&enemy.phase!=='flee'&&
        Math.abs(enemy.at-at)<100&&Math.abs(enemy.lane-lane)<.72)&&
      lanes.some(escape=>Math.abs(escape-lane)>=1&&!occupied(input,at,escape)&&
        !state.enemies.some(enemy=>enemy.id!==ignoreId&&enemy.hp>0&&enemy.phase!=='flee'&&
          Math.abs(enemy.at-at)<100&&Math.abs((['windup','attack'].includes(enemy.phase)?enemy.attackLane:enemy.lane)-escape)<.72)));
  }
  function attackRest(state) {
    // One readable opening follows a resolved/cancelled attack. Waiting
    // opponents do not immediately replace a dodged chassis with another tell.
    for(const enemy of state.enemies)enemy.rearmMs=Math.max(enemy.rearmMs,1100);
  }
  function staging(state) {
    const live=state.enemies.filter(enemy=>enemy.hp>0&&enemy.phase!=='flee');
    live.sort((a,b)=>Number(['windup','attack'].includes(b.phase))-Number(['windup','attack'].includes(a.phase))||
      Number(b.kind==='rig')-Number(a.kind==='rig')||b.ageMs-a.ageMs||a.id.localeCompare(b.id));
    return new Map(live.map((enemy,index)=>[enemy.id,index]));
  }
  function stagingLane(state,input,enemy,at) {
    const wanted=Math.round(enemy.lane);
    const lanes=[0,1,2,3].sort((a,b)=>Math.abs(a-wanted)-Math.abs(b-wanted)||a-b);
    const blocked=lane=>occupied(input,at,lane)||state.enemies.some(other=>other!==enemy&&other.hp>0&&other.phase!=='flee'&&
      Math.abs(other.at-at)<100&&Math.abs(other.lane-lane)<.72);
    return lanes.find(lane=>!blocked(lane)&&!pulseConflict(input,at,lane)&&
      lanes.some(escape=>Math.abs(escape-lane)>=1&&!blocked(escape)));
  }
  function moveIntoStage(state,input,enemy,dt,target) {
    // Traffic and announced pads keep their authored coordinates. Find room
    // around the desired band, then approach that space with the same finite
    // acceleration instead of stacking combat paint on a convoy or a pad.
    let chosen;
    for(const distance of [target,target+110,target+220,target-110]) {
      if(distance<35||distance>440)continue;
      const lane=stagingLane(state,input,enemy,input.progress+distance);
      if(lane!==undefined){chosen={distance,lane};break;}
    }
    moveToward(enemy,input,dt,chosen?.distance??Math.min(440,target+110));
    // A stunned/recovering target remains a usable physical opening. Separate
    // waiting vehicles along the road; do not sidestep a Turbo already closing
    // on a vulnerable chassis unless authored traffic or a pad requires it.
    if(['stunned','recover'].includes(enemy.phase)&&!occupied(input,enemy.at,enemy.lane)&&
      !pulseConflict(input,enemy.at,enemy.lane))return;
    const lane=stagingLane(state,input,enemy,enemy.at);
    const wanted=lane??chosen?.lane;
    if(wanted!==undefined)enemy.lane+=(wanted-enemy.lane)*(1-Math.exp(-dt/700));
  }
  function roleFor(state,bar) {
    const roles=bar<20?['bike','rammer']:bar<44?['bike','rammer','escort']:
      ['bike','rammer','escort','disruptor'];
    // Authored progression, with a deterministic starting-side variation.
    return roles[state.spawnSeq%roles.length];
  }
  function spawn(state,input,kind,events) {
    if(state.enemies.length>=MAX_ACTORS||state.ledger.length>=MAX_LEDGER)return false;
    const at=input.progress+230,wanted=(state.spawnSeq+(state.seed%4))%4;
    const lane=laneFor(state,input,at,wanted);if(lane===undefined)return false;
    const id=kind==='rig'?'rig':`foe-${state.spawnSeq++}`,hp=ROLES[kind].hp;
    state.enemies.push({id,kind,at,lane,hp,maxHp:hp,ageMs:0,phase:'approach',phaseMs:0,
      attackLane:lane,attackKind:ROLES[kind].attack,attackDone:false,rearmMs:1000});
    state.ledger.push({id,kind,hp,maxHp:hp,damage:0,spawnBar:input.bar,retired:false});
    if(kind==='rig'){state.bossArrived=true;events.push(event('boss-arrive',state.enemies.at(-1)));}
    else events.push(event('enemy-arrive',state.enemies.at(-1)));
    return true;
  }
  function hurt(state,enemy,amount,cause,events,chain=false) {
    if(!enemy||enemy.hp<=0)return;
    if(['windup','attack'].includes(enemy.phase))attackRest(state);
    const prior=enemy.hp,priorSystems=Math.ceil(prior/4);
    enemy.hp=round(Math.max(0,prior-amount));
    const dealt=round(prior-enemy.hp),record=ledgerFor(state,enemy.id);
    record.hp=enemy.hp;record.damage=round(record.maxHp-enemy.hp);
    events.push(event('enemy-hit',enemy,{damage:dealt,hp:enemy.hp,maxHp:enemy.maxHp,cause,chain}));
    if(enemy.kind==='rig'&&Math.ceil(enemy.hp/4)<priorSystems) {
      for(let remaining=priorSystems-1;remaining>=Math.ceil(enemy.hp/4);remaining--)
        events.push(event('boss-system-broken',enemy,{systemIndex:2-remaining,
          system:SYSTEMS[2-remaining],hp:enemy.hp,health:remaining,cause}));
    }
    if(enemy.hp===0) {
      enemy.phase='wreck';record.retired=true;
      state.projectiles=state.projectiles.filter(projectile=>projectile.friendly||projectile.sourceId!==enemy.id);
      state.wrecks.push({id:enemy.id,kind:enemy.kind,at:enemy.at,lane:enemy.lane,ageMs:0,
        rollMs:1600,flip:enemy.kind!=='rig',rider:enemy.kind==='bike',riderSplatAtMs:null,chain});
      if(state.wrecks.length>MAX_WRECKS)state.wrecks.shift();
      events.push(event('takedown',enemy,{damage:dealt,hp:0,maxHp:enemy.maxHp,cause,chain,
        flip:enemy.kind!=='rig',rider:enemy.kind==='bike'}));
      if(enemy.kind==='rig') {
        state.defeated=true;
        for(const remaining of state.enemies)if(remaining.hp>0){remaining.phase='flee';remaining.phaseMs=0;}
        state.projectiles=state.projectiles.filter(projectile=>projectile.friendly);
        events.push(event('boss-defeated',enemy,{cause}));
      }
      // One physical explosion can affect at most two neighbours. Secondary
      // explosions never recurse into an unbounded or offscreen cascade.
      if(!chain&&cause!=='shot'&&cause!=='reflected')for(const other of state.enemies.filter(item=>item.id!==enemy.id&&item.hp>0&&
        Math.abs(item.at-enemy.at)<=95&&Math.abs(item.lane-enemy.lane)<=1.2).slice(0,2))
        hurt(state,other,other.kind==='rig'?.5:1,'chain',events,true);
    } else if(enemy.kind!=='rig') {enemy.phase='stunned';enemy.phaseMs=0;enemy.rearmMs=0;}
    if(state.defeated)for(const remaining of state.enemies)if(remaining.hp>0)remaining.phase='flee';
    statsFromLedger(state);
  }
  function stagger(enemy) {
    if(enemy&&enemy.hp>0){enemy.phase='stunned';enemy.phaseMs=0;enemy.attackDone=true;enemy.rearmMs=0;}
  }
  function ram(state,input,source,events) {
    if(!source||!Number.isFinite(source.hp)||source.hp<=0||source.phase==='flee'||state.ramContacts.includes(source.id))return;
    state.ramContacts.push(source.id);
    hurt(state,source,2*syncBenefits(input.syncCount,input.adrenaline).power,'turbo',events);
    stagger(source);
    events.push(event('ram-impact',source,{cause:'turbo',combat:true}));
  }
  function contact(state,input,source,events,kind) {
    if(input.boosting) {
      // Absorbing a bullet is not chassis contact with its distant shooter.
      if(kind!=='combat projectile')ram(state,input,source,events);
      events.push(event('defend',source,{cause:'turbo',combat:true}));return;
    }
    if(state.defendMs>0) {
      state.defendMs=0;state.stats.blocks++;
      if(kind==='combat projectile'&&source?.hp>0&&!inFlight(state)&&state.projectiles.length<MAX_PROJECTILES) {
        const reflected={id:`shot-${state.projectileSeq++}`,sourceId:'player',owner:'player',friendly:true,
          targetId:source.id,at:input.progress+12,lane:input.lanePos,ageMs:0,
          damage:syncBenefits(input.syncCount,input.adrenaline).power,kind:'reflected'};
        state.projectiles.push(reflected);
        events.push(event('shot',source,{projectile:copy(reflected),cause:'guard',combat:true}));
      } else if(source?.hp>0)hurt(state,source,(1+input.syncCount*.15)*
        (B.CacheRoadAdrenaline?.benefits?.(input.adrenaline)?.power||1),'guard',events);
      stagger(source);
      events.push(event('defend',source,{cause:'guard',combat:true}));return;
    }
    if(input.invulnerableMs>0||events.some(item=>item.type==='hit')) {
      events.push(event('evaded',source,{reason:'grace'}));return;
    }
    state.stats.playerHits++;
    events.push(event('hit',source,{kind,combat:true}));
  }
  function act(state,kind,rawInput={}) {
    if(state?.version!==4||!Object.hasOwn(SKILLS,kind))return {accepted:false,reason:'unavailable',events:[]};
    const input=inputOf({...rawInput,progress:rawInput.progress??state.lastProgress,bar:rawInput.bar??state.lastBar});
    if(state.defeated)return {accepted:false,reason:'runway',events:[]};
    if(state.cooldowns[kind]>0)return {accepted:false,reason:'recharging',events:[]};
    const events=[],benefits=syncBenefits(input.syncCount,input.adrenaline);
    if(kind==='attack'&&inFlight(state))return {accepted:false,reason:'in-flight',events:[]};
    if(kind==='attack') {
      const target=targetFor(state,input);
      if(!target)return {accepted:false,reason:'no-target',events:[]};
      if(target.attackMode==='shot'&&(state.ammo<=0||state.projectiles.length>=MAX_PROJECTILES))
        return {accepted:false,reason:'weapon-recharging',events:[]};
      state.cooldowns.attack=SKILLS.attack*benefits.recharge;state.stats.attacks++;
      const enemy=state.enemies.find(item=>item.id===target.id);
      events.push(event('attack',enemy,{mode:target.attackMode,combat:true}));
      if(target.attackMode==='strike') {
        const damage=(enemy.kind==='rig'&&!target.vulnerable?.65:1.2)*benefits.power;
        hurt(state,enemy,damage,'strike',events);
      } else {
        state.ammo--;state.stats.shots++;
        const shot={id:`shot-${state.projectileSeq++}`,sourceId:'player',owner:'player',friendly:true,
          targetId:enemy.id,at:input.progress+12,lane:input.lanePos,ageMs:0,
          damage:benefits.power,kind:'shot'};
        state.projectiles.push(shot);events.push(event('shot',enemy,{projectile:copy(shot),combat:true}));
      }
    } else if(kind==='defend') {
      state.cooldowns.defend=SKILLS.defend*benefits.recharge;
      state.defendMs=800+input.syncCount*50+benefits.guardMs;state.stats.defends++;
      events.push({type:'defend-ready',durationMs:state.defendMs,combat:true});
    } else if(kind==='turbo') {
      state.cooldowns.turbo=SKILLS.turbo*benefits.recharge;state.turboPending=true;state.stats.turbos++;
      // Only the road's next-ONE trajectory starts physical boost contact.
      events.push({type:'turbo',durationMs:1400+input.syncCount*100,combat:true});
    } else {
      state.cooldowns.disrupt=SKILLS.disrupt*benefits.recharge;state.disruptMs=1200+input.syncCount*100;state.stats.disrupts++;
      const affected=state.enemies.filter(enemy=>Math.abs(enemy.at-input.progress)<=260&&enemy.hp>0);
      for(const enemy of affected)stagger(enemy);
      attackRest(state);
      const removed=state.projectiles.filter(item=>!item.friendly&&Math.abs(item.at-input.progress)<=320);
      state.projectiles=state.projectiles.filter(item=>!removed.includes(item));
      events.push({type:'disrupt',at:input.progress,lane:input.lanePos,
        ids:affected.map(enemy=>enemy.id),projectiles:removed.map(item=>item.id),durationMs:state.disruptMs,combat:true});
    }
    state.enemies=state.enemies.filter(enemy=>enemy.hp>0);
    state.boss=bossPose(state,input);
    return {accepted:true,reason:'accepted',events};
  }
  function moveToward(enemy,input,dt,target) {
    const distance=enemy.at-input.progress;
    const chaseSpeed=input.boosting?Math.min(input.speed,52):input.speed;
    enemy.at+=Math.max(0,chaseSpeed+clamp((target-distance)*.75,-32,48))*dt/1000;
  }
  function sweepInterval(from,to,lo,hi) {
    if(Math.abs(to-from)<1e-9)return from>=lo&&from<=hi?[0,1]:null;
    const a=(lo-from)/(to-from),b=(hi-from)/(to-from);
    const start=Math.max(0,Math.min(a,b)),end=Math.min(1,Math.max(a,b));
    return start<=end?[start,end]:null;
  }
  function stepWrecks(state,input,before,beforeLane,dt,events) {
    for(const wreck of state.wrecks) {
      const oldAt=wreck.at,oldAge=wreck.ageMs;
      wreck.ageMs+=dt;wreck.at+=8*dt/1000;
      if(!wreck.rider||Number.isFinite(wreck.riderSplatAtMs)||wreck.ageMs<RIDER_LAND_MS)continue;
      const lane=riderLane(wreck,true);
      const longitudinal=sweepInterval(oldAt-before,wreck.at-input.progress,-12,20);
      const lateral=sweepInterval(beforeLane,input.lanePos,lane-RIDER_CONTACT_GAP,lane+RIDER_CONTACT_GAP);
      if(!longitudinal||!lateral)continue;
      const start=Math.max(longitudinal[0],lateral[0],(RIDER_LAND_MS-oldAge)/dt,0);
      if(start>Math.min(longitudinal[1],lateral[1],1))continue;
      wreck.riderSplatAtMs=oldAge+dt*start;
      // Grounded rider contact is cosmetic. It never creates another hostile
      // takedown, damage-ledger entry, point award or player integrity hit.
      events.push(event('rider-splatter',wreck,{lane,combat:true}));
    }
    state.wrecks=state.wrecks.filter(wreck=>input.progress-wreck.at<=720&&wreck.ageMs<=30000);
  }
  function step(state,delta,rawInput={}) {
    if(state?.version!==4)return [];
    const dt=clamp(finite(delta),0,100),input=inputOf(rawInput),events=[];
    if(!dt)return events;
    const before=state.lastProgress,beforeLane=state.lastLanePos??input.lanePos,tuning=SETTINGS[state.difficultyId];
    const benefits=syncBenefits(input.syncCount,input.adrenaline);
    state.lastProgress=input.progress;state.lastBar=Math.max(state.lastBar,input.bar);state.elapsedMs+=dt;
    state.lastLanePos=input.lanePos;
    state.trackedLane+=(input.lanePos-state.trackedLane)*Math.min(1,dt/
      (260+input.syncCount*140+benefits.trackingMs));
    state.defendMs=Math.max(0,state.defendMs-dt);state.disruptMs=Math.max(0,state.disruptMs-dt);
    if((!input.boosting||!state.boosting)&&state.ramContacts.length)state.ramContacts=[];
    state.boosting=input.boosting;if(input.boosting)state.turboPending=false;
    for(const kind of Object.keys(SKILLS))state.cooldowns[kind]=Math.max(0,state.cooldowns[kind]-dt);
    if(state.ammo<2){state.ammoMs+=dt;const refill=benefits.ammoMs;
      if(state.ammoMs>=refill){state.ammo++;state.ammoMs=Math.max(0,state.ammoMs-refill);}}
    else state.ammoMs=0;
    stepWrecks(state,input,before,beforeLane,dt,events);
    if(!state.defeated&&input.bar>=72&&!state.bossArrived) {
      // The rig gets a reserved slot; an old escaping foe is allowed to leave
      // naturally, rather than teleporting another hostile into the road.
      if(state.enemies.length>=MAX_ACTORS){const oldest=state.enemies.find(enemy=>enemy.kind!=='rig');
        if(oldest){oldest.phase='flee';oldest.phaseMs=0;}}
      spawn(state,input,'rig',events);
    }
    if(!state.defeated&&input.bar>=4&&input.bar<88&&state.elapsedMs>=state.nextSpawnMs&&
        state.enemies.length<MAX_ACTORS&&(!state.bossArrived||state.enemies.length<2)) {
      if(spawn(state,input,roleFor(state,input.bar),events))state.nextSpawnMs=state.elapsedMs+
        tuning.spawnMs+(state.bossArrived?3500:0)+input.syncCount*200;
    }
    const previousPositions=new Map(state.enemies.map(enemy=>[enemy.id,{at:enemy.at,lane:enemy.lane}]));
    const slots=staging(state);
    for(const enemy of state.enemies) {
      if(enemy.hp<=0)continue;
      enemy.ageMs+=dt;enemy.phaseMs+=dt;enemy.rearmMs=Math.max(0,enemy.rearmMs-dt);
      if(enemy.kind!=='rig'&&enemy.ageMs>30000&&enemy.phase!=='attack')enemy.phase='flee';
      if(enemy.phase==='flee'){enemy.at+=8*dt/1000;continue;}
      if(enemy.phase==='stunned') {
        moveIntoStage(state,input,enemy,dt,slots.get(enemy.id)===0?42:210+(slots.get(enemy.id)-1)*130);
        if(enemy.phaseMs>=1700){enemy.phase='recover';enemy.phaseMs=0;}continue;
      }
      if(enemy.phase==='recover') {
        moveIntoStage(state,input,enemy,dt,slots.get(enemy.id)===0?42:210+(slots.get(enemy.id)-1)*130);
        if(enemy.phaseMs>=2400+input.syncCount*100){enemy.phase='approach';enemy.phaseMs=0;}
        continue;
      }
      if(enemy.phase==='approach') {
        const slot=slots.get(enemy.id),target=slot===0?70:210+(slot-1)*130;
        moveIntoStage(state,input,enemy,dt,target);
        const distance=enemy.at-input.progress;
        if(slot===0&&distance>=35&&distance<=160&&enemy.phaseMs>=800&&enemy.rearmMs<=0&&state.disruptMs<=0&&
            !state.projectiles.some(projectile=>!projectile.friendly)&&
            !state.enemies.some(other=>other!==enemy&&['windup','attack'].includes(other.phase))) {
          const wanted=input.syncCount>=3?state.trackedLane:input.lanePos;
          const lane=laneFor(state,input,enemy.at,wanted,enemy.id);
          if(lane!==undefined){enemy.attackLane=lane;enemy.phase='windup';enemy.phaseMs=0;
            enemy.attackKind=enemy.kind==='rig'?ROLES.rig.attack:ROLES[enemy.kind].attack;
            if(enemy.kind==='rig')enemy.attackKind=enemy.hp>8?'scan':enemy.hp>4?'ram':'pulse';
            events.push(event('warning',enemy,{lockLane:lane,attackKind:enemy.attackKind,
              warningMs:tuning.warningMs+input.syncCount*100}));}
        }
        continue;
      }
      if(enemy.phase==='windup') {
        enemy.at+=(input.boosting?Math.min(input.speed,52):input.speed)*dt/1000;
        enemy.lane+=(enemy.attackLane-enemy.lane)*(1-Math.exp(-dt/200));
        if(pulseConflict(input,enemy.at,enemy.attackLane)||occupied(input,enemy.at,enemy.attackLane)) {
          enemy.phase='recover';enemy.phaseMs=0;
          attackRest(state);
          events.push(event('disengage',enemy,{reason:'protected-road-address'}));continue;
        }
        if(enemy.phaseMs>=tuning.warningMs+input.syncCount*100) {
          enemy.phase='attack';enemy.phaseMs=0;enemy.attackDone=false;
          events.push(event('lock',enemy,{lockLane:enemy.attackLane,attackKind:enemy.attackKind}));
          if(['shot','scan','pulse'].includes(enemy.attackKind)&&state.projectiles.length<MAX_PROJECTILES) {
            const projectile={id:`shot-${state.projectileSeq++}`,sourceId:enemy.id,owner:'enemy',friendly:false,
              at:enemy.at,lane:enemy.attackLane,ageMs:0,damage:1,kind:enemy.attackKind};
            state.projectiles.push(projectile);enemy.attackDone=true;enemy.phase='recover';enemy.phaseMs=0;
            attackRest(state);
            events.push(event('enemy-shot',enemy,{projectile:copy(projectile)}));
          }
        }
        continue;
      }
      if(enemy.phase==='attack') {
        enemy.at+=8*dt/1000;enemy.lane+=(enemy.attackLane-enemy.lane)*(1-Math.exp(-dt/200));
        const distance=enemy.at-input.progress;
        if(!enemy.attackDone&&distance<=22) {
          enemy.attackDone=true;
          attackRest(state);
          if(pulseConflict(input,enemy.at,enemy.attackLane)||occupied(input,enemy.at,enemy.attackLane))
            events.push(event('disengage',enemy,{reason:'protected-road-address'}));
          else if(Math.abs(input.lanePos-enemy.attackLane)<tuning.gap)
            contact(state,input,enemy,events,enemy.kind==='bike'?'bike':'combat '+enemy.kind);
          else events.push(event('evaded',enemy,{gap:Math.abs(input.lanePos-enemy.attackLane),opening:true}));
          if(enemy.hp>0&&enemy.phase==='attack'){enemy.phase='recover';enemy.phaseMs=0;}
        }
      }
    }
    if(input.boosting)for(const enemy of state.enemies) {
      const old=previousPositions.get(enemy.id);
      const distance=enemy.at-input.progress;
      const overlaps=distance>=-18&&distance<=RAM_REACH;
      const crossed=old&&old.at-before>RAM_REACH&&distance<=RAM_REACH;
      if(old&&(overlaps||crossed)&&Math.abs(enemy.lane-input.lanePos)<.62)ram(state,input,enemy,events);
    }
    const kept=[];
    for(const projectile of state.projectiles) {
      if(!projectile.friendly&&(state.defeated||ledgerFor(state,projectile.sourceId)?.hp===0))continue;
      const oldAt=projectile.at;projectile.ageMs+=dt;
      projectile.at+=(projectile.friendly?input.speed+260:-70)*dt/1000;
      let consumed=false;
      if(projectile.friendly) {
        const enemy=state.enemies.find(item=>item.id===projectile.targetId&&item.hp>0&&oldAt<=item.at+12&&projectile.at>=item.at-12&&
          Math.abs(item.lane-projectile.lane)<.62);
        if(enemy){hurt(state,enemy,projectile.damage,projectile.kind==='reflected'?'reflected':'shot',events);consumed=true;}
      } else if(projectile.at-input.progress<=16&&oldAt-before>16) {
        const source=state.enemies.find(item=>item.id===projectile.sourceId);
        if(Math.abs(input.lanePos-projectile.lane)<tuning.gap&&!pulseConflict(input,projectile.at,projectile.lane))
          contact(state,input,source||projectile,events,'combat projectile');
        else events.push(event('evaded',source||projectile,{opening:true}));
        consumed=true;
        attackRest(state);
      }
      if(!consumed&&projectile.ageMs<=1800&&Math.abs(projectile.at-input.progress)<=460)kept.push(projectile);
    }
    state.projectiles=kept.slice(0,MAX_PROJECTILES);
    state.enemies=state.enemies.filter(enemy=>{
      if(enemy.hp<=0)return false;
      if(enemy.kind!=='rig'&&input.progress-enemy.at>300){ledgerFor(state,enemy.id).retired=true;return false;}
      return true;
    });
    state.boss=bossPose(state,input);
    return events;
  }
  function snapshot(state,{progress=state?.lastProgress}={}) {
    if(state?.version!==4)return null;
    if(!number(progress,0,24000)||Math.abs(progress-state.lastProgress)>220)return null;
    const saved=copy(state),shift=progress-state.lastProgress;
    // The road checkpoints at its whole-bar trajectory anchor. Translate
    // every copied physical actor equally so that relative positions survive
    // that rewind; damage and source identities are never reconstructed.
    for(const item of [...saved.enemies,...saved.projectiles,...saved.wrecks])item.at+=shift;
    saved.lastProgress=progress;saved.boss=bossPose(saved,inputOf({progress,bar:state.lastBar}));
    // A checkpoint never preserves an unseen projectile or partial commitment.
    saved.projectiles=[];saved.defendMs=0;saved.disruptMs=0;saved.turboPending=false;saved.boosting=false;saved.ramContacts=[];
    return saved;
  }
  function restore(raw,{progress=raw?.lastProgress,bar=raw?.lastBar}={}) {
    if(!object(raw)||raw.version!==4||!Object.hasOwn(SETTINGS,raw.difficultyId)||
      !integer(raw.seed,0,0xffffffff)||!number(raw.elapsedMs,0,1e10)||!number(raw.lastBar,0,100)||
      !number(raw.lastProgress,0,24000)||!number(progress,0,24000)||!number(bar,0,100)||
      Math.abs(progress-raw.lastProgress)>.001||bar<Math.floor(raw.lastBar)-.001||bar>raw.lastBar+.001||
      !number(raw.trackedLane,0,3)||!integer(raw.spawnSeq,0,MAX_LEDGER)||
      (Object.hasOwn(raw,'lastLanePos')&&!number(raw.lastLanePos,0,3))||
      !number(raw.nextSpawnMs,0,1e10)||!integer(raw.projectileSeq,0,1e6)||
      !integer(raw.ammo,0,2)||!number(raw.ammoMs,0,4500)||!object(raw.cooldowns)||
      Object.keys(SKILLS).some(kind=>!number(raw.cooldowns[kind],0,SKILLS[kind]))||
      !Array.isArray(raw.ledger)||raw.ledger.length>MAX_LEDGER||
      !Array.isArray(raw.enemies)||raw.enemies.length>MAX_ACTORS||
      !Array.isArray(raw.wrecks)||raw.wrecks.length>MAX_WRECKS||
      !Array.isArray(raw.projectiles)||raw.projectiles.length||raw.defendMs!==0||raw.disruptMs!==0||
      raw.boosting!==false||raw.turboPending!==false||typeof raw.bossArrived!=='boolean'||
      typeof raw.defeated!=='boolean'||!object(raw.stats))return null;
    const ids=new Set();
    for(const item of raw.ledger) {
      if(!object(item)||!Object.hasOwn(ROLES,item.kind)||typeof item.id!=='string'||ids.has(item.id)||
        (item.kind==='rig'?item.id!=='rig':!/^foe-\d{1,2}$/.test(item.id))||
        item.maxHp!==ROLES[item.kind].hp||!number(item.hp,0,item.maxHp)||
        !number(item.damage,0,item.maxHp)||Math.abs(item.damage+item.hp-item.maxHp)>1e-5||
        !number(item.spawnBar,4,raw.lastBar)||typeof item.retired!=='boolean'||
        (item.hp===0&&!item.retired)||(item.kind==='rig'&&item.spawnBar<72)||
        (item.kind!=='rig'&&item.kind!==roleFor({spawnSeq:Number(item.id.slice(4))},item.spawnBar)))return null;
      ids.add(item.id);
    }
    if(raw.ledger.filter(item=>item.kind!=='rig').length!==raw.spawnSeq||
      raw.ledger.some(item=>item.kind!=='rig'&&Number(item.id.slice(4))>=raw.spawnSeq))return null;
    const rig=raw.ledger.find(item=>item.id==='rig');
    if(raw.bossArrived!==!!rig||raw.defeated!==!!(rig&&rig.hp===0)||
      (rig?!object(raw.boss)||raw.boss.id!=='rig'||raw.boss.hp!==rig.hp||raw.boss.maxHp!==12||
        raw.boss.health!==Math.ceil(rig.hp/4)||raw.boss.defeated!==raw.defeated||
        JSON.stringify(raw.boss.systems)!==JSON.stringify(systemState(rig.hp)):raw.boss!==null))return null;
    const liveIds=new Set();
    for(const enemy of raw.enemies) {
      const item=raw.ledger.find(record=>record.id===enemy?.id);
      if(!object(enemy)||!item||item.retired||item.hp<=0||liveIds.has(enemy.id)||enemy.kind!==item.kind||
        enemy.hp!==item.hp||enemy.maxHp!==item.maxHp||!number(enemy.at,0,25000)||
        Math.abs(enemy.at-progress)>750||!number(enemy.lane,0,3)||!number(enemy.ageMs,0,1e10)||
        !number(enemy.phaseMs,0,1e10)||!number(enemy.rearmMs,0,1400)||
        !['approach','windup','attack','recover','stunned','flee'].includes(enemy.phase)||
        !integer(enemy.attackLane,0,3)||!['kick','ram','shot','scan','pulse'].includes(enemy.attackKind)||
        typeof enemy.attackDone!=='boolean')return null;
      liveIds.add(enemy.id);
    }
    if(raw.ledger.some(item=>item.hp>0&&!item.retired&&!liveIds.has(item.id)))return null;
    const wreckIds=new Set();
    for(const wreck of raw.wrecks) {
      const item=raw.ledger.find(record=>record.id===wreck?.id);
      if(!object(wreck)||!item||item.hp!==0||wreckIds.has(wreck.id)||wreck.kind!==item.kind||
        !number(wreck.at,0,25000)||!number(wreck.lane,0,3)||!number(wreck.ageMs,0,30000)||
        wreck.rollMs!==1600||wreck.flip!==(item.kind!=='rig')||wreck.rider!==(item.kind==='bike')||
        (Object.hasOwn(wreck,'riderSplatAtMs')&&wreck.riderSplatAtMs!==null&&
          (!wreck.rider||!number(wreck.riderSplatAtMs,RIDER_LAND_MS,wreck.ageMs)))||
        typeof wreck.chain!=='boolean')return null;
      wreckIds.add(wreck.id);
    }
    const damage=round(raw.ledger.reduce((sum,item)=>sum+item.damage,0));
    if(raw.stats.damageDealt!==damage||raw.stats.takedowns!==raw.ledger.filter(item=>item.hp===0).length||
      ['playerHits','blocks','shots','attacks','defends','turbos','disrupts'].some(key=>!integer(raw.stats[key],0,1e6))||
      raw.stats.shots>raw.stats.attacks||raw.stats.blocks>raw.stats.defends||
      (damage>0&&raw.stats.attacks+raw.stats.blocks+raw.stats.turbos===0))return null;
    const state=copy(raw);state.lastProgress=progress;state.ramContacts=[];
    // A legacy checkpoint has no physical previous lane. The first step uses
    // its actual input lane rather than inventing a sweep from tracking lag.
    for(const wreck of state.wrecks)if(!Object.hasOwn(wreck,'riderSplatAtMs'))wreck.riderSplatAtMs=null;
    for(const enemy of state.enemies) {
      enemy.phase=state.defeated?'flee':'approach';enemy.phaseMs=0;enemy.rearmMs=1400;enemy.attackDone=true;
      enemy.attackLane=Math.round(enemy.lane);
    }
    state.boss=bossPose(state,inputOf({progress,bar}));
    return state;
  }
  B.CacheRoadCombat={create,step,act,pose,snapshot,restore,syncBenefits,
    rewardSync(state,perfect=false){if(state?.version!==4)return;
      for(const kind of Object.keys(SKILLS))state.cooldowns[kind]=Math.max(0,state.cooldowns[kind]-(perfect?500:250));},roles:ROLES,settings:SETTINGS,
    limits:Object.freeze({actors:MAX_ACTORS,projectiles:MAX_PROJECTILES,wrecks:MAX_WRECKS,ledger:MAX_LEDGER})};
})(window.BARCODE=window.BARCODE||{});
