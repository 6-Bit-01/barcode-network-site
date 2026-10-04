// Update coordination for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/update-coordinator.js',
  exports: ['updateGame'],
  dependencies: ['gameState', 'checkGameConditions', 'player', 'enemyManager', 'hackingSystem', 'rhythmSystem', 'renderer', 'particleSystem', 'spaceShipSystem', 'tutorialSystem', 'jammerIndicator', 'sector1Progression', 'objectivesSystem', 'loreSystem', 'lostDataSystem', 'audioSystem']
});

// One clock owns tactical-focus timing. Systems that represent hostile gameplay
// use its scaled delta; ambient particles/traffic and the skyline follow too.
// Player animation, terminal input, personal FX, music and camera keep full speed.
window.BARCODE = window.BARCODE || {};
window.BARCODE.TacticalFocusClock = Object.freeze({
  scale: 0.35,

  isActive() {
    return !!(
      window.hackingSystem &&
      typeof window.hackingSystem.isActive === 'function' &&
      window.hackingSystem.isActive()
    );
  },

  getScale() {
    if (!this.isActive()) return 1;
    const prefs = window.BARCODE?.Preferences?.values;
    if (prefs?.reducedMotion || prefs?.reducedFlashes || prefs?.flashes === false) return this.scale;
    // Read the hack's existing simulation clock; querying never advances time.
    const phase = (window.hackingSystem.sessionElapsedMs || 0) * Math.PI * 2 / 2400;
    return this.scale + 0.025 * Math.sin(phase);
  },

  scaleDelta(deltaTime) {
    return deltaTime * this.getScale() * (window.BARCODE?.LevelDifficulty?.getHostileScale?.() ?? 1);
  }
});

// Main update function called from game loop
window.updateGame = function(deltaTime) {
  window.parallaxBackground?.syncSkyPlayback?.();
  if (window.gameState.paused || window.isPaused) return;
  if (!window.gameState.running) {
    if (window.gameState.gameOver || window.gameState.victory) window.rhythmSystem?.update?.(deltaTime);
    if (window.gameState.victory) {
      window.audioSystem?.updateMusicState?.(window.gameState);
      window.BARCODE?.combatFX?.update(deltaTime);
      window.BARCODE?.stageFX?.update(deltaTime);
    }
    return;
  }

  const dt = deltaTime / 1000;
  window.gameState.gameTime += deltaTime;
  
  // Update player
  const hackingActive = window.hackingSystem && typeof window.hackingSystem.isActive === 'function' && window.hackingSystem.isActive();
  const rhythmActive = window.rhythmSystem && typeof window.rhythmSystem.isActive === 'function' && window.rhythmSystem.isActive();
  
  // CRITICAL FIX: Always update player animation even during rhythm/hacking modes
  if (window.player && typeof window.player.update === 'function') {
    try {
      const progressionSuppressesGameplay = window.sector1Progression && window.sector1Progression.isGameplaySuppressed && window.sector1Progression.isGameplaySuppressed();
      const allowMovement = !hackingActive && !progressionSuppressesGameplay;
      window.player.update(deltaTime, allowMovement);
    } catch (error) {
      console.error('Error updating player:', error?.message || error);
    }
  }
  
  // Update enemies
  updateEnemies(deltaTime);
  
  // Update systems
  updateGameSystems(deltaTime, hackingActive, rhythmActive);
  
  // Update effects and visual systems
  updateVisualSystems(deltaTime);
  
  // Update sector progression
  updateSectorProgression(deltaTime);
  window.BARCODE?.stageFX?.update(deltaTime);
  window.BARCODE?.encounterPresentation?.update(window.sector1Progression);
  
  // Update objectives
  updateObjectives(deltaTime);
  
  // Update audio
  updateAudio(deltaTime);
  
  // Update tutorial
  updateTutorial(deltaTime);
  
  // Update lost data system (fragments)
  updateLostDataSystem(deltaTime);
  
  // Update lore system
  updateLoreSystem(deltaTime);
  
  // Check game conditions
  window.checkGameConditions();
};

// Update enemies with tutorial awareness
function updateEnemies(deltaTime) {
  const allowEnemiesInTutorial = window.tutorialSystem && 
    typeof window.tutorialSystem.isActive === 'function' && 
    window.tutorialSystem.isActive() && 
    window.tutorialSystem.storyChapter === 1;
    
  const isTutorialCompleted = window.tutorialSystem && 
    typeof window.tutorialSystem.isCompleted === 'function' && 
    window.tutorialSystem.isCompleted();
    
  const shouldUpdateEnemies = !window.tutorialSystem || 
    typeof window.tutorialSystem.isActive !== 'function' || 
    !window.tutorialSystem.isActive() || 
    isTutorialCompleted || 
    allowEnemiesInTutorial;
    
  if (shouldUpdateEnemies && window.enemyManager) {
    try {
      if (typeof window.enemyManager.update === 'function') {
        window.enemyManager.update(deltaTime, window.player);
      }
      
      // EnemyManager.update() owns enemy/enemy and enemy/player collision orchestration.
      // Rhythm attacks only called from input.js on actual down arrow presses
    } catch (error) {
      console.error('Error updating enemy manager:', error?.message || error);
    }
  }
}

