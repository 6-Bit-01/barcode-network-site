import {poseTransform,resolvePoseAttachments} from './fight-attachments.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const rasterCaches=new WeakMap();
const MAX_CACHED_POSES=32;

function lockedRanges(asset){
 const d=asset.data,ranges=[[0,1],[asset.timeline.duration-1,asset.timeline.duration]];
 if(Number.isFinite(d.contactMs)){const active=asset.timeline.entries.find(e=>d.contactMs>=e.start&&d.contactMs<e.end);ranges.push([Math.max(0,d.contactMs-(d.impactHoldMs??0)),Math.max(d.contactMs,d.activeEndMs??(d.contactMs===0?d.contactMs:active?.end)??d.contactMs)+.5]);}
 for(const t of [d.liftMs,d.releaseMs,d.alignMs,d.channelMs].filter(Number.isFinite))ranges.push([t,t+.5]);
 return ranges;
}
function freeWindows(start,end,ranges){let windows=[[start,end]];for(const[l,r]of ranges)windows=windows.flatMap(([a,b])=>r<=a||l>=b?[[a,b]]:[[a,Math.min(b,l)],[Math.max(a,r),b]].filter(([x,y])=>y-x>1));return windows;}

/** Visual keys are separate from native combat frames and their exact chronology. */
export function compilePoseRenderTimeline(asset){
 const native=asset.timeline.entries,indices=[...new Set(native.map(e=>e.index))],count=asset.data.frames.right.length;
 const poses=indices.map(index=>({kind:'native',index})),wanted=indices.length>1?count+2:indices.length;
 const looping=asset.data.loop??['idle','walk'].includes(asset.name),locks=lockedRanges(asset),candidates=[];
 for(const[eIndex,e]of native.entries()){
  const next=native[eIndex+1]??(looping?native[0]:null);if(!next||next.index===e.index)continue;
  const windows=freeWindows(e.start+(e.end-e.start)*.35,e.end,locks).filter(w=>Math.abs(w[1]-e.end)<1e-8),window=windows.toSorted((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];
  if(window)candidates.push({from:e.index,to:next.index,eIndex,window,count:0});
 }
 // Repeated guard transitions share one definition. Allocate different amounts
 // within that pair instead of counting the same halfway warp as several poses.
 const byPair=new Map();for(const c of candidates){const key=`${c.from}/${c.to}`;if(!byPair.has(key))byPair.set(key,{from:c.from,to:c.to,count:0,windows:[],span:0});const g=byPair.get(key);g.windows.push(c);g.span=Math.max(g.span,c.window[1]-c.window[0]);}
 const groups=[...byPair.values()],additions=Math.max(0,wanted-poses.length);
 for(let n=0;n<additions&&groups.length;n++){const best=groups.toSorted((a,b)=>b.span/(b.count+1)-a.span/(a.count+1))[0];best.count++;}
 const overlays=[];
 for(const g of groups)for(let n=0;n<g.count;n++){const amount=(n+1)/(g.count+1),index=poses.push({kind:'tween',from:g.from,to:g.to,amount})-1;for(const c of g.windows)overlays.push({start:lerp(c.window[0],c.window[1],n/g.count),end:lerp(c.window[0],c.window[1],(n+1)/g.count),pose:index});} const entries=[];
 for(const e of native){const slots=overlays.filter(o=>o.start>=e.start&&o.end<=e.end).toSorted((a,b)=>a.start-b.start);let start=e.start;for(const o of slots){if(o.start>start)entries.push({start,end:o.start,pose:indices.indexOf(e.index)});entries.push(o);start=o.end;}if(start<e.end)entries.push({start,end:e.end,pose:indices.indexOf(e.index)});}
 return {kind:'native-texture-mesh-intermediates',poseCount:poses.length,sourcePoseCount:count,poses,entries,duration:asset.timeline.duration,locks};
}

export function samplePoseTween(asset,view){
 if(Number.isInteger(view.frameIndex)||view.reducedMotion||view.halfMask||view.rotation||view.eraseProgress>0||view.splitBody||view.aftermath?.region)return null;
 const r=asset.renderTimeline;if(!r)return null;
 const looping=asset.data.loop??['idle','walk'].includes(view.clip??asset.name),elapsed=Math.max(0,Number.isFinite(view.elapsed)?view.elapsed:0),time=looping?elapsed%r.duration:Math.min(elapsed,r.duration-.001);
 if(r.locks.some(([a,b])=>time>=a&&time<=b))return null;
 const e=r.entries.find(e=>time>=e.start&&time<e.end),pose=e&&r.poses[e.pose];return pose?.kind==='tween'?{...pose,key:e.pose}:null;
}

function feet(frame){
 const b=frame.opaqueBounds??[0,0,frame.rect[2],frame.rect[3]],middle=(b[0]+b[2])/2,minY=b[3]-(b[3]-b[1])*.2;
 const low=(frame.combatHurt??[]).filter(p=>p[0]==='legs'&&p[4]>=minY),groups=[low.filter(p=>(p[1]+p[3])/2<middle),low.filter(p=>(p[1]+p[3])/2>=middle)];
 return groups.map((bands,i)=>{if(!bands.length)return{x:lerp(b[0],b[2],i?.8:.2),y:b[3]};const bottom=Math.max(...bands.map(p=>p[4])),boot=bands.filter(p=>p[4]>=bottom-(b[3]-b[1])*.06),left=Math.min(...boot.map(p=>p[1])),right=Math.max(...boot.map(p=>p[3]));return{x:(left+right)/2,y:bottom};});
}

function contourDelta(from,to,p,site,a,b,amount,limit){
 const source=(from.combatHurt??[]).filter(r=>r[0]===site),target=(to.combatHurt??[]).filter(r=>r[0]===site);if(!source.length||!target.length)return{x:0,y:0};
 const fb=from.opaqueBounds,tb=to.opaqueBounds,ny=clamp((p.y-fb[1])/Math.max(1,fb[3]-fb[1]),0,1),targetY=lerp(tb[1],tb[3],ny),fraction=clamp((p.x-fb[0])/Math.max(1,fb[2]-fb[0]),0,1),targetX=lerp(tb[0],tb[2],fraction);
 const nearest=(bands,x,y)=>bands.toSorted((l,r)=>Math.abs((l[2]+l[4])/2-y)*4+Math.max(l[1]-x,0,x-l[3])-Math.abs((r[2]+r[4])/2-y)*4-Math.max(r[1]-x,0,x-r[3]))[0];
 const f=nearest(source,p.x,p.y),t=nearest(target,targetX,targetY),across=clamp((p.x-f[1])/Math.max(1,f[3]-f[1]),0,1),original=a.point(p),next=b.point([lerp(t[1],t[3],across),targetY]);return{x:clamp(next.x-original.x,-limit,limit)*amount,y:clamp(next.y-original.y,-limit,limit)*amount};
}
/** A single native texture moves through a bounded mesh; no alpha crossfade. */
export function poseTweenMesh(asset,view,sample,rig,{materializeVertices=true}={}){
 const facing=view.facing??'right',from=asset.data.frames[facing][sample?.from??sample?.index??0],to=asset.data.frames[facing][sample?.to??sample?.from??sample?.index??0],a=poseTransform(asset,from),b=poseTransform(asset,to),s=resolvePoseAttachments(from,asset.name,sample?.from??0,facing,asset.fighterId),t=resolvePoseAttachments(to,asset.name,sample?.to??0,facing,asset.fighterId),bounds=from.opaqueBounds??[0,0,from.rect[2],from.rect[3]],height=(bounds[3]-bounds[1])*a.sy,isWalk=(view.clip??asset.name)==='walk',limit=isWalk?Math.min(6,height*.02):height*.12,amount=sample?.amount??0;
 const delta=(p,q)=>{const x=a.point(p),y=b.point(q);return{x:clamp(y.x-x.x,-limit,limit)*amount,y:clamp(y.y-x.y,-limit,limit)*amount};};
 const head=delta(s.head,t.head),torso=delta(s.torso,t.torso),grip=delta(s.grip,t.grip),sourceFeet=feet(from),targetFeet=feet(to),foot=sourceFeet.map((p,i)=>delta(p,targetFeet[i])),headEnd=Math.min(bounds[1]+(bounds[3]-bounds[1])*.3,s.head.y+(bounds[3]-bounds[1])*.08),hip=lerp(s.torso.y,s.legs.y,.52);
 // Visual-only walk poses stay within six world pixels of native contact geometry.
 const map=point=>{const p=Array.isArray(point)?{x:point[0],y:point[1]}:point,base=a.point(p);if(isWalk&&p.y<=hip)return rig?.map(p)??base;const upper=smooth((p.y-headEnd)/Math.max(1,hip-headEnd));let dx=lerp(head.x,torso.x,upper),dy=lerp(head.y,torso.y,upper);if(p.y>hip){const lower=smooth((p.y-hip)/Math.max(1,bounds[3]-hip)),side=smooth((p.x-sourceFeet[0].x)/Math.max(1,sourceFeet[1].x-sourceFeet[0].x));dx=lerp(isWalk?0:torso.x,lerp(foot[0].x,foot[1].x,side),lower);dy=lerp(isWalk?0:torso.y,lerp(foot[0].y,foot[1].y,side),lower);}else if(p.y>headEnd){const distance=Math.hypot((p.x-s.grip.x)*a.sx,(p.y-s.grip.y)*a.sy),weight=Math.max(0,1-distance/Math.max(1,height*.2))*.45;dx=lerp(dx,grip.x,weight);dy=lerp(dy,grip.y,weight);}if(p.y>hip){const knee=smooth((p.y-hip)/Math.max(1,(bounds[3]-hip)*.35))*(1-smooth((p.y-lerp(hip,bounds[3],.82))/Math.max(1,(bounds[3]-hip)*.18))),contour=contourDelta(from,to,p,'legs',a,b,amount,height*.02);dx+=contour.x*knee*.5;dy+=contour.y*knee*.5;}else if(p.y>headEnd&&Math.abs(p.x-s.torso.x)>(bounds[2]-bounds[0])*.12){const contour=contourDelta(from,to,p,'torso',a,b,amount,height*.02);dx+=contour.x*.4;dy+=contour.y*.4;}if(rig){const r=rig.map(p);dx+=r.x-base.x;dy+=r.y-base.y;}if(isWalk&&!rig){const distance=Math.hypot(dx,dy);if(distance>limit){dx*=limit/distance;dy*=limit/distance;}}return{x:base.x+dx,y:base.y+dy};};
 const vertices=[];if(materializeVertices)for(let y=0;y<=12;y++)for(let x=0;x<=10;x++){const source={x:from.rect[2]*x/10,y:from.rect[3]*y/12};vertices.push({source,destination:map(source)});}return{frame:from,map,vertices,columns:10,rows:12,transform:a};
}

function makeCanvas(template,w,h,factory){if(factory)return factory(w,h);if(typeof globalThis.OffscreenCanvas==='function')return new globalThis.OffscreenCanvas(w,h);if(template?.ownerDocument?.createElement){const c=template.ownerDocument.createElement('canvas');c.width=w;c.height=h;return c;}try{const c=new template.constructor(w,h);if(c?.getContext)return c;}catch{}return null;}
function triangle(ctx,image,rect,p,q){
 const x1=p[1].x-p[0].x,y1=p[1].y-p[0].y,x2=p[2].x-p[0].x,y2=p[2].y-p[0].y,det=x1*y2-x2*y1;if(Math.abs(det)<1e-8)return;
 const u1=q[1].x-q[0].x,v1=q[1].y-q[0].y,u2=q[2].x-q[0].x,v2=q[2].y-q[0].y,a=(u1*y2-u2*y1)/det,b=(v1*y2-v2*y1)/det,c=(u2*x1-u1*x2)/det,d=(v2*x1-v1*x2)/det,e=q[0].x-a*p[0].x-c*p[0].y,f=q[0].y-b*p[0].x-d*p[0].y;
 const center={x:(q[0].x+q[1].x+q[2].x)/3,y:(q[0].y+q[1].y+q[2].y)/3},edge=q.map(v=>{const dx=v.x-center.x,dy=v.y-center.y,l=Math.max(1,Math.hypot(dx,dy));return{x:v.x+dx/l*.45,y:v.y+dy/l*.45};});
 ctx.save();ctx.beginPath();ctx.moveTo(edge[0].x,edge[0].y);ctx.lineTo(edge[1].x,edge[1].y);ctx.lineTo(edge[2].x,edge[2].y);ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,e,f);ctx.drawImage(image,...rect,0,0,rect[2],rect[3]);ctx.restore();
}

