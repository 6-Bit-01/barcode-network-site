const MARK_DURATION=1200,PRESENTS_DURATION=720;
const marks=['barcode-circuit-works','soft-signal-systems','channel-06-entertainment'];
export const CONSOLE_BOOT_DURATION=marks.length*MARK_DURATION+PRESENTS_DURATION;
export function consoleBootFrame(elapsed,{reducedMotion=false}={}){
 const time=Math.max(0,Number(elapsed)||0),index=Math.min(marks.length,Math.floor(time/MARK_DURATION));
 const presents=index===marks.length,local=time-index*MARK_DURATION,duration=presents?PRESENTS_DURATION:MARK_DURATION;
 return {asset:presents?null:marks[index],caption:presents?'PRESENTS':marks[index].split('-').join(' ').toUpperCase(),complete:time>=CONSOLE_BOOT_DURATION,alpha:reducedMotion?1:Math.max(0,Math.min(1,local/170,(duration-local)/170)),offset:reducedMotion?0:Math.max(0,1-local/320)*12};
}
export function createConsoleBoot({element,image,caption,onFinish=()=>{},reducedMotion=()=>false}={}){
 let active=false,last=null,elapsed=0;
 function finish(){if(!active)return;active=false;element.hidden=true;last=null;onFinish();}
 function tick(now){if(!active)return;if(last!==null)elapsed+=Math.min(50,Math.max(0,now-last));last=now;const frame=consoleBootFrame(elapsed,{reducedMotion:reducedMotion()});if(frame.complete){finish();return;}
 image.hidden=!frame.asset;element.dataset.phase=frame.asset?'mark':'presents';
 if(frame.asset){const src='assets/console/'+frame.asset+'.webp';if(image.getAttribute('src')!==src)image.src=src;}
 for(const node of [image,caption]){node.style.opacity=String(frame.alpha);node.style.transform='translateY('+frame.offset+'px)';}caption.textContent=frame.caption;}
 return {get active(){return active;},start(){elapsed=0;last=null;active=true;element.hidden=false;tick(0);},tick,pause(){last=null;}};
}
