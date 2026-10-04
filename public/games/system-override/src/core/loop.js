// Game loop system for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/core/loop.js',
  exports: ['gameLoop', 'startGameLoop', 'pauseGame', 'resumeGame', 'stopGame'],
  dependencies: ['updateGame', 'renderGame', 'resetRenderContext']
});

// Frame timing and game state - ensure proper initialization
window.lastTime = window.lastTime || 0;
window.maxFPS = window.maxFPS || 60;
window.frameDelay = 1000 / window.maxFPS;
window.isPaused = window.isPaused || false;
window.isRunning = window.isRunning || false;
window.gameLoopRafHandle = window.gameLoopRafHandle || null;

// Makko's canvas guard counts getContext calls, including repeated calls on
// the same element. Keep one context for all proof/difficulty frames and only
// acquire another when the actual game canvas is replaced.
let frameCanvas = null;
let frameContext = null;
let frameContextAttempted = false;
function getFrameContext() {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return null;
  if (canvas !== frameCanvas) {
    frameCanvas = canvas;
    frameContext = null;
    frameContextAttempted = false;
  }
  if (window.renderer?.canvas === canvas && window.renderer.ctx) {
    frameContext = window.renderer.ctx;
    return frameContext;
  }
  if (!frameContext && !frameContextAttempted) {
    frameContextAttempted = true;
    try { frameContext = canvas.getContext('2d'); }
    catch (error) { console.error('Game canvas context unavailable:', error?.message || error); }
  }
  return frameContext;
}

// requestAnimationFrame ownership lives here for active gameplay and input-only paused polling.
function scheduleNextGameplayFrame() {
  if (!window.isRunning || window.gameLoopRafHandle !== null) return;
  window.gameLoopRafHandle = requestAnimationFrame(window.gameLoop);
}

function cancelScheduledGameplayFrame() {
  if (window.gameLoopRafHandle !== null) {
    cancelAnimationFrame(window.gameLoopRafHandle);
    window.gameLoopRafHandle = null;
  }
}

function updateRendererState(deltaTime) {
  if (!window.renderer || typeof window.renderer.update !== 'function') return;

  try {
    const cinematicZoom = window.sector1Progression && typeof window.sector1Progression.getCinematicZoomOverride === 'function'
      ? window.sector1Progression.getCinematicZoomOverride()
      : null;
    const hasCinematicZoom = Number.isFinite(cinematicZoom);

    if (hasCinematicZoom && typeof window.renderer.setCinematicZoomOverride === 'function') {
      window.renderer.setCinematicZoomOverride(cinematicZoom);
    } else {
      const rendererOverride = typeof window.renderer.getCinematicZoomOverride === 'function'
        ? window.renderer.getCinematicZoomOverride()
        : null;
      if (rendererOverride !== null && rendererOverride !== undefined && typeof window.renderer.clearCinematicZoomOverride === 'function') {
        window.renderer.clearCinematicZoomOverride();
      }
    }

    if (!hasCinematicZoom && window.player && typeof window.player.position === 'object' && typeof window.renderer.updateZoomFromPlayer === 'function') {
      window.renderer.updateZoomFromPlayer(window.player.position.x, window.player.position.y);
    }
    window.renderer.update(deltaTime);
  } catch (error) {
    console.error('Error in renderer update:', error?.message || error);
  }
}

