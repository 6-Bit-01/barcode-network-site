// Legacy main.js - DEPRECATED AND REMOVED
// This file has been refactored into the new modular structure.
// 
// The refactoring moved all functionality to focused modules:
// - main-new.js: Clean entry point using modular coordinators
// - game-state.js: Centralized state management
// - update-coordinator.js: Update logic coordination  
// - render-coordinator.js: Render coordination
// - ui-manager.js: UI drawing and interface management
// - game-initializer.js: System initialization coordination
//
// Benefits of the refactoring:
// - Each module under 500 lines for maintainability
// - Clear separation of concerns
// - Proper dependency management via FILE_MANIFEST
// - Easier to test and debug individual systems
// - Consistent window.* namespace pattern
// - Follows script loading order rules
//
// All functionality preserved, now better organized.