// Private Mac preview story data and reading state. No save, render, audio or input owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/mac-street-story.js', exports: ['BARCODE.MacStreetStory'], dependencies: [] });
(function(B) {
  'use strict';
  const line = (speaker, text) => ({ speaker, text });
  const INTRO = [
    { id: 'delivered', title: 'ORIGINAL DELIVERED', asset: 'assets/cache-ending/ending-01-delivered.webp',
      visual: 'Cache protects the complete original beside the receiving equipment.',
      lines: [line('CACHE BACK', 'Original delivered. Names, room noise, all of it.')] },
    { id: 'unverified', title: 'DELIVERED / UNVERIFIED', asset: 'assets/cache-ending/ending-02-unverified.webp',
      visual: 'Transfer is delivered; the separate outbound distribution channel remains unverified.',
      lines: [line('MAC MODEM / COMMS', 'Delivery passed. Distribution is still UNVERIFIED.')] },
    { id: 'kave-dead-air', title: "KAVE'S DEAD AIR", asset: 'assets/mac-street-review/scene03-kave-dead-air-v5.png',
      visual: 'Kave tends the Kaveman Radio review desk inside a fully enclosed, ordinary-scale broadcast studio.',
      artLocation: 'enclosed-broadcast-studio', artTime: 'present', dialogueContext: 'studio-and-live-comms',
      lines: [line('KAVE', "Artists are waiting. Local monitoring works; the outbound feed doesn't.")] },
    { id: 'held', title: 'THE HOLD IS LOCAL', asset: 'assets/cache-ending/ending-03-held.webp',
      visual: 'An earlier studio comparison shows DJ and Mac together; the present crew dialogue continues over comms.',
      artLabel: 'EARLIER / STUDIO COMPARISON', artLocation: 'studio', artTime: 'earlier-comparison', dialogueContext: 'live-comms',
      lines: [line('DJ FLOPPYDISC / COMMS', "The original is whole. The distribution hold is here, on the line out.")] },
    { id: 'margin-note', title: 'A NOTE IN THE MARGIN', asset: 'assets/mac-street-review/scene05-margin-note-v1.png',
      visual: 'A hand pastes a nonessential joke caption across the illustrated border.',
      annotations: [{ kind: 'comic-margin', by: '9 BIT', text: 'AUTHORISED PUNCHING CONSULTANT' }],
      dialogueContext: 'fourth-wall-player-address',
      lines: [line('9 BIT', "Hey, you outside the panel. 'Delivered' doesn't mean 'heard'.")],
      choice: { id: 'fourth-wall-question', optional: true, speaker: '9 BIT', prompt: 'Your call, player. Or keep turning the page.',
        options: [
          { id: 'get-it-heard', label: 'Get it heard', lines: [
            line('9 BIT', "That's the job. Finish the panels; then you get the buttons.")
          ] },
          { id: 'keep-receipts', label: 'Keep the receipts', lines: [
            line('9 BIT', "Good call. You're holding a controller, not a verdict.")
          ] }
        ], bypass: [], rejoin: [] } },
    { id: 'record-straight', title: 'KEEP THE RECORD STRAIGHT', asset: 'assets/mac-street-review/scene06-record-straight-v1.png',
      visual: 'The original cassette, cleaned copy and present interruption remain separate.',
      lines: [line('DJ FLOPPYDISC / COMMS', "That margin note isn't on the tape. Keep it separate; it isn't proof.")] },
    { id: 'street-access', title: 'STREET ACCESS', asset: 'assets/cache-ending/ending-04-street-access.webp',
      visual: 'Mac finds his opening at the street gate; Kave remains on comms at the review desk.',
      lines: [line('MAC MODEM / COMMS', "Street enforcement has the hold. I'll find a way through.")] },
    { id: 'get-it-heard', title: 'GET IT HEARD', asset: 'assets/mac-street-review/mac-hero-v2.png',
      visual: 'Mac strides through the threshold, one open hand driving the barrier aside.',
      lines: [line('MAC MODEM', 'Open the channel.')] }
  ];
  const DESK = [{ id: 'review-desk', title: 'THE FIRST PLAY GETS THROUGH', asset: INTRO[2].asset,
    visual: 'Inside the enclosed broadcast studio, Kave receives the first outbound play after Mac earns the city-chapter endpoint.',
    artLocation: 'enclosed-broadcast-studio', artTime: 'after-city-chapter-endpoint', dialogueContext: 'in-person-studio',
    lines: [line('KAVE', "First play's through. The outbound feed is open; keep both records safe.")]
  }];
  const OBJECTIVES = Object.freeze({
    intro: 'Break the street hold across Broadcast Slum and reopen the studio\'s outbound feed.',
    desk: 'The city\'s street hold is broken. The studio\'s outbound feed is open.'
  });
  // Gameplay owns these events and the chapter-local seen list. A snapshot by
  // itself never earns a line; this module only describes a verified event.
  const gameplayCue = (id, speaker, text, zoneId, context, priority) =>
    Object.freeze({ id, speaker, text, zoneId, context, priority });
  const ARRIVAL_CUES = Object.freeze({
    'service-alley': gameplayCue('city.arrival.service-alley', 'MAC MODEM',
      'No more holding the queue. Move.', 'service-alley', 'arrival', 30),
    'night-market': gameplayCue('city.arrival.night-market', 'KAVE / COMMS',
      "The artists are still waiting. I'm keeping their places.", 'night-market', 'arrival', 30),
    'transit-concourse': gameplayCue('city.arrival.transit-concourse', 'CACHE BACK / COMMS',
      'Same recording. Get it through the concourse.', 'transit-concourse', 'arrival', 30),
    'relay-canal': gameplayCue('city.arrival.relay-canal', 'DJ FLOPPYDISC / COMMS',
      "Take the canal service route. I'll keep our copies separate.", 'relay-canal', 'arrival', 30),
    'rooftop-relay': gameplayCue('city.arrival.rooftop-relay', '9 BIT',
      'Hey, player. No camera cut is skipping these stairs for you.', 'rooftop-relay', 'arrival', 30),
    'broadcast-plaza': gameplayCue('city.arrival.broadcast-plaza', 'MAC MODEM',
      "Last street hold. I'm done asking.", 'broadcast-plaza', 'arrival', 30)
  });
  const CLEAR_CUES = Object.freeze({
    'transit-concourse': gameplayCue('city.clear.transit-concourse', 'WittyF0x / COMMS',
      'Canal service passage is open. Take that way up.', 'transit-concourse', 'district-clear', 35),
    'rooftop-relay': gameplayCue('city.clear.rooftop-relay', 'KAVE / COMMS',
      "I still have local monitoring. You're almost at the plaza.", 'rooftop-relay', 'district-clear', 35)
  });
  const RELAY_READY = gameplayCue('city.relay.ready', 'KAVE / COMMS',
    'Market relay is clear. Link it and bring my signal back.', 'night-market', 'relay-ready', 80);
  const RELAY_RESTORED = Object.freeze([
    gameplayCue('city.relay.restored.local', 'DJ FLOPPYDISC / COMMS', 'Local signal restored. Your track. Their speakers.',
      'night-market', 'relay-restored', 90),
    gameplayCue('city.relay.restored.kave', 'KAVE', 'There you are, Modem. Keep that signal moving.',
      'night-market', 'relay-restored', 90)
  ]);
  // These two optional reactions have chapter-wide IDs. They do not repeat at
  // every fixture/car, add a collectible, or make a guest a route dependency.
  const FIXTURE_DISCHARGE = gameplayCue('city.fixture-discharge', 'DJ FLOPPYDISC / COMMS',
    'Nice patch. You turned their street hardware against them.', null, 'fixture-discharge', 65);
  const CAR_WRECKED = gameplayCue('city.car-wrecked', 'Dr3wBaby / COMMS',
    'Save me the good parts, Modem.', null, 'car-wrecked', 35);
  const BOSS_PHASE_CUES = Object.freeze({
    2: gameplayCue('city.regent.phase2', 'DJ FLOPPYDISC / COMMS',
      "Crossfire. Don't let him box you into one lane.", 'broadcast-plaza', 'boss-phase', 95),
    3: gameplayCue('city.regent.phase3', 'MAC MODEM',
      "You're running out of street.", 'broadcast-plaza', 'boss-phase', 95)
  });
  const BOSS_DEFEATED = gameplayCue('city.regent.defeated', 'KAVE / COMMS',
    "Street hold's broken. Come inside; let's check the outbound feed.", 'broadcast-plaza', 'city-endpoint', 100);
  const GAMEPLAY_CUE_IDS = Object.freeze([
    ...Object.values(ARRIVAL_CUES), ...Object.values(CLEAR_CUES), RELAY_READY,
    ...RELAY_RESTORED, FIXTURE_DISCHARGE, CAR_WRECKED,
    ...Object.values(BOSS_PHASE_CUES), BOSS_DEFEATED
  ].map(cue => cue.id));
  const GAMEPLAY_CUE_ID_SET = new Set(GAMEPLAY_CUE_IDS);
  const DISTRICT_IDS = Object.freeze(Object.keys(ARRIVAL_CUES));

  function gameplayCues(events, snapshot, seenIds = []) {
    const seen = new Set((Array.isArray(seenIds) ? seenIds : [])
      .filter(id => GAMEPLAY_CUE_ID_SET.has(id)));
    const candidates = new Map();
    const result = () => {
      const cues = [...candidates.values()].sort((a, b) => b.priority - a.priority).slice(0, 2);
      // Only selected lines are consumed. An omitted low-priority event never
      // acquires a false seen flag; the presentation owner decides queue life.
      for (const cue of cues) seen.add(cue.id);
      return Object.freeze({ cues: Object.freeze(cues), seenIds: Object.freeze([...seen]) });
    };
    const zoneId = snapshot?.zone?.id;
    if (!Array.isArray(events) || !DISTRICT_IDS.includes(zoneId) ||
      !(snapshot?.player?.hp > 0) || snapshot.status === 'defeated') return result();
    const add = cue => {
      if (!cue || seen.has(cue.id) || candidates.has(cue.id)) return;
      candidates.set(cue.id, cue.zoneId ? cue : Object.freeze({ ...cue, zoneId }));
    };
    const cleared = id => snapshot.zone.cleared === true && snapshot.zone.id === id &&
      Array.isArray(snapshot.city?.clearedZones) && snapshot.city.clearedZones.includes(id);
    const brokenProp = event => Array.isArray(snapshot.props) && snapshot.props.some(prop =>
      prop.id === event.id && prop.kind === event.kind && prop.zoneId === zoneId && prop.broken === true);
    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      if (event.type === 'zone-enter' && event.zoneId === zoneId) add(ARRIVAL_CUES[zoneId]);
      else if (event.type === 'zone-cleared' && event.zoneId === zoneId && cleared(zoneId)) add(CLEAR_CUES[zoneId]);
      else if (event.type === 'relay-ready' && zoneId === 'night-market' && event.id === 'market-relay' &&
        cleared(zoneId) && snapshot.relay?.available === true && snapshot.relay.restored === false) add(RELAY_READY);
      else if (event.type === 'relay-restored' && zoneId === 'night-market' && event.id === 'market-relay' &&
        cleared(zoneId) && snapshot.relay?.restored === true) for (const cue of RELAY_RESTORED) add(cue);
      else if (event.type === 'fixture-discharge' && ['terminal', 'streetlight'].includes(event.kind) &&
        Array.isArray(event.enemyIds) && event.enemyIds.length > 0 && brokenProp(event)) add(FIXTURE_DISCHARGE);
      else if (event.type === 'prop-break' && event.kind === 'car' && brokenProp(event)) add(CAR_WRECKED);
      else if (event.type === 'boss-phase' && zoneId === 'broadcast-plaza' &&
        event.id === snapshot.boss?.id && snapshot.boss.kind === 'null_regent' && snapshot.boss.hp > 0 &&
        event.phase === snapshot.boss.phase) add(BOSS_PHASE_CUES[event.phase]);
      else if (event.type === 'enemy-defeated' && event.kind === 'null_regent' && zoneId === 'broadcast-plaza' &&
        event.id === snapshot.boss?.id && snapshot.boss.kind === 'null_regent' && snapshot.boss.defeated === true &&
        snapshot.boss.hp === 0 && snapshot.status === 'desk-ready' && snapshot.desk?.unlocked === true &&
        snapshot.city?.complete === true && snapshot.city.completedWaves === 12 &&
        Array.isArray(snapshot.city.clearedZones) && DISTRICT_IDS.every(id => snapshot.city.clearedZones.includes(id))) add(BOSS_DEFEATED);
    }
    return result();
  }
  function create(kind, source, options = {}) {
    const speed = Number.isFinite(options.charsPerSecond) ? Math.max(10, Math.min(160, options.charsPerSecond)) : 44;
    const instantText = options.instantText === true;
    let page, phase, cursor, readingLines, revealedChars, selected, done, skipped;
    const scene = () => source[page];
    const currentLine = () => readingLines[cursor];
    const revealed = () => phase === 'choice' || revealedChars >= currentLine().text.length;
    const event = (action, extra = {}) => ({ consumed: true, action, ...extra });
    function startLines(lines, nextPhase) {
      readingLines = lines; cursor = 0; phase = nextPhase;
      revealedChars = instantText ? currentLine().text.length : 0;
    }
    function enterPage(index) { page = index; startLines(scene().lines, 'lines'); }
    function nextScene() {
      if (page + 1 < source.length) { enterPage(page + 1); return event('scene', { sceneId: scene().id }); }
      done = true; phase = 'done'; return event('complete', { objective: OBJECTIVES[kind] });
    }
    function rejoin(choice) {
      const lines = choice.bypass || choice.rejoin;
      if (lines.length) { startLines(lines, 'response'); return event('rejoin'); }
      const next = nextScene();
      return event('rejoin', { nextAction: next.action, sceneId: scene().id });
    }
    function advance() {
      if (done) return event('blocked', { reason: 'story-complete' });
      if (phase === 'choice') {
        if (scene().choice.optional) return rejoin(scene().choice);
        return event('choice', { reason: 'choice-awaiting-answer' });
      }
      if (!revealed()) { revealedChars = currentLine().text.length; return event('reveal'); }
      if (cursor + 1 < readingLines.length) {
        cursor++; revealedChars = instantText ? currentLine().text.length : 0; return event('line');
      }
      if (phase === 'lines' && scene().choice) { phase = 'choice'; return event('choice'); }
      return nextScene();
    }
    function choose(index) {
      const choice = scene().choice;
      if (done || phase !== 'choice' || !Number.isInteger(index) || index < 0 || index >= choice.options.length)
        return event('blocked', { accepted: false, reason: 'choice-unavailable' });
      const option = choice.options[index];
      selected[choice.id] = option.id;
      startLines(option.lines.concat(choice.rejoin), 'response');
      return event('choose', { accepted: true, choiceId: choice.id, index, optionId: option.id });
    }
    function update(deltaMs) {
      if (!done && phase !== 'choice' && Number.isFinite(deltaMs) && deltaMs > 0)
        revealedChars = Math.min(currentLine().text.length, revealedChars + deltaMs * speed / 1000);
    }
    function snapshot() {
      const s = scene(), choosing = phase === 'choice', activeLine = choosing ? { speaker: s.choice.speaker, text: s.choice.prompt } : currentLine();
      const choice = choosing ? { id: s.choice.id, prompt: s.choice.prompt, optional: s.choice.optional === true,
        options: s.choice.options.map((option, index) => ({ id: option.id, index, label: option.label })) } : null;
      const artPath = options.artPaths?.[s.id] || s.asset;
      return { kind, phase, sceneId: s.id, page, sceneNumber: page + 1, sceneCount: source.length,
        title: s.title, visual: s.visual, asset: artPath, artPath, speaker: activeLine.speaker,
        artLabel: s.artLabel || null, artLocation: s.artLocation || null, artTime: s.artTime || null, dialogueContext: s.dialogueContext || null,
        fullText: activeLine.text, text: choosing ? activeLine.text : activeLine.text.slice(0, Math.floor(revealedChars)),
        revealed: revealed(), lineIndex: cursor, lineCount: readingLines.length,
        choice, awaitingChoice: choosing, selectedChoice: s.choice ? selected[s.choice.id] || null : null,
        selections: { ...selected }, annotations: (s.annotations || []).map(annotation => ({ ...annotation })),
        done, skipped, objective: OBJECTIVES[kind], entryRequirement: kind === 'desk' ? 'city-chapter-endpoint' : null };
    }
    function skip() {
      // Skip follows the common route without selecting an answer or earning anything.
      enterPage(source.length - 1);
      if (scene().choice?.rejoin?.length) startLines(scene().choice.rejoin, 'response');
      cursor = readingLines.length - 1; revealedChars = currentLine().text.length;
      done = true; skipped = true; phase = 'done';
      return event('complete', { skipped: true, objective: OBJECTIVES[kind] });
    }
    function reset() { selected = {}; done = false; skipped = false; enterPage(0); return snapshot(); }
    reset();
    return Object.freeze({ advance, choose, update, snapshot, skip, reset });
  }
  B.MacStreetStory = Object.freeze({
    sceneIds: Object.freeze(INTRO.map(scene => scene.id)),
    gameplayCueIds: GAMEPLAY_CUE_IDS,
    gameplayCues,
    createIntro: options => create('intro', INTRO, options),
    createDesk: options => create('desk', DESK, options)
  });
})(window.BARCODE = window.BARCODE || {});
