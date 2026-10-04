// Shared controller selection, saved bindings and contextual navigation.
// Sampled by existing input owners; no listeners, timers or frame loop.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/core/gamepad-ui.js', exports: ['BARCODE.GamepadUI', 'BARCODE.ControllerSettings'], dependencies: [] });
(function() {
  const B = window.BARCODE = window.BARCODE || {};
  const priorLevelDefaults = { jump: 0, primary: 0, interact: 3, rhythm_mode: 4, inspect: 5 };
  const levelDefaults = { ...priorLevelDefaults, run: 6 };
  const roadDefaults = { road_attack: 5, road_turbo: 4, road_defend: 7, road_disrupt: 6 };
  const defaults = { ...levelDefaults, ...roadDefaults };
  const allowed = [0, 2, 3, 4, 5, 6, 7, 10, 11];
  const roadAllowed = [4, 5, 6, 7];
  const storageKey = 'barcode.controller.v1';
  const shareable = (a, b) => a !== b && ['jump', 'primary'].includes(a) && ['jump', 'primary'].includes(b);
  const group = action => Object.keys(action in roadDefaults ? roadDefaults : levelDefaults);
  const buttonsFor = action => action in roadDefaults ? roadAllowed : allowed;
  const validBindings = (bindings, actions) => actions.every(a => buttonsFor(a).includes(bindings?.[a]) && actions.every(b => a === b || bindings[a] !== bindings[b] || shareable(a, b)));
  const buttonHeld = (pad, index) => !!pad?.buttons[index]?.pressed || (index === 6 || index === 7) && pad?.buttons[index]?.value >= 0.5;
  const settings = B.ControllerSettings = {
    bindings: { ...defaults }, deadzone: 0.2, labels: 'auto', vibration: true, saved: true,
    load() {
      try {
        const data = JSON.parse(window.localStorage?.getItem(storageKey) || '{}');
        if (Number.isFinite(data.deadzone)) this.deadzone = Math.max(0.1, Math.min(0.5, data.deadzone));
        if (['auto', 'playstation', 'xbox'].includes(data.labels)) this.labels = data.labels;
        if (typeof data.vibration === 'boolean') this.vibration = data.vibration;
        if (validBindings(data.bindings, Object.keys(priorLevelDefaults))) {
          for (const key of Object.keys(priorLevelDefaults)) this.bindings[key] = data.bindings[key];
          // Migrate the previous default face buttons without resetting unrelated
          // preferences or deliberately customized gameplay bindings.
          if (!(data.layoutVersion >= 2) && this.bindings.jump === 0 && this.bindings.primary === 2) this.bindings.primary = 0;
          // Adding Run cannot reset an existing custom layout. Respect a saved
          // free Run button, otherwise choose an unused Level 1 control; road
          // skills retain their independently saved shoulder/trigger context.
          this.bindings.run = [data.bindings.run, 6, 7, 10, 11, ...allowed].find(button =>
            allowed.includes(button) && Object.keys(priorLevelDefaults).every(action => this.bindings[action] !== button));
        }
        // Road and Level 1 mappings are exclusive contexts. Missing/invalid new
        // road preferences keep their own defaults, never reset a valid Level 1
        // layout, and cannot assign skills to the face-piece buttons.
        if (data.layoutVersion === 3 && validBindings(data.bindings, Object.keys(roadDefaults))) {
          for (const key of Object.keys(roadDefaults)) this.bindings[key] = data.bindings[key];
        }
      } catch (_) { /* Corrupt or unavailable storage never prevents play. */ }
    },
    save() {
      try {
        if (!window.localStorage) throw new Error('unavailable');
        window.localStorage.setItem(storageKey, JSON.stringify({ layoutVersion: 3, bindings: this.bindings, deadzone: this.deadzone, labels: this.labels, vibration: this.vibration })); this.saved = true;
      } catch (_) { this.saved = false; }
      B.GamepadUI?.reset(); window.inputManager?.actionInput?.reset();
      window.player?.setRunHeld?.(false);
    },
    bind(action, button) {
      if (!(action in defaults) || !buttonsFor(action).includes(button)) return false;
      const old = this.bindings[action];
      const actions = group(action);
      const conflicts = actions.filter(key => key !== action && this.bindings[key] === button && !shareable(action, key));
      this.bindings[action] = button;
      for (const key of conflicts) {
        const replacement = [old, ...buttonsFor(key)].find(candidate => buttonsFor(key).includes(candidate) && actions.every(other => other === key || this.bindings[other] !== candidate || shareable(key, other)));
        this.bindings[key] = replacement;
      }
      this.save(); return true;
    },
    allowedButtons(action) { return [...buttonsFor(action)]; },
    setDeadzone(value) { if (Number.isFinite(value)) { this.deadzone = Math.round(Math.max(0.1, Math.min(0.5, value)) * 100) / 100; this.save(); } },
    restore() { this.bindings = { ...defaults }; this.deadzone = 0.2; this.labels = 'auto'; this.vibration = true; this.save(); },
    button(index) {
      const ps = this.labels === 'playstation' || (this.labels === 'auto' && /dualsense|dualshock|playstation|sony|054c/i.test(B.GamepadUI?.pad?.id || ''));
      const names = ps ? ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3'] : ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'LS', 'RS'];
      return names[index] || 'D-pad';
    },
    prompt(action, keyboard) { return B.GamepadUI?.connected ? this.button(this.bindings[action]) : keyboard; },
    menuHelp() { return `D-pad: Select / Adjust   ${this.button(0)}: Choose   ${this.button(1)}: Back   ${this.button(9)}: Resume`; }
  };
  settings.load();
  B.GamepadUI = {
    owner: null, previous: {}, blocked: new Set(), connected: false, pad: null, unsupported: false, axes: [0, 0], deviceChanged: false,
    selectPad() {
      const pads = Array.from(navigator.getGamepads?.() || []).filter(p => p && p.connected !== false);
      const selected = pads.find(p => p.mapping === 'standard' && this.pad && p.index === this.pad.index && p.id === this.pad.id) || pads.find(p => p.mapping === 'standard') || null;
      const changed = !!selected !== !!this.pad || !!selected && (selected.index !== this.pad?.index || selected.id !== this.pad?.id);
      this.unsupported = !selected && pads.length > 0;
      if (changed) { this.deviceChanged = true; this.axes = [0, 0]; this.previous = {}; }
      this.pad = selected; this.connected = !!selected; return selected;
    },
    axis(index) {
      const value = this.pad?.axes[index] || 0, old = this.axes[index] || 0;
      const threshold = old && Math.sign(value) === old ? Math.max(0.05, settings.deadzone - 0.05) : settings.deadzone;
      return this.axes[index] = Math.abs(value) > threshold ? Math.sign(value) : 0;
    },
    read() {
      const pad = this.selectPad(), held = {};
      for (let i = 0; i < 17; i++) held['b' + i] = buttonHeld(pad, i);
      const x = this.axis(0), y = this.axis(1);
      held.up = held.b12 || y < 0; held.down = held.b13 || y > 0;
      held.left = held.b14 || x < 0; held.right = held.b15 || x > 0;
      return held;
    },
    reset() { this.previous = this.read(); this.blocked = new Set(Object.keys(this.previous).filter(key => this.previous[key])); },
    poll(owner) {
      const held = this.read(), changed = this.owner !== owner || this.deviceChanged;
      if (changed) { this.blocked = new Set(Object.keys(held).filter(key => held[key])); this.owner = owner; this.deviceChanged = false; }
      const pressed = {};
      for (const key of Object.keys(held)) {
        if (!held[key]) this.blocked.delete(key);
        pressed[key] = held[key] && !this.previous[key] && !this.blocked.has(key);
      }
      this.previous = held;
      return { pressed, held, changed, connected: this.connected };
    }
  };
})();
