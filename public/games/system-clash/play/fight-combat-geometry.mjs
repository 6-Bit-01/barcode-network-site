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

// Measured opaque lower-leg bands from each independent native idle facing.
// Values are floor-relative x / fighter height, in three thigh-to-floor bands.
// The two legs stay separate; tails, tools and raised attacking limbs add no bulk.
const LEG_BANDS={
 '6-bit':{right:[[[-.231,-.082],[.016,.161]],[[-.249,-.142],[.076,.173]],[[-.260,-.179],[.036,.238]]],left:[[[-.163,-.054],[.080,.227]],[[-.177,-.082],[.140,.253]],[[-.245,-.039],[.181,.264]]]},
 '9-bit':{right:[[[-.359,-.015],[-.023,.279]],[[-.353,-.125],[.133,.287]],[[-.383,-.245],[.083,.383]]],left:[[[-.283,.023],[.016,.366]],[[-.299,-.030],[.118,.368]],[[-.395,-.175],[.256,.399]]]},
 'cache-back':{right:[[[-.272,-.045],[.048,.268]],[[-.315,-.125],[.138,.278]],[[-.358,-.235],[.085,.358]]],left:[[[-.258,-.062],[.052,.272]],[[-.258,-.132],[.132,.308]],[[-.349,-.142],[.228,.358]]]},
 cliff:{right:[[[-.232,-.035],[.055,.232]],[[-.276,-.119],[.132,.229]],[[-.306,-.182],[.132,.292]]],left:[[[-.249,-.048],[.048,.259]],[[-.263,-.149],[.145,.306]],[[-.333,-.162],[.209,.333]]]},
 'dj-floppydisc':{right:[[[-.262,-.091],[.067,.221]],[[-.302,-.161],[.128,.248]],[[-.329,-.208],[.074,.329]]],left:[[[-.218,-.074],[.081,.262]],[[-.242,-.124],[.154,.305]],[[-.326,-.067],[.215,.329]]]},
 'mac-modem':{right:[[[-.265,-.099],[.095,.219]],[[-.297,-.170],[.127,.237]],[[-.329,-.226],[.067,.326]]],left:[[[-.231,-.097],[.094,.274]],[[-.242,-.136],[.175,.309]],[[-.334,-.073],[.239,.334]]]},
 'mr-nice-guy':{right:[[[-.256,.001],[-.004,.268]],[[-.283,-.118],[.141,.279]],[[-.306,-.187],[.175,.333]]],left:[[[-.283,.008],[.002,.276]],[[-.299,-.152],[.125,.310]],[[-.364,-.104],[.214,.337]]]},
 'ms-mayhem':{right:[[[-.178,-.012],[-.017,.167]],[[-.260,-.088],[.078,.209]],[[-.298,-.195],[.143,.295]]],left:[[[-.191,.015],[.009,.184]],[[-.229,-.095],[.091,.271]],[[-.309,-.075],[.205,.309]]]},
 stolz:{right:[[[-.214,-.042],[.101,.219]],[[-.258,-.123],[.121,.216]],[[-.272,-.170],[.066,.292]]],left:[[[-.242,-.075],[.006,.203]],[[-.235,-.143],[.091,.260]],[[-.314,-.078],[.175,.281]]]},
 'kaveman-brown':{right:[[[-.281,-.011],[-.017,.264]],[[-.316,-.071],[.047,.267]],[[-.350,-.236],[.086,.350]]],left:[[[-.267,-.009],[.029,.302]],[[-.288,-.164],[.188,.336]],[[-.367,-.184],[.260,.367]]]},
 dr3wbaby:{right:[[[-.199,-.010],[.039,.231]],[[-.260,-.083],[.128,.231]],[[-.292,-.161],[.062,.278]]],left:[[[-.234,-.058],[.032,.225]],[[-.254,-.141],[.112,.279]],[[-.324,-.080],[.177,.327]]]},
 'ash-flowers':{right:[[[-.248,-.019],[.039,.251]],[[-.313,-.111],[.145,.258]],[[-.344,-.217],[.156,.344]]],left:[[[-.236,.003],[.055,.284]],[[-.267,-.123],[.150,.342]],[[-.362,-.073],[.239,.362]]]},
 wittyf0x:{right:[[[-.343,0],[-.005,.316]],[[-.291,-.056],[.180,.283]],[[-.329,-.213],[.213,.390]]],left:[[[-.341,-.006],[-.012,.349]],[[-.320,-.200],[.044,.354]],[[-.428,-.137],[.200,.316]]]},
 doofnoobler:{right:[[[-.118,.027],[-.011,.139]],[[-.133,-.002],[.028,.161]],[[-.135,-.004],[.032,.163]]],left:[[[-.150,.003],[-.014,.134]],[[-.175,-.044],[.015,.155]],[[-.178,-.046],[.026,.157]]]},
 lyra:{right:[[[-.191,-.023],[.140,.252]],[[-.266,-.058],[.143,.234]],[[-.298,-.198],[.078,.302]]],left:[[[-.266,-.150],[.018,.200]],[[-.247,-.150],[.058,.272]],[[-.332,-.178],[.203,.297]]]},
 'papa-oak':{right:[[[-.325,-.076],[.163,.395]],[[-.377,-.122],[.174,.483]],[[-.400,-.096],[.166,.490]]],left:[[[-.338,-.112],[.127,.361]],[[-.429,-.135],[.171,.426]],[[-.448,-.121],[.148,.447]]]},
};

/** Defensive stance legs follow the native pelvis/floor without adding attack reach. */
export function nativeBodyLegs(pose,reference,{id,facing,height}={}) {
 const torso=pose?.sites?.torso,legs=pose?.sites?.legs,bounds=pose?.bounds;
 const bands=LEG_BANDS[id]?.[facing];
 if(!bands||!validPoint(torso)||!validPoint(legs)||!bounds||!Number.isFinite(height)||height<=0)return [];
 const top=legs.y-(legs.y-torso.y)*.25,bottom=bounds.bottom;
 if(!Number.isFinite(top)||!Number.isFinite(bottom)||bottom<=top)return [];
 const drift=torso.x-(reference?.sites?.torso?.x??torso.x);
 return bands.flatMap((spans,index)=>{
  const shift=drift*(1-(index+.5)/3),bandTop=Math.max(bounds.top,top+(bottom-top)*index/3),bandBottom=top+(bottom-top)*(index+1)/3;
  return spans.map(([left,right])=>({site:'legs',left:Math.max(bounds.left,left*height+shift),right:Math.min(bounds.right,right*height+shift),top:bandTop,bottom:bandBottom}));
 }).filter(region=>region.right>region.left&&region.bottom>region.top);
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
