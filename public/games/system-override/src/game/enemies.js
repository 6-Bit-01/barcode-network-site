// Enemy system for BARCODE: System Override
// Gameplay simulation timers in this file use milliseconds at manager/API boundaries and seconds only in local per-frame integration variables named dt.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/game/enemies.js',
  exports: ['Enemy', 'RooftopDrone', 'EnemyManager', 'enemyManager'],
  dependencies: ['Vector2D', 'distance', 'clamp', 'randomRange', 'Player']
});

// ==========================================
// 1. BASE ENEMY CLASS (Moved to Top)
// ==========================================
const ENEMY_CONTACT_PRESENTATION = {"virus_idle_idle":{"scale":0.26666666666666666,"anchorX":192,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308],"headRows":[36,36,36,36,36,36,39,39,39,39,39,39,36,39,36,33,33,33,36,36,36,36,39,39,39,39,36,36,36,36,33,36,35,36,36,36,39,39,39,39,36,36,36,36,33,33,36,36,36,36,36]},"corrupted_idle_idle":{"scale":0.39999999999999997,"anchorX":192,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308],"headRows":[66,66,66,60,60,63,63,63,63,66,62,64,60,57,60,60,57,57,60,60,60,57,57,57,53,47,45,48,44,45,45,42,42,38,40,39,39,39,42,42,39,39,38,36,36,36,33,33,33,60,60]},"corrupted_walk_walk":{"scale":0.39999999999999997,"anchorX":160,"anchorY":276,"footRows":[276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276,276],"headRows":[19,16,16,22,16,19,28,19,21,22,16,19,22,19,19,19,19,22,22,19,20,22,19,21,16,16,20,22,22,25,19,18,21,22,22,19,18,19,23,16,25,22,19,19,22,19]},"firewall_idle_idle":{"scale":0.7533333333333333,"anchorX":176,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308],"headRows":[72,72,72,48,47,40,36,42,39,36,39,39,36,48,42,36,36,36,42,39,39,36,45,39,45,42,39,33,36,39,36,36,36,39,42,36,39,34,45,39,39,42,45,42,36,39,39,39,36,43,39,39,36,43,39,36,39,48,48,72,72,72]},"firewall_walk_walk":{"scale":0.6666666666666666,"anchorX":160,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308],"headRows":[24,27,30,33,32,36,36,33,32,33,30,33,33,30,30,27,27,27,27,30,29,33,36,33,33,33,30,30,33,33,30,27,27]},"firewall_attack_default":{"scale":0.9066666666666667,"anchorX":176,"anchorY":244,"footRows":[244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244,244],"headRows":[45,44,44,47,47,53,53,53,56,65,68,74,80,80,83,83,82,83,82,83,83,83,83,83,82,83,72,62,62,65,80,80,80,80,80,80,80,80,80,80,80,80,80,80,79,80,77,74,44,44,44,47,47,46,53,53,52,55,64]}};

const ENEMY_GROUND_Y = window.Player?.GROUND_Y ?? 784;

