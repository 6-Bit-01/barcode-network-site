// Renderer system for BARCODE: System Override with CRT effects
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/renderer.js',
  exports: ['Renderer', 'renderer'],
  dependencies: ['Vector2D', 'clamp']
});

window.Renderer = class Renderer {
  constructor(canvas, context = null) {
    if (!canvas) {
      throw new Error('Canvas is required for Renderer');
    }
    
    this.canvas = canvas;
    
    // Initialization already acquired the context. Do not probe with another
    // canvas when a guarded host refuses this one.
    try {
      this.ctx = context || canvas.getContext('2d');
      if (!this.ctx) throw new Error('Failed to get 2D context from game canvas');
    } catch (error) {
      console.error('Renderer context creation failed:', error?.message || error?.toString() || 'Unknown error');
      throw new Error(`Failed to initialize renderer: ${error.message}`);
    }
    
    this.width = canvas.width;
    this.height = canvas.height;
    window.BARCODE_RENDER_QUALITY = window.BARCODE_RENDER_QUALITY || {};
    this.postEffects = window.BARCODE_RENDER_QUALITY.crtPostEffects !== false;
    this.clearScreenShake();
    
    // CRT effect properties
    this.scanlineOffset = 0;
    this.scanlinePattern = null;
    this.scanlinePatternAttempted = false;
    this.glitchIntensity = 0;
    this.chromaticAberration = 0;
    
    // Camera zoom system
    this.zoomLevel = 1.0; // Current zoom level (1.0 = normal, 0.625 = 37.5% zoomed out)
    this.targetZoomLevel = 1.0;
    this.zoomSpeed = 0.05; // Much smoother zoom transition speed (reduced from 0.1)
    this.cinematicZoomOverride = null;
    this.followCenterX = null;
    this.followLookAhead = 0;
  }

  resetFollowCamera(x = window.player?.position.x) {
    this.followCenterX = Math.max(960, Math.min(3136, Number.isFinite(x) ? x : 960));
    this.followLookAhead = 0;
  }

  getFollowCameraX(fallback = 960) { return Number.isFinite(this.followCenterX) ? this.followCenterX : Math.max(960, Math.min(3136, fallback)); }

  updateFollowCamera(ms) {
    const player = window.player, owner = window.sector1Progression;
    if (!player || window.isPaused || window.gameState?.paused || !Number.isFinite(ms) || ms < 0) return;
    if (!Number.isFinite(this.followCenterX)) this.resetFollowCamera(player.position.x);
    if (owner?.cameraOverrideActive) { this.followCenterX = owner.getCameraX(this.followCenterX); this.followLookAhead = 0; return; }
    if (Math.abs(player.position.x - this.followCenterX) > 1000) this.resetFollowCamera(player.position.x);
    const blend = 1 - Math.exp(-Math.min(ms, 100) / 1000 * 9);
    const lead = Math.max(-160, Math.min(160, (player.velocity?.x || 0) * 0.4));
    this.followLookAhead += (lead - this.followLookAhead) * blend;
    const delta = player.position.x + this.followLookAhead - this.followCenterX;
    const target = this.followCenterX + Math.sign(delta) * Math.max(0, Math.abs(delta) - 90);
    this.followCenterX = Math.max(960, Math.min(3136, this.followCenterX + (target - this.followCenterX) * blend));
  }

  // Clear canvas with dark background
  clear() {
    // Set image rendering to high-quality smooth for clear graphics
    try {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    } catch (error) {
      // Some browsers may not support these settings
    }
    
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  // Called only from the existing renderer update. Both the envelope and
  // motion sample elapsed time, so a 144 Hz display does not shorten impacts.
  applyScreenShake(deltaTime = 0) {
    if (!this.screenShake || window.isPaused || window.gameState?.paused) return;
    const shake = this.screenShake;
    if (shake.duration <= 0 || window.BARCODE_RENDER_QUALITY?.screenShake === false) {
      this.clearScreenShake();
      return;
    }
    if (!Number.isFinite(deltaTime) || deltaTime < 0) return;
    shake.elapsedMs += deltaTime;
    shake.duration = Math.max(0, shake.totalDuration - shake.elapsedMs);
    if (shake.duration < 0.000001) { this.clearScreenShake(); return; }
    const amplitude = shake.intensity * Math.pow(shake.duration / shake.totalDuration, 2);
    const t = shake.elapsedMs;
    if (shake.kind === 'hit' || shake.kind === 'hurt') {
      shake.x = shake.direction * amplitude * Math.cos(t * 0.035);
      shake.y = Math.sin(t * 0.07) * amplitude * 0.22;
    } else if (shake.kind === 'land' || shake.kind === 'stomp') {
      shake.x = Math.sin(t * 0.09) * amplitude * 0.2;
      shake.y = Math.cos(t * 0.04) * amplitude;
    } else {
      const rolling = ['destruction', 'boss', 'victory'].includes(shake.kind);
      shake.x = Math.sin(t * (rolling ? 0.043 : 0.11)) * amplitude;
      shake.y = Math.sin(t * (rolling ? 0.067 : 0.137)) * amplitude * 0.65;
    }
  }

  clearScreenShake() {
    this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0, totalDuration: 0, elapsedMs: 0 };
  }

  impact(kind, options = {}) {
    const profiles = { hit: [5, 150], hurt: [7, 210], land: [5, 180], stomp: [10, 260], destruction: [12, 600], boss: [9, 380], victory: [13, 620] };
    const profile = profiles[kind];
    if (!profile || window.BARCODE_RENDER_QUALITY?.screenShake === false) return;
    const intensity = profile[0] * Math.max(0.2, Math.min(1, options.strength ?? 1));
    const current = this.screenShake;
    if (current?.duration > 0 && current.intensity * current.duration / current.totalDuration > intensity) return;
    this.screenShake = { kind, direction: Math.sign(options.direction) || 1, x: 0, y: 0,
      intensity, duration: profile[1], totalDuration: profile[1], elapsedMs: 0 };
  }

  getImpactZoom() {
    const s = this.screenShake;
    return s?.kind === 'victory' && window.BARCODE_RENDER_QUALITY?.screenShake !== false ?
      1 + 0.035 * Math.sin(Math.PI * Math.min(1, s.elapsedMs / s.totalDuration)) : 1;
  }

  // Never stack offsets or let a small hit erase a stronger impact. Legacy
  // victory/death requests also pass through the same short, restrained cap.
  addScreenShake(intensity, duration) {
    if (!Number.isFinite(intensity) || !Number.isFinite(duration) || intensity <= 0 || duration <= 0) return;
    if (window.BARCODE_RENDER_QUALITY?.screenShake === false) return;
    intensity = Math.min(6, intensity);
    duration = Math.min(300, duration);
    const shake = this.screenShake;
    if (shake.duration > 0 && (intensity < shake.intensity || (intensity === shake.intensity && duration <= shake.duration))) return;
    this.screenShake = { x: 0, y: 0, intensity, duration, totalDuration: duration, elapsedMs: 0 };
  }

  // Get transformed context with effects
  getTransformedContext() {
    this.ctx.save();
    
    // Apply screen shake only (zoom handled in main render)
    this.ctx.translate(this.screenShake.x, this.screenShake.y);
    
    return this.ctx;
  }

  // Restore context state
  restoreContext() {
    this.ctx.restore();
  }

  // Draw with chromatic aberration effect
  drawWithChromatic(drawCallback, x, y, options = {}) {
    if (!this.postEffects || this.chromaticAberration === 0) {
      drawCallback(x, y, options);
      return;
    }

    // Red channel offset
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    this.ctx.translate(-this.chromaticAberration, 0);
    drawCallback(x, y, options);
    this.ctx.restore();

    // Green channel (normal)
    drawCallback(x, y, options);

    // Blue channel offset
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
    this.ctx.translate(this.chromaticAberration, 0);
    drawCallback(x, y, options);
    this.ctx.restore();
  }

  // Apply post-processing effects
  applyPostEffects() {
    if (!this.postEffects || (window.BARCODE_RENDER_QUALITY && window.BARCODE_RENDER_QUALITY.crtPostEffects === false)) return;
    
    // Validate context and canvas
    if (!this.ctx || !this.canvas) {
      return;
    }

    // Draw the CRT treatment as a composited overlay. The previous implementation
    // read and rewrote every canvas pixel each frame, which was especially costly
    // in Makko at the game's 1920x1080 internal resolution.
    this.scanlineOffset = (this.scanlineOffset + 1) % 4;
    this.ctx.save();

    if (!this.scanlinePattern && !this.scanlinePatternAttempted) {
      this.scanlinePatternAttempted = true;
      try {
        const tile = document.createElement('canvas');
        tile.width = 4;
        tile.height = 4;
        const tileContext = tile.getContext('2d');
        if (tileContext) {
          // Three rows darkened, followed by one clear row.
          tileContext.fillStyle = 'rgba(0, 0, 0, 0.10)';
          tileContext.fillRect(0, 0, 4, 3);
          this.scanlinePattern = this.ctx.createPattern(tile, 'repeat');
        }
      } catch (error) {
        // CRT decoration is optional; a failed tile must not retry each frame.
        console.warn('CRT scanline tile unavailable:', error?.message || error);
      }
    }

    if (this.scanlinePattern) {
      this.ctx.translate(0, this.scanlineOffset);
      this.ctx.fillStyle = this.scanlinePattern;
      this.ctx.fillRect(0, -this.scanlineOffset, this.width, this.height + 4);
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Preserve the occasional VHS instability with a handful of cheap bands.
    // These are deliberately bounded draw calls rather than a full-frame readback.
    const activeGlitch = Math.max(this.glitchIntensity, this.chromaticAberration * 0.5);
    const bandCount = window.BARCODE_RENDER_QUALITY?.flashes === false ? 0 : activeGlitch > 0.15 ? Math.min(3, 1 + Math.floor(activeGlitch * 2)) : (Math.random() > 0.985 ? 1 : 0);
    for (let i = 0; i < bandCount; i++) {
      const y = Math.floor(Math.random() * this.height);
      const height = 1 + Math.floor(Math.random() * 3);
      const alpha = activeGlitch > 0.15 ? Math.min(0.18, 0.04 + activeGlitch * 0.08) : 0.05;
      this.ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
      this.ctx.fillRect(0, y, this.width, height);
      if (activeGlitch > 0.5) {
        this.ctx.fillStyle = `rgba(255, 0, 255, ${alpha * 0.75})`;
        this.ctx.fillRect(0, Math.min(this.height - 1, y + height + 1), this.width, 1);
      }
    }

    this.ctx.restore();
  }

  // Draw text with glow effect
  drawGlowText(text, x, y, options = {}) {
    const {
      font = 'Orbitron',
      size = 24,
      color = '#00ffff',
      glowColor = '#00ffff',
      glowSize = 10,
      align = 'center',
      baseline = 'middle'
    } = options;

    this.ctx.save();
    this.ctx.font = `bold ${size}px ${font}`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;

    // Draw glow
    this.ctx.shadowColor = glowColor;
    this.ctx.shadowBlur = glowSize;
    this.ctx.fillStyle = glowColor;
    this.ctx.fillText(text, x, y);

    // Draw main text
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);

    this.ctx.restore();
  }

  // Draw neon rectangle
  drawNeonRect(x, y, width, height, options = {}) {
    const {
      color = '#ff00ff',
      glowColor = '#ff00ff',
      glowSize = 20,
      filled = false,
      fillColor = 'rgba(255, 0, 255, 0.1)'
    } = options;

    this.ctx.save();

    // Draw glow
    this.ctx.shadowColor = glowColor;
    this.ctx.shadowBlur = glowSize;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;

    if (options.filled) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(x, y, width, height);
    }

    this.ctx.strokeRect(x, y, width, height);

    this.ctx.restore();
  }

  // Draw health bar with segments
  drawHealthBar(x, y, width, height, currentHealth, maxHealth) {
    const segmentWidth = width / maxHealth;
    const segmentGap = 2;

    for (let i = 0; i < maxHealth; i++) {
      const segmentX = x + (i * segmentWidth) + segmentGap;
      const segmentY = y + segmentGap;
      const segmentHeight = height - (segmentGap * 2);

      if (i < currentHealth) {
        // Active segment with gradient
        const gradient = this.ctx.createLinearGradient(
          segmentX, segmentY, 
          segmentX + segmentWidth - segmentGap, segmentY
        );
        gradient.addColorStop(0, '#ff00ff');
        gradient.addColorStop(1, '#00ffff');
        
        // Fill with gradient first
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(segmentX, segmentY, segmentWidth - segmentGap, segmentHeight);
        
        // Draw neon outline only (no fill)
        this.ctx.save();
        this.ctx.shadowColor = '#00ffff';
        this.ctx.shadowBlur = 5;
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(segmentX, segmentY, segmentWidth - segmentGap, segmentHeight);
        this.ctx.restore();
      } else {
        // Empty segment
        this.ctx.fillStyle = 'rgba(255, 0, 255, 0.1)';
        this.ctx.fillRect(segmentX, segmentY, segmentWidth - segmentGap, segmentHeight);
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
        this.ctx.strokeRect(segmentX, segmentY, segmentWidth - segmentGap, segmentHeight);
      }
    }
  }

  // Update effect properties
  update(deltaTime) {
    try {
      this.updateFollowCamera?.(deltaTime);
      this.applyScreenShake?.(deltaTime);
      // Gradually reduce glitch effect
      if (this.glitchIntensity > 0) {
        this.glitchIntensity = Math.max(0, this.glitchIntensity - deltaTime * 0.001);
      }

      // Gradually reduce chromatic aberration
      if (this.chromaticAberration > 0) {
        this.chromaticAberration = Math.max(0, this.chromaticAberration - deltaTime * 0.01);
      }
      
      if (this.cinematicZoomOverride !== null) {
        // Sector1Progression supplies its own eased cinematic curve. Apply it
        // exactly so a second smoothing pass cannot expose the foreground edge.
        this.zoomLevel = this.cinematicZoomOverride;
        this.targetZoomLevel = this.cinematicZoomOverride;
      } else if (Math.abs(this.zoomLevel - this.targetZoomLevel) > 0.001) {
        // Smooth ordinary player-owned zoom transitions.
        this.zoomLevel += (this.targetZoomLevel - this.zoomLevel) * (1 - Math.pow(1 - this.zoomSpeed, deltaTime / (1000 / 60)));
      }
    } catch (error) {
      console.error('Error updating renderer:', error?.message || error);
    }
  }

  // Check if canvas is tainted by cross-origin data
  isCanvasTainted() {
    try {
      // Try a small getImageData operation to test if canvas is tainted
      // Use 1x1 pixel to minimize performance impact
      this.ctx.getImageData(0, 0, 1, 1);
      return false; // If no error, canvas is not tainted
    } catch (error) {
      return true; // If error occurs, canvas is tainted
    }
  }

  // Reset post effects state (can be called after canvas is cleaned)
  resetPostEffects() {
    // Re-enable post effects if canvas might be clean
    if (!this.isCanvasTainted()) {
      this.postEffects = window.BARCODE_RENDER_QUALITY?.crtPostEffects !== false;
    }
  }

  // Trigger glitch effect
  addGlitch(intensity, duration) {
    if (window.BARCODE_RENDER_QUALITY?.flashes === false) return;
    this.glitchIntensity = intensity;
    this.chromaticAberration = intensity * 2;
    
    // Auto-reduce after duration
    setTimeout(() => {
      this.glitchIntensity *= 0.5;
      this.chromaticAberration *= 0.5;
    }, duration);
  }
  
  // Update camera zoom based on player position
  updateZoomFromPlayer(playerX, playerY) {
    if (this.cinematicZoomOverride !== null) {
      return;
    }

    // For side-scroller, we want zoom based on player's position in the FOREGROUND image
    // The FG image is 4096px wide, and we want maximum zoom when player is at center of FG (2048px)
    const fgCenter = 2048; // Center of the 4096px wide foreground image
    const fgHalfWidth = 2048; // Half width of FG image
    
    // Calculate distance from FG center (not screen center)
    const distanceFromFGCenter = Math.abs(playerX - fgCenter);
    
    // Create a center deadzone where no zoom happens
    const centerDeadzone = 400; // 400px deadzone in center (200px each side)
    
    // Calculate effective distance only outside the deadzone
    const effectiveDistance = Math.max(0, distanceFromFGCenter - centerDeadzone);
    
    // Calculate the remaining usable distance after deadzone
    const usableDistance = fgHalfWidth - centerDeadzone;
    
    // Normalize distance from edge of deadzone to world edges
    const normalizedDistance = Math.min(effectiveDistance / usableDistance, 1.0);
    
    // Apply smooth easing for the edge zones only
    // Use cubic ease for natural transition from deadzone to edges
    const easedDistance = 1.0 - Math.pow(1.0 - normalizedDistance, 3); // Cubic ease-in
    
    // Calculate zoom level with deadzone
    // In deadzone (0): 0.625 zoom (37.5% zoomed out - increased by 25%)
    // At world edges (1): 1.0 zoom (normal)
    const zoomRange = 0.375; // Range from normal to max zoom out (increased from 0.3)
    this.targetZoomLevel = 0.625 + easedDistance * zoomRange;
    
    // Clamp between 0.625 (37.5% zoomed out) and 1.0 (normal)
    this.targetZoomLevel = Math.max(0.625, Math.min(1.0, this.targetZoomLevel));
  }
  
  // Get current zoom level
  getZoomLevel() {
    return this.zoomLevel;
  }

  getTargetZoomLevel() {
    return this.targetZoomLevel;
  }

  setCinematicZoomOverride(level) {
    if (!Number.isFinite(level)) {
      return;
    }
    this.cinematicZoomOverride = Math.max(0.625, Math.min(1.2, level));
  }

  getCinematicZoomOverride() {
    return this.cinematicZoomOverride;
  }

  clearCinematicZoomOverride() {
    this.cinematicZoomOverride = null;
  }
  
  // Set zoom level manually
  setZoomLevel(level) {
    this.targetZoomLevel = Math.max(0.625, Math.min(1.0, level));
  }
};

