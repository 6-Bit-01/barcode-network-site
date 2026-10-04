// Authored records. Save files keep these stable IDs, not copies of prose.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/lore-records.js', exports: ['BARCODE.LoreRecords'], dependencies: [] });
(function() {
  const BARCODE = window.BARCODE = window.BARCODE || {};
  const records = [
    {
      id: 'lore.l01.01', number: '01', title: 'Four Names on the Tape', author: 'CACHE BACK', source: 'Protected session notes',
      paragraphs: [
        'The label says BARCODE: 6 Bit, DJ Floppydisc, Cache Back, Mac Modem. Four voices before the Network started calling everything its signal.',
        'I know what a bad label can do. I woke up from a cleared laptop cache convinced I was callembini. The files survived. Sorting out who I was took longer.',
        'We locked these memories inside the system. Keep the names with the music. A clean copy means nothing if it erases the people who made it.'
      ],
      response: '6 Bit: "The Network can keep the stationery. That\'s our tape."'
    },
    {
      id: 'lore.l01.02', number: '02', title: 'The Other Side of Silence', author: 'DJ FLOPPYDISC', source: 'Isolated channel check',
      paragraphs: [
        'Two waveforms in the same channel. Same timing. Same shape. Every peak on the second trace points the other way.',
        'Together, they cancel. Separate them and both are still there. Someone listening only to the mix could mistake that silence for an empty track.',
        'I have kept both traces. Source unresolved. Do not normalize, overwrite, or discard either one. First we find out what we are actually hearing.'
      ],
      response: '6 Bit: "Great. Even the silence has a second track."'
    },
    {
      id: 'lore.l01.03', number: '03', title: 'A Whole Block on Mute', author: 'MAC MODEM', source: 'Relay carrier trace',
      paragraphs: [
        'The Broadcast Jammer doesn\'t have to chase anybody. It leans on the whole block: signs, gate lines, speakers. Different systems, same ugly pulse.',
        'That is how you hold a street hostage without taking a step. Leave the transmitter alone and you can spend all night fighting the things underneath it.',
        'I kept the carrier trace. Find what is feeding that interference and cut the transmission. I want to hear the neighborhood again.'
      ],
      response: '6 Bit: "We came to bring the volume back. Let\'s do that."'
    }
  ].map(record => Object.freeze({ ...record, paragraphs: Object.freeze(record.paragraphs) }));
  const level2 = [
    {
      id: 'lore.l02.01', number: '04', levelId: 'level-02', title: 'A Copy That Travels', author: 'CACHE BACK', source: 'Transit integrity note',
      paragraphs: [
        'A transfer receipt tells me a file arrived. It does not tell me the file is still ours.',
        'The original has names, room noise, and the bit where somebody comes in too soon. The clean copy keeps enough music to sound familiar. It drops the parts that tell me who was in the room.',
        'DJ has both versions. I am taking the original through. If something changes between here and the receiver, we can point to the gap instead of arguing about what we remember.'
      ],
      response: '6 Bit: "Please tell me you kept the part where I nailed it."'
    },
    {
      id: 'lore.l02.02', number: '05', levelId: 'level-02', title: 'Leave the Mistakes In', author: 'CACHE BACK', source: 'Original / clean comparison',
      paragraphs: [
        'In the original, you hear someone getting ready before the music. The clean version jumps straight to the finished part.',
        'That little gap matters. So do the names and the bad entry. They put us in the same room, making something together. Remove enough of them and you can call the result whatever you want.',
        'Keep the clean copy too. I want the comparison. Protecting the original does not mean throwing away the evidence of what changed.'
      ],
      response: 'DJ Floppydisc: "Both traces. Nothing overwritten."'
    },
    {
      id: 'lore.l02.03', number: '06', levelId: 'level-02', title: 'A Familiar Rhythm', author: 'DJ FLOPPYDISC', source: 'Damaged pursuit-channel log',
      paragraphs: [
        'There is a pause in this damaged transmission, then a stressed syllable. Listen twice and it starts to sound like 6 Bit.',
        'The channel repeats fragments. Part of the beginning is missing. Familiar timing is not a voice identification, and cleaning this up could make it sound more certain than it is.',
        'I saved the extract with its damage intact. SOURCE UNRESOLVED. We can compare it when we have more than a rhythm and a guess.'
      ],
      response: '6 Bit: "Sounds like me is not the same as me."'
    },
    {
      id: 'lore.l02.04', number: '07', levelId: 'level-02', title: 'Delivered Is Not Distributed', author: 'MAC MODEM', source: 'Receiver routing trace',
      paragraphs: [
        'The receiver records an arrival and a separate distribution decision. Getting a file to this address does not put it on the neighborhood channels.',
        'The routing trace sends a distribution hold to street enforcement. There is a route into that sector. There is no name here that tells me who ordered the hold.',
        'Cache can finish the delivery. I can follow the hold to where it is being enforced. Neither job replaces the other.'
      ],
      response: 'Cache Back: "Get it heard. Keep it intact."'
    }
  ].map(record => Object.freeze({ ...record, paragraphs: Object.freeze(record.paragraphs) }));
  const all = Object.freeze([...records, ...level2]);
  const byId = new Map(all.map(record => [record.id, record]));
  BARCODE.LoreRecords = Object.freeze({
    level1: Object.freeze(records),
    level2: Object.freeze(level2),
    all,
    get: id => byId.get(id) || null,
    preview: id => {
      const record = byId.get(id);
      return record ? `ARCHIVE ${record.number} // ${record.title.toUpperCase()} — ${record.paragraphs[0]}` : '';
    },
    wrap(ctx, text, width) {
      const lines = []; let line = '';
      for (const word of String(text).split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
        else line = next;
      }
      if (line) lines.push(line);
      return lines;
    }
  });
})();
