export function compileMenuIdle(data,image){
 const dimensions=data?.atlasSize;if(!dimensions||dimensions[0]!==image.width||dimensions[1]!==image.height||!/^[-a-z0-9]+-idle\.webp$/.test(data.file)||!Number.isFinite(data.scale)||data.scale<=0||!Number.isFinite(data.heightScale)||data.heightScale<=0||!Array.isArray(data.canvasSize)||data.canvasSize.length!==2||!data.canvasSize.every(v=>Number.isFinite(v)&&v>0&&v<=640)||!Number.isFinite(data.groundY)||data.groundY<0||data.groundY>data.canvasSize[1])throw new Error('Menu idle artwork metadata is unavailable.');
 const order=data.order??[0,1,2,3];let duration=0;const entries=order.map((index,position)=>{const ms=Array.isArray(data.frameMs)?data.frameMs[data.frameMs.length===order.length?position:index]:data.frameMs; if(!Number.isInteger(index)||!Number.isFinite(ms)||ms<=0)throw new Error('Menu idle timing is unavailable.');const start=duration;duration+=ms;return {index,start,end:duration};});if(!entries.length)throw new Error('Menu idle has no frames.');
 for(const facing of ['right','left']){const frames=data.frames?.[facing];if(!frames?.length)throw new Error('Authored idle facing is unavailable.');for(const frame of frames){const r=frame.rect,a=frame.anchor;if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>image.width||r[1]+r[3]>image.height||!Array.isArray(a)||a.length!==2||!a.every(Number.isFinite)||frame.bodyCalibration!==undefined&&(!Number.isFinite(frame.bodyCalibration)||frame.bodyCalibration<=0))throw new Error('Menu idle pose is outside its atlas.');}if(entries.some(entry=>!frames[entry.index]))throw new Error('Menu idle order is unavailable.');}
 return {data,image,entries,duration};
}
export function menuIdleFrame(asset,elapsed,facing='right',reducedMotion=false){const time=reducedMotion?0:Math.max(0,Number.isFinite(elapsed)?elapsed:0)%asset.duration,entry=asset.entries.find(frame=>time<frame.end)??asset.entries[0];return {index:entry.index,facing,frame:asset.data.frames[facing][entry.index]};}
export function createMenuPreviewLoader({load}){const cache=new Map(),revisions=[0,0];return {async select(slot,id,apply){const revision=++revisions[slot];if(!cache.has(id))cache.set(id,Promise.resolve().then(()=>load(id)).catch(()=>null));const asset=await cache.get(id);if(revision===revisions[slot])apply(asset);return asset;},invalidate(){for(let i=0;i<revisions.length;i++)revisions[i]++;}};}
export function createMenuPreviews({baseURL,canvases,fallbacks,isActive=()=>true}){
 const selected=[null,null],assets=[null,null],contexts=canvases.map(canvas=>canvas.getContext('2d'));
 const elapsed=[0,0],last=[null,null],drawn=[-1,-1];let reducedMotion=false;
 const loader=createMenuPreviewLoader({load:async id=>{const response=await fetch(new URL(`assets/menu/${id}-idle.json`,baseURL));if(!response.ok)throw new Error('Idle metadata unavailable.');const data=await response.json();if(data.id!==id||data.file!==id+'-idle.webp')throw new Error('Idle identity is unavailable.');const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=new URL('assets/menu/'+data.file,baseURL).href;});return compileMenuIdle(data,image);}});
 function draw(slot,force=false){
  const asset=assets[slot],canvas=canvases[slot],ctx=contexts[slot];if(!asset||!ctx)return;
  const {frame,index}=menuIdleFrame(asset,elapsed[slot],slot?'left':'right',reducedMotion);if(!force&&drawn[slot]===index)return;
  const [sx,sy,w,h]=frame.rect,scale=asset.data.scale*(frame.bodyCalibration??1),offset=frame.offset??[0,0];
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(asset.image,sx,sy,w,h,canvas.width/2+(offset[0]-frame.anchor[0])*scale,asset.data.groundY+(offset[1]-frame.anchor[1])*scale,w*scale,h*scale);drawn[slot]=index;
 }
 return {
  select(slot,id){
   if(selected[slot]===id)return;selected[slot]=id;assets[slot]=null;elapsed[slot]=0;last[slot]=null;drawn[slot]=-1;canvases[slot].hidden=true;fallbacks[slot].hidden=false;
   void loader.select(slot,id,asset=>{assets[slot]=asset;if(asset&&contexts[slot]){const [width,height]=asset.data.canvasSize;canvases[slot].width=width;canvases[slot].height=height;canvases[slot].style.setProperty('--menu-canvas-width',width+'px');canvases[slot].style.setProperty('--menu-canvas-height',height+'px');canvases[slot].hidden=false;fallbacks[slot].hidden=true;draw(slot);}});
  },
  setReducedMotion(value){reducedMotion=value;last.fill(null);elapsed.fill(0);for(let slot=0;slot<2;slot++)draw(slot,true);},
  tick(now){
   if(!isActive()||reducedMotion){last.fill(null);return;}if(!Number.isFinite(now))return;
   for(let slot=0;slot<2;slot++){if(!assets[slot])continue;if(last[slot]!==null)elapsed[slot]=(elapsed[slot]+Math.max(0,now-last[slot]))%assets[slot].duration;last[slot]=now;draw(slot);}
  },
  destroy(){loader.invalidate();selected.fill(null);assets.fill(null);elapsed.fill(0);last.fill(null);drawn.fill(-1);}
 };
}