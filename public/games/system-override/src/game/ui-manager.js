// UI management for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/ui-manager.js',
  exports: ['drawGameUI'],
  dependencies: ['renderer', 'gameState', 'player', 'sector1Progression', 'lostDataSystem', 'hackingSystem', 'rhythmSystem', 'objectivesSystem', 'loreSystem', 'jammerIndicator', 'tutorialSystem']
});

// Boss-intro presentation is intentionally derived from the progression owner's
// public state. UI visibility is never stored here, so objectives and diagnostics
// return automatically on the first frame after the camera-return phase ends.
const BOSS_CINEMATIC_PRESENTATION_STATES = new Set([
  'jammer_destroyed_freeze',
  'enemy_purge',
  'camera_pan',
  'boss_walk_in',
  'boss_close_up',
  'boss_flourish',
  'boss_hold',
  'camera_return',
  'boss_camera_return'
]);

const isBossCinematicPresentationActive = () => {
  const progression = window.sector1Progression;
  if (!progression) return false;

  if (typeof progression.isBossCinematicActive === 'function') {
    return progression.isBossCinematicActive();
  }
  if (typeof progression.isBossIntroCinematicActive === 'function') {
    return progression.isBossIntroCinematicActive();
  }

  const state = String(progression.state || '');
  if (BOSS_CINEMATIC_PRESENTATION_STATES.has(state)) return true;

  // Keep compatibility with a named return phase supplied by the progression
  // owner without coupling the UI to its exact implementation spelling.
  return progression.jammerDestroyedNotified === true &&
    /(?:camera.*return|return.*camera|cinematic.*return)/.test(state);
};

