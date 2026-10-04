// Terminal-Style Hacking System for BARCODE: System Override
// Features port puzzles (OPEN/CLOSED) and memorization challenges (3-5 digits)
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/hacking.js',
  exports: ['HackingSystem', 'hackingSystem'],
  dependencies: ['randomRange', 'clamp', 'BARCODE.OverlayLayout']
});

window.HackingSystem = class HackingSystem {
  constructor() {
    this.active = false;
    this.phase = 'idle';
    this.phaseElapsedMs = 0;
    this.sessionElapsedMs = 0;
    this.bootDurationMs = 1000;
    this.answerDurationMs = 16000;
    this.hardMaxSessionMs = 22500;
    this.cooldownUntil = 0;
    this.cooldownMs = 10000;
    this.cooldownDurationMs = this.cooldownMs;
    this.resetReadyPopup();
    this.guardHitsRemaining = 0;
    this.previousRhythmModeActive = false;
    this.suspendedRhythmMode = false;
    this._startTime = 0;
    this.puzzleReadyAt = 0;
    this.currentPuzzle = null;
    this.puzzleType = null;
    this.answer = null;
    this.inputText = '';
    this.displayTime = 2000;
    this.maxDisplayTime = 2500;
    this.puzzleComplete = false;
    // Kept for lifecycle diagnostics. A hack session deliberately owns no
    // browser timers; every phase advances from update(deltaTime).
    this.puzzleTimeout = null;
    this.ownedTimeouts = new Set();
    this.runGeneration = 0;
    this.terminalLines = [];
    this.terminalHistory = [];
    this.cursorBlink = 0;
    this.feedback = null;
    this.resultFx = null;
    this.tutorialMode = false;
    this.tutorialObjective = 'hack_start';
    this.tutorialCompleteObjective = 'hack_complete';
    this._lastResultFailed = false;
    this.hijackTarget = null;
    this.panelLayout = null;
    this.resultLayout = null;
    this.resultDetail = '';
    console.log('Terminal Hacking System initialized');
  }

  // Compatibility helpers for the runtime lifecycle audit. Session phases do
  // not call trackTimeout; creation retries outside a session remain external.
  trackTimeout(callback, delay) {
    const generation = this.runGeneration;
    const handle = setTimeout(() => {
      this.ownedTimeouts.delete(handle);
      if (generation === this.runGeneration) callback();
    }, delay);
    this.ownedTimeouts.add(handle);
    return handle;
  }

  clearOwnedTimeouts() {
    this.ownedTimeouts.forEach(handle => clearTimeout(handle));
    this.ownedTimeouts.clear();
    this.puzzleTimeout = null;
  }

  safeInvoke(label, callback) {
    try {
      return callback();
    } catch (error) {
      console.warn(`[hacking] ${label} failed:`, error?.message || error);
      return undefined;
    }
  }

  restoreSuspendedRhythmMode() {
    const shouldRestore = !!(this.suspendedRhythmMode && this.previousRhythmModeActive && !window.gameState?.gameOver && (window.player?.health ?? 1) > 0 && !window.sector1Progression?.isGameplaySuppressed?.());
    try {
      if (shouldRestore) {
        if (window.rhythmSystem?.showRhythmMode) window.rhythmSystem.showRhythmMode();
        else if (window.rhythmSystem?.show) window.rhythmSystem.show();
      }
    } catch (error) {
      console.warn('[hacking] Rhythm Mode restoration failed:', error?.message || error);
    } finally {
      // These flags are session ownership. They must never survive cleanup,
      // even if a collaborator throws while being restored.
      this.previousRhythmModeActive = false;
      this.suspendedRhythmMode = false;
    }
    return shouldRestore;
  }

  getCooldownRemainingMs() { return Math.max(0, this.cooldownUntil - Date.now()); }

  // One read-only view of the same gates used by start(), for HUD and input.
  getAvailability() {
    const tutorial = !!window.tutorialSystem?.isActive?.();
    const remainingMs = tutorial ? 0 : this.getCooldownRemainingMs();
    const result = { state: 'ready', remainingMs, charge: Math.max(0, Math.min(1, 1 - remainingMs / Math.max(1, this.cooldownDurationMs))), target: null, allySeconds: 0, canStart: false };
    if (this.active) result.state = 'active';
    else if (tutorial && Number(window.tutorialSystem.storyChapter) < 3) { result.state = 'locked'; result.charge = 0; }
    else if (window.isPaused || window.gameState?.paused || window.gameState?.gameOver || window.gameState?.victory || window.sector1Progression?.isGameplaySuppressed?.()) result.state = 'unavailable';
    else if (window.player?.grounded === false) result.state = 'airborne';
    else {
      const manager = window.enemyManager, ally = !tutorial && manager?.getHijackedEnemy?.();
      if (ally) { result.state = 'linked'; result.allySeconds = Math.max(0, (ally._hijackedUntilMs - manager.simulationTimeMs) / 1000); result.canStart = true; }
      else if (remainingMs > 0) result.state = 'recharging';
      else {
        result.target = manager?.findHijackTarget?.() || null;
        result.canStart = !!result.target || tutorial && Number(window.tutorialSystem.storyChapter) === 3;
        if (!result.canStart) result.state = 'no-target';
      }
    }
    return result;
  }

  resetReadyPopup() {
    this.readyPopupAgeMs = 0;
    this.readyPopupVisible = false;
    this.readyPopupArmed = true;
    this.readyPopupAwayMs = 0;
  }

  updateReadyPopup(delta) {
    if (window.isPaused || window.gameState?.paused) return;
    const status = this.getAvailability();
    if (status.state === 'ready') {
      this.readyPopupAwayMs = 0;
      if (this.readyPopupArmed) { this.readyPopupAgeMs = 0; this.readyPopupVisible = true; this.readyPopupArmed = false; }
      else if (this.readyPopupVisible) this.readyPopupAgeMs += delta;
      if (this.readyPopupAgeMs >= 2400) this.readyPopupVisible = false;
    } else {
      this.readyPopupVisible = false;
      this.readyPopupAwayMs += delta;
      // A consumed link/cooldown arms the next recharge. Brief hops and range
      // flicker do not repeatedly announce the same available charge.
      if (['active', 'recharging', 'linked', 'locked'].includes(status.state) || this.readyPopupAwayMs >= 1000) this.readyPopupArmed = true;
    }
  }

  getReadyPopup() {
    if (!this.readyPopupVisible || this.getAvailability().state !== 'ready') return null;
    return { alpha: Math.max(0, Math.min(1, (2400 - this.readyPopupAgeMs) / 600)) };
  }

  getDiagnostics() {
    return {
      active: !!this.active,
      phase: this.phase,
      sessionElapsedMs: this.sessionElapsedMs,
      ownedTimeouts: this.ownedTimeouts.size,
      hasPuzzleTimeout: !!this.puzzleTimeout,
      runGeneration: this.runGeneration
    };
  }

  initializeTerminal() {
    this.terminalLines = [
      '> INITIATING BARCODE NETWORK ACCESS...',
      '> AUTHENTICATING USER: 6_BIT',
      '> SCANNING NETWORK VULNERABILITIES...',
      '> ESTABLISHING SECURE CONNECTION...',
      '> ACCESS GRANTED - LOADING PUZZLE MATRIX...'
    ];
    this.terminalHistory = [...this.terminalLines];
  }

  generatePortPuzzle() {
    const ranges = [[20, 99], [1024, 4999], [8000, 8999], [49152, 65535]];
    const startRange = Math.floor(Math.random() * ranges.length);
    const ports = ranges.slice(0, 3).map((unused, index) => {
      const range = ranges[(startRange + index) % ranges.length];
      const number = Math.max(range[0], Math.min(range[1], Math.floor(window.randomRange(range[0], range[1] + 1))));
      return { number, status: 'CLOSED' };
    });
    const openIndex = Math.floor(Math.random() * ports.length);
    ports[openIndex].status = 'OPEN';

    this.terminalLines.push('> SCAN RESULTS:', '');
    ports.forEach((port, index) => this.terminalLines.push(`  ${index + 1}. PORT ${port.number}: ${port.status}`));
    this.terminalLines.push('', '> WHICH PORT IS OPEN?');

    this.currentPuzzle = {
      type: 1,
      display: ports.map(port => `PORT ${port.number}: ${port.status}`).join('\n'),
      answer: String(ports[openIndex].number),
      ports,
      openIndex,
      hidden: false,
      displayTime: this.displayTime
    };
    this.answer = this.currentPuzzle.answer;
    return this.currentPuzzle;
  }

  generateMemoryPuzzle() {
    const codeLength = Math.max(3, Math.min(5, Math.floor(window.randomRange(3, 6))));
    let code = '';
    for (let index = 0; index < codeLength; index++) {
      code += String(Math.max(0, Math.min(9, Math.floor(window.randomRange(0, 10)))));
    }
    this.displayTime = 3000;
    this.maxDisplayTime = 3500;
    this.terminalLines.push('> MEMORY SEQUENCE TRANSMITTED:', '', `     ${code}`, '', '> MEMORIZE CODE - 3 SECONDS');
    this.currentPuzzle = { type: 2, display: code, answer: code, hidden: false, displayTime: this.displayTime };
    this.answer = code;
    return this.currentPuzzle;
  }

  hidePuzzle() {
    if (!this.currentPuzzle) return false;
    this.currentPuzzle.hidden = true;
    this.currentPuzzle.display = null;
    this.terminalLines = this.puzzleType === 1
      ? ['> PORT SCAN HIDDEN', '> MEMORY RETENTION REQUIRED', '> WHICH PORT WAS OPEN?', '> INPUT PORT NUMBER:']
      : ['> MEMORY SEQUENCE HIDDEN', '> MEMORY RETENTION REQUIRED', '> WHAT WAS THE CODE?', '> INPUT MEMORY SEQUENCE:'];
    return true;
  }

  beginAnswerWindow(readyAt = this.sessionElapsedMs) {
    if (!this.active || this.puzzleComplete || !this.currentPuzzle) return false;
    this.hidePuzzle();
    this.phase = 'answer';
    this.phaseElapsedMs = 0;
    this.puzzleReadyAt = readyAt;
    this._startTime = readyAt;
    return true;
  }

  useKeypad() {
    if (!this.active) return;
    this.keypadMode = true;
  }

  getPanelLayout() {
    // Interactive controls own a stable, opaque area. The renderer puts the
    // live world beside it; enemies never cut holes in the puzzle or its keys.
    return {x:1110,y:245,width:780,height:710,scale:1,clear:true,alpha:1,
      moving:false,readable:true,compact:false,docked:false,cutouts:[]};
  }
  getSceneViewport() {
    return this.active ? {x:26,y:290,width:1060,height:596.25,scale:1060/1920} : null;
  }
  getResultLayout() {
    const ui=window.BARCODE.OverlayLayout;
    return ui.present(this,'result',[{width:620,height:120}],{actors:ui.actors(this.resultFx?.target)});
  }

  getKeypad(layout = this.panelLayout || this.getPanelLayout()) {
    return ['1','2','3','4','5','6','7','8','9','Backspace','0','Enter'].map((key, i) => ({
      key, label: key === 'Backspace' ? '⌫' : key === 'Enter' ? 'Submit' : key,
      x: layout.x + (22 + (i % (layout.compact?6:3)) * (layout.compact?168:248)) * layout.scale,
      y: layout.y + ((layout.compact?194:412) + Math.floor(i / (layout.compact?6:3)) * (layout.compact?64:68)) * layout.scale,
      w: (layout.compact?156:232) * layout.scale, h: (layout.compact?54:58) * layout.scale
    }));
  }

  navigateKeypad(dx, dy) {
    this.useKeypad();
    const i = this.keypadIndex ?? 4;
    const columns=(this.panelLayout||this.getPanelLayout()).compact?6:3;
    this.keypadIndex = Math.max(0, Math.min(12/columns-1, Math.floor(i / columns) + dy)) * columns + Math.max(0, Math.min(columns-1, i % columns + dx));
  }

  activateKeypad() {
    this.useKeypad();
    return this.processInput(this.getKeypad()[this.keypadIndex ?? 4].key);
  }

  pointerInput(event) {
    if (!this.active || window.isPaused || window.gameState?.paused) return false;
    this.useKeypad();
    const canvas = document.getElementById('gameCanvas');
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return false;
    const x = (event.clientX - rect.left) * 1920 / rect.width, y = (event.clientY - rect.top) * 1080 / rect.height;
    const layout = this.panelLayout || this.getPanelLayout();
    if(layout.docked) {
      if(x>=layout.x&&x<=layout.x+layout.width&&y>=layout.y&&y<=layout.y+layout.height &&
        !(layout.cutouts||[]).some(b=>x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height))return this.processInput('Escape');
      return false;
    }
    const live=this.getPanelLayout();
    if(layout.moving || !layout.readable || live.moving || !live.readable)return false;
    const localX = (x-layout.x)/layout.scale, localY = (y-layout.y)/layout.scale;
    const cancelRight=layout.compact?1015:765;
    if (localX >= cancelRight-225 && localX <= cancelRight && localY >= 9 && localY <= 53) return this.processInput('Escape');
    const index = this.getKeypad().findIndex(k => x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h);
    if (index < 0) return false;
    this.keypadIndex = index;
    return this.activateKeypad();
  }

  processInput(key) {
    if (!this.active || this.puzzleComplete) return false;
    const value = String(key || '');
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(value)) { this.navigateKeypad(value === 'ArrowRight' ? 1 : value === 'ArrowLeft' ? -1 : 0, value === 'ArrowDown' ? 1 : value === 'ArrowUp' ? -1 : 0); return true; }
    if (value === 'Escape' || value === 'ESC') {
      this.cancel();
      return true;
    }
    if(window.BARCODE?.OverlayLayout&&!this.getPanelLayout().readable)return false;
    // The display is part of the puzzle. It cannot also be an input buffer.
    if (this.phase !== 'answer') return false;
    if (value === 'Enter') {
      this.checkAnswer();
      return true;
    }
    if (value === 'Backspace') {
      this.inputText = this.inputText.slice(0, -1);
      return true;
    }
    if (value.length === 1 && /[0-9]/.test(value)) {
      const maxLength = String(this.currentPuzzle?.answer || '').length;
      if (!maxLength || this.inputText.length < maxLength) this.inputText += value;
      return true;
    }
    return false;
  }

  start() {
    const availability = this.getAvailability();
    const tutorialActive = !!window.tutorialSystem?.isActive?.();
    if (!availability.canStart) {
      if (availability.state === 'no-target') {
        this.feedback = { type: 'failure', text: 'NO HIJACK TARGET', opacity: 1, timer: 60 };
        this.resultDetail = 'Move near an enemy marked for hijack.';
      }
      return false;
    }
    if (availability.state === 'linked') {
      window.enemyManager.releaseHijack();
      this.feedback = { type: 'success', text: 'LINK RELEASED', opacity: 1, timer: 60 };
      this.resultDetail = 'Rebooting. Stand clear before it turns hostile.';
      return true;
    }
    this._overlayPanels = {};
    this.hijackTarget = availability.target;
    this.panelLayout = null;
    this.resultLayout = null;

    this.runGeneration++;
    this.clearOwnedTimeouts();
    this.active = true;
    // A shared keypad is always visible, so its entry budget starts fairly for
    // every input device. A first pointer tap must not change the deadline.
    this.answerDurationMs = 16000; this.hardMaxSessionMs = 22500;
    this.keypadMode = false; this.keypadIndex = 4;
    if (window.BARCODE?.GamepadUI?.connected) this.useKeypad();
    this.phase = 'boot';
    this.resultFx = null;
    this.phaseElapsedMs = 0;
    this.sessionElapsedMs = 0;
    this._startTime = 0;
    this.puzzleReadyAt = 0;
    this.inputText = '';
    this.puzzleComplete = false;
    this.feedback = null;
    this.resultDetail = '';
    this.currentPuzzle = null;
    this.answer = null;
    this.guardHitsRemaining = 1;
    this._lastResultFailed = false;
    this.puzzleType = Math.floor(Math.random() * 2) + 1;
    this.displayTime = this.puzzleType === 2 ? 3000 : window.randomRange(1500, 2500);
    this.maxDisplayTime = this.displayTime + 500;
    this.initializeTerminal();

    this.previousRhythmModeActive = !!window.rhythmSystem?.isActive?.();
    this.suspendedRhythmMode = this.previousRhythmModeActive;
    if (this.previousRhythmModeActive) {
      this.safeInvoke('Rhythm Mode suspension', () => {
        if (window.rhythmSystem?.hideRhythmMode) window.rhythmSystem.hideRhythmMode();
        else if (window.rhythmSystem?.hide) window.rhythmSystem.hide();
      });
    }

    // Once the authored lock above has released H, only a hack actually
    // started in chapter 3 may satisfy the tutorial's hacking objectives.
    this.tutorialMode = tutorialActive && Number(window.tutorialSystem?.storyChapter) === 3;
    this.tutorialObjective = 'hack_start';
    this.tutorialCompleteObjective = 'hack_complete';
    return true;
  }

  update(deltaTime) {
    const delta = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
    this.updateReadyPopup(delta);
    const resultVisible=!(this.feedback||this.resultFx) || this.active || !window.BARCODE?.OverlayLayout || this.getResultLayout().readable;
    if (this.resultFx && resultVisible) {
      this.resultFx.elapsedMs += delta;
      if (this.resultFx.elapsedMs >= 1000) this.resultFx = null;
    }
    if (this.feedback && resultVisible) {
      this.feedback.timer -= delta / (1000 / 60);
      this.feedback.opacity = Math.max(0, Math.min(1, this.feedback.timer / 60));
      if (this.feedback.timer <= 0.001) this.feedback = null;
    }
    this.cursorBlink = (this.cursorBlink + delta / (1000 / 60)) % 60;
    if (!this.active) return;
    // If every readable layout is occupied, keep the unseen scan/deadline and
    // input intact while the world moves. Escape remains available throughout.
    if(window.BARCODE?.OverlayLayout&&!this.getPanelLayout().readable)return;

    this.sessionElapsedMs += delta;
    const practiceEntry = this.tutorialMode && this.phase === 'answer';
    if (!practiceEntry && this.sessionElapsedMs >= this.hardMaxSessionMs) {
      this.timeoutFailPuzzle('watchdog');
      return;
    }

    let remaining = delta;
    let transitions = 0;
    while (this.active && transitions++ < 4) {
      if (this.phase === 'boot') {
        const needed = Math.max(0, this.bootDurationMs - this.phaseElapsedMs);
        if (remaining < needed) { this.phaseElapsedMs += remaining; break; }
        remaining -= needed;
        this.phaseElapsedMs = 0;
        if (this.puzzleType === 1) this.generatePortPuzzle();
        else this.generateMemoryPuzzle();
        this.phase = 'display';
        if (remaining === 0) break;
        continue;
      }
      if (this.phase === 'display') {
        const needed = Math.max(0, this.displayTime - this.phaseElapsedMs);
        if (remaining < needed) { this.phaseElapsedMs += remaining; break; }
        remaining -= needed;
        const readyAt = this.sessionElapsedMs - remaining;
        this.beginAnswerWindow(readyAt);
        if (remaining === 0) break;
        continue;
      }
      if (this.phase === 'answer') {
        if (this.tutorialMode) { this.phaseElapsedMs += remaining; break; }
        const needed = Math.max(0, this.answerDurationMs - this.phaseElapsedMs);
        if (remaining < needed) { this.phaseElapsedMs += remaining; break; }
        this.phaseElapsedMs += needed;
        this.timeoutFailPuzzle('answer');
        break;
      }
      // Unknown/corrupt phases are left to the hard watchdog, which guarantees
      // that a malformed state cannot freeze the game indefinitely.
      break;
    }
  }

  checkAnswer() {
    if (!this.active || this.phase !== 'answer' || !this.currentPuzzle?.answer) return false;
    if (this.inputText === this.currentPuzzle.answer) this.successPuzzle();
    else this.failPuzzle();
    return true;
  }

  completeTutorialObjectivesOnSuccess(tutorialSession = this.tutorialMode) {
    if (!tutorialSession || !window.tutorialSystem) return;
    if (typeof window.tutorialSystem.checkObjective === 'function') {
      window.tutorialSystem.checkObjective('hack_start');
      window.tutorialSystem.checkObjective('hack_complete');
    }
  }

  finishSession(outcome, terminalLines) {
    window.enemyManager?.clearHackTrails?.();
    if (!this.active) return null;
    const tutorialSession = this.tutorialMode;

    // Mandatory cleanup happens before any collaborator is called. This is the
    // freeze-proof boundary: input ownership is released even if audio, health,
    // tutorial, Rhythm Mode, or pulse code throws.
    this.active = false;
    this.phase = 'result';
    this.phaseElapsedMs = 0;
    this.puzzleComplete = true;
    this.guardHitsRemaining = 0;
    this._startTime = 0;
    this.puzzleReadyAt = 0;
    this._lastResultFailed = outcome !== 'success';
    this.terminalLines = terminalLines;
    this.resultFx = outcome === 'cancel' ? null : { outcome, elapsedMs: 0, target: this.hijackTarget };
    this.feedback = null; // A cancelled guard must not become a result banner.
    this.cooldownDurationMs = this.cooldownMs;
    this.cooldownUntil = Date.now() + this.cooldownDurationMs;
    this.runGeneration++;
    this.clearOwnedTimeouts();
    this.tutorialMode = false;
    this.hijackTarget = null;
    this.tutorialObjective = null;
    this.tutorialCompleteObjective = null;

    this.restoreSuspendedRhythmMode();
    return { outcome, tutorialSession };
  }

  successPuzzle() {
    if (!this.active) return false;
    const training = this.tutorialMode && !this.hijackTarget;
    const linked = training || this.safeInvoke('enemy hijack', () => window.enemyManager?.hijackEnemy?.(this.hijackTarget));
    if (!linked) {
      this.finishSession('target-lost', ['> TARGET DISCONNECTED', '> REACQUIRE A LIVE SIGNAL']);
      this.cooldownDurationMs = 1500;
      this.cooldownUntil = Date.now() + this.cooldownDurationMs;
      this.feedback = { type: 'failure', text: 'TARGET LOST', opacity: 1, timer: 60 };
      this.resultDetail = 'The locked enemy is gone. Reacquire a live target.';
      return false;
    }
    const result = this.finishSession('success', [
      '> ACCESS GRANTED', '> AUTHENTICATION SUCCESSFUL', '> NETWORK BREACH ACHIEVED',
      training ? '> PRACTICE UPLINK COMPLETE' : '> ALLEGIANCE REWRITTEN: 6_BIT', '> TERMINATING SESSION...'
    ]);
    if (!result) return false;
    window.BARCODE?.musicDirector?.accent('hack');
    this.safeInvoke('success audio', () => window.audioSystem?.playSound?.('terminalBeep', 0.5));
    this.safeInvoke('tutorial completion', () => this.completeTutorialObjectivesOnSuccess(result.tutorialSession));
    const control = window.BARCODE?.ControllerSettings?.prompt('interact', 'H') || 'H';
    this.resultDetail = training ? 'PRACTICE COMPLETE · Find a marked enemy in the street.' : `ENEMY HIJACKED · 12 seconds · ${control} releases`;
    this.showSuccessFeedback();
    return true;
  }

  failPuzzle() {
    const training = this.tutorialMode;
    const result = this.finishSession('failure', [
      '> ACCESS DENIED', '> AUTHENTICATION FAILED', '> NETWORK BREACH ATTEMPTED',
      '> INTRUSION DETECTED', '> TERMINATING SESSION...'
    ]);
    if (!result) return false;
    if (training) this.resultDetail = 'PRACTICE · Open the uplink to try again when ready.';
    this.safeInvoke('failure audio', () => window.audioSystem?.playSound?.('terminalBuzz', 0.3));
    this.showFailureFeedback();
    return true;
  }

  cancel({ restoreRhythm = true } = {}) {
    if (!restoreRhythm) { this.previousRhythmModeActive = false; this.suspendedRhythmMode = false; }
    return !!this.finishSession('cancel', [
      '> SESSION CANCELLED BY USER', '> TERMINATING CONNECTION...', '> NETWORK ACCESS REVOKED'
    ]);
  }

  timeoutFailPuzzle(reason = 'answer') {
    const result = this.finishSession('timeout', [
      '> SIGNAL TIMEOUT', '> CONNECTION LOST', '> TRY AGAIN', '> TERMINATING SESSION...'
    ]);
    if (!result) return false;
    this.safeInvoke('timeout audio', () => window.audioSystem?.playSound?.('terminalBuzz', 0.3));
    this.showTimeoutFeedback();
    console.log(`Terminal hack timed out (${reason})`);
    return true;
  }

  absorbGuardHit() {
    if (!this.active || this.guardHitsRemaining <= 0) return false;
    this.guardHitsRemaining--;
    window.BARCODE?.combatFX?.hackDeflect?.();
    this.feedback = { text: 'SIGNAL GUARD ABSORBED', type: 'success', timer: 45, opacity: 1 };
    return true;
  }

  showSuccessFeedback() { this.feedback = { type: 'success', text: 'ACCESS GRANTED', opacity: 1, timer: 60 }; }
  showFailureFeedback() { this.feedback = { type: 'failure', text: 'ACCESS DENIED', opacity: 1, timer: 60 }; }
  showTimeoutFeedback() { this.feedback = { type: 'failure', text: 'SIGNAL TIMEOUT', opacity: 1, timer: 60 }; }

  getPresentation() {
    const phase = this.phase;
    const duration = phase === 'boot' ? this.bootDurationMs : phase === 'display' ? this.displayTime : this.answerDurationMs;
    const untimed = this.tutorialMode && phase === 'answer';
    return { phase, untimed, remainingMs: untimed ? Infinity : Math.max(0, duration - this.phaseElapsedMs),
      progress: untimed ? 0 : Math.max(0, Math.min(1, this.phaseElapsedMs / Math.max(1, duration))),
      heading: phase === 'boot' ? 'ESTABLISHING UPLINK' : phase === 'display' ? 'READ THE SIGNAL' : 'RECONSTRUCT THE SIGNAL' };
  }

  draw(ctx) {
    if (!this.active && !this.feedback && !this.resultFx) return;
    ctx.save();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.shadowBlur = 0;
    if (!this.active) {
      this.resultLayout = this.getResultLayout();
      window.BARCODE.OverlayLayout.begin(ctx,this.resultLayout);
      if(this.resultLayout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,this.resultLayout,'UPLINK RESULT');ctx.restore();return;}
      ctx.translate(this.resultLayout.x-650,this.resultLayout.y-260);
      const success = this.resultFx?.outcome === 'success' || this.feedback?.type === 'success';
      const color = success ? '#91ffe0' : '#ffb16e';
      ctx.globalAlpha *= this.feedback?.opacity ?? 1;
      ctx.fillStyle = 'rgba(5, 14, 25, 0.94)'; ctx.fillRect(650, 260, 620, 120);
      ctx.fillStyle = color; ctx.fillRect(650, 260, 5, 120);
      ctx.font = 'bold 28px monospace'; ctx.fillText(this.feedback?.text || (success ? 'ACCESS GRANTED' : 'SIGNAL INTERRUPTED'), 682, 307);
      ctx.font = '17px monospace'; ctx.fillStyle = '#d3e4eb';
      ctx.fillText(this.resultDetail || (this.resultFx?.outcome === 'timeout' ? 'Time expired. Reconnect after cooldown.' : 'Code mismatch. Reconnect after cooldown.'), 682, 345);
      ctx.globalAlpha = 1;
      this.drawResultTransfer(ctx);
      ctx.restore(); return;
    }
    this.panelLayout = this.getPanelLayout();
    window.BARCODE.OverlayLayout.begin(ctx,this.panelLayout);
    if(this.panelLayout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,this.panelLayout,'SIGNAL HELD','Scan paused • Esc / Cancel / tap to exit');ctx.restore();return;}
    ctx.translate(this.panelLayout.x,this.panelLayout.y);
    ctx.scale(this.panelLayout.scale,this.panelLayout.scale);
    if(this.panelLayout.compact){this.drawCompactTerminal(ctx);ctx.restore();return;}
    ctx.translate(-1110,-190);
    const presentation = this.getPresentation();
    const urgent = this.phase === 'answer' && presentation.remainingMs <= 1500;
    const color = urgent ? '#ffb16e' : '#91ffe0';
    ctx.fillStyle = '#040d19'; ctx.fillRect(1110, 190, 780, 710);
    ctx.strokeStyle = '#3c827f'; ctx.lineWidth = 2; ctx.strokeRect(1110, 190, 780, 710);
    ctx.fillStyle = '#91ffe0'; ctx.font = 'bold 22px monospace'; ctx.fillText('SIGNAL TERMINAL', 1132, 231);
    ctx.font = '15px monospace'; ctx.fillStyle = '#aebdcc'; ctx.textAlign = 'right';
    ctx.fillText(window.BARCODE?.GamepadUI?.connected ? `${window.BARCODE.ControllerSettings.button(1)}: Cancel` : 'Esc / Tap: Cancel', 1865, 231); ctx.textAlign = 'left';
    const labels = ['01 CONNECT', '02 READ', '03 INPUT'];
    labels.forEach((label, i) => {
      const selected = ['boot', 'display', 'answer'][i] === this.phase;
      ctx.fillStyle = selected ? '#91ffe0' : '#152d3a'; ctx.fillRect(1132 + i * 248, 250, 232, 29);
      ctx.fillStyle = selected ? '#071a24' : '#9ab2c2'; ctx.font = 'bold 15px monospace'; ctx.fillText(label, 1144 + i * 248, 270);
    });
    ctx.fillStyle = '#f1f6fb'; ctx.font = 'bold 22px monospace'; ctx.fillText(presentation.heading, 1132, 319);
    ctx.textAlign = 'right'; ctx.fillStyle = color; ctx.font = 'bold 22px monospace';
    ctx.fillText(presentation.untimed ? 'PRACTICE' : `${(presentation.remainingMs / 1000).toFixed(1)}s`, 1865, 319); ctx.textAlign = 'left';
    ctx.fillStyle = '#19313e'; ctx.fillRect(1132, 336, 732, 5);
    ctx.fillStyle = color; ctx.fillRect(1132, 336, 732 * (1 - presentation.progress), 5);
    if (this.phase === 'boot') {
      ctx.fillStyle = '#adbfcd'; ctx.font = '20px monospace';
      ctx.fillText(this.hijackTarget ? `LOCKED: ${this.hijackTarget.type.toUpperCase()} · Rewriting allegiance` : 'PRACTICE UPLINK · Learn the access sequence', 1132, 388);
      ctx.fillStyle = 'rgba(145, 255, 224, 0.28)'; ctx.fillRect(1132 + presentation.progress * 710, 358, 24, 85);
    } else if (this.phase === 'display' && !this.currentPuzzle?.hidden) {
      if (this.currentPuzzle?.type === 1) {
        this.currentPuzzle.ports.forEach((port, i) => {
          const x = 1132 + i * 248;
          ctx.fillStyle = '#102431'; ctx.fillRect(x, 358, 232, 86);
          ctx.font = 'bold 27px monospace'; ctx.fillStyle = '#f1f6fb'; ctx.fillText(String(port.number), x + 16, 391);
          ctx.font = 'bold 16px monospace'; ctx.fillStyle = port.status === 'OPEN' ? '#91ffe0' : '#d5a18b'; ctx.fillText(port.status, x + 16, 425);
        });
      } else {
        ctx.fillStyle = '#f6e9a3'; ctx.font = 'bold 46px monospace'; ctx.textAlign = 'center'; ctx.fillText(this.currentPuzzle?.display || '', 1500, 418); ctx.textAlign = 'left';
      }
    } else {
      ctx.fillStyle = '#b7c8d4'; ctx.font = '20px monospace';
      ctx.fillText(this.puzzleType === 1 ? 'Enter the port number marked OPEN.' : 'Enter the sequence you just saw.', 1132, 393);
      ctx.fillStyle = '#718897'; ctx.font = '16px monospace'; ctx.fillText('The scan is hidden. Your input is below.', 1132, 430);
    }
    ctx.fillStyle = '#07101c'; ctx.fillRect(1132, 464, 732, 78);
    ctx.strokeStyle = this.phase === 'answer' ? color : '#233c4a'; ctx.strokeRect(1132, 464, 732, 78);
    ctx.fillStyle = this.phase === 'answer' ? '#f1f6fb' : '#869aab'; ctx.font = 'bold 29px monospace';
    ctx.fillText(this.phase === 'answer' ? '> ' + (this.inputText || '_____') : '> INPUT LOCKED UNTIL SCAN ENDS', 1151, 513);
    if (this.phase === 'answer' && this.cursorBlink < 30 && this.inputText) {
      const width = ctx.measureText('> ' + this.inputText).width; ctx.fillStyle = color; ctx.fillRect(1153 + width, 489, 11, 28);
    }
    ctx.fillStyle = '#aebdcc'; ctx.font = '16px monospace';
    ctx.fillText(window.BARCODE?.GamepadUI?.connected ? `D-pad / Stick: Move   ${window.BARCODE.ControllerSettings.button(0)}: Select   ${window.BARCODE.ControllerSettings.button(2)}: Erase   ${window.BARCODE.ControllerSettings.button(1)}: Cancel` : 'Type 0–9 or tap the keys. Enter submits.', 1132, 577);
    this.getKeypad({x:1110,y:190,scale:1}).forEach((key, index) => {
      const focused = this.keypadMode && index === (this.keypadIndex ?? 4);
      ctx.fillStyle = focused ? '#91ffe0' : '#142c38'; ctx.fillRect(key.x, key.y, key.w, key.h);
      ctx.strokeStyle = focused ? '#f1f6fb' : '#628c90'; ctx.lineWidth = focused ? 3 : 1; ctx.strokeRect(key.x, key.y, key.w, key.h);
      ctx.fillStyle = focused ? '#081921' : '#f1f6fb'; ctx.font = 'bold 26px Oxanium, monospace'; ctx.textAlign = 'center';
      window.BARCODE.ComicHUD.buttonText(ctx,key.label,key.x,key.y,key.w,key.h,8);
    });
    if (this.feedback) { ctx.textAlign = 'right'; ctx.fillStyle = color; ctx.font = 'bold 14px monospace'; ctx.fillText(this.feedback.text, 1865, 891); }
    ctx.restore();
  }

  drawCompactTerminal(ctx) {
    const p=this.getPresentation(),color=this.phase==='answer'&&p.remainingMs<=1500?'#ffb16e':'#91ffe0';
    ctx.fillStyle='rgba(4,13,25,0.94)';ctx.fillRect(0,0,1040,360);ctx.strokeStyle='#3c827f';ctx.lineWidth=2;ctx.strokeRect(0,0,1040,360);
    ctx.fillStyle='#91ffe0';ctx.font='bold 22px monospace';ctx.fillText('SIGNAL TERMINAL',22,32);
    ctx.textAlign='right';ctx.font='16px monospace';ctx.fillStyle='#aebdcc';ctx.fillText(window.BARCODE?.GamepadUI?.connected?`${window.BARCODE.ControllerSettings.button(1)}: Cancel`:'Esc / Tap: Cancel',1015,32);
    ctx.textAlign='left';ctx.font='bold 22px monospace';ctx.fillStyle='#f1f6fb';ctx.fillText(p.heading,22,73);
    ctx.textAlign='right';ctx.fillStyle=color;ctx.fillText(p.untimed?'PRACTICE':`${(p.remainingMs/1000).toFixed(1)}s`,1015,73);ctx.textAlign='left';
    ctx.fillStyle='#19313e';ctx.fillRect(22,88,994,5);ctx.fillStyle=color;ctx.fillRect(22,88,994*(1-p.progress),5);
    if(this.phase==='display'&&!this.currentPuzzle?.hidden){
      if(this.currentPuzzle.type===1)this.currentPuzzle.ports.forEach((port,i)=>{ctx.font='bold 27px monospace';ctx.fillStyle=port.status==='OPEN'?'#91ffe0':'#d5a18b';ctx.fillText(`${port.number}  ${port.status}`,22+i*335,134);});
      else {ctx.font='bold 40px monospace';ctx.fillStyle='#f6e9a3';ctx.fillText(this.currentPuzzle.display,22,135);}
    }else{ctx.font='20px monospace';ctx.fillStyle='#b7c8d4';ctx.fillText(this.phase==='boot'?'Locking the signal. Watch the scan.':this.puzzleType===1?'Enter the port number marked OPEN.':'Enter the sequence you just saw.',22,126);}
    ctx.font='bold 26px monospace';ctx.fillStyle='#f1f6fb';ctx.fillText(this.phase==='answer'?'> '+(this.inputText||'_____'):'> INPUT LOCKED UNTIL SCAN ENDS',22,173);
    this.getKeypad({x:0,y:0,scale:1,compact:true}).forEach((key,index)=>{
      const focused=this.keypadMode&&index===(this.keypadIndex??4);ctx.fillStyle=focused?'#91ffe0':'#142c38';ctx.fillRect(key.x,key.y,key.w,key.h);ctx.strokeStyle=focused?'#f1f6fb':'#628c90';ctx.strokeRect(key.x,key.y,key.w,key.h);
      ctx.font='bold 26px Oxanium, monospace';ctx.fillStyle=focused?'#081921':'#f1f6fb';window.BARCODE.ComicHUD.buttonText(ctx,key.label,key.x,key.y,key.w,key.h,8);
    });
    ctx.textAlign='left';ctx.font='16px monospace';ctx.fillStyle='#aebdcc';ctx.fillText(window.BARCODE?.GamepadUI?.connected?`D-pad / Stick: Move   ${window.BARCODE.ControllerSettings.button(0)}: Select   ${window.BARCODE.ControllerSettings.button(2)}: Erase`:'Type 0–9 or tap the keys. Enter submits.',22,339);
  }

  drawResultTransfer(ctx) {
    if (!this.resultFx) return;
    const t = this.resultFx.elapsedMs / 1000;
    if (this.resultFx.outcome === 'success') {
      for (let i = 0; i < 4; i++) {
        const spread = (t * 160 + i * 18);
        ctx.strokeStyle = `rgba(192, 237, 85, ${0.6 * (1 - t)})`; ctx.lineWidth = 2;
        ctx.strokeRect(650 - spread, 260 - spread * 0.2, 620 + spread * 2, 120 + spread * 0.4);
      }
    } else {
      ctx.fillStyle = `rgba(255, 177, 110, ${0.5 * (1 - t)})`;
      for (let i = 0; i < 4; i++) ctx.fillRect(650 + ((i * 173 + t * 300) % 550), 260 + i * 30, 70, 2);
    }
  }

  isActive() { return this.active; }
  isComplete() { return this.puzzleComplete; }
  getCurrentType() { return this.puzzleType; }

  reset() {
    this._overlayPanels = {};
    window.enemyManager?.clearHackTrails?.();
    this.resetReadyPopup();
    this.hijackTarget = null;
    this.panelLayout = null;
    this.resultLayout = null;
    this.resultDetail = '';
    const shouldRestore = this.active || this.suspendedRhythmMode;
    this.active = false;
    this.phase = 'idle';
    this.resultFx = null;
    this.phaseElapsedMs = 0;
    this.sessionElapsedMs = 0;
    this.cooldownUntil = 0;
    this.guardHitsRemaining = 0;
    this._startTime = 0;
    this.puzzleReadyAt = 0;
    this.currentPuzzle = null;
    this.puzzleType = null;
    this.answer = null;
    this.inputText = '';
    this.puzzleComplete = false;
    this.feedback = null;
    this.terminalLines = [];
    this.terminalHistory = [];
    this.runGeneration++;
    this.clearOwnedTimeouts();
    this.tutorialMode = false;
    this.tutorialObjective = null;
    this.tutorialCompleteObjective = null;
    this._lastResultFailed = false;
    if (shouldRestore) this.restoreSuspendedRhythmMode();
    else {
      this.previousRhythmModeActive = false;
      this.suspendedRhythmMode = false;
    }
  }
};

function createHackingSystem() {
  if (window.hackingSystem) return;
  if (window.randomRange && window.clamp) {
    window.hackingSystem = new window.HackingSystem();
    console.log('Terminal Hacking System created');
  } else {
    console.warn('Hacking system dependencies not ready, retrying...');
    setTimeout(createHackingSystem, 100);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createHackingSystem);
else createHackingSystem();
