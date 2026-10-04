// Frame-owned playback through Makko's public update boundary.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/engine/sprite-playback.js', exports: ['BARCODE.SpritePlayback'], dependencies: ['MakkoEngine'] });
window.BARCODE = window.BARCODE || {};

(function(namespace) {
  'use strict';

  function update(sprite, deltaMs) {
    if (!sprite?.update || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    let remaining = deltaMs;
    // The hosted SDK advances one frame and clears its accumulator per call.
    // Feed exact frame boundaries so slow/irregular renders retain the excess
    // time. Makko still owns frame selection, speed, loops and callbacks.
    // No new timer, frame assignment, playback reference or per-frame object.
    for (let steps = 0; remaining > 1e-7 && steps < 256; steps++) {
      const sheet = sprite.currentSprite;
      const animation = sheet?.currentAnimation;
      if (!animation?.frames || !Number.isFinite(sheet.timeAccumulator)) {
        sprite.update(remaining);
        return;
      }
      if (!sheet.playing) return;
      const speed = sheet.playbackSpeed;
      if (!Number.isFinite(speed) || speed <= 0) return;
      const key = animation.frames[sheet.currentFrame];
      const duration = sheet.metadata?.frames?.[key]?.duration;
      const frameMs = Number.isFinite(duration) && duration > 0 ? duration : 100;
      const untilNext = Math.max(0, (frameMs - sheet.timeAccumulator) / speed);
      const step = Math.min(remaining, untilNext);
      sprite.update(step);
      remaining -= step;
      // Resolve floating-point division landing a few ulps below a boundary.
      // Do this only when needed; adding epsilon to every slice loses time.
      if (sprite.currentSprite === sheet && sheet.playing &&
          sheet.timeAccumulator >= frameMs - 1e-7) sprite.update(1e-7 / speed);
    }
  }

  namespace.SpritePlayback = Object.freeze({ update });
})(window.BARCODE);
