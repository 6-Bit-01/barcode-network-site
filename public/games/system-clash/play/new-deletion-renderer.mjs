import {deletionDefinition,deletionPropState,deletionPose} from './deletion-library.mjs';
import {poseFrameIndex,poseScale} from './fight-attachments.mjs';
import {easedProgress} from './fight-presentation.mjs';
const FLOOR=620,TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Measured centers of both bark fists/palms in each unchanged native rip key.
// These are independent facing poses; the source is never reflected or warped.
const RIP_HANDS={right:{3:[[27,110],[391,109]],4:[[29,111],[401,108]],5:[[50,161],[383,121]]},left:{3:[[28,100],[397,89]],4:[[25,105],[384,101]],5:[[32,114],[379,162]]}};
function ripHandPoints(view,art){const asset=art?.clips?.[view.clip];if(!asset)return null;const index=poseFrameIndex(asset,view),frame=asset.data.frames[view.facing]?.[index];if(!frame)return null;const native=frame.attachments?.ripHands??RIP_HANDS[view.facing]?.[index];if(!Array.isArray(native)||native.length!==2)return null;const scale=poseScale(asset,frame),offset=frame.offset??[0,0];return native.map(([x,y])=>({x:view.x+(x+offset[0]-frame.anchor[0])*scale,y:FLOOR+(view.y??0)+(y+offset[1]-frame.anchor[1])*scale}));}
function splitPieces(match,hero,victim,art,point,definition){const b=definition.beats,t=match.deletionElapsed,source=art[1-match.winner];
 const drop=clamp((t-b.separated)/(b.settled-b.separated),0,1),nativeDuration=match.fighters[1-match.winner]._clips.knockdown?.nativeDuration??match.fighters[1-match.winner]._clips.knockdown?.duration??630;
 if(drop===1)return [-1,1].map(halfMask=>({halfMask,x:victim.x+halfMask*110,y:0,clip:'knockdown',elapsed:10000,facing:victim.facing,rotation:0}));
 const hands=ripHandPoints(hero,art[match.winner]);if(!hands)return null;
 const pose=drop===0?{clip:'delete-brace',elapsed:0}:{clip:'knockdown',elapsed:drop*nativeDuration},body={...victim,...pose,y:0},cut=point(body,source,'torso');
 // Once released, each intact source half follows its own fall from the last
 // authored fist position. The canonical floor frame and anchors remain exact.
 const released={...hero,...deletionPose('attacker',b.separated,match.fighters[match.winner].id,match.fighters[match.winner]._clips,match.fighters[match.winner].height)},from=drop===0?hands:ripHandPoints(released,art[match.winner]),end=point({...victim,clip:'knockdown',elapsed:10000,y:0},source,'torso');if(!from)return null;
 return [-1,1].map((halfMask,i)=>{const targetX=from[i].x+(end.x+halfMask*110-from[i].x)*drop,targetY=from[i].y+(end.y-from[i].y)*drop*drop;return {...pose,halfMask,facing:victim.facing,rotation:0,x:victim.x+targetX-cut.x,y:targetY-cut.y};});
}
export function registerNewDeletionViews(match,views,art,point){const definition=deletionDefinition(match.fighters[match.winner].id);if(!['hug','litter-box','rip'].includes(definition?.mechanism))return null;
 const result=views.map(view=>({...view})),hero=result[match.winner],victim=result[1-match.winner],b=definition.beats,t=match.deletionElapsed,o=match._deletionOrigin;
 if(definition.mechanism==='litter-box'){if(t>=b.boxSet){const body=point(victim,art[1-match.winner],'torso');victim.x+=o.target-body.x;}return result;}
 const clip=definition.mechanism==='hug'?'delete-hug':'delete-rip',c=match.fighters[match.winner]._clips[clip]?.nativeContactMs??300;
 const reference={...hero,clip,elapsed:c,facing:o.direction>0?'right':'left',y:0},grip=point(reference,art[match.winner],'grip'),torso=point({...victim,x:o.target,y:0,clip:definition.mechanism==='hug'&&match.fighters[1-match.winner].height>260?'crouch':'delete-brace',elapsed:definition.mechanism==='hug'&&match.fighters[1-match.winner].height>260?10000:0},art[1-match.winner],'torso');
 hero.x+=(torso.x-grip.x)*easedProgress(t,definition.mechanism==='hug'?b.hugWindup:b.gripWindup,definition.mechanism==='hug'?b.hugContact:b.gripContact);
 if(definition.mechanism==='rip'&&victim.splitBody){const pieces=splitPieces(match,hero,victim,art,point,definition);if(pieces)victim.splitPieces=pieces;}
 return result;
}
export function litterBoxGeometry(match,prop){const definition=deletionDefinition(match.fighters[match.winner].id);if(definition?.mechanism!=='litter-box')return null;const bank=prop?.additional?.[definition.id];if(!bank)return null;
 const key=deletionPropState(match.deletionElapsed,'lyra'),frame=bank.manifest.frames[key]??bank.manifest.frames.open,scale=bank.manifest.drawWidth/(bank.manifest.referenceWidth??frame.rect[2]),o=match._deletionOrigin,b=definition.beats,p=easedProgress(match.deletionElapsed,b.boxReach,b.boxSet),source=o.scratchNear??o.near,centre=source+o.direction*90+(o.target-source-o.direction*90)*p;
 return {bank,frame,key,scale,x:centre-frame.anchor[0]*scale,y:FLOOR-frame.anchor[1]*scale,centre,rimY:FLOOR-(frame.anchor[1]-(frame.rimY??frame.rect[3]*.65))*scale,left:centre-190,right:centre+190};
}
function nativeBox(ctx,g,front){const [sx,sy,w,h]=g.frame.rect;ctx.save();if(front){ctx.beginPath();ctx.rect(g.x-10,g.rimY,w*g.scale+20,FLOOR-g.rimY+12);ctx.clip();}ctx.drawImage(g.bank.images?.[g.frame.file]??g.bank.image,sx,sy,w,h,g.x,g.y,w*g.scale,h*g.scale);ctx.restore();}
export function drawNewDeletionScene(ctx,match,prop,views,art,front,{reducedMotion=false}={}){const definition=deletionDefinition(match.fighters[match.winner].id);if(!definition)return;const t=match.deletionElapsed,b=definition.beats,o=match._deletionOrigin;
 if(definition.mechanism==='hug'){if(!front&&t>=b.hugContact&&t<b.release){ctx.save();ctx.strokeStyle='#e2bb7760';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(o.target,FLOOR-120,70,100,0,0,TAU);ctx.stroke();ctx.restore();}return;}
 if(definition.mechanism!=='litter-box'||t<b.boxReach)return;const g=litterBoxGeometry(match,prop);if(g)nativeBox(ctx,g,front);else {ctx.save();ctx.fillStyle=front?'#435d69':'#293c49';ctx.strokeStyle='#81a9b3';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(o.target,FLOOR-75,215,55,0,front?0:Math.PI,front?Math.PI:TAU);ctx.fill();ctx.stroke();ctx.restore();}
 if(front&&t>=b.kick&&t<b.buried){const p=clamp((t-b.kick)/(b.buried-b.kick),0,1),direction=o.direction,hero=views[match.winner],paw=match.fighters[match.winner]._clips['delete-litter-kick']?.contactStrikeOrigins?.[hero.facing],startX=hero.x+(paw?.x??direction*80),startY=FLOOR+(paw?.y??-40);ctx.save();ctx.fillStyle='#c4b18b';ctx.globalAlpha=.78;for(let i=0;i<22;i++){const travel=clamp((p-i*.012)*1.4,0,1),x=startX+(o.target-startX)*travel,y=startY+(FLOOR-70-startY)*travel-(reducedMotion?35:150)*Math.sin(Math.PI*travel)+(i%4)*6;ctx.fillRect(x,y,4+i%3,3+i%2);}ctx.restore();}
}
