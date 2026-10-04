// Campaign facts and Level 1 adapter. No new clock, input listener or renderer.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/campaign-services.js', exports: ['BARCODE.Campaign'], dependencies: ['BARCODE.LoreCollection', 'BARCODE.LevelDifficulty'] });
(function(B) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const count = n => Number.isFinite(n) ? Math.max(0, Math.min(1e10, Math.round(n))) : 0;
  const stages = ['encounter_1', 'encounter_2', 'encounter_3', 'encounter_4', 'jammer', 'boss', 'intermission'];
  const keys = ['stem.voice', 'stem.bass', 'stem.drums', 'stem.synth', 'stem.samples', 'stem.noise_fx'];
  const C = B.Campaign = {
    run: null, deathHandled: false, result: null, intermission: false, restoring: false, contactSequence: null, roadAudioNotice: null,
    adapters: new Map(),
    resetSession() { B.CacheBridge?.dispose?.({reset:true});this.deathHandled=false;this.run = null; this.result = null; this.intermission = false; this.contactSequence = null; },
    archive() { return window.lostDataSystem?.archive || (this.previewArchive ||= new B.LoreCollection()); },
    register(levelId, adapter) {
      if (!/^level-0[1-7]$/.test(levelId) || typeof adapter?.restore !== 'function' || this.adapters.has(levelId)) return false;
      this.adapters.set(levelId, adapter); return true;
    },
    begin(levelId = 'level-01') {
      if (this.restoring) return;
      B.CacheBridge?.dispose?.({reset:true});
      this.intermission = false; this.result = null; this.contactSequence = null;
      this.deathHandled=false;
      this.run = { levelId, recoveryMode:B.LevelDifficulty?.recoveryMode || 'checkpoints', difficultyId: B.LevelDifficulty?.choice?.id || 'standard',
        runId: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`, elapsedMs: 0, damageTaken: 0,
        retries: 0, attempts: 0, accurate: 0, perfect: 0, connected: 0, connectedPerfect: 0, completed: false, practice: false };
    },
    active() { return !!this.run && !this.run.completed && !!window.sector1Progression?.missionStarted; },
    tick(delta) { if (this.active() && !window.sector1Progression?.isGameplaySuppressed?.()) this.run.elapsedMs += Math.max(0, Math.min(100, delta)); },
    damage(amount) { if (this.active()) this.run.damageTaken += count(amount); },
    attempt(judgment) {
      if (!this.active() || !judgment?.available || !['perfect', 'excellent', 'miss'].includes(judgment.timing)) return;
      this.run.attempts++;
      if (judgment.timing !== 'miss') this.run.accurate++;
      if (judgment.timing === 'perfect') this.run.perfect++;
    },
    contact(sequence, judgment) {
      if (!this.active() || this.contactSequence === sequence) return;
      this.contactSequence = sequence; this.run.connected++;
      if (judgment?.timing === 'perfect') this.run.connectedPerfect++;
    },
    retryBoss() {
      if (!this.run) return;
      B.CacheBridge?.dispose?.({reset:true});
      if (this.run.completed) { this.run.practice = true; this.run.completed = false; }
      if(!this.deathHandled)this.run.retries++;this.deathHandled=false; this.contactSequence = null; this.intermission = false;
    },
    handleDeath() {
      if(!this.active() || this.deathHandled)return false;
      const saved=this.readResume();
      if(!saved || saved.levelState.run.runId!==this.run.runId)return false;
      this.deathHandled=true;this.run.retries++;
      const s=saved.levelState;
      s.run=clone(this.run);s.health=window.player?.maxHealth || 3;
      if(this.run.recoveryMode==='full-run') {
        saved.checkpointId='encounter_1';
        Object.assign(s,{score:0,bestCombo:0,playerX:200,fragments:[],skyCaches:[],ampCharges:0,boss:null,result:null});
        Object.assign(s.run,{runId:`${Date.now()}-${Math.random().toString(36).slice(2,12)}`,elapsedMs:0,damageTaken:0,retries:0,
          attempts:0,accurate:0,perfect:0,connected:0,connectedPerfect:0,completed:false,practice:false});
      }
      // Commit death before showing Retry, so reopening cannot erase the
      // recovery rule or the failed attempt. In-memory fallback still works.
      this.archive().checkpoint(saved);return true;
    },
    canRetryObjective() { return !!(window.gameState?.gameOver && this.run && this.readResume() && !this.run.practice); },
    retryObjective() {
      if(!this.canRetryObjective())return {ok:false,reason:'checkpoint-unavailable'};
      this.handleDeath();
      return B.RuntimeLifecycle?.restart({source:'objective-retry',resume:this.readResume()});
    },
    retryLabel() { return this.run?.recoveryMode==='full-run'?'Retry full run':'Retry objective'; },
    checkpoint(checkpointId) {
      if (this.restoring || !this.run || this.run.practice || !stages.includes(checkpointId)) return false;
      const p = window.sector1Progression, player = window.player;
      const levelState = { difficultyId: this.run.difficultyId, run: clone(this.run),
        score: count(window.gameState?.score), bestCombo: count(window.rhythmSystem?.runBestCombo),
        health: Math.max(1, count(player?.health)), playerX: player?.position?.x ?? 200,
        fragments: [...(window.lostDataSystem?.collectedLore || [])], skyCaches: [...(p?.skyCaches || [])],
        ampCharges: count(B.signalAmpCharges), boss: p?.bossCheckpoint ? clone(p.bossCheckpoint) : null,
        result: this.result ? clone(this.result) : null };
      if(checkpointId==='intermission')levelState.cacheBridge=B.CacheBridge?.serialize?.()||{version:1,page:0,cue:0};
      return this.archive().checkpoint({ levelId: this.run.levelId, checkpointId, levelState });
    },
    saveBridgeCheckpoint(state) {
      if(this.restoring)return false;
      const saved=this.readResume();
      if(saved?.levelId!=='level-01'||saved.checkpointId!=='intermission')return false;
      saved.levelState.cacheBridge=B.CacheBridge?.normalize?.(state)||{version:1,page:0,cue:0};
      return this.archive().checkpoint(saved);
    },
    finish({ debugSkip = false } = {}) {
      if (!this.run || this.run.completed) return this.result;
      const r = this.run;
      // Existing kill/collectible points remain. Bonuses are clear-only and
      // bounded; idle rhythm taps and boss practice cannot farm them.
      const quality = r.attempts ? Math.round(600 * r.connectedPerfect / Math.max(r.attempts, r.connectedPerfect)) : 0;
      const bonus = r.practice || debugSkip ? 0 : 1000 + quality + (r.recoveryMode==='full-run'?500:0) + (r.damageTaken === 0 && r.retries === 0 ? 500 : 0);
      if (window.gameState) window.gameState.score += bonus;
      this.result = { runId: r.runId, recoveryMode:r.recoveryMode || 'checkpoints', completedAt: Date.now(), score: count(window.gameState?.score),
        elapsedMs: count(r.elapsedMs), damageTaken: count(r.damageTaken), retries: count(r.retries),
        attempts: count(r.attempts), accurate: count(r.accurate), perfect: count(r.perfect), connected: count(r.connected),
        bestCombo: count(window.rhythmSystem?.runBestCombo), discoveries: count(window.lostDataSystem?.getProgress?.().collected), bonus };
      r.completed = true;
      if (!r.practice) {
        const number = Number(r.levelId.slice(-2));
        this.archive().completeCampaignLevel(r.levelId, r.difficultyId, this.result, keys[number - 1],
          number < 7 ? `level-0${number + 1}` : null, { recordResult: !debugSkip });
        this.checkpoint('intermission');
      }
      return this.result;
    },
    validateLevel01Checkpoint(current) {
      const s = current?.levelState;
      if (!current || current.levelId !== 'level-01' || !stages.includes(current.checkpointId) || !s || !s.run) return false;
      if (!['relaxed', 'standard', 'overclocked'].includes(s.difficultyId) || s.run.levelId !== current.levelId ||
          typeof s.run.runId !== 'string' || s.run.runId.length > 100 || !Number.isFinite(s.playerX) || s.playerX < 0 || s.playerX > 4096) return false;
      if (!Array.isArray(s.fragments) || !Array.isArray(s.skyCaches) || !['health','score','bestCombo','ampCharges'].every(k => Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1e10)) return false;
      if (!['elapsedMs', 'damageTaken', 'retries', 'attempts', 'accurate', 'perfect', 'connected', 'connectedPerfect'].every(k =>
        Number.isFinite(s.run[k]) && s.run[k] >= 0 && s.run[k] <= 1e10)) return false;
      if (['boss','intermission'].includes(current.checkpointId) && (!s.boss || !Number.isFinite(s.boss.bossX) || s.boss.bossX < 0 || s.boss.bossX > 4096 ||
          !Number.isFinite(s.boss.playerX) || s.boss.playerX < 0 || s.boss.playerX > 4096 || !Number.isFinite(s.boss.score) || !Array.isArray(s.boss.skyCaches))) return false;
      if (current.checkpointId === 'intermission' && (!s.result || !Number.isFinite(s.result.score))) return false;
      if(s.run.recoveryMode!==undefined && !['checkpoints','full-run'].includes(s.run.recoveryMode))return false;
      return true;
    },
    readResume() {
      const current = this.archive().record.current, adapter = this.adapters.get(current?.levelId);
      if (!adapter || !(current.levelId === 'level-01' ? this.validateLevel01Checkpoint(current) : adapter.validate?.(current))) return null;
      const saved=clone(current);
      if(saved.levelId==='level-01'&&saved.checkpointId==='intermission'&&B.CacheBridge)
        saved.levelState.cacheBridge=B.CacheBridge.normalize(saved.levelState.cacheBridge);
      return saved;
    },
    syncTitleButton() {
      const button = document.getElementById('continueButton');
      if (button) { const saved = this.readResume(); button.hidden = !saved; button.disabled = false;
        button.textContent = saved?.levelId === 'level-02' ? 'CONTINUE CACHE LINE — C / Y' : saved?.levelId === 'level-03' ? 'CONTINUE PROTOTYPE — C / Y' : 'CONTINUE SAVED — C / Y'; }
    },
    async continueSaved() {
      const saved = this.readResume(); if (!saved) return { ok: false, reason: 'no-checkpoint' };
      return B.RuntimeLifecycle?.start({ resume: saved, initialStart: true });
    },
    restore(saved) {
      const adapter = this.adapters.get(saved?.levelId); if (!adapter) return false;
      if(saved.levelId==='level-01'&&!this.validateLevel01Checkpoint(saved))return false;
      this.restoring = true;
      try {
        this.deathHandled=false;this.run = saved.levelId === 'level-01' ? clone(saved.levelState.run) : null;
        if (this.run) this.run.recoveryMode ||= 'checkpoints';
        this.result = saved.levelId === 'level-01' && saved.levelState.result ? clone(saved.levelState.result) : null;
        this.contactSequence = null; this.intermission = saved.checkpointId === 'intermission';
        const restored=adapter.restore(saved);
        if(restored&&this.intermission)B.CacheBridge?.start?.(saved.levelState.cacheBridge);
        return restored;
      } finally { this.restoring = false; }
    },
    openIntermission() {
      if (!window.gameState?.victory || window.sector1Progression?.areCompletionControlsReady?.() === false) return false;
      this.intermission = true;
      B.CacheBridge?.start?.(this.readResume()?.levelState?.cacheBridge);
      window.inputManager?.resetActionEdges?.(); return true;
    },
    closeIntermission() {
      if(B.CacheBridge?.pending)return false;
      if(B.CacheBridge?.active)this.saveBridgeCheckpoint(B.CacheBridge.serialize());
      B.CacheBridge?.dispose?.();this.intermission = false;window.inputManager?.resetActionEdges?.();return true;
    },
    drawIntermission(ctx) {
      B.CacheBridge?.draw?.(ctx);
    }
  };
  C.register('level-01', { restore(saved) { return window.sector1Progression?.restoreCampaignCheckpoint?.(saved) || false; } });
  C.syncTitleButton();
})(window.BARCODE = window.BARCODE || {});
