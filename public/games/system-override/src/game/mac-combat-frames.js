// Authored whole-character cels. The simulation supplies every clock and pose;
// this module owns no loop, input, asset loading, or gameplay state.
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({name:'src/game/mac-combat-frames.js',exports:['BARCODE.MacCombatFrames'],dependencies:[]});
(function(B) {
  'use strict';
  const MOVES = Object.freeze(['jab','cross','finisher','step-strike','air-kick','counter']);
  const STYLES = Object.freeze(Object.fromEntries(Object.entries({
    chitin_scuttler:['jab','rush-jab'], psion_lancer:['lunge','lancer-sweep'],
    bile_spitter:['bile','bile-spread'], prism_guard:['shield-bash','shield-heavy'],
    rift_stalker:['rift-cross','retreat-slash'], shock_mantid:['ground-wave','mantid-leap'],
    null_regent:['cleave','charge','fan','ground-wave']
  }).map(([kind,styles])=>[kind,Object.freeze(styles)])));
  const PHASES = Object.freeze(['windup','active','recovery']);
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const finite = (value, fallback=0) => number(value) ? value : fallback;
  const clamp = (value, low, high) => Math.max(low,Math.min(high,value));
  const fail = message => { throw new Error('Whole-character frames: '+message); };
  const need = (condition,message) => { if (!condition) fail(message); };
  const name = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/.test(value);
  const point = value => value && number(value.x) && number(value.y);
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

  function requiredClips(kind) {
    need(kind==='mac'||Object.prototype.hasOwnProperty.call(STYLES,kind),'unknown actor '+kind);
    const shared = kind==='mac' ? ['idle','walk','guard','jump-rise','jump-fall','landing','hurt','defeat','throw']
      : ['idle','walk','hurt','defeat'];
    return [...shared,...(kind==='mac'?MOVES:STYLES[kind]).flatMap(move=>PHASES.map(phase=>move+'.'+phase))];
  }

  function compile(registration,{complete=false}={}) {
    need(registration?.schemaVersion===1,'unsupported registration');
    const actor=registration.actor;
    requiredClips(actor);
    need(registration.facing==='right','authored facing must be right');
    const standingHeight=registration.pixelScale?.standingVisibleHeight;
    need(number(standingHeight)&&standingHeight>0,'invalid common standing reference height');
    const supplied=registration.sheets||[{id:'main',sourceImage:registration.sourceImage,
      sourceSHA256:registration.sourceSHA256,dimensions:registration.dimensions||registration.sourceDimensions}];
    need(Array.isArray(supplied)&&supplied.length>0,'no sheets');
    const sheets=Object.create(null);
    for (const item of supplied) {
      need(name(item.id)&&!sheets[item.id],'duplicate or invalid sheet id');
      need(typeof item.sourceImage==='string'&&item.sourceImage.length>0,'missing sheet path '+item.id);
      need(hash(item.sourceSHA256),'missing exact image hash '+item.id);
      const dimensions=item.dimensions||item.sourceDimensions;
      need(Number.isInteger(dimensions?.width)&&dimensions.width>0&&Number.isInteger(dimensions.height)&&dimensions.height>0,
        'invalid native sheet dimensions '+item.id);
      const sheetStandingHeight=item.pixelScale?.standingVisibleHeight??item.standingVisibleHeight??standingHeight;
      need(number(sheetStandingHeight)&&sheetStandingHeight>0,'invalid uniform sheet reference height '+item.id);
      sheets[item.id]=Object.freeze({id:item.id,sourceImage:item.sourceImage,sourceSHA256:item.sourceSHA256.toLowerCase(),
        dimensions:Object.freeze({width:dimensions.width,height:dimensions.height}),standingHeight:sheetStandingHeight,
        referenceFrame:item.pixelScale?.referenceFrame||item.referenceFrame||null});
    }
    const sheetIds=Object.keys(sheets),frames=Object.create(null);
    need(Array.isArray(registration.frames)&&registration.frames.length>0,'no whole-character frames');
    for (const item of registration.frames) {
      need(name(item.id)&&!frames[item.id],'duplicate or invalid frame id');
      const sheetId=item.sheet||(sheetIds.length===1?sheetIds[0]:null),sheet=sheets[sheetId];
      need(sheet,'frame '+item.id+' has no unambiguous sheet');
      const source=item.source,pivot=item.feetPivot||item.pivot;
      need(source&&['x','y','width','height'].every(key=>Number.isInteger(source[key]))&&source.x>=0&&source.y>=0
        &&source.width>0&&source.height>0&&source.x+source.width<=sheet.dimensions.width
        &&source.y+source.height<=sheet.dimensions.height,'invalid native crop '+item.id);
      need(point(pivot)&&pivot.x>=0&&pivot.x<=source.width&&pivot.y>=0&&pivot.y<=source.height,
        'invalid feet pivot '+item.id);
      const baselineLift=item.baselineLift??0;
      need(number(baselineLift),'invalid authored baseline lift '+item.id);
      for (const other of Object.values(frames)) if (other.sheet===sheetId) {
        const a=other.source,b=source;
        need(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'overlapping cel crops '+other.id+'/'+item.id);
      }
      frames[item.id]=Object.freeze({id:item.id,sheet:sheetId,sourceImage:sheet.sourceImage,sheetDimensions:sheet.dimensions,
        standingHeight:sheet.standingHeight,baselineLift,
        source:Object.freeze({...source}),feetPivot:Object.freeze({x:pivot.x,y:pivot.y})});
    }
    const clips=Object.create(null);
    need(registration.clips&&typeof registration.clips==='object','no authored clips');
    for (const [key,item] of Object.entries(registration.clips)) {
      need(name(key)&&Array.isArray(item?.frames)&&item.frames.length>0,'invalid clip '+key);
      need(typeof item.loop==='boolean','clip must explicitly declare loop '+key);
      let totalMs=0;
      const sequence=item.frames.map(entry=>{
        need(frames[entry.frame],'unknown cel '+entry.frame+' in '+key);
        need(number(entry.holdMs)&&entry.holdMs>0,'invalid authored hold in '+key);
        const startMs=totalMs; totalMs+=entry.holdMs;
        need(Number.isFinite(totalMs),'invalid clip duration '+key);
        return Object.freeze({frame:entry.frame,holdMs:entry.holdMs,startMs,endMs:totalMs});
      });
      clips[key]=Object.freeze({key,loop:item.loop,totalMs,frames:Object.freeze(sequence)});
    }
    if (complete) {
      for (const key of requiredClips(actor)) need(clips[key],'missing committed action '+actor+'/'+key);
      for (const key of requiredClips(actor).filter(key=>key.includes('.')||['throw','hurt','defeat','landing'].includes(key)))
        need(!clips[key].loop,'committed action must not loop '+key);
      need(new Set(clips.walk.frames.map(entry=>entry.frame)).size>=2,'walk needs at least two authored cels');
      if(actor==='mac') {
        need(Math.abs(clips.throw.totalMs-420)<.001,'throw holds must cover the existing 420ms commitment');
        need(Math.abs(clips.landing.totalMs-100)<.001,'landing holds must cover the authored 100ms settlement');
      }
    }
    return Object.freeze({actor,standingHeight,sheets:Object.freeze(sheets),sheetIds:Object.freeze(sheetIds),
      frames:Object.freeze(frames),clips:Object.freeze(clips),complete});
  }

  function selectFrame(compiled,key,{progress,ageMs=0,terminal=false}={}) {
    const clip=compiled.clips[key];
    need(clip,'missing committed clip '+compiled.actor+'/'+key);
    let time=terminal?clip.totalMs:number(progress)?clamp(progress,0,1)*clip.totalMs:Math.max(0,finite(ageMs));
    if (clip.loop&&!number(progress)&&!terminal) time%=clip.totalMs;
    time=clamp(time,0,clip.totalMs);
    // Match the fixed simulation's boundary tolerance, including 140ms throws.
    let frameIndex=clip.frames.findIndex(entry=>time+1e-7<entry.endMs);
    if(frameIndex<0)frameIndex=clip.frames.length-1;
    return {frame:compiled.frames[clip.frames[frameIndex].frame],frameIndex,clipTimeMs:time};
  }

  function sample(actor,{player=false,compiled,registration,reducedMotion=false,stateAgeMs,landingAgeMs}={}) {
    compiled=compiled||(registration&&compile(registration));
    need(compiled?.frames&&compiled.clips,'compile an authored registration before sampling');
    need(actor&&typeof actor==='object','missing simulation actor');
    need(player?compiled.actor==='mac':actor.kind===compiled.actor,'simulation actor and authored identity differ');
    const animation=actor.animation||{},motion=animation.motion||{};
    let action=animation.action||(player?actor.mode:actor.animAction)||'idle';
    let key='idle',attackType=null,phase=animation.phase||actor.phase||action;
    let progress,ageMs=finite(animation.ageMs,finite(actor.animAgeMs)),terminal=false;
    if(actor.hp<=0||['defeat','defeated'].includes(action)) {
      action='defeat'; key='defeat';
      // The core freezes the player's action age after death. An existing host
      // clock may supply age since player-defeated.atMs; otherwise show down.
      if(player&&!number(stateAgeMs))terminal=true;
      if(number(stateAgeMs))ageMs=Math.max(0,stateAgeMs);
    } else if(action==='hurt'||player&&actor.hurtMs>0||!player&&['stunned','grappled'].includes(actor.phase)) {
      action='hurt';key='hurt';ageMs=finite(actor.hitFeedback?.ageMs,ageMs);
    } else if(player&&actor.attack) {
      attackType=actor.attack.kind;phase=actor.attack.phase;
      need(MOVES.includes(attackType)&&PHASES.includes(phase),'invalid committed Mac move');
      action='strike';key=attackType+'.'+phase;progress=finite(actor.attack.phaseProgress);
    } else if(player&&(actor.grapple||actor.throwMs>0||action==='throw')) {
      action='throw';key='throw';phase=actor.grapple?.phase||phase;
      ageMs=finite(actor.grapple?.elapsedMs,ageMs);
    } else if(!player&&['windup','active','recovery'].includes(actor.phase||phase)) {
      phase=actor.phase||phase;attackType=actor.attackSpec?.attackType||animation.pose;
      need((STYLES[compiled.actor]||[]).includes(attackType),'unknown enemy attack '+attackType);
      const spec=actor.attackSpec,duration=phase==='windup'?spec?.tellMs:phase==='active'?spec?.activeMs:spec?.recoverMs;
      key=attackType+'.'+phase;
      // Use the same committed duration as the delayed contact in the core.
      // Authored active clips hold their tell until that actual contact point.
      progress=number(actor.phaseMs)&&number(duration)&&duration>0?actor.phaseMs/duration:finite(animation.phaseProgress);
    } else if(player&&(actor.guarding||action==='guard')) {
      action='guard';key='guard';
    } else if(player&&(actor.elevation>0||action==='jump')) {
      const velocity=finite(actor.velocityZ,motion.velocityZ),jumpSpeed=B.MacStreetCombat?.constants?.jumpSpeed||560;
      action='jump';key=velocity>0?'jump-rise':'jump-fall';
      // Jump action age is not a flight clock. Velocity follows the actual
      // 560/1500 ballistic simulation, reaching each clip's end at its apex
      // or landing. No independent animation clock can drift from that flight.
      progress=velocity>0?1-velocity/jumpSpeed:-velocity/jumpSpeed;
    } else if(player&&number(landingAgeMs)&&landingAgeMs>=0&&landingAgeMs<compiled.clips.landing?.totalMs) {
      // The wrapper supplies age from the core's actual land receipt. Hurt,
      // defeat, attacks, throws, guarding and a fresh jump remain authoritative.
      action='landing';key='landing';phase='landing';ageMs=landingAgeMs;
    } else if(action==='walk') {
      key='walk';progress=((finite(motion.stridePhase)%1)+1)%1;
    } else {
      action='idle';key='idle';if(reducedMotion)ageMs=0;
    }
    const selected=selectFrame(compiled,key,{progress,ageMs,terminal});
    return Object.freeze({...selected,frameId:selected.frame.id,action,attackType,phase,
      committedKey:key,clipKey:key,facing:finite(actor.facing,1)<0?-1:1,standingHeight:selected.frame.standingHeight,
      phaseProgress:number(progress)?clamp(progress,0,1):null});
  }

  function draw(ctx,art,pose,x,feet,height=260,facing=1,alpha=1) {
    need(pose?.frame,'sample a cel before drawing');
    need([x,feet,height,facing,alpha].every(number)&&height>0,'non-finite draw placement');
    const frame=pose.frame,sheets=art?.images;
    const image=typeof sheets?.get==='function'?sheets.get(frame.sheet)||sheets.get(frame.sourceImage)
      :sheets?.[frame.sheet]||sheets?.[frame.sourceImage];
    const selected=image||(art?.compiled?.sheetIds.length===1?art.image:null);
    need(selected,'missing exact sheet '+frame.sheet+' ('+frame.sourceImage+')');
    if(number(selected.naturalWidth))need(selected.naturalWidth===frame.sheetDimensions.width
      &&selected.naturalHeight===frame.sheetDimensions.height,'decoded sheet dimensions differ '+frame.sheet);
    const scale=height/pose.standingHeight,source=frame.source,pivot=frame.feetPivot;
    ctx.save();
    try {
      ctx.globalAlpha=clamp(alpha,0,1);ctx.translate(x,feet-frame.baselineLift*height/260);ctx.scale(facing<0?-1:1,1);
      ctx.drawImage(selected,source.x,source.y,source.width,source.height,
        -pivot.x*scale,-pivot.y*scale,source.width*scale,source.height*scale);
    } finally { ctx.restore(); }
    return Object.freeze({frameId:frame.id,sheet:frame.sheet,sourceImage:frame.sourceImage,scale,
      baselineLift:frame.baselineLift*height/260,committedKey:pose.committedKey});
  }

  B.MacCombatFrames=Object.freeze({compile,sample,draw,selectFrame,requiredClips,moves:MOVES,styles:STYLES});
})(window.BARCODE=window.BARCODE||{});
