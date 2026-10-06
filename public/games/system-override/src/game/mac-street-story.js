// Private Mac preview story data and reading state. No save, render, audio or input owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/mac-street-story.js', exports: ['BARCODE.MacStreetStory'], dependencies: [] });
(function(B) {
  'use strict';
  const line = (speaker, text) => ({ speaker, text });
  const INTRO = [
    { id: 'delivered', title: 'ORIGINAL DELIVERED', asset: 'assets/cache-ending/ending-01-delivered.webp',
      visual: 'Cache protects the complete original beside the receiving equipment.',
      lines: [line('CACHE BACK', 'Original delivered. Names, room noise, all of it.'), line('DJ FLOPPYDISC / COMMS', 'It matches. Nothing missing.')] },
    { id: 'unverified', title: 'DELIVERED / UNVERIFIED', asset: 'assets/cache-ending/ending-02-unverified.webp',
      visual: 'Transfer is delivered; the separate outbound distribution channel remains unverified.',
      lines: [line('CACHE BACK', "They took the file. Why isn't it going out?"), line('MAC MODEM / COMMS', 'Delivery passed. Distribution says UNVERIFIED.')] },
    { id: 'kave-dead-air', title: "KAVE'S DEAD AIR", asset: 'assets/mac-street-review/scene03-kave-dead-air-v1.png',
      visual: 'Kave tends the Kaveman Radio review desk and its waiting submissions in the venue neighborhood.',
      lines: [line('KAVE', "The review queue's full. Nothing's reaching the listeners."), line('CACHE BACK / COMMS', "It got here whole. Somebody's keeping it here.")],
      choice: { id: 'delivery-question', speaker: 'CACHE BACK / COMMS', prompt: 'What do you ask?',
        options: [
          { id: 'who-is-waiting', label: "Who's waiting?", lines: [line('KAVE', 'Artists waiting for a play. Listeners waiting for a voice.')] },
          { id: 'what-got-blocked', label: 'What got blocked?', lines: [line('KAVE', "The outbound feed. Local monitoring works; distribution doesn't.")] }
        ], rejoin: [line('MAC MODEM / COMMS', 'Then we open it back up, piece by piece.')] } },
    { id: 'held', title: 'THE HOLD IS LOCAL', asset: 'assets/cache-ending/ending-03-held.webp',
      visual: 'An earlier studio comparison shows DJ and Mac together; the present crew dialogue continues over comms.',
      artLabel: 'EARLIER / STUDIO COMPARISON', artLocation: 'studio', artTime: 'earlier-comparison', dialogueContext: 'live-comms',
      lines: [line('DJ FLOPPYDISC / COMMS', 'The original arrived. The distribution hold is still there.'), line('CACHE BACK / COMMS', "Then being delivered isn't enough. They're stopping it here.")] },
    { id: 'margin-note', title: 'A NOTE IN THE MARGIN', asset: 'assets/mac-street-review/scene05-margin-note-v1.png',
      visual: 'A hand pastes a nonessential joke caption across the illustrated border.',
      annotations: [{ kind: 'comic-margin', by: '9 BIT', text: 'AUTHORISED PUNCHING CONSULTANT' }],
      lines: [line('MAC MODEM', 'Who edited my subtitle?'), line('9 BIT', "You. Outside the panel. Still think 'delivered' means 'heard'?")],
      choice: { id: 'frame-reply', speaker: 'YOU', prompt: 'What do you say?',
        options: [
          { id: 'listening', label: "I'm listening.", lines: [line('9 BIT', "Then listen to what isn't there.")] },
          { id: 'crew-work', label: 'Let the crew work.', lines: [line('9 BIT', 'Fair. They know the streets. You know the frame.')] }
        ], rejoin: [] } },
    { id: 'record-straight', title: 'KEEP THE RECORD STRAIGHT', asset: 'assets/mac-street-review/scene06-record-straight-v1.png',
      visual: 'The original cassette, cleaned copy and present interruption remain separate.',
      lines: [line('CACHE BACK / COMMS', "That wasn't on the tape."), line('DJ FLOPPYDISC / COMMS', "Then keep it separate. Record the interruption. Don't call it proof.")] },
    { id: 'street-access', title: 'STREET ACCESS', asset: 'assets/cache-ending/ending-04-street-access.webp',
      visual: 'Mac finds his opening at the street gate; Kave remains on comms at the review desk.',
      lines: [line('MAC MODEM / COMMS', "The hold points to street enforcement. I'll find a way through."), line('KAVE / COMMS', "I'll keep the queue moving and the local line open.")] },
    { id: 'get-it-heard', title: 'GET IT HEARD', asset: 'assets/mac-street-review/mac-hero-v2.png',
      visual: 'Mac strides through the threshold, one open hand driving the barrier aside.',
      lines: [line('6 BIT / COMMS', 'Cache got it here. Mac, get it heard.'), line('MAC MODEM', 'Open the channel.')] }
  ];
  const DESK = [{ id: 'review-desk', title: 'THE FIRST PLAY GETS THROUGH', asset: INTRO[2].asset,
    visual: 'The review desk receives its first outbound play after Mac reopens the local feed.',
    lines: [line('KAVE', "It's reaching them. First play's through."), line('MAC MODEM', 'Keep the line open.')],
    choice: { id: 'desk-question', optional: true, speaker: 'MAC MODEM', prompt: 'Ask Kave, or continue into the street.',
      options: [
        { id: 'ask-people', label: 'Ask about the people', lines: [
          line('KAVE', 'Artists could hear their own work in here. They were waiting for everyone else to hear it.'),
          line('MAC MODEM', 'Then keep them moving. Nobody gets buried in the queue.')
        ] },
        { id: 'ask-order', label: 'Ask about the order', lines: [
          line('KAVE', 'The receiver accepted it. The hold was on the line out. That tells us where it happened, not who ordered it.'),
          line('MAC MODEM', "Good. Keep the local record. I'll follow the next hold.")
        ] }
      ], rejoin: [line('KAVE', "Local monitoring stayed live. Now the outbound feed's open too."), line('MAC MODEM', "One line open. There's more street ahead.")] }
  }];
  const OBJECTIVES = Object.freeze({
    intro: 'Open the approach and restore the review desk\'s outbound feed.',
    desk: 'The review desk\'s outbound feed is reopened. Continue into Broadcast Slum.'
  });
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
      if (choice.rejoin.length) { startLines(choice.rejoin, 'response'); return event('rejoin'); }
      return nextScene();
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
        done, skipped, objective: OBJECTIVES[kind] };
    }
    function skip() {
      // Skip follows the common route without selecting an answer or earning anything.
      enterPage(source.length - 1);
      if (kind === 'desk') startLines(scene().choice.rejoin, 'response');
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
    createIntro: options => create('intro', INTRO, options),
    createDesk: options => create('desk', DESK, options)
  });
})(window.BARCODE = window.BARCODE || {});
