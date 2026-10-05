// Cache Back chase. Shared input/RAF/audio/save/pause owners; optional chapter
// metadata makes newly started runs eligible for the authored Level 2 ending.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-proof.js', exports: ['BARCODE.CacheRoadProof'], dependencies: ['BARCODE.Campaign', 'BARCODE.MusicTransport'] });
(function(B) {
  'use strict';
  const ID = 'level-02', PROFILE = 'level-02.proof';
  const LAP = 2460, END = 4 * LAP, WORLD_END = 15000;
  const BAR_BEATS = 4, PULSE_BEATS = 32;
  // Route addresses select encounters. Every announced action owns the
  // next measure's ONE, with a complete preceding measure to approach it.
  const PAD_REVEAL = 345;
  const GEAR_SPEEDS = [30, 52, 70], SHIFT_BLEND_BEATS = .75;
  // Road distance is an integral of the AUDIO clock, never RAF time. A bar
  // owns its trajectory before its pad appears. Inputs only queue the next
  // bar; no input can move paint which has already been announced.
  function drivePosition(section, beat) {
    const age=clamp(beat-section.beat,0,4)*section.beatSec;
    const blend=SHIFT_BLEND_BEATS*section.beatSec;
    const u=Math.min(1,age/blend);
    const easingIntegral=u*u*u-u*u*u*u/2;
    return section.from+section.v0*Math.min(age,blend)+
      (section.speed-section.v0)*blend*easingIntegral+
      section.speed*Math.max(0,age-blend);
  }
  function roadAtBeat(s,beat) {
    const section=s.driveSections?.find(part=>beat>=part.beat&&beat<=part.beat+4);
    return section?drivePosition(section,beat):null;
  }
  function shiftPose(s,reduced) {
    const rest={depth:CAR_DEPTH,scale:1,offset:0};
    if(reduced)return rest;
    const age=s.musicBeatFloat-s.shiftStartBeat;
    const section=s.driveSections?.find(part=>part.beat===s.shiftStartBeat);
    const guard=Math.max(.32,pulseWindowSec(s)/(section?.beatSec||60/128)+.04);
    if(!Number.isFinite(age)||age<=guard||age>=4-guard)return rest;
    // A complete car moves along the road's perspective, including its
    // shadows/wheels. Load once, launch once, then settle. Both downbeat
    // windows remain completely still, even if another shift is queued.
    const u=(age-guard)/(4-2*guard);
    const ease=v=>v*v*v*(v*(v*6-15)+10);
    const delta=u<.16?.025*ease(u/.16):u<.53?
      .025-.085*ease((u-.16)/.37):-.06*(1-ease((u-.53)/.47));
    const depth=CAR_DEPTH+delta;
    return {depth,scale:depth/CAR_DEPTH,
      offset:(ROAD_BOTTOM-ROAD_HORIZON)*(depth*depth-CAR_DEPTH*CAR_DEPTH)};
  }
  function shiftOffset(s,reduced) { return shiftPose(s,reduced).offset; }
  const ROAD_HORIZON = 400, ROAD_BOTTOM = 1080;
  const CAR_DEPTH = .83, CAR_WIDTH = 164, CAR_HEIGHT = 119, CAR_TIRE_CONTACT = .14;
  // The note center meets Cache's rear tire contact. The same road curve
  // projects the pad, permanent timing line and phrase paint.
  const STRIKE_DEPTH = Math.sqrt(CAR_DEPTH*CAR_DEPTH-
    CAR_HEIGHT*CAR_TIRE_CONTACT/(ROAD_BOTTOM-ROAD_HORIZON));
  const STRIKE_DISTANCE = (1-STRIKE_DEPTH)*520-80;
  const PULSE_WINDOW_SEC = .13;
  const pulseWindowSec = s => s.encounters?.version >= 2 ? .18 : PULSE_WINDOW_SEC;
  const LANES = ['DRIVE', 'FLOW', 'BREAKAWAY', 'UNDERCURRENT'];
  // Wide, optional listening zones use lane dwell, never rhythm-button timing.
  const RECORD_ZONES = [[12,20,0],[36,44,2],[60,68,1],[84,90,3]];
  const RECORD_DWELL_MS = 650;
  const PULSE_ACTIONS = [
    { key: 'road_a', label: 'SURGE', button: 0, keyboard: 'K' },
    { key: 'road_b', label: 'PUSH', button: 1, keyboard: 'L' },
    { key: 'road_x', label: 'BRACE', button: 2, keyboard: 'J' },
    { key: 'road_y', label: 'REFILL', button: 3, keyboard: 'I' }
  ];
  // Two planned runs per lap, with breathing room between them. Each run
  // visits all four lanes; the road and traffic rotate together on later laps.
  // Braking or boosting cannot move an already announced target beat.
  const PULSE_RUNS = [
    [[150,0,0],[365,1,2],[585,3,3],[810,2,1]],
    [[1260,2,3],[1490,1,0],[1720,0,2],[1895,3,1]]
  ];
  const PULSES = Array.from({ length: 6 }, (_, pass) =>
    PULSE_RUNS.flatMap((run, runIndex) => run.map(([at, lane, action], order) => ({
      at: at + pass * LAP, lane: (lane + pass) % 4, action,
      id: `${pass}/${runIndex}/${order}`, run: `${pass}/${runIndex}`, order
    })))).flat();
  const CHECKPOINTS = { 'road-start': 0, 'road-cache': 850, 'road-fork': 1700,
    'road-verse-2': 28, 'road-verse-3': 52, 'road-verse-4': 76,
    'road-gate': 92, 'road-clear': 100 };
  const TRAFFIC = [
    [190, 1, 'freight'], [275, 2, 'van'], [350, 0, 'block'], [465, 2, 'sweeper'],
    [550, 1, 'block'], [635, 2, 'freight'], [735, 0, 'trike'], [895, 3, 'block'],
    [975, 1, 'freight'], [1050, 2, 'block'], [1135, 0, 'audit'], [1220, 3, 'shuttle'],
    [1320, 1, 'block'], [1415, 2, 'sweeper'], [1510, 0, 'freight'], [1610, 3, 'van'],
    [1765, 1, 'freight'], [1840, 2, 'block'], [1930, 0, 'trike'], [2005, 1, 'sweeper'],
    [2170, 2, 'audit'], [2265, 0, 'block'], [2345, 1, 'freight']
  ];
  // Paired traffic narrows the route at readable, repeatable places. Its open
  // lanes rotate each pass; a driver can always plan a route from the horizon.
  const GATES = { 550: [2], 975: [2, 3], 1320: [0], 1840: [1], 2005: [3], 2345: [2] };
  const HAZARDS = TRAFFIC.flatMap(([at, lane, kind]) => Array.from({ length: 6 }, (_, pass) => [
    { at: at + pass * LAP, lane: (lane + pass) % 4, kind },
    ...(GATES[at] || []).map(extra => ({ at: at + pass * LAP,
      lane: (extra + pass) % 4, kind: 'block' }))
  ]).flat());
  // Each whole painting is a single world site. The open parking surface is
  // constructed on the projected ground instead of using a fixed bitmap slab.
  const PLACE_ART = {
    market: ['cachePlaceMarket',960,876,700,150],
    house: ['cachePlaceHouse',960,891,700,135],
    garage: ['cachePlaceGarage',960,632,700,175],
    apartment: ['cachePlaceApartment',631,960,490,135],
    diner: ['cachePlaceDiner',960,618,700,170],
    park: ['cachePlacePark',960,640,650,165],
    substation: ['cachePlaceSubstation',960,638,680,185],
    garden: ['cachePlaceGarden',960,800,620,190],
    construction: ['cachePlaceConstruction',960,640,650,195]
  };
  // A site keeps one whole painting with a side-specific ground silhouette.
  // The first six are already painted for their assigned bank. The later
  // five cyber sources turn as a whole for the right; two more are fitted
  // directly to the left bank.
  const SIDE_VARIANTS = {
    gardenRounded: {kind:'garden',side:-1,art:['cachePlaceGardenRounded',960,646,620]},
    gardenCompact: {kind:'garden',side:-1,art:['cachePlaceGardenCompact',960,793,620]},
    gardenHorizon: {kind:'garden',side:1,art:['cachePlaceGardenHorizon',960,540,620]},
    constructionRounded: {kind:'construction',side:-1,art:['cachePlaceConstructionRounded',960,585,650]},
    constructionHorizon: {kind:'construction',side:1,art:['cachePlaceConstructionHorizon',960,585,650]},
    constructionCompact: {kind:'construction',side:1,art:['cachePlaceConstructionCompact',960,692,650]},
    signalOrchard: {kind:'garden',side:1,flip:true,art:['cachePlaceSignalOrchard',960,633,600]},
    relayExchange: {kind:'substation',side:1,flip:true,art:['cachePlaceRelayExchange',960,1420,360]},
    dataReclamation: {kind:'construction',side:1,flip:true,art:['cachePlaceDataReclamation',960,597,560]},
    capacitorExchange: {kind:'substation',side:1,flip:true,art:['cachePlaceCapacitorExchange',960,721,550]},
    nightDataMarket: {kind:'market',side:1,flip:true,art:['cachePlaceNightDataMarket',960,633,560]},
    encryptedPump: {kind:'substation',side:-1,flip:false,art:['cachePlaceEncryptedPump',960,637,550]},
    droneServiceNode: {kind:'garage',side:-1,flip:false,art:['cachePlaceDroneServiceNode',960,643,520]}
  };
  // This source's long fence rises toward the right: it is a left-bank
  // painting, not a reversible generic substation. Resolve the source key
  // before scenery/clearance generation so both cameras share the same site.
  const PLACE_BANK_RULES=Object.freeze({
    cachePlaceSubstation:Object.freeze({side:-1,flip:false,
      rightVariant:'capacitorExchange'})
  });
  // Curated addresses replace their picture within the existing site cadence.
  // Some existing right-hand park/substation slots become a garden or yard;
  // the total number of locations and their positions do not change.
  const FEATURED_SITES = {
    '1:623':'relayExchange',
    '1:2685':'nightDataMarket',
    '-1:3138':'constructionRounded',
    '1:3635':'constructionHorizon',
    '-1:4460':'gardenRounded',
    '1:5055':'dataReclamation',
    '1:5829':'signalOrchard',
    '-1:6303':'gardenCompact',
    '-1:6511':'droneServiceNode',
    '1:7015':'constructionCompact',
    '-1:7427':'encryptedPump',
    '1:8158':'gardenHorizon',
    '1:8846':'capacitorExchange'
  };
  // Preserve the painted bank taper: its higher contact faces the road.
  // Door positions alone cannot determine the house or park's source bank.
  const PLACE_SOURCE_SIDES=Object.freeze({market:1,house:-1,garage:-1,
    apartment:1,diner:1,park:-1,substation:-1,garden:-1,construction:1});
  const placeFacesRoad = (kind, side) =>
    PLACE_BANK_RULES[PLACE_ART[kind]?.[0]]?.flip ??
      (side !== PLACE_SOURCE_SIDES[kind]);
  const PLACE_KINDS = [...Object.keys(PLACE_ART),'parking'];
  // Seeded choices keep the lots varied yet identical after pause, retry,
  // saved-road restore and frame-rate changes.
  const placeRandom = n => {
    let x = Math.imul(n ^ n >>> 16, 0x7feb352d);
    x = Math.imul(x ^ x >>> 15, 0x846ca68b);
    return ((x ^ x >>> 16) >>> 0) / 4294967296;
  };
  // Each bank gets its own fixed sequence of addresses. Short runs and long
  // open intervals happen independently; an occasional facing pair is kept
  // intentionally, rather than making every building arrive as a gate.
  const SIDE_PLACES = [];
  for(const side of [-1,1]) {
    let at=side<0?175:200, index=0;
    while(at<WORLD_END+570) {
      const seed=(side+2)*9173+index*2411;
      if(side>0 && index>0 && index%7===3) {
        const across=SIDE_PLACES.reduce((best,place)=>
          Math.abs(place.at-at)<Math.abs((best?.at??Infinity)-at)?place:best,null);
        if(across && Math.abs(across.at-at)<140)
          at=across.at+Math.round((placeRandom(seed+6)-.5)*35);
      } else if(side>0 && index>0 && SIDE_PLACES.some(place=>
        Math.abs(place.at-at)<76)) at+=82;
      SIDE_PLACES.push({at:Math.round(at),side,index,seed,
        size:.86+placeRandom(seed+4)*.3,
        setback:index===0?(side<0?65:165):
          18+Math.round(placeRandom(seed+9)*245)});
      const gap=175+placeRandom(seed+17)*127+
        (placeRandom(seed+23)<.27?75+placeRandom(seed+29)*95:0);
      at+=gap;index++;
    }
  }
  SIDE_PLACES.sort((a,b)=>a.at-b.at);
  const lastKindAt = new Map();
  for(const place of SIDE_PLACES) {
    const choices=PLACE_KINDS.map((kind,k)=>({kind,
      score:placeRandom(place.seed+k*97)-
        Math.max(0,940-(place.at-(lastKindAt.get(kind)??-10000)))/940*4}));
    choices.sort((a,b)=>b.score-a.score);
    place.kind=place.index===0?(place.side<0?'market':'house'):choices[0].kind;
    lastKindAt.set(place.kind,place.at);
    delete place.index;delete place.seed;
  }
  for(const place of SIDE_PLACES) {
    const variantName=FEATURED_SITES[`${place.side}:${place.at}`];
    const variant=SIDE_VARIANTS[variantName];
    if(variant && variant.side===place.side) {
      place.kind=variant.kind;
      place.variant=variantName;
    }
  }
  for(const place of SIDE_PLACES) {
    const requested=SIDE_VARIANTS[place.variant]?.art||PLACE_ART[place.kind];
    const rule=PLACE_BANK_RULES[requested?.[0]];
    if(rule && place.side!==rule.side) {
      const replacement=SIDE_VARIANTS[rule.rightVariant];
      if(!replacement || replacement.side!==place.side || replacement.kind!==place.kind)
        throw new Error(`No compatible bank art for ${requested[0]}`);
      place.variant=rule.rightVariant;
    }
    const art=SIDE_VARIANTS[place.variant]?.art||PLACE_ART[place.kind];
    // A narrow tower should not reserve the frontage of a broad market.
    // A bank correction keeps its existing conservative lot reservation;
    // it cannot release space and reshuffle the approved neighboring cards.
    place.frontageHalfAlong=(art?50*Math.max(art[3],requested[3])/700:75)*place.size;
  }
  SIDE_PLACES.sort((a,b)=>b.at-a.at);
  // Existing featured places own their parcels. Generate the modular blocks
  // around those addresses so one family cannot cover a special location or
  // cut a road mouth through its painted foundation.
  const LANDSCAPE = B.CacheRoadLandscape?.create(0x6b4d,WORLD_END,SIDE_PLACES) ||
    {plates:[],streets:[],districts:[],owns:()=>false};
  // Six existing settings now occupy legal graph parcels in place of a
  // middle workshop card. Their people and props share those addresses.
  const INFILL_ART = [
    ['cacheTransitNook',1602,982,650],
    ['cacheOutskirtsHomes',2022,778,910],
    ['cacheUtilityCorner',1585,992,620],
    ['cacheGreenhouseWorkshop',1536,1024,700],
    ['cacheOutskirtsWorkshops',2022,778,910],
    ['cacheRepairShop',1389,1132,650]
  ];
  const VENDOR_ART=['cacheVendorStall',1391,1131,690];
  const INFILL_SCENES=LANDSCAPE.plates.filter(plate=>plate.key==='accent')
    .map((plate,index)=>({at:plate.at,side:plate.side,index,
      art:INFILL_ART.find(art=>art[0]===plate.art[0])}));
  // A deep-set featured site can leave an empty curb even though its own
  // building is present farther out. A smaller occupied frontage connects
  // that site to the road, without changing the established site address.
  const SATELLITE_SCENES=SIDE_PLACES.filter(place=>place.kind!=='parking' &&
    place.setback>145 && !INFILL_SCENES.some(scene=>scene.side===place.side &&
      Math.abs(scene.at-place.at)<130)).map(place=>({
        at:place.at,side:place.side,index:Math.floor(place.at/220),
        art:place.kind==='market'||place.kind==='diner' ? VENDOR_ART :
          place.kind==='construction'||place.kind==='substation' ? INFILL_ART[2] :
          place.kind==='garage' ? INFILL_ART[5] :
          place.kind==='park'||place.kind==='garden' ? INFILL_ART[3] : INFILL_ART[1]
      }));
  // Optional contextual buildings are fitted after the actual district
  // and featured parcels. A compact relocation may fit; otherwise that
  // extra building is not spawned. Never cover an existing legal frontage.
  LANDSCAPE.fitSatellites?.(SATELLITE_SCENES);
  // Individual cutouts remain independent animation units. Context chooses
  // one local action, then passers-by are sampled without replacement.
  const PEDESTRIANS = [
    // Source poses keep their relative stature. The shared scale below puts
    // independent people at the same stature as the painted shop customers.
    ['cachePersonCourier',1036/1560,134],
    ['cachePersonMechanic',1036/1555,134],
    ['cachePersonUmbrella',1036/1534,134],
    ['cachePersonStudent',989/1547,134],
    ['cachePersonFoodWorker',1036/1559,134],
    ['cachePersonBicycleCourier',1481/1048,132],
    ['cachePersonSweeper',1199/1330,131],
    ['cachePersonHandheldPlayer',993/1560,134],
    ['cachePersonGardener',1217/1322,132],
    ['cachePersonElectrician',1238/1307,124],
    ['cachePersonWavingResident',1015/1503,134],
    ['cachePersonSkateboarder',1238/1319,131],
    ['cachePersonCrateCarrier',1263/1208,128],
    ['cachePersonBoardPlayer',1236/1302,120],
    ['cachePersonStreetCook',1293/1194,131],
    ...['Courier','Mechanic','MarketWorker','Student','Gardener','Resident']
      .flatMap(identity=>['Toward','Away'].map(direction=>
        [`cacheWalker${identity}${direction}`,1024/1536,132]))
  ];
  const PERSON_SCALE=1.20;
  const WALKER_TRAVEL=['Courier','Mechanic','MarketWorker','Student',
    'Gardener','Resident'].map(identity=>`cacheWalker${identity}Travel`);
  const OTHER_TRAVEL={
    5:['cachePersonBicycleCourierTravel',4,220],
    7:['cachePersonHandheldPlayerTravel',4,210,278/384],
    11:['cachePersonSkateboarderTravel',4,170],
    12:['cachePersonCrateCarrierTravel',8,210]
  };
  // Working/seated figures act in place. Their cels are registered to the
  // same boots, stool or cart; an action never grants world locomotion.
  const PERSON_ACTIVITY={
    6:['cachePersonSweeperActivity',4,200,584/384],
    8:['cachePersonGardenerActivity',4,320,436/384],
    9:['cachePersonElectricianActivity',4,240,368/384],
    10:['cachePersonWavingResidentActivity',4,230,294/384],
    13:['cachePersonBoardPlayerActivity',4,380,370/384],
    14:['cachePersonStreetCookActivity',4,250,360/384]
  };
  const travels=id=>id>=15||OTHER_TRAVEL[id]!==undefined;
  function pedestrianTravel(item,s,reduced) {
    const id=item.id;
    if(!travels(id)&&!PERSON_ACTIVITY[id])return null;
    if(id>=15) {
      // Toward and away are authored views, not horizontally mirrored poses.
      const direction=(id-15)%2;
      const phase=reduced?0:Math.floor(((s.elapsedMs||0)+item.at*13)/210);
      return {key:WALKER_TRAVEL[Math.floor((id-15)/2)],
        frame:direction*4+((phase%4)+4)%4};
    }
    const [key,count,period,aspect]=OTHER_TRAVEL[id]||PERSON_ACTIVITY[id];
    const phase=reduced?0:Math.floor(((s.elapsedMs||0)+item.at*13)/period);
    return {key,frame:((phase%count)+count)%count,aspect};
  }
  const personKey=(scene,item)=>`${scene.side}/${item.at}/${item.id}/${item.base}`;
  function pedestrianPosition(scene,item,s) {
    const distance=s.streetMotion?.[personKey(scene,item)]||0;
    const horizontal=OTHER_TRAVEL[item.id]!==undefined;
    return {at:item.at+(item.id>=15?((item.id-15)%2?1:-1)*distance:0),
      base:item.base+(horizontal?distance:0),
      // The skateboarder and handheld player are authored facing left.
      // Orient the complete person toward the nearest outer screen edge.
      flip:horizontal?(scene.side<0)!==([7,11].includes(item.id)):
        item.id>=15?false:item.flip};
  }
  const PASSERS=[5,7,11,12,15,17,19,21,23,25];
  const personIdentity=id=>id>=15?['courier','mechanic','worker','student','gardener','resident'][Math.floor((id-15)/2)]:
    ({0:'courier',1:'mechanic',3:'student',4:'worker',8:'gardener',10:'resident'})[id]??`local-${id}`;
  const LOCAL_ACTIONS={
    market:[14,12,5,2,4],diner:[14,12,7],
    park:[13,8,11],garden:[8,13,10],
    garage:[9,6,12,1],substation:[9,6,12],
    construction:[12,9,6],parking:[5,6,12],
    house:[10,7,13,0],apartment:[10,7,13,3]
  };
  const STREET_PROPS={
    market:['cacheNewVendorCart','cacheStreetDataKiosk','cacheNewLoadingCrates','cacheNewBinsRecycling'],
    diner:['cacheNewVendorCart','cacheStreetBenchPlanters','cacheStreetBicycleRack','cacheNewBinsRecycling'],
    park:['cacheStreetBenchPlanters','cacheStreetBicycleRack'],
    garden:['cacheStreetBenchPlanters','cacheStreetWorkSupplies'],
    garage:['cacheStreetWorkSupplies','cacheStreetDeliveryVan','cacheNewUtilityCabinet','cacheNewLoadingCrates'],
    substation:['cacheStreetDataKiosk','cacheNewUtilityCabinet','cacheNewLoadingCrates'],
    construction:['cacheStreetWorkSupplies','cacheStreetDeliveryVan'],
    parking:['cacheStreetDeliveryVan','cacheStreetBicycleRack','cacheStreetDataKiosk'],
    house:['cacheStreetBenchPlanters','cacheNewFencePlanter','cacheNewBinsRecycling'],
    apartment:['cacheStreetBicycleRack','cacheStreetBenchPlanters','cacheNewBinsRecycling']
  };
  const PROP_SHAPES={
    cacheStreetBicycleRack:[1526/1023,124],
    cacheStreetWorkSupplies:[1491/1039,128],
    cacheStreetDeliveryVan:[1498/1016,220],
    cacheStreetBenchPlanters:[1546/1040,112],
    cacheStreetDataKiosk:[1224/1318,178],
    cacheNewLampL:[1024/1536,230],cacheNewLampR:[1024/1536,230],
    cacheNewCrossingSignalL:[1024/1536,226],
    cacheNewCrossingSignalR:[1024/1536,226],
    cacheNewWayfindingSign:[1024/1536,200],
    cacheNewBinsRecycling:[1312/1199,108],
    cacheNewLoadingCrates:[1312/1199,122],
    cacheNewUtilityCabinet:[1246/1263,160],
    cacheNewVendorCart:[460/384,188],
    cacheNewFencePlanter:[1536/1024,115]
  };
  // Lens sockets measured in the actual source crop/animation cel. The
  // service mast keeps its painted .28 anchor; corner lamps use .5.
  const LAMP_LIGHTS={
    cachePylon:{anchor:.28,lenses:[[.76,.198,.078],[.91,.249,.058]]},
    cacheNewLampL:{anchor:.5,lenses:[[.812,.168,.10]]},
    cacheNewLampR:{anchor:.5,lenses:[[.26,.17,.125]]}
  };
  const SERVICE_LAMP_HEIGHT=260,SERVICE_LAMP_WIDTH=139.1;
  const SERVICE_LAMP_SPACING=308;
  function lampLightGeometry(key,args) {
    const fixture=LAMP_LIGHTS[key];
    if(!fixture)return [];
    return fixture.lenses.map(([u,v,radius])=>{
      const x=args.x+(u-fixture.anchor)*args.width*(args.flip?-1:1);
      const y=args.y-(1-v)*args.height;
      return {x,y,groundY:args.lampGround?.(x)??args.y,
        lensRadius:args.width*radius,poolRadius:args.height*.21};
    });
  }
  function beginGpuScene(nativeCtx,options) {
    const hud=B.CacheRoadCinematics?.hudContextInfo?.(nativeCtx),frameCtx=hud?.frameContext||nativeCtx;
    let scene=null;
    if(nativeCtx&&!nativeCtx.isGpuScene&&frameCtx===window.renderer?.ctx&&
      frameCtx.canvas?.width===1920&&frameCtx.canvas?.height===1080) {
      // Keep the proxy as the recorder's source: it exposes the authored
      // logical alpha. Only submission uses the underlying shared context.
      if(options?.kind==='rear'&&options.direct)options.opacity=hud?.opacity??1;
      try {scene=B.CacheRoadGPU?.begin?.(nativeCtx,options)||null;}
      catch {scene=null;}
    }
    if(!scene&&options?.kind==='rear'&&options.direct)
      B.CacheRoadGPU?.rejectFrame?.('direct-rear-capture-unavailable');
    return scene;
  }
  function finishGpuScene(gpuCtx,nativeCtx,options) {
    const frameCtx=B.CacheRoadCinematics?.hudContextInfo?.(nativeCtx)?.frameContext||nativeCtx;
    let rendered=false;
    try {rendered=B.CacheRoadGPU?.render?.(gpuCtx.commands,frameCtx,options)===true;}
    catch {rendered=false;B.CacheRoadGPU?.rejectFrame?.('scene-submit-error');}
    // The captured original operations are also the same-frame fallback.
    // The native camera's enclosing save/restore remains its existing owner.
    if(rendered)gpuCtx.applyState(nativeCtx);
    else gpuCtx.replay(nativeCtx);
    return rendered;
  }
  let gpuMirrorClip=null;
  function exactGpuMirrorClip(ctx,x,y,w,h) {
    if(!gpuMirrorClip) {
      const recorder=new B.CacheRoadGPUContext(ctx);
      recorder.setTransform(1,0,0,1,0,0);
      mirrorOutline(recorder,x,y,w,h);recorder.clip();recorder.fillRect(x,y,1,1);
      gpuMirrorClip=recorder.commands[0].clips[0];
    }
    return gpuMirrorClip;
  }
  function copySampledWorldPixels(ctx,width,height,budget,preferPixels=true) {
    return copyOpaqueCanvasPixels(ctx,0,0,width,height,0,0,1920,1080,budget,
      preferPixels&&width<=480&&height<=270);
  }
  function copyOpaqueCanvasPixels(ctx,sx,sy,width,height,dx,dy,dw,dh,budget,preferPixels=true) {
    let frame,used=false;
    // Synchronous cropped readback and drawing stay inside the existing
    // production frame. No Canvas, callback, clock or source is retained.
    const pixelCopy=preferPixels&&budget&&!budget.pixelCopyUnavailable&&
      typeof window.HTMLCanvasElement==='function'&&
      ctx.canvas instanceof window.HTMLCanvasElement&&
      typeof window.VideoFrame==='function'&&
      typeof ctx.getContextAttributes==='function'&&
      [sx,sy,width,height].every(Number.isInteger)&&sx>=0&&sy>=0&&
      width>0&&height>0&&width*height<=480*270&&
      sx+width<=ctx.canvas.width&&sy+height<=ctx.canvas.height;
    if(pixelCopy)try {
      if(ctx.getContextAttributes()?.colorSpace==='srgb') {
        const pixels=ctx.getImageData(sx,sy,width,height,{colorSpace:'srgb'});
        let opaque=pixels.colorSpace==='srgb'&&pixels.width===width&&
          pixels.height===height&&pixels.data.length===width*height*4;
        for(let at=3;opaque&&at<pixels.data.length;at+=4)
          if(pixels.data[at]!==255)opaque=false;
        if(opaque) {
          frame=new window.VideoFrame(pixels.data,{format:'RGBA',
            codedWidth:width,codedHeight:height,timestamp:0,
            colorSpace:{primaries:'bt709',transfer:'iec61966-2-1',matrix:'rgb',fullRange:true}});
          ctx.drawImage(frame,0,0,width,height,dx,dy,dw,dh);
          used=true;
        }
      }
    }catch(error) {
      // Keep original source semantics and avoid per-frame API failures.
      budget.pixelCopyUnavailable=true;
    }finally {
      if(frame)try{frame.close();}catch(error){}
    }
    if(!used)ctx.drawImage(ctx.canvas,sx,sy,width,height,dx,dy,dw,dh);
    return used;
  }
  function clipLightBlend(ctx,bounds) {
    const matrix=ctx.getTransform?.();
    // Native/non-DOM hosts keep their original blend path exactly; their
    // screen-layer rounding can change when an extra clip is introduced.
    const browserCanvas=typeof window.HTMLCanvasElement==='function'&&
      ctx.canvas instanceof window.HTMLCanvasElement;
    const unfilteredLightBounds=browserCanvas&&ctx.filter==='none'&&!ctx.shadowBlur&&
      !ctx.shadowOffsetX&&!ctx.shadowOffsetY&&matrix&&
      ['a','b','c','d'].every(key=>Number.isFinite(matrix[key]))&&
      bounds.length&&bounds.every(bound=>bound.every(Number.isFinite));
    if(!unfilteredLightBounds)return;
    const determinant=Math.abs(matrix.a*matrix.d-matrix.b*matrix.c);
    if(determinant<1e-9)return;
    // A lower bound for the smallest transform scale gives at least two
    // device pixels of margin even with rotation, scale or shear.
    const margin=2*Math.hypot(matrix.a,matrix.b,matrix.c,matrix.d)/determinant;
    const left=Math.min(...bounds.map(bound=>bound[0]))-margin;
    const top=Math.min(...bounds.map(bound=>bound[1]))-margin;
    const right=Math.max(...bounds.map(bound=>bound[2]))+margin;
    const bottom=Math.max(...bounds.map(bound=>bound[3]))+margin;
    // Screen is pointwise; transparent source pixels leave the backdrop
    // unchanged. Restrict its layer to the original light paintings.
    ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
  }
  function drawLampLight(ctx,key,args,pass) {
    if(args.height<5 || B.PresentationAssets?.ready?.(key)===false)return;
    const geometry=lampLightGeometry(key,args);
    if(!geometry.length)return;
    const detail=B.PresentationAssets?.rasterDetail?.(ctx)??1;
    const matrix=detail<1?ctx.getTransform?.():null;
    const sampleScale=matrix?Math.hypot(matrix.a,matrix.b):1;
    ctx.save();
    clipLightBlend(ctx,geometry.map(light=>{
      const radius=pass==='pool'?light.poolRadius:Math.max(light.poolRadius,light.lensRadius);
      return pass==='pool'?[light.x-radius,light.groundY-radius*.24,light.x+radius,light.groundY+radius*.24]:
        [light.x-radius,Math.min(light.y,light.groundY),light.x+radius,Math.max(light.y,light.groundY)];
    }));
    ctx.globalCompositeOperation='screen';
    for(const light of geometry) {
      const {x,y,groundY,lensRadius,poolRadius}=light;
      if(pass==='pool') {
        // Surface-only light is painted after terrain and before every
        // building, pedestrian and prop, never across their silhouettes.
        ctx.save();ctx.translate(x,groundY);ctx.scale(poolRadius,poolRadius*.24);
        const pool=ctx.createRadialGradient(0,0,.035,0,0,1);
        pool.addColorStop(0,'rgba(255,219,144,.38)');
        pool.addColorStop(.38,'rgba(255,202,112,.21)');
        pool.addColorStop(1,'rgba(255,195,100,0)');
        ctx.fillStyle=pool;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();
        ctx.restore();
      } else {
        // Soft angular slices avoid a hard triangular edge. A steady haze
        // falls vertically from each painted lens to its own ground pool.
        const beam=ctx.createLinearGradient(0,y,0,groundY);
        beam.addColorStop(0,'rgba(255,229,163,.20)');
        beam.addColorStop(.23,'rgba(255,220,152,.09)');
        beam.addColorStop(1,'rgba(255,208,124,.045)');
        ctx.fillStyle=beam;
        const alpha=ctx.globalAlpha;
        // Merge bands that fall below the background's sampled footprint.
        // Average the original ten weights, preserving total light energy.
        // Native detail keeps the exact original geometry and opacity.
        const sampledWidth=poolRadius*2*sampleScale*(sampleScale>=.5?detail:1);
        const bands=detail<1?(sampledWidth<8?2:sampledWidth<20?5:10):10;
        const stride=10/bands;
        for(let j=0;j<bands;j++) {
          const a=-1+j*2/bands,b=a+2/bands;
          let weight=0;
          for(let k=j*stride;k<(j+1)*stride;k++)
            weight+=Math.pow(Math.max(0,1-Math.abs(-.9+k*.2)),.8)/stride;
          ctx.globalAlpha=alpha*weight;
          ctx.beginPath();ctx.moveTo(x+lensRadius*a,y);
          ctx.lineTo(x+lensRadius*b,y);
          ctx.lineTo(x+poolRadius*b,groundY);
          ctx.lineTo(x+poolRadius*a,groundY);ctx.closePath();ctx.fill();
        }
        ctx.globalAlpha=alpha;
      }
    }
    ctx.restore();
  }
  const ANIMATED_PROPS=new Set(['cacheNewLampL','cacheNewLampR',
    'cacheNewCrossingSignalL','cacheNewCrossingSignalR','cacheNewWayfindingSign',
    'cacheNewUtilityCabinet','cacheNewVendorCart','cacheStreetDataKiosk']);
  const propFrame=(item,s,reduced)=>{
    if(reduced||!ANIMATED_PROPS.has(item.key))return 0;
    const count=item.key==='cacheNewVendorCart'?4:3;
    return ((Math.floor(((s.elapsedMs||0)+item.at*9)/310)%count)+count)%count;
  };
  function drawStreetActor(ctx,item,key,args,s,reduced,person) {
    const action=person?pedestrianTravel(item,s,reduced):null;
    const artArgs={...args,width:action?.aspect?args.height*action.aspect:args.width,
      frame:action?.frame??propFrame(item,s,reduced)};
    ctx.save();
    if(!person)drawLampLight(ctx,key,args,'beam');
    if(person&&!action&&!reduced) {
      // A restrained planted idle: the contact never changes position.
      const breath=Math.sin((s.elapsedMs||0)/670+item.at*.13);
      ctx.translate(args.x,args.y);ctx.transform(1,0,breath*.003,1+breath*.005,0,0);
      ctx.translate(-args.x,-args.y);
    }
    if(!action||!B.PresentationAssets?.draw?.(action.key,ctx,artArgs))
      B.PresentationAssets?.draw?.(key,ctx,{...args,frame:propFrame(item,s,reduced)});
    ctx.restore();
  }
  // Along-road addresses and distance from the curb both vary. Keeping
  // the group within one parcel gives pairs, knots and arcs instead of a row.
  const FRONT_FORMATIONS={
    1:[[0,0]],
    2:[[-19,-30],[17,35]],
    3:[[-32,6],[13,-49],[24,48]],
    4:[[-41,-15],[-8,52],[24,-47],[39,22]],
    5:[[-44,-13],[-18,53],[10,-52],[39,34],[2,5]]
  };
  const arrangePeople=(ids,center,base,seed,mirror=false)=>
    ids.map((id,i)=>{
      const [along,radial]=FRONT_FORMATIONS[ids.length][i];
      return {id,at:center+(mirror?-along:along),
        base:base+radial+Math.round((placeRandom(seed+id*79)-.5)*10),
        scale:1+placeRandom(seed+id*37)*.09,
        // Travel poses only face their authored direction. Planted people can
        // still be composed toward either side of a frontage.
        flip:travels(id)?false:placeRandom(seed+id*73)>.5};
    }).sort((a,b)=>b.at-a.at);
  // These are world addresses, generated once with a stable seed. Road
  // progress projects the same people and furniture as the ground and lane.
  const STREET_SCENES=[...SIDE_PLACES,...INFILL_SCENES.map(scene=>({
    at:scene.at,side:scene.side,kind:
      scene.art[0]==='cacheGreenhouseWorkshop'?'garden':
      scene.art[0]==='cacheOutskirtsHomes'?'house':
      scene.art[0]==='cacheTransitNook'?'parking':'garage',
    infill:true
  }))].map((anchor,index)=>{
    const seed=Math.round(anchor.at*17+anchor.side*987+index*173);
    const size=1+Math.floor(placeRandom(seed+3)*5);
    const local=LOCAL_ACTIONS[anchor.kind]||LOCAL_ACTIONS.house;
    const leader=local[Math.floor(placeRandom(seed+5)*local.length)];
    const pool=PASSERS.filter(id=>personIdentity(id)!==personIdentity(leader))
      .sort((a,b)=>placeRandom(seed+a*131)-placeRandom(seed+b*131));
    const ids=[leader,...pool.slice(0,size-1).map(id=>id>=15?
      id+(placeRandom(seed+id*61)>.5?1:0):id)];
    // Shuffle the spatial order without changing who belongs to the group.
    ids.sort((a,b)=>placeRandom(seed+a*227+11)-placeRandom(seed+b*227+11));
    let center=anchor.at+Math.round((placeRandom(seed+13)-.5)*26);
    const nearbyMouth=LANDSCAPE.streets.find(street=>street.side===anchor.side &&
      Math.abs(street.at-center)<116);
    if(nearbyMouth)center=nearbyMouth.at+
      (center<nearbyMouth.at?-116:116);
    const people=placeRandom(seed+91)<.17?[]:
      arrangePeople(ids,center,290,seed,placeRandom(seed+7)>.5);
    const choices=STREET_PROPS[anchor.kind]||STREET_PROPS.house;
    const food=anchor.kind==='market'||anchor.kind==='diner';
    const props=[{
      key:food?'cacheNewVendorCart':choices[Math.floor(placeRandom(seed+29)*choices.length)],
      at:center+(placeRandom(seed+43)<.5?-45:45),
      base:anchor.kind==='parking'?404:food?180:224,
      scale:.96+placeRandom(seed+47)*.15
    }];
    if(choices.length>2 || placeRandom(seed+61)<.65)props.push({
      key:choices.filter(key=>key!==props[0].key)[Math.floor(placeRandom(seed+67)*(choices.length-1))],
      at:center+(props[0]?.at>center?-55:55),
      base:282,scale:1+placeRandom(seed+71)*.10
    });
    return {at:anchor.at,side:anchor.side,kind:anchor.kind,people,
      props:props.sort((a,b)=>b.at-a.at)};
  }).sort((a,b)=>b.at-a.at);
  const DISTRICT_PROPS={
    market:['cacheNewVendorCart','cacheNewBinsRecycling'],
    homes:['cacheNewFencePlanter','cacheNewBinsRecycling'],
    workshop:['cacheNewLoadingCrates','cacheNewUtilityCabinet'],
    greenhouse:['cacheNewFencePlanter','cacheNewBinsRecycling'],
    data:['cacheNewUtilityCabinet','cacheNewWayfindingSign'],
    transit:['cacheNewWayfindingSign','cacheNewBinsRecycling']
  };
  // The graph fixes addresses first. Stable, separate directional cutouts
  // are sampled without replacing an identity within a group. These are
  // pedestrians on accessible parcel fronts, never part of a building card.
  // Cycle each context independently so seeded placement cannot silently
  // omit an authored prop (the old random picks never spawned wayfinding).
  const districtPropCounts={};
  const nextDistrictVariant=(counts,family)=>
    counts[family]=(counts[family]??-1)+1;
  const AMBIENT_PLATES=new Set(LANDSCAPE.plates.filter(plate=>
    plate.tier==='front'&&plate.key==='closed'));
  // Measured facade sockets in normalized source coordinates. The old
  // center-card placement put most of these lights outside the screen.
  const FACADE_ACTIVITY={
    market:    {left:[[.79,.65,.13],[.57,.65,.10]],right:[[.17,.48,.12],[.38,.51,.10]]},
    homes:     {left:[[.855,.34,.058],[.77,.59,.052]],right:[[.16,.31,.054],[.28,.50,.055]]},
    workshop:  {left:[[.82,.43,.070]],right:[[.20,.23,.063]]},
    greenhouse:{left:[[.89,.62,.085],[.73,.68,.074]],right:[[.13,.49,.08],[.25,.60,.07]]},
    data:      {left:[[.89,.49,.075],[.74,.62,.064]],right:[[.20,.49,.07],[.30,.51,.055]]},
    transit:   {left:[[.805,.64,.10],[.62,.62,.085]],right:[[.15,.62,.095],[.31,.61,.09]]}
  };
  function drawFacadeActivity(ctx,plate,x,y,width,height,s,reduced) {
    if(!AMBIENT_PLATES.has(plate))return;
    const fixtures=FACADE_ACTIVITY[plate.family][plate.side<0?'left':'right'];
    const key=`cacheAmbient${plate.family[0].toUpperCase()+plate.family.slice(1)}`;
    for(let i=0;i<fixtures.length;i++) {
      const [u,v,size]=fixtures[i],fixtureW=width*size;
      const fx=x+width*(u-.5),fy=y-height*(1-v);
      B.PresentationAssets?.draw?.(key,ctx,{x:fx,y:fy,width:fixtureW,height:fixtureW,
        frame:reduced?1:((Math.floor((s.elapsedMs||0)/230)+
          Number(plate.chunkId.split(':')[1])+i*2)%4+4)%4});
    }
  }
  const DISTRICT_SCENES=LANDSCAPE.chunks.filter((chunk,index)=>
    index%2===1 && LANDSCAPE.plates.some(plate=>plate.chunkId===chunk.id &&
      plate.tier==='front')).map((chunk,index)=>{
    const salt=chunk.seed+index*119;
    const size=1+Math.floor(placeRandom(salt+7)*5);
    const first=Math.floor(placeRandom(salt+11)*6);
    const ids=Array.from({length:size},(_,j)=>{
      const identity=(first+j)%6;
      const direction=placeRandom(salt+identity*67)>.5?0:1;
      return 15+identity*2+direction;
    });
    // A transparent front card can contain a real street mouth. Its lamps
    // sit at ±41, so keep the gathering on the parcel past the mouth.
    const onStreet=LANDSCAPE.streets.some(street=>
      street.side===chunk.side && street.at===chunk.frontAt);
    const mirror=placeRandom(salt+29)>.5;
    const center=chunk.frontAt+(onStreet?(mirror?108:-108):
      Math.round((placeRandom(salt+23)-.5)*28));
    const people=arrangePeople(ids,center,300,salt,mirror);
    const choices=DISTRICT_PROPS[chunk.family];
    const key=choices[nextDistrictVariant(districtPropCounts,chunk.family)%choices.length];
    return {at:chunk.frontAt,side:chunk.side,kind:chunk.family,people,
      props:[{key,at:center+(onStreet?(mirror?26:-26):(index%2?-54:54)),
        base:216,scale:1.04},
      {key:choices[(choices.indexOf(key)+1)%choices.length],
        at:center+(onStreet?(mirror?-30:30):(index%2?46:-46)),
        base:294,scale:.98}]};
  });
  for(const street of LANDSCAPE.streets) {
    DISTRICT_SCENES.push({at:street.at,side:street.side,kind:street.family,
      people:[],props:[
        {key:street.side<0?'cacheNewLampL':'cacheNewLampR',
          at:street.at-41,base:280,scale:.94},
        {key:street.side<0?'cacheNewCrossingSignalL':'cacheNewCrossingSignalR',
          at:street.at+41,base:280,scale:.91}
      ]});
  }
  STREET_SCENES.push(...DISTRICT_SCENES);
  STREET_SCENES.sort((a,b)=>b.at-a.at);
  const STREET_ITEMS=STREET_SCENES.flatMap(scene=>
    [...scene.props,...scene.people].map(item=>({at:item.at,scene,item})))
    .sort((a,b)=>b.item.at-a.item.at);
  // The two roadsides interleave instead of forming a lamp corridor.
  // Keep service fixtures clear of street mouths and authored corner lamps.
  const SERVICE_LAMPS=[];
  for(const side of [-1,1]) {
    const phase=side<0?0:SERVICE_LAMP_SPACING/2;
    for(let at=phase-SERVICE_LAMP_SPACING;at<WORLD_END+1200;at+=SERVICE_LAMP_SPACING) {
      if(LANDSCAPE.streets.some(street=>street.side===side&&
        Math.abs(street.at-at)<street.halfWidth+28))continue;
      if(STREET_ITEMS.some(record=>record.scene.side===side&&
        LAMP_LIGHTS[record.item.key]&&Math.abs(record.at-at)<180))continue;
      SERVICE_LAMPS.push({at,side,kind:'pylon'});
    }
  }
  SERVICE_LAMPS.sort((a,b)=>b.at-a.at);
  const MOBILE_STREET_ITEMS=STREET_ITEMS.filter(({item})=>travels(item.id));
  // Immutable world records are indexed once. Rendering only visits the
  // current horizon; moving actors are culled at their current address.
  const SCENERY=[
    ...LANDSCAPE.plates.map(plate=>({at:plate.at,side:plate.side,kind:'plate',plate})),
    ...SATELLITE_SCENES.map(scene=>({at:scene.at+43,side:scene.side,kind:'satellite',scene})),
    ...SIDE_PLACES.map(place=>({at:place.at,side:place.side,
      kind:place.kind==='parking'?'parking':'place',place}))
  ].sort((a,b)=>b.at-a.at);
  function worldRange(items,near,far) {
    let lo=0,hi=items.length;
    while(lo<hi) {const mid=(lo+hi)>>>1;
      if(items[mid].at>far)lo=mid+1;else hi=mid;}
    const start=lo;hi=items.length;
    while(lo<hi) {const mid=(lo+hi)>>>1;
      if(items[mid].at>=near)lo=mid+1;else hi=mid;}
    return items.slice(start,lo);
  }
  function streetRange(s,near,far) {
    const fixed=worldRange(STREET_ITEMS,near,far).filter(({item})=>!travels(item.id));
    // A slow/braking driver can accompany an away walker for a long time.
    // Cull travellers by their CURRENT address, never their spawn address.
    for(const record of MOBILE_STREET_ITEMS) {
      const at=pedestrianPosition(record.scene,record.item,s).at;
      if(at>=near&&at<=far)fixed.push(record);
    }
    return fixed;
  }
  // Keep the whole level's textures resident before its first playable frame.
  // These are the same original sources used by both painters, including the
  // complete rear actor atlases. Level 1 and unrelated artwork stay outside
  // this bounded Level 2 source set.
  const GPU_ROUTE_COMMON = [
    'cacheDistantCity','cacheMidCity','cacheOutskirts','cacheFly1','cacheFly3',
    'cacheOuterGround','cacheRollingGrain','cacheLocalStreet','cacheBlacktop',
    'cacheJoinLTurn','cacheJoinRTurn','cacheJoinLCurb','cacheJoinRCurb',
    'cacheJoinLStreetWall','cacheJoinRStreetWall','cacheJoinLEndcap','cacheJoinREndcap',
    'cacheGroundClusterL1','cacheGroundClusterL2','cacheGroundClusterL3',
    'cacheGroundClusterR1','cacheGroundClusterR2','cacheGroundClusterR3','cachePylon',
    'cacheDecalCrosswalk','cacheDecalStopLine','cacheDecalDrainage',
    'cacheDecalLoadingBay','cacheDecalServiceStencil','cacheDecalWetRepairPatch',
    'cacheResidentialPaving','cachePlantedGravelCourt','cacheServiceCourtPaving',
    'cacheSidewalk','cacheParapet',
    'cacheFreight','cacheCourier','cacheBarricade','cacheRival','cacheAudit',
    'cacheSweeper','cacheTrike','cacheShuttle','cacheBrakeReflection',
    'cacheDamagedExhaust','cacheSpeedMist','cacheCombatBike','cacheCombatHostiles',
    'cacheCombatBikeCrash','cacheCombatBlast','cacheBloodSplatter',
    'cachePursuitRig','cachePursuitImpact',
    'cachePersonCrateCarrierTravel','cachePersonHandheldPlayerTravel'
  ];
  function gpuLevelKeys() {
    const keys=new Set(GPU_ROUTE_COMMON);
    for(const area of SCENERY) {
      const key=area.plate?.art[0]||area.scene?.art[0]||
        (area.place?.kind!=='parking'?
          (SIDE_VARIANTS[area.place?.variant]?.art||PLACE_ART[area.place?.kind])?.[0]:null);
      if(key)keys.add(key);
      if(area.plate&&AMBIENT_PLATES.has(area.plate)) {
        const family=area.plate.family;
        keys.add('cacheAmbient'+family[0].toUpperCase()+family.slice(1));
      }
    }
    for(const {item} of STREET_ITEMS) {
      const key=item.id===undefined?item.key:
        pedestrianTravel(item,{elapsedMs:0},false)?.key||PEDESTRIANS[item.id]?.[0];
      if(key)keys.add(key);
    }
    return [...keys];
  }
  const GPU_LEVEL_KEYS=gpuLevelKeys();
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = value => {const t=clamp(value,0,1);return t*t*(3-2*t);};
  const roadPath = at => 200*Math.sin(at/700)+90*Math.sin(at/295+.5);
  const roadHeading = at => 200/700*Math.cos(at/700)+90/295*Math.cos(at/295+.5);
  function mirrorExpression(s) {
    if(B.CacheRoadMirror)return B.CacheRoadMirror.expression(s.mirrorState,s);
    if (s.stumbleMs > 0) return 4;
    if (s.integrity <= 1 || s.timeMs < 8000 || s.status === 'failed') return 5;
    if (s.boostMs > 0 || s.fullAdrenaline || s.status === 'clear') return 2;
    if (s.cutFlashMs > 0 || (s.messageMs > 0 && /NEAR MISS/.test(s.message))) return 3;
    if (s.pulseFlashMs > 0 || s.rivalWarning) return 1;
    return 0;
  }

  function mirrorOutline(ctx, x, y, w, h, begin=true) {
    if(begin)ctx.beginPath(); ctx.moveTo(x + 16, y); ctx.lineTo(x + w - 16, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 16);
    ctx.lineTo(x + w - 7, y + h - 12);
    ctx.quadraticCurveTo(x + w - 9, y + h, x + w - 24, y + h);
    ctx.lineTo(x + 24, y + h);
    ctx.quadraticCurveTo(x + 9, y + h, x + 7, y + h - 12);
    ctx.lineTo(x, y + 16); ctx.quadraticCurveTo(x, y, x + 16, y);
    ctx.closePath();
  }

  // The reflection looks back along the same world centerline as the main
  // camera. A real mirror cancels the rear camera's horizontal reversal, so
  // the physical lane order stays left-to-right while motion runs away.
  function rigArtPhase(s,boss,combatPose) {
    if(boss.defeated)return 'defeated';
    if(boss.health===1&&boss.counterMs>200)return 'armor-break';
    if(s.combat) {
      const attack=(combatPose||B.CacheRoadCombat.pose(s.combat,{progress:s.progress})).actors.find(actor=>actor.id==='rig');
      if(['windup','committed'].includes(attack?.phase))
        return attack.attackKind==='pulse'?'core-hit':attack.attackKind==='ram'?'ram':'scan';
      return boss.phase==='recover'?'armor-break':boss.phase;
    }
    const attack=B.CacheRoadPursuit?.pose?.(s.pursuit,{progress:s.progress});
    if(attack?.boss&&attack.warning) {
      if(attack.attackKind==='scan')return 'scan';
      if(attack.attackKind==='ram')return 'ram';
      if(attack.attackKind==='pulse'&&attack.locked)return 'core-hit';
    }
    return boss.phase;
  }

  function mirrorSceneryInGlass(candidate,x,y,w,h) {
    const a=candidate.args;
    // The generous whole-body envelope includes atlas padding, authored
    // activity width, lamp haze/pools and far more than the 2.3px blur tail.
    // Only complete scenery outside the glass is skipped; visible source
    // order, world addresses and full foreground exits remain unchanged.
    const reach=Math.max(a.width*.8,a.height*(candidate.person?.82:.21)),blurPadding=12;
    return a.x+reach>=x-blurPadding&&a.x-reach<=x+w+blurPadding&&
      a.y+a.height*.24>=y-blurPadding&&a.y-a.height*1.02<=y+h+blurPadding;
  }
  function drawRearRoad(ctx, s, x, y, w, h, accent, reduced, heightSample=LANDSCAPE.height, combatPose, crosswalkPose, opaqueBackdrop=false, pixelBudget=null) {
    const progress = s.progress, reach = 440, horizon = y + 47, floor = y + h + 4;
    const profile = at => {
      const distance = clamp(progress - at, 0, reach);
      const t = 1 - distance/reach;
      const bend = roadPath(progress-distance)-roadPath(progress)+
        distance*roadHeading(progress);
      return { t, x: x + 475 + bend*.72, y: horizon+(floor-horizon)*t*t,
        half: 27+165*t, at };
    };
    const laneX = (lane,p) => p.x+(lane-1.5)*p.half/2;
    // Miniature actors retain the forward camera's world size, parcel
    // setback and painted ground contacts. They are not equal-size icons.
    const miniature=.095,cardScale=t=>t/(1+.20*t);
    const bankX=(p,side,base,growth=190)=>p.x+side*(p.half+
      (base+growth*p.t)*(.1+.9*p.t)*miniature);
    const bankY=(p,side,radial)=>p.y+p.t*miniature*
      (heightSample?.(side,p.at,Math.max(220,radial))??24);
    const paintQuad=(key,corners,sourceRect,alpha=1)=>{
      // Skip only complete reflection slabs beyond the glass/blur envelope.
      // Every visible triangle keeps its original source and projection.
      const xs=corners.map(point=>point[0]),ys=corners.map(point=>point[1]);
      if(Math.max(...xs)<x-12||Math.min(...xs)>x+w+12||
        Math.max(...ys)<y-12||Math.min(...ys)>y+h+12)return;
      const [a,b,c,d]=corners;
      const half=(vertices,matrix)=>{
        ctx.save();ctx.beginPath();ctx.moveTo(...a);
        for(const vertex of vertices)ctx.lineTo(...vertex);
        ctx.closePath();ctx.clip();ctx.globalAlpha*=alpha;
        ctx.transform(...matrix,a[0],a[1]);
        B.PresentationAssets?.draw?.(key,ctx,{x:0,y:0,width:256,height:256,sourceRect});
        ctx.restore();
      };
      half([b,c],[(b[0]-a[0])/256,(b[1]-a[1])/256,
        (c[0]-b[0])/256,(c[1]-b[1])/256]);
      half([c,d],[(c[0]-d[0])/256,(c[1]-d[1])/256,
        (d[0]-a[0])/256,(d[1]-a[1])/256]);
    };
    const far = profile(progress-reach);
    const nativeRearContext=ctx,gpuRearOptions={kind:'rear',direct:B.CacheRoadGPU?.directFrameActive?.()===true,
      viewport:{x:x-12,y:y-12,width:w+24,height:h+24}};
    if(gpuRearOptions.direct)gpuRearOptions.glassClip=exactGpuMirrorClip(ctx,x,y,w,h);
    const gpuRearContext=beginGpuScene(nativeRearContext,gpuRearOptions);
    if(gpuRearContext) {
      ctx=gpuRearContext;
      if(gpuRearOptions.direct) {
        // Supply the same glass backdrop within the complete blur footprint.
        // Cache's face and the glass markings remain on the foreground Canvas.
        const glass=ctx.createLinearGradient(0,y,0,y+h);
        glass.addColorStop(0,'#0e1b2d');glass.addColorStop(.53,'#394a60');glass.addColorStop(1,'#10232e');
        ctx.fillStyle=glass;ctx.fillRect(x-12,y-12,w+24,h+24);
      }
    }
    // Blur the completed reflection once on the existing display Canvas.
    // Per-object filters repeatedly allocate/rasterize intermediate surfaces.
    const mirrorTransform=ctx.getTransform?.();
    const compositeBlur=ctx.canvas?.width>0&&ctx.canvas?.height>0&&
      ['a','b','c','d','e','f'].every(field=>Number.isFinite(mirrorTransform?.[field]))&&
      typeof window.HTMLCanvasElement==='function'&&ctx.canvas instanceof window.HTMLCanvasElement&&
      typeof ctx.setTransform==='function';
    ctx.save(); ctx.filter = 'blur(2.3px)';
    if(compositeBlur)ctx.filter='none';
    ctx.fillStyle = accent; ctx.globalAlpha = .11;
    ctx.beginPath(); ctx.arc(x+425-(reduced?0:progress*.012)%55,y+31,29,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha = 1;
    const bearing=clamp(roadPath(progress)*.08+roadHeading(progress)*75,-50,50);
    for(const [key,width,height,foot,opacity,parallax] of [
      ['cacheDistantCity',w*1.46,137,horizon+11,.57,.18],
      ['cacheOutskirts',w*1.38,117,horizon+12,.73,.48],
      ['cacheMidCity',w*1.52,87,horizon+22,.84,.90]]) {
      ctx.globalAlpha=opacity;
      B.PresentationAssets?.draw?.(key,ctx,{
        x:x+(w-width)/2+bearing*parallax,y:foot,width,height});
    }
    ctx.globalAlpha=1;
    ctx.fillStyle='#274550';ctx.fillRect(x,horizon,w,floor-horizon);
    // The same world-addressed wet bank material and height field continue
    // behind the car; strips shrink toward the rearward horizon.
    // Five coarse strips are enough under the retained glass blur; the
    // full-size view's dense subdivision wasted work below one mirror pixel.
    const bankStep=88;
    for(let at=Math.floor(progress/bankStep)*bankStep;at>progress-reach;at-=bankStep) {
      const near=profile(Math.min(progress,at+bankStep)),distant=profile(Math.max(progress-reach,at));
      for(const side of [-1,1]) {
        const point=(p,radial)=>[bankX(p,side,radial),bankY(p,side,radial)];
        const corners=[point(distant,220),point(near,220),point(near,2500),point(distant,2500)];
        paintQuad('cacheOuterGround',corners,null);
        const row=((at%624)+624)%624;
        paintQuad('cacheRollingGrain',corners,
          [side<0?0:265,32+823*(1-(row+bankStep)/(624+bankStep)),
            1509,823*bankStep/(624+bankStep)],.42);
      }
    }
    // The narrow sidewalks use the same curved bank as the rearward road.
    for(const side of [-1,1]) {
      ctx.fillStyle='#526373';ctx.beginPath();
      ctx.moveTo(far.x+side*(far.half+6),far.y);
      for(let i=1;i<=12;i++) {
        const p=profile(progress-reach*(1-i/12));
        ctx.lineTo(p.x+side*(p.half+6),p.y);
      }
      for(let i=12;i>=0;i--) {
        const p=profile(progress-reach*(1-i/12));
        ctx.lineTo(p.x+side*(p.half+34+12*p.t),p.y);
      }
      ctx.closePath();ctx.fill();
    }
    for(const side of [-1,1]) {
      ctx.fillStyle='#4e6070';ctx.beginPath();
      ctx.moveTo(far.x+side*far.half,far.y);
      for(let i=1;i<=12;i++) {
        const p=profile(progress-reach*(1-i/12));
        ctx.lineTo(p.x+side*p.half,p.y);
      }
      for(let i=12;i>=0;i--) {
        const p=profile(progress-reach*(1-i/12));
        ctx.lineTo(p.x+side*(p.half+6+9*p.t),p.y);
      }
      ctx.closePath();ctx.fill();
    }
    ctx.fillStyle='#192e39';
    ctx.beginPath();ctx.moveTo(far.x-far.half,far.y);
    for(let i=1;i<=12;i++) {
      const p=profile(progress-reach*(1-i/12));ctx.lineTo(p.x-p.half,p.y);
    }
    for(let i=12;i>=0;i--) {
      const p=profile(progress-reach*(1-i/12));ctx.lineTo(p.x+p.half,p.y);
    }
    ctx.closePath();ctx.fill();
    // Sample the same rain-blacktop painting used by the forward road at
    // addresses behind the car. The glass blur hides slice joins naturally.
    ctx.save();ctx.clip();ctx.globalAlpha=.31;
    for(let i=0;i<9;i++) {
      const a=profile(progress-reach*(1-i/9));
      const b=profile(progress-reach*(1-(i+1)/9));
      const mid=profile(progress-reach*(1-(i+.5)/9));
      const worldAt=progress-reach*(1-(i+.5)/9);
      const row=((worldAt*.82%596)+596)%596;
      B.PresentationAssets?.draw?.('cacheBlacktop',ctx,{
        x:mid.x-mid.half,y:a.y,width:mid.half*2,height:b.y-a.y+1,
        sourceRect:[0,108+row,2172,20] });
    }
    ctx.restore();
    if(crosswalkPose)drawCrosswalkGround(ctx,crosswalkPose,{reduced,
      near:progress-reach,far:progress,
      point:(lane,at)=>{const p=profile(at);return [laneX(lane,p),p.y];},miniature:true});
    for(const side of [-1,1]) {
      ctx.strokeStyle='#a2b7b9';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.moveTo(far.x+side*far.half,far.y);
      for(let i=1;i<=12;i++) {
        const p=profile(progress-reach*(1-i/12));
        ctx.lineTo(p.x+side*p.half,p.y);
      }
      ctx.stroke();
    }
    // All marks have fixed world addresses. After the car passes one, its
    // image moves toward the horizon and shrinks instead of approaching us.
    for(let at=Math.floor(progress/55)*55;at>progress-reach;at-=55) {
      if(at>progress)continue;
      const a=profile(at), b=profile(Math.max(at-15,progress-reach));
      for(let lane=1;lane<4;lane++) {
        const width=.6+1.8*a.t;
        polygon(ctx,[[laneX(lane-.5,a)-width,a.y],
          [laneX(lane-.5,a)+width,a.y],
          [laneX(lane-.5,b)+width*.4,b.y],
          [laneX(lane-.5,b)-width*.4,b.y]],'#c7d3ca');
      }
      for(const side of [-1,1]) {
        ctx.fillStyle='#b7e2d1';ctx.globalAlpha=.18+a.t*.3;
        ctx.fillRect(a.x+side*(a.half+7),a.y-4-a.t*8,2+a.t*2,4+a.t*8);
        ctx.globalAlpha=1;
        // Slab joints belong to the same fixed world addresses as the
        // forward sidewalk, rather than sliding with a separate HUD clock.
        ctx.strokeStyle='#b5c5c26b';ctx.lineWidth=.7;
        ctx.beginPath();ctx.moveTo(a.x+side*(a.half+8),a.y);
        ctx.lineTo(bankX(a,side,255),bankY(a,side,255));ctx.stroke();
      }
    }
    // Branch streets are the graph's actual mouths, opening through the
    // miniature sidewalk only once their addresses are behind the car.
    for(const street of (LANDSCAPE.streetRange?.(progress-reach,progress)||LANDSCAPE.streets)) {
      if(street.at>=progress || street.at<progress-reach)continue;
      const side=street.side;
      const close=profile(Math.min(progress,street.at+street.halfWidth));
      const distant=profile(Math.max(progress-reach,street.at-street.halfWidth));
      const inner=p=>p.x+side*(p.half+5);
      const outer=p=>p.x+side*(p.half+48+12*p.t);
      const corners=[[inner(close),close.y],[inner(distant),distant.y],
        [outer(distant),distant.y-3*distant.t],[outer(close),close.y-3*close.t]];
      polygon(ctx,corners,'#263841');
      paintQuad('cacheLocalStreet',corners,
        [0,((Math.floor(street.at*2)%1190)+1190)%1190,256,64],.8);
      ctx.strokeStyle='#92aeb1';ctx.globalAlpha=.35;
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(...corners[0]);ctx.lineTo(...corners[3]);
      ctx.moveTo(...corners[1]);ctx.lineTo(...corners[2]);ctx.stroke();
      ctx.globalAlpha=1;
    }
    // Reuse the production district cards, featured places and individual
    // people/props instead of generic boxes. The rear camera samples their
    // existing world addresses and the glass clips and blurs their miniatures.
    const mirrorGeometry=item=>{
      const p=profile(item.at),side=item.side;
      let key,width,height,artX,foot,sourceRect,flip=false;
      if(item.kind==='pylon') {
        height=SERVICE_LAMP_HEIGHT*p.t*miniature;
        return {p,key:'cachePylon',args:{x:bankX(p,side,92,100),
          y:bankY(p,side,220),width:height*SERVICE_LAMP_WIDTH/SERVICE_LAMP_HEIGHT,
          height,sourceRect:[42,69,954,1386],flip:side===1}};
      }
      if(item.kind==='life') {
        const actor=item.item,person=actor.id!==undefined;
        const position=pedestrianPosition(item.scene,actor,s);
        const [asset,aspect,stature]=person?PEDESTRIANS[actor.id]:
          [actor.key,...PROP_SHAPES[actor.key]];
        height=stature*p.t*miniature*actor.scale*(person?PERSON_SCALE:1);
        return {p,key:asset,person,args:{
          x:bankX(p,side,position.base,person?210:260),
          y:bankY(p,side,position.base)+4*p.t*miniature,
          width:height*aspect,height,flip:person?position.flip:false}};
      }
      if(item.plate) {
        const plate=item.plate;
        const [asset,sourceW,sourceH,maxW,base,growth,
          contactBottom,contactAt,fit]=plate.art;
        key=asset;width=maxW*cardScale(p.t)*miniature;
        height=width*(contactBottom||sourceH)/sourceW;
        const socket=fit?.socketU===undefined?0:side<0?1-fit.socketU:fit.socketU;
        const roadward=bankX(p,side,base,growth)-side*width*socket;
        artX=roadward+side*width*.5;
        const footU=plate.flip?1-fit?.footU:fit?.footU;
        const footX=fit?.footU===undefined?roadward:artX-width*.5+width*footU;
        const radial=(side*(footX-p.x)-p.half)/miniature/(.1+.9*p.t)-190*p.t;
        foot=bankY(p,side,radial)+(contactAt?
          (contactBottom-contactAt)*width/sourceW+6*p.t*miniature:22*p.t*miniature);
        sourceRect=[0,0,sourceW,contactBottom||sourceH];flip=!!plate.flip;
      } else if(item.kind==='satellite') {
        const [asset,sourceW,sourceH,maxW]=item.scene.art;
        key=asset;width=Math.min(720,maxW)*cardScale(p.t)*miniature;
        height=width*sourceH/sourceW;
        artX=bankX(p,side,220)+side*(width*.5+29*p.t*miniature);
        const fit=B.CacheRoadLandscape.SOURCE_FITS[asset];
        flip=B.CacheRoadLandscape.sourceFlip(asset,side);
        if(fit.contactAt!==undefined) {
          const footU=flip?1-fit.footU:fit.footU;
          const footX=artX-width*.5+width*footU;
          const radial=(side*(footX-p.x)-p.half)/miniature/(.1+.9*p.t)-190*p.t;
          foot=bankY(p,side,radial)+(sourceH-fit.contactAt)*width/sourceW+6*p.t*miniature;
        } else foot=bankY(p,side,220)+9*p.t*miniature;
      } else if(item.place.kind!=='parking') {
        const place=item.place,variant=SIDE_VARIANTS[place.variant];
        const [asset,sourceW,sourceH,maxW]=(variant&&variant.art)||PLACE_ART[place.kind];
        key=asset;width=maxW*cardScale(p.t)*place.size*miniature;
        height=width*sourceH/sourceW;
        artX=bankX(p,side,220)+side*(width*.5+(26+place.setback)*p.t*miniature);
        foot=bankY(p,side,220+place.setback);flip=variant?!!variant.flip:placeFacesRoad(place.kind,side);
      } else {
        return {p,key:null,args:{x:bankX(p,side,220+item.place.setback),
          y:bankY(p,side,220+item.place.setback),width:22*p.t,height:3*p.t}};
      }
      return {p,key,args:{x:artX,y:foot,width,height,sourceRect,flip}};
    };
    const scenery=worldRange(SCENERY,progress-reach,progress)
      .concat(worldRange(SERVICE_LAMPS,progress-reach,progress))
      .concat(streetRange(s,progress-reach,progress)
        .map(({scene,item})=>({at:pedestrianPosition(scene,item,s).at,
          side:scene.side,kind:'life',scene,item})))
      .filter(item=>item.at<progress&&item.at>progress-reach)
      .map(item=>({item,...mirrorGeometry(item)}))
      .filter(candidate=>mirrorSceneryInGlass(candidate,x,y,w,h))
      // Wide card foundations sort by the same authored ground contacts
      // as their full-size view; roof heights do not determine occlusion.
      .sort((a,b)=>a.args.y-b.args.y||a.item.at-b.item.at);
    for(const {item,key,args} of scenery) {
      if(item.kind==='pylon'||item.kind==='life'&&LAMP_LIGHTS[key])
        drawLampLight(ctx,key,args,'pool');
    }
    for(const {item,p,key,args,person} of scenery) {
      ctx.globalAlpha=.66+.34*p.t;
      if(item.kind==='life')drawStreetActor(ctx,item.item,key,args,s,reduced,person);
      else if(item.kind==='pylon') {
        drawLampLight(ctx,key,args,'beam');B.PresentationAssets?.draw?.(key,ctx,args);
      } else if(key) {
        B.PresentationAssets?.draw?.(key,ctx,args);
        if(item.plate)drawFacadeActivity(ctx,item.plate,args.x,args.y,args.width,args.height,s,reduced);
      } else {
        ctx.fillStyle='#667683';ctx.globalAlpha*=.44;
        ctx.fillRect(args.x-(item.side<0?args.width:0),args.y-2*p.t,args.width,args.height);
      }
      ctx.globalAlpha=1;
    }
    const boss=s.combat?combatPose.boss:B.CacheRoadPursuit?.boss?.(s.pursuit,{progress});
    if(boss&&boss.at<progress&&boss.at>progress-reach) {
      const p=profile(boss.at);
      B.CacheRoadBossArt?.drawRig?.(ctx,{x:laneX(boss.lane,p),y:p.y,width:20+p.t*45,height:24+p.t*57,
        health:boss.health,phase:rigArtPhase(s,boss,combatPose),elapsedMs:s.elapsedMs,
        reduced:reduced||!!s.combat&&window.BARCODE_RENDER_QUALITY?.flashes===false,alpha:.6+.4*p.t});
      const wreck=s.combat&&combatPose.wrecks.find(item=>item.id==='rig');
      if(wreck)B.CacheRoadCombatArt?.drawBlast?.(ctx,{x:laneX(boss.lane,p),y:p.y-(24+p.t*57)*.5,
        width:(20+p.t*45)*1.7,height:(24+p.t*57)*1.6,ageMs:wreck.ageMs,reduced,
        flashes:window.BARCODE_RENDER_QUALITY?.flashes!==false,alpha:.6+.4*p.t});
    }
    const reflected=roadHazards(s).map(hazard=>({hazard,actor:actorPose(s,hazard)}));
    if(s.pursuit) {
      const rival=B.CacheRoadPursuit.pose(s.pursuit,{progress});
      if(rival&&(!rival.boss||rival.attackKind==='ram')) {const reaction=actorPose(s,rival);
        reflected.push({hazard:{...rival,kind:'rival'},actor:{...reaction,alpha:rival.alpha*reaction.alpha}});}
    }
    if(s.combat)for(const actor of combatBodies(s,combatPose))if(actor.kind!=='rig')reflected.push({hazard:{...actor,kind:combatVehicleKind(actor.kind)},actor:{...actor,alpha:actor.alpha??1}});
    for(const {hazard,actor} of reflected.filter(item=>item.actor.at<progress&&item.actor.at>progress-reach)
      .sort((a,b)=>a.actor.at-b.actor.at)) {
      if(actor.alpha<=0)continue;
      const p=profile(actor.at),lane=actor.lane;
      const heavy=['freight','sweeper','shuttle'].includes(hazard.kind);
      const width=(heavy?9:hazard.kind==='trike'?6:8)+p.t*(heavy?31:hazard.kind==='trike'?20:26);
      const height=(heavy?8:6)+p.t*(heavy?27:22);
      if(s.combat&&actor.id?.startsWith('foe-'))drawCombatBody(ctx,actor,{x:laneX(lane,p),y:p.y,width,height,reduced,elapsedMs:s.elapsedMs,
        riderX:Number.isFinite(actor.riderLane)?laneX(actor.riderLane,p):undefined});
      else drawVehicle(ctx,laneX(lane,p),p.y,width,height,hazard.kind,{
        alpha:(.55+.45*p.t)*(actor.alpha??1),phase:(s.elapsedMs||0)*.054+hazard.at*.17,
        steer:actor.kind?actor.steer:hazardTurn(hazard,progress).steer,reduced});
    }
    if(crosswalkPose)for(const person of crosswalkPose.people)if(person.at<progress&&person.at>progress-reach) {
      const p=profile(person.at);
      drawCrosswalkPerson(ctx,person,{x:laneX(person.lane,p),y:p.y,height:8+37*p.t,reduced});
    }
    ctx.restore();
    if(gpuRearContext) {
      const rendered=finishGpuScene(gpuRearContext,nativeRearContext,gpuRearOptions);
      ctx=nativeRearContext;
      if(rendered&&gpuRearOptions.direct) {
        ctx.save();mirrorOutline(ctx,x,y,w,h);ctx.clip();ctx.clearRect(x,y,w,h);ctx.restore();
        return;
      }
    }
    if(compositeBlur) {
      const m=mirrorTransform,xs=[],ys=[];
      for(const [px,py]of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]) {
        xs.push(m.a*px+m.c*py+m.e);ys.push(m.b*px+m.d*py+m.f);
      }
      const sx=clamp(Math.floor(Math.min(...xs))-12,0,ctx.canvas.width);
      const sy=clamp(Math.floor(Math.min(...ys))-12,0,ctx.canvas.height);
      const right=clamp(Math.ceil(Math.max(...xs))+12,0,ctx.canvas.width);
      const bottom=clamp(Math.ceil(Math.max(...ys))+12,0,ctx.canvas.height);
      if(right>sx&&bottom>sy) {
        ctx.save();ctx.setTransform(1,0,0,1,0,0);
        ctx.globalAlpha=1;
        // A native, opaque playing frame already supplies every backdrop
        // sample inside the glass. Source-over then matches copy, avoiding
        // its full-display replacement surface; scaled/fading callers retain copy.
        const opaqueNative=opaqueBackdrop&&m.a===1&&m.b===0&&m.c===0&&
          m.d===1&&m.e===0&&m.f===0;
        ctx.globalCompositeOperation=opaqueNative?'source-over':'copy';
        ctx.filter = 'blur(2.3px)';
        // Crop the opaque native source before applying the same single blur.
        // Original self-copy preserves all other caller/viewport semantics.
        if(pixelBudget)pixelBudget.mirrorPixelCopyUsed=copyOpaqueCanvasPixels(ctx,
          sx,sy,right-sx,bottom-sy,sx,sy,right-sx,bottom-sy,pixelBudget,false);
        else ctx.drawImage(ctx.canvas,sx,sy,right-sx,bottom-sy,sx,sy,right-sx,bottom-sy);
        ctx.restore();
      }
    }
    // Only reflected scenery gets softened. Cache and the glass markings are
    // painted afterward at the HUD's native resolution.
  }

  // One piece of glass contains both the passing road and Cache's eyes.
  function drawRearview(ctx, s, accent, reduced, heightSample=LANDSCAPE.height, combatPose, crosswalkPose, boundedClip=false, opaqueBackdrop=false, pixelBudget=null) {
    const x = 638, y = 12, w = 690, h = 117;
    const expression = mirrorExpression(s);
    const edge = expression === 4 ? '#ff7c89' : expression === 5 ? '#f7b376' :
      expression === 2 ? '#f6d188' : '#8fe3db';
    ctx.fillStyle = '#45616f'; ctx.fillRect(x + 338, 0, 14, 14);
    ctx.fillStyle = '#25394a'; mirrorOutline(ctx, x - 6, y - 5, w + 12, h + 10); ctx.fill();
    ctx.fillStyle = edge; mirrorOutline(ctx, x - 3, y - 2, w + 6, h + 4); ctx.fill();
    ctx.save();
    if(boundedClip) {
      // A rectangular raster clip avoids repeating the curved glass mask on
      // every reflected triangle, actor and lamp. Repaint its exact bezel
      // silhouette once after the completed native reflection/face.
      ctx.beginPath();ctx.rect(x,y,w,h);
    } else mirrorOutline(ctx,x,y,w,h);
    ctx.clip();
    const glass = ctx.createLinearGradient(0, y, 0, y + h);
    glass.addColorStop(0, '#0e1b2d'); glass.addColorStop(.53, '#394a60');
    glass.addColorStop(1, '#10232e');
    ctx.fillStyle = glass; ctx.fillRect(x, y, w, h);
    const priorRasterDetail=B.PresentationAssets?.setRasterDetail?.(ctx,1)??1;
    try {drawRearRoad(ctx,s,x,y,w,h,accent,reduced,heightSample,combatPose,crosswalkPose,opaqueBackdrop,pixelBudget);}
    finally {B.PresentationAssets?.setRasterDetail?.(ctx,priorRasterDetail);}
    // Cache sits on the driver's side. His eyes face the windshield
    // for ordinary driving; only the impact cell glances across the mirror.
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (!B.PresentationAssets?.draw?.('cacheMirror', ctx, {
      x: x + 195, y: y + h/2, width: 280, height: 111,
      sourceRect: [0, 150, 450, 185], frame: expression })) {
      ctx.fillStyle = '#d9aa4c'; ctx.beginPath();
      ctx.arc(x + 57, y + 50, 58, Math.PI, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#142632'; ctx.fillRect(x, y + 65, 122, 52);
      ctx.fillStyle = '#f4e0b1'; ctx.fillRect(x + 52, y + 58, 28, 8);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // Shared glare and scan marks pass over both the road and Cache's face.
    ctx.strokeStyle = '#c8eef0'; ctx.globalAlpha = .24; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 23, y + 15); ctx.lineTo(x + 159, y + 3);
    ctx.lineTo(x + w - 32, y + 3); ctx.stroke();
    ctx.globalAlpha = .12; ctx.fillStyle = '#9ac9cb';
    ctx.fillRect(x + 10, y + 75, w - 20, 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#d8eee3'; ctx.font = 'bold 12px Oxanium, monospace';
    ctx.textAlign = 'left'; ctx.fillText('REAR VIEW', x + 19, y + 24);
    if (expression === 4) {
      ctx.fillStyle = '#ff74857d'; ctx.fillRect(x + 5, y + 87, w - 10, 3);
    }
    ctx.restore();
    if(boundedClip) {
      ctx.fillStyle='#25394a';
      mirrorOutline(ctx,x-6,y-5,w+12,h+10);
      mirrorOutline(ctx,x,y,w,h,false);ctx.fill('evenodd');
      ctx.fillStyle=edge;
      mirrorOutline(ctx,x-3,y-2,w+6,h+4);
      mirrorOutline(ctx,x,y,w,h,false);ctx.fill('evenodd');
    }
  }
  // Every supplied stem runs for the complete song. Some recorded passages
  // are softer, but that is not a reason to reject their lane captures.
  const laneAvailable = (lane, bar) => lane >= 0 && lane < LANES.length &&
    bar >= 0 && bar < 100;
  const songSection = bar => {
    if (bar < 4) return 'INTRO';
    if (bar >= 100) return 'TAPE END';
    const phase = (bar - 4) % 24, cycle = 1 + Math.floor((bar - 4) / 24);
    return phase < 8 ? `VERSE ${cycle} A` : phase < 16 ? `VERSE ${cycle} B` : `CHORUS ${cycle}`;
  };
  const stackSize = state => Math.max(1, new Set(state.captures.map(capture => capture.lane)).size);
  const legacyPoint = { 'road-start': 0, 'road-cache': 850, 'road-fork': 1700,
    'road-gate': 2070, 'road-clear': LAP };
  function migrateProof(proof, version) {
    if (version === 4) return proof;
    const old = version === 3 ? proof : {
      ...proof, lane: [0, 0, 1, 3][proof.lane] ?? 0,
      lanePos: [0, 0, 1, 3][Math.round(proof.lanePos ?? proof.lane)] ?? 0,
      musicBar: Math.min(99, Math.floor(proof.progress / (54 * 1.875))) };
    // Indefinite old locks have no bar expiry. Refund them instead of turning
    // an old save into a permanent four-part stack.
    return { ...old, locked: [], lockEnergy: clamp((proof.lockEnergy ?? 65) +
      60 * (proof.locked || []).length, 0, 100) };
  }
  const roadCurve = progress => Math.sin(progress / 190) * 0.72 + Math.sin(progress / 410) * 0.24;
  function pulseVisual(pulse,s,beatSec=60/128) {
    const target=s.pulseTargets[pulse.id];
    if(target===undefined)return null;
    const remaining=target-s.musicBeatFloat;
    const at=s.pulsePlaces?.[pulse.id];
    if(!Number.isFinite(at))return null;
    return {target,remaining,at,d:at-s.progress,
      ready:remaining<=4.05&&remaining>=-(pulseWindowSec(s)+1e-8)/beatSec,
      window:Math.abs(remaining)*beatSec<=pulseWindowSec(s)+1e-8,
      strike:Math.abs(remaining)*beatSec<=pulseWindowSec(s)+1e-8,
      charge:smooth(1-Math.max(0,remaining)),
      count:((Math.floor(s.musicBeatFloat+.00001)%4)+4)%4+1};
  }
  function validEncounterProof(proof, chapter) {
    if(chapter?.encounterVersion===undefined||!B.CacheRoadEncounters)return true;
    if(!B.CacheRoadEncounters.supportedVersion(chartVersion(chapter)))return false;
    const chart=B.CacheRoadEncounters.restore(proof?.encounters,chapter.difficultyId);
    if(chapter.encounterVersion===3) {
      const pursuit=B.CacheRoadPursuit?.restore?.(proof?.pursuit,{barFloat:proof?.musicBar,progress:proof?.progress});
      if(!pursuit||(proof.gateOpen===true&&!pursuit.defeated))return false;
    }
    if(chapter.encounterVersion===4) {
      const combat=B.CacheRoadCombat?.restore?.(proof?.combat,{bar:proof?.musicBar,progress:proof?.progress});
      if(!combat||combat.difficultyId!==chapter.difficultyId||
        (proof.gateOpen===true&&!combat.boss?.defeated))return false;
      if(proof.crosswalks!==undefined&&!B.CacheRoadCrosswalks?.restore?.(proof.crosswalks,
        {bar:proof.musicBar,progress:proof.progress}))return false;
      if(proof.adrenaline!==undefined) {
        const adrenaline=B.CacheRoadAdrenaline?.restore?.(proof.adrenaline);
        if(!adrenaline||adrenaline.receipts.some(receipt=>!chart?.pulses.some(pulse=>
          pulse.id===receipt.id&&pulse.target<=proof.musicBar*4+.001)))return false;
      }
    }
    if(!chart||chart.version!==chartVersion(chapter))return false;
    const section=proof.driveSection;
    if(!section)return !chart.committedBars.includes(proof.musicBar);
    if(!Number.isInteger(section.beat)||section.beat!==proof.musicBar*4||
      section.from!==proof.progress||section.beatSec!==60/128||
      ![section.v0,section.speed].every(v=>Number.isFinite(v)&&v>=30&&v<=75)||
      !Number.isInteger(section.gear)||section.gear<0||section.gear>2||section.gear!==proof.gear||
      ['turbo','surge'].some(key=>section[key]!==undefined&&typeof section[key]!=='boolean'))return false;
    const pulse=chart.pulses.find(item=>item.bar===proof.musicBar);
    return !pulse||Math.abs(pulse.at-drivePosition(section,pulse.target)-STRIKE_DISTANCE)<1e-7;
  }
  const chartVersion = chapter => chapter?.encounterVersion===4?3:chapter?.encounterVersion;
  const faceLabel = (s, action) => s?.combat ? ['SYNC A','SYNC B','SYNC X','SYNC Y'][action] : PULSE_ACTIONS[action]?.label;
  const roadHazards = s => s.encounters ? B.CacheRoadEncounters.hazards(s.encounters) : HAZARDS;
  const roadPulses = s => s.encounters ? B.CacheRoadEncounters.pulses(s.encounters) : PULSES;
  const actorPose = (s, hazard) => {
    const lane = hazardLane(hazard, s.progress, s.audits);
    return s.encounters && B.CacheRoadReactions ? B.CacheRoadReactions.pose(s,hazard,lane) :
      {at:hazard.at,lane,alpha:1,steer:hazardTurn(hazard,s.progress).steer,collidable:true};
  };
  const hazardTurn = (hazard, progress) => {
    if(hazard.encounter) {
      if(!Number.isFinite(hazard.mergeLane))return {amount:0,steer:0};
      const direction=hazard.mergeLane-hazard.lane;
      const t=clamp((progress-(hazard.at-hazard.warningDistance))/hazard.mergeDistance,0,1);
      return {amount:direction*smooth(t),steer:direction*4*t*(1-t)};
    }
    if(!['sweeper','trike'].includes(hazard.kind))return {amount:0,steer:0};
    const direction=hazard.lane===3?-1:1;
    const warning=hazard.kind==='sweeper'?165:205;
    const duration=hazard.kind==='sweeper'?120:125;
    const t=clamp((progress-(hazard.at-warning))/duration,0,1);
    return {amount:direction*smooth(t),steer:direction*4*t*(1-t)};
  };
  const hazardLane = (hazard, progress, audits) => {
    if (hazard.encounter) return hazard.lane + hazardTurn(hazard,progress).amount;
    if (hazard.kind === 'audit') return audits[hazard.at] ?? hazard.lane;
    if (hazard.kind === 'sweeper' || hazard.kind === 'trike') {
      return hazard.lane + hazardTurn(hazard,progress).amount;
    }
    return hazard.lane;
  };

  const PALETTE = ['#69d9f5', '#ffc077', '#cd9dff', '#91f5bc'];
  const polygon = (ctx, points, fill) => {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  // Map a hand-inked decal onto both halves of the exact projected road
  // trapezoid. One affine rectangle would stretch beyond its far edge.
  function paintComicDecal(ctx,key,[a,b,c,d]) {
    if(!B.PresentationAssets?.ready?.(key))return false;
    for(const [corners,matrix] of [
      [[a,b,c],[(b[0]-a[0])/512,(b[1]-a[1])/512,
        (c[0]-b[0])/256,(c[1]-b[1])/256]],
      [[a,c,d],[(c[0]-d[0])/512,(c[1]-d[1])/512,
        (d[0]-a[0])/256,(d[1]-a[1])/256]]
    ]) {
      ctx.save();ctx.beginPath();ctx.moveTo(...corners[0]);
      ctx.lineTo(...corners[1]);ctx.lineTo(...corners[2]);
      ctx.closePath();ctx.clip();ctx.transform(...matrix,a[0],a[1]);
      B.PresentationAssets.draw(key,ctx,{x:key==='cachePulseBurst'?256:0,
        y:key==='cachePulseBurst'?128:0,width:512,height:256});
      ctx.restore();
    }
    return true;
  }
  // Painted action badges share their symbols on the road and HUD; the small
  // vector paths below remain useful while images load.
  function drawActionIcon(ctx,action,x,y,size,color='#d6ffe7',frame=0,roadState=null) {
    if(roadState?.combat) {
      // One data packet with four pieces; face inputs have no combat emblems.
      ctx.save();ctx.translate(x,y);ctx.scale(size/60,size/60);
      ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(-24,-24,48,48);
      for(let part=0;part<4;part++) {
        const px=-18+(part%2)*21,py=-18+Math.floor(part/2)*21;
        ctx.fillStyle=part===action?color:'#304c49';ctx.fillRect(px,py,15,15);
      }
      ctx.restore();return;
    }
    if(B.PresentationAssets?.draw?.(
      ['cachePulseSurge','cachePulsePush','cachePulseBrace','cachePulseRefill'][action],
      ctx,{x,y,width:size,height:size,frame}))return;
    ctx.save();ctx.translate(x,y);ctx.scale(size/60,size/60);
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=5;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    if(action===0) { // Surge: a double forward impulse.
      for(const offset of [0,16]) {
        ctx.moveTo(-20,10-offset);ctx.lineTo(0,-10-offset);
        ctx.lineTo(20,10-offset);
      }
      ctx.stroke();
    } else if(action===1) { // Push: an impact wedge.
      ctx.moveTo(-23,-13);ctx.lineTo(5,-13);ctx.lineTo(24,0);
      ctx.lineTo(5,13);ctx.lineTo(-23,13);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-14,-22);ctx.lineTo(-14,-16);
      ctx.moveTo(-14,16);ctx.lineTo(-14,22);ctx.stroke();
    } else if(action===2) { // Brace: armored shield.
      ctx.moveTo(0,-24);ctx.lineTo(21,-15);ctx.lineTo(18,8);
      ctx.quadraticCurveTo(12,22,0,27);ctx.quadraticCurveTo(-12,22,-18,8);
      ctx.lineTo(-21,-15);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-9,1);ctx.lineTo(-1,9);ctx.lineTo(12,-8);ctx.stroke();
    } else { // Refill: winding signal coil.
      ctx.arc(0,0,21,-.4,Math.PI*1.55);ctx.stroke();
      polygon(ctx,[[16,-21],[27,-18],[21,-8]],color);
      ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(0,11);
      ctx.moveTo(-10,1);ctx.lineTo(10,1);ctx.stroke();
    }
    ctx.restore();
  }
  function drawLaneMark(ctx,lane,x,y,size,color=PALETTE[lane]) {
    ctx.save();ctx.translate(x,y);ctx.scale(size/50,size/50);
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=4;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    if(lane===0) { // Drive: parallel motion tracks.
      for(const offset of [-10,0,10]) {
        ctx.moveTo(offset-9,15);ctx.lineTo(offset+9,-15);
      }
      ctx.stroke();
    } else if(lane===1) { // Flow: continuous waveform.
      ctx.moveTo(-23,0);ctx.bezierCurveTo(-12,-19,-5,-19,2,0);
      ctx.bezierCurveTo(9,19,16,19,23,0);ctx.stroke();
    } else if(lane===2) { // Breakaway: divided outward chevrons.
      ctx.moveTo(-23,15);ctx.lineTo(-5,-4);ctx.lineTo(-23,-20);
      ctx.moveTo(0,15);ctx.lineTo(19,-4);ctx.lineTo(0,-20);ctx.stroke();
    } else { // Undercurrent: pulse below the surface.
      ctx.moveTo(-23,9);ctx.lineTo(-10,9);ctx.lineTo(-4,-10);
      ctx.lineTo(4,20);ctx.lineTo(11,-3);ctx.lineTo(23,-3);ctx.stroke();
      ctx.beginPath();ctx.arc(-16,-11,2,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function instrumentPanel(ctx,x,y,w,h,accent) {
    polygon(ctx,[[x+14,y],[x+w-14,y],[x+w,y+14],[x+w,y+h-10],
      [x+w-10,y+h],[x+10,y+h],[x,y+h-10],[x,y+14]],'#0b1b2bed');
    ctx.strokeStyle=accent;ctx.globalAlpha=.54;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(x+16,y+3);ctx.lineTo(x+w-16,y+3);
    ctx.moveTo(x+9,y+h-5);ctx.lineTo(x+w-9,y+h-5);ctx.stroke();
    ctx.globalAlpha=1;ctx.fillStyle='#527181';
    for(const xx of [x+13,x+w-13]) {
      ctx.beginPath();ctx.arc(xx,y+h-12,2,0,Math.PI*2);ctx.fill();
    }
  }
  const DASH_COLORS=['#a5f5d5','#ffd28d','#ff879a'];
  function dashboardReadout(s) {
    const seconds=clamp(Math.ceil(s.timeMs/1000),0,5999);
    const turboMode=s.queuedTurbo?'queued':s.boostMs>0?'active':
      s.boost?'ready':s.draftMs>0?'draft':'charge';
    const echoMode=s.echo?'active':s.echoEnergy>=100?'ready':'charge';
    const button=(index,fallback)=>B.GamepadUI?.connected?
      B.ControllerSettings?.button(index)||fallback:fallback;
    return {mph:Math.round(Math.max(0,s.speed)*5.2/1.609344),gear:s.gear+1,
      queuedGear:s.pendingGear===null?null:s.pendingGear+1,
      clock:`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`,
      lowTime:s.timeMs<8000,integrity:clamp(s.integrity,0,s.maxIntegrity||3),turboMode,
      turboValue:['queued','active','ready'].includes(turboMode)?1:
        turboMode==='draft'?clamp(s.draftMs/600,0,1):clamp(s.nearMisses/2,0,1),
      echoMode,echoValue:echoMode==='active'?
        clamp(1-s.echo.ageMs/s.echo.durationMs,0,1):clamp(s.echoEnergy/100,0,1),
      turboButton:button(4,'SPACE'),echoButton:button(5,'H')};
  }
  // Static glyph atlases keep the live dashboard crisp. If art is still
  // loading, the same values remain readable through ordinary Canvas text.
  function hudDigits(ctx,text,x,y,height,row=0) {
    const left=x,width=height*64/112,gap=height*.075;
    ctx.save();ctx.fillStyle=DASH_COLORS[row];ctx.textAlign='left';
    for(const char of String(text)) {
      if(char===':'||char==='.') {
        const size=Math.max(2,height*.075);
        if(char===':')ctx.fillRect(x,y+height*.32,size,size);
        ctx.fillRect(x,y+height*(char===':'?.70:.86),size,size);
        x+=height*.18;continue;
      }
      const digit=/[0-9]/.test(char)?Number(char):char==='-'?10:11;
      if(!B.PresentationAssets?.draw?.('cacheDashDigits',ctx,
        {x,y,width,height,sourceRect:[digit*64,row*112,64,112]})) {
        ctx.font=`bold ${Math.round(height*.88)}px Oxanium, monospace`;
        ctx.fillText(char,x,y+height*.84,width);
      }
      x+=width+gap;
    }
    ctx.restore();return x-left-gap;
  }
  function hudIcon(ctx,index,x,y,size,row=0) {
    if(B.PresentationAssets?.draw?.('cacheDashIcons',ctx,
      {x,y,width:size,height:size,sourceRect:[index*64,row*64,64,64]}))return;
    ctx.save();ctx.fillStyle=DASH_COLORS[row];ctx.font=`bold ${Math.round(size*.8)}px Oxanium, monospace`;
    ctx.textAlign='center';ctx.fillText(['◆','◷','↯','↔','◇','»','▣','→'][index],x+size/2,y+size*.8,size);
    ctx.restore();
  }
  function hudSegments(ctx,x,y,width,count,value,row=0) {
    const gap=3,segment=(width-gap*(count-1))/count;
    for(let i=0;i<count;i++) {
      ctx.fillStyle=i<Math.ceil(clamp(value,0,1)*count)?DASH_COLORS[row]:'#19343b';
      ctx.fillRect(x+i*(segment+gap),y,segment,7);
    }
  }
  function dashboardBezel(ctx,x,y,width,height,accent) {
    if(!B.PresentationAssets?.draw?.('cacheDashBezel',ctx,
      {x,y,width,height,sourceRect:[12,120,2018,512]}))
      instrumentPanel(ctx,x,y,width,height,accent);
  }
  const grit = n => { const v=Math.sin(n*78.233+12.9898)*43758.5453; return v-Math.floor(v); };
  function drawGrimyPlume(ctx,x,y,phase,spread,strength,colors,direction=1) {
    ctx.save();
    for(let i=0;i<15;i++) {
      const age=((phase*.013+i*.171+grit(i*11+spread))%1+1)%1;
      const wobble=Math.sin(age*8+i*3.9)*spread*.13;
      const sideways=(grit(i*17+spread)-.5)*spread*.75+age*spread*.32*direction;
      const xx=x+sideways+wobble, yy=y+age*spread*.85;
      const opacity=strength*(1-age)*(.34+grit(i*13)*.33);
      ctx.globalAlpha=opacity;
      ctx.strokeStyle=i%4===0?colors[1]:colors[0];
      ctx.lineWidth=Math.max(1.5,spread*(.036+.052*grit(i*7))*(1-age));
      ctx.beginPath(); ctx.moveTo(xx-spread*.08*direction,yy-spread*.19);
      ctx.quadraticCurveTo(xx+spread*.12*direction,yy-spread*.12,
        xx+spread*(.10+.16*grit(i*5))*direction,yy+spread*.035); ctx.stroke();
      ctx.globalAlpha=opacity*.22; ctx.fillStyle=i%3===0?colors[1]:colors[0];
      ctx.beginPath();ctx.ellipse(xx,yy,spread*(.044+.05*grit(i*19))*(1-age),
        spread*(.028+.025*grit(i*23))*(1-age),-.35,0,Math.PI*2);ctx.fill();
      if(i%2===0) {
        ctx.fillStyle=i%3===0?colors[1]:colors[0];
        const fleck=1+spread*.025*(1-age);
        ctx.fillRect(xx+spread*.14*direction,yy+spread*.04,fleck,fleck*.6);
      }
    }
    ctx.restore();
  }
  // One silhouette language at every depth. The four traffic kinds differ in
  // body shape, lights and warning marks even without reading their labels.
  // Tail lamp bounds measured in a single authored cel (u,v,width,height).
  // Steering paintings have asymmetric lamps; narrow vertical fixtures and
  // the trike's single center lamp cannot use a generic pair at ±.35w.
  const VEHICLE_TAIL_LIGHTS={
    cacheCar:[[.17,.561,.140,.077],[.681,.561,.142,.077]],
    cacheCarLeft:[[.094,.542,.139,.077],[.634,.564,.153,.079]],
    cacheCarRight:[[.282,.572,.150,.082],[.798,.576,.136,.082]],
    cacheCarHit:[[.176,.527,.144,.080],[.702,.527,.137,.073]],
    cacheFreight:[[.233,.670,.109,.053],[.657,.669,.109,.053]],
    cacheCourier:[[.184,.561,.135,.074],[.694,.561,.132,.074]],
    cacheRival:[[.158,.532,.074,.113],[.768,.534,.074,.113]],
    cacheAudit:[[.234,.554,.099,.056],[.723,.554,.099,.056]],
    cacheSweeper:[[.198,.448,.045,.093],[.736,.448,.045,.093]],
    cacheTrike:[[.407,.515,.191,.052]],
    cacheShuttle:[[.206,.598,.058,.119],[.748,.598,.059,.119]]
  };
  function drawBraceHalo(ctx,x,y,w,h,impact,reduced,front) {
    // The painted ring lies on the road around the tires. Its far half must
    // be occluded by the complete car; only the near half draws over it.
    const size=1+(reduced?0:impact*.18);
    const width=w*2.05*size,height=h*.80*size,anchorY=y+h*.10*size;
    const top=anchorY-height*.75,split=top+height*.55;
    ctx.save();ctx.globalAlpha=impact>0?.7+impact*.3:.58;
    ctx.beginPath();ctx.rect(x-width/2,front?split:top,width,
      front?top+height-split:split-top);ctx.clip();
    B.PresentationAssets.draw('cacheBraceHalo',ctx,{x,y:anchorY,width,height});
    ctx.restore();
  }
  function drawVehicle(ctx, x, y, w, h, kind, { alpha = 1, turbo = false,
    phase = 0, steer = 0, hit = 0, braking = false, damage = 0,
    reduced = false } = {}) {
    const artKey = kind === 'cache' ? hit ? 'cacheCarHit' : steer < -.08 ?
      'cacheCarRight' : steer > .08 ? 'cacheCarLeft' : 'cacheCar' :
      ({ freight: 'cacheFreight', van: 'cacheCourier', block: 'cacheBarricade',
        rival: 'cacheRival', audit: 'cacheAudit', sweeper: 'cacheSweeper',
        trike: 'cacheTrike', shuttle: 'cacheShuttle' })[kind];
    if (artKey && B.PresentationAssets?.ready?.(artKey)) {
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= alpha;
      // Cache's generated cels subtly redraw/shift its body. Keep one stable
      // chassis; its tire treads and reflections animate below. Traffic keeps
      // its painted cycles, and Cache's impact remains a one-shot sequence.
      const vehicleFrame = reduced ? 0 : hit && kind === 'cache' ?
        Math.min(7,Math.floor((650-hit)/82)) :
        kind === 'cache' ? 0 :
        ((Math.floor(phase*.11)%8)+8)%8;
      const ratio = kind === 'block' ? [1.12, 1.28] : kind === 'freight' ? [1.27, 1.19] :
        kind === 'trike' ? [1.32, 1.24] : kind === 'sweeper' || kind === 'shuttle' ?
          [1.23, 1.38] : [1.28, 1.32];
      const impact = hit && !reduced ? 1-clamp(hit/650,0,1) : 0;
      const recoil = impact ? Math.exp(-5*impact)*Math.sin(impact*17) : 0;
      const sway = reduced || kind === 'block' || kind === 'cache' ? 0 :
        Math.sin(phase*(kind === 'freight' ? .055 : .082)+x*.009)*.65 +
        Math.sin(phase*(kind === 'freight' ? .105 : .15)+x*.016)*.35;
      // Each painted pose shares its silhouette. The sprung chassis still
      // travels independently while the tire pixels remain planted.
      const heavyBody=['freight','sweeper','shuttle'].includes(kind);
      const bounce = sway*h*(heavyBody ? .025 : .045) - Math.abs(recoil)*h*.08;
      const jolt = recoil*w*.075;
      const roll = reduced ? 0 : (['sweeper','trike'].includes(kind)?-steer*.018:0) +
        sway*.009+recoil*.07;
      const art = { x: 0, y: 1, width: w*ratio[0], height: h*ratio[1],
        frame: vehicleFrame };
      const lamps=(VEHICLE_TAIL_LIGHTS[artKey]||[]).map(([u,v,lw,lh])=>({
        x:(u+lw/2-.5)*art.width,y:art.y+(v+lh/2-1)*art.height,
        width:lw*art.width,height:lh*art.height,v:v+lh/2
      }));
      // Keep the complete truck and both tire masks in one turning frame.
      // The rear view leans into its smooth merge and straightens at the end.
      if(!reduced&&['sweeper','trike'].includes(kind))
        ctx.transform(1,0,-steer*.075,1,0,0);
      // The sweeper already contains complete wheels and brush movement in
      // each cel. Fixed wheel masks cut across its changing wheel outlines,
      // leaving a second tire/body edge while turning. Draw its cel once.
      const anchored = kind !== 'block' && kind !== 'sweeper';
      const splitChassis = anchored && kind !== 'cache';
      const freight = kind === 'freight';
      // The transparent paintings do not all end at the same wheel line:
      // the exhaust/bumper often extends below the tires. Keep each contact
      // point in the road frame while the painted chassis rides its shocks.
      const contact = freight ? [.08,.08] : kind === 'trike' ? [.08] :
        kind === 'sweeper' ? [.075,.075] : kind === 'shuttle' ? [.05,.05] :
        kind === 'audit' ? [.08,.08] : artKey === 'cacheCarLeft' ? [.17,.275] :
        artKey === 'cacheCarRight' ? [.31,.125] : artKey === 'cacheRival' ? [.07,.07] :
        artKey === 'cacheCourier' ? [.15,.15] : [CAR_TIRE_CONTACT,CAR_TIRE_CONTACT];
      // Turning paintings have an angled rear axle. Keep its midpoint on
      // the permanent hit plane instead of lifting it with the selected pose.
      if(kind==='cache')ctx.translate(0,h*((contact[0]+contact[1])/2-CAR_TIRE_CONTACT));
      const tireTop = kind === 'trike' ? [.32] : kind === 'sweeper' ? [.30,.30] :
        kind === 'shuttle' ? [.25,.25] : kind === 'audit' ? [.34,.34] :
        artKey === 'cacheCarLeft' ? [.43,.61] :
        artKey === 'cacheCarRight' ? [.61,.43] : [freight ? .29 : .43,freight ? .29 : .43];
      const tires = anchored ? (kind === 'trike' ? [0] : [-1,1]).map((side,index) => {
        const pos = kind === 'cache' && !hit && steer < -.08 ?
          (side < 0 ? -.51 : .38) : kind === 'cache' && !hit && steer > .08 ?
            (side < 0 ? -.38 : .51) : side*(freight ? .32 :
              kind === 'sweeper' ? .32 : kind === 'shuttle' ? .35 : kind === 'audit' ? .38 : .44);
        const top = -h*tireTop[index], bottom = -h*contact[index];
        return { x: w*pos, top, bottom, height: bottom-top,
          width: w*(kind === 'trike' ? .22 : freight || kind === 'sweeper' || kind === 'shuttle' ? .15 : .125) };
      }) : [];
      // The broken red painting sits on the road before the car and tires.
      // Cache's brake input brightens it; traffic has only a dim tail-light
      // trace, apart from the deliberately slow shuttle.
      if (lamps.length && B.PresentationAssets?.ready?.('cacheBrakeReflection')) {
        const light = kind === 'cache' ? braking ? .76 : hit ? .56 : .11 :
          kind === 'shuttle' ? .34 : kind === 'freight' ? .23 : .16;
        ctx.save();ctx.globalAlpha*=light;
        const tintedReflection=kind==='trike'||kind==='audit';
        const preparedTint=tintedReflection&&B.PresentationAssets?.brakeTintReady?.(ctx);
        if(tintedReflection&&!ctx.shadowBlur&&!ctx.shadowOffsetX&&!ctx.shadowOffsetY) {
          // Hue rotation is pointwise: it cannot paint beyond these source
          // rectangles. Bound its filter layer to the original reflections,
          // with a margin outside their antialiased edges, instead of the
          // whole display/glass inherited by each miniature traffic painter.
          const bounds=lamps.map(lamp=>{
            const lampX=jolt+lamp.x*Math.cos(roll)-lamp.y*Math.sin(roll);
            const width=lamp.width*2.8,height=h*(.66+(1-lamp.v)*.75);
            return {left:lampX-width/2,right:lampX+width/2,bottom:-h*.22+height};
          });
          const left=Math.min(...bounds.map(bound=>bound.left))-2;
          const right=Math.max(...bounds.map(bound=>bound.right))+2;
          const top=-h*.22-2,bottom=Math.max(...bounds.map(bound=>bound.bottom))+2;
          ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
        }
        if(tintedReflection)ctx.filter=preparedTint?'none':'hue-rotate(315deg)';
        for(const lamp of lamps) {
          // Project one broken reflection beneath each real light. The
          // narrow source crop contains one column, not the old fixed pair.
          // Ground streaks widen with distance; their head fits the lens.
          const lampX=jolt+lamp.x*Math.cos(roll)-lamp.y*Math.sin(roll);
          B.PresentationAssets.draw('cacheBrakeReflection',ctx,{
            x:lampX,y:-h*.22,width:lamp.width*2.8,
            height:h*(.66+(1-lamp.v)*.75),sourceRect:[0,0,192,290],tone:preparedTint?'hue315':null });
        }
        ctx.restore();
      }
      // Once the impact pose ends, reduced integrity remains visible on the
      // car itself rather than as another full-screen warning.
      if (kind === 'cache' && damage && !hit &&
          B.PresentationAssets?.ready?.('cacheDamagedExhaust')) {
        const severe = damage >= 2;
        ctx.save();ctx.globalAlpha*=(severe?.58:.34)*
          (reduced?1:.88+.12*Math.sin(phase*.13));
        B.PresentationAssets.draw('cacheDamagedExhaust',ctx,{
          x:-w*.41,y:-h*.14,width:w*(severe?.76:.55),
          height:h*(severe?1.03:.75) });
        ctx.restore();
      }
      ctx.fillStyle = '#0613207d'; ctx.beginPath();
      ctx.ellipse(0,-h*.075,w*.50,Math.max(2,h*.055),0,0,Math.PI*2); ctx.fill();
      for (const tire of tires) {
        ctx.fillStyle = '#030b16c8'; ctx.beginPath();
        ctx.ellipse(tire.x,tire.bottom+2,tire.width*.86,
          Math.max(2,h*.043),0,0,Math.PI*2); ctx.fill();
      }
      if(turbo && !reduced) {
        for(let i=0;i<2;i++) {
          ctx.save(); ctx.globalAlpha*=.29+i*.09;
          ctx.rotate((i?-.09:.08)+Math.sin(phase*.045+i)*.06);
          B.PresentationAssets?.draw?.('cacheSpeedMist',ctx,{
            x:(i?1:-1)*w*.27,y:h*.46+i*7,
            width:w*(1.17+i*.23),height:h*(.48+i*.12),flip:!!i });
          ctx.restore();
        }
        drawGrimyPlume(ctx,-w*.21,-h*.09,phase+7,h*.73,.9,
          ['#8ed4d5','#495360'], -1);
        drawGrimyPlume(ctx,w*.16,-h*.08,phase+29,h*.85,.83,
          ['#e9ab68','#555968'],1);
      }
      if (!reduced && anchored) {
        // Animated wet contact remains behind all moving traffic. It is
        // brighter on Cache, whose tire motion is the player's main cue.
        for (const tire of tires) {
          for (let i=0; i<(kind === 'cache'?6:3); i++) {
            const cycle = ((phase*.75+i*8+tire.x) % 40+40) % 40;
            const drift = (tire.x < 0 ? -1 : 1)*(8+cycle*.66);
            ctx.strokeStyle = kind === 'cache' ?
              (i%2 ? '#a4e8ef8c' : '#e9d0ae80') : '#9ec4c16a';
            ctx.lineWidth = Math.max(.9,w*.009)*(1-cycle/54);
            ctx.beginPath(); ctx.moveTo(tire.x,tire.bottom+2+cycle*.42);
            ctx.lineTo(tire.x+drift,tire.bottom+5+cycle*.84); ctx.stroke();
          }
        }
      }
      // Traffic can ride its suspension around anchored wheel pixels. Cache
      // is a single registered image: splitting its painted outline made its
      // body shake against its wheels even during constant-speed driving.
      for (const tire of splitChassis ? tires : []) {
        ctx.strokeStyle = '#0a1421'; ctx.lineWidth = Math.max(2,tire.width*.43);
        ctx.beginPath(); ctx.moveTo(tire.x,tire.top+tire.height*.42);
        ctx.lineTo(tire.x+jolt*.5,tire.top+bounce+h*.025); ctx.stroke();
      }
      for (const tire of splitChassis ? tires : []) {
        ctx.save(); ctx.beginPath();
        ctx.roundRect(tire.x-tire.width/2,tire.top,tire.width,tire.height,Math.max(1,tire.width*.2));
        ctx.clip(); B.PresentationAssets.draw(artKey, ctx, art); ctx.restore();
      }
      ctx.save(); ctx.translate(jolt,bounce); ctx.rotate(roll);
      if (splitChassis) {
        ctx.beginPath(); ctx.rect(-art.width/2,-art.height,art.width,art.height+2);
        for (const tire of tires)
          ctx.roundRect(tire.x-tire.width/2-jolt,tire.top-bounce,tire.width,tire.height,
            Math.max(1,tire.width*.2));
        ctx.clip('evenodd');
      }
      B.PresentationAssets.draw(artKey, ctx, art);
      ctx.restore();
      if (lamps.length) {
        // Small changing reflections animate the painted rear lamps without
        // replacing the hand-painted vehicle poses or flashing a whole car.
        ctx.save();ctx.translate(jolt,bounce);ctx.rotate(roll);
        clipLightBlend(ctx,lamps.map(lamp=>[lamp.x-lamp.width*.42,lamp.y-lamp.height*.33,
          lamp.x+lamp.width*.42,lamp.y+lamp.height*.33]));
        ctx.globalCompositeOperation='screen';
        ctx.globalAlpha*=kind==='cache' && braking ? .72 :
          reduced?.18:.15+.14*(.5+.5*Math.sin(phase*.17+x*.01));
        ctx.fillStyle=kind==='cache' && braking ? '#ff7773' :
          kind==='trike'||kind==='audit'?'#ff81e7':
          kind==='cache'||kind==='sweeper'||kind==='shuttle'?'#ffc179':'#ff8e87';
        for(const lamp of lamps) {
          ctx.beginPath();ctx.ellipse(lamp.x,lamp.y,
            lamp.width*.42,lamp.height*.33,0,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      }
      for (const tire of tires) {
        const top = tire.top+tire.height*.25;
        const tireH = tire.height*.64;
        const tireW = tire.width*.61;
        ctx.save(); ctx.beginPath();
        ctx.roundRect(tire.x-tireW/2,top,tireW,tireH,Math.max(1,tireW*.24)); ctx.clip();
        ctx.fillStyle = '#0a111ca8'; ctx.fillRect(tire.x-tireW/2,top,tireW,tireH);
        const pitch = tireH/4;
        const offset = reduced ? 0 : ((phase*(freight ? .53 : .42)) % pitch + pitch) % pitch;
        for (let tread=-1; tread<5; tread++) {
          const yy = top+tread*pitch+offset;
          ctx.fillStyle = freight ? '#8a98a6cc' : '#7e8c9bc9';
          ctx.fillRect(tire.x-tireW*.37,yy,tireW*.3,Math.max(1,pitch*.3));
          ctx.fillStyle = '#5d7082bd';
          ctx.fillRect(tire.x+tireW*.06,yy+pitch*.24,tireW*.3,Math.max(1,pitch*.3));
        }
        ctx.restore();
      }
      if (kind === 'cache' && !hit && Math.abs(steer) > .08) {
        // A side rim becomes visible only while turning. Its narrow ellipse
        // spins inside the actual wheel rather than beside the car.
        const wx = (steer < 0 ? 1 : -1)*w*.40;
        const wy = -h*(steer < 0 ? .27 : .29);
        const rx = w*.020, ry = h*.072;
        ctx.save(); ctx.beginPath(); ctx.ellipse(wx,wy,rx,ry,0,0,Math.PI*2); ctx.clip();
        ctx.fillStyle = '#18202bd7'; ctx.fillRect(wx-rx,wy-ry,rx*2,ry*2);
        ctx.strokeStyle = '#d9b477d9'; ctx.lineWidth = Math.max(.8,w*.007);
        ctx.beginPath(); ctx.ellipse(wx,wy,rx*.92,ry*.92,0,0,Math.PI*2); ctx.stroke();
        for (let spoke=0; spoke<4; spoke++) {
          const angle=(reduced ? 0 : phase*.18)+spoke*Math.PI/2;
          ctx.beginPath(); ctx.moveTo(wx,wy);
          ctx.lineTo(wx+Math.cos(angle)*rx*.76,wy+Math.sin(angle)*ry*.76); ctx.stroke();
        }
        ctx.restore();
      }
      if (kind === 'audit' || kind === 'trike') {
        // Roof beacons and signal mast respond to travel without moving the
        // grounded tire pixels. A scan/merge is visible before its collision.
        const pulse = reduced ? .55 : .35 + .65 * Math.pow(Math.sin(phase*.11),2);
        ctx.save(); ctx.translate(jolt,bounce); ctx.rotate(roll);
        ctx.globalAlpha *= pulse;
        ctx.fillStyle = kind === 'audit' ? '#ff77bb' : '#8af6f1';
        ctx.beginPath(); ctx.ellipse(0,-h*(kind === 'trike' ? 1.18 : 1.25),
          w*.11,h*.045,0,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
      ctx.restore(); return;
    }
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= alpha;
    if (!reduced && kind !== 'block' && kind !== 'cache')
      ctx.translate(0, Math.sin(phase*.18+x*.04)*Math.max(1,h*.03));
    ctx.fillStyle = '#07111da9'; ctx.beginPath();
    ctx.ellipse(0, 7, w * 0.62, Math.max(4, h * 0.13), 0, 0, Math.PI * 2); ctx.fill();
    if (kind === 'block') {
      polygon(ctx, [[-w*.57,0],[-w*.54,-h*.64],[-w*.43,-h*.77],[w*.43,-h*.77],[w*.54,-h*.64],[w*.57,0]], '#f0a35b');
      polygon(ctx, [[-w*.47,-h*.59],[w*.47,-h*.59],[w*.44,-h*.13],[-w*.44,-h*.13]], '#2b3149');
      for (let i = -1; i <= 1; i++) polygon(ctx,
        [[(i-.42)*w/3,-h*.59],[(i+.08)*w/3,-h*.59],[(i+.42)*w/3,-h*.13],[(i-.08)*w/3,-h*.13]], '#ffe5a9');
      ctx.fillStyle = '#ff5f7b'; ctx.fillRect(-w*.48,-h*.78,w*.22,h*.1); ctx.fillRect(w*.26,-h*.78,w*.22,h*.1);
    } else if (kind === 'freight') {
      ctx.fillStyle = '#0b1e30'; ctx.fillRect(-w*.57,-h*.22,w*.17,h*.29); ctx.fillRect(w*.40,-h*.22,w*.17,h*.29);
      polygon(ctx, [[-w*.49,-h*.06],[-w*.49,-h*.88],[-w*.38,-h],[w*.38,-h],[w*.49,-h*.88],[w*.49,-h*.06]], '#657d89');
      polygon(ctx, [[-w*.40,-h*.89],[w*.40,-h*.89],[w*.42,-h*.28],[-w*.42,-h*.28]], '#19384d');
      ctx.strokeStyle = '#91c8d1'; ctx.lineWidth = Math.max(1,w*.018); ctx.strokeRect(-w*.38,-h*.86,w*.76,h*.56);
      ctx.fillStyle = '#d0dee0'; ctx.fillRect(-w*.025,-h*.86,w*.05,h*.58);
      ctx.fillStyle = '#ff8275'; ctx.fillRect(-w*.42,-h*.19,w*.19,h*.09); ctx.fillRect(w*.23,-h*.19,w*.19,h*.09);
    } else {
      const player = kind === 'cache' || kind === 'echo';
      const body = kind === 'rival' ? '#f9f6ee' : kind === 'audit' ? '#f1eee9' : kind === 'sweeper' ? '#e5a15f' :
        kind === 'van' ? '#4c8fc0' : kind === 'echo' ? '#b7f8ff' : turbo ? '#fbe3a3' : '#61e7d4';
      if(turbo&&!reduced)
        drawGrimyPlume(ctx,0,-h*.08,phase,h*.9,.85,['#e8a469','#5e626a']);
      ctx.fillStyle = '#0b1726'; ctx.fillRect(-w*.55,-h*.35,w*.15,h*.4); ctx.fillRect(w*.4,-h*.35,w*.15,h*.4);
      polygon(ctx, [[-w*.47,0],[-w*.53,-h*.48],[-w*.32,-h*.67],[w*.32,-h*.67],[w*.53,-h*.48],[w*.47,0]], body);
      polygon(ctx, [[-w*.33,-h*.59],[-w*.25,-h*.91],[w*.25,-h*.91],[w*.33,-h*.59]],
        kind === 'audit' || kind === 'rival' ? '#8f9ba6' : '#163b52');
      ctx.fillStyle = kind === 'audit' || kind === 'rival' ? '#fb6087' : kind === 'sweeper' ? '#fff2a8' : '#ffc077';
      ctx.fillRect(-w*.43,-h*.22,w*.23,h*.105); ctx.fillRect(w*.2,-h*.22,w*.23,h*.105);
      ctx.fillStyle = '#132239'; ctx.fillRect(-w*.16,-h*.19,w*.32,h*.11);
      if (player) {
        ctx.strokeStyle = '#eaffef'; ctx.lineWidth = Math.max(2,w*.024);
        ctx.beginPath(); ctx.moveTo(-w*.56,-h*.62); ctx.lineTo(w*.56,-h*.62); ctx.stroke();
        ctx.fillStyle = '#edfff4';
        ctx.beginPath(); ctx.arc(-w*.11,-h*.73,w*.045,0,Math.PI*2); ctx.arc(w*.11,-h*.73,w*.045,0,Math.PI*2); ctx.fill();
        ctx.font = `bold ${Math.max(8,w*.115)}px Oxanium, monospace`;
        ctx.textAlign = 'center'; ctx.fillText(kind === 'echo' ? 'REPLAY' : 'CACHE', 0, -h*.32);
        if (kind === 'echo') {
          ctx.strokeStyle = '#dfffff'; ctx.lineWidth = Math.max(2,w*.03);
          ctx.strokeRect(-w*.56,-h*.94,w*1.12,h*1.05);
        }
      } else if (kind === 'rival') {
        ctx.fillStyle = '#fc5c91'; ctx.fillRect(-w*.42,-h*.53,w*.84,h*.1);
        ctx.fillStyle = '#19334a'; ctx.font = `bold ${Math.max(8,w*.12)}px Oxanium, monospace`;
        ctx.textAlign = 'center'; ctx.fillText('COPY', 0, -h*.31);
        ctx.strokeStyle = '#ffacc1'; ctx.lineWidth = Math.max(2,w*.03);
        ctx.beginPath(); ctx.moveTo(-w*.58,-h*.65); ctx.lineTo(w*.58,-h*.65); ctx.stroke();
      } else if (kind === 'audit') {
        polygon(ctx, [[0,-h*.94],[-w*.09,-h*.75],[0,-h*.7],[w*.09,-h*.75]], '#fd497f');
        ctx.fillStyle = '#fb6087'; ctx.fillRect(-w*.24,-h*.48,w*.48,h*.095);
      } else if (kind === 'sweeper') {
        ctx.fillStyle = '#fff0a8'; ctx.font = `bold ${Math.max(10,w*.22)}px Oxanium, monospace`;
        ctx.textAlign = 'center'; ctx.fillText('>', 0, -h*.31);
      } else {
        ctx.fillStyle = '#9ae8ff'; ctx.fillRect(-w*.2,-h*.52,w*.4,h*.09);
      }
    }
    if (kind !== 'block') {
      ctx.strokeStyle = '#c3d9de'; ctx.lineWidth = Math.max(1,w*.012);
      for (const side of [-1,1]) {
        const xx = side*w*.475, yy = -h*.15, radius = Math.max(2,w*.055);
        ctx.beginPath(); ctx.arc(xx,yy,radius,0,Math.PI*2); ctx.stroke();
        for (let spoke=0; spoke<3; spoke++) {
          const angle=(reduced ? 0 : phase*.25)+spoke*Math.PI*2/3;
          ctx.beginPath(); ctx.moveTo(xx,yy);
          ctx.lineTo(xx+Math.cos(angle)*radius*.8,yy+Math.sin(angle)*radius*.8);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function newState(saved = {}) {
    const progress = saved.progress ?? 0;
    const lanePos = saved.lanePos ?? saved.lane ?? 1;
    return { progress, lanePos, lane: Math.round(lanePos), visualLane: lanePos,
      captures: [], queuedCaptures: [], hitRecovery: false,
      caughtPulses: {}, missedPulses: {}, driveFeedback: null, beatFeedback: null, mixFeedback: null,
      pulseTargets: {}, pulsePlaces: {}, pendingPulseAwards: [], streetMotion: {},
      gear: Number.isInteger(saved.gear)?clamp(saved.gear,0,2):
        (saved.speed<=36?0:saved.speed>=61?2:1),
      pendingGear: null, pendingGearBeat: 0, queuedTurbo: false, turboBeat: 0,
      queuedSurge: false, surgeBeat: 0, queuedRecovery: false, recoveryBeat: 0,
      driveSections: [], driveBeat: null, shiftStartBeat: -100, shiftFrom: 1,
      pulseFlashMs: 0, pulseFlashAction: null, pulseFlashLane: null,
      pulseTiming: '', pulseCombo: 0, lastPulseCue: '',
      lastPulseRun: null, lastPulseOrder: -1,
      fullAdrenaline: false, fullAdrenalineCount: 0, shield: 0, ramMs: 0, surgeMs: 0,
      fastPulses: 0,
      cutMarks: {}, cutStreak: 0, cutFlashMs: 0, cutAward: 0,
      musicBeatFloat: (saved.musicBar ?? 0) * 4,
      scoredThrough: (saved.musicBar ?? 0) - 1, damagedBar: -1,
      score: saved.score ?? 0, peakStack: saved.peakStack ?? 1,
      cleanBars: saved.cleanBars ?? 0, stumbleMs: 0,
      integrity: saved.integrity ?? 3,
      speed: saved.speed ?? GEAR_SPEEDS[1], timeMs: saved.timeMs ?? 55000,
      musicBar: saved.musicBar ?? 0, gateAt: saved.gateAt ?? null,
      // Keep the saved field name so version-4 road checkpoints still load.
      lockEnergy: saved.lockEnergy ?? 0, zoneEndBeat: -1,
      echoEnergy: saved.echoEnergy ?? (progress >= 1700 ? 100 : 65),
      boost: saved.boost ?? 1, boostMs: 0, invulnerableMs: 0, nearMisses: 0,
      steer: 0, braking: false, throttling: false, trace: [], echo: null, echoDeceptions: 0,
      audits: {}, drafted: {}, draftMs: 0, draftTarget: null,
      turboReadyMs: 0, defenseFlashMs: 0, defenseKind: '',
      passFlashMs: 0, passSide: 1, passAward: 0,
      nextRivalAt: (saved.musicBar??0)>=76 ? progress + 120 : 3 * LAP + 1810,
      rivalTarget: 1.5, rivalLane: 1.5, rivalWarning: false,
      rivalEchoCommitted: false, rivalDistractedMs: 0,
      // Road lessons are momentary guidance, not save or music state.
      opening: { held: false, sealed: false, turbo: false, echo: false, auditFollowedEcho: false },
      message: '', messageMs: 0, recordHoldMs: 0, recordIndex: -1,
      mirrorState:B.CacheRoadMirror?.create(saved),crosswalkToast:null,crosswalkMessages:[],crosswalkCalloutIds:[],
      recordFlashMs: 0, recordFlashIndex: -1, recordSigns: {},
      gateOpen: !!saved.gateOpen, gateFailure: null,
      // Camera follow is transient presentation state, never a save or clock.
      cameraMotion: {zoom:1,x:0,y:0,roll:0,velocity:{zoom:0,x:0,y:0,roll:0}},
      status: saved.status || 'playing', elapsedMs: 0 };
  }

  function drawCrosswalkGround(ctx,pose,{point,near,far,reduced,miniature=false}) {
    for(const crossing of pose.crossings) {
      if(crossing.at<near||crossing.at>far)continue;
      ctx.save();ctx.globalAlpha=miniature?.55:.82;
      // Twelve zebra stripes remain on the committed tire plane as the road
      // bends and the gear changes. They reserve no lane or musical address.
      for(let stripe=0;stripe<12;stripe++) {
        const lane=-.49+stripe/3;
        polygon(ctx,[point(lane,crossing.at-13),point(lane+.21,crossing.at-13),
          point(lane+.21,crossing.at+13),point(lane,crossing.at+13)],'#eee6cc');
      }
      if(!miniature) {
        ctx.globalAlpha=.75;ctx.strokeStyle='#f1c881';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(...point(-.48,crossing.at-29));
        ctx.lineTo(...point(3.48,crossing.at-29));ctx.stroke();
        for(const side of [-1,1]) {
          const [x,y]=point(side<0?-.85:3.85,crossing.at+15);
          const left=point(-.5,crossing.at),right=point(3.5,crossing.at);
          const scale=clamp(Math.abs(right[0]-left[0])/1200,.1,1.5),height=156*scale;
          B.PresentationAssets?.draw?.(side<0?'cacheNewCrossingSignalL':'cacheNewCrossingSignalR',ctx,
            {x,y,width:height*2/3,height,frame:crossing.started?1:0});
        }
      }
      ctx.restore();
    }
  }
  function drawCrosswalkPerson(ctx,person,{x,y,height,reduced}) {
    const carrier=person.side==='left',key=carrier?'cachePersonCrateCarrierTravel':'cachePersonHandheldPlayerTravel';
    const width=height*(carrier?432/384:278/384),hit=person.phase==='hit';
    if(hit)B.CacheRoadCombatArt?.drawBlood?.(ctx,{x,y,width:height*.96,height:height*.46,
      ageMs:person.hitAgeMs||0,variant:carrier?0:1,reduced,
      flashes:window.BARCODE_RENDER_QUALITY?.flashes!==false});
    const frame=reduced||person.phase==='waiting'?0:
      Math.floor((person.walkingMs||0)/210)%(carrier?8:4);
    ctx.save();ctx.globalAlpha*=hit?.82:1;
    // A hit throws the whole authored person, then leaves a grounded body.
    // Reduced Motion displays the same result without the airborne arc.
    const age=person.hitAgeMs||0,airborne=hit&&!reduced&&age<700;
    const lift=airborne?Math.sin(age/700*Math.PI)*height*.52:0;
    ctx.translate(x,y-lift);
    if(hit) {
      const turn=reduced?1:smooth(Math.min(1,age/700));
      ctx.rotate((person.hitSide||(carrier?1:-1))*Math.PI*.5*turn);
      ctx.translate(0,height*.23);
    }
    B.PresentationAssets?.draw?.(key,ctx,{x:0,y:0,width,height,frame});
    ctx.restore();
  }
  const combatVehicleKind = kind => ({bike:'trike',rammer:'sweeper',escort:'audit',disruptor:'rival'}[kind]||'rival');
  function combatBodies(s,framePose) {
    const pose=framePose||B.CacheRoadCombat.pose(s.combat,{progress:s.progress,lanePos:s.lanePos,
      syncCount:new Set(s.captures.map(part=>part.lane)).size});
    return [...pose.actors,...pose.wrecks];
  }
  function drawCombatBody(ctx,actor,{x,y,width,height,reduced,elapsedMs,riderX}) {
    // The mechanics checkpoint uses the existing road art. The final art
    // painter replaces these bodies without owning position, time or contact.
    if(actor.wreck)B.CacheRoadCombatArt?.drawBlast?.(ctx,{x,y:y-height*.45,
      width:width*1.75,height:height*1.55,ageMs:actor.ageMs,reduced,
      flashes:window.BARCODE_RENDER_QUALITY?.flashes!==false,alpha:actor.alpha??1});
    if(B.CacheRoadCombatArt?.drawBody?.(ctx,{...actor,lift:actor.height,riderLift:actor.riderHeight,
      x,y,width,height,reduced,elapsedMs,riderX,
      flashes:window.BARCODE_RENDER_QUALITY?.flashes!==false}))return;
    ctx.save();ctx.globalAlpha*=actor.alpha??1;
    const wreck=actor.phase==='wreck'||actor.wreck===true;
    if(wreck&&!reduced){ctx.translate(x,y-height*.35);ctx.rotate(actor.flipAngle||0);x=0;y=height*.35;}
    drawVehicle(ctx,x,y,width,height,combatVehicleKind(actor.kind),{
      alpha:actor.alpha??1,phase:elapsedMs*.054+actor.at*.17,steer:actor.steer||0,reduced});
    ctx.restore();
  }
  function drawCombatWorld(ctx,s,{depth,laneX,laneEdge,roadY,frontNear,reduced,camera,cameraWarnings,vehicleAtDepth,combatPose,feedback=true}) {
    const pose=combatPose;
    for(const actor of [...pose.actors,...pose.wrecks]
      .sort((a,b)=>b.at-a.at)) {
      const d=actor.at-s.progress;if(d<frontNear||d>520)continue;
      const t=depth(d),x=laneX(actor.lane,t),y=roadY(t),w=26+113*t,h=24+111*t;
      vehicleAtDepth(t,()=>{
        if(actor.kind!=='rig')drawCombatBody(ctx,actor,{x,y,width:w,height:h,reduced,elapsedMs:s.elapsedMs,
          riderX:Number.isFinite(actor.riderLane)?laneX(actor.riderLane,t):undefined});
        else if(actor.wreck)B.CacheRoadCombatArt?.drawBlast?.(ctx,{
          x,y:y-h*.55,width:w*2.35,height:h*2.05,ageMs:actor.ageMs,reduced,
          flashes:window.BARCODE_RENDER_QUALITY?.flashes!==false,alpha:actor.alpha??1});
        const threatening=['windup','committed'].includes(actor.phase);
        if(feedback&&threatening) {
          const lane=actor.lockLane??actor.targetLane??actor.lane;
          const left=laneEdge(Math.round(lane),t),right=laneEdge(Math.round(lane)+1,t);
          ctx.save();ctx.globalAlpha=actor.phase==='committed'?.62:.32;
          ctx.strokeStyle='#ff9d8a';ctx.lineWidth=4;ctx.strokeRect(left,y-70*t,right-left,70*t);
          ctx.fillStyle='#ffd4a7';ctx.font=`bold ${Math.round(12+18*t)}px Oxanium, monospace`;
          ctx.textAlign='center';ctx.fillText(actor.phase==='committed'?'LOCKED':'WINDUP',laneX(lane,t),y-h-14);
          ctx.restore();
        }
        if(feedback&&actor.kind!=='rig'&&Number.isFinite(actor.hp)&&actor.hp>0) {
          ctx.fillStyle='#241b20';ctx.fillRect(x-w*.35,y-h-6,w*.7,4);
          ctx.fillStyle='#ffb39b';ctx.fillRect(x-w*.35,y-h-6,w*.7*actor.hp/(actor.maxHp||actor.hp),4);
        }
      });
      if(feedback&&d>=-8&&d<=260) {
        const marker=cameraEdgeMarker(camera,{x,y,width:actor.kind==='rig'?46+t*192:w*1.35,
          height:actor.kind==='rig'?55+t*215:h*1.25});
        if(marker)cameraWarnings.push({lane:actor.lane,d,marker});
      }
    }
    if(!feedback)return;
    for(const shot of pose.projectiles) {
      const d=shot.at-s.progress;if(d<frontNear||d>520)continue;
      const t=depth(d),x=laneX(shot.lane,t),y=roadY(t);
      vehicleAtDepth(t,()=>{
        // Generated diagonal art rotates into the actual road-facing travel vector.
        if(!B.CacheRoadCombatArt?.drawFX?.(ctx,{x,y:y-14*t,width:24+52*t,height:24+52*t,
          frame:shot.kind==='reflected'?2:shot.friendly?0:1,angle:-Math.PI/4,
          reduced,flashes:window.BARCODE_RENDER_QUALITY?.flashes!==false})) {
          ctx.save();ctx.strokeStyle=shot.friendly?'#eaffbc':'#ff9387';ctx.lineWidth=2+4*t;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-12-25*t);ctx.stroke();ctx.restore();
        }
        if(!shot.friendly) {
          ctx.save();ctx.strokeStyle='#ffb08d';ctx.lineWidth=2;
          ctx.strokeRect(laneEdge(Math.round(shot.lane),t),y-25-40*t,
            laneEdge(Math.round(shot.lane)+1,t)-laneEdge(Math.round(shot.lane),t),25+40*t);
          ctx.restore();
        }
      });
      if(!shot.friendly) {
        const marker=cameraEdgeMarker(camera,{x,y,width:40+40*t,height:35+35*t});
        if(marker)cameraWarnings.push({lane:shot.lane,d,marker});
      }
    }
    for(const fx of s.combatFx||[]) {
      const age=s.elapsedMs-fx.atMs,d=fx.at-s.progress;if(age<0||age>=fx.duration||d<frontNear||d>520)continue;
      const t=depth(d),frame=fx.type==='muzzle'?3:fx.type==='ram'?age<100?8:9:
        fx.type==='disrupt'?10:age>=350?11:Math.min(7,4+Math.floor(age/100));
      vehicleAtDepth(t,()=>B.CacheRoadCombatArt?.drawFX?.(ctx,{x:laneX(fx.lane,t),y:roadY(t)-30*t,
        width:(fx.type==='ram'?50:28)+100*t,height:(fx.type==='ram'?50:28)+100*t,
        frame,alpha:1-age/fx.duration,reduced,flashes:window.BARCODE_RENDER_QUALITY?.flashes!==false}));
    }
    if(pose.target&&pose.target.at>=s.progress+frontNear&&pose.target.at<=s.progress+520) {
      const t=depth(pose.target.at-s.progress),x=laneX(pose.target.lane,t),y=roadY(t);
      vehicleAtDepth(t,()=>{
        ctx.save();ctx.strokeStyle='#ecffd2';ctx.lineWidth=2;ctx.strokeRect(x-20-20*t,y-70*t,40+40*t,40+30*t);ctx.restore();
      });
    }
  }
  function drawCombatSkills(ctx,s,pose) {
    if(!B.CacheRoadInstruments?.drawSkills?.(ctx,s,pose)) {
    for(const [i,name] of ['attack','turbo','defend','disrupt'].entries()) {
      const skill=pose.skills[name],x=1366+i*128,action=`road_${name}`;
      const fallback={attack:'F',turbo:'SPACE',defend:'G',disrupt:'V'}[name];
      const label=B.ControllerSettings?.prompt?.(action,fallback)||fallback;
      const index={attack:5,turbo:4,defend:6,disrupt:7}[name];
      const on=(skill?.activeMs||0)>0||(name==='turbo'&&s.boostMs>0);
      ctx.fillStyle=on?'#264237':'#0c252b';ctx.fillRect(x,102,122,56);
      B.CacheRoadGuidance?.drawButton(ctx,{index,x:x+25,y:119,size:24,label,active:!!skill?.ready});
      ctx.textAlign='left';ctx.fillStyle=skill?.ready?'#d4ffca':'#9db7b7';ctx.font='bold 11px Oxanium, monospace';
      ctx.fillText(name.toUpperCase(),x+49,116,69);
      ctx.font='bold 10px Oxanium, monospace';
      ctx.fillText(name==='turbo'&&s.queuedTurbo?'NEXT ONE':on?'ACTIVE':skill?.inFlight?'SHOT IN FLIGHT':skill?.ready?
        name==='attack'?`READY · ${skill.charges}/2`:'READY':`${((skill?.cooldownMs||0)/1000).toFixed(1)}s`,x+49,134,70);
      ctx.fillStyle='#4e8371';ctx.fillRect(x+8,147,106*(skill?.ready?1:Math.max(0,1-(skill?.cooldownMs||0)/(skill?.rechargeMs||6000))),3);
    }
    ctx.fillStyle=pose.syncCount===4?'#eaffbc':'#a8d3c8';ctx.font='bold 13px Oxanium, monospace';ctx.textAlign='right';
    ctx.fillText(`SYNC ${pose.syncCount}/4 · POWER ×${pose.benefits.power.toFixed(2)} · AMMO ${(pose.benefits.ammoMs/1000).toFixed(1)}s`,1872,167);
    }
    if(pose.boss?.hp>0&&pose.boss?.arrived!==false) {
      ctx.fillStyle='#071b26e8';ctx.fillRect(672,176,576,48);
      ctx.fillStyle='#ffceac';ctx.font='bold 17px Oxanium, monospace';ctx.textAlign='left';
      ctx.fillText(`RIG / ${Number(pose.boss.hp.toFixed(1))} HP · ${pose.boss.health} SYSTEMS`,690,197);
      ctx.fillStyle='#3d2830';ctx.fillRect(690,205,540,7);
      ctx.fillStyle='#ff927b';ctx.fillRect(690,205,540*pose.boss.hp/pose.boss.maxHp,7);
    }
  }

  function stateFromCheckpoint(saved) {
    const clear = saved.checkpointId === 'road-clear';
    return newState({ ...migrateProof(saved.levelState.proof, saved.levelState.proofVersion),
      // Old one-lap clears must remain valid when checkpoint() upgrades them
      // to the full-song save format. Ordinary legacy markers keep their bar.
      ...(clear && saved.levelState.proofVersion < 3 ? { musicBar: 100 } : {}),
      status: clear ? 'clear' : 'playing' });
  }

  // Presentation reads live state but never advances distance, music or input.
  const CAMERA_PIVOT_Y = ROAD_HORIZON + STRIKE_DEPTH * STRIKE_DEPTH * (ROAD_BOTTOM - ROAD_HORIZON);
  function cameraTarget(s) {
    const rush=smooth(clamp((s.speed-30)/45,0,1)),boost=s.boostMs>0?1:0;
    const pass=clamp(s.passFlashMs/780,0,1),hit=clamp(s.stumbleMs/650,0,1);
    const steering=clamp(s.steer||0,-1,1),t=s.elapsedMs/1000;
    const section=s.driveSections?.at(-1),age=s.musicBeatFloat-(section?.beat||0);
    // Read the existing bar's smooth gear transition; never create another clock.
    const shift=section&&age>=0&&age<SHIFT_BLEND_BEATS?
      Math.sin(age/SHIFT_BLEND_BEATS*Math.PI)*clamp((section.speed-section.v0)/45,-1,1):0;
    // A broad, slow breathing cycle opens/closes the aperture between bursts.
    // The tire-contact pivot keeps the hit plane centered through the zoom.
    const breathe=(.5+.5*Math.sin(t*1.45))*rush;
    const danger=s.combat?clamp(s.combatDanger||0,0,1):s.pursuit?.version===3&&s.rivalWarning?clamp(1-(s.nextRivalAt-s.progress)/300,0,1):0;
    const victory=clamp((s.bossVictoryMs||0)/3600,0,1);
    return {zoom:clamp(1+.235*rush+.05*boost+.024*breathe+.032*shift+.012*pass-.14*danger+.035*victory,1,1.335),
      x:-steering*23*rush+Math.sin(t*2.1)*7*rush,
      y:Math.sin(t*2.7)*6*rush,
      roll:-steering*.012*rush+Math.sin(t*1.7)*.0045*rush};
  }
  function advanceCamera(s,dt,{reduced=false}={}) {
    const neutral={zoom:1,x:0,y:0,roll:0};
    const target=reduced||window.BARCODE_RENDER_QUALITY?.flashes===false?neutral:cameraTarget(s);
    const pose=s.cameraMotion||(s.cameraMotion={...neutral,velocity:{zoom:0,x:0,y:0,roll:0}});
    if(reduced||window.BARCODE_RENDER_QUALITY?.flashes===false) {
      Object.assign(pose,neutral);for(const key of Object.keys(neutral))pose.velocity[key]=0;return;
    }
    // Exact critically damped follow for a constant target over this update.
    // About 250 ms of trailing response, no overshoot, no render-time mutation.
    const seconds=clamp(dt,0,100)/1000,omega=12,decay=Math.exp(-omega*seconds);
    for(const key of Object.keys(neutral)) {
      const offset=pose[key]-target[key],v=pose.velocity[key],term=v+omega*offset;
      pose[key]=target[key]+(offset+term*seconds)*decay;
      pose.velocity[key]=(v-omega*term*seconds)*decay;
    }
    pose.zoom=clamp(pose.zoom,1,1.335);
    pose.x=clamp(pose.x,-30,30);pose.y=clamp(pose.y,-6,6);pose.roll=clamp(pose.roll,-.017,.017);
  }
  function speedCamera(s,{reduced=false,intro=null,playing=true,outroMs=null}={}) {
    reduced=reduced||window.BARCODE_RENDER_QUALITY?.flashes===false;
    if(intro!==null)return {zoom:reduced?1.045:1.13-.13*clamp((intro-1100)/3100,0,1),x:0,y:0,roll:0};
    if(reduced||(!playing&&outroMs===null))return {zoom:1,x:0,y:0,roll:0};
    const base=s.cameraMotion||cameraTarget(s);
    // One soft impact oscillation replaces the rapid alternating jitter.
    const hit=clamp(s.stumbleMs/650,0,1),pass=clamp(s.passFlashMs/780,0,1);
    const impact=Math.sin((1-hit)*Math.PI*2)*hit;
    const glide=Math.sin((1-pass)*Math.PI)*pass*(s.passSide||1);
    const pose={zoom:base.zoom,x:base.x+impact*7+glide*2,
      y:base.y+impact*5,roll:base.roll+impact*.002};
    // Earned clear keeps the last live view on the first departure frame.
    // The existing outro clock then opens the aperture with no status snap.
    if(outroMs!==null) {
      const settle=smooth(clamp(outroMs/1100,0,1));
      return {zoom:pose.zoom+(1-pose.zoom)*settle,x:pose.x*(1-settle),
        y:pose.y*(1-settle),roll:pose.roll*(1-settle)};
    }
    return pose;
  }
  function cameraViewport(camera) {
    // Conservative inverse bounds include every screen corner plus the
    // antialias fringe. All world culling reads the actual rendered camera.
    const cos=Math.cos(camera.roll),sin=Math.sin(camera.roll),points=[];
    for(const x of [-2,1922])for(const y of [-2,1082]) {
      const dx=x-960-camera.x,dy=y-CAMERA_PIVOT_Y-camera.y;
      points.push({x:960+(dx*cos+dy*sin)/camera.zoom,
        y:CAMERA_PIVOT_Y+(-dx*sin+dy*cos)/camera.zoom});
    }
    return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
      top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
  }
  function cameraPoint(camera,x,y) {
    const dx=(x-960)*camera.zoom,dy=(y-CAMERA_PIVOT_Y)*camera.zoom;
    const cos=Math.cos(camera.roll),sin=Math.sin(camera.roll);
    return {x:960+camera.x+dx*cos-dy*sin,y:CAMERA_PIVOT_Y+camera.y+dx*sin+dy*cos};
  }
  function cameraEdgeMarker(camera,{x,y,width=0,height=0}) {
    const corners=[[-width/2,0],[width/2,0],[-width/2,-height],[width/2,-height]]
      .map(([dx,dy])=>cameraPoint(camera,x+dx,y+dy));
    const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x));
    const top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y));
    if(left>=24&&right<=1896&&top>=184&&bottom<=1056)return null;
    const point=cameraPoint(camera,x,y-height*.5);
    const mx=left<24?58:right>1896?1862:clamp(point.x,58,1862);
    const my=top<184?214:bottom>1056?1026:clamp(point.y,214,1026);
    return {x:mx,y:my,angle:Math.atan2(top<184?-1:bottom>1056?1:0,left<24?-1:right>1896?1:0)};
  }
  function drawCameraWarnings(ctx,warnings,next,camera) {
    // Nearest cropped threat per lane only; no radar clutter from scenery,
    // non-collidable actors, distant vehicles or cars already passed.
    const nearest=new Map();
    for(const item of warnings) {
      const lane=clamp(Math.round(item.lane),0,3);
      if(!nearest.has(lane)||item.d<nearest.get(lane).d)nearest.set(lane,item);
    }
    const placed=[];
    for(const item of [...nearest.values()].sort((a,b)=>a.d-b.d)) {
      const m=item.marker;
      if(placed.some(p=>Math.abs(p.x-m.x)<55&&Math.abs(p.y-m.y)<55))continue;
      placed.push(m);ctx.save();ctx.translate(m.x,m.y);
      ctx.fillStyle='#071821eb';ctx.strokeStyle='#ff987f';ctx.lineWidth=2;
      polygon(ctx,[[-17,-22],[17,-22],[24,-15],[24,15],[17,22],[-17,22],[-24,15],[-24,-15]],'#071821eb');ctx.stroke();
      ctx.fillStyle='#ffb493';ctx.fillRect(-12,-7,24,14);ctx.fillStyle='#071821';ctx.fillRect(-8,-4,16,5);
      ctx.strokeStyle='#ffb493';ctx.lineWidth=3;ctx.beginPath();
      ctx.moveTo(-14,-11);ctx.lineTo(-14,11);ctx.moveTo(14,-11);ctx.lineTo(14,11);ctx.stroke();
      ctx.rotate(m.angle);ctx.fillStyle='#ffb493';ctx.beginPath();ctx.moveTo(37,0);ctx.lineTo(27,-7);ctx.lineTo(27,7);ctx.closePath();ctx.fill();
      ctx.restore();
    }
    if(next) {
      const marker=cameraEdgeMarker(camera,next);
      if(marker) {
        ctx.save();ctx.fillStyle='#071821ed';ctx.beginPath();ctx.arc(marker.x,marker.y,36,0,Math.PI*2);ctx.fill();
        B.CacheRoadGuidance?.drawButton?.(ctx,{index:next.action,x:marker.x,y:marker.y,size:49,active:next.strike});
        ctx.translate(marker.x,marker.y);ctx.rotate(marker.angle);ctx.strokeStyle=next.strike?'#fff0ab':'#a9f5d8';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(40,-7);ctx.lineTo(49,0);ctx.lineTo(40,7);ctx.stroke();ctx.restore();
      }
    }
  }
  function drawSpeedAtmosphere(ctx,s,{reduced=false,playing=true,intro=null}={}) {
    if(reduced||window.BARCODE_RENDER_QUALITY?.flashes===false||!playing||intro!==null)return;
    const rush=clamp((s.speed-30)/45,0,1),boost=s.boostMs>0?1:0;
    const intensity=.08+.5*rush+.27*boost,t=s.elapsedMs/1000;
    const paint=(frame,x,y,width,height,alpha,flip=false)=>{
      ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);
      B.PresentationAssets?.draw?.('cacheWindWhoosh',ctx,{frame,x:0,y:0,width,height,flip});ctx.restore();
    };
    // Fine lines stream down/out from the road's vanishing region. No static
    // corner flare, curling plume or full-screen color rim remains.
    ctx.save();ctx.beginPath();ctx.rect(0,164,1920,916);ctx.clip();
    for(const side of [-1,1]) {
      ctx.save();ctx.beginPath();ctx.rect(side<0?0:1580,164,340,916);ctx.clip();
      for(let i=0;i<3;i++) {
        const phase=(t*(1.05+.9*rush+.5*boost)+i/3+(side>0?.17:0))%1;
        const fade=Math.sin(phase*Math.PI);
        paint(i===2?5:(i+(side>0?1:0))%3,960+side*(610+phase*600),
          360+i*120+phase*490,200+phase*110,135+phase*80,.3*intensity*fade,side<0);
      }
      if(s.passFlashMs>0) {
        const age=1-clamp(s.passFlashMs/780,0,1);
        if(side===(s.passSide||1))paint(3,960+side*(710+age*350),610+age*350,
          310+age*90,205+age*50,.24*(1-age),side<0);
      }
      ctx.restore();
    }
    ctx.restore();
  }
  const road = B.CacheRoadProof = {
    active: false, status: null, state: null, chapter: null, returnTo: null, pending: false,
    updateCamera(dt) {
      advanceCamera(this.state,dt,{reduced:!!B.Preferences?.values?.reducedMotion});
    },
    configureEncounters(saved = null, refill = false) {
      const s=this.state;
      if(!s||!B.CacheRoadEncounters?.supportedVersion(chartVersion(this.chapter)))return false;
      s.encounters=saved?.encounters ? B.CacheRoadEncounters.restore(saved.encounters,this.chapter.difficultyId) :
        B.CacheRoadEncounters.create(this.chapter.difficultyId,chartVersion(this.chapter));
      s.maxIntegrity=B.CacheRoadEncounters.difficulty(this.chapter.difficultyId,s.encounters?.version).maxIntegrity;
      if(saved?.driveSection)s.driveSections=[clone(saved.driveSection)];
      if(!saved||refill)s.integrity=s.maxIntegrity;
      // The opening includes four intro bars before the first 24-bar act.
      // Its budget must also cover the nonfatal hits allowed by integrity.
      if(!saved||(refill&&s.musicBar===0))s.timeMs=60000;
      s.pursuit=this.chapter.encounterVersion===4?null:this.chapter.encounterVersion===3&&saved?.pursuit?
        B.CacheRoadPursuit.restore(saved.pursuit,{barFloat:s.musicBar,progress:s.progress}):
        B.CacheRoadPursuit?.create({barFloat:s.musicBar,version:this.chapter.encounterVersion===3?3:1});
      s.combat=this.chapter.encounterVersion===4 ? saved?.combat ?
        B.CacheRoadCombat?.restore?.(saved.combat,{bar:s.musicBar,progress:s.progress}) :
        B.CacheRoadCombat?.create?.({difficultyId:this.chapter.difficultyId}) : null;
      if(this.chapter.encounterVersion===4&&!s.combat)return false;
      s.adrenaline=s.combat&&B.CacheRoadAdrenaline ? saved?.adrenaline ?
        B.CacheRoadAdrenaline.restore(saved.adrenaline) : B.CacheRoadAdrenaline.create() : null;
      if(saved?.adrenaline&&!s.adrenaline)return false;
      if(s.adrenaline)s.lockEnergy=s.adrenaline.value;
      s.crosswalks=s.combat&&B.CacheRoadCrosswalks ? saved?.crosswalks ?
        B.CacheRoadCrosswalks.restore(saved.crosswalks,{bar:s.musicBar,progress:s.progress}) :
        B.CacheRoadCrosswalks.create({bar:s.musicBar,progress:s.progress}) : null;
      if(saved?.crosswalks&&!s.crosswalks)return false;
      if(this.chapter.encounterVersion>=3) {s.gateAt=null;s.gateOpen=!!(s.combat?s.combat.boss?.defeated:s.pursuit?.defeated);}
      for(const pulse of roadPulses(s)) {
        s.pulseTargets[pulse.id]=pulse.target;s.pulsePlaces[pulse.id]=pulse.at;
        if(pulse.target<=s.musicBar*4)s.caughtPulses[pulse.id]=true;
      }
      return true;
    },
    hazards() { return roadHazards(this.state); },
    pulses() { return roadPulses(this.state); },
    encounterSnapshot() {
      const s=this.state;
      return {cue:this.openingCue(),gate:{at:s.gateAt,open:s.gateOpen},hazards:roadHazards(s).map(h=>{
        const actor=actorPose(s,h);return {...h,...actor,kind:h.kind,reactionKind:actor.kind,
          distance:actor.at-s.progress,targetLane:h.mergeLane??h.lane};})
        .filter(h=>h.distance>=0&&h.distance<=440&&h.alpha>0),
        pulses:roadPulses(s).filter(p=>s.pulseTargets[p.id]!==undefined&&!s.caughtPulses[p.id]&&
          s.pulseTargets[p.id]>=s.musicBeatFloat-.3).map(p=>({...p,
          at:s.pulsePlaces[p.id],distance:s.pulsePlaces[p.id]-s.progress,target:s.pulseTargets[p.id]})),
        combat:s.combat?B.CacheRoadCombat.pose(s.combat,this.combatInput()):null,
        crosswalks:s.crosswalks?B.CacheRoadCrosswalks.pose(s.crosswalks,{progress:s.progress}):null,
        pursuit:s.pursuit?B.CacheRoadPursuit.pose(s.pursuit,{progress:s.progress}):null,
        boss:s.pursuit?.version===3?B.CacheRoadPursuit.boss(s.pursuit,{progress:s.progress}):null};
    },
    exiting: false, audioDegraded: false, oldHint: null, introMs: null,
    handoffMs:null,outroMs:null,cinematicLane:1,
    cinematicPose() {
      if(this.chapter?.encounterVersion!==4||!B.CacheRoadCinematics)return null;
      const kind=this.introMs!=null?'opening':this.outroMs!=null?'outro':this.handoffMs!=null?'handoff':null;
      if(!kind)return null;
      return B.CacheRoadCinematics.pose(kind,kind==='opening'?this.introMs:kind==='outro'?this.outroMs:this.handoffMs,
        {reducedMotion:!!B.Preferences?.values?.reducedMotion,baseLane:this.cinematicLane});
    },
    cinematicEngine(view) {
      if(!view)return;
      const leaving=view.kind==='outro';
      window.audioSystem?.updateRoadEngine?.({active:true,gear:this.state.gear,
        speed:leaving?52+20*view.timeMs/view.durationMs:52,boost:0,shifting:0,
        load:leaving?.65*(1-view.timeMs/view.durationMs):view.phase==='ram'?.9:.48,
        damage:0,pan:0,trackTimeSec:(this.state.musicBeatFloat||0)*60/128});
    },
    finishOutro() {
      if(!this.active||this.status!=='clear'||this.outroMs===null||
          window.isPaused||window.gameState?.paused)return false;
      this.outroMs=null;
      window.audioSystem?.stopRoadEngine?.();
      this.armResultControls();this.resumeEnding({fresh:true});return true;
    },
    finishIntro() {
      if (!this.active || this.presentationPreparing || this.status !== 'playing' || this.introMs === null ||
          window.isPaused || window.gameState?.paused) return false;
      const staged=this.chapter?.encounterVersion===4&&!!B.CacheRoadCinematics;
      this.introMs = null;this.handoffMs=staged?0:null;
      let started;
      try { started = window.audioSystem?.startRuntimeGameplayMusic?.(); }
      catch (_) { started = { ok: false }; }
      if (!started?.ok) {
        this.status = this.state.status = 'failed';
        this.state.message = 'CACHE MUSIC UNAVAILABLE';
        window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
        this.armResultControls();
        return false;
      }
      window.inputManager?.resetActionEdges?.();
      return true;
    },
    setHint() {
      const hint = document.querySelector?.('.hint');
      if (!hint) return;
      if (this.oldHint === null) this.oldHint = hint.textContent;
      // The complete control reference is available from Pause.
      const pause = B.GamepadUI?.connected ? B.ControllerSettings?.button(9) || 'MENU' : 'P';
      hint.textContent = `${pause} · CONTROLS`;
    },
    openingCue() {
      if (this.status !== 'playing' || !this.state) return null;
      const s = this.state, at = s.progress;
      if(s.encounters) {
        const bar=s.musicBeatFloat/4;
        if(s.combat) {
          if(s.combat.boss?.defeated)return ['PURSUIT DESTROYED','Deliver the original. Keep the four data parts synchronized.'];
          if(bar>=72)return ['BREAK THE RIG','Dodge the lock, attack its opening. Defend counters contact; Disrupt cancels tracking.'];
          if(bar<4) {
            const prompt=(action,key)=>B.ControllerSettings?.prompt?.(`road_${action}`,key)||key;
            return ['FOUR DATA PARTS / FOUR SKILLS',`Catch lane pads on ONE. ${prompt('attack','F')} Attack · ${prompt('turbo','SPACE')} Turbo · ${prompt('defend','G')} Defend · ${prompt('disrupt','V')} Disrupt.`];
          }
          if(bar<18)return ['CHASE CONTACT','Enemies are real targets. Attack nearby or fire ahead. Skills recharge even without sync.'];
          if(bar>=28&&bar<30)return ['CONVOY PRESSURE','Fight or dodge. Keeping all four parts boosts power and lowers tracking.'];
          if(bar>=52&&bar<55)return ['ESCORTS / DISRUPTORS','Break a lock, counter the attack. You can abandon a pad to escape.'];
          return null;
        }
        if(s.encounters.version===3) {
          if(s.pursuit?.defeated)return ['PURSUIT BROKEN','Keep driving. The delivery runway is open.'];
          if(bar>=72)return ['BREAK THE PURSUIT','Dodge the locked attack to overload its system. Push, Brace, Turbo and Echo counter too.'];
          if(bar>=14&&bar<18)return ['SCOUT ON YOUR TAIL','Wait for its lane lock, then change lanes. Echo draws its scanner away.'];
        }
        if(bar<4)return ['MINT PADS / BEAT ONE','Enter the marked lane. Press when the pad reaches the rear tires.'];
        if(bar>=28&&bar<30)return ['FREIGHT LINE','Draft the trucks. PUSH clears contact; BRACE absorbs a hit.'];
        if(bar>=56&&bar<59)return ['SCAN INCOMING / ECHO READY','Send Echo, then change lanes after the rival locks.'];
        if(s.encounters.version!==3&&bar>=90&&bar<92)return ['SET UP THE SPLIT','Hold a left lane steady. At the exit, send Echo and steer far right.'];
        if(bar>=76&&bar<78)return ['FINAL PURSUIT','Wait for the lock. Change lanes or send your Echo.'];
        return null;
      }
      if (at < 300) {
        if (!s.opening.held && s.musicBeatFloat < 10) return ['MINT ROAD PADS ARE SAFE',
          'Enter its lane. Press on ONE as the pad meets the line under your rear tires.'];
        if (!s.opening.sealed && s.musicBeatFloat < 20) return ['FOLLOW THE NEXT ROAD PAD',
          'Up/Down queue a gear for the next beat 1. Gear 3 earns more; Gear 1 refills Echo.'];
        return ['TRAFFIC IS SOLID; MINT PADS ARE SAFE', 'Pads are painted into the road. Give vehicles room when changing lanes.'];
      }
      if (at >= 380 && at < 650) {
        if (!s.opening.turbo && s.boost > 0) return ['TWO LANES BLOCKED AHEAD',
          `Outside lanes are open. ${B.GamepadUI?.connected ? B.ControllerSettings?.button(4) : 'SPACE'} queues Turbo for the next beat 1.`];
        return ['TWO LANES BLOCKED AHEAD', 'Take an outside lane through the gap.'];
      }
      if (at >= 850 && at < 1135) {
        if (at < 975) {
          if (s.echo) return ['ECHO SENT — SCAN AHEAD',
            'Hold far left through the block. Move away from the Echo after it.'];
          if (s.echoEnergy >= 100) return ['SCAN AHEAD — SEND AN ECHO',
            `Hold far left at the block. Press ${B.GamepadUI?.connected ? B.ControllerSettings?.button(5) : 'H'} near it, then move away.`];
          return ['SCAN AHEAD', 'Hold far left through the block. Dodge the audit car.'];
        }
        return s.opening.auditFollowedEcho ? ['THE SCAN FOLLOWED YOUR ECHO',
          'Steer away from its lane to keep the original recording safe.'] :
          ['THE SCAN LOCKED ON', 'Change lanes before the audit car reaches you.'];
      }
      return null;
    },
    selectMusicProfile() {
      const selected = B.MusicProfiles?.select(PROFILE);
      const loaded = selected && B.MusicTransport?.load(PROFILE);
      return { ok: selected?.profileId === PROFILE && loaded?.status === 'ok' };
    },
    checkAudioAssets() {
      const tracks = window.audioSystem?.musicTracks || {};
      this.audioDegraded = B.MusicProfiles.get(PROFILE).arrangement.sources.some(source =>
        !tracks[source.sourceId]?.buffer || tracks[source.sourceId].isFallback ||
        Math.abs(tracks[source.sourceId].buffer.duration - 187.5) > 0.08);
      return !this.audioDegraded;
    },
    validate(saved) {
      const s = saved?.levelState, p = s?.proof;
      const legacy = s?.proofVersion < 3;
      return saved?.levelId === ID && [1, 2, 3, 4].includes(s?.proofVersion) &&
        Object.hasOwn(CHECKPOINTS, saved.checkpointId) &&
        validEncounterProof(p,s.chapter) &&
        (legacy || s?.proofVersion === 4 || !['road-cache', 'road-fork'].includes(saved.checkpointId)) &&
        s.returnTo?.checkpointId === 'intermission' &&
        B.Campaign.validateLevel01Checkpoint(s.returnTo) &&
        Number.isFinite(p?.progress) && p.progress >= 0 && p.progress <= (legacy ? LAP : 15000) &&
        (legacy ? Math.abs(p.progress - legacyPoint[saved.checkpointId]) <= 1 :
          Number.isInteger(p.musicBar) && p.musicBar >= 0 && p.musicBar <= 100 &&
          (saved.checkpointId === 'road-start' ? p.progress === 0 :
            saved.checkpointId === 'road-cache' ? p.progress >= 850 && p.progress < 860 :
            saved.checkpointId === 'road-fork' ? p.progress >= 1700 && p.progress < 1710 :
            saved.checkpointId === 'road-clear' ? p.musicBar >= 99 :
              ['road-gate', 'road-verse-2', 'road-verse-3', 'road-verse-4'].includes(saved.checkpointId))) &&
        Number.isInteger(p.lane) && p.lane >= 0 && p.lane < 4 &&
        Number.isInteger(p.integrity) && p.integrity >= 1 && p.integrity <= ([1,2,3,4].includes(s.chapter?.encounterVersion)&&s.chapter?.difficultyId==='relaxed'?4:3) &&
        (s.proofVersion === 1 ||
          Number.isFinite(p.lanePos) && p.lanePos >= 0 && p.lanePos <= 3 &&
          Number.isFinite(p.speed) && p.speed >= 10 && p.speed <= 78 &&
          Number.isFinite(p.timeMs) && p.timeMs > 0 && p.timeMs <= 60000 &&
          Number.isFinite(p.lockEnergy) && p.lockEnergy >= 0 && p.lockEnergy <= 100 &&
          Number.isFinite(p.echoEnergy) && p.echoEnergy >= 0 && p.echoEnergy <= 100) &&
        (s.proofVersion === 4 ?
          Number.isInteger(p.score) && p.score >= 0 &&
          Number.isInteger(p.peakStack) && p.peakStack >= 1 && p.peakStack <= 4 &&
          Number.isInteger(p.cleanBars) && p.cleanBars >= 0 && p.cleanBars <= 100 :
          Array.isArray(p.locked) && p.locked.length <= (s.proofVersion === 1 ? 2 : 3) &&
          new Set(p.locked).size === p.locked.length &&
          p.locked.every(lane => Number.isInteger(lane) && lane >= 0 && lane < 4));
    },
    async enter() {
      if (this.active || this.pending || B.RunAndGunProof?.active || B.RunAndGunProof?.pending ||
          !B.Campaign?.intermission) return { ok: false, reason: 'handoff-unavailable' };
      const returnTo = B.Campaign.readResume();
      if (returnTo?.levelId !== 'level-01' || returnTo.checkpointId !== 'intermission' ||
          !B.Campaign.archive().record.progress.completedLevels.includes('level-01'))
        return { ok: false, reason: 'level-01-clear-required' };
      const previous = returnTo.levelState.cacheRoadCheckpoint;
      delete returnTo.levelState.cacheRoadCheckpoint; // keep the return save shallow on repeat visits
      const candidate = previous && { levelId: ID, checkpointId: previous.checkpointId,
        levelState: { proofVersion: previous.proofVersion || 1, returnTo, proof: previous.proof,
          ...(previous.chapter ? { chapter: previous.chapter } : {}) } };
      const resume = this.validate(candidate) ? candidate : null;
      this.pending = true;
      const entryGeneration=this.entryGeneration=(this.entryGeneration||0)+1;
      B.Campaign.roadAudioNotice = null;
      let audioFailure = null;
      try {
        window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
        if (!this.selectMusicProfile().ok) throw new Error('road-profile-unavailable');
        const prepared = await window.audioSystem?.prepareActiveMusicProfile?.();
        if(entryGeneration!==this.entryGeneration)return {ok:false,reason:'handoff-cancelled'};
        if (!prepared?.ok) { audioFailure = prepared; throw new Error('road-audio-unavailable'); }
        if (!this.checkAudioAssets()) throw new Error('road-audio-invalid');
        this.returnTo = returnTo;
        this.state = resume ? stateFromCheckpoint(resume) : newState();
        this.chapter = resume ? B.CacheChapter?.normalize(resume.levelState.chapter) || null :
          B.CacheChapter?.create({ difficultyId: returnTo.levelState.difficultyId }) || null;
        this.configureEncounters(resume?.levelState?.proof);
        this.status = this.state.status; this.active = true;
        this.introMs = !resume && this.status === 'playing' ? 0 : null;
        this.handoffMs=null;this.outroMs=null;this.cinematicLane=this.state.lanePos;
        await this.preparePresentation();
        if(entryGeneration!==this.entryGeneration)return {ok:false,reason:'handoff-cancelled'};
        this.setHint();
        B.Campaign.intermission = false; B.Campaign.run = null;
        window.gameState.victory = false; window.gameState.gameOver = false;
        window.gameState.running = true;
        if (this.status === 'playing' && this.introMs === null) {
          const started = window.audioSystem?.startRuntimeGameplayMusic?.();
          if (!started?.ok) throw new Error('road-audio-start-failed');
        }
        this.checkpoint(resume?.checkpointId || 'road-start');
        this.armResultControls();
        this.resumeEnding();
        return { ok: true };
      } catch (error) {
        if(entryGeneration!==this.entryGeneration)return {ok:false,reason:'handoff-cancelled'};
        console.error('[cache-road] Entry failed:', error?.message || error, audioFailure || '');
        this.dispose();
        if (previous) returnTo.levelState.cacheRoadCheckpoint = previous;
        B.Campaign.archive().checkpoint(returnTo);
        await B.RuntimeLifecycle?.restart?.({ source: 'road-entry-recovery', resume: returnTo });
        if (audioFailure || ['road-audio-invalid', 'road-audio-start-failed'].includes(error?.message)) {
          const names = audioFailure?.failures?.map(item => item.sourceId.replace('cache-', '').toUpperCase()).join(', ');
          B.Campaign.roadAudioNotice = `CACHE MUSIC UNAVAILABLE${names ? ` (${names})` : ''} — CHECK CONNECTION, THEN RETRY`;
        }
        return { ok: false, reason: error.message };
      } finally { if(entryGeneration===this.entryGeneration)this.pending = false; }
    },
    restore(saved) {
      if (!this.validate(saved)) return false;
      this.returnTo = clone(saved.levelState.returnTo);
      this.state = stateFromCheckpoint(saved);
      this.chapter = B.CacheChapter?.normalize(saved.levelState.chapter) || null;
      this.configureEncounters(saved.levelState.proof);
      this.status = this.state.status; this.active = true; this.exiting = false;
      this.introMs = null;this.handoffMs=null;this.outroMs=null;this.cinematicLane=this.state.lanePos;
      if (this.status === 'clear') {
        window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
        window.audioSystem?.stopRoadEngine?.();
      }
      this.setHint();
      this.checkAudioAssets();
      window.gameState.victory = false; window.gameState.gameOver = false;
      window.gameState.running = true;
      this.armResultControls();
      this.resumeEnding();
      return true;
    },
    makeCheckpoint(id) {
      if (!this.active || !this.returnTo || !Object.hasOwn(CHECKPOINTS, id)) return false;
      const s = this.state;
      const checkpointProgress=id==='road-start'?0:s.encounters?
        (roadAtBeat(s,s.musicBar*4)??s.progress):id==='road-cache'?850:
        id==='road-fork'?1700:s.progress;
      return { levelId: ID, checkpointId: id,
        levelState: { proofVersion: 4, returnTo: clone(this.returnTo), proof: {
          progress:checkpointProgress, lane: s.lane, lanePos: s.lanePos,
          musicBar: id === 'road-start' ? 0 : s.musicBar, gateAt: s.gateAt,
          gateOpen: s.gateOpen,
          speed: s.speed, gear: s.gear, timeMs: Math.ceil(s.timeMs),
          lockEnergy: Math.round(s.lockEnergy), echoEnergy: Math.round(s.echoEnergy),
          boost: s.boost, score: s.score, peakStack: s.peakStack,
          cleanBars: s.cleanBars, integrity: Math.max(1, s.integrity),
          ...(s.combat ? {combat:B.CacheRoadCombat.snapshot(s.combat,{progress:checkpointProgress})} : {}),
          ...(s.adrenaline ? {adrenaline:B.CacheRoadAdrenaline.snapshot(s.adrenaline)} : {}),
          ...(s.crosswalks ? {crosswalks:B.CacheRoadCrosswalks.snapshot(s.crosswalks,{progress:checkpointProgress})} : {}),
          ...(s.pursuit?.version===3 ? {pursuit:B.CacheRoadPursuit.snapshot(s.pursuit)} : {}),
          ...(s.encounters ? {encounters:B.CacheRoadEncounters.snapshot(s.encounters),
            ...(s.driveSections.find(part=>part.beat===s.musicBar*4)?{driveSection:
              clone(s.driveSections.find(part=>part.beat===s.musicBar*4))}:{})} : {}) },
          ...(this.chapter ? { chapter: clone(this.chapter) } : {}) } };
    },
    checkpoint(id) {
      const checkpoint = this.makeCheckpoint(id);
      if (!checkpoint) return false;
      const saved = B.Campaign.archive().checkpoint(checkpoint);
      B.Campaign.syncTitleButton();
      return saved;
    },
    checkpointChapter() {
      if (!this.chapter || this.chapter.delivery) return false;
      const saved = B.Campaign.readResume();
      if (saved?.levelId !== ID || !this.validate(saved)) return false;
      saved.levelState.chapter = clone(this.chapter);
      return B.Campaign.archive().checkpoint(saved);
    },
    armResultControls() {
      this.resultControlsReady = !window.inputManager?.isResultControlHeld?.();
      window.inputManager?.resetActionEdges?.();
    },
    resumeEnding({ fresh = false } = {}) {
      if(this.outroMs!=null)return false;
      const ending = this.chapter?.delivery?.ending;
      if (this.active && this.status === 'clear' && ending && !ending.done && !B.CacheEnding?.active)
        return B.CacheEnding?.start(fresh ? undefined : ending) || false;
      return false;
    },
    async exit() {
      if (!this.active || this.exiting) return false;
      this.exiting = true;
      window.audioSystem?.stopRoadEngine?.();
      this.checkpointChapter();
      const returnTo = clone(this.returnTo);
      const saved = B.Campaign.readResume();
      if (saved?.levelId === ID && this.validate(saved)) returnTo.levelState.cacheRoadCheckpoint = {
        checkpointId: saved.checkpointId, proofVersion: saved.levelState.proofVersion,
        proof: clone(saved.levelState.proof),
        ...(saved.levelState.chapter ? { chapter: clone(saved.levelState.chapter) } : {}) };
      B.Campaign.archive().checkpoint(returnTo);
      B.Campaign.syncTitleButton();
      const result = await B.RuntimeLifecycle?.restart?.({ source: 'road-exit', resume: returnTo });
      if (!result?.ok) this.exiting = false;
      return !!result?.ok;
    },
    dispose() {
      this.cancelPresentation?.();this.cancelPresentation=null;
      this.entryGeneration=(this.entryGeneration||0)+1;this.pending=false;
      this.presentationGeneration=(this.presentationGeneration||0)+1;
      this.presentationPreparing=false;this.gpuLevelSources=null;this.presentationResult=null;
      B.CacheRoadGPU?.releaseLevel?.();
      if(this.active)B.PresentationAssets?.releaseScene?.();
      window.audioSystem?.stopRoadEngine?.();
      const hint = document.querySelector?.('.hint');
      if (hint && this.oldHint !== null) hint.textContent = this.oldHint;
      this.oldHint = null;
      B.CacheEnding?.dispose?.();
      this.active = false; this.status = null; this.state = null; this.chapter = null;
      this.returnTo = null; this.exiting = false; this.audioDegraded = false; this.introMs = null;
      this.handoffMs=null;this.outroMs=null;
    },
    retry() {
      if (!this.active || this.status === 'playing') return false;
      const saved = B.Campaign.readResume();
      const fromCheckpoint = this.status === 'clear' ? null : saved?.levelId === ID ?
        migrateProof(saved.levelState.proof, saved.levelState.proofVersion) : null;
      B.CacheEnding?.dispose?.();
      if (fromCheckpoint && !this.chapter && fromCheckpoint.progress === 0 &&
          (fromCheckpoint.musicBar || 0) === 0) {
        this.chapter = B.CacheChapter?.create({
          difficultyId: this.returnTo?.levelState?.difficultyId }) || null;
      } else if (fromCheckpoint) {
        // Failed attempts contribute to this run even though the road returns
        // to its marker. Missing old metadata never gains a retroactive award.
        if (this.chapter && !this.chapter.delivery) this.chapter.retries++;
      } else this.chapter = B.CacheChapter?.create({
        difficultyId: this.returnTo?.levelState?.difficultyId }) || null;
      this.state = newState(fromCheckpoint ? { ...fromCheckpoint, integrity: 3,
        timeMs: Math.max(fromCheckpoint.timeMs || 0, 30000), echoEnergy: Math.max(fromCheckpoint.echoEnergy || 0, 100) } : {});
      this.configureEncounters(fromCheckpoint, true);
      this.status = 'playing';
      this.introMs = null;this.handoffMs=null;this.outroMs=null;this.cinematicLane=this.state.lanePos;
      // A retry deliberately resumes at the saved bar. Steering never seeks.
      window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
      this.selectMusicProfile();
      this.checkpoint(this.status === 'playing' && fromCheckpoint ? saved.checkpointId : 'road-start');
      window.inputManager?.resetActionEdges?.();
      const retryState=this.state,generation=this.entryGeneration;
      const startMusic=()=>{
        if(!this.active||this.state!==retryState||generation!==this.entryGeneration||this.exiting||
            window.isPaused||window.gameState?.paused)return;
        window.audioSystem?.startRuntimeGameplayMusic?.();
        window.inputManager?.resetActionEdges?.();
      };
      if(window.renderer?.ctx&&B.CacheRoadGPU?.warmup)
        this.preparePresentation().then(startMusic,startMusic);
      else startMusic();
      return true;
    },
    resultButtons() {
      if (!this.active || this.status === 'playing') return [];
      const authored = !!this.chapter?.delivery;
      const prompt = (key,index) => B.GamepadUI?.connected ? B.ControllerSettings?.button(index) || key : key;
      const buttons = authored ? [
        { id: 'ending', label: this.chapter.delivery.ending.done ? 'REPLAY ENDING' : 'RESUME ENDING', key: prompt('ENTER',0) },
        { id: 'race', label: 'REPLAY RACE', key: prompt('R',2) },
        { id: 'title', label: 'TITLE', key: prompt('C',3) }
      ] : [
        { id: 'race', label: this.status === 'clear' ? 'REPLAY RACE' : 'RETRY FROM MARKER', key: prompt('ENTER',0) },
        { id: 'back', label: 'LEVEL 1 RESULTS', key: prompt('C',3) }
      ];
      return buttons.map((button,index)=>({ ...button, x: authored ? 435 + index * 355 : 565 + index * 430,
        y: 572, w: authored ? 340 : 360, h: 72 }));
    },
    resultAction(action) {
      if (!this.active || this.status === 'playing' || this.resultControlsReady === false ||
          window.isPaused || window.gameState?.paused || B.CacheEnding?.active) return false;
      if (action === 'race') return this.retry();
      if (action === 'back') return this.exit();
      if (!this.chapter?.delivery) return false;
      if (action === 'save') return B.CacheChapter?.persist(this) || false;
      if (action === 'ending') {
        const ending = this.chapter.delivery.ending;
        return B.CacheEnding?.start(ending.done ? undefined : ending) || false;
      }
      if (action === 'title') {
        B.CacheChapter?.persist(this);
        return B.RuntimeLifecycle?.returnToTitle?.({ source: 'cache-delivery-result' }) || false;
      }
      return false;
    },
    resultGamepad(input) {
      if (!this.active || this.status === 'playing') return false;
      const p = input?.pressed || {};
      if (p.b9) { B.RuntimeLifecycle?.togglePause?.(); return true; }
      if (this.resultControlsReady === false) {
        // Input polling owns release-to-arm even when no world update runs
        // between polls (paused/result transitions or a suppressed RAF).
        // Consume the release poll itself; only a later fresh edge can act.
        if (!window.inputManager?.isResultControlHeld?.() &&
            !['b0','b1','b2','b3'].some(key=>input?.held?.[key])) this.resultControlsReady = true;
        return true;
      }
      if(this.outroMs!=null) {
        if(p.b0)this.finishOutro();
        return true;
      }
      if (p.b0) this.resultAction(this.chapter?.delivery ? 'ending' : 'race');
      else if (p.b2 && this.chapter?.delivery) this.resultAction('race');
      else if (p.b3) this.resultAction(this.chapter?.delivery ? 'title' : 'back');
      else if (p.b1 && this.chapter?.delivery) this.resultAction('save');
      return true;
    },
    pointerClick(x,y) {
      if(this.outroMs!=null)return x>=1510&&y>=1000?this.finishOutro():false;
      const button = this.resultButtons().find(b=>x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h);
      if (button) { this.resultAction(button.id); return true; }
      if (this.chapter?.delivery && x>=715 && x<=1205 && y>=682 && y<=723) {
        this.resultAction('save'); return true;
      }
      return false;
    },
    keyDown(e) {
      if(this.presentationPreparing) {e.preventDefault?.();return true;}
      if(this.outroMs!=null) {
        const key=e.key.toLowerCase();
        if(key==='p') {e.preventDefault?.();if(!e.repeat)B.RuntimeLifecycle?.togglePause?.();return true;}
        if(key==='enter'||key===' ') {
          e.preventDefault?.();if(!e.repeat&&this.resultControlsReady!==false)this.finishOutro();return true;
        }
        return false;
      }
      if (this.introMs !== null) {
        if (e.key.toLowerCase() === 'p') {
          e.preventDefault?.();
          if (!e.repeat) B.RuntimeLifecycle?.togglePause?.();
          return true;
        }
        if (['enter', ' '].includes(e.key.toLowerCase())) {
          e.preventDefault?.();
          if (!e.repeat) this.finishIntro();
          return true;
        }
        return false;
      }
      if (this.status === 'playing') return false;
      const key = e.key.toLowerCase();
      if (key === 'p') {
        e.preventDefault?.();
        if (!e.repeat) B.RuntimeLifecycle?.togglePause?.();
        return true;
      }
      const authored = !!this.chapter?.delivery;
      if (!(authored ? ['enter', ' ', 'r', 'c', 's'] : ['enter', ' ', 'c']).includes(key)) return false;
      e.preventDefault?.();
      if (!e.repeat) this.resultAction(key === 'c' ? authored ? 'title' : 'back' :
        key === 's' ? 'save' : key === 'r' ? 'race' : authored ? 'ending' : 'race');
      return true;
    },
    mixSnapshot() {
      if (!this.active || !this.state) return null;
      return { captures: this.state.captures.map(({ lane, startBeat, endBeat }) =>
        ({ lane, startBeat, endBeat })),
        // The aligned crew-vocal source is still needed before this can sound.
        bonusVocal: this.state.fullAdrenaline,
        reactivityVersion: this.chapter?.encounterVersion >= 2 ? 2 : 1,
        hitRecovery: this.state.hitRecovery };
    },
    startOffsetSec() { return (this.state?.musicBar || 0) * 1.875; },
    cue(kind, options = {}) {
      const s=this.state;
      if(!s)return false;
      return window.audioSystem?.playCombatCue?.(kind,{
        road:true,trackTimeSec:(s.musicBeatFloat||0)*60/128,
        gear:s.gear,pan:0,intensity:1,...options
      });
    },
    updateEngineSound() {
      const s=this.state;
      if(!s||!this.active||this.status!=='playing'||this.exiting) {
        window.audioSystem?.stopRoadEngine?.();return;
      }
      const age=s.musicBeatFloat-s.shiftStartBeat;
      window.audioSystem?.updateRoadEngine?.({active:true,gear:s.gear,speed:s.speed,
        boost:s.boostMs>0?1:s.surgeMs>0?.6:0,
        shifting:age>.32&&age<1.3?Math.sin((age-.32)/.98*Math.PI):0,
        load:clamp(.38+s.speed/150+(s.throttling?.12:0)-(s.draftMs>0?.13:0),0,1),
        damage:1-s.integrity/(s.maxIntegrity||3),pan:clamp(s.steer*.12,-.12,.12),
        trackTimeSec:s.musicBeatFloat*60/128});
    },
    updateCaptures(music) {
      if (!music?.running || music.profileId !== PROFILE || !music.grid) return;
      const s = this.state, { beatIndex, barIndex } = music.grid;
      const reactive = this.chapter?.encounterVersion >= 2;
      const before = reactive ? new Set(s.mixActiveLanes || s.captures.map(c => c.lane)) : null;
      s.musicBeatFloat = music.grid.beatFloat;
      // Score a finished bar before retiring a part at its last beat.
      for (let completed = s.scoredThrough + 1; completed < barIndex && completed < 100; completed++) {
        if (completed !== s.damagedBar) {
          const parts = new Set(s.captures.filter(c => c.startBeat < (completed + 1) * BAR_BEATS &&
            c.endBeat > completed * BAR_BEATS).map(c => c.lane));
          s.score += 100 * Math.max(1, parts.size); s.cleanBars++;
        }
      }
      s.scoredThrough = Math.max(s.scoredThrough, barIndex - 1);
      s.captures = s.captures.filter(c => c.endBeat > beatIndex && laneAvailable(c.lane, barIndex));
      for (const queued of s.queuedCaptures.filter(c => c.startBeat <= beatIndex)) {
        if (queued.endBeat <= beatIndex || !laneAvailable(queued.lane, barIndex)) continue;
        const prior = s.captures.find(c => c.lane === queued.lane);
        if (prior) s.captures.splice(s.captures.indexOf(prior), 1);
        s.captures.push(queued);
        s.hitRecovery = false;
      }
      s.queuedCaptures = s.queuedCaptures.filter(c => c.startBeat > beatIndex);
      if (reactive) {
        const live = new Set(s.captures.map(c => c.lane));
        const changes = [...before].filter(lane => !live.has(lane))
          .map(lane => ({ kind: 'lost', lane }));
        changes.push(...[...live].filter(lane => !before.has(lane))
          .map(lane => ({ kind: 'join', lane })));
        s.mixChanges = (s.mixChanges || 0) + changes.length;
        // An earned early tap is only announced once its downbeat has
        // arrived. Expiry and collision loss use this same live-part state.
        const extension = s.pendingMixExtension;
        if (extension && extension.beat <= beatIndex) {
          if (live.has(extension.lane) && !changes.some(change => change.lane === extension.lane))
            changes.push({ kind: 'extend', lane: extension.lane });
          s.pendingMixExtension = null;
        }
        const change = changes.at(-1);
        if (change) {
          const capture = s.captures.find(item => item.lane === change.lane);
          s.mixFeedback = { ...change, atMs: s.elapsedMs, expiresMs: s.elapsedMs + 1300,
            label: LANES[change.lane], endBeat: capture?.endBeat ?? beatIndex,
            holdBars: capture ? Math.max(0, Math.ceil((capture.endBeat - beatIndex) / BAR_BEATS)) : 0 };
        }
        s.mixActiveLanes = [...live];
      }
      s.peakStack = Math.max(s.peakStack, stackSize(s));
      const full = s.captures.length === 4;
      if (full && !s.fullAdrenaline) {
        s.fullAdrenalineCount++;
        s.message = s.combat?'FULL SYNCHRONIZATION':'FULL ADRENALINE'; s.messageMs = 1300;
        this.cue('roadFull');
      }
      s.fullAdrenaline = full;
    },
    updateStreetMotion(dt) {
      if(B.Preferences?.values?.reducedMotion)return;
      const s=this.state;
      for(const {scene,item} of MOBILE_STREET_ITEMS) {
        const position=pedestrianPosition(scene,item,s);
        const d=position.at-s.progress;
        if(d>650||d< -440)continue;
        const speed=item.id>=15?8:item.id===11?76:item.id===5?43:34;
        const key=personKey(scene,item);
        s.streetMotion[key]=(s.streetMotion[key]||0)+speed*dt/1000;
      }
    },
    requestGear(direction) {
      const s=this.state;
      const previous=s.pendingGear??s.gear;
      const gear=clamp(previous+direction,0,2);
      if(gear!==previous)this.cue('roadQueued',{intensity:.35});
      s.pendingGear=gear===s.gear?null:gear;
      s.pendingGearBeat=this.nextShiftBeat();
    },
    nextShiftBeat() {
      const audio=window.audioSystem;
      const music=B.MusicTransport?.sample?.(audio?.getOutputAudioTime?.()??audio?.context?.currentTime??0);
      const beat=music?.running&&music.profileId===PROFILE?music.grid.beatFloat:this.state.musicBeatFloat;
      return (Math.floor(beat/4)+1)*4;
    },
    updateDrive(music) {
      if(!music?.running||music.profileId!==PROFILE||!music.grid)return;
      const s=this.state,{beatFloat,beatDurationSec}=music.grid;
      const sections=s.driveSections;
      // Restore starts at the saved bar's road address. A non-boundary first
      // sample does not create a shortened count-in or a sudden distance jump.
      if(!sections.length) {
        const beat=Math.floor(beatFloat/4)*4;
        const first={beat,beatSec:beatDurationSec,from:s.progress,
          v0:GEAR_SPEEDS[s.gear],speed:GEAR_SPEEDS[s.gear],gear:s.gear};
        first.from-=drivePosition(first,beatFloat)-first.from;
        sections.push(first);
        if(s.encounters||beatFloat-beat<.5)this.placePulse(first,beatFloat-beat<.5);
      }
      while(sections.at(-1).beat+4<=beatFloat+1e-8) {
        const prior=sections.at(-1),beat=prior.beat+4;
        this.resolvePulseAwards(beat);
        const from=drivePosition(prior,beat),oldGear=s.gear;
        const recovery=s.queuedRecovery&&s.recoveryBeat<=beat;
        if(recovery) {
          s.gear=0;s.pendingGear=null;
          if(s.queuedTurbo)s.boost=1;
          s.queuedTurbo=false;s.queuedSurge=false;
        }
        else if(s.pendingGear!==null&&s.pendingGearBeat<=beat) {
          s.gear=s.pendingGear;s.pendingGear=null;
        }
        const turbo=s.queuedTurbo&&s.turboBeat<=beat;
        const surge=s.queuedSurge&&s.surgeBeat<=beat;
        const speed=turbo?75:recovery?30:surge?Math.max(68,GEAR_SPEEDS[s.gear]):GEAR_SPEEDS[s.gear];
        if(s.gear!==oldGear||turbo||surge||recovery) {
          s.shiftFrom=oldGear;s.shiftStartBeat=beat;
          s.message=turbo?'TURBO // LAUNCH':recovery?'RECOVER // NEXT BAR':
            `GEAR ${s.gear+1} // ${surge?(s.combat?'SYNC BURST':'SURGE'):'ENGAGED'}`;
          s.messageMs=700;
          this.cue(turbo?'roadTurbo':'lift',
            {audioTimeSec:music.audioTimeSec+Math.max(0,(beat-beatFloat)*beatDurationSec),
              trackTimeSec:beat*beatDurationSec,gear:s.gear,intensity:recovery?.6:1});
        }
        s.boostMs=turbo?Math.max(0,(beat+4-beatFloat)*beatDurationSec*1000):0;
        s.surgeMs=surge?Math.max(0,(beat+4-beatFloat)*beatDurationSec*1000):0;
        if(turbo)s.queuedTurbo=false;
        if(surge)s.queuedSurge=false;
        if(recovery)s.queuedRecovery=false;
        const section={beat,beatSec:beatDurationSec,from,v0:prior.speed,speed,gear:s.gear,turbo,surge};
        sections.push(section);
        if(s.encounters||beatFloat-beat<.5)this.placePulse(section,beatFloat-beat<.5);
      }
      const section=sections.at(-1);
      s.progress=Math.min(15000,drivePosition(section,beatFloat));
      s.speed=section.v0+(section.speed-section.v0)*smooth((beatFloat-section.beat)/SHIFT_BLEND_BEATS);
      s.boostMs=section.turbo?Math.max(0,(section.beat+4-beatFloat)*beatDurationSec*1000):0;
      s.surgeMs=section.surge?Math.max(0,(section.beat+4-beatFloat)*beatDurationSec*1000):0;
      s.driveBeat=beatFloat;
      // Enough history for captured bars and paint which has passed the car.
      while(sections.length>10)sections.shift();
    },
    placePulse(section, allowPulse = true) {
      const s=this.state,target=section.beat+4;
      if(s.crosswalks)B.CacheRoadCrosswalks.commit(s.crosswalks,section);
      if(s.encounters) {
        const {pulse}=B.CacheRoadEncounters.commit(s.encounters,section,STRIKE_DISTANCE,{allowPulse,protectedActors:
          s.pursuit?.actor&&!s.pursuit.actor.crossed?[s.pursuit.actor]:[]});
        if(pulse) {s.pulseTargets[pulse.id]=pulse.target;s.pulsePlaces[pulse.id]=pulse.at;}
        return;
      }
      if(target>=400)return;
      const at=drivePosition(section,target)+STRIKE_DISTANCE;
      // Authored addresses choose the encounter order. On entry to a road
      // section, place its action on the NEXT measure's first-beat contact.
      // The new gear starts at this exact endpoint, so it cannot move the
      // target even when an input lands immediately before the downbeat.
      // This address is immutable, just like every lane stud and obstacle.
      const pulse=roadPulses(s).find(p=>s.pulseTargets[p.id]===undefined&&
        p.at>=section.from-80&&p.at<=drivePosition(section,section.beat+4)+STRIKE_DISTANCE);
      if(!pulse)return;
      s.pulseTargets[pulse.id]=target;s.pulsePlaces[pulse.id]=at;
    },
    updatePulses(music) {
      if(!music?.running||music.profileId!==PROFILE||!music.grid)return;
      const s=this.state;
      this.resolvePulseAwards(music.grid.beatFloat);
      // Expire against the heard clock, just like the visible target. This is
      // a receipt, not a second damage penalty or a saved musical capture.
      for(const pulse of roadPulses(s)) {
        const target=s.pulseTargets[pulse.id];
        if(target===undefined||s.caughtPulses[pulse.id]||s.missedPulses[pulse.id]||
          (music.grid.beatFloat-target)*music.grid.beatDurationSec<=pulseWindowSec(s)+1e-8)continue;
        s.missedPulses[pulse.id]=true;
        this.recordAdrenaline(B.CacheRoadAdrenaline?.resolve?.(s.adrenaline,
          {id:pulse.id,result:'miss',atMs:s.elapsedMs}));
        if(music.grid.beatFloat-target<1&&
          !(s.driveFeedback&&s.elapsedMs<s.driveFeedback.expiresMs))
          this.pulseFeedback('miss',pulse);
      }
      // Audio is queued against source/render time, while the road follows
      // what is reaching the output device. Delaying this lookahead by the
      // device latency would make its predictable count-in sounds late.
      const schedule=B.MusicTransport.sample(window.audioSystem?.context?.currentTime||0);
      if(!schedule.running||!schedule.grid)return;
      const {beatFloat,beatDurationSec}=schedule.grid;
      const next=roadPulses(s).find(p=>!s.caughtPulses[p.id]&&
        s.pulseTargets[p.id]>=beatFloat-(pulseWindowSec(s)+1e-8)/beatDurationSec);
      if(!next)return;
      const target=s.pulseTargets[next.id];
      const countBeat=Math.ceil(beatFloat-.025/beatDurationSec);
      const ahead=(countBeat-beatFloat)*beatDurationSec;
      const cueKey=`${next.id}/${countBeat}`;
      if(countBeat>=target-3&&countBeat<=target&&ahead<=.13&&
          cueKey!==s.lastPulseCue) {
        s.lastPulseCue=cueKey;
        this.cue(countBeat===target?'roadReady':'roadCount',
          {audioTimeSec:schedule.audioTimeSec+Math.max(0,ahead),
            countBeat:countBeat%4+1,action:next.action,
            trackTimeSec:target*beatDurationSec,pan:(next.lane-1.5)*.14});
      }
    },
    resolvePulseAwards(beatFloat) {
      const s=this.state;
      const ready=s.pendingPulseAwards.filter(hit=>hit.beat<=beatFloat+.001);
      s.pendingPulseAwards=s.pendingPulseAwards.filter(hit=>hit.beat>beatFloat+.001);
      for(const hit of ready)this.awardPulse(hit.pulse,hit.judgment,hit.speed);
    },
    // Input, projected arrival and countdown all name the same fixed beat.
    // An early accepted press waits for that beat before the visible reward.
    pulseFeedback(kind,pulse) {
      const s=this.state;
      // Held inputs are edge-filtered upstream; rapid taps cannot flicker the
      // explanation every frame. Successful catches may always replace it.
      if(s.driveFeedback?.kind===kind&&s.driveFeedback.action===pulse?.action&&
        s.elapsedMs-s.driveFeedback.atMs<160&& !['perfect','good','record'].includes(kind))return;
      s.driveFeedback={kind,action:pulse?.action,lane:pulse?.lane,
        label:faceLabel(s,pulse?.action)||'NEXT PAD',atMs:s.elapsedMs,
        expiresMs:s.elapsedMs+(['perfect','good','record'].includes(kind)?1300:1000)};
      if(kind==='miss'&&pulse) {
        const charge=B.CacheRoadAdrenaline?.pose?.(s.adrenaline);
        s.beatFeedback={kind,action:pulse.action,lane:pulse.lane,pulseId:pulse.id,
          atMs:s.elapsedMs,expiresMs:s.elapsedMs+1000,
          delta:charge?.lastResult==='miss'?charge.lastDelta:0,value:charge?.value||0,
          tier:charge?.tier||'cold',tierChanged:false,chain:charge?.chain||0};
      }
    },
    catchPulse(action, pressTimeSec, audiblePressTimeSec) {
      const s = this.state;
      const audio=window.audioSystem;
      const rawNow=Number.isFinite(pressTimeSec)?pressTimeSec:audio?.context?.currentTime;
      const now=Number.isFinite(audiblePressTimeSec)?audiblePressTimeSec:
        audio?.getOutputAudioTime?.(rawNow)??rawNow;
      const judgment = B.MusicTransport?.judgeInput?.(this.chapter?.encounterVersion>=2?'road-pulse-v2':'road-pulse', now,
        B.Preferences?.values?.inputOffsetMs || 0);
      if (this.chapter && !this.chapter.delivery && judgment?.available) this.chapter.attempts++;
      if(!judgment?.available)return false;
      const beatSec=B.MusicTransport.sample(now)?.grid?.beatDurationSec||60/128;
      const pressBeat=judgment.beatIndex+judgment.signedOffsetMs/(beatSec*1000);
      const candidates=roadPulses(s).filter(p=>!s.caughtPulses[p.id]&&
        Number.isFinite(s.pulseTargets[p.id])&&Math.abs(s.pulseTargets[p.id]-pressBeat)<=4.1);
      const pulse=candidates.sort((a,b)=>Math.abs(s.pulseTargets[a.id]-pressBeat)-
        Math.abs(s.pulseTargets[b.id]-pressBeat))[0];
      if(!pulse)return false;
      const offset=(pressBeat-s.pulseTargets[pulse.id])*beatSec;
      if(judgment.timing==='miss'||judgment.beatIndex!==s.pulseTargets[pulse.id]) {
        this.pulseFeedback(offset<0?'early':'late',pulse);return false;
      }
      if(PULSE_ACTIONS[pulse.action].key!==action) {
        this.pulseFeedback('button',pulse);return false;
      }
      if(Math.abs(s.lanePos-pulse.lane)>.38) {
        this.pulseFeedback('lane',pulse);return false;
      }
      const clock=window.audioSystem?.context?.currentTime??now;
      const current=B.MusicTransport.sample(audio?.getOutputAudioTime?.()??clock);
      if(!current.grid)return false;
      s.caughtPulses[pulse.id] = true;
      if (this.chapter && !this.chapter.delivery) {
        this.chapter.accurate++;
        if (judgment.timing === 'perfect') this.chapter.perfect++;
      }
      const until=(judgment.beatIndex-current.grid.beatFloat)*current.grid.beatDurationSec;
      // This is the original source deadline, not an output-delayed one.
      // A sufficiently early tap can schedule there; otherwise acknowledge
      // immediately. Already-rendered audio cannot be sent back in time.
      const deadline=current.audioTimeSec+until;
      this.cue(judgment.timing==='perfect'?'roadPerfect':'roadGood',
        {audioTimeSec:Math.max(clock,deadline),action:pulse.action,
          trackTimeSec:judgment.beatIndex*current.grid.beatDurationSec,
          pan:(pulse.lane-1.5)*.14});
      if(until>.001)s.pendingPulseAwards.push({pulse,judgment,speed:s.speed,
        beat:judgment.beatIndex});
      else this.awardPulse(pulse,judgment,s.speed);
      return true;
    },
    awardPulse(pulse,judgment,speed) {
      const s=this.state,action=PULSE_ACTIONS[pulse.action].key;
      const fast = speed >= 61, slow = speed <= 36;
      s.pulseCombo = pulse.run === s.lastPulseRun && pulse.order === s.lastPulseOrder + 1 ?
        s.pulseCombo + 1 : 1;
      s.lastPulseRun = pulse.run; s.lastPulseOrder = pulse.order;
      if (this.chapter && !this.chapter.delivery) {
        this.chapter.connected++;
        this.chapter.bestCombo = Math.max(this.chapter.bestCombo, s.pulseCombo);
      }
      const long = s.pulseCombo >= 2;
      const startBeat = judgment.beatIndex;
      const reactive = this.chapter?.encounterVersion >= 2;
      const captureRules = reactive ? B.MusicProfiles.get(PROFILE).laneMix.reactive : null;
      const holdBars = reactive ? (long ? captureRules.comboBars : captureRules.captureBars) :
        (long ? 16 : 8);
      s.pulseHoldBars = holdBars;
      const endBeat = Math.min(400, startBeat + holdBars * BAR_BEATS);
      const existing = s.captures.find(c => c.lane === pulse.lane) ||
        s.queuedCaptures.find(c => c.lane === pulse.lane);
      if (existing) {
        if (reactive && endBeat > existing.endBeat)
          s.pendingMixExtension = { lane: pulse.lane, beat: startBeat };
        existing.endBeat = Math.max(existing.endBeat, endBeat);
      }
      else s.queuedCaptures.push({ lane: pulse.lane, startBeat, endBeat, inkAtMs: s.elapsedMs });
      s.opening.held = true;
      if (long) s.opening.sealed = true;
      s.pulseFlashMs = 650;
      s.pulseFlashAction = pulse.action;
      s.pulseFlashLane = pulse.lane;
      s.pulseTiming = judgment.timing==='perfect'?'PERFECT':'ON BEAT';
      if (reactive) s.driveFeedback = { kind: judgment.timing === 'perfect' ? 'perfect' : 'good',
        action: pulse.action, lane: pulse.lane, label: s.pulseTiming,
        holdBars, atMs: s.elapsedMs, expiresMs: s.elapsedMs + 1200 };
      s.score += (judgment.timing === 'perfect' ? 80 : 50) * (fast ? 2 : 1) * (s.combat?1+s.captures.length*.5:1);
      if(s.combat)B.CacheRoadCombat.rewardSync(s.combat,judgment.timing==='perfect');
      const adrenalineGain=B.CacheRoadAdrenaline?.resolve?.(s.adrenaline,
        {id:pulse.id,result:judgment.timing==='perfect'?'perfect':'good',atMs:s.elapsedMs});
      this.recordAdrenaline(adrenalineGain,{action:pulse.action,
        trackTimeSec:startBeat*60/128,pan:(pulse.lane-1.5)*.14});
      s.beatFeedback={kind:judgment.timing==='perfect'?'perfect':'good',
        action:pulse.action,lane:pulse.lane,pulseId:pulse.id,
        atMs:s.elapsedMs,expiresMs:s.elapsedMs+1200,
        delta:adrenalineGain?.accepted?adrenalineGain.delta:0,
        value:adrenalineGain?.value||0,tier:adrenalineGain?.tier||'cold',
        tierChanged:!!adrenalineGain?.tierChanged,chain:s.adrenaline?.chain||s.pulseCombo};
      if (fast && ++s.fastPulses % 2 === 0) s.boost = 1;
      if (slow) s.echoEnergy = clamp(s.echoEnergy + 25, 0, 100);
      switch (action) {
        case 'road_a':
          s.queuedSurge = true;s.surgeBeat=judgment.beatIndex+BAR_BEATS;break;
        case 'road_b': s.ramMs = Math.max(s.ramMs, s.encounters?3750:1800); break;
        case 'road_x': s.shield = 1; break;
        case 'road_y':
          s.echoEnergy = clamp(s.echoEnergy + 40, 0, 100);
          if (fast) s.boost = 1;
          break;
      }
      const effect = faceLabel(s,pulse.action);
      s.message = `${effect} // ${LANES[pulse.lane]} +${holdBars} BARS` +
        (s.combat?`  RECHARGE -${judgment.timing==='perfect'?'0.5':'0.25'}s`:fast ? '  FAST x2' : slow ? '  ECHO +25' : '');
      s.messageMs = 1100;
    },
    sendEcho() {
      const s = this.state;
      if (s.echoEnergy < 100) {
        s.message = 'BUFFER NEEDS A CLEAN TRACE'; s.messageMs = 950; return;
      }
      s.echoEnergy = 0;
      // Give the first audit and final exit time for a visible split. Both
      // appear shortly after a marker; other Echos keep their short duration.
      const firstAudit = s.progress >= 850 && s.progress < 975;
      const finalExit = s.gateAt != null && s.progress >= s.gateAt - 220 && s.progress < s.gateAt;
      const durationMs = firstAudit || finalExit ? 6000 : 2700;
      s.echo = { lanePos: s.lanePos, progress: s.progress, ageMs: 0, durationMs,
        path: s.trace.map(sample => ({ ...sample })), sampleIndex: 0, sampleMs: 0 };
      s.rivalDistractedMs = durationMs;
      s.opening.echo = true;
      s.message = 'BUFFER ECHO // SPLIT THE LINE'; s.messageMs = 1700;
      this.cue('data');
    },
    recordAdrenaline(result,cueOptions={}) {
      const s=this.state;
      if(!s?.adrenaline||!result?.accepted)return;
      s.lockEnergy=s.adrenaline.value;
      if(!result.tierChanged)return;
      if(result.delta>0)this.cue(result.tier==='rush'?'roadFull':'roadTurboReady',{intensity:.4,...cueOptions});
      else if(result.result==='miss')this.cue('roadMiss',{intensity:.3});
    },
    combatInput() {
      const s=this.state;
      return {progress:s.progress,lanePos:s.lanePos,speed:s.speed,bar:s.musicBeatFloat/4,
        adrenaline:s.adrenaline?.value||0,
        syncCount:new Set(s.captures.map(part=>part.lane)).size,
        invulnerableMs:s.invulnerableMs,boosting:s.boostMs>0,
        protectedPulses:roadPulses(s).filter(p=>p.target>=s.musicBeatFloat-.3),
        actors:roadHazards(s).map(h=>{const pose=actorPose(s,h);return {...h,...pose,cleared:!pose.collidable};})};
    },
    applyCombatEvents(events) {
      const s=this.state;
      for(const event of events) {
        if(['shot','enemy-shot','enemy-hit','ram-impact','disrupt'].includes(event.type)) {
          const type=event.type==='ram-impact'?'ram':event.type==='disrupt'?'disrupt':
            event.type==='enemy-hit'?'impact':'muzzle';
          const body=event.projectile||event;
          s.combatFx=(s.combatFx||[]).filter(fx=>s.elapsedMs-fx.atMs<fx.duration).slice(-11);
          s.combatFx.push({type,at:body.at,lane:body.lane,atMs:s.elapsedMs,duration:type==='muzzle'?130:400});
        }
        // Contact has authored paint/sound, but no score of its own. Preserve
        // any earned receipt, including a takedown earlier in this sequence.
        if(event.type==='ram-impact')this.cue('damage',{material:event.kind,intensity:.7});
        if(event.type==='rider-splatter')this.cue('damage',{material:'bike',intensity:.45});
        if(event.type==='hit')this.hit(event.kind,event,true);
        else if(event.type==='turbo') {
          s.queuedTurbo=true;s.turboBeat=this.nextShiftBeat();s.opening.turbo=true;
          s.message='TURBO QUEUED // NEXT ONE';s.messageMs=900;this.cue('roadQueued',{intensity:.5});
        } else if(event.type==='attack') {
          s.message='ATTACK';s.messageMs=500;this.cue('roadPush',{intensity:.7});
        } else if(event.type==='defend'||event.type==='defend-ready') {
          s.defenseFlashMs=500;s.defenseKind=event.type==='defend-ready'?'GUARD READY':
            event.cause==='turbo'?'TURBO CONTACT':'DEFEND COUNTER';this.cue('roadBrace',{intensity:.6});
        } else if(event.type==='disrupt') {
          s.message='DISRUPT // LOCK BROKEN';s.messageMs=700;this.cue('data');
        } else if(event.type==='enemy-hit') {
          s.bossImpact={...event,atMs:s.elapsedMs};this.cue('roadPush',{intensity:.8});
        } else if(event.type==='takedown') {
          const points=(event.kind==='rig'?1500:250)*(1+(event.chain||0))*stackSize(s);
          s.score+=points;s.passAward=points;s.passFlashMs=780;s.passKind=event.kind==='rig'?'RIG DESTROYED':'TAKEDOWN';
          s.passSide=Math.sign(event.lane-s.lanePos)||1;
          s.message=`${event.kind.toUpperCase()} DOWN // +${points}`;s.messageMs=1200;
          this.cue('damage',{material:event.kind,intensity:1});
        } else if(event.type==='boss-system-broken') {
          s.message='RIG SYSTEM DESTROYED';s.messageMs=1200;this.cue('roadFull');
        } else if(event.type==='boss-arrive') {
          s.message='ENFORCEMENT RIG // ATTACK ITS OPENINGS';s.messageMs=2300;this.cue('warning');
        } else if(event.type==='boss-defeated') {
          s.gateOpen=true;s.gateAt=null;s.bossVictoryMs=3600;
          s.timeMs=Math.max(s.timeMs,21000);
          s.message='PURSUIT DESTROYED // DELIVER';s.messageMs=3500;
          this.cue('roadFull');this.checkpoint('road-gate');
        } else if(event.type==='warning')this.cue('warning');
      }
      s.combatDanger=s.combat.enemies.some(actor=>['windup','attack'].includes(actor.phase)&&
        actor.at-s.progress>=-300&&actor.at-s.progress<=440)||
        s.combat.projectiles.some(shot=>!shot.friendly&&Math.abs(shot.at-s.progress)<=440)?1:0;
      s.rivalWarning=s.combatDanger>0;
    },
    handleActions(actions) {
      if (!this.active || this.presentationPreparing || this.status !== 'playing' || this.exiting || this.introMs !== null) return;
      const s = this.state;
      const steer=Number(!!actions.move_right?.held)-Number(!!actions.move_left?.held);
      s.steer=steer*(this.handoffMs!=null?B.CacheRoadCinematics?.pose('handoff',this.handoffMs)?.controlRatio||0:1);
      if(this.handoffMs!=null)return;
      const down=!!actions.move_down?.held,up=!!actions.move_up?.held&&!down;
      if(actions.move_down?.pressed||down&&!s.braking)this.requestGear(-1);
      else if(actions.move_up?.pressed||up&&!s.throttling)this.requestGear(1);
      s.braking=down;s.throttling=up;
      for (const face of PULSE_ACTIONS)
        for (const press of actions[face.key]?.presses?.length ? actions[face.key].presses :
          actions[face.key]?.pressed ? [{ audioTimeSec: window.audioSystem?.context?.currentTime }] : [])
          this.catchPulse(face.key, press.audioTimeSec, press.audibleAudioTimeSec);
      if(s.combat) {
        for(const skill of ['attack','turbo','defend','disrupt'])if(actions[`road_${skill}`]?.pressed) {
          if(skill==='turbo'&&s.queuedTurbo)continue;
          const result=B.CacheRoadCombat.act(s.combat,skill,this.combatInput());
          if(result.accepted)this.recordAdrenaline(B.CacheRoadAdrenaline?.spend?.(s.adrenaline,skill,{atMs:s.elapsedMs}));
          this.applyCombatEvents(result.events||[]);
          if(!result.accepted) {
            const reason=result.reason==='in-flight'?'SHOT IN FLIGHT':result.reason==='no-target'?'NO TARGET':result.reason==='weapon-recharging'?'WEAPON LOADING':
              result.reason==='runway'?'DELIVERY RUNWAY':'RECHARGING';
            s.message=`${skill.toUpperCase()} // ${reason}`;s.messageMs=500;
          }
        }
        return;
      }
      if (actions.road_echo?.pressed) this.sendEcho();
      if (actions.road_turbo?.pressed && s.boost > 0 && !s.queuedTurbo) {
        s.boost = 0; s.nearMisses = 0; s.queuedTurbo = true;s.turboBeat=this.nextShiftBeat();
        s.opening.turbo = true;
        s.message = 'TURBO QUEUED // NEXT BAR'; s.messageMs = 900;
        this.cue('roadQueued',{intensity:.5});
      }
    },
    hit(kind, actor = null, combat = false) {
      const s = this.state;
      const react = effect => !combat && s.encounters && actor && B.CacheRoadReactions?.onHit(s,actor,{
        kind:effect,baseLane:actorPose(s,actor).lane,shoulderClear:false,
        actors:roadHazards(s).map(h=>({...h,...actorPose(s,h)}))});
      if (s.invulnerableMs || s.boostMs) return;
      if(!combat&&s.combat?.defendMs>0) {
        // Deliberate R2 protection covers ordinary road traffic too. It
        // consumes one timed guard without spending passive sync buffers or
        // inventing enemy/rig damage in the separate combat ledger.
        s.combat.defendMs=0;s.combat.stats.blocks++;
        s.defenseFlashMs=500;s.defenseKind='DEFEND BLOCK';
        s.message='DEFEND // CONTACT BLOCKED';s.messageMs=700;
        this.cue('roadBrace',{intensity:.75});return;
      }
      if (!combat && s.ramMs > 0) {
        react('push');
        s.ramMs = 0; s.score += 100; s.message = s.combat?'SYNC // CONTACT BUFFER':'PUSH // TRAFFIC CLEARED';
        s.defenseFlashMs=600;s.defenseKind=s.combat?'SYNC CONTACT':'PUSH';
        s.messageMs = 900; this.cue('roadPush',{intensity:.85}); return;
      }
      if (!combat && s.shield) {
        react('brace');
        s.shield = 0; s.message = s.combat?'SYNC // IMPACT BUFFER':'BRACE // IMPACT BLOCKED';
        s.defenseFlashMs=600;s.defenseKind=s.combat?'SYNC IMPACT':'BRACE';
        s.messageMs = 900; this.cue('land'); return;
      }
      react('crash');
      this.recordAdrenaline(B.CacheRoadAdrenaline?.wreck?.(s.adrenaline,{atMs:s.elapsedMs}));
      if (this.chapter && !this.chapter.delivery) this.chapter.damageTaken++;
      s.recordHoldMs = 0;
      s.integrity--; s.queuedRecovery = true;s.recoveryBeat=this.nextShiftBeat();
      // A genuine wreck drops the selected gear permanently. The next ONE
      // owns the smooth physical slowdown, preserving every revealed pad.
      s.gear=0;s.pendingGear=null;
      // The saved section's gear records the selected gear; its physical
      // trajectory stays fixed until next ONE. Keep the existing save invariant.
      if(s.driveSections.length)s.driveSections.at(-1).gear=0;
      if(s.queuedTurbo)s.boost=1; // Return the charge for a launch that never ran.
      s.queuedTurbo=false;s.queuedSurge=false;
      s.timeMs = Math.max(0, s.timeMs - 1800);
      s.invulnerableMs = s.encounters ? B.CacheRoadEncounters.difficulty(this.chapter.difficultyId,s.encounters?.version).recoveryMs : 1400;
      s.damagedBar = s.musicBar;
      if(s.encounters)B.CacheRoadReactions.recoverCapture(s);
      else {s.captures = []; s.queuedCaptures = []; s.fullAdrenaline = false;}
      s.pulseCombo = 0; s.lastPulseRun = null; s.lastPulseOrder = -1;
      s.hitRecovery = true;
      s.shield = 0; s.ramMs = 0; s.surgeMs = 0;
      s.draftTarget=null;s.draftMs=0;s.passFlashMs=0;
      s.stumbleMs = 650; s.cutStreak = 0; s.cutFlashMs = 0; s.nearMisses = 0;
      B.CacheRoadMirror?.onHit(s.mirrorState,s);
      s.message = ''; s.messageMs = 0;
      if(!(this.chapter?.encounterVersion>=2))window.audioSystem?.playRoadStumble?.({sound:false});
      this.cue('damage',{material:kind,
        intensity:clamp(.55+s.speed/160+(['freight','sweeper','roadblock'].includes(kind)?.12:0),0,1)});
      if (s.integrity <= 0) {
        this.status = s.status = 'failed';this.checkpointChapter();
        window.audioSystem?.stopRoadEngine?.();
      }
    },
    readyTurbo() {
      const s=this.state;
      if(!s.boost&&!s.combat) {
        s.turboReadyMs=1100;
        this.cue('roadTurboReady');
      }
      s.boost=1;
    },
    cleanPass(cut = false, side = 1) {
      const s = this.state;
      // Traffic skill charges abilities and score; the visible pulses earn music.
      // A collision's grace window is recovery, not a clean crossing.
      if (s.invulnerableMs) return;
      s.nearMisses++;
      s.echoEnergy = clamp(s.echoEnergy + (cut ? 35 : 16), 0, 100);
      s.cutStreak = cut ? Math.min(4, s.cutStreak + 1) : 0;
      const points = (cut ? 150 * s.cutStreak : 25) * stackSize(s);
      s.score += points;
      if (s.nearMisses >= 2) { this.readyTurbo(); s.nearMisses = 0; }
      s.passFlashMs=780;s.passSide=side;s.passAward=points;s.passKind=cut?'CLOSE CUT':'NEAR MISS';
      if (cut) { s.cutFlashMs = 740; s.cutAward = points; }
      else { s.message = s.combat?`NEAR MISS // +${points} · SYNC ×${stackSize(s)}`:`NEAR MISS // +${points}  ${s.boost?'TURBO READY':`TURBO ${s.nearMisses}/2`}`; s.messageMs = 850; }
      this.cue(cut ? 'roadCutPass' : 'roadNearMiss',
        {pan:side*.65,intensity:clamp(.5+s.speed/140,0,1)});
    },
    recordOpportunity() {
      if (!this.chapter || this.chapter.delivery || !this.state) return null;
      const bar = this.state.musicBeatFloat / BAR_BEATS;
      const index = RECORD_ZONES.findIndex(([start,end], i) =>
        bar >= start - 2 && bar < end &&
        !this.chapter.records.includes(B.CacheChapter.recordIds[i]));
      if (index < 0) return null;
      const [start,end,lane] = RECORD_ZONES[index];
      return { index, lane, start, end, active: bar >= start,
        held: this.state.recordIndex === index ? this.state.recordHoldMs / RECORD_DWELL_MS : 0 };
    },
    updateRecords(dt) {
      const s = this.state, opportunity = this.recordOpportunity();
      if (opportunity && s.recordSigns[opportunity.index] === undefined)
        s.recordSigns[opportunity.index] = s.progress + 340;
      if (!opportunity || !opportunity.active ||
          Math.abs(s.lanePos - opportunity.lane) > .38 || s.stumbleMs > 0) {
        s.recordHoldMs = 0; s.recordIndex = opportunity?.index ?? -1; return false;
      }
      if (s.recordIndex !== opportunity.index) s.recordHoldMs = 0;
      s.recordIndex = opportunity.index;
      s.recordHoldMs = Math.min(RECORD_DWELL_MS, s.recordHoldMs + dt);
      if (s.recordHoldMs < RECORD_DWELL_MS) return false;
      if (!B.CacheChapter.collect(B.CacheChapter.recordIds[opportunity.index], this)) return false;
      s.recordFlashMs = 1300; s.recordFlashIndex = opportunity.index;
      this.pulseFeedback('record');
      s.recordHoldMs = 0;
      this.checkpointChapter();
      this.cue('pickup', { intensity: .6, pan: (opportunity.lane - 1.5) * .14 });
      return true;
    },
    async preparePresentation() {
      const ctx=window.renderer?.ctx;
      if(!this.active||!this.state||!ctx||!B.CacheRoadGPU?.warmup)return;
      this.cancelPresentation?.();
      const generation=this.presentationGeneration=(this.presentationGeneration||0)+1;
      const cancelled={cancelled:true};
      const cancellation=new Promise(resolve=>{this.cancelPresentation=()=>resolve(cancelled);});
      const awaitOwned=pending=>Promise.race([pending,cancellation]);
      this.presentationPreparing=true;
      try {
        this.draw(ctx);
        // Level 1's atlas resources are no longer used by this scene. The
        // lifecycle reloads them before a later Level 1 or Level 3 start.
        B.StandaloneSprites?.suspend?.();
        window.parallaxBackground?.disposeSkyAnimation?.();
        if(B.LevelSceneResources?.releaseLevel1) {
          const released=await awaitOwned(B.LevelSceneResources.releaseLevel1());
          if(generation!==this.presentationGeneration||!this.active)return;
          this.sceneReleaseReport=released;
        }
        const keys=GPU_LEVEL_KEYS;
        if(B.PresentationAssets?.selectRoadScene) {
          await awaitOwned(B.PresentationAssets.selectRoadScene(keys));
          if(generation!==this.presentationGeneration||!this.active)return;
        }
        const sources=B.PresentationAssets?.waitForGpuSources?
          await awaitOwned(B.PresentationAssets.waitForGpuSources(keys)):
          B.PresentationAssets?.gpuSources?.(keys)||[];
        if(sources===cancelled||generation!==this.presentationGeneration||!this.active)return;
        this.gpuLevelSources=sources;
        const result=await awaitOwned(B.CacheRoadGPU.warmup(ctx,sources,
          {rearViewport:{x:626,y:0,width:714,height:141},
            cancelled:()=>generation!==this.presentationGeneration||!this.active}));
        if(result===cancelled||generation!==this.presentationGeneration||!this.active)return;
        const available=new Set(sources.map(source=>source.key));
        const missingKeys=keys.filter(key=>!available.has(key));
        this.presentationResult={...result,requestedSources:keys.length,
          missingKeys,complete:missingKeys.length===0};
        return this.presentationResult;
      } finally {
        if(generation===this.presentationGeneration) {
          this.presentationPreparing=false;
          this.cancelPresentation=null;
          window.inputManager?.resetActionEdges?.();
        }
      }
    },
    update(delta) {
      if(this.presentationPreparing)return;
      // GPU resources are prepared by the existing update owner, never by
      // scene drawing or a second animation loop. The first draw records the
      // actual production context when an alternate startup owns the Canvas.
      const gpuFrameContext=this.gpuFrameContext||window.renderer?.ctx;
      if(this.active&&gpuFrameContext)try {
        if(B.CacheRoadGPU&&this.state) {
          B.CacheRoadGPU.prepare(gpuFrameContext,
            this.gpuLevelSources||B.PresentationAssets?.gpuSources?.(GPU_LEVEL_KEYS)||[]);
        }
      }
      catch { /* The current frame retains its complete native painter. */ }
      if(this.active&&this.outroMs!=null&&!this.exiting) {
        const dt=Math.min(100,Math.max(0,delta));
        if(!dt||window.isPaused||window.gameState?.paused)return;
        if(!window.inputManager?.isResultControlHeld?.())this.resultControlsReady=true;
        this.outroMs+=dt;this.cinematicEngine(this.cinematicPose());
        if(this.outroMs>=B.CacheRoadCinematics.durations.outro)this.finishOutro();
        return;
      }
      if (!this.active || this.status !== 'playing' || this.exiting) {
        if (this.active && this.status !== 'playing' && !window.inputManager?.isResultControlHeld?.())
          this.resultControlsReady = true;
        window.audioSystem?.stopRoadEngine?.();return;
      }
      const s = this.state, dt = Math.min(100, Math.max(0, delta));
      if (!dt) return;
      if (this.introMs !== null) {
        const beforeIntro=this.introMs;
        this.introMs += dt;
        const cinema=this.cinematicPose();
        if(cinema) {
          this.cinematicEngine(cinema);
          if(beforeIntro<4300&&this.introMs>=4300)this.cue('roadPush',{intensity:.65});
        }
        if (this.introMs >= (cinema?B.CacheRoadCinematics.durations.opening:4200)) this.finishIntro();
        return;
      }
      if(this.handoffMs!=null) {
        this.handoffMs+=dt;
        if(this.handoffMs>=B.CacheRoadCinematics.durations.handoff)this.handoffMs=null;
      }
      const before = s.progress,previousLanePos=s.lanePos;
      const audio=window.audioSystem;
      let music = B.MusicTransport?.sample?.(audio?.getOutputAudioTime?.()??audio?.context?.currentTime??0);
      // A changing output-delay estimate may briefly move the heard clock
      // backward. Hold presentation until it catches up; never rewind road
      // paint or replay a bar. Input still uses its exact captured timestamp.
      if(music?.running&&music.profileId===PROFILE&&music.grid&&
          s.driveBeat!==null&&music.grid.beatFloat<s.driveBeat) {
        const beat=s.driveBeat,grid=music.grid;
        music={...music,grid:{...grid,beatFloat:beat,beatIndex:Math.floor(beat),
          beatInBar:Math.floor(beat)%BAR_BEATS,barIndex:Math.floor(beat/BAR_BEATS)}};
      }
      const previousBar = s.musicBar;
      const bar = music?.running && music.profileId === PROFILE && music.grid ?
        Math.max(0, music.grid.barIndex) : previousBar;
      this.updateDrive(music);
      this.updatePulses(music);
      this.updateCaptures(music);
      s.musicBar = Math.max(previousBar, bar);
      if (this.chapter && !this.chapter.delivery) this.chapter.elapsedMs += dt;
      s.recordFlashMs = Math.max(0, s.recordFlashMs - dt);
      s.bossVictoryMs = Math.max(0,(s.bossVictoryMs||0)-dt);
      s.elapsedMs += dt; s.timeMs = Math.max(0, s.timeMs - dt);
      s.ramMs = Math.max(0, s.ramMs - dt);
      s.pulseFlashMs = Math.max(0, s.pulseFlashMs - dt);
      s.invulnerableMs = Math.max(0, s.invulnerableMs - dt);
      s.stumbleMs = Math.max(0, s.stumbleMs - dt);
      s.cutFlashMs = Math.max(0, s.cutFlashMs - dt);
      s.messageMs = Math.max(0, s.messageMs - dt);
      if(B.CacheRoadCrewCallouts)B.CacheRoadCrewCallouts.step(s,dt);
      else if(s.crosswalkToast) {
        s.crosswalkToast.remainingMs=Math.max(0,s.crosswalkToast.remainingMs-dt);
        if(!s.crosswalkToast.remainingMs)s.crosswalkToast=null;
      }
      s.turboReadyMs=Math.max(0,s.turboReadyMs-dt);
      s.defenseFlashMs=Math.max(0,s.defenseFlashMs-dt);
      s.passFlashMs=Math.max(0,s.passFlashMs-dt);
      s.rivalDistractedMs = Math.max(0, s.rivalDistractedMs - dt);
      const seconds = dt / 1000;
      const curve = roadCurve(before);
      s.lanePos = clamp(s.lanePos +
        (s.steer * 2.5 - curve * (s.speed / 54) ** 2 * 0.5) * seconds, 0, 3);
      s.lane = Math.round(s.lanePos);
      s.visualLane += (s.lanePos - s.visualLane) * (1-Math.exp(-dt/110));
      this.updateStreetMotion(dt);
      if(s.encounters)B.CacheRoadReactions?.step(s,dt);

      // This short input trace, rather than a past world position, can be
      // replayed from the car's present location as a readable decoy.
      s.trace.push({ steer: s.steer, duration: dt });
      let traceLength = s.trace.reduce((total, sample) => total + sample.duration, 0);
      while (traceLength > 2200 && s.trace.length > 1)
        traceLength -= s.trace.shift().duration;
      if (s.echo) {
        const e = s.echo;
        e.ageMs += dt; e.progress += s.progress-before;
        let remaining = dt;
        while (remaining > 0 && e.sampleIndex < e.path.length) {
          const sample = e.path[e.sampleIndex], step = Math.min(remaining, sample.duration - e.sampleMs);
          e.lanePos = clamp(e.lanePos + sample.steer * 2.5 * step / 1000, 0, 3);
          e.sampleMs += step; remaining -= step;
          if (e.sampleMs >= sample.duration) { e.sampleIndex++; e.sampleMs = 0; }
        }
        if (e.ageMs >= e.durationMs) s.echo = null;
      }
      if (Math.abs(curve) > 0.48 && s.speed > 30 && s.steer * curve > 0) {
        s.echoEnergy = clamp(s.echoEnergy + 8 * seconds, 0, 100);
      }

      // Resolve every vehicle at a crossing before paying clean-pass rewards.
      // A paired gate can otherwise award a near miss from its second vehicle
      // in the very frame where its first vehicle hits the car.
      const contactAt = new Set(), pendingPasses = [];
      let draftCandidate=null;
      for (const hazard of roadHazards(s)) {
        const actor=actorPose(s,hazard);
        if(!actor.collidable)continue;
        const distance = actor.at - s.progress;
        const hazardId = `${hazard.at}/${hazard.lane}`;
        if (!hazard.encounter && hazard.kind === 'audit' && distance < 160 && distance > 0 &&
          !Object.hasOwn(s.audits, hazard.at)) {
          s.audits[hazard.at] = s.echo ? Math.round(s.echo.lanePos) : s.lane;
          if (hazard.at === 1135 && s.echo) s.opening.auditFollowedEcho = true;
        }
        const lane = actor.lane;
        if (distance <= 80 && distance > 0 && s.speed >= 38 && !s.invulnerableMs &&
            !s.boostMs && Math.abs(lane - s.lanePos) < .45)
          s.cutMarks[hazardId] = true;
        if ((hazard.kind === 'freight' || hazard.kind === 'shuttle') &&
            distance > 15 && distance < 110 &&
            Math.abs(lane - s.lanePos) < .42 && s.speed >= 28 &&
            !s.invulnerableMs&&!s.boostMs&&!s.boost&&!s.drafted[hazard.at]&&
            (!draftCandidate||hazard.at<draftCandidate.at))draftCandidate=hazard;
        if (before >= hazard.at || s.progress < hazard.at) continue;
        const gap = Math.abs(lane - s.lanePos);
        if (gap < (['freight','shuttle','sweeper'].includes(hazard.kind) ? 0.53 :
            hazard.kind === 'trike' ? 0.38 : 0.45) *
            (s.encounters?B.CacheRoadEncounters.difficulty(this.chapter.difficultyId,s.encounters?.version).collisionScale:1)) {
          if (contactAt.has(hazard.at)) continue;
          contactAt.add(hazard.at);
          this.hit(hazard.kind === 'block' ? 'roadblock' : hazard.kind, hazard);
          if (this.status === 'failed') return;
        } else if (gap < 1.30 && s.speed >= 25) {
          pendingPasses.push({ at: hazard.at,side:Math.sign(lane-s.lanePos)||1,
            cut: !!s.cutMarks[hazardId] && gap < 1.20 && s.speed >= 38 });
        }
        delete s.cutMarks[hazardId];
      }
      // Charge belongs to one continuous slipstream, once per update.
      // Leaving it, changing trucks, damage or turbo interrupts the hold.
      const draftTarget=draftCandidate&&!s.invulnerableMs?draftCandidate.at:null;
      if(draftTarget!==s.draftTarget)s.draftMs=0;
      s.draftTarget=draftTarget;
      if(draftTarget!==null) {
        s.draftMs+=dt;
        if(s.draftMs>=600) {
          s.drafted[draftTarget]=true;this.readyTurbo();
          s.echoEnergy=clamp(s.echoEnergy+25,0,100);
          s.message=s.combat?'DRAFT // CLEAN ROAD':`${draftCandidate.kind==='shuttle'?'SHUTTLE':'FREIGHT'} DRAFT // TURBO READY`;
          s.messageMs=1100;
          s.draftTarget=null;s.draftMs=0;
        }
      } else s.draftMs=0;
      const paidAt = new Set();
      for (const pass of pendingPasses) if (!contactAt.has(pass.at) && !paidAt.has(pass.at)) {
        this.cleanPass(pass.cut,pass.side); paidAt.add(pass.at);
      }
      if(s.combat) {
        this.applyCombatEvents(B.CacheRoadCombat.step(s.combat,dt,this.combatInput()));
        if(this.status==='failed')return;
      }
      if(s.crosswalks) {
        const events=B.CacheRoadCrosswalks.step(s.crosswalks,dt,{before,progress:s.progress,
          previousLanePos,lanePos:s.lanePos,speed:s.speed,bar:s.musicBeatFloat/4});
        for(const event of events)if(event.type==='pedestrian-hit') {
          if(B.CacheRoadCrewCallouts)B.CacheRoadCrewCallouts.enqueue(s,event);
          else s.crosswalkMessages.push({message:event.message,id:event.id});
          this.cue('damage',{material:'pedestrian',intensity:.35});
        }
        if(!B.CacheRoadCrewCallouts&&!s.crosswalkToast&&s.crosswalkMessages.length)
          s.crosswalkToast={...s.crosswalkMessages.shift(),remainingMs:2000};
      }
      if(s.pursuit) {
        const events=B.CacheRoadPursuit.step(s.pursuit,{before,progress:s.progress,
          barFloat:s.musicBeatFloat/4,dt,lane:s.lanePos,echo:s.echo,gateAt:s.gateOpen?null:s.gateAt,
          echoActive:!!s.echo&&s.rivalDistractedMs>0,difficultyId:this.chapter.difficultyId,
          ramMs:s.ramMs,shield:s.shield,boostMs:s.boostMs,surgeMs:s.surgeMs,speed:s.speed,
          protectedPulses:roadPulses(s).filter(p=>p.target>=s.musicBeatFloat-.3),
          actors:roadHazards(s).map(h=>{const pose=actorPose(s,h);return {...h,...pose,cleared:!pose.collidable};})});
        const rival=B.CacheRoadPursuit.pose(s.pursuit,{progress:s.progress});
        s.rivalWarning=!!rival?.warning;s.rivalLane=rival?.lane??s.rivalLane;
        s.rivalTarget=rival?.lockLane??s.rivalTarget;
        s.rivalEchoCommitted=!!rival?.echoCommitted;
        if(rival)s.nextRivalAt=rival.at;
        for(const event of events) {
          if(event.type==='warning'||event.type==='boss-warning')this.cue('warning');
          else if(event.type==='boss-counter') {
            if(event.consumePush)s.ramMs=0;if(event.consumeShield)s.shield=0;
            s.bossImpact={at:event.at,lane:event.lane,kind:event.kind,systemIndex:event.systemIndex,atMs:s.elapsedMs};
            s.passAward=event.kind==='dodge'?250:400;s.score+=s.passAward;
            s.passFlashMs=780;s.passSide=Math.sign((event.lane??1.5)-s.lanePos)||1;
            s.message=`${event.kind.toUpperCase()} // SYSTEM BROKEN`;s.messageMs=1200;
            this.cue(event.kind==='brace'?'roadBrace':'roadPush',{intensity:1});
          }
          else if(event.type==='boss-defeated') {
            s.gateOpen=true;s.gateAt=null;s.bossVictoryMs=3600;
            s.timeMs=Math.max(s.timeMs,21000);
            s.message='PURSUIT BROKEN // DELIVER';s.messageMs=3500;
            this.cue('roadFull');this.checkpoint('road-gate');
          }
          else if(event.type==='refill')s.echoEnergy=100;
          else if(event.type==='echo-lock') {s.message='ECHO LOCKED / CHANGE LANES';s.messageMs=1100;this.cue('data');}
          else if(event.type==='deception') {s.echoDeceptions++;s.score+=200;s.message='RIVAL TOOK THE REPLAY';s.messageMs=1200;}
          else if(event.type==='hit') {this.hit(event.kind||'clean copy',rival);if(this.status==='failed')return;}
        }
      }
      if (!s.encounters && s.musicBar >= 76 && s.musicBar < 100) {
        const distance = s.nextRivalAt - s.progress;
        const enteringWarning = !s.rivalWarning && distance <= 120 && distance > 0;
        s.rivalWarning = distance <= 120 && distance > 0;
        if (s.rivalWarning) {
          if (enteringWarning) {
            s.rivalTarget = s.lanePos;
            s.rivalEchoCommitted = false;
            this.cue('warning');
          }
          if (s.echo && s.rivalDistractedMs && !s.rivalEchoCommitted) {
            s.rivalTarget = s.echo.lanePos;
            s.rivalEchoCommitted = true;
          }
          s.rivalLane += (s.rivalTarget - s.rivalLane) * Math.min(1, dt / 290);
        }
        if (before < s.nextRivalAt && s.progress >= s.nextRivalAt) {
          const decoy = !!s.echo && s.rivalDistractedMs > 0 && s.rivalEchoCommitted;
          if (decoy && Math.abs(s.echo.lanePos - s.lanePos) >= 0.7) {
            s.echoDeceptions++;
            s.message = 'RIVAL TOOK THE REPLAY'; s.messageMs = 1200;
          } else if (Math.abs(s.rivalLane - s.lanePos) < 0.55) {
            this.hit('clean copy');
            if (this.status === 'failed') return;
          }
          const density = stackSize(s);
          s.nextRivalAt = s.progress + (density >= 3 ? 155 : 225);
          s.rivalWarning = false; s.rivalEchoCommitted = false;
        }
      }
      if (!s.encounters && before < 850 && s.progress >= 850) {
        s.timeMs = Math.max(s.timeMs, 33000) + (stackSize(s) - 1) * 1800;
        s.echoEnergy = 100;
        this.checkpoint('road-cache'); s.message = 'ORIGINAL TAPE / KEEP MOVING'; s.messageMs = 1600;
      }
      if (!s.encounters && before < 1700 && s.progress >= 1700) {
        s.timeMs = Math.max(s.timeMs, 31000) + (stackSize(s) - 1) * 1800;
        s.echoEnergy = 100;
        this.checkpoint('road-fork'); s.message = 'A CLEAN COPY IS MISSING NAMES'; s.messageMs = 2400;
      }
      for (const [at, id] of [[28, 'road-verse-2'], [52, 'road-verse-3'], [76, 'road-verse-4']]) {
        if (previousBar < at && s.musicBar >= at) {
          s.timeMs = Math.max(s.timeMs, 55000);
          if(s.encounters)s.echoEnergy=100;
          this.checkpoint(id);
          if(at===76)s.nextRivalAt=s.progress+210;
          s.message = `VERSE ${1 + Math.floor(at / 24)} // HOLD THE ORIGINAL`;
          s.messageMs = 1800;
        }
      }
      this.updateRecords(dt);
      if (!s.combat && s.encounters?.version!==3 && previousBar < 92 && s.musicBar >= 92 && s.gateAt == null) {
        // Five seconds at the lowest gear, leaving a full Echo overlap and
        // ample music before the ending. No gear has an impossible exit.
        s.gateAt = s.progress + 150;
        s.echoEnergy = 100;
      }
      if (!s.combat && s.encounters?.version!==3 && !s.gateOpen && s.gateAt != null && before < s.gateAt && s.progress >= s.gateAt) {
        if (s.lanePos < 2.45 || !s.echo || s.rivalDistractedMs <= 0 ||
            Math.abs(s.echo.lanePos - s.lanePos) < 0.75) {
          s.gateFailure = s.lanePos < 2.45 ? 'wrong-lane' :
            !s.echo || s.rivalDistractedMs <= 0 ? 'no-echo' : 'no-split';
          // Stop at the missed exit. Moving the car backward while play kept
          // running looked like a broken game loop, not a deliberate retry.
          this.status = s.status = 'failed';
          this.checkpointChapter();window.audioSystem?.stopRoadEngine?.();return;
        } else {
          s.timeMs = Math.max(s.timeMs, 21000);
          s.gateOpen = true; this.checkpoint('road-gate');
          s.message = 'ORIGINAL THROUGH // MAC: DISTRIBUTION DENIED'; s.messageMs = 3500;
        }
      }
      if (s.gateOpen && s.musicBar >= 100) {
        this.status = s.status = 'clear';
        if (this.chapter) {
          B.CacheChapter?.finish(this);
          window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
          window.audioSystem?.stopRoadEngine?.();
          this.armResultControls();
          if(this.chapter.encounterVersion===4&&s.combat?.boss?.defeated&&B.CacheRoadCinematics) {
            this.outroMs=0;this.handoffMs=null;this.cinematicLane=s.visualLane;
          } else this.resumeEnding({ fresh: true });
          return;
        } else { this.checkpoint('road-clear'); this.armResultControls(); }
      }
      if (s.musicBar >= 100 && this.status === 'playing') {
        this.status = s.status = 'failed'; s.message = s.combat||s.encounters?.version===3?'PURSUIT HELD THE ORIGINAL':'ORIGINAL TAPE ENDED';
        this.checkpointChapter();
      }
      if (this.status !== 'playing') window.audioSystem?.stopRuntimeAudio?.({ stopMusic: true });
      if (s.timeMs <= 0 && this.status === 'playing') {
        this.status = s.status = 'failed'; s.message = 'TRANSMISSION WINDOW CLOSED';
        this.checkpointChapter();
      }
      this.updateEngineSound();
      if(music?.running)this.updateCamera(dt);
      B.CacheRoadMirror?.step(s.mirrorState,dt,s);
    },
    draw(ctx) {
      if (!ctx || !this.active) return;
      if(this.presentationPreparing) {
        B.CacheRoadGPU?.hide?.();
        ctx.save();ctx.setTransform(1,0,0,1,0,0);
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';
        ctx.fillStyle='#07121f';ctx.fillRect(0,0,1920,1080);
        ctx.fillStyle='#a4f2d7';ctx.textAlign='center';ctx.font='bold 30px Oxanium, monospace';
        ctx.fillText('PREPARING ROUTE',960,540);ctx.restore();return;
      }
      const live=this.state,cinema=this.cinematicPose();
      const s=cinema?{...live,progress:live.progress+cinema.progressOffset,
        visualLane:cinema.kind==='handoff'?live.visualLane:cinema.car.lane,
        lanePos:cinema.kind==='handoff'?live.lanePos:cinema.car.lane,
        steer:cinema.kind==='handoff'?live.steer:cinema.car.steer,
        elapsedMs:cinema.kind==='opening'?this.introMs:cinema.kind==='outro'?live.elapsedMs+this.outroMs:live.elapsedMs}:live;
      const progress=s.progress,frameContext=ctx,showFeedback=cinema?.kind!=='outro';
      if(ctx===window.renderer?.ctx)this.gpuFrameContext=ctx;
      const directGpu=B.CacheRoadGPU?.beginFrame?.(frameContext)===true;
      const budgetOwner=B.CacheRoadRenderBudget;
      const budgetEligible=!this.gpuRecoveryPainting&&!!budgetOwner&&ctx===window.renderer?.ctx&&
        ctx.canvas?.width===1920&&ctx.canvas?.height===1080&&
        typeof window.performance?.now==='function'&&typeof ctx.getTransform==='function';
      if(budgetEligible&&this.renderBudgetState!==live) {
        this.renderBudget=budgetOwner.create();this.renderBudgetState=live;
      }
      if(budgetEligible){this.renderBudget.worldPixelCopyUsed=false;this.renderBudget.mirrorPixelCopyUsed=false;}
      // Native artwork quality is unconditional; the budget records cost only.
      const worldScale=1;
      const assets=B.PresentationAssets;
      const priorRasterDetail=assets?.setRasterDetail?.(ctx,worldScale)??1;
      const priorDecorationDetail=assets?.setDecorationDetail?.(ctx,worldScale)??1;
      const renderStarted=budgetEligible?window.performance.now():0;
      const finishRender=()=>{
        if(directGpu&&B.CacheRoadGPU.present(frameContext)!==true) {
          this.gpuRecoveryPainting=true;
          try {B.CacheRoadGPU.withNativeFallback(()=>this.draw(frameContext));}
          finally {this.gpuRecoveryPainting=false;}
        }
        assets?.setRasterDetail?.(frameContext,priorRasterDetail);
        assets?.setDecorationDetail?.(frameContext,priorDecorationDetail);
        if(budgetEligible) {
        this.renderBudget.drawnScale=worldScale;
        budgetOwner.observe(this.renderBudget,window.performance.now()-renderStarted,
          {paused:!!window.isPaused,frameIntervalMs:this.renderFrameIntervalMs});
      }};
      const combatPose=s.combat?B.CacheRoadCombat.pose(s.combat,{progress,lanePos:s.lanePos,
        adrenaline:s.adrenaline?.value||0,
        syncCount:new Set(s.captures.map(part=>part.lane)).size}):null;
      const crosswalkPose=s.crosswalks?B.CacheRoadCrosswalks.pose(s.crosswalks,{progress}):null;
      const heightSample=LANDSCAPE.createFrameHeightSampler?.()||LANDSCAPE.height;
      const section = s.musicBar < 4 ? 0 : Math.min(3, Math.floor((s.musicBar - 4) / 24));
      const names = ['RAINLINE', 'SERVICE LOOP', 'MIRROR VIADUCT', 'DISTRIBUTION CAUSEWAY'];
      const skyBottoms = ['#9b4f74', '#dc805b', '#d87891', '#86a89d'];
      const reduced = !!B.Preferences?.values?.reducedMotion;
      const horizon = ROAD_HORIZON, bottom = ROAD_BOTTOM;
      // A camera follows the tangent of a world-space road centerline. The
      // far road bends toward its upcoming path while the car stays centered.
      const path=roadPath, heading=roadHeading;
      const eyePath=path(progress),eyeHeading=heading(progress);
      const centerCache=new Map();
      const center = t => {
        if(centerCache.has(t))return centerCache.get(t);
        const ahead=(1-t)*520;
        const x=960+(path(progress+ahead)-eyePath-ahead*eyeHeading)*.95;
        centerCache.set(t,x);return x;
      };
      const half = t => 82 + 534 * t;
      const laneEdge = (lane, t) => center(t) - half(t) + lane * half(t) / 2;
      const laneX = (lane, t) => laneEdge(lane, t) + half(t) / 4;
      const roadY = t => horizon + t * t * (bottom - horizon);
      const strikeY=roadY(STRIKE_DEPTH);
      // Passing the contact plane does not remove a world object. Continue
      // the same projection below the frame; broad distance guards keep its
      // scale finite, and whole-sprite bounds decide when rendering ends.
      const frontNear = -360, bankNearDistance = -420, bankMaxDepth = 2.2;
      const depth = d => clamp(1 - (d + 80) / 520, 0, 1.65);
      const inFrame = (x,y,width,height,anchor=.5,padding=0) =>
        x+width*(1-anchor)+padding>=worldViewport.left && x-width*anchor-padding<=worldViewport.right &&
        y+padding>=worldViewport.top && y-height-padding<=worldViewport.bottom;
      const quadInFrame = points =>
        Math.max(...points.map(point=>point[0]))>=worldViewport.left &&
        Math.min(...points.map(point=>point[0]))<=worldViewport.right &&
        Math.max(...points.map(point=>point[1]))>=worldViewport.top &&
        Math.min(...points.map(point=>point[1]))<=worldViewport.bottom;
      const lightInFrame = (key,args) => lampLightGeometry(key,args).some(light=>{
        const radius=Math.max(light.lensRadius,light.poolRadius);
        const top=Math.min(light.y,light.groundY-light.poolRadius*.24);
        const foot=Math.max(light.y,light.groundY+light.poolRadius*.24);
        return inFrame(light.x,foot,radius*2,foot-top);
      });
      // The bank has one invertible world projection for ground, streets,
      // sites and people. Its shallow far slope lets a site clear the horizon
      // before the near slope accelerates it past the player. d=0 retains
      // the established sidewalk/road contact depth (525/620).
      const bankNear=525/620,bankReach=1200,bankCurve=3.1;
      const sideDepth = d => bankNear*Math.pow(
        Math.max(0,(bankReach-d)/bankReach),bankCurve);
      const bankAddress = t => progress+bankReach*(1-
        Math.pow(Math.max(0,t)/bankNear,1/bankCurve));
      // Painted blocks contain foreground facades inside one large card.
      // Moderate their near magnification without moving their world foot.
      const cardScale = t => t/(1+.20*t);
      // The road, curb, lot and lamp offsets all converge at the vanishing
      // point, and the same projection continues beyond the bottom of frame.
      const roadsideX = (side,t,base,growth) =>
        center(t)+side*(half(t)+(base+growth*t)*(.1+.9*t));
      // One ground contact per object. The old renderer pushed a painting
      // below a second, much lower crest, then progressively cut its legs
      // and foundations off. Perspective now reveals the complete silhouette.
      const cityCrestY = x => horizon+8+18*Math.pow(
        Math.abs(x-center(0))/960,2)+
        6*Math.sin(x/260+progress/1700)+2*Math.sin(x/93+progress/1100);
      const terrainAt = (side,t,x) => {
        const at=bankAddress(t);
        const radial=(side*(x-center(t))-half(t))/(.1+.9*t)-190*t;
        return roadY(t)+t*(heightSample?.(side,at,
          Math.max(220,radial))??24);
      };
      const areaFoot=(side,t,x,groundFoot)=>groundFoot;
      // Atlas contact crops supply the painted foundation. Do not add a
      // screen-space mask across independent feet, wheels or parcel fronts.
      const clipRoadside = (t,draw) => {ctx.save();draw();ctx.restore();};
      // Paint one authored surface tile in the world plane. Its two sides
      // use the same curve and depth as the curb, parcel and passing lamps;
      // clipping the projected quad keeps the texture inside its own slab.
      const drawSurfacePanel = (key,side,far,near,inner,outer,sourceRect=null) => {
        const point=(t,edge) => ({
          x:roadsideX(side,t,...edge.slice(0,2)),
          y:terrainAt(side,t,roadsideX(side,t,...edge.slice(0,2)))+
            (edge[3]?0:(edge[2]-24)*t)
        });
        const fi=point(far,inner),fo=point(far,outer);
        const ni=point(near,inner),no=point(near,outer);
        // Fully offscreen slabs do not need a texture transform or clip.
        if(!quadInFrame([[fi.x,fi.y],[fo.x,fo.y],[ni.x,ni.y],[no.x,no.y]]))return;
        // At reduced world detail, a texture slab thinner than one sample
        // contributes no readable material. Its opaque ground remains painted.
        // Keep every native-detail slab and all visible near/foreground pieces.
        if(worldScale<1&&(Math.max(fi.y,fo.y,ni.y,no.y)-
          Math.min(fi.y,fo.y,ni.y,no.y))*worldScale*camera.zoom<.75)return;
        const farWidth=Math.hypot(fo.x-fi.x,fo.y-fi.y);
        const nearWidth=Math.hypot(no.x-ni.x,no.y-ni.y);
        ctx.save();ctx.beginPath();ctx.moveTo(fi.x,fi.y);
        ctx.lineTo(ni.x,ni.y);ctx.lineTo(no.x,no.y);
        ctx.lineTo(fo.x,fo.y);ctx.closePath();ctx.clip();
        const reach=Math.max(1.08,Math.min(3,nearWidth/farWidth+.08));
        ctx.transform((fo.x-fi.x)*reach/256,(fo.y-fi.y)*reach/256,
          (ni.x-fi.x)/256,(ni.y-fi.y)/256,fi.x,fi.y);
        B.PresentationAssets?.draw?.(key,ctx,{x:0,y:0,width:256,height:256,
          sourceRect});
        ctx.restore();
      };
      ctx.save();ctx.setTransform(1,0,0,1,0,0);
      // Keep native foreground blends inside the display as well as the
      // sampled background. Foreground exits retain their complete projection.
      ctx.beginPath();ctx.rect(0,0,1920,1080);ctx.clip();
      // A sampled frame replaces the entire display. Discard its previous
      // full-size painting before the small opaque backing is built.
      if(worldScale<1)ctx.clearRect(0,0,1920,1080);
      ctx.setTransform(worldScale,0,0,worldScale,0,0);
      // Native artwork retains the shared renderer's high-quality sampling.
      // Only the legacy reduced backing uses the cheaper bilinear sampler.
      // The enclosing save/restore keeps the caller's sampling setting intact.
      if(worldScale<1)ctx.imageSmoothingQuality='low';
      if(worldScale<1) {
        // Keep every world blend/filter inside the sampled source footprint.
        // A scaled transform alone still rasterizes off-crop paint and leaves
        // full-display blend surfaces active until the world is expanded.
        ctx.save();ctx.beginPath();ctx.rect(0,0,1920,1080);ctx.clip();
      }
      // One transform moves the existing world. The dashboard, timing cues
      // and rearview are drawn after it is restored, with no second scene pass.
      ctx.save();
      const intro = this.introMs;
      const camera=speedCamera(s,{reduced,intro,playing:this.status==='playing',
        outroMs:cinema?.kind==='outro'?this.outroMs:null});
      const worldViewport=cameraViewport(camera);
      const cameraWarnings=[];
      ctx.translate(960+camera.x,CAMERA_PIVOT_Y+camera.y);ctx.rotate(camera.roll);
      ctx.scale(camera.zoom,camera.zoom);ctx.translate(-960,-CAMERA_PIVOT_Y);
      ctx.globalAlpha=1;
      let sampledWorld=worldScale<1;
      const expandSampledWorld=()=>{
        assets?.setRasterDetail?.(ctx,1);
        if(!sampledWorld)return;
        // Preserve the world paint state while lifting its backing clip.
        // Resume the same camera at native resolution for interactive paint.
        const transform=ctx.getTransform(),styleKeys=['fillStyle','strokeStyle',
          'globalAlpha','globalCompositeOperation','lineWidth','lineCap','lineJoin',
          'miterLimit','font','textAlign','textBaseline','shadowColor','shadowBlur',
          'shadowOffsetX','shadowOffsetY','imageSmoothingEnabled','imageSmoothingQuality','filter'];
        const styles=styleKeys.map(key=>ctx[key]),dash=ctx.getLineDash();
        ctx.restore(); // sampled world camera
        ctx.restore(); // sampled backing clip
        ctx.save();ctx.setTransform(1,0,0,1,0,0);
        ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.filter='none';
        ctx.imageSmoothingEnabled=false;
        this.renderBudget.worldPixelCopyUsed=copySampledWorldPixels(ctx,1920*worldScale,1080*worldScale,this.renderBudget);
        ctx.restore();ctx.setTransform(1,0,0,1,0,0);ctx.save();
        ctx.setTransform(transform.a/worldScale,transform.b/worldScale,
          transform.c/worldScale,transform.d/worldScale,transform.e/worldScale,transform.f/worldScale);
        styleKeys.forEach((key,index)=>{ctx[key]=styles[index];});ctx.setLineDash(dash);
        sampledWorld=false;
      };
      const nativeSceneryContext=ctx,gpuSceneryOptions={kind:'forward',defer:directGpu};
      const gpuSceneryContext=beginGpuScene(nativeSceneryContext,gpuSceneryOptions);
      if(gpuSceneryContext)ctx=gpuSceneryContext;
      const beat = reduced ? 0 : s.musicBeatFloat || 0;
      const stack = Math.min(4,s.captures?.length || 0);
      const beatPulse = reduced || window.BARCODE_RENDER_QUALITY?.flashes===false ? 0 :
        Math.pow(1-((beat%1+1)%1),5);
      const energy = stack/4 + (s.boostMs ? .3 : 0) + beatPulse*.27;
      const hue = (186 + section*65 + Math.sin(beat*.31)*55 + energy*37 + 360)%360;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon + 70);
      sky.addColorStop(0, `hsl(${hue},48%,${9+energy*3}%)`);
      sky.addColorStop(.48, `hsl(${(hue+42)%360},58%,${14+energy*5}%)`);
      sky.addColorStop(1, skyBottoms[section]);
      // The later opaque land replaces sky below this conservative fringe.
      // Keep 16 device pixels across its antialiased, transformed boundary.
      const skyPaintBottom=Math.min(worldViewport.bottom,horizon+16/(worldScale*camera.zoom));
      ctx.fillStyle = sky; ctx.fillRect(worldViewport.left,worldViewport.top,
        worldViewport.right-worldViewport.left,skyPaintBottom-worldViewport.top);
      ctx.fillStyle = '#122236'; ctx.fillRect(0,horizon,1920,Math.max(0,skyPaintBottom-horizon));
      // Wide veils move with the shared beat and the number of parts playing.
      // Reduced Motion holds their geometry in place.
      ctx.save();
      ctx.beginPath();ctx.rect(worldViewport.left-32,worldViewport.top-32,
        worldViewport.right-worldViewport.left+64,skyPaintBottom-worldViewport.top+32);ctx.clip();
      ctx.globalCompositeOperation='screen';
      for (let k=0;k<4;k++) {
        const cx=230+k*490+Math.sin(beat*(.18+k*.037)+k*1.8)*180;
        const cy=80+k%2*105+Math.cos(beat*.29+k*2)*28;
        const radius=290+k*45;
        const wash=ctx.createRadialGradient(cx,cy,20,cx,cy,radius);
        wash.addColorStop(0,`hsla(${(hue+64+k*45)%360},90%,60%,${.23+energy*.14})`);
        wash.addColorStop(.55,`hsla(${(hue+22+k*36)%360},72%,40%,.075)`);
        wash.addColorStop(1,'#00000000');
        ctx.fillStyle=wash; ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);
        for (let ribbon=0;ribbon<3;ribbon++) {
          ctx.strokeStyle=`hsla(${(hue+k*41)%360},88%,72%,${(.07+energy*.026)/(ribbon+1)})`;
          ctx.lineWidth=45+ribbon*42;
          ctx.beginPath(); ctx.moveTo(cx-radius,cy+40+ribbon*21);
          ctx.bezierCurveTo(cx-120,cy-85-ribbon*7,cx+80,cy+60+ribbon*12,
            cx+radius,cy-40+ribbon*13); ctx.stroke();
        }
      }
      for(let band=0;band<3;band++) {
        const wave=beat*(.25+band*.05)+band*2.1;
        const y=167+band*35+Math.sin(wave)*25;
        const glow=ctx.createLinearGradient(0,y-35,0,y+95);
        glow.addColorStop(0,'#00000000');
        glow.addColorStop(.42,`hsla(${(hue+band*67)%360},90%,65%,${.22+energy*.14})`);
        glow.addColorStop(1,'#00000000');
        ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(-90,y+17);
        ctx.bezierCurveTo(310,y-94+Math.sin(wave+1)*45,
          510,y+40+Math.cos(wave+2)*50,890,y-12);
        ctx.bezierCurveTo(1200,y-88+Math.sin(wave+3)*38,
          1510,y+50+Math.cos(wave+1)*42,2010,y-45);
        ctx.lineTo(2010,y+70);
        ctx.bezierCurveTo(1490,y+125,1150,y+8,890,y+87);
        ctx.bezierCurveTo(580,y+137,290,y+25,-90,y+118);
        ctx.closePath();ctx.fill();
      }
      ctx.restore();
      // One opaque landscape continues beneath every roadside location.
      const land=ctx.createLinearGradient(0,horizon,0,bottom);
      land.addColorStop(0,'#263b43');land.addColorStop(1,'#293f43');
      ctx.fillStyle=land;ctx.fillRect(worldViewport.left,horizon,
        worldViewport.right-worldViewport.left,Math.max(bottom,worldViewport.bottom)-horizon);
      // The three city paintings share the road's world path. All begin at
      // the center of their wider-than-screen source. Near architecture
      // tracks turns most, while the close frontage rises from completely
      // below the skyline lip to a clear silhouette by the end of the run.
      const startBearing=path(520)-path(0)-520*heading(0);
      const currentBearing=path(progress+520)-eyePath-520*eyeHeading;
      const bearing=clamp((eyePath-path(0))*.7+
        (eyeHeading-heading(0))*160+
        (currentBearing-startBearing)*.62,-330,330);
      const cityDistance=clamp(progress/END,0,1);
      const cityApproach=cityDistance*cityDistance*(3-2*cityDistance);
      ctx.save();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(1920,0);
      for(let x=1920;x>=0;x-=30)ctx.lineTo(x,cityCrestY(x));
      ctx.closePath();ctx.clip();
      const cityLayers=[
        // key, width, height, foot, opacity, horizontal parallax
        // Raise the roofline by scaling ABOUT the grounded foot. Lifting
        // the whole bitmap exposes its bottom edge as a floating city band.
        ['cacheDistantCity',2860,880,520,.53,.18],
        ['cacheOutskirts',2680*840/760,840,540,.68,.48],
        ['cacheMidCity',2800*530/450,530,825-405*cityApproach,.88,.90]
      ];
      for(const [key,width,height,foot,opacity,parallax] of cityLayers) {
        ctx.globalAlpha=opacity;
        B.PresentationAssets?.draw?.(key,ctx,{
          x:(1920-width)/2-bearing*parallax,y:foot,
          width,height });
      }
      ctx.restore();
      // Level 1's animated ships cross above this road at different depths
      // and bank angles. They never enter the collision system.
      for (let i=0;i<5;i++) {
        const forward=i%2===0, model=i%3===0?'cacheFly1':'cacheFly3';
        const travel=(reduced?0:progress)*(forward?.22:-.15);
        const x=((i*511+travel+260)%2360+2360)%2360-220;
        const y=202+(i%3)*38+(reduced?0:Math.sin(progress*.013+i*2.4)*7);
        const width=73+(i%3)*15, height=width*(model==='cacheFly1'?.26:.30);
        const angle=(forward?-.055:.075)+(reduced?0:Math.sin(progress*.008+i)*.025);
        const frame=Math.floor((reduced?0:(s.elapsedMs||0))/40+i*27)%(model==='cacheFly1'?81:122);
        ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
        ctx.globalAlpha=.58+(i%3)*.08;
        B.PresentationAssets?.draw?.(model,ctx,{
          x:0,y:0,width,height,frame,
          // The pink ship is painted nose-right; the gray ship is nose-left.
          flip:model==='cacheFly1'?!forward:forward });
        ctx.restore();
      }
      // The sampled ground below is the single material pass for both
      // banks. Its strips cover the contact points of older cards.
      ctx.save();ctx.beginPath();
      for(let x=0;x<=1920;x+=20) {
        if(x===0)ctx.moveTo(x,cityCrestY(x));
        else ctx.lineTo(x,cityCrestY(x));
      }
      ctx.strokeStyle='#102a34';ctx.lineWidth=6;ctx.stroke();
      ctx.restore();
      // Neighboring strips sample adjacent rows of one world-fixed material.
      const grainPeriod=624,grainTop=32,grainHeight=823;
      // The shared local-street material is 1254 square; a 64-pixel strip remains
      // inside its source row when the address wraps.
      const localStreetPeriod=1254-64;
      // Paint sampled world strips far to near. Each opaque nearer strip
      // hides the foot of an older card and the road beyond its local rise.
      // A card has a fixed world address: terrain, not alpha, reveals it.
      const streetPoint=(side,node,atOffset=0,radialOffset=0)=>{
        const t=sideDepth(node.at+atOffset-progress);
        const x=roadsideX(side,t,node.radial+radialOffset,190);
        return [x,terrainAt(side,t,x)+3*t];
      };
      const paintProjectedStreet=(corners,row,key='cacheLocalStreet',alpha=.95)=>{
        if(!quadInFrame(corners))return;
        const [a,b,c,d]=corners;
        // A single affine image spans a parallelogram, while a road recedes
        // as a trapezoid. Two mapped triangles cover its exact four corners.
        const paintHalf=(path,matrix)=>{
          ctx.save();ctx.beginPath();ctx.moveTo(...a);
          for(const corner of path)ctx.lineTo(...corner);
          ctx.closePath();ctx.clip();ctx.globalAlpha=alpha;
          ctx.transform(...matrix,a[0],a[1]);
          B.PresentationAssets?.draw?.(key,ctx,{x:0,y:0,
            width:256,height:256,
            sourceRect:key==='cacheLocalStreet'?[0,row,256,64]:[0,0,256,64]});
          ctx.restore();
        };
        paintHalf([b,c],[(b[0]-a[0])/256,(b[1]-a[1])/256,
          (c[0]-b[0])/256,(c[1]-b[1])/256]);
        paintHalf([c,d],[(c[0]-d[0])/256,(c[1]-d[1])/256,
          (d[0]-a[0])/256,(d[1]-a[1])/256]);
      };
      const paintLocalStreet=part=>{
        const {side,a,b,halfWidth}=part;
        const along=b.at-a.at,across=(b.radial-a.radial)*.5;
        const len=Math.hypot(along,across)||1;
        const atOff=-across/len*halfWidth;
        const radialOff=along/len*halfWidth*2;
        const left=streetPoint(side,a,atOff,radialOff);
        const right=streetPoint(side,a,-atOff,-radialOff);
        const endRight=streetPoint(side,b,-atOff,-radialOff);
        const endLeft=streetPoint(side,b,atOff,radialOff);
        if(!quadInFrame([left,right,endRight,endLeft]))return;
        ctx.save();ctx.globalAlpha=.96;
        polygon(ctx,[left,right,endRight,endLeft],'#17242a');
        // An affine map of the whole tapered quad leaves an uncovered
        // triangle. Split along the diagonal; both triangles use the same
        // source address, so the moving road never shows a flat wedge.
        const row=((Math.floor(a.at*2)%localStreetPeriod)+
          localStreetPeriod)%localStreetPeriod;
        paintProjectedStreet([left,right,endRight,endLeft],row);
        // Decals are mapped to the exact graph street quad. A gap never
        // gains a painted road unless the road graph actually owns it.
        const decal=part.edgeIndex===0&&part.segment===0?
          'cacheDecalCrosswalk':
          part.edgeIndex===0&&part.segment===1?'cacheDecalStopLine':
          part.edgeIndex===1&&part.segment===0?'cacheDecalDrainage':
          part.edgeIndex===1&&part.segment===part.segments-1?
            (part.family==='workshop'||part.family==='transit'?
              'cacheDecalLoadingBay':'cacheDecalServiceStencil'):
          part.edgeIndex===1&&part.segment===2&&
            (part.family==='data'||part.family==='market')?
              'cacheDecalWetRepairPatch':null;
        if(decal)paintProjectedStreet([left,right,endRight,endLeft],0,decal,.76);
        ctx.globalAlpha=.42;ctx.strokeStyle='#829a91';
        ctx.lineWidth=.7+.7*sideDepth(part.at-progress);
        for(const line of [[left,endLeft],[right,endRight]]) {
          ctx.beginPath();ctx.moveTo(...line[0]);ctx.lineTo(...line[1]);ctx.stroke();
        }
        ctx.restore();
      };
      // Parking is a world-addressed patch of the same rolling bank.
      const drawProjectedLocale = (place,t) => {
        const side=place.side;
        const nearAt=place.at-67*place.size;
        const farAt=place.at+82*place.size;
        const n=clamp(sideDepth(nearAt-progress),.06,1.18);
        const f=clamp(sideDepth(farAt-progress),.06,1.18);
        const lotX=(tt,outer=false)=>roadsideX(side,tt,
          outer?605+place.setback:255,outer?345:215);
        const lotY=(tt,outer=false)=>terrainAt(side,tt,lotX(tt,outer));
        clipRoadside(t,()=>{
          ctx.globalAlpha=1;
          // Address-aligned 24-unit tiles preserve their texels when a lot
          // crosses the horizon, and share the street's affine quad mapping.
          for(let at=Math.floor(farAt/24)*24;at>nearAt-24;at-=24) {
            const ahead=Math.min(farAt,at+24),behind=Math.max(nearAt,at);
            if(ahead<=behind)continue;
            const far=clamp(sideDepth(ahead-progress),.06,1.18);
            const near=clamp(sideDepth(behind-progress),.06,1.18);
            if(near<=far)continue;
            const row=((Math.floor(at*2)%localStreetPeriod)+
              localStreetPeriod)%localStreetPeriod;
            paintProjectedStreet([
              [lotX(far),lotY(far)],
              [lotX(near),lotY(near)],
              [lotX(near,true),lotY(near,true)+17*near],
              [lotX(far,true),lotY(far,true)+17*far]
            ],row,'cacheLocalStreet',.82);
          }
          ctx.strokeStyle='#82969a8a';
          ctx.lineWidth=1+2*n;ctx.beginPath();
          ctx.moveTo(lotX(f),lotY(f));ctx.lineTo(lotX(n),lotY(n));ctx.stroke();
          for(const offset of [48,0,-48]) {
            const tt=sideDepth(place.at+offset-progress);
            if(tt<.08||tt>1.18)continue;
            ctx.strokeStyle='#9bb5b17d';ctx.lineWidth=1+3*tt;
            ctx.beginPath();ctx.moveTo(roadsideX(side,tt,350,250),lotY(tt)+4*tt);
            ctx.lineTo(lotX(tt,true),lotY(tt,true)+15*tt);ctx.stroke();
          }
          // Fence posts stop around the entrance instead of spanning the bay.
          for(const offset of [72,39,-38,-71]) {
            const tt=sideDepth(place.at+offset-progress);
            if(tt<.10||tt>bankMaxDepth)continue;
            const x=lotX(tt),y=lotY(tt),height=27*tt;
            if(!inFrame(x,y,6*tt,height+4*tt))continue;
            enqueue({kind:'parking-post',at:place.at+offset,side},y,()=>{
            ctx.save();
            ctx.strokeStyle='#859395';ctx.lineWidth=1+2*tt;
            ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-height);ctx.stroke();
            ctx.fillStyle='#d89968';ctx.fillRect(x-2*tt,y-height-2*tt,4*tt,3*tt);
            ctx.restore();
            });
          }
        },side);
        const signT=sideDepth(place.at+70-progress);
        if(signT>.22&&signT<bankMaxDepth&&
          inFrame(roadsideX(side,signT,265,220),lotY(signT),30*signT,77*signT))enqueue({kind:'parking-sign',at:place.at+70,side},lotY(signT),()=>clipRoadside(signT,()=>{
          const x=roadsideX(side,signT,265,220),y=lotY(signT);
          ctx.fillStyle='#172936';ctx.fillRect(x-2*signT,y-67*signT,4*signT,67*signT);
          ctx.fillStyle='#476c75';ctx.fillRect(x-15*signT,y-77*signT,30*signT,24*signT);
          ctx.fillStyle='#e8c692';ctx.font=`bold ${Math.max(7,19*signT)}px Oxanium`;
          ctx.fillText('P',x-5*signT,y-58*signT);
        },side));
      };
      const clusterArt={
        '-1':[['cacheGroundClusterL1',1903,826],
          ['cacheGroundClusterL2',1903,826],['cacheGroundClusterL3',1774,887]],
        '1':[['cacheGroundClusterR1',1898,829],
          ['cacheGroundClusterR2',1774,887],['cacheGroundClusterR3',1774,887]]
      };
      const visibleAreas=worldRange(SCENERY,progress+bankNearDistance,progress+864)
        .filter(area=>{
          const t=sideDepth(area.at-progress);
          return t>(area.kind==='parking'?.06:.025)&&
            t<bankMaxDepth;
        });
      // Ground clusters also have real world addresses. They take their
      // position in the same painter sequence as district and featured art.
      for(const side of [-1,1]) {
        const phase=side<0?41:105,spacing=440;
        for(let at=Math.floor((progress+850-phase)/spacing)*spacing+phase;
          at>progress+bankNearDistance;at-=spacing) {
          const t=sideDepth(at-progress);
          if(t<.025||t>bankMaxDepth||LANDSCAPE.owns(side,at,100))continue;
          if(SIDE_PLACES.some(place=>place.side===side &&
            place.kind!=='parking' && Math.abs(place.at-at)<145))continue;
          if(INFILL_SCENES.some(scene=>scene.side===side &&
            Math.abs(scene.at-at)<165))continue;
          if(SATELLITE_SCENES.some(scene=>scene.side===side &&
            Math.abs(scene.at-at)<145))continue;
          visibleAreas.push({at,side,index:Math.floor((at-phase)/spacing),kind:'cluster'});
        }
      }
      const worldPaint=[],lampPools=[];
      const enqueue=(area,foot,draw)=>worldPaint.push({area,foot,draw});
      const drawStreetLife = (scene, item, person=false,area) => {
        const position=pedestrianPosition(scene,item,s);
        const t=sideDepth(position.at-progress);
        if(t<(person?.09:.025)||t>bankMaxDepth)return;
        const [key,aspect,height]=person?PEDESTRIANS[item.id]:
          [item.key,...PROP_SHAPES[item.key]];
        const h=height*t*item.scale*(person?PERSON_SCALE:1);
        const width=h*(person?(pedestrianTravel(item,s,reduced)?.aspect||aspect):aspect);
        const x=roadsideX(scene.side,t,position.base,person?210:260);
        const foot=terrainAt(scene.side,t,x)+4*t;
        const args={x,y:foot,width,height:h,
          flip:person?position.flip:false,
          lampGround:lightX=>terrainAt(scene.side,t,lightX)+4*t};
        if(!inFrame(x,foot,width,h,.5,8*t)&&!lightInFrame(key,args))return;
        if(!person&&LAMP_LIGHTS[key])lampPools.push(()=>drawLampLight(ctx,key,args,'pool'));
        enqueue(area,foot,()=>clipRoadside(t,()=>{
          ctx.save();ctx.globalAlpha=1;
          ctx.fillStyle='#0d19218c';ctx.beginPath();
          ctx.ellipse(x,foot+2*t,Math.max(9,width*.33),Math.max(2,4*t),0,0,Math.PI*2);
          ctx.fill();
          drawStreetActor(ctx,item,key,args,s,reduced,person);
          ctx.restore();
        },scene.side));
      };
      for(const {scene,item} of streetRange(s,progress+bankNearDistance,progress+864)) {
        const position=pedestrianPosition(scene,item,s);
        visibleAreas.push({kind:'life',at:position.at,scene,item,
          radial:position.base});
      }
      // Wide building paintings extend forward of their nominal route
      // address. Sort by the actual projected front ground contact, never
      // by roof height or address alone. Transparent street mouths remain
      // transparent and naturally reveal actors behind them.
      const drawArea=area=>{
        const t=sideDepth(area.at-progress);
        if(area.kind==='life') {
          drawStreetLife(area.scene,area.item,area.item.id!==undefined,area);
        } else if(area.kind==='parking') {
          drawProjectedLocale(area.place,t);
        } else if(area.kind==='plate') {
          const {plate}=area;
          const [key,sourceW,sourceH,maxW,base,growth,
            contactBottom,contactAt,fit]=plate.art;
          const width=maxW*cardScale(t);
          const socketFraction=fit?.socketU===undefined?0:
            plate.side<0?1-fit.socketU:fit.socketU;
          const roadward=roadsideX(plate.side,t,base,growth)-
            plate.side*width*socketFraction;
          const x=roadward+plate.side*width*.5;
          if(x+width*.5<worldViewport.left||x-width*.5>worldViewport.right)return;
          const footU=plate.flip?1-fit?.footU:fit?.footU;
          const footX=fit?.footU===undefined?roadward:
            x-width*.5+width*footU;
          const height=width*(contactBottom||sourceH)/sourceW;
          const groundFoot=terrainAt(plate.side,t,footX)+
            (contactAt?(contactBottom-contactAt)*width/sourceW+6*t:22*t);
          const y=areaFoot(plate.side,t,footX,groundFoot,height);
          if(!inFrame(x,y,width,height))return;
          enqueue(area,y,()=>clipRoadside(t,()=>{
            B.PresentationAssets?.draw?.(key,ctx,{x,y,width,height,groundY:groundFoot,
              sourceRect:[0,0,sourceW,contactBottom||sourceH],flip:!!plate.flip});
            if(t>.20&&plate.tier==='front'&&plate.key==='open') {
              // The open painting includes a transparent street gap. Its
              // compensated bitmap edge can sit over the road; the column
              // belongs to the actual facade socket on the bank instead.
              const capX=roadsideX(plate.side,t,base,growth)+plate.side*13*t;
              B.PresentationAssets?.draw?.(plate.side<0?
                'cacheJoinLEndcap':'cacheJoinREndcap',ctx,{
                x:capX,y:terrainAt(plate.side,t,capX)+5*t,
                width:48*t,height:96*t });
            }
            if(t>.20)drawFacadeActivity(ctx,plate,x,y,width,height,s,reduced);
          },plate.side));
        } else if(area.kind==='cluster') {
          const {side,index}=area;
          const variants=clusterArt[String(side)];
          const [key,sourceW,sourceH]=variants[((index%3)+3)%3];
          const width=(1190+70*placeRandom(index*83+side*19))*cardScale(t);
          const x=roadsideX(side,t,
            580+80*placeRandom(index*79+side*23)+280*t,300);
          if(x+width*.5<worldViewport.left||x-width*.5>worldViewport.right)return;
          const height=width*sourceH/sourceW;
          const roadward=x-side*width*.5;
          const groundFoot=terrainAt(side,t,x)+60*t;
          const y=areaFoot(side,t,roadward,groundFoot,height);
          if(!inFrame(x,y,width,height))return;
          enqueue(area,y,()=>clipRoadside(t,()=>{
            ctx.globalAlpha=1;
            B.PresentationAssets?.draw?.(key,ctx,{
              x,y,width,height,groundY:groundFoot,flip:false });
          },side));
        } else if(area.kind==='satellite') {
          const {scene}=area,side=scene.side;
          const [key,sourceW,sourceH,maxW]=scene.art;
          const width=Math.min(720,maxW)*cardScale(t);
          const sidewalkEdge=roadsideX(side,t,220,190);
          const x=sidewalkEdge+side*(width*.5+29*t);
          if(x+width*.5<worldViewport.left||x-width*.5>worldViewport.right)return;
          const height=width*sourceH/sourceW;
          const fit=B.CacheRoadLandscape.SOURCE_FITS[key];
          const flip=B.CacheRoadLandscape.sourceFlip(key,side);
          const footU=flip?1-fit.footU:fit.footU;
          const footX=x-width*.5+width*footU;
          const groundFoot=fit.contactAt===undefined?terrainAt(side,t,x)+9*t:
            terrainAt(side,t,footX)+(sourceH-fit.contactAt)*width/sourceW+6*t;
          const y=areaFoot(side,t,sidewalkEdge+side*29*t,groundFoot,height);
          if(!inFrame(x,y,width,height))return;
          enqueue(area,y,()=>clipRoadside(t,()=>B.PresentationAssets?.draw?.(key,ctx,{
            x,y,width,height,groundY:groundFoot,flip }),side));
        } else {
          const {place}=area,side=place.side;
          const [key,sourceW,sourceH,maxW]=
            (place.variant&&SIDE_VARIANTS[place.variant].art)||PLACE_ART[place.kind];
          const width=maxW*cardScale(t)*place.size;
          const height=width*sourceH/sourceW;
          const sidewalkEdge=roadsideX(side,t,220,190);
          const x=sidewalkEdge+side*(width*.5+(26+place.setback)*t);
          const roadward=sidewalkEdge+side*(26+place.setback)*t;
          const groundFoot=terrainAt(side,t,x);
          const y=areaFoot(side,t,roadward,groundFoot,height);
          if(!inFrame(x,y,width,height))return;
          enqueue(area,y,()=>clipRoadside(t,()=>B.PresentationAssets?.draw?.(key,ctx,{
            x,y,width,height,groundY:groundFoot,flip:place.variant?
              !!SIDE_VARIANTS[place.variant].flip:placeFacesRoad(place.kind,side) }),
            side));
        }
      };
      const visibleStreetParts=(LANDSCAPE.streetPartRange?.(bankAddress(1.2),bankAddress(.09))||LANDSCAPE.streetParts||[]).filter(part=>{
        const t=sideDepth(part.at-progress);
        return t>.09&&t<1.2;
      });
      const visibleCourts=(LANDSCAPE.courtRange?.(bankAddress(1.17),bankAddress(.10))||
        (LANDSCAPE.streets||[]).map(street=>({side:street.side,at:street.nodes[2].at,family:street.family}))).filter(court=>{
        const t=sideDepth(court.at-progress);
        return t>.10&&t<1.17;
      });
      const groundCrest=Array.from({length:65},(_,i)=>[i*30,cityCrestY(i*30)]);
      const lowestCrest=Math.min(...groundCrest.map(point=>point[1]));
      const highestCrest=Math.max(...groundCrest.map(point=>point[1]));
      // Every terrain slab uses the same crest mask. Build its native path
      // once per frame; rebuilding 65 vertices for each slab repeats costly
      // host Canvas calls. The fallback retains the existing command path.
      const groundClip=ctx.createPath?.()||
        (typeof window.Path2D==='function'?new window.Path2D():null);
      if(groundClip) {
        groundClip.moveTo(...groundCrest[0]);
        for(let i=1;i<groundCrest.length;i++)groundClip.lineTo(...groundCrest[i]);
        groundClip.lineTo(1920,bottom);groundClip.lineTo(0,bottom);groundClip.closePath();
      }
      // Eight slabs divide the grain repeat exactly, so every world-aligned
      // crop stays in its source band. Wider slabs cut the clipped texture
      // draws that saturated the road's first frame.
      const layerStep=grainPeriod/8;
      for(let at=Math.floor((progress+864)/layerStep)*layerStep;
        at>progress-200;at-=layerStep) {
        const far=sideDepth(at+layerStep-progress);
        const near=sideDepth(at-progress);
        if(far<.018||near>1.35)continue;
        // Terrain height is bounded by 65 world units. Far slabs wholly
        // above the visible bank need no texture or full-screen clip mask.
        // Buildings in those slabs still draw: their roofs can be visible.
        if(roadY(near)+65*near>=lowestCrest) {
          // A slab wholly below every crest vertex only needs the mask's
          // rectangular side/bottom bounds. Its own quad keeps all texture
          // pixels below the horizon, including a two-device-pixel AA margin.
          const crestPadding=2/(worldScale*camera.zoom);
          const terrainBelowCrest=[-1,1].every(side=>[far,near].every(t=>
            [[220,190],[2500,440]].every(([base,growth])=>{
              const x=roadsideX(side,t,base,growth);
              return terrainAt(side,t,x)>highestCrest+crestPadding;
            })));
          ctx.save();
          if(terrainBelowCrest) {
            ctx.beginPath();ctx.rect(0,0,1920,bottom);ctx.clip();
          } else if(groundClip)ctx.clip(groundClip);
          else {
            ctx.beginPath();ctx.moveTo(...groundCrest[0]);
            for(let i=1;i<groundCrest.length;i++)ctx.lineTo(...groundCrest[i]);
            ctx.lineTo(1920,bottom);ctx.lineTo(0,bottom);ctx.closePath();ctx.clip();
          }
          for(const side of [-1,1]) {
          ctx.globalAlpha=1;
          drawSurfacePanel('cacheOuterGround',side,far,near,
            [220,190,24,0],[2500,440,40,1]);
          const row=((at%grainPeriod)+grainPeriod)%grainPeriod;
          const sourceY=grainTop+grainHeight*(1-(row+layerStep)/grainPeriod);
          ctx.globalAlpha=.44;
          drawSurfacePanel('cacheRollingGrain',side,far,near,
            [220,190,24,0],[2500,440,40,1],
            [side<0?0:265,sourceY,1509,
              grainHeight*layerStep/grainPeriod]);
          }
          ctx.restore();
        }
        for(const court of visibleCourts) {
          if(court.at<at||court.at>=at+layerStep)continue;
          const corners=[
            streetPoint(court.side,{at:court.at+36,radial:575}),
            streetPoint(court.side,{at:court.at+36,radial:700}),
            streetPoint(court.side,{at:court.at-36,radial:700}),
            streetPoint(court.side,{at:court.at-36,radial:575})
          ];
          if(!quadInFrame(corners))continue;
          ctx.save();ctx.globalAlpha=.88;
          polygon(ctx,corners,'#30414a');
          const material=court.family==='homes'||court.family==='transit'?
            'cacheResidentialPaving':court.family==='greenhouse'?
            'cachePlantedGravelCourt':
            court.family==='workshop'||court.family==='data'?
            'cacheServiceCourtPaving':'cacheLocalStreet';
          // The court stays within its four projected corners and shares
          // the same depth/terrain sample as the connected branch.
          paintProjectedStreet(corners,
            ((Math.floor(court.at*2)%localStreetPeriod)+localStreetPeriod)%localStreetPeriod,
            material,.84);
          ctx.globalAlpha=.44;ctx.strokeStyle='#82949b';
          ctx.lineWidth=1.3;
          ctx.beginPath();ctx.moveTo(...corners[0]);
          for(let i=1;i<corners.length;i++)ctx.lineTo(...corners[i]);
          ctx.closePath();ctx.stroke();
          ctx.restore();
        }
        for(const part of visibleStreetParts)
          if(part.at>=at&&part.at<at+layerStep)paintLocalStreet(part);
      }
      // Side decks track the same bend as the lane geometry. Real parapet and
      // pylon art is placed at world distances below, after the asphalt.
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#263749';
        ctx.beginPath();
        for (let i=0; i<=28; i++) {
          const t=i/28;
          const xx=roadsideX(side,t,73,50);
          if (!i) ctx.moveTo(xx,roadY(t)); else ctx.lineTo(xx,roadY(t));
        }
        for (let i=28; i>=0; i--) {
          const t=i/28;
          ctx.lineTo(roadsideX(side,t,220,190),roadY(t)+24*t);
        }
        ctx.closePath(); ctx.fill();
      }
      for(let at=Math.floor((progress+520)/55)*55;at>progress-170;at-=55) {
        const far=sideDepth(at+55-progress),near=sideDepth(at-progress);
        if(far<.11||near>1.18)continue;
        for(const side of [-1,1])
          drawSurfacePanel('cacheSidewalk',side,far,near,
            [73,50,0,0],[220,190,24,0]);
      }
      // World-fixed joints and drainage marks turn the decks into sidewalks
      // that advance with the road instead of a flat colored wedge.
      for(let at=Math.floor((progress+435)/55)*55;at>progress-170;at-=55) {
        const t=sideDepth(at-progress); if(t<.16||t>1.17)continue;
        for(const side of [-1,1]) {
          const inner=roadsideX(side,t,73,50);
          const outer=roadsideX(side,t,220,190);
          const yy=roadY(t);
          ctx.strokeStyle='#bac8c16b'; ctx.lineWidth=1+2*t;
          ctx.beginPath(); ctx.moveTo(inner,yy); ctx.lineTo(outer,yy+24*t);ctx.stroke();
          ctx.fillStyle='#0a1523a8';
          ctx.fillRect(inner+side*(26+22*t)-(side<0?26*t:0),yy+2*t,26*t,4*t);
          // Wet service-lane dashes belong to the same 55-unit tile as the
          // slab joint; both expand and pass at the road's exact speed.
          if(Math.floor(at/55)%2===0) {
            const next=sideDepth(at+28-progress), far=clamp(next,.16,1.17);
            ctx.strokeStyle='#abc0bd70';ctx.lineWidth=1+3*t;
            ctx.beginPath();ctx.moveTo(roadsideX(side,t,150,114),yy+10*t);
            ctx.lineTo(roadsideX(side,far,150,114),roadY(far)+10*far);ctx.stroke();
          }
        }
      }
      // Cut a street throat through the sidewalk only at graph sockets.
      // Its corners, paving and rail opening all share the same address.
      for(const street of (LANDSCAPE.streetRange?.(bankAddress(1.13),bankAddress(.16))||LANDSCAPE.streets)) {
        const t=sideDepth(street.at-progress);
        if(t<.16||t>1.13)continue;
        const nearAt=street.at-street.halfWidth;
        const farAt=street.at+street.halfWidth;
        const side=street.side;
        const foot=(at,base,growth)=>{
          const tt=sideDepth(at-progress),x=roadsideX(side,tt,base,growth);
          return [x,roadY(tt)+(base>73?24*tt:0)];
        };
        const a=foot(farAt,73,50),b=foot(nearAt,73,50);
        const c=foot(nearAt,255,190),d=foot(farAt,255,190);
        clipRoadside(t,()=>{
          polygon(ctx,[a,b,c,d],'#172732');
          const row=((Math.floor(street.at*2)%localStreetPeriod)+
            localStreetPeriod)%localStreetPeriod;
          paintProjectedStreet([a,b,c,d],row);
          ctx.strokeStyle='#8ba4aa';ctx.lineWidth=1.5+2.2*t;
          for(const edge of [[a,d],[b,c]]) {
            ctx.beginPath();ctx.moveTo(...edge[0]);ctx.lineTo(...edge[1]);ctx.stroke();
          }
          // Sidewalk return edges emphasize the two real corners without
          // painting a wall across the entrance.
          ctx.strokeStyle='#a8b5b4';ctx.lineWidth=2+3*t;
          for(const corner of [a,b]){
            const outer=foot(corner===a?farAt:nearAt,275,200);
            ctx.beginPath();ctx.moveTo(...corner);ctx.lineTo(...outer);ctx.stroke();
          }
          // The transparent center of these cutouts leaves the graph road
          // clear. Their pavers and bevels turn the existing sidewalk into
          // its two measured 38-unit street corners.
          const p0=foot(nearAt-9,73,50);
          const p1=foot(farAt+9,73,50);
          const p2=foot(nearAt-9,275,200);
          const p3=foot(farAt+9,275,200);
          ctx.save();ctx.beginPath();ctx.moveTo(...p0);
          for(const p of [p1,p3,p2])ctx.lineTo(...p);
          ctx.closePath();ctx.clip();
          ctx.transform((p1[0]-p0[0])/256,(p1[1]-p0[1])/256,
            (p2[0]-p0[0])/256,(p2[1]-p0[1])/256,p0[0],p0[1]);
          for(const key of [side<0?'cacheJoinLTurn':'cacheJoinRTurn',
            side<0?'cacheJoinLCurb':'cacheJoinRCurb'])
            B.PresentationAssets?.draw?.(key,ctx,{x:0,y:0,
              width:256,height:256});
          ctx.restore();
        },side);
      }
      for(const area of visibleAreas)drawArea(area);
      // Road shoulders and the paint share a single curved road projection.
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = i / 24, x = center(t) + side * (half(t) + 26 + 39 * t);
          if (!i) ctx.moveTo(x, roadY(t)); else ctx.lineTo(x, roadY(t));
        }
        for (let i = 24; i >= 0; i--) {
          const t = i / 24, x = center(t) + side * half(t);
          ctx.lineTo(x, roadY(t));
        }
        ctx.closePath(); ctx.fillStyle = '#44536a'; ctx.fill();
      }
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const t = i / 28;
        if (!i) ctx.moveTo(center(t) - half(t), roadY(t)); else ctx.lineTo(center(t) - half(t), roadY(t));
      }
      for (let i = 28; i >= 0; i--) { const t = i / 28; ctx.lineTo(center(t) + half(t), roadY(t)); }
      ctx.closePath(); ctx.fillStyle = '#171f2b'; ctx.fill();
      // Adjacent slices read adjacent texels from horizon to car. Advancing
      // progress decreases the source offset so a mark moves toward the car.
      // Blend the wrap over the last 108 pixels into the first 108 pixels.
      const roadTextureAlpha=ctx.globalAlpha;
      ctx.save(); ctx.clip();
      for (let i = 0; i < 28; i++) {
        let c=((-progress*.82+i*22)%616+616)%616, consumed=0;
        while (consumed<22) {
          const length=Math.min(22-consumed,616-c,c<508?508-c:22);
          const far=(i+consumed/22)/28, near=(i+(consumed+length)/22)/28;
          const mid=(far+near)/2, yy=roadY(far), endY=roadY(near);
          const args={ x:center(mid)-half(mid),y:yy,width:half(mid)*2,
            height:endY-yy+1,sourceRect:[0,108+c,2172,length] };
          const blend=c>=508 ? clamp((c+length/2-508)/108,0,1) : 0;
          ctx.globalAlpha=.27*(1-blend);
          B.PresentationAssets?.draw?.('cacheBlacktop',ctx,args);
          if (blend) {
            ctx.globalAlpha=.27*blend;
            B.PresentationAssets?.draw?.('cacheBlacktop',ctx,{
              ...args,sourceRect:[0,c-508,2172,length] });
          }
          consumed+=length; c=(c+length)%616;
        }
      }
      ctx.globalAlpha=roadTextureAlpha;
      const roadFog=ctx.createLinearGradient(0,horizon,0,horizon+170);
      roadFog.addColorStop(0,'#1c293b9e'); roadFog.addColorStop(1,'#1c293b00');
      // Asphalt and fog share this identical road mask and paint order.
      ctx.fillStyle=roadFog; ctx.fillRect(0,horizon,1920,170);
      ctx.restore();
      // Stretch adjacent wall segments between the same projected road points.
      // This makes one continuous side wall rather than floating sign panels.
      for(let at=Math.floor((progress+500)/62)*62;at>progress-150;at-=62) {
        const far=clamp(sideDepth(at+62-progress),.13,1.15);
        const near=clamp(sideDepth(at-progress),.13,1.15);
        if(near<=far)continue;
        const id=Math.abs(Math.floor(at/62));
        for(const side of [-1,1]) {
          // A 38-unit mouth may fall inside a 62-unit parapet tile. Remove
          // only the graph's street width, keeping the illustrated wall
          // intact right up to both sidewalk corners.
          const mouths=LANDSCAPE.streetMouthRange?.(at,at+62,side)||LANDSCAPE.streets.filter(street=>street.side===side &&
            at<street.at+street.halfWidth &&
            at+62>street.at-street.halfWidth);
          const fx=roadsideX(side,far,46,58);
          const nx=roadsideX(side,near,46,58);
          const fy=roadY(far)-20*far, ny=roadY(near)-20*near;
          const wallH=18+63*(far+near)/2;
          let cursor=at;
          const visible=[];
          for(const street of mouths.sort((a,b)=>a.at-b.at)) {
            const start=Math.max(at,street.at-street.halfWidth);
            const end=Math.min(at+62,street.at+street.halfWidth);
            if(start>cursor)visible.push([cursor,start]);
            cursor=Math.max(cursor,end);
          }
          if(cursor<at+62)visible.push([cursor,at+62]);
          for(const [start,end] of visible) {
            if(end-start<.5)continue;
            const u0=(at+62-end)/62*690;
            const u1=(at+62-start)/62*690;
            enqueue({kind:'rail',at,side},Math.max(fy,ny)+wallH,()=>{
            ctx.save();ctx.globalAlpha=.70+.20*near;
            ctx.transform((nx-fx)/690,(ny-fy)/690,0,wallH/337,fx,fy);
            // Clip in the full source tile's coordinates so its texture
            // does not squash or restart at the join.
            ctx.beginPath();ctx.rect(u0,0,u1-u0,337);ctx.clip();
            B.PresentationAssets?.draw?.('cacheParapet',ctx,{
              x:345,y:337,width:690,height:337,
              sourceRect:[(id+(side<0?0:1))%3*690,282,690,337],
              flip:side===1 });
            ctx.restore();
            });
          }
        }
      }
      for(const street of (LANDSCAPE.streetRange?.(bankAddress(1.18),bankAddress(.15))||LANDSCAPE.streets)) {
        if(sideDepth(street.at-progress)<.15||
          sideDepth(street.at-progress)>1.18)continue;
        for(const edgeAt of [street.at-street.halfWidth,
          street.at+street.halfWidth]) {
          const t=sideDepth(edgeAt-progress);
          if(t<.13||t>1.17)continue;
          const x=roadsideX(street.side,t,46,58);
          const wallH=18+63*t;
          enqueue({kind:'rail-end',at:edgeAt,side:street.side},roadY(t)-20*t+wallH,()=>{
          ctx.save();ctx.globalAlpha=.76;
          B.PresentationAssets?.draw?.(street.side<0?
            'cacheJoinLStreetWall':'cacheJoinRStreetWall',ctx,{
            x,y:roadY(t)-20*t+wallH,
            width:9+13*t,height:wallH });
          ctx.restore();
          });
        }
      }
      ctx.globalAlpha=1;
      for(const lamp of worldRange(SERVICE_LAMPS,progress+bankNearDistance,progress+850)) {
        const {at,side}=lamp;
        const t=sideDepth(at-progress);if(t<.025||t>bankMaxDepth)continue;
        const x=roadsideX(side,t,98,80);
        const width=SERVICE_LAMP_WIDTH*t,height=SERVICE_LAMP_HEIGHT*t;
        const y=roadY(t)+18*t;
        const args={x,y,width,height,sourceRect:[42,69,954,1386],flip:side===1,
          lampGround:lightX=>y+side*(lightX-x)*.12};
        // The right mast mirrors around its painted .28 socket, so its
        // inward head owns .72 of the width. Preserve its light pool too.
        if(!inFrame(x,y,width,height,side===1?.72:.28)&&
          !lightInFrame('cachePylon',args))continue;
        lampPools.push(()=>drawLampLight(ctx,'cachePylon',args,'pool'));
        enqueue(lamp,y,()=>clipRoadside(t,()=>{
          drawLampLight(ctx,'cachePylon',args,'beam');
          B.PresentationAssets?.draw?.('cachePylon',ctx,args);
        },side));
      }
      for(const drawPool of lampPools)drawPool();
      worldPaint.sort((a,b)=>a.foot-b.foot||b.area.at-a.area.at);
      for(const item of worldPaint)item.draw();
      if(gpuSceneryContext) {
        finishGpuScene(gpuSceneryContext,nativeSceneryContext,gpuSceneryOptions);
        ctx=nativeSceneryContext;
      }
      // Expand the background once before functional road paint and vehicles.
      // Their projection/order is unchanged and their detail remains native.
      expandSampledWorld();
      // Phrase paint is a road marking, not a second translucent lane overlay.
      // Each bar is bounded by the same depth(), laneEdge() and roadY() used
      // for traffic and studs. Its near edge travels toward the car on the
      // shared song clock, while the road curves beneath every vertex.
      const cueBeatSec=B.MusicTransport?.getLastSample?.()?.grid?.beatDurationSec||60/128;
      const nextPulse = roadPulses(s).find(p => s.pulseTargets[p.id]!==undefined &&
        s.pulseTargets[p.id]>=s.musicBeatFloat-(pulseWindowSec(s)+1e-8)/cueBeatSec&&
        (!s.caughtPulses[p.id]||s.pendingPulseAwards.some(hit=>hit.pulse.id===p.id)));
      // Input calibration adjusts a physical tap only. It must never move
      // the visible countdown away from the song's actual beat.
      const nextCue=nextPulse&&pulseVisual(nextPulse,s,cueBeatSec);
      const beatDistance=beat=>{
        const at=roadAtBeat(s,beat);
        return at===null?null:STRIKE_DISTANCE+at-progress;
      };
      // Captures still own the real music layers and duration. Their broad
      // road washes/tiles duplicated pad/HUD feedback and are omitted here.
      for (const side of [-1, 1]) {
        ctx.strokeStyle = s.fullAdrenaline ? '#ffe4a2' :
          section === 3 ? '#a2f9c9' : '#f0a0ac'; ctx.lineWidth = 4;
        ctx.globalAlpha=.46;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = i / 24, x = center(t) + side * half(t);
          if (!i) ctx.moveTo(x, roadY(t)); else ctx.lineTo(x, roadY(t));
        }
        ctx.stroke();
      }
      ctx.globalAlpha=1;
      // Reflectors lie on the asphalt: both ends have real road addresses.
      // Upright screen rectangles used to resemble tiny floating people or
      // poles. The authored parapet already supplies every roadside post.
      for (let at = Math.floor((progress-115) / 26) * 26; at < progress + 500; at += 26) {
        const d = at - progress, t = depth(d);
        if (d < -110 || t < .12) continue;
        const far = depth(d + 1.1), near = depth(d - 1.1);
        const halfWidth = .7 + 2.2*t;
        ctx.globalAlpha = .25 + t*.45;
        for (let lane = 1; lane < 4; lane++) {
          polygon(ctx, [[laneEdge(lane,far)-halfWidth,roadY(far)],
            [laneEdge(lane,far)+halfWidth,roadY(far)],
            [laneEdge(lane,near)+halfWidth,roadY(near)],
            [laneEdge(lane,near)-halfWidth,roadY(near)]], '#f4e4cf');
        }
      }
      ctx.globalAlpha=1;
      // Bounded wet-road glints pass along the OUTER edge of the asphalt.
      if(crosswalkPose)drawCrosswalkGround(ctx,crosswalkPose,{reduced,
        near:progress+frontNear,far:progress+440,
        point:(lane,at)=>{const t=depth(at-progress);return [laneEdge(lane+.5,t),roadY(t)];}});
      // Their world motion uses the drive clock, while speed lengthens the
      // reflection. They cannot cross a lane or obscure the timing plane.
      if (!reduced) {
        const rush = clamp((s.speed-30)/45,0,1);
        if (rush > .02) {
          ctx.save();ctx.strokeStyle='#a7d7df';ctx.lineWidth=1+rush;
          ctx.globalAlpha=.055+.12*rush;
          for (let at=Math.floor((progress-150)/52)*52;at<progress+330;at+=52) {
            const d=at-progress;
            if(d < -140)continue;
            for(const side of [-1,1]) {
              ctx.beginPath();
              for(let step=0;step<=3;step++) {
                const t=depth(d+(14+40*rush)*step/3);
                const x=center(t)+side*(half(t)-10-9*t),y=roadY(t);
                if(!step)ctx.moveTo(x,y);else ctx.lineTo(x,y);
              }
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }
      // The illustrated parapet and sidewalk own the road border. A second
      // screen-space guardrail used to float over their tops and street gaps.
      ctx.globalAlpha = 1;
      const upcoming = [850, 1700].find(at => at-progress>=frontNear && at-progress<410);
      if (upcoming && !s.combat) {
        // Historical Echo refill signs belong to saved pre-combat rules.
        // Fresh combat checkpoints follow the musical verse boundaries.
        // Checkpoints are roadside signs, not full-width false hit windows.
        const t = depth(upcoming - progress),x=laneEdge(4,t)+40*t,y=roadY(t);
        ctx.save();ctx.translate(x,y);ctx.scale(t,t);
        ctx.strokeStyle='#85b8b7';ctx.lineWidth=4;
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-65);ctx.stroke();
        ctx.fillStyle='#102732';ctx.fillRect(-40,-88,120,30);
        ctx.fillStyle='#c0e4dd';ctx.font='bold 17px Oxanium, monospace';
        ctx.textAlign='center';ctx.fillText('ECHO +',20,-67);ctx.restore();
      }
      // Amber cassette stamps mark optional listening zones in the road.
      // Their fixed world addresses flow beneath traffic; no extra hitbox or
      // beat deadline is created, and collecting never changes the mix.
      const record = this.recordOpportunity();
      const cassette = (x,y,scale,filled=false) => {
        ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
        ctx.fillStyle=filled?'#f1c586':'#183536';ctx.strokeStyle='#e9bf85';ctx.lineWidth=3;
        ctx.fillRect(-27,-15,54,30);ctx.strokeRect(-27,-15,54,30);
        ctx.strokeStyle=filled?'#244143':'#e9bf85';
        for(const xx of [-13,13]) {ctx.beginPath();ctx.arc(xx,0,5,0,Math.PI*2);ctx.stroke();}
        ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.stroke();
        ctx.restore();
      };
      if (record) {
        ctx.save();
        for(let at=Math.ceil((progress-115)/132)*132;at<progress+390;at+=132) {
          const t=depth(at-progress);
          if(t<.2)continue;
          ctx.globalAlpha=record.active?.54:.3;
          cassette(laneX(record.lane,t),roadY(t),t*.9);
        }
        const signDistance=(s.recordSigns[record.index] ?? progress+340)-progress;
        const side=record.lane<2?-1:1,t=depth(signDistance);
        const x=laneEdge(side<0?0:4,t)+side*52*t,y=roadY(t);
        if(signDistance>=frontNear && signDistance<440 && inFrame(x,y,232*t,159*t)) {
        ctx.globalAlpha=.96;ctx.translate(x,y);ctx.scale(t,t);
        ctx.strokeStyle='#d9b98c';ctx.lineWidth=4;
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-88);ctx.stroke();
        ctx.fillStyle='#143037';ctx.fillRect(-58,-159,116,83);
        ctx.strokeRect(-58,-159,116,83);
        cassette(0,-132,.8);
        for(let lane=0;lane<4;lane++) {
          ctx.fillStyle=lane===record.lane?'#ffe2ae':'#47616a';
          ctx.fillRect(-41+lane*22,-106,16,17);
        }
        ctx.strokeStyle='#ffe2ae';ctx.lineWidth=3;ctx.beginPath();
        ctx.arc(0,-132,25,-Math.PI/2,-Math.PI/2+Math.PI*2*(record.active?record.held:1));ctx.stroke();
        }
        ctx.restore();
        if(record.active) {
          const t=STRIKE_DEPTH,y=roadY(t)-35;
          ctx.save();ctx.globalAlpha=.86;
          for(const edge of [record.lane,record.lane+1]) {
            const x=laneEdge(edge,t)+(edge===record.lane?16:-16);
            ctx.fillStyle='#172e35';ctx.fillRect(x-7,y-26,14,52);
            ctx.strokeStyle='#d9b98c';ctx.lineWidth=2;ctx.strokeRect(x-7,y-26,14,52);
            ctx.fillStyle='#f7d499';ctx.fillRect(x-6,y+25-50*record.held,12,50*record.held);
          }
          ctx.restore();
        }
      }
      if(showFeedback&&s.recordFlashMs>0&&s.recordFlashIndex>=0) {
        const lane=RECORD_ZONES[s.recordFlashIndex][2];
        const x=laneEdge(lane<2?lane:lane+1,STRIKE_DEPTH)+(lane<2?-25:25),y=strikeY-68;
        ctx.save();ctx.globalAlpha=Math.min(1,s.recordFlashMs/220);
        cassette(x,y,.8,true);
        ctx.strokeStyle='#fbe2b2';ctx.lineWidth=4;
        ctx.beginPath();ctx.moveTo(x+33,y);ctx.lineTo(x+40,y+7);ctx.lineTo(x+54,y-10);ctx.stroke();
        ctx.restore();
      }
      // One permanent timing line sits under the rear tires, including the
      // gaps between actions. Lane-end brackets remain visible around the
      // opaque car. The upcoming lane builds toward the next ONE here.
      // Timing guides join the HUD fade while authored cinema owns control.
      // Ordinary road paint, projection and fixed pad addresses are unchanged.
      const beatProjection={laneEdge,laneX,roadY,depth,strikeDepth:STRIKE_DEPTH,
        strikeDistance:STRIKE_DISTANCE,strikeY};
      const timingContext=ctx;
      if(!B.CacheRoadBeatFeedback?.drawTarget&&
        (!cinema||cinema.kind==='handoff'||cinema.hudAlpha>.001)) {
      ctx.save();
      if(cinema&&cinema.kind!=='handoff'&&cinema.hudAlpha<1) {
        ctx=B.CacheRoadCinematics.withHUDAlpha(timingContext,cinema.hudAlpha);
        ctx.globalAlpha=1;
      }
      for(let lane=0;lane<4;lane++) {
        const active=nextCue&&nextCue.remaining<=4&&nextPulse.lane===lane;
        const caught=s.pulseFlashMs>0&&s.pulseFlashLane===lane;
        const hot=active&&nextCue.strike;
        const left=laneEdge(lane,STRIKE_DEPTH)+9;
        const right=laneEdge(lane+1,STRIKE_DEPTH)-9;
        ctx.strokeStyle='#071821';ctx.lineWidth=10;
        ctx.beginPath();ctx.moveTo(left,strikeY);ctx.lineTo(right,strikeY);ctx.stroke();
        ctx.globalAlpha=caught?.9:hot?1:active?.65:.34;
        ctx.strokeStyle=caught?'#bcffe2':hot?'#ffe399':'#9bd5cc';
        ctx.lineWidth=hot||caught?5:3;
        ctx.beginPath();ctx.moveTo(left,strikeY);ctx.lineTo(right,strikeY);ctx.stroke();
        const length=active?25+nextCue.charge*12:20;
        for(const [edge,sign] of [[left,1],[right,-1]]) {
          ctx.beginPath();ctx.moveTo(edge+sign*length,strikeY-18);
          ctx.lineTo(edge,strikeY-18);ctx.lineTo(edge,strikeY+14);
          ctx.lineTo(edge+sign*length,strikeY+14);ctx.stroke();
        }
        ctx.globalAlpha=1;
      }
      if(nextCue?.ready&&!s.pulseFlashMs) {
        const x=laneX(nextPulse.lane,STRIKE_DEPTH);
        // Below the tire line: never hidden by the body, and in the same
        // lane as the approaching paint. Only the next ONE is a hit.
        ctx.textAlign='center';
        for(let i=0;i<4;i++) {
          const count=[2,3,4,1][i],selected=count===(nextCue.strike?1:nextCue.count);
          const px=x+(i-1.5)*29;
          ctx.fillStyle=count===1&&nextCue.strike?'#fff0ab':
            selected?'#b5ffe1':'#314e56';
          ctx.beginPath();ctx.arc(px,strikeY+37,selected?11:8,0,Math.PI*2);ctx.fill();
          ctx.fillStyle=selected?'#0a2427':'#b7d3d0';
          ctx.font='bold 13px Oxanium, monospace';ctx.fillText(String(count),px,strikeY+41);
        }
        const face=PULSE_ACTIONS[nextPulse.action];
        ctx.fillStyle=nextCue.window?'#fff0ab':'#cce7dc';
        ctx.font='bold 18px Oxanium, monospace';
        const button=B.GamepadUI?.connected?B.ControllerSettings?.button(face.button)||face.keyboard:face.keyboard;
        if(B.CacheRoadGuidance) {
          B.CacheRoadGuidance.drawButton(ctx,{index:nextPulse.action,x,y:strikeY+78,size:49,active:nextCue.strike});
        } else ctx.fillText(button,x,strikeY+73);
        if(nextCue.strike) {
          ctx.strokeStyle='#fff0ab';ctx.lineWidth=3;ctx.beginPath();
          ctx.arc(x,strikeY+78,34,0,Math.PI*2);ctx.stroke();
        }
      }
      ctx.fillStyle='#b8e1d5';ctx.font='bold 17px Oxanium, monospace';
      ctx.textAlign='center';ctx.fillText('1',laneEdge(0,STRIKE_DEPTH)-26,strikeY+6);
      ctx.restore();
      ctx=timingContext;
      }
      // Musical road paint arrives at the car's timing line on its fixed
      // first beat. Traffic is drawn afterward and occludes every cue.
      for (const pulse of roadPulses(s)) {
        const cue=pulseVisual(pulse,s,cueBeatSec);
        if(!cue||cue.d< -115||cue.d>PAD_REVEAL)continue;
        const d=cue.d;
        const near = depth(d - 18), far = depth(d + 18), mid = depth(d);
        if (mid < .17 || near <= far) continue;
        const latched=s.pendingPulseAwards.some(hit=>hit.pulse.id===pulse.id);
        const spent=(!!s.caughtPulses[pulse.id]||!!s.missedPulses?.[pulse.id])&&!latched,
          ready=cue.ready;
        if(B.CacheRoadBeatFeedback?.drawPad(ctx,s,pulse,cue,{projection:beatProjection,
          spent,latched,reduced,road:this}))continue;
        const downbeatWindow=cue.strike,downbeatCharge=cue.charge;
        const stripNear=STRIKE_DEPTH,stripFar=depth(d+18);
        if(stripNear>stripFar+.005) {
          const stripNearWidth=Math.min(82,(laneEdge(pulse.lane+1,stripNear)-
            laneEdge(pulse.lane,stripNear))*.22);
          const stripFarWidth=Math.min(82,(laneEdge(pulse.lane+1,stripFar)-
            laneEdge(pulse.lane,stripFar))*.22);
          ctx.save();ctx.globalAlpha=spent?.12:.30;
          paintComicDecal(ctx,'cachePulseStrip',[
            [laneX(pulse.lane,stripNear)-stripNearWidth,roadY(stripNear)],
            [laneX(pulse.lane,stripNear)+stripNearWidth,roadY(stripNear)],
            [laneX(pulse.lane,stripFar)+stripFarWidth,roadY(stripFar)],
            [laneX(pulse.lane,stripFar)-stripFarWidth,roadY(stripFar)]]);
          ctx.restore();
        }
        if(!spent&&cue.remaining>=-.3&&cue.remaining<=4) {
          // Three quiet marks arrive on 2, 3 and 4; the button arrives on ONE.
          ctx.save();
          for(let count=1;count<=3;count++) {
            const tickDistance=beatDistance(cue.target-4+count);
            if(tickDistance===null)continue;
            const tt=depth(tickDistance);
            if(tickDistance<STRIKE_DISTANCE-12)continue;
            ctx.globalAlpha=.24+.12*count;
            ctx.strokeStyle='#bbf7df';ctx.lineWidth=2+tt*2;
            ctx.beginPath();ctx.moveTo(laneX(pulse.lane,tt)-18-tt*12,roadY(tt));
            ctx.lineTo(laneX(pulse.lane,tt)+18+tt*12,roadY(tt));ctx.stroke();
          }
          ctx.restore();
        }
        const x = laneX(pulse.lane, mid), y = roadY(mid);
        const nearWidth = Math.min(116, (laneEdge(pulse.lane+1,near) - laneEdge(pulse.lane,near))*.32);
        const farWidth = Math.min(116, (laneEdge(pulse.lane+1,far) - laneEdge(pulse.lane,far))*.32);
        const points = [[laneX(pulse.lane,near)-nearWidth,roadY(near)],
          [laneX(pulse.lane,near)+nearWidth,roadY(near)],
          [laneX(pulse.lane,far)+farWidth,roadY(far)],
          [laneX(pulse.lane,far)-farWidth,roadY(far)]];
        ctx.save();
        ctx.globalAlpha=spent ? .55 : .88;
        polygon(ctx,points,'#061922');
        if(!paintComicDecal(ctx,'cachePulsePad',points)) {
          const inset=8+mid*5;
          polygon(ctx,[[points[0][0]+inset,points[0][1]-2],
            [points[1][0]-inset,points[1][1]-2],
            [points[2][0]-inset*.65,points[2][1]+2],
            [points[3][0]+inset*.65,points[3][1]+2]],'#174c51');
        }
        ctx.strokeStyle=spent?'#6d9389':ready&&downbeatWindow?'#fff0aa':'#9ad9c5';
        ctx.lineWidth=1+mid*(ready&&downbeatWindow?5:2);
        ctx.beginPath(); points.forEach(([px,py],i) => i ? ctx.lineTo(px,py) : ctx.moveTo(px,py));
        ctx.closePath(); ctx.stroke();
        // The inked edge charges on the approach, then flashes on beat ONE.
        // It stays in the road plane, so traffic still occludes it.
        if(ready&&!spent) {
          ctx.globalAlpha=.5+(reduced?0:downbeatCharge*.5);
          ctx.strokeStyle=downbeatWindow?'#fff0aa':'#a9f5d8';
          ctx.lineWidth=2+mid*(2+downbeatCharge*4);
          ctx.beginPath();ctx.moveTo(points[0][0]+15,points[0][1]-3);
          ctx.lineTo(points[1][0]-15,points[1][1]-3);ctx.stroke();
        }
        ctx.globalAlpha=spent ? .52 : 1;
        ctx.translate(x,y);ctx.scale(Math.max(.52,mid),Math.max(.36,mid*.56));
        const face=PULSE_ACTIONS[pulse.action];
        if(B.CacheRoadGuidance)B.CacheRoadGuidance.drawButton(ctx,{index:pulse.action,
          x:0,y:0,size:91,active:ready&&downbeatWindow,disabled:spent});
        else {
          drawActionIcon(ctx,pulse.action,0,-22,58,'#d7ffe6',reduced?0:spent?7:ready&&downbeatWindow?2:0,s);
          ctx.fillStyle='#f4f3d7';ctx.textAlign='center';ctx.font='bold 46px Oxanium, monospace';
          ctx.fillText(B.GamepadUI?.connected?B.ControllerSettings?.button(face.button)||face.keyboard:face.keyboard,0,38);
        }
        ctx.restore();
      }
      // Resolved road pads retire below the next functional timing cue.
      // Keep this single target pass beneath receipts and actual traffic.
      if(B.CacheRoadBeatFeedback?.drawTarget&&
        (!cinema||cinema.kind==='handoff'||cinema.hudAlpha>.001)) {
        ctx.save();
        if(cinema&&cinema.kind!=='handoff'&&cinema.hudAlpha<1) {
          ctx=B.CacheRoadCinematics.withHUDAlpha(timingContext,cinema.hudAlpha);
          ctx.globalAlpha=1;
        }
        B.CacheRoadBeatFeedback.drawTarget(ctx,s,{nextPulse,nextCue,
          projection:beatProjection,reduced,road:this});
        ctx.restore();
        ctx=timingContext;
      }
      const beatReceiptDrawn=showFeedback&&B.CacheRoadBeatFeedback?.drawReceipt(ctx,s,
        {nextPulse,nextCue,projection:beatProjection,reduced,road:this});
      if(showFeedback&&!beatReceiptDrawn&&s.pulseFlashMs>0&&s.pulseFlashLane!==null) {
        const lane=s.pulseFlashLane;
        const age=1-s.pulseFlashMs/650;
        const near=depth(STRIKE_DISTANCE-12-age*25),far=depth(STRIKE_DISTANCE+22+age*20);
        ctx.save();ctx.globalAlpha=(1-age)*(reduced?.32:.85);
        paintComicDecal(ctx,'cachePulseBurst',[
          [laneEdge(lane,near)+6,roadY(near)],
          [laneEdge(lane+1,near)-6,roadY(near)],
          [laneEdge(lane+1,far)-6,roadY(far)],
          [laneEdge(lane,far)+6,roadY(far)]]);
        ctx.restore();
      }
      if(showFeedback&&s.draftTarget!==null&&s.draftMs>0) {
        const truck=roadHazards(s).find(h=>h.at===s.draftTarget);
        if(truck) {
          const lane=hazardLane(truck,progress,s.audits),far=depth(truck.at-progress-9);
          const charge=clamp(s.draftMs/600,0,1);
          ctx.save();ctx.strokeStyle='#8de8e7';ctx.lineWidth=2+charge*2;
          for(const side of [-1,1]) {
            ctx.globalAlpha=.23+charge*.35;ctx.beginPath();
            for(let step=0;step<=12;step++) {
              const t=far+(STRIKE_DEPTH-far)*step/12;
              const x=laneX(lane,t)+side*(22+t*43);
              if(!step)ctx.moveTo(x,roadY(t));else ctx.lineTo(x,roadY(t));
            }ctx.stroke();
          }
          if(!reduced)for(let mark=0;mark<4;mark++) {
            const phase=((s.elapsedMs/480+mark/4)%1+1)%1;
            const t=far+(STRIKE_DEPTH-far)*phase;
            ctx.globalAlpha=.36*(1-phase);ctx.beginPath();
            ctx.moveTo(laneX(lane,t)-30*t,roadY(t)-6*t);
            ctx.lineTo(laneX(lane,t),roadY(t));
            ctx.lineTo(laneX(lane,t)+30*t,roadY(t)-6*t);ctx.stroke();
          }
          ctx.restore();
        }
      }
      // Passing traffic can now remain below Cache. Split complete sprites
      // around the player's current projected ground depth, including gear
      // movement, so steering behind a passed car cannot paint over its roof.
      const carPose=cinema&&cinema.kind!=='handoff'?{depth:cinema.car.depth,scale:cinema.car.scale,offset:0}:
        shiftPose(s,reduced),foregroundVehicles=[],backgroundVehicles=[];
      const vehicleAtDepth=(t,draw)=>{
        if(t>carPose.depth)foregroundVehicles.push({t,draw});
        else backgroundVehicles.push({t,draw});
      };
      if(crosswalkPose)for(const person of crosswalkPose.people) {
        const d=person.at-progress;if(d<frontNear||d>440)continue;
        const t=depth(d),x=laneX(person.lane,t),y=roadY(t),height=22+155*t;
        vehicleAtDepth(t,()=>drawCrosswalkPerson(ctx,person,{x,y,height,reduced}));
        if(person.phase==='walking'&&d>=-12&&d<=260) {
          const marker=cameraEdgeMarker(camera,{x,y,width:height*.82,height});
          if(marker)cameraWarnings.push({lane:person.lane,d,marker});
        }
      }
      // Far traffic first; the shapes and on-road arrows remain legible in motion.
      const trafficPoses=roadHazards(s).map(hazard=>({hazard,actor:actorPose(s,hazard)}))
        .sort((a,b)=>b.actor.at-a.actor.at);
      for (const {hazard,actor} of trafficPoses) {
        const d=actor.at-progress;
        if (d < frontNear || d > 440 || actor.alpha<=0) continue;
        const t = depth(d), lane = actor.lane;
        const x = laneX(lane, t), y = roadY(t);
        const heavy = ['freight','shuttle','sweeper'].includes(hazard.kind);
        const w = (heavy ? 32 : hazard.kind === 'trike' ? 21 : 26) +
          t * (heavy ? 144 : hazard.kind === 'trike' ? 96 : 113);
        const h = (heavy ? 30 : 24) + t * (heavy ? 149 : 111);
        if(actor.collidable&&d>=-8&&d<=240) {
          const marker=cameraEdgeMarker(camera,{x,y,width:w*1.35,height:h*1.25});
          if(marker)cameraWarnings.push({lane,d,marker});
        }
        // Include suspension, steering lean and lamps around the complete
        // painted body. Cull only after its last edge leaves the viewport.
        if(!inFrame(x,y,w*1.9,h*1.6,.5,h*.15))continue;
        if (showFeedback && actor.collidable && d < 145 && d > 4 && t > .38) {
          // A braking chevron is printed on the threatened lane, with a
          // narrowing cue as the car approaches the collision plane.
          const markT = depth(d - 23);
          ctx.globalAlpha = .2 + (1 - d / 145) * .36;
          polygon(ctx, [[laneX(lane,t),y+5],
            [laneEdge(lane+1,markT)-14,roadY(markT)],
            [laneX(lane,markT),roadY(markT)-4],
            [laneEdge(lane,markT)+14,roadY(markT)]], '#ff7488');
          ctx.globalAlpha = 1;
        }
        if (showFeedback && actor.collidable && hazard.kind === 'audit' && d < 165 && d > 0) {
          const ahead = depth(d - 38);
          ctx.globalAlpha = .45;
          polygon(ctx, [[laneEdge(lane,t)+9,y],[laneEdge(lane+1,t)-9,y],
            [laneEdge(lane+1,ahead)-15,roadY(ahead)],
            [laneEdge(lane,ahead)+15,roadY(ahead)]], '#ff4f82');
          ctx.globalAlpha = 1;
        }
        if (showFeedback && actor.collidable && (hazard.kind === 'sweeper' || hazard.kind === 'trike') && d <
            (hazard.kind === 'sweeper' ? 190 : 225) && d > 0) {
          const target = hazard.mergeLane ?? hazard.lane + (hazard.lane === 3 ? -1 : 1);
          const arrowT = depth(d - 48), targetX = laneX(target,arrowT);
          ctx.strokeStyle = hazard.kind === 'sweeper' ? '#ffe6a2' : '#9cf6ef';
          ctx.globalAlpha = .60; ctx.lineWidth = (hazard.kind === 'sweeper' ? 5 : 3) + t*4;
          ctx.beginPath(); ctx.moveTo(laneX(hazard.lane,t),y+12*t);
          ctx.lineTo(targetX,roadY(arrowT)+10*arrowT); ctx.stroke();
          const direction = Math.sign(target-hazard.lane);
          polygon(ctx, [[targetX,roadY(arrowT)+10*arrowT],
            [targetX-direction*21*arrowT,roadY(arrowT)-9*arrowT],
            [targetX-direction*20*arrowT,roadY(arrowT)+30*arrowT]],
          hazard.kind === 'sweeper' ? '#ffe6a2' : '#9cf6ef');
          ctx.globalAlpha = 1;
        }
        vehicleAtDepth(t,()=>drawVehicle(ctx, x, y, w, h, hazard.kind,
          { phase: (s.elapsedMs||0)*.054 + hazard.at*.17,
            alpha:actor.alpha,steer:actor.kind?actor.steer:hazardTurn(hazard,progress).steer, reduced }));
        if (showFeedback && actor.collidable && d < 210 && d > 0 && t > .38 &&
            ['audit','sweeper','freight','trike','shuttle'].includes(hazard.kind)) {
          ctx.fillStyle = hazard.kind === 'audit' ? '#ffd0df' :
            hazard.kind === 'trike' ? '#b4fff1' : '#fff2be';
          ctx.font = `bold ${Math.round(15 + t*16)}px Oxanium, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(hazard.kind === 'audit' ? 'AUDIT LOCK' :
            hazard.kind === 'sweeper' ? 'SWEEP' : hazard.kind === 'trike' ?
              (hazard.lane === 3 ? '< CUT' : 'CUT >') :
            hazard.kind === 'shuttle' ? 'SLOW / DRAFT' : 'DRAFT', x, y - h - 14);
        }
      }
      if (showFeedback && s.gateAt != null && s.gateAt-progress>=frontNear) {
        const t = depth(s.gateAt - progress), y = roadY(t);
        if(s.encounters)B.PresentationAssets?.draw?.('cacheDeliveryBeacon',ctx,{
          x:laneEdge(4,t)+35*t,y,width:18+54*t,height:50+166*t});
        ctx.fillStyle = '#9ffff0'; ctx.font = `bold ${Math.round(18 + t*23)}px Oxanium, monospace`;
        ctx.textAlign = 'center'; ctx.fillText('ORIGINAL >>>', laneX(3,t), y - 154*t - 52);
        ctx.fillStyle = '#ffb2bd'; ctx.fillText('AUDIT COPY', laneX(0,t), y - 154*t - 52);
      }
      if (!s.encounters && s.musicBar >= 76) {
        const t = .62, x = laneX(s.rivalLane,t), y = roadY(t);
        drawVehicle(ctx, x, y, 126, 127, 'rival', { phase: (s.elapsedMs||0)*.054+97, reduced });
        if (s.rivalWarning) {
          const markT = depth(s.nextRivalAt - progress), markX = laneX(s.rivalTarget,markT), markY = roadY(markT);
          ctx.strokeStyle = '#ff719b'; ctx.lineWidth = 6;
          ctx.strokeRect(markX - 44, markY - 83, 88, 78);
        }
      }
      const boss=s.combat?combatPose.boss:B.CacheRoadPursuit?.boss?.(s.pursuit,{progress});
      if(boss&&boss.at-progress>=frontNear&&boss.at-progress<=520) {
        const t=depth(boss.at-progress),x=laneX(boss.lane,t),y=roadY(t),width=46+t*192,height=55+t*215;
        vehicleAtDepth(t,()=>{
          B.CacheRoadBossArt?.drawRig?.(ctx,{x,y,width,height,health:boss.health,
            phase:rigArtPhase(s,boss,combatPose),elapsedMs:s.elapsedMs,
            reduced:reduced||!!s.combat&&window.BARCODE_RENDER_QUALITY?.flashes===false,alpha:boss.alpha??1});
          if(showFeedback&&s.bossImpact&&(!s.combat||s.bossImpact.id==='rig')&&s.elapsedMs-s.bossImpact.atMs<1100) {
            const age=(s.elapsedMs-s.bossImpact.atMs)/1100;
            B.CacheRoadBossArt?.drawImpact?.(ctx,{x,y:y-height*.4,width:width*(1+age*.5),height:height,
              kind:s.bossImpact.systemIndex===2?'core':s.bossImpact.systemIndex===1?'armor':'sparks',progress:age,alpha:1,
              reduced:reduced||!!s.combat&&window.BARCODE_RENDER_QUALITY?.flashes===false});
          }
        });
      }
      if(s.pursuit) {
        const rival=B.CacheRoadPursuit.pose(s.pursuit,{progress});
        const reaction=rival&&actorPose(s,rival);
        if(reaction&&reaction.at>=progress+frontNear) {
          const d=reaction.at-progress,t=depth(d);
          const x=laneX(reaction.lane,t),y=roadY(t);
          if(reaction.collidable&&d>=-8&&d<=240) {
            const marker=cameraEdgeMarker(camera,{x,y,width:(26+t*113)*1.35,height:(24+t*111)*1.25});
            if(marker)cameraWarnings.push({lane:reaction.lane,d,marker});
          }
          if(rival.boss) {
            // The rig is one body; its scanner/ram/pulse has a separately
            // committed road footprint rather than another duplicate rig.
            const l=laneEdge(Math.round(rival.lockLane),t),r=laneEdge(Math.round(rival.lockLane)+1,t);
            const far=depth(d+45),fl=laneEdge(Math.round(rival.lockLane),far),fr=laneEdge(Math.round(rival.lockLane)+1,far);
            ctx.save();ctx.globalAlpha=rival.locked?.46:.23;
            polygon(ctx,[[l,y],[r,y],[fr,roadY(far)],[fl,roadY(far)]],rival.echoCommitted?'#a3f0e8':'#ff719b');
            ctx.strokeStyle=rival.echoCommitted?'#c5fff0':'#ffc2a5';ctx.lineWidth=2+3*t;ctx.stroke();ctx.restore();
            if(rival.attackKind==='ram')vehicleAtDepth(t,()=>drawVehicle(ctx,x,y,26+t*113,24+t*111,'rival',{
              alpha:rival.alpha*reaction.alpha,phase:s.elapsedMs*.054+97,steer:reaction.steer,reduced}));
          } else vehicleAtDepth(t,()=>drawVehicle(ctx,x,y,26+t*113,24+t*111,'rival',{
            alpha:rival.alpha*reaction.alpha,phase:s.elapsedMs*.054+97,steer:reaction.steer,reduced}));
          if(rival.warning&&reaction.collidable) {
            const target=laneX(rival.lockLane,t),w=35+65*t;
            ctx.save();ctx.strokeStyle=rival.echoCommitted?'#8cecf1':'#ff719b';ctx.lineWidth=3+3*t;
            ctx.globalAlpha=rival.locked?.85:.4;
            ctx.strokeRect(target-w/2,y-55-60*t,w,50+55*t);
            ctx.font=`bold ${Math.round(15+13*t)}px Oxanium, monospace`;ctx.textAlign='center';
            ctx.fillStyle=ctx.strokeStyle;
            ctx.fillText(rival.echoCommitted?'ECHO LOCK':rival.locked?'LOCKED':'SCANNING',target,y-70-65*t);
            ctx.restore();
          }
        }
      }
      if(s.combat)drawCombatWorld(ctx,s,{depth,laneX,laneEdge,roadY,frontNear,reduced,camera,cameraWarnings,vehicleAtDepth,combatPose,feedback:showFeedback});
      // Staged opening cars share the existing perspective and body painter.
      // They never enter physical combat, its ledger or completion conditions.
      for(const actor of cinema?.actors||[]) {
        const t=depth(actor.gap),x=laneX(actor.lane,t),y=roadY(t);
        // A retreating staged foe becomes a complete tiny silhouette at the
        // horizon; the ordinary roadside safety floor must not pop it away.
        const exitScale=actor.horizonExit?clamp((520-actor.gap)/100,0,1):1;
        const width=(26+t*113)*exitScale,height=(24+t*111)*exitScale;
        if(width<1||height<1)continue;
        vehicleAtDepth(t,()=>drawCombatBody(ctx,{...actor,at:progress+actor.gap},
          {x,y,width,height,reduced,elapsedMs:actor.ageMs}));
      }
      // People and all vehicle owners share ground-depth order. A distant
      // enemy cannot cover a nearby pedestrian simply because it draws later.
      backgroundVehicles.sort((a,b)=>a.t-b.t);
      for(const body of backgroundVehicles)body.draw();
      const recoil=showFeedback&&s.encounters&&!reduced?Math.sin((s.reactionRecoilMs||0)/520*Math.PI)*7:0;
      const carX=laneX(s.visualLane,carPose.depth)+(s.reactionRecoilSide||1)*recoil,
        carY=roadY(carPose.depth)+Math.abs(recoil)*.6;
      const carWidth=CAR_WIDTH*carPose.scale,carHeight=CAR_HEIGHT*carPose.scale;
      const guardActive=showFeedback&&s.combat?.defendMs>0;
      const defenseActive=showFeedback&&!!(s.shield||s.ramMs||s.defenseFlashMs||guardActive);
      const defenseImpact=clamp(s.defenseFlashMs/600,0,1);
      const defenseBrace=guardActive||(defenseImpact>0?
        ['BRACE','SYNC IMPACT','GUARD READY','DEFEND COUNTER','DEFEND BLOCK'].includes(s.defenseKind):!!s.shield);
      const braceHalo=s.encounters&&defenseActive&&defenseBrace&&
        B.PresentationAssets?.ready?.('cacheBraceHalo');
      if (showFeedback&&s.echo) {
        const x = laneX(s.echo.lanePos, .83);
        if(s.encounters) {
          ctx.save();ctx.globalAlpha=reduced?.5:.5+.16*Math.sin(s.elapsedMs*.012);
          B.PresentationAssets?.draw?.('cacheEchoRibbons',ctx,{x,y:carY,width:285,height:190});ctx.restore();
        }
        if (Math.abs(x - carX) > 35) {
          ctx.strokeStyle = '#a4faff'; ctx.globalAlpha = .36; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, carY - 8); ctx.lineTo(carX, carY - 8); ctx.stroke(); ctx.globalAlpha = 1;
        }
        drawVehicle(ctx, x, carY, 152, 115, 'echo',
          { alpha: .68, phase: progress+37, reduced });
      }
      if (showFeedback&&(s.braking || s.stumbleMs)) {
        // Two short broken wet tire tracks follow the curved road under the
        // car. They are local to the rear tires and disappear on release.
        ctx.save();ctx.globalAlpha=s.stumbleMs?.35:.24;
        ctx.strokeStyle='#87949e';ctx.lineCap='round';
        ctx.lineWidth=2.5;
        for(const side of [-1,1])for(let segment=0;segment<3;segment++) {
          ctx.beginPath();
          for(let step=0;step<=3;step++) {
            const t=.835+segment*.055+step*.012;
            const xx=laneX(s.visualLane,t)+side*72-s.steer*(t-.83)*24;
            const yy=roadY(t)-16;
            if(!step)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      if(braceHalo)drawBraceHalo(ctx,carX,carY,carWidth,carHeight,defenseImpact,reduced,false);
      if(defenseActive&&!braceHalo) {
        ctx.save();
        const impact=s.defenseFlashMs/600;
        const brace=defenseBrace;
        ctx.strokeStyle=brace?'#a1e8ff':'#ffd096';
        ctx.lineWidth=impact>0?3+impact*4:2.5;
        ctx.globalAlpha=impact>0?impact:.65;
        const spread=impact>0&&!reduced?(1-impact)*65:0;
        ctx.beginPath();
        if(brace)ctx.ellipse(carX,carY-34,CAR_WIDTH*.64+spread,56+spread*.35,0,0,Math.PI*2);
        else {
          ctx.moveTo(carX-112-spread,carY-46-spread);
          ctx.lineTo(carX-96-spread,carY-126-spread);
          ctx.lineTo(carX,carY-148-spread);
          ctx.lineTo(carX+96+spread,carY-126-spread);
          ctx.lineTo(carX+112+spread,carY-46-spread);
        }ctx.stroke();ctx.restore();
      }
      if(showFeedback&&s.boostMs>0&&!reduced) {
        // Physical exhaust ports move with the car, beneath its painted body.
        // This is elapsed-state paint in the existing draw, not a particle loop.
        const u=(s.elapsedMs%480)/480;
        for(const side of [-1,1])B.CacheRoadBossArt?.drawImpact?.(ctx,{
          x:carX+side*carWidth*.22,y:carY+19,width:carWidth*.39,height:carHeight*.55,
          kind:'exhaust',progress:u,alpha:.65,reduced});
      }
      if(carWidth>1)drawVehicle(ctx, carX, carY, carWidth, carHeight, 'cache',
        { alpha: showFeedback&&!s.stumbleMs && s.invulnerableMs && Math.floor(s.invulnerableMs / 90) % 2 ? .55 : 1,
          turbo: showFeedback&&!!s.boostMs, phase: (s.elapsedMs||0)*.054, steer: s.steer, hit:showFeedback?s.stumbleMs:0,
          braking:showFeedback&&s.braking, damage:(s.maxIntegrity||3)-s.integrity, reduced });
      if(braceHalo)drawBraceHalo(ctx,carX,carY,carWidth,carHeight,defenseImpact,reduced,true);
      if(s.encounters&&defenseActive&&!defenseBrace) {
        const impact=defenseImpact;
        ctx.save();ctx.globalAlpha=impact>0?.7+impact*.3:.58;
        const size=1+(reduced?0:impact*.18);
        B.PresentationAssets?.draw?.('cachePushArc',ctx,{
          x:carX,y:carY-25,width:310*size,height:155*size});ctx.restore();
      }
      if (showFeedback&&s.cutFlashMs && !reduced) {
        const pulse = s.cutFlashMs / 740;
        const side=s.passSide||1;
        ctx.save();ctx.globalAlpha=.51*pulse;
        ctx.translate(carX+side*105,carY+24);ctx.rotate(side*.2);
        B.PresentationAssets?.draw?.('cacheSpeedMist',ctx,{
          x:0,y:0,width:225,height:94,flip:side<0 });
        ctx.restore();
        drawGrimyPlume(ctx,carX+side*108,carY-46,progress*1.3,
          113,pulse,['#a1d4cf','#697984'],side);
        drawGrimyPlume(ctx,carX+side*70,carY-10,progress*1.3+42,
          61,pulse*.8,['#ddc2a1','#48545f'],side);
      }
      if (showFeedback&&s.stumbleMs) {
        const pulse = s.stumbleMs / 650;
        ctx.save();ctx.translate(carX,carY+32);
        ctx.rotate(Math.sin(progress*.07)*.045);
        ctx.globalAlpha=.76*pulse;
        B.PresentationAssets?.draw?.('cacheImpactGrit',ctx,{
          x:0,y:0,width:306+(1-pulse)*72,height:145+(1-pulse)*35 });
        ctx.restore();
        drawGrimyPlume(ctx,carX-64,carY-55,progress*.9+12,
          126,pulse,['#e3a480','#363b47'],-1);
        drawGrimyPlume(ctx,carX+61,carY-75,progress*.9+47,
          151,pulse,['#b8a3a0','#303540'],1);
      }
      foregroundVehicles.sort((a,b)=>a.t-b.t);
      for(const vehicle of foregroundVehicles)vehicle.draw();
      // Short local receipts keep driving rewards where attention already is.
      if(showFeedback&&(s.draftMs>0||s.turboReadyMs>0||s.boostMs>0||s.defenseFlashMs>0)) {
        const x=carX,y=carY-175;
        const turbo=s.turboReadyMs>0||s.boostMs>0;
        const label=s.defenseFlashMs>0?s.combat?s.defenseKind:
          `${s.defenseKind} / ${s.defenseKind==='PUSH'?'CLEARED':'BLOCKED'}`:
          s.boostMs>0?'TURBO':s.turboReadyMs>0?'TURBO READY':'DRAFT / TURBO';
        ctx.save();ctx.fillStyle='#071e29e6';ctx.fillRect(x-113,y-20,226,38);
        ctx.fillStyle=turbo?'#ffdda0':'#b5f0f1';
        ctx.font='bold 18px Oxanium, monospace';ctx.textAlign='center';ctx.fillText(label,x,y+3);
        if(s.draftMs>0) {
          ctx.fillStyle='#284a56';ctx.fillRect(x-99,y+10,198,4);
          ctx.fillStyle='#98f8e8';ctx.fillRect(x-99,y+10,198*clamp(s.draftMs/600,0,1),4);
        }ctx.restore();
      }
      if(showFeedback&&s.passFlashMs>0) {
        const alpha=Math.min(1,s.passFlashMs/230),age=1-s.passFlashMs/780;
        const x=carX+(s.passSide||1)*155,y=carY-88-(reduced?0:age*30);
        ctx.save();ctx.globalAlpha=alpha;ctx.textAlign='center';
        ctx.fillStyle='#071e29dc';ctx.fillRect(x-68,y-27,136,56);
        ctx.fillStyle='#beffe6';ctx.font='bold 23px Oxanium, monospace';
        ctx.fillText(`+${s.passAward}`,x,y);
        ctx.font='bold 12px Oxanium, monospace';ctx.fillText(s.combat?s.passKind||'DRIVING REWARD':
          s.bossImpact&&s.elapsedMs-s.bossImpact.atMs<780?'BOSS COUNTER':s.cutFlashMs?'CLOSE CUT':'NEAR MISS',x,y+20);
        ctx.restore();
      }
      ctx.restore(); // world camera
      drawSpeedAtmosphere(ctx,s,{reduced,intro,playing:this.status==='playing'});
      if(intro===null&&this.status==='playing')drawCameraWarnings(ctx,cameraWarnings,
        nextCue?.ready?{x:laneX(nextPulse.lane,STRIKE_DEPTH),y:strikeY+78,
          width:68,height:68,action:nextPulse.action,strike:nextCue.strike}:null,camera);
      ctx.setTransform(1,0,0,1,0,0);
      if(cinema&&cinema.kind!=='handoff'&&cinema.hudAlpha<=.001) {
        B.CacheRoadCinematics.drawOverlay(ctx,cinema,{reducedMotion:reduced,
          button:B.GamepadUI?.connected?B.ControllerSettings?.button(0)||'A':'ENTER'});
        ctx.restore();finishRender();return;
      }
      if (intro !== null&&!cinema) {
        const scene=intro<1350?0:intro<2700?1:2;
        const titles=['ORIGINAL RECORDING','AUDIT LOCK INCOMING','DELIVER THE ORIGINAL'];
        const details=['CACHE // COURIER ROUTE','THE CLEAN COPY ERASED THE NAMES','HIT THE MINT PADS ON ONE'];
        ctx.fillStyle='#07121fe8';ctx.fillRect(0,0,1920,156);ctx.fillRect(0,912,1920,168);
        ctx.fillStyle=scene===1?'#ff947f':'#a4f2d7';ctx.fillRect(112,916,Math.min(1696,1696*intro/4200),5);
        ctx.textAlign='center';ctx.fillStyle='#eff9e8';ctx.font='bold 54px Oxanium, monospace';
        ctx.fillText(titles[scene],960,80);
        ctx.fillStyle='#b3d9d3';ctx.font='bold 25px Oxanium, monospace';
        ctx.fillText(details[scene],960,970);
        ctx.font='18px Oxanium, monospace';
        ctx.fillText('ENTER / A TO SKIP',960,1025);
        ctx.restore();finishRender();return;
      }
      if(cinema&&cinema.kind!=='handoff'&&cinema.hudAlpha<1) {
        ctx=B.CacheRoadCinematics.withHUDAlpha(frameContext,cinema.hudAlpha);
        ctx.globalAlpha=1;
      }
      if (s.invulnerableMs) {
        ctx.fillStyle = '#ff697a';
        ctx.fillRect(0, 163, 12, 750); ctx.fillRect(1908, 163, 12, 750);
      }
      // A compact VFD instrument cluster leaves the original mirror and
      // world aperture untouched. Every gauge reports existing live state.
      ctx.fillStyle = '#07121ff5'; ctx.fillRect(0, 0, 1920, 164);
      dashboardBezel(ctx,20,5,605,153,'#79d9d1');
      dashboardBezel(ctx,1338,5,562,153,s.fullAdrenaline?'#f6d38a':'#81d8d2');
      const dash=dashboardReadout(s);
      ctx.globalAlpha=1;ctx.textAlign='left';ctx.fillStyle='#a4c9bc';
      ctx.font='bold 14px Oxanium, monospace';
      ctx.fillText('GEAR',279,40);ctx.fillText('TIME',412,42);
      hudDigits(ctx,String(dash.mph).padStart(3,'0'),50,44,77);
      ctx.fillStyle='#b3dec9';ctx.font='bold 18px Oxanium, monospace';
      ctx.fillText('MPH',211,105);
      hudSegments(ctx,50,129,195,18,dash.mph/243,s.boostMs?1:0);
      hudDigits(ctx,dash.gear,283,44,77);
      if(dash.queuedGear!==null) {
        hudIcon(ctx,7,337,48,19,1);hudDigits(ctx,dash.queuedGear,335,73,36,1);
        ctx.fillStyle=DASH_COLORS[1];ctx.font='bold 12px Oxanium, monospace';
        ctx.fillText('NEXT 1',331,133);
      }
      hudIcon(ctx,1,385,27,21,dash.lowTime?2:1);
      hudDigits(ctx,dash.clock,383,57,43,dash.lowTime?2:1);
      hudIcon(ctx,0,551,30,26,dash.integrity<=1?2:0);
      for(let i=0;i<(s.maxIntegrity||3);i++) {
        ctx.fillStyle=i<dash.integrity?DASH_COLORS[dash.integrity<=1?2:0]:'#19343b';
        ctx.fillRect(535+i*(s.maxIntegrity===4?18:24),68,s.maxIntegrity===4?13:16,36);
      }
      ctx.fillStyle='#a4c9bc';ctx.font='bold 12px Oxanium, monospace';
      ctx.fillText('SIGNAL',534,129);
      hudIcon(ctx,6,385,116,18);
      ctx.fillStyle='#bcebd3';ctx.font='bold 17px Oxanium, monospace';
      ctx.fillText(String(s.score).padStart(6,'0'),410,131,73);
      ctx.font='bold 12px Oxanium, monospace';ctx.fillText(`×${stackSize(s)}`,488,131,27);
      const nativeMirror=budgetEligible&&frameContext===ctx&&
        typeof window.HTMLCanvasElement==='function'&&ctx.canvas instanceof window.HTMLCanvasElement&&
        this.status==='playing'&&intro===null&&(!cinema||cinema.hudAlpha===1);
      drawRearview(ctx, s, ['#f6adbb', '#f3b276', '#d2a4f9', '#9aefce'][section], reduced,heightSample,combatPose,crosswalkPose,
        false,nativeMirror,budgetEligible?this.renderBudget:null);
      ctx.fillStyle = '#e4ede5'; ctx.font = 'bold 18px Oxanium, monospace'; ctx.textAlign = 'left';
      // Preview the next lane/action before its bar is committed, without
      // inventing a deadline or sliding a future pad when the gear changes.
      const previewPulse=nextPulse||roadPulses(s).find(p=>s.pulseTargets[p.id]===undefined&&
        p.at-progress>=-80&&p.at-progress<PAD_REVEAL);
      const nextFace = previewPulse && PULSE_ACTIONS[previewPulse.action];
      const nextButton = nextFace && (B.GamepadUI?.connected ?
        B.ControllerSettings?.button(nextFace.button) || nextFace.keyboard : nextFace.keyboard);
      const padDistance = nextCue?.d;
      const padVisible=nextPulse&&padDistance<=PAD_REVEAL;
      const padReady=padVisible&&nextCue.ready;
      const inPadLane=padReady&&Math.abs(s.lanePos-nextPulse.lane)<=.38;
      const pressNow=inPadLane&&nextCue.strike;
      const showingCatch=showFeedback&&s.pulseFlashMs>0 && s.pulseFlashAction!==null;
      const iconScale=padReady&&inPadLane&&!reduced?1+.28*nextCue.charge:1;
      const shownFace=showingCatch?PULSE_ACTIONS[s.pulseFlashAction]:nextFace;
      const shownButton=showingCatch?(B.GamepadUI?.connected?
        B.ControllerSettings?.button(shownFace.button)||shownFace.keyboard:shownFace.keyboard):nextButton;
      const targetLane=showingCatch?s.pulseFlashLane:previewPulse?.lane;
      ctx.fillStyle=pressNow?'#69432b':padReady?'#183e37':'#10262b';
      ctx.fillRect(1366,31,67,57);
      if(showFeedback&&s.pulseFlashMs&&!reduced) {
        ctx.save();ctx.globalAlpha=.75*s.pulseFlashMs/650;
        B.PresentationAssets?.draw?.('cachePulseBurst',ctx,
          {x:1400,y:57,width:94,height:50});
        ctx.restore();
      }
      if(showingCatch) {
        const cel=reduced?0:Math.min(7,Math.floor((650-s.pulseFlashMs)/82));
        drawActionIcon(ctx,s.pulseFlashAction,1400,57,reduced?45:60,'#c6ffe2',cel,s);
      } else if(padVisible)drawActionIcon(ctx,nextPulse.action,1400,57,
        37*iconScale,'#c6ffe2',reduced?0:pressNow?2:0,s);
      else if(previewPulse)drawActionIcon(ctx,previewPulse.action,1400,57,37,'#c6ffe2',0,s);
      else drawLaneMark(ctx,s.lane,1400,57,35,'#55776d');
      if(shownFace&&B.CacheRoadGuidance)B.CacheRoadGuidance.drawButton(ctx,{
        index:shownFace.button,x:1473,y:59,size:56,label:shownButton,active:pressNow||showingCatch});
      else {
        ctx.fillStyle='#102a28';ctx.fillRect(1443,31,60,55);
        ctx.fillStyle='#c8ffe3';ctx.font='bold 29px Oxanium, monospace';ctx.textAlign='center';
        ctx.fillText(shownButton||'—',1473,70,51);
      }
      ctx.textAlign='left';ctx.fillStyle='#8fc8b7';ctx.font='bold 15px Oxanium, monospace';
      ctx.fillText(faceLabel(s,showingCatch?s.pulseFlashAction:previewPulse?.action)||'READY',1517,43,181);
      ctx.fillStyle=pressNow?DASH_COLORS[1]:DASH_COLORS[0];
      ctx.font='bold 22px Oxanium, monospace';
      ctx.fillText(showingCatch?`+${s.pulseHoldBars||(s.pulseCombo>=2?16:8)}B`:
        padVisible?pressNow?'NOW':inPadLane?'ONE':'':previewPulse?'':'—',1517,69,202);
      if(!showingCatch&&Number.isInteger(targetLane)&&Math.abs(s.lanePos-targetLane)>.38) {
        const dir=targetLane>s.lanePos?1:-1;
        ctx.strokeStyle=PALETTE[targetLane];ctx.lineWidth=4;ctx.beginPath();
        ctx.moveTo(1538-dir*17,61);ctx.lineTo(1538+dir*17,61);
        ctx.moveTo(1538+dir*7,51);ctx.lineTo(1538+dir*17,61);ctx.lineTo(1538+dir*7,71);ctx.stroke();
      }
      if(padVisible&&!showingCatch) {
        for(let i=0;i<4;i++) {
          const count=[2,3,4,1][i];
          const selected=padReady&&count===(nextCue.strike?1:nextCue.count);
          const hot=padReady&&count===1&&nextCue.strike;
          const px=1517+i*31;
          ctx.fillStyle=hot?'#ffda83':selected?'#a5efd5':'#203f38';
          ctx.fillRect(px,77,25,17);
          ctx.fillStyle=hot?'#111b1d':'#09202a';ctx.font='bold 13px Oxanium, monospace';
          ctx.textAlign='center';ctx.fillText(String(count),px+12.5,90);
        }
        ctx.textAlign='left';ctx.fillStyle=pressNow?'#ffefa7':'#a9c9c7';
        ctx.font='bold 12px Oxanium, monospace';ctx.fillText('ONE',1651,90);
      }
      ctx.fillStyle='#8fc8b7';ctx.font='bold 11px Oxanium, monospace';
      ctx.fillText('LANE',1773,39);
      for(let lane=0;lane<4;lane++) {
        const xx=1735+lane*34,target=lane===targetLane;
        ctx.fillStyle=target?'#24483f':'#0a1d20';ctx.fillRect(xx,47,28,28);
        ctx.strokeStyle=target?PALETTE[lane]:'#294640';ctx.lineWidth=target?2:1;
        ctx.strokeRect(xx+.5,47.5,27,27);
        drawLaneMark(ctx,lane,xx+14,61,18,target?PALETTE[lane]:'#4a6963');
        if(lane===s.lane){ctx.fillStyle='#d8ffe9';ctx.fillRect(xx+10,79,8,3);}
        if(cameraWarnings.some(item=>clamp(Math.round(item.lane),0,3)===lane)) {
          // The existing four-lane map identifies even overlapping edge threats.
          polygon(ctx,[[xx+14,87],[xx+21,99],[xx+7,99]],'#ffb493');
          ctx.fillStyle='#071821';ctx.fillRect(xx+13,91,2,4);
        }
      }
      if(s.combat)drawCombatSkills(ctx,s,combatPose);
      else {
      const turboRow=dash.turboMode==='queued'||dash.turboMode==='active'?1:0;
      hudIcon(ctx,2,1365,103,21,turboRow);
      ctx.fillStyle='#9bd6c0';ctx.font='bold 13px Oxanium, monospace';
      ctx.fillText('TURBO',1392,115);
      B.CacheRoadGuidance?.drawButton(ctx,{index:4,x:1500,y:107,size:32,label:dash.turboButton,active:dash.turboMode==='ready'});
      hudSegments(ctx,1392,123,125,8,dash.turboValue,turboRow);
      ctx.fillStyle=DASH_COLORS[turboRow];ctx.font='bold 11px Oxanium, monospace';
      ctx.fillText(dash.turboMode==='queued'?'NEXT 1':dash.turboMode==='active'?'ON':
        dash.turboMode==='ready'?'READY':dash.turboMode==='draft'?'DRAFT':`${s.nearMisses}/2`,1530,130,64);
      hudIcon(ctx,3,1602,103,21,dash.echoMode==='active'?1:0);
      ctx.fillStyle='#9bd6c0';ctx.font='bold 13px Oxanium, monospace';
      ctx.fillText('ECHO',1628,115);
      B.CacheRoadGuidance?.drawButton(ctx,{index:5,x:1717,y:107,size:32,label:dash.echoButton,active:dash.echoMode==='ready'});
      hudSegments(ctx,1628,123,115,8,dash.echoValue,dash.echoMode==='active'?1:0);
      ctx.fillStyle=DASH_COLORS[dash.echoMode==='active'?1:0];ctx.font='bold 11px Oxanium, monospace';
      ctx.fillText(dash.echoMode==='active'?'ON':dash.echoMode==='ready'?'READY':
        `${Math.round(s.echoEnergy)}%`,1751,130,47);
      ctx.save();ctx.globalAlpha=s.shield?1:.2;hudIcon(ctx,4,1807,105,23);ctx.restore();
      ctx.save();ctx.globalAlpha=s.ramMs>0?1:.2;hudIcon(ctx,5,1840,105,23,1);ctx.restore();
      if(s.ramMs>0) {
        ctx.fillStyle=DASH_COLORS[1];ctx.font='bold 10px Oxanium, monospace';
        ctx.fillText(`${(Math.ceil(s.ramMs/100)/10).toFixed(1)}`,1844,137);
      }
      }
      // Lane shapes match road paint. Their bar countdown replaces long
      // permanent names; queue arrows remain distinct from captured parts.
      for(let lane=0;lane<4;lane++) {
        const xx=642+lane*171,capture=s.captures.find(item=>item.lane===lane);
        const queued=s.queuedCaptures.find(item=>item.lane===lane);
        ctx.fillStyle=capture?'#153d32':queued?'#332e20':'#091f23';ctx.fillRect(xx,132,162,27);
        ctx.strokeStyle=PALETTE[lane];ctx.globalAlpha=capture?.86:queued?.55:.23;
        ctx.strokeRect(xx+.5,132.5,161,26);ctx.globalAlpha=1;
        drawLaneMark(ctx,lane,xx+17,145,19,PALETTE[lane]);
        if(queued&&!capture) {
          hudIcon(ctx,7,xx+38,137,16,1);ctx.fillStyle=DASH_COLORS[1];
          ctx.font='bold 12px Oxanium, monospace';ctx.fillText('NEXT',xx+59,151);
        } else {
          const remaining=capture?Math.max(0,Math.ceil((capture.endBeat-s.musicBeatFloat)/4)):0;
          hudDigits(ctx,capture?remaining:'-',xx+40,136,20);
          if(capture){ctx.fillStyle='#a9c9bc';ctx.font='bold 10px Oxanium, monospace';ctx.fillText('B',xx+68,152);}
          hudSegments(ctx,xx+83,146,68,6,capture?
            (capture.endBeat-s.musicBeatFloat)/Math.max(4,capture.endBeat-capture.startBeat):0);
          if(queued) {
            hudIcon(ctx,7,xx+83,134,10,1);ctx.fillStyle=DASH_COLORS[1];
            ctx.font='bold 9px Oxanium, monospace';ctx.fillText('NEXT',xx+98,142);
          }
        }
        if(s.fullAdrenaline) {
          ctx.fillStyle='#ffd28d';ctx.fillRect(xx+4,155,154,2);
        }
      }
      // One visual guidance layer owns route, split and outcome feedback;
      if(this.status==='playing'&&B.CacheRoadCrewCallouts)B.CacheRoadCrewCallouts.draw(ctx,s);
      else if(this.status==='playing'&&s.crosswalkToast) {
        ctx.save();ctx.fillStyle='#211e2ef0';ctx.fillRect(514,177,892,57);
        ctx.strokeStyle='#ffd19b';ctx.lineWidth=2;ctx.strokeRect(514,177,892,57);
        ctx.fillStyle='#ffe5bc';ctx.textAlign='center';ctx.font='bold 23px Oxanium, monospace';
        ctx.fillText(s.crosswalkToast.message,960,212,840);ctx.restore();
      }
      // do not repeat the same event as a scrolling dashboard sentence.
      B.CacheRoadGuidance?.draw(ctx,this,{nextPulse,nextCue,reduced});
      const cue = !B.CacheRoadGuidance&&this.openingCue();
      if (cue) {
        ctx.fillStyle = '#081824d9'; ctx.fillRect(30, 176, 875, 82);
        ctx.fillStyle = '#90efda'; ctx.fillRect(30, 176, 5, 82);
        ctx.textAlign = 'left'; ctx.fillStyle = '#aaf1dc';
        ctx.font = 'bold 13px Oxanium, monospace';
        ctx.fillText('DELIVER THE ORIGINAL RECORDING  /  THE CLEAN COPY ERASED THE NAMES', 48, 196, 835);
        ctx.fillStyle = '#fff5df'; ctx.font = 'bold 21px Oxanium, monospace'; ctx.fillText(cue[0], 48, 222, 835);
        ctx.fillStyle = '#c8e0df'; ctx.font = '17px Oxanium, monospace'; ctx.fillText(cue[1], 48, 246, 835);
      }
      if (this.audioDegraded) {
        ctx.fillStyle = '#ffbb8b'; ctx.font = '20px Oxanium, monospace'; ctx.textAlign = 'center';
        ctx.fillText('AUDIO FALLBACK — MIX TIMBRE / ALIGNMENT NEEDS RECHECK', 960, 365);
      }
      if (this.status !== 'playing'&&this.outroMs==null) {
        ctx.fillStyle = '#061320ed'; ctx.fillRect(370, 280, 1180, 485);
        ctx.strokeStyle = '#9cf9df'; ctx.lineWidth = 3; ctx.strokeRect(370, 280, 1180, 485);
        ctx.fillStyle = '#f5f1ee'; ctx.font = 'bold 47px Oxanium, monospace'; ctx.textAlign = 'center';
        ctx.fillText(this.status === 'clear' ? 'ORIGINAL TAPE DELIVERED' :
          s.message === 'CACHE MUSIC UNAVAILABLE' ? 'CACHE MUSIC UNAVAILABLE' :
          s.gateFailure ? s.combat?'PURSUIT STILL ACTIVE':'ORIGINAL EXIT MISSED' :
          s.timeMs <= 0 ? 'TRANSMISSION WINDOW CLOSED' : 'SIGNAL LOST', 960, 380);
        ctx.font = '25px Oxanium, monospace'; ctx.fillStyle = '#9cf9df';
        ctx.fillText(this.status === 'clear' ? this.chapter?.delivery ?
          'BASS RECOVERED — THE DISTRIBUTION BLOCKADE REMAINS.' :
          'DELIVERED / UNVERIFIED — Mac sees the distribution blockade.' :
          s.combat ? 'Fight the pursuit. Attack openings, Defend contact and Disrupt locks.' :
          s.gateFailure === 'wrong-lane' ? 'Cache must take the far-right marked original exit.' :
          s.gateFailure === 'no-echo' ? 'Send Buffer Echo after the exit cue, then steer right.' :
          s.gateFailure === 'no-split' ? 'Give the Echo another lane so the audit follows it.' :
          s.message === 'CACHE MUSIC UNAVAILABLE' ? 'Check audio, then retry from the start line.' :
          'Your last road marker remains. Draft, brake and use an Echo to split the audit.', 960, 458);
        ctx.fillStyle = '#e6c8b5'; ctx.font = '22px Oxanium, monospace';
        ctx.fillText(this.status === 'clear' ? this.chapter?.delivery ?
          'Cache kept the original. Mac takes the route from here.' :
          'Legacy delivery. Replay the full run to recover Bass.' :
          s.combat ? 'Your last road marker remains. Keep data in sync for power and earned points.' :
          s.gateFailure ? 'Retry starts at the Mirror Viaduct marker with a full Echo.' :
          '↑ ↓ queue gears for the next bar. Collisions cost time and a recovery bar.', 960, 506);
        if (this.chapter?.delivery) {
          const result=this.chapter.delivery.result;
          const seconds=Math.floor(result.elapsedMs/1000);
          const time=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
          ctx.fillStyle='#bdd7d0';ctx.font='18px Oxanium, monospace';
          ctx.fillText(`SCORE ${result.score}   ·   RECORDS ${result.discoveries}/4   ·   ${time}   ·   DAMAGE ${result.damageTaken}   ·   RETRIES ${result.retries}`,960,541,1040);
        }
        for (const button of this.resultButtons()) {
          ctx.fillStyle='#12323e';ctx.fillRect(button.x,button.y,button.w,button.h);
          ctx.strokeStyle='#83bdb8';ctx.lineWidth=2;ctx.strokeRect(button.x,button.y,button.w,button.h);
          ctx.fillStyle='#f5e8cd';ctx.font='bold 20px Oxanium, monospace';
          ctx.fillText(button.label,button.x+button.w/2,button.y+30,button.w-20);
          ctx.fillStyle='#b9d8d7';ctx.font='15px Oxanium, monospace';
          ctx.fillText(button.key,button.x+button.w/2,button.y+55,button.w-20);
        }
        ctx.fillStyle='#c7d8d6';ctx.font='17px Oxanium, monospace';
        const resultPrompt = (key,index) => B.GamepadUI?.connected ? B.ControllerSettings?.button(index) || key : key;
        ctx.fillText(`${resultPrompt('P',9)}: SETTINGS + RECORD ARCHIVE`,960,674);
        if (this.chapter?.delivery) {
          const saved=B.CacheChapter?.saveStatus(this)==='saved';
          ctx.fillStyle=saved?'#a4d0bd':'#ffd398';
          ctx.fillText(saved?'DELIVERY SAVED':`SAVE UNAVAILABLE  ·  ${resultPrompt('S',1)} / CLICK TO RETRY SAVE`,960,711,920);
        }
      }
      ctx.restore();
      if(cinema&&cinema.kind!=='handoff') {
        B.CacheRoadCinematics.drawOverlay(frameContext,cinema,{reducedMotion:reduced,
          button:B.GamepadUI?.connected?B.ControllerSettings?.button(0)||'A':'ENTER'});
      }
      finishRender();
    }
  };
  B.Campaign.register(ID, { validate: saved => road.validate(saved), restore: saved => road.restore(saved) });
  B.Campaign.syncTitleButton();
})(window.BARCODE = window.BARCODE || {});
