const outlines=new WeakMap();
function nativeOutline(frame,rect,mask){
 if(!mask?.alpha||mask.width!==frame.rect[2]||mask.height!==frame.rect[3])return null;
 let cache=outlines.get(frame);if(!cache){cache=new Map();outlines.set(frame,cache);}const key=rect.join(':');if(cache.has(key))return cache.get(key);
 const [x,y,w,h]=rect,points=[];for(let yy=y;yy<y+h;yy++){let left=-1,right=-1;for(let xx=x;xx<x+w;xx++)if(mask.alpha[yy*mask.width+xx]>=48){if(left<0)left=xx;right=xx;}if(left>=0){points.push([left+.5-x-w/2,yy+.5-y-h/2]);if(right!==left)points.push([right+.5-x-w/2,yy+.5-y-h/2]);}}cache.set(key,points);return points;
}
const FLOOR=620,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// Every fragment clips the same original RGBA crop at its unchanged native scale.
// The six rectangles partition the complete crop, including transparent fringes.
export function cleaverPiecePlan(frame,{contacts,scale,transform,originX,originY=FLOOR,direction=1,mask}={}){
 if(!frame?.rect||!Array.isArray(contacts)||contacts.length!==4||!Number.isFinite(scale)||scale<=0)return [];
 const w=frame.rect[2],h=frame.rect[3],offset=frame.offset??[0,0],scaleX=transform?.sx??scale,scaleY=transform?.sy??scale,sourcePoint=p=>transform?transform.inverse({x:p.x-originX,y:FLOOR+p.y-originY}):{x:(p.x-originX)/scale+frame.anchor[0]-offset[0],y:(FLOOR+p.y-originY)/scale+frame.anchor[1]-offset[1]},points=contacts.map(c=>sourcePoint(c.contact));
 const splitX=clamp(Math.round(points[3].x-direction),1,w-1),lowY=clamp(Math.floor(Math.min(points[2].y,...(contacts[2].bladeSegment?Object.values(contacts[2].bladeSegment).map(p=>sourcePoint(p).y):[]))),2,h-1),highY=clamp(Math.round(points[0].y),1,lowY-1),finalY=clamp(Math.round(points[3].y),1,lowY-1),near=direction>0?[0,splitX]:[splitX,w-splitX],far=direction>0?[splitX,w-splitX]:[0,splitX];
 const choices=[[near[0],0,near[1],highY,0],[near[0],highY,near[1],lowY-highY,1],[near[0],lowY,near[1],h-lowY,2],[far[0],lowY,far[1],h-lowY,points[3].y>=lowY?3:2],[far[0],0,far[1],finalY,3],[far[0],finalY,far[1],lowY-finalY,3]];
 return choices.map(([x,y,width,height,cut],index)=>{const p=transform?.point([x+width/2,y+height/2]),centre=p?{x:originX+p.x,y:originY+p.y}:{x:originX+(x+width/2+offset[0]-frame.anchor[0])*scale,y:originY+(y+height/2+offset[1]-frame.anchor[1])*scale};return {rect:[x,y,width,height],index,cut,at:contacts[cut].at,site:contacts[cut].site,scale,scaleX,scaleY,centre,direction,width:width*scaleX,height:height*scaleY,contact:contacts[cut].contact,outline:nativeOutline(frame,[x,y,width,height],mask)};});
}
export function cleaverPieceMotion(piece,time,{reducedMotion=false}={}){
 const elapsed=Math.max(0,time-piece.at),duration=850+piece.index*45,p=clamp(elapsed/duration,0,1),ease=p*p*(3-2*p),sign=piece.index%2?-piece.direction:piece.direction,rotation=reducedMotion||ease===0?0:sign*(.7+piece.index*.23)*ease,c=Math.cos(rotation),s=Math.sin(rotation),scaleX=piece.scaleX??piece.scale,scaleY=piece.scaleY??piece.scale,bottom=piece.outline?.length?Math.max(...piece.outline.map(([x,y])=>x*s*scaleX+y*c*scaleY))+(Math.abs(s)*scaleX+Math.abs(c)*scaleY)*.5:(Math.abs(s)*piece.width+Math.abs(c)*piece.height)/2,floorY=FLOOR-bottom;
 return {x:piece.centre.x+sign*(reducedMotion?18:75+piece.index*18)*ease,y:piece.centre.y+(floorY-piece.centre.y)*p*p-(reducedMotion?4:55+piece.index*9)*4*p*(1-p),rotation,settled:p===1};
}
export function drawNativeCleaverPieces(ctx,image,frame,pieces,time,options={}){
 const [sx,sy,w,h]=frame.rect;
 for(const piece of pieces){const motion=cleaverPieceMotion(piece,time,options),[x,y,width,height]=piece.rect,scaleX=piece.scaleX??piece.scale,scaleY=piece.scaleY??piece.scale;ctx.save();ctx.translate(motion.x,motion.y);ctx.rotate(motion.rotation);ctx.beginPath();ctx.rect(-piece.width/2,-piece.height/2,piece.width,piece.height);ctx.clip();ctx.drawImage(image,sx,sy,w,h,-(x+width/2)*scaleX,-(y+height/2)*scaleY,w*scaleX,h*scaleY);ctx.restore();}
}
