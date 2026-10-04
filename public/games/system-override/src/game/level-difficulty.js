// A level owns its difficulty profile. Selection locks before its first frame;
// checkpoint retry never reopens it. Reward values are not player-facing copy.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/level-difficulty.js', exports: ['BARCODE.LevelDifficulty'], dependencies: [] });
(function() {
  const B = window.BARCODE = window.BARCODE || {};
  const profiles = new Map();
  profiles.set('level-01', Object.freeze({ title: 'DEAD AIR DISTRICT', choices: Object.freeze([
    Object.freeze({ id: 'relaxed', label: 'RELAXED', description: 'More health. More time to react.', health: 4, hostileScale: 0.86, bossRecoveryBeats: 6, value: 1 }),
    Object.freeze({ id: 'standard', label: 'STANDARD', description: 'The regular rhythm. The regular challenge.', health: 3, hostileScale: 1, bossRecoveryBeats: 3, value: 2 }),
    Object.freeze({ id: 'overclocked', label: 'OVERCLOCKED', description: 'Faster enemies. Tighter counter windows.', health: 3, hostileScale: 1.12, bossRecoveryBeats: 2, value: 3 })
  ]) }));
  const D = {
    open: false, locked: false, recoveryMode: 'checkpoints', levelId: 'level-01', selected: 1, choice: null, held: new Set(),
    beginLevel(levelId = 'level-01') {
      if (!profiles.has(levelId)) return false;
      this.levelId = levelId; this.selected = this.choice && this.profile().choices.includes(this.choice) ? this.profile().choices.indexOf(this.choice) : 1;
      this.open = true; this.locked = false; this.held.clear();
      window.inputManager?.resetActionEdges?.();
      return true;
    },
    profile() { return profiles.get(this.levelId); },
    registerLevel(levelId, profile) {
      if (this.locked && this.levelId === levelId || !/^level-0[1-7]$/.test(levelId) || !Array.isArray(profile?.choices) || profile.choices.length !== 3) return false;
      if (!profile.choices.every(c => typeof c.id === 'string' && typeof c.label === 'string' && Number.isFinite(c.value) && c.value >= 0)) return false;
      profiles.set(levelId, Object.freeze({ ...profile, choices: Object.freeze(profile.choices.map(c => Object.freeze({ ...c }))) }));
      return true;
    },
    select(index) { if (!this.open || this.locked || !Number.isInteger(index) || index < 0 || index > 2) return false; this.selected = index; return true; },
    setRecovery(mode) { if(!this.open || this.locked || !['checkpoints','full-run'].includes(mode))return false;this.recoveryMode=mode;return true; },
    toggleRecovery() { return this.setRecovery(this.recoveryMode==='checkpoints'?'full-run':'checkpoints'); },
    confirm() {
      if (!this.open || this.locked) return false;
      this.choice = this.profile().choices[this.selected]; this.locked = true; this.open = false;
      if (window.player) { window.player.maxHealth = this.choice.health || 3; window.player.health = window.player.maxHealth; }
      window.inputManager?.resetActionEdges?.();
      return true;
    },
    getHostileScale() { return this.locked ? this.choice?.hostileScale ?? 1 : 1; },
    complete() {
      if (!this.locked || !this.choice) return false;
      return window.lostDataSystem?.archive?.recordLevelChallenge?.(this.levelId, this.choice.id, this.choice.value) || false;
    },
    keyDown(event) {
      const key = event.key.toLowerCase();
      if (!this.open) { if (!this.held.has(key)) return false; event.preventDefault?.(); return true; }
      event.preventDefault?.();
      if (event.repeat || this.held.has(key)) return true;
      this.held.add(key);
      if (['arrowleft', 'arrowup'].includes(key)) this.select((this.selected + 2) % 3);
      else if (['arrowright', 'arrowdown', 'tab'].includes(key)) this.select((this.selected + (event.shiftKey ? 2 : 1)) % 3);
      else if (['1', '2', '3'].includes(key)) this.select(Number(key) - 1);
      else if (key==='c') this.toggleRecovery();
      else if (['enter', ' '].includes(key)) this.confirm();
      return true;
    },
    keyUp(event) { this.held.delete(event.key.toLowerCase()); },
    pointer(event) {
      if (!this.open) return false;
      event.preventDefault?.();
      const canvas = document.getElementById('gameCanvas'), rect = canvas?.getBoundingClientRect?.();
      if (!rect?.width || !rect.height) return true;
      const x = (event.clientX - rect.left) * 1920 / rect.width, y = (event.clientY - rect.top) * 1080 / rect.height;
      if (y >= 390 && y <= 590) for (let i = 0; i < 3; i++) if (x >= 340 + i * 420 && x <= 740 + i * 420) this.select(i);
      if(x>=340&&x<=1580&&y>=625&&y<=725)this.toggleRecovery();
      if (x >= 750 && x <= 1170 && y >= 785 && y <= 857) this.confirm();
      return true;
    },
    draw(ctx) {
      if (!this.open || !ctx) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(5, 10, 19, 0.96)'; ctx.fillRect(0, 0, 1920, 1080);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#89ffdc'; ctx.font = 'bold 25px Oxanium, monospace';
      ctx.fillText(this.profile().title, 960, 268);
      ctx.fillStyle = '#f1efe6'; ctx.font = 'bold 44px Oxanium, monospace'; ctx.fillText('CHOOSE YOUR DIFFICULTY', 960, 332);
      this.profile().choices.forEach((choice, i) => {
        const x = 340 + i * 420, active = i === this.selected;
        ctx.fillStyle = active ? '#173c3d' : '#121c2b'; ctx.fillRect(x, 390, 400, 200);
        ctx.strokeStyle = active ? '#a5ffdf' : '#49526e'; ctx.lineWidth = active ? 4 : 2; ctx.strokeRect(x, 390, 400, 200);
        ctx.fillStyle = active ? '#b2ffe4' : '#eeeade'; ctx.font = 'bold 27px Oxanium, monospace'; ctx.fillText(choice.label, x + 200, 448);
        ctx.font = '19px Oxanium, monospace';
        const lines = choice.description.split('. ').map(s => s.replace(/\.$/, ''));
        lines.forEach((line, row) => ctx.fillText(line, x + 200, 500 + row * 31));
      });
      ctx.fillStyle='#142a35';ctx.fillRect(340,625,1240,100);ctx.strokeStyle='#718697';ctx.strokeRect(340,625,1240,100);
      ctx.fillStyle='#a5ffdf';ctx.font='bold 24px Oxanium, monospace';
      const control=B.GamepadUI?.connected?B.ControllerSettings?.button(2)||'X':'C';
      ctx.fillText(`[${control}] RECOVERY: ${this.recoveryMode==='full-run'?'FULL RUN':'OBJECTIVE CHECKPOINTS'}`,960,665);
      ctx.fillStyle='#c9cad4';ctx.font='20px Oxanium, monospace';
      ctx.fillText(this.recoveryMode==='full-run'?'Death restarts the level. Earn +500 clear points.':'Death retries the latest objective with full health. Normal clear points.',960,704);
      ctx.fillText('Rules lock for this level. Both modes save at objective boundaries.',960,756);
      ctx.fillStyle = '#94ffdc'; ctx.fillRect(750, 785, 420, 72); ctx.fillStyle = '#101c24'; ctx.font = 'bold 27px Oxanium, monospace';
      B.ComicHUD.buttonText(ctx,'BEGIN LEVEL',750,785,420,72,12);
      ctx.fillStyle = '#b8b3c9'; ctx.font = '19px Oxanium, monospace';
      ctx.fillText(B.GamepadUI?.connected ? `D-PAD: CHOOSE     ${B.ControllerSettings?.button(0) || 'A'}: BEGIN` : 'ARROWS OR 1–3: CHOOSE     ENTER: BEGIN', 960, 916);
      ctx.restore();
    },
    stop() { this.open = false; this.held.clear(); }
  };
  B.LevelDifficulty = D;
})();