// Update core game systems
function updateGameSystems(deltaTime, hackingActive, rhythmActive) {
  // Update hacking every frame so post-session feedback and cursor state can
  // finish cleanly after terminal input ownership has already been released.
  if (window.hackingSystem && typeof window.hackingSystem.update === 'function') {
    try {
      window.hackingSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating hacking system:', error?.message || error);
    }
  }
  
  // Update rhythm system regardless of visual visibility
  if (window.rhythmSystem && typeof window.rhythmSystem.update === 'function' && 
      (!window.rhythmSystem.isRunning || typeof window.rhythmSystem.isRunning !== 'function' || window.rhythmSystem.isRunning())) {
    try {
      window.rhythmSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating rhythm system:', error?.message || error);
    }
  }
  
  // Renderer state is updated once by src/core/loop.js after simulation.
}

// Update visual and effects systems
function updateVisualSystems(deltaTime) {
  window.BARCODE?.combatFX?.update(deltaTime);
  // Update particles
  if (window.particleSystem && typeof window.particleSystem.update === 'function') {
    try {
      window.particleSystem.update(deltaTime * window.BARCODE.TacticalFocusClock.getScale());
    } catch (error) {
      console.error('Error updating particle system:', error?.message || error);
    }
  }
  
  // Update space ships
  if (window.spaceShipSystem && typeof window.spaceShipSystem.update === 'function') {
    try {
      window.spaceShipSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating space ship system:', error?.message || error);
    }
  }
  
  // Update environmental Jammer owner; it is not part of enemy simulation.
  if (window.BARCODE && window.BARCODE.JammerEnvironment && typeof window.BARCODE.JammerEnvironment.update === 'function') {
    try {
      window.BARCODE.JammerEnvironment.update(deltaTime);
    } catch (error) {
      console.error('Error updating jammer environment:', error?.message || error);
    }
  }

  // Update jammer indicator system from environmental state.
  if (window.jammerIndicator && typeof window.jammerIndicator.update === 'function') {
    try {
      const playerX = window.player ? window.player.position.x : 960;
      const playerY = window.player ? window.player.position.y : 750;
      const jammerEnvironment = window.BARCODE && window.BARCODE.JammerEnvironment;
      const jammerTarget = jammerEnvironment && typeof jammerEnvironment.getAimBounds === 'function'
        ? jammerEnvironment.getAimBounds()
        : jammerEnvironment?.getPosition?.();
      window.jammerIndicator.update(deltaTime, jammerTarget, playerX, playerY);
    } catch (error) {
      console.error('Error updating jammer indicator:', error?.message || error);
    }
  }
}

// Update sector progression system
function updateSectorProgression(deltaTime) {
  if (window.sector1Progression) {
    try {
      window.sector1Progression.update(deltaTime);
      
      const tutorialCompleted = window.tutorialSystem && 
        typeof window.tutorialSystem.isCompleted === 'function' && 
        window.tutorialSystem.isCompleted();
      
      // Jammer reveal/trigger is owned by BARCODE.JammerEnvironment and explicit stage/debug calls.
    } catch (error) {
      console.error('Error updating Sector 1 progression:', error?.message || error);
    }
  }
}

// Update objectives system
function updateObjectives(deltaTime) {
  if (window.objectivesSystem && typeof window.objectivesSystem.update === 'function') {
    try {
      window.objectivesSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating objectives system:', error?.message || error);
    }
  }
}

// Update lore system
function updateLoreSystem(deltaTime) {
  const tutorialActive = window.tutorialSystem && 
                       typeof window.tutorialSystem.isActive === 'function' && 
                       window.tutorialSystem.isActive();
  
  const tutorialCompleted = window.tutorialSystem && 
                          typeof window.tutorialSystem.isCompleted === 'function' && 
                          window.tutorialSystem.isCompleted();
  
  if (!tutorialActive && (tutorialCompleted || !window.tutorialSystem) && window.loreSystem && typeof window.loreSystem.update === 'function') {
    try {
      window.loreSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating lore system:', error?.message || error);
    }
  }
}

// Update audio system
function updateAudio(deltaTime) {
  if (window.audioSystem && typeof window.audioSystem.isInitialized === 'function' && window.audioSystem.isInitialized()) {
    try {
      if (typeof window.audioSystem.updateVisualization === 'function') {
        window.audioSystem.updateVisualization();
      }
      if (typeof window.audioSystem.updateLayers === 'function') {
        window.audioSystem.updateLayers();
      }
      
      if (typeof window.audioSystem.updateEnemyProximitySounds === 'function') {
        const playerX = window.player ? window.player.position.x : 960;
        const playerY = window.player ? window.player.position.y : 750;
        const enemies = window.enemyManager ? window.enemyManager.getActiveEnemies() : [];
        window.audioSystem.updateEnemyProximitySounds(playerX, playerY, enemies);
      }
    } catch (error) {
      console.error('Error updating audio system:', error?.message || error);
    }
  }
}

// Update tutorial system
function updateTutorial(deltaTime) {
  if (window.tutorialSystem && typeof window.tutorialSystem.update === 'function' && 
      typeof window.tutorialSystem.active === 'boolean') {
    try {
      window.tutorialSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating tutorial system:', error?.message || error);
      if (window.tutorialSystem && typeof window.tutorialSystem.complete === 'function') {
        window.tutorialSystem.complete();
      }
    }
  }
}

// Update lost data system (fragments)
function updateLostDataSystem(deltaTime) {
  if (window.lostDataSystem && typeof window.lostDataSystem.update === 'function') {
    try {
      window.lostDataSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating lost data system:', error?.message || error);
    }
  }
}