// Main game loop with delta time
window.gameLoop = function(timestamp) {
  window.gameLoopRafHandle = null;

  if (!window.isRunning) return;

  if (window.isPaused) {
    window.parallaxBackground?.syncSkyPlayback?.();
    if (window.inputManager && typeof window.inputManager.updatePausedInput === 'function') {
      window.inputManager.updatePausedInput();
    }
    const comic=window.BARCODE?.CacheEnding?.active?window.BARCODE.CacheEnding:
      window.BARCODE?.CacheBridge?.active?window.BARCODE.CacheBridge:null;
    if(comic)comic.draw(getFrameContext());else window.BARCODE?.PauseMenu?.render();
    scheduleNextGameplayFrame();
    return;
  }

  // Calculate delta time in milliseconds
  const deltaTime = timestamp - window.lastTime;

  // Follow the display clock. Comparing each RAF interval against 1000/60
  // discarded valid frames (especially with floating-point timestamps) and
  // also delayed input. Physics already uses bounded integration substeps.
  if (deltaTime <= 0) {
    scheduleNextGameplayFrame();
    return;
  }

  // Cap delta time to prevent spiral of death (if tab was inactive)
  const cappedDelta = Math.min(deltaTime, 100); // Max 100ms (10fps minimum)
  if (window.BARCODE?.LevelDifficulty?.open) {
    window.inputManager?.update?.();
    window.renderGame?.();
    window.BARCODE.LevelDifficulty.draw(getFrameContext());
    window.lastTime = timestamp;
    scheduleNextGameplayFrame();
    return;
  }
  // Campaign proofs share this RAF and input owner. Each supplies its own
  // genre simulation and canvas scene.
  if (window.BARCODE?.CacheEnding?.active) {
    window.BARCODE?.PauseMenu?.sync();
    window.inputManager?.update?.();
    window.BARCODE.CacheEnding.update(cappedDelta);
    window.BARCODE.CacheEnding.draw(getFrameContext());
    window.lastTime = timestamp;
    scheduleNextGameplayFrame();
    return;
  }
  if (window.BARCODE?.CacheBridge?.active) {
    window.BARCODE?.PauseMenu?.sync();
    window.inputManager?.update?.();
    window.BARCODE.CacheBridge.update(cappedDelta);
    window.BARCODE.CacheBridge.draw(getFrameContext());
    window.lastTime = timestamp;
    scheduleNextGameplayFrame();
    return;
  }
  if (window.BARCODE?.CacheRoadProof?.active) {
    window.BARCODE.CacheRoadProof.renderFrameIntervalMs=deltaTime;
    window.BARCODE?.PauseMenu?.sync();
    window.inputManager?.update?.();
    window.BARCODE.CacheRoadProof.update(cappedDelta);
    window.BARCODE.CacheRoadProof.draw(getFrameContext());
    window.audioSystem?.updateLayers?.();
    window.lastTime = timestamp;
    scheduleNextGameplayFrame();
    return;
  }
  if (window.BARCODE?.RunAndGunProof?.active) {
    window.BARCODE?.PauseMenu?.sync();
    window.inputManager?.update?.();
    window.BARCODE.RunAndGunProof.update(cappedDelta);
    const proofContext = getFrameContext();
    window.BARCODE.RunAndGunProof.draw(proofContext);
    window.DEBUG?.level3?.drawOverlay?.(proofContext);
    window.audioSystem?.updateLayers?.();
    window.lastTime = timestamp;
    scheduleNextGameplayFrame();
    return;
  }
  window.BARCODE?.PauseMenu?.sync();
  // Completion presentation advances through this same RAF even after gameplay
  // stops. Its owner ignores this delta outside the completed state.
  window.sector1Progression?.updateCompletionPresentation?.(cappedDelta);

  // Update input state at start of frame
  if (window.inputManager) {
    window.inputManager.update();
  }

  // Update game logic using coordinator system
  if (window.updateGame) {
    try {
      window.updateGame(cappedDelta);
    } catch (error) {
      console.error('Error in game update:', error?.message || error);
    }
  }

  // Update renderer effects once per active gameplay frame.
  updateRendererState(cappedDelta);

  // Render frame using coordinator system with enhanced error handling
  if (window.renderGame) {
    try {
      window.renderGame();
    } catch (error) {
      console.error('Error in game render:', error?.message || error);
      console.error('Render error stack:', error?.stack || 'No stack available');
      
      // Rendering errors are not evidence of a lost 2D context. Resetting the
      // cache here made every subsequent frame call getContext again on Makko.
      if (document.getElementById('gameCanvas') !== window.renderer?.canvas)
        window.resetRenderContext?.();
      
      // Continue game loop even if render fails
    }
  }

  window.lastTime = timestamp;
  // The next gameplay frame is scheduled from this single location.
  scheduleNextGameplayFrame();
};

// Start the game loop (renamed to avoid conflicts with main game controller)
window.startGameLoop = function() {
  if (window.isRunning && !window.isPaused) return;

  cancelScheduledGameplayFrame();
  window.isRunning = true;
  window.isPaused = false;
  window.lastTime = performance.now();
  scheduleNextGameplayFrame();
};

// Pause the game
window.pauseGame = function() {
  window.isPaused = true;
  window.parallaxBackground?.syncSkyPlayback?.();
  cancelScheduledGameplayFrame();
  scheduleNextGameplayFrame();
};

// Resume the game
window.resumeGame = function() {
  if (!window.isRunning || !window.isPaused) return;

  cancelScheduledGameplayFrame();
  window.isPaused = false;
  window.lastTime = performance.now();
  scheduleNextGameplayFrame();
};

// Stop the game
window.stopGame = function() {
  cancelScheduledGameplayFrame();
  window.isRunning = false;
  window.isPaused = false;
  window.parallaxBackground?.syncSkyPlayback?.();
  window.lastTime = 0;
};
