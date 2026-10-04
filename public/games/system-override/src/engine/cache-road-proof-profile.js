// Owner-supplied, aligned parts for Cache Back's road/mix interaction proof.
// These are one song's compatible parts, not campaign Stem Keys or Level 1 audio.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/engine/cache-road-proof-profile.js', exports: ['BARCODE.CACHE_ROAD_PROOF_PROFILE_ID'], dependencies: ['BARCODE.MusicProfiles'] });
(function(B) {
  // Some preview imports omit binary assets; use the identical published
  // revision if the first-party URL cannot be decoded on that host.
  const publishedAudio = './assets/audio/';
  const source = (name, role) => ({ sourceId: `cache-${name}`, mixRole: role,
    assetId: `audio.proof.cache-${name}`, url: `assets/audio/cache-${name}.mp3`,

    required: true, gain: 0, offsetSec: 0, nativeLoop: true,
    fallbackRole: 'required-or-degraded', playbackPolicy: 'start-synchronously' });
  B.CACHE_ROAD_PROOF_PROFILE_ID = 'level-02.proof';
  B.MusicProfiles.register({
    profileId: B.CACHE_ROAD_PROOF_PROFILE_ID, levelId: 'level-02', runtimeRegistration: true,
    // Recording grid verified against all five decoded sources; device latency
    // and physical controller feel are separate from this metadata contract.
    metadataStatus: 'verified',
    arrangement: { sources: [source('drive', 'drive'), source('pressure', 'pressure'),
      source('flow', 'flow'), source('breakaway', 'breakaway'),
      source('undercurrent', 'undercurrent')] },
    // All five sources start together. The live road supplies short captured
    // bar spans; softer recorded passages remain selectable throughout.
    laneMix: { laneRoles: ['drive', 'flow', 'breakaway', 'undercurrent'],
      backboneRole: 'pressure', idle: { drive: 0.10, flow: 0.18 },
      captureFadeSec: 0.22, releaseFadeSec: 0.38,
      // Fresh chapter rules make each earned part a clear entrance while
      // keeping drums and two quiet support parts underneath the drive.
      // Older checkpoints retain their original beds and transitions.
      reactive: { version: 2, idle: { drive: 0.03, flow: 0.045 },
        captureFadeSec: 0.11, releaseFadeSec: 0.30, captureBars: 3, comboBars: 6 },
      levels: { pressure: 0.60, drive: 0.19, flow: 0.55,
        breakaway: 0.50, undercurrent: 0.62 } },
    playback: { startTrackSec: 0, loop: null, endPolicy: 'native-loop' },
    timeline: { mode: 'fixed-tempo', gridOriginTrackSec: 0,
      fixedGrid: { quarterBpm: 128, beatsPerBar: 4, beatUnit: 4 } },
    phrasePresentation: { barsPerPhrase: 4, beatCount: 16 },
    judgmentRules: [{ id: 'road-pulse', target: 'lane-pulse',
      windowsMs: { perfect: 70, excellent: 130 }, calibrationOffsetMs: 0 },
      { id: 'road-pulse-v2', target: 'lane-pulse',
        windowsMs: { perfect: 70, excellent: 180 }, calibrationOffsetMs: 0 }]
  });
})(window.BARCODE = window.BARCODE || {});
