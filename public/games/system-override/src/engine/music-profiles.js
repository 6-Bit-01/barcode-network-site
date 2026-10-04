// Immutable music profile registry for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/music-profiles.js',
  exports: ['BARCODE.MusicProfiles'],
  dependencies: []
});

window.BARCODE = window.BARCODE || {};

(function(namespace) {
  'use strict';

  function clone(value) {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function invalid(reason) { return { ok: false, reason }; }
  function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function finiteNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
  function finiteNonnegative(value) { return finiteNumber(value) && value >= 0; }

  function validateSource(source) {
    if (!source || typeof source !== 'object') return invalid('source must be an object');
    if (!nonempty(source.sourceId)) return invalid('sourceId required');
    if (!nonempty(source.assetId)) return invalid('assetId required');
    if (!!source.url === !!source.resolverId) return invalid('exactly one of url or resolverId required');
    if (source.url && !nonempty(source.url)) return invalid('url must be nonempty string');
    if (source.backupUrl != null && (!nonempty(source.backupUrl) || !/^https:\/\//.test(source.backupUrl))) return invalid('backupUrl must be an HTTPS URL');
    if (source.resolverId && !nonempty(source.resolverId)) return invalid('resolverId must be nonempty string');
    if (typeof source.required !== 'boolean') return invalid('required boolean required');
    if (!finiteNonnegative(source.gain)) return invalid('gain must be finite non-negative number');
    if (!finiteNonnegative(source.offsetSec)) return invalid('offsetSec must be finite non-negative number');
    if (typeof source.nativeLoop !== 'boolean') return invalid('nativeLoop boolean required');
    if (!nonempty(source.fallbackRole)) return invalid('fallbackRole required');
    if (!nonempty(source.playbackPolicy)) return invalid('playbackPolicy required');
    return { ok: true };
  }

  function validateJudgmentRule(rule) {
    if (!rule || typeof rule !== 'object') return invalid('judgment rule must be an object');
    if (!nonempty(rule.id)) return invalid('judgment rule id required');
    if (!nonempty(rule.target)) return invalid('judgment rule target required');
    const windows = rule.windowsMs;
    if (!windows || typeof windows !== 'object') return invalid('judgment windows required');
    if (!finiteNonnegative(windows.perfect) || !finiteNonnegative(windows.excellent)) return invalid('judgment windows must be finite non-negative numbers');
    if (windows.perfect > windows.excellent) return invalid('perfect window must be <= excellent window');
    if (!finiteNumber(rule.calibrationOffsetMs)) return invalid('calibrationOffsetMs must be finite number');
    return { ok: true };
  }

  function validatePhrasePresentation(phrase) {
    if (phrase == null) return { ok: true };
    if (!phrase || typeof phrase !== 'object') return invalid('phrasePresentation must be an object');
    if (!Number.isInteger(phrase.barsPerPhrase) || phrase.barsPerPhrase <= 0) return invalid('barsPerPhrase must be positive integer');
    if (!Number.isInteger(phrase.beatCount) || phrase.beatCount <= 0) return invalid('phrase beatCount must be positive integer');
    return { ok: true };
  }

  function validateProfile(profile) {
    if (!profile || typeof profile !== 'object') return invalid('profile must be an object');
    if (!nonempty(profile.profileId)) return invalid('profileId required');
    if (!nonempty(profile.levelId)) return invalid('levelId required');
    if (typeof profile.runtimeRegistration !== 'boolean') return invalid('runtimeRegistration boolean required');
    if (!['unverified', 'legacy-compatibility', 'verified'].includes(profile.metadataStatus)) return invalid('metadataStatus invalid');
    if (profile.metadataStatus === 'legacy-compatibility' && profile.profileId !== 'level-01.main') return invalid('legacy-compatibility is Level 1 only');

    const sources = profile.arrangement && profile.arrangement.sources;
    if (!Array.isArray(sources) || sources.length < 1) return invalid('arrangement.sources required');
    const sourceIds = new Set();
    for (const source of sources) {
      const result = validateSource(source);
      if (!result.ok) return invalid(`${source && source.sourceId || 'source'}: ${result.reason}`);
      if (sourceIds.has(source.sourceId)) return invalid(`duplicate sourceId: ${source.sourceId}`);
      sourceIds.add(source.sourceId);
    }

    if (profile.adaptiveMix) {
      const mix = profile.adaptiveMix, roles = new Set(sources.map(s => s.mixRole));
      if (sources.some(s => !nonempty(s.mixRole)) || !mix.states?.explore || typeof mix.states.explore !== 'object') return invalid('adaptive mix requires source roles and exploration levels');
      if (mix.colourRole != null && !roles.has(mix.colourRole)) return invalid('adaptive colour role missing from sources');
      if (!finiteNumber(mix.fadeSec) || mix.fadeSec < 0.05 || mix.fadeSec > 2) return invalid('adaptive fade must be 0.05–2 seconds');
      for (const levels of Object.values(mix.states)) {
        if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return invalid('adaptive state levels invalid');
        for (const [role, value] of Object.entries(levels)) if (!roles.has(role) || !finiteNonnegative(value) || value > 0.8) return invalid('adaptive role/gain invalid');
      }
      if (mix.phraseVariants != null && (!Array.isArray(mix.phraseVariants) || !mix.phraseVariants.length || mix.phraseVariants.length > 16)) return invalid('adaptive phrase variants invalid');
      for (const levels of [...(mix.phraseVariants || []), mix.turnaroundGains || {}]) {
        if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return invalid('adaptive phrase gains invalid');
        for (const [role, value] of Object.entries(levels)) if (!roles.has(role) || !finiteNonnegative(value) || value > 1) return invalid('adaptive phrase role/gain invalid');
      }
      for (const [state, hz] of Object.entries(mix.filterHz || {})) if (!mix.states[state] || !finiteNumber(hz) || hz < 100 || hz > 20000) return invalid('adaptive filter state/frequency invalid');
      if (mix.echo) for (const [key, limit] of Object.entries({ wet: 0.4, feedback: 0.3, send: 0.8 })) {
        if (!finiteNonnegative(mix.echo[key]) || mix.echo[key] > limit) return invalid('adaptive echo budget invalid');
      }
    }
    if (profile.laneMix) {
      const mix = profile.laneMix;
      const roles = new Set(sources.map(source => source.mixRole));
      if (!Array.isArray(mix.laneRoles) || mix.laneRoles.length !== 4 ||
          new Set(mix.laneRoles).size !== 4 || mix.laneRoles.some(role => !roles.has(role)))
        return invalid('lane mix requires four distinct source roles');
      if (!nonempty(mix.backboneRole) || !roles.has(mix.backboneRole) ||
          mix.laneRoles.includes(mix.backboneRole) ||
          !mix.levels || [...roles].some(role => !finiteNonnegative(mix.levels[role]) || mix.levels[role] > 0.8))
        return invalid('lane mix backbone or levels invalid');
      if (!mix.idle || !finiteNonnegative(mix.idle.drive) || !finiteNonnegative(mix.idle.flow) ||
          mix.idle.drive > mix.levels.drive || mix.idle.flow > mix.levels.flow)
        return invalid('lane mix idle levels invalid');
      if (![mix.captureFadeSec, mix.releaseFadeSec].every(value =>
        finiteNumber(value) && value >= 0.05 && value <= 1))
        return invalid('lane mix capture timing invalid');
    }
    if (!profile.playback || typeof profile.playback !== 'object') return invalid('playback required');
    if (!finiteNonnegative(profile.playback.startTrackSec)) return invalid('playback.startTrackSec invalid');
    if (!nonempty(profile.playback.endPolicy)) return invalid('playback.endPolicy required');
    if (profile.playback.legacyManualRestartSec != null && (!finiteNumber(profile.playback.legacyManualRestartSec) || profile.playback.legacyManualRestartSec <= 0)) return invalid('legacyManualRestartSec invalid');
    if (profile.playback.loop != null) {
      const loop = profile.playback.loop;
      if (!loop || typeof loop !== 'object' || !finiteNonnegative(loop.loopStartSec) || !finiteNumber(loop.loopEndSec) || loop.loopEndSec <= loop.loopStartSec) return invalid('playback.loop invalid');
    }

    if (!profile.timeline || typeof profile.timeline !== 'object') return invalid('timeline required');
    if (!['none', 'fixed-tempo'].includes(profile.timeline.mode)) return invalid('runtime supports only none or fixed-tempo');
    if (profile.timeline.mode === 'none') {
      if (profile.timeline.fixedGrid) return invalid('no-grid profile must not define fixedGrid');
    }
    if (profile.timeline.mode === 'fixed-tempo') {
      if (!finiteNonnegative(profile.timeline.gridOriginTrackSec)) return invalid('gridOriginTrackSec required');
      if (!profile.timeline.fixedGrid || typeof profile.timeline.fixedGrid !== 'object') return invalid('fixedGrid required');
      const grid = profile.timeline.fixedGrid;
      if (!finiteNumber(grid.quarterBpm) || grid.quarterBpm <= 0) return invalid('quarterBpm invalid');
      if (!Number.isInteger(grid.beatsPerBar) || grid.beatsPerBar <= 0) return invalid('beatsPerBar invalid');
      if (!Number.isInteger(grid.beatUnit) || grid.beatUnit <= 0) return invalid('beatUnit invalid');
    }

    const phraseResult = validatePhrasePresentation(profile.phrasePresentation);
    if (!phraseResult.ok) return phraseResult;

    if (!Array.isArray(profile.judgmentRules)) return invalid('judgmentRules array required');
    const ruleIds = new Set();
    for (const rule of profile.judgmentRules) {
      const ruleResult = validateJudgmentRule(rule);
      if (!ruleResult.ok) return ruleResult;
      if (ruleIds.has(rule.id)) return invalid(`duplicate judgment rule id: ${rule.id}`);
      ruleIds.add(rule.id);
    }
    return { ok: true };
  }

  const registry = new Map();
  let activeProfileId = null;

  function register(profile) {
    const validation = validateProfile(profile);
    if (!validation.ok) throw new Error(`Invalid music profile: ${validation.reason}`);
    if (registry.has(profile.profileId)) throw new Error(`Duplicate music profile registration: ${profile.profileId}`);
    const frozen = deepFreeze(clone(profile));
    registry.set(frozen.profileId, frozen);
    return frozen;
  }

  function get(profileId) {
    if (!profileId || typeof profileId !== 'string') return null;
    return registry.get(profileId) || null;
  }

  function select(profileId) {
    if (!profileId || typeof profileId !== 'string') {
      activeProfileId = null;
      return null;
    }
    const exact = registry.get(profileId) || null;
    activeProfileId = exact ? exact.profileId : null;
    return exact;
  }

  function getActive() { return get(activeProfileId); }

  namespace.MusicProfiles = deepFreeze({ register, get, select, getActive, validateProfile, cloneProfile: clone, deepFreeze });
})(window.BARCODE);
