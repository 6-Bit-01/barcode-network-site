// Player character controller for 6 Bit - MakkoEngine Integration
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/player.js',
  exports: ['Player', 'player'],
  dependencies: ['Vector2D', 'clamp', 'distance']
});

// These foot rows are measured from the recovered complete model frames.
// They retain the approved world-space sprite sizes while
// anchoring the lowest visible foot pixel to one canonical presentation line
// on every frame. Player.position.y is the historical physics anchor, always
// 72px above the visible foot-contact line. Keep that world-space contract
// separate from Makko's source-frame anchor compensation below.
// Run uses its registered source ground row on every cel; authored flight
// frames lift the visible boots slightly above it without moving collision feet.
const PLAYER_VISUAL_FOOT_OFFSET_Y = 72;
// The real sidewalk-to-awning rise is taller than the legacy physics-space
// gap. Scale every vertical jump term together so the route gains height while
// preserving the established takeoff/apex/landing timing.
const PLAYER_VERTICAL_TRAVERSAL_SCALE = 1;
const PLAYER_JUMP_GRAVITY = 1460;
const PLAYER_JUMP_POWER = 920;
const PLAYER_MIN_JUMP_HOLD_MS = 60;
const PLAYER_JUMP_CUT_MULTIPLIER = 0.48;
const PLAYER_COYOTE_MS = 100;
const PLAYER_BUFFER_MS = 120;
const PLAYER_AIR_ACCEL = 1700;
const PLAYER_AIR_DRAG = 420;
const PLAYER_DIRECTIONAL_AIR_SPEED = 350;
const PLAYER_STOMP_REBOUND = 560;
// Opaque cap crown, measured per existing jump frame (alpha > 180), inset
// three source pixels. Hands and empty sprite padding cannot cause a bump.
const PLAYER_JUMP_CROWN = Object.freeze([[127,85],[112,79],[102,67],[100,51],[98,54],[111,64],[114,84],[108,90],[109,106],[98,109],[104,105],[102,87],[102,66],[98,60],[95,51],[104,45],[104,51],[114,60],[102,75],[108,79],[112,81],[115,75],[113,72],[106,63],[100,51],[106,48],[104,51]]);
const PLAYER_ANIMATION_PRESENTATION = Object.freeze({"idle":{"animation":"6_bit_idle_idle","scale":0.6666666666666666,"anchorX":160,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308]},"walk":{"animation":"6_bit_walk_walk","scale":0.7171717171717171,"anchorX":144,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308]},"jump":{"animation":"6_bit_jump_jump","scale":0.7967479674796748,"anchorX":96,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308]},"rhythm":{"animation":"6_bit_r__h_mode_rhmode","scale":0.7843137254901961,"anchorX":96,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308]},"run":{"animation":"6_bit_run_run","scale":0.6045042570722329,"anchorX":256,"anchorY":512,"footRows":[514.0,512.0,508.0,513.0,505.2212630622444,510.0,511.0,504.0,506.0,504.1462971376647,499.96274420717856]}});
const PLAYER_RUN_FRAME_DURATIONS_MS = Object.freeze([60,60,60,60,60,50,50,50,50,50,50]);
// Generated from assets/level1-run-v2/calibration.json. Each immutable pose
// shares the native anchor/ground rows; draw reads the actual cel only.
const PLAYER_RUN_POSE_PRESENTATIONS = Object.freeze([
  [0.5799736495388669, 324.7, 37.41731444354491],
  [0.5867768595041322, 312.4, 34.71732450463007],
  [0.5850611376927166, 310.0, 34.116959128379534],
  [0.5833554200901139, 322.0, 36.88022164459586],
  [0.6081790549875655, 326.3, 38.5816335804672],
  [0.602683461117196, 315.4, 35.79939759036142],
  [0.6175645342312008, 311.4, 35.164868632780255],
  [0.6063360881542699, 328.1, 38.966371336586],
  [0.6100332594235033, 321.3, 37.41370729035876],
  [0.6137757947573897, 312.0, 35.22821635678238],
  [0.6045042570722329, 299.9, 32.09473330840526],
].map(([scale, headColumn, headOffsetXWorld]) => Object.freeze({
  ...PLAYER_ANIMATION_PRESENTATION.run, scale, headColumn, headOffsetXWorld
})));

