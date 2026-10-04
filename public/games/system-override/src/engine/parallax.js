// Parallax background system for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/parallax.js',
  exports: ['ParallaxBackground', 'parallaxBackground'],
  dependencies: ['Vector2D', 'clamp']
});

window.ParallaxBackground = class ParallaxBackground {
  constructor() {
    this.layers = [];
    this.cameraX = 960; // Default camera center
    this.cameraY = 540;
    // Display positions retain the original 1279x462 source basis.
    // The new city art uses the same world transform and encounter regions.
    this.signalDisplays = [
      [96, 158, 69, 21, 0], [99, 273, 79, 13, 0], [270, 271, 74, 9, 0],
      [512, 159, 62, 67, 1], [488, 335, 53, 54, 1],
      [626, 215, 87, 32, 2], [632, 320, 124, 70, 2], [839, 240, 92, 16, 2],
      [1183, 185, 43, 60, 3], [1012, 350, 91, 41, 3], [1167, 344, 42, 46, 3]
    ];
    // Measured source-image positions: curb grilles, cable junctions and
    // shopfront pavement. The existing foreground transform owns placement.
    this.atmosphereVents = [[218, 440], [508, 440], [851, 440]];
    this.atmosphereCables = [[390, 214], [785, 201]];
    this.neonSpills = [[137, 404, 40], [305, 404, 49], [682, 404, 62], [1058, 404, 47], [1206, 404, 35]];
    this.atmosphereSprites = null;
    // Measured in the existing 2048x740 distant-city artwork. These accents
    // share its fixed transform; they never drift off their buildings.
    this.skylineWindows = [[372,386,4,10],[385,404,4,9],[562,415,5,12],
      [648,441,4,8],[870,368,4,9],[871,389,4,10],[944,491,5,4],
      [1027,553,3,9],[1164,586,6,17],[1185,581,6,18],[1373,401,4,7],
      [1578,544,4,9],[1808,506,3,8],[2015,430,5,12]];
    this.skylineVents = [[246,304],[552,312],[738,317],[826,323],[1192,316],[1604,324],[1935,334]];
    this.skyVideo = null;
    this.skyVideoGeneration = 0;
    this.skyPlayPending = false;
    this.skyPlaybackBlocked = false;
  }

  loadSkyAnimation(options = {}) {
    if (this.skyVideo || typeof window.document?.createElement !== 'function') return;
    const video = window.document.createElement('video');
    if (typeof video.play !== 'function') return;
    this.skyVideo = video; this.skyPlaybackBlocked = false;
    video.crossOrigin = 'anonymous'; video.muted = true; video.defaultMuted = true;
    video.loop = true; video.playsInline = true; video.preload = 'auto';
    const url = options.url || './assets/world-v3/animated-background/far-background-loop.mp4';
    const fallback = options.fallbackUrl ?? 'assets/world-v3/animated-background/far-background-loop.mp4';
    let usedFallback = false;
    video.onerror = () => {
      if (this.skyVideo !== video) return;
      if (!usedFallback && fallback && fallback !== url) {
        usedFallback = true; video.src = fallback; video.load();
      } else { this.skyPlaybackBlocked = true; video.pause(); }
    };
    video.src = url; video.load();
  }

  shouldPlaySkyAnimation() {
    const preferences = window.BARCODE?.Preferences?.values || {};
    return !!(window.isRunning && window.gameState?.running && !window.isPaused &&
      !window.gameState.paused && !window.gameState.gameOver && !preferences.reducedMotion &&
      preferences.flashes !== false && window.BARCODE_RENDER_QUALITY?.flashes !== false);
  }

  syncSkyPlayback() {
    const video = this.skyVideo;
    if (!video) return;
    const speed=window.BARCODE?.TacticalFocusClock?.isActive?.()?window.BARCODE.TacticalFocusClock.scale:1;
    if(video.playbackRate!==speed)video.playbackRate=speed;
    if (!this.shouldPlaySkyAnimation()) { if (!video.paused) video.pause(); return; }
    if (video.readyState < 2 || !video.paused || this.skyPlayPending || this.skyPlaybackBlocked) return;
    const generation = this.skyVideoGeneration;
    this.skyPlayPending = true;
    Promise.resolve(video.play()).then(() => {
      if (this.skyVideo !== video || !this.shouldPlaySkyAnimation()) video.pause();
    }).catch(error => {
      // Pausing/resetting while play is pending is normal. A real decode or
      // autoplay refusal keeps the existing static city rather than a blank.
      if (this.skyVideo === video && generation === this.skyVideoGeneration && error?.name !== 'AbortError') this.skyPlaybackBlocked = true;
    }).finally(() => {
      if (this.skyVideo === video && generation === this.skyVideoGeneration) this.skyPlayPending = false;
    });
  }

  resetSkyAnimation() {
    this.skyVideoGeneration++; this.skyPlayPending = false; this.skyPlaybackBlocked = false;
    if (!this.skyVideo) return;
    this.skyVideo.pause();
    if (this.skyVideo.readyState > 0) this.skyVideo.currentTime = 0;
  }

  disposeSkyAnimation() {
    this.skyVideoGeneration++; this.skyPlayPending = false;
    if (!this.skyVideo) return;
    const video = this.skyVideo; this.skyVideo = null;
    video.pause(); video.onerror = null; video.removeAttribute('src'); video.load();
  }
  
  // Add a parallax layer
  addLayer(options = {}) {
    const {
      image = null,
      imageUrl = '',
      fallbackImageUrl = '',
      x = 0,
      y = 0,
      width = 1920,
      height = 1080,
      scrollFactorX = 1.0, // 0 = no movement, 1 = moves with camera
      scrollFactorY = 1.0,
      opacity = 1.0,
      blendMode = 'source-over',
      repeatX = false, // Tile horizontally
      repeatY = false  // Tile vertically
    } = options;
    
    const layer = {
      image: image,
      imageUrl: imageUrl,
      fallbackImageUrl,
      x: x,
      y: y,
      width: width,
      height: height,
      scrollFactorX: scrollFactorX,
      scrollFactorY: scrollFactorY,
      opacity: opacity,
      blendMode: blendMode,
      repeatX: repeatX,
      repeatY: repeatY,
      loaded: false,
      imgElement: null
    };
    
    // Load image if URL provided
    if (imageUrl && !image) {
      this.loadImage(layer);
    } else if (image) {
      layer.loaded = true;
      layer.imgElement = image;
    }
    
    this.layers.push(layer);
    return layer;
  }
  
  // Load image for a layer
  loadImage(layer) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    let fallback = false;
    img.onload = () => { layer.imgElement = img; layer.loaded = true; img.onload = null; img.onerror = null; };
    img.onerror = () => {
      if (!fallback && layer.fallbackImageUrl) { fallback = true; img.src = layer.fallbackImageUrl; }
      else { img.onload = null; img.onerror = null; }
    };
    img.src = layer.imageUrl;
  }
  
  // Update camera position (call this every frame)
  updateCamera(x, y) {
    this.cameraX = x;
    this.cameraY = y;
  }
  
  // Calculate parallax offset for a layer with side-scroller camera
  getParallaxOffset(layer) {
    const canvasWidth = 1920;
    const canvasHeight = 1080;
    
    // Calculate camera position for side-scroller
    // Camera follows player but stays within world bounds
    let cameraX = this.cameraX;
    let cameraY = this.cameraY;
    
    // Keep camera within world boundaries (4096px wide world)
    const worldWidth = 4096;
    const halfCanvas = canvasWidth / 2;
    
    // Camera follows player with smooth constraints
    cameraX = window.clamp?.(cameraX, halfCanvas, worldWidth - halfCanvas) || cameraX;
    
    // Calculate offset relative to world center (2048px)
    const worldCenterX = worldWidth / 2;
    const cameraDeltaX = cameraX - worldCenterX;
    
    // Apply parallax scroll factor
    const offsetX = cameraDeltaX * layer.scrollFactorX;
    const offsetY = 0; // No vertical scrolling
    
    return { x: offsetX, y: offsetY };
  }
  
  // Draw a single layer
  drawLayer(ctx, layer) {
    if (!layer.loaded) {
      if (window.BARCODE_DEBUG_FRAME_OWNERSHIP) console.log('Layer not loaded, skipping');
      return;
    }
    
    ctx.save();
    
    // Enable high-quality image smoothing for clarity
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Set opacity and blend mode
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    
    // Calculate parallax offset
    const offset = this.getParallaxOffset(layer);
    
    if (window.BARCODE_DEBUG_FRAME_OWNERSHIP) console.log('Drawing layer:', {
      loaded: layer.loaded,
      hasImage: !!layer.imgElement,
      repeatX: layer.repeatX,
      repeatY: layer.repeatY,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      offsetX: offset.x,
      offsetY: offset.y
    });
    
    // Check if we have a fallback color (when image fails to load)
    if (layer.fallbackColor && !layer.imgElement) {
      // Draw fallback rectangle
      if (layer.repeatX) {
        // Draw tiled fallback
        this.drawTiledFallback(ctx, layer, offset);
      } else {
        // Draw single fallback rectangle
        const drawX = layer.x - offset.x;
        const drawY = layer.y - offset.y;
        ctx.fillStyle = layer.fallbackColor;
        ctx.fillRect(drawX, drawY, layer.width, layer.height);
      }
    } else if (layer.imgElement) {
      // Draw image
      if (layer.repeatX || layer.repeatY) {
        // Draw tiled pattern
        this.drawTiledLayer(ctx, layer, offset);
      } else {
        // Draw the image at native high resolution (4096x1479)
        ctx.save();
        // Set highest quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Draw at 4x size while maintaining quality
        ctx.save();
        // Set highest quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Draw at 30% smaller size (70% of 4x = 2.8x)
        ctx.save();
        // Set highest quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Calculate new size: 1.075x of original (40% smaller than 1.792x)
        const newWidth = 4400;
        const newHeight = 1589;
        // Side-scroller camera: background moves opposite to camera
        const drawX = 1920/2 - newWidth/2 - offset.x; // Center background and apply camera offset
        const drawY = -550; // Moved up 50px
        const image = layer.imgElement;
        // The city atlas has a one-pixel opaque export seam at its top edge.
        // It becomes visible only when following the high roofs.
        if (layer === this.layers[1]) {
          const iw=image.naturalWidth||image.width, ih=image.naturalHeight||image.height;
          const inset=2, offset=inset*newHeight/ih;
          ctx.drawImage(image,0,inset,iw,ih-inset,drawX,drawY+offset,newWidth,newHeight-offset);
        } else if (layer === this.layers[0]) this.drawFarBackground(ctx, layer, offset);
        else ctx.drawImage(image, drawX, drawY, newWidth, newHeight);
        this.drawSignalLights(ctx, layer, drawX, drawY, newWidth, newHeight);
        this.drawAtmosphere(ctx, layer, drawX, drawY, newWidth, newHeight);
        ctx.restore();
        ctx.restore();
        ctx.restore();
      }
    }
    
    ctx.restore();
  }

  drawFarBackground(ctx, layer, offset) {
    // Distant scenery has one screen-space scale. The gameplay camera may
    // zoom for framing, but walking must not make the skyline inflate.
    // This fixed overscan covers x=960..3136 and y=0..-1040, including roofs,
    // without a viewport-dependent resize or distortion of the original art.
    const image = layer.imgElement;
    const width = 4600;
    const height = width * (image.naturalHeight || image.height) / (image.naturalWidth || image.width);
    const cameraY = Math.max(-1040, Math.min(0, window.gameCamera?.y || 0));
    const x = 960 - width / 2 - offset.x, y = -560 - cameraY * 0.3;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const video = this.skyVideo;
    const preferences = window.BARCODE?.Preferences?.values || {};
    const animated = !preferences.reducedMotion && preferences.flashes !== false && window.BARCODE_RENDER_QUALITY?.flashes !== false;
    if (animated && video?.readyState >= 2 && !this.skyPlaybackBlocked && !video.error) {
      // H.264 needs an even width. Exclude its one padded column; the city
      // keeps the exact original aspect ratio and the existing fixed scale.
      ctx.drawImage(video, 0, 0, 2087, 754, x, y, width, height);
    } else ctx.drawImage(image, x, y, width, height);
    this.drawSkylineLife(ctx, x, y, width, height);
    ctx.restore();
  }

  drawSkylineLife(ctx, x, y, width, height) {
    // Sample the existing pause/reset-owned clock. No new timers, particles,
    // canvases, frame loops, random flicker or animation state in the draw pass.
    const preferences = window.BARCODE?.Preferences?.values || {};
    const still = preferences.reducedMotion || preferences.flashes === false || window.BARCODE_RENDER_QUALITY?.flashes === false;
    const time = still ? 0 : window.BARCODE?.combatFX?.timeMs ?? window.BARCODE?.stageFX?.timeMs ?? 0;
    const animateLights = !still;
    const quiet = window.sector1Progression?.isBossCombatLive?.() ? 0.45 : 1;
    const sx = width / 2048, sy = height / 740;
    const visible = (left, span) => x + (left + span) * sx >= -20 && x + left * sx <= 1940;
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy); ctx.shadowBlur = 0;
    for (const [i, [left, top, w, h]] of this.skylineWindows.entries()) {
      if (!visible(left, w)) continue;
      const breath = animateLights ? 0.5 + 0.5 * Math.sin(time / (1700 + i * 67) + i * 2.3) : 0.5;
      ctx.fillStyle = i % 4 === 0 ? '#a4ecd8' : '#ffce87';
      ctx.globalAlpha = (0.12 + breath * 0.28) * quiet;
      ctx.fillRect(left, top, w, h);
    }
    // Reuse the foreground's existing cached steam texture. The haze rises
    // slowly above chimney mouths and stays behind all foreground buildings.
    this.prepareAtmosphereSprites();
    const steam = this.atmosphereSprites?.steam;
    if (steam) for (const [i, [left, top]] of this.skylineVents.entries()) {
      if (!visible(left - 40, 90)) continue;
      for (let puff = 0; puff < 4; puff++) {
        const period = 9000 + i * 350;
        const phase = ((time + i * 1700 + puff * period / 4) % period) / period;
        const radius = 9 + phase * 27;
        const drift = phase * 34 + Math.sin(phase * 4 + i) * 4;
        ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.46 * quiet;
        ctx.drawImage(steam, left + drift - radius, top - phase * 115 - radius, radius * 2, radius * 2);
      }
    }
    // Sparse diagonal rain; a fixed analytic population cannot accumulate.
    // One path/stroke per frame and all of it remains in the background layer.
    ctx.globalAlpha = 0.40 * quiet; ctx.strokeStyle = '#bdcfcc'; ctx.lineWidth = 0.65;
    ctx.beginPath();
    for (let i = 0; i < (still ? 48 : 144); i++) {
      const left = ((i * 137.3 - time * (0.004 + i % 3 * 0.001)) % 2048 + 2048) % 2048;
      if (!visible(left - 3, 6)) continue;
      const top = (i * 89.7 + time * (0.04 + i % 4 * 0.005)) % 720;
      ctx.moveTo(left, top); ctx.lineTo(left - 2.5, top + 11);
    }
    ctx.stroke(); ctx.restore();
  }
  
  drawSignalLights(ctx, layer, x, y, width, height) {
    if (layer !== this.layers[1] || !layer.imgElement) return;
    const district = window.sector1Progression?.getDistrictSignalState?.();
    if (district?.active) { this.drawDistrictSignals(ctx, x, y, width, height, district); return; }
    if (window.sector1Progression?.isGameplaySuppressed?.()) return;
    const time = window.audioSystem?.context?.currentTime;
    const sample = window.BARCODE?.combatFX?.sceneSample ?? (Number.isFinite(time) ? window.BARCODE?.MusicTransport?.sample?.(time) : null);
    if (!sample?.running || !sample.grid || sample.profileId !== 'level-01.main') return;
    // Sign interiors measured in the approved 1279x462 foreground source.
    // Reuse the exact draw transform so camera motion cannot detach the light.
    const signs = [[99, 273, 79, 13], [270, 271, 74, 9], [626, 215, 87, 32],
      [839, 240, 92, 16], [1183, 185, 43, 60]];
    const sx = width / 1279, sy = height / 462;
    const pulse = this.getSceneMusic().pulse;
    const combatScale = window.sector1Progression?.isBossCombatLive?.() ? 0.35 : 1;
    ctx.save(); ctx.shadowBlur = 0;
    signs.forEach(([left, top, w, h], i) => {
      const screenX = x + left * sx;
      if (screenX + w * sx < -400 || screenX > 2320) return;
      const accent = i % 2 ? '204, 125, 255' : '113, 255, 229';
      ctx.fillStyle = `rgba(${accent}, ${(pulse * (window.rhythmSystem?.isActive?.() ? 0.38 : 0.12)) * combatScale})`;
      ctx.fillRect(screenX, y + top * sy, w * sx, h * sy);
    });
    ctx.restore();
  }

  drawDistrictSignals(ctx, x, y, width, height, district) {
    const sx = width / 1279, sy = height / 462;
    const { pulse, downbeat, beatFloat, quiet, performing, kick, combo, energy } = this.getSceneMusic();
    const preferences = window.BARCODE?.Preferences?.values || {};
    const animateScan = !preferences.reducedMotion && preferences.flashes !== false && window.BARCODE_RENDER_QUALITY?.flashes !== false;
    const restoredAt = worldX => district.restored ? 1 : district.wave
      ? Math.max(0, Math.min(1, (district.wave.radius - Math.abs(worldX - district.wave.originX)) / 200)) : 0;
    ctx.save();
    ctx.translate(x, y); ctx.scale(sx, sy); ctx.shadowBlur = 0;
    this.signalDisplays.forEach(([left, top, w, h, zone], index) => {
      if (!this.decorationVisible(left, w, x, sx)) return;
      const recovery = district.zones[zone].recovery;
      const response = window.BARCODE?.stageFX?.energyAt(-152 + (left + w / 2) * 4400 / 1279) || 0;
      const restored = restoredAt(-152 + (left + w / 2) * 4400 / 1279);
      const interference = district.interference * (1 - recovery * 0.65) * (1 - restored);
      // Opaque art remains visible. Corruption is a few slow, localized broken
      // scan lines; clearing the encounter brings steady light underneath them.
      ctx.fillStyle = `rgba(4, 8, 29, ${0.22 * interference})`;
      ctx.fillRect(left, top, w, h);
      ctx.fillStyle = `rgba(113, 255, 229, ${Math.min(0.65, recovery * 0.14 + restored * 0.16 + energy * 0.3 + response * 0.2) * quiet})`;
      ctx.fillRect(left, top, w, h);
      if (performing || kick > 0) {
        // Small equalizer bars stay inside the real sign interiors. Attacks
        // brighten the scene briefly; the beat alone never implies damage.
        ctx.fillStyle = `rgba(${(index + Math.floor(combo * 2)) % 2 ? '224,139,255' : '129,255,231'}, ${Math.min(0.9, 0.3 + energy * 0.45) * quiet})`;
        for (let bar = 0; bar < 8; bar++) {
          const level = this.equalizerLevel(index, bar, beatFloat, pulse);
          const barHeight = Math.min(h - 3, h * level * (0.6 + combo * 0.28 + energy * 0.2));
          ctx.fillRect(left + 2 + bar * (w - 4) / 8, top + h - 1.5 - barHeight, Math.max(1, (w - 4) / 11), barHeight);
        }
        ctx.fillRect(left, top + h - 1.5, w, 1.5);
        if (downbeat > 0.02) {
          ctx.fillStyle = `rgba(193,255,240,${downbeat * (0.28 + combo * 0.12) * quiet})`;
          ctx.fillRect(left, top, w, Math.min(1.5, h / 8));
        }
      }
      // Broadcast Gate's actual glass fills toward the twenty-defeat release.
      if (zone === 3 && !district.restored) {
        const build = Math.max(0, Math.min(1, ((window.sector1Progression?.missionDefeats || 0) - 14) / 6));
        ctx.fillStyle = `rgba(242,163,249,${(0.15 + build * 0.5) * quiet})`;
        ctx.fillRect(left + 1, top + h - 4, (w - 2) * build, 2);
      }
      const scan = ((animateScan ? district.elapsedMs / (150 + index % 4 * 45) : 0) + index * 7) % h;
      ctx.fillStyle = `rgba(214, 122, 246, ${0.22 * interference * quiet})`;
      for (let line = 0; line < 3 && interference > 0; line++) {
        const lineY = (scan + line * h / 3) % h;
        const lineX = left + (index * 11 + line * 13) % Math.max(1, w * 0.35);
        ctx.fillRect(lineX, top + lineY, w * 0.55, Math.min(1, h - lineY));
      }
      // A short recovery trace crosses each display, then settles. The final
      // wave lights these same displays in world order through the camera pan.
      const trace = Math.max(Math.sin(recovery * Math.PI), Math.sin(restored * Math.PI));
      if (trace > 0.001) {
        ctx.fillStyle = `rgba(176, 255, 239, ${trace * 0.55})`;
        ctx.fillRect(left, top + h - 2, w * Math.max(recovery, restored), 1.5);
      }
    });
    if (performing || kick > 0) {
      // Repeated curb segments make the musical reaction visible at full game
      // scale without tinting the whole screen or covering combat warnings.
      for (let left = 8; left < 1279; left += 24) {
        if (!this.decorationVisible(left, 15, x, sx)) continue;
        const tail = Math.max(0, 1 - ((Math.floor(left / 24) - beatFloat * 2) % 8 + 8) % 8 / 3);
        const accent = combo >= 0.5 && Math.floor(left / 192) % 2 ? '213,144,255' : '109,255,229';
        ctx.fillStyle = `rgba(${accent},${Math.min(0.8, 0.12 + energy * 0.22 + tail * 0.4 + downbeat * 0.15) * quiet})`;
        ctx.fillRect(left, 412, 15, 1.2 + tail * 1.2 + combo * 0.5);
      }
    }
    // Travel along the existing curb. Only two bounded fronts are drawn; the
    // wave is scenery behind actors, hazards and HUD, never a screen flash.
    if (district.wave) {
      const origin = (district.wave.originX + 152) * 1279 / 4400;
      const radius = district.wave.radius * 1279 / 4400;
      for (const direction of [-1, 1]) {
        const front = origin + direction * radius;
        if (front < 0 || front > 1279) continue;
        for (let segment = 0; segment < 8; segment++) {
          const left = front - direction * segment * 8;
          ctx.fillStyle = `rgba(142, 255, 227, ${(1 - segment / 8) * 0.65})`;
          ctx.fillRect(Math.max(0, Math.min(1275, left)), 412, 4, 2);
        }
      }
    }
    window.BARCODE?.stageFX?.drawArchitecture(ctx, this.getSceneMusic(), district);
    ctx.restore();
  }

  // Four distinct, bounded sign patterns sampled from the existing music
  // transport. No listener, independent beat timer or randomness in drawing.
  equalizerLevel(display, bar, beat, pulse) {
    const pattern = display % 4;
    if (pattern === 0) return 0.12 + 0.56 * (1 - Math.abs(bar - 3.5) / 4) * (0.4 + pulse * 0.6);
    if (pattern === 1) return 0.12 + 0.52 * Math.abs(Math.sin((bar % 4 + 1) * 0.48 + beat * 0.8));
    if (pattern === 2) return 0.14 + 0.5 * (0.5 + 0.5 * Math.sin(bar * 2.1 + Math.floor(beat / 2) * 1.7));
    return 0.12 + 0.56 * (0.5 + 0.5 * Math.sin(bar * 0.85 - beat * 1.4));
  }

  getSceneMusic() {
    const time = window.audioSystem?.context?.currentTime;
    // CombatFX retains the last active frame's snapshot during pause, even
    // though the paused transport intentionally exposes no judgment grid.
    const sample = window.BARCODE?.combatFX?.sceneSample ??
      (Number.isFinite(time) ? window.BARCODE?.MusicTransport?.sample?.(time) : null);
    const grid = sample?.running && sample.profileId === 'level-01.main' ? sample.grid : null;
    const preferences = window.BARCODE?.Preferences?.values || {};
    const animate = !preferences.reducedMotion && preferences.flashes !== false && window.BARCODE_RENDER_QUALITY?.flashes !== false;
    const pulse = grid ? (animate ? Math.pow(1 - grid.beatFloat % 1, 3) : 0.18) : 0;
    const downbeat = animate && grid?.beatInBar === 0 ? pulse : 0;
    const performing = !!window.rhythmSystem?.isActive?.();
    const combo = performing ? Math.min(1, Math.max(0, (window.rhythmSystem.combo || 0) - 4) / 6) : 0;
    const quiet = window.sector1Progression?.isBossCombatLive?.() ? 0.4 : 1;
    const kick = animate ? window.BARCODE?.combatFX?.sceneKick || 0 : 0;
    const phrase = animate && grid ? (Math.floor(grid.beatFloat / 4) % 4) / 3 : 0;
    const energy = performing ? 0.2 + pulse * 0.52 + downbeat * 0.22 + kick * 0.25 + combo * (0.2 + phrase * 0.18) : pulse * 0.08;
    return { pulse, downbeat, beatFloat: animate ? grid?.beatFloat || 0 : 0, quiet, performing, kick, combo, energy };
  }

  decorationVisible(left, width, imageX, scaleX) {
    const halfView = 960 / Math.max(0.4, window.renderer?.zoomLevel || 1);
    return imageX + (left + width) * scaleX >= 960 - halfView - 50 && imageX + left * scaleX <= 960 + halfView + 50;
  }

  prepareAtmosphereSprites() {
    if (this.atmosphereSprites !== null) return;
    this.atmosphereSprites = {};
    // Three tiny radial textures are reused for the lifetime of this owner.
    // A canvas-less diagnostic host can still draw the sparse solid details.
    if (typeof window.document?.createElement !== 'function') return;
    for (const [name, color] of [['steam', '192,213,225'], ['mint', '105,255,228'], ['purple', '214,132,255']]) {
      const canvas = window.document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext?.('2d');
      if (!ctx?.createRadialGradient) continue;
      const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      glow.addColorStop(0, `rgba(${color},1)`); glow.addColorStop(0.45, `rgba(${color},0.4)`); glow.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64);
      this.atmosphereSprites[name] = canvas;
    }
  }

  atmosphereQuietAt(sourceX) {
    const worldX = -152 + sourceX * 4400 / 1279;
    const boss = window.sector1Progression?.boss;
    if (window.sector1Progression?.isBossCombatLive?.() && ['telegraph', 'sweep'].includes(boss?.phase) &&
        (Math.abs(boss.x - worldX) < 280 || boss.slam && Math.abs(boss.slam.x - worldX) < 180)) return 0.25;
    for (const enemy of window.enemyManager?.enemies || []) {
      if (!enemy.active || Math.abs(enemy.position.x - worldX) > 240) continue;
      if (['brace', 'attack'].includes(enemy.combatPattern) || ['telegraph', 'dive'].includes(enemy.swooperState)) return 0.25;
    }
    return 1;
  }

  drawAtmosphere(ctx, layer, x, y, width, height) {
    if (layer !== this.layers[1] || !layer.imgElement) return;
    if (!this.decorationVisible(0, 1279, x, width / 1279)) return;
    this.prepareAtmosphereSprites();
    const sx = width / 1279, sy = height / 462;
    const preferences = window.BARCODE?.Preferences?.values || {};
    const still = preferences.reducedMotion || preferences.flashes === false || window.BARCODE_RENDER_QUALITY?.flashes === false;
    const time = still ? 0 : window.BARCODE?.combatFX?.timeMs ?? window.sector1Progression?.districtSignal?.elapsedMs ?? 0;
    const music = this.getSceneMusic();
    const sprites = this.atmosphereSprites;
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
    // The city is alive before the mission/music-driven sign takeover, too.
    // A slow light sweep stays inside each authored sign; no moving buildings.
    const animateLights = !still;
    for (const [index, [left, top, w, h]] of this.signalDisplays.entries()) {
      if (!this.decorationVisible(left, w, x, sx)) continue;
      const phase = ((time / (2600 + index % 4 * 650) + index * 0.17) % 1);
      ctx.save(); ctx.beginPath(); ctx.rect(left + 2, top + 2, w - 4, h - 4); ctx.clip();
      ctx.fillStyle = index % 2 ? '#ffacdb' : '#9affdf';
      ctx.globalAlpha = (animateLights ? 0.14 + Math.sin(phase * Math.PI) * 0.16 : 0.18) * music.quiet;
      ctx.globalAlpha *= this.atmosphereQuietAt(left + w / 2);
      ctx.fillRect(left + 2, top + 2, w - 4, h - 4);
      if (animateLights) {
        ctx.globalAlpha = 0.38 * music.quiet * this.atmosphereQuietAt(left + w / 2);
        ctx.fillRect(left + 2, top - 4 + phase * (h + 4), w - 4, 2);
      }
      ctx.restore();
    }
    // Foreground rain is visible from the sidewalk, behind actors and HUD.
    // Fixed analytic streaks add no particles, timers or growing collections.
    ctx.globalAlpha = 0.42 * music.quiet; ctx.strokeStyle = '#c6dcdc'; ctx.lineWidth = 0.45;
    ctx.beginPath();
    for (let i = 0; i < (still ? 64 : 184); i++) {
      const left = ((i * 91.73 - time * (0.006 + i % 3 * 0.001)) % 1279 + 1279) % 1279;
      if (!this.decorationVisible(left - 4, 8, x, sx) || this.atmosphereQuietAt(left) < 1 && i % 4 !== 0) continue;
      const top = (i * 57.29 + time * (0.095 + i % 4 * 0.012)) % 458;
      ctx.moveTo(left, top); ctx.lineTo(left - 3, top + 10);
    }
    ctx.stroke();
    for (const [index, [left, top, radius]] of this.neonSpills.entries()) {
      if (!this.decorationVisible(left - radius, radius * 2, x, sx)) continue;
      const sprite = sprites[index % 2 ? 'purple' : 'mint'];
      if (sprite) {
        const shimmer = animateLights ? 0.5 + 0.5 * Math.sin(time * Math.PI * 2 / (3600 + index * 510) + index) : 0.5;
        ctx.globalAlpha = (0.16 + shimmer * 0.08 + music.energy * 0.07) * music.quiet;
        ctx.drawImage(sprite, left - radius, top - 5, radius * 2, 16);
      }
      if (!still) {
        // Rain rings move inside the existing painted neon spill. Pavement
        // stays fixed; the two finite fronts share the frame-owned clock.
        ctx.strokeStyle = index % 2 ? '#d6a4eb' : '#b0ead8'; ctx.lineWidth = 0.65;
        for (let ring = 0; ring < 2; ring++) {
          const phase = ((time / (2400 + index * 290) + ring / 2 + index * 0.19) % 1);
          ctx.globalAlpha = (1 - phase) * 0.22 * music.quiet * this.atmosphereQuietAt(left);
          ctx.beginPath(); ctx.ellipse(left, top + 4, 8 + phase * radius * 0.6, 1 + phase * 2.5, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    for (const [index, [left, top]] of this.atmosphereVents.entries()) {
      if (!sprites.steam || !this.decorationVisible(left - 26, 62, x, sx)) continue;
      const quiet = music.quiet * this.atmosphereQuietAt(left);
      // Three finite puffs per vent, analytically sampled rather than emitted
      // into the gameplay particle array. Low puffs are occluded by the road.
      for (let puff = 0; puff < 3; puff++) {
        const period = 6600 + index * 850;
        const phase = ((time + index * 1730 + puff * 980) % period) / (4400 + index * 350);
        if (phase >= 1) continue;
        const radius = 8 + phase * 23;
        ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.50 * quiet;
        const drift = Math.sin(index * 2 + phase * 3) * 11;
        ctx.drawImage(sprites.steam, left + drift - radius, top - phase * 78 - radius, radius * 2, radius * 2);
      }
    }
    ctx.fillStyle = '#b7cdcf';
    for (let i = 0; i < 12; i++) {
      const left = (i * 109 + time * (0.0015 + i % 3 * 0.0003)) % 1279;
      if (!this.decorationVisible(left, 2, x, sx)) continue;
      ctx.globalAlpha = 0.14 * music.quiet * this.atmosphereQuietAt(left);
      ctx.fillRect(left, 395 + i % 4 * 4 + Math.sin(time / 2300 + i) * 4, 0.7, 0.7);
    }
    if (animateLights) {
      for (const [index, [left, top]] of this.atmosphereCables.entries()) {
        if (!this.decorationVisible(left - 12, 24, x, sx)) continue;
        const age = (time + index * 4700) % 11000;
        if (age >= 220) continue;
        const t = age / 220;
        ctx.globalAlpha = Math.sin(t * Math.PI) * 0.65 * music.quiet;
        ctx.strokeStyle = '#adfff0'; ctx.lineWidth = 0.7;
        for (let spark = 0; spark < 5; spark++) {
          const angle = spark * 2.4;
          ctx.beginPath(); ctx.moveTo(left + Math.cos(angle) * t * 8, top + Math.sin(angle) * t * 8);
          ctx.lineTo(left + Math.cos(angle) * (t * 8 + 2), top + Math.sin(angle) * (t * 8 + 2) + t * t * 5); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // Draw tiled fallback (when image fails to load)
  drawTiledFallback(ctx, layer, offset) {
    const canvasWidth = 1920;
    const canvasHeight = 1080;
    
    // Calculate starting positions
    let startX = layer.x - offset.x;
    let startY = layer.y - offset.y;
    
    // Use layer dimensions
    let tileWidth = layer.width;
    let tileHeight = layer.height;
    
    // For ground-attached elements, position at bottom of screen
    if (layer.scrollFactorY <= 0.01) {
      startY = 1080 - tileHeight;
    } else {
      startY = startY - tileHeight;
    }
    
    if (layer.repeatX) {
      startX = startX % tileWidth;
      if (startX > 0) startX -= tileWidth;
    }
    
    if (layer.repeatY) {
      startY = startY % tileHeight;
      if (startY > 0) startY -= tileHeight;
    }
    
    // Draw tiles
    ctx.fillStyle = layer.fallbackColor;
    for (let y = startY; y < canvasHeight + tileHeight; y += tileHeight) {
      for (let x = startX; x < canvasWidth + tileWidth; x += tileWidth) {
        ctx.fillRect(x, y, tileWidth, tileHeight);
      }
    }
  }
  
  // Draw tiled/repeating layer
  drawTiledLayer(ctx, layer, offset) {
    const canvasWidth = 1920;
    const canvasHeight = 1080;
    
    // Calculate starting positions
    let startX = layer.x - offset.x;
    let startY = layer.y - offset.y;
    
    // Initialize tile dimensions as mutable variables
    let tileWidth, tileHeight;
    
    // Position from bottom - use NATIVE dimensions
    const imgHeight = layer.imgElement.height;
    tileHeight = layer.height;
    // Position the image to show the upper portion
    if (layer.scrollFactorY <= 0.01) {
      startY = -500; // Show upper portion of the image
    } else {
      startY = startY - tileHeight;
    }
    
    // If repeating, we need to draw enough tiles to cover the screen
    const imgWidth = layer.imgElement.width;
    
    // Use custom dimensions if specified, otherwise native image size
    tileWidth = layer.width || imgWidth;
    
    if (layer.repeatX) {
      // Wrap around for seamless tiling using tile dimensions
      startX = startX % tileWidth;
      if (startX > 0) startX -= tileWidth;
    }
    
    if (layer.repeatY) {
      // Wrap around for seamless tiling using tile dimensions
      startY = startY % tileHeight;
      if (startY > 0) startY -= tileHeight;
    }
    
    // Use NATIVE image dimensions - NO scaling
    tileWidth = imgWidth;
    tileHeight = imgHeight;
    
    for (let y = startY; y < canvasHeight + tileHeight; y += tileHeight) {
      for (let x = startX; x < canvasWidth + tileWidth; x += tileWidth) {
        // Draw at NATIVE size - no width/height parameters
        ctx.drawImage(layer.imgElement, x, y);
      }
    }
  }
  
  // Draw all layers (call this in your render loop)
  draw(ctx) {
    if (window.BARCODE_DEBUG_FRAME_OWNERSHIP) console.log('🔧 Parallax draw called with', this.layers.length, 'layers');
    // Draw layers in order (back to front)
    this.layers.forEach((layer, index) => {
      if (window.BARCODE_DEBUG_FRAME_OWNERSHIP) console.log('Drawing layer', index);
      this.drawLayer(ctx, layer);
    });
  }
  
  // Get layer by index
  getLayer(index) {
    return this.layers[index];
  }
  
  // Remove layer
  removeLayer(index) {
    if (index >= 0 && index < this.layers.length) {
      this.layers.splice(index, 1);
    }
  }
  
  // Clear all layers
  clear() {
    this.disposeSkyAnimation();
    this.layers = [];
  }
  
  // Check if all layers are loaded
  isLoaded() {
    return this.layers.every(layer => layer.loaded);
  }
  
  // Get loading progress (0-1)
  getLoadingProgress() {
    if (this.layers.length === 0) return 1;
    const loaded = this.layers.filter(layer => layer.loaded).length;
    return loaded / this.layers.length;
  }
};

// Initialize global parallax background
window.parallaxBackground = null;

// Initialize parallax system
window.initParallax = function() {
  try {
    if (window.parallaxBackground) {
      window.parallaxBackground.loadSkyAnimation();
      return true;
    }
    window.parallaxBackground = new window.ParallaxBackground();
    
    // Add background layer (backmost) - slower parallax for depth
    const backgroundLayer = window.parallaxBackground.addLayer({
      imageUrl: './assets/world-v3/far-background.webp',
      fallbackImageUrl: 'assets/world-v3/far-background.webp',
      scrollFactorX: 0.5, // Slower parallax for background depth
      scrollFactorY: 0, // No vertical movement
      opacity: 1.0, // Full opacity
      repeatX: false, // No tiling
      repeatY: false,
      x: 0, // Start from left edge
      y: -100, // Position for background layer
      width: 4096,
      height: 1479
    });
    
    // Add foreground layer (frontmost) - side-scroller camera follows player
    const foregroundLayer = window.parallaxBackground.addLayer({
      imageUrl: './assets/world-v3/buildings.webp',
      fallbackImageUrl: 'assets/world-v3/buildings.webp',
      scrollFactorX: 1.0, // Full parallax scrolling for side-scroller camera
      scrollFactorY: 0, // No vertical movement
      opacity: 1.0, // Full opacity
      repeatX: false, // No tiling
      repeatY: false,
      x: 0, // Start from left edge
      y: -200, // Show upper portion
      width: 4096,
      height: 1479
    });
    
    console.log('✓ Parallax background initialized with 2 layers (BG + FG)');
    window.parallaxBackground.loadSkyAnimation();
    
    // Test if images load
    setTimeout(() => {
      console.log('Background image loading check - loaded:', backgroundLayer.loaded, 'hasImage:', !!backgroundLayer.imgElement);
      console.log('Foreground image loading check - loaded:', foregroundLayer.loaded, 'hasImage:', !!foregroundLayer.imgElement);
      
      if (!backgroundLayer.loaded) {
        console.error('❌ Background image failed to load completely');
        backgroundLayer.fallbackColor = '#1a0a2a'; // Dark purple fallback
        backgroundLayer.loaded = true;
      }
      
      if (!foregroundLayer.loaded) {
        console.error('❌ Foreground image failed to load completely');
        foregroundLayer.fallbackColor = '#2a0a4a'; // Lighter purple fallback
        foregroundLayer.loaded = true;
      }
    }, 3000);
    
    return true;
    
  } catch (error) {
    console.error('Failed to initialize parallax background:', error?.message || error?.toString() || 'Unknown error');
    return false;
  }
};
