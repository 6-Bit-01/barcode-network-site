const TAU=Math.PI*2;
function arc(seed,side){
 const points=[];let n=seed>>>0;
 for(let i=0;i<10;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;const x=side===0?28+i*39:1252-i*39,y=96+Math.sin(i*.9)*85+((n>>>16)%61-30);points.push([x,y]);}
 return points;
}
export function titleSignalFrame(time,{reducedMotion=false}={}){
 const t=reducedMotion?0:Math.max(0,Number.isFinite(time)?time:0),cycle=t%12000,seed=Math.floor(t/70);
 return {electric:reducedMotion?.23:.35+.15*(.5+.5*Math.sin(t/570)),sweep:reducedMotion?.45:(t%8500)/8500,
  glitch:!reducedMotion&&cycle>10960&&cycle<11150?.34:0,offset:!reducedMotion&&cycle>10960&&cycle<11150?Math.sin(t*.06)*3:0,
  arcs:[arc(seed+41,0),arc(seed+137,1),arc(seed+23,0).map(([x,y])=>[x,390-y]),arc(seed+61,1).map(([x,y])=>[x,390-y])],
  logo:{scan:reducedMotion?.5:(t%4200)/4200,band:Math.floor(t/55)%12,shift:!reducedMotion&&t%6400>6100?Math.sin(t*.04)*2.5:0}};
}
/** Both surfaces share demo's menu clock; no second animation loop or layout motion. */
export function createTitleFX(canvas,{logoCanvas,logoImage,imageFactory=()=>new Image(),deviceScale=()=>Math.min(2,globalThis.devicePixelRatio||1)}={}){
 const ctx=canvas?.getContext?.('2d'),logoCtx=logoCanvas?.getContext?.('2d'),bolt=imageFactory();bolt.src=new URL('assets/ui/title-electric.svg',import.meta.url).href;
 let wasActive=false,signature='',logoSignature='',paintedStill=false;
 function drawLogo(frame,reducedMotion,d){
  if(!logoCtx||!logoCanvas||!logoImage?.complete)return false;
  const iw='naturalWidth' in logoImage?logoImage.naturalWidth:logoImage.width,ih='naturalHeight' in logoImage?logoImage.naturalHeight:logoImage.height;
  if(!(iw>0&&ih>0))return false;
  const w=Math.max(1,logoCanvas.clientWidth||720),h=Math.max(1,logoCanvas.clientHeight||270),next=`${w}:${h}:${d}`;
  if(logoSignature!==next){logoSignature=next;logoCanvas.width=Math.round(w*d);logoCanvas.height=Math.round(h*d);}
  logoCtx.setTransform(d,0,0,d,0,0);logoCtx.clearRect(0,0,w,h);
  for(let i=0;i<12;i++){const shift=i===frame.logo.band?frame.logo.shift:0;logoCtx.drawImage(logoImage,0,ih*i/12,iw,ih/12,shift,h*i/12,w,h/12+.2);}
  if(!reducedMotion){const x=frame.logo.scan*(w+60)-30,sx=Math.max(0,x),ex=Math.min(w,x+30);if(ex>sx){logoCtx.save();logoCtx.globalCompositeOperation='screen';logoCtx.globalAlpha=.2;logoCtx.drawImage(logoImage,sx/w*iw,0,(ex-sx)/w*iw,ih,sx,0,ex-sx,h);logoCtx.restore();}}
  logoImage.classList?.add?.('title-logo-animated');return true;
 }
 return {ownsAnimationLoop:false,draw(time,{active=true,reducedMotion=false}={}){
  if(!ctx||!canvas)return;
  if(!active){if(wasActive)ctx.clearRect(0,0,canvas.width,canvas.height);wasActive=false;paintedStill=false;return;}
  const w=Math.max(1,canvas.clientWidth||1280),h=Math.max(1,canvas.clientHeight||720),d=deviceScale(),next=`${w}:${h}:${d}`;
  if(signature!==next){signature=next;canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);paintedStill=false;}
  const nextLogo=logoCanvas?`${Math.max(1,logoCanvas.clientWidth||720)}:${Math.max(1,logoCanvas.clientHeight||270)}:${d}`:'';
  if(reducedMotion&&paintedStill&&wasActive&&(!logoCanvas||nextLogo===logoSignature))return;wasActive=true;
  const frame=titleSignalFrame(time,{reducedMotion});ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
  if(bolt.complete&&bolt.width){ctx.save();ctx.globalAlpha=frame.electric;ctx.globalCompositeOperation='screen';ctx.drawImage(bolt,0,0,1280,400,w*.05,h*.035,w*.90,h*.48);ctx.restore();}
  if(!reducedMotion){ctx.save();ctx.translate(w*.05,h*.035);ctx.scale(w*.90/1280,h*.48/400);ctx.globalCompositeOperation='screen';
   for(const [i,points]of frame.arcs.entries()){
    ctx.beginPath();points.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.lineJoin='round';ctx.strokeStyle=i%2?'#b7f668':'#ba71ee';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=9;ctx.lineWidth=2.5;ctx.globalAlpha=.7;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#efffff';ctx.lineWidth=.8;ctx.globalAlpha=.8;ctx.stroke();
   }ctx.restore();
   ctx.save();ctx.beginPath();ctx.rect(w*.08,h*.04,w*.84,h*.34);ctx.clip();const x=w*(.10+.78*frame.sweep),g=ctx.createLinearGradient(x-12,0,x+12,0);g.addColorStop(0,'#bb71ee00');g.addColorStop(.5,'#ccffe82b');g.addColorStop(1,'#b7f66800');ctx.fillStyle=g;ctx.fillRect(x-12,h*.04,24,h*.34);ctx.restore();
  }
  const logoReady=drawLogo(frame,reducedMotion,d);paintedStill=Boolean(reducedMotion&&bolt.complete&&bolt.width&&(!logoCanvas||logoReady));
 }};
}
