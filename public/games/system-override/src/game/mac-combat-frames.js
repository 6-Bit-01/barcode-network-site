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
  const DYNAMIC_CLIPS = Object.freeze(['guard','guard-walk','run','grab-start','grab-hold',
    'pummel.windup','pummel.active','pummel.recovery','carry','carry-walk',
    ...['melee','fire'].flatMap(move=>PHASES.map(phase=>move+'.'+phase))]);
  const DYNAMIC_LOOPS = Object.freeze(['guard','guard-walk','run','grab-hold','carry','carry-walk']);
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const finite = (value, fallback=0) => number(value) ? value : fallback;
  const clamp = (value, low, high) => Math.max(low,Math.min(high,value));
  const fail = message => { throw new Error('Whole-character frames: '+message); };
  const need = (condition,message) => { if (!condition) fail(message); };
  const name = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/.test(value);
  const point = value => value && number(value.x) && number(value.y);
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  const WEAPONS=Object.freeze(['pipe','crowbar','shock-baton','energy-blade','gravity-hammer','scatter-blaster','coil-rifle','plasma-disc']);
  const EMBEDDED_WEAPONS=Object.freeze(['scatter-blaster','coil-rifle','plasma-disc']);
  const EMBEDDED_ACTIONS=Object.freeze(['idle','walk','run','guard','hurt',...PHASES]);
  const EMBEDDED_LOOPS=Object.freeze(['idle','walk','run','guard']);
  const embeddedKey=(kind,action)=>'weapon_'+kind+'.'+action;
  const embeddedKeys=Object.freeze(EMBEDDED_WEAPONS.flatMap(kind=>EMBEDDED_ACTIONS.map(action=>embeddedKey(kind,action))));
  const embeddedLoops=Object.freeze(EMBEDDED_WEAPONS.flatMap(kind=>EMBEDDED_LOOPS.map(action=>embeddedKey(kind,action))));
  const segmentLength=segment=>Math.hypot(segment.to.x-segment.from.x,segment.to.y-segment.from.y);

  function bodyCalibration(value,label) {
    if(value===undefined)return null;
    need(value?.schemaVersion===1&&value.feature==='cap-crown-to-beard-tip','invalid anatomical calibration '+label);
    const segment=value.nativeSegment,reference=value.reference;
    need(point(segment?.from)&&point(segment?.to)&&name(reference?.frame)
      &&point(reference?.segment?.from)&&point(reference?.segment?.to)
      &&number(reference.standingVisibleHeight)&&reference.standingVisibleHeight>0,'invalid calibration landmarks '+label);
    need(segmentLength(segment)>1&&segmentLength(reference.segment)>1,'empty anatomical calibration '+label);
    need(number(value.uniformScale)&&value.uniformScale>=.75&&value.uniformScale<=1.1,'unsafe uniform body scale '+label);
    return Object.freeze({schemaVersion:1,feature:value.feature,uniformScale:value.uniformScale,
      nativeSegment:Object.freeze({from:Object.freeze({...segment.from}),to:Object.freeze({...segment.to})}),
      reference:Object.freeze({frame:reference.frame,standingVisibleHeight:reference.standingVisibleHeight,
        segment:Object.freeze({from:Object.freeze({...reference.segment.from}),to:Object.freeze({...reference.segment.to})})})});
  }

  function polygons(value,source,label) {
    if(value===undefined)return null;
    need(Array.isArray(value)&&value.length<=4,'invalid polygon list '+label);
    return Object.freeze(value.map(polygon=>{
      need(Array.isArray(polygon)&&polygon.length>=3&&polygon.length<=16,'invalid native polygon '+label);
      for(const p of polygon)need(point(p)&&p.x>=0&&p.x<=source.width&&p.y>=0&&p.y<=source.height,
        'native polygon outside crop '+label);
      const area=Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
      need(area>1,'empty native polygon '+label);
      return Object.freeze(polygon.map(p=>Object.freeze({x:p.x,y:p.y})));
    }));
  }

  function attachmentMetadata(item,source,label) {
    const masks=polygons(item.handOcclusion,source,label),bindings=Object.create(null);
    if(item.itemBindings!==undefined) {
      need(item.itemBindings&&typeof item.itemBindings==='object'&&!Array.isArray(item.itemBindings),'invalid item bindings '+label);
      for(const [kind,binding] of Object.entries(item.itemBindings)) {
        need(WEAPONS.includes(kind),'unknown item binding '+label+'/'+kind);
        const grip=binding?.gripAnchor,angle=binding?.weaponAngle;
        need(point(grip)&&grip.x>=0&&grip.x<=source.width&&grip.y>=0&&grip.y<=source.height,'invalid individual item grip '+label+'/'+kind);
        need(number(angle)&&Math.abs(angle)<=Math.PI,'invalid individual item angle '+label+'/'+kind);
        need(['front','behind'].includes(binding.itemLayer),'invalid item layer '+label+'/'+kind);
        const handOcclusion=polygons(binding.handOcclusion,source,label+'/'+kind);
        need(handOcclusion&&handOcclusion.length>0,'missing individual native hand mask '+label+'/'+kind);
        bindings[kind]=Object.freeze({gripAnchor:Object.freeze({...grip}),weaponAngle:angle,itemLayer:binding.itemLayer,handOcclusion});
      }
    }
    return {...(masks?{handOcclusion:masks}:{}),...(Object.keys(bindings).length?{itemBindings:Object.freeze(bindings)}:{})};
  }

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
      const calibration=bodyCalibration(item.bodyCalibration,item.id);
      if(calibration)need(actor==='mac','only Mac supplemental anatomy is calibrated '+item.id);
      sheets[item.id]=Object.freeze({id:item.id,sourceImage:item.sourceImage,sourceSHA256:item.sourceSHA256.toLowerCase(),
        dimensions:Object.freeze({width:dimensions.width,height:dimensions.height}),standingHeight:sheetStandingHeight,
        ...(calibration?{bodyCalibration:calibration}:{}),
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
      if(item.embeddedWeapon!==undefined)need(WEAPONS.includes(item.embeddedWeapon),'unknown embedded weapon '+item.id);
      if(item.shotAnchor!==undefined)need(item.embeddedWeapon&&point(item.shotAnchor)
        &&item.shotAnchor.x>=0&&item.shotAnchor.x<=source.width&&item.shotAnchor.y>=0&&item.shotAnchor.y<=source.height,
        'invalid native embedded shot anchor '+item.id);
      const grip=item.gripAnchor,weaponAngle=item.weaponAngle??0;
      if(grip)need(point(grip)&&grip.x>=0&&grip.x<=source.width&&grip.y>=0&&grip.y<=source.height,
        'invalid held-item grip '+item.id);
      need(number(weaponAngle)&&Math.abs(weaponAngle)<=Math.PI,'invalid held-item angle '+item.id);
      for (const other of Object.values(frames)) if (other.sheet===sheetId) {
        const a=other.source,b=source;
        need(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'overlapping cel crops '+other.id+'/'+item.id);
      }
      frames[item.id]=Object.freeze({id:item.id,sheet:sheetId,sourceImage:sheet.sourceImage,sheetDimensions:sheet.dimensions,
        standingHeight:sheet.standingHeight/(sheet.bodyCalibration?.uniformScale||1),baselineLift,
        ...(item.embeddedWeapon!==undefined?{embeddedWeapon:item.embeddedWeapon}:{}),
        ...(item.shotAnchor!==undefined?{shotAnchor:Object.freeze({x:item.shotAnchor.x,y:item.shotAnchor.y})}:{}),
        source:Object.freeze({...source}),feetPivot:Object.freeze({x:pivot.x,y:pivot.y}),
        ...(grip?{gripAnchor:Object.freeze({x:grip.x,y:grip.y}),weaponAngle}: {}),
        ...attachmentMetadata(item,source,item.id)});
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

  function compileSupplemental(registration,{baseCompiled,complete=true}={}) {
    const compiled=compile(registration);
    need(compiled.actor==='mac','supplemental bank must use the accepted Mac identity');
    if(baseCompiled)need(baseCompiled.actor==='mac'&&baseCompiled.complete,'supplemental bank needs complete accepted base');
    for(const sheet of Object.values(compiled.sheets)) {
      need(!baseCompiled?.sheets[sheet.id],'supplemental sheet shadows accepted base '+sheet.id);
      need(sheet.referenceFrame&&compiled.frames[sheet.referenceFrame]?.sheet===sheet.id,
        'supplemental sheet needs its measured reference cel '+sheet.id);
      if(sheet.bodyCalibration) {
        const calibration=sheet.bodyCalibration,frame=compiled.frames[sheet.referenceFrame],reference=baseCompiled?.frames[calibration.reference.frame];
        const inside=(p,source)=>p.x>=0&&p.x<=source.width&&p.y>=0&&p.y<=source.height;
        need(reference&&reference.standingHeight===calibration.reference.standingVisibleHeight,
          'anatomical scale needs the actual accepted reference cel '+sheet.id);
        need([calibration.nativeSegment.from,calibration.nativeSegment.to].every(p=>inside(p,frame.source))
          &&[calibration.reference.segment.from,calibration.reference.segment.to].every(p=>inside(p,reference.source)),
          'anatomical landmark outside actual native cel '+sheet.id);
        const measured=(segmentLength(calibration.reference.segment)/reference.standingHeight)
          /(segmentLength(calibration.nativeSegment)/sheet.standingHeight);
        need(Math.abs(measured-calibration.uniformScale)<1e-9,'uniform scale differs from native landmarks '+sheet.id);
      }
    }
    for(const key of Object.keys(compiled.clips)) {
      need(DYNAMIC_CLIPS.includes(key)||embeddedKeys.includes(key)||['pickup','carry-throw','guard-impact',...PHASES.map(phase=>'pipe-swing.'+phase)].includes(key),'unknown supplemental action '+key);
      need(compiled.clips[key].loop===(DYNAMIC_LOOPS.includes(key)||embeddedLoops.includes(key)),'incorrect supplemental loop '+key);
      for(const entry of compiled.clips[key].frames)
        need(compiled.frames[entry.frame].baselineLift===0,'grounded supplemental action changes floor baseline '+key);
    }
    if(embeddedKeys.some(key=>compiled.clips[key])) {
      for(const kind of EMBEDDED_WEAPONS)for(const action of EMBEDDED_ACTIONS) {
        const key=embeddedKey(kind,action),clip=compiled.clips[key];
        need(clip,'missing embedded weapon action '+key);
        for(const entry of clip.frames) {
          const frame=compiled.frames[entry.frame];
          need(frame.embeddedWeapon===kind,'embedded weapon identity differs '+key+'/'+frame.id);
          need(!frame.gripAnchor&&!frame.itemBindings&&!frame.handOcclusion,'embedded weapon has detached attachment '+frame.id);
          if(action==='active')need(frame.shotAnchor,'missing native embedded shot anchor '+key+'/'+frame.id);
        }
        if(['walk','run'].includes(action))need(new Set(clip.frames.map(entry=>entry.frame)).size>=2,
          'insufficient embedded weapon movement cels '+key);
        if(action==='active')need(clip.frames.length===1,'embedded weapon origin must use one committed contact cel '+key);
      }
    }
    if(complete) {
      for(const key of DYNAMIC_CLIPS)need(compiled.clips[key],'missing supplemental action '+key);
      for(const [key,count] of [['run',4],['guard-walk',2],['grab-start',2],['carry-walk',2]])
        need(new Set(compiled.clips[key].frames.map(entry=>entry.frame)).size>=count,'insufficient authored cels for '+key);
      for(const move of ['pummel','melee','fire'])
        need(new Set(['windup','active'].map(phase=>compiled.clips[move+'.'+phase].frames[0].frame)).size===2,
          'load and contact must use distinct complete cels '+move);
      const heldKeys=['guard','guard-walk','run','carry','carry-walk',...['melee','fire'].flatMap(move=>PHASES.map(phase=>move+'.'+phase))];
      for(const key of heldKeys)for(const entry of compiled.clips[key].frames)
        need(compiled.frames[entry.frame].gripAnchor,'missing native held-item grip '+key+'/'+entry.frame);
      for(const key of ['pickup','guard-impact','carry-throw'])if(compiled.clips[key])for(const entry of compiled.clips[key].frames)
        need(compiled.frames[entry.frame].gripAnchor,'missing optional action item grip '+key+'/'+entry.frame);
    }
    const baseGripAnchors=Object.create(null);
    for(const [id,item] of Object.entries(registration.baseGripAnchors||{})) {
      const frame=baseCompiled?.frames[id],grip=item?.gripAnchor,angle=item?.weaponAngle??0;
      need(frame,'unknown accepted cel for item grip '+id);
      need(point(grip)&&grip.x>=0&&grip.x<=frame.source.width&&grip.y>=0&&grip.y<=frame.source.height,
        'invalid accepted-cel item grip '+id);
      need(number(angle)&&Math.abs(angle)<=Math.PI,'invalid accepted-cel item angle '+id);
      baseGripAnchors[id]=Object.freeze({gripAnchor:Object.freeze({x:grip.x,y:grip.y}),weaponAngle:angle,
        ...attachmentMetadata(item,frame.source,id)});
    }
    const sheets=Object.create(null);
    const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
    for(const sheet of Object.values(compiled.sheets)) {
      const raw=(registration.sheets||[]).find(item=>item.id===sheet.id),exclusions=[];
      need(raw?.excludedRegions===undefined||Array.isArray(raw.excludedRegions),'invalid source exclusions '+sheet.id);
      for(const item of raw?.excludedRegions||[]) {
        const box=item?.source;
        need(box&&['x','y','width','height'].every(key=>Number.isInteger(box[key]))&&box.x>=0&&box.y>=0
          &&box.width>0&&box.height>0&&box.x+box.width<=sheet.dimensions.width&&box.y+box.height<=sheet.dimensions.height,
          'invalid excluded native region '+sheet.id);
        need(typeof item.reason==='string'&&item.reason.trim().length>0,'source exclusion needs review reason '+sheet.id);
        need(!Object.values(compiled.frames).some(frame=>frame.sheet===sheet.id&&overlaps(box,frame.source)),
          'source exclusion shadows authored cel '+sheet.id);
        need(!exclusions.some(other=>overlaps(box,other.source)),'overlapping excluded source regions '+sheet.id);
        exclusions.push(Object.freeze({source:Object.freeze({...box}),reason:item.reason}));
      }
      sheets[sheet.id]=Object.freeze({...sheet,excludedRegions:Object.freeze(exclusions)});
    }
    return Object.freeze({...compiled,sheets:Object.freeze(sheets),complete,supplemental:true,baseGripAnchors:Object.freeze(baseGripAnchors)});
  }

  function dynamicSelection(actor,action,motion,supplemental,base,guardImpactAgeMs) {
    const attack=actor.attack,phase=attack?.phase||actor.animation?.phase||action;
    const ageMs=finite(actor.animation?.ageMs,finite(actor.animAgeMs));
    let key,fallback,progress,clipAge=ageMs;
    const moving=finite(motion.speed,Math.hypot(finite(actor.vx),finite(actor.laneVelocity)))>.01;
    const weaponKind=attack?.weaponKind||actor.animation?.weaponKind||actor.weapon?.kind;
    const hurt=action==='hurt'||actor.hurtMs>0;
    if(EMBEDDED_WEAPONS.includes(weaponKind)&&!actor.carry&&!actor.grapple) {
      let embeddedAction=hurt?'hurt':['idle','walk','run'].includes(action)?action
        :['guard','guard-creep'].includes(action)?'guard':null;
      if(!hurt&&['weapon-fire','weapon-disc'].includes(action)) {
        need(PHASES.includes(phase),'invalid embedded weapon phase '+phase);embeddedAction=phase;
      }
      const selectedKey=embeddedAction&&embeddedKey(weaponKind,embeddedAction);
      if(selectedKey&&supplemental?.clips[selectedKey])return {compiled:supplemental,key:selectedKey,
        ...(['walk','run'].includes(embeddedAction)?{progress:((finite(motion.stridePhase)%1)+1)%1}
          :PHASES.includes(embeddedAction)?{progress:finite(attack?.phaseProgress,finite(actor.animation?.phaseProgress))}:{}),
        ageMs:hurt?finite(actor.hitFeedback?.ageMs,ageMs):ageMs,action:hurt?'hurt':action,
        phase:hurt?'hurt':phase,attackType:hurt?null:attack?.kind||null};
    }
    if(hurt)return null;
    if(action==='idle'&&['scatter-blaster','coil-rifle'].includes(actor.animation?.weaponKind||actor.weapon?.kind)
      &&supplemental?.clips['fire.recovery']) {
      return {compiled:supplemental,key:'fire.recovery',ageMs:0,action:'idle',phase:'idle',attackType:null};
    }
    if(action==='running-kick'||attack?.kind==='running-kick') {
      need(PHASES.includes(phase),'invalid running kick phase '+phase);
      return {compiled:base,key:'air-kick.'+phase,progress:finite(attack?.phaseProgress,finite(actor.animation?.phaseProgress)),
        ageMs,action:'running-kick',phase,attackType:'running-kick'};
    }
    if(['guard','guard-creep'].includes(action)&&number(guardImpactAgeMs)&&guardImpactAgeMs>=0
      &&guardImpactAgeMs<(supplemental?.clips['guard-impact']?.totalMs||0)) {
      key='guard-impact';fallback='guard';clipAge=guardImpactAgeMs;
    } else if(action==='run') {key='run';fallback='walk';progress=((finite(motion.stridePhase)%1)+1)%1;}
    else if(action==='guard-creep') {key='guard-walk';fallback='guard';progress=((finite(motion.stridePhase)%1)+1)%1;}
    else if(action==='guard') {key='guard';fallback='guard';}
    else if(action==='grab-hold') {
      const holdAge=finite(actor.grapple?.elapsedMs,ageMs),start=supplemental?.clips['grab-start'];
      key=start&&holdAge<start.totalMs?'grab-start':'grab-hold';fallback='throw';clipAge=key==='grab-start'?holdAge:ageMs;
    } else if(action==='grab-pummel') {key='pummel.'+phase;fallback='cross.'+phase;progress=finite(attack?.phaseProgress);}
    else if(action==='carry') {
      const pickup=supplemental?.clips.pickup,carryAge=finite(actor.carry?.elapsedMs,ageMs);
      key=pickup&&carryAge<pickup.totalMs?'pickup':moving?'carry-walk':'carry';fallback=moving?'walk':'throw';
      if(key==='pickup')clipAge=carryAge;
      else if(moving)progress=((finite(motion.stridePhase)%1)+1)%1;
    } else if(action==='carry-throw') {
      key='carry-throw';fallback='throw';clipAge=finite(actor.carry?.releaseAgeMs,ageMs);
    } else if(['weapon-melee','weapon-heavy','weapon-fire','weapon-disc'].includes(action)) {
      need(PHASES.includes(phase),'invalid supplemental attack phase '+phase);
      const firearm=action==='weapon-fire'||action==='weapon-disc';
      key=(firearm?'fire':'melee')+'.'+phase;
      const weaponKind=attack?.weaponKind||actor.animation?.weaponKind||actor.weapon?.kind;
      if(action==='weapon-melee'&&weaponKind==='pipe'&&supplemental?.clips['pipe-swing.'+phase])key='pipe-swing.'+phase;
      fallback=(firearm?'jab':action==='weapon-heavy'?'finisher':'step-strike')+'.'+phase;
      progress=finite(attack?.phaseProgress,finite(actor.animation?.phaseProgress));
    } else return null;
    const selected=supplemental?.clips[key]?supplemental:base,committedKey=selected===supplemental?key:fallback;
    // An absent prototype bank still uses a complete accepted cel. Holding a
    // victim/item must not accidentally play the old immediate release.
    if(selected===base&&committedKey==='throw'&&!['carry-throw'].includes(action))clipAge=0;
    return {compiled:selected,key:committedKey,progress,ageMs:clipAge,action,phase,attackType:attack?.kind||null};
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

  function sample(actor,{player=false,compiled,registration,supplemental,reducedMotion=false,stateAgeMs,landingAgeMs,guardImpactAgeMs}={}) {
    compiled=compiled||(registration&&compile(registration));
    need(compiled?.frames&&compiled.clips,'compile an authored registration before sampling');
    need(actor&&typeof actor==='object','missing simulation actor');
    need(player?compiled.actor==='mac':actor.kind===compiled.actor,'simulation actor and authored identity differ');
    if(supplemental)need(supplemental.supplemental&&supplemental.actor==='mac','compile a supplemental Mac bank before sampling');
    const animation=actor.animation||{},motion=animation.motion||{};
    let action=animation.action||(player?actor.mode:actor.animAction)||'idle';
    let key='idle',attackType=null,phase=animation.phase||actor.phase||action;
    let progress,ageMs=finite(animation.ageMs,finite(actor.animAgeMs)),terminal=false;
    let selectedBank=compiled;
    const settling=player&&['idle','walk'].includes(action)&&!actor.attack&&!actor.hurtMs&&!actor.guarding
      &&!actor.carry&&!actor.grapple&&!(actor.elevation>0)&&number(landingAgeMs)&&landingAgeMs>=0
      &&landingAgeMs<compiled.clips.landing?.totalMs;
    const dynamic=player&&actor.hp>0&&!settling&&!['defeat','defeated'].includes(action)
      ?dynamicSelection(actor,action,motion,supplemental,compiled,guardImpactAgeMs):null;
    if(!player&&actor.launched) {
      // The complete authored fall cel travels on the simulation's ballistic
      // arc. Never rotate a standing sprite or invent a body-part animation.
      action='launched'; key='defeat'; ageMs=0;
    } else if(!player&&actor.knockdownMs>0) {
      action='knockdown'; key='defeat'; terminal=true;
    } else if(actor.hp<=0||['defeat','defeated'].includes(action)) {
      action='defeat'; key='defeat';
      // The core freezes the player's action age after death. An existing host
      // clock may supply age since player-defeated.atMs; otherwise show down.
      if(player&&!number(stateAgeMs))terminal=true;
      if(number(stateAgeMs))ageMs=Math.max(0,stateAgeMs);
    } else if(action==='hurt'||player&&actor.hurtMs>0||!player&&['stunned','grappled'].includes(actor.phase)) {
      action='hurt';key='hurt';ageMs=finite(actor.hitFeedback?.ageMs,ageMs);
      if(player&&dynamic?.action==='hurt') {selectedBank=dynamic.compiled;key=dynamic.key;ageMs=dynamic.ageMs;phase='hurt';}
    } else if(dynamic) {
      selectedBank=dynamic.compiled;key=dynamic.key;progress=dynamic.progress;ageMs=dynamic.ageMs;
      action=dynamic.action;phase=dynamic.phase;attackType=dynamic.attackType;
    } else if(player&&actor.attack) {
      attackType=actor.attack.kind;phase=actor.attack.phase;
      need(MOVES.includes(attackType)&&PHASES.includes(phase),'invalid committed Mac move');
      action='strike';key=attackType+'.'+phase;progress=finite(actor.attack.phaseProgress);
    } else if(player&&(actor.grapple||actor.throwMs>0||action==='throw')) {
      action='throw';key='throw';phase=actor.grapple?.phase||phase;
      ageMs=['hold','pummel','release','recover'].includes(actor.grapple?.phase)
        ?finite(actor.grapple?.releaseAgeMs,ageMs):finite(actor.grapple?.elapsedMs,ageMs);
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
    const selected=selectFrame(selectedBank,key,{progress,ageMs,terminal});
    const attachment=selected.frame.gripAnchor?selected.frame:supplemental?.baseGripAnchors[selected.frame.id];
    const weaponKind=actor.attack?.weaponKind||animation.weaponKind||actor.weapon?.kind;
    const stowed=!!actor.carry||!!actor.grapple;
    const ownsEmbedded=EMBEDDED_WEAPONS.includes(weaponKind)&&supplemental?.clips[embeddedKey(weaponKind,'idle')];
    const stowException=stowed||['jump-rise','jump-fall','landing','defeat','throw','pickup','carry','carry-walk','carry-throw'].includes(key)
      ||['counter.','air-kick.'].some(prefix=>key.startsWith(prefix));
    const weaponStowed=!!(ownsEmbedded&&selected.frame.embeddedWeapon!==weaponKind&&stowException);
    const binding=!stowed&&!weaponStowed&&attachment?.itemBindings?.[weaponKind];
    return Object.freeze({...selected,frameId:selected.frame.id,action,attackType,phase,
      committedKey:key,clipKey:key,facing:finite(actor.facing,1)<0?-1:1,standingHeight:selected.frame.standingHeight,
      supplemental:selectedBank===supplemental,gripAnchor:binding?.gripAnchor||attachment?.gripAnchor||null,
      weaponAngle:binding?.weaponAngle??attachment?.weaponAngle??0,
      handOcclusion:binding?.handOcclusion||attachment?.handOcclusion||null,itemLayer:binding?.itemLayer||'front',
      weaponKind:weaponKind||null,
      weaponStowed,
      shotAnchor:selected.frame.shotAnchor||null,
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
      baselineLift:frame.baselineLift*height/260,committedKey:pose.committedKey,
      pose,gripAnchor:pose.gripAnchor,weaponAngle:pose.weaponAngle});
  }

  B.MacCombatFrames=Object.freeze({compile,compileSupplemental,sample,draw,selectFrame,requiredClips,
    moves:MOVES,styles:STYLES,dynamicClips:DYNAMIC_CLIPS,weapons:WEAPONS,embeddedWeapons:EMBEDDED_WEAPONS});
})(window.BARCODE=window.BARCODE||{});
