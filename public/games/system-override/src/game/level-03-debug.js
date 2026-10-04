// Session-only, canvas-native controls for the provisional Level 3 preview.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/level-03-debug.js', exports: ['DEBUG.level3'], dependencies: ['BARCODE.RunAndGunProof'] });
(function() {
  'use strict';
  window.BARCODE = window.BARCODE || {};
  window.DEBUG = window.DEBUG || {};
  window.BARCODE.DEBUG_LEVEL_3_SESSION = false;

  const ui = { open: false, message: 'Click DEV 3 or use Shift+F1', canvas: null };
  const proof = () => window.BARCODE.RunAndGunProof;
  const active = () => !!proof()?.active;
  const unlocked = () => window.BARCODE.DEBUG_LEVEL_3_SESSION === true;
  const paused = () => !!(window.isPaused || window.BARCODE?.PauseMenu?.isPaused?.());
  const disabled = () => ({ ok: false, reason: 'debug-disabled' });
  function call(method, ...args) {
    return unlocked() && active() && !paused() && typeof proof()[method] === 'function' ? proof()[method](...args) : disabled();
  }

  window.DEBUG.level3 = Object.freeze({
    status: () => call('debugStatus'),
    gotoRelay: number => call('debugGotoRelay', number),
    clearNode: () => call('debugClearNode'),
    clearRelay: () => call('debugClearRelay'),
    refill: () => call('debugRefill'),
    giveScatter: () => call('debugScatter'),
    clearDefenders: () => call('debugClearDefenders'),
    completeProof: () => call('debugCompleteProof'),
    resetProof: () => call('debugResetProof'),
    gotoBoss: () => call('debugGotoBoss'),
    drawOverlay
  });

  const actions = [
    { label: 'Go Relay 1', run: () => window.DEBUG.level3.gotoRelay(1) },
    { label: 'Go Relay 2', run: () => window.DEBUG.level3.gotoRelay(2) },
    { label: 'Break Current Node', run: () => window.DEBUG.level3.clearNode() },
    { label: 'Disable Current Relay', run: () => window.DEBUG.level3.clearRelay() },
    { label: 'Refill Signal', run: () => window.DEBUG.level3.refill() },
    { label: 'Give Scatter', run: () => window.DEBUG.level3.giveScatter() },
    { label: 'Clear Defenders', run: () => window.DEBUG.level3.clearDefenders() },
    { label: 'Complete Preview', run: () => window.DEBUG.level3.completeProof() },
    { label: 'Reset Preview', run: () => window.DEBUG.level3.resetProof() },
    { label: 'Go Transmitter', run: () => window.DEBUG.level3.gotoBoss() }
  ];
  function layout(canvas) {
    const height = canvas?.height || 1080, launcher = { x: 16, y: height - 46, w: 112, h: 30 };
    const rows = Math.ceil(actions.length / 2), panelHeight = 24 + 58 + rows * 30 + (rows - 1) * 6 + 52;
    const panel = { x: 16, y: Math.max(12, launcher.y - panelHeight - 8), w: 438, h: panelHeight };
    const buttons = actions.map((action, index) => ({ action,
      x: panel.x + 12 + (index % 2) * 210,
      y: panel.y + 70 + Math.floor(index / 2) * 36, w: 204, h: 30 }));
    return { launcher, panel, buttons, footerY: panel.y + panel.h - 52 };
  }
  function inside(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }
  function canvasPoint(event, canvas) {
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect?.width || !rect.height || !canvas.width || !canvas.height) return null;
    const borderLeft = Number(canvas.clientLeft) || 0, borderTop = Number(canvas.clientTop) || 0;
    const contentW = Number(canvas.clientWidth) || Math.max(0, rect.width - borderLeft * 2);
    const contentH = Number(canvas.clientHeight) || Math.max(0, rect.height - borderTop * 2);
    const scale = Math.min(contentW / canvas.width, contentH / canvas.height);
    if (!(scale > 0)) return null;
    const x = (event.clientX - rect.left - borderLeft - (contentW - canvas.width * scale) / 2) / scale;
    const y = (event.clientY - rect.top - borderTop - (contentH - canvas.height * scale) / 2) / scale;
    return x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height ? { x, y } : null;
  }
  function consume(event) { event.preventDefault?.(); event.stopPropagation?.(); }
  function toggle() {
    if (!unlocked()) {
      window.BARCODE.DEBUG_LEVEL_3_SESSION = true;
      ui.open = true; ui.message = 'Level 3 debug unlocked for this session';
    } else ui.open = !ui.open;
  }
  function run(action) {
    try {
      const result = action.run();
      ui.message = `${action.label}: ${result?.ok === false ? result.reason : result?.state || 'OK'}`;
      if (result?.state === 'proof-clear') ui.open = false;
    } catch (error) {
      ui.message = `${action.label}: ${error?.message || error}`;
      console.error('Level 3 debug action failed:', error?.message || error);
    }
  }
  function pointer(event) {
    if (!active() || paused() || Number.isFinite(event.button) && event.button !== 0) return;
    const canvas = event.currentTarget || ui.canvas, point = canvasPoint(event, canvas);
    if (!point) return;
    const positions = layout(canvas);
    if (inside(point, positions.launcher)) { consume(event); toggle(); return; }
    if (!unlocked() || !ui.open) return;
    const button = positions.buttons.find(entry => inside(point, entry));
    if (button) { consume(event); run(button.action); }
  }
  function bind(canvas) {
    if (!canvas || typeof canvas.addEventListener !== 'function' || ui.canvas === canvas) return;
    ui.canvas?.removeEventListener?.('pointerdown', pointer, true);
    ui.canvas = canvas;
    canvas.addEventListener('pointerdown', pointer, true);
  }
  function drawOverlay(ctx) {
    if (!ctx || !active() || paused()) return;
    bind(ctx.canvas);
    const { launcher, panel, buttons, footerY } = layout(ctx.canvas);
    ctx.save();
    if (unlocked() && ui.open) {
      ctx.fillStyle = 'rgba(0,5,14,0.96)'; ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      ctx.strokeStyle = '#91ffdd'; ctx.lineWidth = 2; ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#ff8fb4'; ctx.font = 'bold 16px monospace';
      ctx.fillText('LEVEL 3 DEV — SESSION ONLY', panel.x + 12, panel.y + 10);
      ctx.fillStyle = '#a8ffff'; ctx.font = '12px monospace';
      ctx.fillText('Shift+F1  |  Ctrl+Shift+D  |  `', panel.x + 12, panel.y + 34);
      for (const button of buttons) {
        ctx.fillStyle = 'rgba(10,25,39,0.96)'; ctx.fillRect(button.x, button.y, button.w, button.h);
        ctx.strokeStyle = '#4bbec5'; ctx.lineWidth = 1; ctx.strokeRect(button.x, button.y, button.w, button.h);
        ctx.fillStyle = '#ffffff'; ctx.font = '12px monospace'; ctx.textBaseline = 'middle';
        ctx.fillText(button.action.label, button.x + 8, button.y + button.h / 2, button.w - 16);
      }
      const s = proof().state;
      ctx.fillStyle = 'rgba(0,18,28,0.96)'; ctx.fillRect(panel.x + 10, footerY, panel.w - 20, 40);
      ctx.fillStyle = '#91ffdd'; ctx.font = '12px monospace'; ctx.textBaseline = 'top';
      ctx.fillText(`status=${proof().status} hp=${s.player.health} relays=${s.relays.join('/')} boss=${s.boss.health}`, panel.x + 18, footerY + 6);
      ctx.fillStyle = '#ffffff'; ctx.fillText(ui.message, panel.x + 18, footerY + 22, panel.w - 36);
    }
    ctx.fillStyle = unlocked() ? 'rgba(0,20,30,0.92)' : 'rgba(25,4,32,0.92)';
    ctx.fillRect(launcher.x, launcher.y, launcher.w, launcher.h);
    ctx.strokeStyle = unlocked() ? '#91ffdd' : '#ff00ff'; ctx.lineWidth = 2;
    ctx.strokeRect(launcher.x, launcher.y, launcher.w, launcher.h);
    ctx.fillStyle = unlocked() ? '#91ffdd' : '#ff66ff'; ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(unlocked() ? `DEV 3 ${ui.open ? '▲' : '▼'}` : 'DEV 3', launcher.x + launcher.w / 2, launcher.y + launcher.h / 2);
    ctx.restore();
  }

  window.addEventListener('keydown', event => {
    if (!active() || paused() || event.repeat) return;
    const key = String(event.key || ''), code = String(event.code || '');
    const shortcut = key === 'F1' && event.shiftKey ||
      event.ctrlKey && event.shiftKey && (key.toLowerCase() === 'd' || code === 'KeyD') ||
      key === '`' || key === '~' || code === 'Backquote' || unlocked() && key === 'F1';
    if (!shortcut) return;
    consume(event); toggle();
  }, true);
})();
