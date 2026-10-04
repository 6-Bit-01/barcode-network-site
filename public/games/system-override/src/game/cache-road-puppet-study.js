// Visual study only. Loaded by tools/render-cache-road-mirror.cjs when the
// review environment requests it; not part of the playable game script graph.
(function(B) {
  'use strict';
  const mix=(a,b,t)=>a+(b-a)*t;
  function random(seed,side,i,salt=0) {
    let n=(seed^Math.imul(side+9,0x9e3779b9)^
      Math.imul(i+31,0x85ebca6b)^Math.imul(salt+113,0xc2b2ae35))>>>0;
    n=Math.imul(n^(n>>>16),0x7feb352d);
    n=Math.imul(n^(n>>>15),0x846ca68b);
    return ((n^(n>>>16))>>>0)/4294967296;
  }
  const front={
    '-1': [
      ['cachePlaceHouse',960,891,480,true],
      ['cachePlaceMarket',960,876,520,true],
      ['cacheRepairShop',1389,1132,570,false]
    ],
    '1': [
      ['cachePlaceDiner',960,618,520,false],
      ['cachePlaceGarage',960,632,490,true],
      ['cacheUtilityCorner',1585,992,540,false]
    ]
  };
  const middle=[
    ['cachePuppetA',1774,887,880,false],
    ['cachePuppetB',1774,887,880,false],
    ['cachePuppetC',1774,887,880,false],
    ['cachePuppetD',1902,827,880,false]
  ];
  const deep={
    '-1': [
      ['cacheGroundClusterL1',1903,826,790,false],
      ['cacheGroundClusterL2',1903,826,790,false],
      ['cacheOutskirtsHomes',1536,1024,550,false]
    ],
    '1': [
      ['cacheGroundClusterR1',1898,829,790,false],
      ['cacheGroundClusterR2',1774,887,790,false],
      ['cacheOutskirtsWorkshops',1536,1024,550,false]
    ]
  };
  function create(seed,end) {
    const blocks=[],cards=[];
    for(const side of [-1,1]) {
      let at=side<0?-100:50,index=0;
      while(at<end+700) {
        const span=410+Math.round(random(seed,side,index,1)*115);
        const mouth=at+205+Math.round((random(seed,side,index,2)-.5)*48);
        const local=475+Math.round((random(seed,side,index,3)-.5)*85);
        const outer=765+Math.round((random(seed,side,index,4)-.5)*75);
        blocks.push({side,at,span,mouth,local,outer});
        const frontSet=front[String(side)],deepSet=deep[String(side)];
        const first=frontSet[Math.floor(random(seed,side,index,7)*frontSet.length)];
        const second=frontSet[(frontSet.indexOf(first)+1+
          Math.floor(random(seed,side,index,8)*2))%frontSet.length];
        const midId=(index+Math.floor(random(seed,side,index,9)*4))%4;
        const mid=middle[midId];
        const far=deepSet[Math.floor(random(seed,side,index,10)*deepSet.length)];
        // The access mouth gets its own gap. Nearby illustration can overlap
        // in screen space but cannot occupy that world's along-road address.
        cards.push({side,at:at+85,radial:285,art:first,tier:'front'});
        cards.push({side,at:at+span-65,radial:300,art:second,tier:'front'});
        cards.push({side,at:at+132,radial:local+77,
          art:[...middle[(midId+1)%4].slice(0,3),605,false],
          tier:'secondary'});
        cards.push({side,at:at+span-185,radial:local+64,art:mid,tier:'middle'});
        cards.push({side,at:at+span-115,radial:outer+45,art:far,tier:'deep'});
        // A different card in the second half keeps a block from reading as
        // a single painted backdrop across the entire bank.
        if(index%2===0)cards.push({side,at:at+span-265,
          radial:local+18,art:['cacheGreenhouseWorkshop',1536,1024,400,false],
          tier:'infill'});
        at+=span;index++;
      }
    }
    return {seed,blocks,cards};
  }
  function draw(ctx,projection,layout,pass) {
    const {progress,sideDepth,roadsideX,terrainAt,clipRoadside}=projection;
    const point=(side,at,radial)=>{
      const t=sideDepth(at-progress);
      const x=roadsideX(side,t,radial,0);
      return {x,y:terrainAt(side,t,x),t};
    };
    const fill=(points,color)=>{
      ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
      for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
      ctx.closePath();ctx.fillStyle=color;ctx.fill();
    };
    const ribbon=(side,a,b,width,color)=>{
      const dx=b.at-a.at,dy=b.radial-a.radial;
      const length=Math.hypot(dx,dy),u=dy/length*width/2,
        v=-dx/length*width/2;
      fill([point(side,a.at+u,a.radial+v),
        point(side,b.at+u,b.radial+v),
        point(side,b.at-u,b.radial-v),
        point(side,a.at-u,a.radial-v)],color);
    };
    if(pass==='ground') {
      // Projected streets occupy the bank up to the asphalt edge; their
      // connection never paints a diagonal across the driving lanes.
      for(const side of [-1,1]) {
        ctx.save();ctx.beginPath();
        ctx.moveTo(side<0?0:1920,0);
        ctx.lineTo(roadsideX(side,0,0,0),0);
        for(let i=0;i<=36;i++) {
          const t=i/30;
          ctx.lineTo(roadsideX(side,t,0,0),400+680*t*t);
        }
        ctx.lineTo(side<0?0:1920,1080);
        ctx.closePath();ctx.clip();
      // Connected local street: a real mouth on the arterial, an angled
      // access, and an outer lane linking the next block's access.
      for(const block of layout.blocks) {
        if(block.side!==side)continue;
        if(block.at>progress+520||block.at+block.span<progress-130)continue;
        const {at,span,mouth,local,outer}=block;
        // Adjacent world blocks share an urban ground material. Street
        // ribbons cut through it, and upright art sinks into it afterward.
        const pad=[point(side,at+span,210),point(side,at,210),
          point(side,at,outer+190),point(side,at+span,outer+190)];
        ctx.globalAlpha=.43;
        fill(pad,'#394e51');ctx.globalAlpha=1;
        const a={at:mouth,radial:0},
          b={at:mouth+(side<0?-9:12),radial:local},
          c={at:mouth+32,radial:outer},
          d={at:at+span+205,radial:outer+25};
        for(const [p,q] of [[a,b],[b,c],[c,d]]) {
          ribbon(side,p,q,70,'#71848a');
          ribbon(side,p,q,54,'#263c48');
        }
        // Small connected walk pads at the two occupied inner frontages.
        for(const atSite of [at+85,at+span-100]) {
          const far=point(side,atSite+53,175),near=point(side,atSite-53,175);
          const farOut=point(side,atSite+53,425),
            nearOut=point(side,atSite-53,425);
          ctx.globalAlpha=.36;
          fill([far,near,nearOut,farOut],'#587575');
          ctx.globalAlpha=1;
        }
      }
        ctx.restore();
      }
      return;
    }
    // Painter's order: far cards first. Every card has an opaque foot sunk
    // into the terrain curve; none fades or brings a full ground island.
    const active=layout.cards.filter(card=>card.at>progress-145&&
      card.at<progress+495).sort((a,b)=>b.at-a.at);
    for(const card of active) {
      const {side,at,radial,art,tier}=card;
      const p=point(side,at,radial),t=p.t;
      if(t<.02||t>1.10)continue;
      const [key,sourceW,sourceH,maxW,flip]=art;
      const width=maxW*t,height=width*sourceH/sourceW;
      if(p.x+width*.5<0||p.x-width*.5>1920)continue;
      const sink=(key.startsWith('cachePuppet')?9:31)*t;
      const reveal=Math.max(0,Math.min(1,(t-.03)/.71));
      const buried=height*(1-reveal)*.43;
      ctx.save();ctx.beginPath();ctx.moveTo(p.x-width*.5,0);
      ctx.lineTo(p.x+width*.5,0);
      for(let i=16;i>=0;i--) {
        const x=p.x-width*.5+width*i/16;
        ctx.lineTo(x,terrainAt(side,t,x)-buried+2*t);
      }
      ctx.closePath();ctx.clip();
      if(reveal>.85) {
        ctx.fillStyle='#0d1b258c';ctx.beginPath();
        ctx.ellipse(p.x,p.y+2*t,width*.36,9*t,0,0,Math.PI*2);
        ctx.fill();
      }
      B.PresentationAssets?.draw?.(key,ctx,{
        x:p.x,y:p.y+sink,width,height,flip});
      ctx.restore();
    }
    // Street life is attached to the same sidewalk addresses as the cards.
    for(const block of layout.blocks) {
      if(block.at>progress+430||block.at+block.span<progress-90)continue;
      const side=block.side,at=block.mouth-60;
      const t=sideDepth(at-progress);
      if(t<.24||t>1.02)continue;
      const p=point(side,at,420);
      const person=side<0?'cachePersonCrateCarrier':'cachePersonBicycleCourier';
      const prop=side<0?'cacheStreetWorkSupplies':'cacheStreetBicycleRack';
      clipRoadside(t,()=>{
        B.PresentationAssets?.draw?.(prop,ctx,{
          x:p.x+side*31*t,y:p.y,width:114*t,height:80*t});
        B.PresentationAssets?.draw?.(person,ctx,{
          x:p.x-side*35*t,y:p.y,width:61*t,height:96*t});
      });
    }
  }
  B.CacheRoadPuppetStudy={create,draw};
})(window.BARCODE=window.BARCODE||{});
