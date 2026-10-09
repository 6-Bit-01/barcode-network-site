const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const MARBLE_BEATS=Object.freeze({first:1200,last:3900,fall:4400,land:5050});
export function marbleVictimState(time){
 const t=Math.max(0,Number(time)||0),exposure=clamp((t-MARBLE_BEATS.first)/(MARBLE_BEATS.last-MARBLE_BEATS.first),0,1),fall=clamp((t-MARBLE_BEATS.fall)/(MARBLE_BEATS.land-MARBLE_BEATS.fall),0,1);
 return {exposure,tissue:1-exposure,pose:t>=MARBLE_BEATS.land?'lying':'standing',fall,rotation:fall*Math.PI/2};
}
export function remainsLayerPlan({height=320,progress=0,pose='standing',seed=1}={}){
 const p=clamp(Number(progress)||0,0,1),h=clamp(Number(height)||320,160,440);let state=seed>>>0;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const sites=[[.49,.10],[.51,.23],[.34,.25],[.66,.27],[.43,.35],[.57,.39],[.50,.47],[.36,.56],[.64,.56],[.33,.68],[.67,.68],[.34,.79],[.67,.81],[.19,.38],[.80,.40],[.15,.51],[.85,.51],[.44,.31],[.56,.30],[.47,.43],[.54,.52],[.40,.60],[.60,.61],[.49,.19]];
 const patches=sites.map(([x,y],i)=>({x:(x-.5)*h*.42+(random()-.5)*h*.02,y:(y-1)*h,width:h*(.065+random()*.05),height:h*(.095+random()*.08),rotation:(random()-.5)*1.5,ragged:true,source:i%2?'meat-shred':'meat-gristle',threshold:(i+.7)/sites.length})).filter(f=>p<f.threshold);
 return {pose,height:h,progress:p,patches};
}
export async function loadRemainsArt({baseURL=globalThis.location?.href,bundle,fetchImpl=globalThis.fetch,ImageCtor=globalThis.Image}={}){
 const path='assets/remains/manifest.json';let manifest=bundle?.remains;
 if(!manifest){const r=await fetchImpl(new URL(path,baseURL),{cache:'no-store'});if(!r.ok)throw Error('The shared remains artwork could not load. Retry loading.');manifest=await r.json();}
 if(manifest.anonymous!==true||!Number.isFinite(manifest.normalHeight))throw Error('The shared anatomy registration is invalid.');
 const images=Object.fromEntries(await Promise.all(Object.entries(manifest.frames).map(async([key,f])=>{
  if(!/^[a-z-]+\.webp$/.test(f.file)||!Array.isArray(f.size)||f.size.some(n=>!Number.isFinite(n)||n<=0))throw Error('A remains asset reference is invalid.');
  const file='assets/remains/'+f.file;const im=await new Promise((resolve,reject)=>{const image=new ImageCtor();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('A remains sprite could not load.'));image.src=bundle?.images?.[file]??new URL(file,baseURL).href;});
  if(im.width!==f.size[0]||im.height!==f.size[1])throw Error('A remains sprite does not match its native registration.');return [key,im];
 })));
 return {manifest,images};
}
// All poses share the source's pixel density; lying or dangling poses never
// acquire a new per-frame height. During a fall the complete standing key freezes.
const boneLayers=new WeakMap(),stageLayers=new WeakMap();
function standingStage(ctx,bank,progress){
 const names=bank.manifest.standingStages;if(!names)return null;const index=clamp(progress,0,1)*(names.length-1),low=Math.floor(index),high=Math.ceil(index),fraction=index-low;
 if(low===high)return {frame:bank.manifest.frames[names[low]],image:bank.images[names[low]]};
 const frames=names.map(n=>bank.manifest.frames[n]),density=frames[0].standingHeight,w=Math.ceil(Math.max(...frames.map(f=>f.size[0]*density/f.standingHeight))),h=density+16;let cached=stageLayers.get(bank);if(!cached){const canvas=newLayer(ctx,w,h);if(!canvas)return {frame:frames[low],image:bank.images[names[low]]};cached={canvas,key:null};stageLayers.set(bank,cached);}
 const key=Math.round(progress*80);if(cached.key!==key){const layer=cached.canvas.getContext('2d');layer.globalCompositeOperation='source-over';layer.clearRect(0,0,w,h);for(const [i,alpha]of [[low,1-fraction],[high,fraction]]){const f=frames[i];layer.globalAlpha=alpha;const scale=density/f.standingHeight;layer.drawImage(bank.images[names[i]],w/2-f.anchor[0]*scale,h-8-f.anchor[1]*scale,f.size[0]*scale,f.size[1]*scale);layer.globalCompositeOperation='lighter';}layer.globalAlpha=1;layer.globalCompositeOperation='source-over';cached.key=key;}
 return {image:cached.canvas,frame:{anchor:[w/2,h-8],standingHeight:frames[0].standingHeight,opaqueBounds:[8,8,w-8,h-8]}};
}
export function drawRemainsVictim(ctx,bank,{x,y=0,height=320,pose='standing',progress=1,fall=0,direction=1,bodyMask=null}={}){
 if(!bank)return;
 if(bodyMask&&progress<1){let canvas=boneLayers.get(bank);if(!canvas){canvas=newLayer(ctx,1280,720);if(canvas)boneLayers.set(bank,canvas);}if(canvas){const layer=canvas.getContext('2d');layer.globalCompositeOperation='source-over';layer.clearRect(0,0,1280,720);drawRemainsVictim(layer,bank,{x,y,height,pose,progress,fall,direction});layer.globalCompositeOperation='destination-in';const {image,frame,scale,view}=bodyMask,[sx,sy,w,h]=frame.rect,offset=frame.offset??[0,0];layer.drawImage(image,sx,sy,w,h,view.x+(offset[0]-frame.anchor[0])*scale,620+(view.y??0)+(offset[1]-frame.anchor[1])*scale,w*scale,h*scale);layer.globalCompositeOperation='source-over';ctx.drawImage(canvas,0,0);return;}}
 const staged=pose==='standing'?standingStage(ctx,bank,progress):null,frame=staged?.frame??bank.manifest.frames[pose],image=staged?.image??bank.images[pose];if(!frame||!image)return;
 const scale=height/(frame.standingHeight??bank.manifest.normalHeight),anchor=frame.anchor,angle=pose==='lying'?0:direction*fall*Math.PI/2;
 const b=frame.opaqueBounds??[0,0,image.width,image.height],corners=[[b[0]-anchor[0],b[1]-anchor[1]],[b[2]-anchor[0],b[1]-anchor[1]],[b[0]-anchor[0],b[3]-anchor[1]],[b[2]-anchor[0],b[3]-anchor[1]]];
 const bottom=Math.max(...corners.map(([a,b])=>(a*Math.sin(angle)+b*Math.cos(angle))*scale));
 ctx.save();ctx.translate(x-(pose==='lying'?0:direction*height*.48*fall),620+y-bottom);
 if(pose==='lying')ctx.scale(-direction,1);else if(angle)ctx.rotate(angle);
 ctx.drawImage(image,-anchor[0]*scale,-anchor[1]*scale,image.width*scale,image.height*scale);
 if(progress<1&&!staged){const bodyHeight=anchor[1]*scale;for(const patch of remainsLayerPlan({height:bodyHeight,pose,progress,seed:7}).patches){
  const tissue=bank.images[patch.source];if(!tissue)continue;
  ctx.save();ctx.translate(patch.x,patch.y);ctx.rotate(patch.rotation);const h=patch.width*tissue.height/tissue.width;ctx.drawImage(tissue,-patch.width/2,-h/2,patch.width,h);ctx.restore();}}
 ctx.restore();
}
export function drawRemainsParticle(ctx,bank,chunk){
 if(!bank||!['bone','organic'].includes(chunk.material))return false;
 const key=chunk.material==='organic'?(chunk.originX%2>1?'meat-shred':'meat-gristle'):chunk.width>=13?'skull':'splinter',image=bank.images[key];if(!image)return false;
 const height=chunk.width*image.height/image.width;ctx.drawImage(image,-chunk.width/2,-height/2,chunk.width,height);return true;
}

