// A playable, explicitly provisional Level 3 genre proof. The Level 2 story
// route remains next; this preview awards no keys, levels, lore or results.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/broadcast-slum-proof.js', exports: ['BARCODE.RunAndGunProof'], dependencies: ['BARCODE.Campaign', 'BARCODE.MusicTransport'] });
(function(B) {
  'use strict';
  const ID = 'level-03', PROFILE = 'level-03.proof', FLOOR = 798, WIDTH = 4800;
  const PLAYER_W = 44, PLAYER_H = 76, PHRASE_MS = 16 * 60000 / 108;
  const WORLD_SCALE = 1.6, VIEW_WIDTH = 1920 / WORLD_SCALE, WORLD_Y = -270;
  const BOSS_X = 4495, BOSS_GATE = 3780;
  const BOSS_FEEDS = [{ x: BOSS_X - 30, y: 599, w: 62, h: 56 },
    { x: BOSS_X - 30, y: 714, w: 62, h: 56 }];
  const BOSS_CORE = { x: BOSS_X + 40, y: 682, w: 65, h: 93 };
  const RELAYS = [{ x: 1690, hp: 5, counterAt: 2 }, { x: 3340, hp: 7, counterAt: 3 }];
  const NODES = [{ x: 1270, y: 615, hp: 3 }, { x: 2940, y: 615, hp: 4 }];
  const PICKUPS = [{ x: 1150, y: 635, relay: 0 }, { x: 2820, y: 635, relay: 1 }];
  const PLATFORMS = [
    { x: 540, y: 665, w: 330 }, { x: 1110, y: 675, w: 270 },
    { x: 2110, y: 670, w: 360 }, { x: 2780, y: 675, w: 260 },
    { x: 3800, y: 650, w: 360 }
  ];
  const ENEMIES = [
    { kind: 'gunner', x: 730, platformY: 665 }, { kind: 'patrol', x: 1450, min: 1380, max: 1545 },
    { kind: 'runner', x: 2200, min: 2070, max: 2340 }, { kind: 'gunner', x: 2380, platformY: 670 },
    { kind: 'gunner', x: 3900, platformY: 650 }, { kind: 'runner', x: 4210, min: 4130, max: 4290 },
    { kind: 'bulwark', x: 2610, min: 2510, max: 2700 },
    { kind: 'drone', x: 2420, platformY: 625 },
    { kind: 'bulwark', x: 3560, min: 3490, max: 3700 },
    { kind: 'drone', x: 4050, platformY: 618 }
  ];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rectHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const copy = value => JSON.parse(JSON.stringify(value));

  function newState(checkpoint = {}) {
    const relays = checkpoint.relays ? [...checkpoint.relays] : RELAYS.map(relay => relay.hp);
    const x = checkpoint.playerX ?? 180;
    return {
      player: { x, y: FLOOR - PLAYER_H, vx: 0, vy: 0, facing: 1, grounded: true,
        health: checkpoint.health ?? 4, invulnerableMs: 0, scatterMs: 0, muzzleMs: 0 },
      relays, nodes: NODES.map((node, index) => relays[index] === 0 ? 0 : node.hp),
      countered: RELAYS.map((relay, index) => relays[index] <= relay.counterAt), counter: null,
      pickups: PICKUPS.map(pickup => ({ ...pickup, active: relays[pickup.relay] > 0 })),
      enemies: ENEMIES.map((enemy, index) => ({ ...enemy,
        y: enemy.kind === 'drone' ? enemy.platformY : (enemy.platformY || FLOOR) - 64,
        health: relays[1] === 0 && index < 4 || relays[0] === 0 && index < 2 ? 0 : enemy.kind === 'bulwark' ? 5 : 3,
        direction: enemy.kind === 'bulwark' ? -1 : index % 2 ? -1 : 1,
        cooldownMs: 650 + index * 205, warningMs: 0, spawnMs: 0, ageMs: 0 })),
      boss: { active: checkpoint.boss === true, defeated: checkpoint.status === 'clear' && !checkpoint.legacyClear,
        feeds: checkpoint.status === 'clear' && !checkpoint.legacyClear ? [0, 0] : [4, 4],
        health: checkpoint.status === 'clear' && !checkpoint.legacyClear ? 0 : 20,
        timerMs: 1550, warningMs: 0, attack: '', cycle: 0, beamMs: 0, beamX: 0,
        coreOpenMs: 0, flashMs: 0, phase: 1, legacyClear: !!checkpoint.legacyClear },
      shots: [], hostileShots: [], hitFx: [], cameraX: clamp(x - 420, 0, WIDTH - VIEW_WIDTH),
      elapsedMs: checkpoint.elapsedMs ?? 0, kills: checkpoint.kills ?? 0,
      fireCooldownMs: 0, lastPhrase: null, fallbackMs: 0, warning: false,
      flashMs: 0, message: 'RECOVERED DATA / DISTRIBUTION DENIED', messageMs: 2600,
      status: checkpoint.status || 'playing'
    };
  }

  const proof = B.RunAndGunProof = {
    active: false, status: null, state: null, returnTo: null, pending: false, exiting: false, audioDegraded: false,
    checkAudioAssets() {
      const tracks = window.audioSystem?.musicTracks || {};
      this.audioDegraded = B.MusicProfiles.get(PROFILE).arrangement.sources.some(source =>
        !tracks[source.sourceId]?.buffer || tracks[source.sourceId].isFallback ||
        Math.abs(tracks[source.sourceId].buffer.duration - PHRASE_MS / 1000) > 0.02);
      return !this.audioDegraded;
    },
    validate(saved) {
      const c = saved?.levelState, p = c?.proof;
      return saved?.levelId === ID && ['proof-start', 'proof-relay', 'proof-relay-2', 'proof-boss', 'proof-clear'].includes(saved.checkpointId) &&
        [1, 2].includes(c?.previewVersion) && (c.previewVersion === 2 || saved.checkpointId !== 'proof-boss') &&
        c.returnTo?.checkpointId === 'intermission' &&
        B.Campaign.validateLevel01Checkpoint(c.returnTo) && !!p &&
        Number.isFinite(p.playerX) && p.playerX >= 0 && p.playerX <= WIDTH &&
        Number.isInteger(p.health) && p.health >= 1 && p.health <= 4 &&
        Number.isFinite(p.elapsedMs) && p.elapsedMs >= 0 && p.elapsedMs < 1e10 &&
        Number.isInteger(p.kills) && p.kills >= 0 && p.kills <= ENEMIES.length + RELAYS.length + 2 &&
        Array.isArray(p.relays) && p.relays.length === 2 && p.relays.every((n, i) => Number.isInteger(n) && n >= 0 && n <= RELAYS[i].hp) &&
        (saved.checkpointId !== 'proof-start' || p.relays[0] === RELAYS[0].hp && p.relays[1] === RELAYS[1].hp) &&
        (!['proof-relay', 'proof-relay-2', 'proof-clear'].includes(saved.checkpointId) || p.relays[0] === 0) &&
        (!['proof-relay-2', 'proof-boss', 'proof-clear'].includes(saved.checkpointId) || p.relays[1] === 0) &&
        (saved.checkpointId !== 'proof-boss' || p.playerX >= BOSS_GATE - 80 && p.playerX < BOSS_X - 60) &&
        (saved.checkpointId !== 'proof-clear' || c.previewVersion === 1 || p.bossDefeated === true);
    },
    selectMusicProfile() {
      const selected = B.MusicProfiles?.select(PROFILE);
      const loaded = selected && B.MusicTransport?.load(PROFILE);
      return { ok: selected?.profileId === PROFILE && loaded?.status === 'ok' };
    },
    async enter() {
      if (this.active || this.pending || B.CacheRoadProof?.active || B.CacheRoadProof?.pending ||
          !B.Campaign?.intermission) return { ok: false, reason: 'handoff-unavailable' };
      const returnTo = B.Campaign.readResume();
      if (returnTo?.levelId !== 'level-01' || returnTo.checkpointId !== 'intermission' ||
          !B.Campaign.archive().record.progress.completedLevels.includes('level-01')) return { ok: false, reason: 'level-01-clear-required' };
      const previous = returnTo.levelState.previewCheckpoint;
      const previousSaved = previous && { levelId: ID, checkpointId: previous.checkpointId,
        levelState: { previewVersion: previous.previewVersion || 1, returnTo, proof: previous.proof } };
      const resumePreview = this.validate(previousSaved) ? previous : null;
      this.pending = true;
      const entryGeneration=this.entryGeneration=(this.entryGeneration||0)+1;
      try {
        window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
        if (!this.selectMusicProfile().ok) throw new Error('missing-proof-profile');
        const prepared = await window.audioSystem?.prepareActiveMusicProfile?.();
        if(entryGeneration!==this.entryGeneration)return {ok:false,reason:'handoff-cancelled'};
        if (!prepared?.ok) throw new Error('proof-audio-unavailable');
        this.checkAudioAssets();
        this.returnTo = returnTo;
        this.state = newState(resumePreview ? { ...resumePreview.proof,
          boss: resumePreview.checkpointId === 'proof-boss',
          legacyClear: resumePreview.checkpointId === 'proof-clear' && !resumePreview.proof.bossDefeated,
          status: resumePreview.checkpointId === 'proof-clear' ? 'clear' : 'playing' } : {});
        this.status = this.state.status; this.active = true;
        B.Campaign.intermission = false; B.Campaign.run = null;
        window.gameState.victory = false; window.gameState.gameOver = false; window.gameState.running = true;
        const started = window.audioSystem?.startRuntimeGameplayMusic?.();
        if (!started?.ok) throw new Error('proof-audio-start-failed');
        this.checkpoint(resumePreview?.checkpointId || 'proof-start');
        window.inputManager?.resetActionEdges?.();
        return { ok: true };
      } catch (error) {
        if(entryGeneration!==this.entryGeneration)return {ok:false,reason:'handoff-cancelled'};
        this.dispose();
        B.Campaign.archive().checkpoint(returnTo);
        await B.RuntimeLifecycle?.restart?.({ source: 'proof-entry-recovery', resume: returnTo });
        return { ok: false, reason: error.message };
      } finally { if(entryGeneration===this.entryGeneration)this.pending = false; }
    },
    restore(saved) {
      if (!this.validate(saved)) return false;
      this.returnTo = copy(saved.levelState.returnTo);
      this.state = newState({ ...saved.levelState.proof,
        boss: saved.checkpointId === 'proof-boss',
        legacyClear: saved.checkpointId === 'proof-clear' && saved.levelState.previewVersion === 1,
        status: saved.checkpointId === 'proof-clear' ? 'clear' : 'playing' });
      this.status = this.state.status; this.active = true; this.exiting = false;
      this.checkAudioAssets();
      window.gameState.victory = false; window.gameState.gameOver = false; window.gameState.running = true;
      window.inputManager?.resetActionEdges?.();
      return true;
    },
    checkpoint(id) {
      if (!this.active || !this.returnTo || !['proof-start', 'proof-relay', 'proof-relay-2', 'proof-boss', 'proof-clear'].includes(id)) return false;
      const s = this.state, p = s.player;
      const saved = B.Campaign.archive().checkpoint({ levelId: ID, checkpointId: id,
        levelState: { previewVersion: id === 'proof-clear' && s.boss.legacyClear ? 1 : 2,
          returnTo: copy(this.returnTo), proof: {
          playerX: Math.round(p.x), health: Math.max(1, p.health), elapsedMs: Math.round(s.elapsedMs),
          kills: s.kills, relays: [...s.relays], bossDefeated: s.boss.defeated } } });
      B.Campaign.syncTitleButton();
      return saved;
    },
    async exit() {
      if (!this.active || this.exiting) return false;
      this.exiting = true;
      const returnTo = copy(this.returnTo);
      const saved = B.Campaign.readResume();
      if (saved?.levelId === ID && this.validate(saved)) returnTo.levelState.previewCheckpoint = {
        checkpointId: saved.checkpointId, previewVersion: saved.levelState.previewVersion,
        proof: copy(saved.levelState.proof) };
      B.Campaign.archive().checkpoint(returnTo);
      B.Campaign.syncTitleButton();
      const result = await B.RuntimeLifecycle?.restart?.({ source: 'proof-exit', resume: returnTo });
      if (!result?.ok) this.exiting = false;
      return !!result?.ok;
    },
    dispose() { this.entryGeneration=(this.entryGeneration||0)+1;this.pending=false;
      this.active = false; this.status = null; this.state = null; this.returnTo = null; this.exiting = false; this.audioDegraded = false; },
    retry() {
      if (!this.active || this.status === 'playing') return false;
      const saved = B.Campaign.readResume();
      if (this.status === 'clear') {
        this.state = newState(); this.checkpoint('proof-start');
      } else {
        this.state = newState(saved?.levelId === ID ? { ...saved.levelState.proof,
          boss: saved.checkpointId === 'proof-boss' } : {});
      }
      this.status = 'playing';
      window.inputManager?.resetActionEdges?.();
      return true;
    },
    debugReady() { return this.active && !this.exiting && B.DEBUG_LEVEL_3_SESSION === true; },
    debugStatus() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      return { ok: true, status: this.status, health: this.state.player.health,
        relays: [...this.state.relays], nodes: [...this.state.nodes],
        boss: { active: this.state.boss.active, feeds: [...this.state.boss.feeds], health: this.state.boss.health },
        checkpoint: B.Campaign.readResume()?.checkpointId };
    },
    debugGotoRelay(number) {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      if (number !== 1 && number !== 2) return { ok: false, reason: 'invalid-relay' };
      this.state = newState(number === 1 ? { playerX: 1100 } : { playerX: 2700, relays: [0, RELAYS[1].hp] });
      this.status = 'playing';
      window.inputManager?.resetActionEdges?.();
      const saved = this.checkpoint(number === 1 ? 'proof-start' : 'proof-relay');
      return { ok: true, state: `relay-${number}`, saved: !!saved };
    },
    debugClearNode() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      const index = this.state.relays.findIndex(hp => hp > 0);
      if (index < 0) return { ok: false, reason: 'all-relays-disabled' };
      this.state.nodes[index] = 0;
      this.state.message = `NODE ${index + 1} DOWN — RELAY EXPOSED`;
      this.state.messageMs = 1500;
      return { ok: true, state: `node-${index + 1}-off` };
    },
    debugClearRelay() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      const s = this.state, index = s.relays.findIndex(hp => hp > 0);
      if (index < 0) return { ok: false, reason: 'all-relays-disabled' };
      s.nodes[index] = s.relays[index] = 0;
      s.countered[index] = true; s.counter = null;
      s.shots = []; s.hostileShots = []; s.warning = false;
      s.pickups[index].active = false;
      s.enemies.slice(0, index === 0 ? 2 : 4).forEach(enemy => { enemy.health = 0; });
      s.message = `RELAY ${index + 1} DISABLED`; s.messageMs = 1200;
      const saved = this.checkpoint(index === 0 ? 'proof-relay' : 'proof-relay-2');
      return { ok: true, state: `relay-${index + 1}-off`, saved: !!saved };
    },
    debugRefill() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      this.state.player.health = 4; this.state.player.invulnerableMs = 900;
      this.state.hostileShots = []; this.state.counter = null;
      this.status = this.state.status = 'playing';
      window.inputManager?.resetActionEdges?.();
      return { ok: true, state: 'playing' };
    },
    debugScatter() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      this.state.player.scatterMs = 11500;
      return { ok: true, state: 'scatter-ready' };
    },
    debugClearDefenders() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      this.state.enemies.forEach(enemy => { enemy.health = 0; });
      this.state.hostileShots = [];
      return { ok: true, state: 'defenders-cleared' };
    },
    debugGotoBoss() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      this.state = newState({ playerX: BOSS_GATE, relays: [0, 0], health: 4, boss: true });
      this.status = 'playing';
      window.inputManager?.resetActionEdges?.();
      const saved = this.checkpoint('proof-boss');
      return { ok: true, state: 'boss-arena', saved: !!saved };
    },
    debugCompleteProof() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      const s = this.state;
      s.relays.fill(0); s.nodes.fill(0); s.counter = null;
      s.boss.active = s.boss.defeated = true;
      s.boss.legacyClear = false;
      s.boss.feeds.fill(0); s.boss.health = 0; s.boss.beamMs = s.boss.warningMs = 0;
      s.shots = []; s.hostileShots = []; s.enemies.forEach(enemy => { enemy.health = 0; });
      s.player.health = Math.max(1, s.player.health);
      s.player.x = WIDTH - 130; s.player.y = FLOOR - PLAYER_H; s.player.vx = s.player.vy = 0;
      s.cameraX = WIDTH - VIEW_WIDTH;
      this.status = s.status = 'clear';
      window.inputManager?.resetActionEdges?.();
      const saved = this.checkpoint('proof-clear');
      return { ok: true, state: 'proof-clear', saved: !!saved };
    },
    debugResetProof() {
      if (!this.debugReady()) return { ok: false, reason: 'debug-disabled' };
      this.state = newState(); this.status = 'playing';
      window.inputManager?.resetActionEdges?.();
      const saved = this.checkpoint('proof-start');
      return { ok: true, state: 'proof-start', saved: !!saved };
    },
    keyDown(e) {
      if (this.status === 'playing') return false;
      const key = e.key.toLowerCase();
      if (!['enter', ' ', 'c'].includes(key)) return false;
      e.preventDefault?.();
      if (!e.repeat) key === 'c' ? this.exit() : this.retry();
      return true;
    },
    volleyTarget() {
      const s = this.state, index = s?.relays.findIndex(hp => hp > 0) ?? -1;
      if (index < 0) return -1;
      const x = RELAYS[index].x - 40;
      return s.player.x >= x - 1250 && s.player.x <= x + 80 ? index : -1;
    },
    threatActive() {
      return !!(this.state && this.status === 'playing' &&
        (this.state.boss.active && !this.state.boss.defeated || this.volleyTarget() >= 0 || this.state.counter ||
          this.state.enemies.some(enemy => enemy.health > 0 && Math.abs(enemy.x - this.state.player.x) < 900)));
    },
    handleActions(actions) {
      if (!this.active || this.status !== 'playing' || this.exiting) return;
      const s = this.state, p = s.player;
      p.vx = (Number(!!actions.move_right?.held) - Number(!!actions.move_left?.held)) * 330;
      if (p.vx) p.facing = Math.sign(p.vx);
      if (actions.jump?.pressed && p.grounded) { p.vy = -735; p.grounded = false; }
      if (actions.inspect?.held && s.fireCooldownMs <= 0) {
        const scatter = p.scatterMs > 0;
        s.fireCooldownMs = scatter ? 230 : 180; p.muzzleMs = 90;
        for (const vy of scatter ? [-220, 0, 220] : [0]) {
          s.shots.push({ x: p.x + PLAYER_W / 2 + p.facing * 34, y: p.y + 34,
            vx: p.facing * 1020, vy, life: 1000 });
        }
        window.audioSystem?.playSound?.('synthHit');
      }
    },
    spark(x, y, color = '#a7ffdc') {
      this.state.hitFx.push({ x, y, color, ms: 220 });
      if (this.state.hitFx.length > 24) this.state.hitFx.shift();
    },
    startCounter(index) {
      const s = this.state, p = s.player;
      if (s.countered[index]) return;
      s.countered[index] = true;
      s.counter = { index, warningMs: 1050, lockMs: 380, fired: false,
        roofY: p.y + PLAYER_H < FLOOR - 45 ? p.y + 34 : null };
      const x = clamp(p.x - 370, 100, RELAYS[index].x - 130);
      s.enemies.push({ kind: 'runner', x, y: FLOOR - 64, health: 2, direction: 1,
        cooldownMs: 0, warningMs: 0, spawnMs: 800, reinforcement: true });
      s.message = 'COUNTER SURGE — BACKLINE INBOUND'; s.messageMs = 1600;
    },
    updateCounter(delta) {
      const s = this.state, counter = s.counter;
      if (!counter) return;
      if (!counter.fired) {
        counter.warningMs -= delta;
        if (counter.warningMs <= 0) { counter.fired = true; this.volley(counter.index, true); }
      } else {
        counter.lockMs -= delta;
        if (counter.lockMs <= 0) s.counter = null;
      }
    },
    hitPlayer() {
      const s = this.state, p = s.player;
      if (p.invulnerableMs > 0 || this.status !== 'playing') return;
      p.health--; p.invulnerableMs = 900; s.flashMs = 180;
      s.message = 'SIGNAL HIT — JUMP OR CLEAR THE DEFENSE'; s.messageMs = 1000;
      window.audioSystem?.playSound?.('hit');
      if (p.health <= 0) { this.status = s.status = 'failed'; p.vx = 0; }
    },
    phrase(delta) {
      const s = this.state;
      const sample = B.MusicTransport?.sample?.(window.audioSystem?.context?.currentTime);
      const grid = !this.audioDegraded && sample?.profileId === PROFILE && sample.running ? sample.grid : null;
      if (grid) {
        const phrase = Math.floor(grid.beatIndex / 16);
        s.warning = !s.counter && grid.beatIndex % 16 >= 14 && this.volleyTarget() >= 0;
        if (s.lastPhrase !== null && phrase > s.lastPhrase && this.volleyTarget() >= 0 && !s.counter) this.volley();
        s.lastPhrase = phrase;
      } else {
        s.fallbackMs += delta;
        s.warning = !s.counter && s.fallbackMs >= PHRASE_MS - 1200 && this.volleyTarget() >= 0;
        if (s.fallbackMs >= PHRASE_MS) {
          s.fallbackMs %= PHRASE_MS;
          if (this.volleyTarget() >= 0 && !s.counter) this.volley();
        }
      }
    },
    volley(index = this.volleyTarget(), counter = false) {
      const s = this.state;
      if (index < 0) return;
      const x = RELAYS[index].x - 40;
      for (const y of [FLOOR - 53, FLOOR - 100]) s.hostileShots.push({ x, y, vx: -590, vy: 0, life: 2100, volley: true });
      if (counter && s.counter?.roofY != null) s.hostileShots.push({ x, y: s.counter.roofY,
        vx: -590, vy: 0, life: 2100, roof: true });
      s.message = counter ? 'COUNTER FIRED — TURN AND MOVE' : 'PHRASE VOLLEY — JUMP ABOVE BOTH LANES';
      s.messageMs = 1200;
    },
    activateBoss() {
      const s = this.state, b = s.boss;
      if (b.active || s.relays.some(hp => hp > 0) || s.player.x < BOSS_GATE) return;
      b.active = true;
      s.player.health = 4;
      s.player.scatterMs = Math.max(s.player.scatterMs, 6000);
      s.hostileShots = [];
      s.message = 'TRANSMITTER LOCKDOWN / TWO POWER FEEDS'; s.messageMs = 2600;
      this.checkpoint('proof-boss');
    },
    updateBoss(delta) {
      const s = this.state, b = s.boss;
      if (!b.active || b.defeated) return;
      b.flashMs = Math.max(0, b.flashMs - delta);
      b.coreOpenMs = Math.max(0, b.coreOpenMs - delta);
      if (b.beamMs > 0) {
        b.beamMs = Math.max(0, b.beamMs - delta);
        if (b.beamMs && rectHit({ x: b.beamX, y: 290, w: 56, h: FLOOR - 290 },
          { x: s.player.x, y: s.player.y, w: PLAYER_W, h: PLAYER_H })) this.hitPlayer();
      }
      if (b.warningMs > 0) {
        b.warningMs -= delta;
        if (b.warningMs > 0) return;
        const p = s.player;
        if (b.attack === 'sweep') {
          for (const y of [FLOOR - 54, FLOOR - 104])
            s.hostileShots.push({ x: BOSS_X - 65, y, vx: -690, vy: 0, life: 1800, volley: true });
        } else if (b.attack === 'fan') {
          const dx = Math.max(240, BOSS_X - p.x), travel = dx / 700;
          const slope = clamp((p.y + 37 - 692) / travel, -240, 240);
          for (const offset of [-165, 0, 165])
            s.hostileShots.push({ x: BOSS_X - 65, y: 692, vx: -700,
              vy: slope + offset, life: 1850, boss: true });
        } else if (b.attack === 'beam') b.beamMs = 410;
        if (b.feeds.every(hp => hp === 0)) b.coreOpenMs = 1450;
        b.timerMs = b.phase === 2 ? 2000 : 2600;
        return;
      }
      b.timerMs -= delta;
      if (b.timerMs > 0) return;
      b.attack = ['sweep', 'fan', 'beam'][b.cycle % 3];
      b.cycle++;
      b.coreOpenMs = 0;
      b.warningMs = b.attack === 'beam' ? 1000 : 850;
      if (b.attack === 'beam') b.beamX = clamp(s.player.x + PLAYER_W / 2 - 28, BOSS_GATE + 25, BOSS_X - 145);
      s.message = b.attack === 'beam' ? 'TARGET LOCK — MOVE OUT OF THE COLUMN'
        : b.attack === 'fan' ? 'FAN BURST — CHANGE HEIGHT OR BREAK LINE'
          : 'FLOOR SWEEP — JUMP THE LANES';
      s.messageMs = b.warningMs;
      if (b.phase === 2 && b.cycle % 3 === 0 &&
          s.enemies.filter(enemy => enemy.bossDrone && enemy.health > 0).length < 1) {
        s.enemies.push({ kind: 'drone', bossDrone: true, x: BOSS_X - 190, y: 615,
          platformY: 615, health: 2, direction: -1, cooldownMs: 1300,
          warningMs: 0, spawnMs: 950, ageMs: 0 });
      }
    },
    hitBoss(shot) {
      const s = this.state, b = s.boss;
      if (!b.active || b.defeated) return false;
      const rect = { x: shot.x, y: shot.y, w: 18, h: 8 };
      const feed = BOSS_FEEDS.findIndex((feed, i) => b.feeds[i] > 0 && rectHit(rect, feed));
      if (feed >= 0) {
        b.feeds[feed]--; shot.life = 0; b.flashMs = 160;
        this.spark(BOSS_X, BOSS_FEEDS[feed].y + 27, '#ffe49c');
        if (b.feeds.every(hp => hp === 0)) b.coreOpenMs = 1350;
        s.message = b.feeds.some(hp => hp) ? `FEED ${feed + 1} DOWN / ${b.feeds.filter(hp => hp > 0).length} LEFT`
          : 'SHUTTER OPEN — STRIKE THE CORE AFTER EACH ATTACK';
        s.messageMs = 1650;
        return true;
      }
      if (!rectHit(rect, BOSS_CORE)) return false;
      shot.life = 0;
      if (b.feeds.some(hp => hp > 0) || b.coreOpenMs <= 0) {
        this.spark(BOSS_X, shot.y, '#82c8ea');
        if (s.messageMs < 500) {
          s.message = b.feeds.some(hp => hp > 0) ? 'ARMORED CORE — BREAK BOTH POWER FEEDS'
            : 'SHUTTER CLOSED — COUNTER AFTER AN ATTACK'; s.messageMs = 1400;
        }
        return true;
      }
      b.health--; b.flashMs = 160; this.spark(BOSS_X, shot.y, '#ffc1a0');
      if (b.health === 10) {
        b.phase = 2; s.message = 'SIGNAL OVERLOAD — FASTER ATTACK CYCLE'; s.messageMs = 1800;
      }
      if (b.health <= 0) {
        b.defeated = true; b.warningMs = b.beamMs = b.coreOpenMs = 0;
        s.hostileShots = []; s.enemies.filter(enemy => enemy.bossDrone).forEach(enemy => { enemy.health = 0; });
        s.message = 'BLOCKADE BROKEN / DAMAGED INDEX LOCATED'; s.messageMs = 3200;
        for (let i = 0; i < 12; i++) this.spark(BOSS_X + (i % 4 - 2) * 42, 570 + Math.floor(i / 4) * 86, '#ffe49c');
      }
      return true;
    },
    update(delta) {
      if (!this.active || this.exiting || this.status !== 'playing') return;
      const s = this.state, p = s.player, dt = clamp(delta, 0, 100) / 1000;
      s.elapsedMs += delta;
      s.fireCooldownMs = Math.max(0, s.fireCooldownMs - delta);
      s.flashMs = Math.max(0, s.flashMs - delta); s.messageMs = Math.max(0, s.messageMs - delta);
      p.invulnerableMs = Math.max(0, p.invulnerableMs - delta);
      p.scatterMs = Math.max(0, p.scatterMs - delta); p.muzzleMs = Math.max(0, p.muzzleMs - delta);
      s.hitFx.forEach(fx => { fx.ms -= delta; }); s.hitFx = s.hitFx.filter(fx => fx.ms > 0);
      const previousBottom = p.y + PLAYER_H;
      p.x = clamp(p.x + p.vx * dt, 0, WIDTH - PLAYER_W);
      for (let i = 0; i < RELAYS.length; i++) if (s.relays[i] > 0 && p.x + PLAYER_W > RELAYS[i].x - 50 && p.x < RELAYS[i].x + 46)
        p.x = RELAYS[i].x - 50 - PLAYER_W;
      if (s.boss.active && !s.boss.defeated && p.x + PLAYER_W > BOSS_X - 60)
        p.x = BOSS_X - 60 - PLAYER_W;
      p.vy = Math.min(1100, p.vy + 1850 * dt); p.y += p.vy * dt;
      p.grounded = false;
      for (const platform of PLATFORMS) {
        if (p.vy >= 0 && previousBottom <= platform.y + 9 && p.y + PLAYER_H >= platform.y &&
            p.x + PLAYER_W > platform.x && p.x < platform.x + platform.w) {
          p.y = platform.y - PLAYER_H; p.vy = 0; p.grounded = true;
        }
      }
      if (p.y + PLAYER_H >= FLOOR) { p.y = FLOOR - PLAYER_H; p.vy = 0; p.grounded = true; }
      for (const pickup of s.pickups) if (pickup.active && rectHit({ x: pickup.x, y: pickup.y, w: 30, h: 30 },
        { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H })) {
        pickup.active = false; p.scatterMs = 11500;
        s.message = 'SCATTER SIGNAL — HOLD FIRE TO FAN OUT'; s.messageMs = 1800;
        this.spark(pickup.x + 15, pickup.y + 15, '#ffe18d');
      }
      this.activateBoss();
      for (const enemy of s.enemies) {
        if (enemy.health <= 0) continue;
        if (enemy.spawnMs > 0) { enemy.spawnMs -= delta; continue; }
        enemy.ageMs = (enemy.ageMs || 0) + delta;
        const distance = Math.abs(enemy.x - p.x);
        if (enemy.kind === 'runner') {
          if (distance < 750 || enemy.reinforcement) enemy.direction = Math.sign(p.x - enemy.x) || enemy.direction;
          enemy.x += enemy.direction * (distance < 750 || enemy.reinforcement ? 195 : 90) * dt;
          if (!enemy.reinforcement && distance >= 750 && (enemy.x < enemy.min || enemy.x > enemy.max)) {
            enemy.x = clamp(enemy.x, enemy.min, enemy.max); enemy.direction *= -1;
          }
        } else {
          if (enemy.kind === 'drone') {
            const anchor = enemy.bossDrone ? BOSS_X - 190 : enemy.platformY === 625 ? 2420 : 4050;
            enemy.x = anchor + Math.sin(enemy.ageMs / 750) * 76;
            enemy.y = enemy.platformY + Math.sin(enemy.ageMs / 480) * 34;
          }
          if (enemy.kind === 'patrol') {
            enemy.x += enemy.direction * 82 * dt;
            if (enemy.x < enemy.min || enemy.x > enemy.max) { enemy.x = clamp(enemy.x, enemy.min, enemy.max); enemy.direction *= -1; }
          }
          if (enemy.warningMs > 0) {
            enemy.warningMs -= delta;
            if (enemy.warningMs <= 0) {
              const direction = Math.sign(p.x - enemy.x) || -1;
              const speed = enemy.kind === 'gunner' ? 535 : enemy.kind === 'drone' ? 550 : 465;
              const originY = enemy.y + (enemy.kind === 'drone' ? 18 : 30);
              s.hostileShots.push({ x: enemy.x + 20, y: originY, vx: direction * speed,
                vy: clamp((p.y + 34 - originY) / Math.max(0.5, distance / speed), -270, 270), life: 1700 });
              enemy.cooldownMs = enemy.kind === 'gunner' ? 1750 : enemy.kind === 'drone' ? 2400 : 2100;
            }
          } else {
            enemy.cooldownMs -= delta;
            if (enemy.cooldownMs <= 0 && distance < (enemy.kind === 'gunner' ? 950 : 750))
              enemy.warningMs = enemy.kind === 'gunner' ? 760 : 690;
          }
        }
        if (rectHit({ x: enemy.x, y: enemy.y, w: 42, h: enemy.kind === 'drone' ? 42 : 64 },
          { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H })) this.hitPlayer();
      }
      for (const shot of s.shots) {
        shot.x += shot.vx * dt; shot.y += (shot.vy || 0) * dt; shot.life -= delta;
        for (let i = 0; i < NODES.length; i++) {
          const node = NODES[i];
          if (s.nodes[i] > 0 && rectHit({ x: shot.x, y: shot.y, w: 18, h: 8 }, { x: node.x, y: node.y, w: 46, h: 52 })) {
            shot.life = 0; s.nodes[i]--;
            this.spark(node.x + 23, node.y + 24, '#ff8db7');
            s.message = s.nodes[i] ? `NODE ${i + 1} / ${s.nodes[i]} HITS REMAIN` : `NODE ${i + 1} DOWN — RELAY EXPOSED`;
            s.messageMs = 1200;
            break;
          }
        }
        if (shot.life <= 0) continue;
        if (this.hitBoss(shot)) continue;
        for (let i = 0; i < RELAYS.length; i++) {
          const r = RELAYS[i];
          if (s.relays[i] > 0 && rectHit({ x: shot.x, y: shot.y, w: 18, h: 8 }, { x: r.x - 28, y: 500, w: 65, h: FLOOR - 500 })) {
            shot.life = 0;
            if (s.nodes[i] > 0 || s.counter?.index === i) {
              this.spark(r.x + 4, shot.y, '#8fdbff');
              if (s.nodes[i] > 0 && s.messageMs < 550) {
                s.message = `RELAY ${i + 1} SHIELDED — CLIMB TO ITS ROOF NODE`; s.messageMs = 1400;
              }
              break;
            }
            s.relays[i]--;
            this.spark(r.x + 4, shot.y, '#ffe7a2');
            s.message = s.relays[i] ? `RELAY ${i + 1} / ${s.relays[i]} HITS REMAIN` : `RELAY ${i + 1} DISABLED`;
            s.messageMs = 1100;
            if (s.relays[i] === 0) this.checkpoint(i === 0 ? 'proof-relay' : 'proof-relay-2');
            else if (s.relays[i] === r.counterAt) this.startCounter(i);
            break;
          }
        }
        if (shot.life <= 0) continue;
        for (const enemy of s.enemies) if (enemy.health > 0 && enemy.spawnMs <= 0 &&
          rectHit({ x: shot.x, y: shot.y, w: 18, h: 8 },
            { x: enemy.x, y: enemy.y, w: 42, h: enemy.kind === 'drone' ? 42 : 64 })) {
          if (enemy.kind === 'bulwark' && enemy.warningMs <= 0 &&
              Math.sign(shot.vx) === -enemy.direction) {
            shot.life = 0; this.spark(enemy.x + 20, shot.y, '#8dbce3');
            if (s.messageMs < 500) {
              s.message = 'SHIELD UNIT — FLANK OR SHOOT DURING CHARGE'; s.messageMs = 1400;
            }
            break;
          }
          enemy.health--; shot.life = 0;
          this.spark(enemy.x + 20, enemy.y + 30, '#ffc0a6');
          if (enemy.health === 0) { s.kills++; s.message = 'DEFENSE CLEARED'; s.messageMs = 850; }
          break;
        }
      }
      s.shots = s.shots.filter(shot => shot.life > 0 && shot.x >= 0 && shot.x <= WIDTH && shot.y > 0 && shot.y < FLOOR);
      for (const shot of s.hostileShots) {
        shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= delta;
        if (shot.life > 0 && rectHit({ x: shot.x, y: shot.y, w: 21, h: 13 }, { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H })) {
          shot.life = 0; this.hitPlayer();
        }
      }
      s.hostileShots = s.hostileShots.filter(shot => shot.life > 0 && shot.x >= 0 && shot.x <= WIDTH && shot.y > 0 && shot.y < FLOOR);
      this.updateCounter(delta);
      this.phrase(delta);
      this.updateBoss(delta);
      const cameraGoal = s.boss.active && !s.boss.defeated ? 3500
        : clamp(p.x - 420, 0, WIDTH - VIEW_WIDTH);
      s.cameraX += (cameraGoal - s.cameraX) * Math.min(1, dt * 6);
      if (p.x >= WIDTH - 130 && s.relays.every(hp => hp === 0) && s.boss.defeated) {
        this.status = s.status = 'clear'; p.vx = 0;
        this.checkpoint('proof-clear');
      }
    },
    draw(ctx) {
      if (!ctx || !this.active) return;
      const s = this.state, p = s.player, camera = s.cameraX;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, FLOOR);
      sky.addColorStop(0, '#0b1225'); sky.addColorStop(0.6, '#172036'); sky.addColorStop(1, '#352447');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 1920, 1080);
      ctx.translate(0, WORLD_Y); ctx.scale(WORLD_SCALE, WORLD_SCALE);
      for (let i = 0; i < 18; i++) {
        const x = i * 175 - (camera * 0.28 % 175), height = 290 + (i * 73 % 230);
        ctx.fillStyle = i % 3 ? '#142237' : '#1a2940'; ctx.fillRect(x, FLOOR - height, 145, height);
        ctx.fillStyle = '#507c86';
        for (let y = FLOOR - height + 30; y < FLOOR - 24; y += 48) for (let j = 0; j < 3; j++) if ((i + j + y) % 4)
          ctx.fillRect(x + 17 + j * 38, y, 14, 18);
      }
      ctx.translate(-camera, 0);
      for (let i = 0; i < 13; i++) {
        const x = i * 400;
        ctx.fillStyle = '#253042'; ctx.fillRect(x, FLOOR - 335 - (i % 3) * 55, 310, 335 + (i % 3) * 55);
        ctx.fillStyle = '#36536b'; ctx.fillRect(x + 18, FLOOR - 292 - (i % 3) * 55, 270, 5);
        ctx.fillStyle = '#142435';
        for (let y = FLOOR - 250 - (i % 3) * 55; y < FLOOR - 25; y += 60) for (let j = 0; j < 3; j++)
          ctx.fillRect(x + 40 + j * 74, y, 35, 36);
      }
      // The blockade changes the skyline from venue posters to a single
      // transmitter silhouette. These are preview story props, not lore grants.
      for (const sign of [
        { x: 120, y: 456, w: 360, title: 'RECOVERED SIGNAL', sub: 'CACHE BACK // PAYLOAD HELD' },
        { x: 1815, y: 438, w: 410, title: 'DISTRIBUTION DENIED', sub: 'ROUTE TO RECONSTRUCTION' },
        { x: 3440, y: 440, w: 360, title: 'UPLINK LOCKED', sub: 'BREAK THE TRANSMITTER' }
      ]) {
        ctx.fillStyle = '#0b1828'; ctx.fillRect(sign.x, sign.y, sign.w, 94);
        ctx.strokeStyle = '#b05279'; ctx.lineWidth = 3; ctx.strokeRect(sign.x, sign.y, sign.w, 94);
        ctx.fillStyle = '#ff97b3'; ctx.font = 'bold 24px Oxanium, monospace'; ctx.textAlign = 'left';
        ctx.fillText(sign.title, sign.x + 18, sign.y + 37);
        ctx.fillStyle = '#a9d6dc'; ctx.font = '17px Oxanium, monospace';
        ctx.fillText(sign.sub, sign.x + 18, sign.y + 68);
      }
      ctx.fillStyle = '#0a1929'; ctx.fillRect(4385, 300, 360, FLOOR - 300);
      ctx.fillStyle = '#182d40'; ctx.fillRect(4410, 332, 270, FLOOR - 332);
      ctx.strokeStyle = '#528495'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(4510, 344); ctx.lineTo(4510, 178);
      ctx.moveTo(4450, 253); ctx.lineTo(4570, 253); ctx.stroke();
      for (const radius of [92, 149, 214]) {
        ctx.strokeStyle = `rgba(255,111,154,${0.15 + 0.08 * Math.sin(s.elapsedMs / 370 + radius)})`;
        ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(4510, 270, radius, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      }
      ctx.fillStyle = '#a8c8d1'; ctx.font = 'bold 26px Oxanium, monospace'; ctx.textAlign = 'center';
      ctx.fillText('DISTRIBUTION', 4550, 399);
      ctx.fillStyle = '#ff83a7'; ctx.fillText('BLOCKADE', 4550, 433);
      ctx.fillStyle = '#17212d'; ctx.fillRect(0, FLOOR, WIDTH, 282);
      ctx.fillStyle = '#6b536e'; ctx.fillRect(0, FLOOR, WIDTH, 7);
      ctx.fillStyle = '#496a72';
      for (let x = 0; x < WIDTH; x += 180) ctx.fillRect(x + 30, FLOOR + 85, 90, 4);
      for (let i = 0; i < 11; i++) {
        const x = 230 + i * 445, glow = 0.3 + 0.16 * Math.sin(s.elapsedMs / 420 + i);
        ctx.fillStyle = '#182a39'; ctx.fillRect(x, FLOOR - 425, 8, 425);
        ctx.fillStyle = `rgba(159,255,221,${glow})`; ctx.fillRect(x - 8, FLOOR - 433, 24, 10);
        ctx.fillStyle = '#37516b'; ctx.fillRect(x + 8, FLOOR - 255, 90, 4);
      }
      for (const platform of PLATFORMS) {
        ctx.fillStyle = '#1d3745'; ctx.fillRect(platform.x, platform.y, platform.w, 22);
        ctx.fillStyle = '#92ffdc'; ctx.fillRect(platform.x, platform.y, platform.w, 4);
        ctx.fillStyle = '#3c5064'; ctx.fillRect(platform.x + 18, platform.y + 22, 10, FLOOR - platform.y - 22);
        ctx.fillRect(platform.x + platform.w - 28, platform.y + 22, 10, FLOOR - platform.y - 22);
      }
      NODES.forEach((node, i) => {
        const alive = s.nodes[i] > 0;
        if (alive) {
          ctx.strokeStyle = `rgba(255,126,169,${0.43 + 0.2 * Math.sin(s.elapsedMs / 170)})`;
          ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(node.x + 23, node.y + 20);
          ctx.lineTo(RELAYS[i].x + 5, 520); ctx.stroke();
        }
        ctx.fillStyle = alive ? '#263247' : '#253c41'; ctx.fillRect(node.x - 7, node.y - 9, 60, 66);
        ctx.strokeStyle = alive ? '#ff8ba9' : '#82afa0'; ctx.lineWidth = 3;
        ctx.strokeRect(node.x - 7, node.y - 9, 60, 66);
        ctx.fillStyle = alive ? '#ff89b7' : '#82afa0';
        ctx.fillRect(node.x + 7, node.y + 4, 32, 28);
        ctx.fillStyle = '#d8e9e7'; ctx.font = 'bold 17px Oxanium, monospace'; ctx.textAlign = 'center';
        ctx.fillText(alive ? `NODE ${i + 1} / ${s.nodes[i]}` : 'NODE OFF', node.x + 23, node.y - 20);
      });
      for (const pickup of s.pickups) if (pickup.active) {
        const y = pickup.y + Math.sin(s.elapsedMs / 210) * 4;
        ctx.fillStyle = '#ffe0a1'; ctx.beginPath(); ctx.moveTo(pickup.x + 15, y - 8);
        ctx.lineTo(pickup.x + 35, y + 15); ctx.lineTo(pickup.x + 15, y + 38);
        ctx.lineTo(pickup.x - 5, y + 15); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#442e50'; ctx.font = 'bold 15px Oxanium, monospace'; ctx.textAlign = 'center';
        ctx.fillText('3', pickup.x + 15, y + 21);
        ctx.fillStyle = '#ffe0a1'; ctx.fillText('SCATTER', pickup.x + 15, y - 20);
      }
      RELAYS.forEach((relay, i) => {
        const alive = s.relays[i] > 0;
        ctx.fillStyle = alive ? '#142a36' : '#203442'; ctx.fillRect(relay.x - 28, 500, 65, FLOOR - 500);
        ctx.fillStyle = alive ? '#ff7399' : '#83a6a4'; ctx.fillRect(relay.x - 28, 500, 65, 10);
        ctx.fillRect(relay.x - 7, 555, 23, 160);
        if (alive && (s.nodes[i] > 0 || s.counter?.index === i)) {
          ctx.strokeStyle = s.counter?.index === i ? '#ffae82' : '#8fdbff'; ctx.lineWidth = 7;
          ctx.strokeRect(relay.x - 35, 493, 79, FLOOR - 487);
        }
        ctx.fillStyle = '#d4f3ec'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
        ctx.fillText(!alive ? 'OFF' : s.nodes[i] > 0 ? 'LINKED' : s.counter?.index === i ? 'SURGE' : `${s.relays[i]} / ${relay.hp}`, relay.x + 4, 485);
        if (alive && (s.warning && i === this.volleyTarget() || s.counter?.index === i && !s.counter.fired)) {
          ctx.fillStyle = 'rgba(255,100,137,0.18)'; ctx.fillRect(relay.x - 1280, FLOOR - 140, 1250, 108);
          ctx.strokeStyle = '#ff8aaa'; ctx.lineWidth = 3;
          for (const y of [FLOOR - 100, FLOOR - 53]) { ctx.beginPath(); ctx.moveTo(relay.x - 1280, y); ctx.lineTo(relay.x - 32, y); ctx.stroke(); }
          if (s.counter?.index === i && s.counter.roofY != null && !s.counter.fired) {
            ctx.strokeStyle = '#ffbd83'; ctx.beginPath(); ctx.moveTo(relay.x - 1280, s.counter.roofY);
            ctx.lineTo(relay.x - 32, s.counter.roofY); ctx.stroke();
            ctx.fillStyle = '#ffbd83'; ctx.font = 'bold 18px Oxanium, monospace'; ctx.textAlign = 'right';
            ctx.fillText('ROOF SHOT', relay.x - 44, s.counter.roofY - 14);
          }
        }
      });
      const boss = s.boss;
      if (boss.active || s.relays.every(hp => hp === 0)) {
        // The two heights make the player commit to street or rooftop fire.
        ctx.fillStyle = '#0b1422'; ctx.fillRect(BOSS_X - 100, 555, 213, FLOOR - 555);
        ctx.strokeStyle = boss.defeated ? '#6f9e99' : '#e06b96'; ctx.lineWidth = 9;
        ctx.strokeRect(BOSS_X - 100, 555, 213, FLOOR - 556);
        ctx.fillStyle = '#22394b'; ctx.fillRect(BOSS_X - 84, 571, 180, 203);
        ctx.fillStyle = '#566d80';
        for (const offset of [0, 42, 84, 126]) {
          ctx.fillRect(BOSS_X + 48, 581 + offset, 41, 12);
          ctx.fillRect(BOSS_X - 82, 587 + offset, 28, 8);
        }
        ctx.fillStyle = boss.defeated ? '#203c43' : '#9c3b65';
        ctx.beginPath(); ctx.moveTo(BOSS_X - 24, 551); ctx.lineTo(BOSS_X + 10, 474);
        ctx.lineTo(BOSS_X + 47, 551); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 2; i++) {
          const feed = BOSS_FEEDS[i], live = boss.feeds[i] > 0;
          ctx.fillStyle = live ? '#ffbd80' : '#314657'; ctx.fillRect(feed.x - 5, feed.y - 4, feed.w + 10, feed.h + 8);
          ctx.fillStyle = live ? '#fff2c5' : '#182d38'; ctx.fillRect(feed.x + 9, feed.y + 11, feed.w - 18, feed.h - 22);
          ctx.fillStyle = '#102131'; ctx.fillRect(feed.x + 20, feed.y + 20, feed.w - 40, feed.h - 40);
          ctx.fillStyle = '#e9e9e5'; ctx.font = 'bold 17px Oxanium, monospace'; ctx.textAlign = 'right';
          ctx.fillText(live ? `FEED ${i + 1} / ${boss.feeds[i]}` : `FEED ${i + 1} OFF`, feed.x - 16, feed.y + 33);
        }
        if (boss.feeds.every(hp => hp === 0) && !boss.defeated) {
          ctx.fillStyle = boss.coreOpenMs > 0 ? boss.flashMs ? '#fff4c9' : '#ff799e' : '#6298ac';
          ctx.fillRect(BOSS_CORE.x + 9, BOSS_CORE.y + 6, 44, 42);
          ctx.strokeStyle = boss.coreOpenMs > 0 ? '#fff1bf' : '#8dbacf'; ctx.lineWidth = 3;
          ctx.strokeRect(BOSS_CORE.x + 4, BOSS_CORE.y + 1, 54, 54);
          if (boss.coreOpenMs <= 0) {
            ctx.fillStyle = '#223d51'; ctx.fillRect(BOSS_CORE.x + 2, BOSS_CORE.y + 4, 58, 48);
            ctx.fillStyle = '#75aabd'; ctx.fillRect(BOSS_CORE.x + 10, BOSS_CORE.y + 21, 42, 9);
          }
          ctx.fillStyle = boss.coreOpenMs > 0 ? '#ffe0a8' : '#9cc5d0';
          ctx.font = 'bold 16px Oxanium, monospace'; ctx.textAlign = 'center';
          ctx.fillText(boss.coreOpenMs > 0 ? 'CORE OPEN' : 'CORE LOCKED', BOSS_CORE.x + 34, BOSS_CORE.y - 12);
        }
        if (boss.defeated) {
          ctx.fillStyle = '#a4ffdc'; ctx.font = 'bold 25px Oxanium, monospace'; ctx.textAlign = 'center';
          ctx.fillText('SIGNAL OPEN', BOSS_X, 540);
        }
        if (boss.warningMs > 0 && !boss.defeated) {
          ctx.lineWidth = 4; ctx.strokeStyle = '#ff8dae';
          if (boss.attack === 'beam') {
            ctx.fillStyle = 'rgba(255,125,165,0.21)'; ctx.fillRect(boss.beamX, 290, 56, FLOOR - 290);
            ctx.strokeRect(boss.beamX, 290, 56, FLOOR - 290);
          } else if (boss.attack === 'sweep') {
            for (const y of [FLOOR - 54, FLOOR - 104]) {
              ctx.beginPath(); ctx.moveTo(BOSS_GATE, y); ctx.lineTo(BOSS_X - 68, y); ctx.stroke();
            }
          } else {
            ctx.beginPath(); ctx.moveTo(BOSS_X - 60, 692);
            ctx.lineTo(s.player.x + 22, s.player.y + 37); ctx.stroke();
          }
        }
        if (boss.beamMs > 0) {
          ctx.fillStyle = 'rgba(255,165,187,0.55)'; ctx.fillRect(boss.beamX, 290, 56, FLOOR - 290);
          ctx.fillStyle = '#fff0d4'; ctx.fillRect(boss.beamX + 22, 290, 12, FLOOR - 290);
        }
      }
      ctx.fillStyle = '#91ffdd'; ctx.fillRect(WIDTH - 110, FLOOR - 170, 13, 170);
      ctx.fillStyle = '#d7f9f4'; ctx.font = 'bold 20px monospace'; ctx.fillText('UPLINK', WIDTH - 105, FLOOR - 184);
      for (const enemy of s.enemies) if (enemy.health > 0) {
        if (enemy.spawnMs > 0) {
          ctx.strokeStyle = '#ffbd85'; ctx.lineWidth = 4; ctx.strokeRect(enemy.x - 13, enemy.y - 20, 68, 88);
          ctx.fillStyle = '#ffbd85'; ctx.font = 'bold 16px Oxanium, monospace'; ctx.textAlign = 'center';
          ctx.fillText('INBOUND', enemy.x + 21, enemy.y - 33);
          continue;
        }
        const gunner = enemy.kind === 'gunner', runner = enemy.kind === 'runner';
        if (enemy.kind === 'drone') {
          ctx.fillStyle = '#182538'; ctx.beginPath(); ctx.moveTo(enemy.x - 22, enemy.y + 18);
          ctx.lineTo(enemy.x + 21, enemy.y - 13); ctx.lineTo(enemy.x + 64, enemy.y + 18);
          ctx.lineTo(enemy.x + 21, enemy.y + 48); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#82d4ee'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(enemy.x - 22, enemy.y + 18); ctx.lineTo(enemy.x + 21, enemy.y - 13);
          ctx.lineTo(enemy.x + 64, enemy.y + 18); ctx.lineTo(enemy.x + 21, enemy.y + 48);
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = enemy.warningMs > 0 ? '#fff0c0' : '#ff88af';
          ctx.fillRect(enemy.x + 11, enemy.y + 10, 22, 16);
          if (enemy.warningMs > 0) { ctx.strokeStyle = '#ff9db3'; ctx.strokeRect(enemy.x - 28, enemy.y - 20, 99, 75); }
          continue;
        }
        ctx.fillStyle = enemy.warningMs > 0 ? '#ff9d9e' : gunner ? '#789ec7' : runner ? '#ed9a77' : '#b08bdd';
        ctx.fillRect(enemy.x + (runner ? 8 : 0), enemy.y + 14, runner ? 35 : 42, runner ? 38 : 45);
        ctx.fillStyle = '#101727'; ctx.fillRect(enemy.x + 4, enemy.y + (runner ? 17 : 0), 34, 25);
        ctx.fillStyle = enemy.warningMs > 0 ? '#fff0d6' : '#9affdf'; ctx.fillRect(enemy.x + 9, enemy.y + 24, 24, 7);
        ctx.fillStyle = gunner ? '#82baff' : '#48354e';
        ctx.fillRect(enemy.x + (gunner ? -19 : 9), enemy.y + 45, gunner ? 27 : 8, gunner ? 9 : 18);
        ctx.fillRect(enemy.x + 28, enemy.y + 49, 9, 15);
        if (gunner) { ctx.fillStyle = '#ffad92'; ctx.fillRect(enemy.x + 30, enemy.y + 34, 28, 7); }
        if (runner) { ctx.strokeStyle = '#ffb47d'; ctx.beginPath(); ctx.moveTo(enemy.x - 12, enemy.y + 56); ctx.lineTo(enemy.x + 3, enemy.y + 56); ctx.stroke(); }
        if (enemy.kind === 'bulwark') {
          ctx.fillStyle = enemy.warningMs > 0 ? '#ffbd8f' : '#7bacd2';
          ctx.fillRect(enemy.x - 18, enemy.y + 10, 17, 53);
          ctx.strokeStyle = '#b5ddf4'; ctx.lineWidth = 3; ctx.strokeRect(enemy.x - 22, enemy.y + 6, 22, 60);
          ctx.fillStyle = '#ffbf9b'; ctx.fillRect(enemy.x + 10, enemy.y + 26, 24, 13);
        }
        if (enemy.warningMs > 0) { ctx.strokeStyle = '#ff8098'; ctx.lineWidth = 3; ctx.strokeRect(enemy.x - 9, enemy.y - 9, 60, 83); }
      }
      ctx.fillStyle = '#b4ffdb'; for (const shot of s.shots) {
        ctx.fillRect(shot.x, shot.y, 20, 7);
        ctx.fillStyle = 'rgba(151,255,226,0.42)'; ctx.fillRect(shot.x - Math.sign(shot.vx) * 18, shot.y + 2, 15, 3);
        ctx.fillStyle = '#b4ffdb';
      }
      for (const shot of s.hostileShots) {
        ctx.fillStyle = shot.roof ? '#ffbd83' : shot.volley ? '#ff789d' : '#f5ad8d'; ctx.fillRect(shot.x, shot.y, 21, 13);
      }
      for (const fx of s.hitFx) {
        ctx.strokeStyle = fx.color; ctx.lineWidth = 3 * fx.ms / 220;
        const r = 12 + (220 - fx.ms) * 0.17;
        ctx.beginPath(); ctx.moveTo(fx.x - r, fx.y); ctx.lineTo(fx.x + r, fx.y);
        ctx.moveTo(fx.x, fx.y - r); ctx.lineTo(fx.x, fx.y + r); ctx.stroke();
      }
      if (p.invulnerableMs <= 0 || Math.floor(p.invulnerableMs / 75) % 2 === 0) {
        if (p.scatterMs > 0) { ctx.strokeStyle = 'rgba(255,220,139,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(p.x - 7, p.y - 7, 58, 90); }
        ctx.fillStyle = '#131925'; ctx.fillRect(p.x + 4, p.y + 25, 36, 51);
        ctx.fillStyle = '#e8ecf3'; ctx.fillRect(p.x + 8, p.y + 20, 28, 24);
        ctx.fillStyle = '#080c16'; ctx.fillRect(p.x + 3, p.y + 12, 41, 13);
        ctx.fillStyle = '#9affd7'; ctx.fillRect(p.x + (p.facing > 0 ? 25 : 11), p.y + 31, 8, 5);
        ctx.fillStyle = '#7249a5'; ctx.fillRect(p.x + (p.facing > 0 ? 32 : -20), p.y + 36, 27, 11);
        if (p.muzzleMs > 0) { ctx.fillStyle = '#ffe8a8'; ctx.fillRect(p.x + (p.facing > 0 ? 60 : -32), p.y + 36, 17, 10); }
      }
      ctx.restore();
      ctx.save();
      ctx.fillStyle = 'rgba(4,13,24,0.94)'; ctx.fillRect(0, 0, 1920, 142);
      ctx.fillStyle = '#97ffdc'; ctx.font = 'bold 28px Oxanium, monospace'; ctx.textAlign = 'left';
      ctx.fillText('BROADCAST SLUM / RUN-AND-GUN PROOF', 48, 48);
      ctx.font = '21px Oxanium, monospace'; ctx.fillStyle = '#d3def0';
      const target = s.relays.findIndex(hp => hp > 0);
      const objective = target < 0 ? !boss.active ? 'Reach the transmitter. The uplink is still locked.'
        : boss.defeated ? 'Transmitter down. Reach the uplink to end the preview.'
          : boss.feeds.some(hp => hp > 0) ? 'Transmitter: break the upper and lower feeds, then hit the core.'
            : 'Transmitter core: counterfire during each recovery window.' : s.nodes[target] > 0
        ? `Relay ${target + 1}: climb and break its roof node to drop the shield.`
        : s.counter?.index === target ? `Relay ${target + 1}: counter surge — dodge the lanes and watch your back.`
        : `Relay ${target + 1} exposed. Shoot the core, then move on.`;
      ctx.fillText(objective, 48, 87);
      ctx.fillStyle = '#c6addf'; ctx.fillText('ARCHITECTURE PREVIEW / The Cache Line precedes this sector in story order', 48, 122);
      if (boss.active && !boss.defeated) {
        ctx.fillStyle = 'rgba(8,19,30,0.94)'; ctx.fillRect(1280, 146, 575, 53);
        ctx.strokeStyle = boss.phase === 2 ? '#ff9b76' : '#ff81a6'; ctx.lineWidth = 2;
        ctx.strokeRect(1280, 146, 575, 53);
        ctx.fillStyle = '#f9dce7'; ctx.font = 'bold 17px Oxanium, monospace'; ctx.textAlign = 'left';
        ctx.fillText(`TRANSMITTER  /  ${boss.feeds.some(hp => hp > 0) ? 'POWER FEEDS'
          : `CORE ${boss.health} / 20  ${boss.coreOpenMs > 0 ? 'EXPOSED' : 'ARMORED'}`}`, 1295, 168);
        ctx.fillStyle = '#432d42'; ctx.fillRect(1295, 177, 545, 9);
        ctx.fillStyle = boss.phase === 2 ? '#ffb382' : '#ff8ba9';
        ctx.fillRect(1295, 177, 545 * (boss.feeds.some(hp => hp > 0) ?
          (boss.feeds[0] + boss.feeds[1]) / 8 : boss.health / 20), 9);
      }
      if (this.audioDegraded) {
        ctx.fillStyle = '#ffbd83'; ctx.textAlign = 'center'; ctx.font = '20px Oxanium, monospace';
        ctx.fillText('AUDIO FALLBACK / CHECK LOCAL PROTOTYPE STEMS IN THIS HOST', 960, 165);
      }
      ctx.textAlign = 'right'; ctx.fillStyle = '#ff9db3'; ctx.fillText('SIGNAL', 1735, 48);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i < p.health ? '#ff8aab' : '#40364c'; ctx.fillRect(1762 + i * 27, 30, 19, 25);
        ctx.strokeStyle = '#ba7899'; ctx.lineWidth = 1; ctx.strokeRect(1762 + i * 27, 30, 19, 25);
      }
      ctx.fillStyle = '#a7ffdd'; ctx.fillText(`RELAYS  ${s.relays.filter(hp => hp === 0).length} / 2`, 1865, 87);
      ctx.font = '19px Oxanium, monospace'; ctx.fillStyle = '#c3c9df';
      ctx.fillText(`${Math.floor(s.elapsedMs / 60000)}:${String(Math.floor(s.elapsedMs / 1000) % 60).padStart(2, '0')}  /  KILLS ${s.kills}`, 1865, 121);
      if (p.scatterMs > 0) {
        ctx.fillStyle = '#ffe0a1'; ctx.textAlign = 'left'; ctx.font = 'bold 20px Oxanium, monospace';
        ctx.fillText(`SCATTER  ${Math.ceil(p.scatterMs / 1000)}s`, 48, 167);
      }
      if (s.counter && !s.counter.fired && this.status === 'playing') {
        ctx.fillStyle = '#ffbd88'; ctx.font = 'bold 27px Oxanium, monospace'; ctx.textAlign = 'center';
        ctx.fillText('COUNTER SURGE — JUMP THE LANES / RUNNER BEHIND', 960, 203);
      } else if (s.warning && this.status === 'playing') {
        ctx.fillStyle = '#ff9db3'; ctx.font = 'bold 27px Oxanium, monospace'; ctx.textAlign = 'center';
        ctx.fillText('PHRASE VOLLEY INCOMING — JUMP ABOVE BOTH LANES', 960, 203);
      } else if (boss.warningMs > 0 && this.status === 'playing') {
        ctx.fillStyle = '#ffbd96'; ctx.font = 'bold 27px Oxanium, monospace'; ctx.textAlign = 'center';
        ctx.fillText(boss.attack === 'beam' ? 'TARGET COLUMN — MOVE SIDEWAYS'
          : boss.attack === 'fan' ? 'FAN BURST — CHANGE HEIGHT' : 'FLOOR SWEEP — JUMP', 960, 203);
      } else if (s.messageMs > 0) {
        ctx.fillStyle = '#a9ffe4'; ctx.font = 'bold 25px Oxanium, monospace'; ctx.textAlign = 'center';
        ctx.fillText(s.message, 960, 203);
      }
      ctx.fillStyle = 'rgba(4,13,24,0.88)'; ctx.fillRect(0, 1014, 1920, 66);
      ctx.fillStyle = '#cbd9e7'; ctx.font = '20px Oxanium, monospace'; ctx.textAlign = 'center';
      ctx.fillText(B.GamepadUI?.connected ? 'STICK / D-PAD MOVE     CROSS / A JUMP     R1 / RB FIRE     START PAUSE' : 'A / D MOVE     SPACE JUMP     HOLD E FIRE     P PAUSE', 960, 1055);
      if (s.flashMs) { ctx.fillStyle = `rgba(255,92,126,${s.flashMs / 900})`; ctx.fillRect(0, 0, 1920, 1080); }
      if (this.status !== 'playing') {
        ctx.fillStyle = 'rgba(3,11,21,0.9)'; ctx.fillRect(0, 0, 1920, 1080);
        ctx.strokeStyle = this.status === 'clear' ? '#91ffdd' : '#ff8ea8'; ctx.lineWidth = 4; ctx.strokeRect(340, 250, 1240, 550);
        ctx.textAlign = 'center'; ctx.fillStyle = this.status === 'clear' ? '#91ffdd' : '#ff8ea8'; ctx.font = 'bold 52px Oxanium, monospace';
        ctx.fillText(this.status === 'clear' ? s.boss.legacyClear ? 'EARLIER PREVIEW CLEARED' : 'TRANSMITTER DISABLED' : 'SIGNAL LOST', 960, 378);
        ctx.fillStyle = '#e9eaf2'; ctx.font = '26px Oxanium, monospace';
        ctx.fillText(this.status === 'clear' ? s.boss.legacyClear ? 'Replay to test the new transmitter encounter.'
          : 'Working story beat: PARTITION 09 / damaged separation index.' : 'Your saved objective checkpoint is ready.', 960, 475);
        ctx.fillText(this.status === 'clear' && !s.boss.legacyClear
          ? 'Reconstruction belongs to Level 4. No Drums or campaign clear awarded.'
          : 'Architecture preview: no Drums or Level 3 campaign clear awarded.', 960, 531);
        ctx.fillStyle = '#a9ffe4'; ctx.fillText(B.GamepadUI?.connected ? 'CROSS / A — REPLAY     TRIANGLE / Y — RETURN TO HANDOFF' : 'ENTER — REPLAY     C — RETURN TO HANDOFF', 960, 661);
        ctx.fillText('P / START — PAUSE AND SETTINGS', 960, 713);
      }
      ctx.restore();
    }
  };
  B.Campaign.register(ID, { validate: saved => proof.validate(saved), restore: saved => proof.restore(saved) });
  B.Campaign.syncTitleButton();
})(window.BARCODE = window.BARCODE || {});
