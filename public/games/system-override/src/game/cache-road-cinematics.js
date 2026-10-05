// Authored road staging has no actor, reward, chart, input or clock ownership.
// The road supplies its shared elapsed time and paints these read-only poses.
window.FILE_MANIFEST=window.FILE_MANIFEST||[];
window.FILE_MANIFEST.push({name:'src/game/cache-road-cinematics.js',
  exports:['BARCODE.CacheRoadCinematics'],dependencies:[]});
(function(B) {
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const smooth=n=>{const u=clamp(n,0,1);return u*u*(3-2*u);};
  const span=(t,a,b)=>smooth((t-a)/(b-a));
  const durations=Object.freeze({opening:7600,handoff:1400,outro:3800});
  const openingLines=Object.freeze([
    Object.freeze({at:450,speaker:'CACHE BACK',text:'They want the tape? Come get it.'}),
    Object.freeze({at:2200,speaker:'6 BIT',text:'Cache. Eyes on the road.'}),
    Object.freeze({at:4900,speaker:'CACHE BACK',text:"One lane open. That's all I need."})
  ]);
  const outroLines=Object.freeze([
    Object.freeze({at:150,speaker:'6 BIT',text:'Still got the original?'}),
    Object.freeze({at:1250,speaker:'CACHE BACK',text:"Riding shotgun. I'm out."}),
    Object.freeze({at:2550,speaker:'MAC MODEM',text:"Your next route's open."})
  ]);
  const lineAt=(lines,t)=>[...lines].reverse().find(line=>t>=line.at)||null;
  function pose(kind,timeMs,{reducedMotion=false,baseLane=1}={}) {
    if(!Object.hasOwn(durations,kind))return null;
    const t=clamp(Number.isFinite(timeMs)?timeMs:0,0,durations[kind]);
    const lane=clamp(Number.isFinite(baseLane)?baseLane:1,0,3);
    const car={lane,depth:.83,scale:1,steer:0};
    let phase,progressOffset=0,hudAlpha=1,controlRatio=0,dialogue=null,actors=[];
    if(kind==='opening') {
      const close=span(t,1600,3400),ram=span(t,3450,4300),escape=span(t,4300,5900);
      const returnLane=span(t,4500,6400);
      phase=t<1600?'cruise':t<3450?'surrounded':t<4300?'ram':t<6200?'breakaway':'handoff';
      progressOffset=reducedMotion?0:-300*(1-t/durations.opening);
      car.lane=reducedMotion?lane:lane-.50*ram*(1-returnLane);
      car.steer=reducedMotion?0:t<4300?-.65*ram:.55*(1-returnLane);
      const impact=t>=4300,impactAge=Math.max(0,t-4300);
      if(t>=1400&&t<5900)actors.push({id:'opening-rammer',kind:'rammer',cinematic:true,
        lane:lane-.76-(impact?2.7*escape:0),gap:230-218*close-42*escape,
        phase:impact?'wreck':'approach',ageMs:impact?impactAge:t,
        height:reducedMotion?0:Math.sin(Math.min(1,impactAge/1400)*Math.PI)*44,
        flipAngle:reducedMotion?0:-Math.min(1,impactAge/1500)*Math.PI*1.4,
        damage:impact?1:0,alpha:1,rider:false});
      if(t>=1750)actors.push({id:'opening-escort',kind:'escort',cinematic:true,
        lane:lane+1.03,gap:255-212*close+74*span(t,4800,7600),
        phase:'approach',ageMs:t,damage:0,alpha:1,rider:false});
      hudAlpha=span(t,6200,7600);dialogue=lineAt(openingLines,t);
    } else if(kind==='handoff') {
      phase='control';controlRatio=span(t,0,durations.handoff);
      actors=t<durations.handoff?[{id:'opening-escort',kind:'escort',cinematic:true,
        lane:lane+1.03,gap:117+430*span(t,0,durations.handoff),
        phase:'approach',ageMs:durations.opening+t,damage:0,alpha:1,rider:false,horizonExit:true}]:[];
    } else {
      phase=t<900?'depart':t<3200?'horizon':'gone';
      const departure=span(t,200,3600);
      progressOffset=reducedMotion?0:240*departure;
      car.depth=.83*(1-departure);car.scale=car.depth/.83;
      hudAlpha=1-span(t,0,900);dialogue=lineAt(outroLines,t);
    }
    return {kind,timeMs:t,durationMs:durations[kind],phase,progressOffset,car,actors,
      hudAlpha,controlRatio,dialogue,complete:t>=durations[kind],impact:kind==='opening'&&t>=4300};
  }
  function drawOverlay(ctx,view,{reducedMotion=false,button='ENTER / A'}={}) {
    if(!ctx||!view||view.kind==='handoff')return;
    ctx.save();
    try {
      const letterbox=view.kind==='opening'?1-view.hudAlpha:1;
      ctx.fillStyle='#07121f';ctx.globalAlpha=.88*letterbox;
      ctx.fillRect(0,0,1920,68);ctx.fillRect(0,986,1920,94);
      ctx.globalAlpha=1;
      const line=view.dialogue;
      if(line) {
        const cueAge=view.timeMs-line.at;
        const appear=reducedMotion?1:span(cueAge,0,160);
        const width=1080,x=420,y=892;
        ctx.globalAlpha=appear;
        ctx.fillStyle='#071923ee';ctx.fillRect(x,y,width,89);
        ctx.strokeStyle=line.speaker==='CACHE BACK'?'#f0d383':'#90efd8';ctx.lineWidth=3;
        ctx.strokeRect(x+2,y+2,width-4,85);
        ctx.fillStyle=ctx.strokeStyle;ctx.font='bold 16px Oxanium, monospace';ctx.textAlign='left';
        ctx.fillText(line.speaker,x+24,y+25);
        ctx.fillStyle='#fff5dc';ctx.font='bold 28px Oxanium, monospace';
        ctx.fillText(line.text,x+24,y+63,width-48);
      }
      ctx.globalAlpha=.82;ctx.textAlign='right';ctx.fillStyle='#d6dfcd';
      ctx.font='16px Oxanium, monospace';ctx.fillText(`${button} · SKIP`,1856,1047);
    } finally {ctx.restore();}
  }
  const hudContexts=new WeakMap();
  function hudContextInfo(context) {return hudContexts.get(context)||null;}
  function withHUDAlpha(context,alpha) {
    const fade=clamp(alpha,.001,1),methods=new Map();
    // This is the existing frame context. Bound methods retain native Canvas
    // receivers, and logical alpha reads avoid multiplying the fade twice
    // when a painter uses `globalAlpha *= itsOwnAlpha`.
    const proxy=new Proxy(context,{
      get(target,key) {
        if(key==='globalAlpha')return target.globalAlpha/fade;
        const value=Reflect.get(target,key,target);
        if(typeof value!=='function')return value;
        if(!methods.has(key))methods.set(key,value.bind(target));
        return methods.get(key);
      },
      set(target,key,value) {
        if(key==='globalAlpha') {target.globalAlpha=clamp(value,0,1)*fade;return true;}
        return Reflect.set(target,key,value,target);
      }
    });
    // Only proxies authored here may unwrap to the shared frame context.
    // The scene recorder still reads this proxy's logical, unfaded alpha.
    hudContexts.set(proxy,Object.freeze({frameContext:context,opacity:fade}));
    return proxy;
  }
  B.CacheRoadCinematics=Object.freeze({pose,drawOverlay,withHUDAlpha,hudContextInfo,durations,openingLines,outroLines});
})(window.BARCODE=window.BARCODE||{});
