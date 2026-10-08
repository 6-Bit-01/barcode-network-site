// Private Mac chapter preview. Simulation, input, audio and pause use existing owners.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/mac-combat-preview.js', exports: ['BARCODE.MacCombatPreview'], dependencies: ['BARCODE.MacStreetCombat', 'BARCODE.MacStreetStory', 'BARCODE.MacCombatFrames', 'BARCODE.RuntimeLifecycle'] });
(function(B) {
  'use strict';
  const ROOT = 'assets/mac-street-review/';
  const CITY_ROOT = 'assets/mac-city-review/';
  const FRAME_ROOT = 'assets/mac-combat-frames/';
  const POWER_ROOT = 'assets/mac-street-power/';
  const DYNAMIC_ROOT = 'assets/mac-street-dynamic/';
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
    'enemy-defeated': 'defeat', 'enemy-tell': 'warning', 'jump': 'jump', 'land': 'land', 'throw-release': 'metal',
    'body-impact': 'stomp', 'body-land': 'land', 'prop-hit': 'metal', 'prop-break': 'tear', 'pickup': 'pickup', 'relay-restored': 'restore',
    'grab-start': 'metal', 'pummel': 'hit', 'prop-pickup': 'metal', 'prop-throw': 'metal',
    'weapon-equipped': 'pickup', 'weapon-spent': 'metal', 'weapon-fired': 'discharge',
    'powerup': 'pickup', 'barrier-block': 'guard', 'impact-pulse': 'stomp', 'running-kick': 'jump' };
  const WEAPON_KINDS = ['pipe','crowbar','shock-baton','energy-blade','gravity-hammer','scatter-blaster','coil-rifle','plasma-disc'];
  const POWER_CELLS = ['crate_intact','crate_cracked','crate_broken','stall_intact','stall_cracked','stall_broken',
    'relay_off','relay_on','pickup_health',...['red','green','purple'].flatMap(color => ['impact','heavy','floor'].map(kind => `blood_${color}_${kind}`)),
    ...WEAPON_KINDS.map(kind => `weapon_${kind}`),
    ...['car','barrel','fixture_streetlight','fixture_terminal'].flatMap(kind => ['intact','cracked','broken'].map(state => `${kind}_${state}`)),
    ...['overdrive','barrier','impact'].map(kind => `pickup_${kind}`),
    ...['scatter-bolt','coil-bolt','plasma-disc'].map(kind => `projectile_${kind}`)];
  const LESSONS = [
    { id: 'move', title: 'OWN YOUR LANE', text: input => `${input.move}. Move up or down to dodge and line up a hit.`, target: 1 },
    { id: 'run', title: 'PICK UP SPEED', text: input => `${input.run}. Let go to stop running; Guard slows you to a careful step.`, target: 1 },
    { id: 'strike', title: 'MAKE IT A COMBO', text: input => `Stop moving. Tap ${input.strike} three times to finish the chain and knock enemies down.`, target: 3 },
    { id: 'air', title: 'TAKE IT UPSTAIRS', text: input => `${input.jump}, then ${input.strike} in the air for an Air Kick.`, target: 1 },
    { id: 'running-kick', title: 'BRING THE MOMENTUM', text: input => `Run, then tap ${input.strike} for a Run Kick. It launches enemies and saves your weapon's uses.`, target: 1 },
    { id: 'guard', title: 'TURN THEIR HIT AROUND', text: input => `Hold ${input.guard} to block. Tap just before impact, then ${input.strike} to Counter.`, target: 1 },
    { id: 'weapon', title: 'ARM YOURSELF', text: input => `Get close to a weapon and tap ${input.throw}. Use ${input.strike}; every weapon has limited uses.`, target: 1 },
    { id: 'grab', title: 'GET A GRIP', text: input => `Hold ${input.throw} near an enemy or crate. Strong enemies break free sooner. Hits make you drop your hold.`, target: 1 },
    { id: 'pummel', title: 'MAKE THE HOLD COUNT', text: input => `Keep holding an enemy and hold ${input.strike} to Pummel for up to one second.`, target: 1 },
    { id: 'throw', title: 'USE THE WHOLE STREET', text: input => `Release ${input.throw} to throw a held body or prop into the street. Enemy holds last at most three seconds.`, target: 1 },
    { id: 'scenery', title: 'BREAK THE BLOCKADE', text: input => `${input.strike} or throw into crates, cars and street fixtures. Wreckage can reveal weapons and recovery.`, target: 1 },
    { id: 'powerup', title: 'MAKE IT TEMPORARY', text: () => 'Walk over a powerup. Overdrive is timed, Barrier blocks three hits, and Impact powers one hit.', target: 1 },
    { id: 'relay', title: 'GET IT HEARD', text: input => `Clear the market, then ${input.inspect} at the relay. Broken crates drop recovery: walk over it.`, target: 1 }
  ];
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
        if (typeof url !== 'string' || ![FRAME_ROOT, POWER_ROOT, DYNAMIC_ROOT].some(root => url.startsWith(root)) || url.includes('..') || !/^[a-f0-9]{64}$/i.test(expectedHash || '')) throw new Error('mac-frame-asset-registration-invalid');
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
          if (actor.kind === 'mac' && !actor.supplemental) throw new Error('mac-dynamic-registration-unavailable');
          const images = new Map(await Promise.all(Object.values(compiled.sheets).map(async sheet => {
            await verifiedBytes(sheet.sourceImage, sheet.sourceSHA256);
            const image = await load(sheet.sourceImage);
            if ((image.naturalWidth || image.width) !== sheet.dimensions.width || (image.naturalHeight || image.height) !== sheet.dimensions.height) throw new Error('mac-frame-native-dimensions-mismatch');
            return [sheet.id, image];
          })));
          let supplemental = null;
          if (actor.supplemental) {
            if (actor.kind !== 'mac' || !actor.supplemental.registration?.startsWith(DYNAMIC_ROOT)) throw new Error('mac-dynamic-actor-registration-invalid');
            const extraBytes = await verifiedBytes(actor.supplemental.registration, actor.supplemental.registrationSHA256);
            const extraRegistration = JSON.parse(new TextDecoder().decode(extraBytes));
            if (extraRegistration.baseRegistration !== actor.registration || extraRegistration.baseRegistrationSHA256?.toLowerCase() !== actor.registrationSHA256.toLowerCase()) throw new Error('mac-dynamic-base-registration-mismatch');
            supplemental = B.MacCombatFrames.compileSupplemental(extraRegistration, {baseCompiled:compiled});
            const armedBaseClips = ['idle','walk','jump-rise','jump-fall','landing','throw',...['counter','air-kick'].flatMap(move=>['windup','active','recovery'].map(phase=>move+'.'+phase))];
            for (const key of armedBaseClips) for (const entry of compiled.clips[key].frames) {
              if (!compiled.frames[entry.frame].gripAnchor && !supplemental.baseGripAnchors[entry.frame]) throw new Error('mac-native-held-item-anchor-unavailable: ' + entry.frame);
            }
            for (const sheet of Object.values(supplemental.sheets)) {
              if (images.has(sheet.id) || !sheet.sourceImage.startsWith(DYNAMIC_ROOT)) throw new Error('mac-dynamic-sheet-registration-invalid');
              await verifiedBytes(sheet.sourceImage,sheet.sourceSHA256);
              const image = await load(sheet.sourceImage);
              if ((image.naturalWidth || image.width) !== sheet.dimensions.width || (image.naturalHeight || image.height) !== sheet.dimensions.height) throw new Error('mac-frame-native-dimensions-mismatch');
              images.set(sheet.id,image);
            }
          }
          return [actor.kind, { images, registration, compiled, supplemental, displayName: actor.displayName, bloodColor: actor.bloodColor }];
        }));
        const powerResponse = await fetch(POWER_ROOT + 'mac-street-power-v1.json');
        if (!powerResponse.ok) throw new Error('mac-street-power-art-unavailable');
        const powerManifest = await powerResponse.json();
        const powerArt = await this.preparePowerArt(powerManifest, load, verifiedBytes);
        if (generation !== this.generation) throw new Error('mac-preview-cancelled');
        this.assets = new Map(images); this.frameArt = new Map(frames); this.frameManifest = frameManifest;
        this.powerArt = powerArt;
        this.cityArt = cityArt; this.zonePromises = new Map(); this.zoneLoadError = null;
        // Decode the opening and next district only. Later scenery enters the
        // same asset owner as it is needed, keeping all six native backdrops
        // from staying resident throughout the chapter.
        await Promise.all([this.ensureZoneArt(0), this.ensureZoneArt(1)]);
        if (generation !== this.generation) throw new Error('mac-preview-cancelled');
        return { ok: true };
      } finally { if (generation === this.generation) this.pending = false; }
    },
    async preparePowerArt(manifest, load, verifiedBytes) {
      if (manifest?.schema !== 1 || !Array.isArray(manifest.sheets) || manifest.sheets.length < 2 || manifest.sheets.length > 8 || !manifest.cells || Object.keys(manifest.cells).length > 128 || POWER_CELLS.some(name => !manifest.cells[name])) throw new Error('mac-street-power-registration-invalid');
      const sheets = new Map();
      let registeredPixels = 0;
      for (const sheet of manifest.sheets) {
        if (typeof sheet.id !== 'string' || !/^[a-z0-9_-]+$/i.test(sheet.id) || sheets.has(sheet.id) || !sheet.sourceImage?.startsWith(POWER_ROOT) || !Number.isInteger(sheet.dimensions?.width) || !Number.isInteger(sheet.dimensions?.height) || sheet.dimensions.width <= 0 || sheet.dimensions.height <= 0) throw new Error('mac-street-power-sheet-invalid');
        registeredPixels += sheet.dimensions.width * sheet.dimensions.height;
        if (!Number.isSafeInteger(registeredPixels) || registeredPixels > 32000000) throw new Error('mac-street-power-sheet-budget-exceeded');
        await verifiedBytes(sheet.sourceImage, sheet.sourceSHA256);
        const image = await load(sheet.sourceImage);
        if ((image.naturalWidth || image.width) !== sheet.dimensions.width || (image.naturalHeight || image.height) !== sheet.dimensions.height) throw new Error('mac-street-power-native-dimensions-mismatch');
        sheets.set(sheet.id, { ...sheet, image });
      }
      const names = Object.keys(manifest.cells);
      if (names.some(name=>name.startsWith('car_van_')) && ['intact','cracked','broken'].some(state=>!manifest.cells['car_van_'+state])) throw new Error('mac-street-power-variant-incomplete');
      for (const name of names) {
        const cell = manifest.cells[name], sheet = sheets.get(cell?.sheet), source = cell?.source, pivot = cell?.pivot;
        if (!sheet || !source || !['x','y','width','height'].every(key => Number.isInteger(source[key])) || source.x < 0 || source.y < 0 || source.width <= 0 || source.height <= 0 || source.x + source.width > sheet.dimensions.width || source.y + source.height > sheet.dimensions.height || !Number.isFinite(pivot?.x) || !Number.isFinite(pivot?.y) || pivot.x < 0 || pivot.y < 0 || pivot.x > source.width || pivot.y > source.height || !Number.isFinite(cell.displayHeight) || cell.displayHeight <= 0 || cell.displayHeight > (name.startsWith('fixture_streetlight_')?580:500)) throw new Error('mac-street-power-cell-invalid: ' + name);
        if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('mac-street-power-cell-invalid: ' + name);
        for (const key of ['grip','muzzle']) if (cell[key] && (!Number.isFinite(cell[key].x) || !Number.isFinite(cell[key].y) || cell[key].x < 0 || cell[key].y < 0 || cell[key].x > source.width || cell[key].y > source.height)) throw new Error('mac-street-power-'+key+'-invalid: ' + name);
        if (WEAPON_KINDS.some(kind=>name==='weapon_'+kind) && !cell.grip) throw new Error('mac-street-power-grip-invalid: ' + name);
        if (cell.itemFrontRegions) {
          const regions=cell.itemFrontRegions;
          if (!Array.isArray(regions) || !regions.length || regions.length>16 || regions.some(polygon=>!Array.isArray(polygon) || polygon.length<3 || polygon.length>32 || polygon.some(point=>!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x<0 || point.y<0 || point.x>source.width || point.y>source.height) || Math.abs(polygon.reduce((area,point,index)=>{const next=polygon[(index+1)%polygon.length];return area+point.x*next.y-next.x*point.y;},0))<.001)) throw new Error('mac-street-power-item-region-invalid: ' + name);
        }
        for (const otherName of names.slice(0, names.indexOf(name))) {
          const other = manifest.cells[otherName]; if (other.sheet !== cell.sheet) continue;
          const a = source, b = other.source;
          if (a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y) throw new Error('mac-street-power-overlapping-cells');
        }
      }
      return { manifest, sheets, cells: manifest.cells };
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
    createCombat() {
      const seed = new Uint32Array(1);
      if (window.crypto?.getRandomValues) window.crypto.getRandomValues(seed);
      else seed[0] = Date.now() >>> 0;
      return B.MacStreetCombat.create({lootSeed:seed[0]});
    },
    async enter() {
      if (!B.MacStreetCombat || !B.MacStreetStory || !B.MacCombatFrames || !this.assets.size || this.frameArt.size !== 8) throw new Error('mac-preview-not-ready');
      const generation = this.generation;
      this.combat = this.createCombat();
      this.presentationState = this.combat.getSnapshot();
      this.story = B.MacStreetStory.createIntro({instantText:true});
      this.phase = 'intro'; this.status = 'playing'; this.active = true; this.cameraX = 0;
      this.focus = 0; this.elapsedMs = 0; this.lastEvents = []; this.audioNotice = null;
      this.playerDefeatedAtMs = null; this.playerDefeatedHostAtMs = null;
      this.playerLandedAtMs = null;
      this.guardBlockedAtMs = null;
      this.floorMarks = []; this.radio = null; this.radioQueue = []; this.damageAtMs = null;
      this.gameplayCueSeen = [];
      this.resetTutorial(); this.makeTutorialReadout();
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
    releaseInputs(reason = 'input-reset') { if (this.active) this.combat?.releaseInputs?.(reason); },
    resetInputs() { this.releaseInputs(); window.inputManager?.resetActionEdges?.(); B.TouchControls?.sync?.(); },
    dispose() {
      this.generation++; this.active = false; this.pending = false;
      if (this.previousKeyboard && window.inputManager?.actionInput) window.inputManager.actionInput.keyboardBindings = this.previousKeyboard;
      this.previousKeyboard = null; this.combat = null; this.story = null; this.phase = null; this.status = null;
      this.assets.clear(); this.frameArt.clear(); this.frameManifest = null; this.cityArt = null; this.zonePromises?.clear(); this.lastEvents = [];
      this.powerArt = null; this.floorMarks = []; this.radio = null; this.radioQueue = []; this.tutorial = null; this.damageAtMs = null;
      this.gameplayCueSeen = [];
      this.presentationState = null;
      this.playerDefeatedAtMs = null; this.playerDefeatedHostAtMs = null;
      this.playerLandedAtMs = null;
      this.guardBlockedAtMs = null;
      this.dialogueReadout?.remove(); this.dialogueReadout = null; this.resetInputs();
      this.tutorialReadout?.remove(); this.tutorialReadout = null;
    },
    exit() { return B.RuntimeLifecycle?.returnToTitle?.({ source: 'mac-preview-title' }); },
    retry() {
      if (!this.active) return false;
      if (this.status === 'clear') { this.combat = this.createCombat(); this.resetTutorial(); this.gameplayCueSeen = []; } else this.combat.retry();
      this.phase = 'street'; this.status = 'playing'; this.story = null;
      this.playerDefeatedAtMs = null; this.playerDefeatedHostAtMs = null;
      this.playerLandedAtMs = null;
      this.guardBlockedAtMs = null;
      this.floorMarks = []; this.radio = null; this.radioQueue = []; this.damageAtMs = null;
      const state = this.combat.getSnapshot(); this.presentationState = state; this.cameraX = state.zone?.startX || 0;
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
      if (this.phase === 'street' && this.status === 'playing' && key === 't') { event.preventDefault(); if (!event.repeat) this.skipTutorial(); return true; }
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
      if (B.GamepadUI?.connected && actions.road_b?.pressed) this.skipTutorial();
      if (actions.inspect?.pressed && this.combat.getControlState().interactAvailable) { this.combat.interact(); return; }
      if (state.desk.unlocked && Math.abs(state.player.x - state.desk.x) < 190 && actions.inspect?.pressed) {
        this.phase = 'desk'; this.story = B.MacStreetStory.createDesk({instantText:true}); this.focus = 0; this.resetInputs(); return;
      }
      this.combat.handleInput({
        move_x: Number(!!actions.move_right?.held) - Number(!!actions.move_left?.held),
        move_y: Number(!!actions.move_down?.held) - Number(!!actions.move_up?.held),
        jump: actions.jump, strike: actions.road_attack, guard: actions.road_defend, throw: actions.road_disrupt, run: actions.run
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
      this.presentationState = s;
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
        if (event.type === 'block' || event.type === 'barrier-block') this.guardBlockedAtMs = event.atMs;
        if (event.type === 'player-hit') this.damageAtMs = s.elapsedMs;
        this.trackTutorial(event);
        if (['enemy-hit','player-hit','body-land'].includes(event.type)) this.addFloorMark(event, s);

      }
      // Story cues use earned receipts and chapter-local memory. They never
      // stop a fight or take over an action, clock, save or dialogue choice.
      const zoneId = s.zone.id;
      this.radioQueue = (this.radioQueue || []).filter(cue => !cue.zoneId || cue.zoneId === zoneId);
      if (this.radio?.zoneId && this.radio.zoneId !== zoneId) this.radio = null;
      const storyCues = B.MacStreetStory.gameplayCues(this.lastEvents, s, this.gameplayCueSeen);
      for (const cue of storyCues.cues) {
        if (this.queueRadio(cue.speaker, cue.text, cue) && !this.gameplayCueSeen.includes(cue.id)) this.gameplayCueSeen.push(cue.id);
      }
      for (const event of this.lastEvents) {
        const heavy = event.heavy || /counter|finisher|throw|body-impact/.test(event.cause || '');
        const cue = event.type === 'enemy-hit' ? event.shielded ? 'metal' : heavy ? 'stomp' : 'hit' : COMBAT_CUES[event.type];
        if (cue) window.audioSystem?.playCombatCue?.(cue, { material: event.shielded ? 'firewall' : undefined });
      }
      this.floorMarks = (this.floorMarks || []).filter(mark => s.elapsedMs - mark.atMs < 14000 && Math.abs(mark.x - s.player.x) < 2300);
      this.updateTutorial(s);
      if (this.radio && s.elapsedMs >= this.radio.untilMs) this.radio = null;
      if (!this.radio && this.radioQueue?.length) this.radio = { ...this.radioQueue.shift(), untilMs: s.elapsedMs + 3300 };
      if (s.status === 'defeated') { this.status = 'failed'; this.resetInputs(); }
    },
    getSnapshot() { return { active: this.active, phase: this.phase, status: this.status, cameraX: this.cameraX, combat: this.combat?.getSnapshot?.(), story: this.story?.snapshot?.(), tutorial: this.tutorial ? { index: this.tutorial.index, completed: this.tutorial.completed, skipped: this.tutorial.skipped, progress: {...this.tutorial.progress} } : null, floorMarks: this.floorMarks?.length || 0, radio: this.radio?.speaker || null, gameplayCueIds: [...this.gameplayCueSeen || []], ownsLoop: false, persistentWrites: 0 }; },
    draw(ctx) {
      if (!ctx || !this.active) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, 1920, 1080); ctx.fillStyle = '#08111a'; ctx.fillRect(0, 0, 1920, 1080);
      if (this.dialogue()) this.drawDialogue(ctx); else this.drawStreet(ctx);
      this.syncDialogueReadout();
      ctx.restore();
    },
    resetTutorial() { this.tutorial = { index: 0, progress: Object.fromEntries(LESSONS.map(lesson => [lesson.id, 0])), completed: false, skipped: false, advanceAtMs: null }; },
    skipTutorial() { if (!this.active || this.phase !== 'street' || window.isPaused || this.status !== 'playing') return false; this.tutorial.skipped = true; this.syncTutorialReadout(); return true; },
    controlPrompts() {
      if (B.TouchControls?.enabled) return {move:'Drag the joystick',run:'Push the joystick to its outer edge to run',strike:'Strike',jump:'Jump',guard:'Guard',throw:'the context button',inspect:'Link'};
      if (B.GamepadUI?.connected) { const prompt = (action, fallback) => B.ControllerSettings?.prompt?.(action) || fallback;
        return {move:'Move with the left stick',run:'Flick left or right twice to run',strike:prompt('road_attack','RB'),jump:prompt('jump','A'),guard:prompt('road_defend','RT'),throw:prompt('road_disrupt','LT'),inspect:prompt('inspect','Y')}; }
      return {move:'Move with WASD or the arrow keys',run:'Double-tap left or right to run',strike:'J',jump:'Space',guard:'K',throw:'L',inspect:'E'};
    },
    trackTutorial(event) {
      const t = this.tutorial; if (!t || t.skipped || t.completed) return;
      const add = (id, count=1) => { t.progress[id] = Math.min(LESSONS.find(lesson => lesson.id === id).target, t.progress[id] + count); };
      if (event.type === 'player-move') add('move');
      if (event.type === 'run-start') add('run');
      if (event.type === 'strike') { if (['jab','cross','finisher'].includes(event.kind)) t.progress.strike = Math.max(t.progress.strike,event.kind === 'finisher' ? 3 : event.kind === 'cross' ? 2 : 1); if (event.kind === 'air-kick') add('air'); if (event.kind === 'running-kick') add('running-kick'); }
      if (event.type === 'parry' || event.type === 'block') add('guard');
      if (event.type === 'weapon-equipped') add('weapon');
      if (event.type === 'grab-start' || event.type === 'prop-pickup') add('grab');
      if (event.type === 'pummel') add('pummel');
      if (event.type === 'throw-release' || event.type === 'prop-throw') add('throw');
      if (event.type === 'prop-break') add('scenery');
      if (event.type === 'powerup') add('powerup');
      if (event.type === 'relay-restored') add('relay');
    },
    updateTutorial(state) {
      const t = this.tutorial; if (!t || t.skipped || t.completed) return;
      const lesson = LESSONS[t.index];
      if (t.progress[lesson.id] >= lesson.target) {
        if (t.advanceAtMs === null) t.advanceAtMs = state.elapsedMs + 700;
        if (state.elapsedMs >= t.advanceAtMs) { t.index++; t.advanceAtMs = null; if (t.index === LESSONS.length) t.completed = true; }
      }
    },
    makeTutorialReadout() {
      if (this.tutorialReadout || !document.body) return;
      const box = document.createElement('section'); box.className = 'mac-street-coach'; box.setAttribute('aria-label', 'Street tutorial'); box.hidden = true;
      Object.assign(box.style, {position:'fixed',left:'50%',transform:'translateX(-50%)',width:'min(460px, calc(100vw - 28px))',boxSizing:'border-box',padding:'10px 12px',border:'1px solid #82d7c888',borderLeft:'3px solid #82d7c8',borderRadius:'10px',background:'#0b1725ee',color:'#f5eee3',font:'14px/1.35 system-ui, sans-serif',zIndex:'100008',pointerEvents:'none',gap:'10px',alignItems:'center',display:'none'});
      const copy = document.createElement('div'); this.tutorialHeading = document.createElement('strong'); this.tutorialText = document.createElement('p');
      Object.assign(this.tutorialHeading.style,{display:'block',fontSize:'11px',letterSpacing:'.06em',color:'#82d7c8'}); Object.assign(this.tutorialText.style,{margin:'4px 0 0',whiteSpace:'pre-line'});
      copy.append(this.tutorialHeading,this.tutorialText); box.append(copy);
      const skip = document.createElement('button'); skip.type = 'button'; skip.textContent = 'Skip'; skip.setAttribute('aria-label','Skip street tutorial');
      Object.assign(skip.style,{minWidth:'48px',minHeight:'44px',padding:'8px',border:'1px solid #82d7c877',borderRadius:'8px',background:'#1b2d40',color:'#f5eee3',font:'bold 12px system-ui, sans-serif',pointerEvents:'auto',flexShrink:'0',touchAction:'manipulation'});
      skip.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.skipTutorial();}); box.append(skip); document.body.append(box); this.tutorialReadout = box; this.tutorialSkip = skip;
    },
    syncTutorialReadout() {
      const box = this.tutorialReadout, t = this.tutorial; if (!box) return;
      const state = this.presentationState, teaching = t && !t.skipped && !t.completed && !!state;
      const equipment = this.equipmentReadout(state?.player), holding = state?.player.grapple || state?.player.carry;
      const radio = B.TouchControls?.enabled && this.radio;
      const status = B.TouchControls?.enabled && equipment && (holding || !teaching);
      // Let the live boss warning and recovery clock stay readable. Lesson
      // progress still uses the same earned receipts; held-object status wins.
      const bossBeat = state?.boss?.hp > 0 && ['warning','committed','punish'].includes(state.boss.window);
      const visible = this.active && this.phase === 'street' && this.status === 'playing' && !window.isPaused && (teaching || radio || status) && !(teaching && !holding && bossBeat);
      box.hidden = !visible; box.style.display = visible ? 'flex' : 'none'; if (!visible) return;
      const lesson = teaching ? LESSONS[t.index] : null, heading = status ? equipment.heading : radio ? `${radio.speaker} · LOCAL SIGNAL` : `${t.index + 1} / ${LESSONS.length} · ${lesson.title}`;
      const text = status ? equipment.text + (radio && !holding ? `\n${radio.speaker}: ${radio.text}` : '') : radio ? radio.text : t.advanceAtMs !== null ? 'Got it. Keep moving.' : lesson.text(this.controlPrompts());
      this.tutorialSkip.hidden = !teaching || !!radio;
      const skipLabel = B.GamepadUI?.connected ? `Skip / ${B.ControllerSettings?.prompt?.('road_b') || 'B'}` : 'Skip';
      if (this.tutorialSkip.textContent !== skipLabel) this.tutorialSkip.textContent = skipLabel;
      if (this.tutorialHeading.textContent !== heading) this.tutorialHeading.textContent = heading;
      if (this.tutorialText.textContent !== text) this.tutorialText.textContent = text;
      box.style.top = B.TouchControls?.enabled ? 'calc(env(safe-area-inset-top, 0px) + 56px)' : 'calc(env(safe-area-inset-top, 0px) + 118px)';
    },
    equipmentReadout(player) {
      if (!player) return null;
      const prompts = this.controlPrompts(), grip = player.grapple || player.carry;
      if (grip) {
        const text = grip.released ? 'Throw committed.' : player.grapple ? `${Math.max(0,grip.remainingMs/1000).toFixed(1)}s hold · ${prompts.strike}: Pummel ${Math.max(0,grip.pummelRemainingMs/1000).toFixed(1)}s · release ${prompts.throw} to throw` : `Keep holding ${prompts.throw}; release to throw. A hit makes you drop it.`;
        return {heading:player.grapple ? 'ENEMY HOLD' : 'PROP LIFT',text:text+(player.weapon ? ` · ${player.weapon.name} ${player.weapon.charges}/${player.weapon.maxCharges} stowed` : '')};
      }
      const buffs = player.powerups || {}, powers = [];
      if (buffs.overdriveMs > 0) powers.push(`Overdrive ${(buffs.overdriveMs/1000).toFixed(1)}s`);
      if (buffs.barrierMs > 0) powers.push(`Barrier ${buffs.barrierCharges} hits / ${(buffs.barrierMs/1000).toFixed(1)}s`);
      if (buffs.impactMs > 0) powers.push(`Impact 1 hit / ${(buffs.impactMs/1000).toFixed(1)}s`);
      if (player.weapon) powers.unshift(`${player.weapon.name} ${player.weapon.charges}/${player.weapon.maxCharges}`);
      return powers.length ? {heading:'STREET KIT',text:powers.join(' · ')} : null;
    },
    queueRadio(speaker, text, metadata = {}) {
      this.radioQueue ||= [];
      if (metadata.id && (this.radio?.id === metadata.id || this.radioQueue.some(cue => cue.id === metadata.id))) return true;
      const cue = {speaker, text, id: metadata.id, zoneId: metadata.zoneId, priority: metadata.priority || 0};
      if (this.radioQueue.length >= 3) {
        const last = this.radioQueue.length - 1;
        if (this.radioQueue[last].priority >= cue.priority) return false;
        this.radioQueue.pop();
      }
      this.radioQueue.push(cue);
      this.radioQueue.sort((a, b) => b.priority - a.priority);
      return true;
    },
    kitSummary(player) {
      const grip = player.grapple || player.carry;
      if (grip) return grip.released ? 'THROW COMMITTED' : player.grapple
        ? `HOLD ${(grip.remainingMs / 1000).toFixed(1)}s · PUMMEL ${(grip.pummelRemainingMs / 1000).toFixed(1)}s`
        : 'PROP HELD · RELEASE TO THROW';
      const kit = [], buffs = player.powerups || {};
      if (player.weapon) kit.push(`${player.weapon.name} ${player.weapon.charges}/${player.weapon.maxCharges}`);
      if (buffs.overdriveMs > 0) kit.push(`OVR ${Math.ceil(buffs.overdriveMs / 1000)}s`);
      if (buffs.barrierMs > 0) kit.push(`BARRIER ${buffs.barrierCharges}`);
      if (buffs.impactMs > 0) kit.push('IMPACT');
      return kit.join(' · ');
    },
    addFloorMark(event, state) {
      if (event.shielded) return;
      const actor = event.type === 'player-hit' ? state.player : state.enemies.find(enemy => enemy.id === event.id);
      const color = event.type === 'player-hit' ? 'red' : event.bloodColor || actor?.bloodColor;
      const x = event.x ?? actor?.x, laneY = event.laneY ?? actor?.laneY;
      if (!['red','green','purple'].includes(color) || !Number.isFinite(x) || !Number.isFinite(laneY)) return;
      this.floorMarks ||= []; this.floorMarks.push({x,laneY,color,atMs:state.elapsedMs,heavy:!!event.heavy || event.type === 'body-land'});
      if (this.floorMarks.length > 32) this.floorMarks.shift();
    },
    drawPowerCell(ctx, name, x, y, size=1, alpha=1, facing=1, attachment=null) {
      const cell = this.powerArt?.cells[name], sheet = this.powerArt?.sheets.get(cell?.sheet);
      if (!cell || !sheet) throw new Error('mac-street-power-cell-unavailable: ' + name);
      const scale = cell.displayHeight / cell.source.height * size, crop = cell.source;
      const pivot = attachment?.grip && cell.grip ? cell.grip : cell.pivot;
      ctx.save(); ctx.globalAlpha = clamp(alpha,0,1); ctx.translate(x,y); ctx.scale(facing<0?-1:1,1);
      if (attachment?.angle) ctx.rotate(attachment.angle);
      if (attachment?.regions?.length) {
        ctx.beginPath();
        for (const polygon of attachment.regions) {
          polygon.forEach((point,index)=>(index ? ctx.lineTo : ctx.moveTo).call(ctx,(point.x-pivot.x)*scale,(point.y-pivot.y)*scale));
          ctx.closePath();
        }
        ctx.clip();
      }
      ctx.drawImage(sheet.image,crop.x,crop.y,crop.width,crop.height,-pivot.x*scale,-pivot.y*scale,crop.width*scale,crop.height*scale); ctx.restore();
    },
    drawMacPose(ctx, art, pose, {x,feet,height=260,facing=1,alpha=1,weapon=null,carried=null}) {
      const frame=pose.frame,bodyScale=height/pose.standingHeight,direction=facing<0?-1:1;
      const item=carried ? this.propCell(carried) : weapon && !pose.weaponStowed && frame.embeddedWeapon!==weapon.kind ? `weapon_${weapon.kind}` : null;
      const grip=pose.gripAnchor;
      if (item && !grip) throw new Error('mac-native-held-item-anchor-unavailable: ' + frame.id);
      const handX=item ? x+direction*(grip.x-frame.feetPivot.x)*bodyScale : x;
      const handY=item ? feet-frame.baselineLift*height/260+(grip.y-frame.feetPivot.y)*bodyScale : feet;
      const drawItem=regions=>this.drawPowerCell(ctx,item,handX,handY,carried?1:pose.itemScale??1,alpha,direction,{grip:true,angle:pose.weaponAngle,regions});
      if (item && pose.itemLayer==='behind') drawItem();
      B.MacCombatFrames.draw(ctx,art,pose,x,feet,height,direction,alpha);
      if (item) {
        if (pose.itemLayer!=='behind') drawItem();
        else if ((pose.itemFrontRegions || this.powerArt.cells[item].itemFrontRegions)?.length) drawItem(pose.itemFrontRegions || this.powerArt.cells[item].itemFrontRegions);
        if (pose.handOcclusion?.length) {
          // Redraw the original complete cel through its registered palm mask.
          // Every crop, pixel scale and actor transform remains identical.
          ctx.save();ctx.beginPath();
          for (const polygon of pose.handOcclusion) {
            polygon.forEach((point,index)=>(index ? ctx.lineTo : ctx.moveTo).call(ctx,x+direction*(point.x-frame.feetPivot.x)*bodyScale,feet-frame.baselineLift*height/260+(point.y-frame.feetPivot.y)*bodyScale));
            ctx.closePath();
          }
          ctx.clip();B.MacCombatFrames.draw(ctx,art,pose,x,feet,height,direction,alpha);ctx.restore();
        }
      }
      return {handX,handY,item,pose};
    },
    propCell(prop) {
      const kind = prop.kind === 'car' && prop.variant === 'van' && this.powerArt.cells.car_van_intact ? 'car_van' : ['streetlight','terminal'].includes(prop.kind) ? `fixture_${prop.kind}` : prop.kind;
      return `${kind}_${prop.broken ? 'broken' : prop.hp < prop.maxHp*.55 ? 'cracked' : 'intact'}`;
    },
    propVisibilityAlpha(prop, player, macDepth) {
      if (prop.broken || prop.launched || prop.laneY <= macDepth) return 1;
      const cell = this.powerArt.cells[this.propCell(prop)], scale = cell.displayHeight / cell.source.height;
      const recoil = prop.recoil, angle = recoil?.rotation || 0, cos = Math.cos(angle), sin = Math.sin(angle);
      const facing = prop.facing || Math.sign(prop.knockbackVx) || 1;
      const cx = (cell.source.width * .5 - cell.pivot.x) * scale;
      const cy = (cell.source.height * .5 - cell.pivot.y) * scale;
      const centerX = prop.x + (recoil?.x || 0) + (facing < 0 ? -1 : 1) * (cx * cos - cy * sin);
      const centerY = prop.laneY - (prop.elevation || 0) - (recoil?.elevation || 0) + cx * sin + cy * cos;
      const halfWidth = (Math.abs(cos) * cell.source.width + Math.abs(sin) * cell.source.height) * scale * .5;
      const halfHeight = (Math.abs(sin) * cell.source.width + Math.abs(cos) * cell.source.height) * scale * .5;
      const feet = player.laneY - player.elevation;
      const overlapX = Math.min(centerX + halfWidth, player.x + 95) - Math.max(centerX - halfWidth, player.x - 95);
      const overlapY = Math.min(centerY + halfHeight, feet - 35) - Math.max(centerY - halfHeight, feet - 245);
      // Foreground scenery keeps its depth and collision. Ease its opacity at
      // the overlap edge so Mac's stance and hands stay readable behind it.
      const overlap = clamp(Math.min(overlapX / 55, overlapY / 55), 0, 1);
      return 1 - .72 * overlap * overlap * (3 - 2 * overlap);
    },
    drawProjectile(ctx, projectile, camera) {
      const x = projectile.x - camera;
      if (projectile.owner === 'player') {
        this.drawPowerCell(ctx,`projectile_${projectile.kind}`,x,projectile.laneY-(projectile.elevation || 0),1,1,Math.sign(projectile.vx) || projectile.facing);
        return;
      }
      const groundWave = projectile.kind === 'ground-wave';
      const height = groundWave ? 9 : /^bile/.test(projectile.kind) ? 190 : projectile.kind === 'fan' ? 245 : 110;
      ctx.fillStyle = projectile.color || '#b479ff'; ctx.beginPath(); ctx.ellipse(x,projectile.laneY-height,groundWave?24:11,groundWave?7:8,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#f3eed1';ctx.lineWidth=2;ctx.stroke();
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
      // The shared paused frame already synchronizes this readout owner.
      // Coach/radio DOM follows that same call, so it cannot cover Pause.
      this.syncTutorialReadout();
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
    fittedText(ctx, value, x, y, width, size = 22, color = '#f5eee3', align = 'left') {
      let label = String(value), fontSize = size;
      ctx.font = `bold ${fontSize}px sans-serif`;
      while (fontSize > 15 && ctx.measureText(label).width > width) ctx.font = `bold ${--fontSize}px sans-serif`;
      while (label.length > 1 && ctx.measureText(label).width > width) label = label.slice(0, -2) + '…';
      this.text(ctx, label, x, y, fontSize, color, align);
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
        if (s.choice.optional) this.text(ctx, B.GamepadUI?.connected ? `Left / Right: choose · ${B.ControllerSettings?.prompt?.('jump') || 'A'}: answer · ${B.ControllerSettings?.prompt?.('inspect') || 'RB'}: continue` : 'Space: continue · 1 / 2: answer', 1760, 1010, 18, '#eec871', 'right');
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
      if (tell.response) {
        const labelX = clamp(x, 135, 1287), labelY = aboveHead - 43;
        ctx.fillStyle = '#08121ee8'; ctx.fillRect(labelX - 135, labelY - 4, 270, 29);
        this.fittedText(ctx, tell.response.toUpperCase(), labelX, labelY, 258, 18, '#ffe2b8', 'center');
      }
      ctx.restore();
    },
    drawCombatFx(ctx, fx, camera) {
      const age = fx.ageMs || 0, life = fx.lifeMs || 300, progress = clamp(age / life, 0, 1);
      const color = /^#[0-9a-f]{6}$/i.test(fx.bloodHex || '') ? fx.bloodHex : null;
      const x = fx.x - camera, y = (fx.laneY ?? fx.y) - (fx.elevation ?? 130);
      ctx.save(); ctx.globalAlpha = 1 - progress;
      if (fx.discharge) {
        // A finite receipt marks the one enemy-only interruption, not a new
        // damage field or continuing particle simulation.
        ctx.strokeStyle = '#82e9df'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, fx.laneY, (fx.radius || 235) * (.3 + .7 * progress),
          (fx.laneReach || 95) * (.3 + .7 * progress), 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (color && fx.particles?.length) {
        const blood = ['red','green','purple'].includes(fx.bloodColor) ? fx.bloodColor : color === '#e86576' ? 'red' : 'purple';
        if (age < 230) this.drawPowerCell(ctx, `blood_${blood}_${fx.heavy ? 'heavy' : 'impact'}`, x, y, 1 + Math.min(.15, progress), (1 - age / 230) * .95, fx.direction || 1);
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
      const impact = s.impact || {}, shake = !B.Preferences?.values?.reducedMotion && impact.remainingMs > 0 ? Math.min(5,(impact.strength || 0)*5) : 0;
      ctx.save(); ctx.translate(shake*Math.sin(this.elapsedMs*.13), -350 + shake*Math.cos(this.elapsedMs*.11)); ctx.scale(1.35, 1.35);
      this.drawCityBackdrop(ctx, this.assets.get(background?.background), zone, camera);
      for (const mark of this.floorMarks || []) {
        const age = s.elapsedMs - mark.atMs;
        this.drawPowerCell(ctx, `blood_${mark.color}_floor`, mark.x-camera, mark.laneY+5, mark.heavy ? 1.1 : .75, .78 * Math.min(1,(14000-age)/1800));
      }
      // Floor marks and telegraphs convey the lane and committed strike, not damage on touch.
      ctx.strokeStyle = '#eec87145'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 984); ctx.lineTo(1920, 984); ctx.stroke();
      // Keep Mac readable when fighting on the same narrow ground plane.
      // Only painter order changes; sprite feet and collision lanes stay exact.
      const macDepth = s.enemies.reduce((depth, enemy) => enemy.hp > 0 && Math.abs(enemy.x - s.player.x) < 160 && Math.abs(enemy.laneY - s.player.laneY) <= 32 ? Math.max(depth, enemy.laneY + .1) : depth, s.player.laneY);
      const actors = [{ type: 'mac', value: s.player }, ...s.enemies.filter(e => (e.hp > 0 || e.launched || e.knockdownMs > 0 || e.phase === 'defeated' && e.animation.ageMs < 600) && e.x - camera > -220 && e.x - camera < 1920 / 1.35 + 220).map(value => ({ type: 'enemy', value })),
        ...(s.props || []).filter(prop=>prop.kind !== 'relay' && prop.heldBy !== 'mac').map(value=>({type:'prop',value})),
        ...(s.pickups || []).map(value=>({type:'pickup',value})), ...(s.projectiles || []).map(value=>({type:'projectile',value})),
        ...(s.relay?.x && zone.index === 2 ? [{type:'relay',value:s.relay}] : [])]
        .sort((a,b)=>(a.type === 'mac' ? macDepth : a.value.laneY)-(b.type === 'mac' ? macDepth : b.value.laneY) || Number(!['prop','relay','pickup'].includes(a.type))-Number(!['prop','relay','pickup'].includes(b.type)));
      for (const actor of actors) {
        const p = actor.value, x = p.x - camera;
        if (actor.type === 'prop') {
          const recoil=p.recoil;
          this.drawPowerCell(ctx,this.propCell(p),x+(recoil?.x || 0),p.laneY-(p.elevation || 0)-(recoil?.elevation || 0),1,this.propVisibilityAlpha(p,s.player,macDepth),p.facing || Math.sign(p.knockbackVx) || 1,{angle:recoil?.rotation || 0});continue;
        }
        if (actor.type === 'relay') { this.drawPowerCell(ctx,p.restored?'relay_on':'relay_off',x,p.laneY); continue; }
        if (actor.type === 'projectile') { this.drawProjectile(ctx,p,camera); continue; }
        if (actor.type === 'pickup') {
          const name = p.kind === 'weapon' ? `weapon_${p.weaponKind}` : `pickup_${p.kind}`;
          ctx.fillStyle='#82d7c82b';ctx.beginPath();ctx.ellipse(x,p.laneY,25,7,0,0,Math.PI*2);ctx.fill();
          this.drawPowerCell(ctx,name,x,p.laneY-7-Math.sin(s.elapsedMs*.004)*3);continue;
        }
        ctx.fillStyle = '#02091170'; ctx.beginPath(); ctx.ellipse(x, p.laneY + 2, actor.type === 'mac' ? 43 : 51, 12, 0, 0, Math.PI * 2); ctx.fill();
        if (actor.type === 'mac') {
          const art = this.frameArt.get('mac');
          if (!art) throw new Error('mac-frame-actor-unavailable: mac');
          const stateAgeMs = this.playerDefeatedAtMs === null ? undefined : Math.max(0, s.elapsedMs - this.playerDefeatedAtMs + this.elapsedMs - this.playerDefeatedHostAtMs);
          const landingAgeMs = this.playerLandedAtMs === null ? undefined : Math.max(0, s.elapsedMs - this.playerLandedAtMs);
          const guardImpactAgeMs = this.guardBlockedAtMs === null ? undefined : Math.max(0,s.elapsedMs-this.guardBlockedAtMs);
          const pose = B.MacCombatFrames.sample(p, {player: true, compiled: art.compiled, supplemental:art.supplemental, stateAgeMs, landingAgeMs, guardImpactAgeMs, reducedMotion: !!B.Preferences?.values?.reducedMotion});
          // Gameplay freezes its jump height at defeat. Lower the complete cel
          // using the existing result age, reaching the lane before down holds.
          const downStartsMs = art.compiled.clips.defeat.frames.at(-1).startMs;
          const elevation = pose.action === 'defeat' ? p.elevation * (1 - clamp(pose.clipTimeMs / Math.max(1, downStartsMs), 0, 1)) : p.elevation;
          const carried = p.carry && (s.props || []).find(prop=>prop.id===p.carry.id && prop.heldBy==='mac');
          // The final charge is spent on contact, while the committed native
          // swing still owns its weapon through recovery. Inventory stays empty.
          const visibleWeapon = p.weapon || (p.attack?.weaponKind ? {kind:p.attack.weaponKind} : null);
          const heldWeapon = !p.grapple && !p.carry ? visibleWeapon : null;
          this.drawMacPose(ctx,art,pose,{x,feet:p.laneY-elevation,height:260,facing:p.facing,alpha:p.invulnerableMs>0?.86:1,weapon:heldWeapon,carried});
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
      for (const fx of s.hitFx) this.drawCombatFx(ctx, fx, camera);
      if (s.arena.active) { const x = s.arena.gateX - camera; ctx.strokeStyle = '#eac16b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, 780); ctx.lineTo(x, 984); ctx.stroke(); this.text(ctx, 'CLEAR THE STREET', x - 20, 739, 17, '#eac16b', 'right'); }
      ctx.restore();
      ctx.fillStyle = '#08121eee'; ctx.fillRect(0, 0, 1920, 105);
      this.text(ctx, 'MAC MODEM', 120, 24, 30, '#eec871');
      this.text(ctx, `${zone.index} / 6  ·  ${zone.title.toUpperCase()}`, 120, 66, 18, '#82cfc2');
      const healthPips = Math.ceil(10 * s.player.hp / s.player.maxHp);
      for (let i = 0; i < 10; i++) { ctx.fillStyle = i < healthPips ? '#dc7c86' : '#394350'; ctx.fillRect(440 + i * 26, 34, 19, 15); }
      if (window.BARCODE_RENDER_QUALITY?.flashes !== false && this.damageAtMs !== null && s.elapsedMs - this.damageAtMs < 180) { ctx.fillStyle='#e8657660'; ctx.fillRect(425,25,285,38); }
      const equipment = this.kitSummary(s.player);
      if (equipment && !B.TouchControls?.enabled) this.fittedText(ctx, equipment, 565, 67, 380, 17, '#82cfc2');
      const objective = s.relay?.available && !s.relay.restored && zone.index === 2 ? 'Restore the market relay >' : s.desk.unlocked ? 'Enter Kave’s studio >' : zone.cleared ? `${zone.exitLabel || 'Continue through the city'} >` : s.wave?.state === 'advance' ? 'Move deeper into the district >' : `Clear the area · ${s.wave?.number || 1} / 2`;
      const encounter = zone.encounter;
      const fightTitle = !zone.cleared && s.wave?.state !== 'advance' && !s.desk.unlocked && encounter
        ? `${encounter.name} · ${s.wave?.number || 1} / 2` : objective;
      this.fittedText(ctx, fightTitle, 1740, 30, 900, 24, '#eee2c9', 'right');
      const fightHint = s.wave?.state === 'advance' ? 'Keep moving: the next fight is farther along this street.'
        : !zone.cleared && encounter ? encounter.objective : '';
      if (fightHint) this.fittedText(ctx, fightHint, 1740, 67, 775, 18, '#cbd7d5', 'right');
      const boss = s.enemies.find(enemy => enemy.kind === 'null_regent' && enemy.hp > 0);
      if (boss) {
        ctx.fillStyle = '#101a29'; ctx.fillRect(625, 123, 670, 40); ctx.fillStyle = '#b479ff'; ctx.fillRect(630, 145, 660 * boss.hp / boss.maxHp, 12);
        this.text(ctx, `NULL REGENT · ${boss.bossPhase || 1} / 3 · ${s.boss?.phaseName || 'PLAZA ENFORCER'}`, 960, 125, 15, '#f5eee3', 'center');
        if (s.boss?.window === 'punish' && s.boss.punishRemainingMs > 0) {
          ctx.fillStyle = '#092a27ec'; ctx.fillRect(745, 171, 430, 34);
          this.text(ctx, `EXPOSED · ${(s.boss.punishRemainingMs / 1000).toFixed(1)}s · HIT HIM`, 960, 177, 18, '#9dffe2', 'center');
        }
      }
      if (!this.assets.has(background?.background) && this.status === 'playing') {
        ctx.fillStyle = '#101e2df5'; ctx.fillRect(690, 430, 540, 90); this.text(ctx, `Entering ${zone.title}…`, 960, 457, 25, '#eec871', 'center');
      }
      if (!B.TouchControls?.enabled) { const prompt=this.controlPrompts(); this.text(ctx, `${B.GamepadUI?.connected?'Left stick':'WASD / arrows'}: move · double-tap: run · ${prompt.jump}: jump · ${prompt.strike}: strike / Run Kick · ${prompt.guard}: guard · hold / release ${prompt.throw}: grab / throw · ${prompt.inspect}: link · ${B.GamepadUI?.connected?'Start':'P'}: pause`, 960, 1045, 20, '#eec871', 'center'); }
      if (s.relay?.available && !s.relay.restored && this.getControlState().interactAvailable) {
        ctx.fillStyle='#101e2deb';ctx.fillRect(710,245,500,68); this.text(ctx,B.TouchControls?.enabled?'Tap Link to restore the relay':`${this.controlPrompts().inspect}: restore the relay`,960,264,23,'#83dfce','center');
      }
      if (this.radio && !B.TouchControls?.enabled) {
        ctx.fillStyle='#101e2dea';ctx.fillRect(1250,150,530,118);this.text(ctx,`${this.radio.speaker} · LOCAL SIGNAL`,1270,165,17,'#82d7c8');
        ctx.fillStyle='#eee2c9';ctx.font='bold 20px sans-serif';ctx.textAlign='left';ctx.textBaseline='top';this.wrap(ctx,this.radio.text,1270,197,485,27);
      }
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
