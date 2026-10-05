// Pointer controls feed the existing semantic input and screen owners. The
// existing gameplay/title/intro polls own synchronization; there is no new loop.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/core/touch-controls.js', exports: ['BARCODE.TouchControls'], dependencies: ['InputManager', 'BARCODE.ActionInput'] });
(function () {
  const B = window.BARCODE = window.BARCODE || {};
  const DEADZONE = .22, RADIUS = 54, DROP_SLOPE = Math.tan(35 * Math.PI / 180);
  const action = (id, label, extra = {}) => ({ id, label, action: id, ...extra });
  const command = (id, label, extra = {}) => ({ id, label, command: id, ...extra });
  const pause = () => command('pause', 'Pause', { icon: 'Ⅱ', kind: 'utility', group: 'utility' });
  const T = B.TouchControls = {
    initialized: false, enabled: false, context: null, signature: null,
    pointers: new Map(), buttons: new Map(), accessHolds: new Map(), runLatched: false, joystickPointer: null, toolsOpen: false, padsOpen: false, ownerSerial: 0,
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
      this.gears = make('div', 'touch-gears', this.root);
      this.tools = make('div', 'touch-tools', this.root); this.tools.id = 'touchTools'; this.tools.hidden = true;
      this.tools.setAttribute('role', 'group'); this.tools.setAttribute('aria-label', 'More controls');
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
        if (!spec || spec.disabled) return;
        this.consume(e);
        if (e.repeat || Array.from(this.accessHolds.values()).some(entry => entry.key === e.key && entry.spec.id === spec.id)) return;
        const owner = `touch:access:${spec.id}:${e.key}:${++this.ownerSerial}`;
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
      return { name: 'level1', key: 'level1', joystick: true, dialogue };
    },
    more() { return command('ui:more', this.toolsOpen ? 'Close' : 'More', { icon: this.toolsOpen ? '×' : '⋯', group: 'utility', kind: 'utility' }); },
    roadView() {
      const road = B.CacheRoadProof, s = road?.state || {};
      // Input and pointer polls may share a simulation frame. Reuse its bounded
      // public combat view; controls never install another clock or update owner.
      const stamp = `${s.elapsedMs}:${s.musicBeatFloat}:${s.lanePos}`;
      if (this.roadCache?.state === s && this.roadCache.stamp === stamp) return this.roadCache.view;
      const beat = Number(s.musicBeatFloat) || 0, beatSec = s.music?.grid?.beatDurationSec || 60 / 128;
      const windowSec = road?.chapter?.encounterVersion >= 2 ? .18 : .13;
      let next = null, target = Infinity;
      for (const pulse of road?.pulses?.() || []) {
        const at = s.pulseTargets?.[pulse.id];
        if (!Number.isFinite(at) || s.caughtPulses?.[pulse.id] || s.missedPulses?.[pulse.id] ||
            at < beat - windowSec / beatSec || at > beat + 4 || at >= target) continue;
        next = pulse; target = at;
      }
      const combat = s.combat && B.CacheRoadCombat?.pose?.(s.combat, road.combatInput?.() || {});
      const view = { s, next, combat, ready: !!next && Math.abs(target - beat) * beatSec <= windowSec && Math.abs((s.lanePos ?? 1.5) - next.lane) <= .38 };
      this.roadCache = { state: s, stamp, view }; return view;
    },
    roadLayout() {
      const a = action, { s, next, combat, ready } = this.roadView(), road = B.CacheRoadProof;
      const live = !s.combat?.defeated, specs = [];
      if (road?.handoffMs != null) return [pause()];
      const names = ['A', 'B', 'X', 'Y'], keys = ['road_a', 'road_b', 'road_x', 'road_y'];
      const effects = ['Surge', 'Push', 'Brace', 'Refill'];
      const face = index => a(keys[index], s.combat ? 'Sync' : effects[index], { icon: names[index], tone: names[index].toLowerCase(), aria: `${s.combat ? 'Sync' : effects[index]} ${names[index]}`, kind: 'primary' });
      if (!this.toolsOpen && next && keys[next.action]) specs.push({ ...face(next.action), id: 'road:beat', ready });
      if (this.toolsOpen) {
        if (!s.combat || this.padsOpen) specs.push(...names.map((_, i) => ({ ...face(i), group: 'tools', kind: 'secondary' })));
        if (s.combat) {
          if (!this.padsOpen) for (const [id, label, icon] of [['attack', 'Attack', '⌖'], ['defend', 'Guard', '◇'], ['turbo', 'Boost', '»'], ['disrupt', 'Jam', 'ϟ']])
            specs.push(a(`road_${id}`, label, { icon, group: 'tools', kind: 'secondary', disabled: !live || !!combat && (!combat.skills[id]?.ready || id === 'attack' && (!combat.target || combat.target.attackMode === 'shot' && combat.skills.attack.charges <= 0) || id === 'turbo' && (s.queuedTurbo || combat.skills.turbo.pending)) }));
          specs.push(command('ui:pads', this.padsOpen ? 'Skills' : 'Beat pads', { icon: this.padsOpen ? '◇' : '♫', group: 'tools' }));
        } else specs.push(a('road_turbo', 'Boost', { icon: '»', group: 'tools', disabled: s.boost <= 0 || !!s.queuedTurbo }), a('road_echo', 'Echo', { icon: '◎', group: 'tools', disabled: s.echoEnergy < 100 }));
      } else if (combat && live) {
        if (combat.target && combat.skills.attack.ready && (combat.target.attackMode === 'strike' || combat.skills.attack.charges > 0)) specs.push(a('road_attack', combat.target.attackMode === 'strike' ? 'Strike' : 'Fire', { icon: '⌖', kind: 'secondary', tone: 'b' }));
        const danger = !!s.combatDanger || combat.actors.some(actor => actor.warning || actor.threatActive) || combat.projectiles.some(shot => !shot.friendly);
        if (danger && combat.skills.defend.ready) specs.push(a('road_defend', 'Guard', { icon: '◇', kind: 'secondary', tone: 'x' }));
      }
      specs.push(a('move_down', 'Gear −', { icon: '−', group: 'gears', kind: 'gear', disabled: (s.pendingGear ?? s.gear) === 0 }), a('move_up', 'Gear +', { icon: '+', group: 'gears', kind: 'gear', disabled: (s.pendingGear ?? s.gear) === 2 }), this.more(), pause());
      return specs;
    },
    layout(context) {
      const c = command, a = action;
      switch (context.name) {
        case 'title': return [c('title:start', 'Start'), ...(!document.getElementById('continueButton')?.hidden ? [c('title:continue', 'Continue saved')] : []), c('title:settings', 'Settings')];
        case 'menu': return [c('menu:up', '↑', { aria: 'Previous menu item' }), c('menu:down', '↓', { aria: 'Next menu item' }), c('menu:left', '−', { aria: 'Decrease or previous' }), c('menu:right', '+', { aria: 'Increase or next' }), c('menu:select', 'Select'), c('menu:back', 'Back'), c('menu:resume', B.PauseMenu?.titleOpen ? 'Close settings' : 'Resume', { group: 'utility' })];
        case 'difficulty': return [c('difficulty:left', 'Previous'), c('difficulty:right', 'Next'), c('difficulty:recovery', 'Recovery mode'), c('difficulty:begin', 'Begin level')];
        case 'intro-paused': return [c('pause', 'Resume')];
        case 'intro': return [c('intro:dialogue', 'Continue', { icon: '›', kind: 'primary' }), c('intro:scene', 'Next scene'), ...(this.toolsOpen ? [c('intro:transcript', 'Transcript', { group: 'tools' }), c('intro:caption', 'Caption', { group: 'tools' }), c('intro:skip', 'Hold to skip', { hold: true, group: 'tools' })] : []), this.more(), pause()];
        case 'comic-paused': return [c('pause', 'Resume')];
        case 'comic': return [c('comic:dialogue', 'Continue', { icon: '›', kind: 'primary' }), ...(this.toolsOpen ? [c('comic:scene', 'Next scene', { group: 'tools' }), c('comic:transcript', 'Transcript', { group: 'tools' }), c('comic:skip', 'Hold to skip', { hold: true, group: 'tools' }), c('comic:back', 'Back', { group: 'tools' })] : []), this.more(), pause()];
        case 'road-intro': return [c('road:intro', 'Drive'), pause()];
        case 'road-outro': return [c('road:outro', 'Continue'), pause()];
        case 'road-results': return [...(B.CacheRoadProof?.resultButtons?.() || []).map(button => c(`road:result:${button.id}`, button.label)), ...(B.CacheRoadProof?.chapter?.delivery ? [c('road:result:save', 'Save')] : []), pause()];
        case 'proof-results': return [c('proof:retry', 'Retry'), c('proof:exit', 'Back'), pause()];
        case 'results': return [c('result:retry', 'Retry'), ...(window.gameState?.victory ? [c('result:continue', 'Continue')] : []), c('result:title', 'Title')];
        case 'hack': return [...['1','2','3','4','5','6','7','8','9','Backspace','0','Enter'].map(key => c(`hack:${key}`, key === 'Backspace' ? '⌫' : key === 'Enter' ? 'Submit' : key, { aria: key === 'Backspace' ? 'Delete last digit' : key })), c('hack:Escape', 'Cancel', { group: 'utility' }), pause()];
        case 'road': return this.roadLayout();
        case 'level3': return [a('jump', 'Jump', { icon: '↑', kind: 'primary' }), a('inspect', 'Fire', { icon: '⌖', kind: 'secondary' }), pause()];
        case 'level1': {
          const active = !!window.rhythmSystem?.isActive?.(), hack = window.hackingSystem?.getAvailability?.();
          const rhythmAvailable = active || (window.rhythmSystem?.canEnterRhythmMode?.()?.ok ?? (!window.tutorialSystem?.isActive?.() || window.tutorialSystem.storyChapter >= 2));
          return [a('jump', 'Jump', { icon: '↑', kind: 'primary' }), ...(active || !window.rhythmSystem?.isActive ? [a('primary', 'Beat', { icon: '◎', kind: 'secondary' })] : []),
            ...(hack?.canStart ? [a('interact', hack.state === 'linked' ? 'Link' : 'Hack', { icon: '⌘', kind: 'secondary' })] : []),
            ...(rhythmAvailable ? [a('rhythm_mode', active ? 'Exit' : 'Rhythm', { icon: '♫', kind: 'secondary' })] : []),
            ...(this.toolsOpen ? [a('inspect', 'Inspect', { icon: '◉', group: 'tools' }), a('run', 'Run', { icon: '»', toggle: true, group: 'tools' })] : []),
            ...(context.dialogue ? [c('tutorial:continue', 'Next', { icon: '›', aria: 'Continue dialogue', group: 'utility' })] : []), this.more(), pause()];
        }
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
      if (signature !== this.signature) this.releaseAll('context-change');
      this.context = context; this.signature = signature;
      if (this.root.dataset.context !== context.name) this.root.dataset.context = context.name;
      const hidden = !this.enabled || ['hidden', 'loading'].includes(context.name);
      if (this.root.hidden !== hidden) this.root.hidden = hidden;
      this.root.classList.toggle('touch-gameplay', !!context.joystick);
      this.root.classList.toggle('touch-road', context.name === 'road');
      this.root.classList.toggle('touch-keypad', context.name === 'hack');
      this.root.classList.toggle('touch-tools-open', this.toolsOpen);
      if (this.tools.hidden !== !this.toolsOpen) this.tools.hidden = !this.toolsOpen;
      this.joystick.hidden = !context.joystick;
      const label = context.name === 'road' ? 'STEER' : this.runLatched ? 'RUN' : 'MOVE';
      if (this.stickLabel.textContent !== label) this.stickLabel.textContent = label;
      if (this.hint.textContent) this.hint.textContent = '';
      this.reconcile(this.layout(context));
    },
    reconcile(specs) {
      const desired = new Map(specs.map(spec => [spec.id, spec]));
      // A cue may change during a press. Its captured semantic action and node
      // stay fixed until the last finger/key releases; steering is independent.
      for (const [id, current] of this.buttons) if (this.controlHeld(id)) desired.set(id, current.spec);
      for (const [id, current] of this.buttons) if (!desired.has(id)) {
        current.node.remove(); this.buttons.delete(id);
      }
      for (const spec of desired.values()) {
        let current = this.buttons.get(spec.id);
        if (!current) {
          const button = document.createElement('button'); button.type = 'button'; button.dataset.touchAction = spec.id;
          const icon = document.createElement('span'), label = document.createElement('span');
          icon.className = 'touch-icon'; icon.setAttribute('aria-hidden', 'true'); label.className = 'touch-label';
          button.appendChild(icon); button.appendChild(label);
          current = { node: button, icon, label, spec }; this.buttons.set(spec.id, current);
          // Native accessible activation reads the current spec, never a stale cue.
          button.addEventListener('click', e => {
            this.consume(e); const live = this.buttons.get(button.dataset.touchAction)?.spec;
            if (!live || live.disabled || e.detail !== 0 || live.hold) return;
            const owner = `touch:access:${live.id}:${++this.ownerSerial}`; this.activate(live, owner, e, button);
            if (live.action && !live.toggle) window.inputManager?.actionInput?.releaseVirtualOwner(owner);
            this.sync();
          });
        }
        const { node, icon, label } = current; current.spec = spec;
        const className = `touch-button${spec.kind === 'primary' ? ' touch-primary' : spec.kind === 'secondary' ? ' touch-secondary' : ''}`;
        // Do not rewrite className on held nodes: pointer feedback belongs to them.
        if (current.visualClass !== className) { node.className = className; current.visualClass = className; }
        if (icon.textContent !== (spec.icon || '')) icon.textContent = spec.icon || '';
        if (icon.hidden !== !spec.icon) icon.hidden = !spec.icon;
        if (label.textContent !== spec.label) label.textContent = spec.label;
        const attrs = { 'aria-label': spec.aria || spec.label, 'data-kind': spec.kind || 'secondary', 'data-tone': spec.tone || 'neutral', 'data-ready': String(!!spec.ready) };
        if (spec.toggle) attrs['aria-pressed'] = String(this.runLatched);
        if (spec.id === 'ui:more') { attrs['aria-expanded'] = String(this.toolsOpen); attrs['aria-controls'] = 'touchTools'; }
        for (const [name, value] of Object.entries(attrs)) if (node.getAttribute(name) !== value) node.setAttribute(name, value);
        if (node.disabled !== !!spec.disabled) node.disabled = !!spec.disabled;
        const parent = spec.group === 'utility' ? this.utilities : spec.group === 'tools' ? this.tools : spec.group === 'gears' ? this.gears : this.actions;
        if (node.parentNode !== parent) parent.appendChild(node);
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
      // Browsers reuse a finger's pointer ID. A cancelled later gesture must
      // never erase a completed tap from that finger awaiting the shared frame.
      const owner = `touch:pointer:${event.pointerId}:${++this.ownerSerial}`, node = joystick ? this.joystick : button;
      const entry = { owner, node, joystick, spec: joystick ? null : this.buttons.get(button.dataset.touchAction)?.spec };
      if (!joystick && (!entry.spec || entry.spec.disabled)) return;
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
      if (spec.disabled) return;
      if (spec.command === 'ui:more' || spec.command === 'ui:pads') {
        // Hiding a panel must release its held controls, without cancelling the
        // other thumb's steering or unrelated physical input.
        const group = spec.command === 'ui:pads' || this.toolsOpen ? 'tools' : undefined;
        for (const [id, entry] of this.pointers) if (!entry.joystick && entry.spec?.group === group) this.releasePointer(id, true);
        for (const [key, entry] of this.accessHolds) if (entry.spec.group === group) {
          this.accessHolds.delete(key); input?.actionInput?.releaseVirtualOwner(key, { discardPresses: true });
          if (entry.spec.hold && !this.controlHeld(entry.spec.id)) input?.touchCommand?.(entry.spec.command, false);
        }
        if (spec.command === 'ui:pads') this.padsOpen = !this.padsOpen;
        else { this.toolsOpen = !this.toolsOpen; this.padsOpen = false; }
      } else if (spec.toggle) {
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
      this.toolsOpen = false;
      this.padsOpen = false;
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
