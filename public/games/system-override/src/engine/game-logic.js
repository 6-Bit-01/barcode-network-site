// Core game logic separation from main game controller
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/game-logic.js',
  exports: ['updateLogic', 'handleCollisions', 'handleRhythmAttacks'],
  dependencies: ['Vector2D', 'distance', 'clamp']
});

// Separated collision system
window.handleCollisions = function() {
  const player = window.player;
  if (!player) return;
  
  const playerHitbox = player.getHitbox();
  
  // Enemy collisions
  if (window.enemyManager) {
    window.enemyManager.checkCollisions(player);
  }
  
  // Projectile collisions
  if (window.projectileManager) {
    window.projectileManager.checkPlayerCollisions(player);
  }
  
  // Obstacle collisions
  if (window.obstacleManager) {
    window.obstacleManager.checkPlayerCollisions(player);
  }
};

// Separated rhythm attack handling
window.handleRhythmAttacks = function(rhythmResult) {
  if (!rhythmResult || !rhythmResult.hit) return;
  
  // Damage all enemies in range
  if (window.enemyManager) {
    window.enemyManager.handleRhythmAttack(window.player, rhythmResult);
  }
  
  // Apply visual feedback
  if (window.particleSystem) {
    window.particleSystem.createRhythmEffect(window.player.position.x, window.player.position.y, rhythmResult.timing);
  }
};

// Main update logic
window.updateLogic = function(deltaTime) {
  const dt = deltaTime / 1000;
  
  // Update all game systems
  if (window.gameManager) {
    window.gameManager.updateGameLogic(deltaTime);
  }
  
  // System-specific updates
  if (window.audioSystem) {
    window.audioSystem.updateLayers();
  }
  
  // Update world bounds
  updateWorldBounds();
};

// Update world boundaries and constraints
function updateWorldBounds() {
  if (!window.player) return;
  
  // World boundaries (4096px wide world)
  const worldLeft = 50;
  const worldRight = 4096 - 50;
  
  // Clamp player position
  window.player.position.x = window.clamp(window.player.position.x, worldLeft, worldRight);
  window.player.position.y = window.clamp(window.player.position.y, 50, 1030);
}