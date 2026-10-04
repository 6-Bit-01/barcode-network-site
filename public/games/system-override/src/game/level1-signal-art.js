// Authored utility/threat cels share the existing presentation loader and clocks.
// The art never owns damage, pickup rules, timers or a Canvas surface.
window.FILE_MANIFEST=window.FILE_MANIFEST||[];
window.FILE_MANIFEST.push({name:'src/game/level1-signal-art.js',
  exports:['BARCODE.Level1SignalArt'],dependencies:['BARCODE.PresentationAssets']});
(function(B) {
  'use strict';
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  function quiet(reduced=false) {
    const prefs=B.Preferences?.values||{};
    return reduced||prefs.reducedMotion||prefs.flashes===false||window.BARCODE_RENDER_QUALITY?.flashes===false;
  }
  function threatPose({x=0,y=0,width=240,height=278,elapsedMs=0,warningMs=1400,
    active,activeAgeMs,activeDurationMs=420,reduced=false}={}) {
    const elapsed=Math.max(0,finite(elapsedMs)),warning=Math.max(1,finite(warningMs,1400));
    const live=typeof active==='boolean'?active:elapsed>=warning;
    const age=Math.max(0,finite(activeAgeMs,elapsed-warning));
    const duration=Math.max(1,finite(activeDurationMs,420));
    return {x:finite(x),y:finite(y),width:Math.max(0,finite(width)),height:Math.max(0,finite(height)),
      active:live,frame:live?4+(quiet(reduced)?0:clamp(Math.floor(age/duration*4),0,3)):
        quiet(reduced)?0:Math.floor(elapsed/175)%4};
  }
  function rectPath(ctx,{x,y,width,height}) {
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+width,y);ctx.lineTo(x+width,y+height);
    ctx.lineTo(x,y+height);ctx.closePath();
  }
  function drawThreat(ctx,options={}) {
    if(!ctx)return false;
    const p=threatPose(options);if(p.width<=0||p.height<=0)return false;
    ctx.save();rectPath(ctx,p);ctx.clip();
    // Hollow authored electricity replaces the orange rectangle. Clipping
    // keeps each painted fringe within the exact existing danger volume.
    const alpha=ctx.globalAlpha;
    ctx.globalAlpha*=p.active?.54:.80;
    const painted=!!B.PresentationAssets?.draw?.('level1SignalDischarge',ctx,{
      x:p.x,y:p.y,width:p.width,height:p.height,frame:p.frame});
    ctx.globalAlpha=alpha;
    // Thin corner contacts remain exact even while an image is still loading.
    // They are an address guide, never an opaque rectangle over the character.
    const inset=1.5,tick=Math.min(13,p.width/8,p.height/8);
    ctx.strokeStyle=p.active?'#fff0bf':'#ffc478';ctx.lineWidth=p.active?2:1.5;ctx.beginPath();
    for(const sx of [-1,1])for(const sy of [-1,1]) {
      const x=p.x+(sx<0?inset:p.width-inset),y=p.y+(sy<0?inset:p.height-inset);
      ctx.moveTo(x-sx*tick,y);ctx.lineTo(x,y);ctx.lineTo(x,y-sy*tick);
    }
    ctx.stroke();ctx.restore();return painted;
  }
  function ampPose({x=0,y=0,scale=1,timeMs=0,chargeCount=3,reduced=false}={}) {
    return {x:finite(x),y:finite(y),scale:Math.max(0,finite(scale,1)),
      frame:quiet(reduced)?0:Math.floor(Math.max(0,finite(timeMs))/140)%8,
      chargeCount:clamp(Math.floor(finite(chargeCount)),0,3)};
  }
  function drawAmp(ctx,options={}) {
    if(!ctx)return false;
    const p=ampPose(options);if(p.scale<=0)return false;
    ctx.save();
    const painted=!!B.PresentationAssets?.draw?.('level1SignalAmp',ctx,{
      x:p.x,y:p.y-3*p.scale,width:52*p.scale,height:58*p.scale,frame:p.frame});
    if(painted) {
      // Three real charge sockets sit over the painted housing. Their mint
      // fill tracks remaining uses independently of the purple speaker glow.
      ctx.translate(p.x,p.y);ctx.scale(p.scale,p.scale);
      for(let i=0;i<3;i++) {
        ctx.fillStyle='#081b25';ctx.fillRect(-16+i*11,10,10,6);
        ctx.strokeStyle='#c6e4d5';ctx.lineWidth=.8;ctx.strokeRect(-15.6+i*11,10.4,9.2,5.2);
        ctx.fillStyle=i<p.chargeCount?'#a3ffee':'#2d4347';ctx.fillRect(-15+i*11,11,8,4);
      }
    }
    ctx.restore();return painted;
  }
  B.Level1SignalArt=Object.freeze({threatPose,ampPose,drawThreat,drawAmp});
})(window.BARCODE=window.BARCODE||{});
