import {stageById,stagePhase,stageInteractionReady} from './fight-stages.mjs';
const FLOOR=620,HEIGHT=720,TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function label(ctx,value,x,y,size,color,align='center'){ctx.font=`700 ${size}px monospace`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(String(value),x,y);}
function canvasFor(owner,width,height){try{const canvas=owner?.ownerDocument?.createElement?.('canvas')??(typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):null);if(canvas){canvas.width=width;canvas.height=height;}return canvas;}catch{return null;}}
function kitFrame(art,name){if(!art?.kit)return null;const frame=art.layers?.frames?.[name]??art.layers?.[name],r=frame?.rect;if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>art.kit.width||r[1]+r[3]>art.kit.height)return null;return frame;}
function prop(ctx,art,name,x,y,{width,height,opacity=1}={}){const frame=kitFrame(art,name);if(!frame)return false;const [sx,sy,sw,sh]=frame.rect,anchor=frame.anchor??[sw/2,sh],scale=width?width/sw:height?height/sh:1;ctx.save();ctx.globalAlpha=opacity;ctx.drawImage(art.kit,sx,sy,sw,sh,x-anchor[0]*scale,y-anchor[1]*scale,sw*scale,sh*scale);ctx.restore();return true;}

export function stageVisualState(state,{reducedMotion=false}={}){const spec=stageById(state.id),time=reducedMotion?0:(state.clock??0),p=(time%spec.ambientCycleMs)/spec.ambientCycleMs;return {phase:Math.floor(p*6),progress:p,drift:reducedMotion?0:Math.sin(p*TAU)*24,pulse:reducedMotion?.42:.35+.25*Math.sin(p*TAU*3),time};}