const encounterPresentation = (() => {
  const presentation = {
    owner: null,
    lastState: '',
    lastActiveEncounterId: null,
    clearedEncounterIds: new Set(),
    cue: null
  };

  const now = () => Number.isFinite(window.gameState?.gameTime)
    ? window.gameState.gameTime
    : (window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now());

  const definitions = () => Array.isArray(window.Sector1Progression?.ENCOUNTERS)
    ? window.Sector1Progression.ENCOUNTERS
    : [];

  const definitionFor = id => definitions().find(encounter => encounter.id === id) || null;

  const waveNumberFor = id => {
    const index = definitions().findIndex(encounter => encounter.id === id);
    return index >= 0 ? index + 1 : null;
  };

  const reset = owner => {
    presentation._overlayPanels = {};
    presentation.owner = owner || null;
    presentation.lastState = owner?.state || '';
    presentation.lastActiveEncounterId = null;
    presentation.clearedEncounterIds.clear();
    presentation.cue = null;
  };

  const beginCue = (kind, encounterId) => {
    const definition = definitionFor(encounterId);
    const wave = waveNumberFor(encounterId);
    if (!definition || !wave) return;
    presentation.cue = {
      kind,
      label: definition.label,
      wave,
      total: definitions().length,
      startedAt: now(),
      duration: kind === 'start' ? 1600 : 850
    };
  };

  const update = owner => {
    if (owner !== presentation.owner) reset(owner);
    if (!owner || !owner.missionStarted || owner.state === 'tutorial') {
      if (presentation.lastActiveEncounterId || presentation.cue) reset(owner);
      return;
    }

    const currentState = String(owner.state || '');
    const previousState = presentation.lastState;
    const activeEncounterId = /^encounter_\d+$/.test(String(owner.activeEncounterId || ''))
      ? owner.activeEncounterId
      : null;

    if (previousState && previousState !== currentState &&
        presentation.lastActiveEncounterId === previousState &&
        !presentation.clearedEncounterIds.has(previousState)) {
      presentation.clearedEncounterIds.add(previousState);
      beginCue('clear', previousState);
    }

    if (activeEncounterId && activeEncounterId !== presentation.lastActiveEncounterId) {
      presentation.lastActiveEncounterId = activeEncounterId;
      beginCue('start', activeEncounterId);
    }

    presentation.lastState = currentState;
  };

  const cueAlpha = (elapsed, duration) => {
    const fadeIn = Math.min(1, elapsed / 160);
    const fadeOut = Math.min(1, Math.max(0, duration - elapsed) / 260);
    return Math.max(0, Math.min(fadeIn, fadeOut));
  };

  const drawStartCue = (ctx, cue, elapsed, alpha) => {
    const easedY = 278 - Math.max(0, 1 - elapsed / 260) * 10;
    const width = 500;
    const height = 62;
    const x = (1920 - width) / 2;
    const layout=window.BARCODE.OverlayLayout.present(presentation,'wave',[{width,height}],{preferred:{x,y:easedY,width,height,scale:1}});
    ctx.globalAlpha=alpha;window.BARCODE.OverlayLayout.begin(ctx,layout);
    if(layout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,layout,`WAVE ${cue.wave} / ${cue.total}`,cue.label);return;}
    ctx.translate(layout.x-x,layout.y-easedY);
    ctx.fillStyle = 'rgba(0, 12, 28, 0.88)';
    ctx.fillRect(x, easedY, width, height);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, easedY, width, height);

    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`WAVE ${cue.wave} / ${cue.total}`, 960, easedY + 9);

    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 22px 'Orbitron', monospace";
    ctx.fillText(String(cue.label || '').toUpperCase(), 960, easedY + 29);
  };

  const drawClearCue = (ctx, cue, elapsed, alpha) => {
    const progress = Math.max(0, Math.min(1, elapsed / cue.duration));
    const halfLine = 90 + 180 * Math.sin(Math.PI * progress);
    const y = 290;
    const layout=window.BARCODE.OverlayLayout.present(presentation,'clear',[{width:600,height:50}],{preferred:{x:660,y,width:600,height:50,scale:1}});
    window.BARCODE.OverlayLayout.begin(ctx,layout);
    if(layout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,layout,'WAVE CLEARED',cue.label);return;}
    ctx.translate(layout.x-660,layout.y-y);

    ctx.globalAlpha = alpha * 0.78 * layout.alpha;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(960 - halfLine, y + 28);
    ctx.lineTo(960 + halfLine, y + 28);
    ctx.stroke();

    ctx.globalAlpha = alpha * layout.alpha;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#bfffff';
    ctx.font = "bold 18px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${String(cue.label || '').toUpperCase()} CLEARED`, 960, y);
  };

  const draw = ctx => {
    const cue = presentation.cue;
    if (!ctx || !cue) return;
    if(window.tutorialSystem?.isActive?.()||window.BARCODE?.stageFX?.message||window.loreSystem?.currentLore)return;
    const elapsed = now() - cue.startedAt;
    if (elapsed >= cue.duration) {
      return;
    }

    const alpha = cueAlpha(elapsed, cue.duration);
    ctx.save();
    if (cue.kind === 'clear') drawClearCue(ctx, cue, elapsed, alpha);
    else drawStartCue(ctx, cue, elapsed, alpha);
    ctx.restore();
  };

  return { update, draw };
})();
window.BARCODE = window.BARCODE || {};
window.BARCODE.encounterPresentation = encounterPresentation;

