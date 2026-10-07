// Private Mac chapter preview. Simulation, input, audio and pause use existing owners.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/mac-combat-preview.js', exports: ['BARCODE.MacCombatPreview'], dependencies: ['BARCODE.MacStreetCombat', 'BARCODE.MacStreetStory', 'BARCODE.MacCombatFrames', 'BARCODE.RuntimeLifecycle'] });
(function(B) {
  'use strict';
  const ROOT = 'assets/mac-street-review/';
  const CITY_ROOT = 'assets/mac-city-review/';
  const FRAME_ROOT = 'assets/mac-combat-frames/';
  const ART = {
    street: ROOT + 'street-panorama-v1.png',
    hero: ROOT + 'mac-hero-v2.png', kave: ROOT + 'scene03-kave-dead-air-v5.png',
    margin: ROOT + 'scene05-margin-note-v1.png', record: ROOT + 'scene06-record-straight-v1.png',
    delivered: 'assets/cache-ending/ending-01-delivered.webp',
    unverified: 'assets/cache-ending/ending-02-unverified.webp',
    held: 'assets/cache-ending/ending-03-held.webp', access: 'assets/cache-ending/ending-04-street-access.webp'
  };
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const COMBAT_CUES = { 'enemy-hit': 'hit', 'parry': 'perfect', 'block': 'guard', 'player-hit': 'damage',
    'enemy-defeated': 'defeat', 'enemy-tell': 'warning', 'jump': 'jump', 'land': 'land', 'throw': 'metal' };
  const P = B.MacCombatPreview = {
    active: false, pending: false, phase: null, status: null, assets: new Map(), frameArt: new Map(), generation: 0,
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
      const verifiedBytes = async (url, expectedHash) => {
        if (typeof url !== 'string' || !url.startsWith(FRAME_ROOT) || url.includes('..') || !/^[a-f0-9]{64}$/i.test(expectedHash || '')) throw new Error('mac-frame-asset-registration-invalid');
        if (!window.crypto?.subtle) throw new Error('mac-frame-hash-verification-unavailable');
        const response = await fetch(url);
        if (!response.ok) throw new Error('mac-frame-asset-unavailable: ' + url);
        const bytes = await response.arrayBuffer();
        const digest = await window.crypto.subtle.digest('SHA-256', bytes);
        const actualHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actualHash !== expectedHash.toLowerCase()) throw new Error('mac-frame-asset-hash-mismatch: ' + url);
        if (generation !== this.generation) throw new Error('mac-preview-cancelled');
        return bytes;
      };
      try {
        if (!B.MacCombatFrames) throw new Error('mac-frame-player-unavailable');
        const images = await Promise.all(Object.entries(ART).filter(([name]) => name !== 'street').map(async ([, url]) => [url, await load(url)]));
        const manifestResponse = await fetch(CITY_ROOT + 'mac-city-art-v1.json');
        if (!manifestResponse.ok) throw new Error('mac-city-art-unavailable');
        const cityArt = await manifestResponse.json();
        if (cityArt.actors?.length !== 7 || cityArt.zones?.length !== 6) throw new Error('mac-city-art-incomplete');
        const frameResponse = await fetch(FRAME_ROOT + 'mac-combat-frames-v1.json');
        if (!frameResponse.ok) throw new Error('mac-frame-art-unavailable');
        const frameManifest = await frameResponse.json();
        const kinds = ['mac', ...Object.keys(B.MacCombatFrames.styles)];
        if (frameManifest.schemaVersion !== 1 || !Array.isArray(frameManifest.actors) || frameManifest.actors.length !== 8 || kinds.some(kind => frameManifest.actors.filter(actor => actor.kind === kind).length !== 1)) throw new Error('mac-frame-art-incomplete');
        const frames = await Promise.all(frameManifest.actors.map(async actor => {
          const bytes = await verifiedBytes(actor.registration, actor.registrationSHA256);
          const registration = JSON.parse(new TextDecoder().decode(bytes));
          const compiled = B.MacCombatFrames.compile(registration, { complete: true });
          if (compiled.actor !== actor.kind) throw new Error('mac-frame-actor-identity-mismatch');
          const images = new Map(await Promise.all(Object.values(compiled.sheets).map(async sheet => {
            await verifiedBytes(sheet.sourceImage, sheet.sourceSHA256);
            const image = await load(sheet.sourceImage);
            if ((image.naturalWidth || image.width) !== sheet.dimensions.width || (image.naturalHeight || image.height) !== sheet.dimensions.height) throw new Error('mac-frame-native-dimensions-mismatch');
            return [sheet.id, image];
          })));
          return [actor.kind, { images, registration, compiled, displayName: actor.displayName, bloodColor: actor.bloodColor }];
        }));
        if (generation !== this.generation) throw new Error('mac-preview-cancelled');
        this.assets = new Map(images); this.frameArt = new Map(frames); this.frameManifest = frameManifest;
        this.cityArt = cityArt; this.zonePromises = new Map(); this.zoneLoadError = null;
        // Decode the opening and next district only. Later scenery enters the
        // same asset owner as it is needed, keeping all six native backdrops
        // from staying resident throughout the chapter.
        await Promise.all([this.ensureZoneArt(0), this.ensureZoneArt(1)]);
        if (generation !== this.generation) throw new Error('mac-preview-cancelled');
        return { ok: true };
      } finally { if (generation === this.generation) this.pending = false; }
    },
    ensureZoneArt(index) {
      const zone = this.cityArt?.zones[index];
      if (!zone) return Promise.resolve(true);
      if (this.assets.has(zone.background)) return Promise.resolve(true);
      if (this.zonePromises.has(index)) return this.zonePromises.get(index);
      const generation = this.generation;
      const preparing = (async () => {
        const image = new Image(); image.src = zone.background; await image.decode();
        if (generation !== this.generation || this.zonePromises.get(index) !== preparing) return false;
        this.assets.set(zone.background, image); return true;
      })().catch(error => {
        if (generation === this.generation) this.zoneLoadError = { index, message: 'This area could not load. Pause and retry the fight.' };
        throw error;
      });
      this.zonePromises.set(index, preparing); return preparing;
    },
    async enter() {
      if (!B.MacStreetCombat || !B.MacStreetStory || !B.MacCombatFrames || !this.assets.size || this.frameArt.size !== 8) throw new Error('mac-preview-not-ready');
      const generation = this.generation;
      this.combat = B.MacStreetCombat.create();
      this.story = B.MacStreetStory.createIntro();
      this.phase = 'intro'; this.status = 'playing'; this.active = true; this.cameraX = 0;
      this.focus = 0; this.elapsedMs = 0; this.lastEvents = []; this.audioNotice = null;
      this.playerDefeatedAtMs = null; this.playerDefeatedHostAtMs = null;
      this.playerLandedAtMs = null;
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
      this.assets.clear(); this.frameArt.clear(); this.frameManifest = null; this.cityArt = null; this.zonePromises?.clear(); this.lastEvents = [];
      this.playerDefeatedAtMs = null; this.playerDefeatedHostAtMs = null;
      this.playerLandedAtMs = null;
      this.dialogueReadout?.remove(); this.dialogueReadout = null; this.resetInputs();
    },
    exit() { return B.RuntimeLifecycle?.returnToTitle?.({ source: 'mac-preview-title' }); },
    retry() {
      if (!this.active) return false;
      if (this.status === 'clear') this.combat = B.MacStreetCombat.create(); else this.combat.retry();
      this.phase = 'street'; this.status = 'playing'; this.story = null;
      this.playerDefeatedAtMs = null; this.playerDefeatedHostAtMs = null;
      this.playerLandedAtMs = null;
      const state = this.combat.getSnapshot(); this.cameraX = state.zone?.startX || 0;
      const currentZone = (state.zone?.index || 1) - 1;
      for (let index = 0; index < this.cityArt.zones.length; index++) {
        if (index !== currentZone && index !== currentZone + 1) {
          this.assets.delete(this.cityArt.zones[index].background); this.zonePromises.delete(index);
        }
      }
      if (this.zoneLoadError) { this.zonePromises.delete(this.zoneLoadError.index); this.zoneLoadError = null; }
      this.ensureZoneArt(currentZone).catch(() => {});
      this.resetInputs(); window.audioSystem?.startRuntimeGameplayMusic?.(); return true;
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
        else if (choice?.optional && key === ' ') this.advance();
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
          if (actions.inspect?.pressed) choice.optional ? this.advance() : this.choose(this.focus);
          else if (actions.jump?.pressed) this.choose(this.focus);
          else if (actions.road_a?.pressed) this.choose(0);
          else if (actions.road_b?.pressed) this.choose(1);
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
      if (!this.active || window.isPaused) return;
      if (this.status !== 'playing') {
        // The result keeps gameplay frozen. Only the existing host frame clock
        // continues the finite authored fall from the actual defeat receipt.
        if (this.status === 'failed' && this.playerDefeatedAtMs !== null) this.elapsedMs += delta;
        return;
      }
      this.elapsedMs += delta;
      if (this.dialogue()) { this.story.update(delta); return; }
      const before = this.combat.getSnapshot(), zoneIndex = (before.zone?.index || 1) - 1;
      const zoneArt = this.cityArt.zones[zoneIndex];
      if (!this.assets.has(zoneArt.background)) {
        if (this.zoneLoadError?.index === zoneIndex) { this.status = 'failed'; this.resetInputs(); }
        else this.ensureZoneArt(zoneIndex).catch(() => {});
        return;
      }
      this.combat.update(delta);
      const s = this.combat.getSnapshot(), zone = s.zone || { startX: 0, endX: B.MacStreetCombat.constants.worldWidth, index: 0 };
      const left = zone.startX, right = Math.max(left, zone.endX + (zone.cleared ? 220 : 0) - 1920 / 1.35);
      const targetCamera = clamp(s.player.x - 555, left, right);
      if (this.cameraX < left || this.cameraX > right) this.cameraX = targetCamera;
      else this.cameraX += (targetCamera - this.cameraX) * Math.min(1, delta / 120);
      this.ensureZoneArt(zone.index).catch(() => {});
      for (let index = 0; index < zone.index - 1; index++) {
        const retired = this.cityArt.zones[index]; this.assets.delete(retired.background); this.zonePromises.delete(index);
      }
      this.lastEvents = this.combat.drainEvents();
      for (const event of this.lastEvents) {
        if (event.type === 'player-defeated') {
          this.playerDefeatedAtMs = event.atMs; this.playerDefeatedHostAtMs = this.elapsedMs;
        } else if (event.type === 'land') this.playerLandedAtMs = event.atMs;
        else if (event.type === 'jump') this.playerLandedAtMs = null;
      }
      for (const event of this.lastEvents) if (COMBAT_CUES[event.type]) window.audioSystem?.playCombatCue?.(COMBAT_CUES[event.type]);
      if (s.status === 'defeated') { this.status = 'failed'; this.resetInputs(); }
    },
    getSnapshot() { return { active: this.active, phase: this.phase, status: this.status, cameraX: this.cameraX, combat: this.combat?.getSnapshot?.(), story: this.story?.snapshot?.(), ownsLoop: false, persistentWrites: 0 }; },
    draw(ctx) {
      if (!ctx || !this.active) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
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
          const key = B.GamepadUI?.connected ? (i === this.focus ? '›' : ' ') : i + 1;
          this.text(ctx, `${key}. ${typeof option === 'string' ? option : option.label}`, x + 15, 958, 22);
        });
        if (s.choice.optional) this.text(ctx, B.GamepadUI?.connected ? `← / →: choose · ${B.ControllerSettings?.prompt?.('jump') || 'A'}: answer · ${B.ControllerSettings?.prompt?.('inspect') || 'RB'}: continue` : 'Space: continue · 1 / 2: answer', 1760, 1010, 18, '#eec871', 'right');
      } else this.text(ctx, B.TouchControls?.enabled ? 'Tap Next' : 'Space / A: next · P: pause', 1760, 984, 20, '#eec871', 'right');
    },
    drawCityBackdrop(ctx, image, zone, camera) {
      if (!image) return;
      // Preserve architectural proportions. Native-size district panoramas
      // fill the ground plane; shorter panoramas continue as facade sections.
      const height = 1080, width = image.width * height / image.height, offset = zone.startX - camera;
      for (let section = 0; section * width < zone.endX - zone.startX + (zone.cleared ? 220 : 0); section++) {
        const x = offset + section * width;
        if (x > 1920 || x + width < 0) continue;
        ctx.drawImage(image, x, 0, width, height);
        if (section) {
          ctx.fillStyle = '#09151f'; ctx.fillRect(x - 12, 0, 24, 785);
          ctx.fillStyle = '#608883'; ctx.fillRect(x - 3, 0, 6, 785);
        }
      }
    },
    drawTelegraph(ctx, enemy, x) {
      if (enemy.phase !== 'windup' && enemy.animation?.action !== 'tell') return;
      const tell = enemy.attackTell || {}, kind = tell.type || enemy.attackKind || enemy.kind;
      const color = enemy.kind === 'null_regent' ? '#f2aa62' : '#f29b72';
      ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color + '24'; ctx.lineWidth = 3;
      const lane = tell.laneY ?? enemy.laneY, facing = tell.facing || enemy.facing;
      if (tell.lanes?.length > 1) {
        for (const shotLane of tell.lanes) {
          ctx.beginPath(); ctx.moveTo(x + facing * 35, shotLane); ctx.lineTo(x + facing * 235, shotLane);
          ctx.lineTo(x + facing * 217, shotLane - 9); ctx.moveTo(x + facing * 235, shotLane); ctx.lineTo(x + facing * 217, shotLane + 9); ctx.stroke();
        }
      } else if (/charge|lunge|thrust|sweep|rush|flank|slash/.test(kind)) {
        const length = Math.max(tell.range || 0, Math.abs((tell.targetX ?? enemy.x) - (tell.originX ?? enemy.x)), 250), left = facing > 0 ? x : x - length;
        ctx.fillRect(left, lane - 23, length, 46); ctx.strokeRect(left, lane - 23, length, 46);
      } else if (/wave|slam/.test(kind)) {
        ctx.beginPath(); ctx.ellipse(x, lane, 220, 34, 0, 0, Math.PI * 2); ctx.stroke();
        if (tell.canJump) this.text(ctx, 'JUMP', x, lane - 330, 18, color, 'center');
      } else {
        ctx.beginPath(); ctx.ellipse(x + facing * 75, lane, /fan|spit/.test(kind) ? 145 : 105, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      const aboveHead = enemy.laneY - (enemy.kind === 'null_regent' ? 360 : 285);
      ctx.beginPath(); ctx.moveTo(x, aboveHead); ctx.lineTo(x - 10, aboveHead - 19); ctx.lineTo(x + 10, aboveHead - 19); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      ctx.restore();
    },
    drawCombatFx(ctx, fx, camera) {
      const age = fx.ageMs || 0, life = fx.lifeMs || 300, progress = clamp(age / life, 0, 1);
      const color = /^#[0-9a-f]{6}$/i.test(fx.bloodHex || '') ? fx.bloodHex : null;
      const x = fx.x - camera, y = (fx.laneY ?? fx.y) - (fx.elevation ?? 130);
      ctx.save(); ctx.globalAlpha = 1 - progress;
      if (color && fx.particles?.length) {
        ctx.fillStyle = color;
        for (const particle of fx.particles) {
          const px = particle.x - camera, py = particle.laneY - particle.elevation;
          const landed = particle.elevation <= 0, radius = particle.radius || 3;
          // Ballistic positions belong to the simulation. Drawing never adds
          // randomness, timers or damage, and landed droplets settle on the lane.
          ctx.beginPath(); ctx.ellipse(px, py, radius * (landed ? 1.55 : 1), radius * (landed ? .45 : .7),
            landed ? 0 : Math.atan2(-particle.velocityZ, particle.vx), 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.strokeStyle = fx.kind === 'parry' ? '#83ffe0' : fx.kind === 'damage' ? '#ef91a2' : '#fff1ab'; ctx.lineWidth = 3;
        for (let index = 0; index < 6; index++) {
          const angle = index * Math.PI / 3 + .2, inner = 8 + progress * 15, outer = 20 + progress * 30;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner); ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer); ctx.stroke();
        }
      }
      ctx.restore();
    },
    drawStreet(ctx) {
      const s = this.combat.getSnapshot(), camera = this.cameraX, zone = s.zone || {index: 1, startX: 0, endX: 3400, title: 'SERVICE ALLEY'};
      const background = this.cityArt?.zones[zone.index - 1];
      ctx.save(); ctx.translate(0, -350); ctx.scale(1.35, 1.35);
      this.drawCityBackdrop(ctx, this.assets.get(background?.background), zone, camera);
      // Floor marks and telegraphs convey the lane and committed strike, not damage on touch.
      ctx.strokeStyle = '#eec87145'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 984); ctx.lineTo(1920, 984); ctx.stroke();
      const actors = [{ type: 'mac', value: s.player }, ...s.enemies.filter(e => (e.hp > 0 || e.phase === 'defeated' && e.animation.ageMs < 600) && e.x - camera > -220 && e.x - camera < 1920 / 1.35 + 220).map(value => ({ type: 'enemy', value }))].sort((a, b) => a.value.laneY - b.value.laneY);
      for (const actor of actors) {
        const p = actor.value, x = p.x - camera;
        ctx.fillStyle = '#02091170'; ctx.beginPath(); ctx.ellipse(x, p.laneY + 2, actor.type === 'mac' ? 43 : 51, 12, 0, 0, Math.PI * 2); ctx.fill();
        if (actor.type === 'mac') {
          const art = this.frameArt.get('mac');
          if (!art) throw new Error('mac-frame-actor-unavailable: mac');
          const stateAgeMs = this.playerDefeatedAtMs === null ? undefined : Math.max(0, s.elapsedMs - this.playerDefeatedAtMs + this.elapsedMs - this.playerDefeatedHostAtMs);
          const landingAgeMs = this.playerLandedAtMs === null ? undefined : Math.max(0, s.elapsedMs - this.playerLandedAtMs);
          const pose = B.MacCombatFrames.sample(p, {player: true, compiled: art.compiled, stateAgeMs, landingAgeMs, reducedMotion: !!B.Preferences?.values?.reducedMotion});
          // Gameplay freezes its jump height at defeat. Lower the complete cel
          // using the existing result age, reaching the lane before down holds.
          const downStartsMs = art.compiled.clips.defeat.frames.at(-1).startMs;
          const elevation = pose.action === 'defeat' ? p.elevation * (1 - clamp(pose.clipTimeMs / Math.max(1, downStartsMs), 0, 1)) : p.elevation;
          B.MacCombatFrames.draw(ctx, art, pose, x, p.laneY - elevation, 260, p.facing, p.invulnerableMs > 0 ? .86 : 1);
        } else {
          const art = this.frameArt.get(p.kind);
          const height = p.kind === 'null_regent' ? 335 : 260;
          const defeated = p.hp <= 0;
          if (!art) throw new Error('mac-frame-actor-unavailable: ' + p.kind);
          const pose = B.MacCombatFrames.sample(p, {compiled: art.compiled, reducedMotion: !!B.Preferences?.values?.reducedMotion});
          B.MacCombatFrames.draw(ctx, art, pose, x, p.laneY - (p.elevation || 0), height, p.facing);
          this.drawTelegraph(ctx, p, x);
          if (p.kind !== 'null_regent' && !defeated) {
            ctx.fillStyle = '#09121c'; ctx.fillRect(x - 37, p.laneY - height - 17, 74, 7); ctx.fillStyle = p.bloodHex || '#b479ff'; ctx.fillRect(x - 37, p.laneY - height - 17, 74 * p.hp / p.maxHp, 7);
          }
        }
      }
      for (const projectile of s.projectiles || []) {
        const groundWave = projectile.kind === 'ground-wave';
        const height = groundWave ? 9 : /^bile/.test(projectile.kind) ? 190 : projectile.kind === 'fan' ? 245 : 110;
        const x = projectile.x - camera, y = projectile.laneY - height;
        ctx.fillStyle = projectile.color || '#b479ff'; ctx.beginPath(); ctx.ellipse(x, y, groundWave ? 24 : 11, groundWave ? 7 : 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#f3eed1'; ctx.lineWidth = 2; ctx.stroke();
      }
      for (const fx of s.hitFx) this.drawCombatFx(ctx, fx, camera);
      if (s.arena.active) { const x = s.arena.gateX - camera; ctx.strokeStyle = '#eac16b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, 780); ctx.lineTo(x, 984); ctx.stroke(); this.text(ctx, 'CLEAR THE STREET', x - 20, 739, 17, '#eac16b', 'right'); }
      ctx.restore();
      ctx.fillStyle = '#08121eee'; ctx.fillRect(0, 0, 1920, 105);
      this.text(ctx, 'MAC MODEM', 120, 24, 30, '#eec871');
      this.text(ctx, `${zone.index} / 6  ·  ${zone.title.toUpperCase()}`, 120, 66, 18, '#82cfc2');
      const healthPips = Math.ceil(10 * s.player.hp / s.player.maxHp);
      for (let i = 0; i < 10; i++) { ctx.fillStyle = i < healthPips ? '#dc7c86' : '#394350'; ctx.fillRect(440 + i * 26, 34, 19, 15); }
      const objective = s.desk.unlocked ? 'Enter Kave’s studio →' : zone.cleared ? `${zone.exitLabel || 'Continue through the city'} →` : `Clear the area · ${s.wave?.number || 1} / 2`;
      this.text(ctx, objective, 1740, 30, 24, '#eee2c9', 'right');
      const boss = s.enemies.find(enemy => enemy.kind === 'null_regent' && enemy.hp > 0);
      if (boss) {
        ctx.fillStyle = '#101a29'; ctx.fillRect(625, 123, 670, 40); ctx.fillStyle = '#b479ff'; ctx.fillRect(630, 145, 660 * boss.hp / boss.maxHp, 12);
        this.text(ctx, `NULL REGENT · ${boss.bossPhase || 1} / 3`, 960, 125, 15, '#f5eee3', 'center');
      }
      if (!this.assets.has(background?.background) && this.status === 'playing') {
        ctx.fillStyle = '#101e2df5'; ctx.fillRect(690, 430, 540, 90); this.text(ctx, `Entering ${zone.title}…`, 960, 457, 25, '#eec871', 'center');
      }
      if (!B.TouchControls?.enabled) this.text(ctx, 'WASD / arrows: move · Space: jump · J: strike · K: guard · L: throw · E: talk · P: pause', 960, 1045, 22, '#eec871', 'center');
      if (s.desk.unlocked && Math.abs(s.player.x - s.desk.x) < 190) {
        const talk = B.GamepadUI?.connected ? B.ControllerSettings?.prompt?.('inspect') || 'RB' : 'E';
        ctx.fillStyle = '#101e2deb'; ctx.fillRect(660, 155, 600, 88); this.text(ctx, B.TouchControls?.enabled ? 'Tap Talk to hear Kave' : `${talk}: talk to Kave`, 960, 180, 25, '#83dfce', 'center');
      }
      if (this.status !== 'playing') {
        ctx.fillStyle = '#08111aee'; ctx.fillRect(440, 310, 1040, 370);
        this.text(ctx, this.status === 'clear' ? 'THE CITY SIGNAL IS BACK' : this.zoneLoadError ? 'AREA UNAVAILABLE' : 'TAKE ANOTHER RUN', 960, 355, 38, '#eec871', 'center');
        this.text(ctx, this.status === 'clear' ? 'Six districts reopened. Kave can reach the city again.' : this.zoneLoadError?.message || 'Watch the tell. Step aside, guard, or counter.', 960, 433, 26, '#eee2c9', 'center');
        this.text(ctx, this.status === 'clear' ? 'The original recording is on the air.' : 'Your cleared districts stay open.', 960, 480, 24, '#82cfc2', 'center');
        if (!B.TouchControls?.enabled) this.text(ctx, this.status === 'clear' ? 'R / A: replay the city · C / B: back to title' : 'R / A: retry this fight · C / B: back to title', 960, 575, 25, '#eec871', 'center');
      }
    }
  };
})(window.BARCODE = window.BARCODE || {});
