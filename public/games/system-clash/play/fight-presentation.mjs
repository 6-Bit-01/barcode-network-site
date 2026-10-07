const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function easedProgress(time,start,end) {
  const p=clamp((time-start)/(end-start),0,1);
  return p*p*(3-2*p);
}

// A pure time envelope keeps playback, scrubbing and frame exports identical.
// Fits for tall hardware remain in place so an ending never clips its own prop.
export function deletionCamera({time,mechanism,beats,targetX,direction=1,fitted,wheel,reducedMotion=false}) {
  const fit=Boolean(fitted||wheel);
  const pressure=Number.isFinite(beats.pressure)?easedProgress(time,beats.pressure,beats.pressure+220):0;
  const releaseAt=(beats.crush??beats.impact)+400;
  const close=pressure*(1-easedProgress(time,releaseAt,releaseAt+320));
  const wide=mechanism==='waste-chute'||mechanism==='drive';
  const zoom=fitted?.zoom??(wheel?Math.min(.96,440/(wheel.radius*2)):wide?1:mechanism==='crt'?1.06+.21*close:1.02+.04*close);
  const x=fitted?.x??(wheel||wide?640:clamp(targetX-direction*100,470,810));
  const y=fitted?.y??(wheel?wheel.y:mechanism==='crt'?380+50*close:380);
  const enter=reducedMotion?1:easedProgress(time,0,650);
  const leave=fit?1:1-easedProgress(time,beats.present+250,beats.present+850);
  const weight=enter*leave;
  return {zoom:1+(zoom-1)*weight,x:640+(x-640)*weight,y:380+(y-380)*weight};
}

// Interpolate the intact sprite's travel between physics ticks. Native pose
// changes, facing changes and contacts stay discrete; limbs are never blended.
export function interpolateFightViews(previous,current,fraction) {
  const p=clamp(fraction,0,1);
  return current.map((view,index)=>{
    const before=previous?.[index];
    if(!before||before.clip!==view.clip||before.facing!==view.facing||before.opacity!==view.opacity||before.eraseProgress!==view.eraseProgress)return view;
    return {...view,x:before.x+(view.x-before.x)*p,y:(before.y??0)+((view.y??0)-(before.y??0))*p};
  });
}
