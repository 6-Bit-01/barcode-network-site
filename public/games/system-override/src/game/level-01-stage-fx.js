// Level 1 scenery and optional inspections. Updated by the existing frame owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/level-01-stage-fx.js', exports: ['BARCODE.Level01StageFX'], dependencies: ['BARCODE.LoreCollection', 'BARCODE.CombatFX'] });
(function() {
  const B = window.BARCODE = window.BARCODE || {}, TAU = Math.PI * 2;
  const DETAILS = Object.freeze([
    { id: 'egg.l01.studio-rat', x: 1680, y: 330, name: 'STUDIO RAT', speaker: 'CACHE BACK',
      lines: ['That cat is looking at whoever is holding the controls.', 'Keep moving. It has its own exit.'] },
    { id: 'egg.l01.cliff-maintenance', x: 2300, y: 856, name: 'MAINTENANCE PLATE', speaker: 'CLIFF',
      lines: ['Two clean beats. That is all the lift needs.', 'I fixed the wiring. You still have to do the climbing.'] },
    { id: 'egg.l01.witty-route', x: 2475, y: 358, name: 'ROUTE MARK', speaker: 'WittyF0x',
      lines: ['See that glow above the relay roof? Signal Amp.', 'The high route has its own rewards. Look before you drop.'] },
    { id: 'egg.l01.venue-flyer', x: 1840, y: 822, name: 'VENUE FLYER', speaker: 'DJ FLOPPYDISC',
      lines: ['BARCODE. Doors open when the signal comes back.', 'Keep the flyer. A room can go quiet without being finished.'] }
  ]);
  // Pick once per fresh level run. These are supported, reachable perches,
  // away from the lift shaft and traversal steps; saved discovery is separate.
  const RAT_SPOTS = Object.freeze([
    { x: 900, y: 492, surfaceId: 'signal-awning' },
    { x: 1680, y: 330, surfaceId: 'cache-awning' },
    { x: 2140, y: 358, surfaceId: 'firewall-canopy' },
    { x: 2920, y: 196, surfaceId: 'relay-rooftop' },
    { x: 3680, y: 275, surfaceId: 'tower-rooftop' },
    { x: 3990, y: 502, surfaceId: 'broadcast-awning' }
  ]);
  const COLORS = ['#8cffe0', '#c1b0ff', '#ffc07b', '#ff99e7'];
  class Level01StageFX {
    constructor() { this.reset(window.sector1Progression || null); }
    reset(owner = null, { resume = false } = {}) {
      if (!resume || owner !== this.owner || !this.ratSpot) {
        this.ratSpot = RAT_SPOTS[Math.floor(Math.random() * RAT_SPOTS.length)];
        this.details = [{ ...DETAILS[0], ...this.ratSpot }, ...DETAILS.slice(1)];
        this.ratRunConsumed = false;
      }
      this._overlayPanels = {};
      this.owner = owner; this.timeMs = 0; this.reactions = []; this.events = [];
      this.seenEntrances = new WeakSet(); this.arrived = new WeakSet(); this.clears = new Set();
      this.activeEncounter = null; this.message = null; this.nearby = null; this.captionKick = 0;
      this.ratAge = null; this.ratEvent = null; this.lastBossState = ''; this.lastStepX = null;
      if (resume) {
        owner?.getDistrictSignalState?.().zones.forEach(z => { if (z.cleared) this.clears.add(z.id); });
        this.activeEncounter = owner?.activeEncounterId || null;
        this.lastBossState = owner?.state || '';
        for (const e of window.enemyManager?.enemies || []) { this.seenEntrances.add(e); if (e.entranceComplete) this.arrived.add(e); }
      }
    }
    archive() { return window.lostDataSystem?.archive || this.fallbackArchive || null; }
    event(kind, x, options = {}) {
      if (!Number.isFinite(x)) return;
      if (this.events.length >= 16) this.events.shift();
      this.events.push({ kind, x, y: 822, age: 0, duration: 1100, seed: B.combatFX?.nextSeed?.() || 1, ...options });
    }
    react(x, strength = 1, kind = 'hit') {
      if (!Number.isFinite(x)) return;
      if (this.reactions.length >= 12) this.reactions.shift();
      this.reactions.push({ x, strength: Math.max(0, Math.min(1, strength)), age: 0 });
      if (kind === 'stomp') this.captionKick = 1;
    }
    energyAt(x) {
      return Math.min(1, this.reactions.reduce((sum, r) => sum + r.strength * Math.max(0, 1 - Math.abs(x - r.x) / 750) * Math.max(0, 1 - r.age / 1000), 0));
    }
    motionTimeMs() {
      const prefs = B.Preferences?.values || {};
      return prefs.reducedMotion || prefs.flashes === false || window.BARCODE_RENDER_QUALITY?.flashes === false ? 0 : this.timeMs;
    }
    getCatIdlePose() {
      const time = this.motionTimeMs(), phase = time % 4200;
      // Existing side/look/blink/paw drawings are deliberate held gestures,
      // not a walk cycle or random emotional changes. No hold exceeds 800 ms.
      const frame = phase < 550 ? 0 : phase < 1350 ? 1 : phase < 1490 ? 2 :
        phase < 2050 ? 1 : phase < 2750 ? 3 : phase < 3550 ? 1 : phase < 3970 ? 0 : 1;
      return { frame, breath: 1 + Math.sin(time / 530) * 0.035 };
    }
    canInspect({ rat = false } = {}) {
      const o = this.owner, gs = window.gameState;
      if (!o?.missionStarted || window.tutorialSystem?.isActive?.() || window.isPaused || gs?.paused || !gs?.running ||
        window.hackingSystem?.isActive?.() || o.isGameplaySuppressed?.() || !window.player?.grounded ||
        /complete/.test(o.state || '') || !rat && /jammer|boss/.test(o.state || '')) return false;
      return rat || !o.getEncounterStatus?.()?.started;
    }
    findNearby() {
      if (!this.canInspect({ rat: true })) return null;
      const p = window.player;
      const catId = DETAILS[0].id;
      return this.details.find(d => this.canInspect({ rat: d.id === catId }) &&
        (d.id !== catId || !this.ratRunConsumed && !this.ratEvent || this.message?.id === catId) &&
        Math.abs(d.x - p.position.x) < 95 && Math.abs(d.y - (p.position.y + 72)) < 70) || null;
    }
    inspect() {
      if (this.isDialogueDeferred() || this.message && !this.getMessageLayout().readable) return { ok: false, reason: 'presentation-busy' };
      if (this.message?.line === 0) { this.message.line = 1; this.message.age = 0; return { ok: true, reason: 'crew-response' }; }
      if (this.message) { this.message = null; return { ok: true, reason: 'closed' }; }
      const detail = this.findNearby();
      if (!detail) return { ok: false, reason: 'no-detail' };
      const cat = detail.id === DETAILS[0].id;
      const fresh = cat ? !this.ratRunConsumed : this.archive()?.collectEgg?.(detail.id) || false;
      this.message = { ...detail, line: 0, age: 0, duration: 7200 };
      if (cat && fresh && !this.ratEvent) this.startRatEvent(detail);
      window.audioSystem?.playCombatCue?.('inspect');
      return { ok: true, reason: fresh ? 'discovered' : 'revisit', id: detail.id };
    }
    isDialogueDeferred() {
      const hack = window.hackingSystem;
      return !!(this.ratEvent || window.tutorialSystem?.isActive?.() || hack?.isActive?.() || hack?.feedback || hack?.resultFx ||
        window.isPaused || window.gameState?.paused || window.gameState?.gameOver || window.gameState?.victory || this.owner?.isGameplaySuppressed?.());
    }
    getMessageLayout() {
      return B.OverlayLayout.present(this,'inspect',[{width:899,height:124}],{preferred:{x:30,y:887,width:899,height:124,scale:1}});
    }
    update(ms) {
      if (!Number.isFinite(ms) || ms < 0 || window.isPaused || window.gameState?.paused) return;
      const owner = window.sector1Progression;
      if (owner !== this.owner) this.reset(owner);
      if (!this.archive() && B.LoreCollection) this.fallbackArchive = new B.LoreCollection();
      this.timeMs += ms;
      this.reactions.forEach(r => r.age += ms); this.reactions = this.reactions.filter(r => r.age < 1000);
      this.events.forEach(e => e.age += ms); this.events = this.events.filter(e => e.age < e.duration);
      this.captionKick = Math.max(0, this.captionKick - ms / 1700);
      const ratWasPlaying = !!this.ratEvent;
      if (this.ratAge !== null) {
        this.ratAge += ms;
        if (this.ratAge < 1650 && this.ratEvent?.victim?.active) {
          this.ratEvent.targetX = this.ratEvent.victim.position.x;
          this.ratEvent.targetY = this.ratEvent.victim.position.y + 72;
        }
        if (this.ratAge >= 1650 && this.ratEvent && !this.ratEvent.grabbed) this.grabRatTarget();
        if (this.ratAge > 6200) { this.ratAge = null; this.ratEvent = null; }
      }
      // An unread inspection waits through the complete pounce/drag and hack
      // overlays. Its reading time begins only when the panel is visible.
      if (this.message && !ratWasPlaying && !this.isDialogueDeferred() && this.getMessageLayout().readable) {
        this.message.age += ms;
        if (this.message.age >= this.message.duration) this.message = null;
      }
      this.nearby = this.findNearby();
      if (!owner?.missionStarted) return;
      if (owner.activeEncounterId && owner.activeEncounterId !== this.activeEncounter) {
        this.activeEncounter = owner.activeEncounterId;
        this.event('encounter', window.player.position.x, { zone: Number(this.activeEncounter.slice(-1)) - 1, duration: 1600 });
      }
      const district = owner.getDistrictSignalState?.();
      district?.zones.forEach((zone, i) => {
        if (zone.cleared && !this.clears.has(zone.id)) {
          this.clears.add(zone.id); this.event('clear', window.player.position.x, { zone: i, duration: 1000 });
          window.audioSystem?.playCombatCue?.('restore');
        }
      });
      for (const e of window.enemyManager?.enemies || []) {
        if (!e.active || !e._sector1MissionEnemy) continue;
        if (!this.seenEntrances.has(e)) {
          this.seenEntrances.add(e);
          const zone = Number(e._sector1EncounterId?.slice(-1)) - 1;
          this.event('arrival', e._entranceTarget?.x ?? e.position.x, { zone, y: e._entranceTarget?.y ?? e.position.y, duration: 950 });
        }
        if (e.entranceComplete && !this.arrived.has(e)) {
          this.arrived.add(e);
          if (e.type === 'firewall') {
            B.combatFX?.contact('firewall', e.position.x, 812, e.facing, false, false);
            if (B.combatFX?.visible(e.position.x, 812)) window.renderer?.impact?.('land', { strength: 0.8 });
          }
        }
      }
      const boss = owner.boss;
      if (owner.state !== this.lastBossState) {
        if (owner.state === 'boss_flourish') { this.event('boss', boss.x, { duration: 900 }); window.renderer?.impact?.('boss'); }
        this.lastBossState = owner.state;
      }
      if (owner.state === 'boss_walk_in' && boss && (this.lastStepX === null || Math.abs(boss.x - this.lastStepX) > 150)) {
        this.lastStepX = boss.x; B.combatFX?.contact('firewall', boss.x, 822, -1, false);
        window.renderer?.impact?.('land', { strength: 0.6 });
      }
    }
    drawArchitecture(ctx, music, district) {
      // Source-image coordinates, called inside the foreground's transform.
      // No second texture or canvas allocation; screens remain inside their glass.
      const sourceX = x => -152 + x * 4400 / 1279;
      const time = this.motionTimeMs();
      const phase = time === 0 ? 0 : music.beatFloat || time / 700, phrase = Math.floor(phase / 4) % 4;
      ctx.save();
      for (const [x, y] of [[390, 214], [785, 201]]) {
          const kick = this.energyAt(sourceX(x));
        const swing = Math.sin(time / 1250 + x) * 3.5 + Math.sin(time / 110) * kick * 9;
        ctx.strokeStyle = '#182738'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 30, y - 22); ctx.quadraticCurveTo(x + swing, y + 32, x + 65, y - 16); ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const t = ((phase * 0.4 + i / 8) % 1 + 1) % 1;
          const px = (1 - t) ** 2 * (x - 30) + 2 * (1 - t) * t * (x + swing) + t * t * (x + 65);
          const py = (1 - t) ** 2 * (y - 22) + 2 * (1 - t) * t * (y + 32) + t * t * (y - 16);
          ctx.globalAlpha = (0.15 + music.energy * 0.5 + kick * 0.3) * music.quiet;
          ctx.fillStyle = phrase === 3 ? '#edb5ff' : '#9bffe8'; ctx.fillRect(px, py, 2.5, 1.5);
        }
      }
      for (const [x, y] of [[218, 440], [508, 440], [851, 440]]) {
        const kick = this.energyAt(sourceX(x));
        if (kick < 0.01) continue;
        for (let i = 0; i < 4; i++) {
          const t = Math.min(1, (1 - kick) + i * 0.1);
          ctx.globalAlpha = kick * 0.25; ctx.fillStyle = '#b8d2e1';
          ctx.beginPath(); ctx.ellipse(x + Math.sin(i * 3) * 6, y - t * 36, 5 + t * 12, 4 + t * 9, 0, 0, TAU); ctx.fill();
        }
      }
      const rattle = this.energyAt(sourceX(346));
      ctx.save(); ctx.globalAlpha = 1; ctx.translate(346, 294);
      ctx.rotate(Math.sin(time / 900) * 0.022 + Math.sin(time / 60) * rattle * 0.065);
      ctx.strokeStyle = '#788792'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 13); ctx.moveTo(24, 0); ctx.lineTo(24, 13); ctx.stroke();
      ctx.fillStyle = '#101d29'; ctx.fillRect(-3, 13, 30, 13); ctx.strokeStyle = '#a6f5db'; ctx.strokeRect(-3, 13, 30, 13);
      ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#a6f5db'; ctx.fillText('ON AIR', 12, 22); ctx.restore();
      // Phrase accent is a pavement reflection, kept beneath warning shapes.
      if (music.performing && music.combo > 0) {
        ctx.globalAlpha = Math.min(0.2, music.energy * 0.12) * music.quiet;
        ctx.fillStyle = phrase === 3 ? '#e19dff' : '#77ffe1';
        for (let x = 50; x < 1279; x += 85) ctx.fillRect(x, 414, 48 + phrase * 7, 3 + music.combo * 8);
      }
      ctx.restore();
    }
    startRatEvent(detail) {
      this.ratRunConsumed = true;
      this.archive()?.completeStudioRatEvent?.('level-01');
      const manager = window.enemyManager;
      const candidates = (manager?.enemies || []).filter(e => e.active && e.type !== 'drone' && !e._authoredEntranceActive &&
        !e.isSpawnProtected?.() && !manager.isHijacked?.(e) && !manager.isRebooting?.(e) &&
        B.combatFX?.visible(e.position.x, e.position.y, 180));
      const victim = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
      const camera = window.gameCamera?.centerX || window.player.position.x;
      const zoom = Math.max(0.5, window.renderer?.getZoomLevel?.() || 1);
      this.ratAge = 0;
      this.ratEvent = { x: detail.x, y: detail.y, victim, grabbed: false,
        targetX: victim?.position.x ?? detail.x + 95, targetY: victim ? victim.position.y + 72 : detail.y,
        exitX: camera - 960 / zoom - 220 };
    }
    grabRatTarget() {
      const e = this.ratEvent, victim = e.victim, manager = window.enemyManager;
      e.grabbed = true;
      if (!victim?.active || victim._authoredEntranceActive || victim.isSpawnProtected?.() || manager?.isHijacked?.(victim) || manager?.isRebooting?.(victim) || window.hackingSystem?.isActive?.()) { e.victim = null; return; }
      e.targetX = victim.position.x; e.targetY = victim.position.y + 72;
      // Use the real defeat transaction once. The remaining dragged drawing is
      // a presentation reference, never a second active enemy or quota credit.
      victim.takeDamage(999, { x: victim.position.x, y: victim.position.y, direction: -1 });
      if (!victim.active) manager?.recordDefeat?.(victim);
      else e.victim = null;
    }
    drawRatEvent(ctx) {
      const e = this.ratEvent, age = this.ratAge;
      if (!e || age === null) return;
      const pounce = Math.max(0, Math.min(1, (age - 1050) / 600));
      const drag = Math.max(0, Math.min(1, (age - 1850) / 4000));
      const x = drag ? e.targetX + (e.exitX - e.targetX) * drag : e.x + (e.targetX - e.x) * pounce;
      const y = e.y + (e.targetY - e.y) * pounce - Math.sin(pounce * Math.PI) * 85;
      const frame = age < 1050 ? Math.min(3, Math.floor(age / 270)) : age < 1650 ? 4 + Math.min(3, Math.floor(pounce * 4)) : 8 + Math.floor(age / 170) % 4;
      if (e.grabbed) {
        if (e.victim?.spriteReady && e.victim.sprite?.draw) {
          const pose = e.victim.getSpritePresentation();
          ctx.save(); ctx.translate(x + 108, y - 10); ctx.rotate(-Math.PI / 2);
          e.victim.sprite.draw(ctx, pose.x - e.victim.position.x, pose.y - e.victim.position.y - 72,
            { scale: pose.scale, flipH: pose.flipH }); ctx.restore();
        } else {
          // With no suitable enemy, it pulls a piece of the comic border out
          // of the world instead. The scene still pays off in a cleared area.
          ctx.fillStyle = '#e5e1d3'; ctx.fillRect(x + 44, y - 22, 118, 17);
          ctx.fillStyle = '#111620'; ctx.fillRect(x + 44, y - 15, 113, 4);
        }
        ctx.strokeStyle = '#bcd4d2'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x + 39, y - 25); ctx.lineTo(x + 88, y - 15); ctx.stroke();
      }
      const flip = age >= 1050 && age < 1650 && e.targetX < e.x;
      if (!B.PresentationAssets?.draw('studioCatEvent', ctx, { x, y, width: 136, frame, flip })) this.drawRat(ctx, x, y, 1.12);
    }
    drawRat(ctx, x, y, scale = 1) {
      const moving = this.ratAge !== null;
      const time = this.motionTimeMs();
      const frame = moving ? Math.floor(this.ratAge / 110) % 4 : Math.floor(time / 600) % 4;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, moving ? 1 : this.getCatIdlePose().breath);
      const illustrated = B.PresentationAssets?.draw('studioCat', ctx, { x: 0, y: 0, width: 116 * scale, frame });
      ctx.restore(); if (illustrated) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      const tail = Math.sin(time / 470) * 9;
      ctx.strokeStyle = '#b5bfd3'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-12, -5); ctx.quadraticCurveTo(-45 + tail, -54, -29 + tail, -47); ctx.stroke();
      ctx.fillStyle = '#262d40'; ctx.strokeStyle = '#adb9cc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -9, 21, 12, -0.1, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -15); ctx.lineTo(10, -34); ctx.lineTo(20, -25); ctx.lineTo(30, -33); ctx.lineTo(33, -10); ctx.lineTo(18, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a4ffe8'; ctx.fillRect(22, -12, 3, time % 3500 > 3300 ? 1 : 3); ctx.fillRect(-10, 1, 9, 3); ctx.fillRect(8, 1, 9, 3);
      ctx.restore();
    }
    drawTrafficLighting(ctx, { foreground = false } = {}) {
      if (!ctx || !this.owner?.missionStarted) return;
      const ships = (window.spaceShipSystem?.ships || []).filter(ship => !!ship.isForeground === !!foreground).slice(0, 3);
      ctx.save();
      ctx.fillStyle = '#b6e9fa';
      ctx.globalAlpha = foreground ? 0.1 : 0.045;
      for (const ship of ships) {
        const direction = ship.direction || 1;
        ctx.beginPath();
        ctx.moveTo(ship.x, ship.y + 60);
        ctx.lineTo(ship.x + 320 * direction, 824);
        ctx.lineTo(ship.x + 520 * direction, 824);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    drawWorld(ctx) {
      if (!this.owner?.missionStarted) return;
      const time = this.motionTimeMs();
      ctx.save();
      this.drawRatEvent(ctx);
      for (const d of this.details) {
        if (!B.combatFX?.visible(d.x, d.y, 120)) continue;
        const found = this.archive()?.hasEgg?.(d.id);
        if (d.id === DETAILS[0].id) {
          if (this.ratRunConsumed) continue;
          if (!this.ratEvent) {
            const pose = this.getCatIdlePose();
            ctx.save(); ctx.translate(d.x, d.y); ctx.scale(1, pose.breath);
            const illustrated = B.PresentationAssets?.draw('studioCatEvent', ctx, { x: 0, y: 0, width: 136, frame: pose.frame });
            ctx.restore(); if (!illustrated) this.drawRat(ctx, d.x, d.y);
          }
        }
        else {
          const flyer = d.id === DETAILS[3].id, route = d.id === DETAILS[2].id;
          ctx.save(); ctx.translate(d.x, d.y - 49);
          // Paper pivots from its attachment. Metal plates remain fixed;
          // only their status/display details move at their own cadences.
          if (flyer) { ctx.rotate(-0.1 + Math.sin(time / 670) * 0.065); ctx.scale(1 + Math.sin(time / 410) * 0.025, 1); }
          ctx.translate(0, 23);
          ctx.fillStyle = flyer ? '#efe5cd' : '#142936'; ctx.strokeStyle = '#a6dfd6'; ctx.lineWidth = 2;
          ctx.fillRect(-22, -23, 44, 43); ctx.strokeRect(-22, -23, 44, 43);
          ctx.fillStyle = flyer ? '#182735' : '#a6ffe3'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
          ctx.fillText(flyer ? 'BARCODE' : route ? '↗ AMP' : '2 BEATS', 0, -7);
          for (let i = 0; i < 7; i++) ctx.fillRect(-16 + i * 5, 1, i % 3 ? 2 : 3, 10);
          if (!flyer) {
            const progress = (time / (route ? 2500 : 1800)) % 1;
            ctx.fillStyle = route ? '#d7fba7' : '#d2ffff';
            if (route) {
              ctx.globalAlpha *= 0.5 + 0.3 * Math.sin(time / 380);
              ctx.beginPath(); ctx.moveTo(-10 + progress * 24, 16 - progress * 20);
              ctx.lineTo(-4 + progress * 24, 16 - progress * 20); ctx.lineTo(-4 + progress * 24, 22 - progress * 20); ctx.stroke();
            } else ctx.fillRect(-18 + progress * 30, 15, 6, 3);
          } else {
            ctx.strokeStyle = '#a99e87'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-20, 17); ctx.quadraticCurveTo(0, 13 + Math.sin(time / 410) * 4, 20, 17); ctx.stroke();
          }
          ctx.restore();
        }
        if (!found) {
          ctx.strokeStyle = '#fff3c8'; ctx.lineWidth = 2;
          const turn = time / 900 + d.x / 300;
          ctx.beginPath(); ctx.arc(d.x, d.y - 67, 5, turn, turn + Math.PI * 1.5); ctx.stroke();
        }
      }
      for (const e of this.events) {
        const t = e.age / e.duration, fade = Math.sin(t * Math.PI);
        ctx.save(); ctx.globalAlpha = fade * 0.7; ctx.strokeStyle = COLORS[e.zone] || '#a9ffeb'; ctx.fillStyle = ctx.strokeStyle;
        if (e.kind === 'arrival') {
          if (e.zone === 1) {
            ctx.fillStyle = '#080a14'; ctx.globalAlpha = fade * 0.3; ctx.fillRect(e.x - 200 + t * 400, 784, 260, 38);
            ctx.strokeStyle = '#c1b0ff'; ctx.lineWidth = 3;
            for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(e.x - 36 + i * 18, 350 + t * 220); ctx.lineTo(e.x - 36 + i * 18, 390 + t * 220); ctx.stroke(); }
          } else if (e.zone === 2) {
            for (let i = 0; i < 12; i++) ctx.fillRect(e.x + (i - 6) * 18 * t, 812 - Math.sin(t * Math.PI) * (20 + i % 3 * 18), 10, 5);
          } else {
            for (let i = 0; i < 10; i++) ctx.fillRect(e.x - 70 + i * 16, 810 - t * (80 + i % 3 * 22), 5, 18 * (1 - t));
          }
        } else if (['clear', 'destruction', 'boss', 'victory'].includes(e.kind)) {
          ctx.lineWidth = e.kind === 'clear' ? 4 : 8;
          const spread = 30 + t * (e.kind === 'destruction' ? 720 : 450);
          for (let side = -1; side <= 1; side += 2) {
            ctx.beginPath(); ctx.moveTo(e.x + side * spread * 0.25, 820);
            for (let i = 1; i <= 9; i++) {
              const jitter = B.combatFX?.sample(e.seed, i + (side + 1) * 10) ?? 0.5;
              ctx.lineTo(e.x + side * spread * (0.25 + i / 12), 820 - Math.sin(i / 10 * Math.PI) * (10 + jitter * 45) * (1 - t));
            }
            ctx.stroke();
          }
          for (let i = 0; i < 20; i++) {
            const a = (B.combatFX?.sample(e.seed, i + 30) ?? i / 20) * TAU;
            const r = t * (150 + (B.combatFX?.sample(e.seed, i + 60) ?? 0.5) * 270);
            ctx.fillRect(e.x + Math.cos(a) * r, 745 + Math.sin(a) * r * 0.5 - t * 70, i % 3 ? 6 : 14, 4);
          }
        }
        ctx.restore();
      }
      const jammer = B.JammerEnvironment?.getStatus?.();
      if (jammer?.revealed && !jammer.destroyed && jammer.stage?.index > 0) {
        const x = jammer.position.x, y = jammer.position.y - 90, strain = jammer.stage.index / 3;
        ctx.strokeStyle = '#ecabff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.3 + strain * 0.3;
        for (let side = -1; side <= 1; side += 2) {
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let i = 1; i <= 7; i++) ctx.lineTo(x + side * i * 16, y + Math.sin(i * 3 + time / 190) * 15 * strain);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    drawHUD(ctx) {
      if (!this.owner?.missionStarted || this.isDialogueDeferred()) return;
      ctx.save();
      const clear = this.events.find(e => e.kind === 'clear');
      if (clear) {
        ctx.globalAlpha = Math.sin(clear.age / clear.duration * Math.PI) * 0.7; ctx.strokeStyle = '#eee7d5'; ctx.lineWidth = 6;
        for (const [x, y, sx, sy] of [[22, 22, 1, 1], [1898, 22, -1, 1], [22, 1034, 1, -1], [1898, 1034, -1, -1]]) {
          ctx.beginPath(); ctx.moveTo(x, y + 55 * sy); ctx.lineTo(x, y); ctx.lineTo(x + 140 * sx, y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const key = B.GamepadUI?.connected ? (B.ControllerSettings?.prompt('inspect') || 'RB') : (window.inputManager?.actionInput?.keyboardBindings?.inspect?.[0] || 'E').toUpperCase();
      if (this.message) {
        const m = this.message;
        const layout=this.getMessageLayout();B.OverlayLayout.begin(ctx,layout);
        if(layout.docked){B.OverlayLayout.drawDock(ctx,layout,m.speaker);ctx.restore();return;}ctx.translate(layout.x-30,layout.y-887);
        ctx.fillStyle = '#070b15'; ctx.fillRect(39, 895, 890, 116); ctx.fillStyle = '#eee6d4'; ctx.fillRect(30, 887, 890, 116);
        ctx.fillStyle = '#0c1727'; ctx.font = 'bold 16px monospace'; ctx.fillText(m.speaker, 52, 908);
        ctx.font = 'bold 20px sans-serif'; ctx.fillText(m.lines[m.line], 52, 944, 840);
        ctx.font = '16px monospace'; ctx.fillText(`Press ${key} to ${m.line ? 'close' : 'continue'}`, 52, 979);
      } else if (this.nearby && !window.loreSystem?.currentLore) {
        const layout=B.OverlayLayout.place(500,49,{previous:{x:30,y:947,width:500,height:49,scale:1}});
        if(!layout.clear){ctx.restore();return;}ctx.translate(layout.x-30,layout.y-947);
        ctx.fillStyle = '#eee6d4'; ctx.fillRect(30, 947, 500, 49); ctx.fillStyle = '#121c2b'; ctx.font = 'bold 18px monospace';
        ctx.fillText(`${key} / INSPECT ${this.nearby.name}`, 48, 972);
      }
      ctx.restore();
    }
  }
  Level01StageFX.DETAILS = DETAILS;
  B.Level01StageFX = Level01StageFX;
  B.stageFX = new Level01StageFX();
})();
