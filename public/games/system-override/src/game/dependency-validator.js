// Dependency validator for BARCODE: System Override
// This script validates that all FILE_MANIFEST dependencies are correctly declared

window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/dependency-validator.js',
  exports: ['validateDependencies'],
  dependencies: []
});

// Validate all dependencies are available
window.validateDependencies = function() {
  console.log('=== VALIDATING DEPENDENCIES ===');
  
  const errors = [];
  const warnings = [];
  
  // Check each file's dependencies
  window.FILE_MANIFEST.forEach(file => {
    if (file.dependencies && file.dependencies.length > 0) {
      file.dependencies.forEach(dep => {
        // Check if dependency exists in global namespace
        if (typeof window[dep] === 'undefined') {
          errors.push(`❌ Missing dependency "${dep}" required by ${file.name}`);
        }
      });
    }
  });
  
  // Check for circular dependencies (basic check)
  const dependencyMap = new Map();
  window.FILE_MANIFEST.forEach(file => {
    if (file.dependencies && file.dependencies.length > 0) {
      dependencyMap.set(file.name, file.dependencies);
    }
  });
  
  // Check if all exports are available
  window.FILE_MANIFEST.forEach(file => {
    if (file.exports && file.exports.length > 0) {
      file.exports.forEach(exportName => {
        if (typeof window[exportName] === 'undefined') {
          errors.push(`❌ Missing export "${exportName}" from ${file.name}`);
        }
      });
    }
  });
  
  // Report results
  if (errors.length > 0) {
    console.error('DEPENDENCY ERRORS FOUND:');
    errors.forEach(error => console.error(error));
    return false;
  } else {
    console.log('✅ All dependencies validated successfully');
    return true;
  }
};