// Mission Objectives System for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/objectives.js',
  exports: ['ObjectivesSystem', 'objectivesSystem', 'initObjectives'],
  dependencies: ['enemyManager', 'BARCODE.JammerEnvironment']
});

window.ObjectivesSystem = class ObjectivesSystem {
  constructor() {
    this.objectives = [];
    this.completedObjectives = new Set();
    this.objectiveUI = { visible: true, x: 30, y: 120, width: 600, height: 230 };
    this.active = true;
    this.allLoreRetrieved = false;
    this.loreRetrievedTime = 0;
    this.loreOverlayLocked = false;
    this.initializeMissionObjectives();
  }

  initializeMissionObjectives() {
    this.objectives = [{
      id: 'sandbox_training',
      title: 'Explore Dead Air District',
      description: 'Survey the district and stay online.',
      priority: 'INFO',
      completed: false,
      visible: true,
      progress: 0,
      required: 0
    }];
  }

  setMissionDefeatObjective(progress = 0, required = 20) {
    this.objectives = [{ id: 'defeat_20_enemies', title: 'Defeat 20 enemies', description: `${progress}/${required} mission enemies defeated.`, priority: 'PRIMARY', completed: false, visible: true, progress, required }];
  }

  updateMissionDefeatProgress(progress = 0, required = 20) {
    let obj = this.objectives.find(o => o.id === 'defeat_20_enemies');
    if (!obj) { this.setMissionDefeatObjective(progress, required); obj = this.objectives.find(o => o.id === 'defeat_20_enemies'); }
    obj.progress = progress; obj.required = required; obj.description = `${progress}/${required} mission enemies defeated.`; if (progress >= required) obj.completed = true;
  }

  revealJammerObjective() {
    this.updateMissionDefeatProgress(20, 20);
    if (!this.objectives.some(o => o.id === 'destroy_broadcast_jammer')) this.objectives.push({ id: 'destroy_broadcast_jammer', title: 'Find and destroy Broadcast Jammer', description: 'Break each relay on beat. Leave the marked surge; watch for relay guards.', priority: 'PRIMARY', completed: false, visible: true, progress: 0, required: 16 });
  }

  completeJammerObjective() {
    this.revealJammerObjective();
    const obj = this.objectives.find(o => o.id === 'destroy_broadcast_jammer');
    if (obj) { obj.completed = true; obj.progress = obj.required; obj.description = 'Broadcast Jammer destroyed. Boss signal incoming.'; }
  }

  setBossIntroObjective() {
    this.completeJammerObjective();
    if (!this.objectives.some(o => o.id === 'boss_ready_handoff')) this.objectives.push({ id: 'boss_ready_handoff', title: 'Boss signal acquired', description: 'Stand by for the Sector 1 boss battle.', priority: 'INFO', completed: false, visible: true, progress: 0, required: 0 });
  }

  setBossCombatObjective(health, maxHealth) {
    this.completeJammerObjective();
    this.objectives = this.objectives.filter(objective => objective.id !== 'boss_ready_handoff' && objective.id !== 'sector_1_complete');
    let objective = this.objectives.find(item => item.id === 'defeat_sector_1_boss');
    if (!objective) {
      objective = { id: 'defeat_sector_1_boss', title: 'Defeat the Sector 1 Boss', priority: 'PRIMARY', visible: true };
      this.objectives.push(objective);
    }
    Object.assign(objective, { description: 'Jump the ground pulse. Counter when the boss glows cyan.',
      completed: health <= 0, progress: maxHealth - health, required: maxHealth });
    if (health > 0) this.completedObjectives.delete('defeat_sector_1_boss');
  }

  completeLevelObjective() {
    const boss = this.objectives.find(item => item.id === 'defeat_sector_1_boss');
    if (boss) { boss.completed = true; boss.progress = boss.required; }
    if (!this.objectives.some(item => item.id === 'sector_1_complete')) this.objectives.push({
      id: 'sector_1_complete', title: 'Dead Air District complete', description: 'Sector 1 cleared.',
      priority: 'PRIMARY', completed: true, visible: true, progress: 1, required: 1
    });
  }

  update() {
    this.checkLoreCollectionStatus();
    this.checkCompletedObjectives();
  }

  revealBroadcastJammer(position) {
    if (!window.BARCODE || !window.BARCODE.JammerEnvironment) return false;
    window.BARCODE.JammerEnvironment.reveal({ position });
    if (window.sector1Progression && typeof window.sector1Progression.onJammerRevealed === 'function') {
      const status = window.BARCODE.JammerEnvironment.getStatus();
      window.sector1Progression.onJammerRevealed(status.position.x, status.position.y);
    }
    return true;
  }

  triggerBroadcastJammer(position) {
    if (!window.BARCODE || !window.BARCODE.JammerEnvironment) return false;
    window.BARCODE.JammerEnvironment.trigger({ position });
    return true;
  }

  checkLoreCollectionStatus() {
    let allLoreCollected = false;
    if (window.lostDataSystem && typeof window.lostDataSystem.getProgress === 'function') {
      const progress = window.lostDataSystem.getProgress();
      allLoreCollected = progress.collected >= progress.total && progress.total > 0;
    }
    if (allLoreCollected && !this.allLoreRetrieved) {
      this.allLoreRetrieved = true;
      this.loreRetrievedTime = Date.now();
      this.loreOverlayLocked = true;
    }
  }

  checkCompletedObjectives() {
    this.objectives.forEach(objective => {
      if (objective.completed && !this.completedObjectives.has(objective.id)) this.completedObjectives.add(objective.id);
    });
  }

  draw(ctx) {
    if (!this.objectiveUI.visible) return;
    const encounter = window.sector1Progression?.getEncounterStatus?.();
    const jammer = window.BARCODE?.JammerEnvironment?.getStatus?.();
    const objective = this.objectives.find(item => item.visible && !item.completed);
    if (!objective) return;
    let detail = objective.description;
    if (objective.id === 'defeat_20_enemies' && encounter) detail = encounter.started ? `${encounter.label}: ${encounter.defeated}/${encounter.required} cleared` : `MOVE RIGHT → ${encounter.label}`;
    if (objective.id === 'destroy_broadcast_jammer' && jammer?.revealed) detail = `${jammer.health}/${jammer.maxHealth} integrity — successful rhythm hits damage it`;
    ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(7,20,34,0.95)'; ctx.fillRect(420, 24, 1060, 104);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#91ffe0';
    ctx.fillText(objective.title.toUpperCase(), 440, 48, 800);
    ctx.textAlign = 'right'; ctx.font = '18px monospace'; ctx.fillStyle = '#cbaaff';
    if (objective.id === 'defeat_20_enemies') ctx.fillText(`${window.sector1Progression?.missionDefeats || 0} / 20`, 1458, 48);
    ctx.textAlign = 'left'; ctx.font = '20px monospace'; ctx.fillStyle = '#eef4fb'; ctx.fillText(detail, 440, 80, 1015);
    if (encounter && objective.id === 'defeat_20_enemies') { ctx.font = '16px monospace'; ctx.fillStyle = '#b8c6db'; ctx.fillText(encounter.started ? encounter.hint : 'The next encounter waits ahead.', 440, 111, 1015); }
    ctx.restore();
  }

  reset() {
    this.initializeMissionObjectives();
  }

  onGameOver() {}
};

window.initObjectives = function() {
  try {
    if (window.objectivesSystem) return true;
    window.objectivesSystem = new window.ObjectivesSystem();
    console.log('✅ Objectives system initialized');
    return true;
  } catch (error) {
    console.error('Failed to initialize objectives system:', error?.message || error);
    return false;
  }
};
