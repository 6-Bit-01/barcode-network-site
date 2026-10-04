// Game initialization for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/game-initializer.js',
  exports: ['initAudio', 'initSprites', 'startGameInitialization'],
  dependencies: ['player', 'enemyManager', 'hackingSystem', 'rhythmSystem', 'initObjectives', 'tutorialSystem', 'initSector1Progression', 'initJammerIndicator', 'initLostData', 'initSpaceShips', 'initLore']
});

let initAudioInFlight = null;
let initSpritesInFlight = null;
let startGameInitializationInFlight = null;
let startGameInitializationComplete = false;

// Makko can supply its own sprites-manifest.json and preload that registry.
// Load the published game manifest explicitly, then identify all replacement clips.
const MODEL_SPRITE_MANIFEST_URL = './sprites-manifest.json';
const MODEL_SPRITE_ART_ROOT = './assets/sprites-v3/prepared/';
const RUN_SPRITE_ART_ROOT = './assets/level1-run-v2/';
const MODEL_SPRITE_CLIPS = {
  '6_bit_main': ['6_bit_idle_idle', '6_bit_jump_jump', '6_bit_walk_walk', '6_bit_r__h_mode_rhmode', '6_bit_run_run'],
  'virus_virus': ['virus_idle_idle'],
  'corrupted_corrupted': ['corrupted_idle_idle', 'corrupted_walk_walk'],
  'firewall_firewall': ['firewall_idle_idle', 'firewall_walk_walk', 'firewall_attack_default'],
  'broadcast_jammer_broadcastjammer': ['broadcast_jammer_idle_idle'],
  'sector_1_boss_sector1boss': ['sector_1_boss_idle_idle', 'sector_1_boss_attack_attack']
};

function hasCurrentModelSprites() {
  const engine = window.MakkoEngine;
  if (!engine?.isLoaded?.()) return false;
  const characters = engine.getManifest?.()?.characters;
  return Object.entries(MODEL_SPRITE_CLIPS).every(([character, clips]) => clips.every(clip => {
    const entry = characters?.[character]?.animations?.[clip];
    const artRoot = clip === '6_bit_run_run' ? RUN_SPRITE_ART_ROOT : MODEL_SPRITE_ART_ROOT;
    return entry?.image === artRoot + clip + '.webp' && entry?.json === artRoot + clip + '.json';
  }));
}

function ensureLevel01MusicProfileForAudio() {
  if (window.BARCODE && typeof window.BARCODE.ensureLevel01MusicProfileSelected === 'function') {
    return window.BARCODE.ensureLevel01MusicProfileSelected();
  }
  console.error('[music-profile] Level 1 profile initializer missing; cannot select level-01.main before audio loading.');
  return { ok: false, reason: 'initializer-missing', profileId: 'level-01.main' };
}

async function prepareLevel01MusicSources() {
  const selection = ensureLevel01MusicProfileForAudio();
  if (!selection || selection.ok === false) return selection;
  if (window.audioSystem && typeof window.audioSystem.prepareActiveMusicProfile === 'function') {
    return window.audioSystem.prepareActiveMusicProfile();
  }
  return { ok: true, reason: 'no-profile-preparer' };
}

// Initialize audio system first
async function performInitAudio(options = {}) {
  console.log('=== INITIALIZING AUDIO SYSTEM ===');
  
  if (!window.audioSystem) {
    console.log('Creating audio system...');
    if (window.AudioContext || window.webkitAudioContext) {
      window.audioSystem = new window.AudioSystem();
      console.log('Audio system created successfully');
    } else {
      console.error('Web Audio API not supported');
      return;
    }
  }
  
  if (!window.audioSystem) {
    console.log('Audio system not available - waiting for initialization...');
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (window.audioSystem && window.audioSystem.isInitialized()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    }).catch(error => {
      console.warn('Audio system initialization promise rejected:', error?.message || error);
    });
    
    if (!window.audioSystem || !window.audioSystem.isInitialized()) {
      console.log('Audio system failed to load after timeout');
      if (!window.audioSystem) {
        window.audioSystem = {
          isInitialized: () => false,
          musicTracks: {},
          updateVisualization: () => {},
          updateLayers: () => {}
        };
      }
      return;
    }
  }
  
  if (!window.audioSystem.musicTracks) {
    window.audioSystem.musicTracks = {};
    console.log('Created musicTracks object');
  }
  
  if (window.audioSystem.isInitialized()) {
    console.log('Audio system already initialized');
    if (options.profileId === 'level-01.main' || options.prepareLevel01 === true) return prepareLevel01MusicSources();
    return { ok: true, reason: 'base-audio-ready' };
  }
  
  console.log('=== INITIALIZING AUDIO SYSTEM ===');
  
  try {
    await window.audioSystem.init();
    if (options.profileId === 'level-01.main' || options.prepareLevel01 === true) {
      const prepResult = await prepareLevel01MusicSources();
      if (!prepResult || prepResult.ok === false) throw new Error(`Level 1 music source preparation failed: ${prepResult && prepResult.reason || 'unknown'}`);
    }
    console.log('✓ Audio system initialized successfully');
    console.log('✓ Audio context state:', window.audioSystem.getContextState());
    console.log('✓ Master gain value:', window.audioSystem.masterGain?.gain?.value || 'undefined');
    console.log('✓ Music gain value:', window.audioSystem.musicGain?.gain?.value || 'undefined');
    console.log('✓ Available music tracks:', Object.keys(window.audioSystem.musicTracks));
    
  } catch (error) {
    console.log('⚠️ Audio system initialization failed:', error);
    console.error('Error details:', error?.stack || 'No stack available');
  }
}

