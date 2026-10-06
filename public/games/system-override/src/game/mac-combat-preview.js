// Private Mac chapter preview. Simulation, input, audio and pause use existing owners.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/mac-combat-preview.js', exports: ['BARCODE.MacCombatPreview'], dependencies: ['BARCODE.MacStreetCombat', 'BARCODE.MacStreetStory', 'BARCODE.RuntimeLifecycle'] });
(function(B) {
  'use strict';
  const ROOT = 'assets/mac-street-review/';
  const ART = {
    mac: ROOT + 'mac-poses-v3.png', street: ROOT + 'street-panorama-v1.png',
    hero: ROOT + 'mac-hero-v2.png', kave: ROOT + 'scene03-kave-dead-air-v3.png',
    margin: ROOT + 'scene05-margin-note-v1.png', record: ROOT + 'scene06-record-straight-v1.png',
    delivered: 'assets/cache-ending/ending-01-delivered.webp',
    unverified: 'assets/cache-ending/ending-02-unverified.webp',
    held: 'assets/cache-ending/ending-03-held.webp', access: 'assets/cache-ending/ending-04-street-access.webp'
  };
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const COMBAT_CUES = { 'enemy-hit': 'hit', 'parry': 'perfect', 'block': 'guard', 'player-hit': 'damage',
    'enemy-defeated': 'defeat', 'enemy-tell': 'warning', 'jump': 'jump', 'land': 'land', 'throw': 'metal' };
  const P = B.MacCombatPreview = {
    active: false, pending: false, phase: null, status: null, assets: new Map(), generation: 0,
    requested() { try { return new URLSearchParams(window.location.search).get('preview') === 'mac-firstslice'; } catch (_) { return false; } },
    async prepare() {
      const generation = ++this.generation;
      this.pending = true;
      const load = async url => {
        const image = new Image(); image.src = url;
        await image.decode();
        if (generation !== this.generation) throw new Error('mac-preview-cancelled');
        return image;
      };
      try {
        const images = await Promise.all(Object.values(ART).map(async url => [url, await load(url)]));
        const frameResponse = await fetch(ROOT + 'mac-poses-v3-frames.json');
        if (!frameResponse.ok) throw new Error('mac-pose-registration-unavailable');
        const poseFrames = await frameResponse.json();
        const enemies = await Promise.all(['corrupted_walk_walk', 'firewall_walk_walk'].map(async name => {
          const url = 'assets/sprites-v3/prepared/' + name;
          const [image, response] = await Promise.all([load(url + '.webp'), fetch(url + '.json')]);
          if (!response.ok) throw new Error('mac-enemy-art-unavailable');
          const json = await response.json();
          return { image, frames: Object.values(json.frames).map(frame => frame.frame) };
        }));
        if (generation !== this.generation) throw new Error('mac-preview-cancelled');
        this.assets = new Map(images); this.enemyArt = enemies; this.poseFrames = poseFrames;
        return { ok: true };
      } finally { if (generation === this.generation) this.pending = false; }
    },
    async enter() {
      if (!B.MacStreetCombat || !B.MacStreetStory || !this.assets.size) throw new Error('mac-preview-not-ready');
      const generation = this.generation;
      this.combat = B.MacStreetCombat.create();
      this.story = B.MacStreetStory.createIntro();
      this.phase = 'intro'; this.status = 'playing'; this.active = true; this.cameraX = 0;
      this.focus = 0; this.elapsedMs = 0; this.lastEvents = []; this.audioNotice = null;
      this.makeDialogueReadout();
      const input = window.inputManager?.actionInput;
      if (input) {
        this.previousKeyboard = JSON.parse(JSON.stringify(input.keyboardBindings));
        input.remap('jump', [' ']); input.remap('road_attack', ['j', 'f']);
        input.remap('road_defend', ['k', 'g']); input.remap('road_disrupt', ['l', 'v']);
      }
      // These two local stems are temporary preview audio, never canonical Mac music.
      await window.initAudio?.({ prepareLevel01: false });
      if (generation !== this.generation) return { ok: false, reason: 'mac-preview-cancelled' };
      window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
      const profile = B.MusicProfiles?.select('level-03.proof');
      const loaded = profile && B.MusicTransport?.load('level-03.proof');
      if (!loaded || loaded.status !== 'ok') throw new Error('mac-preview-audio-profile-unavailable');
      const ready = await window.audioSystem?.prepareActiveMusicProfile?.();
      if (generation !== this.generation) return { ok: false, reason: 'mac-preview-cancelled' };
      if (!ready?.ok) throw new Error('mac-preview-audio-unavailable');
      this.resetInputs();
      return { ok: true };
    },
    resetInputs() { window.inputManager?.resetActionEdges?.(); B.TouchControls?.sync?.(); },
    dispose() {
      this.generation++; this.active = false; this.pending = false;
      if (this.previousKeyboard && window.inputManager?.actionInput) window.inputManager.actionInput.keyboardBindings = this.previousKeyboard;
      this.previousKeyboard = null; this.combat = null; this.story = null; this.phase = null; this.status = null;
      this.assets.clear(); this.enemyArt = null; this.poseFrames = null; this.lastEvents = [];
      this.dialogueReadout?.remove(); this.dialogueReadout = null; this.resetInputs();
    },
    exit() { return B.RuntimeLifecycle?.returnToTitle?.({ source: 'mac-preview-title' }); },
    retry() {
      if (!this.active) return false;
      this.combat.retry(); this.phase = 'street'; this.status = 'playing'; this.story = null;
      this.cameraX = 0; this.resetInputs(); window.audioSystem?.startRuntimeGameplayMusic?.(); return true;
    },
    dialogue() { return this.active && (this.phase === 'intro' || this.phase === 'desk'); },
    getControlState() { return this.combat?.getControlState?.() || {}; },
    finishReading() {
      if (!this.story?.snapshot().done) return;
      if (this.phase === 'intro') {
        this.phase = 'street'; this.story = null; this.resetInputs();
        const started = window.audioSystem?.startRuntimeGameplayMusic?.();
        if (!started?.ok) { this.audioNotice = 'Music paused. Open Pause and resume to retry.'; }
      } else { this.phase = 'complete'; this.status = 'clear'; this.resetInputs(); }
    },
    advance() { if (!this.dialogue() || window.isPaused) return false; const r = this.story.advance(); this.finishReading(); return r; },
    choose(index) { if (!this.dialogue() || window.isPaused) return false; const r = this.story.choose(index); if (r.accepted) this.resetInputs(); return r; },
    skip() { if (!this.dialogue() || window.isPaused) return false; this.story.skip(); this.finishReading(); return true; },
    keyDown(event) {
      if (!this.active || window.isPaused) return false;
      const key = event.key.toLowerCase();
      if (key === 'escape') { event.preventDefault(); if (!event.repeat) B.RuntimeLifecycle.togglePause(); return true; }
      if (this.dialogue() && [' ', 'enter', '1', '2', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault(); if (event.repeat) return true;
        const choice = this.story.snapshot().choice;
        if (choice && key === 'arrowleft') this.focus = 0;
        else if (choice && key === 'arrowright') this.focus = 1;
        else if (choice) this.choose(key === '2' ? 1 : key === '1' ? 0 : this.focus);
        else if (key === ' ' || key === 'enter') this.advance();
        return true;
      }
      if (this.status !== 'playing' && ['r', 'enter', 'c'].includes(key)) { event.preventDefault(); if (!event.repeat) key === 'c' ? this.exit() : this.retry(); return true; }
      return false;
    },
    handleActions(actions) {
      if (!this.active || window.isPaused || this.status !== 'playing') return;
      if (this.dialogue()) {
        const choice = this.story.snapshot().choice;
        if (choice) {
          if (actions.move_left?.pressed) this.focus = 0;
          if (actions.move_right?.pressed) this.focus = 1;
          if (actions.road_a?.pressed) this.choose(0);
          else if (actions.road_b?.pressed) this.choose(1);
          else if (actions.inspect?.pressed) this.choose(this.focus);
        } else if (actions.jump?.pressed || actions.inspect?.pressed) this.advance();
        return;
      }
      const state = this.combat.getSnapshot();
      if (state.desk.unlocked && Math.abs(state.player.x - state.desk.x) < 190 && actions.inspect?.pressed) {
        this.phase = 'desk'; this.story = B.MacStreetStory.createDesk(); this.focus = 0; this.resetInputs(); return;
      }
      this.combat.handleInput({
        move_x: Number(!!actions.move_right?.held) - Number(!!actions.move_left?.held),
        move_y: Number(!!actions.move_down?.held) - Number(!!actions.move_up?.held),
        jump: actions.jump, strike: actions.road_attack, guard: actions.road_defend, throw: actions.road_disrupt
      });
    },
    update(delta) {
      if (!this.active || window.isPaused || this.status !== 'playing') return;
      this.elapsedMs += delta;
      if (this.dialogue()) { this.story.update(delta); return; }
      this.combat.update(delta);
      const s = this.combat.getSnapshot(); this.cameraX += (clamp(s.player.x - 555, 0, 3400 - 1920 / 1.35) - this.cameraX) * Math.min(1, delta / 120);
      this.lastEvents = this.combat.drainEvents();
      for (const event of this.lastEvents) if (COMBAT_CUES[event.type]) window.audioSystem?.playCombatCue?.(COMBAT_CUES[event.type]);
      if (s.status === 'defeated') { this.status = 'failed'; this.resetInputs(); }
    },
    getSnapshot() { return { active: this.active, phase: this.phase, status: this.status, cameraX: this.cameraX, combat: this.combat?.getSnapshot?.(), story: this.story?.snapshot?.(), ownsLoop: false, persistentWrites: 0 }; },
    draw(ctx) {
      if (!ctx || !this.active) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
      ctx.clearRect(0, 0, 1920, 1080); ctx.fillStyle = '#08111a'; ctx.fillRect(0, 0, 1920, 1080);
      if (this.dialogue()) this.drawDialogue(ctx); else this.drawStreet(ctx);
      this.syncDialogueReadout();
      ctx.restore();
    },
    makeDialogueReadout() {
      if (this.dialogueReadout || !document.body) return;
      const box = document.createElement('section'); box.className = 'mac-dialogue-readout';
      box.setAttribute('aria-label', 'Comic dialogue'); box.hidden = true;
      this.dialogueArtLabel = document.createElement('small');
      this.dialogueSpeaker = document.createElement('strong'); this.dialogueText = document.createElement('p');
      box.append(this.dialogueArtLabel, this.dialogueSpeaker, this.dialogueText); document.body.appendChild(box); this.dialogueReadout = box;
    },
    syncDialogueReadout() {
      if (!this.dialogueReadout) return;
      const visible = B.TouchControls?.enabled && this.dialogue() && !window.isPaused;
      this.dialogueReadout.hidden = !visible;
      if (!visible) return;
      const s = this.story.snapshot();
      this.dialogueArtLabel.hidden = !s.artLabel;
      if (this.dialogueArtLabel.textContent !== (s.artLabel || '')) this.dialogueArtLabel.textContent = s.artLabel || '';
      if (this.dialogueSpeaker.textContent !== s.speaker) this.dialogueSpeaker.textContent = s.speaker;
      if (this.dialogueText.textContent !== s.text) this.dialogueText.textContent = s.text;
    },
    text(ctx, value, x, y, size = 24, color = '#f5eee3', align = 'left') {
      ctx.fillStyle = color; ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillText(value, x, y);
    },
    wrap(ctx, value, x, y, maxWidth, step = 40) {
      let row = '', line = 0;
      for (const word of value.split(' ')) { const next = row ? row + ' ' + word : word;
        if (ctx.measureText(next).width > maxWidth && row) { ctx.fillText(row, x, y + line++ * step); row = word; } else row = next;
      }
      ctx.fillText(row, x, y + line * step); return line + 1;
    },
    drawDialogue(ctx) {
      const s = this.story.snapshot(), art = this.assets.get(s.artPath || s.asset);
      this.text(ctx, this.phase === 'intro' ? 'GET IT HEARD' : 'KAVEMAN RADIO', 125, 30, 34, '#eec871');
      this.text(ctx, this.phase === 'intro' ? `${s.page + 1} / 8` : 'THE LOCAL SIGNAL', 1795, 40, 22, '#66cabe', 'right');
      if (art) { const scale = Math.min(1670 / art.width, 670 / art.height), w = art.width * scale, h = art.height * scale;
        const left = (1920 - w) / 2, top = 94 + (670 - h) / 2;
        ctx.drawImage(art, left, top, w, h);
        if (s.annotations?.length) {
          ctx.save(); ctx.translate(left + w * .78, top + h * .17); ctx.rotate(-.12);
          ctx.fillStyle = '#252533'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          this.wrap(ctx, s.annotations.map(a => typeof a === 'string' ? a : a.text).join(' · '), 0, 0, w * .18, 25);
          ctx.restore();
        }
      }
      if (s.artLabel && !B.TouchControls?.enabled) {
        ctx.fillStyle = '#101e2df2'; ctx.fillRect(140, 105, 470, 39);
        this.text(ctx, s.artLabel, 153, 112, 22, '#eec871');
      }
      if (B.TouchControls?.enabled) return;
      ctx.fillStyle = '#101e2d'; ctx.fillRect(120, 764, 1680, 260); ctx.strokeStyle = '#eec871'; ctx.lineWidth = 3; ctx.strokeRect(120, 764, 1680, 260);
      this.text(ctx, (s.speaker || 'BROADCAST SLUM').toUpperCase(), 155, 783, 22, '#66cabe');
      ctx.fillStyle = '#f5eee3'; ctx.font = 'bold 29px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      this.wrap(ctx, s.text || '', 155, 823, 1580, 37);
      if (s.choice) {
        s.choice.options.forEach((option, i) => {
          const x = 160 + i * 800; ctx.fillStyle = i === this.focus ? '#543146' : '#243044'; ctx.fillRect(x, 945, 775, 59);
          this.text(ctx, `${i + 1}. ${typeof option === 'string' ? option : option.label}`, x + 15, 958, 22);
        });
      } else this.text(ctx, B.TouchControls?.enabled ? 'Tap Next' : 'Space / A: next · P: pause', 1760, 984, 20, '#eec871', 'right');
    },
    drawActor(ctx, image, frame, x, feet, height, facing, anchor = .96) {
      const width = frame.w * height / frame.h;
      ctx.save(); ctx.translate(x, feet); ctx.scale(facing, 1);
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -width / 2, -height * anchor, width, height); ctx.restore();
    },
    drawStreet(ctx) {
      const s = this.combat.getSnapshot(), camera = this.cameraX, backdrop = this.assets.get(ART.street);
      ctx.save(); ctx.translate(0, -350); ctx.scale(1.35, 1.35);
      if (backdrop) {
        const height = 3400 * backdrop.height / backdrop.width;
        ctx.drawImage(backdrop, -camera, 1080 - height, 3400, height);
      }
      // Floor marks and telegraphs convey the lane and committed strike, not damage on touch.
      ctx.strokeStyle = '#eec87145'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 984); ctx.lineTo(1920, 984); ctx.stroke();
      const actors = [{ type: 'mac', value: s.player }, ...s.enemies.filter(e => e.hp > 0 && e.x - camera > -220 && e.x - camera < 2140).map(value => ({ type: 'enemy', value }))].sort((a, b) => a.value.laneY - b.value.laneY);
      for (const actor of actors) {
        const p = actor.value, x = p.x - camera;
        ctx.fillStyle = '#02091170'; ctx.beginPath(); ctx.ellipse(x, p.laneY + 2, actor.type === 'mac' ? 43 : 51, 12, 0, 0, Math.PI * 2); ctx.fill();
        if (actor.type === 'mac') {
          const image = this.assets.get(ART.mac); let index = 0;
          if (!p.grounded) index = 5; else if (p.guarding) index = 4;
          else if (p.attack) index = 3; else if (p.mode === 'walk' || Math.abs(p.vx || 0) > 1) index = 1 + Math.floor(this.elapsedMs / 130) % 2;
          if (image && this.poseFrames) { const frame = this.poseFrames.frames[index], source = frame.source, pivot = frame.pivot;
            const scale = 260 / this.poseFrames.pixelScale.standingVisibleHeight;
            ctx.globalAlpha = p.invulnerableMs > 0 && Math.floor(this.elapsedMs / 65) % 2 ? .5 : 1;
            ctx.save(); ctx.translate(x, p.laneY - p.elevation); ctx.scale(p.facing, 1);
            ctx.drawImage(image, source.x, source.y, source.width, source.height, -pivot.x * scale, -pivot.y * scale, source.width * scale, source.height * scale);
            ctx.restore(); ctx.globalAlpha = 1; }
        } else {
          const atlas = this.enemyArt[p.kind === 'charger' || p.kind === 'enforcer' ? 1 : 0];
          if (atlas) this.drawActor(ctx, atlas.image, atlas.frames[Math.floor(this.elapsedMs / 90) % atlas.frames.length], x, p.laneY, 270, p.facing);
          if (p.phase === 'windup') {
            ctx.strokeStyle = '#ff9f62'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x + p.facing * 65, p.attackLaneY || p.laneY, 95, 26, 0, 0, Math.PI * 2); ctx.stroke();
            this.text(ctx, '!', x, p.laneY - 285, 40, '#ffba7a', 'center');
          }
          ctx.fillStyle = '#09121c'; ctx.fillRect(x - 37, p.laneY - 255, 74, 8); ctx.fillStyle = '#de8067'; ctx.fillRect(x - 37, p.laneY - 255, 74 * p.hp / p.maxHp, 8);
        }
      }
      for (const fx of s.hitFx) {
        ctx.strokeStyle = fx.kind === 'parry' ? '#83ffe0' : '#fff1ab'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(fx.x - camera, (fx.laneY || fx.y) - 125, 14, 0, Math.PI * 2); ctx.stroke();
      }
      if (s.arena.active) { const x = s.arena.gateX - camera; ctx.strokeStyle = '#eac16b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, 780); ctx.lineTo(x, 984); ctx.stroke(); this.text(ctx, 'CLEAR THE STREET', x - 20, 739, 17, '#eac16b', 'right'); }
      ctx.restore();
      ctx.fillStyle = '#08121eee'; ctx.fillRect(0, 0, 1920, 105);
      this.text(ctx, 'MAC MODEM', 120, 24, 30, '#eec871');
      this.text(ctx, 'BROADCAST SLUM', 120, 66, 18, '#82cfc2');
      const healthPips = Math.ceil(10 * s.player.hp / s.player.maxHp);
      for (let i = 0; i < 10; i++) { ctx.fillStyle = i < healthPips ? '#dc7c86' : '#394350'; ctx.fillRect(440 + i * 26, 34, 19, 15); }
      this.text(ctx, s.desk.unlocked ? 'Reach Kave’s review desk →' : 'Open a route through the street', 1740, 30, 24, '#eee2c9', 'right');
      if (!B.TouchControls?.enabled) this.text(ctx, 'WASD / arrows: move · Space: jump · J: strike · K: guard · L: throw · E: talk · P: pause', 960, 1045, 22, '#eec871', 'center');
      if (s.desk.unlocked && Math.abs(s.player.x - s.desk.x) < 190) {
        const talk = B.GamepadUI?.connected ? B.ControllerSettings?.prompt?.('inspect') || 'RB' : 'E';
        ctx.fillStyle = '#101e2deb'; ctx.fillRect(660, 155, 600, 88); this.text(ctx, B.TouchControls?.enabled ? 'Tap Talk to hear Kave' : `${talk}: talk to Kave`, 960, 180, 25, '#83dfce', 'center');
      }
      if (this.status !== 'playing') {
        ctx.fillStyle = '#08111aee'; ctx.fillRect(440, 310, 1040, 370);
        this.text(ctx, this.status === 'clear' ? 'THE LOCAL SIGNAL IS BACK' : 'TAKE ANOTHER RUN', 960, 355, 38, '#eec871', 'center');
        this.text(ctx, this.status === 'clear' ? 'Artists can reach this neighborhood again.' : 'Watch the tell. Step aside, guard, or counter.', 960, 433, 26, '#eee2c9', 'center');
        this.text(ctx, 'The rest of Broadcast Slum lies ahead.', 960, 480, 24, '#82cfc2', 'center');
        if (!B.TouchControls?.enabled) this.text(ctx, 'R / A: retry · C / B: back to title', 960, 575, 25, '#eec871', 'center');
      }
    }
  };
})(window.BARCODE = window.BARCODE || {});
