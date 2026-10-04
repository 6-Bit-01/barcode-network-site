// Seeded roadside district prototype. Its geometry is world-space; draw()
// receives the Cache Road camera/terrain projection used by the live renderer.
// This file is loaded by the review harness until the motion proof is accepted.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-districts.js',
  exports: ['BARCODE.CacheRoadDistricts'], dependencies: [] });
(function(B) {
  'use strict';
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const smooth=v=>v*v*(3-2*v);
  const mix=(a,b,v)=>a+(b-a)*v;
  const assets={
    '-1': [
      ['cachePlaceGardenCompact',960,793,490,false],
      ['cachePlaceConstructionRounded',960,585,510,false],
      ['cachePlaceEncryptedPump',960,637,470,false],
      ['cachePlaceDroneServiceNode',960,643,470,false],
      ['cacheRepairShop',1389,1132,590,false],
      ['cacheGroundClusterL2',1903,826,720,false]
    ],
    '1': [
      ['cachePlaceGardenHorizon',960,540,490,false],
      ['cachePlaceConstructionCompact',960,692,510,false],
      ['cachePlaceSignalOrchard',960,633,490,true],
      ['cachePlaceNightDataMarket',960,633,490,true],
      ['cacheUtilityCorner',1585,992,590,false],
      ['cacheGroundClusterR2',1774,887,720,false]
    ]
  };
  const people=[
    ['cachePersonCourier',1036/1560,110],
    ['cachePersonUmbrella',1036/1534,109],
    ['cachePersonBicycleCourier',1481/1048,104],
    ['cachePersonSweeper',1199/1330,104],
    ['cachePersonHandheldPlayer',993/1560,108],
    ['cachePersonWavingResident',1015/1503,108],
    ['cachePersonSkateboarder',1238/1319,104],
    ['cachePersonCrateCarrier',1263/1208,102]
  ];
  const props={
    shop:['cacheStreetBicycleRack',1526/1023,88],
    works:['cacheStreetWorkSupplies',1491/1039,88],
    homes:['cacheStreetBenchPlanters',1546/1040,87],
    civic:['cacheStreetDataKiosk',1224/1318,85]
  };
  function random(seed,side,index,salt=0) {
    let v=(seed ^ Math.imul(side+7,0x9e3779b9) ^
      Math.imul(index+113,0x85ebca6b) ^ Math.imul(salt+17,0xc2b2ae35))>>>0;
    v=Math.imul(v^(v>>>16),0x7feb352d);
    v=Math.imul(v^(v>>>15),0x846ca68b);
    return ((v^(v>>>16))>>>0)/4294967296;
  }
  // Values are keyed by world knot, not by the viewport or draw order.
  // Neighboring generated sections therefore meet at the same road point.
  function spine(seed,side,at) {
    const knot=330,cell=Math.floor(at/knot),t=smooth((at-cell*knot)/knot);
    const offset=i=>480+random(seed,side,i,6)*175;
    return mix(offset(cell),offset(cell+1),t);
  }
  // A crossing is a usable junction, even when two independently generated
  // paths meet between authored control points. Split both paths there before
  // building adjacency; otherwise a visible intersection cannot be routed.
  function planarize(paths) {
    const segments=[];
    paths.forEach((edge,source)=>{
      for(let i=0;i<edge.points.length-1;i++) {
        segments.push({edge,source,a:edge.points[i],
          b:edge.points[i+1],cuts:[0,1]});
      }
    });
    const cross=(a,b)=>a.at*b.radial-a.radial*b.at;
    for(let i=0;i<segments.length;i++) {
      const a=segments[i],r={at:a.b.at-a.a.at,
        radial:a.b.radial-a.a.radial};
      for(let j=i+1;j<segments.length;j++) {
        const b=segments[j];
        if(a.edge.side!==b.edge.side)continue;
        const s={at:b.b.at-b.a.at,radial:b.b.radial-b.a.radial};
        const den=cross(r,s);
        if(Math.abs(den)<1e-7)continue;
        const q={at:b.a.at-a.a.at,radial:b.a.radial-a.a.radial};
        const t=cross(q,s)/den,u=cross(q,r)/den;
        if(t<0||t>1||u<0||u>1)continue;
        a.cuts.push(t);b.cuts.push(u);
      }
    }
    const edges=[];
    for(const part of segments) {
      part.cuts.sort((a,b)=>a-b);
      const at=t=>({at:mix(part.a.at,part.b.at,t),
        radial:mix(part.a.radial,part.b.radial,t)});
      for(let i=1;i<part.cuts.length;i++) {
        const lo=part.cuts[i-1],hi=part.cuts[i];
        if(hi-lo<1e-6)continue;
        edges.push({side:part.edge.side,kind:part.edge.kind,
          width:part.edge.width,source:part.source,
          points:[at(lo),at(hi)]});
      }
    }
    return edges;
  }
  // A street graph in route-distance/lateral coordinates. A cell is sized
  // after its chosen site art: larger clusters reserve a longer and wider
  // block. Cross streets bound those cells, may curve either way, and some
  // outer endpoints connect into short loops. There is no outer highway.
  function createGrid(seed,end) {
    const nodes=[],edges=[];
    for(const side of [-1,1]) {
      let at=side<0?80:145,previousOuter=null,previousDeep=null,
        loopRun=0,deepRun=0,i=0;
      while(at<end+550) {
        const roll=random(seed,side,i,2);
        const role=roll<.18?'open':roll<.43?'homes':
          roll<.70?'shop':roll<.89?'works':'civic';
        const art=role==='open'?null:assets[String(side)][Math.floor(
          random(seed,side,i,4)*assets[String(side)].length)];
        const width=art?art[3]:410;
        const span=Math.round(clamp(92+width*.17+
          random(seed,side,i,13)*70,185,280));
        const endAt=at+span,mid=(at+endAt)/2;
        const startR=spine(seed,side,at),endR=spine(seed,side,endAt);
        edges.push({side,kind:'service',width:132,points:[
          {at,radial:startR},
          {at:mid,radial:spine(seed,side,mid)},
          {at:endAt,radial:endR}
        ]});
        const hasCross=random(seed,side,i,3)<.78 || i%4===0;
        const roadMarginStart=65,roadMarginEnd=65;
        if(hasCross) {
          // Leave the site boundary almost straight, then make the turn after
          // clearing the footprint. A far segment may head either forward or
          // back along the route; it cannot slice through the occupied lot.
          const fromStart=random(seed,side,i,26)<.5;
          const originAt=fromStart?at:endAt;
          const originR=fromStart?startR:endR;
          const crossWidth=60+Math.round(random(seed,side,i,17)*22);
          const outer={at:originAt+(random(seed,side,i,14)-.5)*span*1.15,
            radial:originR+940+random(seed,side,i,15)*280};
          const clear={at:originAt+(fromStart?1:-1)*12,
            radial:originR+Math.max(850,width*.82+270)};
          edges.push({side,kind:'cross',width:crossWidth,points:[
            {at:originAt,radial:originR},
            clear,
            outer
          ]});
          if(previousOuter && loopRun<2 &&
              random(seed,side,i,18)<.67) {
            const halfway=(previousOuter.at+outer.at)/2;
            edges.push({side,kind:'loop',width:63+
              Math.round(random(seed,side,i,19)*17),points:[
              previousOuter,
              {at:halfway+(random(seed,side,i,20)-.5)*38,
                radial:Math.max(previousOuter.radial,outer.radial)+80+
                  random(seed,side,i,21)*130},
              outer
            ]});
            loopRun++;
          } else loopRun=0;
          // An outer junction can keep travelling away from the highway,
          // double back, or join the previous pocket. These short streets
          // give the graph another dimension without another highway spine.
          if(random(seed,side,i,27)<.68) {
            const deep={at:outer.at+(random(seed,side,i,28)-.5)*span*1.5,
              radial:outer.radial+260+random(seed,side,i,29)*190};
            edges.push({side,kind:'spur',width:52+
              Math.round(random(seed,side,i,31)*18),points:[
              outer,
              {at:mix(outer.at,deep.at,.55)+(random(seed,side,i,32)-.5)*38,
                radial:mix(outer.radial,deep.radial,.55)},
              deep
            ]});
            if(previousDeep && deepRun<2 &&
                random(seed,side,i,33)<.52) {
              edges.push({side,kind:'link',width:58,points:[
                previousDeep,
                {at:mix(previousDeep.at,deep.at,.5),
                  radial:Math.max(previousDeep.radial,deep.radial)+
                    32+random(seed,side,i,34)*85},
                deep
              ]});
              deepRun++;
            } else deepRun=0;
            previousDeep=deep;
          }
          previousOuter=outer;
        }
        if(random(seed,side,i,22)<.28) {
          // Branch at a real junction, so route finding can turn here.
          const innerAt=endAt;
          edges.push({side,kind:'alley',width:47,points:[
            {at:innerAt,radial:spine(seed,side,innerAt)},
            {at:innerAt+(random(seed,side,i,23)-.5)*55,radial:315+
              random(seed,side,i,24)*42}
          ]});
        }
        if(art) {
          const center=mid+(random(seed,side,i,25)-.5)*18;
          const radial=spine(seed,side,center);
          const near=random(seed,side,i,11)<.43;
          const size=1+Math.floor(random(seed,side,i,7)*3);
          const group=[];
          for(let p=0;p<size;p++) {
            let id=Math.floor(random(seed,side,i,p+8)*people.length);
            while(group.some(person=>person.id===id))id=(id+1)%people.length;
            group.push({id,at:center+(p-(size-1)/2)*18,
              travel:random(seed,side,i,p+20)>.5?1:-1,
              phase:random(seed,side,i,p+30)*2*Math.PI});
          }
          nodes.push({side,at:center,radial,role,parcel:art,group,near,
            buildingR:near?radial-225:radial+Math.max(235,width*.44),
            walkR:radial+(near?-88:88),
            lightR:radial+(near?-89:89),
            lot:{start:at+roadMarginStart,end:endAt-roadMarginEnd,
              inner:near?radial-330:radial+112,
              outer:near?radial-112:radial+Math.max(420,width*.82)},
            stop:side<0&&(role==='shop'||role==='civic')&&
              i%8===3&&random(seed,side,i,5)<.73,
            light:random(seed,side,i,12)<.72});
        }
        at=endAt;i++;
      }
    }
    const streets=planarize(edges),vertices=[],lookup=new Map();
    const vertex=(side,p)=>{
      const key=`${side}:${p.at.toFixed(4)}:${p.radial.toFixed(4)}`;
      if(!lookup.has(key)) {
        lookup.set(key,vertices.length);
        vertices.push({id:vertices.length,side,at:p.at,
          radial:p.radial,edges:[]});
      }
      return lookup.get(key);
    };
    streets.forEach((edge,id)=>{
      edge.id=id;edge.from=vertex(edge.side,edge.points[0]);
      edge.to=vertex(edge.side,edge.points[edge.points.length-1]);
      edge.busRoute=edge.side<0&&edge.kind==='service';
      vertices[edge.from].edges.push(id);
      vertices[edge.to].edges.push(id);
    });
    return {seed,mode:'grid',edges:streets,vertices,
      nodes:nodes.sort((a,b)=>b.at-a.at)};
  }
  // Camera fitting study. This review-only layout reuses the live horizon,
  // camera, terrain projection and existing paintings. A block contains
  // joined frontages, a corner, a branch street and a deeper compound; its
  // coordinates remain fixed in the world as the car advances.
  function createCards(seed,end) {
    const blocks=[];
    for(let start=55,index=0;start<end+500;start+=390,index++) {
      for(const side of [-1,1]) {
        const offset=(random(seed,side,index,41)-.5)*48;
        const row=270+(random(seed,side,index,42)-.5)*38;
        const outer=690+(random(seed,side,index,43)-.5)*55;
        const a=start+offset;
        const left=side<0;
        const cards=left?[
          {at:a+82,radial:row+105,art:['cachePlaceHouse',960,891,575,true]},
          {at:a+151,radial:row+125,art:['cacheRepairShop',1389,1132,700,false]},
          {at:a+230,radial:row+80,art:['cachePlaceMarket',960,876,620,true]},
          {at:a+338,radial:outer+125,art:[index%2?
            'cacheGroundClusterL2':'cacheGroundClusterL1',1903,826,1080,false]}
        ]:[
          {at:a+100,radial:row+135,art:['cachePlaceDiner',960,618,675,false]},
          {at:a+174,radial:row+115,art:['cachePlaceGarage',960,632,640,true]},
          {at:a+250,radial:row+70,art:['cachePlaceConstructionCompact',960,692,550,false]},
          {at:a+343,radial:outer+140,art:[index%2?
            'cacheGroundClusterR1':'cacheGroundClusterR2',
            index%2?1898:1774,index%2?829:887,1080,false]}
        ];
        blocks.push({side,start:a,row,outer,cards});
      }
    }
    return {seed,mode:'cards',blocks};
  }
  // One review district with streets and occupied space between frontage
  // and back blocks. This is an authored camera fixture, not the generator.
  function createBlock(seed,end) {
    const blocks=[];
    for(let start=0,index=0;start<end+600;start+=650,index++) {
      for(const side of [-1,1]) {
        const mouth=start+(side<0?335:485)+
          Math.round((random(seed,side,index,70)-.5)*22);
        const left=side<0,back=left?585:610;
        const cards=left?[
          {at:mouth-158,radial:360,art:['cachePlaceHouse',960,891,595,true]},
          {at:mouth+130,radial:370,art:['cacheRepairShop',1389,1132,720,false]},
          {at:mouth-128,radial:back+78,
            art:['cacheGreenhouseWorkshop',1536,1024,630,false]},
          {at:mouth+105,radial:back+77,
            art:['cacheGroundClusterL2',1903,826,870,false]},
          {at:mouth-50,radial:480,
            art:['cacheVendorStall',1391,1131,390,false]}
        ]:[
          {at:mouth-145,radial:380,art:['cachePlaceDiner',960,618,695,false]},
          {at:mouth+125,radial:370,art:['cachePlaceGarage',960,632,670,true]},
          {at:mouth-125,radial:back+75,
            art:['cacheUtilityCorner',1585,992,640,false]},
          {at:mouth+95,radial:back+72,
            art:['cacheGroundClusterR2',1774,887,870,false]},
          {at:mouth-50,radial:500,
            art:['cacheVendorStall',1391,1131,390,false]}
        ];
        const junction={at:mouth+82,radial:back};
        const streets=[
          {side,kind:'cross',points:[
            {at:mouth,radial:188},{at:mouth+10,radial:305},
            {at:mouth+37,radial:530},junction]},
          {side,kind:'back',points:[
            {at:mouth-207,radial:back+19},
            {at:mouth-65,radial:back+5},junction,
            {at:mouth+215,radial:back-42}]},
          {side,kind:'alley',points:[junction,
            {at:mouth+107,radial:back+210}]}
        ];
        const props=left?[
          {at:mouth-176,radial:260,key:'cacheStreetBicycleRack',w:180,h:121},
          {at:mouth+164,radial:270,key:'cacheStreetWorkSupplies',w:165,h:115},
          {at:mouth-112,radial:back+12,key:'cacheStreetDataKiosk',w:100,h:108},
          {at:mouth+122,radial:back-85,key:'cacheStreetDeliveryVan',w:255,h:173}
        ]:[
          {at:mouth-166,radial:265,key:'cacheStreetBenchPlanters',w:175,h:118},
          {at:mouth+169,radial:265,key:'cacheStreetBicycleRack',w:170,h:114},
          {at:mouth-122,radial:back+10,key:'cacheStreetDataKiosk',w:100,h:108},
          {at:mouth+119,radial:back-88,key:'cacheStreetDeliveryVan',w:250,h:169}
        ];
        const pedestrians=(left?[
          [mouth-190,290,'cachePersonCourier',false],
          [mouth-165,303,'cachePersonUmbrella',true],
          [mouth+118,310,'cachePersonMechanic',false],
          [mouth+99,back+5,'cachePersonSkateboarder',true]
        ]:[
          [mouth-185,291,'cachePersonStudent',true],
          [mouth-158,305,'cachePersonCrateCarrier',false],
          [mouth+136,303,'cachePersonFoodWorker',false],
          [mouth+102,back+5,'cachePersonBicycleCourier',true]
        ]).map(([at,radial,key,flip])=>({at,radial,key,flip}));
        const lamps=[
          {at:mouth-74,radial:300},
          {at:mouth+108,radial:back+20}
        ];
        blocks.push({side,mouth,back,cards,streets,junction,props,
          pedestrians,lamps});
      }
    }
    return {seed,mode:'block',blocks};
  }
  function openingAt(layout,side,at) {
    return layout?.mode==='block' && layout.blocks.some(block=>
      block.side===side&&Math.abs(at-block.mouth)<68);
  }
  function create(seed=14,end=10000,mode='spine') {
    seed=Number(seed)>>>0;
    if(mode==='block')return createBlock(seed,end);
    if(mode==='cards')return createCards(seed,end);
    if(mode==='grid')return createGrid(seed,end);
    if(mode!=='spine'&&mode!=='layered')throw Error('Unknown district mode');
    const nodes=[];
    const cadence=118;
    for(const side of [-1,1]) {
      for(let i=0;i<Math.ceil((end+600)/cadence);i++) {
        const at=125+i*cadence+Math.round((random(seed,side,i,1)-.5)*35);
        const roll=random(seed,side,i,2);
        const role=roll<.16?'open':roll<.42?'homes':
          roll<.70?'shop':roll<.90?'works':'civic';
        const branch=role!=='open' && random(seed,side,i,3)<.56;
        const radial=spine(seed,side,at);
        const parcel=role==='open'?null:assets[String(side)][Math.floor(
          random(seed,side,i,4)*assets[String(side)].length)];
        // A stop is attached to the uninterrupted service spine, not to the
        // divided highway, and only a small fraction of civic/shop nodes get one.
        const stop=side===-1 && (role==='civic'||role==='shop') &&
          i%10===2 && random(seed,side,i,5)<.78;
        const groupSize=role==='open'?0:
          1+Math.floor(random(seed,side,i,7)*3);
        const group=[];
        for(let p=0;p<groupSize;p++) {
          const choice=Math.floor(random(seed,side,i,p+8)*people.length);
          let id=choice;
          while(group.some(person=>person.id===id))id=(id+1)%people.length;
          group.push({id,at:at+(p-(groupSize-1)/2)*19,
            travel:random(seed,side,i,p+20)>.5?1:-1,
            phase:random(seed,side,i,p+30)*2*Math.PI});
        }
        nodes.push({side,at,radial,role,branch,parcel,stop,group,
          outer:mode==='layered'?radial+520:
            radial+270+Math.round(random(seed,side,i,10)*90),
          near:random(seed,side,i,11)<.43,
          light:random(seed,side,i,12)<.72});
      }
    }
    return {seed,mode,nodes:nodes.sort((a,b)=>b.at-a.at)};
  }
  function draw(ctx,projection,layout,elapsedMs=0) {
    const {progress,sideDepth,roadsideX,terrainAt,clipRoadside}=projection;
    const point=(side,at,radial)=>{
      const t=sideDepth(at-progress);
      const x=roadsideX(side,t,radial,300);
      return {x,y:terrainAt(side,t,x)+2*t,t};
    };
    const fill=({x:a,y:b},{x:c,y:d},{x:e,y:f},{x:g,y:h},color)=>{
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);
      ctx.lineTo(e,f);ctx.lineTo(g,h);ctx.closePath();ctx.fill();
    };
    const strip=(side,a,b,radialA,radialB,width,color)=>{
      const f1=point(side,b,radialB-width/2),n1=point(side,a,radialA-width/2);
      const n2=point(side,a,radialA+width/2),f2=point(side,b,radialB+width/2);
      if(n1.t<.10||f1.t>1.17||n1.t<=f1.t)return;
      clipRoadside((n1.t+f1.t)/2,()=>fill(f1,n1,n2,f2,color));
    };
    // Each road edge is a 2D world path. Its ribbon width is perpendicular
    // to that path in world coordinates, so a cross street, diagonal and
    // hairpin all use the same projection as an along-route street.
    const roadRibbon=(edge,width,color)=>{
      const {side,points}=edge;
      for(let k=0;k<points.length-1;k++) {
        const start=points[k],end=points[k+1];
        const da=end.at-start.at,dr=end.radial-start.radial;
        const length=Math.hypot(da,dr);
        if(!length)continue;
        const normalAt=-dr/length*width/2;
        const normalR=da/length*width/2;
        const steps=Math.max(1,Math.ceil(length/24));
        for(let i=0;i<steps;i++) {
          const a=i/steps,b=(i+1)/steps;
          const p1=point(side,mix(start.at,end.at,a)+normalAt,
            mix(start.radial,end.radial,a)+normalR);
          const p2=point(side,mix(start.at,end.at,b)+normalAt,
            mix(start.radial,end.radial,b)+normalR);
          const p3=point(side,mix(start.at,end.at,b)-normalAt,
            mix(start.radial,end.radial,b)-normalR);
          const p4=point(side,mix(start.at,end.at,a)-normalAt,
            mix(start.radial,end.radial,a)-normalR);
          const t=(p1.t+p2.t+p3.t+p4.t)/4;
          if(t<.11||t>1.16)continue;
          clipRoadside(t,()=>fill(p1,p2,p3,p4,color));
        }
      }
    };
    const junction=(edge,vertex,width,color)=>{
      const center=point(edge.side,vertex.at,vertex.radial);
      if(center.t<.12||center.t>1.14)return;
      const steps=12;
      clipRoadside(center.t,()=>{
        ctx.fillStyle=color;ctx.beginPath();
        for(let i=0;i<=steps;i++) {
          const angle=i*2*Math.PI/steps;
          const p=point(edge.side,vertex.at+Math.cos(angle)*width/2,
            vertex.radial+Math.sin(angle)*width/2);
          if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);
        }
        ctx.closePath();ctx.fill();
      });
    };
    if(layout.mode==='block') {
      const blocks=layout.blocks.filter(block=>
        block.mouth>progress-290&&block.mouth<progress+660);
      for(const block of blocks) {
        const {side,mouth,back,streets}=block;
        // Four occupied parcels leave a real cross-street opening between
        // two highway frontages. The back lane turns across the block.
        const lots=[
          [mouth-264,mouth-68,280,674,'#364b4c'],
          [mouth+72,mouth+254,280,662,'#3a4c4c'],
          [mouth-245,mouth-55,back+52,back+260,'#405154'],
          [mouth+87,mouth+235,back+50,back+250,'#3b4d50']
        ];
        for(const [near,far,inner,outer,color] of lots) {
          const quad=[point(side,far,inner),point(side,near,inner),
            point(side,near,outer),point(side,far,outer)];
          if(quad[1].t<.10||quad[0].t>1.14)continue;
          clipRoadside((quad[0].t+quad[1].t)/2,()=>fill(...quad,color));
        }
        for(const edge of streets) {
          const width=edge.kind==='alley'?47:edge.kind==='back'?85:112;
          roadRibbon(edge,width+36,'#889a99');
          roadRibbon(edge,width+22,'#56686c');
          roadRibbon(edge,width,'#172d38');
        }
        junction(streets[0],block.junction,132,'#889a99');
        junction(streets[0],block.junction,112,'#172d38');
        // A painted stop line marks the entrance from the highway shoulder.
        const stop=[point(side,mouth-17,275),point(side,mouth+17,275),
          point(side,mouth+17,282),point(side,mouth-17,282)];
        clipRoadside(stop[0].t,()=>fill(...stop,'#d1bf92'));
        for(let i=0;i<4;i++) {
          const r=313+i*23;
          const stripe=[point(side,mouth-45,r),point(side,mouth+42,r),
            point(side,mouth+42,r+8),point(side,mouth-45,r+8)];
          clipRoadside(stripe[0].t,()=>fill(...stripe,'#a7b7ac'));
        }
        // Wet center marks make the cross street legible even when small.
        for(let r=365;r<back-40;r+=105) {
          const at=mouth+12+(r-305)*.14;
          const a=point(side,at,r),b=point(side,at+6,r+42);
          clipRoadside(a.t,()=>{
            ctx.strokeStyle='#a8c9c6';ctx.lineWidth=Math.max(1,3*a.t);
            ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
          });
        }
      }
      const items=blocks.flatMap(block=>[
        ...block.cards.map(card=>({...card,side:block.side,type:'card'})),
        ...block.props.map(prop=>({...prop,side:block.side,type:'prop'})),
        ...block.pedestrians.map(person=>({...person,side:block.side,type:'person'})),
        ...block.lamps.map(lamp=>({...lamp,side:block.side,type:'lamp'}))
      ]).sort((a,b)=>b.at-a.at);
      for(const item of items) {
        const p=point(item.side,item.at,item.radial),t=p.t;
        if(t<.11||t>1.13||p.x<-380||p.x>2300)continue;
        if(item.type==='lamp') {
          clipRoadside(t,()=>{
            const height=125*t,reach=36*t;
            ctx.strokeStyle='#172b34';ctx.lineWidth=Math.max(2,7*t);
            ctx.beginPath();ctx.moveTo(p.x,p.y);
            ctx.lineTo(p.x,p.y-height);
            ctx.lineTo(p.x-item.side*reach,p.y-height-8*t);ctx.stroke();
            ctx.fillStyle='#f2bb75';ctx.beginPath();
            ctx.ellipse(p.x-item.side*reach,p.y-height-6*t,
              14*t,5*t,0,0,Math.PI*2);ctx.fill();
          });
          continue;
        }
        const card=item.type==='card';
        const [key,sourceW,sourceH,maxW,flip]=card?item.art:[];
        const width=card?maxW*t:
          item.type==='prop'?item.w*t:
          (item.key==='cachePersonSkateboarder'||
            item.key==='cachePersonBicycleCourier'?74:48)*t;
        const height=card?width*sourceH/sourceW:
          item.type==='prop'?item.h*t:104*t;
        ctx.save();
        if(card) {
          ctx.beginPath();ctx.moveTo(p.x-width/2,0);
          ctx.lineTo(p.x+width/2,0);
          for(let j=12;j>=0;j--) {
            const x=p.x-width/2+width*j/12;
            ctx.lineTo(x,terrainAt(item.side,t,x)+6*t);
          }
          ctx.closePath();ctx.clip();
        }
        clipRoadside(t,()=>{
          if(!card) {
            ctx.fillStyle='#0e1c2599';ctx.beginPath();
            ctx.ellipse(p.x,p.y+3*t,Math.max(4,width*.3),4*t,
              0,0,Math.PI*2);ctx.fill();
          }
          const travelPose=item.type==='person' &&
            ['cachePersonBicycleCourier','cachePersonSkateboarder',
              'cachePersonCrateCarrier'].includes(item.key);
          B.PresentationAssets?.draw?.(card?key:item.key,ctx,{
            x:p.x,y:p.y+(card?12*t:0),width,height,
            flip:card?flip:travelPose?false:!!item.flip});
        });
        ctx.restore();
      }
      return;
    }
    if(layout.mode==='cards') {
      const blocks=layout.blocks.filter(block=>
        block.start<progress+500&&block.start+390>progress-130);
      // Every pad is a portion of one projected bank; pavement and curbs
      // travel at road speed. The painted building feet still need to be
      // separated from their old private ground in the eventual asset kit.
      for(const block of blocks) {
        const {side,start,row,outer}=block;
        const pads=[
          [start+30,start+192,row+26,row+330,'#35484d'],
          [start+198,start+280,row+18,row+286,'#3d4b4d'],
          [start+286,start+372,outer+15,outer+345,'#394c4c']
        ];
        for(const [near,far,inner,edge,color] of pads) {
          const points=[point(side,far,inner),point(side,near,inner),
            point(side,near,edge),point(side,far,edge)];
          if(points[1].t<.08||points[0].t>1.15)continue;
          clipRoadside((points[0].t+points[1].t)/2,()=>
            fill(...points,color));
        }
        const edges=[
          {side,points:[{at:start+10,radial:row-2},
            {at:start+183,radial:row+17},
            {at:start+285,radial:row+10},
            {at:start+382,radial:row-18}]},
          {side,points:[{at:start+285,radial:row+10},
            {at:start+307,radial:outer-55},
            {at:start+351,radial:outer+66}]}
        ];
        for(const edge of edges) {
          roadRibbon(edge,87,'#58666b');
          roadRibbon(edge,68,'#263840');
        }
        junction(edges[0],{at:start+285,radial:row+10},87,'#58666b');
        junction(edges[0],{at:start+285,radial:row+10},68,'#263840');
        // The highway-side pavement shares the bank with the parallel road.
        strip(side,start+10,start+382,row-74,row-82,21,'#687779');
      }
      const cards=blocks.flatMap(block=>block.cards.map(card=>({
        ...card,side:block.side}))).sort((a,b)=>b.at-a.at);
      for(const card of cards) {
        const {side,at,radial,art}=card;
        const p=point(side,at,radial),t=p.t;
        if(t<.11||t>1.12||p.x<-400||p.x>2320)continue;
        const [key,sourceW,sourceH,maxW,flip]=art;
        const width=maxW*t,height=width*sourceH/sourceW;
        ctx.save();ctx.beginPath();ctx.moveTo(p.x-width/2,0);
        ctx.lineTo(p.x+width/2,0);
        for(let i=12;i>=0;i--) {
          const x=p.x-width/2+width*i/12;
          ctx.lineTo(x,terrainAt(side,t,x)+5*t);
        }
        ctx.closePath();ctx.clip();
        clipRoadside(t,()=>B.PresentationAssets?.draw?.(key,ctx,{
          x:p.x,y:p.y+13*t,width,height,flip}));
        ctx.restore();
      }
      return;
    }
    if(layout.mode==='grid') {
      for(const node of layout.nodes) {
        if(!node.lot||node.at<progress-115||node.at>progress+460)continue;
        const {side,lot,role}=node;
        const t1=sideDepth(lot.start-progress),t2=sideDepth(lot.end-progress);
        if(t1<.11||t2>1.14)continue;
        const startBase=spine(layout.seed,side,lot.start);
        const endBase=spine(layout.seed,side,lot.end);
        const innerOffset=lot.inner-node.radial,outerOffset=lot.outer-node.radial;
        const a=point(side,lot.end,endBase+innerOffset);
        const b=point(side,lot.start,startBase+innerOffset);
        const c=point(side,lot.start,startBase+outerOffset);
        const d=point(side,lot.end,endBase+outerOffset);
        const color=role==='homes'?'#414f50':
          role==='civic'?'#3c4b52':'#36454b';
        clipRoadside((a.t+b.t)/2,()=>fill(a,b,c,d,color));
      }
      const edges=layout.edges.filter(edge=>
        edge.points.some(p=>p.at>progress-155&&p.at<progress+470));
      edges.sort((a,b)=>b.points[0].at-a.points[0].at);
      for(const edge of edges) {
        roadRibbon(edge,edge.width+21,'#58656a');
        roadRibbon(edge,edge.width,edge.kind==='alley'?'#30424a':'#263941');
      }
      for(const vertex of layout.vertices) {
        if(vertex.edges.length<3)continue;
        const edge=layout.edges[vertex.edges[0]];
        const width=Math.max(...vertex.edges.map(id=>layout.edges[id].width));
        junction(edge,vertex,width+15,'#58656a');
        junction(edge,vertex,width,'#263941');
      }
    } else {
    // Continuous asphalt and narrow curbs. World samples move toward the
    // camera with progress, just like existing ground grain and road joints.
    const far=Math.floor((progress+442)/18)*18;
    for(let at=far;at>progress-142;at-=18) {
      for(const side of [-1,1]) {
        const a=at-18,b=at,ra=spine(layout.seed,side,a),rb=spine(layout.seed,side,b);
        strip(side,a,b,ra-102,rb-102,27,'#53626b');
        strip(side,a,b,ra+102,rb+102,27,'#53626b');
        strip(side,a,b,ra,rb,166,'#25343d');
        if(Math.floor(at/18)%4===0)
          strip(side,a,b,ra,rb,2,'#6e838281');
        if(layout.mode==='layered') {
          strip(side,a,b,ra+520-80,rb+520-80,22,'#506169');
          strip(side,a,b,ra+520+80,rb+520+80,22,'#506169');
          strip(side,a,b,ra+520,rb+520,132,'#273840');
        }
      }
    }
    // Short alleys leave the spine at a shared junction and run outward to
    // a parcel. Some next-node pairs join to form a genuine local loop.
    for(const node of layout.nodes) {
      if(!node.branch||node.at<progress-90||node.at>progress+420)continue;
      const {side,at,radial,outer}=node;
      const steps=6;
      for(let j=0;j<steps;j++) {
        const a=radial+(outer-radial)*j/steps;
        const b=radial+(outer-radial)*(j+1)/steps;
        const wa=at-17+j*2,wb=at-17+(j+1)*2;
        const c1=point(side,wa,a),c2=point(side,wa+32,a);
        const c3=point(side,wb+32,b),c4=point(side,wb,b);
        if(c1.t<.12||c1.t>1.14)continue;
        clipRoadside(c1.t,()=>fill(c1,c2,c3,c4,'#293942'));
      }
      const next=layout.nodes.find(other=>other.side===side&&
        other.at<at&&at-other.at<165&&other.branch);
      if(layout.mode==='spine'&&next && Math.floor(at/118)%3===0) {
        for(let d=at-22;d>next.at+16;d-=18) {
          const a=Math.max(next.at+16,d-18);
          strip(side,a,d,outer,outer,72,'#293942');
        }
      }
    }
    // Every occupied parcel owns an approach from the curb. The parcel and
    // street use the same four world corners at every camera progress.
    for(const node of layout.nodes) {
      if(node.role==='open'||node.at<progress-90||node.at>progress+420)continue;
      const near=layout.mode==='spine'&&node.near,center=node.radial;
      const inner=layout.mode==='layered'?center+100:
        near?center-235:center+94;
      const outer=layout.mode==='layered'?center+420:
        near?center-90:center+320;
      const a=node.at-43,b=node.at+43;
      const corners=[point(node.side,b,inner),point(node.side,a,inner),
        point(node.side,a,outer),point(node.side,b,outer)];
      if(corners[1].t<.11||corners[0].t>1.13)continue;
      const paving=node.role==='homes'?'#425052':
        node.role==='civic'?'#394a51':'#354149';
      clipRoadside((corners[0].t+corners[1].t)/2,()=>
        fill(...corners,paving));
      // A short kerb gap indicates where someone can step off the local street.
      const curb=layout.mode==='layered'?center+94:
        near?center-92:center+93;
      strip(node.side,a,b,curb,curb,4,'#9b9e8f');
    }
    }
    const visible=layout.nodes.filter(node=>node.at>progress-90&&node.at<progress+430);
    // A world's depth order is stable across frames. Props and people attach
    // to sidewalk coordinates derived from the road, never screen x/y seeds.
    const drawings=[];
    for(const node of visible) {
      const {side,at,radial,role}=node;
      if(node.parcel) {
        const outer=layout.mode==='spine'&&node.branch&&
          random(layout.seed,side,Math.floor(at),15)<.16;
        const radialBase=layout.mode==='grid'?node.buildingR:
          layout.mode==='layered'?radial+260:
          outer?node.outer+140:node.near?radial-235:radial+300;
        drawings.push({type:'building',side,at:at+(layout.mode==='grid'?0:22),radial:radialBase,
          art:node.parcel,scale:layout.mode==='grid'?(node.near?1:.92):
            layout.mode==='layered'?.78:
            role==='civic'?1.08:1});
      }
      if(role!=='open')drawings.push({type:'prop',side,
        at:layout.mode==='grid'?
          clamp(at-18,node.lot.start+12,node.lot.end-12):at-36,
        radial:layout.mode==='grid'?node.walkR:
          radial+(node.near?-103:103),art:props[role]});
      if(node.stop)drawings.push({type:'stop',side,
        at:layout.mode==='grid'?
          clamp(at+12,node.lot.start+16,node.lot.end-16):at-56,
        radial:layout.mode==='grid'?node.walkR:radial-115});
      if(node.light)drawings.push({type:'lamp',side,
        at:layout.mode==='grid'?
          clamp(at+26,node.lot.start+12,node.lot.end-12):at+70,
        radial:layout.mode==='grid'?node.lightR:radial-115});
      for(const member of node.group) {
        const walk=17*Math.sin(elapsedMs/1200+member.phase);
        const direction=Math.cos(elapsedMs/1200+member.phase)*member.travel;
        drawings.push({type:'person',side,
          at:member.at+walk*member.travel,
          radial:layout.mode==='grid'?node.walkR:radial-105,
          art:people[member.id],direction});
      }
    }
    drawings.sort((a,b)=>b.at-a.at);
    for(const item of drawings) {
      const {side,at,radial,art}=item;
      const p=point(side,at,radial),t=p.t;
      if(t<.13||t>1.10||p.x<-350||p.x>2270)continue;
      clipRoadside(t,()=>{
        if(item.type==='lamp'||item.type==='stop') {
          const h=108*t;
          ctx.lineWidth=1+3*t;ctx.strokeStyle='#183039';
          ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-h);ctx.stroke();
          if(item.type==='lamp') {
            ctx.fillStyle='#eaa867';ctx.fillRect(p.x-7*t,p.y-h-3*t,13*t,6*t);
          } else {
            ctx.fillStyle='#48c5c3';ctx.fillRect(p.x-12*t,p.y-h-5*t,24*t,21*t);
            ctx.fillStyle='#143b43';ctx.font=`bold ${Math.max(5,16*t)}px Oxanium`;
            ctx.fillText('B',p.x-5*t,p.y-h+12*t);
            B.PresentationAssets?.draw?.('cacheStreetBenchPlanters',ctx,{
              x:p.x+side*36*t,y:p.y,width:105*t,height:70*t});
          }
          return;
        }
        const building=item.type==='building';
        const [key,sourceW,sourceH,maxW,flip]=art;
        const height=building||item.type==='stop'?
          maxW*t*(item.scale||1)*sourceH/sourceW:sourceH*t;
        const width=building||item.type==='stop'?
          maxW*t*(item.scale||1):sourceW*height;
        // Sink the authored ground edge into the same bank as the streets.
        if(building) {
          ctx.save();ctx.beginPath();ctx.moveTo(p.x-width/2,0);
          ctx.lineTo(p.x+width/2,0);
          for(let j=12;j>=0;j--) {
            const x=p.x-width/2+width*j/12;
            ctx.lineTo(x,terrainAt(side,t,x)+4*t);
          }
          ctx.closePath();ctx.clip();
        }
        if(item.type==='person') {
          ctx.fillStyle='#13242a7a';ctx.beginPath();
          ctx.ellipse(p.x,p.y+2*t,Math.max(3,width*.3),3*t,0,0,Math.PI*2);ctx.fill();
        }
        B.PresentationAssets?.draw?.(key,ctx,{x:p.x,y:p.y,width,height,
          flip:!!flip});
        if(building)ctx.restore();
      });
    }
  }
  B.CacheRoadDistricts={create,draw,spine,openingAt};
})(window.BARCODE=window.BARCODE||{});