window.initAudio = function(options = {}) {
  if (window.audioSystem && window.audioSystem.isInitialized()) {
    console.log('Audio system already initialized');
    if (options.profileId === 'level-01.main' || options.prepareLevel01 === true) return prepareLevel01MusicSources();
    return Promise.resolve({ ok: true, reason: 'base-audio-ready' });
  }

  const wantsLevel01 = options.profileId === 'level-01.main' || options.prepareLevel01 === true;
  let startedNewInit = false;
  if (!initAudioInFlight) {
    startedNewInit = true;
    initAudioInFlight = performInitAudio(options).finally(() => {
      initAudioInFlight = null;
    });
  } else {
    console.log('Audio initialization already in progress - joining existing attempt');
  }

  if (wantsLevel01 && !startedNewInit) return initAudioInFlight.then(() => prepareLevel01MusicSources());
  return initAudioInFlight;
};

// Initialize sprite system with MakkoEngine
async function performInitSprites() {
  console.log('=== INITIALIZING SPRITE SYSTEM ===');
  
  try {
    if (!window.MakkoEngine) {
      console.warn('MakkoEngine not loaded - waiting...');
      await new Promise(resolve => setTimeout(resolve, 500)).catch(error => {
        console.warn('MakkoEngine loading promise rejected:', error?.message || error);
      });
      if (!window.MakkoEngine) {
        throw new Error('MakkoEngine not available after timeout');
      }
    }
    
    console.log('Loading sprites manifest...');
    
    // The recovered atlases need a cold-download allowance; clear the timer on completion.
    let spriteTimeout;
    const spriteTimeoutPromise = new Promise((_, reject) => {
      spriteTimeout = setTimeout(() => reject(new Error('Sprite loading timeout')), 60000);
    });
    
    const spriteLoadPromise = window.MakkoEngine.init(MODEL_SPRITE_MANIFEST_URL, {
      onProgress: (loaded, total) => {
        console.log(`Loading sprites: ${loaded}/${total}`);
      },
      onComplete: () => {
        console.log('✓ All sprites loaded successfully');
      },
      onError: (error) => {
        console.error('Sprite loading error:', error?.message || error?.toString() || 'Unknown error');
      }
    });
    
    try {
      // Race between sprite loading and timeout
      await Promise.race([spriteLoadPromise, spriteTimeoutPromise]);
    } catch (initError) {
      if (initError?.message && initError.message.includes('timeout')) {
        console.warn('⚠️ Sprite loading timeout - using fallback graphics');
        // Set up fallback graphics
        window.useFallbackGraphics = true;
        window.MakkoEngine = {
          isLoaded: () => false,
          sprite: () => null,
          has: () => false,
          getCharacters: () => [],
          init: async () => { throw new Error('MakkoEngine fallback - no real engine available'); }
        };
        return Promise.resolve(); // Continue with fallback graphics
      }
      throw initError;
    } finally {
      clearTimeout(spriteTimeout);
    }

    if (!hasCurrentModelSprites()) throw new Error('Published model sprite manifest was not installed');
    
    console.log('✓ MakkoEngine initialized successfully');
    console.log('Available characters:', window.MakkoEngine.getCharacters());
    
    // Verify character availability
    const characters = ['6_bit_main', 'virus_virus', 'corrupted_corrupted', 'firewall_firewall'];
    characters.forEach(charName => {
      if (window.MakkoEngine.has(charName)) {
        console.log(`✓ ${charName} character found`);
        const animations = window.MakkoEngine.getAnimations(charName);
        console.log(`${charName} animations:`, animations);
      } else {
        console.error(`❌ ${charName} character not found in manifest`);
      }
    });
    
    window.useFallbackGraphics = false;
    // Player construction can precede Start and clone Makko's old registry.
    // Rebind that existing player after the replacement templates are ready.
    if (window.player?.initSprite) await window.player.initSprite();
    
  } catch (error) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    
    // Only log as error if it's not a timeout
    if (!error?.message || !error.message.includes('timeout')) {
      console.error('❌ Failed to initialize MakkoEngine:', errorMessage);
      console.error('MakkoEngine error stack:', error?.stack || 'No stack available');
    }
    
    console.warn('Falling back to placeholder graphics');
    window.useFallbackGraphics = true;
    
    window.MakkoEngine = {
      isLoaded: () => false,
      sprite: () => null,
      has: () => false,
      getCharacters: () => [],
      init: async () => { throw new Error('MakkoEngine fallback - no real engine available'); }
    };
  }
  
  return Promise.resolve();
}

