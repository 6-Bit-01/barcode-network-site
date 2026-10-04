// Temporary, code-generated proof music. No Level 1 source or timing is reused.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/engine/broadcast-slum-proof-profile.js', exports: ['BARCODE.BROADCAST_SLUM_PROOF_PROFILE_ID'], dependencies: ['BARCODE.MusicProfiles'] });
(function(B) {
  B.BROADCAST_SLUM_PROOF_PROFILE_ID = 'level-03.proof';
  B.MusicProfiles.register({
    profileId: 'level-03.proof', levelId: 'level-03', runtimeRegistration: true,
    metadataStatus: 'unverified',
    arrangement: { sources: [
      { sourceId: 'slum-carrier', mixRole: 'bed', assetId: 'audio.proof.slum-carrier', url: 'assets/audio/broadcast-slum-proof-carrier.wav', required: true, gain: 0.44, offsetSec: 0, nativeLoop: true, fallbackRole: 'required-or-degraded', playbackPolicy: 'start-synchronously' },
      { sourceId: 'slum-pressure', mixRole: 'pressure', assetId: 'audio.proof.slum-pressure', url: 'assets/audio/broadcast-slum-proof-pressure.wav', required: true, gain: 0.12, offsetSec: 0, nativeLoop: true, fallbackRole: 'required-or-degraded', playbackPolicy: 'start-synchronously' }
    ] },
    adaptiveMix: { colourRole: 'pressure', fadeSec: 0.25,
      states: {
        explore: { bed: 0.44, pressure: 0.08 }, combat: { bed: 0.44, pressure: 0.52 },
        victory: { bed: 0.3, pressure: 0.14 }, legacyExplore: { bed: 0.44, pressure: 0.08 },
        legacyCombat: { bed: 0.44, pressure: 0.52 }, legacyRhythm: { bed: 0.44, pressure: 0.52 },
        legacyRhythmSolo: { bed: 0.44, pressure: 0.08 }
      },
      filterHz: { explore: 3400, combat: 8500, victory: 2200 },
      phraseVariants: [{ pressure: 1 }, { pressure: 0.9 }],
      echo: { wet: 0.12, feedback: 0.1, send: 0.18 }
    },
    playback: { startTrackSec: 0, loop: null, endPolicy: 'native-loop' },
    timeline: { mode: 'fixed-tempo', gridOriginTrackSec: 0, fixedGrid: { quarterBpm: 108, beatsPerBar: 4, beatUnit: 4 } },
    phrasePresentation: { barsPerPhrase: 4, beatCount: 16 }, judgmentRules: []
  });
})(window.BARCODE = window.BARCODE || {});
