import {poseTransform,resolvePoseAttachments} from './fight-attachments.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>t*t*(3-2*t);
// Measured from the existing whole-body walk poses. The upper body remains rigid.
const HIP_RATIO=Object.freeze({'papa-oak':.63,doofnoobler:.69,lyra:.55,'mutilator':.60,'ms-mayhem':.55,'ash-flowers':.57,'9-bit':.58,'6-bit':.57,'mr-nice-guy':.59,'lost-marbles':.57,'kaveman-brown':.62});
const footCache=new WeakMap();
function footGeometry(asset,frame,facing){
  if(footCache.has(frame))return footCache.get(frame);
  const bounds=frame.opaqueBounds??[0,0,frame.rect[2],frame.rect[3]],height=bounds[3]-bounds[1];
  const index=asset.data.frames[facing].indexOf(frame),sites=resolvePoseAttachments(frame,'walk',index,facing,asset.fighterId),split=sites.torso.x;
  const regions=(frame.combatHurt??[]).filter(r=>r[0]==='legs'&&r.length===5&&r.slice(1).every(Number.isFinite));
  const feet=[-1,1].map(side=>{
    const bands=regions.filter(r=>((r[1]+r[3])*.5<split?-1:1)===side);if(!bands.length)return null;
    const bottom=Math.max(...bands.map(r=>r[4])),edge=bottom-height*.08;
    const toe=bands.filter(r=>r[4]>edge),area=toe.reduce((n,r)=>n+(r[3]-r[1])*(r[4]-Math.max(r[2],edge)),0);
    if(area<=0)return null;
    const x=toe.reduce((n,r)=>n+(r[1]+r[3])*.5*(r[3]-r[1])*(r[4]-Math.max(r[2],edge)),0)/area;
    return {side,x,y:bottom,left:Math.min(...toe.map(r=>r[1])),right:Math.max(...toe.map(r=>r[3]))};
  });
  const result=feet.every(Boolean)?{feet,split,height,hip:bounds[1]+height*(HIP_RATIO[asset.fighterId]??.60)}:null;
  footCache.set(frame,result);return result;
}
/** Serializable source geometry is shared by drawing and authoritative hurt contacts. */
export function compileWalkGeometry(asset,frame,facing){
  if(['bnl','bnl-01'].includes(asset.fighterId)||!frame)return null;
  const native=footGeometry(asset,frame,facing);if(!native)return null;
  const transform=poseTransform(asset,frame);
  return {...native,transform:{sx:transform.sx,sy:transform.sy,tx:transform.tx,ty:transform.ty}};
}
function rigFromGeometry(native,elapsed,duration,facing){
  const transform=native.transform,point=p=>({x:p.x*transform.sx+transform.tx,y:p.y*transform.sy+transform.ty});
  const phase=Math.floor((elapsed%duration)/duration*24)/24,strength=Math.min(8,Math.floor(elapsed/12.5))/8;
  const direction=facing==='left'?-1:1,worldHeight=native.height*transform.sy;
  const stride=Math.min(24,worldHeight*.05),lift=Math.min(25,worldHeight*.06);
  const feet=native.feet.map((foot,i)=>{const angle=(phase+i*.5)*Math.PI*2,base=point(foot);
    return {...foot,base,dx:-Math.cos(angle)*stride*direction*strength,dy:(-Math.max(0,Math.sin(angle))*lift-base.y)*strength};});
  const map=p=>{const base=point(p);if(p.y<=native.hip)return base;
    const foot=feet[p.x<native.split?0:1],t=clamp((p.y-native.hip)/(foot.y-native.hip),0,1),weight=smooth(t);
    const axis=native.split+(foot.x-native.split)*t,radius=Math.max(worldHeight*.045/transform.sx,(foot.right-foot.left)*1.25);
    const distance=Math.abs(p.x-axis),coverage=smooth(clamp((radius-distance)/(radius*.20),0,1));
    return {x:base.x+foot.dx*weight*coverage,y:base.y+foot.dy*weight*coverage};
  };
  return {map,feet,cacheKey:`gait:${phase}:${strength}`,phase,strength};
}
/** Source texture, face, torso, body height and facing are retained. */
export function walkRig(asset,view,frame){
  if(view.clip!=='walk'||Number.isInteger(view.frameIndex)||!frame)return null;
  const native=compileWalkGeometry(asset,frame,view.facing);if(!native)return null;
  return rigFromGeometry(native,Math.max(0,view.elapsed??0),Math.max(1,asset.timeline.duration),view.facing);
}
// Tapered coverage can move a band's interior farther than its four corners.
// Sample its leg axis, coverage shoulders, split and horizontal extrema too.
function mappedLegBand(region,geometry,rig){
  const tr=geometry.transform,x0=(region.left-tr.tx)/tr.sx,x1=(region.right-tr.tx)/tr.sx,y0=(region.top-tr.ty)/tr.sy,y1=(region.bottom-tr.ty)/tr.sy;
  const corners=[{x:x0,y:y0},{x:x1,y:y0},{x:x0,y:y1},{x:x1,y:y1}],points=corners.map(rig.map);
  if(y1<=geometry.hip)return {...region,left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
  const radius=foot=>Math.max(geometry.height*tr.sy*.045/tr.sx,(foot.right-foot.left)*1.25),axis=(foot,t)=>geometry.split+(foot.x-geometry.split)*t;
  const covered=p=>{if(p.y<=geometry.hip)return true;const foot=rig.feet[p.x<geometry.split?0:1],t=clamp((p.y-geometry.hip)/(foot.y-geometry.hip),0,1);return Math.abs(p.x-axis(foot,t))<=radius(foot)*.8;};
  // A band entirely within one full-coverage leg has monotonic rigid endpoints.
  const full=(x1<geometry.split||x0>=geometry.split)&&corners.every(covered);
  if(!full){
    const ys=new Set([y0,y1,(y0+y1)*.5,y0+(y1-y0)*.25,y0+(y1-y0)*.75]);
    for(const foot of rig.feet)for(const t of [0,.25,.5,.75,1]){const y=geometry.hip+(foot.y-geometry.hip)*t;if(y>=y0&&y<=y1)ys.add(y);}
    for(const y of ys){
      const xs=new Set([x0,x1,(x0+x1)*.5,x0+(x1-x0)*.25,x0+(x1-x0)*.75]);
      for(const x of [geometry.split-1e-7,geometry.split,geometry.split+1e-7])if(x>=x0&&x<=x1)xs.add(x);
      for(const foot of rig.feet){
        const t=clamp((y-geometry.hip)/(foot.y-geometry.hip),0,1),center=axis(foot,t),r=radius(foot),fractions=[0,.8,.9,1],shift=foot.dx*smooth(t),ratio=tr.sx*r*.2/(6*Math.abs(shift));
        if(ratio<=.25){const d=Math.sqrt(1-4*ratio);for(const c of [(1-d)/2,(1+d)/2])fractions.push(1-.2*c);}
        for(const side of [-1,1])for(const fraction of fractions){const x=center+side*r*fraction;if(x>=x0&&x<=x1)xs.add(x);}
      }
      for(const x of xs)points.push(rig.map({x,y}));
    }
  }
  // Subpixel allowance encloses curvature between probes without restoring an old ankle box.
  const pad=full?0:.5;
  return {...region,left:Math.min(...points.map(p=>p.x))-pad,right:Math.max(...points.map(p=>p.x))+pad,top:Math.min(...points.map(p=>p.y))-pad,bottom:Math.max(...points.map(p=>p.y))+pad};
}
const combatCache=new WeakMap();
export function warpWalkCombatPose(pose,elapsed,duration,facing){
  if(!pose?.walkGeometry)return pose;
  const geometry=pose.walkGeometry,rig=rigFromGeometry(geometry,Math.max(0,elapsed),Math.max(1,duration),facing);
  let cache=combatCache.get(pose);if(!cache){cache=new Map();combatCache.set(pose,cache);}const key=`${facing}:${rig.cacheKey}`;if(cache.has(key))return cache.get(key);
  const hurt=(pose.hurt??[]).map(region=>region.site==='legs'?mappedLegBand(region,geometry,rig):region);
  const result={...pose,hurt,bounds:hurt.length?{left:Math.min(pose.bounds.left,...hurt.map(r=>r.left)),right:Math.max(pose.bounds.right,...hurt.map(r=>r.right)),top:pose.bounds.top,bottom:Math.max(...hurt.map(r=>r.bottom))}:pose.bounds};
  cache.set(key,result);if(cache.size>32)cache.delete(cache.keys().next().value);return result;
}