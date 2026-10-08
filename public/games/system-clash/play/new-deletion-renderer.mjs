import {litterBasinPose,newDeletionPositions,newDeletionPose,hangingVictimPose} from './new-deletion-library.mjs';
import {deletionDefinition,deletionPropState,deletionPose} from './deletion-library.mjs';
import {poseFrameIndex,poseScale} from './fight-attachments.mjs';
import {easedProgress} from './fight-presentation.mjs';
const FLOOR=620,TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Measured centers of both bark fists/palms in each unchanged native rip key.
// These are independent facing poses; the source is never reflected or warped.
const RIP_HANDS={right:{3:[[27,110],[391,109]],4:[[29,111],[401,108]],5:[[50,161],[383,121]]},left:{3:[[28,100],[397,89]],4:[[25,105],[384,101]],5:[[32,114],[379,162]]}};
function ripHandPoints(view,art){const asset=art?.clips?.[view.clip];if(!asset)return null;const index=poseFrameIndex(asset,view),frame=asset.data.frames[view.facing]?.[index];if(!frame)return null;const native=frame.attachments?.ripHands??RIP_HANDS[view.facing]?.[index];if(!Array.isArray(native)||native.length!==2)return null;const scale=poseScale(asset,frame),offset=frame.offset??[0,0];return native.map(([x,y])=>({x:view.x+(x+offset[0]-frame.anchor[0])*scale,y:FLOOR+(view.y??0)+(y+offset[1]-frame.anchor[1])*scale}));}
function frozenRipSource(victim,source,origin){
 const capture=origin?.ripPose??hangingVictimPose(source.clips,{clip:'delete-suspended',elapsed:0}),clip=capture.clip;
 const view={...victim,clip,elapsed:capture.elapsed??0,y:0,rotation:0};
 const asset=source.clips[clip],frame=asset?.data.frames[view.facing]?.[poseFrameIndex(asset,view)];
 if(!frame)return null;return {view,asset,frame};
}
function splitPieces(match,hero,victim,art,point,definition){
 const b=definition.beats,t=match.deletionElapsed,source=art[1-match.winner],frozen=frozenRipSource(victim,source,match._deletionOrigin);if(!frozen)return null;
 const {view,asset,frame}=frozen,cut=point(view,source,'torso'),scale=poseScale(asset,frame),offset=frame.offset??[0,0],cutX=frame.attachments?.ripCut?.[0]??(cut.x-view.x)/scale-offset[0]+frame.anchor[0],cutY=frame.attachments?.ripCut?.[1]??(cut.y-FLOOR)/scale-offset[1]+frame.anchor[1],bounds=frame.opaqueBounds??[0,0,frame.rect[2],frame.rect[3]];
 const drop=clamp((t-b.separated)/(b.settled-b.separated),0,1),released={...hero,...deletionPose('attacker',b.separated,match.fighters[match.winner].id,match.fighters[match.winner]._clips,match.fighters[match.winner].height)},hands=ripHandPoints(drop===0?hero:released,art[match.winner]);if(!hands)return null;
 return [-1,1].map((halfMask,i)=>{
  const rotation=halfMask*Math.PI/2*drop,finalRotation=halfMask*Math.PI/2,left=halfMask<0?bounds[0]:cutX,right=halfMask<0?cutX:bounds[2],corners=[[left,bounds[1]],[right,bounds[1]],[left,bounds[3]],[right,bounds[3]]],maxY=Math.max(...corners.map(([x,y])=>((x-cutX)*Math.sin(finalRotation)+(y-cutY)*Math.cos(finalRotation))*scale)),floorCutY=FLOOR-maxY;
  const cutWorldX=hands[i].x+(match._deletionOrigin.target+halfMask*180-hands[i].x)*drop,cutWorldY=hands[i].y+(floorCutY-hands[i].y)*drop*drop-Math.max(90,(bounds[3]-bounds[1])*scale*.55)*drop*(1-drop);
  return {clip:view.clip,elapsed:view.elapsed,facing:view.facing,halfMask,cutX,rotation,rotationPivotPoint:{x:cutX,y:cutY},fleshCut:{x:cutX,y:cutY,top:Math.max(bounds[1],cutY-(bounds[3]-bounds[1])*.40),bottom:Math.min(bounds[3],cutY+(bounds[3]-bounds[1])*.40)},x:view.x+cutWorldX-cut.x,y:cutWorldY-cut.y};
 });
}
export function registerNewDeletionViews(match,views,art,point,prop){
 const definition=deletionDefinition(match.fighters[match.winner].id);if(!['hug','litter-box','rip'].includes(definition?.mechanism))return null;
 const result=views.map(view=>({...view})),hero=result[match.winner],victim=result[1-match.winner],b=definition.beats,t=match.deletionElapsed,o=match._deletionOrigin;
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
  hero.x+=(torso.x-grip.x)*jump;hero.y=returning===0?0:(torso.y+(head.y-torso.y)*.65-grip.y)*jump*returning;
  return result;
 }
 const c=match.fighters[match.winner]._clips['delete-rip']?.nativeContactMs??300,reference={...hero,clip:'delete-rip',elapsed:c,facing:o.direction>0?'right':'left',y:0},grip=point(reference,art[match.winner],'grip'),source=frozenRipSource(victim,art[1-match.winner],o);
 if(source){const torso=point({...source.view,x:o.target},art[1-match.winner],'torso'),pose=match.fighters[1-match.winner]._clips[source.view.clip]?.combatPoses?.frames?.[source.view.facing]?.[poseFrameIndex(source.asset,source.view)],region=pose?.hurt?.find(r=>r.site==='torso'),edge=region&&pose.sites?.torso?(o.direction>0?region.right:region.left)-pose.sites.torso.x:0;hero.x+=(torso.x+edge-grip.x)*easedProgress(t,b.gripWindup,b.gripContact);}
 if(victim.splitBody){const pieces=splitPieces(match,hero,victim,art,point,definition);if(pieces)victim.splitPieces=pieces;}
 return result;
}
function nativeHorizontalEnvelope(asset,facing){let left=0,right=0;for(const f of asset?.data?.frames?.[facing]??[]){const scale=poseScale(asset,f),offset=f.offset??[0,0],b=f.opaqueBounds;left=Math.min(left,(b[0]+offset[0]-f.anchor[0])*scale);right=Math.max(right,(b[2]+offset[0]-f.anchor[0])*scale);}return {left,right};}
export function litterBoxGeometry(match,prop,art){const definition=deletionDefinition(match.fighters[match.winner].id);if(definition?.mechanism!=='litter-box')return null;const bank=prop?.additional?.[definition.id];if(!bank)return null;
 const key=deletionPropState(match.deletionElapsed,'lyra'),frame=bank.manifest.frames[key]??bank.manifest.frames.open,reference=bank.manifest.frames.open,opening=reference.aperture??[0,0,reference.rect[2],reference.rect[3]],o=match._deletionOrigin,b=definition.beats,p=easedProgress(match.deletionElapsed,b.boxReach,b.boxSet),source=o.scratchNear??o.near,centre=source+o.direction*90+(o.target-source-o.direction*90)*p;
 let scale=bank.manifest.drawWidth/(bank.manifest.referenceWidth??reference.rect[2]),basin;
 const native=art?.[1-match.winner],selected=native&&litterBasinPose(native.clips),asset=native?.clips?.[selected?.clip],pose=asset?.data.frames?.[o.victimFacing]?.[selected.frameIndex];
 if(pose){const bodyScale=poseScale(asset,pose),bounds=pose.opaqueBounds,offset=pose.offset??[0,0];scale=Math.max(scale,((bounds[2]-bounds[0])*bodyScale+16)/opening[2]);const centerX=centre+(opening[0]+opening[2]/2-reference.anchor[0])*scale,plane=bank.manifest.basinPoint?.[1]??opening[1]+opening[3],floor=FLOOR+(plane-reference.anchor[1])*scale;basin={x:centerX-((bounds[0]+bounds[2])/2+offset[0]-pose.anchor[0])*bodyScale,y:floor-FLOOR-(bounds[3]+offset[1]-pose.anchor[1])*bodyScale};}
 const plane=bank.manifest.basinPoint?.[1]??opening[1]+opening[3],outer=Object.values(bank.manifest.frames),outerLeft=centre+Math.min(...outer.map(f=>f.opaqueBounds[0]-f.anchor[0]))*scale,outerRight=centre+Math.max(...outer.map(f=>f.opaqueBounds[2]-f.anchor[0]))*scale;
 return {bank,frame,key,scale,x:centre-frame.anchor[0]*scale,y:FLOOR-frame.anchor[1]*scale,centre,rimY:FLOOR-(frame.anchor[1]-(frame.rimY??frame.rect[3]*.65))*scale,left:centre+(opening[0]-reference.anchor[0])*scale,right:centre+(opening[0]+opening[2]-reference.anchor[0])*scale,bottom:FLOOR+(opening[1]+opening[3]-reference.anchor[1])*scale,basinFloor:FLOOR+(plane-reference.anchor[1])*scale,outerLeft,outerRight,basin};
}
function nativeBox(ctx,g,front){const [sx,sy,w,h]=g.frame.rect;ctx.save();if(front){ctx.beginPath();ctx.rect(g.x-10,g.rimY,w*g.scale+20,FLOOR-g.rimY+12);ctx.clip();}ctx.drawImage(g.bank.images?.[g.frame.file]??g.bank.image,sx,sy,w,h,g.x,g.y,w*g.scale,h*g.scale);ctx.restore();}
export function drawNewDeletionScene(ctx,match,prop,views,art,front,{reducedMotion=false}={}){const definition=deletionDefinition(match.fighters[match.winner].id);if(!definition)return;const t=match.deletionElapsed,b=definition.beats,o=match._deletionOrigin;
 if(definition.mechanism==='hug'){if(!front&&t>=b.hugContact&&t<b.release){ctx.save();ctx.strokeStyle='#e2bb7760';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(views[match.winner].x,FLOOR+(views[match.winner].y??0)-100,65,85,0,0,TAU);ctx.stroke();ctx.restore();}return;}
 if(definition.mechanism!=='litter-box'||t<b.boxReach)return;const g=litterBoxGeometry(match,prop,art);if(g)nativeBox(ctx,g,front);else {ctx.save();ctx.fillStyle=front?'#435d69':'#293c49';ctx.strokeStyle='#81a9b3';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(o.target,FLOOR-75,215,55,0,front?0:Math.PI,front?Math.PI:TAU);ctx.fill();ctx.stroke();ctx.restore();}
 if(front&&t>=b.kick&&t<b.buried){const p=clamp((t-b.kick)/(b.buried-b.kick),0,1),direction=o.direction,hero=views[match.winner],paw=match.fighters[match.winner]._clips['delete-litter-kick']?.contactStrikeOrigins?.[hero.facing],startX=hero.x+(paw?.x??direction*80),startY=FLOOR+(paw?.y??-40);ctx.save();ctx.fillStyle='#c4b18b';ctx.globalAlpha=.78;for(let i=0;i<22;i++){const travel=clamp((p-i*.012)*1.4,0,1),x=startX+(o.target-startX)*travel,y=startY+(FLOOR-70-startY)*travel-(reducedMotion?35:150)*Math.sin(Math.PI*travel)+(i%4)*6;ctx.fillRect(x,y,4+i%3,3+i%2);}ctx.restore();}
}
