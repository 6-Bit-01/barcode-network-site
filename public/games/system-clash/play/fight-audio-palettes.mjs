/** Original procedural character Foley; no samples, cloned voices or shared
 * pitch-only skins. Four authored gestures per fighter change source, rhythm,
 * filtering and release. Impact accents sit above the existing material and
 * Deletion-mechanism beds, which remain owned by fight-audio.mjs.
 */
export const CHARACTER_FOLEY_VARIANTS=4;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const tone=(frequency,end,duration,gain,delay=0,waveform='triangle')=>({kind:'tone',frequency,end,duration,gain,delay,waveform});
const noise=(frequency,duration,gain,delay=0,filter='bandpass',q=1)=>({kind:'noise',frequency,end:frequency,duration,gain,delay,filter,q});
const T=tone,N=noise;
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export const CHARACTER_FOLEY_PALETTES=freeze({
  'doofnoobler':{texture:'plush sleeve swishes, felt thumps and friendly rubber squeaks',air:2200,body:420,material:'organic',gestures:[
    [N(1900,.12,.1,0,'bandpass',.5),T(590,430,.06,.07,.024,'sine')],
    [T(430,730,.035,.07,0,'triangle'),N(1400,.045,.09,.039,'bandpass',.8),N(2500,.05,.07,.095,'highpass')],
    [N(3100,.03,.075,0,'highpass'),N(1150,.14,.105,.02,'bandpass',.5),T(780,390,.07,.06,.089,'sine')],
    [T(350,650,.024,.055,0,'triangle'),N(2100,.055,.11,.041,'bandpass',1.1),T(670,420,.04,.07,.116,'sine'),N(1700,.042,.05,.152,'highpass')]
  ]},
  'lyra':{texture:'servo purrs, claw clicks and a clean cyan discharge',air:7200,body:630,material:'metal',gestures:[
    [T(2530,1460,.035,.09,0,'square'),N(7400,.025,.11,.014,'highpass'),T(1870,1740,.11,.08,.041,'sine')],
    [N(5800,.018,.1,0,'highpass'),T(1430,2990,.024,.09,.032,'square'),N(6700,.036,.08,.074,'bandpass',5),T(2110,1530,.056,.06,.125,'triangle')],
    [T(850,3450,.105,.09,0,'sawtooth'),N(7100,.069,.11,.018,'highpass'),T(2760,790,.082,.08,.066,'sine')],
    [N(6500,.018,.08,0,'highpass'),T(3310,1920,.023,.09,.037,'square'),T(1740,2190,.032,.075,.077,'triangle'),N(4700,.047,.09,.128,'bandpass',3)]
  ]},
  'papa-oak':{texture:'root creaks, hollow trunk knocks and staggered bark fractures',air:960,body:59,material:'organic',gestures:[
    [N(390,.14,.13,0,'lowpass'),T(61,27,.18,.11,.028,'triangle'),N(1900,.034,.08,.074,'bandpass',3)],
    [N(730,.03,.1,0,'bandpass',4),N(230,.1,.11,.052,'lowpass'),T(78,30,.13,.105,.099,'square'),N(1310,.044,.06,.166,'bandpass',2)],
    [T(96,24,.22,.12,0,'sawtooth'),N(580,.17,.12,.021,'lowpass'),N(2490,.038,.08,.093,'bandpass',4)],
    [N(450,.025,.08,0,'bandpass',4),T(53,28,.11,.09,.039,'triangle'),N(1070,.055,.115,.092,'bandpass',3),N(240,.12,.1,.154,'lowpass')]
  ]},
  '6-bit':{texture:'pixel crunch and clipped square ticks',air:3100,body:185,material:'organic',gestures:[
    [T(880,220,.026,.1,0,'square'),N(3900,.036,.13,.009,'highpass'),T(170,55,.073,.08,.02,'triangle')],
    [T(1120,700,.028,.09,0,'square'),T(660,165,.038,.12,.052,'square'),N(2400,.063,.08,.024,'bandpass',2)],
    [N(4700,.059,.11,0,'highpass'),T(1350,90,.122,.13,.012,'sawtooth'),T(140,65,.023,.055,.085,'square')],
    [N(1750,.029,.12,0,'bandpass',3),T(600,450,.034,.08,.025,'square'),T(195,40,.105,.1,.07,'square'),N(820,.046,.075,.114,'bandpass',2)],
  ]},
  '9-bit':{texture:'corrupted sub grind and staggered dark fractures',air:1250,body:74,material:'organic',gestures:[
    [T(92,28,.174,.14,0,'sawtooth'),N(460,.074,.12,.007,'lowpass'),T(240,55,.051,.055,.052,'square')],
    [N(710,.056,.11,0,'bandpass',3),T(122,33,.096,.14,.022,'square'),N(1900,.033,.08,.086,'highpass'),T(62,26,.139,.065,.112,'triangle')],
    [T(165,38,.13,.12,0,'sawtooth'),T(49,23,.2,.12,.047,'sine'),N(1300,.115,.105,.083,'bandpass',.6)],
    [N(340,.053,.1,0,'lowpass'),N(980,.037,.115,.067,'bandpass',2.4),T(85,27,.126,.13,.102,'square'),N(2300,.024,.06,.139,'highpass')],
  ]},
  'cache-back':{texture:'gated relay snaps, servo sweeps and bright alloy rings',air:4600,body:285,material:'metal',gestures:[
    [T(1860,560,.046,.08,0,'square'),N(5800,.02,.12,.004,'highpass'),T(1283,1190,.129,.095,.025,'triangle')],
    [T(730,1560,.033,.09,0,'square'),T(2080,910,.027,.095,.046,'square'),N(4100,.041,.09,.082,'bandpass',4),T(941,820,.099,.07,.106,'sine')],
    [N(3200,.027,.11,0,'bandpass',5),T(510,2270,.132,.105,.014,'sawtooth'),T(1739,1560,.158,.085,.064,'triangle')],
    [T(2490,1310,.022,.09,0,'square'),N(6200,.019,.1,.033,'highpass'),T(610,1480,.04,.075,.073,'square'),N(2700,.033,.08,.117,'bandpass',4),T(1127,960,.1,.055,.15,'triangle')],
  ]},
  'mac-modem':{texture:'telephone handshake chirps and coarse carrier static',air:2100,body:125,material:'organic',gestures:[
    [T(697,1209,.064,.09,0,'sine'),N(1700,.094,.11,.027,'bandpass',.8),T(1209,410,.063,.09,.067,'square')],
    [N(2400,.039,.1,0,'highpass'),T(941,1477,.035,.095,.038,'sine'),T(770,1336,.054,.095,.091,'square'),N(920,.064,.07,.129,'bandpass',2)],
    [T(1650,440,.143,.12,0,'sawtooth'),N(2900,.102,.105,.025,'bandpass',3),T(350,85,.057,.06,.109,'triangle')],
    [T(852,852,.026,.08,0,'sine'),N(3700,.018,.09,.028,'highpass'),T(1336,697,.039,.09,.065,'square'),N(1400,.082,.12,.124,'bandpass',1.2)],
  ]},
  'dj-floppydisc':{texture:'vinyl scrub, platter brake and syncopated rim clicks',air:3700,body:215,material:'organic',gestures:[
    [N(2600,.092,.13,0,'bandpass',1.8),T(520,145,.087,.095,.014,'sawtooth'),N(4800,.024,.075,.072,'highpass')],
    [N(1600,.043,.1,0,'bandpass',2.5),N(3900,.036,.12,.051,'bandpass',2),T(650,205,.053,.085,.091,'triangle'),N(5100,.022,.055,.142,'highpass')],
    [T(210,1070,.063,.08,0,'sawtooth'),N(3300,.123,.14,.015,'bandpass',3.5),T(1070,70,.143,.075,.067,'triangle')],
    [N(4200,.02,.09,0,'highpass'),T(880,280,.047,.08,.031,'square'),N(2100,.044,.115,.088,'bandpass',2),N(4600,.065,.11,.143,'bandpass',.9)],
  ]},
  'cliff':{texture:'dry wooden clacks, hollow clipboard taps and dust rattle',air:2750,body:325,material:'organic',gestures:[
    [N(1520,.027,.14,0,'bandpass',3.5),T(340,165,.062,.09,.006,'triangle'),N(5400,.031,.065,.041,'highpass')],
    [T(470,230,.028,.08,0,'triangle'),N(2300,.019,.115,.033,'bandpass',4),T(285,130,.044,.09,.081,'sine'),N(3500,.032,.075,.109,'highpass')],
    [N(750,.079,.11,0,'bandpass',2),T(690,185,.08,.1,.026,'triangle'),N(3900,.092,.09,.075,'highpass')],
    [N(1800,.018,.12,0,'bandpass',4),T(510,300,.025,.07,.049,'triangle'),N(1100,.033,.115,.097,'bandpass',3),T(230,98,.079,.08,.146,'triangle')],
  ]},
  'mr-nice-guy':{texture:'clean airy chimes and measured harmonic flashes',air:5100,body:440,material:'organic',gestures:[
    [N(5600,.058,.07,0,'highpass'),T(523,784,.094,.105,.011,'sine'),T(1046,880,.136,.08,.043,'triangle')],
    [T(659,659,.042,.085,0,'sine'),T(988,1175,.072,.1,.061,'triangle'),N(4200,.042,.07,.087,'highpass'),T(1318,1046,.08,.055,.124,'sine')],
    [N(3800,.123,.09,0,'highpass'),T(392,784,.158,.11,.014,'triangle'),T(1175,1568,.096,.055,.083,'sine')],
    [T(784,698,.044,.075,0,'sine'),N(6200,.023,.075,.026,'highpass'),T(1046,1175,.052,.095,.087,'triangle'),T(1568,1318,.109,.085,.146,'sine')],
  ]},
  'ms-mayhem':{texture:'snare cracks, serrated rasp and broken crash tails',air:5200,body:150,material:'organic',gestures:[
    [N(2500,.036,.15,0,'bandpass',1),T(185,48,.091,.09,.009,'sawtooth'),N(6600,.094,.09,.032,'highpass')],
    [N(5100,.027,.11,0,'highpass'),T(340,76,.042,.095,.028,'square'),N(1900,.041,.115,.075,'bandpass',2.5),N(7300,.056,.08,.127,'highpass')],
    [T(520,80,.105,.12,0,'sawtooth'),N(2800,.174,.15,.016,'bandpass',.75),T(110,40,.079,.06,.118,'square')],
    [N(1700,.02,.13,0,'bandpass',3),N(6400,.046,.1,.043,'highpass'),T(245,60,.045,.08,.098,'square'),N(3700,.092,.11,.147,'bandpass',1.1)],
  ]},
  'stolz':{texture:'massive iron knocks, furnace grind and inharmonic anvil rings',air:1650,body:88,material:'metal',gestures:[
    [T(92,32,.119,.12,0,'triangle'),N(1500,.042,.1,.009,'bandpass',2),T(437,401,.207,.09,.017,'sine'),T(913,857,.13,.045,.023,'triangle')],
    [N(3200,.023,.09,0,'highpass'),T(197,80,.064,.105,.021,'square'),T(587,549,.139,.08,.078,'sine'),N(730,.11,.105,.103,'bandpass',3.5)],
    [T(67,24,.221,.135,0,'sine'),N(420,.16,.12,.026,'lowpass'),T(731,647,.176,.08,.083,'triangle')],
    [N(1120,.028,.115,0,'bandpass',4),T(307,263,.082,.07,.039,'sine'),N(2300,.033,.1,.1,'bandpass',2.8),T(1231,1127,.133,.075,.146,'triangle'),T(82,29,.1,.065,.155,'sine')],
  ]},
  'kaveman-brown':{texture:'earthy club thumps, stone knock and granular debris',air:1150,body:63,material:'organic',gestures:[
    [T(72,25,.139,.14,0,'sine'),N(580,.072,.13,.007,'lowpass'),N(1750,.025,.08,.023,'bandpass',3)],
    [N(830,.029,.1,0,'bandpass',2),T(105,34,.071,.115,.018,'triangle'),N(440,.062,.11,.068,'lowpass'),T(220,64,.039,.065,.121,'triangle')],
    [T(165,38,.075,.09,0,'triangle'),N(300,.154,.13,.027,'lowpass'),N(1250,.131,.13,.058,'bandpass',.7)],
    [N(630,.022,.12,0,'lowpass'),T(310,100,.031,.075,.052,'triangle'),N(1600,.02,.095,.096,'bandpass',3),T(82,28,.12,.13,.139,'sine')],
  ]},
  'dr3wbaby':{texture:'syncopated breakbeat kick, clap slap and hat shuffle',air:6100,body:112,material:'organic',gestures:[
    [T(135,38,.105,.12,0,'sine'),N(1700,.035,.12,.033,'bandpass',1.5),N(6700,.021,.06,.087,'highpass')],
    [N(7100,.018,.075,0,'highpass'),T(190,43,.061,.11,.03,'triangle'),N(2200,.026,.11,.087,'bandpass',1),N(5400,.023,.08,.13,'highpass')],
    [N(1400,.057,.105,0,'bandpass',2),N(3200,.041,.08,.019,'bandpass',1),T(95,31,.14,.12,.068,'sine'),N(6400,.042,.075,.126,'highpass')],
    [T(155,49,.037,.08,0,'triangle'),N(7600,.016,.065,.049,'highpass'),N(2100,.032,.12,.1,'bandpass',1.7),T(110,35,.079,.105,.148,'sine'),N(5900,.022,.065,.163,'highpass')],
  ]},
  'ash-flowers':{texture:'warm ember puffs, paper flutter and soft ceramic petals',air:4200,body:260,material:'organic',gestures:[
    [N(980,.092,.11,0,'bandpass',.65),T(740,510,.121,.09,.023,'sine'),N(4800,.056,.07,.066,'highpass')],
    [N(3600,.035,.08,0,'highpass'),T(620,810,.052,.09,.043,'triangle'),N(1900,.045,.105,.083,'bandpass',.8),T(1260,920,.096,.065,.13,'sine')],
    [T(310,590,.096,.08,0,'sine'),N(740,.169,.13,.024,'bandpass',.6),N(5100,.108,.085,.084,'highpass')],
    [N(2400,.024,.085,0,'bandpass',2),T(910,710,.038,.075,.029,'sine'),N(1200,.041,.09,.091,'bandpass',1),T(470,350,.122,.105,.147,'triangle')],
  ]},
  'wittyf0x':{texture:'quick brush rustles, paw snaps and darting bright chirrs',air:6600,body:390,material:'organic',gestures:[
    [N(6800,.035,.12,0,'highpass'),T(2140,910,.046,.095,.005,'triangle'),N(2900,.043,.08,.041,'bandpass',2)],
    [T(1720,2830,.027,.075,0,'sine'),N(5400,.027,.095,.033,'highpass'),T(2570,1180,.039,.095,.074,'triangle'),N(3600,.024,.07,.12,'bandpass',3)],
    [N(4200,.096,.13,0,'highpass'),T(1140,2860,.075,.09,.026,'sine'),T(2860,720,.085,.06,.099,'triangle')],
    [N(7400,.019,.075,0,'highpass'),T(2380,1370,.024,.085,.032,'square'),N(2300,.027,.08,.077,'bandpass',4),T(1390,420,.051,.085,.137,'triangle'),N(5800,.035,.055,.159,'highpass')],
  ]},
});

