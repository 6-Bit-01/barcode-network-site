// Scene-authored dialogue geometry for the existing, uncropped Cache paintings.
// Balloon x/y/w are 1920x1080 canvas pixels. Tail tips and protected rectangles
// are normalized to the actual contain-fitted painting (not the outer canvas).
// tailBase, when present, is a fraction of the balloon width. It routes the
// pointer away from important props; it is not a second speaking position.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/engine/cache-scene-layouts.js', exports: ['BARCODE.CacheSceneLayouts'], dependencies: [] });
(function(B) {
  const bridge = [
    { placements: [
      { x: 96, y: 190, w: 500, radio: true },
      { x: 560, y: 768, w: 800, tail: [.335, .59], tailBase: .20 }
    ], protected: [
      { x: .31, y: .075, w: .145, h: .265, label: '6 Bit face and hat', kind: 'face' },
      { x: .70, y: .04, w: .095, h: .62, label: 'relit district tower', kind: 'object' }
    ] },
    { placements: [
      { x: 96, y: 750, w: 780, tail: [.33, .62], tailBase: .62 },
      { x: 1160, y: 840, w: 660, tail: [.82, .68], tailBase: .85 }
    ], protected: [
      { x: .205, y: .025, w: .17, h: .36, label: 'Mac face and cap', kind: 'face' },
      { x: .52, y: .055, w: .22, h: .465, label: 'Cache face and hat', kind: 'face' },
      { x: .03, y: .16, w: .115, h: .25, label: 'Mac patch connection', kind: 'object' },
      { x: .665, y: .595, w: .145, h: .215, label: 'protected original cassette', kind: 'object' }
    ] },
    { placements: [
      { x: 80, y: 760, w: 680, tail: [.345, .72], tailBase: .64 },
      { x: 1160, y: 840, w: 640, tail: [.915, .77], tailBase: .85 }
    ], protected: [
      { x: .22, y: .015, w: .20, h: .39, label: 'DJ face and visor', kind: 'face' },
      { x: .68, y: .005, w: .295, h: .435, label: 'Cache face and hat', kind: 'face' },
      { x: .49, y: .30, w: .155, h: .285, label: 'original waveform monitor', kind: 'object' },
      { x: .505, y: .60, w: .18, h: .205, label: 'original cassette deck', kind: 'object' },
      { x: .405, y: .72, w: .135, h: .15, label: 'DJ audition hand', kind: 'object' }
    ] },
    { placements: [
      { x: 970, y: 825, w: 870, tail: [.575, .49], tailBase: .98 },
      { x: 1190, y: 628, w: 560, tail: [.86, .59], tailBase: .82 }
    ], protected: [
      { x: .35, y: .01, w: .175, h: .36, label: 'DJ face and visor', kind: 'face' },
      { x: .60, y: .005, w: .32, h: .455, label: 'Cache face and hat', kind: 'face' },
      { x: .015, y: .16, w: .305, h: .61, label: 'clean-copy waveform monitor', kind: 'object' },
      { x: .335, y: .66, w: .145, h: .175, label: 'comparison cassette deck', kind: 'object' },
      { x: .455, y: .615, w: .11, h: .175, label: 'DJ comparison hand', kind: 'object' }
    ] },
    { placements: [
      { x: 80, y: 806, w: 800, tail: [.47, .72], tailBase: .80 },
      { x: 300, y: 606, w: 600, tail: [.205, .55], tailBase: .25 }
    ], protected: [
      { x: .13, y: .22, w: .135, h: .29, label: 'DJ face and visor', kind: 'face' },
      { x: .465, y: .005, w: .305, h: .505, label: 'Cache face and hat', kind: 'face' },
      { x: .585, y: .52, w: .145, h: .23, label: 'protected original in Cache hands', kind: 'object' },
      { x: .505, y: .655, w: .315, h: .25, label: 'Cache sealing hands', kind: 'object' },
      { x: .015, y: .36, w: .10, h: .275, label: 'saved studio trace', kind: 'object' }
    ] },
    { placements: [
      { x: 80, y: 186, w: 430, radio: true },
      { x: 80, y: 780, w: 620, tail: [.285, .67], tailBase: .57 }
    ], protected: [
      { x: .28, y: .045, w: .085, h: .155, label: 'Cache head from behind', kind: 'face' },
      { x: .19, y: .48, w: .055, h: .22, label: 'protected case in Cache hand', kind: 'object' },
      { x: .365, y: .105, w: .53, h: .82, label: 'yellow car and cassette cargo', kind: 'object' }
    ] },
    { placements: [
      { x: 1060, y: 325, w: 740, radio: true },
      { x: 80, y: 835, w: 600, tail: [.185, .76], tailBase: .43 }
    ], protected: [
      { x: .065, y: .005, w: .285, h: .455, label: 'Cache face and hat', kind: 'face' },
      { x: .535, y: .005, w: .23, h: .16, label: 'actual rearview reflection', kind: 'face' },
      { x: .32, y: .385, w: .205, h: .41, label: 'steering hand and wheel', kind: 'object' },
      { x: .575, y: .575, w: .22, h: .235, label: 'cassette loading hand and deck', kind: 'object' }
    ] },
    { placements: [
      { x: 80, y: 210, w: 620, radio: true },
      { x: 1230, y: 245, w: 590, radio: true }
    ], protected: [
      { x: .425, y: .025, w: .125, h: .395, label: 'open-road vanishing point and tower', kind: 'object' },
      { x: .36, y: .46, w: .265, h: .445, label: 'Cache car entering the road', kind: 'object' }
    ] }
  ];
  const ending = [
    { placements: [
      { x: 80, y: 790, w: 840, tail: [.38, .75], tailBase: .65 },
      { x: 80, y: 186, w: 640, radio: true }
    ], protected: [
      { x: .515, y: .005, w: .265, h: .425, label: 'Cache face and hat', kind: 'face' },
      { x: .04, y: .275, w: .255, h: .39, label: 'arrived yellow car', kind: 'object' },
      { x: .56, y: .605, w: .29, h: .335, label: 'delivered original and receiving case', kind: 'object' },
      { x: .425, y: .51, w: .19, h: .22, label: 'Cache delivery hand', kind: 'object' }
    ] },
    { placements: [
      { x: 1280, y: 806, w: 540, tail: [.855, .73], tailBase: .78 },
      { x: 985, y: 630, w: 880, radio: true }
    ], protected: [
      { x: .535, y: .005, w: .285, h: .555, label: 'Cache face and hat', kind: 'face' },
      { x: .11, y: .15, w: .18, h: .415, label: 'DELIVERED monitor glass', kind: 'object' },
      { x: .32, y: .25, w: .185, h: .395, label: 'UNVERIFIED monitor glass', kind: 'object' },
      { x: .175, y: .61, w: .265, h: .245, label: 'delivered cassette below both monitors', kind: 'object' },
      { x: .395, y: .765, w: .245, h: .20, label: 'Cache receiving-console hand', kind: 'object' }
    ] },
    { placements: [
      { x: 80, y: 650, w: 550, radio: true },
      { x: 1410, y: 650, w: 410, radio: true }
    ], protected: [
      { x: .175, y: .005, w: .205, h: .445, label: 'DJ face and visor', kind: 'face' },
      { x: .635, y: .055, w: .17, h: .445, label: 'Mac face and cap', kind: 'face' },
      { x: .38, y: .43, w: .16, h: .195, label: 'original trace monitor', kind: 'object' },
      { x: .575, y: .44, w: .145, h: .19, label: 'copy trace monitor', kind: 'object' },
      { x: .345, y: .635, w: .39, h: .23, label: 'both retained cassette decks', kind: 'object' }
    ] },
    { placements: [
      { x: 800, y: 170, w: 960, radio: true },
      { x: 80, y: 785, w: 820, radio: true }
    ], protected: [
      { x: .18, y: .015, w: .215, h: .435, label: 'Mac face and cap', kind: 'face' },
      { x: .08, y: .37, w: .24, h: .345, label: 'Mac patch lead and hand', kind: 'object' },
      { x: .56, y: .48, w: .38, h: .255, label: 'closed street-enforcement gate', kind: 'object' }
    ] }
  ];
  // Freeze every record so all painters and verification tools share the same
  // authored positions without a render pass mutating later scene geometry.
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  B.CacheSceneLayouts = freeze({ bridge, ending });
})(window.BARCODE = window.BARCODE || {});
