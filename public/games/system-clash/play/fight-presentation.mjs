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
    if(!before||before.opacity!==view.opacity||before.eraseProgress!==view.eraseProgress)return view;
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
