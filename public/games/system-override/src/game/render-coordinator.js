// Render coordination for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/render-coordinator.js',
  exports: ['renderGame', 'resetRenderContext', 'BARCODE.sceneProjection'],
  dependencies: ['renderer', 'player', 'enemyManager', 'sector1Progression', 'lostDataSystem', 'spaceShipSystem', 'parallaxBackground', 'particleSystem', 'rhythmSystem', 'hackingSystem', 'tutorialSystem', 'objectivesSystem', 'loreSystem', 'jammerIndicator', 'drawGameUI', 'clamp']
});

// Cache canvas context to prevent repeated creation
let renderCanvas = null;
let renderContext = null;
let contextCreationAttempts = 0;
const MAX_CONTEXT_ATTEMPTS = 3;

// The HUD flight uses the actual world-view matrix, including zoom and shake,
// plus the same camera offset applied to actors. This is presentation only.
window.BARCODE = window.BARCODE || {};
window.BARCODE.sceneProjection = {
  matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  capture(ctx, zoom = 1, shake = { x: 0, y: 0 }, viewport = null) {
    const matrix = ctx.getTransform?.() || { a: zoom, b: 0, c: 0, d: zoom,
      e: 960 * (1 - zoom) + (shake?.x || 0) * zoom,
      f: 675 * (1 - zoom) + (shake?.y || 0) * zoom };
    this.matrix = { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f };
    this.viewport=viewport;
  },
  worldToScreen(point) {
    const x = point.x + 960 - (window.gameCamera?.centerX ?? 960);
    const y = point.y - (window.gameCamera?.y || 0);
    const { a, b, c, d, e, f } = this.matrix;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }
};

// Main render function
window.renderGame = function() {
  // Check if renderer is available before use
  let rendererAvailable = window.renderer && typeof window.renderer === 'object' && window.renderer !== null && typeof window.renderer.clear === 'function';
  
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
      renderContext = window.renderer?.canvas === renderCanvas && window.renderer.ctx ||
        renderCanvas.getContext('2d');
      if (!renderContext) {
        console.error('Failed to get canvas context, attempt', contextCreationAttempts);
        contextCreationAttempts = MAX_CONTEXT_ATTEMPTS;
        return;
      }
    } catch (error) {
      console.error('Error getting canvas context:', error?.message || error);
      if (error.message && (
          error.message.includes('context creation limit') ||
          error.message.includes('Maximum number') ||
          error.message.includes('context limit')
      )) {
        console.error('🚫 Canvas context creation limit exceeded - possible infinite loop detected');
        contextCreationAttempts = MAX_CONTEXT_ATTEMPTS;
        return;
      }
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
  
  // One opaque clear per frame. Use the direct context only if the renderer
  // is unavailable or fails; clearing both discarded the same pixels twice.
  try {
    if (rendererAvailable) window.renderer.clear();
    else ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
  } catch (error) {
    rendererAvailable = false;
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
  }

  // Additional safety check for ctx
  if (!ctx) {
    console.warn('Canvas context lost during render, skipping frame');
    return;
  }
  
  // A single live scene, drawn once into its own area during hacking. Keep
  // the world matrix authoritative for markers and traffic warnings as well.
  const hackView=window.hackingSystem?.getSceneViewport?.();
  ctx.save();
  if(hackView) {
    ctx.fillStyle='#07121e';ctx.fillRect(0,0,1920,1080);
    ctx.beginPath();ctx.rect(hackView.x,hackView.y,hackView.width,hackView.height);ctx.clip();
    ctx.translate(hackView.x,hackView.y);ctx.scale(hackView.scale,hackView.scale);
  }
  // Apply zoom transformation to game area only
  if (rendererAvailable && window.renderer && typeof window.renderer.zoomLevel === 'number') {
    ctx.save();
    
    const currentZoom = window.renderer.zoomLevel * (window.renderer.getImpactZoom?.() || 1);
    const zoomAmount = 1.0 - currentZoom;
    const maxOffset = 100;
    const verticalOffset = (zoomAmount / 0.4) * maxOffset;
    
    const centerX = 1920 / 2;
    const centerY = 850 / 2;
    
    ctx.translate(centerX, centerY + verticalOffset);
    ctx.scale(currentZoom, currentZoom);
    ctx.translate(-centerX, -centerY);
    
    if (window.renderer.screenShake.x || window.renderer.screenShake.y) {
      ctx.translate(window.renderer.screenShake.x, window.renderer.screenShake.y);
    }
  }
  
  window.BARCODE.sceneProjection.capture(ctx, rendererAvailable ? window.renderer.zoomLevel : 1,
    rendererAvailable ? window.renderer.screenShake : null,hackView);

  // Draw game elements first (within zoomed area)
  drawGameElements(ctx);
  
  // Restore context to remove zoom transformation before drawing UI
  if (rendererAvailable && window.renderer && typeof window.renderer.zoomLevel === 'number') {
    ctx.restore();
  }
  ctx.restore();

  // Tactical focus is a scene treatment, not part of the terminal or HUD. Draw
  // it after the world zoom has been restored and before any interface layer.
  drawTacticalFocusCue(ctx);
  window.BARCODE?.combatFX?.drawPowerScreen?.(ctx);
  if(hackView) {
    ctx.save();ctx.globalAlpha=1;ctx.strokeStyle='#3c827f';ctx.lineWidth=2;
    ctx.strokeRect(hackView.x,hackView.y,hackView.width,hackView.height);
    ctx.fillStyle='#91ffe0';ctx.font='bold 22px Oxanium, monospace';ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.fillText('LIVE UPLINK / TACTICAL FOCUS',hackView.x+16,hackView.y-18);
    ctx.fillStyle='#bacbd4';ctx.font='20px Oxanium, monospace';
    ctx.fillText('Enemies remain in view. Cancel the uplink to move.',hackView.x+16,hackView.y+hackView.height+36);
    ctx.restore();
  }
  
  // Draw tutorial UI on top - NOT affected by zoom
  if (window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive()) {
    ctx.save();
    try {
      window.tutorialSystem.draw(ctx);
    } catch (error) {
      console.error('Error drawing tutorial system:', error?.message || error);
    }
    ctx.restore();
  }
  
  // Draw game UI elements - NOT affected by zoom
  if (typeof window.drawGameUI === 'function') {
    try {
      window.drawGameUI(ctx);
    } catch (error) {
      console.error('Error drawing UI:', error?.message || error);
    }
  }
  window.spaceShipSystem?.drawTrafficWarnings?.(ctx);
  
  // Apply post-processing effects (if available)
  if (rendererAvailable) {
    try {
      if (window.renderer.applyPostEffects && typeof window.renderer.applyPostEffects === 'function') {
        window.renderer.applyPostEffects();
      }
    } catch (error) {
      console.error('Error in renderer post-processing:', error?.message || error?.toString() || 'Unknown error');
      rendererAvailable = false;
    }
  }
};

