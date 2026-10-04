// Authored Cache Line facts. The road remains the clock and checkpoint owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-chapter.js', exports: ['BARCODE.CacheChapter'],
  dependencies: ['BARCODE.Campaign', 'BARCODE.LoreCollection'] });
(function(B) {
  const LEVEL = 'level-02';
  const recordIds = Object.freeze(['lore.l02.01', 'lore.l02.02', 'lore.l02.03', 'lore.l02.04']);
  const difficulties = ['relaxed', 'standard', 'overclocked'];
  const counters = ['elapsedMs', 'damageTaken', 'retries', 'attempts', 'accurate', 'perfect', 'connected', 'bestCombo'];
  const resultCounters = ['score', ...counters, 'discoveries', 'bonus'];
  const statuses = new WeakMap();
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const finite = value => Number.isFinite(value) && value >= 0 && value <= 1e10;
  const count = value => finite(value) ? Math.round(value) : 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  function normalizeEnding(raw) {
    if (!object(raw) || raw.version !== 1) return { version: 1, page: 0, cue: 0, done: false };
    return { version: 1, page: Number.isFinite(raw.page) ? Math.max(0, Math.min(3, Math.floor(raw.page))) : 0,
      cue: Number.isFinite(raw.cue) ? Math.max(0, Math.min(2, Math.floor(raw.cue))) : 0, done: raw.done === true };
  }
  function normalizeResult(raw, runId) {
    if (!object(raw) || raw.runId !== runId || !Number.isFinite(raw.completedAt) || raw.completedAt < 0 ||
        raw.recoveryMode !== 'checkpoints' || !resultCounters.every(key => finite(raw[key])) ||
        raw.perfect > raw.accurate || raw.accurate > raw.attempts || raw.connected > raw.accurate || raw.bestCombo > raw.connected ||
        raw.discoveries > recordIds.length || raw.bonus !== 0) return null;
    const result = { runId, recoveryMode: 'checkpoints', completedAt: raw.completedAt };
    for (const key of resultCounters) result[key] = count(raw[key]);
    return Object.freeze(result);
  }
  function normalize(raw) {
    if (!object(raw) || raw.version !== 1 ||
        (raw.encounterVersion !== undefined && ![1, 2, 3, 4].includes(raw.encounterVersion)) || typeof raw.runId !== 'string' ||
        !/^cache-[a-z0-9-]{1,90}$/i.test(raw.runId) || !difficulties.includes(raw.difficultyId) ||
        !counters.every(key => finite(raw[key])) || raw.perfect > raw.accurate ||
        raw.accurate > raw.attempts || raw.connected > raw.accurate || raw.bestCombo > raw.connected ||
        !Array.isArray(raw.records) || raw.records.length > 32 || raw.records.some(id => !recordIds.includes(id))) return null;
    const chapter = { version: 1, runId: raw.runId, difficultyId: raw.difficultyId };
    if ([1, 2, 3, 4].includes(raw.encounterVersion)) chapter.encounterVersion = raw.encounterVersion;
    for (const key of counters) chapter[key] = count(raw[key]);
    chapter.records = recordIds.filter(id => raw.records.includes(id));
    chapter.delivery = null;
    // A broken/future receipt must not be turned into a fresh eligible run.
    if (raw.delivery !== null && raw.delivery !== undefined) {
      if (!object(raw.delivery) || raw.delivery.version !== 1) return null;
      const result = normalizeResult(raw.delivery.result, chapter.runId);
      if (!result || counters.some(key => result[key] !== chapter[key]) || result.discoveries !== chapter.records.length) return null;
      chapter.delivery = { version: 1, result, ending: normalizeEnding(raw.delivery.ending) };
    }
    return chapter;
  }
  function archive() { return B.Campaign?.archive?.(); }
  function clear(road) {
    return !!road?.active && road.status === 'clear' && road.state?.status === 'clear' &&
      road.state.gateOpen === true && (road.chapter?.encounterVersion!==3||road.state.pursuit?.defeated===true) &&
      (road.chapter?.encounterVersion!==4||road.state.combat?.boss?.defeated===true) && Number.isFinite(road.state.musicBar) && road.state.musicBar >= 100;
  }
  const C = B.CacheChapter = {
    recordIds,
    create({ difficultyId = B.LevelDifficulty?.choice?.id || 'standard', retries = 0 } = {}) {
      const chapter = { version: 1, runId: `cache-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
        difficultyId: difficulties.includes(difficultyId) ? difficultyId : 'standard', encounterVersion: 4 };
      for (const key of counters) chapter[key] = 0;
      chapter.retries = count(retries); chapter.records = []; chapter.delivery = null;
      return chapter;
    },
    normalize,
    normalizeEnding,
    finish(road = B.CacheRoadProof) {
      if (!clear(road) || !normalize(road.chapter)) return null;
      const chapter = road.chapter;
      if (!chapter.delivery) {
        const result = { runId: chapter.runId, recoveryMode: 'checkpoints', completedAt: Date.now(),
          score: count(road.state.score), discoveries: chapter.records.length, bonus: 0 };
        // Completion freezes the measured attempt, including failed checkpoint
        // attempts. Reading/reopening the ending cannot change this receipt.
        for (const key of counters) { chapter[key] = count(chapter[key]); result[key] = chapter[key]; }
        chapter.delivery = { version: 1, result: Object.freeze(result),
          ending: { version: 1, page: 0, cue: 0, done: false } };
        this.persist(road);
      }
      return chapter.delivery.result;
    },
    persist(road = B.CacheRoadProof) {
      const chapter = road?.chapter, checked = normalize(chapter), store = archive();
      if (!clear(road) || !checked?.delivery || !store || typeof road.makeCheckpoint !== 'function') return false;
      const checkpoint = road.makeCheckpoint('road-clear');
      if (!checkpoint || checkpoint.levelId !== LEVEL || checkpoint.checkpointId !== 'road-clear') return false;
      const savedChapter = normalize(checkpoint.levelState?.chapter);
      if (!savedChapter?.delivery || savedChapter.runId !== checked.runId ||
          JSON.stringify(savedChapter.delivery) !== JSON.stringify(checked.delivery)) return false;
      const saved = store.completeCampaignLevel(LEVEL, checked.difficultyId, checked.delivery.result,
        'stem.bass', 'level-03', { checkpoint, loreIds: checked.records });
      statuses.set(chapter, saved ? 'saved' : store.status === 'ready' ? 'unavailable' : store.status);
      B.Campaign?.syncTitleButton?.();
      return saved;
    },
    saveStatus(road = B.CacheRoadProof) {
      const chapter = road?.chapter, store = archive();
      if (!object(chapter) || !chapter.delivery || !store) return 'unavailable';
      if (statuses.has(chapter)) return statuses.get(chapter);
      const current = store.record?.current, progress = store.record?.progress;
      const savedChapter = normalize(current?.levelState?.chapter), liveChapter = normalize(chapter);
      const saved = current?.levelId === LEVEL && current.checkpointId === 'road-clear' &&
        savedChapter?.runId === chapter.runId && liveChapter &&
        JSON.stringify(savedChapter.delivery) === JSON.stringify(liveChapter.delivery) &&
        progress?.completedLevels?.includes(LEVEL) && progress?.items?.includes('stem.bass') &&
        progress?.unlockedLevels?.includes('level-03');
      return saved && store.status === 'ready' ? 'saved' : store.status === 'ready' ? 'unavailable' : store.status;
    },
    collect(id, road = B.CacheRoadProof) {
      const chapter = road?.chapter;
      if (!road?.active || road.status !== 'playing' || !recordIds.includes(id) ||
          !chapter || chapter.delivery || !normalize(chapter)) return false;
      const fresh = !chapter.records.includes(id);
      if (fresh) chapter.records.push(id);
      archive()?.collect?.(id);
      return fresh;
    }
  };
})(window.BARCODE = window.BARCODE || {});
