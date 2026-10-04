// Whole painted combat bodies and local destruction; the controller owns
// identity, positions, attack phases, airborne motion, damage and age.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({ name: 'src/game/cache-road-combat-art.js',
  exports: ['BARCODE.CacheRoadCombatArt'], dependencies: ['BARCODE.PresentationAssets'] });
(function(B) {
  'use strict';
  const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
  const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
  const ANCHORS={"cacheCombatBike":[[0.4642857142857143,0.923828125],[0.34375,0.94921875],[0.6763392857142857,0.955078125],[0.5513392857142857,0.96484375],[0.5178571428571429,0.87890625],[0.5,0.880859375],[0.49330357142857145,0.876953125],[0.6651785714285714,0.93359375]],"cacheCombatHostiles":[[0.5370370370370371,0.8425],[0.5462962962962963,0.8325],[0.5,0.79],[0.7083333333333334,0.785],[0.5208333333333334,0.86],[0.5625,0.845],[0.4722222222222222,0.8125],[0.6851851851851852,0.83],[0.5092592592592593,0.7925],[0.5208333333333334,0.7925],[0.4930555555555556,0.795],[0.6041666666666666,0.8575]],"cacheCombatBikeCrash":[[0.6111111111111112,0.88125],[0.5,0.49895833333333334],[0.4270833333333333,0.975],[0.5,0.5],[0.4991319444444444,0.5],[0.7690972222222222,0.825]],"cacheCombatBlast":[[0.5,0.5],[0.5,0.4990530303030303],[0.49919871794871795,0.4990530303030303],[0.5,0.4990530303030303],[0.49919871794871795,0.5],[0.49919871794871795,0.4990530303030303]]};
  // Source-sheet ground contacts: matching spray/stain pairs keep their
  // own vertical padding while landing on the same physical road point.
  ANCHORS.cacheBloodSplatter=[[.5,.86],[.5,.86],[.5,.86],[.5,.55],[.5,.55],[.5,.55]];
  for(const frames of Object.values(ANCHORS)) {
    frames.forEach(Object.freeze);Object.freeze(frames);
  }
  Object.freeze(ANCHORS);
  const ROLES=Object.freeze({rammer:0,escort:4,disruptor:8});
  const valid=options=>Number.isFinite(options.x)&&Number.isFinite(options.y)&&
    Number.isFinite(options.width)&&options.width>0&&
    Number.isFinite(options.height)&&options.height>0;
  const loaded=key=>!!B.PresentationAssets?.ready?.(key);
  function frameFor(options={}) {
    const age=Math.max(0,finite(options.ageMs));
    const wreck=options.wreck===true||options.phase==='wreck';
    if(options.kind==='bike') {
      if(wreck) {
        if(options.reduced||age>=1600)return {key:'cacheCombatBike',frame:7};
        return {key:'cacheCombatBikeCrash',frame:age<450?0:age<1100?1:2};
      }
      let frame=0;
      if(options.phase==='committed')frame=3;
      else if(options.phase==='stunned')frame=5;
      else if(options.phase==='recover')frame=4;
      else if(options.phase==='windup')
        frame=finite(options.lockLane,options.lane)-finite(options.lane)>0?2:1;
      else if(finite(options.damage)>=.35)frame=6;
      return {key:'cacheCombatBike',frame};
    }
    if(!Object.hasOwn(ROLES,options.kind))return null;
    const variant=wreck?3:options.phase==='committed'?1:
      options.phase==='stunned'||finite(options.damage)>=.35?2:0;
    return {key:'cacheCombatHostiles',frame:ROLES[options.kind]+variant};
  }
  function paint(ctx,key,frame,{x=0,y=0,width,height,center=false}={}) {
    const anchor=center?[.5,.5]:ANCHORS[key]?.[frame];
    if(!anchor)return false;
    const registrationY=key==='cacheCombatBlast'?.5:1;
    return !!B.PresentationAssets.draw(key,ctx,{frame,width,height,
      x:x+width*(.5-anchor[0]),y:y+height*(registrationY-anchor[1])});
  }
  function fallbackBlood(ctx,width,height) {
    // Loading/failure paint stays dark and still. It does not grow a new
    // request, clock or flash while the shared image owner loads the sheet.
    ctx.fillStyle='#5b172b';ctx.strokeStyle='#25151d';ctx.lineWidth=Math.max(1,width*.014);
    ctx.beginPath();ctx.ellipse(0,-height*.025,width*.43,height*.065,-.08,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#9b3048';
    for(const [x,y,r] of [[-.48,-.12,.05],[.44,-.08,.06],[-.27,-.20,.035],[.58,-.16,.027]]) {
      ctx.beginPath();ctx.ellipse(width*x,height*y,width*r,height*r*.52,.2,0,Math.PI*2);ctx.fill();
    }
  }
  function bloodVariantForId(id) {
    if(typeof id!=='string')return 0;
    let hash=0;
    for(let i=0;i<id.length;i++)hash=(hash+id.charCodeAt(i))%3;
    return hash;
  }
  function drawBlood(ctx,options={}) {
    if(!ctx||!valid(options))return false;
    const variant=((Math.trunc(finite(options.variant))%3)+3)%3;
    const age=Math.max(0,finite(options.ageMs));
    ctx.save();
    try {
      ctx.globalAlpha*=clamp(finite(options.alpha,1),0,1);
      ctx.translate(options.x,options.y);
      if(!loaded('cacheBloodSplatter')) {
        fallbackBlood(ctx,options.width,options.height);return true;
      }
      // Stain and spray share caller-owned ground registration. Draw only
      // selects the saved contact age; repeated draws never advance it.
      const painted=paint(ctx,'cacheBloodSplatter',3+variant,
        {width:options.width,height:options.height});
      if(!options.reduced&&options.flashes!==false&&age<200)
        paint(ctx,'cacheBloodSplatter',variant,
          {width:options.width,height:options.height});
      return !!painted;
    } finally {ctx.restore();}
  }
  function drawBody(ctx,options={}) {
    if(!ctx||!valid(options))return false;
    const choice=frameFor(options);
    if(!choice||!loaded(choice.key))return false;
    const wreck=options.wreck===true||options.phase==='wreck';
    const rider=wreck&&options.kind==='bike'&&options.rider!==false;
    if(rider&&!loaded('cacheCombatBikeCrash'))return false;
    const age=Math.max(0,finite(options.ageMs)),scale=options.width/164;
    const airborne=wreck&&!options.reduced&&age<1600;
    const lift=airborne?Math.max(0,finite(options.lift))*scale:0;
    const angle=airborne?finite(options.flipAngle):0;
    let painted=false;
    ctx.save();
    try {
      ctx.globalAlpha*=clamp(finite(options.alpha,1),0,1);
      ctx.translate(options.x,options.y-lift-(airborne?options.height*.42:0));
      if(airborne) {
        // Rotate around the chassis center while retaining its physical ground
        // contact and the controller's distinct airborne lift.
        ctx.rotate(angle);
      }
      painted=paint(ctx,choice.key,choice.frame,{width:options.width,height:options.height,
        center:airborne});
    } finally {ctx.restore();}
    if(!painted)return false;
    if(rider) {
      const settled=options.reduced||age>=1900;
      const frame=settled?5:age<650?3:4;
      const side=finite(options.riderSide,1)<0?-1:1;
      const offset=finite(options.riderOffset)*scale*side;
      const riderLift=settled?0:Math.max(0,finite(options.riderLift))*scale;
      const width=options.width*.82,height=options.height*.72;
      const splattered=settled&&options.splattered===true;
      ctx.save();
      try {
        ctx.globalAlpha*=clamp(finite(options.alpha,1),0,1);
        ctx.translate(finite(options.riderX,options.x+offset),options.y-riderLift-(settled?0:options.height*.52));
        if(!settled)ctx.rotate(finite(options.flipAngle)*.65*side);
        if(splattered)drawBlood(ctx,{x:0,y:0,width:width*1.2,height:height*.7,
          ageMs:options.riderSplatAgeMs,variant:finite(options.bloodVariant,bloodVariantForId(options.id)),
          reduced:options.reduced,flashes:options.flashes});
        paint(ctx,'cacheCombatBikeCrash',frame,{width:width*(splattered?1.06:1),
          height:height*(splattered?.55:1),center:!settled});
      } finally {ctx.restore();}
    }
    return true;
  }
  function blastFrameFor({ageMs=0,durationMs=1900,flashes=true}={}) {
    const duration=Math.max(1,finite(durationMs,1900));
    const age=finite(ageMs);
    if(age<0||age>=duration)return null;
    const frame=Math.min(5,Math.floor(age/duration*6));
    return flashes===false?Math.max(3,frame):frame;
  }
  function drawBlast(ctx,options={}) {
    if(!ctx||options.reduced||!valid(options)||!loaded('cacheCombatBlast'))return false;
    const frame=blastFrameFor(options);if(frame===null)return false;
    const duration=Math.max(1,finite(options.durationMs,1900));
    const progress=clamp(finite(options.ageMs)/duration,0,1);
    ctx.save();
    try {
      ctx.globalAlpha*=clamp(finite(options.alpha,1),0,1)*(1-progress*.7);
      return paint(ctx,'cacheCombatBlast',frame,{x:options.x,y:options.y,
        width:options.width,height:options.height});
    } finally {ctx.restore();}
  }
  function drawFX(ctx,options={}) {
    if(!ctx||!valid(options)||!loaded('cacheCombatFX'))return false;
    let frame=options.frame;
    if(!Number.isInteger(frame)||frame<0||frame>11)return false;
    if(options.flashes===false&&[3,4,5,8,9,10].includes(frame))frame=11;
    if(options.reduced&&frame>=3)return false;
    ctx.save();
    try {
      ctx.globalAlpha*=clamp(finite(options.alpha,1),0,1);
      ctx.translate(options.x,options.y);ctx.rotate(finite(options.angle));
      return B.PresentationAssets.draw('cacheCombatFX',ctx,{frame,width:options.width,height:options.height});
    } finally {ctx.restore();}
  }
  B.CacheRoadCombatArt=Object.freeze({drawBody,drawBlast,drawFX,drawBlood,frameFor,blastFrameFor,
    anchors:ANCHORS});
})(window.BARCODE);