/** map() uses cropped source pixels and returns actor-local world coordinates. */
export function drawPoseMesh(ctx,asset,frame,map,{x=0,y=0,canvasFactory,cacheKey,columns=10,rows=12,maxCachedPoses=MAX_CACHED_POSES}={}){
 const transform=poseTransform(asset,frame);let cache=rasterCaches.get(asset);if(!cache){cache=new Map();rasterCaches.set(asset,cache);}let raster=cacheKey&&cache.get(cacheKey);
 if(!raster){const vertices=[];for(let yy=0;yy<=rows;yy++)for(let xx=0;xx<=columns;xx++){const p={x:frame.rect[2]*xx/columns,y:frame.rect[3]*yy/rows},q=map(p);if(!Number.isFinite(q.x)||!Number.isFinite(q.y))return false;vertices.push({p,q:{x:(q.x-transform.tx)/transform.sx,y:(q.y-transform.ty)/transform.sy}});}const left=Math.floor(Math.min(...vertices.map(v=>v.q.x)))-2,top=Math.floor(Math.min(...vertices.map(v=>v.q.y)))-2,w=Math.ceil(Math.max(...vertices.map(v=>v.q.x)))-left+2,h=Math.ceil(Math.max(...vertices.map(v=>v.q.y)))-top+2;if(w>2048||h>2048||w<1||h<1)return false;const canvas=makeCanvas(ctx.canvas,w,h,canvasFactory),out=canvas?.getContext?.('2d');if(!out||typeof out.transform!=='function')return false;out.imageSmoothingEnabled=true;out.imageSmoothingQuality='high';for(let yy=0;yy<rows;yy++)for(let xx=0;xx<columns;xx++){const i=yy*(columns+1)+xx;for(const indices of [[i,i+1,i+columns+1],[i+1,i+columns+2,i+columns+1]]){const v=indices.map(k=>vertices[k]);triangle(out,asset.image,frame.rect,v.map(z=>z.p),v.map(z=>({x:z.q.x-left,y:z.q.y-top})));}}raster={canvas,left,top,w,h};if(cacheKey){cache.set(cacheKey,raster);if(cache.size>maxCachedPoses)cache.delete(cache.keys().next().value);}}
 ctx.drawImage(raster.canvas,x+transform.tx+raster.left*transform.sx,y+transform.ty+raster.top*transform.sy,raster.w*transform.sx,raster.h*transform.sy);return true;
}
export function poseTweenCacheSize(asset){return rasterCaches.get(asset)?.size??0;}
export function clearPoseTweenCache(asset){if(asset)rasterCaches.delete(asset);}

export function drawPoseTween(ctx,asset,view,{frame,transform,dx,dy,rig,canvasFactory}={}){
 if(Number.isInteger(view.frameIndex)||view.halfMask||view.rotation||view.eraseProgress>0||view.splitBody||view.aftermath?.region)return false;
 // Walking articulation communicates authoritative foot contact in every preference.
 if(view.reducedMotion&&!(rig&&view.clip==='walk'))return false;
 const sample=samplePoseTween(asset,view);if(!sample&&!rig)return false;
 const facing=view.facing??'right',index=asset.data.frames[facing].indexOf(frame),mesh=poseTweenMesh(asset,view,sample??{index,from:index,to:index,amount:0},rig,{materializeVertices:false}),tr=transform??mesh.transform,key=`${facing}/${rig?'native'+index:sample?.key??'native'+index}/${rig?.cacheKey??'none'}`;
 const map=rig&&view.clip==='walk'?rig.map:mesh.map;
 return drawPoseMesh(ctx,asset,mesh.frame,map,{x:(dx??tr.tx)-tr.tx,y:(dy??tr.ty)-tr.ty,canvasFactory,cacheKey:key,maxCachedPoses:rig?64:MAX_CACHED_POSES});
}
