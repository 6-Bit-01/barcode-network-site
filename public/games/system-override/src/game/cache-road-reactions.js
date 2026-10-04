// One world-space reaction for the road, rearview and contact resolver.
// The road owns clocks, ability consumption, damage, score and sound.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-reactions.js',
  exports: ['BARCODE.CacheRoadReactions'], dependencies: [] });
(function(B) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const smooth = n => n * n * (3 - 2 * n);
  const CLEARANCE = 42;
  function key(actor) {
    return typeof actor?.id === 'string' ? actor.id :
      `${finite(actor?.at)}/${finite(actor?.lane)}/${actor?.kind || 'traffic'}`;
  }
  function pose(state, actor, baseLane = actor?.lane) {
    const id = key(actor), reaction = state?.actorReactions?.[id];
    if (!reaction) return { id, at: finite(actor?.at), lane: finite(baseLane),
      alpha: 1, steer: 0, collidable: true, kind: null, phase: 0 };
    const age = Math.max(0, finite(state.elapsedMs) - reaction.startedAt);
    const u = clamp(age / reaction.moveMs, 0, 1);
    const fade = clamp((age - reaction.fadeStartMs) /
      (reaction.durationMs - reaction.fadeStartMs), 0, 1);
    // A shove has an immediate velocity impulse, not an accelerating ease-in
    // that would drop behind Cache and then pop back into the front camera.
    const travelProgress = reaction.kind === 'push' ? 1 - (1 - u) * (1 - u) : smooth(u);
    return { id, at: reaction.at + reaction.travel * travelProgress,
      lane: reaction.lane + reaction.lateral * smooth(u),
      alpha: 1 - smooth(fade), steer: reaction.lateral * Math.sin(u * Math.PI),
      collidable: false, kind: reaction.kind, phase: u };
  }
  function onHit(state, actor, options = {}) {
    if (!state || !actor || !['push', 'brace', 'crash'].includes(options.kind)) return null;
    const id = key(actor);
    const reactions = state.actorReactions || (state.actorReactions = {});
    // A paired collision or repeated frame cannot restart a cleared actor.
    if (Object.hasOwn(reactions, id)) return reactions[id];
    const kind = options.kind;
    const lane = finite(options.baseLane, finite(actor.lane));
    const at = finite(options.at, finite(actor.at));
    const push = kind === 'push';
    // Only an explicitly reserved shoulder can receive a lateral shove.
    // The current road's narrow shoulder cannot fit a whole freight sprite;
    // its vehicles accelerate along their lane without clipping street props.
    const lateral = push && options.shoulderClear === true ?
      lane <= .15 ? -.65 : lane >= 2.85 ? .65 : 0 : 0;
    let travel = push ? 54 : kind === 'brace' ? 12 : 5;
    for (const other of options.actors || []) {
      if (!other || key(other) === id || other.alpha === 0 ||
          !Number.isFinite(other.at) || other.at <= at) continue;
      // Reserve the swept lane until the sprite has fully faded. Use poses
      // from the caller so moving/previously displaced actors agree with view.
      const otherLane = finite(other.lane);
      const low = Math.min(lane, lane + lateral) - .85;
      const high = Math.max(lane, lane + lateral) + .85;
      if (otherLane >= low && otherLane <= high)
        travel = Math.min(travel, Math.max(0, other.at - at - CLEARANCE));
    }
    const reaction = reactions[id] = { kind, startedAt: finite(state.elapsedMs), at, lane,
      travel, lateral, moveMs: push ? 650 : kind === 'brace' ? 380 : 280,
      fadeStartMs: push ? 210 : 150, durationMs: push ? 900 : 650 };
    state.reactionRecoilMs = Math.max(state.reactionRecoilMs || 0,
      kind === 'brace' ? 420 : kind === 'push' ? 300 : 520);
    state.reactionRecoilKind = kind;
    state.reactionRecoilSide = Math.sign(lane - finite(state.lanePos, lane)) ||
      (lane < 1.5 ? -1 : 1);
    return reaction;
  }
  function recoverCapture(state, options = {}) {
    const struckLane = Math.round(finite(options.struckLane, finite(state.lanePos)));
    const captures = state.captures || (state.captures = []);
    const candidates = captures.map((capture, index) => ({ capture, index }));
    candidates.sort((a, b) => Number(b.capture.lane === struckLane) -
      Number(a.capture.lane === struckLane) ||
      finite(a.capture.endBeat) - finite(b.capture.endBeat) ||
      finite(a.capture.lane) - finite(b.capture.lane));
    const lost = candidates[0];
    if (lost) captures.splice(lost.index, 1);
    const lostLane = lost ? lost.capture.lane : null;
    state.lostCaptureLane = lostLane;
    state.lostCaptureMs = lost ? 900 : 0;
    state.fullAdrenaline = captures.length === 4;
    // Leave queued awards alone: a successful, already judged input remains
    // earned. The crash only breaks one live part, never the whole arrangement.
    state.hitRecovery = true;
    state.hitRecoveryUntilBeat = finite(state.musicBeatFloat) + 1;
    return lostLane;
  }
  function step(state, dt) {
    if (!state) return;
    const elapsed = Math.max(0, finite(dt));
    state.reactionRecoilMs = Math.max(0, (state.reactionRecoilMs || 0) - elapsed);
    state.lostCaptureMs = Math.max(0, (state.lostCaptureMs || 0) - elapsed);
    if (Number.isFinite(state.hitRecoveryUntilBeat) &&
        finite(state.musicBeatFloat) >= state.hitRecoveryUntilBeat) {
      state.hitRecovery = false;
      state.hitRecoveryUntilBeat = null;
    }
    // Keep each one-shot identity through both forward and rearview ranges;
    // pruning behind them cannot resurrect visible or collidable traffic.
    for (const [id, reaction] of Object.entries(state.actorReactions || {}))
      if (reaction.at + reaction.travel < finite(state.progress) - 720)
        delete state.actorReactions[id];
  }
  B.CacheRoadReactions = Object.freeze({ key, pose, onHit, recoverCapture, step,
    clearance: CLEARANCE });
})(window.BARCODE);
