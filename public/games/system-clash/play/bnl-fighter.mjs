import {poseFrameIndex,poseScale,poseTransform} from './fight-attachments.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=(t,a,b)=>{const p=clamp((t-a)/(b-a),0,1);return p*p*(3-2*p);};
export const BNL_STYLE=Object.freeze({displayName:'BNL-01',height:320,nativeHoverBody:true,name:'Signal Construct',description:'A hooded AI construct with a digital wisp, precise signal strikes and agile projections.',signature:'LP → HP → HK',moveSpeed:275,jumpSpeed:225,punchDamage:.95,kickDamage:.93,throwDamage:.9,reach:{punch:1,kick:1,throw:1},tempo:{punch:.9,kick:.94,throw:1},knockback:{punch:.9,kick:.95,throw:.9},throwDistance:140,preferredSequence:['low-punch','punch','kick'],preferredMoves:['punch','low-punch','uppercut','low-kick','grab','kick']});
export const BNL_DELETION=Object.freeze({id:'signal-overload',name:'Signal Overload',mechanism:'signal-overload',prop:false,retainFloorBody:false,duration:5700,beats:{approach:0,focus:700,lock:1100,float:1550,overload:1950,fragment:2850,dispersed:4200,present:4400,complete:5700,shove:700,contact:1100,drive:1550,captured:1100,pressure:1950,impact:2850,final:4200}});
export function bnlDeletionPose(role,t,clips={}){const b=BNL_DELETION.beats;
 if(role==='victim')return t<b.lock?{clip:'high',elapsed:210}:{clip:clips['delete-rip-front']?'delete-rip-front':clips['delete-victim-front-lift']?'delete-victim-front-lift':'grabbed',elapsed:0,frameIndex:0};
 if(t<b.focus)return {clip:'walk',elapsed:t};if(t<b.overload)return {clip:'delete-signal-focus',elapsed:0,frameIndex:0};if(t<b.fragment)return {clip:'delete-signal-overload',elapsed:0,frameIndex:0};if(t<b.present)return {clip:'delete-signal-burst',elapsed:0,frameIndex:0};return {clip:'delete-present',elapsed:t-b.present};
}
export function bnlDeletionPositions(match,t){const o=match._deletionOrigin,b=BNL_DELETION.beats;return {winnerX:o.winner+(o.near-o.winner)*ease(t,0,b.focus),winnerY:0,victimX:o.originalVictim,victimY:-80*ease(t,b.lock,b.float)};}
/** A rigid native-pixel partition. Source cells and their sizes remain constant in flight. */
export function signalFragmentPlan(frame,{progress=0,x=0,y=620,scale=1,transform,direction=1}={}){
 const p=clamp(progress,0,1);if(p>=1)return [];const [sx,sy,w,h]=frame.rect,anchor=frame.anchor,offset=frame.offset??[0,0],cell=Math.max(18,Math.ceil(Math.sqrt(w*h/144))),out=[];
 for(let row=0;row<h;row+=cell)for(let col=0;col<w;col+=cell){const width=Math.min(cell,w-col),height=Math.min(cell,h-row),cx=col+width/2,cy=row+height/2,seed=((col/cell+1)*17+(row/cell+1)*29)%37;
  const dx=(cx-w/2)/Math.max(1,w/2),dy=(cy-h/2)/Math.max(1,h/2),local=transform?.point([cx,cy]);out.push({source:[sx+col,sy+row,width,height],width:width*(transform?.sx??scale),height:height*(transform?.sy??scale),x:x+(local?.x??(cx+offset[0]-anchor[0])*scale)+direction*p*(80+seed*4)+dx*p*100,y:y+(local?.y??(cy+offset[1]-anchor[1])*scale)+dy*p*120-170*p+150*p*p,rotation:(seed%7-3)*p*.17,opacity:Math.pow(1-p,1.4)});
 }
 return out;
}
export function drawNativeSignalFragments(ctx,asset,frame,view,{progress=0,direction=1,reducedMotion=false}={}){
 const pieces=signalFragmentPlan(frame,{progress,x:view.x,y:620+(view.y??0),scale:poseScale(asset,frame),transform:poseTransform(asset,frame),direction});
 for(const piece of pieces){ctx.save();ctx.globalAlpha=piece.opacity;ctx.translate(piece.x,piece.y);if(!reducedMotion)ctx.rotate(piece.rotation);ctx.drawImage(asset.image,...piece.source,-piece.width/2,-piece.height/2,piece.width,piece.height);ctx.restore();}
}
export function drawSignalDeletion(ctx,match,views,art,front,{reducedMotion=false}={}){
 const b=BNL_DELETION.beats,t=match.deletionElapsed;if(front||t<b.fragment)return;
 const victim=views[1-match.winner],source=art[1-match.winner],asset=source?.clips?.[victim.clip],frame=asset?.data?.frames?.[victim.facing]?.[poseFrameIndex(asset,victim)];if(!frame)return;
 drawNativeSignalFragments(ctx,asset,frame,victim,{progress:(t-b.fragment)/(b.dispersed-b.fragment),direction:match._deletionOrigin.direction,reducedMotion});
}
