window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/mac-street-combat.js',
  exports: ['BARCODE.MacStreetCombat'],
  dependencies: []
});
(function(B) {
  'use strict';

  // A finite, unsaved street encounter. The host owns input, drawing, sound and
  // its frame loop. Feed elapsed milliseconds; no rhythm judgment gates actions.
  // Input is a complete sample: {move_x, move_y} in [-1,1] and jump/strike/
  // guard/throw as {pressed, held}. Press edges survive until a simulation step.
  // Holding Strike/Throw never repeats them. Guard's parry is a fresh hold edge,
  // not a repeated pressed flag while held. y/laneY is the feet's ground plane;
  // elevation is a separate positive height, so drawing feet uses y-elevation.
  const C = Object.freeze({
    version: 1, worldWidth: 3400, laneMin: 780, laneMax: 970,
    startX: 200, startLaneY: 880, deskX: 3000,
    stepMs: 1000 / 120, maxDeltaMs: 100, maxSubsteps: 12,
    maxEnemies: 3, maxHitFx: 12, maxEvents: 32,
    playerHp: 100, moveSpeed: 260, laneSpeed: 180,
    jumpSpeed: 560, gravity: 1500, hitHeight: 62,
    laneReach: 40, parryMs: 125, counterMs: 800,
    playerInvulnerableMs: 720, playerHurtMs: 220,
    comboWindowMs: 360, throwReach: 74, throwDamage: 28,
    throwCommitMs: 360, throwCooldownMs: 650
  });
  const STRIKES = Object.freeze([
    Object.freeze({windupMs: 90, activeMs: 80, recoveryMs: 155, reach: 90, damage: 12}),
    Object.freeze({windupMs: 100, activeMs: 80, recoveryMs: 175, reach: 96, damage: 14}),
    Object.freeze({windupMs: 130, activeMs: 105, recoveryMs: 240, reach: 112, damage: 20})
  ]);
  const ROLES = Object.freeze({
    bruiser: Object.freeze({hp: 54, speed: 112, laneSpeed: 80, distance: 74,
      tellMs: 560, activeMs: 100, recoverMs: 650, reach: 118, damage: 12}),
    enforcer: Object.freeze({hp: 66, speed: 100, laneSpeed: 65, distance: 260,
      tellMs: 880, activeMs: 620, recoverMs: 850, reach: 50, damage: 18, chargeSpeed: 620})
  });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  const copy = v => JSON.parse(JSON.stringify(v));
  const toward = (value, target, distance) => value + clamp(target - value, -distance, distance);
  const action = v => typeof v === 'boolean' ? {pressed: false, held: v}
    : {pressed: !!v?.pressed, held: !!v?.held};
  const readyAt = (value, duration) => value + 1e-7 >= duration;

  function initialState() {
    const enemy = (id, kind, arena, x, laneY) => ({
      id, kind, arena, x, laneY, hp: ROLES[kind].hp, maxHp: ROLES[kind].hp,
      facing: -1, phase: 'dormant', phaseMs: 0, attackLaneY: laneY,
      attackFacing: -1, attackOriginX: x, attackDone: false,
      knockbackVx: 0, flashMs: 0
    });
    return {
      elapsedMs: 0, status: 'active', kills: 0, arenaIndex: 0,
      player: {x: C.startX, laneY: C.startLaneY, elevation: 0, velocityZ: 0,
        facing: 1, hp: C.playerHp, maxHp: C.playerHp, attack: null,
        comboNext: 1, comboMs: 0, queuedStrike: false,
        guarding: false, parryMs: 0, counterMs: 0,
        hurtMs: 0, invulnerableMs: 0, knockbackVx: 0,
        throwMs: 0, throwCooldownMs: 0},
      enemies: [enemy('street-duel', 'bruiser', 1, 830, 880),
        enemy('street-bruiser', 'bruiser', 2, 1960, 850),
        enemy('street-enforcer', 'enforcer', 2, 2310, 930)],
      hitFx: [], events: [], nextFxId: 1
    };
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
    function fx(kind, x, laneY) {
      state.hitFx.push({id: state.nextFxId++, kind, x, laneY, ageMs: 0,
        lifeMs: kind === 'defeat' ? 420 : 240});
      if (state.hitFx.length > C.maxHitFx) state.hitFx.shift();
    }
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
    function currentGate() {
      if (state.enemies[0].hp > 0) return 1250;
      if (state.enemies.slice(1).some(e => e.hp > 0)) return 2770;
      return C.worldWidth - 40;
    }
    function live(e) { return e.hp > 0 && e.phase !== 'dormant'; }
    function throwTarget() {
      const p = state.player;
      return state.enemies.filter(e => live(e) && Math.abs(e.laneY - p.laneY) <= C.laneReach &&
        (e.x - p.x) * p.facing >= -12 && (e.x - p.x) * p.facing <= C.throwReach)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x) || a.id.localeCompare(b.id))[0] || null;
    }
    function damageEnemy(e, amount, direction, cause, stunMs, speed) {
      if (!live(e)) return;
      e.hp = Math.max(0, e.hp - amount); e.flashMs = 130;
      e.knockbackVx = direction * speed; e.attackDone = true;
      e.phase = e.hp ? 'stunned' : 'defeated'; e.phaseMs = 0;
      e.stunMs = stunMs;
      fx(e.hp ? cause : 'defeat', e.x, e.laneY);
      emit('enemy-hit', {id: e.id, kind: e.kind, damage: amount, cause, hp: e.hp});
      if (!e.hp) { state.kills++; emit('enemy-defeated', {id: e.id, kind: e.kind}); }
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
    function takeHit(e, beforeX) {
      const p = state.player;
      if (e.attackDone || p.hp <= 0 || p.invulnerableMs > 0 || p.elevation > C.hitHeight) return;
      e.attackDone = true;
      const front = (beforeX - p.x) * p.facing >= -12 && e.attackFacing === -p.facing;
      if (p.guarding && front) {
        if (p.parryMs > 0) {
          e.phase = 'stunned'; e.phaseMs = 0; e.stunMs = 650;
          e.knockbackVx = p.facing * 100;
          p.parryMs = 0; p.counterMs = C.counterMs;
          fx('parry', p.x + p.facing * 42, p.laneY);
          emit('parry', {id: e.id, counterMs: C.counterMs});
        } else {
          fx('block', p.x + p.facing * 42, p.laneY);
          emit('block', {id: e.id});
        }
        return;
      }
      p.hp = Math.max(0, p.hp - ROLES[e.kind].damage);
      p.hurtMs = C.playerHurtMs; p.invulnerableMs = C.playerInvulnerableMs;
      p.knockbackVx = e.attackFacing * 240;
      p.attack = null; p.queuedStrike = false; p.comboNext = 1; p.comboMs = 0;
      p.guarding = false; p.parryMs = 0; p.throwMs = 0;
      fx('damage', p.x, p.laneY); emit('player-hit', {id: e.id, damage: ROLES[e.kind].damage, hp: p.hp});
      if (!p.hp) { state.status = 'defeated'; emit('player-defeated'); }
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
      p.x = clamp(p.x, 40, currentGate());
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
    function activate(arena) {
      state.arenaIndex = arena;
      for (const e of state.enemies.filter(e => e.arena === arena)) {
        e.phase = 'approach'; e.phaseMs = 0;
        emit('enemy-arrive', {id: e.id, kind: e.kind, arena});
      }
    }
    function tickEnemy(e, dt) {
      if (!live(e)) return;
      const p = state.player, rule = ROLES[e.kind], sec = dt / 1000;
      e.flashMs = Math.max(0, e.flashMs - dt);
      e.x = clamp(e.x + e.knockbackVx * sec, 50, C.worldWidth - 50);
      e.knockbackVx = toward(e.knockbackVx, 0, 900 * sec);
      e.phaseMs += dt;
      if (e.phase === 'stunned') {
        if (readyAt(e.phaseMs, e.stunMs)) { e.phase = 'approach'; e.phaseMs = 0; }
        return;
      }
      if (e.phase === 'recovery') {
        if (readyAt(e.phaseMs, rule.recoverMs)) { e.phase = 'approach'; e.phaseMs = 0; }
        return;
      }
      if (e.phase === 'approach') {
        e.facing = Math.sign(p.x - e.x) || e.facing;
        e.laneY = toward(e.laneY, p.laneY, rule.laneSpeed * sec);
        const gap = Math.abs(p.x - e.x);
        if (gap > rule.distance) e.x += e.facing * Math.min(rule.speed * sec, gap - rule.distance);
        if (gap <= rule.distance + 1 && Math.abs(e.laneY - p.laneY) <= 24) {
          e.phase = 'windup'; e.phaseMs = 0; e.attackDone = false;
          e.attackLaneY = e.laneY; e.attackFacing = e.facing; e.attackOriginX = e.x;
          emit('enemy-tell', {id: e.id, kind: e.kind, tellMs: rule.tellMs,
            laneY: e.attackLaneY, facing: e.attackFacing});
        }
        return;
      }
      if (e.phase === 'windup') {
        // Neither aim nor lane tracks Mac after the visible tell begins.
        if (readyAt(e.phaseMs, rule.tellMs)) {
          e.phase = 'active'; e.phaseMs = 0;
          emit('enemy-attack', {id: e.id, kind: e.kind});
        }
        return;
      }
      if (e.phase === 'active') {
        const beforeX = e.x;
        if (e.kind === 'enforcer') e.x = clamp(e.x + e.attackFacing * rule.chargeSpeed * sec, 50, C.worldWidth - 50);
        const inLane = Math.abs(p.laneY - e.attackLaneY) <= C.laneReach;
        const inReach = e.kind === 'enforcer'
          ? p.x >= Math.min(beforeX, e.x) - rule.reach && p.x <= Math.max(beforeX, e.x) + rule.reach
          : (p.x - e.x) * e.attackFacing >= -12 && (p.x - e.x) * e.attackFacing <= rule.reach;
        if (inLane && inReach) takeHit(e, beforeX);
        if (readyAt(e.phaseMs, rule.activeMs)) { e.phase = 'recovery'; e.phaseMs = 0; }
      }
    }
    function tick(dt, pressed) {
      state.elapsedMs += dt;
      for (const item of state.hitFx) item.ageMs += dt;
      state.hitFx = state.hitFx.filter(item => item.ageMs < item.lifeMs);
      if (state.status === 'defeated') return;
      tickPlayer(dt, pressed);
      if (!state.arenaIndex && state.player.x >= 480) activate(1);
      if (state.enemies[0].hp === 0 && state.arenaIndex < 2 && state.player.x >= 1580) activate(2);
      for (const e of state.enemies) tickEnemy(e, dt);
      if (state.kills === C.maxEnemies && state.status === 'active') {
        state.status = 'desk-ready'; emit('desk-unlocked', {x: C.deskX});
      }
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
    function getSnapshot() {
      const p = state.player;
      const rule = p.attack ? STRIKES[p.attack.step - 1] : null;
      const attack = p.attack ? {step: p.attack.step, phase: strikePhase(p.attack),
        elapsedMs: p.attack.elapsedMs, facing: p.attack.facing, counter: p.attack.counter,
        remainingMs: Math.max(0, rule.windupMs + rule.activeMs + rule.recoveryMs - p.attack.elapsedMs)} : null;
      return copy({version: C.version, elapsedMs: state.elapsedMs, status: state.status, kills: state.kills,
        player: {...p, y: p.laneY, grounded: p.elevation === 0 && p.velocityZ === 0, mode: mode(), attack},
        enemies: state.enemies.map(e => ({...e, y: e.laneY,
          tellMs: ROLES[e.kind].tellMs, attackReach: ROLES[e.kind].reach,
          warning: e.phase === 'windup', active: e.phase === 'active'})),
        hitFx: state.hitFx,
        arena: {index: state.arenaIndex, gateX: currentGate(),
          active: state.enemies.some(e => live(e)),
          remaining: state.enemies.filter(e => e.hp > 0 && e.arena === state.arenaIndex).length},
        desk: {x: C.deskX, unlocked: state.kills === C.maxEnemies}});
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
        retry: {label: 'Retry', enabled: !alive, ready: !alive}
      };
    }
    function retry() {
      state = initialState(); accumulator = 0;
      input = {move_x: 0, move_y: 0, jump: {held: false}, strike: {held: false},
        guard: {held: false}, throw: {held: false}};
      edges = {jump: false, strike: false, guard: false, throw: false};
      return getSnapshot();
    }
    function drainEvents() { const events = copy(state.events); state.events.length = 0; return events; }
    return {handleInput, update, getSnapshot, getControlState, retry, drainEvents};
  }
  B.MacStreetCombat = {create, constants: C, strikes: STRIKES, roles: ROLES};
})(window.BARCODE = window.BARCODE || {});