const revealLayers=new WeakMap();
function newLayer(ctx,w,h){const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):ctx.canvas?.ownerDocument?.createElement('canvas')??globalThis.document?.createElement?.('canvas');if(!canvas)return null;canvas.width=w;canvas.height=h;return canvas;}
// Erase the union of ragged impact wounds. Overlapping wounds never toggle
// flesh back on, and one scratch layer is reused for each source image.
export function drawRemainsReveal(ctx,image,view,{sx,sy,sw,sh,dx,dy,scale,frame}){
 const p=view.remainsState?.exposure;if(!(p>0))return false;
 let cached=revealLayers.get(image);if(!cached||cached.canvas.width!==sw||cached.canvas.height!==sh){const canvas=newLayer(ctx,sw,sh);if(!canvas)return false;cached={canvas,key:null};revealLayers.set(image,cached);}
 const key=[sx,sy,sw,sh,Math.round(p*80)].join(':');if(cached.key!==key){const layer=cached.canvas.getContext('2d');layer.globalCompositeOperation='source-over';layer.clearRect(0,0,sw,sh);layer.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);layer.globalCompositeOperation='destination-out';
 const bounds=frame.opaqueBounds??[0,0,sw,sh],w=bounds[2]-bounds[0],h=bounds[3]-bounds[1];
 for(let i=0;i<34;i++){const cx=bounds[0]+w*(.08+((i*19%37)/37)*.84),cy=bounds[1]+h*(.03+((i*13%41)/41)*.94),r=h*(.008+.10*p)*( .62+(i*7%11)/11);layer.beginPath();for(let j=0;j<13;j++){const angle=j*Math.PI*2/13,ragged=.74+((i*11+j*7)%17)/30,x=cx+Math.cos(angle)*r*ragged,y=cy+Math.sin(angle)*r*ragged;layer[j?'lineTo':'moveTo'](x,y);}layer.closePath();layer.fill();}
 layer.globalCompositeOperation='source-over';cached.key=key;}
 ctx.drawImage(cached.canvas,0,0,sw,sh,dx,dy,sw*scale,sh*scale);return true;
}
// Both separated halves use this identical ragged boundary, so their wounds
// join before release and keep their shape throughout the frozen-key fall.
export function raggedSeam({x,top,bottom,scale=1}){
 return Array.from({length:25},(_,i)=>({x:x+scale*(Math.sin(i*2.17)*8+Math.sin(i*.71)*5),y:top+(bottom-top)*i/24}));
}
