// Low-level input adapter for BARCODE: System Override. Gameplay actions are owned by BARCODE.ActionInput.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/core/input.js', exports: ['InputManager', 'inputManager'], dependencies: ['BARCODE.ActionInput', 'BARCODE.PlayerCombat'] });

window.InputManager = class InputManager {
  constructor() {
    this.keys = {};
    this.pressedKeys = new Set();
    this.releasedKeys = new Set();
    this.mouse = { x: 0, y: 0, clicked: false, pressed: false };
    this.gamepad = null;
    this.vibrationEnabled = true;
    this.hasTrackedMovement = false;
    this.hasTrackedJump = false;
    // Escape cancels a hack on keydown. Keep ownership until keyup so the
    // browser's held-key repeat cannot immediately toggle restored Rhythm Mode.
    this.hackEscapeLatched = false;
    this.terminalKeyLatched = null;
    // Physical result keys survive action resets at the winning hit. Their
    // release is required before the victory menu accepts a fresh choice.
    this.resultKeysHeld = new Set();
    this.actionInput = window.BARCODE && window.BARCODE.ActionInput ? new window.BARCODE.ActionInput({ attach: false }) : null;
    this.init();
  }

  init() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'enter' || key === 'c' || window.BARCODE?.CacheRoadProof?.active && (key === 'r' || key === 's')) this.resultKeysHeld.add(key);

      if (window.BARCODE?.CacheEnding?.active) {
        e.preventDefault();
        window.BARCODE.CacheEnding.keyDown(e);
        return;
      }
      if (window.BARCODE?.Campaign?.intermission) {
        e.preventDefault();
        window.BARCODE?.CacheBridge?.keyDown(e);
        return;
      }
      if (window.BARCODE?.CacheRoadProof?.active && !(window.isPaused || window.gameState?.paused)) {
        if (window.BARCODE.CacheRoadProof.keyDown(e)) return;
      }
      if (window.BARCODE?.RunAndGunProof?.active) {
        if (window.BARCODE.RunAndGunProof.keyDown(e)) return;
      }
      if (key === 'c' && window.gameState?.victory) {
        e.preventDefault();
        if (!e.repeat) window.BARCODE?.Campaign?.openIntermission();
        return;
      }

      if (window.BARCODE?.LevelDifficulty?.keyDown(e)) return;
      if (window.cutsceneSystem?.isActive) return; // The opening owns its document handlers.
      if (window.BARCODE?.PauseMenu?.keyDown(e)) { e.preventDefault(); return; }
      if (this.terminalKeyLatched === key) { e.preventDefault(); return; }
      if (this.hackEscapeLatched && key === 'escape') {
        e.preventDefault();
        return;
      }

      const hacking = window.hackingSystem;
      if (hacking && hacking.isActive && hacking.isActive()) {
        e.preventDefault();
        if (key === 'escape') this.hackEscapeLatched = true;
        // The terminal is the exclusive keyboard owner while active. Do not
        // leak terminal keys into ActionInput, tutorial Space, debug, or the
        // global Escape/Rhythm handler.
        if (typeof hacking.processInput === 'function') hacking.processInput(e.key);
        return;
      }

      this.keys[key] = true;
      this.pressedKeys.add(key);
      if (e.shiftKey && e.key === 'F') { e.preventDefault(); if (window.fullscreenManager) window.fullscreenManager.toggle(); return; }
      if (window.gameState && (window.gameState.gameOver || window.gameState.victory) && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        if (e.repeat) return;
        const progression = window.sector1Progression;
        if (window.gameState.victory && progression?.areCompletionControlsReady?.() === false) return;
        this.terminalKeyLatched = key;
        const retryRequested = window.gameState.gameOver ? e.key === ' ' && !e.shiftKey : e.key === 'Enter';
        if (retryRequested && progression?.canRetryBossCheckpoint?.()) {
          progression.retryBossCheckpoint();
        } else if (retryRequested && window.BARCODE?.Campaign?.canRetryObjective?.()) {
          window.BARCODE.Campaign.retryObjective();
        } else if (e.key === ' ' && window.BARCODE?.RuntimeLifecycle) {
          window.BARCODE.RuntimeLifecycle.restart({ source: 'terminal-space' });
        }
        this.resetActionEdges();
        return;
      }
      if (e.key === ' ' && window.tutorialSystem && typeof window.tutorialSystem.isActive === 'function' && window.tutorialSystem.isActive()) {
        e.preventDefault();
        if (!e.repeat && typeof window.tutorialSystem.handleSpacePress === 'function') window.tutorialSystem.handleSpacePress();
        this.resetActionEdges();
        return;
      }
      if (this.actionInput) this.actionInput.handleKeyDown(e);
      if (e.key === 'Escape' || e.key === 'ESC') {
        e.preventDefault();
        if (window.rhythmSystem && window.rhythmSystem.isActive && window.rhythmSystem.isActive()) {
          this.leaveRhythmMode();
        }
      }
      if (window.DEBUG_KEYBOARD_ENABLED === true) this.handleDebugKey(e);
    });
    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.resultKeysHeld.delete(key);
      window.BARCODE?.CacheEnding?.keyUp(e);
      window.BARCODE?.CacheBridge?.keyUp(e);
      window.BARCODE?.LevelDifficulty?.keyUp(e);
      window.BARCODE?.PauseMenu?.keyUp(e);
      if (this.terminalKeyLatched === key) this.terminalKeyLatched = null;
      const terminalOwnsKey = !!(window.hackingSystem?.isActive?.() || (this.hackEscapeLatched && key === 'escape'));
      this.keys[key] = false;
      if (this.actionInput) this.actionInput.handleKeyUp(e);
      if (key === 'escape') this.hackEscapeLatched = false;
      if (terminalOwnsKey) {
        if (e.preventDefault) e.preventDefault();
        return;
      }
      this.releasedKeys.add(key);
    });
    window.addEventListener('blur', () => {
      // Keyup can occur outside this window after a retry or terminal cancel.
      // Release physical-key ownership so that returning focus stays usable.
      this.terminalKeyLatched = null;
      this.hackEscapeLatched = false;
      this.resultKeysHeld.clear();
      window.BARCODE?.CacheEnding?.releaseInputs();
      window.BARCODE?.CacheBridge?.releaseInputs();
      this.resetActionEdges();
      this.mouse.pressed = false;
      this.mouse.clicked = false;
      if (window.BARCODE?.PauseMenu) { window.BARCODE.PauseMenu.heldKeys.clear(); window.BARCODE.PauseMenu.drag = null; }
    });
    window.addEventListener('pointerdown', e => {
      if (window.hackingSystem?.isActive?.()) { e.preventDefault(); window.hackingSystem.pointerInput?.(e); }
    }, { passive: false });
    window.addEventListener('mousemove', (e) => { if (window.BARCODE?.PauseMenu?.pointer(e, 'move')) return; this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    window.addEventListener('mousedown', (e) => {
      if (window.BARCODE?.CacheEnding?.active) {
        window.BARCODE.CacheEnding.pointer(e);
        return;
      }
      if (window.BARCODE?.Campaign?.intermission) {
        window.BARCODE?.CacheBridge?.pointer(e);
        return;
      }
      if (window.BARCODE?.LevelDifficulty?.pointer(e) || window.BARCODE?.PauseMenu?.pointer(e, 'down')) return;
      const road=window.BARCODE?.CacheRoadProof;
      if(road?.active&&road.status!=='playing') {
        const rect=document.getElementById('gameCanvas')?.getBoundingClientRect?.();
        if(rect?.width&&rect?.height)road.pointerClick?.((e.clientX-rect.left)*1920/rect.width,(e.clientY-rect.top)*1080/rect.height);
        return;
      }
      this.mouse.pressed = true; this.mouse.clicked = true;
    });
    window.addEventListener('mouseup', (e) => { window.BARCODE?.PauseMenu?.pointer(e, 'up'); this.mouse.pressed = false; });
    window.addEventListener('gamepadconnected', (e) => { this.gamepad = e.gamepad; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepad = null; });
  }

  handleDebugKey(e) {
    const key = e.key.toLowerCase();
    if (key === 't' && window.handleGameAction) window.handleGameAction('skip_tutorial');
    if (key === 'l' && window.lostDataSystem && typeof window.lostDataSystem.forceSpawnFragment === 'function') window.lostDataSystem.forceSpawnFragment();
    if (key === 'c' && window.tutorialSystem && window.tutorialSystem.checkObjective) window.tutorialSystem.checkObjective('emergency_combat');
  }

  isKey(key) { return this.keys[key.toLowerCase()] || false; }
  isKeyPressed(key) { return this.pressedKeys.has(key.toLowerCase()); }
  isKeyReleased(key) { return this.releasedKeys.has(key.toLowerCase()); }
  getMovement() { const state = this.actionInput ? this.actionInput.state : {}; return { x: (state.move_right && state.move_right.held ? 1 : 0) - (state.move_left && state.move_left.held ? 1 : 0), y: 0 }; }
  updateGamepad() { this.gamepad = window.BARCODE?.GamepadUI?.selectPad?.() || null; }
  isGamepadButton(buttonIndex) { return this.gamepad && this.gamepad.buttons[buttonIndex] && this.gamepad.buttons[buttonIndex].pressed; }
  getGamepadMovement() { return this.getMovement(); }
  vibrate(intensity = 0.5, duration = 100) { if (window.BARCODE?.ControllerSettings?.vibration !== false && this.vibrationEnabled && this.gamepad && this.gamepad.vibrationActuator) this.gamepad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration, weakMagnitude: intensity, strongMagnitude: intensity })?.catch?.(() => {}); }

  update(options = {}) {
    this.updateGamepad();
    if (this.routeGamepadUI()) {
      this.actionInput?.reset();
      this.pressedKeys.clear(); this.releasedKeys.clear(); this.mouse.clicked = false;
      return;
    }
    if (window.BARCODE?.LevelDifficulty?.open) return;
    const actions = this.actionInput ? this.actionInput.update(options.context || {}) : null;
    if (actions) this.routeActions(actions, options);
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.mouse.clicked = false;
  }

  updatePausedInput() {
    window.BARCODE?.PauseMenu?.sync();
    this.update({ inputOnly: true, context: { paused: true } });
  }

  resetActionEdges() {
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.keys = {};
    window.player?.setRunHeld?.(false);
    window.BARCODE?.GamepadUI?.reset();
    if (this.actionInput && typeof this.actionInput.reset === 'function') this.actionInput.reset();
  }

  isResultControlHeld() {
    const pad = window.BARCODE?.GamepadUI?.selectPad?.();
    return this.resultKeysHeld.size > 0 || !!pad?.buttons[0]?.pressed || !!pad?.buttons[2]?.pressed || !!pad?.buttons[3]?.pressed || !!(window.BARCODE?.CacheRoadProof?.active && pad?.buttons[1]?.pressed);
  }

  updateFrontend(owner) {
    const menu=window.BARCODE?.PauseMenu;
    if(owner==='title'&&menu?.titleOpen){this.routeGamepadUI();menu.render();return;}
    const input = window.BARCODE?.GamepadUI?.poll(owner);
    if (!input) return;
    const pressed = input.pressed;
    if(owner==='title'&&pressed.b2){menu?.openTitle();return;}
    if (owner === 'title' && pressed.b3) {
      const button = document.getElementById('continueButton');
      if (button && !button.hidden && !button.disabled) button.click();
    } else if (owner === 'title' && (pressed.b0 || pressed.b9)) {
      const button = document.getElementById('startButton');
      if (button && !button.disabled) button.click();
    } else if (owner === 'intro') {
      if (pressed.b9) window.cutsceneSystem?.togglePresentationPause?.();
      else if (pressed.b2) window.cutsceneSystem?.toggleTranscript?.();
      else if (pressed.b0) window.cutsceneSystem?.skipCutscene?.();
      else if (pressed.b5) window.cutsceneSystem?.nextScene?.();
      // Retain the intro's existing five-second skip hold and its cleanup.
      if (pressed.left) window.cutsceneSystem?.inspectCaption?.();
      if (pressed.b1) window.cutsceneSystem?.startSkipHold?.('gamepad');
      if (!input.held.b1) window.cutsceneSystem?.endSkipHold?.('gamepad');
    }
  }

  routeGamepadUI() {
    const BARCODE = window.BARCODE, menu = BARCODE?.PauseMenu;
    const owner = BARCODE?.LevelDifficulty?.open ? 'difficulty' : BARCODE?.CacheEnding?.active ? 'ending' : BARCODE?.CacheBridge?.active ? 'bridge' : (menu?.titleOpen || window.isPaused || window.gameState?.paused) ? 'pause' :
      BARCODE?.CacheRoadProof?.active && BARCODE.CacheRoadProof.status !== 'playing' ? 'road-results' : window.hackingSystem?.isActive?.() ? 'hack' :
      (window.gameState?.gameOver || window.gameState?.victory) ? 'results' :
      window.tutorialSystem?.isActive?.() ? 'tutorial' : 'gameplay';
    const input = BARCODE?.GamepadUI?.poll(owner);
    if (!input) return false;
    const p = input.pressed;
    if (owner === 'difficulty') {
      const d = BARCODE.LevelDifficulty;
      if (p.left || p.up) d.select((d.selected + 2) % 3);
      else if (p.right || p.down) d.select((d.selected + 1) % 3);
      else if(p.b2)d.toggleRecovery();
      else if (p.b0 || p.b9) d.confirm();
      return true;
    }
    if (input.changed) this.actionInput?.blockGamepadUntilRelease();
    if (owner === 'ending') { BARCODE.CacheEnding.gamepad(input); return true; }
    if (owner === 'bridge') { BARCODE.CacheBridge.gamepad(input); return true; }
    if (owner === 'pause') {
      if (input.changed && menu) menu.dirty = true;
      if (menu?.view === 'controller' && menu.captureAction) { menu.captureController(input); return true; }
      const key = p.b9 ? 'p' : p.b1 ? 'escape' : p.b0 ? 'enter' : p.up ? 'arrowup' : p.down ? 'arrowdown' : p.left ? 'arrowleft' : p.right ? 'arrowright' : null;
      if (key) { menu?.keyDown({ key, repeat: false, preventDefault() {} }); menu?.keyUp({ key }); }
      return true;
    }
    if (BARCODE?.CacheRoadProof?.active && BARCODE.CacheRoadProof.introMs != null) {
      if (p.b9) BARCODE.RuntimeLifecycle?.togglePause?.();
      else if (p.b0) BARCODE.CacheRoadProof.finishIntro();
      return true;
    }
    if (owner === 'hack') {
      const hack = window.hackingSystem;
      if (p.b9) { BARCODE.RuntimeLifecycle?.togglePause?.(); return true; }
      hack.useKeypad?.();
      if (p.b1) hack.processInput('Escape');
      else if (p.b2) hack.processInput('Backspace');
      else if (p.b0) hack.activateKeypad?.();
      else if (p.up || p.down || p.left || p.right) hack.navigateKeypad?.(p.right ? 1 : p.left ? -1 : 0, p.down ? 1 : p.up ? -1 : 0);
      return true;
    }
    if (owner === 'results') {
      if (window.gameState?.victory && window.sector1Progression?.areCompletionControlsReady?.() === false) return true;
      if (p.b3 && window.gameState?.victory) { BARCODE?.Campaign?.openIntermission(); return true; }
      if (p.b0) {
        if (window.sector1Progression?.canRetryBossCheckpoint?.()) window.sector1Progression.retryBossCheckpoint();
        else if(BARCODE.Campaign?.canRetryObjective?.())BARCODE.Campaign.retryObjective();
        else BARCODE.RuntimeLifecycle?.restart({ source: 'controller-result' });
      } else if (p.b2) BARCODE.RuntimeLifecycle?.restart({ source: 'controller-result' });
      if (p.b0 || p.b2) this.resetActionEdges();
      return true;
    }
    const activeProof = BARCODE?.CacheRoadProof?.active ? BARCODE.CacheRoadProof :
      BARCODE?.RunAndGunProof?.active ? BARCODE.RunAndGunProof : null;
    if (activeProof && activeProof.status !== 'playing') {
      if(owner==='road-results'&&activeProof.resultGamepad) {activeProof.resultGamepad(input);return true;}
      if (owner === 'road-results' && p.b9) BARCODE.RuntimeLifecycle?.togglePause?.();
      else if (p.b0) activeProof.retry();
      else if (p.b3) activeProof.exit();
      return true;
    }
    // Playable crew training keeps the same jump/hold action as the street.
    // Create/View advances speech without clearing movement or jump state.
    if (owner === 'tutorial' && p.b8) window.tutorialSystem.handleSpacePress?.();
    if (p.b1 && window.rhythmSystem?.isActive?.() && !window.sector1Progression?.isGameplaySuppressed?.()) this.leaveRhythmMode();
    return false;
  }

  leaveRhythmMode() {
    const rhythm = window.rhythmSystem;
    if (!rhythm?.isActive?.()) return false;
    // Capture a just-earned combo before hide() clears the live count. Only an
    // explicit exit input earns this lesson; damage/hack suspension do not.
    window.tutorialSystem?.observeProgress?.();
    if (rhythm.hideRhythmMode) rhythm.hideRhythmMode(); else rhythm.hide?.();
    if (!rhythm.isActive()) window.tutorialSystem?.checkObjective?.('rhythm_exit');
    return !rhythm.isActive();
  }

  routeActions(actions, options = {}) {
    if (actions.pause.pressed && window.BARCODE && window.BARCODE.RuntimeLifecycle) window.BARCODE.RuntimeLifecycle.togglePause();
    if (window.BARCODE?.CacheRoadProof?.active) {
      if (!options.inputOnly && !window.isPaused) window.BARCODE.CacheRoadProof.handleActions(actions);
      return;
    }
    if (window.BARCODE?.RunAndGunProof?.active) {
      if (!options.inputOnly && !window.isPaused) window.BARCODE.RunAndGunProof.handleActions(actions);
      return;
    }
    if (window.player?.isEntering) return;
    const progressionSuppressesGameplay = !!(window.sector1Progression && window.sector1Progression.isGameplaySuppressed && window.sector1Progression.isGameplaySuppressed());
    if (!progressionSuppressesGameplay && actions.rhythm_mode && actions.rhythm_mode.pressed && window.rhythmSystem && !(window.hackingSystem && window.hackingSystem.isActive && window.hackingSystem.isActive())) {
      if (window.rhythmSystem.isActive && window.rhythmSystem.isActive()) {
        this.leaveRhythmMode();
      } else {
        const activation = window.rhythmSystem.showRhythmMode ? window.rhythmSystem.showRhythmMode() : (window.rhythmSystem.show ? window.rhythmSystem.show() : { ok: false, reason: 'unavailable' });
        const active = window.rhythmSystem.isActive && window.rhythmSystem.isActive();
        if (activation?.reason === 'land-to-enter' && window.BARCODE?.playerCombat) window.BARCODE.playerCombat.feedback = {
          text: 'LAND TO ENTER RHYTHM MODE', color: '#ffbd70', expiresAt: (window.gameState?.gameTime || 0) + 1000
        };
        if (activation && activation.ok && active && window.tutorialSystem && window.tutorialSystem.isActive && window.tutorialSystem.isActive() && Number(window.tutorialSystem.storyChapter) === 2 && window.tutorialSystem.checkObjective) window.tutorialSystem.checkObjective('rhythm_start');
      }
    }
    if (options.inputOnly || !this.acceptsGameplay()) return;
    if (window.player) {
      // Opposing directions cancel each other. This preserves the original
      // controller contract: pressing both directions is neutral, and
      // releasing either one immediately resumes the direction still held.
      window.player.setRunHeld?.(!!actions.run?.held);
      const horizontal = Number(!!actions.move_right?.held) - Number(!!actions.move_left?.held);
      if (horizontal < 0) window.player.moveLeft();
      else if (horizontal > 0) window.player.moveRight();
      else window.player.stopHorizontal();
      if (horizontal !== 0 && window.tutorialSystem && window.tutorialSystem.isActive && window.tutorialSystem.isActive() && !this.hasTrackedMovement) { this.hasTrackedMovement = true; window.tutorialSystem.checkObjective && window.tutorialSystem.checkObjective('movement'); }
      // Down + the mapped jump drops through only the current support. With
      // shared Cross, the same chord also exits a planted Rhythm Mode safely.
      const sharedBeatPress = actions.primary.pressed && this.actionInput.jumpSharesBeatButton() &&
        this.actionInput.gamepadHeld('jump', this.actionInput.getPads());
      const dropPressed = actions.move_down?.held && (actions.jump.pressed || sharedBeatPress);
      if (dropPressed && window.player.dropThrough?.()) {
        actions.jump.pressed = false; actions.primary.pressed = false;
      }
      if (actions.jump.pressed) { const r = window.handleGameAction ? window.handleGameAction('jump') : { ok: window.player.jump() }; if (r && r.ok && window.tutorialSystem && window.tutorialSystem.checkObjective && !this.hasTrackedJump) { this.hasTrackedJump = true; window.tutorialSystem.checkObjective('jump'); } }
    }
    if (actions.primary.pressed && window.BARCODE?.playerCombat) {
      for (const press of actions.primary.presses?.length ? actions.primary.presses : [{}]) {
        const result = window.BARCODE.playerCombat.resolvePrimary({ player: window.player, enemyManager: window.enemyManager,
          now: press.wallTimeMs ?? Date.now(), audioTimeSec: press.audioTimeSec });
        if (result.ok && result.targets.length) this.vibrate(0.35, 80);
      }
    }
    if (actions.interact.pressed) this.routeInteract();
    if (actions.inspect?.pressed && !window.tutorialSystem?.isActive?.()) window.BARCODE?.stageFX?.inspect();
  }

  routeInteract() {
    if (window.player && window.player.grounded === false) return { ok: false, action: 'interact', reason: 'airborne' };
    const hacking = window.hackingSystem;
    if (hacking && typeof hacking.isActive === 'function' && hacking.isActive()) {
      if (typeof hacking.processInput === 'function') hacking.processInput('h');
      return { ok: true, action: 'interact', reason: 'hacking-active' };
    }
    const tutorialActive = !!window.tutorialSystem?.isActive?.();
    if (tutorialActive && Number(window.tutorialSystem.storyChapter) < 3) {
      return { ok: false, action: 'interact', reason: 'tutorial-hack-locked' };
    }
    if (hacking && typeof hacking.start === 'function') {
      hacking.start();
      const active = typeof hacking.isActive === 'function' ? hacking.isActive() : !!hacking.active;
      if (active && window.tutorialSystem && window.tutorialSystem.isActive && window.tutorialSystem.isActive() && Number(window.tutorialSystem.storyChapter) === 3 && window.tutorialSystem.checkObjective) window.tutorialSystem.checkObjective('hack_start');
      return { ok: !!active, action: 'interact', reason: active ? 'hack-started' : 'hack-not-started' };
    }
    return { ok: false, action: 'interact', reason: 'hacking-unavailable' };
  }
  acceptsGameplay() { if (window.player?.isEntering || window.sector1Progression && window.sector1Progression.isGameplaySuppressed && window.sector1Progression.isGameplaySuppressed()) return false; return !(window.isPaused || window.isRunning === false || (window.gameState && (window.gameState.paused || window.gameState.gameOver || window.gameState.victory || window.gameState.running === false)) || (window.hackingSystem && window.hackingSystem.isActive && window.hackingSystem.isActive())); }
};

function createInputManager() { if (document && document.addEventListener) window.inputManager = new window.InputManager(); else setTimeout(createInputManager, 100); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createInputManager); else createInputManager();