// Global context cache to prevent recreation
let cachedCanvas = null;
let cachedContext = null;
let rendererInitialized = false;
let rendererInitializationAttempts = 0;
const MAX_RENDERER_INIT_ATTEMPTS = 10;

// Ensure renderer variable exists before initialization
if (typeof window.renderer === 'undefined') {
  window.renderer = null;
}

// Initialize renderer with proper context caching
function initializeRenderer() {
  if (rendererInitialized) {
    return; // Already initialized
  }
  
  rendererInitializationAttempts++;
  
  if (rendererInitializationAttempts > MAX_RENDERER_INIT_ATTEMPTS) {
    console.error('🚫 Renderer initialization failed after maximum attempts - creating fallback to prevent infinite loop');
    createFallbackRenderer();
    return;
  }
  
  try {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.warn(`Canvas not found, retrying... (attempt ${rendererInitializationAttempts}/${MAX_RENDERER_INIT_ATTEMPTS})`);
      setTimeout(initializeRenderer, 100);
      return;
    }
    
    // Cache canvas reference
    if (!cachedCanvas) {
      cachedCanvas = canvas;
    }
    
    // Get context only once
    if (!cachedContext) {
      try {
        cachedContext = canvas.getContext('2d');
        if (!cachedContext) {
          console.error('Failed to get 2D context from canvas');
          createFallbackRenderer();
          return;
        }
      } catch (contextError) {
        console.error('Error getting canvas context:', contextError?.message || contextError?.toString() || 'Unknown error');
        // CRITICAL: Check for any context-related error and stop retrying
        if (contextError.message && (
            contextError.message.includes('context creation limit') ||
            contextError.message.includes('Maximum number') ||
            contextError.message.includes('context limit')
        )) {
          console.error('🚫 Canvas context creation limit exceeded - possible infinite loop detected');
          createFallbackRenderer();
          return;
        }
        // CRITICAL: For any other context errors, also use fallback to prevent loops
        console.error('Canvas context error - using fallback renderer to prevent infinite loop');
        createFallbackRenderer();
        return;
      }
    }
    
    // Create renderer instance
    try {
      window.renderer = new window.Renderer(canvas, cachedContext);
      rendererInitialized = true;
      console.log('Renderer initialized successfully');
    } catch (rendererError) {
      console.error('Error creating renderer instance:', rendererError?.message || rendererError?.toString() || 'Unknown error');
      createFallbackRenderer();
    }
    
  } catch (error) {
    console.error('Error during renderer initialization:', error?.message || error?.toString() || 'Unknown error');
    // CRITICAL: Don't retry on general errors - use fallback to prevent loops
    createFallbackRenderer();
  }
}

