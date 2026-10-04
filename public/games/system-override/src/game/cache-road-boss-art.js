// Painted mechanical poses only. The road owns the boss's physical address,
// damage, elapsed time, warnings and front/rear projection.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-boss-art.js',
  exports: ['BARCODE.CacheRoadBossArt'], dependencies: ['BARCODE.PresentationAssets'] });
(function(B) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const FRAMES = Object.freeze({ intact: 0, scanning: 1, scannerBroken: 2,
    ram: 3, armorBroken: 4, coreExposed: 5, coreHit: 6, defeated: 7 });
  const IMPACTS = Object.freeze({ sparks: 0, impact: 0, armor: 1,
    'armor-break': 1, debris: 2, skid: 3, exhaust: 4, core: 5, burst: 5 });

  function frameFor({ health = 3, phase = '', reduced = false } = {}) {
    const hp = clamp(Math.ceil(finite(health, 3)), 0, 3);
    if (hp === 0) return FRAMES.defeated;
    if (hp === 1) {
      if (phase === 'armor-break') return FRAMES.armorBroken;
      return !reduced && ['hit', 'core-hit', 'counter-hit'].includes(phase) ?
        FRAMES.coreHit : FRAMES.coreExposed;
    }
    if (hp === 2) return !reduced && ['ram', 'charge', 'attack'].includes(phase) ?
      FRAMES.ram : FRAMES.scannerBroken;
    return !reduced && ['scan', 'scanning', 'warning', 'lock'].includes(phase) ?
      FRAMES.scanning : FRAMES.intact;
  }

  function drawRig(ctx, options = {}) {
    const { x = 0, y = 0, width = 192, height = width, health = 3,
      phase = '', reduced = false, alpha = 1 } = options;
    if (!ctx || !Number.isFinite(x) || !Number.isFinite(y) ||
        !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
      return false;
    ctx.save();
    try {
      ctx.globalAlpha *= clamp(finite(alpha, 1), 0, 1);
      // Center x and tire-contact y stay fixed when changing a damage pose.
      // No body recoil or warning address is invented inside this helper.
      return !!B.PresentationAssets?.draw('cachePursuitRig', ctx,
        { x, y, width, height, frame: frameFor({ health, phase, reduced }) });
    } finally { ctx.restore(); }
  }

  function drawImpact(ctx, options = {}) {
    const { x = 0, y = 0, width = 96, height = width, kind = 'sparks',
      progress = 0, alpha = 1, angle = 0, reduced = false } = options;
    if (reduced || !ctx || !Number.isFinite(x) || !Number.isFinite(y) ||
        !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
        !Object.hasOwn(IMPACTS, kind)) return false;
    const u = clamp(finite(progress), 0, 1);
    const grow = kind === 'debris' ? .55 + .65 * u :
      ['skid', 'exhaust'].includes(kind) ? 1 : .68 + .42 * u;
    ctx.save();
    try {
      ctx.translate(x, y);
      if (finite(angle)) ctx.rotate(angle);
      ctx.globalAlpha *= clamp(finite(alpha, 1), 0, 1) * (1 - u) * (1 - u);
      return !!B.PresentationAssets?.draw('cachePursuitImpact', ctx,
        { width: width * grow, height: height * grow, frame: IMPACTS[kind] });
    } finally { ctx.restore(); }
  }

  B.CacheRoadBossArt = Object.freeze({ drawRig, drawImpact, frameFor,
    frames: FRAMES, impacts: IMPACTS });
})(window.BARCODE);
