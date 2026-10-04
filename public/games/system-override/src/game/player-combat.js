// Authoritative 6 Bit primary rhythm-attack transaction.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/player-combat.js',
  exports: ['BARCODE.PlayerCombat'],
  dependencies: ['EnemyManager', 'BARCODE.MusicTransport', 'BARCODE.MusicProfiles', 'rhythmSystem']
});

(function() {
  const BARCODE = window.BARCODE = window.BARCODE || {};
  const SUCCESS_DAMAGE = { perfect: 3, excellent: 2 };
  class PlayerCombat {
    constructor(options = {}) { this.cooldownMs = options.cooldownMs ?? 250; this.range = options.range ?? 300; this.lastAttackAt = -Infinity; this.sequence = 0; this.feedback = null; }
    reset() { this.lastAttackAt = -Infinity; this.sequence = 0; this.feedback = null; this.rhythmLostUntil = 0; BARCODE.combatFX?.reset(); BARCODE.stageFX?.reset(window.sector1Progression, { resume: true }); window.renderer?.clearScreenShake?.(); window.audioSystem?.stopCombatCues?.(); }
    canAttack(now = Date.now()) { return now - this.lastAttackAt >= this.cooldownMs; }
    resolvePrimary({ player = window.player, enemyManager = window.enemyManager, now = Date.now(), timing = null, audioTimeSec = null } = {}) {
      const result = { ok: false, action: 'primary', sequence: ++this.sequence, reason: '', timing: null, damage: 0, targets: [] };
      const finish = () => { this.recordFeedback(result); if (result.timing) BARCODE.combatFX?.resolved(result, player, result.range || this.range); return result; };
      if (!this.gameplayActive()) { result.reason = 'gameplay-inactive'; return finish(); }
      if (!player) { result.reason = 'player-unavailable'; return finish(); }
      const rhythm = window.rhythmSystem;
      if (!rhythm || typeof rhythm.isActive !== 'function' || !rhythm.isActive()) { result.reason = 'rhythm-inactive'; return finish(); }
      if (!rhythm.trackStarted || rhythm.currentTempoBeat === 0) { result.reason = 'rhythm-not-ready'; result.timing = { available: false, timing: 'waiting' }; this.applyFeedback(result.timing); return finish(); }
      if (!this.canAttack(now)) { result.reason = 'cooldown'; result.timing = { available: false, timing: 'cooldown' }; return finish(); }
      this.lastAttackAt = now;
      const judgment = timing || this.getTimingJudgment(audioTimeSec);
      result.timing = judgment;
      BARCODE.Campaign?.attempt(judgment);
      if (!judgment || !judgment.available || !SUCCESS_DAMAGE[judgment.timing]) {
        result.reason = judgment && judgment.timing ? judgment.timing : 'unavailable';
        this.applyFeedback(judgment || { available: false, timing: 'unavailable' });
        return finish();
      }
      result.damage = SUCCESS_DAMAGE[judgment.timing];
      this.playAttackAnimation(player);
      this.applyFeedback(judgment);
      // A successful beat while standing on the Signal Lift powers traversal;
      // chargeSignalLift owns the support/availability checks.
      const lift = window.sector1Progression?.chargeSignalLift?.();
      if (lift?.ok) result.liftCharges = lift.charges;
      result.range = this.getAuthoritativeRange(judgment);
      const plan = this.getAttackPlan(player, enemyManager, judgment);
      result.pattern = plan.pattern;
      result.waveReach = plan.waveReach;
      const targets = this.findTargets(player, enemyManager, judgment, { plan });
      const jammerHit = this.tryDamageJammer(player, judgment, result.sequence);
      if (jammerHit.ok) { result.targets.push(jammerHit.target); BARCODE.Campaign?.contact(result.sequence, judgment); }
      const bossHit = window.sector1Progression?.applyBossRhythmDamage?.({
        player, judgment, sequence: result.sequence,
        range: window.rhythmSystem?.getAuthoritativeDamageRadius?.() ?? this.range
      }) || { ok: false };
      result.bossReason = bossHit.reason || null;
      if (bossHit.ok) {
        result.targets.push(bossHit.target);
      }
      const hitIds = new Set();
      targets.forEach(target => {
        if (!target || !target.active || hitIds.has(target)) return;
        hitIds.add(target);
        const box = target.getHitbox?.();
        const contactY = box ? box.y + box.height * 0.45 : target.position.y;
        if (typeof target.takeDamage === 'function') target.takeDamage(result.damage, { direction: Math.sign(target.position.x - player.position.x) || player.facing, x: target.position.x, y: contactY, perfect: judgment.timing === 'perfect' });
        if (!BARCODE.combatFX && window.particleSystem && typeof window.particleSystem.impact === 'function') window.particleSystem.impact(target.position.x, target.position.y, '#00ffff', 20);
        const link = plan.links.find(link => link.target === target);
        result.targets.push({ type: target.type || 'target', damage: result.damage, x: target.position && target.position.x, y: target.position && target.position.y, contactY,
          via: link?.via || 'pulse', fromX: link?.from.position.x, fromY: link?.from.position.y });
      });
      if (result.targets.length) BARCODE.Campaign?.contact(result.sequence, judgment);
      result.ok = true; result.reason = result.targets.length ? 'hit' : bossHit.reason === 'boss-guarded' ? 'boss-guarded' : 'no-target';
      return finish();
    }
    recordFeedback(result) {
      // Musical accuracy and actual contact are different results. Keep one
      // short message on the existing game clock; no timer or render loop.
      if (['gameplay-inactive', 'player-unavailable', 'cooldown'].includes(result.reason)) return;
      let text, color = '#ffbd70';
      if (result.targets.length) {
        const damage = result.targets.reduce((sum, target) => sum + target.damage, 0);
        text = `${result.timing.timing.toUpperCase()} — ${result.targets.length > 1 ? result.targets.length + ' TARGETS · ' : ''}${damage} DAMAGE`;
        color = '#00ffff';
        if (!BARCODE.combatFX) window.audioSystem?.playSound?.('synthHit');
        window.renderer?.impact?.('hit', { direction: window.player?.facing, strength: result.timing.timing === 'perfect' ? 1 : 0.7 });
      } else if (Number.isFinite(result.liftCharges)) {
        text = `LIFT CHARGED ${result.liftCharges}/2`;
        color = '#00ffff';
      } else if (result.reason === 'rhythm-inactive') text = `PRESS ${BARCODE.ControllerSettings?.prompt('rhythm_mode', 'R') || 'R'} TO ENTER RHYTHM MODE`;
      else if (result.reason === 'rhythm-not-ready') text = 'LISTEN FOR THE BEAT';
      else if (result.reason === 'miss') text = Number.isFinite(result.timing?.signedOffsetMs) ? `${result.timing.signedOffsetMs < 0 ? 'EARLY' : 'LATE'} — MATCH THE PULSE` : 'OFF BEAT — MATCH THE PULSE';
      else if (result.bossReason === 'boss-guarded') { text = 'ON BEAT — BOSS GUARDED; WAIT FOR CYAN'; if (!BARCODE.combatFX) window.audioSystem?.playSound?.('hihat'); }
      else if (result.reason === 'no-target') text = 'ON BEAT — MOVE CLOSER TO A TARGET';
      else text = 'RHYTHM TIMING NOT READY';
      this.feedback = { text, color, expiresAt: (window.gameState?.gameTime || 0) + 1000 };
    }
    getFeedback() {
      return this.feedback && (window.gameState?.gameTime || 0) < this.feedback.expiresAt ? { ...this.feedback } : null;
    }
    notifyRhythmLost() {
      this.rhythmLostUntil = (window.gameState?.gameTime || 0) + 2200;
      this.feedback = { text: 'RHYTHM MODE LOST — PRESS R TO RE-ENTER', color: '#ffbd70', expiresAt: this.rhythmLostUntil };
    }
    drawPlayerTimingCue(ctx, player) {
      if (!ctx || !player || !this.gameplayActive() || window.hackingSystem?.isActive?.() || window.tutorialSystem?.isActive?.()) return;
      const active = window.rhythmSystem?.isActive?.();
      const lost = !active && (window.gameState?.gameTime || 0) < (this.rhythmLostUntil || 0);
      if (!active && !lost) return;
      if (active) this.drawTargetPreview(ctx, player);
      if (lost) {
        ctx.save(); ctx.fillStyle = '#141e2d'; ctx.fillRect(player.position.x - 85, player.position.y - 145, 170, 28);
        ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#ffc595'; ctx.textAlign = 'center';
        ctx.fillText(BARCODE.GamepadUI?.connected ? 'PRESS B — RHYTHM OFF' : 'PRESS R — RHYTHM OFF', player.position.x, player.position.y - 127); ctx.restore();
      }
    }
    gameplayActive() { const gs = window.gameState || {}; return !(window.sector1Progression?.isGameplaySuppressed?.() || window.isPaused || window.isRunning === false || gs.paused || gs.gameOver || gs.victory || gs.running === false); }
    getTimingJudgment(capturedAudioTimeSec = null) {
      const transport = BARCODE.MusicTransport;
      const profile = BARCODE.MusicProfiles && BARCODE.MusicProfiles.getActive ? BARCODE.MusicProfiles.getActive() : null;
      const rule = profile && profile.judgmentRules && profile.judgmentRules.find(r => r.target === 'quarter-note' || /attack/.test(r.id)) || null;
      const audioTimeSec = Number.isFinite(capturedAudioTimeSec) ? capturedAudioTimeSec : window.audioSystem?.context?.currentTime;
      if (!transport || typeof transport.judgeInput !== 'function' || !rule || !Number.isFinite(audioTimeSec)) return { available: false, timing: 'unavailable' };
      return transport.judgeInput(rule.id, audioTimeSec, BARCODE.Preferences?.values.inputOffsetMs || 0) || { available: false, timing: 'unavailable' };
    }
    playAttackAnimation(player) { if (player && typeof player.startPrimaryAttackAnimation === 'function') player.startPrimaryAttackAnimation(); else if (player && typeof player.playAnimation === 'function') player.playAnimation('rhythm'); }
    applyFeedback(judgment) { if (window.rhythmSystem && typeof window.rhythmSystem.applyResolvedAttackFeedback === 'function') window.rhythmSystem.applyResolvedAttackFeedback(judgment); }
    getAuthoritativeRange(judgment = null, { jammer = false, nextSuccess = false } = {}) { if (jammer) return this.range; const rhythmRange = window.rhythmSystem && typeof window.rhythmSystem.getAuthoritativeDamageRadius === 'function' ? window.rhythmSystem.getAuthoritativeDamageRadius({ nextSuccess }) : this.range; const ampCharges = window.BARCODE && Number(window.BARCODE.signalAmpCharges || 0); const ampOk = ampCharges > 0 && judgment && (judgment.timing === 'perfect' || judgment.timing === 'excellent'); return ampOk ? 430 : rhythmRange; }
    getPattern({ nextSuccess = false } = {}) {
      const combo = (window.rhythmSystem?.combo || 0) + (nextSuccess ? 1 : 0);
      return combo >= 10 ? 'discharge' : combo >= 5 ? 'wave' : 'pulse';
    }
    getAttackPlan(player, enemyManager, judgment = null, { nextSuccess = false } = {}) {
      const enemies = enemyManager && Array.isArray(enemyManager.enemies) ? enemyManager.enemies : [];
      const range = this.getAuthoritativeRange(judgment, { nextSuccess });
      const pattern = this.getPattern({ nextSuccess }), facing = player.facing || 1;
      const eligible = enemies.filter(e => e?.active && !enemyManager?.isHijacked?.(e) && e.type !== 'broadcast_jammer' && e.type !== 'boss');
      const distance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      const targets = eligible.filter(e => distance(player, e) <= range);
      const links = targets.map(target => ({ target, from: player, via: 'pulse' }));
      const waveReach = Math.min(470, range + 85);
      if (pattern !== 'pulse') for (const e of eligible) {
        const dx = (e.position.x - player.position.x) * facing, dy = Math.abs(e.position.y - player.position.y);
        if (!targets.includes(e) && dx > 0 && dx <= waveReach && dy <= 90 && distance(player, e) <= waveReach) {
          targets.push(e); links.push({ target: e, from: player, via: 'wave' });
        }
      }
      // At most two extra ordinary targets; nearest eligible link first, stable
      // source order on ties. Boss/Jammer never enter this graph.
      if (pattern === 'discharge') for (let hop = 0; hop < 2; hop++) {
        let best = null;
        for (const from of targets) for (const target of eligible) {
          if (targets.includes(target) || distance(player, target) > Math.min(520, range + 170)) continue;
          const d = distance(from, target);
          if (d <= 140 && (!best || d < best.distance)) best = { target, from, via: 'chain', distance: d };
        }
        if (!best) break;
        targets.push(best.target); links.push(best);
      }
      return { pattern, range, waveReach, targets, links };
    }
    findTargets(player, enemyManager, judgment = null, { consumeAmp = true, nextSuccess = false, plan = null } = {}) {
      const targets = (plan || this.getAttackPlan(player, enemyManager, judgment, { nextSuccess })).targets;
      if (consumeAmp && targets.length && BARCODE.signalAmpCharges > 0 && judgment && (judgment.timing === 'perfect' || judgment.timing === 'excellent')) {
        BARCODE.signalAmpCharges -= 1;
        BARCODE.combatFX?.ampChanged('use', BARCODE.signalAmpCharges, player);
      }
      return targets;
    }
    getTargetPreview(player = window.player, enemyManager = window.enemyManager) {
      const rhythm = window.rhythmSystem;
      if (!player?.position || !this.gameplayActive() || window.hackingSystem?.isActive?.() ||
        window.tutorialSystem?.isActive?.() || !rhythm?.isActive?.() || !rhythm.trackStarted || !rhythm.currentTempoBeat) return [];
      // Preview reach for the next successful beat. The exact same query owns
      // attack selection; reading it cannot spend charges or advance timing.
      const judgment = { available: true, timing: 'perfect' };
      const normalRange = rhythm.getAuthoritativeDamageRadius?.({ nextSuccess: true }) ?? this.range;
      const plan = this.getAttackPlan(player, enemyManager, judgment, { nextSuccess: true });
      const result = plan.targets.map(enemy => ({
        kind: 'enemy', target: enemy, guarded: false,
        via: plan.links.find(link => link.target === enemy)?.via,
        boosted: BARCODE.signalAmpCharges > 0 && Math.hypot(player.position.x - enemy.position.x, player.position.y - enemy.position.y) > normalRange,
        bounds: enemy.getHitbox?.() || { x: enemy.position.x - 32, y: enemy.position.y - 74, width: 64, height: 142 }
      }));
      const env = BARCODE.JammerEnvironment;
      if (env?.canReceiveRhythmDamage?.()) {
        const status = env.getStatus();
        if (status?.position && Math.hypot(player.position.x - status.position.x, player.position.y - status.position.y) <= this.range) {
          const position = status.position;
          result.push({ kind: 'jammer', guarded: false, boosted: false,
            bounds: env.getAimBounds?.() || { x: position.x - 40, y: position.y - 80, width: 80, height: 80 } });
        }
      }
      const boss = window.sector1Progression?.getBossRhythmTarget?.(player, normalRange);
      if (boss?.inRange) result.push({ kind: 'boss', guarded: boss.guarded, boosted: false, bounds: boss.bounds });
      return result;
    }
    drawTargetPreview(ctx, player) {
      for (const target of this.getTargetPreview(player)) {
        const b = target.bounds;
        if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) continue;
        const x = b.x - 8, y = b.y - 8, w = b.width + 16, h = b.height + 16, corner = 10;
        if (BARCODE.combatFX && !BARCODE.combatFX.visible(x + w / 2, y + h / 2, h / 2 + w / 2)) continue;
        ctx.save(); ctx.strokeStyle = target.guarded ? '#ffc278' : target.boosted ? '#e6a1ff' : '#83ffe4'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [left, top, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
          ctx.moveTo(left + sx * corner, top); ctx.lineTo(left, top); ctx.lineTo(left, top + sy * corner);
        }
        ctx.stroke();
        if (target.kind === 'boss' || target.boosted || target.via === 'chain' || target.via === 'wave') {
          ctx.fillStyle = ctx.strokeStyle; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
          ctx.fillText(target.guarded ? 'GUARDED' : target.via === 'chain' ? 'LINK' : target.via === 'wave' ? 'WAVE' : target.boosted ? 'AMP +' : 'OPEN', x + w / 2, y - 7);
        }
        ctx.restore();
      }
    }
    tryDamageJammer(player, judgment, sequence) {
      const env = BARCODE.JammerEnvironment;
      if (!env || !env.canReceiveRhythmDamage || !env.applyRhythmDamage) return { ok: false };
      if (!judgment || !(judgment.timing === 'perfect' || judgment.timing === 'excellent')) return { ok: false };
      const status = env.getStatus();
      const position = status && status.position;
      if (!position || window.distance(player.position.x, player.position.y, position.x, position.y) > this.getAuthoritativeRange(judgment, { jammer: true })) return { ok: false };
      const damaged = env.applyRhythmDamage({ amount: 1, timing: judgment.timing, sequence });
      return damaged.ok ? { ok: true, target: { type: 'broadcast_jammer', damage: 1, x: position.x, y: position.y } } : { ok: false };
    }
    diagnostics() { return { cooldownMs: this.cooldownMs, range: this.range, sequence: this.sequence, lastAttackAt: this.lastAttackAt }; }
  }
  BARCODE.PlayerCombat = PlayerCombat;
  BARCODE.playerCombat = BARCODE.playerCombat || new PlayerCombat();
})();
