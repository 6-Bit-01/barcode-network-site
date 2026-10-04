// Lost Data fragments system for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/lost-data.js',
  exports: ['LostDataSystem', 'lostDataSystem', 'initLostData'],
  dependencies: ['Vector2D', 'distance', 'clamp', 'randomRange', 'BARCODE.LoreCollection', 'BARCODE.LoreRecords']
});

window.LostDataSystem = class LostDataSystem {
  constructor() {
    this.fragments = [];
    this.collectedLore = new Set(); // Stable IDs found during this level attempt.
    this.archive = new window.BARCODE.LoreCollection();
    this.maxFragments = 3;
    this.maxTotalLore = 3;
    this.player = null;
    this.authoredLevel1Placements = [
      { id: 'signal-awning-fragment', loreId: 'lore.l01.01', x: 980, y: 450, surfaceY: 492, unlockKills: 4 },
      { id: 'middle-roof-fragment', loreId: 'lore.l01.02', x: 2220, y: 316, surfaceY: 358, unlockKills: 9 },
      { id: 'upper-route-fragment', loreId: 'lore.l01.03', x: 3460, y: 460, surfaceY: 502, unlockKills: 14 }
    ].map(record => ({ ...record, text: window.BARCODE.LoreRecords.preview(record.loreId) }));
  }
  init(player) { this.player = player; }
  isBlocked() {
    return !!(window.tutorialSystem?.isActive?.() || window.isPaused || window.gameState?.paused ||
      window.gameState?.gameOver || window.gameState?.victory || window.sector1Progression?.isGameplaySuppressed?.());
  }
  update(deltaTime) {
    if (this.isBlocked()) return;
    this.player = window.player || this.player;
    if (!this.player) return;
    // All unlocked records remain available together. Waiting and collection
    // order cannot hide another record from a fast or exploratory run.
    for (const placement of this.authoredLevel1Placements) this.spawnFragment(placement);
    let live = 0;
    for (const fragment of this.fragments) {
      if (!fragment.active) continue;
      fragment.update(deltaTime);
      if (fragment.active) this.fragments[live++] = fragment;
    }
    this.fragments.length = live;
    this.checkCollection();
  }
  getUncollectedLoreCount() { return this.maxTotalLore - this.collectedLore.size; }
  spawnFragment(placement = null) {
    this.player = window.player || this.player;
    if (!this.player || this.isBlocked()) return null;
    const kills = window.sector1Progression?.missionDefeats || 0;
    const eligible = record => kills >= record.unlockKills && !this.collectedLore.has(record.loreId) &&
      !this.fragments.some(fragment => fragment.active && fragment.loreId === record.loreId);
    placement = placement || this.authoredLevel1Placements.find(eligible);
    if (!placement || !this.authoredLevel1Placements.includes(placement) || !eligible(placement)) return null;
    const fragment = new window.LostDataFragment(placement.x, placement.y);
    fragment.authoredPlacementId = placement.id;
    fragment.loreId = placement.loreId;
    fragment.surfaceY = placement.surfaceY;
    this.fragments.push(fragment);
    window.particleSystem?.dataFragmentEffect?.(placement.x, placement.y);
    return fragment;
  }
  checkCollection() {
    if (this.isBlocked()) return;
    const player = window.player || this.player;
    const box = player?.getHitbox?.();
    if (!box) return;
    const footY = player.position.y + (window.Player?.VISUAL_FOOT_OFFSET_Y ?? 72);
    for (const fragment of this.fragments) {
      if (!fragment.active || footY > fragment.surfaceY + 6) continue;
      const nearX = Math.max(box.x, Math.min(fragment.position.x, box.x + box.width));
      const nearY = Math.max(box.y, Math.min(fragment.position.y, box.y + box.height));
      if (Math.hypot(nearX - fragment.position.x, nearY - fragment.position.y) <= 34) this.collectFragment(fragment);
    }
  }
  collectFragment(fragment) {
    const record = this.authoredLevel1Placements.find(entry => entry.loreId === fragment?.loreId);
    if (!fragment?.active || !record || this.collectedLore.has(record.loreId) || this.isBlocked()) return false;
    fragment.active = false;
    this.collectedLore.add(record.loreId);
    this.archive.collect(record.loreId);
    this.showCollectionMessage('LORE FRAGMENT COLLECTED');
    window.audioSystem?.playCombatCue?.('pickup');
    this.lastCollectedLoreId = record.loreId;
    this.displayLore(record.text, record.loreId);
    if (window.BARCODE?.combatFX) window.BARCODE.combatFX.dataCollected(fragment);
    else window.particleSystem?.dataFragmentCollected?.(fragment.position.x, fragment.position.y);
    if (window.gameState) {
      window.gameState.score += 500;
      if (window.sector1Progression?.bossCheckpoint) window.sector1Progression.bossCheckpoint.score += 500;
    }
    return true;
  }
  showCollectionMessage(message) {
    if (window.gameState) window.gameState.collectionMessage = { text: message, timer: 180, alpha: 1 };
  }
  displayLore(text, id = null) { window.loreSystem?.displayLoreMessage?.(text, id); }
  draw(ctx) {
    if (window.tutorialSystem?.isActive?.()) return;
    for (const fragment of this.fragments) if (fragment.active) fragment.draw(ctx);
  }
  clear() { this.fragments = []; }
  getProgress() {
    return { collected: this.collectedLore.size, total: this.maxTotalLore,
      activeFragments: this.fragments.filter(fragment => fragment.active).length,
      remainingLore: this.getUncollectedLoreCount(), cooldownActive: false, cooldownRemaining: 0,
      saved: this.archive.status === 'ready', archiveCount: this.archive.getIds().length };
  }
  reset() {
    // Level replay clears its score/discoveries. The campaign's unique archive
    // survives retries, level restarts and reloads and cannot be farmed.
    this.collectedLore.clear();
    this.fragments = [];
    this.lastCollectedLoreId = null;
    window.loreSystem?.reset?.();
  }
  forceSpawnFragment() { return !!this.spawnFragment(); }
};