// Main UI drawing function
window.drawGameUI = function(ctx) {
  // CRITICAL: Reset text alignment to default at start of drawUI
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  // Check if tutorial is complete - only show objectives after tutorial
  let tutorialCompleted = false;
  
  if (!window.tutorialSystem) {
    tutorialCompleted = true;
  } else if (typeof window.tutorialSystem.isCompleted === 'function' && window.tutorialSystem.isCompleted()) {
    tutorialCompleted = true;
  } else if (window.tutorialSystem.completed && !window.tutorialSystem.active) {
    tutorialCompleted = true;
  }

  const bossCinematicActive = isBossCinematicPresentationActive();

  
  // Draw health and basic UI elements
  drawBasicUI(ctx);
  const hp = window.BARCODE.ComicHUD.health;
  window.BARCODE?.combatFX?.drawDamageHUD(ctx, window.player, hp.x, hp.y, hp.width, hp.height);
  window.BARCODE?.combatFX?.drawAmpHUD(ctx);
  if (!bossCinematicActive && !window.gameState.gameOver && !window.gameState.victory && !window.BARCODE?.stageFX?.ratEvent && !window.tutorialSystem?.isActive?.()) window.BARCODE.ComicHUD.hack(ctx, window.hackingSystem?.getReadyPopup?.());
  
  // Draw objectives after tutorial completion
  if (tutorialCompleted && !bossCinematicActive && !['boss_ready', 'boss_combat', 'level_complete'].includes(window.sector1Progression?.state)) {
    drawObjectives(ctx);
  }
  
  // Draw hacking interface
  if (!bossCinematicActive && !window.gameState.gameOver && !window.gameState.victory && window.hackingSystem && (window.hackingSystem.isActive?.() || window.hackingSystem.feedback || window.hackingSystem.resultFx)) {
    window.hackingSystem.draw(ctx);
  }
  
  // Draw rhythm UI elements
  if (!window.hackingSystem?.isActive?.()) drawRhythmUI(ctx);
  
  // Draw collection message
  if (window.gameState.collectionMessage && window.gameState.collectionMessage.timer > 0) {
    drawCollectionMessage(ctx);
  }

  if (!bossCinematicActive) {
    if (!window.hackingSystem?.isActive?.()) encounterPresentation.draw(ctx);
  }
  
  drawSector1BossUI(ctx);
  window.sector1Progression?.drawLiftPrompt?.(ctx);
  const attackFeedback = window.BARCODE?.playerCombat?.getFeedback?.();
  if (attackFeedback && !bossCinematicActive && !window.gameState.gameOver && !window.gameState.victory && !window.hackingSystem?.isActive?.()) {
    ctx.save();
    const layout=window.BARCODE.OverlayLayout.present(window.gameState,'attack',[{width:700,height:36}],{preferred:{x:738,y:225,width:700,height:36,scale:1}});
    window.BARCODE.OverlayLayout.begin(ctx,layout);
    if(!layout.docked){
    ctx.translate(layout.x-738,layout.y-185);
    ctx.fillStyle = 'rgba(0, 8, 16, 0.92)';
    ctx.fillRect(738, 185, 700, 36);
    ctx.fillStyle = attackFeedback.color;
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(attackFeedback.text, 1088, 204, 672);
    }
    ctx.restore();
  }

  window.BARCODE?.combatFX?.drawFragmentFlights(ctx);
  window.BARCODE?.stageFX?.drawHUD(ctx);

  // Draw game over screen
  if (window.gameState.gameOver) {
    drawGameOver(ctx);
  }
  
  // Draw pause screen
  if (window.gameState.paused) {
    drawPauseScreen(ctx);
  }
  
  // Draw lore messages
  drawLoreMessages(ctx);
  
  // Draw jammer indicator
  if (!bossCinematicActive && !window.hackingSystem?.isActive?.() && window.jammerIndicator && typeof window.jammerIndicator.draw === 'function') {
    try {
      window.jammerIndicator.draw(ctx);
    } catch (error) {
      console.error('Error drawing jammer indicator:', error?.message || error);
    }
  }

  // Session-only Makko diagnostics. This stays in the UI pass so the overlay uses
  // the same world-to-screen projection without changing gameplay rendering.
  if (!bossCinematicActive && window.DEBUG?.level1?.drawOverlay) {
    try {
      window.DEBUG.level1.drawOverlay(ctx);
    } catch (error) {
      console.error('Error drawing Level 1 debug overlay:', error?.message || error);
    }
  }
  
  // Draw hack timeout message
  drawHackTimeoutMessage(ctx);
};

