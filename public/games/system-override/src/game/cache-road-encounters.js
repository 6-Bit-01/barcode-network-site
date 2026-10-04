// Song-directed encounter reveals. Once a bar is committed, every traffic
// contact and pulse address stays in the world through later speed changes.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-encounters.js',
  exports: ['BARCODE.CacheRoadEncounters'], dependencies: [] });
(function(B) {
  'use strict';
  const VERSION = 3, REVEAL_DISTANCE = 440, MAX_ADDRESS = 16000;
  const KINDS = ['freight', 'van', 'block', 'sweeper', 'trike', 'audit', 'shuttle'];
  const SETTINGS = Object.freeze({
    relaxed: Object.freeze({ id: 'relaxed', maxIntegrity: 4, collisionScale: .88,
      recoveryMs: 1800, minimumRowGap: 118, contactSpacingBars: 4 }),
    standard: Object.freeze({ id: 'standard', maxIntegrity: 3, collisionScale: 1,
      recoveryMs: 1450, minimumRowGap: 92, contactSpacingBars: 2 }),
    overclocked: Object.freeze({ id: 'overclocked', maxIntegrity: 3, collisionScale: 1.04,
      recoveryMs: 1100, minimumRowGap: 74, contactSpacingBars: 2 })
  });
  const LIVE_SETTINGS = Object.freeze({
    relaxed: Object.freeze({ ...SETTINGS.relaxed, minimumRowGap: 112 }),
    standard: Object.freeze({ ...SETTINGS.standard, minimumRowGap: 82 }),
    overclocked: Object.freeze({ ...SETTINGS.overclocked, minimumRowGap: 62 })
  });
  const supportedVersion = version => version === 1 || version === 2 || version === VERSION;
  const ACTS = Object.freeze([
    Object.freeze({ id: 'intro', label: 'NIGHT DEPARTURE', startBar: 0, endBar: 4 }),
    Object.freeze({ id: 'escape', label: 'CITY ESCAPE', startBar: 4, endBar: 28 }),
    Object.freeze({ id: 'freight', label: 'FREIGHT CORRIDOR', startBar: 28, endBar: 52 }),
    Object.freeze({ id: 'surveillance', label: 'AUDIT GRID', startBar: 52, endBar: 76 }),
    Object.freeze({ id: 'pursuit', label: 'FINAL PURSUIT', startBar: 76, endBar: 92 }),
    Object.freeze({ id: 'delivery', label: 'DELIVERY RUNWAY', startBar: 92, endBar: 100 }),
    Object.freeze({ id: 'complete', label: 'DELIVERED', startBar: 100, endBar: 101 })
  ]);
  const BREAK_ACTS = Object.freeze([
    Object.freeze({id:'intro',label:'NIGHT DEPARTURE',startBar:0,endBar:4}),
    Object.freeze({id:'escape',label:'SCOUT PURSUIT',startBar:4,endBar:28}),
    Object.freeze({id:'freight',label:'CONVOY PRESSURE',startBar:28,endBar:52}),
    Object.freeze({id:'surveillance',label:'INTERCEPT GRID',startBar:52,endBar:72}),
    Object.freeze({id:'pursuit',label:'BREAK THE PURSUIT',startBar:72,endBar:96}),
    Object.freeze({id:'delivery',label:'BREAKAWAY RUNWAY',startBar:96,endBar:100}),
    Object.freeze({id:'complete',label:'ORIGINAL DELIVERED',startBar:100,endBar:101})
  ]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
  const address = value => Number.isFinite(value) && value >= 0 && value <= MAX_ADDRESS;
  function difficulty(id, version = VERSION) {
    const settings = version === 1 ? SETTINGS : LIVE_SETTINGS;
    return Object.hasOwn(settings, id) ? settings[id] : settings.standard;
  }
  function act(bar, version = 2) {
    const measure = Number.isFinite(bar) ? Math.max(0, bar) : 0;
    const acts = version === 3 ? BREAK_ACTS : ACTS;
    const info = acts.find(item => measure < item.endBar) || acts.at(-1);
    const phase = Math.max(0, (Math.floor(measure) - 4) % 24);
    return { ...info, chorus: measure >= 4 && measure < 100 && phase >= 16,
      phrase: measure < 4 ? 0 : Math.floor((measure - 4) / 8), phase };
  }
  function create(difficultyId = 'standard', version = VERSION) {
    return { version: supportedVersion(version) ? version : VERSION, difficultyId: difficulty(difficultyId, version).id,
      rows: [], pulses: [], committedBars: [], lastLane: 1, laneDirection: 1 };
  }
  // Same analytic integral as the road: this module never predicts a future
  // gear. Only the section already owned by the audio clock is sampled.
  function endpoint(section) {
    const age = 4 * section.beatSec, blend = .75 * section.beatSec;
    return section.from + section.v0 * blend +
      (section.speed - section.v0) * blend / 2 + section.speed * (age - blend);
  }
  function sectionBar(section) {
    if (!object(section) || !integer(section.beat, 0, 396) || section.beat % 4 ||
        !address(section.from) || !Number.isFinite(section.beatSec) || section.beatSec <= 0 ||
        section.beatSec > 2 || !Number.isFinite(section.v0) || section.v0 < 0 || section.v0 > 150 ||
        !Number.isFinite(section.speed) || section.speed < 0 || section.speed > 150) return null;
    return section.beat / 4;
  }
  function hazards(chart) { return chart?.rows?.flatMap(row => row.actors) || []; }
  function pulses(chart) { return chart?.pulses || []; }
  function occupiedLanes(actor) {
    const other = Number.isInteger(actor.mergeLane) ? actor.mergeLane : actor.lane;
    const low = Math.min(actor.lane, other), high = Math.max(actor.lane, other);
    return [0, 1, 2, 3].filter(lane => lane >= low && lane <= high);
  }
  function rowDue(bar, settings, version) {
    if(version===3) {
      // The boss supplies the final pressure. Last civilian reveals clear
      // its approach in the slowest gear, instead of trapping a committed
      // counter between a rig strike and a hidden freight row.
      if(bar<4||bar>68)return false;
      const interval=settings.id==='relaxed'?4:settings.id==='standard'?2:1;
      return bar%interval===0;
    }
    if (version === 2) {
      // Even first gear clears a 440-unit reveal from bar 84 before the
      // bar-92 delivery split. The intro and final exit retain their runway.
      if (bar < 4 || bar > 84) return false;
      return bar % (settings.id === 'relaxed' ? 4 : settings.id === 'standard' ? 2 : 1) === 0;
    }
    if (bar < 4 || bar >= 69 || (bar >= 50 && bar <= 62)) return false;
    // The Echo lesson (58) and final pursuit (77/83/88) own open road. At
    // minimum driving speed the last 440-unit civilian reveal clears before
    // either event. Chorus reveals halve ordinary traffic density.
    const chorus = act(bar).chorus;
    if (settings.id === 'relaxed') return bar % (chorus ? 8 : 4) === 0;
    if (settings.id === 'standard') return bar % (chorus ? 4 : 2) === 0;
    return chorus ? bar % 4 === 0 : bar % 2 === 0 || bar % 8 === 5;
  }
  function rowActors(bar, settings) {
    const scene = act(bar), turn = Math.floor((bar - 4) / 2), side = turn % 2 ? 3 : 0;
    if (scene.id === 'escape') {
      const kind = ['van', 'freight', 'trike', 'shuttle'][turn % 4];
      const lane = [0, 3, 1, 2][Math.floor(turn / 2) % 4];
      // A single merge takes exactly one neighboring lane. The whole swept
      // interval is reserved when choosing the next musical route.
      const actor = { kind, lane };
      if (kind === 'trike') Object.assign(actor, { mergeLane: lane === 3 ? 2 : lane + 1,
        warningDistance: 205, mergeDistance: 125 });
      const actors = [actor];
      if (settings.id === 'overclocked' && kind !== 'trike')
        actors.push({ kind: 'van', lane: lane < 2 ? 3 : 0 });
      return actors;
    }
    if (scene.id === 'freight') {
      const pair = turn % 3;
      const specs = pair === 0 ? [{ kind: 'freight', lane: 0 }, { kind: 'shuttle', lane: 3 }] :
        pair === 1 ? [{ kind: 'freight', lane: 3 }, { kind: 'van', lane: 2 }] :
          [{ kind: 'shuttle', lane: 0 }, { kind: 'block', lane: 1 }];
      return settings.id === 'relaxed' ? specs.slice(0, 1) : specs;
    }
    // Audit cars are visibly committed to authored lanes; only the separate
    // staged pursuer targets a replay. Free tracking here could erase a lane
    // already promised to a musical cue.
    const specs = [{ kind: 'audit', lane: side }];
    if (settings.id !== 'relaxed') specs.push({ kind: 'van', lane: side === 0 ? 3 : 0 });
    return specs;
  }
  function sharesUpcomingPursuit(section, settings, version) {
    const pursuit = B.CacheRoadPursuit, waves = pursuit?.wavesFor?.(version) || pursuit?.waves || [];
    const lead = (pursuit?.tuningFor?.(version) || pursuit?.tuning)?.[settings.id]?.lead;
    if (!Number.isFinite(lead)) return false;
    const bar = section.beat / 4, committed = endpoint(section) - section.from;
    // The current bar is already fixed. Bound only the uncommitted bars by
    // the actual slowest gear and maximum Turbo speed, instead of guessing
    // which future gear the driver will choose. A single edge-lane vehicle
    // leaves room for the rival, a music pad AND an adjacent escape.
    return waves.some(wave => {
      const remaining = wave.bar - bar;
      if (remaining < 1) return false;
      const seconds = (remaining - 1) * 4 * section.beatSec;
      const earliest = committed + 30 * seconds + lead;
      const latest = committed + pursuit.maxSpeed * seconds + lead;
      return REVEAL_DISTANCE >= earliest - 90 && REVEAL_DISTANCE <= latest + 90;
    });
  }
  function liveRowActors(chart, bar, settings, section) {
    const ordinal = chart.rows.length, scene = act(bar,chart.version);
    // Each convoy leaves TWO ADJACENT lanes free. Successive pairs share a
    // free lane, so a driver never has to cross an entire road between rows.
    // The pursuer's existing chooseLane() also checks these same bodies and
    // can use one open lane while retaining the adjacent escape corridor.
    // Keep each opening for a complete four-bar phrase. Switching every
    // traffic row trapped dense-road music cues in the two center lanes:
    // adjacent convoys closed an edge before a driver could reach its pad.
    // Four bars allow successive one-lane cues to reach either road edge.
    const pair = [[0, 1], [0, 3], [2, 3], [0, 3]][Math.floor((bar-4)/4) % 4];
    const kinds = scene.id === 'escape' ? ['van', 'freight', 'van', 'shuttle'] :
      scene.id === 'freight' ? ['freight', 'shuttle', 'van', 'freight'] :
        ['audit', 'van', 'shuttle', 'freight'];
    const kind = scene.id === 'escape' && Math.abs(pair[0]-pair[1]) === 1 && ordinal%3 === 2 ?
      'trike' : kinds[ordinal % kinds.length];
    if (sharesUpcomingPursuit(section, settings, chart.version))
      return [{ kind: scene.id === 'surveillance' ? 'van' : kind === 'trike' ? 'van' : kind, lane: 0 }];
    const doubled = settings.id === 'overclocked' ||
      settings.id === 'standard' && (scene.id !== 'escape' || ordinal % 3 === 2);
    if (kind === 'trike' && Math.abs(pair[0] - pair[1]) === 1)
      return [{ kind, lane: pair[0], mergeLane: pair[1], warningDistance: 205, mergeDistance: 125 }];
    const actors = [{ kind, lane: pair[ordinal % 2] }];
    if (doubled) actors.push({ kind: ordinal % 2 ? 'van' : 'shuttle', lane: pair[1 - ordinal % 2] });
    return actors;
  }
  function safeLiveSpecs(chart, specs, at, protectedActors, reservedPursuit) {
    const reservations = [...(Array.isArray(protectedActors) ? protectedActors : [])];
    if (reservedPursuit) reservations.push({ ...reservedPursuit, locked: true });
    const nearby = reservations.filter(actor => actor && !actor.crossed && actor.locked &&
      Number.isFinite(actor.at) && Math.abs(actor.at - at) <= 90);
    const protectedLanes = new Set(chart.pulses.filter(pulse => Math.abs(pulse.at - at) <= 90)
      .map(pulse => pulse.lane));
    for (const actor of nearby) {
      const target = actor.targetLane ?? actor.lockLane ?? actor.lane;
      const current = Number.isFinite(actor.lane) ? actor.lane : target;
      if (!Number.isFinite(target)) continue;
      for (const lane of [0, 1, 2, 3])
        if (lane >= Math.min(current, target) - .65 && lane <= Math.max(current, target) + .65)
          protectedLanes.add(lane);
      // Preserve the closest available neighbor as the rival's visible
      // escape. A newly issued civilian row must not close that corridor.
      const escape = [target - 1, target + 1].find(lane => integer(lane, 0, 3) &&
        !hazards(chart).some(other => Math.abs(other.at - at) <= 90 && occupiedLanes(other).includes(lane)));
      if (escape !== undefined) protectedLanes.add(escape);
    }
    specs = specs.filter(spec => !occupiedLanes(spec).some(lane => protectedLanes.has(lane)));
    // Adjacent rows can overlap in a collision/steering envelope. Keep one
    // lane free across that whole local contact group, not just within a row.
    const previous = hazards(chart).filter(actor => Math.abs(actor.at - at) < 90);
    while (specs.length && new Set([...previous, ...specs].flatMap(occupiedLanes)).size >= 4) specs.pop();
    return specs;
  }
  function ensure(chart, section, reservedPulse, { protectedActors = [], reservedPursuit } = {}) {
    const bar = sectionBar(section);
    if (bar === null || !supportedVersion(chart?.version) || chart.rows.some(row => row.bar === bar)) return null;
    const settings = difficulty(chart.difficultyId, chart.version);
    if (!rowDue(bar, settings, chart.version)) return null;
    const at = section.from + REVEAL_DISTANCE, previous = chart.rows.at(-1);
    if (!address(at) || (previous && at - previous.at < settings.minimumRowGap)) return null;
    let specs = chart.version === 1 ? rowActors(bar, settings) : liveRowActors(chart, bar, settings, section);
    if (chart.version >= 2) specs = safeLiveSpecs(chart, specs, at, protectedActors, reservedPursuit);
    if (reservedPulse && Math.abs(reservedPulse.at - at) < 70)
      specs = specs.filter(spec => !occupiedLanes(spec).includes(reservedPulse.lane));
    if (!specs.length) return null;
    const info = act(bar,chart.version);
    const actors = specs.map((spec, index) => Object.freeze({ ...spec, at, bar, act: info.id,
      id: `traffic/${bar}/${index}`, encounter: true }));
    const row = Object.freeze({ id: `row/${bar}`, at, bar, act: info.id, actors: Object.freeze(actors) });
    chart.rows.push(row);
    return row;
  }
  function pulseDue(bar,version=2) {
    if(version===3) {
      if(bar<4||bar>=99)return false;
      // Boss rounds continue the existing earned-action vocabulary. A
      // missed opportunity is followed by another offer, never a mandatory
      // consumable check or a silent six-bar exit blackout.
      return act(bar,version).chorus||bar%2===0;
    }
    // The 150-unit delivery gate takes until bar 94.67 in first gear.
    // Keep its entire approach free of new cues which could pull Cache out
    // of the right lane; reward pulses return only after every gear clears.
    if (bar < 4 || bar >= 99 || (bar >= 90 && bar < 96)) return false;
    if (bar >= 96) return bar % 2 === 0;
    return act(bar).chorus || bar % 2 === 0;
  }
  function pulse(chart, section, strikeDistance, { protectedActors = [], reservedPursuit } = {}) {
    const bar = sectionBar(section);
    if (bar === null || !supportedVersion(chart?.version) || !Number.isFinite(strikeDistance) ||
        Math.abs(strikeDistance) > 100 || !pulseDue(bar,chart.version)) return null;
    const existing = chart.pulses.find(item => item.bar === bar);
    if (existing) return existing;
    const at = endpoint(section) + strikeDistance;
    if (!address(at)) return null;
    const blocked = new Set(hazards(chart).filter(actor =>
      actor.at >= section.from - 18 && actor.at <= at + 36).flatMap(occupiedLanes));
    // A rival lane already locked by its visible warning is another fixed
    // promise. Avoid it instead of forcing the pursuit to silently disappear
    // when a later bar commits a musical cue.
    const reservations = [...(Array.isArray(protectedActors) ? protectedActors : [])];
    if (reservedPursuit) reservations.push({ ...reservedPursuit, locked: true });
    for (const actor of reservations) {
      if (!actor?.locked || actor.crossed || !Number.isFinite(actor.at) || Math.abs(actor.at - at) > 90) continue;
      const targetLane = actor.targetLane ?? actor.lockLane ?? actor.lane;
      const currentLane = Number.isFinite(actor.lane) ? actor.lane : targetLane;
      if (!Number.isFinite(targetLane)) continue;
      for (const lane of [0, 1, 2, 3])
        if (lane >= Math.min(currentLane, targetLane) - .65 && lane <= Math.max(currentLane, targetLane) + .65)
          blocked.add(lane);
    }
    let direction = chart.laneDirection;
    if (chart.lastLane === 3) direction = -1;
    if (chart.lastLane === 0) direction = 1;
    const options = [chart.lastLane + direction, chart.lastLane, chart.lastLane - direction]
      .filter(lane => integer(lane, 0, 3) && !blocked.has(lane));
    // Never force a two/three-lane scramble to retain a chart count. A rare
    // blocked beat stays quiet, with the next cue still one lane away.
    if (!options.length) return null;
    const lane = options[0], info = act(bar,chart.version), run = `song/${info.phrase}`;
    const previous = chart.pulses.at(-1);
    const order = previous?.run === run ? previous.order + 1 : 0;
    const actionCycle = info.id === 'freight' ? [1, 2, 3, 0] :
      info.id === 'surveillance' || info.id === 'pursuit' ? [3, 2, 0, 1] : [0, 2, 3, 1];
    const value = Object.freeze({ id: `song/${bar}`, run, order, action: actionCycle[order % 4],
      lane, at, target: section.beat + 4, bar, act: info.id, encounter: true });
    chart.pulses.push(value); chart.lastLane = lane; chart.laneDirection = direction;
    return value;
  }
  function commit(chart, section, strikeDistance, { allowPulse = true, protectedActors = [], reservedPursuit } = {}) {
    const bar = sectionBar(section);
    if (bar === null || !supportedVersion(chart?.version)) return { row: null, pulse: null };
    if (chart.committedBars.includes(bar)) return { row: chart.rows.find(row => row.bar === bar) || null,
      pulse: chart.pulses.find(item => item.bar === bar) || null };
    const row = ensure(chart, section, null, { protectedActors, reservedPursuit });
    const issued = allowPulse ? pulse(chart, section, strikeDistance, { protectedActors, reservedPursuit }) : null;
    chart.committedBars.push(bar);
    return { row, pulse: issued };
  }
  function snapshot(chart) { return supportedVersion(chart?.version) ? clone(chart) : null; }
  function restore(raw, difficultyId = raw?.difficultyId) {
    if (!object(raw) || !supportedVersion(raw.version) || !Object.hasOwn(SETTINGS, raw.difficultyId) ||
        raw.difficultyId !== difficulty(difficultyId).id || !Array.isArray(raw.rows) || raw.rows.length > 100 ||
        !Array.isArray(raw.pulses) || raw.pulses.length > 100 || !Array.isArray(raw.committedBars) ||
        raw.committedBars.length > 100 || raw.committedBars.some(bar => !integer(bar, 0, 99)) ||
        new Set(raw.committedBars).size !== raw.committedBars.length || !integer(raw.lastLane, 0, 3) ||
        ![-1, 1].includes(raw.laneDirection)) return null;
    const chart = create(raw.difficultyId, raw.version), actorIds = new Set(), rowBars = new Set(), pulseBars = new Set();
    for (const row of raw.rows) {
      if (!object(row) || !integer(row.bar, 0, 99) || !raw.committedBars.includes(row.bar) ||
          rowBars.has(row.bar) || row.id !== `row/${row.bar}` || !address(row.at) || row.act !== act(row.bar,raw.version).id ||
          !Array.isArray(row.actors) || !row.actors.length || row.actors.length > 2 ||
          (chart.rows.length && row.at - chart.rows.at(-1).at < difficulty(raw.difficultyId, raw.version).minimumRowGap)) return null;
      const actors = [];
      for (let index = 0; index < row.actors.length; index++) {
        const actor = row.actors[index];
        if (!object(actor) || actor.id !== `traffic/${row.bar}/${index}` || actorIds.has(actor.id) ||
            actor.at !== row.at || actor.bar !== row.bar || actor.act !== row.act || actor.encounter !== true ||
            !KINDS.includes(actor.kind) || !integer(actor.lane, 0, 3) ||
            (actor.mergeLane !== undefined && (!integer(actor.mergeLane, 0, 3) ||
              Math.abs(actor.mergeLane - actor.lane) !== 1 || actor.warningDistance !== 205 || actor.mergeDistance !== 125))) return null;
        const safe = { kind: actor.kind, lane: actor.lane, at: actor.at, bar: actor.bar,
          act: actor.act, id: actor.id, encounter: true };
        if (actor.mergeLane !== undefined) Object.assign(safe, { mergeLane: actor.mergeLane,
          warningDistance: actor.warningDistance, mergeDistance: actor.mergeDistance });
        actors.push(Object.freeze(safe)); actorIds.add(actor.id);
      }
      if (new Set(actors.flatMap(occupiedLanes)).size > 2) return null;
      chart.rows.push(Object.freeze({ id: row.id, at: row.at, bar: row.bar,
        act: row.act, actors: Object.freeze(actors) })); rowBars.add(row.bar);
    }
    for (const item of raw.pulses) {
      if (!object(item) || !integer(item.bar, 0, 98) || !raw.committedBars.includes(item.bar) ||
          pulseBars.has(item.bar) || item.id !== `song/${item.bar}` || item.run !== `song/${act(item.bar,raw.version).phrase}` ||
          !integer(item.order, 0, 7) || !integer(item.action, 0, 3) || !integer(item.lane, 0, 3) ||
          !address(item.at) || item.target !== (item.bar + 1) * 4 || item.act !== act(item.bar,raw.version).id ||
          item.encounter !== true || Math.abs(item.lane - (chart.pulses.at(-1)?.lane ?? 1)) > 1 ||
          (chart.pulses.length && item.bar <= chart.pulses.at(-1).bar)) return null;
      chart.pulses.push(Object.freeze({ id: item.id, run: item.run, order: item.order,
        action: item.action, lane: item.lane, at: item.at, target: item.target,
        bar: item.bar, act: item.act, encounter: true })); pulseBars.add(item.bar);
    }
    if (chart.pulses.length && chart.pulses.at(-1).lane !== raw.lastLane) return null;
    chart.committedBars = [...raw.committedBars]; chart.lastLane = raw.lastLane;
    chart.laneDirection = raw.laneDirection;
    return chart;
  }
  B.CacheRoadEncounters = Object.freeze({ version: VERSION, revealDistance: REVEAL_DISTANCE,
    create, commit, ensure, pulse, pulses, hazards, occupiedLanes, act, difficulty, snapshot, restore, supportedVersion });
})(window.BARCODE = window.BARCODE || {});