window.Player = class Player {
  static get VISUAL_FOOT_OFFSET_Y() { return PLAYER_VISUAL_FOOT_OFFSET_Y; }
  static get GROUND_Y() { return 784; } // Feet at 856: middle of the painted sidewalk.

  constructor(x, y) {
    this.position = new window.Vector2D(x, y);
    
    // Fresh Level 1 entrance is requested by the lifecycle after the comic.
    // Construction and checkpoint restoration never start theatrical motion.
    this.isEntering = false;
    this.entranceElapsedMs = 0;
    this.entranceDuration = 0;
    this.entranceStartX = x;
    this.entranceTargetX = x;
    this.velocity = new window.Vector2D(0, 0);
    this.width = 86;  // Based on sprite dimensions
    this.height = 96; // Based on sprite dimensions
    this.speed = 300; // pixels per second
    this.runSpeed = 450;
    this.runHeld = false;
    this.airSpeed = PLAYER_DIRECTIONAL_AIR_SPEED;
    this.jumpPower = PLAYER_JUMP_POWER;
    this.jumpTime = 0;
    this.maxJumpTime = 200; // Max jump duration in ms
    this.health = 3;
    this.maxHealth = 3;
    this.grounded = false;
    this.facing = 1; // 1 for right, -1 for left
    
    // Animation states
    this.state = 'idle';
    this.animationTime = 0;
    
    // Jump animation tracking
    this.wasJumping = false; // Track if player was jumping in previous frame
    this.jumpAnimationStarted = false; // Track if jump animation was started for current jump
    
    // MakkoEngine sprite character
    this.sprite = null;
    this.currentAnimation = null;
    this.animationRef = null;
    this.spriteReady = false;
    
    // Initialize sprite character
    this.initSprite();
    
    this.invulnerable = false;
    
    // Control disable system (for collision knockback)
    this.controlsDisabled = false;
    this.controlsDisabledUntil = 0;
    
    // Damage invulnerability system
    this.invulnerableUntil = 0;
    
    // Wind effects (legacy visual helper; inactive)
    this.windEffects = [];
    this.lastWindEffectTime = 0;
    
    // Electrical arc system for rhythm mode
    this.electricalArcs = [];
    this.lastArcTime = 0;
    this.arcPulsePhase = 0;
    this.arcActive = false;
    this.primaryAttackAnimationMs = 0;
    this.afterimageMs = 0;
    this.cinematicPoseActive = false;
    this.coyoteTimerMs = 0;
    this.jumpBufferTimerMs = 0;
    this.jumpHeldMs = 0;
    this.jumpReleaseQueued = false;
    this.supportedSurfaceId = null;
  }

  update(deltaTime, allowMovement = true) {
    try {
      if (window.isPaused || window.gameState?.paused || window.BARCODE?.LevelDifficulty?.open) return;
      
      // Store movement permission flag
      this.allowMovement = allowMovement;
      
      const dt = deltaTime / 1000; // Convert to seconds
      const previousFootY = this.position.y;
      const previousX = this.position.x;
      this.contactSweep = { previousX, previousFootY: previousFootY + PLAYER_VISUAL_FOOT_OFFSET_Y };
      // The authored walk owns position until it reaches the normal spawn.
      // Ordinary physics/world clamping would pull an offscreen actor into view.
      if (this.isEntering) {
        this.updateEntranceAnimation(deltaTime);
        this.animationTime += Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
        this.updateSpriteAnimation(deltaTime);
        this.contactSweep.currentX = this.position.x;
        this.contactSweep.currentFootY = this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y;
        return;
      }
      const groundedAtStart = this.grounded;
      const descentAtStart = this.velocity.y;
      this.ceilingMotion = { head: this.getCeilingProbe(), rising: descentAtStart < 0, allowed: allowMovement && !this.isEntering };
      this.roofMotion = window.sector1Progression?.captureRoofActor?.(this);
      this.afterimageMs = Math.max(0, (this.afterimageMs || 0) - deltaTime);
      if (this.hudReaction) { this.hudReaction.remainingMs -= deltaTime; if (this.hudReaction.remainingMs <= 0) this.hudReaction = null; }
      if (this.isRhythmPlanted()) { this.velocity.x = 0; this.airInput = 0; }
      // Forced motion may unground a performance; never suspend gravity.
      if (!this.grounded && window.rhythmSystem?.isActive?.()) window.rhythmSystem.hideRhythmMode();
      
      if (this.jumpBufferTimerMs > 0) this.jumpBufferTimerMs = Math.max(0, this.jumpBufferTimerMs - deltaTime);
      if (this.grounded) this.coyoteTimerMs = PLAYER_COYOTE_MS;
      else this.coyoteTimerMs = Math.max(0, this.coyoteTimerMs - deltaTime);
      if (this.dropSurfaceId || this.dropSurfaceIds?.size) {
        this.dropSurfaceAgeMs += deltaTime;
        this.dropSurfaceIds ||= new Set([this.dropSurfaceId].filter(Boolean));
        for (const id of this.dropSurfaceIds) {
          const cleared = window.sector1Progression?.hasClearedDropSurface?.(this, id) ??
            this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y > this.dropSurfaceY + 260;
          if (cleared) this.dropSurfaceIds.delete(id);
        }
        if (!this.dropSurfaceIds.has(this.dropSurfaceId)) this.dropSurfaceId = null;
      }
      const jumpHeld = this.isJumpHeld();
      if (!jumpHeld) this.queueJumpRelease();
      if (!this.grounded && this.velocity.y < 0) this.jumpHeldMs += deltaTime;

      // Frame-rate-stable bounded substep physics. Sprite anchoring is solved
      // later by getVisualAnchor(); this block owns only locomotion.
      if (this.allowMovement) {
        let remaining = Math.max(0, deltaTime);
        while (remaining > 0) {
          const stepMs = Math.min(remaining, 1000 / 120);
          const step = stepMs / 1000;
          if (!this.grounded) {
            this.applyAirControlStep(step);
            this.velocity.y += PLAYER_JUMP_GRAVITY * step;
            this.velocity.y = Math.min(this.velocity.y, 1200);
            if (this.jumpReleaseQueued && this.jumpHeldMs >= PLAYER_MIN_JUMP_HOLD_MS && this.velocity.y < 0) {
              this.velocity.y *= PLAYER_JUMP_CUT_MULTIPLIER;
              this.jumpReleaseQueued = false;
            }
          } else {
            this.jumpTime = 0;
            this.jumpHeldMs = 0;
            this.jumpReleaseQueued = false;
          }
          this.position = this.position.add?.(this.velocity.multiply?.(step) || this.position);
          remaining -= stepMs;
        }
      }

      if (this.primaryAttackAnimationMs > 0) {
        this.primaryAttackAnimationMs = Math.max(0, this.primaryAttackAnimationMs - deltaTime);
      }
      
      // Bound horizontal travel before collision/camera consumers see it.
      window.sector1Progression?.applyGateCollision?.();

      // Boss landing uses the same swept physics anchors as stage geometry.
      // The mission owner bounds boss damage; ordinary enemy stomps stay lethal.
      if (this.allowMovement && window.sector1Progression?.applyBossStomp) {
        window.sector1Progression.applyBossStomp(this, { previousFootY, currentFootY: this.position.y, previousX });
      }

      if (this.allowMovement && !this.isEntering) {
        window.sector1Progression?.applyPlayerHeadContact?.(this);
        window.sector1Progression?.resolveLiftActor?.(this, this.roofMotion);
      }
      let landedOnStageSurface = false;
      if (window.sector1Progression && typeof window.sector1Progression.applyPlayerStageCollision === 'function') {
        landedOnStageSurface = window.sector1Progression.applyPlayerStageCollision(this, { previousFootY, currentFootY: this.position.y, previousX });
      }

      // One shared street anchor keeps feet, support and shadows together.
      // A dynamic stage surface may share the historical physics-ground
      // anchor (the Signal Lift does at its bottom stop). Once that surface
      // has accepted the landing it owns support for this frame; generic
      // ground must not immediately erase it.
      if (!landedOnStageSurface && this.position.y >= window.Player.GROUND_Y) {
        this.position.y = window.Player.GROUND_Y;
        this.velocity.y = 0;
        this.grounded = true;
        this.supportedSurfaceId = null;
      } else if (!landedOnStageSurface) {
        this.grounded = false;
        this.supportedSurfaceId = null;
      }
      if (!groundedAtStart && this.grounded) {
        this.jumpAnimationStarted = false;
        this.landingPoseMs = 90;
        window.audioSystem?.playCombatCue?.('land');
        window.particleSystem?.landingEffect?.(this.position.x, this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y);
        window.BARCODE?.combatFX?.movement('land', this, Math.max(0, descentAtStart));
      }
      this.stepFxMs = Math.max(0, (this.stepFxMs || 0) - deltaTime);
      if (this.grounded && Math.abs(this.velocity.x) > 100 && this.stepFxMs === 0) {
        this.stepFxMs = 135; window.BARCODE?.combatFX?.movement('step', this);
      }
      if (this.grounded) {
        this.bossReboundMs = 0;
        if (window.sector1Progression?.isBossCombatLive?.()) window.sector1Progression.boss.stompArmed = true;
      }
      
      if (this.grounded && this.jumpBufferTimerMs > 0 && this.velocity.y === 0) this.consumeBufferedJumpIfReady();
      // Side-scroller world boundaries (background is 4096px wide)
      const worldLeft = this.width/2;
      const worldRight = 4096 - this.width/2;
      this.position.x = window.clamp?.(this.position.x, worldLeft, worldRight) || this.position.x;
      this.position.y = window.clamp?.(this.position.y, -700, 1080 - this.height/2) ?? this.position.y;
      this.contactSweep.currentX = this.position.x;
      this.contactSweep.currentFootY = this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y;
      
      // Update animation
      this.animationTime += deltaTime;
      this.updateState();
      
      // Update sprite animation with proper deltaTime
      this.updateSpriteAnimation(deltaTime);
      if (this.allowMovement && !this.isEntering) {
        // Keep the real cap clear after the animation advances as well.
        window.sector1Progression?.applyPlayerHeadContact?.(this);
        window.sector1Progression?.resolveLiftActor?.(this, window.sector1Progression?.captureRoofActor?.(this));
      }
      
      this.trailMs = (this.trailMs || 0) + deltaTime;
      if (this.grounded && Math.abs(this.velocity.x) > 50 && this.allowMovement && !this.isRhythmPlanted()) {
        if (this.trailMs >= 45) {
          window.particleSystem?.trail?.(this.position.x - this.facing * 16, this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y, null, 2);
          this.trailMs %= 45;
        }
      } else this.trailMs = 0;
      // Update wind effects
      this.updateWindEffects(deltaTime);
      
      // Update electrical arcs during rhythm mode
      this.updateElectricalArcs(deltaTime);
      
    } catch (error) {
      console.error('Error updating player:', error?.message || error);
    }
  }

  updateState() {
    const oldState = this.state;
    
    const bossCinematicActive = !!(
      window.sector1Progression &&
      typeof window.sector1Progression.isBossCinematicActive === 'function' &&
      window.sector1Progression.isBossCinematicActive()
    );
    this.cinematicPoseActive = bossCinematicActive;

    // Read the mapped jump action for repeated jumps and buffered input.
    const upKeyHeld = this.isJumpHeld();
    
    // Detect new jump (was grounded, now airborne)
    const justStartedJumping = this.wasJumping === false && !this.grounded;
    if (justStartedJumping) {
      this.jumpAnimationStarted = false; // Force animation restart on new jump
      if (window.BARCODE_DEBUG_FRAME_OWNERSHIP) console.log('🦘 Character just left ground - jump animation will restart');
    }
    
    // Progression ends Rhythm Combat Mode at Jammer destruction while the
    // background beat clock continues. Presentation holds a neutral pose here.
    if (bossCinematicActive) {
      this.state = 'idle';
    // Airborne motion wins over stance; grounded modes own the performance pose.
    } else if (!this.grounded) {
      this.state = 'jump';
    } else if (window.hackingSystem?.isActive?.()) {
      this.state='hack';
    } else if (this.isRhythmPlanted() || this.primaryAttackAnimationMs > 0) {
      this.state = 'rhythm';
    } else if (Math.abs(this.velocity.x) > 5) {
      this.state = this.isRunActive() && Math.abs(this.velocity.x) > this.speed + 1 ? 'run' : 'walk';
    } else {
      this.state = 'idle';
    }
    
    // Update jump tracking
    this.wasJumping = !this.grounded;
    
    // Debug state changes (reduced logging)
    if (oldState !== this.state) {
      if (window.BARCODE_DEBUG_FRAME_OWNERSHIP) console.log(`🔄 Player state: ${oldState} → ${this.state} (upHeld: ${upKeyHeld}, newJump: ${justStartedJumping})`);
    }
  }


  startPrimaryAttackAnimation(durationMs = 180) {
    this.primaryAttackAnimationMs = Math.max(this.primaryAttackAnimationMs || 0, durationMs);
    this.state = 'rhythm';
    this.afterimageMs = 180;
    if (typeof this.playAnimation === 'function') this.playAnimation('rhythm');
  }

  getAnimationPresentation(state = this.state) {
    if (state === 'run') return PLAYER_RUN_POSE_PRESENTATIONS[Math.max(0, Math.trunc(this.animationRef?.currentFrame || 0)) % PLAYER_RUN_POSE_PRESENTATIONS.length];
    if(state==='hack')return PLAYER_ANIMATION_PRESENTATION.idle;
    return PLAYER_ANIMATION_PRESENTATION[state === 'idle' && this.grounded && this.landingPoseActive ? 'jump' : state] || PLAYER_ANIMATION_PRESENTATION.idle;
  }

  getMakkoRenderMetrics(presentation = this.getAnimationPresentation(), flipH = false) {
    // Makko has two anchor paths. A manifest anchor is multiplied by the final
    // frame scale before Character.draw subtracts it. Its legacy fallback
    // subtracts the source anchor unscaled even though the frame pixels still
    // scale. Read the active sheet so the inverse positioning below matches
    // the path the runtime will actually use instead of assuming one schema.
    const spriteSheet = this.sprite?.currentSprite || this.sprite?._currentSprite || null;
    const runtimeAnchor = typeof spriteSheet?.getAnchorPoint === 'function'
      ? spriteSheet.getAnchorPoint()
      : null;
    const hasRuntimeAnchorX = Number.isFinite(runtimeAnchor?.x);
    const hasRuntimeAnchorY = Number.isFinite(runtimeAnchor?.y);
    const hasRuntimeAnchor = hasRuntimeAnchorX || hasRuntimeAnchorY;
    const sourceAnchorX = hasRuntimeAnchorX
      ? runtimeAnchor.x
      : presentation.anchorX;
    const sourceAnchorY = hasRuntimeAnchorY
      ? runtimeAnchor.y
      : presentation.anchorY;

    let usesScaledAnchor = true;
    if (spriteSheet) {
      if (!hasRuntimeAnchor) {
        usesScaledAnchor = false;
      } else if (typeof spriteSheet.hasManifestAnchor === 'function') {
        usesScaledAnchor = !!spriteSheet.hasManifestAnchor();
      } else if (spriteSheet.manifestMetadata) {
        usesScaledAnchor = !!spriteSheet.manifestMetadata.anchor;
      } else {
        usesScaledAnchor = false;
      }
    }

    const reportedManifestScale = typeof spriteSheet?.getManifestScale === 'function'
      ? spriteSheet.getManifestScale()
      : spriteSheet?.manifestMetadata?.scale;
    const manifestScale = Number.isFinite(reportedManifestScale) && reportedManifestScale > 0
      ? reportedManifestScale
      : 1;
    const frameScale = presentation.scale * manifestScale;
    const anchorMultiplier = usesScaledAnchor ? frameScale : 1;
    const anchorOffsetX = spriteSheet && !hasRuntimeAnchorX ? 0 : sourceAnchorX * anchorMultiplier;
    const anchorOffsetY = spriteSheet && !hasRuntimeAnchorY ? 0 : sourceAnchorY * anchorMultiplier;

    return {
      sourceAnchorX,
      sourceAnchorY,
      hasRuntimeAnchor,
      hasRuntimeAnchorX,
      hasRuntimeAnchorY,
      usesScaledAnchor,
      manifestScale,
      frameScale,
      flipSignX: flipH ? -1 : 1,
      anchorOffsetX,
      anchorOffsetY
    };
  }

  getVisualAnchor(flipH = false) {
    const presentation = this.getAnimationPresentation();
    const frameCount = presentation.footRows.length;
    const rawFrame = Number.isFinite(this.animationRef?.currentFrame) ? this.animationRef.currentFrame : 0;
    const frameIndex = frameCount > 0 ? Math.max(0, Math.trunc(rawFrame)) % frameCount : 0;
    const footRow = presentation.footRows[frameIndex] ?? presentation.anchorY;
    const targetFootY = this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y;
    const render = this.getMakkoRenderMetrics(presentation, flipH);
    // Character.draw ultimately renders the visible foot at:
    // inputY - anchorOffsetY + footRow * frameScale. Solve that expression
    // backwards so both Makko anchor paths land on the same physics target.
    const drawY = targetFootY + render.anchorOffsetY - footRow * render.frameScale;
    // The same legacy mismatch affects X and is mirrored when flipH is active.
    // Keep the source anchor column on position.x in either facing direction.
    const drawX = Number.isFinite(presentation.headColumn)
      ? this.position.x + render.flipSignX * (presentation.headOffsetXWorld + render.anchorOffsetX - presentation.headColumn * render.frameScale)
      : this.position.x + render.flipSignX * (
      render.anchorOffsetX - render.sourceAnchorX * render.frameScale
    );

    return {
      x: drawX,
      y: drawY,
      scale: presentation.scale,
      anchorX: render.sourceAnchorX,
      anchorY: render.sourceAnchorY,
      footRow,
      frameIndex,
      targetFootY,
      manifestScale: render.manifestScale,
      frameScale: render.frameScale,
      usesScaledAnchor: render.usesScaledAnchor,
      flipSignX: render.flipSignX,
      anchorOffsetX: render.anchorOffsetX,
      anchorOffsetY: render.anchorOffsetY,
      visibleAnchorX: drawX + render.flipSignX * (
        render.sourceAnchorX * render.frameScale - render.anchorOffsetX
      ),
      visibleFootY: drawY - render.anchorOffsetY + footRow * render.frameScale
    };
  }

  // Initialize sprite character with MakkoEngine
  async initSprite() {
    try {
      console.log('Initializing 6_bit_main character...');
      
      // Check if we should use fallback graphics
      if (window.useFallbackGraphics) {
        console.log('Using fallback graphics - MakkoEngine not available');
        this.spriteReady = false;
        this.sprite = null;
        return;
      }
      
      // Wait for MakkoEngine to be available
      if (!window.MakkoEngine) {
        console.log('MakkoEngine not available - waiting...');
        setTimeout(() => this.initSprite(), 100);
        return;
      }
      
      // Wait for engine to be loaded
      if (!window.MakkoEngine.isLoaded()) {
        console.log('MakkoEngine still loading - waiting...');
        setTimeout(() => this.initSprite(), 100);
        return;
      }
      
      // Get the 6_bit_main character
      this.sprite = window.MakkoEngine.sprite('6_bit_main');
      
      if (!this.sprite) {
        console.error('❌ 6_bit_main character not found in manifest');
        this.spriteReady = false;
        return;
      }
      
      // Wait for character to be loaded
      if (!this.sprite.isLoaded()) {
        console.log('6_bit_main still loading - waiting...');
        setTimeout(() => this.initSprite(), 100);
        return;
      }
      
      console.log('✓ 6_bit_main character loaded successfully');
      const animations = this.sprite.getAvailableAnimations();
      console.log('Available animations:', animations);
      
      this.spriteReady = true;
      this.currentAnimation = null;
      
      // Start with idle animation
      this.playAnimation('idle');
      console.log('✓ Initial idle animation started');
      
    } catch (error) {
      console.error('Error initializing sprite:', error?.message || error);
      this.spriteReady = false;
      this.sprite = null;
    }
  }

  // One frame-owned transition path. Repeated requests for the same clip
  // preserve its progress; new jumps explicitly restart the jump clip.
  getAnimationPlaybackRate(state = this.state) {
    if (state === 'run') return Math.max(0.3, Math.min(2, Math.abs(this.velocity.x) / this.runSpeed));
    if (state === 'walk') {
      // The accepted sixteen-pose stride is one second at normal walking
      // speed. Entrance travel and ordinary locomotion share that cadence;
      // changes in velocity adjust progress without restarting the clip.
      return Math.max(0.3, Math.min(2, Math.abs(this.velocity.x) / this.speed));
    }
    if (state === 'rhythm') {
      // About sixteen cels form each headbang in the complete native take.
      // Fit that gesture into two quarter beats of the existing song clock.
      const beatMs = window.rhythmSystem?.beatInterval;
      return Number.isFinite(beatMs) && beatMs > 0
        ? Math.max(0.75, Math.min(2, 16 * 83 / (beatMs * 2))) : 1.6;
    }
    return state === 'idle' ? 0.85 : 1;
  }

  updateSpriteAnimation(deltaTime) {
    const landingMs = this.landingPoseMs || 0;
    const landing = !this.cinematicPoseActive && this.state === 'idle' && this.grounded && landingMs > 0;
    this.landingPoseActive = landing;
    // Recovery belongs to the game clock, even if the host sprite is absent
    // or fails. An animation error must never latch the landing pose.
    this.landingPoseMs = Math.max(0, landingMs - deltaTime);
    const held = (this.impactHoldMs || 0) > 0;
    this.impactHoldMs = Math.max(0, (this.impactHoldMs || 0) - deltaTime);
    if (!this.spriteReady || !this.sprite) return;
    try {
      // The existing jump frames cover takeoff, tuck, descent and recovery.
      // Makko's currentFrame is read-only. Select through play's startFrame;
      // phase-controlled clips do not also advance on the sprite clock.
      let frame = null;
      if(this.state==='hack') {
        // A deliberate open-hand stance replaces the headbang while solving.
        // Reuse approved character frames; gesture timing stays at player speed.
        const h=window.hackingSystem,age=h?.sessionElapsedMs||0;
        frame=Math.min(25,Math.floor(age/45));
        if(age>=1170)frame=20+Math.floor((1+Math.sin(age/180))*2);
        if(window.BARCODE?.combatFX?.hackDeflectMs>0)frame=8;
      }
      if (this.state === 'jump' && !this.cinematicPoseActive && !held) {
        const vy = this.velocity.y;
        frame = vy < -160 ? Math.min(8, 4 + Math.floor((920 + vy) / 180))
          : vy < 160 ? 9 + Math.floor((vy + 160) / 80) : Math.min(16, 13 + Math.floor((vy - 160) / 230));
      }
      if (landing && !held) frame = Math.min(26, 17 + Math.floor((90 - landingMs) / 9));
      this.playAnimation(landing ? 'jump' : this.state, frame);
      if (!held && frame === null) {
        // Cinematics freeze his position, not his living neutral stance.
        // Jump/hack/landing poses remain selected by their physical phases.
        const playbackDelta = deltaTime * this.getAnimationPlaybackRate();
        if (window.BARCODE?.SpritePlayback) window.BARCODE.SpritePlayback.update(this.sprite, playbackDelta);
        else this.sprite.update(playbackDelta);
      }
    } catch (error) {
      console.error('Error updating sprite animation:', error?.message || error);
    }
  }

  playAnimation(animationName, frame = null) {
    if (!this.spriteReady || !this.sprite) return;
    const fullName = PLAYER_ANIMATION_PRESENTATION[animationName==='hack'?'idle':animationName]?.animation || animationName;
    const freshJump = animationName === 'jump' && !this.jumpAnimationStarted;
    const sameClip = this.currentAnimation === fullName && this.sprite.getCurrentAnimation?.() === fullName;
    const sameFrame = frame === null || this.animationRef?.currentFrame === frame;
    if (sameClip && sameFrame && this.animationRef && !this.animationRef.isInterrupted && !freshJump) return;
    try {
      let startFrame = frame === null ? 0 : Math.max(0, frame);
      let phaseRemainderMs = 0;
      // A speed change keeps the foot-cycle phase instead of snapping back to
      // contact. Walking repeats its sixteen-pose gait four times; the run is
      // one complete cycle. Jump/landing/entrance keep their authored starts.
      if (frame === null && this.animationRef && !this.animationRef.isInterrupted) {
        const fromWalk = this.currentAnimation === PLAYER_ANIMATION_PRESENTATION.walk.animation && animationName === 'run';
        const fromRun = this.currentAnimation === PLAYER_ANIMATION_PRESENTATION.run.animation && animationName === 'walk' && !this.isEntering;
        if (fromWalk || fromRun) {
          const sourceCount = fromWalk ? 16 : PLAYER_RUN_FRAME_DURATIONS_MS.length;
          const previousFrame = Math.max(0, Math.trunc(this.animationRef.currentFrame || 0)) % sourceCount;
          let sourceMs = Math.max(0, this.sprite.currentSprite?.timeAccumulator || 0);
          for (let i = 0; i < previousFrame; i++) sourceMs += fromWalk ? 62.5 : PLAYER_RUN_FRAME_DURATIONS_MS[i];
          let targetMs = (sourceMs % (fromWalk ? 1000 : 600)) / (fromWalk ? 1000 : 600) * (fromWalk ? 600 : 1000);
          startFrame = 0;
          const targetCount = fromWalk ? PLAYER_RUN_FRAME_DURATIONS_MS.length : 16;
          while (startFrame < targetCount - 1 && targetMs >= (fromWalk ? PLAYER_RUN_FRAME_DURATIONS_MS[startFrame] : 62.5) - 1e-7) {
            targetMs -= fromWalk ? PLAYER_RUN_FRAME_DURATIONS_MS[startFrame] : 62.5;
            startFrame++;
          }
          phaseRemainderMs = Math.max(0, targetMs);
        }
      }
      this.sprite.stop();
      this.animationRef = this.sprite.play(fullName, true, startFrame);
      if (phaseRemainderMs > 0) window.BARCODE?.SpritePlayback?.update(this.sprite, phaseRemainderMs);
      this.currentAnimation = fullName;
      if (animationName === 'jump') this.jumpAnimationStarted = true;
    } catch (error) {
      console.error('Error playing animation:', error?.message || error);
    }
  }

  isRhythmPlanted() {
    return this.grounded && !!window.rhythmSystem?.isActive?.();
  }

  setRunHeld(held) { this.runHeld = !!held; }

  isRunActive() {
    return this.runHeld && this.grounded && this.allowMovement && !this.isEntering && !this.controlsDisabled &&
      !window.isPaused && !window.gameState?.paused && !window.BARCODE?.LevelDifficulty?.open &&
      !this.isRhythmPlanted() && !window.hackingSystem?.isActive?.() && !window.sector1Progression?.isGameplaySuppressed?.();
  }

  getGroundMoveSpeed() { return this.isRunActive() ? this.runSpeed : this.speed; }

  moveLeft() {
    if (this.isRhythmPlanted()) { this.velocity.x = 0; this.airInput = 0; return; }
    if (this.isEntering || !this.allowMovement) { return; }
    this.facing = -1;
    if (this.grounded) this.velocity.x = -this.getGroundMoveSpeed();
    else this.airInput = -1;

  }

  moveRight() {
    if (this.isRhythmPlanted()) { this.velocity.x = 0; this.airInput = 0; return; }
    if (this.isEntering || !this.allowMovement) { return; }
    this.facing = 1;
    if (this.grounded) this.velocity.x = this.getGroundMoveSpeed();
    else this.airInput = 1;

  }

  stopHorizontal() {
    if (this.isEntering || !this.allowMovement) { return; }
    if (this.grounded) this.velocity.x = 0;
    else this.airInput = 0;
    // Keep facing direction - don't change when stopping
  }

  dropThrough() {
    if (!this.grounded || !this.supportedSurfaceId || this.isEntering || !this.allowMovement || this.controlsDisabled) return false;
    if (window.sector1Progression?.isGameplaySuppressed?.() || window.isPaused || window.gameState?.paused) return false;
    this.dropSurfaceId = this.supportedSurfaceId;
    // Closely stacked slabs can still surround the cap when the feet reach
    // the next support. A fresh drop preserves only those already crossed.
    this.dropSurfaceIds ||= new Set();
    this.dropSurfaceIds.add(this.dropSurfaceId);
    this.dropSurfaceY = this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y;
    this.dropSurfaceAgeMs = 0;
    this.supportedSurfaceId = null;
    this.grounded = false;
    this.position.y += 2;
    this.velocity.y = 100;
    this.coyoteTimerMs = 0;
    this.jumpBufferTimerMs = 0;
    this.jumpHeldMs = 0;
    this.jumpReleaseQueued = false;
    this.jumpAnimationStarted = false;
    window.rhythmSystem?.hideRhythmMode?.();
    return true;
  }
  isDroppingThrough(id) { return !!id && (this.dropSurfaceId === id || !!this.dropSurfaceIds?.has(id)); }

  jump() {
    if (this.isRhythmPlanted()) return false;
    if (this.isEntering || !this.allowMovement) { return false; }
    this.jumpBufferTimerMs = PLAYER_BUFFER_MS;
    if (this.grounded || this.coyoteTimerMs > 0) {
      this.velocity.y = -this.jumpPower;
      this.grounded = false;
      this.supportedSurfaceId = null;
      this.coyoteTimerMs = 0;
      this.jumpBufferTimerMs = 0;
      this.jumpHeldMs = 0;
      this.jumpReleaseQueued = false;
      this.jumpTime = 0; // Reset jump timer
      
      // CRITICAL FIX: Always reset jump animation tracking for new jump
      // This ensures the animation restarts every time jump() is called
      this.jumpAnimationStarted = false;
      
      // Jump particles moved way down and toward front
      if (window.particleSystem) {
        // Move particles 12px toward front of player (same as movement trail)
        const jumpX = this.position.x + this.facing * 12;
        window.particleSystem.jumpEffect(jumpX, this.getVisualAnchor().targetFootY, null);
      }
      window.audioSystem?.playCombatCue?.('jump');
      window.BARCODE?.combatFX?.movement('jump', this);
      return true;
    }
    return false;
  }

  isJumpHeld() { const action = window.inputManager?.actionInput?.state?.jump; if (action && typeof action.held === 'boolean') return action.held; return !!(window.inputManager && (window.inputManager.isKey?.('arrowup') || window.inputManager.isKey?.('w') || window.inputManager.isKey?.(' '))); }

  applyAirControlStep(step) {
    if (this.bossReboundMs > 0) {
      this.bossReboundMs = Math.max(0, this.bossReboundMs - step * 1000);
      this.velocity.x = this.bossReboundDirection * 360;
      return;
    }
    const input = Number.isFinite(this.airInput) ? this.airInput : 0;
    if (input) this.velocity.x = window.clamp ? window.clamp(this.velocity.x + input * PLAYER_AIR_ACCEL * step, -this.airSpeed, this.airSpeed) : Math.max(-this.airSpeed, Math.min(this.airSpeed, this.velocity.x + input * PLAYER_AIR_ACCEL * step));
    else { const drag = PLAYER_AIR_DRAG * step; this.velocity.x = Math.abs(this.velocity.x) <= drag ? 0 : this.velocity.x - Math.sign(this.velocity.x) * drag; }
  }

  consumeBufferedJumpIfReady() { if (this.jumpBufferTimerMs > 0 && this.grounded) return this.jump(); return false; }

  queueJumpRelease() { this.jumpReleaseQueued = true; }

  stompRebound(bossDirection = 0) {
    window.rhythmSystem?.hideRhythmMode?.();
    this.afterimageMs = 220;
    this.jumpAnimationStarted = false;
    this.velocity.y = -PLAYER_STOMP_REBOUND; this.grounded = false; this.coyoteTimerMs = 0; this.jumpBufferTimerMs = 0; this.jumpHeldMs = 0; this.jumpReleaseQueued = false;
    this.bossReboundDirection = Math.sign(bossDirection);
    this.bossReboundMs = bossDirection ? 260 : 0;
    if (bossDirection) this.velocity.x = this.bossReboundDirection * 360;
  }

  dash() {
    // Dash ability removed - no longer available, but the action route is intentionally recognized.
    return false;
  }

  // Perform rhythm attack
  rhythmAttack() {
    console.log('🎵 rhythmAttack() called - forcing rhythm animation');
    this.playAnimation('rhythm');
  }
  
  // CRITICAL FIX: Force animation reset to prevent stuck walk animations
  forceAnimationReset() {
    console.log('🔄 Forcing animation state reset');
    
    // Clear current animation to force fresh start
    this.currentAnimation = null;
    if (this.sprite) {
      this.sprite.stop();
    }
    this.animationRef = null;
    
    // Reset jump animation tracking
    this.jumpAnimationStarted = false;
    
    // Force immediate state update to determine correct animation
    this.updateState();
    
    // Play the correct animation for the current state
    if (this.state && this.spriteReady) {
      const landing = !this.cinematicPoseActive && this.state === 'idle' && this.grounded && this.landingPoseMs > 0;
      this.landingPoseActive = landing;
      this.playAnimation(landing ? 'jump' : this.state);
    }
  }
  
  // DEBUG: Force rhythm animation for testing
  forceRhythmAnimation() {
    console.log('🔧 DEBUG: forceRhythmAnimation() called');
    this.state = 'rhythm';
    this.playAnimation('rhythm');
  }

  takeDamage(amount, sourcePosition = null) {
    // Check if player is currently invulnerable from recent damage
    const currentTime = Date.now();
    if (this.isDamageInvulnerable(currentTime)) return false;
    
    const previousHealth = this.health;
    this.health = Math.max(0, this.health - amount);
    window.BARCODE?.Campaign?.damage(previousHealth - this.health);
    if (this.health < previousHealth) this.hudReaction = { kind: 'hurt', remainingMs: 750 };
    window.BARCODE?.combatFX?.playerDamaged(this, previousHealth, sourcePosition);
    
    // CRITICAL: Play player damage sound
    if (window.audioSystem && typeof window.audioSystem.playPlayerDamageSound === 'function') {
      window.audioSystem.playPlayerDamageSound();
      console.log('💥 Playing player damage sound');
    }
    
    // CRITICAL: Create damage particles
    if (window.particleSystem && typeof window.particleSystem.damageEffect === 'function') {
      window.particleSystem.damageEffect(this.position.x, this.position.y - 50, null, 15);
      console.log('💥 Creating player damage particles');
    }
    
    // CRITICAL: Deactivate rhythm mode when hit
    if (window.rhythmSystem && window.rhythmSystem.isActive()) {
      console.log('💥 Player hit - deactivating rhythm mode');
      window.BARCODE?.playerCombat?.notifyRhythmLost?.();
      window.rhythmSystem.hide();
      window.rhythmSystem.stop();
    }
    
    // CRITICAL: Deactivate hack mode when hit
    if (window.hackingSystem && window.hackingSystem.isActive()) {
      console.log('💥 Player hit - deactivating hack mode');
      window.hackingSystem.cancel({ restoreRhythm: false });
    }
    
    this.primaryAttackAnimationMs = 0;
    this.afterimageMs = 0;
    // CRITICAL FIX: Force animation state reset after taking damage
    // This prevents walk animations from getting stuck when hit while holding arrow keys
    this.forceAnimationReset();
    
    // Play hurt animation if available
    // this.playAnimation('hurt'); // Not in current sprite set
    
    // Set invulnerability for 2 seconds after taking damage
    this.invulnerableUntil = currentTime + 2000;
    
    // Also set the old invulnerable flag for visual effects
    this.invulnerable = true;
    setTimeout(() => {
      if (this) {
        this.invulnerable = false;
      }
    }, 2000); // 2 seconds of invulnerability for visual effects
    return true;
  }

  isDamageInvulnerable(now = Date.now()) {
    return this.isEntering || !!(this.invulnerableUntil && now < this.invulnerableUntil);
  }
  
  takeDamageWithKnockback(amount, knockbackX, knockbackY, enemyPosition = null) {
    // Check if player is currently invulnerable from recent damage
    const currentTime = Date.now();
    if (this.isDamageInvulnerable(currentTime)) return false;
    this.bossReboundMs = 0;
    
    const previousHealth = this.health;
    this.health = Math.max(0, this.health - amount);
    window.BARCODE?.Campaign?.damage(previousHealth - this.health);
    if (this.health < previousHealth) this.hudReaction = { kind: 'hurt', remainingMs: 750 };
    // The source is authoritative when supplied; otherwise the horizontal
    // impulse identifies the side the blow came from without using facing.
    const sourcePosition = enemyPosition || (knockbackX ? { x: this.position.x - Math.sign(knockbackX), y: this.position.y } : null);
    window.BARCODE?.combatFX?.playerDamaged(this, previousHealth, sourcePosition);
    
    // Apply directional knockback
    this.velocity.x = knockbackX;
    this.velocity.y = knockbackY;
    
    // CRITICAL FIX: Face the enemy that damaged you, not the knockback direction
    if (enemyPosition) {
      // Face toward the enemy that hit you
      const dx = enemyPosition.x - this.position.x;
      this.facing = dx > 0 ? 1 : -1;
      console.log(`👊 Player hit by enemy at (${enemyPosition.x.toFixed(0)}, ${enemyPosition.y.toFixed(0)}) - facing enemy (${this.facing === 1 ? 'right' : 'left'})`);
    } else {
      // Fallback: use knockback direction if no enemy position
      if (knockbackX > 0) {
        this.facing = 1; // Knocked right, face right
      } else if (knockbackX < 0) {
        this.facing = -1; // Knocked left, face left
      }
    }
    
    // CRITICAL: Play player damage sound
    if (window.audioSystem && typeof window.audioSystem.playPlayerDamageSound === 'function') {
      window.audioSystem.playPlayerDamageSound();
      console.log('💥 Playing player damage sound with knockback');
    }
    
    // CRITICAL: Create enhanced damage particles for knockback
    if (window.particleSystem && typeof window.particleSystem.damageEffect === 'function') {
      // Create damage particles at impact point
      window.particleSystem.damageEffect(this.position.x, this.position.y - 50, null, 15);
      
      // Create directional knockback particles
      const particleCount = 8;
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const speed = 100 + Math.random() * 100;
        const particleX = this.position.x + Math.cos(angle) * 20;
        const particleY = this.position.y - 50 + Math.sin(angle) * 20;
        
        if (window.particleSystem.particles) {
          window.particleSystem.particles.push(new window.Particle(
            particleX,
            particleY,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed - 50, // Upward bias
            '#ff6600', // Orange color for knockback
            3 + Math.random() * 3,
            500 + Math.random() * 300,
            'circle'
          ));
        }
      }
      console.log('💥 Creating enhanced knockback particles');
    }
    
    // CRITICAL: Deactivate rhythm mode when hit
    if (window.rhythmSystem && window.rhythmSystem.isActive()) {
      console.log('💥 Player hit - deactivating rhythm mode');
      window.BARCODE?.playerCombat?.notifyRhythmLost?.();
      window.rhythmSystem.hide();
      window.rhythmSystem.stop();
    }
    
    // CRITICAL: Deactivate hack mode when hit
    if (window.hackingSystem && window.hackingSystem.isActive()) {
      console.log('💥 Player hit - deactivating hack mode');
      window.hackingSystem.cancel({ restoreRhythm: false });
    }
    
    this.primaryAttackAnimationMs = 0;
    this.afterimageMs = 0;
    // CRITICAL FIX: Force animation state reset after taking damage with knockback
    // This prevents walk animations from getting stuck when hit while holding arrow keys
    this.forceAnimationReset();
    
    // Disable controls briefly during knockback
    this.controlsDisabled = true;
    this.controlsDisabledUntil = currentTime + 400;
    
    setTimeout(() => {
      if (this) {
        this.controlsDisabled = false;
      }
    }, 400);
    
    // Set invulnerability for 2 seconds after taking damage
    this.invulnerableUntil = currentTime + 2000;
    
    // Also set the old invulnerable flag for visual effects
    this.invulnerable = true;
    setTimeout(() => {
      if (this) {
        this.invulnerable = false;
      }
    }, 2000); // 2 seconds of invulnerability for visual effects
    
    console.log(`💥 Player took ${amount} damage with knockback: (${knockbackX.toFixed(0)}, ${knockbackY.toFixed(0)})`);
    return true;
  }

  // Create wind effect particles for fast-fall
  createWindEffect() {
    // Calculate sprite bottom position (feet)
    const spriteBottom = this.position.y;
    
    // Create wind particles in tornado spiral pattern
    const particleCount = 3;
    
    for (let i = 0; i < particleCount; i++) {
      // Tornado spiral angles - flowing upward in a spiral
      const spiralAngle = (Date.now() / 200 + i * Math.PI * 2 / 3) % (Math.PI * 2); // Rotating spiral
      const tornadoRadius = 20 + Math.random() * 15; // Radius from center
      
      // Start from feet position in circular pattern
      const startX = this.position.x + Math.cos(spiralAngle) * tornadoRadius;
      const startY = spriteBottom;
      
      // Upward spiral velocity
      const upwardSpeed = -200 - Math.random() * 100; // Strong upward force
      const spiralSpeed = 150 + Math.random() * 50; // Spiral rotation speed
      
      this.windEffects.push({
        x: startX,
        y: startY,
        vx: Math.cos(spiralAngle + Math.PI/2) * spiralSpeed, // Tangential velocity for spiral
        vy: upwardSpeed, // Strong upward velocity
        life: 1.0,
        decay: 0.012, // Slower decay for longer-lasting effect
        size: 6 + Math.random() * 3,
        color: 'rgba(150, 200, 255, 0.6)', // Light blue wind color
        spiralAngle: spiralAngle, // Track spiral position
        tornadoRadius: tornadoRadius // Track radius for spiral motion
      });
    }
  }
  
  // Update wind effects
  updateWindEffects(deltaTime) {
    const dt = deltaTime / 1000;
    const currentTime = Date.now();
    
    this.windEffects = this.windEffects.filter(particle => {
      // Update spiral angle for tornado effect
      particle.spiralAngle = (particle.spiralAngle + dt * 4) % (Math.PI * 2); // Faster rotation
      
      // Calculate distance traveled upward from spawn point
      const upwardDistance = this.position.y - particle.y;
      
      // Tornado shape: start narrow at feet, expand dramatically as it rises
      // Use exponential expansion for classic tornado shape
      const expansionFactor = 1 + (upwardDistance / 50); // Expand more as it gets higher
      const currentRadius = particle.tornadoRadius * expansionFactor;
      
      // Calculate spiral position with expanding radius
      const centerX = this.position.x;
      particle.x = centerX + Math.cos(particle.spiralAngle) * currentRadius;
      particle.y = particle.y + particle.vy * dt; // Upward movement
      
      // Add chaotic wobble for more realistic tornado effect
      const wobbleAmount = expansionFactor * 5; // More wobble as it expands
      const wobbleX = Math.sin(currentTime / 50 + particle.spiralAngle * 3) * wobbleAmount;
      const wobbleY = Math.cos(currentTime / 70 + particle.spiralAngle * 2) * wobbleAmount * 0.3;
      particle.x += wobbleX;
      particle.y += wobbleY;
      
      // Accelerate expansion as particle rises (dissipation effect)
      particle.vx += Math.cos(particle.spiralAngle) * 100 * dt; // Outward acceleration
      
      particle.life -= particle.decay;
      
      // Rapid fade out as tornado expands and dissipates
      particle.opacity = particle.life * 0.6 * Math.max(0.2, 1 - expansionFactor * 0.15);
      
      // Particles grow smaller as they dissipate
      particle.currentSize = particle.size * Math.max(0.3, 1 - expansionFactor * 0.1);
      
      return particle.life > 0 && particle.y > -200; // Remove when far off-screen
    });
  }
  
  // Update electrical arcs during rhythm mode
  updateElectricalArcs(deltaTime) {
    if (window.BARCODE?.combatFX) { this.electricalArcs.length = 0; this.arcActive = false; return; }
    const dt = deltaTime / 1000;
    const currentTime = Date.now();
    
    // Check if rhythm mode is active
    const rhythmActive = window.rhythmSystem && window.rhythmSystem.isActive();
    
    if (rhythmActive) {
      // Activate electrical arcs during rhythm mode
      if (!this.arcActive) {
        this.arcActive = true;
        console.log('⚡ Electrical arcs activated for rhythm mode');
      }
      
      // Update pulse phase
      this.arcPulsePhase += dt * 3; // Pulse speed
      
      // Generate new arcs based on beat timing
      if (window.rhythmSystem && window.rhythmSystem.lastBeatTime > 0) {
        const timeSinceBeat = currentTime - window.rhythmSystem.lastBeatTime;
        const beatInterval = window.rhythmSystem.beatInterval;
        
        // Create arcs on beat and during attack windows - more erratic timing
        if (timeSinceBeat < 50 || (window.rhythmSystem.attackWindows && window.rhythmSystem.attackWindows.active)) {
          // Much more erratic arc generation during beats
          const beatInterval = 15 + Math.random() * 25; // 15-40ms random interval
          if (currentTime - this.lastArcTime > beatInterval) {
            // Sometimes create multiple bursts for extra chaos
            const burstCount = Math.random() < 0.3 ? 2 : 1;
            for (let i = 0; i < burstCount; i++) {
              this.createElectricalArc();
            }
            this.lastArcTime = currentTime;
          }
        } else {
          // Much more erratic normal arc generation
          const normalInterval = 50 + Math.random() * 100; // 50-150ms random interval
          if (currentTime - this.lastArcTime > normalInterval) {
            this.createElectricalArc();
            this.lastArcTime = currentTime;
          }
        }
      }
    } else {
      // Deactivate arcs when not in rhythm mode
      if (this.arcActive) {
        this.arcActive = false;
        console.log('⚡ Electrical arcs deactivated');
      }
    }
    
    // Update existing arcs
    this.electricalArcs = this.electricalArcs.filter(arc => {
      // Update arc animation
      arc.life -= dt * 2; // Arcs fade over 0.5 seconds
      arc.phase += dt * 8; // Fast electrical animation
      
      // Calculate arc intensity based on beat timing
      if (rhythmActive && window.rhythmSystem && window.rhythmSystem.lastBeatTime > 0) {
        const timeSinceBeat = currentTime - window.rhythmSystem.lastBeatTime;
        arc.beatIntensity = Math.max(0, 1 - (timeSinceBeat / 200)); // Pulse on beat
      } else {
        arc.beatIntensity = 0;
      }
      
      return arc.life > 0;
    });
  }
  
  // Create electrical arc
  createElectricalArc() {
    // Attack radius matches rhythm mode attack range (300 pixels from enemies.js)
    const attackRadius = 300;
    const numArcs = 8 + Math.floor(Math.random() * 8); // 8-16 arcs per burst (more erratic)
    
    for (let i = 0; i < numArcs; i++) {
      // Much more erratic arc generation
      const angle = Math.random() * Math.PI * 2;
      const arcLength = attackRadius * (0.3 + Math.random() * 1.2); // Much more varied arc length (30% to 150%)
      
      // Add extreme randomness to starting points
      const startOffset = 10 + Math.random() * 40; // Random start distance from body
      const startX = this.position.x + Math.cos(angle) * startOffset + (Math.random() - 0.5) * 30;
      const startY = this.position.y - 50 + Math.sin(angle) * startOffset + (Math.random() - 0.5) * 30;
      
      // Add randomness to end points
      const endWobble = (Math.random() - 0.5) * 60;
      const endX = this.position.x + Math.cos(angle) * arcLength + endWobble;
      const endY = this.position.y - 50 + Math.sin(angle) * arcLength + endWobble;
      
      // Create wildly erratic lightning bolt path
      const segments = [];
      const numSegments = 3 + Math.floor(Math.random() * 8); // 3-10 segments for more chaos
      
      for (let j = 0; j <= numSegments; j++) {
        const t = j / numSegments;
        const baseX = startX + (endX - startX) * t;
        const baseY = startY + (endY - startY) * t;
        
        // Much more chaotic offset calculations
        let offsetX = 0, offsetY = 0;
        if (j > 0 && j < numSegments) {
          const chaosFactor = 20 + Math.random() * 60; // Much larger offsets
          offsetX = (Math.random() - 0.5) * chaosFactor;
          offsetY = (Math.random() - 0.5) * chaosFactor;
          
          // Add directional bias for more natural lightning
          const lightningAngle = Math.atan2(endY - startY, endX - startX);
          offsetX += Math.cos(lightningAngle + Math.PI/2) * offsetY * 0.3;
          offsetY += Math.sin(lightningAngle + Math.PI/2) * offsetX * 0.3;
        }
        
        segments.push({
          x: baseX + offsetX,
          y: baseY + offsetY
        });
      }
      
      this.electricalArcs.push({
        segments: segments,
        life: 0.5 + Math.random() * 1.0, // More varied lifespans
        phase: Math.random() * Math.PI * 2,
        beatIntensity: 1.0,
        thickness: 1 + Math.random() * 4, // Much more varied thickness (1-5)
        color: this.getArcColor(),
        flickerSpeed: 0.5 + Math.random() * 2 // Add flicker variation
      });
    }
  }
  
  // Get electrical arc color (varies with intensity)
  getArcColor() {
    const colors = [
      { r: 100, g: 150, b: 255 }, // Light blue
      { r: 150, g: 200, b: 255 }, // Bright blue
      { r: 200, g: 220, b: 255 }, // Very light blue
      { r: 50, g: 100, b: 255 }   // Deep blue
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  // Draw electrical arcs
  drawElectricalArcs(ctx) {
    if (!this.arcActive || this.electricalArcs.length === 0) {
      return;
    }
    
    ctx.save();
    
    this.electricalArcs.forEach(arc => {
      // Much more erratic opacity with flicker
      const flicker = Math.sin(Date.now() * arc.flickerSpeed / 100) * 0.3;
      const opacity = arc.life * 0.8 * (0.7 + flicker);
      const pulseFactor = 0.5 + Math.sin(arc.phase * 3) * 0.5; // Faster, more erratic pulsing
      const beatBoost = 1 + arc.beatIntensity * 0.5; // Brighter on beats
      
      // Draw main arc segments
      ctx.strokeStyle = `rgba(${arc.color.r}, ${arc.color.g}, ${arc.color.b}, ${opacity})`;
      ctx.lineWidth = arc.thickness * pulseFactor * beatBoost;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      arc.segments.forEach((segment, index) => {
        if (index === 0) {
          ctx.moveTo(segment.x, segment.y);
        } else {
          ctx.lineTo(segment.x, segment.y);
        }
      });
      ctx.stroke();
      
      // Draw glow effect
      ctx.strokeStyle = `rgba(${arc.color.r}, ${arc.color.g}, ${arc.color.b}, ${opacity * 0.3})`;
      ctx.lineWidth = arc.thickness * 3 * pulseFactor * beatBoost;
      ctx.stroke();
      
      // Draw bright core
      ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.6})`;
      ctx.lineWidth = arc.thickness * 0.5 * pulseFactor;
      ctx.stroke();
      
      // Draw much more erratic electrical particles
      arc.segments.forEach((segment, index) => {
        if (index > 0 && Math.random() < 0.6) { // More frequent particles
          const particleSize = 0.5 + Math.random() * 4; // More varied size
          const particleOpacity = opacity * pulseFactor * (0.5 + Math.random() * 0.5);
          
          ctx.fillStyle = `rgba(${arc.color.r}, ${arc.color.g}, ${arc.color.b}, ${particleOpacity})`;
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, Math.max(0, particleSize), 0, Math.PI * 2);
          ctx.fill();
          
          // Particle glow
          ctx.fillStyle = `rgba(255, 255, 255, ${particleOpacity * 0.5})`;
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, Math.max(0, particleSize * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
    
    ctx.restore();
  }

  // Get appropriate alpha value based on invincibility type
  getInvincibilityAlpha() {
    const currentTime = Date.now();
    
    // Check for damage invulnerability (fast flashing)
    if (this.invulnerableUntil && currentTime < this.invulnerableUntil) {
      if (window.BARCODE?.Preferences?.values?.flashes === false) return 1.0;
      return 0.5 + Math.sin(Date.now() * 0.02) * 0.4; // Fast flash
    }
    
    return 1.0; // Fully visible when not invincible
  }

  // Restore health by specified amount (up to max health)
  restoreHealth(amount) {
    const oldHealth = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    
    if (this.health > oldHealth) {
      console.log(`Health restored: ${oldHealth} → ${this.health} (+${this.health - oldHealth})`);
      
      this.hudReaction = { kind: 'relief', remainingMs: 1100 };
      // Create healing particles
      if (window.particleSystem) {
        window.particleSystem.healEffect(this.position.x, this.position.y - this.height/2);
      }
      
      // Play healing sound
      if (window.audioSystem) {
        if (window.audioSystem.playRepairPickup) window.audioSystem.playRepairPickup();
        else window.audioSystem.playCombatCue?.('restore');
      }
    }
    
    return this.health > oldHealth; // Return true if health was actually restored
  }
  
  // Update rhythm pulse effect
  updateRhythmPulse(deltaTime) {
    if (!this.rhythmPulse.active) {
      this.rhythmPulse.radius = 0;
      this.rhythmPulse.particles = [];
      return;
    }
    
    const dt = deltaTime / 1000;
    const currentTime = Date.now();
    
    // Update pulse phase for morphing effect
    this.rhythmPulse.phase += dt * this.rhythmPulse.morphSpeed;
    
    // Update color phase for color morphing
    this.rhythmPulse.colorPhase += dt * 3;
    
    // Morph radius with smooth sine wave variations
    const morphFactor = Math.sin(this.rhythmPulse.phase) * 0.3 + 1; // 0.7 to 1.3 multiplier
    let beatPulse = 0;
    
    // Add beat synchronization if rhythm system is available
    if (window.rhythmSystem && window.rhythmSystem.isRunning()) {
      const timeSinceBeat = currentTime - window.rhythmSystem.lastBeatTime;
      
      if (timeSinceBeat < 100) {
        // Pulse on beat
        beatPulse = Math.cos((timeSinceBeat / 100) * Math.PI) * 0.2;
      }
    }
    
    // Smooth radius transition with morphing and beat pulse
    const targetRadius = this.rhythmPulse.targetRadius * (morphFactor + beatPulse);
    this.rhythmPulse.radius += (targetRadius - this.rhythmPulse.radius) * 0.1;
    
    // Generate pulse particles
    if (Math.random() < 0.3) { // 30% chance per frame
      this.createRhythmPulseParticle();
    }
    
    // Update pulse particles
    this.updateRhythmPulseParticles(deltaTime);
  }
  
  // Create a particle for the rhythm pulse effect
  createRhythmPulseParticle() {
    const angle = Math.random() * Math.PI * 2;
    const startRadius = this.rhythmPulse.radius * 0.8;
    
    const particle = {
      x: this.position.x + Math.cos(angle) * startRadius,
      y: this.position.y + Math.sin(angle) * startRadius,
      angle: angle,
      radius: startRadius,
      targetRadius: this.rhythmPulse.radius * 1.2,
      size: Math.random() * 3 + 2,
      life: 1.0,
      decay: 0.015,
      speed: Math.random() * 50 + 30,
      opacity: 0.8,
      colorPhase: Math.random() * Math.PI * 2
    };
    
    this.rhythmPulse.particles.push(particle);
  }
  
  // Update rhythm pulse particles
  updateRhythmPulseParticles(deltaTime) {
    const dt = deltaTime / 1000;
    
    this.rhythmPulse.particles = this.rhythmPulse.particles.filter(particle => {
      // Move outward in spiral pattern
      particle.angle += dt * 2;
      particle.radius += particle.speed * dt;
      particle.life -= particle.decay;
      particle.opacity = particle.life * 0.6;
      
      // Update position
      particle.x = this.position.x + Math.cos(particle.angle) * particle.radius;
      particle.y = this.position.y + Math.sin(particle.angle) * particle.radius;
      
      return particle.life > 0 && particle.radius < this.rhythmPulse.radius * 1.5;
    });
  }
  
  // Draw the rhythm pulse effect
  drawRhythmPulse(ctx) {
    if (!this.rhythmPulse.active || this.rhythmPulse.radius < 10) {
      return;
    }
    
    ctx.save();
    
    // Calculate morphing colors
    const color1 = {
      r: Math.floor(Math.sin(this.rhythmPulse.colorPhase) * 127 + 128),
      g: Math.floor(Math.sin(this.rhythmPulse.colorPhase + Math.PI * 2/3) * 127 + 128),
      b: Math.floor(Math.sin(this.rhythmPulse.colorPhase + Math.PI * 4/3) * 127 + 128)
    };
    
    const color2 = {
      r: Math.floor(Math.sin(this.rhythmPulse.colorPhase + Math.PI) * 127 + 128),
      g: Math.floor(Math.sin(this.rhythmPulse.colorPhase + Math.PI * 5/3) * 127 + 128),
      b: Math.floor(Math.sin(this.rhythmPulse.colorPhase + Math.PI * 7/3) * 127 + 128)
    };
    
    // Draw morphing pulse rings
    for (let i = 0; i < 3; i++) {
      const ringPhase = this.rhythmPulse.phase + i * Math.PI / 3;
      const morphFactor = Math.sin(ringPhase) * 0.2 + 1;
      const ringRadius = this.rhythmPulse.radius * (1 - i * 0.2) * morphFactor;
      const opacity = (0.3 - i * 0.1) * (0.7 + Math.sin(this.rhythmPulse.phase * 2 + i) * 0.3);
      
      // Create gradient for each ring
      const gradient = ctx.createRadialGradient(
        this.position.x, this.position.y, ringRadius * 0.8,
        this.position.x, this.position.y, ringRadius
      );
      
      gradient.addColorStop(0, `rgba(${color1.r}, ${color1.g}, ${color1.b}, ${opacity * 0.5})`);
      gradient.addColorStop(0.5, `rgba(${color2.r}, ${color2.g}, ${color2.b}, ${opacity})`);
      gradient.addColorStop(1, `rgba(${color1.r}, ${color1.g}, ${color1.b}, 0)`);
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3 - i;
      ctx.beginPath();
      ctx.arc(this.position.x, this.position.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw center glow
    const centerGradient = ctx.createRadialGradient(
      this.position.x, this.position.y, 0,
      this.position.x, this.position.y, this.rhythmPulse.radius * 0.3
    );
    
    centerGradient.addColorStop(0, `rgba(${color1.r}, ${color1.g}, ${color1.b}, 0.4)`);
    centerGradient.addColorStop(0.5, `rgba(${color2.r}, ${color2.g}, ${color2.b}, 0.2)`);
    centerGradient.addColorStop(1, `rgba(${color1.r}, ${color1.g}, ${color1.b}, 0)`);
    
    ctx.fillStyle = centerGradient;
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, this.rhythmPulse.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw pulse particles
    this.rhythmPulse.particles.forEach(particle => {
      const particleColor = {
        r: Math.floor(Math.sin(particle.colorPhase) * 127 + 128),
        g: Math.floor(Math.sin(particle.colorPhase + Math.PI * 2/3) * 127 + 128),
        b: Math.floor(Math.sin(particle.colorPhase + Math.PI * 4/3) * 127 + 128)
      };
      
      ctx.fillStyle = `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${particle.opacity})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(0, particle.size), 0, Math.PI * 2);
      ctx.fill();
      
      // Add glow to particles
      ctx.shadowColor = `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${particle.opacity})`;
      ctx.shadowBlur = particle.size * 2;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    
    ctx.restore();
  }

  getHitbox() {
    // Stable torso/body contact. Hands, instruments and animation padding do
    // not change damage bounds. Landing uses the separate visible-foot sweep.
    return { x: this.position.x - 32, y: this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y - 146, width: 64, height: 142 };
  }

  getCeilingProbe() {
    if (!this.spriteReady || !this.sprite) return { x: this.position.x, y: this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y - 192 + 3 };
    const index = Math.max(0, Math.trunc(this.animationRef?.currentFrame || 0)) % PLAYER_JUMP_CROWN.length;
    const [x, y] = PLAYER_JUMP_CROWN[this.state === 'jump' ? index : 0];
    const presentation = PLAYER_ANIMATION_PRESENTATION.jump;
    const scale = this.getMakkoRenderMetrics(presentation, this.facing === -1).frameScale;
    return { x: this.position.x + (x - presentation.anchorX) * scale * this.facing,
      y: this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y - (presentation.anchorY - y) * scale };
  }

  // Debug method to visualize hitbox
  drawHitbox(ctx) {
    const hitbox = this.getHitbox();
    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
    
    // Draw center point
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(this.position.x - 2, this.position.y - 2, 4, 4);
    ctx.restore();
    
  }

  draw(ctx) {
    try {
      this.drawContactShadow(ctx);
      if (this.spriteReady && this.sprite) {
        // Draw sprite-based character
        this.drawSprite(ctx);
      } else {
        // Draw placeholder while loading
        this.drawLoadingPlaceholder(ctx);
      }
    } catch (error) {
      console.error('Error drawing player:', error?.message || error);
      this.drawLoadingPlaceholder(ctx);
    }
  }

  getContactShadow() {
    const footY = this.position.y + PLAYER_VISUAL_FOOT_OFFSET_Y;
    const surfaces = [...(window.sector1Progression?.getStageSurfaces?.() || window.Sector1Progression?.STAGE_SURFACES || [])];
    const progression = window.sector1Progression;
    if (progression?.isSignalLiftAvailable?.() && progression.signalLift) {
      surfaces.push(progression.signalLift);
      const roof = progression.getLiftRoof?.();
      if (roof) surfaces.push({ x: roof.x, w: roof.w, y: roof.topY });
    }
    let groundY = window.Player.GROUND_Y + PLAYER_VISUAL_FOOT_OFFSET_Y;
    for (const surface of surfaces) {
      if (this.position.x >= surface.x && this.position.x <= surface.x + surface.w && surface.y >= footY - 2) groundY = Math.min(groundY, surface.y);
    }
    const height = Math.max(0, groundY - footY);
    return { x: this.position.x, y: groundY + 2, width: Math.max(12, 34 - height * 0.035), alpha: Math.max(0.08, 0.3 - height * 0.0004) };
  }

  drawContactShadow(ctx) {
    const shadow = this.getContactShadow();
    ctx.save();
    ctx.fillStyle = `rgba(0, 4, 14, ${shadow.alpha})`;
    ctx.beginPath(); ctx.ellipse(shadow.x, shadow.y, shadow.width, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Draw sprite-based character
  drawSprite(ctx) {
    ctx.save();

    // Handle directional flipping for animations
    let shouldFlip = false;
    
    if (this.state === 'walk' || this.state === 'run') {
      // The complete model walk and dedicated run are authored facing right.
      shouldFlip = this.facing === -1;
    } else if (this.state === 'idle' || this.state === 'jump' || this.state === 'hack') {
      // Idle and jump should face the direction of movement
      shouldFlip = this.facing === -1;
    } else if (this.state === 'rhythm') {
      // CRITICAL FIX: Rhythm animation should face same direction as idle animation
      // Use same logic as idle: flip when facing left
      shouldFlip = this.facing === -1;
    }

    const visualAnchor = this.getVisualAnchor(shouldFlip);
    const drawY = visualAnchor.y;
    const drawX = visualAnchor.x;
    
    // Two brief offset echoes; no snapshots, timers, filters or extra updates.
    if (this.afterimageMs > 0 && !this.cinematicPoseActive) {
      for (const distance of [24, 12]) this.sprite.draw(ctx, drawX - this.facing * distance, drawY, {
        scale: visualAnchor.scale, flipH: shouldFlip, flipV: false,
        alpha: (this.afterimageMs / 220) * (distance === 24 ? 0.09 : 0.17), debug: false
      });
    }
    ctx.save();
    window.sector1Progression?.clipRoofFeet?.(ctx, this);
    if(this.state==='hack' && !window.BARCODE?.Preferences?.values.reducedMotion){
      const fx=window.BARCODE?.combatFX,age=window.hackingSystem?.sessionElapsedMs||0;
      const lean=this.facing*(.025*Math.sin(Math.min(1,age/420)*Math.PI/2)+(fx?.hackDeflectMs||0)/420*.12);
      ctx.transform(1,0,lean,1,-lean*visualAnchor.targetFootY,0);
    }
    if (this.state === 'idle' && !this.landingPoseActive &&
        !window.BARCODE?.Preferences?.values.reducedMotion) {
      // The real idle cels have a quiet mic/hand gesture. A measured whole-cel
      // breath makes that stance readable at native size. Scale/shear around
      // the registered feet, never translate the body or split its artwork.
      const breath = Math.sin(this.animationTime / 2300 * Math.PI * 2);
      const stretch = 1 + breath * 0.022;
      const lean = this.facing * Math.sin(this.animationTime / 3400 * Math.PI * 2) * 0.018;
      ctx.transform(1, 0, lean, stretch, -lean * visualAnchor.targetFootY,
        visualAnchor.targetFootY * (1 - stretch));
    }
    this.sprite.draw(ctx, drawX, drawY, {
      scale: visualAnchor.scale,
      flipH: shouldFlip, // Animation-specific flipping logic
      flipV: false,
      alpha: this.getInvincibilityAlpha(), // Dynamic alpha based on invincibility type
      debug: false // Set to true to see hitbox/anchor
    });
    ctx.restore();
    
    // Draw wind effects (behind character)
    this.drawWindEffects(ctx);
    
    ctx.restore();
  }
  
  // Draw wind effects
  drawWindEffects(ctx) {
    ctx.save();
    
    // Sort particles by Y position so higher particles draw behind lower ones
    const sortedParticles = [...this.windEffects].sort((a, b) => b.y - a.y);
    
    sortedParticles.forEach(particle => {
      const opacity = particle.opacity || 0.6;
      const currentSize = particle.currentSize || particle.size;
      
      // Draw expanding diagonal streaks for tornado effect
      const streakLength = 8 + (this.position.y - particle.y) * 0.1; // Longer streaks as it rises
      const angle = particle.spiralAngle + Math.PI / 2; // Perpendicular to spiral
      const endX = particle.x + Math.cos(angle) * streakLength;
      const endY = particle.y + Math.sin(angle) * streakLength * 0.3; // Diagonal streak
      
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = particle.color.replace('0.6', opacity * 0.3);
      ctx.lineWidth = Math.max(0.5, currentSize * 0.15);
      ctx.stroke();
      
      // Draw main tornado particle
      ctx.fillStyle = particle.color.replace('0.6', opacity);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(0, currentSize * 0.5), 0, Math.PI * 2);
      ctx.fill();
      
      // Draw dissipation trail - multiple fading particles spreading outward
      const trailCount = Math.floor(4 - (1 - opacity) * 2); // Fewer trails as it dissipates
      for (let i = 1; i <= trailCount; i++) {
        const trailDistance = i * 6;
        const trailAngle = particle.spiralAngle + i * 0.8;
        const trailX = particle.x + Math.cos(trailAngle) * trailDistance;
        const trailY = particle.y + Math.sin(trailAngle) * trailDistance * 0.5 + i * 3;
        const trailOpacity = opacity * (1 - i * 0.25);
        const trailSize = currentSize * (1 - i * 0.15);
        
        if (trailOpacity > 0.05) {
          ctx.fillStyle = particle.color.replace('0.6', trailOpacity);
          ctx.beginPath();
          ctx.arc(trailX, trailY, Math.max(0.5, trailSize * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    
    ctx.restore();
  }
  
  // Update jump trail smoke
  updateJumpTrail(deltaTime) {
    if (!this.jumpTrailActive) {
      return;
    }
    
    const currentTime = Date.now();
    
    // Create smoke particles at intervals during jump
    if (currentTime - this.lastJumpTrailTime > 80) { // Create smoke every 80ms
      this.createJumpTrailSmoke();
      this.lastJumpTrailTime = currentTime;
    }
    
    // Update existing smoke particles
    const dt = deltaTime / 1000;
    this.jumpTrailParticles = this.jumpTrailParticles.filter(particle => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt * 2; // Fade over 0.5 seconds
      particle.size = particle.originalSize * (1 + (1 - particle.life) * 2); // Grow as it fades
      
      return particle.life > 0;
    });
  }
  
  // Create smoke particle for jump trail
  createJumpTrailSmoke() {
    // Position smoke slightly behind and below player
    const offsetX = (Math.random() - 0.5) * 20; // Random spread
    const offsetY = Math.random() * 15; // Slightly below player
    
    this.jumpTrailParticles.push({
      x: this.position.x + offsetX,
      y: this.position.y + offsetY,
      vx: (Math.random() - 0.5) * 30, // Gentle horizontal drift
      vy: Math.random() * 20 + 10, // Gentle downward drift
      size: Math.random() * 3 + 2,
      originalSize: Math.random() * 3 + 2,
      life: 1.0,
      color: '#cccccc' // Gray smoke color
    });
  }
  
  // Draw jump trail smoke
  drawJumpTrail(ctx) {
    if (this.jumpTrailParticles.length === 0) {
      return;
    }
    
    ctx.save();
    
    this.jumpTrailParticles.forEach(particle => {
      const opacity = particle.life * 0.6;
      
      // Draw smoke particle with grow effect
      ctx.fillStyle = `rgba(204, 204, 204, ${opacity})`; // Convert #cccccc to rgba
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(0, particle.size), 0, Math.PI * 2);
      ctx.fill();
      
      // Add subtle glow
      ctx.shadowColor = 'rgba(204, 204, 204, 0.3)';
      ctx.shadowBlur = particle.size * 0.5;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    
    ctx.restore();
  }
  
  // Draw loading placeholder
  drawLoadingPlaceholder(ctx) {
    ctx.save();
    const visualFootY = this.getVisualAnchor().targetFootY;
    const placeholderWidth = 172;
    const placeholderHeight = 192;
    
    // Flip character based on facing direction
    if (this.facing === -1) {
      ctx.translate(this.position.x, 0);
      ctx.scale(-1, 1);
      ctx.translate(-this.position.x, 0);
    }
    
    // Draw loading placeholder
    const gradient = ctx.createLinearGradient(
      this.position.x - placeholderWidth / 2, visualFootY - placeholderHeight,
      this.position.x + placeholderWidth / 2, visualFootY
    );
    
    gradient.addColorStop(0, '#666666');
    gradient.addColorStop(1, '#999999');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(
      this.position.x - placeholderWidth / 2,
      visualFootY - placeholderHeight,
      placeholderWidth,
      placeholderHeight
    );
    
    // Draw loading text
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOADING', this.position.x, visualFootY - placeholderHeight / 2);
    
    ctx.restore();
  }
  
  // Place the complete canonical walk frame beyond the actual left viewport.
  // Its feet and gait are the same ones used by ordinary street movement.
  startEntranceAnimation({ targetX = 200 } = {}) {
    const zoom = Math.max(0.1, Number(window.renderer?.zoomLevel) || 1);
    const center = Math.max(960, Math.min(3136,
      window.renderer?.getFollowCameraX?.(targetX) ?? targetX));
    const walk = PLAYER_ANIMATION_PRESENTATION.walk;
    const rightExtent = (288 - walk.anchorX) * this.getMakkoRenderMetrics(walk).frameScale;
    this.entranceStartX = center - 960 / zoom - rightExtent - 16 / zoom;
    this.entranceTargetX = Math.max(this.width / 2, Math.min(4096 - this.width / 2, targetX));
    this.entranceElapsedMs = 0;
    this.entranceDuration = (this.entranceTargetX - this.entranceStartX) / this.speed * 1000;
    this.position.x = this.entranceStartX;
    this.position.y = window.Player.GROUND_Y;
    this.velocity.x = this.speed;
    this.velocity.y = 0;
    this.grounded = true;
    this.facing = 1;
    this.state = 'walk';
    this.isEntering = true;
    this.runHeld = false;
    this.controlsDisabled = true;
    // A fresh run cannot inherit a hit blink, held impact or portrait reaction
    // from the actor that was just replaced. Checkpoint restores bypass this.
    this.invulnerable = false;
    this.invulnerableUntil = this.controlsDisabledUntil = this._enemyInvulnerableUntilMs = 0;
    this.hudReaction = null;
    this.impactHoldMs = this.afterimageMs = this.primaryAttackAnimationMs = 0;
    this.cinematicPoseActive = false;
    this.supportedSurfaceId = null;
    this.jumpBufferTimerMs = this.jumpHeldMs = this.landingPoseMs = 0;
    this.jumpReleaseQueued = false;
    this.playAnimation('walk');
    return true;
  }

  cancelEntranceAnimation() {
    if (this.isEntering) {
      this.velocity.x = this.velocity.y = 0;
      this.state = 'idle';
      this.controlsDisabled = false;
    }
    this.isEntering = false;
    this.entranceElapsedMs = 0;
  }

  // Shared simulation delta makes difficulty reading and pause inert.
  updateEntranceAnimation(deltaTime) {
    if (!this.isEntering || window.isPaused || window.gameState?.paused || window.BARCODE?.LevelDifficulty?.open) return;
    this.entranceElapsedMs = Math.min(this.entranceDuration,
      this.entranceElapsedMs + Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0));
    this.position.x = Math.min(this.entranceTargetX,
      this.entranceStartX + this.speed * this.entranceElapsedMs / 1000);
    this.position.y = window.Player.GROUND_Y;
    this.velocity.x = this.speed;
    this.velocity.y = 0;
    this.grounded = true;
    this.facing = 1;
    this.state = 'walk';
    if (this.entranceDuration - this.entranceElapsedMs < 0.000001) {
      this.entranceElapsedMs = this.entranceDuration;
      this.position.x = this.entranceTargetX;
      this.velocity.x = 0;
      this.isEntering = false;
      this.controlsDisabled = false;
      this.allowMovement = true;
      this.coyoteTimerMs = PLAYER_COYOTE_MS;
      this.state = 'idle';
    }
  }
  
  // Create initial yellow particle blast
  createEntranceBlast() {
    if (!window.particleSystem) return;
    
    console.log('💥 Creating entrance black and green blast');
    
    // Create large black and green explosion at entrance point
    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 * i) / 30;
      const speed = 200 + Math.random() * 200;
      const size = 4 + Math.random() * 6;
      
      window.particleSystem.particles.push(new window.Particle(
        this.position.x,
        this.position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 100, // Upward bias
        Math.random() < 0.5 ? '#000000' : '#00ff00', // Black and green
        size,
        800 + Math.random() * 400,
        'triangle', // Triangle shape
        Math.random() * Math.PI * 2
      ));
    }
    
    // Add additional black and green sparks
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 300;
      
      window.particleSystem.particles.push(new window.Particle(
        this.position.x,
        this.position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 50,
        Math.random() < 0.5 ? '#ffffff' : '#00ff00', // White and green
        2 + Math.random() * 3,
        600 + Math.random() * 300,
        'triangle',
        Math.random() * Math.PI * 2
      ));
    }
  }
  
  // Create entrance particle trail
  createEntranceParticle() {
    if (!window.particleSystem) return;
    
    // Create small black and green trailing particles
    window.particleSystem.particles.push(new window.Particle(
      this.position.x - 20, // Behind player
      this.position.y + (Math.random() - 0.5) * 40,
      -50 - Math.random() * 100, // Backward velocity
      (Math.random() - 0.5) * 50,
      Math.random() < 0.5 ? '#ffffff' : '#00ff00', // White and green
      2 + Math.random() * 3,
      300 + Math.random() * 200,
      'circle',
      Math.random() * Math.PI * 2
    ));
  }
  
  // Create periodic entrance burst
  createEntranceBurst() {
    if (!window.particleSystem) return;
    
    // Create small burst effect
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 50 + Math.random() * 100;
      
      window.particleSystem.particles.push(new window.Particle(
        this.position.x,
        this.position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        Math.random() < 0.5 ? '#ffffff' : '#00ff00', // White and green
        3 + Math.random() * 2,
        200 + Math.random() * 200,
        'triangle',
        Math.random() * Math.PI * 2
      ));
    }
  }

  // Create final entrance explosion
  createEntranceExplosion() {
    if (!window.particleSystem || !Array.isArray(window.particleSystem.particles) || !window.Particle) return;
    console.log('🎆 Creating final entrance explosion');
    for (let i = 0; i < 40; i++) {
      const angle = (Math.PI * 2 * i) / 40;
      const speed = 150 + Math.random() * 250;
      const size = 3 + Math.random() * 5;
      window.particleSystem.particles.push(new window.Particle(this.position.x, this.position.y, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, Math.random() < 0.5 ? '#ffffff' : '#00ff00', size, 1000 + Math.random() * 500, 'triangle', Math.random() * Math.PI * 2));
    }
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24;
      const speed = 200;
      window.particleSystem.particles.push(new window.Particle(this.position.x, this.position.y, Math.cos(angle) * speed, Math.sin(angle) * speed, Math.random() < 0.5 ? '#ffffff' : '#00ff00', 4, 800, 'triangle', angle));
    }
  }

};

// Create player instance - wait for dependencies to be ready
function createPlayer() {
  if (window.Vector2D && window.clamp && window.distance) {
    window.player = new window.Player(200, window.Player.GROUND_Y);
    console.log('✓ Player created with MakkoEngine support');
  } else {
    console.warn('Player dependencies not ready, retrying...');
    setTimeout(createPlayer, 100);
  }
}

// Initialize player when dependencies are loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createPlayer);
} else {
  createPlayer();
}
