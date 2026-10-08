const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// Median alpha-connected trunk widths, sampled10-35% below the native torso
// toward the pelvis in each original idle facing. Arms, tails and spread feet
// are excluded. Ratios are half-width / torso-to-leg vertical distance.
const CORE_RATIOS={
 '6-bit':{right:.268,left:.261},'9-bit':{right:.598,left:.672},
 'cache-back':{right:.254,left:.257},cliff:{right:.668,left:.672},
 'dj-floppydisc':{right:.274,left:.262},'mac-modem':{right:.321,left:.293},
 'mr-nice-guy':{right:.423,left:.456},'ms-mayhem':{right:.466,left:.475},
 stolz:{right:.318,left:.379},'kaveman-brown':{right:.689,left:.793},
 dr3wbaby:{right:.537,left:.556},'ash-flowers':{right:.423,left:.351},
 wittyf0x:{right:.372,left:.408},doofnoobler:{right:1.278,left:1.331},
 lyra:{right:.459,left:.457},'papa-oak':{right:.796,left:.794},
};
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

/** Physical chest/pelvis blocker in the same floor-relative space as native poses. */
export function nativeBodyCore(pose,reference,{id,facing,height}={}) {
 const torso=pose?.sites?.torso,legs=pose?.sites?.legs;
 if(!validPoint(torso)||!validPoint(legs))return null;
 const ratio=CORE_RATIOS[id]?.[facing];
 if(!ratio) {
  const region=pose.hurt?.find(r=>r.site==='torso');
  return region?{left:region.left,right:region.right,top:region.top,bottom:region.bottom}:null;
 }
 const refTorso=reference?.sites?.torso??torso,refLegs=reference?.sites?.legs??legs;
 const radius=clamp(Math.abs(refLegs.y-refTorso.y)*ratio,Math.max(5,height*.025),height*.4);
 const vx=legs.x-torso.x,vy=legs.y-torso.y,length=Math.max(1,Math.hypot(vx,vy));
 const a={x:torso.x-vx*.12,y:torso.y-vy*.12},b={x:torso.x+vx*.4,y:torso.y+vy*.4};
 const padX=Math.abs(vy/length)*radius,padY=Math.abs(vx/length)*radius;
 const bounds=pose.bounds??{left:-Infinity,right:Infinity,top:-Infinity,bottom:Infinity};
 const core={left:Math.max(bounds.left,Math.min(a.x,b.x)-padX),right:Math.min(bounds.right,Math.max(a.x,b.x)+padX),
  top:Math.max(bounds.top,Math.min(a.y,b.y)-padY),bottom:Math.min(bounds.bottom,Math.max(a.y,b.y)+padY)};
 return core.right>core.left&&core.bottom>core.top?core:null;
}

/** A native palm must actually touch the body; rectangle corners do not add reach. */
export function gripContact(grip,body,radius) {
 if(!validPoint(grip)||!body||!Number.isFinite(radius)||radius<0)return null;
 const x=clamp(grip.x,body.left,body.right),y=clamp(grip.y,body.top,body.bottom);
 return (grip.x-x)**2+(grip.y-y)**2<=radius*radius?{x,y,site:body.site}:null;
}

/** A forearm/shin capsule against a body box, including round corner distance. */
export function limbContact(start,end,body,radius) {
 if(!validPoint(start)||!validPoint(end)||!body||!Number.isFinite(radius)||radius<0)return null;
 const dx=end.x-start.x,dy=end.y-start.y,length2=dx*dx+dy*dy;
 let first=Infinity;
 const strip=(left,right,top,bottom)=>{
  let enter=0,leave=1;
  for(const [origin,delta,min,max]of [[start.x,dx,left,right],[start.y,dy,top,bottom]]) {
   if(Math.abs(delta)<1e-10){if(origin<min||origin>max)return;continue;}
   const a=(min-origin)/delta,b=(max-origin)/delta;
   enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
   if(enter>leave)return;
  }
  first=Math.min(first,enter);
 };
 // The exact expanded shape is two side strips and four round corners.
 strip(body.left-radius,body.right+radius,body.top,body.bottom);
 strip(body.left,body.right,body.top-radius,body.bottom+radius);
 for(const x of [body.left,body.right])for(const y of [body.top,body.bottom]) {
  const ox=start.x-x,oy=start.y-y,c=ox*ox+oy*oy-radius*radius;
  if(c<=0){first=0;continue;}
  if(!length2)continue;
  const b=ox*dx+oy*dy,discriminant=b*b-length2*c;
  if(discriminant<0)continue;
  const enter=(-b-Math.sqrt(discriminant))/length2;
  if(enter>=0&&enter<=1)first=Math.min(first,enter);
 }
 return Number.isFinite(first)?{x:clamp(start.x+dx*first,body.left,body.right),
  y:clamp(start.y+dy*first,body.top,body.bottom),site:body.site}:null;
}
