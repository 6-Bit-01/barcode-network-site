// Shared image/bitmap cache. One bounded pinned/bundled attempt per asset;
// no canvases, timers, frame loops or gameplay state. Reused across restarts.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/engine/presentation-assets.js', exports: ['BARCODE.PresentationAssets'], dependencies: [] });
(function() {
  const B = window.BARCODE = window.BARCODE || {};
  const root = './';
  const rebuildRoot = './';
  const railRoot = './';
  const streetRoot = './';
  const slimRoot = './';
  const upperRoot = './';
  const finaleRoot = './';
  const polishRoot = './';
  // Makko imports may omit local binary art; use the merged artwork first.
  const cacheRoadRoot = './';
  const cachePlacesRoot = './';
  const cacheRoadsideRoot = './';
  const cacheTerrainRoot = './';
  const cacheInhabitedRoot = './';
  const cacheStreetLifeRoot = './';
  // The six-family optimized art is present at this published immutable
  // review commit; Makko can load it even when an import omits binaries.
  const cacheDistrictRoot = './';
  // All fifteen new area paintings share one immutable asset commit. Makko
  // can request the pinned art even if its import omits bundled binary files;
  // the same relative paths remain the local preview fallback.
  const cacheNewPlacesRoot = './';
  // PR #142 contains the finished painted sheets and cues. Hosted imports
  // use this immutable source; the shared loader retains bundled fallback.
  const cachePaintedRoot = './';
  // New travel art is pinned to the exact binary commit. The original still
  // cutouts below remain available while a new sheet loads or falls back.
  const cachePedestrianRoot = './';
  const cacheActivityRoot = './';
  // Static dashboard artwork is versioned independently of live values.
  const cacheDashboardRoot = './';
  const cacheEncounterRoot = './';
  // New art is bundled during local review; publication pins the exact art commit.
  const speedEffectsRoot = './';
  // Publication replaces this review token with the exact immutable art commit.
  const PURSUIT_ART_REV = 'c9ec41555ff7c473fb4119eb68a1438cebe4bd37';
  const cachePursuitRoot = `./`;
  const COMBAT_ART_REV = '12af86c0641456cc443ff7f42db013e565088b13';
  const cacheCombatRoot = `./`;
  const cacheBloodCrewRoot = './';
  const cacheBeatRoot = './';
  const entries = {
    cacheBeatHardware: {path:'assets/cache-road/beat-system/hardware-atlas.webp',root:cacheBeatRoot,columns:4,rows:2,frames:8,ax:.5,ay:.5,smooth:true},
    cacheBeatEnergy: {path:'assets/cache-road/beat-system/energy-atlas.webp',root:cacheBeatRoot,columns:4,rows:3,frames:12,ax:.5,ay:.5,smooth:true,frameCrops:{"0":[51,8,284,367],"1":[42,8,285,367],"2":[37,9,285,366],"3":[29,8,285,367],"4":[20,0,337,358],"5":[9,0,348,355],"6":[10,0,352,359],"7":[0,0,353,362],"8":[35,5,301,309],"9":[19,7,312,317],"10":[14,5,317,333],"11":[22,0,289,329]}},
    cacheBeatTiming: {path:'assets/cache-road/beat-system/timing-atlas.webp',root:cacheBeatRoot,columns:4,rows:2,frames:8,ax:.5,ay:.5,smooth:true,frameCrops:{"0":[22,92,397,392],"1":[23,90,397,394],"2":[27,91,416,393],"3":[0,61,444,447],"4":[7,63,429,196],"5":[10,52,429,211],"6":[13,72,420,185],"7":[6,66,438,200]}},
    cacheBloodSplatter: {path:'assets/cache-road/blood/blood-splatter-atlas.webp',root:cacheBloodCrewRoot,columns:3,rows:2,frames:6,ax:.5,ay:1,smooth:true},
    cacheCrewCallouts: {path:'assets/cache-road/blood/crew-callout-portraits.webp',root:cacheBloodCrewRoot,columns:3,rows:1,frames:3,ax:.5,ay:.5,smooth:true},
    cacheCombatBike: {path:'assets/cache-road/combat/bike-rider-atlas.webp',root:cacheCombatRoot,columns:4,rows:2,frames:8,ax:.5,ay:1,smooth:true},
    cacheCombatHostiles: {path:'assets/cache-road/combat/hostile-chassis-atlas.webp',root:cacheCombatRoot,columns:4,rows:3,frames:12,ax:.5,ay:1,smooth:true},
    cacheCombatBikeCrash: {path:'assets/cache-road/combat/bike-crash-atlas.webp',root:cacheCombatRoot,columns:3,rows:2,frames:6,ax:.5,ay:1,smooth:true},
    cacheCombatFX: {path:'assets/cache-road/combat/projectile-contact-atlas.webp',root:'./',columns:4,rows:3,frames:12,ax:.5,ay:.5,smooth:true},
    cacheCombatBlast: {path:'assets/cache-road/combat/combat-blast-atlas.webp',root:cacheCombatRoot,columns:3,rows:2,frames:6,ax:.5,ay:.5,smooth:true},
    cachePursuitRig: { path: 'assets/cache-road/pursuit/pursuit-rig-atlas.webp', root: cachePursuitRoot,
      columns: 4, rows: 2, frames: 8, ax: .5, ay: 473 / 512, smooth: true },
    cachePursuitImpact: { path: 'assets/cache-road/pursuit/pursuit-impact-atlas.webp', root: cachePursuitRoot,
      columns: 3, rows: 2, frames: 6, liveFrames: [0, 1, 4, 5], ax: .5, ay: .5, smooth: true },
    cacheWindWhoosh: {path:'assets/cache-road/effects/wind-streak-atlas-v2.png',root:speedEffectsRoot,columns:3,rows:2,frames:6,liveFrames:[0,1,2,3,5],ax:.5,ay:.5,smooth:true},
    cachePushArc: { path: 'assets/cache-road/encounters/push-arc.webp', root: cacheEncounterRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: .78, smooth: true },
    cacheBraceHalo: { path: 'assets/cache-road/encounters/brace-halo.webp', root: cacheEncounterRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: .75, smooth: true },
    cacheEchoRibbons: { path: 'assets/cache-road/encounters/echo-ribbons.webp', root: cacheEncounterRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: .78, smooth: true },
    cacheDeliveryBeacon: { path: 'assets/cache-road/encounters/delivery-beacon.webp', root: cacheEncounterRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: .96, smooth: true },
    cacheDashBezel: { path: 'assets/cache-road/hud/digital-dashboard/instrument-bezel.png', root: cacheDashboardRoot,
      columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheDashDigits: { path: 'assets/cache-road/hud/digital-dashboard/vfd-digits.svg', root: cacheDashboardRoot,
      columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheDashIcons: { path: 'assets/cache-road/hud/digital-dashboard/instrument-icons.svg', root: cacheDashboardRoot,
      columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheMirror: { path: 'assets/cache-road/hud/cache-back-mirror-expressions.webp', root: cacheRoadRoot,
      columns: 3, rows: 2, frames: 6, ax: .5, ay: .5, smooth: true },
    cacheCar: { path: 'assets/cache-road/vehicles/animation/cache-center-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheCarLeft: { path: 'assets/cache-road/vehicles/animation/cache-left-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheCarRight: { path: 'assets/cache-road/vehicles/animation/cache-right-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheCarHit: { path: 'assets/cache-road/vehicles/animation/cache-hit-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheFreight: { path: 'assets/cache-road/vehicles/animation/freight-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheCourier: { path: 'assets/cache-road/vehicles/animation/courier-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheBarricade: { path: 'assets/cache-road/vehicles/barricade.webp', root: cacheRoadRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheRival: { path: 'assets/cache-road/vehicles/animation/rival-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheAudit: { path: 'assets/cache-road/vehicles/animation/audit-sedan-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheSweeper: { path: 'assets/cache-road/vehicles/animation/sweeper-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheTrike: { path: 'assets/cache-road/vehicles/animation/signal-trike-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheShuttle: { path: 'assets/cache-road/vehicles/animation/night-shuttle-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cachePlaceMarket: { path: 'assets/cache-road/roadside/places/corner-market.webp', root: cachePlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceHouse: { path: 'assets/cache-road/roadside/places/row-house.webp', root: cachePlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlacePark: { path: 'assets/cache-road/roadside/places/pocket-park.webp', root: cachePlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceGarage: { path: 'assets/cache-road/roadside/places/repair-garage.webp', root: cachePlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceApartment: { path: 'assets/cache-road/roadside/places/apartment.webp', root: cachePlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceDiner: { path: 'assets/cache-road/roadside/places/night-diner.webp', root: cachePlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceSubstation: { path: 'assets/cache-road/roadside/places/substation.webp', root: cachePlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceGarden: { path: 'assets/cache-road/roadside/places/hydroponics-horizon.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceConstruction: { path: 'assets/cache-road/roadside/places/fabrication-horizon.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceGardenRounded: { path: 'assets/cache-road/roadside/places/community-garden-rounded.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceGardenCompact: { path: 'assets/cache-road/roadside/places/community-garden-left-compact.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceGardenHorizon: { path: 'assets/cache-road/roadside/places/community-garden-horizon.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceConstructionRounded: { path: 'assets/cache-road/roadside/places/construction-yard-rounded.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceConstructionHorizon: { path: 'assets/cache-road/roadside/places/construction-yard-horizon.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceConstructionCompact: { path: 'assets/cache-road/roadside/places/construction-yard-right-compact.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceSignalOrchard: { path: 'assets/cache-road/roadside/places/signal-orchard.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceRelayExchange: { path: 'assets/cache-road/roadside/places/relay-exchange.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceDataReclamation: { path: 'assets/cache-road/roadside/places/data-reclamation.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceCapacitorExchange: { path: 'assets/cache-road/roadside/places/capacitor-exchange.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceNightDataMarket: { path: 'assets/cache-road/roadside/places/night-data-market.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceEncryptedPump: { path: 'assets/cache-road/roadside/places/encrypted-pump.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePlaceDroneServiceNode: { path: 'assets/cache-road/roadside/places/drone-service-node.webp', root: cacheNewPlacesRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheSkyline: { path: 'assets/cache-road/world/panorama-skyline.webp', root: cacheRoadsideRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 1, smooth: true },
    cacheDistantCity: { path: 'assets/cache-road/world/bridge-free-distance.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 1, smooth: true },
    cacheOutskirts: { path: 'assets/cache-road/world/bridge-free-outskirts.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 1, smooth: true },
    cacheMidCity: { path: 'assets/cache-road/world/bridge-free-district.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 1, smooth: true },
    cacheGroundClusterL1: { path: 'assets/cache-road/world/ground-cluster-left-01.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGroundClusterL2: { path: 'assets/cache-road/world/ground-cluster-left-02.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGroundClusterL3: { path: 'assets/cache-road/world/ground-cluster-left-03.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGroundClusterR1: { path: 'assets/cache-road/world/ground-cluster-right-01.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGroundClusterR2: { path: 'assets/cache-road/world/ground-cluster-right-02.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGroundClusterR3: { path: 'assets/cache-road/world/ground-cluster-right-03.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopLRear: { path: 'assets/cache-road/world/blocks/block-workshop-L-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopLMiddle: { path: 'assets/cache-road/world/blocks/block-workshop-L-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopLMiddleDense: { path: 'assets/cache-road/world/blocks/block-workshop-L-middle-dense.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopLFrontGap: { path: 'assets/cache-road/world/blocks/block-workshop-L-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopLFrontFill: { path: 'assets/cache-road/world/blocks/block-workshop-L-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopRRear: { path: 'assets/cache-road/world/blocks/block-workshop-R-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopRMiddle: { path: 'assets/cache-road/world/blocks/block-workshop-R-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopRMiddleDense: { path: 'assets/cache-road/world/blocks/block-workshop-R-middle-dense.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopRFrontGap: { path: 'assets/cache-road/world/blocks/block-workshop-R-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopRFrontFill: { path: 'assets/cache-road/world/blocks/block-workshop-R-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheMarketLMiddle: { path: 'assets/cache-road/world/blocks/block-market-L-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheMarketLFrontGap: { path: 'assets/cache-road/world/blocks/block-market-L-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheMarketLFrontFill: { path: 'assets/cache-road/world/blocks/block-market-L-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheMarketRMiddle: { path: 'assets/cache-road/world/blocks/block-market-R-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheMarketLRear: { path: 'assets/cache-road/world/blocks/block-market-L-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheMarketRRear: { path: 'assets/cache-road/world/blocks/block-market-R-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheMarketRFrontGap: { path: 'assets/cache-road/world/blocks/block-market-R-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheMarketRFrontFill: { path: 'assets/cache-road/world/blocks/block-market-R-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheHomesLRear: { path: 'assets/cache-road/world/blocks/block-homes-L-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheHomesLMiddle: { path: 'assets/cache-road/world/blocks/block-homes-L-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheHomesLFrontGap: { path: 'assets/cache-road/world/blocks/block-homes-L-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheHomesLFrontFill: { path: 'assets/cache-road/world/blocks/block-homes-L-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheHomesRRear: { path: 'assets/cache-road/world/blocks/block-homes-R-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheHomesRMiddle: { path: 'assets/cache-road/world/blocks/block-homes-R-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheHomesRFrontGap: { path: 'assets/cache-road/world/blocks/block-homes-R-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheHomesRFrontFill: { path: 'assets/cache-road/world/blocks/block-homes-R-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseLRear: { path: 'assets/cache-road/world/blocks/block-greenhouse-L-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseLMiddle: { path: 'assets/cache-road/world/blocks/block-greenhouse-L-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseLFrontGap: { path: 'assets/cache-road/world/blocks/block-greenhouse-L-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseLFrontFill: { path: 'assets/cache-road/world/blocks/block-greenhouse-L-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseRRear: { path: 'assets/cache-road/world/blocks/block-greenhouse-R-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseRMiddle: { path: 'assets/cache-road/world/blocks/block-greenhouse-R-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseRFrontGap: { path: 'assets/cache-road/world/blocks/block-greenhouse-R-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseRFrontFill: { path: 'assets/cache-road/world/blocks/block-greenhouse-R-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheDataLRear: { path: 'assets/cache-road/world/blocks/block-data-L-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheDataLMiddle: { path: 'assets/cache-road/world/blocks/block-data-L-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheDataLFrontGap: { path: 'assets/cache-road/world/blocks/block-data-L-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheDataLFrontFill: { path: 'assets/cache-road/world/blocks/block-data-L-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheDataRRear: { path: 'assets/cache-road/world/blocks/block-data-R-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheDataRMiddle: { path: 'assets/cache-road/world/blocks/block-data-R-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheDataRFrontGap: { path: 'assets/cache-road/world/blocks/block-data-R-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheDataRFrontFill: { path: 'assets/cache-road/world/blocks/block-data-R-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheTransitLRear: { path: 'assets/cache-road/world/blocks/block-transit-L-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheTransitLMiddle: { path: 'assets/cache-road/world/blocks/block-transit-L-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheTransitLFrontGap: { path: 'assets/cache-road/world/blocks/block-transit-L-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheTransitLFrontFill: { path: 'assets/cache-road/world/blocks/block-transit-L-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheTransitRRear: { path: 'assets/cache-road/world/blocks/block-transit-R-rear.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheTransitRMiddle: { path: 'assets/cache-road/world/blocks/block-transit-R-middle.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheTransitRFrontGap: { path: 'assets/cache-road/world/blocks/block-transit-R-front-gap.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheTransitRFrontFill: { path: 'assets/cache-road/world/blocks/block-transit-R-front-fill.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheResidentialPaving: { path: 'assets/cache-road/world/materials/residential-paving.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheServiceCourtPaving: { path: 'assets/cache-road/world/materials/service-court-paving.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cachePlantedGravelCourt: { path: 'assets/cache-road/world/materials/planted-gravel-court.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheWalkerCourierToward: { path: 'assets/cache-road/world/props/walker-courier-toward.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerCourierAway: { path: 'assets/cache-road/world/props/walker-courier-away.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerMechanicToward: { path: 'assets/cache-road/world/props/walker-mechanic-toward.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerMechanicAway: { path: 'assets/cache-road/world/props/walker-mechanic-away.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerMarketWorkerToward: { path: 'assets/cache-road/world/props/walker-market-worker-toward.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerMarketWorkerAway: { path: 'assets/cache-road/world/props/walker-market-worker-away.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerStudentToward: { path: 'assets/cache-road/world/props/walker-student-toward.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerStudentAway: { path: 'assets/cache-road/world/props/walker-student-away.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerGardenerToward: { path: 'assets/cache-road/world/props/walker-gardener-toward.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerGardenerAway: { path: 'assets/cache-road/world/props/walker-gardener-away.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerResidentToward: { path: 'assets/cache-road/world/props/walker-resident-toward.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerResidentAway: { path: 'assets/cache-road/world/props/walker-resident-away.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheWalkerCourierTravel: { path: 'assets/cache-road/world/props/animation/walker-courier-frames.webp', root: cachePedestrianRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheWalkerMechanicTravel: { path: 'assets/cache-road/world/props/animation/walker-mechanic-frames.webp', root: cachePedestrianRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheWalkerMarketWorkerTravel: { path: 'assets/cache-road/world/props/animation/walker-market-worker-frames.webp', root: cachePedestrianRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheWalkerStudentTravel: { path: 'assets/cache-road/world/props/animation/walker-student-frames.webp', root: cachePedestrianRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheWalkerGardenerTravel: { path: 'assets/cache-road/world/props/animation/walker-gardener-frames.webp', root: cachePedestrianRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cacheWalkerResidentTravel: { path: 'assets/cache-road/world/props/animation/walker-resident-frames.webp', root: cachePedestrianRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cachePersonBicycleCourierTravel: { path: 'assets/cache-road/world/props/animation/person-bicycle-courier-frames.webp', root: cachePedestrianRoot, columns: 2, rows: 2, frames: 4, ax: .5, ay: 1, smooth: true },
    cachePersonSkateboarderTravel: { path: 'assets/cache-road/world/props/animation/person-skateboarder-frames.webp', root: cachePedestrianRoot, columns: 2, rows: 2, frames: 4, ax: .5, ay: 1, smooth: true },
    cachePersonCrateCarrierTravel: { path: 'assets/cache-road/world/props/animation/person-crate-carrier-frames.webp', root: cachePedestrianRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: 1, smooth: true },
    cachePersonSweeperActivity: { path: 'assets/cache-road/world/props/animation/person-sweeper-activity-frames.webp', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: .5, ay: 1, smooth: true },
    cachePersonGardenerActivity: { path: 'assets/cache-road/world/props/animation/person-gardener-activity-frames.webp', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: .5, ay: 1, smooth: true },
    cachePersonElectricianActivity: { path: 'assets/cache-road/world/props/animation/person-electrician-activity-frames.webp', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: .5, ay: 1, smooth: true },
    cachePersonWavingResidentActivity: { path: 'assets/cache-road/world/props/animation/person-waving-resident-activity-frames.webp', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: .5, ay: 1, smooth: true },
    cachePersonBoardPlayerActivity: { path: 'assets/cache-road/world/props/animation/person-board-player-activity-frames.webp', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: .5, ay: 1, smooth: true },
    cachePersonStreetCookActivity: { path: 'assets/cache-road/world/props/animation/person-street-cook-activity-frames.webp', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: .5, ay: 1, smooth: true },
    cachePersonHandheldPlayerTravel: { path: 'assets/cache-road/world/props/animation/person-handheld-player-activity-frames.webp', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: .5, ay: 1, smooth: true },
    cacheNewLampL: { path: 'assets/cache-road/world/props/animation/street-lamp-L-frames.webp', root: cachePaintedRoot, columns: 3, rows: 1, frames: 3, ax: 0.5, ay: 1, smooth: true },
    cacheNewLampR: { path: 'assets/cache-road/world/props/animation/street-lamp-R-frames.webp', root: cachePaintedRoot, columns: 3, rows: 1, frames: 3, ax: 0.5, ay: 1, smooth: true },
    cacheNewCrossingSignalL: { path: 'assets/cache-road/world/props/animation/street-crossing-signal-L-frames.webp', root: cachePaintedRoot, columns: 3, rows: 1, frames: 3, ax: 0.5, ay: 1, smooth: true },
    cacheNewCrossingSignalR: { path: 'assets/cache-road/world/props/animation/street-crossing-signal-R-frames.webp', root: cachePaintedRoot, columns: 3, rows: 1, frames: 3, ax: 0.5, ay: 1, smooth: true },
    cacheNewWayfindingSign: { path: 'assets/cache-road/world/props/animation/street-wayfinding-sign-frames.webp', root: cachePaintedRoot, columns: 3, rows: 1, frames: 3, ax: 0.5, ay: 1, smooth: true },
    cacheNewBinsRecycling: { path: 'assets/cache-road/world/props/street-bins-recycling.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheNewLoadingCrates: { path: 'assets/cache-road/world/props/street-loading-crates.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheNewUtilityCabinet: { path: 'assets/cache-road/world/props/animation/street-utility-cabinet-frames.webp', root: cachePaintedRoot, columns: 3, rows: 1, frames: 3, ax: 0.5, ay: 1, smooth: true },
    cacheNewVendorCart: { path: 'assets/cache-road/world/props/animation/street-vendor-cart-activity-frames.webp', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: 0.5, ay: 1, smooth: true },
    cacheNewFencePlanter: { path: 'assets/cache-road/world/props/street-fence-planter.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 1, smooth: true },
    cacheDecalCrosswalk: { path: 'assets/cache-road/world/decals/crosswalk.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0.5, smooth: true },
    cacheDecalStopLine: { path: 'assets/cache-road/world/decals/stop-line.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0.5, smooth: true },
    cacheDecalDrainage: { path: 'assets/cache-road/world/decals/drainage.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0.5, smooth: true },
    cacheDecalLoadingBay: { path: 'assets/cache-road/world/decals/loading-bay.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0.5, smooth: true },
    cacheDecalServiceStencil: { path: 'assets/cache-road/world/decals/service-stencil.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0.5, smooth: true },
    cacheDecalWetRepairPatch: { path: 'assets/cache-road/world/decals/wet-repair-patch.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0.5, smooth: true },
    cacheAmbientMarket: { path: 'assets/cache-road/world/ambient/market-practicals.svg', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: 0.5, ay: 0.5, smooth: true },
    cacheAmbientHomes: { path: 'assets/cache-road/world/ambient/homes-practicals.svg', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: 0.5, ay: 0.5, smooth: true },
    cacheAmbientWorkshop: { path: 'assets/cache-road/world/ambient/workshop-practicals.svg', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: 0.5, ay: 0.5, smooth: true },
    cacheAmbientGreenhouse: { path: 'assets/cache-road/world/ambient/greenhouse-practicals.svg', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: 0.5, ay: 0.5, smooth: true },
    cacheAmbientData: { path: 'assets/cache-road/world/ambient/data-practicals.svg', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: 0.5, ay: 0.5, smooth: true },
    cacheAmbientTransit: { path: 'assets/cache-road/world/ambient/transit-practicals.svg', root: cacheActivityRoot, columns: 4, rows: 1, frames: 4, ax: 0.5, ay: 0.5, smooth: true },
    cacheLocalStreet: { path: 'assets/cache-road/world/materials/wet-local-street.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheJoinLTurn: { path: 'assets/cache-road/world/joins/sidewalk-turn-L.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheJoinRTurn: { path: 'assets/cache-road/world/joins/sidewalk-turn-R.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheJoinLCurb: { path: 'assets/cache-road/world/joins/curb-return-L.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheJoinRCurb: { path: 'assets/cache-road/world/joins/curb-return-R.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheJoinLStreetWall: { path: 'assets/cache-road/world/joins/street-mouth-sidewall-L.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheJoinRStreetWall: { path: 'assets/cache-road/world/joins/street-mouth-sidewall-R.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheJoinLEndcap: { path: 'assets/cache-road/world/joins/wall-roof-endcap-L.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheJoinREndcap: { path: 'assets/cache-road/world/joins/wall-roof-endcap-R.svg', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheWorkshopPavement: { path: 'assets/cache-road/world/materials/workshop-wet-pavement.webp', root: cacheDistrictRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheTransitNook: { path: 'assets/cache-road/world/transit-service-nook.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheOutskirtsHomes: { path: 'assets/cache-road/world/outskirts-homes.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheUtilityCorner: { path: 'assets/cache-road/world/utility-service-corner.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheGreenhouseWorkshop: { path: 'assets/cache-road/world/greenhouse-workshop.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheOutskirtsWorkshops: { path: 'assets/cache-road/world/outskirts-workshops.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheRepairShop: { path: 'assets/cache-road/world/neighborhood-repair-shop.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheVendorStall: { path: 'assets/cache-road/world/street-vendor-people.webp', root: cacheInhabitedRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonCourier: { path: 'assets/cache-road/world/props/person-courier.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonMechanic: { path: 'assets/cache-road/world/props/person-mechanic.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonUmbrella: { path: 'assets/cache-road/world/props/person-umbrella.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonStudent: { path: 'assets/cache-road/world/props/person-student.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonFoodWorker: { path: 'assets/cache-road/world/props/person-food-worker.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonBicycleCourier: { path: 'assets/cache-road/world/props/person-bicycle-courier.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonSweeper: { path: 'assets/cache-road/world/props/person-sweeper.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonHandheldPlayer: { path: 'assets/cache-road/world/props/person-handheld-player.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonGardener: { path: 'assets/cache-road/world/props/person-gardener.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonElectrician: { path: 'assets/cache-road/world/props/person-electrician.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonWavingResident: { path: 'assets/cache-road/world/props/person-waving-resident.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonSkateboarder: { path: 'assets/cache-road/world/props/person-skateboarder.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonCrateCarrier: { path: 'assets/cache-road/world/props/person-crate-carrier.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonBoardPlayer: { path: 'assets/cache-road/world/props/person-board-player.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePersonStreetCook: { path: 'assets/cache-road/world/props/person-street-cook.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheStreetBicycleRack: { path: 'assets/cache-road/world/props/street-bicycle-rack.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheStreetWorkSupplies: { path: 'assets/cache-road/world/props/street-work-supplies.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheStreetDeliveryVan: { path: 'assets/cache-road/world/props/street-delivery-van.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheStreetBenchPlanters: { path: 'assets/cache-road/world/props/street-bench-planters.webp', root: cacheStreetLifeRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheStreetDataKiosk: { path: 'assets/cache-road/world/props/animation/street-data-kiosk-frames.webp', root: cachePaintedRoot, columns: 3, rows: 1, frames: 3, ax: .5, ay: 1, smooth: true },
    cacheParapet: { path: 'assets/cache-road/roadside/parapet.webp', root: cacheRoadRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cachePylon: { path: 'assets/cache-road/roadside/service-pylon.webp', root: cacheRoadRoot, columns: 1, rows: 1, frames: 1, ax: .28, ay: 1, smooth: true },
    cachePulsePad: { path: 'assets/cache-road/roadside/beat/pulse-pad.webp', root: cachePaintedRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cachePulseStrip: { path: 'assets/cache-road/roadside/beat/approach-strip.webp', root: cachePaintedRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cachePhraseStrip: { path: 'assets/cache-road/roadside/beat/beat-phrase.webp', root: cachePaintedRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheConfirmedBar: { path: 'assets/cache-road/roadside/beat/confirmed-bar.webp', root: cachePaintedRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cachePulseBurst: { path: 'assets/cache-road/roadside/beat/pulse-burst.webp', root: cachePaintedRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: .5, smooth: true },
    cachePulseSurge: { path: 'assets/cache-road/roadside/beat/animation/surge-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: .5, smooth: true },
    cachePulsePush: { path: 'assets/cache-road/roadside/beat/animation/push-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: .5, smooth: true },
    cachePulseBrace: { path: 'assets/cache-road/roadside/beat/animation/brace-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: .5, smooth: true },
    cachePulseRefill: { path: 'assets/cache-road/roadside/beat/animation/refill-frames.webp', root: cachePaintedRoot, columns: 4, rows: 2, frames: 8, ax: .5, ay: .5, smooth: true },
    cacheSidewalk: { path: 'assets/cache-road/roadside/sidewalk-slab.svg', root: cacheRoadsideRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheOuterGround: { path: 'assets/cache-road/roadside/continuous-ground-panel.svg', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheRollingGrain: { path: 'assets/cache-road/roadside/rolling-ground-grain.webp', root: cacheTerrainRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheGreenGround: { path: 'assets/cache-road/roadside/green-ground-panel.svg', root: cacheRoadsideRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheServiceGround: { path: 'assets/cache-road/roadside/service-ground-panel.svg', root: cacheRoadsideRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheImpactGrit: { path: 'assets/cache-road/effects/impact-grit.webp', root: cacheRoadRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheSpeedMist: { path: 'assets/cache-road/effects/speed-mist.webp', root: cacheRoadRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 1, smooth: true },
    cacheBrakeReflection: { path: 'assets/cache-road/effects/brake-reflection.webp', root: cachePaintedRoot, columns: 1, rows: 1, frames: 1, ax: .5, ay: 0, smooth: true },
    cacheDamagedExhaust: { path: 'assets/cache-road/effects/damaged-exhaust.webp', root: cachePaintedRoot, columns: 1, rows: 1, frames: 1, ax: 1, ay: 0, smooth: true },
    cacheBlacktop: { path: 'assets/wet-street/rain-blacktop.webp', root: cacheRoadRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    cacheFly1: { path: 'assets/traffic/ship-1.webp', root: cacheRoadRoot, columns: 8, rows: 11, frames: 81, ax: .5, ay: .5, smooth: false },
    cacheFly3: { path: 'assets/traffic/ship-3.webp', root: cacheRoadRoot, columns: 8, rows: 16, frames: 122, ax: .5, ay: .5, smooth: false },
    hudExpressions: { path: 'assets/feedback-polish/hud-expressions.webp', root: polishRoot, columns: 3, rows: 2, frames: 6, ax: .5, ay: .5, smooth: true },
    platformFacades: { path: 'assets/feedback-polish/platform-facades.webp', root: polishRoot, columns: 3, rows: 1, frames: 3, ax: 0, ay: 0, smooth: true },
    platformSideLeft: { path: 'assets/feedback-polish/platform-side-left.webp', root: polishRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    platformSideRight: { path: 'assets/feedback-polish/platform-side-right.webp', root: polishRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    studioCat: { path: 'assets/presentation/studio-cat.webp', columns: 2, rows: 2, frames: 4, ax: 0.5, ay: 0.9375 },
    directionArrow: { path: 'assets/presentation/direction-arrow.webp', columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0.5 },
    bossPulse: { path: 'assets/presentation/boss-pulse.webp', columns: 2, rows: 2, frames: 4, crop: [10, 95, 236, 145], ax: 0.5, ay: 1, smooth: true },
    hudPortrait: { path: 'assets/studies/visual-overhaul/prepared/hud-portrait.webp', root: './', columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0.5, smooth: true },
    thinWallRail: { path:'assets/thin-rails/wall.webp', root:railRoot, columns:1, rows:1, frames:1, ax:0.5, ay:0.5, smooth:true },
    thinPavementRail: { path:'assets/thin-rails/pavement.webp', root:railRoot, columns:1, rows:1, frames:1, ax:0.5, ay:0.5, smooth:true },
    thinRailElbow: { path:'assets/thin-rails/elbow.webp', root:railRoot, columns:1, rows:1, frames:1, ax:0.5, ay:0.5, smooth:true },
    thinRailCap: { path:'assets/thin-rails/cap.webp', root:railRoot, columns:1, rows:1, frames:1, ax:0.5, ay:0.5, smooth:true },
    rooftopDrone: { path:'assets/level1-rebuild/rooftop-drone.webp', root:rebuildRoot, columns:4, rows:2, frames:8, ax:0.5, ay:0.5, smooth:true },
    broadcastTerminal: { path:'assets/street-hardware/broadcast-terminal.webp', root:streetRoot, columns:1, rows:1, frames:1, ax:0, ay:0, smooth:true },
    gateHardware1: { path:'assets/street-hardware/slim-gate-1.webp', root:slimRoot, columns:2, rows:1, frames:2, ax:0, ay:0, smooth:true },
    gateHardware2: { path:'assets/street-hardware/slim-gate-2.webp', root:slimRoot, columns:2, rows:1, frames:2, ax:0, ay:0, smooth:true },
    gateHardware3: { path:'assets/street-hardware/slim-gate-3.webp', root:slimRoot, columns:2, rows:1, frames:2, ax:0, ay:0, smooth:true },
    gateHardware4: { path:'assets/street-hardware/slim-gate-4.webp', root:slimRoot, columns:2, rows:1, frames:2, ax:0, ay:0, smooth:true },
    rhythmLift: { path: 'assets/upper-route/rhythm-lift.webp', root: upperRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0.32, smooth: true },
    liftCabin: { path: 'assets/finale/lift-cabin.webp', root: finaleRoot, columns: 1, rows: 1, frames: 1, ax: 0, ay: 0.795, smooth: true },
    liftTrack: { path: 'assets/finale/lift-track.webp', root: finaleRoot, columns: 1, rows: 1, frames: 1, ax: 0.5, ay: 0, smooth: true },
    studioCatEvent: { path: 'assets/finale/studio-cat-event.webp', root: finaleRoot, columns: 4, rows: 3, frames: 12, ax: 0.5, ay: 348 / 384, smooth: true },
    bossFlourish: { path: 'assets/upper-route/boss-flourish.webp', root: upperRoot, columns: 4, rows: 3, frames: 12, ax: 0.5, ay: 0.9375, smooth: true },
    bossLeap: { path: 'assets/upper-route/boss-leap.webp', root: upperRoot, columns: 4, rows: 2, frames: 8, ax: 0.5, ay: 0.9375, smooth: true },
    wetStreet: { path: 'assets/wet-street/rain-blacktop.webp', root: './', columns: 1, rows: 1, frames: 1, ax: 0, ay: 0, smooth: true },
    steadyJammer: { path: 'assets/sprites-v3/prepared/broadcast_jammer_idle_idle.webp', root: './', columns: 8, rows: 6, frames: 48, ax: 0.5, ay: 340 / 352, smooth: true },
    // Local delivery while authoring; publication pins these two new atlases.
    level1SignalDischarge: {path:'assets/level1-signal-art/signal-discharge-atlas.webp',root:'./',
      columns:4,rows:2,frames:8,ax:0,ay:0,smooth:true},
    level1SignalAmp: {path:'assets/level1-signal-art/signal-amp-atlas.webp',root:'./',
      columns:4,rows:2,frames:8,ax:.5,ay:.5,smooth:true},
  };
  const cache = {};
  // The standalone adapter opts into scene lifetimes. Embedded/Makko callers
  // keep the original eager catalog unless they explicitly select a scene.
  let sceneKeys=B.StandaloneSprites?new Set(Object.keys(entries).filter(key=>!/^cache/.test(key))):null;
  let sceneNativeKeys=null,sceneGeneration=0;
  const roadNativeKeys=Object.freeze([
    'cacheMirror','cacheCar','cacheCarLeft','cacheCarRight','cacheCarHit',
    'cacheDashBezel','cacheDashDigits','cacheDashIcons','cachePulsePad',
    'cachePulseStrip','cachePulseBurst','cachePulseSurge','cachePulsePush',
    'cachePulseBrace','cachePulseRefill','cacheWindWhoosh','cachePushArc',
    'cacheBraceHalo','cacheEchoRibbons','cacheDeliveryBeacon','cacheImpactGrit',
    'cacheBeatHardware','cacheBeatEnergy','cacheBeatTiming','cacheCombatFX','cacheCrewCallouts'
  ]);
  const roadNativeShared=Object.freeze([
    'cacheFreight','cacheCourier','cacheBarricade','cacheRival','cacheAudit',
    'cacheSweeper','cacheTrike','cacheShuttle','cacheBrakeReflection',
    'cacheDamagedExhaust','cacheSpeedMist','cacheCombatBike','cacheCombatHostiles',
    'cacheCombatBikeCrash','cacheCombatBlast','cacheBloodSplatter','cachePursuitRig','cachePursuitImpact'
  ]);
  const roadFallbacks=Object.freeze([
    ['cachePersonElectricianActivity','cachePersonElectrician'],
    ['cachePersonWavingResidentActivity','cachePersonWavingResident'],
    ['cachePersonHandheldPlayerTravel','cachePersonHandheldPlayer'],
    ['cachePersonCrateCarrierTravel','cachePersonCrateCarrier'],
    ['cachePersonSkateboarderTravel','cachePersonSkateboarder'],
    ['cachePersonGardenerActivity','cachePersonGardener'],
    ['cachePersonBicycleCourierTravel','cachePersonBicycleCourier'],
    ['cachePersonSweeperActivity','cachePersonSweeper'],
    ['cachePersonBoardPlayerActivity','cachePersonBoardPlayer'],
    ['cachePersonStreetCookActivity','cachePersonStreetCook'],
    ...['Courier','Mechanic','MarketWorker','Student','Gardener','Resident'].flatMap(identity=>
      ['Toward','Away'].map(direction=>['cacheWalker'+identity+'Travel','cacheWalker'+identity+direction]))
  ]);
  const selected=key=>sceneKeys===null||sceneKeys.has(key);
  const nativeAllowed=key=>selected(key)&&(sceneNativeKeys===null||sceneNativeKeys.has(key));
  const currentAsset=(key,state)=>cache[key]===state&&!state.released;
  const currentDerivative=(key,state,generation)=>currentAsset(key,state)&&nativeAllowed(key)&&
    (state.derivativeGeneration||0)===generation;
  const rasterDetail=new WeakMap(),decorationDetail=new WeakMap(),MAX_RASTER_PIXELS=32*1024*1024;
  const diffuseEffects=new Set(['cacheSpeedMist','cacheWindWhoosh','cacheImpactGrit']);
  const backgroundSources=new Set(Object.entries(entries).filter(([key,entry])=>/^cache/.test(key)&&
    (/^assets\/cache-road\/(world|roadside)\//.test(entry.path)&&!entry.path.includes('/beat/')||
      ['cacheBlacktop','cacheFly1','cacheFly3'].includes(key))).map(([key])=>key));
  const nativeSmallSources=new Set(['cacheBrakeReflection','cacheDamagedExhaust',
    'cachePhraseStrip','cacheConfirmedBar','cachePulsePad','cachePulseStrip','cachePulseBurst']);
  const nativeDecodeSources=new Set(['cacheRepairShop','cacheMarketRFrontGap',
    'cacheStreetBicycleRack','cacheBlacktop','cacheGreenhouseWorkshop']);
  const nativeDeferredSources=new Set(['cacheBeatEnergy','cachePhraseStrip','cacheConfirmedBar']);
  // Hold these exact whole-source slots before asynchronous load order can
  // spend the pool on optional atlases. These are canonical source dimensions.
  const nativePriorityDimensions=new Map([
    ['cacheBlacktop',2172*724],['cacheGreenhouseWorkshop',1536*1024]]);
  const nativePriorityReservations=new Map(nativePriorityDimensions);
  const nativePriorityReservedPixels=[...nativePriorityReservations.values()].reduce((sum,pixels)=>sum+pixels,0);
  let rasterPixels=0,nativeRasterPixels=nativePriorityReservedPixels,nativeSmallPixels=0;
  let backgroundRasterRequested=false,diffuseRasterRequested=false;
  const MAX_NATIVE_SMALL_PIXELS=1536*1024;
  const MAX_NATIVE_RASTER_PIXELS=32*1024*1024;
  function releaseNativePriorityReservation(key) {
    const pixels=nativePriorityReservations.get(key)||0;
    if(pixels){nativePriorityReservations.delete(key);nativeRasterPixels-=pixels;}
    return pixels;
  }
  function reservePixels(state,pixels,{native=false,small=false}={}) {
    if(native)nativeRasterPixels+=pixels;else rasterPixels+=pixels;
    if(small)nativeSmallPixels+=pixels;
    const allocations=state.allocations||(state.allocations=new Set());let held=true;
    const release=()=>{
      if(!held)return;held=false;allocations.delete(release);
      if(native)nativeRasterPixels-=pixels;else rasterPixels-=pixels;
      if(small)nativeSmallPixels-=pixels;
    };
    allocations.add(release);return release;
  }
  function releaseDerivatives(state) {
    state.derivativeGeneration=(state.derivativeGeneration||0)+1;
    for(const cancel of state.pendingJobs||[])cancel();
    state.pendingJobs?.clear();
    for(const release of [...(state.allocations||[])])release();
    const bitmaps=new Set([state.bitmap,state.nativeBitmap,state.rasterBitmap,state.brakeTintBitmap,
      ...(state.nativeFrames||[]),...(state.nativeWindows||[]).map(window=>window?.bitmap)]);
    for(const bitmap of bitmaps)bitmap?.close?.();
    for(const field of ['bitmap','nativeBitmap','rasterBitmap','brakeTintBitmap','nativeFrames','nativeWindows'])delete state[field];
    state.nativePending=false;state.nativeAttempted=false;state.nativeFrameAttempts?.clear();
    state.rasterPending=false;state.rasterAttempted=false;
    state.brakeTintPending=false;state.brakeTintAttempted=false;state.svgAttempted=false;
  }
  function releaseAsset(key) {
    const state=cache[key];releaseNativePriorityReservation(key);if(!state)return;
    state.released=true;releaseDerivatives(state);state.resolveReady?.(false);state.resolveReady=null;
    const image=state.image;
    if(image){image.onload=null;image.onerror=null;
      if(typeof image.removeAttribute==='function')image.removeAttribute('src');else image.src='';}
    state.image=null;state.ready=false;delete cache[key];
  }
  function selectScene(keys,{nativeKeys=null}={}) {
    if(keys!==null&&!Array.isArray(keys)||nativeKeys!==null&&!Array.isArray(nativeKeys))
      throw TypeError('Presentation scene keys must be arrays or null');
    sceneGeneration++;
    sceneKeys=keys===null?null:new Set(keys.filter(key=>Object.hasOwn(entries,key)));
    sceneNativeKeys=nativeKeys===null?null:new Set(nativeKeys.filter(key=>Object.hasOwn(entries,key)));
    for(const key of Object.keys(cache)){
      if(!selected(key))releaseAsset(key);
      else if(!nativeAllowed(key))releaseDerivatives(cache[key]);
    }
    for(const key of [...nativePriorityReservations.keys()])if(!nativeAllowed(key))releaseNativePriorityReservation(key);
    preload(null);
    // A retained original can regain optional native preparation on a later
    // native scene without refetching or weakening its original readiness.
    for(const [key,state] of Object.entries(cache))if(state.ready&&nativeAllowed(key))prepareDerivatives(key,entries[key],state);
    return sceneGeneration;
  }
  function releaseScene(){return selectScene([],{nativeKeys:[]});}
  async function selectLevel1Scene() {
    const keys=Object.keys(entries).filter(key=>!/^cache/.test(key)),generation=selectScene(keys);
    const sources=await waitForGpuSources(keys);return generation===sceneGeneration?sources:[];
  }
  async function selectRoadScene(gpuKeys) {
    const primary=[...new Set([...(gpuKeys||[]),...roadNativeKeys])],
      native=[...roadNativeKeys,...roadNativeShared];
    let generation=selectScene(primary,{nativeKeys:native});
    await waitForGpuSources(primary);
    if(generation!==sceneGeneration)return {cancelled:true};
    // Planted poses are an existing failed-animation fallback. Load them only
    // after the corresponding original animation exhausts its two attempts.
    const fallbackKeys=[...new Set(roadFallbacks.filter(([animation])=>primary.includes(animation)&&!cache[animation]?.ready)
      .map(([,fallback])=>fallback))];
    const keys=[...new Set([...primary,...fallbackKeys])];
    if(fallbackKeys.length){generation=selectScene(keys,{nativeKeys:[...native,...fallbackKeys]});await waitForGpuSources(fallbackKeys);}
    if(generation!==sceneGeneration)return {cancelled:true};
    return {cancelled:false,keys,fallbackKeys,missingKeys:keys.filter(key=>!cache[key]?.ready)};
  }
  function prepareNativeRaster(key,entry,state,requested=false,requestedFrames=null) {
    if(!currentAsset(key,state)||!nativeAllowed(key)){releaseNativePriorityReservation(key);return false;}
    if(!requested&&nativeDeferredSources.has(key)||state.nativePending)return false;
    const image=state.image,w=image.naturalWidth,h=image.naturalHeight;
    const fw=w/entry.columns,fh=h/entry.rows,cells=entry.columns*entry.rows;
    const grid=entry.frames===cells&&Number.isInteger(fw)&&Number.isInteger(fh);
    const windowCrop=grid&&key==='cacheDashBezel'&&fw>=2032&&fh>=634?
      [10,118,2022,516]:grid&&key==='cacheMirror'&&fw>=452&&fh>=337?
      [0,148,452,189]:grid&&key==='cacheBrakeReflection'&&fw>=194&&fh>=290?
      [0,0,194,290]:null;
    const sourcePixels=windowCrop?windowCrop[2]*windowCrop[3]*cells:w*h;
    const smallNative=nativeSmallSources.has(key),priority=nativePriorityReservations.get(key)||0;
    const eligible=/^cache/.test(key)&&(/^assets\/cache-road\/(vehicles\/animation|combat|beat-system|hud)\//.test(entry.path)||
      key==='cachePursuitRig'||smallNative||nativeDecodeSources.has(key));
    if(!eligible||/\.svg$/i.test(entry.path)||!windowCrop&&sourcePixels<(smallNative?32:256)*1024||
      typeof window.createImageBitmap!=='function'){
      releaseNativePriorityReservation(key);return false;
    }
    const framed=!!windowCrop||cells>1&&grid;
    if(requestedFrames!==null&&(!Array.isArray(requestedFrames)||!requestedFrames.length||
      requestedFrames.some(index=>!Number.isInteger(index)||index<0||index>=(framed?cells:1))))return false;
    const indices=framed?[...new Set(requestedFrames||(!requested&&key==='cacheBeatTiming'?[0,1,2]:
      Array.from({length:cells},(_,index)=>index)))].filter(index=>!state.nativeFrameAttempts?.has(index)):[0];
    if(!indices.length||!framed&&state.nativeAttempted)return false;
    const crop=windowCrop||[0,0,fw,fh],cw=crop[2],ch=crop[3];
    const pixels=framed?cw*ch*indices.length:w*h;
    if(smallNative&&pixels>MAX_NATIVE_SMALL_PIXELS-nativeSmallPixels||
      pixels>MAX_NATIVE_RASTER_PIXELS-nativeRasterPixels+priority){
      // A changed/unsupported priority source cannot strand its reserved slot.
      releaseNativePriorityReservation(key);return false;
    }
    releaseNativePriorityReservation(key);
    const release=reservePixels(state,pixels,{native:true,small:smallNative}),generation=state.derivativeGeneration||0;
    state.nativePending=true;
    const fallback=()=>{release();if(currentDerivative(key,state,generation))state.nativePending=false;};
    if(framed) {
      const attempted=state.nativeFrameAttempts||(state.nativeFrameAttempts=new Set());
      for(const index of indices)attempted.add(index);
      const preparations=indices.map(index=>Promise.resolve().then(()=>
        currentDerivative(key,state,generation)?window.createImageBitmap(image,index%entry.columns*fw+crop[0],
          Math.floor(index/entry.columns)*fh+crop[1],cw,ch):null));
      Promise.allSettled(preparations).then(results=>{
        const valid=currentDerivative(key,state,generation)&&results.every(result=>result.status==='fulfilled'&&
          result.value?.width===cw&&result.value?.height===ch);
        if(!valid){
          for(const result of results)if(result.status==='fulfilled')result.value?.close?.();
          fallback();return;
        }
        const destination=windowCrop?(state.nativeWindows||(state.nativeWindows=Array(cells))):
          (state.nativeFrames||(state.nativeFrames=Array(cells)));
        for(let at=0;at<indices.length;at++)destination[indices[at]]=windowCrop?
          {bitmap:results[at].value,crop}:results[at].value;
        state.nativePending=false;
      });
      return true;
    }
    state.nativeAttempted=true;
    try {
      Promise.resolve(window.createImageBitmap(image)).then(bitmap=>{
        if(!currentDerivative(key,state,generation)||bitmap?.width!==w||bitmap?.height!==h){bitmap?.close?.();fallback();return;}
        state.nativeBitmap=bitmap;state.nativePending=false;
      },fallback);
    } catch {fallback();}
    return true;
  }
  // Explicit requests run outside a shared draw. Original art stays ready while
  // the existing native factory is queued; no Canvas, timer or RAF is added.
  function prepareNativeAssets(requests) {
    if(!Array.isArray(requests))return Promise.resolve(0);
    return Promise.resolve().then(()=>{
      let started=0;
      for(const request of requests){
        const key=typeof request==='string'?request:request?.key;
        const entry=entries[key],state=cache[key],frames=typeof request==='string'?null:request?.frames??null;
        if(entry&&state?.ready&&prepareNativeRaster(key,entry,state,true,frames))started++;
      }
      return started;
    });
  }
  function prepareBrakeTint(key,entry,state) {
    if(!currentAsset(key,state)||!nativeAllowed(key)||key!=='cacheBrakeReflection'||state.brakeTintAttempted)return;
    state.brakeTintAttempted=true;
    const image=state.image,w=image.naturalWidth,h=image.naturalHeight;
    const pixels=194*290;
    if(w<194||h<290||typeof window.HTMLCanvasElement!=='function'||
      typeof window.fetch!=='function'||typeof window.btoa!=='function'||
      typeof window.Blob!=='function'||typeof window.URL?.createObjectURL!=='function'||
      typeof window.URL?.revokeObjectURL!=='function'||typeof window.createImageBitmap!=='function'||
      pixels>MAX_NATIVE_SMALL_PIXELS-nativeSmallPixels||
      pixels>MAX_NATIVE_RASTER_PIXELS-nativeRasterPixels)return;
    const release=reservePixels(state,pixels,{native:true,small:true}),generation=state.derivativeGeneration||0;
    state.brakeTintPending=true;
    let done=false,url=null,tintImage=null;
    const controller=typeof window.AbortController==='function'?new window.AbortController():null;
    const jobs=state.pendingJobs||(state.pendingJobs=new Set()),cancel=()=>{controller?.abort();finish();};
    const finish=bitmap=>{
      if(done){bitmap?.close?.();return;}
      done=true;jobs.delete(cancel);
      if(currentDerivative(key,state,generation)&&bitmap?.width===194&&bitmap?.height===290)state.brakeTintBitmap=bitmap;
      else {bitmap?.close?.();release();}
      if(currentDerivative(key,state,generation))state.brakeTintPending=false;
      if(url)window.URL.revokeObjectURL(url);
      if(tintImage){tintImage.onload=null;tintImage.onerror=null;
        if(!currentDerivative(key,state,generation)){
          if(typeof tintImage.removeAttribute==='function')tintImage.removeAttribute('src');else tintImage.src='';}}
    };
    jobs.add(cancel);
    try {
      Promise.resolve(window.fetch(image.currentSrc||image.src,controller?{signal:controller.signal}:undefined)).then(response=>{
        if(!currentDerivative(key,state,generation)){finish();return null;}
        if(!response?.ok)throw Error('Reflection source unavailable');
        return response.arrayBuffer();
      }).then(buffer=>{
        if(!buffer||!currentDerivative(key,state,generation)){finish();return;}
        const bytes=new Uint8Array(buffer);
        let binary='';
        for(let offset=0;offset<bytes.length;offset+=8192)
          binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
        // CSS hue rotation operates in sRGB. Rasterize its equivalent SVG
        // matrix once at original texel size, outside the shared draw.
        // https://www.w3.org/TR/filter-effects-1/#funcdef-filter-hue-rotate
        const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+
          '" viewBox="0 0 '+w+' '+h+'"><defs><filter id="tone" color-interpolation-filters="sRGB">'+
          '<feColorMatrix type="hueRotate" values="315"/></filter></defs>'+
          '<image width="'+w+'" height="'+h+'" href="data:image/webp;base64,'+
          window.btoa(binary)+'" filter="url(#tone)"/></svg>';
        url=window.URL.createObjectURL(new window.Blob([svg],{type:'image/svg+xml'}));
        tintImage=new window.Image();
        tintImage.onload=()=>{
          if(!currentDerivative(key,state,generation)){finish();return;}
          try {Promise.resolve(window.createImageBitmap(tintImage,0,0,194,290)).then(finish,()=>finish());}
          catch {finish();}
        };
        tintImage.onerror=()=>finish();tintImage.src=url;
      }).catch(()=>finish());
    } catch {finish();}
  }
  const emptyShadows=new Set(['rgba(0, 0, 0, 0)','rgba(0,0,0,0)','#00000000','transparent']);
  function brakeTintReady(ctx) {
    return !!cache.cacheBrakeReflection?.brakeTintBitmap&&
      typeof window.HTMLCanvasElement==='function'&&ctx?.canvas instanceof window.HTMLCanvasElement&&
      !ctx.shadowBlur&&!ctx.shadowOffsetX&&!ctx.shadowOffsetY&&
      (!ctx.shadowColor||emptyShadows.has(ctx.shadowColor));
  }
  // Keep a reduced working set only after a caller actually requests it.
  // Native-only loads retain their original images without unused thumbnails.
  function prepareBackgroundRaster(key,entry,state) {
    if(!currentAsset(key,state)||!nativeAllowed(key)||state.rasterAttempted)return;
    const image=state.image,w=image.naturalWidth,h=image.naturalHeight;
    const background=backgroundSources.has(key)||diffuseEffects.has(key);
    if(!background||!/^cache/.test(key)||/\.svg$/i.test(entry.path)||w*h<256*1024||
      typeof window.createImageBitmap!=='function')return;
    state.rasterAttempted=true;
    const width=entry.columns*Math.ceil(w/entry.columns/4);
    const height=entry.rows*Math.ceil(h/entry.rows/4),pixels=width*height;
    if(rasterPixels+pixels>MAX_RASTER_PIXELS)return;
    const release=reservePixels(state,pixels),generation=state.derivativeGeneration||0;state.rasterPending=true;
    const fallback=()=>{release();if(currentDerivative(key,state,generation))state.rasterPending=false;};
    try {
      Promise.resolve(window.createImageBitmap(image,{resizeWidth:width,
        resizeHeight:height,resizeQuality:'high'})).then(bitmap=>{
        if(!currentDerivative(key,state,generation)||bitmap?.width!==width||bitmap?.height!==height){
          bitmap?.close?.();fallback();return;
        }
        state.rasterBitmap=bitmap;state.rasterPending=false;
      },fallback);
    } catch {fallback();}
  }
  function prepareRequestedBackgroundRaster(key,entry,state) {
    if(!state.ready)return;
    if(backgroundRasterRequested&&(backgroundSources.has(key)||diffuseEffects.has(key))||
      diffuseRasterRequested&&diffuseEffects.has(key))prepareBackgroundRaster(key,entry,state);
  }
  function prepareRequestedBackgroundRasters() {
    for(const [key,state] of Object.entries(cache))
      prepareRequestedBackgroundRaster(key,entries[key],state);
  }
  function setRasterDetail(ctx,scale=1) {
    const previous=rasterDetail.get(ctx)||1;
    if(Number.isFinite(scale)&&scale>0&&scale<1)rasterDetail.set(ctx,scale);
    else rasterDetail.delete(ctx);
    if(!backgroundRasterRequested&&Number.isFinite(scale)&&scale>0&&scale<=.25) {
      backgroundRasterRequested=true;prepareRequestedBackgroundRasters();
    }
    return previous;
  }
  function setDecorationDetail(ctx,scale=1) {
    const previous=decorationDetail.get(ctx)||1;
    if(Number.isFinite(scale)&&scale>0&&scale<1)decorationDetail.set(ctx,scale);
    else decorationDetail.delete(ctx);
    if(!diffuseRasterRequested&&Number.isFinite(scale)&&scale>0&&scale<1) {
      diffuseRasterRequested=true;prepareRequestedBackgroundRasters();
    }
    return previous;
  }
  function prepareDerivatives(key,entry,state) {
    if(!currentAsset(key,state)||!nativeAllowed(key))return;
    if(/\.svg$/i.test(entry.path)&&typeof window.createImageBitmap==='function') {
      if(state.svgAttempted)return;state.svgAttempted=true;
      const image=state.image,generation=state.derivativeGeneration||0;
      try {Promise.resolve(window.createImageBitmap(image)).then(bitmap=>{
        if(currentDerivative(key,state,generation)&&bitmap?.width===image.naturalWidth&&bitmap?.height===image.naturalHeight)
          state.bitmap=bitmap;
        else bitmap?.close?.();
      },()=>{});}catch {}
    } else {prepareRequestedBackgroundRaster(key,entry,state);prepareNativeRaster(key,entry,state);prepareBrakeTint(key,entry,state);}
  }
  function preload(keys=null) {
    if (typeof window.Image !== 'function') return;
    for(const key of [...nativePriorityReservations.keys()])if(!nativeAllowed(key))releaseNativePriorityReservation(key);
    for(const [key,pixels] of nativePriorityDimensions)if(nativeAllowed(key)&&!nativePriorityReservations.has(key)&&
      !cache[key]?.nativeAttempted&&!cache[key]?.nativePending){nativePriorityReservations.set(key,pixels);nativeRasterPixels+=pixels;}
    const requested=Array.isArray(keys)?keys:sceneKeys===null?Object.keys(entries):[...sceneKeys];
    for (const key of requested) {
      const entry=entries[key];if(!entry||!selected(key))continue;
      if (cache[key]) continue;
      const image = new window.Image();
      const state = cache[key] = { image, ready: false, fallback: false };
      // Readiness belongs to the valid loaded original, including the existing
      // bundled fallback. Native bitmaps are optional derivatives; a pending
      // preparation must not hold GPU handoff or complete native fallback.
      state.readyPromise=new Promise(resolve=>{state.resolveReady=resolve;});
      const settleReady=ready=>{if(!currentAsset(key,state))return;state.ready=ready;state.resolveReady?.(ready);state.resolveReady=null;};
      image.onload = () => {
        if(!currentAsset(key,state))return;
        const valid=image.naturalWidth>0&&image.naturalHeight>0;
        image.onload=null;image.onerror=null;
        if(!valid){releaseNativePriorityReservation(key);settleReady(false);return;}
        settleReady(true);
        // SVG source rectangles otherwise rerasterize the whole vector sheet
        // for every digit, terrain strip and filtered miniature. Prepare one
        // immutable bitmap per loaded SVG outside the gameplay draw path.
        // No display Canvas, getContext, timer or frame owner is added.
        prepareDerivatives(key,entry,state);
      };
      image.onerror = () => {
        if(!currentAsset(key,state))return;
        if (!state.fallback) { state.fallback = true; image.src = entry.path; }
        else { image.onload = null; image.onerror = null; releaseNativePriorityReservation(key); settleReady(false); }
      };
      image.src = (entry.root ?? root) + entry.path;
    }
  }
  function draw(key, ctx, { x = 0, y = 0, width = 96, height, frame = 0,
    flip = false, sourceRect = null, tone = null } = {}) {
    const entry = entries[key], state = cache[key];
    if (!entry || !state?.ready) return false;
    // A recorded GPU scene keeps one texture per original atlas. Cell/window
    // bitmaps and reduced backings belong only to the native Canvas painter.
    const gpu=ctx?.isGpuScene===true;
    const original=state.image,small=!gpu&&((rasterDetail.get(ctx)||1)<=.25||
      diffuseEffects.has(key)&&(decorationDetail.get(ctx)||1)<1)&&state.rasterBitmap;
    const fw=original.naturalWidth/entry.columns,fh=original.naturalHeight/entry.rows;
    const index = Math.max(0, Math.floor(frame)) % entry.frames;
    const [sx, sy, sw, sh] = sourceRect || entry.frameCrops?.[index] || entry.crop || [0, 0, fw, fh];
    const h = height ?? width * sh / sw;
    const nativeFrame=!gpu&&!small&&sw>0&&sh>0&&sx>=0&&sy>=0&&sx+sw<=fw&&sy+sh<=fh&&state.nativeFrames?.[index];
    const windowCandidate=!gpu&&!small&&sw>0&&sh>0&&state.nativeWindows?.[index];
    const nativeWindow=windowCandidate&&sx>=windowCandidate.crop[0]&&sy>=windowCandidate.crop[1]&&
      sx+sw<=windowCandidate.crop[0]+windowCandidate.crop[2]&&
      sy+sh<=windowCandidate.crop[1]+windowCandidate.crop[3]?windowCandidate:null;
    const tintSource=!gpu&&!small&&key==='cacheBrakeReflection'&&tone==='hue315'&&
      brakeTintReady(ctx)&&sx>=0&&sy>=0&&sw>0&&sh>0&&sx+sw<=194&&sy+sh<=290&&state.brakeTintBitmap;
    // High-quality resampling can change alpha after a hue tint is baked.
    // Keep that sampler on the original live-filter path, including miniatures.
    const liveTone=gpu&&key==='cacheBrakeReflection'&&tone==='hue315'||
      !!tintSource&&ctx.imageSmoothingQuality==='high';
    const preparedTone=!liveTone&&tintSource;
    const image=gpu?original:small||preparedTone||nativeWindow?.bitmap||nativeFrame||state.nativeBitmap||state.bitmap||original;
    // Sample background sources directly at the already reduced footprint.
    // Functional sprites and diffuse native effects keep their authored sampler.
    const smooth=!!entry.smooth&&!(backgroundSources.has(key)&&(rasterDetail.get(ctx)||1)<=.25);
    const sourceX = nativeWindow?sx-nativeWindow.crop[0]:nativeFrame?sx:index % entry.columns * fw + sx;
    const sourceY = nativeWindow?sy-nativeWindow.crop[1]:nativeFrame?sy:Math.floor(index / entry.columns) * fh + sy;
    const sourceScaleX=small?small.width/original.naturalWidth:1;
    const sourceScaleY=small?small.height/original.naturalHeight:1;
    const filter=liveTone?ctx.filter:null;
    const liveFilter=liveTone?'hue-rotate(315deg)'+
      (filter&&filter!=='none'?' '+filter:''):null;
    if (flip || x !== 0 || y !== 0) {
      ctx.save();
      try {
        ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = smooth;
        if(liveTone)ctx.filter=liveFilter;
        ctx.drawImage(image, sourceX*sourceScaleX, sourceY*sourceScaleY,
          sw*sourceScaleX, sh*sourceScaleY,
          -width * entry.ax, -h * entry.ay, width, h);
      } finally {ctx.restore();}
    } else {
      // Projected textures already draw at the caller's local origin.
      // Preserve its transform, clip, alpha and filter without copying the
      // whole Canvas state for every ground/street triangle. Keep translated
      // sprites on the original path to preserve filtered raster placement.
      const smoothing = ctx.imageSmoothingEnabled;
      const changed = smoothing !== smooth;
      if (changed) ctx.imageSmoothingEnabled = smooth;
      if(liveTone)ctx.filter=liveFilter;
      try {
        ctx.drawImage(image, sourceX*sourceScaleX, sourceY*sourceScaleY,
        sw*sourceScaleX, sh*sourceScaleY,
          x - width * entry.ax, y - h * entry.ay, width, h);
      } finally {
        if (changed) ctx.imageSmoothingEnabled = smoothing;
        if(liveTone)ctx.filter=filter;
      }
    }
    return true;
  }
  function gpuSources(keys=null) {
    // Metadata lookup only. Texture residency/preparation stays with the GPU
    // update owner; asking for descriptors never loads or decodes an image.
    const selected=Array.isArray(keys)?keys:Object.keys(entries);
    return selected.flatMap(key=>{
      const entry=entries[key],state=cache[key];
      if(!entry||!state?.ready)return [];
      return [{key,image:state.image,path:entry.path,columns:entry.columns,
        rows:entry.rows,frames:entry.frames,ax:entry.ax,ay:entry.ay,
        smooth:!!entry.smooth,crop:entry.crop,frameCrops:entry.frameCrops}];
    });
  }
  async function waitForGpuSources(keys) {
    // Level entry awaits original load/fallback settlement. The GPU warmup
    // owner decodes once before upload; native derivative jobs are optional.
    const selected=[...new Set(keys||[])];
    preload(selected);
    await Promise.all(selected.map(key=>cache[key]?.readyPromise));
    return gpuSources(selected);
  }
  function diagnostics() {
    let readySources=0,originalPixels=0;const keys=Object.keys(cache);
    for(const key of keys){const state=cache[key];if(state.ready){readySources++;originalPixels+=state.image.naturalWidth*state.image.naturalHeight;}}
    return {registeredSources:Object.keys(entries).length,sceneScoped:sceneKeys!==null,
      selectedSources:sceneKeys?.size??Object.keys(entries).length,cachedSources:keys.length,
      readySources,loadingSources:keys.filter(key=>cache[key].resolveReady).length,originalPixels,
      nativeRasterPixels,nativeSmallPixels,rasterPixels};
  }
  B.PresentationAssets = { preload, selectScene, releaseScene, selectRoadScene, selectLevel1Scene, diagnostics,
    draw, prepareNativeAssets, gpuSources, waitForGpuSources, brakeTintReady, setRasterDetail, setDecorationDetail, decorationDetail: ctx => decorationDetail.get(ctx)||1, rasterDetail: ctx => rasterDetail.get(ctx)||1, ready: key => !!cache[key]?.ready };
  preload();
})();
