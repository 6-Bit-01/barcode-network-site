// Main game controller for BARCODE: System Override (Refactored)
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/main-new.js',
  exports: ['startGame', 'autoInitGame', 'startNewGame'],
  dependencies: ['updateGame', 'renderGame', 'resetRenderContext', 'startGameInitialization', 'gameState', 'initGameState', 'checkGameConditions', 'player', 'enemyManager', 'objectivesSystem']
});

// Compatibility entrypoints delegate to the authoritative lifecycle owner.
window.startGame = function(options) {
  if (window.BARCODE && window.BARCODE.RuntimeLifecycle) {
    return window.BARCODE.RuntimeLifecycle.start(options || { compatibility: 'startGame' });
  }
  throw new Error('RuntimeLifecycle is not available');
};

window.autoInitGame = function() {
  if (window.autoStartDisabled) {
    console.log('🛑 Auto-start disabled - waiting for start button');
    return;
  }
  return window.startGame({ compatibility: 'autoInitGame' });
};

window.startNewGame = function(options) {
  if (window.BARCODE && window.BARCODE.RuntimeLifecycle) {
    const lifecycle = window.BARCODE.RuntimeLifecycle;
    const state = lifecycle.getState();
    if (state === 'running' || state === 'paused') {
      return lifecycle.restart(options || { compatibility: 'startNewGame' });
    }
    if (state === 'failed') {
      return lifecycle.retry();
    }
    return lifecycle.start(options || { compatibility: 'startNewGame' });
  }
  throw new Error('RuntimeLifecycle is not available');
};

// Update and render functions are handled by the coordinator system:
// - window.updateGame (update-coordinator.js) 
// - window.renderGame (render-coordinator.js)
// The game loop (loop.js) calls these coordinator functions directly

// Global error handlers
window.addEventListener('error', function(event) {
  if (event.message && event.message.includes('Cannot read properties of undefined (reading \'clear\')')) {
    return false;
  }
  
  console.error('GlobalErrorHandler:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
  return false;
});

window.addEventListener('unhandledrejection', function(event) {
  if (event.reason && event.reason.message) {
    if (event.reason.message.includes('permission') || 
        event.reason.message.includes('Permission') ||
        event.reason.message.includes('fullscreen') ||
        event.reason.message.includes('Fullscreen')) {
      console.log('Expected permission/fullscreen rejection:', event.reason.message);
      event.preventDefault();
      return false;
    }
  }
  
  console.error('[GlobalErrorHandler] Unhandled promise rejection:', {
    reason: event.reason,
    stack: event.reason?.stack || 'No stack available',
    type: typeof event.reason
  });
  
  event.preventDefault();
  return false;
});

// Only auto-initialize if not disabled
if (!window.autoStartDisabled) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(window.autoInitGame, 100);
    });
  } else {
    setTimeout(window.autoInitGame, 100);
  }
} else {
  console.log('🛑 Auto-initialization disabled - waiting for start button');
}