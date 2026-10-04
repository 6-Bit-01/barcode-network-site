// Cyberpunk Title Screen System for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/title-screen.js',
  exports: ['TitleScreen', 'titleScreen'],
  dependencies: []
});

window.TitleScreen = class TitleScreen {
  constructor() {
    this.overlay = document.getElementById('startOverlay');
    this.backgroundImage = null;
    this.effects = [];
    this.scanlineOffset = 0;
    this.animationFrameHandle = null;
    this.hideTimeoutHandle = null;
    this.hideGeneration = 0;
    this.scanlineElement = null;
    this.glitchTimer = 0;
    this.textRevealTimer = 0;
    this.particleSystem = null;
    this.titleRevealed = false;
    this.subtitleRevealed = false;
    this.buttonRevealed = false;
    this.instructionsRevealed = false;
    this.init();
  }

  init() {
    this.setupBackgroundImage();
    this.createParticleSystem();
    this.startAnimationLoop();
    this.addEventListeners();
    
    // DO NOT start music here - let boot loader control it completely
    console.log('🎮 Title screen initialized - music will start after boot completes');
  }

  setupBackgroundImage() {
    // Create the background image element
    this.backgroundImage = document.createElement('div');
    this.backgroundImage.style.cssText = `
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-image: url('./assets/standalone/title-background.png') !important;
      background-size: cover !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      filter: brightness(0.7) contrast(1.2) saturate(1.3) !important;
      z-index: 0 !important;
      opacity: 0 !important;
      transition: opacity 2s ease-in-out !important;
    `;
    
    // Insert at the beginning of the overlay
    this.overlay.insertBefore(this.backgroundImage, this.overlay.firstChild);
    
    // Fade in the background image
    setTimeout(() => {
      this.backgroundImage.style.opacity = '1';
    }, 100);
  }

  createParticleSystem() {
    // Create digital rain/particle effect container
    this.particleSystem = document.createElement('div');
    this.particleSystem.style.cssText = `
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 1 !important;
      overflow: hidden !important;
    `;
    
    this.overlay.appendChild(this.particleSystem);
    
    // Create digital rain particles
    this.createDigitalRain();
  }

  createDigitalRain() {
    const columns = Math.floor(window.innerWidth / 20);
    
    for (let i = 0; i < columns; i++) {
      const column = document.createElement('div');
      column.style.cssText = `
        position: absolute !important;
        left: ${i * 20}px !important;
        top: -100px !important;
        width: 2px !important;
        height: 100px !important;
        background: linear-gradient(to bottom, transparent, #00ffff, transparent) !important;
        opacity: 0 !important;
        animation: digital-rain ${3 + Math.random() * 4}s linear infinite !important;
        animation-delay: ${Math.random() * 5}s !important;
        z-index: 1 !important;
      `;
      this.particleSystem.appendChild(column);
    }

    // Add digital rain animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes digital-rain {
        0% {
          top: -100px;
          opacity: 0;
        }
        10% {
          opacity: 0.8;
        }
        90% {
          opacity: 0.8;
        }
        100% {
          top: 100vh;
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  scheduleAnimationFrame() {
    if (this.animationFrameHandle !== null || this.overlay.classList.contains('hidden')) return;
    this.animationFrameHandle = requestAnimationFrame((timestamp) => this.animate(timestamp));
  }

  startAnimationLoop() {
    this.scheduleAnimationFrame();
  }

  stopAnimationLoop() {
    if (this.animationFrameHandle !== null) {
      cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = null;
    }
  }

  animate() {
    this.animationFrameHandle = null;
    if (this.overlay.classList.contains('hidden')) return;
    window.inputManager?.updateFrontend?.('title');
    // Update scanlines
    this.scanlineOffset += 2;
    if (this.scanlineOffset > 10) this.scanlineOffset = 0;

    // Update glitch timer
    this.glitchTimer++;
    
    // Text reveal sequence
    this.textRevealTimer++;
    
    // Reveal elements with cyberpunk timing
    if (this.textRevealTimer === 60 && !this.titleRevealed) {
      this.revealTitle();
    } else if (this.textRevealTimer === 120 && !this.subtitleRevealed) {
      this.revealSubtitle();
    } else if (this.textRevealTimer === 180 && !this.buttonRevealed) {
      this.revealButton();
    } else if (this.textRevealTimer === 240 && !this.instructionsRevealed) {
      this.revealInstructions();
    }

    // Apply random glitch effects
    if (this.glitchTimer > 180 && Math.random() < 0.02) {
      this.applyGlitchEffect();
      this.glitchTimer = 0;
    }

    // Apply scanline effect
    this.applyScanlineEffect();

    this.scheduleAnimationFrame();
  }

  revealTitle() {
    this.titleRevealed = true;
    const title = this.overlay.querySelector('.game-title');
    if (title) {
      title.style.opacity = '0';
      title.style.transform = 'translateY(50px) scale(0.8)';
      title.style.filter = 'blur(20px)';
      
      setTimeout(() => {
        title.style.transition = 'all 1.5s cubic-bezier(0.23, 1, 0.32, 1)';
        title.style.opacity = '1';
        title.style.transform = 'translateY(0) scale(1)';
        title.style.filter = 'blur(0)';
        title.style.textShadow = `
          0 0 20px #00ffff, 
          0 0 40px #00ffff,
          0 0 60px #ff00ff,
          0 0 80px #00ffff,
          0 0 100px #ff00ff
        `;
      }, 100);
    }
  }

  revealSubtitle() {
    this.subtitleRevealed = true;
    const subtitle = this.overlay.querySelector('.game-subtitle');
    if (subtitle) {
      subtitle.style.opacity = '0';
      subtitle.style.transform = 'translateX(-100px)';
      
      setTimeout(() => {
        subtitle.style.transition = 'all 1.2s ease-out';
        subtitle.style.opacity = '0.9';
        subtitle.style.transform = 'translateX(0)';
        subtitle.style.textShadow = '0 0 20px #ff00ff, 0 0 40px #ff00ff';
      }, 100);
    }
  }

  revealButton() {
    this.buttonRevealed = true;
    const button = this.overlay.querySelector('.start-button');
    if (button) {
      button.style.opacity = '0';
      button.style.transform = 'scale(0) rotate(180deg)';
      
      setTimeout(() => {
        button.style.transition = 'all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        button.style.opacity = '1';
        button.style.transform = 'scale(1) rotate(0deg)';
        
        // Add glow pulse to button
        this.addButtonGlow(button);
      }, 100);
    }
  }

  revealInstructions() {
    this.instructionsRevealed = true;
    const instructions = this.overlay.querySelector('.instructions');
    if (instructions) {
      instructions.style.opacity = '0';
      instructions.style.transform = 'translateY(30px)';
      
      setTimeout(() => {
        instructions.style.transition = 'all 1s ease-out';
        instructions.style.opacity = '1';
        instructions.style.transform = 'translateY(0)';
        instructions.style.boxShadow = '0 0 30px rgba(0,255,255,0.2)';
      }, 100);
    }
  }

  addButtonGlow(button) {
    // Removed pulsing glow effect that was creating random shapes
    // Keeping button functionality clean
  }

  applyScanlineEffect() {
    if (this.overlay.classList.contains('hidden')) return;

    if (!this.scanlineElement) {
      this.scanlineElement = document.createElement('div');
      this.scanlineElement.dataset.titleScanline = 'true';
      this.scanlineElement.style.cssText = `
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        height: 2px !important;
        background: linear-gradient(90deg, 
          transparent, 
          rgba(0,255,255,0.3), 
          transparent
        ) !important;
        z-index: 100 !important;
        pointer-events: none !important;
      `;
      this.overlay.appendChild(this.scanlineElement);
    }

    this.scanlineElement.style.top = `${this.scanlineOffset * 10}px`;
  }

  applyGlitchEffect() {
    if (!this.overlay.classList.contains('hidden')) {
      const originalTransform = this.overlay.style.transform || '';
      
      // Random glitch displacement
      const glitchX = (Math.random() - 0.5) * 10;
      const glitchY = (Math.random() - 0.5) * 10;
      const glitchRotate = (Math.random() - 0.5) * 2;
      
      this.overlay.style.transition = 'none';
      this.overlay.style.transform = `translate(${glitchX}px, ${glitchY}px) rotate(${glitchRotate}deg)`;
      this.overlay.style.filter = `hue-rotate(${Math.random() * 360}deg) saturate(2)`;
      
      // Random color channel shift effect
      if (Math.random() < 0.3) {
        const title = this.overlay.querySelector('.game-title');
        if (title) {
          const channels = ['red', 'green', 'blue'];
          const channel = channels[Math.floor(Math.random() * channels.length)];
          title.style.filter = `url(#${channel}-shift)`;
        }
      }
      
      // Restore normal state after brief glitch
      setTimeout(() => {
        this.overlay.style.transition = 'all 0.1s ease-out';
        this.overlay.style.transform = originalTransform || 'translate(0, 0) rotate(0deg)';
        this.overlay.style.filter = 'none';
        
        const title = this.overlay.querySelector('.game-title');
        if (title) {
          title.style.filter = 'none';
        }
      }, 50 + Math.random() * 100);
    }
  }

  addEventListeners() {
    // Add hover sound effect simulation
    const button = this.overlay.querySelector('.start-button');
    if (button) {
      button.addEventListener('mouseenter', () => {
        this.createHoverEffect(button);
      });
      
      button.addEventListener('click', () => {
        this.createClickEffect(button);
      });
    }

    // Add keyboard interaction sound effects
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.overlay.classList.contains('hidden')) {
        this.createClickEffect(button);
      }
    });
  }

  createHoverEffect(element) {
    // Create particles on hover
    for (let i = 0; i < 5; i++) {
      const particle = document.createElement('div');
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * rect.width;
      const y = rect.top + rect.height / 2 + (Math.random() - 0.5) * rect.height;
      
      particle.style.cssText = `
        position: fixed !important;
        left: ${x}px !important;
        top: ${y}px !important;
        width: 4px !important;
        height: 4px !important;
        background: #00ffff !important;
        border-radius: 50% !important;
        pointer-events: none !important;
        z-index: 10000 !important;
        animation: particle-burst 0.8s ease-out forwards !important;
      `;
      
      document.body.appendChild(particle);
      
      setTimeout(() => particle.remove(), 800);
    }

    // Add particle burst animation
    if (!document.querySelector('#particle-burst-style')) {
      const style = document.createElement('style');
      style.id = 'particle-burst-style';
      style.textContent = `
        @keyframes particle-burst {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(${(Math.random() - 0.5) * 100}px, ${(Math.random() - 0.5) * 100}px) scale(0);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  createClickEffect(element) {
    // Create screen shake effect only
    this.overlay.style.animation = 'screen-shake 0.3s ease-out';
    setTimeout(() => {
      this.overlay.style.animation = '';
    }, 300);

    // Add screen shake animation
    if (!document.querySelector('#screen-shake-style')) {
      const style = document.createElement('style');
      style.id = 'screen-shake-style';
      style.textContent = `
        @keyframes screen-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Start title screen music
  startTitleScreenMusic() {
    console.log('🎮 Starting title screen music...');
    
    // Initialize audio system if not already initialized
    if (!window.audioSystem) {
      console.log('🎮 Creating audio system...');
      if (window.AudioContext || window.webkitAudioContext) {
        window.audioSystem = new window.AudioSystem();
      }
    }
    
    // Initialize audio system
    if (window.audioSystem && !window.audioSystem.isInitialized()) {
      console.log('🎮 Initializing audio system...');
      (window.initAudio ? window.initAudio() : window.audioSystem.init()).then(() => {
        setTimeout(() => {
          if (window.audioSystem.titleScreenMusic && window.audioSystem.titleScreenMusic.isLoaded) {
            console.log('🎮 Playing title screen music!');
            window.audioSystem.playTitleScreenMusic();
          }
        }, 1000);
      }).catch(error => {
        console.error('🎮 Error initializing audio:', error);
      });
    } else if (window.audioSystem && window.audioSystem.titleScreenMusic && window.audioSystem.titleScreenMusic.isLoaded) {
      console.log('🎮 Audio already ready, playing title screen music!');
      window.audioSystem.playTitleScreenMusic();
    }
  }
  
  // Stop title screen music
  stopTitleScreenMusic() {
    console.log('🎮 Stopping title screen music...');
    
    if (window.audioSystem && window.audioSystem.titleScreenMusic) {
      window.audioSystem.stopTitleScreenMusic();
    }
  }

  // Hide title screen with effects
  hide() {
    console.log('🎮 HIDING TITLE SCREEN - STOPPING TITLE MUSIC NOW');
    
    // CRITICAL: Block any further title screen music attempts immediately
    window.titleScreenMusicBlocked = true;
    console.log('🎮 titleScreenMusicBlocked = true set immediately');
    
    // STOP title screen music IMMEDIATELY when hiding
    if (window.audioSystem) {
      console.log('🎮 STOPPING TITLE SCREEN MUSIC IMMEDIATELY');
      try {
        // Method 1: Stop title screen music
        window.audioSystem.stopTitleScreenMusic();
        console.log('🎮 stopTitleScreenMusic() called successfully');
        
        // Method 2: Force stop all title screen related audio nodes
        if (window.audioSystem.titleScreenSource) {
          try {
            window.audioSystem.titleScreenSource.stop();
            console.log('🎮 titleScreenSource.stop() called');
          } catch (e) {
            // Source may already be stopped
          }
        }
        
        // Method 3: Zero out title screen gain
        if (window.audioSystem.titleScreenGain) {
          window.audioSystem.titleScreenGain.gain.value = 0;
          console.log('🎮 titleScreenGain set to 0');
        }
        
        console.log('🎮 Title screen music stopped successfully');
      } catch (error) {
        console.warn('🎮 Error stopping title screen music:', error?.message || error);
      }
    } else {
      console.log('🎮 Audio system not available - cannot stop title music');
    }
    
    this.stopAnimationLoop();
    const hideGeneration = ++this.hideGeneration;
    if (this.hideTimeoutHandle !== null) {
      clearTimeout(this.hideTimeoutHandle);
      this.hideTimeoutHandle = null;
    }

    this.overlay.style.transition = 'all 1s ease-in-out';
    this.overlay.style.opacity = '0';
    this.overlay.style.transform = 'scale(1.2) rotate(5deg)';
    this.overlay.style.filter = 'blur(10px) brightness(1.5)';
    
    this.hideTimeoutHandle = setTimeout(() => {
      this.hideTimeoutHandle = null;
      if (hideGeneration !== this.hideGeneration) return;
      this.overlay.classList.add('hidden');
      this.overlay.style.transition = '';
      this.overlay.style.opacity = '';
      this.overlay.style.transform = '';
      this.overlay.style.filter = '';
      console.log('🎮 Title screen fully hidden');
    }, 1000);
  }

  // Show title screen with effects
  show() {
    this.hideGeneration++;
    if (this.hideTimeoutHandle !== null) {
      clearTimeout(this.hideTimeoutHandle);
      this.hideTimeoutHandle = null;
    }
    this.overlay.classList.remove('hidden');
    this.overlay.style.opacity = '0';
    this.overlay.style.transform = 'scale(0.8) rotate(-5deg)';
    this.overlay.style.filter = 'blur(10px)';
    
    setTimeout(() => {
      this.overlay.style.transition = 'all 1.5s cubic-bezier(0.23, 1, 0.32, 1)';
      this.overlay.style.opacity = '1';
      this.overlay.style.transform = 'scale(1) rotate(0deg)';
      this.overlay.style.filter = 'blur(0)';
      
      setTimeout(() => {
        this.overlay.style.transition = '';
      }, 1500);
    }, 100);

    // Restart text reveal sequence
    this.textRevealTimer = 0;
    this.titleRevealed = false;
    this.subtitleRevealed = false;
    this.buttonRevealed = false;
    this.instructionsRevealed = false;
    
    this.startAnimationLoop();

    // DO NOT auto-start music - let boot loader control it
    console.log('🎮 Title screen shown - music controlled by boot loader');
    
    // CRITICAL FIX: Do NOT call any music methods here
    // All title screen music is handled by the boot loader to prevent duplicates
  }
};

// Initialize title screen system
function createTitleScreen() {
  if (document.getElementById('startOverlay')) {
    window.titleScreen = new window.TitleScreen();
    console.log('✅ Cyberpunk Title Screen initialized');
  } else {
    console.warn('Title screen overlay not found, retrying...');
    setTimeout(createTitleScreen, 100);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createTitleScreen);
} else {
  createTitleScreen();
}
