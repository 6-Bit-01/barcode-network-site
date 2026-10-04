// Authored rhythm hardware and energy stay on the road's existing projection.
// Two clipped triangles per surface; no stored particles or extra frame owner.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/game/cache-road-beat-surface.js',
  exports:['BARCODE.CacheRoadBeatSurface'],dependencies:['BARCODE.PresentationAssets']});
(function(B) {
  'use strict';
  const UNIT=256;
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
  const available=key=>!!B.PresentationAssets?.ready?.(key);
  function polygon(ctx,points) {
    ctx.beginPath();ctx.moveTo(...points[0]);
    for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();
  }
  // UV top is the far side of the road; UV bottom approaches the tires.
  // The same true trapezoid/turn camera owns both texture and ink glyph.
  function paintQuad(ctx,key,points,{frame=0,opacity=1}={}) {
    if(!available(key)||points?.length!==4||!points.every(point=>
      point?.length===2&&point.every(value=>Number.isFinite(value)&&Math.abs(value)<1e6)))return false;
    const [a,b,c,d]=points;
    const forward=[(c[0]-d[0])/UNIT,(c[1]-d[1])/UNIT,
      (b[0]-c[0])/UNIT,(b[1]-c[1])/UNIT];
    const reverse=[(b[0]-a[0])/UNIT,(b[1]-a[1])/UNIT,
      (a[0]-d[0])/UNIT,(a[1]-d[1])/UNIT];
    // Capped-width pads and pulses often form a true parallelogram.
    // Both original triangle warps are then the same affine paint. Clip its
    // complete native quad once, retaining UV orientation, opacity and camera.
    if(forward.every((value,index)=>Math.abs(value-reverse[index])<=1e-10)){
      ctx.save();ctx.globalAlpha*=clamp(opacity);polygon(ctx,points);ctx.clip();
      ctx.transform(...forward,d[0],d[1]);
      B.PresentationAssets.draw(key,ctx,{x:UNIT/2,y:UNIT/2,width:UNIT,height:UNIT,frame});
      ctx.restore();return true;
    }
    for(const [triangle,matrix] of [
      [[d,c,b],forward],
      [[d,b,a],reverse]
    ]) {
      ctx.save();ctx.globalAlpha*=clamp(opacity);polygon(ctx,triangle);ctx.clip();
      ctx.transform(...matrix,d[0],d[1]);
      B.PresentationAssets.draw(key,ctx,{x:UNIT/2,y:UNIT/2,width:UNIT,height:UNIT,frame});
      ctx.restore();
    }
    return true;
  }
  function paintSprite(ctx,key,{x=0,y=0,width=96,height=width,frame=0,opacity=1}={}) {
    if(!available(key)||![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return false;
    ctx.save();ctx.globalAlpha*=clamp(opacity);
    const drawn=B.PresentationAssets.draw(key,ctx,{x,y,width,height,frame});
    ctx.restore();return !!drawn;
  }
  function roadQuad(p,lane,near,far,{fraction=.42,cap=150}={}) {
    const width=t=>Math.min(cap,(p.laneEdge(lane+1,t)-p.laneEdge(lane,t))*fraction);
    return [[p.laneX(lane,near)-width(near),p.roadY(near)],
      [p.laneX(lane,near)+width(near),p.roadY(near)],
      [p.laneX(lane,far)+width(far),p.roadY(far)],
      [p.laneX(lane,far)-width(far),p.roadY(far)]];
  }
  function drawPad(ctx,s,pulse,cue,{projection:p,spent=false,latched=false,quiet=false}={}) {
    if(!available('cacheBeatHardware'))return false;
    const near=p.depth(cue.d-18),far=p.depth(cue.d+18),ready=cue.ready&&!spent;
    const hot=ready&&cue.window,alpha=spent?.30:latched?.82:1;
    if(p.strikeDepth>far+.005&&available('cacheBeatEnergy')) {
      paintQuad(ctx,'cacheBeatEnergy',roadQuad(p,pulse.lane,p.strikeDepth,far,
        {fraction:.34,cap:124}),{frame:pulse.action,opacity:spent?.06:ready?.66:.29});
      // Three shallow conductive pulses, attached to the actual revealed
      // runway. Their bounded travel reads song phase, never changes targets.
      if(ready&&!quiet&&cue.remaining>=0)for(let step=1;step<=3;step++) {
        const phase=(step+clamp(1-((cue.remaining%1+1)%1)))/5;
        const t=far+(p.strikeDepth-far)*phase;
        const distance=p.strikeDistance+(cue.d+18-p.strikeDistance)*(1-phase);
        const n=p.depth(distance-3),f=p.depth(distance+3);
        if(n>f)paintQuad(ctx,'cacheBeatEnergy',roadQuad(p,pulse.lane,n,f,
          {fraction:.26,cap:94}),{frame:pulse.action,opacity:.35+.24*t});
      }
    }
    const points=roadQuad(p,pulse.lane,near,far,{fraction:.40,cap:130});
    paintQuad(ctx,'cacheBeatHardware',points,{frame:pulse.action+(hot?4:0),opacity:alpha});
    return true;
  }
  function drawDock(ctx,lane,{projection:p,active=false,hot=false,caught=false,action=lane}={}) {
    if(!available('cacheBeatHardware'))return false;
    const near=p.depth(p.strikeDistance-7),far=p.depth(p.strikeDistance+7);
    return paintQuad(ctx,'cacheBeatHardware',roadQuad(p,lane,near,far,
      {fraction:.47,cap:180}),{frame:action+(hot||caught?4:0),opacity:active||caught?.92:.28});
  }
  function drawTargetRing(ctx,x,y,radius,{window=false,charge=0,quiet=false}={}) {
    return paintSprite(ctx,'cacheBeatTiming',{x,y,width:radius*2+14,height:radius*2+14,
      frame:window?2:charge>.03?1:0,opacity:quiet?.86:1});
  }
  function drawImpact(ctx,receipt,points) {
    if(!available('cacheBeatEnergy'))return false;
    if(receipt.age>=650)return true;
    return paintQuad(ctx,'cacheBeatEnergy',points,{frame:4+receipt.action,
      opacity:receipt.quiet?.70:Math.max(0,1-receipt.age/750)*(receipt.perfect?1:.74)});
  }
  function drawSparks(ctx,receipt,x,y) {
    if(!available('cacheBeatEnergy'))return false;
    if(receipt.quiet||receipt.age>=650)return true;
    // Authored spark clusters behave like particles without an emitter or
    // a persistent pool: one receipt, up to four finite analytic poses.
    for(let i=0;i<(receipt.perfect?4:2);i++) {
      const side=i%2?1:-1,step=Math.floor(i/2),size=(receipt.perfect?42:32)*(1-receipt.expansion*.25);
      paintSprite(ctx,'cacheBeatEnergy',{x:x+side*(72+receipt.expansion*(24+step*13)),
        y:y-20+step*25-receipt.expansion*(12+step*9),width:size,height:size,
        frame:8+receipt.action,opacity:Math.max(0,1-receipt.age/650)});
    }
    return true;
  }
  function drawShell(ctx,receipt,x,y,width,height,{compact=false}={}) {
    const frame=receipt.kind==='miss'?6:receipt.perfect?5:4;
    return paintSprite(ctx,'cacheBeatTiming',{x,y,width,height,frame,
      opacity:compact?.94:1});
  }
  function drawRelease(ctx,receipt,x,y) {
    const size=receipt.quiet?75:75+receipt.impact*(receipt.perfect?20:10);
    return paintSprite(ctx,'cacheBeatTiming',{x,y,width:size,height:size,frame:3,
      opacity:receipt.quiet?.55:Math.max(.35,receipt.impact)});
  }
  function drawStreak(ctx,x,y) {
    return paintSprite(ctx,'cacheBeatTiming',{x,y,width:57,height:14,frame:7,opacity:.82});
  }
  B.CacheRoadBeatSurface=Object.freeze({available,paintQuad,paintSprite,roadQuad,
    drawPad,drawDock,drawTargetRing,drawImpact,drawSparks,drawShell,drawRelease,drawStreak,
    limits:Object.freeze({trianglesPerSurface:2,runwayPulses:3,sparkClusters:4,
      padImageCalls:10,targetImageCalls:14,receiptImageCalls:10})});
})(window.BARCODE=window.BARCODE||{});
