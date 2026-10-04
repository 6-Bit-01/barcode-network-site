// Main game controller for BARCODE: System Override (Legacy - DEPRECATED)
// This file has been refactored into smaller modules
// Use main-new.js for the new modular structure
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/main.js',
  exports: ['update', 'render', 'startGame', 'gameState'],
  dependencies: ['Player', 'player', 'EnemyManager', 'enemyManager', 'HackingSystem', 'hackingSystem', 'RhythmSystem', 'rhythmSystem', 'renderer']
});

// NOTE: This file is deprecated. Please use the modular structure in main-new.js

// Game state management
window.gameState = {
  running: false,
  paused: false,
  gameOver: false,
  victory: false,
  level: 1,
  maxLevel: 5,
  score: 0,
  gameTime: 0,
  hasSpawnedInitialEnemies: false,
  enemiesDefeated: 0,
  enemiesPerLevel: 10
};

// Initialize game
window.startGame = function() {
  // Request fullscreen politely (not automatic)
  console.log('🎮 Game started - press Shift+F to toggle fullscreen');
  
  // REMOVED: Automatic fullscreen request - users should control fullscreen manually
  // This was causing the game to re-enter fullscreen after user exited
  
  window.gameState.running = true;
  window.gameState.paused = false;
  window.gameState.gameOver = false;
  window.gameState.level = 1;
  window.gameState.score = 0;
  window.gameState.gameTime = 0;
  
  // Reset tutorial tracking
  if (window.inputManager) {
    window.inputManager.hasTrackedMovement = false;
    window.inputManager.hasTrackedJump = false;
  }
  
  // Reset game systems
  window.player.health = window.player.maxHealth;
  // Reset player to left side for entrance animation
  window.player.position = new window.Vector2D(200, 500);
  window.player.velocity = new window.Vector2D(0, 0);
  
  // CRITICAL: Force objectives system to be visible and reset on game restart
  if (window.objectivesSystem) {
    window.objectivesSystem.reset();
    if (window.objectivesSystem.objectiveUI) {
      window.objectivesSystem.objectiveUI.visible = true;
    }
    window.objectivesSystem.active = true;
    console.log('🎯 Objectives system reset and forced visible on game restart');
  }
  
  // Trigger entrance animation on restart
  if (typeof window.player.startEntranceAnimation === 'function') {
    window.player.startEntranceAnimation();
  }
  window.enemyManager.clear();
  
  // Reset Sector 1 progression enemy counter at game start
  if (window.sector1Progression && typeof window.sector1Progression.reset === 'function') {
    // Check if we should preserve enemy progress (20+ enemies defeated)
    const currentEnemyCount = window.sector1Progression.enemiesDefeated || 0;
    const shouldPreserveProgress = currentEnemyCount >= 20;
    
    window.sector1Progression.reset(shouldPreserveProgress);
    console.log(`🔄 Sector 1 progression reset at game start${shouldPreserveProgress ? ' (preserving 20+ enemy progress)' : ''}`);
  }
  
  if (typeof window.hackingSystem.reset === 'function') {
    window.hackingSystem.reset();
  }
  // CRITICAL: NEVER restart rhythm system - keep continuous loop running
  // Rhythm mode should run constantly regardless of game over or restart
  // Only gameplay elements (combo, score) should reset, not the beat timing
  if (window.rhythmSystem && typeof window.rhythmSystem.restart === 'function') {
    window.rhythmSystem.restart(); // Reset gameplay elements only (combo, score), preserve beat timing
    console.log('🎵 CRITICAL: Rhythm gameplay elements reset - beat timing preserved for continuous loop');
  }
  
  // Don't spawn enemies during tutorial - wait for tutorial to complete first
  // Enemies will spawn when tutorial is completed
  
  // CRITICAL: Music system will start after cutscenes - do NOT start here
  // The cutscene system will call startMusicSystem() when the intro completes
  // This ensures music layers and rhythm system start simultaneously after intro
  console.log('🎵 Game started - music and rhythm will begin after cutscene intro');
  
  // CRITICAL: Do NOT start rhythm system here - it will start with music after cutscene
  // This prevents beat counter from starting during the intro sequence
  
  // Start main game loop
  if (!window.isRunning) {
    window.isRunning = true;
    window.isPaused = false;
    
    // Audio initialization is handled by initAudio() in initGame() - don't duplicate
    console.log('Audio should already be initialized from initGame()');
    
    requestAnimationFrame(window.gameLoop);
  }
  
  console.log('BARCODE: System Override started');
};

// Initialize audio system first
window.initAudio = async function() {
  console.log('=== INITIALIZING AUDIO SYSTEM ===');
  
  // Don't wait - initialize immediately
  if (!window.audioSystem) {
    console.log('Creating audio system...');
    // Force create audio system if it doesn't exist
    if (window.AudioContext || window.webkitAudioContext) {
      window.audioSystem = new window.AudioSystem();
      console.log('Audio system created successfully');
    } else {
      console.error('Web Audio API not supported');
      return;
    }
  }
  
  if (!window.audioSystem) {
    console.log('Audio system not available - waiting for initialization...');
    // Try to wait for audio system to be available
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (window.audioSystem && window.audioSystem.isInitialized()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    }).catch(error => {
      console.warn('Audio system initialization promise rejected:', error?.message || error);
    });
    
    // Check again after waiting
    if (!window.audioSystem || !window.audioSystem.isInitialized()) {
      console.log('Audio system failed to load after timeout');
      // Create fallback audio system to prevent crashes
      if (!window.audioSystem) {
        window.audioSystem = {
          isInitialized: () => false,
          musicTracks: {},
          updateVisualization: () => {},
          updateLayers: () => {}
        };
      }
      return;
    }
  }
  
  // Ensure musicTracks object exists
  if (!window.audioSystem.musicTracks) {
    window.audioSystem.musicTracks = {};
    console.log('Created musicTracks object');
  }
  
  if (window.audioSystem.isInitialized()) {
    console.log('Audio system already initialized');
    return;
  }
  
  console.log('=== INITIALIZING AUDIO SYSTEM ===');
  
  try {
    await window.audioSystem.init();
    console.log('✓ Audio system initialized successfully');
    console.log('✓ Audio context state:', window.audioSystem.getContextState());
    console.log('✓ Master gain value:', window.audioSystem.masterGain?.gain?.value || 'undefined');
    console.log('✓ Music gain value:', window.audioSystem.musicGain?.gain?.value || 'undefined');
    console.log('✓ Available music tracks:', Object.keys(window.audioSystem.musicTracks));
    
    // Audio system handles its own track creation and starting
    console.log('Audio system initialized successfully');
    console.log('Available tracks:', window.audioSystem.musicTracks ? Object.keys(window.audioSystem.musicTracks) : 'none');
    console.log('Layers started:', window.audioSystem.layersStarted);
    
  } catch (error) {
    console.log('⚠️ Audio system initialization failed:', error);
    console.error('Error details:', error?.stack || 'No stack available');
    // Don't throw - allow game to continue without audio
  }
};

// Initialize sprite system with MakkoEngine
window.initSprites = async function() {
  console.log('=== INITIALIZING SPRITE SYSTEM ===');
  
  try {
    // Wait for MakkoEngine to be available
    if (!window.MakkoEngine) {
      console.warn('MakkoEngine not loaded - waiting...');
      await new Promise(resolve => setTimeout(resolve, 500)).catch(error => {
        console.warn('MakkoEngine loading promise rejected:', error?.message || error);
      });
      if (!window.MakkoEngine) {
        throw new Error('MakkoEngine not available after timeout');
      }
    }
    
    // Initialize MakkoEngine with sprites manifest
    console.log('Loading sprites manifest...');
    await window.MakkoEngine.init('sprites-manifest.json', {
      onProgress: (loaded, total) => {
        console.log(`Loading sprites: ${loaded}/${total}`);
      },
      onComplete: () => {
        console.log('✓ All sprites loaded successfully');
      },
      onError: (error) => {
        console.error('Sprite loading error:', error?.message || error?.toString() || 'Unknown error');
      }
    });
    
    console.log('✓ MakkoEngine initialized successfully');
    console.log('Available characters:', window.MakkoEngine.getCharacters());
    
    // Verify 6_bit_main character is available
    if (window.MakkoEngine.has('6_bit_main')) {
      console.log('✓ 6_bit_main character found');
      const animations = window.MakkoEngine.getAnimations('6_bit_main');
      console.log('6_bit_main animations:', animations);
    } else {
      console.error('❌ 6_bit_main character not found in manifest');
    }
    
    // Verify virus_virus character is available
    if (window.MakkoEngine.has('virus_virus')) {
      console.log('✓ virus_virus character found');
      const virusAnimations = window.MakkoEngine.getAnimations('virus_virus');
      console.log('virus_virus animations:', virusAnimations);
    } else {
      console.error('❌ virus_virus character not found in manifest');
    }
    
    // Verify corrupted_corrupted character is available
    if (window.MakkoEngine.has('corrupted_corrupted')) {
      console.log('✓ corrupted_corrupted character found');
      const corruptedAnimations = window.MakkoEngine.getAnimations('corrupted_corrupted');
      console.log('corrupted_corrupted animations:', corruptedAnimations);
    } else {
      console.error('❌ corrupted_corrupted character not found in manifest');
    }
    
    // Verify firewall_firewall character is available
    if (window.MakkoEngine.has('firewall_firewall')) {
      console.log('✓ firewall_firewall character found');
      const firewallAnimations = window.MakkoEngine.getAnimations('firewall_firewall');
      console.log('firewall_firewall animations:', firewallAnimations);
    } else {
      console.error('❌ firewall_firewall character not found in manifest');
    }
    
    window.useFallbackGraphics = false;
    
  } catch (error) {
    console.error('❌ Failed to initialize MakkoEngine:', error?.message || error?.toString() || 'Unknown error');
    console.warn('Falling back to placeholder graphics');
    window.useFallbackGraphics = true;
    
    // Create fallback sprite system to prevent crashes
    window.MakkoEngine = {
      isLoaded: () => false,
      sprite: () => null,
      has: () => false,
      getCharacters: () => [],
      init: async () => { throw new Error('MakkoEngine fallback - no real engine available'); }
    };
  }
  
  return Promise.resolve();
};

