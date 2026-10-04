// Durable discovery facts. Ending evaluation belongs to a future campaign owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/lore-collection.js', exports: ['BARCODE.LoreCollection'], dependencies: [] });
(function() {
  const BARCODE = window.BARCODE = window.BARCODE || {};
  const KEY = 'barcode.system-override.save.v1.default';
  const COUNTS = [3, 4, 5, 4, 5, 4, 3];
  const EGGS = new Set(['egg.l01.studio-rat', 'egg.l01.cliff-maintenance', 'egg.l01.witty-route', 'egg.l01.venue-flyer']);
  for (let level = 2; level <= 7; level++) EGGS.add(`egg.l0${level}.studio-rat`);
  const IDS = new Set(COUNTS.flatMap((count, index) => Array.from({ length: count }, (_, piece) =>
    `lore.l${String(index + 1).padStart(2, '0')}.${String(piece + 1).padStart(2, '0')}`)));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const levelId = id => /^level-0[1-7]$/.test(id);
  function resultRecord(r) {
    if (!object(r) || typeof r.runId !== 'string' || r.runId.length > 100 || !Number.isFinite(r.completedAt)) return null;
    const result = { runId: r.runId, completedAt: r.completedAt, recoveryMode:r.recoveryMode==='full-run'?'full-run':'checkpoints' };
    for (const key of ['score', 'elapsedMs', 'damageTaken', 'retries', 'attempts', 'accurate', 'perfect', 'connected', 'bestCombo', 'discoveries', 'bonus']) {
      if (!Number.isFinite(r[key]) || r[key] < 0 || r[key] > 1e10) return null;
      result[key] = Math.round(r[key]);
    }
    return result;
  }
  function mergeResults(a = {}, b = {}) {
    const merged = {};
    for (const source of [a, b]) for (const [level, difficulties] of Object.entries(object(source) ? source : {})) {
      if (!levelId(level) || !object(difficulties)) continue;
      for (const [difficulty, entries] of Object.entries(difficulties)) {
        if (!/^[a-z][a-z0-9_-]{0,31}$/.test(difficulty) || !object(entries)) continue;
        for (const candidate of [entries.best, entries.latest, entries.fastest]) {
          const r = resultRecord(candidate); if (!r) continue;
          const bucket = (merged[level] ||= {})[difficulty] ||= {};
          if (!bucket.best || r.score > bucket.best.score || r.score === bucket.best.score && r.elapsedMs < bucket.best.elapsedMs) bucket.best = r;
          if (!bucket.latest || r.completedAt >= bucket.latest.completedAt) bucket.latest = r;
          if (!bucket.fastest || r.elapsedMs < bucket.fastest.elapsedMs) bucket.fastest = r;
        }
      }
    }
    return merged;
  }
  function blank() {
    return { schemaVersion: 1, campaignVersion: 'level-01-demo-1', slotId: 'default', revision: 0,
      current: { levelId: 'level-01', checkpointId: 'start', levelState: null },
      progress: { unlockedLevels: ['level-01'], completedLevels: [], items: [], lore: [], easterEggs: [], results: {} },
      settings: {}, integrity: { lastCleanExit: false, recoveredFromBackup: false } };
  }
  function parse(raw) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (value.schemaVersion !== 1 || value.slotId !== 'default' || !object(value.progress) || !Array.isArray(value.progress.lore)) return null;
      value.integrity = object(value.integrity) ? value.integrity : {};
      const unknown = value.progress.lore.filter(id => !IDS.has(id));
      if (unknown.length) value.integrity.unrecognizedLore = unknown;
      value.progress.lore = [...new Set(value.progress.lore.filter(id => IDS.has(id)))];
      value.progress.easterEggs = Array.isArray(value.progress.easterEggs) ? [...new Set(value.progress.easterEggs.filter(id => typeof id === 'string'))] : [];
      value.progress.completedLevels = Array.isArray(value.progress.completedLevels) ? [...new Set(value.progress.completedLevels.filter(id => typeof id === 'string'))] : [];
      value.progress.unlockedLevels = [...new Set(['level-01', ...(Array.isArray(value.progress.unlockedLevels) ? value.progress.unlockedLevels : []).filter(id => levelId(id))])];
      value.progress.items = Array.isArray(value.progress.items) ? [...new Set(value.progress.items.filter(id => typeof id === 'string'))] : [];
      value.progress.results = mergeResults(value.progress.results);
      value.progress.levelChallenges = Object.fromEntries(Object.entries(object(value.progress.levelChallenges) ? value.progress.levelChallenges : {})
        .filter(([id, c]) => /^level-0[1-7]$/.test(id) && object(c) && typeof c.difficultyId === 'string' && Number.isFinite(c.value) && c.value >= 0));
      value.progress.studioRatEvents = Object.fromEntries(Object.entries(object(value.progress.studioRatEvents) ? value.progress.studioRatEvents : {})
        .filter(([id, version]) => /^level-0[1-7]$/.test(id) && version === 2));
      return value;
    } catch (_) { return null; }
  }
  BARCODE.LoreCollection = class LoreCollection {
    constructor() {
      this.record = blank(); this.status = 'ready'; this.blocked = false;
      try {
        const raw = window.localStorage?.getItem(KEY);
        if (!window.localStorage) throw new Error('storage unavailable');
        if (!raw) {
          const backup = window.localStorage.getItem(KEY + '.backup');
          if (!backup) return;
          const recovered = parse(backup);
          if (recovered) { this.record = recovered; this.record.integrity.recoveredFromBackup = true; }
          else { this.blocked = true; this.status = 'damaged'; }
          return;
        }
        try {
          const version = JSON.parse(raw)?.schemaVersion;
          if (version !== undefined && version !== 1) { this.blocked = true; this.status = 'incompatible'; return; }
        } catch (_) { /* Try the last complete backup. */ }
        const canonical = parse(raw);
        const recovered = canonical || parse(window.localStorage.getItem(KEY + '.backup'));
        if (recovered) {
          this.record = recovered;
          if (!canonical) this.record.integrity.recoveredFromBackup = true;
        } else { this.blocked = true; this.status = 'damaged'; }
      } catch (_) { this.status = 'unavailable'; }
    }
    has(id) { return this.record.progress.lore.includes(id); }
    getIds() { return [...this.record.progress.lore]; }
    hasEgg(id) { return this.record.progress.easterEggs.includes(id); }
    hasStudioRatEvent(levelId) { return this.record.progress.studioRatEvents?.[levelId] === 2; }
    completeStudioRatEvent(levelId) {
      if (!/^level-0[1-7]$/.test(levelId) || this.hasStudioRatEvent(levelId)) return false;
      this.record.progress.studioRatEvents = { ...this.record.progress.studioRatEvents, [levelId]: 2 };
      const id = `egg.l${levelId.slice(-2)}.studio-rat`;
      if (!this.hasEgg(id)) this.record.progress.easterEggs.push(id);
      this.save(); return true;
    }
    recordLevelChallenge(levelId, difficultyId, value) {
      if (!/^level-0[1-7]$/.test(levelId) || typeof difficultyId !== 'string' || !Number.isFinite(value) || value < 0) return false;
      const prior = this.record.progress.levelChallenges?.[levelId];
      if (prior && prior.value >= value) return false;
      this.record.progress.levelChallenges = { ...this.record.progress.levelChallenges,
        [levelId]: { difficultyId, value, completedAt: new Date().toISOString() } };
      this.record.progress.completedLevels = [...new Set([...(this.record.progress.completedLevels || []), levelId])];
      this.save(); return true;
    }
    checkpoint(current) {
      if (!object(current) || !levelId(current.levelId) || typeof current.checkpointId !== 'string' || !object(current.levelState)) return false;
      this.record.current = JSON.parse(JSON.stringify(current)); this.currentDirty = true;
      return this.save();
    }
    completeCampaignLevel(level, difficulty, result, item, nextLevel, { recordResult = true, checkpoint = null, loreIds = [] } = {}) {
      const checked = resultRecord(result);
      if (!levelId(level) || !/^[a-z][a-z0-9_-]{0,31}$/.test(difficulty) || !checked) return false;
      // Authored chapters can commit their receipt and resume position in the
      // same promotion as their reward. Existing callers retain their separate
      // checkpoint behavior. Validate everything before changing session facts.
      if (checkpoint !== null && (!object(checkpoint) || checkpoint.levelId !== level ||
          typeof checkpoint.checkpointId !== 'string' || !object(checkpoint.levelState))) return false;
      if (!Array.isArray(loreIds) || loreIds.some(id => !IDS.has(id))) return false;
      let savedCheckpoint = null;
      try { if (checkpoint !== null) savedCheckpoint = JSON.parse(JSON.stringify(checkpoint)); }
      catch (_) { return false; }
      if (recordResult) this.record.progress.results = mergeResults(this.record.progress.results, { [level]: { [difficulty]: { latest: checked } } });
      this.record.progress.completedLevels = [...new Set([...this.record.progress.completedLevels, level])];
      if (typeof item === 'string') this.record.progress.items = [...new Set([...this.record.progress.items, item])];
      if (levelId(nextLevel)) this.record.progress.unlockedLevels = [...new Set([...this.record.progress.unlockedLevels, nextLevel])];
      this.record.progress.lore = [...new Set([...this.record.progress.lore, ...loreIds])];
      if (savedCheckpoint) { this.record.current = savedCheckpoint; this.currentDirty = true; }
      return this.save();
    }
    getRewardFacts() {
      return { challengeValue: Object.values(this.record.progress.levelChallenges || {}).reduce((sum, c) => sum + (Number.isFinite(c.value) ? c.value : 0), 0),
        studioRats: Array.from({ length: 7 }, (_, i) => `egg.l0${i + 1}.studio-rat`).filter(id => this.hasEgg(id)), lore: this.getIds() };
    }
    collectEgg(id) {
      if (!EGGS.has(id)) return false;
      const fresh = !this.hasEgg(id);
      if (fresh) this.record.progress.easterEggs.push(id);
      if (fresh || this.status !== 'ready') this.save();
      return fresh;
    }
    collect(id) {
      if (!IDS.has(id)) return false;
      const fresh = !this.has(id);
      if (fresh) this.record.progress.lore.push(id);
      if (fresh || this.status !== 'ready') this.save();
      return fresh;
    }
    save() {
      if (this.blocked) return false;
      try {
        const storage = window.localStorage;
        if (!storage) throw new Error('storage unavailable');
        // Merge discoveries from another tab before committing this one.
        const currentRaw = storage.getItem(KEY);
        if (currentRaw) {
          let current = null;
          try { current = JSON.parse(currentRaw); } catch (_) { /* Recovered backup is authoritative. */ }
          if (current?.schemaVersion !== undefined && current.schemaVersion !== 1) { this.blocked = true; this.status = 'incompatible'; return false; }
          const valid = parse(currentRaw);
          if (!valid && !this.record.integrity?.recoveredFromBackup) { this.blocked = true; this.status = 'damaged'; return false; }
          if (!valid) storage.setItem(KEY + '.damaged', currentRaw);
          if (valid) {
            const challenges = { ...valid.progress.levelChallenges };
            for (const [level, result] of Object.entries(this.record.progress.levelChallenges || {})) {
              if (!challenges[level] || result.value > challenges[level].value) challenges[level] = result;
            }
            this.record = { ...valid, current: this.currentDirty ? this.record.current : valid.current, progress: { ...valid.progress,
            lore: [...new Set([...valid.progress.lore, ...this.record.progress.lore])],
            easterEggs: [...new Set([...valid.progress.easterEggs, ...this.record.progress.easterEggs])],
            completedLevels: [...new Set([...(valid.progress.completedLevels || []), ...(this.record.progress.completedLevels || [])])],
            unlockedLevels: [...new Set([...(valid.progress.unlockedLevels || []), ...(this.record.progress.unlockedLevels || [])])],
            items: [...new Set([...(valid.progress.items || []), ...(this.record.progress.items || [])])],
            results: mergeResults(valid.progress.results, this.record.progress.results),
            levelChallenges: challenges,
            studioRatEvents: { ...valid.progress.studioRatEvents, ...this.record.progress.studioRatEvents } } };
          }
        }
        const next = JSON.parse(JSON.stringify(this.record));
        next.revision = (Number.isSafeInteger(next.revision) ? next.revision : 0) + 1;
        next.updatedAt = new Date().toISOString();
        const serialized = JSON.stringify(next);
        storage.setItem(KEY + '.pending', serialized);
        if (storage.getItem(KEY + '.pending') !== serialized || !parse(serialized)) throw new Error('save verification failed');
        const previous = parse(currentRaw);
        if (previous) storage.setItem(KEY + '.backup', JSON.stringify(previous));
        else storage.setItem(KEY + '.backup', serialized);
        storage.setItem(KEY, serialized);
        if (storage.getItem(KEY) !== serialized) throw new Error('save promotion failed');
        this.record = next; this.status = 'ready'; this.currentDirty = false;
        storage.removeItem(KEY + '.pending');
        return true;
      } catch (_) { this.status = 'unavailable'; return false; }
    }
  };
})();
