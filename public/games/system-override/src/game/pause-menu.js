// Saved presentation preferences and pause UI. Input and RAF remain owned by
// InputManager and RuntimeLifecycle; this module installs no event handlers.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/pause-menu.js', exports: ['BARCODE.Preferences', 'BARCODE.PauseMenu'], dependencies: ['BARCODE.LoreRecords'] });
(function() {
  const BARCODE = window.BARCODE = window.BARCODE || {};
  const defaults = Object.freeze({ music: 1, sfx: 1, dynamicMusic: true, screenShake: true, flashes: true, crtPostEffects: true, reducedMotion: false, instantText: false, inputOffsetMs: 0, visualOffsetMs: 0 });
  const normalize = (key, value) => key.endsWith('OffsetMs') ? Math.round(Math.max(-200, Math.min(200, value))) : Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
  const storageKey = 'barcode.presentation.v1';
  const preferences = BARCODE.Preferences = {
    values: { ...defaults }, saved: true,
    load() {
      try {
        const data = JSON.parse(window.localStorage?.getItem(storageKey) || '{}');
        for (const key of Object.keys(defaults)) {
          if (typeof defaults[key] === 'boolean' && typeof data?.[key] === 'boolean') this.values[key] = data[key];
          if (typeof defaults[key] === 'number' && Number.isFinite(data?.[key])) this.values[key] = normalize(key, data[key]);
        }
      } catch (_) { /* A blocked/corrupt store never prevents playing. */ }
      this.apply();
    },
    apply(audio = window.audioSystem) {
      window.BARCODE_RENDER_QUALITY = window.BARCODE_RENDER_QUALITY || {};
      for (const key of ['screenShake', 'flashes', 'crtPostEffects']) window.BARCODE_RENDER_QUALITY[key] = this.values[key];
      if (window.renderer) {
        window.renderer.postEffects = this.values.crtPostEffects;
        if (!this.values.screenShake) window.renderer.clearScreenShake?.();
        if (!this.values.flashes) { window.renderer.glitchIntensity = 0; window.renderer.chromaticAberration = 0; }
      }
      audio?.setMusicVolume?.(this.values.music);
      audio?.setSFXVolume?.(this.values.sfx);
      audio?.setRhythmVolume?.(this.values.sfx);
    },
    save() {
      try {
        if (!window.localStorage) throw new Error('storage unavailable');
        window.localStorage.setItem(storageKey, JSON.stringify(this.values)); this.saved = true;
      } catch (_) { this.saved = false; }
    },
    set(key, value) {
      if (!(key in defaults) || typeof value !== typeof defaults[key]) return;
      if (typeof value === 'number') { if (!Number.isFinite(value)) return; value = normalize(key, value); }
      this.values[key] = value; this.apply(); this.save();
    },
    restoreDefaults() { this.values = { ...defaults }; this.apply(); this.save(); }
  };
  const rows = [
    ['music', 'Music'], ['sfx', 'SFX'], ['dynamicMusic', 'Dynamic music'], ['screenShake', 'Screen shake'],
    ['flashes', 'Flash accents'], ['crtPostEffects', 'CRT effect'],
    ['instantText', 'Instant dialogue'], ['crew', 'Recent crew dialogue'], ['timing', 'Timing calibration'], ['archive', 'Lore archive'], ['resume', 'Resume game'], ['defaults', 'Reset settings'], ['controller', 'Controller settings'], ['reducedMotion', 'Reduced motion'], ['fullscreen', 'Fullscreen']
  ];
  const visibleRows = () => BARCODE.MacCombatPreview?.active || BARCODE.RunAndGunProof?.active || BARCODE.CacheRoadProof?.active
    ? rows.map(([key, label]) => key === 'crew' ? ['exitPreview', BARCODE.CacheRoadProof?.active && BARCODE.CacheRoadProof.chapter ? 'Return to bridge' : 'Exit preview'] : [key, label]) : rows;
  const rowTop = 331, rowStep = 38;
  const roadSkillControls = [
    ['road_attack','Attack',5], ['road_turbo','Turbo',4],
    ['road_defend','Defend',7], ['road_disrupt','Disrupt',6]
  ];
  const levelControls = [['jump','Jump'],['primary','Beat attack'],['interact','Hack'],
    ['rhythm_mode','Rhythm Mode'],['inspect','Inspect / collect'],['run','Run (hold)']];
  const macControls = [['jump','Jump',0],['road_attack','Strike',5],
    ['road_defend','Guard',7],['road_disrupt','Throw',6],['inspect','Talk',5]];
  const menu = BARCODE.PauseMenu = {
    open: false, dirty: false, focus: 0, drag: null, heldKeys: new Set(), snapshot: null, snapshotContext: null, resumePending: false, message: '',
    captureAction: null, captureReady: false, controllerFocus: 0,
    view: 'settings', archiveFocus: 0, archiveIndex: 0, archiveLevel: 1, timingFocus: 0,
    titleOpen: false, titleCanvas: null, fullscreenPending: false,
    combatControls() {
      const road=BARCODE.CacheRoadProof;
      return !!road?.active&&(road.chapter?.encounterVersion===4||road.state?.combat?.version===4);
    },
    controllerControls() { return BARCODE.MacCombatPreview?.active ? macControls : this.combatControls()?roadSkillControls:levelControls; },
    controllerRowCount() { return this.controllerControls().length+5; },
    controllerRowStep() { return this.controllerControls().length > 5 ? 42 : 46; },
    controllerLabels() {
      return ['Stick deadzone', 'Button prompts', 'Vibration', ...this.controllerControls().map(([,label]) => label),
        BARCODE.MacCombatPreview?.active ? 'Reset street controls' : this.combatControls() ? 'Reset skill mapping' : 'Reset controller defaults', this.titleOpen ? 'Back to settings' : 'Back to pause'];
    },
    timingLabels() {
      return ['Input compensation', 'Visual beat delay', 'Reset timing to zero', this.titleOpen ? 'Back to title' : 'Test in play / Resume', this.titleOpen ? 'Back to settings' : 'Back to pause'];
    },
    // A phone readout exposes the selected native menu item, using the same
    // labels and saved values as the canvas. It owns no settings or input.
    touchReadout() {
      if (!this.isPaused()) return '';
      let label = '', value = '';
      if (this.view === 'controller') {
        const c = BARCODE.ControllerSettings, i = this.controllerFocus;
        label = this.controllerLabels()[i] || 'Controller settings';
        if (i === 0) value = `${Math.round((c?.deadzone || 0) * 100)}%`;
        else if (i === 1) value = c?.labels === 'playstation' ? 'PlayStation' : c?.labels === 'xbox' ? 'Xbox' : 'Automatic';
        else if (i === 2) value = c?.vibration === false ? 'OFF' : 'ON';
        else {
          const control = this.controllerControls()[i - 3];
          if (control) value = this.captureAction === control[0] ? 'Press a controller button. Back cancels.' : c?.button?.(c.bindings[control[0]]) || '';
        }
      } else if (this.view === 'timing') {
        label = this.timingLabels()[this.timingFocus] || 'Timing calibration';
        const key = ['inputOffsetMs', 'visualOffsetMs'][this.timingFocus];
        if (key) { const offset = preferences.values[key]; value = `${offset > 0 ? '+' : ''}${offset} ms`; }
      } else if (this.view === 'archive') {
        const catalog = this.archiveCatalog(), count = catalog.length;
        if (this.archiveFocus < count) {
          const record = this.archiveState().records[this.archiveFocus];
          label = record?.title || `Record ${catalog[this.archiveFocus]?.number || this.archiveFocus + 1}`;
          value = record ? 'RECOVERED' : 'UNRECOVERED';
        } else if (this.archiveFocus === count) label = this.titleOpen ? 'Back to settings' : 'Back to pause';
        else if (this.archiveFocus === count + 1) label = this.titleOpen ? 'Back to title' : 'Resume game';
        else { label = `Level ${this.archiveChapters()[this.archiveFocus - count - 2]}`; value = 'Lore archive'; }
      } else if (this.view === 'crew') {
        const line = window.tutorialSystem?.recentDialogue?.at(-1);
        label = 'Recent crew dialogue';
        value = line ? `${line.speaker}: ${line.text}` : 'Crew dialogue will appear here as you play.';
      } else {
        const [key, selectedLabel] = visibleRows()[this.focus] || [];
        label = key === 'resume' && this.titleOpen ? 'Back to title' : selectedLabel || 'Settings';
        if (typeof defaults[key] === 'boolean') value = preferences.values[key] ? 'ON' : 'OFF';
        else if (typeof defaults[key] === 'number') value = `${Math.round(preferences.values[key] * 100)}%`;
        else if (key === 'fullscreen') value = window.fullscreenManager?.isActive ? 'ON' : 'OFF';
      }
      return `${label}${value ? `\n${value}` : ''}${this.message ? `\n${this.message}` : ''}`;
    },
    isPaused() { return this.titleOpen || !!(window.isPaused || window.gameState?.paused); },
    canvas() { return this.titleOpen ? this.titleCanvas : document.getElementById('gameCanvas'); },
    openTitle() {
      if (window.cutsceneSystem?.isActive || document.getElementById('startOverlay')?.classList.contains('hidden')) return false;
      if (!this.titleCanvas) {
        this.titleCanvas=document.createElement('canvas');this.titleCanvas.width=1920;this.titleCanvas.height=1080;
        this.titleContext=this.titleCanvas.getContext('2d');
        this.titleCanvas.id='titleSettingsCanvas';this.titleCanvas.tabIndex=0;
        this.titleCanvas.setAttribute('aria-label','Game settings. Arrow keys select; Enter changes; Escape returns.');
        this.titleCanvas.style.cssText='position:fixed;z-index:20000;inset:0;margin:auto;width:min(100vw,177.7778vh);height:min(100vh,56.25vw);background:#07121e;';
        document.body.appendChild(this.titleCanvas);
      }
      this.titleOpen=true;this.titleCanvas.hidden=false;this.sync();this.focus=0;this.titleCanvas.focus();this.render();return true;
    },
    closeTitle() {
      this.titleOpen=false;if(this.titleCanvas)this.titleCanvas.hidden=true;
      this.open=false;this.drag=null;this.captureAction=null;this.heldKeys.clear();
      window.inputManager?.resetActionEdges?.();document.getElementById('settingsButton')?.focus?.();
    },
    async toggleFullscreen() {
      if(this.fullscreenPending)return;
      const manager=window.fullscreenManager;
      if(!manager?.isSupported){this.message='Fullscreen is unavailable in this browser or embed.';this.dirty=true;return;}
      this.fullscreenPending=true;
      try {
        const wanted=!manager.isActive;
        await manager.toggle();
        // The native promise may settle before fullscreenchange is delivered.
        manager.handleFullscreenChange?.();
        this.message=manager.isActive===wanted?'':'Use a click or keyboard press; the host may block fullscreen.';
      } catch (_) {this.message='Fullscreen was blocked. Try the button in the game’s own tab.';}
      finally {this.fullscreenPending=false;this.dirty=true;}
    },
    sync() {
      const paused = this.isPaused();
      if (paused === this.open) return;
      this.open = paused; this.drag = null; this.dirty = paused; this.message = ''; this.view = 'settings'; this.captureAction = null;
      window.inputManager?.resetActionEdges?.();
      if (paused) {
        this.focus = rows.findIndex(row => row[0] === 'resume');
        const canvas = this.titleOpen ? null : document.getElementById('gameCanvas');
        if (canvas && document.createElement) {
          if (!this.snapshot) {
            this.snapshot = document.createElement('canvas');
            this.snapshotContext = this.snapshot.getContext('2d');
          }
          this.snapshot.width = canvas.width; this.snapshot.height = canvas.height;
          if(BARCODE.CacheRoadGPU?.snapshotTo?.(this.snapshotContext,canvas)!==true)
            this.snapshotContext?.drawImage(canvas, 0, 0);
          BARCODE.CacheRoadGPU?.hide?.();
        }
      }
    },
    async resume() {
      if(this.titleOpen){this.closeTitle();return;}
      if (this.resumePending || !this.isPaused()) return;
      this.resumePending = true;
      try {
        const result = await BARCODE.RuntimeLifecycle?.resume('pause-menu');
        if (!result?.ok) this.message = 'Could not resume audio. Press Resume to retry.';
      } catch (_) { this.message = 'Could not resume. Press Resume to retry.'; }
      this.resumePending = false; this.sync(); this.dirty = true;
    },
    activate(direction = 1) {
      const key = visibleRows()[this.focus][0];
      if (key === 'exitPreview') { (BARCODE.MacCombatPreview?.active ? BARCODE.MacCombatPreview : BARCODE.CacheRoadProof?.active ? BARCODE.CacheRoadProof : BARCODE.RunAndGunProof).exit(); return; }
      if (key === 'fullscreen') { this.toggleFullscreen(); return; }
      if (key === 'controller') { this.view = 'controller'; this.controllerFocus = 0; this.captureAction = null; this.dirty = true; return; }
      if (key === 'resume') { this.resume(); return; }
      if (key === 'archive') { this.openArchive(); return; }
      if (key === 'crew') { this.view = 'crew'; this.dirty = true; return; }
      if (key === 'timing') { this.view = 'timing'; this.timingFocus = 0; this.dirty = true; return; }
      if (key === 'defaults') preferences.restoreDefaults();
      else if (typeof defaults[key] === 'boolean') preferences.set(key, !preferences.values[key]);
      else preferences.set(key, preferences.values[key] + direction * 0.05);
      this.dirty = true;
    },
    archiveChapters() {
      const collection = window.lostDataSystem?.archive || BARCODE.Campaign?.archive?.();
      const available = BARCODE.CacheRoadProof?.active || BARCODE.CacheEnding?.active ||
        collection?.record?.progress?.unlockedLevels?.includes('level-02') ||
        collection?.getIds?.().some(id => id.startsWith('lore.l02.'));
      return available && BARCODE.LoreRecords.level2?.length ? [1, 2] : [1];
    },
    archiveCatalog() {
      return this.archiveLevel === 2 && this.archiveChapters().includes(2) ? BARCODE.LoreRecords.level2 : BARCODE.LoreRecords.level1;
    },
    archiveLayout() {
      return this.archiveCatalog().length > 3 ? { top: 356, step: 80, height: 70 } : { top: 366, step: 104, height: 88 };
    },
    archiveState() {
      const collection = window.lostDataSystem?.archive || BARCODE.Campaign?.archive?.();
      const ids = new Set(collection?.getIds?.() || []);
      // Unrecovered entries expose neither their titles nor any story content.
      const records = this.archiveCatalog().map(record => ids.has(record.id) ? record : null);
      return { records, count: records.filter(Boolean).length, saved: !collection || collection.status === 'ready' };
    },
    changeArchiveChapter(level, keepTabFocus = false) {
      if (!this.archiveChapters().includes(level)) return;
      this.archiveLevel = level;
      const state = this.archiveState(), latest = window.lostDataSystem?.lastCollectedLoreId;
      let index = state.records.findIndex(record => record && record.id === latest);
      if (index < 0) index = state.records.findIndex(Boolean);
      this.archiveIndex = Math.max(0, index);
      this.archiveFocus = keepTabFocus ? state.records.length + 2 + this.archiveChapters().indexOf(level) : this.archiveIndex;
      this.drag = null; this.dirty = true;
    },
    openArchive() {
      this.sync();
      if (!this.isPaused()) return;
      this.changeArchiveChapter(BARCODE.CacheRoadProof?.active || BARCODE.CacheEnding?.active ? 2 : 1);
      this.view = 'archive'; this.drag = null; this.dirty = true;
    },
    closeArchive() {
      this.view = 'settings'; this.focus = rows.findIndex(row => row[0] === 'archive');
      this.drag = null; this.dirty = true;
    },
    selectArchive(index) {
      this.archiveFocus = index;
      if (index >= 0 && index < this.archiveCatalog().length) this.archiveIndex = index;
      this.dirty = true;
    },
    activateArchive() {
      const count = this.archiveCatalog().length;
      if (this.archiveFocus === count) this.closeArchive();
      else if (this.archiveFocus === count + 1) this.resume();
      else if (this.archiveFocus >= count + 2) this.changeArchiveChapter(this.archiveChapters()[this.archiveFocus - count - 2], true);
    },
    keyDown(event) {
      this.sync();
      const key = event.key.toLowerCase();
      if (!this.open) return this.heldKeys.has(key);
      this.heldKeys.add(key); event.preventDefault?.();
      if (this.view === 'controller') {
        if (this.captureAction) { if (['escape', 'p'].includes(key)) { this.captureAction = null; this.dirty = true; } return true; }
        if (key === 'p' && !event.repeat) this.resume();
        else if (key === 'escape' && !event.repeat) this.closeController();
        else if (['arrowup', 'arrowdown', 'tab'].includes(key)) { const count=this.controllerRowCount();this.controllerFocus = (this.controllerFocus + (key === 'arrowup' || key === 'tab' && event.shiftKey ? count-1 : 1)) % count; this.dirty = true; }
        else if (['arrowleft', 'arrowright'].includes(key) && this.controllerFocus < 3) this.activateController(key === 'arrowleft' ? -1 : 1);
        else if (['enter', ' '].includes(key) && !event.repeat) this.activateController();
        return true;
      }
      if (this.view === 'crew') {
        if (key === 'p' && !event.repeat) this.resume();
        else if (['escape','enter',' '].includes(key) && !event.repeat) { this.view = 'settings'; this.dirty = true; }
        return true;
      }
      if (this.view === 'timing') {
        if (key === 'p' && !event.repeat) this.resume();
        else if (key === 'escape' && !event.repeat) this.closeTiming();
        else if (key === 'arrowup' || key === 'arrowdown' || key === 'tab') {
          this.timingFocus = (this.timingFocus + (key === 'arrowup' || (key === 'tab' && event.shiftKey) ? 4 : 1)) % 5; this.dirty = true;
        } else if (key === 'arrowleft' || key === 'arrowright') { if (this.timingFocus < 2) this.activateTiming(key === 'arrowleft' ? -1 : 1); }
        else if ((key === 'enter' || key === ' ') && !event.repeat) this.activateTiming();
        return true;
      }
      if (this.view === 'archive') {
        if (key === 'p' && !event.repeat) this.resume();
        else if (key === 'escape' && !event.repeat) this.closeArchive();
        else if (key === 'tab' || key === 'arrowup' || key === 'arrowdown') {
          const direction = key === 'arrowup' || (key === 'tab' && event.shiftKey) ? -1 : 1;
          const chapters = this.archiveChapters();
          const count = this.archiveCatalog().length + 2 + (chapters.length > 1 ? chapters.length : 0);
          this.selectArchive((this.archiveFocus + direction + count) % count);
        } else if (key === 'arrowleft' || key === 'arrowright') {
          const count = this.archiveCatalog().length, direction = key === 'arrowleft' ? -1 : 1;
          if (this.archiveFocus >= count + 2) {
            const chapters = this.archiveChapters(), selected = this.archiveFocus - count - 2;
            this.changeArchiveChapter(chapters[(selected + direction + chapters.length) % chapters.length], true);
          } else this.selectArchive((this.archiveIndex + direction + count) % count);
        } else if ((key === 'enter' || key === ' ') && !event.repeat) this.activateArchive();
        return true;
      }
      if (key === 'p' || key === 'escape') { if (!event.repeat) this.resume(); }
      else if (key === 'l' && !event.repeat) this.openArchive();
      else if (key === 'arrowdown' || key === 'arrowup' || key === 'tab') {
        const direction = key === 'arrowup' || (key === 'tab' && event.shiftKey) ? -1 : 1;
        this.focus = (this.focus + direction + rows.length) % rows.length; this.dirty = true;
      } else if (key === 'arrowleft' || key === 'arrowright') {
        if (this.focus < 2) this.activate(key === 'arrowleft' ? -1 : 1);
      } else if ((key === 'enter' || key === ' ') && !event.repeat) this.activate();
      return true;
    },
    keyUp(event) { this.heldKeys.delete(event.key.toLowerCase()); },
    pointer(event, phase) {
      this.sync();
      if (!this.open) return false;
      event.preventDefault?.();
      if (phase === 'up') { this.drag = null; return true; }
      const canvas = this.canvas(), rect = canvas?.getBoundingClientRect?.();
      if (!rect?.width || !rect?.height) return true;
      const x = (event.clientX - rect.left) * 1920 / rect.width, y = (event.clientY - rect.top) * 1080 / rect.height;
      if (this.view === 'controller') {
        if (phase !== 'down') return true;
        if (this.captureAction) { this.captureAction = null; this.dirty = true; return true; }
        const step = this.controllerRowStep(), index = Math.floor((y - 350) / step);
        if (x >= 440 && x <= 1480 && index >= 0 && index < this.controllerRowCount() && y < 350 + index * step + 40) {
          this.controllerFocus = index;
          if (index === 0 && x >= 1110) BARCODE.ControllerSettings.setDeadzone(0.1 + Math.max(0, Math.min(1, (x - 1110) / 280)) * 0.4);
          else this.activateController();
          this.dirty = true;
        }
        return true;
      }
      if (this.view === 'crew') { if (phase === 'down') { this.view = 'settings'; this.dirty = true; } return true; }
      if (this.view === 'timing') {
        if (phase === 'down') {
          const index = Math.floor((y - 430) / 86);
          if (x < 440 || x > 1480 || index < 0 || index > 4 || y > 430 + index * 86 + 62) return true;
          this.timingFocus = index; this.dirty = true;
          if (index < 2) this.drag = index; else this.activateTiming();
        }
        if (this.drag !== null) { preferences.set(['inputOffsetMs', 'visualOffsetMs'][this.drag], Math.round(((x - 1130) / 260 * 400 - 200) / 5) * 5); this.dirty = true; }
        return true;
      }
      if (this.view === 'archive') {
        if (phase !== 'down' || x < 420 || x > 840) return true;
        const chapters = this.archiveChapters(), count = this.archiveCatalog().length;
        if (chapters.length > 1 && y >= 288 && y <= 334) {
          const tab = x <= 622 ? 0 : x >= 638 ? 1 : -1;
          if (tab >= 0) this.changeArchiveChapter(chapters[tab]);
          return true;
        }
        const layout = this.archiveLayout(), index = Math.floor((y - layout.top) / layout.step);
        if (index >= 0 && index < count && y <= layout.top + index * layout.step + layout.height) this.selectArchive(index);
        else if (y >= 746 && y <= 802) { this.selectArchive(count); this.activateArchive(); }
        else if (y >= 820 && y <= 876) { this.selectArchive(count + 1); this.activateArchive(); }
        return true;
      }
      if (phase === 'down') {
        const index = Math.floor((y - rowTop) / rowStep);
        if (x < 1020 || x > 1500 || index < 0 || index >= rows.length || y > rowTop + index * rowStep + rowStep) return true;
        this.focus = index; this.dirty = true;
        if (index < 2) this.drag = index; else this.activate();
      }
      if (this.drag !== null) { preferences.set(rows[this.drag][0], (x - 1260) / 190); this.dirty = true; }
      return true;
    },
    render() {
      this.sync();
      if (!this.open || !this.dirty) return;
      const canvas = this.canvas(), ctx = this.titleOpen ? this.titleContext :
        window.renderer?.canvas === canvas && window.renderer.ctx ||
        canvas?.getContext('2d', { willReadFrequently: false });
      if (!ctx) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.snapshot && !this.titleOpen) ctx.drawImage(this.snapshot, 0, 0); else { ctx.fillStyle = '#081321'; ctx.fillRect(0, 0, 1920, 1080); }
      this.draw(ctx); ctx.restore(); this.dirty = false;
    },
    closeController() { this.view = 'settings'; this.focus = rows.findIndex(row => row[0] === 'controller'); this.captureAction = null; this.dirty = true; },
    activateController(direction = 1) {
      const c = BARCODE.ControllerSettings, i = this.controllerFocus;
      if (!c) return;
      const controls=this.controllerControls(),end=3+controls.length;
      if (i === 0) c.setDeadzone(c.deadzone + direction * 0.01);
      else if (i === 1) { const styles = ['auto', 'playstation', 'xbox']; c.labels = styles[(styles.indexOf(c.labels) + direction + 3) % 3]; c.save(); }
      else if (i === 2) { c.vibration = !c.vibration; c.save(); }
      else if (i < end) { this.captureAction = controls[i - 3][0]; this.captureReady = false; }
      else if (i === end) {
        if(BARCODE.MacCombatPreview?.active)for(const [action,,button] of macControls)c.bind(action,button);
        else if(this.combatControls())for(const [action,,button] of roadSkillControls)c.bind(action,button);
        else c.restore();
      }
      else this.closeController();
      this.dirty = true;
    },
    captureController(input) {
      if (!this.captureAction) return;
      if (input.pressed.b1 || input.pressed.b9) { this.captureAction = null; this.dirty = true; return; }
      const allowed = BARCODE.ControllerSettings.allowedButtons?.(this.captureAction)||[0, 2, 3, 4, 5, 6, 7, 10, 11];
      if (!this.captureReady) { this.captureReady = !allowed.some(index => input.held['b' + index]); return; }
      const button = allowed.find(index => input.pressed['b' + index]);
      if (button !== undefined) { BARCODE.ControllerSettings.bind(this.captureAction, button); this.captureAction = null; this.dirty = true; }
    },
    drawController(ctx, text) {
      const c = BARCODE.ControllerSettings;
      text('CONTROLLER SETTINGS', 440, 248, 38, '#a0ffe4');
      text(BARCODE.GamepadUI?.unsupported ? 'Controller not recognized. Try another connection or browser.' : BARCODE.GamepadUI?.connected ? 'Controller connected' : 'Connect a controller and press a button.', 440, 307, 20, '#cfa2ff');
      const combat=this.combatControls(),controls=this.controllerControls(),end=3+controls.length;
      const labels = this.controllerLabels();
      const actions = controls.map(([action])=>action);
      labels.forEach((label, i) => {
        const y = 350 + i * this.controllerRowStep();
        ctx.fillStyle = i === this.controllerFocus ? '#16394b' : '#0d2032'; ctx.fillRect(440, y, 1040, 40);
        if (i === this.controllerFocus) { ctx.strokeStyle = '#94ffe3'; ctx.strokeRect(440, y, 1040, 40); }
        text(label, 460, y + 21, 22);
        if (i === 0) {
          ctx.fillStyle = '#334358'; ctx.fillRect(1110, y + 17, 280, 7); ctx.fillStyle = '#94ffe3'; ctx.fillRect(1110, y + 17, 280 * (c.deadzone - 0.1) / 0.4, 7);
          text(`${Math.round(c.deadzone * 100)}%`, 1410, y + 21, 18);
        } else if (i === 1) text(c.labels === 'auto' ? 'Automatic' : c.labels === 'playstation' ? 'PlayStation' : 'Xbox', 1240, y + 21, 20);
        else if (i === 2) text(c.vibration ? 'ON' : 'OFF', 1380, y + 21, 20);
        else if (i < end) text(this.captureAction === actions[i - 3] ? 'Press a new button…' : c.button(c.bindings[actions[i - 3]]), 1210, y + 21, 22, '#a0ffe4');
      });
      text(this.captureAction ? `Release, then press a ${combat?'shoulder / trigger':'face / shoulder / stick'} button. ${c.button(1)} or Esc cancels.` : `Menu controls stay fixed: ${c.button(0)} confirm, ${c.button(1)} back, ${c.button(9)} pause.`, 440, 837, 18, '#cfa2ff');
      text(BARCODE.MacCombatPreview?.active ? 'Move in both axes. Jump, strike, guard, throw and talk use the mappings above.' : combat?`Face sync: ${[0,1,2,3].map(i=>c.button(i)).join(' / ')}. Skill remaps stay on shoulders / triggers.`:
        this.captureAction ? 'Jump and beat may share a button. Other conflicts move automatically.' : `${c.button(8)}: crew dialogue. Shared jump/beat changes with Rhythm Mode.`, 440, 871, 18);
      text(c.saved ? 'Saved on this device.' : 'Applied this session; saving is unavailable.', 440, 915, 18, '#a0ffe4');
    },
    closeTiming() { this.view = 'settings'; this.focus = rows.findIndex(row => row[0] === 'timing'); this.drag = null; this.dirty = true; },
    activateTiming(direction = 1) {
      const key = ['inputOffsetMs', 'visualOffsetMs'][this.timingFocus];
      if (key) preferences.set(key, preferences.values[key] + direction * 5);
      else if (this.timingFocus === 2) { preferences.set('inputOffsetMs', 0); preferences.set('visualOffsetMs', 0); }
      else if (this.timingFocus === 3) this.resume();
      else this.closeTiming();
      this.dirty = true;
    },
    drawTiming(ctx, text) {
      text('TIMING CALIBRATION', 440, 250, 42, '#a0ffe4');
      text('Use small steps, then test on the beat in Rhythm Mode.', 440, 320, 23);
      text('Audio keeps its original timing. Scoring windows stay the same.', 440, 360, 21, '#cfa2ff');
      this.timingLabels().forEach((label, index) => {
        const y = 430 + index * 86;
        ctx.fillStyle = index === this.timingFocus ? '#16394b' : '#0d2032'; ctx.fillRect(440, y, 1040, 62);
        if (index === this.timingFocus) { ctx.strokeStyle = '#94ffe3'; ctx.strokeRect(440, y, 1040, 62); }
        text(label, 464, y + (index < 2 ? 19 : 31), 23, '#edf3ff');
        if (index < 2) {
          const value = preferences.values[index ? 'visualOffsetMs' : 'inputOffsetMs'];
          text(index ? '+ delays HUD/rings; − shows them sooner.' : 'Consistently LATE? Increase. EARLY? Decrease.', 464, y + 46, 18, '#cfa2ff');
          ctx.fillStyle = '#334358'; ctx.fillRect(1130, y + 27, 260, 8);
          ctx.fillStyle = '#94ffe3'; ctx.fillRect(1127 + (value + 200) / 400 * 260, y + 20, 6, 22);
          text(`${value > 0 ? '+' : ''}${value} ms`, 1404, y + 31, 17);
        }
      });
      text(this.message || (preferences.saved ? 'Saved on this device. Range: −200 to +200 ms. Step: 5 ms.' : 'Applied this session; saving is unavailable.'), 440, 880, 19, '#cfa2ff');
      text(BARCODE.GamepadUI?.connected ? BARCODE.ControllerSettings.menuHelp() : 'Arrows: Select / Adjust    Enter: Choose    Esc: Back    P: Resume', 440, 920, 19);
    },
    drawArchive(ctx, text) {
      const { records, count, saved } = this.archiveState();
      const chapters = this.archiveChapters(), catalog = this.archiveCatalog(), layout = this.archiveLayout();
      text('LORE ARCHIVE', 440, 250, 42, '#a0ffe4');
      if (chapters.length > 1) {
        chapters.forEach((level, index) => {
          const x = 420 + index * 218, selected = this.archiveLevel === level;
          ctx.fillStyle = selected ? '#16394b' : '#0d2032'; ctx.fillRect(x, 288, 202, 46);
          if (selected) { ctx.fillStyle = '#74f7d2'; ctx.fillRect(x, 330, 202, 4); }
          if (this.archiveFocus === records.length + 2 + index) { ctx.strokeStyle = '#edf3ff'; ctx.strokeRect(x, 288, 202, 46); }
          text(`LEVEL ${level}`, x + 20, 310, 21, selected ? '#a0ffe4' : '#9aa7ba');
        });
        text(`${count} OF ${records.length} RECORDS RECOVERED`, 902, 310, 20, '#cfa2ff');
      } else text(`LEVEL 1  /  ${count} OF ${records.length} RECORDS RECOVERED`, 440, 306, 20, '#cfa2ff');
      records.forEach((record, index) => {
        const y = layout.top + index * layout.step, selected = this.archiveFocus === index;
        ctx.fillStyle = selected ? '#16394b' : '#0d2032'; ctx.fillRect(420, y, 420, layout.height);
        if (selected) { ctx.strokeStyle = '#94ffe3'; ctx.strokeRect(420, y, 420, layout.height); }
        text(`RECORD ${catalog[index].number}  /  ${record ? 'RECOVERED' : 'UNRECOVERED'}`, 440, y + 23, 17, record ? '#a0ffe4' : '#9aa7ba');
        text(record?.title || 'Signal not recovered', 440, y + (layout.height > 70 ? 58 : 50), 20, record ? '#edf3ff' : '#9aa7ba');
      });
      ctx.fillStyle = '#0d2032'; ctx.fillRect(874, 346, 626, 548);
      const record = records[this.archiveIndex];
      if (record) {
        text(record.title, 902, 386, 26, '#e8dcff');
        text(`${record.author} / ${record.source}`, 902, 427, 16, '#a0ffe4');
        let y = 450;
        const bodySize = this.archiveLevel === 2 ? 20 : 21, bodyStep = this.archiveLevel === 2 ? 27 : 28;
        for (const paragraph of record.paragraphs) {
          ctx.font = `${bodySize}px monospace`;
          for (const line of BARCODE.LoreRecords.wrap(ctx, paragraph, 570)) { text(line, 902, y, bodySize); y += bodyStep; }
          y += 10;
        }
        ctx.font = '20px monospace';
        for (const line of BARCODE.LoreRecords.wrap(ctx, record.response, 570)) { text(line, 902, y, 20, '#cfa2ff'); y += 27; }
      } else {
        text('RECORD UNRECOVERED', 902, 414, 26, '#9aa7ba');
        text('Recover this fragment to read its contents.', 902, 466, 20);
        text('Found records remain here across level runs.', 902, 510, 20, '#cfa2ff');
      }
      [this.titleOpen ? 'Back to settings' : 'Back to pause', this.titleOpen ? 'Back to title' : 'Resume game'].forEach((label, index) => {
        const y = 746 + index * 74, selected = this.archiveFocus === records.length + index;
        ctx.fillStyle = selected ? '#16394b' : '#0d2032'; ctx.fillRect(420, y, 420, 56);
        if (selected) { ctx.strokeStyle = '#94ffe3'; ctx.strokeRect(420, y, 420, 56); }
        text(label, 440, y + 28, 21);
      });
      if (this.message) {
        ctx.font = '17px monospace';
        BARCODE.LoreRecords.wrap(ctx, this.message, 400).forEach((line, index) => text(line, 440, 704 + index * 23, 17, '#ffc68a'));
      } else {
        text(saved ? 'Records stay on this device.' : 'Saving unavailable on this device.', 440, 704, 18, saved ? '#a0ffe4' : '#ffc68a');
        if (!saved) text('These records remain in this session.', 440, 728, 17, '#ffc68a');
      }
      text(BARCODE.GamepadUI?.connected ? BARCODE.ControllerSettings.menuHelp() : 'Arrows / Tab: Select   Enter: Choose   Esc: Back   P: Resume', 440, 916, 20);
      if (chapters.length > 1) text('Select a chapter tab to change levels.', 440, 953, 18, '#cfa2ff');
    },
    draw(ctx) {
      ctx.save(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(2,8,18,0.8)'; ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = '#0a1827'; ctx.fillRect(380, 180, 1160, 830);
      ctx.strokeStyle = '#74f7d2'; ctx.lineWidth = 2; ctx.strokeRect(380, 180, 1160, 830);
      const text = (value, x, y, size = 22, color = '#d4dfec') => { ctx.font = `${size}px monospace`; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y); };
      if (this.view === 'crew') {
        text('RECENT CREW DIALOGUE',440,250,38,'#a0ffe4');
        const lines = (window.tutorialSystem?.recentDialogue || []).slice(-4);
        if (!lines.length) text('Crew dialogue will appear here as you play.',440,365,22);
        let y=340;
        for (const line of lines) {
          text(line.speaker.toUpperCase(),440,y,18,'#cfa2ff');y+=30;
          let row='';
          for (const word of line.text.split(' ')) { if ((row+' '+word).length>81) {text(row,440,y,20);y+=27;row=word;} else row+=(row?' ':'')+word; }
          if(row)text(row,440,y,20); y+=48;
        }
        text(BARCODE.GamepadUI?.connected?`${BARCODE.ControllerSettings.button(0)} / ${BARCODE.ControllerSettings.button(1)}: Back`:'Enter / Esc / Click: Back',440,920,19,'#a0ffe4');ctx.restore();return;
      }
      if (this.view === 'controller') { this.drawController(ctx, text); ctx.restore(); return; }
      if (this.view === 'archive') { this.drawArchive(ctx, text); ctx.restore(); return; }
      if (this.view === 'timing') { this.drawTiming(ctx, text); ctx.restore(); return; }
      text(this.titleOpen ? 'GAME SETTINGS' : 'PAUSED', 440, 250, 46, '#a0ffe4');
      text(this.titleOpen ? 'Set up your signal before you start.' : 'Take a breath. Keep your signal.', 440, 307, 22);
      text('CONTROLS', 440, 392, 24, '#cfa2ff');
      const road = BARCODE.CacheRoadProof?.active, proof = BARCODE.RunAndGunProof?.active;
      const chapter = road && BARCODE.CacheRoadProof.chapter;
      const combatRoad=this.combatControls();
      if (road) text(chapter ? 'CACHE LINE' : 'PROTOTYPE CHANNEL 02', 440, 350, 20, '#a0ffe4');
      const controls = BARCODE.MacCombatPreview?.active ? (BARCODE.GamepadUI?.connected
        ? ['Stick / D-pad: Walk the street in both axes', `${BARCODE.ControllerSettings.prompt('jump')}: Jump`, `${BARCODE.ControllerSettings.prompt('road_attack')}: Strike; ${BARCODE.ControllerSettings.prompt('road_defend')}: Guard; ${BARCODE.ControllerSettings.prompt('road_disrupt')}: Throw`, 'Fresh guard counters a committed attack.', `${BARCODE.ControllerSettings.prompt('inspect')}: Talk at Kave’s desk`, `${BARCODE.ControllerSettings.button(0)} / ${BARCODE.ControllerSettings.button(1)}: choices; ${BARCODE.ControllerSettings.button(9)}: Pause`]
        : ['WASD / arrows: Walk the street in both axes', 'Space: Jump; J / F: Strike', 'K / G: Guard; L / V: Nearby throw', 'Fresh guard counters a committed attack.', 'E: Talk; Space / Enter: Next; 1 / 2: Choices', 'P / Escape: Pause']) : road ? (combatRoad ? (BARCODE.GamepadUI?.connected
        ? ['Stick / D-pad: Steer; Up / Down: Queue gear', `${BARCODE.ControllerSettings.prompt('road_attack','F')}: Attack; ${BARCODE.ControllerSettings.prompt('road_turbo','SPACE')}: Turbo`, `${BARCODE.ControllerSettings.prompt('road_defend','G')}: Defend; ${BARCODE.ControllerSettings.prompt('road_disrupt','V')}: Disrupt`, 'Face buttons: Four synchronization pieces', 'Match the pad. Press on beat ONE at the rear tires.', 'Fight for openings. Attack breaks the boss systems.']
        : ['A / D or Left / Right: Steer; Up / Down: Queue gear', 'F: Attack; Space: Turbo', 'G: Defend; V: Disrupt', 'K / L / J / I: Four synchronization pieces', 'Match the pad. Press on beat ONE at the rear tires.', 'Fight for openings. Attack breaks the boss systems.']) : BARCODE.GamepadUI?.connected
        ? ['Stick / D-pad: Steer; Up / Down: Queue gear', `${BARCODE.ControllerSettings.button(4)}: Turbo; ${BARCODE.ControllerSettings.button(5)}: Echo`, 'Face buttons: Surge / Push / Brace / Refill', 'Match the pad. Press on beat ONE at the rear tires.', 'A catch brings that lane into the song.', 'Optional record: hold its lane for 0.65s.']
        : ['A / D or Left / Right: Steer; Up / Down: Queue gear', 'Space: Turbo; H: Echo', 'K: Surge; L: Push; J: Brace; I: Refill', 'Match the pad. Press on beat ONE at the rear tires.', 'A catch brings that lane into the song.', 'Optional record: hold its lane for 0.65s.'])
        : proof ? (BARCODE.GamepadUI?.connected
        ? ['Stick / D-pad: Move', `${BARCODE.ControllerSettings.prompt('jump')}: Jump`, `${BARCODE.ControllerSettings.prompt('inspect')}: Fire`, 'Climb: break roof nodes, then relays.', 'Jump the lanes; watch for a runner.', `${BARCODE.ControllerSettings.button(9)}: Pause / Settings`]
        : ['A / D or Left / Right: Move', 'Space / W / Up: Jump', 'E: Fire / Hold E for repeat fire', 'Climb: break roof nodes, then relays.', 'Jump the lanes; watch for a runner.', 'P: Pause'])
        : (BARCODE.GamepadUI?.connected ? [`Stick / D-pad: Walk; hold ${BARCODE.ControllerSettings.prompt('run')}: Run`, `${BARCODE.ControllerSettings.prompt('jump')}: Jump / Down + Jump: Drop`, `${BARCODE.ControllerSettings.prompt('rhythm_mode')}: Rhythm Mode`, `${BARCODE.ControllerSettings.prompt('primary')}: Beat attack`, `${BARCODE.ControllerSettings.prompt('interact')}: Hack`, `${BARCODE.ControllerSettings.button(9)}: Pause / Settings`] : ['A / D or Left / Right: Walk; hold Shift: Run', 'Space / W / Up: Jump; Down + Jump: Drop', 'R: Enter Rhythm Mode', 'Down: Attack on the beat', 'H: Hack when unlocked', 'P: Pause']);
      if (road && BARCODE.CacheRoadGuidance) BARCODE.CacheRoadGuidance.drawHelp(ctx, BARCODE.CacheRoadProof);
      else controls.forEach((line, i) => text(line, 440, 448 + i * 46, 21));
      const mac = BARCODE.MacCombatPreview?.active;
      if (!road) text(mac ? 'MAC’S STREET' : proof ? 'PROTOTYPE CHANNEL 03' : 'RHYTHM MODE HOLDS YOUR STANCE', 440, 772, 20, '#a0ffe4');
      text(mac ? 'Strike. Guard the tell, or dodge its lane.' : chapter ? 'Return to bridge keeps your saved road marker.' : road || proof ? 'Choose Exit preview to return to Cache Back.' : BARCODE.GamepadUI?.connected ? `${BARCODE.ControllerSettings.button(1)} exits so you can move.` : 'R or Escape exits so you can move.', 440, road ? 819 : 810, 20);
      const d=BARCODE.LevelDifficulty;
      text(mac ? 'Exit returns to title. Progress is not saved.' : chapter ? `CHAPTER 02 / ${chapter.difficultyId.toUpperCase()} / CHECKPOINTS` : road ? 'Practice preview: progress saves at road markers.' : proof ? 'Practice preview: progress saves at each relay.' : d?.locked ? `LEVEL RULES: ${d.choice?.label} / ${d.recoveryMode==='full-run'?'FULL RUN':'CHECKPOINTS'}` : 'Difficulty + recovery: choose at level start.',440,855,18,'#cfa2ff');
      text('Audio, visuals and controls can change anytime.',440,886,18,'#a0ffe4');
      visibleRows().forEach(([key, label], index) => {
        const y = rowTop + index * rowStep, selected = index === this.focus;
        ctx.fillStyle = selected ? '#16394b' : '#0d2032'; ctx.fillRect(1020, y, 480, rowStep);
        if (selected) { ctx.strokeStyle = '#94ffe3'; ctx.strokeRect(1020, y, 480, rowStep); }
        text(key==='resume'&&this.titleOpen?'Back to title':label, 1038, y + 20, 20);
        if (index < 2) {
          ctx.fillStyle = '#334358'; ctx.fillRect(1260, y + 17, 190, 8);
          ctx.fillStyle = '#94ffe3'; ctx.fillRect(1260, y + 17, 190 * preferences.values[key], 8);
          ctx.fillRect(1257 + 190 * preferences.values[key], y + 10, 6, 22);
          text(`${Math.round(preferences.values[key] * 100)}`, 1460, y + 20, 17);
        } else if (typeof defaults[key] === 'boolean') text(preferences.values[key] ? 'ON' : 'OFF', 1438, y + 20, 20, preferences.values[key] ? '#94ffe3' : '#b3a1c7');
        else if (key === 'fullscreen') text(window.fullscreenManager?.isActive ? 'ON' : 'OFF',1438,y+20,20,'#94ffe3');
        else if (key === 'archive') text('L', 1460, y + 20, 20, '#cfa2ff');
      });
      text(this.message || (preferences.saved ? 'Settings save automatically.' : 'Settings apply now; saving is unavailable here.'), 440, 948, 19, '#cfa2ff');
      text(this.titleOpen ? 'Arrows / Tab: Select    Enter: Change    Esc: Back to title' : BARCODE.GamepadUI?.connected ? BARCODE.ControllerSettings.menuHelp() : 'Tab / Up / Down: Select   Left / Right: Adjust   Enter: Choose   P / Esc: Resume', 440, 984, 18);
      ctx.restore();
    }
  };
  preferences.load();
})();