function drawTacticalFocusCue(ctx) {
  const focusClock = window.BARCODE && window.BARCODE.TacticalFocusClock;
  if (!focusClock || typeof focusClock.isActive !== 'function' || !focusClock.isActive()) return;

  const width = renderCanvas?.width || 1920;
  const height = renderCanvas?.height || 1080;

  ctx.save();
  try {
    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.46,
      Math.min(width, height) * 0.18,
      width * 0.5,
      height * 0.46,
      Math.max(width, height) * 0.72
    );
    vignette.addColorStop(0, 'rgba(0, 12, 22, 0)');
    vignette.addColorStop(0.72, 'rgba(0, 20, 32, 0.08)');
    vignette.addColorStop(1, 'rgba(0, 5, 12, 0.34)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.34)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, width - 16, height - 16);

    ctx.translate(24, height * 0.62);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(0, 255, 255, 0.72)';
    ctx.font = '600 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TACTICAL FOCUS // TIME DILATION', 0, 0);
  } catch (error) {
    console.error('Error drawing tactical focus cue:', error?.message || error);
  }
  ctx.restore();
}

// Draw game elements with camera transform
function drawGameElements(ctx) {
  ctx.save();ctx.filter=window.BARCODE?.combatFX?.sceneFilter?.() || 'none';
  // Draw fallback background first
  drawBackground(ctx);
  
  // Set up side-scroller camera
  const playerX = window.player ? window.player.position.x : 960;
  const canvasWidth = 1920;
  const worldWidth = 4096;
  const halfCanvas = canvasWidth / 2;
  
  let cameraX = window.renderer?.getFollowCameraX?.(playerX) ?? playerX;
  cameraX = window.clamp?.(cameraX, halfCanvas, worldWidth - halfCanvas) || cameraX;
  if (window.sector1Progression && typeof window.sector1Progression.getCameraX === 'function') cameraX = window.sector1Progression.getCameraX(cameraX);
  const cameraY = window.sector1Progression?.getCameraY?.() || 0;
  window.gameCamera = { x: cameraX - halfCanvas, y: cameraY, centerX: cameraX };
  const cameraOffsetX = 960 - cameraX;
  
  // Draw parallax background layer (BG)
  ctx.save(); ctx.translate(0, -cameraY * 0.3);
  drawParallaxBackground(ctx, cameraX);
  ctx.restore();
  
  // Draw space ships (between BG and FG layers)
  drawSpaceShips(ctx);
  window.BARCODE?.stageFX?.drawTrafficLighting?.(ctx, { foreground: false });
  
  // Draw parallax foreground layer (FG)
  ctx.save(); ctx.translate(0, -cameraY);
  drawParallaxForeground(ctx);
  ctx.restore();
  
  ctx.restore(); // Colour grade scenery only; player and warnings stay crisp.

  // Apply camera transform to all game objects
  ctx.save();
  ctx.translate(cameraOffsetX, -cameraY);
  
  // Draw smoke particles BEHIND ground layer
  drawSmokeParticles(ctx);
  
  // Draw ground
  drawGround(ctx);
  
  // Draw remaining particle effects on top
  drawOtherParticles(ctx);
  
  // Draw game entities
  window.BARCODE?.stageFX?.drawWorld(ctx);
  drawRhythmEffectsBehindPlayer(ctx);
  if(window.player)window.BARCODE?.combatFX?.drawHackField?.(ctx,window.player.position.x,window.player.position.y);
  drawGameEntities(ctx);
  
  // Rhythm field is already drawn behind enemies and their warning labels.
  
  // Draw player
  if (window.sector1Progression?.getLiftActorLayer?.(window.player) !== 'behind') drawPlayer(ctx);
  window.sector1Progression?.drawSignalLift?.(ctx, 'front');
  window.BARCODE?.combatFX?.draw(ctx);
  
  // Restore camera transform
  ctx.restore();
  
  // Draw foreground space ships
  ctx.save(); ctx.translate(0, -cameraY);
  window.BARCODE?.stageFX?.drawTrafficLighting?.(ctx, { foreground: true });
  drawForegroundSpaceShips(ctx);
  ctx.restore();
}