// Lost Data Fragment class
window.LostDataFragment = class LostDataFragment {
  constructor(x, y) {
    this.position = new window.Vector2D(x, y);
    this.active = true;
    this.animationTime = 0;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.floatPhase = Math.random() * Math.PI * 2;
    this.rotationAngle = 0;
    this.scale = 1;
    this.glowIntensity = 0.8;
    
    // Visual properties
    this.size = 64; // Much larger for better visibility
    this.baseY = y;
    this.floatAmplitude = 20; // More noticeable floating
    this.floatSpeed = 2;
    this.rotationSpeed = 1;
    
    // Particle effect timer
    this.particleTimer = 0;
    this.particleInterval = 150; // More frequent particles for visibility
    
    // Visual enhancement timers
    this.glowPulseTimer = 0;
    this.colorShiftTimer = 0;
    
    // Visual variation properties (will be set by spawn system)
    this.visualVariation = {
      hueShift: 0,
      sizeMultiplier: 1,
      rotationSpeedMultiplier: 1,
      glowIntensityMultiplier: 1
    };
    
    // Load lore sprite
    this.image = new Image();
    this.image.src = './assets/standalone/lore.png';
    this.imageLoaded = false;
    this.useFallback = false;
    
    // Force image loading with crossOrigin
    this.image.crossOrigin = 'anonymous';
    
    this.image.onload = () => {
      this.imageLoaded = true;
      console.log('✅ Lore fragment sprite loaded successfully');
    };
    
    this.image.onerror = () => {
      console.error('❌ Failed to load Lore fragment sprite - using fallback');
      this.useFallback = true;
    };
  }
  
  update(deltaTime) {
    if (!this.active) return;
    
    const dt = deltaTime / 1000;
    this.animationTime += deltaTime;
    
    // Floating animation - more dramatic
    this.floatPhase += this.floatSpeed * dt;
    this.position.y = this.baseY + Math.sin(this.floatPhase) * this.floatAmplitude;
    
    // Rotation animation - faster spinning
    this.rotationAngle += this.rotationSpeed * dt * 1.5;
    
    // Pulsing glow - more intense
    this.pulsePhase += dt * 4;
    this.glowIntensity = 0.4 + Math.sin(this.pulsePhase) * 0.6;
    
    // Scale pulsing - more dramatic size changes
    this.scale = 1 + Math.sin(this.pulsePhase * 0.7) * 0.3;
    
    // Update visual enhancement timers
    this.glowPulseTimer += deltaTime;
    this.colorShiftTimer += deltaTime;
    
    // Particle effects - more frequent
    this.particleTimer += deltaTime;
    if (this.particleTimer >= this.particleInterval) {
      this.particleTimer = 0;
      if (window.particleSystem && (!window.BARCODE?.combatFX || window.BARCODE.combatFX.visible(this.position.x, this.position.y, 200))) {
        window.particleSystem.dataFragmentGlow(this.position.x, this.position.y);
      }
    }
  }
  
  draw(ctx) {
    if (!this.active) return;
    if (window.BARCODE?.combatFX && !window.BARCODE.combatFX.visible(this.position.x, this.position.y, 210)) return;
    
    ctx.save();
    
    // Draw glow effect first (behind sprite)
    this.drawGlow(ctx);
    this.drawBeacon(ctx);
    
    // Apply transformations for sprite
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.rotationAngle);
    ctx.scale(this.scale, this.scale);
    
    // Draw ONLY the lore sprite with spinning animation
    if (this.imageLoaded && !this.useFallback) {
      ctx.drawImage(
        this.image,
        -this.size / 2,
        -this.size / 2,
        this.size,
        this.size
      );
    } else {
      // If sprite not loaded yet, draw simple placeholder circle
      ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    ctx.restore();
  }

  drawBeacon(ctx) {
    const x = this.position.x;
    const top = this.baseY - 118;
    const pulse = 0.65 + Math.sin(this.animationTime / 500) * 0.15;
    ctx.save();
    ctx.fillStyle = 'rgba(8,13,30,0.88)'; ctx.fillRect(x - 55, top - 12, 110, 24);
    ctx.fillStyle = '#e6c7ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 15px monospace';
    ctx.fillText('LOST DATA', x, top);
    for (let bar = 0; bar < 5; bar++) {
      ctx.fillStyle = `rgba(${bar % 2 ? '144,255,227' : '202,161,255'},${pulse * (bar === 2 ? 0.3 : 0.12)})`;
      ctx.fillRect(x - 10 + bar * 5, top + 18, bar % 2 ? 1 : 2, 58);
    }
    ctx.strokeStyle = '#d9b7ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 10, top + 17); ctx.lineTo(x, top + 26); ctx.lineTo(x + 10, top + 17); ctx.stroke();
    ctx.restore();
  }
  
  drawGlow(ctx) {
    const sprites = window.LostDataFragment.getGlowSprites();
    const strength = Math.max(0, Math.min(1, this.glowIntensity));
    const colorShift = Math.sin(this.colorShiftTimer / 500) * 0.5 + 0.5;
    ctx.save();
    for (let i = 0; i < sprites.length; i++) {
      const radius = this.size * (i ? 1.2 : 3);
      ctx.globalAlpha = strength * (i ? 0.35 + colorShift * 0.15 : 0.28 - colorShift * 0.06);
      ctx.drawImage(sprites[i], this.position.x - radius, this.position.y - radius, radius * 2, radius * 2);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const ringPhase = (this.glowPulseTimer / 1000 + i * 0.3) % 2;
      if (ringPhase < 1) {
        const ringRadius = this.size * (1 + ringPhase * 2);
        const ringAlpha = (1 - ringPhase) * strength * 0.3;
        ctx.strokeStyle = `rgba(199,148,255,${ringAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  static getGlowSprites() {
    if (this.glowSprites) return this.glowSprites;
    this.glowSprites = [];
    if (typeof window.document?.createElement !== 'function') return this.glowSprites;
    for (const color of ['179,114,255', '110,220,255']) {
      const canvas = window.document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
      const ctx = canvas.getContext?.('2d');
      if (!ctx?.createRadialGradient) continue;
      const glow = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
      glow.addColorStop(0, `rgba(${color},1)`); glow.addColorStop(0.5, `rgba(${color},0.4)`); glow.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 96, 96);
      this.glowSprites.push(canvas);
    }
    return this.glowSprites;
  }
};

// Initialize global lost data system
window.lostDataSystem = null;

// Initialize lost data system - FORCE TO WORK
window.initLostData = function(player) {
  try {
    if (window.lostDataSystem) {
      return true;
    }
    console.log('🔥🔥🔥 CREATING LOST DATA SYSTEM!!!');
    window.lostDataSystem = new window.LostDataSystem();
    
    // Init with or without player - doesn't matter for testing
    window.lostDataSystem.init(player || { position: { x: 960, y: 400 } });
    
    console.log('✅✅✅ LOST DATA SYSTEM SUCCESSFULLY CREATED!!!');
    
    return true;
  } catch (error) {
    console.error('❌❌❌ FAILED TO INITIALIZE LOST DATA SYSTEM:', error?.message || error);
    return false;
  }
};

// Global debug function
window.checkLostDataStatus = function() {
  if (!window.lostDataSystem) {
    console.log('❌ Lost Data system not initialized');
    return;
  }
  
  const progress = window.lostDataSystem.getProgress();
  console.log('💎 Lost Data System Status:');
  console.log(`  Collected: ${progress.collected}/${progress.total}`);
  console.log(`  Active Fragments: ${progress.activeFragments}`);
  console.log('  Availability: authored encounter progression');
  console.log(`  Archive saved: ${progress.saved}`);
  console.log(`  Available Lore: ${window.lostDataSystem.getUncollectedLoreCount()}`);
  console.log(`  Collection Cooldown: ${progress.cooldownActive ? 'ACTIVE' : 'INACTIVE'}`);
  if (progress.cooldownActive) {
    console.log(`  Cooldown Remaining: ${progress.cooldownRemaining.toFixed(1)}s`);
  }
  console.log(`  Player Reference: ${window.lostDataSystem.player ? '✅' : '❌'}`);
};

// Debug function to manually spawn fragment at player position
window.spawnLoreFragmentAtPlayer = function() {
  if (!window.BARCODE?.DEBUG_LEVEL_1_SESSION || !window.lostDataSystem || !window.player) return false;
  
  const playerX = window.player.position.x;
  const playerY = window.player.position.y;
  
  const fragment = window.lostDataSystem.spawnFragment();
  if (!fragment) return false;
  fragment.position.x = playerX; fragment.position.y = playerY;
  fragment.baseY = playerY; fragment.surfaceY = playerY + (window.Player?.VISUAL_FOOT_OFFSET_Y ?? 72);
  
  console.log(`💎 Manual lore fragment spawned at player position: (${playerX}, ${playerY})`);
  
  if (window.particleSystem) {
    window.particleSystem.dataFragmentEffect(playerX, playerY);
  }
  
  return true;
};
