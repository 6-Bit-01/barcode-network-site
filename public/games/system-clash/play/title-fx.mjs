const TAU=Math.PI*2;
export function titleSignalFrame(time,{reducedMotion=false}={}){
 if(reducedMotion)return {electric:.23,sweep:.45,glitch:0,offset:0};
 const t=Math.max(0,Number.isFinite(time)?time:0),cycle=t%12000;
 return {electric:.26+.24*(.5+.5*Math.sin(t/1400)),sweep:(t%8500)/8500,glitch:cycle>10960&&cycle<11150?.34:0,offset:cycle>10960&&cycle<11150?Math.sin(t*.06)*3:0};
}
/** Decoration called by demo's existing menu clock. It never creates a second animation loop. */
export function createTitleFX(canvas,{imageFactory=()=>new Image(),deviceScale=()=>Math.min(2,globalThis.devicePixelRatio||1)}={}){
 const ctx=canvas?.getContext?.('2d');const bolt=imageFactory();bolt.src=new URL('assets/ui/title-electric.svg',import.meta.url).href;
 let wasActive=false,signature='',paintedStill=false;
 return {ownsAnimationLoop:false,draw(time,{active=true,reducedMotion=false}={}){
  if(!ctx||!canvas)return;
  if(!active){if(wasActive)ctx.clearRect(0,0,canvas.width,canvas.height);wasActive=false;paintedStill=false;return;}
  const w=Math.max(1,canvas.clientWidth||1280),h=Math.max(1,canvas.clientHeight||720),d=deviceScale(),next=`${w}:${h}:${d}`;
  if(signature!==next){signature=next;canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);paintedStill=false;}
  if(reducedMotion&&paintedStill&&wasActive)return;wasActive=true;
  const frame=titleSignalFrame(time,{reducedMotion});ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
  // The electricity stays behind the title, leaving controls and their art unobstructed.
  if(bolt.complete&&bolt.width){ctx.save();ctx.globalAlpha=frame.electric;ctx.globalCompositeOperation='screen';ctx.drawImage(bolt,0,0,1280,400,w*.05,h*.035,w*.90,h*.48);ctx.restore();}
  if(!reducedMotion){ctx.save();ctx.beginPath();ctx.rect(w*.08,h*.04,w*.84,h*.34);ctx.clip();
   const x=w*(.10+.78*frame.sweep),g=ctx.createLinearGradient(x-12,0,x+12,0);g.addColorStop(0,'#bb71ee00');g.addColorStop(.5,'#ccffe82b');g.addColorStop(1,'#b7f66800');ctx.fillStyle=g;ctx.fillRect(x-12,h*.04,24,h*.34);
   if(frame.glitch&&bolt.complete&&bolt.width){ctx.globalAlpha=frame.glitch;ctx.globalCompositeOperation='screen';ctx.drawImage(bolt,0,130,1280,50,w*.05+frame.offset,h*.20,w*.90,h*.06);}
   ctx.restore();}
  paintedStill=Boolean(reducedMotion&&bolt.complete&&bolt.width);
 }};
}
