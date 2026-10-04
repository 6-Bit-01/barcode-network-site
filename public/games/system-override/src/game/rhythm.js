// Enhanced Rhythm Combat System for BARCODE: System Override
// Features 4-bar progress visualization and precision timing protocols
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/rhythm.js',
  exports: ['RhythmSystem', 'rhythmSystem'],
  dependencies: ['randomRange', 'clamp', 'BARCODE.MusicProfiles', 'BARCODE.MusicTransport']
});

window.RhythmSystem = class RhythmSystem {
  constructor() {
    // Core rhythm state
    this.active = false;           // Visual visibility (R key toggle)
    this.running = false;          // Background rhythm processing
    this.trackStarted = false;     // Track has actually started playing
    const profile = window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive();
    const grid = profile && profile.timeline && profile.timeline.fixedGrid;
    this.bpm = grid ? grid.quarterBpm : 0;
    this.beatInterval = grid ? (60000 / grid.quarterBpm) * (4 / grid.beatUnit) : 0;
    
    // 4-Bar Progress System
    this.barsPerPhrase = profile && profile.phrasePresentation ? profile.phrasePresentation.barsPerPhrase : 0;
    this.beatsPerBar = grid ? grid.beatsPerBar : 0;
    this.currentBar = 0;           // Current bar in phrase (0-3)
    this.currentBeat = 0;          // Current beat in bar (0-3)
    this.globalBeatCount = 0;       // Total beats since start
    
    // Tempo Establishment System (32 distinctive beats)
    this.tempoEstablishmentBeats = profile && profile.legacyCompatibility ? profile.legacyCompatibility.establishmentBeatCount : 0;
    this.currentTempoBeat = 0;        // Current tempo establishment beat (1-33)
    this.tempoEstablished = false;     // Tempo established after 33 beats
    
    // Progress tracking
    this.barProgress = 0;         // Progress within current beat (0.0-1.0)
    this.phraseProgress = 0;       // Progress through 4-bar phrase (0.0-1.0)
    this.lastBeatTime = 0;         // Timestamp of last beat
    this.beatStartTime = 0;        // When current beat began
    this.trackStartTime = 0;       // When the track actually started playing
    
    // Shortened timing windows for more challenging gameplay
    this.timingWindows = {
      perfect: profile && profile.judgmentRules[0] ? profile.judgmentRules[0].windowsMs.perfect : 0,
      excellent: profile && profile.judgmentRules[0] ? profile.judgmentRules[0].windowsMs.excellent : 0
      // GOOD REMOVED - anything beyond excellent is now a miss
    };
    this.timingOffset = 0;          // Input calibration is separate; dead -20ms compensation is not applied
    this.judgmentRuleId = profile && profile.judgmentRules[0] ? profile.judgmentRules[0].id : null;
    this.lastProcessedTransportBeatKey = null;
    this.processedTransportBeatKeys = {}
    
    // Beat patterns and rhythm gameplay
    this.beatPatterns = [
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // Every beat
      [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1], // Syncopated
      [1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0], // Rock pattern
      [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1]  // Complex
    ];
    this.currentPattern = 0;
    this.patternIndex = 0;
    
    // Combo system (score removed)
    this.combo = 0;
    this.maxCombo = 0;
    this.runBestCombo = 0;
    
    // Input management
    this.lastInputTime = 0;
    this.inputCooldown = 250;      // Increased to 250ms minimum between inputs
    
    // Visual effects and particles
    this.beatEffects = [];
    this.particles = [];
    this.hitIndicators = [];
    
    // Attack timing windows (special beats)
    this.attackWindows = {
      active: false,
      type: null,                  // 'start' or 'end'
      startTime: 0,
      duration: 150
    };
    
    // Beat synchronization with audio
    this.audioSyncEnabled = true;
    this.expectedBeatTime = 0;
    this.lastSyncTime = 0; // Prevent duplicate sync calls
    
    // Loop restart system
    this.loopRestartMode = false; // True when preparing for/recovering from loop restart
    this.loopRestartCount = 0; // Track how many loops we've completed
    
    // Power arc system for successful hits
    this.powerArcActive = false;
    this.powerArcIntensity = 0;
    this.powerArcDuration = 0;
    
    // Progressive arc growth system for successful hits only
    this.arcGrowthLevel = 0;        // Current growth level (0-10 based on combo)
    this.maxArcGrowthLevel = 10;    // Maximum growth level (combo 10)
    this.beatPressCount = 0;        // Total beat presses in current session
    this.colorVariationSeed = 0;    // Seed for color variations between presses
    
    // Weaker starting damage zone with gradual growth
    this.baseDamageRadius = 250;    // Base damage radius (increased from 180 for reasonable range)
    this.maxDamageRadius = 350;     // Maximum damage radius at full combo (increased from 300)
    
    // Track last successful hit to prevent duplicate arcs
    this.lastSuccessfulHitTime = 0;  // Prevents multiple arcs per beat press
    
    if (window.DEBUG_RHYTHM) console.log('Rhythm System initialized with 4-bar progress system');
  }
  
  // Start rhythm mode (visual + audio)
  start(profileId) {
    if (this.running) {
      this.show(); // Just show if already running
      return;
    }
    
    this.applySelectedProfile(profileId);
    this.running = true;
    this.active = true;
    
    // LOCKED: Perfect timing state reset - same every time
    this.currentBar = 0;
    this.currentBeat = 0;
    this.globalBeatCount = 0;
    this.barProgress = 0;
    this.phraseProgress = 0;
    this.lastBeatTime = 0;         // LOCKED: Don't start until track begins
    this.beatStartTime = 0;
    this.trackStarted = false;     // LOCKED: Wait for audio to actually start
    this.trackStartTime = 0;
    
    // LOCKED: 32-beat tempo establishment for consistency
    this.tempoEstablishmentBeats = (window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive() && window.BARCODE.MusicProfiles.getActive().legacyCompatibility) ? window.BARCODE.MusicProfiles.getActive().legacyCompatibility.establishmentBeatCount : this.tempoEstablishmentBeats;
    this.currentTempoBeat = 0;
    this.tempoEstablished = false;
    
    // CRITICAL: Reset gameplay state including COMBO every fresh start
    this.combo = 0;
    this.patternIndex = 0;
    this.currentPattern = Math.floor(Math.random() * this.beatPatterns.length);
    
    // Reset arc growth on fresh start
    this.arcGrowthLevel = 0;
    this.beatPressCount = 0;
    this.colorVariationSeed = 0;
    if (window.DEBUG_RHYTHM) console.log('🔄 ARC GROWTH RESET: Starting fresh - arcs will grow with each beat press');
    
    // CRITICAL: Reset max combo tracking for fresh session
    this.maxCombo = 0;
    
    // CRITICAL: Clear all visual effects and particles for fresh start
    this.beatEffects = [];
    this.particles = [];
    this.hitIndicators = [];
    
    // CRITICAL: Reset attack windows for fresh start
    this.attackWindows.active = false;
    this.attackWindows.type = null;
    this.attackWindows.startTime = 0;
    
    // CRITICAL: Reset input timing for fresh start
    this.lastInputTime = 0;
    
    if (window.DEBUG_RHYTHM) console.log('🔄 COMBO RESET: Fresh rhythm mode started - combo = 0');
    
    // LOCKED: Always start audio sync - guaranteed perfect background progress
    if (window.audioSystem && window.audioSystem.isInitialized()) {
      window.audioSystem.startLayerBeatSync();
      if (window.DEBUG_RHYTHM) console.log('🎵 LOCKED Audio beat sync started - PERFECT progress tracking GUARANTEED');
    }
    
    if (window.DEBUG_RHYTHM) console.log(`🎵 LOCKED Rhythm mode started: ${this.bpm} BPM, beatInterval=${this.beatInterval.toFixed(1)}ms - PERFECT timing`);
  }
  

  applySelectedProfile(profileId) {
    const registry = window.BARCODE && window.BARCODE.MusicProfiles;
    const transport = window.BARCODE && window.BARCODE.MusicTransport;
    if (!registry) return;
    const profile = profileId ? registry.select(profileId) : registry.getActive();
    if (!profile) {
      this.bpm = 0;
      this.beatInterval = 0;
      this.beatsPerBar = 0;
      this.barsPerPhrase = 0;
      this.tempoEstablishmentBeats = 0;
      this.timingWindows = { perfect: 0, excellent: 0 };
      this.judgmentRuleId = null;
      if (transport && profileId) transport.load(profileId);
      return;
    }
    if (transport && transport.getProfileId && transport.getProfileId() !== profile.profileId) {
      transport.load(profile.profileId);
    }
    if (profile.timeline.mode !== 'fixed-tempo') {
      this.bpm = 0;
      this.beatInterval = 0;
      this.beatsPerBar = 0;
      this.barsPerPhrase = 0;
      this.tempoEstablishmentBeats = 0;
      this.timingWindows = { perfect: 0, excellent: 0 };
      this.judgmentRuleId = null;
      return;
    }
    this.bpm = profile.timeline.fixedGrid.quarterBpm;
    this.beatInterval = (60000 / this.bpm) * (4 / profile.timeline.fixedGrid.beatUnit);
    this.beatsPerBar = profile.timeline.fixedGrid.beatsPerBar;
    this.barsPerPhrase = profile.phrasePresentation ? profile.phrasePresentation.barsPerPhrase : 0;
    this.tempoEstablishmentBeats = profile.legacyCompatibility ? profile.legacyCompatibility.establishmentBeatCount : 0;
    const rule = profile.judgmentRules.find(candidate => candidate.id === 'level-01.attack') || null;
    this.judgmentRuleId = rule ? rule.id : null;
    this.timingWindows = rule ? { perfect: rule.windowsMs.perfect, excellent: rule.windowsMs.excellent } : { perfect: 0, excellent: 0 };
  }

  // Show/hide real Rhythm Combat Mode (R key toggle)
  canEnterRhythmMode() {
    const gameState = window.gameState || {};
    if (window.isPaused || window.isRunning === false || gameState.paused || gameState.gameOver || gameState.victory || gameState.running === false) return { ok: false, reason: 'gameplay-inactive' };
    if (window.cutsceneSystem && window.cutsceneSystem.active) return { ok: false, reason: 'cutscene-active' };
    if (window.sector1Progression?.isGameplaySuppressed?.()) return { ok: false, reason: 'progression-suppressed' };
    if (window.hackingSystem && typeof window.hackingSystem.isActive === 'function' && window.hackingSystem.isActive()) return { ok: false, reason: 'hacking-active' };
    // Lock only the player-facing mode until its authored tutorial chapter.
    // Background transport, beat polling, tempo establishment, and sync remain
    // running because this guard does not call stop(), hide(), or reset timing.
    if (window.tutorialSystem?.isActive?.() && Number(window.tutorialSystem.storyChapter) < 2) return { ok: false, reason: 'tutorial-rhythm-locked' };
    if (window.player?.grounded === false) return { ok: false, reason: 'land-to-enter' };
    if (!this.trackStarted || this.currentTempoBeat === 0) return { ok: false, reason: 'rhythm-not-ready' };
    return { ok: true };
  }

  show() {
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM SHOW() CALLED - requesting active Rhythm Combat Mode');
    const allowed = this.canEnterRhythmMode();
    if (!allowed.ok) {
      if (window.DEBUG_RHYTHM) console.log('🚫 RHYTHM MODE BLOCKED:', allowed.reason);
      return allowed;
    }

    if (!this.active) window.BARCODE?.combatFX?.mode(true);
    this.active = true;
    if (window.player) {
      window.player.state = 'rhythm';
      if (window.player.velocity) window.player.velocity.x = 0;
      window.player.airInput = 0;
      window.player.jumpBufferTimerMs = 0;
    }
    if (!this.running) {
      this.startBackgroundRhythm(); // Start background progress if not running
    }
    if (window.DEBUG_RHYTHM) console.log('Rhythm Combat Mode active - background progress continues');
    if (window.DEBUG_RHYTHM) console.log(`🎵 After show(): active=${this.active}, running=${this.running}`);
    return { ok: true, reason: 'activated' };
  }
  

  getAuthoritativeDamageRadius({ nextSuccess = false } = {}) {
    const combo = typeof this.getCombo === 'function' ? this.getCombo() : (this.combo || 0);
    const t = Math.max(0, Math.min(1, (combo + (nextSuccess ? 1 : 0)) / 10));
    return this.baseDamageRadius + (this.maxDamageRadius - this.baseDamageRadius) * t;
  }

  // CRITICAL: Gameplay-only restart for when rhythm mode is reactivated
  restart() {
    if (window.DEBUG_RHYTHM) console.log('🔄 RESTARTING RHYTHM MODE - GAMEPLAY RESET ONLY');
    if (window.DEBUG_RHYTHM) console.log('🔄 PRESERVING ALL: tempo establishment, beat timing, and continuous loop');
    
    // CRITICAL: PRESERVE EVERYTHING - NEVER interrupt continuous beat timing
    // Don't reset: currentTempoBeat, tempoEstablished, trackStarted, lastBeatTime, beatStartTime
    // Don't reset: trackStartTime, globalBeatCount, currentBar, currentBeat, barProgress, phraseProgress
    // Don't reset: running, active, loopRestartMode, loopRestartCount - preserve all state
    
    // CRITICAL: RESET ONLY gameplay elements (combo, visuals)
    this.combo = 0;
    this.maxCombo = 0;
    
    // Reset visual effects only
    this.beatEffects = [];
    this.particles = [];
    this.hitIndicators = [];
    
    // Reset attack windows only
    this.attackWindows.active = false;
    this.attackWindows.type = null;
    this.attackWindows.startTime = 0;
    
    // Reset input timing only
    this.lastInputTime = 0;
    
    // Reset pattern index for fresh gameplay only
    this.patternIndex = 0;
    
    // Reset arc growth level for fresh gameplay only
    this.arcGrowthLevel = 0;
    this.beatPressCount = 0;
    this.colorVariationSeed = 0;
    this.powerArcActive = false;
    this.powerArcIntensity = 0;
    this.powerArcDuration = 0;
    
    if (window.DEBUG_RHYTHM) console.log('🔄 COMBO RESET: Gameplay elements reset - combo = 0');
    if (window.DEBUG_RHYTHM) console.log('🔄 PRESERVED: ALL beat timing, tempo establishment, and continuous loop');
    if (window.DEBUG_RHYTHM) console.log('🔄 CONTINUOUS LOOP UNINTERRUPTED: Rhythm system never stops');
    
    // CRITICAL: DO NOT restart audio sync - preserve continuous beat continuity
    // CRITICAL: DO NOT stop background rhythm - preserve continuous loop
    // Audio and beat timing continue seamlessly without interruption
  }
  
  // Alias for show() - needed for compatibility with input.js calls
  showRhythmMode() {
    return this.show();
  }
  
  // Alias for hide() - needed for compatibility with input.js calls  
  hideRhythmMode() {
    if (typeof this.hide === 'function') {
      return this.hide();
    }
    return { ok: false, reason: 'hide-unavailable' };
  }
  
  hide() {
    this.beatResults?.clear();
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM HIDE() CALLED - setting active=false');
    if (this.active) window.BARCODE?.combatFX?.mode(false);
    this.active = false;
    if (window.player) window.player.primaryAttackAnimationMs = 0;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.runBestCombo = Math.max(this.runBestCombo || 0, this.combo);
    
    // Reset combo when hiding rhythm mode
    if (this.combo > 0) {
      if (window.DEBUG_RHYTHM) console.log('🔄 COMBO RESET: Hiding rhythm mode - resetting combo from', this.combo, 'to 0');
      this.combo = 0;
    }
    
    if (window.DEBUG_RHYTHM) console.log('Rhythm Combat Mode hidden, background continues');
    if (window.DEBUG_RHYTHM) console.log(`🎵 After hide(): active=${this.active}, running=${this.running}`);
    return { ok: true, reason: 'deactivated' };
  }
  
  // Start background rhythm processing (runs continuously)
  startBackgroundRhythm(profileId) {
    if (this.running) return; // Already running
    
    if (window.DEBUG_RHYTHM) console.log('🎵 Starting background rhythm system');
    
    this.running = true;
    this.active = false; // Start in background only (no visuals)
    
    this.applySelectedProfile(profileId);
    
    // Reset timing state
    this.currentBar = 0;
    this.currentBeat = 0;
    this.globalBeatCount = 0;
    this.barProgress = 0;
    this.phraseProgress = 0;
    this.lastBeatTime = 0;
    this.beatStartTime = 0;
    this.trackStarted = false; // Wait for audio to actually start
    this.trackStartTime = 0;
    
    // 32-beat tempo establishment
    this.tempoEstablishmentBeats = (window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive() && window.BARCODE.MusicProfiles.getActive().legacyCompatibility) ? window.BARCODE.MusicProfiles.getActive().legacyCompatibility.establishmentBeatCount : this.tempoEstablishmentBeats;
    this.currentTempoBeat = 0;
    this.tempoEstablished = false;
    
    // Start audio beat sync - progress tracking continues in background
    if (window.audioSystem && window.audioSystem.isInitialized()) {
      window.audioSystem.startLayerBeatSync();
      if (window.DEBUG_RHYTHM) console.log('Audio beat sync started for background progress');
    }
    
    if (window.DEBUG_RHYTHM) console.log(`Background rhythm ready: ${this.bpm} BPM - waiting for audio beats`);
  }
  
  // Hide visual elements only - NEVER stop continuous rhythm loop
  stop() {
    if (window.DEBUG_RHYTHM) console.log('🔄 HIDING RHYTHM MODE VISUALS - continuous loop preserved');
    
    // Only hide visual elements - NEVER stop the continuous rhythm system
    this.active = false;
    
    // CRITICAL: NEVER stop running state - continuous loop must continue
    // this.running = false; // COMMENTED OUT - never stop continuous rhythm
    // this.trackStarted = false; // COMMENTED OUT - never interrupt beat tracking
    
    // Save max combo
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.runBestCombo = Math.max(this.runBestCombo || 0, this.combo);
    
    // Reset combo when hiding rhythm mode
    if (this.combo > 0) {
      if (window.DEBUG_RHYTHM) console.log('🔄 COMBO RESET: Hiding rhythm mode - resetting combo from', this.combo, 'to 0');
      this.combo = 0;
    }
    
    // CRITICAL: NEVER stop audio sync - preserve continuous loop
    // if (window.audioSystem) {
    //   window.audioSystem.stopLayerBeatSync();
    // }
    
    if (window.DEBUG_RHYTHM) console.log('Rhythm mode visuals hidden - continuous loop preserved');
    
    // Reset growth when hiding visuals only
    this.arcGrowthLevel = 0;
    this.beatPressCount = 0;
    this.colorVariationSeed = 0;
    this.powerArcActive = false;
    this.powerArcIntensity = 0;
    this.powerArcDuration = 0;
    
    if (window.DEBUG_RHYTHM) console.log('🔄 CONTINUOUS LOOP PRESERVED: Beat timing continues in background');
  }
  
  // Main update loop
  update(deltaTime) {
    if (!this.running || !deltaTime) return;
    
    let transportSnapshot = null;
    if (window.BARCODE && window.BARCODE.MusicTransport && window.audioSystem && window.audioSystem.context) {
      const batch = window.BARCODE.MusicTransport.poll(window.audioSystem.context.currentTime);
      transportSnapshot = batch.snapshot;
      batch.events.forEach(event => this.processTransportBeatEvent(event));
    }
    const currentTime = performance.now();
    
    // CRITICAL: Audio system is sole authority for beat timing.
    // Progress comes from the transport snapshot/grid, not elapsed wall-clock time.
    if (transportSnapshot && transportSnapshot.grid && this.trackStarted && !this.loopRestartMode) {
      const beatFraction = transportSnapshot.grid.beatFloat - Math.floor(transportSnapshot.grid.beatFloat);
      this.barProgress = Math.min(1.0, Math.max(0.0, beatFraction));
      const phraseBeats = Math.max(1, (this.barsPerPhrase || 0) * (this.beatsPerBar || 0));
      const beatsIntoPhrase = transportSnapshot.grid.beatFloat % phraseBeats;
      this.phraseProgress = beatsIntoPhrase / phraseBeats;
      this.currentBeat = transportSnapshot.grid.beatInBar;
      this.currentBar = this.barsPerPhrase ? (Math.floor(transportSnapshot.grid.beatIndex / this.beatsPerBar) % this.barsPerPhrase) : 0;
    }
    
    // Update visual effects only if active
    if (this.active) {
      this.updateEffects(deltaTime);
    }
    
    // Update attack windows only if active
    if (this.active) {
      this.updateAttackWindows();
      this.updatePowerArcs(deltaTime); // Update power arc state
    }
    
    // COMBO RESET: Only happens on actual missed beats (handled above in handleInput)
  }
  
  // Trigger tempo establishment beat (first 32 distinctive beats)
  triggerTempoEstablishmentBeat() {
    const currentTime = performance.now();
    
    // Update timing for tempo establishment
    this.lastBeatTime = currentTime;
    this.beatStartTime = currentTime;
    this.barProgress = 0;
    
    // CRITICAL FIX: Don't increment here - syncWithAudioBeat() already incremented
    // This function now only handles visual effects and timing updates
    if (window.DEBUG_RHYTHM) console.log(`🎵 TEMPO BEAT ${this.currentTempoBeat}/${this.tempoEstablishmentBeats} - visual effects triggered`);
    
    if (window.DEBUG_RHYTHM) console.log(`🎵 TEMPO BEAT ${this.currentTempoBeat}/${this.tempoEstablishmentBeats} - establishing song tempo`);
    
    // Enhanced visual for tempo establishment beats - distinctive appearance
    this.beatEffects.push({
      x: 960,
      y: 100,
      radius: 0,
      maxRadius: 120 + (this.currentTempoBeat * 5), // Growing radius for each tempo beat
      opacity: 0.8,
      color: '#ffaa00', // Orange for tempo establishment
      growth: 4
    });
    
    // CRITICAL FIX: Check if tempo establishment is complete - trigger at exactly 32 beats
    if (this.currentTempoBeat >= this.tempoEstablishmentBeats && !this.tempoEstablished) {
      this.tempoEstablished = true;
      if (window.DEBUG_RHYTHM) console.log('🎵 TEMPO ESTABLISHED! 32 distinctive beats completed - song tempo locked');
      if (window.DEBUG_RHYTHM) console.log('🎵 Regular beat progression starts now - tempo set for remainder of song');
      if (window.DEBUG_RHYTHM) console.log('🎵 SWITCHING TO PROGRESS BARS - tempo establishment complete');
      if (window.DEBUG_RHYTHM) console.log(`🎵 FINAL TEMPO BEAT: ${this.currentTempoBeat}/${this.tempoEstablishmentBeats} - transition to progress bars`);
    }
  }
  
  // Trigger when beat occurs (regular beats after tempo established)
  triggerBeat() {
    const currentTime = performance.now();
    
    // CRITICAL FIX: tempo establishment beats already incremented in syncWithAudioBeat()
    // This function now only handles visual effects and gameplay logic
    if (this.currentTempoBeat < this.tempoEstablishmentBeats) {
      this.triggerTempoEstablishmentBeat();
      return;
    }
    
    // Regular beat handling after tempo established
    // CRITICAL: Only increment if we haven't already counted this beat
    const expectedBeat = (this.currentBeat + 1) % this.beatsPerBar;
    const expectedBar = this.currentBeat === this.beatsPerBar - 1 ? (this.currentBar + 1) % 4 : this.currentBar;
    
    // Check for duplicate beat detection
    if (this.currentBeat === expectedBeat && this.currentBar === expectedBar) {
      if (window.DEBUG_RHYTHM) console.log(`⚠️ DUPLICATE REGULAR BEAT DETECTED: Already at beat ${this.currentBeat}, skipping increment`);
      return; // Skip duplicate
    }
    
    this.lastBeatTime = currentTime;
    this.beatStartTime = currentTime;
    this.barProgress = 0;
    
    // CRITICAL FIX: Beat counting already handled in syncWithAudioBeat()
    // This function now only handles visual effects and gameplay logic
    if (window.DEBUG_RHYTHM) console.log(`🎵 REGULAR BEAT EFFECTS: ${this.currentBeat}/${this.beatsPerBar} in BAR ${this.currentBar + 1}/4 - Global: ${this.globalBeatCount}`);
    
    // CRITICAL: Reset timing every 30 beats to prevent drift
    if (this.globalBeatCount % 30 === 0) {
      if (window.DEBUG_RHYTHM) console.log('🔄 TIMING RESET: 30-beat cycle complete - resetting hit windows to prevent drift');
      this.resetHitWindows();
    }
    
    // Check if this is a hit beat in pattern
    const patternBeat = this.beatPatterns[this.currentPattern][this.patternIndex];
    
    if (patternBeat === 1) {
      this.createBeatEffect();
      this.spawnAttackWindow();
    }
    
    this.patternIndex = (this.patternIndex + 1) % this.beatPatterns[this.currentPattern].length;
    
    // Occasionally change pattern
    if (this.tempoEstablishmentBeats && this.globalBeatCount % this.tempoEstablishmentBeats === 0) {
      this.currentPattern = (this.currentPattern + 1) % this.beatPatterns.length;
      if (window.DEBUG_RHYTHM) console.log(`Pattern changed to ${this.currentPattern}`);
    }
    
    // Visual feedback
    this.beatEffects.push({
      x: 960,
      y: 100,
      radius: 0,
      maxRadius: 150,
      opacity: 0.8,
      color: '#00ffff',
      growth: 6
    });
  }
  
  processTransportBeatEvent(event) {
    if (!event || event.type !== 'beat') return false;
    const transport = window.BARCODE && window.BARCODE.MusicTransport;
    const latest = transport && transport.getLastSample ? transport.getLastSample() : null;
    if (latest && event.generation !== latest.generation) return false;
    const key = `${event.profileId}:${event.generation}:${event.beatIndex}`;
    if (this.processedTransportBeatKeys[key]) return false;
    this.processedTransportBeatKeys[key] = true;
    this.lastProcessedTransportBeatKey = key;
    this.syncWithAudioBeat({ transportEvent: event });
    return true;
  }

  // Sync with audio system beat
  syncWithAudioBeat(options) {
    options = options || {};
    const currentTime = performance.now();
    if (!options.transportEvent) {
      // Legacy non-transport sync calls keep the old duplicate guard.
      const minSyncInterval = this.beatInterval * 0.7; // 70% of beat interval (more permissive)
      if (this.lastSyncTime && (currentTime - this.lastSyncTime) < minSyncInterval) {
        return; // Silently block duplicate legacy syncs
      }
    }
    
    this.lastSyncTime = currentTime;
    
    // CRITICAL: Always sync if running, regardless of visual state
    // Progress tracking is independent of R key toggle
    if (!this.running) {
      return; // Silently block if not running
    }
    
    // CRITICAL FIX: Exit loop restart mode immediately when first beat arrives
    if (this.loopRestartMode) {
      if (window.DEBUG_RHYTHM) console.log('🎵 LOOP RESTART EXIT: First beat arrived - exiting loop restart mode');
      this.loopRestartMode = false;
      if (window.DEBUG_RHYTHM) console.log('🎵 LOOP RESTART EXIT: Transitioning to tempo establishment beat counter');
    }
    
    // CRITICAL FIX: IMMEDIATE first beat count when sync is called
    // The first audio sync call should immediately count as beat 1
    if (!this.trackStarted) {
      this.trackStarted = true;
      this.trackStartTime = currentTime;
      this.lastBeatTime = currentTime;
      this.beatStartTime = currentTime;
      this.expectedBeatTime = currentTime + this.beatInterval;
      
      // CRITICAL: Initialize progress to start state BEFORE first beat
      this.barProgress = 0;
      this.phraseProgress = 0;
      this.currentBar = 0;
      this.currentBeat = 0;
      this.globalBeatCount = 0;
      
      // CRITICAL: Initialize tempo establishment to 0 BEFORE first beat
      this.tempoEstablishmentBeats = (window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive() && window.BARCODE.MusicProfiles.getActive().legacyCompatibility) ? window.BARCODE.MusicProfiles.getActive().legacyCompatibility.establishmentBeatCount : this.tempoEstablishmentBeats;
      this.currentTempoBeat = 0;
      this.tempoEstablished = false;
      
      // CRITICAL FIX: IMMEDIATELY increment to beat 1 - no delay
      // The audio system calling syncWithAudioBeat() IS the first beat
      this.currentTempoBeat = 1;
      this.globalBeatCount = 1;
      
      if (window.DEBUG_RHYTHM) console.log('🎵 FIRST BEAT: Audio sync called - immediate count to beat 1');
      if (window.DEBUG_RHYTHM) console.log(`🎵 TEMPO BEAT 1/${this.tempoEstablishmentBeats} - first beat established instantly`);
    } else {
      // CRITICAL FIX: Remove drift correction entirely - it was causing the timing drift
      // The drift correction system was accumulating errors over time
      // Instead, use absolute timing from audio sync calls
      
      // CRITICAL FIX: Trust the audio sync timing and increment immediately
      // This prevents accumulated timing errors that cause drift
      this.lastBeatTime = currentTime;
      this.beatStartTime = currentTime;
      this.expectedBeatTime = currentTime + this.beatInterval;
      
      // CRITICAL FIX: Increment beat count BEFORE triggering beat logic
      // The audio sync call IS the beat happening now
      if (this.currentTempoBeat < this.tempoEstablishmentBeats) {
        this.currentTempoBeat++;
        this.globalBeatCount++;
        if (window.DEBUG_RHYTHM) console.log(`🎵 TEMPO BEAT ${this.currentTempoBeat}/${this.tempoEstablishmentBeats} - sync incremented`);
        
        // CRITICAL FIX: Check for completion immediately after increment
        if (this.currentTempoBeat >= this.tempoEstablishmentBeats && !this.tempoEstablished) {
          this.tempoEstablished = true;
          if (window.DEBUG_RHYTHM) console.log('🎵 TEMPO ESTABLISHED! Sync function detected completion - switching to progress bars');
          if (window.DEBUG_RHYTHM) console.log('🎵 SWITCHING TO PROGRESS BARS - tempo establishment complete');
        }
      } else {
        // Regular beat handling after tempo established
        this.currentBeat = (this.currentBeat + 1) % this.beatsPerBar;
        if (this.currentBeat === 0) {
          this.currentBar = (this.currentBar + 1) % this.barsPerPhrase;
        }
        this.globalBeatCount++;
        if (window.DEBUG_RHYTHM) console.log(`🎵 REGULAR BEAT ${this.currentBeat}/${this.beatsPerBar} in BAR ${this.currentBar + 1}/4 - Global: ${this.globalBeatCount}`);
      }
      
      // Trigger beat effects and gameplay logic
      this.triggerBeat();
    }
  }
  
  recordBeatResult(judgment) {
    if (!['perfect','excellent','miss'].includes(judgment?.timing)) return;
    const audio = window.audioSystem?.context?.currentTime;
    const offset = window.BARCODE?.Preferences?.values.inputOffsetMs || 0;
    const sample = Number.isFinite(audio) ? window.BARCODE?.MusicTransport?.sample?.(audio-offset/1000) : null;
    if (!sample?.running || !Number.isFinite(sample.grid?.beatFloat)) return;
    if (this.beatResultGeneration !== sample.generation) { this.beatResults = new Map(); this.beatResultGeneration = sample.generation; }
    this.beatResults ||= new Map();
    const index = Number.isFinite(judgment.beatIndex) ? judgment.beatIndex : Math.round(sample.grid.beatFloat);
    this.beatResults.set(index, judgment.timing);
    while (this.beatResults.size > 12) this.beatResults.delete(this.beatResults.keys().next().value);
  }

  // Feedback-only hook for PlayerCombat's already-resolved primary attack judgment.
  applyResolvedAttackFeedback(judgment = {}) {
    const timing = judgment && judgment.timing ? judgment.timing : 'unavailable';
    this.recordBeatResult(judgment);
    this.lastJudgment = { hit: timing === 'perfect' || timing === 'excellent', timing, combo: this.combo };
    if (timing === 'perfect' || timing === 'excellent') {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.runBestCombo = Math.max(this.runBestCombo || 0, this.combo);
      this.triggerPowerArc(timing, false);
      this.createHitEffect(timing, false);
      window.audioSystem?.playRhythmAttack?.(timing);
      if (this.combo >= 5 && window.tutorialSystem && window.tutorialSystem.isActive && window.tutorialSystem.isActive() && window.tutorialSystem.checkObjective) window.tutorialSystem.checkObjective('rhythm_combo');
    } else {
      this.combo = 0;
      this.arcGrowthLevel = 0;
      this.createMissEffect();
      if (timing === 'miss' && window.audioSystem) {
        if (window.audioSystem.playCombatCue) window.audioSystem.playCombatCue('miss');
        else window.audioSystem.playSound?.('synthHit', 0.3);
      }
    }
    return this.lastJudgment;
  }

  // Handle rhythm input
  handleInput(action = 'attack') {
    if (!this.active) return { hit: false, timing: 'inactive', combo: this.combo };
    
    // Block input until track starts
    if (!this.trackStarted) {
      return { hit: false, timing: 'waiting', combo: this.combo };
    }
    
    const currentTime = performance.now();
    
    // Input cooldown is still wall-clock UI gating; musical judgment is transport-owned.
    if (currentTime - this.lastInputTime < this.inputCooldown) {
      return { hit: false, timing: 'cooldown', combo: this.combo };
    }
    this.lastInputTime = currentTime;

    const transport = window.BARCODE && window.BARCODE.MusicTransport;
    const audioTimeSec = window.audioSystem && window.audioSystem.context ? window.audioSystem.context.currentTime : null;
    const judgment = transport && Number.isFinite(audioTimeSec) && this.judgmentRuleId ? transport.judgeInput(this.judgmentRuleId, audioTimeSec, window.BARCODE?.Preferences?.values.inputOffsetMs || 0) : { available: false, timing: 'unavailable' };
    this.recordBeatResult(judgment);
    const isMiss = !judgment.available || judgment.timing === 'miss';
    if (window.DEBUG_RHYTHM) console.log(`TRANSPORT JUDGMENT: rule=${this.judgmentRuleId || 'none'}, timing=${judgment.timing}, distanceMs=${judgment.distanceMs == null ? 'n/a' : judgment.distanceMs.toFixed(0)}`);
    
    // CRITICAL: Always reset combo on misses/unavailable transport - no exceptions
    if (isMiss) {
      if (window.DEBUG_RHYTHM) console.log(`❌ MISSED BEAT: transport timing=${judgment.timing} - COMBO RESET!`);
      
      // ✅ FIXED: Reset combo IMMEDIATELY on incorrect press
      this.combo = 0;
      if (window.DEBUG_RHYTHM) console.log(`🔄 IMMEDIATE COMBO RESET: Combo set to 0 instantly on miss`);
      
      // Also reset arc growth level immediately
      this.arcGrowthLevel = 0;
      if (window.DEBUG_RHYTHM) console.log(`🔄 ARC GROWTH RESET: Arc growth set to 0 instantly on miss`);
      
      this.createMissEffect();
      
      if (window.audioSystem) {
        if (window.audioSystem.playCombatCue) window.audioSystem.playCombatCue('miss');
        else window.audioSystem.playSound('synthHit', 0.3);
      }
      
      // MISSED BEATS don't damage any enemies
      return { hit: false, timing: 'miss', combo: 0 };
    }
    
    let timing = judgment.timing;
    let isHit = timing === 'perfect' || timing === 'excellent';
    // GOOD REMOVED - anything beyond excellent is now a miss
    
    // Check attack window bonus (only for successful hits)
    const attackBonus = this.checkAttackWindow();
    
    if (isHit) {
      // Handle successful hit
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.runBestCombo = Math.max(this.runBestCombo || 0, this.combo);
      
      // Score calculation removed
      
      // TRIGGER POWER ARCS for successful hits
      this.triggerPowerArc(timing, attackBonus);
      
      // Visual feedback
      this.createHitEffect(timing, attackBonus);
      
      // Audio feedback
      window.audioSystem?.playRhythmAttack?.(timing);
      
      if (window.DEBUG_RHYTHM) console.log(`${timing.toUpperCase()} HIT! Combo: ${this.combo}`);
      
      // RhythmSystem now returns judgment/feedback only; PlayerCombat owns damage.
      const rhythmResult = { hit: true, timing: timing, combo: this.combo };
      this.lastJudgment = rhythmResult;
      
      // Boss and future targets must use BARCODE.PlayerCombat transaction boundary.
      
      if (window.DEBUG_RHYTHM) console.log(`🎵 RHYTHM HIT RESULT: hit=true, timing=${timing}, combo=${this.combo}`);
      return { hit: true, timing: timing, combo: this.combo };
    }
    
    // NOTE: We should never reach here because misses are handled above
    // This is just safety fallback
    if (window.DEBUG_RHYTHM) console.log('SAFETY FALLBACK - Should never reach here!');
    return { hit: false, timing: 'miss', combo: this.combo };
  }
  
  // Score calculation removed
  
  // Create attack windows on hit beats
  spawnAttackWindow() {
    if (!this.attackWindows.active && Math.random() > 0.7) {
      this.attackWindows.active = true;
      this.attackWindows.type = 'start';
      this.attackWindows.startTime = performance.now();
      
      // Auto-close after duration
      setTimeout(() => {
        this.attackWindows.active = false;
      }, this.attackWindows.duration);
    }
  }
  
  // Check if input hits attack window
  checkAttackWindow() {
    if (!this.attackWindows.active) return false;
    
    const elapsed = performance.now() - this.attackWindows.startTime;
    if (elapsed <= this.attackWindows.duration) {
      this.attackWindows.active = false; // Consume the window
      return true;
    }
    
    return false;
  }
  
  // Update attack windows
  updateAttackWindows() {
    if (this.attackWindows.active) {
      const elapsed = performance.now() - this.attackWindows.startTime;
      if (elapsed > this.attackWindows.duration) {
        this.attackWindows.active = false;
      }
    }
  }
  
  // checkMissedBeats() function removed - combo only resets on actual misses
  
  // Create beat visual effect
  createBeatEffect() {
    this.beatEffects.push({
      x: 960,
      y: 100,
      radius: 20,
      maxRadius: 200,
      opacity: 0.6,
      color: '#ff00ff',
      growth: 8
    });
  }
  
  // Create hit visual effect
  createHitEffect(timing, attackBonus) {
    const colors = {
      perfect: '#ff00ff',
      excellent: '#00ff00',
      good: '#ffff00'
    };
    
    const color = attackBonus ? '#ff0000' : colors[timing];
    const particleCount = attackBonus ? 30 : 15;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = window.randomRange(3, 8);
      
      this.particles.push({
        x: 960 + Math.cos(angle) * 50,
        y: 100 + Math.sin(angle) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1.0,
        decay: 0.015,
        color: color,
        size: window.randomRange(3, 8)
      });
    }
    
    // Add hit indicator
    this.hitIndicators.push({
      text: timing.toUpperCase(),
      x: 960,
      y: 100,
      vx: 0,
      vy: -2,
      life: 1.0,
      decay: 0.02,
      color: color,
      size: timing === 'perfect' ? 28 : 24
    });
  }
  
  // Create miss visual effect
  createMissEffect() {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const speed = window.randomRange(1, 4);
      
      this.particles.push({
        x: 960,
        y: 100,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.02,
        color: '#ff0000',
        size: window.randomRange(2, 5)
      });
    }
    
    this.hitIndicators.push({
      text: 'MISS',
      x: 960,
      y: 100,
      vx: 0,
      vy: -1,
      life: 1.0,
      decay: 0.015,
      color: '#ff0000',
      size: 20
    });
  }
  
  // Create jammer hit visual effect
  createJammerHitEffect(x, y) {
    // Orange particles for jammer hits
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = window.randomRange(2, 6);
      
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1.0,
        decay: 0.02,
        color: '#ff9900',
        size: window.randomRange(3, 6)
      });
    }
    
    // Jammer hit indicator
    this.hitIndicators.push({
      text: 'JAMMER',
      x: x,
      y: y - 30,
      vx: 0,
      vy: -1,
      life: 1.0,
      decay: 0.02,
      color: '#ff9900',
      size: 18
    });
  }
  
  // Update visual effects
  updateEffects(deltaTime) {
    const dt = deltaTime / 1000;
    
    // Update beat effects
    this.beatEffects = this.beatEffects.filter(effect => {
      effect.radius += effect.growth;
      effect.opacity *= 0.92;
      return effect.opacity > 0.01;
    });
    
    // Update particles
    this.particles = this.particles.filter(particle => {
      particle.x += particle.vx * dt * 60;
      particle.y += particle.vy * dt * 60;
      particle.vy += 0.3; // Gravity
      particle.life -= particle.decay;
      return particle.life > 0;
    });
    
    // Update hit indicators
    this.hitIndicators = this.hitIndicators.filter(indicator => {
      indicator.x += indicator.vx * dt * 60;
      indicator.y += indicator.vy * dt * 60;
      indicator.life -= indicator.decay;
      return indicator.life > 0;
    });
  }
  
  // Draw rhythm interface
  draw(ctx, playerX, playerY) {
    // CRITICAL: Only draw if active OR in loop restart mode
    // Don't show waiting screen during game over
    const isGameOver = window.gameState && window.gameState.gameOver;
    if (!this.active && (!this.loopRestartMode || isGameOver)) return;
    
    ctx.save();
    
    // LAYERED RENDERING SYSTEM:
    // Electrical arcs and forcefield are handled by main game loop for proper layering
    // This function only draws UI elements and visual effects
    
    // Draw 4-Bar Progress Visualization
    this.draw4BarProgress(ctx);
    
    // Draw beat effects only if active
    this.beatEffects.forEach(effect => {
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = effect.opacity;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, Math.max(0, effect.radius), 0, Math.PI * 2);
      ctx.stroke();
    });
    
    // Draw particles only if active
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
    
    // Draw hit indicators only if active
    this.hitIndicators.forEach(indicator => {
      ctx.fillStyle = indicator.color;
      ctx.globalAlpha = indicator.life;
      ctx.font = `bold ${indicator.size}px Orbitron`;
      ctx.textAlign = 'center';
      ctx.fillText(indicator.text, indicator.x, indicator.y);
    });
    
    // Draw UI elements only if active
    if (this.active) {
      this.drawUI(ctx);
    }
    
    ctx.restore();
  }
  
  // Draw enhanced 4-bar progress visualization
  getPredictiveNotes() {
    const time = window.audioSystem?.context?.currentTime;
    const offset = window.BARCODE?.Preferences?.values.visualOffsetMs || 0;
    const sample = Number.isFinite(time) ? window.BARCODE?.MusicTransport?.sample?.(time - offset / 1000) : null;
    const beat = sample?.grid?.beatFloat;
    if (!sample?.running || !Number.isFinite(beat)) return { ready: false, notes: [] };
    const base = Math.floor(beat), meter = sample.grid.beatsPerBar || 4;
    return { ready: true, fraction: beat - base, notes: Array.from({ length: 6 }, (_, i) => {
      const index = base + i - 1;
      return { x: 96 + (index - beat) * 82, downbeat: index % meter === 0, index,
        timing: this.beatResultGeneration === sample.generation ? this.beatResults?.get(index) : null };
    }).filter(note => note.x >= -66 && note.x <= 460) };
  }
  drawCompactHUD(ctx) {
    window.BARCODE?.ComicHUD?.rhythm(ctx, { lane: this.getPredictiveNotes(),
      pattern: window.BARCODE?.playerCombat?.getPattern({ nextSuccess: true }) || 'pulse',
      pad: window.BARCODE?.GamepadUI?.connected, combo: this.combo, established: this.tempoEstablished,
      tempoBeat: this.currentTempoBeat, tempoBeats: this.tempoEstablishmentBeats });
  }

  draw4BarProgress(ctx) {
    // PRIORITY ORDER: Loop restart > Tempo establishment > Normal progress > Waiting message
    
    // 0. LOOP RESTART: Show waiting message during music loop restarts (before first beat)
    if (this.loopRestartMode) {
      ctx.fillStyle = '#ff6600'; // Orange-red for loop restart
      ctx.font = 'bold 28px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText(`MUSIC LOOP RESTARTING`, 960, 150);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px Orbitron';
      ctx.fillText(`WAITING FOR BEAT`, 960, 190);
      
      ctx.fillStyle = '#ff6600';
      ctx.font = '18px monospace';
      ctx.fillText(`Loop #${this.loopRestartCount}`, 960, 220);
      
      // Draw static waiting indicator (no progress until beat arrives)
      const restartProgressWidth = 600;
      const restartProgressHeight = 25;
      const restartProgressX = 960 - restartProgressWidth / 2;
      const restartProgressY = 250;
      
      // Restart progress background
      ctx.fillStyle = '#2a0a4a';
      ctx.fillRect(restartProgressX, restartProgressY, restartProgressWidth, restartProgressHeight);
      
      // Pulsing waiting indicator
      const pulse = Math.sin(Date.now() * 0.005) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255, 102, 0, ${0.3 + pulse * 0.7})`;
      ctx.fillRect(restartProgressX, restartProgressY, restartProgressWidth, restartProgressHeight);
      
      // Restart progress border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(restartProgressX, restartProgressY, restartProgressWidth, restartProgressHeight);
      
      ctx.fillStyle = '#ffaa00';
      ctx.font = '16px monospace';
      ctx.fillText('Waiting for first beat to restart tempo establishment...', 960, 290);
      
      return; // Exit here - only show loop restart waiting UI
    }
    
    // 1. TEMPO ESTABLISHMENT: Always show during first 32 beats (after loop restart or initial start)
    // CRITICAL FIX: Check tempo establishment state properly
    if (this.running && !this.tempoEstablished) {
      // DEBUG: Log current state for debugging
      if (window.DEBUG_RHYTHM) console.log(`🎵 DEBUG: Tempo establishment active - currentTempoBeat=${this.currentTempoBeat}, tempoEstablished=${this.tempoEstablished}, tempoEstablishmentBeats=${this.tempoEstablishmentBeats}`);
      
      // CRITICAL FIX: Force completion if we've reached or exceeded the beat count
      if (this.currentTempoBeat >= this.tempoEstablishmentBeats) {
        if (window.DEBUG_RHYTHM) console.log('🎵 DEBUG: Forcing tempo establishment completion in draw function');
        this.tempoEstablished = true;
      }
      ctx.fillStyle = '#ffaa00'; // Orange for tempo establishment
      ctx.font = 'bold 24px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText(`ESTABLISHING TEMPO`, 960, 150);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px Orbitron';
      // CRITICAL FIX: Show actual sync beat count - displays exactly what audio system has called
      const displayCompletedBeats = this.currentTempoBeat;
      ctx.fillText(`BEAT ${displayCompletedBeats}/${this.tempoEstablishmentBeats}`, 960, 190);
      
      ctx.fillStyle = '#ffaa00';
      ctx.font = '16px monospace';
      ctx.fillText('32 distinctive beats setting song tempo', 960, 220);
      
      // Draw tempo establishment progress
      const tempoProgressWidth = 600;
      const tempoProgressHeight = 20;
      const tempoProgressX = 960 - tempoProgressWidth / 2;
      const tempoProgressY = 250;
      
      // Tempo progress background
      ctx.fillStyle = '#2a0a4a';
      ctx.fillRect(tempoProgressX, tempoProgressY, tempoProgressWidth, tempoProgressHeight);
      
      // CRITICAL FIX: Use EXACT beat count instead of time-based progress
      // The beat counter should show COMPLETED beats only - no interpolation
      // This ensures perfect synchronization with actual audio beats
      let totalTempoProgress = 0;
      
      if (this.trackStarted && this.currentTempoBeat > 0) {
        // Use the actual completed beat count - no time-based interpolation
        // This displays exactly what the audio system has synced
        totalTempoProgress = this.currentTempoBeat / this.tempoEstablishmentBeats;
      }
      
      const tempoFillWidth = tempoProgressWidth * Math.min(totalTempoProgress, 1.0);
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(tempoProgressX, tempoProgressY, tempoFillWidth, tempoProgressHeight);
      
      // Tempo progress border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(tempoProgressX, tempoProgressY, tempoProgressWidth, tempoProgressHeight);
      
      return; // CRITICAL: Exit here - don't show anything else
    }
    
    // CRITICAL: Once we have a beat timestamp (lastBeatTime > 0), always show progress
    // The waiting screen is replaced by progress bars immediately when first beat plays
    
    const barWidth = 80;
    const barHeight = 50;
    const barSpacing = 15;
    const totalWidth = 4 * barWidth + 3 * barSpacing;
    const startX = 960 - totalWidth / 2;
    const startY = 150;
    
    // Background for all bars
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(startX - 10, startY - 10, totalWidth + 20, barHeight + 60);
    
    // Draw each bar (only after tempo established)
    for (let bar = 0; bar < 4; bar++) {
      const barX = startX + bar * (barWidth + barSpacing);
      
      // Bar background
      ctx.fillStyle = '#2a0a4a';
      ctx.fillRect(barX, startY, barWidth, barHeight);
      
      // Special orange border during tempo establishment
      ctx.strokeStyle = !this.tempoEstablished ? '#ffaa00' : '#ff00ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, startY, barWidth, barHeight);
      
      // Only show progress after tempo established
      if (!this.tempoEstablished) {
        // During tempo establishment, show simple count instead of progress
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 20px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.currentTempoBeat}`, barX + barWidth/2, startY + barHeight/2 + 7);
      } else {
        // After tempo established, show normal progress
        // Determine bar fill state - uses current background progress
        if (bar < this.currentBar) {
          // Completed bars - fully filled
          const gradient = ctx.createLinearGradient(barX, startY, barX, startY + barHeight);
          gradient.addColorStop(0, '#00ffff');
          gradient.addColorStop(1, '#ff00ff');
          ctx.fillStyle = gradient;
          ctx.fillRect(barX + 2, startY + 2, barWidth - 4, barHeight - 4);
        } else if (bar === this.currentBar) {
          // Current bar - fill based on beat progress from background
          const beatProgress = (this.currentBeat + this.barProgress) / 4.0;
          const fillWidth = Math.floor((barWidth - 4) * beatProgress);
          
          if (fillWidth > 0) {
            const gradient = ctx.createLinearGradient(barX, startY, barX, startY + barHeight);
            gradient.addColorStop(0, '#00ffff');
            gradient.addColorStop(1, '#ff00ff');
            ctx.fillStyle = gradient;
            ctx.fillRect(barX + 2, startY + 2, fillWidth, barHeight - 4);
          }
        }
        
        // Draw beat markers
        for (let beat = 0; beat < 4; beat++) {
          const beatX = barX + 2 + (beat * (barWidth - 4) / 4);
          
          if (beat < this.currentBeat) {
            // Completed beats
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(beatX - 1, startY + 10, 2, barHeight - 20);
          } else if (beat === this.currentBeat) {
            // Current beat
            ctx.fillStyle = '#ffff00';
            ctx.fillRect(beatX - 2, startY + 5, 4, barHeight - 10);
          } else {
            // Future beats
            ctx.fillStyle = '#666666';
            ctx.fillRect(beatX - 1, startY + 15, 2, barHeight - 30);
          }
        }
      }
      
      // Bar labels
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText(`BAR ${bar + 1}`, barX + barWidth/2, startY - 15);
      
      // Beat indicators
      ctx.font = '10px monospace';
      ctx.fillStyle = '#888888';
      for (let beat = 0; beat < 4; beat++) {
        const beatX = barX + 10 + beat * 18;
        ctx.fillText(`${beat + 1}`, beatX, startY + barHeight + 15);
      }
    }
    
    // Phrase progress bar - uses background progress
    const phraseY = startY + barHeight + 40;
    ctx.fillStyle = '#2a0a4a';
    ctx.fillRect(startX, phraseY, totalWidth, 8);
    
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(startX, phraseY, totalWidth * this.phraseProgress, 8);
    
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, phraseY, totalWidth, 8);
    
    // Phrase label
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText('PHRASE PROGRESS', 960, phraseY - 15);
  }
  
  // Draw UI elements
  drawUI(ctx) {
    // Combo display (score removed)
    ctx.fillStyle = '#ff00ff';
    ctx.font = 'bold 28px Orbitron';
    ctx.textAlign = 'left';
    ctx.fillText(`COMBO: ${this.combo}`, 50, 300);
    
    // Arc Growth Level indicator (combo-based)
    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 20px Orbitron';
    ctx.fillText(`ARC POWER:`, 50, 360);
    
    // Draw growth level bar based on combo
    const growthBarWidth = 200;
    const growthBarHeight = 12;
    const growthBarX = 50;
    const growthBarY = 380;
    
    // Background
    ctx.fillStyle = '#2a0a4a';
    ctx.fillRect(growthBarX, growthBarY, growthBarWidth, growthBarHeight);
    
    // Fill based on current combo level
    const comboProgress = this.arcGrowthLevel / this.maxArcGrowthLevel;
    const fillWidth = growthBarWidth * comboProgress;
    
    if (fillWidth > 0) {
      // Gradient from yellow to red as combo increases
      const hue = 60 - (comboProgress * 60); // Yellow to red
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(growthBarX, growthBarY, fillWidth, growthBarHeight);
    }
    
    // Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(growthBarX, growthBarY, growthBarWidth, growthBarHeight);
    
    // Combo text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Orbitron';
    ctx.fillText(`Combo ${this.arcGrowthLevel}/${this.maxArcGrowthLevel}`, growthBarX + growthBarWidth + 10, growthBarY + 10);
    
    // Growth indicator text with combo progression details
    if (this.arcGrowthLevel === 0) {
      ctx.fillStyle = '#888888';
      ctx.font = '12px Orbitron';
      ctx.fillText('Arcs grow with combo (180px → 300px radius)', 50, 410);
    } else if (this.arcGrowthLevel >= this.maxArcGrowthLevel) {
      ctx.fillStyle = '#ff0000';
      ctx.font = 'bold 12px Orbitron';
      ctx.fillText('MAXIMUM COMBO! (300px radius, 2.2x power)', 50, 410);
    } else {
      const currentRadius = this.getDamageRadius();
      ctx.fillStyle = '#ffaa00';
      ctx.font = '12px Orbitron';
      const comboToNext = this.arcGrowthLevel + 1;
      ctx.fillText(`Combo ${comboToNext} → ${currentRadius.toFixed(0)}px radius`, 50, 410);
    }
    
    // Circular timing indicator - replaces timing box
    if (!this.trackStarted) {
      // Show idle circle when not started
      this.drawTimingCircle(ctx, 960, 105, 30, 0.3, '#666666');
    } else if (this.tempoEstablished) {
      // Only show timing circle AFTER tempo establishment is complete
      const timeSinceBeat = performance.now() - this.lastBeatTime;
      const timing = this.getCurrentTimingWindow(timeSinceBeat);
      
      // Always show the circle, color based on timing quality
      let color;
      if (timing === 'perfect') {
        color = '#00ff00'; // Green for perfect
      } else if (timing === 'excellent') {
        color = '#aaff00'; // Yellow-green for excellent
      } else if (timing === 'good') {
        color = '#ffaa00'; // Orange for good
      } else {
        color = '#ff0000'; // Red for miss/out of window
      }
      
      const intensity = timing !== 'miss' ? 0.8 : 0.3;
      this.drawTimingCircle(ctx, 960, 105, 30, intensity, color);
    }
    // During tempo establishment phase, show idle circle
    else {
      this.drawTimingCircle(ctx, 960, 105, 30, 0.3, '#666666');
    }
    
    // Attack window indicator removed - no longer needed
    
    // Controls - HIDE during tutorial to prevent overlapping with tutorial text
    const isTutorialActive = window.tutorialSystem && window.tutorialSystem.isActive();
    if (!isTutorialActive) {
      ctx.fillStyle = '#ffff00';
      ctx.font = '16px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('CONTROLS: ↓ = RHYTHM ATTACK | R = TOGGLE | ESC = EXIT', 960, 950);
      ctx.font = '14px monospace';
      ctx.fillText('Hit the beat on purple/cyan timing windows for combo building!', 960, 970);
      ctx.fillText('Electric arcs grow with combo and change color with each successful hit!', 960, 990);
    }
  }
  
  // Get current timing window
  getCurrentTimingWindow(timeSinceBeat) {
    // Simplified: Use timeSinceBeat directly for consistency
    if (timeSinceBeat <= this.timingWindows.perfect) return 'perfect';
    if (timeSinceBeat <= this.timingWindows.excellent) return 'excellent';
    if (timeSinceBeat <= this.timingWindows.good) return 'good';
    return 'miss';
  }
  
  // CRITICAL: Force exact synchronization with master audio time
  forceExactSync(masterSyncTime) {
    if (window.DEBUG_RHYTHM) console.log('🔥 FORCE SYNC: Aligning rhythm system to master sync time');
    if (window.DEBUG_RHYTHM) console.log(`🔥 MASTER SYNC TIME: ${masterSyncTime}`);
    
    // CRITICAL: Reset ALL timing to exact same moment
    this.trackStarted = true;
    this.trackStartTime = masterSyncTime;
    this.lastBeatTime = masterSyncTime;
    this.beatStartTime = masterSyncTime;
    this.expectedBeatTime = masterSyncTime + this.beatInterval;
    
    // CRITICAL: Reset progress to exact start
    this.currentBar = 0;
    this.currentBeat = 0;
    this.globalBeatCount = 0;
    this.barProgress = 0;
    this.phraseProgress = 0;
    
    // CRITICAL: 32 distinctive beats for tempo establishment
    this.tempoEstablishmentBeats = (window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive() && window.BARCODE.MusicProfiles.getActive().legacyCompatibility) ? window.BARCODE.MusicProfiles.getActive().legacyCompatibility.establishmentBeatCount : this.tempoEstablishmentBeats;
    this.currentTempoBeat = 0;
    this.tempoEstablished = false;
    
    // CRITICAL: IMMEDIATE first tempo establishment beat
    setTimeout(() => {
      this.triggerTempoEstablishmentBeat();
    }, 0);
    
    if (window.DEBUG_RHYTHM) console.log('🔥 FORCE SYNC COMPLETE: Rhythm system locked to exact master time');
  }
  
  // Draw center screen pulsing circle (red to green based on beat progress)
  drawPulsingCircle(ctx) {
    const centerX = 1920 / 2;
    const centerY = 1080 / 2;
    const maxRadius = 35;
    const minRadius = 25;
    
    // Calculate progress-based values
    let beatProgress = 0;
    let opacity = 0.3;
    let radius = minRadius;
    
    if (this.trackStarted && this.lastBeatTime > 0) {
      const currentTime = performance.now();
      const timeSinceBeat = currentTime - this.lastBeatTime;
      beatProgress = Math.min(timeSinceBeat / this.beatInterval, 1.0);
      opacity = 0.3 + (beatProgress * 0.7); // Low at start, high at end
      radius = minRadius + (beatProgress * (maxRadius - minRadius)); // Small at start, large at end
    }
    
    // Interpolate color from red (beat start) to green (beat end)
    const red = Math.floor(255 * (1 - beatProgress));
    const green = Math.floor(255 * beatProgress);
    const blue = 0;
    
    // Draw outer glow
    const glowRadius = Math.max(0, radius + 10);
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${opacity * 0.2})`;
    ctx.fill();
    
    // Draw main circle
    const mainRadius = Math.max(0, radius);
    ctx.beginPath();
    ctx.arc(centerX, centerY, mainRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${opacity})`;
    ctx.fill();
    
    // Draw inner bright core
    const coreRadius = Math.max(0, radius * 0.6);
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
    ctx.fill();
  }
  
  // Draw blue forcefield hugging the player sprite - REMOVED CORNER DOTS
  drawForcefield(ctx, playerX, playerY) {
    // Forcefield disabled - corner dots removed
    return;
  }
  
  // Draw electrical arcs shooting FROM player outward
  drawElectricalArcs(ctx, playerX, playerY) {
    if (window.BARCODE?.combatFX) { window.BARCODE.combatFX.drawRhythmField(ctx, playerX, playerY); return; }
    const attackRadius = 300;
    const currentTime = performance.now();
    
    // Save context state to ensure clean rendering
    ctx.save();
    
    // BEAT-SYNCHRONIZED ARC BURSTS
    if (!this.trackStarted || this.lastBeatTime === 0) {
      ctx.restore();
      return; // No arcs if rhythm not started
    }
    
    const timeSinceBeat = currentTime - this.lastBeatTime;
    const beatProgress = Math.min(timeSinceBeat / this.beatInterval, 1.0);
    
    // Only shoot arcs during beat windows - more rhythmic
    const beatWindowDuration = 200; // 200ms beat window for arc bursts
    if (timeSinceBeat > beatWindowDuration) {
      ctx.restore();
      return; // Only show arcs during beat windows
    }
    
    // Calculate burst timing within beat window
    const burstArcs = this.getBeatArcBursts(currentTime, timeSinceBeat);
    
    if (burstArcs.length === 0) {
      ctx.restore();
      return; // No arcs to draw this frame
    }
    
    // Add global electrical field effect
    const fieldIntensity = this.getFieldIntensity(currentTime);
    
    // Calculate damage radius based on combo growth (weaker start, gradual growth)
    let currentAttackRadius = this.getDamageRadius();
    
    // Draw beat-synchronized arc bursts
    burstArcs.forEach((arcConfig, burstIndex) => {
      const { arcDelay, arcIndex, totalBurstArcs } = arcConfig;
      
      // Calculate angle for this specific arc in the burst
      const baseAngle = (Math.PI * 2 * arcIndex) / totalBurstArcs;
      
      // Beat-synchronized chaos - less random, more rhythmic
      const beatSyncTime = currentTime * 0.005 + arcIndex * 0.3;
      const chaosAngle = Math.sin(beatSyncTime * 3) * 0.6 + Math.cos(beatSyncTime * 7) * 0.3;
      const shootOutward = Math.sin(beatSyncTime * 2) * 0.3;
      
      const angle = baseAngle + chaosAngle;
      
      // Calculate player sprite dimensions
      let spriteWidth = 64;
      let spriteHeight = 64;
      
      if (window.player && window.player.sprite && window.player.sprite.isLoaded && window.player.sprite.isLoaded()) {
        const frameSize = window.player.sprite.getCurrentFrameSize();
        if (frameSize) {
          spriteWidth = frameSize.width;
          spriteHeight = frameSize.height;
        }
      }
      
      // Apply player scale if available
      if (window.player && window.player.scale) {
        spriteWidth *= window.player.scale;
        spriteHeight *= window.player.scale;
      }
      
      // VARYING START POINTS to eliminate hollow center
      // Some arcs start from center, some from edges, some from random points within sprite
      let startRadius;
      const startPointType = Math.random();
      
      if (startPointType < 0.3) {
        // 30% start from very center - eliminates dead zone
        startRadius = Math.random() * 10; // 0-10 pixels from center
      } else if (startPointType < 0.6) {
        // 30% start from inner body area
        startRadius = 10 + Math.random() * 20; // 10-30 pixels from center
      } else if (startPointType < 0.8) {
        // 20% start from middle of sprite
        startRadius = 30 + Math.random() * 30; // 30-60 pixels from center
      } else {
        // 20% start from near sprite edge (traditional)
        startRadius = Math.max(spriteWidth, spriteHeight) / 2 - 10 + Math.random() * 20; // Near edge but slightly inside
      }
      
      // OFFSET START POINT 16px TOWARD FRONT of character
      // Player faces direction based on this.facing, so front is in the direction they're looking
      const frontOffset = 16; // Move 16 pixels toward front
      const facingDirection = (window.player && window.player.facing) || 1; // Default to right if no player
      
      // Adjust start position based on facing direction
      const startX = playerX + Math.cos(angle) * startRadius + facingDirection * frontOffset;
      const startY = playerY + Math.sin(angle) * startRadius;
      
      const endRadius = currentAttackRadius * (0.7 + shootOutward); // More varied extension with growth
      
      // OFFSET END POINT 10px TOWARD FRONT as well (maintains arc direction)
      const endX = playerX + Math.cos(angle) * endRadius + facingDirection * frontOffset;
      const endY = playerY + Math.sin(angle) * endRadius;
      
      // Beat-synchronized intensity - check for power arcs first
      let intensity = 1.0;
      
      if (this.powerArcActive) {
        // POWER ARC MODE - intensity based on combo growth
        intensity = this.powerArcIntensity * 0.8; // Scale down slightly for visual balance
        if (window.DEBUG_RHYTHM) console.log(`⚡ POWER ARC ACTIVE: ${intensity.toFixed(1)}x intensity`);
      } else {
        // REGULAR BEAT MODE - background arcs stay blue and light, no growth
        intensity = 0.25; // Slightly stronger for background arcs
        
        if (timeSinceBeat < 50) {
          intensity = 0.35; // Slightly brighter on beat hit
        } else if (timeSinceBeat < 100) {
          intensity = 0.2; // Dimmer
        } else {
          intensity = 0.15; // Very weak
        }
      }
      
      // Apply field intensity modifier
      intensity *= fieldIntensity;
      
      // Beat-synced arc timing - vary arc types by burst position
      const arcType = (burstIndex + arcIndex) % 4;
      // Calculate subtle color variation based on growth level
      const colorVariation = this.getGrowthColorVariation();
      
      if (arcType === 0) {
        // THICK MAIN BOLT - primary power arcs
        this.drawThickLightningBolt(
          ctx,
          startX, startY,
          endX, endY,
          intensity,
          colorVariation.primary,
          colorVariation.core
        );
      } else if (arcType === 1) {
        // CHAOTIC BRANCHING - wildly branching arcs
        this.drawChaoticLightningBolt(
          ctx,
          startX, startY,
          endX, endY,
          intensity,
          colorVariation
        );
      } else if (arcType === 2) {
        // MULTI-BRANCH - multiple splitting paths
        this.drawMultiBranchLightning(
          ctx,
          startX, startY,
          endX, endY,
          intensity,
          colorVariation
        );
      } else {
        // CLASSIC JAGGED - traditional lightning
        this.drawLightningBolt(
          ctx,
          startX, startY,
          endX, endY,
          intensity,
          colorVariation.secondary,
          colorVariation.bright
        );
      }
      
      // Add electrical particles for extra chaos
      if (Math.random() < 0.8) { // Higher particle chance during beats
        this.drawElectricalParticles(
          ctx,
          startX + Math.cos(angle) * 20,
          startY + Math.sin(angle) * 20,
          intensity
        );
      }
    });
    
    // Central electrical burst removed - no more circle in center
    
    // Restore context state
    ctx.restore();
  }
  
  // Draw single lightning bolt with chaotic branching
  drawLightningBolt(ctx, startX, startY, endX, endY, intensity, color1, color2) {
    ctx.strokeStyle = color1;
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.globalAlpha = intensity;
    ctx.lineCap = 'butt'; // Sharp ends instead of rounded
    ctx.lineJoin = 'miter'; // Sharp corners instead of rounded
    
    // Main bolt from player outward
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    
    const segments = 4 + Math.floor(Math.random() * 3);
    const points = [{x: startX, y: startY}];
    
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = startX + (endX - startX) * t;
      const baseY = startY + (endY - startY) * t;
      
      // Chaotic displacement perpendicular to direction
      const perpX = -(endY - startY) / (Math.hypot(endX - startX, endY - startY) + 0.001);
      const perpY = (endX - startX) / (Math.hypot(endX - startX, endY - startY) + 0.001);
      
      const displacement = Math.sin(t * Math.PI * 2) * 20 + Math.random() * 15 - 7.5;
      const x = baseX + perpX * displacement;
      const y = baseY + perpY * displacement;
      
      points.push({x, y});
      ctx.lineTo(x, y);
    }
    
    points.push({x: endX, y: endY});
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // Bright core
    ctx.strokeStyle = color2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    points.forEach(point => {
      ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    
    // Chaotic branches shooting outward
    const branchCount = Math.floor(Math.random() * 3);
    for (let b = 0; b < branchCount; b++) {
      const branchPoint = points[Math.floor(Math.random() * (points.length - 2)) + 1];
      const branchAngle = Math.random() * Math.PI * 2;
      const branchLength = 20 + Math.random() * 30;
      
      ctx.strokeStyle = `rgba(150, 200, 255, ${intensity * 0.7})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(branchPoint.x, branchPoint.y);
      
      const branchEndX = branchPoint.x + Math.cos(branchAngle) * branchLength;
      const branchEndY = branchPoint.y + Math.sin(branchAngle) * branchLength;
      
      // Add some chaos to branches
      const midX = (branchPoint.x + branchEndX) / 2 + (Math.random() - 0.5) * 15;
      const midY = (branchPoint.y + branchEndY) / 2 + (Math.random() - 0.5) * 15;
      
      ctx.lineTo(midX, midY);
      ctx.lineTo(branchEndX, branchEndY);
      ctx.stroke();
    }
  }
  
  // Get field intensity for overall electrical effect
  getFieldIntensity(currentTime) {
    let intensity = 0.8;
    
    // Rhythm-based pulsing
    if (this.trackStarted && this.lastBeatTime > 0) {
      const timeSinceBeat = currentTime - this.lastBeatTime;
      const beatProgress = Math.min(timeSinceBeat / this.beatInterval, 1.0);
      
      if (beatProgress < 0.2) {
        intensity = 1.2; // Strong pulse on beat
      } else {
        intensity = 0.7 + Math.sin(beatProgress * Math.PI * 12) * 0.5; // Rapid pulsing
      }
    }
    
    // Add global chaos
    intensity += Math.sin(currentTime * 0.01) * 0.2;
    
    return Math.max(0.5, Math.min(1.5, intensity));
  }
  
  // Get color variation based on press count for successful hits only
  getGrowthColorVariation() {
    // Only vary colors for successful hits (power arc active)
    if (!this.powerArcActive) {
      // Background arcs stay blue and light
      return {
        primary: `rgba(150, 180, 255, `, 
        core: `rgba(255, 255, 255, `,
        secondary: `rgba(100, 150, 255, `,
        bright: `rgba(200, 220, 255, `,
        raw: {
          primary: { r: 150, g: 180, b: 255 },
          core: { r: 255, g: 255, b: 255 },
          secondary: { r: 100, g: 150, b: 255 },
          bright: { r: 200, g: 220, b: 255 }
        }
      };
    }
    
    // Base colors for successful hits
    const baseColors = {
      primary: { r: 150, g: 180, b: 255 },   // Main arc color
      core: { r: 255, g: 255, b: 255 },      // Bright core
      secondary: { r: 100, g: 150, b: 255 }, // Secondary arc
      bright: { r: 200, g: 220, b: 255 }     // Bright secondary
    };
    
    // Vary color based on press count - each press gets different color
    const pressVariation = Math.sin(this.colorVariationSeed * 1.3) * 0.4; // Different color per press
    const comboProgress = this.arcGrowthLevel / this.maxArcGrowthLevel;
    
    // Color shifts from blue toward different spectrum based on press count
    let hueShift = pressVariation + comboProgress * 0.2; // More variation with higher combo
    
    // Apply color variations
    const varyColor = (color, shift) => {
      let r = color.r;
      let g = color.g;
      let b = color.b;
      
      // Create different color variations per press
      const pressType = this.colorVariationSeed % 6; // 6 different color patterns
      
      switch(pressType) {
        case 0: // Blue-purple shift
          r = Math.min(255, r + Math.abs(shift) * 100);
          g = Math.max(100, g - Math.abs(shift) * 50);
          break;
        case 1: // Blue-cyan shift
          r = Math.max(50, r - Math.abs(shift) * 80);
          g = Math.min(255, g + Math.abs(shift) * 60);
          break;
        case 2: // Blue-pink shift
          r = Math.min(255, r + Math.abs(shift) * 120);
          g = Math.max(120, g + Math.abs(shift) * 20);
          break;
        case 3: // Blue-green shift
          r = Math.max(80, r - Math.abs(shift) * 60);
          g = Math.min(255, g + Math.abs(shift) * 80);
          b = Math.max(180, b - Math.abs(shift) * 40);
          break;
        case 4: // Blue-yellow shift
          r = Math.min(255, r + Math.abs(shift) * 90);
          g = Math.min(255, g + Math.abs(shift) * 70);
          b = Math.max(150, b - Math.abs(shift) * 60);
          break;
        case 5: // Blue-magenta shift
          r = Math.min(255, r + Math.abs(shift) * 110);
          g = Math.max(80, g - Math.abs(shift) * 30);
          b = Math.min(255, b + Math.abs(shift) * 40);
          break;
      }
      
      return {
        r: Math.floor(r),
        g: Math.floor(g),
        b: Math.floor(b)
      };
    };
    
    const variedPrimary = varyColor(baseColors.primary, hueShift);
    const variedCore = varyColor(baseColors.core, hueShift * 0.3); // Core varies less
    const variedSecondary = varyColor(baseColors.secondary, hueShift * 0.7);
    const variedBright = varyColor(baseColors.bright, hueShift * 0.5);
    
    return {
      primary: `rgba(${variedPrimary.r}, ${variedPrimary.g}, ${variedPrimary.b}, `, 
      core: `rgba(${variedCore.r}, ${variedCore.g}, ${variedCore.b}, `,
      secondary: `rgba(${variedSecondary.r}, ${variedSecondary.g}, ${variedSecondary.b}, `,
      bright: `rgba(${variedBright.r}, ${variedBright.g}, ${variedBright.b}, `,
      // Raw values for functions that need them
      raw: {
        primary: variedPrimary,
        core: variedCore,
        secondary: variedSecondary,
        bright: variedBright
      }
    };
  }
  
  // Get beat-synchronized arc bursts - creates rhythmic timing
  getBeatArcBursts(currentTime, timeSinceBeat) {
    const bursts = [];
    
    // Vary arc count based on power state
    let totalArcs;
    if (this.powerArcActive) {
      totalArcs = 12 + Math.floor(Math.random() * 8); // 12-19 arcs during power arcs (much more dramatic)
    } else {
      totalArcs = 2 + Math.floor(Math.random() * 2); // 2-3 arcs during regular beats (slightly more visible)
    }
    
    // Create staggered timing for each arc within the beat window
    for (let i = 0; i < totalArcs; i++) {
      // Each arc has a different delay within the 200ms beat window
      const arcDelay = (i / totalArcs) * 150; // Spread arcs over first 150ms of beat
      
      // Only include arcs that should be visible at this time
      if (timeSinceBeat >= arcDelay) {
        bursts.push({
          arcDelay: arcDelay,
          arcIndex: i,
          totalBurstArcs: totalArcs
        });
      }
    }
    
    return bursts;
  }
  
  // Draw THICK main lightning bolts - powerful primary arcs
  drawThickLightningBolt(ctx, startX, startY, endX, endY, intensity, color1, color2) {
    ctx.save();
    
    // THICK MAIN BOLT - 3-5 segments for heavy power
    const segments = 3 + Math.floor(Math.random() * 3);
    const points = [{x: startX, y: startY}];
    
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = startX + (endX - startX) * t;
      const baseY = startY + (endY - startY) * t;
      
      // Less chaos for main bolts - more focused power
      const perpX = -(endY - startY) / (Math.hypot(endX - startX, endY - startY) + 0.001);
      const perpY = (endX - startX) / (Math.hypot(endX - startX, endY - startY) + 0.001);
      
      const displacement = Math.sin(t * Math.PI * 3) * 15 + Math.random() * 10 - 5;
      const x = baseX + perpX * displacement;
      const y = baseY + perpY * displacement;
      
      points.push({x, y});
    }
    
    points.push({x: endX, y: endY});
    
    // Draw thick main bolt with glow
    ctx.strokeStyle = color1;
    ctx.lineWidth = 4 + Math.random() * 3; // 4-7px thick
    ctx.globalAlpha = intensity;
    ctx.lineCap = 'butt'; // Sharp ends instead of rounded
    ctx.lineJoin = 'miter'; // Sharp corners instead of rounded
    ctx.shadowColor = color2;
    ctx.shadowBlur = 20;
    
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    
    // Draw bright core
    ctx.strokeStyle = color2;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    
    ctx.restore();
  }
  
  // Draw CHAOTIC branching lightning - wildly unpredictable
  drawChaoticLightningBolt(ctx, startX, startY, endX, endY, intensity, colorVariation = null) {
    // Use provided color variation or generate default
    const colors = colorVariation || this.getGrowthColorVariation();
    ctx.save();
    
    // VERY chaotic - 6-10 segments
    const segments = 6 + Math.floor(Math.random() * 5);
    const points = [{x: startX, y: startY}];
    
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = startX + (endX - startX) * t;
      const baseY = startY + (endY - startY) * t;
      
      // EXTREME chaos - large displacements
      const perpX = -(endY - startY) / (Math.hypot(endX - startX, endY - startY) + 0.001);
      const perpY = (endX - startX) / (Math.hypot(endX - startX, endY - startY) + 0.001);
      
      const displacement = Math.sin(t * Math.PI * 7) * 40 + Math.cos(t * Math.PI * 5) * 25 + Math.random() * 30 - 15;
      const x = baseX + perpX * displacement;
      const y = baseY + perpY * displacement;
      
      points.push({x, y});
    }
    
    points.push({x: endX, y: endY});
    
    // Draw chaotic bolt with growth-based colors
    const baseColor = colors.raw.primary;
    const color = `rgba(${baseColor.r + Math.random() * 50}, ${baseColor.g + Math.random() * 30}, ${Math.min(255, baseColor.b + Math.random() * 20)}, ${intensity})`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.globalAlpha = intensity * 0.8;
    ctx.lineCap = 'butt'; // Sharp ends instead of rounded
    ctx.shadowColor = `rgba(200, 220, 255, ${intensity})`;
    ctx.shadowBlur = 15 + Math.random() * 10;
    
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    
    // Add branches from random points
    const branchCount = 2 + Math.floor(Math.random() * 4);
    for (let b = 0; b < branchCount; b++) {
      const branchPoint = points[Math.floor(Math.random() * (points.length - 2)) + 1];
      const branchAngle = Math.random() * Math.PI * 2;
      const branchLength = 20 + Math.random() * 40;
      
      const branchBaseColor = colors.raw.secondary;
      ctx.strokeStyle = `rgba(${branchBaseColor.r + Math.random() * 50}, ${branchBaseColor.g + Math.random() * 50}, ${Math.min(255, branchBaseColor.b + Math.random() * 30)}, ${intensity * 0.6})`;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(branchPoint.x, branchPoint.y);
      
      const branchEndX = branchPoint.x + Math.cos(branchAngle) * branchLength;
      const branchEndY = branchPoint.y + Math.sin(branchAngle) * branchLength;
      
      // Add chaos to branch
      const midX = (branchPoint.x + branchEndX) / 2 + (Math.random() - 0.5) * 25;
      const midY = (branchPoint.y + branchEndY) / 2 + (Math.random() - 0.5) * 25;
      
      ctx.lineTo(midX, midY);
      ctx.lineTo(branchEndX, branchEndY);
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  // Draw MULTI-BRANCH lightning - splits into multiple paths
  drawMultiBranchLightning(ctx, startX, startY, endX, endY, intensity, colorVariation = null) {
    // Use provided color variation or generate default
    const colors = colorVariation || this.getGrowthColorVariation();
    ctx.save();
    
    // Start with main path
    const mainSegments = 4 + Math.floor(Math.random() * 3);
    const mainPoints = [{x: startX, y: startY}];
    
    for (let i = 1; i < mainSegments; i++) {
      const t = i / mainSegments;
      const baseX = startX + (endX - startX) * t;
      const baseY = startY + (endY - startY) * t;
      
      const perpX = -(endY - startY) / (Math.hypot(endX - startX, endY - startY) + 0.001);
      const perpY = (endX - startX) / (Math.hypot(endX - startX, endY - startY) + 0.001);
      
      const displacement = Math.sin(t * Math.PI * 4) * 20 + Math.random() * 15 - 7.5;
      const x = baseX + perpX * displacement;
      const y = baseY + perpY * displacement;
      
      mainPoints.push({x, y});
    }
    
    mainPoints.push({x: endX, y: endY});
    
    // Draw main bolt with growth-based colors
    const mainColor = colors.raw.primary;
    ctx.strokeStyle = `${colors.primary}${intensity})`;
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.globalAlpha = intensity;
    ctx.lineCap = 'butt'; // Sharp ends instead of rounded
    ctx.shadowColor = `${colors.bright}${intensity})`;
    ctx.shadowBlur = 15;
    
    ctx.beginPath();
    mainPoints.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    
    // Create multiple branches from main path
    const splitPoints = [1, Math.floor(mainSegments / 2), mainSegments - 2];
    
    splitPoints.forEach(splitIndex => {
      if (splitIndex >= 1 && splitIndex < mainPoints.length - 1) {
        const splitPoint = mainPoints[splitIndex];
        const branchCount = 2 + Math.floor(Math.random() * 2);
        
        for (let b = 0; b < branchCount; b++) {
          const branchAngle = Math.random() * Math.PI * 2;
          const branchLength = 15 + Math.random() * 35;
          
          const branchColor = colors.raw.secondary;
          ctx.strokeStyle = `rgba(${branchColor.r + Math.random() * 50}, ${branchColor.g + Math.random() * 50}, ${Math.min(255, branchColor.b + Math.random() * 30)}, ${intensity * 0.7})`;
          ctx.lineWidth = 1 + Math.random();
          
          ctx.beginPath();
          ctx.moveTo(splitPoint.x, splitPoint.y);
          
          // Create jagged branch
          const branchSegments = 2 + Math.floor(Math.random() * 3);
          let currentX = splitPoint.x;
          let currentY = splitPoint.y;
          
          for (let s = 1; s <= branchSegments; s++) {
            const t = s / branchSegments;
            const targetX = splitPoint.x + Math.cos(branchAngle) * branchLength * t;
            const targetY = splitPoint.y + Math.sin(branchAngle) * branchLength * t;
            
            const offsetX = (Math.random() - 0.5) * 20 * t;
            const offsetY = (Math.random() - 0.5) * 20 * t;
            
            currentX = targetX + offsetX;
            currentY = targetY + offsetY;
            
            ctx.lineTo(currentX, currentY);
          }
          
          ctx.stroke();
        }
      }
    });
    
    ctx.restore();
  }
  
  // Draw electrical particles - chaotic energy sparks
  drawElectricalParticles(ctx, x, y, intensity) {
    ctx.save();
    
    const particleCount = 3 + Math.floor(Math.random() * 5);
    
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 5 + Math.random() * 15;
      const particleX = x + Math.cos(angle) * distance;
      const particleY = y + Math.sin(angle) * distance;
      const size = 1 + Math.random() * 3;
      
      // Pulsing electrical particles
      const pulse = Math.sin(Date.now() * 0.01 + i) * 0.3 + 0.7;
      const particleIntensity = intensity * pulse;
      
      ctx.fillStyle = `rgba(${200 + Math.random() * 55}, ${220 + Math.random() * 35}, 255, ${particleIntensity})`;
      ctx.shadowColor = `rgba(255, 255, 255, ${particleIntensity})`;
      ctx.shadowBlur = size * 3;
      
      ctx.beginPath();
      ctx.arc(particleX, particleY, Math.max(0, size), 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  // Draw central electrical burst - dramatic center effect
  drawCentralElectricalBurst(ctx, x, y, intensity) {
    ctx.save();
    
    // Central bright core
    const coreSize = 5 + Math.sin(Date.now() * 0.01) * 3;
    
    ctx.fillStyle = `rgba(255, 255, 255, ${intensity})`;
    ctx.shadowColor = `rgba(200, 220, 255, ${intensity})`;
    ctx.shadowBlur = 20;
    
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, coreSize), 0, Math.PI * 2);
    ctx.fill();
    
    // Radial electrical spikes
    const spikeCount = 6 + Math.floor(Math.random() * 4);
    
    for (let i = 0; i < spikeCount; i++) {
      const angle = (Math.PI * 2 * i) / spikeCount + Math.random() * 0.3;
      const spikeLength = 10 + Math.random() * 20;
      
      ctx.strokeStyle = `rgba(${150 + Math.random() * 100}, ${180 + Math.random() * 75}, 255, ${intensity * 0.8})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * coreSize, y + Math.sin(angle) * coreSize);
      ctx.lineTo(x + Math.cos(angle) * (coreSize + spikeLength), y + Math.sin(angle) * (coreSize + spikeLength));
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  // Draw timing indicator circle (replaces timing box above progress bars)
  drawTimingCircle(ctx, x, y, radius, opacity, color) {
    // Draw outer glow
    ctx.beginPath();
    ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
    ctx.fillStyle = color + '33'; // Add transparency for glow
    ctx.fill();
    
    // Draw main circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color + Math.floor(opacity * 255).toString(16).padStart(2, '0');
    ctx.fill();
    
    // Draw inner bright core
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff' + Math.floor(opacity * 200).toString(16).padStart(2, '0');
    ctx.fill();
  }
  
  // CRITICAL: Reset hit windows every 16 beats to prevent timing drift
  resetHitWindows() {
    // Reset all timing references to current absolute time
    const currentTime = performance.now();
    
    // Re-align beat timing to exact current moment
    this.lastBeatTime = currentTime;
    this.beatStartTime = currentTime;
    this.expectedBeatTime = currentTime + this.beatInterval;
    
    // Reset progress tracking
    this.barProgress = 0;
    
    // Clear any accumulated timing offset
    this.timingOffset = 0;
    
    if (window.DEBUG_RHYTHM) console.log('🔧 HIT WINDOWS RESET: All timing aligned to absolute current time');
    if (window.DEBUG_RHYTHM) console.log(`🔧 New lastBeatTime: ${this.lastBeatTime.toFixed(1)}ms`);
    if (window.DEBUG_RHYTHM) console.log(`🔧 New expectedBeatTime: ${this.expectedBeatTime.toFixed(1)}ms`);
    if (window.DEBUG_RHYTHM) console.log('🔧 Timing drift eliminated - perfect synchronization restored');
  }
  
  // Calculate damage radius based on combo growth (weaker start, gradual growth)
  getDamageRadius() {
    // CRITICAL FIX: Always return a valid damage radius for rhythm attacks
    // Even without power arcs, rhythm hits should damage enemies
    
    if (this.arcGrowthLevel === 0) {
      return this.baseDamageRadius; // Base radius 250px for first hits
    }
    
    // Gradual growth from 250px to 350px as combo increases from 1 to 10
    const growthProgress = this.arcGrowthLevel / this.maxArcGrowthLevel;
    const radiusGrowth = (this.maxDamageRadius - this.baseDamageRadius) * growthProgress;
    return this.baseDamageRadius + radiusGrowth;
  }
  
  // Trigger power arc effect for successful rhythm hits
  triggerPowerArc(timing, attackBonus) {
    // Prevent duplicate power arcs from the same down press
    const currentTime = performance.now();
    if (currentTime - this.lastSuccessfulHitTime < 100) {
      return; // Skip if we just triggered an arc within 100ms
    }
    
    this.lastSuccessfulHitTime = currentTime;
    
    // Progressive growth based on combo, not total presses
    const oldGrowthLevel = this.arcGrowthLevel;
    this.arcGrowthLevel = Math.min(this.maxArcGrowthLevel, this.combo); // Grow with combo up to 10
    this.beatPressCount++; // Track total presses for color variation
    this.colorVariationSeed = this.beatPressCount; // Update seed for color variation
    
    // Set power arc state based on timing quality and growth
    let intensityMultiplier = 1.0;
    let duration = 400; // Base duration in milliseconds
    
    if (timing === 'perfect') {
      intensityMultiplier = 2.5; // Perfect hits get super strong arcs
      duration = 600;
    } else if (timing === 'excellent') {
      intensityMultiplier = 1.8; // Excellent hits get strong arcs
      duration = 500;
    }
    
    if (attackBonus) {
      intensityMultiplier *= 1.3; // Attack window bonus adds extra power
      duration += 100;
    }
    
    // Much weaker starting intensity that grows gradually with combo (10 levels)
    // First hits are very weak, max combo is strongest
    let growthMultiplier;
    if (this.arcGrowthLevel === 1) {
      growthMultiplier = 0.15; // First hit is extremely weak (15% power)
    } else if (this.arcGrowthLevel === 2) {
      growthMultiplier = 0.25; // Second hit is very weak (25% power)
    } else if (this.arcGrowthLevel === 3) {
      growthMultiplier = 0.4; // Third hit is weak (40% power)
    } else if (this.arcGrowthLevel === 4) {
      growthMultiplier = 0.6; // Fourth hit is below average (60% power)
    } else if (this.arcGrowthLevel === 5) {
      growthMultiplier = 0.8; // Fifth hit is slightly below average (80% power)
    } else if (this.arcGrowthLevel === 6) {
      growthMultiplier = 1.0; // Sixth hit is average power (100%)
    } else if (this.arcGrowthLevel === 7) {
      growthMultiplier = 1.3; // Seventh hit is above average (130%)
    } else if (this.arcGrowthLevel === 8) {
      growthMultiplier = 1.6; // Eighth hit is strong (160%)
    } else if (this.arcGrowthLevel === 9) {
      growthMultiplier = 1.9; // Ninth hit is very strong (190%)
    } else {
      growthMultiplier = 2.2; // Tenth hit is maximum power (220%)
    }
    
    intensityMultiplier *= growthMultiplier;
    
    // Extend duration based on growth level (longer duration at higher combos)
    duration += this.arcGrowthLevel * 25; // Add 25ms per combo level
    
    this.powerArcActive = true;
    this.powerArcIntensity = Math.min(4.0, intensityMultiplier); // Cap at 4x intensity
    this.powerArcDuration = duration;
    
    const currentRadius = this.getDamageRadius();
    if (window.DEBUG_RHYTHM) console.log(`⚡ POWER ARC TRIGGERED: ${timing} (Combo ${this.arcGrowthLevel}/${this.maxArcGrowthLevel}, ${growthMultiplier.toFixed(1)}x power, ${currentRadius.toFixed(0)}px radius, ${intensityMultiplier.toFixed(1)}x intensity for ${duration}ms)`);
    
    if (oldGrowthLevel !== this.arcGrowthLevel) {
      if (window.DEBUG_RHYTHM) console.log(`🌟 ARC GROWTH: Combo ${this.arcGrowthLevel} - damage radius: ${currentRadius.toFixed(0)}px`);
    }
  }
  
  // Update power arc state
  updatePowerArcs(deltaTime) {
    if (this.powerArcActive) {
      this.powerArcDuration -= deltaTime;
      
      if (this.powerArcDuration <= 0) {
        this.powerArcActive = false;
        this.powerArcIntensity = 0;
        if (window.DEBUG_RHYTHM) console.log('⚡ Power arc ended');
      }
    }
  }
  
  // Simple beat counter reset for seamless loops
  resetBeatCounter() {
    if (window.DEBUG_RHYTHM) console.log('🔄 RHYTHM: Beat counter reset for seamless loop');
    
    // Reset beat counters to start fresh
    this.currentBar = 0;
    this.currentBeat = 0;
    this.globalBeatCount = 0;
    this.barProgress = 0;
    this.phraseProgress = 0;
    
    // Reset tempo establishment to start fresh
    this.tempoEstablished = false;
    this.currentTempoBeat = 0;
    this.trackStarted = false;
    this.lastBeatTime = 0;
    this.beatStartTime = 0;
    
    // Clear sync timing to prevent old beats
    this.lastSyncTime = 0;
    
    // Keep running state - don't stop background tracking
    if (window.DEBUG_RHYTHM) console.log('🔄 RHYTHM: Beat counter reset complete - continuing background tracking');
  }
  
  // Jammer handling removed - jammers are now regular enemies handled by EnemyManager
  
  // ========================================
  // LOOP RESTART SYSTEM
  // ========================================
  
  // Prepare rhythm system for upcoming loop restart
  prepareForLoopRestart() {
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: Preparing for loop restart');
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: Current state before restart - tempoEstablished:', this.tempoEstablished, 'currentTempoBeat:', this.currentTempoBeat);
    
    // Switch to loop restart mode (show beat counter instead of progress bars)
    this.loopRestartMode = true;
    
    // Don't reset anything yet - just prepare for the restart
    // Keep current tempo establishment state so we can resume smoothly
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: Loop restart mode activated - progress bars hidden, beat counter will show during restart');
  }
  
  // Restart rhythm system for new loop (called exactly when music restarts)
  restartForLoop() {
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: Restarting for new loop');
    
    // Increment loop counter
    this.loopRestartCount++;
    if (window.DEBUG_RHYTHM) console.log(`🎵 RHYTHM: Loop #${this.loopRestartCount} starting`);
    
    // CRITICAL: Reset ALL timing state to start fresh BEFORE music restart
    // This ensures we're ready for the first audio beat
    this.trackStarted = false; // Wait for audio to actually start
    this.trackStartTime = 0;
    this.lastBeatTime = 0;
    this.beatStartTime = 0;
    this.expectedBeatTime = 0;
    
    // CRITICAL: Reset progress and beat counters to CLEAN start state
    this.currentBar = 0;
    this.currentBeat = 0;
    this.globalBeatCount = 0;
    this.barProgress = 0;
    this.phraseProgress = 0;
    
    // CRITICAL: Reset tempo establishment to start fresh
    this.tempoEstablishmentBeats = (window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive() && window.BARCODE.MusicProfiles.getActive().legacyCompatibility) ? window.BARCODE.MusicProfiles.getActive().legacyCompatibility.establishmentBeatCount : this.tempoEstablishmentBeats;
    this.currentTempoBeat = 0; // Start at 0, will increment to 1 on first beat
    this.tempoEstablished = false;
    
    // CRITICAL: Clear any pending sync timing to prevent old beats
    this.lastSyncTime = 0;
    
    // CRITICAL: Stay in loop restart mode until first beat actually arrives
    // This prevents showing slow/frozen progress during transition
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: All timing reset - waiting for first beat of new loop');
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: Staying in loop restart mode until first audio beat arrives');
    
    // CRITICAL FIX: Don't exit loop restart mode immediately
    // Wait for the first actual audio beat to transition out
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: Loop restart mode active - will exit on first beat');
    
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: Loop restart complete - ready for fresh tempo establishment');
  }
  
  resetForFreshRuntimeRestart(profileId) {
    if (window.DEBUG_RHYTHM) console.log('🎵 RHYTHM: Fresh lifecycle restart - resetting background rhythm to new transport generation');
    this.running = true;
    this.active = false;
    this.loopRestartMode = false;
    this.applySelectedProfile(profileId);
    this.restartForLoop();
  }

  getDiagnostics() {
    const transport = window.BARCODE && window.BARCODE.MusicTransport && typeof window.BARCODE.MusicTransport.getDiagnostics === 'function'
      ? window.BARCODE.MusicTransport.getDiagnostics()
      : null;
    return { running: !!this.running, active: !!this.active, trackStarted: !!this.trackStarted, currentTempoBeat: this.currentTempoBeat, tempoEstablished: !!this.tempoEstablished, transportGeneration: transport && transport.generation, profileId: transport && transport.profileId };
  }

  // Getters for game state
  isActive() { return this.active; }
  isRunning() { return this.running; }
  getCombo() { return this.combo; }
  getMaxCombo() { return this.maxCombo; }
  isPowerArcActive() { return this.powerArcActive; }
  getPowerArcIntensity() { return this.powerArcIntensity; }
  isLoopRestartMode() { return this.loopRestartMode; } // New getter for UI state
  getLoopRestartCount() { return this.loopRestartCount; } // New getter for loop counter
};

// Create global rhythm system instance
function createRhythmSystem() {
  if (window.randomRange && window.clamp) {
    window.rhythmSystem = new window.RhythmSystem();
    if (window.DEBUG_RHYTHM) console.log('Enhanced Rhythm System created with 4-bar progress visualization');
  } else {
    console.warn('Rhythm system dependencies not ready, retrying...');
    setTimeout(createRhythmSystem, 100);
  }
}

// Initialize when dependencies are ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createRhythmSystem);
} else {
  createRhythmSystem();
}