// Main update function - DEPRECATED: Use updateGame from update-coordinator.js
window.update = function(deltaTime) {
  console.warn('⚠️ Using deprecated main.js update function - please migrate to update-coordinator.js');
  if (!window.gameState.running || window.gameState.paused) return;
  
  // Music system updates happen automatically
  
  const dt = deltaTime / 1000;
  window.gameState.gameTime += deltaTime;
  
  // Update player
  const hackingActive = window.hackingSystem && typeof window.hackingSystem.isActive === 'function' && window.hackingSystem.isActive();
  const rhythmActive = window.rhythmSystem && typeof window.rhythmSystem.isActive === 'function' && window.rhythmSystem.isActive();
  
  // CRITICAL FIX: Always update player animation even during rhythm/hacking modes
  // Player needs animation updates for sprite animations to work properly
  // Allow animation updates during hack mode but prevent movement
  if (window.player && typeof window.player.update === 'function') {
    try {
      // Pass flag to prevent movement during hack mode while allowing animations
      const allowMovement = !hackingActive;
      window.player.update(deltaTime, allowMovement);
    } catch (error) {
      console.error('Error updating player:', error?.message || error);
    }
  }
  
  // Update enemies - allow spawning after tutorial or during combat chapter
  const allowEnemiesInTutorial = window.tutorialSystem && 
    typeof window.tutorialSystem.isActive === 'function' && 
    window.tutorialSystem.isActive() && 
    window.tutorialSystem.storyChapter === 1; // Chapter 1 = Combat Basics
    
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
      
      // Check collisions and player attacks
      if (typeof window.enemyManager.checkCollisions === 'function') {
        window.enemyManager.checkCollisions(window.player);
      }
      // Jammer collisions are handled by BroadcastJammerSystem
      
      // Jammer rhythm attacks are handled by BroadcastJammerSystem
    } catch (error) {
      console.error('Error updating enemy manager:', error?.message || error);
    }
  }
  
  // Update systems
  if (window.hackingSystem && typeof window.hackingSystem.update === 'function' && (!window.hackingSystem.isActive || typeof window.hackingSystem.isActive !== 'function' || window.hackingSystem.isActive())) {
    try {
      window.hackingSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating hacking system:', error?.message || error);
    }
  }
  
  // Update rhythm system regardless of visual visibility - background rhythm always runs
  if (window.rhythmSystem && typeof window.rhythmSystem.update === 'function' && (!window.rhythmSystem.isRunning || typeof window.rhythmSystem.isRunning !== 'function' || window.rhythmSystem.isRunning())) {
    try {
      window.rhythmSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating rhythm system:', error?.message || error);
    }
  }
  
  if (window.renderer && typeof window.renderer.update === 'function') {
    try {
      // Update camera zoom based on player position
      if (window.player && typeof window.player.position === 'object' && typeof window.renderer.updateZoomFromPlayer === 'function') {
        // Get player's screen position for zoom calculation
        const playerScreenX = window.player.position.x;
        const playerScreenY = window.player.position.y;
        window.renderer.updateZoomFromPlayer(playerScreenX, playerScreenY);
      }
      
      window.renderer.update(deltaTime);
    } catch (error) {
      console.error('Error updating renderer:', error?.message || error);
    }
  }
  
  // Update particles
  if (window.particleSystem && typeof window.particleSystem.update === 'function') {
    try {
      window.particleSystem.update(deltaTime);
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
  
  // Jammer system updates are handled by BroadcastJammerSystem
  
  // DEPRECATED: Broadcast Jammer System update moved to update-coordinator.js
  // if (window.BroadcastJammerSystem && typeof window.BroadcastJammerSystem.update === 'function') {
  //   try {
  //     window.BroadcastJammerSystem.update(deltaTime);
  //   } catch (error) {
  //     console.error('Error updating Broadcast Jammer System:', error?.message || error);
  //   }
  // }
  
  
  // Update jammer indicator system - BROADCAST JAMMER PRIORITY
  if (window.jammerIndicator && typeof window.jammerIndicator.update === 'function') {
    try {
      // Get player position
      const playerX = window.player ? window.player.position.x : 960;
      const playerY = window.player ? window.player.position.y : 750;
      
      // SIMPLIFIED: Only track BroadcastJammerSystem - the authoritative source
      if (window.BroadcastJammerSystem && window.BroadcastJammerSystem.jammer && window.BroadcastJammerSystem.jammer.active) {
        window.jammerIndicator.update(
          deltaTime,
          window.BroadcastJammerSystem.jammer.position,
          playerX,
          playerY
        );
      } else {
        // No broadcast jammer - hide indicator
        window.jammerIndicator.update(deltaTime, null, playerX, playerY);
      }
    } catch (error) {
      console.error('Error updating jammer indicator:', error?.message || error);
    }
  }
  
  // FIXED: Update sector progression system AND ensure jammer visibility
  if (window.sector1Progression) {
    try {
      window.sector1Progression.update(deltaTime);
      
      // SIMPLIFIED: Only check for jammer reveal - BroadcastJammerSystem handles creation
      const tutorialCompleted = window.tutorialSystem && 
        typeof window.tutorialSystem.isCompleted === 'function' && 
        window.tutorialSystem.isCompleted();
      
      if (!window.tutorialSystem || tutorialCompleted) {
        // Reveal jammer if conditions are met (BroadcastJammerSystem handles creation)
        if (window.sector1Progression.enemiesDefeated >= 20 && !window.sector1Progression.jammerRevealed) {
          console.log('🎯 Enemy quota met - revealing jammer via BroadcastJammerSystem!');
          window.sector1Progression.revealJammer();
        }
      }
      
      // CRITICAL BACKUP: Force jammer reveal if 20 enemies defeated and not revealed
      if (window.sector1Progression.enemiesDefeated >= 20 && !window.sector1Progression.jammerRevealed) {
        console.log('🔧 MAIN BACKUP: 20 enemies defeated but jammer not revealed - FORCING REVEAL!');
        window.sector1Progression.revealJammer();
        
        // Also force BroadcastJammerSystem to create jammer as backup
        if (window.BroadcastJammerSystem && typeof window.BroadcastJammerSystem.forceSpawn === 'function') {
          console.log('🔧 BACKUP: Force spawning jammer via BroadcastJammerSystem');
          window.BroadcastJammerSystem.forceSpawn(2800, 880);
        }
      }
      
    } catch (error) {
      console.error('Error updating Sector 1 progression:', error?.message || error);
    }
  }
  
  // Update objectives system
  if (window.objectivesSystem && typeof window.objectivesSystem.update === 'function') {
    try {
      window.objectivesSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating objectives system:', error?.message || error);
    }
  }
  
  // Update lore system - DISABLED during tutorial
  const tutorialActive = window.tutorialSystem && 
                       typeof window.tutorialSystem.isActive === 'function' && 
                       window.tutorialSystem.isActive();
  
  const tutorialCompleted = window.tutorialSystem && 
                          typeof window.tutorialSystem.isCompleted === 'function' && 
                          window.tutorialSystem.isCompleted();
  
  // Only update lore system if tutorial is completed or doesn't exist
  if (!tutorialActive && (tutorialCompleted || !window.tutorialSystem) && window.loreSystem && typeof window.loreSystem.update === 'function') {
    try {
      window.loreSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating lore system:', error?.message || error);
    }
  }
  
  // Update lost data system
  if (window.lostDataSystem && typeof window.lostDataSystem.update === 'function') {
    try {
      window.lostDataSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating lost data system:', error?.message || error);
    }
  }
  
  // Update audio system
  if (window.audioSystem && typeof window.audioSystem.isInitialized === 'function' && window.audioSystem.isInitialized()) {
    try {
      if (typeof window.audioSystem.updateVisualization === 'function') {
        window.audioSystem.updateVisualization();
      }
      if (typeof window.audioSystem.updateLayers === 'function') {
        window.audioSystem.updateLayers(); // Update music layers based on game state
      }
      
      // Update enemy proximity sounds
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
  
  // Update tutorial - only if tutorial system exists and is properly initialized
  if (window.tutorialSystem && typeof window.tutorialSystem.update === 'function' && typeof window.tutorialSystem.active === 'boolean' && window.tutorialSystem.active) {
    try {
      window.tutorialSystem.update(deltaTime);
    } catch (error) {
      console.error('Error updating tutorial system:', error?.message || error);
      // Safely disable tutorial on error to prevent continuous errors
      if (window.tutorialSystem && typeof window.tutorialSystem.complete === 'function') {
        window.tutorialSystem.complete();
      }
    }
  }
  
  // CRITICAL: Remove duplicate enemy defeat tracking - EnemyManager handles this now
  // EnemyManager already handles Sector 1 progression notification in enemies.js
  
  // ULTIMATE BACKUP: Check every frame for jammer spawn conditions
  if (window.sector1Progression && 
      window.sector1Progression.enemiesDefeated >= 20 && 
      !window.sector1Progression.jammerRevealed) {
    console.log('🔧 ULTIMATE BACKUP: 20 enemies defeated, no jammer - EMERGENCY SPAWN!');
    window.sector1Progression.enemiesDefeated = 20; // Ensure count is correct
    window.sector1Progression.revealJammer();
    
    // CRITICAL FIX: Only force spawn if jammer system not permanently destroyed
    if (window.BroadcastJammerSystem && !window.BroadcastJammerSystem.permanentlyDestroyed && typeof window.BroadcastJammerSystem.forceSpawn === 'function') {
      window.BroadcastJammerSystem.forceSpawn(2800, 880);
      console.log('✅ Emergency jammer spawn completed');
    } else {
      console.log('🚫 EMERGENCY SPAWN BLOCKED: Jammer permanently destroyed');
    }
  }
  
  // Check win/lose conditions
  checkGameConditions();
};

// Cache canvas context to prevent repeated creation
let renderCanvas = null;
let renderContext = null;
let contextCreationAttempts = 0;
const MAX_CONTEXT_ATTEMPTS = 3;

// Main render function - DEPRECATED: Use renderGame from render-coordinator.js
window.render = function() {
  console.warn('⚠️ Using deprecated main.js render function - please migrate to render-coordinator.js');
  // Check if renderer is available before use (fix initialization order issue)
  let rendererAvailable = window.renderer && typeof window.renderer === 'object' && window.renderer !== null && typeof window.renderer.clear === 'function';
  
  // Declare rendererAvailable at function scope to avoid undefined reference
  if (typeof rendererAvailable === 'undefined') {
    rendererAvailable = false;
  }
  
  // Use cached canvas context
  if (!renderCanvas) {
    renderCanvas = document.getElementById('gameCanvas');
    if (!renderCanvas) {
      console.warn('Canvas not found, skipping render frame');
      return;
    }
  }
  
  // Get context only once with retry limit
  if (!renderContext && contextCreationAttempts < MAX_CONTEXT_ATTEMPTS) {
    contextCreationAttempts++;
    try {
      renderContext = renderCanvas.getContext('2d');
      if (!renderContext) {
        console.error('Failed to get canvas context, attempt', contextCreationAttempts);
        // CRITICAL: Stop trying on failure to prevent infinite loop
        contextCreationAttempts = MAX_CONTEXT_ATTEMPTS;
        return;
      }
    } catch (error) {
      console.error('Error getting canvas context:', error?.message || error);
      // CRITICAL: Check for any context-related error and stop retrying immediately
      if (error.message && (
          error.message.includes('context creation limit') ||
          error.message.includes('Maximum number') ||
          error.message.includes('context limit')
      )) {
        console.error('🚫 Canvas context creation limit exceeded - possible infinite loop detected');
        contextCreationAttempts = MAX_CONTEXT_ATTEMPTS;
        return;
      }
      // CRITICAL: For any other context errors, also stop retrying to prevent loops
      console.error('Canvas context error - stopping retry attempts to prevent infinite loop');
      contextCreationAttempts = MAX_CONTEXT_ATTEMPTS;
      return;
    }
  }
  
  if (!renderContext) {
    if (contextCreationAttempts >= MAX_CONTEXT_ATTEMPTS) {
      console.warn('Canvas context not available after multiple attempts, skipping render frame');
    }
    return;
  }
  
  var ctx = renderContext;
  
  // Ensure ctx is available before use
  if (!ctx) {
    console.warn('Canvas context not available, skipping render frame');
    return;
  }
  
  // Set global image rendering to high-quality smooth
  try {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  } catch (error) {
    // Some browsers may not support these settings
  }
  
  // Clear canvas directly with fallback
  try {
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
  } catch (error) {
    console.error('Error clearing canvas:', error?.message || error);
    return;
  }
  
  // Use renderer clear if available, otherwise canvas clear is sufficient
  if (rendererAvailable) {
    try {
      window.renderer.clear();
    } catch (error) {
      console.error('Error in renderer.clear():', error?.message || error);
      // Canvas clear above is sufficient as fallback
      rendererAvailable = false; // Disable renderer on error
    }
  }
  
  // Additional safety check for ctx
  if (!ctx) {
    console.warn('Canvas context lost during render, skipping frame');
    return;
  }
  
  // Apply zoom transformation to game area only (leave bottom UI unaffected)
  if (rendererAvailable && window.renderer && typeof window.renderer.zoomLevel === 'number') {
    ctx.save();
    
    // Get current zoom level from renderer
    const currentZoom = window.renderer.zoomLevel;
    
    // Calculate vertical offset based on zoom level
    // At max zoom (0.6): offset by 100px downward
    // At normal zoom (1.0): no offset
    const zoomAmount = 1.0 - currentZoom; // 0.4 at max zoom, 0.0 at normal
    const maxOffset = 100;
    const verticalOffset = (zoomAmount / 0.4) * maxOffset; // Scale offset proportionally
    
    // Apply zoom centered on screen, with dynamic vertical positioning
    const centerX = 1920 / 2;
    const centerY = 850 / 2; // Center of game area (top 850px)
    
    ctx.translate(centerX, centerY + verticalOffset);
    ctx.scale(currentZoom, currentZoom);
    ctx.translate(-centerX, -centerY);
    
    // Apply screen shake if available (within zoomed context)
    if (window.renderer.screenShake.x || window.renderer.screenShake.y) {
      ctx.translate(window.renderer.screenShake.x, window.renderer.screenShake.y);
    }
  }
  
  // Note: Particles are updated in the update() function, drawn here only
  
  // Draw game elements first (background, ground, enemies, player) - within zoomed area
  drawGameElements(ctx);
  
  // Restore context to remove zoom transformation before drawing UI
  if (rendererAvailable && window.renderer && typeof window.renderer.zoomLevel === 'number') {
    ctx.restore();
  }
  
  // Draw tutorial UI on top - NOT affected by zoom (bottom area)
  if (window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive()) {
    // Save current context state
    ctx.save();
    
    try {
      // Draw tutorial with normal context (no zoom)
      window.tutorialSystem.draw(ctx);
    } catch (error) {
      console.error('Error drawing tutorial system:', error?.message || error);
    }
    
    // Restore context for game UI
    ctx.restore();
  }
  
  // Draw game UI elements (health, score, etc.) - NOT affected by zoom (bottom area)
  if (typeof drawUI === 'function') {
    try {
      drawUI(ctx);
    } catch (error) {
      console.error('Error drawing UI:', error?.message || error);
    }
  }
  
  // Apply post-processing effects (if available) - affects entire canvas
  if (rendererAvailable) {
    try {
      if (window.renderer.applyPostEffects && typeof window.renderer.applyPostEffects === 'function') {
        window.renderer.applyPostEffects();
      }
    } catch (error) {
      console.error('Error in renderer post-processing:', error?.message || error?.toString() || 'Unknown error');
      rendererAvailable = false; // Disable renderer on error
    }
  }
};

function drawGameElements(ctx) {
  // Draw fallback background first (behind parallax)
  drawBackground(ctx);
  
  // Set up side-scroller camera
  const playerX = window.player ? window.player.position.x : 960;
  const canvasWidth = 1920;
  const worldWidth = 4096;
  const halfCanvas = canvasWidth / 2;
  
  // Calculate camera position that follows player
  let cameraX = playerX;
  cameraX = window.clamp?.(cameraX, halfCanvas, worldWidth - halfCanvas) || cameraX;
  const cameraOffsetX = 960 - cameraX; // Offset to center player on screen
  
  // Draw parallax background layer (BG)
  if (window.parallaxBackground) {
    // Update camera based on player position
    const groundY = 890; // Fixed ground level - foreground should not follow jumping
    window.parallaxBackground.updateCamera(cameraX, groundY);
    
    // Draw only BG layer (layer 0)
    try {
      const bgLayer = window.parallaxBackground.getLayer(0);
      if (bgLayer) {
        window.parallaxBackground.drawLayer(ctx, bgLayer);
      }
    } catch (error) {
      console.error('Error drawing parallax background layer:', error);
    }
  }
  
  // Draw space ships (between BG and FG layers) - normal ships only
  if (window.spaceShipSystem && typeof window.spaceShipSystem.drawNormalShips === 'function') {
    try {
      window.spaceShipSystem.drawNormalShips(ctx);
    } catch (error) {
      console.error('Error drawing normal space ships:', error?.message || error);
    }
  }
  
  // Draw parallax foreground layer (FG)
  if (window.parallaxBackground) {
    try {
      const fgLayer = window.parallaxBackground.getLayer(1);
      if (fgLayer) {
        window.parallaxBackground.drawLayer(ctx, fgLayer);
      }
    } catch (error) {
      console.error('Error drawing parallax foreground layer:', error);
    }
  }
  
  // Apply camera transform to all game objects
  ctx.save();
  ctx.translate(cameraOffsetX, 0);
    
  // Draw smoke particles BEHIND ground layer (moved before ground draw)
  if (window.particleSystem) {
    ctx.save();
    
    // Draw ALL smoke/dust particles (growAndDissipate) behind ground, regardless of color
    // This includes player white smoke (#ffffff), gray smoke (#cccccc), etc.
    const smokeParticles = window.particleSystem.particles.filter(p => 
      p.growAndDissipate === true
    );
    smokeParticles.forEach(particle => particle.draw(ctx));
    ctx.restore();
  }
    
  // Draw ground
    drawGround(ctx);
    
  // Draw remaining particle effects on top (excluding smoke particles which are drawn behind ground)
  if (window.particleSystem) {
    ctx.save();
    
    // Only draw non-smoke particles (enemy effects, rhythm effects, etc.)
    // Exclude ALL particles with growAndDissipate = true
    const otherParticles = window.particleSystem.particles.filter(p => 
      p.growAndDissipate !== true
    );
    otherParticles.forEach(particle => particle.draw(ctx));
    ctx.restore();
  }
    
  // Draw enemies
  if (window.enemyManager && typeof window.enemyManager.draw === 'function') {
    try {
      window.enemyManager.draw(ctx);
    } catch (error) {
      console.error('Error drawing enemies:', error?.message || error);
    }
  }
  
  // Jammer drawing is handled by BroadcastJammerSystem
  
  // DEPRECATED: Broadcast Jammer System draw moved to render-coordinator.js
  // if (window.BroadcastJammerSystem && typeof window.BroadcastJammerSystem.draw === 'function') {
  //   try {
  //     window.BroadcastJammerSystem.draw(ctx);
  //   } catch (error) {
  //     console.error('Error drawing Broadcast Jammer System:', error?.message || error);
  //   }
  // }
  
  // REMOVED: Simple jammer drawing - using BroadcastJammerSystem only
  
  // FIXED: Draw sector progression elements (broadcast jammer, boss)
  if (window.sector1Progression) {
    try {
      window.sector1Progression.draw(ctx);
    } catch (error) {
      console.error('Error drawing Sector 1 progression:', error?.message || error);
    }
  }
  
  // Draw lost data fragments (in game world with camera transform)
  if (window.lostDataSystem && typeof window.lostDataSystem.draw === 'function') {
    try {
      window.lostDataSystem.draw(ctx);
    } catch (error) {
      console.error('Error drawing lost data system:', error?.message || error);
    }
  }
  
  // CORRECTED LAYER ORDER - ARCS BEHIND PLAYER:
  // 1. Draw electrical arcs shooting (bottom layer - behind player)
  // 2. Draw player animation (middle layer)
  // 3. Draw forcefield corner nodes (top layer - subtle effect)
  
  // Draw electrical arcs BEHIND player first
  if (window.rhythmSystem && typeof window.rhythmSystem.isActive === 'function' && window.rhythmSystem.isActive()) {
    try {
      // Draw rhythm effects at player position
      const playerX = window.player ? window.player.position.x : 960;
      const playerY = window.player ? window.player.position.y : 500;
      
      ctx.save();
      
      // Draw electrical arcs shooting FROM behind player (bottom layer)
      if (typeof window.rhythmSystem.drawElectricalArcs === 'function') {
        window.rhythmSystem.drawElectricalArcs(ctx, playerX, playerY);
      }
      
      ctx.restore();
    } catch (error) {
      console.error('Error drawing rhythm effects:', error?.message || error);
    }
  }
  
  // Draw player animation ON TOP of electrical arcs
  // CRITICAL FIX: Ensure player always renders above enemies when invulnerable
  if (window.player && typeof window.player.draw === 'function') {
    try {
      // Check if player is invulnerable and force render order
      const currentTime = Date.now();
      const isPlayerInvulnerable = (
        (window.player.invulnerableUntil && currentTime < window.player.invulnerableUntil)
      );
      
      // If player is invulnerable, save context state to ensure proper layering
      if (isPlayerInvulnerable) {
        ctx.save();
        // Apply slight global composite operation to ensure player visibility
        ctx.globalCompositeOperation = 'source-over';
      }
      
      window.player.draw(ctx);
      
      // Restore context if we saved it for invulnerability
      if (isPlayerInvulnerable) {
        ctx.restore();
      }
    } catch (error) {
      console.error('Error drawing player:', error?.message || error);
    }
  }
  
  // Forcefield corner nodes removed - electrical arcs now render behind player
  
  // DEBUG: Draw rhythm pulse separately to ensure visibility
  if (window.player && window.player.rhythmPulse && window.player.rhythmPulse.active && typeof window.player.drawRhythmPulse === 'function') {
    try {
      console.log('Drawing rhythm pulse separately');
      window.player.drawRhythmPulse(ctx);
    } catch (error) {
      console.error('Error drawing rhythm pulse:', error?.message || error);
    }
  }
  
  // Restore camera transform
  ctx.restore();
  
  // Draw foreground space ships (in front of FG layer but behind UI)
  if (window.spaceShipSystem && typeof window.spaceShipSystem.drawForegroundShips === 'function') {
    try {
      window.spaceShipSystem.drawForegroundShips(ctx);
    } catch (error) {
      console.error('Error drawing foreground space ships:', error?.message || error);
    }
  }
}

function drawBackground(ctx) {
  // Dark gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, 1080);
  gradient.addColorStop(0, '#0a0514');
  gradient.addColorStop(1, '#1a0a2a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);
  
  // Grid pattern
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1920; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1080);
    ctx.stroke();
  }
  for (let y = 0; y < 1080; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1920, y);
    ctx.stroke();
  }
}

function drawGround(ctx) {
  // Ground platform
  const groundY = 890;
  
  // Calculate camera position for infinite ground
  const playerX = window.player ? window.player.position.x : 960;
  const canvasWidth = 1920;
  const worldWidth = 4096;
  const halfCanvas = canvasWidth / 2;
  
  let cameraX = playerX;
  cameraX = window.clamp?.(cameraX, halfCanvas, worldWidth - halfCanvas) || cameraX;
  
  // Draw infinite ground that extends beyond screen
  const groundStartX = -2000; // Extend far left
  const groundEndX = worldWidth + 2000; // Extend far right
  const screenWidth = groundEndX - groundStartX;
  
  // Ground gradient
  const groundGradient = ctx.createLinearGradient(0, groundY, 0, 1080);
  groundGradient.addColorStop(0, '#2a0a4a');
  groundGradient.addColorStop(0.5, '#1a053a');
  groundGradient.addColorStop(1, '#0a022a');
  
  ctx.fillStyle = groundGradient;
  ctx.fillRect(groundStartX, groundY, screenWidth, 1080 - groundY);
  
  // Ground line
  ctx.strokeStyle = '#ff00ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ff00ff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(groundStartX, groundY);
  ctx.lineTo(groundEndX, groundY);
  ctx.stroke();
  ctx.shadowBlur = 0;
  
  // Digital pattern on ground (repeating pattern)
  ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
  const patternStart = Math.floor(groundStartX / 100) * 100;
  for (let x = patternStart; x < groundEndX; x += 100) {
    ctx.fillRect(x, groundY + 10, 80, 5);
  }
}

function drawParticleMask(ctx) {
  // Draw an invisible mask that covers everything below ground level
  // This will block any particles that try to render below the walking surface
  const groundY = 890;
  
  ctx.save();
  
  // Set composite operation to cover/overwrite anything below ground
  ctx.globalCompositeOperation = 'destination-over';
  
  // Fill the area below ground with the ground color to hide particles
  const maskGradient = ctx.createLinearGradient(0, groundY, 0, 1080);
  maskGradient.addColorStop(0, '#2a0a4a');
  maskGradient.addColorStop(0.5, '#1a053a');
  maskGradient.addColorStop(1, '#0a022a');
  
  ctx.fillStyle = maskGradient;
  ctx.fillRect(0, groundY, 1920, 1080 - groundY);
  
  ctx.restore();
}

function drawUI(ctx) {
  // CRITICAL: Reset text alignment to default at start of drawUI
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  // Check if tutorial is complete - only show objectives after tutorial
  let tutorialCompleted = false;
  
  // DEBUG: Add detailed logging for tutorial state
  console.log('🐛 DEBUGGING TUTORIAL STATE:');
  console.log('- window.tutorialSystem exists:', !!window.tutorialSystem);
  if (window.tutorialSystem) {
    console.log('- tutorialSystem.active:', window.tutorialSystem.active);
    console.log('- tutorialSystem.completed:', window.tutorialSystem.completed);
    console.log('- tutorialSystem.isCompleted function:', typeof window.tutorialSystem.isCompleted);
    if (typeof window.tutorialSystem.isCompleted === 'function') {
      console.log('- tutorialSystem.isCompleted():', window.tutorialSystem.isCompleted());
    }
    console.log('- tutorialSystem.storyChapter:', window.tutorialSystem.storyChapter);
  }
  
  // Enhanced tutorial completion check
  if (!window.tutorialSystem) {
    tutorialCompleted = true; // No tutorial system = auto-complete
    console.log('🎯 No tutorial system - objectives enabled');
  } else if (typeof window.tutorialSystem.isCompleted === 'function' && window.tutorialSystem.isCompleted()) {
    tutorialCompleted = true;
    console.log('🎯 Tutorial completed via isCompleted() - objectives enabled');
  } else if (window.tutorialSystem.completed && !window.tutorialSystem.active) {
    tutorialCompleted = true;
    console.log('🎯 Tutorial marked complete and inactive - objectives enabled');
  } else {
    console.log('🎯 Tutorial still active - objectives hidden');
  }
  
  console.log('🐛 FINAL tutorialCompleted value:', tutorialCompleted);
  
  // CRITICAL FIX: Force objectives system to be always active after tutorial initialization
  // This ensures objectives appear immediately when tutorial completes
  if (window.objectivesSystem && tutorialCompleted) {
    window.objectivesSystem.active = true;
    try {
      if (window.objectivesSystem.objectiveUI) {
        window.objectivesSystem.objectiveUI.visible = true;
      }
    } catch (error) {
      console.warn('⚠️ Failed to set objectives UI visibility:', error?.message || error);
    }
    console.log('🎯 FORCED: Objectives system activated after tutorial completion');
  }
  
  // Only draw objectives after tutorial is complete
  if (tutorialCompleted) {
    console.log('🎯 DEBUG: Tutorial complete - drawing objectives');
    
    // CRITICAL: Force objectives to show after tutorial completion
    if (!window.objectivesShownAfterTutorial) {
      window.objectivesShownAfterTutorial = true;
      console.log('🎯 FIRST TIME: Objectives appearing after tutorial completion!');
    }
    
    // CRITICAL: Ensure objectives system is properly activated
    if (window.objectivesSystem) {
      window.objectivesSystem.active = true;
      try {
        if (window.objectivesSystem.objectiveUI) {
          window.objectivesSystem.objectiveUI.visible = true;
        }
      } catch (error) {
        console.warn('⚠️ Failed to set objectives UI visibility in drawUI:', error?.message || error);
      }
    }
    
    // Save context state to avoid affecting other UI elements
    ctx.save();
    
    // Draw objectives panel directly - no system dependencies
    const objX = 1300; // Moved to right side of screen
    const objY = 120;
    const objWidth = 500; // Slightly narrower for right side
    const objHeight = 200;
    
    // Panel background
    ctx.fillStyle = 'rgba(0, 20, 40, 0.95)';
    ctx.fillRect(objX, objY, objWidth, objHeight);
    
    // Panel border
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(objX, objY, objWidth, objHeight);
    
    // Header - use default text alignment
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('MISSION OBJECTIVES', objX + 15, objY + 10);
    
    // Get enemy count
    let enemiesDefeated = 0;
    let requiredEnemies = 20;
    
    if (window.sector1Progression) {
      enemiesDefeated = window.sector1Progression.enemiesDefeated || 0;
      requiredEnemies = window.sector1Progression.requiredEnemyKills || 20;
    } else if (window.enemyManager) {
      enemiesDefeated = window.enemyManager.defeatedCount || 0;
    }
    
    // Enemy counter in header
    ctx.fillStyle = enemiesDefeated >= requiredEnemies ? '#00ff00' : '#ff9900';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`ENEMIES: ${enemiesDefeated}/${requiredEnemies}`, objX + objWidth - 15, objY + 12);
    
    // Draw objectives list
    let yOffset = 40;
    
    // Enemy objective
    ctx.fillStyle = enemiesDefeated >= requiredEnemies ? '#00ff00' : '#ff9900';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    const enemyPrefix = enemiesDefeated >= requiredEnemies ? '✓' : '›';
    ctx.fillText(`${enemyPrefix} Defeat 20 enemies`, objX + 15, objY + yOffset);
    
    ctx.fillStyle = enemiesDefeated >= requiredEnemies ? '#00ff00' : '#cccccc';
    ctx.font = '12px monospace';
    ctx.fillText(`Progress: ${enemiesDefeated}/${requiredEnemies}`, objX + 30, objY + yOffset + 18);
    yOffset += 45;
    
    // Jammer objective (show after 20 enemies)
    if (enemiesDefeated >= requiredEnemies) {
      const jammerDestroyed = window.sector1Progression && window.sector1Progression.broadcastJammerDestroyed;
      ctx.fillStyle = jammerDestroyed ? '#00ff00' : '#ff9900';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      const jammerPrefix = jammerDestroyed ? '✓' : '›';
      ctx.fillText(`${jammerPrefix} Destroy the jammer`, objX + 15, objY + yOffset);
      
      ctx.fillStyle = jammerDestroyed ? '#00ff00' : '#cccccc';
      ctx.font = '12px monospace';
      ctx.fillText('Use rhythm attacks (R key)', objX + 30, objY + yOffset + 18);
      yOffset += 45;
    }
    
    // Progress bar at bottom
    const barY = objY + objHeight - 40;
    const barHeight = 20;
    const barWidth = objWidth - 60;
    const progress = Math.min(1.0, enemiesDefeated / requiredEnemies);
    
    // Progress bar background
    ctx.fillStyle = '#333333';
    ctx.fillRect(objX + 30, barY, barWidth, barHeight);
    
    // Progress fill
    if (progress >= 1.0) {
      ctx.fillStyle = '#00ff00';
    } else if (progress >= 0.5) {
      ctx.fillStyle = '#ffff00';
    } else {
      ctx.fillStyle = '#ff9900';
    }
    
    const fillWidth = barWidth * progress;
    ctx.fillRect(objX + 30, barY, fillWidth, barHeight);
    
    // Progress bar border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(objX + 30, barY, barWidth, barHeight);
    
    // Progress text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ENEMIES DEFEATED: ${enemiesDefeated}/${requiredEnemies}`, objX + objWidth/2, barY + barHeight/2);
    
    // Restore context state to prevent affecting other UI elements
    ctx.restore();
    
    // Text alignment reset removed - causing issues
    
    // End forced objectives draw
  }
  
  // Helper function for drawing text with glow effect
  function drawGlowText(text, x, y, options = {}) {
    const size = options.size || 20;
    const color = options.color || '#ffffff';
    const align = options.align || 'left';
    
    ctx.save();
    ctx.font = `${size}px monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    
    // Draw glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    
    ctx.restore();
  }
  
  // Helper function for drawing health bar
  function drawHealthBar(x, y, width, height, current, max) {
    ctx.save();
    
    // Background
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.fillRect(x, y, width, height);
    
    // Health fill
    const healthPercent = Math.max(0, Math.min(1, current / max));
    ctx.fillStyle = `rgba(0, 255, 0, ${0.5 + healthPercent * 0.5})`;
    ctx.fillRect(x, y, width * healthPercent, height);
    
    // Border
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    
    ctx.restore();
  }
  
  // Draw UI background panels with bold black borders and reduced transparency
  
  // Health bar background panel
  ctx.save();
  ctx.fillStyle = 'rgba(0, 20, 40, 0.95)';
  ctx.fillRect(30, 30, 340, 60);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, 340, 60);
  ctx.restore();
  
  // Level progress background panel
  ctx.save();
  ctx.fillStyle = 'rgba(40, 0, 60, 0.95)';
  ctx.fillRect(760, 30, 400, 50);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(760, 30, 400, 50);
  ctx.restore();
  
  // Score background panel - REMOVED
  // ctx.save();
  // ctx.fillStyle = 'rgba(0, 30, 50, 0.95)';
  // ctx.fillRect(1550, 30, 340, 50);
  // ctx.strokeStyle = '#000000';
  // ctx.lineWidth = 4;
  // ctx.strokeRect(1550, 30, 340, 50);
  // ctx.restore();
  
  // Draw health bar
  if (window.renderer && typeof window.renderer.drawHealthBar === 'function') {
    try {
      window.renderer.drawHealthBar(50, 50, 300, 30, window.player.health, window.player.maxHealth);
    } catch (error) {
      drawHealthBar(50, 50, 300, 30, window.player.health, window.player.maxHealth);
    }
  } else {
    drawHealthBar(50, 50, 300, 30, window.player.health, window.player.maxHealth);
  }
  
  // Draw lore counter - shows collected lore fragments
  if (window.lostDataSystem) {
    try {
      const loreProgress = window.lostDataSystem.getProgress();
      const loreX = 50;
      const loreY = 100;
      const loreWidth = 300;
      const loreHeight = 30;
      
      // Check if all lore has been collected for text display
      const allCollected = loreProgress.collected >= loreProgress.total && loreProgress.total > 0;
      
      // Background panel
      ctx.fillStyle = 'rgba(40, 0, 60, 0.95)';
      ctx.fillRect(loreX, loreY, loreWidth, loreHeight);
      
      // Border
      ctx.strokeStyle = '#9333ea';
      ctx.lineWidth = 2;
      ctx.strokeRect(loreX, loreY, loreWidth, loreHeight);
      
      // Lore counter text
      ctx.fillStyle = allCollected ? '#00ff00' : '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`LORE: ${loreProgress.collected}/${loreProgress.total}`, loreX + 15, loreY + loreHeight/2);
      
      // Progress bar
      const barWidth = loreWidth - 30;
      const barHeight = 4;
      const barX = loreX + 15;
      const barY = loreY + loreHeight - 8;
      const progress = loreProgress.total > 0 ? loreProgress.collected / loreProgress.total : 0;
      
      // Progress background
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      // Progress fill - green when complete
      ctx.fillStyle = allCollected ? '#00ff00' : '#9333ea';
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);
      
      // NEW: Draw "ALL LORE RETRIEVED" text under the lore counter when complete
      if (allCollected) {
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('ALL LORE RETRIEVED', loreX + 15, loreY + loreHeight + 8);
        
        // Add subtle pulsing effect
        const pulse = Math.sin(Date.now() * 0.003) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.font = '12px monospace';
        ctx.fillStyle = '#88ff88';
        ctx.fillText('All fragments collected', loreX + 15, loreY + loreHeight + 26);
        ctx.globalAlpha = 1.0;
      }
      
    } catch (error) {
      console.error('Error drawing lore counter:', error?.message || error);
    }
  }
  
  // Reset text alignment before drawing UI text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  // Draw "SIGNAL STRENGTH" label over health bar
  if (window.renderer && typeof window.renderer.drawGlowText === 'function') {
    try {
      window.renderer.drawGlowText('SIGNAL STRENGTH', 200, 40, {
        align: 'center',
        color: '#00ffff',
        size: 16
      });
    } catch (error) {
      drawGlowText('SIGNAL STRENGTH', 200, 40, {
        align: 'center',
        color: '#00ffff',
        size: 16
      });
    }
  } else {
    drawGlowText('SIGNAL STRENGTH', 200, 40, {
      align: 'center',
      color: '#00ffff',
      size: 16
    });
  }
  
  // Draw level and progression progress
  let progressText = 'SECTOR 1: THE CITY';
  
  if (window.sector1Progression) {
    const jammerStatus = window.sector1Progression.broadcastJammerDestroyed ? '✓' : '📡';
    const enemyStatus = `${window.sector1Progression.enemiesDefeated}/${window.sector1Progression.requiredEnemyKills}`;
    progressText += ` | ${jammerStatus} Jammer | ${enemyStatus} Enemies`;
  }
  // Reset text alignment before drawing UI text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  if (window.renderer && typeof window.renderer.drawGlowText === 'function') {
    try {
      window.renderer.drawGlowText(progressText, 960, 50, {
        align: 'center',
        color: '#ff00ff',
        size: 20
      });
    } catch (error) {
      drawGlowText(progressText, 960, 50, {
        align: 'center',
        color: '#ff00ff',
        size: 20
      });
    }
  } else {
    drawGlowText(progressText, 960, 50, {
      align: 'center',
      color: '#ff00ff',
      size: 20
    });
  }
  
  // Reset text alignment before drawing score
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  
  // Draw score
  if (window.renderer && typeof window.renderer.drawGlowText === 'function') {
    try {
      window.renderer.drawGlowText(`SCORE: ${window.gameState.score}`, 1920 - 200, 50, {
        align: 'right',
        color: '#00ffff',
        size: 20
      });
    } catch (error) {
      drawGlowText(`SCORE: ${window.gameState.score}`, 1920 - 200, 50, {
        align: 'right',
        color: '#00ffff',
        size: 20
      });
    }
  } else {
    drawGlowText(`SCORE: ${window.gameState.score}`, 1920 - 200, 50, {
      align: 'right',
      color: '#00ffff',
      size: 20
    });
  }
  
  // Enemy legend removed
  
  // Draw hacking interface
  if (window.hackingSystem && typeof window.hackingSystem.isActive === 'function' && window.hackingSystem.isActive()) {
    window.hackingSystem.draw(ctx);
  }
  
  // Draw rhythm UI elements only (progress bars, combo, score) - visual effects already drawn in drawGameElements
  if (window.rhythmSystem && typeof window.rhythmSystem.isActive === 'function' && window.rhythmSystem.isActive()) {
    try {
      // Draw only UI elements (4-bar progress, combo, score) - visual effects are drawn in drawGameElements
      ctx.save();
      
      // Draw 4-Bar Progress Visualization
      if (typeof window.rhythmSystem.draw4BarProgress === 'function') {
        window.rhythmSystem.draw4BarProgress(ctx);
      }
      
      // Draw beat effects only if active
      if (window.rhythmSystem.beatEffects) {
        window.rhythmSystem.beatEffects.forEach(effect => {
          ctx.strokeStyle = effect.color;
          ctx.lineWidth = 3;
          ctx.globalAlpha = effect.opacity;
          ctx.beginPath();
          ctx.arc(effect.x, effect.y, Math.max(0, effect.radius), 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      
      // Draw particles only if active
      if (window.rhythmSystem.particles) {
        window.rhythmSystem.particles.forEach(particle => {
          ctx.fillStyle = particle.color;
          ctx.globalAlpha = particle.life;
          ctx.fillRect(
            particle.x - particle.size/2,
            particle.y - particle.size/2,
            particle.size,
            particle.size
          );
        });
      }
      
      // Draw hit indicators only if active
      if (window.rhythmSystem.hitIndicators) {
        window.rhythmSystem.hitIndicators.forEach(indicator => {
          ctx.fillStyle = indicator.color;
          ctx.globalAlpha = indicator.life;
          ctx.font = `bold ${indicator.size}px Orbitron`;
          ctx.textAlign = 'center';
          ctx.fillText(indicator.text, indicator.x, indicator.y);
        });
      }
      
      // Draw UI elements only if active
      if (typeof window.rhythmSystem.drawUI === 'function') {
        window.rhythmSystem.drawUI(ctx);
      }
      
      ctx.restore();
    } catch (error) {
      console.error('Error drawing rhythm UI:', error?.message || error);
    }
  }
  
  // Particles already drawn behind ground layer in drawGameElements
  
  // Draw collection message
  if (window.gameState.collectionMessage && window.gameState.collectionMessage.timer > 0) {
    drawCollectionMessage(ctx);
  }
  
  // Draw game over screen
  if (window.gameState.gameOver) {
    drawGameOver(ctx);
  }
  
  // Victory screen removed - game continues indefinitely
  
  // CRITICAL: Draw rhythm progress even during game over (overlays)
  if (window.gameState.gameOver && window.rhythmSystem && typeof window.rhythmSystem.draw === 'function') {
    try {
      ctx.save();
      window.rhythmSystem.draw(ctx, 960, 500); // Draw at center for visibility
      ctx.restore();
    } catch (error) {
      console.error('Error drawing rhythm system during game over:', error);
    }
  }
  
  // Draw pause screen
  if (window.gameState.paused) {
    drawPauseScreen(ctx);
  }
  
  // CRITICAL FIX: ALWAYS draw objectives UI - never disable after tutorial
  // The objectives should remain visible throughout the entire game
  
  // SIMPLIFIED: Always draw objectives after tutorial completion - no complex system checks
  if (tutorialCompleted) {
    console.log('🎯 DRAWING OBJECTIVES - tutorial completed:', tutorialCompleted);
    console.log('🐛 Objectives system exists:', !!window.objectivesSystem);
    if (window.objectivesSystem) {
      console.log('🐛 Objectives system active:', window.objectivesSystem.active);
      console.log('🐛 Objectives system visible:', window.objectivesSystem.objectiveUI?.visible || 'undefined');
      console.log('🐛 Objectives system.draw function:', typeof window.objectivesSystem.draw);
    }
    
    try {
      // Try to use main objectives system first
      if (window.objectivesSystem && typeof window.objectivesSystem.draw === 'function') {
        // Force objectives system to be visible
        try {
          if (window.objectivesSystem.objectiveUI) {
            window.objectivesSystem.objectiveUI.visible = true;
          }
        } catch (error) {
          console.warn('⚠️ Failed to set objectives UI visibility in objectives draw:', error?.message || error);
        }
        window.objectivesSystem.active = true;
        window.objectivesSystem.draw(ctx);
        console.log('🎯 Main objectives system drawn successfully');
      } else {
        console.log('🎯 Main objectives system not available - using fallback');
        
        // FALLBACK: Draw basic objectives directly
        const objX = 1300;
        const objY = 120;
        const objWidth = 500;
        const objHeight = 200;
        
        // Panel background
        ctx.fillStyle = 'rgba(0, 20, 40, 0.95)';
        ctx.fillRect(objX, objY, objWidth, objHeight);
        
        // Panel border
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(objX, objY, objWidth, objHeight);
        
        // Header
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('MISSION OBJECTIVES', objX + 15, objY + 10);
        
        // Get enemy count
        let enemiesDefeated = 0;
        let requiredEnemies = 20;
        
        if (window.sector1Progression) {
          enemiesDefeated = window.sector1Progression.enemiesDefeated || 0;
          requiredEnemies = window.sector1Progression.requiredEnemyKills || 20;
        } else if (window.enemyManager) {
          enemiesDefeated = window.enemyManager.defeatedCount || 0;
        }
        
        // Enemy counter in header
        ctx.fillStyle = enemiesDefeated >= requiredEnemies ? '#00ff00' : '#ff9900';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`ENEMIES: ${enemiesDefeated}/${requiredEnemies}`, objX + objWidth - 15, objY + 12);
        
        // Draw objectives
        let yOffset = 40;
        
        // Enemy objective
        ctx.fillStyle = enemiesDefeated >= requiredEnemies ? '#00ff00' : '#ff9900';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        const enemyPrefix = enemiesDefeated >= requiredEnemies ? '✓' : '›';
        ctx.fillText(`${enemyPrefix} Defeat ${requiredEnemies} enemies`, objX + 15, objY + yOffset);
        
        ctx.fillStyle = '#cccccc';
        ctx.font = '12px monospace';
        ctx.fillText(`Progress: ${enemiesDefeated}/${requiredEnemies}`, objX + 30, objY + yOffset + 18);
        yOffset += 45;
        
        // Jammer objective (show after 20 enemies)
        if (enemiesDefeated >= requiredEnemies) {
          const jammerDestroyed = window.sector1Progression && window.sector1Progression.broadcastJammerDestroyed;
          ctx.fillStyle = jammerDestroyed ? '#00ff00' : '#ff9900';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'left';
          const jammerPrefix = jammerDestroyed ? '✓' : '›';
          ctx.fillText(`${jammerPrefix} Destroy the jammer`, objX + 15, objY + yOffset);
          
          ctx.fillStyle = jammerDestroyed ? '#00ff00' : '#cccccc';
          ctx.font = '12px monospace';
          ctx.fillText('Use rhythm attacks (R key)', objX + 30, objY + yOffset + 18);
        }
        
        // Progress bar at bottom
        const barY = objY + objHeight - 40;
        const barHeight = 20;
        const barWidth = objWidth - 60;
        const progress = Math.min(1.0, enemiesDefeated / requiredEnemies);
        
        // Progress bar background
        ctx.fillStyle = '#333333';
        ctx.fillRect(objX + 30, barY, barWidth, barHeight);
        
        // Progress fill
        if (progress >= 1.0) {
          ctx.fillStyle = '#00ff00';
        } else if (progress >= 0.5) {
          ctx.fillStyle = '#ffff00';
        } else {
          ctx.fillStyle = '#ff9900';
        }
        
        const fillWidth = barWidth * progress;
        ctx.fillRect(objX + 30, barY, fillWidth, barHeight);
        
        // Progress bar border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(objX + 30, barY, barWidth, barHeight);
        
        // Progress text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`ENEMIES DEFEATED: ${enemiesDefeated}/${requiredEnemies}`, objX + objWidth/2, barY + barHeight/2);
        
        console.log('🎯 Fallback objectives drawn successfully');
      }
      
      // CRITICAL: Disable any post-tutorial objectives system to prevent conflicts
      if (window.postTutorialObjectives) {
        window.postTutorialObjectives.active = false;
        // Note: postTutorialObjectives doesn't have objectiveUI property - removed to prevent error
      }
      
    } catch (error) {
      console.error('🎯 Error drawing objectives:', error?.message || error);
    }
  }
  
  // Draw lore messages at bottom of screen
  if (window.loreSystem && typeof window.loreSystem.draw === 'function') {
    try {
      window.loreSystem.draw(ctx);
    } catch (error) {
      console.error('Error drawing lore system:', error?.message || error);
    }
  }
  
  // Draw lost data fragments in game world (with camera transform)
  // This should be drawn with the game elements, not UI
  // Moving this to drawGameElements() function
  
  // Note: Sector 1 progression elements are updated and drawn in the main game loop
  
  // Draw jammer indicator
  if (window.jammerIndicator && typeof window.jammerIndicator.draw === 'function') {
    try {
      window.jammerIndicator.draw(ctx);
    } catch (error) {
      console.error('Error drawing jammer indicator:', error?.message || error);
    }
  }
  
  // Draw hack timeout message if exists
  if (window.hackTimeoutMessage && window.hackTimeoutMessage.timer > 0) {
    ctx.save();
    
    // Flash effect: 4 flashes over the duration
    const flashDuration = 30; // frames per flash
    const totalFlashes = 4;
    const currentFlash = Math.floor((120 - window.hackTimeoutMessage.timer) / flashDuration);
    const flashProgress = ((120 - window.hackTimeoutMessage.timer) % flashDuration) / flashDuration;
    
    // Determine opacity based on flash phase
    let alpha;
    if (currentFlash < totalFlashes) {
      // On phase: fade in for first half, fade out for second half
      if (flashProgress < 0.5) {
        alpha = flashProgress * 2; // Fade in (0 to 1)
      } else {
        alpha = 2 - flashProgress * 2; // Fade out (1 to 0)
      }
    } else {
      // After all flashes, fade out completely
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
    
    // Update timeout message timer
    window.hackTimeoutMessage.timer--;
    
    // Remove when timer expires
    if (window.hackTimeoutMessage.timer <= 0) {
      window.hackTimeoutMessage = null;
    }
  }
}

function drawGameOver(ctx) {
  // CRITICAL: Continue rhythm system updates during game over
  if (window.rhythmSystem && typeof window.rhythmSystem.update === 'function') {
    try {
      window.rhythmSystem.update(16); // Update with 16ms deltaTime (60fps)
    } catch (error) {
      console.error('Error updating rhythm system during game over:', error);
    }
  }
  
  // CRITICAL: Continue audio system updates during game over
  if (window.audioSystem && typeof window.audioSystem.updateVisualization === 'function') {
    try {
      window.audioSystem.updateVisualization();
    } catch (error) {
      console.error('Error updating audio system during game over:', error);
    }
  }
  
  // Helper function for drawing text with glow effect
  function drawGlowText(text, x, y, options = {}) {
    const size = options.size || 20;
    const color = options.color || '#ffffff';
    const align = options.align || 'center';
    
    ctx.save();
    ctx.font = `${size}px monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    
    // Draw glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    
    ctx.restore();
  }
  
  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, 1920, 1080);
  
  // Game over text
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
      window.renderer.drawGlowText('Press SPACE to restart', 960, 700, {
        size: 24,
        color: '#ffffff'
      });
    } catch (error) {
      drawGlowText('Press SPACE to restart', 960, 700, {
        size: 24,
        color: '#ffffff'
      });
    }
  } else {
    drawGlowText('Press SPACE to restart', 960, 700, {
      size: 24,
      color: '#ffffff'
    });
  }
  
  // CRITICAL: Draw rhythm progress even during game over
  if (window.rhythmSystem && typeof window.rhythmSystem.draw === 'function') {
    try {
      window.rhythmSystem.draw(ctx, 960, 500); // Draw at center for visibility
    } catch (error) {
      console.error('Error drawing rhythm system during game over:', error);
    }
  }
}

