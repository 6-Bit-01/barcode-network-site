// Road timing paint reads immutable song targets and earned ONE receipts.
// Native plates and live tire targets share the original road projection.
// The same small Canvas paths remain readable while a sheet is unavailable.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/game/cache-road-beat-feedback.js',
  exports:['BARCODE.CacheRoadBeatFeedback'],dependencies:['BARCODE.CacheRoadGuidance','BARCODE.CacheRoadBeatSurface']});
(function(B) {
  'use strict';
  const INK='#071521',PAPER='#f4ffdc',COLORS=['#8bf2a6','#ff917d','#77ddff','#ffe085'];
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
  const ease=n=>1-Math.pow(1-clamp(n),3);
  const quiet=reduced=>!!reduced||window.BARCODE_RENDER_QUALITY?.flashes===false;
  function path(ctx,points) {
    ctx.beginPath();for(let i=0;i<points.length;i++)
      i?ctx.lineTo(...points[i]):ctx.moveTo(...points[i]);ctx.closePath();
  }
  function outline(ctx,points,color,width=3,ink=0) {
    path(ctx,points);ctx.lineJoin='round';
    if(ink) {ctx.lineWidth=width+ink;ctx.strokeStyle=INK;ctx.stroke();}
    ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
  }
  function text(ctx,value,x,y,size,color=PAPER,width=200) {
    ctx.font=`bold ${size}px Oxanium, monospace`;ctx.textAlign='center';
    ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(String(value),x,y,width);
  }
  function badge(ctx,action,x,y,size,{active=false,disabled=false,road,skin=true}={}) {
    B.CacheRoadGuidance?.drawButton(ctx,{index:action,x,y,size,active,disabled,road,skin});
  }
  function feedbackPose(s,{reduced=false}={}) {
    const receipt=s?.beatFeedback;
    if(!receipt||!['perfect','good','miss'].includes(receipt.kind))return null;
    const age=(s.elapsedMs||0)-receipt.atMs,duration=receipt.expiresMs-receipt.atMs;
    if(age<0||age>=duration||duration<=0)return null;
    const calm=quiet(reduced),success=receipt.kind!=='miss',perfect=receipt.kind==='perfect';
    return {...receipt,quality:receipt.kind,age,duration,quiet:calm,success,perfect,
      // One attack, one expansion, then a readable held receipt. Never blink.
      impact:calm?0:Math.max(0,1-age/(perfect?420:300)),
      expansion:calm?0:ease(age/(perfect?580:460)),
      alpha:Math.min(1,(duration-age)/220),
      lift:calm?0:ease(age/850)*14,
      color:success?(perfect?'#ffe59c':COLORS[receipt.action]||'#b6f6dc'):'#93acae'};
  }
  function drawTarget(ctx,s,{nextPulse,nextCue,projection,reduced=false,road}={}) {
    const p=projection,calm=quiet(reduced),receipt=feedbackPose(s,{reduced});
    ctx.save();ctx.lineCap='round';
    for(let lane=0;lane<4;lane++) {
      const active=nextCue?.ready&&nextPulse?.lane===lane;
      const hot=active&&nextCue.window;
      const caught=!active&&receipt?.success&&receipt.age<650&&receipt.lane===lane;
      const color=active?COLORS[nextPulse.action]:caught?receipt.color:'#8badad';
      const left=p.laneEdge(lane,p.strikeDepth)+10,right=p.laneEdge(lane+1,p.strikeDepth)-10;
      if(B.CacheRoadBeatSurface?.drawDock(ctx,lane,{projection:p,active,hot,caught,
        action:active?nextPulse.action:caught?receipt.action:lane}))continue;
      ctx.globalAlpha=active||caught?1:.32;
      ctx.strokeStyle=INK;ctx.lineWidth=10;ctx.beginPath();
      ctx.moveTo(left,p.strikeY);ctx.lineTo(right,p.strikeY);ctx.stroke();
      ctx.strokeStyle=hot?PAPER:color;ctx.lineWidth=hot||caught?6:active?4:2;
      ctx.beginPath();ctx.moveTo(left,p.strikeY);ctx.lineTo(right,p.strikeY);ctx.stroke();
      for(const [edge,direction] of [[left,1],[right,-1]]) {
        ctx.beginPath();ctx.moveTo(edge+direction*(active?35:21),p.strikeY-17);
        ctx.lineTo(edge,p.strikeY-17);ctx.lineTo(edge,p.strikeY+17);
        ctx.lineTo(edge+direction*(active?35:21),p.strikeY+17);ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
    if(nextPulse&&nextCue?.ready) {
      const x=p.laneX(nextPulse.lane,p.strikeDepth),y=p.strikeY+79;
      const color=COLORS[nextPulse.action],inLane=Math.abs(s.lanePos-nextPulse.lane)<=.38;
      // The timing ring closes once on ONE. It follows the song rather than
      // a pulse oscillator; quiet preferences retain the same fixed target.
      const radius=calm?38:38+(1-clamp(nextCue.charge))*22;
      if(!B.CacheRoadBeatSurface?.drawTargetRing(ctx,x,y,radius,
        {window:nextCue.window,charge:nextCue.charge,quiet:calm})) {
        ctx.strokeStyle=INK;ctx.lineWidth=8;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle=nextCue.window?PAPER:color;ctx.lineWidth=nextCue.window?4:2;
        ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
      }
      badge(ctx,nextPulse.action,x,y,nextCue.window&&!calm?67:61,{active:nextCue.window,road});
      for(let i=0;i<4;i++) {
        // The preceding bar also has a ONE. It cannot light the destination
        // socket before this pad's actual accepted song window begins.
        const count=[2,3,4,1][i],selected=count===(nextCue.window?1:nextCue.count)&&
          (count!==1||nextCue.window),xx=x+(i-1.5)*35;
        const shape=[[xx-13,p.strikeY+24],[xx+11,p.strikeY+24],[xx+15,p.strikeY+29],
          [xx+13,p.strikeY+44],[xx-13,p.strikeY+44],[xx-15,p.strikeY+39]];
        const authoredCount=B.CacheRoadBeatSurface?.paintSprite(ctx,'cacheBeatHardware',{x:xx,y:p.strikeY+34,
          width:34,height:29,frame:nextPulse.action+(selected?4:0),opacity:selected?1:.45});
        if(!authoredCount) {
          path(ctx,shape);ctx.fillStyle=selected?(count===1?PAPER:color):'#183440';ctx.fill();
          outline(ctx,shape,selected?PAPER:'#58787a',selected?2:1,2);
        }
        const chevronCount=authoredCount&&nextPulse.action===0;
        text(ctx,count,xx,p.strikeY+(chevronCount?30:34),chevronCount?11:14,selected?INK:'#bbd4d0',24);
      }
      text(ctx,nextCue.window?(inLane?'PRESS':'CHANGE LANE'):'ON ONE',x,p.strikeY+130,
        nextCue.window?18:13,nextCue.window?PAPER:color,190);
    }
    ctx.restore();return true;
  }
  function drawPad(ctx,s,pulse,cue,{projection,spent=false,latched=false,reduced=false,road}={}) {
    const p=projection,calm=quiet(reduced),d=cue.d;
    const near=p.depth(d-18),far=p.depth(d+18),mid=p.depth(d);
    if(mid<.17||near<=far)return false;
    const color=COLORS[pulse.action],ready=cue.ready&&!spent,hot=ready&&cue.window;
    const width=t=>Math.min(130,(p.laneEdge(pulse.lane+1,t)-p.laneEdge(pulse.lane,t))*.40);
    const pointsAt=(n,f)=>[[p.laneX(pulse.lane,n)-width(n),p.roadY(n)],
      [p.laneX(pulse.lane,n)+width(n),p.roadY(n)],
      [p.laneX(pulse.lane,f)+width(f),p.roadY(f)],
      [p.laneX(pulse.lane,f)-width(f),p.roadY(f)]];
    const points=pointsAt(near,far),x=p.laneX(pulse.lane,mid),y=p.roadY(mid);
    ctx.save();
    if(B.CacheRoadBeatSurface?.drawPad(ctx,s,pulse,cue,{projection:p,spent,latched,quiet:calm})) {
      // The authored plate already occupies the true road quad. Only the
      // preference-mapped glyph is sharp live paint above its blank face.
      ctx.globalAlpha*=spent?.48:latched?.8:1;ctx.translate(x,y);
      ctx.scale(Math.max(.50,mid),Math.max(.34,mid*.56));
      badge(ctx,pulse.action,0,0,hot&&!calm?107:99,
        {active:hot,disabled:spent,road,skin:false});
      ctx.restore();return true;
    }
    // Two colored rails connect the physical pad to its exact tire target.
    // A fixed three-step pattern shows travel without an extra emitter.
    const stripFar=p.depth(d+18);
    if(p.strikeDepth>stripFar+.005) {
      const runway=pointsAt(p.strikeDepth,stripFar);
      path(ctx,runway);ctx.globalAlpha=spent?.035:.10;ctx.fillStyle=color;ctx.fill();
      for(const side of [-1,1]) {
        const index=side<0?0:1,farIndex=side<0?3:2;
        ctx.globalAlpha=spent?.10:ready?.66:.34;ctx.strokeStyle=color;ctx.lineWidth=ready?3:2;
        ctx.beginPath();ctx.moveTo(...runway[index]);ctx.lineTo(...runway[farIndex]);ctx.stroke();
      }
      if(ready&&cue.remaining>=0)for(let i=1;i<=3;i++) {
        const t=stripFar+(p.strikeDepth-stripFar)*i/4,xx=p.laneX(pulse.lane,t),yy=p.roadY(t);
        ctx.globalAlpha=calm?.40:.25+.35*clamp(1-Math.abs((cue.remaining%1)-(i-1)/3));
        ctx.strokeStyle=color;ctx.lineWidth=2+2*t;ctx.beginPath();
        ctx.moveTo(xx-13*t,yy-6*t);ctx.lineTo(xx,yy+5*t);ctx.lineTo(xx+13*t,yy-6*t);ctx.stroke();
      }
    }
    ctx.globalAlpha=spent?.42:1;path(ctx,points);ctx.fillStyle=INK;ctx.fill();
    // Opaque dark ink gives the mapped face symbol a reliable silhouette on
    // every road texture; broad color carries the runway's one action.
    ctx.globalAlpha=spent?.12:.28;path(ctx,points);ctx.fillStyle=color;ctx.fill();
    ctx.globalAlpha=spent?.40:1;outline(ctx,points,hot?PAPER:color,hot?5:2+mid*2,5);
    if(ready) {
      const scale=calm?1:1+.27*(1-clamp(cue.charge));
      const frame=points.map(([xx,yy])=>[x+(xx-x)*scale,y+(yy-y)*scale]);
      ctx.globalAlpha=calm?.7:.50+.45*clamp(cue.charge);
      outline(ctx,frame,hot?PAPER:color,hot?4:2);
    }
    // Ink remains in the road plane and is later occluded by actual cars.
    ctx.globalAlpha=spent?.48:latched?.8:1;ctx.translate(x,y);
    ctx.scale(Math.max(.50,mid),Math.max(.34,mid*.56));
    badge(ctx,pulse.action,0,0,hot&&!calm?107:99,{active:hot,disabled:spent,road});
    ctx.restore();return true;
  }
  function drawReceipt() {
    // Real judgment and charge feedback remain in the guidance/meter HUD.
    // True prevents the older ground burst from replacing omitted paint.
    return true;
  }
  B.CacheRoadBeatFeedback=Object.freeze({feedbackPose,drawTarget,drawPad,drawReceipt,
    // The three small vector steps are only the missing-sheet fallback.
    colors:Object.freeze(COLORS),limits:Object.freeze({runwaySteps:3,perfectStreaks:0,goodStreaks:0,chargeSockets:4})});
})(window.BARCODE=window.BARCODE||{});