function fallback(ctx,spec){const sky=ctx.createLinearGradient(0,0,0,FLOOR);sky.addColorStop(0,'#10151d');sky.addColorStop(1,spec.color+'33');ctx.fillStyle=sky;ctx.fillRect(0,0,spec.width,HEIGHT);ctx.fillStyle='#0d1218';ctx.fillRect(0,FLOOR,spec.width,HEIGHT-FLOOR);ctx.strokeStyle=spec.color+'32';ctx.lineWidth=2;for(let x=200;x<spec.width;x+=320){ctx.strokeRect(x,140,230,270);ctx.fillStyle='#090e17';ctx.fillRect(x+30,190,170,105);}ctx.strokeStyle=spec.color+'66';ctx.beginPath();ctx.moveTo(0,FLOOR);ctx.lineTo(spec.width,FLOOR);ctx.stroke();label(ctx,spec.name.toUpperCase(),spec.width/2,122,26,spec.color);}
function composition(ctx,spec,art,owner){fallback(ctx,spec);if(art?.image){const image=art.image,s=1280/image.width,h=image.height*s,half=image.width/2;ctx.drawImage(image,0,0,image.width,image.height,640,0,1280,h);ctx.save();ctx.translate(640,0);ctx.scale(-1,1);ctx.drawImage(image,0,0,half,image.height,0,0,half*s,h);ctx.restore();ctx.save();ctx.translate(spec.width,0);ctx.scale(-1,1);ctx.drawImage(image,half,0,half,image.height,0,0,half*s,h);ctx.restore();}
 const strip=kitFrame(art,'floorStrip');if(strip){const [sx,sy,sw,sh]=strip.rect,s=80/sh,tile=canvasFor(owner,sw,sh),blend=tile?.getContext('2d');if(blend){blend.drawImage(art.kit,sx,sy,sw,sh,0,0,sw,sh);blend.globalCompositeOperation='destination-in';const horizontal=blend.createLinearGradient(0,0,sw,0);horizontal.addColorStop(0,'#0000');horizontal.addColorStop(.12,'#000');horizontal.addColorStop(.88,'#000');horizontal.addColorStop(1,'#0000');blend.fillStyle=horizontal;blend.fillRect(0,0,sw,sh);const vertical=blend.createLinearGradient(0,0,0,sh);vertical.addColorStop(0,'#0000');vertical.addColorStop(.2,'#000');vertical.addColorStop(.75,'#000');vertical.addColorStop(1,'#0000');blend.fillStyle=vertical;blend.fillRect(0,0,sw,sh);}for(let x=0;x<spec.width;x+=sw*s){const width=Math.min(sw*s,spec.width-x);if(blend)ctx.drawImage(tile,0,0,width/s,sh,x,FLOOR,width,80);else {ctx.save();ctx.globalAlpha=.35;ctx.drawImage(art.kit,sx,sy,width/s,sh,x,FLOOR,width,80);ctx.restore();}}}
 for(const x of [400,1260,2140])prop(ctx,art,'backProp',x,FLOOR,{height:270,opacity:.8});
 for(const x of [430,1260,2120])prop(ctx,art,'lightFixture',x,130,{width:135});

}
function visual(ctx,options,key,x,y,width,height,opacity=1){const image=options?.interfaceArt?.images?.[key];if(!image)return false;ctx.save();ctx.globalAlpha*=clamp(opacity,0,1);ctx.drawImage(image,x,y,width,height);ctx.restore();return true;}
function nativeVisual(ctx,options,key,x,y,width,opacity=1){const image=options?.interfaceArt?.images?.[key];if(!image)return false;return visual(ctx,options,key,x,y,width,width*image.height/image.width,opacity);}
function fixtures(ctx,spec,art,elapsed){const progress=elapsed==null?0:clamp(elapsed/350,0,1),opacity=1-progress*progress*(3-2*progress);if(opacity<=0)return;
 prop(ctx,art,'control',spec.interaction.x,FLOOR,{height:150,opacity});
 prop(ctx,art,'emitter',(spec.hazard.zone.left+spec.hazard.zone.right)/2,FLOOR,{height:190,opacity});
}
function ambient(ctx,state,art,options){const v=stageVisualState(state,options),spec=stageById(state.id);
 // Lamps flicker in their authored fixtures; scenery never acquires debug meters or floating circles.
 for(const x of [430,1260,2120])prop(ctx,art,'lightFixture',x,130,{width:135,opacity:.32+v.pulse});
 if(spec.id==='studio-rat-lair')prop(ctx,art,'backProp',1280,FLOOR,{height:270,opacity:.1+v.pulse*.2});
}
function warnRegion(ctx,spec,phase,options){const z=spec.hazard.zone,age=phase.progress,pulse=options.reducedMotion?.65:.65+.2*Math.sin(age*TAU*3);
 visual(ctx,options,'hazardWarning',z.left,FLOOR-19,z.right-z.left,24,pulse);
 label(ctx,spec.hazard.name,(z.left+z.right)/2,z.top-16,19,spec.color);
}
function hazard(ctx,state,spec,phase,options){if(phase.phase!=='active')return;const z=spec.hazard.zone,a=phase.activation,t=state.fightClock-a.warningEnd,p=phase.progress,hit=spec.hazard.impactDelayMs,cx=(z.left+z.right)/2,fade=1-clamp((p-.68)/.32,0,1);ctx.save();
 if(spec.hazard.type==='shutter'){
  const down=clamp(t/hit,0,1),up=clamp((t-(spec.hazard.activeMs-260))/260,0,1),height=z.bottom-z.top,bottom=z.top+height*down*(1-up);
  ctx.beginPath();ctx.rect(z.left,z.top,z.right-z.left,height);ctx.clip();
  const image=options.interfaceArt?.images?.hazardShutter,scale=image?Math.max((z.right-z.left)/image.width,height/image.height):1;
  if(image)visual(ctx,options,'hazardShutter',cx-image.width*scale/2,bottom-image.height*scale,image.width*scale,image.height*scale);
 }else if(spec.hazard.type==='beam'){
  ctx.beginPath();ctx.rect(z.left,z.top,z.right-z.left,z.bottom-z.top);ctx.clip();
  const reveal=clamp(t/hit,0,1);ctx.beginPath();ctx.rect(z.left,z.top,(z.right-z.left)*reveal,z.bottom-z.top);ctx.clip();
  visual(ctx,options,'hazardBeam',z.left,z.top,z.right-z.left,z.bottom-z.top,fade);
 }else if(spec.hazard.type==='thorns'){
  const rise=clamp(t/hit,0,1)*(1-clamp((p-.8)/.2,0,1)),height=FLOOR-z.top;
  ctx.beginPath();ctx.rect(z.left,z.top,z.right-z.left,height);ctx.clip();
  const image=options.interfaceArt?.images?.hazardThorns,tileWidth=image?height*image.width/image.height:154;
  for(let x=z.left;x<z.right;x+=tileWidth*.88)visual(ctx,options,'hazardThorns',x,FLOOR-height*rise,tileWidth,height);
 }else if(spec.hazard.type==='barrel'){
  if(t<hit){const x=z.right-(z.right-z.left)*clamp(t/hit,0,1)*.5,image=options.interfaceArt?.images?.hazardBarrel,h=image?86*image.height/image.width:49;ctx.translate(x,FLOOR-h/2);ctx.rotate(options.reducedMotion?0:t*.008);
   nativeVisual(ctx,options,'hazardBarrel',-43,-h/2,86);
  }else {const image=options.interfaceArt?.images?.hazardBlast,width=z.right-z.left,h=image?width*image.height/image.width:width*.697;ctx.beginPath();ctx.rect(z.left,z.top,width,z.bottom-z.top);ctx.clip();nativeVisual(ctx,options,'hazardBlast',z.left,FLOOR-h,width,fade);}
 }else{
  const reveal=clamp(t/hit,0,1),image=options.interfaceArt?.images?.hazardFeedback,height=z.bottom-z.top,width=image?height*image.width/image.height:height*1.44;
  ctx.beginPath();ctx.rect(z.left,z.top,(z.right-z.left)*reveal,height);ctx.clip();
  for(let x=z.left;x<z.right;x+=width*.9)nativeVisual(ctx,options,'hazardFeedback',x,z.top,width,fade);
 }
 ctx.restore();
}
function walls(ctx,state,art,options){const spec=stageById(state.id);for(const side of ['left','right']){const x=side==='left'?210:state.width-210,wall=state.walls?.[side]??{damage:0},target=spec.walls[side].target;
 if(!wall.broken){prop(ctx,art,side==='left'?'leftWall':'rightWall',x,FLOOR,{height:500});
  // Damage belongs to the wall surface, rather than a floating outlined instruction panel.
  if(target)nativeVisual(ctx,options,'wallCracks',x-42,360,84,.23+clamp(wall.damage/80,0,1)*.72);
 }else prop(ctx,art,'debris',x,FLOOR,{width:140});
}
 const impact=state.lastWallImpact,age=state.clock-(impact?.at??-10000);
 if(impact&&age>=0&&age<350){const x=impact.side==='left'?210:state.width-210;
  prop(ctx,art,'debris',x,FLOOR-age*.018,{width:140,opacity:.7*(1-age/350)});
 }
}

