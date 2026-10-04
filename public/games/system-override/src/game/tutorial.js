// One lesson owner coordinates crew dialogue, earned actions and enemy entrances.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/tutorial.js', exports: ['TutorialSystem', 'tutorialSystem'], dependencies: ['clamp', 'randomRange', 'BARCODE.OverlayLayout'] });

window.TutorialSystem = class TutorialSystem {
  constructor() {
    this._active = false;
    this.completed = false;
    this.storyChapter = 0;
    this.dialogue = [];
    this.objectives = [];
    this.completedObjectives = new Set();
    this.recentDialogue = [];
    this.currentDialogue = 0;
    this.currentText = this.targetText = '';
    this.characterIndex = 0;
    this.typingSpeed = 35;
    this.readyToAdvance = false;
    this.lineAcknowledged = false;
    this.runGeneration = 0;
    this.pendingSpawns = [];
    this.combatEnemiesPaused = false;
    this.combatPracticeStarted = false;
    this._tutorialEnemyCount = this._tutorialEnemiesDefeated = 0;
    this.defeatedTutorialEnemies = new Set();
    this.contextHintsSeen = new Set();
    this.contextHint = null;
    this.resetFinalMessage();
  }

  get active() { return this._active; }
  set active(value) {
    this._active = !!value;
    if (!this._active) this.cancelPendingTimers();
  }
  isActive() { return this.active; }
  isCompleted() { return this.completed; }
  isPaused() { return !!(window.isPaused || window.gameState?.paused || window.gameState?.gameOver || window.gameState?.victory); }
  resetFinalMessage() {
    this.finalMessageHoldTime = 10000;
    this.finalMessageTimer = this.finalMessageFadeStart = 0;
    this.finalMessageOpacity = 1;
    this.isFinalMessage = this._finalMessageSequenceArmed = false;
  }

  startTutorial() {
    this._overlayPanels = {};
    this._taskLayout = null;
    this._dialogueLayout = null;
    this._dialogueMeasure = null;
    if (this.completed) return;
    this.runGeneration++;
    this.completedObjectives.clear();
    this.recentDialogue = [];
    this.contextHintsSeen.clear();
    this.contextHint = null;
    this.defeatedTutorialEnemies.clear();
    this._tutorialEnemyCount = this._tutorialEnemiesDefeated = 0;
    window.enemyManager?.clear?.();
    window.hackingSystem?.reset?.();
    window.rhythmSystem?.hideRhythmMode?.();
    if (window.inputManager) {
      window.inputManager.hasTrackedMovement = false;
      window.inputManager.hasTrackedJump = false;
    }
    this.active = true;
    this.startChapter(0);
  }

  startChapter(chapter) {
    if(this._overlayPanels)delete this._overlayPanels.dialogue;
    this.cancelPendingTimers();
    this.storyChapter = chapter;
    this.dialogue = [];
    this.objectives = [];
    this.combatPracticeStarted = false;
    this.combatEnemiesPaused = false;
    this._hackCaptionPhase = null;
    this.resetFinalMessage();
    const coaching = (requiresObjectives, extra = {}) => ({ kind: 'coaching', requiresObjectives, ...extra });
    switch (chapter) {
      case 0:
        this.addDialogue('Still with you, 6. The original studio take is safe.', 'cache');
        this.addDialogue("You're in Dead Air District. The street relays are jammed; the tower uplink is blocked.", 'mac');
        this.addDialogue('Then we start down here. Keep talking me through it.', '6bit');
        this.addDialogue("Check your footing. Move around, then give me a clean jump. I'll watch the route.", 'mac', coaching(['movement', 'jump'], { skipWhenEarned: true }));
        this.addObjective('Move left or right', 'movement');
        this.addObjective('Jump', 'jump');
        break;
      case 1:
        this.addDialogue('Three corrupted signals ahead. Those viruses are between you and the next block.', 'mac');
        this.addDialogue('Watch your signal strength at the top-left. Lose it all and we lose your connection.', 'cache');
        this.addDialogue('Land on them from above. Keep clear of their sides. Clear all three.', 'mac', coaching(['combat'], { startCombat: true }));
        this.addObjective('Stomp the viruses', 'combat');
        this._tutorialEnemyCount = this._tutorialEnemiesDefeated = 0;
        this.defeatedTutorialEnemies.clear();
        break;
      case 2:
        this.addDialogue('That is your footing. Now listen: the beat survived the interference.', 'dj');
        this.addDialogue("Plant your feet and enter Rhythm Combat. You'll hold your position while you play.", 'dj', coaching(['rhythm_start'], { skipWhenEarned: true }));
        this.addDialogue('Hit the beat to send an attack. Build five clean hits in a row; a miss restarts the count.', 'dj', coaching(['rhythm_combo'], { skipWhenEarned: true }));
        this.addDialogue('Five clean hits. Now leave the stance so you can move again.', 'dj', { requiresObjectives: ['rhythm_exit'] });
        this.addObjective('Enter Rhythm Combat', 'rhythm_start');
        this.addObjective('Hit five beats in a row', 'rhythm_combo');
        this.addObjective('Leave Rhythm Combat', 'rhythm_exit');
        break;
      case 3:
        this.addDialogue('Their commands are just code. The practice uplink lets you learn to rewrite them.', 'mac');
        this.addDialogue('Open the uplink. Watch the signal before entering anything.', 'mac', coaching(['hack_start'], { skipWhenEarned: true }));
        this.addDialogue('Now reconstruct what you saw. This practice answer has no time limit.', 'mac', coaching(['hack_complete'], { skipWhenEarned: true }));
        this.addDialogue("You're through. Out there, a successful hack turns an enemy into an ally for twelve seconds. Watch that countdown.", 'cache');
        this.addObjective('Open the practice uplink', 'hack_start');
        this.addObjective('Complete the practice hack', 'hack_complete');
        break;
      case 4:
        this.addDialogue('Twenty corrupted signals remain. Clear the blocks so we can locate the Broadcast Jammer, then break it to restore the local signal.', 'mac');
        this.addDialogue('If a lost recording surfaces, keep it. We need the originals, not a cleaned-up replacement.', 'cache');
        this.addDialogue('The district first. Then the tower. And we find 9 Bit.', '6bit');
        this.addDialogue("I'll keep the beat underneath you. You handle the street.", 'dj');
        this.addDialogue('Channel stays open, 6. Bring the neighborhood back.', 'cache');
        break;
      default: return;
    }
    this.currentDialogue = 0;
    this.startNextDialogue();
  }

  addDialogue(text, speaker = 'mac', options = {}) {
    const line = { text, speaker, kind: 'story', ...options };
    this.dialogue.push(line);
    return line;
  }
  addObjective(text, id) { this.objectives.push({ text, id, completed: this.completedObjectives.has(id) }); }
  allEarned(ids = []) { return ids.every(id => this.completedObjectives.has(id)); }
  rememberDialogue(line, text) {
    if (this.recentDialogue.at(-1)?.text !== text) this.recentDialogue.push({ speaker: line.speaker, text });
    this.recentDialogue = this.recentDialogue.slice(-4);
  }
  startNextDialogue() {
    const line = this.dialogue[this.currentDialogue];
    if (!line) return;
    this.lineAcknowledged = false;
    this.targetText = this.resolveControlText(line.text);
    if (this.storyChapter === 2 && this.currentDialogue === 3 && this.completedObjectives.has('rhythm_exit')) {
      this.targetText = "Five clean hits, and you're moving again. You've got the stance.";
    }
    this.currentText = '';
    this.characterIndex = 0;
    this.readyToAdvance = false;
    // Already-demonstrated coaching has no story content to interrupt or repeat.
    if (!line.skipWhenEarned || !this.allEarned(line.requiresObjectives)) this.rememberDialogue(line, this.targetText);
  }

  // Objective callbacks record facts only. They never advance a line/chapter,
  // schedule a second transition, or reset progress after a failed attempt.
  checkObjective(id) { return this.completeObjective(id); }
  completeObjective(id) {
    if (!this.active || this.isPaused() || this.completedObjectives.has(id) || !this.objectives.some(o => o.id === id)) return false;
    if (id === 'combat' && (!this.combatPracticeStarted || this._tutorialEnemiesDefeated < 3)) return false;
    if (id === 'rhythm_combo' && !this.completedObjectives.has('rhythm_start')) return false;
    if (id === 'rhythm_exit') {
      const rhythm = window.rhythmSystem;
      if ((rhythm?.getCombo?.() ?? rhythm?.combo ?? 0) >= 5) this.completeObjective('rhythm_combo');
      if (!this.completedObjectives.has('rhythm_combo') || rhythm?.isActive?.()) return false;
    }
    if (id === 'hack_complete' && !this.completedObjectives.has('hack_start')) return false;
    this.completedObjectives.add(id);
    this.objectives.find(o => o.id === id).completed = true;
    if (id === 'rhythm_exit' && this.currentDialogue === 3) {
      this.targetText = "Five clean hits, and you're moving again. You've got the stance.";
      if (this.readyToAdvance) this.characterIndex = this.targetText.length;
      this.currentText = this.targetText.slice(0, Math.floor(this.characterIndex));
    }
    return true;
  }
  observeProgress() {
    if (this.storyChapter === 1 && this._tutorialEnemiesDefeated >= 3) this.checkObjective('combat');
    if (this.storyChapter === 2) {
      const rhythm = window.rhythmSystem;
      if (rhythm?.isActive?.()) this.checkObjective('rhythm_start');
      if ((rhythm?.getCombo?.() ?? rhythm?.combo ?? 0) >= 5) this.checkObjective('rhythm_combo');
    }
    if (this.storyChapter === 3) {
      const hack = window.hackingSystem;
      if (hack?.isActive?.()) this.checkObjective('hack_start');
      if (hack?.isComplete?.() && !hack._lastResultFailed && this.completedObjectives.has('hack_start')) this.checkObjective('hack_complete');
    }
  }

  canAdvanceDialogueWithInput() {
    return this.getInstructionOwner() === 'dialogue' && this.getDialogueLayout().readable && !this.isPaused() && this.readyToAdvance;
  }
  handleSpacePress() {
    if (this.getInstructionOwner() !== 'dialogue' || !this.getDialogueLayout().readable || this.isPaused()) return false;
    if (!this.readyToAdvance) {
      this.characterIndex = this.targetText.length;
      this.currentText = this.targetText;
      this.readyToAdvance = true;
      return true; // A fresh press is required to acknowledge this line.
    }
    if (!this.canAdvanceDialogueWithInput()) return false;
    this.advanceDialogue();
    return true;
  }
  advanceDialogue() {
    if (!this.canAdvanceDialogueWithInput()) return;
    this.lineAcknowledged = true;
    if (this.dialogue[this.currentDialogue]?.startCombat) this.spawnCombatEnemies();
    this.reconcileLesson();
  }
  reconcileLesson() {
    // This is the only normal progression path. At most one chapter can be
    // entered per call, including when multiple objectives arrive together.
    for (let i = 0; i < this.dialogue.length; i++) {
      const line = this.dialogue[this.currentDialogue];
      if (!line) return;
      if (line.skipWhenEarned && this.allEarned(line.requiresObjectives)) this.lineAcknowledged = true;
      if (!this.lineAcknowledged || !this.allEarned(line.requiresObjectives)) return;
      const hack = window.hackingSystem;
      if (this.storyChapter === 3 && this.currentDialogue === 1 && !this.completedObjectives.has('hack_complete') && hack?.phase !== 'answer') return;
      const next = this.dialogue[this.currentDialogue + 1];
      if (hack?.isActive?.() && (!next || next.kind === 'story')) return;
      if (!next) {
        if (!this.objectives.every(o => o.completed)) return;
        if (this.storyChapter === 4) this.completeTutorial();
        else this.startChapter(this.storyChapter + 1);
        return;
      }
      this.currentDialogue++;
      this.startNextDialogue();
    }
  }

  spawnCombatEnemies() {
    if (!this.active || this.storyChapter !== 1 || this.combatPracticeStarted) return;
    this.combatPracticeStarted = true;
    window.enemyManager?.clear?.();
    this.spawnElapsedMs = 0;
    this.pendingSpawns = [0, 1, 2].map(index => ({ index, at: index * 1000, run: this.runGeneration }));
    this.updateCombatSpawns(0);
  }
  updateCombatSpawns(delta) {
    if (!this.combatPracticeStarted || this.storyChapter !== 1) return;
    this.spawnElapsedMs += delta;
    while (this.pendingSpawns.length && this.pendingSpawns[0].at <= this.spawnElapsedMs) {
      const item = this.pendingSpawns.shift();
      if (item.run !== this.runGeneration) continue;
      const enemy = window.sector1Progression?.spawnTutorialEnemy?.(item.index);
      if (enemy) { enemy._tutorialRun = this.runGeneration; this._tutorialEnemyCount++; }
    }
  }
  recordEnemyDefeat(enemy) {
    if (!this.active || this.storyChapter !== 1 || !this.combatPracticeStarted || !enemy?._isTutorialEnemy ||
        enemy._tutorialRun !== this.runGeneration || this.defeatedTutorialEnemies.has(enemy)) return false;
    this.defeatedTutorialEnemies.add(enemy);
    this._tutorialEnemiesDefeated++;
    if (this._tutorialEnemiesDefeated >= 3) this.checkObjective('combat');
    return true;
  }
  cancelPendingTimers() { this.pendingSpawns = []; }

  _isFinalChapterDialogue() { return this.storyChapter === 4 && this.currentDialogue === this.dialogue.length - 1; }
  _armFinalMessageSequence() {
    if (!this._isFinalChapterDialogue() || !this.readyToAdvance || this._finalMessageSequenceArmed) return false;
    this._finalMessageSequenceArmed = this.isFinalMessage = true;
    this.finalMessageTimer = 0;
    return true;
  }
  update(deltaTime = 0) {
    if (this.isPaused()) return;
    const delta = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
    if (!this.active) { if (this.completed) this.updateContextHints(delta); return; }
    this.updateCombatSpawns(delta);
    this.observeProgress();
    const finalWasActive = this.isFinalMessage;
    const hack = window.hackingSystem;
    if (this.storyChapter === 3 && hack?.isActive?.()) {
      // The terminal temporarily owns coaching. Preserve the unread story
      // cursor, and return to it after the terminal closes.
      const phase = hack.phase === 'answer' ? 'answer' : 'read';
      if (phase !== this._hackCaptionPhase) {
        this._hackCaptionPhase = phase;
        const caption = this.getDialoguePresentation();
        this.rememberDialogue(caption.line, caption.text);
      }
    } else if (this.getInstructionOwner() === 'dialogue' && this.getDialogueLayout().readable) {
      this._hackCaptionPhase = null;
      this.characterIndex = Math.min(this.targetText.length, this.characterIndex +
        (window.BARCODE?.Preferences?.values.instantText ? this.targetText.length : delta / this.typingSpeed));
      this.currentText = this.targetText.slice(0, Math.floor(this.characterIndex));
      this.readyToAdvance = this.characterIndex >= this.targetText.length;
    }
    this.reconcileLesson();
    this._armFinalMessageSequence();
    if (finalWasActive && this.isFinalMessage && this.active && this.getInstructionOwner() === 'dialogue' && this.getDialogueLayout().readable) {
      this.finalMessageTimer += delta;
      if (this.finalMessageTimer >= this.finalMessageHoldTime) {
        this.finalMessageFadeStart = this.finalMessageHoldTime;
        this.finalMessageOpacity = Math.max(0, 1 - (this.finalMessageTimer - this.finalMessageHoldTime) / 2000);
        if (this.finalMessageOpacity === 0) this.completeTutorial();
      }
    }
  }

  completeTutorial() {
    if (this.completed) return;
    this.completed = true;
    this.active = false;
    window.enemyManager?.clear?.({ preserveDefeats: false });
    if (typeof window.syncEnemyDefeatProjections === 'function') window.syncEnemyDefeatProjections(0);
    else {
      if (window.gameState) window.gameState.enemiesDefeated = 0;
      if (window.sector1Progression) window.sector1Progression.enemiesDefeated = 0;
    }
    if (window.sector1Progression) window.sector1Progression.tutorialEnemiesDefeated = 0;
    if (window.objectivesSystem) {
      if (window.objectivesSystem.objectiveUI) window.objectivesSystem.objectiveUI.visible = true;
      window.objectivesSystem.active = true;
      window.objectivesSystem.reset?.();
    }
    window.objectivesShownAfterTutorial = true;
    window.loreSystem?.displayLoreMessage?.('Crew link open. Clear the district to locate the Broadcast Jammer.');
  }

  control(action) {
    const keys = { rhythm_mode: 'R', primary: '↓', interact: 'H', jump: '↑ / W' };
    if (action === 'continue') return window.BARCODE?.GamepadUI?.connected ? (window.BARCODE?.ControllerSettings?.button(8) || 'Create / View') : 'Space';
    if (action === 'move') return window.BARCODE?.GamepadUI?.connected ? 'Left stick' : '← / →';
    return window.BARCODE?.ControllerSettings?.prompt(action, keys[action]) || keys[action];
  }
  resolveControlText(text) {
    return text.replace(/\{(rhythm_mode|primary|interact|jump|dialogue)\}/g, (_, action) => this.control(action === 'dialogue' ? 'continue' : action));
  }
  getObjectivePresentation() {
    const done = id => this.completedObjectives.has(id), hack = window.hackingSystem;
    const cue = (title, action, detail, progress = '', label = '') => ({ title, control: action && this.control(action), detail, progress, label });
    if (this.storyChapter === 0) {
      if (!done('movement')) return cue('Move left or right', 'move', 'Walk along the street', '', 'Move');
      if (!done('jump')) return cue('Jump', 'jump', 'Hold for a higher jump', '', 'Jump');
    }
    if (this.storyChapter === 1 && this.combatPracticeStarted && !done('combat')) {
      return cue('Stomp the viruses', 'jump', 'Land on top • Avoid their sides', `${this._tutorialEnemiesDefeated}/3 cleared`, 'Jump');
    }
    if (this.storyChapter === 2 && !done('rhythm_exit')) {
      const active = window.rhythmSystem?.isActive?.();
      if (!active) return cue('Enter Rhythm Combat', 'rhythm_mode', 'Stand still on the ground', done('rhythm_combo') ? 'Five hits ✓' : '', 'Enter stance');
      if (!done('rhythm_combo')) return cue('Hit five beats in a row', 'primary', 'Tap when the beat lands', `${Math.min(5, window.rhythmSystem?.getCombo?.() ?? window.rhythmSystem?.combo ?? 0)}/5 in a row`, 'Beat');
      return cue('Leave Rhythm Combat', 'rhythm_mode', 'Leave the stance to move again', '', 'Exit stance');
    }
    if (this.storyChapter === 3 && !done('hack_complete')) {
      if (hack?.isActive?.()) {
        if (hack.phase !== 'answer') return cue('Watch the signal', null, 'Input opens after the signal', 'Practice uplink');
        const pad = window.BARCODE?.GamepadUI?.connected, settings = window.BARCODE?.ControllerSettings;
        return { title: 'Enter the answer', control: pad ? 'D-pad' : '0–9', label: pad ? 'Choose a key' : 'Type answer',
          detail: pad ? `${settings?.button(0) || 'A'} Enter • ${settings?.button(2) || 'X'} Erase • ${settings?.button(1) || 'B'} Cancel` : 'Enter Submit • Backspace Erase', progress: 'Practice • No answer time limit' };
      }
      return cue(done('hack_start') ? 'Retry the practice hack' : 'Open the practice uplink', 'interact',
        window.player?.grounded === false ? 'Land before opening the uplink' : 'Read the signal, then enter the answer', '', 'Open hack');
    }
    return null;
  }
  getDialogueLayout() {
    // Size against the complete line, so typing never moves the panel's edges.
    // Conservative glyph widths keep this independent of canvas/font loading.
    const lines=this.dialogue.map(line=>this.resolveControlText(line.text)),key=JSON.stringify(lines);
    if(this._dialogueMeasure?.key!==key) {
      const measure={measureText:text=>({width:text.length*18})};
      const variants=[1100,860,600].map((width,i)=>({width,
        height:104+Math.max(2+i,...lines.map(text=>this.wrapText(text,width-60,measure).length))*38+(i===2?30:0)}));
      this._dialogueMeasure={key,variants};
    }
    return window.BARCODE.OverlayLayout.present(this,'dialogue',this._dialogueMeasure.variants,{remember:true});
  }
  getInstructionOwner() {
    if (!this.active) return null;
    const hack = window.hackingSystem;
    if (hack?.isActive?.() || hack?.feedback || hack?.resultFx) return 'terminal';
    if (!this.lineAcknowledged && !this.getDialoguePresentation().hidden) return 'dialogue';
    return this.getObjectivePresentation() ? 'task' : null;
  }
  getDialoguePresentation() {
    const hack = window.hackingSystem;
    if (this.storyChapter === 3 && hack?.isActive?.()) {
      const index = hack.phase === 'answer' ? 2 : 1, line = this.dialogue[index];
      return { line, text: index === 1 ? 'Watch the signal before entering anything.' : line.text, terminal: true };
    }
    const line = this.dialogue[this.currentDialogue];
    const retrying = this.storyChapter === 3 && this.completedObjectives.has('hack_start') &&
      !this.completedObjectives.has('hack_complete') && line?.kind === 'coaching';
    return { line, text: this.currentText, terminal: false, hidden: retrying };
  }

  draw(ctx) {
    if (!this.active || !ctx || !this.dialogue.length) return;
    const owner = this.getInstructionOwner();
    if (!owner || owner === 'terminal' || owner === 'play') return;
    const presentation = this.getDialoguePresentation(), { line } = presentation;
    if (!line) return;
    ctx.save();
    // Unread story stays visible during play. Geometry, not movement input,
    // decides placement, reshaping, and a brief signal dissolve.
    if (owner === 'dialogue') {
      const speakers = { '6bit': ['6 BIT', '#e6e5ee'], dj: ['DJ FLOPPYDISC', '#83e9ff'], cache: ['CACHE BACK', '#ffd65c'], mac: ['MAC MODEM', '#ff929c'] };
      const [name, color] = speakers[line.speaker] || ['CREW LINK', '#95ffe0'];
      this._dialogueLayout = this.getDialogueLayout();
      const {x,y,width,height} = this._dialogueLayout;
      ctx.globalAlpha = this.finalMessageOpacity;
      window.BARCODE.OverlayLayout.begin(ctx,this._dialogueLayout);
      if(this._dialogueLayout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,this._dialogueLayout,name);ctx.restore();return;}
      ctx.fillStyle = '#080f1c'; ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = color; ctx.fillRect(x, y, 6, height);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = 'bold 26px Oxanium, sans-serif';
      ctx.fillText(name, x+26, y + 22);
      ctx.fillStyle = '#ffffff'; ctx.font = '32px Oxanium, sans-serif';
      this.wrapText(presentation.text, width - 60, ctx).forEach((text, index) => ctx.fillText(text, x+26, y + 64 + index * 38));
      ctx.font = 'bold 26px Oxanium, sans-serif'; ctx.fillStyle = '#a9ffdb';
      const button = this.control('continue') + (window.BARCODE?.GamepadUI?.connected ? ' button' : '');
      const help = `Press ${button} to ${this.readyToAdvance ? 'continue' : 'show the full line'}`;
      const helpLines=this.wrapText(help,width-52,ctx);
      helpLines.forEach((text,i)=>ctx.fillText(text,x+26,y+height-26-(helpLines.length-1-i)*29));
    } else {
      const card = this.getObjectivePresentation(), width = 564, height = 158;
      this._taskLayout = window.BARCODE.OverlayLayout.present(this,'task',[{width,height}],{remember:true});
      const {x,y} = this._taskLayout;
      ctx.globalAlpha = 1; window.BARCODE.OverlayLayout.begin(ctx,this._taskLayout);
      if(this._taskLayout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,this._taskLayout,card.title,card.control);ctx.restore();return;}
      ctx.fillStyle = '#080f1c'; ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#95ffe0'; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = '#95ffe0'; ctx.fillRect(x, y, 5, height);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = 'bold 30px Oxanium, sans-serif';
      ctx.fillStyle = '#ffffff'; ctx.fillText(card.title, x + 20, y + 28);
      ctx.font = 'bold 26px Oxanium, sans-serif'; ctx.fillStyle = '#a9ffdb';
      ctx.fillText(card.control || '', x + 20, y + 65);
      if (card.progress) { ctx.textAlign = 'right'; ctx.font = '22px Oxanium, sans-serif'; ctx.fillText(card.progress, x + width - 20, y + 65); }
      ctx.textAlign = 'left'; ctx.font = '24px Oxanium, sans-serif'; ctx.fillStyle = '#e1e9ee';
      this.wrapText(card.detail,width-40,ctx).forEach((text,i)=>ctx.fillText(text,x+20,y+105+i*28));
    }
    ctx.restore();
  }
  wrapText(text, maxWidth, ctx) {
    const lines = []; let current = '';
    for (const word of String(text).split(' ')) {
      const next = current ? current + ' ' + word : word;
      if (current && ctx.measureText(next).width > maxWidth) { lines.push(current); current = word; }
      else current = next;
    }
    if (current) lines.push(current);
    return lines;
  }

  updateContextHints(delta) {
    const progression = window.sector1Progression, player = window.player;
    if (!progression?.missionStarted || progression.isGameplaySuppressed?.() || progression.isBossCombatLive?.() || window.hackingSystem?.isActive?.()) return;
    const availability = window.hackingSystem?.getAvailability?.();
    if (this.contextHint?.id === 'hack' && availability?.state !== 'ready' ||
        this.contextHint?.id === 'ally' && availability?.state !== 'linked') this.contextHint = null;
    if (this.contextHint) {
      this.contextHint.remainingMs -= delta;
      if (this.contextHint.remainingMs > 0) return;
      this.contextHint = null;
    }
    const show = (id, data) => {
      if (this.contextHintsSeen.has(id)) return false;
      this.contextHintsSeen.add(id); this.contextHint = { id, remainingMs: 6500, ...data }; return true;
    };
    if (availability?.state === 'linked' && show('ally', { title: 'Enemy linked • 12-second ally', action: 'interact', detail: 'Watch its countdown • Press to release' })) return;
    if (availability?.state === 'ready' && availability.target && show('hack', { title: 'Hack the marked enemy', action: 'interact', detail: 'Solve the code for a twelve-second ally' })) return;
    const nearby = (x, y) => player?.position && Math.abs(x - player.position.x) < 260 && Math.abs(y - player.position.y - 72) < 180;
    const cell = progression.repairs?.find(r => !r.collected && nearby(r.x, r.surfaceY));
    const carrier = window.enemyManager?.enemies?.find(e => e.active && e._repairCarrier && !e._repairDropped && nearby(e.position.x, e.position.y + 72));
    if (cell || carrier) show('repair', { title: carrier && !cell ? 'Marked enemy carries a repair' : 'Repair cell nearby',
      detail: carrier && !cell ? 'Defeat the carrier to release its repair' : player.health >= player.maxHealth ? 'Health full • The cell stays for later' : 'Touch the cell to restore one health' });
  }
  getContextHint() {
    if (!this.contextHint || this.active || window.hackingSystem?.isActive?.()) return null;
    const status = window.hackingSystem?.getAvailability?.();
    if (this.contextHint.id === 'hack' && status?.state !== 'ready' || this.contextHint.id === 'ally' && status?.state !== 'linked') return null;
    return { ...this.contextHint, control: this.contextHint.action && this.control(this.contextHint.action) };
  }
};
window.tutorialSystem = new window.TutorialSystem();