// Screen-space boss readability and terminal outcome use the existing UI pass.
function drawSector1BossUI(ctx) {
  const owner = window.sector1Progression;
  const status = owner?.getBossStatus?.();
  if (!status || !['boss_ready', 'boss_combat', 'level_complete'].includes(owner.state)) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (window.gameState.victory) {
    if (window.BARCODE?.Campaign?.intermission) { window.BARCODE.Campaign.drawIntermission(ctx); ctx.restore(); return; }
    const reveal = owner.getCompletionReveal?.() || 0;
    if (reveal === 0) { ctx.restore(); return; }
    ctx.globalAlpha = reveal;
    ctx.fillStyle = 'rgba(0, 8, 16, 0.94)';
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(390, 265, 1140, 620);
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('SECTOR 1 COMPLETE', 960, 365);
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px monospace';
    ctx.fillText('DEAD AIR DISTRICT', 960, 425);
    ctx.font = '22px monospace';
    ctx.fillText('20 mission enemies. Jammer destroyed. Boss defeated.', 960, 475);
    const rows = owner.getCompletionPresentation?.() || [];
    rows.forEach((row, index) => {
      const x = 465 + index * 340;
      ctx.fillStyle = '#112a3b'; ctx.fillRect(x, 525, 310, 132);
      ctx.fillStyle = '#c6a0ff'; ctx.font = '20px monospace';
      ctx.fillText(['SCORE', 'BEST COMBO', 'LOST DATA'][index], x + 155, 552);
      ctx.fillStyle = '#a0ffe4'; ctx.font = 'bold 38px monospace';
      ctx.fillText(row.total === null ? String(row.value) : `${row.value} / ${row.total}`, x + 155, 601);
      ctx.fillRect(x, 653, 310 * row.progress, 4);
    });
    ctx.fillStyle = '#b9faff';
    const result = window.BARCODE?.Campaign?.result;
    if (result) {
      const seconds = Math.floor(result.elapsedMs / 1000), minutes = Math.floor(seconds / 60);
      const accuracy = result.attempts ? `${Math.round(100 * result.accurate / result.attempts)}%` : '—';
      ctx.font = '20px Oxanium, monospace';
      ctx.fillText(`TIME ${minutes}:${String(seconds % 60).padStart(2, '0')}  ·  ACCURACY ${accuracy}  ·  DAMAGE ${result.damageTaken}  ·  RETRIES ${result.retries}`, 960, 687);
    }
    ctx.font = '22px monospace';
    if (owner.areCompletionControlsReady?.() !== false) {
      ctx.fillText(window.BARCODE?.GamepadUI?.connected ? `${window.BARCODE.ControllerSettings.button(2)} — Restart Level 1` : 'SPACE — Restart Level 1', 960, 718);
      ctx.fillText(window.BARCODE?.GamepadUI?.connected ? `${window.BARCODE.ControllerSettings.button(0)} — Rematch the boss` : 'ENTER — Rematch the boss', 960, 766);
      if (window.BARCODE?.Campaign?.result) ctx.fillText(window.BARCODE?.GamepadUI?.connected ? `${window.BARCODE.ControllerSettings.button(3)} — Continue broadcast` : 'C — Continue broadcast', 960, 820);
    } else if (rows.length && rows.every(row => row.progress === 1)) {
      ctx.fillText('Release buttons to continue', 960, 742);
    }
    if ((window.BARCODE?.IntroSequence?.inspectedGutter || window.BARCODE?.stageFX?.archive()?.hasEgg('egg.l01.studio-rat'))) {
      ctx.font = '18px monospace'; ctx.fillStyle = '#cbaaff';
      ctx.fillText('STUDIO RATS: Carrier restored. We are keeping the caption.', 960, 945);
    }
  } else if (!window.gameState.gameOver) {
    window.BARCODE.ComicHUD.boss(ctx, status);
  }
  ctx.restore();
}

