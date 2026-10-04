// Sector 1 authored Level 1 mission progression owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/sector1-progression.js', exports: ['Sector1Progression', 'sector1Progression', 'initSector1Progression'], dependencies: ['player', 'enemyManager', 'BARCODE.JammerEnvironment'] });

(function() {
  const WORLD_WIDTH = 4096;
  const CANVAS_WIDTH = 1920;
  const GROUND_Y = window.Player.GROUND_Y;
  // Shared street anchor; surfaces and parapets use visible-foot coordinates.
  const PLAYER_VISUAL_FOOT_OFFSET = window.Player.VISUAL_FOOT_OFFSET_Y;
  const CAMERA_MIN = CANVAS_WIDTH / 2;
  const CAMERA_MAX = WORLD_WIDTH - CANVAS_WIDTH / 2;
  // About 42% of the level: the middle third plus a little space on each side.
  // Lift approach space is reserved inside this band, never replaced by an
  // alternate spawn at the right edge where the boss camera is already framed.
  const JAMMER_PLACEMENT = Object.freeze({ minX: 1180, maxX: 2916 });
  const COMPLETION_PRESENTATION = Object.freeze({ holdMs: 620, fadeMs: 240, rowMs: 760, staggerMs: 220, releaseMs: 250 });

  const STATES = Object.freeze({
    TUTORIAL: 'tutorial', ENCOUNTER_1: 'encounter_1', ENCOUNTER_2: 'encounter_2', ENCOUNTER_3: 'encounter_3', ENCOUNTER_4: 'encounter_4',
    JAMMER_ACTIVE: 'jammer_active', FREEZE: 'jammer_destroyed_freeze', ENEMY_PURGE: 'enemy_purge', CAMERA_PAN: 'camera_pan',
    BOSS_WALK_IN: 'boss_walk_in', BOSS_CLOSE_UP: 'boss_close_up', BOSS_FLOURISH: 'boss_flourish', BOSS_HOLD: 'boss_hold',
    CAMERA_RETURN: 'camera_return', BOSS_READY: 'boss_ready', BOSS_COMBAT: 'boss_combat', LEVEL_COMPLETE: 'level_complete'
  });

  const ENCOUNTERS = Object.freeze([
    { id: 'encounter_1', triggerX: 520, label: 'Signal Alley', activeCap: 3, packets: [[{ type: 'virus', x: 760, y: 650 }, { type: 'virus', x: 920, y: 650 }], [{ type: 'corrupted', x: 1080, y: 650 }, { type: 'virus', x: 1230, y: 650 }]], enemies: [{ type: 'virus', x: 760, y: 650 }, { type: 'virus', x: 920, y: 650 }, { type: 'corrupted', x: 1080, y: 650 }, { type: 'virus', x: 1230, y: 650 }] },
    { id: 'encounter_2', triggerX: 1280, label: 'Cache Overpass', activeCap: 3, packets: [[{ type: 'corrupted', x: 1440, y: 650 }, { type: 'virus', x: 1590, y: 650 }], [{ type: 'virus', x: 1740, y: 650, role: 'swooper' }, { type: 'corrupted', x: 1880, y: 650 }, { type: 'virus', x: 2020, y: 650 }]], enemies: [{ type: 'corrupted', x: 1440, y: 650 }, { type: 'virus', x: 1590, y: 650 }, { type: 'virus', x: 1740, y: 650, role: 'swooper' }, { type: 'corrupted', x: 1880, y: 650 }, { type: 'virus', x: 2020, y: 650 }] },
    { id: 'encounter_3', triggerX: 2140, label: 'Firewall Plaza', activeCap: 3, packets: [[{ type: 'firewall', x: 2300, y: 650 }, { type: 'virus', x: 2440, y: 650, role: 'swooper' }], [{ type: 'corrupted', x: 2600, y: 650 }, { type: 'virus', x: 2760, y: 650 }, { type: 'corrupted', x: 2900, y: 650 }]], enemies: [{ type: 'firewall', x: 2300, y: 650 }, { type: 'virus', x: 2440, y: 650, role: 'swooper' }, { type: 'corrupted', x: 2600, y: 650 }, { type: 'virus', x: 2760, y: 650 }, { type: 'corrupted', x: 2900, y: 650 }] },
    { id: 'encounter_4', triggerX: 3050, label: 'Broadcast Gate', activeCap: 4, packets: [[{ type: 'corrupted', x: 3180, y: 650 }, { type: 'virus', x: 3320, y: 650, role: 'swooper' }, { type: 'firewall', x: 3460, y: 650 }], [{ type: 'virus', x: 3600, y: 650 }, { type: 'corrupted', x: 3740, y: 650 }, { type: 'virus', x: 3880, y: 650, role: 'swooper' }]], enemies: [{ type: 'corrupted', x: 3180, y: 650 }, { type: 'virus', x: 3320, y: 650, role: 'swooper' }, { type: 'firewall', x: 3460, y: 650 }, { type: 'virus', x: 3600, y: 650 }, { type: 'corrupted', x: 3740, y: 650 }, { type: 'virus', x: 3880, y: 650, role: 'swooper' }] }
  ]);

  // Calibrated against the locked 1279x462 Level 1 foreground image using the
  // renderer's 4400x1589 draw at (-152, -550). Every collider follows a real
  // awning or rooftop; the tower intentionally exposes both its upper roof and
  // lower striped awning, while facade/window/door trim remains non-collidable.
  const STAGE_SURFACES = Object.freeze([
    { id: 'signal-awning', solid: true, x: 736, y: 492, w: 529, h: 8 },
    { id: 'cache-awning', solid: true, x: 1534, y: 330, w: 278, h: 8 },
    { id: 'firewall-canopy', solid: true, x: 1936, y: 358, w: 582, h: 8 },
    { id: 'relay-rooftop', x: 2580, y: 196, w: 574, h: 8 },
    { id: 'tower-rooftop', x: 3154, y: 275, w: 609, h: 8 },
    { id: 'tower-awning', solid: true, x: 3292, y: 502, w: 402, h: 8 },
    { id: 'broadcast-awning', solid: true, x: 3777, y: 502, w: 319, h: 8 },
    { id: 'signal-roof', x: 704, y: 254, w: 618, h: 8, maskFeet: 10 },
    { id: 'west-crown', x: 110, y: -200, w: 512, h: 8, maskFeet: 10 },
    { id: 'cache-crown', x: 1370, y: -169, w: 518, h: 8, maskFeet: 9 },
    { id: 'firewall-roof', x: 1915, y: 59, w: 620, h: 8, maskFeet: 9 },
    { id: 'tower-crown', x: 3190, y: -314, w: 555, h: 8, maskFeet: 12 },
    { id: 'broadcast-crown', x: 3785, y: -74, w: 311, h: 8, maskFeet: 10 }
  ]);

  // September 17: the owner explicitly makes awnings fully solid like the
  // lift. The remaining Cache maintenance step retains its underside bonk;
  // ordinary roofs and all other stepping platforms remain one-way landings.
  const AWNING_DEPTH = Object.freeze({ 'signal-awning': 74, 'cache-awning': 64,
    'firewall-canopy': 40, 'tower-awning': 78, 'broadcast-awning': 42 });
  const BONK_LEDGE_DEPTH = Object.freeze({ ...AWNING_DEPTH,
    'cache-maintenance-step': 14 });

  // Swept AABB against one translating slab. The actor and obstacle share the
  // same interval, so a fast side entry or a moving roof cannot tunnel through.
  function sweepSlab(before, after, oldSlab, slab) {
    const dx = after.x - before.x - (slab.x - oldSlab.x);
    const dy = after.y - before.y - (slab.y - oldSlab.y);
    const axis = (min, max, lo, hi, delta) => {
      if (Math.abs(delta) < 0.000001) return max > lo + 0.001 && min < hi - 0.001 ? [-Infinity, Infinity] : null;
      return delta > 0 ? [(lo - max) / delta, (hi - min) / delta] : [(hi - min) / delta, (lo - max) / delta];
    };
    const tx = axis(before.x, before.x + before.width, oldSlab.x, oldSlab.x + oldSlab.width, dx);
    const ty = axis(before.y, before.y + before.height, oldSlab.y, oldSlab.y + oldSlab.height, dy);
    if (tx && ty) {
      const enter = Math.max(tx[0], ty[0]), leave = Math.min(tx[1], ty[1]);
      if (enter >= -0.000001 && enter <= 1 && enter <= leave) {
        return tx[0] > ty[0] ? { axis: 'x', sign: dx > 0 ? -1 : 1 } : { axis: 'y', sign: dy > 0 ? -1 : 1 };
      }
    }
    if (after.x + after.width <= slab.x + 0.001 || after.x >= slab.x + slab.width - 0.001 ||
        after.y + after.height <= slab.y + 0.001 || after.y >= slab.y + slab.height - 0.001) return null;
    // Resolve an existing overlap too (animation, recoil or a restored pose).
    return [
      { axis: 'x', sign: -1, distance: after.x + after.width - slab.x },
      { axis: 'x', sign: 1, distance: slab.x + slab.width - after.x },
      { axis: 'y', sign: -1, distance: after.y + after.height - slab.y },
      { axis: 'y', sign: 1, distance: slab.y + slab.height - after.y }
    ].sort((a, b) => a.distance - b.distance)[0];
  }

  // Measured on buildings.webp at its production (-152,-550), 4400x1589
  // transform. Each rail follows a solid facade edge and its local paving
  // direction; perspective changes across the district. The collision strip
  // meets the same track at the shared y=856 walking plane.
  const ENCOUNTER_GATES = Object.freeze([
    { mountX: 1382, roofY: -197, baseY: 824, curbX: 1316 },
    { mountX: 1980, roofY: 49, baseY: 824, curbX: 1966 },
    { mountX: 3250, roofY: -316, baseY: 824, curbX: 3302 },
    { mountX: 3830, roofY: -88, baseY: 824, curbX: 3890 }
  ].map((mount, index) => {
    const w = 14, footY = 856;
    const centerX = mount.mountX + (mount.curbX - mount.mountX) * (footY - mount.baseY) / (888 - mount.baseY);
    return Object.freeze({ ...mount, id: 'gate_' + (index + 1), encounterId: 'encounter_' + (index + 1),
      x: centerX - w / 2, y: -1040, w, h: 1896 });
  }));

  const TRAVERSAL_PROPS = Object.freeze([
    { id: 'cache-maintenance-step', x: 1390, y: 410, w: 128, h: 14 },
    // Rear edge meets the facade; 12px of pavement remains before actor feet.
    { id: 'tower-utility-unit', x: 498, y: 638, w: 160, h: 206, asset: 'broadcastTerminal', alwaysPresent: true },
    { id: 'signal-high-step', x: 642, y: 10, w: 132, h: 18 },
    { id: 'cache-high-step', x: 1400, y: 30, w: 136, h: 18 },
    { id: 'firewall-high-step', x: 2160, y: 210, w: 136, h: 18 },
    { id: 'tower-middle-step', x: 3100, y: 50, w: 136, h: 18 },
    { id: 'tower-high-step', x: 3420, y: -140, w: 136, h: 18 },
    { id: 'broadcast-low-step', x: 3930, y: 280, w: 144, h: 18 },
    { id: 'broadcast-high-step', x: 3820, y: 60, w: 144, h: 18 }
  ]);
  // Per-location mount choices; side sprites are anchored at one end only.
  const PLATFORM_MOUNTS = Object.freeze({
    'signal-high-step': { asset: 'platformSideLeft', anchorX: 103/512, anchorY: 183/512, span: 342/512 },
    'tower-middle-step': { asset: 'platformSideRight', anchorX: 23/512, anchorY: 199/512, span: 440/512 },
    'cache-maintenance-step': { frame: 0 }, 'cache-high-step': { frame: 2, hangY: -169 },
    'firewall-high-step': { frame: 1, hangY: 59 },
    'tower-high-step': { frame: 0 }, 'broadcast-low-step': { frame: 1 },
    'broadcast-high-step': { frame: 2, hangY: -74 }
  });
  const REPAIRS = Object.freeze([
    { id: 'repair.signal-awning', x: 1080, y: 450, surfaceY: 492 },
    { id: 'repair.tower-awning', x: 3600, y: -356, surfaceY: -314 }
  ]);

  function drawRepairCell(ctx, x, y, scale = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#091014';
    ctx.fillStyle = '#edf5e8'; ctx.beginPath();
    ctx.moveTo(-26,-18); ctx.lineTo(-16,-29); ctx.lineTo(16,-29); ctx.lineTo(26,-18);
    ctx.lineTo(26,21); ctx.lineTo(17,29); ctx.lineTo(-17,29); ctx.lineTo(-26,21); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#b7f16e';ctx.fillRect(-20,-20,40,40);
    ctx.fillStyle='#163526';ctx.beginPath();ctx.moveTo(0,19);
    ctx.bezierCurveTo(-32,-1,-13,-24,0,-10);ctx.bezierCurveTo(13,-24,32,-1,0,19);ctx.fill();
    ctx.strokeStyle='#eaffea';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-12,-1);ctx.lineTo(-6,-1);ctx.lineTo(-2,-8);ctx.lineTo(3,7);ctx.lineTo(7,-1);ctx.lineTo(13,-1);ctx.stroke();
    ctx.restore();
  }

  const CINEMATIC = Object.freeze({
    freezeMs: 800,
    panMs: 2000,
    closeUpMs: 500,
    flourishMs: 4000,
    holdMs: 250,
    returnMs: 1600,
    wideZoomFloor: 0.92,
    closeZoom: 1.08,
    bossFrameX: 3136,
    bossStopX: 3480,
    bossGroundY: GROUND_Y,
    bossSpeed: 140
  });
  const SPAWN = Object.freeze({
    offscreenPadding: 140,
    playerExclusionRadius: 350,
    protectionMs: 700,
    staggerMs: 350,
    entranceSpeed: 420,
    jammerReinforcementCap: 3,
    jammerCadenceMinMs: 2500,
    jammerCadenceMaxMs: 3500
  });
  // Rhythm-powered access from the middle-right street to the Firewall roof.
  // Platform coordinates use the same visible-foot space as STAGE_SURFACES.
  const SIGNAL_LIFT = Object.freeze({
    id: 'signal-lift',
    // Expand around the original x=2506 center so the upper roof handoff stays
    // under the rider, rather than moving the enlarged cabin beyond its edge.
    x: 2366,
    w: 280,
    h: 10,
    cabinHeight: 432,
    footAnchor: 0.795,
    roofUnderside: 0.249,
    roofTop: 0.1,
    bottomY: GROUND_Y + PLAYER_VISUAL_FOOT_OFFSET,
    topY: 59,
    destinationSurfaceId: 'firewall-roof',
    speed: 220,
    returnDelayMs: 5000,
    requiredCharges: 2
  });
  const SIGNAL_AMP = Object.freeze({ id: 'signal-amp', x: 2868, y: 154, radius: 36, charges: 3, range: 430 });
  const SKY_CACHES = Object.freeze([
    { id: 'west', x: 300, surfaceId: 'west-crown' },
    { id: 'cache', x: 1700, surfaceId: 'cache-crown' },
    { id: 'broadcast', x: 3990, surfaceId: 'broadcast-crown' }
  ]);

  // Encounter tuning is intentionally local to Level 1. MusicTransport keeps
  // the rhythm judgment; this owner's hostile delta controls enemy actions.
  const BOSS_COMBAT = Object.freeze({
    maxHealth: 10, readyMs: 1800, approachSpeed: 180, approachRange: 230,
    telegraphMs: 1600, fastTelegraphMs: 1300, sweepMs: 700,
    recoveryMs: 3000, fastRecoveryMs: 2500, secondPulseMs: 410,
    pulseSpeed: 560, pulseRange: 1050, pulseWidth: 64, pulseHeight: 56,
    hitboxWidth: 110 * 1.08, hitboxHeight: 202.4 * 1.08
  });

  // Measured from the manifest-linked sheets (opaque alpha >= 128), September
  // 11 playtest repair. Scale the neutral BODY, not the transparent frame or
  // raised blade; retain authored breathing and limb motion within each clip.
  const BOSS_PRESENTATION = Object.freeze({
    targetBodyHeight: 253 * 0.8 * 1.08,
    walk: Object.freeze({
      width: 200, height: 256, anchorX: 100, anchorY: 253, bodyHeight: 253, visualScale: 1.06,
      footRows: Object.freeze([253, 252, 252, 253, 246, 244, 244, 245, 244, 245, 251, 252, 253, 253, 253, 253, 252, 253, 249, 245, 245, 245, 245, 246, 251, 253, 253, 253, 252, 252, 252, 249, 246, 245, 245, 245, 246, 252, 253, 252, 253])
    }),
    flourish: Object.freeze({
      width: 512, height: 310, anchorX: 256, anchorY: 308, bodyHeight: 250,
      footRows: Object.freeze(Array(48).fill(308))
    }),
    idle: Object.freeze({"width":416,"height":320,"anchorX":208,"anchorY":308,"footRows":[308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308,308],"bodyHeight":267.0})
  });
  // Terrain clearance follows the tallest normal body pose. The old 310-unit
  // lift probe included excess space above a roughly 232-unit walking body;
  // applying it to every awning would displace him on otherwise clear street.
  const BOSS_TERRAIN_HEIGHT = BOSS_PRESENTATION.targetBodyHeight * BOSS_PRESENTATION.walk.visualScale;

  function encounterSpecs(encounter) { return encounter && encounter.packets ? encounter.packets.flat() : (encounter?.enemies || []); }
  function totalQuota() { return ENCOUNTERS.reduce((sum, e) => sum + encounterSpecs(e).length, 0); }
  function clampCamera(x) { return window.clamp ? window.clamp(x, CAMERA_MIN, CAMERA_MAX) : Math.max(CAMERA_MIN, Math.min(CAMERA_MAX, x)); }
  function clampWorldX(x) { return Math.max(160, Math.min(WORLD_WIDTH - 160, x)); }
  function lerp(from, to, amount) { return from + (to - from) * amount; }
  function smoothStep(t) { return t * t * (3 - 2 * t); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  // The locked foreground is rendered 4400px wide around the 1920px canvas.
  // Keep both image edges beyond the viewport throughout an overridden camera move.
  function getForegroundCoverageZoomFloor(cameraX) {
    const leftFloor = (CANVAS_WIDTH / 2) / Math.max(1, cameraX + 152);
    const rightFloor = (CANVAS_WIDTH / 2) / Math.max(1, 4248 - cameraX);
    return Math.min(1.2, Math.max(leftFloor, rightFloor) + 0.02);
  }
  function debugAllowed() { return !!(window.BARCODE && window.BARCODE.DEBUG_LEVEL_1_SESSION === true); }
  function debugDisabled() { return { ok: false, reason: 'debug-disabled' }; }

  window.Sector1Progression = class Sector1Progression {
    constructor(player) { this.player = player || null; this.requiredEnemyKills = totalQuota(); this.reset(); this.state = STATES.TUTORIAL; }
    static get ENCOUNTERS() { return ENCOUNTERS; }
    static get GEOMETRY() { return STAGE_SURFACES; }
    static get STAGE_SURFACES() { return STAGE_SURFACES; }
    static get TRAVERSAL_PROPS() { return TRAVERSAL_PROPS; }
    static get PLATFORM_MOUNTS() { return PLATFORM_MOUNTS; }
    static get REPAIRS() { return REPAIRS; }
    static drawRepairCell(ctx, x, y, scale) { drawRepairCell(ctx, x, y, scale); }
    getStageSurfaces() { return STAGE_SURFACES.concat(this.missionStarted ? TRAVERSAL_PROPS : TRAVERSAL_PROPS.filter(prop => prop.alwaysPresent)); }
    static get PLAYER_VISUAL_FOOT_OFFSET() { return PLAYER_VISUAL_FOOT_OFFSET; }
    static get ENCOUNTER_GATES() { return ENCOUNTER_GATES; }
    static get SIGNAL_LIFT() { return SIGNAL_LIFT; }
    static get SIGNAL_AMP() { return SIGNAL_AMP; }
    static get CINEMATIC() { return CINEMATIC; }
    static get STATES() { return STATES; }
    static get BOSS_COMBAT() { return BOSS_COMBAT; }
    static get JAMMER_PLACEMENT() { return JAMMER_PLACEMENT; }
    isAuthoritativeMissionActive() { return this.state !== STATES.TUTORIAL && this.state !== STATES.LEVEL_COMPLETE; }
    shouldSuppressGenericSpawning() { return true; }
    isBossCinematicActive() { return [STATES.FREEZE, STATES.ENEMY_PURGE, STATES.CAMERA_PAN, STATES.BOSS_WALK_IN, STATES.BOSS_CLOSE_UP, STATES.BOSS_FLOURISH, STATES.BOSS_HOLD, STATES.CAMERA_RETURN].includes(this.state); }
    isGameplaySuppressed() { return this.isBossCinematicActive() || this.state === STATES.LEVEL_COMPLETE; }
    getCameraY() { return this.cameraY || 0; }
    updateVerticalCamera(delta) {
      // The permanent terminal opens roof travel during playable training.
      // Follow that climb as well; mission activation must not strand the
      // player (and approaching cars) above a street-locked viewport.
      if (this.player?.isEntering) return;
      const foot = this.player.position.y + PLAYER_VISUAL_FOOT_OFFSET;
      const current = this.cameraY || 0;
      let desired = current;
      if (foot-current < 600) desired = foot-600;
      else if (foot-current > 790) desired = foot-790;
      if (this.player.grounded && !this.player.supportedSurfaceId) desired=0;
      if (this.isGameplaySuppressed()) desired=0;
      desired=Math.max(-1040,Math.min(0,desired));
      this.cameraY=current+(desired-current)*(1-Math.exp(-Math.max(0,delta)/180));
    }
    clipRoofFeet(ctx, actor) {
      const surface=this.getStageSurfaces().find(p=>p.id===actor.supportedSurfaceId && p.maskFeet);
      if (!surface || !(actor.grounded || actor.isOnGround) || Math.abs(actor.position.y+72-surface.y)>2) return;
      // Clip only the few pixels behind the existing painted parapet. Actors
      // jumping or falling in front of the facade are never masked.
      ctx.beginPath();ctx.rect(-2000,-2500,8200,surface.y-surface.maskFeet+2500);ctx.clip();
    }
    getCameraX(fallback) { return this.cameraOverrideActive ? clampCamera(this.cameraX) : fallback; }
    getCinematicZoomOverride() { return Number.isFinite(this.cinematicZoomOverride) ? this.cinematicZoomOverride : null; }
    update(deltaTime = 0) {
      if (window.isPaused || window.gameState?.paused || window.gameState?.gameOver || window.gameState?.victory) return;
      this.player = this.player || window.player;
      this.pollPreparedAssets();
      this.updateDistrictSignal(deltaTime);
      window.BARCODE?.Campaign?.tick(deltaTime);
      this.updateVerticalCamera(deltaTime);
      this.updateBarrierContacts(deltaTime);
      const tutorialDone = !!(window.tutorialSystem && typeof window.tutorialSystem.isCompleted === 'function' && window.tutorialSystem.isCompleted() && typeof window.tutorialSystem.isActive === 'function' && !window.tutorialSystem.isActive());
      if (this.state === STATES.TUTORIAL && tutorialDone && !this.missionStarted && !this.player?.isEntering) {
        this.startMission();
      }
      if (this.state === STATES.TUTORIAL) this.applyGateCollision();
      // The lift is traversal, not a hostile system, so tactical focus must
      // never slow or freeze its carry motion.
      this.updateSignalLift(deltaTime);
      this.updateSignalAmp();
      this.updateSkyCaches(deltaTime);
      this.updateRepairs(deltaTime);
      if (this.isGameplaySuppressed() && this.player) { this.player.supportedSurfaceId = null; this.player.controlsDisabled = true; if (this.frozenPlayerPosition) { this.player.position.x = this.frozenPlayerPosition.x; this.player.position.y = this.frozenPlayerPosition.y; } this.player.velocity.x = 0; this.player.velocity.y = 0; }
      const tacticalDeltaTime = window.BARCODE?.TacticalFocusClock?.scaleDelta?.(deltaTime) ?? deltaTime;
      if (/^encounter_/.test(this.state)) { this.applyGateCollision(); this.updateEncounter(tacticalDeltaTime); this.updatePendingSpawns(tacticalDeltaTime); }
      else if (this.state === STATES.JAMMER_ACTIVE) this.updateJammerReinforcements(tacticalDeltaTime);
      else if (this.state === STATES.FREEZE) this.advanceTimed(deltaTime, CINEMATIC.freezeMs, STATES.ENEMY_PURGE, () => this.purgeEnemies());
      else if (this.state === STATES.ENEMY_PURGE) this.transitionToPan();
      else if (this.state === STATES.CAMERA_PAN) this.updatePan(deltaTime);
      else if (this.state === STATES.BOSS_WALK_IN) this.updateBossWalk(deltaTime);
      else if (this.state === STATES.BOSS_CLOSE_UP) this.updateBossCloseUp(deltaTime);
      else if (this.state === STATES.BOSS_FLOURISH) this.updateBossFlourish(deltaTime);
      else if (this.state === STATES.BOSS_HOLD) this.updateBossHold(deltaTime);
      else if (this.state === STATES.CAMERA_RETURN) this.updateCameraReturn(deltaTime);
      else if (this.state === STATES.BOSS_READY) {
        this.updateBossSprite(deltaTime);
        if (this.cinematicZoomReleasePending) { this.cinematicZoomReleasePending = false; this.cinematicZoomOverride = null; }
        this.boss.phaseElapsedMs += tacticalDeltaTime;
        if (this.boss.phaseElapsedMs >= BOSS_COMBAT.readyMs) this.beginBossCombat();
      }
      else if (this.state === STATES.BOSS_COMBAT) this.updateBossCombat(tacticalDeltaTime);
    }
    startMission() { this.state = STATES.ENCOUNTER_1; this.missionStarted = true; this.missionDefeats = 0; this.resetDistrictSignal(); this.countedEnemies.clear(); this.spawnedEncounterIds.clear(); this.activeEncounterId = null; this.applyGateCollision(); this.resetSignalLift(); this.enemyManagerReset(); if (window.objectivesSystem?.setMissionDefeatObjective) window.objectivesSystem.setMissionDefeatObjective(0, this.requiredEnemyKills); window.BARCODE?.Campaign?.begin(); window.BARCODE?.Campaign?.checkpoint('encounter_1'); }
    resetDistrictSignal() {
      this.lastMissionDefeatAtMs = 0;
      this.districtSignal = { elapsedMs: 0, interference: 1,
        clearedAtMs: ENCOUNTERS.map(() => null), restoration: null };
    }
    restoreEncounterSignal(encounterId) {
      const index = ENCOUNTERS.findIndex(encounter => encounter.id === encounterId);
      if (index < 0 || this.districtSignal.clearedAtMs[index] !== null) return;
      this.districtSignal.clearedAtMs[index] = this.districtSignal.elapsedMs;
    }
    updateDistrictSignal(deltaTime) {
      if (!this.missionStarted && !this.jammerDestroyedNotified) return;
      const signal = this.districtSignal;
      // Presentation uses the existing, pause-gated frame delta. Hacking slows
      // hostile actions, not the district's recovery or the music transport.
      const delta = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
      signal.elapsedMs += delta;
      const stage = window.BARCODE?.JammerEnvironment?.getStatus?.().stage?.index || 0;
      const target = 1 - Math.min(3, stage) / 4;
      signal.interference += Math.sign(target - signal.interference) *
        Math.min(Math.abs(target - signal.interference), delta / 1600);
    }
    getDistrictSignalState() {
      const signal = this.districtSignal;
      const restoration = signal.restoration;
      const elapsed = restoration ? signal.elapsedMs - restoration.startedAtMs : 0;
      const radius = elapsed * 1.4;
      const complete = !!restoration && radius >= restoration.distance + 200;
      return { active: this.missionStarted || this.jammerDestroyedNotified,
        elapsedMs: signal.elapsedMs, interference: complete ? 0 : signal.interference,
        zones: signal.clearedAtMs.map((time, index) => ({ id: ENCOUNTERS[index].id,
          cleared: time !== null, recovery: time === null ? 0 : smoothStep(Math.min(1, (signal.elapsedMs - time) / 900)) })),
        restored: complete,
        wave: restoration && !complete ? { originX: restoration.originX, radius } : null };
    }
    enemyManagerReset() { if (window.cancelInitialEnemySpawn) window.cancelInitialEnemySpawn(); if (window.enemyManager) window.enemyManager.clear(); if (window.gameState) { window.gameState.enemiesDefeated = 0; window.gameState.hasSpawnedInitialEnemies = true; } this.prepareAssetsForEncounter(0); }
    getEncounterStatus() {
      const index = ENCOUNTERS.findIndex(encounter => encounter.id === this.state);
      if (index < 0) return null;
      const encounter = ENCOUNTERS[index];
      const started = this.spawnedEncounterIds.has(encounter.id);
      const defeated = started ? this.activeEncounterEnemies.filter(enemy => !enemy.active || enemy._defeatRecorded).length : 0;
      let straggler = null;
      if (defeated === encounterSpecs(encounter).length - 1 &&
          this.districtSignal.elapsedMs - this.lastMissionDefeatAtMs >= 6000) {
        const remaining = this.activeEncounterEnemies.find(e => e.active && !e._defeatRecorded);
        if (remaining && this.player?.position) {
          const dx = remaining.position.x - this.player.position.x;
          const dy = remaining.position.y - this.player.position.y;
          if (dy < -180) straggler = '↑ CHECK ROOFTOPS';
          else if (dy > 180) straggler = '↓ CHECK BELOW';
          else if (Math.abs(dx) > 500) straggler = dx < 0 ? '← LAST ENEMY' : 'LAST ENEMY →';
        }
      }
      const hints = [
        'Land on enemies or use R + Down on beat.',
        'Dodge the marked dive. Jump committed charges.',
        'Firewall braces, sweeps, then recovers. Counter at range.',
        'Read the windups. Mix stomps and rhythm during recovery.'
      ];
      return { label: encounter.label, number: index + 1, total: ENCOUNTERS.length,
        started, defeated, required: encounterSpecs(encounter).length, hint: hints[index], straggler };
    }
    updateEncounter(deltaTime = 0) { const index = ENCOUNTERS.findIndex(e => e.id === this.state); const def = ENCOUNTERS[index]; if (!def) return; const px = this.player?.position?.x || 0; if (!this.spawnedEncounterIds.has(def.id) && px >= def.triggerX) this.spawnEncounter(def); if (this.activeEncounterId === def.id) this.updateEncounterPackets(def, deltaTime); const noPendingSpawns = !this.pendingSpawns || this.pendingSpawns.length === 0; const allPacketsReleased = this.activeEncounterPacket >= ((def.packets?.length || 1) - 1); const allDefeated = this.activeEncounterEnemies.length === encounterSpecs(def).length && this.activeEncounterEnemies.every(e => !e.active || e._defeatRecorded); if (this.activeEncounterId === def.id && allPacketsReleased && noPendingSpawns && allDefeated) { this.openEncounterGate(def.id); if (index < ENCOUNTERS.length - 1) { this.state = ENCOUNTERS[index + 1].id; this.activeEncounterId = null; this.activeEncounterEnemies = []; this.closedGateEncounterId = null; this.prepareAssetsForEncounter(index + 1); } } }
    updateEncounterPackets(def, deltaTime = 0) { const packets = def.packets || [def.enemies || []]; if (this.activeEncounterPacket >= packets.length - 1) return; const survivors = this.activeEncounterEnemies.filter(e => e && e.active && !e._defeatRecorded).length; const noPendingSpawns = !this.pendingSpawns || this.pendingSpawns.length === 0; if (noPendingSpawns && survivors <= 1 && this.packetGraceMs === null) this.packetGraceMs = 900; if (this.packetGraceMs !== null) { this.packetGraceMs = Math.max(0, this.packetGraceMs - deltaTime); if (this.packetGraceMs <= 0) this.releaseNextPacket(def); } }
    spawnEncounter(def) { window.BARCODE?.Campaign?.checkpoint(def.id); this.spawnedEncounterIds.add(def.id); this.activeEncounterId = def.id; this.closedGateEncounterId = def.id; this.activeEncounterEnemies = []; this.activeEncounterPacket = 0; this.packetGraceMs = null; const packets = def.packets || [def.enemies || []]; this.pendingSpawns = packets[0].map((spec, i) => ({ spec, encounterId: def.id, index: i, delayMs: i * SPAWN.staggerMs })); }
    releaseNextPacket(def) { const packets = def.packets || [def.enemies || []]; if (this.activeEncounterPacket >= packets.length - 1) return; this.activeEncounterPacket += 1; this.packetGraceMs = null; const priorCount = packets.slice(0, this.activeEncounterPacket).reduce((sum, packet) => sum + packet.length, 0); this.pendingSpawns = packets[this.activeEncounterPacket].map((spec, i) => ({ spec, encounterId: def.id, index: priorCount + i, delayMs: i * SPAWN.staggerMs })); }
    updatePendingSpawns(deltaTime) { if (!this.pendingSpawns || this.pendingSpawns.length === 0) return; const index = ENCOUNTERS.findIndex(e => e.id === this.state); const def = ENCOUNTERS[index]; const activeCount = this.activeEncounterEnemies.filter(e => e && e.active && !e._defeatRecorded).length; if (def?.activeCap && activeCount >= def.activeCap) return; this.pendingSpawns.forEach(pending => { pending.delayMs -= deltaTime; }); const ready = this.pendingSpawns.filter(pending => pending.delayMs <= 0).slice(0, Math.max(1, (def?.activeCap || 99) - activeCount)); this.pendingSpawns = this.pendingSpawns.filter(pending => !ready.includes(pending)); ready.forEach(pending => this.activeEncounterEnemies.push(this.spawnMissionEnemy(pending.spec, pending.encounterId, pending.index))); }
    getVisibleWorldBounds() { const playerX = this.player?.position?.x || CAMERA_MIN; const cameraX = this.cameraOverrideActive && Number.isFinite(this.cameraX) ? clampCamera(this.cameraX) : clampCamera(playerX); const rawZoom = window.renderer && typeof window.renderer.getZoomLevel === 'function' ? window.renderer.getZoomLevel() : window.renderer?.zoomLevel; const zoom = Math.max(0.1, Number.isFinite(rawZoom) ? rawZoom : 1); const halfWidth = CANVAS_WIDTH / (2 * zoom); return { left: Math.max(0, cameraX - halfWidth), right: Math.min(WORLD_WIDTH, cameraX + halfWidth), center: cameraX, zoom }; }
    getSpawnBodyHalfWidth(type) { if (type === 'firewall') return 135; if (type === 'corrupted') return 50; return 40; }
    planSpawn(spec = {}) { const bounds = this.getVisibleWorldBounds(); const bodyHalf = this.getSpawnBodyHalfWidth(spec.type); const playerX = this.player?.position?.x || bounds.center; const left = { x: Math.max(bodyHalf, bounds.left - SPAWN.offscreenPadding - bodyHalf), side: 'left' }; const right = { x: Math.min(WORLD_WIDTH - bodyHalf, bounds.right + SPAWN.offscreenPadding + bodyHalf), side: 'right' }; const outside = candidate => candidate.x + bodyHalf <= bounds.left - SPAWN.offscreenPadding || candidate.x - bodyHalf >= bounds.right + SPAWN.offscreenPadding; const farFromPlayer = candidate => Math.abs(candidate.x - playerX) >= SPAWN.playerExclusionRadius + bodyHalf; const candidates = [left, right].filter(outside).sort((a, b) => Math.abs(a.x - (spec.x || playerX)) - Math.abs(b.x - (spec.x || playerX))); const accepted = candidates.find(farFromPlayer) || candidates[0] || [left, right].sort((a, b) => Math.abs(b.x - playerX) - Math.abs(a.x - playerX))[0]; this.lastSpawnPlan = { bounds, candidates, accepted: { x: accepted.x, y: Number.isFinite(spec.y) ? spec.y : GROUND_Y, side: accepted.side }, playerX, exclusionRadius: SPAWN.playerExclusionRadius, bodyHalf }; return { x: accepted.x, y: Number.isFinite(spec.y) ? spec.y : GROUND_Y, side: accepted.side }; }
    getEncounterEntranceBounds(encounterId, type) {
      const half = this.getSpawnBodyHalfWidth(type);
      const gate = ENCOUNTER_GATES.find(g => g.encounterId === encounterId);
      return { left: half, right: gate ? gate.x - half - 8 : WORLD_WIDTH - half };
    }
    safeEntranceTargetX(authoredX, side, type, index, encounterId) {
      const bounds = this.getEncounterEntranceBounds(encounterId, type);
      const playerX = this.player?.position?.x || CAMERA_MIN;
      const clearance = SPAWN.playerExclusionRadius + this.getSpawnBodyHalfWidth(type);
      const spread = Math.min(180, Math.max(0, Number(index) || 0) * 45);
      const clamp = x => Math.max(bounds.left, Math.min(bounds.right, x));
      const onApproachSide = side < 0 ? authoredX <= playerX - clearance : authoredX >= playerX + clearance;
      let targetX = clamp(onApproachSide ? authoredX : playerX + side * (clearance + spread));
      // A locked gate takes precedence over an offscreen approach direction.
      // Pick the other safe side when the wall leaves no clearance ahead.
      if (Math.abs(targetX - playerX) < clearance) targetX = clamp(playerX - side * (clearance + spread));
      return targetX;
    }
    planEntranceTarget(spec = {}, origin = {}, index = 0, encounterId = null) {
      const playerX = this.player?.position?.x || CAMERA_MIN;
      const authoredX = Number.isFinite(spec.x) ? spec.x : playerX;
      const side = (origin.side || (origin.x < playerX ? 'left' : 'right')) === 'left' ? -1 : 1;
      return { x: this.safeEntranceTargetX(authoredX, side, spec.type, index, encounterId),
        y: Number.isFinite(spec.y) ? spec.y : GROUND_Y };
    }
    spawnMissionEnemy(spec, encounterId, index, options = {}) {
      const guard = !options.jammerReinforcement && !options.tutorialEnemy ? ({
        encounter_1: { index: 2, surface: 'signal-roof' },
        encounter_2: { index: 1, surface: 'cache-awning', drone: true },
        encounter_3: { index: 2, surface: 'relay-rooftop' },
        // Keep this drone's whole body and stomp approach clear of the tower
        // steps. Moving the steps would break the established climbing route.
        encounter_4: { index: 1, surface: 'tower-rooftop', drone: true, patrol: { left: 3625, right: 3695 } }
      })[encounterId] : null;
      const home = guard?.index === index ? this.getStageSurfaces().find(p => p.id === guard.surface) : null;
      const drone = !!(home && guard.drone);
      const targetY = home ? home.y - PLAYER_VISUAL_FOOT_OFFSET - (drone ? 110 : 0)
        : spec.type === 'virus' && Number.isFinite(spec.y) ? spec.y : GROUND_Y;
      const origin = options.origin || this.planSpawn({ ...spec, y: targetY });
      if (!options.origin && encounterId === 'encounter_2' && spec.type === 'virus')
        origin.y = 330 - PLAYER_VISUAL_FOOT_OFFSET;
      const target = this.planEntranceTarget({ ...spec, y: targetY }, origin, index,
        options.tutorialEnemy && this.state === STATES.TUTORIAL ? this.getCurrentGate()?.encounterId :
          !options.jammerReinforcement && !options.tutorialEnemy ? encounterId : null);
      const homeX = guard?.patrol ? (guard.patrol.left + guard.patrol.right) / 2 : home ? home.x + home.w / 2 : origin.x;
      const enemy = drone ? new window.RooftopDrone(homeX, targetY, home, guard.patrol)
        : new window.Enemy(origin.x, origin.y, spec.type);
      // Restore the authored horizontal origin after legacy constructors, then
      // put ground actors directly on their walking plane before the entrance.
      enemy.position.x = origin.x;
      enemy.position.y = spec.type === 'virus' ? origin.y : GROUND_Y;
      enemy._dropEdge = null;
      enemy._sector1MissionEnemy = !options.jammerReinforcement && !options.tutorialEnemy;
      enemy._jammerReinforcement = !!options.jammerReinforcement;
      enemy._isTutorialEnemy = !!options.tutorialEnemy;
      enemy._sector1EncounterId = encounterId;
      enemy._sector1Index = index;
      enemy._repairCarrier = enemy._sector1MissionEnemy && encounterId === 'encounter_2' && index === 0 && spec.type === 'corrupted';
      enemy.role = drone ? 'rooftop' : spec.role || null;
      if (enemy.role === 'swooper') enemy.swooperState = 'approach';
      enemy._entranceTarget = target;
      if (spec.type !== 'virus') enemy._entranceTarget.y = GROUND_Y;
      enemy._authoredEntranceActive = true;
      enemy._authoredEntranceSpeed = SPAWN.entranceSpeed;
      enemy.entranceComplete = false;
      enemy.state = 'authored_entrance';
      enemy.spawnTimeMs = 0;
      enemy.spawnProtectionDuration = SPAWN.protectionMs;
      enemy.velocity.x = enemy._entranceTarget.x >= origin.x ? SPAWN.entranceSpeed : -SPAWN.entranceSpeed;
      enemy.velocity.y = 0;
      if (home) {
        enemy.position.x = homeX;
        enemy.position.y = targetY;
        enemy._homeSurfaceId = home.id;
        enemy.supportedSurfaceId = drone ? null : home.id;
        enemy._authoredEntranceActive = false;
        enemy.entranceComplete = true;
        enemy.state = 'patrol';
        enemy.spawnTimeMs = window.enemyManager?.hostileSimulationTimeMs || 0;
        enemy.velocity.x = 0;
        enemy.isOnGround = !drone;
      }
      enemy.originalSpawnX = enemy.position.x;
      enemy.originalSpawnY = enemy.position.y;
      if (window.enemyManager) window.enemyManager.enemies.push(enemy);
      return enemy;
    }
    spawnTutorialEnemy(index = 0) { this.player = this.player || window.player; if (!window.enemyManager || !window.Enemy) return null; const playerX = this.player?.position?.x || CAMERA_MIN; const side = Number(index) % 2 === 0 ? -1 : 1; const spec = { type: 'virus', x: playerX + side * (SPAWN.playerExclusionRadius + 120 + Number(index) * 45), y: GROUND_Y }; return this.spawnMissionEnemy(spec, 'tutorial', index, { tutorialEnemy: true }); }
    keepEntranceTargetSafe(enemy) {
      if (!enemy?._authoredEntranceActive || !enemy._entranceTarget || !this.player?.position) return;
      const side = enemy.position.x < this.player.position.x ? -1 : 1;
      enemy._entranceTarget.x = this.safeEntranceTargetX(enemy._entranceTarget.x, side,
        enemy.type, enemy._sector1Index, enemy._isTutorialEnemy && this.state === STATES.TUTORIAL ?
          this.getCurrentGate()?.encounterId : enemy._sector1MissionEnemy ? enemy._sector1EncounterId : null);
    }
    constrainEncounterEnemies() {
      const gate = this.getCurrentGate();
      if (!gate) return;
      for (const enemy of window.enemyManager?.enemies || []) {
        const requiredHere = enemy._isTutorialEnemy && this.state === STATES.TUTORIAL ||
          enemy._sector1MissionEnemy && enemy._sector1EncounterId === gate.encounterId;
        if (!enemy.active || !requiredHere ||
            enemy._authoredEntranceActive || enemy.entranceComplete === false) continue;
        const body = enemy.getHitbox();
        const overlap = body.x + body.width - (gate.x - 8);
        if (overlap <= 0) continue;
        // Resolve only wall penetration, as for the player's physical gate.
        // Feet, support, attack commitments and mission attribution stay owned.
        enemy.position.x -= overlap;
        if (enemy.velocity) enemy.velocity.x = Math.min(0, enemy.velocity.x || 0);
      }
    }
    onEnemyDefeated(authoritativeTotal, enemy) { if (!this.missionStarted || !enemy || !enemy._sector1MissionEnemy || this.countedEnemies.has(enemy)) return; this.countedEnemies.add(enemy); this.lastMissionDefeatAtMs = this.districtSignal.elapsedMs; this.missionDefeats = Math.min(this.requiredEnemyKills, this.missionDefeats + 1); if (window.gameState) window.gameState.enemiesDefeated = this.missionDefeats; if (window.objectivesSystem?.updateMissionDefeatProgress) window.objectivesSystem.updateMissionDefeatProgress(this.missionDefeats, this.requiredEnemyKills); if (this.missionDefeats === this.requiredEnemyKills && !this.jammerRevealed) this.revealJammer(); }
    chooseJammerPosition() {
      // Keep the entire attack position range clear of lift support. A player
      // on either lip must never power the lift while hitting the Jammer.
      const attackRange = window.BARCODE?.playerCombat?.range ?? 300;
      const clearance = attackRange + 18 + 96;
      const candidates = [1200, 1400, 1600, 1800, 1940, 2200, 2400, 2600, 2800]
        .filter(x => x >= JAMMER_PLACEMENT.minX && x <= JAMMER_PLACEMENT.maxX)
        .filter(x => x < SIGNAL_LIFT.x - clearance || x > SIGNAL_LIFT.x + SIGNAL_LIFT.w + clearance);
      const x = candidates[Math.min(candidates.length - 1, Math.floor(Math.random() * candidates.length))];
      return { x, y: GROUND_Y };
    }
    revealJammer() { this.state = STATES.JAMMER_ACTIVE; this.nextJammerSpawnMs = 0; this.jammerReinforcementCount = 0; this.jammerRevealed = true; this.closedGateEncounterId = null; ENCOUNTERS.forEach(encounter => this.restoreEncounterSignal(encounter.id)); const position = this.chooseJammerPosition(); window.BARCODE?.JammerEnvironment?.reveal({ position }); if (window.objectivesSystem?.revealJammerObjective) window.objectivesSystem.revealJammerObjective(); this.prepareBossAssets(); window.BARCODE?.Campaign?.checkpoint('jammer'); }
    updateJammerReinforcements(deltaTime) { const environment = window.BARCODE?.JammerEnvironment; const status = environment?.getStatus?.(); if (!status || !status.revealed || status.destroyed) return; this.nextJammerSpawnMs = Number.isFinite(this.nextJammerSpawnMs) ? this.nextJammerSpawnMs - deltaTime : 0; const activeReinforcements = (window.enemyManager?.enemies || []).filter(enemy => enemy && enemy.active && (enemy._jammerReinforcement || !enemy._sector1MissionEnemy)); if (activeReinforcements.length >= SPAWN.jammerReinforcementCap || this.nextJammerSpawnMs > 0) return; const types = ['virus', 'corrupted', 'virus', 'firewall']; const type = types[this.jammerReinforcementCount % types.length]; this.jammerReinforcementCount += 1; const jammerX = status.position?.x || this.chooseJammerPosition().x; const targetX = Math.max(180, Math.min(WORLD_WIDTH - 180, jammerX + (jammerX < WORLD_WIDTH / 2 ? 240 : -240))); this.spawnMissionEnemy({ type, x: targetX, y: GROUND_Y }, 'jammer_reinforcement', this.jammerReinforcementCount, { jammerReinforcement: true }); this.nextJammerSpawnMs = SPAWN.jammerCadenceMinMs + Math.random() * (SPAWN.jammerCadenceMaxMs - SPAWN.jammerCadenceMinMs); }
    onJammerDestroyed() {
      this.nextJammerSpawnMs = Infinity;
      if (this.jammerDestroyedNotified) return;
      this.jammerDestroyedNotified = true;
      const originX = window.BARCODE?.JammerEnvironment?.getStatus?.().position?.x ?? this.player?.position?.x ?? 2048;
      this.districtSignal.restoration = { originX, startedAtMs: this.districtSignal.elapsedMs,
        distance: Math.max(originX + 152, 4248 - originX) };
      this.state = STATES.FREEZE;
      window.renderer?.impact?.('destruction');
      window.BARCODE?.stageFX?.event('destruction', originX, { duration: 1500 });
      window.BARCODE?.combatFX?.contact('firewall', originX, 660, 1, true, true);
      window.BARCODE?.combatFX?.contact('corrupted', originX, 700, -1, true, true);
      // End the combat mode at the destruction event, not at camera handoff.
      // hide() preserves the running music transport and background beat state.
      window.rhythmSystem?.hideRhythmMode?.();
      const player = this.player || window.player;
      if (player) { player.primaryAttackAnimationMs = 0; player.state = 'idle'; }
      this.captureCinematicStart();
      this.freezePlayerForCinematic();
      window.objectivesSystem?.completeJammerObjective?.();
      this.phaseElapsed = 0;
      this.cinematicStartedCount++;
    }
    getCurrentRendererZoom() { const renderer = window.renderer; const override = renderer && typeof renderer.getCinematicZoomOverride === 'function' ? renderer.getCinematicZoomOverride() : null; const current = Number.isFinite(override) ? override : (renderer && typeof renderer.getZoomLevel === 'function' ? renderer.getZoomLevel() : renderer?.zoomLevel); return Math.max(0.1, Number.isFinite(current) ? current : 1); }
    captureCinematicStart() { const player = this.player || window.player; const playerX = Number.isFinite(player?.position?.x) ? player.position.x : CAMERA_MIN; const playerY = Number.isFinite(player?.position?.y) ? player.position.y : GROUND_Y; this.cinematicStartCameraX = clampCamera((window.gameCamera && Number.isFinite(window.gameCamera.centerX)) ? window.gameCamera.centerX : playerX); this.cinematicStartPlayerPosition = { x: playerX, y: playerY }; this.cinematicStartZoom = this.getCurrentRendererZoom(); this.cinematicWideZoom = Math.max(CINEMATIC.wideZoomFloor, Math.min(1, this.cinematicStartZoom)); this.cinematicCloseZoom = Math.max(CINEMATIC.closeZoom, this.cinematicWideZoom); this.cinematicZoomOverride = this.cinematicStartZoom; this.cinematicZoomReleasePending = false; this.panStartX = this.cinematicStartCameraX; this.cameraX = this.cinematicStartCameraX; this.cameraOverrideActive = true; }
    freezePlayerForCinematic() { const player = this.player || window.player; if (!player) return; const captured = this.cinematicStartPlayerPosition || { x: player.position.x, y: player.position.y }; this.frozenPlayerPosition = { x: captured.x, y: captured.y }; if (player.velocity) { player.velocity.x = 0; player.velocity.y = 0; } player.controlsDisabled = true; }
    advanceTimed(delta, duration, next, callback) { this.phaseElapsed += delta; if (this.phaseElapsed >= duration) { this.state = next; this.phaseElapsed = 0; if (callback) callback(); } }
    purgeEnemies() { if (window.enemyManager?.purgeForCinematic) window.enemyManager.purgeForCinematic(); else if (window.enemyManager) window.enemyManager.enemies = []; }
    transitionToPan() { this.state = STATES.CAMERA_PAN; this.phaseElapsed = 0; if (!Number.isFinite(this.panStartX)) this.captureCinematicStart(); this.panTargetX = clampCamera(CINEMATIC.bossFrameX); this.cameraX = this.panStartX; this.cinematicZoomOverride = this.cinematicStartZoom; this.cameraOverrideActive = true; }
    updatePan(delta) { this.phaseElapsed += delta; const t = Math.min(1, this.phaseElapsed / CINEMATIC.panMs); const eased = smoothStep(t); this.cameraX = clampCamera(lerp(this.panStartX, this.panTargetX, eased)); const desiredZoom = lerp(this.cinematicStartZoom, this.cinematicWideZoom, eased); this.cinematicZoomOverride = Math.max(desiredZoom, getForegroundCoverageZoomFloor(this.cameraX)); if (t >= 1) { this.cameraX = this.panTargetX; this.cinematicZoomOverride = Math.max(this.cinematicWideZoom, getForegroundCoverageZoomFloor(this.cameraX)); this.startBossWalk(); } }
    startBossWalk() { this.state = STATES.BOSS_WALK_IN; this.phaseElapsed = 0; this.boss = { x: this.cameraX + CANVAS_WIDTH / 2 + 180, y: CINEMATIC.bossGroundY, state: 'walk', active: true, sprite: this.preloadedBossSprite || null, spriteReady: false, fallbackLocked: !this.preloadedBossSprite, activeAnimation: null, playedAnimation: null, animationRef: null, flourishPlayed: false, canDealDamage: false, canReceiveDamage: false }; this.setBossAnimation('sector_1_boss_walk_walk', true); }
    prepareBossAssets() { if (this.bossAssetsRequested) return; this.bossAssetsRequested = true; this.requestSpriteOnce('boss', 'sector_1_boss_sector1boss', sprite => { this.preloadedBossSprite = sprite; this.preparedBossAnimations = ['sector_1_boss_walk_walk', 'sector_1_boss_attack_attack', 'sector_1_boss_idle_idle']; }); }
    prepareBossSprite() { if (!this.boss) return; if (!this.boss.sprite && this.preloadedBossSprite && !this.boss.fallbackLocked) this.boss.sprite = this.preloadedBossSprite; if (this.boss.sprite?.isLoaded?.()) { this.boss.spriteReady = true; if (this.boss.activeAnimation && this.boss.playedAnimation !== this.boss.activeAnimation && this.boss.sprite.play) { this.boss.animationRef = this.boss.sprite.play(this.boss.activeAnimation, this.boss.activeAnimation !== 'sector_1_boss_attack_attack') || null; this.boss.playedAnimation = this.boss.activeAnimation; } } }
    setBossAnimation(animation, loop) { this.prepareBossSprite(); if (!this.boss || this.boss.activeAnimation === animation) return this.boss?.animationRef || null; this.boss.activeAnimation = animation; this.boss.animationRef = null; if (this.boss.spriteReady && this.boss.sprite?.play) { this.boss.animationRef = this.boss.sprite.play(animation, loop) || null; this.boss.playedAnimation = animation; } return this.boss.animationRef; }
    getBossAnimationPlaybackRate() {
      // The huge boss breathes more slowly than small hostiles. His native
      // walk becomes more urgent during the faster combat approach; authored
      // leap/flourish painting still selects poses on the physical phase.
      if (this.boss?.activeAnimation === 'sector_1_boss_idle_idle') return 0.8;
      if (this.boss?.activeAnimation === 'sector_1_boss_walk_walk') {
        return this.state === STATES.BOSS_WALK_IN ? 1 : BOSS_COMBAT.approachSpeed / CINEMATIC.bossSpeed;
      }
      return 1;
    }
    updateBossSprite(delta) {
      this.prepareBossSprite();
      if (this.boss?.spriteReady && this.boss.sprite?.update) {
        const playbackDelta = delta * this.getBossAnimationPlaybackRate();
        if (window.BARCODE?.SpritePlayback) window.BARCODE.SpritePlayback.update(this.boss.sprite, playbackDelta);
        else this.boss.sprite.update(playbackDelta);
      }
    }
    updateBossWalk(delta) { this.setBossAnimation('sector_1_boss_walk_walk', true); this.boss.x -= CINEMATIC.bossSpeed * (delta / 1000); this.updateBossSprite(delta); if (this.boss.x <= CINEMATIC.bossStopX) { this.boss.x = CINEMATIC.bossStopX; this.startBossCloseUp(); if (window.gameState) window.gameState.collectionMessage = { text: 'SIGNAL RESTORED. BOSS APPROACHING.', timer: 160 }; } }
    startBossCloseUp() { this.state = STATES.BOSS_CLOSE_UP; this.phaseElapsed = 0; this.closeUpStartZoom = this.cinematicZoomOverride; this.boss.state = 'idle'; this.setBossAnimation('sector_1_boss_idle_idle', true); }
    updateBossCloseUp(delta) { this.phaseElapsed += delta; const t = Math.min(1, this.phaseElapsed / CINEMATIC.closeUpMs); this.cinematicZoomOverride = lerp(this.closeUpStartZoom, this.cinematicCloseZoom, easeOutCubic(t)); this.updateBossSprite(delta); if (t >= 1) { this.cinematicZoomOverride = this.cinematicCloseZoom; this.startBossFlourish(); } }
    startBossFlourish() { this.state = STATES.BOSS_FLOURISH; this.phaseElapsed = 0; this.boss.state = 'flourish'; this.boss.flourishPlayed = true; this.setBossAnimation('sector_1_boss_attack_attack', false); }
    updateBossFlourish(delta) { this.updateBossSprite(delta); this.advanceTimed(delta, CINEMATIC.flourishMs, STATES.BOSS_HOLD, () => { this.boss.state = 'flourish'; }); }
    updateBossHold(delta) { this.updateBossSprite(delta); this.advanceTimed(delta, CINEMATIC.holdMs, STATES.CAMERA_RETURN, () => this.startCameraReturn()); }
    startCameraReturn() {
      this.state = STATES.CAMERA_RETURN;
      this.phaseElapsed = 0;
      this.returnStartCameraX = this.cameraX;
      this.returnStartZoom = this.cinematicZoomOverride;
      this.returnStartBossX = this.boss.x;
      this.boss.state = 'idle';
      this.setBossAnimation('sector_1_boss_idle_idle', true);
    }
    updateCameraReturn(delta) {
      this.phaseElapsed += delta;
      const t = Math.min(1, this.phaseElapsed / CINEMATIC.returnMs);
      const eased = smoothStep(t);
      this.cameraX = clampCamera(lerp(this.returnStartCameraX, this.cinematicStartCameraX, eased));
      const desiredZoom = lerp(this.returnStartZoom, this.cinematicStartZoom, eased);
      this.cinematicZoomOverride = t < 1 ? Math.max(desiredZoom, getForegroundCoverageZoomFloor(this.cameraX)) : this.cinematicStartZoom;
      // Camera motion never relocates a world actor. After handoff the normal
      // approach phase walks toward the player, even while outside the view.
      this.updateBossSprite(delta);
      if (t >= 1) {
        this.cameraX = this.cinematicStartCameraX;
        this.cinematicZoomOverride = this.cinematicStartZoom;
        this.enterBossReady();
      }
    }
    enterBossReady() {
      if (!this.boss) return false;
      this.state = STATES.BOSS_READY;
      Object.assign(this.boss, { state: 'idle', active: true, phase: 'ready', phaseElapsedMs: 0,
        health: BOSS_COMBAT.maxHealth, maxHealth: BOSS_COMBAT.maxHealth, facing: -1,
        canDealDamage: false, canReceiveDamage: false, cycle: 0, stompCycle: -1, stompArmed: true,
        phaseBeatWait: null, secondPulseBeatWait: null, latePhase: false,
        hitSequences: new Set(), pulses: [], pulseSequence: 0, hitFlashMs: 0, guardBounceMs: 0, defeated: false,
        supportedSurfaceId: null, chaseSurfaceId: 'street', clearanceTarget: null, streetApproachLimit: null,
        traversal: null, roofFallVelocity: null, landingPoseMs: 0, routeRecovery: false,
        attackPattern: 'pulse', slam: null, recoveryBeatWait: null, recoveryBeats: 0,
        supportWaves:0,supportWaitMs:0 });
      this.setBossAnimation('sector_1_boss_idle_idle', true);
      this.bossReadyEmitted = true;
      this.cameraOverrideActive = false;
      this.frozenPlayerPosition = null;
      this.cinematicZoomReleasePending = true;
      if (this.player) {
        this.player.controlsDisabled = false;
        this.player.bossReboundMs = 0;
        this.player.bossReboundDirection = 0;
        if (this.player.velocity) { this.player.velocity.x = 0; this.player.velocity.y = 0; }
      }
      if (!this.bossCheckpoint) {
        const playerX = this.player?.position?.x ?? 960;
        this.bossCheckpoint = { playerX, bossX: this.boss.x,
          score: window.gameState?.score || 0, skyCaches: Array.from(this.skyCaches || []), signalAmpCharges: window.BARCODE?.signalAmpCharges || 0 };
      }
      window.objectivesSystem?.setBossCombatObjective?.(this.boss.health, this.boss.maxHealth);
      window.BARCODE?.Campaign?.checkpoint('boss');
      return true;
    }
    beginBossCombat() {
      if (this.state !== STATES.BOSS_READY || !this.boss || this.boss.defeated) return false;
      this.state = STATES.BOSS_COMBAT;
      this.setBossCombatPhase('approach');
      return true;
    }
    isBossCombatLive() {
      return this.state === STATES.BOSS_COMBAT && !!this.boss?.active && !this.boss.defeated &&
        window.isRunning !== false && !window.isPaused && !window.gameState?.paused && !window.gameState?.gameOver &&
        !window.gameState?.victory && window.gameState?.running !== false && (this.player?.health ?? 1) > 0;
    }
    setBossCombatPhase(phase) {
      const boss = this.boss;
      if (!boss) return;
      boss.phase = phase;
      boss.phaseElapsedMs = 0;
      boss.phaseBeatWait = null;
      boss.recoveryBeatWait = null;
      boss.recoveryBeats = 0;
      boss.canReceiveDamage = phase === 'recovery';
      boss.canDealDamage = phase === 'sweep' || boss.pulses.some(pulse => !pulse.hit);
      boss.state = phase === 'approach' ? 'walk' : phase === 'sweep' ? 'flourish' : 'idle';
      this.setBossAnimation(phase === 'approach' ? 'sector_1_boss_walk_walk' : phase === 'sweep' ? 'sector_1_boss_attack_attack' : 'sector_1_boss_idle_idle', phase !== 'sweep');
      if (phase === 'telegraph') {
        boss.cycle += 1;
        window.audioSystem?.playCombatCue?.('warning');
        // Learn the double pulse before the final speed increase. The opening
        // cycle stays a demonstration even if development tools change health.
        boss.doublePulse = boss.cycle > 1 && boss.health <= 6;
        boss.latePhase = boss.cycle > 2 && boss.health <= 3;
        boss.secondPulseEmitted = false;
        boss.secondPulseBeatWait = null;
        const choice = window.BARCODE?.LevelDifficulty?.choice?.id || 'standard';
        const surface = this.getBossSurface();
        const useSlam = surface.w >= 320 && boss.cycle >= 3 && boss.health <= (choice === 'relaxed' ? 3 : 6) &&
          (choice === 'overclocked' ? boss.cycle % 2 === 1 : boss.cycle % 3 === 0);
        boss.attackPattern = useSlam ? 'slam' : 'pulse';
        boss.slam = useSlam ? { x: Math.max(surface.x + 100, Math.min(surface.x + surface.w - 100, this.player.position.x)),
          groundY: surface.y, width: 176, height: 340, remainingMs: 0, hit: false } : null;
      }
      if (phase === 'sweep') {
        if (boss.attackPattern === 'slam' && boss.slam) {
          boss.slam.remainingMs = 360;
          window.renderer?.impact?.('boss');
          window.audioSystem?.playCombatCue?.('guard');
          window.BARCODE?.musicDirector?.accent('boss');
        } else this.emitBossPulse();
      }
    }
    bossRecoveryReady() {
      const boss = this.boss, sample = this.getBossMusicSample();
      const beats = window.BARCODE?.LevelDifficulty?.choice?.bossRecoveryBeats ?? 3;
      if (!sample) return boss.phaseElapsedMs >= beats * 410;
      const previous = boss.recoveryBeatWait;
      boss.recoveryBeatWait = { generation: sample.generation, beat: sample.grid.beatIndex };
      // Count fresh musical boundaries, never hostile-time scaling or a catch-up
      // backlog. Pausing/restarting the song cannot silently consume an opening.
      if (previous?.generation === sample.generation && sample.grid.beatIndex > previous.beat) boss.recoveryBeats++;
      return boss.recoveryBeats >= (boss.routeRecovery ? Math.min(2, beats) : beats);
    }
    updateBossSlam(deltaTime) {
      const slam = this.boss.slam;
      if (!slam || slam.remainingMs <= 0) return;
      const body = this.player.getHitbox?.();
      if (!slam.hit && body && body.x + body.width > slam.x - slam.width / 2 && body.x < slam.x + slam.width / 2 &&
          body.y + body.height > slam.groundY - slam.height && body.y < slam.groundY + 8) {
        slam.hit = true;
        if (!this.player.isDamageInvulnerable?.() && !window.hackingSystem?.absorbGuardHit?.()) {
          this.player.takeDamage?.(1, { x: slam.x, y: slam.groundY });
        }
      }
      slam.remainingMs = Math.max(0, slam.remainingMs - deltaTime);
    }
    getBossSurface() {
      return this.getActorSurfaces().find(s => s.id === this.boss?.supportedSurfaceId) ||
        { id: 'street', x: 0, y: GROUND_Y + PLAYER_VISUAL_FOOT_OFFSET, w: WORLD_WIDTH };
    }
    getBossSafeLandingX(surface, desired, from = null) {
      const inset = surface.solid || surface.id === 'signal-lift-roof' ? 16 : 55;
      const lo = surface.x+inset, hi = surface.x+surface.w-inset;
      const candidates = [Math.max(lo, Math.min(hi, desired)), lo, hi];
      for (const slab of STAGE_SURFACES) if (AWNING_DEPTH[slab.id] && slab.id !== surface.id) {
        candidates.push(slab.x-86, slab.x+slab.w+86);
      }
      return candidates.filter(x => x >= lo && x <= hi &&
        (!from || Math.abs(x-Math.max(from.x+8,Math.min(from.x+from.w-8,x)))<=360) &&
        (!from || surface.y<=from.y || !STAGE_SURFACES.some(s => AWNING_DEPTH[s.id] && s.id!==surface.id &&
          from.y<=s.y+.01 && surface.y>s.y && x+85>s.x && x-85<s.x+s.w)) && !STAGE_SURFACES.some(s =>
        AWNING_DEPTH[s.id] && s.id !== surface.id && surface.y>s.y && surface.y-BOSS_TERRAIN_HEIGHT<s.y+AWNING_DEPTH[s.id] &&
        x+85>s.x && x-85<s.x+s.w)).sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired))[0];
    }
    getBossRouteStep(targetId) {
      const surfaces = [this.getBossSurface()].concat(this.getActorSurfaces().filter(s => s.id !== SIGNAL_LIFT.id),
        [{ id: 'street', x: 0, y: GROUND_Y + PLAYER_VISUAL_FOOT_OFFSET, w: WORLD_WIDTH }]);
      const current = surfaces[0], queue = [{ route: [current], cost: 0, x: this.boss.x }], seen = new Set();
      // Only authored support planes participate. Bounded leaps use existing
      // steps instead of teleporting to the player's height or adding solids.
      while (queue.length) {
        queue.sort((a, b) => a.cost - b.cost);
        const node = queue.shift(), route = node.route, from = route[route.length - 1];
        if (seen.has(from.id)) continue;
        seen.add(from.id);
        if (from.id === targetId) return route[1] || null;
        for (const to of surfaces) {
          if (seen.has(to.id) || to.w < 110) continue;
          const rise = from.y - to.y;
          const gap = Math.max(0, to.x - (from.x + from.w), from.x - (to.x + to.w));
          if (rise > 420 || rise < -650 || gap > 260) continue;
          const x = this.getBossSafeLandingX(to, node.x, from);
          if (!Number.isFinite(x)) continue;
          if (to.solid && from.y > to.y) {
            const sides = [to.x - 100, to.x + to.w + 100].filter(at => at >= from.x + 8 && at <= from.x + from.w - 8);
            const launch = sides.sort((a,b) => Math.abs(a-node.x) - Math.abs(b-node.x))[0];
            if (!Number.isFinite(launch) || STAGE_SURFACES.some(s => s.solid && s.id !== to.id &&
                launch + 85 > s.x && launch - 85 < s.x + s.w && from.y > s.y && to.y - BOSS_TERRAIN_HEIGHT < s.y + AWNING_DEPTH[s.id])) continue;
          }
          queue.push({ route: route.concat(to), x, cost: node.cost + 1 + Math.abs(x - node.x) / 180 + Math.abs(rise) / 700 });
        }
      }
      return null;
    }
    updateBossRoute(delta) {
      const boss = this.boss, player = this.player, current = this.getBossSurface();
      boss.streetApproachLimit = null;
      if (player.grounded) boss.chaseSurfaceId = player.supportedSurfaceId === SIGNAL_LIFT.id ? SIGNAL_LIFT.destinationSurfaceId :
        (player.supportedSurfaceId || 'street');
      if (!boss.chaseSurfaceId) return false;
      if (boss.clearanceTarget && (boss.clearanceTarget.id === current.id || boss.clearanceTarget.goal !== boss.chaseSurfaceId ||
          boss.clearanceTarget.side !== Math.sign(player.position.x - boss.x))) boss.clearanceTarget = null;
      const routeTarget = boss.clearanceTarget?.id || boss.chaseSurfaceId;
      let next = routeTarget === current.id ? null : this.getBossRouteStep(routeTarget);
      const roof = this.getLiftRoof();
      // Street is one support plane, but an awning or carriage can block the
      // walk to the next launch point. Clear the nearest obstruction first.
      const destinationSide = next ? next.x + next.w / 2 : this.getBossSafeLandingX(current, player.position.x) ?? player.position.x;
      const obstacles = STAGE_SURFACES.filter(s => s.solid).map(s => ({ ...s, bottomY: s.y + AWNING_DEPTH[s.id] }));
      if (this.isSignalLiftAvailable()) obstacles.push({ id: roof.id, x: roof.x, w: roof.w, y: roof.topY, bottomY: roof.y, solid: true });
      const blocker = obstacles.filter(s => s.id !== current.id && s.x < current.x + current.w && s.x + s.w > current.x &&
        current.y > s.y && current.y - BOSS_TERRAIN_HEIGHT < s.bottomY &&
        current.y - s.y <= 420 && Math.abs(destinationSide - boss.x) > BOSS_COMBAT.approachRange &&
        (boss.x <= s.x && destinationSide > s.x || boss.x >= s.x + s.w && destinationSide < s.x + s.w))
        .sort((a,b) => Math.abs(a.x + a.w/2 - boss.x) - Math.abs(b.x + b.w/2 - boss.x))[0];
      if (blocker) {
        if (current.id === 'street') {
          const direction = Math.sign(destinationSide - boss.x);
          const farEdge = direction > 0 ? blocker.x + blocker.w + 86 : blocker.x - 86;
          const exit = this.getBossSafeLandingX(current, farEdge, blocker);
          if (!Number.isFinite(exit) || direction * (exit - farEdge) < -.01) {
            // Adjacent awnings can close the far-side descent for his wider
            // body. Keep ranged combat on clear street footing in that case.
            boss.streetApproachLimit = direction > 0 ? blocker.x - 86 : blocker.x + blocker.w + 86;
            return false;
          }
        }
        const launchX = boss.x < blocker.x ? blocker.x - 100 : blocker.x + blocker.w + 100;
        const ceiling = obstacles.find(s => s.id !== blocker.id && s.id !== current.id && s.y < blocker.y &&
          s.bottomY > blocker.y - BOSS_TERRAIN_HEIGHT && launchX + 85 > s.x && launchX - 85 < s.x + s.w);
        if (ceiling) {
          // The left lift approach rises beneath the Firewall canopy. Use the
          // existing upper route to that canopy before crossing the shaft.
          boss.clearanceTarget = { id: ceiling.id, goal: boss.chaseSurfaceId, side: Math.sign(player.position.x - boss.x) };
          next = this.getBossRouteStep(ceiling.id);
        } else next = blocker;
      }
      if (!next) return false;
      let destinationX = player.position.x;
      if (next.id === boss.chaseSurfaceId) {
        const candidates = [-180, 180].map(offset => {
          let x = Math.max(next.x + 55, Math.min(next.x + next.w - 55, player.position.x + offset));
          if (next.id !== roof.id && this.isSignalLiftAvailable() && next.y > roof.topY && next.y - BOSS_TERRAIN_HEIGHT < roof.y &&
              x + 85 > roof.x && x - 85 < roof.x + roof.w) {
            x = x < roof.x + roof.w / 2 ? roof.x - 85 : roof.x + roof.w + 85;
          }
          return x;
        });
        candidates.sort((a, b) => {
          const aClear = Math.abs(a - player.position.x) >= 140, bClear = Math.abs(b - player.position.x) >= 140;
          return aClear !== bClear ? (aClear ? -1 : 1) : aClear ? Math.abs(a - boss.x) - Math.abs(b - boss.x) : Math.abs(b - player.position.x) - Math.abs(a - player.position.x);
        });
        destinationX = candidates[0];
      }
      const desiredX = Math.max(current.x - 205, Math.min(current.x + current.w + 205, destinationX));
      let landingX = this.getBossSafeLandingX(next, desiredX, current);
      if (!Number.isFinite(landingX)) return false;
      let launchX = Math.max(current.x + 55, Math.min(current.x + current.w - 55, landingX));
      if ((current.solid || current.id === 'signal-lift-roof') && next.y > current.y) {
        // Leave from the actual edge so the whole body clears the slab before
        // descending. The old 55-unit inset could land him back on the awning.
        launchX = landingX < current.x + current.w / 2 ? current.x + 8 : current.x + current.w - 8;
      }
      if ((next.id === 'signal-lift-roof' || next.solid) && current.y > next.y) {
        // Go around the roof edge before rising; never jump through its slab.
        const sides = [next.x - 100, next.x + next.w + 100].filter(x => x >= current.x + 8 && x <= current.x + current.w - 8);
        if (sides.length) launchX = sides.sort((a,b) => Math.abs(a-boss.x)-Math.abs(b-boss.x))[0];
      }
      if (Math.abs(landingX-launchX)>360) {
        landingX = this.getBossSafeLandingX(next, launchX+Math.sign(landingX-launchX)*360, current);
        if (!Number.isFinite(landingX) || Math.abs(landingX-launchX)>370) return false;
      }
      const dx = launchX - boss.x;
      if (Math.abs(dx) > 10) {
        boss.facing = Math.sign(dx);
        boss.x += boss.facing * Math.min(Math.abs(dx), BOSS_COMBAT.approachSpeed * delta / 1000);
        return true;
      }
      boss.facing = Math.sign(landingX - boss.x) || boss.facing;
      boss.traversal = { phase: 'warning', elapsed: 0, startX: boss.x, startY: boss.y,
        x: landingX, y: next.y - PLAYER_VISUAL_FOOT_OFFSET, surfaceId: next.id, startSurfaceId: current.id,
        duration: Math.max(800, Math.min(1250, Math.hypot(landingX - boss.x, next.y - current.y) * 2)) };
      boss.canDealDamage = false; boss.canReceiveDamage = false;
      this.setBossAnimation('sector_1_boss_idle_idle', true);
      window.audioSystem?.playCombatCue?.('windup', { material: 'boss' });
      return true;
    }
    updateBossTraversal(delta) {
      const boss = this.boss, jump = boss.traversal;
      if (jump.surfaceId === 'signal-lift-roof') jump.y = this.getLiftRoof().topY - PLAYER_VISUAL_FOOT_OFFSET;
      jump.elapsed += delta;
      if (jump.phase === 'warning') {
        if (jump.elapsed < 850) return;
        jump.phase = 'flight'; jump.elapsed = 0;
        boss.supportedSurfaceId = null;
      }
      const t = Math.min(1, jump.elapsed / jump.duration);
      let arc = 130 + Math.max(0, jump.startY - jump.y) * 0.35;
      if ((jump.startSurfaceId === 'signal-lift-roof' || AWNING_DEPTH[jump.startSurfaceId]) && jump.y > jump.startY) {
        // Keep the feet above the departure slab until horizontal travel has
        // cleared it; a deep drop otherwise starts by falling into that slab.
        arc = Math.max(arc, (jump.y - jump.startY) * .5 + 60);
      }
      // Rise beside the slab when boarding; clear its edge early when leaving
      // downward so the boss's wide feet do not immediately land back on it.
      const horizontalT = (jump.surfaceId === 'signal-lift-roof' || AWNING_DEPTH[jump.surfaceId]) && jump.startY > jump.y ? Math.max(0, (t - 0.5) * 2) :
        (jump.startSurfaceId === 'signal-lift-roof' || AWNING_DEPTH[jump.startSurfaceId]) && jump.startY < jump.y ? Math.min(1, t * 1.8) : t;
      boss.x = lerp(jump.startX, jump.x, horizontalT);
      boss.y = lerp(jump.startY, jump.y, t) - Math.sin(t * Math.PI) * arc;
      if (t >= 1) {
        boss.x = jump.x; boss.y = jump.y; boss.supportedSurfaceId = jump.surfaceId === 'street' ? null : jump.surfaceId;
        boss.traversal = null; boss.landingPoseMs = 350;
        this.setBossCombatPhase('recovery');
        boss.routeRecovery = boss.chaseSurfaceId !== jump.surfaceId;
        window.BARCODE?.combatFX?.contact('boss', boss.x, boss.y + PLAYER_VISUAL_FOOT_OFFSET, boss.facing, false, false);
        window.renderer?.impact?.('boss');
      }
    }
    drawBossAuthoredPose(ctx) {
      const boss = this.boss, art = window.BARCODE?.PresentationAssets;
      if (!art) return false;
      const jump = boss.traversal;
      if (jump) {
        ctx.save();
        const foot = jump.y + PLAYER_VISUAL_FOOT_OFFSET;
        ctx.strokeStyle = jump.phase === 'warning' ? '#ffb977' : '#eabfff'; ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.ellipse(jump.x, foot - 3, 63, 12, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        if (jump.phase === 'warning') {
          ctx.beginPath(); ctx.arc(boss.x, boss.y - 155, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, jump.elapsed / 850)); ctx.stroke();
        }
        ctx.restore();
        const frame = jump.phase === 'warning' ? (jump.elapsed < 430 ? 0 : 1) : Math.min(6, 2 + Math.floor(jump.elapsed / jump.duration * 5));
        return art.draw('bossLeap', ctx, { x: boss.x, y: boss.y + PLAYER_VISUAL_FOOT_OFFSET, width: 350, height: 350, frame, flip: boss.facing < 0 });
      }
      if (boss.landingPoseMs > 0) return art.draw('bossLeap', ctx, { x: boss.x, y: boss.y + PLAYER_VISUAL_FOOT_OFFSET, width: 350, height: 350, frame: boss.landingPoseMs > 180 ? 6 : 7, flip: boss.facing < 0 });
      if (this.getBossPresentationKey() !== 'flourish') return false;
      return art.draw('bossFlourish', ctx, { x: boss.x, y: boss.y + PLAYER_VISUAL_FOOT_OFFSET, width: 366, height: 366, frame: this.getBossFlourishFrame(), flip: boss.facing < 0 });
    }
    getBossFlourishFrame() {
      if (this.state === STATES.BOSS_HOLD) return 11;
      if (this.state !== STATES.BOSS_FLOURISH) return Math.min(11, Math.floor((this.boss.phaseElapsedMs || 0) / BOSS_COMBAT.sweepMs * 12));
      // A quick authored blade flourish, a held roar, then return to ready.
      // Holds keep the four-second entrance without stretching motion to 3fps.
      const durations = [600, 100, 100, 100, 100, 100, 100, 100, 100, 1900, 100, 600];
      let elapsed = this.phaseElapsed;
      for (let frame = 0; frame < durations.length; frame++) {
        if (elapsed < durations[frame]) return frame;
        elapsed -= durations[frame];
      }
      return 11;
    }
    getBossMusicSample() {
      const time = window.audioSystem?.context?.currentTime;
      const sample = Number.isFinite(time) ? window.BARCODE?.MusicTransport?.sample?.(time) : null;
      return sample?.running && sample.grid && Number.isFinite(sample.grid.beatFloat) ? sample : null;
    }
    bossBoundaryReady(minimumMs, key = 'phaseBeatWait') {
      const sample = this.getBossMusicSample();
      // Silent/no-grid development hosts retain a finishable stomp encounter.
      // Live music always owns the boundary; no extra timer or beat scheduler.
      if (!sample) { this.boss[key] = null; return this.boss.phaseElapsedMs >= minimumMs; }
      const previous = this.boss[key];
      const beat = sample.grid.beatIndex;
      this.boss[key] = { generation: sample.generation, beat };
      const crossed = previous?.generation === sample.generation && beat > previous.beat;
      // Sampling a crossing (rather than waiting for an exact floating point
      // time) works at 30/60/120 FPS and cannot replay a backlog after a hitch.
      return this.boss.phaseElapsedMs >= minimumMs && (crossed || Math.abs(sample.grid.beatFloat - beat) < 0.000001);
    }
    emitBossPulse() {
      const surface = this.getBossSurface();
      this.boss.pulses.push({ id: ++this.boss.pulseSequence, originX: this.boss.x,
        groundY: surface.y, left: surface.x, right: surface.x + surface.w,
        radius: 0, previousRadius: 0, hit: false });
      window.renderer?.impact?.('boss');
      window.BARCODE?.stageFX?.event('boss', this.boss.x, { duration: 650 });
    }
    updateBossCombat(deltaTime) {
      if (!this.isBossCombatLive()) return;
      this.updateBossSupport(deltaTime);
      const boss = this.boss, motion = this.captureRoofActor(boss);
      if (boss.supportedSurfaceId === 'signal-lift-roof' && !this.isRoofRider(boss)) {
        boss.supportedSurfaceId = null; boss.roofFallVelocity = 0;
      }
      if (Number.isFinite(boss.roofFallVelocity)) {
        boss.roofFallVelocity += 1460 * Math.max(0, deltaTime) / 1000;
        const previousFoot = boss.y + 72;
        boss.y += boss.roofFallVelocity * Math.max(0, deltaTime) / 1000;
        const support = this.getActorSurfaces(boss).concat([{ id: 'street', x: 0, w: WORLD_WIDTH, y: 856 }])
          .filter(s => boss.x + 40 > s.x && boss.x - 40 < s.x + s.w && previousFoot <= s.y + 2 && boss.y + 72 >= s.y)
          .sort((a,b) => a.y-b.y)[0];
        if (support) {
          boss.y = support.y - 72; boss.supportedSurfaceId = support.id === 'street' ? null : support.id;
          boss.roofFallVelocity = null; this.setBossCombatPhase('recovery');
        }
        this.updateBossSprite(deltaTime);
      } else this.advanceBossCombat(deltaTime);
      this.resolveLiftActor(boss, motion);
    }
    spawnSupportDrone(owner, side=1) {
      if(!window.RooftopDrone || !window.enemyManager || !this.player)return null;
      const x=Math.max(100,Math.min(WORLD_WIDTH-100,this.player.position.x+side*470));
      const y=Math.max(130,this.player.position.y-155);
      const drone=new window.RooftopDrone(x,y,{x:0,w:WORLD_WIDTH},null,{owner,side});
      drone.spawnTimeMs=window.enemyManager.hostileSimulationTimeMs || 0;
      window.enemyManager.enemies.push(drone);return drone;
    }
    updateBossSupport(delta) {
      const boss=this.boss,choice=window.BARCODE?.LevelDifficulty?.choice?.id || 'standard';
      const relaxed=choice==='relaxed';
      if(boss.health>(relaxed?4:6))return;
      boss.supportWaitMs=Math.max(0,(boss.supportWaitMs||0)-delta);
      const cap=relaxed?1:2,alive=(window.enemyManager?.enemies||[]).filter(e=>e.active&&e._bossSupport).length;
      const waves=relaxed?2:choice==='overclocked'?4:3;
      if(alive>=cap || boss.supportWaitMs>0 || boss.supportWaves>=waves || boss.phase!=='approach')return;
      const side=boss.supportWaves%2===0?-1:1;
      this.spawnSupportDrone('boss',side);boss.supportWaves++;boss.supportWaitMs=relaxed?18000:12000;
      window.audioSystem?.playCombatCue?.('warning');
    }
    advanceBossCombat(deltaTime) {
      if (!this.isBossCombatLive()) return;
      const boss = this.boss;
      const delta = Math.max(0, deltaTime);
      if (this.player.grounded) boss.stompArmed = true;
      boss.phaseElapsedMs += delta;
      boss.hitFlashMs = Math.max(0, boss.hitFlashMs - delta);
      boss.guardBounceMs = Math.max(0, (boss.guardBounceMs || 0) - delta);
      boss.landingPoseMs = Math.max(0, (boss.landingPoseMs || 0) - delta);
      if (boss.traversal) {
        this.updateBossTraversal(delta);
        this.updateBossPulses(delta);
        this.updateBossSprite(delta);
        return;
      }
      if (boss.phase === 'approach') {
        if (this.updateBossRoute(delta)) { this.updateBossPulses(delta); this.updateBossSprite(delta); return; }
        const surface = this.getBossSurface();
        // If the player fits beneath an awning but the taller boss cannot,
        // attack from nearby clear footing instead of cycling up and down.
        const approachX = boss.streetApproachLimit ?? this.getBossSafeLandingX(surface, this.player.position.x) ?? boss.x;
        const dx = approachX - boss.x;
        boss.facing = this.player.position.x < boss.x ? -1 : 1;
        if (Math.abs(dx) > BOSS_COMBAT.approachRange) {
          const distance = Math.min(Math.abs(dx) - BOSS_COMBAT.approachRange, BOSS_COMBAT.approachSpeed * delta / 1000);
          boss.x = Math.max(surface.x + 45, Math.min(surface.x + surface.w - 45, boss.x + Math.sign(dx) * distance));
        } else this.setBossCombatPhase('telegraph');
      } else if (boss.phase === 'telegraph') {
        const duration = boss.latePhase ? BOSS_COMBAT.fastTelegraphMs : BOSS_COMBAT.telegraphMs;
        if (this.bossBoundaryReady(duration)) this.setBossCombatPhase('sweep');
      } else if (boss.phase === 'sweep') {
        if (boss.attackPattern !== 'slam' && boss.doublePulse && !boss.secondPulseEmitted && this.bossBoundaryReady(BOSS_COMBAT.secondPulseMs, 'secondPulseBeatWait')) {
          boss.secondPulseEmitted = true;
          boss.lastPulseAtMs = boss.phaseElapsedMs;
          this.emitBossPulse();
        }
        const doublePulse = boss.attackPattern !== 'slam' && boss.doublePulse;
        const duration = doublePulse ? (boss.lastPulseAtMs || 0) + BOSS_COMBAT.sweepMs : BOSS_COMBAT.sweepMs;
        if ((!doublePulse || boss.secondPulseEmitted) && this.bossBoundaryReady(duration)) this.setBossCombatPhase('recovery');
      } else if (boss.phase === 'recovery') {
        if (this.bossRecoveryReady()) { boss.routeRecovery = false; this.setBossCombatPhase('approach'); }
      }
      this.updateBossSlam(delta);
      this.updateBossPulses(delta);
      boss.canDealDamage = boss.phase === 'sweep' || boss.pulses.some(pulse => !pulse.hit) || (boss.slam?.remainingMs > 0 && !boss.slam.hit);
      this.updateBossSprite(delta);
    }
    updateBossPulses(deltaTime) {
      const boss = this.boss;
      const player = this.player;
      const footY = player.position.y + PLAYER_VISUAL_FOOT_OFFSET;
      boss.pulses.forEach(pulse => {
        const ground = pulse.groundY ?? (GROUND_Y + PLAYER_VISUAL_FOOT_OFFSET);
        pulse.previousRadius = pulse.radius;
        pulse.radius += BOSS_COMBAT.pulseSpeed * deltaTime / 1000;
        if (player.position.x < (pulse.left ?? 0) || player.position.x > (pulse.right ?? WORLD_WIDTH)) return;
        if (pulse.hit || footY < ground - BOSS_COMBAT.pulseHeight || footY > ground + 24) return;
        const distance = Math.abs(player.position.x - pulse.originX);
        const halfWidth = BOSS_COMBAT.pulseWidth / 2 + 24;
        // Swept annulus contact prevents a low-frame-rate pulse tunneling
        // through the player. The two directions share one damage latch.
        if (distance + halfWidth < pulse.previousRadius || distance - halfWidth > pulse.radius) return;
        pulse.hit = true;
        if (player.isDamageInvulnerable?.()) return;
        if (window.hackingSystem?.absorbGuardHit?.()) return;
        player.takeDamage?.(1, { x: pulse.originX, y: player.position.y });
      });
      boss.pulses = boss.pulses.filter(pulse => pulse.radius < BOSS_COMBAT.pulseRange);
    }
    getBossHitbox() {
      if (!this.boss?.active) return null;
      // A stable hull in visible-foot space; breathing animation never moves
      // the collision plane away from the locked sprite's sidewalk contact.
      return { x: this.boss.x - BOSS_COMBAT.hitboxWidth / 2,
        y: this.boss.y + PLAYER_VISUAL_FOOT_OFFSET - BOSS_COMBAT.hitboxHeight,
        width: BOSS_COMBAT.hitboxWidth, height: BOSS_COMBAT.hitboxHeight };
    }
    getBossRhythmTarget(player = this.player, range = 300) {
      if (!this.isBossCombatLive() || window.hackingSystem?.isActive?.()) return null;
      const bounds = this.getBossHitbox();
      // The pulse reaches a body, not an invisible point behind its front edge.
      // Use the same world-space hull at street height and on every roof.
      const x = player?.position?.x, y = player?.position?.y;
      const dx = bounds ? Math.max(bounds.x - x, 0, x - bounds.x - bounds.width) : Infinity;
      const dy = bounds ? Math.max(bounds.y - y, 0, y - bounds.y - bounds.height) : Infinity;
      return { inRange: !!(player?.position && Number.isFinite(range) && range > 0 &&
        Math.hypot(dx, dy) <= range),
        guarded: !this.boss.canReceiveDamage || this.boss.phase !== 'recovery', bounds };
    }
    applyBossRhythmDamage({ player = this.player, judgment, sequence, range = 300 } = {}) {
      if (!this.isBossCombatLive()) return { ok: false, reason: 'boss-inactive' };
      if (window.hackingSystem?.isActive?.()) return { ok: false, reason: 'hacking-active' };
      if (!judgment?.available || !['perfect', 'excellent'].includes(judgment.timing)) return { ok: false, reason: 'offbeat' };
      const target = this.getBossRhythmTarget(player, range);
      if (!target?.inRange) return { ok: false, reason: 'out-of-range' };
      if (target.guarded) return { ok: false, reason: 'boss-guarded' };
      if (sequence === undefined || sequence === null || this.boss.hitSequences.has(sequence)) return { ok: false, reason: 'duplicate-attack' };
      this.boss.hitSequences.add(sequence);
      window.BARCODE?.Campaign?.contact(sequence, judgment);
      return this.damageBoss('rhythm');
    }
    applyBossStomp(player, movement = {}) {
      if (!this.isBossCombatLive() || this.boss.traversal || player !== this.player || player.allowMovement === false ||
        window.hackingSystem?.isActive?.() || player.velocity.y <= 0) return false;
      const box = this.getBossHitbox();
      const previousFootY = movement.previousFootY + PLAYER_VISUAL_FOOT_OFFSET;
      const currentFootY = movement.currentFootY + PLAYER_VISUAL_FOOT_OFFSET;
      if (!Number.isFinite(previousFootY) || !Number.isFinite(currentFootY) ||
        previousFootY > box.y + 12 || currentFootY < box.y || currentFootY <= previousFootY) return false;
      const t = Math.max(0, (box.y - previousFootY) / (currentFootY - previousFootY));
      const previousX = Number.isFinite(movement.previousX) ? movement.previousX : player.position.x;
      const crossingX = previousX + (player.position.x - previousX) * t;
      if (crossingX + 26 <= box.x || crossingX - 26 >= box.x + box.width) return false;
      const canCounter = this.canStompCounter();
      this.boss.stompArmed = false;
      player.position.y = box.y - PLAYER_VISUAL_FOOT_OFFSET;
      player.supportedSurfaceId = null;
      // Resolve ties using the incoming side; near a world edge, send the
      // player toward open space. A short impulse clears the head before air
      // control resumes. Another stomp counter requires landing on a surface.
      let direction = Math.sign(crossingX - this.boss.x) || -this.boss.facing || -1;
      if (this.boss.x < 260) direction = 1;
      if (this.boss.x > WORLD_WIDTH - 260) direction = -1;
      player.stompRebound?.(direction);
      if (window.audioSystem?.playCombatCue) window.audioSystem.playCombatCue(canCounter ? 'stomp' : 'guard');
      else window.audioSystem?.playSound?.(canCounter ? 'kick' : 'hihat');
      if (canCounter) {
        window.particleSystem?.stompEffect?.(crossingX, box.y, null, player.facing || 1);
        this.boss.stompCycle = this.boss.cycle;
        this.damageBoss('stomp');
      } else {
        window.particleSystem?.impact?.(crossingX, box.y, '#ffbd70', 8);
        this.boss.guardBounceMs = 700;
      }
      return true;
    }
    damageBoss(source) {
      // Cars are physical hazards; the musical guard does not stop a vehicle.
      if (!this.isBossCombatLive() || (source !== 'traffic' && !this.boss.canReceiveDamage)) return { ok: false, reason: 'boss-guarded' };
      this.boss.health = Math.max(0, this.boss.health - 1);
      this.boss.hitFlashMs = 160;
      window.renderer?.addScreenShake?.(2, 80);
      window.particleSystem?.impact?.(this.boss.x, this.boss.y - 70, '#00ffff', 16);
      window.objectivesSystem?.setBossCombatObjective?.(this.boss.health, this.boss.maxHealth);
      const target = { type: 'boss', damage: 1, x: this.boss.x, y: this.boss.y, source };
      if (this.boss.health === 0) this.completeLevel();
      return { ok: true, target, health: this.boss.health };
    }
    completeLevel({ debugSkip = false } = {}) {
      if (this.boss?.defeated || this.state === STATES.LEVEL_COMPLETE || !this.boss) return false;
      if (!debugSkip) window.BARCODE?.LevelDifficulty?.complete();
      window.BARCODE?.Campaign?.finish({ debugSkip });
      window.BARCODE?.musicDirector?.accent('clear');
      this.boss.health = 0;
      this.boss.defeated = true;
      this.boss.canDealDamage = false;
      this.boss.canReceiveDamage = false;
      this.boss.pulses = [];
      this.boss.phase = 'defeated';
      for(const enemy of window.enemyManager?.enemies || [])if(enemy._bossSupport){enemy.active=false;enemy._disposed=true;enemy.pulse=null;}
      window.renderer?.impact?.('victory');
      window.BARCODE?.stageFX?.event('victory', this.boss.x, { duration: 1400 });
      window.BARCODE?.combatFX?.contact('firewall', this.boss.x, this.boss.y, -1, true, true);
      this.boss.state = 'idle';
      this.setBossAnimation('sector_1_boss_idle_idle', true);
      this.state = STATES.LEVEL_COMPLETE;
      this.levelCompletionCount += 1;
      if (this.player?.velocity) { this.player.velocity.x = 0; this.player.velocity.y = 0; }
      if (this.player) this.player.controlsDisabled = true;
      window.hackingSystem?.reset?.();
      window.inputManager?.resetActionEdges?.();
      window.objectivesSystem?.completeLevelObjective?.();
      this.completion = { elapsedMs: 0, controlsReady: false, releaseMs: 0, score: window.gameState?.score || 0,
        bestCombo: window.rhythmSystem?.runBestCombo || 0,
        fragments: window.lostDataSystem?.getProgress?.().collected || 0,
        totalFragments: window.lostDataSystem?.maxTotalLore || 3 };
      if (window.gameState) { window.gameState.victory = true; window.gameState.gameOver = false; window.gameState.running = false; }
      return true;
    }
    updateCompletionPresentation(deltaTime = 0) {
      if (!this.completion || this.state !== STATES.LEVEL_COMPLETE || !window.gameState?.victory || window.isPaused || window.gameState?.paused) return;
      const { holdMs, fadeMs, rowMs, staggerMs } = COMPLETION_PRESENTATION;
      this.completion.elapsedMs = Math.min(holdMs + fadeMs + rowMs + 2 * staggerMs,
        this.completion.elapsedMs + Math.max(0, Number(deltaTime) || 0));
      if (!this.completion.controlsReady) {
        const finished = this.completion.elapsedMs >= holdMs + fadeMs + rowMs + 2 * staggerMs;
        this.completion.releaseMs = !finished || window.inputManager?.isResultControlHeld?.() ? 0 :
          this.completion.releaseMs + Math.min(100, Math.max(0, Number(deltaTime) || 0));
        this.completion.controlsReady = this.completion.releaseMs >= COMPLETION_PRESENTATION.releaseMs;
      }
    }
    areCompletionControlsReady() { return !!this.completion?.controlsReady; }
    getCompletionReveal() {
      const { holdMs, fadeMs } = COMPLETION_PRESENTATION;
      return Math.max(0, Math.min(1, ((this.completion?.elapsedMs || 0) - holdMs) / fadeMs));
    }
    getCompletionPresentation() {
      if (!this.completion) return null;
      const result = this.completion;
      const { holdMs, fadeMs, rowMs, staggerMs } = COMPLETION_PRESENTATION;
      // Give every row its full count-up after the final-hit hold and card fade.
      const visibleMs = result.elapsedMs - holdMs - fadeMs;
      return ['score', 'bestCombo', 'fragments'].map((key, index) => {
        const progress = Math.max(0, Math.min(1, (visibleMs - index * staggerMs) / rowMs));
        return { key, value: Math.round(result[key] * (1 - Math.pow(1 - progress, 3))), finalValue: result[key], progress,
          total: key === 'fragments' ? result.totalFragments : null };
      });
    }
    canRetryBossCheckpoint() {
      if(window.gameState?.gameOver && window.BARCODE?.Campaign?.run?.recoveryMode==='full-run')return false;
      const runtimeState = window.BARCODE?.RuntimeLifecycle?.getState?.();
      return !!(this.bossCheckpoint && this.boss && (window.gameState?.gameOver || window.gameState?.victory) &&
        (!runtimeState || runtimeState === 'running') && !window.isPaused && !window.gameState?.paused);
    }
    retryBossCheckpoint() {
      if (!this.canRetryBossCheckpoint()) return { ok: false, reason: 'checkpoint-unavailable' };
      const checkpoint = this.bossCheckpoint;
      window.BARCODE?.Campaign?.retryBoss();
      this.completion = null;
      const player = this.player;
      if (!player) return { ok: false, reason: 'player-unavailable' };
      window.hackingSystem?.reset?.();
      window.enemyManager?.clear?.({ preserveDefeats: true });
      window.spaceShipSystem?.resetRuntime?.();
      window.cancelInitialEnemySpawn?.();
      window.BARCODE?.playerCombat?.reset?.();
      window.inputManager?.resetActionEdges?.();
      // Reset feedback only. Do not stop, seek, or restart the music transport.
      window.rhythmSystem?.hideRhythmMode?.();
      window.rhythmSystem?.restart?.();
      Object.assign(player.position, { x: checkpoint.playerX, y: GROUND_Y });
      window.renderer?.resetFollowCamera?.(checkpoint.playerX);
      Object.assign(player.velocity, { x: 0, y: 0 });
      Object.assign(player, { health: player.maxHealth, grounded: true, controlsDisabled: false,
        allowMovement: true, isEntering: false, supportedSurfaceId: null, dropSurfaceId: null, dropSurfaceIds: null,
        invulnerable: false, invulnerableUntil: 0, _enemyInvulnerableUntilMs: 0,
        primaryAttackAnimationMs: 0, afterimageMs: 0, hudReaction: null, coyoteTimerMs: 0, jumpBufferTimerMs: 0,
        jumpHeldMs: 0, jumpReleaseQueued: false, airInput: 0 });
      this.cameraY = 0;
      this.skyCaches = new Set(checkpoint.skyCaches || []);
      this.boss.x = checkpoint.bossX;
      this.boss.y = GROUND_Y;
      this.cinematicZoomOverride = null;
      this.cameraOverrideActive = false;
      this.frozenPlayerPosition = null;
      window.renderer?.clearCinematicZoomOverride?.();
      if (window.BARCODE) window.BARCODE.signalAmpCharges = checkpoint.signalAmpCharges;
      Object.assign(window.gameState, { running: true, gameOver: false, victory: false,
        paused: false, score: checkpoint.score, collectionMessage: null, lorePendingMessage: null });
      this.enterBossReady();
      return { ok: true, state: this.state };
    }
    restoreCampaignCheckpoint(saved) {
      const B = window.BARCODE, state = saved.levelState, player = this.player;
      if (!player || !state) return false;
      const difficulty = B.LevelDifficulty;
      difficulty.beginLevel('level-01');
      const selection = difficulty.profile().choices.findIndex(c => c.id === state.difficultyId);
      if (selection < 0) return false;
      difficulty.select(selection); difficulty.setRecovery(state.run?.recoveryMode || 'checkpoints'); difficulty.confirm();
      window.tutorialSystem?.cancelPendingTimers?.();
      if (window.tutorialSystem) { window.tutorialSystem.active = false; window.tutorialSystem.completed = true; }
      this.startMission();
      const index = ENCOUNTERS.findIndex(e => e.id === saved.checkpointId);
      const cleared = index >= 0 ? index : ENCOUNTERS.length;
      this.missionDefeats = ENCOUNTERS.slice(0, cleared).reduce((n, e) => n + encounterSpecs(e).length, 0);
      ENCOUNTERS.slice(0, cleared).forEach(e => { this.spawnedEncounterIds.add(e.id); this.restoreEncounterSignal(e.id); });
      this.state = index >= 0 ? ENCOUNTERS[index].id : STATES.JAMMER_ACTIVE;
      this.skyCaches = new Set((state.skyCaches || []).filter(id => SKY_CACHES.some(c => c.id === id)));
      this.closedGateEncounterId = null; this.pendingSpawns = [];
      Object.assign(player.position, { x: Math.max(60, Math.min(WORLD_WIDTH - 60, state.playerX)), y: GROUND_Y });
      Object.assign(player.velocity, { x: 0, y: 0 });
      Object.assign(player, { health: Math.max(1, Math.min(player.maxHealth, state.health || player.maxHealth)),
        grounded: true, isEntering: false, controlsDisabled: false, allowMovement: true, supportedSurfaceId: null,
        dropSurfaceId: null, dropSurfaceIds: null, invulnerable: false, invulnerableUntil: 0,
        _enemyInvulnerableUntilMs: 0, bossReboundMs: 0, primaryAttackAnimationMs: 0 });
      // Older checkpoints can hold an x beyond this still-locked encounter.
      // Restore onto the player's playable side before input/render resumes.
      this.applyGateCollision();
      if (window.gameState) Object.assign(window.gameState, { score: state.score || 0, enemiesDefeated: this.missionDefeats, running: true, victory: false, gameOver: false });
      if (window.enemyManager) window.enemyManager.defeatedCount = this.missionDefeats;
      if (window.lostDataSystem) { window.lostDataSystem.collectedLore = new Set((state.fragments || []).filter(id => /^lore\.l01\.0[1-3]$/.test(id))); window.lostDataSystem.fragments = []; }
      B.signalAmpCharges = Math.max(0, Math.min(3, state.ampCharges || 0));
      if (window.rhythmSystem) { window.rhythmSystem.runBestCombo = state.bestCombo || 0; window.rhythmSystem.hideRhythmMode?.(); }
      window.objectivesSystem?.setMissionDefeatObjective?.(this.missionDefeats, this.requiredEnemyKills);
      if (saved.checkpointId === 'jammer') this.revealJammer();
      if (['boss', 'intermission'].includes(saved.checkpointId)) {
        this.jammerRevealed = true; this.jammerDestroyedNotified = true;
        this.districtSignal.interference = 0;
        this.districtSignal.restoration = { originX: 2000, distance: WORLD_WIDTH, startedAtMs: -10000 };
        this.prepareBossAssets(); this.pollPreparedAssets();
        this.startBossWalk();
        // A reload skipped the cinematic preload interval. Keep the normal
        // frame-owned sprite readiness polling instead of locking a fallback.
        this.boss.fallbackLocked = false;
        this.boss.x = state.boss?.bossX ?? 3300; this.boss.y = GROUND_Y;
        this.bossCheckpoint = state.boss || { playerX: player.position.x, bossX: this.boss.x, score: state.score || 0, skyCaches: [...this.skyCaches], signalAmpCharges: B.signalAmpCharges };
        this.enterBossReady();
        if (saved.checkpointId === 'intermission') {
          // Restore presentation from the committed result, without awarding a
          // second clear, bonus, key, or challenge value.
          Object.assign(this.boss, { defeated: true, health: 0, phase: 'defeated', canReceiveDamage: false, canDealDamage: false });
          this.state = STATES.LEVEL_COMPLETE;
          this.completion = { elapsedMs: 3000, controlsReady: false, releaseMs: 0, score: state.result.score,
            bestCombo: state.result.bestCombo, fragments: state.result.discoveries, totalFragments: 3 };
          Object.assign(window.gameState, { score: state.result.score, victory: true, running: false });
          player.controlsDisabled = true;
        }
      }
      this.cameraOverrideActive = false; this.cinematicZoomOverride = null; this.frozenPlayerPosition = null;
      window.renderer?.resetFollowCamera?.(player.position.x);
      window.inputManager?.resetActionEdges?.();
      return true;
    }
    getBossStatus() {
      const boss = this.boss;
      if (!boss) return null;
      return { phase: boss.phase || 'intro', phaseElapsedMs: boss.phaseElapsedMs || 0,
        health: boss.health ?? BOSS_COMBAT.maxHealth, maxHealth: boss.maxHealth || BOSS_COMBAT.maxHealth,
        cycle: boss.cycle || 0, doublePulse: !!boss.doublePulse, latePhase: !!boss.latePhase, attackPattern: boss.attackPattern || 'pulse',
        stompArmed: !!boss.stompArmed, canStompCounter: this.canStompCounter(), defeated: !!boss.defeated,
        canDealDamage: !!boss.canDealDamage, canReceiveDamage: !!boss.canReceiveDamage,
        pulses: (boss.pulses || []).map(pulse => ({ ...pulse })), hitbox: this.getBossHitbox(),
        checkpointAvailable: !!this.bossCheckpoint, retryAvailable: this.canRetryBossCheckpoint() };
    }
    canStompCounter() { return !!(this.boss?.canReceiveDamage && this.boss.stompArmed && this.boss.stompCycle !== this.boss.cycle); }
    draw(ctx) {
      const bossBehindLift = this.getLiftActorLayer(this.boss) === 'behind';
      if (bossBehindLift) this.drawBoss(ctx);
      this.drawStageSurfaces(ctx); this.drawEncounterGates(ctx, false); this.drawRepairRoute(ctx);
      if (!bossBehindLift) this.drawBoss(ctx);
    }
    drawEncounterHardware(ctx) {
      if (!ctx) return;
      for (const { gate, progress, opening } of this.getGatePresentation()) this.drawBarrierHardware(ctx, gate, opening, progress);
      ENCOUNTER_GATES.forEach((gate, i) => {
        if (this.districtSignal.clearedAtMs[i] !== null && this.districtSignal.elapsedMs - this.districtSignal.clearedAtMs[i] >= 650)
          this.drawBarrierHardware(ctx, gate, true, 1);
      });
    }
    drawStageSurfaces(ctx) {
      if (!ctx) return;
      this.drawSignalLift(ctx, 'cabin'); this.drawSignalAmp(ctx); this.drawSkyCaches(ctx);
      const zoom = window.renderer?.getZoomLevel?.() || window.renderer?.zoomLevel || 1;
      ctx.save(); ctx.lineWidth = 1 / zoom; ctx.shadowBlur = 0;
      for (const surface of STAGE_SURFACES) {
        const lip = surface.y - (surface.maskFeet || 0);
        // A dark keyline keeps the fine light edge readable on pale roof art.
        ctx.strokeStyle = 'rgba(8,18,28,0.35)'; ctx.lineWidth = 2.5 / zoom;
        ctx.beginPath(); ctx.moveTo(surface.x, lip); ctx.lineTo(surface.x + surface.w, lip); ctx.stroke();
        ctx.strokeStyle = 'rgba(198,244,224,0.48)'; ctx.lineWidth = 1 / zoom;
        ctx.stroke();
      }
      ctx.restore();
      const contact = this.headContactFx;
      if (contact?.ms > 0) {
        const y = contact.id === 'signal-lift-roof' ? this.getLiftRoof().y : contact.y;
        ctx.save(); ctx.globalAlpha *= contact.ms / 180; ctx.strokeStyle = '#fff5c9'; ctx.lineWidth = 2;
        for (const side of [-1,0,1]) {
          ctx.beginPath(); ctx.moveTo(contact.x + side * 5, y + 2);
          ctx.lineTo(contact.x + side * 13, y + (side ? 11 : 16)); ctx.stroke();
        }
        ctx.restore();
      }
    }
    getSceneryAnimationTime() {
      const prefs = window.BARCODE?.Preferences?.values || {};
      if (prefs.reducedMotion || prefs.flashes === false || window.BARCODE_RENDER_QUALITY?.flashes === false) return 0;
      // Combat/stage clocks already run during training and freeze with pause.
      // The district clock is available in the dependency-free host fixtures.
      return window.BARCODE?.combatFX?.timeMs ?? window.BARCODE?.stageFX?.timeMs ?? this.districtSignal?.elapsedMs ?? 0;
    }
    drawSignalLift(ctx, pass = 'all') {
      if (!ctx || !this.signalLift || !this.isSignalLiftAvailable()) return;
      const lift = this.signalLift, center = lift.x + lift.w / 2;
      const cabinHeight = SIGNAL_LIFT.cabinHeight, railTop = SIGNAL_LIFT.topY - cabinHeight * SIGNAL_LIFT.footAnchor;
      const railBottom = SIGNAL_LIFT.bottomY + 18;
      const moving = lift.state === 'moving' || lift.state === 'returning';
      const powered = moving || lift.chargeFxMs > 0;
      const phase = (lift.driveTimeMs || 0) / 1000;
      const standby = this.getSceneryAnimationTime();
      ctx.save();
      if (pass === 'all' || pass === 'drive') {
        // One stationary drive strip spans the complete travel plus cabin height.
        // It is drawn before the moving carriage, never attached to its roof.
        ctx.save(); ctx.beginPath(); ctx.rect(center - 25, railTop, 50, railBottom - railTop); ctx.clip();
        ctx.fillStyle = '#0e1d27'; ctx.fillRect(center - 22, railTop, 44, railBottom - railTop);
        for (let y = railTop; y < railBottom; y += 64) {
          window.BARCODE?.PresentationAssets?.draw('liftTrack', ctx, { x: center, y, width: 44, height: 66 });
        }
        ctx.strokeStyle = '#819fa7'; ctx.lineWidth = 2;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(center + side * 23, railTop); ctx.lineTo(center + side * 23, railBottom); ctx.stroke();
        }
        // Drive teeth visibly travel with the cable, reversing on the return.
        const offset = ((phase * 65) % 18 + 18) % 18;
        ctx.fillStyle = powered ? '#a2f2d5' : '#536b74';
        for (let y = railTop - 18 + offset; y < railBottom; y += 18) ctx.fillRect(center - 7, y, 14, 4);
        // A narrow diagnostic light remains active at the stops. It is not
        // cable movement, and never changes the carriage or support planes.
        const scanY = railTop + ((standby / 4700) % 1) * (railBottom - railTop - 18);
        ctx.fillStyle = 'rgba(169,243,228,0.65)'; ctx.fillRect(center + 15, scanY, 3, 18);
        ctx.restore();
      }
      if (pass === 'drive') { ctx.restore(); return; }
      if (pass === 'cabin' || pass === 'front') this.clipLiftCabinLayer(ctx,pass);
      const illustrated = window.BARCODE?.PresentationAssets?.draw('liftCabin', ctx,
        { x: lift.x, y: lift.y, width: lift.w, height: cabinHeight });
      if (!illustrated) {
        ctx.strokeStyle = '#526677'; ctx.lineWidth = 9;
        const roof = this.getLiftRoof();
        ctx.strokeRect(lift.x + 9, roof.y, lift.w - 18, lift.y - roof.y + 13);
        ctx.fillStyle = '#253f48'; ctx.fillRect(lift.x, roof.y - 24, lift.w, 24);
        ctx.fillRect(lift.x, lift.y - 10, lift.w, 32);
      }
      // Light travels along the painted top crossbar, inside both existing
      // layer clips. The cabin artwork and every physical anchor stay fixed.
      const cabinTop = lift.y - cabinHeight * SIGNAL_LIFT.footAnchor;
      const glintX = lift.x + lift.w * (0.085 + ((standby / 2600) % 1) * 0.62);
      ctx.fillStyle = 'rgba(205,255,248,0.85)';
      ctx.fillRect(glintX, cabinTop + cabinHeight * 0.127, lift.w * 0.10, 2.5);
      if (pass === 'cabin') { ctx.restore(); return; }
      // Front rails and floor lip cover passengers; their backs and the deck
      // surface were drawn earlier. These motor/light details belong in front.
      const motorY = lift.y + cabinHeight * 0.155;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(center + side * lift.w * 0.265, motorY);
        ctx.strokeStyle = powered ? '#b9ffe7' : '#425f6b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.rotate(phase * 8); ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke(); ctx.restore();
      }
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = i < lift.charges ? '#b8ff88' : '#374d46';
        ctx.beginPath(); ctx.arc(lift.x + lift.w * (i ? 0.61 : 0.28), lift.y + cabinHeight * 0.105, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = i < lift.charges ? '#e4ffbf' : '#7eaca2'; ctx.lineWidth = 1.5;
        const angle = standby / (moving ? 210 : 630) + i * Math.PI;
        ctx.beginPath(); ctx.arc(lift.x + lift.w * (i ? 0.61 : 0.28), lift.y + cabinHeight * 0.105, 8, angle, angle + Math.PI * 0.7); ctx.stroke();
      }
      const roof = this.getLiftRoof();
      // A thin underside glint follows the actual front crossbar. Only this
      // roof has the same complete span for side, underside and landing contact.
      ctx.strokeStyle = 'rgba(166,229,225,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(roof.x, roof.y); ctx.lineTo(roof.x + roof.w, roof.y); ctx.stroke();
      ctx.restore();
      this.drawLiftSquashes(ctx);
    }

    clipLiftCabinLayer(ctx,pass) {
      const lift=this.signalLift,top=lift.y-SIGNAL_LIFT.cabinHeight*SIGNAL_LIFT.footAnchor;
      // Trace the existing image's front frame, with the cabin opening as a
      // hole. Complementary clips split its pixels without replacing the art.
      const outer=[[0,62],[495,62],[619,0],[619,111],[539,183],[538,494],[568,545],[568,597],[520,640],[79,640],[0,596],[0,543],[43,502],[43,176],[0,120]];
      const opening=[[90,171],[486,171],[486,537],[90,537]];
      ctx.beginPath();
      if(pass==='cabin')ctx.rect(lift.x,top,lift.w,SIGNAL_LIFT.cabinHeight);
      for(const points of [outer,opening]){
        points.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](lift.x+x/619*lift.w,top+y/640*SIGNAL_LIFT.cabinHeight));
        ctx.closePath();
      }
      ctx.clip('evenodd');
    }

    crushLiftEnemies(previousY, currentY, riders) {
      if (currentY <= previousY) return;
      const lift = this.signalLift;
      for (const { actor, supported } of riders) {
        if (supported || actor === this.player || actor === this.boss || !actor.active || actor._defeatRecorded) continue;
        const body = this.getRoofActorBounds(actor);
        if (!body || body.x + body.width <= lift.x + 12 || body.x >= lift.x + lift.w - 12) continue;
        // The descending floor must cross the body from above. Cabin passengers,
        // roof riders, and enemies below a stationary/rising lift are safe.
        if (previousY > body.y + body.height - 4 || currentY < body.y) continue;
        if (!actor.takeDamage?.(actor.health, { squashed: true })) continue;
        actor.velocity.x = 0; actor.velocity.y = 0;
        this.liftSquashes.push({ actor, x: actor.position.x, footY: body.y + body.height, ageMs: 0 });
        if (this.liftSquashes.length > 12) this.liftSquashes.shift();
        window.enemyManager?.recordDefeat?.(actor);
        window.renderer?.impact?.('land');
      }
    }
    drawLiftSquashes(ctx) {
      for (const squash of this.liftSquashes || []) {
        const { actor, x, footY, ageMs } = squash;
        const t = Math.min(1, ageMs / 180), squashT = 1 - Math.pow(1 - t, 3);
        const scaleY = 1 - 0.92 * squashT, scaleX = 1 + 0.85 * squashT;
        // The carriage's illustrated base extends in front of its foot plane.
        // Keep the remains visible just below that base, in the same depth lane.
        const drawFoot = Math.max(footY, this.signalLift.y + SIGNAL_LIFT.cabinHeight * 0.17);
        ctx.save(); ctx.globalAlpha *= Math.min(1, (3200 - ageMs) / 650);
        ctx.fillStyle = 'rgba(8,12,23,0.55)';
        ctx.beginPath(); ctx.ellipse(x, drawFoot - 2, (actor.type === 'firewall' ? 75 : 48) * scaleX, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.translate(x, drawFoot); ctx.scale(scaleX, scaleY); ctx.translate(-x, -footY);
        if (actor.type === 'drone') {
          window.BARCODE?.PresentationAssets?.draw('rooftopDrone', ctx,
            { x, y: actor.position.y + 15, width: 156, height: 156, frame: 0, flip: actor.facing < 0 });
        } else if (actor.spriteReady && actor.sprite) actor.drawSprite(ctx);
        else {
          const box = actor.getHitbox(); ctx.fillStyle = actor.type === 'firewall' ? '#ff915f' : actor.type === 'virus' ? '#77e9c2' : '#bc8eff';
          ctx.fillRect(box.x, box.y, box.width, box.height);
        }
        ctx.restore();
        if (ageMs < 300) {
          ctx.save(); ctx.globalAlpha *= 1 - ageMs / 300; ctx.strokeStyle = '#ffd798'; ctx.lineWidth = 3;
          for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(x + side * (35 + t * 35), drawFoot - 7);
            ctx.lineTo(x + side * (45 + t * 60), drawFoot - 12 - t * 12); ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    getLiftRoof() {
      const lift = this.signalLift;
      const offset = SIGNAL_LIFT.cabinHeight * (SIGNAL_LIFT.footAnchor - SIGNAL_LIFT.roofUnderside);
      return { id: 'signal-lift-roof', x: lift.x + lift.w * 0.02, w: lift.w * 0.94,
        y: lift.y - offset, previousY: lift.prevY - offset,
        topY: lift.y - SIGNAL_LIFT.cabinHeight * (SIGNAL_LIFT.footAnchor - SIGNAL_LIFT.roofTop),
        previousTopY: lift.prevY - SIGNAL_LIFT.cabinHeight * (SIGNAL_LIFT.footAnchor - SIGNAL_LIFT.roofTop) };
    }

    getActorSurfaces(actor = null) {
      const transit = actor && this.getLiftTransitSurface(actor);
      const surfaces = this.getStageSurfaces().filter(s => !transit || !this.overlapsLiftTransit(s, transit));
      if (!this.isSignalLiftAvailable() || !this.signalLift) return surfaces;
      const roof = this.getLiftRoof();
      return surfaces.concat([{ ...this.signalLift, moving: true },
        { id: roof.id, x: roof.x, w: roof.w, y: roof.topY, h: roof.y - roof.topY, moving: true, solid: true }]);
    }
    overlapsLiftTransit(surface, transit) {
      return surface.x < transit.x + transit.w && surface.x + surface.w > transit.x;
    }
    getLiftTransitSurface(actor) {
      if (!actor) return null;
      const body = this.getRoofActorBounds(actor);
      const roof = this.isSignalLiftAvailable() && this.signalLift && this.getLiftRoof();
      if (!body || !roof) { actor.liftTransitSurfaceId = null; return null; }
      const decks = [this.signalLift, { id: roof.id, x: roof.x, w: roof.w, y: roof.topY }];
      const foot = body.y + body.height, center = body.x + body.width / 2;
      const attached = decks.find(s => actor.supportedSurfaceId === s.id && Math.abs(foot - s.y) <= 4);
      if (attached) actor.liftTransitSurfaceId = attached.id;
      const deck = decks.find(s => s.id === actor.liftTransitSurfaceId);
      // The carriage travels in front of the facade. Its boarded passengers
      // retain that lane across overlapping ledges and short cabin jumps.
      // Walking out, dropping, falling below the deck or landing elsewhere
      // releases the lane; ordinary awnings remain fully solid to other actors.
      if (!deck || center < deck.x || center > deck.x + deck.w || foot > deck.y + 4 ||
          actor.isDroppingThrough?.(deck.id) || actor.dropSurfaceId === deck.id ||
          actor.supportedSurfaceId && !decks.some(s => s.id === actor.supportedSurfaceId)) {
        actor.liftTransitSurfaceId = null; return null;
      }
      return deck;
    }
    getRoofActorBounds(actor) {
      if (!actor) return null;
      if (actor === this.boss) return { x: actor.x - 85, y: actor.y + 72 - BOSS_TERRAIN_HEIGHT, width: 170, height: BOSS_TERRAIN_HEIGHT };
      const box = actor.getHitbox?.();
      if (!box || !actor.position) return null;
      const foot = actor.position.y + (actor.type === 'drone' ? 57 : 72);
      const top = actor.getCeilingProbe?.().y ?? actor.getStompBox?.().y ?? box.y;
      return { x: box.x, y: top, width: box.width, height: Math.max(1, foot - top) };
    }
    getLiftActorLayer(actor) {
      if (!this.isSignalLiftAvailable() || !this.signalLift) return 'outside';
      const body = this.getRoofActorBounds(actor), roof = this.getLiftRoof();
      if (!body || body.x + body.width <= roof.x || body.x >= roof.x + roof.w) return 'outside';
      // Foot height follows the moving floor, including walk-on and jump/drop
      // transitions. Passengers follow the cabin back and precede its front
      // rails; street actors below a raised cabin precede both cabin layers.
      // Drawing never assigns physical support.
      return body.y + body.height <= this.signalLift.y + 4 ? 'front' : 'behind';
    }
    hasClearedDropSurface(player, id = player.dropSurfaceId) {
      const surface = this.getActorSurfaces().find(s => s.id === id);
      if (!surface) return true;
      const body = this.getRoofActorBounds(player);
      if (!body) return false;
      const bottom = surface.y + (AWNING_DEPTH[surface.id] || BONK_LEDGE_DEPTH[surface.id] || surface.h || 0);
      return body.x + body.width < surface.x - 6 || body.x > surface.x + surface.w + 6 || body.y > bottom + 24;
    }
    captureRoofActor(actor) {
      const box = this.getRoofActorBounds(actor);
      const transit = this.getLiftTransitSurface(actor);
      return box && { box, x: actor.position?.x ?? actor.x, y: actor.position?.y ?? actor.y,
        liftTransitSurfaceId: transit?.id, supportedSurfaceId: actor.supportedSurfaceId };
    }
    moveRoofActor(actor, dx, dy) {
      if (actor === this.boss) { actor.x += dx; actor.y += dy; }
      else { actor.position.x += dx; actor.position.y += dy; }
      if (actor.contactSweep) {
        actor.contactSweep.currentX = actor.position.x;
        actor.contactSweep.currentFootY = actor.position.y + 72;
      }
    }
    isRoofRider(actor, roof = this.getLiftRoof()) {
      const box = this.getRoofActorBounds(actor);
      return !!box && actor.supportedSurfaceId === roof.id &&
        box.x + box.width > roof.x && box.x < roof.x + roof.w && Math.abs(box.y + box.height - roof.topY) <= 4;
    }
    resolveAwningActor(actor, motion) {
      if (!motion || this.isGameplaySuppressed() || actor === this.boss && !this.isBossCombatLive()) return null;
      let result = null;
      // An exit into the side of a solid ledge waits at the cabin boundary.
      // Resolving the facade's entire pre-existing overlap would otherwise
      // teleport a passenger to the far side of the canopy.
      if (motion.liftTransitSurfaceId && !actor.isDroppingThrough?.(motion.liftTransitSurfaceId)) {
        const roof = this.getLiftRoof(), deck = motion.liftTransitSurfaceId === SIGNAL_LIFT.id ? this.signalLift :
          { id: roof.id, x: roof.x, w: roof.w, y: roof.topY };
        const body = this.getRoofActorBounds(actor), center = body.x + body.width / 2;
        const previousCenter = motion.box.x + motion.box.width / 2;
        const edge = center < deck.x ? deck.x : center > deck.x + deck.w ? deck.x + deck.w : null;
        if (edge !== null && previousCenter >= deck.x && previousCenter <= deck.x + deck.w &&
            STAGE_SURFACES.some(s => AWNING_DEPTH[s.id] && s.x < edge && s.x + s.w > edge &&
              body.y < s.y + AWNING_DEPTH[s.id] - .001 && body.y + body.height > s.y + .001)) {
          this.moveRoofActor(actor, edge - center, 0);
          if (actor.velocity) actor.velocity.x = 0;
          actor.liftTransitSurfaceId = deck.id;
          if (motion.supportedSurfaceId === deck.id && Math.abs(body.y + body.height - deck.y) <= .001) {
            actor.supportedSurfaceId = deck.id; actor.grounded = actor.isOnGround = true;
          }
        }
      }
      const transit = this.getLiftTransitSurface(actor);
      for (const surface of STAGE_SURFACES) {
        if (!AWNING_DEPTH[surface.id] || actor === this.player && actor.isDroppingThrough?.(surface.id)) continue;
        if (transit && this.overlapsLiftTransit(surface, transit)) continue;
        const after = this.getRoofActorBounds(actor);
        if (!after) break;
        const slab = { x: surface.x, y: surface.y, width: surface.w, height: AWNING_DEPTH[surface.id] };
        const before = { ...after, x: after.x + motion.x - (actor.position?.x ?? actor.x),
          y: after.y + motion.y - (actor.position?.y ?? actor.y) };
        let hit = sweepSlab(before, after, slab, slab);
        if (!hit) continue;
        if (hit.axis === 'y' && hit.sign > 0) {
          const foot = after.y + after.height, center = after.x + after.width/2;
          const supports = this.getStageSurfaces().concat([{x:0,w:WORLD_WIDTH,y:856}]);
          // A rising cabin floor can press its rider against the fixed canopy.
          // Clear the awning's nearest edge while retaining the moving support.
          if (this.isSignalLiftAvailable()) supports.push(this.signalLift);
          const blocked = supports.some(s =>
            s.id !== surface.id && center+18>s.x && center-18<s.x+s.w && foot<=s.y+4 && slab.y+slab.height+after.height>s.y);
          if (blocked) hit = {axis:'x',sign:center<slab.x+slab.width/2?-1:1};
        }
        result = hit;
        if (hit.axis === 'x') {
          this.moveRoofActor(actor, hit.sign < 0 ? slab.x - after.x - after.width : slab.x + slab.width - after.x, 0);
          if (actor.velocity && actor.velocity.x * hit.sign < 0) actor.velocity.x = 0;
        } else if (hit.sign < 0) {
          this.moveRoofActor(actor, 0, slab.y - after.y - after.height);
          if (actor.velocity) actor.velocity.y = 0;
          actor.grounded = actor.isOnGround = true; actor.supportedSurfaceId = surface.id;
        } else {
          this.moveRoofActor(actor, 0, slab.y + slab.height - after.y);
          if (actor.velocity) actor.velocity.y = Math.max(0, actor.velocity.y);
          actor.grounded = actor.isOnGround = false; actor.supportedSurfaceId = null;
          if (actor === this.player) this.recordHeadContact(actor, surface.id, after.x + after.width / 2, slab.y + slab.height);
        }
        if (actor === this.boss) {
          actor.traversal = null;
          actor.roofFallVelocity = hit.axis === 'y' && hit.sign < 0 ? null : 0;
          if (hit.axis === 'y' && hit.sign < 0) this.setBossCombatPhase('recovery');
        }
      }
      return result;
    }
    resolveLiftActor(actor, motion, previousRoof = null) {
      const awningHit = this.resolveAwningActor(actor, motion);
      if (!motion || !this.isSignalLiftAvailable() || this.isGameplaySuppressed()) return awningHit;
      const roof = this.getLiftRoof(), old = previousRoof || roof, after = this.getRoofActorBounds(actor);
      if (actor === this.player && actor.isDroppingThrough?.(roof.id)) return awningHit;
      if (!after) return null;
      const slab = { x: roof.x, y: roof.topY, width: roof.w, height: roof.y - roof.topY };
      const oldSlab = { x: old.x, y: old.topY, width: old.w, height: old.y - old.topY };
      // Freeze dimensions over this sweep; animation expansion is handled by
      // overlap correction rather than being mistaken for travel through a slab.
      const before = { ...after, x: after.x + motion.x - (actor.position?.x ?? actor.x),
        y: after.y + motion.y - (actor.position?.y ?? actor.y) };
      let hit = sweepSlab(before, after, oldSlab, slab);
      if (!hit) {
        if (actor.supportedSurfaceId === roof.id && !this.isRoofRider(actor, roof)) actor.supportedSurfaceId = null;
        if (actor.headContactSurfaceId === roof.id && (after.y > roof.y + 50 ||
            after.x + after.width <= roof.x || after.x >= roof.x + roof.w)) {
          actor.headContactSurfaceId = null; actor.liftHeadContact = false;
        }
        return awningHit;
      }
      // A returning roof cannot push a passenger through the rooftop they
      // just exited onto. Prefer a clear edge that retains that footing.
      // The carriage floor, separately, owns enemy crushing.
      const foot = after.y + after.height, center = after.x + after.width / 2;
      const blocker = this.getActorSurfaces(actor).filter(s => !s.moving).concat([{ x: 0, w: WORLD_WIDTH, y: 856 }])
        .filter(s => s.id !== actor.dropSurfaceId && center + 18 > s.x && center - 18 < s.x + s.w &&
          foot <= s.y + 4 && roof.y + after.height > s.y)
        .sort((a,b) => a.y-b.y)[0];
      if (hit.axis === 'y' && hit.sign > 0 && blocker) {
        const left = roof.x - after.width / 2, right = roof.x + roof.w + after.width / 2;
        const leftSafe = left + 18 > blocker.x && left - 18 < blocker.x + blocker.w;
        const rightSafe = right + 18 > blocker.x && right - 18 < blocker.x + blocker.w;
        hit = { axis: 'x', sign: leftSafe !== rightSafe ? (leftSafe ? -1 : 1) : center < roof.x + roof.w / 2 ? -1 : 1 };
      }
      if (hit.axis === 'x') {
        const dx = hit.sign < 0 ? slab.x - after.x - after.width : slab.x + slab.width - after.x;
        this.moveRoofActor(actor, dx, 0);
        if (actor.velocity && actor.velocity.x * hit.sign < 0) actor.velocity.x = 0;
      } else if (hit.sign < 0) {
        this.moveRoofActor(actor, 0, slab.y - after.y - after.height);
        if (actor.velocity) actor.velocity.y = 0;
        actor.grounded = true; actor.isOnGround = true; actor.supportedSurfaceId = roof.id;
        if (actor === this.boss) { actor.traversal = null; actor.roofFallVelocity = null; this.setBossCombatPhase('recovery'); }
      } else {
        this.moveRoofActor(actor, 0, roof.y - after.y);
        if (actor.velocity) actor.velocity.y = Math.max(0, actor.velocity.y);
        actor.grounded = false; actor.isOnGround = false; actor.supportedSurfaceId = null;
        if (actor === this.player) this.recordHeadContact(actor, roof.id, after.x + after.width / 2, roof.y);
      }
      if (actor === this.boss && !(hit.axis === 'y' && hit.sign < 0) && actor.traversal) {
        actor.traversal = null; actor.supportedSurfaceId = null; actor.roofFallVelocity = 0;
      }
      return hit;
    }
    recordHeadContact(player, id, x, y) {
      if (player.headContactSurfaceId !== id) {
        this.headContactFx = { id, x, y, ms: 180 };
        window.audioSystem?.playCombatCue?.('land', { strength: 0.35 });
      }
      player.headContactSurfaceId = id;
      player.liftHeadContact = id === 'signal-lift-roof';
      player.jumpReleaseQueued = false; player.coyoteTimerMs = 0;
    }
    getSolidLedges() {
      return this.getStageSurfaces().filter(surface => Object.prototype.hasOwnProperty.call(BONK_LEDGE_DEPTH, surface.id))
        .map(surface => ({ ...surface, bottomY: surface.y + BONK_LEDGE_DEPTH[surface.id] }));
    }
    applyPlayerHeadContact(player) {
      const motion = player?.ceilingMotion, head = player?.getCeilingProbe?.();
      if (!motion?.allowed || !head || this.isGameplaySuppressed()) return false;
      let contact = null;
      for (const surface of this.getSolidLedges()) {
        if (surface.solid) continue; // Full swept awning resolution owns these.
        if (player.isDroppingThrough?.(surface.id) || surface.id === player.dropSurfaceId) continue;
        const bottom = surface.bottomY;
        const before = motion.head.y - bottom, after = head.y - bottom;
        const t = before / (before - after || 1);
        const x = motion.head.x + (head.x - motion.head.x) * Math.max(0, Math.min(1, t));
        const inside = x > surface.x + 6 && x < surface.x + surface.w - 6;
        const crossing = motion.rising && before >= -0.01 && after < 0 && inside;
        const touching = player.headContactSurfaceId === surface.id && head.x > surface.x + 6 &&
          head.x < surface.x + surface.w - 6 && after < 0 && after > -50;
        if ((crossing || touching) && (!contact || t < contact.t)) contact = { surface, bottom, t, x };
      }
      if (contact) {
        player.position.y += contact.bottom - head.y;
        player.velocity.y = Math.max(0, player.velocity.y);
        this.recordHeadContact(player, contact.surface.id, contact.x, contact.bottom);
      } else if (player.headContactSurfaceId && player.headContactSurfaceId !== 'signal-lift-roof') {
        const last = this.getSolidLedges().find(s => s.id === player.headContactSurfaceId);
        if (!last || head.x <= last.x + 6 || head.x >= last.x + last.w - 6 || head.y > last.bottomY + 50) player.headContactSurfaceId = null;
      }
      return !!contact;
    }

    applyLiftHeadContact(player) {
      const hit = this.resolveLiftActor(player, player?.roofMotion || this.captureRoofActor(player));
      return !!hit && hit.axis === 'y' && hit.sign > 0;
    }

    updateLiftPrompt(deltaTime) {
      const lift = this.signalLift, player = this.player || window.player;
      const foot = (player?.position?.y ?? -Infinity) + PLAYER_VISUAL_FOOT_OFFSET;
      const near = this.isSignalLiftAvailable() && !this.isGameplaySuppressed() && player &&
        Math.abs(player.position.x - (lift.x + lift.w / 2)) < lift.w / 2 + 130 && Math.abs(foot - lift.y) < 140;
      if (near) {
        lift.promptAwayMs = 0;
        if (lift.promptArmed) { lift.promptAgeMs = 0; lift.promptArmed = false; lift.promptVisible = true; }
        else lift.promptAgeMs += deltaTime;
        if (lift.promptAgeMs >= 2400) lift.promptVisible = false;
      } else {
        lift.promptVisible = false; lift.promptAwayMs += deltaTime;
        if (lift.promptAwayMs >= 1200) lift.promptArmed = true;
      }
    }

    drawLiftPrompt(ctx) {
      const lift = this.signalLift;
      if (!ctx || !lift?.promptVisible || !this.isSignalLiftAvailable() || this.isGameplaySuppressed() ||
          window.gameState?.gameOver || window.gameState?.victory || window.hackingSystem?.isActive?.()) return;
      if(window.tutorialSystem?.isActive?.()||window.BARCODE?.stageFX?.message||window.loreSystem?.currentLore)return;
      const layout=window.BARCODE.OverlayLayout.present(lift,'prompt',[{width:420,height:62}],{preferred:{x:750,y:255,width:420,height:62,scale:1}});
      ctx.save(); window.BARCODE.OverlayLayout.begin(ctx,layout);
      if(layout.docked){window.BARCODE.OverlayLayout.drawDock(ctx,layout,'RHYTHM LIFT','Power with on-beat hits');ctx.restore();return;}
      ctx.globalAlpha *= Math.max(0, Math.min(1, (2400 - lift.promptAgeMs) / 500));
      ctx.translate(layout.x-750,layout.y-255);
      ctx.fillStyle = 'rgba(7,17,27,0.92)'; ctx.fillRect(750, 255, 420, 62);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#acffe4'; ctx.font = 'bold 20px Oxanium, monospace';
      ctx.fillText('RHYTHM LIFT', 960, 276);
      ctx.fillStyle = '#eeebd8'; ctx.font = '16px Oxanium, monospace';
      ctx.fillText(lift.state === 'moving' ? 'GOING UP' : lift.charges >= 2 ? 'POWERED' : `RHYTHM MODE · ${2 - lift.charges} BEATS TO POWER`, 960, 300);
      ctx.restore();
    }

    drawSignalAmp(ctx) {
      if (!ctx || this.signalAmpCollected) return;
      const fx = window.BARCODE?.combatFX;
      if (fx && !fx.visible(SIGNAL_AMP.x, SIGNAL_AMP.y, 90)) return;
      const time = this.getSceneryAnimationTime(), bob = Math.sin(time / 280) * 7;
      ctx.save();
      ctx.fillStyle = 'rgba(213,127,255,0.16)';
      ctx.beginPath(); ctx.ellipse(SIGNAL_AMP.x, SIGNAL_AMP.y + 40, 36, 6, 0, 0, Math.PI * 2); ctx.fill();
      if (fx) fx.drawAmpIcon(ctx, SIGNAL_AMP.x, SIGNAL_AMP.y + bob);
      else { ctx.strokeStyle = '#efa0ff'; ctx.lineWidth = 3; ctx.strokeRect(SIGNAL_AMP.x - 22, SIGNAL_AMP.y - 22, 44, 44); }
      // A soft orbit gives the pickup a readable identity at gameplay zoom.
      ctx.strokeStyle = '#edb6ff'; ctx.lineWidth = 2;
      const orbit = time / 620;
      ctx.beginPath(); ctx.arc(SIGNAL_AMP.x, SIGNAL_AMP.y + bob, 35, orbit, orbit + Math.PI * 0.7); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#0a1526'; ctx.fillRect(SIGNAL_AMP.x - 65, SIGNAL_AMP.y - 55, 130, 20);
      ctx.fillStyle = '#f4c1ff'; ctx.fillText('SIGNAL AMP', SIGNAL_AMP.x, SIGNAL_AMP.y - 45);
      if (Math.abs((this.player?.position.x ?? Infinity) - SIGNAL_AMP.x) < 230) {
        ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(10,21,38,0.94)';
        ctx.fillRect(SIGNAL_AMP.x - 122, SIGNAL_AMP.y - 98, 244, 37);
        ctx.fillStyle = '#ffffff'; ctx.fillText('TOUCH TO COLLECT', SIGNAL_AMP.x, SIGNAL_AMP.y - 87);
        ctx.fillStyle = '#e9bfff'; ctx.fillText('3 RHYTHM HITS: LONGER REACH', SIGNAL_AMP.x, SIGNAL_AMP.y - 71);
      }
      ctx.restore();
    }
    getGatePresentation() {
      const closed = this.getCurrentGate();
      const time = this.districtSignal.elapsedMs;
      return ENCOUNTER_GATES.flatMap((gate, index) => {
        if (gate === closed) return [{ gate, progress: 0, opening: false }];
        const clearedAt = this.districtSignal.clearedAtMs[index];
        const age = clearedAt === null ? Infinity : Math.max(0, time - clearedAt);
        return age < 650 ? [{ gate, progress: age / 650, opening: true }] : [];
      });
    }
    touchBarrier(gate,y,kind='push') {
      if (!gate) return;
      const now=this.barrierClock||0;
      if ((this.barrierContacts||[]).some(c=>c.id===gate.id&&c.kind===kind&&now-c.start<160)) return;
      (this.barrierContacts||=[]).push({id:gate.id,y,kind,start:now});
      this.barrierContacts=this.barrierContacts.slice(-10);
    }
    updateBarrierContacts(delta) {
      this.barrierClock=(this.barrierClock||0)+Math.max(0,delta);
      this.barrierContacts=(this.barrierContacts||[]).filter(c=>this.barrierClock-c.start<600);
      const gate=this.getCurrentGate();if(!gate)return;
      const player=this.player;
      if(Math.abs(player.position.x-(gate.x-player.width/2))<5 && player.velocity.x>=0)
        this.touchBarrier(gate,player.position.y,'push');
      for(const enemy of window.enemyManager?.enemies||[])if(enemy.active&&Number.isFinite(enemy._barrierPreviousX)&&
        (enemy._barrierPreviousX-gate.x)*(enemy.position.x-gate.x)<=0&&enemy._barrierPreviousX!==enemy.position.x)
        this.touchBarrier(gate,enemy.position.y,'cross');
    }
    isSceneryVisible(ctx, x, y, width, height) {
      const m = ctx.getTransform?.(), canvas = ctx.canvas;
      if (!m || !Number.isFinite(canvas?.width) || !Number.isFinite(m.a)) return true;
      const points = [[x,y],[x+width,y],[x,y+height],[x+width,y+height]];
      const xs = points.map(([px,py]) => m.a*px+m.c*py+m.e);
      const ys = points.map(([px,py]) => m.b*px+m.d*py+m.f);
      return Math.max(...xs) >= -32 && Math.min(...xs) <= canvas.width+32 &&
        Math.max(...ys) >= -32 && Math.min(...ys) <= canvas.height+32;
    }
    getGateGeometry(gate) {
      // One geometry owner for the live field, fallback modules and baked art.
      const groundY = gate.y + gate.h, curbTop = 888, curbBottom = 892, streetBottom = 1096;
      const slope = (gate.curbX - gate.mountX) / (curbTop - gate.baseY);
      const roadX = gate.curbX + slope * (streetBottom - curbBottom);
      const path = [[gate.mountX, gate.baseY, 0], [gate.x + gate.w / 2, groundY, 0],
        [gate.curbX, curbTop, 0], [gate.curbX, curbBottom, curbBottom - curbTop],
        [roadX, streetBottom, curbBottom - curbTop]];
      return { path, roof: gate.roofY, groundY, curbTop, curbBottom, streetBottom };
    }
    getGateHardwareLayout(gate) {
      const { path, roof, streetBottom } = this.getGateGeometry(gate);
      const xs = path.map(point => point[0]);
      const left = Math.floor(Math.min(...xs) - 28), top = roof - 24;
      return { key: 'gateHardware' + gate.id.split('_')[1], left, top,
        width: Math.ceil(Math.max(...xs) + 28 - left), height: streetBottom + 36 - top };
    }
    drawBarrierHardware(ctx, gate, opening, progress) {
      const box = this.getGateHardwareLayout(gate);
      if (!this.isSceneryVisible(ctx,box.left,box.top,box.width,box.height)) return;
      const A = window.BARCODE?.PresentationAssets;
      ctx.save(); ctx.globalAlpha = 1;
      if (A?.ready?.(box.key)) {
        const pose = { x:box.left, y:box.top, width:box.width, height:box.height };
        // Two prebaked states preserve the original powered/off hardware. Only
        // the 650 ms opening needs a second image; no live filters or canvases.
        A.draw(box.key,ctx,{...pose,frame:opening && progress>=1 ? 1 : 0});
        if (opening && progress>0 && progress<1) {
          ctx.save(); ctx.globalAlpha *= progress;
          A.draw(box.key,ctx,{...pose,frame:1}); ctx.restore();
        }
      } else {
        // Bounded original-art fallback while the compact assemblies load.
        ctx.save(); if (opening) ctx.globalAlpha *= 1-progress*.35;
        this.drawBarrierHardwareModules(ctx,gate,opening,progress); ctx.restore();
      }
      // Off is a hardware state, not a stopped drawing. A slower diagnostic
      // tracer remains after clearing without rebuilding the dissolved wall.
      const time = this.getSceneryAnimationTime(), cleared = opening && progress >= 1;
      const { path, roof } = this.getGateGeometry(gate), [mountX, baseY] = path[0];
      const span = baseY - roof, rate = cleared ? 4100 : 1800;
      const phase = ((time / rate + Number(gate.id.split('_')[1]) * 0.17) % 1 + 1) % 1;
      ctx.strokeStyle = cleared ? '#89bbae' : '#dbbcfa'; ctx.lineWidth = cleared ? 2.5 : 3.5;
      const statusY = roof + 12 + phase * Math.max(0, span - 50);
      ctx.beginPath(); ctx.moveTo(mountX, statusY); ctx.lineTo(mountX, statusY + 26); ctx.stroke();
      const groundPhase = ((time / (cleared ? 5300 : 2300) + phase) % 1 + 1) % 1;
      const segment = Math.min(path.length - 2, Math.floor(groundPhase * (path.length - 1)));
      const t = groundPhase * (path.length - 1) - segment;
      const [ax, ay] = path[segment], [bx, by] = path[segment + 1];
      ctx.fillStyle = cleared ? '#add8c9' : '#ead5ff';
      ctx.beginPath(); ctx.arc(ax + (bx - ax) * t, ay + (by - ay) * t, cleared ? 2.5 : 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawBarrierHardwareModules(ctx,gate,opening,progress) {
      const A = window.BARCODE?.PresentationAssets;
      const { path, roof } = this.getGateGeometry(gate);
      const [x, baseY] = path[0];
      ctx.save();
      // Repeat actual narrow modules; do not stretch a small emitter up a facade.
      const tileHeight = 174, count = Math.ceil((baseY - roof) / tileHeight);
      const height = (baseY - roof) / count;
      ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(x + 5, roof, 6, baseY - roof);
      for (let j = 0; j < count; j++) A?.draw('thinWallRail', ctx, { x, y: roof + height*(j+.5), width: 14, height: height+1 });
      A?.draw('thinRailCap', ctx, { x, y: roof+5, width: 14, height: 22 });
      for (let j = 1; j < path.length; j++) {
        const [ax,ay] = path[j-1], [bx,by] = path[j], dx = bx-ax, dy = by-ay, length = Math.hypot(dx,dy);
        const pieces = Math.max(1,Math.ceil(length/188)), span = length/pieces;
        ctx.save(); ctx.translate(ax,ay); ctx.transform(dy/length,-dx/length,dx/length,dy/length,0,0);
        ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(-6,3,16,length);
        for (let k=0;k<pieces;k++) A?.draw('thinPavementRail',ctx,{x:0,y:span*(k+.5),width:14,height:span+1});
        ctx.restore();
      }
      A?.draw('thinRailElbow',ctx,{x,y:baseY-2,width:18,height:24,flip:gate.curbX<x});
      ctx.restore();
    }
    drawEncounterGates(ctx, includeHardware = true) {
      if (!ctx) return;
      const fx = window.BARCODE?.combatFX;
      const time = this.getSceneryAnimationTime();
      const animate = window.BARCODE_RENDER_QUALITY?.flashes !== false;
      for (const { gate, progress, opening } of this.getGatePresentation()) {
        const fade = 1 - progress;
        const height = gate.h * fade * fade;
        const top = gate.y + gate.h - height;
        const { path, curbTop, curbBottom, streetBottom } = this.getGateGeometry(gate);
        const curbDrop = curbBottom - curbTop;
        // Put both luminous edges on the 14-unit rail, including the wall
        // mount and curb drop. Do not retain a second detached slab/pole.
        const footprint = path.map(([x,y,drop]) => [x + gate.w / 2,y,drop]);
        const nearX = footprint[footprint.length - 1][0] - gate.w;
        const crown = footprint.map(([x, y, drop]) => [x, y - (gate.h + drop) * fade * fade]);
        const farX = footprint[0][0], farTop = crown[0][1];
        const xs = footprint.map(point => point[0]);
        const left = Math.min(...xs) - gate.w, right = Math.max(...xs);
        if (fx && !fx.visible((left + right) / 2, (farTop + streetBottom) / 2,
          Math.max(right - left, streetBottom - farTop) / 2 + 60)) continue;
        ctx.save(); ctx.globalAlpha = fade;
        // Authorized enemies part the field locally; clipping leaves the city
        // behind them intact instead of erasing pixels from the whole canvas.
        ctx.save(); ctx.beginPath(); ctx.rect(-2000,-3000,8200,5000);
        for (const contact of this.barrierContacts || []) if (contact.id === gate.id && contact.kind === 'cross') {
          const t = Math.max(0,Math.min(1,(this.barrierClock-contact.start)/600));
          const aperture = Math.sin(t*Math.PI);
          ctx.moveTo(gate.x+gate.w/2+8+aperture*32,contact.y);
          ctx.ellipse(gate.x+gate.w/2,contact.y,8+aperture*32,20+aperture*72,0,0,Math.PI*2);
        }
        ctx.clip('evenodd');
        // One continuous wall face spans the buildings, raised sidewalk,
        // vertical curb and lower road. Its opening sinks into that footprint.
        ctx.fillStyle = opening ? 'rgba(98,255,221,0.05)' : 'rgba(174,66,215,0.065)';
        ctx.beginPath(); crown.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        footprint.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath(); ctx.fill();
        // A narrow top and near end retain the slab's visible thickness.
        ctx.fillStyle = opening ? 'rgba(98,255,221,0.14)' : 'rgba(219,128,246,0.14)';
        ctx.beginPath();
        crown.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        crown.slice().reverse().forEach(([x, y]) => ctx.lineTo(x - gate.w, y));
        ctx.closePath(); ctx.fill();
        const nearTop = crown[crown.length - 1][1];
        ctx.fillRect(nearX, nearTop, gate.w, streetBottom - nearTop);
        ctx.fillStyle = opening ? 'rgba(98,255,221,0.1)' : 'rgba(174,66,215,0.12)';
        ctx.fillRect(gate.x, top, gate.w, height);
        const flicker = animate ? 0.06 * Math.sin(time / 83) * Math.sin(time / 127) : 0;
        ctx.fillStyle = `rgba(${opening ? '137,255,224' : '232,129,255'},${0.38 + flicker})`;
        for (let bar = 0; bar < 3; bar++) {
          const left = gate.x + 2 + bar * 4;
          ctx.fillRect(left, top, bar % 3 ? 1.5 : 3, height);
        }
        ctx.fillStyle = '#a6ffe8'; ctx.fillRect(gate.x - 1, top, 2, height); ctx.fillRect(gate.x + gate.w - 1, top, 2, height);
        ctx.strokeStyle = opening ? '#c9fff1' : '#eda6ff';
        ctx.lineWidth = 3;
        for (const edge of [crown, footprint]) {
          ctx.beginPath(); edge.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
          const end = edge[edge.length - 1]; ctx.lineTo(end[0] - gate.w, end[1]); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(nearX, nearTop); ctx.lineTo(nearX, streetBottom); ctx.stroke();
        // The second ground rail and lit curb face make the raised paving read.
        ctx.beginPath(); footprint.forEach(([x, y], i) => i ? ctx.lineTo(x - gate.w, y) : ctx.moveTo(x - gate.w, y)); ctx.stroke();
        ctx.fillStyle = opening ? 'rgba(137,255,224,0.22)' : 'rgba(232,129,255,0.22)';
        ctx.fillRect(footprint[2][0] - gate.w, curbTop, gate.w, curbDrop);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(farX, footprint[0][1]); ctx.lineTo(farX, farTop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(nearX + gate.w, nearTop); ctx.lineTo(nearX + gate.w, streetBottom); ctx.stroke();
        for (let lane = 1; lane < 5; lane++) {
          const laneT = lane / 5;
          ctx.beginPath();
          footprint.forEach(([x, y], i) => {
            const laneY = crown[i][1] + (y - crown[i][1]) * laneT;
            if (i) ctx.lineTo(x, laneY); else ctx.moveTo(x, laneY);
          });
          ctx.stroke();
        }
        ctx.fillStyle = opening ? '#c9fff1' : '#eda6ff';
        const scanY = top + (animate ? (time / 850) % 1 : 0.5) * Math.max(0, height - 3);
        ctx.fillRect(gate.x - 3, scanY, gate.w + 6, 3);
        if (opening) {
          // Dissolve the barcode outward as its field contracts to the base.
          for (let i = 0; i < 10; i++) {
            const side = i % 2 ? 1 : -1;
            ctx.fillRect(gate.x + gate.w / 2 + side * progress * (20 + i * 4), top - progress * (i % 3) * 18, i % 3 ? 2 : 4, 9 * fade);
          }
        }
        ctx.restore();
        ctx.save();
        ctx.beginPath();crown.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
        footprint.slice().reverse().forEach(([x,y])=>ctx.lineTo(x,y));ctx.closePath();ctx.clip();
        for(const c of this.barrierContacts||[])if(c.id===gate.id){
          const t=(this.barrierClock-c.start)/600;
          ctx.globalAlpha=fade*(1-t)*0.75;ctx.strokeStyle=c.kind==='cross'?'#bdffd4':'#e3b9ff';ctx.lineWidth=2;
          ctx.beginPath();ctx.ellipse(gate.x+gate.w/2,c.y,18+t*75,30+t*85,0,0,Math.PI*2);ctx.stroke();
          if (c.kind === 'push') for (let strand=-1;strand<=1;strand++) {
            const x=gate.x+gate.w/2+strand*12;
            ctx.beginPath();ctx.moveTo(x,c.y-68);
            ctx.quadraticCurveTo(x+Math.sin(t*Math.PI)*30,c.y,x,c.y+68);ctx.stroke();
          }
        }
        ctx.restore();
        if (includeHardware) this.drawBarrierHardware(ctx,gate,opening,progress);
        ctx.restore();
      }
      if (includeHardware) ENCOUNTER_GATES.forEach((g,i)=>{if(this.districtSignal.clearedAtMs[i]!==null && this.districtSignal.elapsedMs-this.districtSignal.clearedAtMs[i]>=650)this.drawBarrierHardware(ctx,g,true,1);});
    }
    updateSkyCaches(delta) {
      if (!this.missionStarted || this.isGameplaySuppressed() || window.tutorialSystem?.isActive?.()) return;
      const player = this.player;
      if (!player?.grounded) return;
      this.skyCaches ||= new Set();
      for (const cache of SKY_CACHES) {
        if (this.skyCaches.has(cache.id) || player.supportedSurfaceId !== cache.surfaceId || Math.abs(player.position.x - cache.x) > 55) continue;
        this.skyCaches.add(cache.id);
        const all = this.skyCaches.size === SKY_CACHES.length;
        const reward = all ? 1000 : 250;
        if (window.gameState) {
          window.gameState.score = (window.gameState.score || 0) + reward;
          window.gameState.collectionMessage = { text: `SKY CACHE ${this.skyCaches.size}/3 · +${reward}${all ? ' · SIGNAL AMPLIFIED' : ''}`, timer: 180, alpha: 1 };
        }
        window.BARCODE.signalAmpCharges = Math.min(3, (window.BARCODE.signalAmpCharges || 0) + 1);
        window.BARCODE?.combatFX?.ampChanged?.('collect', window.BARCODE.signalAmpCharges, player);
        window.BARCODE?.combatFX?.add?.({ kind: 'pulse', x: cache.x, y: player.position.y + 42, radius: all ? 200 : 100, duration: 600, color: '#bafa90' });
        window.audioSystem?.playCombatCue?.('inspect');
      }
    }
    drawSkyCaches(ctx) {
      if (!this.missionStarted) return;
      const time = this.getSceneryAnimationTime();
      for (const cache of SKY_CACHES) {
        const surface = STAGE_SURFACES.find(s => s.id === cache.surfaceId);
        const y = surface.y, collected = this.skyCaches?.has(cache.id);
        if (window.BARCODE?.combatFX && !window.BARCODE.combatFX.visible(cache.x, y, 110)) continue;
        ctx.save(); ctx.translate(cache.x, y);
        // Small roof-mounted receiver; the same authored industrial vocabulary
        // as the lift, with an elevated charge glyph instead of another box.
        ctx.fillStyle = '#14242e'; ctx.strokeStyle = collected ? '#507567' : '#94baa4'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-28, -2); ctx.lineTo(-19, -12); ctx.lineTo(19, -12); ctx.lineTo(28, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -44); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -42, 16, 0.12, Math.PI - 0.12); ctx.stroke();
        if (!collected) {
          const bob = Math.sin(time / 350 + cache.x / 120) * 7;
          window.BARCODE?.combatFX?.drawAmpIcon?.(ctx, 0, -76 + bob);
          ctx.strokeStyle = 'rgba(190,245,156,0.32)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, -76 + bob, 31 + Math.sin(time / 500) * 5, 0, Math.PI * 2); ctx.stroke();
        }
        // The collected receiver continues relaying, at a quieter cadence.
        const signal = time / (collected ? 760 : 410) + cache.x / 210;
        ctx.strokeStyle = collected ? '#8dbca6' : '#d4fbb8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -42, 21, 0.22 + Math.sin(signal) * 0.22, Math.PI - 0.22 + Math.sin(signal) * 0.22); ctx.stroke();
        ctx.fillStyle = collected ? '#8fbc9e' : '#c3ff99';
        ctx.fillRect(-3, -18 - ((time / (collected ? 2700 : 1200)) % 1) * 20, 6, 4);
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i < (this.skyCaches?.size || 0) ? '#beff92' : '#344c48'; ctx.fillRect(-11 + i * 9, -8, 5, 3); }
        ctx.restore();
      }
    }
    updateSignalAmp() {
      const player = this.player || window.player;
      if (!player || this.signalAmpCollected || this.isGameplaySuppressed() || window.tutorialSystem?.isActive?.()) return;
      const box = player.getHitbox?.();
      // The Amp floats above the relay roof. Test the visible body, while
      // preserving roof access: it cannot be collected through the underside.
      if (!box || player.position.y + PLAYER_VISUAL_FOOT_OFFSET > 202) return;
      const x = Math.max(box.x, Math.min(SIGNAL_AMP.x, box.x + box.width));
      const y = Math.max(box.y, Math.min(SIGNAL_AMP.y, box.y + box.height));
      if (Math.hypot(x - SIGNAL_AMP.x, y - SIGNAL_AMP.y) <= SIGNAL_AMP.radius) this.giveSignalAmp();
    }

    resetRepairs() {
      this.repairs = REPAIRS.map(r => ({ ...r, collected: false }));
      this.repairTimeMs = 0; this.repairFeedback = null;
    }
    dropCarrierRepair(enemy) {
      if (!this.missionStarted || !enemy?._repairCarrier || enemy._repairDropped || enemy._purgedByCinematic || enemy.active || !(enemy.health <= 0)) return false;
      enemy._repairDropped = true;
      if (this.repairs.some(r => r.id === 'repair.cache-carrier')) return false;
      this.repairs.push({ id: 'repair.cache-carrier', x: Math.max(80, Math.min(WORLD_WIDTH - 80, enemy.position.x)),
        y: GROUND_Y + PLAYER_VISUAL_FOOT_OFFSET - 42, surfaceY: GROUND_Y + PLAYER_VISUAL_FOOT_OFFSET, collected: false });
      return true;
    }
    updateRepairs(ms) {
      if (!this.missionStarted || this.isGameplaySuppressed() || window.tutorialSystem?.isActive?.() || this.isBossCombatLive?.()) return;
      this.repairTimeMs += ms;
      if (this.repairFeedback) {
        this.repairFeedback.age += ms;
        if (this.repairFeedback.age >= 900) this.repairFeedback = null;
      }
      const player = this.player || window.player, box = player?.getHitbox?.();
      if (!box || player.health <= 0 || player.health >= player.maxHealth || window.hackingSystem?.isActive?.()) return;
      for (const cell of this.repairs) {
        if (cell.collected || player.position.y + PLAYER_VISUAL_FOOT_OFFSET > cell.surfaceY + 12) continue;
        const x = Math.max(box.x, Math.min(cell.x, box.x + box.width));
        const y = Math.max(box.y, Math.min(cell.y, box.y + box.height));
        if (Math.hypot(x - cell.x, y - cell.y) > 24) continue;
        const oldHealth = player.health;
        try { player.restoreHealth(1); } catch (error) { console.warn('Repair feedback unavailable', error); }
        // Commit the pickup according to the actual health transaction even
        // if an optional sound/particle callback fails after health changes.
        if (player.health > oldHealth) {
          cell.collected = true;
          this.repairFeedback = { x: cell.x, y: cell.y, age: 0 };
          if (player.health >= player.maxHealth) break;
        }
      }
    }
    // The permanent terminal belongs behind street actors and the fields.
    // Upper-route supports retain their later pass alongside the lift/rewards.
    drawPlatformHardware(ctx, prop) {
      const mount = PLATFORM_MOUNTS[prop.id];
      if (!mount) return false;
      if (Number.isFinite(mount.hangY)) {
        // Narrow tension straps fasten to the roof beam, never to window glass.
        for (const x of [prop.x + 27, prop.x + prop.w - 25]) {
          ctx.fillStyle = '#131d28'; ctx.fillRect(x-4, mount.hangY, 8, prop.y + 55 - mount.hangY);
          ctx.fillStyle = '#70878b'; ctx.fillRect(x-2, mount.hangY+3, 2, prop.y + 49 - mount.hangY);
          ctx.fillStyle = '#374954'; ctx.fillRect(x-9, mount.hangY-5, 18, 18);
          ctx.fillStyle = '#c0ccc0'; ctx.fillRect(x-3, mount.hangY+1, 5, 5);
        }
      }
      const span = mount.span || 410/512, width = prop.w/span;
      const x = prop.x-(mount.anchorX ?? 22/512)*width;
      const y = prop.y-(mount.anchorY ?? 182/512)*width;
      const illustrated = window.BARCODE?.PresentationAssets?.draw(mount.asset || 'platformFacades', ctx,
          { x, y, width, height: width, frame: mount.frame || 0 });
      if (illustrated) {
        const time = this.getSceneryAnimationTime(), variant = mount.frame || 0;
        const t = (time / (mount.asset ? 2800 : variant === 1 ? 1900 : 3400) + prop.x / 700) % 1;
        // These are construction variants, never animation frames. Animate
        // their front ventilation/lamp details instead of morphing the deck.
        const row = mount.asset === 'platformSideRight' ? 230 : mount.asset === 'platformSideLeft' ? 207 : 219;
        const lightX = mount.asset === 'platformSideRight' ? 56 : !mount.asset && variant === 1 ? 374 : 112;
        const lightSpan = mount.asset === 'platformSideRight' || !mount.asset && variant === 1 ? 30 : 245;
        const amber = variant === 1 || mount.asset === 'platformSideRight';
        const lightHeight = amber ? 24 : 10;
        ctx.save(); ctx.beginPath(); ctx.rect(x + lightX / 512 * width, y + (row - lightHeight / 2) / 512 * width,
          lightSpan / 512 * width, lightHeight / 512 * width); ctx.clip();
        ctx.fillStyle = amber ? '#ffd99b' : '#b2f4e4';
        if (amber) {
          // The small painted lamp needs its complete window to breathe;
          // a two-pixel scanner alone disappears at normal gameplay zoom.
          ctx.save(); ctx.globalAlpha *= 0.15 + (0.5 + 0.5 * Math.sin(time / 300 + prop.x / 240)) * 0.6;
          ctx.fillRect(x + lightX / 512 * width, y + (row - lightHeight / 2) / 512 * width,
            lightSpan / 512 * width, lightHeight / 512 * width); ctx.restore();
        }
        const scanWidth = Math.max(5, width * 0.065);
        ctx.fillRect(x + (lightX + t * lightSpan) / 512 * width - scanWidth,
          y + (row - 3) / 512 * width, scanWidth, Math.max(2.5, 6 / 512 * width));
        ctx.restore(); return true;
      }
      // Credible lightweight fallback if the shared raster is unavailable.
      ctx.fillStyle = '#3d535d'; ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
      ctx.strokeStyle = '#9aadaa'; ctx.lineWidth = 3;
      const side = mount.asset === 'platformSideRight' ? prop.x + prop.w + 10 : prop.x - 16;
      if (mount.asset) {
        ctx.fillStyle='#293b49';ctx.fillRect(side-5,prop.y-10,10,88);
        ctx.beginPath();ctx.moveTo(side,prop.y+72);ctx.lineTo(mount.asset==='platformSideRight'?prop.x+8:prop.x+prop.w-8,prop.y+prop.h);ctx.stroke();
      } else for(const x of [prop.x+22,prop.x+prop.w-22]) {
        ctx.fillStyle='#293b49';ctx.fillRect(x-6,prop.y+20,12,40);
        ctx.beginPath();ctx.moveTo(x,prop.y+55);ctx.lineTo(x-10,prop.y+prop.h);ctx.stroke();
      }
      const time = this.getSceneryAnimationTime();
      ctx.fillStyle = '#a2e5d2';
      ctx.fillRect(prop.x + 12 + ((time / 3100 + prop.x / 700) % 1) * (prop.w - 30), prop.y + 6, 8, 3);
      return true;
    }
    drawTraversalProps(ctx, behindActors = true) {
      if (behindActors) this.drawSignalLift(ctx, 'drive');
      if (!ctx) return;
      ctx.save(); ctx.shadowBlur = 0;
      for (const prop of TRAVERSAL_PROPS) {
        if (!!prop.alwaysPresent !== behindActors) continue;
        if (!this.missionStarted && !prop.alwaysPresent) continue;
        if (!this.isSceneryVisible(ctx,prop.x-56,prop.y-240,prop.w+124,prop.h+420)) continue;
        if (!prop.asset && this.drawPlatformHardware(ctx, prop)) continue;
        if (prop.asset) {
          ctx.fillStyle='rgba(0,0,0,0.30)';
          ctx.beginPath(); ctx.ellipse(prop.x+98,prop.y+prop.h-2,96,12,0,0,Math.PI*2); ctx.fill();
          // Authored front lip and feet register to the same old 160x206
          // collider; the shallow top/right side follow the sidewalk angle.
          const height=206*1054/959;
          if (window.BARCODE?.PresentationAssets?.draw(prop.asset,ctx,{
            x:prop.x,y:prop.y-height*88/1054,width:194,height
          })) {
            this.drawTerminalScreen(ctx, prop, height);
            continue;
          }
        }
        const depth=prop.h>30?34:22, rise=prop.h>30?16:10;
        ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.moveTo(prop.x,prop.y+prop.h);ctx.lineTo(prop.x+prop.w+depth,prop.y+prop.h-rise);ctx.lineTo(prop.x+prop.w+depth+15,prop.y+prop.h+7);ctx.lineTo(prop.x+8,prop.y+prop.h+15);ctx.closePath();ctx.fill();
        ctx.fillStyle='#405057';ctx.strokeStyle='#151e27';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(prop.x,prop.y);ctx.lineTo(prop.x+depth,prop.y-rise);ctx.lineTo(prop.x+prop.w+depth,prop.y-rise);ctx.lineTo(prop.x+prop.w,prop.y);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#18232d';ctx.beginPath();ctx.moveTo(prop.x+prop.w,prop.y);ctx.lineTo(prop.x+prop.w+depth,prop.y-rise);ctx.lineTo(prop.x+prop.w+depth,prop.y+prop.h-rise);ctx.lineTo(prop.x+prop.w,prop.y+prop.h);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(prop.x + 8, prop.y + 12, prop.w + 5, prop.h);
        ctx.fillStyle = '#0b1017'; ctx.fillRect(prop.x - 3, prop.y, prop.w + 6, prop.h);
        ctx.fillStyle = '#334046'; ctx.fillRect(prop.x + 4, prop.y + 6, prop.w - 8, prop.h - 6);
        ctx.fillStyle = '#172129'; ctx.fillRect(prop.x + prop.w - 12, prop.y + 5, 12, prop.h - 5);
        ctx.fillStyle = '#58686b'; ctx.fillRect(prop.x + 4, prop.y + 5, 4, prop.h - 9);
        ctx.strokeStyle = '#82938e'; ctx.lineWidth = 2; ctx.strokeRect(prop.x, prop.y, prop.w, prop.h);
        ctx.strokeStyle = 'rgba(188,214,202,.30)';
        ctx.lineWidth = 1 / (window.renderer?.getZoomLevel?.() || window.renderer?.zoomLevel || 1);
        ctx.beginPath(); ctx.moveTo(prop.x,prop.y); ctx.lineTo(prop.x+prop.w,prop.y); ctx.stroke();
        if (prop.h > 30) {
          ctx.fillStyle = '#172129';
          for (let y = prop.y + 24; y < prop.y + prop.h - 12; y += 18) ctx.fillRect(prop.x + 16, y, prop.w - 32, 7);
          ctx.fillStyle = '#82938e';
          for (const x of [prop.x + 8, prop.x + prop.w - 8]) for (const y of [prop.y + 15, prop.y + prop.h - 10]) ctx.fillRect(x - 2, y - 2, 4, 4);
        }
        // The terminal's bounded painted fallback keeps the same active glass.
        if (prop.asset) this.drawTerminalScreen(ctx, prop, 206 * 1054 / 959);
      }
      ctx.restore();
    }
    drawTerminalScreen(ctx, prop, height) {
      // A readable continuous trace stays inside the original glass. The
      // shared clock freezes with pause; no timer, jitter or second raster.
      const time = this.getSceneryAnimationTime();
      const x = prop.x + 194 * 0.235, y = prop.y - height * 88 / 1054 + height * 0.238;
      const w = 194 * 0.328, h = height * 0.224;
      ctx.save(); ctx.beginPath();
      ctx.moveTo(x + 4, y); ctx.lineTo(x + w - 4, y); ctx.lineTo(x + w, y + 4);
      ctx.lineTo(x + w, y + h - 4); ctx.lineTo(x + w - 4, y + h);
      ctx.lineTo(x + 4, y + h); ctx.lineTo(x, y + h - 4); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.clip();
      ctx.fillStyle = 'rgba(8,33,30,0.48)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#b2f8bc'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const px = x + i / 30 * w;
        const envelope = 0.2 + 0.8 * Math.sin(i / 30 * Math.PI);
        const wave = Math.sin(i * 0.71 - time / 170) * Math.sin(i * 0.22 + time / 480);
        const py = y + h * 0.42 + wave * h * 0.26 * envelope;
        ctx[i ? 'lineTo' : 'moveTo'](px, py);
      }
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const level = 3 + (1 + Math.sin(time / 280 + i * 1.4)) * h * 0.09;
        ctx.fillStyle = i % 3 ? '#8bdcad' : '#d0ffc9';
        ctx.fillRect(x + 4 + i * (w - 8) / 8, y + h - 4 - level, 3, level);
      }
      ctx.fillStyle = 'rgba(195,255,200,0.36)';
      ctx.fillRect(x + ((time / 2100) % 1) * w, y + 2, 2, h - 4);
      ctx.restore();
    }
    drawRepairRoute(ctx) {
      if (!ctx || !this.missionStarted) return;
      this.drawTraversalProps(ctx, false);
      ctx.save(); ctx.shadowBlur = 0;
      if (!this.isBossCinematicActive() && !this.isBossCombatLive?.() && this.state !== STATES.LEVEL_COMPLETE) {
        for (const cell of this.repairs) {
          if (cell.collected) continue;
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cell.x - 20, cell.surfaceY - 2, 40, 4);
          const prefs = window.BARCODE?.Preferences?.values || {};
          const quiet = prefs.reducedMotion || prefs.flashes === false || window.BARCODE_RENDER_QUALITY?.flashes === false;
          const time = quiet ? 0 : this.repairTimeMs;
          const bob = Math.sin(time / 480 + cell.x) * 8;
          const beat = Math.pow(Math.max(0, Math.sin(time / 180 + cell.x)), 5);
          drawRepairCell(ctx, cell.x, cell.y + bob, 1 + beat * 0.10);
          ctx.strokeStyle = '#d2fda6'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cell.x, cell.y + bob, 36 + beat * 7, -0.25, Math.PI * 0.75); ctx.stroke();
        }
      }
      if (this.repairFeedback) {
        const f = this.repairFeedback, t = f.age / 900;
        ctx.globalAlpha = 1 - t; ctx.fillStyle = '#c0ed55'; ctx.font = 'bold 23px Oxanium, monospace'; ctx.textAlign = 'center';
        drawRepairCell(ctx,f.x,f.y-t*20,0.65*(1-t));
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.fillRect(f.x + Math.cos(a) * t * 66, f.y + Math.sin(a) * t * 46, 3, 9); }
      }
      ctx.restore();
    }
    giveSignalAmp() {
      this.signalAmpCollected = true;
      window.BARCODE = window.BARCODE || {};
      window.BARCODE.signalAmpCharges = SIGNAL_AMP.charges;
      window.BARCODE.combatFX?.ampChanged('pickup', SIGNAL_AMP.charges, this.player || window.player);
      if (window.audioSystem?.playCombatCue) window.audioSystem.playCombatCue('pickup');
      else window.audioSystem?.playSound?.('rhythmSuccess', 0.35);
      return { ok:true, charges: window.BARCODE.signalAmpCharges };
    }
    isSignalLiftAvailable() { return !!(this.missionStarted && this.state !== STATES.TUTORIAL); }
    isPlayerSupportedByLift(player = this.player || window.player) {
      if (!this.isSignalLiftAvailable() || !player || !this.signalLift || !player.grounded) return false;
      // At the upper stop the landing solver assigns the shared roof. A rider
      // still inside the cabin can recharge it there, including at that seam.
      if (player.supportedSurfaceId !== SIGNAL_LIFT.id &&
          !(player.supportedSurfaceId === SIGNAL_LIFT.destinationSurfaceId && this.signalLift.y === SIGNAL_LIFT.topY)) return false;
      const footY = player.position.y + PLAYER_VISUAL_FOOT_OFFSET;
      const footHalfWidth = 18;
      return player.position.x + footHalfWidth > this.signalLift.x &&
        player.position.x - footHalfWidth < this.signalLift.x + this.signalLift.w &&
        Math.abs(footY - this.signalLift.y) <= 4;
    }
    updateSignalLift(deltaTime = 0) {
      if (window.isPaused || window.gameState?.paused) return;
      if (!this.signalLift) this.resetSignalLift();
      const lift = this.signalLift;
      if (this.headContactFx) this.headContactFx.ms = Math.max(0, this.headContactFx.ms - deltaTime);
      lift.chargeFxMs = Math.max(0, (lift.chargeFxMs || 0) - deltaTime);
      lift.prevY = lift.y;
      const player = this.player || window.player;
      if (!this.isSignalLiftAvailable() || this.isGameplaySuppressed()) return;
      this.liftSquashes = (this.liftSquashes || []).filter(squash => (squash.ageMs += deltaTime) < 3200);
      if (lift.chargeFxMs > 0 || ['charged', 'moving', 'returning'].includes(lift.state)) {
        lift.driveTimeMs = (lift.driveTimeMs || 0) + deltaTime * (lift.state === 'returning' ? -1 : 1);
      }
      const roof = this.getLiftRoof();
      const actors = [player, ...(window.enemyManager?.enemies || []).filter(e => e.active),
        ...(this.boss?.active ? [this.boss] : [])].filter(Boolean);
      const riders = actors.map(actor => {
        const motion = this.captureRoofActor(actor), box = motion?.box;
        const floor = actor.supportedSurfaceId === lift.id && box &&
          box.x + box.width > lift.x && box.x < lift.x + lift.w && Math.abs(box.y + box.height - lift.y) <= 4;
        const onRoof = this.isRoofRider(actor, roof);
        if ([lift.id, roof.id].includes(actor.supportedSurfaceId) && !floor && !onRoof) actor.supportedSurfaceId = null;
        return { actor, motion, supported: floor || onRoof };
      });
      if (lift.state === 'charged') lift.state = 'moving';
      let returnMs = lift.state === 'returning' ? deltaTime : 0;
      if (lift.state !== 'returning' && (lift.charges > 0 || lift.y < SIGNAL_LIFT.bottomY)) {
        const poweredMs = Math.min(deltaTime, Math.max(0, lift.returnTimerMs));
        lift.returnTimerMs = Math.max(0, lift.returnTimerMs - deltaTime);
        if (lift.state === 'moving') lift.y = Math.max(SIGNAL_LIFT.topY, lift.y - SIGNAL_LIFT.speed * poweredMs / 1000);
        if (lift.returnTimerMs <= 0.000001) {
          lift.returnTimerMs = 0;
          if (lift.y < SIGNAL_LIFT.bottomY) { lift.state = 'returning'; returnMs = deltaTime - poweredMs; }
          else { lift.state = 'dormant'; lift.charges = 0; }
        }
      }
      if (lift.state === 'returning') lift.y = Math.min(SIGNAL_LIFT.bottomY, lift.y + SIGNAL_LIFT.speed * returnMs / 1000);
      if (lift.state === 'moving' && lift.y <= SIGNAL_LIFT.topY) lift.state = 'dormant';
      if (lift.state === 'returning' && lift.y >= SIGNAL_LIFT.bottomY) { lift.state = 'dormant'; lift.charges = 0; }
      const dy = lift.y - lift.prevY;
      this.crushLiftEnemies(lift.prevY, lift.y, riders);
      for (const { actor, motion, supported } of riders) {
        if (actor !== player && actor.active === false) continue;
        if (supported && dy) this.moveRoofActor(actor, 0, dy);
        this.resolveLiftActor(actor, motion, roof);
      }
      this.updateLiftPrompt(deltaTime);
    }
    resetSignalLift() {
      this.signalLift = { ...SIGNAL_LIFT, y: SIGNAL_LIFT.bottomY, prevY: SIGNAL_LIFT.bottomY, state: 'dormant', charges: 0, chargeFxMs: 0, driveTimeMs: 0, returnTimerMs: SIGNAL_LIFT.returnDelayMs,
        promptArmed: true, promptVisible: false, promptAgeMs: 0, promptAwayMs: 0 };
      const player = this.player || window.player;
      this.headContactFx = null;
      this.liftSquashes = [];
      if (player) { player.headContactSurfaceId = null; player.liftHeadContact = false; player.ceilingMotion = null; player.roofMotion = null; }
      for (const actor of [player, ...(window.enemyManager?.enemies || []), this.boss].filter(Boolean)) {
        if ([SIGNAL_LIFT.id, 'signal-lift-roof'].includes(actor.supportedSurfaceId)) actor.supportedSurfaceId = null;
        actor.liftTransitSurfaceId = null;
      }
    }
    chargeSignalLift() {
      if (!this.signalLift) this.resetSignalLift();
      if (!this.isSignalLiftAvailable()) return { ok: false, reason: 'unavailable' };
      const player = this.player || window.player;
      if (!this.isPlayerSupportedByLift(player)) return { ok: false, reason: 'not-supported' };
      this.signalLift.chargeFxMs = 520;
      this.signalLift.returnTimerMs = SIGNAL_LIFT.returnDelayMs;
      this.signalLift.charges = Math.min(SIGNAL_LIFT.requiredCharges, this.signalLift.charges + 1);
      this.signalLift.state = this.signalLift.charges >= SIGNAL_LIFT.requiredCharges ? 'charged' : 'charging';
      return { ok: true, charges: this.signalLift.charges, state: this.signalLift.state };
    }
    getBossPresentationKey() { if (this.boss?.state === 'idle' || this.boss?.activeAnimation === 'sector_1_boss_idle_idle') return 'idle'; if (this.boss?.state === 'flourish' || this.boss?.activeAnimation === 'sector_1_boss_attack_attack') return 'flourish'; return 'walk'; }
    getBossRuntimeAnchorMetrics(frame, flipH = true) {
      const spriteSheet = this.boss?.sprite?.currentSprite || this.boss?.sprite?._currentSprite || null;
      const runtimeAnchor = spriteSheet?.getAnchorPoint?.();
      const hasAnchorX = Number.isFinite(runtimeAnchor?.x);
      const hasAnchorY = Number.isFinite(runtimeAnchor?.y);
      const sourceAnchorX = hasAnchorX ? runtimeAnchor.x : frame.anchorX;
      const sourceAnchorY = hasAnchorY ? runtimeAnchor.y : frame.anchorY;
      const usesScaledAnchor = !spriteSheet || ((hasAnchorX || hasAnchorY) &&
        (typeof spriteSheet.hasManifestAnchor === 'function' ? !!spriteSheet.hasManifestAnchor() : !!spriteSheet.manifestMetadata?.anchor));
      const reportedScale = spriteSheet?.getManifestScale?.() ?? spriteSheet?.manifestMetadata?.scale;
      const manifestScale = Number.isFinite(reportedScale) && reportedScale > 0 ? reportedScale : 1;
      const frameScale = BOSS_PRESENTATION.targetBodyHeight / frame.bodyHeight * (frame.visualScale || 1);
      // The sheet scale is already multiplied inside Makko: cancel it here.
      const drawScale = frameScale / manifestScale;
      const anchorMultiplier = usesScaledAnchor ? frameScale : 1;
      const anchorOffsetX = hasAnchorX || !spriteSheet ? sourceAnchorX * anchorMultiplier : 0;
      const anchorOffsetY = hasAnchorY || !spriteSheet ? sourceAnchorY * anchorMultiplier : 0;
      return { sourceAnchorX, sourceAnchorY, usesScaledAnchor, manifestScale, frameScale,
        drawScale, anchorOffsetX, anchorOffsetY, flipSignX: flipH ? -1 : 1 };
    }
    getBossVisualBounds(options = {}) {
      if (!this.boss) return null;
      const frame = BOSS_PRESENTATION[this.getBossPresentationKey()];
      const rawFrame = Number.isFinite(this.boss.animationRef?.currentFrame) ? this.boss.animationRef.currentFrame : 0;
      const frameIndex = Math.max(0, Math.trunc(rawFrame)) % frame.footRows.length;
      const footRow = frame.footRows[frameIndex];
      const targetFootY = this.boss.y + PLAYER_VISUAL_FOOT_OFFSET;
      const flipH = options.flipH ?? (this.boss.facing === undefined || this.boss.facing < 0);
      const metrics = this.getBossRuntimeAnchorMetrics(frame, flipH);
      // Invert both Makko anchor paths, including their mirrored X offset.
      const anchorX = this.boss.x + metrics.flipSignX * (metrics.anchorOffsetX - frame.anchorX * metrics.frameScale);
      const anchorY = targetFootY + metrics.anchorOffsetY - footRow * metrics.frameScale;
      return { x: this.boss.x - (flipH ? frame.width - frame.anchorX : frame.anchorX) * metrics.frameScale,
        y: targetFootY - footRow * metrics.frameScale,
        width: frame.width * metrics.frameScale, height: frame.height * metrics.frameScale,
        scale: metrics.drawScale, frameScale: metrics.frameScale, manifestScale: metrics.manifestScale,
        usesScaledAnchor: metrics.usesScaledAnchor, sourceAnchorX: metrics.sourceAnchorX, sourceAnchorY: metrics.sourceAnchorY,
        anchorX, anchorY, frameIndex, footRow, targetFootY,
        visibleFootY: anchorY - metrics.anchorOffsetY + footRow * metrics.frameScale };
    }
    drawBossPulse(ctx, pulse, direction, ground) {
      const center = pulse.originX + direction * pulse.radius;
      const age = pulse.radius / BOSS_COMBAT.pulseSpeed * 1000;
      const flicker = Math.sin(age / 110);
      const width = 104, height = 76;
      const artCenter = center - direction * (width - BOSS_COMBAT.pulseWidth) / 2;
      ctx.save();
      ctx.globalAlpha = pulse.hit ? 0.38 : 1;
      // Larger flame and wake trail behind the unchanged swept leading edge.
      ctx.save(); ctx.translate(artCenter - direction * 14, ground - 27); ctx.scale(1.55, 1);
      const glow = ctx.createRadialGradient?.(0, 0, 4, 0, 0, 52 + flicker * 3);
      if (glow?.addColorStop) {
        glow.addColorStop(0, 'rgba(255,163,51,0.35)');
        glow.addColorStop(0.4, 'rgba(255,82,22,0.15)');
        glow.addColorStop(1, 'rgba(255,45,18,0)');
        ctx.fillStyle = glow; ctx.fillRect(-56, -56, 112, 112);
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,153,45,0.10)';
      ctx.beginPath(); ctx.ellipse(artCenter, ground - 4, 58, 7, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const y = ground - 12 - i * 17;
        const tail = 86 + i * 12 + Math.sin(age / 130 + i) * 9;
        ctx.strokeStyle = i === 1 ? 'rgba(255,207,105,0.64)' : 'rgba(255,100,38,0.45)';
        ctx.lineWidth = 3 - i * 0.7;
        ctx.beginPath(); ctx.moveTo(center - direction * 18, y);
        ctx.quadraticCurveTo(center - direction * 52, y - flicker * 5, center - direction * tail, y + 6); ctx.stroke();
      }
      const phase = Math.floor(age / 75) % 6, frame = phase < 4 ? phase : 6 - phase;
      const drawn = window.BARCODE?.PresentationAssets?.draw('bossPulse', ctx, {
        x: artCenter, y: ground, width, height, frame, flip: direction < 0
      });
      if (!drawn) {
        ctx.fillStyle = '#ff6433';
        ctx.fillRect(center - BOSS_COMBAT.pulseWidth / 2, ground - BOSS_COMBAT.pulseHeight, BOSS_COMBAT.pulseWidth, BOSS_COMBAT.pulseHeight);
      }
      // The hot core still marks the actual damaging front and jump height.
      ctx.fillStyle = '#fff0bd';
      ctx.fillRect(center + (direction > 0 ? BOSS_COMBAT.pulseWidth / 2 - 4 : -BOSS_COMBAT.pulseWidth / 2),
        ground - BOSS_COMBAT.pulseHeight + 4, 4, BOSS_COMBAT.pulseHeight - 4);
      ctx.restore();
    }
    drawBoss(ctx) {
      if (!ctx || !this.boss?.active) return;
      const boss = this.boss;
      const visual = this.getBossVisualBounds();
      const surface = this.getBossSurface();
      const ground = surface.y;
      ctx.save();
      if (this.state === STATES.BOSS_COMBAT) {
        if (boss.slam && (boss.phase === 'telegraph' || boss.slam.remainingMs > 0)) {
          const slam = boss.slam, active = slam.remainingMs > 0;
          const prefs=window.BARCODE?.Preferences?.values||{};
          if(window.BARCODE?.Level1SignalArt)window.BARCODE.Level1SignalArt.drawThreat(ctx,{
            x:slam.x-slam.width/2,y:slam.groundY-slam.height,width:slam.width,height:slam.height,
            elapsedMs:boss.phaseElapsedMs,warningMs:boss.latePhase?BOSS_COMBAT.fastTelegraphMs:BOSS_COMBAT.telegraphMs,
            active,activeAgeMs:360-slam.remainingMs,activeDurationMs:360,
            reduced:!!prefs.reducedMotion||prefs.flashes===false});
          else {
            ctx.strokeStyle=active?'#fff0c8':'#ffb56a';ctx.lineWidth=2;
            ctx.strokeRect(slam.x-slam.width/2,slam.groundY-slam.height,slam.width,slam.height);
          }
          ctx.fillStyle = '#fff0c8'; ctx.font = 'bold 20px Oxanium, monospace'; ctx.textAlign = 'center';
          ctx.fillText(active ? 'SLAM' : 'MOVE CLEAR', slam.x, slam.groundY - slam.height - 15);
          for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(slam.x + i * 28 - 10, slam.groundY - 20); ctx.lineTo(slam.x + i * 28, slam.groundY - 7); ctx.lineTo(slam.x + i * 28 + 10, slam.groundY - 20); ctx.stroke(); }
        } else if (boss.phase === 'telegraph') {
          const duration = boss.latePhase ? BOSS_COMBAT.fastTelegraphMs : BOSS_COMBAT.telegraphMs;
          const progress = Math.min(1, boss.phaseElapsedMs / duration);
          const left = Math.max(surface.x, boss.x - BOSS_COMBAT.pulseRange);
          const right = Math.min(surface.x + surface.w, boss.x + BOSS_COMBAT.pulseRange);
          ctx.fillStyle = 'rgba(255, 80, 30, 0.12)';
          ctx.fillRect(left, ground - BOSS_COMBAT.pulseHeight, right - left, BOSS_COMBAT.pulseHeight);
          ctx.strokeStyle = '#ff7844';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(lerp(boss.x, left, progress), ground - 2);
          ctx.lineTo(lerp(boss.x, right, progress), ground - 2);
          ctx.stroke();
        }
        (boss.pulses || []).forEach(pulse => {
          [-1, 1].forEach(direction => {
            const x = pulse.originX + direction * pulse.radius;
            if (x >= (pulse.left ?? 0) && x <= (pulse.right ?? WORLD_WIDTH)) this.drawBossPulse(ctx, pulse, direction, pulse.groundY ?? ground);
          });
        });
        if (boss.canReceiveDamage) { ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 24; }
        if (boss.hitFlashMs > 0) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 32; }
      }
      if (boss.defeated) ctx.globalAlpha = 0.35;
      ctx.save();
      if (surface.maskFeet && !boss.traversal) {
        ctx.beginPath(); ctx.rect(-2000, -2500, 8200, surface.y - surface.maskFeet + 2500); ctx.clip();
      }
      const drawn = this.drawBossAuthoredPose(ctx);
      if (!drawn && boss.spriteReady && boss.sprite?.draw) boss.sprite.draw(ctx, visual.anchorX, visual.anchorY, { scale: visual.scale, flipH: boss.facing === undefined || boss.facing < 0 });
      else if (!drawn) { ctx.fillStyle = '#ff3300'; ctx.fillRect(visual.x, visual.y, visual.width, visual.height); }
      ctx.restore();
      ctx.shadowBlur = 0;
      if (this.state === STATES.BOSS_COMBAT) {
        const cue = boss.traversal ? (boss.traversal.phase === 'warning' ? 'RELOCATING — CLEAR THE MARKER' : 'SECTOR 1 BOSS') : boss.phase === 'telegraph' ? (boss.attackPattern === 'slam' ? 'MARKED SLAM — MOVE CLEAR' : boss.doublePulse ? 'TWO PULSES — JUMP' : 'GROUND PULSE — JUMP') :
          boss.canReceiveDamage ? (this.canStompCounter() ? 'COUNTER: RHYTHM / STOMP' : boss.stompCycle === boss.cycle ? 'COUNTER: RHYTHM — STOMP SPENT THIS CYCLE' : 'COUNTER: RHYTHM — LAND TO REARM STOMP') :
          boss.guardBounceMs > 0 ? 'GUARDED — LAND, THEN COUNTER' : 'SECTOR 1 BOSS';
        ctx.fillStyle = boss.canReceiveDamage ? '#00ffff' : '#ffffff';
        ctx.font = 'bold 17px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(cue, boss.x, this.getBossHitbox().y - 26);
        if (boss.phase === 'telegraph' || boss.canReceiveDamage) {
          const sample = this.getBossMusicSample();
          const fraction = sample ? sample.grid.beatFloat % 1 : 0;
          ctx.fillStyle = 'rgba(0, 8, 16, 0.85)';
          ctx.fillRect(boss.x - 48, this.getBossHitbox().y - 17, 96, 6);
          ctx.fillStyle = boss.canReceiveDamage ? '#00ffff' : '#ffbd70';
          ctx.fillRect(boss.x - 48, this.getBossHitbox().y - 17, 96 * fraction, 6);
        }
      }
      ctx.restore();
    }
    isGateClosed(encounterId) { return this.closedGateEncounterId === encounterId; }
    openEncounterGate(encounterId) { if (this.closedGateEncounterId === encounterId) this.closedGateEncounterId = null; this.restoreEncounterSignal(encounterId); }
    getCurrentGate() {
      if (this.closedGateEncounterId) return ENCOUNTER_GATES.find(g => g.encounterId === this.closedGateEncounterId) || null;
      if (this.state === STATES.TUTORIAL) return ENCOUNTER_GATES[0];
      if (!this.spawnedEncounterIds.has(this.state)) return ENCOUNTER_GATES.find(g => g.encounterId === this.state) || null;
      return null;
    }
    applyGateCollision() { const gate = this.getCurrentGate(); const player = this.player || window.player; if (!gate || !player) return; const half = player.width ? player.width / 2 : 40; if (player.position.x + half > gate.x) { player.position.x = gate.x - half; if (player.velocity) player.velocity.x = Math.min(0, player.velocity.x || 0); } }
    applyPlayerStageCollision(player, movement = {}) {
      if (!player || !player.velocity || player.velocity.y < 0) return false;
      const previousAnchorY = Number.isFinite(movement.previousFootY) ? movement.previousFootY : player.position.y;
      const currentAnchorY = Number.isFinite(movement.currentFootY) ? movement.currentFootY : player.position.y;
      const previousVisualFootY = previousAnchorY + PLAYER_VISUAL_FOOT_OFFSET;
      const currentVisualFootY = currentAnchorY + PLAYER_VISUAL_FOOT_OFFSET;
      const previousX = Number.isFinite(movement.previousX) ? movement.previousX : player.position.x;
      const footHalfWidth = 18;
      const verticalTravel = currentVisualFootY - previousVisualFootY;
      let landing = null;
      // A boarded rider keeps the deck at the shared rooftop seam. The
      // normal roof becomes available as soon as the rider walks out.
      for (const surface of this.getActorSurfaces(player)) {
        if (player.isDroppingThrough?.(surface.id) || surface.id === player.dropSurfaceId) continue;
        const surfacePrevY = surface.y;
        // Moving decks accumulate fractional coordinates. Roundoff at the
        // foot anchor must not turn a resting rider into a falling one.
        if (previousVisualFootY > surfacePrevY + .001 || currentVisualFootY < surface.y - .001) continue;
        const crossingT = verticalTravel > 0 ? Math.max(0, Math.min(1, (surface.y - previousVisualFootY) / verticalTravel)) : 1;
        const crossingX = previousX + (player.position.x - previousX) * crossingT;
        const overlapsX = crossingX + footHalfWidth > surface.x && crossingX - footHalfWidth < surface.x + surface.w;
        const boardsDeck = surface.moving && crossingX >= surface.x && crossingX <= surface.x + surface.w;
        if (overlapsX && (!landing || crossingT < landing.crossingT ||
            boardsDeck && Math.abs(crossingT - landing.crossingT) < .000001)) landing = { surface, crossingT };
      }
      if (!landing) return false;
      player.position.y = landing.surface.y - PLAYER_VISUAL_FOOT_OFFSET;
      player.velocity.y = 0;
      player.grounded = true;
      player.supportedSurfaceId = landing.surface.id;
      this.getLiftTransitSurface(player);
      return true;
    }
    getPriorEncounterKills(number) { return [0, 0, 4, 9, 14][Math.max(1, Math.min(4, Number(number) || 1))] || 0; }
    debugPrepareMission() { if (!debugAllowed()) return debugDisabled(); this.reset(); if (window.enemyManager?.clear) window.enemyManager.clear(); if (window.objectivesSystem?.reset) window.objectivesSystem.reset(); if (window.tutorialSystem) { window.tutorialSystem.completed = true; window.tutorialSystem.active = false; } if (this.player) { this.player.controlsDisabled = false; if (this.player.velocity) { this.player.velocity.x = 0; this.player.velocity.y = 0; } } this.startMission(); return this.getDiagnostics(); }
    debugSkipTutorial() { return this.debugPrepareMission(); }
    debugClearEnemies() { if (!debugAllowed()) return debugDisabled(); if (window.enemyManager) { window.enemyManager.enemies.forEach(enemy => { if (enemy && (enemy._sector1MissionEnemy || enemy._jammerReinforcement)) { enemy.active = false; enemy._disposed = true; } }); window.enemyManager.enemies = window.enemyManager.enemies.filter(enemy => enemy && enemy.active); } this.activeEncounterEnemies = []; this.pendingSpawns = []; return this.getDiagnostics(); }
    debugCompleteEncounter() { if (!debugAllowed()) return debugDisabled(); const index = ENCOUNTERS.findIndex(encounter => encounter.id === this.state); if (index < 0) return { ok: false, reason: 'no-active-encounter', diagnostics: this.getDiagnostics() }; const completedTotal = ENCOUNTERS.slice(0, index + 1).reduce((sum, encounter) => sum + encounterSpecs(encounter).length, 0); this.debugClearEnemies(); this.debugSetMissionKills(completedTotal); this.openEncounterGate(this.state); this.activeEncounterId = null; this.closedGateEncounterId = null; if (completedTotal >= this.requiredEnemyKills) this.revealJammer(); else { this.state = ENCOUNTERS[index + 1].id; this.prepareAssetsForEncounter(index + 1); } return this.getDiagnostics(); }
    debugSetMissionKills(value) { if (!debugAllowed()) return debugDisabled(); this.missionStarted = true; this.missionDefeats = Math.max(0, Math.min(this.requiredEnemyKills, Number(value) || 0)); if (window.enemyManager) window.enemyManager.defeatedCount = this.missionDefeats; if (typeof window.syncEnemyDefeatProjections === 'function') window.syncEnemyDefeatProjections(this.missionDefeats); else if (window.gameState) window.gameState.enemiesDefeated = this.missionDefeats; if (window.objectivesSystem?.updateMissionDefeatProgress) window.objectivesSystem.updateMissionDefeatProgress(this.missionDefeats, this.requiredEnemyKills); return this.getDiagnostics(); }
    debugGotoEncounter(number) { if (!debugAllowed()) return debugDisabled(); const index = Math.max(1, Math.min(4, Number(number) || 1)); this.debugPrepareMission(); this.debugClearEnemies(); this.spawnedEncounterIds = new Set(ENCOUNTERS.slice(0, index - 1).map(encounter => encounter.id)); this.debugSetMissionKills(this.getPriorEncounterKills(index)); this.state = ENCOUNTERS[index - 1].id; this.activeEncounterId = null; this.closedGateEncounterId = null; if (this.player) { this.player.position.x = ENCOUNTERS[index - 1].triggerX + 10; this.player.position.y = GROUND_Y; this.player.velocity.x = 0; this.player.velocity.y = 0; } return this.getDiagnostics(); }
    debugGotoJammer() { if (!debugAllowed()) return debugDisabled(); this.debugPrepareMission(); this.debugClearEnemies(); this.spawnedEncounterIds = new Set(ENCOUNTERS.map(encounter => encounter.id)); this.debugSetMissionKills(this.requiredEnemyKills); this.revealJammer(); return this.getDiagnostics(); }
    debugDamageJammer(amount = 1) { if (!debugAllowed()) return debugDisabled(); if (!this.jammerRevealed) this.debugGotoJammer(); const environment = window.BARCODE?.JammerEnvironment; const status = environment?.getStatus?.(); const hits = Math.min(Math.max(1, Number(amount) || 1), Math.max(0, status?.health || 0)); let result = { ok: false, reason: 'jammer-unavailable' }; for (let i = 0; i < hits; i++) { this.debugDamageSequence += 1; result = environment.applyRhythmDamage({ timing: 'perfect', sequence: `level1-debug-${this.debugDamageSequence}` }); } return result; }
    debugDestroyJammer() { if (!debugAllowed()) return debugDisabled(); if (!this.jammerRevealed) this.debugGotoJammer(); const remaining = window.BARCODE?.JammerEnvironment?.getStatus?.().health || 0; if (remaining > 0) this.debugDamageJammer(remaining); return this.getDiagnostics(); }
    debugResetSignalLift() { if (!debugAllowed()) return debugDisabled(); if (!this.missionStarted) this.debugPrepareMission(); this.resetSignalLift(); if (this.player) { this.player.position.x = SIGNAL_LIFT.x + SIGNAL_LIFT.w / 2; this.player.position.y = SIGNAL_LIFT.bottomY - PLAYER_VISUAL_FOOT_OFFSET; this.player.velocity.x = 0; this.player.velocity.y = 0; this.player.grounded = true; this.player.supportedSurfaceId = null; } return this.getDiagnostics(); }
    debugChargeSignalLift() { if (!debugAllowed()) return debugDisabled(); return this.chargeSignalLift(); }
    debugGiveSignalAmp() { if (!debugAllowed()) return debugDisabled(); return this.giveSignalAmp(); }
    debugPlayBossIntro() { if (!debugAllowed()) return debugDisabled(); if (!this.jammerRevealed) this.debugGotoJammer(); this.captureCinematicStart(); this.transitionToPan(); return this.getDiagnostics(); }
    debugGotoBoss() {
      if (!debugAllowed()) return debugDisabled();
      if (window.gameState) Object.assign(window.gameState, { running: true, paused: false, gameOver: false, victory: false });
      this.debugGotoJammer();
      if (this.player) {
        Object.assign(this.player, { health: this.player.maxHealth, invulnerable: false,
          invulnerableUntil: 0, _enemyInvulnerableUntilMs: 0, isEntering: false,
          grounded: true, supportedSurfaceId: null, allowMovement: true,
          jumpBufferTimerMs: 0, coyoteTimerMs: 0, airInput: 0 });
        this.player.position.y = GROUND_Y;
        this.player.velocity.x = 0;
        this.player.velocity.y = 0;
      }
      this.debugDamageJammer(16);
      this.purgeEnemies();
      this.prepareBossAssets();
      this.cameraX = clampCamera(this.player?.position?.x || 960);
      this.startBossWalk();
      this.boss.fallbackLocked = false;
      this.boss.x = clampWorldX((this.player?.position?.x || 960) + 440);
      if (Math.abs(this.boss.x - this.player.position.x) < 260) this.boss.x = clampWorldX(this.player.position.x - 440);
      this.boss.y = GROUND_Y;
      this.cinematicZoomOverride = null;
      this.enterBossReady();
      return this.getDiagnostics();
    }
    debugCompleteLevel() {
      if (!debugAllowed()) return debugDisabled();
      if (!window.gameState?.running || window.BARCODE?.RunAndGunProof?.active || window.BARCODE?.Campaign?.intermission)
        return { ok: false, reason: 'level-01-inactive' };
      this.debugGotoBoss();
      if (!this.boss || !this.completeLevel({ debugSkip: true })) return { ok: false, reason: 'level-01-clear-unavailable' };
      // This is a deliberate test shortcut, so the completed handoff can open
      // immediately without waiting for the results card's input-release timer.
      this.completion.controlsReady = true;
      window.BARCODE?.Campaign?.openIntermission?.();
      return { ok: true, state: this.state, intermission: !!window.BARCODE?.Campaign?.intermission };
    }
    debugResetMission() { if (!debugAllowed()) return debugDisabled(); this.debugPrepareMission(); if (this.player) { this.player.position.x = 200; this.player.position.y = GROUND_Y; this.player.velocity.x = 0; this.player.velocity.y = 0; if (Number.isFinite(this.player.maxHealth)) this.player.health = this.player.maxHealth; } return this.getDiagnostics(); }
    prepareAssetsForEncounter(index) { const def = ENCOUNTERS[index]; if (!def) return; this.assetDiagnostics = this.assetDiagnostics || []; const types = [...new Set(encounterSpecs(def).map(e => e.type))]; types.forEach(type => this.requestSpriteOnce(`enemy:${type}`, type === 'firewall' ? 'firewall_firewall' : type === 'corrupted' ? 'corrupted_corrupted' : 'virus_virus')); if (index >= ENCOUNTERS.length - 1) this.prepareJammerAsset(); }
    prepareJammerAsset() { this.requestSpriteOnce('jammer', 'broadcast_jammer_broadcastjammer'); }
    requestSpriteOnce(key, spriteId, onReady) { this.preparedAssets = this.preparedAssets || {}; if (this.preparedAssets[key]) return this.preparedAssets[key].sprite || this.preparedAssets[key]; try { if (!window.MakkoEngine || typeof window.MakkoEngine.sprite !== 'function') { this.recordAssetDiagnostic(key, 'MakkoEngine unavailable'); return null; } const sprite = window.MakkoEngine.sprite(spriteId); const entry = { key, spriteId, sprite, onReady, generation: this.assetGeneration, ready: false, diagnosticRecorded: false }; this.preparedAssets[key] = entry; this.pollPreparedAsset(entry); return sprite; } catch (error) { this.recordAssetDiagnostic(key, error); return null; } }
    pollPreparedAssets() { if (!this.preparedAssets) return; Object.values(this.preparedAssets).forEach(entry => { if (entry && entry.sprite) this.pollPreparedAsset(entry); }); }
    pollPreparedAsset(entry) { if (!entry || entry.ready || entry.generation !== this.assetGeneration) return; try { if (!entry.sprite.isLoaded || entry.sprite.isLoaded()) { entry.ready = true; if (entry.onReady) entry.onReady(entry.sprite); } } catch (error) { if (!entry.diagnosticRecorded) { entry.diagnosticRecorded = true; this.recordAssetDiagnostic(entry.key, error); } } }
    recordAssetDiagnostic(key, error) { this.assetDiagnostics = this.assetDiagnostics || []; if (!this.assetDiagnostics.some(entry => entry.key === key)) this.assetDiagnostics.push({ key, message: String(error && error.message || error) }); }
    reset(options = {}) {
      if (this.player) { this.player.dropSurfaceId = null; this.player.dropSurfaceIds = null; }
      this.resetRepairs();
      window.BARCODE?.stageFX?.reset(this);
      window.renderer?.resetFollowCamera?.(this.player?.position.x);
      this.resetDistrictSignal();
      this.missionStarted = false; this.missionDefeats = 0; this.enemiesDefeated = 0; this.jammerRevealed = false; this.jammerDestroyedNotified = false;
      this.cinematicStartedCount = 0; this.phaseElapsed = 0; this.cameraOverrideActive = false; this.cameraX = null;
      this.cinematicStartCameraX = null; this.cinematicStartPlayerPosition = null; this.cinematicStartZoom = null; this.cinematicWideZoom = null; this.cinematicCloseZoom = null;
      this.cinematicZoomOverride = null; this.cinematicZoomReleasePending = false; this.closeUpStartZoom = null; this.frozenPlayerPosition = null;
      this.panStartX = null; this.panTargetX = null; this.returnStartCameraX = null; this.returnStartZoom = null; this.returnStartBossX = null;
      this.bossCheckpoint = null; this.levelCompletionCount = 0;
      this.completion = null;
      if (!options.preserveDefeats && window.rhythmSystem) window.rhythmSystem.runBestCombo = 0;
      this.boss = null; this.bossReadyEmitted = false; this.assetGeneration = (this.assetGeneration || 0) + 1; this.preparedAssets = {}; this.preloadedBossSprite = null; this.bossAssetsRequested = false;
      this.countedEnemies = new Set(); this.spawnedEncounterIds = new Set(); this.activeEncounterId = null; this.activeEncounterEnemies = []; this.closedGateEncounterId = null; this.pendingSpawns = [];
      this.skyCaches = new Set(); this.skyCacheNotice = null; this.cameraY = 0;
      this.nextJammerSpawnMs = Infinity; this.jammerReinforcementCount = 0; this.debugDamageSequence = 0; this.lastSpawnPlan = null; this.resetSignalLift(); this.signalAmpCollected = false; if (window.BARCODE) window.BARCODE.signalAmpCharges = 0;
      this.state = options && options.preserveTutorial ? STATES.TUTORIAL : STATES.TUTORIAL;
      if (window.renderer && typeof window.renderer.clearCinematicZoomOverride === 'function') window.renderer.clearCinematicZoomOverride();
      if (window.BARCODE?.JammerEnvironment?.reset) window.BARCODE.JammerEnvironment.reset();
      if (window.lostDataSystem?.reset) window.lostDataSystem.reset();
      if (window.hackingSystem?.reset) window.hackingSystem.reset();
      if (this.player) this.player.controlsDisabled = false;
    }
    getDiagnostics() { const activeReinforcements = (window.enemyManager?.enemies || []).filter(enemy => enemy && enemy.active && enemy._jammerReinforcement).length; return { state: this.state, missionDefeats: this.missionDefeats, requiredEnemyKills: this.requiredEnemyKills, encounters: ENCOUNTERS, stageSurfaces: STAGE_SURFACES, signalLift: this.signalLift && { available: this.isSignalLiftAvailable(), x: this.signalLift.x, y: this.signalLift.y, state: this.signalLift.state, charges: this.signalLift.charges, requiredCharges: SIGNAL_LIFT.requiredCharges }, pendingSpawns: this.pendingSpawns.length, lastSpawnPlan: this.lastSpawnPlan, activeReinforcements, jammerRevealed: this.jammerRevealed, cinematicStartedCount: this.cinematicStartedCount, cameraX: this.cameraX, cinematic: { startCameraX: this.cinematicStartCameraX, startPlayerPosition: this.cinematicStartPlayerPosition, startZoom: this.cinematicStartZoom, zoomOverride: this.getCinematicZoomOverride(), cameraOverrideActive: this.cameraOverrideActive, returnStartBossX: this.returnStartBossX }, boss: this.boss && { x: this.boss.x, state: this.boss.state, flourishPlayed: this.boss.flourishPlayed, visual: this.getBossVisualBounds(), ...this.getBossStatus(), combatPending: this.isBossCinematicActive() }, levelCompletionCount: this.levelCompletionCount, bossReadyEmitted: this.bossReadyEmitted, assetDiagnostics: this.assetDiagnostics || [] }; }
  };
  window.initSector1Progression = function(player) { if (!window.sector1Progression) window.sector1Progression = new window.Sector1Progression(player); else window.sector1Progression.player = player || window.sector1Progression.player; return window.sector1Progression; };
})();
