// A driver's mood persists between events. The shared road update owns time;
// rendering only reads the selected cell of the existing expression atlas.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name:'src/game/cache-road-mirror.js',
  exports:['BARCODE.CacheRoadMirror'], dependencies:[] });
(function(B) {
  'use strict';
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const FRAMES = Object.freeze({calm:0,focused:1,confident:2,'close-pass':3,impact:4,alarm:5});
  const DWELL_MS = 3000, SETTLE_MS = 450, HIT_MS = 700, RECOVER_MS = 1200;
  const REACTION_MS = 2500, REACTION_COOLDOWN_MS = 5000, SYNC_MS = 3000;
  const passClock = input => input.passKind === 'NEAR MISS' || input.passKind === 'CLOSE CUT' ?
    Math.max(0, finite(input.passFlashMs)) : Math.max(0, finite(input.cutFlashMs));
  function create(input = {}) {
    const alarm = finite(input.integrity, 3) <= 1 || finite(input.timeMs, 55000) < 8000;
    const mode = input.status === 'failed' || alarm ? 'alarm' :
      input.status === 'clear' ? 'confident' : 'calm';
    return {mode,frame:FRAMES[mode],ageMs:DWELL_MS,candidate:mode,candidateMs:0,
      hitMs:0,recoverMs:0,reactionMs:0,reactionCooldownMs:0,syncMs:0,alarm,
      lastPulseMs:Math.max(0,finite(input.pulseFlashMs)),lastPassMs:passClock(input),
      lastStumbleMs:Math.max(0,finite(input.stumbleMs))};
  }
  function select(state, mode) {
    if (state.mode !== mode) {state.mode = mode;state.frame = FRAMES[mode];state.ageMs = 0;}
    state.candidate = mode;state.candidateMs = 0;
  }
  // Call only for an actual, unblocked road hit. Repeated draw/pose calls can
  // neither replay this reaction nor extend its brief eyes-closed impact cell.
  function onHit(state, input = {}) {
    if (!state) return;
    state.hitMs = HIT_MS;state.recoverMs = HIT_MS + RECOVER_MS;
    state.reactionMs = 0;state.syncMs = 0;
    state.lastStumbleMs = Math.max(0,finite(input.stumbleMs));
    select(state, 'impact');
  }
  function step(state, delta, input = {}) {
    if (!state) return;
    const dt = Math.max(0, finite(delta));
    // A paused road must not age a face, consume an event, or settle a mood.
    if (!dt) return;
    state.ageMs = Math.min(DWELL_MS,state.ageMs + dt);
    for (const key of ['hitMs','recoverMs','reactionMs','reactionCooldownMs','syncMs'])
      state[key] = Math.max(0, state[key] - dt);

    const pulse = Math.max(0,finite(input.pulseFlashMs)), pass = passClock(input);
    const stumble = Math.max(0,finite(input.stumbleMs));
    if (stumble > state.lastStumbleMs + .001) onHit(state,input);
    state.lastStumbleMs = stumble;
    // A new flash rises above its previous decaying clock. Consecutive earned
    // captures sustain one focused mood instead of alternating every beat.
    if (pulse > state.lastPulseMs + .001) state.syncMs = SYNC_MS;
    const newPass = pass > state.lastPassMs + .001;
    state.lastPulseMs = pulse;state.lastPassMs = pass;

    const integrity = finite(input.integrity,3), timeMs = finite(input.timeMs,55000);
    if (integrity <= 1 || timeMs < 8000) state.alarm = true;
    else if (integrity > 1 && timeMs > 10000) state.alarm = false;
    const threat = input.threat === true || input.rivalWarning === true;
    const confident = finite(input.boostMs) > 0 || input.fullAdrenaline === true;
    if (newPass && !state.reactionCooldownMs && !state.alarm && !threat &&
        !state.hitMs && !state.recoverMs && !confident) {
      state.reactionMs = REACTION_MS;
      state.reactionCooldownMs = REACTION_COOLDOWN_MS;
    }

    // Impact and its deliberate recovery are immediate state transitions.
    // Ordinary driving changes need both a stable cause and a minimum dwell.
    if (state.hitMs) {select(state,'impact');return;}
    if (state.mode === 'impact' && state.recoverMs) {select(state,'focused');return;}
    const desired = input.status === 'failed' ? 'alarm' : input.status === 'clear' ? 'confident' :
      state.alarm ? 'alarm' : state.recoverMs || threat ? 'focused' : confident ? 'confident' :
      state.reactionMs ? 'close-pass' : state.syncMs ? 'focused' : 'calm';
    if (desired === state.mode) {state.candidate = desired;state.candidateMs = 0;return;}
    if (desired !== state.candidate) {state.candidate = desired;state.candidateMs = 0;}
    state.candidateMs = Math.min(SETTLE_MS,state.candidateMs + dt);
    if (input.status === 'failed' || input.status === 'clear' ||
        desired === 'alarm' && state.candidateMs >= SETTLE_MS ||
        state.ageMs >= DWELL_MS && state.candidateMs >= SETTLE_MS) select(state,desired);
  }
  function expression(state, input = {}) {
    // Results may stop the update owner immediately; they still show the
    // correct fixed terminal mood without advancing presentation in draw.
    if (input.status === 'failed') return FRAMES.alarm;
    if (input.status === 'clear') return FRAMES.confident;
    return state?.frame ?? FRAMES.calm;
  }
  B.CacheRoadMirror = Object.freeze({create,step,onHit,expression,frames:FRAMES,
    timing:Object.freeze({dwellMs:DWELL_MS,settleMs:SETTLE_MS,hitMs:HIT_MS,
      recoverMs:RECOVER_MS,reactionCooldownMs:REACTION_COOLDOWN_MS})});
})(window.BARCODE = window.BARCODE || {});