function createFallbackRenderer() {
  console.log('Creating fallback renderer to prevent crashes and infinite loops');
  window.renderer = {
    clear: () => {
      // Minimal canvas clearing for fallback
      if (cachedCanvas && cachedContext) {
        try {
          cachedContext.clearRect(0, 0, cachedCanvas.width, cachedCanvas.height);
        } catch (error) {
          // Silent fail to prevent error spam
        }
      }
    },
    applyScreenShake: () => {},
    getTransformedContext: () => {
      // Return a safe context-like object
      if (cachedContext) {
        try {
          cachedContext.save();
          return cachedContext;
        } catch (error) {
          return { save: () => {}, restore: () => {} };
        }
      }
      return { save: () => {}, restore: () => {} };
    },
    restoreContext: () => {
      if (cachedContext) {
        try {
          cachedContext.restore();
        } catch (error) {
          // Silent fail
        }
      }
    },
    applyPostEffects: () => {},
    drawHealthBar: () => {},
    drawGlowText: () => {},
    update: () => {},
    addScreenShake: () => {},
    addGlitch: () => {},
    getZoomLevel: () => 1,
    getTargetZoomLevel: () => 1,
    setCinematicZoomOverride: () => {},
    getCinematicZoomOverride: () => null,
    clearCinematicZoomOverride: () => {},
    width: 1920,
    height: 1080,
    ctx: cachedContext || null,
    canvas: cachedCanvas || null,
    postEffects: false
  };
  rendererInitialized = true;
}

// Initialize renderer when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRenderer);
} else {
  initializeRenderer();
}
