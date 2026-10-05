// Runtime lifecycle owner for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/core/runtime-lifecycle.js',
  exports: ['BARCODE.RuntimeLifecycle'],
  dependencies: ['startGameInitialization', 'startGameLoop', 'pauseGame', 'resumeGame', 'stopGame', 'AudioSystem', 'BARCODE.MusicTransport']
});

window.BARCODE = window.BARCODE || {};

(function(namespace) {
  'use strict';

  const STATES = Object.freeze({ IDLE: 'idle', STARTING: 'starting', RUNNING: 'running', PAUSED: 'paused', STOPPING: 'stopping', FAILED: 'failed' });
  const ALLOWED_TRANSITIONS = Object.freeze({
    idle: Object.freeze(['starting']),
    starting: Object.freeze(['running', 'failed', 'stopping']),
    running: Object.freeze(['paused', 'stopping']),
    paused: Object.freeze(['running', 'stopping']),
    failed: Object.freeze(['starting', 'stopping']),
    stopping: Object.freeze(['idle'])
  });

  let state = STATES.IDLE;
  let generation = 0;
  let transitionInFlight = null;
  let lastFailure = null;
  const cleanupRegistry = [];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function serializeError(error) { return { message: error && error.message || String(error), name: error && error.name || 'Error', stack: error && error.stack || null }; }

  function canTransition(from, to) { return (ALLOWED_TRANSITIONS[from] || []).includes(to); }

  function projectCompatibility() {
    const running = state === STATES.RUNNING;
    const paused = state === STATES.PAUSED;
    window.isRunning = running || paused;
    window.isPaused = paused;
    if (window.gameState) {
      // Terminal screens keep the loop alive for retry input, but resuming or
      // re-projecting lifecycle state must not restart completed/dead gameplay.
      window.gameState.running = running && !window.gameState.gameOver && !window.gameState.victory;
      window.gameState.paused = paused;
    }
  }

  function transition(to, reason) {
    if (!canTransition(state, to)) return { ok: false, status: 'invalid-transition', from: state, to, generation, reason };
    const from = state;
    state = to;
    if (to === STATES.STARTING || to === STATES.STOPPING || to === STATES.FAILED) generation++;
    projectCompatibility();
    return { ok: true, status: 'transitioned', from, to, state, generation, reason };
  }

  function getSnapshot() { return Object.freeze(clone({ state, generation, transitionInFlight: !!transitionInFlight, lastFailure })); }
  function getState() { return state; }

  function restoreRetryUi() {
    if (window.titleScreen && typeof window.titleScreen.show === 'function') window.titleScreen.show();
    const overlay = document.getElementById('startOverlay');
    if (overlay) { overlay.classList.remove('hidden'); overlay.style.display = ''; overlay.style.opacity = ''; }
    const button = document.getElementById('startButton');
    if (button) { button.disabled = false; button.textContent = 'START SYSTEM'; }
    const loading = document.getElementById('loadingIndicator');
    if (loading) { loading.textContent = 'INITIALIZATION FAILED'; loading.style.color = '#ff0000'; loading.classList.add('visible'); }
  }

  function resetRetryUi() {
    const loading = document.getElementById('loadingIndicator');
    if (loading) { loading.textContent = 'INITIALIZING SYSTEM...'; loading.style.color = ''; loading.classList.remove('visible'); }
    const button = document.getElementById('startButton');
    if (button) { button.disabled = false; button.textContent = 'START SYSTEM'; }
  }

  async function awaitStartResource(pending) {
    let cancel;
    const stopped=new Promise(resolve=>{cancel=()=>resolve();});
    cleanupRegistry.push(cancel);
    try {return await Promise.race([pending,stopped]);}
    finally {const index=cleanupRegistry.indexOf(cancel);if(index>=0)cleanupRegistry.splice(index,1);}
  }

  function initRuntimeSystems() {
    if (typeof window.initParallax === 'function') window.initParallax();
    if (typeof window.initSpaceShips === 'function') window.initSpaceShips();
    if (typeof window.initLore === 'function') window.initLore();
    if (typeof window.initLostData === 'function') window.initLostData(window.player || null);
    if (typeof window.initCutscene === 'function') window.initCutscene();
    if (typeof window.initJammerIndicator === 'function') window.initJammerIndicator();
    if (window.player && typeof window.initSector1Progression === 'function') window.initSector1Progression(window.player);
    if (typeof window.initObjectives === 'function') window.initObjectives();
  }

  function resetRunState(options) {
    options = options || {};
    window.parallaxBackground?.resetSkyAnimation?.();
    if (typeof window.initGameState === 'function' && !options.preserveProgress) window.initGameState();
    if (typeof window.resetRuntimeTerminalFlags === 'function') window.resetRuntimeTerminalFlags();
    else if (window.gameState) { window.gameState.gameOver = false; window.gameState.victory = false; }
    if (window.inputManager) {
      window.inputManager.hasTrackedMovement = false;
      window.inputManager.hasTrackedJump = false;
      if (typeof window.inputManager.resetActionEdges === 'function') window.inputManager.resetActionEdges();
    }
    if (window.BARCODE && window.BARCODE.playerCombat && typeof window.BARCODE.playerCombat.reset === 'function') window.BARCODE.playerCombat.reset();
    window.BARCODE?.Campaign?.resetSession();
    if (window.player) {
      window.player.health = window.player.maxHealth;
      window.player.cancelEntranceAnimation?.();
      window.player.position = new window.Vector2D(200, window.Player?.GROUND_Y ?? 784);
      window.player.velocity = new window.Vector2D(0, 0);
    }
    const preserveDefeats = !!options.preserveProgress;
    if (window.enemyManager && typeof window.enemyManager.clear === 'function') window.enemyManager.clear({ preserveDefeats });
    if (typeof window.syncEnemyDefeatProjections === 'function') window.syncEnemyDefeatProjections();
    if (window.BARCODE && window.BARCODE.JammerEnvironment && typeof window.BARCODE.JammerEnvironment.reset === 'function') window.BARCODE.JammerEnvironment.reset();
    if (window.objectivesSystem) {
      if (typeof window.objectivesSystem.reset === 'function') window.objectivesSystem.reset();
      if (window.objectivesSystem.objectiveUI) window.objectivesSystem.objectiveUI.visible = true;
      window.objectivesSystem.active = true;
    }
    if (window.sector1Progression && typeof window.sector1Progression.reset === 'function') {
      window.sector1Progression.reset({ preserveDefeats });
    }
    if (window.hackingSystem && typeof window.hackingSystem.reset === 'function') window.hackingSystem.reset();
    if (options.entrance && window.player) {
      window.renderer?.resetFollowCamera?.(200);
      window.renderer?.clearCinematicZoomOverride?.();
      if (window.renderer) window.renderer.zoomLevel = window.renderer.targetZoomLevel = 1;
      window.player.startEntranceAnimation?.({ targetX: 200 });
    }
  }

  async function runInitializer(options) {
    options = options || {};
    const initializerGeneration = generation;
    if (!options.restart) resetRetryUi();
    if (!options.restart && window.titleScreen && typeof window.titleScreen.hide === 'function') window.titleScreen.hide();
    const loading = document.getElementById('loadingIndicator');
    if (loading && !options.restart) loading.classList.add('visible');
    const button = document.getElementById('startButton');
    if (button && !options.restart) { button.disabled = true; button.textContent = 'INITIALIZING...'; }

    if(options.resume?.levelId!=='level-02'&&namespace.PresentationAssets?.selectLevel1Scene) {
      await awaitStartResource(namespace.PresentationAssets.selectLevel1Scene());
      if (generation !== initializerGeneration || state !== STATES.STARTING) return;
    }
    if (typeof window.startGameInitialization === 'function') await window.startGameInitialization({ restart: !!options.restart });
    if (generation !== initializerGeneration || state !== STATES.STARTING) return;
    // The road releases the prior level's shared sprite atlases. The cached
    // general initializer does not reload them on Return or a new run.
    if(options.resume?.levelId!=='level-02'&&namespace.StandaloneSprites?.isLoaded?.()===false&&
        typeof window.initSprites==='function') {
      await awaitStartResource(window.initSprites());
      if (generation !== initializerGeneration || state !== STATES.STARTING) return;
    }
    if (window.audioSystem && typeof window.audioSystem.stopTitleScreenMusic === 'function') window.audioSystem.stopTitleScreenMusic();
    window.titleScreenMusicBlocked = true;
    initRuntimeSystems();

    if (!options.restart) {
      const overlay = document.getElementById('startOverlay');
      if (overlay) overlay.classList.add('hidden');
      const canvas = document.getElementById('gameCanvas');
      if (canvas) canvas.style.display = 'none';
      if (!options.resume && window.cutsceneSystem && typeof window.cutsceneSystem.start === 'function') await window.cutsceneSystem.start();
      if (generation !== initializerGeneration || state !== STATES.STARTING) return;
      if (canvas) canvas.style.display = 'block';
      const topbar = document.querySelector('.topbar');
      const hint = document.querySelector('.hint');
      if (topbar) topbar.style.display = 'flex';
      if (hint) hint.style.display = 'block';
      if (!options.resume && window.tutorialSystem && typeof window.tutorialSystem.startTutorial === 'function') window.tutorialSystem.startTutorial();
      if (loading) loading.classList.remove('visible');
    }

    resetRunState({ preserveProgress: !!options.restart, entrance: !options.resume });
    if (!options.resume) window.BARCODE?.LevelDifficulty?.beginLevel('level-01');
    if (['level-02', 'level-03'].includes(options.resume?.levelId)) {
      const proof = options.resume.levelId === 'level-02' ? namespace.CacheRoadProof : namespace.RunAndGunProof;
      const selection = proof?.selectMusicProfile?.();
      if (!selection?.ok) throw new Error('Prototype music profile could not be selected.');
      const prepared = await window.audioSystem?.prepareActiveMusicProfile?.();
      if (!prepared?.ok) throw new Error('Prototype audio could not be prepared.');
    } else if ((options.restart || options.resume) && namespace.MusicProfiles?.getActive()?.profileId !== 'level-01.main') {
      const selection = namespace.ensureLevel01MusicProfileSelected?.();
      if (!selection?.ok) throw new Error('Level 1 music profile could not be restored.');
      const prepared = await window.audioSystem?.prepareActiveMusicProfile?.();
      if (!prepared?.ok) throw new Error('Level 1 audio could not be prepared.');
    }
    if (generation !== initializerGeneration || state !== STATES.STARTING) return;
    // The road's source offset belongs to its restored bar. Restore that
    // state before asking audio to start, and keep a completed result silent.
    const roadResume=options.resume?.levelId==='level-02';
    if (roadResume && !namespace.Campaign?.restore(options.resume)) throw new Error('Saved checkpoint could not be restored. Start a new run or retry Continue.');
    if (roadResume) {
      await namespace.CacheRoadProof?.preparePresentation?.();
      if (generation !== initializerGeneration || state !== STATES.STARTING) return;
    }
    const bridgeResume=options.resume?.levelId==='level-01'&&options.resume.checkpointId==='intermission';
    const completedRoadResume=roadResume&&namespace.CacheRoadProof?.status==='clear';
    if (!bridgeResume && !completedRoadResume && (options.restart || options.resume) && window.audioSystem && typeof window.audioSystem.startRuntimeGameplayMusic === 'function') {
      const musicResult = window.audioSystem.startRuntimeGameplayMusic();
      if (!musicResult || musicResult.ok === false) {
        throw new Error(`Restart music startup failed: ${musicResult && musicResult.reason || 'unknown'}`);
      }
    }
    if (options.resume && !roadResume && !namespace.Campaign?.restore(options.resume)) throw new Error('Saved checkpoint could not be restored. Start a new run or retry Continue.');
    if (typeof window.startGameLoop === 'function') window.startGameLoop();
    return { ok: true, status: 'started', state, generation };
  }

  function joinOrReject(kind, equivalent) {
    if (!transitionInFlight) return null;
    if (transitionInFlight.kind === equivalent) return transitionInFlight.promise;
    return Promise.resolve({ ok: false, status: 'transition-in-flight', requested: kind, active: transitionInFlight.kind, state, generation });
  }

  function start(options) {
    options = options || {};
    const joined = options.internal ? null : joinOrReject('start', 'start');
    if (joined) return joined;
    if (state === STATES.RUNNING || state === STATES.PAUSED) return Promise.resolve({ ok: true, status: 'already-started', state, generation });
    const t = transition(state === STATES.FAILED ? STATES.STOPPING : STATES.STARTING, 'start');
    if (!t.ok && state !== STATES.FAILED) return Promise.resolve(t);
    let runGeneration = generation;
    const promise = (async function() {
      try {
        if (state === STATES.STOPPING) transition(STATES.IDLE, 'failed-cleanup-before-retry');
        if (state === STATES.IDLE) transition(STATES.STARTING, 'start');
        runGeneration = generation;
        if (transitionInFlight) transitionInFlight.generation = runGeneration;
        await runInitializer(options);
        if (generation !== runGeneration || state !== STATES.STARTING) return { ok: false, status: 'stale-start', state, generation };
        return transition(STATES.RUNNING, 'start-complete');
      } catch (error) {
        if (generation === runGeneration && state === STATES.STARTING) {
          lastFailure = serializeError(error);
          cleanupFailedGeneration();
          transition(STATES.FAILED, 'start-failed');
          restoreRetryUi();
        }
        return { ok: false, status: 'failed', state, generation, diagnostic: lastFailure };
      } finally { transitionInFlight = null; }
    })();
    transitionInFlight = { kind: 'start', generation: runGeneration, promise };
    return promise;
  }

  function cleanupFailedGeneration() { stopOwnedResources({ failed: true, stopMusic: true }); }

  function retry() { return start({ retry: true }); }

  function restart(options) {
    options = Object.assign({}, options, { restart: true });
    const joined = joinOrReject('restart', 'restart');
    if (joined) return joined;
    if (state !== STATES.RUNNING && state !== STATES.PAUSED) return Promise.resolve({ ok: false, status: 'invalid-restart-state', state, generation });
    const promise = (async function() {
      if (window.audioSystem && typeof window.audioSystem.prepareRestartAudio === 'function') {
        const audioReady = await window.audioSystem.prepareRestartAudio();
        if (!audioReady || audioReady.ok === false) return { ok: false, status: 'restart-audio-failed', state, generation, diagnostic: audioReady };
      }
      const stopResult = await stop('restart', { restart: true, stopMusic: true });
      if (!stopResult.ok) return stopResult;
      options.internal = true;
      return start(options);
    })().finally(() => { transitionInFlight = null; });
    transitionInFlight = { kind: 'restart', generation, promise };
    return promise;
  }

  function pause(reason) {
    if(namespace.CacheRoadProof?.presentationPreparing)
      return Promise.resolve({ok:false,status:'road-preparing',state,generation});
    const joined = joinOrReject('pause', 'pause');
    if (joined) return joined;
    if (state === STATES.PAUSED) return Promise.resolve({ ok: true, status: 'already-paused', state, generation });
    if (state !== STATES.RUNNING) return Promise.resolve({ ok: false, status: 'invalid-pause-state', state, generation });
    const promise = (async function() {
      const audioResult = window.audioSystem && typeof window.audioSystem.pauseRuntimeAudio === 'function'
        ? await window.audioSystem.pauseRuntimeAudio()
        : { ok: true, reason: 'no-audio-system' };
      if (!audioResult || audioResult.ok === false) {
        if (typeof window.resumeGame === 'function' && window.isPaused) window.resumeGame();
        projectCompatibility();
        return { ok: false, status: 'audio-pause-failed-rolled-back', state, generation, diagnostic: audioResult };
      }
      if (typeof window.pauseGame === 'function') window.pauseGame();
      return transition(STATES.PAUSED, reason || 'pause');
    })().finally(() => { transitionInFlight = null; });
    transitionInFlight = { kind: 'pause', generation, promise };
    return promise;
  }

  function resume(reason) {
    const joined = joinOrReject('resume', 'resume');
    if (joined) return joined;
    if (state === STATES.RUNNING) return Promise.resolve({ ok: true, status: 'already-running', state, generation });
    if (state !== STATES.PAUSED) return Promise.resolve({ ok: false, status: 'invalid-resume-state', state, generation });
    const promise = (async function() {
      const audioResult = window.audioSystem && typeof window.audioSystem.resumeRuntimeAudio === 'function'
        ? await window.audioSystem.resumeRuntimeAudio()
        : { ok: true, reason: 'no-audio-system' };
      if (!audioResult || audioResult.ok === false) {
        if (typeof window.pauseGame === 'function') window.pauseGame();
        projectCompatibility();
        return { ok: false, status: 'audio-resume-failed-still-paused', state, generation, diagnostic: audioResult };
      }
      // Resuming the audio context must not start a pre-race or completed road clock.
      // Its finite reading cues may be stopped; the next authored cue is fresh.
      if (namespace.CacheEnding?.active || namespace.CacheRoadProof?.active &&
          (namespace.CacheRoadProof.presentationPreparing || namespace.CacheRoadProof.status === 'clear' || namespace.CacheRoadProof.introMs != null)) {
        window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
        window.audioSystem?.stopRoadEngine?.();
      }
      const result = transition(STATES.RUNNING, reason || 'resume');
      if (result.ok && typeof window.resumeGame === 'function') window.resumeGame();
      return result;
    })().finally(() => { transitionInFlight = null; });
    transitionInFlight = { kind: 'resume', generation, promise };
    return promise;
  }

  function togglePause() { return state === STATES.PAUSED ? resume('toggle') : pause('toggle'); }

  function stopOwnedResources(options) {
    options = options || {};
    namespace.CacheEnding?.dispose?.();
    namespace.CacheRoadProof?.dispose?.();
    namespace.PresentationAssets?.releaseScene?.();
    namespace.CacheBridge?.dispose?.();
    namespace.RunAndGunProof?.dispose?.();
    namespace.LevelDifficulty?.stop();
    namespace.IntroSequence?.reset();
    if (window.inputManager && typeof window.inputManager.resetActionEdges === 'function') window.inputManager.resetActionEdges();
    if (window.BARCODE && window.BARCODE.playerCombat && typeof window.BARCODE.playerCombat.reset === 'function') window.BARCODE.playerCombat.reset();
    if (typeof window.stopGame === 'function') window.stopGame();
    window.parallaxBackground?.disposeSkyAnimation?.();
    if (typeof window.cancelInitialEnemySpawn === 'function') window.cancelInitialEnemySpawn();
    if (namespace.AssetMonitor && typeof namespace.AssetMonitor.cleanup === 'function') namespace.AssetMonitor.cleanup();
    if (window.cutsceneSystem && typeof window.cutsceneSystem.destroy === 'function') window.cutsceneSystem.destroy();
    if (window.spaceShipSystem && typeof window.spaceShipSystem.dispose === 'function') window.spaceShipSystem.dispose();
    const preserveDefeats = !!options.restart || !!options.preserveProgress;
    if (window.enemyManager && typeof window.enemyManager.dispose === 'function') window.enemyManager.dispose({ preserveDefeats });
    if (window.BARCODE && window.BARCODE.JammerEnvironment && typeof window.BARCODE.JammerEnvironment.dispose === 'function') window.BARCODE.JammerEnvironment.dispose();
    if (window.rhythmSystem && typeof window.rhythmSystem.hideRhythmMode === 'function') window.rhythmSystem.hideRhythmMode();
    if (window.hackingSystem && typeof window.hackingSystem.reset === 'function') window.hackingSystem.reset();
    if (window.audioSystem && typeof window.audioSystem.stopRuntimeAudio === 'function') window.audioSystem.stopRuntimeAudio({ stopMusic: options.stopMusic !== false });
    cleanupRegistry.splice(0).forEach(cleanup => { try { cleanup(); } catch (error) {} });
    if (window.particleSystem && Array.isArray(window.particleSystem.particles)) window.particleSystem.particles.length = 0;
    projectCompatibility();
  }

  async function stop(reason, options) {
    options = options || {};
    if (state === STATES.IDLE) return { ok: true, status: 'already-idle', state, generation };
    if (!canTransition(state, STATES.STOPPING)) return { ok: false, status: 'invalid-stop-state', state, generation };
    transition(STATES.STOPPING, reason || 'stop');
    stopOwnedResources(options);
    return transition(STATES.IDLE, reason || 'stop-complete');
  }

  async function returnToTitle({ source = 'chapter-title' } = {}) {
    if (transitionInFlight) return { ok: false, status: 'transition-in-flight', state, generation };
    const result = await stop(source, { stopMusic: true, preserveProgress: true });
    if (!result.ok) return result;
    resetRetryUi();
    const overlay = document.getElementById('startOverlay');
    if (overlay) { overlay.classList.remove('hidden'); overlay.style.display = ''; overlay.style.opacity = ''; }
    namespace.Campaign?.syncTitleButton?.();
    window.titleScreen?.show?.();
    return result;
  }

  function getDiagnostics() {
    const transport = namespace.MusicTransport && typeof namespace.MusicTransport.getDiagnostics === 'function' ? namespace.MusicTransport.getDiagnostics() : null;
    return Object.freeze(clone({
      lifecycle: getSnapshot(),
      gameplayLoop: { running: !!window.isRunning, paused: !!window.isPaused, rafScheduled: window.gameLoopRafHandle !== null },
      musicTransport: transport,
      audioContextState: window.audioSystem && typeof window.audioSystem.getContextState === 'function' ? window.audioSystem.getContextState() : 'unavailable',
      audio: window.audioSystem && typeof window.audioSystem.getRuntimeDiagnostics === 'function' ? window.audioSystem.getRuntimeDiagnostics() : null,
      active: { title: !!(window.titleScreen && window.titleScreen.animationFrameHandle), cutscene: !!(window.cutsceneSystem && typeof window.cutsceneSystem.isPlaying === 'function' && window.cutsceneSystem.isPlaying()), rhythm: !!(window.rhythmSystem && window.rhythmSystem.isActive && window.rhythmSystem.isActive()), gameplayMusic: !!(window.audioSystem && window.audioSystem.layersStarted) },
      rhythm: window.rhythmSystem && typeof window.rhythmSystem.getDiagnostics === 'function' ? window.rhythmSystem.getDiagnostics() : null,
      gameState: window.gameState ? { gameOver: !!window.gameState.gameOver, victory: !!window.gameState.victory, running: !!window.gameState.running, paused: !!window.gameState.paused } : null,
      resources: { cutscene: window.cutsceneSystem && typeof window.cutsceneSystem.getDiagnostics === 'function' ? window.cutsceneSystem.getDiagnostics() : null, spaceships: window.spaceShipSystem && typeof window.spaceShipSystem.getDiagnostics === 'function' ? window.spaceShipSystem.getDiagnostics() : null, hacking: window.hackingSystem && typeof window.hackingSystem.getDiagnostics === 'function' ? window.hackingSystem.getDiagnostics() : null, enemies: window.enemyManager && typeof window.enemyManager.getDiagnostics === 'function' ? window.enemyManager.getDiagnostics() : null, jammerEnvironment: window.BARCODE && window.BARCODE.JammerEnvironment && typeof window.BARCODE.JammerEnvironment.getDiagnostics === 'function' ? window.BARCODE.JammerEnvironment.getDiagnostics() : null, initialEnemySpawn: typeof window.getInitialEnemySpawnDiagnostics === 'function' ? window.getInitialEnemySpawnDiagnostics() : null, assetMonitor: namespace.AssetMonitor && typeof namespace.AssetMonitor.getDiagnostics === 'function' ? namespace.AssetMonitor.getDiagnostics() : null }
    }));
  }

  namespace.RuntimeLifecycle = Object.freeze({ STATES, ALLOWED_TRANSITIONS, getState, getSnapshot, start, retry, restart, pause, resume, togglePause, stop, returnToTitle, getDiagnostics, projectCompatibility });
})(window.BARCODE);