const eventFamily=type=>({jump:'jump',attack:'attack',special:'special',miss:'miss',hit:'impact','deletion-impact':'impact','weapon-embed':'impact',block:'block',throw:'throw',land:'land',ko:'land',deletion:'deletion','deletion-cue':'deletion','weapon-pickup':'weapon','weapon-use':'weapon','weapon-throw':'weapon','weapon-empty':'weapon'})[type];
const appendFamilies=new Set(['impact','deletion','land']);
const familyShape={jump:[.56,.55,.52],attack:[.78,.73,.95],special:[1.12,1.18,1],miss:[.9,.9,.54],impact:[.52,.67,.65],block:[.56,.55,.83],throw:[1.06,1.09,.78],land:[.7,.76,.6],deletion:[1.15,1.19,.72],weapon:[.81,.88,.82]};

/** Pure event routing. `replace` applies only to action Foley; material hit beds
 * and established cut/crush/puncture/energy/slam Deletions are always appended.
 * Explicit variant chooses an authored gesture; the playback owner advances it.
 */
export function planCharacterFoley(event={},options={}){
  const type=event.type??'',family=eventFamily(type);
  const attackerId=options.attackerId??event.attackerId??event.fighterId;
  const victimId=options.victimId??event.victimId??event.targetId;
  const fighterId=family==='block'||family==='land'?victimId??attackerId:attackerId;
  const palette=CHARACTER_FOLEY_PALETTES[fighterId];
  const variant=((Math.trunc(finite(options.variant,0))%CHARACTER_FOLEY_VARIANTS)+CHARACTER_FOLEY_VARIANTS)%CHARACTER_FOLEY_VARIANTS;
  const victimPalette=CHARACTER_FOLEY_PALETTES[victimId];
  const material=victimPalette?.material==='metal'||options.material==='metal'||event.victimMaterial==='metal'?'metal':'organic';
  if(!palette||!family)return {layers:[],family:family??null,replace:false,variant,fighterId,material};
  const strength=clamp(finite(options.strength,finite(event.strength,1)),.25,3.4);
  const heavy=options.heavy??(type==='deletion-impact'||strength>=1.65||finite(event.damage,0)>=18);
  const [delayScale,durationScale,level]=familyShape[family];
  const role=family==='block'?'defender-signature':family==='land'?'victim-signature':'attacker-signature';
  const layers=palette.gestures[variant].map(item=>({...item,delay:item.delay*delayScale,duration:item.duration*durationScale,gain:item.gain*level*(heavy?1.12:1),role,fighterId,texture:palette.texture}));
  const add=(item,layerRole=role)=>layers.push({...item,role:layerRole,fighterId:layerRole==='victim-material'?victimId:fighterId,texture:layerRole==='victim-material'?material:palette.texture});
  // Action punctuation changes by gesture: leading sweep, delayed cutoff,
  // sustained drag, or two separated accents, rather than pitch randomization.
  if(family==='jump')add(N(palette.air*.55,.055,.065,variant===1?.043:variant===3?.087:0,'highpass'));
  if(family==='attack'||family==='special'||family==='miss'){
    const sweeps=[N(palette.air,.054,.075,0,'highpass'),N(palette.air*.71,.035,.08,.055,'bandpass',2),N(palette.air*.84,.12,.075,.008,'bandpass',.8),N(palette.air,.03,.055,.044,'highpass')];
    add(sweeps[variant]);
    if(variant===3)add(N(palette.air*.62,.038,.045,.135,'bandpass',2.2));
  }
  if(family==='block'||family==='throw'){
    const at=family==='throw'?.092:.005;
    if(material==='metal'){
      add(N(victimId==='cache-back'?5400:2100,heavy?.075:.032,.12,at,'highpass'),'victim-material');
      add(T(victimId==='cache-back'?1283:437,victimId==='cache-back'?1100:397,.17,.085,at+.018,'triangle'),'victim-material');
    }else{
      add(N(family==='throw'?550:1150,family==='throw'?.11:.033,.13,at,'lowpass'),'victim-material');
      add(T(family==='throw'?92:160,34,family==='throw'?.14:.053,.08,at+.012,'triangle'),'victim-material');
    }
  }
  if(family==='weapon'){
    if(type==='weapon-empty')for(const item of layers){item.delay*=.38;item.duration*=.4;item.gain*=.5;}
    if(type==='weapon-pickup')add(T(palette.body*2,palette.body*3,.06,.08,.08,'triangle'));
    if(type==='weapon-throw')add(N(palette.air,.14,.09,.02,'highpass'));
    if(type==='weapon-use'&&event.weaponType==='pulse-driver'){
      add(T(1240,75,.19,.13,0,'sawtooth'));
      add(N(5200,.058,.085,.015,'highpass'));
    }
  }
  // Only accents are returned for damage and Deletion. Their established
  // mechanism and victim contact never get replaced by character gestures.
  const budget=appendFamilies.has(family)?.28:.55;
  const total=layers.reduce((sum,item)=>sum+item.gain,0),scale=Math.min(1,budget/Math.max(.001,total));
  for(const item of layers){
    item.gain*=scale;
    item.duration=clamp(item.duration,.01,.36);
    item.delay=clamp(item.delay,0,.22);
    item.frequency=clamp(item.frequency,25,7900);
    item.end=clamp(item.end,20,7900);
  }
  return {layers,family,replace:!appendFamilies.has(family),variant,fighterId,material};
}