export function createStageRenderer(owner){let cache=null;return {
 cacheInfo(){return {count:cache?1:0,id:cache?.id,bytes:cache?cache.width*HEIGHT*4:0};},
 drawBackground(ctx,state,source){const spec=stageById(state.id),art=source?.id===state.id?source:null;if(!cache||cache.id!==state.id||cache.image!==art?.image||cache.kit!==art?.kit||cache.layers!==art?.layers){const canvas=canvasFor(owner,state.width,HEIGHT),context=canvas?.getContext('2d');if(context)composition(context,spec,art,owner);cache={id:state.id,image:art?.image,kit:art?.kit,layers:art?.layers,canvas,context,width:state.width};}if(cache.context)ctx.drawImage(cache.canvas,0,0);else composition(ctx,spec,art,owner);},
 drawBehind(ctx,state,source,options={}){const spec=stageById(state.id),art=source?.id===state.id?source:null;ambient(ctx,state,art,options);fixtures(ctx,spec,art,options.cinematicElapsed);walls(ctx,state,art,options);if(options.fighting===false)return;const phase=stagePhase(state);if(phase.phase==='warning'||phase.phase==='active'){warnRegion(ctx,spec,phase,options);hazard(ctx,state,spec,phase,options);}},
 drawFront(ctx,match,source,options={}){const state=match.stage,spec=stageById(state.id),art=source?.id===state.id?source:null;if(match.phase!=='fight')return;const phase=stagePhase(state),near=match.fighters?.some(f=>f.hp>0&&Math.abs(f.x-spec.interaction.x)<=spec.interaction.reach),prompt=near&&stageInteractionReady(state,spec.interaction.x)?'R1 · '+spec.interaction.label:phase.phase==='cooldown'?`RECHARGE ${Math.ceil(phase.remaining/1000)}s`:phase.phase==='interacting'?'ARMING…':phase.phase==='ready'?'READY':'WARNING';ctx.save();const width=Math.max(180,prompt.length*8+30);visual(ctx,options,'menuPlate',spec.interaction.x-width/2,FLOOR+5,width,34,.9);label(ctx,prompt,spec.interaction.x,FLOOR+28,13,spec.color);ctx.restore();}
};}