// A stable top band: player / current objective / score and Amp.
function drawBasicUI(ctx) {
  window.BARCODE.ComicHUD.basic(ctx, { player: window.player, rhythm: window.rhythmSystem,
    pad: window.BARCODE?.GamepadUI?.connected, progress: window.lostDataSystem?.getProgress?.(),
    score: window.gameState.score, training: window.tutorialSystem?.isActive?.() });
}

function drawObjectives(ctx) {
  const hack = window.hackingSystem;
  if (hack?.isActive?.() || hack?.feedback || hack?.resultFx || window.BARCODE?.stageFX?.ratEvent ||
      window.BARCODE?.stageFX?.message || window.loreSystem?.currentLore) return;
  const owner = window.sector1Progression, status = owner?.getEncounterStatus?.();
  const jammer = window.BARCODE?.JammerEnvironment?.getStatus?.();
  const title = status ? `${status.started ? 'CLEAR' : 'REACH'} ${String(status.label).toUpperCase()}` : jammer?.revealed && !jammer.destroyed ? 'BREAK THE BROADCAST JAMMER' : 'EXPLORE THE DISTRICT';
  const detail = status ? status.started ? `${status.defeated}/${status.required} CLEARED${status.straggler ? ' · ' + status.straggler : ''}` : 'Street and rooftop routes' : jammer?.revealed && !jammer.destroyed ? jammer.surge ? 'SHIELDED · EXIT RHYTHM AND EVADE THE SURGE' : `${jammer.health}/16 LOCKS · FOUR HITS, THEN MOVE` : '';
  const kick = window.BARCODE?.stageFX?.captionKick || 0;
  ctx.save();
  window.BARCODE.ComicHUD.objectives(ctx, { title, detail, kick });
  ctx.restore();
}

// Draw rhythm UI elements
function drawRhythmUI(ctx) {
  if (!window.rhythmSystem?.isActive?.()) return;
  ctx.save();
  window.rhythmSystem.drawCompactHUD?.(ctx);
  ctx.restore();
}

// Draw collection message
function drawCollectionMessage(ctx) {
  const message = window.gameState.collectionMessage;
  if (!message || message.timer <= 0) return;
  if(window.tutorialSystem?.isActive?.()||window.hackingSystem?.isActive?.()||window.BARCODE?.stageFX?.message||window.loreSystem?.currentLore)return;
  
  ctx.save();
  
  let alpha = 1.0;
  if (message.timer < 60) {
    alpha = message.timer / 60;
  }
  
  let scale = 1.0;
  if (message.timer > 150) {
    scale = 1.0 + Math.sin((180 - message.timer) * 0.3) * 0.1;
  }
  
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${Math.floor(36 * scale)}px 'Orbitron', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const padding = 30;
  const textMetrics = ctx.measureText(message.text);
  const boxWidth = textMetrics.width + padding * 2;
  const boxHeight = 60;
  const boxX = (1920 - boxWidth) / 2;
  const boxY = 350;
  const layout=window.BARCODE.OverlayLayout.present(window.gameState,'notice',[{width:boxWidth,height:boxHeight}],{preferred:{x:boxX,y:boxY,width:boxWidth,height:boxHeight,scale:1}});
  window.BARCODE.OverlayLayout.begin(ctx,layout);
  if(layout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,layout,message.text,'');ctx.restore();return;}
  ctx.translate(layout.x-boxX,layout.y-boxY);
  
  ctx.fillStyle = 'rgba(0, 20, 40, 0.9)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(message.text, 960, boxY + boxHeight / 2);
  
  ctx.restore();
}

