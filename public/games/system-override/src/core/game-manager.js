// Game state management for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/core/game-manager.js',
  exports: ['gameManager', 'updateGameLogic', 'checkWinConditions', 'startNewGame'],
  dependencies: ['player', 'enemyManager', 'rhythmSystem', 'hackingSystem', 'objectivesSystem']
});

window.gameManager = {
  // Game state
  state: {
    running: false,
    paused: false,
    gameOver: false,
    victory: false,
    level: 1,
    score: 0,
    gameTime: 0,
    enemiesDefeated: 0,
    hasSpawnedInitialEnemies: false
  },
  
  // Start new game
  startNewGame() {
    console.log('=== STARTING NEW GAME ===');
    
    this.state.running = true;
    this.state.paused = false;
    this.state.gameOver = false;
    this.state.victory = false;
    this.state.level = 1;
    this.state.score = 0;
    this.state.gameTime = 0;
    
    // Reset systems
    this.resetPlayer();
    this.resetEnemies();
    this.resetObjectives();
    
    // Start game using main game controller
    if (typeof window.startGame === 'function') {
      window.startGame();
    } else if (typeof window.startGameLoop === 'function') {
      console.warn('Main game startGame not available, using loop startGameLoop');
      window.startGameLoop();
    } else {
      console.error('No game start function available');
    }
  },
  
  // Update core game logic
  updateGameLogic(deltaTime) {
    if (!this.state.running || this.state.paused) return;
    
    const dt = deltaTime / 1000;
    this.state.gameTime += deltaTime;
    
    // Update player
    this.updatePlayer(dt);
    
    // Update enemies
    this.updateEnemies(dt);
    
    // Update systems
    this.updateSystems(dt);
    
    // Check win conditions
    this.checkWinConditions();
  },
  
  // Reset player state
  resetPlayer() {
    if (window.player) {
      window.player.health = window.player.maxHealth;
      window.player.position = new window.Vector2D(200, 500);
      window.player.velocity = new window.Vector2D(0, 0);
      
      // Start entrance animation
      if (typeof window.player.startEntranceAnimation === 'function') {
        window.player.startEntranceAnimation();
      }
    }
  },
  
  // Reset enemy state
  resetEnemies() {
    if (window.enemyManager) {
      window.enemyManager.clear();
      this.state.enemiesDefeated = 0;
      this.state.hasSpawnedInitialEnemies = false;
    }
  },
  
  // Reset objectives system
  resetObjectives() {
    if (window.objectivesSystem) {
      window.objectivesSystem.reset();
    }
  },
  
  // Update player logic
  updatePlayer(dt) {
    if (!window.player) return;
    
    const allowMovement = !window.hackingSystem?.isActive() && !window.rhythmSystem?.isActive();
    
    if (window.player.update) {
      window.player.update(dt, allowMovement);
    }
  },
  
  // Update enemy logic
  updateEnemies(dt) {
    if (!window.enemyManager) return;
    
    const tutorialActive = window.tutorialSystem?.isActive();
    const isTutorialCompleted = window.tutorialSystem?.isCompleted();
    const shouldUpdateEnemies = !tutorialActive || isTutorialCompleted;
    
    if (shouldUpdateEnemies && window.enemyManager.update) {
      window.enemyManager.update(dt, window.player);
      window.enemyManager.checkCollisions(window.player);
      // Rhythm attacks only called from input.js on actual down arrow presses
    }
  },
  
  // Update all game systems
  updateSystems(dt) {
    // Update rhythm system
    if (window.rhythmSystem && window.rhythmSystem.update) {
      window.rhythmSystem.update(dt);
    }
    
    // Update hacking system
    if (window.hackingSystem && window.hackingSystem.update) {
      window.hackingSystem.update(dt);
    }
    
    // Update audio system
    if (window.audioSystem && window.audioSystem.updateVisualization) {
      window.audioSystem.updateVisualization();
    }
    
    // Update particle system
    if (window.particleSystem && window.particleSystem.update) {
      window.particleSystem.update(dt);
    }
  },
  
  // Check win conditions
  checkWinConditions() {
    if (this.state.gameOver) return;
    
    const tutorialActive = window.tutorialSystem?.isActive();
    const tutorialCompleted = window.tutorialSystem?.isCompleted();
    
    // Game over condition
    if (window.player && window.player.health <= 0) {
      if (tutorialActive) {
        this.handleTutorialGameOver();
      } else {
        this.handleGameOver();
      }
    }
    
    // Victory condition
    if (this.state.victory) {
      this.handleVictory();
    }
  },
  
  // Handle game over in tutorial
  handleTutorialGameOver() {
    this.state.gameOver = true;
    this.state.running = false;
    
    // Respawn player with entrance animation
    if (window.player) {
      this.resetPlayer();
    }
    
    // Continue tutorial
    if (window.tutorialSystem) {
      window.tutorialSystem.handlePlayerDeath();
    }
  },
  
  // Handle regular game over
  handleGameOver() {
    this.state.gameOver = true;
    this.state.running = false;
    
    // Preserve completed objectives on game over
    if (window.objectivesSystem && typeof window.objectivesSystem.onGameOver === 'function') {
      window.objectivesSystem.onGameOver();
    }
    
    // Play game over effects
    if (window.renderer && window.renderer.addScreenShake) {
      window.renderer.addScreenShake(20, 1000);
    }
    
    if (window.renderer && window.renderer.addGlitch) {
      window.renderer.addGlitch(1.0, 2000);
    }
  },
  
  // Handle victory
  handleVictory() {
    this.state.victory = true;
    this.state.running = false;
    
    if (window.renderer) {
      window.renderer.addScreenShake(15, 800);
    }
  },
  
  // Get current game state
  getState() {
    return this.state;
  },
  
  // Check if player is dead
  isPlayerDead() {
    return window.player && window.player.health <= 0;
  }
};