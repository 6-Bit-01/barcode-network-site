// The opening's script and comic page renderer. CutsceneSystem owns its clock,
// input, assets and lifetime; this module owns no listeners, timers or audio.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/engine/intro-sequence.js', exports: ['BARCODE.IntroSequence'], dependencies: [] });
(function() {
  const BARCODE = window.BARCODE = window.BARCODE || {};
  // Immutable public copies survive Makko imports without a binary asset root.
  const assetRoot = './';
  const panels = Object.freeze([
    { beat: 'O1', title: 'LEAVE THE ROOM NOISE IN', image: 0, asset: 'assets/intro/intro-01-broadcast.webp', layout: 'room', visual: '6 Bit and DJ Floppydisc work the mixing desk in a warm, lived-in studio.', stamp: 'BARCODE / ON AIR', lines: [
      ['DJ FLOPPYDISC', 'One more pass. Leave the room noise in.'],
      ['6 BIT', "That's the part that proves somebody's here."]] },
    { beat: 'O1', title: 'KEEP THE TAKE', image: 1, asset: 'assets/intro/intro-02-keep-the-take.webp', layout: 'links', visual: 'Mac connects the patch bay while Cache records. Behind them, Cliff checks a cable beneath a coffee mug, clipboard in hand.', stamp: 'DEAD AIR DISTRICT / LIVE', lines: [
      ['MAC MODEM', "Street relays are open. You're reaching the whole district."],
      ['CACHE BACK', 'Rolling. Names, mistakes, everything. This one stays.']] },
    { beat: 'O2', title: 'THEN THE RETURN GOES QUIET', image: 2, asset: 'assets/intro/intro-03-dead-return.webp', layout: 'failure', visual: 'The receiver falls to a flat trace and static. 6 Bit leans toward it; DJ stops at the faders.', stamp: 'NO BROADCAST DETECTED', lines: [
      ['DJ FLOPPYDISC', 'We were on the air a second ago.'],
      ['6 BIT', 'Then your detector needs a new job.']] },
    { beat: 'O3', title: 'SAVE THE PART IT WANTS GONE', image: 3, asset: 'assets/intro/intro-04-preserve.webp', layout: 'archive', visual: 'Cache locks the original recording against overwriting. Mac opens the outside access circuit.', stamp: 'RECOVERY REQUEST: DISCARD UNREADABLE AUDIO', lines: [
      ['CACHE BACK', "It wants a clean copy. I've locked the original."],
      ['MAC MODEM', "The outside route is still there. I'm getting you access."]] },
    { beat: 'O3', title: 'LISTEN UNDER THE STATIC', image: 4, asset: 'assets/intro/intro-05-listen.webp', layout: 'listen', visual: 'DJ isolates a faint surviving signal. Two traces remain on the scope beneath the noise.', stamp: 'CREW CHANNEL / STILL OPEN', lines: [
      ['DJ FLOPPYDISC', "There's still something under that noise. Don't wipe it."],
      ['6 BIT', 'Keep listening. Tell me when it changes.']] },
    { beat: 'O4', title: '6 BIT HAS OTHER PLANS', image: 5, asset: 'assets/intro/intro-06-refusal.webp', layout: 'refusal', visual: '6 Bit pushes open the studio door and looks back toward his crew as the recovery caption slips out of its frame.', stamp: 'PLEASE WAIT FOR AUTOMATIC RECOVERY', lines: [
      ['6 BIT', "Automatic recovery can wait. I'm going outside."],
      ['MAC MODEM', "Good. I can open the way. I can't walk it for you."]] },
    { beat: 'O5', title: 'START WITH THIS DISTRICT', image: 6, asset: 'assets/intro/intro-07-district.webp', layout: 'tower', visual: 'Beyond 6 Bit, a wet street of shuttered music shops leads toward the distant lattice broadcast tower.', stamp: 'TOWER UPLINK / BLOCKED', lines: [
      ['MAC MODEM', 'The interference runs toward the tower. Street level is jammed.'],
      ['6 BIT', 'Then we get the neighborhood talking first. The tower can hear us coming.']] },
    { beat: 'O5', title: 'DEAD AIR DISTRICT', image: 7, asset: 'assets/intro/intro-08-keep-it-open.webp', layout: 'handoff', visual: '6 Bit steps into the district, listening to the crew. All four channels remain connected.', stamp: 'RESTORE THE LOCAL SIGNAL. FIND THE JAMMER.', lines: [
      ['CACHE BACK', 'We are still here, 6. Keep us on the line.'],
      ['6 BIT', 'All four of us. Leave it open.']] }
  ].map(panel => Object.freeze({ ...panel, hostedAsset: assetRoot + panel.asset, lines: Object.freeze(panel.lines.map(line => Object.freeze(line))) })));
  const ink = '#090b15', paper = '#f1eadd', mint = '#95ffe0', pink = '#f696d9';
  const crewColors = { '6 BIT': '#e6e5ee', 'DJ FLOPPYDISC': '#83e9ff', 'CACHE BACK': '#ffd65c', 'MAC MODEM': '#ff929c' };
  const frame = Object.freeze({ x: 48, y: 140, w: 1824, h: 828 });
  // The opening is the visual standard for every comic chapter. These pure
  // painters share its lettering and page furniture without owning a clock,
  // input, images, audio or saved state.
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  const format = freeze({
    frame,
    palette: { ink, paper, mint, pink, radio: '#101a2b', border: '#282235', muted: '#a9b4ca', crew: crewColors },
    fonts: { dialogue: 'bold 30px sans-serif', label: 'bold 21px monospace', title: 'bold 36px sans-serif', control: '22px monospace' },
    balloon: { fontSize: 30, lineHeight: 36, heightBase: 78, textInsetX: 30, textInsetY: 45,
      outline: 10, shadowX: 9, shadowY: 10, cut: 16, tabX: 22, tabY: -17, tabHeight: 39,
      labelInsetX: 18, labelInsetY: 8, labelPadding: 38, tailLeft: 22, tailRight: 20,
      tailInsetY: 8, tailMinX: 54, tailMaxX: 68 },
    readable: { x: 32, y: 119, w: 1856, h: 861 }
  });
  // Author the reading order, including the gaps before a reaction. A scene
  // never turns its own page; its last cue remains until the player advances.
  const cue = (kind, holdMs, line = null) => Object.freeze({ kind, holdMs, line });
  const cues = Object.freeze([
    [cue('title', 850), cue('screen', 1500), cue('dialogue', 4300, 0), cue('dialogue', 4300, 1)],
    [cue('title', 850), cue('dialogue', 4700, 0), cue('screen', 1300), cue('dialogue', 4200, 1)],
    [cue('title', 1100), cue('screen', 2100), cue('dialogue', 3400, 0), cue('dialogue', 3700, 1)],
    [cue('title', 900), cue('caption', 2400), cue('dialogue', 4300, 0), cue('dialogue', 4900, 1)],
    [cue('title', 1000), cue('screen', 1800), cue('dialogue', 4700, 0), cue('dialogue', 4000, 1)],
    [cue('title', 900), cue('screen', 2200), cue('dialogue', 4600, 0), cue('gutter', 1400), cue('dialogue', 4400, 1)],
    [cue('title', 1400), cue('caption', 1700), cue('dialogue', 4700, 0), cue('dialogue', 5400, 1)],
    [cue('title', 1000), cue('dialogue', 4400, 0), cue('dialogue', 3500, 1), cue('caption', 3000)]
  ].map(scene => Object.freeze(scene)));
  // Glass corners in the source illustration's 1862 x 845 coordinate space,
  // clockwise from top-left. Text is transformed and clipped to that glass;
  // it is not another floating dialogue card. Small screens use short labels.
  const screens = [
    { quad: [[1699, 403], [1855, 382], [1855, 533], [1699, 545]], size: [165, 155], lines: ['BARCODE', 'ON AIR'], font: 20, y: 48 },
    { quad: [[1730, 494], [1855, 481], [1855, 597], [1710, 620]], size: [145, 136], lines: ['DEAD AIR', 'LIVE'], font: 19, y: 32 },
    { quad: [[160, 81], [521, 225], [512, 589], [106, 502]], size: [410, 460], lines: ['NO BROADCAST', 'DETECTED'], font: 29, y: 95, error: true },
    null,
    { quad: [[1352, 260], [1723, 197], [1724, 548], [1333, 569]], size: [410, 365], lines: ['CREW CHANNEL', 'STILL OPEN'], font: 24, y: 25 },
    { quad: [[91, 201], [249, 254], [219, 391], [53, 344]], size: [210, 195], lines: ['PLEASE WAIT', 'AUTOMATIC', 'RECOVERY'], font: 21, y: 40, error: true },
    null, null
  ];
  // Authored against the actual illustrations. Tails end below the speaking
  // face; offscreen voices use a receiver card instead of a false face pointer.
  // These coordinates deliberately leave the tape lock, scope, door hand,
  // tower, Cliff's face and the four supplied likenesses visible.
  const compositions = [
    { balloons: [
      { x: 1060, y: 644, w: 736, tail: [1260, 524] },
      { x: 132, y: 794, w: 790, tail: [635, 618] }] },
    { balloons: [
      { x: 104, y: 752, w: 744, tail: [593, 594] },
      { x: 1098, y: 788, w: 700, tail: [1370, 674] }] },
    { balloons: [
      { x: 646, y: 676, w: 540, tail: [868, 602] },
      { x: 1254, y: 798, w: 556, tail: [1390, 626] }] },
    { balloons: [
      { x: 92, y: 766, w: 610, tail: [459, 634] },
      { x: 1188, y: 742, w: 628, tail: [1408, 610] }] },
    { balloons: [
      { x: 94, y: 750, w: 746, tail: [620, 612] },
      { x: 1184, y: 786, w: 632, radio: true }] },
    { balloons: [
      { x: 1044, y: 672, w: 758, tail: [1212, 584] },
      { x: 104, y: 770, w: 732, radio: true }] },
    { balloons: [
      { x: 768, y: 180, w: 512, radio: true },
      { x: 660, y: 698, w: 750, tail: [518, 520] }] },
    { balloons: [
      { x: 1128, y: 672, w: 674, radio: true },
      { x: 140, y: 796, w: 752, tail: [662, 582] }] }
  ];
  const text = (ctx, line, x, y, size = 24, color = paper, bold = false, family = 'monospace') => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${family}`; ctx.fillStyle = color;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(line, x, y);
  };
  function wrap(ctx, value, width) {
    const lines = []; let line = '';
    for (const word of value.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  function polygon(ctx, points) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  }
  function cutBox(ctx, x, y, w, h, cut = 16) {
    polygon(ctx, [[x + cut, y], [x + w, y], [x + w, y + h - cut], [x + w - cut, y + h], [x, y + h], [x, y + cut]]);
  }
  function drawArt(ctx, images, index) {
    const { x, y, w, h } = frame;
    ctx.fillStyle = '#152235'; ctx.fillRect(x, y, w, h);
    const item = images?.[index], source = item?.element;
    const sw = source?.naturalWidth || source?.width, sh = source?.naturalHeight || source?.height;
    if (sw && sh) {
      const scale = Math.min(w / sw, h / sh), dw = sw * scale, dh = sh * scale;
      ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      text(ctx, item?.status === 'unavailable' ? 'SCENE ART UNAVAILABLE' : 'TUNING THE PICTURE...', 730, 466, 28, mint, true);
    }
    drawFrame(ctx);
  }
  function drawFrame(ctx) {
    const { x, y, w, h } = frame;
    ctx.strokeStyle = paper; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#282235'; ctx.lineWidth = 2; ctx.strokeRect(x - 9, y - 9, w + 18, h + 18);
  }
  function drawHeader(ctx, { title, channel = 'SYSTEM OVERRIDE / OPENING TRANSMISSION', index = 0, count = panels.length } = {}) {
    ctx.fillStyle = pink; ctx.fillRect(48, 25, 163, 38);
    text(ctx, 'BARCODE', 62, 30, 26, ink, true);
    text(ctx, channel, 235, 35, 20, '#a9b4ca');
    text(ctx, title, 48, 77, 36, paper, true, 'sans-serif');
    text(ctx, `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`, 1710, 32, 27, mint, true);
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = i <= index ? mint : '#2b3040'; ctx.fillRect(1698 + i * 22, 86, 14, i === index ? 15 : 5);
    }
  }
  function balloonLayout(ctx, dialogue, placement, { speaker, serial = 1 } = {}) {
    ctx.font = format.fonts.dialogue;
    const lines = wrap(ctx, dialogue, placement.w - 60);
    const layout = { ...placement, h: 78 + lines.length * 36, lines };
    if (speaker !== undefined) {
      const label = placement.radio ? `${speaker} / COMMS` : speaker;
      ctx.font = format.fonts.label;
      const labelRect = { x: placement.x + 22, y: placement.y - 17, w: ctx.measureText(label).width + 38, h: 39 };
      Object.assign(layout, { speaker, serial, label, labelRect, accent: crewColors[speaker] || mint,
        fontSize: 30, lineHeight: 36, fontFamily: 'sans-serif', labelFontFamily: 'monospace',
        textRect: { x: placement.x + 30, y: placement.y + 45, w: placement.w - 60, h: lines.length * 36 },
        outerBounds: { x: placement.x - 15, y: placement.y - 25, w: placement.w + 24, h: layout.h + 43 } });
    }
    return layout;
  }
  function balloon(ctx, speaker, layout, serial, { tailOnly = false, hideTail = false } = {}) {
    const { x, y, w, h, tail, radio, lines } = layout;
    const accent = crewColors[speaker] || mint, fill = radio ? '#101a2b' : paper;
    ctx.save(); ctx.lineJoin = 'round';
    if (tail && !hideTail) {
      const baseX = Math.max(x + 54, Math.min(x + w - 68,
        Number.isFinite(layout.tailBase) ? x + layout.tailBase * w : tail[0]));
      polygon(ctx, [[baseX - 22, y + 8], tail, [baseX + 20, y + 8]]);
      ctx.fillStyle = fill; ctx.strokeStyle = ink; ctx.lineWidth = 10; ctx.stroke(); ctx.fill();
    }
    if (tailOnly) { ctx.restore(); return; }
    cutBox(ctx, x + 9, y + 10, w, h); ctx.fillStyle = ink; ctx.fill();
    cutBox(ctx, x, y, w, h); ctx.strokeStyle = ink; ctx.lineWidth = 10; ctx.stroke(); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = radio ? accent : '#c8bfaf'; ctx.lineWidth = 2; ctx.stroke();
    // Printed channel tab + small reading-order marker, with actual dialogue
    // in larger proportional lettering instead of terminal body copy.
    ctx.font = 'bold 21px monospace';
    const label = radio ? `${speaker} / COMMS` : speaker;
    const labelWidth = ctx.measureText(label).width + 38;
    cutBox(ctx, x + 22, y - 17, labelWidth, 39, 7); ctx.fillStyle = accent; ctx.fill();
    text(ctx, label, x + 40, y - 9, 21, ink, true);
    text(ctx, `0${serial}`, x + w - 58, y + 22, 17, radio ? accent : '#716b65', true);
    if (radio) {
      ctx.fillStyle = accent;
      for (let i = 0; i < 4; i++) ctx.fillRect(x + w - 71 + i * 9, y - 12 - i * 4, 5, 10 + i * 4);
      ctx.fillRect(x + 13, y + 38, 3, h - 65);
    }
    lines.forEach((line, i) => text(ctx, line, x + 30, y + 45 + i * 36, 30, radio ? paper : ink, true, 'sans-serif'));
    // Two short registration marks give the card a printed, imperfect edge.
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x - 13, y + 34); ctx.lineTo(x - 13, y + 57);
    ctx.moveTo(x + w - 46, y + h + 16); ctx.lineTo(x + w - 15, y + h + 16); ctx.stroke();
    ctx.restore();
  }
  function screenReadout(ctx, index, images) {
    const screen = screens[index]; if (!screen) return;
    const source = images?.[index]?.element;
    const sw = source?.naturalWidth || source?.width, sh = source?.naturalHeight || source?.height;
    if (!sw || !sh) return; // No floating readout over an absent illustration.
    const scale = Math.min(frame.w / sw, frame.h / sh);
    const ox = frame.x + (frame.w - sw * scale) / 2, oy = frame.y + (frame.h - sh * scale) / 2;
    const quad = screen.quad.map(([x, y]) => [ox + x / 1862 * sw * scale, oy + y / 845 * sh * scale]);
    const [a, b, , d] = quad, [w, h] = screen.size;
    ctx.save(); polygon(ctx, quad); ctx.clip();
    ctx.fillStyle = 'rgba(2, 13, 20, 0.56)'; ctx.fill();
    ctx.transform((b[0] - a[0]) / w, (b[1] - a[1]) / w, (d[0] - a[0]) / h, (d[1] - a[1]) / h, a[0], a[1]);
    const color = screen.error ? '#ff9edc' : '#b3fff1';
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    screen.lines.forEach((line, i) => text(ctx, line, 17, screen.y + i * (screen.font + 9), screen.font, color, true));
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(1, 10, 15, 0.14)';
    for (let y = 0; y < h; y += 5) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }
  // A single reading toolbar and transcript are used by every comic owner.
  const controls = freeze({ dialogue: [48,1011,260,49], scene: [328,1011,510,49],
    transcript: [858,1011,235,49], pause: [1113,1011,185,49], skip: [1318,1011,554,49] });
  function drawControls(ctx,{complete=false,finalLabel='Next scene',pad=false,holding=false,
    skipProgress=0,pending=false,transcriptOpen=false,paused=false}={}) {
    if(paused) {
      ctx.fillStyle='#09131cf5';ctx.fillRect(610,432,700,180);
      ctx.strokeStyle=mint;ctx.lineWidth=2;ctx.strokeRect(610,432,700,180);
      text(ctx,'READING PAUSED',655,468,32,paper,true);
      text(ctx,`${pad?(BARCODE.ControllerSettings?.button(9)||'Menu'):'P'}: Resume / your place is held`,655,544,22,mint);
    }
    const button=i=>BARCODE.ControllerSettings?.button(i)||({0:'A',1:'B',2:'X',5:'RB',9:'Menu'})[i];
    const labels={dialogue:`${pad?button(0):'SPACE'}: Dialogue`,
      scene:pending?'LOADING...':`${pad?button(5):'ENTER'}: ${complete?finalLabel:'Next scene'}`,
      transcript:`${pad?button(2):'T'}: ${transcriptOpen?'Close text':'Transcript'}`,
      pause:`${pad?button(9):'P'}: ${paused?'Resume':'Pause'}`};
    for(const name of ['dialogue','scene','transcript','pause']) {
      const [x,y,w,h]=controls[name],enabled=name==='pause'||(!paused&&(name==='dialogue'?!complete:name==='scene'?complete:true));
      ctx.fillStyle='#091722';ctx.fillRect(x,y,w,h);
      ctx.strokeStyle=enabled?mint:'#344253';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
      text(ctx,labels[name],x+16,y+13,20,enabled?paper:'#657184');
    }
    const [x,y,w]=controls.skip;
    if(holding) {
      ctx.fillStyle='#42284d';ctx.fillRect(x,y+4,w,8);
      ctx.fillStyle=pink;ctx.fillRect(x,y+4,w*Math.max(0,Math.min(1,skipProgress)),8);
      text(ctx,`SKIPPING IN ${(5*(1-skipProgress)).toFixed(1)}s / RELEASE TO CANCEL`,x+16,y+25,17,pink);
    } else text(ctx,`Hold ${pad?button(1):'S'} 5s: Skip / release to cancel`,x+16,y+15,19,'#b5bdcd');
  }
  function drawTranscript(ctx,{title,visual,lines=[],index=0,count=8,pad=false}={}) {
    ctx.save();ctx.fillStyle='#09131cf5';ctx.fillRect(160,154,1600,590);
    ctx.strokeStyle=mint;ctx.lineWidth=2;ctx.strokeRect(160,154,1600,590);
    text(ctx,`TRANSCRIPT / ${index+1} OF ${count}`,205,194,24,mint,true);
    ctx.font='26px monospace';let y=247;
    for(const paragraph of [visual,...lines.map(line=>line.join(': '))]) {
      for(const line of wrap(ctx,paragraph,1490)){text(ctx,line,205,y,26);y+=38;}y+=20;
    }
    text(ctx,`${pad?(BARCODE.ControllerSettings?.button(2)||'X'):'T'}: Close transcript / ${pad?(BARCODE.ControllerSettings?.button(9)||'Menu'):'P'}: Pause`,205,700,20,pink,true);
    ctx.restore();
  }
  BARCODE.IntroSequence = {
    panels, format, controls, drawControls, drawTranscript, drawHeader, drawFrame, measureBalloon: balloonLayout, drawBalloon: balloon, inspectedGutter: false,
    getCues(index) { return cues[index] || []; },
    getCueState(index, cueIndex = Infinity) {
      const shown = (cues[index] || []).slice(0, cueIndex + 1);
      return { lines: shown.filter(cue => cue.kind === 'dialogue').map(cue => cue.line),
        screen: shown.some(cue => cue.kind === 'screen'), caption: shown.some(cue => cue.kind === 'caption'),
        gutter: shown.some(cue => cue.kind === 'gutter') };
    },
    getScreenLayout(index) { return screens[index] ? JSON.parse(JSON.stringify(screens[index])) : null; },
    reset() { this.inspectedGutter = false; },
    inspect(index, cueIndex = Infinity) { if (!this.getCueState(index, cueIndex).gutter) return false; this.inspectedGutter = true; return true; },
    transcript(index, cueIndex = Infinity) {
      const panel = panels[index];
      if (!panel) return '';
      const shown = this.getCueState(index, cueIndex);
      return `${panel.title}. ${panel.visual} ${(shown.screen || shown.caption) ? panel.stamp + '. ' : ''}${shown.lines.map(i => panel.lines[i].join(': ')).join(' ')}${shown.gutter ? ' The recovery order has slipped into the page margin.' : ''}`;
    },
    getDialogueLayouts(ctx, index) {
      return panels[index]?.lines.map((line, i) => balloonLayout(ctx, line[1], compositions[index].balloons[i])) || [];
    },
    draw(ctx, { index = 0, cueIndex = Infinity, cueElapsedMs = 250, images = [], pad = false, skipProgress = 0, holding = false, transcriptOpen = false, paused = false } = {}) {
      const panel = panels[index]; if (!ctx || !panel) return;
      const reduced = BARCODE.Preferences?.values?.reducedMotion || BARCODE.Preferences?.values?.flashes === false || window.BARCODE_RENDER_QUALITY?.flashes === false;
      const shown = this.getCueState(index, cueIndex), current = cues[index][cueIndex];
      ctx.save(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.fillStyle = ink; ctx.fillRect(0, 0, 1920, 1080);
      drawHeader(ctx, { title: panel.title, index });
      drawArt(ctx, images, panel.image);
      if (!transcriptOpen && shown.screen) screenReadout(ctx, index, images);
      this.getDialogueLayouts(ctx, index).forEach((layout, i) => {
        if (transcriptOpen || !shown.lines.includes(i)) return;
        ctx.save();
        if (!reduced && current?.kind === 'dialogue' && current.line === i) ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, cueElapsedMs / 180);
        balloon(ctx, panel.lines[i][0], layout, i + 1); ctx.restore();
      });
      if (shown.caption) text(ctx, panel.stamp, 48, 988, 21, index === 3 ? pink : mint, true);
      if (shown.gutter) {
        // The one authored fourth-wall breach happens after 6 Bit refuses the
        // real screen's order. It does not pretend to be another monitor.
        const offset = reduced || current?.kind !== 'gutter' ? 0 : 10 * (1 - Math.min(1, cueElapsedMs / 350));
        text(ctx, 'PLEASE WAIT...', 48 + offset, 980, 20, pink, true);
        text(ctx, this.inspectedGutter ? '"WAIT" IS NOT A PLAN.' : `${pad ? 'D-pad Left' : 'Left Arrow'}: inspect`, 280, 990, 20, '#e4cb93');
      }
      if(transcriptOpen)drawTranscript(ctx,{...panel,index,count:panels.length,pad});
      const complete = cueIndex >= cues[index].length - 1;
      drawControls(ctx,{complete,finalLabel:index===panels.length-1?'Enter district':'Next scene',
        pad,holding,skipProgress,transcriptOpen,paused});
      ctx.restore();
    },
    getDiagnostics() { return { panels: panels.length, inspected: this.inspectedGutter ? ['egg.comic.gutter'] : [] }; }
  };
})();