// Draw game over screen
function drawGameOver(ctx) {
  function drawGlowText(text, x, y, options = {}) {
    const size = options.size || 20;
    const color = options.color || '#ffffff';
    const align = options.align || 'center';
    
    ctx.save();
    ctx.font = `${size}px monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    
    ctx.restore();
  }
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, 1920, 1080);
  
  if (window.renderer && typeof window.renderer.drawGlowText === 'function') {
    try {
      window.renderer.drawGlowText('SYSTEM BREACH DETECTED', 960, 400, {
        size: 48,
        color: '#ff0000'
      });
    } catch (error) {
      drawGlowText('SYSTEM BREACH DETECTED', 960, 400, {
        size: 48,
        color: '#ff0000'
      });
    }
  } else {
    drawGlowText('SYSTEM BREACH DETECTED', 960, 400, {
      size: 48,
      color: '#ff0000'
    });
  }
  
  if (window.renderer && typeof window.renderer.drawGlowText === 'function') {
    try {
      window.renderer.drawGlowText('FINAL SCORE', 960, 500, {
        size: 32,
        color: '#ff00ff'
      });
    } catch (error) {
      drawGlowText('FINAL SCORE', 960, 500, {
        size: 32,
        color: '#ff00ff'
      });
    }
  } else {
    drawGlowText('FINAL SCORE', 960, 500, {
      size: 32,
      color: '#ff00ff'
    });
  }
  
  if (window.renderer && typeof window.renderer.drawGlowText === 'function') {
    try {
      window.renderer.drawGlowText(window.gameState.score.toString(), 960, 550, {
        size: 48,
        color: '#00ffff'
      });
    } catch (error) {
      drawGlowText(window.gameState.score.toString(), 960, 550, {
        size: 48,
        color: '#00ffff'
      });
    }
  } else {
    drawGlowText(window.gameState.score.toString(), 960, 550, {
      size: 48,
      color: '#00ffff'
    });
  }
  
  if (window.renderer && typeof window.renderer.drawGlowText === 'function') {
    try {
      window.renderer.drawGlowText((window.BARCODE?.Campaign?.canRetryObjective?.() ? `${window.BARCODE?.GamepadUI?.connected ? window.BARCODE.ControllerSettings?.button(0) || 'A' : 'SPACE'}: ${window.BARCODE.Campaign.retryLabel()}  |  ${window.BARCODE?.GamepadUI?.connected ? window.BARCODE.ControllerSettings?.button(2) || 'X' : 'SHIFT+SPACE'}: New run` : window.BARCODE?.GamepadUI?.connected ? (window.sector1Progression?.canRetryBossCheckpoint?.() ? `${window.BARCODE.ControllerSettings?.button(0) || 'A'}: Retry boss  |  ${window.BARCODE.ControllerSettings?.button(2) || 'X'}: Restart Level 1` : `${window.BARCODE.ControllerSettings?.button(0) || 'A'} / ${window.BARCODE.ControllerSettings?.button(2) || 'X'}: Restart Level 1`) : window.sector1Progression?.canRetryBossCheckpoint?.() ? 'SPACE: Retry boss  |  SHIFT+SPACE: Restart Level 1' : 'Press SPACE to restart'), 960, 700, {
        size: 24,
        color: '#ffffff'
      });
    } catch (error) {
      drawGlowText((window.BARCODE?.Campaign?.canRetryObjective?.() ? `${window.BARCODE?.GamepadUI?.connected ? window.BARCODE.ControllerSettings?.button(0) || 'A' : 'SPACE'}: ${window.BARCODE.Campaign.retryLabel()}  |  ${window.BARCODE?.GamepadUI?.connected ? window.BARCODE.ControllerSettings?.button(2) || 'X' : 'SHIFT+SPACE'}: New run` : window.BARCODE?.GamepadUI?.connected ? (window.sector1Progression?.canRetryBossCheckpoint?.() ? `${window.BARCODE.ControllerSettings?.button(0) || 'A'}: Retry boss  |  ${window.BARCODE.ControllerSettings?.button(2) || 'X'}: Restart Level 1` : `${window.BARCODE.ControllerSettings?.button(0) || 'A'} / ${window.BARCODE.ControllerSettings?.button(2) || 'X'}: Restart Level 1`) : window.sector1Progression?.canRetryBossCheckpoint?.() ? 'SPACE: Retry boss  |  SHIFT+SPACE: Restart Level 1' : 'Press SPACE to restart'), 960, 700, {
        size: 24,
        color: '#ffffff'
      });
    }
  } else {
    drawGlowText((window.BARCODE?.Campaign?.canRetryObjective?.() ? `${window.BARCODE?.GamepadUI?.connected ? window.BARCODE.ControllerSettings?.button(0) || 'A' : 'SPACE'}: ${window.BARCODE.Campaign.retryLabel()}  |  ${window.BARCODE?.GamepadUI?.connected ? window.BARCODE.ControllerSettings?.button(2) || 'X' : 'SHIFT+SPACE'}: New run` : window.BARCODE?.GamepadUI?.connected ? (window.sector1Progression?.canRetryBossCheckpoint?.() ? `${window.BARCODE.ControllerSettings?.button(0) || 'A'}: Retry boss  |  ${window.BARCODE.ControllerSettings?.button(2) || 'X'}: Restart Level 1` : `${window.BARCODE.ControllerSettings?.button(0) || 'A'} / ${window.BARCODE.ControllerSettings?.button(2) || 'X'}: Restart Level 1`) : window.sector1Progression?.canRetryBossCheckpoint?.() ? 'SPACE: Retry boss  |  SHIFT+SPACE: Restart Level 1' : 'Press SPACE to restart'), 960, 700, {
      size: 24,
      color: '#ffffff'
    });
  }
  

}

// Draw pause screen
function drawPauseScreen(ctx) {
  if (window.BARCODE?.PauseMenu) { window.BARCODE.PauseMenu.draw(ctx); return; }
  function drawGlowText(text, x, y, options = {}) {
    const size = options.size || 20;
    const color = options.color || '#ffffff';
    const align = options.align || 'center';
    
    ctx.save();
    ctx.font = `${size}px monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    
    ctx.restore();
  }
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, 1920, 1080);
  
  if (window.renderer && typeof window.renderer.drawGlowText === 'function') {
    try {
      window.renderer.drawGlowText('PAUSED', 960, 540, {
        size: 48,
        color: '#ffff00'
      });
    } catch (error) {
      drawGlowText('PAUSED', 960, 540, {
        size: 48,
        color: '#ffff00'
      });
    }
  } else {
    drawGlowText('PAUSED', 960, 540, {
      size: 48,
      color: '#ffff00'
    });
  }
}

