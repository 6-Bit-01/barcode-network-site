// Pointer controls feed the existing semantic input and screen owners. The
// existing gameplay/title/intro polls own synchronization; there is no new loop.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/core/touch-controls.js', exports: ['BARCODE.TouchControls'], dependencies: ['InputManager', 'BARCODE.ActionInput'] });
(function () {
  const B = window.BARCODE = window.BARCODE || {};
  const DEADZONE = .22, RADIUS = 54, DROP_SLOPE = Math.tan(35 * Math.PI / 180);
  const action = (id, label, extra = {}) => ({ id, label, action: id, ...extra });
  const command = (id, label, extra = {}) => ({ id, label, command: id, ...extra });
  const pause = () => command('pause', 'Pause', { group: 'utility' });
  const T = B.TouchControls = {
    initialized: false, enabled: false, context: null, signature: null,
    pointers: new Map(), buttons: new Map(), accessHolds: new Map(), runLatched: false, joystickPointer: null,
    init() {
      if (this.initialized || !document.body) return;
      this.initialized = true;
      this.media = window.matchMedia?.('(pointer: coarse)');
      this.enabled = !!this.media?.matches;
      const make = (tag, className, parent) => { const node = document.createElement(tag); node.className = className; parent?.appendChild(node); return node; };
      this.root = make('div', 'touch-controls', document.body); this.root.id = 'touchControls';
      this.root.setAttribute('role', 'group'); this.root.setAttribute('aria-label', 'Touch game controls');
      this.root.hidden = true;
      this.joystick = make('div', 'touch-joystick', this.root); this.joystick.id = 'touchJoystick';
      this.joystick.setAttribute('role', 'group');
      this.joystick.setAttribute('aria-label', 'Drag to move. Hold down and tap Jump to drop through a platform.');
      this.base = make('div', 'touch-stick-base', this.joystick);
      this.thumb = make('div', 'touch-stick-thumb', this.base);
      this.stickLabel = make('span', 'touch-stick-label', this.joystick);
      this.stickLabel.textContent = 'MOVE';
      this.actions = make('div', 'touch-actions', this.root);
      this.utilities = make('div', 'touch-utilities', this.root);
      this.readout = make('div', 'touch-readout', this.root); this.readout.id = 'touchReadout';
      this.readout.setAttribute('role', 'status'); this.readout.setAttribute('aria-live', 'polite');
      this.readout.hidden = true;
      // Reading/scrolling the status must not activate a canvas menu beneath it.
      for (const type of ['pointerdown', 'mousedown', 'click']) this.readout.addEventListener(type, e => e.stopPropagation());
      this.hint = make('div', 'touch-hint', this.root); this.hint.setAttribute('aria-live', 'polite');
      this.onDown = e => this.pointerDown(e);
      this.onMove = e => this.pointerMove(e);
      this.onUp = e => this.pointerUp(e, e.type !== 'pointerup');
      this.root.addEventListener('pointerdown', this.onDown);
      this.root.addEventListener('pointermove', this.onMove);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.root.addEventListener(type, this.onUp);
      // Capture can be refused by an embed/browser. Release an already-owned
      // pointer outside the surface too; unrelated pointers are never consumed.
      window.addEventListener('pointerup', this.onUp, { capture: true });
      window.addEventListener('pointercancel', this.onUp, { capture: true });
      // Only the control surface suppresses gestures. The rest of the page and
      // native controls keep their normal browser behavior.
      this.root.addEventListener('contextmenu', e => { if (!this.readout.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } });
      this.root.addEventListener('keydown', e => {
        if (![' ', 'Enter'].includes(e.key)) return;
        const spec = this.buttons.get(e.target.dataset?.touchAction)?.spec;
        if (!spec) return;
        this.consume(e);
        const owner = `touch:access:${spec.id}:${e.key}`;
        if (e.repeat || this.accessHolds.has(owner)) return;
        const alreadyHeld = this.controlHeld(spec.id);
        this.accessHolds.set(owner, { spec, key: e.key });
        if (spec.action && !spec.toggle || !alreadyHeld) this.activate(spec, owner, e, e.target);
        this.sync();
      });
      window.addEventListener('keyup', e => {
        if (![' ', 'Enter'].includes(e.key)) return;
        for (const [owner, entry] of this.accessHolds) {
          if (entry.key !== e.key) continue;
          const { spec } = entry;
          this.accessHolds.delete(owner);
          window.inputManager?.actionInput?.releaseVirtualOwner(owner);
          if (spec.hold && !this.controlHeld(spec.id)) window.inputManager?.touchCommand?.(spec.command, false);
        }
      });
      window.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch' && !this.enabled) { this.enabled = true; this.sync(); }
      }, { capture: true, passive: true });
      window.addEventListener('blur', () => this.releaseAll('blur'));
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll('hidden'); this.sync(); });
      window.addEventListener('resize', () => { this.releaseAll('resize'); this.sync(); });
      this.media?.addEventListener?.('change', e => { if (e.matches) this.enabled = true; this.sync(); });
      this.sync();
    },
    getContext() {
      if (document.hidden) return { name: 'hidden', key: 'hidden' };
      const intro = window.cutsceneSystem, menu = B.PauseMenu, road = B.CacheRoadProof;
      const comic = B.CacheEnding?.active ? B.CacheEnding : B.CacheBridge?.active ? B.CacheBridge : null;
      if (intro?.isActive) return { name: intro.userPaused || intro.pausePending ? 'intro-paused' : 'intro', key: `intro:${intro.cutsceneGeneration}:${!!intro.userPaused}:${!!intro.pausePending}:${!!intro.transcriptOpen}` };
      const paused = !!(window.isPaused || window.gameState?.paused);
      if (comic && paused) return { name: 'comic-paused', key: 'comic-paused' };
      if (menu?.titleOpen || paused) return { name: 'menu', key: `menu:${!!menu?.titleOpen}:${menu?.view}:${!!menu?.captureAction}` };
      if (B.LevelDifficulty?.open) return { name: 'difficulty', key: `difficulty:${B.LevelDifficulty.levelId}` };
      if (comic) return { name: 'comic', key: `comic:${comic === B.CacheEnding ? 'ending' : 'bridge'}:${comic.generation}:${comic.page}:${!!comic.pending}:${!!comic.transcriptOpen}`, comic };
      if (road?.active) {
        if (road.presentationPreparing || road.exiting) return { name: 'loading', key: 'road-loading' };
        if (road.introMs != null) return { name: 'road-intro', key: 'road-intro' };
        if (road.outroMs != null) return { name: 'road-outro', key: 'road-outro' };
        if (road.status !== 'playing') return { name: 'road-results', key: `road-results:${road.status}:${!!road.chapter?.delivery}:${road.resultControlsReady}` };
        return { name: 'road', key: `road:${!!road.state?.combat}:${road.presentationGeneration}`, joystick: true };
      }
      const proof = B.RunAndGunProof;
      if (proof?.active) return { name: proof.status === 'playing' ? 'level3' : 'proof-results', key: `proof:${proof.status}`, joystick: proof.status === 'playing' };
      if (window.hackingSystem?.isActive?.()) return { name: 'hack', key: `hack:${window.hackingSystem.phase}:${!!window.hackingSystem.puzzleComplete}` };
      if (window.gameState?.gameOver || window.gameState?.victory) return { name: 'results', key: `results:${!!window.gameState.victory}:${window.sector1Progression?.areCompletionControlsReady?.()}` };
      const overlay = document.getElementById('startOverlay');
      if (overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none') {
        const start = document.getElementById('startButton'), saved = document.getElementById('continueButton');
        return { name: 'title', key: `title:${!!start?.disabled}:${!!saved?.hidden}` };
      }
      if (!window.isRunning) return { name: 'loading', key: 'loading' };
      const tutorial = window.tutorialSystem;
      const dialogue = tutorial?.isActive?.() && tutorial.getInstructionOwner?.() === 'dialogue';
      return { name: 'level1', key: `level1:${!!dialogue}:${tutorial?.storyChapter}:${!!window.rhythmSystem?.isActive?.()}`, joystick: true, dialogue };
    },
    layout(context) {
      const c = command, a = action;
      switch (context.name) {
        case 'title': return [c('title:start', 'Start'), ...(!document.getElementById('continueButton')?.hidden ? [c('title:continue', 'Continue saved')] : []), c('title:settings', 'Settings')];
        case 'menu': return [c('menu:up', '↑', { aria: 'Previous menu item' }), c('menu:down', '↓', { aria: 'Next menu item' }), c('menu:left', '−', { aria: 'Decrease or previous' }), c('menu:right', '+', { aria: 'Increase or next' }), c('menu:select', 'Select'), c('menu:back', 'Back'), c('menu:resume', B.PauseMenu?.titleOpen ? 'Close settings' : 'Resume', { group: 'utility' })];
        case 'difficulty': return [c('difficulty:left', 'Previous'), c('difficulty:right', 'Next'), c('difficulty:recovery', 'Recovery mode'), c('difficulty:begin', 'Begin level')];
        case 'intro-paused': return [c('pause', 'Resume')];
        case 'intro': return [c('intro:dialogue', 'Dialogue'), c('intro:scene', 'Next scene'), c('intro:transcript', 'Transcript'), c('intro:caption', 'Caption'), c('intro:skip', 'Hold to skip', { hold: true }), pause()];
        case 'comic-paused': return [c('pause', 'Resume')];
        case 'comic': return [c('comic:dialogue', 'Dialogue'), c('comic:scene', 'Next scene'), c('comic:transcript', 'Transcript'), c('comic:skip', 'Hold to skip', { hold: true }), c('comic:back', 'Back'), pause()];
        case 'road-intro': return [c('road:intro', 'Drive'), pause()];
        case 'road-outro': return [c('road:outro', 'Continue'), pause()];
        case 'road-results': return [...(B.CacheRoadProof?.resultButtons?.() || []).map(button => c(`road:result:${button.id}`, button.label)), ...(B.CacheRoadProof?.chapter?.delivery ? [c('road:result:save', 'Save')] : []), pause()];
        case 'proof-results': return [c('proof:retry', 'Retry'), c('proof:exit', 'Back'), pause()];
        case 'results': return [c('result:retry', 'Retry'), ...(window.gameState?.victory ? [c('result:continue', 'Continue')] : []), c('result:title', 'Title')];
        case 'hack': return [...['1','2','3','4','5','6','7','8','9','Backspace','0','Enter'].map(key => c(`hack:${key}`, key === 'Backspace' ? '⌫' : key === 'Enter' ? 'Submit' : key, { aria: key === 'Backspace' ? 'Delete last digit' : key })), c('hack:Escape', 'Cancel', { group: 'utility' }), pause()];
        case 'road': return [a('move_down', 'Gear −'), a('move_up', 'Gear +'), a('road_x', 'X · BRACE'), a('road_y', 'Y · REFILL'), a('road_a', 'A · SURGE'), a('road_b', 'B · PUSH'), a('road_turbo', 'Boost'), ...(B.CacheRoadProof?.state?.combat ? [a('road_attack', 'Attack'), a('road_defend', 'Defend'), a('road_disrupt', 'Disrupt')] : [a('road_echo', 'Echo')]), pause()];
        case 'level3': return [a('jump', 'Jump'), a('inspect', 'Fire'), pause()];
        case 'level1': return [a('jump', 'Jump'), a('primary', 'Beat'), a('interact', 'Hack'), a('rhythm_mode', window.rhythmSystem?.isActive?.() ? 'Exit rhythm' : 'Rhythm'), a('inspect', 'Inspect'), a('run', 'Run', { toggle: true }), ...(context.dialogue ? [c('tutorial:continue', 'Continue', { group: 'utility' })] : []), pause()];
        default: return [];
      }
    },
    sync() {
      if (!this.initialized) return;
      // A fine-pointer desktop never computes game contexts or builds a hidden
      // control layout. A real touch or coarse-pointer device enables it.
      if (!this.enabled) { this.root.hidden = true; return; }
      const context = this.getContext(), signature = `${this.enabled}:${context.key}`;
      this.updateReadout(context);
      if (signature === this.signature) return;
      this.releaseAll('context-change');
      this.context = context; this.signature = signature;
      this.root.dataset.context = context.name;
      this.root.hidden = !this.enabled || ['hidden', 'loading'].includes(context.name);
      this.root.classList.toggle('touch-gameplay', !!context.joystick);
      this.root.classList.toggle('touch-road', context.name === 'road');
      this.root.classList.toggle('touch-keypad', context.name === 'hack');
      this.joystick.hidden = !context.joystick;
      this.stickLabel.textContent = context.name === 'road' ? 'STEER' : 'MOVE';
      this.hint.textContent = context.name === 'level1' ? 'Outer stick: run · Down + Jump: drop' : context.name === 'road' ? 'Steer left · Beat pads and skills right' : '';
      this.actions.replaceChildren(); this.utilities.replaceChildren(); this.buttons.clear();
      for (const spec of this.layout(context)) {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'touch-button'; button.dataset.touchAction = spec.id;
        button.textContent = spec.label; button.setAttribute('aria-label', spec.aria || spec.label);
        if (spec.toggle) button.setAttribute('aria-pressed', 'false');
        this.buttons.set(spec.id, { node: button, spec });
        (spec.group === 'utility' ? this.utilities : this.actions).appendChild(button);
        // Assistive technology and keyboard activation use the same route.
        button.addEventListener('click', e => {
          this.consume(e);
          if (e.detail !== 0 || spec.hold) return;
          const owner = `touch:access:${spec.id}`;
          this.activate(spec, owner, e, button);
          if (spec.action && !spec.toggle) window.inputManager?.actionInput?.releaseVirtualOwner(owner);
          this.sync();
        });
      }
    },
    updateReadout(context) {
      let text = '';
      if (context.name === 'menu') text = B.PauseMenu?.touchReadout?.() || '';
      else if (context.name === 'difficulty') {
        const difficulty = B.LevelDifficulty, choice = difficulty?.profile?.()?.choices[difficulty.selected];
        if (choice) text = `${choice.label}\n${choice.description}\nRecovery: ${difficulty.recoveryMode === 'full-run' ? 'Full run' : 'Objective checkpoints'}`;
      }
      if (this.readout.textContent !== text) this.readout.textContent = text;
      if (this.readout.hidden !== !text) this.readout.hidden = !text;
    },
    consume(event) { event.preventDefault?.(); event.stopPropagation?.(); },
    pointerDown(event) {
      if (event.button != null && event.button !== 0) return;
      if (this.readout.contains(event.target)) return;
      this.consume(event); this.sync();
      if (this.root.hidden || this.pointers.has(event.pointerId)) return;
      const joystick = event.target === this.joystick || this.joystick.contains(event.target);
      const button = event.target.closest?.('[data-touch-action]');
      if (!joystick && (!button || !this.root.contains(button))) return;
      if (joystick && this.joystickPointer !== null) return;
      const owner = `touch:pointer:${event.pointerId}`, node = joystick ? this.joystick : button;
      const entry = { owner, node, joystick, spec: joystick ? null : this.buttons.get(button.dataset.touchAction)?.spec };
      if (!joystick && !entry.spec) return;
      this.pointers.set(event.pointerId, entry);
      try { node.setPointerCapture?.(event.pointerId); } catch (_) { /* Release events still bubble on the surface. */ }
      if (joystick) {
        this.joystickPointer = event.pointerId;
        const rect = this.joystick.getBoundingClientRect();
        const radius = Math.min(RADIUS, rect.width / 2, rect.height / 2);
        entry.x = Math.max(radius, Math.min(rect.width - radius, event.clientX - rect.left));
        entry.y = Math.max(radius, Math.min(rect.height - radius, event.clientY - rect.top));
        this.base.style.left = `${entry.x}px`; this.base.style.top = `${entry.y}px`;
        this.joystick.classList.add('is-held'); this.pointerMove(event);
      } else {
        button.classList.add('is-held');
        const sameCommandHeld = this.controlHeld(entry.spec.id, entry.owner);
        if (entry.spec.action && !entry.spec.toggle || !sameCommandHeld) this.activate(entry.spec, owner, event, button);
      }
      this.sync();
    },
    activate(spec, owner, event, node) {
      const input = window.inputManager;
      if (spec.toggle) {
        this.runLatched = !this.runLatched;
        input?.actionInput?.setVirtualAction('run', 'touch:run-toggle', this.runLatched, event);
        node?.setAttribute('aria-pressed', String(this.runLatched));
        node?.classList.toggle('is-latched', this.runLatched);
      } else if (spec.action) input?.actionInput?.setVirtualAction(spec.action, owner, true, event);
      else input?.touchCommand?.(spec.command, true);
    },
    controlHeld(id, exceptOwner = null) {
      for (const entry of this.pointers.values()) if (entry.owner !== exceptOwner && entry.spec?.id === id) return true;
      for (const [owner, entry] of this.accessHolds) if (owner !== exceptOwner && entry.spec.id === id) return true;
      return false;
    },
    pointerMove(event) {
      this.sync();
      const entry = this.pointers.get(event.pointerId);
      if (!entry) return;
      this.consume(event);
      if (!entry.joystick) return;
      const rect = this.joystick.getBoundingClientRect();
      let dx = event.clientX - rect.left - entry.x, dy = event.clientY - rect.top - entry.y;
      const distance = Math.hypot(dx, dy);
      if (distance > RADIUS) { dx *= RADIUS / distance; dy *= RADIUS / distance; }
      const x = dx / RADIUS, y = dy / RADIUS, input = window.inputManager?.actionInput;
      this.thumb.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
      const down = this.context.name !== 'road' && y >= .7 && Math.abs(x) <= y * DROP_SLOPE;
      input?.setVirtualAction('move_left', entry.owner, x < -DEADZONE && !down, event);
      input?.setVirtualAction('move_right', entry.owner, x > DEADZONE && !down, event);
      input?.setVirtualAction('move_down', entry.owner, down, event);
      input?.setVirtualAction('run', entry.owner, this.context.name === 'level1' && Math.abs(x) >= .82 && !down, event);
    },
    pointerUp(event, cancelled = false) {
      const entry = this.pointers.get(event.pointerId);
      if (!entry) return;
      this.consume(event);
      this.releasePointer(event.pointerId, cancelled);
      this.sync();
    },
    releasePointer(id, cancelled) {
      const entry = this.pointers.get(id);
      if (!entry) return;
      this.pointers.delete(id);
      window.inputManager?.actionInput?.releaseVirtualOwner(entry.owner, { discardPresses: cancelled });
      if (entry.spec?.hold && !this.controlHeld(entry.spec.id)) window.inputManager?.touchCommand?.(entry.spec.command, false);
      if (!Array.from(this.pointers.values()).some(other => other.node === entry.node)) entry.node.classList.remove('is-held');
      if (entry.joystick) { this.joystickPointer = null; this.base.style.left = '50%'; this.base.style.top = '50%'; this.thumb.style.transform = 'translate(-50%, -50%)'; }
      try { if (entry.node.hasPointerCapture?.(id)) entry.node.releasePointerCapture(id); } catch (_) { /* Already lost capture. */ }
    },
    releaseAll(reason = 'release') {
      for (const id of Array.from(this.pointers.keys())) this.releasePointer(id, true);
      // A completed tap may still be queued. Discard it at a handoff, while the
      // independent keyboard queue and held keys stay intact.
      window.inputManager?.actionInput?.clearVirtualActions();
      window.cutsceneSystem?.endSkipHold?.('touch');
      B.CacheBridge?.holdSkip?.('touch', false); B.CacheEnding?.holdSkip?.('touch', false);
      this.runLatched = false;
      this.accessHolds.clear();
      const run = this.buttons.get('run')?.node;
      run?.setAttribute('aria-pressed', 'false'); run?.classList.remove('is-latched');
      this.lastRelease = reason;
    },
    diagnostics() { return { initialized: this.initialized, enabled: this.enabled, context: this.context?.name, pointers: this.pointers.size, joystickPointer: this.joystickPointer, runLatched: this.runLatched, lastRelease: this.lastRelease, actions: Array.from(this.buttons.keys()), ownsLoop: false }; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => T.init(), { once: true });
  else T.init();
})();
