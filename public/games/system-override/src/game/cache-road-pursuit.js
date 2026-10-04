// The clean copy gets one physical road address and one committed lane.
// The road owns clocks, damage, sound, save boundaries and presentation.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-pursuit.js',
  exports: ['BARCODE.CacheRoadPursuit'], dependencies: [] });
(function(B) {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const MAX_SPEED = 75;
  const WAVES = Object.freeze([
    Object.freeze({ id: 'scan-lesson', bar: 58, label: 'surveillance', lesson: true }),
    Object.freeze({ id: 'pursuit-approach', bar: 77, label: 'approach' }),
    Object.freeze({ id: 'pursuit-interception', bar: 83, label: 'interception' }),
    Object.freeze({ id: 'pursuit-last-pass', bar: 88, label: 'last-pass' })
  ]);
  const TUNING = Object.freeze({
    relaxed: Object.freeze({ lead: 180, lockMs: 600, gap: .48 }),
    standard: Object.freeze({ lead: 155, lockMs: 450, gap: .52 }),
    overclocked: Object.freeze({ lead: 140, lockMs: 350, gap: .55 })
  });
  const ECHO_RUNWAY = 65;
  const SAFE_RADIUS = 90;
  function createLegacy({ barFloat = 0 } = {}) {
    const bar = Math.max(0, finite(barFloat));
    return { version: 1, lastBar: bar,
      // Checkpoint recovery never recreates a half-finished, unseen strike.
      // A marker exactly at an announcement still receives its full runway.
      announced: WAVES.filter(wave => wave.bar < bar - .001).map(wave => wave.id),
      actor: null, phase: bar >= 92 ? 'delivery' : bar >= 90 ? 'prepare-delivery' : bar >= 76 ? 'approach' : 'quiet',
      prepareAnnounced: bar >= 90, deliveryAnnounced: bar >= 92,
      deliveryActorCreated: false };
  }
  function blocks(actors, at, lane) {
    return actors.some(actor => Number.isFinite(actor.at) && Number.isFinite(actor.lane) &&
      !actor.cleared && Math.abs(actor.at - at) <= SAFE_RADIUS && Math.abs(actor.lane - lane) < .72);
  }
  function pulseConflict(input, at, lane) {
    const pulses = Array.isArray(input.protectedPulses) ? input.protectedPulses :
      [{ at: input.protectedAt, lane: input.protectedLane }];
    return pulses.some(pulse => Number.isFinite(pulse.at) && Number.isFinite(pulse.lane) &&
      Math.abs(pulse.at - at) <= SAFE_RADIUS && Math.abs(pulse.lane - lane) < .9);
  }
  function chooseLane(input, actor, wanted) {
    const actors = Array.isArray(input.actors) ? input.actors : [];
    const target = clamp(finite(wanted, 1.5), 0, 3);
    const lanes = [0, 1, 2, 3].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
    return lanes.find(lane => !pulseConflict(input, actor.at, lane) &&
      !blocks(actors, actor.at, lane) &&
      [lane - 1, lane + 1].some(escape => escape >= 0 && escape <= 3 &&
        !blocks(actors, actor.at, escape)));
  }
  function smooth(n) { const u = clamp(n, 0, 1); return u * u * (3 - 2 * u); }
  function startTurn(actor, lane) {
    actor.turnFrom = actor.lane; actor.targetLane = lane; actor.turnMs = 0;
  }
  function advanceTurn(actor, dt) {
    actor.turnMs += dt;
    actor.lane = actor.turnFrom + (actor.targetLane - actor.turnFrom) * smooth(actor.turnMs / 400);
  }
  function event(type, actor, extras = {}) {
    return { type, id: actor?.id || 'delivery-runway', at: actor?.at,
      lane: actor?.targetLane, lesson: !!actor?.lesson, ...extras };
  }
  function stepLegacy(state, input = {}) {
    if (!state || state.version !== 1) return [];
    const progress = Math.max(0, finite(input.progress));
    const before = finite(input.before, progress);
    const bar = Math.max(state.lastBar, finite(input.barFloat, state.lastBar));
    const dt = clamp(finite(input.dt), 0, 100);
    const tuning = TUNING[input.difficultyId] || TUNING.standard;
    const events = [];
    state.lastBar = bar;
    if (bar >= 92) {
      state.phase = 'delivery';
      if (!state.deliveryAnnounced) {
        state.deliveryAnnounced = true;
        events.push(event('stage', null, { stage: 'delivery' }));
      }
      // The right-lane Echo split owns this section. There is no hidden last
      // interception underneath the gate, even following a gear change.
      if (state.actor && !state.actor.delivery && !state.actor.crossed) {
        state.actor.crossed = true; state.actor.aborted = true;
        state.actor.recoverMs = 900; state.actor.warning = false;
      }
      if (!state.deliveryActorCreated && Number.isFinite(input.gateAt)) {
        state.deliveryActorCreated = true;
        if (input.gateAt > progress) {
          // This is the actual clean-copy car at the exit. It follows the
          // replay visibly, but cannot add a hidden collision to the split.
          state.actor = { id: 'delivery-audit', stage: 'delivery-audit', delivery: true,
            at: input.gateAt, lane: 1.5, targetLane: 1.5, turnFrom: 1.5,
            turnMs: 0, ageMs: 0, recoverMs: 0, locked: false, warning: true,
            echoCommitted: false, crossed: false, aborted: false, lesson: false };
        }
      }
    } else {
      if (bar >= 90) {
        state.phase = 'prepare-delivery';
        if (!state.prepareAnnounced) {
          state.prepareAnnounced = true;
          events.push(event('stage', null, { stage: 'prepare-delivery' }));
        }
      }
      const wave = WAVES.find(item => bar >= item.bar && !state.announced.includes(item.id));
      if (wave) {
        // Audio resume may jump ahead. Expired waves are skipped, never
        // stacked together at the current car location.
        state.announced.push(wave.id);
        if (bar - wave.bar < .5) {
          const initialLane = clamp(Math.round(finite(input.lane, 1.5)), 0, 3);
          state.actor = { id: wave.id, stage: wave.label, lesson: !!wave.lesson,
            at: progress + tuning.lead, lane: initialLane <= 1 ? 3 : 0,
            targetLane: initialLane, turnFrom: initialLane <= 1 ? 3 : 0,
            turnMs: 0, ageMs: 0, recoverMs: 0, locked: false,
            warning: true, echoCommitted: false, crossed: false, aborted: false,
            lead: tuning.lead, lockMs: tuning.lockMs, gap: tuning.gap };
          state.phase = wave.label;
          events.push(event('stage', state.actor, { stage: wave.label }));
          events.push(event('warning', state.actor));
          if (wave.lesson) events.push(event('refill', state.actor, { amount: 100 }));
        }
      }
    }
    const actor = state.actor;
    if (!actor) return events;
    const distance = actor.at - progress;
    if (actor.crossed) {
      if (actor.delivery && actor.echoCommitted) advanceTurn(actor, dt);
      actor.recoverMs += dt;
      if (actor.aborted && actor.recoverMs > 1500 || distance < -240) state.actor = null;
      return events;
    }
    if (actor.delivery) {
      const echoLane = input.echo?.lanePos ?? input.echo?.lane;
      if (!actor.echoCommitted && input.echo && input.echoActive !== false && Number.isFinite(echoLane)) {
        actor.locked = true; actor.echoCommitted = true;
        actor.echoLane = clamp(echoLane, 0, 3); startTurn(actor, actor.echoLane);
        events.push(event('echo-lock', actor, { delivery: true }));
      }
      if (actor.echoCommitted) advanceTurn(actor, dt);
      if (before < actor.at && progress >= actor.at) {
        actor.crossed = true; actor.warning = false;
        events.push(event('delivery-pass', actor, { delivery: true, echoCommitted: actor.echoCommitted }));
      }
      return events;
    }
    if (actor.locked && pulseConflict(input, actor.at, actor.targetLane)) {
      // A gear-dependent pad can be published after the rival's lane lock.
      // Keep both addresses fixed and concede the pass instead of moving
      // an announced target or hiding a solid opponent beneath safe paint.
      actor.crossed = true; actor.aborted = true; actor.warning = false;
      events.push(event('disengage', actor, { reason: 'new-pulse-corridor' }));
      return events;
    }
    actor.ageMs += dt;
    if (!actor.locked) {
      const target = chooseLane(input, actor, input.lane);
      if (target !== undefined) actor.targetLane = target;
      actor.lane += (actor.targetLane - actor.lane) * Math.min(1, dt / 190);
      if (actor.ageMs >= actor.lockMs) {
        if (target === undefined) {
          actor.crossed = true; actor.aborted = true; actor.warning = false;
          events.push(event('disengage', actor, { reason: 'no-clear-corridor' }));
          return events;
        }
        actor.locked = true;
        actor.lockProgress = progress;
        startTurn(actor, target);
        events.push(event('lock', actor));
      }
    }
    const echoLane = input.echo?.lanePos ?? input.echo?.lane;
    if (!actor.echoCommitted && actor.locked && input.echo && input.echoActive !== false &&
        Number.isFinite(echoLane) && distance >= ECHO_RUNWAY) {
      const target = chooseLane(input, actor, echoLane);
      // A nearby pad and its escape corridor take priority over the lure.
      // Only visibly committing to the decoy counts as an Echo deception.
      if (target !== undefined && Math.abs(target - echoLane) < .6) {
        actor.echoCommitted = true; actor.echoLane = target;
        startTurn(actor, target);
        events.push(event('echo-lock', actor));
      }
    }
    if (actor.locked) {
      advanceTurn(actor, dt);
    }
    if (before < actor.at && progress >= actor.at) {
      actor.crossed = true; actor.warning = false; actor.recoverMs = 0;
      state.phase = 'recover';
      const gap = Math.abs(actor.lane - finite(input.lane, 1.5));
      if (gap < actor.gap) events.push(event('hit', actor, { kind: 'clean copy', gap }));
      else if (actor.echoCommitted && Math.abs(actor.echoLane - finite(input.lane, 1.5)) >= .7)
        events.push(event('deception', actor, { gap }));
      else events.push(event('evaded', actor, { gap }));
    }
    return events;
  }
  function poseLegacy(state, { progress = 0 } = {}) {
    const actor = state?.actor;
    if (!actor || actor.at - progress > 440 || actor.at - progress < -240) return null;
    return { id: actor.id, kind: 'rival', at: actor.at, lane: actor.lane,
      stage: actor.crossed ? 'recover' : actor.stage, warning: actor.warning,
      locked: actor.locked, lockLane: actor.targetLane, echoCommitted: actor.echoCommitted,
      lesson: actor.lesson, delivery: !!actor.delivery, crossed: actor.crossed,
      alpha: actor.aborted ? clamp(1 - actor.recoverMs / 1500, 0, 1) : 1 };
  }
  // Fresh chapters have one continuous enforcement rig and bounded, committed
  // interception threats. Legacy chapters retain the original four attacks.
  const BREAK_WAVES = Object.freeze([
    Object.freeze({ id:'scout-first', bar:16, label:'scout' }),
    Object.freeze({ id:'scout-convoy', bar:34, label:'convoy' }),
    Object.freeze({ id:'scout-pressure', bar:50, label:'pressure' }),
    Object.freeze({ id:'scout-final', bar:62, label:'interception', lesson:true }),
    ...[76,80,84,88,92,96].map((bar,index)=>Object.freeze({
      id:`rig-strike-${index}`, bar, label:'boss', boss:true, index }))
  ]);
  const BREAK_TUNING = Object.freeze({
    relaxed:Object.freeze({ lead:180, lockMs:600, gap:.48 }),
    standard:Object.freeze({ lead:165, lockMs:500, gap:.52 }),
    overclocked:Object.freeze({ lead:155, lockMs:450, gap:.55 })
  });
  const SYSTEMS = Object.freeze([
    Object.freeze({id:'scanner',label:'SCAN ARRAY',attack:'scan'}),
    Object.freeze({id:'ram',label:'IMPACT DRIVE',attack:'ram'}),
    Object.freeze({id:'emitter',label:'PULSE CORE',attack:'pulse'})
  ]);
  const clone = value=>JSON.parse(JSON.stringify(value));
  const object = value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const integer = (n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
  function createBreak({barFloat=0}={}) {
    const bar=clamp(finite(barFloat),0,100);
    return {version:3,lastBar:bar,lastProgress:null,
      announced:BREAK_WAVES.filter(wave=>wave.bar<bar-.001).map(wave=>wave.id),
      actor:null,defeated:false,phase:bar>=72?'boss-approach':bar>=52?'interception':bar>=28?'convoy':'scout',
      boss:{arrived:false,defeated:false,health:3,counters:0,attempts:0,hits:0,
        systems:SYSTEMS.map(system=>({...system,broken:false})),
        rigAt:null,rigLane:1.5,defeatMs:0,counterMs:0,lastCounter:null}};
  }
  function create(options={}) {
    return options.version===3?createBreak(options):createLegacy(options);
  }
  function breakEvent(type,state,actor,extra={}) {
    return {...event(type,actor),boss:!!actor?.boss,
      health:state.boss.health,system:actor?.system??null,...extra};
  }
  function breakCounter(state,actor,kind) {
    const boss=state.boss,system=boss.systems.find(item=>!item.broken);
    if(!actor.boss||boss.defeated||!system)return [];
    system.broken=true;boss.health--;boss.counters++;boss.counterMs=1200;
    actor.overloaded=true;
    boss.lastCounter={id:actor.id,kind,system:system.id,bar:state.lastBar};
    const events=[breakEvent('boss-counter',state,actor,{kind,system:system.id,
      systemIndex:SYSTEMS.findIndex(item=>item.id===system.id),
      reason:kind==='dodge'?'committed-attack-overload':kind==='echo'?'decoy-feedback':
        kind==='brace'?'absorbed-impact-feedback':'powered-counter',
      consumePush:kind==='push',consumeShield:kind==='brace'})];
    if(boss.health===0) {
      boss.defeated=true;state.defeated=true;boss.defeatMs=1800;state.phase='breakaway';
      events.push(breakEvent('boss-defeated',state,actor,{kind}));
    }
    return events;
  }
  function stepBreak(state,input={}) {
    const progress=Math.max(0,finite(input.progress));
    const before=finite(input.before,progress);
    const bar=clamp(Math.max(state.lastBar,finite(input.barFloat,state.lastBar)),0,100);
    const dt=clamp(finite(input.dt),0,100),boss=state.boss,events=[];
    const tuning=BREAK_TUNING[input.difficultyId]||BREAK_TUNING.standard;
    // A moving world actor, never a camera-space sticker: the rig cruises at
    // Cache's road velocity until defeated. Its damaged chassis then slows
    // in the world so Cache passes it into the same rearview, never a camera
    // teleport or a disappearing sprite before the foreground pass.
    const traveled=state.lastProgress===null?0:Math.max(0,progress-state.lastProgress);
    state.lastProgress=progress;state.lastBar=bar;
    boss.counterMs=Math.max(0,boss.counterMs-dt);
    boss.defeatMs=Math.max(0,boss.defeatMs-dt);
    if(bar>=72&&!boss.arrived) {
      boss.arrived=true;boss.rigAt=progress+340;state.phase='boss-approach';
      events.push(breakEvent('boss-arrive',state,null,{boss:true,at:boss.rigAt,stage:'boss-approach'}));
    }
    if(boss.arrived) {
      boss.rigAt+=boss.defeated?dt*.008:traveled;
      const desired=progress+230;
      if(!boss.defeated)boss.rigAt+=(desired-boss.rigAt)*Math.min(1,dt/1600);
      const desiredLane=boss.defeated?1.5:state.actor?.boss?
        state.actor.targetLane:1.5+Math.sin(bar*.55)*.4;
      boss.rigLane+=(desiredLane-boss.rigLane)*Math.min(1,dt/650);
    }
    if(boss.defeated) {
      if(state.actor) {
        state.actor.crossed=true;state.actor.warning=false;
        state.actor.recoverMs+=dt;
        if(state.actor.at-progress< -240)state.actor=null;
      }
      return events;
    }
    for(const wave of BREAK_WAVES) {
      if(bar<wave.bar||state.announced.includes(wave.id))continue;
      state.announced.push(wave.id);
      // Skip expired audio-resume warnings; never stack unseen attacks at a
      // checkpoint. The next scheduled opportunity gets its complete runway.
      if(bar-wave.bar>=.5||state.actor&&!state.actor.crossed)continue;
      const lane=clamp(Math.round(finite(input.lane,1.5)),0,3);
      const system=boss.systems.find(item=>!item.broken)||SYSTEMS[0];
      state.actor={id:wave.id,stage:wave.label,boss:!!wave.boss,
        system:wave.boss?system.id:null,attackKind:wave.boss?system.attack:'scan',
        at:progress+tuning.lead,lane:lane<=1?3:0,targetLane:lane,
        turnFrom:lane<=1?3:0,turnMs:0,ageMs:0,recoverMs:0,
        locked:false,warning:true,echoCommitted:false,crossed:false,aborted:false,
        lesson:!!wave.lesson,lead:tuning.lead,lockMs:tuning.lockMs,gap:tuning.gap};
      state.phase=wave.boss?'boss-attack':wave.label;
      events.push(breakEvent('stage',state,state.actor,{stage:state.phase}));
      events.push(breakEvent(wave.boss?'boss-warning':'warning',state,state.actor));
      if(wave.lesson)events.push(breakEvent('refill',state,state.actor,{amount:100}));
      if(wave.boss)boss.attempts++;
      break;
    }
    const actor=state.actor;
    if(!actor)return events;
    const distance=actor.at-progress;
    if(actor.crossed) {
      actor.recoverMs+=dt;
      if(actor.aborted&&actor.recoverMs>1500||distance< -240)state.actor=null;
      return events;
    }
    if(actor.locked&&pulseConflict(input,actor.at,actor.targetLane)) {
      actor.crossed=true;actor.aborted=true;actor.warning=false;
      events.push(breakEvent('disengage',state,actor,{reason:'new-pulse-corridor'}));
      return events;
    }
    actor.ageMs+=dt;
    if(!actor.locked) {
      const target=chooseLane(input,actor,input.lane);
      if(target!==undefined)actor.targetLane=target;
      actor.lane+=(actor.targetLane-actor.lane)*Math.min(1,dt/190);
      if(actor.ageMs>=actor.lockMs) {
        if(target===undefined) {
          actor.crossed=true;actor.aborted=true;actor.warning=false;
          events.push(breakEvent('disengage',state,actor,{reason:'no-clear-corridor'}));
          return events;
        }
        actor.locked=true;actor.lockProgress=progress;startTurn(actor,target);
        events.push(breakEvent('lock',state,actor));
      }
    }
    const echoLane=input.echo?.lanePos??input.echo?.lane;
    if(actor.locked&&!actor.echoCommitted&&input.echo&&input.echoActive!==false&&
        Number.isFinite(echoLane)&&distance>=ECHO_RUNWAY) {
      const target=chooseLane(input,actor,echoLane);
      if(target!==undefined&&Math.abs(target-echoLane)<.6) {
        actor.echoCommitted=true;actor.echoLane=target;startTurn(actor,target);
        events.push(breakEvent('echo-lock',state,actor));
      }
    }
    if(actor.locked)advanceTurn(actor,dt);
    if(before<actor.at&&progress>=actor.at) {
      actor.crossed=true;actor.warning=false;actor.recoverMs=0;
      const gap=Math.abs(actor.lane-finite(input.lane,1.5));
      const contact=gap<actor.gap;
      const powered=contact&&(input.boostMs>0?'turbo':input.ramMs>0?'push':input.shield>0?'brace':null);
      const deception=actor.echoCommitted&&Math.abs(actor.echoLane-finite(input.lane,1.5))>=.7;
      const cleanDodge=!contact&&gap>=.7&&actor.locked;
      if(actor.boss&&(powered||deception||cleanDodge)) {
        events.push(...breakCounter(state,actor,powered||deception&&'echo'||'dodge'));
        events.push(breakEvent(deception?'deception':'evaded',state,actor,{gap,counter:true}));
      } else if(contact) {
        events.push(breakEvent('hit',state,actor,{kind:actor.boss?'enforcement strike':'clean copy',gap}));
        if(actor.boss) {
          boss.hits++;events.push(breakEvent('boss-hit',state,actor,{gap}));
        }
      } else {
        events.push(breakEvent(deception?'deception':'evaded',state,actor,{gap}));
        if(actor.boss)events.push(breakEvent('boss-miss',state,actor,{gap,reason:'narrow-escape'}));
      }
    }
    return events;
  }
  function step(state,input={}) {
    return state?.version===3?stepBreak(state,input):stepLegacy(state,input);
  }
  function pose(state,options={}) {
    if(state?.version!==3)return poseLegacy(state,options);
    const actor=state.actor,progress=finite(options.progress);
    if(!actor||actor.at-progress>440||actor.at-progress< -240)return null;
    return {id:actor.id,kind:'rival',at:actor.at,lane:actor.lane,
      stage:actor.crossed?'recover':actor.stage,warning:actor.warning,
      locked:actor.locked,lockLane:actor.targetLane,echoCommitted:actor.echoCommitted,
      lesson:actor.lesson,crossed:actor.crossed,boss:actor.boss,
      attackKind:actor.attackKind,system:actor.system,health:state.boss.health,
      overloaded:!!actor.overloaded,
      alpha:actor.aborted?clamp(1-actor.recoverMs/1500,0,1):1};
  }
  function boss(state,{progress=0}={}) {
    if(state?.version!==3)return null;
    const source=state.boss;
    if(!source.arrived)return null;
    return {id:'enforcement-rig',kind:'boss',arrived:source.arrived,
      at:source.rigAt??progress+340,lane:source.rigLane,health:source.health,
      systems:source.systems.map(item=>({...item})),counters:source.counters,
      attempts:source.attempts,hits:source.hits,defeated:source.defeated,
      phase:state.phase,defeatMs:source.defeatMs,counterMs:source.counterMs,
      lastCounter:source.lastCounter?{...source.lastCounter}:null,
      visible:source.rigAt-progress<=440&&source.rigAt-progress>=-720,alpha:1};
  }
  function snapshot(state) {
    if(state?.version!==3)return null;
    const b=state.boss;
    return {version:3,lastBar:state.lastBar,announced:[...state.announced],
      boss:{health:b.health,counters:b.counters,attempts:b.attempts,hits:b.hits,
        arrived:b.arrived,rigAt:b.rigAt,rigLane:b.rigLane,
        systems:b.systems.map(system=>({id:system.id,broken:system.broken})),
        defeated:b.defeated,lastCounter:b.lastCounter?{...b.lastCounter}:null}};
  }
  function restore(raw,{barFloat=raw?.lastBar,progress=0}={}) {
    if(!object(raw)||raw.version!==3||!Number.isFinite(raw.lastBar)||raw.lastBar<0||raw.lastBar>100||
        !Array.isArray(raw.announced)||raw.announced.length>BREAK_WAVES.length||
        raw.announced.some(id=>!BREAK_WAVES.some(wave=>wave.id===id))||
        new Set(raw.announced).size!==raw.announced.length||!object(raw.boss))return null;
    const b=raw.boss;
    if(!integer(b.health,0,3)||!integer(b.counters,0,3)||b.counters!==3-b.health||
        !integer(b.attempts,0,6)||!integer(b.hits,0,6)||b.counters+b.hits>b.attempts||
        b.attempts>raw.announced.filter(id=>BREAK_WAVES.some(wave=>wave.boss&&wave.id===id)).length||
        typeof b.arrived!=='boolean'||b.arrived&&raw.lastBar<72||!b.arrived&&(b.attempts||b.counters||b.hits)||
        (b.arrived? !Number.isFinite(b.rigAt)||b.rigAt<0||b.rigAt>17000:b.rigAt!==null)||
        !Number.isFinite(b.rigLane)||b.rigLane<0||b.rigLane>3||
        typeof b.defeated!=='boolean'||b.defeated!==(b.health===0)||
        !Array.isArray(b.systems)||b.systems.length!==3||b.systems.some((system,index)=>
          !object(system)||system.id!==SYSTEMS[index].id||typeof system.broken!=='boolean'||
          system.broken!==(index<b.counters)))return null;
    const validCounter=b.counters?object(b.lastCounter)&&
      BREAK_WAVES.some(wave=>wave.boss&&wave.id===b.lastCounter.id&&raw.announced.includes(wave.id)&&
        b.lastCounter.bar>=wave.bar)&&
      ['dodge','echo','push','brace','turbo'].includes(b.lastCounter.kind)&&
      b.lastCounter.system===SYSTEMS[b.counters-1].id&&Number.isFinite(b.lastCounter.bar)&&
      b.lastCounter.bar>=76&&b.lastCounter.bar<=raw.lastBar:b.lastCounter===null;
    if(!validCounter||!Number.isFinite(barFloat)||barFloat<0||barFloat>100||
        !Number.isFinite(progress)||progress<0||progress>16000)return null;
    const state=createBreak({barFloat});
    state.announced=[...new Set([...raw.announced,...state.announced])];
    state.lastProgress=progress;
    Object.assign(state.boss,{health:b.health,counters:b.counters,attempts:b.attempts,hits:b.hits,
      defeated:b.defeated,lastCounter:b.lastCounter?clone(b.lastCounter):null});
    state.defeated=b.defeated;
    state.boss.systems.forEach((system,index)=>system.broken=b.systems[index].broken);
    if(barFloat>=72) {
      state.boss.arrived=true;state.boss.rigAt=b.arrived?b.rigAt:progress+230;
      state.boss.rigLane=b.rigLane;
      state.phase=b.defeated?'breakaway':'boss-approach';
    }
    return state;
  }
  B.CacheRoadPursuit = Object.freeze({ create, step, pose, boss, snapshot, restore,
    waves:WAVES,wavesFor:version=>version===3?BREAK_WAVES:WAVES,
    tuning:TUNING,tuningFor:version=>version===3?BREAK_TUNING:TUNING,
    systems:SYSTEMS,maxSpeed:MAX_SPEED,echoRunway:ECHO_RUNWAY });
})(window.BARCODE = window.BARCODE || {});
