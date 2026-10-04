// Fullscreen management system for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/core/fullscreen.js',
  exports: ['FullscreenManager', 'fullscreenManager'],
  dependencies: []
});

// Clean, reliable fullscreen management
window.FullscreenManager = class FullscreenManager {
  constructor() {
    this.isSupported = this.checkSupport();
    this.isActive = false;
    this.callbacks = {
      enter: [],
      exit: [],
      error: []
    };
    
    this.init();
  }

  // Check if fullscreen API is supported
  checkSupport() {
    return !!(document.fullscreenEnabled || 
              document.webkitFullscreenEnabled || 
              document.mozFullScreenEnabled || 
              document.msFullscreenEnabled);
  }

  // Initialize event listeners
  init() {
    if (!this.isSupported) {
      console.warn('Fullscreen API not supported on this device');
      return;
    }

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());

    // Listen for fullscreen errors
    document.addEventListener('fullscreenerror', (e) => this.handleError(e));
    document.addEventListener('webkitfullscreenerror', (e) => this.handleError(e));
    document.addEventListener('mozfullscreenerror', (e) => this.handleError(e));
    document.addEventListener('MSFullscreenError', (e) => this.handleError(e));

    console.log('✓ Fullscreen manager initialized');
  }

  // Handle fullscreen state changes
  handleFullscreenChange() {
    const wasActive = this.isActive;
    this.isActive = !!(document.fullscreenElement || 
                      document.webkitFullscreenElement || 
                      document.mozFullScreenElement || 
                      document.msFullscreenElement);

    if (wasActive !== this.isActive) {
      if(window.BARCODE?.PauseMenu){window.BARCODE.PauseMenu.dirty=true;window.BARCODE.PauseMenu.fullscreenChoice=this.isActive;}
      console.log(`Fullscreen ${this.isActive ? 'entered' : 'exited'}`);
      
      if (this.isActive) {
        this.callbacks.enter.forEach(callback => callback());
      } else {
        this.callbacks.exit.forEach(callback => callback());
      }
    }
  }

  // Handle fullscreen errors
  handleError(event) {
    // Filter out empty/trusted events that don't contain useful information
    if (event && (Object.keys(event).length === 0 || (event.isTrusted && Object.keys(event).length === 1))) {
      // Skip logging empty/trusted events that are normal browser behavior
      return;
    }
    console.warn('Fullscreen error:', event);
    this.callbacks.error.forEach(callback => callback(event));
  }

  // Toggle fullscreen state
  toggle() {
    if (!this.isSupported) {
      console.warn('Fullscreen not supported');
      return false;
    }

    if (this.isActive) {
      return this.exit();
    } else {
      return this.enter();
    }
  }

  // Enter fullscreen
  enter() {
    if (!this.isSupported) {
      console.warn('Fullscreen not supported');
      return Promise.reject(new Error('Fullscreen not supported'));
    }

    if (this.isActive) {
      console.log('Already in fullscreen');
      return Promise.resolve();
    }

    const element = this.getTargetElement();
    if (!element) {
      return Promise.reject(new Error('Target element not found'));
    }

    const requestFullscreen = element.requestFullscreen || 
                            element.webkitRequestFullscreen || 
                            element.mozRequestFullScreen || 
                            element.msRequestFullscreen;

    if (!requestFullscreen) {
      return Promise.reject(new Error('Fullscreen request API not available'));
    }

    console.log('Requesting fullscreen...');
    return requestFullscreen.call(element).catch(error => {
      // Handle common errors gracefully
      if (error.name === 'NotAllowedError') {
        console.log('Fullscreen permission denied by user');
      } else if (error.name === 'NotSupportedError') {
        console.log('Fullscreen not supported on this element');
      } else if (error.name === 'TypeError' && error.message && error.message.includes('Permissions check failed')) {
        // Silently handle permissions check failures (common in some browsers)
        return Promise.resolve();
      } else if (error && error.message && !error.message.includes('Permissions check failed')) {
        console.warn('Fullscreen request failed:', error.message);
      } else if (error && !error.message) {
        // Skip logging empty error objects
        console.log('Fullscreen request failed - unable to determine specific error');
      }
      // Don't throw for permissions check failures
      if (error.name === 'TypeError' && error.message && error.message.includes('Permissions check failed')) {
        return Promise.resolve();
      }
      throw error;
    });
  }

  // Exit fullscreen
  exit() {
    if (!this.isSupported) {
      console.warn('Fullscreen not supported');
      return Promise.reject(new Error('Fullscreen not supported'));
    }

    if (!this.isActive) {
      console.log('Not in fullscreen');
      return Promise.resolve();
    }

    const exitFullscreen = document.exitFullscreen || 
                         document.webkitExitFullscreen || 
                         document.mozCancelFullScreen || 
                         document.msExitFullscreen;

    if (!exitFullscreen) {
      return Promise.reject(new Error('Fullscreen exit API not available'));
    }

    console.log('Exiting fullscreen...');
    return exitFullscreen.call(document).catch(error => {
      if (error && error.message) {
        console.warn('Fullscreen exit failed:', error.message);
      } else {
        console.log('Fullscreen exit failed - unable to determine specific error');
      }
      throw error;
    });
  }

  // Fullscreen the shared presentation root. The gameplay canvas is hidden
  // during the intro, and DOM overlays are not rendered as canvas children.
  // Keeping one stable root also covers requests that settle after startup
  // has already mounted the intro, and keeps title/retry UI visible on errors.
  getTargetElement() {
    return document.documentElement;
  }

  // Check if currently in fullscreen
  isFullscreen() {
    return this.isActive;
  }

  // Register event callbacks
  onEnter(callback) {
    this.callbacks.enter.push(callback);
  }

  onExit(callback) {
    this.callbacks.exit.push(callback);
  }

  onError(callback) {
    this.callbacks.error.push(callback);
  }

  // Remove callbacks
  removeCallback(callback) {
    ['enter', 'exit', 'error'].forEach(type => {
      const index = this.callbacks[type].indexOf(callback);
      if (index > -1) {
        this.callbacks[type].splice(index, 1);
      }
    });
  }
};

// Create global fullscreen manager instance
window.fullscreenManager = new window.FullscreenManager();

// Convenience global functions
window.toggleFullscreen = () => window.fullscreenManager.toggle();
window.enterFullscreen = () => window.fullscreenManager.enter();
window.exitFullscreen = () => window.fullscreenManager.exit();
window.isFullscreen = () => window.fullscreenManager.isFullscreen();
