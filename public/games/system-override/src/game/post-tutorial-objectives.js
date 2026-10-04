// Post-tutorial objective compatibility shim.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/post-tutorial-objectives.js', exports: ['PostTutorialObjectives'], dependencies: ['objectivesSystem'] });

window.PostTutorialObjectives = class PostTutorialObjectives {
  constructor() { this.completedObjectives = new Set(); }
  update() {}
  draw(ctx) { if (window.objectivesSystem && typeof window.objectivesSystem.draw === 'function') window.objectivesSystem.draw(ctx); }
  reset() { this.completedObjectives.clear(); }
};
