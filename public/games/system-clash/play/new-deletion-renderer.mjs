import {drawSignalDeletion,drawNativeSignalFragments} from './bnl-fighter.mjs';
import {cleaverPiecePlan,drawNativeCleaverPieces} from './cleaver-native-pieces.mjs';
import {drawRemainsVictim,marbleVictimState} from './fight-remains.mjs';
import {litterBasinPose,newDeletionPositions,newDeletionPose,hangingVictimPose,butcherVictimState} from './new-deletion-library.mjs';
import {deletionDefinition,deletionPropState,deletionPose} from './deletion-library.mjs';
import {poseFrameIndex,poseScale,poseTransform} from './fight-attachments.mjs';
import {easedProgress} from './fight-presentation.mjs';
const FLOOR=620,TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Measured centers of both bark fists/palms in each unchanged native rip key.
// These are independent facing poses; the source is never reflected or warped.
const RIP_HANDS={right:{3:[[27,110],[391,109]],4:[[29,111],[401,108]],5:[[50,161],[383,121]]},left:{3:[[28,100],[397,89]],4:[[25,105],[384,101]],5:[[32,114],[379,162]]}};
function ripHandPoints(view,art){const asset=art?.clips?.[view.clip];if(!asset)return null;const index=poseFrameIndex(asset,view),frame=asset.data.frames[view.facing]?.[index];if(!frame)return null;const native=frame.attachments?.ripHands??RIP_HANDS[view.facing]?.[index];if(!Array.isArray(native)||native.length!==2)return null;const transform=poseTransform(asset,frame);return native.map(value=>{const p=transform.point(value);return {x:view.x+p.x,y:FLOOR+(view.y??0)+p.y};});}
function frozenRipSource(victim,source,origin){
 const capture=origin?.ripPose??hangingVictimPose(source.clips,{clip:'delete-suspended',elapsed:0}),clip=capture.clip;
 const view={...victim,clip,elapsed:capture.elapsed??0,y:0,rotation:0};
 const asset=source.clips[clip],frame=asset?.data.frames[view.facing]?.[poseFrameIndex(asset,view)];
 if(!frame)return null;return {view,asset,frame};
}
function splitPieces(match,hero,victim,art,point,definition){
 const b=definition.beats,t=match.deletionElapsed,source=art[1-match.winner],frozen=frozenRipSource(victim,source,match._deletionOrigin);if(!frozen)return null;
  const {view,asset,frame}=frozen,torso=point(view,source,'torso'),transform=poseTransform(asset,frame),scale=transform.sy,nativeTorso=transform.inverse({x:torso.x-view.x,y:torso.y-FLOOR}),cutX=frame.attachments?.ripCut?.[0]??nativeTorso.x,cutY=frame.attachments?.ripCut?.[1]??nativeTorso.y,localCut=transform.point([cutX,cutY]),cut={x:view.x+localCut.x,y:FLOOR+(view.y??0)+localCut.y},bounds=frame.opaqueBounds??[0,0,frame.rect[2],frame.rect[3]];
 const drop=clamp((t-b.separated)/(b.settled-b.separated),0,1),released={...hero,...deletionPose('attacker',b.separated,match.fighters[match.winner].id,match.fighters[match.winner]._clips,match.fighters[match.winner].height)},hands=ripHandPoints(drop===0?hero:released,art[match.winner]);if(!hands)return null;
 return [-1,1].map((halfMask,i)=>{
   const rotation=halfMask*Math.PI/2*drop,finalRotation=halfMask*Math.PI/2,left=halfMask<0?bounds[0]:cutX,right=halfMask<0?cutX:bounds[2],corners=[[left,bounds[1]],[right,bounds[1]],[left,bounds[3]],[right,bounds[3]]],maxY=Math.max(...corners.map(([x,y])=>(x-cutX)*transform.sx*Math.sin(finalRotation)+(y-cutY)*transform.sy*Math.cos(finalRotation))),floorCutY=FLOOR-maxY;
  const cutWorldX=hands[i].x+(match._deletionOrigin.target+halfMask*180-hands[i].x)*drop,cutWorldY=hands[i].y+(floorCutY-hands[i].y)*drop*drop-Math.max(90,(bounds[3]-bounds[1])*scale*.55)*drop*(1-drop);
  return {clip:view.clip,elapsed:view.elapsed,facing:view.facing,halfMask,cutX,rotation,rotationPivotPoint:{x:cutX,y:cutY},fleshCut:match.fighters[1-match.winner].id==='bnl-01'?null:{x:cutX,y:cutY,top:Math.max(bounds[1],cutY-(bounds[3]-bounds[1])*.40),bottom:Math.min(bounds[3],cutY+(bounds[3]-bounds[1])*.40)},x:view.x+cutWorldX-cut.x,y:cutWorldY-cut.y};
 });
}
// The procedural combat torso can extend beyond a bowed native silhouette.
// At the frozen torso height, measure the real opaque side from the shared mask.
export function nativeTorsoContactEdge(frame,pose,mask,direction,scale,transform){
 const torso=frame.attachments?.torso,regions=pose?.hurt?.filter(r=>r.site==='torso');
 if(!torso||!regions?.length||!mask?.alpha||!Number.isFinite(scale)||scale<=0)return null;
  const offset=frame.offset??[0,0],row=Math.round(torso[1]),torsoX=transform?transform.point(torso).x:(torso[0]+offset[0]-frame.anchor[0])*scale;
 let edge=null;
 for(let y=Math.max(0,row-2);y<=Math.min(mask.height-1,row+2);y++){
   const worldY=transform?transform.point([0,y]).y:(y+offset[1]-frame.anchor[1])*scale;
  // Select the native trunk span beside the authored torso, excluding separate arms.
  const bands=regions.filter(r=>worldY>=r.top&&worldY<r.bottom);
  const region=bands.reduce((best,r)=>{
   const distance=Math.max(r.left-torsoX,0,torsoX-r.right);
   return !best||distance<best.distance?{region:r,distance}:best;
  },null)?.region;
  if(!region)continue;
   const left=Math.max(0,Math.ceil(transform?transform.inverse({x:region.left,y:worldY}).x:region.left/scale-offset[0]+frame.anchor[0]));
   const right=Math.min(mask.width-1,Math.floor(transform?transform.inverse({x:region.right,y:worldY}).x:region.right/scale-offset[0]+frame.anchor[0]));
  for(let x=left;x<=right;x++)if(mask.alpha[y*mask.width+x]>=128)
   edge=edge===null?x:direction>0?Math.max(edge,x):Math.min(edge,x);
 }
  return edge===null?null:(edge-torso[0])*(transform?.sx??scale);
}
export function nativeTorsoBandEdge(frame,pose,direction,scale,transform){
 const torso=frame.attachments?.torso,offset=frame.offset??[0,0];
 if(!torso||!Number.isFinite(scale)||scale<=0)return null;
  const p=transform?.point(torso),x=p?.x??(torso[0]+offset[0]-frame.anchor[0])*scale,y=p?.y??(torso[1]+offset[1]-frame.anchor[1])*scale;
 const bands=pose?.hurt?.filter(r=>r.site==='torso'&&y>=r.top&&y<r.bottom)??[];
 const region=bands.reduce((best,r)=>{const distance=Math.max(r.left-x,0,x-r.right);return !best||distance<best.distance?{region:r,distance}:best;},null)?.region;
 return region?(direction>0?region.right:region.left)-x:null;
}
export function registerNewDeletionViews(match,views,art,point,prop,nativeMask){
 const definition=deletionDefinition(match.fighters[match.winner].id);if(!['hug','litter-box','rip','marbles','cleaver','signal-overload'].includes(definition?.mechanism))return null;
 const result=views.map(view=>({...view})),hero=result[match.winner],victim=result[1-match.winner],b=definition.beats,t=match.deletionElapsed,o=match._deletionOrigin;
 if(definition.mechanism==='signal-overload'){if(t>=b.fragment)victim.opacity=0;return result;}
 if(definition.mechanism==='cleaver'){
  const source=art[1-match.winner],asset=source.clips[victim.clip],frame=asset?.data.frames?.[victim.facing]?.[poseFrameIndex(asset,victim)];
  if(frame){const body=point(victim,source,'torso'),bounds=frame.opaqueBounds,scale=poseScale(asset,frame);victim.remainsOrigin={x:body.x,height:(bounds[3]-bounds[1])*scale};}
  victim.remainsState=butcherVictimState(t,definition,o?.cleaverContacts);
   if(frame&&t>=b.highCut){victim.cleaverPieces=cleaverPiecePlan(frame,{contacts:o.cleaverContacts,scale:poseScale(asset,frame),transform:poseTransform(asset,frame),originX:victim.x,originY:FLOOR+(victim.y??0),direction:o.direction,mask:nativeMask?.(asset,frame)});if(victim.cleaverPieces.length)victim.opacity=0;}return result;
 }
 if(definition.mechanism==='marbles'){
  const source=art[1-match.winner],asset=source.clips[victim.clip],frame=asset?.data.frames?.[victim.facing]?.[poseFrameIndex(asset,victim)];
  if(frame){const body=point(victim,source,'torso'),bounds=frame.opaqueBounds,scale=poseScale(asset,frame);victim.remainsOrigin={x:body.x,height:(bounds[3]-bounds[1])*scale};}
  victim.remainsState=marbleVictimState(t);if(t>=b.lastImpact||(match.fighters[1-match.winner].id==='bnl-01'&&t>=b.firstImpact))victim.opacity=0;return result;
 }
 if(definition.mechanism==='litter-box'){
  const source=art[1-match.winner],g=litterBoxGeometry(match,prop,art),selected=litterBasinPose(source.clips);
  let takeoff;
  if(g?.basin){const firstPose=newDeletionPose('victim',b.fallStart,definition,match.fighters[1-match.winner]._clips,source.manifest.height),position=newDeletionPositions(match,b.fallStart,definition),start=point({...victim,...firstPose,x:0,y:position.victimY},source,'torso'),end=point({...victim,...selected,x:g.basin.x,y:g.basin.y},source,'torso');const extraLift=Math.max(0,start.y-end.y+40);start.x=o.target;start.y-=extraLift;takeoff={start,end,extraLift};}
  if(takeoff&&t<b.fallStart)victim.y-=takeoff.extraLift*easedProgress(t,b.boxSet,b.scratch1);
  if(t>=b.basinContact)Object.assign(victim,selected);
  if(t>=b.boxSet){const body=point(victim,source,'torso');victim.x+=o.target-body.x;}
  if(g?.basin&&t>=b.fallStart){
   const {start,end}=takeoff;
   if(t<b.basinContact){const p=clamp((t-b.fallStart)/(b.basinContact-b.fallStart),0,1),body=point(victim,source,'torso');victim.x+=start.x+(end.x-start.x)*p-body.x;victim.y+=start.y+(end.y-start.y)*p*p-88*p*(1-p)-body.y;}
   else {Object.assign(victim,selected,{x:g.basin.x,y:g.basin.y-8*Math.sin(Math.PI*clamp((t-b.basinContact)/(b.basinSettled-b.basinContact),0,1))});if(t>=b.litterImpact)victim.y+=(190-g.basin.y)*easedProgress(t,b.litterImpact,b.buried);}
  }
  if(g&&t>=b.retreat){const kick=nativeHorizontalEnvelope(art[match.winner].clips['delete-litter-kick'],o.direction>0?'left':'right'),kickX=o.direction>0?g.outerLeft-12-kick.right:g.outerRight+12-kick.left,sourceX=o.scratchNear??o.near;hero.x=sourceX+(kickX-sourceX)*easedProgress(t,b.retreat,b.turn);if(t>=b.present){const present=nativeHorizontalEnvelope(art[match.winner].clips['delete-present'],o.direction>0?'right':'left'),endX=o.direction>0?g.outerLeft-12-present.right:g.outerRight+12-present.left;hero.x=kickX+(endX-kickX)*easedProgress(t,b.present,b.present+450);}}
  victim.litterCaptured=t>=b.basinContact;victim.airborne=t>=b.fallStart&&t<b.basinContact;victim.basinSettled=t>=b.basinSettled;return result;
 }
 if(definition.mechanism==='hug'){
  const clip=art[match.winner]?.clips?.['delete-hug-happy']?'delete-hug-happy':'delete-hug',c=match.fighters[match.winner]._clips[clip]?.nativeContactMs??300,reference={...hero,x:o.near,clip,elapsed:c,facing:o.direction>0?'right':'left',y:0},grip=point(reference,art[match.winner],'grip'),standing={...victim,x:o.target,y:0,clip:'high',elapsed:210,facing:o.victimFacing},torso=point(standing,art[1-match.winner],'torso'),head=point(standing,art[1-match.winner],'head'),jump=easedProgress(t,b.hugWindup,b.hugContact),returning=1-easedProgress(t,b.release,b.landed);
  hero.x+=(torso.x-grip.x)*jump;hero.y=returning===0?0:Math.min(0,torso.y+(head.y-torso.y)*.65-grip.y)*jump*returning;
  return result;
 }
 const c=match.fighters[match.winner]._clips['delete-rip']?.nativeContactMs??300,reference={...hero,clip:'delete-rip',elapsed:c,facing:o.direction>0?'right':'left',y:0},grip=point(reference,art[match.winner],'grip'),source=frozenRipSource(victim,art[1-match.winner],o);
  if(source){const torso=point({...source.view,x:o.target},art[1-match.winner],'torso'),pose=match.fighters[1-match.winner]._clips[source.view.clip]?.combatPoses?.frames?.[source.view.facing]?.[poseFrameIndex(source.asset,source.view)],transform=poseTransform(source.asset,source.frame),edge=nativeTorsoContactEdge(source.frame,pose,nativeMask?.(source.asset,source.frame),o.direction,transform.sy,transform)??nativeTorsoBandEdge(source.frame,pose,o.direction,transform.sy,transform)??0;hero.x+=(torso.x+edge-grip.x)*easedProgress(t,b.gripWindup,b.gripContact);}
 victim.remainsArt=prop?.remains;
 if(victim.splitBody){const pieces=splitPieces(match,hero,victim,art,point,definition);if(pieces)victim.splitPieces=pieces;}
 return result;
}
function nativeHorizontalEnvelope(asset,facing){let left=0,right=0;for(const f of asset?.data?.frames?.[facing]??[]){const transform=poseTransform(asset,f),b=f.opaqueBounds;left=Math.min(left,transform.point(b.slice(0,2)).x);right=Math.max(right,transform.point(b.slice(2)).x);}return {left,right};}
export function litterBoxGeometry(match,prop,art){const definition=deletionDefinition(match.fighters[match.winner].id);if(definition?.mechanism!=='litter-box')return null;const bank=prop?.additional?.[definition.id];if(!bank)return null;
 const key=deletionPropState(match.deletionElapsed,'lyra'),frame=bank.manifest.frames[key]??bank.manifest.frames.open,reference=bank.manifest.frames.open,opening=reference.aperture??[0,0,reference.rect[2],reference.rect[3]],o=match._deletionOrigin,b=definition.beats,p=easedProgress(match.deletionElapsed,b.boxReach,b.boxSet),source=o.scratchNear??o.near,centre=source+o.direction*90+(o.target-source-o.direction*90)*p;
 let scale=bank.manifest.drawWidth/(bank.manifest.referenceWidth??reference.rect[2]),basin;
 const native=art?.[1-match.winner],selected=native&&litterBasinPose(native.clips),asset=native?.clips?.[selected?.clip],pose=asset?.data.frames?.[o.victimFacing]?.[selected.frameIndex];
  if(pose){const transform=poseTransform(asset,pose),bounds=pose.opaqueBounds;scale=Math.max(scale,((bounds[2]-bounds[0])*transform.sx+16)/opening[2]);const centerX=centre+(opening[0]+opening[2]/2-reference.anchor[0])*scale,plane=bank.manifest.basinPoint?.[1]??opening[1]+opening[3],floor=FLOOR+(plane-reference.anchor[1])*scale,bottom=transform.point([(bounds[0]+bounds[2])/2,bounds[3]]);basin={x:centerX-bottom.x,y:floor-FLOOR-bottom.y};}
 const plane=bank.manifest.basinPoint?.[1]??opening[1]+opening[3],outer=Object.values(bank.manifest.frames),outerLeft=centre+Math.min(...outer.map(f=>f.opaqueBounds[0]-f.anchor[0]))*scale,outerRight=centre+Math.max(...outer.map(f=>f.opaqueBounds[2]-f.anchor[0]))*scale;
 return {bank,frame,key,scale,x:centre-frame.anchor[0]*scale,y:FLOOR-frame.anchor[1]*scale,centre,rimY:FLOOR-(frame.anchor[1]-(frame.rimY??frame.rect[3]*.65))*scale,left:centre+(opening[0]-reference.anchor[0])*scale,right:centre+(opening[0]+opening[2]-reference.anchor[0])*scale,bottom:FLOOR+(opening[1]+opening[3]-reference.anchor[1])*scale,basinFloor:FLOOR+(plane-reference.anchor[1])*scale,outerLeft,outerRight,basin};
}
function nativeBox(ctx,g,front){const [sx,sy,w,h]=g.frame.rect;ctx.save();if(front){ctx.beginPath();ctx.rect(g.x-10,g.rimY,w*g.scale+20,FLOOR-g.rimY+12);ctx.clip();}ctx.drawImage(g.bank.images?.[g.frame.file]??g.bank.image,sx,sy,w,h,g.x,g.y,w*g.scale,h*g.scale);ctx.restore();}
// Replay the same intact native key through its static near-forearm mask.
// The full attacker remains behind the victim; no limb is moved or rescaled.
export function drawNativeRipForearm(ctx,view,art){
 const asset=art?.clips?.[view.clip],frame=asset?.data.frames?.[view.facing]?.[poseFrameIndex(asset,view)],mask=frame?.frontOcclusion;if(!mask?.length)return false;
  const transform=poseTransform(asset,frame),[sx,sy,w,h]=frame.rect;
  ctx.save();ctx.translate(view.x+transform.tx,FLOOR+(view.y??0)+transform.ty);ctx.scale(transform.sx,transform.sy);ctx.beginPath();for(const [i,[x,y]]of mask.entries())ctx[i?'lineTo':'moveTo'](x,y);ctx.closePath();ctx.clip();ctx.drawImage(asset.image,sx,sy,w,h,0,0,w,h);ctx.restore();return true;
}
export function drawNewDeletionScene(ctx,match,prop,views,art,front,{reducedMotion=false}={}){const definition=deletionDefinition(match.fighters[match.winner].id);if(!definition)return;const t=match.deletionElapsed,b=definition.beats,o=match._deletionOrigin;
 if(definition.mechanism==='signal-overload'){drawSignalDeletion(ctx,match,views,art,front,{reducedMotion});return;}
 if(definition.mechanism==='cleaver'){
  if(!front&&t>=b.highCut){const victim=views[1-match.winner],source=art[1-match.winner],asset=source.clips[victim.clip],frame=asset?.data.frames?.[victim.facing]?.[poseFrameIndex(asset,victim)];if(frame&&victim.cleaverPieces?.length)drawNativeCleaverPieces(ctx,asset.image,frame,victim.cleaverPieces,t,{reducedMotion});}
  return;
 }
 if(definition.mechanism==='marbles'){
  const victim=views[1-match.winner],bank=prop?.remains,state=marbleVictimState(t),origin=victim.remainsOrigin??{x:victim.x,height:match.fighters[1-match.winner].height};
  if(!front&&t>=b.firstImpact){const source=art[1-match.winner],asset=source.clips[victim.clip],frame=asset?.data.frames?.[victim.facing]?.[poseFrameIndex(asset,victim)],bodyMask=frame?{image:asset.image,frame,scale:poseScale(asset,frame),transform:poseTransform(asset,frame),view:victim}:null;if(match.fighters[1-match.winner].id==='bnl-01'){if(frame)drawNativeSignalFragments(ctx,asset,frame,victim,{progress:state.exposure,direction:o.direction,reducedMotion});}else drawRemainsVictim(ctx,bank,{...origin,pose:state.pose,progress:state.exposure,fall:state.fall,direction:o.direction,bodyMask});}
  if(front&&bank){const marble=bank.images.marble,hero=views[match.winner],native=art[match.winner],contact=match.fighters[match.winner]._clips['delete-marble']?.nativeContactMs??300;
   if(marble){for(let volley=0;volley<7;volley++){const launch=b.firstLaunch+volley*450,flight=clamp((t-launch)/200,0,1),reference={...hero,clip:'delete-marble',elapsed:contact},asset=native.clips['delete-marble'],frame=asset?.data.frames?.[hero.facing]?.[poseFrameIndex(asset,reference)],grip=frame?.attachments?.grip,local=grip&&poseTransform(asset,frame).point(grip),hand=local?{x:hero.x+local.x,y:FLOOR+(hero.y??0)+local.y}:{x:hero.x+o.direction*65,y:FLOOR-190};
    if(t>=launch&&t<launch+200){for(let ball=0;ball<3;ball++){const endY=FLOOR-origin.height*(volley%3===0?.88:.57)+(ball-1)*18,x=hand.x+(origin.x-hand.x)*flight,y=hand.y+(endY-hand.y)*flight-(reducedMotion?0:20)*Math.sin(Math.PI*flight);ctx.drawImage(marble,x-6,y-6,12,12);}}
    else if(t>=launch+200){const seconds=(t-launch-200)/1000;for(let ball=0;ball<2;ball++){const spread=o.direction*(36+ball*31),x=origin.x+spread*(1-Math.exp(-seconds*3)),bounce=Math.max(0,1-seconds/1.3)*Math.abs(Math.sin(seconds*10))*24,y=FLOOR-6-bounce;ctx.drawImage(marble,x-5,y-5,10,10);}}
   }}
  }
  return;
 }
 if(definition.mechanism==='rip'){if(front&&t>=b.gripContact&&t<b.rip)drawNativeRipForearm(ctx,views[match.winner],art[match.winner]);return;}
 // Soft Power is the authored whole-body hug; it has no external hardware or halo.
 if(definition.mechanism==='hug')return;
 if(definition.mechanism!=='litter-box'||t<b.boxReach)return;const g=litterBoxGeometry(match,prop,art);if(g)nativeBox(ctx,g,front);else {ctx.save();ctx.fillStyle=front?'#435d69':'#293c49';ctx.strokeStyle='#81a9b3';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(o.target,FLOOR-75,215,55,0,front?0:Math.PI,front?Math.PI:TAU);ctx.fill();ctx.stroke();ctx.restore();}
 if(front&&t>=b.kick&&t<b.buried){const p=clamp((t-b.kick)/(b.buried-b.kick),0,1),direction=o.direction,hero=views[match.winner],paw=match.fighters[match.winner]._clips['delete-litter-kick']?.contactStrikeOrigins?.[hero.facing],startX=hero.x+(paw?.x??direction*80),startY=FLOOR+(paw?.y??-40);ctx.save();ctx.fillStyle='#c4b18b';ctx.globalAlpha=.78;for(let i=0;i<22;i++){const travel=clamp((p-i*.012)*1.4,0,1),x=startX+(o.target-startX)*travel,y=startY+(FLOOR-70-startY)*travel-(reducedMotion?35:150)*Math.sin(Math.PI*travel)+(i%4)*6;ctx.fillRect(x,y,4+i%3,3+i%2);}ctx.restore();}
}