window.initSprites = function() {
  if (hasCurrentModelSprites()) {
    console.log('Sprite system already initialized');
    return Promise.resolve();
  }

  if (!initSpritesInFlight) {
    initSpritesInFlight = performInitSprites().finally(() => {
      initSpritesInFlight = null;
    });
  } else {
    console.log('Sprite initialization already in progress - joining existing attempt');
  }

  return initSpritesInFlight;
};

// New initialization function that starts from button
async function performStartGameInitialization() {
  console.log('=== INITIALIZING GAME SYSTEMS ===');
  
  // Enable debug hitbox visualization
  window.DEBUG_HITBOXES = true;
  console.log('✓ Debug hitboxes enabled');
  
  try {
    // Initialize sprites first
    console.log('Loading sprites...');
    await window.initSprites();
    console.log('✓ Sprite initialization complete');
    
    // Initialize space ship system
    console.log('Initializing space ship system...');
    window.initSpaceShips();
    console.log('✓ Space ship system initialized');
    
    // Initialize lore system
    console.log('Initializing lore system...');
    window.initLore();
    console.log('✓ Lore system initialized');
    
    // Initialize jammer indicator system
    console.log('Initializing jammer indicator system...');
    if (typeof window.initJammerIndicator === 'function') {
      const jammerIndicatorInitialized = window.initJammerIndicator();
      if (jammerIndicatorInitialized) {
        console.log('✓ Jammer indicator system initialized successfully');
      } else {
        console.warn('⚠️ Jammer indicator system initialization failed');
      }
    } else {
      console.warn('⚠️ initJammerIndicator function not found');
    }
    
    // FORCE INIT LOST DATA SYSTEM REGARDLESS OF PLAYER
    console.log('🔥 FORCE INITIALIZING LOST DATA SYSTEM...');
    try {
      window.initLostData(window.player || null);
      console.log('✅ Lost data system FORCE initialized');
    } catch (error) {
      console.error('FAILED TO FORCE INIT LOST DATA:', error);
    }
    
    // Initialize Sector 1 progression system
    console.log('Initializing Sector 1 progression system...');
    if (window.player && typeof window.initSector1Progression === 'function') {
      window.initSector1Progression(window.player);
      console.log('✓ Sector 1 progression system initialized');
    } else {
      console.warn('Player not available for Sector 1 progression initialization');
    }
    
    // Initialize objectives system
    console.log('Initializing objectives system...');
    if (typeof window.initObjectives === 'function') {
      window.initObjectives();
      console.log('✓ Objectives system initialized');
      
      if (window.objectivesSystem) {
        if (window.objectivesSystem.objectiveUI) {
          window.objectivesSystem.objectiveUI.visible = true;
        }
        window.objectivesSystem.active = true;
        console.log('✅ Objectives system forced visible on initialization');
      }
    }
    
    // Initialize audio system
    console.log('Initializing audio system...');
    await window.initAudio({ profileId: 'level-01.main' });
    console.log('✓ Audio initialization complete');
    
    console.log('✓ All systems initialized successfully');
    
  } catch (error) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    console.error('❌ Initialization failed:', errorMessage);
    console.error('Initialization error stack:', error?.stack || 'No stack available');
    console.error('Error type:', typeof error);
    console.error('Error object:', error);
    
    // Re-throw with more descriptive message
    throw new Error(`Game initialization failed: ${errorMessage}`);
  }
}

window.startGameInitialization = function() {
  if (startGameInitializationComplete) {
    console.log('Game systems already initialized');
    return Promise.resolve();
  }

  if (!startGameInitializationInFlight) {
    startGameInitializationInFlight = performStartGameInitialization()
      .then(() => {
        startGameInitializationComplete = true;
      })
      .finally(() => {
        startGameInitializationInFlight = null;
      });
  } else {
    console.log('Game system initialization already in progress - joining existing attempt');
  }

  return startGameInitializationInFlight;
};
