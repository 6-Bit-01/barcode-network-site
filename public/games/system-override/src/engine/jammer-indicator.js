// Single screen-space Broadcast Jammer guidance owner for BARCODE: System Override.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/jammer-indicator.js',
  exports: ['JammerIndicator', 'jammerIndicator', 'initJammerIndicator'],
  dependencies: ['distance', 'clamp']
});

window.JammerIndicator = class JammerIndicator {
  constructor() {
    this.active = false;
    this.targetBounds = null;
    this.indicatorPosition = { x: 960, y: 540 };
    this.angle = 0;
    this.distance = 0;
    this.pulsePhase = 0;
    this.alpha = 0;
    this.animationTime = 0;
    this.lastToggleTime = 0;
    this.fadeInTime = 500;
    this.fadeOutTime = 300;
    this.arrowSize = 40;
    this.indicatorColor = '#d8ff57';
    this.glowColor = '#aeff51';
    this.safeArea = Object.freeze({ left: 80, right: 1840, top: 180, bottom: 770 });
    this.gameplayViewport = Object.freeze({ left: 0, right: 1920, top: 0, bottom: 850 });
    this.lastProjection = null;
  }

  reset() {
    this.active = false;
    this.targetBounds = null;
    this.alpha = 0;
    this.distance = 0;
    this.lastProjection = null;
  }

  getZoom() {
    const value = window.renderer && typeof window.renderer.getZoomLevel === 'function'
      ? window.renderer.getZoomLevel()
      : window.renderer?.zoomLevel;
    return Math.max(0.1, Number.isFinite(value) ? value : 1);
  }

  getCameraCenter(playerX) {
    if (window.gameCamera && Number.isFinite(window.gameCamera.centerX)) return window.gameCamera.centerX;
    const fallback = Number.isFinite(playerX) ? playerX : 960;
    return window.clamp ? window.clamp(fallback, 960, 3136) : Math.max(960, Math.min(3136, fallback));
  }

  worldToScreen(point, cameraCenter, zoom) {
    const verticalOffset = 250 * (1 - zoom);
    return {
      x: 960 + zoom * (point.x - cameraCenter),
      y: 425 + verticalOffset + zoom * (point.y - (window.sector1Progression?.getCameraY?.() || 0) - 425)
    };
  }

  normalizeTarget(target) {
    if (!target) return null;
    if (Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.width) && Number.isFinite(target.height)) {
      return { x: target.x, y: target.y, width: target.width, height: target.height };
    }
    if (Number.isFinite(target.x) && Number.isFinite(target.y)) return { x: target.x, y: target.y, width: 0, height: 0 };
    return null;
  }

  projectBounds(bounds, cameraCenter, zoom) {
    const topLeft = this.worldToScreen({ x: bounds.x, y: bounds.y }, cameraCenter, zoom);
    const bottomRight = this.worldToScreen({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, cameraCenter, zoom);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
      centerX: (topLeft.x + bottomRight.x) / 2,
      centerY: (topLeft.y + bottomRight.y) / 2
    };
  }

  intersectsGameplayViewport(projected) {
    const viewport = this.gameplayViewport;
    return projected.x + projected.width >= viewport.left && projected.x <= viewport.right &&
      projected.y + projected.height >= viewport.top && projected.y <= viewport.bottom;
  }

  update(deltaTime, jammerTarget, playerX, playerY) {
    const elapsed = Number.isFinite(deltaTime) && deltaTime >= 0 ? deltaTime : 0;
    this.animationTime += elapsed;
    const bounds = this.normalizeTarget(jammerTarget);
    if (!bounds) {
      this.targetBounds = null;
      this.hide();
      this.updateAlpha();
      return;
    }

    this.targetBounds = bounds;
    const cameraCenter = this.getCameraCenter(playerX);
    const zoom = this.getZoom();
    const projectedTarget = this.projectBounds(bounds, cameraCenter, zoom);
    const projectedPlayer = this.worldToScreen({
      x: Number.isFinite(playerX) ? playerX : cameraCenter,
      y: Number.isFinite(playerY) ? playerY : 750
    }, cameraCenter, zoom);
    this.distance = Math.hypot(projectedTarget.centerX - projectedPlayer.x, projectedTarget.centerY - projectedPlayer.y) / zoom;
    this.lastProjection = { cameraCenter, zoom, target: projectedTarget, player: projectedPlayer };

    if (this.intersectsGameplayViewport(projectedTarget)) {
      this.hide();
    } else {
      this.show();
      this.placeAtSafeEdge(projectedPlayer, projectedTarget);
    }

    this.pulsePhase += elapsed / 1000 * 3;
    this.updateAlpha();
  }

  placeAtSafeEdge(player, target) {
    // A street-level player can project below the HUD-safe bottom. Casting
    // from that clamped point then hits the bottom at t=0, over the player.
    // For a Jammer beyond either side, keep its cue on that screen edge and
    // clamp only the height; aim the artwork from the cue toward the target.
    const offLeft = target.x + target.width < this.gameplayViewport.left;
    const offRight = target.x > this.gameplayViewport.right;
    if (offLeft || offRight) {
      const x = offLeft ? this.safeArea.left : this.safeArea.right;
      const dx = target.centerX - player.x;
      const y = player.y + (target.centerY - player.y) * (x - player.x) / dx;
      this.indicatorPosition = {
        x,
        y: Math.max(this.safeArea.top, Math.min(this.safeArea.bottom, y))
      };
      this.angle = Math.atan2(target.centerY - this.indicatorPosition.y, target.centerX - x);
      return;
    }

    const origin = {
      x: Math.max(this.safeArea.left, Math.min(this.safeArea.right, player.x)),
      y: Math.max(this.safeArea.top, Math.min(this.safeArea.bottom, player.y))
    };
    const dx = target.centerX - origin.x;
    const dy = target.centerY - origin.y;
    this.angle = Math.atan2(dy, dx);
    const candidates = [];

    if (dx > 0) candidates.push({ t: (this.safeArea.right - origin.x) / dx, edge: 'right' });
    if (dx < 0) candidates.push({ t: (this.safeArea.left - origin.x) / dx, edge: 'left' });
    if (dy > 0) candidates.push({ t: (this.safeArea.bottom - origin.y) / dy, edge: 'bottom' });
    if (dy < 0) candidates.push({ t: (this.safeArea.top - origin.y) / dy, edge: 'top' });

    const intersections = candidates
      .filter(candidate => Number.isFinite(candidate.t) && candidate.t >= 0)
      .map(candidate => ({ x: origin.x + dx * candidate.t, y: origin.y + dy * candidate.t, t: candidate.t, edge: candidate.edge }))
      .filter(point => point.x >= this.safeArea.left - 0.001 && point.x <= this.safeArea.right + 0.001 && point.y >= this.safeArea.top - 0.001 && point.y <= this.safeArea.bottom + 0.001)
      .sort((a, b) => a.t - b.t);

    const selected = intersections[0] || origin;
    this.indicatorPosition = { x: selected.x, y: selected.y };
  }

  show() {
    if (!this.active) {
      this.active = true;
      this.lastToggleTime = this.animationTime;
    }
  }

  hide() {
    if (this.active) {
      this.active = false;
      this.lastToggleTime = this.animationTime;
    }
  }

  updateAlpha() {
    const timeSinceToggle = this.animationTime - this.lastToggleTime;
    if (this.active) this.alpha = timeSinceToggle < this.fadeInTime ? timeSinceToggle / this.fadeInTime : 1;
    else this.alpha = timeSinceToggle < this.fadeOutTime ? 1 - timeSinceToggle / this.fadeOutTime : 0;
    if (this.active && this.alpha > 0) this.alpha *= Math.sin(this.pulsePhase) * 0.3 + 0.7;
  }

  draw(ctx) {
    if (!ctx || !this.active || this.alpha <= 0 || !this.targetBounds) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.indicatorPosition.x, this.indicatorPosition.y);
    ctx.rotate(this.angle);
    this.drawGlow(ctx);
    this.drawArrow(ctx);
    this.drawDistance(ctx);
    ctx.restore();
  }

  drawGlow(ctx) {
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.arrowSize * 2);
    gradient.addColorStop(0, this.glowColor + '40');
    gradient.addColorStop(0.5, this.glowColor + '20');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, this.arrowSize * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawArrow(ctx) {
    if (window.BARCODE?.PresentationAssets?.draw('directionArrow', ctx, { width: 106 })) return;
    const size = this.arrowSize;
    const fill = ctx.createLinearGradient(-size, 0, size, 0);
    fill.addColorStop(0, this.indicatorColor + '80');
    fill.addColorStop(1, this.indicatorColor);
    ctx.fillStyle = fill;
    ctx.strokeStyle = this.glowColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.5, -size * 0.5);
    ctx.lineTo(-size * 0.2, 0);
    ctx.lineTo(-size * 0.5, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawDistance(ctx) {
    const text = this.distance < 1000 ? `${Math.round(this.distance)}m` : `${(this.distance / 1000).toFixed(1)}km`;
    ctx.save();
    ctx.rotate(-this.angle);
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const width = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(-width / 2, this.arrowSize + 10, width, 22);
    ctx.strokeStyle = this.glowColor;
    ctx.strokeRect(-width / 2, this.arrowSize + 10, width, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 0, this.arrowSize + 14);
    ctx.restore();
  }

  static hasOffScreenJammer(_enemies, playerX, playerY) {
    const bounds = window.BARCODE?.JammerEnvironment?.getAimBounds?.();
    if (!bounds) return false;
    const indicator = new window.JammerIndicator();
    indicator.update(16, bounds, playerX, playerY);
    return indicator.active;
  }

  static getNearestOffScreenJammer(_enemies, playerX, playerY) {
    const bounds = window.BARCODE?.JammerEnvironment?.getAimBounds?.();
    if (!bounds) return null;
    const indicator = new window.JammerIndicator();
    indicator.update(16, bounds, playerX, playerY);
    return indicator.active ? { position: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, environmental: true, active: true } : null;
  }
};

window.jammerIndicator = null;
window.initJammerIndicator = function() {
  try {
    if (!window.jammerIndicator) window.jammerIndicator = new window.JammerIndicator();
    return true;
  } catch (error) {
    console.error('Failed to initialize jammer indicator:', error?.message || error);
    return false;
  }
};
