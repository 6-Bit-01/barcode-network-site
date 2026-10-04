// Session-only Level 1 diagnostics for Makko's embedded preview.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/level-01-debug.js',
  exports: ['DEBUG.level1'],
  dependencies: ['sector1Progression']
});

(function() {
  'use strict';

  window.BARCODE = window.BARCODE || {};
  window.DEBUG = window.DEBUG || {};
  window.BARCODE.DEBUG_LEVEL_1_SESSION = false;

  const overlayState = { enabled: false };
  const uiState = {
    panelOpen: false,
    lastMessage: 'Click DEV or use Shift+F1 to unlock',
    pointerCanvas: null
  };

  function isUnlocked() { return window.BARCODE.DEBUG_LEVEL_1_SESSION === true; }
  function progression() { return window.sector1Progression || window.initSector1Progression?.(window.player); }
  function isBossCinematicActive() {
    const owner = window.sector1Progression;
    return !!(owner && typeof owner.isBossCinematicActive === 'function' && owner.isBossCinematicActive());
  }
  function disabled() { return { ok: false, reason: 'debug-disabled' }; }
  function call(method, ...args) {
    if (!isUnlocked()) return disabled();
    const owner = progression();
    return owner && typeof owner[method] === 'function' ? owner[method](...args) : { ok: false, reason: 'debug-method-unavailable', method };
  }

  function getZoom() {
    const value = window.renderer && typeof window.renderer.getZoomLevel === 'function' ? window.renderer.getZoomLevel() : window.renderer?.zoomLevel;
    return Math.max(0.1, Number.isFinite(value) ? value : 1);
  }

  function getCameraCenter() {
    if (window.gameCamera && Number.isFinite(window.gameCamera.centerX)) return window.gameCamera.centerX;
    const playerX = window.player?.position?.x || 960;
    return window.clamp ? window.clamp(playerX, 960, 3136) : Math.max(960, Math.min(3136, playerX));
  }

  function worldToScreen(point) {
    const zoom = getZoom();
    const cameraCenter = getCameraCenter();
    return {
      x: 960 + zoom * (point.x - cameraCenter),
      y: 425 + 250 * (1 - zoom) + zoom * (point.y - 425)
    };
  }

  function normalizeRect(rect) {
    if (!rect) return null;
    const x = Number.isFinite(rect.x) ? rect.x : rect.left;
    const y = Number.isFinite(rect.y) ? rect.y : rect.top;
    const width = Number.isFinite(rect.width) ? rect.width : Number.isFinite(rect.w) ? rect.w : rect.right - rect.left;
    const height = Number.isFinite(rect.height) ? rect.height : Number.isFinite(rect.h) ? rect.h : rect.bottom - rect.top;
    return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
  }

  function drawWorldRect(ctx, rect, color, label) {
    const normalized = normalizeRect(rect);
    if (!normalized) return;
    const topLeft = worldToScreen({ x: normalized.x, y: normalized.y });
    const bottomRight = worldToScreen({ x: normalized.x + normalized.width, y: normalized.y + normalized.height });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    if (label) {
      ctx.fillStyle = color;
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, topLeft.x + 3, topLeft.y - 3);
    }
  }

  function drawWorldPoint(ctx, point, color, label) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const projected = worldToScreen(point);
    ctx.fillStyle = color;
    ctx.fillRect(projected.x - 4, projected.y - 4, 8, 8);
    if (label) {
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, projected.x + 7, projected.y - 5);
    }
  }

  function drawGeometryOverlay(ctx) {
    if (!isUnlocked() || !overlayState.enabled || !ctx) return;
    const owner = progression();
    ctx.save();

    const visualGroundY = 750 + (window.Player?.VISUAL_FOOT_OFFSET_Y || 72);
    const groundLeft = worldToScreen({ x: 0, y: visualGroundY });
    const groundRight = worldToScreen({ x: 4096, y: visualGroundY });
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(groundLeft.x, groundLeft.y);
    ctx.lineTo(groundRight.x, groundRight.y);
    ctx.stroke();

    (window.Sector1Progression?.STAGE_SURFACES || []).forEach(surface => drawWorldRect(ctx, surface, '#00ffff', surface.id));
    if (owner?.isSignalLiftAvailable?.() && owner.signalLift) {
      drawWorldRect(ctx, { x: owner.signalLift.x, y: owner.signalLift.y, w: owner.signalLift.w, h: owner.signalLift.h }, '#00ffff', 'signal-lift');
    }
    if (window.player?.getHitbox) drawWorldRect(ctx, window.player.getHitbox(), '#00ff66', 'player hitbox');
    if (window.player?.position) {
      const visualFootY = window.player.getVisualAnchor?.().visibleFootY ?? (window.player.position.y + (window.Player?.VISUAL_FOOT_OFFSET_Y || 72));
      drawWorldPoint(ctx, { x: window.player.position.x, y: visualFootY }, '#ffff00', 'player visible foot');
    }

    (window.enemyManager?.enemies || []).forEach((enemy, index) => {
      if (!enemy?.active) return;
      if (typeof enemy.getHitbox === 'function') drawWorldRect(ctx, enemy.getHitbox(), enemy.isSpawnProtected?.() ? '#ffffff' : '#ff9900', `${enemy.type} ${index}`);
      drawWorldPoint(ctx, enemy.position, '#ff00ff', 'enemy anchor');
      if (enemy._entranceTarget) drawWorldPoint(ctx, enemy._entranceTarget, '#00ff88', 'entrance target');
    });

    const jammerBounds = window.BARCODE?.JammerEnvironment?.getAimBounds?.();
    if (jammerBounds) drawWorldRect(ctx, jammerBounds, '#ff00ff', 'jammer aim bounds');
    const bossBounds = owner?.getBossVisualBounds?.();
    if (bossBounds) drawWorldRect(ctx, bossBounds, '#ff3300', 'boss visual bounds');
    const bossHitbox = owner?.getBossHitbox?.();
    if (bossHitbox) drawWorldRect(ctx, bossHitbox, '#ffff00', 'boss combat hull');
    if (owner?.lastSpawnPlan?.accepted) drawWorldPoint(ctx, owner.lastSpawnPlan.accepted, '#00ff88', 'last spawn');

    const zoom = getZoom();
    const center = getCameraCenter();
    const halfWidth = 960 / zoom;
    drawWorldRect(ctx, { x: center - halfWidth, y: 0, width: halfWidth * 2, height: 850 }, '#ffffff', `camera z=${zoom.toFixed(3)}`);

    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(14, 255, 390, 78);
    ctx.strokeStyle = '#00ffff';
    ctx.strokeRect(14, 255, 390, 78);
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#00ffff';
    ctx.fillText('LEVEL 1 GEOMETRY OVERLAY', 24, 266);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`camera=${center.toFixed(1)} zoom=${zoom.toFixed(3)} state=${owner?.state || 'n/a'}`, 24, 286);
    ctx.fillText(`kills=${owner?.missionDefeats || 0}/20 pending=${owner?.pendingSpawns?.length || 0}`, 24, 305);
    ctx.restore();
  }

  function toggleOverlay() {
    if (!isUnlocked()) return disabled();
    overlayState.enabled = !overlayState.enabled;
    return { ok: true, enabled: overlayState.enabled };
  }

  function getCanvasSize(canvas) {
    return {
      width: Number.isFinite(canvas?.width) && canvas.width > 0 ? canvas.width : 1920,
      height: Number.isFinite(canvas?.height) && canvas.height > 0 ? canvas.height : 1080
    };
  }

  function getLauncherRect(canvas) {
    const size = getCanvasSize(canvas);
    return { x: 16, y: size.height - 46, width: 112, height: 30 };
  }

  const PANEL_ACTIONS = [
    { label: 'Skip Tutorial', run: () => window.DEBUG.level1.skipTutorial() },
    { label: 'Go / Reset Lift', run: () => window.DEBUG.level1.resetSignalLift() },
    { label: 'Charge Lift', run: () => window.DEBUG.level1.chargeSignalLift() },
    { label: 'Give Signal Amp', run: () => window.DEBUG.level1.giveSignalAmp() },
    { label: 'Encounter 1', run: () => window.DEBUG.level1.gotoEncounter(1) },
    { label: 'Encounter 2', run: () => window.DEBUG.level1.gotoEncounter(2) },
    { label: 'Encounter 3', run: () => window.DEBUG.level1.gotoEncounter(3) },
    { label: 'Encounter 4', run: () => window.DEBUG.level1.gotoEncounter(4) },
    { label: 'Complete Encounter', run: () => window.DEBUG.level1.completeEncounter() },
    { label: 'Go to Jammer (20)', run: () => window.DEBUG.level1.gotoJammer() },
    { label: 'Damage Jammer', run: () => window.DEBUG.level1.damageJammer(1) },
    { label: 'Destroy Jammer', run: () => window.DEBUG.level1.destroyJammer() },
    { label: 'Play Boss Intro', run: () => window.DEBUG.level1.playBossIntro() },
    { label: 'Go / Reset Boss', run: () => window.DEBUG.level1.gotoBoss() },
    { label: 'Complete Level 1', run: () => window.DEBUG.level1.completeLevel() },
    { get label() { return overlayState.enabled ? 'Geometry Overlay: ON' : 'Geometry Overlay: OFF'; }, run: () => window.DEBUG.level1.toggleOverlay() },
    { label: 'Reset Mission', run: () => window.DEBUG.level1.resetMission() }
  ];

  function getPanelActions() {
    return PANEL_ACTIONS;
  }

  const layoutCache = { width: 0, height: 0, value: null };
  function getPanelLayout(canvas) {
    const size = getCanvasSize(canvas);
    if (layoutCache.value && layoutCache.width === size.width && layoutCache.height === size.height) return layoutCache.value;
    const launcher = getLauncherRect(canvas);
    const width = 438;
    const padding = 12;
    const titleHeight = 58;
    const buttonHeight = 30;
    const gap = 6;
    const columns = 2;
    const actions = getPanelActions();
    const rows = Math.ceil(actions.length / columns);
    const footerHeight = 52;
    const height = padding * 2 + titleHeight + rows * buttonHeight + (rows - 1) * gap + footerHeight;
    const panel = { x: 16, y: Math.max(12, launcher.y - height - 8), width, height };
    const columnWidth = (width - padding * 2 - gap) / columns;
    const buttons = actions.map((action, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        action,
        x: panel.x + padding + column * (columnWidth + gap),
        y: panel.y + padding + titleHeight + row * (buttonHeight + gap),
        width: columnWidth,
        height: buttonHeight
      };
    });
    const value = { launcher, panel, buttons, footerY: panel.y + panel.height - footerHeight };
    layoutCache.width = size.width;
    layoutCache.height = size.height;
    layoutCache.value = value;
    return value;
  }

  function pointInRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  function summarizeResult(label, result) {
    if (result?.ok === false) return `${label}: ${result.reason || 'failed'}`;
    if (result?.state) return `${label}: ${result.state}${Number.isFinite(result.missionDefeats) ? ` ${result.missionDefeats}/20` : ''}`;
    if (result && Object.prototype.hasOwnProperty.call(result, 'enabled')) return `${label}: ${result.enabled ? 'ON' : 'OFF'}`;
    return `${label}: OK`;
  }

  function runPanelAction(entry) {
    try {
      const result = entry.action.run();
      uiState.lastMessage = summarizeResult(entry.action.label, result);
      return result;
    } catch (error) {
      uiState.lastMessage = `${entry.action.label}: ${error?.message || error}`;
      console.error('Level 1 debug action failed:', error?.message || error);
      return { ok: false, reason: 'debug-action-error' };
    }
  }

  function unlockAndOpen() {
    window.BARCODE.DEBUG_LEVEL_1_SESSION = true;
    uiState.panelOpen = true;
    uiState.lastMessage = 'Level 1 debug unlocked for this session';
  }

  function togglePanel() {
    if (!isUnlocked()) {
      unlockAndOpen();
      return;
    }
    uiState.panelOpen = !uiState.panelOpen;
  }

  function consumeEvent(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function eventToCanvasPoint(event, canvas) {
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height || !canvas.width || !canvas.height) return null;
    const borderLeft = Number(canvas.clientLeft) || 0;
    const borderTop = Number(canvas.clientTop) || 0;
    const contentWidth = Number(canvas.clientWidth) || Math.max(0, rect.width - borderLeft * 2);
    const contentHeight = Number(canvas.clientHeight) || Math.max(0, rect.height - borderTop * 2);
    const contentLeft = rect.left + borderLeft;
    const contentTop = rect.top + borderTop;
    // The game canvas uses object-fit: contain. Account for its internal letterbox
    // instead of treating the entire CSS element box as stretched canvas pixels.
    const scale = Math.min(contentWidth / canvas.width, contentHeight / canvas.height);
    const renderedWidth = canvas.width * scale;
    const renderedHeight = canvas.height * scale;
    const renderedLeft = contentLeft + (contentWidth - renderedWidth) / 2;
    const renderedTop = contentTop + (contentHeight - renderedHeight) / 2;
    const x = (event.clientX - renderedLeft) / scale;
    const y = (event.clientY - renderedTop) / scale;
    if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) return null;
    return {
      x,
      y
    };
  }

  function handleCanvasPointer(event) {
    if (window.BARCODE?.RunAndGunProof?.active || window.isPaused || window.BARCODE?.PauseMenu?.isPaused?.()) return;
    if (isBossCinematicActive()) return;
    if (Number.isFinite(event.button) && event.button !== 0) return;
    const canvas = event.currentTarget || uiState.pointerCanvas;
    const point = eventToCanvasPoint(event, canvas);
    if (!point) return;
    const layout = getPanelLayout(canvas);

    if (pointInRect(point, layout.launcher)) {
      consumeEvent(event);
      togglePanel();
      return;
    }

    if (!isUnlocked() || !uiState.panelOpen) return;
    const entry = layout.buttons.find(button => pointInRect(point, button));
    if (!entry) return;
    consumeEvent(event);
    runPanelAction(entry);
  }

  function ensureCanvasPointer(canvas) {
    if (!canvas || typeof canvas.addEventListener !== 'function' || uiState.pointerCanvas === canvas) return;
    if (uiState.pointerCanvas && typeof uiState.pointerCanvas.removeEventListener === 'function') {
      uiState.pointerCanvas.removeEventListener('pointerdown', handleCanvasPointer, true);
    }
    uiState.pointerCanvas = canvas;
    canvas.addEventListener('pointerdown', handleCanvasPointer, true);
  }

  function drawLauncher(ctx, rect) {
    const unlocked = isUnlocked();
    ctx.fillStyle = unlocked ? 'rgba(0,20,30,0.92)' : 'rgba(25,4,32,0.92)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = unlocked ? '#00ffff' : '#ff00ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = unlocked ? '#00ffff' : '#ff66ff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unlocked ? `DEV ${uiState.panelOpen ? '▲' : '▼'}` : 'DEV', rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  function drawPanel(ctx, layout) {
    const owner = window.sector1Progression;
    const { panel, buttons, footerY } = layout;
    ctx.fillStyle = 'rgba(0,5,14,0.96)';
    ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ff00ff';
    ctx.fillText('LEVEL 1 DEV — SESSION ONLY', panel.x + 12, panel.y + 10);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#a8ffff';
    ctx.fillText('Shift+F1  |  Ctrl+Shift+D  |  `', panel.x + 12, panel.y + 34);

    buttons.forEach(button => {
      ctx.fillStyle = 'rgba(10,25,39,0.96)';
      ctx.fillRect(button.x, button.y, button.width, button.height);
      ctx.strokeStyle = '#00aee8';
      ctx.lineWidth = 1;
      ctx.strokeRect(button.x, button.y, button.width, button.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(button.action.label, button.x + 8, button.y + button.height / 2, button.width - 16);
    });

    ctx.fillStyle = 'rgba(0,18,28,0.96)';
    ctx.fillRect(panel.x + 10, footerY, panel.width - 20, 40);
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`state=${owner?.state || 'n/a'}  kills=${owner?.missionDefeats || 0}/20`, panel.x + 18, footerY + 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(uiState.lastMessage, panel.x + 18, footerY + 22, panel.width - 36);
  }

  function drawDebugUI(ctx) {
    if (!ctx) return;
    ensureCanvasPointer(ctx.canvas);
    const layout = getPanelLayout(ctx.canvas);
    ctx.save();
    if (isUnlocked() && uiState.panelOpen) drawPanel(ctx, layout);
    drawLauncher(ctx, layout.launcher);
    ctx.restore();
  }

  function drawOverlay(ctx) {
    if (!ctx || isBossCinematicActive()) return;
    if (isUnlocked() && overlayState.enabled) {
      try {
        drawGeometryOverlay(ctx);
      } catch (error) {
        console.error('Level 1 geometry overlay failed:', error?.message || error);
      }
    }
    drawDebugUI(ctx);
  }

  window.DEBUG.level1 = Object.freeze({
    status: () => isUnlocked() ? progression()?.getDiagnostics?.() : disabled(),
    skipTutorial: () => call('debugSkipTutorial'),
    gotoEncounter: number => call('debugGotoEncounter', number),
    completeEncounter: () => call('debugCompleteEncounter'),
    gotoJammer: () => call('debugGotoJammer'),
    damageJammer: (amount = 1) => call('debugDamageJammer', amount),
    destroyJammer: () => call('debugDestroyJammer'),
    resetSignalLift: () => call('debugResetSignalLift'),
    chargeSignalLift: () => call('debugChargeSignalLift'),
    giveSignalAmp: () => call('debugGiveSignalAmp'),
    playBossIntro: () => call('debugPlayBossIntro'),
    gotoBoss: () => call('debugGotoBoss'),
    completeLevel: () => call('debugCompleteLevel'),
    resetMission: () => call('debugResetMission'),
    toggleOverlay,
    drawOverlay
  });

  window.addEventListener('keydown', event => {
    if (window.BARCODE?.RunAndGunProof?.active || window.isPaused || window.BARCODE?.PauseMenu?.isPaused?.()) return;
    const key = String(event.key || '');
    const code = String(event.code || '');
    const shiftF1 = key === 'F1' && event.shiftKey;
    const ctrlShiftD = event.ctrlKey && event.shiftKey && (key.toLowerCase() === 'd' || code === 'KeyD');
    const backquote = key === '`' || key === '~' || code === 'Backquote';
    const unlockedF1 = isUnlocked() && key === 'F1';
    if (!shiftF1 && !ctrlShiftD && !backquote && !unlockedF1) return;
    if (isBossCinematicActive()) return;
    if (event.repeat) return;
    consumeEvent(event);
    togglePanel();
  }, true);
})();
