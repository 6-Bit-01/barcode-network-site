// Face bounds in the retained portrait canvas. All cards use one uniform
// face-height target; whole images are cropped, never stretched or regenerated.
export const PORTRAIT_HEAD_BOUNDS=Object.freeze({
 '6-bit':[.39,.34,.76,.68],'cache-back':[.43,.43,.79,.78],'cliff':[.55,.38,.92,.79],
 'dj-floppydisc':[.18,.38,.59,.76],'mr-nice-guy':[.47,.44,.72,.70],'ms-mayhem':[.28,.43,.58,.77],
 'stolz':[.32,.45,.71,.84],'kaveman-brown':[.30,.39,.74,.84],'dr3wbaby':[.48,.42,.79,.81],
 'ash-flowers':[.62,.28,.87,.62],'wittyf0x':[.39,.41,.91,.79],'doofnoobler':[.34,.36,.95,.84],
 'lyra':[.40,.33,.86,.85],'papa-oak':[.52,.34,.84,.76],'lost-marbles':[.55,.28,.79,.65],
 'mutilator':[.57,.40,.82,.79],'9-bit':[.34,.43,.71,.80],'bnl-01':[.27,.27,.78,.73],
});
export function portraitViewport(headBounds,width,height,{occupation=.62}={}){
 const [left,top,right,bottom]=headBounds,scale=height*occupation/(bottom-top);
 return {scale,left:width/2-(left+right)/2*scale,top:height*.60-(top+bottom)/2*scale};
}
export function createMenuPortraits({baseURL=globalThis.location?.href,fetch:fetcher=globalThis.fetch,Image:ImageClass=globalThis.Image,ResizeObserver:Observer=globalThis.ResizeObserver,devicePixelRatio=()=>globalThis.devicePixelRatio??1}={}){
 const images=new Map(),metadata=new Map(),cards=new Map();let destroyed=false;
 function loadImage(path){if(!images.has(path))images.set(path,new Promise((resolve,reject)=>{const image=new ImageClass();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('A fighter portrait could not load.'));image.src=new URL(path,baseURL).href;}));return images.get(path);}
 async function source(fighter){
  if(fighter.id==='mac-modem'){
   const path='assets/menu/mac-modem-idle.json';if(!metadata.has(path))metadata.set(path,fetcher(new URL(path,baseURL)).then(response=>{if(!response.ok)throw Error('Mac portrait registration unavailable.');return response.json();}));
   const registration=await metadata.get(path),frame=registration.frames.right[0],image=await loadImage('assets/menu/'+registration.file);
   // The complete current cap/face/beard in his own native idle key, at native
   // source resolution. Crop intersects only this frame, never adjacent cels.
   const head=frame.attachments.head,headBounds=[head[0]-16,24,head[0]+9,59];return {image,rect:frame.rect,headBounds};
  }
  const image=await loadImage(fighter.portrait),rect=[0,0,image.naturalWidth,image.naturalHeight],bounds=PORTRAIT_HEAD_BOUNDS[fighter.id]??[.2,.03,.85,.8];
  return {image,rect,headBounds:bounds.map((value,index)=>value*rect[index%2?3:2])};
 }
 function draw(canvas,value){if(destroyed||!canvas.isConnected)return;const box=canvas.getBoundingClientRect(),ratio=Math.min(2,Math.max(1,devicePixelRatio())),width=Math.max(1,Math.round(box.width*ratio)),height=Math.max(1,Math.round(box.height*ratio));canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);const view=portraitViewport(value.headBounds,width,height);ctx.drawImage(value.image,...value.rect,view.left,view.top,value.rect[2]*view.scale,value.rect[3]*view.scale);canvas.dataset.portraitReady='true';}
 const observer=Observer?new Observer(entries=>{for(const entry of entries){const value=cards.get(entry.target);if(value)draw(entry.target,value);}}):null;
 async function add(canvas,fighter){const value=await source(fighter);if(destroyed)return;cards.set(canvas,value);observer?.observe(canvas);draw(canvas,value);}
 return {add,destroy(){destroyed=true;observer?.disconnect();cards.clear();}};
}
