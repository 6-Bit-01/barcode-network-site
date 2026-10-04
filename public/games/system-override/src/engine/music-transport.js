// Fixed/no-grid music transport for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/engine/music-transport.js',
  exports: ['BARCODE.MusicTransport'],
  dependencies: ['BARCODE.MusicProfiles']
});

window.BARCODE = window.BARCODE || {};

(function(namespace) {
  'use strict';
  const freeze = namespace.MusicProfiles.deepFreeze;
  const clone = namespace.MusicProfiles.cloneProfile;

  function makeNoProfile(reason, generation) {
    return freeze({ status: 'no-profile', reason, profileId: null, generation, running: false, audioTimeSec: null, sourceAnchorAudioSec: null, sourceOffsetTrackSec: 0, trackTimeSec: null, grid: null, judgmentAvailable: false });
  }

  function createTransport() {
    let profile = null;
    let generation = 0;
    let running = false;
    let sourceAnchorAudioSec = null;
    let sourceOffsetTrackSec = 0;
    let lastSample = null;
    let boundaryListeners = [];
    let lastBoundaryBeat = null;
    let hitches = 0;

    function currentProfileId() { return profile ? profile.profileId : null; }

    function load(profileId) {
      const next = namespace.MusicProfiles.get(profileId);
      if (!next) {
        if (profile || running) generation++;
        profile = null;
        running = false;
        sourceAnchorAudioSec = null;
        sourceOffsetTrackSec = 0;
        lastBoundaryBeat = null;
        lastSample = null;
        return makeNoProfile('unknown-or-invalid-profile-id', generation);
      }
      if (profile && profile.profileId === next.profileId) {
        return lastSample || sample(sourceAnchorAudioSec || 0);
      }
      generation++;
      profile = next;
      running = false;
      sourceAnchorAudioSec = null;
      sourceOffsetTrackSec = next.playback.startTrackSec || 0;
      lastBoundaryBeat = null;
      lastSample = null;
      return sample(0);
    }

    function start(options) {
      options = options || {};
      if (!profile) return makeNoProfile('no-profile-loaded', generation);
      const anchor = options.sourceAnchorAudioSec;
      const offset = options.sourceOffsetTrackSec != null ? options.sourceOffsetTrackSec : profile.playback.startTrackSec || 0;
      if (!Number.isFinite(anchor)) return makeNoProfile('invalid-source-anchor', generation);
      if (running && sourceAnchorAudioSec === anchor && sourceOffsetTrackSec === offset) return sample(anchor);
      generation++;
      running = true;
      sourceAnchorAudioSec = anchor;
      sourceOffsetTrackSec = offset;
      lastBoundaryBeat = null;
      return sample(anchor);
    }

    function stop() {
      if (!running) return lastSample || sample(0);
      generation++;
      running = false;
      sourceAnchorAudioSec = null;
      lastBoundaryBeat = null;
      return sample(0);
    }

    function pause(audioTimeSec) {
      if (!profile) return makeNoProfile('no-profile-loaded', generation);
      if (!running) return lastSample || sample(Number.isFinite(audioTimeSec) ? audioTimeSec : 0);
      if (!Number.isFinite(audioTimeSec)) return makeNoProfile('invalid-pause-audio-time', generation);
      const frozenTrackTimeSec = (audioTimeSec - sourceAnchorAudioSec) + sourceOffsetTrackSec;
      generation++;
      running = false;
      sourceAnchorAudioSec = null;
      sourceOffsetTrackSec = frozenTrackTimeSec;
      const grid = fixedGrid(frozenTrackTimeSec);
      lastBoundaryBeat = grid ? grid.beatIndex : null;
      return sample(audioTimeSec);
    }

    function resume(audioTimeSec) {
      if (!profile) return makeNoProfile('no-profile-loaded', generation);
      if (running) return sample(Number.isFinite(audioTimeSec) ? audioTimeSec : sourceAnchorAudioSec);
      if (!Number.isFinite(audioTimeSec)) return makeNoProfile('invalid-resume-audio-time', generation);
      generation++;
      running = true;
      sourceAnchorAudioSec = audioTimeSec;
      const grid = fixedGrid(sourceOffsetTrackSec);
      lastBoundaryBeat = grid ? grid.beatIndex : null;
      return sample(audioTimeSec);
    }

    function coordinatedRestart(anchor) {
      if (!profile) return makeNoProfile('no-profile-loaded', generation);
      if (!Number.isFinite(anchor)) return makeNoProfile('invalid-source-anchor', generation);
      generation++;
      running = true;
      sourceAnchorAudioSec = anchor;
      sourceOffsetTrackSec = profile.playback.startTrackSec || 0;
      lastBoundaryBeat = null;
      return sample(anchor);
    }

    function beatDurationSec(grid) {
      return (60 / grid.quarterBpm) * (4 / grid.beatUnit);
    }

    function fixedGrid(trackTimeSec) {
      if (!profile || !profile.timeline || profile.timeline.mode !== 'fixed-tempo') return null;
      const grid = profile.timeline.fixedGrid;
      const gridTime = trackTimeSec - profile.timeline.gridOriginTrackSec;
      if (gridTime < 0) return null;
      const duration = beatDurationSec(grid);
      const beatFloat = gridTime / duration;
      const beatIndex = Math.floor(beatFloat);
      const phraseBeatCount = profile.phrasePresentation && profile.phrasePresentation.beatCount || null;
      return freeze({ beatDurationSec: duration, beatFloat, beatIndex, beatInBar: beatIndex % grid.beatsPerBar, barIndex: Math.floor(beatIndex / grid.beatsPerBar), beatsPerBar: grid.beatsPerBar, beatUnit: grid.beatUnit, phraseBeatCount, phraseProgress: phraseBeatCount ? ((beatFloat % phraseBeatCount) / phraseBeatCount) : null, establishmentBeatCount: profile.legacyCompatibility && profile.legacyCompatibility.establishmentBeatCount || null });
    }

    function sample(audioTimeSec) {
      if (!profile) return makeNoProfile('no-profile-loaded', generation);
      const trackTimeSec = running && sourceAnchorAudioSec != null ? (audioTimeSec - sourceAnchorAudioSec) + sourceOffsetTrackSec : sourceOffsetTrackSec;
      const grid = running ? fixedGrid(trackTimeSec) : null;
      const snapshot = freeze({ status: 'ok', profileId: profile.profileId, metadataStatus: profile.metadataStatus, generation, running, audioTimeSec, sourceAnchorAudioSec, sourceOffsetTrackSec, trackTimeSec, grid, judgmentAvailable: running && !!grid && profile.judgmentRules.length > 0 });
      lastSample = snapshot;
      return snapshot;
    }

    function poll(audioTimeSec) {
      const snapshot = sample(audioTimeSec);
      const events = [];
      if (snapshot.running && snapshot.grid) {
        const beat = snapshot.grid.beatIndex;
        if (lastBoundaryBeat == null) lastBoundaryBeat = beat;
        if (beat > lastBoundaryBeat) {
          const crossed = Math.min(beat - lastBoundaryBeat, 16);
          if (beat - lastBoundaryBeat > crossed) hitches++;
          for (let i = crossed; i >= 1; i--) events.push(freeze({ type: 'beat', beatIndex: beat - i + 1, generation: snapshot.generation, profileId: snapshot.profileId }));
          lastBoundaryBeat = beat;
        }
      }
      const batch = freeze({ snapshot, events, hitches });
      events.forEach(event => boundaryListeners.slice().forEach(listener => listener(event)));
      return batch;
    }

    function judgeInput(ruleId, audioTimeSec, inputOffsetMs = 0) {
      const rule = profile?.judgmentRules?.find(candidate => candidate.id === ruleId);
      // Positive user offset compensates a late physical tap. Source metadata
      // and the saved user setting are applied once, before grid sampling.
      const userOffset = Number.isFinite(inputOffsetMs) ? Math.max(-200, Math.min(200, inputOffsetMs)) : 0;
      const offset = (rule?.calibrationOffsetMs || 0) + userOffset;
      const snapshot = sample(audioTimeSec - offset / 1000);
      if (!snapshot.running || !snapshot.judgmentAvailable || !snapshot.grid) return freeze({ available: false, timing: 'unavailable', generation: snapshot.generation });
      if (!rule) return freeze({ available: false, timing: 'unavailable', generation: snapshot.generation });
      const beatMs = snapshot.grid.beatDurationSec * 1000;
      const phaseMs = (snapshot.grid.beatFloat - Math.floor(snapshot.grid.beatFloat)) * beatMs;
      const distanceMs = Math.min(phaseMs, beatMs - phaseMs);
      const signedOffsetMs = phaseMs <= beatMs / 2 ? phaseMs : phaseMs - beatMs;
      let timing = 'miss';
      // Decimal milliseconds can land a few ulps outside an exact boundary.
      // Keep old profiles byte-for-byte in judgment behavior.
      const toleranceMs=rule.id==='road-pulse-v2'?1e-7:0;
      if (distanceMs <= rule.windowsMs.perfect+toleranceMs) timing = 'perfect';
      else if (distanceMs <= rule.windowsMs.excellent+toleranceMs) timing = 'excellent';
      return freeze({ available: true, timing, distanceMs, signedOffsetMs, beatIndex: Math.round(snapshot.grid.beatFloat), calibrationOffsetMs: offset, ruleId: rule.id, generation: snapshot.generation });
    }

    function getDiagnostics() {
      return freeze({ profileId: currentProfileId(), generation, running, sourceAnchorAudioSec, sourceOffsetTrackSec, listenerCount: boundaryListeners.length, lastSample: clone(lastSample) });
    }

    return freeze({ load, start, stop, pause, resume, coordinatedRestart, sample, poll, judgeInput, getProfileId: currentProfileId, getDiagnostics, onBoundary: function(type, listener) { boundaryListeners.push(listener); return function(){ boundaryListeners = boundaryListeners.filter(item => item !== listener); }; }, getListenerCount: function(){ return boundaryListeners.length; }, getLastSample: function(){ return clone(lastSample); } });
  }

  namespace.MusicTransport = createTransport();
  namespace.createMusicTransport = createTransport;
})(window.BARCODE);
