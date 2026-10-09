export const CONSOLE_BOOT_DURATION=3600;
const marks=['barcode-circuit-works','soft-signal-systems','channel-06-entertainment'];
export function consoleBootFrame(elapsed,{reducedMotion=false}={}){
 const time=Math.max(0,Number(elapsed)||0),index=Math.min(2,Math.floor(time/1200)),local=time-index*1200;
 return {asset:marks[index],complete:time>=CONSOLE_BOOT_DURATION,alpha:reducedMotion?1:Math.min(1,local/170,(1200-local)/170),offset:reducedMotion?0:Math.max(0,1-local/320)*12};
}
export function createConsoleBoot({element,image,caption,onFinish=()=>{},reducedMotion=()=>false}={}){
 let active=false,last=null,elapsed=0;
 function finish(){if(!active)return;active=false;element.hidden=true;last=null;onFinish();}
 function tick(now){if(!active)return;if(last!==null)elapsed+=Math.min(50,Math.max(0,now-last));last=now;const frame=consoleBootFrame(elapsed,{reducedMotion:reducedMotion()});if(frame.complete){finish();return;}
 const src='assets/console/'+frame.asset+'.webp';if(image.getAttribute('src')!==src)image.src=src;image.style.opacity=String(frame.alpha);image.style.transform='translateY('+frame.offset+'px)';caption.textContent=frame.asset.split('-').join(' ').toUpperCase();}
 return {get active(){return active;},start(){elapsed=0;last=null;active=true;element.hidden=false;tick(0);},tick,skip:finish,pause(){last=null;}};
}
