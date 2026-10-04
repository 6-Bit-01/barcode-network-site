// Dynamic arrow indicator for off-screen broadcast jammers
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/jammer-arrow-indicator.js',
  exports: ['JammerArrowIndicator'],
  dependencies: ['Vector2D', 'distance', 'clamp']
});

// Arrow indicator system for pointing to off-screen jammers
window.JammerArrowIndicator = class JammerArrowIndicator {
  constructor() {
    this.target = null;
    this.screenWidth = 1920;
    this.screenHeight = 1080;
    this.edgeMargin = 60;
    this.arrowSize = 40;
    this.pulseAnimation = 0;
    this.visible = false;
  }
  
  // Set the target jammer to track
  setTarget(jammerEnemy) {
    this.target = jammerEnemy;
    this.visible = !!jammerEnemy;
  }
  
  // Update animation and visibility
  update(deltaTime) {
    this.pulseAnimation += deltaTime / 1000;
    
    // Check if target is still valid and active
    if (this.target && !this.target.active) {
      this.target = null;
      this.visible = false;
    }
    
    if (!this.target) {
      this.visible = false;
      return;
    }
    
    // Calculate if jammer is on-screen
    const camera = window.gameCamera || { x: 0, y: 0 };
    const screenLeft = camera.x;
    const screenRight = camera.x + this.screenWidth;
    const screenTop = camera.y;
    const screenBottom = camera.y + this.screenHeight;
    
    const jammerX = this.target.position.x;
    const jammerY = this.target.position.y;
    
    // Check if jammer is visible on screen
    this.visible = !(jammerX >= screenLeft && jammerX <= screenRight && 
                     jammerY >= screenTop && jammerY <= screenBottom);
  }
  
  // Calculate arrow position and rotation
  calculateArrowPosition() {
    if (!this.target || !this.visible) return null;
    
    const camera = window.gameCamera || { x: 0, y: 0 };
    const screenCenterX = camera.x + this.screenWidth / 2;
    const screenCenterY = camera.y + this.screenHeight / 2;
    
    const jammerX = this.target.position.x;
    const jammerY = this.target.position.y;
    
    // Calculate direction from screen center to jammer
    const dx = jammerX - screenCenterX;
    const dy = jammerY - screenCenterY;
    const angle = Math.atan2(dy, dx);
    
    // Calculate intersection with screen edges
    const screenLeft = camera.x + this.edgeMargin;
    const screenRight = camera.x + this.screenWidth - this.edgeMargin;
    const screenTop = camera.y + this.edgeMargin;
    const screenBottom = camera.y + this.screenHeight - this.edgeMargin;
    
    let arrowX, arrowY;
    
    // Check which edge the arrow should be on
    if (Math.abs(dx) > Math.abs(dy)) {
      // Left or right edge
      if (dx > 0) {
        // Right edge
        arrowX = screenRight;
        const t = (arrowX - screenCenterX) / dx;
        arrowY = screenCenterY + dy * t;
        
        // Clamp to screen bounds
        arrowY = Math.max(screenTop, Math.min(screenBottom, arrowY));
      } else {
        // Left edge
        arrowX = screenLeft;
        const t = (arrowX - screenCenterX) / dx;
        arrowY = screenCenterY + dy * t;
        
        // Clamp to screen bounds
        arrowY = Math.max(screenTop, Math.min(screenBottom, arrowY));
      }
    } else {
      // Top or bottom edge
      if (dy > 0) {
        // Bottom edge
        arrowY = screenBottom;
        const t = (arrowY - screenCenterY) / dy;
        arrowX = screenCenterX + dx * t;
        
        // Clamp to screen bounds
        arrowX = Math.max(screenLeft, Math.min(screenRight, arrowX));
      } else {
        // Top edge
        arrowY = screenTop;
        const t = (arrowY - screenCenterY) / dy;
        arrowX = screenCenterX + dx * t;
        
        // Clamp to screen bounds
        arrowX = Math.max(screenLeft, Math.min(screenRight, arrowX));
      }
    }
    
    // Convert to screen coordinates (relative to camera)
    const screenX = arrowX - camera.x;
    const screenY = arrowY - camera.y;
    
    return {
      x: screenX,
      y: screenY,
      angle: angle,
      distance: Math.sqrt(dx * dx + dy * dy)
    };
  }
  
  // Draw the arrow indicator
  draw(ctx) {
    if (!this.visible || !this.target) return;
    
    const arrowPos = this.calculateArrowPosition();
    if (!arrowPos) return;
    
    ctx.save();
    
    // Pulsing effect
    const pulseScale = 1 + Math.sin(this.pulseAnimation * 3) * 0.1;
    const alpha = 0.7 + Math.sin(this.pulseAnimation * 2) * 0.3;
    
    ctx.globalAlpha = alpha;
    ctx.translate(arrowPos.x, arrowPos.y);
    ctx.rotate(arrowPos.angle);
    ctx.scale(pulseScale, pulseScale);
    
    // Draw arrow shape
    ctx.fillStyle = '#ff00ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    
    // Arrow pointing right (will be rotated)
    ctx.beginPath();
    ctx.moveTo(-this.arrowSize/2, -this.arrowSize/3);
    ctx.lineTo(this.arrowSize/2, 0);
    ctx.lineTo(-this.arrowSize/2, this.arrowSize/3);
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
    
    // Draw distance indicator
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = '#ff00ff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(arrowPos.distance)}m`, arrowPos.x, arrowPos.y + 30);
    
    // Draw "JAMMER" label
    ctx.font = 'bold 12px monospace';
    ctx.fillText('JAMMER', arrowPos.x, arrowPos.y - 35);
    
    ctx.restore();
  }
};

// Create global instance
function createJammerArrowIndicator() {
  window.jammerArrowIndicator = new window.JammerArrowIndicator();
  console.log('🧭 Jammer Arrow Indicator initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createJammerArrowIndicator);
} else {
  createJammerArrowIndicator();
}