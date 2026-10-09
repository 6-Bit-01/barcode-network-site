const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Time-only scan/reassembly: artwork and gameplay geometry stay fixed. */
export function transmissionBannerPlan(time,{reducedMotion=false}={}){
 const t=Math.max(0,Number.isFinite(time)?time:0);
 if(reducedMotion)return {reveal:1,scan:.5,fragment:0,band:0};
 const reveal=clamp(t/360,0,1),cycle=t%4800;
 return {reveal:1-(1-reveal)**3,scan:(t%2200)/2200,fragment:cycle>4520&&cycle<4600?1:0,band:Math.floor(t/45)%8};
}
export function drawTransmissionBanner(ctx,art,key,time,{reducedMotion=false,x=230,y=107,width=820,height=154}={}){
 const image=art?.images?.[key];if(!image)return false;
 const plan=transmissionBannerPlan(time,{reducedMotion}),pieces=8,piece=820/pieces;
 ctx.save();
 for(let i=0;i<pieces;i++){
  const shift=(1-plan.reveal)*(i%2?22:-22)+(plan.fragment&&i===plan.band?(i%2?3:-3):0);
  ctx.globalAlpha=.45+.55*plan.reveal;
  ctx.drawImage(image,i*piece,0,piece,154,x+i*width/pieces+shift,y,width/pieces,height);
 }
 if(!reducedMotion){ctx.beginPath();ctx.rect(x+12,y+9,width-24,height-18);ctx.clip();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.16;
  const scanY=y+plan.scan*height;ctx.fillStyle='#bceaff';ctx.fillRect(x+24,scanY,width-48,2);
  ctx.globalAlpha=.1;for(let row=0;row<height;row+=4)ctx.fillRect(x+20,y+row,width-40,1);
 }
 ctx.restore();return true;
}