// Draw background elements
function drawBackground(ctx) {
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

// Draw parallax layers
function drawParallaxBackground(ctx, cameraX) {
  if (window.parallaxBackground) {
    const groundY = 890;
    window.parallaxBackground.updateCamera(cameraX, groundY);
    
    try {
      const bgLayer = window.parallaxBackground.getLayer(0);
      if (bgLayer) {
        window.parallaxBackground.drawLayer(ctx, bgLayer);
      }
    } catch (error) {
      console.error('Error drawing parallax background layer:', error);
    }
  }
}

function drawParallaxForeground(ctx) {
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
}

// Draw space ships
function drawSpaceShips(ctx) {
  if (window.spaceShipSystem && typeof window.spaceShipSystem.drawNormalShips === 'function') {
    try {
      window.spaceShipSystem.drawNormalShips(ctx);
    } catch (error) {
      console.error('Error drawing normal space ships:', error?.message || error);
    }
  }
}

function drawForegroundSpaceShips(ctx) {
  if (window.spaceShipSystem && typeof window.spaceShipSystem.drawForegroundShips === 'function') {
    try {
      window.spaceShipSystem.drawForegroundShips(ctx);
    } catch (error) {
      console.error('Error drawing foreground space ships:', error?.message || error);
    }
  }
}

// Draw particles
function drawSmokeParticles(ctx) {
  if (window.particleSystem) {
    ctx.save();
    for (const p of window.particleSystem.particles) if (p.growAndDissipate === true && (!window.BARCODE?.combatFX || window.BARCODE.combatFX.visible(p.position.x, p.position.y, p.size * 2))) p.draw(ctx);
    ctx.restore();
  }
}

function drawOtherParticles(ctx) {
  if (window.particleSystem) {
    ctx.save();
    for (const p of window.particleSystem.particles) if (p.growAndDissipate !== true && (!window.BARCODE?.combatFX || window.BARCODE.combatFX.visible(p.position.x, p.position.y, p.size * 2))) p.draw(ctx);
    ctx.restore();
  }
}

// Draw ground
function drawGround(ctx) {
  const groundY = 890;
  const worldWidth = 4096;
  
  // Clip the expensive glowing road stroke to the visible camera span.
  // Padding retains its blurred edge through zoom and camera shake.
  const center = window.gameCamera?.centerX ?? 2048;
  const halfView = 960 / Math.max(0.4,window.renderer?.zoomLevel || 1) + 100;
  const groundStartX = Math.max(-2000,center-halfView);
  const groundEndX = Math.min(worldWidth+2000,center+halfView);
  const screenWidth = groundEndX - groundStartX;
  
  // World-anchored dark asphalt below the existing curb. Alternating tile
  // direction joins identical edge pixels without per-frame filtering.
  const projection = ctx.getTransform?.();
  const visibleBottom = projection?.d > 0 ? (1080 - projection.f) / projection.d : 1080;
  const bottom = Math.max(1080, visibleBottom + 2), tileWidth = 1152, tileHeight = 384;
  ctx.fillStyle = '#111319';
  ctx.fillRect(groundStartX, groundY, screenWidth, bottom - groundY);
  ctx.save(); ctx.beginPath(); ctx.rect(groundStartX, groundY, screenWidth, bottom-groundY); ctx.clip();
  for (let y = groundY; y < bottom; y += tileHeight) {
    for (let tile = Math.floor(groundStartX / tileWidth); tile * tileWidth < groundEndX; tile++) {
      const flip = Math.abs(tile % 2) === 1;
      window.BARCODE?.PresentationAssets?.draw('wetStreet', ctx, {
        x: (tile + (flip ? 1 : 0)) * tileWidth, y, width: tileWidth, height: tileHeight, flip
      });
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(217,98,200,0.65)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(groundStartX,groundY); ctx.lineTo(groundEndX,groundY); ctx.stroke();
}

// Draw game entities
function drawGameEntities(ctx) {
  // The set-back terminal is solid scenery. Actors and hologram fields pass
  // in front; pickups, the lift and boss retain their established later pass.
  if (typeof window.sector1Progression?.drawTraversalProps === 'function') {
    try {
      window.sector1Progression.drawTraversalProps(ctx);
    } catch (error) {
      console.error('Error drawing traversal scenery:', error?.message || error);
    }
  }

  // Environmental Jammer is drawn outside EnemyManager and behind active enemies.
  if (window.BARCODE && window.BARCODE.JammerEnvironment && typeof window.BARCODE.JammerEnvironment.draw === 'function') {
    try {
      window.BARCODE.JammerEnvironment.draw(ctx);
    } catch (error) {
      console.error('Error drawing environmental Jammer:', error?.message || error);
    }
  }

  // Emitter hardware also belongs behind enemies. Keep gate fields, lift,
  // repairs and boss in their established foreground order.
  if (typeof window.sector1Progression?.drawEncounterHardware === 'function') {
    try {
      window.sector1Progression.drawEncounterHardware(ctx);
    } catch (error) {
      console.error('Error drawing encounter hardware:', error?.message || error);
    }
  }
  
  // Actors below a raised cabin pass behind it; floor/roof riders follow it.
  if (window.enemyManager && typeof window.enemyManager.draw === 'function') {
    try {
      window.enemyManager.draw(ctx, false);
    } catch (error) {
      console.error('Error drawing enemies:', error?.message || error);
    }
  }

  if (window.sector1Progression?.getLiftActorLayer?.(window.player) === 'behind') drawPlayer(ctx);

  if (window.sector1Progression && typeof window.sector1Progression.draw === 'function') {
    try {
      window.sector1Progression.draw(ctx);
    } catch (error) {
      console.error('Error drawing Sector 1 progression:', error?.message || error);
    }
  }

  if (window.enemyManager && typeof window.enemyManager.draw === 'function') {
    try {
      window.enemyManager.draw(ctx, true);
    } catch (error) {
      console.error('Error drawing elevator passengers:', error?.message || error);
    }
  }

  // Draw lost data fragments
  if (window.lostDataSystem && typeof window.lostDataSystem.draw === 'function') {
    try {
      window.lostDataSystem.draw(ctx);
    } catch (error) {
      console.error('Error drawing lost data system:', error?.message || error);
    }
  }
}

// Draw rhythm effects behind player
function drawRhythmEffectsBehindPlayer(ctx) {
  if (window.rhythmSystem && typeof window.rhythmSystem.isActive === 'function' && window.rhythmSystem.isActive()) {
    try {
      const playerX = window.player ? window.player.position.x : 960;
      const playerY = window.player ? window.player.position.y : 500;
      
      ctx.save();
      
      if (typeof window.rhythmSystem.drawElectricalArcs === 'function') {
        window.rhythmSystem.drawElectricalArcs(ctx, playerX, playerY);
      }
      
      ctx.restore();
    } catch (error) {
      console.error('Error drawing rhythm effects:', error?.message || error);
    }
  }
}

// Draw player
function drawPlayer(ctx) {
  if (window.player && typeof window.player.draw === 'function') {
    try {
      const currentTime = Date.now();
      const isPlayerInvulnerable = (
        (window.player.invulnerableUntil && currentTime < window.player.invulnerableUntil)
      );
      
      if (isPlayerInvulnerable) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
      }
      
      window.player.draw(ctx);
      window.BARCODE?.playerCombat?.drawPlayerTimingCue?.(ctx, window.player);
      
      if (isPlayerInvulnerable) {
        ctx.restore();
      }
    } catch (error) {
      console.error('Error drawing player:', error?.message || error);
    }
  }
}

// Reset render context cache for error recovery
window.resetRenderContext = function() {
  // Reacquiring on the same element cannot repair a thrown draw call, and
  // guarded hosts may treat each getContext call as a new context attempt.
  if (renderCanvas === document.getElementById('gameCanvas')) return;
  renderCanvas = null;
  renderContext = null;
  contextCreationAttempts = 0;
};
