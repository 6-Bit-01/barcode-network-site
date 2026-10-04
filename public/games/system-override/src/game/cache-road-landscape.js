// World-addressed roadside layout for the playable Cache Road camera. The
// Six fitted districts share one terrain, street graph, and parcel contract.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-landscape.js', exports: ['BARCODE.CacheRoadLandscape'], dependencies: [] });
(function(B) {
  'use strict';
  const ART = Object.freeze({
    '-1': Object.freeze({
      rear: ['cacheWorkshopLRear',1774,887,1700,430,250,887,773,{footU:.86}],
      middle: ['cacheWorkshopLMiddle',1774,887,1800,250,200,887,686,{footU:.77}],
      open: ['cacheWorkshopLFrontGap',1902,827,1850,250,190,827,540,
        {footU:.68,socketU:.70}],
      closed: ['cacheWorkshopLFrontFill',1902,827,1850,250,190,827,627,{footU:.86}]
    }),
    '1': Object.freeze({
      rear: ['cacheWorkshopRRear',1774,887,1700,430,250,887,693,{footU:.14}],
      middle: ['cacheWorkshopRMiddle',1902,827,1800,250,200,827,729,{footU:.23}],
      open: ['cacheWorkshopRFrontGap',1899,828,1850,250,190,828,663,
        {footU:.38,socketU:.28}],
      closed: ['cacheWorkshopRFrontFill',1899,828,1850,250,190,828,560,{footU:.14}]
    })
  });
  // Market source contacts and road-facing alpha sockets are fitted to the
  // production painter. See CACHE_ROAD_MARKET_FIRST_FAMILY.md for the gate.
  const MARKET_ART = Object.freeze({
    '-1': Object.freeze({
      rear: ['cacheMarketLRear',1942,809,1700,430,250,809,571,
        {footU:.86}],
      middle: ['cacheMarketLMiddle',1944,809,1800,250,200,809,633,
        {footU:.77}],
      // The art ends at u=.72; project that edge onto the actual street
      // socket instead of centering its transparent quarter over the road.
      open: ['cacheMarketLFrontGap',1944,809,1850,250,190,809,615,
        {footU:.68,socketU:.72}],
      closed: ['cacheMarketLFrontFill',1944,809,1850,250,190,809,655,
        {footU:.86}],
      middleDense: ['cacheMarketLFrontFill',1944,809,1850,250,190,809,655,
        {footU:.86}]
    }),
    '1': Object.freeze({
      rear: ['cacheMarketRRear',1942,809,1700,430,250,809,586,
        {footU:.14}],
      middle: ['cacheMarketRMiddle',1945,809,1800,250,200,809,673,
        {footU:.23}],
      open: ['cacheMarketRFrontGap',1942,809,1850,250,190,809,559,
        {footU:.32,socketU:.28}],
      closed: ['cacheMarketRFrontFill',1942,809,1850,250,190,809,570,
        {footU:.14}],
      middleDense: ['cacheMarketRFrontFill',1942,809,1850,250,190,809,570,
        {footU:.14}]
    })
  });
  // The first warm residential run is fitted to the same 225/180 coverage,
  // 38-unit graph mouth and terrain contact as the market. The facing and
  // source foot coordinates are independent on the two banks.
  const HOMES_ART = Object.freeze({
    '-1': Object.freeze({
      rear: ['cacheHomesLRear',1942,809,1700,430,250,809,612,
        {footU:.86}],
      middle: ['cacheHomesLMiddle',1944,809,1800,250,200,809,647,
        {footU:.77}],
      open: ['cacheHomesLFrontGap',1944,809,1850,250,190,809,675,
        {footU:.68,socketU:.70}],
      closed: ['cacheHomesLFrontFill',1944,809,1850,250,190,809,695,
        {footU:.86}],
      middleDense: ['cacheHomesLFrontFill',1944,809,1850,250,190,809,695,
        {footU:.86}]
    }),
    '1': Object.freeze({
      rear: ['cacheHomesRRear',1944,809,1700,430,250,809,579,
        {footU:.14}],
      middle: ['cacheHomesRMiddle',1942,809,1800,250,200,809,632,
        {footU:.23}],
      open: ['cacheHomesRFrontGap',1944,809,1850,250,190,809,617,
        {footU:.32,socketU:.28}],
      closed: ['cacheHomesRFrontFill',1942,809,1850,250,190,809,662,
        {footU:.14}],
      middleDense: ['cacheHomesRFrontFill',1942,809,1850,250,190,809,662,
        {footU:.14}]
    })
  });
  // Each contact is the measured lower alpha at its roadward foot. The
  // outer foundation extends farther down and is buried by a nearer strip.
  const GREENHOUSE_ART = Object.freeze({
    '-1': Object.freeze({
      rear: ['cacheGreenhouseLRear',1942,809,1700,430,250,809,582,{footU:.86}],
      middle: ['cacheGreenhouseLMiddle',1942,809,1800,250,200,809,744,{footU:.77}],
      open: ['cacheGreenhouseLFrontGap',1942,809,1850,250,190,809,703,
        {footU:.68,socketU:.70}],
      closed: ['cacheGreenhouseLFrontFill',1942,809,1850,250,190,809,702,{footU:.86}]
    }),
    '1': Object.freeze({
      rear: ['cacheGreenhouseRRear',1942,809,1700,430,250,809,515,{footU:.14}],
      middle: ['cacheGreenhouseRMiddle',1942,809,1800,250,200,809,694,{footU:.23}],
      open: ['cacheGreenhouseRFrontGap',1942,809,1850,250,190,809,668,
        {footU:.32,socketU:.28}],
      closed: ['cacheGreenhouseRFrontFill',1942,809,1850,250,190,809,666,{footU:.14}]
    })
  });
  const DATA_ART = Object.freeze({
    '-1': Object.freeze({
      rear: ['cacheDataLRear',1942,809,1700,430,250,809,633,{footU:.86}],
      middle: ['cacheDataLMiddle',1942,809,1800,250,200,809,557,{footU:.77}],
      open: ['cacheDataLFrontGap',1942,809,1850,250,190,809,627,
        {footU:.68,socketU:.71}],
      closed: ['cacheDataLFrontFill',1945,808,1850,250,190,808,603,{footU:.86}]
    }),
    '1': Object.freeze({
      rear: ['cacheDataRRear',1944,809,1700,430,250,809,531,{footU:.14}],
      middle: ['cacheDataRMiddle',1942,809,1800,250,200,809,673,{footU:.23}],
      open: ['cacheDataRFrontGap',1942,809,1850,250,190,809,699,
        {footU:.32,socketU:.28}],
      closed: ['cacheDataRFrontFill',1942,809,1850,250,190,809,591,{footU:.14}]
    })
  });
  const TRANSIT_ART = Object.freeze({
    '-1': Object.freeze({
      rear: ['cacheTransitLRear',1942,809,1700,430,250,809,699,{footU:.86}],
      middle: ['cacheTransitLMiddle',1942,809,1800,250,200,809,591,{footU:.77}],
      open: ['cacheTransitLFrontGap',1944,809,1850,250,190,809,691,
        {footU:.68,socketU:.70}],
      closed: ['cacheTransitLFrontFill',1942,809,1850,250,190,809,660,{footU:.86}]
    }),
    '1': Object.freeze({
      rear: ['cacheTransitRRear',1942,809,1700,430,250,809,412,{footU:.14}],
      middle: ['cacheTransitRMiddle',1942,809,1800,250,200,809,663,{footU:.23}],
      open: ['cacheTransitRFrontGap',1942,809,1850,250,190,809,707,
        {footU:.32,socketU:.28}],
      closed: ['cacheTransitRFrontFill',1942,809,1850,250,190,809,689,{footU:.14}]
    })
  });
  const FAMILIES=Object.freeze(['market','homes','workshop','greenhouse','data','transit']);
  const FAMILY_ART=Object.freeze({market:MARKET_ART,homes:HOMES_ART,
    workshop:ART,greenhouse:GREENHOUSE_ART,data:DATA_ART,transit:TRANSIT_ART});
  // Measured source coordinates anchor the painted inner footing, rather
  // than empty pixels below it. These six aprons descend toward image right.
  // The shallow homes strip keeps its facing and uses a neutral center foot.
  const SOURCE_FITS=Object.freeze({
    cacheTransitNook:Object.freeze({sourceSide:1,footU:.14,contactAt:725}),
    cacheUtilityCorner:Object.freeze({sourceSide:1,footU:.14,contactAt:665}),
    cacheGreenhouseWorkshop:Object.freeze({sourceSide:1,footU:.14,contactAt:828}),
    cacheOutskirtsWorkshops:Object.freeze({sourceSide:1,footU:.14,contactAt:708}),
    cacheRepairShop:Object.freeze({sourceSide:1,footU:.14,contactAt:940}),
    cacheVendorStall:Object.freeze({sourceSide:1,footU:.14,contactAt:959}),
    cacheOutskirtsHomes:Object.freeze({sourceSide:-1,footU:.5,contactAt:698})
  });
  const sourceFlip=(key,side)=>side!==SOURCE_FITS[key].sourceSide;
  const ACCENT_ART=Object.freeze([
    ['cacheTransitNook',1602,982,1650,260,210,982],
    ['cacheOutskirtsHomes',2022,778,1750,260,210,778],
    ['cacheUtilityCorner',1585,992,1650,260,210,992],
    ['cacheGreenhouseWorkshop',1536,1024,1650,260,210,1024],
    ['cacheOutskirtsWorkshops',2022,778,1750,260,210,778],
    ['cacheRepairShop',1389,1132,1650,260,210,1132]
  ].map(art=>{
    const fit=SOURCE_FITS[art[0]];
    return [...art,fit.contactAt,fit.footU===undefined?undefined:{footU:fit.footU}];
  }));
  const random = n => {
    let x = Math.imul(n ^ n >>> 16,0x7feb352d);
    x = Math.imul(x ^ x >>> 15,0x846ca68b);
    return ((x ^ x >>> 16) >>> 0)/4294967296;
  };
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
  const PITCH=180,SPAN=225;
  // In world coordinates the roadward edge is radial 220. Every material,
  // street vertex, parcel foot and card contact samples this same height.
  // The lateral term lets a rise roll around a block instead of lifting an
  // entire flat row together. The arterial sidewalk remains at height 24.
  function height(seed,side,at,radial) {
    const outward=smooth((radial-220)/950);
    const broad=12*Math.sin(at/240+side*.8+seed*.00013);
    const local=7*Math.sin(at/97+radial/355+side*1.3+seed*.00031);
    const cross=6*Math.sin(at/175-radial/270+side*.4);
    return 24+outward*(16+broad+local+cross);
  }
  // Contact-band occupancy, not sprite rectangles: approved connected
  // modular seams may overlap; an unrelated featured forecourt may not.
  const FRONTAGE_GAP=18;
  const frontageConflict=(a,b)=>a.side===b.side &&
    Math.abs(a.at-b.at)<a.halfAlong+b.halfAlong+FRONTAGE_GAP &&
    Math.abs(a.radial-b.radial)<a.halfDepth+b.halfDepth+FRONTAGE_GAP;
  const featuredFrontage=site=>({id:`site:${site.side}:${site.at}`,
    side:site.side,at:site.at,radial:246+(site.setback||0),
    halfAlong:site.frontageHalfAlong??(site.kind==='parking'?75:50)*(site.size||1),halfDepth:75,
    kind:'site'});
  function fitFrontages(plates,chunks,parcels,graph,sites,originals) {
    const fixed=sites.map(featuredFrontage);
    const records=plates.map((plate,index)=>{
      const original=originals[index],chunk=chunks.find(c=>c.id===plate.chunkId);
      return {id:`plate:${plate.chunkId}:${plate.tier}`,kind:'plate',plate,chunk,
        original,side:plate.side,at:original.at,radial:original.base,
        halfAlong:plate.key==='open'?55:plate.key==='accent'?60:75,halfDepth:56};
    });
    const authoredSeam=(a,b)=>a.kind==='plate'&&b.kind==='plate'&&
      a.plate.key!=='accent'&&b.plate.key!=='accent'&&
      a.plate.family===b.plate.family&&a.original.base===b.original.base&&
      a.radial===a.original.base&&b.radial===b.original.base&&
      Math.abs(a.original.at-b.original.at)<=SPAN&&
      Math.abs(a.at-b.at)>=Math.abs(a.original.at-b.original.at);
    // Keep graph openings first, then fit the most visible row. Every
    // accepted contact reserves its place before the next tier is fitted.
    records.sort((a,b)=>(a.plate.key==='open'?0:a.plate.tier==='front'?1:
      a.plate.tier==='middle'?2:3)-(b.plate.key==='open'?0:b.plate.tier==='front'?1:
      b.plate.tier==='middle'?2:3)||a.side-b.side||a.original.at-b.original.at);
    const occupied=[...fixed],changes=[],unresolved=[],rejected=[],retained=[];
    for(const record of records) {
      const {plate,chunk,original}=record;
      const clashes=candidate=>occupied.some(other=>frontageConflict(candidate,other)&&
        !authoredSeam(candidate,other));
      // Retain the authored radial row. Moving a billboard outward can
      // hide its collision or even make its foreground foundation worse.
      const candidates=[];
      const radial=original.base;
      for(let at=chunk.startAt+15;at<=chunk.endAt-15;at++) {
        if(plate.key==='open'&&at!==original.at)continue;
        const candidate={...record,at,radial};
        if(!clashes(candidate))candidates.push(candidate);
      }
      if(!clashes(record))candidates.push(record);
      candidates.sort((a,b)=>Math.abs(a.at-original.at)-Math.abs(b.at-original.at)||a.at-b.at);
      if(!candidates.length) {
        if(plate.key==='open')unresolved.push(record.id);
        else {rejected.push({id:record.id,key:plate.art[0],side:plate.side,
          at:original.at,radial:original.base});continue;}
      }
      const chosen=candidates[0]||record;
      occupied.push(chosen);retained.push(plate);
      plate.at=chosen.at;plate.art=[...original.art];plate.art[4]=chosen.radial;
      plate.radialBand=chosen.radial;
      plate.contact=original.contact.map(point=>({...point,
        at:point.at+chosen.at-original.at,
        radial:point.radial+chosen.radial-original.base}));
      plate.frontage={at:chosen.at,radial:chosen.radial,
        halfAlong:record.halfAlong,halfDepth:record.halfDepth};
      if(plate.tier==='front'&&plate.key!=='open') {
        const arterial=graph.nodes.find(node=>node.side===plate.side&&
          node.type==='arterial-sidewalk'&&node.at===chunk.frontAt);
        if(arterial)arterial.at=chosen.at;
        chunk.frontAt=chosen.at;
      }
      const parcel=parcels.find(p=>p.chunkId===plate.chunkId&&p.tier===plate.tier);
      if(parcel) {
        parcel.entrance.at=chosen.at;parcel.entrance.radial=chosen.radial;
        parcel.radial=[chosen.radial+5,chosen.radial+175];
        const entrance=graph.nodes[parcel.entrance.node];
        if(entrance){entrance.at=chosen.at;entrance.radial=chosen.radial;}
      }
      if(chosen.at!==original.at||chosen.radial!==original.base)changes.push({
        id:record.id,key:plate.art[0],side:plate.side,
        from:{at:original.at,radial:original.base},to:{at:chosen.at,radial:chosen.radial}});
    }
    const collisions=[],seams=[];
    for(let i=0;i<occupied.length;i++)for(let j=i+1;j<occupied.length;j++) {
      const a=occupied[i],b=occupied[j];
      if(frontageConflict(a,b)) {
        if(authoredSeam(a,b))seams.push([a.id,b.id]);
        else collisions.push([a.id,b.id]);
      }
    }
    plates.splice(0,plates.length,...retained.sort((a,b)=>b.at-a.at));
    const parcelKeys=new Set(retained.map(plate=>`${plate.chunkId}:${plate.tier}`));
    const removedNodes=new Set();
    for(let i=parcels.length-1;i>=0;i--)if(!parcelKeys.has(`${parcels[i].chunkId}:${parcels[i].tier}`)) {
      removedNodes.add(parcels[i].entrance.node);parcels.splice(i,1);
    }
    // Empty clearings retain their through-sidewalks, but no phantom parcel
    // entrances/access edges. Remap IDs once after removing those leaves.
    const keptNodes=graph.nodes.filter(node=>!removedNodes.has(node.id));
    const nodeIds=new Map(keptNodes.map((node,index)=>[node.id,index]));
    graph.edges=graph.edges.filter(edge=>!removedNodes.has(edge.a)&&!removedNodes.has(edge.b))
      .map(edge=>({...edge,a:nodeIds.get(edge.a),b:nodeIds.get(edge.b)}));
    keptNodes.forEach((node,index)=>{node.id=index;});graph.nodes=keptNodes;
    for(const parcel of parcels)parcel.entrance.node=nodeIds.get(parcel.entrance.node);
    return {gap:FRONTAGE_GAP,authoredCount:records.length,retainedCount:retained.length,
      changes,rejected,unresolved,collisions,seams,
      contacts:occupied.map(({id,kind,side,at,radial,halfAlong,halfDepth,original,plate})=>
        ({id,kind,side,at,radial,halfAlong,halfDepth,
          ...(original?{authoredAt:original.at,authoredRadial:original.base,
            family:plate.family,key:plate.key}:{})}))};
  }
  // Build immutable-address indices once, after generation. Querying returns
  // the original objects in their original painter order; it never mutates a
  // parcel, graph node or artwork contact. Courts need a separate address from
  // their street mouth, so their index must not reuse mouth ordering.
  function addressIndex(records,address=record=>record.at) {
    const ordered=records.map((record,order)=>({record,order,at:address(record)}))
      .sort((a,b)=>b.at-a.at||a.order-b.order);
    const painterOrdered=ordered.every((item,index)=>item.order===index);
    return (near,far)=>{
      if(!Number.isFinite(near)||!Number.isFinite(far)||near>far)return [];
      let lo=0,hi=ordered.length;
      while(lo<hi) {const mid=(lo+hi)>>>1;
        if(ordered[mid].at>far)lo=mid+1;else hi=mid;}
      const start=lo;hi=ordered.length;
      while(lo<hi) {const mid=(lo+hi)>>>1;
        if(ordered[mid].at>=near)lo=mid+1;else hi=mid;}
      const selected=ordered.slice(start,lo);
      if(!painterOrdered)selected.sort((a,b)=>a.order-b.order);
      return selected.map(item=>item.record);
    };
  }
  function create(seed=0x6b4d,end=9840,protectedSites=[]) {
    if(!Number.isSafeInteger(seed)||!Number.isFinite(end)||end<0)
      throw Error('Invalid Cache Road landscape seed or length');
    const chunks=[],plates=[],streets=[],parcels=[];
    const familyOffset=seed===0x6b4d?0:
      Math.floor(random(seed+0x1357)*FAMILIES.length);
    const graph={nodes:[],edges:[]};
    const node=(side,at,radial,type)=>{
      const id=graph.nodes.length;
      graph.nodes.push({id,side,at,radial,type});return id;
    };
    const edge=(a,b,kind)=>graph.edges.push({a,b,kind});
    for(const side of [-1,1]) {
      const phase=side<0?110:166;
      const sites=protectedSites.filter(s=>s.side===side)
        .sort((a,b)=>a.at-b.at);
      const mouths=[];
      if(sites.length>1) {
        let previous=-Infinity;
        for(let j=1;j<sites.length;j++) {
          const gap=sites[j].at-sites[j-1].at;
          const at=Math.round((sites[j].at+sites[j-1].at)/2);
          if(gap>=280&&at-previous>=410 &&
            random(seed+j*179+(side<0?61:139))>.13) {
            mouths.push(at);previous=at;
          }
        }
      }
      // The featured sites are sparse. Streets also occupy the open blocks
      // between them, provided a full frontage and site clearance remain.
      for(let at=phase+PITCH+42;at<end+400;at+=PITCH*3) {
        const address=at+(side<0?0:90);
        if(sites.some(site=>Math.abs(site.at-address)<190+(site.size||1)*18) ||
          mouths.some(mouth=>Math.abs(mouth-address)<430) ||
          random(seed+at*13+side*431)<.17)continue;
        mouths.push(address);
      }
      let previousOuter=null,previousArterial=null;
      const usedMouths=new Set(),accentAddresses=[];
      // Reserve the painted core of a featured site at every depth. Checking
      // only the front card lets a rear card or court sit on its foundation.
      const clearsSite=(at,tier)=>!sites.some(site=>
        Math.abs(site.at-at)<(tier==='front'?105:20)+
          (site.size||1)*18+(tier==='front'?0:site.setback*.08));
      const clearsAccent=at=>clearsSite(at,'rear')&&
        accentAddresses.every(other=>Math.abs(at-other)>=240);
      for(let i=0,startAt=phase-PITCH;startAt<end+580;i++,startAt+=PITCH) {
        const endAt=startAt+SPAN;
        const centerAt=startAt+42;
        const chosenMouth=mouths.find(at=>
          Math.abs(at-centerAt)<=90&&!usedMouths.has(at));
        if(chosenMouth!==undefined)usedMouths.add(chosenMouth);
        const frontAt=chosenMouth??centerAt;
        const route=(seed+i*7+(side<0?0:2))%3;
        const offsets=[[65,135,230,310],[45,105,65,215],
          [75,150,225,190]][route];
        const courtAt=frontAt+offsets[1];
        const middleAt=startAt+119,rearAt=startAt+193;
        const site=!clearsSite(frontAt,'front');
        // The side phases and this choice keep openings from becoming a
        // paired gate. Sites reserve their full near frontage first.
        const open=chosenMouth!==undefined&&!site&&!protectedSites.some(s=>
          s.side===side&&Math.abs(s.at-frontAt)<150);
        // Coherent runs, never a one-card checkerboard. Each bank cycles all
        // six families; seed and side stagger the boundaries independently.
        const run=Math.floor((i+1)/10);
        const family=FAMILIES[(run+familyOffset)%FAMILIES.length];
        const chunk={id:`${side}:${i}`,side,startAt,endAt,span:SPAN,
          pitch:PITCH,frontAt,middleAt,rearAt,open,
          seed:(seed^Math.imul(i+17,side<0?0x5bd1e995:0x27d4eb2d))>>>0,
          family};
        const familyArt=FAMILY_ART[family][String(side)];
        const accent=!open&&i%5===2&&clearsAccent(middleAt);
        chunk.accentIndex=(open&&clearsAccent(courtAt+40))||accent ?
          (Math.floor(i/5)+(side>0?3:0)+seed%6)%ACCENT_ART.length : null;
        chunks.push(chunk);
        if(!site) {
          const key=open?'open':'closed';
          const art=familyArt[key];
          plates.push({at:frontAt,side,chunkId:chunk.id,family:chunk.family,
            tier:'front',key,art,span:SPAN,radialBand:art[4],
            contact:[{at:frontAt-75,radial:270},{at:frontAt+75,radial:270}],
            socket:open?{at:frontAt,radial:250,halfWidth:19}:null});
          parcels.push({id:`${chunk.id}:front`,chunkId:chunk.id,side,
            tier:'front',startAt,endAt,radial:[255,435],
            entrance:{at:frontAt,radial:255},access:'arterial-sidewalk'});
        }
        // Leave the art behind a real street corridor. Until middle/rear
        // gap variants are painted, placing a closed facade here would
        // punch a lane through it.
        if(!open) {
          // At a family boundary the previous middle/rear foundations land
          // almost on the next family's front. Keep the road-facing front
          // and leave its successor a clean bank instead of stacking two
          // differently painted neighborhoods at the same address.
          const nextFamily=FAMILIES[(Math.floor((i+2)/10)+familyOffset)%FAMILIES.length];
          for(const [tier,at] of [['middle',middleAt],['rear',rearAt]]) {
            if(!clearsSite(at,tier)||nextFamily!==family)continue;
            const isAccent=tier==='middle'&&chunk.accentIndex!==null;
            const art=isAccent?ACCENT_ART[chunk.accentIndex]:familyArt[tier];
            plates.push({at,side,chunkId:chunk.id,family:chunk.family,tier,
              key:isAccent?'accent':tier,art,span:SPAN,
              radialBand:art[4],flip:isAccent&&sourceFlip(art[0],side),
              contact:[{at:at-75,radial:art[4]},{at:at+75,radial:art[4]}],
              socket:null});
            parcels.push({id:`${chunk.id}:${tier}`,chunkId:chunk.id,side,
              tier,startAt,endAt,radial:[art[4],art[4]+170],
              entrance:{at,radial:art[4]},access:'sidewalk-path'});
            if(isAccent)accentAddresses.push(at);
          }
        } else if(chunk.accentIndex!==null) {
          // An occupied court beyond the turn gives the visible local street
          // a destination without painting a closed facade through it.
          const donor=ACCENT_ART[chunk.accentIndex];
          const art=[donor[0],donor[1],donor[2],1550,700,230,donor[6],donor[7],donor[8]];
          const at=courtAt+40;
          plates.push({at,side,chunkId:chunk.id,family:chunk.family,
            tier:'rear',key:'accent',art,span:SPAN,radialBand:700,
            flip:sourceFlip(art[0],side),
            contact:[{at:at-60,radial:700},{at:at+60,radial:700}],
            socket:null});
          parcels.push({id:`${chunk.id}:court`,chunkId:chunk.id,side,
            tier:'rear',startAt:courtAt-65,endAt:courtAt+75,
            radial:[650,870],entrance:{at:courtAt,radial:615},
            access:'local-street'});
          accentAddresses.push(at);
        }
        const arterial=node(side,frontAt,220,'arterial-sidewalk');
        if(previousArterial!==null)
          edge(previousArterial,arterial,'arterial-sidewalk');
        previousArterial=arterial;
        const foot=node(side,middleAt,500,'walkway-junction');
        edge(arterial,foot,'sidewalk-path');
        // Every recorded parcel has an entrance node and a route to a
        // sidewalk or a loading court. Art selection never creates roads.
        const owned=parcels.filter(parcel=>parcel.chunkId===chunk.id);
        if(open) {
          const corner=node(side,frontAt+offsets[0],395,'street-corner');
          const court=node(side,courtAt,615,'loading-court');
          const turn=node(side,frontAt+offsets[2],690,'local-turn');
          const outer=node(side,frontAt+offsets[3],1020,'outer-junction');
          edge(arterial,corner,'local-street');
          edge(corner,court,'local-street');
          // The court is the painted destination. The outer connection is
          // a walkable offscreen network until sided corner art exists.
          edge(court,turn,'sidewalk-path');
          edge(turn,outer,'sidewalk-path');
          edge(corner,foot,'sidewalk-path');
          for(const parcel of owned) {
            const entrance=node(side,parcel.entrance.at,
              parcel.entrance.radial,'parcel-entrance');
            edge(entrance,parcel.access==='local-street'?court:arterial,
              'parcel-access');
            parcel.entrance.node=entrance;
          }
          if(previousOuter!==null)edge(previousOuter,outer,'outer-link');
          previousOuter=outer;
          const nodes=[graph.nodes[arterial],graph.nodes[corner],
            graph.nodes[court],graph.nodes[turn],graph.nodes[outer]];
          streets.push({side,at:frontAt,family:chunk.family,halfWidth:19,nodes,
            edges:[[0,1],[1,2]],end:'loading-court',
            chunkId:chunk.id});
        } else for(const parcel of owned) {
          const entrance=node(side,parcel.entrance.at,
            parcel.entrance.radial,'parcel-entrance');
          edge(entrance,parcel.access==='arterial-sidewalk'?arterial:foot,
            'parcel-access');
          parcel.entrance.node=entrance;
        }
      }
    }
    const streetParts=[];
    for(const street of streets)for(const [edgeIndex,[ai,bi]] of street.edges.entries()) {
      const a=street.nodes[ai],b=street.nodes[bi];
      const count=Math.max(1,Math.ceil(Math.abs(b.at-a.at)/24));
      for(let j=0;j<count;j++) {
        const point=f=>({at:a.at+(b.at-a.at)*f,
          radial:a.radial+(b.radial-a.radial)*f});
        const near=point(j/count),far=point((j+1)/count);
        streetParts.push({side:street.side,streetAt:street.at,
          family:street.family,
          halfWidth:street.halfWidth,at:(near.at+far.at)/2,
          a:near,b:far,edgeIndex,segment:j,segments:count});
      }
    }
    streetParts.sort((a,b)=>b.at-a.at);
    // The workshop pavement belongs to connected courts, not a giant
    // repeating blanket. The established rolling grit fills the bank.
    const districts=[];
    // Fit whole cards before indexing scenery or spawning contextual actors.
    const originals=plates.map(plate=>({at:plate.at,base:plate.art[4],
      art:plate.art,contact:plate.contact.map(point=>({...point}))}));
    const clearance=fitFrontages(plates,chunks,parcels,graph,protectedSites,originals);
    const fitSatellites=scenes=>{
      const occupied=clearance.contacts.slice(),retained=[],rejected=[];
      for(const scene of scenes) {
        const origin=scene.at;
        const candidates=[0,...Array.from({length:5},(_,i)=>[12*(i+1),-12*(i+1)]).flat()];
        const offset=candidates.find(delta=>!occupied.some(other=>frontageConflict({
          side:scene.side,at:origin+43+delta,radial:249,halfAlong:60,halfDepth:56},other)));
        if(offset===undefined){rejected.push({side:scene.side,at:origin,key:scene.art[0]});continue;}
        scene.at=origin+offset;retained.push(scene);
        occupied.push({id:`satellite:${scene.side}:${origin}`,kind:'satellite',
          side:scene.side,at:scene.at+43,radial:249,halfAlong:60,halfDepth:56});
      }
      scenes.splice(0,scenes.length,...retained);
      clearance.contacts=occupied;clearance.satelliteRejected=rejected;
      clearance.satelliteCount=retained.length;
    };
    streets.sort((a,b)=>b.at-a.at);
    const streetRange=addressIndex(streets),streetPartRange=addressIndex(streetParts);
    const courts=streets.map(street=>Object.freeze({side:street.side,
      at:street.nodes[2].at,family:street.family}));
    const courtRange=addressIndex(courts);
    const mouthHalfWidth=Math.max(0,...streets.map(street=>street.halfWidth));
    return Object.freeze({seed,chunks,plates,streets,streetParts,districts,
      parcels,graph,pitch:PITCH,span:SPAN,clearance,fitSatellites,
      streetRange,streetPartRange,courtRange,
      streetMouthRange(start,end,side) {
        return streetRange(start-mouthHalfWidth,end+mouthHalfWidth)
          .filter(street=>(side===undefined||street.side===side)&&
            start<street.at+street.halfWidth&&end>street.at-street.halfWidth);
      },
      // A draw owns this bounded memo and may share it with its rear camera.
      // Exact numeric coordinates remain the keys: there is no rounding,
      // quantization, temporal reuse or change to the authored height field.
      // A zero budget measures the same production sampler without caching.
      createFrameHeightSampler(maxEntries=1024) {
        if(!Number.isInteger(maxEntries)||maxEntries<0||maxEntries>4096)
          throw Error('Invalid Cache Road frame-height sample budget');
        const sides=new Map();let entries=0,calls=0,hits=0,computations=0;
        const sample=(side,at,radial)=>{
          calls++;
          const addresses=sides.get(side),radii=addresses?.get(at);
          if(radii?.has(radial)) {hits++;return radii.get(radial);}
          computations++;const value=height(seed,side,at,radial);
          if(entries<maxEntries&&Number.isFinite(side)&&Number.isFinite(at)&&Number.isFinite(radial)) {
            const storedAddresses=addresses||new Map();
            const storedRadii=radii||new Map();storedRadii.set(radial,value);
            if(!radii)storedAddresses.set(at,storedRadii);
            if(!addresses)sides.set(side,storedAddresses);
            entries++;
          }
          return value;
        };
        sample.getStats=()=>Object.freeze({calls,hits,computations,entries,maxEntries});
        return Object.freeze(sample);
      },
      height:(side,at,radial)=>height(seed,side,at,radial),
      owns(side,at,margin=0) {
        return chunks.some(chunk=>chunk.side===side &&
          at>=chunk.startAt-margin&&at<chunk.endAt+margin);
      }});
  }
  B.CacheRoadLandscape=Object.freeze({create,ART,FAMILY_ART,FAMILIES,SOURCE_FITS,
    sourceFlip,frontageConflict,featuredFrontage});
})(window.BARCODE=window.BARCODE||{});
