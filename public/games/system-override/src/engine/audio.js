// Audio system for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/audio.js',
  exports: ['AudioSystem', 'audioSystem'],
  dependencies: ['BARCODE.MusicProfiles', 'BARCODE.MusicTransport']
});

const ADAPTIVE_STEM_GAIN_RAMP_SEC = 0.18;

window.AudioSystem = class AudioSystem {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.rhythmGain = null;
    this.sfxGain = null;
    this.initialized = false;
    
    // Title screen music retry tracking
    this.titleMusicRetryCount = 0;
    this.maxTitleMusicRetries = 5;
    
    // Audio buffers
    this.sounds = {};
    
    // Music system - simultaneous layers
    this.musicTracks = {};
    this.currentMusicTrack = null;
    this.musicGain = null;
    this.musicContext = { state: 'exploration' }; // exploration, combat, rhythm, tutorial
    this.crossfadeInterval = null;
    this.layersStarted = false; // Track if all layers are playing simultaneously
    
    // Music loop system
    this.loopStartTime = 0; // When current loop started
    this.loopDuration = 60; // Default 60 second loop duration (will be updated from actual track lengths)
    this.loopCheckInterval = null;
    this.isLooping = false; // Track if we're currently restarting the loop
    
    // Rhythm beat generation
    this.beatScheduler = null;
    this.nextBeatTime = 0;
    this.beatInterval = 0;
    this.currentBeat = 0;
    this.beatSyncActive = false;
    this.syncBeatCount = 0; // Track sync calls for logging
    this.firstBeatTime = null; // Fixed reference point for precise timing
    
    // Audio visualization
    this.analyser = null;
    this.dataArray = null;
    this.visualizationData = { bass: 0, mid: 0, high: 0 };
    
    // Enemy proximity sound system
    this.enemySounds = {};
    this.enemySoundGainNodes = {};
    
    // Cutscene music system
    this.cutsceneMusic = null;
    this.cutsceneSource = null;
    this.cutsceneGain = null;
    this.assetLoadPromises = {};
    this.assetLoadDiagnostics = {};
    this.layerLogState = { enemyCount: null, activeLayers: '', gains: '' };
    this.musicStartState = { ok: false, reason: 'not-started' };
    this.runtimeAudioGeneration = 0;
    this.runtimeTimeouts = new Set();
    this.activeProfilePreparationInFlight = null;
    this.activeProfilePreparationKey = null;
  }

  scheduleRuntimeTimeout(callback, delay) {
    const generation = this.runtimeAudioGeneration;
    const handle = setTimeout(() => {
      this.runtimeTimeouts.delete(handle);
      if (generation === this.runtimeAudioGeneration) callback();
    }, Math.max(0, delay));
    this.runtimeTimeouts.add(handle);
    return handle;
  }

  clearRuntimeTimeouts() {
    this.runtimeTimeouts.forEach(handle => clearTimeout(handle));
    this.runtimeTimeouts.clear();
    if (this.beatScheduler) {
      clearTimeout(this.beatScheduler);
      this.beatScheduler = null;
    }
  }

  // Presentation/input clock only. Sources and AudioParam events must continue
  // to use context.currentTime: an audible timestamp is already in that domain,
  // but names the sample reaching the device rather than the next rendered block.
  getOutputAudioTime(audioTimeSec = this.context?.currentTime) {
    const ctx = this.context, rawNow = ctx?.currentTime;
    if (!Number.isFinite(rawNow)) return Number.isFinite(audioTimeSec) ? audioTimeSec : 0;
    const age = Number.isFinite(audioTimeSec) ? Math.max(0, rawNow - audioTimeSec) : 0;
    const latency = value => Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
    const estimatedDelay = Math.min(1, latency(ctx.baseLatency) + latency(ctx.outputLatency));
    const performanceNow = window.performance?.now?.();
    const previous = this.outputClockSample;
    let heardNow = Math.max(0, rawNow - estimatedDelay);
    if (ctx.state && ctx.state !== 'running') {
      // Do not extrapolate a pre-suspension timestamp through wall-clock time.
      if (previous?.context === ctx && previous.rawNow <= rawNow)
        heardNow = Math.min(rawNow, previous.heardNow + rawNow - previous.rawNow);
    } else if (Number.isFinite(performanceNow) && typeof ctx.getOutputTimestamp === 'function') {
      try {
        const stamp = ctx.getOutputTimestamp();
        const elapsedMs = performanceNow - stamp?.performanceTime;
        const mapped = stamp?.contextTime + elapsedMs / 1000;
        // Zero timestamps occur before the first rendered block. Reject stale,
        // suspended or implausible samples rather than moving the road by seconds.
        const afterResume = previous?.context !== ctx || previous.state === 'running' ||
          stamp?.performanceTime >= previous.performanceNow;
        if (Number.isFinite(stamp?.contextTime) && stamp.contextTime > 0 &&
            Number.isFinite(stamp.performanceTime) && stamp.performanceTime > 0 &&
            elapsedMs >= -50 && elapsedMs <= 1000 && afterResume &&
            stamp.contextTime <= rawNow + .025 && Number.isFinite(mapped) &&
            mapped >= 0 && mapped <= rawNow + .025 && rawNow - mapped <= 1) {
          heardNow = Math.min(rawNow, mapped);
        }
      } catch (_) { /* Partial implementations retain the bounded latency estimate. */ }
    }
    this.outputClockSample = { context: ctx, state: ctx.state || 'running', rawNow,
      heardNow, performanceNow };
    // Preserve an older event's age. Never clamp it to a later queried press;
    // presentation can hold its own previous beat if a device-delay change regresses.
    return Math.max(0, heardNow - age);
  }

  rampAdaptiveStemGain(track, targetVolume, durationSec = ADAPTIVE_STEM_GAIN_RAMP_SEC) {
    const gainParam = track && track.gain && track.gain.gain;
    if (!gainParam) return false;

    const target = Math.max(0, Number.isFinite(targetVolume) ? targetVolume : 0);
    const now = this.context && Number.isFinite(this.context.currentTime) ? this.context.currentTime : null;
    const duration = Math.max(0, Number.isFinite(durationSec) ? durationSec : ADAPTIVE_STEM_GAIN_RAMP_SEC);

    try {
      const canHold = now !== null && typeof gainParam.cancelAndHoldAtTime === 'function';
      const canCancelAndAnchor = now !== null &&
        typeof gainParam.cancelScheduledValues === 'function' &&
        typeof gainParam.setValueAtTime === 'function';
      const canRamp = now !== null && typeof gainParam.linearRampToValueAtTime === 'function';

      if (canRamp && (canHold || canCancelAndAnchor)) {
        if (canHold) {
          gainParam.cancelAndHoldAtTime(now);
        } else {
          const currentValue = Number.isFinite(gainParam.value)
            ? gainParam.value
            : (Number.isFinite(track.volume) ? track.volume : target);
          gainParam.cancelScheduledValues(now);
          gainParam.setValueAtTime(currentValue, now);
        }
        gainParam.linearRampToValueAtTime(target, now + duration);
      } else {
        gainParam.value = target;
      }
    } catch (error) {
      // Older or partial Web Audio implementations may expose scheduling methods
      // without supporting them reliably. A direct assignment keeps music usable.
      try { gainParam.value = target; } catch (fallbackError) {}
    }

    // This records the requested mix state. The AudioParam itself owns the short
    // transition, so synchronized sources are never stopped or recreated.
    track.volume = target;
    return true;
  }

  beginRuntimeAudioGeneration() {
    this.runtimeAudioGeneration++;
    window.BARCODE?.musicDirector?.reset();
    this.resetRoadStumble();
    this.stopCombatCues();
    this.clearRuntimeTimeouts();
    return this.runtimeAudioGeneration;
  }

  async init() {
    // Prevent duplicate initialization
    if (this.initialized) {
      console.log('Audio system already initialized, skipping duplicate init');
      return;
    }
    
    try {
      // Create audio context
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      
      if (!window.AudioContext && !window.webkitAudioContext) {
        console.log('Web Audio API not supported in this browser');
        this.initialized = false;
        return;
      }
      
      this.context = new AudioContext();
      console.log('Audio context created:', this.context.state);
      console.log('Audio context sample rate:', this.context.sampleRate);
      
      // Create gain nodes
      this.masterGain = this.context.createGain();
      this.rhythmGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.musicVolumeGain = this.context.createGain();
      
      // Create analyser for visualization
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      
      // Resume audio context if suspended (browser policy)
      if (this.context.state === 'suspended') {
        console.log('Audio context suspended, attempting resume...');
        try {
          const resumeResult = await this.context.resume();
          console.log('Audio context resume result:', resumeResult);
        } catch (resumeError) {
          // Handle specific permission errors gracefully
          if (resumeError.name === 'NotAllowedError' || resumeError.message.includes('permission')) {
            console.log('AudioContext permission denied - audio will start on user interaction');
          } else {
            console.warn('Audio context resume failed:', resumeError?.message || resumeError);
          }
          // Continue with suspended context - some browsers require user interaction
        }
      }
      
      // Connect nodes
      this.masterGain.connect(this.context.destination);
      this.rhythmGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.musicVolumeGain);
      this.musicVolumeGain.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      
      // Set initial music volume
      this.musicGain.gain.value = 0.8; // Higher volume for audible background music
      window.BARCODE?.Preferences?.apply(this);
      
      // Generate synthetic sounds
      await this.generateSounds();
      
      // Load external sound effects
      await this.loadSoundEffects();
      
      // Load rhythm success sounds
      await this.loadRhythmSuccessSounds();
      
      // Load player damage sound
      await this.loadPlayerDamageSound();
      
      // Load enemy defeat sounds
      await this.loadEnemyDefeatSounds();
      
      // Load enemy sounds
      await this.loadEnemySounds();
      
      // Debug whoosh sound loading
      console.log('🚀 Whoosh sounds status after loading:', {
        whoosh1: !!this.sounds['whoosh1'],
        whoosh2: !!this.sounds['whoosh2'],
        availableSounds: Object.keys(this.sounds).filter(key => key.includes('whoosh'))
      });
      
      // Load title screen music
      console.log('🎵 Loading title screen music...');
      await this.loadTitleScreenMusic();
      console.log('🎵 Title screen music load completed, status:', !!this.titleScreenMusic, 'isLoaded:', this.titleScreenMusic?.isLoaded);
      
      // Load cutscene music
      await this.loadCutsceneMusic();
      
      // Load music tracks
      const failures = await this.loadMusicTracks();
      if (failures?.length) console.warn('[audio-startup] Source load failures:', failures);
      
      // CRITICAL: Force create ALL fallback tracks first, then start layers
      console.log('Creating fallback tracks for all missing audio...');
      const activeProfile = window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive();
      const requiredTracks = activeProfile ? activeProfile.arrangement.sources.map(source => source.sourceId) : [];
      
      for (const trackName of requiredTracks) {
        if (!this.musicTracks[trackName] && activeProfile.profileId !== 'level-02.proof') {
          console.log(`Creating fallback for ${trackName}`);
          try {
            const fallback = this.createFallbackMusic(trackName);
            if (fallback) {
              this.musicTracks[trackName] = fallback;
              console.log(`✓ Created fallback for ${trackName}`);
            } else {
              console.error(`Failed to create fallback for ${trackName}`);
            }
          } catch (error) {
            console.error(`Error creating fallback for ${trackName}:`, error?.message || error?.toString() || 'Unknown error');
          }
        }
      }
      
      // NOW start all tracks after ensuring fallbacks exist
      console.log('All tracks available, starting layers...');
      console.log('Available tracks:', Object.keys(this.musicTracks));
      
      // CRITICAL: Do NOT start music during initialization - wait for game start after cutscenes
      const primarySource = activeProfile && activeProfile.arrangement.sources[0];
      if (primarySource && this.musicTracks[primarySource.sourceId]) {
        console.log('Music tracks loaded - waiting for game start after cutscenes');
        
        // CRITICAL: Do NOT start rhythm system yet - wait for game start
        setTimeout(() => {
          console.log('🎵 Music system waiting - will start after cutscenes complete');
          console.log('🎵 Rhythm system also waiting - will start simultaneously with music');
        }, 200);
      } else if (activeProfile) {
        console.error('[audio-startup] Missing required source after remote load/fallback creation:', primarySource ? primarySource.sourceId : 'no selected profile');
      } else {
        console.log('[audio-startup] Gameplay music profile not selected during title-only audio initialization; gameplay preparation is deferred.');
      }
      
      this.initialized = true;
      console.log('Audio system initialized');
      
    } catch (error) {
        console.log('Audio initialization failed:', error);
      this.initialized = false;
    }
  }

  // Generate synthetic sounds using Web Audio API oscillators
  async generateSounds() {
    // Kick drum (bass hit)
    this.sounds.kick = this.createKickSound();
    
    // Snare drum (sharp hit)
    this.sounds.snare = this.createSnareSound();
    
    // Hi-hat (short metallic)
    this.sounds.hihat = this.createHihatSound();
    
    // Synth hit (for rhythm attacks)
    this.sounds.synthHit = this.createSynthHitSound();
    
    // Success sound (for perfect timing)
    this.sounds.success = this.createSuccessSound();
    
    // Terminal sounds for hacking
    this.sounds.terminalBeep = this.createTerminalBeepSound();
    this.sounds.terminalBuzz = this.createTerminalBuzzSound();
  }

  createKickSound() {
    const duration = 0.15;
    return () => {
      const now = this.context.currentTime;
      
      // Main kick oscillator
      const kick = this.context.createOscillator();
      kick.frequency.setValueAtTime(150, now);
      kick.frequency.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Kick envelope
      const kickEnvelope = this.context.createGain();
      kickEnvelope.gain.setValueAtTime(0.8, now);
      kickEnvelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Connect and play
      kick.connect(kickEnvelope);
      kickEnvelope.connect(this.rhythmGain);
      kick.start(now);
      kick.stop(now + duration);
      
      return now + duration;
    };
  }

  createSnareSound() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.1;
      
      // Noise component
      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }
      
      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      
      // Noise filter
      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 3000;
      
      // Noise envelope
      const noiseEnvelope = this.context.createGain();
      noiseEnvelope.gain.setValueAtTime(0.5, now);
      noiseEnvelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Tone component
      const tone = this.context.createOscillator();
      tone.frequency.value = 200;
      
      // Tone envelope
      const toneEnvelope = this.context.createGain();
      toneEnvelope.gain.setValueAtTime(0.3, now);
      toneEnvelope.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.5);
      
      // Connect and play
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseEnvelope);
      noiseEnvelope.connect(this.rhythmGain);
      
      tone.connect(toneEnvelope);
      toneEnvelope.connect(this.rhythmGain);
      
      noise.start(now);
      tone.start(now);
      noise.stop(now + duration);
      tone.stop(now + duration);
      
      return now + duration;
    };
  }

  createHihatSound() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.05;
      
      // Noise buffer
      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }
      
      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      
      // High-pass filter for metallic sound
      const filter = this.context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 8000;
      
      // Envelope
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(0.2, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Connect and play
      noise.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.rhythmGain);
      
      noise.start(now);
      noise.stop(now + duration);
      
      return now + duration;
    };
  }

  createSynthHitSound() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.2;
      
      // Create chord for richer sound
      const frequencies = [440, 554.37, 659.25]; // A major chord
      
      frequencies.forEach(freq => {
        const osc = this.context.createOscillator();
        osc.frequency.value = freq;
        osc.type = 'sawtooth';
        
        const envelope = this.context.createGain();
        envelope.gain.setValueAtTime(0.1, now);
        envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
        
        // Filter for synthetic sound
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        filter.frequency.exponentialRampToValueAtTime(200, now + duration);
        
        osc.connect(filter);
        filter.connect(envelope);
        envelope.connect(this.sfxGain);
        
        osc.start(now);
        osc.stop(now + duration);
      });
      
      return now + duration;
    };
  }

  createSuccessSound() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.3;
      
      // Rising arpeggio for success
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      
      notes.forEach((freq, i) => {
        const osc = this.context.createOscillator();
        osc.frequency.value = freq;
        osc.type = 'sine';
        
        const envelope = this.context.createGain();
        const startTime = now + (i * 0.05);
        envelope.gain.setValueAtTime(0, startTime);
        envelope.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
        envelope.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
        
        osc.connect(envelope);
        envelope.connect(this.sfxGain);
        
        osc.start(startTime);
        osc.stop(startTime + 0.2);
      });
      
      return now + duration;
    };
  }

  // Terminal beep sound for successful hacks
  createTerminalBeepSound() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.15;
      
      // Main beep oscillator - clean sine wave
      const beep = this.context.createOscillator();
      beep.frequency.value = 1000; // 1kHz - classic terminal beep frequency
      beep.type = 'sine';
      
      // Beep envelope
      const beepEnvelope = this.context.createGain();
      beepEnvelope.gain.setValueAtTime(0.3, now);
      beepEnvelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Add a quick chirp at the start for character
      const chirp = this.context.createOscillator();
      chirp.frequency.setValueAtTime(800, now);
      chirp.frequency.exponentialRampToValueAtTime(1200, now + 0.02);
      chirp.type = 'sine';
      
      const chirpEnvelope = this.context.createGain();
      chirpEnvelope.gain.setValueAtTime(0.2, now);
      chirpEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.02);
      
      // Connect and play
      beep.connect(beepEnvelope);
      beepEnvelope.connect(this.sfxGain);
      
      chirp.connect(chirpEnvelope);
      chirpEnvelope.connect(this.sfxGain);
      
      beep.start(now);
      chirp.start(now);
      beep.stop(now + duration);
      chirp.stop(now + 0.02);
      
      return now + duration;
    };
  }

  // Terminal buzz sound for failed hacks
  createTerminalBuzzSound() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.3;
      
      // Create low frequency buzz
      const buzz = this.context.createOscillator();
      buzz.frequency.value = 120; // Low frequency for buzz
      buzz.type = 'sawtooth';
      
      // Buzz envelope - quick attack, longer decay
      const buzzEnvelope = this.context.createGain();
      buzzEnvelope.gain.setValueAtTime(0.2, now);
      buzzEnvelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Add some noise for harshness
      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() - 0.5) * 0.3;
      }
      
      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      
      // Low-pass filter for muffled sound
      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 500;
      
      const noiseEnvelope = this.context.createGain();
      noiseEnvelope.gain.setValueAtTime(0.15, now);
      noiseEnvelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Connect and play
      buzz.connect(buzzEnvelope);
      buzzEnvelope.connect(this.sfxGain);
      
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseEnvelope);
      noiseEnvelope.connect(this.sfxGain);
      
      buzz.start(now);
      noise.start(now);
      buzz.stop(now + duration);
      noise.stop(now + duration);
      
      return now + duration;
    };
  }

  // Play a sound effect
  // Short musical effects share the existing context and SFX bus. Voice
  // count and per-cue cadence are bounded even during multi-target attacks.
  playCombatCue(kind, options = {}) {
    if (options.road === true || /^road[A-Z]/.test(kind)) return this.playRoadCue(kind, options);
    // The graph can be ready while unrelated remote music assets still load.
    // Check the actual playback boundary, not the all-assets init flag.
    if (!this.context || !this.sfxGain || this.context.state !== 'running') {
      this.lastSFXCue = { kind, reason: this.context?.state || 'not-ready' };
      return false;
    }
    const profiles = {
      warning: [620, 880, 0.32, 'square'], enter: [220, 440, 0.18, 'triangle'], exit: [330, 165, 0.10, 'triangle'],
      jump: [180, 520, 0.12, 'triangle'], land: [130, 55, 0.09, 'triangle'],
      stomp: [240, 48, 0.18, 'square'], hit: [360, 120, 0.10, 'triangle'],
      perfect: [660, 990, 0.14, 'triangle'], guard: [780, 260, 0.08, 'square'],
      empty: [240, 200, 0.07, 'sine'], miss: [150, 90, 0.10, 'triangle'],
      damage: [170, 45, 0.23, 'sawtooth'], lift: [330, 660, 0.20, 'triangle'],
      pickup: [660, 1320, 0.25, 'sine'], combo5: [440, 880, 0.24, 'triangle'],
      roadCount: [520, 360, 0.045, 'triangle'], roadReady: [780, 520, 0.065, 'triangle'],
      roadPerfect: [880, 1320, 0.22, 'triangle'], roadGood: [660, 990, 0.18, 'triangle'],
      roadTurboReady: [440, 880, 0.24, 'sine'],
      cutline: [380, 1050, 0.28, 'triangle'],
      combo10: [660, 1320, 0.32, 'triangle'], defeat: [260, 65, 0.20, 'square'],
      wave: [180, 820, 0.18, 'sawtooth'], discharge: [1240, 180, 0.16, 'square'],
      metal: [190, 38, 0.16, 'square'], tear: [860, 70, 0.11, 'sawtooth'], data: [940, 320, 0.08, 'triangle'],
      hijack: [240, 960, 0.22, 'square'], hijackRelease: [660, 220, 0.18, 'triangle'],
      restore: [330, 990, 0.28, 'sine'], inspect: [520, 780, 0.12, 'triangle']
    };
    const profile = profiles[kind];
    if (!profile) return false;
    this.combatVoices ||= new Set(); this.combatCueTimes ||= {};
    const clock = this.context.currentTime;
    // Road count-ins and early accepted taps can land on the source clock
    // exactly. The short horizon keeps these in the existing bounded voices.
    const now = Number.isFinite(options.audioTimeSec) ?
      Math.max(clock,Math.min(clock+.4,options.audioTimeSec)) : clock;
    if (now - (this.combatCueTimes[kind] ?? -Infinity) < 0.035) return false;
    this.combatCueTimes[kind] = now;
    const critical = kind === 'warning' || kind === 'damage';
    if (critical) this.criticalCueUntil = now + 0.4;
    const tones = kind === 'roadPerfect' ? [1,1.25,1.5] :
      kind === 'combo5' || kind === 'combo10' || kind === 'pickup' ||
      kind === 'cutline' || kind === 'roadGood' || kind === 'roadTurboReady' ? [1, 1.5] : [1];
    const materialPitch = options.material === 'virus' ? 1.8 : options.material === 'firewall' ? 0.65 : 1;
    for (const tone of tones) {
      while (this.combatVoices.size >= 12) {
        const expendable = [...this.combatVoices].find(voice => !voice.critical);
        if (!expendable && !critical) return false;
        (expendable || this.combatVoices.values().next().value).dispose();
      }
      const osc = this.context.createOscillator(), gain = this.context.createGain();
      const duration = profile[2];
      const voice = { critical, dispose: () => {
        if (!this.combatVoices.delete(voice)) return;
        osc.onended = null;
        try { osc.stop(); } catch (error) {}
        osc.disconnect(); gain.disconnect();
      } };
      this.combatVoices.add(voice); osc.onended = voice.dispose;
      osc.type = profile[3];
      osc.frequency.setValueAtTime(profile[0] * tone * materialPitch, now);
      osc.frequency.exponentialRampToValueAtTime(profile[1] * tone * materialPitch, now + duration);
      gain.gain.setValueAtTime(0, now);
      const peak = (kind === 'roadCount' ? .035 : kind === 'roadReady' ? .065 :
        kind === 'empty' ? 0.06 : 0.18) / tones.length;
      gain.gain.linearRampToValueAtTime(peak, now + 0.006);
      gain.gain.setValueAtTime(peak, now + duration * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain); gain.connect(this.sfxGain);
      osc.start(now); osc.stop(now + duration + 0.01);
    }
    this.lastSFXCue = { kind, reason: 'scheduled', audioTimeSec: now };
    return true;
  }

  // Cache Road has its own measured D/F song vocabulary. One cached 32 kHz
  // PCM voice contains each complete layered effect: pulse/triangle channels,
  // FM metal and clocked 15-bit LFSR noise. No downloaded samples, timers or
  // changes to the five music stems, music clock or Level 1 sound palette.
  roadCueSettings(kind, options = {}) {
    const aliases = { lift:'shift', pickup:'lock', data:'echo', cutline:'push',
      land:'brace', guard:'brace', damage:'crash', warning:'warning', restore:'refill',
      hit:'brace', perfect:'perfect', empty:'empty', miss:'miss', enter:'lock', cutPass:'push' };
    let name = String(kind).replace(/^road/, '');
    name = name.charAt(0).toLowerCase() + name.slice(1);
    name = aliases[name] || name;
    // duration, playback gain, priority, minimum repeat interval. Critical
    // count/arrival/result voices cannot be evicted by decorative receipts.
    const table = {
      count:[.11,.37,3,.045], ready:[.19,.52,3,.08], perfect:[.43,.58,3,.06],
      good:[.28,.48,3,.06], crash:[.46,.73,4,.16], brace:[.25,.43,2,.1],
      nearMiss:[.21,.35,1,.09], shift:[.32,.35,1,.14], lock:[.30,.35,1,.09],
      turbo:[.61,.53,2,.3], turboReady:[.43,.41,2,.3], echo:[.62,.43,2,.24],
      push:[.29,.43,2,.12], refill:[.58,.42,2,.2], warning:[.33,.39,3,.3],
      full:[.69,.49,2,.5], queued:[.085,.18,1,.12],
      miss:[.20,.37,2,.12], empty:[.12,.24,1,.12]
    };
    const profile = table[name]; if (!profile) return null;
    const time = Number.isFinite(options.trackTimeSec) ? options.trackTimeSec :
      Number.isFinite(options.beatFloat) ? options.beatFloat * 60 / 128 :
      Number.isFinite(options.bar) ? options.bar * 1.875 : 0;
    const bar = Math.max(0, Math.floor(time / 1.875 + 1e-7));
    const fBass = [21,25,45,49,69,73,93,97].includes(bar);
    const countBeat = Math.max(2, Math.min(4, Math.round(options.countBeat || 2)));
    const action = Math.max(0, Math.min(3, Math.round(options.action || 0)));
    return { name, duration:profile[0], gain:profile[1], priority:profile[2],
      cadence:profile[3], rootHz:fBass ? 698.456463 : 587.329536,
      noteRoot:fBass ? 'F' : 'D', bar, countBeat, action };
  }

  createRoadCueBuffer(settings) {
    const ctx = this.context, rate = 32000;
    const { name, duration, rootHz:root, countBeat, action } = settings;
    const buffer = ctx.createBuffer(1, Math.ceil(rate * duration), rate);
    const out = buffer.getChannelData(0), step = 60 / 128 / 8, fifth = Math.pow(2,7/12);
    const pulse = (phase, dt, duty = .25) => {
      const p = phase - Math.floor(phase);
      const blep = q => q < dt ? (q /= dt, q + q - q*q - 1) :
        q > 1-dt ? (q = (q-1)/dt, q*q + q + q + 1) : 0;
      const edge = (p-duty+1) % 1;
      return ((p < duty ? 1 : -1) + blep(p) - blep(edge) - (2*duty-1)) * .65;
    };
    const tones = [];
    const note = (at, hz, length, gain, wave = 'pulse', duty = .25, endHz = hz) =>
      tones.push({ at, hz, length, gain, wave, duty, endHz, phase:0 });
    const timbres = ['pulse','triangle','fm','pulse'];
    const lead = timbres[action], duty = action === 3 ? .125 : .25;
    if (name === 'count') {
      const hz = root * [0,0,.5,fifth*.5,1][countBeat];
      note(0,hz,.085,.35,'pulse',.125);
      note(0,hz*.5,.07,.2,'triangle');
    } else if (name === 'ready') {
      note(0,root*.25,.14,.32,'triangle',.5,root*.125);
      note(0,root,.13,.34,'pulse',.25); note(.018,root*2,.13,.14,'fm');
    } else if (name === 'perfect' || name === 'good') {
      const perfect = name === 'perfect';
      note(0,root*.5,.24,.24,'triangle');
      note(0,root,.20,.29,lead,duty); note(.018,root*fifth,.22,.18,'fm');
      note(step,root*2,perfect ? .24 : .16,perfect ? .27 : .12,lead,duty);
      if (perfect) { note(step*2,root*fifth*2,.22,.19,'pulse',.125);
        note(step*3,root*4,.23,.15,'fm'); }
    } else if (name === 'crash') {
      note(0,137,.30,.51,'sine',.5,32);
      note(.008,310,.22,.25,'metal',.5,78);
      note(.065,173,.29,.20,'metal',.5,53);
    } else if (name === 'brace') {
      note(0,root*.25,.16,.28,'triangle',.5,root*.125);
      note(0,root*fifth*.5,.20,.25,'fm'); note(.045,root*fifth,.18,.14,'pulse',.125);
    } else if (name === 'nearMiss' || name === 'push') {
      note(0,root*.5,.19,.22,'pulse',.125,root*2);
      if(name === 'push') note(.03,root*.25,.23,.27,'triangle',.5,root*fifth*.5);
    } else if (name === 'shift') {
      note(0,root*.25,.09,.20,'pulse',.25,root*.10);
      note(.095,root*.125,.21,.28,'pulse',.25,root*.5);
      note(.098,root*.25,.17,.13,'triangle',.5,root);
    } else if (name === 'lock' || name === 'turboReady' || name === 'refill' || name === 'full') {
      const long = name !== 'lock';
      [1,fifth,2,...(long ? [fifth*2,4] : [])].forEach((ratio,i) =>
        note(i*step,root*ratio,long ? .28 : .18,.25/(1+i*.15),i%2?'fm':'pulse',.25));
      note(0,root*.5,.24,.17,'triangle');
      if(name==='full'){note(.30,root,.37,.25,'triangle');note(.34,root*2,.33,.19,'fm');
        note(.38,root*fifth*2,.29,.14,'fm');}
    } else if (name === 'turbo') {
      note(0,root*.125,.44,.31,'pulse',.125,root*fifth);
      note(.06,root*.25,.43,.22,'triangle',.5,root*2);
      note(.27,root*2,.28,.18,'fm'); note(.34,root*fifth*2,.26,.14,'fm');
    } else if (name === 'echo') {
      [1,2,fifth,fifth*2,2].forEach((ratio,i) => note(i*step*1.15,root*ratio,.26,
        .29*Math.pow(.8,i),'fm'));
    } else if (name === 'warning') {
      note(0,root*.5,.095,.25,'pulse',.125);
      note(.15,root*.5,.115,.27,'pulse',.125);
      note(0,root*.25,.28,.12,'triangle');
    } else if (name === 'queued') {
      note(0,root*.5,.075,.25,'triangle');note(.018,root,.045,.13,'pulse',.125);
    } else if (name === 'miss' || name === 'empty') {
      note(0,root*.25,duration*.8,.28,'pulse',.25,root*.125);
    }
    // The LFSR is clocked at deliberately reduced rates like a console noise
    // channel. Filtered body/air layers avoid a broadband white-noise blast.
    let lfsr = 0x4a35, noisePhase = 0, heldNoise = 0, low = 0;
    for (let i=0; i<out.length; i++) {
      const t=i/rate, u=t/duration; let value=0;
      for (const tone of tones) {
        const age=t-tone.at; if(age<0 || age>=tone.length)continue;
        const fraction=age/tone.length;
        const hz=tone.hz*Math.pow(tone.endHz/tone.hz,fraction);
        tone.phase += hz/rate;
        const p=tone.phase, sine=Math.sin(2*Math.PI*p);
        let wave;
        if(tone.wave==='pulse')wave=pulse(p,hz/rate,tone.duty);
        else if(tone.wave==='triangle')wave=Math.asin(sine)*2/Math.PI;
        else if(tone.wave==='fm')wave=Math.sin(2*Math.PI*p +
          1.65*Math.exp(-age*16)*Math.sin(2*Math.PI*p*2));
        else if(tone.wave==='metal')wave=Math.sin(2*Math.PI*p +
          3.8*Math.exp(-age*12)*Math.sin(2*Math.PI*p*1.4142));
        else wave=sine;
        const envelope=Math.min(1,age/.003)*Math.exp(-fraction*(tone.wave==='fm'?4.2:3.1))*
          Math.min(1,(tone.length-age)/.014);
        value+=wave*tone.gain*envelope;
      }
      const noiseHz=name==='crash'?10500*Math.pow(.19,u):name==='shift'?3100:
        name==='turbo'?4200+6900*u:6500;
      noisePhase+=noiseHz/rate;
      if(noisePhase>=1){noisePhase-=1;const bit=(lfsr^(lfsr>>1))&1;
        lfsr=(lfsr>>1)|(bit<<14);heldNoise=(lfsr&1)?1:-1;}
      low+=.12*(heldNoise-low);
      let noiseGain=0;
      if(name==='crash')noiseGain=.43*Math.exp(-t*10)+.11*Math.exp(-Math.pow((t-.065)/.024,2));
      else if(name==='brace')noiseGain=.15*Math.exp(-t*19);
      else if(name==='nearMiss'||name==='push')noiseGain=.19*Math.sin(Math.PI*u)*Math.exp(-u*1.5);
      else if(name==='turbo')noiseGain=.15*Math.sin(Math.PI*u)*Math.exp(-u*.7);
      else if(name==='shift')noiseGain=.06*Math.exp(-Math.pow((t-.09)/.018,2));
      else if(name==='count')noiseGain=.038*Math.exp(-t*95);
      else if(name==='ready'||name==='perfect')noiseGain=.055*Math.exp(-t*60);
      value+=(heldNoise-low*.72)*noiseGain;
      const edge=Math.min(1,t/.0018)*Math.min(1,(duration-t)/.018);
      // Mild console-like saturation followed by 16-bit quantization, with
      // explicit silent endpoints to prevent sample-start/end clicks.
      out[i]=Math.round(Math.tanh(value*1.25)*.68*edge*32767)/32767;
    }
    out[0]=0;out[out.length-1]=0;
    return buffer;
  }

  playRoadCue(kind, options = {}) {
    const ctx=this.context, settings=this.roadCueSettings(kind,options);
    if(!settings)return false;
    if(!ctx || ctx.state!=='running' || !this.sfxGain || !ctx.createBuffer ||
        !ctx.createBufferSource || !ctx.createGain){
      this.lastSFXCue={kind,road:true,reason:ctx?.state||'not-ready'};return false;
    }
    this.roadCueTimes ||= {};
    const now=ctx.currentTime, at=Number.isFinite(options.audioTimeSec)?
      Math.max(now,Math.min(now+.4,options.audioTimeSec)):now;
    if(at-(this.roadCueTimes[settings.name]??-Infinity)<settings.cadence)return false;
    this.combatVoices ||= new Set();
    this.roadSFXStats ||= {scheduled:0,evicted:0,cacheBuilds:0,engineStarts:0,engineStops:0};
    while(this.combatVoices.size>=12){
      const spare=[...this.combatVoices].filter(v=>(v.priority||(v.critical?3:0))<settings.priority)
        .sort((a,b)=>(a.priority||0)-(b.priority||0))[0] ||
        (settings.priority>=3?[...this.combatVoices].find(v=>v.road&&v.priority===settings.priority):null);
      if(!spare)return false;
      spare.dispose();this.roadSFXStats.evicted++;
    }
    this.roadCueBuffers ||= new Map();
    const key=[settings.name,settings.noteRoot,settings.name==='count'?settings.countBeat:0,
      settings.name==='perfect'||settings.name==='good'?settings.action:0].join(':');
    let buffer=this.roadCueBuffers.get(key);
    if(!buffer){
      buffer=this.createRoadCueBuffer(settings);
      if(this.roadCueBuffers.size>=96)this.roadCueBuffers.delete(this.roadCueBuffers.keys().next().value);
      this.roadCueBuffers.set(key,buffer);this.roadSFXStats.cacheBuilds++;
    }
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    const panNode=typeof ctx.createStereoPanner==='function'?ctx.createStereoPanner():null;
    const intensity=Math.max(0,Math.min(1,Number.isFinite(options.intensity)?options.intensity:.75));
    gain.gain.value=settings.gain*(.72+.28*intensity);
    source.buffer=buffer;source.connect(gain);
    if(panNode){panNode.pan.value=Math.max(-.7,Math.min(.7,options.pan||0));
      gain.connect(panNode);panNode.connect(this.sfxGain);}else gain.connect(this.sfxGain);
    const voice={road:true,kind:settings.name,priority:settings.priority,critical:settings.priority>=3,
      source,gain,panner:panNode,dispose:()=>{
        if(!this.combatVoices.delete(voice))return;
        source.onended=null;try{source.stop();}catch(_){}
        source.disconnect();gain.disconnect();panNode?.disconnect();
      }};
    this.combatVoices.add(voice);source.onended=voice.dispose;source.start(at);
    this.roadCueTimes[settings.name]=at;this.roadSFXStats.scheduled++;
    if(settings.priority>=3){this.roadEngineDuckAt=at;
      this.roadEngineDuckUntil=Math.max(this.roadEngineDuckUntil||0,at+Math.min(.3,settings.duration));}
    this.lastSFXCue={kind,road:true,reason:'scheduled',audioTimeSec:at,priority:settings.priority,
      noteRoot:settings.noteRoot,bar:settings.bar,action:settings.action,countBeat:settings.countBeat};
    return true;
  }

  stopRoadCues() {
    for(const voice of this.combatVoices||[])if(voice.road)voice.dispose();
    this.roadCueTimes={};this.roadEngineDuckAt=0;this.roadEngineDuckUntil=0;
  }

  updateRoadEngine(state = {}) {
    const ctx=this.context;
    if(!state.active || !ctx || ctx.state!=='running' || !this.sfxGain ||
        !ctx.createOscillator || !ctx.createBufferSource || !ctx.createBuffer ||
        !ctx.createGain || !ctx.createBiquadFilter){this.stopRoadEngine();return false;}
    const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:a));
    let engine=this.roadEngine;
    if(engine?.context!==ctx){this.stopRoadEngine();engine=null;}
    if(!engine){
      // A rapid retry owns at most one engine graph: retire any 25 ms release
      // before constructing its replacement, even if onended has not run yet.
      for(const released of this.roadEngineReleases||[])this.disposeRoadEngineGraph(released);
      const pulse=ctx.createOscillator(),sub=ctx.createOscillator(),grit=ctx.createBufferSource();
      const body=ctx.createGain(),bass=ctx.createGain(),air=ctx.createGain(),filter=ctx.createBiquadFilter();
      const gain=ctx.createGain(),panNode=ctx.createStereoPanner?.();
      pulse.type='sawtooth';sub.type='triangle';
      // A band-limited narrow-duty pulse carries console character without
      // aliasing the continuously changing engine pitch.
      if(ctx.createPeriodicWave && pulse.setPeriodicWave){
        const real=new Float32Array(25),imag=new Float32Array(25),duty=.28;
        for(let n=1;n<25;n++){real[n]=2*Math.sin(2*Math.PI*n*duty)/(Math.PI*n);
          imag[n]=2*(1-Math.cos(2*Math.PI*n*duty))/(Math.PI*n);}
        pulse.setPeriodicWave(ctx.createPeriodicWave(real,imag));
      }
      const buffer=ctx.createBuffer(1,16000,32000),data=buffer.getChannelData(0);
      let lfsr=0x6b17,previous=0;
      for(let i=0;i<data.length;i++){if(i%4===0){const bit=(lfsr^(lfsr>>1))&1;
        lfsr=(lfsr>>1)|(bit<<14);}previous+=.22*(((lfsr&1)?1:-1)-previous);data[i]=previous;}
      grit.buffer=buffer;grit.loop=true;
      body.gain.value=.34;bass.gain.value=.24;air.gain.value=.045;
      filter.type='lowpass';filter.frequency.value=600;filter.Q.value=.6;gain.gain.value=0;
      pulse.connect(body);sub.connect(bass);grit.connect(air);
      body.connect(filter);bass.connect(filter);air.connect(filter);filter.connect(gain);
      if(panNode){gain.connect(panNode);panNode.connect(this.sfxGain);}else gain.connect(this.sfxGain);
      engine={context:ctx,pulse,sub,grit,body,bass,air,filter,gain,panNode,
        sources:[pulse,sub,grit],nodes:[body,bass,air,filter,gain,...(panNode?[panNode]:[])],
        rpmHz:68,gear:0,generation:this.runtimeAudioGeneration,startedAt:ctx.currentTime,lastUpdate:-Infinity};
      this.roadEngine=engine;
      pulse.frequency.value=68;sub.frequency.value=34;
      engine.sources.forEach(source=>source.start(ctx.currentTime));
      this.roadSFXStats ||= {scheduled:0,evicted:0,cacheBuilds:0,engineStarts:0,engineStops:0};
      this.roadSFXStats.engineStarts++;
    }
    const now=ctx.currentTime,gear=Math.round(clamp(state.gear,0,2));
    // At most 30 parameter refreshes/sec; even a 240 Hz display reuses the
    // same three sources and does not queue redundant automation each frame.
    if(now-engine.lastUpdate<1/30 && gear===engine.gear)return true;
    // Speed is committed road WORLD units/sec (gears 30/52/70, boost up to
    // 78), never the cosmetic dashboard km/h number or a normalized ratio.
    const speed=clamp(state.speed,0,100),normalizedSpeed=speed/78;
    const boost=clamp(state.boost,0,1),shift=clamp(state.shifting,0,1);
    const load=clamp(state.load,0,1),damage=clamp(state.damage,0,1);
    const rpm=clamp(47+normalizedSpeed*108-gear*22+boost*25-load*6-shift*24,36,170);
    const duck=now>=(this.roadEngineDuckAt||0)&&now<(this.roadEngineDuckUntil||0)?.34:1;
    const target=(.079+normalizedSpeed*.021+boost*.024)*(1-shift*.2)*duck;
    const param=(p,value,settle=.065)=>{
      if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(now);
      else {const current=p.value;p.cancelScheduledValues?.(now);p.setValueAtTime?.(current,now);}
      if(p.setTargetAtTime)p.setTargetAtTime(value,now,settle);
      else if(p.setValueAtTime)p.setValueAtTime(value,now);else p.value=value;
    };
    param(engine.pulse.frequency,rpm);param(engine.sub.frequency,rpm*.5);
    param(engine.filter.frequency,440+normalizedSpeed*430+boost*680-shift*170);
    param(engine.air.gain,.03+boost*.06+damage*.065);
    param(engine.grit.playbackRate,.8+normalizedSpeed*.32+boost*.3);
    param(engine.gain.gain,target,.045);
    if(engine.panNode)param(engine.panNode.pan,clamp(state.pan,-.55,.55));
    engine.rpmHz=rpm;engine.gear=gear;engine.lastUpdate=now;
    return true;
  }

  disposeRoadEngineGraph(engine) {
    if(!engine || engine.disposed)return;
    engine.disposed=true;this.roadEngineReleases?.delete(engine);
    engine.sources.forEach(source=>{source.onended=null;try{source.stop();}catch(_){}source.disconnect();});
    engine.nodes.forEach(node=>node.disconnect());
  }

  stopRoadEngine(options = {}) {
    const engine=this.roadEngine;
    if(options.immediate || this.context?.state!=='running')
      for(const released of this.roadEngineReleases||[])this.disposeRoadEngineGraph(released);
    if(!engine)return false;
    this.roadEngine=null;
    if(this.roadSFXStats)this.roadSFXStats.engineStops++;
    if(options.immediate || engine.context.state!=='running'){
      this.disposeRoadEngineGraph(engine);return true;
    }
    const now=engine.context.currentTime,at=now+.025,param=engine.gain.gain;
    if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);
    else {param.cancelScheduledValues?.(now);param.setValueAtTime?.(param.value,now);}
    param.linearRampToValueAtTime(0,at);
    this.roadEngineReleases ||= new Set();this.roadEngineReleases.add(engine);
    engine.sources.forEach(source=>{source.onended=()=>this.disposeRoadEngineGraph(engine);
      try{source.stop(at);}catch(_){this.disposeRoadEngineGraph(engine);}});
    return true;
  }

  // Bridge cues are original synthesis, not excerpts of the level soundtrack
  // or speech. The D/A palette recalls Cache Road, but no music profile, stem,
  // transport or continuous engine is started during the illustrated scene.
  createCacheBridgeBuffer(name) {
    const lengths={relay:.56,original:1.94,clean:1.94,tape:.47,ignition:1.16};
    const duration=lengths[name];if(!duration || !this.context?.createBuffer)return null;
    const rate=32000,buffer=this.context.createBuffer(1,Math.ceil(duration*rate),rate);
    const samples=buffer.getChannelData(0),eighth=60/128/2,root=293.664768;
    const fifth=Math.pow(2,7/12),tones=[];
    const add=(at,hz,length,gain,wave='pulse',endHz=hz)=>
      tones.push({at,hz,length,gain,wave,endHz,phase:0});
    if(name==='original'||name==='clean'){
      // One authored bar, eight eighth-note slots. Clean retains the EXACT
      // waveform/timing of every surviving note, deleting slots 2, 4 and 7.
      // Each note ends before its next slot so those absences are real silence.
      [1,fifth,2,fifth,1,2,fifth,fifth*2].forEach((ratio,index)=>{
        if(name==='clean' && [1,3,6].includes(index))return;
        const at=index*eighth;
        add(at,root*ratio,.205,index===0||index===4?.33:.27,'pulse');
        add(at,root*ratio*.5,.185,.16,'triangle');
        add(at+.013,root*ratio*2,.15,.085,'fm');
      });
    }else if(name==='relay'){
      [0,.075,.15].forEach((at,index)=>add(at,root*[1,2,fifth*2][index],.12,.19,'pulse'));
      add(.235,root,.27,.23,'triangle');add(.25,root*2,.25,.15,'fm');
      add(.32,root*fifth*2,.19,.13,'fm');
    }else if(name==='tape'){
      add(0,140,.08,.3,'triangle',58);add(.052,180,.095,.21,'metal',74);
      add(.135,root,.22,.2,'pulse');add(.21,root*fifth,.23,.18,'fm');
    }else if(name==='ignition'){
      add(0,83,.15,.17,'pulse',57);add(.08,112,.13,.12,'metal',70);
      add(.19,45,.36,.32,'pulse',108);add(.22,30,.42,.21,'triangle',54);
      add(.50,108,.57,.25,'pulse',root*.25);add(.51,54,.56,.15,'triangle',root*.125);
      add(.73,root,.33,.11,'fm');
    }
    const blep=(phase,step)=>phase<step?(phase/=step,phase+phase-phase*phase-1):
      phase>1-step?(phase=(phase-1)/step,phase*phase+phase+phase+1):0;
    let noise=0x63b7,held=0,low=0;
    for(let i=0;i<samples.length;i++){
      const t=i/rate;let value=0;
      for(const tone of tones){
        const age=t-tone.at;if(age<0||age>=tone.length)continue;
        const u=age/tone.length,hz=tone.hz*Math.pow(tone.endHz/tone.hz,u);
        tone.phase+=hz/rate;const cycle=tone.phase%1,phase=tone.phase*2*Math.PI;
        let wave;
        if(tone.wave==='pulse')wave=((cycle<.25?1:-1)+blep(cycle,hz/rate)-
          blep((cycle+.75)%1,hz/rate)+.5)*.6;
        else if(tone.wave==='triangle')wave=Math.asin(Math.sin(phase))*2/Math.PI;
        else wave=Math.sin(phase+Math.sin(phase*(tone.wave==='metal'?1.4142:2))*
          (tone.wave==='metal'?3.1:1.6)*Math.exp(-age*14));
        const release=Math.min(1,(tone.length-age)/.025);
        const envelope=Math.min(1,age/.004)*Math.exp(-u*(name==='ignition'?1.6:3.4))*release;
        value+=wave*tone.gain*envelope;
      }
      if(i%4===0){noise=(noise>>1)|(((noise^(noise>>1))&1)<<14);held=(noise&1)?1:-1;}
      low+=.15*(held-low);
      const noiseGain=name==='tape'?.13*Math.exp(-t*36):name==='relay'?.026*Math.exp(-t*35):
        name==='ignition'?.12*Math.exp(-Math.pow((t-.13)/.11,2))+.045*Math.exp(-Math.pow((t-.43)/.22,2)):0;
      value+=(held-low*.7)*noiseGain;
      const edge=Math.min(1,t/.002)*Math.min(1,(duration-t)/.035);
      samples[i]=Math.round(Math.tanh(value*1.3)*.66*edge*32767)/32767;
    }
    samples[0]=0;samples[samples.length-1]=0;return buffer;
  }

  playCacheBridgeCue(name) {
    if(!['relay','original','clean','tape','ignition'].includes(name))return false;
    const ctx=this.context;
    if(!ctx || ctx.state!=='running' || !this.sfxGain || !ctx.createBuffer ||
        !ctx.createBufferSource || !ctx.createGain)return false;
    this.stopCacheBridgeAudio();this.combatVoices ||= new Set();
    while(this.combatVoices.size>=12){
      const spare=[...this.combatVoices].find(voice=>!voice.critical);
      if(!spare)return false;spare.dispose();
    }
    this.cacheBridgeBuffers ||= new Map();
    if(!this.cacheBridgeBuffers.has(name))this.cacheBridgeBuffers.set(name,this.createCacheBridgeBuffer(name));
    const source=ctx.createBufferSource(),gain=ctx.createGain(),now=ctx.currentTime;
    source.buffer=this.cacheBridgeBuffers.get(name);source.loop=false;
    // Original/clean are level matched on retained notes. The lower overall
    // clean RMS is the intended missing material, never a global volume dip.
    gain.gain.value=name==='ignition'?.55:.60;
    source.connect(gain);gain.connect(this.sfxGain);
    const voice={bridge:true,kind:name,source,gain,dispose:()=>{
      if(!this.combatVoices.delete(voice))return;
      source.onended=null;try{source.stop();}catch(_){}
      source.disconnect();gain.disconnect();
    }};
    this.combatVoices.add(voice);source.onended=voice.dispose;source.start(now);
    this.lastSFXCue={kind:`cacheBridge:${name}`,bridge:true,reason:'scheduled',
      audioTimeSec:now,synthesized:true,duration:source.buffer.duration};
    return true;
  }

  stopCacheBridgeAudio() {
    for(const voice of this.combatVoices||[])if(voice.bridge)voice.dispose();
  }

  // A miss cuts the bus for a beat and returns on the song grid. The five
  // synchronized sources continue underneath; none is stopped or re-seeked.
  playRoadStumble(options = {}) {
    const ctx = this.context, bus = this.musicGain?.gain;
    if (!ctx || ctx.state !== 'running' || !bus) return false;
    const now = ctx.currentTime;
    bus.cancelScheduledValues?.(now);
    if (!bus.setValueAtTime || !bus.linearRampToValueAtTime) return false;
    const grid = window.BARCODE?.MusicTransport?.sample?.(now)?.grid;
    const beatDuration = grid?.beatDurationSec || 60 / 128;
    // Give the silence at least three quarters of a beat, then land on the
    // next available beat. A collision just before a beat must still register.
    const nextRecoveryBeat = now + (grid ?
      Math.ceil(grid.beatFloat + .75) - grid.beatFloat : 1) * beatDuration;
    bus.setValueAtTime(bus.value, now);
    bus.linearRampToValueAtTime(.05, now + .025);
    bus.setValueAtTime(.05, now + .06);
    bus.linearRampToValueAtTime(0, now + .09);
    bus.setValueAtTime(0, nextRecoveryBeat - .035);
    bus.linearRampToValueAtTime(.8, nextRecoveryBeat);
    if (options.sound !== false && this.sfxGain && ctx.createOscillator && ctx.createGain) {
      const osc = ctx.createOscillator(), envelope = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.setValueAtTime(290, now + .055);
      osc.frequency.setValueAtTime(105, now + .115);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(.12, now + .008);
      envelope.gain.setValueAtTime(.12, now + .10);
      envelope.gain.linearRampToValueAtTime(0, now + .21);
      osc.connect(envelope); envelope.connect(this.sfxGain);
      osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
      osc.start(now); osc.stop(now + .23);
    }
    return true;
  }

  resetRoadStumble() {
    const bus = this.musicGain?.gain, now = this.context?.currentTime;
    if (!bus || !Number.isFinite(now)) return;
    bus.cancelScheduledValues?.(now);
    if (bus.setValueAtTime) bus.setValueAtTime(.8, now);
    else bus.value = .8;
  }

  // Cached one-shot textures: separate SFX, never a new beat/source clock.
  playModeCue(kind) {
    const ctx=this.context;
    if(!ctx?.createBuffer || ctx.state!=='running' || !this.sfxGain)return false;
    const settings={
      'hack-in':[.78,260,42,.24], 'hack-out':[.36,70,520,.12],
      'hack-guard':[.44,480,110,.16], 'rhythm-in':[.7,130,48,.26],
      'rhythm-hit':[.24,95,44,.14]
    };
    const config=settings[kind];if(!config)return false;
    this.modeCueTimes ||= {};const now=ctx.currentTime;
    if(now-(this.modeCueTimes[kind]??-Infinity)<(kind==='rhythm-hit'?.16:.3))return false;
    if(kind==='rhythm-hit' && now<(this.criticalCueUntil||0))return false;
    this.modeCueTimes[kind]=now;
    if(this.modeBufferRate!==ctx.sampleRate){this.modeBuffers={};this.modeBufferRate=ctx.sampleRate;}
    let buffer=this.modeBuffers[kind];
    if(!buffer){
      const [duration,from,to,noiseLevel]=config,rate=ctx.sampleRate;
      buffer=ctx.createBuffer(1,Math.ceil(rate*duration),rate);
      const data=buffer.getChannelData(0);let phase=0,low=0,seed=0x6b17;
      for(let i=0;i<data.length;i++){
        const t=i/rate,u=t/duration,attack=Math.min(1,t/.012),release=Math.pow(1-u,1.8);
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const white=seed/2147483648-1;low+=.06*(white-low);
        const hz=from*Math.pow(to/from,u);phase+=Math.PI*2*hz/rate;
        const body=Math.sin(phase)*.36*Math.exp(-u*3.5);
        const air=(white-low)*noiseLevel*(kind==='hack-in'?Math.sin(Math.PI*u):Math.exp(-u*6));
        const shimmer=kind==='hack-guard'?Math.sin(phase*2.73)*.12:0;
        data[i]=(body+air+shimmer)*attack*release;
      }
      this.modeBuffers[kind]=buffer;
    }
    return this.playSFXBuffer(buffer,.85,kind);
  }

  createRepairBuffer() {
    const rate = this.context.sampleRate, duration = 0.84;
    const buffer = this.context.createBuffer(1, Math.ceil(rate * duration), rate);
    const samples = buffer.getChannelData(0);
    // A soft rising major-key digital chime: clear attack, rounded body, airy tail.
    const notes = [[0, 659.255, .28], [.09, 830.609, .26], [.18, 987.767, .25], [.30, 1318.510, .23]];
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate; let value = 0;
      for (const [start, hz, gain] of notes) {
        const age = t-start;
        if (age < 0 || age > .54) continue;
        const envelope = Math.min(1, age/.009) * Math.exp(-age*9) * Math.min(1,(.54-age)/.08);
        const phase = Math.PI*2*hz*age;
        value += gain*envelope*(Math.sin(phase)+.11*Math.sin(phase*2)+.04*Math.sin(phase*4));
      }
      samples[i] = value;
    }
    return buffer;
  }
  playRepairPickup() {
    if (!this.context || !this.sfxGain || this.context.state !== 'running') return false;
    if (!this.repairBuffer || this.repairBuffer.sampleRate !== this.context.sampleRate) this.repairBuffer = this.createRepairBuffer();
    return this.playSFXBuffer(this.repairBuffer, 0.62, 'repair');
  }

  playSFXBuffer(buffer, volume = 1, kind = 'sample') {
    if (!this.context || !this.sfxGain || this.context.state !== 'running') {
      this.lastSFXCue = { kind, reason: this.context?.state || 'not-ready' };
      return false;
    }
    this.combatVoices ||= new Set();
    while (this.combatVoices.size >= 12) {
      const spare=[...this.combatVoices].find(v=>!v.critical);
      if(!spare)return false;
      spare.dispose();
    }
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain); gain.connect(this.sfxGain);
    const voice = { dispose: () => {
      if (!this.combatVoices.delete(voice)) return;
      source.onended = null;
      try { source.stop(); } catch (error) {}
      source.disconnect(); gain.disconnect();
    } };
    this.combatVoices.add(voice); source.onended = voice.dispose;
    source.start(this.context.currentTime);
    this.lastSFXCue = { kind, reason: 'scheduled', audioTimeSec: this.context.currentTime };
    return true;
  }

  stopCombatCues() {
    this.stopRoadEngine();
    this.stopRoadCues();
    for (const voice of this.combatVoices || []) voice.dispose();
    this.combatCueTimes = {};
    this.modeCueTimes = {};
    this.criticalCueUntil = 0;
  }

  playSound(soundName, volume = 1.0) {
    if (!this.initialized || !this.sounds[soundName]) return;
    
    try {
      this.sounds[soundName]();
    } catch (error) {
      console.error('Error playing sound:', soundName, error?.message || error?.toString() || 'Unknown error');
    }
  }
  
  // Play random whoosh sound for ships flying past
  playRandomWhoosh() {
    const whooshSounds = ['whoosh1', 'whoosh2'];
    
    // Check which whoosh sounds are actually available
    const availableWhooshSounds = whooshSounds.filter(sound => this.sounds[sound]);
    
    if (availableWhooshSounds.length === 0) {
      console.warn('🚀 No whoosh sounds available - using fallback');
      // Play a synthetic whoosh as fallback
      this.playSound('synthHit'); // Use existing synth hit as fallback
      return;
    }
    
    const randomWhoosh = availableWhooshSounds[Math.floor(Math.random() * availableWhooshSounds.length)];
    
    try {
      this.sounds[randomWhoosh]();
      console.log(`🚀 Playing ${randomWhoosh} for passing ship (available: [${availableWhooshSounds.join(', ')}])`);
    } catch (error) {
      console.error('Error playing whoosh sound:', randomWhoosh, error?.message || error?.toString() || 'Unknown error');
      // Try fallback sound
      this.playSound('synthHit');
    }
  }

  // Start rhythm beat track
  startRhythm(bpm = 32) {
    if (!this.initialized) return;
    
    // Stop any existing rhythm to prevent duplicates
    this.stopRhythm();
    
    // CRITICAL: Use ONLY layer beat sync for rhythm mode
    // Beat scheduler conflicts with layer sync and causes duplicate beat calls
    console.log('🎵 Using ONLY layer beat sync for rhythm mode (preventing duplicates)');
    this.startLayerBeatSync();
    
    // Optional: Only start beat scheduler if no layers (fallback mode)
    if (!this.layersStarted) {
      this.beatInterval = 60 / bpm; // seconds
      this.currentBeat = 0;
      this.nextBeatTime = this.context.currentTime + 0.1; // Small delay
      
      // Resume audio context if suspended (browser policy)
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
      
      this.scheduleBeats();
      console.log(`Rhythm beat scheduler started at ${bpm} BPM`);
    } else {
      console.log('Layers active - using layer beat sync instead of scheduler');
    }
  }

  // Stop rhythm beat track
  stopRhythm() {
    if (this.beatScheduler) {
      clearTimeout(this.beatScheduler);
    }
    this.beatScheduler = null;
    this.currentBeat = 0;
  }

  // Runtime lifecycle compatibility alias for the legacy rhythm scheduler.
  stopBeatTrack() {
    // This seam is called only by pause/stop. Cancel road SFX before context
    // suspension without editing the protected music pause/transport method.
    // stopRuntimeAudio already released its engine through stopCombatCues;
    // preserve that owned, finite exit fade when no active graph remains.
    if (this.roadEngine) this.stopRoadEngine({immediate:true});
    // A same-generation tail is an in-game release (for example game over
    // followed immediately by pause). Retire it before suspension so resume
    // cannot replay its final 25 ms. Runtime stop has advanced the generation.
    for (const released of this.roadEngineReleases || [])
      if (released.generation === this.runtimeAudioGeneration) this.disposeRoadEngineGraph(released);
    this.stopRoadCues();
    this.stopCacheBridgeAudio();
    return this.stopRhythm();
  }
  
  // Stop loop detection system
  stopLoopDetection() {
    if (this.loopCheckInterval) {
      clearInterval(this.loopCheckInterval);
      this.loopCheckInterval = null;
    }
    this.isLooping = false;
    console.log('🎵 Loop detection system stopped');
  }

  // Schedule beat patterns
  scheduleBeats() {
    if (!this.initialized) return;
    
    // Don't run automatic beat scheduler when layers are active
    // Layers provide their own rhythm/melody content
    // CRITICAL: Skip beat scheduler when layers are active
    // Layer beat sync provides the timing for rhythm system
    // Beat scheduler would create duplicate sync calls
    
    // CRITICAL: Only run beat scheduler if layers are NOT active
    // When layers are active, layer beat sync handles all timing
    if (!this.layersStarted) {
      // Schedule beats up to 2 seconds ahead
      while (this.nextBeatTime < this.context.currentTime + 2) {
        this.scheduleBeat(this.nextBeatTime, this.currentBeat);
        this.nextBeatTime += this.beatInterval / 4; // 16th notes
        this.currentBeat++;
      }
      
      // Continue scheduling
      this.beatScheduler = this.scheduleRuntimeTimeout(() => this.scheduleBeats(), 100);
    } else {
      console.log('🎵 Skipping beat scheduler - layer beat sync is active');
    }
  }

  // Schedule individual beat
  scheduleBeat(time, beat) {
    const beatInMeasure = beat % 16;
    
    // ALWAYS sync with rhythm system if it exists and is running - regardless of visual state
    if (window.rhythmSystem && window.rhythmSystem.isRunning()) {
      console.log('🎵 Audio beat - syncing with rhythm system');
      // Don't play automatic beats during rhythm mode - let user input drive the sound
      // Only sync rhythm system for beat timing
      
      // CRITICAL: Always call syncWithAudioBeat - it handles tempo establishment internally
      this.scheduleRuntimeTimeout(() => {
        if (window.rhythmSystem) {
          window.rhythmSystem.syncWithAudioBeat();
        }
      }, (time - this.context.currentTime) * 1000);
    } else {
      console.log('🎵 Audio beat - rhythm system not running, no sync');
      // Default beat patterns: kick on 1, 5, 9, 13; snare on 5, 13; hihats on others
      if (beatInMeasure === 0 || beatInMeasure === 4 || beatInMeasure === 8 || beatInMeasure === 12) {
        // Kick drum
        this.scheduleRuntimeTimeout(() => this.playSound('kick'), (time - this.context.currentTime) * 1000);
      }
      
      if (beatInMeasure === 4 || beatInMeasure === 12) {
        // Snare drum  
        this.scheduleRuntimeTimeout(() => this.playSound('snare'), (time - this.context.currentTime) * 1000);
      }
      
      if (beatInMeasure % 2 === 1) {
        // Hi-hats on off-beats
        this.scheduleRuntimeTimeout(() => this.playSound('hihat'), (time - this.context.currentTime) * 1000);
      }
    }
  }

  // Play rhythm attack sound
  playRhythmAttack(timing = 'good') {
    if (timing === 'excellent' || timing === 'perfect') {
      this.playSuccessRhythmSound();
    } else {
      this.playSound('synthHit');
    }
  }

  // Update visualization data
  updateVisualization() {
    if (!this.analyser || !this.dataArray) return;
    
    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Calculate frequency bands
    const bassEnd = Math.floor(this.dataArray.length * 0.1);
    const midEnd = Math.floor(this.dataArray.length * 0.5);
    
    let bass = 0, mid = 0, high = 0;
    
    // Bass frequencies
    for (let i = 0; i < bassEnd; i++) {
      bass += this.dataArray[i];
    }
    bass = bass / bassEnd / 255;
    
    // Mid frequencies
    for (let i = bassEnd; i < midEnd; i++) {
      mid += this.dataArray[i];
    }
    mid = mid / (midEnd - bassEnd) / 255;
    
    // High frequencies
    for (let i = midEnd; i < this.dataArray.length; i++) {
      high += this.dataArray[i];
    }
    high = high / (this.dataArray.length - midEnd) / 255;
    
    this.visualizationData = { bass, mid, high };
  }

  // Get visualization data
  getVisualizationData() {
    return this.visualizationData;
  }

  // Set master volume
  setMasterVolume(volume) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  // Set rhythm volume
  setRhythmVolume(volume) {
    if (this.rhythmGain) {
      this.rhythmGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  // Set SFX volume
  setSFXVolume(volume) {
    if (this.sfxGain) {
      this.sfxGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  // Load external sound effects (whoosh sounds)
  async loadSoundEffects() {
    // WHOOSH SOUND URLs - Updated with actual working URLs
    const whooshUrls = {
      'whoosh1': [
        './assets/standalone/audio-4e510bfa-7c4c-4cd5-be98-99669e092b21.mp3',
        './assets/standalone/audio-4e510bfa-7c4c-4cd5-be98-99669e092b21.mp3',
        './assets/standalone/audio-4e510bfa-7c4c-4cd5-be98-99669e092b21.mp3'
      ],
      'whoosh2': [
        './assets/standalone/audio-c5fe25ff-72fd-4a40-a30d-70c1a148920a.mp3',
        './assets/standalone/audio-c5fe25ff-72fd-4a40-a30d-70c1a148920a.mp3',
        './assets/standalone/audio-c5fe25ff-72fd-4a40-a30d-70c1a148920a.mp3'
      ]
    };
    
    console.log('🚀 ATTEMPTING TO LOAD WHOOSH SOUNDS FROM THESE URLS:');
    console.log('whoosh1 URLs:', whooshUrls['whoosh1']);
    console.log('whoosh2 URLs:', whooshUrls['whoosh2']);
    
    for (const [name, urlArray] of Object.entries(whooshUrls)) {
      let soundLoaded = false;
      
      // Try each possible URL for this sound
      for (let i = 0; i < urlArray.length; i++) {
        const url = urlArray[i];
        
        try {
          console.log(`Attempting to load ${name} from URL ${i + 1}/${urlArray.length}: ${url}`);
          
          // Try to load the remote sound
          const response = await fetch(url, { method: 'HEAD' });
          
          if (response.ok) {
            // If HEAD request succeeds, do a full GET for actual data
            const fullResponse = await fetch(url);
            const arrayBuffer = await fullResponse.arrayBuffer();
            
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
            
            this.sounds[name] = () => {
              const now = this.context.currentTime;
              const source = this.context.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.sfxGain);
              source.start(now);
              return now + audioBuffer.duration;
            };
            
            console.log(`✓ Loaded sound effect ${name} from: ${url}`);
            soundLoaded = true;
            break; // Success, stop trying other URLs
          } else {
            console.log(`Sound effect ${name} not available at ${url} (HTTP ${response.status})`);
          }
        } catch (error) {
          console.log(`Network error loading sound effect ${name} from ${url}:`, error?.message || 'Network error');
        }
      }
      
      // If all URLs failed, create a synthetic fallback
      if (!soundLoaded) {
        console.log(`All URLs failed for ${name}, creating fallback`);
        try {
          this.sounds[name] = this.createWhooshFallback();
          console.log(`✓ Created fallback for sound effect ${name}`);
        } catch (fallbackError) {
          console.error(`Failed to create fallback for ${name}:`, fallbackError?.message || fallbackError?.toString() || 'Unknown error');
        }
      }
    }
  }
  
  // Load enemy-specific sounds
  async loadEnemySounds() {
    const enemySoundUrls = {
      'virus': './assets/standalone/audio-a26e3d15-d122-4895-81ce-03370b49794f.mp3',
      'corrupted': './assets/standalone/audio-498c6110-78b1-4452-a6c2-1f4e979e1c5a.mp3',
      'firewall': './assets/standalone/audio-dc031dbb-5af2-4a78-a93e-f60aff8bb6e6.mp3'
    };
    
    console.log('🦠 Loading enemy sounds...');
    
    for (const [enemyType, url] of Object.entries(enemySoundUrls)) {
      try {
        console.log(`Loading ${enemyType} sound from: ${url}`);
        
        const response = await fetch(url, { method: 'HEAD' });
        
        if (response.ok) {
          const fullResponse = await fetch(url);
          const arrayBuffer = await fullResponse.arrayBuffer();
          
          const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
          
          // Create individual gain node for this enemy type
          const enemyGain = this.context.createGain();
          enemyGain.connect(this.sfxGain);
          enemyGain.gain.value = 0; // Start silent
          
          this.enemySounds[enemyType] = {
            buffer: audioBuffer,
            gainNode: enemyGain,
            sources: [] // Track active sources for this enemy type
          };
          
          console.log(`✓ Loaded enemy sound: ${enemyType}`);
        } else {
          console.log(`Enemy sound ${enemyType} not available (HTTP ${response.status}), creating fallback`);
          this.createEnemySoundFallback(enemyType);
        }
      } catch (error) {
        console.log(`Error loading enemy sound ${enemyType}:`, error?.message || 'Network error');
        this.createEnemySoundFallback(enemyType);
      }
    }
  }
  
  // Create fallback sound for enemy type
  createEnemySoundFallback(enemyType) {
    console.log(`Creating fallback sound for ${enemyType}`);
    
    // Create synthetic enemy sound based on type
    this.enemySounds[enemyType] = {
      oscillator: null,
      gainNode: this.context.createGain(),
      sources: []
    };
    
    this.enemySounds[enemyType].gainNode.connect(this.sfxGain);
    this.enemySounds[enemyType].gainNode.gain.value = 0; // Start silent
    
    // Create different synthetic sounds for different enemy types
    switch(enemyType) {
      case 'virus':
        // Create pulsing electronic sound for virus
        this.enemySounds[enemyType].createSource = () => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, this.context.currentTime);
          osc.frequency.exponentialRampToValueAtTime(50, this.context.currentTime + 0.3);
          
          gain.gain.setValueAtTime(0, this.context.currentTime);
          gain.gain.linearRampToValueAtTime(0.2, this.context.currentTime + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.3);
          
          osc.connect(gain);
          gain.connect(this.enemySounds[enemyType].gainNode);
          
          osc.start();
          osc.stop(this.context.currentTime + 0.3);
          
          return osc;
        };
        break;
        
      case 'corrupted':
        // Create glitchy digital sound for corrupted enemies
        this.enemySounds[enemyType].createSource = () => {
          const osc1 = this.context.createOscillator();
          const osc2 = this.context.createOscillator();
          const gain = this.context.createGain();
          
          osc1.type = 'square';
          osc1.frequency.setValueAtTime(300, this.context.currentTime);
          osc1.frequency.exponentialRampToValueAtTime(150, this.context.currentTime + 0.2);
          
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(200, this.context.currentTime);
          osc2.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.25);
          
          gain.gain.setValueAtTime(0, this.context.currentTime);
          gain.gain.linearRampToValueAtTime(0.15, this.context.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.4);
          
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.enemySounds[enemyType].gainNode);
          
          osc1.start();
          osc2.start();
          osc1.stop(this.context.currentTime + 0.4);
          osc2.stop(this.context.currentTime + 0.4);
          
          return { osc1, osc2 };
        };
        break;
        
      case 'firewall':
        // Create heavy humming sound for firewall enemies
        this.enemySounds[enemyType].createSource = () => {
          const osc1 = this.context.createOscillator();
          const osc2 = this.context.createOscillator();
          const gain = this.context.createGain();
          
          // Low frequency hum for heavy presence
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(80, this.context.currentTime);
          osc1.frequency.exponentialRampToValueAtTime(60, this.context.currentTime + 0.5);
          
          // Higher frequency harmonic for intensity
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(160, this.context.currentTime);
          osc2.frequency.exponentialRampToValueAtTime(120, this.context.currentTime + 0.4);
          
          gain.gain.setValueAtTime(0, this.context.currentTime);
          gain.gain.linearRampToValueAtTime(0.25, this.context.currentTime + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.6);
          
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.enemySounds[enemyType].gainNode);
          
          osc1.start();
          osc2.start();
          osc1.stop(this.context.currentTime + 0.6);
          osc2.stop(this.context.currentTime + 0.6);
          
          return { osc1, osc2 };
        };
        break;
        
      default:
        // Generic enemy sound
        this.enemySounds[enemyType].createSource = () => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          
          osc.type = 'square';
          osc.frequency.value = 200;
          
          gain.gain.setValueAtTime(0.1, this.context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.2);
          
          osc.connect(gain);
          gain.connect(this.enemySounds[enemyType].gainNode);
          
          osc.start();
          osc.stop(this.context.currentTime + 0.2);
          
          return osc;
        };
    }
  }
  
  // Update enemy proximity sounds (call this every frame)
  updateEnemyProximitySounds(playerX, playerY, enemies) {
    if (!this.initialized) return;
    
    const currentTime = this.context.currentTime;
    
    // DEBUG: Log enemy types being checked
    const enemyTypes = enemies.map(e => e.type).filter((v, i, a) => a.indexOf(v) === i);
    if (enemyTypes.includes('firewall') && Date.now() % 2000 < 100) {
      console.log('🔥 Firewall proximity sound check:', enemyTypes, 'firewall sounds available:', !!this.enemySounds['firewall']);
    }
    
    // Group enemies by type and find closest for each type
    const enemiesByType = {};
    
    enemies.forEach(enemy => {
      if (!enemy.active) return;
      
      const enemyType = enemy.type;
      if (!this.enemySounds[enemyType]) return; // Skip if no sound for this type
      
      // Calculate distance to player
      const dx = enemy.position.x - playerX;
      const dy = enemy.position.y - playerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Check if enemy is on screen (assuming 1920x1080 viewport)
      const camX = playerX; // Assuming camera follows player
      const camY = playerY;
      const screenWidth = 1920;
      const screenHeight = 1080;
      
      const onScreen = (
        enemy.position.x >= camX - screenWidth/2 - 100 &&
        enemy.position.x <= camX + screenWidth/2 + 100 &&
        enemy.position.y >= camY - screenHeight/2 - 100 &&
        enemy.position.y <= camY + screenHeight/2 + 100
      );
      
      if (!enemiesByType[enemyType] || distance < enemiesByType[enemyType].distance) {
        enemiesByType[enemyType] = {
          distance: distance,
          onScreen: onScreen,
          enemy: enemy
        };
      }
    });
    
    // Update volume for each enemy type based on closest enemy
    for (const [enemyType, closestInfo] of Object.entries(enemiesByType)) {
      const soundData = this.enemySounds[enemyType];
      if (!soundData) continue;
      
      let targetVolume = 0;
      
      if (closestInfo.onScreen) {
        // Calculate volume based on distance (closer = louder)
        const maxDistance = 800; // Maximum audible distance
        const minDistance = 50; // Minimum distance for max volume
        
        if (closestInfo.distance <= maxDistance) {
          // Inverse square law with linear falloff for simplicity
          const distanceRatio = Math.max(0, (maxDistance - closestInfo.distance) / (maxDistance - minDistance));
          targetVolume = distanceRatio * 0.8; // Max 80% volume
        }
      }
      
      if (this.context.currentTime < (this.criticalCueUntil || 0)) targetVolume *= 0.35;
      // Smooth volume transition
      const currentVolume = soundData.gainNode.gain.value;
      const volumeStep = 0.05; // Smooth transition speed
      
      if (Math.abs(targetVolume - currentVolume) > volumeStep) {
        if (targetVolume > currentVolume) {
          soundData.gainNode.gain.value = Math.min(targetVolume, currentVolume + volumeStep);
        } else {
          soundData.gainNode.gain.value = Math.max(targetVolume, currentVolume - volumeStep);
        }
      } else {
        soundData.gainNode.gain.value = targetVolume;
      }
      
      // Play sound effect when volume increases (enemy getting closer)
      if (targetVolume > 0.1 && currentVolume < 0.1) {
        this.playEnemySound(enemyType);
      }
    }
    
    // Fade out enemy types that no longer have enemies nearby
    for (const enemyType of Object.keys(this.enemySounds)) {
      if (!enemiesByType[enemyType]) {
        const soundData = this.enemySounds[enemyType];
        if (soundData && soundData.gainNode.gain.value > 0) {
          // Fade out
          soundData.gainNode.gain.value = Math.max(0, soundData.gainNode.gain.value - 0.02);
        }
      }
    }
  }
  
  // Play enemy sound effect
  playEnemySound(enemyType) {
    const soundData = this.enemySounds[enemyType];
    if (!soundData) return;
    
    try {
      if (soundData.buffer) {
        // Use actual audio buffer
        const source = this.context.createBufferSource();
        source.buffer = soundData.buffer;
        source.connect(soundData.gainNode);
        source.start();
        
        // Clean up after sound finishes
        source.onended = () => {
          const index = soundData.sources.indexOf(source);
          if (index > -1) {
            soundData.sources.splice(index, 1);
          }
        };
        
        soundData.sources.push(source);
      } else if (soundData.createSource) {
        // Use synthetic fallback
        const source = soundData.createSource();
        soundData.sources.push(source);
      }
    } catch (error) {
      console.error(`Error playing enemy sound ${enemyType}:`, error?.message || error);
    }
  }
  
  // Load rhythm success sounds
  async loadRhythmSuccessSounds() {
    const rhythmSuccessUrls = [
      {
        name: 'rhythmSuccess1',
        url: './assets/standalone/audio-aab8fc0a-ac9b-47f5-9170-e38e4d15e39a.wav'
      },
      {
        name: 'rhythmSuccess2',
        url: './assets/standalone/audio-3a9cb68b-091e-4133-9d05-f936a780c605.wav'
      },
      {
        name: 'rhythmSuccess3',
        url: './assets/standalone/audio-9c2ff06d-30bf-4e03-a7c2-5cc3636413bf.wav'
      }
    ];
    
    console.log('🎵 Loading rhythm success sounds...');
    
    // Array to store successfully loaded success sounds
    this.rhythmSuccessSounds = [];
    
    for (const soundData of rhythmSuccessUrls) {
      try {
        console.log(`Attempting to load ${soundData.name} from: ${soundData.url}`);
        
        const response = await fetch(soundData.url, { method: 'HEAD' });
        
        if (response.ok) {
          const fullResponse = await fetch(soundData.url);
          const arrayBuffer = await fullResponse.arrayBuffer();
          
          const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
          
          // Create sound function for this success sound
          this.sounds[soundData.name] = () => this.playSFXBuffer(audioBuffer, 0.9, 'rhythm-success');
          
          // Add to success sounds array for random selection
          this.rhythmSuccessSounds.push(soundData.name);
          
          console.log(`✓ Loaded ${soundData.name}`);
        } else {
          console.log(`${soundData.name} not available (HTTP ${response.status})`);
        }
      } catch (error) {
        console.log(`Error loading ${soundData.name}:`, error?.message || 'Network error');
      }
    }
    
    // If no rhythm success sounds loaded, create fallback
    if (this.rhythmSuccessSounds.length === 0) {
      console.log('No rhythm success sounds loaded, using fallback');
      this.sounds.rhythmSuccess = () => this.playCombatCue('perfect');
      this.rhythmSuccessSounds = ['rhythmSuccess'];
    } else {
      console.log(`✓ Loaded ${this.rhythmSuccessSounds.length} rhythm success sounds: [${this.rhythmSuccessSounds.join(', ')}]`);
    }
  }
  
  // Play rhythm success sound
  playSuccessRhythmSound() {
    // Check if we have rhythm success sounds loaded
    if (this.rhythmSuccessSounds && this.rhythmSuccessSounds.length > 0) {
      try {
        // Select a random rhythm success sound
        const randomSound = this.rhythmSuccessSounds[Math.floor(Math.random() * this.rhythmSuccessSounds.length)];
        
        if (this.sounds[randomSound]) {
          // Volume belongs to this voice. Never duck the entire SFX channel
          // or restore an obsolete bus value from a delayed callback.
          this.sounds[randomSound]();
        } else {
          console.warn(`Selected rhythm sound ${randomSound} not found, using fallback`);
          this.playCombatCue('perfect');
        }
      } catch (error) {
        console.error('Error playing rhythm success sound:', error?.message || error);
        // Fallback to regular success sound
        this.playCombatCue('perfect');
      }
    } else {
      // Fallback to regular success sound if no rhythm sounds loaded
      console.log('No rhythm success sounds available, using fallback');
      this.playCombatCue('perfect');
    }
  }
  
  // Load enemy defeat sounds
  async loadEnemyDefeatSounds() {
    console.log('🦠 Loading enemy defeat sounds...');
    
    // Load defeat sounds for each enemy type
    const defeatUrls = {
      virus: {
        url: './assets/standalone/audio-a9fa8406-26c0-4f8d-b961-70dc99e0f52f.mp3',
        fallback: this.createVirusDefeatFallback(),
        soundName: 'virusDefeat'
      },
      corrupted: {
        url: './assets/standalone/audio-e39ab293-b53e-41d9-b837-58ab36c027f1.mp3',
        fallback: this.createCorruptedDefeatFallback(),
        soundName: 'corruptedDefeat'
      },
      firewall: {
        url: './assets/standalone/audio-cc0b2256-2a0e-41e7-a88f-04d68df83dd5.mp3',
        fallback: this.createFirewallDefeatFallback(),
        soundName: 'firewallDefeat'
      }
    };
    
    for (const [enemyType, defeatData] of Object.entries(defeatUrls)) {
      try {
        console.log(`Loading ${enemyType} defeat sound from: ${defeatData.url}`);
        
        const response = await fetch(defeatData.url, { method: 'HEAD' });
        
        if (response.ok) {
          const fullResponse = await fetch(defeatData.url);
          const arrayBuffer = await fullResponse.arrayBuffer();
          
          const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
          
          this.sounds[defeatData.soundName] = () => {
            const now = this.context.currentTime;
            const source = this.context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.sfxGain);
            source.start(now);
            return now + audioBuffer.duration;
          };
          
          console.log(`✓ Loaded ${enemyType} defeat sound`);
        } else {
          console.log(`${enemyType} defeat sound not available (HTTP ${response.status}), creating fallback`);
          this.sounds[defeatData.soundName] = defeatData.fallback;
        }
      } catch (error) {
        console.log(`Error loading ${enemyType} defeat sound:`, error?.message || 'Network error');
        this.sounds[defeatData.soundName] = defeatData.fallback;
      }
    }
  }
  
  // Create fallback virus defeat sound
  createVirusDefeatFallback() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.4;
      
      // Create digital defeat sound for virus
      const osc = this.context.createOscillator();
      const noise = this.context.createBufferSource();
      
      // Create noise buffer for static effect
      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() - 0.5) * 0.3;
      }
      noise.buffer = noiseBuffer;
      
      // Oscillator setup - descending pitch for defeat
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + duration);
      
      // Envelope for defeat sound
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(0.4, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Filter for digital character
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      filter.Q.value = 3;
      
      // Connect nodes
      osc.connect(filter);
      noise.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.sfxGain);
      
      // Play sound
      osc.start(now);
      noise.start(now);
      osc.stop(now + duration);
      noise.stop(now + duration);
      
      return now + duration;
    };
  }
  
  // Create fallback corrupted defeat sound
  createCorruptedDefeatFallback() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.5;
      
      // Create glitchy defeat sound for corrupted enemies
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const noise = this.context.createBufferSource();
      
      // Create noise buffer
      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() - 0.5) * 0.4;
      }
      noise.buffer = noiseBuffer;
      
      // Oscillator 1 - glitchy descending tone
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(400, now);
      osc1.frequency.exponentialRampToValueAtTime(100, now + duration);
      
      // Oscillator 2 - rapid pulsing
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(200, now);
      osc2.frequency.exponentialRampToValueAtTime(50, now + 0.3);
      
      // Envelope for corrupted defeat
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(0.5, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Filter for glitchy character
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 5;
      
      // Connect nodes
      osc1.connect(filter);
      osc2.connect(filter);
      noise.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.sfxGain);
      
      // Play sound
      osc1.start(now);
      osc2.start(now);
      noise.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
      noise.stop(now + duration);
      
      return now + duration;
    };
  }
  
  // Create fallback firewall defeat sound
  createFirewallDefeatFallback() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.6;
      
      // Create heavy defeat sound for firewall enemies
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const noise = this.context.createBufferSource();
      
      // Create noise buffer for explosion effect
      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() - 0.5) * 0.5;
      }
      noise.buffer = noiseBuffer;
      
      // Oscillator 1 - low frequency rumble
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(80, now);
      osc1.frequency.exponentialRampToValueAtTime(30, now + duration);
      
      // Oscillator 2 - heavy impact
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(150, now);
      osc2.frequency.exponentialRampToValueAtTime(60, now + 0.4);
      
      // Envelope for heavy defeat
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(0.6, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Filter for heavy impact
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      filter.Q.value = 2;
      
      // Connect nodes
      osc1.connect(filter);
      osc2.connect(filter);
      noise.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.sfxGain);
      
      // Play sound
      osc1.start(now);
      osc2.start(now);
      noise.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
      noise.stop(now + duration);
      
      return now + duration;
    };
  }
  
  // Play enemy defeat sound based on enemy type
  playEnemyDefeatSound(enemyType) {
    const soundName = `${enemyType}Defeat`;
    const fallbackSound = enemyType === 'virus' ? 'terminalBuzz' : 'synthHit';
    
    if (this.sounds[soundName]) {
      try {
        this.sounds[soundName]();
        console.log(`🦠 Playing ${enemyType} defeat sound`);
      } catch (error) {
        console.error(`Error playing ${enemyType} defeat sound:`, error?.message || error);
        // Fallback sound
        this.playSound(fallbackSound);
      }
    } else {
      // Fallback sound
      this.playSound(fallbackSound);
    }
  }
  
  // Legacy method for backward compatibility
  playVirusDefeatSound() {
    this.playEnemyDefeatSound('virus');
  }
  
  // Load player damage sound
  async loadPlayerDamageSound() {
    const playerDamageUrl = './assets/standalone/audio-8d792d94-17c5-43c2-a3b0-b1e1dcf5bff0.wav';
    
    console.log('💥 Loading player damage sound...');
    
    try {
      console.log(`Attempting to load player damage sound from: ${playerDamageUrl}`);
      
      const response = await fetch(playerDamageUrl, { method: 'HEAD' });
      
      if (response.ok) {
        const fullResponse = await fetch(playerDamageUrl);
        const arrayBuffer = await fullResponse.arrayBuffer();
        
        const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
        
        this.sounds.playerDamage = () => this.playSFXBuffer(audioBuffer, 1, 'player-damage');
        
        console.log('✓ Loaded player damage sound');
      } else {
        console.log(`Player damage sound not available (HTTP ${response.status}), creating fallback`);
        this.sounds.playerDamage = () => this.playCombatCue('damage');
      }
    } catch (error) {
      console.log(`Error loading player damage sound:`, error?.message || 'Network error');
      this.sounds.playerDamage = () => this.playCombatCue('damage');
    }
  }
  
  // Create fallback player damage sound
  createPlayerDamageFallback() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.3;
      
      // Create harsh digital damage sound
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const noise = this.context.createBufferSource();
      
      // Create noise buffer
      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() - 0.5) * 0.5;
      }
      noise.buffer = noiseBuffer;
      
      // Oscillator 1 - low frequency hit
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(100, now);
      osc1.frequency.exponentialRampToValueAtTime(30, now + 0.2);
      
      // Oscillator 2 - harsh distortion
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(200, now);
      osc2.frequency.exponentialRampToValueAtTime(50, now + 0.15);
      
      // Envelope for harsh impact
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(0.6, now); // Loud initial hit
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration); // Quick fade out
      
      // Filter for digital harshness
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
      filter.Q.value = 5;
      
      // Connect nodes
      osc1.connect(filter);
      osc2.connect(filter);
      noise.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.sfxGain);
      
      // Play sound
      osc1.start(now);
      osc2.start(now);
      noise.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
      noise.stop(now + duration);
      
      return now + duration;
    };
  }
  
  // Play player damage sound
  playPlayerDamageSound() {
    if (this.sounds.playerDamage) return this.sounds.playerDamage();
    return this.playCombatCue('damage');
  }

  // Create synthetic whoosh sound fallback
  createWhooshFallback() {
    return () => {
      const now = this.context.currentTime;
      const duration = 0.8; // 800ms whoosh
      
      // Create white noise for whoosh effect
      const bufferSize = this.context.sampleRate * duration;
      const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      
      for (let i = 0; i < bufferSize; i++) {
        noiseData[i] = (Math.random() - 0.5) * 2;
      }
      
      // Create noise source
      const noiseSource = this.context.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      
      // Create filter for whoosh character
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1000;
      filter.Q.value = 2;
      
      // Create envelope for whoosh shape
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(0.4, now + 0.1); // Quick attack
      envelope.gain.exponentialRampToValueAtTime(0.3, now + 0.4); // Slight dip
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration); // Fade out
      
      // Connect nodes
      noiseSource.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.sfxGain);
      
      // Play sound
      noiseSource.start(now);
      noiseSource.stop(now + duration);
      
      return now + duration;
    };
  }

  // Load title screen music
  async loadTitleScreenMusic() {
    const titleScreenUrl = './assets/standalone/audio-21dd0b0c-3f5f-4d57-92a8-dc8b7b01be03.mp3';
    
    console.log('🎵 Loading title screen music...');
    console.log(`🎵 Attempting to load title screen music from: ${titleScreenUrl}`);
    
    // Create timeout with proper Promise.race pattern
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Audio loading timeout')), 10000);
    });
    
    try {
      // Race between fetch and timeout
      await Promise.race([this.fetchTitleScreenMusic(titleScreenUrl), timeoutPromise]);
    } catch (error) {
      // Handle timeout gracefully
      if (error?.message && error.message.includes('timeout')) {
        console.log('⚠️ Title screen music loading timeout - will proceed without it');
        this.titleScreenMusic = null;
      } else {
        console.error('❌ Error loading title screen music:', error?.message || error?.toString() || 'Unknown error');
        console.error('❌ Error details:', error);
        this.titleScreenMusic = null;
      }
    }
  }
  
  // Helper method for fetching title screen music
  async fetchTitleScreenMusic(titleScreenUrl) {
    // First try HEAD request to check availability
    console.log('🎵 Step 1: Checking title screen music URL availability with HEAD request...');
    const response = await fetch(titleScreenUrl, { method: 'HEAD' });
    
    if (response.ok) {
      console.log('🎵 Step 2: Title screen music URL available, fetching full audio data...');
      const fullResponse = await fetch(titleScreenUrl);
      
      if (!fullResponse.ok) {
        throw new Error(`Full fetch failed with status: ${fullResponse.status}`);
      }
      
      console.log('🎵 Step 3: Converting title screen music to array buffer...');
      const arrayBuffer = await fullResponse.arrayBuffer();
      
      console.log(`🎵 Step 4: Decoding title screen music audio data (${arrayBuffer.byteLength} bytes)...`);
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      
      console.log(`🎵 Step 5: Title screen music audio decoded successfully - duration: ${audioBuffer.duration.toFixed(2)}s`);
      
      this.titleScreenMusic = {
        buffer: audioBuffer,
        source: null,
        gain: null,
        isLoaded: true
      };
      
      console.log('✅ Title screen music loaded successfully!');
      console.log('✅ Duration:', audioBuffer.duration.toFixed(2), 'seconds');
      console.log('✅ Sample rate:', audioBuffer.sampleRate, 'Hz');
      console.log('✅ Channels:', audioBuffer.numberOfChannels);
    } else {
      console.error(`❌ Title screen music not available (HTTP ${response.status})`);
      console.error(`❌ Response headers:`, response.headers);
      this.titleScreenMusic = null;
    }
  }
  
  // Play title screen music
  playTitleScreenMusic() {
    console.log('🎵 playTitleScreenMusic called - boot sequence complete');
    console.log('🎵 Audio system status check:');
    console.log('  - initialized:', this.initialized);
    console.log('  - context exists:', !!this.context);
    console.log('  - context state:', this.context?.state || 'no context');
    console.log('  - titleScreenMusic exists:', !!this.titleScreenMusic);
    console.log('  - titleScreenMusic.isLoaded:', this.titleScreenMusic?.isLoaded);
    
    // CRITICAL FIX: Be more permissive with checks - the boot loader timing can be tight
    // Allow playback even if some checks are borderline, as long as we have the essentials
    
    // Check if context exists and is usable
    if (!this.context) {
      console.log('🎵 Audio context not available - cannot play title music');
      return;
    }
    
    // Resume context if needed
    if (this.context.state === 'suspended') {
      console.log('🎵 Resuming audio context for title music...');
      this.context.resume().then(() => {
        console.log('🎵 Audio context resumed, retrying title music play...');
        setTimeout(() => this.playTitleScreenMusic(), 100);
      }).catch(error => {
        console.error('🎵 Failed to resume audio context:', error?.message || error);
      });
      return;
    }
    
    // Check if title music is loaded - be more permissive here
    if (!this.titleScreenMusic || !this.titleScreenMusic.isLoaded) {
      console.log('🎵 Title screen music not loaded - will retry in 2000ms');
      console.log('🎵 titleScreenMusic object:', this.titleScreenMusic);
      // CRITICAL FIX: Auto-retry with longer delay instead of giving up
      setTimeout(() => this.playTitleScreenMusic(), 2000);
      return;
    }
    
    console.log('🎵 All checks passed - starting title screen music after boot sequence complete');
    
    try {
      // Stop any existing music first
      this.stopTitleScreenMusic();
      
      // Create gain and source
      this.titleScreenMusic.gain = this.context.createGain();
      this.titleScreenMusic.gain.gain.value = 0.8;
      
      this.titleScreenMusic.source = this.context.createBufferSource();
      this.titleScreenMusic.source.buffer = this.titleScreenMusic.buffer;
      this.titleScreenMusic.source.loop = true;
      
      // Connect and play
      this.titleScreenMusic.source.connect(this.titleScreenMusic.gain);
      this.titleScreenMusic.gain.connect(this.musicVolumeGain || this.masterGain);
      this.titleScreenMusic.source.start(0);
      
      console.log('🎵 Title screen music started successfully after boot!');
      console.log('🎵 Music source:', !!this.titleScreenMusic.source);
      console.log('🎵 Music gain:', !!this.titleScreenMusic.gain);
      console.log('🎵 Music gain value:', this.titleScreenMusic.gain.gain.value);
    } catch (error) {
      console.error('🎵 Error playing title screen music:', error?.message || error);
      console.error('🎵 Error stack:', error?.stack || 'No stack available');
      // CRITICAL FIX: Retry on error with longer delay instead of giving up
      setTimeout(() => this.playTitleScreenMusic(), 2000);
    }
  }
  
  // Helper method for fetching cutscene music
  async fetchCutsceneMusic(cutsceneUrl) {
    // First try HEAD request to check availability
    console.log('🎬 Step 1: Checking URL availability with HEAD request...');
    const response = await fetch(cutsceneUrl, { method: 'HEAD' });
    
    if (response.ok) {
      console.log('🎬 Step 2: URL available, fetching full audio data...');
      const fullResponse = await fetch(cutsceneUrl);
      
      if (!fullResponse.ok) {
        throw new Error(`Full fetch failed with status: ${fullResponse.status}`);
      }
      
      console.log('🎬 Step 3: Converting to array buffer...');
      const arrayBuffer = await fullResponse.arrayBuffer();
      
      console.log(`🎬 Step 4: Decoding audio data (${arrayBuffer.byteLength} bytes)...`);
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      
      console.log(`🎬 Step 5: Audio decoded successfully - duration: ${audioBuffer.duration.toFixed(2)}s`);
      
      this.cutsceneMusic = {
        buffer: audioBuffer,
        isLoaded: true
      };
      
      console.log('✅ Cutscene music loaded successfully!');
      console.log('✅ Duration:', audioBuffer.duration.toFixed(2), 'seconds');
      console.log('✅ Sample rate:', audioBuffer.sampleRate, 'Hz');
      console.log('✅ Channels:', audioBuffer.numberOfChannels);
    } else {
      console.error(`❌ Cutscene music not available (HTTP ${response.status})`);
      console.error(`❌ Response headers:`, response.headers);
      this.cutsceneMusic = null;
    }
  }
  
  // Stop title screen music
  stopTitleScreenMusic() {
    if (this.titleScreenMusic && this.titleScreenMusic.source) {
      try {
        this.titleScreenMusic.source.stop();
        this.titleScreenMusic.source = null;
        this.titleScreenMusic.gain = null;
      } catch (error) {
        console.log('Error stopping title screen music:', error);
      }
    }
    
    console.log('🎵 Title screen music stopped');
  }
  
  // Load cutscene music
  async loadCutsceneMusic() {
    const cutsceneUrl = './assets/standalone/audio-ad312365-af12-4019-a3f5-6ef3841ba959.mp3';
    
    console.log('🎬 Loading cutscene music...');
    console.log(`🎬 Attempting to load from: ${cutsceneUrl}`);
    
    // Create timeout with proper Promise.race pattern
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Cutscene audio loading timeout')), 10000);
    });
    
    try {
      // Race between fetch and timeout
      await Promise.race([this.fetchCutsceneMusic(cutsceneUrl), timeoutPromise]);
    } catch (error) {
      // Handle timeout gracefully
      if (error?.message && error.message.includes('timeout')) {
        console.log('⚠️ Cutscene music loading timeout - will proceed without it');
        this.cutsceneMusic = null;
      } else {
        console.error('❌ Error loading cutscene music:', error?.message || error?.toString() || 'Unknown error');
        console.error('❌ Error details:', error);
        this.cutsceneMusic = null;
      }
    }
  }
  
  getActiveMusicProfile() {
    return window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive();
  }

  getConfiguredSources(profile) {
    return profile && profile.arrangement && Array.isArray(profile.arrangement.sources) ? profile.arrangement.sources : [];
  }

  prepareActiveMusicProfile() {
    const profile = this.getActiveMusicProfile();
    const profileKey = profile && profile.profileId ? profile.profileId : 'missing-profile-selection';
    if (this.activeProfilePreparationInFlight && this.activeProfilePreparationKey === profileKey) return this.activeProfilePreparationInFlight;
    this.activeProfilePreparationKey = profileKey;
    this.activeProfilePreparationInFlight = (async () => {
      if (!profile) return { ok: false, reason: 'missing-profile-selection' };
      const sources = this.getConfiguredSources(profile);
      if (!sources.length) return { ok: false, reason: 'missing-profile-sources', profileId: profile.profileId };
      const failures = await this.loadMusicTracks();
      if (profile.profileId === 'level-02.proof' && failures.length) {
        return { ok: false, reason: 'source-load-failed', profileId: profile.profileId, failures };
      }
      for (const source of sources) {
        const existing = this.musicTracks[source.sourceId];
        if ((!existing || !existing.buffer) && profile.profileId !== 'level-02.proof') {
          const fallback = this.createFallbackMusic(source.sourceId);
          if (fallback && fallback.buffer) this.musicTracks[source.sourceId] = fallback;
        }
      }
      const missingRequired = sources.filter(source => source.required && !(this.musicTracks[source.sourceId] && this.musicTracks[source.sourceId].buffer));
      if (missingRequired.length) {
        return { ok: false, reason: 'missing-required-source', profileId: profile.profileId, missing: missingRequired.map(source => source.sourceId) };
      }
      return { ok: true, profileId: profile.profileId, preparedSources: sources.map(source => source.sourceId) };
    })().finally(() => { this.activeProfilePreparationInFlight = null; this.activeProfilePreparationKey = null; });
    return this.activeProfilePreparationInFlight;
  }

  getOrCreateAssetPromise(assetId, loader) {
    if (!assetId) return loader();
    if (this.assetLoadPromises[assetId]) return this.assetLoadPromises[assetId];
    const started = Date.now();
    this.assetLoadPromises[assetId] = Promise.resolve().then(loader).then(result => {
      if (!this.assetLoadDiagnostics[assetId]) {
        this.assetLoadDiagnostics[assetId] = true;
        console.log(`[asset-load] ${assetId} loaded in ${Date.now() - started}ms`);
      }
      return result;
    }).catch(error => {
      delete this.assetLoadPromises[assetId];
      if (!this.assetLoadDiagnostics[assetId]) {
        this.assetLoadDiagnostics[assetId] = true;
        console.warn(`[asset-load] ${assetId} failed in ${Date.now() - started}ms: ${error?.message || error}`);
      }
      throw error;
    });
    return this.assetLoadPromises[assetId];
  }

  startBackgroundRhythmIfTransportRunning(startResult) {
    if (!startResult || !startResult.transport || startResult.transport.status !== 'ok' || !startResult.transport.running) return false;
    if (window.rhythmSystem && typeof window.rhythmSystem.startBackgroundRhythm === 'function') {
      window.rhythmSystem.startBackgroundRhythm();
      return true;
    }
    return false;
  }

  // Load music tracks
  async loadMusicTracks() {
    const profile = this.getActiveMusicProfile();
    if (!profile) {
      console.warn('No exact music profile selected; music loading is degraded and will not fall back to Level 1.');
      return [];
    }
    const trackUrls = {};
    profile.arrangement.sources.forEach(source => {
      if (source.url) trackUrls[source.sourceId] = source.url;
    });
    
    const loadTrack = async ([name, url]) => {
      let trackLoaded = false;
      let failure = null;
      
      // The road's four full-length MP3 parts need a larger load/decode budget
      // than the existing short profiles, especially on the first mobile visit.
      const roadProfile = profile.profileId === 'level-02.proof';
      const loadTimeoutMs = roadProfile ? 45000 : 8000;
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Music track ${name} loading timeout`)), loadTimeoutMs);
      });
      
      try {
        // Race between fetch and timeout
        const source = this.getConfiguredSources(profile).find(item => item.sourceId === name);
        const track = await Promise.race([this.getOrCreateAssetPromise(source && source.assetId || `audio.level-01.${name}`,
          () => this.fetchMusicTrack(name, url, source?.backupUrl, roadProfile ? 187.5 : null)), timeoutPromise]);
        if (!track?.buffer) throw new Error(`Decoded track ${name} unavailable`);
        this.musicTracks[name] = track;
        trackLoaded = true;
      } catch (error) {
        failure = { sourceId: name, reason: error?.message || String(error) };
        if (error?.message && error.message.includes('timeout')) {
          console.warn(`⚠️ Music track ${name} loading timeout${roadProfile ? '' : ' - creating fallback'}`);
        } else {
          console.warn(`Network error loading track ${name}${roadProfile ? '' : ', creating fallback'}:`, error?.message || 'Network error');
        }
      } finally {
        clearTimeout(timeoutId);
      }
      
      // Older profiles retain their synthetic fallback; the road requires the owner stems.
      if (!trackLoaded && !roadProfile) {
        try {
          const fallback = this.createFallbackMusic(name);
          if (fallback) {
            this.musicTracks[name] = fallback;
            console.log(`✓ Created fallback for track ${name}`);
          } else {
            console.error(`Failed to create fallback for track ${name}`);
          }
        } catch (fallbackError) {
          console.error(`Critical error creating fallback for ${name}:`, fallbackError?.message || fallbackError?.toString() || 'Unknown error');
        }
      }
      return failure;
    };
    const entries = Object.entries(trackUrls);
    if (profile.profileId === 'level-02.proof') {
      // The four full-song stems are independent fetches; load them together
      // and start them only after every decode is ready on the same clock.
      return (await Promise.all(entries.map(loadTrack))).filter(Boolean);
    } else {
      for (const entry of entries) await loadTrack(entry);
      return [];
    }
  }
  
  // Helper method for fetching individual music tracks
  async fetchMusicTrack(name, url, backupUrl, expectedDurationSec) {
    let lastError;
    for (const candidate of [url, backupUrl].filter(Boolean)) {
      try {
        // Preview hosts may reject HEAD while serving the actual GET.
        const response = await fetch(candidate);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const audioBuffer = await this.context.decodeAudioData(await response.arrayBuffer());
        if (!audioBuffer || !Number.isFinite(audioBuffer.duration) || audioBuffer.duration <= 0 ||
            expectedDurationSec != null && Math.abs(audioBuffer.duration - expectedDurationSec) > 0.08)
          throw new Error(`decoded duration ${audioBuffer?.duration ?? 'unknown'}s`);
        console.log(`✓ Loaded music track: ${name}${candidate === backupUrl ? ' (published asset)' : ''}`);
        return { buffer: audioBuffer, source: null, startTime: 0, pauseTime: 0,
          isPlaying: false, volume: 1.0, gain: null, isFallback: false };
      } catch (error) {
        lastError = error;
        console.warn(`[audio-load] ${name} ${candidate === backupUrl ? 'published asset' : 'local asset'}: ${error?.message || error}`);
      }
    }
    throw new Error(`${name}: ${lastError?.message || 'audio unavailable'}`);
  }
  
  // Create synthetic fallback music for missing files
  createFallbackMusic(trackName) {
    const duration = trackName === 'fx-layer' ? 30 : 60; // Shorter for FX layer
    
    // Ensure context exists and system is initialized
    if (!this.context) {
      console.error('Audio context not available for fallback music');
      return null;
    }
    
    try {
      const sampleRate = this.context.sampleRate;
      
      // Create audio buffer with error handling
      const buffer = this.context.createBuffer(2, sampleRate * duration, sampleRate);
      
      // Generate different patterns for each track
      for (let channel = 0; channel < 2; channel++) {
        const channelData = buffer.getChannelData(channel);
        
        for (let i = 0; i < channelData.length; i++) {
          const t = i / sampleRate;
          let sample = 0;
          
          switch(trackName) {
            case 'foundation':
              // Ambient synth pads for foundation layer
              sample = (
                Math.sin(2 * Math.PI * 110 * t) * 0.1 + // Bass
                Math.sin(2 * Math.PI * 220 * t) * 0.05 + // Mid
                Math.sin(2 * Math.PI * 440 * t) * 0.03 // High
              ) * Math.sin(2 * Math.PI * 0.5 * t) * 0.3; // Slow modulation
              break;
              
            case 'bass-layer':
              // Driving beat pattern for bass layer
              const beatFreq = t % 2 < 1 ? 80 : 120; // Alternating bass
              sample = (
                Math.sin(2 * Math.PI * beatFreq * t) * 0.15 +
                Math.sin(2 * Math.PI * 440 * t) * 0.1 +
                Math.random() * 0.02 // Noise texture
              ) * 0.4;
              break;
              
            case 'fx-layer':
              // Atmospheric FX layer without drums to avoid conflicts
              sample = (
                Math.sin(2 * Math.PI * 440 * t) * 0.1 * Math.sin(2 * Math.PI * 0.25 * t) + // Modulated synth
                Math.sin(2 * Math.PI * 880 * t) * 0.05 + // Higher harmony
                Math.random() * 0.01 // Subtle noise texture
              ) * 0.2;
              break;
              
            default:
              // Default ambient pattern for unknown tracks
              sample = Math.sin(2 * Math.PI * 220 * t) * 0.1 * Math.sin(2 * Math.PI * 0.3 * t);
              break;
          }
          
          // Apply gentle limiting to prevent clipping
          channelData[i] = Math.max(-1, Math.min(1, sample));
        }
      }
      
      return {
        buffer: buffer,
        source: null,
        startTime: 0,
        pauseTime: 0,
        isPlaying: false,
        volume: 1.0,
        gain: null,
        isFallback: true,
        duration: duration
      };
      
    } catch (error) {
      console.error(`Failed to create fallback buffer for ${trackName}:`, error?.message || error?.toString() || 'Unknown error');
      return null;
    }
  }
  
  // Start foundation layer (now starts all layers simultaneously)
  startFoundationLayer() {
    console.log('startFoundationLayer called - starting all layers simultaneously');
    this.startAllLayersSimultaneously();
  }
  
  // Start all layers simultaneously and control via muting
  startAllLayers() {
    console.log('Audio: startAllLayers() called, using synchronized restart');
    
    if (!this.initialized) {
      console.log('Audio: Skipping startAllLayers - not initialized');
      return;
    }
    
    // Use improved synchronized method
    this.startAllLayersSimultaneously();
  }
  
  // Start all layers simultaneously
  startAllLayersSimultaneously() {
    if (!this.initialized) {
      console.log('Audio system not initialized - cannot start layers');
      this.musicStartState = { ok: false, reason: 'not-initialized' };
      return this.musicStartState;
    }

    if (this.layersStarted) {
      console.log('Layers already started simultaneously');
      return this.musicStartState.ok ? this.musicStartState : { ok: true, reason: 'already-started' };
    }

    const profile = this.getActiveMusicProfile();
    if (!profile) {
      console.error('[audio-startup] Missing music profile selection; cannot start synchronized layers or rhythm.');
      this.musicStartState = { ok: false, reason: 'missing-profile-selection' };
      return this.musicStartState;
    }

    const sources = this.getConfiguredSources(profile);
    if (!sources.length) {
      console.error(`[audio-startup] Music profile ${profile.profileId} has no configured sources.`);
      this.musicStartState = { ok: false, reason: 'missing-profile-sources', profileId: profile.profileId };
      return this.musicStartState;
    }

    const usableSources = sources.filter(source => this.musicTracks[source.sourceId] && this.musicTracks[source.sourceId].buffer);
    const missingRequired = sources.filter(source => source.required && !usableSources.some(usable => usable.sourceId === source.sourceId));
    if (missingRequired.length || usableSources.length === 0) {
      console.error(`[audio-startup] Missing required source for ${profile.profileId}: ${missingRequired.map(source => source.sourceId).join(', ') || 'no usable sources'}.`);
      this.musicStartState = { ok: false, reason: 'missing-required-source', profileId: profile.profileId };
      return this.musicStartState;
    }


    const transport = window.BARCODE && window.BARCODE.MusicTransport;
    if (!transport || typeof transport.start !== 'function') {
      console.error(`[audio-startup] MusicTransport unavailable for ${profile.profileId}; synchronized music/rhythm startup aborted.`);
      this.musicStartState = { ok: false, reason: 'transport-unavailable', profileId: profile.profileId };
      return this.musicStartState;
    }

    const syncTime = this.context.currentTime + 0.01;
    const sourceOffset = profile.profileId === 'level-02.proof' ?
      Math.min(187.49, Math.max(0, window.BARCODE?.CacheRoadProof?.startOffsetSec?.() || 0)) : 0;
    console.log('Creating perfectly synchronized layers...');
    console.log(`Sync time: ${syncTime}`);

    sources.forEach(sourceInfo => {
      const track = this.musicTracks[sourceInfo.sourceId];
      if (track && track.source) {
        try {
          track.source.stop();
        } catch (error) {
          console.log(`Error stopping source for ${sourceInfo.sourceId}:`, error);
        }
        track.source = null;
        track.isPlaying = false;
        track.gain = null;
      }
    });

    let scheduledCount = 0;
    usableSources.forEach(sourceInfo => {
      const track = this.musicTracks[sourceInfo.sourceId];
      const source = this.context.createBufferSource();
      source.buffer = track.buffer;
      source.loop = !!sourceInfo.nativeLoop;
      const layerGain = this.context.createGain();
      layerGain.gain.value = sourceInfo.gain;
      source.connect(layerGain);
      layerGain.connect(this.musicGain);
      source.start(syncTime, sourceOffset + (sourceInfo.offsetSec || 0));
      track.source = source;
      track.startTime = syncTime;
      track.gain = layerGain;
      track.isPlaying = true;
      track.volume = sourceInfo.gain;
      scheduledCount++;
      console.log(`Perfect sync start: ${sourceInfo.sourceId} at ${syncTime} with volume ${sourceInfo.gain}`);
    });

    if (scheduledCount < 1) {
      this.musicStartState = { ok: false, reason: 'no-scheduled-sources', profileId: profile.profileId };
      return this.musicStartState;
    }

    const transportResult = transport.start({ sourceAnchorAudioSec: syncTime,
      sourceOffsetTrackSec: sourceOffset + (profile.playback.startTrackSec || 0) });
    if (!transportResult || transportResult.status !== 'ok' || transportResult.running !== true) {
      console.error(`[audio-startup] MusicTransport failed to start for ${profile.profileId}: ${transportResult && transportResult.reason || 'not-running'}`);
      usableSources.forEach(sourceInfo => {
        const track = this.musicTracks[sourceInfo.sourceId];
        if (track && track.source) {
          try { track.source.stop(); } catch (error) { console.log(`Error stopping ${sourceInfo.sourceId}:`, error); }
          track.source = null;
          track.isPlaying = false;
          track.gain = null;
        }
      });
      this.musicStartState = { ok: false, reason: 'transport-start-failed', profileId: profile.profileId, transport: transportResult };
      return this.musicStartState;
    }

    this.layersStarted = true;
    this.musicStartState = { ok: true, reason: 'started', profileId: profile.profileId, scheduledCount, transport: transportResult };
    this.startLoopDetection();

    this.scheduleRuntimeTimeout(() => {
      this.updateLayers();
      console.log('Layer system activated after perfect synchronization');
    }, 100);

    return this.musicStartState;
  }
  
  // ========================================
  // MUSIC LOOP DETECTION SYSTEM
  // ========================================
  
  // Start automatic loop detection
  startLoopDetection() {
    // Clear any existing loop check
    if (this.loopCheckInterval) {
      clearInterval(this.loopCheckInterval);
    }
    
    // Calculate actual loop duration from track lengths
    this.calculateLoopDuration();
    
    // Start loop timer
    this.loopStartTime = this.context.currentTime;
    this.isLooping = false;
    
    console.log('🎵 Starting loop detection system');
    console.log(`🎵 Loop duration: ${this.loopDuration}s`);
    console.log(`🎵 Loop start time: ${this.loopStartTime}s`);
    
    // Check for loop completion every 500ms for more precise timing
    this.loopCheckInterval = setInterval(() => {
      this.checkLoopCompletion();
    }, 500);
  }
  
  // Calculate actual loop duration - use fixed 3 minutes and 31 seconds
  calculateLoopDuration() {
    // CRITICAL FIX: Use fixed duration of 3 minutes and 31 seconds (211 seconds)
    // This prevents premature restarts and ensures consistent timing
    const profile = window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive();
    const targetLoopDuration = profile && profile.playback.legacyManualRestartSec; // Level 1 legacy manual restart seconds
    
    let durationDetails = [];
    const layerNames = profile ? profile.arrangement.sources.map(source => source.sourceId) : [];
    layerNames.forEach(layerName => {
      const track = this.musicTracks[layerName];
      if (track && track.buffer && track.buffer.duration) {
        const duration = track.buffer.duration;
        console.log(`🎵 Track ${layerName} duration: ${duration.toFixed(3)}s`);
        durationDetails.push(`${layerName}: ${duration.toFixed(3)}s`);
      } else {
        console.log(`🎵 Track ${layerName}: No duration available`);
      }
    });
    
    // CRITICAL FIX: Use FIXED duration of 3 minutes and 31 seconds
    // This prevents random restarts and ensures music plays for the full intended duration
    this.loopDuration = targetLoopDuration;
    console.log(`🎵 LOOP DURATION DETAILS:`);
    console.log(`🎵 All track durations: [${durationDetails.join(', ')}]`);
    console.log(`🎵 Using FIXED duration: ${this.loopDuration}s (3 minutes and 31 seconds) for loop timing`);
    console.log(`🎵 Tracks will restart exactly every 3 minutes and 31 seconds`);
    console.log(`🎵 ENHANCED: Automatic music layers and rhythm beat counter reset every 3:31`);
  }
  
  // Check if current loop is complete and restart if needed
  checkLoopCompletion() {
    if (this.isLooping) {
      return; // Already in process of looping
    }
    
    // CRITICAL: Don't check loops if no layers are playing
    const activeProfile = window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive();
    const primarySource = activeProfile && activeProfile.arrangement.sources[0];
    if (!this.layersStarted || !primarySource || !this.musicTracks[primarySource.sourceId] || !this.musicTracks[primarySource.sourceId].isPlaying) {
      return; // No active profile source to loop
    }
    
    // CRITICAL FIX: Only restart when tracks have ACTUALLY completed their full duration
    // No more premature restarts - wait for natural loop completion
    const currentTime = this.context.currentTime;
    const elapsedSinceLoopStart = currentTime - this.loopStartTime;
    
    // CRITICAL: Only trigger restart when we've reached OR EXCEEDED the actual loop duration
    // This ensures tracks play through completely before restarting
    const shouldLoop = elapsedSinceLoopStart >= this.loopDuration;
    
    // Enhanced logging for 3:31 reset tracking
    const timeRemaining = Math.max(0, this.loopDuration - elapsedSinceLoopStart);
    if (timeRemaining > 0 && timeRemaining <= 10) {
      // Log countdown when less than 10 seconds remaining
      console.log(`🎵 3:31 LOOP COUNTDOWN: ${timeRemaining.toFixed(1)}s remaining until automatic reset`);
    }
    
    if (shouldLoop) {
      console.log(`🎵 3:31 LOOP TRIGGERED: ${elapsedSinceLoopStart.toFixed(2)}s elapsed (target: ${this.loopDuration.toFixed(1)}s)`);
      console.log('🎵 AUTOMATIC RESET: Music layers and rhythm beat counter will restart now');
      console.log('🎵 All tracks have completed full 3 minutes and 31 seconds - restarting ALL tracks simultaneously');
      this.restartMusicLoop();
    }
  }
  
  // Enhanced seamless loop restart for 3:31 automatic reset
  restartMusicLoop() {
    if (this.isLooping) {
      return; // Prevent duplicate restarts
    }
    
    this.isLooping = true;
    console.log('🎵 === 3:31 AUTOMATIC LOOP RESTART ===');
    console.log('🎵 Music layers and rhythm beat counter synchronized reset');
    
    // Step 1: Prepare and reset rhythm system beat counter immediately
    if (window.rhythmSystem) {
      console.log('🎵 Step 1: Preparing rhythm system for 3:31 loop restart');
      
      // Prepare rhythm system for the upcoming loop restart
      window.rhythmSystem.prepareForLoopRestart();
      console.log('🎵 Step 1a: Rhythm system prepared for loop restart');
      
      // Reset beat counter for seamless loop
      window.rhythmSystem.resetBeatCounter();
      console.log('🎵 Step 1b: Rhythm beat counter reset for seamless loop');
    }
    
    // Step 2: Pause all layers for 1 second
    const profile = this.getActiveMusicProfile();
    if (!profile) {
      console.error('[audio-startup] Missing music profile selection; music system start aborted.');
      this.musicStartState = { ok: false, reason: 'missing-profile-selection' };
      return this.musicStartState;
    }
    const layerNames = this.getConfiguredSources(profile).map(source => source.sourceId);
    
    // Fade out layers gradually
    layerNames.forEach(layerName => {
      const track = this.musicTracks[layerName];
      if (track && track.gain) {
        // Fade to 0 over 200ms
        track.gain.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.2);
      }
    });
    
    // Step 3: After fade, stop all layers and wait 1 second
    this.scheduleRuntimeTimeout(() => {
      layerNames.forEach(layerName => {
        const track = this.musicTracks[layerName];
        if (track && track.source) {
          try {
            track.source.stop();
            track.source = null;
            track.isPlaying = false;
            track.gain = null;
          } catch (error) {
            console.log(`Error stopping ${layerName}:`, error);
          }
        }
      });
      
      this.layersStarted = false;
      
      // Step 4: Wait 1 second, then restart all layers
      this.scheduleRuntimeTimeout(() => {
        console.log('🎵 Step 4: Restarting all layers simultaneously');
        
        const restartTime = this.context.currentTime + 0.01;
        
        // Restart all layers at the same time
        layerNames.forEach(layerName => {
          const track = this.musicTracks[layerName];
          if (!track || !track.buffer) {
            return;
          }
          
          const source = this.context.createBufferSource();
          source.buffer = track.buffer;
          const sourceProfile = profile && profile.arrangement.sources.find(source => source.sourceId === layerName);
          source.loop = sourceProfile ? sourceProfile.nativeLoop : false;
          
          const layerGain = this.context.createGain();
          const targetVolume = this.getCurrentLayerVolume(layerName);
          
          // Fade in from 0 to target volume
          layerGain.gain.value = 0;
          layerGain.gain.linearRampToValueAtTime(targetVolume, this.context.currentTime + 0.3);
          
          source.connect(layerGain);
          layerGain.connect(this.musicGain);
          source.start(restartTime, sourceProfile ? sourceProfile.offsetSec : 0);
          
          track.source = source;
          track.startTime = restartTime;
          track.gain = layerGain;
          track.isPlaying = true;
          track.volume = targetVolume;
        });
        
        this.layersStarted = true;
        this.loopStartTime = restartTime;
        if (window.BARCODE && window.BARCODE.MusicTransport) {
          window.BARCODE.MusicTransport.coordinatedRestart(restartTime);
        }
        
        // Step 5: Restart rhythm system completely for fresh 3:31 loop
        if (window.rhythmSystem && window.rhythmSystem.isRunning()) {
          console.log('🎵 Step 5: Restarting rhythm system for fresh 3:31 loop');
          
          // Restart rhythm system for new loop
          window.rhythmSystem.restartForLoop();
          console.log('🎵 Step 5a: Rhythm system restarted for new loop');
          
          // Restart beat sync with fresh timing
          this.beatSyncActive = true;
          this.syncBeatCount = 0;
          this.firstBeatTime = null;
          console.log('🎵 Step 5b: Beat sync will be pumped by the frame-owned transport polling');
        }
        
        this.isLooping = false;
        console.log('🎵 === SEAMLESS LOOP RESTART COMPLETE ===');
      });
    });
  }
  
  // Get current volume for a layer based on active state
  getCurrentLayerVolume(layerName) {
    const directed = window.BARCODE?.musicDirector?.getVolume(layerName);
    if (Number.isFinite(directed)) return directed;
    const activeLayers = this.determineActiveLayers();
    const shouldBeActive = activeLayers.includes(layerName);
    
    if (shouldBeActive) {
      return this.getLayerVolume(layerName);
    } else {
      return 0;
    }
  }
  
  // Play individual layer (for emergency fallback - prefers simultaneous start)
  playLayer(layerName, volume = 0.5) {
    if (!this.initialized) {
      console.log('Audio system not initialized - cannot play layer');
      return;
    }
    
    if (!this.context) {
      console.log('Audio context not available');
      return;
    }
    
    const track = this.musicTracks[layerName];
    if (!track) {
      console.log(`Music layer not available: ${layerName}`);
      return;
    }
    
    if (!track.buffer) {
      console.log(`Track ${layerName} has no audio buffer`);
      return;
    }
    
    // Don't restart if already playing at same volume
    if (track.source && track.isPlaying && track.gain && Math.abs(track.volume - volume) < 0.01) {
      console.log(`Audio: ${layerName} already playing at correct volume ${volume}`);
      return;
    }
    
    // If already playing but volume changed, just update volume
    if (track.source && track.isPlaying && track.gain) {
      console.log(`Audio: ${layerName} volume update - current: ${track.volume}, target: ${volume}`);
      this.rampAdaptiveStemGain(track, volume);
      return;
    }
    
    // For synchronization: try to sync with existing layers if they're playing
    let startTime = this.context.currentTime;
    
    // If other layers are already playing, try to sync this layer with the active profile's primary source.
    if (this.layersStarted) {
      const activeProfile = window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive();
      const primarySource = activeProfile && activeProfile.arrangement.sources[0];
      const primaryTrack = primarySource && this.musicTracks[primarySource.sourceId];
      if (primaryTrack && primaryTrack.isPlaying && primaryTrack.startTime) {
        // Calculate offset to sync with the profile primary layer.
        const elapsed = (this.context.currentTime - primaryTrack.startTime) % primaryTrack.buffer.duration;
        startTime = primaryTrack.startTime + elapsed;
        console.log(`Syncing ${layerName} with ${primarySource.sourceId} at offset ${elapsed}`);
      }
    }
    
    // Stop existing source if any
    if (track.source) {
      try {
        track.source.stop();
      } catch (error) {
        console.log('Error stopping existing source:', error);
      }
      track.source = null;
      track.isPlaying = false;
      track.gain = null; // Clear gain node when stopping
    }
    
    // Create new source
    const source = this.context.createBufferSource();
    source.buffer = track.buffer;
    const activeProfile = window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive();
    const sourceProfile = activeProfile && activeProfile.arrangement.sources.find(sourceInfo => sourceInfo.sourceId === layerName);
    source.loop = sourceProfile ? sourceProfile.nativeLoop : false;
    
    // Create individual gain for this layer
    const layerGain = this.context.createGain();
    layerGain.gain.value = 0;
    
    // Connect layer gain to music gain
    source.connect(layerGain);
    layerGain.connect(this.musicGain);
    
    try {
      source.start(startTime, sourceProfile ? sourceProfile.offsetSec : 0); // Start at profile-authored offset
      console.log(`Started music layer: ${layerName} at volume ${volume}, synced to time ${startTime}`);
    } catch (error) {
      console.error(`Failed to start music layer ${layerName}:`, error?.message || error?.toString() || 'Unknown error');
      return;
    }
    
    // Store layer info
    track.source = source;
    track.startTime = startTime;
    track.pauseTime = 0;
    track.isPlaying = true;
    track.gain = layerGain;
    track.volume = 0;
    this.rampAdaptiveStemGain(track, volume);
  }
  
  // Stop individual layer
  stopLayer(layerName) {
    const track = this.musicTracks[layerName];
    if (track && track.source) {
      const pauseTime = this.context.currentTime - track.startTime;
      track.pauseTime = pauseTime % track.buffer.duration;
      
      track.source.stop();
      track.source = null;
      track.isPlaying = false;
      track.gain = null; // Clear gain node when stopping
      
      console.log(`Stopped music layer: ${layerName}`);
    }
  }
  
  // Layer management based on game state
  updateLayers() {
    if (!this.initialized || !this.layersStarted) {
      return;
    }
    
    if (window.BARCODE?.musicDirector?.apply(this)) return;

    // CRITICAL: Pause music during cutscenes
    if (window.cutsceneSystem && typeof window.cutsceneSystem.isPlaying === 'function' && window.cutsceneSystem.isPlaying()) {
      // Mute all layers during cutscene
      const profile = window.BARCODE && window.BARCODE.MusicProfiles && window.BARCODE.MusicProfiles.getActive();
      const layerNames = profile ? profile.arrangement.sources.map(source => source.sourceId) : [];
      layerNames.forEach(layerName => {
        const track = this.musicTracks[layerName];
        if (track && track.gain && Math.abs((track.volume || 0) - 0) > 0.01) {
          this.rampAdaptiveStemGain(track, 0);
        }
      });
      return;
    }
    
    const activeLayers = this.determineActiveLayers();
    const availableLayers = Object.keys(this.musicTracks);
    
    // Update volumes instead of starting/stopping tracks (since they're already synchronized)
    availableLayers.forEach(layerName => {
      const shouldBeActive = activeLayers.includes(layerName);
      const track = this.musicTracks[layerName];
      
      if (!track || !track.isPlaying || !track.gain) {
        // Try to start layer if it doesn't exist
        if (layerName === 'bass-layer' && shouldBeActive) {
          console.log('Bass layer missing - attempting to start it');
          this.playLayer(layerName, this.getLayerVolume(layerName));
        }
        return;
      }
      
      const targetVolume = shouldBeActive ? this.getLayerVolume(layerName) : 0;
      
      // Only update if volume needs to change
      if (Math.abs(track.volume - targetVolume) > 0.01) {
        console.log(`Updating ${layerName} volume from ${track.volume} to ${targetVolume}`);
        this.rampAdaptiveStemGain(track, targetVolume);
      }
    });
  }
  
  // Determine which layers should be active
  determineActiveLayers() {
    const layers = ['foundation']; // Foundation always plays
    
    // Enemy detection - add bass layer if enemies present
    if (window.enemyManager) {
      const enemyCount = window.enemyManager.getActiveEnemies().length;
      if (this.layerLogState.enemyCount !== enemyCount) {
        this.layerLogState.enemyCount = enemyCount;
        console.log('Enemy detection - count:', enemyCount);
      }
      
      if (enemyCount > 0) {
        layers.push('bass-layer');

      }
    }
    
    // Rhythm mode - add FX layer for rhythm intensity
    if (window.rhythmSystem && window.rhythmSystem.isActive()) {
      layers.push('fx-layer');

    }
    
    // Hacking mode - add FX layer for hacking atmosphere
    if (window.hackingSystem && window.hackingSystem.isActive()) {
      layers.push('fx-layer');

    }
    
    const activeLayerKey = layers.join('|');
    if (this.layerLogState.activeLayers !== activeLayerKey) {
      this.layerLogState.activeLayers = activeLayerKey;
      console.log('Final active layers:', layers);
    }
    return layers;
  }
  
  // Get appropriate volume for layer based on context
  getLayerVolume(layerName) {
    const directed = window.BARCODE?.musicDirector?.getVolume(layerName);
    if (Number.isFinite(directed)) return directed;
    switch(layerName) {
      case 'foundation':
        return 0.4; // Foundation at lower volume as backbone
      case 'bass-layer':
        return 0.6; // Bass more prominent
      case 'fx-layer':
        return 0.8; // FX layer most prominent during rhythm
      default:
        return 0.5;
    }
  }
  
  // Update music based on game state
  updateMusicState(gameState) {
    this.updateLayers(); // Use new layered system instead of old track switching
  }
  
  // Update volume for existing layer
  updateLayerVolume(layerName, volume) {
    const track = this.musicTracks[layerName];
    if (!track) {
      console.log(`Cannot update volume for missing track: ${layerName}`);
      return;
    }
    
    // If track has no gain node, try to start it first
    if (!track.gain) {
      console.log(`Track ${layerName} has no gain node, attempting to start layer`);
      this.playLayer(layerName, volume);
      return;
    }
    
    if (!track.isPlaying) {
      console.log(`Track ${layerName} is not playing, attempting to start`);
      this.playLayer(layerName, volume);
      return;
    }
    
    this.rampAdaptiveStemGain(track, volume);
  }
  
  // Set layer volume (alias for updateLayerVolume)
  setLayerVolume(layerName, volume) {
    const track = this.musicTracks[layerName];
    if (!track) {
      console.log(`Cannot set volume for missing track: ${layerName}`);
      return;
    }
    
    // If track has no gain node, try to start it first
    if (!track.gain) {
      console.log(`Track ${layerName} has no gain node, attempting to start layer`);
      this.playLayer(layerName, volume);
      return;
    }
    
    if (!track.isPlaying) {
      console.log(`Track ${layerName} is not playing, attempting to start`);
      this.playLayer(layerName, volume);
      return;
    }
    
    this.rampAdaptiveStemGain(track, volume);
  }
  
  // Determine appropriate music state
  determineMusicState(gameState) {
    // Check highest priority states first
    if (window.rhythmSystem && window.rhythmSystem.isActive()) {
      return 'rhythm';
    }
    
    if (window.hackingSystem && window.hackingSystem.isActive()) {
      return 'tutorial'; // Use tutorial music for hacking too
    }
    
    if (window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive()) {
      return 'tutorial';
    }
    
    // Check combat state
    if (window.enemyManager) {
      const enemyCount = window.enemyManager.getActiveEnemies().length;
      const player = window.player;
      const inDanger = player && player.health < player.maxHealth * 0.5;
      
      if (enemyCount > 0 && (inDanger || enemyCount > 2)) {
        return 'combat';
      }
    }
    
    return 'exploration';
  }
  
  // Switch to appropriate track based on state
  switchToAppropriateTrack() {
    const trackMap = {
      'exploration': 'main-theme',
      'combat': 'combat-theme',
      'rhythm': 'rhythm-theme',
      'tutorial': 'main-theme' // Use main theme for tutorial/hacking
    };
    
    const targetTrack = trackMap[this.musicContext.state];
    
    if (targetTrack) {
      this.playMusicTrack(targetTrack, true);
    }
  }
  
  // Set music volume
  setMusicVolume(volume) {
    const bus = this.musicVolumeGain || this.musicGain;
    if (bus) {
      bus.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
  
  // Get current music state
  getMusicState() {
    return this.musicContext.state;
  }
  
  // Start music system (called after cutscenes complete)
  startMusicSystem() {
    if (!this.initialized) {
      console.log('Audio system not initialized - cannot start music');
      return;
    }
    
    // CRITICAL: Always restart tracks when startMusicSystem() is called
    // This ensures tracks restart from the beginning after cutscenes
    console.log('🎵 FORCING MUSIC RESTART - stopping existing layers and restarting from beginning');
    
    // Stop cutscene music when gameplay starts
    this.stopCutsceneMusic();
    
    // Force stop all existing layers first
    const profile = this.getActiveMusicProfile();
    if (!profile) {
      console.error('[audio-startup] Missing music profile selection; music system start aborted.');
      this.musicStartState = { ok: false, reason: 'missing-profile-selection' };
      return this.musicStartState;
    }
    const layerNames = this.getConfiguredSources(profile).map(source => source.sourceId);
    layerNames.forEach(layerName => {
      const track = this.musicTracks[layerName];
      if (track && track.source) {
        try {
          track.source.stop();
          track.source = null;
          track.isPlaying = false;
          track.gain = null;
          console.log(`🎵 Force stopped existing layer: ${layerName}`);
        } catch (error) {
          console.log(`Error stopping ${layerName}:`, error);
        }
      }
    });
    
    // Reset layersStarted to force fresh restart
    this.layersStarted = false;
    
    // Reset loop timing to start fresh
    this.loopStartTime = this.context.currentTime;
    
    console.log('🎵 Starting music system with FRESH RESTART from beginning');
    const result = this.startAllLayersSimultaneously();
    if (!result || !result.ok) {
      console.error(`[audio-startup] Music system did not start: ${result && result.reason || 'unknown'}`);
    }
    return result;
  }
  
  // Play cutscene music
  playCutsceneMusic() {
    console.log('🎬 playCutsceneMusic called - checking conditions...');
    console.log('🎬 initialized:', this.initialized);
    console.log('🎬 cutsceneMusic exists:', !!this.cutsceneMusic);
    console.log('🎬 cutsceneMusic.isLoaded:', this.cutsceneMusic?.isLoaded);
    
    if (!this.initialized) {
      console.log('🎬 Cannot play cutscene music - audio system not initialized');
      return;
    }
    
    if (!this.cutsceneMusic) {
      console.log('🎬 Cannot play cutscene music - cutsceneMusic is null');
      return;
    }
    
    if (!this.cutsceneMusic.isLoaded) {
      console.log('🎬 Cannot play cutscene music - cutsceneMusic not loaded');
      return;
    }
    
    console.log('🎬 All checks passed - playing cutscene music');
    
    // Stop any existing cutscene music
    this.stopCutsceneMusic();
    
    // Create gain node for cutscene music
    this.cutsceneGain = this.context.createGain();
    this.cutsceneGain.gain.value = 0.6; // Moderate volume for cutscenes
    
    // Create and connect source
    this.cutsceneSource = this.context.createBufferSource();
    this.cutsceneSource.buffer = this.cutsceneMusic.buffer;
    this.cutsceneSource.loop = true;
    
    // Connect to master gain (bypass music gain since it's muted during cutscenes)
    this.cutsceneSource.connect(this.cutsceneGain);
    this.cutsceneGain.connect(this.musicVolumeGain || this.masterGain);
    
    // Start playing
    this.cutsceneSource.start(0);
    
    console.log('🎬 Playing cutscene music');
  }
  
  // Stop cutscene music
  stopCutsceneMusic() {
    if (this.cutsceneSource) {
      try {
        this.cutsceneSource.stop();
        this.cutsceneSource = null;
      } catch (error) {
        console.log('Error stopping cutscene music:', error);
      }
    }
    
    if (this.cutsceneGain) {
      this.cutsceneGain.disconnect();
      this.cutsceneGain = null;
    }
    
    console.log('🎬 Cutscene music stopped');
  }
  
  // Slowly fade out cutscene music from current volume
  slowFadeOutCutsceneMusic(fadeDuration = 12) {
    if (!this.cutsceneGain || !this.initialized) {
      console.log('🎬 Cannot fade - cutscene gain not available or system not initialized');
      return Promise.resolve();
    }
    
    const currentTime = this.context.currentTime;
    const currentVolume = this.cutsceneGain.gain.value;
    
    console.log(`🎬 Starting VERY SLOW fade out from ${currentVolume.toFixed(3)} to 0 over ${fadeDuration} seconds`);
    console.log(`🎬 Extended fade duration for intro music - more cinematic transition`);
    
    // Use exponential ramp for natural audio decay (very gradual)
    // Extended from 8s to 12s for smoother, more cinematic transition
    this.cutsceneGain.gain.exponentialRampToValueAtTime(0.001, currentTime + fadeDuration); // 0.001 instead of 0 to avoid audio issues
    
    return new Promise((resolve) => {
      this.scheduleRuntimeTimeout(() => {
        // Set to exactly 0 after the ramp completes
        if (this.cutsceneGain) {
          this.cutsceneGain.gain.value = 0;
        }
        console.log('🎬 VERY SLOW fade out complete - 12 second cinematic transition finished');
        resolve();
      }, fadeDuration * 1000);
    });
  }
  
  // Start layer beat sync for rhythm system
  startLayerBeatSync() {
    this.beatSyncActive = true;
    console.log('🎵 Beat sync armed; frame-owned rhythm update polls BARCODE.MusicTransport');
  }
  
  // Legacy recursive beat scheduling is disabled; transport polling owns beat boundaries.
  scheduleNextBeatSync() {
    return;
  }
  
  // Stop layer beat sync
  stopLayerBeatSync() {
    // Clear interval if exists (legacy support)
    if (this.layerBeatSyncInterval) {
      clearInterval(this.layerBeatSyncInterval);
      this.layerBeatSyncInterval = null;
    }
    
    // CRITICAL: Cancel the recursive scheduling
    this.beatSyncActive = false;
    this.syncBeatCount = 0; // Reset counter
    console.log('Stopped layer beat sync');
  }

  async pauseRuntimeAudio() {
    if (!this.context) return { ok: true, reason: 'no-context' };
    const transport = window.BARCODE && window.BARCODE.MusicTransport;
    const audioTime = this.context.currentTime;
    const wasBeatSyncActive = !!this.beatSyncActive;
    let transportPaused = false;

    try {
      if (transport && typeof transport.pause === 'function') {
        const pauseResult = transport.pause(audioTime);
        transportPaused = !!(pauseResult && pauseResult.status === 'ok');
      }
      this.stopBeatTrack();
      if (this.context.state === 'running' && typeof this.context.suspend === 'function') {
        await this.context.suspend();
      }
      return { ok: true, reason: 'paused', contextState: this.context.state };
    } catch (error) {
      if (transportPaused && transport && typeof transport.resume === 'function') {
        try { transport.resume(this.context.currentTime); } catch (resumeError) {}
      }
      if (wasBeatSyncActive) {
        this.startLayerBeatSync();
      }
      return { ok: false, reason: 'pause-failed-rolled-back', contextState: this.context.state, error: error && error.message || String(error) };
    }
  }

  async resumeRuntimeAudio() {
    if (!this.context) return { ok: true, reason: 'no-context' };
    try {
      if (this.context.state === 'suspended' && typeof this.context.resume === 'function') {
        await this.context.resume();
      }
      const transport = window.BARCODE && window.BARCODE.MusicTransport;
      if (transport && typeof transport.resume === 'function') {
        transport.resume(this.context.currentTime);
      }
      if (this.layersStarted) {
        this.startLayerBeatSync();
      }
      return { ok: true, reason: 'resumed', contextState: this.context.state };
    } catch (error) {
      return { ok: false, reason: 'resume-failed', contextState: this.context.state, error: error && error.message || String(error) };
    }
  }

  async prepareRestartAudio() {
    if (!this.context) return { ok: true, reason: 'no-context' };
    if (this.context.state === 'suspended' && typeof this.context.resume === 'function') {
      try {
        await this.context.resume();
      } catch (error) {
        return { ok: false, reason: 'context-resume-failed', contextState: this.context.state, error: error && error.message || String(error) };
      }
    }
    try {
      this.stopRuntimeAudio({ stopMusic: true });
    } catch (error) {
      return { ok: false, reason: 'runtime-audio-stop-failed', contextState: this.context.state, error: error && error.message || String(error) };
    }
    return { ok: true, reason: 'restart-audio-ready', contextState: this.context.state };
  }

  ensureLayerBeatSyncForTransport(startResult) {
    if (!startResult || !startResult.ok || !startResult.transport || startResult.transport.status !== 'ok' || startResult.transport.running !== true) {
      return { ok: false, reason: 'transport-not-running' };
    }
    this.startLayerBeatSync();
    return { ok: true, reason: 'beat-sync-armed', beatSyncActive: !!this.beatSyncActive };
  }

  startRuntimeGameplayMusic() {
    if (typeof this.startMusicSystem !== 'function') return { ok: false, reason: 'startMusicSystem-missing' };
    const result = this.startMusicSystem();
    if (result && result.ok && window.rhythmSystem && typeof window.rhythmSystem.resetForFreshRuntimeRestart === 'function') {
      window.rhythmSystem.resetForFreshRuntimeRestart(result.profileId);
    }
    if (result && result.ok && typeof this.ensureLayerBeatSyncForTransport === 'function') {
      const beatSyncResult = this.ensureLayerBeatSyncForTransport(result);
      if (!beatSyncResult.ok || this.beatSyncActive !== true) {
        return Object.assign({}, result, { ok: false, reason: 'beat-sync-not-armed', beatSync: beatSyncResult });
      }
    }
    if (result && result.ok && typeof this.startBackgroundRhythmIfTransportRunning === 'function') {
      this.startBackgroundRhythmIfTransportRunning(result);
    }
    return result;
  }

  stopRuntimeAudio(options) {
    options = options || {};
    this.runtimeAudioGeneration++;
    window.BARCODE?.musicDirector?.reset();
    this.resetRoadStumble();
    this.stopCombatCues();
    this.clearRuntimeTimeouts();
    this.stopBeatTrack();
    this.stopLayerBeatSync();
    if (this.loopCheckInterval) {
      clearInterval(this.loopCheckInterval);
      this.loopCheckInterval = null;
    }
    if (options.stopMusic !== false) {
      Object.keys(this.musicTracks || {}).forEach(trackId => {
        const track = this.musicTracks[trackId];
        if (track && track.source) {
          try { track.source.stop(); } catch (error) {}
          track.source = null;
          track.isPlaying = false;
          track.gain = null;
        }
      });
      this.layersStarted = false;
      if (window.BARCODE && window.BARCODE.MusicTransport && typeof window.BARCODE.MusicTransport.stop === 'function') {
        window.BARCODE.MusicTransport.stop();
      }
    }
    this.stopTitleScreenMusic();
    this.stopCutsceneMusic();
    return { ok: true, reason: 'stopped' };
  }

  getRuntimeDiagnostics() {
    const activeMusicSources = Object.keys(this.musicTracks || {}).filter(trackId => {
      const track = this.musicTracks[trackId];
      return !!(track && track.source && track.isPlaying);
    }).length;
    return {
      contextState: this.getContextState(),
      layersStarted: !!this.layersStarted,
      beatSyncActive: !!this.beatSyncActive,
      loopCheckActive: !!this.loopCheckInterval,
      beatSchedulerActive: !!this.beatScheduler,
      activeMusicSources,
      sfx: {
        initialized: this.initialized,
        masterGain: this.masterGain?.gain?.value ?? null,
        busGain: this.sfxGain?.gain?.value ?? null,
        activeVoices: this.combatVoices?.size || 0,
        roadEngineActive: !!this.roadEngine,
        roadEngineReleaseGraphs: this.roadEngineReleases?.size || 0,
        roadCueBuffers: this.roadCueBuffers?.size || 0,
        roadStats: this.roadSFXStats ? { ...this.roadSFXStats } : null,
        rhythmSounds: [...(this.rhythmSuccessSounds || [])],
        lastCue: this.lastSFXCue || null
      },
      runtimeAudioGeneration: this.runtimeAudioGeneration,
      ownedRuntimeTimeouts: this.runtimeTimeouts.size,
      cutsceneSourceActive: !!this.cutsceneSource,
      titleSourceActive: !!(this.titleScreenMusic && this.titleScreenMusic.source)
    };
  }
  
  // Check if initialized
  isInitialized() {
    return this.initialized;
  }

  // Get audio context state
  getContextState() {
    return this.context ? this.context.state : 'unavailable';
  }
};

// Create global audio system - wait for dependencies to be ready
function createAudioSystem() {
  // Prevent duplicate initialization
  if (window.audioSystem) {
    console.log('Audio system already exists, skipping duplicate creation');
    return;
  }
  
  if (window.AudioContext || window.webkitAudioContext) {
    window.audioSystem = new window.AudioSystem();
    console.log('Audio system created');
  } else {
    console.log('Web Audio API not available, audio system disabled');
  }
}

// Resume audio context on user interaction (fixes browser restrictions)
function setupAudioContextResume() {
  const resumeAudio = async () => {
    // Menu interaction cannot bypass the lifecycle's deliberate audio pause.
    if (window.isPaused || window.gameState?.paused) return;
    if (!window.audioSystem || !window.audioSystem.context) {
      return;
    }
    
    const context = window.audioSystem.context;
    
    // Check if context is suspended and resume it
    if (context.state === 'suspended') {
      try {
        await context.resume();
        console.log('✓ AudioContext resumed successfully by user interaction');
        
        // CRITICAL: DO NOT start music layers here - wait for cutscene to complete
        // Music will start via startMusicSystem() after cutscene intro
        console.log('🎵 AudioContext resumed - music will start after cutscene intro');
        
      } catch (error) {
        // Handle permission errors gracefully
        if (error.name === 'NotAllowedError' || error.message.includes('permission')) {
          console.log('AudioContext permission denied - audio will start on user interaction');
          return;
        }
        console.error('Failed to resume AudioContext:', error?.message || error);
      }
    } else {
      console.log('AudioContext already running, state:', context.state);
      
      // CRITICAL: DO NOT start music layers automatically
      // Music will start via startMusicSystem() after cutscene intro
      console.log('🎵 AudioContext running - music will start after cutscene intro');
    }
  };
  
  // Add multiple listeners to ensure audio starts
  const gameCanvas = document.getElementById('gameCanvas');
  if (gameCanvas) {
    gameCanvas.addEventListener('click', resumeAudio, { once: false });
    gameCanvas.addEventListener('mousedown', resumeAudio, { once: false });
    console.log('Added AudioContext resume handlers to game canvas');
  }
  
  // Add to document with multiple events
  document.addEventListener('click', resumeAudio, { once: false });
  document.addEventListener('keydown', resumeAudio, { once: false });
  document.addEventListener('mousedown', resumeAudio, { once: false });
  document.addEventListener('touchstart', resumeAudio, { once: false });
  
  // Also try to resume immediately after a short delay
  setTimeout(resumeAudio, 1000);
  setTimeout(resumeAudio, 2000);
  
  console.log('Multiple AudioContext resume handlers added - music will start after cutscene');
}

// Initialize audio system when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    createAudioSystem();
    setupAudioContextResume();
  });
} else {
  createAudioSystem();
  setupAudioContextResume();
}