window.Enemy = class Enemy {
  constructor(x, y, type = 'virus') {
    this.position = new window.Vector2D(x, y);
    this.velocity = new window.Vector2D(0, 0);
    this.type = type;
    this.health = this.getMaxHealth();
    this.maxHealth = this.health;
    this.active = true;

    // Type-specific properties
    this.setupByType();
    this.baseSpeed = this.speed;

    // AI state
    this.state = 'entrance';
    this.target = null;
    this.stateTimer = 0;
    this.animationTime = 0;

    // Entrance animation properties
    this.entrancePhase = 0;
    this.entranceComplete = (type === 'firewall'); // Firewalls start ready
    this.originalSpawnX = x;
    this.originalSpawnY = y;
    this._dropEdge = (type === 'virus') ? 'top' : null;

    // Firewall-specific properties
    this.shieldActive = false;
    this.preparingAttack = false;
    this.attackAnimationPlaying = false;
    this.attackAnimationDurationSeconds = 0;
    this.attackAnimationTimerSeconds = 0;
    this.aiState = 'walking';

    // Personality behavior properties
    this.personalityTimer = Math.random() * 1000;
    this.behaviorState = 'normal';
    this.behaviorTimerSeconds = 0;

    // Corrupted Behavior State (New "Stop and Stare")
    this._corruptedState = null;
    this._corruptedTimer = 0;
    this._nextPauseTime = 0;

    // Virus Hover properties (New "Size Up")
    this.hoverState = 'none';
    this.hoverTimer = 0;
    this.hoverPosition = null;
    this._groupBehaviorTimer = 0;

    // Firewall lunge behavior
    this.lungeCooldownSeconds = 0;
    this.lungePreparationTimeSeconds = 0;
    this.isLunging = false;
    this.proximityDetectionRadius = 400;
    this._idleAnimationTimer = 0;
    this._inFullIdle = false;

    // Enhanced firewall properties (only used when type === 'firewall')
    this.proximityAttackRange = 250;
    this.glideDistance = 80;
    this.glideDurationSeconds = 0.8;
    this.fullAttackDurationSeconds = 4.9;
    this.attackStartTimeMs = 0;

    // MakkoEngine sprite properties
    this.sprite = null;
    this.spriteReady = false;
    this.currentAnimation = null;
    this.facing = 1;

    // Movement variations
    this.phaseOffset = Math.random() * Math.PI * 2;
    this.movementSeed = Math.random() * 1000;

    // Collision cooldowns
    this.lastCollisionTime = 0;
    this.collisionCooldown = 200;
    this.recentlyCollidedWith = new Set();

    // Spawn protection and simulation-time state (milliseconds).
    this.simulationTimeMs = 0;
    this.spawnTimeMs = 0;
    this.spawnProtectionDuration = 2000;
    this.lastPlayerHitTimeMs = -Infinity;
    this._disposed = false;
    this._generation = 0;
    this._spriteRequested = false;
    this._spriteId = null;
    this._spritePolls = 0;
    this.role = null;
    this.swooperState = 'none';
    this.swooperTimerMs = 0;
    this.swooperTargetY = y;
    this.swooperDiveDirection = 1;
    this.combatPattern = 'approach';
    this.combatPatternMs = 0;
    this.committedDirection = 1;
    this.hitFlashMs = 0;

    // Trigger entrance logic
    this.startEntrance();

    if (window.particleSystem) {
      window.particleSystem.enemySpawnEffect(this.position.x, this.position.y, this.type);
    }
  }

  setupByType() {
    switch(this.type) {
      case 'virus':
        this.width = 38;
        this.height = 37;
        this.speed = 150;
        this.damage = 1;
        this.color = '#9900ff';
        this.patrolRadius = 100;
        this.detectionRadius = 250;
        break;
      case 'corrupted':
        this.width = 64;
        this.height = 77;
        this.speed = 200; // Fast speed
        this.damage = 2;
        this.color = '#00ff88';
        this.patrolRadius = 80;
        this.detectionRadius = 350;
        break;
      case 'firewall':
        this.width = 140;
        this.height = 140;
        this.speed = 35;
        this.damage = 2;
        this.color = '#ff9900';
        this.patrolRadius = 100;
        this.detectionRadius = 450;
        this.attackAnimationDurationSeconds = 6;
        this.lungeCooldownSeconds = 6 + Math.random() * 4;
        this.maxAttackDistance = 500;
        break;
      default:
        this.width = 40;
        this.height = 40;
        this.speed = 100;
        this.damage = 1;
        this.color = '#00ff66';
    }
  }

  getMaxHealth() {
    switch(this.type) {
      case 'virus': return 2;
      case 'corrupted': return 4;
      case 'firewall': return 12;
      default: return 3;
    }
  }

  updateAuthoredEntrance(deltaTime) {
    if (!this._authoredEntranceActive || !this._entranceTarget) return false;
    if (window.sector1Progression && typeof window.sector1Progression.keepEntranceTargetSafe === 'function') {
      window.sector1Progression.keepEntranceTargetSafe(this);
    }
    const dt = deltaTime / 1000;
    const dx = this._entranceTarget.x - this.position.x;
    const dy = this._entranceTarget.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.max(1, this._authoredEntranceSpeed || 420);
    const step = speed * dt;

    this.state = 'authored_entrance';
    this.entranceComplete = false;
    if (this.type === 'firewall' && this.spriteReady && this.currentAnimation !== 'firewall_walk_walk') this.playAnimation('walk');

    if (distance <= Math.max(4, step)) {
      this.position.x = this._entranceTarget.x;
      this.position.y = this._entranceTarget.y;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this._authoredEntranceActive = false;
      this.entranceComplete = true;
      this.state = 'patrol';
      this.spawnTimeMs = this.simulationTimeMs;
      this.isOnGround = this.position.y >= ENEMY_GROUND_Y;
      if (this.type === 'firewall' && this.spriteReady) this.playAnimation('idle');
    } else {
      this.velocity.x = (dx / distance) * speed;
      if (Math.abs(this.velocity.x) > 2) this.facing = Math.sign(this.velocity.x);
      this.velocity.y = (dy / distance) * speed;
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
    }
    return true;
  }

  update(deltaTime, player, simulationTimeMs) {
    if (!this.active || this._disposed) return;
    const progression = window.sector1Progression, motion = progression?.captureRoofActor?.(this);
    this.updateLocomotion(deltaTime, player, simulationTimeMs);
    progression?.resolveLiftActor?.(this, motion);
  }

  updateLocomotion(deltaTime, player, simulationTimeMs) {
    if (!this.active || this._disposed) return;
    this.simulationTimeMs = Number.isFinite(simulationTimeMs) ? simulationTimeMs : (this.simulationTimeMs + deltaTime);
    this.pollSpriteReady();

    this._barrierPreviousX = this.position.x;
    this.previousContactBox = this.getHitbox();
    this.previousStompBox = this.getStompBox();
    const dt = deltaTime / 1000;
    this.stateTimer += deltaTime;
    this.animationTime += deltaTime;
    this.hitFlashMs = Math.max(0, this.hitFlashMs - deltaTime);

    // Authored Level 1 entrances own their integration until the actor reaches its stage target.
    if (this.updateAuthoredEntrance(deltaTime)) {
      if (this.spriteReady && this.sprite) {
        this.updateSpritePlayback(deltaTime);
        this.forceCorrectAnimationState();
      }
      return;
    }

    // Track if enemy is on ground
    const previousFootY = this.position.y + 72;
    const previousX = this.position.x;
    const supported = window.sector1Progression?.getActorSurfaces?.().find(p => p.id === this.supportedSurfaceId && this.position.x >= p.x && this.position.x <= p.x + p.w && Math.abs(previousFootY - p.y) < 3);
    this.isOnGround = !!supported || this.position.y >= ENEMY_GROUND_Y;

    // Gravity
    if (!this.isOnGround) this.velocity.y += 600 * dt;

    // Update AI - Traffic Controller
    if (this._hijackIdle) this.velocity.x = 0;
    else this.updateAI(player, dt);
    this.stayOnSurface(supported, dt);
    if (this.type === 'firewall' && Math.abs(this.velocity.x) > 2) this.facing = Math.sign(this.velocity.x);
    if (this.type === 'firewall' && this.combatPattern === 'approach' && this.spriteReady) {
      const animation = Math.abs(this.velocity.x) > 2 ? 'walk' : 'idle';
      if (!this.currentAnimation?.includes(animation)) this.playAnimation(animation);
    }

    // Update Animation
    if (this.spriteReady && this.sprite) {
      const held = (this.impactHoldMs || 0) > 0;
      this.impactHoldMs = Math.max(0, (this.impactHoldMs || 0) - deltaTime);
      this.forceCorrectAnimationState();
      if (!held && !this.updateCombatPose()) this.updateSpritePlayback(deltaTime);
    }

    // Physics Application
    this.position = this.position.add(this.velocity.multiply(dt));

    this.landOnPlatforms(previousFootY, previousX);

    // Ground Clamping
    const worldLeft = this.width/2;
    const worldRight = 4096 - this.width/2;
    this.position.x = window.clamp(this.position.x, worldLeft, worldRight);

    if (this.position.y >= ENEMY_GROUND_Y && !this.supportedSurfaceId) {
      this.position.y = ENEMY_GROUND_Y; this.supportedSurfaceId = null;
      if (this.type === 'firewall' || this.type === 'corrupted') {
          this.velocity.y = Math.min(0, this.velocity.y);
      } else {
          this.velocity.y = 0;
      }
    }

    // Friction
    const tutorialMode = window.tutorialSystem && window.tutorialSystem.isActive();
    if (tutorialMode && this.type === 'virus') {
        this.velocity.x *= Math.pow(0.98, dt * 60);
    } else if (this.type !== 'firewall') {
        this.velocity.x *= Math.pow(0.95, dt * 60);
    }
  }

  landOnPlatforms(previousFootY, previousX) {
    if (this.velocity.y < 0 || this.role === 'swooper') return;
    let support = null;
    const currentFootY = this.position.y + 72;
    for (const p of window.sector1Progression?.getActorSurfaces?.(this) || []) {
      if (previousFootY > p.y + 2 || currentFootY < p.y - .001) continue;
      const t = currentFootY > previousFootY ? Math.max(0, Math.min(1, (p.y - previousFootY) / (currentFootY - previousFootY))) : 1;
      const x = previousX + (this.position.x - previousX) * t;
      // A rider must retain the moving deck right up to its edge; an inset
      // would leave a short unsupported gap before the rooftop handoff.
      const inset = p.moving ? 0 : 10;
      if (x < p.x + inset || x > p.x + p.w - inset || support && support.y < p.y) continue;
      support = p;
    }
    this.supportedSurfaceId = support?.id || null;
    if (support) { this.position.y = support.y - 72; this.velocity.y = 0; this.isOnGround = true; }
  }

  static getSurfaceWalkBounds(actor, support) {
    const world = { left: actor.width / 2, right: 4096 - actor.width / 2 };
    if (!support) return world;
    // At the street stop the cabin is a walkway, not an isolated ledge.
    if (support.moving && Math.abs(support.y - (ENEMY_GROUND_Y + 72)) < .001) return world;
    const margin = Math.min(45, support.w / 4);
    let left = support.x + margin, right = support.x + support.w - margin;
    // Join only level, overlapping walking ranges involving the lift. Static
    // ledge guards and the exposed side of an elevated cabin stay intact.
    for (const surface of window.sector1Progression?.getActorSurfaces?.() || []) {
      if (surface.id === support.id || !(support.moving || surface.moving) ||
          Math.abs(surface.y - support.y) >= .001) continue;
      const inset = Math.min(45, surface.w / 4);
      const nextLeft = surface.x + inset, nextRight = surface.x + surface.w - inset;
      if (nextLeft > right || nextRight < left) continue;
      left = Math.min(left, nextLeft); right = Math.max(right, nextRight);
    }
    return { left: Math.max(world.left, left), right: Math.min(world.right, right) };
  }

  stayOnSurface(support, dt) {
    if (!support || this.role === 'swooper' || !this.isOnGround) return;
    const { left, right } = window.Enemy.getSurfaceWalkBounds(this, support);
    const next = this.position.x + this.velocity.x * dt;
    if (next < left || next > right) {
      this.position.x = Math.max(left, Math.min(right, this.position.x));
      this.velocity.x = 0;
    }
  }

  updateAI(player, dt) {
    // Authored combat gets deterministic, readable commitments. Tutorial and
    // legacy entrances retain their established behavior and damage rules.
    if ((this._sector1MissionEnemy || this._jammerReinforcement) && this.entranceComplete &&
        (this.type === 'corrupted' || this.type === 'firewall')) {
      this.updateAuthoredCombatPattern(dt, player);
      return;
    }
    // 1. Firewall Specific Logic
    if (this.type === 'firewall') {
        this.firewallPersonalityBehavior(dt, player);
        return;
    }

    // 2. Corrupted Specific Logic
    if (this.type === 'corrupted') {
        if (!this.entranceComplete) {
            this.corruptedEntrance(dt);
        } else {
            this.corruptedPersonalityBehavior(dt, player);
        }
        return;
    }

    // 3. Virus / Generic Logic
    if (this.type === 'virus') {
        if (this.role === 'swooper' && this.entranceComplete) { this.updateSwooperBehavior(dt, player); return; }
        if (!this.entranceComplete) {
            this.virusDropEntrance(dt);
        } else {
            const dist = window.distance(this.position.x, this.position.y, player.position.x, player.position.y);
            this.virusPersonalityBehavior(dt, player, dist);
        }
        return;
    }
  }

  updateAuthoredCombatPattern(dt, player) {
    const firewall = this.type === 'firewall';
    const dx = player.position.x - this.position.x;
    const range = firewall ? 250 : 340;
    const warningMs = firewall ? 950 : 650;
    this.combatPatternMs += dt * 1000;
    if (this.combatPattern === 'approach') {
      if (Math.abs(dx) > 18) this.facing = Math.sign(dx);
      this.velocity.x = Math.abs(dx) > 18 ? this.facing * (firewall ? 85 : 155) : 0;
      if (this.isOnGround !== false && this.combatPatternMs >= 800 && Math.abs(dx) <= range && Math.abs(player.position.y - this.position.y) < 160) {
        this.combatPattern = 'brace';
        this.combatPatternMs = 0;
        this.committedDirection = this.facing;
        this.velocity.x = 0;
      }
    } else if (this.combatPattern === 'brace') {
      this.velocity.x = 0;
      if (this.combatPatternMs >= warningMs) {
        this.combatPattern = 'attack';
        this.combatPatternMs = 0;
        this.facing = this.committedDirection;
        if (firewall) {
          // Keep the original complete attack clip and its 80px glide.
          this.startProximityAttack({ position: { x: this.position.x + this.committedDirection, y: this.position.y } });
        }
      }
    }
    if (this.combatPattern === 'attack') {
      this.velocity.x = this.committedDirection * (firewall ? 100 : 340);
      if (this.combatPatternMs >= (firewall ? 800 : 420)) {
        this.combatPattern = 'recovery';
        this.combatPatternMs = 0;
        this.velocity.x = 0;
      }
    } else if (this.combatPattern === 'recovery') {
      this.velocity.x = 0;
      const duration = firewall ? this.fullAttackDurationSeconds * 1000 - 800 : 950;
      if (this.combatPatternMs >= duration) {
        this.combatPattern = 'approach';
        this.combatPatternMs = 0;
        this.isLunging = false;
        this.behaviorState = 'normal';
      }
    }
    if (firewall && this.spriteReady && this.sprite && this.combatPattern !== 'approach') {
      const animation = this.combatPattern === 'brace' ? 'idle' : 'attack';
      if (!this.currentAnimation?.includes(animation)) this.playAnimation(animation);
    }
  }

  startEntrance() {
    if (this.type === 'corrupted') {
        const corruptedSpawnX = 4500 + window.randomRange(-50, 0);
        this.position.x = corruptedSpawnX;
        this.position.y = window.randomRange(200, 700);
        this.velocity.x = -(80 + Math.random() * 40);
        this.velocity.y = 50 + Math.random() * 50;
        this.entranceComplete = false;
        this.entrancePhase = 'throwing';
    } else if (this.type === 'firewall') {
        // FIX: ALWAYS spawn from right (off-screen)
        this.position.x = 4500;
        this.position.y = ENEMY_GROUND_Y;
        this.velocity.x = -40; // Start moving left
        this.entranceComplete = true; // Firewalls always ready
        this.aiState = 'walking';

        // Initialize Firewall Behavior State
        this.behaviorState = 'normal';
        this.behaviorTimerSeconds = 0;
        this.lungeCooldownSeconds = 1 + Math.random() * 3;
        this.isLunging = false;
        this.proximityDetectionRadius = 400 + Math.random() * 300;

    } else if (this.type === 'virus') {
        if (this._dropEdge) {
            this.entranceComplete = false;
            this.state = 'entrance';
        } else {
            this.entranceComplete = true;
            this.state = 'patrol';
        }
    }
  }

  // --- BEHAVIOR SYSTEMS ---

  // 1. VIRUS BEHAVIOR (Hover + Swoop)
  virusDropEntrance(dt) {
    if (this._dropEdge === 'top') {
        this.velocity.y += 600 * dt;
    }
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    if (this.position.y >= ENEMY_GROUND_Y) {
        this.position.y = ENEMY_GROUND_Y;
        this.velocity.y = 0;
        this.entranceComplete = true;
        this.state = 'patrol';
        this.isOnGround = true;
        if (window.particleSystem) window.particleSystem.impact(this.position.x, this.position.y, '#9900ff', 15);
    }
  }

  virusPersonalityBehavior(dt, player, distToPlayer) {
    const angleToPlayer = Math.atan2(
      player.position.y - this.position.y,
      player.position.x - this.position.x
    );

    // Group Logic
    const nearbyViruses = window.enemyManager?.getActiveEnemies().filter(other =>
      other !== this && other.type === 'virus' && other.active &&
      !!window.enemyManager?.isHijacked?.(other) === !!window.enemyManager?.isHijacked?.(this) &&
      window.distance(this.position.x, this.position.y, other.position.x, other.position.y) < 200
    ) || [];

    if (nearbyViruses.length > 0) {
      this._groupBehaviorTimer += dt;
      if (this._groupBehaviorTimer > (2 + Math.random() * 1)) {
        this._groupBehaviorTimer = 0;
        const groupAction = Math.random();
        if (groupAction < 0.4) {
          // Synchronized hop attack
          nearbyViruses.forEach(virus => {
            virus.velocity.y = -this.speed * 0.1;
            virus.velocity.x = Math.cos(angleToPlayer + (Math.random() - 0.5) * 0.5) * this.speed * 1.2;
          });
          this.velocity.y = -this.speed * 0.1;
          this.velocity.x = Math.cos(angleToPlayer) * this.speed * 1.2;
        } else if (groupAction < 0.7) {
          // Fan out formation
          const fanAngle = (Math.PI * 2) / (nearbyViruses.length + 1);
          nearbyViruses.forEach((virus, index) => {
            const targetAngle = angleToPlayer - Math.PI/4 + fanAngle * index;
            virus.velocity.x = Math.cos(targetAngle) * this.speed * 0.8;
          });
        }
      }
    }

    if (distToPlayer < 9999) {
      // Check if should enter hover mode
      if (distToPlayer < 250 && this.hoverState === 'none' && this.isOnGround) {
        this.hoverState = 'approach';
        this.hoverTimer = 0;
        this.hoverPosition = { x: this.position.x, y: this.position.y };
        console.log('🦘 Virus entering hover mode to size up player');
      }

      // Handle hover behavior
      if (this.hoverState !== 'none') {
        this.updateVirusHoverBehavior(dt, player);
      } else {
        // Normal approach
        const speedBoost = distToPlayer < 300 ? 2.5 : 1.5;
        this.velocity.x = Math.cos(angleToPlayer) * this.speed * speedBoost;

        // Flanking
        if (nearbyViruses.length > 2) {
          const flankAngle = angleToPlayer + (Math.random() > 0.5 ? Math.PI/3 : -Math.PI/3);
          this.velocity.x = Math.cos(flankAngle) * this.speed * 1.3;
        }

        // Hop attack with timing delay
        if (distToPlayer < 200 && this.isOnGround && Math.random() > 0.7) {
          if (!this._hopDelay) {
            this._hopDelay = 300 + Math.random() * 500;
            this._hopTimer = 0;
          }
          this._hopTimer += dt * 1000;
          if (this._hopTimer >= this._hopDelay) {
            this.velocity.y = -this.speed * 0.09;
            this.velocity.x = Math.cos(angleToPlayer) * this.speed * 1.1;
            this._hopDelay = 800 + Math.random() * 1000;
            this._hopTimer = 0;
          }
        }
      }
    }
  }

  updateVirusHoverBehavior(dt, player) {
    this.hoverTimer += dt;
    switch(this.hoverState) {
      case 'approach':
        const dx = this.hoverPosition.x - this.position.x;
        const dy = this.hoverPosition.y - this.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 10) {
          this.velocity.x = (dx / dist) * 100;
          this.velocity.y = (dy / dist) * 50;
        } else {
          this.hoverState = 'hovering';
          this.hoverTimer = 0;
        }
        break;
      case 'hovering':
        this.velocity.x *= 0.9; // Slow horizontal movement
        // Bounce up and down
        const bounceHeight = 30 + Math.sin(this.hoverTimer * 0.008) * 20;
        this.velocity.y = Math.sin(this.hoverTimer * 0.01) * 200 - bounceHeight;
        // Face the player
        const playerDx = player.position.x - this.position.x;
        this.facing = playerDx > 0 ? 1 : -1;
        // Exit hover after 2-3 seconds
        if (this.hoverTimer > 2.0 + Math.random() * 1.0) {
          this.hoverState = 'exit';
        }
        break;
      case 'exit':
        this.hoverState = 'none';
        this.velocity.y = -this.speed * 0.1; // Swooping hop exit
        break;
    }
  }


  updateSwooperBehavior(dt, player) {
    const manager = window.enemyManager;
    const activeDive = manager && manager.enemies && manager.enemies.some(enemy => enemy !== this && enemy.active && enemy.role === 'swooper' && enemy.swooperState === 'dive');
    const playerFootY = player.position.y + (window.Player?.VISUAL_FOOT_OFFSET_Y || 72);
    const targetSurfaceY = Math.max(-470, Math.min(ENEMY_GROUND_Y, playerFootY - 210));
    this.swooperTimerMs += dt * 1000;
    if (this.swooperState === 'none') {
      this.swooperState = 'approach';
      this.swooperTimerMs = 0;
      this.swooperDiveDirection = this.position.x < player.position.x ? 1 : -1;
    }
    if (this.swooperState === 'approach') {
      this.swooperTargetY = targetSurfaceY;
      const targetX = player.position.x - this.swooperDiveDirection * 220;
      this.velocity.x = Math.max(-this.speed * 1.8, Math.min(this.speed * 1.8, (targetX - this.position.x) * 1.4));
      this.velocity.y = Math.max(-180, Math.min(180, (this.swooperTargetY - this.position.y) * 2));
      if (Math.abs(this.position.x - player.position.x) > 180 && Math.abs(this.position.y - this.swooperTargetY) < 35 && this.swooperTimerMs >= 450 && !activeDive) {
        this.swooperState = 'telegraph';
        this.swooperTimerMs = 0;
        // Lock the intended lane before the warning. Dodging it must work;
        // the dive cannot silently retarget at the end of its telegraph.
        this.swooperAim = { x: player.position.x, y: player.position.y };
        this.velocity.x = 0;
        this.velocity.y = 0;
      }
    } else if (this.swooperState === 'telegraph') {
      this.velocity.x = 0;
      this.velocity.y = Math.sin(this.swooperTimerMs / 60) * 35;
      if (this.swooperTimerMs >= 650 && !activeDive) {
        this.swooperState = 'dive';
        this.swooperTimerMs = 0;
        const aim = this.swooperAim || player.position;
        const dx = aim.x - this.position.x;
        this.swooperDiveDirection = dx >= 0 ? 1 : -1;
        this.velocity.x = this.swooperDiveDirection * 360;
        this.velocity.y = Math.max(160, Math.min(310, (aim.y - this.position.y) * 1.5));
      }
    } else if (this.swooperState === 'dive') {
      if (this.swooperTimerMs >= 700 || this.position.y >= ENEMY_GROUND_Y) {
        this.swooperState = 'recovery';
        this.swooperTimerMs = 0;
        this.velocity.x *= 0.45;
        this.velocity.y = -180;
      }
    } else if (this.swooperState === 'recovery') {
      this.velocity.x *= Math.pow(0.97, dt * 60);
      this.velocity.y = Math.min(this.velocity.y + 500 * dt, 80);
      if (this.swooperTimerMs >= 900) {
        this.swooperState = 'approach';
        this.swooperTimerMs = 0;
      }
    }
  }

  // 2. CORRUPTED BEHAVIOR (New: Chase -> Stop & Stare -> Chase)
  corruptedEntrance(dt) {
    this.velocity.y += 800 * dt;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    if (this.position.y >= ENEMY_GROUND_Y) {
      this.position.y = ENEMY_GROUND_Y;
      this.velocity.y = 0;
      this.velocity.x = 0;
      this.entranceComplete = true;
      if (window.particleSystem) window.particleSystem.impact(this.position.x, this.position.y, '#00ff88', 20);
      if (window.renderer?.addScreenShake) window.renderer.addScreenShake(4, 150);
    }

    if (this.position.x < -100 || this.position.x > 2020) {
      this.position.x = window.clamp(this.position.x, 100, 3996);
      this.velocity.x *= -0.5;
    }
  }

  corruptedPersonalityBehavior(dt, player) {
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const angleToPlayer = Math.atan2(dy, dx);

    // Initialize behavior state
    if (!this._corruptedState) {
        this._corruptedState = 'chase';
        this._corruptedTimer = 0;
        this._nextPauseTime = this.simulationTimeMs + 1000 + Math.random() * 2000;
    }

    const currentTime = this.simulationTimeMs;

    if (this._corruptedState === 'chase') {
        // Chase the player
        const speed = this.speed * 1.2; // Fast pursuit
        this.velocity.x = Math.cos(angleToPlayer) * speed;

        // Randomly decide to stop and stare
        if (currentTime > this._nextPauseTime) {
            this._corruptedState = 'pause';
            this._corruptedTimer = this.simulationTimeMs; // Start pause timer
            // Pause up to 1 second
            this._pauseDuration = 200 + Math.random() * 800;
            this.velocity.x = 0; // Stop immediately

            // Force idle animation
            if (this.spriteReady && this.sprite) {
                this.playAnimation('idle');
            }
        }
    } else if (this._corruptedState === 'pause') {
        // Frozen in place - NO TWITCHING
        this.velocity.x = 0;
        this.velocity.y = 0;

        // Resume chase after duration
        if (this.simulationTimeMs - this._corruptedTimer > this._pauseDuration) {
            this._corruptedState = 'chase';
            this._nextPauseTime = currentTime + 1000 + Math.random() * 2000; // Schedule next pause
        }
    }
  }

  // 3. ENHANCED FIREWALL BEHAVIOR (Proximity Attack with Full Animation)
  firewallPersonalityBehavior(dt, player) {
    const distToPlayer = window.distance(this.position.x, this.position.y, player.position.x, player.position.y);
    const currentTime = this.simulationTimeMs;

    // Init
    if (!this._behaviorInit) {
      this._behaviorInit = true;
      this._nextIdlePause = currentTime + 2000 + Math.random() * 4000;
      this._idleChance = 0.003;
      this._aggressionLevel = 1.5;
      this._idleAnimationTimer = 0;
      this._fullIdleChance = 0.015;
      this._inFullIdle = false;
      this._fullIdleDuration = 0;
      console.log('🔥 Enhanced Firewall behavior initialized');
    }

    this._aggressionLevel = Math.min(2.0, this._aggressionLevel + 0.0018 * dt);

    // Attack Logic
    if (distToPlayer <= this.proximityAttackRange && !this.isLunging && this.lungeCooldownSeconds <= 0) {
      if (Math.random() < 0.9) {
        this.startProximityAttack(player);
        }
    }
    if (this.lungeCooldownSeconds > 0) this.lungeCooldownSeconds = Math.max(0, this.lungeCooldownSeconds - dt);

    // Idle Pause Logic
    if (currentTime >= this._nextIdlePause && this.behaviorState === 'normal') {
        this.behaviorState = 'idle_pause';
        this.behaviorTimerSeconds = 0;
        this._idlePauseDurationSeconds = 1 + Math.random() * 1.5;
        this._nextIdlePause = currentTime + 4000 + Math.random() * 3000;
    }

    switch(this.behaviorState) {
        case 'normal':
            const dx = player.position.x - this.position.x;
            const walkSpeed = 70 * this._aggressionLevel;
            this.velocity.x = Math.abs(dx) > 18 ? Math.sign(dx) * walkSpeed : 0;
            if (Math.abs(this.velocity.x) > 2) this.facing = Math.sign(this.velocity.x);

            if (this.spriteReady && this.sprite) {
                const anim = this.sprite.getCurrentAnimation();
                if (!anim || !anim.includes('walk')) this.playAnimation('walk');
            }
            break;

        case 'idle_pause':
            this.velocity.x = 0;
            this.behaviorTimerSeconds += dt;
            this._idleAnimationTimer += dt;

            // Occasional FULL Idle Animation (plays ~5s loop)
            if (!this._inFullIdle && this._idleAnimationTimer > 0.3 && Math.random() < this._fullIdleChance) {
                this._inFullIdle = true;
                const loopCount = 1 + Math.floor(Math.random() * 3); // 1-3 loops
                this._fullIdleDuration = loopCount * 5.17; // seconds
                this._idleAnimationTimer = 0;
                this._idleAnimationTimer = 0;
                console.log('🔥 Firewall entering full idle');
            }

            if (this._inFullIdle) {
                if (this._idleAnimationTimer > this._fullIdleDuration) {
                    this._inFullIdle = false;
                    this._idleAnimationTimer = 0;
                }
                // Force play idle
                if (this.spriteReady && this.sprite) {
                    const anim = this.sprite.getCurrentAnimation();
                    if (!anim || !anim.includes('idle')) this.playAnimation('idle');
                }
            } else {
                // Normal short idle
                if (this.spriteReady && this.sprite) {
                    const anim = this.sprite.getCurrentAnimation();
                    if (!anim || !anim.includes('idle')) this.playAnimation('idle');
                }
            }

            // Exit pause if done (and not forced in full idle)
            if (!this._inFullIdle && this.behaviorTimerSeconds > this._idlePauseDurationSeconds) {
                this.behaviorState = 'normal';
                this.behaviorTimerSeconds = 0;
            }
            break;

        case 'lunging':
            this.behaviorTimerSeconds += dt;
            // Drag
            // Enhanced glide physics
            if (this.behaviorTimerSeconds < this.glideDurationSeconds) {
              // Active gliding phase
              this.velocity.x *= Math.pow(0.95, dt * 60); // Maintain forward momentum
            } else {
              // Post-glide deceleration
              this.velocity.x *= Math.pow(0.85, dt * 60);
            }

            // Shared support/gravity integration owns vertical motion.

            if (this.spriteReady && this.sprite) {
                const anim = this.sprite.getCurrentAnimation();
              if (!anim || !anim.includes('attack')) {
                this.playAnimation('attack');
              }
            }

            // Check for full animation completion
            const attackElapsed = this.behaviorTimerSeconds;
            if (attackElapsed > this.fullAttackDurationSeconds) {
                this.behaviorState = 'normal';
                this.behaviorTimerSeconds = 0;
                this.isLunging = false;
                this.lungeCooldownSeconds = 3 + Math.random() * 2;
                this.attackStartTimeMs = 0;
                console.log('🔥 Enhanced Firewall proximity attack completed');
            }

            // Safety timeout
            if (this.behaviorTimerSeconds > 5.5) {
              console.log('🔥 Enhanced Firewall attack timeout - forcing exit');
              this.behaviorState = 'normal';
              this.behaviorTimerSeconds = 0;
              this.isLunging = false;
              this.lungeCooldownSeconds = 2;
              this.attackStartTimeMs = 0;
            }
            break;
    }
  }

  // Enhanced proximity attack with full animation and 80px glide
  startProximityAttack(player) {
    this.isLunging = true;
    this.behaviorState = 'lunging';
    this.behaviorTimerSeconds = 0;
    this.attackStartTimeMs = this.simulationTimeMs;

    // Calculate direction to player
    const dx = player.position.x - this.position.x;
    const direction = dx > 0 ? 1 : -1;
    this.facing = direction;

    // Execute 80px glide
    const glideVelocity = this.glideDistance / this.glideDurationSeconds;
    this.velocity.x = glideVelocity * direction;
    this.velocity.y = 0; // Grounded glide; the complete drawing owns the punch motion.

    // Play full attack animation
    if (this.spriteReady && this.sprite) {
      this.playAnimation('attack');
    }

    // Enhanced visual effects
    if (window.particleSystem) {
      window.particleSystem.enemySpawnEffect(this.position.x, this.position.y - 30, 'firewall');
    }
    if (window.renderer?.addScreenShake) {
      window.renderer.addScreenShake(6, 200);
    }

    console.log('🔥 Enhanced Firewall proximity attack initiated - 80px glide with full 4.9s animation');
  }

  // --- ANIMATION CONTROLLER ---
  getAnimationPlaybackRate() {
    if (this.type === 'virus') return 1.4; // Active signal/skin loop, not a walk.
    if (this.type === 'corrupted') {
      return this.currentAnimation === 'corrupted_walk_walk'
        ? Math.max(0.5, Math.min(2.2, Math.abs(this.velocity.x) / 155)) : 1.1;
    }
    return this.currentAnimation === 'firewall_idle_idle' ? 0.9 : 1;
  }

  updateSpritePlayback(deltaTime) {
    if (this.type === 'firewall' && this.currentAnimation === 'firewall_walk_walk') {
      // A single complete sixteen-pose stride avoids the old mixed-cycle seam.
      // Register its torso at draw time; never rebuild or split the accepted art.
      this.walkPhaseMs = ((this.walkPhaseMs || 0) + deltaTime * Math.min(1.6, Math.abs(this.velocity.x) / 85)) % 1328;
      const frame = Math.floor(this.walkPhaseMs / 83);
      if (!this.animationRef || this.animationRef.currentFrame !== frame || this.animationRef.isInterrupted)
        this.animationRef = this.sprite.play(this.currentAnimation, true, frame);
      return;
    }
    const playbackDelta = deltaTime * this.getAnimationPlaybackRate();
    if (window.BARCODE?.SpritePlayback) window.BARCODE.SpritePlayback.update(this.sprite, playbackDelta);
    else this.sprite.update(playbackDelta);
  }

  forceCorrectAnimationState() {
    // Firewall logic handles its own animation in firewallPersonalityBehavior
    if (this.type === 'firewall') return;

    if (!this.spriteReady || !this.sprite) return;

    const currentAnim = this.sprite.getCurrentAnimation();
    let target = 'idle';

    if (this.type === 'virus') {
      target = 'idle';
    } else if (this.type === 'corrupted') {
      target = Math.abs(this.velocity.x) > 2 ? 'walk' : 'idle';
      if (target === 'walk') this.facing = this.velocity.x > 0 ? 1 : -1;
    }

    const map = {
      'virus': { 'idle': 'virus_idle_idle' },
      'corrupted': { 'idle': 'corrupted_idle_idle', 'walk': 'corrupted_walk_walk' }
    };

    if (map[this.type]) {
      const fullName = map[this.type][target];
      if (!currentAnim || !currentAnim.includes(target)) {
        this.playAnimation(target);
      }
    }
  }

  playAnimation(name) {
    if (!this.spriteReady || !this.sprite) return;

    // Explicit Firewall Animation
    if (this.type === 'firewall') {
        const map = {
            'idle': 'firewall_idle_idle',
            'walk': 'firewall_walk_walk',
            'attack': 'firewall_attack_default'
        };
        const fullName = map[name] || name;
        if (name !== 'attack' && this.sprite.getCurrentAnimation() === fullName &&
            this.animationRef && !this.animationRef.isInterrupted) return;
        const loop = name !== 'attack';
        this.animationRef = this.sprite.play(fullName, loop);
        this.currentAnimation = fullName;
        return;
    }

    // Generic Animation - NO DELAY
    const map = {
      'virus': { 'idle': 'virus_idle_idle' },
      'corrupted': { 'idle': 'corrupted_idle_idle', 'walk': 'corrupted_walk_walk' }
    };

    const fullName = map[this.type][name] || name;
    const current = this.sprite.getCurrentAnimation();

    if (current === fullName && this.animationRef && !this.animationRef.isInterrupted) return;

    // FIX: Removed setTimeout delay that was causing race conditions
    const loop = !fullName.includes('attack');
    // All rate policy is applied to the shared delta above. Do not compound
    // a hidden SDK multiplier or restart a walking take when speed changes.
    this.animationRef = this.sprite.play(fullName, loop);
    this.currentAnimation = fullName;
  }

  isSpawnProtected() {
    if (!this._sector1MissionEnemy && !this._jammerReinforcement) return false;
    return !!this._authoredEntranceActive || !this.entranceComplete || ((this.simulationTimeMs || 0) - (this.spawnTimeMs || 0) < (this.spawnProtectionDuration || 0));
  }

  updateCombatPose() {
    if (!this.sprite || !this.animationRef || !this.combatPattern) return false;
    let frame = null;
    // The punch occupies the committed attack, then visibly returns to rest.
    if (this.type === 'firewall' && (this.combatPattern === 'attack' || this.combatPattern === 'recovery') && this.currentAnimation === 'firewall_attack_default') {
      frame = this.combatPattern === 'attack'
        ? Math.min(31, 5 + Math.floor(this.combatPatternMs / 800 * 26))
        : Math.min(58, 32 + Math.floor(this.combatPatternMs / 4100 * 26));
    } else if (this.type === 'corrupted' && this.combatPattern === 'brace') {
      // Preserve the warned 650ms commitment, but use the native tongue and
      // arm movement instead of pinning the creature to one static drawing.
      frame = Math.min(23, Math.floor(this.combatPatternMs / 650 * 24));
    }
    if (frame === null) return false;
    // AnimationReference.currentFrame is a getter in Makko. Use the public
    // start-frame argument, and leave this committed pose on the AI clock.
    if (this.animationRef.currentFrame !== frame || this.animationRef.isInterrupted) {
      this.animationRef = this.sprite.play(this.currentAnimation, !this.currentAnimation.includes('attack'), frame);
    }
    return true;
  }

  getSpritePresentation() {
    const presentation = ENEMY_CONTACT_PRESENTATION[this.currentAnimation] || ENEMY_CONTACT_PRESENTATION[
      this.type === 'firewall' ? 'firewall_idle_idle' : this.type === 'corrupted' ? 'corrupted_idle_idle' : 'virus_idle_idle'];
    const flipH = this.facing === -1;
    const render = window.Player.prototype.getMakkoRenderMetrics.call(this, presentation, flipH);
    const index = Math.max(0, Math.floor(this.animationRef?.currentFrame || 0)) % presentation.footRows.length;
    const footRow = presentation.footRows[index];
    const walkTorso = this.currentAnimation === 'firewall_walk_walk'
      ? [-5.5, 2.3, 0.7, 1.8, -4.2, -11.1, -8, -9.7, -7.7, 12, -4.5, -11.8, -10.3, -14.5, -16.3, -4.9][index % 16] : 0;
    return { x: this.position.x + render.flipSignX * (render.anchorOffsetX - render.sourceAnchorX * render.frameScale - walkTorso * render.frameScale),
      y: this.position.y + 72 + render.anchorOffsetY - footRow * render.frameScale,
      scale: presentation.scale, flipH };
  }

  drawSprite(ctx) {
    const pose = this.getSpritePresentation();
    ctx.save();
    window.sector1Progression?.clipRoofFeet?.(ctx, this);
    if (this.type === 'virus' && !window.BARCODE?.Preferences?.values.reducedMotion) {
      // Its native signal cells pulse, but the sphere barely changes outline
      // at gameplay size. Give the complete cel a slow grounded squash;
      // anchored feet and the stable combat body remain untouched.
      const pulse = Math.sin(this.animationTime / 1100 * Math.PI * 2 + this.phaseOffset);
      const stretch = 1 + pulse * 0.05;
      const footY = this.position.y + 72;
      ctx.transform(1, 0, 0, stretch, 0, footY * (1 - stretch));
    }
    this.sprite.draw(ctx, pose.x, pose.y, { scale: pose.scale, flipH: pose.flipH });
    ctx.restore();
  }

  initSprite() {
    if (this._disposed || this._spriteRequested) return;
    this._spriteRequested = true;
    this.pollSpriteReady();
  }

  pollSpriteReady() {
    if (this._disposed || this.spriteReady || !['virus', 'corrupted', 'firewall'].includes(this.type)) return;
    const charMap = {
      'virus': 'virus_virus',
      'corrupted': 'corrupted_corrupted',
      'firewall': 'firewall_firewall'
    };
    if (!window.MakkoEngine || !window.MakkoEngine.isLoaded || !window.MakkoEngine.isLoaded()) return;
    if (!this.sprite) {
      this._spriteId = charMap[this.type];
      this.sprite = window.MakkoEngine.sprite(this._spriteId);
      this._spritePolls += 1;
    }
    if (this.sprite && this.sprite.isLoaded && this.sprite.isLoaded() && !this._disposed) {
      this.spriteReady = true;
      this.playAnimation('idle');
    }
  }

  takeDamage(amount, contact = {}) {
    if (!this.active || this._defeatRecorded) return false;
    this.health -= amount;
    this.hitFlashMs = 130;
    this.impactHoldMs = contact.perfect ? 45 : 25;
    const body = this.getHitbox();
    if (!contact.squashed) window.BARCODE?.combatFX?.contact(this.type, contact.x ?? this.position.x, contact.y ?? (body.y + body.height * 0.45), contact.direction || 1, this.health <= 0, !!contact.perfect);

    if (!contact.squashed && !window.BARCODE?.combatFX && window.particleSystem) {
      let particleColor = this.type === 'corrupted' ? 'corrupted' : this.type;
      window.particleSystem.damageEffect(this.position.x, this.position.y - this.height/2, particleColor, 10);
    }

    if (this.health <= 0) {
      this.active = false;

      window.audioSystem?.playCombatCue?.('defeat', { material: this.type });

      if (!contact.squashed && !window.BARCODE?.combatFX && window.particleSystem) {
        let particleColor = this.type === 'corrupted' ? 'corrupted' : this.type;
        window.particleSystem.explosion(this.position.x, this.position.y - this.height/2, particleColor, 25);
      }

      if (window.gameState && !this._scoreApplied) {
        const points = this.getPointValue();
        window.gameState.score += points;
        this._scoreApplied = true;
      }
      return true;
    }
    return false;
  }

  getPointValue() {
    switch(this.type) {
      case 'virus': return 100;
      case 'corrupted': return 200;
      case 'firewall': return 300;
      default: return 100;
    }
  }

  getVisualBounds() {
    if (['virus', 'corrupted', 'firewall'].includes(this.type) && this.spriteReady && this.sprite) {

      // Ask Makko for the bounds of exactly the pose that drawSprite renders.
      // Retain the existing contact margins; offsets/scales have one owner.
      const pose = this.getSpritePresentation();
      const worldHitbox = this.sprite.getHitboxWorld(pose.x, pose.y, {
        scale: pose.scale, flipH: pose.flipH
      });

      if (worldHitbox) {
        let marginReduction = 0.05;
        if (this.type === 'virus') marginReduction = 0.15;
        else if (this.type === 'corrupted') marginReduction = 0.12;
        else if (this.type === 'firewall') marginReduction = 0.08;

        const tightWidth = worldHitbox.width * (1 - marginReduction * 2);
        const tightHeight = worldHitbox.height * (1 - marginReduction * 2);

        return {
          x: worldHitbox.x + (worldHitbox.width - tightWidth) / 2,
          y: worldHitbox.y + (worldHitbox.height - tightHeight) / 2,
          width: tightWidth,
          height: tightHeight
        };
      }
    }

    let marginReduction = 0.05;
    let topExtension = 0;
    if (this.type === 'virus') {
      marginReduction = 0.08;
      topExtension = 15;
    }

    const tightWidth = this.width * (1 - marginReduction * 2);
    const tightHeight = this.height * (1 - marginReduction * 2);

    return {
      x: this.position.x - tightWidth/2,
      y: this.position.y - tightHeight - topExtension,
      width: tightWidth,
      height: tightHeight + topExtension
    };
  }

  getHitbox() {
    const [width, height] = this.type === 'firewall' ? [90, 124] : this.type === 'corrupted' ? [46, 92] : [54, 60];
    return { x: this.position.x - width / 2, y: this.position.y + 68 - height, width, height };
  }

  getStompBox() {
    const body = this.getHitbox();
    const pose = ENEMY_CONTACT_PRESENTATION[this.currentAnimation];
    if (!pose) return body;
    const frame = Math.max(0, Math.floor(this.animationRef?.currentFrame || 0)) % pose.footRows.length;
    // Feet contact the visible silhouette above the torso. Ignore the tall
    // decorative flames on a standing Firewall; follow its crouched head.
    const visibleTop = this.position.y + 72 - (pose.footRows[frame] - pose.headRows[frame]) * pose.scale;
    const highestHead = this.type === 'firewall' ? this.position.y + 68 - 166 : body.y;
    const top = Math.max(highestHead, Math.min(body.y, visibleTop));
    return { x: body.x, y: top, width: body.width, height: body.y + body.height - top };
  }

  getCollisionBox() {
    const hitbox = this.getHitbox();
    const collisionMargin = 0.05;
    const collisionWidth = hitbox.width * (1 - collisionMargin * 2);
    const collisionHeight = hitbox.height * (1 - collisionMargin * 2);

    return {
      x: hitbox.x + (hitbox.width - collisionWidth) / 2,
      y: hitbox.y + (hitbox.height - collisionHeight) / 2,
      width: collisionWidth,
      height: collisionHeight
    };
  }

  draw(ctx) {
    if (!this.active) return;
    if (!ctx) return;

    ctx.save();
    if (this.hitFlashMs > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10; }
    if (this.type === 'firewall' && this.alpha !== undefined) ctx.globalAlpha = this.alpha;

    if (['virus', 'corrupted', 'firewall'].includes(this.type) && this.spriteReady && this.sprite) {
      this.drawSprite(ctx);
      if (this.health < this.maxHealth) {
        const body = this.getHitbox();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fillRect(body.x, this.getStompBox().y - 8, body.width * (this.health / this.maxHealth), 4);
      }
    } else {
      const body = this.getHitbox();
      ctx.fillStyle = this.color;
      ctx.fillRect(body.x, body.y, body.width, body.height);
    }
    ctx.shadowBlur = 0;
    this.drawCombatCue(ctx);
    window.enemyManager?.drawHijackMarker?.(ctx, this);
    if (this._repairCarrier && !this._repairDropped) {
      const box = this.getHitbox();
      window.Sector1Progression?.drawRepairCell?.(ctx, box.x + box.width + 16, box.y + box.height * 0.4, 0.55);
    }
    ctx.restore();
  }

  getCombatCue() {
    if (!this.active || !this.entranceComplete || !(this._sector1MissionEnemy || this._jammerReinforcement)) return null;
    const swooper = this.role === 'swooper';
    const phase = swooper ? this.swooperState : this.combatPattern;
    if (!swooper && !['corrupted', 'firewall'].includes(this.type)) return null;
    if (!['brace', 'telegraph', 'attack', 'dive', 'recovery'].includes(phase)) return null;
    const warning = phase === 'brace' || phase === 'telegraph';
    const recovery = phase === 'recovery';
    const elapsed = swooper ? this.swooperTimerMs : this.combatPatternMs;
    const duration = this.type === 'firewall' ? 950 : 650;
    return { phase, swooper, warning, recovery,
      progress: Math.max(0, Math.min(1, elapsed / duration)),
      direction: this.committedDirection,
      aim: swooper && this.swooperAim ? { ...this.swooperAim } : null };
  }

  drawCombatCue(ctx) {
    const cue = this.getCombatCue();
    if (!ctx || !cue) return;
    const { swooper, warning, recovery } = cue;
    const box = this.getStompBox();
    const color = recovery ? '#8fffe3' : '#ffbd70';
    const label = recovery ? 'RECOVERING' : swooper ? (warning ? 'DIVE WINDUP' : 'DIVE') : this.type === 'firewall' ? (warning ? 'BRACING' : 'SWEEP') : (warning ? 'CHARGE WINDUP' : 'CHARGE');
    const x = this.position.x, y = box.y - 25;
    ctx.save(); ctx.fillStyle = 'rgba(0, 8, 16, 0.92)';
    ctx.fillRect(x - 90, y - 17, 172, 31);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    // Redundant shapes remain readable without relying on tiny text or color.
    const iconX = x - 72;
    ctx.beginPath();
    if (recovery) {
      ctx.arc(iconX, y - 1, 10, 0.3, Math.PI * 1.8); ctx.stroke();
      ctx.fillRect(iconX - 2, y - 6, 4, 10);
    } else if (swooper) {
      ctx.moveTo(iconX - 10, y - 8); ctx.lineTo(iconX, y + 3); ctx.lineTo(iconX + 10, y - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(iconX - 7, y); ctx.lineTo(iconX, y + 8); ctx.lineTo(iconX + 7, y); ctx.stroke();
    } else {
      if (this.type === 'firewall') {
        ctx.moveTo(iconX - 10, y - 11); ctx.lineTo(iconX + 10, y - 11); ctx.lineTo(iconX + 8, y + 3); ctx.lineTo(iconX, y + 10); ctx.lineTo(iconX - 8, y + 3);
      } else {
        ctx.moveTo(iconX, y - 12); ctx.lineTo(iconX + 12, y + 9); ctx.lineTo(iconX - 12, y + 9);
      }
      ctx.closePath(); ctx.stroke(); ctx.fillRect(iconX - 1.5, y - 6, 3, 7); ctx.fillRect(iconX - 1.5, y + 4, 3, 3);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 13px monospace';
    ctx.fillText(label, x + 11, y - 1);
    if (warning) {
      ctx.fillStyle = '#304253'; ctx.fillRect(x - 88, y + 16, 168, 4);
      ctx.fillStyle = color; ctx.fillRect(x - 88, y + 16, 168 * cue.progress, 4);
    }
    if (!recovery) {
      if (swooper && cue.aim) {
        ctx.strokeStyle = 'rgba(255,189,112,0.7)'; ctx.setLineDash([7, 7]);
        ctx.beginPath(); ctx.moveTo(x, this.position.y); ctx.lineTo(cue.aim.x, cue.aim.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = color; ctx.beginPath();
        ctx.moveTo(cue.aim.x, cue.aim.y - 13); ctx.lineTo(cue.aim.x + 13, cue.aim.y); ctx.lineTo(cue.aim.x, cue.aim.y + 13); ctx.lineTo(cue.aim.x - 13, cue.aim.y); ctx.closePath(); ctx.stroke();
      } else if (!swooper) {
        // Direction cue, not an extra hitbox. It stays committed even if the
        // player crosses behind the enemy during its windup.
        const foot = this.position.y + (window.Player?.VISUAL_FOOT_OFFSET_Y || 72) + 5;
        const start = x + cue.direction * 18;
        const end = x + cue.direction * (this.type === 'firewall' ? 85 : 130);
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(start, foot); ctx.lineTo(end, foot);
        ctx.moveTo(end - cue.direction * 14, foot - 8); ctx.lineTo(end, foot); ctx.lineTo(end - cue.direction * 14, foot + 8); ctx.stroke();
        ctx.globalAlpha = 0.45;
        for (let i = 0; i < 3; i++) {
          const chevron = start + (end - start) * (i + 1) / 4;
          ctx.beginPath(); ctx.moveTo(chevron - cue.direction * 5, foot - 5); ctx.lineTo(chevron, foot); ctx.lineTo(chevron - cue.direction * 5, foot + 5); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  getDrawLayer() {
    if (this.type === 'virus') return 1;
    if (this.type === 'corrupted') return -1;
    if (this.type === 'firewall') return -1;
    return 1;
  }
};

// New authored aerial enemy. Flight is constrained to its assigned rooftop;
// neither player altitude nor allegiance changes can pull it out of that band.
window.RooftopDrone = class RooftopDrone extends window.Enemy {
  constructor(x, y, surface, patrol = null, escort = null) {
    super(x, y, 'drone');
    this.position.x=x; this.position.y=y;
    this.width=112;this.height=92;this.health=2;this.maxHealth=2;this.damage=1;
    this.home={x,y,left:patrol?.left ?? surface.x+64,right:patrol?.right ?? surface.x+surface.w-64};
    this.dronePhase='patrol';this.dronePhaseMs=0;this.patrolDirection=1;
    this.entranceComplete=true;this.spriteReady=false;this.pulse=null;
    this.escort=escort;this._bossSupport=escort?.owner==='boss';this._jammerReinforcement=escort?.owner==='jammer';
    if(escort){this.health=this.maxHealth=4;this.dronePhaseMs=-1200;this.spawnProtectionDuration=1000;}
  }
  update(deltaTime, target, simulationTimeMs) {
    if (!this.active || this._disposed) return;
    const progression = window.sector1Progression, motion = progression?.captureRoofActor?.(this);
    const supported = progression?.isRoofRider?.(this);
    this.updateFlight(deltaTime, target, simulationTimeMs);
    // Its flight AI may keep patrolling horizontally while the solid roof
    // supports it; restore the carried altitude instead of snapping through it.
    if (supported && this.position.x + 50 > progression.getLiftRoof().x &&
        this.position.x - 50 < progression.getLiftRoof().x + progression.getLiftRoof().w) this.position.y = motion.y;
    progression?.resolveLiftActor?.(this, motion);
  }
  updateFlight(deltaTime, target, simulationTimeMs) {
    if(!this.active||this._disposed)return;
    const dt=Math.max(0,deltaTime)/1000;
    this.simulationTimeMs=simulationTimeMs;this.animationTime+=deltaTime;
    this._barrierPreviousX=this.position.x;this.previousContactBox=this.getHitbox();this.previousStompBox=this.getStompBox();
    this.dronePhaseMs+=deltaTime;this.hitFlashMs=Math.max(0,this.hitFlashMs-deltaTime);
    const manager=window.enemyManager, ally=manager?.isHijacked(this);
    if(manager?.isRebooting(this)||this._hijackIdle){this.pulse=null;this.dronePhase='patrol';this.dronePhaseMs=0;return;}
    const dx=target?target.position.x-this.position.x:Infinity;
    const dy=target?target.position.y-this.position.y:Infinity;
    if(this.dronePhase==='patrol'){
      if(this.escort && target && !ally) {
        const desiredX=Math.max(90,Math.min(4006,target.position.x+(this.escort.side||1)*370));
        this.home.left=desiredX-35;this.home.right=desiredX+35;
        this.home.y=Math.max(130,target.position.y-155);
        this.position.x+=Math.sign(desiredX-this.position.x)*Math.min(Math.abs(desiredX-this.position.x),110*dt);
        this.position.y+=Math.sign(this.home.y-this.position.y)*Math.min(Math.abs(this.home.y-this.position.y),90*dt);
      }
      if(!this.escort || ally) {
      if(this.position.x<=this.home.left)this.patrolDirection=1;
      if(this.position.x>=this.home.right)this.patrolDirection=-1;
      this.velocity.x=this.patrolDirection*58;this.facing=this.patrolDirection;
      this.position.x=Math.max(this.home.left,Math.min(this.home.right,this.position.x+this.velocity.x*dt));
      this.position.y=this.home.y+Math.sin(this.animationTime/800)*5;
      }
      const bossAttack=this._bossSupport&&['telegraph','sweep'].includes(window.sector1Progression?.boss?.phase);
      if(this.dronePhaseMs>=1500&&!bossAttack&&Math.abs(dx)<(this.escort?650:380)&&Math.abs(dy)<(this.escort?320:145)&&target?.health>0){
        this.dronePhase='warning';this.dronePhaseMs=0;this.facing=dx>=0?1:-1;
        const body=target.getHitbox();
        const tx=body.x+body.width/2,ty=body.y+body.height/2;
        if (this.shotCrossesRoof(this.position.x+this.facing*48,this.position.y+30,tx,ty)) {
          this.dronePhase='patrol';this.dronePhaseMs=0;this.aim=null;return;
        }
        const angle=Math.atan2(ty-(this.position.y+30),tx-(this.position.x+this.facing*48));
        this.aim={vx:Math.cos(angle)*490,vy:Math.sin(angle)*490};
        window.audioSystem?.playCombatCue?.('windup',{material:'corrupted'});
      }
    }else if(this.dronePhase==='warning'){
      this.velocity.x=0;
      if(this.dronePhaseMs>=1150){this.dronePhase='fire';this.dronePhaseMs=0;
        this.pulse={x:this.position.x+this.facing*48,y:this.position.y+30,...this.aim,ms:0,ally};
        window.audioSystem?.playCombatCue?.('attack',{material:'corrupted'});
      }
    }else if(this.dronePhase==='fire'&&this.dronePhaseMs>=180){this.dronePhase='recovery';this.dronePhaseMs=0;}
    else if(this.dronePhase==='recovery'&&this.dronePhaseMs>=1500){this.dronePhase='patrol';this.dronePhaseMs=0;}
    if(this.pulse){
      const shot=this.pulse;shot.ms+=deltaTime;
      const oldX=shot.x,oldY=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;
      if (this.shotCrossesRoof(oldX,oldY,shot.x,shot.y)) { this.pulse=null;return; }
      // Swept pulse bounds preserve contact at low frame rates.
      const box={x:Math.min(oldX,shot.x)-8,y:Math.min(oldY,shot.y)-6,width:Math.abs(shot.x-oldX)+16,height:Math.abs(shot.y-oldY)+12};
      const victims=shot.ally?(manager?.enemies||[]).filter(e=>e!==this&&manager.isOrdinaryEnemy(e)&&!manager.isHijacked(e)&&!e.isSpawnProtected?.()):[window.player,manager?.getHijackedEnemy?.()].filter(Boolean);
      for(const victim of victims){
        if(!victim.active&&victim!==window.player)continue;
        if(!manager?.simpleAABBcollision(box,victim.getHitbox()))continue;
        if(victim===window.player){
          if(!victim.controlsDisabled&&!window.hackingSystem?.isActive?.()&&!this.isSpawnProtected())
            victim.takeDamageWithKnockback(1,Math.sign(shot.vx)*260,-180,{x:shot.x,y:shot.y});
        }else victim.takeDamage(shot.ally?2:1,{x:shot.x,y:shot.y,direction:Math.sign(shot.vx)});
        this.pulse=null;break;
      }
      if(shot.ms>850)this.pulse=null;
    }
  }
  getHitbox(){const scale=this.escort?0.8:1;return {x:this.position.x-50*scale,y:this.position.y-25*scale,width:100*scale,height:82*scale};}
  shotCrossesRoof(ax,ay,bx,by) {
    if (Math.abs(by-ay)<.00001) return false;
    return (window.sector1Progression?.getStageSurfaces?.() || []).some(s => {
      const t=(s.y-ay)/(by-ay);
      const x=ax+(bx-ax)*t;
      return t>0 && t<=1 && x>=s.x && x<=s.x+s.w;
    });
  }
  getStompBox(){return this.getHitbox();}
  getVisualBounds(){return this.getHitbox();}
  getPointValue(){return this.escort?0:250;}
  draw(ctx){
    if(!this.active||!ctx)return;
    const frame=this.hitFlashMs>0?7:this.dronePhase==='warning'?(this.dronePhaseMs<650?4:5):this.dronePhase==='fire'?6:Math.floor(this.animationTime/130)%4;
    const box=this.getHitbox();ctx.save();
    if(this.isSpawnProtected())ctx.globalAlpha=0.5;
    ctx.save();
    if(this.escort)ctx.filter=this._bossSupport?'hue-rotate(135deg) saturate(1.7) brightness(1.15)':'hue-rotate(275deg) saturate(1.5)';
    const size=this.escort?125:156;
    const art=window.BARCODE?.PresentationAssets;
    art?.draw('rooftopDrone',ctx,{x:this.position.x,y:this.position.y+15,width:size,height:size,frame,flip:this.facing<0});
    if(frame>=4 && !window.BARCODE?.Preferences?.values.reducedMotion){
      // Keep the authored warning/fire/hit body while its two real engine
      // plumes continue their four-cel loop. Clip only the jet pixels from
      // that same atlas; the gun, lens and combat pose keep their phase.
      ctx.save();ctx.beginPath();
      for(const side of [-1,1])ctx.rect(this.position.x+side*size*.235-size*.075,
        this.position.y+15+size*.19,size*.15,size*.28);
      ctx.clip();
      art?.draw('rooftopDrone',ctx,{x:this.position.x,y:this.position.y+15,width:size,height:size,
        frame:Math.floor(this.animationTime/90)%4,flip:this.facing<0});
      ctx.restore();
    }
    ctx.restore();
    if(this.escort){
      ctx.fillStyle=this._bossSupport?'#ff90db':'#9effb1';ctx.font='bold 13px Oxanium, monospace';ctx.textAlign='center';ctx.textBaseline='alphabetic';
      ctx.fillText(this._bossSupport?'BOSS SUPPORT':'RELAY GUARD',this.position.x,this.position.y-56);
      for(let i=0;i<4;i++){ctx.fillStyle=i<this.health?(this._bossSupport?'#ff90db':'#9effb1'):'#243548';ctx.fillRect(this.position.x-27+i*14,this.position.y-48,11,4);}
    }
    if(this.dronePhase==='warning'&&this.aim){
      ctx.strokeStyle='#ffcc78';ctx.lineWidth=2;ctx.setLineDash([8,8]);
      ctx.beginPath();ctx.moveTo(this.position.x+this.facing*48,this.position.y+30);ctx.lineTo(this.position.x+this.facing*48+this.aim.vx*.85,this.position.y+30+this.aim.vy*.85);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(this.position.x,this.position.y-62,12,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,this.dronePhaseMs/1150));ctx.stroke();
    }
    if(this.pulse){ctx.strokeStyle='#defca6';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(this.pulse.x,this.pulse.y);ctx.lineTo(this.pulse.x-this.pulse.vx*.032,this.pulse.y-this.pulse.vy*.032);ctx.stroke();}
    ctx.restore();
    window.enemyManager?.drawHijackMarker?.(ctx,this);
  }
};

// ==========================================
// 3. ENEMY MANAGER
// ==========================================
window.EnemyManager = class EnemyManager {
  static get HIJACK_DURATION_MS() { return 12000; }
  constructor() {
    this.enemies = [];
    this.minEnemies = 2;
    this.maxEnemies = 8;
    this.spawnTimer = 0;
    this.nextSpawnTime = 800 + Math.random() * 1200;
    this.defeatedCount = 0;

    this.spawnLocations = this.generateSpawnLocations();
    this.lastSpawnPosition = null;
    this.spawnAvoidanceRadius = 150;

    this.lastFirewallSpawnTime = 0;
    this.firewallSpawnCooldown = 4000;
    this.activeFirewallCount = 0;

    this.spawnFlowState = 'building';
    this.flowTimer = 0;
    this.enemySpawnWaves = 0;
    this.baseSpawnRate = 1.0;

    this.currentSpawnZone = 'right';
    this.zoneRotationTimer = 0;
    this.zoneRotationInterval = 15000;

    // Crowd mechanics system (Restored from previous version to prevent crash)
    this.crowdGroups = [];
    this.crowdCheckTimer = 0;
    this.crowdCheckInterval = 500;
    this.simulationTimeMs = 0;
    this.hostileSimulationTimeMs = 0;
    this.hackTrails = new Map();
  }

  update(deltaTime, player) {
    if (!player || window.isPaused || window.gameState?.paused || window.gameState?.gameOver || window.gameState?.victory) return;

    const progression = window.sector1Progression;
    const suppressMissionSimulation = progression && progression.isGameplaySuppressed && progression.isGameplaySuppressed();
    if (suppressMissionSimulation) return;

    const tacticalFocusClock = window.BARCODE && window.BARCODE.TacticalFocusClock;
    const hostileDeltaTime = tacticalFocusClock && typeof tacticalFocusClock.scaleDelta === 'function'
      ? tacticalFocusClock.scaleDelta(deltaTime)
      : deltaTime;
    this.simulationTimeMs += deltaTime;
    this.hostileSimulationTimeMs = Number.isFinite(this.hostileSimulationTimeMs) ? this.hostileSimulationTimeMs + hostileDeltaTime : this.simulationTimeMs;

    this.updateSpawnFlow(hostileDeltaTime);
    this.updateSpawnZones(hostileDeltaTime);

    const tutorial = window.tutorialSystem;
    const tutorialWaiting = tutorial && tutorial.isActive() && tutorial.storyChapter === 1 && tutorial.combatEnemiesPaused;

    // Update Enemies; tactical hack focus slows hostile simulation without pausing art/audio.
    this.enemies.forEach(enemy => {
      if (enemy._hijackedUntilMs && this.simulationTimeMs >= enemy._hijackedUntilMs) this.releaseHijack(enemy);
      if (this.isRebooting(enemy)) { enemy.velocity.x = 0; return; }
      const target = this.getCombatTarget(enemy, player);
      enemy._hijackIdle = this.isHijacked(enemy) && !target;
      enemy.update(hostileDeltaTime, target || player, this.hostileSimulationTimeMs);

      // Tutorial Freeze Logic
      if (enemy.type === 'virus' && tutorialWaiting && enemy.active) {
        if (enemy.state !== 'patrol') enemy.state = 'patrol';
        if (enemy.position.y > ENEMY_GROUND_Y) enemy.position.y = ENEMY_GROUND_Y;
        const playerRef = window.player;
        if (playerRef && enemy.entranceComplete) {
           enemy.velocity.x = Math.sin(this.hostileSimulationTimeMs / 1000 + enemy.phaseOffset) * 20;
        }
      }
    });

    window.sector1Progression?.constrainEncounterEnemies?.();
    this.checkEnemyCollisions();
    this.checkCollisions(player);
    window.sector1Progression?.constrainEncounterEnemies?.();

    // Clean up dead enemies; the manager is the authoritative defeat owner.
    const newlyDefeated = this.enemies.filter(e => !e.active && e.health <= 0 && !e._defeatRecorded);
    newlyDefeated.forEach(enemy => this.recordDefeat(enemy));
    this.enemies = this.enemies.filter(e => e.active);
    this.activeFirewallCount = this.enemies.filter(e => e.type === 'firewall').length;
    this.updateHackTrails(deltaTime);

    // ENHANCED Spacing Check
    if (!this.hasAdequateSpacing(player)) return;

    const missionSuppressesGenericSpawning = window.sector1Progression && window.sector1Progression.shouldSuppressGenericSpawning && window.sector1Progression.shouldSuppressGenericSpawning();
    const isMainGame = !tutorial || !tutorial.isActive();
    if (isMainGame && !missionSuppressesGenericSpawning && this.shouldSpawnEnemy(this.enemies.length)) {
        this.spawnTimer += hostileDeltaTime;
        if (this.spawnTimer >= this.nextSpawnTime) {
            this.spawnFlowEnemy(player);
            this.spawnTimer = 0;
            this.nextSpawnTime = 1000 + Math.random() * 2000;
        }
    }

    // Update crowd mechanics
    this.updateCrowdMechanics(hostileDeltaTime, player);
    // Authored encounter gates constrain every required actor after movement,
    // contact separation and crowd steering have all finished for this frame.
    window.sector1Progression?.constrainEncounterEnemies?.();
  }

  checkEnemyCollisions() {
    for (let i = 0; i < this.enemies.length; i++) for (let j = i + 1; j < this.enemies.length; j++) {
      const a = this.enemies[i], b = this.enemies[j];
      if (!a.active || !b.active || a.isSpawnProtected() || b.isSpawnProtected()) continue;
      const ab = a.getCollisionBox(), bb = b.getCollisionBox();
      if (!this.simpleAABBcollision(ab, bb)) continue;
      if (this.isHijacked(a) !== this.isHijacked(b) && !this.isRebooting(a) && !this.isRebooting(b)) {
        const ally = this.isHijacked(a) ? a : b, hostile = ally === a ? b : a;
        // Each actor's existing attack commitment owns its hit. A bounded
        // contact clock prevents sustained overlap from dealing frame-rate damage.
        for (const [attacker, victim, damage] of [[ally, hostile, 2], [hostile, ally, 1]]) {
          if (!attacker.active || !victim.active || !this.isOrdinaryEnemy(victim)) continue;
          const committed = attacker.type === 'virus' ? attacker.role !== 'swooper' || attacker.swooperState === 'dive' : attacker.combatPattern === 'attack';
          if (!committed || this.simulationTimeMs < (attacker._nextAllegianceHitMs || 0)) continue;
          attacker._nextAllegianceHitMs = this.simulationTimeMs + 900;
          victim.takeDamage(damage, { x: victim.position.x, y: victim.getHitbox().y + 25, direction: Math.sign(victim.position.x - attacker.position.x) || 1 });
        }
      }
      const overlap = Math.min(ab.x + ab.width - bb.x, bb.x + bb.width - ab.x);
      const direction = a.position.x <= b.position.x ? 1 : -1;
      // Horizontal separation only: crowd contact cannot levitate actors or
      // turn a body overlap into a head landing. No per-frame velocity damping.
      a.position.x -= direction * overlap / 2;
      b.position.x += direction * overlap / 2;
    }
  }

  getHostileClockNow() {
      if (Number.isFinite(this.hostileSimulationTimeMs) && (this.hostileSimulationTimeMs !== 0 || this.simulationTimeMs === 0)) return this.hostileSimulationTimeMs;
      return this.simulationTimeMs;
  }

  isOrdinaryEnemy(enemy) {
    return !!(enemy?.active && !enemy._defeatRecorded && !enemy._disposed && ['virus', 'corrupted', 'firewall', 'drone'].includes(enemy.type));
  }

  isHijacked(enemy) { return !!(enemy?.active && enemy._hijackedUntilMs > this.simulationTimeMs); }
  isRebooting(enemy) { return !!(enemy?.active && enemy._hijackRebootUntilMs > this.simulationTimeMs); }
  getHijackedEnemy() { return this.enemies.find(e => this.isHijacked(e)) || null; }

  findHijackTarget(player = window.player) {
    if (!player || this.getHijackedEnemy()) return null;
    let best = null, nearest = 520;
    for (const e of this.enemies) {
      if (!this.isOrdinaryEnemy(e) || e._isTutorialEnemy || e._authoredEntranceActive || e.entranceComplete === false || e.isSpawnProtected?.() || this.isRebooting(e)) continue;
      const d = Math.hypot(e.position.x - player.position.x, e.position.y - player.position.y);
      if (d < nearest) { best = e; nearest = d; }
    }
    return best;
  }

  resetAllegianceMotion(enemy) {
    Object.assign(enemy, { combatPattern: 'approach', combatPatternMs: 0, behaviorState: 'normal', isLunging: false,
      dronePhase: 'patrol', dronePhaseMs: 0, pulse: null, swooperState: 'approach', swooperTimerMs: 0, swooperAim: null, hoverState: 'none', _hijackIdle: false,
      _inCrowd: false, _crowdBurstTimer: 0, _nextAllegianceHitMs: 0, _stunnedUntilMs: 0 });
    if (enemy.velocity) enemy.velocity.x = 0;
  }

  hijackEnemy(enemy) {
    if (!this.enemies.includes(enemy) || !this.isOrdinaryEnemy(enemy) || enemy._isTutorialEnemy || this.getHijackedEnemy() || enemy._authoredEntranceActive || enemy.entranceComplete === false || enemy.isSpawnProtected?.()) return false;
    this.resetAllegianceMotion(enemy);
    enemy._hijackRebootUntilMs = 0;
    enemy._hijackedUntilMs = this.simulationTimeMs + window.EnemyManager.HIJACK_DURATION_MS;
    try { window.audioSystem?.playCombatCue?.('hijack'); } catch (error) { console.warn('Hijack cue unavailable', error); }
    return true;
  }

  releaseHijack(enemy = this.getHijackedEnemy()) {
    if (!enemy?._hijackedUntilMs) return false;
    enemy._hijackedUntilMs = 0;
    enemy._hijackRebootUntilMs = this.simulationTimeMs + 1000;
    this.resetAllegianceMotion(enemy);
    try { window.audioSystem?.playCombatCue?.('hijackRelease'); } catch (error) { console.warn('Release cue unavailable', error); }
    return true;
  }

  getCombatTarget(enemy, player) {
    const ally = this.getHijackedEnemy();
    if (enemy === ally) {
      let best = null, nearest = Infinity;
      for (const other of this.enemies) {
        if (other === enemy || !this.isOrdinaryEnemy(other) || other._authoredEntranceActive || other.isSpawnProtected?.()) continue;
        const d = Math.hypot(other.position.x - enemy.position.x, other.position.y - enemy.position.y);
        if (d < nearest) { best = other; nearest = d; }
      }
      return best;
    }
    if (ally && this.isOrdinaryEnemy(enemy)) {
      const d = Math.hypot(ally.position.x - enemy.position.x, ally.position.y - enemy.position.y);
      const playerDistance = Math.hypot(player.position.x - enemy.position.x, player.position.y - enemy.position.y);
      if (d < Math.min(600, playerDistance)) return ally;
    }
    return player;
  }

  getReadyHijackMarker() {
    const hack=window.hackingSystem;
    return !hack?.active && window.player?.grounded && !window.tutorialSystem?.isActive?.() &&
      (hack?.getCooldownRemainingMs?.() || 0) === 0 && !window.sector1Progression?.isGameplaySuppressed?.() ? this.findHijackTarget() : null;
  }

  drawHijackMarker(ctx, enemy) {
    const ally = this.isHijacked(enemy), reboot = this.isRebooting(enemy), hack = window.hackingSystem;
    const locked = hack?.active && hack.hijackTarget === enemy;
    const ready = (this._drawingMarkers ? this._readyHijackMarker : this.getReadyHijackMarker()) === enemy;
    if (!ally && !reboot && !locked && !ready) return;
    const box = enemy.getStompBox(), seconds = Math.max(0, (enemy._hijackedUntilMs - this.simulationTimeMs) / 1000);
    const color = reboot || ally && seconds <= 2 ? '#ffc07b' : ally ? '#c0ed55' : '#a98ee9';
    const y = box.y - 74;
    ctx.save(); ctx.shadowBlur = 0; ctx.textBaseline='alphabetic';
    ctx.strokeStyle = color; ctx.lineWidth = ally ? 3 : 2;
    for (const side of [-1, 1]) {
      const x = side < 0 ? box.x - 9 : box.x + box.width + 9;
      ctx.beginPath(); ctx.moveTo(x - side * 12, box.y - 4); ctx.lineTo(x, box.y - 4); ctx.lineTo(x, box.y + 20); ctx.stroke();
    }
    const inputKey = window.BARCODE?.ControllerSettings?.prompt('interact','H') || 'H';
    if (ready && !ally && !reboot && !locked) {
      ctx.font='bold 18px Oxanium, monospace';
      const width=Math.max(30,Math.ceil(ctx.measureText(inputKey).width)+12),x=enemy.position.x-width/2;
      ctx.fillStyle = '#0b1017'; ctx.fillRect(x,y+28,width,27);
      ctx.fillStyle = color; window.BARCODE.ComicHUD.buttonText(ctx,inputKey,x,y+28,width,27);
      ctx.restore(); return;
    }
    ctx.fillStyle = '#0b1017'; ctx.fillRect(enemy.position.x - 100, y, 200, ally ? 45 : 27);
    ctx.fillStyle = color; ctx.font = 'bold 17px Oxanium, monospace'; ctx.textAlign = 'center';
    ctx.fillText(ally ? `6 BIT // ALLY ${Math.ceil(seconds)}s` : reboot ? 'REBOOTING' : locked ? 'HIJACK TARGET' : `${window.BARCODE?.ControllerSettings?.prompt('interact', 'H') || 'H'}: HIJACK`, enemy.position.x, y + 20);
    if (ally) {
      ctx.fillStyle = '#26353a'; ctx.fillRect(enemy.position.x - 90, y + 28, 180, 4);
      ctx.fillStyle = color; ctx.fillRect(enemy.position.x - 90, y + 28, 180 * seconds * 1000 / window.EnemyManager.HIJACK_DURATION_MS, 4);
      ctx.font = '12px Oxanium, monospace'; ctx.fillText(seconds <= 2 ? 'CONTROL EXPIRING' : `${inputKey}: RELEASE`, enemy.position.x, y + 43);
    }
    ctx.restore();
  }

  checkCollisions(player) {
    const sweep = player.controlsDisabled ? null : player.contactSweep;
    player.contactSweep = null;
    let landing = null;
    if (sweep && sweep.currentFootY > sweep.previousFootY && player.velocity.y >= 0) {
      for (const enemy of this.enemies) {
        if (!enemy.active || this.isHijacked(enemy)) continue;
        const box = enemy.getStompBox?.() || enemy.getHitbox(), previous = enemy.previousStompBox || box;
        const before = sweep.previousFootY - previous.y;
        const after = sweep.currentFootY - box.y;
        if (before > 14 || after < 0 || after <= before) continue;
        const t = Math.max(0, Math.min(1, -before / (after - before)));
        const x = sweep.previousX + (sweep.currentX - sweep.previousX) * t;
        const left = previous.x + (box.x - previous.x) * t;
        if (x + 26 <= left || x - 26 >= left + box.width) continue;
        if (!landing || t < landing.t) landing = { enemy, box, x, t };
      }
    }
    if (landing) {
      const { enemy, box, x } = landing;
      const direction = Math.sign(player.position.x - enemy.position.x) || player.facing || 1;
      enemy.takeDamage(999, { x, y: box.y, direction });
      player.position.y = box.y - 72;
      window.audioSystem?.playCombatCue?.('stomp');
      window.BARCODE?.combatFX?.movement('stomp', player);
      if (typeof player.stompRebound === 'function') player.stompRebound();
      else player.velocity.y = -550;
      player.velocity.x = direction * 300;
      window.particleSystem?.stompEffect?.(x, box.y, enemy.type, direction);
      player._enemyInvulnerableUntilMs = this.getHostileClockNow() + 400;
      return;
    }
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy._authoredEntranceActive || enemy.isSpawnProtected?.()) { if (enemy.active) enemy._contactWasProtected = true; continue; }
      if (enemy._contactWasProtected) { enemy._contactWasProtected = false; enemy._contactSafeUntilMs = this.getHostileClockNow() + 300; }
      if (!this.simpleAABBcollision(player.getHitbox(), enemy.getHitbox())) continue;
      const graze = !this.hasHarmfulBodyContact(player, enemy);
      const previousX = sweep?.previousX ?? player.position.x;
      const direction = Math.sign(previousX - enemy.position.x) || -player.facing || 1;
      const now = this.getHostileClockNow();
      if (graze) {
        if (!Number.isFinite(enemy._grazeLastAtMs) || now - enemy._grazeLastAtMs > 150) enemy._grazeStartedAtMs = now;
        enemy._grazeLastAtMs = now;
      }
      const protectedContact = this.isHijacked(enemy) || this.isRebooting(enemy) || player.controlsDisabled ||
        player.isDamageInvulnerable?.() || now <= (player._enemyInvulnerableUntilMs || -Infinity);
      if (protectedContact) enemy._contactSafeUntilMs = Math.max(enemy._contactSafeUntilMs || 0, now + 300);
      // Body clearance is independent of damage, allegiance and recovery.
      // Horizontal resolution never creates an enemy platform or a fake stomp.
      this.separatePlayerContact(player, enemy, direction);
      if (this.simpleAABBcollision(player.getHitbox(), enemy.getHitbox())) {
        enemy._contactSafeUntilMs = now + 300;
        continue;
      }
      if (this.isHijacked(enemy) || this.isRebooting(enemy) || this.getHostileClockNow() < (enemy._contactSafeUntilMs || 0)) continue;
      if (player.controlsDisabled || now <= (player._enemyInvulnerableUntilMs || -Infinity)) continue;
      if (Number.isFinite(enemy.lastPlayerHitTimeMs) && now - enemy.lastPlayerHitTimeMs <= 1500) continue;
      if (player.isDamageInvulnerable?.()) continue;
      if (graze && now - enemy._grazeStartedAtMs < 85) continue;
      if (window.hackingSystem?.absorbGuardHit?.()) { enemy.lastPlayerHitTimeMs = now; continue; }
      const damaged = player.takeDamageWithKnockback(enemy.damage, direction * 450, -300, enemy.position);
      if (damaged !== false) enemy.lastPlayerHitTimeMs = now;
    }
    // A later crowd member can push the player back into an earlier one.
    // Resolve remaining geometry without attempting another damage transaction.
    for (let pass = 0; pass < 3; pass++) {
      let overlap = false;
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy._authoredEntranceActive || enemy.isSpawnProtected?.() || !this.simpleAABBcollision(player.getHitbox(), enemy.getHitbox())) continue;
        overlap = true;
        this.separatePlayerContact(player, enemy, Math.sign(player.position.x - enemy.position.x) || -player.facing || 1);
        enemy._contactSafeUntilMs = this.getHostileClockNow() + 300;
      }
      if (!overlap) break;
    }
  }

  hasHarmfulBodyContact(player, enemy) {
    const body = player.getHitbox();
    // Brief outer grazes get a small escape window; sustained pressure still
    // damages. Full stable hulls always own separation and crowd resolution.
    return this.simpleAABBcollision({ x: body.x + 5, y: body.y + 8,
      width: Math.max(1, body.width - 10), height: Math.max(1, body.height - 12) }, enemy.getHitbox());
  }

  separatePlayerContact(player, enemy, direction) {
    const p = player.getHitbox(), e = enemy.getHitbox();
    const shift = direction < 0 ? e.x - (p.x + p.width) - 2 : e.x + e.width - p.x + 2;
    const moveEnemy = amount => {
      const before = enemy.position.x;
      const support = window.sector1Progression?.getActorSurfaces?.().find(s => s.id === enemy.supportedSurfaceId && Math.abs(enemy.position.y + 72 - s.y) < 3);
      const { left, right } = window.Enemy.getSurfaceWalkBounds(enemy, support);
      enemy.position.x = Math.max(left, Math.min(right, before + amount));
      if (enemy.velocity.x * amount < 0) enemy.velocity.x = 0;
      return enemy.position.x - before;
    };
    const movePlayer = amount => {
      player.position.x = window.clamp(player.position.x + amount, player.width / 2, 4096 - player.width / 2);
      window.sector1Progression?.applyGateCollision?.();
      if (player.velocity.x * direction < 0) player.velocity.x = 0;
    };
    // Puzzle/recovery controls may be stationary. Move the intruder away then.
    if (window.hackingSystem?.isActive?.() || player.controlsDisabled || player.isDamageInvulnerable?.()) {
      const moved = moveEnemy(-shift);
      const remaining = shift + moved;
      if (Math.abs(remaining) > .001) movePlayer(remaining);
    } else {
      movePlayer(shift);
      const resolved = player.getHitbox();
      if (this.simpleAABBcollision(resolved, enemy.getHitbox())) {
        const remaining = direction < 0 ? e.x - (resolved.x + resolved.width) - 2 : e.x + e.width - resolved.x + 2;
        moveEnemy(-remaining);
      }
      if (player.velocity.x * direction < 0) player.velocity.x = 0;
    }
  }

  simpleAABBcollision(r1, r2) {
      return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
             r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
  }

  hasAdequateSpacing(player) {
    const pX = player?.position?.x || 960;
    let tooClose = 0;
    this.enemies.forEach(e => {
        if (e.active && window.distance(e.position.x, e.position.y, pX, ENEMY_GROUND_Y) < 400) tooClose++;
    });
    return tooClose < 2;
  }

  generateSpawnLocations() {
      const locs = [];
      for(let i=0; i<4; i++) locs.push({x: 50, y: 200+i*150, edge: 'left'});
      for(let i=0; i<4; i++) locs.push({x: 4046, y: 200+i*150, edge: 'right'});
      return locs;
  }

  updateSpawnFlow(dt) {
      this.flowTimer += dt;
      const count = this.enemies.length;
      if (this.spawnFlowState === 'building' && count >= this.maxEnemies -1) {
          this.spawnFlowState = 'peak';
          this.flowTimer = 0;
      } else if (this.spawnFlowState === 'peak' && this.flowTimer > 10000) {
          this.spawnFlowState = 'sustaining';
          this.flowTimer = 0;
      } else if (this.spawnFlowState === 'sustaining' && this.defeatedCount > this.enemySpawnWaves * 3 + 2) {
          this.spawnFlowState = 'recovery';
          this.flowTimer = 0;
      } else if (this.spawnFlowState === 'recovery' && this.flowTimer > 8000) {
          this.spawnFlowState = 'building';
          this.flowTimer = 0;
          this.enemySpawnWaves++;
      }
  }

  updateSpawnZones(dt) {
      this.zoneRotationTimer += dt;
      if (this.zoneRotationTimer > this.zoneRotationInterval) {
          const zones = ['left', 'right', 'both', 'center'];
          this.currentSpawnZone = zones[Math.floor(Math.random() * zones.length)];
          this.zoneRotationTimer = 0;
      }
  }

  shouldSpawnEnemy(count) {
      if (count >= this.maxEnemies) return false;
      if (this.spawnFlowState === 'recovery') return count < 2;
      return true;
  }

  spawnFlowEnemy(player) {
      if (this.enemies.length >= this.maxEnemies) return;

      const types = ['virus', 'corrupted', 'firewall'];
      let type = types[Math.floor(Math.random() * types.length)];

      // Enhanced firewall spawning - all firewalls now use enhanced behavior
      if (type === 'firewall') {
        if (this.activeFirewallCount >= 1) { // Only 1 firewall at a time
          type = 'corrupted';
        } else {
          this.lastFirewallSpawnTime = this.simulationTimeMs;
          console.log('🔥 Spawning enhanced firewall with built-in proximity attack system');
        }
      }

      let x, y = 200;
      if (type === 'virus') {
          x = -50; // Always spawn from left, off-screen
          y = -50;
      } else {
          if (type === 'firewall') x = 4500;
          else x = Math.random() > 0.5 ? 100 : 3900;

          if (Math.abs(x - player.position.x) < 600) {
              x = player.position.x + (x > player.position.x ? 600 : -600);
          }
      }

      const enemy = new window.Enemy(x, y, type);
      if (type === 'virus') {
        enemy._dropEdge = 'top';
        enemy.entranceComplete = false;
        enemy.state = 'entrance';
        enemy.velocity.x = 50 + Math.random() * 30; // Randomize to prevent overlap
        enemy.velocity.y = 120 + Math.random() * 30;
        enemy.isOnGround = false;
      }
      this.enemies.push(enemy);
  }

  getActiveEnemies() { return this.enemies; }
  clearHackTrails() { this.hackTrails.clear(); }
  hasHackTrails() {
    const prefs = window.BARCODE?.Preferences?.values;
    return !!window.BARCODE?.TacticalFocusClock?.isActive?.() && !prefs?.reducedMotion && !prefs?.reducedFlashes && prefs?.flashes !== false;
  }
  updateHackTrails(deltaTime) {
    if (!this.hasHackTrails()) { this.clearHackTrails(); return; }
    for (const enemy of this.hackTrails.keys()) if (!enemy.active || !this.enemies.includes(enemy)) this.hackTrails.delete(enemy);
    for (const enemy of this.enemies.slice(0, 12)) {
      if (!enemy.active || this.isHijacked(enemy) || this.isRebooting(enemy)) { this.hackTrails.delete(enemy); continue; }
      let trail = this.hackTrails.get(enemy);
      if (!trail) { trail = { samples: [], elapsedMs: 120 }; this.hackTrails.set(enemy, trail); }
      trail.elapsedMs += deltaTime;
      trail.samples = trail.samples.filter(s => (s.ageMs += deltaTime) < 700);
      const last = trail.samples.at(-1);
      if (trail.elapsedMs >= 120 && (!last || Math.hypot(enemy.position.x - last.x, enemy.position.y - last.y) >= 3)) {
        trail.samples.push({ x: enemy.position.x, y: enemy.position.y, ageMs: 0 });
        if (trail.samples.length > 5) trail.samples.shift();
        trail.elapsedMs %= 120;
      }
    }
  }
  drawHackTrail(ctx, enemy) {
    const samples = this.hackTrails.get(enemy)?.samples;
    if (!samples?.length || !this.hasHackTrails()) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // The three ribbons retain the full movement history. One recent body
    // echo is enough to show dilation without compositing five filtered,
    // scaled canonical cels for each enemy in a crowded hack scene.
    for (let i = samples.length - 1; i >= 0; i--) {
      const sample = samples[i];
      if (Math.hypot(enemy.position.x - sample.x, enemy.position.y - sample.y) < 3) continue;
      ctx.save(); ctx.globalAlpha *= 0.22 * (1 - sample.ageMs / 700);
      ctx.translate(sample.x - enemy.position.x, sample.y - enemy.position.y);
      // Reuse the complete drawing without ticking animation, AI or hitboxes.
      if (enemy.type === 'drone') window.BARCODE?.PresentationAssets?.draw('rooftopDrone', ctx,
        { x: enemy.position.x, y: enemy.position.y + 15, width: 156, height: 156, frame: 0, flip: enemy.facing < 0 });
      else if (enemy.spriteReady && enemy.sprite) enemy.drawSprite(ctx);
      ctx.restore();
      break;
    }
    for (const [index, offset] of [-30, 0, 28].entries()) {
      ctx.globalAlpha = 0.3; ctx.strokeStyle = index === 1 ? '#bb99ff' : '#8bfff1'; ctx.lineWidth = index === 1 ? 2 : 1;
      ctx.beginPath();
      samples.forEach((s, i) => { const y = s.y + offset; if (i) ctx.lineTo(s.x, y); else ctx.moveTo(s.x, y); });
      ctx.lineTo(enemy.position.x, enemy.position.y + offset); ctx.stroke();
    }
    ctx.restore();
  }
  draw(ctx, liftRoofPass = null) {
    const progression = window.sector1Progression;
    // Select once per draw pass rather than scanning the crowd for every
    // enemy. Scope it to this call so moving targets cannot outlive a frame.
    this._readyHijackMarker=this.getReadyHijackMarker();this._drawingMarkers=true;
    try {
      // Stable drawing layers, without a copied/sorted array each frame.
      for (const layer of [-1, 1]) for (const enemy of this.enemies) {
        if (enemy.getDrawLayer() !== layer || !enemy.active) continue;
        if (window.BARCODE?.combatFX && !window.BARCODE.combatFX.visible(enemy.position.x, enemy.position.y, 300)) continue;
        if (liftRoofPass !== null) {
          // Roof riders and cabin passengers share the player's layer between
          // the cabin back and front rails; actors below its floor stay behind.
          const inFrontOfLift = progression?.getLiftActorLayer?.(enemy) === 'front';
          if (inFrontOfLift !== liftRoofPass) continue;
        }
        this.drawHackTrail(ctx, enemy);
        enemy.draw(ctx);
      }
    } finally { this._drawingMarkers=false;this._readyHijackMarker=null; }
  }

  spawnEnemy() { this.spawnFlowEnemy(window.player || {position:{x:960,y:ENEMY_GROUND_Y}}); }

  spawnEnemyAt(x, y) {
    if (this.enemies.length >= this.maxEnemies) return;
    const types = ['virus', 'corrupted'];
    const type = types[Math.floor(Math.random() * types.length)];
    const enemy = new window.Enemy(x, y, type);
    if (type === 'virus' && y < 500) {
        enemy._dropEdge = 'top';
        enemy.entranceComplete = false;
        enemy.state = 'entrance';
        enemy.velocity.y = 120;
        enemy.isOnGround = false;
    }
    this.enemies.push(enemy);
  }

  checkPlayerAttacks(player, attackTransaction = null) {
    // Deprecated compatibility shim: BARCODE.PlayerCombat is the only production damage owner.
    if (attackTransaction && attackTransaction.__fromPlayerCombat === true && window.BARCODE && window.BARCODE.playerCombat) {
      return window.BARCODE.playerCombat.resolvePrimary({ player, enemyManager: this, timing: attackTransaction.timing });
    }
    return { ok: false, action: 'primary', reason: 'combat-owned-by-player-combat', targets: [] };
  }

  // Restored Crowd Mechanics methods
  updateCrowdMechanics(deltaTime, player) {
    this.crowdCheckTimer += deltaTime;
    if (this.crowdCheckTimer >= this.crowdCheckInterval) {
      this.crowdCheckTimer = 0;
      this.detectCrowds();
    }

    // Apply crowd behaviors
    this.enemies.forEach(enemy => {
      if (enemy._crowdBurstTimer) {
        enemy._crowdBurstTimer = Math.max(0, enemy._crowdBurstTimer - deltaTime);
        if (enemy._crowdBurstTimer === 0) enemy._crowdBurstMultiplier = 1;
      }
    });
    this.crowdGroups.forEach(group => {
      this.applyCrowdBehavior(group, player, deltaTime);
    });
  }

  detectCrowds() {
    this.crowdGroups = [];
    const activeEnemies = this.enemies.filter(e => e.active && e.entranceComplete && !this.isHijacked(e) && !this.isRebooting(e));
    const processed = new Set();

    activeEnemies.forEach(enemy => {
      if (processed.has(enemy)) return;

      const group = this.findNearbyEnemies(enemy, activeEnemies, 120);
      if (group.length >= 3) {
        this.crowdGroups.push(group);
        group.forEach(e => processed.add(e));
        this.applyCrowdEffects(group);
      }
    });
  }

  findNearbyEnemies(centerEnemy, allEnemies, radius) {
    const group = [centerEnemy];
    allEnemies.forEach(enemy => {
      if (enemy === centerEnemy) return;
      const dist = window.distance(centerEnemy.position.x, centerEnemy.position.y, enemy.position.x, enemy.position.y);
      if (dist <= radius) {
        group.push(enemy);
      }
    });
    return group;
  }

  applyCrowdEffects(group) {
    group.forEach(enemy => {
      enemy._inCrowd = true;
      enemy._crowdSize = group.length;

      if (group.length >= 5) {
        enemy._crowdSpeed = 0.7;
        enemy._crowdAggression = 1.5;
      } else if (group.length >= 3) {
        enemy._crowdSpeed = 0.85;
        enemy._crowdAggression = 1.2;
      }

      if (window.particleSystem && Math.random() < 0.1) {
        // visual indicator removed to reduce noise, logic remains
      }
    });
  }

  applyCrowdBehavior(group, player, deltaTime) {
    if (group.length < 3) return;

    const groupCenter = {
      x: group.reduce((sum, e) => sum + e.position.x, 0) / group.length,
      y: group.reduce((sum, e) => sum + e.position.y, 0) / group.length
    };

    const distToPlayer = window.distance(groupCenter.x, groupCenter.y, player.position.x, player.position.y);

    group.forEach((enemy, index) => {
      if (!enemy._inCrowd || this.isHijacked(enemy) || this.isRebooting(enemy)) return;
      // Ground combat and aerial patrols retain one motion owner, including
      // the approach phase. Legacy formation orbits cannot levitate actors.
      if (enemy.type !== 'virus' || enemy.role === 'swooper') return;
      // A shown warning commits to its authored aim through attack/recovery.
      // Separation still resolves bodies in the manager; formation steering
      // must not write another velocity over that commitment afterwards.
      if (enemy.role === 'swooper' && ['telegraph', 'dive', 'recovery'].includes(enemy.swooperState)) return;
      if ((enemy._sector1MissionEnemy || enemy._jammerReinforcement) && ['brace', 'attack', 'recovery'].includes(enemy.combatPattern)) return;

      const time = this.getHostileClockNow() / 1000;
      const phaseShift = (index / group.length) * Math.PI * 2;

      if (distToPlayer < 400) {
        const angleToPlayer = Math.atan2(player.position.y - groupCenter.y, player.position.x - groupCenter.x);
        const spreadAngle = angleToPlayer + Math.sin(time + phaseShift) * 0.3;

        if (enemy.type === 'virus') {
          enemy.velocity.x = Math.cos(spreadAngle) * enemy.speed * (enemy._crowdSpeed || 1) * (enemy._crowdBurstMultiplier || 1) * 1.3;
          if (Math.sin(time * 2 + phaseShift) > 0.8 && enemy.isOnGround) {
            enemy.velocity.y = -enemy.speed * 0.15;
          }
        } else if (enemy.type === 'corrupted') {
          enemy.velocity.x = Math.cos(spreadAngle) * enemy.speed * (enemy._crowdSpeed || 1) * (enemy._crowdBurstMultiplier || 1) * 1.2;
        }

        if (enemy._crowdAggression && Math.random() < 0.01 * enemy._crowdAggression) {
          enemy._crowdBurstTimer = 2000;
          enemy._crowdBurstMultiplier = 1.2;
        }
      } else {
        const formationAngle = Math.atan2(enemy.position.y - groupCenter.y, enemy.position.x - groupCenter.x);
        const orbitSpeed = 0.5;

        enemy.velocity.x = Math.cos(formationAngle + Math.PI/2) * enemy.speed * orbitSpeed;
        // Vertical velocity remains under gravity/the virus hop controller.
      }
    });
  }

  recordDefeat(enemy) {
    if (!enemy || enemy._defeatRecorded) return false;
    enemy._defeatRecorded = true;
    window.sector1Progression?.dropCarrierRepair?.(enemy);
    const countsTowardDefeatProjection = !enemy._jammerReinforcement && !enemy._bossSupport;
    if (countsTowardDefeatProjection) {
      this.defeatedCount += 1;
      if (window.gameState) window.gameState.enemiesDefeated = this.defeatedCount;
      if (window.sector1Progression && typeof window.sector1Progression.onEnemyDefeated === 'function') window.sector1Progression.onEnemyDefeated(this.defeatedCount, enemy);
    }
    if (enemy._isTutorialEnemy && window.tutorialSystem && window.tutorialSystem.isActive && window.tutorialSystem.isActive() && window.tutorialSystem.storyChapter === 1) {
      if (window.tutorialSystem.recordEnemyDefeat) window.tutorialSystem.recordEnemyDefeat(enemy);
      else {
        window.tutorialSystem._tutorialEnemiesDefeated = (window.tutorialSystem._tutorialEnemiesDefeated || 0) + 1;
        if (window.tutorialSystem._tutorialEnemiesDefeated >= 3) window.tutorialSystem.checkObjective('combat');
      }
    }
    return true;
  }

  purgeForCinematic() {
    if (this._cinematicPurgeComplete) return false;
    this._cinematicPurgeComplete = true;
    const activeEnemies = this.enemies.filter(e => e && e.active && !e._purgedByCinematic);
    if (activeEnemies.length && window.audioSystem && typeof window.audioSystem.playSound === 'function') window.audioSystem.playSound('synthHit', 0.2);
    activeEnemies.forEach(e => {
      e.velocity.x = 0; e.velocity.y = 0; e._purgedByCinematic = true; e._defeatRecorded = true;
      if (window.particleSystem) {
        if (typeof window.particleSystem.impact === 'function') window.particleSystem.impact(e.position.x, e.position.y, '#ff00ff', 28);
        if (typeof window.particleSystem.enemyDeathEffect === 'function') window.particleSystem.enemyDeathEffect(e.position.x, e.position.y, e.type);
      }
      e.active = false; e._disposed = true; e._generation = (e._generation || 0) + 1;
    });
    this.enemies = this.enemies.filter(e => !e._purgedByCinematic && e.active);
    this.crowdGroups = [];
    this.activeFirewallCount = 0;
    return activeEnemies.length > 0;
  }

  getDiagnostics() {
    return { activeEnemies: this.getActiveEnemies().length, totalEnemies: this.enemies.length, defeatedCount: this.defeatedCount, crowdGroups: this.crowdGroups.length, simulationTimeMs: this.simulationTimeMs, pendingSpritePolls: this.enemies.filter(e => e._spriteRequested && !e.spriteReady && !e._disposed).length };
  }

  reset(options = {}) { this.clear(options); }

  dispose(options = {}) { this.clear(options); this._disposed = true; }

  clear(options = {}) {
    this.clearHackTrails();
    this.enemies.forEach(e => { e.active = false; e._disposed = true; e._generation = (e._generation || 0) + 1; e._crowdBurstTimer = 0; e._crowdBurstMultiplier = 1; });
    this.enemies = [];
    if (!options.preserveDefeats) this.defeatedCount = 0;
    this.spawnTimer = 0;
    this.spawnFlowState = 'building';
    this.crowdGroups = [];
    this._cinematicPurgeComplete = false;
    if (!options.preserveDefeats) { this.simulationTimeMs = 0; this.hostileSimulationTimeMs = 0; }
    if (typeof window.syncEnemyDefeatProjections === 'function') window.syncEnemyDefeatProjections(this.defeatedCount);
    console.log('✓ Enemy Manager cleared');
  }
};

// Global Initialization
function createEnemyManager() {
  if (window.Vector2D && window.distance && window.clamp && window.randomRange) {
    if (!window.enemyManager) {
      window.enemyManager = new window.EnemyManager();
      console.log("✅ Enemy Manager Initialized");
    }
    return window.enemyManager;
  } else {
    console.warn('Enemy manager dependencies not ready; script order should load math utilities before enemies.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createEnemyManager);
} else {
  createEnemyManager();
}
