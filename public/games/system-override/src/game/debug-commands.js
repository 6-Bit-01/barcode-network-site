// Debug commands for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/debug-commands.js',
  exports: ['DEBUG', 'CHECK_JAMMER_STATUS', 'handleGameAction'],
  dependencies: ['enemyManager', 'tutorialSystem', 'gameState', 'hackingSystem', 'rhythmSystem', 'bootLoader', 'BARCODE.JammerEnvironment', 'BARCODE.PlayerCombat']
});

function jammerEnv() { return window.BARCODE && window.BARCODE.JammerEnvironment; }
function jammerStatus() { return jammerEnv() ? jammerEnv().getStatus() : null; }

window.DEBUG = {
  revealJammer(position) {
    if (!jammerEnv()) return '❌ Jammer environment unavailable';
    const status = jammerEnv().reveal({ position });
    console.log('📡 Environmental Jammer revealed:', status);
    return status;
  },
  triggerJammer(position) {
    if (!jammerEnv()) return '❌ Jammer environment unavailable';
    const status = jammerEnv().trigger({ position });
    console.log('📡 Environmental Jammer triggered:', status);
    return status;
  },
  resetJammer() {
    if (!jammerEnv()) return '❌ Jammer environment unavailable';
    const status = jammerEnv().reset();
    console.log('📡 Environmental Jammer reset:', status);
    return status;
  },
  checkJammer() {
    const status = jammerStatus();
    console.log('📡 Environmental Jammer status:', status);
    return status;
  },
  checkStatus() { return this.checkJammer(); },
  skipBootScreen() {
    if (window.bootLoader && typeof window.bootLoader.forceHide === 'function') {
      window.bootLoader.forceHide();
      window.bootLoader.setAudioLoaded(true);
      window.bootLoader.setSpritesLoaded(true);
      window.bootLoader.setAssetsLoaded(true);
      const startOverlay = document.getElementById('startOverlay');
      if (startOverlay) { startOverlay.style.display = 'flex'; startOverlay.style.opacity = '1'; }
      const soundPopup = document.getElementById('soundEnablePopup');
      if (soundPopup && soundPopup.parentNode) soundPopup.parentNode.removeChild(soundPopup);
      return '✅ Boot screen skipped - title screen ready';
    }
    return '❌ Failed to skip boot screen - boot loader not available';
  }
};

window.CHECK_JAMMER_STATUS = function() { return window.DEBUG.checkJammer(); };

function gameplayAcceptsAction() {
  if (window.isPaused || !window.isRunning) return false;
  if (window.gameState && (window.gameState.paused || window.gameState.gameOver || window.gameState.victory || window.gameState.running === false)) return false;
  return true;
}

function routeJumpAction() {
  if (!gameplayAcceptsAction()) return { ok: false, action: 'jump', reason: 'gameplay-inactive' };
  if (!window.player || typeof window.player.jump !== 'function') return { ok: false, action: 'jump', reason: 'player-unavailable' };
  if (window.hackingSystem && typeof window.hackingSystem.isActive === 'function' && window.hackingSystem.isActive()) return { ok: false, action: 'jump', reason: 'hacking-active' };
  if (window.rhythmSystem && typeof window.rhythmSystem.isActive === 'function' && window.rhythmSystem.isActive()) return { ok: false, action: 'jump', reason: 'rhythm-active' };
  const wasGrounded = !!window.player.grounded;
  const result = window.player.jump();
  const accepted = result === true || (wasGrounded && window.player.grounded === false);
  return { ok: accepted, action: 'jump', reason: accepted ? 'jumped' : 'jump-rejected' };
}

function routeInteractAction() {
  if (!gameplayAcceptsAction()) return { ok: false, action: 'interact', reason: 'gameplay-inactive' };
  const target = window.BARCODE && window.BARCODE.findInteractionTarget ? window.BARCODE.findInteractionTarget(window.player) : null;
  if (target && typeof target.interact === 'function') return target.interact(window.player);
  return { ok: false, action: 'interact', reason: 'no-target' };
}

function routePrimaryAction() {
  if (!window.BARCODE || !window.BARCODE.playerCombat) return { ok: false, action: 'primary', reason: 'combat-unavailable' };
  return window.BARCODE.playerCombat.resolvePrimary({ player: window.player, enemyManager: window.enemyManager });
}

function routeSkipTutorialAction() {
  if (!window.tutorialSystem || typeof window.tutorialSystem.isActive !== 'function' || !window.tutorialSystem.isActive()) return { ok: false, action: 'skip_tutorial', reason: 'tutorial-inactive' };
  if (typeof window.tutorialSystem.completeTutorial === 'function') window.tutorialSystem.completeTutorial();
  window.tutorialSystem.completed = true;
  window.tutorialSystem.active = false;
  if (window.gameState) window.gameState.hasSpawnedInitialEnemies = false;
  if (typeof window.cancelInitialEnemySpawn === 'function') window.cancelInitialEnemySpawn();
  return { ok: true, action: 'skip_tutorial', reason: 'tutorial-completed' };
}

window.handleGameAction = function(action) {
  switch (action) {
    case 'jump': return routeJumpAction();
    case 'primary': return routePrimaryAction();
    case 'interact': return routeInteractAction();
    case 'skip_tutorial': return routeSkipTutorialAction();
    case 'reveal_jammer': return { ok: true, action, status: window.DEBUG.revealJammer() };
    case 'trigger_jammer': return { ok: true, action, status: window.DEBUG.triggerJammer() };
    case 'reset_jammer': return { ok: true, action, status: window.DEBUG.resetJammer() };
    case 'check_jammer': return { ok: true, action, status: window.DEBUG.checkJammer() };
    case 'spawn_enemy':
      if (window.enemyManager && typeof window.enemyManager.spawnEnemy === 'function') { window.enemyManager.spawnEnemy(); return { ok: true, action }; }
      return { ok: false, action, reason: 'enemy-manager-unavailable' };
    case 'toggle_rhythm':
      if (window.rhythmSystem && typeof window.rhythmSystem.toggle === 'function') return { ok: true, action, status: window.rhythmSystem.toggle() };
      return { ok: false, action, reason: 'rhythm-unavailable' };
    default:
      console.warn(`⚠️ Unknown debug action: ${action}`);
      return { ok: false, action, reason: 'unknown-action' };
  }
};

console.log('🔧 Debug Commands: DEBUG.revealJammer(), DEBUG.triggerJammer(), DEBUG.resetJammer(), DEBUG.checkJammer(); live actions route through handleGameAction().');
