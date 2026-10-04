// Independent, frame-owned atlas playback for the standalone browser build.
// Uses the game's authored manifest/JSON/images; installs no timers or RAF.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/engine/standalone-sprites.js', exports: ['BARCODE.StandaloneSprites', 'MakkoEngine'], dependencies: [] });
(function() {
  'use strict';
  const B = window.BARCODE = window.BARCODE || {};
  const copy = value => JSON.parse(JSON.stringify(value));
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  const positive = (value, fallback = 1) => Number.isFinite(value) && value > 0 ? value : fallback;
  function callbacks(list, ...args) {
    for (const callback of [...list]) {
      try { callback(...args); } catch (error) { window.console?.error?.('Sprite callback failed:', error); }
    }
  }
  class AnimationReference {
    constructor(sheet, name, loop) {
      this.spriteSheet = sheet; this.name = name; this.isLooping = loop;
      this._interrupted = false; this._completed = false; this._cycles = 0; this._elapsed = 0;
      this._complete = []; this._cycle = []; this._interrupt = [];
    }
    get currentFrame() { return this.spriteSheet.currentFrame; }
    get totalFrames() { return this.spriteSheet.currentAnimation?.frames.length || 0; }
    get progress() { return this.totalFrames ? this.currentFrame / this.totalFrames : 0; }
    get cycleCount() { return this._cycles; }
    get elapsedTime() { return this._elapsed; }
    get playbackSpeed() { return this.spriteSheet.playbackSpeed; }
    get isInterrupted() { return this._interrupted; }
    onComplete(callback) {
      if (typeof callback === 'function' && !this._interrupted) {
        if (this._completed) callbacks([callback]); else this._complete.push(callback);
      }
      return this;
    }
    onCycle(callback) { if (typeof callback === 'function' && !this._interrupted) this._cycle.push(callback); return this; }
    onInterrupt(callback) { if (typeof callback === 'function' && !this._interrupted) this._interrupt.push(callback); return this; }
    stop() { if (!this._interrupted) this.spriteSheet.stop(); }
    pause() { if (!this._interrupted) this.spriteSheet.pause(); }
    resume() { if (!this._interrupted) this.spriteSheet.resume(); }
    resetSpeed() { if (!this._interrupted) return this.spriteSheet.play(this.name, this.isLooping, 0, { speed: 1 }); }
    _replace() {
      if (this._interrupted) return;
      this._interrupted = true; this._complete.length = 0; this._cycle.length = 0;
      callbacks(this._interrupt); this._interrupt.length = 0;
    }
    _finish() {
      if (this._completed || this._interrupted) return;
      this._completed = true; callbacks(this._complete); this._complete.length = 0;
    }
  }
  class SpriteSheet {
    constructor(asset) {
      this.image = asset.image; this.metadata = asset.metadata; this.manifestMetadata = asset.manifestMetadata;
      this.imagePath = asset.imagePath; this.jsonPath = asset.jsonPath;
      this._animation = null; this._frame = 0; this._playing = false; this._loop = true;
      this._speed = 1; this.timeAccumulator = 0; this._reference = null;
    }
    get currentFrame() { return this._frame; }
    get currentAnimation() { return this._animation; }
    get playing() { return this._playing; }
    get loop() { return this._loop; }
    get playbackSpeed() { return this._speed; }
    isLoaded() { return !!this.image && !!this.metadata; }
    getAnchorPoint() { return this.manifestMetadata.anchor || this.metadata.meta?.anchor || null; }
    hasManifestAnchor() { return this.manifestMetadata.anchor !== undefined; }
    getManifestScale() { return positive(this.manifestMetadata.scale); }
    getSizingScale() { return 1; }
    getCurrentFrameSize() {
      const frame = this._frameData()?.frame;
      return frame ? { width: frame.w, height: frame.h } : null;
    }
    _frameData() { return this.metadata.frames[this._animation?.frames[this._frame]]; }
    getHitbox() {
      const anchor = this.getAnchorPoint(), size = this.getCurrentFrameSize();
      if (!anchor || !size) return null;
      return { ...(this.manifestMetadata.hitbox || { x: -size.width / 2, y: -size.height, width: size.width, height: size.height }),
        anchorX: anchor.x, anchorY: anchor.y };
    }
    play(name = null, loop = true, startFrame = 0, options = {}) {
      const keys = Object.keys(this.metadata.frames), tags = this.metadata.meta?.frameTags || [];
      const tag = name === null ? tags[0] : tags.find(value => value.name === name);
      if (name !== null && !tag) throw new Error(`Unknown atlas tag: ${name}`);
      let frames = tag ? keys.slice(tag.from, tag.to + 1) : keys;
      if (tag?.direction === 'reverse') frames = frames.reverse();
      if (tag?.direction === 'pingpong') frames = frames.concat(frames.slice(1, -1).reverse());
      if (!frames.length) throw new Error('Sprite animation has no frames');
      this._reference?._replace();
      this._animation = { name: tag?.name || 'default', frames };
      this._frame = Math.max(0, Math.min(frames.length - 1, Math.trunc(startFrame) || 0));
      this._loop = !!loop; this._playing = true; this._speed = positive(options.speed);
      this.timeAccumulator = 0;
      return this._reference = new AnimationReference(this, tag?.name || 'default', this._loop);
    }
    getCurrentAnimationReference() { return this._reference; }
    stop() { this._playing = false; this.timeAccumulator = 0; this._frame = 0; }
    pause() { this._playing = false; }
    resume() { if (this._animation && !this._reference?._completed) this._playing = true; }
    update(deltaMs) {
      if (!this._playing || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
      const reference = this._reference;
      reference._elapsed += deltaMs; this.timeAccumulator += deltaMs * this._speed;
      while (this._playing && this._reference === reference) {
        const duration = positive(this._frameData()?.duration, 100);
        if (this.timeAccumulator + 1e-9 < duration) break;
        this.timeAccumulator = Math.max(0, this.timeAccumulator - duration);
        if (this._frame + 1 < this._animation.frames.length) this._frame++;
        else if (this._loop) {
          this._frame = 0; reference._cycles++; callbacks(reference._cycle, reference._cycles);
        } else {
          this._playing = false; this.timeAccumulator = 0; reference._finish();
        }
      }
    }
    draw(ctx, x, y, options = {}) {
      const data = this._frameData(); if (!data) return false;
      const scale = positive(options.scale) * this.getManifestScale(), frame = data.frame;
      const trim = data.trimmed ? data.spriteSourceSize : null;
      ctx.save();
      try {
        if (Number.isFinite(options.alpha)) ctx.globalAlpha *= Math.max(0, Math.min(1, options.alpha));
        ctx.translate(x, y); ctx.scale(options.flipH ? -scale : scale, options.flipV ? -scale : scale);
        ctx.drawImage(this.image, frame.x, frame.y, frame.w, frame.h, trim?.x || 0, trim?.y || 0, frame.w, frame.h);
      } finally { ctx.restore(); }
      return true;
    }
    clone() { return new SpriteSheet(this); }
  }
  class Character {
    constructor(name, assets = new Map()) {
      this.name = name; this.animations = new Map([...assets].map(([key, sheet]) => [key, sheet.clone()]));
      this._currentSprite = null; this._currentName = null;
    }
    get currentSprite() { return this._currentSprite; }
    isLoaded() { return this.animations.size > 0 && [...this.animations.values()].every(sheet => sheet.isLoaded()); }
    getAvailableAnimations() { return [...this.animations.keys()]; }
    getCurrentAnimation() { return this._currentName; }
    getCurrentFrameSize() { return this._currentSprite?.getCurrentFrameSize() || null; }
    getHitbox() { return this._currentSprite?.getHitbox() || null; }
    play(name, loop = true, startFrame = 0, options = {}) {
      const sheet = this.animations.get(name); if (!sheet) throw new Error(`Unknown animation ${name} for ${this.name}`);
      if (this._currentSprite && this._currentSprite !== sheet) {
        this._currentSprite._reference?._replace(); this._currentSprite.pause();
      }
      this._currentSprite = sheet; this._currentName = name;
      return sheet.play(null, loop, startFrame, options);
    }
    stop() { this._currentSprite?.stop(); }
    pause() { this._currentSprite?.pause(); }
    resume() { this._currentSprite?.resume(); }
    update(deltaMs) { this._currentSprite?.update(deltaMs); }
    draw(ctx, x, y, options = {}) {
      const sheet = this._currentSprite; if (!sheet) return false;
      const anchor = sheet.getAnchorPoint(), factor = sheet.hasManifestAnchor()
        ? positive(options.scale) * sheet.getManifestScale() : 1;
      const offsetX = (anchor?.x || 0) * factor * (options.flipH ? -1 : 1);
      const offsetY = (anchor?.y || 0) * factor * (options.flipV ? -1 : 1);
      return sheet.draw(ctx, x - offsetX, y - offsetY, options);
    }
    getHitboxWorld(x, y, options = {}) {
      const box = this.getHitbox(); if (!box) return null;
      const scale = positive(options.scale) * (this._currentSprite.hasManifestAnchor() ? this._currentSprite.getManifestScale() : 1);
      return { x: x + (options.flipH ? -box.x - box.width : box.x) * scale,
        y: y + (options.flipV ? -box.y - box.height : box.y) * scale,
        width: box.width * scale, height: box.height * scale };
    }
    clone() { return new Character(this.name, this.animations); }
  }
  async function json(url) {
    const response = await window.fetch(url);
    if (!response.ok) throw new Error(`Sprite JSON request failed (${response.status}): ${url}`);
    return response.json();
  }
  function image(url) {
    return new Promise((resolve, reject) => {
      const loaded = new window.Image(); loaded.crossOrigin = 'anonymous';
      loaded.onload = () => resolve(loaded); loaded.onerror = () => reject(new Error(`Sprite image request failed: ${url}`));
      loaded.src = url;
    });
  }
  function validate(metadata, loadedImage, label) {
    if (!metadata?.frames || typeof metadata.frames !== 'object' || !Object.keys(metadata.frames).length ||
        !Array.isArray(metadata.meta?.frameTags)) throw new Error(`Invalid sprite metadata: ${label}`);
    for (const data of Object.values(metadata.frames)) {
      const frame = data?.frame;
      if (!frame || ![frame.x, frame.y, frame.w, frame.h].every(Number.isFinite) ||
          frame.x < 0 || frame.y < 0 || frame.w <= 0 || frame.h <= 0 ||
          frame.x + frame.w > loadedImage.width || frame.y + frame.h > loadedImage.height || data.rotated ||
          (data.duration !== undefined && (!Number.isFinite(data.duration) || data.duration <= 0))) {
        throw new Error(`Invalid or unsupported atlas frame: ${label}`);
      }
    }
    const count = Object.keys(metadata.frames).length;
    for (const tag of metadata.meta.frameTags) if (!Number.isInteger(tag.from) || !Number.isInteger(tag.to) ||
      tag.from < 0 || tag.to < tag.from || tag.to >= count) throw new Error(`Invalid atlas tag: ${label}`);
  }
  const engine = B.StandaloneSprites = {
    Character, SpriteSheet, AnimationReference, _characters: new Map(), _manifest: null, _loaded: false, _pending: null,
    init(manifestURL, options = {}) {
      if (this._pending && this._pendingURL === manifestURL) return this._pending;
      if (this._pending) return Promise.reject(new Error('Another sprite manifest is loading'));
      if (this._loaded && this._manifestURL === manifestURL) { options.onComplete?.(); return Promise.resolve(this); }
      this._loaded = false; this._pendingURL = manifestURL;
      const pending = (async () => {
        const manifest = typeof manifestURL === 'string' ? await json(manifestURL) : copy(manifestURL);
        if (!manifest?.characters || typeof manifest.characters !== 'object') throw new Error('Invalid sprite manifest');
        const base = typeof manifestURL === 'string' ? new URL(manifestURL, window.location?.href || 'http://localhost/') :
          new URL(options.baseURL || '.', window.location?.href || 'http://localhost/');
        const resolve = value => options.resolveAssetURL ? options.resolveAssetURL(value, base.href) : new URL(value, base).href;
        const records = Object.entries(manifest.characters).flatMap(([character, record]) =>
          Object.entries(record.animations || {}).map(([name, entry]) => ({ character, name, entry })));
        if (!records.length) throw new Error('Sprite manifest has no animations');
        let done = 0; const assets = await Promise.all(records.map(async ({ character, name, entry }) => {
          if (!entry.image || !entry.json) throw new Error(`Missing sprite image/JSON: ${character}/${name}`);
          const imagePath = resolve(entry.image), jsonPath = resolve(entry.json);
          const [loadedImage, metadata] = await Promise.all([image(imagePath), json(jsonPath)]);
          validate(metadata, loadedImage, name);
          const manifestMetadata = copy(entry.metadata || {});
          if (manifestMetadata.anchor === undefined && entry.anchor !== undefined) manifestMetadata.anchor = copy(entry.anchor);
          if (manifestMetadata.hitbox === undefined && entry.hitbox !== undefined) manifestMetadata.hitbox = copy(entry.hitbox);
          if (manifestMetadata.scale === undefined && entry.scale !== undefined) manifestMetadata.scale = entry.scale;
          const sheet = new SpriteSheet({ image: loadedImage, metadata: freeze(metadata), manifestMetadata: freeze(manifestMetadata), imagePath, jsonPath });
          callbacks(options.onProgress ? [options.onProgress] : [], ++done, records.length);
          return { character, name, sheet };
        }));
        const characters = new Map();
        for (const { character, name, sheet } of assets) {
          if (!characters.has(character)) characters.set(character, new Map()); characters.get(character).set(name, sheet);
        }
        this._characters = characters; this._manifest = freeze(copy(manifest)); this._manifestURL = manifestURL; this._loaded = true;
        callbacks(options.onComplete ? [options.onComplete] : []); return this;
      })();
      this._pending = pending;
      pending.then(() => { if (this._pending === pending) this._pending = null; }, error => {
        if (this._pending === pending) this._pending = null;
        callbacks(options.onError ? [options.onError] : [], error);
      });
      return pending;
    },
    isLoaded() { return this._loaded; },
    getManifest() { return this._manifest; },
    getCharacters() { return [...this._characters.keys()]; },
    getAnimations(name) { return [...(this._characters.get(name)?.keys() || [])]; },
    has(name) { return this._characters.has(name); },
    sprite(name) { const assets = this._characters.get(name); return assets ? new Character(name, assets) : null; }
  };
  // Existing gameplay owners keep their established public animation boundary.
  window.MakkoEngine = engine;
})();