// Draw lore messages
function drawLoreMessages(ctx) {
  // Draw lore messages at bottom of screen
  if (window.loreSystem && typeof window.loreSystem.draw === 'function') {
    try {
      window.loreSystem.draw(ctx);
    } catch (error) {
      console.error('Error drawing lore system:', error?.message || error);
    }
  }
}

// Draw hack timeout message
function drawHackTimeoutMessage(ctx) {
  if (window.hackTimeoutMessage && window.hackTimeoutMessage.timer > 0) {
    ctx.save();
    
    const flashDuration = 30;
    const totalFlashes = 4;
    const currentFlash = Math.floor((120 - window.hackTimeoutMessage.timer) / flashDuration);
    const flashProgress = ((120 - window.hackTimeoutMessage.timer) % flashDuration) / flashDuration;
    
    let alpha;
    if (currentFlash < totalFlashes) {
      if (flashProgress < 0.5) {
        alpha = flashProgress * 2;
      } else {
        alpha = 2 - flashProgress * 2;
      }
    } else {
      alpha = 0;
    }
    
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 15;
    ctx.fillText(window.hackTimeoutMessage.text, 960, 140);
    ctx.restore();
    
    window.hackTimeoutMessage.timer--;
    
    if (window.hackTimeoutMessage.timer <= 0) {
      window.hackTimeoutMessage = null;
    }
  }
}
