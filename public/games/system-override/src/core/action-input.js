// Semantic action input boundary for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/core/action-input.js',
  exports: ['BARCODE.ActionInput'],
  dependencies: []
});

(function() {
  const BARCODE = window.BARCODE = window.BARCODE || {};
  const ACTIONS = ['move_left', 'move_right', 'move_up', 'move_down', 'run', 'jump', 'primary', 'interact', 'inspect', 'pause', 'rhythm_mode',
    'road_a', 'road_b', 'road_x', 'road_y', 'road_turbo', 'road_echo', 'road_attack', 'road_defend', 'road_disrupt'];
  const EDGE_ACTIONS = new Set(['jump', 'primary', 'interact', 'inspect', 'pause', 'rhythm_mode',
    'road_a', 'road_b', 'road_x', 'road_y', 'road_turbo', 'road_echo', 'road_attack', 'road_defend', 'road_disrupt']);
  const ROAD_EDGE_ACTIONS = new Set([...EDGE_ACTIONS, 'move_up', 'move_down']);
  // Dropping through a platform is deliberate: at least 70% downward travel,
  // within 35 degrees of straight down. Walking/menu deadzones stay separate.
  const DROP_STICK_MIN = 0.7;
  const DROP_STICK_SLOPE = Math.tan(35 * Math.PI / 180);
  const DEFAULT_KEYBOARD = {
    move_left: ['arrowleft', 'a'],
    move_right: ['arrowright', 'd'],
    move_up: ['arrowup', 'w'],
    move_down: ['arrowdown', 's'],
    run: ['shift'],
    jump: [' ', 'arrowup', 'w'],
    primary: ['arrowdown'],
    interact: ['h'],
    inspect: ['e'],
    pause: ['p'],
    rhythm_mode: ['r'],
    // A right-hand diamond keeps the left hand free to steer and change speed.
    road_a: ['k'], road_b: ['l'], road_x: ['j'], road_y: ['i'],
    road_turbo: [' '], road_echo: ['h'],
    // Fresh combat uses shoulder/trigger skills. The old Echo action remains
    // available to historical road versions; the road owner chooses its rules.
    road_attack: ['f'], road_defend: ['g'], road_disrupt: ['v']
  };
  const DEFAULT_GAMEPAD = {
    move_left: [{ axis: 0, dir: -1 }, { button: 14 }],
    move_right: [{ axis: 0, dir: 1 }, { button: 15 }],
    move_up: [{ axis: 1, dir: -1 }, { button: 12 }],
    move_down: [{ axis: 1, dir: 1 }, { button: 13 }],
    run: [{ button: 6 }],
    jump: [{ button: 0 }],
    primary: [{ button: 0 }],
    interact: [{ button: 3 }],
    inspect: [{ button: 5 }],
    pause: [{ button: 9 }],
    rhythm_mode: [{ button: 4 }],
    road_a: [{ button: 0 }], road_b: [{ button: 1 }],
    road_x: [{ button: 2 }], road_y: [{ button: 3 }],
    road_turbo: [{ button: 4 }], road_echo: [{ button: 5 }],
    road_attack: [{ button: 5 }], road_defend: [{ button: 7 }], road_disrupt: [{ button: 6 }]
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function keyName(eventOrKey) { return String(eventOrKey && eventOrKey.key !== undefined ? eventOrKey.key : eventOrKey).toLowerCase(); }
  function stateTemplate() { const out = {}; ACTIONS.forEach(action => out[action] = { held: false, pressed: false, released: false, suppressed: false }); return out; }

  class ActionInput {
    constructor(options = {}) {
      this.keyboardBindings = clone(options.keyboardBindings || DEFAULT_KEYBOARD);
      this.gamepadBindings = clone(options.gamepadBindings || DEFAULT_GAMEPAD);
      this.customGamepadBindings = !!options.gamepadBindings;
      this.keysHeld = new Set();
      this.previousHeld = {};
      this.pendingPresses = {};
      // Semantic touch sources never share the physical keyboard's key set.
      this.virtualOwners = new Map();
      this.virtualPresses = {};
      this.state = stateTemplate();
      this.listenerCount = 0;
      this.disposed = false;
      this.suppression = { gameplayActive: true, paused: false, gameOver: false, cutscene: false, dialogue: false, stopped: false };
      this._keydown = e => this.handleKeyDown(e);
      this._keyup = e => this.handleKeyUp(e);
      if (options.attach === true) this.attach();
    }
    attach() { if (this.attached || !window.addEventListener) return; window.addEventListener('keydown', this._keydown); window.addEventListener('keyup', this._keyup); this.attached = true; this.listenerCount = 2; }
    dispose() { if (this.attached && window.removeEventListener) { window.removeEventListener('keydown', this._keydown); window.removeEventListener('keyup', this._keyup); } this.attached = false; this.listenerCount = 0; this.disposed = true; this.reset(); }
    reset() {
      this.keysHeld.clear(); this.previousHeld = {}; this.pendingPresses = {}; this.state = stateTemplate();
      this.clearVirtualActions();
      this.blockGamepadUntilRelease();
    }
    virtualHeld(action) { for (const actions of this.virtualOwners.values()) if (actions.has(action)) return true; return false; }
    setVirtualAction(action, owner, held, event) {
      if (!ACTIONS.includes(action) || !owner || this.disposed) return false;
      let actions = this.virtualOwners.get(owner);
      if (!held) {
        actions?.delete(action);
        if (actions && !actions.size) this.virtualOwners.delete(owner);
        return true;
      }
      if (actions?.has(action)) return true;
      const alreadyHeld = this.virtualHeld(action) || this.keyboardHeld(action) || this.gamepadHeld(action, this.getPads());
      if (!actions) this.virtualOwners.set(owner, actions = new Set());
      actions.add(action);
      const road = BARCODE.CacheRoadProof;
      const gear = road?.active && road.status === 'playing' && road.introMs === null && road.handoffMs == null;
      if (!alreadyHeld && (EDGE_ACTIONS.has(action) || gear && ROAD_EDGE_ACTIONS.has(action))) {
        const queue = this.virtualPresses[action] ||= [];
        if (queue.length < 16) queue.push({ ...this.capturePress(event), owner });
      }
      return true;
    }
    releaseVirtualOwner(owner, { discardPresses = false } = {}) {
      this.virtualOwners.delete(owner);
      if (discardPresses) for (const action of Object.keys(this.virtualPresses)) {
        this.virtualPresses[action] = this.virtualPresses[action].filter(press => press.owner !== owner);
      }
    }
    clearVirtualActions() { this.virtualOwners.clear(); this.virtualPresses = {}; }
    blockGamepadUntilRelease() {
      const pads = this.getPads();
      this.gamepadReleaseRequired = new Set(ACTIONS.filter(action => this.gamepadHeld(action, pads)));
    }
    remap(action, bindings) { if (!ACTIONS.includes(action)) throw new Error(`Unknown action: ${action}`); this.keyboardBindings[action] = bindings.map(k => String(k).toLowerCase()); }
    capturePress(event) {
      const monotonicNow = window.performance?.now?.() ?? 0;
      const ageMs = Number.isFinite(event?.timeStamp) && event.timeStamp <= monotonicNow && monotonicNow - event.timeStamp < 1000
        ? monotonicNow - event.timeStamp : 0;
      const audioNow = window.audioSystem?.context?.currentTime;
      const audioTimeSec = Number.isFinite(audioNow) ? Math.max(0, audioNow - ageMs / 1000) : null;
      return { wallTimeMs: Date.now() - ageMs,
        audioTimeSec,
        // Level 1 retains the original render-clock timestamp. Cache Road can
        // judge the sample the player heard, including an older keyboard event.
        audibleAudioTimeSec: audioTimeSec === null ? null :
          window.audioSystem?.getOutputAudioTime?.(audioTimeSec) ?? audioTimeSec };
    }
    handleKeyDown(event) {
      const key = keyName(event);
      if (this.isMappedKey(key) && event.preventDefault) event.preventDefault();
      if (this.keysHeld.has(key) || event?.repeat === true) return;
      // Gear selection is discrete in the active road. Retain a tap whose
      // keyup arrives before the next shared update; other movement stays held.
      const road=BARCODE.CacheRoadProof;
      const roadGear=road?.active&&road.status==='playing'&&road.introMs===null&&
        road.handoffMs==null&&!road.exiting&&!(window.isPaused||window.gameState?.paused);
      for (const action of roadGear ? ROAD_EDGE_ACTIONS : EDGE_ACTIONS) {
        if (!(this.keyboardBindings[action] || []).includes(key) || this.keyboardHeld(action) || this.virtualHeld(action)) continue;
        const queue = this.pendingPresses[action] ||= [];
        if (queue.length < 16) queue.push(this.capturePress(event));
      }
      this.keysHeld.add(key);
    }
    handleKeyUp(event) { const key = keyName(event); if (this.isMappedKey(key) && event.preventDefault) event.preventDefault(); this.keysHeld.delete(key); }
    isMappedKey(key) { return Object.values(this.keyboardBindings).some(list => list.includes(key)); }
    update(context = {}) {
      this.suppression = this.computeSuppression(context);
      const held = {};
      const pads = this.getPads();
      const shared = this.jumpSharesBeatButton(), rhythmMode = !!window.rhythmSystem?.isActive?.();
      if (shared && this.rhythmInputMode !== undefined && this.rhythmInputMode !== rhythmMode) {
        this.gamepadReleaseRequired ||= new Set();
        for (const action of ['jump', 'primary']) if (this.gamepadHeld(action, pads)) this.gamepadReleaseRequired.add(action);
      }
      this.rhythmInputMode = rhythmMode;
      ACTIONS.forEach(action => {
        const padHeld = this.gamepadHeld(action, pads);
        if (!padHeld) this.gamepadReleaseRequired?.delete(action);
        const contextAllows = !shared || action !== 'jump' && action !== 'primary' || (action === 'primary' ? rhythmMode : !rhythmMode);
        held[action] = this.keyboardHeld(action) || this.virtualHeld(action) || (contextAllows && padHeld && !this.gamepadReleaseRequired?.has(action));
      });
      this.state = stateTemplate();
      ACTIONS.forEach(action => {
        const wasHeld = !!this.previousHeld[action];
        const nowHeld = !!held[action];
        const suppressed = this.isSuppressed(action);
        const physicalQueue = this.pendingPresses[action] || [];
        const virtualQueue = this.virtualPresses[action];
        const queued = virtualQueue?.length ? physicalQueue.concat(virtualQueue) : physicalQueue;
        const events = queued.length ? queued : nowHeld && !wasHeld ? [this.capturePress(null)] : [];
        this.state[action] = { held: suppressed ? false : nowHeld, pressed: !suppressed && events.length > 0,
          released: !suppressed && !nowHeld && (wasHeld || queued.length > 0), suppressed,
          presses: suppressed ? [] : events };
      });
      this.previousHeld = held;
      this.pendingPresses = {};
      this.virtualPresses = {};
      return this.state;
    }
    keyboardHeld(action) { return (this.keyboardBindings[action] || []).some(key => this.keysHeld.has(key)); }
    getPads() {
      const ui = BARCODE.GamepadUI;
      if (ui) { const pad = ui.selectPad(); return pad ? [pad] : []; }
      return Array.from(navigator.getGamepads?.() || []).filter(pad => pad && pad.connected !== false && pad.mapping === 'standard').slice(0, 1);
    }
    jumpSharesBeatButton() {
      const settings = BARCODE.ControllerSettings;
      if (!this.customGamepadBindings && settings) return settings.bindings.jump === settings.bindings.primary;
      return (this.gamepadBindings.jump || []).some(jump => jump.button !== undefined && (this.gamepadBindings.primary || []).some(beat => beat.button === jump.button));
    }
    gamepadHeld(action, pads = []) {
      const settings = BARCODE.ControllerSettings;
      const buttons = !this.customGamepadBindings && settings?.bindings[action] !== undefined
        ? [{ button: settings.bindings[action] }] : this.gamepadBindings[action] || [];
      return pads.some(pad => buttons.some(binding => {
        if (binding.button !== undefined) {
          if (action === 'move_down' && binding.button === 13 && [12, 14, 15].some(index => pad.buttons[index]?.pressed)) return false;
          const button = pad.buttons[binding.button];
          return !!button?.pressed || (binding.button === 6 || binding.button === 7) && button?.value >= 0.5;
        }
        if (binding.axis !== undefined) {
          if (action === 'move_down') {
            const down = (pad.axes[binding.axis] || 0) * binding.dir;
            return down >= DROP_STICK_MIN && Math.abs(pad.axes[0] || 0) <= down * DROP_STICK_SLOPE && !pad.buttons[12]?.pressed;
          }
          if (BARCODE.GamepadUI) return BARCODE.GamepadUI.axis(binding.axis) === binding.dir;
          const value = pad.axes[binding.axis] || 0;
          return binding.dir < 0 ? value < -0.2 : value > 0.2;
        }
        return false;
      }));
    }
    computeSuppression(context) {
      const runtimeState = BARCODE.RuntimeLifecycle && BARCODE.RuntimeLifecycle.getState ? BARCODE.RuntimeLifecycle.getState() : null;
      const gameState = window.gameState || {};
      const tutorial = window.tutorialSystem;
      return {
        gameplayActive: context.gameplayActive !== undefined ? !!context.gameplayActive : !(window.isRunning === false || gameState.running === false),
        paused: !!(context.paused || window.isPaused || gameState.paused || runtimeState === 'paused'),
        stopped: !!(context.stopped || runtimeState === 'stopped'),
        gameOver: !!(context.gameOver || gameState.gameOver),
        cutscene: !!(context.cutscene || window.cutsceneSystem?.isActive),
        dialogue: !!context.dialogue
      };
    }
    isSuppressed(action) {
      if (action === 'pause') return this.suppression.stopped || this.suppression.gameOver || this.suppression.cutscene || !this.suppression.gameplayActive;
      return this.suppression.paused || this.suppression.stopped || this.suppression.gameOver || this.suppression.cutscene || this.suppression.dialogue || !this.suppression.gameplayActive;
    }
    pressed(action) { return !!(this.state[action] && this.state[action].pressed); }
    held(action) { return !!(this.state[action] && this.state[action].held); }
    released(action) { return !!(this.state[action] && this.state[action].released); }
    diagnostics() { return { state: clone(this.state), keysHeld: Array.from(this.keysHeld), virtualOwners: this.virtualOwners.size, keyboardBindings: clone(this.keyboardBindings), gamepadBindings: clone(this.gamepadBindings), suppression: clone(this.suppression), listenerCount: this.listenerCount }; }
  }
  ActionInput.ACTIONS = ACTIONS;
  ActionInput.DEFAULT_KEYBOARD = DEFAULT_KEYBOARD;
  ActionInput.DEFAULT_GAMEPAD = DEFAULT_GAMEPAD;
  BARCODE.ActionInput = ActionInput;
})();
