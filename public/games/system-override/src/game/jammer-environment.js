// Environmental Broadcast Jammer owner for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/jammer-environment.js',
  exports: ['BARCODE.JammerEnvironment'],
  dependencies: ['MakkoEngine', 'Player']
});

window.BARCODE = window.BARCODE || {};

(function(namespace) {
  'use strict';
  const JAMMER_TEXTURE = Object.freeze({"scale":0.4666666666666666,"anchorX":176,"anchorY":340,"footRows":[340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340,340],"originalFootRows":[213,213,213,213,213,213,213,213,213,217,213,217,213,213,213,213,213,217,217,213,213,213,213,215,217,213,213,213,213,213,213,215,214,213,213,213,217,217,213,217,217,213,213,213,217,217,217,213]});
  // The prepared 83 ms cels show a complete dish sweep and power cycle.
  // Machinery has a slower cadence than walking or attack animation.
  const JAMMER_PLAYBACK_RATE = 0.72;

  function presentationAnimated() {
    const preferences = namespace.Preferences?.values || {};
    return !preferences.reducedMotion && preferences.flashes !== false && window.BARCODE_RENDER_QUALITY?.flashes !== false;
  }

  function cloneStatus(state) {
    return Object.freeze({
      initialized: state.initialized,
      revealed: state.revealed,
      triggered: state.triggered,
      targetable: state.targetable,
      health: state.health,
      maxHealth: state.maxHealth,
      surge: state.surge ? Object.freeze({...state.surge}) : null,
      destroyed: state.destroyed,
      destructionNotified: state.destructionNotified,
      disposed: state.disposed,
      generation: state.generation,
      stage: getStage(),
      position: Object.freeze({ x: state.position.x, y: state.position.y }),
      hasSprite: !!state.sprite,
      spriteReady: !!state.spriteReady,
      spriteRequested: !!state.spriteRequested,
      spriteRequestCount: state.spriteRequestCount,
      hasAudio: !!state.audio,
      presentation: Object.freeze({ drawScale: state.presentation.drawScale, drawOffsetY: state.presentation.drawOffsetY })
    });
  }

  const state = {
    initialized: false,
    revealed: false,
    triggered: false,
    targetable: false,
    health: 16,
    maxHealth: 16,
    destroyed: false,
    destructionNotified: false,
    lastDamageSequence: null,
    disposed: false,
    generation: 0,
    position: { x: 1600, y: (window.Player?.GROUND_Y ?? 784) },
    presentation: Object.freeze({ drawScale: 0.7, drawOffsetY: 72 }),
    sprite: null,
    animationRef: null,
    spriteReady: false,
    spriteRequested: false,
    spriteRequestGeneration: -1,
    spriteRequestCount: 0,
    audio: null,
    signalTimeMs: 0,
    destructionEffectStarted: false,
    surge: null
  };

  function getStage() {
    if (state.destroyed) return { index: 4, label: 'SIGNAL RESTORED', color: '#00ffff' };
    const index = Math.min(3, Math.floor((state.maxHealth - state.health) / 4));
    return { index, label: ['SIGNAL BLOCKED', 'CARRIER CRACKING', 'INTERFERENCE FAILING', 'SIGNAL BREAKTHROUGH'][index],
      color: ['#ff00ff', '#c05dff', '#5b9dff', '#00ffff'][index] };
  }

  function pollSpriteReady() {
    if (state.disposed || !state.initialized) return;
    if (!window.MakkoEngine || !window.MakkoEngine.isLoaded || !window.MakkoEngine.isLoaded()) return;
    if (!state.spriteRequested) {
      state.spriteRequested = true;
      state.spriteRequestGeneration = state.generation;
      state.spriteRequestCount += 1;
      state.sprite = window.MakkoEngine.sprite('broadcast_jammer_broadcastjammer');
    }
    if (state.spriteRequestGeneration !== state.generation || state.disposed) return;
    if (!state.spriteReady && state.sprite && state.sprite.isLoaded && state.sprite.isLoaded()) {
      state.spriteReady = true;
      if (state.sprite.play) state.animationRef = state.sprite.play('broadcast_jammer_idle_idle', true);
    }
  }

  function initialize(options) {
    options = options || {};
    if (state.disposed) state.disposed = false;
    state.initialized = true;
    if (options.position) {
      state.position = { x: Number(options.position.x) || state.position.x, y: Number(options.position.y) || state.position.y };
    }
    pollSpriteReady();
    return cloneStatus(state);
  }

  function reveal(options) {
    initialize(options);
    state.revealed = true;
    state.targetable = true;
    state.destroyed = false;
    state.health = state.maxHealth;
    return cloneStatus(state);
  }

  function trigger(options) {
    reveal(options);
    state.triggered = true;
    return cloneStatus(state);
  }

  function invalidatePresentation() {
    state.sprite = null;
    state.animationRef = null;
    state.spriteReady = false;
    state.spriteRequested = false;
    state.spriteRequestGeneration = -1;
    if (state.audio && typeof state.audio.pause === 'function') state.audio.pause();
    state.audio = null;
  }

  function reset() {
    state.generation += 1;
    state.position = { x: 1600, y: (window.Player?.GROUND_Y ?? 784) };
    state.revealed = false;
    state.triggered = false;
    state.targetable = false;
    state.health = state.maxHealth;
    state.destroyed = false;
    state.destructionNotified = false;
    state.lastDamageSequence = null;
    state.destructionEffectStarted = false;
    state.signalTimeMs = 0;
    state.surge = null;
    state.disposed = false;
    invalidatePresentation();
    return cloneStatus(state);
  }

  function dispose() {
    if (state.disposed && !state.initialized && !state.revealed && !state.triggered && !state.spriteRequested) return cloneStatus(state);
    reset();
    state.disposed = true;
    state.initialized = false;
    return cloneStatus(state);
  }

  function update(deltaTime) {
    if (!state.revealed || state.disposed || window.isPaused || window.gameState?.paused || window.gameState?.gameOver) return cloneStatus(state);
    pollSpriteReady();
    state.signalTimeMs += Math.max(0, Number(deltaTime) || 0);
    const surge=state.surge;
    if(surge && !window.isPaused && !window.gameState?.paused && !window.gameState?.gameOver) {
      surge.elapsed+=namespace.TacticalFocusClock?.scaleDelta?.(deltaTime) ?? deltaTime;
      if(surge.elapsed>=surge.warningMs && !surge.hit) {
        const body=window.player?.getHitbox?.();
        if(body && body.x+body.width>surge.x-surge.width/2 && body.x<surge.x+surge.width/2 &&
          body.y+body.height>surge.groundY-270 && body.y<surge.groundY+8) {
          surge.hit=true;
          if(!window.hackingSystem?.absorbGuardHit?.())window.player?.takeDamage?.(1,{x:surge.x,y:surge.groundY});
        }
      }
      if(surge.elapsed>=surge.warningMs+420)state.surge=null;
    }
    if (presentationAnimated() && state.spriteReady && state.sprite && typeof state.sprite.update === 'function') {
      const playbackDelta = Math.max(0, Number(deltaTime) || 0) * JAMMER_PLAYBACK_RATE;
      if (namespace.SpritePlayback) namespace.SpritePlayback.update(state.sprite, playbackDelta);
      else state.sprite.update(playbackDelta);
    }
    return cloneStatus(state);
  }

  function canReceiveRhythmDamage() { return state.initialized && state.revealed && state.targetable && !state.destroyed && !state.disposed && !state.surge; }

  function applyRhythmDamage(options) {
    options = options || {};
    if (!canReceiveRhythmDamage()) return { ok: false, reason: 'not-targetable', status: cloneStatus(state) };
    if (options.sequence !== undefined && state.lastDamageSequence === options.sequence) return { ok: false, reason: 'duplicate-sequence', status: cloneStatus(state) };
    if (!(options.timing === 'perfect' || options.timing === 'excellent')) return { ok: false, reason: 'bad-timing', status: cloneStatus(state) };
    state.lastDamageSequence = options.sequence;
    const previousStage = getStage().index;
    state.health = Math.max(0, state.health - 1);
    if (state.health > 0 && getStage().index !== previousStage) {
      window.particleSystem?.impact?.(state.position.x, state.position.y + 65, getStage().color, 14);
      const difficulty=namespace.LevelDifficulty?.choice?.id || 'standard';
      const groundY=(window.player?.getHitbox?.().y ?? state.position.y)+ (window.player?.getHitbox?.().height || 72);
      state.surge={x:window.player?.position?.x ?? state.position.x,groundY,
        width:difficulty==='relaxed'?200:difficulty==='overclocked'?280:240,
        elapsed:0,warningMs:difficulty==='relaxed'?1700:difficulty==='overclocked'?1050:1400,hit:false};
      window.audioSystem?.playCombatCue?.('warning');
      const guards=(window.enemyManager?.enemies||[]).filter(e=>e.active&&e.escort?.owner==='jammer');
      if(guards.length<(difficulty==='relaxed'?1:2))window.sector1Progression?.spawnSupportDrone?.('jammer',getStage().index%2?1:-1);
    }
    if (state.health === 0 && !state.destroyed) {
      state.destroyed = true;
      state.targetable = false;
      state.revealed = false;
      if (!state.destructionEffectStarted && window.particleSystem) {
        state.destructionEffectStarted = true;
        if (typeof window.particleSystem.impact === 'function') window.particleSystem.impact(state.position.x, state.position.y, '#ff00ff', 40);
        if (typeof window.particleSystem.spawnEffect === 'function') window.particleSystem.spawnEffect(state.position.x, state.position.y);
      }
      if (!state.destructionNotified) {
        state.destructionNotified = true;
        if (window.sector1Progression && typeof window.sector1Progression.onJammerDestroyed === 'function') window.sector1Progression.onJammerDestroyed();
      }
    }
    return { ok: true, damage: 1, destroyed: state.destroyed, status: cloneStatus(state) };
  }

  function draw(ctx) {
    if (!ctx || state.destroyed || !state.revealed || state.disposed) return;
    ctx.save();
    const stage = getStage();
    if(state.surge) {
      const s=state.surge,active=s.elapsed>=s.warningMs;
      if(namespace.Level1SignalArt)namespace.Level1SignalArt.drawThreat(ctx,{
        x:s.x-s.width/2,y:s.groundY-270,width:s.width,height:278,
        elapsedMs:s.elapsed,warningMs:s.warningMs,active,reduced:!presentationAnimated()});
      else {
        // The precise outline remains legible in partial host-module loads.
        ctx.strokeStyle='#ffc478';ctx.lineWidth=2;
        ctx.strokeRect(s.x-s.width/2,s.groundY-270,s.width,278);
      }
      ctx.fillStyle='#ffc478';ctx.font='bold 16px Oxanium, monospace';ctx.textAlign='center';ctx.textBaseline='alphabetic';
      ctx.fillText(active?'SIGNAL DISCHARGE':'SURGE — LEAVE THE MARKED AREA',s.x,s.groundY-286);
      ctx.fillRect(s.x-s.width/2,s.groundY+12,s.width*Math.min(1,s.elapsed/s.warningMs),6);
    }
    // Draw every authored cel from the actual Makko owner. Prepared foot rows
    // replace the old unscaled offsets, so the base stays on the sidewalk as
    // the dish, screens and electrical arcs move.
    const footY = state.position.y + state.presentation.drawOffsetY;
    let painted = false;
    if (state.spriteReady && state.animationRef && state.sprite && typeof state.sprite.draw === 'function' && typeof window.Player?.prototype?.getMakkoRenderMetrics === 'function') {
      const frame = Math.max(0, Math.trunc(state.animationRef?.currentFrame || 0)) % JAMMER_TEXTURE.footRows.length;
      const metrics = window.Player.prototype.getMakkoRenderMetrics.call({ sprite: state.sprite }, JAMMER_TEXTURE, false);
      const targetFootY = state.position.y + state.presentation.drawOffsetY;
      const drawY = targetFootY + metrics.anchorOffsetY - JAMMER_TEXTURE.footRows[frame] * metrics.frameScale;
      const drawX = state.position.x + metrics.anchorOffsetX - JAMMER_TEXTURE.anchorX * metrics.frameScale;
      state.sprite.draw(ctx, drawX, drawY, { scale: JAMMER_TEXTURE.scale, flipH: false });
      painted = true;
    } else {
      // Bounded bundled delivery can paint the same full clip if Makko is
      // unavailable. It samples the existing owner clock and allocates none.
      const frame = presentationAnimated() ? Math.floor(state.signalTimeMs * JAMMER_PLAYBACK_RATE / 83) % JAMMER_TEXTURE.footRows.length : 0;
      painted = !!namespace.PresentationAssets?.draw('steadyJammer', ctx, {
        x: state.position.x, y: footY, width: 352 * JAMMER_TEXTURE.scale, frame
      });
    }
    if (!painted) {
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 3;
      const fallbackY = state.position.y + state.presentation.drawOffsetY;
      const fallbackWidth = 90 * state.presentation.drawScale;
      const fallbackHeight = 120 * state.presentation.drawScale;
      ctx.strokeRect(state.position.x - fallbackWidth / 2, fallbackY - fallbackHeight, fallbackWidth, fallbackHeight);
      ctx.fillStyle = '#ff00ff';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BROADCAST JAMMER', state.position.x, fallbackY - fallbackHeight - 10);
    }
    // Transmission breathes on a 2.6 s cycle; the two travelling arcs have a
    // separate 2.1 s period. Only these local accents move, never the collider.
    const animated = presentationAnimated();
    const pulse = animated ? 0.5 + 0.5 * Math.sin(state.signalTimeMs * Math.PI * 2 / 2600) : 0.5;
    ctx.save(); ctx.globalAlpha *= 0.18 + pulse * 0.20;
    ctx.fillStyle = stage.color;
    ctx.fillRect(state.position.x - 37, footY - 64, 42, 15);
    ctx.strokeStyle = stage.color; ctx.lineWidth = 2;
    for (let ring = 0; ring < 2; ring++) {
      const phase = animated ? ((state.signalTimeMs / 2100 + ring / 2) % 1) : 0.3 + ring * 0.35;
      ctx.globalAlpha = animated ? (1 - phase) * 0.48 : 0.22;
      ctx.beginPath(); ctx.arc(state.position.x - 22, footY - 137, 10 + phase * 31, -2.7, -0.7); ctx.stroke();
    }
    ctx.restore();
    if (state.targetable) {
      const barW = 140; const barH = 12; const hp = state.health / state.maxHealth; const barY = footY - 174;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(state.position.x - barW / 2, barY, barW, barH);
      ctx.fillStyle = stage.color; ctx.fillRect(state.position.x - barW / 2, barY, barW * hp, barH);
      ctx.strokeStyle = '#00ffff'; ctx.strokeRect(state.position.x - barW / 2, barY, barW, barH);
      ctx.fillStyle = '#ffffff'; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText(`${state.health}/${state.maxHealth}`, state.position.x, barY - 4);
      // Four relay segments light as interference breaks, without resizing or
      // moving the sprite or interrupting the independent music transport.
      for (let segment = 0; segment < 4; segment++) {
        ctx.fillStyle = segment < stage.index ? '#00ffff' : '#263245';
        ctx.fillRect(state.position.x - barW / 2 + segment * 36, barY + 18, 30, 5);
      }
      ctx.fillStyle = stage.color;
      ctx.font = 'bold 14px monospace';
      ctx.fillText(state.surge?'SHIELDED / DISCHARGING':stage.label, state.position.x, barY - 46);
      ctx.fillStyle = '#c4f8ff';
      ctx.font = '12px monospace';
      ctx.fillText(state.surge?`${namespace.ControllerSettings?.prompt('rhythm_mode','R') || 'R'} / CANCEL: EXIT RHYTHM AND MOVE`:
        window.BARCODE?.ControllerSettings?.prompt ? `${window.BARCODE.ControllerSettings.prompt('primary', 'DOWN')} ON BEAT IN RHYTHM MODE` : 'R + DOWN ON BEAT', state.position.x, barY - 24);
    }
    ctx.restore();
  }

  function getStatus() { return cloneStatus(state); }
  function getDiagnostics() { return cloneStatus(state); }
  function getPosition() { return state.revealed && !state.disposed ? { x: state.position.x, y: state.position.y } : null; }
  function getAimBounds() {
    if (!state.revealed || state.destroyed || state.disposed) return null;
    const scale = state.presentation.drawScale;
    const anchorY = state.position.y + state.presentation.drawOffsetY;
    return {
      x: state.position.x - 128 * scale,
      y: anchorY - 214 * scale,
      width: 256 * scale,
      height: 219 * scale
    };
  }

  namespace.JammerEnvironment = Object.freeze({ initialize, reveal, trigger, reset, dispose, update, draw, canReceiveRhythmDamage, applyRhythmDamage, getStatus, getDiagnostics, getPosition, getAimBounds });
})(window.BARCODE);
