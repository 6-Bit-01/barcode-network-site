// Music controls system - DISABLED
// This file has been disabled and replaced by automatic music layer management
// All music functionality is now handled by the audio system directly

window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/music-controls.js',
  exports: [],
  dependencies: []
});

// No music controls - music layers managed automatically by audio system
console.log('Music controls system disabled - using automatic layer management');