// Rhythm-based combat system for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/rhythm.js',
  exports: ['RhythmSystem', 'rhythmSystem'],
  dependencies: ['randomRange', 'clamp']
});

window.RhythmSystem = class RhythmSystem {
  constructor() {
    this.active = false; // Visual visibility - R key toggles this
    this.running = false; // Background rhythm processing - always runs
    this.bpm = 180;
    this.beatInterval = 60000 / this.bpm;
    
    // Calculate 4-beat bar timing for display
    this.barDuration = this.beatInterval * 4; // 4 beats per bar
    this.beatsPerBar = 4;
    console.log(`Rhythm timing: ${this.bpm} BPM, beatInterval=${this.beatInterval.toFixed(1)}ms, barDuration=${this.barDuration.toFixed(1)}ms`); // milliseconds
    this.lastBeatTime = 0;
    
    // Simple beat tracking for progress bar
    this.currentBarBeat = 0; // Which beat in current bar (0-3)
    this.barProgress = 0; // Visual progress within current beat (0.0 to 1.0)
    
    // Tempo Establishment System (16 distinctive beats)
    this.tempoEstablishmentBeats = 16; // First 16 beats establish song tempo
    this.currentTempoBeat = 0; // Current tempo establishment beat (1-16)
    this.tempoEstablished = false; // Tempo established after 16 beats
    
    // Beat-aligned timing windows - centered on each beat
    this.excellentWindow = 50; // Excellent timing window (±25ms around beat)
    this.perfectWindow = 100; // Perfect timing window (±50ms around beat)
    this.goodWindow = 200; // Good timing window (±100ms around beat)
    this.timingOffset = 0; // No offset - hit on actual beats
    this.timeSinceBeat = 0; // Track time since last beat for drawing
    
    // Beat window tracking
    this.currentBeatWindow = 0; // Which beat window we're currently in
    this.beatHitZones = []; // Active hit zones for each beat
    this.maxBeatWindows = 4; // Track up to 4 beats ahead
    
    // Input debouncing to prevent multiple rapid inputs
    this.lastInputTime = 0;
    this.inputDebounceMs = 100; // Minimum time between inputs
    
    // Visual feedback
    this.beatIndicator = { x: 0, y: 0, scale: 1, opacity: 1 };
    this.combo = 0;
    this.maxCombo = 0;
    this.score = 0;
    
    // Hit windows for attack animations (built into timing)
    this.attackWindows = {
      startWindow: 100, // Window at beginning of attack (ms)
      endWindow: 100,   // Window at end of attack (ms)
      activeAttack: false,
      attackStartTime: 0
    };
    
    // Simple rhythm - hit every beat for consistency
    this.patterns = [
      [1, 1, 1, 1, 1, 1, 1], // Every beat is a hit beat
    ];
    this.currentPattern = 0;
    this.patternIndex = 0;
    
    // Visual effects
    this.particles = [];
    this.beatEffects = [];
  }
  
  // Reset combo with visual feedback
  resetCombo() {
    if (this.combo > 0) {
      console.log(`Combo reset: ${this.combo} → 0`);
      this.combo = 0;
      
      // Visual feedback for combo reset
      this.createParticles(this.beatIndicator.x, this.beatIndicator.y, '#ff0000');
      
      // Play combo break sound
      if (window.audioSystem && window.audioSystem.isInitialized()) {
        window.audioSystem.playSound('synthHit', 0.3);
      }
    }
  }

  // Start visual rhythm mode (R key pressed) - rhythm already running in background
  showRhythmMode(bpm = 180) {
    if (!this.running) {
      this.startBackgroundRhythm(bpm);
    }
    
    this.active = true; // Make visual elements visible
    this.combo = 0;
    this.score = 0;
    
    // Reset input debouncing
    this.lastInputTime = 0;
    
    // CRITICAL: Force start audio layer beat sync
    if (window.audioSystem && window.audioSystem.isInitialized()) {
      console.log('🎵 Starting layer beat sync for rhythm mode');
      window.audioSystem.startLayerBeatSync();
    } else {
      console.log('⚠️ Audio system not initialized for rhythm beat sync');
    }
    
    console.log('🔍 DEBUG: showRhythmMode called, current state:');
    console.log('  - this.running:', this.running);
    console.log('  - this.lastBeatTime:', this.lastBeatTime);
    console.log('  - window.audioSystem exists:', !!window.audioSystem);
    console.log('  - audioSystem initialized:', window.audioSystem?.isInitialized?.());
  }
  
  // Hide visual rhythm mode (R key pressed again)
  hideRhythmMode() {
    this.active = false; // Hide visual elements
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.resetCombo(); // Reset combo when hiding rhythm mode
    console.log('Rhythm mode hidden - combo reset to 0, background rhythm continues');
  }
  
  // Start background rhythm processing (runs continuously)
  startBackgroundRhythm(bpm = 180) {
    if (this.running) return; // Already running
    
    this.running = true;
    this.bpm = bpm;
    this.beatInterval = 60000 / this.bpm;
    this.lastBeatTime = 0; // Wait for first audio beat
    this.patternIndex = 0;
    this.currentPattern = Math.floor(Math.random() * this.patterns.length);
    
    // Initialize simple beat tracking - nothing starts until first audio beat
    this.currentBarBeat = 0;
    this.barProgress = 0;
    
    // Start audio layers for continuous background rhythm
    if (window.audioSystem && window.audioSystem.isInitialized()) {
      // Start layer beat sync instead of individual rhythm track
      window.audioSystem.startLayerBeatSync();
      window.audioSystem.startRhythm(bpm); // Still call to ensure BPM is set
      console.log('Audio system started - waiting for first beat from audio');
      console.log('Audio system available:', !!window.audioSystem);
      console.log('Audio system initialized:', window.audioSystem.isInitialized());
      console.log('Has syncWithAudioBeat method:', typeof window.audioSystem.syncWithAudioBeat);
    } else {
      console.log('Audio system not initialized - rhythm system will run without audio');
    }
    
    // Initialize beat indicator
    this.beatIndicator = { 
      x: 960, 
      y: 100, 
      scale: 1, 
      opacity: 1 
    };
    
    console.log(`Rhythm started: ${bpm} BPM, beatInterval: ${this.beatInterval}ms`);
    console.log(`Timing windows: Excellent=±${this.excellentWindow/2}ms, Perfect=±${this.perfectWindow/2}ms, Good=±${this.goodWindow/2}ms (beat-aligned)`);
    
    // Attack timing window integration
    this.attackBeatCounter = 0;
    this.nextAttackBeat = 3; // First attack window after 3 beats
  }

  stop() {
    this.active = false;
    this.running = false;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.resetCombo(); // Reset combo when stopping
    
    // Stop both rhythm track and layer beat sync
    if (window.audioSystem && window.audioSystem.isInitialized()) {
      window.audioSystem.stopRhythm();
      window.audioSystem.stopLayerBeatSync();
    }
    
    console.log('Rhythm system stopped - combo reset to 0');
  }

  update(deltaTime) {
    try {
      // Always update background rhythm if running, regardless of visual visibility
      if (!this.running) return;
      
      const currentTime = performance.now();
      
      // Only update if we've had first beat from audio system
      if (this.lastBeatTime === 0) {
        // Still waiting for first audio beat - no progress yet
        this.timeSinceBeat = 0;
        this.barProgress = 0;
        return;
      }
      
      // Update time since last beat
      this.timeSinceBeat = currentTime - this.lastBeatTime;
      
      // Check for missed beats - more aggressive auto-reset
      if (this.active && this.combo > 0) {
        const beatProgress = this.timeSinceBeat / this.beatInterval;
        const nearestBeatDistance = Math.min(beatProgress, 1 - beatProgress) * this.beatInterval;
        
        // CRITICAL: Auto-reset if we're past the good window without input
        if (nearestBeatDistance > this.goodWindow / 2) {
          console.log(`AUTO-RESET: Past timing window (${nearestBeatDistance.toFixed(0)}ms > ${this.goodWindow/2}ms), combo was ${this.combo}`);
          this.resetCombo();
        }
      }
      
      // Update beat progress
      this.barProgress = Math.min(1.0, Math.max(0.0, this.timeSinceBeat / this.beatInterval));
      
      // Check if we should trigger beat based on time - more precise
      if (this.timeSinceBeat >= this.beatInterval) {
        this.triggerBeat();
        // Set beat time more precisely to prevent drift - use exact timing instead of performance.now() reset
        const excessTime = this.timeSinceBeat - this.beatInterval;
        this.lastBeatTime = currentTime - excessTime; // Keep excess time for smooth progression
        this.timeSinceBeat = excessTime; // Don't reset to 0, keep the excess
      }
      
      // Update beat indicator animation
      const beatProgress = Math.min(1.0, Math.max(0.0, this.timeSinceBeat / this.beatInterval));
      this.beatIndicator.scale = 1 + (1 - beatProgress) * 0.3; // Shrinks as beat approaches
      this.beatIndicator.opacity = 0.5 + beatProgress * 0.5; // Fades in as beat approaches
      
      // Check for rhythm mode deactivation and reset combo
      if (!this.active && this.combo > 0) {
        console.log('Rhythm mode deactivated - auto-resetting combo from', this.combo, 'to 0');
        this.resetCombo();
      }
      
      // Update particles
      this.updateParticles(deltaTime);
      
      // Update beat effects
      this.updateBeatEffects(deltaTime);
      
      // Track tutorial objective for rhythm combo - simplified check
      if (window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive()) {
        if (this.combo >= 5 && window.tutorialSystem.completedObjectives && !window.tutorialSystem.completedObjectives.has('rhythm_combo')) {
          console.log(`RHYTHM COMBO ACHIEVED: combo=${this.combo} >= 5, marking rhythm_combo objective complete`);
          window.tutorialSystem.checkObjective('rhythm_combo');
        }
      }
    } catch (error) {
      console.error('Error updating rhythm system:', error?.message || error);
    }
  }

  // Trigger tempo establishment beat (first 16 distinctive beats)
  triggerTempoEstablishmentBeat() {
    const currentTime = performance.now();
    
    // Update timing for tempo establishment
    this.lastBeatTime = currentTime;
    this.timeSinceBeat = 0;
    this.barProgress = 0;
    
    // Count tempo establishment beats
    this.currentTempoBeat++;
    
    console.log(`🎵 TEMPO BEAT ${this.currentTempoBeat}/${this.tempoEstablishmentBeats} - establishing song tempo`);
    
    // Enhanced visual for tempo establishment beats - distinctive appearance
    this.beatEffects.push({
      x: this.beatIndicator.x,
      y: this.beatIndicator.y,
      radius: 0,
      maxRadius: 100 + (this.currentTempoBeat * 3), // Growing radius for each tempo beat
      opacity: 0.9,
      color: '#ffaa00', // Orange for tempo establishment
      growth: 3
    });
    
    // Check if tempo establishment is complete
    if (this.currentTempoBeat >= this.tempoEstablishmentBeats) {
      this.tempoEstablished = true;
      console.log('🎵 TEMPO ESTABLISHED! 16 distinctive beats completed - song tempo locked');
      console.log('🎵 Regular beat progression starts now - tempo set for remainder of song');
    }
  }
  
  triggerBeat() {
    // Create visual effect
    this.createBeatEffect();
    
    // Use tempo establishment beats for first 16 beats
    if (this.currentTempoBeat <= this.tempoEstablishmentBeats) {
      this.triggerTempoEstablishmentBeat();
      return;
    }
    
    // Don't touch lastBeatTime here - it's managed by syncWithAudioBeat()
    // Only update beat tracking
    
    // Simple beat tracking - increment current bar beat
    this.currentBarBeat = (this.currentBarBeat + 1) % 4;
    
    // Every beat is a hit beat - always show strong visual
    console.log(`Beat triggered: Bar position ${this.currentBarBeat}/4`);
    
    this.beatIndicator.scale = 2.0; // Strong visual for every beat
    this.createParticles(this.beatIndicator.x, this.beatIndicator.y, '#ff00ff');
    this.createBeatEffect(true);
    
    // Move to next beat in pattern (apply modulo for 4-beat cycle)
    this.patternIndex = (this.patternIndex + 1) % 4;
    
    // Trigger attack timing windows periodically
    this.attackBeatCounter++;
    if (this.attackBeatCounter >= this.nextAttackBeat) {
      this.activateAttackTiming();
      this.attackBeatCounter = 0;
      this.nextAttackBeat = 4 + Math.floor(Math.random() * 3); // Every 4-6 beats
    }
    
    if (this.patternIndex >= this.patterns[this.currentPattern].length) {
      this.patternIndex = 0;
      // Occasionally change pattern
      if (Math.random() > 0.7) {
        this.currentPattern = Math.floor(Math.random() * this.patterns.length);
        console.log(`Changed to pattern ${this.currentPattern}: ${this.patterns[this.currentPattern].join('')}`);
      }
    }
  }

  // Sync with audio system beat when it fires
  syncWithAudioBeat() {
    const currentTime = performance.now();
    console.log('🎵 AUDIO BEAT SYNC CALLED! - This should start the progress bars');
    console.log('Current lastBeatTime before:', this.lastBeatTime);
    
    // CRITICAL: EXACT first beat synchronization - 16 distinctive beats establish tempo
    if (!this.trackStarted) {
      console.log('🎵 FIRST DISTINCTIVE BEAT DETECTED! Starting 16-beat tempo establishment');
      this.trackStarted = true;
      this.trackStartTime = currentTime;
      this.lastBeatTime = currentTime;
      this.timeSinceBeat = 0;
      this.barProgress = 0;
      
      // Initialize tempo establishment
      this.currentTempoBeat = 1;
      this.tempoEstablished = false;
      this.currentBarBeat = 0;
      this.patternIndex = 0;
      
      console.log(`🎵 TEMPO ESTABLISHMENT STARTED - beat 1/${this.tempoEstablishmentBeats}`);
      console.log('🎵 Progress starts EXACTLY on first distinctive beat');
      
      // IMMEDIATELY trigger first tempo establishment beat
      this.triggerTempoEstablishmentBeat();
      return;
    }
    
    // Regular beat updates after tempo established
    this.lastBeatTime = currentTime;
    this.timeSinceBeat = 0;
    this.barProgress = 0;
    
    console.log('🎵 AUDIO BEAT SYNC - Set lastBeatTime to:', this.lastBeatTime);
    
    // Trigger the beat visual and progression
    this.triggerBeat();
  }

  handleInput(action) {
    // Only process rhythm input when visual mode is active (R key pressed)
    if (!this.active || !this.isActive()) return { hit: false, timing: 0, combo: this.combo };
    
    // CRITICAL: Check for missed beat BEFORE checking attack timing
    const currentTime = performance.now();
    
    // Debounce input to prevent multiple rapid presses
    if (currentTime - this.lastInputTime < this.inputDebounceMs) {
      console.log('Input debounced - too soon after previous input');
      return { hit: false, timing: 'debounced', combo: this.combo };
    }
    this.lastInputTime = currentTime;
    
    // FIRST: Check if this input is a miss based on beat timing
    const beatProgress = this.timeSinceBeat / this.beatInterval;
    const nearestBeatDistance = Math.min(beatProgress, 1 - beatProgress) * this.beatInterval;
    
    console.log(`Input: timeSinceBeat=${this.timeSinceBeat.toFixed(0)}ms, beatProgress=${beatProgress.toFixed(2)}, nearestBeatDistance=${nearestBeatDistance.toFixed(0)}ms`);
    
    // CRITICAL: If it's outside the good window, it's a miss - no exceptions
    const isMiss = nearestBeatDistance > this.goodWindow / 2;
    if (isMiss) {
      console.log(`MISSED BEAT: nearestBeatDistance=${nearestBeatDistance.toFixed(0)}ms > ${this.goodWindow/2}ms threshold - COMBO RESET!`);
      
      // Reset combo immediately before ANY other logic
      const oldCombo = this.combo;
      this.combo = 0;
      
      // Add visual feedback for miss
      this.createParticles(this.beatIndicator.x, this.beatIndicator.y, '#ff0000');
      
      // Play missed beat sound
      if (window.audioSystem && window.audioSystem.isInitialized()) {
        window.audioSystem.playSound('synthHit', 0.3);
      }
      
      // Return immediately - no attack timing or anything else for misses
      return { hit: false, timing: 'miss', combo: 0 };
    }
    
    // SECOND: Only check attack timing if it wasn't a miss
    const attackTiming = this.checkAttackWindowTiming();
    if (attackTiming) {
      // Enhanced timing for attack windows (only for successful timing)
      this.createParticles(this.beatIndicator.x, this.beatIndicator.y, attackTiming === 'start' ? '#00ff00' : '#ff00ff');
      this.combo += 2; // Bonus combo for attack timing
      this.score += attackTiming === 'start' ? 150 : 200; // Different scores for start/end
      
      // Play enhanced success sound
      if (window.audioSystem && window.audioSystem.isInitialized()) {
        window.audioSystem.playSound('synthHit', 0.6);
      }
      
      return { hit: true, timing: `attack_${attackTiming}`, combo: this.combo };
    }
    
    // Declare all variables before using them
    // No timing offset - we hit on actual beats
    
    // Check timing relative to nearest beat center (more accurate)
    let timing = 0;
    let hit = false;
    
    // Check timing levels based on distance from beat center
    if (nearestBeatDistance <= this.excellentWindow / 2) {
      timing = 'excellent';
      hit = true;
      this.combo += 1;
      this.score += 200 * (1 + Math.floor((this.combo - 1) / 5));
      console.log(`EXCELLENT HIT! combo now ${this.combo}, nearestBeatDistance=${nearestBeatDistance.toFixed(0)}ms <= ${this.excellentWindow/2}ms`);
    } else if (nearestBeatDistance <= this.perfectWindow / 2) {
      timing = 'perfect';
      hit = true;
      this.combo += 1;
      this.score += 100 * (1 + Math.floor((this.combo - 1) / 5));
      console.log(`PERFECT HIT! combo now ${this.combo}, nearestBeatDistance=${nearestBeatDistance.toFixed(0)}ms <= ${this.perfectWindow/2}ms`);
    } else {
      timing = 'good';
      hit = true;
      this.combo += 1;
      this.score += 50 * (1 + Math.floor((this.combo - 1) / 5));
      console.log(`GOOD HIT! combo now ${this.combo}, nearestBeatDistance=${nearestBeatDistance.toFixed(0)}ms <= ${this.goodWindow/2}ms`);
    }
    
    // If we got here, it was a hit - success particles based on timing quality
    let color = '#ffff00'; // default good
    if (timing === 'excellent') {
      color = '#ff00ff'; // purple for excellent
    } else if (timing === 'perfect') {
      color = '#00ff00'; // green for perfect
    }
    this.createParticles(this.beatIndicator.x, this.beatIndicator.y, color);
    
    // Stronger beat effect for better timing
    if (timing === 'excellent' || timing === 'perfect') {
      this.createBeatEffect(true);
    }
    
    // Play rhythm attack sound synced to timing
    if (window.audioSystem && window.audioSystem.isInitialized()) {
      window.audioSystem.playRhythmAttack(timing);
    }
    
    // Rhythm attack particles
    if (window.particleSystem && window.player) {
      window.particleSystem.rhythmAttackEffect(window.player.position.x, window.player.position.y);
    }
    
    // Check tutorial combo objective - simplified
    if (window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive()) {
      if (this.combo >= 5 && window.tutorialSystem.completedObjectives && !window.tutorialSystem.completedObjectives.has('rhythm_combo')) {
        console.log(`RHYTHM COMBO ACHIEVED: combo=${this.combo} >= 5, marking rhythm_combo objective complete`);
        window.tutorialSystem.checkObjective('rhythm_combo');
      }
    }
    
    return { hit, timing, combo: this.combo };
  }
  
  activateAttackTiming() {
    this.attackWindows.activeAttack = true;
    this.attackWindows.attackStartTime = performance.now();
    
    // Create attack indicator effect
    this.createParticles(this.beatIndicator.x, this.beatIndicator.y, '#ffaa00');
    
    // Auto-close attack timing after both windows pass
    setTimeout(() => {
      this.attackWindows.activeAttack = false;
    }, this.attackWindows.startWindow + this.attackWindows.endWindow + 200);
  }
  
  checkAttackWindowTiming() {
    if (!this.attackWindows.activeAttack) return false;
    
    const currentTime = performance.now();
    const elapsed = currentTime - this.attackWindows.attackStartTime;
    
    // Check if hitting in start window (first 100ms)
    if (elapsed <= this.attackWindows.startWindow) {
      return 'start';
    }
    
    // Check if hitting in end window (after 200ms gap, for 100ms)
    if (elapsed >= (this.attackWindows.startWindow + 200) && elapsed <= (this.attackWindows.startWindow + 200 + this.attackWindows.endWindow)) {
      return 'end';
    }
    
    return false;
  }

  createBeatEffect(strong = false) {
    this.beatEffects.push({
      x: this.beatIndicator.x,
      y: this.beatIndicator.y,
      radius: strong ? 100 : 60,
      maxRadius: strong ? 300 : 200,
      opacity: strong ? 0.8 : 0.5,
      color: '#ffaa00',
      growth: strong ? 8 : 5
    });
  }

  createParticles(x, y, color) {
    const particleCount = color === '#ff00ff' ? 20 : 10;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = window.randomRange(2, 8);
      
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.02,
        color: color,
        size: window.randomRange(2, 6)
      });
    }
  }

  updateParticles(deltaTime) {
    const dt = deltaTime / 1000;
    this.particles = this.particles.filter(particle => {
      particle.x += particle.vx * dt * 60; // Normalize to 60fps
      particle.y += particle.vy * dt * 60;
      particle.life -= particle.decay;
      
      // Only apply gravity to non-rhythm particles
      if (particle.color !== '#ffaa00') {
        particle.vy += 0.2; // Gravity
      }
      
      return particle.life > 0;
    });
  }

  updateBeatEffects(deltaTime) {
    this.beatEffects = this.beatEffects.filter(effect => {
      effect.radius += effect.growth;
      effect.opacity *= 0.95;
      
      return effect.opacity > 0.01;
    });
  }

  draw(ctx) {
    try {
      // Only draw visual elements when rhythm mode is visible (R key pressed)
      if (!this.active || !this.isActive()) return;
      
      ctx.save();
      
      // Draw beat indicator circle
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = this.beatIndicator.opacity;
      ctx.beginPath();
      ctx.arc(
        this.beatIndicator.x, 
        this.beatIndicator.y, 
        30 * this.beatIndicator.scale, 
        0, 
        Math.PI * 2
      );
      ctx.stroke();
      
      // Draw inner circle
      ctx.fillStyle = '#ff00ff';
      ctx.globalAlpha = this.beatIndicator.opacity * 0.5;
      ctx.beginPath();
      ctx.arc(
        this.beatIndicator.x, 
        this.beatIndicator.y, 
        20 * this.beatIndicator.scale, 
        0, 
        Math.PI * 2
      );
      ctx.fill();
      
      // Draw beat effects
      this.beatEffects.forEach(effect => {
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = effect.opacity;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, Math.max(0, effect.radius), 0, Math.PI * 2);
        ctx.stroke();
      });
      
      // Draw particles
      this.particles.forEach(particle => {
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.life;
        ctx.fillRect(
          particle.x - particle.size/2, 
          particle.y - particle.size/2, 
          particle.size, 
          particle.size
        );
      });
      
      ctx.restore();
      
      // Draw UI text below enemy legend box
      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 24px Orbitron';
      ctx.fillText(`Combo: ${this.combo}`, 50, 240);
      ctx.fillText(`Score: ${this.score}`, 50, 270);
      
      // Draw enhanced timing feedback - beat-aligned windows
      const beatProgress = this.timeSinceBeat / this.beatInterval;
      const nearestBeatDistance = Math.min(beatProgress, 1 - beatProgress) * this.beatInterval;
      const inPerfectWindow = nearestBeatDistance <= this.excellentWindow / 2;
      const inGoodWindow = nearestBeatDistance <= this.goodWindow / 2;
      
      // Show visual timing zones for every beat
      if (inPerfectWindow || inGoodWindow) {
        ctx.strokeStyle = inPerfectWindow ? '#ff00ff' : '#00ff00';
        ctx.lineWidth = 3;
        ctx.strokeRect(840, 140, 240, 60);
        
        ctx.fillStyle = inPerfectWindow ? 'rgba(255, 0, 255, 0.2)' : 'rgba(0, 255, 0, 0.2)';
        ctx.fillRect(842, 142, 236, 56);
        
        ctx.fillStyle = inPerfectWindow ? '#ff00ff' : '#00ff00';
        ctx.font = 'bold 20px Orbitron';
        ctx.fillText('HIT THE BEAT!', 960 - 60, 175);
      } else {
        // Show static instruction
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 2;
        ctx.strokeRect(840, 140, 240, 60);
        
        ctx.fillStyle = '#ffff00';
        ctx.font = '16px Orbitron';
        ctx.fillText('Press DOWN on every beat', 960, 175);
      }
      
      // Add miss warning when approaching beat deadline
      if (this.active && this.combo > 0 && this.timeSinceBeat > this.beatInterval * 0.8 && !inPerfectWindow && !inGoodWindow) {
        ctx.fillStyle = '#ff6666';
        ctx.font = 'bold 18px Orbitron';
        ctx.fillText('MISSING BEAT!', 960, 210);
      }
      
      // Control instructions
      ctx.fillStyle = '#ffff00';
      ctx.font = 'bold 18px Orbitron';
      ctx.fillText('CONTROLS: ↓ = Attack | R = Toggle | ESC = Hide', 960, 950);
      ctx.font = '16px "Share Tech Mono"';
      ctx.fillText('Press Down Arrow when "HIT THE BEAT!" appears', 960, 970);
      
      // Timing help
      ctx.fillStyle = '#00ffff';
      ctx.font = '14px "Share Tech Mono"';
      ctx.fillText(`Purple = Excellent (±${this.excellentWindow/2}ms) | Green = Perfect (±${this.perfectWindow/2}ms) | Yellow = Good (±${this.goodWindow/2}ms)`, 960, 990);
      
      // === BEAT VISUALIZATION ===
      // Draw 4 separate bars
      const barWidth = 50;
      const barHeight = 40;
      const barSpacing = 10;
      const totalWidth = 4 * barWidth + 3 * barSpacing;
      const startX = 960 - totalWidth / 2;
      
      // Clear bar area first to prevent ghosting
      ctx.fillStyle = '#000000';
      ctx.fillRect(startX - 5, 75, totalWidth + 10, barHeight + 15);
      
      // Show tempo establishment during first 16 beats
      if (this.lastBeatTime === 0) {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 16px "Share Tech Mono"';
        ctx.fillText('WAITING FOR FIRST BEAT...', 960, 80);
        ctx.font = '14px monospace';
        ctx.fillText('16 distinctive beats will establish tempo', 960, 105);
        return;
      }
      
      // Show tempo establishment during first 16 beats
      if (this.currentTempoBeat <= this.tempoEstablishmentBeats && !this.tempoEstablished) {
        ctx.fillStyle = '#ffaa00'; // Orange for tempo establishment
        ctx.font = 'bold 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`ESTABLISHING TEMPO`, 960, 80);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Orbitron';
        ctx.fillText(`BEAT ${this.currentTempoBeat}/${this.tempoEstablishmentBeats}`, 960, 120);
        
        ctx.fillStyle = '#ffaa00';
        ctx.font = '14px monospace';
        ctx.fillText('16 distinctive beats setting song tempo', 960, 150);
        return;
      }
      
      // Simple, reliable logic: show progress toward next beat
      for (let i = 0; i < 4; i++) {
        const barX = startX + i * (barWidth + barSpacing);
        
        // Purple background for all bars
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(barX, 80, barWidth, barHeight);
        
        // Only show fill if we've started tracking beats
        if (this.lastBeatTime > 0) {
          // Simple fill logic:
          // Beats before currentBarBeat are full cyan (already hit)
          // Current beat shows progress based on timeSinceBeat
          // Beats after currentBarBeat are purple only
          
          if (i < this.currentBarBeat) {
            // Previously completed beats - full cyan
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(barX + 2, 82, barWidth - 4, barHeight - 4);
          } else if (i === this.currentBarBeat) {
            // Current beat - fill based on actual timeSinceBeat
            ctx.fillStyle = '#00ffff';
            const fillWidth = Math.floor((barWidth - 4) * this.barProgress);
            if (fillWidth > 0) {
              ctx.fillRect(barX + 2, 82, fillWidth, barHeight - 4);
            }
          }
          // Future beats remain purple only
        }
        
        // White outline
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, 80, barWidth, barHeight);
      }
    } catch (error) {
      console.error('Error drawing rhythm system:', error?.message || error);
    }
  }

  isActive() {
    return this.active;
  }
  
  isRunning() {
    return this.running;
  }
  
  isBackgroundActive() {
    return this.running;
  }

  getCombo() {
    return this.combo;
  }

  getScore() {
    return this.score;
  }

  getMaxCombo() {
    return this.maxCombo;
  }
};

// Create global rhythm system - wait for dependencies to be ready
function createRhythmSystem() {
  if (window.randomRange && window.clamp) {
    window.rhythmSystem = new window.RhythmSystem();
  } else {
    console.warn('Rhythm system dependencies not ready, retrying...');
    setTimeout(createRhythmSystem, 100);
  }
}

// Initialize rhythm system when dependencies are loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createRhythmSystem);
} else {
  createRhythmSystem();
}