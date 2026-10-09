const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function easedProgress(time,start,end) {
  const p=clamp((time-start)/(end-start),0,1);
  return p*p*(3-2*p);
}

// A pure time envelope keeps playback, scrubbing and frame exports identical.
// Reframe with translation only: cinematic pressure cannot resize the world.
export function deletionCamera({time,mechanism,beats,targetX,direction=1,fitted,wheel,reducedMotion=false}) {
  const fit=Boolean(fitted||wheel);
  const pressure=Number.isFinite(beats.pressure)?easedProgress(time,beats.pressure,beats.pressure+220):0;
  const releaseAt=(beats.crush??beats.impact)+400;
  const close=pressure*(1-easedProgress(time,releaseAt,releaseAt+320));
  const wide=mechanism==='waste-chute'||mechanism==='drive';
  const x=fitted?.x??(wheel||wide?640:clamp(targetX-direction*100,470,810));
  const y=fitted?.y??(wheel?wheel.y:mechanism==='crt'?380+50*close:380);
  const enter=reducedMotion?1:easedProgress(time,0,650);
  const leave=fit?1:1-easedProgress(time,beats.present+250,beats.present+850);
  const weight=enter*leave;
  return {zoom:1,x:640+(x-640)*weight,y:380+(y-380)*weight};
}

// Interpolate the intact sprite's travel between physics ticks. Native pose
// changes, facing changes and contacts stay discrete; limbs are never blended.
export function interpolateFightViews(previous,current,fraction) {
  const p=clamp(fraction,0,1);
  return current.map((view,index)=>{
    const before=previous?.[index];
    if(!before||before.stagePortalSerial!==view.stagePortalSerial||before.opacity!==view.opacity||before.eraseProgress!==view.eraseProgress)return view;
    const samePose=before.clip===view.clip&&before.facing===view.facing&&Number.isInteger(view.poseIndex)&&before.poseIndex===view.poseIndex;
    const timing=samePose&&view.elapsed>=before.elapsed?{elapsed:before.elapsed+(view.elapsed-before.elapsed)*p,
      nativeElapsed:(before.nativeElapsed??before.elapsed)+((view.nativeElapsed??view.elapsed)-(before.nativeElapsed??before.elapsed))*p}:{};
    return {...view,...timing,x:before.x+(view.x-before.x)*p,y:(before.y??0)+((view.y??0)-(before.y??0))*p};
  });
}

/** World camera is presentation only: it never supplies combat boundaries. */
export function createFightCamera({worldWidth=2560}={}) {
 return {x:worldWidth/2,zoom:1};
}
export function advanceFightCamera(camera,{fighters=[],worldWidth=2560,dtMs=0,reducedMotion=false,focusIndex=0}={}) {
 // Distance, loading and actions never change a world unit's screen size.
 camera.zoom=1;
 const positions=fighters.map(f=>f.x).filter(Number.isFinite);if(!positions.length)return camera;
 const half=640,worldLeft=Math.min(half,worldWidth/2),worldRight=Math.max(worldLeft,worldWidth-half);
 const focus=Number.isFinite(fighters[focusIndex]?.x)?fighters[focusIndex].x:positions[0];
 // Share the viewport when the pair fits. At wider separation keep the local
 // body visible rather than placing both fighters outside a midpoint view.
 const focusLeft=clamp(focus-440,worldLeft,worldRight),focusRight=clamp(focus+440,worldLeft,worldRight);
 const centre=clamp((Math.min(...positions)+Math.max(...positions))/2,focusLeft,focusRight);
 const factor=Number.isFinite(dtMs)&&dtMs>0?1-Math.exp(-Math.min(dtMs,250)/(reducedMotion?300:220)):0;
 if(Math.abs(centre-camera.x)>38)camera.x+=(centre-camera.x)*factor;
 camera.x=clamp(camera.x,focusLeft,focusRight);return camera;
}

// Facing labels describe authored stance banks, not the direction of a fallen
// body's head. Select the intact native air key by its actual head/legs sites.
export function headFirstThrownFacing(clips,direction,fallback='left',phase='recovery') {
  const poses=(phase==='recovery'?clips?.knockdown?.combatPoses:null)??clips?.thrown?.combatPoses,entry=poses?.entries?.at(phase==='air'?-2:-1);
  if(!entry||!Number.isFinite(direction)||direction===0)return fallback;
  let facing=fallback,best=0;
  for(const bank of ['left','right']) {
    const sites=poses.frames?.[bank]?.[entry.index]?.sites;
    const score=(sites?.head?.x-sites?.legs?.x)*Math.sign(direction);
    if(Number.isFinite(score)&&score>best){best=score;facing=bank;}
  }
  return facing;
}

export function headFirstThrownPose(clips,{direction,facing,elapsed=0,airborne=true}={}) {
  const poses=clips?.thrown?.combatPoses,air=poses?.entries?.at(-2),floor=poses?.entries?.at(-1);
  // Early anticipation keys can still be upright or feet-first. Release holds
  // the existing last air key; the authored floor key starts only after contact.
  const nativeElapsed=airborne&&air&&floor?clamp(elapsed,air.start,Math.max(air.start,floor.start-.001)):elapsed;
  const recovery=clips?.knockdown?.combatPoses,body=recovery?.frames?.[facing]?.[recovery.entries?.at(-1)?.index],groundDirection=Math.sign(body?.sites?.head?.x-body?.sites?.legs?.x)||direction;
  return {clip:'thrown',elapsed:nativeElapsed,facing:headFirstThrownFacing(clips,airborne?direction:groundDirection,facing,airborne?'air':'landed')};
}

// Capture, suspension and machine entry keep their choreography. Only the
// released horizontal flight chooses a head-leading native thrown source.
export function releasedDeletionView(view,clips,definition,origin,time) {
  const b=definition?.beats??{},mechanism=definition?.mechanism;
  const interval=mechanism==='crt'?[b.drive,b.captured]:mechanism==='waste-chute'?[b.load,b.captured]:
    mechanism==='coffin'?[b.entry,b.landed]:mechanism==='wheel'?[b.launch,b.landed]:
    mechanism==='speaker-stack'?[b.fall,b.landed]:null;
  if(!interval||!origin||time<interval[0])return view;
  const floor=['coffin','wheel','speaker-stack'].includes(mechanism),airborne=time<interval[1];
  if(!airborne&&!floor)return view;
  const direction=mechanism==='wheel'?origin.landX-origin.target:origin.target-origin.victim;
  const facing=headFirstThrownFacing(clips,direction||origin.direction,view.facing);
  const pose=airborne||view.clip==='thrown'?headFirstThrownPose(clips,{direction:direction||origin.direction,facing,elapsed:airborne?0:view.elapsed,airborne}):{facing};
  let x=view.x;
  if(floor){
    const clip=airborne?'thrown':view.clip,offset=clips?.[clip]?.endOffsetX??{},p=airborne?clamp((time-interval[0])/(interval[1]-interval[0]),0,1):1;
    x+=((offset[view.facing]??0)-(offset[pose.facing]??0))*p;
  }
  return {...view,...pose,x,airborne, ...(airborne?{frameIndex:undefined,poseIndex:undefined,nativeElapsed:pose.elapsed}: {})};
}