function drawPauseScreen(ctx) {
  // Helper function for drawing text with glow effect
  function drawGlowText(text, x, y, options = {}) {
    const size = options.size || 20;
    const color = options.color || '#ffffff';
    const align = options.align || 'center';
    
    ctx.save();
    ctx.font = `${size}px monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    
    // Draw glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    
    ctx.restore();
  }
  
  // Dark overlay
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

function checkGameConditions() {
  // Update collection message timer
  if (window.gameState.collectionMessage && window.gameState.collectionMessage.timer > 0) {
    window.gameState.collectionMessage.timer--;
    if (window.gameState.collectionMessage.timer <= 0) {
      window.gameState.collectionMessage = null;
    }
  }
  
  // Check if player is dead
  if (window.player.health <= 0) {
    // During tutorial, respawn player instead of game over
    if (window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive()) {
      respawnPlayerInTutorial();
    } else {
      // Normal game over outside tutorial
      window.gameState.gameOver = true;
      window.gameState.running = false;
      if (window.renderer && typeof window.renderer.addScreenShake === 'function') {
        window.renderer.addScreenShake(20, 1000);
      }
      if (window.renderer && typeof window.renderer.addGlitch === 'function') {
        window.renderer.addGlitch(1.0, 2000);
      }
    }
  }
  
  // DISABLED: Automatic level progression conflicts with Sector 1 progression
  // Sector 1 progression now handles all objectives and enemy tracking
  // Removing automatic level progression to prevent interference with broadcast jammer spawning
  
  // if (!window.tutorialSystem || typeof window.tutorialSystem.isActive !== 'function' || !window.tutorialSystem.isActive()) {
  //   const activeEnemies = window.enemyManager.getActiveEnemies().length;
  //   const totalDefeated = window.gameState.enemiesDefeated;
  //   
  //   // Check if level complete (defeated enough enemies)
  //   if (totalDefeated >= window.gameState.enemiesPerLevel && window.gameState.running) {
  //     nextLevel();
  //   }
  //   
  //   // Don't spawn from here - let enemyManager handle controlled waves
   //   // This prevents random spawning from game loop
  // }
  
  // Spawn initial enemies when tutorial is completed or if tutorial doesn't exist
  if (!window.gameState.hasSpawnedInitialEnemies) {
    const shouldSpawn = !window.tutorialSystem || 
      typeof window.tutorialSystem.isActive !== 'function' || 
      !window.tutorialSystem.isActive() || 
      window.tutorialSystem && typeof window.tutorialSystem.isCompleted === 'function' && window.tutorialSystem.isCompleted();
      
    if (shouldSpawn && window.enemyManager) {
      console.log('Tutorial completed or not active - spawning initial enemies');
      window.gameState.hasSpawnedInitialEnemies = true;
      // Spawn initial wave of enemies
      setTimeout(() => {
        for (let i = 0; i < 3; i++) {
          window.enemyManager.spawnEnemy();
        }
      }, 1000);
    }
  }
}

function respawnPlayerInTutorial() {
  // Reset player position and health - spawn from left side with entrance
  window.player.health = window.player.maxHealth;
  window.player.position = new window.Vector2D(200, 810);
  window.player.velocity = new window.Vector2D(0, 0);
  
  // Trigger entrance animation for tutorial respawn
  if (typeof window.player.startEntranceAnimation === 'function') {
    window.player.startEntranceAnimation();
  }
  
  // Add brief invulnerability
  window.player.invulnerable = true;
  setTimeout(() => {
    if (window.player) {
      window.player.invulnerable = false;
    }
  }, 2000); // 2 seconds of invulnerability
  
  // Show respawn message
  if (window.renderer && typeof window.renderer.addScreenShake === 'function') {
    window.renderer.addScreenShake(10, 500);
    // Could add a text message here if needed
  }
  if (window.tutorialSystem && window.tutorialSystem.isCompleted() && !window.gameState.hasSpawnedInitialEnemies) {
    window.gameState.hasSpawnedInitialEnemies = true;
    // Spawn initial enemies after tutorial completes
    for (let i = 0; i < 3; i++) {
      window.enemyManager.spawnEnemy();
    }
  }
}

function nextLevel() {
  // DISABLED: Level progression system conflicts with Sector 1 progression
  // Sector 1 progression now handles all enemy tracking and objectives
  // Removing this to prevent interference with broadcast jammer spawning
  
  console.log('⚠️ nextLevel() called but disabled - Sector 1 progression handles objectives');
  
  // Only update level counter for display purposes
  window.gameState.level++;
  window.gameState.score += 1000 * window.gameState.level;
  
  // Show level complete message
  const levelCtx = document.getElementById('gameCanvas')?.getContext('2d');
  if (levelCtx) {
    levelCtx.save();
    levelCtx.font = '36px monospace';
    levelCtx.textAlign = 'center';
    levelCtx.textBaseline = 'middle';
    levelCtx.shadowColor = '#00ff00';
    levelCtx.shadowBlur = 15;
    levelCtx.fillStyle = '#00ff00';
    levelCtx.fillText(`LEVEL ${window.gameState.level - 1} COMPLETE`, 960, 540);
    levelCtx.restore();
  }
  
  // DO NOT reset enemy counts - Sector 1 progression handles this
  // DO NOT heal player - only hacking puzzles should restore health
  // DO NOT spawn new wave - let Sector 1 progression control spawning
}

// Handle special game actions
window.handleGameAction = function(action) {
  switch(action) {
    case 'skip_tutorial':
      // Skip tutorial and start spawning enemies immediately
      if (window.tutorialSystem && typeof window.tutorialSystem.completeTutorial === 'function') {
        console.log('Skipping tutorial - enabling enemy spawning');
        window.tutorialSystem.completeTutorial();
        window.tutorialSystem.active = false;
      }
      // Force spawn initial enemies if not already spawned
      if (!window.gameState.hasSpawnedInitialEnemies && window.enemyManager) {
        console.log('Force spawning enemies after tutorial skip');
        window.gameState.hasSpawnedInitialEnemies = true;
        setTimeout(() => {
          for (let i = 0; i < 3; i++) {
            window.enemyManager.spawnEnemy();
          }
        }, 500);
      }
      break;
      
    case 'force_objectives':
      // DEBUG: Force objectives to appear regardless of tutorial state
      console.log('🎯 DEBUG: Forcing objectives to appear!');
      window.objectivesShownAfterTutorial = true;
      if (window.tutorialSystem) {
        window.tutorialSystem.completed = true;
        window.tutorialSystem.active = false;
      }
      break;
      
    case 'spawn_jammer':
      // DEBUG: Force spawn jammer immediately
      console.log('🔧 DEBUG: Force spawning jammer immediately!');
      if (window.sector1Progression && typeof window.sector1Progression.revealJammer === 'function') {
        window.sector1Progression.revealJammer();
        console.log('✅ Jammer force-spawned via debug command');
      } else {
        console.error('❌ Sector 1 progression not available');
      }
      break;
    case 'hack':
      if ((!window.hackingSystem || typeof window.hackingSystem.isActive !== 'function' || !window.hackingSystem.isActive()) && 
          (!window.rhythmSystem || typeof window.rhythmSystem.isActive !== 'function' || !window.rhythmSystem.isActive())) {
        if (typeof window.hackingSystem.start === 'function') {
          window.hackingSystem.start();
        }
        // Track tutorial objective
        if (window.tutorialSystem && window.tutorialSystem.isActive()) {
          if (typeof window.tutorialSystem.checkObjective === 'function') {
            window.tutorialSystem.checkObjective('hack_start');
          }
        }
      }
      break;
      
    case 'rhythm':
      if ((!window.hackingSystem || typeof window.hackingSystem.isActive !== 'function' || !window.hackingSystem.isActive()) && 
          (!window.rhythmSystem || typeof window.rhythmSystem.isActive !== 'function' || !window.rhythmSystem.isActive())) {
        // CRITICAL: NEVER restart rhythm system - only show visual elements
        // The rhythm system runs continuously in the background
        if (typeof window.rhythmSystem.show === 'function') {
          window.rhythmSystem.show(); // Just show visual elements, don't restart timing
          console.log('🎵 CRITICAL: Rhythm mode activated - preserving continuous beat timing');
        } else if (typeof window.rhythmSystem.showRhythmMode === 'function') {
          window.rhythmSystem.showRhythmMode();
        }
        // Track tutorial objective
        if (window.tutorialSystem && window.tutorialSystem.isActive()) {
          if (typeof window.tutorialSystem.checkObjective === 'function') {
            window.tutorialSystem.checkObjective('rhythm_start');
          }
        }
      }
      break;
      
    case 'jump':
      if ((!window.hackingSystem || typeof window.hackingSystem.isActive !== 'function' || !window.hackingSystem.isActive()) && 
          (!window.rhythmSystem || typeof window.rhythmSystem.isActive !== 'function' || !window.rhythmSystem.isActive())) {
        window.player.jump();
      }
      break;
      
    case 'pause':
      if (window.gameState.running && !window.gameState.gameOver) {
        window.gameState.paused = !window.gameState.paused;
      }
      break;
      
    case 'restart':
      console.log('handleGameAction restart - gameOver:', window.gameState.gameOver, 'victory:', window.gameState.victory);
      if (window.gameState.gameOver || window.gameState.victory) {
        console.log('Restart conditions met, calling startGame');
        console.log('🎵 CRITICAL: Game restart - rhythm system will preserve beat timing');
        window.startGame();
      } else {
        console.log('Restart conditions not met');
      }
      break;
  }
};

// Global error handler
window.addEventListener('error', function(event) {
  // Prevent error logging loops for known handled errors
  if (event.message && event.message.includes('Cannot read properties of undefined (reading \'clear\')')) {
    // This error is now handled with fallbacks - suppress console spam
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

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(event) {
  // Prevent promise rejection logging loops for known handled rejections
  if (event.reason && event.reason.message) {
    // Filter out common permissions and fullscreen errors that are expected
    if (event.reason.message.includes('permission') || 
        event.reason.message.includes('Permission') ||
        event.reason.message.includes('fullscreen') ||
        event.reason.message.includes('Fullscreen')) {
      console.log('Expected permission/fullscreen rejection:', event.reason.message);
      event.preventDefault(); // Prevent default browser error logging
      return false;
    }
  }
  
  console.error('[GlobalErrorHandler] Unhandled promise rejection:', {
    reason: event.reason,
    stack: event.reason?.stack || 'No stack available',
    type: typeof event.reason
  });
  
  // Prevent the default unhandled rejection warning
  event.preventDefault();
  return false;
});

// Initialize game when ready - Only define ONCE
window.initGame = function() {
  // CRITICAL: Do NOT auto-start - wait for start button
  if (window.autoStartDisabled) {
    console.log('🛑 Auto-start disabled - waiting for start button');
    return;
  }
  
  console.log('=== AUTO INITIALIZING GAME (LEGACY MODE) ===');
  
  // Enable debug hitbox visualization
  window.DEBUG_HITBOXES = true;
  console.log('✓ Debug hitboxes enabled');
  
  // Start game initialization sequence
  window.startGameInitialization();
};

// New initialization function that starts from button
window.startGameInitialization = async function() {
  console.log('=== INITIALIZING GAME SYSTEMS ===');
  
  // Enable debug hitbox visualization
  window.DEBUG_HITBOXES = true;
  console.log('✓ Debug hitboxes enabled');
  
  try {
    // Initialize sprites first
    console.log('Loading sprites...');
    await window.initSprites();
    console.log('✓ Sprite initialization complete');
    
    // Initialize space ship system
    console.log('Initializing space ship system...');
    window.initSpaceShips();
    console.log('✓ Space ship system initialized');
    
    // Initialize lore system
    console.log('Initializing lore system...');
    window.initLore();
    console.log('✓ Lore system initialized');
    
    // Broadcast jammer system is initialized separately
    
    // Initialize Broadcast Jammer System
    console.log('Initializing Broadcast Jammer System...');
    if (window.BroadcastJammerSystem && typeof window.BroadcastJammerSystem.init === 'function') {
      window.BroadcastJammerSystem.init();
      console.log('✓ Broadcast Jammer System initialized successfully');
      
      // Normal jammer spawning - disabled auto-spawn for testing
      // Jammer will spawn when tutorial completes and enemy quota is met
    } else {
      console.warn('⚠️ Broadcast Jammer System not available');
    }
    
    // Initialize jammer indicator system
    console.log('Initializing jammer indicator system...');
    if (typeof window.initJammerIndicator === 'function') {
      const jammerIndicatorInitialized = window.initJammerIndicator();
      if (jammerIndicatorInitialized) {
        console.log('✓ Jammer indicator system initialized successfully');
      } else {
        console.warn('⚠️ Jammer indicator system initialization failed');
      }
    } else {
      console.warn('⚠️ initJammerIndicator function not found');
    }
    
    // FORCE INIT LOST DATA SYSTEM REGARDLESS OF PLAYER
    console.log('🔥 FORCE INITIALIZING LOST DATA SYSTEM...');
    try {
      window.initLostData(window.player || null);
      console.log('✅ Lost data system FORCE initialized');
      
      // Normal spawning will handle fragments - no forced spawning needed
    } catch (error) {
      console.error('FAILED TO FORCE INIT LOST DATA:', error);
    }
    
    // Initialize Sector 1 progression system
    console.log('Initializing Sector 1 progression system...');
    if (window.player && typeof window.initSector1Progression === 'function') {
      window.initSector1Progression(window.player);
      console.log('✓ Sector 1 progression system initialized');
    } else {
      console.warn('Player not available for Sector 1 progression initialization');
    }
    
    // CRITICAL: Initialize objectives system - ALWAYS ACTIVE
    console.log('Initializing objectives system...');
    if (typeof window.initObjectives === 'function') {
      window.initObjectives();
      console.log('✓ Objectives system initialized');
      
      // CRITICAL: Force objectives to be visible immediately
      if (window.objectivesSystem) {
        if (window.objectivesSystem.objectiveUI) {
          window.objectivesSystem.objectiveUI.visible = true;
        }
        window.objectivesSystem.active = true; // Force active state
        console.log('✅ Objectives system forced visible on initialization');
      }
    }
    
    // Initialize audio system
    console.log('Initializing audio system...');
    await window.initAudio();
    console.log('✓ Audio initialization complete');
    
    // CRITICAL: Do NOT start rhythm system during initialization
    // Rhythm system will start simultaneously with music after cutscene intro
    console.log('✓ Rhythm system waiting - will start with music after cutscene');
    
    // Test character loading
    setTimeout(() => {
      window.testCharacterLoading();
    }, 2000);
    
    console.log('✓ All systems initialized successfully');
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    throw error;
  }
};

// Test character loading function
window.testCharacterLoading = function() {
  if (window.MakkoEngine && window.MakkoEngine.isLoaded()) {
    console.log('=== TESTING CHARACTER LOADING ===');
    
    const characters = ['6_bit_main', 'virus_virus', 'corrupted_corrupted', 'firewall_firewall'];
    
    characters.forEach(charName => {
      const sprite = window.MakkoEngine.sprite(charName);
      if (sprite && sprite.isLoaded()) {
        console.log(`✅ ${charName} character loaded successfully`);
        console.log(`Available animations:`, sprite.getAvailableAnimations());
      } else {
        console.error(`❌ ${charName} character failed to load`);
      }
    });
  }
};

// DEBUG: Global debug commands for troubleshooting
window.DEBUG = {
  // Force spawn jammer immediately
  spawnJammer: function() {
    console.log('🔧 DEBUG: Force spawning jammer via DEBUG.spawnJammer()');
    if (window.sector1Progression && typeof window.sector1Progression.revealJammer === 'function') {
      // Force enemy count to meet requirement
      window.sector1Progression.enemiesDefeated = 20;
      window.sector1Progression.revealJammer();
      return '✅ Jammer force-spawned successfully (set enemy count to 20)';
    } else {
      console.error('❌ Sector 1 progression not available');
      return '❌ Failed to spawn jammer - sector progression not available';
    }
  },
  
  // Simple jammer status check
  checkStatus: function() {
    if (!window.sector1Progression) {
      console.error('❌ Sector 1 progression not available');
      return null;
    }
    
    const status = {
      enemiesDefeated: window.sector1Progression.enemiesDefeated || 0,
      requiredEnemies: window.sector1Progression.requiredEnemyKills || 20,
      jammerRevealed: window.sector1Progression.jammerRevealed || false,
      jammerActive: window.sector1Progression.jammerActive || false,
      jammerExists: !!window.sector1Progression.broadcastJammer,
      jammerHealth: window.sector1Progression.broadcastJammer?.health || 0
    };
    
    console.log('📡 Jammer Status:', status);
    return status;
  },
  
  // Check jammer status
  checkJammer: function() {
    if (!window.sector1Progression) {
      return '❌ Sector 1 progression not available';
    }
    
    const status = {
      revealed: window.sector1Progression.jammerRevealed,
      active: window.sector1Progression.jammerActive,
      broadcastJammerExists: !!window.sector1Progression.broadcastJammer,
      jammerActive: window.sector1Progression.broadcastJammer?.active || false,
      jammerPosition: window.sector1Progression.broadcastJammer?.position || null,
      jammerHealth: window.sector1Progression.broadcastJammer?.health || 0,
      enemiesDefeated: window.sector1Progression.enemiesDefeated || 0,
      requiredEnemies: window.sector1Progression.requiredEnemyKills || 20
    };
    
    console.log('📡 Jammer Status:', status);
    return status;
  },
  
  // Force destroy jammer
  destroyJammer: function() {
    if (!window.sector1Progression || !window.sector1Progression.broadcastJammer) {
      return '❌ No jammer to destroy';
    }
    
    window.sector1Progression.broadcastJammer.destroy();
    return '✅ Jammer destroyed';
  },
  
  // Test rhythm hit on jammer
  testRhythmHit: function() {
    if (!window.BroadcastJammerSystem || !window.BroadcastJammerSystem.jammer) {
      return '❌ No jammer to test rhythm hit on';
    }
    
    if (typeof window.BroadcastJammerSystem.onRhythmHit === 'function') {
      window.BroadcastJammerSystem.onRhythmHit();
      return '✅ Rhythm hit test successful';
    } else {
      return '❌ Jammer does not have onRhythmHit method';
    }
  }
};

// CLEAN BROADCAST JAMMER DEBUG COMMANDS
console.log('🔧 CLEAN JAMMER DEBUG commands available:');
console.log('  BroadcastJammerSystem.forceSpawn(x, y) - Force spawn clean jammer');
console.log('  BroadcastJammerSystem.getStatus() - Check clean jammer status');
console.log('  BroadcastJammerSystem.destroy() - Destroy clean jammer');
console.log('  DEBUG.spawnCleanJammer() - Force spawn clean jammer');
console.log('  DEBUG.checkCleanJammer() - Check clean jammer status');

// Enhanced jammer status command
window.CHECK_JAMMER_STATUS = function() {
  if (!window.sector1Progression) {
    console.error('❌ Sector 1 progression not available');
    return;
  }
  
  const status = {
    enemiesDefeated: window.sector1Progression.enemiesDefeated || 0,
    requiredEnemies: window.sector1Progression.requiredEnemyKills || 20,
    jammerRevealed: window.sector1Progression.jammerRevealed || false,
    jammerActive: window.sector1Progression.jammerActive || false,
    jammerExists: !!window.sector1Progression.broadcastJammer,
    jammerHealth: window.sector1Progression.broadcastJammer?.health || 0,
    jammerPosition: window.sector1Progression.broadcastJammer?.position || null,
    tutorialActive: window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive(),
    tutorialCompleted: window.tutorialSystem && typeof window.tutorialSystem.isCompleted === 'function' && window.tutorialSystem.isCompleted()
  };
  
  console.log('📡 COMPLETE JAMMER STATUS:');
  console.log('  Enemies defeated:', `${status.enemiesDefeated}/${status.requiredEnemies}`);
  console.log('  Jammer revealed:', status.jammerRevealed);
  console.log('  Jammer active:', status.jammerActive);
  console.log('  Jammer exists:', status.jammerExists);
  console.log('  Jammer health:', status.jammerHealth);
  console.log('  Tutorial active:', status.tutorialActive);
  console.log('  Tutorial completed:', status.tutorialCompleted);
  
  if (status.jammerExists) {
    console.log('  Jammer position:', `(${status.jammerPosition?.x || 0}, ${status.jammerPosition?.y || 0})`);
  }
  
  return status;
};

console.log('🔧 DEBUG commands available:');
console.log('  DEBUG.spawnJammer() - Force jammer spawn immediately');
console.log('  DEBUG.checkJammer() - Check jammer status and conditions');
console.log('  DEBUG.destroyJammer() - Destroy current jammer');
  console.log('  DEBUG.testRhythmHit() - Test rhythm hit on jammer');

// Make debug commands available globally
window.DEBUG = window.DEBUG || {};

// CLEAN jammer debug commands
window.DEBUG.spawnCleanJammer = function() {
  console.log('🔧 DEBUG: Force spawning CLEAN jammer');
  if (window.BroadcastJammerSystem && typeof window.BroadcastJammerSystem.forceSpawn === 'function') {
    window.BroadcastJammerSystem.forceSpawn(2800, 750);
    console.log('✅ CLEAN jammer force-spawned successfully');
    return '✅ CLEAN jammer force-spawned successfully';
  } else {
    console.error('❌ Broadcast jammer system not available');
    return '❌ Failed to spawn clean jammer - broadcast system not available';
  }
};

window.DEBUG.checkCleanJammer = function() {
  if (window.BroadcastJammerSystem && typeof window.BroadcastJammerSystem.getStatus === 'function') {
    const status = window.BroadcastJammerSystem.getStatus();
    console.log('📡 CLEAN jammer status:', status);
    return status;
  } else {
    console.error('❌ Broadcast jammer system not available');
    return null;
  }
};

// Legacy debug commands (redirect to clean system)
window.DEBUG.spawnJammer = window.DEBUG.spawnCleanJammer;
window.DEBUG.checkJammer = window.DEBUG.checkCleanJammer;

// CLEAN JAMMER EMERGENCY SPAWN - uses new system
window.EMERGENCY_JAMMER_SPAWN = function() {
  console.log('🚨 EMERGENCY JAMMER SPAWN - Using clean broadcast system!');
  if (window.BroadcastJammerSystem && typeof window.BroadcastJammerSystem.forceSpawn === 'function') {
    return window.BroadcastJammerSystem.forceSpawn(2800, 750);
  } else {
    console.error('❌ Broadcast jammer system not available');
    return null;
  }
};

window.ULTIMATE_JAMMER_SPAWN = window.EMERGENCY_JAMMER_SPAWN; // Alias for compatibility

window.DEBUG.checkJammer = function() {
  return window.CHECK_JAMMER_STATUS();
};

window.DEBUG.destroyJammer = function() {
  if (!window.sector1Progression || !window.sector1Progression.broadcastJammer) {
    return '❌ No jammer to destroy';
  }
  
  window.sector1Progression.broadcastJammer.destroy();
  return '✅ Jammer destroyed';
};

window.DEBUG.testRhythmHit = function() {
  if (!window.BroadcastJammerSystem || !window.BroadcastJammerSystem.jammer) {
    return '❌ No jammer to test rhythm hit on';
  }
  
  if (typeof window.BroadcastJammerSystem.onRhythmHit === 'function') {
    window.BroadcastJammerSystem.onRhythmHit();
    console.log('✅ Rhythm hit test successful');
    return '✅ Rhythm hit test successful';
  } else {
    return '❌ Jammer does not have onRhythmHit method';
  }
}

// Reset render context cache for error recovery
window.resetRenderContext = function() {
  console.log('Resetting render context cache');
  renderCanvas = null;
  renderContext = null;
  contextCreationAttempts = 0;
};

// Enemy legend function removed

// Victory screen
function drawCollectionMessage(ctx) {
  const message = window.gameState.collectionMessage;
  if (!message || message.timer <= 0) return;
  
  ctx.save();
  
  // Calculate fade out for last second
  let alpha = 1.0;
  if (message.timer < 60) { // Last second
    alpha = message.timer / 60;
  }
  
  // Flash effect for first half second
  let scale = 1.0;
  if (message.timer > 150) { // First half second
    scale = 1.0 + Math.sin((180 - message.timer) * 0.3) * 0.1;
  }
  
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${Math.floor(36 * scale)}px 'Orbitron', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Draw background panel
  const padding = 30;
  const textMetrics = ctx.measureText(message.text);
  const boxWidth = textMetrics.width + padding * 2;
  const boxHeight = 60;
  const boxX = (1920 - boxWidth) / 2;
  const boxY = 200;
  
  // Background
  ctx.fillStyle = 'rgba(0, 20, 40, 0.9)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  
  // Border
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  
  // Text with glow
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(message.text, 960, boxY + boxHeight / 2);
  
  ctx.restore();
}

function drawLorePendingMessage(ctx) {
  const message = window.gameState.lorePendingMessage;
  if (!message || message.timer <= 0) return;
  
  ctx.save();
  
  // Calculate fade out for last second
  let alpha = 1.0;
  if (message.timer < 60) { // Last second
    alpha = message.timer / 60;
  }
  
  // Pulse effect for lore processing
  let scale = 1.0;
  const pulsePhase = (120 - message.timer) / 60; // 2 second pulse cycle
  scale = 1.0 + Math.sin(pulsePhase * Math.PI * 2) * 0.05; // 5% pulse
  
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${Math.floor(24 * scale)}px 'Orbitron', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Draw background panel
  const padding = 25;
  const textMetrics = ctx.measureText(message.text);
  const boxWidth = textMetrics.width + padding * 2;
  const boxHeight = 50;
  const boxX = (1920 - boxWidth) / 2;
  const boxY = 300; // Different position from collection message
  
  // Background with purple tint for lore
  ctx.fillStyle = 'rgba(40, 0, 60, 0.9)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  
  // Border with purple/cyan
  const borderPulse = Math.sin(pulsePhase * Math.PI * 2) * 0.5 + 0.5;
  ctx.strokeStyle = `rgba(147, 51, 234, ${0.5 + borderPulse * 0.5})`; // Purple pulse
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  
  // Text with purple glow
  ctx.shadowColor = '#9333ea';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(message.text, 960, boxY + boxHeight / 2);
  
  // Add small indicator text about delay
  ctx.font = '14px monospace';
  ctx.fillStyle = 'rgba(147, 51, 234, 0.8)';
  ctx.textAlign = 'center';
  ctx.fillText('Processing fragment data...', 960, boxY + boxHeight + 20);
  
  ctx.restore();
}

// drawVictory function removed - game continues indefinitely

// Only auto-initialize if not disabled
if (!window.autoStartDisabled) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(window.initGame, 100);
    });
  } else {
    setTimeout(window.initGame, 100);
  }
} else {
  console.log('🛑 Auto-initialization disabled - waiting for start button');
}