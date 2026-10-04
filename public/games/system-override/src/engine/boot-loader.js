// Boot Loader System - Terminal-style initialization screen
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/boot-loader.js',
  exports: ['BootLoader', 'bootLoader'],
  dependencies: []
});

window.BootLoader = class BootLoader {
  constructor() {
    this.element = null;
    this.isActive = false;
    this.loadingSteps = [];
    this.currentStep = 0;
    this.assetsLoaded = false;
    this.audioLoaded = false;
    this.spritesLoaded = false;
  }

  createBootScreen() {
    // Create terminal-style loading overlay
    this.element = document.createElement('div');
    this.element.id = 'bootLoader';
    this.element.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: #000000 !important;
      color: #00ff00 !important;
      font-family: 'Share Tech Mono', 'Courier New', monospace !important;
      font-size: 14px !important;
      z-index: 3000 !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
      align-items: flex-start !important;
      padding: 40px !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      line-height: 1.4 !important;
    `;

    // Terminal header
    const header = document.createElement('div');
    header.innerHTML = `
      <div style="color: #00ff00; margin-bottom: 20px;">
        <div style="color: #00ffff; font-weight: bold; font-size: 16px;">BARCODE: SYSTEM OVERRIDE v1.0</div>
        <div style="color: #00ff00; font-size: 12px; opacity: 0.8;">BOOT SEQUENCE INITIATED</div>
        <div style="color: #00ff00; font-size: 10px; opacity: 0.6;">====================</div>
      </div>
    `;
    this.element.appendChild(header);

    // Terminal output area
    this.terminalOutput = document.createElement('div');
    this.terminalOutput.id = 'terminalOutput';
    this.terminalOutput.style.cssText = `
      flex: 1;
      width: 100%;
      max-width: 800px;
      overflow-y: hidden;
      font-size: 12px;
      line-height: 1.6;
    `;
    this.element.appendChild(this.terminalOutput);

    // Add to body
    document.body.appendChild(this.element);
    this.isActive = true;

    // Create sound enable popup
    this.createSoundPopup();

    // Initialize loading steps
    this.initializeLoadingSteps();
  }

  initializeLoadingSteps() {
    this.loadingSteps = [
      { text: 'Initializing kernel...', type: 'system' },
      { text: 'Loading system modules...', type: 'system' },
      { text: 'Mounting file systems...', type: 'system' },
      { text: 'Establishing network protocols...', type: 'network' },
      { text: 'Initializing audio subsystem...', type: 'audio', check: () => this.audioLoaded },
      { text: 'Loading sprite assets...', type: 'sprites', check: () => this.spritesLoaded },
      { text: 'Calibrating rendering pipeline...', type: 'graphics' },
      { text: 'Synchronizing game state...', type: 'system' },
      { text: 'Boot sequence complete.', type: 'success' }
    ];
  }

  async startBootSequence() {
    if (!this.element) {
      this.createBootScreen();
    }

    // Clear any existing output
    this.terminalOutput.innerHTML = '';
    
    // Play initial boot sound
    this.playBootStartupSound();
    
    // Add initial power-on effect
    await this.delay(300);
    await this.typeLine('> POWER ON', 'system');
    await this.delay(200);
    
    // Type out boot steps with realistic timing
    for (let i = 0; i < this.loadingSteps.length; i++) {
      const step = this.loadingSteps[i];
      
      // Play step-specific sound effects
      if (step.type === 'system') {
        this.playSystemBeep();
      } else if (step.type === 'audio') {
        this.playAudioInitSound();
      } else if (step.type === 'sprites') {
        this.playLoadingSound();
      } else if (step.type === 'graphics') {
        this.playGraphicsBeep();
      }
      
      await this.typeLine(`> ${step.text}`, step.type);
      
      // Wait for async assets to load if this step requires it
      if (step.check) {
        await this.waitForAssetLoad(step.check, step.type);
        await this.typeLine(`  ✓ Complete`, 'success');
        
        // Play success sound for completed asset loading
        if (step.type === 'audio' || step.type === 'sprites') {
          this.playAssetLoadedSound();
        }
      } else {
        // Simulate processing time (faster boot)
        await this.delay(Math.random() * 400 + 100);
      }
      
      // Add some random code/output between major steps
      if (i < this.loadingSteps.length - 1 && Math.random() > 0.6) {
        await this.addRandomCodeOutput();
      }
    }

    // Final success message (faster)
    await this.delay(200);
    await this.typeLine('\n> System ready. Loading interface...', 'success');
    
    // Play completion sound
    this.playBootCompleteSound();
    
    // Transition to title screen (faster)
    await this.delay(500);
    this.transitionToTitleScreen();
  }

  async typeLine(text, type = 'normal') {
    const line = document.createElement('div');
    line.style.marginBottom = '2px';
    
    // Set color based on type
    const colors = {
      normal: '#00ff00',
      system: '#00ffff',
      network: '#ffff00',
      audio: '#ff00ff',
      sprites: '#00ffaa',
      graphics: '#ff8800',
      success: '#00ff00',
      warning: '#ffaa00',
      error: '#ff0000'
    };
    
    line.style.color = colors[type] || colors.normal;
    this.terminalOutput.appendChild(line);

    // Play typing sounds with character-specific effects
    let characterCount = 0;
    
    // Typing effect
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      line.textContent += char;
      
      // Auto-scroll to bottom
      this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
      
      characterCount++;
      
      // Play terminal beeps for certain characters
      if (char === '>' || char === '[' || char === ']' || char === '(' || char === ')') {
        this.playTerminalBeep(800, 0.05); // Higher pitch for brackets
      } else if (char === '.' && characterCount % 3 === 0) {
        this.playTerminalBeep(600, 0.03); // Occasional dots
      } else if (char === '✓') {
        this.playSuccessBeep(); // Success sound
      } else if (char === '⚠') {
        this.playGlitchSound(); // Warning glitch
      } else if (Math.random() > 0.95) {
        // Random character glitch effect (5% chance)
        this.playGlitchSound();
        
        // Visual glitch effect
        line.style.textShadow = '0 0 3px #ff0000';
        setTimeout(() => {
          line.style.textShadow = 'none';
        }, 100);
      } else if (Math.random() > 0.98) {
        // Very rare system error (2% chance)
        this.playErrorBuzz();
      }
      
      // Vary typing speed for realism (faster)
      const delay = Math.random() > 0.9 ? 50 : (Math.random() * 15 + 5);
      await this.delay(delay);
    }
  }

  async addRandomCodeOutput() {
    const codeSnippets = [
      '  [OK] Memory allocation: 64MB',
      '  [OK] CPU threads: 8 active',
      '  [OK] Display buffer: 1920x1080',
      '  [OK] Audio buffer: 44100Hz',
      '  [OK] Network latency: 12ms',
      '  [OK] Cache hit rate: 94.2%',
      '  [OK] Render pipeline: DirectX 11',
      '  [OK] Physics engine: Box2D v2.3',
      '  [OK] Shader compiler: GLSL 4.5',
      '  [OK] Texture compression: DXT5',
      '  [INFO] Loading asset package...',
      '  [INFO] Decompressing audio files...',
      '  [INFO] Optimizing sprite sheets...',
      '  [INFO] Calculating collision meshes...',
      '  [WARN] High memory usage detected',
      '  [INFO] Garbage collection scheduled',
      '  [OK] Particle system initialized',
      '  [OK] Pathfinding grid generated'
    ];

    const snippet = codeSnippets[Math.floor(Math.random() * codeSnippets.length)];
    await this.typeLine(snippet, 'normal');
  }

  async waitForAssetLoad(checkFunction, assetType) {
    const maxWaitTime = 15000; // 15 seconds max wait
    const checkInterval = 100;
    let elapsed = 0;

    while (!checkFunction() && elapsed < maxWaitTime) {
      await this.delay(checkInterval);
      elapsed += checkInterval;

      // Show progress dots every second
      if (elapsed % 1000 === 0) {
        const dots = '.'.repeat(Math.floor(elapsed / 1000) % 4);
        const lastLine = this.terminalOutput.lastElementChild;
        if (lastLine && !lastLine.textContent.includes('✓')) {
          const baseText = lastLine.textContent.replace(/\.*$/, '');
          lastLine.textContent = baseText + dots;
        }
      }
    }

    if (!checkFunction()) {
      // Timeout - show warning but continue gracefully
      await this.typeLine(`  ⚠ Timeout loading ${assetType} - using fallback`, 'warning');
    }
  }

  transitionToTitleScreen() {
    // Fade out terminal
    this.element.style.transition = 'opacity 1s ease-out';
    this.element.style.opacity = '0';

    // Remove the "CLICK FOR SOUND" popup when transitioning to title screen
    const soundPopup = document.getElementById('soundEnablePopup');
    if (soundPopup && soundPopup.parentNode) {
      soundPopup.style.transition = 'opacity 0.5s ease-out';
      soundPopup.style.opacity = '0';
      setTimeout(() => {
        if (soundPopup.parentNode) {
          soundPopup.parentNode.removeChild(soundPopup);
        }
      }, 500);
    }

    setTimeout(() => {
      // Remove boot screen
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.isActive = false;

      // Show title screen
      const startOverlay = document.getElementById('startOverlay');
      if (startOverlay) {
        startOverlay.style.display = 'flex';
        startOverlay.style.opacity = '0';
        
        // Fade in title screen
        setTimeout(() => {
          startOverlay.style.transition = 'opacity 1.5s ease-in';
          startOverlay.style.opacity = '1';
          
          // CRITICAL: Start title screen music with robust initialization logic
          console.log('🎵 Boot loader completed - starting title screen music...');
          
          // Start title screen music immediately when title screen appears
          setTimeout(() => {
            const startTitleScreenMusic = () => {
              console.log('🎵 Attempting to start title screen music...');
              
              if (!window.audioSystem) {
                console.warn('⚠️ Audio system not available - creating it now');
                if (window.AudioContext || window.webkitAudioContext) {
                  window.audioSystem = new window.AudioSystem();
                }
              }
              
              if (!window.audioSystem) {
                console.error('❌ Cannot create audio system - Web Audio API not supported');
                return;
              }
              
              // Initialize audio system if needed (no delays for faster boot)
              if (!window.audioSystem.isInitialized()) {
                console.log('🎵 Initializing audio system...');
                (window.initAudio ? window.initAudio() : window.audioSystem.init()).then(() => {
                  console.log('🎵 Audio system initialized, playing title music immediately...');
                  playTitleMusic(); // Remove delay for immediate playback
                }).catch(error => {
                  console.error('❌ Audio initialization failed:', error);
                  playTitleMusic(); // Try immediately even if failed
                });
              } else {
                playTitleMusic();
              }
              
              function playTitleMusic() {
                // Check if title screen music is blocked (game started)
                if (window.titleScreenMusicBlocked) {
                  console.log('🎵 Title screen music blocked - game has started');
                  return;
                }
                
                if (!window.audioSystem || !window.audioSystem.titleScreenMusic) {
                  console.log('🎵 Title screen music not loaded yet, trying to load it...');
                  if (window.audioSystem && typeof window.audioSystem.loadTitleScreenMusic === 'function') {
                    window.audioSystem.loadTitleScreenMusic().then(() => {
                      setTimeout(playTitleMusic, 1000);
                    }).catch(() => {
                      setTimeout(playTitleMusic, 2000);
                    });
                  }
                  return;
                }
                
                if (!window.audioSystem.titleScreenMusic.isLoaded) {
                  console.log('🎵 Title screen music still loading, trying to load now...');
                  if (window.audioSystem && typeof window.audioSystem.loadTitleScreenMusic === 'function') {
                    window.audioSystem.loadTitleScreenMusic().then(() => {
                      console.log('🎵 Title music loaded, playing immediately...');
                      playTitleMusic();
                    }).catch(() => {
                      console.log('🎵 Failed to load title music, trying anyway...');
                      playTitleMusic();
                    });
                  } else {
                    playTitleMusic(); // Try anyway
                  }
                  return;
                }
                
                try {
                  console.log('🎵 All checks passed - playing title screen music!');
                  window.audioSystem.playTitleScreenMusic();
                  console.log('🎵 Title screen music should now be playing!');
                } catch (error) {
                  console.error('❌ Failed to play title screen music:', error?.message || error);
                  // Try one more time after user interaction
                  document.addEventListener('click', function playOnClick() {
                    // Check if title screen music is blocked (game started)
                    if (window.titleScreenMusicBlocked) {
                      console.log('🎵 Title screen music blocked - game has started');
                      return;
                    }
                    
                    console.log('🎵 User interaction detected - retrying title music...');
                    try {
                      if (window.audioSystem && window.audioSystem.playTitleScreenMusic) {
                        window.audioSystem.playTitleScreenMusic();
                        document.removeEventListener('click', playOnClick);
                      }
                    } catch (e) {
                      console.error('Still failed:', e?.message || e);
                    }
                  }, { once: true });
                }
              }
            };
            
            startTitleScreenMusic();
          }, 100); // Reduced delay for immediate music start
        }, 100);
      }
    }, 1000);
  }

  createSoundPopup() {
    // Create the "CLICK FOR SOUND" popup
    const popup = document.createElement('div');
    popup.id = 'soundEnablePopup';
    popup.style.cssText = `
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      background: rgba(0, 0, 0, 0.9) !important;
      border: 2px solid #00ff00 !important;
      border-radius: 10px !important;
      padding: 20px 30px !important;
      color: #00ff00 !important;
      font-family: 'Share Tech Mono', 'Courier New', monospace !important;
      font-size: 16px !important;
      font-weight: bold !important;
      z-index: 3100 !important;
      cursor: pointer !important;
      text-align: center !important;
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.5) !important;
      animation: pulse 2s infinite !important;
      transition: all 0.3s ease !important;
    `;
    
    popup.innerHTML = 'CLICK FOR SOUND';
    
    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); }
        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
        100% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); }
      }
      
      #soundEnablePopup:hover {
        background: rgba(0, 255, 0, 0.1) !important;
        border-color: #00ffff !important;
        color: #00ffff !important;
        transform: translate(-50%, -50%) scale(1.1) !important;
      }
    `;
    document.head.appendChild(style);
    
    // Add click handler to enable audio and hide popup
    popup.addEventListener('click', () => {
      // Enable audio context
      if (window.AudioContext || window.webkitAudioContext) {
        if (!window.bootAudioContext) {
          window.bootAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume audio context if suspended
        if (window.bootAudioContext.state === 'suspended') {
          window.bootAudioContext.resume();
        }
      }
      
      // Also enable main audio system if available
      if (window.audioSystem && window.audioSystem.audioContext && window.audioSystem.audioContext.state === 'suspended') {
        window.audioSystem.audioContext.resume();
      }
      
      // Hide popup with fade effect
      popup.style.transition = 'opacity 0.5s ease-out';
      popup.style.opacity = '0';
      
      setTimeout(() => {
        if (popup.parentNode) {
          popup.parentNode.removeChild(popup);
        }
      }, 500);
      
      // Play a confirmation sound
      this.playTerminalBeep(1200, 0.1);
      setTimeout(() => this.playTerminalBeep(1600, 0.08), 100);
    });
    
    // Add to body
    document.body.appendChild(popup);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Boot sound effects using Web Audio API
  playTerminalBeep(frequency = 1000, volume = 0.1) {
    try {
      // Create audio context if not available
      if (!window.bootAudioContext) {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        if (window.AudioContext) {
          window.bootAudioContext = new window.AudioContext();
        }
      }
      
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      const duration = 0.05;
      
      // Create oscillator for beep
      const oscillator = window.bootAudioContext.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      
      // Create envelope
      const envelope = window.bootAudioContext.createGain();
      envelope.gain.setValueAtTime(volume, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Connect and play
      oscillator.connect(envelope);
      envelope.connect(window.bootAudioContext.destination);
      
      oscillator.start(now);
      oscillator.stop(now + duration);
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  playSuccessBeep() {
    try {
      if (!window.bootAudioContext) {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        if (window.AudioContext) {
          window.bootAudioContext = new window.AudioContext();
        }
      }
      
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      const duration = 0.2;
      
      // Create ascending beeps for success
      const frequencies = [800, 1000, 1200];
      
      frequencies.forEach((freq, i) => {
        const oscillator = window.bootAudioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;
        
        const envelope = window.bootAudioContext.createGain();
        const startTime = now + (i * 0.05);
        
        envelope.gain.setValueAtTime(0.15, startTime);
        envelope.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
        
        oscillator.connect(envelope);
        envelope.connect(window.bootAudioContext.destination);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.1);
      });
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  playGlitchSound() {
    try {
      if (!window.bootAudioContext) {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        if (window.AudioContext) {
          window.bootAudioContext = new window.AudioContext();
        }
      }
      
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      const duration = 0.1;
      
      // Create glitch effect with noise and distortion
      const noiseBuffer = window.bootAudioContext.createBuffer(1, window.bootAudioContext.sampleRate * duration, window.bootAudioContext.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() - 0.5) * 0.3;
      }
      
      const noise = window.bootAudioContext.createBufferSource();
      noise.buffer = noiseBuffer;
      
      // Filter for glitchy character
      const filter = window.bootAudioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 10;
      
      const envelope = window.bootAudioContext.createGain();
      envelope.gain.setValueAtTime(0.05, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      noise.connect(filter);
      filter.connect(envelope);
      envelope.connect(window.bootAudioContext.destination);
      
      noise.start(now);
      noise.stop(now + duration);
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  playErrorBuzz() {
    try {
      if (!window.bootAudioContext) {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        if (window.AudioContext) {
          window.bootAudioContext = new window.AudioContext();
        }
      }
      
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      const duration = 0.3;
      
      // Create low frequency buzz for errors
      const oscillator = window.bootAudioContext.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 100;
      
      const envelope = window.bootAudioContext.createGain();
      envelope.gain.setValueAtTime(0.1, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Add distortion
      const filter = window.bootAudioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      
      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(window.bootAudioContext.destination);
      
      oscillator.start(now);
      oscillator.stop(now + duration);
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  // Boot sequence sound effects
  playBootStartupSound() {
    try {
      if (!window.bootAudioContext) {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        if (window.AudioContext) {
          window.bootAudioContext = new window.AudioContext();
        }
      }
      
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      
      // Create power-on chord progression
      const frequencies = [220, 277.18, 329.63]; // A minor chord
      
      frequencies.forEach((freq, i) => {
        const oscillator = window.bootAudioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;
        
        const envelope = window.bootAudioContext.createGain();
        const startTime = now + (i * 0.1);
        
        envelope.gain.setValueAtTime(0, startTime);
        envelope.gain.linearRampToValueAtTime(0.15, startTime + 0.2);
        envelope.gain.exponentialRampToValueAtTime(0.01, startTime + 1.5);
        
        oscillator.connect(envelope);
        envelope.connect(window.bootAudioContext.destination);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 1.5);
      });
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  playSystemBeep() {
    this.playTerminalBeep(900, 0.04); // Mid-pitch system beep
  }

  playAudioInitSound() {
    try {
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      const duration = 0.15;
      
      // Create dual-tone audio initialization sound
      const osc1 = window.bootAudioContext.createOscillator();
      const osc2 = window.bootAudioContext.createOscillator();
      
      osc1.type = 'sine';
      osc1.frequency.value = 440;
      osc2.type = 'triangle';
      osc2.frequency.value = 880;
      
      const envelope = window.bootAudioContext.createGain();
      envelope.gain.setValueAtTime(0.08, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      osc1.connect(envelope);
      osc2.connect(envelope);
      envelope.connect(window.bootAudioContext.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  playLoadingSound() {
    try {
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      const duration = 0.2;
      
      // Create loading sound with descending tone
      const oscillator = window.bootAudioContext.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(600, now);
      oscillator.frequency.exponentialRampToValueAtTime(400, now + duration);
      
      const envelope = window.bootAudioContext.createGain();
      envelope.gain.setValueAtTime(0.06, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      oscillator.connect(envelope);
      envelope.connect(window.bootAudioContext.destination);
      
      oscillator.start(now);
      oscillator.stop(now + duration);
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  playGraphicsBeep() {
    try {
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      const duration = 0.1;
      
      // Create graphics initialization beep
      const oscillator = window.bootAudioContext.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = 1200;
      
      const envelope = window.bootAudioContext.createGain();
      envelope.gain.setValueAtTime(0.05, now);
      envelope.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      oscillator.connect(envelope);
      envelope.connect(window.bootAudioContext.destination);
      
      oscillator.start(now);
      oscillator.stop(now + duration);
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  playAssetLoadedSound() {
    // Short positive confirmation sound
    this.playTerminalBeep(1500, 0.03);
    setTimeout(() => this.playTerminalBeep(1800, 0.02), 50);
  }

  playBootCompleteSound() {
    try {
      if (!window.bootAudioContext) return;
      
      const now = window.bootAudioContext.currentTime;
      const duration = 0.8;
      
      // Create triumphant boot completion sound
      const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C major ascending arpeggio
      
      frequencies.forEach((freq, i) => {
        const oscillator = window.bootAudioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;
        
        const envelope = window.bootAudioContext.createGain();
        const startTime = now + (i * 0.1);
        
        envelope.gain.setValueAtTime(0, startTime);
        envelope.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        envelope.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
        
        oscillator.connect(envelope);
        envelope.connect(window.bootAudioContext.destination);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
      });
      
    } catch (error) {
      // Silently fail if audio not available
    }
  }

  // Asset loading status setters
  setAudioLoaded(loaded = true) {
    this.audioLoaded = loaded;
  }

  setSpritesLoaded(loaded = true) {
    this.spritesLoaded = loaded;
  }

  setAssetsLoaded(loaded = true) {
    this.assetsLoaded = loaded;
  }

  isActive() {
    return this.isActive;
  }

  // Force hide boot screen (for emergency cases)
  forceHide() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.isActive = false;
    
    // Show title screen immediately
    const startOverlay = document.getElementById('startOverlay');
    if (startOverlay) {
      startOverlay.style.display = 'flex';
      startOverlay.style.opacity = '1';
    }
  }
};

// Create global boot loader instance
window.bootLoader = new window.BootLoader();