// Game state management for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/game-state.js',
  exports: ['gameState', 'initGameState', 'checkGameConditions'],
  dependencies: ['Vector2D']
});

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
  enemiesPerLevel: 10,
  collectionMessage: null,
  lorePendingMessage: null
};

window.initialEnemySpawnHandle = null;
window.initialEnemySpawnGeneration = 0;

window.cancelInitialEnemySpawn = function() {
  window.initialEnemySpawnGeneration++;
  if (window.initialEnemySpawnHandle) {
    clearTimeout(window.initialEnemySpawnHandle);
    window.initialEnemySpawnHandle = null;
  }
};

window.getInitialEnemySpawnDiagnostics = function() {
  return { pending: !!window.initialEnemySpawnHandle, generation: window.initialEnemySpawnGeneration };
};

window.getCurrentRunDefeats = function() {
  const count = window.enemyManager && Number.isFinite(window.enemyManager.defeatedCount) ? window.enemyManager.defeatedCount : 0;
  if (window.gameState) window.gameState.enemiesDefeated = count;
  if (window.sector1Progression) window.sector1Progression.enemiesDefeated = count;
  return count;
};

window.syncEnemyDefeatProjections = function(count) {
  const projected = Number.isFinite(count) ? count : window.getCurrentRunDefeats();
  if (window.gameState) window.gameState.enemiesDefeated = projected;
  if (window.sector1Progression) window.sector1Progression.enemiesDefeated = projected;
  return projected;
};

window.resetRuntimeTerminalFlags = function() {
  if (!window.gameState) return;
  window.gameState.gameOver = false;
  window.gameState.victory = false;
  window.gameState.running = true;
  window.gameState.paused = false;
};

window.initGameState = function() {
  try {
    if (!window.gameState) window.gameState = {};
    window.gameState.running = true;
    window.gameState.paused = false;
    window.gameState.gameOver = false;
    window.gameState.victory = false;
    window.gameState.level = 1;
    window.gameState.score = 0;
    window.gameState.gameTime = 0;
    window.gameState.hasSpawnedInitialEnemies = false;
    window.gameState.enemiesDefeated = 0;
    window.gameState.collectionMessage = null;
    window.gameState.lorePendingMessage = null;
    console.log('✓ Game state initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing game state:', error?.message || error?.toString() || 'Unknown error');
    console.error('Game state init error stack:', error?.stack || 'No stack available');
    throw new Error(`Game state initialization failed: ${error?.message || 'Unknown error'}`);
  }
};

window.restoreProgress = function() {
  window.syncEnemyDefeatProjections();
  return false;
};

window.checkGameConditions = function() {
  if (window.gameState.collectionMessage && window.gameState.collectionMessage.timer > 0) {
    window.gameState.collectionMessage.timer--;
    if (window.gameState.collectionMessage.timer <= 0) window.gameState.collectionMessage = null;
  }

  if (window.gameState.lorePendingMessage && window.gameState.lorePendingMessage.timer > 0) {
    window.gameState.lorePendingMessage.timer--;
    if (window.gameState.lorePendingMessage.timer <= 0) window.gameState.lorePendingMessage = null;
  }

  window.syncEnemyDefeatProjections();

  if (window.player.health <= 0 && !window.gameState.gameOver && !window.gameState.victory) {
    if (window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive()) {
      respawnPlayerInTutorial();
    } else {
      window.BARCODE?.Campaign?.handleDeath();
      window.gameState.gameOver = true;
      window.gameState.running = false;
      if (window.renderer && typeof window.renderer.addScreenShake === 'function') window.renderer.addScreenShake(20, 1000);
      if (window.renderer && typeof window.renderer.addGlitch === 'function') window.renderer.addGlitch(1.0, 2000);
    }
  }

  if (window.sector1Progression && window.sector1Progression.shouldSuppressGenericSpawning && window.sector1Progression.shouldSuppressGenericSpawning()) { window.gameState.hasSpawnedInitialEnemies = true; }

  if (!window.gameState.hasSpawnedInitialEnemies) {
    const shouldSpawn = !window.tutorialSystem ||
      typeof window.tutorialSystem.isActive !== 'function' ||
      !window.tutorialSystem.isActive() ||
      (window.tutorialSystem && typeof window.tutorialSystem.isCompleted === 'function' && window.tutorialSystem.isCompleted());

    if (shouldSpawn && window.enemyManager) {
      console.log('Tutorial completed or not active - spawning initial enemies');
      window.gameState.hasSpawnedInitialEnemies = true;
      window.cancelInitialEnemySpawn();
      const spawnGeneration = window.initialEnemySpawnGeneration;
      window.initialEnemySpawnHandle = setTimeout(() => {
        window.initialEnemySpawnHandle = null;
        if (spawnGeneration !== window.initialEnemySpawnGeneration || !window.gameState || window.gameState.gameOver || !window.gameState.running) return;
        let firewallSpawned = false;
        for (let i = 0; i < 3; i++) {
          const currentFirewallCount = window.enemyManager.enemies.filter(e => e.type === 'firewall' && e.active).length;
          if (currentFirewallCount >= 1 || firewallSpawned) {
            const types = ['virus', 'corrupted'];
            const type = types[Math.floor(Math.random() * types.length)];
            let x, y = 200;
            if (type === 'virus') { x = -50 + Math.random() * 100; y = -50 + Math.random() * 50; }
            else { x = Math.random() > 0.5 ? 100 : 3900; }
            const enemy = new window.Enemy(x, y, type);
            if (type === 'virus') {
              enemy._dropEdge = 'top'; enemy.entranceComplete = false; enemy.state = 'entrance';
              enemy.velocity.x = 50 + Math.random() * 30; enemy.velocity.y = 120 + Math.random() * 30; enemy.isOnGround = false;
            }
            window.enemyManager.enemies.push(enemy);
          } else {
            window.enemyManager.spawnEnemy();
            if (window.enemyManager.enemies.some(e => e.type === 'firewall' && e.active)) firewallSpawned = true;
          }
        }
      }, 1000);
    }
  }
};

function respawnPlayerInTutorial() {
  window.player.health = window.player.maxHealth;
  window.player.hudReaction = null;
  window.player.cancelEntranceAnimation?.();
  window.player.position = new window.Vector2D(200, window.Player.GROUND_Y);
  window.player.velocity = new window.Vector2D(0, 0);
  window.player.grounded = true;
  window.player.invulnerable = true;
  setTimeout(() => { if (window.player) window.player.invulnerable = false; }, 2000);
  if (window.renderer && typeof window.renderer.addScreenShake === 'function') window.renderer.addScreenShake(10, 500);
}
